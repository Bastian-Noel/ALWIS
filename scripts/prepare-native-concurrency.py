#!/usr/bin/env python3
"""ALWIS-specific Emscripten scheduling adapter for an UNPATCHED MariaDB source.

This adapter deliberately does not import, apply or transform the third-party
independent-sessions.patch. Its inputs are the official pinned MariaDB source
and explicitly reviewed suspension points. Validate with tests and a native
browser rebuild before treating it as a release replacement.
"""
import argparse
import hashlib
import json
from pathlib import Path

TARGETS = (
    ("storage/innobase/buf/buf0flu.cc", "ATTRIBUTE_COLD void buf_flush_wait("),
    ("storage/innobase/log/log0log.cc", "ATTRIBUTE_COLD void log_t::checkpoint_margin()"),
    ("mysys/get_password.c", "ctype portability"),
)
INCLUDE = "#ifdef __EMSCRIPTEN__\n#include <emscripten/threading.h>\n#endif\n"
PINNED_SOURCE_SHA256 = {
    "storage/innobase/buf/buf0flu.cc": "0963a352861f1a78cc3425aebebbd52582c174c99bd9e0189d831eadecaa3c71",
    "storage/innobase/log/log0log.cc": "8755b5eebe6f73a4a6f9bc32066ba2f4f51722688f8cae02b01318d4e20c8559",
    "mysys/get_password.c": "31bfa73513046ec849aae538ab4c9d06d8b55dc795ecaa7e2eba7988604a0408",
}
PINNED_UNMODIFIED_SHA256 = {
    "wasm/lite4mariadb.c": "c0a959b6755d3463de31d9d08d2a43031cc418a332768a0956ebfd5046e15526",
    "wasm/CMakeLists.txt": "f317e2786a12b2cfdd7c0de8d4b3d3c05b6aa9ee4f0a8aad909898b6d218f437",
}


def verify_unmodified(root: Path) -> None:
    for path, expected in PINNED_UNMODIFIED_SHA256.items():
        source = root / path
        if not source.is_file():
            raise ValueError("Missing pinned MariaDB source: " + path)
        actual = hashlib.sha256(source.read_bytes()).hexdigest()
        if actual != expected:
            raise ValueError("Unreviewed modification to pinned MariaDB upstream: " + path)




