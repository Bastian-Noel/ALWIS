/* PHP http/https read streams backed by browser HTTP, not fake POSIX sockets.
 * Browser CORS/redirect/credential rules apply. Arbitrary TCP/UDP is not provided.
 */
#include <php.h>
#include <main/php_memory_streams.h>
#include <emscripten/fetch.h>
static php_stream *browser_open(php_stream_wrapper *wrapper,const char *path,const char *mode,int options,zend_string **opened_path,php_stream_context *context STREAMS_DC)
{
    (void)wrapper; (void)opened_path;
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
    if(method && Z_TYPE_P(method)==IS_STRING) {
        if(!Z_STRLEN_P(method) || Z_STRLEN_P(method)>=sizeof(attr.requestMethod)) { php_stream_wrapper_log_error(wrapper,options,"Invalid HTTP method"); return NULL; }
        memcpy(attr.requestMethod,Z_STRVAL_P(method),Z_STRLEN_P(method)+1);
    }
    if(content && Z_TYPE_P(content)==IS_STRING) {
        if(Z_STRLEN_P(content)>8u*1024u*1024u) { php_stream_wrapper_log_error(wrapper,options,"HTTP request exceeds byte limit"); return NULL; }
        attr.requestData=Z_STRVAL_P(content); attr.requestDataSize=Z_STRLEN_P(content);
    }
    emscripten_fetch_t *fetch=emscripten_fetch(&attr,path);
    if(!fetch) { php_stream_wrapper_log_error(wrapper,options,"Browser HTTP request could not start"); return NULL; }
    php_stream *stream=NULL;
    if(fetch->numBytes>16u*1024u*1024u) php_stream_wrapper_log_error(wrapper,options,"HTTP response exceeds copy limit");
    else if(fetch->status>=200 && (fetch->status<400 || (ignore && zend_is_true(ignore)))) {
        zend_string *body=zend_string_init(fetch->data,(size_t)fetch->numBytes,0);
        stream=php_stream_memory_open(TEMP_STREAM_READONLY,body);
        zend_string_release(body);
    } else php_stream_wrapper_log_error(wrapper,options,"Browser HTTP status %u (network and CORS failures may have status 0)",fetch->status);
    emscripten_fetch_close(fetch);
    return stream;
}
static const php_stream_wrapper_ops browser_ops={ browser_open,NULL,NULL,NULL,NULL,"Browser HTTP",NULL,NULL,NULL,NULL,NULL };
static php_stream_wrapper browser_wrapper={ &browser_ops,NULL,1 };
int pbl_http_register(void)
{
    php_unregister_url_stream_wrapper("http");
    php_unregister_url_stream_wrapper("https");
    if(php_register_url_stream_wrapper("http",&browser_wrapper)==FAILURE) return FAILURE;
    return php_register_url_stream_wrapper("https",&browser_wrapper);
}
