/*
 * ALWIS independent PHP 8.4 SAPI/HTTP runner candidate.
 * SPDX-License-Identifier: GPL-2.0-only
 *
 * Uses the supported PHP SAPI lifecycle; does not reuse the missing JoomEngine
 * native/runtime.c. Link and browser parity are mandatory before distribution.
 */
#include <php.h>
#include <SAPI.h>
#include <php_main.h>
#include <php_variables.h>
#include <Zend/zend_signal.h>
#include <emscripten.h>
#include <stddef.h>
#include <stdint.h>
#include <stdlib.h>
#include <string.h>
#include <stdio.h>
#include "pbl_mysql.h"
#include "request-state.h"

extern zend_module_entry pbl_native_module_entry;
static pbl_request_state request_state;
static int php_ready;
static int php_failed;
static int last_exit_code;
static char *ini_settings;
static int headers_emitted;
static int head_only;
#define ALWIS_EXTRA_SERVER_MAX 64
static struct { char *name; char *value; } extra_server[ALWIS_EXTRA_SERVER_MAX];
static size_t extra_server_count;
static void alwis_clear_extra_server(void)
{
    for (size_t i = 0; i < extra_server_count; ++i) {
        free(extra_server[i].name);
        free(extra_server[i].value);
        extra_server[i].name = extra_server[i].value = NULL;
    }
    extra_server_count = 0;
}

/* No PHP/SQL processing runs in JS. These host calls only pass request bytes,
 * SAPI headers, stderr and stdout between the owner worker and the native SAPI. */
EM_JS(char *, alwis_field, (const char *key), {
    const request = Module.phpWasm?.request;
    const value = request?.[UTF8ToString(key)];
    if (typeof value !== 'string') return 0;
    const capacity = lengthBytesUTF8(value) + 1;
    const ptr = _malloc(capacity);
    if (!ptr) return 0;
    stringToUTF8(value, ptr, capacity);
    return ptr;
});
EM_JS(size_t, alwis_body_length, (void), {
    return Module.phpWasm?.request?.body?.byteLength ?? 0;
});
EM_JS(size_t, alwis_body_copy, (size_t position, char *target, size_t count), {
    const body = Module.phpWasm?.request?.body;
    if (!(body instanceof Uint8Array) || position >= body.length) return 0;
    const bytes = body.subarray(position, Math.min(position + count, body.length));
    HEAPU8.set(bytes, target);
    return bytes.length;
});
EM_JS(int, alwis_server_count, (void), {
    return Object.keys(Module.phpWasm?.request?.server ?? {}).length;
});
EM_JS(char *, alwis_server_field, (int index, int value), {
    const table = Module.phpWasm?.request?.server ?? {};
    const key = Object.keys(table)[index];
    if (key === undefined) return 0;
    const text = String(value ? table[key] : key);
    const capacity = lengthBytesUTF8(text) + 1;
    const ptr = _malloc(capacity);
    if (!ptr) return 0;
    stringToUTF8(text, ptr, capacity);
    return ptr;
});
EM_JS(int, alwis_env_count, (void), {
    return Object.keys(Module.phpWasm?.request?.env ?? {}).length;
});
EM_JS(char *, alwis_env_field, (int index, int value), {
    const table = Module.phpWasm?.request?.env ?? {};
    const key = Object.keys(table)[index];
    if (key === undefined) return 0;
    const text = String(value ? table[key] : key);
    const capacity = lengthBytesUTF8(text) + 1;
    const ptr = _malloc(capacity);
    if (!ptr) return 0;
    stringToUTF8(text, ptr, capacity);
    return ptr;
});
EM_JS(void, alwis_stdout, (const char *bytes, size_t length), {
    Module.phpWasm?.onStdout?.(HEAPU8.slice(bytes, bytes + length));
});
EM_JS(void, alwis_stderr, (const char *bytes, size_t length), {
    Module.phpWasm?.onStderr?.(HEAPU8.slice(bytes, bytes + length));
});
EM_JS(void, alwis_headers_begin, (void), { Module.phpWasm._alwisHeaders = []; });
EM_JS(void, alwis_headers_add, (const char *value, size_t length), {
    Module.phpWasm._alwisHeaders.push(UTF8ToString(value, length));
});
EM_JS(void, alwis_headers_commit, (int status), {
    Module.phpWasm?.onHeaders?.(status, Module.phpWasm._alwisHeaders ?? []);
    delete Module.phpWasm._alwisHeaders;
});
EM_JS(int, alwis_request_present, (void), { return Module.phpWasm?.request ? 1 : 0; });

