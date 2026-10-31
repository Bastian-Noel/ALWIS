#!/usr/bin/env python3
"""Inventory registered C APIs against the exact PHP version's stub; no runtime claims."""
from pathlib import Path
import re,json,hashlib
root=Path(__file__).resolve().parents[1]
stub=root/'build-work/php-minimal/ext/mysqli/mysqli.stub.php'
src=(root/'packages/php-native/src/mysqli.c').read_text();text=stub.read_text()
known=sorted(set(re.findall(r'^function (mysqli_\w+)\(',text,re.M)))
registered=set(re.findall(r'(?:PHP_FE|ZEND_FALIAS)\((mysqli_\w+),',src))
classes={}
clean=re.sub(r'/\*.*?\*/','',text,flags=re.S)
for match in re.finditer(r'\bclass (mysqli\w*)[^\{]*\{',clean):
 start=match.end();end=start;depth=1
 while depth:
  depth+=(clean[end]=='{')-(clean[end]=='}');end+=1
 name=match[1];methods=sorted(set(re.findall(r'function (\w+)\(',clean[start:end-1])))
 implemented=set(re.findall(r'(?:PHP_ME|ZEND_MALIAS)\('+re.escape(name)+r',(\w+),',src))
 classes[name]={'registered':[m for m in methods if m in implemented],'missing':[m for m in methods if m not in implemented]}
report={'phpVersion':'8.4.27','stubSha256':hashlib.sha256(stub.read_bytes()).hexdigest(),'meaning':'Registration inventory only. Registered does not mean full semantic compatibility. Aliases and constants need separate coverage.','procedural':{'total':len(known),'registered':[f for f in known if f in registered],'missing':[f for f in known if f not in registered]},'classes':classes}
p=root/'packages/php-native/compatibility-inventory.json';p.write_text(json.dumps(report,indent=2)+'\n')
print(f'{len(registered & set(known))}/{len(known)} procedural entry points registered; see {p.relative_to(root)}')
