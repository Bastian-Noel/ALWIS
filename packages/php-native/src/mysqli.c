/* Native MySQLi subset over the SAME embedded C connection registry as PDO.
 * Implements the school fixture including by-reference prepared parameters.
 * No PHP shim, SQL JSON protocol or remote SQL socket is used.
 */
#include <php.h>
#include <Zend/zend_exceptions.h>
#include <limits.h>
#include <errno.h>
#include "pbl_mysql.h"

#define RESULT_BYTES (16u * 1024u * 1024u)
#define RESULT_ROWS 10000u
#define SQL_BYTES (8u * 1024u * 1024u)
static zend_class_entry *connection_ce, *result_ce, *statement_ce, *sql_exception_ce;
static zend_object_handlers connection_handlers, result_handlers, statement_handlers;
static zend_long report_mode = 3;
typedef struct native_statement native_statement;
typedef struct { MYSQL *mysql; native_statement *statements; zend_object std; } native_connection;
typedef struct { zval rows, fields; zend_ulong position; zend_object std; } native_result;
struct native_statement { MYSQL_STMT *stmt; zval connection; zval *parameters; char *types; size_t count; native_statement *next; zend_object std; };
#define CONN(v) ((native_connection *)((char *)Z_OBJ_P(v)-XtOffsetOf(native_connection,std)))
#define RES(v) ((native_result *)((char *)Z_OBJ_P(v)-XtOffsetOf(native_result,std)))
#define STMT(v) ((native_statement *)((char *)Z_OBJ_P(v)-XtOffsetOf(native_statement,std)))

