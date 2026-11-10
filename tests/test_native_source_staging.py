"""Offline fail-closed checks for the independent-native source supply chain."""
import hashlib
import importlib.util
from pathlib import Path
import tarfile
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location(
    'independent_native_stage', ROOT / 'scripts/prepare-independent-native-inputs.py')
stage = importlib.util.module_from_spec(spec)
spec.loader.exec_module(stage)


class SourceStagingTests(unittest.TestCase):
    def test_pinned_sources_do_not_include_disappeared_joomengine(self):
        self.assertEqual(set(stage.NATIVE_REPOSITORIES), {
            'shyim/lite4mariadb', 'seanmorris/php-wasm',
            'MariaDB/mariadb-connector-c', 'wolfSSL/wolfssl',
        })
        self.assertNotIn('joomengine/php-wasm', stage.NATIVE_REPOSITORIES)
        self.assertEqual(stage.PHP_VERSION, '8.4.27')
        self.assertEqual(len(stage.PHP_SHA256), 64)

    def test_extracts_only_single_prefix(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            archive = root / 'source.tar.gz'
            source = root / 'payload'
            source.mkdir()
            (source / 'a.txt').write_text('validated')
            with tarfile.open(archive, 'w:gz') as tar:
                tar.add(source / 'a.txt', 'repo-hash/a.txt')
            stage.extract_archive(archive, root / 'unpacked')
            self.assertEqual((root / 'unpacked/a.txt').read_text(), 'validated')
            with self.assertRaises(ValueError):
                stage.extract_archive(archive, root / 'unpacked')

    def test_rejects_two_roots(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            archive = root / 'untrusted.tar.gz'
            with tarfile.open(archive, 'w:gz') as tar:
                for filename in ('one/a', 'two/b'):
                    source = root / filename.replace('/', '_')
                    source.write_text(filename)
                    tar.add(source, filename)
            with self.assertRaisesRegex(ValueError, 'single source root'):
                stage.extract_archive(archive, root / 'out')

    def test_rejects_unsafe_tar_symlink(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            archive = root / 'unsafe.tar.gz'
            with tarfile.open(archive, 'w:gz') as tar:
                from tarfile import TarInfo, SYMTYPE
                entry = TarInfo('source/link')
                entry.type = SYMTYPE
                entry.linkname = '../../outside'
                tar.addfile(entry)
            with self.assertRaises((OSError, tarfile.FilterError, ValueError)):
                stage.extract_archive(archive, root / 'out')
            self.assertFalse((root / 'outside').exists())

    def test_existing_archive_sha_is_checked_before_any_network(self):
        with tempfile.TemporaryDirectory() as folder:
            file = Path(folder) / 'archive.tar.gz'
            file.write_bytes(b'wrong')
            with self.assertRaisesRegex(ValueError, 'Untrusted existing source'):
                stage.fetch('https://example.invalid/test', file, hashlib.sha256(b'right').hexdigest())
            self.assertEqual(file.read_bytes(), b'wrong')


if __name__ == '__main__':
    unittest.main()
