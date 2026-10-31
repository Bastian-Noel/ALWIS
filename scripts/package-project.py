#!/usr/bin/env python3
"""Package the small preparation and exact upstream archives separately."""
import hashlib, json, pathlib, zipfile
ROOT=pathlib.Path(__file__).resolve().parents[1]
OUT=ROOT/'deliverables'; OUT.mkdir(exist_ok=True)
locks=[json.loads((ROOT/'provenance/upstream-lock.json').read_text()),json.loads((ROOT/'provenance/submodules-lock.json').read_text())]
entries=locks[0]['repositories']+locks[1]['downloaded']
project=OUT/'php-browser-lab-preparation.zip'
with zipfile.ZipFile(project,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=6) as z:
    for path in sorted(ROOT.rglob('*')):
        rel=path.relative_to(ROOT)
        if rel.parts[0] in {'upstream','sources','build-work','deliverables','.git','node_modules'} or '__pycache__' in rel.parts: continue
        if path.is_file() and path.name not in {'lite4mariadb-tree.json','sources.zip','SHA256SUMS'}: z.write(path,'php-browser-lab/'+str(rel))
source=OUT/'php-browser-lab-sources.zip'
with zipfile.ZipFile(source,'w',compression=zipfile.ZIP_STORED,allowZip64=True) as z:
    for e in entries:z.write(ROOT/e['archive'],'php-browser-lab/'+e['archive'])
    for name in ['upstream-lock.json','submodules-lock.json','lite4mariadb-gitlinks.json']:
        z.write(ROOT/'provenance'/name,'php-browser-lab/provenance/'+name)
    z.writestr('php-browser-lab/SOURCES-RESTORE.md',
      '# Restaurer les sources\n\nExtraire ce ZIP au même endroit que php-browser-lab-preparation.zip. Depuis php-browser-lab, lancer python3 scripts/fetch-upstream.py puis python3 scripts/fetch-native-deps.py. Les archives déjà présentes seront vérifiées puis extraites dans upstream/.\n\n19 archives : 17 dépôts principaux et 2 sous-modules MariaDB. Notices amont conservées. Aucun SDK ni node_modules fourni.\n')
for path in [project,source]:
    with zipfile.ZipFile(path) as z:
        assert z.testzip() is None
    h=hashlib.sha256()
    with path.open('rb') as f:
        for c in iter(lambda:f.read(1024*1024),b''):h.update(c)
    print(json.dumps({'file':str(path),'bytes':path.stat().st_size,'sha256':h.hexdigest()}))
