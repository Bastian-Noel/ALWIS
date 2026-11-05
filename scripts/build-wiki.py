#!/usr/bin/env python3
"""Build GitHub Wiki pages from repository documentation; never edit sources."""
import argparse
import html
import json
import posixpath
import re
import shutil
import subprocess
from pathlib import Path
from urllib.parse import quote, unquote, urlsplit

PAGES = {
    'README.md': ('Installation', 'Installer ALWIS'),
    'docs/README.md': ('Premiers-pas', 'Premiers pas'),
    'docs/project-workflows.md': ('Projets-ZIP-et-dossiers', 'Créer, importer et sauvegarder'),
    'docs/ide-workflows.md': ('Editeur-et-sauvegardes', 'Code, clavier et sauvegardes'),
    'docs/sql-workflows.md': ('Bases-SQL-et-relations', 'Bases, SQL et relations'),
    'docs/school-example.md': ('Campus', 'Explorer le Campus'),
    'docs/storage-opfs.md': ('Stockage-et-limites', 'Stockage et limites'),
    'docs/compatibility.md': ('Compatibilite', 'Compatibilité et limites'),
    'docs/performance-summary.md': ('Performance', 'Mémoire et performances en bref'),
    'CONTRIBUTING.md': ('Contribuer', 'Développer ALWIS'),
    'docs/architecture.md': ('Architecture', 'Architecture'),
    'docs/performance.md': ('Mesures-memoire-detaillees', 'Rapport mémoire complet'),
    'docs/deployment.md': ('Publication', 'Hébergement et publication'),
    'docs/server-deployment.md': ('Serveur-Docker', 'Déployer l’édition serveur'),
    'docs/collaboration-p2p-specification.md': ('Collaboration-P2P', 'Collaboration en direct'),
    'docs/wiki-publication.md': ('Publication-du-wiki', 'Publication du wiki'),
    'docs/reference-studio.md': ('Notes-studio', 'Notes historiques du studio'),
    'docs/reference-compatibility.md': ('Notes-compatibilite', 'Notes historiques de compatibilité'),
}
MANIFEST = '.alwis-wiki-manifest.json'
IMAGE_TYPES = {'.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp'}


