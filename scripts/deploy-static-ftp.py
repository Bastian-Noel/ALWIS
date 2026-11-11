#!/usr/bin/env python3
"""Publish only the static package via passive FTP; credentials stay in secrets.
Uploads are staged, replaced files backed up privately on the runner, then each
file is promoted by rename, index.html last. No remote project files are deleted.
"""
from pathlib import Path,PurePosixPath
import os,sys,json,hashlib,ftplib,re,uuid,urllib.request
source=Path(sys.argv[1] if len(sys.argv)>1 else 'build-work/site').resolve()
licensing_path=source/'RELEASE-LICENSING-STATUS.json'
if not licensing_path.is_file():raise SystemExit('Missing release licensing status; refusing FTP publication.')
licensing=json.loads(licensing_path.read_text())
from publication_policy import require_publication
require_publication(licensing, source)
password=os.environ.get('FTP_PASSWORD','')
if not password:raise SystemExit('Missing GitHub repository secret FTP_PASSWORD. Add it in Settings > Secrets and variables > Actions, then rerun this workflow.')
host=os.environ.get('FTP_HOST','141.253.111.13');username=os.environ.get('FTP_USERNAME','studio');port=int(os.environ.get('FTP_PORT','21'))
remote_dir=os.environ.get('FTP_REMOTE_DIR','.')
backup=Path(os.environ.get('RUNNER_TEMP','build-work'))/'ftp-previous-site';backup.mkdir(parents=True,exist_ok=True)
release=json.loads((source/'release.json').read_text())
for record in release['files']:
 path=PurePosixPath(record['path'])
 if path.is_absolute() or '..' in path.parts:raise SystemExit('Unsafe package path')
 data=(source/path).read_bytes()
 if len(data)!=record['bytes'] or hashlib.sha256(data).hexdigest()!=record['sha256']:raise SystemExit('Package verification failed: '+str(path))
# A PHP-capable host must serve these helpers as text, never execute them.
from static_package_inventory import verify_inventory
files=verify_inventory(source, release)
managed='''# BEGIN WASMWebServer managed headers
<IfModule mod_headers.c>
  Header always set Cross-Origin-Opener-Policy "same-origin"
  Header always set Cross-Origin-Embedder-Policy "require-corp"
  Header always set Cross-Origin-Resource-Policy "same-origin"
  Header always set X-Content-Type-Options "nosniff"
  Header always set Cache-Control "no-cache"
  <Files "service-worker.js">
    Header always set Service-Worker-Allowed "/"
  </Files>
</IfModule>
<IfModule mod_mime.c>
  AddType application/wasm .wasm
</IfModule>
<IfModule mod_dir.c>
  DirectoryIndex index.html
</IfModule>
# END WASMWebServer managed headers
'''
ftp=ftplib.FTP(timeout=60);stage='.pbl-upload-'+release['revision'][:12]+'-'+uuid.uuid4().hex[:8]
created=[]
def directories(path):
 current=''
 for part in PurePosixPath(path).parts:
  if part in ('','.'):continue
  if part in ('..','/') or '\n' in part or '\r' in part:raise ValueError('Unsafe remote directory')
  current=(current+'/' if current else '')+part
  try:ftp.mkd(current)
  except ftplib.error_perm:
   original=ftp.pwd();ftp.cwd(current);ftp.cwd(original)
def names(parent):
 try:return {name for name,info in ftp.mlsd(parent) if info.get('type') not in ('cdir','pdir')}
 except ftplib.error_perm:return {PurePosixPath(name).name for name in ftp.nlst(parent)}
def store(name,data):
 from io import BytesIO
 ftp.storbinary('STOR '+name,BytesIO(data),blocksize=256*1024)
