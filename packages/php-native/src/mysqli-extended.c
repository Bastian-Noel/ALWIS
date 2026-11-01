/* Included after the shared native object helpers. No PHP emulation layer. */
#define METHOD_PARSE(spec,...) (zend_parse_method_parameters(ZEND_NUM_ARGS(),getThis(),spec,__VA_ARGS__)==SUCCESS)
#define CONNECTION_ARG() zval *object; if(!METHOD_PARSE("O",&object,connection_ce))RETURN_THROWS(); MYSQL *mysql=require_connection(object);if(!mysql)RETURN_THROWS()
#define STATEMENT_ARG() zval *object; if(!METHOD_PARSE("O",&object,statement_ce))RETURN_THROWS(); MYSQL_STMT *stmt=require_statement(object);if(!stmt)RETURN_THROWS()
static void unavailable(const char *feature) {zend_throw_exception(spl_ce_LogicException,feature,0);}
PHP_FUNCTION(mysqli_connect_errno){ZEND_PARSE_PARAMETERS_NONE();RETURN_LONG(last_connect_errno);}
PHP_FUNCTION(mysqli_connect_error){ZEND_PARSE_PARAMETERS_NONE();if(last_connect_errno)RETURN_STRING(last_connect_error);RETURN_NULL();}
PHP_FUNCTION(mysqli_real_query){
 zval *object;char *sql;size_t length;if(!METHOD_PARSE("Os",&object,connection_ce,&sql,&length))RETURN_THROWS();MYSQL *mysql=require_connection(object);if(!mysql)RETURN_THROWS();
 mysql_set_server_option(mysql,MYSQL_OPTION_MULTI_STATEMENTS_OFF);int rc=pbl_mysql_query(mysql,sql,length);connection_info(object);if(rc)sql_error(mysql,NULL);RETURN_BOOL(!rc);
}
PHP_FUNCTION(mysqli_multi_query){
 zval *object;char *sql;size_t length;if(!METHOD_PARSE("Os",&object,connection_ce,&sql,&length))RETURN_THROWS();MYSQL *mysql=require_connection(object);if(!mysql)RETURN_THROWS();
 int rc=mysql_set_server_option(mysql,MYSQL_OPTION_MULTI_STATEMENTS_ON);if(!rc)rc=pbl_mysql_query(mysql,sql,length);connection_info(object);if(rc)sql_error(mysql,NULL);RETURN_BOOL(!rc);
}
PHP_FUNCTION(mysqli_more_results){CONNECTION_ARG();RETURN_BOOL(mysql_more_results(mysql));}
PHP_FUNCTION(mysqli_next_result){CONNECTION_ARG();int rc=mysql_next_result(mysql);connection_info(object);if(rc>0)sql_error(mysql,NULL);RETURN_BOOL(rc==0);}
PHP_FUNCTION(mysqli_store_result){zval *object;zend_long mode=0;if(!METHOD_PARSE("O|l",&object,connection_ce,&mode))RETURN_THROWS();if(mode!=0){zend_value_error("Only store mode 0 is available with the external embedded client");RETURN_THROWS();}acquire_result(object,return_value,0);}
PHP_FUNCTION(mysqli_use_result){zval *object;if(!METHOD_PARSE("O",&object,connection_ce))RETURN_THROWS();acquire_result(object,return_value,1);}
PHP_METHOD(mysqli_result,__construct){zval *connection;zend_long mode=0;ZEND_PARSE_PARAMETERS_START(1,2)Z_PARAM_OBJECT_OF_CLASS(connection,connection_ce)Z_PARAM_OPTIONAL Z_PARAM_LONG(mode)ZEND_PARSE_PARAMETERS_END();if(mode!=0&&mode!=1){zend_value_error("Invalid result mode");RETURN_THROWS();}zval value;ZVAL_NULL(&value);acquire_result(connection,&value,mode);if(Z_TYPE(value)!=IS_OBJECT){zval_ptr_dtor(&value);zend_throw_error(NULL,"No result set is available");return;}native_result *from=RES(&value),*to=RES(ZEND_THIS);to->rows=from->rows;to->fields=from->fields;to->metadata=from->metadata;to->connection=from->connection;to->stream=from->stream;to->unbuffered=from->unbuffered;to->native_numbers=from->native_numbers;to->next=from->next;if(!Z_ISUNDEF(to->connection)){native_result **link=&CONN(&to->connection)->streams;while(*link&&*link!=from)link=&(*link)->next;if(*link)*link=to;}from->next=NULL;ZVAL_UNDEF(&from->rows);ZVAL_UNDEF(&from->fields);ZVAL_UNDEF(&from->metadata);ZVAL_UNDEF(&from->connection);from->stream=NULL;zend_update_property_long(result_ce,Z_OBJ_P(ZEND_THIS),"field_count",11,zend_hash_num_elements(Z_ARRVAL(to->fields)));zend_update_property_long(result_ce,Z_OBJ_P(ZEND_THIS),"num_rows",8,zend_hash_num_elements(Z_ARRVAL(to->rows)));zval_ptr_dtor(&value);}
PHP_FUNCTION(mysqli_get_charset){CONNECTION_ARG();MY_CHARSET_INFO charset;mysql_get_character_set_info(mysql,&charset);object_init(return_value);
 #define CS_STRING(name,field) zend_update_property_string(zend_standard_class_def,Z_OBJ_P(return_value),name,sizeof(name)-1,charset.field?charset.field:"")
 #define CS_LONG(name,field) zend_update_property_long(zend_standard_class_def,Z_OBJ_P(return_value),name,sizeof(name)-1,charset.field)
 CS_STRING("charset",csname);CS_STRING("collation",name);CS_STRING("comment",comment);CS_STRING("dir",dir);CS_LONG("min_length",mbminlen);CS_LONG("max_length",mbmaxlen);CS_LONG("number",number);CS_LONG("state",state);
 #undef CS_STRING
 #undef CS_LONG
}
PHP_FUNCTION(mysqli_options){
 zval *object,*value;zend_long option;if(!METHOD_PARSE("Olz",&object,connection_ce,&option,&value))RETURN_THROWS();ZVAL_DEREF(value);native_connection *data=CONN(object);
 if(data->mysql){zend_throw_error(NULL,"Set connection options before real_connect");RETURN_THROWS();}
 zval copy;
 if(option==MYSQL_SET_CHARSET_NAME||option==MYSQL_INIT_COMMAND){zend_string *text=zval_get_string(value);if(EG(exception))RETURN_THROWS();if(ZSTR_LEN(text)>65536||memchr(ZSTR_VAL(text),0,ZSTR_LEN(text))){zend_string_release(text);zend_value_error("Connection option must be at most 64 KiB without null bytes");RETURN_THROWS();}ZVAL_STR(&copy,text);}
 else if(option==201){data->native_numbers=zend_is_true(value);ZVAL_LONG(&copy,data->native_numbers);}
 else if(option==MYSQL_OPT_LOCAL_INFILE){if(zend_is_true(value)){unavailable("LOCAL INFILE is disabled; import through project files or SQL INSERT statements");RETURN_THROWS();}ZVAL_LONG(&copy,0);}
 else {unavailable("This connection option requires a network/mysqlnd client and is unavailable in embedded MariaDB");RETURN_THROWS();}
 if(!data->options)data->options=zend_new_array(4);zend_hash_index_update(data->options,option,&copy);RETURN_TRUE;
}
PHP_FUNCTION(mysqli_change_user){zval *object;char *user,*password,*database=NULL;size_t u,p,d=0;if(!METHOD_PARSE("Osss!",&object,connection_ce,&user,&u,&password,&p,&database,&d))RETURN_THROWS();MYSQL *mysql=require_connection(object);if(!mysql)RETURN_THROWS();
 for(native_statement *s=CONN(object)->statements;s;s=s->next)close_statement(s);
 int rc=mysql_change_user(mysql,user,password,database);connection_info(object);if(rc)sql_error(mysql,NULL);RETURN_BOOL(!rc);
}
static void error_entries(zval *output,unsigned code,const char *state,const char *message){array_init(output);if(!code)return;zval item;array_init(&item);add_assoc_long(&item,"errno",code);add_assoc_string(&item,"sqlstate",state);add_assoc_string(&item,"error",message);add_next_index_zval(output,&item);}
PHP_FUNCTION(mysqli_error_list){CONNECTION_ARG();error_entries(return_value,mysql_errno(mysql),mysql_sqlstate(mysql),mysql_error(mysql));}
PHP_FUNCTION(mysqli_stmt_error_list){STATEMENT_ARG();error_entries(return_value,mysql_stmt_errno(stmt),mysql_stmt_sqlstate(stmt),mysql_stmt_error(stmt));}
PHP_FUNCTION(mysqli_stat){CONNECTION_ARG();const char *value=mysql_stat(mysql);if(mysql_errno(mysql)){sql_error(mysql,NULL);RETURN_FALSE;}if(value&&*value)RETURN_STRING(value);
 /* The embedded client returns an empty COM_STATISTICS packet. Read actual
    server counters instead of inventing mysqlnd statistics. */
 const char *query="SHOW GLOBAL STATUS WHERE Variable_name IN ('Uptime','Threads_connected','Questions','Slow_queries','Open_tables')";
 if(pbl_mysql_query(mysql,query,strlen(query))){sql_error(mysql,NULL);RETURN_FALSE;}MYSQL_RES *rows=mysql_store_result(mysql);if(!rows){sql_error(mysql,NULL);RETURN_FALSE;}char output[1024];size_t used=0;MYSQL_ROW row;
 while((row=mysql_fetch_row(rows))&&used<sizeof(output)-1){int n=snprintf(output+used,sizeof(output)-used,"%s%s: %s",used?"  ":"",row[0]?row[0]:"",row[1]?row[1]:"");if(n<0)break;used+=((size_t)n<sizeof(output)-used)?n:sizeof(output)-used-1;}
 mysql_free_result(rows);RETURN_STRINGL(output,used);
}
PHP_FUNCTION(mysqli_dump_debug_info){CONNECTION_ARG();int rc=mysql_dump_debug_info(mysql);if(rc)sql_error(mysql,NULL);RETURN_BOOL(!rc);}
PHP_FUNCTION(mysqli_refresh){zval *object;zend_long flags;if(!METHOD_PARSE("Ol",&object,connection_ce,&flags))RETURN_THROWS();MYSQL *mysql=require_connection(object);if(!mysql)RETURN_THROWS();if(flags<0||(flags&~(REFRESH_GRANT|REFRESH_LOG|REFRESH_TABLES|REFRESH_STATUS))){unavailable("Only grant/log/table/status refresh is available in the local embedded server");RETURN_THROWS();}int rc=mysql_refresh(mysql,flags);if(rc)sql_error(mysql,NULL);RETURN_BOOL(!rc);}
PHP_FUNCTION(mysqli_kill){zval *object;zend_long id;if(!METHOD_PARSE("Ol",&object,connection_ce,&id))RETURN_THROWS();MYSQL *mysql=require_connection(object);if(!mysql)RETURN_THROWS();if(id<=0){zend_value_error("Thread id must be positive");RETURN_THROWS();}if((unsigned long)id!=mysql_thread_id(mysql)){unavailable("Killing another connection is disabled to preserve independent request owners");RETURN_THROWS();}int rc=mysql_kill(mysql,id);if(rc)sql_error(mysql,NULL);RETURN_BOOL(!rc);}
PHP_FUNCTION(mysqli_get_links_stats){ZEND_PARSE_PARAMETERS_NONE();array_init(return_value);add_assoc_long(return_value,"total",mysqli_links);add_assoc_long(return_value,"active_plinks",0);add_assoc_long(return_value,"cached_plinks",0);}
PHP_FUNCTION(mysqli_get_client_stats){ZEND_PARSE_PARAMETERS_NONE();unavailable("mysqlnd client statistics are unavailable: this runtime uses the external embedded C client");}
PHP_FUNCTION(mysqli_get_connection_stats){CONNECTION_ARG();unavailable("mysqlnd connection statistics are unavailable: use native runtime resource counters");}
PHP_FUNCTION(mysqli_debug){char *text;size_t length;ZEND_PARSE_PARAMETERS_START(1,1)Z_PARAM_STRING(text,length)ZEND_PARSE_PARAMETERS_END();unavailable("DBUG tracing is unavailable in this release build; use the local diagnostics journal");}
PHP_FUNCTION(mysqli_ssl_set){zval *object;char *key=NULL,*cert=NULL,*ca=NULL,*path=NULL,*cipher=NULL;size_t k=0,c=0,a=0,p=0,i=0;if(!METHOD_PARSE("Os!s!s!s!s!",&object,connection_ce,&key,&k,&cert,&c,&ca,&a,&path,&p,&cipher,&i))RETURN_THROWS();unavailable("TLS SQL sockets are unavailable: PHP and MariaDB communicate in the same WASM module");}
PHP_FUNCTION(mysqli_poll){zval *read,*error,*reject;zend_long seconds,microseconds=0;ZEND_PARSE_PARAMETERS_START(4,5)Z_PARAM_ARRAY_EX2(read,1,1,0)Z_PARAM_ARRAY_EX2(error,1,1,0)Z_PARAM_ARRAY_EX2(reject,0,1,0)Z_PARAM_LONG(seconds)Z_PARAM_OPTIONAL Z_PARAM_LONG(microseconds)ZEND_PARSE_PARAMETERS_END();unavailable("Async mysqlnd polling is unavailable; embedded SQL executes through the serialized project worker");}
PHP_FUNCTION(mysqli_reap_async_query){CONNECTION_ARG();unavailable("No asynchronous SQL request exists in the embedded client");}
PHP_FUNCTION(mysqli_stmt_attr_get){zval *object;zend_long attribute;if(!METHOD_PARSE("Ol",&object,statement_ce,&attribute))RETURN_THROWS();MYSQL_STMT *stmt=require_statement(object);if(!stmt)RETURN_THROWS();unsigned long number=0;my_bool flag=0;
 if(attribute!=STMT_ATTR_UPDATE_MAX_LENGTH&&attribute!=STMT_ATTR_CURSOR_TYPE&&attribute!=STMT_ATTR_PREFETCH_ROWS){zend_value_error("Invalid statement attribute");RETURN_THROWS();}if(mysql_stmt_attr_get(stmt,attribute,attribute==STMT_ATTR_UPDATE_MAX_LENGTH?(void*)&flag:(void*)&number)){sql_error(NULL,stmt);RETURN_FALSE;}RETURN_LONG(attribute==STMT_ATTR_UPDATE_MAX_LENGTH?flag:number);
}
PHP_FUNCTION(mysqli_stmt_attr_set){zval *object;zend_long attribute,value;if(!METHOD_PARSE("Oll",&object,statement_ce,&attribute,&value))RETURN_THROWS();MYSQL_STMT *stmt=require_statement(object);if(!stmt)RETURN_THROWS();
 if(attribute!=STMT_ATTR_UPDATE_MAX_LENGTH&&attribute!=STMT_ATTR_CURSOR_TYPE&&attribute!=STMT_ATTR_PREFETCH_ROWS){zend_value_error("Invalid statement attribute");RETURN_THROWS();}
 if(value<0||(attribute==STMT_ATTR_CURSOR_TYPE&&value!=CURSOR_TYPE_NO_CURSOR&&value!=CURSOR_TYPE_READ_ONLY)||(attribute==STMT_ATTR_PREFETCH_ROWS&&(value<1||value>10000))){zend_value_error("Invalid or excessive statement attribute value");RETURN_THROWS();}
 unsigned long number=value;my_bool flag=value!=0;int rc=mysql_stmt_attr_set(stmt,attribute,attribute==STMT_ATTR_UPDATE_MAX_LENGTH?(void*)&flag:(void*)&number);if(rc)sql_error(NULL,stmt);RETURN_BOOL(!rc);
}
PHP_FUNCTION(mysqli_stmt_send_long_data){zval *object;zend_long index;char *chunk;size_t length;if(!METHOD_PARSE("Ols",&object,statement_ce,&index,&chunk,&length))RETURN_THROWS();MYSQL_STMT *stmt=require_statement(object);if(!stmt)RETURN_THROWS();native_statement *data=STMT(object);
 if(index<0||(size_t)index>=data->count||data->types[index]!='b'){zend_value_error("Long data requires a bound b parameter at this index");RETURN_THROWS();}
 if(length>SQL_BYTES-data->long_bytes||length>RESULT_BYTES-long_data_reserved){zend_value_error("Long-data budget exceeded: 8 MiB per statement, 16 MiB per request");RETURN_THROWS();}
 if(!data->long_data)data->long_data=zend_new_array(4);zval *old=zend_hash_index_find(data->long_data,index);size_t previous=old?Z_STRLEN_P(old):0;zend_string *text=zend_string_alloc(previous+length,0);if(old)memcpy(ZSTR_VAL(text),Z_STRVAL_P(old),previous);memcpy(ZSTR_VAL(text)+previous,chunk,length);ZSTR_VAL(text)[previous+length]=0;zval value;ZVAL_STR(&value,text);zend_hash_index_update(data->long_data,index,&value);data->long_bytes+=length;long_data_reserved+=length;RETURN_TRUE;
}
PHP_FUNCTION(mysqli_stmt_more_results){STATEMENT_ARG();MYSQL *mysql=require_connection(&STMT(object)->connection);if(!mysql)RETURN_THROWS();RETURN_BOOL(mysql_more_results(mysql));}
PHP_FUNCTION(mysqli_stmt_next_result){STATEMENT_ARG();int rc=mysql_stmt_next_result(stmt);if(rc>0)sql_error(NULL,stmt);if(rc==0){native_statement *data=STMT(object);zval_ptr_dtor(&data->result);ZVAL_UNDEF(&data->result);zend_update_property_long(statement_ce,Z_OBJ_P(object),"field_count",11,mysql_stmt_field_count(stmt));zend_update_property_long(statement_ce,Z_OBJ_P(object),"num_rows",8,0);}RETURN_BOOL(rc==0);}
static void warning_current(zval *object,zval *row){zend_update_property_long(warning_ce,Z_OBJ_P(object),"errno",5,zval_get_long(zend_hash_index_find(Z_ARRVAL_P(row),1)));zend_update_property_string(warning_ce,Z_OBJ_P(object),"sqlstate",8,"HY000");zval *text=zend_hash_index_find(Z_ARRVAL_P(row),2);zend_update_property(warning_ce,Z_OBJ_P(object),"message",7,text);}
static void warnings_object(MYSQL *mysql,zval *output){if(!mysql_warning_count(mysql)){ZVAL_FALSE(output);return;}if(pbl_mysql_query(mysql,"SHOW WARNINGS LIMIT 64",22)){sql_error(mysql,NULL);ZVAL_FALSE(output);return;}MYSQL_RES *rows=mysql_store_result(mysql);if(!rows){ZVAL_FALSE(output);return;}zval messages;array_init(&messages);MYSQL_ROW row;while((row=mysql_fetch_row(rows))){zval item;array_init(&item);for(unsigned i=0;i<3;i++)add_next_index_string(&item,row[i]?row[i]:"");add_next_index_zval(&messages,&item);}mysql_free_result(rows);if(!zend_hash_num_elements(Z_ARRVAL(messages))){zval_ptr_dtor(&messages);ZVAL_FALSE(output);return;}object_init_ex(output,warning_ce);zend_update_property(warning_ce,Z_OBJ_P(output),"messages",8,&messages);warning_current(output,zend_hash_index_find(Z_ARRVAL(messages),0));zval_ptr_dtor(&messages);}
PHP_FUNCTION(mysqli_get_warnings){CONNECTION_ARG();warnings_object(mysql,return_value);}
PHP_FUNCTION(mysqli_stmt_get_warnings){STATEMENT_ARG();MYSQL *mysql=require_connection(&STMT(object)->connection);if(!mysql)RETURN_THROWS();warnings_object(mysql,return_value);}
PHP_METHOD(mysqli_warning,__construct){ZEND_PARSE_PARAMETERS_NONE();}
PHP_METHOD(mysqli_warning,next){ZEND_PARSE_PARAMETERS_NONE();zval rv1,rv2;zval *messages=zend_read_property(warning_ce,Z_OBJ_P(ZEND_THIS),"messages",8,0,&rv1),*position=zend_read_property(warning_ce,Z_OBJ_P(ZEND_THIS),"position",8,0,&rv2);zend_long next=zval_get_long(position)+1;if(Z_TYPE_P(messages)!=IS_ARRAY)RETURN_FALSE;zval *row=zend_hash_index_find(Z_ARRVAL_P(messages),next);if(!row)RETURN_FALSE;zend_update_property_long(warning_ce,Z_OBJ_P(ZEND_THIS),"position",8,next);warning_current(ZEND_THIS,row);RETURN_TRUE;}
#undef CONNECTION_ARG
#undef STATEMENT_ARG
#undef METHOD_PARSE
