"""Project publication decision; never a grant of third-party rights."""
import hashlib
from pathlib import Path

FORMATTER_FILES = {"main/snprintf.c", "main/spprintf.c"}

def require_publication(record, root=Path("."), version=None):
    root = Path(root)
    if record.get("status") == "ready" and not record.get("blockers"):
        return
    exception = record.get("publicationException", {})
    blockers = record.get("blockers", [])
    if (record.get("status") != "authorized-with-exception"
        or not blockers or {x.get("id") for x in blockers} != {"php-apache1-formatters"}
        or exception.get("finding") != "php-apache1-formatters"
        or set(exception.get("files", [])) != FORMATTER_FILES
        or exception.get("maintainerAuthorized") is not True
        or exception.get("thirdPartyPermissionGranted") is not False):
        raise ValueError("Publication blocked: no applicable, narrowly scoped maintainer exception")
    if version is None:
        import json
        source = root / "release.json"
        if not source.exists(): source = root / "package.json"
        version = json.loads(source.read_text())["version"]
    if exception.get("version") != version:
        raise ValueError("Publication exception does not cover this version")
    notice = root / "LICENSES/PHP-formatting-legacy.txt"
    if not notice.is_file() or hashlib.sha256(notice.read_bytes()).hexdigest() != exception.get("noticeSha256"):
        raise ValueError("Legacy formatter notice missing or altered")
