/* SPDX-FileCopyrightText: 2026 Bastian Noel
 * SPDX-License-Identifier: GPL-2.0-only
 */
/* Browser HTTP read streams: real method/body/headers, CORS and browser rules.
 * No ordinary TCP/UDP sockets are promised. Fetch hides intermediate redirects.
 */
#include <php.h>
#include <main/php_memory_streams.h>
#include <ext/standard/basic_functions.h>
#include <emscripten.h>
#include <stdint.h>
#include <stdlib.h>
/* Only browser networking crosses JS. SQL continues to call the C server directly.
 * Asyncify suspends PHP while Fetch streams into at most 256 owned 64 KiB blocks.
 * Frame: status, header bytes, body bytes, error bytes (four uint32_t), then data.
 */
EM_ASYNC_JS(unsigned char *,pbl_browser_fetch,(const char *url_ptr,const char *method_ptr,const char **header_ptr,const char *body_ptr,unsigned body_size,unsigned timeout_ms,int follow_location),{
    const maxBody=16*1024*1024,blockSize=65536,encoder=new TextEncoder();
    const controller=new AbortController();
    let timedOut=false,canceled=false,reader=null,blocks=[],length=0,status=0,headerBytes=new Uint8Array(),errorBytes=new Uint8Array();
    const abort=()=>{canceled=true;controller.abort();};
    const context=Module.phpWasm;
    if(context)context.pendingFetchAbort=abort;
    const timer=setTimeout(()=>{timedOut=true;controller.abort();},timeout_ms);
    try {
        const headers=new Headers();
        for(let i=0;HEAPU32[(header_ptr>>2)+i];i+=2)headers.append(UTF8ToString(HEAPU32[(header_ptr>>2)+i]),UTF8ToString(HEAPU32[(header_ptr>>2)+i+1]));
        const method=UTF8ToString(method_ptr);
        const response=await fetch(UTF8ToString(url_ptr),{method,headers,
            body:body_size?HEAPU8.slice(body_ptr,body_ptr+body_size):undefined,
            credentials:'same-origin',redirect:follow_location?'follow':'error',signal:controller.signal});
        status=response.status;
        // Browsers expose the final response headers, not the wire HTTP version.
        let headerText='HTTP/1.1 '+status+' '+response.statusText+'\n';
        for(const [name,value] of response.headers){
            headerText+=name+': '+value+'\n';
            if(headerText.length>65535)throw Error('HTTP response headers exceed byte limit');
        }
        headerBytes=encoder.encode(headerText);
        if(headerBytes.length>65535)throw Error('HTTP response headers exceed byte limit');
        const advertised=response.headers.get('content-length');
        if(method!=='HEAD'&&advertised!==null&&Number(advertised)>maxBody)throw Error('HTTP response exceeds byte limit');
        if(response.body){
            reader=response.body.getReader();
            for(;;){
                const part=await reader.read();if(part.done)break;
                if(part.value.byteLength>maxBody-length)throw Error('HTTP response exceeds byte limit');
                let offset=0;
                while(offset<part.value.byteLength){
                    const inBlock=length%blockSize;
                    if(inBlock===0)blocks.push(new Uint8Array(blockSize));
                    const size=Math.min(blockSize-inBlock,part.value.byteLength-offset);
                    blocks[blocks.length-1].set(part.value.subarray(offset,offset+size),inBlock);
                    length+=size;offset+=size;
                }
            }
        }
    } catch(error){
        controller.abort();blocks=[];length=0;
        errorBytes=encoder.encode(timedOut?'HTTP request timed out':canceled?'HTTP request canceled':String(error.message??error).slice(0,512));
    } finally {
        clearTimeout(timer);
        if(context?.pendingFetchAbort===abort)delete context.pendingFetchAbort;
        if(reader)reader.releaseLock();
    }
    const frame=_malloc(16+headerBytes.length+length+errorBytes.length);
    if(!frame)return 0;
    HEAPU32.set([status,headerBytes.length,length,errorBytes.length],frame>>2);
    let offset=frame+16;HEAPU8.set(headerBytes,offset);offset+=headerBytes.length;
    for(const block of blocks){const size=Math.min(blockSize,frame+16+headerBytes.length+length-offset);HEAPU8.set(block.subarray(0,size),offset);offset+=size;}
    HEAPU8.set(errorBytes,offset);return frame;
});
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
static void response_headers(const char *data,size_t size,zval *headers)
{
    array_init(headers);
    const char *line=data,*limit=data+size;
    while(line<limit) {
        const char *end=memchr(line,'\n',limit-line); if(!end) end=limit;
        size_t length=end-line; if(length && line[length-1]=='\r') --length;
        if(length) add_next_index_stringl(headers,line,length);
        line=end<limit?end+1:end;
    }
}
static php_stream *browser_open(php_stream_wrapper *wrapper,const char *path,const char *mode,int options,zend_string **opened_path,php_stream_context *context STREAMS_DC)
{
    (void)opened_path;
    if((strncmp(path,"http://",7) && strncmp(path,"https://",8)) || mode[0]!='r' || strchr(mode,'+')) {
        php_stream_wrapper_log_error(wrapper,options,"Browser HTTP supports read streams only"); return NULL;
    }
    char request_method[32]="GET";
    unsigned timeout_ms=30000;
    const char *request_body=NULL;unsigned request_size=0;
    zval *method=context?php_stream_context_get_option(context,"http","method"):NULL;
    zval *content=context?php_stream_context_get_option(context,"http","content"):NULL;
    zval *ignore=context?php_stream_context_get_option(context,"http","ignore_errors"):NULL;
    zval *timeout=context?php_stream_context_get_option(context,"http","timeout"):NULL;
    zval *header=context?php_stream_context_get_option(context,"http","header"):NULL;
    zval *redirect=context?php_stream_context_get_option(context,"http","follow_location"):NULL;
    int follow_location=redirect?zend_is_true(redirect):1;
    if(method && Z_TYPE_P(method)==IS_STRING) {
        if(!Z_STRLEN_P(method) || Z_STRLEN_P(method)>=sizeof(request_method)) { php_stream_wrapper_log_error(wrapper,options,"Invalid HTTP method"); return NULL; }
        for(size_t i=0;i<Z_STRLEN_P(method);i++) if(Z_STRVAL_P(method)[i]<'A'||Z_STRVAL_P(method)[i]>'Z') { php_stream_wrapper_log_error(wrapper,options,"Invalid HTTP method"); return NULL; }
        memcpy(request_method,Z_STRVAL_P(method),Z_STRLEN_P(method)+1);
    }
    if(timeout) { double seconds=zval_get_double(timeout); if(!(seconds>0) || seconds>180) { php_stream_wrapper_log_error(wrapper,options,"HTTP timeout must be between 0 and 180 seconds"); return NULL; } timeout_ms=(unsigned)(seconds*1000); if(!timeout_ms) timeout_ms=1; }
    if(content && Z_TYPE_P(content)==IS_STRING) {
        if(Z_STRLEN_P(content)>8u*1024u*1024u) { php_stream_wrapper_log_error(wrapper,options,"HTTP request exceeds byte limit"); return NULL; }
        request_body=Z_STRVAL_P(content); request_size=Z_STRLEN_P(content);
    }
    char *headers[129]={0}; unsigned count=0;
    if(!parse_headers(header,headers,&count)) {
        for(unsigned i=0;i<count;i++) efree(headers[i]);
        php_stream_wrapper_log_error(wrapper,options,"Invalid or oversized HTTP headers"); return NULL;
    }
    unsigned char *frame=pbl_browser_fetch(path,request_method,(const char **)headers,request_body,request_size,timeout_ms,follow_location);
    for(unsigned i=0;i<count;i++) efree(headers[i]);
    if(!frame) { php_stream_wrapper_log_error(wrapper,options,"Browser HTTP response allocation failed"); return NULL; }
    const uint32_t *info=(const uint32_t *)frame;
    unsigned status=info[0],header_size=info[1],body_size=info[2],error_size=info[3];
    const char *body=(const char *)frame+16+header_size;
    zval response; response_headers((const char *)frame+16,header_size,&response);
    zval_ptr_dtor(&BG(last_http_headers)); ZVAL_COPY(&BG(last_http_headers),&response);
    php_stream *stream=NULL;
    if(error_size) php_stream_wrapper_log_error(wrapper,options,"Browser HTTP: %.*s",(int)error_size,body+body_size);
    else if(status>=200 && (status<400 || (ignore && zend_is_true(ignore)))) {
        zend_string *data=zend_string_init(body,body_size,0);
        stream=php_stream_memory_open(TEMP_STREAM_READONLY,data); zend_string_release(data);
        if(stream) ZVAL_COPY(&stream->wrapperdata,&response);
    } else php_stream_wrapper_log_error(wrapper,options,"Browser HTTP status %u (network and CORS failures may have status 0)",status);
    if(zend_set_local_var_str("http_response_header",sizeof("http_response_header")-1,&response,0)==FAILURE) zval_ptr_dtor(&response);
    free(frame); return stream;
}
static const php_stream_wrapper_ops browser_ops={ browser_open,NULL,NULL,NULL,NULL,"Browser HTTP",NULL,NULL,NULL,NULL,NULL };
static php_stream_wrapper browser_wrapper={ &browser_ops,NULL,1 };
int pbl_http_register(void)
{
    php_unregister_url_stream_wrapper("http"); php_unregister_url_stream_wrapper("https");
    if(php_register_url_stream_wrapper("http",&browser_wrapper)==FAILURE) return FAILURE;
    return php_register_url_stream_wrapper("https",&browser_wrapper);
}
