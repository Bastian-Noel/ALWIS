#!/usr/bin/env python3
"""Restore only validated, source-backed ALWIS native candidate bytes for QA.

A separate publication license gate still blocks FTP/GHCR. Never retry with
historical releases or unpinned external builds when verification fails.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
from native_qa_artifact import hashfile, locked_inputs, LEGACY_SHA

ROOT = Path(__file__).resolve().parents[1]
CONFIG = ROOT / 'config/independent-native-qa.json'


def ensure_candidate(candidate, lock, root=ROOT):
    candidate = Path(candidate)
    manifest = json.loads((candidate / 'qa-manifest.json').read_text())
    if manifest.get('status') != 'independent-native-qa-only' or manifest.get('releaseApproved') is not False:
        raise ValueError('Attempted to load non-QA or release-authorized binary')
    fields = {'wasmSha256': 'runtime/pbl-runtime.wasm',
              'glueSha256': 'runtime/pbl-runtime.mjs',
              'sourcesSha256': 'corresponding-sources.tar.gz',
              'sourceReceiptSha256': 'corresponding-sources.tar.gz.json',
              'licensingEvidenceSha256': 'native-license-evidence.json'}
    for key, filename in fields.items():
        data = candidate / filename
        if not data.is_file() or hashfile(data) != manifest.get(key):
            raise ValueError('QA payload missing or hash mismatch: ' + filename)
    if manifest['wasmSha256'] == LEGACY_SHA:
        raise ValueError('Historical native binary is forbidden')
    for key in ('wasmSha256', 'glueSha256', 'sourcesSha256', 'sourceRevision'):
        if lock.get(key) != manifest.get(key):
            raise ValueError('Pinned independent candidate does not match ' + key)
    if manifest['nativeInputs'] != locked_inputs(root):
        mismatch = [p for p, digest in locked_inputs(root).items()
                    if manifest['nativeInputs'].get(p) != digest]
        raise ValueError('Independent native inputs changed since QA build: ' + ', '.join(mismatch[:8]))
    details = json.loads((candidate / 'independent-native-build.json').read_text())
    if (details.get('status') != 'browser-parity-verified'
        or details.get('wasmSha256') != manifest['wasmSha256']
        or details.get('browserValidated') is not True
        or details.get('releaseApproved') is not False):
        raise ValueError('Missing independent browser test proof')
    if (len(manifest.get('parity', [])) != 2 or {p.get('browser') for p in manifest['parity']} != {'chromium','firefox'}
            or any(p.get('cases') != 17 for p in manifest['parity'])):
        raise ValueError('Missing complete browser parity')
    source_receipt = json.loads((candidate / 'corresponding-sources.tar.gz.json').read_text())
    if len(source_receipt.get('archives', [])) != 7 or source_receipt.get('historicalJoomEngineForkIncluded') is not False:
        raise ValueError('Complete clean corresponding sources are missing')
    evidence = json.loads((candidate / 'native-license-evidence.json').read_text())
    if evidence.get('status') == 'ready' or evidence.get('releaseApproved') is not False:
        raise ValueError('Unsupported licensing evidence state')
    return manifest


def retrieve(run_id, target, directory=ROOT / 'build-work/native-qa-download'):
    if not run_id or not str(run_id).isdigit():
        raise ValueError('Verified GitHub Actions numeric runId required')
    result = subprocess.run(['gh', 'run', 'view', str(run_id),
                             '--repo', 'Bastian-Noel/ALWIS',
                             '--json', 'status,conclusion,workflowName,headSha,headBranch'],
                            capture_output=True, text=True, check=True)
    meta = json.loads(result.stdout)
    if meta['conclusion'] != 'success' or meta['status'] != 'completed' or 'independent PHP MariaDB native reconstruction' not in meta['workflowName']:
        raise ValueError('Not a successful ALWIS independent-native CI run')
    if meta['headSha'] != target['sourceRevision'] or meta['headBranch'] != 'develop/2026-11-beta1-foundation':
        raise ValueError('Candidate run source revision or branch mismatch')
    if directory.exists() and any(directory.iterdir()):
        raise ValueError('QA download directory is not empty; refusing stale artifact')
    directory.mkdir(parents=True, exist_ok=True)
    subprocess.run(['gh','run','download',str(run_id), '--repo','Bastian-Noel/ALWIS',
                    '--name','independent-native-qa-with-sources',
                    '--dir',str(directory)], check=True)
    return directory


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--candidate-dir', type=Path,
                        help='Use offline authenticated CI artifact for testing, without download')
    parser.add_argument('--target-dir', type=Path,
                        default=ROOT / 'build-work/bridge/.native-build/engine/wasm/runtime-dist')
    parser.add_argument('--config', type=Path, default=CONFIG)
    args = parser.parse_args()
    lock = json.loads(args.config.read_text())
    candidate = args.candidate_dir if args.candidate_dir else retrieve(lock['runId'], lock)
    proof = ensure_candidate(candidate, lock)
    args.target_dir.mkdir(parents=True, exist_ok=True)
    for filename in ('pbl-runtime.wasm','pbl-runtime.mjs'):
        staged = args.target_dir / (filename + '.verified-tmp')
        shutil.copy2(Path(candidate) / 'runtime' / filename, staged)
        os.replace(staged, args.target_dir / filename)
    (args.target_dir / 'qa-native-manifest.json').write_text(json.dumps(
        proof, indent=2) + '\n')
    print('VERIFIED NEW INDEPENDENT NATIVE QA WASM:', proof['wasmSha256'],
          '7 source archives attached; publication license gate still required')


if __name__ == '__main__':
    main()
