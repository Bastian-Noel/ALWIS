#!/usr/bin/env python3
"""Reuse only a successful CI artifact from the exact main commit and verify its payload."""
import hashlib
import json
import os
import subprocess
from pathlib import Path

repo = os.environ["GH_REPO"]
sha = os.environ["SOURCE_SHA"]
if len(sha) != 40 or any(c not in "0123456789abcdef" for c in sha):
    raise SystemExit("Invalid source commit")
def gh(*args):
    return subprocess.check_output(["gh", *args], text=True).strip()
runs = json.loads(gh("api", f"repos/{repo}/actions/workflows/check.yml/runs?head_sha={sha}&per_page=30"))["workflow_runs"]
candidates = [
    r for r in runs if r["head_sha"] == sha
    and r["head_branch"] == "main" and r["conclusion"] == "success"
    and r["event"] in ("push", "workflow_dispatch")
    and r["path"] == ".github/workflows/check.yml"
]
if not candidates:
    raise SystemExit(f"No successful CI run for exact main revision {sha}. Run check.yml first.")
run = max(candidates, key=lambda r: r["created_at"])
artifacts = json.loads(gh("api", f"repos/{repo}/actions/runs/{run['id']}/artifacts?per_page=100"))["artifacts"]
expected = "studio-static-" + sha
if not any(a["name"] == expected and not a["expired"] for a in artifacts):
    raise SystemExit(f"CI run {run['id']} lacks unexpired {expected}. Re-run CI for this commit.")
root = Path("build-work/site")
root.mkdir(parents=True, exist_ok=True)
subprocess.run(["gh", "run", "download", str(run["id"]), "--repo", repo, "--name", expected, "--dir", str(root)], check=True)
manifest = json.loads((root / "release.json").read_text())
package = json.loads(Path("package.json").read_text())
if manifest.get("revision") != sha or manifest.get("version") != package["version"] or manifest.get("workingChanges"):
    raise SystemExit("Artifact revision/version/clean-source verification failed")
for record in manifest["files"]:
    path = Path(record["path"])
    if path.is_absolute() or ".." in path.parts or not (root / path).is_file():
        raise SystemExit("Invalid artifact file: " + str(path))
    contents = (root / path).read_bytes()
    if len(contents) != record["bytes"] or hashlib.sha256(contents).hexdigest() != record["sha256"]:
        raise SystemExit("Invalid artifact checksum: " + str(path))
print(f"Reused verified CI run {run['id']}: {sha}, {len(manifest['files'])} files")
if os.environ.get("GITHUB_STEP_SUMMARY"):
    with open(os.environ["GITHUB_STEP_SUMMARY"], "a") as summary:
        summary.write(f"Reused successful [CI run {run['id']}](https://github.com/{repo}/actions/runs/{run['id']}) for commit `{sha}` without rebuilding.\n")
