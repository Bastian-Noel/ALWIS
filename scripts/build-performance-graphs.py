#!/usr/bin/env python3
"""Build the public, illustrative charts for the Windows memory audit.

Requires matplotlib. The values are transcribed from the 2026-11-05 report;
they are deliberately kept here so each chart can be regenerated consistently.
"""
from pathlib import Path

import matplotlib.pyplot as plt
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'docs' / 'images'
OUT.mkdir(parents=True, exist_ok=True)

BLUE = '#316BDB'
ORANGE = '#D96C2F'
INK = '#172B4D'
MUTED = '#52647A'
GRID = '#E2E8F0'
BG = '#F7F9FC'

plt.rcParams.update({
    'font.family': 'DejaVu Sans',
    'font.size': 11,
    'axes.titlesize': 19,
    'axes.titleweight': 'bold',
    'axes.labelcolor': MUTED,
    'text.color': INK,
    'xtick.color': MUTED,
    'ytick.color': INK,
    'axes.edgecolor': GRID,
    'axes.linewidth': 0.8,
    'figure.facecolor': BG,
    'axes.facecolor': 'white',
})


def finish(fig, name):
    fig.savefig(OUT / name, dpi=180, bbox_inches='tight', facecolor=BG)
    plt.close(fig)


# Total resident-private memory for a few useful reference situations.
labels = [
    'Page vide du navigateur',
    'Studio, aucun projet',
    'PHP seul',
    'PHP + MariaDB, requête SQL',
    'Campus, écran Sessions',
    'Campus + éditeur PHP analysé',
    'Session complète des outils',
]
chromium = np.array([52.9, 78.5, 236.2, 354.0, 405.1, 496.6, 522.4])
firefox = np.array([249.8, 289.3, 430.2, 571.5, 659.3, 829.1, 805.2])
chromium_sd = np.array([0.1, 0.0, 0.6, 0.4, 1.3, 1.1, 2.0])
firefox_sd = np.array([1.2, 1.9, 1.1, 6.0, 8.7, 2.7, 50.9])

fig, ax = plt.subplots(figsize=(13, 7.2))
fig.subplots_adjust(left=0.3, right=0.91, top=0.85, bottom=0.15)
y = np.arange(len(labels))
height = 0.32
ax.barh(y + height / 2, chromium, height, color=BLUE, label='Chromium',
        xerr=chromium_sd, error_kw={'elinewidth': 1.2, 'capsize': 3})
ax.barh(y - height / 2, firefox, height, color=ORANGE, label='Firefox',
        xerr=firefox_sd, error_kw={'elinewidth': 1.2, 'capsize': 3})
for i, (c, f) in enumerate(zip(chromium, firefox)):
    ax.text(c + 10, i + height / 2, f'{c:.0f}', va='center', color=INK, fontsize=10)
    ax.text(f + 10, i - height / 2, f'{f:.0f}', va='center', color=INK, fontsize=10)
ax.set_yticks(y, labels)
ax.invert_yaxis()
ax.set_xlim(0, 940)
ax.set_xlabel('Mio de mémoire résidente privée · moyenne par lancement')
fig.text(0.3, 0.965, 'Mémoire observée selon le scénario', color=INK,
         fontsize=19, fontweight='bold', ha='left')
fig.text(0.3, 0.91,
         'Scénarios Windows du 5 novembre 2026 · barres fines : écart-type',
         color=MUTED, fontsize=10, ha='left')
ax.xaxis.grid(True, color=GRID, linewidth=0.9)
ax.set_axisbelow(True)
ax.spines[['top', 'right', 'left']].set_visible(False)
ax.tick_params(axis='y', length=0, pad=10)
ax.tick_params(axis='x', length=0, pad=8)
fig.legend(loc='upper right', frameon=False, ncol=2, bbox_to_anchor=(0.96, 0.965))
fig.text(0.30, 0.045,
         'La mesure additionne les pages privées des processus du navigateur. Elle ne comprend pas les pages partagées.',
         color=MUTED, fontsize=9)
finish(fig, 'memory-situations-2026-11-05.png')


# Incremental measurements use different explicit comparison baselines. The
# chart keeps each baseline in its label; these values must not be stacked.
delta_labels = [
    'Moteur PHP · vs page vide',
    'MariaDB · activée après PHP',
    'Analyse PHP · au-dessus de coloration',
    'TypeScript + SWC · vs page vide',
    'SuperHTML · vs page vide',
]
delta_c = np.array([183.3, 117.3, 79.7, 123.9, 15.5])
delta_f = np.array([180.4, 141.0, 84.4, 176.7, 12.8])

fig, ax = plt.subplots(figsize=(12.5, 5.6))
fig.subplots_adjust(left=0.32, right=0.91, top=0.78, bottom=0.16)
y = np.arange(len(delta_labels))
ax.barh(y + height / 2, delta_c, height, color=BLUE, label='Chromium')
ax.barh(y - height / 2, delta_f, height, color=ORANGE, label='Firefox')
for i, (c, f) in enumerate(zip(delta_c, delta_f)):
    ax.text(c + 4, i + height / 2, f'+{c:.1f}', va='center', color=INK, fontsize=10)
    ax.text(f + 4, i - height / 2, f'+{f:.1f}', va='center', color=INK, fontsize=10)
ax.set_yticks(y, delta_labels)
ax.invert_yaxis()
ax.set_xlim(0, 245)
ax.set_xlabel('Surcoût observé · Mio')
ax.set_title('Quels postes ajoutent le plus ?', loc='left', pad=24)
ax.text(0, 1.05, 'Comparaisons isolées de la campagne · les témoins diffèrent selon le poste',
        transform=ax.transAxes, color=MUTED, fontsize=10)
ax.xaxis.grid(True, color=GRID, linewidth=0.9)
ax.set_axisbelow(True)
ax.spines[['top', 'right', 'left']].set_visible(False)
ax.tick_params(axis='y', length=0, pad=10)
ax.tick_params(axis='x', length=0, pad=8)
ax.legend(loc='upper right', frameon=False, ncol=2, bbox_to_anchor=(1, 1.18))
fig.text(0.32, 0.045,
         'Ne pas additionner ces barres : elles proviennent de scénarios et de témoins différents.',
         color=MUTED, fontsize=9)
finish(fig, 'memory-module-costs-2026-11-05.png')
