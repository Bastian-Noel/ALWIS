#!/usr/bin/env python3
"""Download pinned GitHub source snapshots, retaining notices and checksums.

No builds or third-party scripts are executed. Existing lock entries are reused.
Usage: python3 scripts/fetch-upstream.py [--refresh] [--verify-only]
"""
import concurrent.futures, datetime, hashlib, json, pathlib, shutil, subprocess, sys, tarfile

ROOT = pathlib.Path(__file__).resolve().parents[1]
REPOS = [
 'seanmorris/php-wasm', 'joomengine/php-wasm',
 'joomengine/mariadb-wasm-bridge', 'shyim/lite4mariadb',
 'WordPress/wordpress-playground', 'php/php-src',
 'emscripten-core/emscripten', 'zen-fs/core', 'zen-fs/dom',
 'zen-fs/emscripten', 'kachurun/opfs-worker', 'GoogleChromeLabs/comlink',
 'drawdb-io/drawdb', 'chartdb/chartdb', 'outerbase/studio',
 'xyflow/xyflow', 'codemirror/lang-sql',
]
LOCK = ROOT / 'provenance/upstream-lock.json'

def download(url, target):
    target.parent.mkdir(parents=True, exist_ok=True)
    tmp = target.with_suffix(target.suffix + '.part')
    subprocess.run(['curl','-fLsS','--retry','2','--connect-timeout','20','--max-time','420',url,'-o',str(tmp)], check=True)
    tmp.replace(target)

def digest(path):
    h = hashlib.sha256()
    with path.open('rb') as stream:
        for chunk in iter(lambda: stream.read(1024*1024), b''): h.update(chunk)
    return h.hexdigest()

def fetch(repo, old):
    key = repo.replace('/', '--')
    if old and '--refresh' not in sys.argv:
        entry = dict(old)
    else:
        meta = ROOT / 'provenance' / (key + '.commit.json')
        download('https://api.github.com/repos/' + repo + '/commits/HEAD', meta)
        data = json.loads(meta.read_text())
        entry = {'repo':repo, 'sha':data['sha'], 'commit_date':data['commit']['committer']['date']}
    archive = ROOT / 'sources' / (key + '-' + entry['sha'] + '.tar.gz')
    if not archive.exists(): download('https://codeload.github.com/' + repo + '/tar.gz/' + entry['sha'], archive)
    sha = digest(archive)
    if entry.get('archive_sha256') and sha != entry['archive_sha256']:
        raise RuntimeError('Archive checksum mismatch: ' + repo)
    target = ROOT / 'upstream' / key
    if not target.exists():
        staging = ROOT / 'upstream' / ('.extract-' + key)
        if staging.exists(): shutil.rmtree(staging)
        staging.mkdir(parents=True)
        with tarfile.open(archive) as source:
            source.extractall(staging, filter='data')
        children = list(staging.iterdir())
        if len(children) != 1 or not children[0].is_dir(): raise RuntimeError('Unexpected archive layout')
        children[0].rename(target)
        staging.rmdir()
    entry.update(archive=str(archive.relative_to(ROOT)), archive_sha256=sha,
                 archive_bytes=archive.stat().st_size, directory=str(target.relative_to(ROOT)),
                 source_url='https://github.com/'+repo+'/tree/'+entry['sha'], status='downloaded')
    print(repo + ' ' + entry['sha'][:12] + ' OK', flush=True)
    return entry

def main():
    previous = json.loads(LOCK.read_text()) if LOCK.exists() else {'repositories':[]}
    old = {e['repo']:e for e in previous['repositories']}
    if '--verify-only' in sys.argv:
        if set(old) != set(REPOS) or previous.get('errors'):
            raise SystemExit('Incomplete source lock; fetch sources first')
        for entry in previous['repositories']:
            assert digest(ROOT / entry['archive']) == entry['archive_sha256'], entry['repo']
        print(str(len(old)) + ' source archives verified')
        return
    entries, errors = [], []
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        jobs = {pool.submit(fetch, repo, old.get(repo)):repo for repo in REPOS}
        for job in concurrent.futures.as_completed(jobs):
            repo = jobs[job]
            try: entries.append(job.result())
            except Exception as exc:
                errors.append({'repo':repo,'error':str(exc)})
                print(repo + ' FAILED: ' + str(exc), flush=True)
    entries.sort(key=lambda e:REPOS.index(e['repo']))
    LOCK.write_text(json.dumps({'restored_on':datetime.datetime.now(datetime.timezone.utc).isoformat(),
                               'repositories':entries, 'errors':errors}, indent=2)+'\n')
    if errors: sys.exit(1)

if __name__ == '__main__': main()
