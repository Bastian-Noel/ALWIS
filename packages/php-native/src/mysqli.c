/* Native MySQLi subset over the SAME embedded C connection registry as PDO.
 * Implements the school fixture including by-reference prepared parameters.
 * No PHP shim, SQL JSON protocol or remote SQL socket is used.
 */
#include <php.h>
#include <Zend/zend_exceptions.h>
#include <Zend/zend_gc.h>
#include <Zend/zend_interfaces.h>
#include <ext/spl/spl_exceptions.h>
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
typedef struct { zval rows, fields, metadata; zend_ulong position, field_position; zend_object std; } native_result;
struct native_statement { MYSQL_STMT *stmt; zval connection, result; zval *outputs; size_t output_count; zval *parameters; char *types; size_t count; native_statement *next; zend_object std; };
#define CONN(v) ((native_connection *)((char *)Z_OBJ_P(v)-XtOffsetOf(native_connection,std)))
#define RES(v) ((native_result *)((char *)Z_OBJ_P(v)-XtOffsetOf(native_result,std)))
#define STMT(v) ((native_statement *)((char *)Z_OBJ_P(v)-XtOffsetOf(native_statement,std)))

static void unsigned_value(my_ulonglong value,zval *output) {
 if(value<=ZEND_LONG_MAX)ZVAL_LONG(output,(zend_long)value);
 else{char text[32];snprintf(text,sizeof(text),"%llu",(unsigned long long)value);ZVAL_STRING(output,text);}
}
static void sql_error(MYSQL *mysql, MYSQL_STMT *stmt)
{
    const char *message = stmt ? mysql_stmt_error(stmt) : mysql ? mysql_error(mysql) : pbl_mysql_last_error();
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
    zval affected_value;if(affected==(my_ulonglong)-1)ZVAL_LONG(&affected_value,-1);else unsigned_value(affected,&affected_value);zend_update_property(connection_ce,Z_OBJ_P(object),"affected_rows",13,&affected_value);zval_ptr_dtor(&affected_value);
}
static void close_connection(native_connection *connection)
{
    for (native_statement *stmt=connection->statements;stmt;stmt=stmt->next) {
        if (stmt->stmt) { pbl_stmt_close(stmt->stmt); stmt->stmt=NULL; }
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
    ZVAL_UNDEF(&object->rows); ZVAL_UNDEF(&object->fields); ZVAL_UNDEF(&object->metadata);
    object->std.handlers=&result_handlers; return &object->std;
}
static void clear_result(native_result *object)
{
    zval_ptr_dtor(&object->rows); zval_ptr_dtor(&object->fields); zval_ptr_dtor(&object->metadata);
    ZVAL_UNDEF(&object->rows); ZVAL_UNDEF(&object->fields); ZVAL_UNDEF(&object->metadata);
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
    ZVAL_UNDEF(&object->connection); ZVAL_UNDEF(&object->result); object->std.handlers=&statement_handlers; return &object->std;
}
static void clear_parameters(native_statement *object)
{
    for(size_t i=0;i<object->count;i++) zval_ptr_dtor(&object->parameters[i]);
    if(object->parameters) efree(object->parameters);
    if(object->types) efree(object->types);
    object->parameters=NULL; object->types=NULL; object->count=0;
}
static void clear_statement_values(native_statement *object)
{
    clear_parameters(object);
    for(size_t i=0;i<object->output_count;i++) zval_ptr_dtor(&object->outputs[i]);
    if(object->outputs) efree(object->outputs);
    object->outputs=NULL; object->output_count=0;
    zval_ptr_dtor(&object->result); ZVAL_UNDEF(&object->result);
}
static void close_statement(native_statement *object)
{
    if(object->stmt) { pbl_stmt_close(object->stmt); object->stmt=NULL; }
    clear_statement_values(object);
}
static HashTable *statement_gc(zend_object *std,zval **table,int *count)
{
    native_statement *object=(native_statement *)((char *)std-XtOffsetOf(native_statement,std));
    zend_get_gc_buffer *buffer=zend_get_gc_buffer_create();
    zend_get_gc_buffer_add_zval(buffer,&object->connection); zend_get_gc_buffer_add_zval(buffer,&object->result);
    for(size_t i=0;i<object->count;i++) zend_get_gc_buffer_add_zval(buffer,&object->parameters[i]);
    for(size_t i=0;i<object->output_count;i++) zend_get_gc_buffer_add_zval(buffer,&object->outputs[i]);
    zend_get_gc_buffer_use(buffer,table,count); return zend_std_get_properties(std);
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
    zend_update_property_string(connection_ce,Z_OBJ_P(object),"server_info",11,mysql_get_server_info(connection->mysql));
    zend_update_property_long(connection_ce,Z_OBJ_P(object),"server_version",14,mysql_get_server_version(connection->mysql));
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
PHP_METHOD(mysqli,__construct) { PARSE_CONNECT(); if(ZEND_NUM_ARGS()) connect_object(ZEND_THIS,host,user,password,database); }
PHP_FUNCTION(mysqli_report) { zend_long mode; ZEND_PARSE_PARAMETERS_START(1,1) Z_PARAM_LONG(mode) ZEND_PARSE_PARAMETERS_END(); report_mode=mode; RETURN_TRUE; }
PHP_METHOD(mysqli_sql_exception,getSqlState) { ZEND_PARSE_PARAMETERS_NONE(); zval rv; zval *v=zend_read_property(sql_exception_ce,Z_OBJ_P(ZEND_THIS),"sqlstate",8,0,&rv); RETURN_COPY(v); }

static void result_init(zval *value,MYSQL_RES *metadata)
{
    object_init_ex(value,result_ce); native_result *result=RES(value);
    array_init(&result->rows); array_init(&result->fields); array_init(&result->metadata);
    MYSQL_FIELD *fields=mysql_fetch_fields(metadata);
    for(unsigned i=0;i<mysql_num_fields(metadata);i++) {
        MYSQL_FIELD *f=&fields[i]; zval info; array_init(&info);
        add_next_index_string(&result->fields,f->name);
        add_assoc_string(&info,"name",f->name?f->name:""); add_assoc_string(&info,"orgname",f->org_name?f->org_name:"");
        add_assoc_string(&info,"table",f->table?f->table:""); add_assoc_string(&info,"orgtable",f->org_table?f->org_table:"");
        add_assoc_string(&info,"db",f->db?f->db:""); add_assoc_string(&info,"catalog",f->catalog?f->catalog:"def");
        add_assoc_string(&info,"def",f->def?f->def:""); add_assoc_long(&info,"length",f->length);
        add_assoc_long(&info,"max_length",f->max_length); add_assoc_long(&info,"charsetnr",f->charsetnr);
        add_assoc_long(&info,"flags",f->flags); add_assoc_long(&info,"type",f->type); add_assoc_long(&info,"decimals",f->decimals);
        add_next_index_zval(&result->metadata,&info);
    }
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
    if(pbl_mysql_query(mysql,sql,length)) { connection_info(object); sql_error(mysql,NULL); ZVAL_FALSE(result); return; }
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
    if(!assoc || assoc==2) { ZVAL_COPY(output,row); return; }
    array_init(output); zval *cell; zend_ulong index=0;
    ZEND_HASH_FOREACH_VAL(Z_ARRVAL_P(row),cell) {
        zval *field=zend_hash_index_find(Z_ARRVAL(result->fields),index++); zval copy; ZVAL_COPY(&copy,cell);
        zend_hash_update(Z_ARRVAL_P(output),Z_STR_P(field),&copy);
        if(assoc==3) { ZVAL_COPY(&copy,cell); add_next_index_zval(output,&copy); }
    } ZEND_HASH_FOREACH_END();
}
PHP_FUNCTION(mysqli_fetch_assoc) { zval *object; ZEND_PARSE_PARAMETERS_START(1,1) Z_PARAM_OBJECT_OF_CLASS(object,result_ce) ZEND_PARSE_PARAMETERS_END(); fetch_result(object,return_value,1); }
PHP_FUNCTION(mysqli_fetch_row) { zval *object; ZEND_PARSE_PARAMETERS_START(1,1) Z_PARAM_OBJECT_OF_CLASS(object,result_ce) ZEND_PARSE_PARAMETERS_END(); fetch_result(object,return_value,0); }
PHP_METHOD(mysqli_result,fetch_assoc) { ZEND_PARSE_PARAMETERS_NONE(); fetch_result(ZEND_THIS,return_value,1); }
PHP_METHOD(mysqli_result,fetch_row) { ZEND_PARSE_PARAMETERS_NONE(); fetch_result(ZEND_THIS,return_value,0); }
static void fetch_object(zval *result,zend_class_entry *ce,HashTable *arguments,zval *output)
{
    if(!ce)ce=zend_standard_class_def;
    if(ce->ce_flags&(ZEND_ACC_INTERFACE|ZEND_ACC_TRAIT|ZEND_ACC_IMPLICIT_ABSTRACT_CLASS|ZEND_ACC_EXPLICIT_ABSTRACT_CLASS)) {
        zend_throw_error(NULL,"Class %s cannot be instantiated",ZSTR_VAL(ce->name)); return;
    }
    zval row; fetch_result(result,&row,1);
    if(Z_TYPE(row)!=IS_ARRAY) { ZVAL_COPY_VALUE(output,&row); return; }
    if(object_init_ex(output,ce)==FAILURE) { zval_ptr_dtor(&row); return; }
    /* Match PHP's mysqli hydration order: properties before constructor. */
    HashTable *properties=zend_symtable_to_proptable(Z_ARR(row));zval_ptr_dtor(&row);
    if(!ce->default_properties_count&&!ce->__set)Z_OBJ_P(output)->properties=properties;
    else {zend_merge_properties(output,properties);zend_array_release(properties);}
    if(EG(exception))return;
    if(ce->constructor)zend_call_known_function(ce->constructor,Z_OBJ_P(output),ce,NULL,0,NULL,arguments);
    else if(arguments&&zend_hash_num_elements(arguments))zend_value_error("Constructor arguments must be empty when the class has no constructor");
}
PHP_FUNCTION(mysqli_fetch_object) {zval *result;zend_class_entry *ce=NULL;HashTable *arguments=NULL;ZEND_PARSE_PARAMETERS_START(1,3) Z_PARAM_OBJECT_OF_CLASS(result,result_ce) Z_PARAM_OPTIONAL Z_PARAM_CLASS(ce) Z_PARAM_ARRAY_HT(arguments) ZEND_PARSE_PARAMETERS_END();fetch_object(result,ce,arguments,return_value);}
PHP_METHOD(mysqli_result,fetch_object) {zend_class_entry *ce=NULL;HashTable *arguments=NULL;ZEND_PARSE_PARAMETERS_START(0,2) Z_PARAM_OPTIONAL Z_PARAM_CLASS(ce) Z_PARAM_ARRAY_HT(arguments) ZEND_PARSE_PARAMETERS_END();fetch_object(ZEND_THIS,ce,arguments,return_value);}
PHP_FUNCTION(mysqli_free_result) { zval *object; ZEND_PARSE_PARAMETERS_START(1,1) Z_PARAM_OBJECT_OF_CLASS(object,result_ce) ZEND_PARSE_PARAMETERS_END(); clear_result(RES(object)); }
PHP_METHOD(mysqli_result,free) { ZEND_PARSE_PARAMETERS_NONE(); clear_result(RES(ZEND_THIS)); }

static int initialize_statement(zval *connection,zval *output,int create_object)
{
    MYSQL *mysql=require_connection(connection); if(!mysql)return 0;
    if(!create_object&&!Z_ISUNDEF(STMT(output)->connection)){zend_throw_error(NULL,"mysqli_stmt is already initialized");return 0;}
    MYSQL_STMT *stmt=pbl_stmt_init(mysql);
    if(!stmt){sql_error(mysql,NULL);return 0;}
    if(create_object)object_init_ex(output,statement_ce);
    native_statement *object=STMT(output);object->stmt=stmt;
    ZVAL_COPY(&object->connection,connection); object->next=CONN(connection)->statements; CONN(connection)->statements=object;
    return 1;
}
static int prepare_statement(zval *object,const char *sql,size_t length)
{
    MYSQL_STMT *stmt=require_statement(object);if(!stmt)return 0;
    if(length>SQL_BYTES){zend_value_error("SQL exceeds native request byte limit");return 0;}
    clear_statement_values(STMT(object));
    int failed=pbl_stmt_prepare(stmt,sql,length);
    zend_update_property_long(statement_ce,Z_OBJ_P(object),"param_count",11,mysql_stmt_param_count(stmt));
    zend_update_property_long(statement_ce,Z_OBJ_P(object),"field_count",11,mysql_stmt_field_count(stmt));
    zend_update_property_long(statement_ce,Z_OBJ_P(object),"num_rows",8,0);
    zend_update_property_long(statement_ce,Z_OBJ_P(object),"errno",5,mysql_stmt_errno(stmt));
    zend_update_property_string(statement_ce,Z_OBJ_P(object),"error",5,mysql_stmt_error(stmt));
    zend_update_property_string(statement_ce,Z_OBJ_P(object),"sqlstate",8,mysql_stmt_sqlstate(stmt));
    if(failed)sql_error(NULL,stmt);
    return !failed;
}
static void release_temporary_statement(zval *statement)
{
    native_statement *data=STMT(statement);MYSQL *mysql=CONN(&data->connection)->mysql;
    MYSQL_STMT *stmt=data->stmt;
    my_ulonglong affected=mysql_stmt_affected_rows(stmt),id=mysql_stmt_insert_id(stmt);
    unsigned code=mysql_stmt_errno(stmt),fields=mysql_stmt_field_count(stmt);
    char message[MYSQL_ERRMSG_SIZE],state[SQLSTATE_LENGTH+1];
    snprintf(message,sizeof(message),"%s",mysql_stmt_error(stmt));
    snprintf(state,sizeof(state),"%s",mysql_stmt_sqlstate(stmt));
    zval connection;ZVAL_COPY(&connection,&data->connection);
    zval_ptr_dtor(statement);
    /* The pinned external client clears connection status when closing a stmt.
     * mysqlnd's execute_query preserves it; copy the final stmt status explicitly. */
    if(mysql){mysql->affected_rows=affected;mysql->insert_id=id;mysql->field_count=fields;
        mysql->net.last_errno=code;memcpy(mysql->net.last_error,message,strlen(message)+1);memcpy(mysql->net.sqlstate,state,sizeof(state));
        connection_info(&connection);}
    zval_ptr_dtor(&connection);
}
static void prepare_object(zval *connection,const char *sql,size_t length,zval *output)
{
    if(!initialize_statement(connection,output,1)){ZVAL_FALSE(output);return;}
    if(!prepare_statement(output,sql,length)){release_temporary_statement(output);ZVAL_FALSE(output);}
}
PHP_FUNCTION(mysqli_stmt_init) {zval *connection;ZEND_PARSE_PARAMETERS_START(1,1) Z_PARAM_OBJECT_OF_CLASS(connection,connection_ce) ZEND_PARSE_PARAMETERS_END();if(!initialize_statement(connection,return_value,1))RETURN_FALSE;}
PHP_METHOD(mysqli,stmt_init) {ZEND_PARSE_PARAMETERS_NONE();if(!initialize_statement(ZEND_THIS,return_value,1))RETURN_FALSE;}
PHP_FUNCTION(mysqli_stmt_prepare) {zval *object;char *sql;size_t length;ZEND_PARSE_PARAMETERS_START(2,2) Z_PARAM_OBJECT_OF_CLASS(object,statement_ce) Z_PARAM_STRING(sql,length) ZEND_PARSE_PARAMETERS_END();RETURN_BOOL(prepare_statement(object,sql,length));}
PHP_METHOD(mysqli_stmt,prepare) {char *sql;size_t length;ZEND_PARSE_PARAMETERS_START(1,1) Z_PARAM_STRING(sql,length) ZEND_PARSE_PARAMETERS_END();RETURN_BOOL(prepare_statement(ZEND_THIS,sql,length));}
PHP_METHOD(mysqli_stmt,__construct) {zval *connection;char *sql=NULL;size_t length=0;ZEND_PARSE_PARAMETERS_START(1,2) Z_PARAM_OBJECT_OF_CLASS(connection,connection_ce) Z_PARAM_OPTIONAL Z_PARAM_STRING_OR_NULL(sql,length) ZEND_PARSE_PARAMETERS_END();if(initialize_statement(connection,ZEND_THIS,0)&&sql)prepare_statement(ZEND_THIS,sql,length);}
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
    zval_ptr_dtor(&data->result); ZVAL_UNDEF(&data->result);
    if(count!=mysql_stmt_param_count(stmt)) { zend_argument_count_error("Bind SQL parameters before execution"); return 0; }
    MYSQL_BIND *bind=ecalloc(count?count:1,sizeof(*bind));
    my_bool *nulls=ecalloc(count?count:1,sizeof(*nulls)); unsigned long *lengths=ecalloc(count?count:1,sizeof(*lengths));
    long long *integers=ecalloc(count?count:1,sizeof(*integers)); double *numbers=ecalloc(count?count:1,sizeof(*numbers));
    zend_string **strings=ecalloc(count?count:1,sizeof(*strings));
    int conversion_failed=0;
    for(size_t i=0;i<count;i++) {
        zval *value=&data->parameters[i]; ZVAL_DEREF(value);
        bind[i].is_null=&nulls[i]; bind[i].length=&lengths[i];
        if(Z_TYPE_P(value)==IS_NULL) { nulls[i]=1; bind[i].buffer_type=MYSQL_TYPE_NULL; }
        else if(data->types[i]=='i') { integers[i]=zval_get_long(value); bind[i].buffer_type=MYSQL_TYPE_LONGLONG; bind[i].buffer=&integers[i]; }
        else if(data->types[i]=='d') { numbers[i]=zval_get_double(value); bind[i].buffer_type=MYSQL_TYPE_DOUBLE; bind[i].buffer=&numbers[i]; }
        else { strings[i]=zval_get_string(value); if(EG(exception)){conversion_failed=1;break;} lengths[i]=ZSTR_LEN(strings[i]); bind[i].buffer_type=data->types[i]=='b'?MYSQL_TYPE_BLOB:MYSQL_TYPE_STRING; bind[i].buffer=ZSTR_VAL(strings[i]); bind[i].buffer_length=lengths[i]; }
    }
    int status=conversion_failed || (count && mysql_stmt_bind_param(stmt,bind)) || mysql_stmt_execute(stmt);
    for(size_t i=0;i<count;i++) if(strings[i]) zend_string_release(strings[i]);
    efree(strings); efree(numbers); efree(integers); efree(lengths); efree(nulls); efree(bind);
    connection_info(&data->connection);
    if(status && !EG(exception)) sql_error(NULL,stmt);
    return !status;
}
static int execute_values(zval *object,zval *values)
{
    MYSQL_STMT *stmt=require_statement(object); if(!stmt) return 0;
    if(values) {
        if(!zend_array_is_list(Z_ARRVAL_P(values))) { zend_value_error("Parameters must be a list"); return 0; }
        size_t count=zend_hash_num_elements(Z_ARRVAL_P(values));
        if(count!=mysql_stmt_param_count(stmt)) { zend_argument_count_error("Parameter count must match SQL placeholders"); return 0; }
        native_statement *data=STMT(object); clear_parameters(data);
        data->count=count; data->types=emalloc(count+1); memset(data->types,'s',count); data->types[count]=0;
        data->parameters=ecalloc(count?count:1,sizeof(zval));
        zval *value; size_t i=0;
        ZEND_HASH_FOREACH_VAL(Z_ARRVAL_P(values),value) { ZVAL_DEREF(value); ZVAL_COPY(&data->parameters[i++],value); } ZEND_HASH_FOREACH_END();
    }
    int ok=execute_statement(object);
    native_statement *data=STMT(object);
    if(ok) {
        my_ulonglong affected=mysql_stmt_affected_rows(stmt), id=mysql_stmt_insert_id(stmt);
        zend_update_property_long(statement_ce,Z_OBJ_P(object),"affected_rows",13,affected==(my_ulonglong)-1?-1:(zend_long)affected);
        if(id<=ZEND_LONG_MAX) zend_update_property_long(statement_ce,Z_OBJ_P(object),"insert_id",9,id);
        else { char text[32]; snprintf(text,sizeof(text),"%llu",(unsigned long long)id); zend_update_property_string(statement_ce,Z_OBJ_P(object),"insert_id",9,text); }
        zend_update_property_long(statement_ce,Z_OBJ_P(object),"num_rows",8,0);
    }
    zend_update_property_long(statement_ce,Z_OBJ_P(object),"errno",5,mysql_stmt_errno(stmt));
    zend_update_property_string(statement_ce,Z_OBJ_P(object),"error",5,mysql_stmt_error(stmt));
    zend_update_property_string(statement_ce,Z_OBJ_P(object),"sqlstate",8,mysql_stmt_sqlstate(stmt));
    return ok;
}
PHP_FUNCTION(mysqli_stmt_execute) { zval *object,*values=NULL; ZEND_PARSE_PARAMETERS_START(1,2) Z_PARAM_OBJECT_OF_CLASS(object,statement_ce) Z_PARAM_OPTIONAL Z_PARAM_ARRAY_OR_NULL(values) ZEND_PARSE_PARAMETERS_END(); RETURN_BOOL(execute_values(object,values)); }
PHP_METHOD(mysqli_stmt,execute) { zval *values=NULL; ZEND_PARSE_PARAMETERS_START(0,1) Z_PARAM_OPTIONAL Z_PARAM_ARRAY_OR_NULL(values) ZEND_PARSE_PARAMETERS_END(); RETURN_BOOL(execute_values(ZEND_THIS,values)); }

static void prepared_cell(zval *record,const char *bytes,size_t length,enum enum_field_types type)
{
    zend_long number; double real;
    switch(type) {
      case MYSQL_TYPE_TINY: case MYSQL_TYPE_SHORT: case MYSQL_TYPE_LONG: case MYSQL_TYPE_INT24: case MYSQL_TYPE_LONGLONG: case MYSQL_TYPE_YEAR:
        if(is_numeric_string(bytes,length,&number,&real,0)==IS_LONG) { add_next_index_long(record,number); return; } break;
      case MYSQL_TYPE_FLOAT: case MYSQL_TYPE_DOUBLE:
        if(is_numeric_string(bytes,length,&number,&real,0)==IS_DOUBLE) { add_next_index_double(record,real); return; }
        if(is_numeric_string(bytes,length,&number,&real,0)==IS_LONG) { add_next_index_double(record,(double)number); return; } break;
      default: break;
    }
    add_next_index_stringl(record,bytes,length);
}
static void statement_result(zval *object,zval *output)
{
    MYSQL_STMT *stmt=require_statement(object); if(!stmt) { ZVAL_FALSE(output); return; }
    native_statement *data=STMT(object);
    if(!Z_ISUNDEF(data->result)) { ZVAL_COPY(output,&data->result); return; }
    MYSQL_RES *metadata=mysql_stmt_result_metadata(stmt);
    if(!metadata) { ZVAL_FALSE(output); return; }
    unsigned count=mysql_num_fields(metadata);
    if(count>1024 || mysql_stmt_store_result(stmt)) { mysql_free_result(metadata); sql_error(NULL,stmt); ZVAL_FALSE(output); return; }
    result_init(output,metadata); native_result *result=RES(output);
    MYSQL_BIND *bind=ecalloc(count,sizeof(*bind)); unsigned long *lengths=ecalloc(count,sizeof(*lengths));
    my_bool *nulls=ecalloc(count,sizeof(*nulls)), *errors=ecalloc(count,sizeof(*errors));
    char **buffers=ecalloc(count,sizeof(*buffers));
    for(unsigned i=0;i<count;i++) { buffers[i]=emalloc(1024); bind[i].buffer_type=MYSQL_TYPE_STRING; bind[i].buffer=buffers[i]; bind[i].buffer_length=1024; bind[i].length=&lengths[i]; bind[i].is_null=&nulls[i]; bind[i].error=&errors[i]; }
    MYSQL_FIELD *fields=mysql_fetch_fields(metadata);
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
                prepared_cell(&record,large,lengths[i],fields[i].type); efree(large);
            } else prepared_cell(&record,buffers[i],lengths[i],fields[i].type);
        }
        if(failed) { zval_ptr_dtor(&record); status=1; break; }
        add_next_index_zval(&result->rows,&record); ++rows;
    }
    for(unsigned i=0;i<count;i++) efree(buffers[i]);
    efree(buffers); efree(errors); efree(nulls); efree(lengths); efree(bind); mysql_free_result(metadata); mysql_stmt_free_result(stmt);
    if(status!=MYSQL_NO_DATA) { if(!EG(exception)) sql_error(NULL,stmt); zval_ptr_dtor(output); ZVAL_FALSE(output); return; }
    zend_update_property_long(result_ce,Z_OBJ_P(output),"num_rows",8,rows);
    zend_update_property_long(statement_ce,Z_OBJ_P(object),"num_rows",8,rows);
    ZVAL_COPY(&data->result,output);
}
PHP_FUNCTION(mysqli_stmt_get_result) { zval *object; ZEND_PARSE_PARAMETERS_START(1,1) Z_PARAM_OBJECT_OF_CLASS(object,statement_ce) ZEND_PARSE_PARAMETERS_END(); statement_result(object,return_value); }
PHP_METHOD(mysqli_stmt,get_result) { ZEND_PARSE_PARAMETERS_NONE(); statement_result(ZEND_THIS,return_value); }
static void execute_query(zval *connection,const char *sql,size_t length,zval *values,zval *output)
{
    zval statement;
    if(!initialize_statement(connection,&statement,1)){ZVAL_FALSE(output);return;}
    if(!prepare_statement(&statement,sql,length)||!execute_values(&statement,values))ZVAL_FALSE(output);
    else if(mysql_stmt_field_count(STMT(&statement)->stmt))statement_result(&statement,output);
    else ZVAL_TRUE(output);
    release_temporary_statement(&statement);
}
PHP_FUNCTION(mysqli_execute_query) {zval *connection,*values=NULL;char *sql;size_t length;ZEND_PARSE_PARAMETERS_START(2,3) Z_PARAM_OBJECT_OF_CLASS(connection,connection_ce) Z_PARAM_STRING(sql,length) Z_PARAM_OPTIONAL Z_PARAM_ARRAY_OR_NULL(values) ZEND_PARSE_PARAMETERS_END();execute_query(connection,sql,length,values,return_value);}
PHP_METHOD(mysqli,execute_query) {zval *values=NULL;char *sql;size_t length;ZEND_PARSE_PARAMETERS_START(1,2) Z_PARAM_STRING(sql,length) Z_PARAM_OPTIONAL Z_PARAM_ARRAY_OR_NULL(values) ZEND_PARSE_PARAMETERS_END();execute_query(ZEND_THIS,sql,length,values,return_value);}
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
TRANSACTION_FUNCTION(mysqli_begin_transaction,pbl_mysql_query(m,"START TRANSACTION",17))
TRANSACTION_FUNCTION(mysqli_commit,mysql_commit(m))
TRANSACTION_FUNCTION(mysqli_rollback,mysql_rollback(m))
TRANSACTION_METHOD(begin_transaction,pbl_mysql_query(m,"START TRANSACTION",17))
TRANSACTION_METHOD(commit,mysql_commit(m))
TRANSACTION_METHOD(rollback,mysql_rollback(m))

