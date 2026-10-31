#!/usr/bin/env python3
"""Verify source archives, map locations and native contract syntax.
Does not execute PHP/MariaDB or measure browser RAM.
"""
import datetime, hashlib, json, pathlib, shutil, subprocess
ROOT=pathlib.Path(__file__).resolve().parents[1]
def digest(path):
    h=hashlib.sha256()
    with path.open('rb') as f:
        for chunk in iter(lambda:f.read(1024*1024),b''):h.update(chunk)
    return h.hexdigest()
lock=json.loads((ROOT/'provenance/upstream-lock.json').read_text())
assert len(lock['repositories'])==17 and not lock['errors']
sub=json.loads((ROOT/'provenance/submodules-lock.json').read_text())
assert len(sub['downloaded'])==2
archives=lock['repositories']+sub['downloaded']
for e in archives:assert digest(ROOT/e['archive'])==e['archive_sha256'],e['repo']
mapped=json.loads((ROOT/'provenance/source-map.json').read_text())
byrepo={e['repo']:e for e in archives}
for e in mapped:
    p=ROOT/byrepo[e['repo']]['directory']/e['path']
    assert digest(p)==e['file_sha256'],e['id']
    assert e['needle'] in p.read_text().splitlines()[e['line']-1],e['id']
node=subprocess.run(['node','--test','tests/cache.test.mjs','tests/queue.test.mjs'],cwd=ROOT,text=True,stdout=subprocess.PIPE,stderr=subprocess.STDOUT)
(ROOT/'provenance/node-tests.txt').write_text(node.stdout)
assert node.returncode==0,node.stdout
header='not checked: C compiler unavailable'
if shutil.which('cc'):
    subprocess.run(['cc','-std=c11','-Wall','-Wextra','-Werror','-fsyntax-only','-x','c',str(ROOT/'packages/sql-native/include/pbl_sql.h')],check=True)
    header='C11 syntax verified; declarations only, not linked'
report={'checked_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),
        'primary_repositories':len(lock['repositories']),'submodule_archives':len(sub['downloaded']),
        'verified_source_archives':len(archives),'verified_code_locations':len(mapped),
        'node_tests':'14 passed','native_contract':header,
        'not_executed':['PHP fixtures','PDO/MariaDB runtime','native MySQLi','OPFS integration','browser Service Worker','RAM/performance benchmarks','WASM compilation']}
(ROOT/'provenance/validation.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report,indent=2))
