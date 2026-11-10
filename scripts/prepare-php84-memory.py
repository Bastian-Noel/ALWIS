"""Apply the pinned ALWIS GPLv2 chunk-storage adapter to PHP 8.4.27.

Zend MM retains its allocator, accounting and memory_limit; only OS chunk
storage uses aligned malloc/free because browser munmap cannot split maps.
"""
import argparse
import hashlib
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[1]
BEFORE = '6c38e82da482a17c46f4f21de509f69d36424a6d9c05330b7b2e4ba7a6c6dc4b'
AFTER = 'd191d5bc5e43d8a2fd035a8feae3b1d2ec56a9c508835646f4c65b9f8fbc6316'
PATCH_SHA = 'd00cd3b859d15fc18aef5df8d172f0b2499332da0e81d8f0cf85fe7b937f21d7'
PATCH = ROOT / 'engine/patches/php-8.4.27-wasm-chunks.patch'


def prepare(target, *, verify_only=False):
    target = Path(target).resolve()
    if not target.is_relative_to((ROOT / 'build-work').resolve()):
        raise ValueError('PHP memory adapter requires a disposable build-work tree')
    patch = PATCH.read_bytes()
    if hashlib.sha256(patch).hexdigest() != PATCH_SHA:
        raise ValueError('PHP memory adapter patch hash mismatch')
    source = target / 'Zend/zend_alloc.c'
    digest = hashlib.sha256(source.read_bytes()).hexdigest()
    if digest == BEFORE and not verify_only:
        subprocess.run(['patch', '-d', str(target), '-p1', '--fuzz=0', '--batch', '--forward'],
                       input=patch, check=True, timeout=60, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        digest = hashlib.sha256(source.read_bytes()).hexdigest()
    if digest != AFTER:
        raise ValueError('PHP memory adapter source differs from pinned output')
    return {'adapter': 'ALWIS aligned chunk storage for Emscripten',
            'source': 'Zend/zend_alloc.c', 'beforeSha256': BEFORE,
            'afterSha256': AFTER, 'patchSha256': PATCH_SHA,
            'license': 'Original PHP under elected PHP License v4; ALWIS changes GPL-2.0-only'}


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('source', type=Path)
    parser.add_argument('--verify-only', action='store_true')
    args = parser.parse_args()
    import json
    print(json.dumps(prepare(args.source, verify_only=args.verify_only), indent=2))
