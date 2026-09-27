#!/usr/bin/env python3
"""
Catalog host check: every default URL a server calls must exist.

Walks every packages/<vertical>/<slug>/src/index.ts, pulls out each string
literal that IS a URL (the literal starts with https://), and for every host:

  1. resolves it in DNS (getaddrinfo), and
  2. opens TCP 443 and completes a TLS handshake that verifies the
     certificate against that host name.

Verdicts per host:

  ok           resolved and the handshake verified
  DEAD         NXDOMAIN / no address, or the certificate does not verify for
               this name (wrong name, expired, self-signed). These are
               properties of the host, not of the network path, so they fail
               the run.
  UNREACHABLE  resolved, but the connection or handshake timed out or was
               reset. This depends on where the check runs from (geo-fenced
               government hosts, mTLS-only bank gateways), so it is reported
               as a warning and does not fail the run.

Two carve-outs, both policed:

  - Deprecated packages (package.json `description` starting with
    "DEPRECATED"): their dead hosts are expected. A deprecated package with NO
    dead host fails, because the mark is then stale.
  - scripts/catalog-hosts-known-dead.json: (server, host, why) for a dead host
    in a package that is not deprecated. An entry whose host is alive again,
    or that the source no longer calls, fails.

Every server must also let an env var named *_URL choose its host
(NO-OVERRIDE otherwise). A literal that is an identifier rather than a host
(an OAuth audience) is skipped when its line carries the comment
`catalog-hosts: not-a-host`; those are counted and listed in the report.

The URL set is computed from the source on every run, never listed by hand.
The extractor skips comments, prose that merely mentions a URL (the literal
must start with https://), hosts built from a template expression (reported
as "templated"), and the RFC 2606 example domains.

Usage:
  python3 scripts/check-catalog-hosts.py              # check the catalog
  python3 scripts/check-catalog-hosts.py --list       # print the URL set, no network
  python3 scripts/check-catalog-hosts.py --self-test  # plant dead/live hosts in a
                                                      # temp tree and assert verdicts
  python3 scripts/check-catalog-hosts.py --root DIR   # check another packages/ tree

Exit code: 0 when there is no unexpected DEAD host, no stale carve-out and
no server without an env override; 1 otherwise.
"""
from __future__ import annotations

import argparse
import concurrent.futures as cf
import json
import re
import shutil
import socket
import ssl
import subprocess
import sys
import tempfile
import time
from dataclasses import dataclass, field
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TIMEOUT_S = 10.0
RETRIES = 3
RETRY_SLEEP_S = 2.0
EXAMPLE_HOST_RE = re.compile(r"(^|\.)example\.(com|net|org)$")
# A URL literal that is an identifier, not a host the server connects to
# (an OAuth `audience`, a JSON-schema id). Put this comment on the literal's line.
NOT_A_HOST_MARK = "catalog-hosts: not-a-host"
KNOWN_DEAD_FILE = "catalog-hosts-known-dead.json"
DEPRECATED_PREFIX = "DEPRECATED"


# --------------------------------------------------------------------------
# Extraction
# --------------------------------------------------------------------------

@dataclass
class UrlRef:
    server: str      # e.g. payments/celcoin
    line: int
    url: str
    host: str        # "" when templated


def _lex_strings(src: str) -> list[tuple[int, str]]:
    """Return (offset, content) for every string literal in a TS source,
    skipping comments. Template literals are returned with their static text
    and `${...}` kept verbatim; string literals nested inside a `${...}`
    expression are returned too (that is where an env override's default
    lives: `${process.env.X_BASE_URL || "https://..."}`)."""
    out: list[tuple[int, str]] = []
    i, n = 0, len(src)

    def lex_expr(i: int, stop_at_brace: bool) -> int:
        depth = 0
        while i < n:
            c = src[i]
            nxt = src[i + 1] if i + 1 < n else ""
            if c == "/" and nxt == "/":
                j = src.find("\n", i)
                i = n if j < 0 else j
                continue
            if c == "/" and nxt == "*":
                j = src.find("*/", i + 2)
                i = n if j < 0 else j + 2
                continue
            if c in ("'", '"'):
                start = i
                i += 1
                buf = []
                while i < n and src[i] != c:
                    if src[i] == "\\":
                        buf.append(src[i:i + 2])
                        i += 2
                        continue
                    if src[i] == "\n":
                        break
                    buf.append(src[i])
                    i += 1
                out.append((start, "".join(buf)))
                i += 1
                continue
            if c == "`":
                i = lex_template(i)
                continue
            if stop_at_brace:
                if c == "{":
                    depth += 1
                elif c == "}":
                    if depth == 0:
                        return i + 1
                    depth -= 1
            i += 1
        return i

    def lex_template(i: int) -> int:
        start = i
        i += 1
        buf = []
        while i < n and src[i] != "`":
            if src[i] == "\\":
                buf.append(src[i:i + 2])
                i += 2
                continue
            if src[i] == "$" and i + 1 < n and src[i + 1] == "{":
                j = lex_expr(i + 2, stop_at_brace=True)
                buf.append(src[i:j])
                i = j
                continue
            buf.append(src[i])
            i += 1
        out.append((start, "".join(buf)))
        return i + 1

    lex_expr(0, stop_at_brace=False)
    return out


