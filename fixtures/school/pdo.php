<?php
declare(strict_types=1);
header('Content-Type: application/json; charset=utf-8');
$db = new PDO('mysql:host=localhost;dbname=school;charset=utf8mb4', 'root', '', [
    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
]);
$db->beginTransaction();
try {
    $stmt = $db->prepare('INSERT INTO notes (label, nullable_text, amount, big_value, payload) VALUES (?, ?, ?, ?, ?)');
    $stmt->execute(['élève 🎲', null, '12345678901234.123456', '18446744073709551615', "A\0B\xff"]);
    $id = $db->lastInsertId();
    $select = $db->prepare('SELECT label, nullable_text, amount, CAST(big_value AS CHAR) AS big_value, HEX(payload) AS payload_hex FROM notes WHERE id = ?');
    $select->execute([$id]);
    $row = $select->fetch(PDO::FETCH_ASSOC);
    if ($row['nullable_text'] !== null || $row['payload_hex'] !== '410042FF' ||
        $row['big_value'] !== '18446744073709551615' || $row['amount'] !== '12345678901234.123456') {
        throw new RuntimeException('SQL type fidelity failure');
    }
    $db->commit();
    echo json_encode(['ok' => true, 'row' => $row], JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
} catch (Throwable $error) {
    if ($db->inTransaction()) $db->rollBack();
    throw $error;
}
