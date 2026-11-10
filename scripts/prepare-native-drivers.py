#!/usr/bin/env python3
"""Adapt pinned upstream CGI/PDO sources in a generated build directory only."""
from pathlib import Path
import hashlib,json,sys
if len(sys.argv) not in (4, 5) or (len(sys.argv) == 5 and sys.argv[4] != '--independent-runner'):
 raise SystemExit('Usage: prepare-native-drivers.py PHP_WRAPPER PHP_SOURCE OUTPUT [--independent-runner]')
independent_runner = len(sys.argv) == 5
php_wrapper,php_build,output=map(lambda p:Path(p).resolve(),sys.argv[1:4])
output.mkdir(parents=True,exist_ok=True)
manifest=[]
def write(name,source,changes,prefix=''):
 before=source.read_text();after=before
 for old,new in changes:
  if after.count(old)!=1:raise SystemExit('Upstream adapter anchor changed: '+name+' '+old[:60])
  after=after.replace(old,new)
 after=prefix+after
 target=output/name
 if not target.exists() or target.read_text()!=after:target.write_text(after)
 manifest.append({'source':str(source),'generated':name,'originalSha256':hashlib.sha256(before.encode()).hexdigest(),'generatedSha256':hashlib.sha256(after.encode()).hexdigest()})
if independent_runner:
 # Independent path uses ALWIS-authored SAPI, not JoomEngine's missing runtime.c.
 source = Path(__file__).resolve().parents[1] / 'packages/php-native/src/runner.c'
 write('runtime.c', source, [])
else:
 # Keep the exact historical adapter recipe as a separate, opt-out witness.
 write('runtime.c',php_wrapper/'native/runtime.c',[
  ('#include "php.h"', '#include "php.h"\n#include "pbl_mysql.h"'),
  ('static int startup(sapi_module_struct *module) { return php_module_startup(module, NULL); }','extern zend_module_entry pbl_native_module_entry;\nstatic int startup(sapi_module_struct *module) { return php_module_startup(module, &pbl_native_module_entry); }'),
  ('running = 1; body_offset = 0;','running = 1; body_offset = 0;\n    pbl_mysql_owner_begin();'),
  ('if (module_started) php_module_shutdown();','if (module_started) php_module_shutdown();\n    pbl_mysql_owner_cleanup(pbl_mysql_owner_current());'),
 ])
write('mysql_driver.c',php_build/'ext/pdo_mysql/mysql_driver.c',[
 ('#include "php.h"','#include "php.h"\n#include "pdo-adapter.h"'),
 ('H = pecalloc(1, sizeof(pdo_mysql_db_handle), dbh->is_persistent);','H = pecalloc(1, sizeof(pdo_mysql_db_handle), dbh->is_persistent);\n\tdbh->driver_data = H;'),
 ('if (!(H->server = pdo_mysql_init(dbh->is_persistent))) {\n\t\tpdo_mysql_error(dbh);','if (!(H->server = pdo_mysql_init(dbh->is_persistent))) {\n\t\tstrcpy(dbh->error_code, "HY000");\n\t\tzend_throw_exception(php_pdo_get_exception(), pbl_mysql_last_error(), 0);'),
])
write('mysql_statement.c',php_build/'ext/pdo_mysql/mysql_statement.c',[
 ('#include "php.h"','#include "php.h"\n#include "pdo-adapter.h"\n#include "pdo-values.h"'),
 ('#if MYSQL_VERSION_ID >= 50708 || defined(PDO_USE_MYSQLND)', '#if (MYSQL_VERSION_ID >= 50708 && !defined(MARIADB_BASE_VERSION)) || defined(PDO_USE_MYSQLND)'),
 ('ZVAL_STRINGL_FAST(result, S->bound_result[colno].buffer, length);', 'pbl_pdo_column(result, &S->fields[colno], S->bound_result[colno].buffer, length, stmt->dbh->stringify);'),
 ('ZVAL_STRINGL_FAST(result, S->current_data[colno], S->current_lengths[colno]);', 'pbl_pdo_column(result, &S->fields[colno], S->current_data[colno], S->current_lengths[colno], stmt->dbh->stringify);'),
])
for filename in ['pdo_mysql.c','mysql_sql_parser.c','php_pdo_mysql.h','pdo_mysql_arginfo.h']:
 source=php_build/'ext/pdo_mysql'/filename
 if source.exists():
  target=output/filename
  if not target.exists() or target.read_bytes()!=source.read_bytes():target.write_bytes(source.read_bytes())
header=php_build/'ext/pdo_mysql/php_pdo_mysql_int.h'
original=header.read_text()
updated=original.replace('zend_ulong\t\t\t*in_length;', 'unsigned long\t\t\t*in_length;').replace('zend_ulong\t\t\t\t*out_length;', 'unsigned long\t\t\t\t*out_length;')
if updated==original:raise SystemExit('PDO external length-type adapter anchor changed')
target=output/'php_pdo_mysql_int.h'
if not target.exists() or target.read_text()!=updated:target.write_text(updated)
manifest.append({'source':str(header),'generated':'php_pdo_mysql_int.h','originalSha256':hashlib.sha256(original.encode()).hexdigest(),'generatedSha256':hashlib.sha256(updated.encode()).hexdigest()})
(output/'driver-adapter.json').write_text(json.dumps(manifest,indent=2)+'\n')