class Builder:
    def __init__(self, root, repository, revision):
        self.root = Path(root).resolve()
        if not re.fullmatch(r'[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+', repository):
            raise ValueError('Invalid GitHub owner/repository')
        if not re.fullmatch(r'[0-9a-f]{40}', revision):
            raise ValueError('A full source commit SHA is required')
        self.repository, self.revision = repository, revision
        self.repo = 'https://github.com/' + repository
        self.wiki = self.repo + '/wiki/'
        self.assets = {}

    def link(self, value, source):
        value = html.unescape(value)
        wrapped = value.startswith('<') and value.endswith('>')
        if wrapped:
            value = value[1:-1]
        parsed = urlsplit(value)
        if parsed.scheme or parsed.netloc or not parsed.path:
            return '<' + value + '>' if wrapped else value
        path = posixpath.normpath(posixpath.join(posixpath.dirname(source), unquote(parsed.path)))
        if parsed.path.startswith('/'):
            path = posixpath.normpath(unquote(parsed.path).lstrip('/'))
        local = (self.root / path).resolve()
        if not local.is_relative_to(self.root) or not local.exists():
            raise ValueError(f'{source}: missing or unsafe local link {value}')
        if path in PAGES:
            target = self.wiki + PAGES[path][0]
        elif local.suffix.lower() in IMAGE_TYPES:
            asset = 'assets/' + path
            self.assets[asset] = local
            target = 'https://raw.githubusercontent.com/wiki/' + self.repository + '/' + quote(asset)
        else:
            kind = 'tree' if local.is_dir() else 'blob'
            target = f'{self.repo}/{kind}/{self.revision}/' + quote(path)
        if parsed.query:
            target += '?' + parsed.query
        if parsed.fragment:
            target += '#' + quote(parsed.fragment, safe='-._~')
        return '<' + target + '>' if wrapped else target

    def prose(self, text, source):
        # Exclude inline code: examples must stay copyable.
        fragments = re.split(r'(`+[^`\n]*`+)', text)
        for i in range(0, len(fragments), 2):
            value = fragments[i]
            value = re.sub(r'(?<=\]\()(<[^>\n]+>|[^\s)]+)', lambda m: self.link(m[0], source), value)
            value = re.sub(r'(?m)^( {0,3}\[[^\]\n]+\]:\s*)(<[^>\n]+>|[^\s]+)',
                           lambda m: m[1] + self.link(m[2], source), value)
            def attribute(m):
                content = m[3]
                if m[1].lower() == 'srcset':
                    parts = []
                    for candidate in content.split(','):
                        bits = candidate.strip().split(maxsplit=1)
                        if bits:
                            parts.append(self.link(bits[0], source) + (' ' + bits[1] if len(bits) > 1 else ''))
                    content = ', '.join(parts)
                else:
                    content = self.link(content, source)
                return m[1] + '=' + m[2] + html.escape(content, quote=True) + m[2]
            value = re.sub(r'\b(href|src|srcset)=([\"\x27])(.*?)\2', attribute, value, flags=re.I)
            fragments[i] = value
        return ''.join(fragments)

    def convert(self, text, source):
        result, prose, fence = [], [], None
        for line in text.splitlines(keepends=True):
            marker = re.match(r'^ {0,3}(`{3,}|~{3,})(.*)$', line.rstrip('\n'))
            if fence:
                result.append(line)
                if marker and marker[1][0] == fence[0] and len(marker[1]) >= len(fence) and not marker[2].strip():
                    fence = None
            elif marker:
                result.append(self.prose(''.join(prose), source)); prose = []
                fence = marker[1]; result.append(line)
            else:
                prose.append(line)
        result.append(self.prose(''.join(prose), source))
        return ''.join(result)

    def build(self, output):
        output = Path(output).resolve()
        if output == self.root or self.root.is_relative_to(output):
            raise ValueError('Output must not replace the source checkout')
        files = {}
        for source, (slug, _) in PAGES.items():
            text = (self.root / source).read_text()
            files[slug + '.md'] = '<!-- Generated from ' + source + '; edit the repository source. -->\n\n' + self.convert(text, source)
        # GitHub opens Home.md first. Keep it focused on common tasks and visual entry points.
        files['Home.md'] = f'''# Bienvenue dans ALWIS

**Écrivez du code, lancez votre site et travaillez avec vos données dans le navigateur.**

[Ouvrir le studio](https://studio.mmi.place/) · [Installer ALWIS]({self.wiki}Installation) · [Télécharger une version]({self.repo}/releases)

| Créer ou importer un projet | Écrire et prévisualiser | Explorer SQL et les tables | Tester plusieurs visiteurs |
|---|---|---|---|
| ![Accueil : projet, ZIP ou dossier local.]({self.link('docs/images/alwis-start.png', 'README.md')}) | ![Éditeur de code et aperçu du site.]({self.link('docs/images/alwis-code-light.png', 'README.md')}) | ![Base, tables et grille de données.]({self.link('docs/images/alwis-data-light.png', 'README.md')}) | ![Sessions de démonstration du Campus.]({self.link('docs/images/alwis-sessions.png', 'README.md')}) |
| [Projets, ZIP et dossiers PC]({self.wiki}Projets-ZIP-et-dossiers) | [Code, formatage et complétion]({self.wiki}Editeur-et-sauvegardes) | [Bases, requêtes SQL et relations]({self.wiki}Bases-SQL-et-relations) | [Exemple Campus]({self.wiki}Campus) |

## Trouver rapidement un guide

| Vous voulez… | Ouvrez… |
|---|---|
| Découvrir l’interface en quelques étapes | [Premiers pas illustrés]({self.wiki}Premiers-pas) |
| Relier des clés et visualiser le schéma | [Guide SQL et relations]({self.wiki}Bases-SQL-et-relations) · [Capture du schéma]({self.link('docs/images/alwis-schema-light.png', 'README.md')}) |
| Enregistrer dans le navigateur ou exporter en ZIP | [Sauvegarder et transporter un projet]({self.wiki}Projets-ZIP-et-dossiers) |
| Déployer l’interface sur son propre serveur | [Installer l’image Docker]({self.wiki}Serveur-Docker) |
| Comprendre les mesures mémoire | [Vue graphique]({self.wiki}Performance) · [Rapport complet]({self.wiki}Mesures-memoire-detaillees) |

## Le fonctionnement en un coup d’œil

```mermaid
flowchart LR
  P[Projet dans le navigateur] --> C[Éditeur]
  C --> A[Aperçu du site]
  A --> PHP[PHP WebAssembly]
  PHP -->|si le projet utilise SQL| DB[MariaDB WebAssembly]
  DB --> O[Données · SQL · Schéma]
  P --> S[Sauvegarde navigateur]
  S --> Z[Export ZIP]
```

**Les projets restent dans le navigateur.** Le conteneur Docker sert l’interface ; il n’héberge pas les projets ni le moteur SQL.

## Aide et guides avancés

[Compatibilité]({self.wiki}Compatibilite) · [Mémoire en bref]({self.wiki}Performance) · [Architecture]({self.wiki}Architecture) · [Signaler un problème]({self.repo}/issues)
'''
        sidebar = f'**[Accueil ALWIS]({self.wiki}Home)**\n\n'
        groups = [
            ('Commencer', ['README.md', 'docs/README.md']),
            ('Créer et travailler', ['docs/project-workflows.md', 'docs/ide-workflows.md', 'docs/sql-workflows.md', 'docs/school-example.md']),
            ('Sauvegarder et dépanner', ['docs/storage-opfs.md', 'docs/compatibility.md']),
            ('Mémoire et performances', ['docs/performance-summary.md']),
            ('Héberger et publier', ['docs/server-deployment.md', 'docs/deployment.md']),
        ]
        for heading, sources in groups:
            sidebar += f'**{heading}**\n\n'
            for source in sources:
                slug, title = PAGES[source]; sidebar += f'- [{title}]({self.wiki}{slug})\n'
            sidebar += '\n'
        sidebar += '<details>\n<summary>Développement et documentation technique</summary>\n\n'
        for source in ['CONTRIBUTING.md', 'docs/architecture.md', 'docs/performance.md',
                       'docs/collaboration-p2p-specification.md', 'docs/wiki-publication.md',
                       'docs/reference-studio.md', 'docs/reference-compatibility.md']:
            slug, title = PAGES[source]; sidebar += f'- [{title}]({self.wiki}{slug})\n'
        files['_Sidebar.md'] = sidebar + f'\n</details>\n\n[Code source]({self.repo}) · [Versions]({self.repo}/releases)\n'
        files['_Footer.md'] = f'[Accueil]({self.wiki}Home) · [Sources de la documentation]({self.repo}/tree/main/docs) · [Version {self.revision[:7]}]({self.repo}/commit/{self.revision})\n\nDocumentation publiée automatiquement. Pour la corriger, modifiez les fichiers du dépôt.\n'
        output.mkdir(parents=True, exist_ok=True)
        manifest = output / MANIFEST
        if manifest.is_symlink():
            raise ValueError('Unsafe wiki manifest path')
        previous = json.loads(manifest.read_text()).get('files', []) if manifest.exists() else []
        current = set(files) | set(self.assets)
        # Only remove files recorded by a previous generation; handwritten pages survive.
        for name in set(previous) - current:
            target = (output / name).resolve()
            if not target.is_relative_to(output) or name == '.git' or name.startswith('.git/'):
                raise ValueError('Unsafe wiki manifest entry')
            if target.is_file():
                target.unlink()
        for name in current:
            target = output / name
            if target.is_symlink() or not target.resolve().is_relative_to(output):
                raise ValueError('Unsafe output path: ' + name)
            if target.exists() and name not in previous and name not in {'Home.md', '_Sidebar.md', '_Footer.md'}:
                raise ValueError('Unmanaged wiki file would be overwritten: ' + name)
        for name, text in files.items():
            (output / name).write_text(text.rstrip() + '\n')
        for name, source in self.assets.items():
            target = output / name; target.parent.mkdir(parents=True, exist_ok=True); shutil.copyfile(source, target)
        manifest.write_text(json.dumps({'source_revision': self.revision, 'files': sorted(current)}, indent=2) + '\n')
        print(f'Wiki generated: {len(files)} pages, {len(self.assets)} images; source {self.revision[:7]}')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', required=True)
    parser.add_argument('--repository', default='Bastian-Noel/ALWIS')
    parser.add_argument('--revision')
    args = parser.parse_args()
    root = Path(__file__).resolve().parent.parent
    revision = args.revision or subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=root, text=True).strip()
    Builder(root, args.repository, revision).build(args.output)


if __name__ == '__main__':
    main()
