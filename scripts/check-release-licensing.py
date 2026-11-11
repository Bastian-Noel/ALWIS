#!/usr/bin/env python3
"""Fail before publication work when the exact source is not legally releasable."""
import json
import os
import re
from pathlib import Path

tag = os.environ.get("RELEASE_TAG", "")
version = json.loads(Path("package.json").read_text())["version"]
if not re.fullmatch(r"v(?:20\d{2})\.(?:0[1-9]|1[0-2])\.\d+-(?:alpha|beta|rc)\.\d+|v(?:20\d{2})\.(?:0[1-9]|1[0-2])\.\d+", tag):
    raise SystemExit("Invalid release tag: expected vYYYY.MM.PATCH-(alpha|beta|rc).N or vYYYY.MM.PATCH")
if tag != "v" + version:
    raise SystemExit(f"Release tag {tag} does not match package.json version {version}")
record = json.loads(Path("provenance/release-licensing-status.json").read_text())
from publication_policy import require_publication
try:
    require_publication(record, version=version)
except ValueError as error:
    raise SystemExit(str(error))
print(f"Publication preflight passed for {tag}; recorded exceptions remain disclosed.")
