/* Browser HTTP read streams: real method/body/headers, CORS and browser rules.
 * No ordinary TCP/UDP sockets are promised. XHR hides intermediate redirects.
 */
#include <php.h>
#include <main/php_memory_streams.h>
#include <ext/standard/basic_functions.h>
#include <emscripten/fetch.h>
static int append_header(const char *line,size_t length,char **headers,unsigned *count)
{
    while(length && (line[length-1]=='\r' || line[length-1]==' ' || line[length-1]=='\t')) --length;
    if(!length) return 1;
    if(*count>=128 || length>8192 || memchr(line,0,length)) return 0;
    const char *colon=memchr(line,':',length);
    if(!colon || colon==line) return 0;
    for(const char *p=line;p<colon;p++) if(!strchr("!#$%&'*+-.^_`|~",*p) && !((*p>='0'&&*p<='9')||(*p>='A'&&*p<='Z')||(*p>='a'&&*p<='z'))) return 0;
    const char *value=colon+1; while(value<line+length && (*value==' '||*value=='\t')) ++value;
    if(memchr(value,'\r',line+length-value) || memchr(value,'\n',line+length-value)) return 0;
    headers[(*count)++]=estrndup(line,colon-line); headers[(*count)++]=estrndup(value,line+length-value); return 1;
}
static int parse_headers(zval *option,char **headers,unsigned *count)
{
    if(!option) return 1;
    if(Z_TYPE_P(option)==IS_ARRAY) {
        zval *line;
        ZEND_HASH_FOREACH_VAL(Z_ARRVAL_P(option),line) {
            if(Z_TYPE_P(line)!=IS_STRING || !append_header(Z_STRVAL_P(line),Z_STRLEN_P(line),headers,count)) return 0;
        } ZEND_HASH_FOREACH_END(); return 1;
    }
    if(Z_TYPE_P(option)!=IS_STRING || Z_STRLEN_P(option)>16384) return 0;
    const char *line=Z_STRVAL_P(option),*end=line+Z_STRLEN_P(option);
    while(line<end) {
        const char *next=memchr(line,'\n',end-line); if(!next) next=end;
        if(!append_header(line,next-line,headers,count)) return 0;
        line=next<end?next+1:end;
    }
    return 1;
}
static void response_headers(emscripten_fetch_t *fetch,zval *headers)
{
    array_init(headers);
    char status[128]; snprintf(status,sizeof(status),"HTTP/1.1 %u %s",fetch->status,fetch->statusText);
    add_next_index_string(headers,status); /* Compatibility status line; XHR does not expose wire HTTP version. */
    size_t size=emscripten_fetch_get_response_headers_length(fetch);
    if(size && size<65536) {
        char *data=emalloc(size+1); emscripten_fetch_get_response_headers(fetch,data,size+1);
        const char *line=data;
        while(*line) {
            const char *end=strchr(line,'\n'); if(!end) end=line+strlen(line);
            size_t length=end-line; if(length && line[length-1]=='\r') --length;
            if(length) add_next_index_stringl(headers,line,length);
            line=*end?end+1:end;
        }
        efree(data);
    }
}
static php_stream *browser_open(php_stream_wrapper *wrapper,const char *path,const char *mode,int options,zend_string **opened_path,php_stream_context *context STREAMS_DC)
{
    (void)opened_path;
    if((strncmp(path,"http://",7) && strncmp(path,"https://",8)) || mode[0]!='r' || strchr(mode,'+')) {
        php_stream_wrapper_log_error(wrapper,options,"Browser HTTP supports read streams only"); return NULL;
    }
    emscripten_fetch_attr_t attr; emscripten_fetch_attr_init(&attr);
    strcpy(attr.requestMethod,"GET");
    attr.attributes=EMSCRIPTEN_FETCH_LOAD_TO_MEMORY|EMSCRIPTEN_FETCH_SYNCHRONOUS|EMSCRIPTEN_FETCH_REPLACE;
    attr.timeoutMSecs=30000;
    zval *method=context?php_stream_context_get_option(context,"http","method"):NULL;
    zval *content=context?php_stream_context_get_option(context,"http","content"):NULL;
    zval *ignore=context?php_stream_context_get_option(context,"http","ignore_errors"):NULL;
    zval *timeout=context?php_stream_context_get_option(context,"http","timeout"):NULL;
    zval *header=context?php_stream_context_get_option(context,"http","header"):NULL;
    if(method && Z_TYPE_P(method)==IS_STRING) {
        if(!Z_STRLEN_P(method) || Z_STRLEN_P(method)>=sizeof(attr.requestMethod)) { php_stream_wrapper_log_error(wrapper,options,"Invalid HTTP method"); return NULL; }
        for(size_t i=0;i<Z_STRLEN_P(method);i++) if(Z_STRVAL_P(method)[i]<'A'||Z_STRVAL_P(method)[i]>'Z') { php_stream_wrapper_log_error(wrapper,options,"Invalid HTTP method"); return NULL; }
        memcpy(attr.requestMethod,Z_STRVAL_P(method),Z_STRLEN_P(method)+1);
    }
    if(timeout) { double seconds=zval_get_double(timeout); if(!(seconds>0) || seconds>180) { php_stream_wrapper_log_error(wrapper,options,"HTTP timeout must be between 0 and 180 seconds"); return NULL; } attr.timeoutMSecs=(unsigned long)(seconds*1000); if(!attr.timeoutMSecs) attr.timeoutMSecs=1; }
    if(content && Z_TYPE_P(content)==IS_STRING) {
        if(Z_STRLEN_P(content)>8u*1024u*1024u) { php_stream_wrapper_log_error(wrapper,options,"HTTP request exceeds byte limit"); return NULL; }
        attr.requestData=Z_STRVAL_P(content); attr.requestDataSize=Z_STRLEN_P(content);
    }
    char *headers[129]={0}; unsigned count=0;
    if(!parse_headers(header,headers,&count)) {
        for(unsigned i=0;i<count;i++) efree(headers[i]);
        php_stream_wrapper_log_error(wrapper,options,"Invalid or oversized HTTP headers"); return NULL;
    }
    attr.requestHeaders=(const char **)headers;
    emscripten_fetch_t *fetch=emscripten_fetch(&attr,path);
    for(unsigned i=0;i<count;i++) efree(headers[i]);
    if(!fetch) { php_stream_wrapper_log_error(wrapper,options,"Browser HTTP request could not start"); return NULL; }
    zval response; response_headers(fetch,&response);
    zval_ptr_dtor(&BG(last_http_headers)); ZVAL_COPY(&BG(last_http_headers),&response);
    php_stream *stream=NULL;
    if(fetch->numBytes>16u*1024u*1024u) php_stream_wrapper_log_error(wrapper,options,"HTTP response exceeds copy limit");
    else if(fetch->status>=200 && (fetch->status<400 || (ignore && zend_is_true(ignore)))) {
        zend_string *body=zend_string_init(fetch->data,(size_t)fetch->numBytes,0);
        stream=php_stream_memory_open(TEMP_STREAM_READONLY,body); zend_string_release(body);
        if(stream) ZVAL_COPY(&stream->wrapperdata,&response);
    } else php_stream_wrapper_log_error(wrapper,options,"Browser HTTP status %u (network and CORS failures may have status 0)",fetch->status);
    if(zend_set_local_var_str("http_response_header",sizeof("http_response_header")-1,&response,0)==FAILURE) zval_ptr_dtor(&response);
    emscripten_fetch_close(fetch); return stream;
}
static const php_stream_wrapper_ops browser_ops={ browser_open,NULL,NULL,NULL,NULL,"Browser HTTP",NULL,NULL,NULL,NULL,NULL };
static php_stream_wrapper browser_wrapper={ &browser_ops,NULL,1 };
int pbl_http_register(void)
{
    php_unregister_url_stream_wrapper("http"); php_unregister_url_stream_wrapper("https");
    if(php_register_url_stream_wrapper("http",&browser_wrapper)==FAILURE) return FAILURE;
    return php_register_url_stream_wrapper("https",&browser_wrapper);
}
