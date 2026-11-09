#!/usr/bin/env python3
"""Reproducible similarity triage for cited upstream source files.

The token-shingle check identifies identical spans; it cannot prove absence of
derivative code, translations, partial rewrites or copied non-code assets.
"""
import argparse
import hashlib
import json
import re
import urllib.error
import urllib.request
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CONCERNS = {"drawdb-io/drawdb", "chartdb/chartdb", "outerbase/studio", "xyflow/xyflow"}
LOCAL_DIRS = ("apps/studio/workbench", "apps/studio/database", "apps/studio/collab")
SUFFIXES = {".js", ".mjs", ".jsx", ".ts", ".tsx"}
NGRAM = 32
TOKEN = re.compile(r"[A-Za-z_$][\w$]*|\d+(?:\.\d+)?|=>|===|!==|==|!=|<=|>=|\?\.|\?\?|&&|\|\||\+\+|--|[^\s]", re.U)
COMMENTS = re.compile(r"/\*[\s\S]*?\*/|(?<!:)//[^\n]*")


def tokens(source: str) -> list[str]:
    return TOKEN.findall(COMMENTS.sub(" ", source))


def rolling_windows(parts: list[str], width: int = NGRAM):
    if len(parts) < width:
        return
    # 64-bit rolling hash. Verify original tokens on collisions.
    base, mod = 257, 2**64
    hashes = [int.from_bytes(hashlib.blake2b(p.encode(), digest_size=8).digest(), "big") for p in parts]
    weight = pow(base, width - 1, mod)
    h = 0
    for x in hashes[:width]:
        h = (h * base + x) % mod
    yield h, 0
    for pos in range(width, len(hashes)):
        h = ((h - hashes[pos - width] * weight) * base + hashes[pos]) % mod
        yield h, pos - width + 1


def find_spans(reference: list[str], local_index, local_tokens, *, threshold: int = NGRAM):
    findings = []
    seen = set()
    for fingerprint, i in rolling_windows(reference, threshold) or ():
        for path, j in local_index.get(fingerprint, ())[:12]:
            seq = local_tokens[path]
            if seq[j:j + threshold] != reference[i:i + threshold]:
                continue
            left_i, left_j = i, j
            while left_i and left_j and reference[left_i - 1] == seq[left_j - 1]:
                left_i -= 1
                left_j -= 1
            if (path, left_i, left_j) in seen:
                continue
            seen.add((path, left_i, left_j))
            right_i, right_j = i + threshold, j + threshold
            while right_i < len(reference) and right_j < len(seq) and reference[right_i] == seq[right_j]:
                right_i += 1
                right_j += 1
            findings.append({
                "path": path,
                "upstreamTokenOffset": left_i,
                "localTokenOffset": left_j,
                "matchingTokens": right_i - left_i,
            })
    return sorted(findings, key=lambda item: item["matchingTokens"], reverse=True)


def build_local_index():
    local = {}
    index = defaultdict(list)
    for directory in LOCAL_DIRS:
        for file in sorted((ROOT / directory).rglob("*")):
            if not file.is_file() or file.suffix not in SUFFIXES:
                continue
            relative = file.relative_to(ROOT).as_posix()
            local[relative] = tokens(file.read_text(encoding="utf-8"))
            for h, at in rolling_windows(local[relative]) or ():
                index[h].append((relative, at))
    return index, local


def source_rows():
    records = json.loads((ROOT / "provenance/source-map.json").read_text())
    return [r for r in records if r["repo"].lower() in CONCERNS]


def get_upstream(repo: str, sha: str, path: str, cache: Path, *, offline: bool):
    where = cache / repo.replace("/", "--") / sha / path
    if where.is_file():
        return where.read_bytes(), "cache"
    if offline:
        return None, "not-cached"
    if not re.fullmatch("[a-zA-Z0-9_.-]+/[a-zA-Z0-9_.-]+", repo) or not re.fullmatch("[a-f0-9]{40}", sha):
        raise ValueError("Unsafe upstream locator")
    url = f"https://raw.githubusercontent.com/{repo}/{sha}/{path}"
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "ALWIS-source-review/1"})
        with urllib.request.urlopen(req, timeout=20) as response:
            data = response.read(2_000_001)
        if len(data) > 2_000_000:
            return None, "file-too-large"
    except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError) as e:
        return None, f"download-failed-{getattr(e, 'code', type(e).__name__)}"
    where.parent.mkdir(parents=True, exist_ok=True)
    where.write_bytes(data)
    return data, "downloaded"


def audit(cache: Path, offline: bool = False):
    index, local = build_local_index()
    records = []
    rows = source_rows()
    with ThreadPoolExecutor(max_workers=6) as pool:
        downloaded = list(pool.map(lambda row: get_upstream(row["repo"], row["commit"], row["path"], cache, offline=offline), rows))
    for row, (data, status) in zip(rows, downloaded):
        findings = []
        checksum = None
        if data is not None:
            checksum = hashlib.sha256(data).hexdigest()
            expected = row["file_sha256"]
            if checksum != expected:
                status = "hash-mismatch"
            else:
                findings = find_spans(tokens(data.decode("utf-8", errors="replace")), index, local)[:8]
        records.append({
            "referenceId": row["id"], "repo": row["repo"], "revision": row["commit"], "path": row["path"],
            "sourceSha256": checksum, "expectedSha256": row["file_sha256"], "retrieval": status,
            "matchesAtLeast32Tokens": findings,
        })
    return {
        "schemaVersion": 1,
        "purpose": "mechanical-identical-token-screening-not-a-legal-originality-clearance",
        "scope": {"upstreamReferences": len(records), "localFiles": len(local), "minimumMatchingTokens": NGRAM},
        "summary": {
            "verifiedUpstream": sum(r["sourceSha256"] == r["expectedSha256"] and r["sourceSha256"] is not None for r in records),
            "unverifiedUpstream": sum(r["sourceSha256"] != r["expectedSha256"] for r in records),
            "matchingReferences": sum(bool(r["matchesAtLeast32Tokens"]) for r in records),
        },
        "limitations": "Nonidentical copied logic, styling, data and translated code are not detected; a human must compare any derived implementation and source history. Originality, license compatibility and ownership require independent review.",
        "sources": records,
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--offline", action="store_true")
    parser.add_argument("--cache", type=Path, default=ROOT / "build-work/licensing-audit/upstream")
    parser.add_argument("--output", type=Path, default=ROOT / "provenance/source-reuse-automated-review.json")
    options = parser.parse_args()
    report = audit(options.cache, offline=options.offline)
    options.output.parent.mkdir(parents=True, exist_ok=True)
    options.output.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n")
    print(json.dumps(report["summary"]))
    if report["summary"]["unverifiedUpstream"]:
        raise SystemExit("Some upstream source references could not be verified; not a clean audit.")
