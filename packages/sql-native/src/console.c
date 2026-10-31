/* Independent native SQL-console owner. Binary, length-delimited PBL1 frames.
 * Query/result bytes never cross a JSON/base64 SQL bridge.
 */
#include "pbl_mysql.h"
#include <stdlib.h>
#include <stdint.h>
#include <string.h>
#include <stdio.h>
#include <emscripten.h>
#define FRAME_LIMIT (16u*1024u*1024u)
static MYSQL *console;
static char error_text[512], error_state[6];
static unsigned error_code, frame_length;
static uint8_t *frame;
static size_t used, capacity;
MYSQL *pbl_mysql_init_owner(uint64_t owner);
static int fail(const char *message,unsigned code,const char *state)
{
    snprintf(error_text,sizeof(error_text),"%s",message); error_code=code;
    snprintf(error_state,sizeof(error_state),"%.5s",state?state:"HY000");
    if(frame) free(frame); frame=NULL; used=capacity=frame_length=0; return 0;
}
EMSCRIPTEN_KEEPALIVE int pbl_console_open(const char *database)
{
    if(!console) {
        console=pbl_mysql_init_owner(0);
        if(!console) return fail("Embedded console initialization/limit failure",2002,"HY000");
        if(!mysql_real_connect(console,NULL,"root","",NULL,0,NULL,0)) {
            fail(mysql_error(console),mysql_errno(console),mysql_sqlstate(console)); pbl_mysql_close(console); console=NULL; return 0;
        }
        mysql_set_character_set(console,"utf8mb4");
    }
    if(database && database[0] && mysql_select_db(console,database)) return fail(mysql_error(console),mysql_errno(console),mysql_sqlstate(console));
    error_code=0; error_text[0]=0; return 1;
}
EMSCRIPTEN_KEEPALIVE void pbl_console_close(void) { if(console) { pbl_mysql_close(console); console=NULL; } }
EMSCRIPTEN_KEEPALIVE const char *pbl_console_error(void) { return error_text; }
EMSCRIPTEN_KEEPALIVE const char *pbl_console_sqlstate(void) { return error_state; }
EMSCRIPTEN_KEEPALIVE unsigned pbl_console_errno(void) { return error_code; }
EMSCRIPTEN_KEEPALIVE unsigned pbl_console_length(void) { return frame_length; }
static int append(const void *bytes,size_t length)
{
    if(length>FRAME_LIMIT-used) return 0;
    if(used+length>capacity) {
        size_t next=capacity?capacity*2:4096; if(next<used+length) next=used+length; if(next>FRAME_LIMIT) next=FRAME_LIMIT;
        void *allocation=realloc(frame,next); if(!allocation) return 0; frame=allocation; capacity=next;
    }
    memcpy(frame+used,bytes,length); used+=length; return 1;
}
static int u32(uint32_t value)
{
    uint8_t bytes[]={value&255,(value>>8)&255,(value>>16)&255,(value>>24)&255}; return append(bytes,4);
}
static void set32(size_t offset,uint32_t value) { for(unsigned i=0;i<4;i++) frame[offset+i]=(uint8_t)(value>>(i*8)); }
static unsigned field_kind(MYSQL_FIELD *field)
{
    switch(field->type) {
        case MYSQL_TYPE_BIT: case MYSQL_TYPE_GEOMETRY:return 2;
        case MYSQL_TYPE_TINY_BLOB: case MYSQL_TYPE_MEDIUM_BLOB: case MYSQL_TYPE_LONG_BLOB: case MYSQL_TYPE_BLOB:
        case MYSQL_TYPE_STRING: case MYSQL_TYPE_VAR_STRING: case MYSQL_TYPE_VARCHAR:return field->charsetnr==63?2:1;
        case MYSQL_TYPE_DECIMAL: case MYSQL_TYPE_NEWDECIMAL:return 4;
        case MYSQL_TYPE_TINY: case MYSQL_TYPE_SHORT: case MYSQL_TYPE_LONG: case MYSQL_TYPE_LONGLONG: case MYSQL_TYPE_INT24:return 3;
        case MYSQL_TYPE_FLOAT: case MYSQL_TYPE_DOUBLE:return 5;
        default:return 1;
    }
}
EMSCRIPTEN_KEEPALIVE uint8_t *pbl_console_query(const char *sql,size_t length)
{
    error_code=0; error_text[0]=0; error_state[0]=0; frame=NULL; used=capacity=frame_length=0;
    if(!console) { fail("Console is closed",2006,"HY000"); return NULL; }
    if(length>8u*1024u*1024u) { fail("SQL request exceeds byte limit",0,"HY001"); return NULL; }
    if(mysql_real_query(console,sql,length)) { fail(mysql_error(console),mysql_errno(console),mysql_sqlstate(console)); return NULL; }
    MYSQL_RES *result=mysql_store_result(console);
    if(!result && mysql_field_count(console)) { fail(mysql_error(console),mysql_errno(console),mysql_sqlstate(console)); return NULL; }
    unsigned columns=result?mysql_num_fields(result):0, rows=0;
    my_ulonglong affected=mysql_affected_rows(console), id=mysql_insert_id(console);
    if(affected==(my_ulonglong)-1) affected=0;
    if(columns>1024 || !u32(0x314c4250) || !u32(columns) || !u32(0) || !u32(affected) || !u32(affected>>32) || !u32(id) || !u32(id>>32) || !u32(0)) goto limit;
    if(result) {
        MYSQL_FIELD *fields=mysql_fetch_fields(result);
        for(unsigned i=0;i<columns;i++) if(!u32(field_kind(&fields[i])) || !u32(fields[i].type) || !u32(fields[i].flags) || !u32(fields[i].name_length) || !append(fields[i].name,fields[i].name_length)) goto limit;
        MYSQL_ROW row;
        while((row=mysql_fetch_row(result))) {
            if(rows>=10000) goto limit;
            unsigned long *lengths=mysql_fetch_lengths(result);
            for(unsigned i=0;i<columns;i++) {
                if(!u32(row[i]?lengths[i]:UINT32_MAX) || (row[i] && !append(row[i],lengths[i]))) goto limit;
            }
            ++rows;
        }
        mysql_free_result(result);
    }
    set32(8,rows); set32(28,(uint32_t)used); frame_length=(unsigned)used;
    uint8_t *output=frame; frame=NULL; return output;
limit:
    if(result) mysql_free_result(result);
    fail("Console result frame exceeds row/byte limit",0,"HY001"); return NULL;
}
