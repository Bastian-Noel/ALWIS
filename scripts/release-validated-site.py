#!/usr/bin/env python3
"""Create an immutable named release from a validated static build."""
from pathlib import Path,PurePosixPath
import hashlib,json,os,re,subprocess,zipfile
licensing=json.loads(Path('provenance/release-licensing-status.json').read_text())
from publication_policy import require_publication
require_publication(licensing)
repo=os.environ['GH_REPO'];tag=os.environ.get('RELEASE_TAG','');run=os.environ.get('VALIDATED_RUN','')
if not re.fullmatch(r'v20\d{2}\.(?:0[1-9]|1[0-2])\.\d+(?:-(?:alpha|beta|rc)\.\d+)?',tag):raise SystemExit('Use a version such as v2026.11.0-beta.1 or v2026.11.0')
if not run.isdigit():raise SystemExit('A validated workflow run ID is required')
def gh(*args):return subprocess.check_output(['gh',*args],text=True).strip()
def api(path):return json.loads(gh('api','repos/'+repo+'/'+path))
record=api('actions/runs/'+run)
if record['path']!='.github/workflows/publish-ftp.yml' or record['head_branch']!='main':raise SystemExit('Release source must be the FTP workflow on main')
jobs=api('actions/runs/'+run+'/jobs?per_page=100')['jobs']
before_ftp=os.environ.get('RELEASE_BEFORE_FTP')=='true'
required_job='Reuse successful CI package' if before_ftp else 'Transfer exactly released package over FTP'
if not any(job['name']==required_job and job['conclusion']=='success' for job in jobs):raise SystemExit('The validated source job must have succeeded first')
revision=os.environ.get('SOURCE_SHA') or record['head_sha'];output=Path('build-work/releases')/tag;output.mkdir(parents=True,exist_ok=True)
existing=subprocess.run(['gh','release','view',tag,'--repo',repo,'--json','isDraft,targetCommitish'],capture_output=True,text=True)
published_existing=False
if existing.returncode==0:
 value=json.loads(existing.stdout)
 published_existing=not value['isDraft']
 if value['targetCommitish']!=revision:raise SystemExit('Existing draft points to a different revision; preserving it')
artifacts=api('actions/runs/'+run+'/artifacts?per_page=100')['artifacts'];candidates=[a for a in artifacts if a['name']=='studio-static-'+revision and not a['expired']]
if not candidates:raise SystemExit('Validated site artifact is unavailable')
artifact=max(candidates,key=lambda a:a['created_at'])
archive=output/'artifact.zip'
with archive.open('wb')as stream:subprocess.run(['gh','api',f'repos/{repo}/actions/artifacts/{artifact["id"]}/zip'],stdout=stream,check=True)
with zipfile.ZipFile(archive)as source:
 entries=[i for i in source.infolist() if not i.is_dir()]
 if len(entries)>250 or sum(i.file_size for i in entries)>128*1024*1024:raise SystemExit('Unexpected artifact size')
 for item in entries:
  path=PurePosixPath(item.filename)
  if path.is_absolute()or'..'in path.parts:raise SystemExit('Unsafe artifact path')
 manifest=json.loads(source.read('release.json'))
 if tag!='v'+manifest.get('version',''):raise SystemExit('Release version must match the packaged application version')
 if manifest['revision']!=revision or manifest['workingChanges']:raise SystemExit('Artifact does not match a clean validated revision')
 for item in manifest['files']:
  path=PurePosixPath(item['path'])
  if path.is_absolute()or'..'in path.parts:raise SystemExit('Unsafe manifest path')
  data=source.read(item['path'])
  if len(data)!=item['bytes'] or hashlib.sha256(data).hexdigest()!=item['sha256']:raise SystemExit('Artifact content mismatch: '+item['path'])
 name='ALWIS-'+tag[1:]+'.zip';site=output/name
 with zipfile.ZipFile(site,'w',zipfile.ZIP_DEFLATED,compresslevel=6)as target:
  for item in sorted(entries,key=lambda i:i.filename):
   info=zipfile.ZipInfo(item.filename,date_time=(1980,1,1,0,0,0));info.compress_type=zipfile.ZIP_DEFLATED;info.external_attr=0o100644<<16;target.writestr(info,source.read(item))