static void sql_error(MYSQL *mysql, MYSQL_STMT *stmt)
{
    const char *message = stmt ? mysql_stmt_error(stmt) : mysql ? mysql_error(mysql) : "Embedded SQL initialization, allocation or connection limit failure";
    unsigned code = stmt ? mysql_stmt_errno(stmt) : mysql ? mysql_errno(mysql) : 2002;
    if (report_mode & 2) {
        zend_object *error = zend_throw_exception(sql_exception_ce, message, code);
        const char *state = stmt ? mysql_stmt_sqlstate(stmt) : mysql ? mysql_sqlstate(mysql) : "HY000";
        if (error) zend_update_property_string(sql_exception_ce,error,"sqlstate",8,state);
    } else if (report_mode & 1) php_error_docref(NULL,E_WARNING,"%s",message);
}
static MYSQL *require_connection(zval *value)
{
    MYSQL *mysql=CONN(value)->mysql;
    if (!mysql) zend_throw_error(NULL,"mysqli object is closed or uninitialized");
    return mysql;
}
static MYSQL_STMT *require_statement(zval *value)
{
    MYSQL_STMT *stmt=STMT(value)->stmt;
    if (!stmt) zend_throw_error(NULL,"mysqli_stmt object is closed or uninitialized");
    return stmt;
}
static void connection_info(zval *object)
{
    MYSQL *mysql=CONN(object)->mysql;
    if (!mysql) return;
    zend_update_property_long(connection_ce,Z_OBJ_P(object),"errno",5,mysql_errno(mysql));
    zend_update_property_string(connection_ce,Z_OBJ_P(object),"error",5,mysql_error(mysql));
    my_ulonglong id=mysql_insert_id(mysql), affected=mysql_affected_rows(mysql);
    char text[32];
    if (id<=ZEND_LONG_MAX) zend_update_property_long(connection_ce,Z_OBJ_P(object),"insert_id",9,(zend_long)id);
    else { snprintf(text,sizeof(text),"%llu",(unsigned long long)id); zend_update_property_string(connection_ce,Z_OBJ_P(object),"insert_id",9,text); }
    zend_update_property_long(connection_ce,Z_OBJ_P(object),"affected_rows",13,affected==(my_ulonglong)-1?-1:(zend_long)affected);
}
static void close_connection(native_connection *connection)
{
    for (native_statement *stmt=connection->statements;stmt;stmt=stmt->next) {
        if (stmt->stmt) { mysql_stmt_close(stmt->stmt); stmt->stmt=NULL; }
    }
    if (connection->mysql) { pbl_mysql_close(connection->mysql); connection->mysql=NULL; }
}
static zend_object *new_connection(zend_class_entry *ce)
{
    native_connection *object=zend_object_alloc(sizeof(*object),ce);
    zend_object_std_init(&object->std,ce); object_properties_init(&object->std,ce);
    object->std.handlers=&connection_handlers; return &object->std;
}
static void free_connection(zend_object *std)
{
    native_connection *object=(native_connection *)((char *)std-XtOffsetOf(native_connection,std));
    close_connection(object); zend_object_std_dtor(std);
}
static zend_object *new_result(zend_class_entry *ce)
{
    native_result *object=zend_object_alloc(sizeof(*object),ce);
    zend_object_std_init(&object->std,ce); object_properties_init(&object->std,ce);
    ZVAL_UNDEF(&object->rows); ZVAL_UNDEF(&object->fields);
    object->std.handlers=&result_handlers; return &object->std;
}
static void clear_result(native_result *object)
{
    zval_ptr_dtor(&object->rows); zval_ptr_dtor(&object->fields);
    ZVAL_UNDEF(&object->rows); ZVAL_UNDEF(&object->fields);
}
static void free_result(zend_object *std)
{
    native_result *object=(native_result *)((char *)std-XtOffsetOf(native_result,std));
    clear_result(object); zend_object_std_dtor(std);
}
static zend_object *new_statement(zend_class_entry *ce)
{
    native_statement *object=zend_object_alloc(sizeof(*object),ce);
    zend_object_std_init(&object->std,ce); object_properties_init(&object->std,ce);
    ZVAL_UNDEF(&object->connection); object->std.handlers=&statement_handlers; return &object->std;
}
static void clear_parameters(native_statement *object)
{
    for(size_t i=0;i<object->count;i++) zval_ptr_dtor(&object->parameters[i]);
    if(object->parameters) efree(object->parameters);
    if(object->types) efree(object->types);
    object->parameters=NULL; object->types=NULL; object->count=0;
}
static void close_statement(native_statement *object)
{
    if(object->stmt) { mysql_stmt_close(object->stmt); object->stmt=NULL; }
    clear_parameters(object);
}
static void free_statement(zend_object *std)
{
    native_statement *object=(native_statement *)((char *)std-XtOffsetOf(native_statement,std));
    close_statement(object);
    if(!Z_ISUNDEF(object->connection)) {
        native_statement **link=&CONN(&object->connection)->statements;
        while(*link && *link!=object) link=&(*link)->next;
        if(*link) *link=object->next;
        zval_ptr_dtor(&object->connection);
    }
    zend_object_std_dtor(std);
}
static int connect_object(zval *object,const char *host,const char *user,const char *password,const char *database)
{
    native_connection *connection=CONN(object);
    if(connection->mysql) { zend_throw_error(NULL,"mysqli object is already connected"); return 0; }
    if(host && strcmp(host,"localhost") && strcmp(host,"127.0.0.1")) { zend_value_error("Only the local embedded SQL host is supported"); return 0; }
    connection->mysql=pbl_mysql_init(NULL);
    if(!connection->mysql) { sql_error(NULL,NULL); return 0; }
    if(!mysql_real_connect(connection->mysql,NULL,user?user:"root",password?password:"",database,0,NULL,0)) {
        zend_update_property_long(connection_ce,Z_OBJ_P(object),"connect_errno",13,mysql_errno(connection->mysql));
        zend_update_property_string(connection_ce,Z_OBJ_P(object),"connect_error",13,mysql_error(connection->mysql));
        sql_error(connection->mysql,NULL); pbl_mysql_close(connection->mysql); connection->mysql=NULL; return 0;
    }
    connection_info(object); return 1;
}
#define PARSE_CONNECT() \
    char *host=NULL,*user=NULL,*password=NULL,*database=NULL,*socket=NULL; \
    size_t host_len=0,user_len=0,password_len=0,database_len=0,socket_len=0; zend_long port=0; \
    ZEND_PARSE_PARAMETERS_START(0,6) Z_PARAM_OPTIONAL \
      Z_PARAM_STRING_OR_NULL(host,host_len) Z_PARAM_STRING_OR_NULL(user,user_len) \
      Z_PARAM_STRING_OR_NULL(password,password_len) Z_PARAM_STRING_OR_NULL(database,database_len) \
      Z_PARAM_LONG(port) Z_PARAM_STRING_OR_NULL(socket,socket_len) ZEND_PARSE_PARAMETERS_END()
