"""Historical engine archive is verifiable, and NEVER treated as publishable."""
import io
import json
from pathlib import Path
import sys
import tarfile
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))
from importlib import import_module
legacy = import_module('archive-legacy-native')


def tar_fixture(dest, *, tamper=False, unsafe=False):
    wasm=b'legacy-wasm-only-not-for-distribution'
    artifact=json.dumps({'files':{'pbl-runtime.wasm':{'sha256':legacy.sha(wasm)}}}).encode()
    files={'historical-runtime/artifact.json':artifact,
           'historical-runtime/pbl-runtime.wasm':wasm,
           'README-ARCHIVE.md':b'TEST WITNESS ONLY'}
    manifest={'schemaVersion':1,'purpose':'historical-test-witness-only','files':[
        {'path':name,'sha256':legacy.sha(data),'bytes':len(data)}
        for name,data in sorted(files.items())]}
    files['manifest.json']=json.dumps(manifest).encode()
    if tamper: files['historical-runtime/pbl-runtime.wasm']+=b'X'
    if unsafe: files['../other.txt']=b'escape'
    with tarfile.open(dest, 'w:gz') as tar:
        for name,data in sorted(files.items()):
            member=tarfile.TarInfo(name);member.size=len(data)
            tar.addfile(member,io.BytesIO(data))


class HistoricalArchiveTests(unittest.TestCase):
    def test_verified_archive_has_a_manifest_and_pinned_binary_hashes(self):
        with tempfile.TemporaryDirectory() as path:
            archive=Path(path)/'historical.tar.gz'
            tar_fixture(archive)
            manifest=legacy.verify(archive)
            self.assertEqual(manifest['purpose'],'historical-test-witness-only')
            self.assertEqual(len(manifest['files']),3)

    def test_invalid_binary_is_rejected(self):
        with tempfile.TemporaryDirectory() as path:
            archive=Path(path)/'historical.tar.gz'
            tar_fixture(archive,tamper=True)
            with self.assertRaisesRegex(ValueError, 'checksum'):
                legacy.verify(archive)

    def test_unsafe_archive_member_is_rejected(self):
        with tempfile.TemporaryDirectory() as path:
            archive=Path(path)/'historical.tar.gz'
            tar_fixture(archive,unsafe=True)
            with self.assertRaisesRegex(ValueError, 'Unsafe'):
                legacy.verify(archive)

    def test_unrelated_runtime_is_not_selected_for_archiving(self):
        with tempfile.TemporaryDirectory() as path:
            root=Path(path)
            (root/'config').mkdir()
            (root/'config/native-runtime.json').write_text(json.dumps({'release':'new-independent-php84'}))
            with self.assertRaisesRegex(ValueError, 'pinned historical'):
                legacy.packaged_files(root)

    def test_archive_command_refuses_missing_or_replaced_historical_runtime(self):
        with tempfile.TemporaryDirectory() as path:
            output=Path(path)/'archived.tar.gz'
            output.write_bytes(b'existing file')
            with self.assertRaises(Exception):
                legacy.archive(ROOT,output)
            self.assertEqual(output.read_bytes(),b'existing file')


if __name__=='__main__': unittest.main()
