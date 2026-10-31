<?php
declare(strict_types=1);
header('Content-Type: application/json; charset=utf-8');
session_start();
$player = $_SESSION['player'] ??= bin2hex(random_bytes(8));
session_write_close(); // Release session lock before SQL/polling.
$db = new PDO('mysql:host=localhost;dbname=school;charset=utf8mb4', 'root', '', [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $input = json_decode(file_get_contents('php://input'), true, 32, JSON_THROW_ON_ERROR);
    if (!is_array($input) || !isset($input['version'], $input['state']) ||
        !is_int($input['version']) || $input['version'] < 0 ||
        !is_string($input['state']) || strlen($input['state']) > 64) {
        http_response_code(400); echo '{"error":"invalid_input"}'; exit;
    }
    $stmt = $db->prepare('UPDATE games SET state = ?, version = version + 1 WHERE id = 1 AND version = ?');
    $stmt->execute([$input['state'], $input['version']]);
    if ($stmt->rowCount() !== 1) {
        http_response_code(409); echo '{"error":"stale_version"}'; exit;
    }
}
$row = $db->query('SELECT version, state FROM games WHERE id = 1')->fetch(PDO::FETCH_ASSOC);
echo json_encode(['player' => $player, 'game' => $row], JSON_THROW_ON_ERROR);
