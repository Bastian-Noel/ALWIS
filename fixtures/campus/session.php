<?php
session_start();
header("Content-Type: application/json");
echo json_encode([
    "id" => session_id(),
    "visits" => $_SESSION["visits"] ?? 0,
    "user_id" => $_SESSION["user_id"] ?? 1,
    "cookie" => $_COOKIE["color"] ?? null,
]);
