#!/usr/bin/env python3
"""Reproduce ALWIS independent-native inputs from pinned upstream archives.

This is only SOURCE preparation, not a build, license approval or release.
Downloads never execute remote scripts. Every upstream archive is hashed before
extraction. Historical JoomEngine sources and binaries are intentionally absent.
"""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import tarfile

ROOT = Path(__file__).resolve().parents[1]
NATIVE_REPOSITORIES = (
    'shyim/lite4mariadb',
    'seanmorris/php-wasm',  # Verify the exact reviewed fiber-port provenance.
    'MariaDB/mariadb-connector-c',
    'wolfSSL/wolfssl',
)
PHP_VERSION = '8.4.27'
PHP_SHA256 = 'dcf93923b0e38e0d5252b25b796520b5a47761a08b3488b6d0b5d1115764d3f0'


def sha(path):
    h = hashlib.sha256()
    with path.open('rb') as src:
        for chunk in iter(lambda: src.read(1048576), b''):
            h.update(chunk)
    return h.hexdigest()


def source_locks():
    sources = json.loads((ROOT / 'provenance/upstream-lock.json').read_text())['repositories']
    subs = json.loads((ROOT / 'provenance/submodules-lock.json').read_text())['downloaded']
    entries = {row['repo']: row for row in sources + subs}
    for repo in NATIVE_REPOSITORIES:
        assert repo in entries, 'Missing pinned upstream source: ' + repo
    return entries


def fetch(url, file, expected):
    if file.is_file():
        if sha(file) != expected:
            raise ValueError('Untrusted existing source archive: ' + str(file))
        return
    file.parent.mkdir(parents=True, exist_ok=True)
    temporary = file.with_name(file.name + '.partial')
    if temporary.exists():
        # Never overwrite or silently reuse a partially fetched input.
        raise ValueError('Incomplete download requires inspection: ' + str(temporary))
    try:
        subprocess.run(['curl', '--fail', '--location', '--silent', '--show-error',
                        '--retry', '3', '--connect-timeout', '20',
                        '--max-time', '420', '--output', str(temporary), url],
                       check=True, timeout=455)
        if sha(temporary) != expected:
            raise ValueError('Downloaded archive checksum differs from locked source: ' + url)
        temporary.replace(file)
    except BaseException:
        if temporary.exists():
            temporary.unlink()
        raise


def read_archives(download):
    upstream = source_locks()
    paths = {}
    for repo in NATIVE_REPOSITORIES:
        row = upstream[repo]
        file = ROOT / row['archive']
        if download:
            owner, name = repo.split('/')
            url = f'https://codeload.github.com/{owner}/{name}/tar.gz/{row["sha"]}'
            fetch(url, file, row['archive_sha256'])
        if not file.is_file() or sha(file) != row['archive_sha256']:
            raise ValueError('Missing/unverified native source archive: ' + str(file))
        paths[repo] = file
    official_php = ROOT / f'build-work/source-archives/php-{PHP_VERSION}.tar.xz'
    if download:
        fetch(f'https://www.php.net/distributions/php-{PHP_VERSION}.tar.xz',
              official_php, PHP_SHA256)
    if not official_php.is_file() or sha(official_php) != PHP_SHA256:
        raise ValueError('Missing/unverified PHP source release: ' + str(official_php))
    paths['php/php-release'] = official_php
    return paths


def extract_archive(archive, destination):
    if destination.exists():
        if any(destination.iterdir()):
            raise ValueError('Refusing to overwrite existing upstream source: ' + str(destination))
    else:
        destination.mkdir(parents=True)
    with tarfile.open(archive, 'r:gz') as source:
        members = source.getmembers()
        base = {Path(row.name).parts[0] for row in members if row.name and row.name != '.'}
        if len(base) != 1:
            raise ValueError('Upstream archive does not have a single source root')
        prefix = next(iter(base))
        for row in members:
            parts = Path(row.name).parts
            if not parts or parts[0] != prefix:
                raise ValueError('Unexpected source archive member')
            if len(parts) == 1:
                continue
            # Python's data filter refuses absolute paths and unsafe symlinks.
            row.name = str(Path(*parts[1:]))
        source.extractall(destination, members=(row for row in members if row.name != prefix),
                          filter='data')


def stage(archive_paths, source_root):
    source_root = source_root.resolve()
    if not source_root.is_relative_to((ROOT / 'build-work').resolve()):
        raise ValueError('Native source staging only allowed under build-work/')
    from importlib import import_module
    php_prep = import_module('prepare-php84-source')
    php_dir = source_root / 'php-minimal'
    maria_dir = source_root / 'mariadb-shallow'
    if not maria_dir.exists():
        extract_archive(archive_paths['shyim/lite4mariadb'], maria_dir)
        for repo, relative in (
            ('MariaDB/mariadb-connector-c', 'libmariadb'),
            ('wolfSSL/wolfssl', 'extra/wolfssl/wolfssl'),
        ):
            folder = maria_dir / relative
            if folder.exists() and any(folder.iterdir()):
                raise ValueError('Gitlink mount must be empty before restoring: ' + relative)
            extract_archive(archive_paths[repo], folder)
    # Never trust a source tree before checking exact pristine MariaDB inputs.
    native = import_module('prepare-native-concurrency')
    native.verify_unmodified(maria_dir)
    for rel, expected in native.PINNED_SOURCE_SHA256.items():
        if sha(maria_dir / rel) != expected:
            raise ValueError('Unexpected MariaDB native source: ' + rel)
    php_receipt = php_prep.prepare(php_dir, verify_only=php_dir.exists())
    # PHP prepared sources must permit the independent generated PDO/MySQLi shim.
    generated = source_root / 'independent-generated'
    subprocess.run([sys.executable, str(ROOT / 'scripts/prepare-native-drivers.py'),
                    str(php_dir), str(generated)], check=True)
    result = {
        'schemaVersion': 1,
        'status': 'verified-sources-only',
        'phpFiberReceipt': php_receipt,
        'mariaDBOriginalHash': sha(maria_dir / 'wasm/lite4mariadb.c'),
        'pdoGeneratorReceiptSha256': sha(generated / 'driver-adapter.json'),
        'thirdParty': [{'repo': repo, 'sha256': sha(file)}
                       for repo, file in sorted(archive_paths.items())],
        'nativeWasmCompiled': False,
        'browserValidated': False,
        'releaseApproved': False,
    }
    receipt = source_root / 'verified-inputs.json'
    receipt.write_text(json.dumps(result, indent=2) + '\n')
    return result


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--download', action='store_true', help='Fetch pinned upstream archives first')
    parser.add_argument('--stage-root', type=Path, default=ROOT / 'build-work/native-ci',
                        help='Disposable source root under build-work/')
    parser.add_argument('--verify-only', action='store_true')
    options = parser.parse_args()
    paths = read_archives(options.download)
    if options.verify_only:
        print(json.dumps({'status': 'upstream-archives-verified-only',
                          'files': [{'name': key, 'sha256': sha(file)} for key, file in paths.items()]},
                         indent=2))
        return
    print(json.dumps(stage(paths, options.stage_root), indent=2))


if __name__ == '__main__':
    main()