def _host_of(url: str) -> str | None:
    """Host of a URL literal; "" when the host is built from a template
    expression; None when there is no host at all (e.g. a bare "https://"
    prefix used in a startsWith check)."""
    rest = url[len("https://"):]
    m = re.match(r"[^/?#]*", rest)
    host = m.group(0) if m else ""
    if "${" in host:
        return ""
    host = host.split("@")[-1].lower()
    if host.endswith(":443"):
        host = host[:-4]
    return host or None


def discover(packages_dir: Path) -> list[Path]:
    return sorted(
        d for d in packages_dir.glob("*/*")
        if (d / "src" / "index.ts").exists() and "node_modules" not in d.parts
    )


def extract(pkg_dir: Path) -> list[UrlRef]:
    server = f"{pkg_dir.parent.name}/{pkg_dir.name}"
    src = (pkg_dir / "src" / "index.ts").read_text(encoding="utf-8")
    lines = src.split("\n")
    refs: list[UrlRef] = []
    for off, content in _lex_strings(src):
        if not content.startswith("https://"):
            continue
        host = _host_of(content)
        if host is None:
            continue
        if host and EXAMPLE_HOST_RE.search(host):
            continue
        line = src.count("\n", 0, off) + 1
        ref = UrlRef(server, line, content, host)
        if NOT_A_HOST_MARK in lines[line - 1]:
            _NOT_A_HOST.append(ref)
            continue
        refs.append(ref)
    return refs


_NOT_A_HOST: list[UrlRef] = []


ENV_URL_RE = re.compile(r"process\.env\.[A-Z0-9_]+_URL\b")


def reads_env_url(pkg_dir: Path) -> bool:
    """True when the server lets an env var named *_URL pick the host (the
    catalog convention is <PREFIX>_BASE_URL, plus <PREFIX>_<ROLE>_URL for a
    second host such as the token endpoint)."""
    src = (pkg_dir / "src" / "index.ts").read_text(encoding="utf-8")
    return bool(ENV_URL_RE.search(src))


def is_deprecated(pkg_dir: Path) -> bool:
    try:
        pkg = json.loads((pkg_dir / "package.json").read_text(encoding="utf-8"))
    except Exception:
        return False
    return str(pkg.get("description", "")).startswith(DEPRECATED_PREFIX)


# --------------------------------------------------------------------------
# Probing
# --------------------------------------------------------------------------

@dataclass
class Probe:
    host: str
    verdict: str   # ok | DEAD | UNREACHABLE
    detail: str


def probe(host: str) -> Probe:
    """`host` may carry a port (demo.stpmex.com:7024); 443 otherwise."""
    name, _, port_s = host.partition(":")
    port = int(port_s) if port_s else 443
    infos = None
    for attempt in range(RETRIES):
        try:
            infos = socket.getaddrinfo(name, port, type=socket.SOCK_STREAM)
            break
        except socket.gaierror as e:
            # EAI_AGAIN is the resolver failing, not the name: retry, and if
            # it persists call it UNREACHABLE rather than DEAD.
            if e.errno == socket.EAI_AGAIN:
                if attempt + 1 < RETRIES:
                    time.sleep(RETRY_SLEEP_S)
                    continue
                return Probe(host, "UNREACHABLE", f"dns: temporary failure: {e.strerror or e}")
            return Probe(host, "DEAD", f"dns: {e.strerror or e}")
    if not infos:
        return Probe(host, "DEAD", "dns: no address")

    ctx = ssl.create_default_context()
    last = ""
    for _ in range(RETRIES):
        try:
            with socket.create_connection((name, port), timeout=TIMEOUT_S) as sock:
                with ctx.wrap_socket(sock, server_hostname=name) as tls:
                    return Probe(host, "ok", f"{tls.version()}")
        except ssl.SSLCertVerificationError as e:
            return Probe(host, "DEAD", f"tls: {e.verify_message or e.reason}")
        except (ssl.SSLError, OSError) as e:
            last = f"{type(e).__name__}: {e}"
            time.sleep(RETRY_SLEEP_S)
    return Probe(host, "UNREACHABLE", last)


