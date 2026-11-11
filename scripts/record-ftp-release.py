#!/usr/bin/env python3
"""Record deployment after the already-published release has reached FTP."""
import json, os, subprocess
from pathlib import Path
repo, tag = os.environ['GH_REPO'], os.environ['RELEASE_TAG']
release=json.loads(subprocess.check_output(['gh','release','view',tag,'--repo',repo,'--json','body,targetCommitish']))
if release['targetCommitish']!=(os.environ.get('SOURCE_SHA') or os.environ['GITHUB_SHA']):
    raise SystemExit('Refusing to annotate a release for another revision')
notes=release['body'].replace('Le transfert FTP sera exécuté après publication de cette release.', 'Transfert FTP réussi après publication de cette release.')
path=Path(os.environ['RUNNER_TEMP'])/'release-deployed.md'
path.write_text(notes)
subprocess.run(['gh','release','edit',tag,'--repo',repo,'--notes-file',str(path)],check=True)