static int alwis_startup(sapi_module_struct *sapi)
{
    return php_module_startup(sapi, &pbl_native_module_entry);
}
static size_t alwis_write(const char *bytes, size_t length)
{
    if (pbl_request_account_output(&request_state, length) != 0) {
        php_handle_aborted_connection();
        return 0;
    }
    if (length && !head_only) alwis_stdout(bytes, length);
    return length;
}
static void alwis_flush(void *context) { (void)context; }
static size_t alwis_read_post(char *target, size_t capacity)
{
    const size_t offset = request_state.body_offset;
    const size_t want = pbl_request_available(&request_state, capacity);
    if (!want) return 0;
    const size_t copied = alwis_body_copy(offset, target, want);
    if (copied != want) {
        /* A failed JS/WASM transfer must not advance php://input or retry a POST. */
        request_state.overflow = 1;
        return 0;
    }
    return pbl_request_consume(&request_state, copied);
}
static char *alwis_cookies(void)
{
    return SG(request_info).cookie_data;
}
static void alwis_register_server_variables(zval *track)
{
    php_import_environment_variables(track);
    int count = alwis_server_count();
    if (count > 128) count = 128;
    for (int i = 0; i < count; ++i) {
        char *key = alwis_server_field(i, 0), *value = alwis_server_field(i, 1);
        if (key && value && strlen(key) < 128 && strlen(value) < 8192)
            php_register_variable_safe(key, value, strlen(value), track);
        free(key); free(value);
    }
    for (size_t i = 0; i < extra_server_count; ++i)
        php_register_variable_safe(extra_server[i].name, extra_server[i].value,
            strlen(extra_server[i].value), track);
}
static int alwis_send_headers(sapi_headers_struct *headers)
{
    zend_llist_position position;
    sapi_header_struct *header;
    alwis_headers_begin();
    header = zend_llist_get_first_ex(&headers->headers, &position);
    while (header) {
        alwis_headers_add(header->header, header->header_len);
        header = zend_llist_get_next_ex(&headers->headers, &position);
    }
    alwis_headers_commit(headers->http_response_code ? headers->http_response_code : 200);
    headers_emitted = 1;
    return SAPI_HEADER_SENT_SUCCESSFULLY;
}
static void alwis_log(const char *message, int type)
{
    (void)type;
    if (!message) return;
    alwis_stderr(message, strlen(message));
    alwis_stderr("\n", 1);
}
static sapi_module_struct alwis_sapi = {
    "alwis", "ALWIS native PHP HTTP",
    alwis_startup, php_module_shutdown_wrapper,
    NULL, NULL,
    alwis_write, alwis_flush, NULL, NULL,
    php_error,
    NULL, alwis_send_headers, NULL,
    alwis_read_post, alwis_cookies,
    alwis_register_server_variables, alwis_log,
    NULL, NULL,
    STANDARD_SAPI_MODULE_PROPERTIES
};