# A retry verifies published ZIP bytes, then compares every payload byte with CI.
if published_existing:
 checks_dir=output/'published-checksums';checks_dir.mkdir(exist_ok=True)
 subprocess.run(['gh','release','download',tag,'--repo',repo,'--pattern','SHA256SUMS','--dir',str(checks_dir),'--clobber'],check=True)
 checks={line.split(None,1)[1].strip():line.split(None,1)[0] for line in (checks_dir/'SHA256SUMS').read_text().splitlines() if line.strip()}
 published_dir=output/'published-assets';published_dir.mkdir(exist_ok=True)
 subprocess.run(['gh','release','download',tag,'--repo',repo,'--pattern',site.name,'--dir',str(published_dir),'--clobber'],check=True)
 published=published_dir/site.name
 with published.open('rb') as stream: actual=hashlib.file_digest(stream,'sha256').hexdigest()
 if checks.get(site.name)!=actual:raise SystemExit('Published ZIP checksum mismatch; preserving immutable release')
 with zipfile.ZipFile(site) as candidate,zipfile.ZipFile(published) as released:
  names=candidate.namelist()
  if len(set(released.namelist()))!=len(released.namelist()) or set(names)!=set(released.namelist()):raise SystemExit('Published inventory differs from validated CI package')
  for name in names:
   if candidate.read(name)!=released.read(name):raise SystemExit('Published payload differs from validated CI package: '+name)
 print('Reusing immutable release with verified identical payload:',tag)
 raise SystemExit(0)
# Preserve the broader CI receipts for the same source revision when available.
validation_runs=api('actions/workflows/check.yml/runs?head_sha='+revision+'&status=success&per_page=10')['workflow_runs'];assets=[site]
if validation_runs:
 validation_run=validation_runs[0]['id'];proof=api(f'actions/runs/{validation_run}/artifacts?per_page=100')['artifacts'];proof=[a for a in proof if a['name']=='studio-validation-'+revision and not a['expired']]
 if proof:
  validation=output/('ALWIS-'+tag[1:]+'-validation.zip')
  with validation.open('wb')as stream:subprocess.run(['gh','api',f'repos/{repo}/actions/artifacts/{proof[0]["id"]}/zip'],stdout=stream,check=True)
  assets.append(validation)
if len(assets)==1:
 proof=[a for a in artifacts if a['name']=='studio-package-validation-'+revision and not a['expired']]
 if proof:
  validation=output/('ALWIS-'+tag[1:]+'-validation.zip')
  with validation.open('wb')as stream:subprocess.run(['gh','api',f'repos/{repo}/actions/artifacts/{proof[0]["id"]}/zip'],stdout=stream,check=True)
  assets.append(validation)