/* Identifiers are quoted, including embedded backticks; never interpolate a
 * savepoint name as SQL syntax. Keep the statement within the shared budget. */
static int savepoint_command(zval *object,zend_string *name,int release)
{
    MYSQL *mysql=require_connection(object); if(!mysql) return 0;
    size_t length=ZSTR_LEN(name);
    if(!length || memchr(ZSTR_VAL(name),'\0',length)) {
        zend_value_error("Savepoint name must be non-empty and contain no null bytes"); return 0;
    }
    const char *prefix=release?"RELEASE SAVEPOINT `":"SAVEPOINT `";
    size_t prefix_length=strlen(prefix);
    if(length>(SQL_BYTES-prefix_length-1)/2) {
        zend_value_error("Savepoint name exceeds native request byte limit"); return 0;
    }
    zend_string *sql=zend_string_alloc(prefix_length+length*2+1,0);
    char *out=ZSTR_VAL(sql);memcpy(out,prefix,prefix_length);out+=prefix_length;
    for(size_t i=0;i<length;i++) { if(ZSTR_VAL(name)[i]=='`') *out++='`'; *out++=ZSTR_VAL(name)[i]; }
    *out++='`';*out='\0';
    int rc=pbl_mysql_query(mysql,ZSTR_VAL(sql),out-ZSTR_VAL(sql));
    zend_string_release(sql);connection_info(object);
    if(rc)sql_error(mysql,NULL);
    return !rc;
}
#define SAVEPOINT_FUNCTION(func,release) \
 PHP_FUNCTION(func) { zval *object;zend_string *name;ZEND_PARSE_PARAMETERS_START(2,2) Z_PARAM_OBJECT_OF_CLASS(object,connection_ce) Z_PARAM_STR(name) ZEND_PARSE_PARAMETERS_END();RETURN_BOOL(savepoint_command(object,name,release)); }
