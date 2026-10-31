<?php
declare(strict_types=1);
header('Content-Type: application/json; charset=utf-8');
mysqli_report(MYSQLI_REPORT_ERROR | MYSQLI_REPORT_STRICT);
$db = mysqli_connect('localhost', 'root', '', 'school');
mysqli_set_charset($db, 'utf8mb4');
mysqli_begin_transaction($db);
try {
    $stmt = mysqli_prepare($db, 'INSERT INTO notes (label, nullable_text, amount, big_value, payload) VALUES (?, ?, ?, ?, ?)');
    $label = 'before'; $nullable = null; $amount = '12345678901234.123456';
    $big = '18446744073709551615'; $payload = "A\0B\xff";
    mysqli_stmt_bind_param($stmt, 'sssss', $label, $nullable, $amount, $big, $payload);
    $label = 'élève 🎲'; // Tests by-reference binding at execute time.
    mysqli_stmt_execute($stmt);
    $id = mysqli_insert_id($db);
    $select = mysqli_prepare($db, 'SELECT label, nullable_text, amount, CAST(big_value AS CHAR) AS big_value, HEX(payload) AS payload_hex FROM notes WHERE id = ?');
    mysqli_stmt_bind_param($select, 's', $id);
    mysqli_stmt_execute($select);
    $result = mysqli_stmt_get_result($select);
    $row = mysqli_fetch_assoc($result);
    if ($row['label'] !== 'élève 🎲' || $row['nullable_text'] !== null ||
        $row['payload_hex'] !== '410042FF' || $row['big_value'] !== '18446744073709551615' ||
        $row['amount'] !== '12345678901234.123456') throw new RuntimeException('SQL type fidelity failure');
    mysqli_free_result($result); mysqli_stmt_close($stmt); mysqli_stmt_close($select);
    mysqli_commit($db);
    echo json_encode(['ok' => true, 'row' => $row], JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
} catch (Throwable $error) { mysqli_rollback($db); throw $error; }
finally { mysqli_close($db); }