# Publish exact corresponding sources alongside the browser binary.
with zipfile.ZipFile(site) as payload:
 native_path=next(x['path'] for x in manifest['files'] if x['path'].endswith('/engine/native-sources.json'))
 native=json.loads(payload.read(native_path))
 wasm=next(x for x in manifest['files'] if x['path'].endswith('/engine/pbl-runtime.wasm'))
 if native['wasmSha256']!=wasm['sha256']:raise SystemExit('Native source manifest does not match shipped WASM')
 native_run=api('actions/runs/'+str(native['runId']))
 if native_run['conclusion']!='success' or native_run['head_sha']!=native['sourceRevision'] or native_run['path']!='.github/workflows/native-rebuild-ci.yml' or native_run['head_branch'] not in ('main','develop/2026-11-beta1-foundation'):raise SystemExit('Unverified native source run')
 native_dir=output/'native-sources'
 subprocess.run(['gh','run','download',str(native['runId']),'--repo',repo,'--name','independent-native-qa-with-sources','--dir',str(native_dir)],check=True)
 proof=json.loads((native_dir/'qa-manifest.json').read_text())
 if any(proof.get(k)!=native.get(k) for k in ('wasmSha256','sourcesSha256','sourceRevision')):raise SystemExit('Downloaded native proof differs from the shipped source manifest')
 sources=native_dir/'corresponding-sources.tar.gz'
 if hashlib.file_digest(sources.open('rb'),'sha256').hexdigest()!=native['sourcesSha256']:raise SystemExit('Corresponding sources checksum mismatch')
 assets.extend([sources,native_dir/'corresponding-sources.tar.gz.json',native_dir/'qa-manifest.json'])
checksums=output/'SHA256SUMS';lines=[]
for file in assets:
 with file.open('rb')as stream:value=hashlib.file_digest(stream,'sha256').hexdigest()
 lines.append(value+'  '+file.name)
checksums.write_text('\n'.join(lines)+'\n');assets.append(checksums)
publication_status='Build validé. Le transfert FTP sera exécuté après publication de cette release.' if before_ftp else 'Build et transfert FTP réussis.'
notes=output/'notes.md';notes.write_text(f'''# ALWIS {tag}

Atelier web : code, aperçu PHP, bases MariaDB et sessions de visiteurs dans le navigateur.

## Contenu
- Éditeur CodeMirror et outils de formatage pour PHP, HTML, CSS et JavaScript.
- Aperçus HTTP locaux, sessions isolées par cookies et SQL via PDO/MySQLi.
- Données, structure, schéma relationnel et exemple Campus.
- Sauvegarde locale, ouverture de dossier compatible et import/export ZIP.

## Publication
- **Commit validé :** `{revision}`
- **Tests :** Chromium et Firefox dans le workflow de validation.
- **État :** {publication_status}
- **Exécution :** https://github.com/{repo}/actions/runs/{run}

Le ZIP contient le site statique. Pour tester localement : `node serve.mjs` après extraction. Pour héberger, utiliser HTTPS et les en-têtes COOP/COEP indiqués dans `_headers`.

**Exception connue :** le mainteneur autorise cette publication avec le point de compatibilité GPLv2 des deux fichiers de formatage PHP encore ouvert. Les notices sont conservées ; cette décision ne vaut pas autorisation des titulaires tiers. Les sources natives correspondantes sont jointes à cette release.

**Licences :** lire les fichiers `LICENSE.md`, `NOTICE.md`, `THIRD-PARTY-NOTICES.md` et `LICENSES/` du ZIP. Le code original indépendant et le runtime natif ne sont pas placés sous une licence unique. Les sources et empreintes correspondant au runtime doivent accompagner sa redistribution.

Les limites techniques, données sauvegardées dans le navigateur et moyens d'export sont expliqués dans la [documentation du dépôt](https://github.com/{repo}/tree/main/docs).
''')
if existing.returncode!=0:
 command=['gh','release','create',tag,'--repo',repo,'--target',revision,'--draft','--title','ALWIS '+tag.removeprefix('v').replace('-beta.', ' · Beta ').replace('-alpha.', ' · Alpha ').replace('-rc.', ' · Release Candidate '),'--notes-file',str(notes)]
 if '-'in tag:command.append('--prerelease')
 subprocess.run(command,check=True)
subprocess.run(['gh','release','upload',tag,*map(str,assets),'--repo',repo,'--clobber'],check=True)
subprocess.run(['gh','release','edit',tag,'--repo',repo,'--draft=false','--latest='+('false'if'-'in tag else'true'),'--notes-file',str(notes)],check=True)
print('Validated release published:',gh('release','view',tag,'--repo',repo,'--json','url','--jq','.url'))