# --------------------------------------------------------------------------
# Run
# --------------------------------------------------------------------------

@dataclass
class Report:
    servers: int = 0
    refs: list[UrlRef] = field(default_factory=list)
    templated: list[UrlRef] = field(default_factory=list)
    probes: dict[str, Probe] = field(default_factory=dict)
    deprecated: set[str] = field(default_factory=set)
    no_override: list[str] = field(default_factory=list)
    failures: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    expected_dead: list[str] = field(default_factory=list)
    not_a_host: list[UrlRef] = field(default_factory=list)
    known_dead: dict[tuple[str, str], str] = field(default_factory=dict)


def load_known_dead(path: Path) -> dict[tuple[str, str], str]:
    """(server, host) -> reason. Hosts that are dead today in a package that is
    NOT deprecated, each waiting on a decision (see the file's `why`)."""
    if not path.exists():
        return {}
    data = json.loads(path.read_text(encoding="utf-8"))
    return {(e["server"], e["host"]): e["why"] for e in data["hosts"]}


def collect(packages_dir: Path, known_dead_path: Path | None = None) -> Report:
    rep = Report()
    if known_dead_path is None:
        known_dead_path = packages_dir.parent / "scripts" / KNOWN_DEAD_FILE
    rep.known_dead = load_known_dead(known_dead_path)
    _NOT_A_HOST.clear()
    for d in discover(packages_dir):
        rep.servers += 1
        if is_deprecated(d):
            rep.deprecated.add(f"{d.parent.name}/{d.name}")
        refs = extract(d)
        for r in refs:
            (rep.refs if r.host else rep.templated).append(r)
        if refs and not reads_env_url(d):
            rep.no_override.append(f"{d.parent.name}/{d.name}")
    rep.not_a_host = list(_NOT_A_HOST)
    return rep


def override_failures(rep: Report) -> list[str]:
    return [
        f"NO-OVERRIDE {s}: calls a default URL but reads no process.env.*_URL, "
        f"so a user cannot point it at another host (convention: <PREFIX>_BASE_URL)"
        for s in rep.no_override
    ]


def run(packages_dir: Path, workers: int = 24, quiet: bool = False,
        known_dead_path: Path | None = None) -> Report:
    rep = collect(packages_dir, known_dead_path)
    hosts = sorted({r.host for r in rep.refs})
    with cf.ThreadPoolExecutor(max_workers=workers) as ex:
        for p in ex.map(probe, hosts):
            rep.probes[p.host] = p

    by_server: dict[str, list[UrlRef]] = {}
    for r in rep.refs:
        by_server.setdefault(r.server, []).append(r)

    for server in sorted(by_server):
        seen: set[str] = set()
        dead_here = 0
        for r in by_server[server]:
            if r.host in seen:
                continue
            seen.add(r.host)
            p = rep.probes[r.host]
            where = f"{server} (src/index.ts:{r.line}) {r.host}"
            listed = (server, r.host) in rep.known_dead
            if p.verdict == "DEAD":
                dead_here += 1
                if server in rep.deprecated:
                    rep.expected_dead.append(f"{where}: {p.detail}")
                elif listed:
                    rep.expected_dead.append(f"{where}: {p.detail} [known-dead: {rep.known_dead[(server, r.host)]}]")
                else:
                    rep.failures.append(f"DEAD {where}: {p.detail}")
            else:
                if listed:
                    rep.failures.append(
                        f"STALE-KNOWN-DEAD {where}: listed in {KNOWN_DEAD_FILE} but it is "
                        f"{p.verdict} now; remove the entry")
                if p.verdict == "UNREACHABLE":
                    rep.warnings.append(f"UNREACHABLE {where}: {p.detail}")
        if server in rep.deprecated and dead_here == 0:
            rep.failures.append(
                f"STALE-DEPRECATION {server}: package.json says DEPRECATED but every "
                f"host it calls resolved and verified; re-check the provider and "
                f"remove the mark (or record why it stays)"
            )
    rep.failures.extend(override_failures(rep))
    present = {(r.server, r.host) for r in rep.refs}
    for server, host in sorted(set(rep.known_dead) - present):
        rep.failures.append(
            f"STALE-KNOWN-DEAD {server} {host}: listed in {KNOWN_DEAD_FILE} but the "
            f"source no longer calls it; remove the entry")
    for server in sorted(rep.deprecated - set(by_server)):
        rep.failures.append(
            f"STALE-DEPRECATION {server}: marked DEPRECATED but no URL was extracted "
            f"from its source, so the mark cannot be checked"
        )

    if not quiet:
        print_report(rep)
    return rep