#define SAVEPOINT_METHOD(method,release) \
 PHP_METHOD(mysqli,method) { zend_string *name;ZEND_PARSE_PARAMETERS_START(1,1) Z_PARAM_STR(name) ZEND_PARSE_PARAMETERS_END();RETURN_BOOL(savepoint_command(ZEND_THIS,name,release)); }
SAVEPOINT_FUNCTION(mysqli_savepoint,0)
SAVEPOINT_FUNCTION(mysqli_release_savepoint,1)
SAVEPOINT_METHOD(savepoint,0)
SAVEPOINT_METHOD(release_savepoint,1)


static int bind_outputs(zval *object,zval *values,int count)
{
    MYSQL_STMT *stmt=require_statement(object); if(!stmt) return 0;
    if((unsigned)count!=mysql_stmt_field_count(stmt)) { zend_argument_count_error("Result variable count must match SQL column count"); return 0; }
    native_statement *data=STMT(object);
    for(size_t i=0;i<data->output_count;i++) zval_ptr_dtor(&data->outputs[i]);
    if(data->outputs) efree(data->outputs);
    data->output_count=count; data->outputs=ecalloc(count?count:1,sizeof(zval));
    for(int i=0;i<count;i++) ZVAL_COPY(&data->outputs[i],&values[i]);
    return 1;
}
static void statement_fetch(zval *object,zval *output)
{
    native_statement *data=STMT(object); zval result;
    statement_result(object,&result);
    if(Z_TYPE(result)!=IS_OBJECT) { zval_ptr_dtor(&result); ZVAL_FALSE(output); return; }
    native_result *rows=RES(&result);
    if(Z_ISUNDEF(rows->rows)) { zval_ptr_dtor(&result); zend_throw_error(NULL,"mysqli_result is closed"); ZVAL_FALSE(output); return; }
    zval *row=zend_hash_index_find(Z_ARRVAL(rows->rows),rows->position++);
    if(!row) { zval_ptr_dtor(&result); ZVAL_NULL(output); return; }
    if(data->output_count!=zend_hash_num_elements(Z_ARRVAL_P(row))) { zval_ptr_dtor(&result); zend_throw_error(NULL,"Bind output variables before fetch"); ZVAL_FALSE(output); return; }
    for(size_t i=0;i<data->output_count;i++) {
        zval *target=&data->outputs[i]; ZVAL_DEREF(target); zval_ptr_dtor(target);
        ZVAL_COPY(target,zend_hash_index_find(Z_ARRVAL_P(row),i));
    }
    zval_ptr_dtor(&result); ZVAL_TRUE(output);
}
PHP_FUNCTION(mysqli_stmt_bind_result) { zval *object,*values; int count; ZEND_PARSE_PARAMETERS_START(2,-1) Z_PARAM_OBJECT_OF_CLASS(object,statement_ce) Z_PARAM_VARIADIC('+',values,count) ZEND_PARSE_PARAMETERS_END(); RETURN_BOOL(bind_outputs(object,values,count)); }
PHP_METHOD(mysqli_stmt,bind_result) { zval *values; int count; ZEND_PARSE_PARAMETERS_START(1,-1) Z_PARAM_VARIADIC('+',values,count) ZEND_PARSE_PARAMETERS_END(); RETURN_BOOL(bind_outputs(ZEND_THIS,values,count)); }
PHP_FUNCTION(mysqli_stmt_fetch) { zval *object; ZEND_PARSE_PARAMETERS_START(1,1) Z_PARAM_OBJECT_OF_CLASS(object,statement_ce) ZEND_PARSE_PARAMETERS_END(); statement_fetch(object,return_value); }
PHP_METHOD(mysqli_stmt,fetch) { ZEND_PARSE_PARAMETERS_NONE(); statement_fetch(ZEND_THIS,return_value); }
PHP_FUNCTION(mysqli_stmt_store_result) { zval *object,result; ZEND_PARSE_PARAMETERS_START(1,1) Z_PARAM_OBJECT_OF_CLASS(object,statement_ce) ZEND_PARSE_PARAMETERS_END(); statement_result(object,&result); int ok=Z_TYPE(result)==IS_OBJECT; zval_ptr_dtor(&result); RETURN_BOOL(ok); }
PHP_METHOD(mysqli_stmt,store_result) { zval result; ZEND_PARSE_PARAMETERS_NONE(); statement_result(ZEND_THIS,&result); int ok=Z_TYPE(result)==IS_OBJECT; zval_ptr_dtor(&result); RETURN_BOOL(ok); }
static void all_rows(zval *object,zend_long mode,zval *output)
{
    if(mode<1 || mode>3) { zend_value_error("Invalid result mode"); ZVAL_FALSE(output); return; }
    array_init(output); native_result *data=RES(object);
    if(Z_ISUNDEF(data->rows)) { zend_throw_error(NULL,"mysqli_result is closed"); return; }
    while(data->position<zend_hash_num_elements(Z_ARRVAL(data->rows))) { zval row; fetch_result(object,&row,(int)mode); add_next_index_zval(output,&row); }
}
PHP_FUNCTION(mysqli_fetch_all) { zval *object; zend_long mode=2; ZEND_PARSE_PARAMETERS_START(1,2) Z_PARAM_OBJECT_OF_CLASS(object,result_ce) Z_PARAM_OPTIONAL Z_PARAM_LONG(mode) ZEND_PARSE_PARAMETERS_END(); all_rows(object,mode,return_value); }
PHP_METHOD(mysqli_result,fetch_all) { zend_long mode=2; ZEND_PARSE_PARAMETERS_START(0,1) Z_PARAM_OPTIONAL Z_PARAM_LONG(mode) ZEND_PARSE_PARAMETERS_END(); all_rows(ZEND_THIS,mode,return_value); }
PHP_FUNCTION(mysqli_fetch_array) { zval *object; zend_long mode=3; ZEND_PARSE_PARAMETERS_START(1,2) Z_PARAM_OBJECT_OF_CLASS(object,result_ce) Z_PARAM_OPTIONAL Z_PARAM_LONG(mode) ZEND_PARSE_PARAMETERS_END(); if(mode<1||mode>3){zend_value_error("Invalid result mode");RETURN_THROWS();} fetch_result(object,return_value,mode); }
PHP_METHOD(mysqli_result,fetch_array) { zend_long mode=3; ZEND_PARSE_PARAMETERS_START(0,1) Z_PARAM_OPTIONAL Z_PARAM_LONG(mode) ZEND_PARSE_PARAMETERS_END(); if(mode<1||mode>3){zend_value_error("Invalid result mode");RETURN_THROWS();} fetch_result(ZEND_THIS,return_value,mode); }
static int seek_result(zval *object,zend_long offset)
{
    native_result *data=RES(object);
    if(Z_ISUNDEF(data->rows)) { zend_throw_error(NULL,"mysqli_result is closed"); return 0; }
    if(offset<0 || (zend_ulong)offset>=zend_hash_num_elements(Z_ARRVAL(data->rows))) return 0;
    data->position=offset; return 1;
}
PHP_FUNCTION(mysqli_data_seek) { zval *object; zend_long offset; ZEND_PARSE_PARAMETERS_START(2,2) Z_PARAM_OBJECT_OF_CLASS(object,result_ce) Z_PARAM_LONG(offset) ZEND_PARSE_PARAMETERS_END(); RETURN_BOOL(seek_result(object,offset)); }
PHP_METHOD(mysqli_result,data_seek) { zend_long offset; ZEND_PARSE_PARAMETERS_START(1,1) Z_PARAM_LONG(offset) ZEND_PARSE_PARAMETERS_END(); RETURN_BOOL(seek_result(ZEND_THIS,offset)); }
PHP_FUNCTION(mysqli_num_rows) { zval *object; ZEND_PARSE_PARAMETERS_START(1,1) Z_PARAM_OBJECT_OF_CLASS(object,result_ce) ZEND_PARSE_PARAMETERS_END(); if(Z_ISUNDEF(RES(object)->rows)){zend_throw_error(NULL,"mysqli_result is closed");RETURN_THROWS();} RETURN_LONG(zend_hash_num_elements(Z_ARRVAL(RES(object)->rows))); }

