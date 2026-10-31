/* Integration spike only: PHP -> embedded MariaDB C API in one WASM module.
 * Not the final PDO backend. No JSON/base64 or JS hostcall transports SQL/results.
 */
#include <php.h>
#include <sapi/embed/php_embed.h>
#include <Zend/zend_exceptions.h>
#include <mysql.h>
#include <emscripten.h>
#include <errno.h>
#include <grp.h>

int l4m_open(void);
void l4m_close(void);
static int sql_started;
static int direct_calls;

EM_JS(int, getdtablesize, (), { return FS.MAX_OPEN_FDS + 1; });
int initgroups(const char *user, gid_t group) { (void)user; (void)group; errno = ENOSYS; return -1; }

ZEND_BEGIN_ARG_WITH_RETURN_TYPE_INFO_EX(arginfo_pbl_select_one, 0, 0, IS_STRING, 0)
ZEND_END_ARG_INFO()

PHP_FUNCTION(pbl_select_one)
{
    ZEND_PARSE_PARAMETERS_NONE();
    if (!sql_started) {
        if (l4m_open() != 0) {
            zend_throw_exception(zend_ce_exception, "Embedded MariaDB initialization failed", 0);
            RETURN_THROWS();
        }
        sql_started = 1;
    }
    MYSQL *connection = mysql_init(NULL);
    if (!connection) {
        zend_throw_exception(zend_ce_exception, "mysql_init failed", 0);
        RETURN_THROWS();
    }
    if (!mysql_real_connect(connection, NULL, "root", "", "test", 0, NULL, 0) ||
        mysql_real_query(connection, "SELECT 1", sizeof("SELECT 1") - 1) != 0) {
        zend_throw_exception(zend_ce_exception, mysql_error(connection), mysql_errno(connection));
        mysql_close(connection);
        RETURN_THROWS();
    }
    MYSQL_RES *result = mysql_store_result(connection);
    MYSQL_ROW row = result ? mysql_fetch_row(result) : NULL;
    unsigned long *lengths = row ? mysql_fetch_lengths(result) : NULL;
    if (!row || !row[0] || !lengths) {
        if (result) mysql_free_result(result);
        mysql_close(connection);
        zend_throw_exception(zend_ce_exception, "SELECT 1 returned no value", 0);
        RETURN_THROWS();
    }
    RETVAL_STRINGL(row[0], lengths[0]);
    mysql_free_result(result);
    mysql_close(connection);
    ++direct_calls;
}

static const zend_function_entry bridge_functions[] = {
    PHP_FE(pbl_select_one, arginfo_pbl_select_one)
    PHP_FE_END
};

EMSCRIPTEN_KEEPALIVE int pbl_sql_started(void) { return sql_started; }
EMSCRIPTEN_KEEPALIVE int pbl_direct_calls(void) { return direct_calls; }
EMSCRIPTEN_KEEPALIVE int pbl_run_select(void)
{
    char *argv[] = { "fusion-spike", NULL };
    if (php_embed_init(1, argv) == FAILURE) return 1;
    int status = 0;
    zend_first_try {
        if (zend_register_functions(NULL, bridge_functions, NULL, MODULE_TEMPORARY) == FAILURE ||
            zend_eval_string("if (pbl_select_one() !== '1') { throw new Exception('SQL mismatch'); } if (preg_match('/^abc$/', 'abc') !== 1) { throw new Exception('PCRE mismatch'); } echo 'fusion-select-one-ok', PHP_EOL;", NULL, "fusion-spike") == FAILURE || EG(exception)) {
            status = 2;
        }
    } zend_catch { status = 3; } zend_end_try();
    php_embed_shutdown();
    return status;
}
EMSCRIPTEN_KEEPALIVE void pbl_sql_stop(void)
{
    if (sql_started) { l4m_close(); sql_started = 0; }
}
