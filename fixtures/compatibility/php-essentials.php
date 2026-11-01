<?php
// Ordinary application APIs, executed in the real PHP WASM runtime.
function check($ok, $message) { if (!$ok) throw new RuntimeException($message); }
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $upload = $_FILES['document'] ?? null;
    check($upload && $upload['error'] === UPLOAD_ERR_OK, 'multipart upload');
    check(is_uploaded_file($upload['tmp_name']), 'upload provenance');
    $mime = new finfo(FILEINFO_MIME_TYPE);
    check($mime->file($upload['tmp_name']) === 'image/png', 'uploaded PNG MIME');
    $destination = __DIR__ . '/uploaded.png';
    check(move_uploaded_file($upload['tmp_name'], $destination), 'move upload');
    check(hash_file('sha256', $destination) === $_POST['sha256'], 'upload bytes');
    unlink($destination);
    echo json_encode(['ok' => true, 'checks' => ['multipart', 'finfo file', 'move_uploaded_file', 'binary fidelity']]);
    return;
}
$extensions = ['filter', 'ctype', 'tokenizer', 'fileinfo', 'mbstring', 'iconv'];
foreach ($extensions as $extension) check(extension_loaded($extension), $extension . ' missing');
check(filter_var('élise@example.org', FILTER_VALIDATE_EMAIL) === false, 'email validation policy');
check(filter_var('alice@example.org', FILTER_VALIDATE_EMAIL) === 'alice@example.org', 'valid email');
check(filter_var('42', FILTER_VALIDATE_INT, ['options' => ['min_range' => 1, 'max_range' => 100]]) === 42, 'integer validation');
check(filter_var('101', FILTER_VALIDATE_INT, ['options' => ['max_range' => 100]]) === false, 'integer range');
check(ctype_alpha('Example') && ctype_digit('0123') && !ctype_digit('12x'), 'ctype');
check(mb_strlen('été 😀', 'UTF-8') === 5, 'Unicode codepoints');
check(mb_strtoupper('élève', 'UTF-8') === 'ÉLÈVE', 'Unicode case');
check(mb_check_encoding('été 😀', 'UTF-8') && !mb_check_encoding("\xff", 'UTF-8'), 'invalid UTF-8');
check(mb_convert_encoding("caf\xe9", 'UTF-8', 'ISO-8859-1') === 'café', 'mb encoding');
check(iconv('ISO-8859-1', 'UTF-8', "caf\xe9") === 'café', 'iconv encoding');
$tokens = token_get_all('<?php echo "bonjour";', TOKEN_PARSE);
check(in_array(T_ECHO, array_map(fn($token) => is_array($token) ? $token[0] : null, $tokens), true), 'PHP tokenizer');
$png = base64_decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1sAAAAASUVORK5CYII=');
check((new finfo(FILEINFO_MIME_TYPE))->buffer($png) === 'image/png', 'binary MIME');
$hash = password_hash('mot de passe été', PASSWORD_BCRYPT, ['cost' => 4]);
check(password_verify('mot de passe été', $hash) && !password_verify('wrong', $hash), 'password storage');
check(strlen(random_bytes(32)) === 32, 'cryptographic random source');
check(htmlspecialchars('<b>"été"</b>', ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8') === '&lt;b&gt;&quot;été&quot;&lt;/b&gt;', 'HTML escaping');
echo json_encode(['ok' => true, 'extensions' => $extensions, 'checks' => ['form validation', 'ctype', 'Unicode', 'encodings', 'tokenizer', 'binary MIME', 'passwords', 'random', 'HTML escaping'], 'mbregex' => function_exists('mb_ereg')], JSON_THROW_ON_ERROR);
