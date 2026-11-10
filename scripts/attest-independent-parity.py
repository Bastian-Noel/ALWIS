#!/usr/bin/env python3
"""Attest browser parity to the actual independent WASM, never license approval.

This is a technical CI receipt, not a native distribution artifact. Refuse
mismatched hashes, incomplete cases and the historical GPLv2/Apache binary.
"""
import argparse
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
LEGACY_SHA = "80df46b7b308b33475fde138eb1a295c01ffbf6ac685d17a74209eb224674e0f"
EXPECTED = (
    ("environment", "environment"), ("get", "get"), ("post", "post"),
    ("binary", "binary"), ("headers", "headers"), ("redirect", "redirect"),
    ("cookie", "cookie-issued"), ("cookie", "cookie-returned"),
    ("session", "session-new"), ("session", "session-resume"),
    ("session", "session-other"), ("file-write", "file-write"),
    ("file-read", "file-read"), ("pdo", "pdo"), ("mysqli", "mysqli"),
    ("sql-cleanup", "sql-cleanup"), ("error", "error"),
)


def checksum(path):
    h = hashlib.sha256()
    with path.open("rb") as file:
        for chunk in iter(lambda: file.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def attest(build_file, parity_dir, runtime_dist):
    build_file, parity_dir, runtime_dist = map(Path, (build_file, parity_dir, runtime_dist))
    raw = json.loads(build_file.read_text())
    if raw.get("status") not in ("compiled-candidate", "browser-parity-verified") or raw.get("releaseApproved") is not False:
        raise ValueError("Native candidate state is not independently compiled and distribution-blocked")
    wasm = runtime_dist / "pbl-runtime.wasm"
    js = runtime_dist / "pbl-runtime.mjs"
    sha = checksum(wasm)
    if sha == LEGACY_SHA or sha != raw.get("wasmSha256") or wasm.stat().st_size != raw.get("bytes"):
        raise ValueError("Actual compiled WASM missing, historical, or does not match build receipt")
    js_sha = checksum(js)
    receipts = []
    for browser in ("chromium", "firefox"):
        file = parity_dir / f"independent-candidate-{browser}.json"
        record = json.loads(file.read_text())
        if (record.get("schemaVersion") != 1 or record.get("passed") is not True
                or record.get("browser") != browser or record.get("label") != "independent-candidate"
                or not record.get("browserVersion")
                or record.get("wasmSha256") != sha or record.get("nativeJsSha256") != js_sha
                or record.get("wasmBytes") != wasm.stat().st_size
                or record.get("error")):
            raise ValueError("Native browser parity receipt is missing, failed, or stale: " + browser)
        if [(x.get("case"), x.get("step")) for x in record.get("cases", [])] != list(EXPECTED):
            raise ValueError("Incomplete or reordered PHP/HTTP/PDO/MySQLi browser parity: " + browser)
        if record.get("state", {}).get("sqlConnections") != 0 or record.get("state", {}).get("nativeStatements") != 0:
            raise ValueError("PHP/SQL native worker left connections or statements open: " + browser)
        if record["cases"][-1]["case"] != "error" or (record["cases"][-1].get("exitCode", 0) == 0 and record["cases"][-1].get("status", 0) < 500):
            raise ValueError("Expected PHP exception not detected by parity: " + browser)
        receipts.append({"browser": browser, "sha256": checksum(file), "cases": len(EXPECTED),
                         "nativeJsSha256": js_sha, "wasmSha256": sha})
    result = {**raw, "status": "browser-parity-verified", "browserValidated": True,
              "parity": receipts, "releaseApproved": False}
    # Commit only after every check passes, never publish binary via this script.
    temporary = build_file.with_name(build_file.name + ".verified.tmp")
    temporary.write_text(json.dumps(result, indent=2) + "\n")
    temporary.replace(build_file)
    return result


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--build-file", type=Path, default=ROOT / "build-work/independent-native-build.json")
    ap.add_argument("--parity-dir", type=Path, default=ROOT / "build-work/parity")
    ap.add_argument("--runtime-dist", type=Path,
                    default=ROOT / "build-work/bridge/.native-build/engine/wasm/runtime-dist")
    args = ap.parse_args()
    result = attest(args.build_file, args.parity_dir, args.runtime_dist)
    print(json.dumps({"status": result["status"], "wasmSha256": result["wasmSha256"],
                      "browsers": [item["browser"] for item in result["parity"]],
                      "casesPerBrowser": len(EXPECTED), "releaseApproved": False}, indent=2))


if __name__ == "__main__":
    main()
