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
    'docs/ide-workflows.md': ('Editeur-et-sauvegardes', 'Code, clavier et sauvegardes'),
    'docs/school-example.md': ('Campus', 'Explorer le Campus'),
    'docs/compatibility.md': ('Compatibilite', 'Compatibilité et limites'),
    'CONTRIBUTING.md': ('Contribuer', 'Développer ALWIS'),
    'docs/architecture.md': ('Architecture', 'Architecture'),
    'docs/performance.md': ('Performance', 'Performance et mémoire'),
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
        # GitHub opens Home.md first. Use a compact welcome page that guides
        # readers to the full installation guide and the most useful topics.
        files['Home.md'] = f'''# Bienvenue dans ALWIS

**Écrivez du PHP, testez votre site et explorez vos données — directement dans le navigateur.**

[Ouvrir ALWIS](https://studio.mmi.place/) · [Installer ALWIS]({self.wiki}Installation) · [Voir les versions]({self.repo}/releases)

![L’atelier ALWIS avec la création de projet, l’import ZIP et l’ouverture d’un dossier.]({self.link('docs/images/alwis-start.png', 'README.md')})

## Par où commencer ?

| Votre objectif | Guide |
|---|---|
| Installer ALWIS et lancer le studio en local | [Guide d’installation]({self.wiki}Installation) |
| Créer un premier projet et découvrir les outils | [Premiers pas illustrés]({self.wiki}Premiers-pas) |
| Écrire du code, utiliser les raccourcis et sauvegarder | [Éditeur et sauvegardes]({self.wiki}Editeur-et-sauvegardes) |
| Explorer un site déjà rempli avec plusieurs visiteurs | [Exemple Campus]({self.wiki}Campus) |

## Choisir comment utiliser ALWIS

- **Dans le navigateur :** téléchargez le paquet statique depuis les [versions publiées]({self.repo}/releases) et lancez-le selon le [guide d’installation]({self.wiki}Installation).
- **Sur votre propre serveur :** consultez le [guide de l’édition Docker]({self.wiki}Serveur-Docker). Cette édition sert l’interface ; les projets restent dans le navigateur.

> **À retenir :** les projets sont enregistrés dans le navigateur. Exportez un ZIP pour garder une copie ou déplacer votre travail.

## Besoin d’un autre guide ?

[Navigateurs et limites]({self.wiki}Compatibilite) · [Architecture]({self.wiki}Architecture) · [Performance et mémoire]({self.wiki}Performance) · [Contribuer au projet]({self.wiki}Contribuer) · [Signaler un problème]({self.repo}/issues)
'''
        sidebar = f'**[ALWIS — Documentation]({self.wiki}Home)**\n\n**Utiliser ALWIS**\n\n'
        for source in list(PAGES)[:5]:
            slug, title = PAGES[source]; sidebar += f'- [{title}]({self.wiki}{slug})\n'
        sidebar += '\n**Développer et héberger**\n\n'
        for source in list(PAGES)[5:11]:
            slug, title = PAGES[source]; sidebar += f'- [{title}]({self.wiki}{slug})\n'
        sidebar += '\n<details>\n<summary>Archives techniques</summary>\n\n'
        for source in list(PAGES)[11:]:
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