def change(source: str, kind: str) -> str:
    if kind == "ctype":
        if "#include <ctype.h>" in source:
            raise ValueError("ctype source already patched; use unmodified upstream")
        anchor = "#include <m_ctype.h>"
        if source.count(anchor) != 1 or source.count("#include <my_global.h>") != 1:
            raise ValueError("MariaDB password helper layout changed")
        return source.replace(anchor, anchor + "\n#include <ctype.h> /* ALWIS portability */", 1)
    if "l4m_session_open" in source or "PBL_WASM_COOPERATIVE_WAIT" in source:
        raise ValueError("Source is already modified; start from unpatched upstream")
    if source.count('#include "univ.i"') != 1:
        raise ValueError("Missing MariaDB baseline include")
    after = source.replace('#include "univ.i"', '#include "univ.i"\n' + INCLUDE, 1)
    if kind == "flush":
        start = after.index("ATTRIBUTE_COLD void buf_flush_wait(")
        end = after.find("\n}", start)
        if end < start:
            raise ValueError("Unterminated flush routine")
        region = after[start:end]
        anchor = "    os_aio_wait_until_no_pending_writes(false);"
        if region.count(anchor) != 1:
            raise ValueError("Expected one synchronous flush wait")
        # Verify the two locks are relinquished before the wait and reacquired
        # afterward. This is intentionally strict against upstream drift.
        left, right = region.split(anchor, 1)
        for guard in ("log_sys.latch.wr_unlock();", "mysql_mutex_unlock(&buf_pool.flush_list_mutex);"):
            if guard not in left:
                raise ValueError("Flush wait no longer follows mutex release: " + guard)
        if not left.rstrip().endswith("mysql_mutex_unlock(&buf_pool.flush_list_mutex);"):
            raise ValueError("Unexpected operation between unlocking flush mutex and I/O wait")
        if not right.lstrip().startswith("log_sys.latch.wr_lock();"):
            raise ValueError("Unexpected operation between I/O wait and reacquiring the latch")
        for guard in ("log_sys.latch.wr_lock();", "mysql_mutex_lock(&buf_pool.flush_list_mutex);"):
            if guard not in right:
                raise ValueError("Flush wait no longer precedes lock reacquisition: " + guard)
        injection = (
            anchor + "\n#ifdef __EMSCRIPTEN__\n"
            "    /* Allow an outstanding page-cleaner task to run before re-taking\n"
            "       the flush locks. Never suspend while holding either lock. */\n"
            "    emscripten_thread_sleep(1); /* PBL_WASM_COOPERATIVE_WAIT */\n"
            "#endif"
        )
    else:
        start = after.index("ATTRIBUTE_COLD void log_t::checkpoint_margin()")
        end = after.find("\n}", start)
        if end < start:
            raise ValueError("Unterminated checkpoint routine")
        region = after[start:end]
        anchor = "  while (check_for_checkpoint())\n  {\n    latch.wr_lock();"
        if region.count(anchor) != 1:
            raise ValueError("Checkpoint loop or lock ordering changed")
        injection = (
            "  while (check_for_checkpoint())\n  {\n"
            "#ifdef __EMSCRIPTEN__\n"
            "    /* The checkpoint condition is rechecked after the lock; yield\n"
            "       beforehand to service another runnable worker. */\n"
            "    emscripten_thread_sleep(1); /* PBL_WASM_COOPERATIVE_WAIT */\n"
            "#endif\n"
            "    latch.wr_lock();"
        )
    return after[:start] + region.replace(anchor, injection) + after[end:]


def apply(root: Path, *, write: bool, verify_pins: bool = False) -> dict:
    if verify_pins:
        verify_unmodified(root)
    records = []
    planned = []
    # Validate every source and every lock invariant BEFORE writing anything.
    for path, kind in TARGETS:
        original_file = root / path
        before = original_file.read_text()
        if verify_pins and hashlib.sha256(before.encode()).hexdigest() != PINNED_SOURCE_SHA256[path]:
            raise ValueError("Pinned native source mismatch; refuse unreviewed MariaDB version: " + path)
        after = change(before, "flush" if "buf/" in path else "checkpoint" if "log/" in path else "ctype")
        records.append({
            "path": path,
            "beforeSha256": hashlib.sha256(before.encode()).hexdigest(),
            "afterSha256": hashlib.sha256(after.encode()).hexdigest(),
            "bytesBefore": len(before.encode()),
            "bytesAfter": len(after.encode()),
        })
        planned.append((original_file, after))
    if write:
        for original_file, after in planned:
            original_file.write_text(after)
    return {"adapter": "ALWIS cooperative waits (independent candidate)", "status": "requires-native-validation", "files": records}


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("mariadb_source", type=Path)
    parser.add_argument("--write", action="store_true", help="Modify disposable source checkout only")
    parser.add_argument("--verify-pins", action="store_true", help="Require pinned unpatched source hashes")
    parser.add_argument("--receipt", type=Path)
    args = parser.parse_args()
    if args.write and args.receipt and args.receipt.is_file():
        previous = json.loads(args.receipt.read_text())
        if previous.get("adapter") == "ALWIS cooperative waits (independent candidate)":
            if args.verify_pins:
                verify_unmodified(args.mariadb_source)
            if all(hashlib.sha256((args.mariadb_source / row["path"]).read_bytes()).hexdigest() == row["afterSha256"] for row in previous.get("files", [])) and len(previous["files"]) == len(TARGETS):
                print(json.dumps(previous, indent=2))
                raise SystemExit(0)
    report = apply(args.mariadb_source, write=args.write, verify_pins=args.verify_pins)
    if args.receipt:
        args.receipt.parent.mkdir(parents=True, exist_ok=True)
        args.receipt.write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps(report, indent=2))