static int alwis_initialize(void)
{
    if (php_failed) return -1;
    if (php_ready) return 0;
#ifdef ZTS
    if (!php_tsrm_startup()) { php_failed = 1; return -1; }
#endif
#ifdef ZEND_SIGNALS
    zend_signal_startup();
#endif
    sapi_startup(&alwis_sapi);
    ini_settings = alwis_field("ini");
    alwis_sapi.ini_entries = ini_settings;
    alwis_sapi.php_ini_ignore = 1;
    alwis_sapi.php_ini_ignore_cwd = 1;
    if (alwis_sapi.startup(&alwis_sapi) == FAILURE) {
        php_failed = 1;
        sapi_shutdown();
        return -1;
    }
    SG(options) |= SAPI_OPTION_NO_CHDIR;
    php_ready = 1;
    return 0;
}

static void alwis_install_environment(void)
{
    int count = alwis_env_count();
    if (count > 32) count = 32;
    for (int i = 0; i < count; ++i) {
        char *key = alwis_env_field(i, 0), *value = alwis_env_field(i, 1);
        if (key && value && strlen(key) < 128 && strlen(value) < 8192 &&
            !strchr(key, '=') && !strchr(key, '\n')) setenv(key, value, 1);
        free(key); free(value);
    }
}

EMSCRIPTEN_KEEPALIVE int php_wasm_run(const char *script, int unused1, int unused2, int unused3)
{
    (void)unused1; (void)unused2; (void)unused3;
    last_exit_code = 255;
    headers_emitted = 0;
    head_only = 0;
    if (!alwis_request_present() || !script) return last_exit_code;
    const size_t length = alwis_body_length();
    if (pbl_request_begin(&request_state, script, length)) {
        /* A rejected input must never be exposed as HTTP 200 with empty body. */
        alwis_headers_begin();
        alwis_headers_commit(400);
        alwis_clear_extra_server();
        return last_exit_code;
    }
    if (alwis_initialize()) goto finish;
    alwis_install_environment();
    char *method = alwis_field("method"), *uri = alwis_field("uri"),
         *query = alwis_field("query"), *content_type = alwis_field("contentType"),
         *cookie = alwis_field("cookie"), *script_path = strdup(script);
    if (!method || !uri || !query || !content_type || !cookie || !script_path) {
        free(method); free(uri); free(query); free(content_type);
        free(cookie); free(script_path);
        goto finish;
    }
    SG(request_info).request_method = method;
    SG(request_info).request_uri = uri;
    SG(request_info).query_string = query;
    SG(request_info).content_type = content_type;
    SG(request_info).cookie_data = cookie;
    SG(request_info).path_translated = script_path;
    SG(request_info).content_length = (zend_long)length;
    SG(request_info).headers_only = strcmp(method, "HEAD") == 0;
    head_only = SG(request_info).headers_only;
    SG(request_info).no_headers = 0;
    /*
     * PHP 8.4 sapi_activate() only invokes the built-in POST reader and
     * read_cookies callback when SG(server_context) is non-NULL.
     * ALWIS is an HTTP SAPI: use the active bounded request as the context.
     * Keep it alive through php_request_shutdown() (sapi_deactivate()).
     */
    SG(server_context) = &request_state;
    uint64_t owner = pbl_mysql_owner_begin();
    if (php_request_startup() == SUCCESS) {
        /*
         * PHP 8.4's php_execute_script() does NOT clear EG(exit_status).
         * An uncaught exception or an explicit exit(42) can leave that status
         * set for the next PHP request in the same long-lived WASM module.
         * php_execute_simple_script() clears it before dispatch, but we use
         * the HTTP SAPI entrypoint; reset it after request startup, BEFORE
         * userland code. Never erase it after an exception.
         */
        EG(exit_status) = 0;
        zend_file_handle file;
        zend_stream_init_filename(&file, script);
        volatile bool script_ok = false;
        bool escaped_php_bailout = false;
        zend_try {
            script_ok = php_execute_script(&file);
        } zend_catch {
            /* Escaped PHP bailout: do not reuse potentially corrupted Zend
             * state, but still run the request/SQL cleanup below. Ordinary
             * uncaught PHP exceptions are caught inside php_execute_script.
             */
            escaped_php_bailout = true;
        } zend_end_try();
        last_exit_code = EG(exit_status) ? EG(exit_status) : (script_ok ? 0 : 255);
        /* An uncaught exception that has not already sent HTTP headers must
         * result in an HTTP error, not a misleading 200 from shutdown flush.
         * Explicit exit(42) is not by itself an HTTP status code.
         */
        if (!script_ok && !headers_emitted &&
            SG(sapi_headers).http_response_code < 400) {
            SG(sapi_headers).http_response_code = 500;
        }
        zend_try {
            php_request_shutdown(NULL); /* flush output and close session */
        } zend_catch {
            /* A bailout during request shutdown is not a recoverable PHP
             * exception. Do not trust this WASM instance for a new request.
             */
            escaped_php_bailout = true;
        } zend_end_try();
        if (EG(exit_status)) last_exit_code = EG(exit_status);
        if (escaped_php_bailout) {
            last_exit_code = 255;
            php_failed = 1;
        }
    } else {
        /* Partially initialized PHP cannot safely serve another request. */
        php_failed = 1;
    }
    pbl_mysql_owner_cleanup(owner); /* includes abandoned transaction rollback */
    SG(server_context) = NULL; /* After shutdown, never expose a stale HTTP context. */
    SG(request_info).request_method = NULL;
    SG(request_info).request_uri = NULL;
    SG(request_info).query_string = NULL;
    SG(request_info).content_type = NULL;
    SG(request_info).cookie_data = NULL;
    SG(request_info).path_translated = NULL;
    free(method); free(uri); free(query); free(content_type);
    free(cookie); free(script_path);
finish:
    if (request_state.overflow) last_exit_code = 255;
    if (!headers_emitted) {
        alwis_headers_begin();
        alwis_headers_commit(last_exit_code == 0 ? 200 : 500);
    }
    alwis_clear_extra_server();
    pbl_request_end(&request_state);
    return last_exit_code;
}
/* Fatal engine bailouts and partial startup/shutdown are never recoverable
 * by issuing another request. The host must discard this WASM instance.
 * A normal uncaught PHP exception is *not* a poisoned engine.
 */
