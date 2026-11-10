#!/usr/bin/env python3
"""Restore only validated, source-backed ALWIS native candidate bytes for QA.

A separate publication license gate still blocks FTP/GHCR. Never retry with
historical releases or unpinned external builds when verification fails.
"""
import argparse
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
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



def find_verified_compatible_candidate(root=ROOT):
    """Select a successful native CI artifact by verified SOURCE HASHES, not by name.

    A missing pinned config is expected on the very first independent build.
    This never accepts a historical binary, a failed native workflow, an
    unverified artifact, or a build with different tracked C/JS inputs.
    """
    command = [
        'gh', 'run', 'list', '--repo', 'Bastian-Noel/ALWIS',
        '--workflow', 'native-rebuild-ci.yml',
        '--branch', 'develop/2026-11-beta1-foundation',
        '--limit', '25',
        '--json', 'databaseId,status,conclusion,headSha',
    ]
    runs = json.loads(subprocess.check_output(command, text=True))
    sources = locked_inputs(root)
    completed = [run for run in runs if run.get('status') == 'completed'
                 and run.get('conclusion') == 'success']
    if not completed:
        raise ValueError('No successful native CI build exists for independent WASM. '
                         'The current native reconstruction must first pass.')

    for run in completed:
        run_id = run['databaseId']
        # Only a completed native job that actually UPLOADED the attested
        # independent-runtime QA bundle qualifies. The old GitHub releases
        # and browser witness are never searched.
        remote = json.loads(subprocess.check_output(
            ['gh', 'api', f'repos/Bastian-Noel/ALWIS/actions/runs/{run_id}/artifacts',
             '--paginate'], text=True))
        items = remote.get('artifacts', [])
        if not any(a.get('name') == 'independent-native-qa-with-sources'
                   and not a.get('expired', True) for a in items):
            continue
        with tempfile.TemporaryDirectory(prefix='alwis-verified-native-') as temporary:
            candidate = Path(temporary)
            subprocess.run([
                'gh', 'run', 'download', str(run_id),
                '--repo', 'Bastian-Noel/ALWIS',
                '--name', 'independent-native-qa-with-sources',
                '--dir', str(candidate)
            ], check=True)
            manifest_file = candidate / 'qa-manifest.json'
            if not manifest_file.exists():
                raise ValueError(f'CI run {run_id} shipped a bundle without its native manifest')
            manifest = json.loads(manifest_file.read_text())
            if manifest.get('sourceRevision') != run.get('headSha'):
                raise ValueError(f'CI run {run_id} source SHA mismatches its artifact')
            if manifest.get('nativeInputs') != sources:
                # This is NOT a fallback to an incompatible native runtime:
                # compare every tracked native input before considering it.
                continue
            lock = {
                'runId': run_id,
                'sourceRevision': manifest['sourceRevision'],
                'wasmSha256': manifest['wasmSha256'],
                'glueSha256': manifest['glueSha256'],
                'sourcesSha256': manifest['sourcesSha256'],
            }
            # Check independently that GitHub run identity/branch and
            # conclusion are correct before trusting the artifact.
            verified = retrieve_run_metadata(run_id, lock)
            if not verified:
                raise ValueError('Authenticated native CI run cannot be confirmed')
            proof = ensure_candidate(candidate, lock, root)
            yield candidate, lock, proof
            return
    raise ValueError(
        'No successful native CI artifact has the SAME verified C/JS native inputs '
        'as this checkout. Rebuild the independent runtime; never restore legacy WASM.'
    )


def retrieve_run_metadata(run_id, target):
    record = json.loads(subprocess.check_output([
        'gh','run','view',str(run_id),
        '--repo','Bastian-Noel/ALWIS',
        '--json','status,conclusion,workflowName,headSha,headBranch',
    ], text=True))
    if record.get('status') != 'completed' or record.get('conclusion') != 'success':
        return False
    if 'independent PHP MariaDB native reconstruction' not in record.get('workflowName',''):
        return False
    return (record.get('headSha') == target.get('sourceRevision') and
            record.get('headBranch') == 'develop/2026-11-beta1-foundation')


def install_verified_candidate(candidate, proof, target_dir, run_id):
    target_dir = Path(target_dir)
    target_dir.mkdir(parents=True, exist_ok=True)
    for filename in ('pbl-runtime.wasm','pbl-runtime.mjs'):
        staged = target_dir / (filename + '.verified-tmp')
        shutil.copy2(Path(candidate) / 'runtime' / filename, staged)
        os.replace(staged, target_dir / filename)
    receipt = dict(proof, runId=run_id)
    (target_dir / 'qa-native-manifest.json').write_text(json.dumps(receipt, indent=2) + '\n')
    selection = ROOT / 'build-work/independent-native-qa-selection.json'
    selection.parent.mkdir(parents=True, exist_ok=True)
    selection.write_text(json.dumps({
        'runId': run_id, 'sourceRevision': proof['sourceRevision'],
        'wasmSha256': proof['wasmSha256'], 'glueSha256': proof['glueSha256'],
        'sourcesSha256': proof['sourcesSha256'], 'releaseApproved': False,
    }, indent=2) + '\n')
    print('VERIFIED INDEPENDENT NATIVE QA WASM:', proof['wasmSha256'],
          '7 source archives attached; no historical release or FTP/GHCR publish')



def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--candidate-dir', type=Path,
                        help='Use offline authenticated CI artifact for testing, without download')
    parser.add_argument('--target-dir', type=Path,
                        default=ROOT / 'build-work/bridge/.native-build/engine/wasm/runtime-dist')
    parser.add_argument('--config', type=Path, default=CONFIG)
    args = parser.parse_args()
    if args.config.is_file():
        # An explicitly committed runId/checksum lock always takes precedence.
        lock = json.loads(args.config.read_text())
        candidate = args.candidate_dir if args.candidate_dir else retrieve(lock['runId'], lock)
        proof = ensure_candidate(candidate, lock)
        install_verified_candidate(candidate, proof, args.target_dir, lock['runId'])
    elif args.candidate_dir:
        raise ValueError('An offline QA bundle requires --config with exact hashes')
    else:
        # First independent build has no hand-written config. Discover the
        # newest successful workflow artifact matching every native source.
        matched = False
        for candidate, lock, proof in find_verified_compatible_candidate():
            install_verified_candidate(candidate, proof, args.target_dir, lock['runId'])
            matched = True
        if not matched:
            raise ValueError('No verified compatible native QA artifact found')


if __name__ == '__main__':
    main()
