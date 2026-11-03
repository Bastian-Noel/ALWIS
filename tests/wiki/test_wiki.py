import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('wiki', ROOT / 'scripts/build-wiki.py')
wiki = importlib.util.module_from_spec(spec)
spec.loader.exec_module(wiki)


class WikiTests(unittest.TestCase):
    def setUp(self):
        self.builder = wiki.Builder(ROOT, 'Bastian-Noel/ALWIS', 'a' * 40)

    def test_links_and_images(self):
        result = self.builder.convert('[Guide](README.md#démarrer)\n![Image](images/alwis-start.png)\n<source srcset="images/alwis-start.png 1x, images/alwis-start-dark.png 2x">', 'docs/compatibility.md')
        self.assertIn('/wiki/Premiers-pas#d%C3%A9marrer', result)
        self.assertIn('raw.githubusercontent.com/wiki/Bastian-Noel/ALWIS/assets/docs/images/alwis-start.png', result)
        self.assertEqual(len(self.builder.assets), 2)
        self.assertEqual(self.builder.link('https://example.org/a', 'README.md'), 'https://example.org/a')
        self.assertIn('/blob/' + 'a' * 40 + '/package.json', self.builder.link('package.json', 'README.md'))

    def test_code_examples_unchanged(self):
        code = '`[example](missing.md)`\n```html\n<img src="missing.png">\n```\n'
        self.assertEqual(self.builder.convert(code, 'README.md'), code)

    def test_broken_and_escaping_links_fail(self):
        for link in ['missing-file.md', '../../etc/passwd']:
            with self.assertRaises(ValueError):
                self.builder.link(link, 'README.md')

    def test_repeat_generation_preserves_manual_pages_and_removes_stale_assets(self):
        with tempfile.TemporaryDirectory() as tmp:
            output = Path(tmp)
            (output / 'Home.md').write_text('Initial wiki')
            (output / 'Personal.md').write_text('Keep this')
            self.builder.build(output)
            first = (output / 'Home.md').read_bytes()
            manifest = json.loads((output / wiki.MANIFEST).read_text())
            (output / 'old.png').write_text('old asset')
            manifest['files'].append('old.png')
            (output / wiki.MANIFEST).write_text(json.dumps(manifest))
            self.builder.build(output)
            self.assertFalse((output / 'old.png').exists())
            self.assertEqual((output / 'Personal.md').read_text(), 'Keep this')
            self.assertEqual(first, (output / 'Home.md').read_bytes())
            self.assertTrue((output / '_Sidebar.md').is_file())
            self.assertTrue((output / 'assets/docs/images/alwis-start.png').is_file())

    def test_manual_page_collision_fails(self):
        with tempfile.TemporaryDirectory() as tmp:
            page = Path(tmp) / 'Installation.md'
            page.write_text('Personal content')
            with self.assertRaises(ValueError):
                self.builder.build(tmp)
            self.assertEqual(page.read_text(), 'Personal content')

    def test_manifest_symlink_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            output = Path(tmp) / 'wiki'
            output.mkdir()
            target = Path(tmp) / 'private.json'
            target.write_text('{}')
            (output / wiki.MANIFEST).symlink_to(target)
            with self.assertRaises(ValueError):
                self.builder.build(output)
            self.assertEqual(target.read_text(), '{}')


if __name__ == '__main__':
    unittest.main()
