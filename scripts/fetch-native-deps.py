#!/usr/bin/env python3
"""Fetch two build submodules at the gitlink SHAs of the locked MariaDB tree.
Other modules remain inventoried but are disabled by the small-engine profile.
"""
import configparser, json, pathlib, runpy, sys
ctx = runpy.run_path(str(pathlib.Path(__file__).with_name('fetch-upstream.py')))
ROOT, fetch = ctx['ROOT'], ctx['fetch']
tree = json.loads((ROOT/'provenance/lite4mariadb-gitlinks.json').read_text())
assert not tree.get('truncated'), 'GitHub tree truncated: resolve gitlinks individually'
pins = {e['path']:e['sha'] for e in tree['tree'] if e['mode']=='160000'}
parent = next(e for e in json.loads((ROOT/'provenance/upstream-lock.json').read_text())['repositories'] if e['repo']=='shyim/lite4mariadb')
assert tree['sha']==parent['sha'], 'Refresh gitlinks after changing the MariaDB source commit'
config = configparser.ConfigParser()
config.read(ROOT/'upstream/shyim--lite4mariadb/.gitmodules')
oldpath = ROOT/'provenance/submodules-lock.json'
old = json.loads(oldpath.read_text()) if oldpath.exists() else {'downloaded':[]}
prior = {e['repo']:e for e in old['downloaded']}
inventory=[]; downloaded=[]
for section in config.sections():
    path=config[section]['path']; url=config[section]['url']
    row={'path':path,'url':url,'sha':pins[path], 'downloaded':path in ['libmariadb','extra/wolfssl/wolfssl']}
    inventory.append(row)
    if row['downloaded']:
        repo=url.removeprefix('https://github.com/').removesuffix('.git')
        entry=fetch(repo, prior.get(repo, {'repo':repo,'sha':row['sha']}))
        assert entry['sha']==row['sha']
        entry['mount_path']=path
        downloaded.append(entry)
oldpath.write_text(json.dumps({'parent':'shyim/lite4mariadb','gitlinks':inventory,'downloaded':downloaded},indent=2)+'\n')
print('2 required submodule snapshots downloaded; remaining optional engine modules not fetched')
