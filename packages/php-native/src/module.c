#include <php.h>
#include <emscripten.h>
#include <malloc.h>
EMSCRIPTEN_KEEPALIVE size_t pbl_heap_used(void) { return mallinfo().uordblks; }
EMSCRIPTEN_KEEPALIVE size_t pbl_heap_free(void) { return mallinfo().fordblks; }
#include <Zend/zend_exceptions.h>
#include <ext/pdo/php_pdo.h>
#include "pbl_mysql.h"
extern zend_module_entry pdo_mysql_module_entry;
extern const zend_function_entry pbl_mysqli_functions[];
int pbl_mysqli_register(void);
int pbl_http_register(void);
static PHP_MINIT_FUNCTION(pbl_mysqli)
{
    if(pbl_mysqli_register()==FAILURE) return FAILURE;
    REGISTER_LONG_CONSTANT("MYSQLI_REPORT_OFF",0,CONST_CS|CONST_PERSISTENT);
    REGISTER_LONG_CONSTANT("MYSQLI_REPORT_ERROR",1,CONST_CS|CONST_PERSISTENT);
    REGISTER_LONG_CONSTANT("MYSQLI_REPORT_STRICT",2,CONST_CS|CONST_PERSISTENT);
    REGISTER_LONG_CONSTANT("MYSQLI_REPORT_ALL",255,CONST_CS|CONST_PERSISTENT);
    REGISTER_LONG_CONSTANT("MYSQLI_STORE_RESULT",0,CONST_CS|CONST_PERSISTENT);
    REGISTER_LONG_CONSTANT("MYSQLI_USE_RESULT",1,CONST_CS|CONST_PERSISTENT);
    REGISTER_LONG_CONSTANT("MYSQLI_ASSOC",1,CONST_CS|CONST_PERSISTENT);
    REGISTER_LONG_CONSTANT("MYSQLI_NUM",2,CONST_CS|CONST_PERSISTENT);
    REGISTER_LONG_CONSTANT("MYSQLI_BOTH",3,CONST_CS|CONST_PERSISTENT);
#define PBL_TYPE(name) REGISTER_LONG_CONSTANT("MYSQLI_TYPE_" #name,MYSQL_TYPE_##name,CONST_CS|CONST_PERSISTENT)
    PBL_TYPE(DECIMAL); PBL_TYPE(TINY); PBL_TYPE(SHORT); PBL_TYPE(LONG); PBL_TYPE(LONGLONG); PBL_TYPE(INT24);
    PBL_TYPE(FLOAT); PBL_TYPE(DOUBLE); PBL_TYPE(NULL); PBL_TYPE(TIMESTAMP); PBL_TYPE(DATE); PBL_TYPE(TIME);
    PBL_TYPE(DATETIME); PBL_TYPE(YEAR); PBL_TYPE(BIT); PBL_TYPE(NEWDECIMAL); PBL_TYPE(ENUM); PBL_TYPE(SET);
    PBL_TYPE(TINY_BLOB); PBL_TYPE(MEDIUM_BLOB); PBL_TYPE(LONG_BLOB); PBL_TYPE(BLOB); PBL_TYPE(VAR_STRING); PBL_TYPE(STRING); PBL_TYPE(GEOMETRY);
#undef PBL_TYPE
#define PBL_FLAG(name) REGISTER_LONG_CONSTANT("MYSQLI_" #name,name,CONST_CS|CONST_PERSISTENT)
    PBL_FLAG(NOT_NULL_FLAG); PBL_FLAG(PRI_KEY_FLAG); PBL_FLAG(UNIQUE_KEY_FLAG); PBL_FLAG(MULTIPLE_KEY_FLAG);
    PBL_FLAG(BLOB_FLAG); PBL_FLAG(UNSIGNED_FLAG); PBL_FLAG(ZEROFILL_FLAG); PBL_FLAG(BINARY_FLAG); PBL_FLAG(AUTO_INCREMENT_FLAG);
#undef PBL_FLAG
    return SUCCESS;
}
static zend_module_entry mysqli_module_entry={STANDARD_MODULE_HEADER,"mysqli",pbl_mysqli_functions,PHP_MINIT(pbl_mysqli),NULL,NULL,NULL,NULL,PHP_VERSION,STANDARD_MODULE_PROPERTIES};
static PHP_MINIT_FUNCTION(pbl_native)
{
    zend_module_entry *parent=EG(current_module);
    if(zend_startup_module(&pdo_mysql_module_entry)==FAILURE) return FAILURE;
    EG(current_module)=parent;
    if(zend_startup_module(&mysqli_module_entry)==FAILURE) return FAILURE;
    EG(current_module)=parent;
    return pbl_http_register();
}
static const zend_module_dep dependencies[]={ ZEND_MOD_REQUIRED("pdo") ZEND_MOD_END };
zend_module_entry pbl_native_module_entry={ STANDARD_MODULE_HEADER_EX,NULL,dependencies,"pbl_native",NULL,PHP_MINIT(pbl_native),NULL,NULL,NULL,NULL,"0.1.0",STANDARD_MODULE_PROPERTIES };
