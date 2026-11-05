<?php
session_start();
$root = dirname(__DIR__);
require $root . "/install.php";
$_SESSION["visits"] = ($_SESSION["visits"] ?? 0) + 1;
$_SESSION["csrf"] ??= bin2hex(random_bytes(20));
function h($value): string
{
    return htmlspecialchars((string) $value, ENT_QUOTES, "UTF-8");
}
function staff(): bool
{
    global $user;
    return in_array($user["profile"], ["Administration", "Professeur"], true);
}
function all(string $sql, array $params = []): array
{
    global $db;
    $query = $db->prepare($sql);
    $query->execute($params);
    return $query->fetchAll(PDO::FETCH_ASSOC);
}
function positive($value): int
{
    if (!is_string($value) || !ctype_digit($value) || (int) $value < 1) {
        throw new RuntimeException("Sélectionnez un élément de la liste.");
    }
    return (int) $value;
}
function textInput(string $key, int $max): string
{
    $value = $_POST[$key] ?? "";
    if (!is_string($value) || !trim($value) || mb_strlen($value) > $max) {
        throw new RuntimeException(
            "Vérifiez le champ « " . $key . " » (1 à " . $max . " caractères).",
        );
    }
    return trim($value);
}
$users = all("SELECT id,name,profile FROM users ORDER BY id");
$userId = (int) ($_SESSION["user_id"] ?? 1);
$user = all("SELECT id,name,profile FROM users WHERE id=?", [$userId])[0] ?? $users[0];
// Chaque requête contrôle le rôle ; masquer un bouton ne suffit pas.
