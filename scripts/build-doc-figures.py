#!/usr/bin/env python3
"""Generate editable, deterministic SVG teaching figures. PNG export is separate."""
from pathlib import Path
from html import escape
import textwrap
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'docs/figures';OUT.mkdir(parents=True,exist_ok=True)
INK='#172b3a';MUTED='#526674';BLUE='#245edb';TEAL='#087e79';AMBER='#a96413'
PALE={'blue':'#eef3ff','teal':'#eaf7f3','amber':'#fff5e5','gray':'#f2f5f7'}
ACC={'blue':BLUE,'teal':TEAL,'amber':AMBER,'gray':MUTED}
class Figure:
 def __init__(self,slug,title,subtitle):
  self.slug=slug;self.s=[]
  self.s.append('<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="760" viewBox="0 0 1200 760" role="img"><title>'+escape(title)+'</title><desc>'+escape(subtitle)+'</desc><defs><marker id="arrow" markerWidth="10" markerHeight="10" refX="8" refY="5" orient="auto"><path d="M0,0 L10,5 L0,10" fill="'+MUTED+'"/></marker></defs>')
  self.rect(0,0,1200,760,'#ffffff',stroke='none')
  self.text(48,46,'ALWIS / GUIDE VISUEL',19,TEAL,bold=True)
  self.text(48,112,title,42,bold=True)
  self.text(48,159,subtitle,23,MUTED)
  self.s.append('<path d="M48 189 H1152" stroke="#dbe3e8"/>')
 def rect(self,x,y,w,h,fill='#fff',stroke='#d4dfe5',radius=12):
  self.s.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{radius}" fill="{fill}" stroke="{stroke}"/>')
 def text(self,x,y,value,size=25,color=INK,bold=False,mono=False):
  family='ui-monospace,DejaVu Sans Mono,monospace' if mono else 'system-ui,Segoe UI,Arial,sans-serif'
  self.s.append(f'<text x="{x}" y="{y}" fill="{color}" font-family="{family}" font-size="{size}" font-weight="{700 if bold else 400}">'+escape(str(value))+'</text>')
 def lines(self,x,y,value,width=25,size=24,color=INK):
  for i,line in enumerate(textwrap.wrap(value,width=width,break_long_words=False,break_on_hyphens=False)):self.text(x,y+i*(size+10),line,size,color)
 def card(self,x,y,w,h,title,body,tone='blue'):
  self.rect(x,y,w,h,PALE[tone],stroke='none');self.rect(x,y,5,h,ACC[tone],stroke='none',radius=0)
  self.text(x+24,y+43,title,27,ACC[tone],True)
  self.lines(x+24,y+88,body,width=max(15,int((w-48)/13)),size=23)
 def arrow(self,x1,y1,x2,y2,label=None):
  self.s.append(f'<path d="M{x1} {y1} L{x2} {y2}" fill="none" stroke="{MUTED}" stroke-width="2.5" marker-end="url(#arrow)"/>')
  if label:self.text(min(x1,x2)+8,min(y1,y2)-15,label,20,MUTED)
 def note(self,lines):
  wrapped=[part for line in (lines if isinstance(lines,list) else [lines]) for part in textwrap.wrap(line,width=87,break_long_words=False)]
  start=638-max(0,len(wrapped)-2)*35
  for i,line in enumerate(wrapped):self.text(48,start+i*35,line,24,MUTED)
 def save(self):
  self.s.append('<path d="M48 711 H1152" stroke="#dbe3e8"/>');self.text(48,743,'Schéma explicatif · les captures d’interface sont présentées séparément',18,MUTED)
  self.text(1028,743,'2026.11',18,MUTED);self.s.append('</svg>');(OUT/(self.slug+'.svg')).write_text('\n'.join(self.s)+'\n',encoding='utf-8')
def flow(slug,title,subtitle,cards,notes):
 f=Figure(slug,title,subtitle)
 for i,(name,body,tone) in enumerate(cards):
  x=48+i*384;f.card(x,272,336,248,name,body,tone)
  if i<2:f.arrow(x+344,396,x+374,396)
 f.note(notes);f.save()
