"""Anchor/ordering regression checks for the independent ALWIS wait adapter."""
import tempfile
import unittest
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from importlib import import_module

adapter = import_module("prepare-native-concurrency")


def flush_source():
    return '''#include "univ.i"
ATTRIBUTE_COLD void buf_flush_wait(lsn_t lsn, bool checkpoint) noexcept
{
    log_sys.latch.wr_unlock();
    mysql_mutex_unlock(&buf_pool.flush_list_mutex);
    os_aio_wait_until_no_pending_writes(false);
    log_sys.latch.wr_lock();
    mysql_mutex_lock(&buf_pool.flush_list_mutex);
}
'''


def log_source():
    return '''#include "univ.i"
ATTRIBUTE_COLD void log_t::checkpoint_margin() noexcept
{
  while (check_for_checkpoint())
  {
    latch.wr_lock();
    if (!check_for_checkpoint()) break;
  }
}
'''


class Tests(unittest.TestCase):
    def test_flush_sleep_is_between_unlock_and_relock(self):
        result = adapter.change(flush_source(), "flush")
        wait = result.index("emscripten_thread_sleep(1)")
        self.assertLess(result.index("mysql_mutex_unlock(&buf_pool.flush_list_mutex)"), wait)
        self.assertLess(wait, result.index("log_sys.latch.wr_lock()"))
        self.assertEqual(result.count("PBL_WASM_COOPERATIVE_WAIT"), 1)

    def test_checkpoint_sleep_precedes_lock(self):
        result = adapter.change(log_source(), "checkpoint")
        self.assertLess(result.index("emscripten_thread_sleep(1)"), result.index("latch.wr_lock()"))
        self.assertEqual(result.count("PBL_WASM_COOPERATIVE_WAIT"), 1)

    def test_missing_wait_is_rejected(self):
        with self.assertRaises(ValueError):
            adapter.change(flush_source().replace("os_aio_wait_until_no_pending_writes(false);", ""), "flush")

    def test_missing_unlock_is_rejected(self):
        with self.assertRaises(ValueError):
            adapter.change(flush_source().replace("log_sys.latch.wr_unlock();", ""), "flush")

    def test_double_patch_is_rejected(self):
        with self.assertRaises(ValueError):
            adapter.change(adapter.change(log_source(), "checkpoint"), "checkpoint")

    def test_password_helper_portability(self):
        original = "#include <my_global.h>\n#include <m_ctype.h>\n"
        patched = adapter.change(original, "ctype")
        self.assertIn("#include <ctype.h>", patched)
        with self.assertRaises(ValueError):
            adapter.change(patched, "ctype")

    def test_multi_source_validation_precedes_all_writes(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            for path, data in [(adapter.TARGETS[0][0], flush_source()),
                               (adapter.TARGETS[1][0], log_source().replace("latch.wr_lock();", "latch.rd_lock();")),
                               (adapter.TARGETS[2][0], "#include <my_global.h>\n#include <m_ctype.h>\n")]:
                f = root / path
                f.parent.mkdir(parents=True, exist_ok=True)
                f.write_text(data)
            with self.assertRaises(ValueError):
                adapter.apply(root, write=True)
            self.assertEqual((root / adapter.TARGETS[0][0]).read_text(), flush_source())

    def test_strict_pinned_source_mismatch_is_rejected(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            for path, data in [(adapter.TARGETS[0][0], flush_source()),
                               (adapter.TARGETS[1][0], log_source()),
                               (adapter.TARGETS[2][0], "#include <my_global.h>\n#include <m_ctype.h>\n")]:
                f = root / path
                f.parent.mkdir(parents=True, exist_ok=True)
                f.write_text(data)
            with self.assertRaises(ValueError):
                adapter.apply(root, write=True, verify_pins=True)

    def test_receipt_without_writing(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            for path, data in [(adapter.TARGETS[0][0], flush_source()), (adapter.TARGETS[1][0], log_source()), (adapter.TARGETS[2][0], "#include <my_global.h>\n#include <m_ctype.h>\n")]:
                f = root / path
                f.parent.mkdir(parents=True, exist_ok=True)
                f.write_text(data)
            record = adapter.apply(root, write=False)
            self.assertEqual(len(record["files"]), 3)
            self.assertEqual((root / adapter.TARGETS[0][0]).read_text(), flush_source())


if __name__ == "__main__":
    unittest.main()
