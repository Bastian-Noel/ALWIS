export const files = {
  'index.php': `<?php
session_start(); $_SESSION['visits']=($_SESSION['visits']??0)+1;
$db=new PDO('mysql:dbname=test;charset=utf8mb4','root','',[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION]);
$db->exec('CREATE TABLE IF NOT EXISTS studio_notes (id INT AUTO_INCREMENT PRIMARY KEY, label VARCHAR(200) NOT NULL) ENGINE=InnoDB');
if($_SERVER['REQUEST_METHOD']==='POST') { $stmt=$db->prepare('INSERT INTO studio_notes(label) VALUES (?)'); $stmt->execute([$_POST['label']??'']); }
$notes=$db->query('SELECT id,label FROM studio_notes ORDER BY id')->fetchAll(PDO::FETCH_ASSOC);
?><!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Projet scolaire</title><link rel="stylesheet" href="/style.css"></head><body><main><h1>Mon projet PHP</h1><p>Session : <code id="session"><?=htmlspecialchars(session_id())?></code></p><p>Visites de cette session : <strong id="visits"><?=$_SESSION['visits']?></strong></p><form method="post" action="/index.php"><label>Nouvelle note <input name="label" required></label><button>Ajouter à la base commune</button></form><ul id="notes"><?php foreach($notes as $note): ?><li><?=htmlspecialchars($note['label'])?></li><?php endforeach ?></ul><p><a href="/redirect.php">Tester une redirection</a></p><form method="post" enctype="multipart/form-data" action="/upload.php"><input type="file" name="attachment" required><button>Envoyer un fichier</button></form></main></body></html>`,
  'style.css': 'body{font:16px/1.6 system-ui;background:#edf3f9;color:#17314b;margin:0}main{max-width:700px;margin:45px auto;padding:28px;background:white;border-radius:16px}input,button{font:inherit;padding:8px;margin:8px}button{background:#204b77;color:white;border:0;border-radius:5px}code{overflow-wrap:anywhere}',
  'session.php': '<?php session_start(); header("Content-Type: application/json"); echo json_encode(["id"=>session_id(),"visits"=>$_SESSION["visits"]??0,"cookie"=>$_COOKIE["color"]??null]);',
  'redirect.php': '<?php header("Location: /index.php?redirected=1",true,302);',
  'upload.php': '<?php if(!isset($_FILES["attachment"]) || $_FILES["attachment"]["error"]!==UPLOAD_ERR_OK){http_response_code(400);exit("upload-error");} if(!is_dir(__DIR__."/uploads"))mkdir(__DIR__."/uploads"); $name=basename($_FILES["attachment"]["name"]); if(!move_uploaded_file($_FILES["attachment"]["tmp_name"],__DIR__."/uploads/".$name)){http_response_code(500);exit("move-error");} header("Content-Type: text/plain"); echo "uploaded:".$name;',
};
