<?php
/* ALWIS native Fetch/cURL test fixture; never copied from JoomEngine. */
$case = $_GET['case'] ?? 'echo';
$origin = $_GET['target'] ?? '';
if (!function_exists('curl_init')) {
    echo json_encode(['error' => 'curl_init not registered']);
    return;
}
$handle = curl_init();
$options = [CURLOPT_URL => $origin . '/echo', CURLOPT_RETURNTRANSFER => true];
switch ($case) {
    case 'echo':
        $options[CURLOPT_POST] = true;
        $options[CURLOPT_POSTFIELDS] = hex2bin('007f80ff');
        $options[CURLOPT_HTTPHEADER] = ['X-ALWIS-Curl: proof'];
        break;
    case 'redirect':
        $options[CURLOPT_URL] = $origin . '/redirect';
        $options[CURLOPT_FOLLOWLOCATION] = true;
        break;
    case 'bad':
        $options[CURLOPT_URL] = $origin . '/bad';
        $options[CURLOPT_FAILONERROR] = true;
        break;
    case 'timeout':
        $options[CURLOPT_URL] = $origin . '/slow';
        $options[CURLOPT_TIMEOUT_MS] = 10;
        break;
    case 'cancel':
        $options[CURLOPT_URL] = $origin . '/slow';
        $options[CURLOPT_TIMEOUT_MS] = 1000;
        break;
    case 'self-static':
        $options[CURLOPT_URL] = $origin . '/hello.txt';
        break;
    case 'self-php':
        $options[CURLOPT_URL] = $origin . '/curl.php';
        break;
}
$valid = curl_setopt_array($handle, $options);
$value = $valid ? curl_exec($handle) : false;
echo json_encode([
    'ok' => $value !== false, 'value' => $value === false ? null : $value,
    'code' => curl_getinfo($handle, CURLINFO_HTTP_CODE),
    'errno' => curl_errno($handle), 'error' => curl_error($handle),
    'handle' => $handle instanceof CurlHandle,
]);
