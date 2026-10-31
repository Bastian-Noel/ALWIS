#!/usr/bin/env python3
"""Generate a small embedded-server profile without modifying pinned upstream files."""
from pathlib import Path
import hashlib,json,sys
source,output=map(Path,sys.argv[1:])
before=source.read_text();after=before
changes={
'--innodb-buffer-pool-size=64M':'--innodb-buffer-pool-size=16M',
'--loose-innodb-buffer-pool-size-max=256M':'--loose-innodb-buffer-pool-size-max=16M',
'--max-allowed-packet=128M':'--max-allowed-packet=16M',
'(char *)"--innodb-log-buffer-size=2M",':'''(char *)"--innodb-log-buffer-size=2M",
    (char *)"--innodb-log-file-size=8M",
    (char *)"--aria-pagecache-buffer-size=1M",
    (char *)"--key-buffer-size=1M",
    (char *)"--query-cache-size=0",
    (char *)"--tmp-table-size=4M",
    (char *)"--max-heap-table-size=4M",
    (char *)"--sort-buffer-size=256K",
    (char *)"--join-buffer-size=256K",
    (char *)"--read-buffer-size=128K",
    (char *)"--read-rnd-buffer-size=256K",'''
}
for old,new in changes.items():
 if after.count(old)!=1:raise SystemExit('Server profile anchor changed: '+old)
 after=after.replace(old,new)
output.mkdir(parents=True,exist_ok=True)
p=output/'lite4mariadb.c'
if not p.exists() or p.read_text()!=after:p.write_text(after)
(output/'server-adapter.json').write_text(json.dumps({'source':str(source),'originalSha256':hashlib.sha256(before.encode()).hexdigest(),'generatedSha256':hashlib.sha256(after.encode()).hexdigest(),'changes':changes},indent=2)+'\n')
