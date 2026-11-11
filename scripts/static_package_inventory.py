"""Bound static uploads by their verified manifest, not an obsolete file count."""
from pathlib import Path, PurePosixPath

def verify_inventory(source, manifest):
    source = Path(source)
    names = [row["path"] for row in manifest["files"]]
    if len(set(names)) != len(names): raise ValueError("Duplicate package manifest path")
    if any(PurePosixPath(n).is_absolute() or ".." in PurePosixPath(n).parts for n in names):
        raise ValueError("Unsafe package manifest path")
    files = sorted(p for p in source.rglob("*") if p.is_file())
    actual = {p.relative_to(source).as_posix() for p in files}
    if actual != set(names) | {"release.json"}: raise ValueError("Static files differ from manifest")
    if len(files) > 250 or sum(p.stat().st_size for p in files) > 128 * 1024 * 1024:
        raise ValueError("Unexpected static package size")
    if any(p.suffix.lower() == ".php" for p in files): raise ValueError("Executable PHP in static package")
    return files
