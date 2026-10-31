#!/usr/bin/env python3
"""Bound the pinned embedded result allocator before accumulating whole results.
Generated copy only: preserve the upstream source and separate baseline binaries.
"""
from pathlib import Path
import hashlib,json,sys
source,output=map(Path,sys.argv[1:]);before=source.read_text();after=before
helper='''/* WASM prototype result budget: conservative MEM_ROOT block forecast.
 * This matches the pinned my_alloc.c (256-byte blocks, <=16-byte alignment).
 * It bounds collected result blocks, not every server working allocation.
 */
static bool pbl_result_room(MEM_ROOT *root, size_t length)
{
  const size_t limit=16U*1024U*1024U;
  if (length>limit) return false;
  const size_t aligned=MY_ALIGN(length,16)+64;
  size_t allocated=0; bool fits=false;
  for (USED_MEM *block=root->free;block;block=block->next) {
    if (block->size>limit-allocated) return false;
    allocated+=block->size; if (block->left>=aligned) fits=true;
  }
  for (USED_MEM *block=root->used;block;block=block->next) {
    if (block->size>limit-allocated) return false;
    allocated+=block->size;
  }
  if (fits) return true;
  const size_t block_size=MY_ALIGN(root->block_size,256);
  const size_t factor=root->block_num>>2;
  if (block_size && factor>limit/block_size) return false;
  const size_t request=MY_MAX(aligned+MY_ALIGN(sizeof(USED_MEM),16),block_size*factor)+4096;
  return request<=limit-allocated;
}
static bool pbl_result_limit_error()
{
  my_printf_error(ER_OUT_OF_RESOURCES,"WASM result exceeds 16 MiB or 10000 row budget",MYF(0));
  return true;
}

'''
changes=[
('#include "../sql/mysqld.cc"', '#include '+json.dumps(str((source.parent/'../sql/mysqld.cc').resolve()))),
('bool Protocol::write()\n{',helper+'bool Protocol::write()\n{'),
('  *next_field= 0;\n  return false;', '  if (thd->cur_data && thd->cur_data->rows>10000) return pbl_result_limit_error();\n  *next_field= 0;\n  return false;'),
('  data->rows++;\n  if (!(cur= (MYSQL_ROWS *)alloc_root(alloc,\n                                      sizeof(MYSQL_ROWS)+packet->length())))', '  if (data->rows>=10000 || !pbl_result_room(alloc,sizeof(MYSQL_ROWS)+packet->length())) return pbl_result_limit_error();\n  data->rows++;\n  if (!(cur= (MYSQL_ROWS *)alloc_root(alloc,\n                                      sizeof(MYSQL_ROWS)+packet->length())))'),
('  if (!(field_buf= (char*) alloc_root(alloc, length + sizeof(uint) + 1)))', '  if (thd->cur_data->rows>10000 || !pbl_result_room(alloc,length+sizeof(uint)+1)) return pbl_result_limit_error();\n  if (!(field_buf= (char*) alloc_root(alloc, length + sizeof(uint) + 1)))'),
('  if (!(field_buf= (char*) alloc_root(alloc, conv_length + sizeof(uint) + 1)))', '  if (thd->cur_data->rows>10000 || !pbl_result_room(alloc,conv_length+sizeof(uint)+1)) return pbl_result_limit_error();\n  if (!(field_buf= (char*) alloc_root(alloc, conv_length + sizeof(uint) + 1)))')
]
for old,new in changes:
 if after.count(old)!=1:raise SystemExit('Embedded result adapter anchor changed: '+old[:100])
 after=after.replace(old,new)
output.mkdir(parents=True,exist_ok=True);p=output/'lib_sql_budget.cc'
if not p.exists() or p.read_text()!=after:p.write_text(after)
(output/'result-budget-adapter.json').write_text(json.dumps({'source':str(source),'originalSha256':hashlib.sha256(before.encode()).hexdigest(),'generatedSha256':hashlib.sha256(after.encode()).hexdigest(),'resultBlockBudgetBytes':16*1024*1024,'rowBudget':10000},indent=2)+'\n')
