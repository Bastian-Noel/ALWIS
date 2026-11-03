#!/usr/bin/env python3
"""Create an immutable named release from a successful FTP workflow artifact."""
from pathlib import Path,PurePosixPath
import hashlib,json,os,re,subprocess,zipfile
repo=os.environ['GH_REPO'];tag=os.environ.get('RELEASE_TAG','');run=os.environ.get('VALIDATED_RUN','')
if not re.fullmatch(r'v\d+\.\d+\.\d+(?:-(?:alpha|beta|rc|preview)\.\d+)?',tag):raise SystemExit('Use a version such as v0.1.0 or v0.2.0-preview.1')
if not run.isdigit():raise SystemExit('A successful FTP run ID is required')
def gh(*args):return subprocess.check_output(['gh',*args],text=True).strip()
def api(path):return json.loads(gh('api','repos/'+repo+'/'+path))
record=api('actions/runs/'+run)
if record['path']!='.github/workflows/publish-ftp.yml' or record['head_branch']!='main':raise SystemExit('Release source must be the FTP workflow on main')
jobs=api('actions/runs/'+run+'/jobs?per_page=100')['jobs']
if not any(job['name']=='publish' and job['conclusion']=='success' for job in jobs):raise SystemExit('The FTP publication job must have succeeded first')
revision=record['head_sha'];output=Path('build-work/releases')/tag;output.mkdir(parents=True,exist_ok=True)
existing=subprocess.run(['gh','release','view',tag,'--repo',repo,'--json','isDraft,targetCommitish'],capture_output=True,text=True)
if existing.returncode==0:
 value=json.loads(existing.stdout)
 if not value['isDraft']:raise SystemExit('Published versions are immutable; select a new version')
 if value['targetCommitish']!=revision:raise SystemExit('Existing draft points to a different revision; preserving it')
artifacts=api('actions/runs/'+run+'/artifacts?per_page=100')['artifacts'];candidates=[a for a in artifacts if a['name']=='studio-static-'+revision and not a['expired']]
if not candidates:raise SystemExit('Validated site artifact is unavailable')
artifact=max(candidates,key=lambda a:a['created_at'])
archive=output/'artifact.zip'
with archive.open('wb')as stream:subprocess.run(['gh','api',f'repos/{repo}/actions/artifacts/{artifact["id"]}/zip'],stdout=stream,check=True)
with zipfile.ZipFile(archive)as source:
 entries=[i for i in source.infolist() if not i.is_dir()]
 if len(entries)>100 or sum(i.file_size for i in entries)>128*1024*1024:raise SystemExit('Unexpected artifact size')
 for item in entries:
  path=PurePosixPath(item.filename)
  if path.is_absolute()or'..'in path.parts:raise SystemExit('Unsafe artifact path')
 manifest=json.loads(source.read('release.json'))
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
# Preserve the broader CI receipts for the same source revision when available.
validation_runs=api('actions/workflows/check.yml/runs?head_sha='+revision+'&status=success&per_page=10')['workflow_runs'];assets=[site]
if validation_runs:
 validation_run=validation_runs[0]['id'];proof=api(f'actions/runs/{validation_run}/artifacts?per_page=100')['artifacts'];proof=[a for a in proof if a['name']=='studio-validation-'+revision and not a['expired']]
 if proof:
  validation=output/('ALWIS-'+tag[1:]+'-validation.zip')
  with validation.open('wb')as stream:subprocess.run(['gh','api',f'repos/{repo}/actions/artifacts/{proof[0]["id"]}/zip'],stdout=stream,check=True)
  assets.append(validation)
checksums=output/'SHA256SUMS';lines=[]
for file in assets:
 with file.open('rb')as stream:value=hashlib.file_digest(stream,'sha256').hexdigest()
 lines.append(value+'  '+file.name)
checksums.write_text('\n'.join(lines)+'\n');assets.append(checksums)
notes=output/'notes.md';notes.write_text(f'''ALWIS — Atelier Local Web avec IDE et SQL. Cette préversion intègre la nouvelle interface au moteur réel : CodeMirror, aperçu, sessions, administration SQL et schéma relationnel.

- CodeMirror : formateur à la demande, indentation réglable, snippets immédiats et développement Emmet prioritaire sur Tab.
- Formulaires de colonnes enrichis, attributs existants préservés, valeurs SQL exactes et protection contre les conflits.
- Nettoyage natif MySQLi des buffers binaires à la fermeture de connexion ; scénarios PDO natif/émulé, transactions et curseurs consolidés.
- Export ZIP des fichiers et bases conservées ; un projet PHP pur reste sans démarrage SQL inutile.
- Thèmes clair/sombre, contrastes corrigés et captures réelles dans le README.

Source validée : `{revision}`. Build et tests Chromium/Firefox réussis, puis transfert FTP réussi : https://github.com/{repo}/actions/runs/{run}.

Le ZIP contient le site statique autonome : extraire puis lancer `node serve.mjs` pour un essai local. HTTPS et les en-têtes COOP/COEP sont nécessaires sur un hébergement. Les reçus disponibles et SHA256SUMS accompagnent le paquet. Aucun projet utilisateur ni identifiant FTP n'est inclus.

Version prototype : les limites PDO/MySQLi/PHP et de l'administration SQL restent documentées dans le dépôt. L'URL publique n'étant pas configurée, la vérification du domaine HTTPS réel reste distincte du transfert FTP.
''')
if existing.returncode!=0:
 command=['gh','release','create',tag,'--repo',repo,'--target',revision,'--draft','--title',tag+' — Prototype fonctionnel PHP/MariaDB et éditeurs WASM','--notes-file',str(notes)]
 if '-'in tag:command.append('--prerelease')
 subprocess.run(command,check=True)
subprocess.run(['gh','release','upload',tag,*map(str,assets),'--repo',repo,'--clobber'],check=True)
subprocess.run(['gh','release','edit',tag,'--repo',repo,'--draft=false','--latest='+('false'if'-'in tag else'true'),'--notes-file',str(notes)],check=True)
print('Validated release published:',gh('release','view',tag,'--repo',repo,'--json','url','--jq','.url'))
