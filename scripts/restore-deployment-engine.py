#!/usr/bin/env python3
"""Restore an immutable release and reject mismatching native sources."""
from pathlib import Path
import hashlib,json,subprocess
lock=json.loads(Path('config/native-runtime.json').read_text())
source=Path('build-work/native-release')/lock['release']
source.mkdir(parents=True,exist_ok=True)
for name in ['artifact.json','pbl-runtime.mjs','pbl-runtime.wasm']:
 if not (source/name).is_file():
  subprocess.run(['gh','release','download',lock['release'],'--repo','Bastian-Noel/ALWIS','--pattern',name,'--dir',str(source)],check=True)
data=(source/'artifact.json').read_bytes()
if hashlib.sha256(data).hexdigest()!=lock['manifestSha256']:raise SystemExit('Native manifest hash mismatch')
manifest=json.loads(data)
# Runtime binaries are immutable: verify against the source revision that
# ACTUALLY built this binary, not today's evolving development checkout.
# A source update should require new native validation before a new native
# release, but must not make an existing immutable binary unverifiable.
source_revision=manifest['sourceRevision']
if len(source_revision)!=40 or any(ch not in '0123456789abcdef' for ch in source_revision):
 raise SystemExit('Native manifest source revision is invalid')
for record in manifest['sourceFiles']:
 path=lock.get('sourceRelocations',{}).get(record['path'],record['path'])
 if path.startswith('/') or '..' in Path(path).parts:raise SystemExit('Unsafe native source path: '+path)
 historical=subprocess.run(['git','show',source_revision+':'+path],capture_output=True)
 if historical.returncode or hashlib.sha256(historical.stdout).hexdigest()!=record['sha256']:
  raise SystemExit('Pinned native source not available or checksum mismatch: '+source_revision+':'+path)
target=Path('build-work/bridge/.native-build/engine/wasm/runtime-dist');target.mkdir(parents=True,exist_ok=True)
for name in ['pbl-runtime.mjs','pbl-runtime.wasm']:
 data=(source/name).read_bytes()
 if len(data)!=manifest['files'][name]['bytes'] or hashlib.sha256(data).hexdigest()!=manifest['files'][name]['sha256']:raise SystemExit('Native hash mismatch: '+name)
 (target/name).write_bytes(data)
print('Verified native release:',lock['release'],manifest['sourceRevision'])