PHP_FUNCTION(mysqli_connect) { PARSE_CONNECT(); object_init_ex(return_value,connection_ce); if(!connect_object(return_value,host,user,password,database)) { zval_ptr_dtor(return_value); RETURN_FALSE; } }
PHP_METHOD(mysqli,__construct) { PARSE_CONNECT(); connect_object(ZEND_THIS,host,user,password,database); }
PHP_FUNCTION(mysqli_report) { zend_long mode; ZEND_PARSE_PARAMETERS_START(1,1) Z_PARAM_LONG(mode) ZEND_PARSE_PARAMETERS_END(); report_mode=mode; RETURN_TRUE; }
PHP_METHOD(mysqli_sql_exception,getSqlState) { ZEND_PARSE_PARAMETERS_NONE(); zval rv; zval *v=zend_read_property(sql_exception_ce,Z_OBJ_P(ZEND_THIS),"sqlstate",8,0,&rv); RETURN_COPY(v); }

static void result_init(zval *value,MYSQL_RES *metadata)
{
    object_init_ex(value,result_ce); native_result *result=RES(value);
    array_init(&result->rows); array_init(&result->fields);
    MYSQL_FIELD *fields=mysql_fetch_fields(metadata);
    for(unsigned i=0;i<mysql_num_fields(metadata);i++) add_next_index_string(&result->fields,fields[i].name);
    zend_update_property_long(result_ce,Z_OBJ_P(value),"field_count",11,mysql_num_fields(metadata));
}
static int result_limit(size_t bytes,size_t rows)
{
    if(bytes>RESULT_BYTES || rows>=RESULT_ROWS) { zend_throw_exception(sql_exception_ce,"Native result copy limit exceeded",0); return 0; }
    return 1;
}
static void query_object(zval *object,const char *sql,size_t length,zval *result)
{
    MYSQL *mysql=require_connection(object); if(!mysql) { ZVAL_FALSE(result); return; }
    if(length>SQL_BYTES) { zend_value_error("SQL exceeds native request byte limit"); ZVAL_FALSE(result); return; }
    if(mysql_real_query(mysql,sql,length)) { connection_info(object); sql_error(mysql,NULL); ZVAL_FALSE(result); return; }
    connection_info(object);
    MYSQL_RES *rows=mysql_store_result(mysql);
    if(!rows) { if(mysql_field_count(mysql)) { sql_error(mysql,NULL); ZVAL_FALSE(result); } else ZVAL_TRUE(result); return; }
    result_init(result,rows); native_result *data=RES(result); MYSQL_ROW row; size_t total=0,count=0;
    while((row=mysql_fetch_row(rows))) {
        unsigned long *lengths=mysql_fetch_lengths(rows); zval record; array_init(&record);
        for(unsigned i=0;i<mysql_num_fields(rows);i++) {
            total+=row[i]?lengths[i]:0;
            if(!result_limit(total,count)) { zval_ptr_dtor(&record); mysql_free_result(rows); zval_ptr_dtor(result); ZVAL_FALSE(result); return; }
            if(row[i]) add_next_index_stringl(&record,row[i],lengths[i]); else add_next_index_null(&record);
        }
        add_next_index_zval(&data->rows,&record); ++count;
    }
    mysql_free_result(rows); zend_update_property_long(result_ce,Z_OBJ_P(result),"num_rows",8,count);
}
PHP_FUNCTION(mysqli_query) { zval *object; char *sql; size_t length; zend_long mode=0; ZEND_PARSE_PARAMETERS_START(2,3) Z_PARAM_OBJECT_OF_CLASS(object,connection_ce) Z_PARAM_STRING(sql,length) Z_PARAM_OPTIONAL Z_PARAM_LONG(mode) ZEND_PARSE_PARAMETERS_END(); if(mode!=0){zend_value_error("Only MYSQLI_STORE_RESULT is supported"); RETURN_THROWS();} query_object(object,sql,length,return_value); }
PHP_METHOD(mysqli,query) { char *sql; size_t length; zend_long mode=0; ZEND_PARSE_PARAMETERS_START(1,2) Z_PARAM_STRING(sql,length) Z_PARAM_OPTIONAL Z_PARAM_LONG(mode) ZEND_PARSE_PARAMETERS_END(); if(mode!=0){zend_value_error("Only MYSQLI_STORE_RESULT is supported"); RETURN_THROWS();} query_object(ZEND_THIS,sql,length,return_value); }
static void fetch_result(zval *object,zval *output,int assoc)
{
    native_result *result=RES(object);
    if(Z_ISUNDEF(result->rows)) { zend_throw_error(NULL,"mysqli_result is closed"); ZVAL_NULL(output); return; }
    zval *row=zend_hash_index_find(Z_ARRVAL(result->rows),result->position++);
    if(!row) { ZVAL_NULL(output); return; }
    if(!assoc) { ZVAL_COPY(output,row); return; }
    array_init(output); zval *cell; zend_ulong index=0;
    ZEND_HASH_FOREACH_VAL(Z_ARRVAL_P(row),cell) {
        zval *field=zend_hash_index_find(Z_ARRVAL(result->fields),index++); zval copy; ZVAL_COPY(&copy,cell);
        zend_hash_update(Z_ARRVAL_P(output),Z_STR_P(field),&copy);
    } ZEND_HASH_FOREACH_END();
}
PHP_FUNCTION(mysqli_fetch_assoc) { zval *object; ZEND_PARSE_PARAMETERS_START(1,1) Z_PARAM_OBJECT_OF_CLASS(object,result_ce) ZEND_PARSE_PARAMETERS_END(); fetch_result(object,return_value,1); }
PHP_FUNCTION(mysqli_fetch_row) { zval *object; ZEND_PARSE_PARAMETERS_START(1,1) Z_PARAM_OBJECT_OF_CLASS(object,result_ce) ZEND_PARSE_PARAMETERS_END(); fetch_result(object,return_value,0); }
PHP_METHOD(mysqli_result,fetch_assoc) { ZEND_PARSE_PARAMETERS_NONE(); fetch_result(ZEND_THIS,return_value,1); }
PHP_METHOD(mysqli_result,fetch_row) { ZEND_PARSE_PARAMETERS_NONE(); fetch_result(ZEND_THIS,return_value,0); }
PHP_FUNCTION(mysqli_free_result) { zval *object; ZEND_PARSE_PARAMETERS_START(1,1) Z_PARAM_OBJECT_OF_CLASS(object,result_ce) ZEND_PARSE_PARAMETERS_END(); clear_result(RES(object)); }
PHP_METHOD(mysqli_result,free) { ZEND_PARSE_PARAMETERS_NONE(); clear_result(RES(ZEND_THIS)); }