static void field_object(native_result *data,zend_long index,zval *output)
{
    if(Z_ISUNDEF(data->metadata)) { zend_throw_error(NULL,"mysqli_result is closed"); ZVAL_FALSE(output); return; }
    zval *info=zend_hash_index_find(Z_ARRVAL(data->metadata),index);
    if(!info) { ZVAL_FALSE(output); return; }
    object_init(output); zend_string *key; zval *value;
    ZEND_HASH_FOREACH_STR_KEY_VAL(Z_ARRVAL_P(info),key,value) { zend_update_property(zend_standard_class_def,Z_OBJ_P(output),ZSTR_VAL(key),ZSTR_LEN(key),value); } ZEND_HASH_FOREACH_END();
}
static void fields_objects(zval *object,zval *output)
{
    native_result *data=RES(object);
    if(Z_ISUNDEF(data->metadata)) { zend_throw_error(NULL,"mysqli_result is closed"); ZVAL_FALSE(output); return; }
    array_init(output);
    for(zend_ulong i=0;i<zend_hash_num_elements(Z_ARRVAL(data->metadata));i++) { zval info; field_object(data,i,&info); add_next_index_zval(output,&info); }
}
PHP_FUNCTION(mysqli_fetch_fields) { zval *object; ZEND_PARSE_PARAMETERS_START(1,1) Z_PARAM_OBJECT_OF_CLASS(object,result_ce) ZEND_PARSE_PARAMETERS_END(); fields_objects(object,return_value); }
PHP_METHOD(mysqli_result,fetch_fields) { ZEND_PARSE_PARAMETERS_NONE(); fields_objects(ZEND_THIS,return_value); }
PHP_FUNCTION(mysqli_fetch_field) { zval *object; ZEND_PARSE_PARAMETERS_START(1,1) Z_PARAM_OBJECT_OF_CLASS(object,result_ce) ZEND_PARSE_PARAMETERS_END(); field_object(RES(object),RES(object)->field_position++,return_value); }
PHP_METHOD(mysqli_result,fetch_field) { ZEND_PARSE_PARAMETERS_NONE(); field_object(RES(ZEND_THIS),RES(ZEND_THIS)->field_position++,return_value); }
PHP_FUNCTION(mysqli_fetch_field_direct) { zval *object; zend_long index; ZEND_PARSE_PARAMETERS_START(2,2) Z_PARAM_OBJECT_OF_CLASS(object,result_ce) Z_PARAM_LONG(index) ZEND_PARSE_PARAMETERS_END(); field_object(RES(object),index,return_value); }
PHP_METHOD(mysqli_result,fetch_field_direct) { zend_long index; ZEND_PARSE_PARAMETERS_START(1,1) Z_PARAM_LONG(index) ZEND_PARSE_PARAMETERS_END(); field_object(RES(ZEND_THIS),index,return_value); }
PHP_FUNCTION(mysqli_stmt_result_metadata) { zval *object; ZEND_PARSE_PARAMETERS_START(1,1) Z_PARAM_OBJECT_OF_CLASS(object,statement_ce) ZEND_PARSE_PARAMETERS_END(); MYSQL_STMT *stmt=require_statement(object); if(!stmt) RETURN_THROWS(); MYSQL_RES *meta=mysql_stmt_result_metadata(stmt); if(!meta) RETURN_FALSE; result_init(return_value,meta); mysql_free_result(meta); }
PHP_METHOD(mysqli_stmt,result_metadata) { ZEND_PARSE_PARAMETERS_NONE(); MYSQL_STMT *stmt=require_statement(ZEND_THIS); if(!stmt) RETURN_THROWS(); MYSQL_RES *meta=mysql_stmt_result_metadata(stmt); if(!meta) RETURN_FALSE; result_init(return_value,meta); mysql_free_result(meta); }
ZEND_BEGIN_ARG_INFO_EX(ai_method_execute,0,0,0) ZEND_ARG_INFO(0,params) ZEND_END_ARG_INFO()
ZEND_BEGIN_ARG_INFO_EX(ai_execute,0,0,1) ZEND_ARG_INFO(0,statement) ZEND_ARG_INFO(0,params) ZEND_END_ARG_INFO()
PHP_FUNCTION(mysqli_init) { ZEND_PARSE_PARAMETERS_NONE(); object_init_ex(return_value,connection_ce); }
PHP_FUNCTION(mysqli_real_connect) { zval *object; char *host=NULL,*user=NULL,*password=NULL,*database=NULL,*socket=NULL; size_t h=0,u=0,p=0,d=0,so=0; zend_long port=0,flags=0;
 ZEND_PARSE_PARAMETERS_START(1,8) Z_PARAM_OBJECT_OF_CLASS(object,connection_ce) Z_PARAM_OPTIONAL Z_PARAM_STRING_OR_NULL(host,h) Z_PARAM_STRING_OR_NULL(user,u) Z_PARAM_STRING_OR_NULL(password,p) Z_PARAM_STRING_OR_NULL(database,d) Z_PARAM_LONG(port) Z_PARAM_STRING_OR_NULL(socket,so) Z_PARAM_LONG(flags) ZEND_PARSE_PARAMETERS_END();
 if(flags){zend_value_error("Connection flags are not implemented by this embedded driver");RETURN_THROWS();} RETURN_BOOL(connect_object(object,host,user,password,database)); }