EMSCRIPTEN_KEEPALIVE int php_wasm_reusable(void) { return php_ready && !php_failed; }
EMSCRIPTEN_KEEPALIVE int php_wasm_exit_code(void) { return last_exit_code; }
EMSCRIPTEN_KEEPALIVE int php_wasm_abi_version(void) { return 1; }
EMSCRIPTEN_KEEPALIVE const char *php_wasm_version(void) { return PHP_VERSION; }
/* Legacy exports retained for compatibility with the ALWIS Emscripten target. */
EMSCRIPTEN_KEEPALIVE int php_wasm_setenv(const char *key, const char *value)
{
    if (!key || !value || !*key || strlen(key) > 127 || strlen(value) > 8192 ||
        strchr(key, '=') || strchr(key, '\n')) return -1;
    return setenv(key, value, 1);
}
EMSCRIPTEN_KEEPALIVE int php_wasm_add_server_variable(const char *key, const char *value)
{
    if (!key || !value || !*key || strlen(key) >= 128 || strlen(value) >= 8192 ||
        strchr(key, '=') || strchr(key, '\r') || strchr(key, '\n')) return -1;
    /* Overlays are explicitly consumed only by the next request; never leak
     * a guest's variables into subsequent PHP requests. */
    for (size_t i = 0; i < extra_server_count; ++i) {
        if (strcmp(extra_server[i].name, key) == 0) {
            char *copy = strdup(value);
            if (!copy) return -1;
            free(extra_server[i].value);
            extra_server[i].value = copy;
            return 0;
        }
    }
    if (extra_server_count == ALWIS_EXTRA_SERVER_MAX) return -1;
    char *name = strdup(key), *copy = strdup(value);
    if (!name || !copy) { free(name); free(copy); return -1; }
    extra_server[extra_server_count].name = name;
    extra_server[extra_server_count].value = copy;
    ++extra_server_count;
    return 0;
}
