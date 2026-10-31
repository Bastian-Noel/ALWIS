<?php
/** Executed unchanged by the real browser harness; no mock database. */
declare(strict_types=1);
header('Content-Type: application/json');
function verify(bool $ok, string $why): void { if (!$ok) throw new RuntimeException($why); }
verify(extension_loaded('mysqli') && extension_loaded('pdo_mysql'), 'extension discovery');
verify(in_array('mysqli_stmt_execute', get_extension_funcs('mysqli'), true), 'mysqli extension functions');
$checks=[];
foreach ([true,false] as $emulate) {
    $pdo=new PDO('mysql:dbname=school;charset=utf8mb4','root','',[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION,PDO::ATTR_EMULATE_PREPARES=>$emulate]);
    $q=$pdo->prepare('SELECT :label AS label, :n AS nullable, :bin AS payload');
    $label='Unicode 🎲'; $n=null; $bin="A\0B\xff";
    $q->bindParam(':label',$label,PDO::PARAM_STR); $q->bindValue(':n',$n,PDO::PARAM_NULL); $q->bindValue(':bin',$bin,PDO::PARAM_LOB);
    $label='changed 🎲'; $q->execute();$row=$q->fetch(PDO::FETCH_OBJ);
    verify($row->label===$label && $row->nullable===null && $row->payload===$bin,'PDO bound types');$q->closeCursor();
    $q=$pdo->query("SELECT 'a' AS k,'b' AS v UNION ALL SELECT 'c','d'");verify($q->fetchAll(PDO::FETCH_KEY_PAIR)===['a'=>'b','c'=>'d'],'PDO key pairs');
    $q=$pdo->query('SELECT 1 AS n'); $q->bindColumn('n',$value);verify($q->fetch(PDO::FETCH_BOUND) && (string)$value==='1','PDO bindColumn');$q->closeCursor();
    $q=$pdo->query('SELECT 1 AS n');verify($q->columnCount()===1 && $q->getColumnMeta(0)['name']==='n','PDO column metadata');$q->closeCursor();
    foreach ([true,false] as $buffered) {
        $pdo->setAttribute(PDO::MYSQL_ATTR_USE_BUFFERED_QUERY,$buffered);
        foreach (["SELECT REPEAT('x',65536) FROM seq_1_to_1000",'SELECT seq FROM seq_1_to_10001'] as $sql) {
            $refused=false;
            try {$q=$pdo->prepare($sql);$q->execute();$q->fetchAll();}catch(PDOException $e){$refused=str_contains($e->getMessage(),'WASM result exceeds');}
            verify($refused,'PDO result budget refusal');unset($q);
            verify((string)$pdo->query('SELECT 42')->fetchColumn()==='42','PDO recovery after budget refusal');
        }
    }
    $checks[]='PDO emulate='.($emulate?'true':'false').': binds/fetch modes/metadata/buffered+unbuffered result limits/recovery';
}
$db=mysqli_init();verify(mysqli_real_connect($db,'localhost','root','','school'),'init/connect');
verify(mysqli_select_db($db,'school') && mysqli_set_charset($db,'utf8mb4'),'database/charset');
$text="quote' slash\\ zero\0 🎲";$escaped=mysqli_real_escape_string($db,$text);
verify($db->query("SELECT '".$escaped."' AS value")->fetch_assoc()['value']===$text,'escape roundtrip');
verify(mysqli_character_set_name($db)==='utf8mb4' && mysqli_get_server_version($db)>0 && mysqli_get_client_version()>0,'client/server information');
verify(mysqli_errno($db)===0 && mysqli_error($db)==='' && mysqli_sqlstate($db)==='00000','diagnostics');
$db->query('CREATE TABLE IF NOT EXISTS compatibility_tx (id INT PRIMARY KEY,value INT) ENGINE=InnoDB');
$db->query('DELETE FROM compatibility_tx');$db->query('INSERT INTO compatibility_tx VALUES(1,1)');
verify(mysqli_affected_rows($db)===1 && $db->autocommit(false),'affected/autocommit');
$db->query('UPDATE compatibility_tx SET value=2 WHERE id=1');$db->rollback();
verify($db->query('SELECT value FROM compatibility_tx')->fetch_assoc()['value']==='1','rollback/autocommit');$db->autocommit(true);
foreach (["SELECT REPEAT('x',65536) FROM seq_1_to_1000",'SELECT seq FROM seq_1_to_10001'] as $sql) {
    foreach ([false,true] as $prepared) {
        $refused=false;
        try {if($prepared){$s=$db->prepare($sql);$s->execute();$r=$s->get_result();}else{$r=$db->query($sql);}}
        catch(mysqli_sql_exception $e){$refused=str_contains($e->getMessage(),'WASM result exceeds');}
        verify($refused,'mysqli result budget refusal');unset($r,$s);
        verify($db->query('SELECT 42 AS n')->fetch_assoc()['n']==='42','mysqli recovery after budget refusal');
    }
}
$r=$db->query("SELECT 'a' AS value UNION ALL SELECT 'b'");
verify($r instanceof IteratorAggregate && iterator_to_array($r)===[['value'=>'a'],['value'=>'b']], 'mysqli foreach/getIterator');
$r->data_seek(0);verify(mysqli_fetch_column($r)==='a' && mysqli_num_fields($r)===1,'fetch_column/num_fields');
verify(mysqli_fetch_lengths($r)===[1], 'fetch_lengths');
$r->field_seek(0);verify(mysqli_field_tell($r)===0 && $r->fetch_field()->name==='value','field cursor');$r->free_result();
$s=$db->prepare('SELECT ? AS n UNION ALL SELECT 99');$value=42;$s->bind_param('i',$value);$s->execute();$s->store_result();
verify(mysqli_stmt_num_rows($s)===2 && mysqli_stmt_param_count($s)===1 && mysqli_stmt_field_count($s)===1,'statement counters');
$s->bind_result($out);$s->data_seek(1);verify($s->fetch() && $out===99,'statement seek');
$s->free_result();verify($s->reset(),'statement reset');$value=43;$s->execute();verify($s->get_result()->fetch_column()===43,'statement reexecution after reset');
verify(mysqli_stmt_errno($s)===0 && mysqli_stmt_error($s)==='' && mysqli_stmt_sqlstate($s)==='00000','statement diagnostics');
$s->close();$checks[]='MySQLi foreach, scalar fetch, lengths, field cursor, statement seek/free/reset/reexecute';
$db->close();$checks[]='MySQLi extension/init/connect/escape/diagnostics/autocommit/rollback/text+binary result budgets/recovery';
echo json_encode(['ok'=>true,'checks'=>$checks],JSON_THROW_ON_ERROR|JSON_UNESCAPED_UNICODE);