flow('parcours','Un studio, trois façons d’apprendre','Choisissez une intention, puis avancez vers une tâche concrète.',[
 ('Découvrir','Ouvrir le Campus, modifier une page et voir le résultat.','blue'),
 ('Pratiquer','Modifier des données, relier des tables et tester deux visiteurs.','teal'),
 ('Approfondir','Comprendre PHP, HTTP, le stockage et le déploiement.','gray')],['Commencez par le résultat visible ; ouvrez les explications techniques au besoin.'])
flow('execution','PHP et MariaDB, dans le navigateur','Le serveur qui livre ALWIS n’exécute pas le PHP de votre projet.',[
 ('Votre page','HTML, JavaScript, formulaires et requêtes de l’aperçu.','blue'),
 ('Le navigateur','Service Worker, ProjectHub et runtime PHP WebAssembly.','teal'),
 ('Votre projet','Fichiers locaux et MariaDB dans le même runtime natif.','gray')],['MariaDB démarre au premier besoin SQL. Le JavaScript de la page reste côté navigateur.'])
f=Figure('valeurs','NULL, texte vide et zéro : quatre sens','Une cellule vide visuellement ne suffit pas à connaître sa valeur SQL.')
for i,(value,title,body,tone) in enumerate([('NULL','Absence','Valeur inconnue ou non renseignée.','amber'),("''",'Texte vide','Une chaîne présente, de longueur zéro.','blue'),('0','Nombre zéro','Un nombre utilisable dans un calcul.','teal'),("'0'",'Texte zéro','Un caractère ; son type reste textuel.','gray')]):
 x=48+i*282;f.rect(x,240,252,330,PALE[tone],stroke='none');f.text(x+24,306,value,43,ACC[tone],True,True);f.text(x+24,357,title,25,ACC[tone],True);f.lines(x+24,402,body,17,23)
f.note(['Testez l’absence avec IS NULL, et non avec = NULL.','Le type de la colonne et le mode de saisie déterminent l’interprétation.']);f.save()
f=Figure('entiers','Un grand entier ne doit perdre aucun chiffre','Repères de capacité ; les longueurs de bandes ne sont pas une échelle numérique.')
for y,label,limits,tone in [(235,'PHP du build actuel','−2 147 483 648 … 2 147 483 647','blue'),(365,'JavaScript Number','Entiers exacts jusqu’à 9 007 199 254 740 991','amber'),(495,'MariaDB BIGINT','Signé : jusqu’à 9 223 372 036 854 775 807','teal')]:
 f.text(48,y+27,label,24,ACC[tone],True);f.rect(48,y+48,1104,67,PALE[tone],stroke='none');f.text(72,y+92,limits,28,INK,mono=True)
f.note(['Hors de la plage PHP, les adaptateurs SQL conservent une représentation textuelle exacte.']);f.save()
f=Figure('decimal','DECIMAL : garder la précision du texte','Exemple pédagogique : une valeur SQL précise n’est pas un flottant JavaScript.')
f.rect(48,228,1104,133,PALE['teal'],stroke='none');f.text(80,280,'DECIMAL(30,4)',25,TEAL,True);f.text(80,331,'9007199254740993.1234',43,INK,mono=True)
f.card(48,415,510,170,'Chaîne conservée','La base reçoit les chiffres exacts, avec un paramètre lié.','teal');f.card(642,415,510,170,'Conversion en flottant','Un arrondi peut survenir avant même la requête SQL.','amber');f.arrow(320,370,320,402);f.arrow(880,370,880,402)
f.note(['En PHP : liez cette valeur comme texte ; ne la convertissez pas d’abord en float.']);f.save()
f=Figure('relations','Une classe, plusieurs élèves','Extrait réel du modèle Campus : students.class_id référence classes.id.')
for x,name,headers,rows in [(48,'classes','id (PK)     name', ['1           3e Tilleul']), (650,'students','id     user_id     class_id (FK)', ['1      4           1','2      5           1'])]:
 f.rect(x,248,502,286,'#fff');f.rect(x,248,502,64,PALE['teal'],stroke='none');f.text(x+24,290,name,29,TEAL,True,True);f.text(x+24,354,headers,21,MUTED,mono=True)
 for i,row in enumerate(rows):f.text(x+24,407+i*48,row,23,INK,mono=True)
