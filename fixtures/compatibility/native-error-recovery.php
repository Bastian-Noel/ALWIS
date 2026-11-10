<?php
/* ALWIS independent request-life-cycle recovery and rollback fixture. */
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
} elseif ($mode === 'check') {
    $count = (int) $pdo->query('SELECT COUNT(*) FROM alwis_error_recovery')->fetchColumn();
    $post = $_POST['value'] ?? null;
    echo json_encode(['count' => $count, 'post' => $post, 'method' => $_SERVER['REQUEST_METHOD']]);
} else {
    http_response_code(400);
    echo 'Unknown test';
}
