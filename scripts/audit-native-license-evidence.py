#!/usr/bin/env python3
"""Reproducible evidence inventory for the ALWIS PHP+MariaDB WASM.

Checks exact upstream inputs, original license texts, packaged notices, and
ALWIS C compilation inputs. It is not a legal conclusion, does not update
the publication gate, and cannot approve a release or historical binary.
"""
import argparse
import hashlib
import json
import re
from pathlib import Path
import zipfile

ROOT = Path(__file__).resolve().parents[1]
PHP_SHA = "dcf93923b0e38e0d5252b25b796520b5a47761a08b3488b6d0b5d1115764d3f0"
PCRE_SHA = "d74c183c86c77248ad50017c7f45bae8f88106a6cca5d87ad09917e1c6fb0784"
ORIGINAL_PHP_SHA = "b42e4df5e50e6ecda1047d503d6d91d71032d09ed1027ba1ef29eed26f890c5a"
ORIGINAL_ZEND_SHA = "509aeb3be64e428d7e0004ce224620ab01bf94adaacefbb449611939df56bc5b"
EXPECTED_REPOS = {
    "shyim/lite4mariadb", "seanmorris/php-wasm", "php/php-src",
    "php/php-release", "MariaDB/mariadb-connector-c", "wolfSSL/wolfssl",
    "PCRE2Project/pcre2",
}


def sha(path):
    h = hashlib.sha256()
    with Path(path).open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def archives():
    upstream = json.loads((ROOT / "provenance/upstream-lock.json").read_text())["repositories"]
    subs = json.loads((ROOT / "provenance/submodules-lock.json").read_text())["downloaded"]
    rows = {row["repo"]: row for row in upstream + subs}
    names = EXPECTED_REPOS - {"php/php-release", "PCRE2Project/pcre2"}
    assert all(repo in rows for repo in names)
    result = [
        {"repo": repo, "path": str(ROOT / rows[repo]["archive"]),
         "expectedSha256": rows[repo]["archive_sha256"]}
        for repo in sorted(names)
    ]
    result.extend([
        {"repo": "php/php-release", "path": str(ROOT / "build-work/source-archives/php-8.4.27.tar.xz"),
         "expectedSha256": PHP_SHA},
        {"repo": "PCRE2Project/pcre2", "path": str(ROOT / "build-work/source-archives/pcre2-10.47.zip"),
         "expectedSha256": PCRE_SHA},
    ])
    return sorted(result, key=lambda row: row["repo"])


def build_inputs():
    cmake = (ROOT / "engine/native/build/runtime-target.cmake").read_text()
    first_party = sorted({name for name in
        re.findall(r'"\$\{PBL_REPO_SOURCE\}/(packages/[^"]+)"', cmake)
        if Path(name).suffix in (".c", ".h", ".cc", ".cpp")})
    # Generated runtime.c comes from the ALWIS runner.c verbatim.
    # Include source inlined or included by C compilation units as well.
    first_party.extend([
        "packages/php-native/src/runner.c",
        "packages/php-native/src/mysqli-extended.c",
        "packages/php-native/src/request-state.h",
        "packages/php-native/src/pdo-adapter.h",
        "packages/php-native/src/pdo-values.h",
        "packages/sql-native/include/pbl_mysql.h",
    ])
    original = []
    for name in sorted(set(first_party)):
        p = ROOT / name
        if not p.is_file():
            raise ValueError("Native C target references missing ALWIS source: " + name)
        header = p.read_text(errors="replace")[:1100]
        original.append({
            "path": name, "sha256": sha(p),
            "spdx": re.search(r"SPDX-License-Identifier:\s*([A-Za-z0-9.+-]+)", header).group(1)
                if "SPDX-License-Identifier:" in header else None,
        })
    if "joomengine" in cmake.lower() or "independent-sessions.patch" in cmake:
        raise ValueError("Historical fork source appears in independent native CMake inputs")
    if "mysqlserver" not in cmake:
        raise ValueError("Independent runtime does not link embedded MariaDB")
    return original