static void prepare_object(zval *connection,const char *sql,size_t length,zval *output)
{
    MYSQL *mysql=require_connection(connection); if(!mysql) { ZVAL_FALSE(output); return; }
    if(length>SQL_BYTES) { zend_value_error("SQL exceeds native request byte limit"); ZVAL_FALSE(output); return; }
    MYSQL_STMT *stmt=mysql_stmt_init(mysql);
    if(!stmt || mysql_stmt_prepare(stmt,sql,length)) { sql_error(mysql,stmt); if(stmt) mysql_stmt_close(stmt); ZVAL_FALSE(output); return; }
    object_init_ex(output,statement_ce); native_statement *object=STMT(output); object->stmt=stmt;
    ZVAL_COPY(&object->connection,connection); object->next=CONN(connection)->statements; CONN(connection)->statements=object;
}
PHP_FUNCTION(mysqli_prepare) { zval *connection; char *sql; size_t length; ZEND_PARSE_PARAMETERS_START(2,2) Z_PARAM_OBJECT_OF_CLASS(connection,connection_ce) Z_PARAM_STRING(sql,length) ZEND_PARSE_PARAMETERS_END(); prepare_object(connection,sql,length,return_value); }
PHP_METHOD(mysqli,prepare) { char *sql; size_t length; ZEND_PARSE_PARAMETERS_START(1,1) Z_PARAM_STRING(sql,length) ZEND_PARSE_PARAMETERS_END(); prepare_object(ZEND_THIS,sql,length,return_value); }
static int bind_parameters(zval *object,const char *types,size_t length,zval *values,int count)
{
    MYSQL_STMT *stmt=require_statement(object); if(!stmt) return 0;
    if(length!=(size_t)count || length!=mysql_stmt_param_count(stmt)) { zend_argument_count_error("Types, variables and SQL parameter counts must match"); return 0; }
    for(size_t i=0;i<length;i++) if(!strchr("idsb",types[i])) { zend_value_error("Parameter type must be i, d, s or b"); return 0; }
    native_statement *data=STMT(object); clear_parameters(data);
    data->count=count; data->types=estrndup(types,length); data->parameters=ecalloc(count?count:1,sizeof(zval));
    for(int i=0;i<count;i++) ZVAL_COPY(&data->parameters[i],&values[i]);
    return 1;
}
PHP_FUNCTION(mysqli_stmt_bind_param) { zval *object,*values; int count; char *types; size_t length; ZEND_PARSE_PARAMETERS_START(2,-1) Z_PARAM_OBJECT_OF_CLASS(object,statement_ce) Z_PARAM_STRING(types,length) Z_PARAM_VARIADIC('*',values,count) ZEND_PARSE_PARAMETERS_END(); RETURN_BOOL(bind_parameters(object,types,length,values,count)); }
PHP_METHOD(mysqli_stmt,bind_param) { zval *values; int count; char *types; size_t length; ZEND_PARSE_PARAMETERS_START(1,-1) Z_PARAM_STRING(types,length) Z_PARAM_VARIADIC('*',values,count) ZEND_PARSE_PARAMETERS_END(); RETURN_BOOL(bind_parameters(ZEND_THIS,types,length,values,count)); }
static int execute_statement(zval *object)
{
    MYSQL_STMT *stmt=require_statement(object); if(!stmt) return 0;
    native_statement *data=STMT(object); size_t count=data->count;
    if(count!=mysql_stmt_param_count(stmt)) { zend_argument_count_error("Bind SQL parameters before execution"); return 0; }
    MYSQL_BIND *bind=ecalloc(count?count:1,sizeof(*bind));
    my_bool *nulls=ecalloc(count?count:1,sizeof(*nulls)); unsigned long *lengths=ecalloc(count?count:1,sizeof(*lengths));
    long long *integers=ecalloc(count?count:1,sizeof(*integers)); double *numbers=ecalloc(count?count:1,sizeof(*numbers));
    zend_string **strings=ecalloc(count?count:1,sizeof(*strings));
    for(size_t i=0;i<count;i++) {
        zval *value=&data->parameters[i]; ZVAL_DEREF(value);
        bind[i].is_null=&nulls[i]; bind[i].length=&lengths[i];
        if(Z_TYPE_P(value)==IS_NULL) { nulls[i]=1; bind[i].buffer_type=MYSQL_TYPE_NULL; }
        else if(data->types[i]=='i') { integers[i]=zval_get_long(value); bind[i].buffer_type=MYSQL_TYPE_LONGLONG; bind[i].buffer=&integers[i]; }
        else if(data->types[i]=='d') { numbers[i]=zval_get_double(value); bind[i].buffer_type=MYSQL_TYPE_DOUBLE; bind[i].buffer=&numbers[i]; }
        else { strings[i]=zval_get_string(value); lengths[i]=ZSTR_LEN(strings[i]); bind[i].buffer_type=data->types[i]=='b'?MYSQL_TYPE_BLOB:MYSQL_TYPE_STRING; bind[i].buffer=ZSTR_VAL(strings[i]); bind[i].buffer_length=lengths[i]; }
    }
    int status=(count && mysql_stmt_bind_param(stmt,bind)) || mysql_stmt_execute(stmt);
    for(size_t i=0;i<count;i++) if(strings[i]) zend_string_release(strings[i]);
    efree(strings); efree(numbers); efree(integers); efree(lengths); efree(nulls); efree(bind);
    connection_info(&data->connection);
    if(status) sql_error(NULL,stmt);
    return !status;
}
PHP_FUNCTION(mysqli_stmt_execute) { zval *object; ZEND_PARSE_PARAMETERS_START(1,1) Z_PARAM_OBJECT_OF_CLASS(object,statement_ce) ZEND_PARSE_PARAMETERS_END(); RETURN_BOOL(execute_statement(object)); }
PHP_METHOD(mysqli_stmt,execute) { ZEND_PARSE_PARAMETERS_NONE(); RETURN_BOOL(execute_statement(ZEND_THIS)); }

