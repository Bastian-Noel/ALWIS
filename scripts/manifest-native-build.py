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
# Never re-release the legacy patched MariaDB/PHP binary as a clean rebuild.
legacy=json.loads((root/'config/native-runtime.json').read_text())
legacy_path=root/'build-work/native-release'/legacy['release']/'artifact.json'
if legacy_path.is_file():
 old=json.loads(legacy_path.read_text())
 if files['pbl-runtime.wasm']['sha256']==old['files']['pbl-runtime.wasm']['sha256']:
  raise SystemExit('This is still the legacy GPLv2/Apache native binary, not the independent candidate')
receipt_path=root/'build-work/independent-native-adapter.json'
if not receipt_path.is_file():raise SystemExit('Missing unpatched MariaDB adapter receipt')
independent=json.loads(receipt_path.read_text())
if independent.get('adapter')!='ALWIS cooperative waits (independent candidate)' or len(independent.get('files',[]))!=3:
 raise SystemExit('Unrecognized independent MariaDB adapter receipt')
source=root/'build-work/mariadb-shallow'
for row in independent['files']:
 p=source/row['path']
 if not p.is_file() or hashlib.sha256(p.read_bytes()).hexdigest()!=row['afterSha256']:
  raise SystemExit('Compiled MariaDB sources do not match their independent adapter receipt: '+row['path'])
source_bundle=root/'build-work/native-distribution/corresponding-sources.tar.gz'
source_receipt=source_bundle.with_name(source_bundle.name+'.json')
if not source_bundle.is_file() or not source_receipt.is_file():
 raise SystemExit('Corresponding source archive missing; run scripts/package-native-sources.py --strict')
correspondence=json.loads(source_receipt.read_text())
if hashlib.sha256(source_bundle.read_bytes()).hexdigest()!=correspondence['bundle']['sha256']:
 raise SystemExit('Corresponding source archive checksum mismatch')
if len(correspondence.get('archives',[]))!=6:
 raise SystemExit('Corresponding source archives incomplete')
if correspondence.get('patchReceiptSha256')!=hashlib.sha256(receipt_path.read_bytes()).hexdigest():
 raise SystemExit('Corresponding sources do not match the independent adapter receipt')
if len(correspondence.get('patchedMariaDBFiles',[]))!=3:
 raise SystemExit('Corresponding modified MariaDB sources are incomplete')
receipts=[]
for suite in ['database-stability','mysqli-complete']:
 for browser in ['chromium','firefox']:
  path=root/f'engine/fusion/receipts/{suite}/{browser}.json';record=json.loads(path.read_text())
  if not record.get('passed') or record['wasmSha256']!=files['pbl-runtime.wasm']['sha256']:raise SystemExit('Validation missing or stale: '+str(path))
  receipts.append({'path':str(path.relative_to(root)),'sha256':hashlib.sha256(path.read_bytes()).hexdigest()})
sources=[]
for pattern in ['packages/php-native/src/*','packages/sql-native/src/*','packages/sql-native/include/*','packages/files-native/src/*.c','packages/network-native/src/*.c','engine/native/build/*.cmake','engine/native/build/CMakeLists.txt','engine/native/build/build.sh','scripts/prepare-native-*.py','scripts/build-independent-native.sh','scripts/package-native-sources.py']:
 sources.extend(p for p in root.glob(pattern) if p.is_file())
paths=sorted(set(str(p.relative_to(root)) for p in sources))
if subprocess.run(['git','diff','--quiet','HEAD','--',*paths],cwd=root).returncode:raise SystemExit('Commit native inputs before recording their source revision.')
out.mkdir(parents=True,exist_ok=True)
license_files=['LICENSE.md','NOTICE.md','THIRD-PARTY-NOTICES.md','provenance/release-licensing-status.json']
for name in license_files:shutil.copy2(root/name,out/name)
shutil.copytree(root/'LICENSES',out/'LICENSES',dirs_exist_ok=True)
license_paths=license_files+['LICENSES/'+p.name for p in sorted((root/'LICENSES').iterdir()) if p.is_file()]
license_records=[{'path':name,'bytes':(out/name).stat().st_size,'sha256':hashlib.sha256((out/name).read_bytes()).hexdigest()} for name in license_paths]
manifest={'sourceRevision':subprocess.check_output(['git','rev-parse','HEAD'],cwd=root,text=True).strip(),'files':files,'sourceFiles':[{'path':p,'sha256':hashlib.sha256((root/p).read_bytes()).hexdigest()} for p in paths],'validation':receipts,'licensing':{'status':json.loads((root/'provenance/release-licensing-status.json').read_text())['status'],'files':license_records,'notes':'Component notices accompany the native artifact; this manifest does not override third-party license terms.'},'build':{'emscripten':'6.0.6 (checked by build.sh)','recipe':'scripts/build-independent-native.sh','target':'pbl-runtime','drivers':json.loads((dist.parent/'pbl-native-sources/driver-adapter.json').read_text())},'independentAdapter':independent,'correspondingSources':{'name':source_bundle.name,'sha256':correspondence['bundle']['sha256'],'bytes':correspondence['bundle']['bytes'],'archives':correspondence['archives'],'patchReceiptSha256':correspondence['patchReceiptSha256'],'patchedMariaDBFiles':correspondence['patchedMariaDBFiles']}}
for name in files:shutil.copyfile(dist/name,out/name)
shutil.copyfile(source_bundle,out/source_bundle.name)
(out/'artifact.json').write_text(json.dumps(manifest,indent=2)+'\n')
(out/'SHA256SUMS').write_text(''.join(hashlib.sha256((out/name).read_bytes()).hexdigest()+'  '+name+'\n' for name in ['artifact.json',*files,source_bundle.name,*license_paths]))
print(out)
