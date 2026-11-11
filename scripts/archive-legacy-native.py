#!/usr/bin/env python3
"""Archive and optionally retire ONLY the pinned historical native test witness.

Does not modify production/publication paths, source archives or user projects.
The archive is not a corresponding-source bundle or a redistributable runtime.
"""
import argparse
import hashlib
import io
import json
from pathlib import Path
import subprocess
import tarfile

ROOT = Path(__file__).resolve().parents[1]
LEGACY_SOURCE_FILES = ('engine/native/build/build.sh', 'engine/native/build/runtime-target.cmake',
                       'scripts/prepare-native-drivers.py', 'config/native-runtime.json')
RELEASE_FILES = ('artifact.json', 'pbl-runtime.mjs', 'pbl-runtime.wasm')


def sha(data):
    return hashlib.sha256(data).hexdigest()


def packaged_files(root):
    lock = json.loads((root / 'config/native-runtime.json').read_text())
    if lock.get('release') != 'native-runtime-2026-11-03-stability':
        raise ValueError('Only the pinned historical runtime may be archived')
    release = root / 'build-work/native-release' / lock['release']
    values = {}
    for name in RELEASE_FILES:
        file = release / name
        if not file.is_file() or file.is_symlink():
            raise ValueError('Missing historical test witness: ' + str(file))
        values['historical-runtime/' + name] = file.read_bytes()
    if sha(values['historical-runtime/artifact.json']) != lock['manifestSha256']:
        raise ValueError('Historical native manifest does not match pinned lock')
    manifest = json.loads(values['historical-runtime/artifact.json'])
    for name in RELEASE_FILES[1:]:
        if sha(values['historical-runtime/' + name]) != manifest['files'][name]['sha256']:
            raise ValueError('Historical binary/glue does not match pinned manifest: ' + name)
    # Snapshot the tracked old build recipe without the new runner sources.
    revision = subprocess.check_output(['git','rev-parse','d2548f6^{commit}'],cwd=root,text=True).strip()
    for name in LEGACY_SOURCE_FILES:
        values['historic-build-recipe/' + name] = subprocess.check_output(
            ['git','show',revision + ':' + name],cwd=root)
    for name in ('config/native-runtime.json', 'provenance/historical-native-artifact.json',
                 'provenance/php-wasm-source-recovery.json'):
        values['historical-provenance/' + name] = (root / name).read_bytes()
    values['README-ARCHIVE.md'] = (
        '# ALWIS historical PHP/MariaDB native test witness\n\n'
        'Archived for comparison and rollback diagnostics only, not for distribution.\n'
        'The matching JoomEngine native/runtime.c source remains unavailable; this archive\n'
        'is NOT a license-compliant corresponding-source bundle.\n'
        'The original production runtime and all public releases were NOT changed.\n'
        'Use the verified historical witness only in reproducible browser parity tests.\n'
    ).encode()
    info = {'schemaVersion':1, 'purpose':'historical-test-witness-only',
            'release':lock['release'], 'historicalRecipeCommit':revision,
            'missingOriginalJoomEngineRunner':True,
            'files':[{'path':name,'sha256':sha(data),'bytes':len(data)}
                     for name,data in sorted(values.items())]}
    values['manifest.json'] = (json.dumps(info,indent=2,sort_keys=True)+'\n').encode()
    return values,info


def verify(archive):
    with tarfile.open(archive,'r:gz') as bundle:
        members = bundle.getmembers()
        names = [member.name for member in members]
        if len(names) != len(set(names)) or 'manifest.json' not in names:
            raise ValueError('Duplicate or missing archive manifest')
        for item in members:
            if not item.isfile() or item.name.startswith('/') or '..' in Path(item.name).parts or item.issym() or item.islnk():
                raise ValueError('Unsafe archive member')
        report = json.load(bundle.extractfile('manifest.json'))
        expected = {entry['path']:entry for entry in report['files']}
        if report.get('purpose')!='historical-test-witness-only' or set(names)!=(set(expected)|{'manifest.json'}):
            raise ValueError('Unexpected historical archive inventory')
        for name,entry in expected.items():
            data = bundle.extractfile(name).read()
            if len(data)!=entry['bytes'] or sha(data)!=entry['sha256']:
                raise ValueError('Historical archive checksum failure: '+name)
        binary = json.load(bundle.extractfile('historical-runtime/artifact.json'))
        if sha(bundle.extractfile('historical-runtime/pbl-runtime.wasm').read()) != binary['files']['pbl-runtime.wasm']['sha256']:
            raise ValueError('Historical wasm hash mismatch')
    return report


def archive(root, output, clean=False):
    values, report = packaged_files(root)
    if output.exists():
        raise FileExistsError('Refusing to replace existing historical archive')
    output.parent.mkdir(parents=True,exist_ok=True)
    temp = output.with_name(output.name+'.partial')
    try:
        with tarfile.open(temp,'w:gz') as bundle:
            for name,data in sorted(values.items()):
                info=tarfile.TarInfo(name)
                info.mode=0o644
                info.size=len(data)
                info.mtime=0
                bundle.addfile(info,io.BytesIO(data))
        verified=verify(temp)
        if verified!=report:
            raise ValueError('Archive verification differed from source manifest')
        temp.rename(output)
    finally:
        if temp.exists(): temp.unlink()
    if clean:
        legacy_dir = root/'build-work/native-release'/report['release']
        staging = root/'build-work/bridge/.native-build/engine/wasm/runtime-dist'
        files = {x['path']:x for x in report['files']}
        # Validate every file before deleting a byte. If a new WASM was built, STOP.
        candidates = [legacy_dir/name for name in RELEASE_FILES]
        candidates += [staging/name for name in RELEASE_FILES[1:] if (staging/name).exists()]
        for item in candidates:
            record=files.get('historical-runtime/'+item.name)
            if record is None or not item.is_file() or sha(item.read_bytes())!=record['sha256']:
                raise ValueError('Refusing cleanup of non-historical native output: '+str(item))
        # Catch unexpected files before cleanup: never touch unknown build artefacts.
        for folder in (legacy_dir, staging):
            if folder.exists() and {x.name for x in folder.iterdir()}-set(RELEASE_FILES):
                raise ValueError('Refusing to clean mixed native output folder: '+str(folder))
        for item in candidates: item.unlink()
        for folder in (legacy_dir,staging):
            if folder.is_dir() and not any(folder.iterdir()): folder.rmdir()
    return {'archive':str(output),'sha256':sha(output.read_bytes()),
            'bytes':output.stat().st_size,'files':len(report['files']),'cleaned':clean}


if __name__=='__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('--archive',type=Path,default=ROOT/'build-work/archives/legacy-native-2026-11-03-stability.tar.gz')
    parser.add_argument('--verify-only',action='store_true')
    parser.add_argument('--clean-stale-local-outputs',action='store_true')
    args=parser.parse_args()
    if args.verify_only:
        print(json.dumps({'status':'verified','archive':str(args.archive),'manifest':verify(args.archive)},indent=2))
    else:
        print(json.dumps(archive(ROOT,args.archive,clean=args.clean_stale_local_outputs),indent=2))
