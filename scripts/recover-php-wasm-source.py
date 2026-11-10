#!/usr/bin/env python3
"""Recover the historical PHP-WASM fork if a byte-identical archive exists.

Otherwise pin and verify a GPLv2-capable ancestral source. Never treat its
different C ABI as a drop-in replacement for the deleted JoomEngine fork.
"""
import argparse
import hashlib
import json
import shutil
import tarfile
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
LEGACY_NAME = "joomengine--php-wasm-3b8cef42c020fbcbb6b41fad86716b7c8664b55b.tar.gz"
LEGACY_SHA = "d30679568282f94ede723c5313ba2664380ede421cfb27693dcc9bc9fe9a533c"
FALLBACK_NAME = "seanmorris--php-wasm-1e1fb6703730759181e84c62bce35ee9129febb9.tar.gz"
FALLBACK_SHA = "dfe4d54bf3a66a0a7b564904d06cf49327b74b3545965c9e18bd0ea83fc67421"

DRIVER_RECEIPT = ROOT / "engine/fusion/receipts/native-runtime/driver-adapter.json"


def pinned_native_runner_sha() -> str:
    records = json.loads(DRIVER_RECEIPT.read_text())
    found = [row["originalSha256"] for row in records if row.get("generated") == "runtime.c"]
    if len(found) != 1:
        raise ValueError("Native runner historical source pin missing")
    return found[0]



def checksum(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def public_path(path: Path) -> str:
    """Do not put machine-specific absolute paths in public provenance reports."""
    try:
        return path.resolve().relative_to(ROOT.resolve()).as_posix()
    except ValueError:
        return "external:" + path.name


def inspect_candidates(paths: list[Path]) -> tuple[list[str], list[dict], Path | None]:
    scanned = []
    observations = []
    found = None
    runner_sha = pinned_native_runner_sha()
    for directory in paths:
        if not directory.is_dir():
            continue
        scanned.append(public_path(directory))
        for item in sorted(directory.rglob("*")):
            if not item.is_file() or item.stat().st_size > 350_000_000:
                continue
            if item.name == "runtime.c" and item.stat().st_size < 1_000_000:
                digest = checksum(item)
                if digest == runner_sha:
                    observations.append({"location": public_path(item), "kind": "exact-native-runner-c", "sha256": digest, "exact": True})
            if item.name == LEGACY_NAME:
                digest = checksum(item)
                observations.append({"location": public_path(item), "kind": "original-archive", "sha256": digest, "exact": digest == LEGACY_SHA})
                if digest == LEGACY_SHA:
                    found = item
                continue
            if item.suffix.lower() == ".zip" and (("alwis" in item.name.lower()) or ("php" in item.name.lower()) or ("backup" in item.name.lower())):
                try:
                    with zipfile.ZipFile(item) as z:
                        hits = [name for name in z.namelist() if name.endswith("native/runtime.c") or LEGACY_NAME in name]
                        if hits:
                            matches = []
                            for name in hits[:15]:
                                member = z.getinfo(name)
                                if member.file_size > 1_000_000 or not name.endswith("native/runtime.c"):
                                    continue
                                blob = z.read(name)
                                if hashlib.sha256(blob).hexdigest() == runner_sha:
                                    matches.append(name)
                            observations.append({"location": public_path(item), "kind": "possible-source-inside-zip", "members": hits[:15], "exactNativeRunnerMembers": matches, "exact": False})
                except (OSError, zipfile.BadZipFile):
                    pass
    return scanned, observations, found


def fallback_manifest():
    """Pinned, source-independent ABI information (does not certify source availability)."""
    return {
            "repository": "seanmorris/php-wasm",
            "revision": "1e1fb6703730759181e84c62bce35ee9129febb9",
            "archive": FALLBACK_NAME,
            "archiveSha256": FALLBACK_SHA,
            "licenseOptionForCoveredCode": "GPL-2.0-only",
            "notice": "LICENSES/seanmorris-php-wasm-NOTICE.txt",
            "nativeCSource": "source/pib/pib.c",
            "originalAPI": ["pib_init", "pib_run"],
            "alwisRequiredAPI": ["php_wasm_run", "php_wasm_exit_code", "php_wasm_abi_version", "php_wasm_version", "php_wasm_add_server_variable", "php_wasm_setenv"],
            "dropInCompatible": False,
            "portNeeded": "Independent ALWIS SAPI/HTTP shim and checked Emscripten fiber adaptations for PHP 8.4.27; must pass native and browser tests.",
    }



def audit(search: list[Path], copy_exact: bool = False):
    scanned, observations, found = inspect_candidates(search)
    if found and copy_exact:
        dest = ROOT / "sources" / LEGACY_NAME
        if found.resolve() != dest.resolve():
            dest.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(found, dest)
        if checksum(dest) != LEGACY_SHA:
            raise SystemExit("Exact backup checksum changed during recovery")
    fallback = ROOT / "sources" / FALLBACK_NAME
    if not fallback.is_file() or checksum(fallback) != FALLBACK_SHA:
        raise SystemExit("Pinned Sean Morris GPLv2-compatible source archive is unavailable or corrupted")
    repo = ROOT / "upstream" / "seanmorris--php-wasm"
    runner = repo / "source/pib/pib.c"
    notice = repo / "NOTICE"
    if not runner.is_file() or not notice.is_file() or not all(token in runner.read_text() for token in ("pib_run", "pib_init")):
        raise SystemExit("Fallback PHP-WASM implementation cannot be verified")
    if "Dual licensed" not in notice.read_text() or "General Public License" not in notice.read_text():
        raise SystemExit("Fallback dual-license notice changed")
    return {
        "schemaVersion": 1,
        "historicalSource": {
            "repository": "joomengine/php-wasm",
            "revision": "3b8cef42c020fbcbb6b41fad86716b7c8664b55b",
            "archive": LEGACY_NAME,
            "archiveSha256": LEGACY_SHA,
            "exactArchiveRecovered": bool(found),
            "exactNativeRunnerRecovered": any(item.get("kind") == "exact-native-runner-c" or item.get("exactNativeRunnerMembers") for item in observations),
            "expectedNativeRunnerSha256": pinned_native_runner_sha(),
            "requiredForLegacyNativeWrapper": True,
        },
        "search": {"directoriesAccessible": scanned, "candidates": observations, "note": "CloudPanel/private directories and downloads on the user's PC are not readable with current SSH permissions."},
        "fallback": fallback_manifest(),
        "status": "exact-backup-recovered" if found else "fallback-source-verified-adapter-required",
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--search", type=Path, action="append", default=[])
    parser.add_argument("--restore-exact", action="store_true", help="Copy only a backup with the exact locked archive SHA-256")
    parser.add_argument("--output", type=Path, default=ROOT / "provenance/php-wasm-source-recovery.json")
    args = parser.parse_args()
    directories = args.search or [
        ROOT / "sources", ROOT / "build-work/source-archives",
        ROOT.parent / "archives", ROOT.parent / "ALWIS-collab4-review",
        ROOT.parent / "alwis-collab4-staging", ROOT.parent,
    ]
    result = audit(directories, copy_exact=args.restore_exact)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, indent=2, ensure_ascii=False) + "\n")
    print(json.dumps({"status": result["status"], "scanLocations": len(result["search"]["directoriesAccessible"]), "exactBackup": result["historicalSource"]["exactArchiveRecovered"], "alternative": result["fallback"]["repository"]}))
