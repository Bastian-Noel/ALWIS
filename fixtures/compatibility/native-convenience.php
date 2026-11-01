<?php
// Unmodified native APIs used by small data-access layers and entity hydration.
function verify($condition, $label) { if (!$condition) throw new RuntimeException($label); }
$db = new mysqli('localhost', 'root', '', 'school');
$checks = [];

$result = $db->query("SELECT 7 AS id, 'école' AS name, NULL AS missing, UNHEX('4100FF') AS bytes");
$row = $result->fetch_object();
verify($row instanceof stdClass && $row->id === '7' && $row->missing === null && bin2hex($row->bytes) === '4100ff', 'stdClass hydration');
verify(mysqli_fetch_object($result) === null, 'fetch_object exhaustion');
$result->free();
class HydratedRow {
    public $id;
    public $name;
    public $observed;
    public function __construct($prefix) { $this->observed = $prefix . $this->id . ':' . $this->name; }
}
$result = $db->query("SELECT 8 AS id, 'before-constructor' AS name");
$row = mysqli_fetch_object($result, HydratedRow::class, ['prefix' => 'entity:']);
verify($row->observed === 'entity:8:before-constructor', 'properties before constructor and named arguments');
$result->data_seek(0);
try { $result->fetch_object(stdClass::class, ['invalid']); throw new RuntimeException('constructor arguments accepted'); } catch (ValueError $expected) {}
abstract class AbstractRow {}
$result->data_seek(0);
try { $result->fetch_object(AbstractRow::class); throw new RuntimeException('abstract class accepted'); } catch (Error $expected) {}
verify($result->fetch_object()->id === '8', 'class validation must precede row consumption');
$result->free();
try { $result->fetch_object(); throw new RuntimeException('freed result accepted'); } catch (Error $expected) {}
$checks[] = 'object hydration, constructor order, arguments, exhaustion and invalid classes';

$result = $db->execute_query('SELECT ? AS label, ? AS missing, ? AS bytes, 42 AS integer_value', ['école', null, "A\0\xFF"]);
$row = $result->fetch_assoc();
verify($row['label'] === 'école' && $row['missing'] === null && bin2hex($row['bytes']) === '4100ff' && $row['integer_value'] === 42, 'execute_query prepared values and native types');
$result->free();
verify(mysqli_execute_query($db, 'SELECT 43 AS value')->fetch_column() === 43, 'procedural execute_query');
verify($db->execute_query('CREATE TEMPORARY TABLE convenience_rows (id INT PRIMARY KEY, value VARCHAR(30)) ENGINE=InnoDB') === true, 'execute_query DDL');
$db->begin_transaction();
verify($db->execute_query('INSERT INTO convenience_rows VALUES (?, ?)', [1, 'inserted']) === true, 'execute_query write');
verify(mysqli_affected_rows($db) === 1, 'execute_query affected rows');
$db->rollback();
verify($db->query('SELECT COUNT(*) FROM convenience_rows')->fetch_column() === '0', 'execute_query participates in connection transaction');
foreach ([[], ['named' => 'value']] as $values) {
    try { $db->execute_query('SELECT ?', $values); throw new RuntimeException('invalid parameters accepted'); } catch (ArgumentCountError | ValueError $expected) {}
}
try { $db->execute_query('SELECT REPEAT(\'x\',65536) FROM seq_1_to_1000'); throw new RuntimeException('execute_query result budget bypassed'); } catch (mysqli_sql_exception $expected) { verify(str_contains($expected->getMessage(), 'WASM result exceeds'), 'bounded execute_query error'); }
verify($db->execute_query('SELECT 44')->fetch_column() === 44, 'execute_query recovery after result refusal');
$checks[] = 'execute_query values, types, DDL, transactions, errors, result limit and recovery';

$statement = mysqli_stmt_init($db);
verify(mysqli_stmt_prepare($statement, 'SELECT ? AS value'), 'procedural prepare on initialized statement');
$value = 'before'; $statement->bind_param('s', $value); $value = 'after'; $statement->execute();
$statement->bind_result($bound); verify($statement->fetch() && $bound === 'after', 'separate prepare bindings');
verify($statement->prepare('SELECT ? AS first, ? AS second') && $statement->param_count === 2 && $statement->field_count === 2, 'statement reprepare counts');
$statement->execute(['new', null]);
verify($statement->get_result()->fetch_assoc() === ['first' => 'new', 'second' => null], 'reprepare clears old parameter and output bindings');
try { $statement->prepare('SELECT broken syntax !!!!'); throw new RuntimeException('bad prepare accepted'); } catch (mysqli_sql_exception $expected) {}
verify($statement->prepare('SELECT ? AS recovered'), 'statement recovers after failed prepare');
$statement->execute(['recovered']); verify($statement->get_result()->fetch_column() === 'recovered', 'reprepared result');
$statement->close();
try { $statement->prepare('SELECT 1'); throw new RuntimeException('closed statement accepted'); } catch (Error $expected) {}
$constructed = new mysqli_stmt($db, 'SELECT 46 AS value');
$constructed->execute(); verify($constructed->get_result()->fetch_column() === 46, 'constructor prepares its SQL'); $constructed->close();
foreach ([new mysqli_stmt($db), $db->stmt_init()] as $statement) {
    verify($statement->prepare('SELECT 45 AS value'), 'constructor and method statement initialization');
    $statement->execute(); verify($statement->get_result()->fetch_column() === 45, 'initialized statement execution'); $statement->close();
}
for ($i = 0; $i < 50; ++$i) {
    verify($db->execute_query('SELECT ? AS value', [(string)$i])->fetch_column() === (string)$i, 'temporary statement ownership');
}
$checks[] = 'statement init, constructor, prepare, reprepare, failure recovery and temporary ownership';
$statement = $db->stmt_init(); $db->close();
try { $statement->prepare('SELECT 1'); throw new RuntimeException('connection-owned statement remained open'); } catch (Error $expected) {}
unset($statement); gc_collect_cycles();
echo json_encode(['ok' => true, 'checks' => $checks], JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE);
