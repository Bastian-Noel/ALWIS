<?php
require __DIR__ . "/lib/bootstrap.php";
$id = filter_input(INPUT_GET, "id", FILTER_VALIDATE_INT);
$resource = $id ? all("SELECT path,mime,title FROM resources WHERE id=?", [$id])[0] ?? null : null;
if (!$resource) {
    http_response_code(404);
    exit("Document introuvable.");
}
$path = realpath(__DIR__ . "/" . $resource["path"]);
if (!$path || !str_starts_with($path, __DIR__ . "/") || !is_file($path)) {
    http_response_code(404);
    exit("Ce fichier n’est plus disponible.");
}
// Navigation vers le fichier statique : OPFS et Range restent disponibles.
header("Location: /" . str_replace("%2F", "/", rawurlencode($resource["path"])), true, 302);
