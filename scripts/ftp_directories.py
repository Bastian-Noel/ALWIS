"""Cache only directories successfully created or verified in this FTP session."""
import ftplib
from pathlib import PurePosixPath

def ensure_directories(ftp, path, known):
    current = ""
    for part in PurePosixPath(path).parts:
        if part in ("", "."): continue
        if part in ("..", "/") or "\n" in part or "\r" in part:
            raise ValueError("Unsafe remote directory")
        current = (current + "/" if current else "") + part
        if current in known: continue
        try:
            ftp.mkd(current)
        except ftplib.error_perm:
            original = ftp.pwd()
            try: ftp.cwd(current)
            finally: ftp.cwd(original)
        known.add(current)
