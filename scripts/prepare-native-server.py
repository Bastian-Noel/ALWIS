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
    (char *)"--max-prepared-stmt-count=128",
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
# Install official system-table definitions lazily: routines require mysql.proc.
bootstrap=(source.parent.parent/'scripts/mariadb_system_tables.sql').read_text()
bootstrap='CREATE DATABASE IF NOT EXISTS mysql;\nUSE mysql;\n'+bootstrap
bootstrap_file=output/'system-tables.sql'
if not bootstrap_file.exists() or bootstrap_file.read_text()!=bootstrap:bootstrap_file.write_text(bootstrap)
installer=r'''
static int pbl_install_system_tables(MYSQL *mysql)
{
  if (mysql_query(mysql,"SELECT 1 FROM mysql.proc LIMIT 0")==0) {
    MYSQL_RES *result=mysql_store_result(mysql); if(result)mysql_free_result(result); return 0;
  }
  if (mysql_errno(mysql)!=1146) return 1;
  FILE *file=fopen("/mariadb/share/pbl-system-tables.sql","rb");
  if(!file) return 1;
  if(fseek(file,0,SEEK_END)!=0){fclose(file);return 1;}
  long size=ftell(file);if(size<=0||size>1024*1024||fseek(file,0,SEEK_SET)!=0){fclose(file);return 1;}
  char *sql=malloc((size_t)size+1);if(!sql){fclose(file);return 1;}
  size_t read=fread(sql,1,size,file);int closed=fclose(file);if(read!=(size_t)size||closed){free(sql);return 1;}sql[size]=0;
  int status=mysql_real_query(mysql,sql,size);free(sql);
  while(!status){
    MYSQL_RES *result=mysql_store_result(mysql);
    if(result)mysql_free_result(result);else if(mysql_field_count(mysql)){status=1;break;}
    int next=mysql_next_result(mysql);if(next<0)break;if(next>0){status=1;break;}
  }
  if(status)fprintf(stderr,"System-table initialization failed: %s\n",mysql_error(mysql));
  return status;
}
'''
anchor='int l4m_open(void)'
assert after.count(anchor)==1
after=after.replace(anchor,installer+'\n'+anchor)
anchor='  /* JS strings are UTF-8; keep the connection charset aligned. */'
assert after.count(anchor)==1
after=after.replace(anchor,'''  if(pbl_install_system_tables(g_mysql)) {
    mysql_close(g_mysql);g_mysql=NULL;mysql_server_end();return 1;
  }
'''+anchor)
if p.read_text()!=after:p.write_text(after)
(output/'server-adapter.json').write_text(json.dumps({'source':str(source),'originalSha256':hashlib.sha256(before.encode()).hexdigest(),'generatedSha256':hashlib.sha256(after.encode()).hexdigest(),'changes':changes,'systemTablesSource':str(source.parent.parent/'scripts/mariadb_system_tables.sql'),'systemTablesSourceSha256':hashlib.sha256((source.parent.parent/'scripts/mariadb_system_tables.sql').read_bytes()).hexdigest(),'systemTablesGeneratedSha256':hashlib.sha256(bootstrap.encode()).hexdigest()},indent=2)+'\n')
