#!/usr/bin/env python3
"""Stage pinned PHP 8.4.27 and ALWIS-reviewed Sean Morris Zend fiber port.

The upstream php-wasm patch is dual licensed for covered code (GPL-2.0
option). This adapted fiber-only diff deliberately excludes unrelated
third-party changes. This is source preparation, not a linked WASM.
"""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[1]
ARCHIVE = ROOT/'build-work/source-archives/php-8.4.27.tar.xz'
ARCHIVE_SHA = 'dcf93923b0e38e0d5252b25b796520b5a47761a08b3488b6d0b5d1115764d3f0'
SEAN_ARCHIVE = ROOT/'sources/seanmorris--php-wasm-1e1fb6703730759181e84c62bce35ee9129febb9.tar.gz'
SEAN_SHA = 'dfe4d54bf3a66a0a7b564904d06cf49327b74b3545965c9e18bd0ea83fc67421'
BASE_ZEND_SHA = '84ff0df942a2bdb295c647f80dd8fae41da65ca588927c0b8a417a68672177af'
PATCHED_ZEND_SHA = 'daeaf8150587f62c45c4e90cce87030f237ef1fe9eedc4e50395d90278370c15'
PATCH = ROOT/'engine/patches/php-8.4.27-zend-fibers.patch'
PATCH_SHA = '7133c4f7f9a2298888a7091056fb1d5670a0a39b8506398ba013e6e76abfd12b'
ZEND = 'Zend/zend_fibers.c'
RECEIPT_NAME = 'alwis-php84-fibers.json'


def checksum(path):
    h=hashlib.sha256()
    with Path(path).open('rb') as file:
        for part in iter(lambda:file.read(1024*1024),b''): h.update(part)
    return h.hexdigest()


def verify_pins():
    for file, expected in ((ARCHIVE,ARCHIVE_SHA),(SEAN_ARCHIVE,SEAN_SHA),(PATCH,PATCH_SHA)):
        if not file.is_file() or checksum(file)!=expected:
            raise ValueError('PHP 8.4 source/fiber upstream pin missing or changed: '+str(file))
    patch=PATCH.read_text()
    if patch.count('diff --git ' )!=1 or 'Zend/zend_fibers.c' not in patch or 'ext/' in patch:
        raise ValueError('Unexpected PHP fiber patch scope')


def prepare(target, *, verify_only=False):
    verify_pins()
    target=Path(target).resolve()
    if not str(target).startswith(str((ROOT/'build-work').resolve())+'/'):
        raise ValueError('PHP native sources must be staged only in disposable build-work/')
    receipt_file=target/RECEIPT_NAME
    if target.exists():
        if not receipt_file.is_file(): raise ValueError('Refusing an unverified or partially patched PHP source tree')
        record=json.loads(receipt_file.read_text())
        if record.get('phpVersion')!='8.4.27' or record.get('archiveSha256')!=ARCHIVE_SHA or record.get('fiberPatchSha256')!=PATCH_SHA or record.get('upstreamArchiveSha256')!=SEAN_SHA or record.get('zendBeforeSha256')!=BASE_ZEND_SHA or record.get('zendAfterSha256')!=PATCHED_ZEND_SHA or checksum(target/ZEND)!=PATCHED_ZEND_SHA:
            raise ValueError('PHP source receipt does not match current tree')
        return record
    if verify_only: raise ValueError('PHP 8.4.27 source tree not yet prepared')
    target.mkdir(parents=True)
    subprocess.run(['tar','-xJf',str(ARCHIVE),'-C',str(target),'--strip-components=1','--no-same-owner','--no-same-permissions'],check=True,timeout=120)
    before=checksum(target/ZEND)
    if before!=BASE_ZEND_SHA:
        raise ValueError('Zend 8.4.27 upstream source hash changed before applying fiber adapter')
    subprocess.run(['patch','-d',str(target),'-p3','--fuzz=0','--batch','--forward'],input=PATCH.read_bytes(),check=True,timeout=60,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
    after=checksum(target/ZEND)
    if after!=PATCHED_ZEND_SHA: raise ValueError('PHP 8.4.27 fiber patch output differs from pinned candidate')
    record={'schemaVersion':1,'status':'source-prepared-only','phpVersion':'8.4.27',
            'archiveSha256':ARCHIVE_SHA,'upstream':'seanmorris/php-wasm@1e1fb6703730759181e84c62bce35ee9129febb9',
            'upstreamArchiveSha256':SEAN_SHA,'fiberPatch':'engine/patches/php-8.4.27-zend-fibers.patch',
            'fiberPatchSha256':PATCH_SHA,'zendBeforeSha256':before,'zendAfterSha256':after,
            'patchLicenseOption':'GPL-2.0-only for Sean Morris covered source',
            'runtimeCompiled':False,'browserValidated':False}
    receipt_file.write_text(json.dumps(record,indent=2)+'\n')
    return record


if __name__=='__main__':
    p=argparse.ArgumentParser()
    p.add_argument('--output',type=Path,default=ROOT/'build-work/php-minimal')
    p.add_argument('--verify-only',action='store_true')
    args=p.parse_args()
    print(json.dumps(prepare(args.output,verify_only=args.verify_only),indent=2))
