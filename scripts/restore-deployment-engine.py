#!/usr/bin/env python3
"""Restore the verified custom native artifact for the short static-site build."""
from pathlib import Path
import hashlib,json,shutil
source=Path('deployment/native')
if not (source/'artifact.json').is_file():raise SystemExit('Missing deployment/native/artifact.json: retain the verified native build on the deployment branch first.')
manifest=json.loads((source/'artifact.json').read_text())
for record in manifest.get('sourceFiles',[]):
 path=Path(record['path'])
 if not path.is_file() or hashlib.sha256(path.read_bytes()).hexdigest()!=record['sha256']:raise SystemExit('Native source changed; rebuild and validate the native artifact first: '+str(path))
target=Path('build-work/bridge/.native-build/engine/wasm/runtime-dist');target.mkdir(parents=True,exist_ok=True)
for name in ['pbl-runtime.mjs','pbl-runtime.wasm']:
 data=(source/name).read_bytes()
 if hashlib.sha256(data).hexdigest()!=manifest['files'][name]['sha256']:raise SystemExit('Native build hash mismatch: '+name)
 (target/name).write_bytes(data)
print('Restored verified PHP/MariaDB native artifact:',manifest['sourceRevision'])
