#!/usr/bin/env python3
"""Inventory native provenance and missing build inputs; never grant release rights."""
import argparse
import hashlib
import json
import shutil
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REPO_BY_ROLE = {
    "MariaDB source": ("shyim/lite4mariadb", "GPL-2.0-only"),
    "PHP fork / native runner": ("joomengine/php-wasm", "Unverified fork modifications; preserve original NOTICE"),
    "PHP interpreter original": ("php/php-src", "BSD-3-Clause via PHP License v4, per-file exceptions"),
    "Sean Morris PHP WASM reference": ("seanmorris/php-wasm", "GPL-2.0-only OR Apache-2.0 (GPLv2 choice for covered sources)"),
}


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def audit():
    upstream = {x["repo"]: x for x in json.loads((ROOT / "provenance/upstream-lock.json").read_text())["repositories"]}
    submodules = json.loads((ROOT / "provenance/submodules-lock.json").read_text())["gitlinks"]
    native = json.loads((ROOT / "config/native-runtime.json").read_text())
    receipt = ROOT / "build-work/independent-native-adapter.json"
    output = []
    for role, (repo, license_name) in REPO_BY_ROLE.items():
        record = upstream[repo]
        candidates = [
            ROOT / record["archive"],
            ROOT / "build-work/source-archives" / Path(record["archive"]).name,
        ]
        found = next((p for p in candidates if p.is_file()), None)
        actual = sha(found.read_bytes()) if found else None
        output.append({
            "role": role,
            "repository": repo,
            "commit": record["sha"],
            "license": license_name,
            "archive": record["archive"],
            "expectedSha256": record["archive_sha256"],
            "localArchive": str(found.relative_to(ROOT)) if found else None,
            "sourceArchiveVerified": actual == record["archive_sha256"] if actual else False,
        })
    lib_entries = {
        "libmariadb": "LGPL-2.1-or-later (file-level exceptions to review)",
        "extra/wolfssl/wolfssl": "GPL-2.0-only option under exact wolfSSL MariaDB exception",
    }
    for item in submodules:
        if item["path"] in lib_entries:
            output.append({
                "role": "native MariaDB gitlink",
                "repository": item["url"],
                "commit": item["sha"],
                "license": lib_entries[item["path"]],
                "gitlinkPath": item["path"],
                "sourceArchiveVerified": False,
                "note": "Gitlink revision pinned; verify checkout and source presence in new build workspace",
            })
    old_manifest = ROOT / "build-work/native-release" / native["release"] / "artifact.json"
    old_wasm = ROOT / "build-work/native-release" / native["release"] / "pbl-runtime.wasm"
    old = {}
    if old_manifest.is_file() and old_wasm.is_file():
        content = old_manifest.read_bytes()
        manifest = json.loads(content)
        old = {
            "manifestMatchesLock": sha(content) == native["manifestSha256"],
            "wasmMatchesManifest": sha(old_wasm.read_bytes()) == manifest["files"]["pbl-runtime.wasm"]["sha256"],
            "wasmSha256": sha(old_wasm.read_bytes()),
            "sourceRevision": manifest.get("sourceRevision"),
            "hasCompleteNativeSbom": bool(manifest.get("nativeComponents")) and bool(manifest.get("correspondingSources")),
        }
    prebuilt = {}
    if receipt.is_file():
        data = json.loads(receipt.read_text())
        prebuilt = {
            "files": data.get("files", []),
            "candidate": data.get("adapter"),
            "validatedNativeWasmSha256": data.get("validatedNativeWasmSha256"),
        }
    # An independent ALWIS SAPI source is an alternative to the missing fork
    # archive, but it is NOT evidence that a corresponding WASM was compiled.
    runner = ROOT / "packages/php-native/src/runner.c"
    request_source = ROOT / "packages/php-native/src/request-state.c"
    request_header = ROOT / "packages/php-native/src/request-state.h"
    generator = (ROOT / "scripts/prepare-native-drivers.py").read_text()
    build_script = (ROOT / "scripts/build-independent-native.sh").read_text()
    independent_runner = {
        "source": runner.relative_to(ROOT).as_posix(),
        "sourceSha256": sha(runner.read_bytes()) if runner.is_file() else None,
        "requestStatePresent": request_source.is_file() and request_header.is_file(),
        "independentRunnerIsDefault": "write('runtime.c', Path(__file__).resolve().parents[1] / 'packages/php-native/src/runner.c', [])" in generator and "PBL_INDEPENDENT_PHP_RUNNER" not in build_script,
        "compiledWithCandidate": False,
        "nativeBrowserParity": False,
    }
    independent_runner["sourcePresent"] = bool(independent_runner["sourceSha256"] and
        independent_runner["requestStatePresent"] and independent_runner["independentRunnerIsDefault"])
    requirements = {
        "nativeCompiler": bool(shutil.which("emcc") and shutil.which("emcmake")),
        "phpRunnerSourcePresent": output[1]["sourceArchiveVerified"] or independent_runner["sourcePresent"],
        "phpSourceArchiveVerified": output[2]["sourceArchiveVerified"],
        "mariaDBSourceArchiveVerified": output[0]["sourceArchiveVerified"],
        "independentPatchReceipt": bool(prebuilt.get("files")),
        "newRuntimeCompiled": bool(prebuilt.get("validatedNativeWasmSha256")),
        "newRuntimeBrowserValidated": False,
        "newNativeLicenseAndSourceBundle": False,
        "externalLegalReview": False,
    }
    return {
        "schemaVersion": 1,
        "status": "needs-build-and-source-review",
        "knownRuntime": old,
        "components": output,
        "candidatePatch": prebuilt,
        "candidateRunner": independent_runner,
        "historicalPhpWrapperArchiveRecovered": output[1]["sourceArchiveVerified"],
        "preflight": requirements,
        "legalCaveat": "A source archive checksum and a successfully linked WASM do not, by themselves, establish permission to redistribute third-party expressions.",
    }


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--output", type=Path, default=ROOT / "build-work/licensing-audit/native-inputs.json")
    p.add_argument("--strict", action="store_true", help="Fail until the complete native release prerequisites exist")
    args = p.parse_args()
    report = audit()
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n")
    for item, ok in report["preflight"].items():
        print(("PASS" if ok else "MISSING") + " " + item)
    if args.strict and not all(report["preflight"].values()):
        raise SystemExit("Native release preflight incomplete; see " + str(args.output))
