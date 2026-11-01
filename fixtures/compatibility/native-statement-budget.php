<?php
// Shared limits across the actual PDO and MySQLi C adapters, not PHP mocks.
function demand($condition, $why) { if (!$condition) throw new RuntimeException($why); }
$pdo = new PDO('mysql:dbname=school', 'root', '', [PDO::ATTR_EMULATE_PREPARES => false, PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
$mysqli = new mysqli('localhost', 'root', '', 'school');
demand($mysqli->query('SELECT @@max_prepared_stmt_count')->fetch_column() === '128', 'server prepared-statement profile');
$pdoStatements = []; $mysqliStatements = [];
for ($i = 0; $i < 64; ++$i) {
    $pdoStatements[] = $pdo->prepare('SELECT ?');
    $mysqliStatements[] = $mysqli->stmt_init();
}
$rejected = [];
try { $pdo->prepare('SELECT 1'); throw new RuntimeException('PDO bypassed shared count'); }
catch (PDOException $error) { demand(str_contains($error->getMessage(), 'statement count limit'), 'PDO count diagnostic'); $rejected[] = 'PDO count'; }
try { $mysqli->stmt_init(); throw new RuntimeException('MySQLi bypassed shared count'); }
catch (mysqli_sql_exception $error) { demand(str_contains($error->getMessage(), 'statement count limit'), 'MySQLi count diagnostic'); $rejected[] = 'MySQLi count'; }
$serverPrepared = 0;
try {
    for (; $serverPrepared < 65; ++$serverPrepared) $mysqli->query('PREPARE budget_' . $serverPrepared . ' FROM "SELECT 1"');
    throw new RuntimeException('SQL PREPARE bypassed server profile');
} catch (mysqli_sql_exception $error) { demand($error->getCode() === 1461 && $serverPrepared === 64, 'server SQL PREPARE limit'); }
for ($i = 0; $i < $serverPrepared; ++$i) $mysqli->query('DEALLOCATE PREPARE budget_' . $i);
$rejected[] = 'server SQL PREPARE count';
unset($pdoStatements[0]);
$replacement = $pdo->prepare('SELECT 42'); $replacement->execute();
// The pinned external-client PDO branch returns this scalar as text.
demand($replacement->fetchColumn() === '42', 'freed statement slot must be reusable');
unset($replacement); $pdoStatements = []; $mysqliStatements = []; gc_collect_cycles();

$largeSQL = 'SELECT 1 /* ' . str_repeat('x', 2*1024*1024) . ' */';
$held = []; $bytesRejected = false;
for ($i = 0; $i < 12; ++$i) {
    try { $held[] = $i % 2 ? $mysqli->prepare($largeSQL) : $pdo->prepare($largeSQL); }
    catch (PDOException | mysqli_sql_exception $error) {
        demand(str_contains($error->getMessage(), 'prepared SQL byte budget'), 'aggregate SQL diagnostic: ' . $error->getMessage());
        $bytesRejected = true; break;
    }
}
demand($bytesRejected && count($held) === 7, '16 MiB reservation must be shared by drivers');
unset($held[0]); $replacement = $pdo->prepare($largeSQL); unset($replacement); $held = []; unset($largeSQL); gc_collect_cycles();
$rejected[] = 'shared retained SQL bytes';

$oversized = 'SELECT 1 /* ' . str_repeat('x', 8*1024*1024) . ' */';
foreach ([false, true] as $emulated) {
    $pdo->setAttribute(PDO::ATTR_EMULATE_PREPARES, $emulated);
    try { $pdo->query($oversized); throw new RuntimeException('PDO SQL input limit bypassed'); }
    catch (PDOException $error) { demand(str_contains($error->getMessage(), 'request byte limit'), 'PDO native/emulated SQL limit diagnostic'); }
    demand((string)$pdo->query('SELECT 43')->fetchColumn() === '43', 'PDO must recover after SQL input refusal');
}
unset($oversized);
$rejected[] = 'PDO native and emulated SQL input';
$pdo->setAttribute(PDO::ATTR_EMULATE_PREPARES, false);
$statement = $mysqli->stmt_init();
$statement->prepare('SELECT ?'); $value = 'before'; $statement->bind_param('s', $value); $statement->execute();
try { $statement->prepare('SELECT broken syntax !!!!'); throw new RuntimeException('failed prepare accepted'); } catch (mysqli_sql_exception $expected) {}
demand($statement->prepare('SELECT 44'), 'smaller successful prepare releases failed reservation'); $statement->execute();
demand($statement->get_result()->fetch_column() === 44, 'statement must remain reusable'); $statement->close();
$statement = $pdo->prepare('SELECT ?'); $statement->execute(['owner-cleanup']); demand($statement->fetchColumn() === 'owner-cleanup', 'PDO after registry pressure');
// Deliberately leave statements alive for real request teardown / owner cleanup.
$unfinished = $mysqli->prepare('SELECT ?');
echo json_encode(['ok' => true, 'countLimit' => 128, 'aggregateRetainedQueries' => 7, 'rejected' => $rejected], JSON_THROW_ON_ERROR);
