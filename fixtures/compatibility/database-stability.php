<?php
function verify($ok,$message){if(!$ok)throw new RuntimeException($message);}
$checks=[];
// Keep closed statement objects alive: their buffers must not consume the next owner's budget.
$closed=[];
for($i=0;$i<4;$i++){
 $m=new mysqli('localhost','root','','test');$s=$m->prepare('SELECT ?');$blob=null;$s->bind_param('b',$blob);
 $s->send_long_data(0,str_repeat('x',8*1024*1024));$m->close();$closed[]=$s;
 try{$s->execute();throw new RuntimeException('Closed statement accepted');}catch(Error $expected){}
}
$checks[]='closed connections immediately release long-data reservations';
$pdo=new PDO('mysql:dbname=test;charset=utf8mb4','root','',[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION]);
$pdo->exec('CREATE TABLE IF NOT EXISTS stability_rows(id INT PRIMARY KEY, value VARCHAR(80), amount DECIMAL(30,4), payload BLOB) ENGINE=InnoDB');
$pdo->exec('DELETE FROM stability_rows');
foreach([false,true] as $emulated){
 $pdo->setAttribute(PDO::ATTR_EMULATE_PREPARES,$emulated);
 $pdo->beginTransaction();$insert=$pdo->prepare('INSERT INTO stability_rows VALUES(:id,:value,:amount,:payload)');
 $insert->execute(['id'=>1,'value'=>'Ã©cole','amount'=>'9007199254740993.1234','payload'=>"\0\xff"]);
 try{$insert->execute(['id'=>1,'value'=>'duplicate','amount'=>'0','payload'=>'']);throw new RuntimeException('Duplicate key accepted');}catch(PDOException $expected){verify($expected->getCode()==='23000','PDO SQLSTATE lost');}
 verify($pdo->inTransaction(),'PDO transaction lost after statement error');$pdo->commit();
 $stmt=$pdo->prepare('SELECT value,amount,payload FROM stability_rows WHERE id=?');$stmt->execute([1]);$row=$stmt->fetch(PDO::FETCH_NUM);
 verify($row===['Ã©cole','9007199254740993.1234',"\0\xff"],'PDO values lost precision');$stmt->closeCursor();$stmt->execute([1]);verify($stmt->fetchColumn()==='Ã©cole','PDO cursor cannot be reused');$stmt->closeCursor();
 $m=new mysqli('localhost','root','','test');$m->begin_transaction();$m->query("UPDATE stability_rows SET value='temporary' WHERE id=1");$m->rollback();verify($pdo->query('SELECT value FROM stability_rows WHERE id=1')->fetchColumn()==='Ã©cole','Cross-driver rollback failed');$m->close();
 $pdo->exec('DELETE FROM stability_rows');
}
$checks[]='PDO native/emulated errors, transactions, cursor reuse and cross-driver rollback';
// Values straddling PHP int32, JS Number and signed/unsigned SQL BIGINT limits.
// Keep text parameters: casting before binding would already lose information.
$exact=['-9223372036854775808','-2147483649','2147483648','9007199254740993','9223372036854775807','18446744073709551615'];
foreach([false,true] as $emulated){
 $pdo->setAttribute(PDO::ATTR_EMULATE_PREPARES,$emulated);
 foreach($exact as $value){
  $cast=$value==='18446744073709551615'?'UNSIGNED':'SIGNED';
  $stmt=$pdo->prepare('SELECT CAST(? AS '.$cast.')');$stmt->execute([$value]);
  $got=$stmt->fetchColumn();verify(is_string($got)&&$got===$value,'PDO BIGINT precision lost: '.$value);$stmt->closeCursor();
 }
}
$m=new mysqli('localhost','root','','test');
foreach($exact as $value){
 $cast=$value==='18446744073709551615'?'UNSIGNED':'SIGNED';
 $stmt=$m->prepare('SELECT CAST(? AS '.$cast.')');$stmt->bind_param('s',$value);$stmt->execute();$stmt->bind_result($got);$stmt->fetch();
 verify(is_string($got)&&$got===$value,'MySQLi BIGINT precision lost: '.$value);$stmt->close();
}
$m->close();
$checks[]='exact SQL BIGINT beyond PHP int32 and JavaScript safe integer range';

echo json_encode(['ok'=>true,'checks'=>$checks]);
