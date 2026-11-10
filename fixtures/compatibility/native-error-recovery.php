<?php
/*
 * A durable regression for independent ALWIS PHP 8.4 / embedded MariaDB.
 * Every scenario runs in the SAME WASM interpreter, not a fresh PHP process.
 * SPDX-License-Identifier: GPL-2.0-only
 */
$mode = $_GET['case'] ?? 'init';
$pdo = new PDO('mysql:dbname=test', 'root', '');
$pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
$pdo->exec('CREATE TABLE IF NOT EXISTS alwis_error_recovery (value VARCHAR(32))');

if ($mode === 'init') {
    $pdo->exec('DELETE FROM alwis_error_recovery');
    $pdo->exec("INSERT INTO alwis_error_recovery VALUES ('stable')");
    echo json_encode(['status' => 'initialized']);
} elseif ($mode === 'throw') {
    $pdo->beginTransaction();
    $pdo->exec("INSERT INTO alwis_error_recovery VALUES ('must-rollback')");
    throw new RuntimeException('ALWIS_INDEPENDENT_EXPECTED_THROW');
} elseif ($mode === 'sql-error') {
    $pdo->beginTransaction();
    $pdo->exec("INSERT INTO alwis_error_recovery VALUES ('rollback-sql')");
    // An uncaught PDOException must not poison PHP or commit a transaction.
    $pdo->exec('INSERT INTO alwis_table_that_does_not_exist VALUES (1)');
} elseif ($mode === 'parse') {
    // PHP parse errors thrown by eval() follow a separate Zend error path.
    eval('function broken syntax that cannot be parsed');
} elseif ($mode === 'exit') {
    // Must not make the NEXT HTTP request return this process exit code.
    exit(42);
} elseif ($mode === 'caught') {
    try {
        throw new RuntimeException('expected-handled-exception');
    } catch (RuntimeException $error) {
        echo json_encode(['handled' => $error->getMessage()]);
    }
} elseif ($mode === 'check') {
    $count = (int) $pdo->query('SELECT COUNT(*) FROM alwis_error_recovery')->fetchColumn();
    $post = $_POST['value'] ?? null;
    echo json_encode([
        'count' => $count,
        'post' => $post,
        'method' => $_SERVER['REQUEST_METHOD'],
    ]);
} else {
    http_response_code(400);
    echo 'Unknown test';
}