f.arrow(562,385,635,385);f.text(576,347,'1:N',22,TEAL,True)
f.note(['Les deux élèves appartiennent à la même classe ; la clé étrangère évite un identifiant orphelin.','La relation porte sur les clés, pas sur la position des lignes à l’écran.']);f.save()
f=Figure('cle-composee','Quand l’identité est un couple','Campus : la clé primaire de enrollments réunit student_id et course_id.')
f.text(72,246,'student_id',26,MUTED,True,True);f.text(400,246,'course_id',26,MUTED,True,True);f.text(770,246,'Résultat',26,MUTED,True)
for y,a,b,label,tone in [(286,'1','1','Inscription valide','teal'),(386,'1','2','Autre cours : valide','blue'),(486,'1','1','Même couple : refusé','amber')]:
 f.rect(48,y,1104,78,PALE[tone],stroke='none');f.text(80,y+50,a,32,INK,mono=True);f.text(416,y+50,b,32,INK,mono=True);f.text(770,y+49,label,25,ACC[tone],True)
f.note(['Chaque identifiant peut se répéter séparément ; le couple complet doit rester unique.']);f.save()
flow('transaction','Valider ensemble, ou revenir en arrière','Une transaction organise un ensemble d’écritures SQL.',[
 ('BEGIN','La connexion ouvre une transaction ; les changements sont en cours.','blue'),
 ('Écritures SQL','INSERT, UPDATE ou DELETE ; contrôles de contraintes et erreurs.','gray'),
 ('COMMIT / ROLLBACK','Valider les écritures, ou annuler les changements de cette transaction.','teal')],['Une transaction SQL ne restaure pas les fichiers que PHP aurait écrits.'])
flow('sauvegarde','Enregistrer et exporter : deux protections','Le stockage du navigateur et une copie sur votre PC n’ont pas le même rôle.',[
 ('Travail en cours','Brouillons, fichiers et base modifiés pendant votre session.','blue'),
 ('Enregistrer','Un checkpoint du projet conservé dans ce navigateur et cette origine.','teal'),
 ('Exporter ZIP','Une copie transportable des fichiers et des bases sur votre ordinateur.','gray')],['Effacer les données du site peut supprimer le projet local. Le ZIP est une copie externe.','Les cookies et sessions visiteurs ne font pas partie de l’export du projet.'])
flow('import','Importer un projet sans tout charger en RAM','Le ZIP ou dossier est préparé avant l’ouverture du nouveau projet.',[
 ('Choisir','Sélectionner le ZIP ou le dossier, puis examiner son contenu.','blue'),
 ('Préparer','Sélection des fichiers, dépendances proposées à l’exclusion et budgets vérifiés.','gray'),
 ('Ouvrir','Copie sur le disque privé du navigateur, puis création du projet.','teal')],['Un import est une copie. Une liaison à un dossier du PC est un mode distinct, soumis à permission.'])
f=Figure('sessions','Deux identités, une même base','Des cookies privés par visiteur ; des fichiers et tables partagés pour le projet.')
f.card(48,258,325,245,'Visiteur A','Son identité et ses cookies. Exemple : le professeur.','blue');f.card(442,258,325,245,'Projet commun','PHP et MariaDB chez le propriétaire du projet.','teal');f.card(826,258,325,245,'Visiteur B','Son identité et ses cookies. Exemple : un élève.','gray');f.arrow(384,380,428,380);f.arrow(812,380,780,380)
f.note(['Un changement SQL peut être visible des deux visiteurs ; leurs connexions PHP restent distinctes.','Les profils du Campus sont une démonstration, pas une authentification de production.']);f.save()
flow('http','Une requête entre dans le projet','Le routage conserve un échange HTTP : méthode, adresse, en-têtes et corps.',[
 ('Requête','GET /index.php ou POST /action.php avec les données du formulaire.','blue'),
 ('Exécution PHP','Le routeur transmet la requête au runtime propriétaire du projet.','teal'),
 ('Réponse','Statut HTTP, en-têtes et corps : HTML, JSON, binaire ou redirection.','gray')],['Le JavaScript reçu s’exécute dans la page du visiteur ; PHP s’exécute dans le runtime hôte.'])
flow('collaboration','Partager l’exécution, pas une copie d’écran','Le navigateur hôte conserve le projet ; l’invité reçoit des réponses HTTP.',[
 ('Invité','Sa page exécute son JavaScript et demande ses ressources au relais HTTP.','blue'),
 ('Transport','WebRTC ou relais serveur ; contrôle des droits et requêtes bornées.','gray'),
 ('Hôte','ProjectHub exécute PHP et SQL, puis renvoie une réponse normalisée.','teal')],['L’aperçu HTTP distant requiert une origine dédiée correctement configurée en HTTPS.','Si l’hôte part, le lien ne devient pas un hébergement PHP permanent.'])
