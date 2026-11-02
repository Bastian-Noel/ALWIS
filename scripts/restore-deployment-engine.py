#!/usr/bin/env python3
"""Restore an immutable release and reject mismatching native sources."""
from pathlib import Path
import hashlib,json,subprocess
lock=json.loads(Path('config/native-runtime.json').read_text())
source=Path('build-work/native-release')/lock['release']
source.mkdir(parents=True,exist_ok=True)
for name in ['artifact.json','pbl-runtime.mjs','pbl-runtime.wasm']:
 if not (source/name).is_file():
  subprocess.run(['gh','release','download',lock['release'],'--repo','Bastian-Noel/WASMWebServer','--pattern',name,'--dir',str(source)],check=True)
data=(source/'artifact.json').read_bytes()
if hashlib.sha256(data).hexdigest()!=lock['manifestSha256']:raise SystemExit('Native manifest hash mismatch')
manifest=json.loads(data)
for record in manifest['sourceFiles']:
 path=Path(lock.get('sourceRelocations',{}).get(record['path'],record['path']))
 if not path.is_file() or hashlib.sha256(path.read_bytes()).hexdigest()!=record['sha256']:raise SystemExit('Native source changed; rebuild and validate first: '+str(path))
target=Path('build-work/bridge/.native-build/engine/wasm/runtime-dist');target.mkdir(parents=True,exist_ok=True)
for name in ['pbl-runtime.mjs','pbl-runtime.wasm']:
 data=(source/name).read_bytes()
 if len(data)!=manifest['files'][name]['bytes'] or hashlib.sha256(data).hexdigest()!=manifest['files'][name]['sha256']:raise SystemExit('Native hash mismatch: '+name)
 (target/name).write_bytes(data)
print('Verified native release:',lock['release'],manifest['sourceRevision'])
