#!/usr/bin/env python3
"""Recover the 19 original snapshots, verify every hash, then bundle for GitHub.

No third-party build/script is executed. Does not refresh the committed locks.
"""
import hashlib
import json
import pathlib
import subprocess
import zipfile

ROOT = pathlib.Path(__file__).resolve().parents[1]


def digest(path):
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def main():
    primary = json.loads((ROOT / 'provenance/upstream-lock.json').read_text())
    native = json.loads((ROOT / 'provenance/submodules-lock.json').read_text())
    entries = primary['repositories'] + native['downloaded']
    if primary['errors'] or len(entries) != 19:
        raise RuntimeError('Expected complete locks for 19 archives')
    for entry in entries:
        archive = ROOT / entry['archive']
        archive.parent.mkdir(parents=True, exist_ok=True)
        if not archive.exists():
            partial = archive.with_suffix(archive.suffix + '.part')
            subprocess.run([
                'curl', '-fLsS', '--retry', '2', '--connect-timeout', '20',
                '--max-time', '600',
                f"https://codeload.github.com/{entry['repo']}/tar.gz/{entry['sha']}",
                '-o', str(partial),
            ], check=True)
            if digest(partial) != entry['archive_sha256']:
                raise RuntimeError('Archive checksum mismatch: ' + entry['repo'])
            partial.replace(archive)
        if (archive.stat().st_size != entry['archive_bytes'] or
                digest(archive) != entry['archive_sha256']):
            raise RuntimeError('Archive size/checksum mismatch: ' + entry['repo'])
        print(entry['repo'] + ' verified', flush=True)
    output = ROOT / 'deliverables'
    output.mkdir(exist_ok=True)
    target = output / 'sources.zip'
    with zipfile.ZipFile(target, 'w', compression=zipfile.ZIP_STORED) as bundle:
        for entry in entries:
            bundle.write(ROOT / entry['archive'], entry['archive'])
        for name in ('upstream-lock.json', 'submodules-lock.json', 'lite4mariadb-gitlinks.json'):
            bundle.write(ROOT / 'provenance' / name, 'provenance/' + name)
        bundle.write(ROOT / 'SOURCES-RESTORE.md', 'SOURCES-RESTORE.md')
    (output / 'SHA256SUMS').write_text(digest(target) + '  sources.zip\n')
    print(f'{target.name}: {target.stat().st_size} bytes, 19 verified snapshots')


if __name__ == '__main__':
    main()