flow('stockage','Trois rôles dans le stockage local','Les fichiers, le catalogue et le checkpoint ne sont pas trois copies complètes du projet.',[
 ('OPFS','Objets de fichiers sur le disque privé du navigateur.','teal'),
 ('IndexedDB','Catalogue et générations : quelles versions de fichiers composent le projet.','blue'),
 ('Checkpoint','État de reprise SQL associé à une génération cohérente du catalogue.','gray')],['Un fichier inchangé peut être réutilisé ; une sauvegarde ne recharge pas tous les médias en RAM.'])
f=Figure('memoire','Disque, tas WASM et mémoire du navigateur','Trois mesures distinctes : ne les additionnez pas sans connaître leur périmètre.')
for y,title,body,tone in [(232,'Projet sur disque','OPFS : taille des fichiers persistés, pas taille du tas PHP.','teal'),(360,'Mémoire linéaire WASM','Allocation du moteur ; ce build démarre à 256 Mio, plafond 512 Mio.','blue'),(488,'Processus navigateur','JavaScript, éditeurs, workers, buffers et autres allocations.','amber')]:f.card(48,y,1104,108,title,body,tone)
f.note(['Une limite de 2 Gio sur disque n’est pas une promesse de consommer 2 Gio de RAM.']);f.save()
flow('publication','Du commit validé au site et au conteneur','L’application et les outils de déploiement peuvent avoir des commits différents.',[
 ('Valider','CI navigateur, inventaire des fichiers, version et empreintes du paquet.','blue'),
 ('Publier la release','ZIP immuable, sources correspondantes du WASM et sommes SHA-256.','teal'),
 ('Distribuer','FTP : même contenu. GHCR : image AMD64/ARM64 du même paquet.','gray')],['Le contrôle de publication applique une exception interne documentée pour deux fichiers PHP.','Cette exception ne signifie pas que le problème de compatibilité de licence est corrigé.'])
flow('cycle-php','Une requête PHP doit laisser place à la suivante','Le runtime reste vivant ; les ressources de chaque requête sont nettoyées.',[
 ('Préparer','Contexte HTTP, identifiant propriétaire SQL et état PHP de la requête.','blue'),
 ('Exécuter','Script, résultats SQL et réponse ; une erreur fatale peut interrompre le script.','gray'),
 ('Nettoyer','Libérer les ressources de la requête, traiter les transactions et rétablir l’état.','teal')],['Les tests couvrent une erreur fatale puis une requête saine ; ils ne prouvent pas une endurance illimitée.'])
f=Figure('structure','Lire une colonne avant de modifier sa valeur','Exemple pédagogique de définition SQL et de conséquences pour la saisie.')
for y,name,meaning,tone in [(240,'id INT PRIMARY KEY','Identifie une ligne ; la clé doit rester unique.','blue'),(356,'score DECIMAL(4,2) NULL','Deux décimales ; l’absence de note peut être NULL.','teal'),(472,"comment VARCHAR(240) NOT NULL DEFAULT ''",'Un texte est requis ; sa valeur par défaut est une chaîne vide.','gray')]:
 f.rect(48,y,1104,94,PALE[tone],stroke='none');f.text(72,y+38,name,26,ACC[tone],True,True);f.text(72,y+75,meaning,23)
f.note(['DEFAULT, NULL et type sont trois propriétés différentes, à examiner séparément.']);f.save()
flow('diagnostic','Chercher l’erreur au bon niveau','Le même écran peut afficher un problème de code, de SQL ou de transport.',[
 ('PHP / HTTP','Lire le statut, la réponse et le message PHP dans le panneau Serveur.','blue'),
 ('SQL / données','Lire SQLSTATE, clé ou colonne concernée ; conserver le brouillon à corriger.','amber'),
 ('Stockage / réseau','Vérifier quota, permission de dossier, origine HTTPS et connexion à l’hôte.','gray')],['Une action refusée n’est pas une confirmation de sauvegarde : vérifiez le résultat annoncé.'])
print('Generated',len(list(OUT.glob('*.svg'))),'SVG teaching figures')