def print_report(rep: Report) -> None:
    hosts = rep.probes
    ok = sum(1 for p in hosts.values() if p.verdict == "ok")
    dead = sum(1 for p in hosts.values() if p.verdict == "DEAD")
    unr = sum(1 for p in hosts.values() if p.verdict == "UNREACHABLE")
    print(f"servers scanned:        {rep.servers}")
    print(f"URL literals extracted: {len(rep.refs)} (+{len(rep.templated)} with a templated host, not probed)")
    print(f"unique hosts probed:    {len(hosts)}  ok={ok} dead={dead} unreachable={unr}")
    print(f"deprecated packages:    {len(rep.deprecated)}")
    print(f"servers without a *_URL env override: {len(rep.no_override)}")
    print(f"known-dead entries:     {len(rep.known_dead)}")
    print(f"not-a-host literals:    {len(rep.not_a_host)}")
    for r in rep.not_a_host:
        print(f"  {r.server} (src/index.ts:{r.line}) {r.url}")
    if rep.templated:
        print("\ntemplated hosts (built at runtime, cannot be probed):")
        for r in rep.templated:
            print(f"  {r.server} (src/index.ts:{r.line}) {r.url}")
    if rep.expected_dead:
        print("\ndead hosts in DEPRECATED packages or listed as known-dead (expected):")
        for s in rep.expected_dead:
            print(f"  {s}")
    if rep.warnings:
        print("\nwarnings (network-path dependent, do not fail the run):")
        for s in rep.warnings:
            print(f"  {s}")
            print(f"::warning::{s}")
    if rep.failures:
        print("\nFAILURES:")
        for s in rep.failures:
            print(f"  {s}")
            print(f"::error::{s}")
    else:
        print("\nno unexpected dead host")


# --------------------------------------------------------------------------
# Self-test: plant hosts in a throwaway tree and assert each verdict by name
# --------------------------------------------------------------------------

LIVE_CONTROL = "registry.npmjs.org"          # must resolve and verify from CI
DEAD_PLANT = "codespar-selftest-dead-host.invalid"   # RFC 6761: never resolves
TLS_PLANT = "wrong.host.badssl.com"          # resolves, cert is for another name
TLS_CONTROL = "badssl.com"                   # same operator, valid cert


def _plant(root: Path, server: str, body: str, deprecated: bool = False) -> None:
    d = root / "packages" / server
    (d / "src").mkdir(parents=True, exist_ok=True)
    (d / "src" / "index.ts").write_text(body, encoding="utf-8")
    desc = f"{DEPRECATED_PREFIX}: selftest" if deprecated else "selftest"
    (d / "package.json").write_text(json.dumps({"name": server, "description": desc}), encoding="utf-8")


