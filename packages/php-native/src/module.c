#include <php.h>
#include <emscripten.h>
#include <Zend/zend_exceptions.h>
#include <ext/pdo/php_pdo.h>
extern zend_module_entry pdo_mysql_module_entry;
extern const zend_function_entry pbl_mysqli_functions[];
int pbl_mysqli_register(void);
int pbl_http_register(void);
static PHP_MINIT_FUNCTION(pbl_native)
{
    zend_module_entry *parent=EG(current_module);
    emscripten_log(EM_LOG_CONSOLE,"native module: PDO startup");
    if(zend_startup_module(&pdo_mysql_module_entry)==FAILURE) return FAILURE;
    EG(current_module)=parent;
    emscripten_log(EM_LOG_CONSOLE,"native module: MySQLi classes");
    if(pbl_mysqli_register()==FAILURE) return FAILURE;
    emscripten_log(EM_LOG_CONSOLE,"native module: browser streams");
    if(pbl_http_register()==FAILURE) return FAILURE;
    emscripten_log(EM_LOG_CONSOLE,"native module: constants");
    REGISTER_LONG_CONSTANT("MYSQLI_REPORT_OFF",0,CONST_CS|CONST_PERSISTENT);
    REGISTER_LONG_CONSTANT("MYSQLI_REPORT_ERROR",1,CONST_CS|CONST_PERSISTENT);
    REGISTER_LONG_CONSTANT("MYSQLI_REPORT_STRICT",2,CONST_CS|CONST_PERSISTENT);
    REGISTER_LONG_CONSTANT("MYSQLI_REPORT_ALL",255,CONST_CS|CONST_PERSISTENT);
    REGISTER_LONG_CONSTANT("MYSQLI_STORE_RESULT",0,CONST_CS|CONST_PERSISTENT);
    REGISTER_LONG_CONSTANT("MYSQLI_USE_RESULT",1,CONST_CS|CONST_PERSISTENT);
    REGISTER_LONG_CONSTANT("MYSQLI_ASSOC",1,CONST_CS|CONST_PERSISTENT);
    REGISTER_LONG_CONSTANT("MYSQLI_NUM",2,CONST_CS|CONST_PERSISTENT);
    REGISTER_LONG_CONSTANT("MYSQLI_BOTH",3,CONST_CS|CONST_PERSISTENT);
    return SUCCESS;
}
static const zend_module_dep dependencies[]={ ZEND_MOD_REQUIRED("pdo") ZEND_MOD_END };
zend_module_entry pbl_native_module_entry={ STANDARD_MODULE_HEADER_EX,NULL,dependencies,"pbl_native",pbl_mysqli_functions,PHP_MINIT(pbl_native),NULL,NULL,NULL,NULL,"0.1.0",STANDARD_MODULE_PROPERTIES };
