#!/usr/bin/env python3
"""Record source identity, build provenance and browser validation for a native release."""
from pathlib import Path
import hashlib,json,subprocess,sys,shutil
root=Path(__file__).resolve().parent.parent
out=Path(sys.argv[1] if len(sys.argv)>1 else 'build-work/native-distribution')
dist=root/'build-work/bridge/.native-build/engine/wasm/runtime-dist'
files={}
for name in ['pbl-runtime.mjs','pbl-runtime.wasm']:
 data=(dist/name).read_bytes();files[name]={'sha256':hashlib.sha256(data).hexdigest(),'bytes':len(data)}
receipts=[]
for suite in ['database-stability','mysqli-complete']:
 for browser in ['chromium','firefox']:
  path=root/f'engine/fusion/receipts/{suite}/{browser}.json';record=json.loads(path.read_text())
  if not record.get('passed') or record['wasmSha256']!=files['pbl-runtime.wasm']['sha256']:raise SystemExit('Validation missing or stale: '+str(path))
  receipts.append({'path':str(path.relative_to(root)),'sha256':hashlib.sha256(path.read_bytes()).hexdigest()})
sources=[]
for pattern in ['packages/php-native/src/*','packages/sql-native/src/*','packages/sql-native/include/*','packages/files-native/src/*.c','packages/network-native/src/*.c','engine/native/build/*.cmake','engine/native/build/CMakeLists.txt','engine/native/build/build.sh','scripts/prepare-native-*.py']:
 sources.extend(p for p in root.glob(pattern) if p.is_file())
paths=sorted(set(str(p.relative_to(root)) for p in sources))
if subprocess.run(['git','diff','--quiet','HEAD','--',*paths],cwd=root).returncode:raise SystemExit('Commit native inputs before recording their source revision.')
manifest={'sourceRevision':subprocess.check_output(['git','rev-parse','HEAD'],cwd=root,text=True).strip(),'files':files,'sourceFiles':[{'path':p,'sha256':hashlib.sha256((root/p).read_bytes()).hexdigest()} for p in paths],'validation':receipts,'build':{'emscripten':'6.0.6 (checked by build.sh)','recipe':'engine/native/build/build.sh','target':'pbl-runtime','drivers':json.loads((dist.parent/'pbl-native-sources/driver-adapter.json').read_text())}}
out.mkdir(parents=True,exist_ok=True)
for name in files:shutil.copyfile(dist/name,out/name)
(out/'artifact.json').write_text(json.dumps(manifest,indent=2)+'\n')
(out/'SHA256SUMS').write_text(''.join(hashlib.sha256((out/name).read_bytes()).hexdigest()+'  '+name+'\n' for name in ['artifact.json',*files]))
print(out)