PHP_METHOD(mysqli,real_connect) { char *host=NULL,*user=NULL,*password=NULL,*database=NULL,*socket=NULL; size_t h=0,u=0,p=0,d=0,so=0; zend_long port=0,flags=0;
 ZEND_PARSE_PARAMETERS_START(0,7) Z_PARAM_OPTIONAL Z_PARAM_STRING_OR_NULL(host,h) Z_PARAM_STRING_OR_NULL(user,u) Z_PARAM_STRING_OR_NULL(password,p) Z_PARAM_STRING_OR_NULL(database,d) Z_PARAM_LONG(port) Z_PARAM_STRING_OR_NULL(socket,so) Z_PARAM_LONG(flags) ZEND_PARSE_PARAMETERS_END();
 if(flags){zend_value_error("Connection flags are not implemented by this embedded driver");RETURN_THROWS();} RETURN_BOOL(connect_object(ZEND_THIS,host,user,password,database)); }
PHP_FUNCTION(mysqli_autocommit) { zval *object; bool enable; ZEND_PARSE_PARAMETERS_START(2,2) Z_PARAM_OBJECT_OF_CLASS(object,connection_ce) Z_PARAM_BOOL(enable) ZEND_PARSE_PARAMETERS_END(); MYSQL *m=require_connection(object);if(!m)RETURN_THROWS();int rc=mysql_autocommit(m,enable);if(rc)sql_error(m,NULL);RETURN_BOOL(!rc); }
PHP_METHOD(mysqli,autocommit) { bool enable; ZEND_PARSE_PARAMETERS_START(1,1) Z_PARAM_BOOL(enable) ZEND_PARSE_PARAMETERS_END(); MYSQL *m=require_connection(ZEND_THIS);if(!m)RETURN_THROWS();int rc=mysql_autocommit(m,enable);if(rc)sql_error(m,NULL);RETURN_BOOL(!rc); }
PHP_FUNCTION(mysqli_select_db) { zval *object; char *db;size_t length;ZEND_PARSE_PARAMETERS_START(2,2) Z_PARAM_OBJECT_OF_CLASS(object,connection_ce) Z_PARAM_STRING(db,length) ZEND_PARSE_PARAMETERS_END(); MYSQL *m=require_connection(object);if(!m)RETURN_THROWS();if(memchr(db,0,length)){zend_value_error("Database contains NUL");RETURN_THROWS();}int rc=mysql_select_db(m,db);if(rc)sql_error(m,NULL);RETURN_BOOL(!rc); }
PHP_METHOD(mysqli,select_db) { char *db;size_t length;ZEND_PARSE_PARAMETERS_START(1,1) Z_PARAM_STRING(db,length) ZEND_PARSE_PARAMETERS_END(); MYSQL *m=require_connection(ZEND_THIS);if(!m)RETURN_THROWS();if(memchr(db,0,length)){zend_value_error("Database contains NUL");RETURN_THROWS();}int rc=mysql_select_db(m,db);if(rc)sql_error(m,NULL);RETURN_BOOL(!rc); }
static void escape_string(zval *object,char *text,size_t length,zval *output) {
 MYSQL *m=require_connection(object);if(!m){ZVAL_FALSE(output);return;}if(length>SQL_BYTES){zend_value_error("String exceeds native byte limit");ZVAL_FALSE(output);return;}
 zend_string *escaped=zend_string_alloc(length*2,0);size_t size=mysql_real_escape_string(m,ZSTR_VAL(escaped),text,length);ZSTR_LEN(escaped)=size;ZSTR_VAL(escaped)[size]=0;ZVAL_STR(output,escaped);
}
PHP_FUNCTION(mysqli_real_escape_string) {zval *object;char *text;size_t length;ZEND_PARSE_PARAMETERS_START(2,2) Z_PARAM_OBJECT_OF_CLASS(object,connection_ce) Z_PARAM_STRING(text,length) ZEND_PARSE_PARAMETERS_END();escape_string(object,text,length,return_value);}
PHP_METHOD(mysqli,real_escape_string) {char *text;size_t length;ZEND_PARSE_PARAMETERS_START(1,1) Z_PARAM_STRING(text,length) ZEND_PARSE_PARAMETERS_END();escape_string(ZEND_THIS,text,length,return_value);}
#define PBL_GETTER(name,expression) PHP_FUNCTION(name) {zval *object;ZEND_PARSE_PARAMETERS_START(1,1) Z_PARAM_OBJECT_OF_CLASS(object,connection_ce) ZEND_PARSE_PARAMETERS_END();MYSQL *m=require_connection(object);if(!m)RETURN_THROWS();expression;}
PBL_GETTER(mysqli_errno,RETURN_LONG(mysql_errno(m)))
PBL_GETTER(mysqli_error,RETURN_STRING(mysql_error(m)))
PBL_GETTER(mysqli_sqlstate,RETURN_STRING(mysql_sqlstate(m)))
PBL_GETTER(mysqli_get_server_info,RETURN_STRING(mysql_get_server_info(m)))
PBL_GETTER(mysqli_get_server_version,RETURN_LONG(mysql_get_server_version(m)))
PBL_GETTER(mysqli_character_set_name,RETURN_STRING(mysql_character_set_name(m)))
PBL_GETTER(mysqli_warning_count,RETURN_LONG(mysql_warning_count(m)))
PBL_GETTER(mysqli_ping,RETURN_BOOL(mysql_ping(m)==0))
PHP_FUNCTION(mysqli_get_client_info) { ZEND_PARSE_PARAMETERS_NONE(); RETURN_STRING(mysql_get_client_info()); }
PHP_FUNCTION(mysqli_get_client_version) { ZEND_PARSE_PARAMETERS_NONE(); RETURN_LONG(mysql_get_client_version()); }
PHP_FUNCTION(mysqli_affected_rows) {zval *object;ZEND_PARSE_PARAMETERS_START(1,1) Z_PARAM_OBJECT_OF_CLASS(object,connection_ce) ZEND_PARSE_PARAMETERS_END();if(!require_connection(object))RETURN_THROWS();connection_info(object);zval rv;zval *value=zend_read_property(connection_ce,Z_OBJ_P(object),"affected_rows",13,0,&rv);RETURN_COPY(value);}
typedef struct { zend_object_iterator base; zval current; zend_long key; } result_cursor;
static void cursor_dtor(zend_object_iterator *iterator) { result_cursor *c=(result_cursor*)iterator;zval_ptr_dtor(&c->current);zval_ptr_dtor(&iterator->data); }
static zend_result cursor_valid(zend_object_iterator *iterator) { return Z_TYPE(((result_cursor*)iterator)->current)==IS_ARRAY?SUCCESS:FAILURE; }
static zval *cursor_current(zend_object_iterator *iterator) { return &((result_cursor*)iterator)->current; }
static void cursor_key(zend_object_iterator *iterator,zval *output) {ZVAL_LONG(output,((result_cursor*)iterator)->key);}
static void cursor_next(zend_object_iterator *iterator) {result_cursor *c=(result_cursor*)iterator;zval_ptr_dtor(&c->current);fetch_result(&iterator->data,&c->current,1);c->key++;}
static void cursor_rewind(zend_object_iterator *iterator) {RES(&iterator->data)->position=0;((result_cursor*)iterator)->key=-1;cursor_next(iterator);}
static HashTable *cursor_gc(zend_object_iterator *iterator,zval **table,int *count) {result_cursor *c=(result_cursor*)iterator;zend_get_gc_buffer *buffer=zend_get_gc_buffer_create();zend_get_gc_buffer_add_zval(buffer,&iterator->data);zend_get_gc_buffer_add_zval(buffer,&c->current);zend_get_gc_buffer_use(buffer,table,count);return NULL;}
static const zend_object_iterator_funcs cursor_functions={cursor_dtor,cursor_valid,cursor_current,cursor_key,cursor_next,cursor_rewind,NULL,cursor_gc};
static zend_object_iterator *result_iterator(zend_class_entry *ce,zval *object,int by_ref) {
 if(by_ref){zend_throw_error(NULL,"MySQLi results cannot be iterated by reference");return NULL;}
 if(Z_ISUNDEF(RES(object)->rows)){zend_throw_error(NULL,"mysqli_result is closed");return NULL;}
 result_cursor *c=ecalloc(1,sizeof(*c));zend_iterator_init(&c->base);ZVAL_COPY(&c->base.data,object);ZVAL_UNDEF(&c->current);c->key=-1;c->base.funcs=&cursor_functions;return &c->base;
}
PHP_METHOD(mysqli_result,getIterator) {ZEND_PARSE_PARAMETERS_NONE();zend_create_internal_iterator_zval(return_value,ZEND_THIS);}
static void fetch_column_value(zval *object,zend_long index,zval *output) {
 native_result *data=RES(object);if(Z_ISUNDEF(data->rows)){zend_throw_error(NULL,"mysqli_result is closed");ZVAL_FALSE(output);return;}
 if(index<0||(zend_ulong)index>=zend_hash_num_elements(Z_ARRVAL(data->fields))){zend_value_error("Column offset must refer to an existing field");ZVAL_FALSE(output);return;}
 zval *row=zend_hash_index_find(Z_ARRVAL(data->rows),data->position++);if(!row){ZVAL_FALSE(output);return;}ZVAL_COPY(output,zend_hash_index_find(Z_ARRVAL_P(row),index));
}
PHP_FUNCTION(mysqli_fetch_column) {zval *object;zend_long index=0;ZEND_PARSE_PARAMETERS_START(1,2) Z_PARAM_OBJECT_OF_CLASS(object,result_ce) Z_PARAM_OPTIONAL Z_PARAM_LONG(index) ZEND_PARSE_PARAMETERS_END();fetch_column_value(object,index,return_value);}
PHP_METHOD(mysqli_result,fetch_column) {zend_long index=0;ZEND_PARSE_PARAMETERS_START(0,1) Z_PARAM_OPTIONAL Z_PARAM_LONG(index) ZEND_PARSE_PARAMETERS_END();fetch_column_value(ZEND_THIS,index,return_value);}
static int field_seek(zval *object,zend_long index) {native_result *data=RES(object);if(Z_ISUNDEF(data->fields)){zend_throw_error(NULL,"mysqli_result is closed");return 0;}if(index<0||(zend_ulong)index>=zend_hash_num_elements(Z_ARRVAL(data->fields))){zend_value_error("Invalid field offset");return 0;}data->field_position=index;return 1;}
PHP_FUNCTION(mysqli_field_seek) {zval *object;zend_long index;ZEND_PARSE_PARAMETERS_START(2,2) Z_PARAM_OBJECT_OF_CLASS(object,result_ce) Z_PARAM_LONG(index) ZEND_PARSE_PARAMETERS_END();RETURN_BOOL(field_seek(object,index));}
PHP_METHOD(mysqli_result,field_seek) {zend_long index;ZEND_PARSE_PARAMETERS_START(1,1) Z_PARAM_LONG(index) ZEND_PARSE_PARAMETERS_END();RETURN_BOOL(field_seek(ZEND_THIS,index));}
PHP_FUNCTION(mysqli_field_tell) {zval *object;ZEND_PARSE_PARAMETERS_START(1,1) Z_PARAM_OBJECT_OF_CLASS(object,result_ce) ZEND_PARSE_PARAMETERS_END();if(Z_ISUNDEF(RES(object)->fields)){zend_throw_error(NULL,"mysqli_result is closed");RETURN_THROWS();}RETURN_LONG(RES(object)->field_position);}
PHP_FUNCTION(mysqli_num_fields) {zval *object;ZEND_PARSE_PARAMETERS_START(1,1) Z_PARAM_OBJECT_OF_CLASS(object,result_ce) ZEND_PARSE_PARAMETERS_END();if(Z_ISUNDEF(RES(object)->fields)){zend_throw_error(NULL,"mysqli_result is closed");RETURN_THROWS();}RETURN_LONG(zend_hash_num_elements(Z_ARRVAL(RES(object)->fields)));}
PHP_FUNCTION(mysqli_fetch_lengths) {zval *object;ZEND_PARSE_PARAMETERS_START(1,1) Z_PARAM_OBJECT_OF_CLASS(object,result_ce) ZEND_PARSE_PARAMETERS_END();native_result *data=RES(object);if(Z_ISUNDEF(data->rows)){zend_throw_error(NULL,"mysqli_result is closed");RETURN_THROWS();}zval *row=data->position?zend_hash_index_find(Z_ARRVAL(data->rows),data->position-1):NULL;if(!row)RETURN_FALSE;array_init(return_value);zval *cell;ZEND_HASH_FOREACH_VAL(Z_ARRVAL_P(row),cell){if(Z_TYPE_P(cell)==IS_NULL)add_next_index_long(return_value,0);else{zend_string *text=zval_get_string(cell);add_next_index_long(return_value,ZSTR_LEN(text));zend_string_release(text);}}ZEND_HASH_FOREACH_END();}
static void stmt_free_result(zval *object) {MYSQL_STMT *stmt=require_statement(object);if(!stmt)return;mysql_stmt_free_result(stmt);native_statement *data=STMT(object);zval_ptr_dtor(&data->result);ZVAL_UNDEF(&data->result);zend_update_property_long(statement_ce,Z_OBJ_P(object),"num_rows",8,0);}
PHP_FUNCTION(mysqli_stmt_free_result) {zval *object;ZEND_PARSE_PARAMETERS_START(1,1) Z_PARAM_OBJECT_OF_CLASS(object,statement_ce) ZEND_PARSE_PARAMETERS_END();stmt_free_result(object);}
PHP_METHOD(mysqli_stmt,free_result) {ZEND_PARSE_PARAMETERS_NONE();stmt_free_result(ZEND_THIS);}
static int stmt_reset(zval *object) {MYSQL_STMT *stmt=require_statement(object);if(!stmt)return 0;int rc=mysql_stmt_reset(stmt);if(rc)sql_error(NULL,stmt);else stmt_free_result(object);return !rc;}
PHP_FUNCTION(mysqli_stmt_reset) {zval *object;ZEND_PARSE_PARAMETERS_START(1,1) Z_PARAM_OBJECT_OF_CLASS(object,statement_ce) ZEND_PARSE_PARAMETERS_END();RETURN_BOOL(stmt_reset(object));}
PHP_METHOD(mysqli_stmt,reset) {ZEND_PARSE_PARAMETERS_NONE();RETURN_BOOL(stmt_reset(ZEND_THIS));}
static void stmt_seek(zval *object,zend_long offset) {zval result;statement_result(object,&result);if(Z_TYPE(result)==IS_OBJECT)seek_result(&result,offset);zval_ptr_dtor(&result);}
PHP_FUNCTION(mysqli_stmt_data_seek) {zval *object;zend_long offset;ZEND_PARSE_PARAMETERS_START(2,2) Z_PARAM_OBJECT_OF_CLASS(object,statement_ce) Z_PARAM_LONG(offset) ZEND_PARSE_PARAMETERS_END();stmt_seek(object,offset);}
PHP_METHOD(mysqli_stmt,data_seek) {zend_long offset;ZEND_PARSE_PARAMETERS_START(1,1) Z_PARAM_LONG(offset) ZEND_PARSE_PARAMETERS_END();stmt_seek(ZEND_THIS,offset);}
#define PBL_STMT_GETTER(name,expression) PHP_FUNCTION(name) {zval *object;ZEND_PARSE_PARAMETERS_START(1,1) Z_PARAM_OBJECT_OF_CLASS(object,statement_ce) ZEND_PARSE_PARAMETERS_END();MYSQL_STMT *stmt=require_statement(object);if(!stmt)RETURN_THROWS();expression;}
PBL_STMT_GETTER(mysqli_stmt_errno,RETURN_LONG(mysql_stmt_errno(stmt)))
PBL_STMT_GETTER(mysqli_stmt_error,RETURN_STRING(mysql_stmt_error(stmt)))
PBL_STMT_GETTER(mysqli_stmt_sqlstate,RETURN_STRING(mysql_stmt_sqlstate(stmt)))
PBL_STMT_GETTER(mysqli_stmt_field_count,RETURN_LONG(mysql_stmt_field_count(stmt)))
PBL_STMT_GETTER(mysqli_stmt_param_count,RETURN_LONG(mysql_stmt_param_count(stmt)))
PBL_STMT_GETTER(mysqli_stmt_num_rows,RETURN_LONG(Z_ISUNDEF(STMT(object)->result)?mysql_stmt_num_rows(stmt):(Z_ISUNDEF(RES(&STMT(object)->result)->rows)?0:zend_hash_num_elements(Z_ARRVAL(RES(&STMT(object)->result)->rows)))))
PBL_STMT_GETTER(mysqli_stmt_insert_id,unsigned_value(mysql_stmt_insert_id(stmt),return_value))
PBL_STMT_GETTER(mysqli_stmt_affected_rows,{my_ulonglong n=mysql_stmt_affected_rows(stmt);if(n==(my_ulonglong)-1)RETURN_LONG(-1);unsigned_value(n,return_value);})
PBL_GETTER(mysqli_field_count,RETURN_LONG(mysql_field_count(m)))
PBL_GETTER(mysqli_thread_id,RETURN_LONG(mysql_thread_id(m)))
PBL_GETTER(mysqli_get_proto_info,RETURN_LONG(mysql_get_proto_info(m)))
PBL_GETTER(mysqli_get_host_info,RETURN_STRING(mysql_get_host_info(m)))
PBL_GETTER(mysqli_info,{const char *info=mysql_info(m);if(info)RETURN_STRING(info);RETURN_NULL();})
PHP_FUNCTION(mysqli_thread_safe) {ZEND_PARSE_PARAMETERS_NONE();RETURN_BOOL(mysql_thread_safe());}
ZEND_BEGIN_ARG_WITH_RETURN_OBJ_INFO_EX(ai_get_iterator,0,0,Iterator,0) ZEND_END_ARG_INFO()
ZEND_BEGIN_ARG_INFO_EX(ai_column,0,0,1) ZEND_ARG_INFO(0,result) ZEND_ARG_INFO(0,column) ZEND_END_ARG_INFO()
ZEND_BEGIN_ARG_INFO_EX(ai_method_column,0,0,0) ZEND_ARG_INFO(0,column) ZEND_END_ARG_INFO()
ZEND_BEGIN_ARG_INFO_EX(ai_real_connect,0,0,1) ZEND_ARG_INFO(0,object) ZEND_ARG_INFO(0,host) ZEND_ARG_INFO(0,user) ZEND_ARG_INFO(0,password) ZEND_ARG_INFO(0,database) ZEND_ARG_INFO(0,port) ZEND_ARG_INFO(0,socket) ZEND_ARG_INFO(0,flags) ZEND_END_ARG_INFO()
ZEND_BEGIN_ARG_INFO_EX(ai_method_real_connect,0,0,0) ZEND_ARG_INFO(0,host) ZEND_ARG_INFO(0,user) ZEND_ARG_INFO(0,password) ZEND_ARG_INFO(0,database) ZEND_ARG_INFO(0,port) ZEND_ARG_INFO(0,socket) ZEND_ARG_INFO(0,flags) ZEND_END_ARG_INFO()
ZEND_BEGIN_ARG_INFO_EX(ai_connect,0,0,0) ZEND_ARG_INFO(0,hostname) ZEND_ARG_INFO(0,username) ZEND_ARG_INFO(0,password) ZEND_ARG_INFO(0,database) ZEND_ARG_INFO(0,port) ZEND_ARG_INFO(0,socket) ZEND_END_ARG_INFO()
ZEND_BEGIN_ARG_INFO_EX(ai_one,0,0,1) ZEND_ARG_INFO(0,value) ZEND_END_ARG_INFO()
ZEND_BEGIN_ARG_INFO_EX(ai_two,0,0,2) ZEND_ARG_INFO(0,object) ZEND_ARG_INFO(0,value) ZEND_END_ARG_INFO()
ZEND_BEGIN_ARG_INFO_EX(ai_savepoint,0,0,2) ZEND_ARG_INFO(0,mysql) ZEND_ARG_TYPE_INFO(0,name,IS_STRING,0) ZEND_END_ARG_INFO()
ZEND_BEGIN_ARG_INFO_EX(ai_method_savepoint,0,0,1) ZEND_ARG_TYPE_INFO(0,name,IS_STRING,0) ZEND_END_ARG_INFO()
ZEND_BEGIN_ARG_INFO_EX(ai_query,0,0,2) ZEND_ARG_INFO(0,object) ZEND_ARG_INFO(0,query) ZEND_ARG_INFO(0,result_mode) ZEND_END_ARG_INFO()
ZEND_BEGIN_ARG_INFO_EX(ai_method_query,0,0,1) ZEND_ARG_INFO(0,query) ZEND_ARG_INFO(0,result_mode) ZEND_END_ARG_INFO()
ZEND_BEGIN_ARG_INFO_EX(ai_none,0,0,0) ZEND_END_ARG_INFO()
ZEND_BEGIN_ARG_INFO_EX(ai_fetch_object,0,0,1) ZEND_ARG_INFO(0,result) ZEND_ARG_TYPE_INFO_WITH_DEFAULT_VALUE(0,class,IS_STRING,0,"\"stdClass\"") ZEND_ARG_TYPE_INFO_WITH_DEFAULT_VALUE(0,constructor_args,IS_ARRAY,0,"[]") ZEND_END_ARG_INFO()
ZEND_BEGIN_ARG_INFO_EX(ai_method_fetch_object,0,0,0) ZEND_ARG_TYPE_INFO_WITH_DEFAULT_VALUE(0,class,IS_STRING,0,"\"stdClass\"") ZEND_ARG_TYPE_INFO_WITH_DEFAULT_VALUE(0,constructor_args,IS_ARRAY,0,"[]") ZEND_END_ARG_INFO()
ZEND_BEGIN_ARG_INFO_EX(ai_execute_query,0,0,2) ZEND_ARG_INFO(0,mysql) ZEND_ARG_TYPE_INFO(0,query,IS_STRING,0) ZEND_ARG_TYPE_INFO_WITH_DEFAULT_VALUE(0,params,IS_ARRAY,1,"null") ZEND_END_ARG_INFO()
ZEND_BEGIN_ARG_INFO_EX(ai_method_execute_query,0,0,1) ZEND_ARG_TYPE_INFO(0,query,IS_STRING,0) ZEND_ARG_TYPE_INFO_WITH_DEFAULT_VALUE(0,params,IS_ARRAY,1,"null") ZEND_END_ARG_INFO()
ZEND_BEGIN_ARG_INFO_EX(ai_stmt_construct,0,0,1) ZEND_ARG_INFO(0,mysql) ZEND_ARG_TYPE_INFO_WITH_DEFAULT_VALUE(0,query,IS_STRING,1,"null") ZEND_END_ARG_INFO()
ZEND_BEGIN_ARG_INFO_EX(ai_stmt_init,0,0,1) ZEND_ARG_INFO(0,mysql) ZEND_END_ARG_INFO()
ZEND_BEGIN_ARG_INFO_EX(ai_stmt_prepare,0,0,2) ZEND_ARG_INFO(0,statement) ZEND_ARG_TYPE_INFO(0,query,IS_STRING,0) ZEND_END_ARG_INFO()
ZEND_BEGIN_ARG_INFO_EX(ai_method_prepare,0,0,1) ZEND_ARG_TYPE_INFO(0,query,IS_STRING,0) ZEND_END_ARG_INFO()
ZEND_BEGIN_ARG_INFO_EX(ai_bind,0,0,2) ZEND_ARG_INFO(0,statement) ZEND_ARG_INFO(0,types) ZEND_ARG_VARIADIC_INFO(1,vars) ZEND_END_ARG_INFO()
ZEND_BEGIN_ARG_INFO_EX(ai_method_bind,0,0,1) ZEND_ARG_INFO(0,types) ZEND_ARG_VARIADIC_INFO(1,vars) ZEND_END_ARG_INFO()
ZEND_BEGIN_ARG_INFO_EX(ai_bind_output,0,0,2) ZEND_ARG_INFO(0,statement) ZEND_ARG_VARIADIC_INFO(1,vars) ZEND_END_ARG_INFO()
ZEND_BEGIN_ARG_INFO_EX(ai_method_bind_output,0,0,1) ZEND_ARG_VARIADIC_INFO(1,vars) ZEND_END_ARG_INFO()
ZEND_BEGIN_ARG_INFO_EX(ai_result_mode,0,0,1) ZEND_ARG_INFO(0,result) ZEND_ARG_INFO(0,mode) ZEND_END_ARG_INFO()
ZEND_BEGIN_ARG_INFO_EX(ai_method_mode,0,0,0) ZEND_ARG_INFO(0,mode) ZEND_END_ARG_INFO()
const zend_function_entry pbl_mysqli_functions[]={
 PHP_FE(mysqli_savepoint,ai_savepoint) PHP_FE(mysqli_release_savepoint,ai_savepoint)
 PHP_FE(mysqli_fetch_object,ai_fetch_object) PHP_FE(mysqli_execute_query,ai_execute_query) PHP_FE(mysqli_stmt_init,ai_stmt_init) PHP_FE(mysqli_stmt_prepare,ai_stmt_prepare)
 PHP_FE(mysqli_fetch_column,ai_column) PHP_FE(mysqli_fetch_lengths,ai_one) PHP_FE(mysqli_num_fields,ai_one) PHP_FE(mysqli_field_seek,ai_two) PHP_FE(mysqli_field_tell,ai_one)
 PHP_FE(mysqli_stmt_free_result,ai_one) PHP_FE(mysqli_stmt_reset,ai_one) PHP_FE(mysqli_stmt_data_seek,ai_two)
 PHP_FE(mysqli_stmt_errno,ai_one) PHP_FE(mysqli_stmt_error,ai_one) PHP_FE(mysqli_stmt_sqlstate,ai_one) PHP_FE(mysqli_stmt_field_count,ai_one) PHP_FE(mysqli_stmt_param_count,ai_one) PHP_FE(mysqli_stmt_num_rows,ai_one) PHP_FE(mysqli_stmt_insert_id,ai_one) PHP_FE(mysqli_stmt_affected_rows,ai_one)
 PHP_FE(mysqli_field_count,ai_one) PHP_FE(mysqli_thread_id,ai_one) PHP_FE(mysqli_get_proto_info,ai_one) PHP_FE(mysqli_get_host_info,ai_one) PHP_FE(mysqli_info,ai_one) PHP_FE(mysqli_thread_safe,ai_none)
 ZEND_FALIAS(mysqli_escape_string,mysqli_real_escape_string,ai_two) ZEND_FALIAS(mysqli_execute,mysqli_stmt_execute,ai_execute)
 PHP_FE(mysqli_init,ai_none) PHP_FE(mysqli_real_connect,ai_real_connect) PHP_FE(mysqli_autocommit,ai_two) PHP_FE(mysqli_select_db,ai_two) PHP_FE(mysqli_real_escape_string,ai_two)
 PHP_FE(mysqli_errno,ai_one) PHP_FE(mysqli_error,ai_one) PHP_FE(mysqli_sqlstate,ai_one) PHP_FE(mysqli_get_server_info,ai_one) PHP_FE(mysqli_get_server_version,ai_one) PHP_FE(mysqli_character_set_name,ai_one) PHP_FE(mysqli_warning_count,ai_one) PHP_FE(mysqli_ping,ai_one) PHP_FE(mysqli_get_client_info,ai_none) PHP_FE(mysqli_get_client_version,ai_none) PHP_FE(mysqli_affected_rows,ai_one)
 PHP_FE(mysqli_stmt_bind_result,ai_bind_output) PHP_FE(mysqli_stmt_fetch,ai_one) PHP_FE(mysqli_stmt_store_result,ai_one)
 PHP_FE(mysqli_fetch_fields,ai_one) PHP_FE(mysqli_fetch_field,ai_one) PHP_FE(mysqli_fetch_field_direct,ai_two) PHP_FE(mysqli_stmt_result_metadata,ai_one) PHP_FE(mysqli_fetch_all,ai_result_mode) PHP_FE(mysqli_fetch_array,ai_result_mode) PHP_FE(mysqli_data_seek,ai_two) PHP_FE(mysqli_num_rows,ai_one)
 PHP_FE(mysqli_connect,ai_connect) PHP_FE(mysqli_report,ai_one) PHP_FE(mysqli_query,ai_query)
 PHP_FE(mysqli_set_charset,ai_two) PHP_FE(mysqli_begin_transaction,ai_one) PHP_FE(mysqli_commit,ai_one) PHP_FE(mysqli_rollback,ai_one)
 PHP_FE(mysqli_prepare,ai_two) PHP_FE(mysqli_stmt_bind_param,ai_bind) PHP_FE(mysqli_stmt_execute,ai_execute) PHP_FE(mysqli_stmt_get_result,ai_one)
 PHP_FE(mysqli_stmt_close,ai_one) PHP_FE(mysqli_insert_id,ai_one) PHP_FE(mysqli_close,ai_one)
 PHP_FE(mysqli_fetch_assoc,ai_one) PHP_FE(mysqli_fetch_row,ai_one) PHP_FE(mysqli_free_result,ai_one) PHP_FE_END
};
static const zend_function_entry connection_methods[]={ PHP_ME(mysqli,savepoint,ai_method_savepoint,ZEND_ACC_PUBLIC) PHP_ME(mysqli,release_savepoint,ai_method_savepoint,ZEND_ACC_PUBLIC) PHP_ME(mysqli,real_connect,ai_method_real_connect,ZEND_ACC_PUBLIC) PHP_ME(mysqli,autocommit,ai_one,ZEND_ACC_PUBLIC) PHP_ME(mysqli,select_db,ai_one,ZEND_ACC_PUBLIC) PHP_ME(mysqli,real_escape_string,ai_one,ZEND_ACC_PUBLIC)
 PHP_ME(mysqli,execute_query,ai_method_execute_query,ZEND_ACC_PUBLIC) PHP_ME(mysqli,stmt_init,ai_none,ZEND_ACC_PUBLIC)
 PHP_ME(mysqli,__construct,ai_connect,ZEND_ACC_PUBLIC) PHP_ME(mysqli,query,ai_method_query,ZEND_ACC_PUBLIC)
 PHP_ME(mysqli,prepare,ai_one,ZEND_ACC_PUBLIC) PHP_ME(mysqli,set_charset,ai_one,ZEND_ACC_PUBLIC)
 PHP_ME(mysqli,begin_transaction,ai_none,ZEND_ACC_PUBLIC) PHP_ME(mysqli,commit,ai_none,ZEND_ACC_PUBLIC)
 PHP_ME(mysqli,rollback,ai_none,ZEND_ACC_PUBLIC) PHP_ME(mysqli,close,ai_none,ZEND_ACC_PUBLIC) PHP_FE_END
};
static const zend_function_entry result_methods[]={ PHP_ME(mysqli_result,fetch_object,ai_method_fetch_object,ZEND_ACC_PUBLIC) PHP_ME(mysqli_result,getIterator,ai_get_iterator,ZEND_ACC_PUBLIC) PHP_ME(mysqli_result,fetch_column,ai_method_column,ZEND_ACC_PUBLIC) PHP_ME(mysqli_result,field_seek,ai_one,ZEND_ACC_PUBLIC) ZEND_MALIAS(mysqli_result,free_result,free,ai_none,ZEND_ACC_PUBLIC) ZEND_MALIAS(mysqli_result,close,free,ai_none,ZEND_ACC_PUBLIC) PHP_ME(mysqli_result,fetch_fields,ai_none,ZEND_ACC_PUBLIC) PHP_ME(mysqli_result,fetch_field,ai_none,ZEND_ACC_PUBLIC) PHP_ME(mysqli_result,fetch_field_direct,ai_one,ZEND_ACC_PUBLIC) PHP_ME(mysqli_result,fetch_all,ai_method_mode,ZEND_ACC_PUBLIC) PHP_ME(mysqli_result,fetch_array,ai_method_mode,ZEND_ACC_PUBLIC) PHP_ME(mysqli_result,data_seek,ai_one,ZEND_ACC_PUBLIC) PHP_ME(mysqli_result,fetch_assoc,ai_none,ZEND_ACC_PUBLIC) PHP_ME(mysqli_result,fetch_row,ai_none,ZEND_ACC_PUBLIC) PHP_ME(mysqli_result,free,ai_none,ZEND_ACC_PUBLIC) PHP_FE_END };
static const zend_function_entry statement_methods[]={ PHP_ME(mysqli_stmt,__construct,ai_stmt_construct,ZEND_ACC_PUBLIC) PHP_ME(mysqli_stmt,prepare,ai_method_prepare,ZEND_ACC_PUBLIC) PHP_ME(mysqli_stmt,free_result,ai_none,ZEND_ACC_PUBLIC) PHP_ME(mysqli_stmt,reset,ai_none,ZEND_ACC_PUBLIC) PHP_ME(mysqli_stmt,data_seek,ai_one,ZEND_ACC_PUBLIC) PHP_ME(mysqli_stmt,result_metadata,ai_none,ZEND_ACC_PUBLIC) PHP_ME(mysqli_stmt,bind_result,ai_method_bind_output,ZEND_ACC_PUBLIC) PHP_ME(mysqli_stmt,fetch,ai_none,ZEND_ACC_PUBLIC) PHP_ME(mysqli_stmt,store_result,ai_none,ZEND_ACC_PUBLIC) PHP_ME(mysqli_stmt,bind_param,ai_method_bind,ZEND_ACC_PUBLIC) PHP_ME(mysqli_stmt,execute,ai_method_execute,ZEND_ACC_PUBLIC) PHP_ME(mysqli_stmt,get_result,ai_none,ZEND_ACC_PUBLIC) PHP_ME(mysqli_stmt,close,ai_none,ZEND_ACC_PUBLIC) PHP_FE_END };
static const zend_function_entry exception_methods[]={ PHP_ME(mysqli_sql_exception,getSqlState,ai_none,ZEND_ACC_PUBLIC) PHP_FE_END };
int pbl_mysqli_register(void)
{
    report_mode=3;
    zend_class_entry entry;
    INIT_CLASS_ENTRY(entry,"mysqli",connection_methods); connection_ce=zend_register_internal_class(&entry); connection_ce->create_object=new_connection;
    INIT_CLASS_ENTRY(entry,"mysqli_result",result_methods); result_ce=zend_register_internal_class(&entry); result_ce->create_object=new_result; result_ce->get_iterator=result_iterator; zend_class_implements(result_ce,1,zend_ce_aggregate);
    INIT_CLASS_ENTRY(entry,"mysqli_stmt",statement_methods); statement_ce=zend_register_internal_class(&entry); statement_ce->create_object=new_statement;
    INIT_CLASS_ENTRY(entry,"mysqli_sql_exception",exception_methods); sql_exception_ce=zend_register_internal_class_ex(&entry,spl_ce_RuntimeException);
    zend_declare_property_string(sql_exception_ce,"sqlstate",8,"HY000",ZEND_ACC_PROTECTED);
    memcpy(&connection_handlers,zend_get_std_object_handlers(),sizeof(connection_handlers)); connection_handlers.offset=XtOffsetOf(native_connection,std); connection_handlers.free_obj=free_connection; connection_handlers.clone_obj=NULL;
    memcpy(&result_handlers,zend_get_std_object_handlers(),sizeof(result_handlers)); result_handlers.offset=XtOffsetOf(native_result,std); result_handlers.free_obj=free_result; result_handlers.clone_obj=NULL;
    memcpy(&statement_handlers,zend_get_std_object_handlers(),sizeof(statement_handlers)); statement_handlers.offset=XtOffsetOf(native_statement,std); statement_handlers.free_obj=free_statement; statement_handlers.get_gc=statement_gc; statement_handlers.clone_obj=NULL;
    const char *properties[]={"errno","insert_id","affected_rows","connect_errno"};
    for(unsigned i=0;i<4;i++) zend_declare_property_long(connection_ce,properties[i],strlen(properties[i]),0,ZEND_ACC_PUBLIC);
    zend_declare_property_string(connection_ce,"server_info",11,"",ZEND_ACC_PUBLIC); zend_declare_property_long(connection_ce,"server_version",14,0,ZEND_ACC_PUBLIC);
    zend_declare_property_string(connection_ce,"error",5,"",ZEND_ACC_PUBLIC); zend_declare_property_null(connection_ce,"connect_error",13,ZEND_ACC_PUBLIC);
    zend_declare_property_long(statement_ce,"num_rows",8,0,ZEND_ACC_PUBLIC);
    const char *stmt_props[]={"param_count","field_count","affected_rows","insert_id","errno"};
    for(unsigned i=0;i<5;i++) zend_declare_property_long(statement_ce,stmt_props[i],strlen(stmt_props[i]),0,ZEND_ACC_PUBLIC);
    zend_declare_property_string(statement_ce,"error",5,"",ZEND_ACC_PUBLIC);
    zend_declare_property_string(statement_ce,"sqlstate",8,"00000",ZEND_ACC_PUBLIC);
    zend_declare_property_long(result_ce,"num_rows",8,0,ZEND_ACC_PUBLIC); zend_declare_property_long(result_ce,"field_count",11,0,ZEND_ACC_PUBLIC);
    return SUCCESS;
}
