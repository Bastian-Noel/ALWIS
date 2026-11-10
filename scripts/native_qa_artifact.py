#!/usr/bin/env python3
"""Stage a test-only independently compiled PHP/MariaDB WASM with EXACT sources.

The QA artifact is never a release authorization. No historical fallback.
Authenticated GitHub workflow users must download and verify all source bytes.
"""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import subprocess

ROOT = Path(__file__).resolve().parents[1]
DIST = ROOT / 'build-work/bridge/.native-build/engine/wasm/runtime-dist'
SOURCES = ROOT / 'build-work/native-distribution/corresponding-sources.tar.gz'
SOURCE_RECEIPT = ROOT / 'build-work/native-distribution/corresponding-sources.tar.gz.json'
BUILD = ROOT / 'build-work/independent-native-build.json'
LICENSES = ROOT / 'build-work/native-license-evidence.json'
LEGACY_SHA = '80df46b7b308b33475fde138eb1a295c01ffbf6ac685d17a74209eb224674e0f'

NATIVE_INPUT_PREFIXES = (
    'packages/php-native/', 'packages/sql-native/', 'packages/files-native/',
    'packages/network-native/', 'engine/native/build/',
)
NATIVE_INPUT_EXACT = {
    'scripts/build-independent-native-ci.sh',
    'scripts/prepare-independent-native-inputs.py',
    'scripts/prepare-native-concurrency.py',
    'scripts/prepare-php84-source.py',
    'scripts/prepare-php84-memory.py',
    'engine/patches/php-8.4.27-wasm-chunks.patch',
    'scripts/prepare-native-drivers.py',
    'scripts/native_runner_provenance.py',
    'scripts/package-native-sources.py',
    'scripts/prepare-native-server.py',
    'scripts/prepare-native-result-budget.py',
    'scripts/build-independent-native.sh',
    'scripts/native_qa_artifact.py',
    'provenance/upstream-lock.json',
    'provenance/submodules-lock.json',
}


def hashfile(path):
    h = hashlib.sha256()
    with Path(path).open('rb') as stream:
        for block in iter(lambda: stream.read(1048576), b''):
            h.update(block)
    return h.hexdigest()


def locked_inputs(root=ROOT):
    paths = subprocess.check_output(['git', 'ls-files', '-z'],
                                    cwd=root).decode().split('\0')
    chosen = sorted(p for p in paths if p and (
        p.startswith(NATIVE_INPUT_PREFIXES) or p in NATIVE_INPUT_EXACT))
    if len(chosen) < 18:
        raise ValueError('Incomplete tracked independent-native source inputs')
    return {p: hashfile(root / p) for p in chosen}


def validate(root=ROOT, stage=None):
    native = json.loads((root / 'build-work/independent-native-build.json').read_text())
    if (native.get('status') != 'browser-parity-verified'
        or native.get('browserValidated') is not True
        or native.get('releaseApproved') is not False):
        raise ValueError('Not an attested independent runtime or inappropriate release status')
    dist = root / 'build-work/bridge/.native-build/engine/wasm/runtime-dist'
    wasm = dist / 'pbl-runtime.wasm'
    glue = dist / 'pbl-runtime.mjs'
    wasm_sha, js_sha = hashfile(wasm), hashfile(glue)
    if wasm_sha == LEGACY_SHA or wasm_sha != native['wasmSha256'] or wasm.stat().st_size != native['bytes']:
        raise ValueError('Unrecognized or historical WASM; refusing to stage')
    parity = native.get('parity', [])
    if len(parity) != 2 or {p['browser'] for p in parity} != {'chromium', 'firefox'}:
        raise ValueError('Both browser attestations required')
    if any(p.get('wasmSha256') != wasm_sha or p.get('nativeJsSha256') != js_sha
           or p.get('cases') != 17 for p in parity):
        raise ValueError('Incorrect, incomplete or stale parity attestation')
    source = root / 'build-work/native-distribution/corresponding-sources.tar.gz'
    receipt_path = source.with_name(source.name + '.json')
    receipt = json.loads(receipt_path.read_text())
    if (receipt.get('historicalJoomEngineForkIncluded') is not False
            or len(receipt.get('archives', [])) != 7
            or hashfile(source) != receipt['bundle']['sha256']):
        raise ValueError('Missing or invalid complete corresponding-source archive')
    evidence_path = root / 'build-work/native-license-evidence.json'
    evidence = json.loads(evidence_path.read_text())
    if (evidence.get('blocked') is not True or evidence.get('releaseApproved') is not False
            or evidence.get('archiveCount') != 7
            or not all(row.get('verified') is True for row in evidence['archiveEvidence'])):
        raise ValueError('Licensing evidence incomplete or improperly claims release approval')
    data = {
        'schemaVersion': 1, 'status': 'independent-native-qa-only',
        'sourceRevision': subprocess.check_output(
            ['git', 'rev-parse', 'HEAD'], cwd=root, text=True).strip(),
        'wasmSha256': wasm_sha, 'glueSha256': js_sha, 'wasmBytes': wasm.stat().st_size,
        'sourcesSha256': hashfile(source), 'sourceReceiptSha256': hashfile(receipt_path),
        'licensingEvidenceSha256': hashfile(evidence_path),
        'parity': parity, 'nativeInputs': locked_inputs(root),
        'legalReviewComplete': False, 'releaseApproved': False,
    }
    if stage:
        stage = Path(stage)
        (stage / 'runtime').mkdir(parents=True, exist_ok=True)
        shutil.copy2(wasm, stage / 'runtime/pbl-runtime.wasm')
        shutil.copy2(glue, stage / 'runtime/pbl-runtime.mjs')
        shutil.copy2(source, stage / 'corresponding-sources.tar.gz')
        shutil.copy2(receipt_path, stage / 'corresponding-sources.tar.gz.json')
        shutil.copy2(evidence_path, stage / 'native-license-evidence.json')
        shutil.copy2(root / 'build-work/independent-native-build.json',
                     stage / 'independent-native-build.json')
        (stage / 'qa-manifest.json').write_text(json.dumps(data, indent=2) + '\n')
    return data


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--stage', type=Path, required=True)
    args = parser.parse_args()
    receipt = validate(stage=args.stage)
    print(json.dumps({'status': receipt['status'], 'wasmSha256': receipt['wasmSha256'],
                      'sourceCount': len(receipt['nativeInputs']),
                      'sourcesSha256': receipt['sourcesSha256'], 'releaseApproved': False}))


if __name__ == '__main__':
    main()
