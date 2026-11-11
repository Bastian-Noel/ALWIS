#!/usr/bin/env python3
"""Restore the historical native *test witness* from pinned public artifacts.

This is NOT a GPLv2 rebuild or a license approval. Publishing is separately
blocked by scripts/check-release-licensing.py. Never substitute arbitrary WASM.
"""
import argparse
import hashlib
import json
import subprocess
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
WITNESS = ROOT / "provenance/historical-native-artifact.json"
PREVIEW_RELEASE = "v0.3.0-preview.18"
PREVIEW_ASSET = "ALWIS-0.3.0-preview.18.zip"
PREVIEW_SHA256 = "971c2576748f0c19bb0231deaf5270a859818ba4b16515228b8d163dad88928d"
PREVIEW_ENGINE = "_alwis/52bcad1742db0a825174858c56189db724711167/engine/"
HISTORICAL_RELEASE = "native-runtime-2026-11-03-stability"
FILES = ("artifact.json", "pbl-runtime.mjs", "pbl-runtime.wasm")


def checksum(data):
    return hashlib.sha256(data).hexdigest()


def pinned_manifest(lock):
    data = WITNESS.read_bytes()
    if checksum(data) != lock["manifestSha256"]:
        raise ValueError("Historical witness manifest differs from the immutable lock")
    return data, json.loads(data)


def verify_preview_archive(archive, manifest, expected_sha=PREVIEW_SHA256, prefix=PREVIEW_ENGINE):
    """Extract only exact named entries, only AFTER verifying the whole ZIP."""
    if checksum(archive.read_bytes()) != expected_sha:
        raise ValueError("Historical preview ZIP SHA-256 mismatch")
    result = {}
    with zipfile.ZipFile(archive) as z:
        for name in ("pbl-runtime.mjs", "pbl-runtime.wasm"):
            content = z.read(prefix + name)
            record = manifest["files"][name]
            if len(content) != record["bytes"] or checksum(content) != record["sha256"]:
                raise ValueError("Historical preview native byte mismatch: " + name)
            result[name] = content
    return result


def fetch_release_asset(tag, name, directory):
    directory.mkdir(parents=True, exist_ok=True)
    proc = subprocess.run(
        ["gh", "release", "download", tag, "--repo", "Bastian-Noel/ALWIS",
         "--pattern", name, "--dir", str(directory)],
        capture_output=True, text=True, check=False,
    )
    return proc.returncode == 0 and (directory / name).is_file()


def verify_sources(manifest, lock):
    revision = manifest["sourceRevision"]
    if len(revision) != 40 or any(c not in "0123456789abcdef" for c in revision):
        raise ValueError("Invalid historical native source revision")
    for record in manifest["sourceFiles"]:
        path = lock.get("sourceRelocations", {}).get(record["path"], record["path"])
        if path.startswith("/") or ".." in Path(path).parts:
            raise ValueError("Unsafe native source path: " + path)
        historical = subprocess.run(
            ["git", "show", revision + ":" + path],
            cwd=ROOT, capture_output=True, check=False,
        )
        if historical.returncode or checksum(historical.stdout) != record["sha256"]:
            raise ValueError("Pinned native source unavailable or mismatched: " + revision + ":" + path)


def restore(cache, target, historical_archive=None):
    lock = json.loads((ROOT / "config/native-runtime.json").read_text())
    if lock["release"] != HISTORICAL_RELEASE:
        raise ValueError("Unrecognized native lock; no historical fallback allowed")
    source = cache / lock["release"]
    source.mkdir(parents=True, exist_ok=True)
    used_fallback = historical_archive is not None

    if historical_archive is None:
        # Prefer the originally pinned release. It was removed from GitHub.
        for name in FILES:
            if not (source / name).is_file() and not fetch_release_asset(lock["release"], name, source):
                used_fallback = True
                break

    if used_fallback:
        manifest_data, historical_manifest = pinned_manifest(lock)
        if historical_archive is None:
            preview_cache = cache / "historical-preview"
            historical_archive = preview_cache / PREVIEW_ASSET
            if not historical_archive.is_file() and not fetch_release_asset(
                PREVIEW_RELEASE, PREVIEW_ASSET, preview_cache
            ):
                raise RuntimeError("Historical native release missing AND pinned preview ZIP unavailable")
        recovered = verify_preview_archive(historical_archive, historical_manifest)
        recovered["artifact.json"] = manifest_data
        for name, data in recovered.items():
            if not (source / name).exists():
                (source / name).write_bytes(data)

    manifest_bytes = (source / "artifact.json").read_bytes()
    if checksum(manifest_bytes) != lock["manifestSha256"]:
        raise ValueError("Native manifest SHA-256 mismatch")
    manifest = json.loads(manifest_bytes)
    verify_sources(manifest, lock)
    # Do not publish or even copy bytes to the build output until all inputs pass.
    verified = {}
    for name in FILES[1:]:
        data = (source / name).read_bytes()
        record = manifest["files"][name]
        if len(data) != record["bytes"] or checksum(data) != record["sha256"]:
            raise ValueError("Native binary SHA-256 mismatch: " + name)
        verified[name] = data
    target.mkdir(parents=True, exist_ok=True)
    for name, data in verified.items():
        (target / name).write_bytes(data)
    print("Verified historical native TEST WITNESS:", lock["release"],
          manifest["sourceRevision"], "(pinned preview fallback)" if used_fallback else "(native release)")
    print("GPLv2 migration and redistribution remain BLOCKED; this is not a newly built runtime.")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--cache-dir", type=Path, default=Path("build-work/native-release"))
    parser.add_argument("--target-dir", type=Path, default=Path(
        "build-work/bridge/.native-build/engine/wasm/runtime-dist"))
    parser.add_argument("--historical-archive", type=Path,
                        help="Offline test-only path; still requires the pinned archive SHA-256")
    args = parser.parse_args()
    restore(args.cache_dir, args.target_dir, args.historical_archive)


if __name__ == "__main__":
    main()
