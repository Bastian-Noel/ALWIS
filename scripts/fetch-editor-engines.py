#!/usr/bin/env python3
"""Fetch official standalone language servers; verify archives and WASM bytes."""
from pathlib import Path
import hashlib,io,json,tarfile,urllib.request
root=Path(__file__).resolve().parents[1]
lock=json.loads((root/'apps/studio/editor/engines.lock.json').read_text())
target=root/'build-work/editor-upstream';target.mkdir(parents=True,exist_ok=True)
for engine in lock:
 output=target/engine['file']
 if output.exists() and hashlib.sha256(output.read_bytes()).hexdigest()==engine['wasmSha256']:continue
 data=urllib.request.urlopen(engine['url'],timeout=60).read(32*1024*1024)
 if hashlib.sha256(data).hexdigest()!=engine['archiveSha256']:raise SystemExit('Archive hash mismatch: '+engine['name'])
 with tarfile.open(fileobj=io.BytesIO(data),mode='r:*')as archive:
  wasm=archive.extractfile(engine['file']).read(32*1024*1024)
 if hashlib.sha256(wasm).hexdigest()!=engine['wasmSha256']:raise SystemExit('WASM hash mismatch: '+engine['name'])
 output.write_bytes(wasm)
 print(engine['name'],engine['version'],'verified')
