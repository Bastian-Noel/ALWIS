#!/usr/bin/env python3
"""Create a traced diagnostic copy; never modify original runtimes or WASM bytes.
Usage: python3 scripts/prepare-baseline-diagnostics.py PINNED_PHP_CHECKOUT OUTPUT
The source checkout must already contain verified engine assets and the prepared bridge.
"""
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import sys

source, target = map(lambda p: Path(p).resolve(), sys.argv[1:])
commit = subprocess.check_output(['git', '-C', str(source), 'rev-parse', 'HEAD'], text=True).strip()
if commit != '3b8cef42c020fbcbb6b41fad86716b7c8664b55b':
    raise SystemExit('Diagnostic adapter requires the pinned JoomEngine source commit')
if target.exists():
    raise SystemExit('Output must not exist; preserve previous diagnostic copies and receipts')
if target == source or source in target.parents:
    raise SystemExit('Output must be outside the source checkout')
shutil.copytree(source, target, ignore=shutil.ignore_patterns('.git', '.build', 'node_modules'))
bridge = Path('.build/mariadb-bridge')
shutil.copytree(source / bridge, target / bridge)
(target / 'node_modules').symlink_to(source / 'node_modules', target_is_directory=True)
patches = []

def patch(relative, old, new):
    p = target / relative
    before = p.read_bytes()
    text = before.decode()
    if text.count(old) != 1:
        raise SystemExit('Diagnostic adapter anchor changed: ' + str(relative))
    after = text.replace(old, new).encode()
    p.write_bytes(after)
    patches.append({'file': str(relative), 'originalSha256': hashlib.sha256(before).hexdigest(),
                    'diagnosticSha256': hashlib.sha256(after).hexdigest()})

patch(Path('src/index.mjs'), '  async flush() {',
      "  async diagnostics() { return this.#enqueue('diagnostics', {}); }\n  async flush() {")
patch(Path('src/worker.mjs'), "        case 'flush':",
      "        case 'diagnostics': value = { linearMemoryBytes: engine.module.HEAPU8.buffer.byteLength }; break;\n        case 'flush':")
patch(bridge / 'src/index.mjs', '  async flush() {',
      "  async diagnostics() { return this.#enqueue('diagnostics', {}, 0); }\n  async flush() {")
patch(bridge / 'src/worker.mjs', "        case 'flush':",
      "        case 'diagnostics': value = engine.diagnostics(); break;\n        case 'flush':")
patch(bridge / 'src/engine.mjs', '    query,',
      '    query,\n    diagnostics() { requireOpen(); return { linearMemoryBytes: database.mod.__pblDiagnosticLinearMemoryBytes() }; },')
patch(bridge / 'vendor/lite4mariadb/lite4mariadb.js', ';return Module}export default',
      ';Module.__pblDiagnosticLinearMemoryBytes=()=>HEAPU8.buffer.byteLength;return Module}export default')
manifest = {'sourceCommit': commit, 'purpose': 'Current worker-local linear memory size, not resident RAM or allocation usage/peak',
            'patches': patches, 'wasm': []}
for relative in [Path('dist/php/8.4/php.wasm'), bridge / 'vendor/lite4mariadb/lite4mariadb.wasm']:
    original, copied = (source / relative).read_bytes(), (target / relative).read_bytes()
    assert original == copied, 'WASM binary was modified'
    manifest['wasm'].append({'file': str(relative), 'sha256': hashlib.sha256(copied).hexdigest()})
(target / 'diagnostic-adapter.json').write_text(json.dumps(manifest, indent=2) + '\n')
print(target / 'diagnostic-adapter.json')
