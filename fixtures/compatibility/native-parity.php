<?php
/** Portable parity probes executed unchanged against historical and GPLv2 WASM runtimes.
 * Tests must run on a disposable project. Never execute the SQL cases on production data.
 */
declare(strict_types=1);
$scenario = $_GET['case'] ?? 'environment';
$respond = static function (array $data, int $status = 200): void {
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($data, JSON_THROW_ON_ERROR | JSON_INVALID_UTF8_SUBSTITUTE);
};
$storage = __DIR__ . '/alwis-parity-state.bin';
switch ($scenario) {
    case 'environment':
        $respond(['version' => PHP_VERSION, 'integerBytes' => PHP_INT_SIZE,
            'pdo' => extension_loaded('pdo_mysql'), 'mysqli' => extension_loaded('mysqli'),
            'session' => function_exists('session_start')]);
        break;
    case 'get':
        $respond(['method' => $_SERVER['REQUEST_METHOD'] ?? '',
            'query' => $_GET['text'] ?? '', 'header' => $_SERVER['HTTP_X_PARITY_PROBE'] ?? '',
            'path' => parse_url($_SERVER['REQUEST_URI'] ?? '', PHP_URL_PATH)]);
        break;
    case 'post':
        $respond(['method' => $_SERVER['REQUEST_METHOD'] ?? '',
            'value' => $_POST['value'] ?? null,
            'rawHash' => hash('sha256', file_get_contents('php://input'))]);
        break;
    case 'binary':
        $body = file_get_contents('php://input');
        $respond(['length' => strlen($body), 'hex' => bin2hex($body)]);
        break;
    case 'headers':
        header('X-ALWIS-Parity: header-ok');
        $respond(['status' => 201], 201);
        break;
    case 'redirect':
        header('Location: /parity-finished.php?proof=1', true, 302);
        echo 'Redirect';
        break;
    case 'cookie':
        setcookie('alwis_parity', 'issued', ['path' => '/', 'httponly' => true]);
        $respond(['seen' => $_COOKIE['alwis_parity'] ?? null]);
        break;
    case 'session':
        if (!session_start()) throw new RuntimeException('Cannot start PHP session');
        $_SESSION['parity'] = ($_SESSION['parity'] ?? 0) + 1;
        $respond(['counter' => $_SESSION['parity'], 'sessionIdPresent' => session_id() !== '']);
        session_write_close();
        break;
    case 'file-write':
        $bytes = "\x00\x7f\x80\xff\x0a";
        $written = file_put_contents($storage, $bytes);
        $respond(['written' => $written, 'hex' => bin2hex(file_get_contents($storage))]);
        break;
    case 'file-read':
        $bytes = file_get_contents($storage);
        unlink($storage);
        $respond(['hex' => bin2hex($bytes), 'removed' => !file_exists($storage)]);
        break;
    case 'pdo':
        $db = new PDO('mysql:dbname=test;charset=utf8mb4', 'root', '', [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_EMULATE_PREPARES => false,
        ]);
        $db->exec('DROP TABLE IF EXISTS alwis_parity_probe');
        $db->exec('CREATE TABLE alwis_parity_probe (id INT PRIMARY KEY, label VARCHAR(80), data BLOB) ENGINE=InnoDB');
        $db->beginTransaction();
        $stmt = $db->prepare('INSERT INTO alwis_parity_probe (id, label, data) VALUES (?, ?, ?)');
        $stmt->execute([1, 'été 😀', "\x00\xff"]);
        $db->commit();
        $db->beginTransaction();
        $db->exec("UPDATE alwis_parity_probe SET label='uncommitted' WHERE id=1");
        $db->rollBack();
        $row = $db->query('SELECT label,data FROM alwis_parity_probe WHERE id=1')->fetch(PDO::FETCH_ASSOC);
        $respond(['label' => $row['label'], 'hex' => bin2hex($row['data']),
            'transactionClosed' => !$db->inTransaction()]);
        break;
    case 'mysqli':
        $db = new mysqli('localhost', 'root', '', 'test');
        $db->set_charset('utf8mb4');
        $stmt = $db->prepare('SELECT label,data FROM alwis_parity_probe WHERE id = ?');
        $id = 1;
        $stmt->bind_param('i', $id);
        $stmt->execute();
        $stmt->bind_result($label, $bytes);
        $found = $stmt->fetch();
        $stmt->close();
        if (!$found) throw new RuntimeException('MySQLi prepared row missing');
        $db->begin_transaction();
        $db->query("UPDATE alwis_parity_probe SET label='discarded' WHERE id=1");
        $db->rollback();
        $count = $db->query("SELECT COUNT(*) FROM alwis_parity_probe WHERE label='été 😀'")->fetch_row()[0];
        $db->close();
        $respond(['label' => $label, 'hex' => bin2hex($bytes), 'rolledBack' => (int)$count === 1]);
        break;
    case 'sql-cleanup':
        $db = new PDO('mysql:dbname=test', 'root', '');
        $db->exec('DROP TABLE IF EXISTS alwis_parity_probe');
        $respond(['cleaned' => true]);
        break;
    case 'error':
        throw new RuntimeException('ALWIS_PARITY_EXPECTED_ERROR');
    default:
        $respond(['error' => 'Unknown parity scenario'], 400);
}
