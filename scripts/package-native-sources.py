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
from importlib import import_module
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
    "scripts/prepare-php84-source.py",
    "scripts/prepare-independent-native-inputs.py",
    "scripts/build-independent-native-ci.sh",
    "scripts/prepare-native-result-budget.py",
    "scripts/prepare-native-server.py",
    "scripts/build-independent-native.sh",
    "scripts/package-native-sources.py",
    "scripts/native_runner_provenance.py",
    "scripts/manifest-native-build.py",
    "scripts/audit-native-license-evidence.py",
    "scripts/attest-independent-parity.py",
    "scripts/native_qa_artifact.py",
    "scripts/restore_independent_native_qa.py",
    "packages/php-native/src/curl-compat.php",
    "provenance/native-license-audit.md",
    "provenance/additional-native-notices.json",
    "provenance/toolchain-runtime-notices.json",
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
    inputs = import_module('prepare-independent-native-inputs')
    archives.extend([
        {"role": "exact PHP 8.4.27 release used for compilation", "repo": "php/php-release",
         "path": "build-work/source-archives/php-8.4.27.tar.xz", "sha256": inputs.PHP_SHA256},
        {"role": "exact MariaDB and PHP shared PCRE2 10.47 library source",
         "repo": "PCRE2Project/pcre2", "path": "build-work/source-archives/pcre2-10.47.zip",
         "sha256": inputs.PCRE_SHA256},
    ])
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


def toolchain_runtime_sources():
    """Ship the exact libc/C++/LLVM and JS runtime sources used by Emscripten."""
    sdk = ROOT / 'build-work/emsdk/upstream/emscripten'
    version = sdk / 'emscripten-version.txt'
    if not version.is_file() or version.read_text().strip().strip('"') != '6.0.6':
        raise ValueError('Pinned Emscripten 6.0.6 runtime sources are required')
    files = [sdk / name for name in ('LICENSE', 'AUTHORS', 'emscripten-version.txt')]
    for directory in ('system', 'src'):
        folder = sdk / directory
        if not folder.is_dir():
            raise ValueError('Missing Emscripten runtime source tree: ' + directory)
        files.extend(p for p in folder.rglob('*') if p.is_file())
    if not all(p.is_file() for p in files):
        raise ValueError('Missing Emscripten runtime license or authors')
    return sdk, sorted(set(files))


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
    php_fibers = import_module('prepare-php84-source')
    fiber_receipt = php_fibers.prepare(ROOT / 'build-work/php-minimal', verify_only=True)
    generated = ROOT / runner['generatedSourceDirectory']
    files = source_files()
    sdk, sdk_files = toolchain_runtime_sources()
    out.parent.mkdir(parents=True, exist_ok=True)
    receipt = {"schemaVersion": 2, "archives": [], "firstPartyFiles": [],
               "historicalJoomEngineForkIncluded": False, "independentPhpRunner": runner,
               "phpFiberAdapter": fiber_receipt}
    with tarfile.open(out, "w:gz") as bundle:
        receipt['toolchainRuntime'] = {'version': '6.0.6', 'files': []}
        for source in sdk_files:
            name = 'emscripten-runtime/' + source.relative_to(sdk).as_posix()
            bundle.add(source, arcname=name, recursive=False)
            receipt['toolchainRuntime']['files'].append({'path': name, 'sha256': digest(source)})
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
        # The final linked Zend fiber source is the adapted, pinned source,
        # not the unmodified official tarball by itself.
        fiber_dir = ROOT / 'build-work/php-minimal'
        bundle.add(fiber_dir / 'Zend/zend_fibers.c', arcname='patched-php/Zend/zend_fibers.c', recursive=False)
        bundle.add(fiber_dir / 'alwis-php84-fibers.json', arcname='patched-php/alwis-php84-fibers.json', recursive=False)
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
