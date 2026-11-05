<?php
// Installation explicite : ne remplace jamais un Campus existant.
$db = new PDO("mysql:dbname=test;charset=utf8mb4", "root", "", [
    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
]);
$db->exec("CREATE DATABASE IF NOT EXISTS school CHARACTER SET utf8mb4");
$db->exec("USE school");
$existing = $db->query("SHOW TABLES LIKE 'school_meta'")->fetchColumn();
if (!$existing) {
    $queries = json_decode(
        file_get_contents(__DIR__ . "/data/seed.json"),
        true,
        512,
        JSON_THROW_ON_ERROR,
    );
    foreach ($queries as $query) {
        if (str_starts_with(ltrim($query), "CREATE TABLE")) {
            $db->exec($query);
        }
    }
    $db->beginTransaction();
    try {
        foreach ($queries as $query) {
            if (!str_starts_with(ltrim($query), "CREATE TABLE")) {
                $db->exec($query);
            }
        }
        $db->commit();
    } catch (Throwable $error) {
        $db->rollBack();
        throw $error;
    }
}
