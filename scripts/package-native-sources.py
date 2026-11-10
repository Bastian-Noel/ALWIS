#!/usr/bin/env python3
"""Prepare corresponding-source inputs for a future GPLv2 native distribution.

Strictly verifies local upstream archives: this does not download inaccessible
forks, judge derivative rights or authorize publication.
"""
import argparse
import hashlib
import json
import tarfile
from pathlib import Path
from native_runner_provenance import verify as verify_independent_runner

ROOT = Path(__file__).resolve().parents[1]
UPSTREAM = (
    "shyim/lite4mariadb",
    "php/php-src",
    "seanmorris/php-wasm",
    # The deleted JoomEngine fork is NOT linked by the independent runner.
    # Historical source identity remains recorded in provenance/upstream-lock.json;
    # do not require an archive for code that must not enter the combined WASM.
)
MORE_SOURCES = (
    "packages/php-native",
    "packages/sql-native",
    "packages/files-native",
    "packages/network-native",
    "engine/native/build",
    "engine/patches",
    "engine/baseline/compat",
    "scripts/prepare-native-concurrency.py",
    "scripts/prepare-native-drivers.py",
    "scripts/prepare-native-result-budget.py",
    "scripts/prepare-native-server.py",
    "scripts/build-independent-native.sh",
    "scripts/package-native-sources.py",
    "scripts/native_runner_provenance.py",
    "scripts/manifest-native-build.py",
    "scripts/archive-legacy-native.py",
    "provenance/upstream-lock.json",
    "provenance/submodules-lock.json",
    "provenance/component-license-map.md",
    "provenance/php-runner-reconstruction.md",
    "provenance/joomengine-inspiration-map.md",
    "LICENSE.md",
    "NOTICE.md",
    "THIRD-PARTY-NOTICES.md",
    "LICENSES",
)


def digest(path: Path):
    h = hashlib.sha256()
    with path.open("rb") as src:
        for chunk in iter(lambda: src.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def expected_archives():
    repos = {item["repo"]: item for item in json.loads((ROOT / "provenance/upstream-lock.json").read_text())["repositories"]}
    downloads = json.loads((ROOT / "provenance/submodules-lock.json").read_text())["downloaded"]
    archives = [
        {"role": "upstream native source", "repo": repo, "path": repos[repo]["archive"], "sha256": repos[repo]["archive_sha256"]}
        for repo in UPSTREAM
    ]
    archives += [
        {"role": "MariaDB linked submodule source", "repo": x["repo"], "path": x["archive"], "sha256": x["archive_sha256"]}
        for x in downloads if x["repo"] in ("MariaDB/mariadb-connector-c", "wolfSSL/wolfssl")
    ]
    return archives


def source_files():
    paths = []
    for path in MORE_SOURCES:
        p = Path(path)
        candidate = ROOT / p
        if not candidate.exists():
            raise ValueError("Missing first-party native source: " + path)
        if candidate.is_dir():
            paths.extend(f for f in candidate.rglob("*") if f.is_file() and ".git" not in f.parts)
        else:
            paths.append(candidate)
    return sorted(set(paths))


def build(out: Path, *, strict: bool):
    sources = []
    missing = []
    for row in expected_archives():
        candidates = [ROOT / row["path"], ROOT / "build-work/source-archives" / Path(row["path"]).name]
        present = next((p for p in candidates if p.is_file()), None)
        if not present:
            missing.append(row["repo"])
            continue
        actual = digest(present)
        if actual != row["sha256"]:
            raise ValueError(f"Source archive checksum mismatch for {row['repo']}: {actual}")
        sources.append((row, present))
    if missing:
        print(json.dumps({"status": "missing-upstream-archives", "missing": missing}, ensure_ascii=False))
        if strict:
            raise SystemExit("Cannot package complete native sources until all upstream archives are recovered.")
        return False
    # Include the exact generated MariaDB modifications, not only the pristine
    # upstream archive and the script that could produce them.
    receipt_file = ROOT / "build-work/independent-native-adapter.json"
    if not receipt_file.is_file():
        raise SystemExit("Missing independent MariaDB patch receipt for the corresponding-source bundle.")
    receipt = json.loads(receipt_file.read_text())
    rows = receipt.get("files", [])
    if receipt.get("adapter") != "ALWIS cooperative waits (independent candidate)" or len(rows) != 3:
        raise SystemExit("Unexpected MariaDB patch receipt; refusing source bundle.")
    modified = []
    for row in rows:
        relative = Path(row["path"])
        if relative.is_absolute() or ".." in relative.parts:
            raise SystemExit("Unsafe MariaDB source location in patch receipt.")
        file = ROOT / "build-work/mariadb-shallow" / relative
        if not file.is_file() or digest(file) != row["afterSha256"]:
            raise SystemExit("MariaDB source differs from patch receipt: " + row["path"])
        modified.append((file, "patched-mariadb/" + relative.as_posix()))
    # Fail closed if the build still generated a wrapper from the missing fork.
    # Include the exact generated C translation units, not just regeneration scripts.
    runner = verify_independent_runner(ROOT)
    generated = ROOT / runner['generatedSourceDirectory']
    files = source_files()
    out.parent.mkdir(parents=True, exist_ok=True)
    receipt = {"schemaVersion": 2, "archives": [], "firstPartyFiles": [],
               "historicalJoomEngineForkIncluded": False, "independentPhpRunner": runner}
    with tarfile.open(out, "w:gz") as bundle:
        for row, source in sources:
            name = "upstream/" + Path(row["path"]).name
            bundle.add(source, arcname=name, recursive=False)
            receipt["archives"].append({**row, "archiveInBundle": name, "size": source.stat().st_size})
        bundle.add(receipt_file, arcname="patched-mariadb/independent-native-adapter.json", recursive=False)
        receipt["patchReceiptSha256"] = digest(receipt_file)
        receipt["patchedMariaDBFiles"] = []
        for source, name in modified:
            bundle.add(source, arcname=name, recursive=False)
            receipt["patchedMariaDBFiles"].append({"path": name, "sha256":digest(source)})
        for row in runner['generatedFiles']:
            source = generated / row['name']
            bundle.add(source, arcname='generated-native/' + row['name'], recursive=False)
        for source in files:
            name = "alwis/" + source.relative_to(ROOT).as_posix()
            bundle.add(source, arcname=name, recursive=False)
            receipt["firstPartyFiles"].append({"path":name, "sha256":digest(source)})
    receipt["bundle"] = {"file":out.name, "bytes":out.stat().st_size, "sha256":digest(out)}
    (out.parent / (out.name + ".json")).write_text(json.dumps(receipt,indent=2) + "\n")
    print(json.dumps(receipt["bundle"]))
    return True


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--output", type=Path, default=ROOT / "build-work/native-distribution/corresponding-sources.tar.gz")
    p.add_argument("--strict", action="store_true")
    args = p.parse_args()
    build(args.output, strict=args.strict)