try:
 ftp.connect(host,port);ftp.login(username,password);ftp.set_pasv(True);ftp.cwd(remote_dir)
 print('FTP authenticated; remote directory:',ftp.pwd(),flush=True)
 root_names=names('.')
 if remote_dir in ('','.','./'):
  candidates=[name for name in ['public_html','httpdocs','www','htdocs'] if name in root_names]
  if candidates:raise RuntimeError('FTP root contains a possible web directory ('+', '.join(candidates)+'). Set repository variable FTP_REMOTE_DIR to the site document root, then rerun.')
 previous=''
 if '.htaccess' in root_names:
  chunks=[];ftp.retrbinary('RETR .htaccess',chunks.append);raw=b''.join(chunks)
  if len(raw)>256*1024:raise RuntimeError('Existing .htaccess exceeds 256 KiB; preserving it')
  previous=raw.decode('utf-8');(backup/'.htaccess').write_bytes(raw)
 previous=re.sub(r'# BEGIN WASMWebServer managed headers.*?# END WASMWebServer managed headers\s*','',previous,flags=re.S)
 htaccess=(previous.rstrip()+'\n\n'+managed).encode()
 directories(stage)
 publication=[]
 for file in files:
  name=file.relative_to(source).as_posix();directories(str(PurePosixPath(stage,name).parent));directories(str(PurePosixPath(name).parent))
  print('Upload:',name,'('+str(file.stat().st_size)+' bytes)',flush=True)
  with file.open('rb')as stream:ftp.storbinary('STOR '+stage+'/'+name,stream,blocksize=256*1024)
  if ftp.size(stage+'/'+name)!=file.stat().st_size:raise RuntimeError('Remote size mismatch: '+name)
  publication.append(name)
 store(stage+'/.htaccess',htaccess);publication.append('.htaccess')
 # Complete every backup before replacing any live file.
 for name in publication:
  parent=str(PurePosixPath(name).parent)
  if PurePosixPath(name).name in names(parent):
   target=backup/name;target.parent.mkdir(parents=True,exist_ok=True)
   with target.open('wb')as stream:ftp.retrbinary('RETR '+name,stream.write)
 order=sorted(publication,key=lambda name:(name=='release.json',name=='index.html',name=='.htaccess',name))
 for name in order:
  ftp.rename(stage+'/'+name,name);print('Published:',name,flush=True)
 # Remove only our now-empty staging directories, never old site contents.
 stagedirs={str(PurePosixPath(stage,name).parent) for name in publication}
 for directory in sorted(stagedirs,key=lambda value:value.count('/'),reverse=True):
  try:ftp.rmd(directory)
  except ftplib.error_perm:pass
 try:ftp.rmd(stage)
 except ftplib.error_perm:pass
 ftp.quit()
 print('FTP publication completed for revision',release['revision'],flush=True)
 url=os.environ.get('FTP_PUBLIC_URL','').strip()
 if url:
  if not url.startswith('https://'):raise RuntimeError('FTP upload completed, but FTP_PUBLIC_URL must use HTTPS for the runtime')
  with urllib.request.urlopen(urllib.request.Request(url.rstrip('/')+'/',method='HEAD'),timeout=30)as response:
   if response.headers.get('Cross-Origin-Opener-Policy')!='same-origin' or response.headers.get('Cross-Origin-Embedder-Policy')!='require-corp':raise RuntimeError('FTP upload completed, but the public server does not provide COOP/COEP; configure its web server')
   print('Public HTTPS and isolation headers verified:',url)
   base=url.rstrip('/')
   def published(path,limit):
    request=urllib.request.Request(base+'/'+path+'?verify='+release['revision']+'-'+uuid.uuid4().hex,headers={'Cache-Control':'no-cache'})
    with urllib.request.urlopen(request,timeout=30) as result:return result.read(limit+1)
   remote=json.loads(published('release.json',2*1024*1024))
   if any(remote.get(key)!=release.get(key) for key in ['revision','version','assetBase']):raise RuntimeError('FTP completed, but the public version manifest is stale or belongs to another site')
   html=published('',1024*1024).decode('utf-8')
   if 'name="alwis-build" content="'+release['revision']+'"' not in html:raise RuntimeError('FTP completed, but the public entrypoint still serves an older build')
   checked=0
   for record in release['files']:
    if record['path']=='social-card.png' or any(record['path'].endswith(suffix) for suffix in ['/site-updates.mjs','/folder-access.mjs','/import-dialog.mjs','/import-plan.mjs','/zip-import.mjs','/zip.mjs','/zip-worker.mjs','/native-runtime.mjs','/native-worker.mjs','/project-disk.mjs','/disk-workspace.mjs','/disk-import.mjs','/zip-stream.mjs','/file-response.mjs']):
     data=published(record['path'],record['bytes'])
     if len(data)!=record['bytes'] or hashlib.sha256(data).hexdigest()!=record['sha256']:raise RuntimeError('Public asset does not match the published build: '+record['path'])
     checked+=1
   print('Public version, entrypoint and',checked,'critical asset hashes verified:',release['version'],release['revision'])
 else:print('FTP upload completed. Set FTP_PUBLIC_URL to verify the public HTTPS site; Nginx must set the isolation headers in its server configuration.')
except Exception as error:
 ftp.close();print('FTP publication failed: '+str(error).replace(password,'[REDACTED]'),file=sys.stderr);raise SystemExit(1)
