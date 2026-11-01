<?php
function check($ok, $message) { if (!$ok) throw new RuntimeException($message); }
$pdo = new PDO('mysql:dbname=test;charset=utf8mb4', 'root', '', [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
$pdo->exec('CREATE TABLE essential_records (id INT PRIMARY KEY, title VARCHAR(80), payload BLOB NULL, price DECIMAL(20,4)) ENGINE=InnoDB');
$checks = [];
foreach ([false, true] as $emulated) {
    $pdo->setAttribute(PDO::ATTR_EMULATE_PREPARES, $emulated);
    foreach ([false, true] as $stringify) {
        $pdo->setAttribute(PDO::ATTR_STRINGIFY_FETCHES, $stringify);
        $types = $pdo->prepare("SELECT 42 AS i, CAST(1.25 AS DOUBLE) AS f, CAST(18446744073709551615 AS UNSIGNED) AS big, CAST(1234567890123456.7890 AS DECIMAL(20,4)) AS d, '42' AS text, NULL AS n, UNHEX('00FF') AS b");
        $types->execute(); $values = $types->fetch(PDO::FETCH_ASSOC);
        check($values === ['i' => $stringify ? '42' : 42, 'f' => $stringify ? '1.25' : 1.25, 'big' => '18446744073709551615', 'd' => '1234567890123456.7890', 'text' => '42', 'n' => null, 'b' => "\0\xff"], 'PDO SQL types and stringify');
        $types->closeCursor();
        $bounds = $pdo->query('SELECT CAST(-2147483648 AS SIGNED), CAST(2147483648 AS UNSIGNED), CAST(1e0 AS DOUBLE)')->fetch(PDO::FETCH_NUM);
        // On 32-bit PHP the source literal -2147483648 is parsed as a float
        // before unary negation. Cast the decimal text for an integer oracle.
        check($bounds === [$stringify ? '-2147483648' : (int)'-2147483648', $stringify || PHP_INT_SIZE === 4 ? '2147483648' : 2147483648, $stringify ? '1' : 1.0], 'integer boundaries and integral double: ' . var_export([$stringify, PHP_INT_SIZE, $bounds], true));
    }
    $pdo->setAttribute(PDO::ATTR_STRINGIFY_FETCHES, false);
    $pdo->beginTransaction();
    $insert = $pdo->prepare('INSERT INTO essential_records VALUES (:id, :title, :payload, :price)');
    $id = $emulated ? 2 : 1; $title = 'before'; $payload = "\0\xffbinary";
    $insert->bindParam(':id', $id, PDO::PARAM_INT);
    $insert->bindParam(':title', $title, PDO::PARAM_STR);
    $insert->bindValue(':payload', $payload, PDO::PARAM_LOB);
    $insert->bindValue(':price', '1234567890123456.7890');
    $title = 'été 😀'; $insert->execute();
    check($insert->rowCount() === 1, 'affected row count');
    $select = $pdo->prepare('SELECT title,payload,price FROM essential_records WHERE id=?');
    $select->execute([$id]); $row = $select->fetch(PDO::FETCH_ASSOC);
    check($row === ['title' => $title, 'payload' => $payload, 'price' => '1234567890123456.7890'], 'references, binary and exact decimal');
    $select->closeCursor(); $pdo->commit();
    $pdo->beginTransaction(); $pdo->exec('DELETE FROM essential_records'); $pdo->rollBack();
    check((int)$pdo->query('SELECT COUNT(*) FROM essential_records')->fetchColumn() === $id, 'rollback restores rows');
    $checks[] = $emulated ? 'PDO emulated: types/stringify/references/LOB/transactions' : 'PDO native: types/stringify/references/LOB/transactions';
}
$mysqli = new mysqli('localhost', 'root', '', 'test');
$mysqli->set_charset('utf8mb4'); $mysqli->begin_transaction();
check($mysqli->savepoint('partial'), 'OO savepoint');
$mysqli->execute_query('INSERT INTO essential_records VALUES (?, ?, ?, ?)', [3, 'discard', null, '0.0000']);
$mysqli->query('ROLLBACK TO SAVEPOINT `partial`');
check(mysqli_release_savepoint($mysqli, 'partial'), 'procedural release');
check(mysqli_savepoint($mysqli, 'odd`name'), 'quoted procedural savepoint');
$mysqli->query('ROLLBACK TO SAVEPOINT `odd``name`');
check($mysqli->release_savepoint('odd`name'), 'quoted OO release');
foreach (['', "bad\0name"] as $invalid) {
    try { $mysqli->savepoint($invalid); throw new RuntimeException('invalid name accepted'); }
    catch (ValueError $expected) {}
}
try { $mysqli->release_savepoint('missing'); throw new RuntimeException('missing savepoint accepted'); }
catch (mysqli_sql_exception $expected) { check($expected->getCode() === 1305, 'savepoint diagnostic'); }
check($mysqli->savepoint('recovery'), 'connection recovers after SQL error');
$mysqli->commit();
check((int)$pdo->query('SELECT COUNT(*) FROM essential_records')->fetchColumn() === 2, 'PDO and MySQLi share data');
$mysqli->close();
$checks[] = 'MySQLi savepoints, quoting, rollback, errors and recovery';
echo json_encode(['ok' => true, 'checks' => $checks], JSON_THROW_ON_ERROR);
