import { statements } from "./school-schema.mjs";
export const files = {
  "data/seed.json": JSON.stringify(statements, null, 2),
  "schema.sql": statements.join(";\n\n") + ";\n",
  "install.php": `<?php
// Installer idempotent : le jeu initial ne remplace jamais les données modifiées.
$db = new PDO('mysql:dbname=test;charset=utf8mb4', 'root', '', [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
$db->exec('CREATE DATABASE IF NOT EXISTS school CHARACTER SET utf8mb4');
$db->exec('USE school');
$db->exec('CREATE TABLE IF NOT EXISTS school_meta (id INT PRIMARY KEY, version INT NOT NULL) ENGINE=InnoDB');
if (!$db->query('SELECT version FROM school_meta WHERE id=1')->fetchColumn()) {
    $queries = json_decode(file_get_contents(__DIR__.'/data/seed.json'), true, 512, JSON_THROW_ON_ERROR);
    foreach ($queries as $query) if (str_starts_with($query, 'CREATE ')) $db->exec($query);
    $db->beginTransaction();
    try {
        foreach ($queries as $query) if (!str_starts_with($query, 'CREATE ')) $db->exec($query);
        $db->exec('INSERT INTO school_meta VALUES (1,1)');
        $db->commit();
    } catch (Throwable $error) { $db->rollBack(); throw $error; }
}
`,
  "bootstrap.php": `<?php
session_start();
require __DIR__.'/install.php';
$_SESSION['visits'] = ($_SESSION['visits'] ?? 0) + 1;
$_SESSION['csrf'] ??= bin2hex(random_bytes(20));
function h($value) { return htmlspecialchars((string)$value, ENT_QUOTES, 'UTF-8'); }
$userId = (int)($_SESSION['user_id'] ?? 1);
$findUser = $db->prepare('SELECT id,name,profile FROM users WHERE id=?');
$findUser->execute([$userId]); $user = $findUser->fetch(PDO::FETCH_ASSOC);
`,
  "index.php": `<?php
require __DIR__.'/bootstrap.php';
$pages = ['dashboard'=>'Accueil', 'students'=>'Élèves', 'courses'=>'Cours', 'assignments'=>'Devoirs', 'library'=>'Bibliothèque', 'messages'=>'Messages', 'finance'=>'Factures'];
$page = $_GET['page'] ?? 'dashboard'; if (!isset($pages[$page])) $page = 'dashboard';
$allUsers = $db->query('SELECT id,name,profile FROM users ORDER BY id')->fetchAll(PDO::FETCH_ASSOC);
$notice = $_SESSION['notice'] ?? null; unset($_SESSION['notice']);
$draft = $_SESSION['draft'] ?? []; unset($_SESSION['draft']);
?><!doctype html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Campus ALWIS — <?=h($pages[$page])?></title><link rel="stylesheet" href="/style.css"></head>
<body><header><b>Campus des Tilleuls</b><span>Année 2026–2027 · Démonstration</span></header><main>
<section class="identity"><div><h1><?=h($pages[$page])?></h1><p>Bonjour <strong id="profile"><?=h($user['name'])?></strong> · <?=h($user['profile'])?></p></div>
<form method="post" action="/action.php"><input type="hidden" name="csrf" value="<?=h($_SESSION['csrf'])?>"><input type="hidden" name="action" value="profile"><label>Profil de cette session<select name="user_id"><?php foreach($allUsers as $person):?><option value="<?=$person['id']?>" <?=$person['id']===$user['id']?'selected':''?>><?=h($person['name'].' · '.$person['profile'])?></option><?php endforeach?></select></label><button>Changer de profil</button></form></section>
<nav><?php foreach($pages as $key=>$label):?><a href="/index.php?page=<?=h($key)?>" <?=$page===$key?'aria-current="page"':''?>><?=h($label)?></a><?php endforeach?></nav>
<?php if($notice):?><p class="notice" role="status"><?=h($notice)?></p><?php endif?>
<?php if($page==='dashboard'): ?>
<section class="cards"><?php foreach(['students'=>'Élèves','teachers'=>'Professeurs','courses'=>'Cours','library_books'=>'Livres'] as $table=>$label):?><article><strong><?=$db->query('SELECT COUNT(*) FROM '.$table)->fetchColumn()?></strong><?=h($label)?></article><?php endforeach?></section>
<h2>À la une</h2><?php foreach($db->query('SELECT title,body FROM announcements') as $news):?><article><h3><?=h($news['title'])?></h3><p><?=h($news['body'])?></p></article><?php endforeach?>
<h2>Le carnet commun</h2><form method="post" action="/action.php"><input type="hidden" name="csrf" value="<?=h($_SESSION['csrf'])?>"><input type="hidden" name="action" value="note"><label>Nouvelle note<input name="label" maxlength="200" required value="<?=h($draft['label']??'')?>"></label><button>Ajouter à la base commune</button></form><ul id="notes"><?php foreach($db->query('SELECT label FROM studio_notes ORDER BY id DESC LIMIT 30') as $note):?><li><?=h($note['label'])?></li><?php endforeach?></ul>
<aside><h3>Essayer plusieurs utilisateurs</h3><p>Dans ALWIS → Sessions, ouvrez Administration, Professeur, Élève et Parent simultanément. Changez un profil dans une fenêtre : les autres gardent leur identité. Les notes et les messages sont communs ; rechargez une autre fenêtre pour voir les changements. Deux fenêtres rattachées à la même session partagent leur profil.</p><p>Session <code id="session"><?=h(session_id())?></code> · visites <strong id="visits"><?=$_SESSION['visits']?></strong>.</p><p>34 tables liées et remplies, dont la table de version. Consultez la base <b>school</b> dans Données et Schéma. Les dates sont fixes pour rendre l’exemple reproductible.</p></aside>
<?php elseif($page==='students'): ?>
<h2>Classes et inscriptions</h2><table><thead><tr><th>Matricule</th><th>Élève</th><th>Classe</th><th>Campus</th></tr></thead><tbody><?php foreach($db->query('SELECT s.student_number,u.name,c.name AS class_name,ca.name AS campus FROM students s JOIN users u ON u.id=s.user_id JOIN enrollments e ON e.student_id=s.id JOIN classes c ON c.id=e.class_id JOIN campuses ca ON ca.id=c.campus_id ORDER BY s.id') as $row):?><tr><?php foreach($row as $key=>$value): if(is_int($key))continue;?><td><?=h($value)?></td><?php endforeach?></tr><?php endforeach?></tbody></table>
<?php elseif($page==='courses'): ?>
<h2>Prochaines séances</h2><table><thead><tr><th>Cours</th><th>Professeur</th><th>Séance</th><th>Salle</th><th>Date</th></tr></thead><tbody><?php foreach($db->query('SELECT c.title,u.name,l.title AS lesson,r.name AS room,l.starts_at FROM lessons l JOIN courses c ON c.id=l.course_id JOIN teachers t ON t.id=c.teacher_id JOIN users u ON u.id=t.user_id JOIN rooms r ON r.id=l.room_id ORDER BY l.starts_at') as $row):?><tr><?php foreach($row as $key=>$value): if(is_int($key))continue;?><td><?=h($value)?></td><?php endforeach?></tr><?php endforeach?></tbody></table>
<?php elseif($page==='assignments'): ?>
<h2>Devoirs et résultats</h2><table><thead><tr><th>Élève</th><th>Devoir</th><th>Note</th><th>Commentaire</th></tr></thead><tbody><?php $q=$db->prepare('SELECT u.name,a.title,g.score,g.comment FROM grades g JOIN assignments a ON a.id=g.assignment_id JOIN students s ON s.id=g.student_id JOIN users u ON u.id=s.user_id WHERE ?=1 OR s.user_id=? OR s.id IN (SELECT sg.student_id FROM student_guardians sg JOIN guardians gu ON gu.id=sg.guardian_id WHERE gu.user_id=?) ORDER BY g.id'); $q->execute([in_array($user['profile'],['administration','professeur'],true)?1:0,$user['id'],$user['id']]); foreach($q as $row):?><tr><?php foreach($row as $key=>$value):if(is_int($key))continue;?><td><?=h($value)?></td><?php endforeach?></tr><?php endforeach?></tbody></table>
<?php if(in_array($user['profile'],['administration','professeur'],true)):?><h3>Saisir une note</h3><form method="post" action="/action.php"><input type="hidden" name="csrf" value="<?=h($_SESSION['csrf'])?>"><input type="hidden" name="action" value="grade"><label>Élève<select name="student_id"><?php foreach($db->query('SELECT s.id,u.name FROM students s JOIN users u ON u.id=s.user_id') as $row):?><option value="<?=$row['id']?>"><?=h($row['name'])?></option><?php endforeach?></select></label><label>Devoir<select name="assignment_id"><?php foreach($db->query('SELECT id,title FROM assignments') as $row):?><option value="<?=$row['id']?>"><?=h($row['title'])?></option><?php endforeach?></select></label><label>Note sur 20<input name="score" type="number" min="0" max="20" step="0.01" required value="<?=h($draft['score']??'')?>"></label><button>Enregistrer</button></form><?php endif?>
<?php elseif($page==='library'): ?>
<h2>Catalogue et emprunts</h2><table><thead><tr><th>Titre</th><th>Auteur</th><th>Exemplaires</th></tr></thead><tbody><?php foreach($db->query('SELECT title,author,copies FROM library_books ORDER BY id') as $row):?><tr><?php foreach($row as $key=>$value):if(is_int($key))continue;?><td><?=h($value)?></td><?php endforeach?></tr><?php endforeach?></tbody></table><h3>Emprunts en cours</h3><ul><?php foreach($db->query('SELECT b.title,u.name,l.due_at FROM library_loans l JOIN library_books b ON b.id=l.book_id JOIN students s ON s.id=l.student_id JOIN users u ON u.id=s.user_id WHERE l.returned_at IS NULL') as $row):?><li><?=h($row['title'].' — '.$row['name'].' — retour le '.$row['due_at'])?></li><?php endforeach?></ul>
<?php elseif($page==='messages'): ?>
<h2>Ma messagerie</h2><?php $q=$db->prepare('SELECT m.subject,m.body,u.name FROM messages m JOIN message_recipients r ON r.message_id=m.id JOIN users u ON u.id=m.sender_id WHERE r.user_id=? ORDER BY m.id DESC LIMIT 30');$q->execute([$user['id']]);foreach($q as $row):?><article><h3><?=h($row['subject'])?></h3><p><?=h($row['body'])?></p><small><?=h($row['name'])?></small></article><?php endforeach?><h3>Nouveau message</h3><form method="post" action="/action.php"><input type="hidden" name="csrf" value="<?=h($_SESSION['csrf'])?>"><input type="hidden" name="action" value="message"><label>Destinataire<select name="recipient_id"><?php foreach($allUsers as $person):?><option value="<?=$person['id']?>"><?=h($person['name'])?></option><?php endforeach?></select></label><label>Objet<input name="subject" maxlength="120" required value="<?=h($draft['subject']??'')?>"></label><label>Message<textarea name="body" maxlength="2000" required><?=h($draft['body']??'')?></textarea></label><button>Envoyer</button></form>
<?php elseif($page==='finance'): ?>
<h2>Factures et paiements</h2><table><thead><tr><th>Référence</th><th>Élève</th><th>Total</th><th>Déjà payé</th></tr></thead><tbody><?php $q=$db->prepare('SELECT i.reference,u.name,i.total,COALESCE(SUM(p.amount),0) AS paid FROM invoices i JOIN students s ON s.id=i.student_id JOIN users u ON u.id=s.user_id LEFT JOIN payments p ON p.invoice_id=i.id WHERE ?=1 OR s.user_id=? OR s.id IN (SELECT sg.student_id FROM student_guardians sg JOIN guardians gu ON gu.id=sg.guardian_id WHERE gu.user_id=?) GROUP BY i.id,i.reference,u.name,i.total ORDER BY i.id');$q->execute([$user['id'],$user['id'],$user['id']]);foreach($q as $row):?><tr><?php foreach($row as $key=>$value):if(is_int($key))continue;?><td><?=h($value)?></td><?php endforeach?></tr><?php endforeach?></tbody></table>
<?php endif?>
<footer>Exemple local pédagogique : les profils sont librement sélectionnables, ce n’est pas une authentification de production. <a href="/redirect.php">Redirection</a> · <a href="/session.php">État de session JSON</a><form method="post" enctype="multipart/form-data" action="/upload.php"><label>Pièce jointe<input type="file" name="attachment" required></label><button>Envoyer un fichier</button></form></footer></main></body></html>`,
  "action.php": `<?php
require __DIR__.'/bootstrap.php';
if ($_SERVER['REQUEST_METHOD'] !== 'POST') { http_response_code(405); exit('Utilisez le formulaire.'); }
if (!hash_equals($_SESSION['csrf'], (string)($_POST['csrf']??''))) { http_response_code(403); exit('Formulaire expiré : rechargez la page.'); }
$action=$_POST['action']??''; $next='dashboard';
try {
    if($action==='profile') {
        $findUser->execute([(int)($_POST['user_id']??0)]); $selected=$findUser->fetch(PDO::FETCH_ASSOC);
        if(!$selected)throw new RuntimeException('Profil inconnu.');
        $_SESSION['user_id']=$selected['id']; $_SESSION['notice']='Profil changé uniquement dans cette session.';
    } elseif($action==='note') {
        $label=trim((string)($_POST['label']??'')); if($label===''||strlen($label)>200)throw new RuntimeException('Saisissez une note de 1 à 200 octets.');
        $db->prepare('INSERT INTO studio_notes(label) VALUES(?)')->execute([$label]); $_SESSION['notice']='Note ajoutée au carnet commun.';
    } elseif($action==='grade') {
        $next='assignments'; if(!in_array($user['profile'],['administration','professeur'],true))throw new RuntimeException('Ce profil ne peut pas modifier les notes.');
        $score=(string)($_POST['score']??''); if(!preg_match('/^(?:[0-9]|1[0-9]|20)(?:[.][0-9]{1,2})?$/D',$score)||(float)$score>20)throw new RuntimeException('La note doit être comprise entre 0 et 20, avec deux décimales au maximum.');
        $db->prepare('INSERT INTO grades(assignment_id,student_id,score,comment) VALUES(?,?,?,?) ON DUPLICATE KEY UPDATE score=VALUES(score),comment=VALUES(comment)')->execute([(int)($_POST['assignment_id']??0),(int)($_POST['student_id']??0),$score,'Mis à jour dans la démonstration']);
        $_SESSION['notice']='Note enregistrée dans la base commune.';
    } elseif($action==='message') {
        $next='messages';$subject=trim((string)($_POST['subject']??''));$body=trim((string)($_POST['body']??''));
        if($subject===''||strlen($subject)>120||$body===''||strlen($body)>2000)throw new RuntimeException('Objet et message obligatoires ; respectez les longueurs indiquées.');
        $db->beginTransaction();$db->prepare('INSERT INTO messages(sender_id,subject,body) VALUES(?,?,?)')->execute([$user['id'],$subject,$body]);
        $db->prepare('INSERT INTO message_recipients(message_id,user_id) VALUES(?,?)')->execute([$db->lastInsertId(),(int)($_POST['recipient_id']??0)]);$db->commit();$_SESSION['notice']='Message envoyé.';
    } else throw new RuntimeException('Action inconnue.');
} catch(Throwable $error) {
    if($db->inTransaction())$db->rollBack();
    $_SESSION['draft']=array_intersect_key($_POST,array_flip(['label','score','subject','body']));
    $_SESSION['notice']=$error instanceof PDOException?'Données invalides ou lien inexistant. La saisie est conservée.':$error->getMessage();
}
header('Location: /index.php?page='.$next,true,303);`,
  "style.css": `:root{color-scheme:light}*{box-sizing:border-box}body{font:16px/1.5 system-ui;background:#f1f3f5;color:#192735;margin:0}header{display:flex;justify-content:space-between;gap:16px;padding:18px 5%;background:#183d56;color:white}main{max-width:1100px;margin:24px auto;padding:0 20px}.identity,.cards{display:flex;gap:18px;flex-wrap:wrap;justify-content:space-between}.cards article{flex:1;min-width:130px}.cards strong{display:block;font-size:30px}nav{display:flex;gap:6px;flex-wrap:wrap;border-bottom:1px solid #c9d1d8;margin:24px 0;padding-bottom:12px}a{color:#15587d}nav a{padding:8px;text-decoration:none}nav a[aria-current]{background:#183d56;color:white;border-radius:4px}article,aside{padding:20px;background:white;border:1px solid #d0d7de;border-radius:6px;margin:14px 0}label{display:flex;flex-direction:column;gap:5px}form{display:flex;align-items:end;gap:12px;flex-wrap:wrap;margin:16px 0}input,select,textarea,button{font:inherit;padding:8px;border:1px solid #8998a5;border-radius:4px;max-width:100%}button{background:#185b7e;color:white;cursor:pointer}textarea{min-height:90px}table{width:100%;border-collapse:collapse;background:white;display:block;overflow:auto}th,td{text-align:left;padding:12px;border-bottom:1px solid #d0d7de;white-space:nowrap}th{background:#e0e8ee}code{overflow-wrap:anywhere}.notice{padding:12px;background:#e0f0e8;border:1px solid #589c78}footer{margin:30px 0;font-size:14px;color:#465562}h1{margin:0}h2{margin-top:28px}:focus-visible{outline:3px solid #b86900;outline-offset:3px}`,
  "session.php": `<?php session_start(); header('Content-Type: application/json'); echo json_encode(['id'=>session_id(),'visits'=>$_SESSION['visits']??0,'user_id'=>$_SESSION['user_id']??1,'cookie'=>$_COOKIE['color']??null]);`,
  "redirect.php": `<?php header('Location: /index.php?redirected=1',true,302);`,
  "upload.php": `<?php if(!isset($_FILES['attachment'])||$_FILES['attachment']['error']!==UPLOAD_ERR_OK){http_response_code(400);exit('upload-error');}if(!is_dir(__DIR__.'/uploads'))mkdir(__DIR__.'/uploads');$name=basename($_FILES['attachment']['name']);if($name==='.'||$name==='..'||preg_match('/[\\x00-\\x1f]/',$name)){http_response_code(400);exit('Nom invalide');}if(!move_uploaded_file($_FILES['attachment']['tmp_name'],__DIR__.'/uploads/'.$name)){http_response_code(500);exit('move-error');}header('Content-Type: text/plain');echo 'uploaded:'.$name;`,
  "README.md": `# Campus ALWIS\n\n34 tables MariaDB dont 33 tables métier reliées, dix profils de démonstration et quatre sessions prêtes. Ouvrez plusieurs fenêtres dans Sessions. Deux fenêtres du même groupe partagent leurs cookies ; les autres sont indépendantes. Les requêtes simultanées partagent le propriétaire PHP/SQL et sont ordonnancées, sans prétendre exécuter plusieurs moteurs en parallèle.\n\nAccueil et carnet commun, élèves/classes, cours/salles, devoirs et notes, bibliothèque, messagerie avec transaction, factures et paiements. Les profils de démonstration sont sélectionnables librement et ne constituent pas une authentification de production.\n\nL’installation est idempotente ; elle ne réinsère pas les données après leur modification. Les formulaires ont une protection CSRF et redirigent après POST. Exportez le projet pour conserver fichiers et base school. La base test reste disponible pour vos essais SQL.\n`,
};
