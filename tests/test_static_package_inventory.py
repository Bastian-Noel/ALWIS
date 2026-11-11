from pathlib import Path
import sys,tempfile,unittest
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/"scripts"))
from static_package_inventory import verify_inventory
class InventoryTests(unittest.TestCase):
 def test_full_current_size_package_allowed_but_unlisted_files_refused(self):
  with tempfile.TemporaryDirectory() as d:
   root=Path(d); names=[f"asset-{i}.txt" for i in range(145)]
   for name in names+['release.json']: (root/name).write_text('x')
   manifest={'files':[{'path':n} for n in names]}
   self.assertEqual(len(verify_inventory(root,manifest)),146)
   (root/'unlisted.txt').write_text('unexpected')
   with self.assertRaises(ValueError): verify_inventory(root,manifest)
 def test_duplicate_and_traversal_paths_refused(self):
  for paths in [['a','a'],['../escape']]:
   with tempfile.TemporaryDirectory() as d:
    with self.assertRaises(ValueError): verify_inventory(d,{'files':[{'path':p} for p in paths]})
if __name__=='__main__':unittest.main()
