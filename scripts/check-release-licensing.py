#!/usr/bin/env python3
"""Fail before publication work when the exact source is not legally releasable."""
import json
import os
import re
from pathlib import Path

tag = os.environ.get("RELEASE_TAG", "")
version = json.loads(Path("package.json").read_text())["version"]
if not re.fullmatch(r"v\d+\.\d+\.\d+(?:-(?:alpha|beta|rc|preview)\.\d+)?", tag):
    raise SystemExit("Invalid release tag: expected vX.Y.Z[-preview.N]")
if tag != "v" + version:
    raise SystemExit(f"Release tag {tag} does not match package.json version {version}")
record = json.loads(Path("provenance/release-licensing-status.json").read_text())
if record.get("status") != "ready" or record.get("blockers"):
    blockers = record.get("blockers") or []
    print("::error title=Publication blocked by license review::The build and tests can run, but no static, FTP or Docker distribution is authorized.")
    for item in blockers:
        print("::error title=License blocker::" + item.get("id", "unknown") + ": " + item.get("summary", ""))
    if os.environ.get("GITHUB_STEP_SUMMARY"):
        with open(os.environ["GITHUB_STEP_SUMMARY"], "a") as summary:
            summary.write("### Publication blocked — licensing review\n\nThe CI build is independent of the release authorization. Resolve these before publishing:\n\n")
            for item in blockers:
                summary.write(f"- **{item.get('id','unknown')}**: {item.get('summary','')}\n")
    raise SystemExit("Release blocked by provenance/release-licensing-status.json (not a build failure).")
print(f"Licensing preflight passed for {tag}")
