<?php
require dirname(__DIR__) . "/lib/bootstrap.php";
require dirname(__DIR__) . "/lib/mysqli.php";
header("Content-Type: application/json; charset=utf-8");
header("Cache-Control: no-store");
$statement = $mysqli->prepare(
    "SELECT COUNT(*) FROM message_recipients WHERE user_id=? AND read_at IS NULL",
);
$statement->bind_param("i", $userId);
$statement->execute();
$statement->bind_result($unread);
$statement->fetch();
$statement->close();
echo json_encode(
    ["user" => $user["name"], "unread" => $unread, "visits" => $_SESSION["visits"]],
    JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE,
);
$mysqli->close();
