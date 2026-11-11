import ftplib,sys,unittest
from pathlib import Path
from unittest.mock import Mock
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/"scripts"))
from ftp_directories import ensure_directories
class FTPDirectoryTests(unittest.TestCase):
 def test_repeated_parents_do_not_repeat_network_calls(self):
  ftp=Mock(); known=set()
  for i in range(143): ensure_directories(ftp,'stage/_alwis/revision/apps/studio',known)
  self.assertEqual(ftp.mkd.call_count,5)
 def test_existing_directory_is_verified_and_original_location_restored(self):
  ftp=Mock(); ftp.mkd.side_effect=ftplib.error_perm('550 exists'); ftp.pwd.return_value='/root'; known=set()
  ensure_directories(ftp,'LICENSES',known)
  self.assertEqual([c.args[0] for c in ftp.cwd.call_args_list],['LICENSES','/root'])
  ensure_directories(ftp,'LICENSES',known)
  self.assertEqual(ftp.mkd.call_count,1)
 def test_failed_directory_not_cached_and_traversal_always_rejected(self):
  ftp=Mock(); ftp.mkd.side_effect=ftplib.error_perm('550 denied'); ftp.pwd.return_value='/root'
  ftp.cwd.side_effect=[ftplib.error_perm('550 denied'),None]; known=set()
  with self.assertRaises(ftplib.error_perm): ensure_directories(ftp,'missing',known)
  self.assertFalse(known)
  for path in ['../escape','/absolute','safe/../escape','bad\nname']:
   with self.assertRaises(ValueError): ensure_directories(Mock(),path,{'safe'})
if __name__=='__main__': unittest.main()