def check(strict_archives=False, source_root=None):
    source_root = Path(source_root) if source_root else (
        ROOT / "build-work/native-ci" if (ROOT / "build-work/native-ci/php-minimal").exists()
        else ROOT / "build-work")
    evidence = []
    for row in archives():
        path = Path(row["path"])
        actual = sha(path) if path.is_file() else None
        if actual is not None and actual != row["expectedSha256"]:
            raise ValueError("Pinned upstream archive has CHANGED: " + row["repo"])
        if strict_archives and actual is None:
            raise ValueError("Missing verified source archive: " + row["repo"])
        evidence.append({
            "repo": row["repo"], "expectedSha256": row["expectedSha256"],
            "verified": actual == row["expectedSha256"], "bytes": path.stat().st_size if actual else None,
        })

    notices = [
        "LICENSES/Apache-2.0.txt",
        "LICENSES/GPL-2.0-only.txt",
        "LICENSES/LGPL-2.1-or-later.txt",
        "LICENSES/PHP-License-v4.txt",
        "LICENSES/PHP-8.4.27-original-3.01.txt",
        "LICENSES/Zend-Engine-original-2.00.txt",
        "LICENSES/PCRE2-10.47-LICENCE.md",
        "LICENSES/seanmorris-php-wasm-NOTICE.txt",
        "LICENSES/wolfSSL-LICENSING.txt",
        "LICENSES/PolyForm-Noncommercial-1.0.0.txt",
    ]
    source_copies = [
        ("LICENSES/PHP-8.4.27-original-3.01.txt", source_root / "php-minimal/LICENSE", ORIGINAL_PHP_SHA),
        ("LICENSES/Zend-Engine-original-2.00.txt", source_root / "php-minimal/Zend/LICENSE", ORIGINAL_ZEND_SHA),
        ("LICENSES/wolfSSL-LICENSING.txt",
         source_root / "mariadb-shallow/extra/wolfssl/wolfssl/LICENSING", None),
    ]
    copy_status = []
    for repo_name, upstream_file, expected in source_copies:
        copy = ROOT / repo_name
        if not copy.is_file():
            raise ValueError("Legal notice file absent: " + repo_name)
        if expected and sha(copy) != expected:
            raise ValueError("Original PHP or Zend license copy altered: " + repo_name)
        if upstream_file.is_file():
            stored = copy.read_bytes()
            upstream = upstream_file.read_bytes()
            # Text itself is exact; normalize ONLY trailing empty lines in
            # wolfSSL's old LICENSING file to satisfy repository whitespace lint.
            same = (stored.rstrip(bytes([10])) == upstream.rstrip(bytes([10]))
                    if "wolfSSL" in repo_name else stored == upstream)
            if not same:
                raise ValueError("Packaged license differs from locked upstream: " + repo_name)
        if strict_archives and not upstream_file.is_file():
            raise ValueError("Original license source unavailable: " + str(upstream_file))
        copy_status.append({"path": repo_name,
                            "sha256": sha(copy), "matchesUpstream": upstream_file.is_file()})
    for name in notices:
        if not (ROOT / name).is_file() or not (ROOT / name).stat().st_size:
            raise ValueError("Missing required attribution/notice: " + name)
    archive = ROOT / "build-work/source-archives/pcre2-10.47.zip"
    if archive.is_file():
        with zipfile.ZipFile(archive) as zip_file:
            original_pcre = zip_file.read("pcre2-10.47/LICENCE.md")
        packaged = (ROOT / "LICENSES/PCRE2-10.47-LICENCE.md").read_bytes()
        if original_pcre != packaged:
            raise ValueError("Packaged PCRE2 text differs from exact upstream archive")
    elif strict_archives:
        raise ValueError("Cannot validate PCRE2 attribution without the pinned archive")

    php_v4 = (ROOT / "LICENSES/PHP-License-v4.txt").read_text()
    if "Zend Technologies" not in php_v4 or "Redistribution and use" not in php_v4:
        raise ValueError("PHP v4 / Zend v3 licensing notice is incomplete")
    headers = build_inputs()
    gate = json.loads((ROOT / "provenance/release-licensing-status.json").read_text())
    if gate.get("status") not in ("blocked", "ready", "authorized-with-exception") or not isinstance(gate.get("blockers"), list):
        raise ValueError("Invalid publication review record")
    if gate["status"] == "ready" and gate["blockers"]:
        raise ValueError("Ready publication record still has open blockers")
    if not (ROOT / "provenance/editor-license-boundary.md").is_file():
        raise ValueError("Editor/native boundary proof missing")
    if not (ROOT / "provenance/source-reuse-automated-review.json").is_file():
        raise ValueError("Upstream reuse comparison missing")

    missing_spdx = [row["path"] for row in headers if row["spdx"] is None]
    wrong_spdx = [row for row in headers if row["spdx"] and row["spdx"] != "GPL-2.0-only"]
    if wrong_spdx:
        raise ValueError("Non-GPL SPDX found inside ALWIS native target; requires manual review")
    return {
        "schemaVersion": 1, "type": "evidence-not-legal-clearance",
        "archiveEvidence": evidence, "archiveCount": len(evidence),
        "originalLicenseEvidence": copy_status,
        "nativeFirstPartyFiles": headers,
        "nativeFilesMissingSpdx": missing_spdx,
        "externalLegalReferences": {
            "phpAndZendUpgrades": "https://www.php.net/license/",
            "gplv2Apache": "https://www.apache.org/licenses/GPL-compatibility.html",
        },
        "claimsChecked": {
            "phpLicense3To4": "Elect PHP License version 4 only for covered files.",
            "zendLicense2To3": "Elect Zend Engine License version 3 only for covered files.",
            "mariaDB": "GPL-2.0-only source/combined WASM obligations retained.",
            "wolfSSL": "MariaDB exception permits GPLv2 option for covered wolfSSL code.",
            "connectorC": "Pinned libmariadb header states GNU Library GPL v2-or-later; linkage and precise notices require further review.",
            "editor": "Separate editor JS/SWC artifact; whether the full assembled product is independent is not legally determined.",
        },
        "reviewRequired": [
            "Exact object-file linker map and all dependencies (not just 7 source archives).",
            "Original ALWIS native file authorship and explicit GPL grant for every input missing SPDX.",
            "PHP/Zend/TSRM third-party exceptions, MariaDB Connector/C and bundled libraries at file level.",
            "JoomEngine clean rewrite provenance and reused non-native code/assets; human review.",
            "Editor/runtime combined-work classification and third-party license compatibility.",
            "Release-specific complete corresponding sources, warranties, notices and available download route.",
            "Licensing and notices for previously published historical binary.",
        ],
        "openPublicationBlockers": [entry["id"] for entry in gate["blockers"]],
        "releaseApproved": False, "legalReviewComplete": False,
        "blocked": True,
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--require-archives", action="store_true")
    parser.add_argument("--source-root", type=Path)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    result = check(strict_archives=args.require_archives, source_root=args.source_root)
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(json.dumps(result, indent=2, ensure_ascii=False) + "\n")
    print(json.dumps({
        "status": "evidence-verified-not-legal-clearance",
        "archivesVerified": sum(item["verified"] for item in result["archiveEvidence"]),
        "archivesTotal": result["archiveCount"],
        "firstPartyCFiles": len(result["nativeFirstPartyFiles"]),
        "missingSpdx": len(result["nativeFilesMissingSpdx"]),
        "openPublicationBlockers": len(result["openPublicationBlockers"]),
        "releaseApproved": False,
    }, indent=2))


if __name__ == "__main__":
    main()