def self_test() -> int:
    failures: list[str] = []

    def expect(cond: bool, msg: str) -> None:
        print(("  pass  " if cond else "  FAIL  ") + msg)
        if not cond:
            failures.append(msg)

    tmp = Path(tempfile.mkdtemp(prefix="catalog-hosts-selftest-"))
    try:
        # Extractor sensitivity: the default inside an env override, inside a
        # template expression and in a ternary must be found; a URL in a
        # comment, in prose, or on an example domain must not.
        _plant(tmp, "live/control", f"""
            // https://{DEAD_PLANT}/in-a-comment must be ignored
            /* https://{DEAD_PLANT}/in-a-block-comment too */
            const DOC = "see https://{DEAD_PLANT}/docs in prose";
            const EX = "https://api.example.com/v1";
            const BASE_URL = process.env.LIVE_BASE_URL || "https://{LIVE_CONTROL}/v1";
            const T = `${{process.env.LIVE_OTHER_URL || "https://{LIVE_CONTROL}"}}/x/${{ID}}`;
            const TPL = `https://${{SHOP}}.myshopify.com/admin`;
        """)
        rep = collect(tmp / "packages")
        hosts = sorted({r.host for r in rep.refs})
        expect(hosts == [LIVE_CONTROL], f"extractor finds only the live control host (got {hosts})")
        expect(len(rep.refs) == 2, f"both env-override defaults extracted (got {len(rep.refs)})")
        expect(len(rep.templated) == 1, f"templated host reported, not probed (got {len(rep.templated)})")

        # Positive control first: a tree with only the live host passes. If it
        # does not, the network is the problem and nothing below is evidence.
        rep = run(tmp / "packages", quiet=True)
        expect(rep.probes.get(LIVE_CONTROL, Probe("", "", "")).verdict == "ok",
               f"live control {LIVE_CONTROL} probes ok ({rep.probes.get(LIVE_CONTROL)})")
        expect(not rep.failures, f"tree with only live hosts passes (failures: {rep.failures})")
        if failures:
            print("positive control failed: the probe cannot reach the internet; aborting")
            return 1

        # Planted dead host in a normal package: must fail, naming it.
        _plant(tmp, "dead/planted", f'const BASE_URL = process.env.X_BASE_URL ?? "https://{DEAD_PLANT}/v1";\n')
        rep = run(tmp / "packages", quiet=True)
        named = [f for f in rep.failures if DEAD_PLANT in f and "dead/planted" in f]
        expect(len(named) == 1, f"planted dead host fails and is named (failures: {rep.failures})")
        expect(all("live/control" not in f for f in rep.failures), "live package is not blamed")

        # Certificate for another name: DEAD, with its same-operator control ok.
        _plant(tmp, "tls/planted", f'const A = process.env.A_BASE_URL || "https://{TLS_CONTROL}";\n'
                                   f'const B = process.env.B_BASE_URL || "https://{TLS_PLANT}";\n')
        rep = run(tmp / "packages", quiet=True)
        ctl = rep.probes.get(TLS_CONTROL)
        expect(ctl is not None and ctl.verdict == "ok", f"TLS control {TLS_CONTROL} ok ({ctl})")
        expect(any(TLS_PLANT in f and f.startswith("DEAD") for f in rep.failures),
               f"certificate name mismatch is DEAD ({rep.probes.get(TLS_PLANT)})")
        shutil.rmtree(tmp / "packages" / "tls")

        # Carve-out: the same dead host in a DEPRECATED package does not fail...
        shutil.rmtree(tmp / "packages" / "dead")
        _plant(tmp, "dead/deprecated", f'const BASE_URL = process.env.X_BASE_URL || "https://{DEAD_PLANT}/v1";\n', deprecated=True)
        rep = run(tmp / "packages", quiet=True)
        expect(not rep.failures, f"dead host in a DEPRECATED package does not fail (failures: {rep.failures})")
        expect(any(DEAD_PLANT in s for s in rep.expected_dead), "and is still listed as expected-dead")

        # ...and the carve-out polices itself: DEPRECATED with only live hosts fails.
        _plant(tmp, "stale/deprecated", f'const BASE_URL = process.env.X_BASE_URL || "https://{LIVE_CONTROL}";\n', deprecated=True)
        rep = run(tmp / "packages", quiet=True)
        expect(any("STALE-DEPRECATION stale/deprecated" in f for f in rep.failures),
               f"DEPRECATED package whose hosts are all live fails (failures: {rep.failures})")
        expect(all("dead/deprecated" not in f for f in rep.failures), "the honest deprecation is not blamed")

        # Known-dead list: a listed dead host in a normal package does not fail,
        # a listed host that is live fails as stale, and an unlisted twin fails.
        shutil.rmtree(tmp / "packages" / "dead")
        shutil.rmtree(tmp / "packages" / "stale")
        kd = tmp / "scripts" / KNOWN_DEAD_FILE
        kd.parent.mkdir(parents=True, exist_ok=True)
        _plant(tmp, "kd/listed", f'const BASE_URL = process.env.K_BASE_URL || "https://{DEAD_PLANT}/v1";\n')
        kd.write_text(json.dumps({"hosts": [{"server": "kd/listed", "host": DEAD_PLANT, "why": "selftest"}]}))
        rep = run(tmp / "packages", quiet=True)
        expect(not rep.failures, f"listed known-dead host does not fail (failures: {rep.failures})")
        kd.write_text(json.dumps({"hosts": [{"server": "kd/listed", "host": DEAD_PLANT, "why": "selftest"},
                                            {"server": "live/control", "host": LIVE_CONTROL, "why": "selftest"}]}))
        rep = run(tmp / "packages", quiet=True)
        expect([f.split(" (")[0] for f in rep.failures] == ["STALE-KNOWN-DEAD live/control"],
               f"known-dead entry for a live host fails as stale, naming it (failures: {rep.failures})")
        kd.unlink()
        rep = run(tmp / "packages", quiet=True)
        expect(any(f.startswith("DEAD kd/listed") for f in rep.failures),
               f"the same host without the entry fails (failures: {rep.failures})")
        shutil.rmtree(tmp / "packages" / "kd")

        # not-a-host marker: the marked literal is skipped, an unmarked twin is not.
        _plant(tmp, "aud/marked",
               f'const BASE_URL = process.env.M_BASE_URL || "https://{LIVE_CONTROL}";\n'
               f'const AUD = "https://{DEAD_PLANT}"; // {NOT_A_HOST_MARK}\n')
        rep = run(tmp / "packages", quiet=True)
        expect(not rep.failures and len(rep.not_a_host) == 1,
               f"marked audience literal is skipped and counted (failures: {rep.failures}, marked: {len(rep.not_a_host)})")
        shutil.rmtree(tmp / "packages" / "aud")
        _plant(tmp, "stale/deprecated", f'const BASE_URL = process.env.X_BASE_URL || "https://{LIVE_CONTROL}";\n', deprecated=True)

        # Override rule: a live host hardcoded with no *_URL env read fails,
        # naming the package; its twin with the env read (live/control) passes.
        shutil.rmtree(tmp / "packages" / "stale")
        _plant(tmp, "hard/coded", f'const BASE_URL = "https://{LIVE_CONTROL}/v1";\n')
        rep = run(tmp / "packages", quiet=True)
        expect([f.split(":")[0] for f in rep.failures] == ["NO-OVERRIDE hard/coded"],
               f"hardcoded URL without env override fails, and only that package (failures: {rep.failures})")
        shutil.rmtree(tmp / "packages" / "hard")

        # End to end through the CLI: exit code 1 and the host named on stdout.
        _plant(tmp, "dead/planted", f'const BASE_URL = process.env.X_BASE_URL || "https://{DEAD_PLANT}/v1";\n')
        proc = subprocess.run(
            [sys.executable, __file__, "--root", str(tmp / "packages")],
            capture_output=True, text=True,
        )
        expect(proc.returncode == 1 and f"DEAD dead/planted" in proc.stdout and DEAD_PLANT in proc.stdout,
               f"CLI exits 1 and names the planted host (exit {proc.returncode})")
    finally:
        shutil.rmtree(tmp, ignore_errors=True)

    print(f"\nself-test: {'FAILED' if failures else 'passed'} ({len(failures)} failure(s))")
    return 1 if failures else 0


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--root", type=Path, default=ROOT / "packages", help="packages/ directory to scan")
    ap.add_argument("--list", action="store_true", help="print the extracted URL set and exit (no network)")
    ap.add_argument("--self-test", action="store_true", help="run the planted-host self-test")
    args = ap.parse_args()

    if args.self_test:
        return self_test()
    if args.list:
        rep = collect(args.root)
        for r in rep.refs + rep.templated:
            dep = "  [DEPRECATED]" if r.server in rep.deprecated else ""
            print(f"{r.server}\t{r.line}\t{r.host or '(templated)'}\t{r.url}{dep}")
        print(f"# servers={rep.servers} literals={len(rep.refs)} templated={len(rep.templated)} "
              f"hosts={len({r.host for r in rep.refs})}", file=sys.stderr)
        return 0
    rep = run(args.root)
    return 1 if rep.failures else 0


if __name__ == "__main__":
    sys.exit(main())
