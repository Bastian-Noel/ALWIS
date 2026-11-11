"""Exact ALWIS-owned SAPI source / generated C correspondence for candidate WASM.

Source receipts are not evidence of a completed Emscripten build or of rights to
redistribute. The complete native release gate runs separately.
"""
import hashlib
import json
from pathlib import Path

RUNNER_PATH = Path('packages/php-native/src/runner.c')
GENERATED_PATH = Path('build-work/bridge/.native-build/engine/wasm/pbl-native-sources')


def sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def verify(root, generated_dir=None):
    root = Path(root).resolve()
    generated = Path(generated_dir).resolve() if generated_dir else root / GENERATED_PATH
    runner = root / RUNNER_PATH
    target = generated / 'runtime.c'
    receipt = generated / 'driver-adapter.json'
    if not all(p.is_file() and not p.is_symlink() for p in (runner, target, receipt)):
        raise ValueError('Independent ALWIS runner or generated sources missing')
    records = json.loads(receipt.read_text())
    if not isinstance(records, list):
        raise ValueError('Invalid native driver source receipt')
    matches = [row for row in records if row.get('generated') == 'runtime.c']
    if len(matches) != 1:
        raise ValueError('Independent native SAPI source is not identified exactly once')
    row = matches[0]
    expected = sha256(runner)
    if row.get('source') != str(runner) or row.get('originalSha256') != expected or row.get('generatedSha256') != expected or sha256(target) != expected:
        raise ValueError('Generated PHP runner does not exactly match independent ALWIS SAPI source')
    copied = []
    for file in sorted(generated.rglob('*')):
        if file.is_symlink():
            raise ValueError('Symlink in generated native source tree')
        if file.is_file():
            if file.stat().st_size > 16 * 1024 * 1024:
                raise ValueError('Unexpected large generated native source')
            copied.append({'name': file.relative_to(generated).as_posix(), 'sha256': sha256(file), 'bytes': file.stat().st_size})
    return {'runner': RUNNER_PATH.as_posix(), 'sourceSha256': expected,
            'generatedSourceDirectory': GENERATED_PATH.as_posix(),
            'driverReceiptSha256': sha256(receipt), 'generatedFiles': copied}
