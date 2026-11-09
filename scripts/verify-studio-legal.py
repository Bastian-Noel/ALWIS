#!/usr/bin/env python3
"""Verify distribution-facing notices AND their exact release.json file hashes."""
import hashlib
import json
import sys
from pathlib import Path

site = Path(sys.argv[1] if len(sys.argv) > 1 else "build-work/site")
root = Path(__file__).resolve().parents[1]
manifest = json.loads((site / "release.json").read_text())
records = {r["path"]: r for r in manifest["files"]}
mandatory = [
    "LICENSE.md",
    "NOTICE.md",
    "THIRD-PARTY-NOTICES.md",
    "RELEASE-LICENSING-STATUS.json",
    "LICENSES/README.md",
    "LICENSES/PolyForm-Noncommercial-1.0.0.txt",
    "LICENSES/seanmorris-php-wasm-NOTICE.txt",
    "LICENSES/GPL-2.0-only.txt",
    "LICENSES/PHP-License-v4.txt",
    "LICENSES/wolfSSL-LICENSING.txt",
    "LICENSES/Apache-2.0.txt",
    "LICENSES/LGPL-2.1-or-later.txt",
    f'{manifest["assetBase"].removeprefix("/")}/apps/studio/editor/dist/THIRD-PARTY.txt',
]
for name in mandatory:
    record = records.get(name)
    if not record:
        raise SystemExit("Required distribution notice not in release manifest: " + name)
    path = site / name
    if not path.is_file():
        raise SystemExit("Required distribution notice missing: " + name)
    data = path.read_bytes()
    if len(data) != record["bytes"] or hashlib.sha256(data).hexdigest() != record["sha256"]:
        raise SystemExit("Distribution notice checksum mismatch: " + name)

required = "Required Notice: ALWIS"
for name in ("NOTICE.md", "LICENSE.md"):
    if required not in (site / name).read_text():
        raise SystemExit(f"Author attribution missing in {name}")
for name in ("LICENSE.md", "NOTICE.md", "THIRD-PARTY-NOTICES.md"):
    if (site / name).read_bytes() != (root / name).read_bytes():
        raise SystemExit(f"Distributed license differs from repository: {name}")
if (site / "RELEASE-LICENSING-STATUS.json").read_bytes() != (
    root / "provenance/release-licensing-status.json"
).read_bytes():
    raise SystemExit("Distributed licensing status differs from repository")
for record in manifest["files"]:
    if record["path"].startswith("LICENSES/"):
        path = site / record["path"]
        original = root / record["path"]
        if not original.is_file() or path.read_bytes() != original.read_bytes():
            raise SystemExit("License source copy mismatch: " + record["path"])
print(f"Verified {len(mandatory)} mandatory license and notice assets for {manifest['revision']}")
