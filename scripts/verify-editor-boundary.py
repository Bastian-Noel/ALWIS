#!/usr/bin/env python3
"""Protect the analyzed editor/native packaging boundary; not a legal opinion."""
import json
import sys
from pathlib import Path

root = Path(__file__).resolve().parents[1]
site = Path(sys.argv[1] if len(sys.argv) > 1 else root / "build-work/site")
cmake = (root / "engine/native/build/runtime-target.cmake").read_text()
build_editor = (root / "scripts/build-editor.mjs").read_text()
worker = (root / "apps/studio/editor/javascript-worker.mjs").read_text()
package = (root / "scripts/package-studio.mjs").read_text()
native_sources = cmake.split("add_executable(pbl-runtime", 1)
if len(native_sources) != 2:
    raise SystemExit("pbl-runtime target changed")
native_sources = native_sources[1].split("target_compile_definitions", 1)[0]
for forbidden in ("typescript", "swc.wasm", "codemirror", "javascript-worker", "editor/dist"):
    if forbidden in native_sources.lower():
        raise SystemExit("Editor asset found in native executable dependency list: " + forbidden)
for required in ("import ts from \"typescript\"", "from \"@swc/wasm-web\"", 'new URL("./swc.wasm"'):
    if required not in worker:
        raise SystemExit("Editor JS module boundary changed: " + required)
for required in ("bundle:true", "swc.wasm", "javascript-worker.mjs"):
    if required not in build_editor:
        raise SystemExit("Editor bundle boundary changed: " + required)
if "'apps/studio/editor/dist/'+name" not in package or "await copy('build-work/bridge/.native-build/engine/wasm/runtime-dist/'+name,'engine/'+name)" not in package:
    raise SystemExit("Static package boundary changed")
if site.is_dir():
    manifest = json.loads((site / "release.json").read_text())
    files = {f["path"] for f in manifest["files"]}
    base = manifest["assetBase"].lstrip("/")
    expected = [
        f"{base}/engine/pbl-runtime.wasm",
        f"{base}/engine/pbl-runtime.mjs",
        f"{base}/apps/studio/editor/dist/javascript-worker.mjs",
        f"{base}/apps/studio/editor/dist/swc.wasm",
        f"{base}/apps/studio/editor/dist/THIRD-PARTY.txt",
    ]
    for path in expected:
        if path not in files or not (site / path).is_file():
            raise SystemExit("Missing separate editor/native artifact: " + path)
print("Editor/native build and distribution boundary checked")