static void statement_result(zval *object,zval *output)
{
    MYSQL_STMT *stmt=require_statement(object); if(!stmt) { ZVAL_FALSE(output); return; }
    MYSQL_RES *metadata=mysql_stmt_result_metadata(stmt);
    if(!metadata) { ZVAL_FALSE(output); return; }
    unsigned count=mysql_num_fields(metadata);
    if(count>1024 || mysql_stmt_store_result(stmt)) { mysql_free_result(metadata); sql_error(NULL,stmt); ZVAL_FALSE(output); return; }
    result_init(output,metadata); native_result *result=RES(output);
    MYSQL_BIND *bind=ecalloc(count,sizeof(*bind)); unsigned long *lengths=ecalloc(count,sizeof(*lengths));
    my_bool *nulls=ecalloc(count,sizeof(*nulls)), *errors=ecalloc(count,sizeof(*errors));
    char **buffers=ecalloc(count,sizeof(*buffers));
    for(unsigned i=0;i<count;i++) { buffers[i]=emalloc(1024); bind[i].buffer_type=MYSQL_TYPE_STRING; bind[i].buffer=buffers[i]; bind[i].buffer_length=1024; bind[i].length=&lengths[i]; bind[i].is_null=&nulls[i]; bind[i].error=&errors[i]; }
    int status=mysql_stmt_bind_result(stmt,bind); size_t total=0,rows=0;
    if(!status) while((status=mysql_stmt_fetch(stmt))==0 || status==MYSQL_DATA_TRUNCATED) {
        zval record; array_init(&record); int failed=0;
        for(unsigned i=0;i<count;i++) {
            total+=nulls[i]?0:lengths[i];
            if(!result_limit(total,rows)) { failed=1; break; }
            if(nulls[i]) { add_next_index_null(&record); continue; }
            if(lengths[i]>1024) {
                char *large=emalloc(lengths[i]); MYSQL_BIND column=bind[i]; column.buffer=large; column.buffer_length=lengths[i];
                if(mysql_stmt_fetch_column(stmt,&column,i,0)) { efree(large); sql_error(NULL,stmt); failed=1; break; }
                add_next_index_stringl(&record,large,lengths[i]); efree(large);
            } else add_next_index_stringl(&record,buffers[i],lengths[i]);
        }
        if(failed) { zval_ptr_dtor(&record); status=1; break; }
        add_next_index_zval(&result->rows,&record); ++rows;
    }
    for(unsigned i=0;i<count;i++) efree(buffers[i]);
    efree(buffers); efree(errors); efree(nulls); efree(lengths); efree(bind); mysql_free_result(metadata); mysql_stmt_free_result(stmt);
    if(status!=MYSQL_NO_DATA) { if(!EG(exception)) sql_error(NULL,stmt); zval_ptr_dtor(output); ZVAL_FALSE(output); return; }
    zend_update_property_long(result_ce,Z_OBJ_P(output),"num_rows",8,rows);
}
PHP_FUNCTION(mysqli_stmt_get_result) { zval *object; ZEND_PARSE_PARAMETERS_START(1,1) Z_PARAM_OBJECT_OF_CLASS(object,statement_ce) ZEND_PARSE_PARAMETERS_END(); statement_result(object,return_value); }
PHP_METHOD(mysqli_stmt,get_result) { ZEND_PARSE_PARAMETERS_NONE(); statement_result(ZEND_THIS,return_value); }
PHP_FUNCTION(mysqli_stmt_close) { zval *object; ZEND_PARSE_PARAMETERS_START(1,1) Z_PARAM_OBJECT_OF_CLASS(object,statement_ce) ZEND_PARSE_PARAMETERS_END(); close_statement(STMT(object)); RETURN_TRUE; }
PHP_METHOD(mysqli_stmt,close) { ZEND_PARSE_PARAMETERS_NONE(); close_statement(STMT(ZEND_THIS)); RETURN_TRUE; }
PHP_FUNCTION(mysqli_close) { zval *object; ZEND_PARSE_PARAMETERS_START(1,1) Z_PARAM_OBJECT_OF_CLASS(object,connection_ce) ZEND_PARSE_PARAMETERS_END(); close_connection(CONN(object)); RETURN_TRUE; }
PHP_METHOD(mysqli,close) { ZEND_PARSE_PARAMETERS_NONE(); close_connection(CONN(ZEND_THIS)); RETURN_TRUE; }
PHP_FUNCTION(mysqli_set_charset) { zval *object; char *charset; size_t length; ZEND_PARSE_PARAMETERS_START(2,2) Z_PARAM_OBJECT_OF_CLASS(object,connection_ce) Z_PARAM_STRING(charset,length) ZEND_PARSE_PARAMETERS_END(); MYSQL *m=require_connection(object); if(!m) RETURN_THROWS(); int rc=mysql_set_character_set(m,charset); if(rc) sql_error(m,NULL); RETURN_BOOL(!rc); }
PHP_METHOD(mysqli,set_charset) { char *charset; size_t length; ZEND_PARSE_PARAMETERS_START(1,1) Z_PARAM_STRING(charset,length) ZEND_PARSE_PARAMETERS_END(); MYSQL *m=require_connection(ZEND_THIS); if(!m) RETURN_THROWS(); int rc=mysql_set_character_set(m,charset); if(rc) sql_error(m,NULL); RETURN_BOOL(!rc); }
PHP_FUNCTION(mysqli_insert_id) { zval *object; ZEND_PARSE_PARAMETERS_START(1,1) Z_PARAM_OBJECT_OF_CLASS(object,connection_ce) ZEND_PARSE_PARAMETERS_END(); if(!require_connection(object)) RETURN_THROWS(); connection_info(object); zval rv; zval *id=zend_read_property(connection_ce,Z_OBJ_P(object),"insert_id",9,0,&rv); RETURN_COPY(id); }
#define TRANSACTION_FUNCTION(name,expression) \
 PHP_FUNCTION(name) { zval *object; ZEND_PARSE_PARAMETERS_START(1,1) Z_PARAM_OBJECT_OF_CLASS(object,connection_ce) ZEND_PARSE_PARAMETERS_END(); MYSQL *m=require_connection(object); if(!m) RETURN_THROWS(); int rc=(expression); if(rc) sql_error(m,NULL); RETURN_BOOL(!rc); }
