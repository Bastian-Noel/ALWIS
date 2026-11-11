<?php
/*
 * Browser cURL compatibility subset implemented independently for ALWIS.
 * SPDX-FileCopyrightText: 2026 Bastian Noel
 * SPDX-License-Identifier: GPL-2.0-only
 *
 * Only HTTP(S) Fetch via the native stream wrapper. This is NOT libcurl.
 * Unsupported options return false instead of silently misbehaving.
 */
if (!function_exists('curl_init')) {
    foreach ([
        'CURLOPT_URL' => 10002, 'CURLOPT_RETURNTRANSFER' => 19913,
        'CURLOPT_FOLLOWLOCATION' => 52, 'CURLOPT_HTTPHEADER' => 10023,
        'CURLOPT_CUSTOMREQUEST' => 10036, 'CURLOPT_POST' => 47,
        'CURLOPT_POSTFIELDS' => 10015, 'CURLOPT_TIMEOUT' => 13,
        'CURLOPT_TIMEOUT_MS' => 155, 'CURLOPT_HEADER' => 42,
        'CURLOPT_NOBODY' => 44, 'CURLOPT_USERAGENT' => 10018,
        'CURLOPT_HTTPGET' => 80, 'CURLOPT_FAILONERROR' => 45,
        'CURLINFO_HTTP_CODE' => 2097154, 'CURLINFO_RESPONSE_CODE' => 2097154,
        'CURLINFO_EFFECTIVE_URL' => 1048577,
        'CURLINFO_CONTENT_TYPE' => 1048594, 'CURLINFO_TOTAL_TIME' => 3145731,
        'CURLINFO_HEADER_SIZE' => 2097163,
        'CURLE_OK' => 0, 'CURLE_UNSUPPORTED_PROTOCOL' => 1,
        'CURLE_FAILED_INIT' => 2, 'CURLE_COULDNT_CONNECT' => 7,
        'CURLE_HTTP_RETURNED_ERROR' => 22, 'CURLE_OPERATION_TIMEDOUT' => 28,
    ] as $name => $value) if (!defined($name)) define($name, $value);

    final class CurlHandle {
        public array $options = [];
        public array $info = [];
        public string $error = '';
        public int $errno = 0;
        public function __construct(?string $url = null) {
            if ($url !== null) $this->options[CURLOPT_URL] = $url;
        }
    }
    function curl_init(?string $url = null): CurlHandle|false { return new CurlHandle($url); }
    function curl_setopt(CurlHandle $handle, int $option, mixed $value): bool {
        static $known = [
            CURLOPT_URL => 1, CURLOPT_RETURNTRANSFER => 1, CURLOPT_FOLLOWLOCATION => 1,
            CURLOPT_HTTPHEADER => 1, CURLOPT_CUSTOMREQUEST => 1, CURLOPT_POST => 1,
            CURLOPT_POSTFIELDS => 1, CURLOPT_TIMEOUT => 1, CURLOPT_TIMEOUT_MS => 1,
            CURLOPT_HEADER => 1, CURLOPT_NOBODY => 1, CURLOPT_USERAGENT => 1,
            CURLOPT_HTTPGET => 1, CURLOPT_FAILONERROR => 1,
        ];
        if (!isset($known[$option])) {
            $handle->errno = CURLE_FAILED_INIT;
            $handle->error = 'Unsupported browser cURL option ' . $option;
            return false;
        }
        $handle->options[$option] = $value;
        return true;
    }
    function curl_setopt_array(CurlHandle $handle, array $values): bool {
        foreach ($values as $option => $value)
            if (!curl_setopt($handle, (int)$option, $value)) return false;
        return true;
    }
    function curl_errno(CurlHandle $handle): int { return $handle->errno; }
    function curl_error(CurlHandle $handle): string { return $handle->error; }
    function curl_getinfo(CurlHandle $handle, ?int $option = null): mixed {
        if ($option === null) return $handle->info;
        return match ($option) {
            CURLINFO_HTTP_CODE => $handle->info['http_code'] ?? 0,
            CURLINFO_EFFECTIVE_URL => $handle->info['url'] ?? '',
            CURLINFO_CONTENT_TYPE => $handle->info['content_type'] ?? null,
            CURLINFO_TOTAL_TIME => $handle->info['total_time'] ?? 0.0,
            CURLINFO_HEADER_SIZE => $handle->info['header_size'] ?? 0,
            default => false,
        };
    }
    function curl_close(CurlHandle $handle): void {}
    function curl_reset(CurlHandle $handle): void {
        $handle->options = []; $handle->info = [];
        $handle->error = ''; $handle->errno = 0;
    }
    function curl_copy_handle(CurlHandle $handle): CurlHandle|false {
        $copy = new CurlHandle(); $copy->options = $handle->options;
        return $copy;
    }
    function curl_escape(CurlHandle $handle, string $string): string|false {
        return rawurlencode($string);
    }
    function curl_unescape(CurlHandle $handle, string $string): string|false {
        return rawurldecode($string);
    }
    function curl_version(): array {
        return ['version_number' => 0, 'version' => 'ALWIS-Fetch/1',
            'ssl_version' => 'browser TLS', 'protocols' => ['http', 'https'],
            'features' => 0, 'host' => 'browser-wasm'];
    }

    function curl_exec(CurlHandle $handle): string|bool {
        $handle->errno = 0; $handle->error = ''; $handle->info = [];
        $opts = $handle->options;
        $url = $opts[CURLOPT_URL] ?? '';
        if (!is_string($url) || !preg_match('~^https?://~i', $url)
            || parse_url($url, PHP_URL_HOST) === null
            || parse_url($url, PHP_URL_HOST) === false) {
            $handle->errno = CURLE_UNSUPPORTED_PROTOCOL;
            $handle->error = 'Only valid HTTP(S) URLs are supported';
            return false;
        }
        $method = 'GET';
        if (!empty($opts[CURLOPT_POST]) || array_key_exists(CURLOPT_POSTFIELDS, $opts)) $method = 'POST';
        if (!empty($opts[CURLOPT_HTTPGET])) $method = 'GET';
        if (!empty($opts[CURLOPT_NOBODY])) $method = 'HEAD';
        if (isset($opts[CURLOPT_CUSTOMREQUEST]))
            $method = strtoupper((string)$opts[CURLOPT_CUSTOMREQUEST]);
        if (!preg_match('/^[A-Z]{1,24}$/', $method)) {
            $handle->errno = CURLE_FAILED_INIT; $handle->error = 'Invalid HTTP method';
            return false;
        }
        $headers = $opts[CURLOPT_HTTPHEADER] ?? [];
        if (!is_array($headers)) {
            $handle->errno = CURLE_FAILED_INIT; $handle->error = 'HTTPHEADER must be an array';
            return false;
        }
        if (isset($opts[CURLOPT_USERAGENT]))
            $headers[] = 'User-Agent: ' . (string)$opts[CURLOPT_USERAGENT];
        $body = $opts[CURLOPT_POSTFIELDS] ?? '';
        if (is_array($body)) {
            $body = http_build_query($body, '', '&', PHP_QUERY_RFC1738);
            $found = false;
            foreach ($headers as $line) if (stripos((string)$line, 'Content-Type:') === 0) $found = true;
            if (!$found) $headers[] = 'Content-Type: application/x-www-form-urlencoded';
        }
        if (!is_string($body)) {
            $handle->errno = CURLE_FAILED_INIT; $handle->error = 'POSTFIELDS must be string or array';
            return false;
        }
        $timeout = isset($opts[CURLOPT_TIMEOUT_MS])
            ? ((float)$opts[CURLOPT_TIMEOUT_MS] / 1000)
            : (float)($opts[CURLOPT_TIMEOUT] ?? 30);
        if (!is_finite($timeout) || $timeout <= 0 || $timeout > 180) {
            $handle->errno = CURLE_FAILED_INIT;
            $handle->error = 'Timeout must be between 1 ms and 180 seconds';
            return false;
        }
        $options = ['method' => $method, 'header' => $headers,
            'timeout' => $timeout, 'ignore_errors' => true,
            'follow_location' => !empty($opts[CURLOPT_FOLLOWLOCATION])];
        if (array_key_exists(CURLOPT_POSTFIELDS, $opts)) $options['content'] = $body;
        $started = microtime(true);
        $errors = []; $responseHeaders = []; $result = false;

        // Avoid deadlock: this single-worker PHP runtime cannot enqueue a PHP
        // subrequest and then wait on itself. Serve existing static project
        // assets directly; fail fast for actual local PHP scripts.
        $localScheme = strtolower((string)($_SERVER['REQUEST_SCHEME'] ??
            (strtolower((string)($_SERVER['HTTPS'] ?? '')) === 'on' ||
             (string)($_SERVER['SERVER_PORT'] ?? '') === '443' ? 'https' : 'http')));
        $localHost = strtolower((string)($_SERVER['HTTP_HOST'] ?? ''));
        $targetScheme = strtolower((string)parse_url($url, PHP_URL_SCHEME));
        $targetHost = strtolower((string)parse_url($url, PHP_URL_HOST));
        $targetPort = parse_url($url, PHP_URL_PORT);
        $targetOrigin = $targetScheme . '://' . $targetHost .
            ($targetPort === null ? '' : ':' . $targetPort);
        $sameOrigin = $localHost !== '' &&
            $localScheme . '://' . $localHost === $targetOrigin;
        $route = rawurldecode((string)(parse_url($url, PHP_URL_PATH) ?: '/'));
        $root = realpath('/workspace');
        $candidate = $root ? realpath($root . '/' . ltrim($route, '/')) : false;
        $hidden = preg_match('~(?:^|/)\.[^/]+~', $route) === 1;
        $publicFile = $candidate !== false && $root !== false &&
            str_starts_with($candidate, $root . '/') &&
            is_file($candidate) && !$hidden;
        // Same-origin HTTP endpoints can belong to the host server (such
        // as /echo), rather than this PHP virtual-site worker. Reject
        // explicit PHP recursion, not unrelated dynamic HTTP paths.
        if ($sameOrigin && preg_match('~\.php(?:$|/)~i', $route)) {
            $handle->errno = CURLE_FAILED_INIT;
            $handle->error = 'Recursive PHP self-request requires an independent executor';
            return false;
        }
        if ($sameOrigin && $publicFile && $method === 'GET') {
            $result = @file_get_contents($candidate);
            $responseHeaders = ['HTTP/1.1 200 OK', 'Content-Type: application/octet-stream'];
        } else {
            set_error_handler(static function (int $code, string $message) use (&$errors): bool {
                $errors[] = $message; return true;
            });
            try {
                $result = file_get_contents($url, false, stream_context_create(['http' => $options]));
                $responseHeaders = $http_response_header ?? [];
            } finally {
                restore_error_handler();
            }
        }
        $status = 0; $type = null;
        foreach ($responseHeaders as $line) {
            if (preg_match('~^HTTP/\S+\s+(\d{3})~i', $line, $parts)) $status = (int)$parts[1];
            if (stripos($line, 'Content-Type:') === 0) $type = trim(substr($line, 13));
        }
        $headerBlock = $responseHeaders ? implode("\r\n", $responseHeaders) . "\r\n\r\n" : '';
        $handle->info = [
            'url' => $url, 'http_code' => $status,
            'content_type' => $type, 'header_size' => strlen($headerBlock),
            'total_time' => max(0.0, microtime(true) - $started),
        ];
        if ($result === false) {
            $handle->errno = str_contains(strtolower(implode(' ', $errors)), 'timed out')
                ? CURLE_OPERATION_TIMEDOUT : CURLE_COULDNT_CONNECT;
            $handle->error = implode('; ', $errors) ?: 'Browser Fetch refused or aborted the request';
            return false;
        }
        if (!empty($opts[CURLOPT_FAILONERROR]) && $status >= 400) {
            $handle->errno = CURLE_HTTP_RETURNED_ERROR;
            $handle->error = 'HTTP ' . $status;
            return false;
        }
        $output = (!empty($opts[CURLOPT_HEADER]) ? $headerBlock : '')
            . ($method === 'HEAD' ? '' : $result);
        if (!empty($opts[CURLOPT_RETURNTRANSFER])) return $output;
        echo $output;
        return true;
    }
}
