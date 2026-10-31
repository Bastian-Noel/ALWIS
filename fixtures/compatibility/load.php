<?php
header('Content-Type: application/json');
session_start(); $_SESSION['calls']=($_SESSION['calls']??0)+1;
$db=new PDO('mysql:dbname=test;charset=utf8mb4','root','',[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION]);
$db->exec('CREATE TABLE IF NOT EXISTS load_counter (id INT PRIMARY KEY,value BIGINT NOT NULL) ENGINE=InnoDB');
$db->exec('INSERT IGNORE INTO load_counter VALUES(1,0)');
$db->beginTransaction();
$db->exec('UPDATE load_counter SET value=value+1 WHERE id=1');
$value=$db->query('SELECT value FROM load_counter WHERE id=1')->fetchColumn();
$db->commit();
echo json_encode(['session'=>session_id(),'calls'=>$_SESSION['calls'],'shared'=>(string)$value]);