#define TRANSACTION_METHOD(name,expression) \
 PHP_METHOD(mysqli,name) { ZEND_PARSE_PARAMETERS_NONE(); MYSQL *m=require_connection(ZEND_THIS); if(!m) RETURN_THROWS(); int rc=(expression); if(rc) sql_error(m,NULL); RETURN_BOOL(!rc); }
TRANSACTION_FUNCTION(mysqli_begin_transaction,mysql_real_query(m,"START TRANSACTION",17))
TRANSACTION_FUNCTION(mysqli_commit,mysql_commit(m))
TRANSACTION_FUNCTION(mysqli_rollback,mysql_rollback(m))
TRANSACTION_METHOD(begin_transaction,mysql_real_query(m,"START TRANSACTION",17))
TRANSACTION_METHOD(commit,mysql_commit(m))
TRANSACTION_METHOD(rollback,mysql_rollback(m))

ZEND_BEGIN_ARG_INFO_EX(ai_connect,0,0,0) ZEND_ARG_INFO(0,hostname) ZEND_ARG_INFO(0,username) ZEND_ARG_INFO(0,password) ZEND_ARG_INFO(0,database) ZEND_ARG_INFO(0,port) ZEND_ARG_INFO(0,socket) ZEND_END_ARG_INFO()
ZEND_BEGIN_ARG_INFO_EX(ai_one,0,0,1) ZEND_ARG_INFO(0,value) ZEND_END_ARG_INFO()
ZEND_BEGIN_ARG_INFO_EX(ai_two,0,0,2) ZEND_ARG_INFO(0,object) ZEND_ARG_INFO(0,value) ZEND_END_ARG_INFO()
ZEND_BEGIN_ARG_INFO_EX(ai_query,0,0,2) ZEND_ARG_INFO(0,object) ZEND_ARG_INFO(0,query) ZEND_ARG_INFO(0,result_mode) ZEND_END_ARG_INFO()
ZEND_BEGIN_ARG_INFO_EX(ai_method_query,0,0,1) ZEND_ARG_INFO(0,query) ZEND_ARG_INFO(0,result_mode) ZEND_END_ARG_INFO()
ZEND_BEGIN_ARG_INFO_EX(ai_none,0,0,0) ZEND_END_ARG_INFO()
ZEND_BEGIN_ARG_INFO_EX(ai_bind,0,0,2) ZEND_ARG_INFO(0,statement) ZEND_ARG_INFO(0,types) ZEND_ARG_VARIADIC_INFO(1,vars) ZEND_END_ARG_INFO()
ZEND_BEGIN_ARG_INFO_EX(ai_method_bind,0,0,1) ZEND_ARG_INFO(0,types) ZEND_ARG_VARIADIC_INFO(1,vars) ZEND_END_ARG_INFO()
const zend_function_entry pbl_mysqli_functions[]={
 PHP_FE(mysqli_connect,ai_connect) PHP_FE(mysqli_report,ai_one) PHP_FE(mysqli_query,ai_query)
 PHP_FE(mysqli_set_charset,ai_two) PHP_FE(mysqli_begin_transaction,ai_one) PHP_FE(mysqli_commit,ai_one) PHP_FE(mysqli_rollback,ai_one)
 PHP_FE(mysqli_prepare,ai_two) PHP_FE(mysqli_stmt_bind_param,ai_bind) PHP_FE(mysqli_stmt_execute,ai_one) PHP_FE(mysqli_stmt_get_result,ai_one)
 PHP_FE(mysqli_stmt_close,ai_one) PHP_FE(mysqli_insert_id,ai_one) PHP_FE(mysqli_close,ai_one)
 PHP_FE(mysqli_fetch_assoc,ai_one) PHP_FE(mysqli_fetch_row,ai_one) PHP_FE(mysqli_free_result,ai_one) PHP_FE_END
};
static const zend_function_entry connection_methods[]={
 PHP_ME(mysqli,__construct,ai_connect,ZEND_ACC_PUBLIC) PHP_ME(mysqli,query,ai_method_query,ZEND_ACC_PUBLIC)
 PHP_ME(mysqli,prepare,ai_one,ZEND_ACC_PUBLIC) PHP_ME(mysqli,set_charset,ai_one,ZEND_ACC_PUBLIC)
 PHP_ME(mysqli,begin_transaction,ai_none,ZEND_ACC_PUBLIC) PHP_ME(mysqli,commit,ai_none,ZEND_ACC_PUBLIC)
 PHP_ME(mysqli,rollback,ai_none,ZEND_ACC_PUBLIC) PHP_ME(mysqli,close,ai_none,ZEND_ACC_PUBLIC) PHP_FE_END
};
static const zend_function_entry result_methods[]={ PHP_ME(mysqli_result,fetch_assoc,ai_none,ZEND_ACC_PUBLIC) PHP_ME(mysqli_result,fetch_row,ai_none,ZEND_ACC_PUBLIC) PHP_ME(mysqli_result,free,ai_none,ZEND_ACC_PUBLIC) PHP_FE_END };
static const zend_function_entry statement_methods[]={ PHP_ME(mysqli_stmt,bind_param,ai_method_bind,ZEND_ACC_PUBLIC) PHP_ME(mysqli_stmt,execute,ai_none,ZEND_ACC_PUBLIC) PHP_ME(mysqli_stmt,get_result,ai_none,ZEND_ACC_PUBLIC) PHP_ME(mysqli_stmt,close,ai_none,ZEND_ACC_PUBLIC) PHP_FE_END };
static const zend_function_entry exception_methods[]={ PHP_ME(mysqli_sql_exception,getSqlState,ai_none,ZEND_ACC_PUBLIC) PHP_FE_END };
int pbl_mysqli_register(void)
{
    zend_class_entry entry;
    INIT_CLASS_ENTRY(entry,"mysqli",connection_methods); connection_ce=zend_register_internal_class(&entry); connection_ce->create_object=new_connection;
    INIT_CLASS_ENTRY(entry,"mysqli_result",result_methods); result_ce=zend_register_internal_class(&entry); result_ce->create_object=new_result;
    INIT_CLASS_ENTRY(entry,"mysqli_stmt",statement_methods); statement_ce=zend_register_internal_class(&entry); statement_ce->create_object=new_statement;
    INIT_CLASS_ENTRY(entry,"mysqli_sql_exception",exception_methods); sql_exception_ce=zend_register_internal_class_ex(&entry,zend_ce_exception);
    zend_declare_property_string(sql_exception_ce,"sqlstate",8,"HY000",ZEND_ACC_PROTECTED);
    memcpy(&connection_handlers,zend_get_std_object_handlers(),sizeof(connection_handlers)); connection_handlers.offset=XtOffsetOf(native_connection,std); connection_handlers.free_obj=free_connection; connection_handlers.clone_obj=NULL;
    memcpy(&result_handlers,zend_get_std_object_handlers(),sizeof(result_handlers)); result_handlers.offset=XtOffsetOf(native_result,std); result_handlers.free_obj=free_result; result_handlers.clone_obj=NULL;
    memcpy(&statement_handlers,zend_get_std_object_handlers(),sizeof(statement_handlers)); statement_handlers.offset=XtOffsetOf(native_statement,std); statement_handlers.free_obj=free_statement; statement_handlers.clone_obj=NULL;
    const char *properties[]={"errno","insert_id","affected_rows","connect_errno"};
    for(unsigned i=0;i<4;i++) zend_declare_property_long(connection_ce,properties[i],strlen(properties[i]),0,ZEND_ACC_PUBLIC);
    zend_declare_property_string(connection_ce,"error",5,"",ZEND_ACC_PUBLIC); zend_declare_property_null(connection_ce,"connect_error",13,ZEND_ACC_PUBLIC);
    zend_declare_property_long(result_ce,"num_rows",8,0,ZEND_ACC_PUBLIC); zend_declare_property_long(result_ce,"field_count",11,0,ZEND_ACC_PUBLIC);
    return SUCCESS;
}
