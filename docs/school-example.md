# Exemple Campus ALWIS

Depuis l’accueil, créez **un nouveau projet** avec « Exemple scolaire ». Les anciens projets ne sont pas remplacés : leurs fichiers, bases et modifications sont conservés.

La base `school` contient 34 tables remplies et 40 clés étrangères :

| Domaine | Tables |
|---|---|
| Organisation | campuses, years, terms, departments, rooms |
| Identités | users, roles, user_roles, teachers, guardians, students, student_guardians |
| Scolarité | classes, enrollments, subjects, courses, class_courses, lessons, attendance |
| Évaluation | assignments, submissions, grades |
| Communication | messages, message_recipients, announcements, studio_notes |
| Vie scolaire | clubs, club_members, library_books, library_loans |
| Facturation | invoices, invoice_lines, payments |
| Installation | school_meta |

Le propriétaire crée quatre sessions : Administration (Camille), Professeur (Nora), Élève (Alice) et Parent (Emma). Dans **Sessions**, ouvrez plusieurs fenêtres. Chaque session garde son profil et ses cookies ; deux fenêtres du même groupe les partagent. Les requêtes simultanées sont ordonnancées sur le propriétaire PHP/SQL commun. Ce scénario n’exige pas un moteur par fenêtre.

L’application propose sept espaces : accueil/carnet commun, élèves/classes, cours/salles, devoirs/notes, bibliothèque/emprunts, messages et factures. Les formulaires de profil, note, résultat scolaire et message utilisent les services PHP/PDO réels, une protection CSRF et une redirection après POST. La transaction d’envoi évite les messages orphelins ; une erreur de saisie conserve les champs. Les liens composés et plusieurs tables de liaison permettent d’explorer les relations dans Schéma.

`install.php` installe la version initiale une seule fois ; il ne réinsère pas les données modifiées lors des visites suivantes. `schema.sql` et `data/seed.json` rendent le contenu initial lisible. Les dates sont fixes pour rendre le jeu reproductible. Exporter le projet emporte fichiers et base.

Les profils sont sélectionnables librement pour la démonstration : ce n’est pas une authentification pour un serveur de production. Les données affichées sont de démonstration. Tous les domaines ont un contenu initial ; seules les actions proposées ont une interface d’écriture. L’administration générale des autres tables se fait dans les outils SQL d’ALWIS.

Le test du **paquet statique exact** vérifie les 34 tables non vides, 40 clés étrangères, quatre fenêtres simultanées, l’isolation des profils, le carnet partagé, une note professeur visible par l’élève, la messagerie, le rollback après destinataire invalide et la conservation après sauvegarde/redémarrage, dans Chromium et Firefox. Les résultats figurent dans l’artefact de validation `site-smoke.json`.
