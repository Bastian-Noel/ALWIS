# Essayer le Campus

[← Guide illustré](README.md)

Un petit site scolaire déjà rempli : élèves, cours, notes, messages, bibliothèque et factures.

## Ouvrir l’exemple

1. Depuis l’accueil, donnez un nom à un **nouveau projet**.
2. Choisissez **Exemple scolaire**, puis créez-le.
3. Dans **Code**, cliquez sur **Aperçu**.

![Le site Campus ouvert à côté de son code PHP.](images/alwis-code-light.png)

## Trois choses à essayer

### 1. Explorer les élèves

- Dans le site, ouvrez la liste des élèves.
- Dans ALWIS, allez dans **Données → school → students**.
- Retrouvez les mêmes informations dans la table.

### 2. Partager une note

1. Dans **Sessions**, ouvrez une fenêtre **Professeur** et une fenêtre **Élève**.
2. Côté professeur, modifiez une note de l’élève concerné.
3. Actualisez sa page côté élève pour voir le résultat.

### 3. Envoyer un message

1. Ouvrez la messagerie du Campus.
2. Choisissez un destinataire et envoyez un message.
3. Ouvrez le profil du destinataire pour le lire.

## Qui utilise le site ?

| Session prête à ouvrir | Profil |
|---|---|
| Administration | Camille |
| Professeur | Nora |
| Élève | Alice |
| Parent | Emma |

![Les quatre visiteurs du Campus dans l’espace Sessions.](images/alwis-sessions.png)

**Même session :** les fenêtres partagent l’identité. **Sessions différentes :** chaque visiteur garde la sienne.

> [!NOTE]
> Les profils sont librement sélectionnables pour essayer le site. Ce n’est pas un système de connexion destiné à la production.

## Garder vos essais

Cliquez sur **Enregistrer**, puis sur **Exporter ZIP** pour une copie sur le PC.
Créer un autre Campus ne remplace pas vos projets existants.

<details>
<summary>Pour explorer le code et les tables</summary>

| Élément | Contenu |
|---|---|
| Base `school` | 34 tables remplies et 40 clés étrangères |
| `schema.sql` | Structure des tables |
| `data/seed.json` | Données initiales |
| `install.php` | Installation initiale, sans réinitialiser vos changements à chaque visite |

Les données sont fictives. Certaines tables se modifient uniquement depuis **Données** ou **SQL**.

Le scénario automatisé vérifie les profils, les notes, les messages et la restauration : [test du Campus](../tests/browser/school-scenario.mjs).

</details>
