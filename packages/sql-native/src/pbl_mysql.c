/* SPDX-FileCopyrightText: 2026 Bastian Noel
 * SPDX-License-Identifier: GPL-2.0-only
 */
#include "pbl_mysql.h"
#include <stdlib.h>
#include <stdio.h>
#include <string.h>
#include <errmsg.h>
#include <emscripten.h>
#ifndef PBL_SQL_WORKER_COUNT
#define PBL_SQL_WORKER_COUNT 16
#endif
/* Browser scheduling only: SQL values still go directly through C. Populate the
 * bounded worker pool while Asyncify yields, before MariaDB waits on pthreads. */
EM_ASYNC_JS(int,pbl_prepare_sql_workers,(unsigned count),{
    if(!PThread.pblReady)PThread.pblReady=(async()=>{
        const original=PThread.getNewWorker;
        PThread.getNewWorker=function(){const worker=original.call(PThread);if(worker)PThread.pblPeak=Math.max(PThread.pblPeak||0,Object.keys(PThread.pthreads).length+1);return worker;};
        const loads=[];
        for(let i=0;i<count;i++){
            const worker=PThread.allocateUnusedWorker();
            loads.push(new Promise((resolve,reject)=>{
                const loaded=PThread.loadWasmModuleToWorker(worker),onerror=worker.onerror;
                worker.onerror=event=>{event.preventDefault();reject(Error('SQL worker could not load'));};
                loaded.then(()=>{worker.onerror=onerror;resolve();},error=>{worker.onerror=onerror;reject(error);});
            }));
        }
        let timer;
        try{await Promise.race([Promise.all(loads),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('SQL worker loading timed out')),30000);})]);}
        finally{clearTimeout(timer);}
    })();
    try{await PThread.pblReady;return 0;}
    catch(error){PThread.terminateAllThreads();console.error('SQL worker pool initialization failed:',error.message);return 1;}
});
EM_JS(unsigned,pbl_js_sql_threads_used,(void),{return Object.keys(PThread.pthreads).length;});
EM_JS(unsigned,pbl_js_sql_threads_idle,(void),{return PThread.unusedWorkers.length;});
EM_JS(unsigned,pbl_js_sql_threads_created,(void),{return PThread.nextWorkerID-1;});
EM_JS(unsigned,pbl_js_sql_threads_peak,(void),{return PThread.pblPeak||0;});
unsigned pbl_sql_threads_used(void){return pbl_js_sql_threads_used();}
unsigned pbl_sql_threads_idle(void){return pbl_js_sql_threads_idle();}
unsigned pbl_sql_threads_created(void){return pbl_js_sql_threads_created();}
unsigned pbl_sql_threads_peak(void){return pbl_js_sql_threads_peak();}

int l4m_open(void);
void l4m_close(void);
typedef struct connection_record {
    MYSQL *mysql;
    uint64_t owner;
    struct connection_record *next;
} connection_record;
static connection_record *connections;
typedef struct statement_record {
    MYSQL_STMT *statement;
    MYSQL *connection;
    size_t reserved_sql;
    struct statement_record *next;
} statement_record;
static statement_record *statements;
static unsigned statement_count;
static size_t statement_bytes;
#define PBL_STATEMENTS 128u
#define PBL_QUERY_BYTES (8u*1024u*1024u)
#define PBL_PREPARED_BYTES (16u*1024u*1024u)
unsigned pbl_mysql_statement_count(void) { return statement_count; }
size_t pbl_mysql_statement_bytes(void) { return statement_bytes; }
static int policy_error(MYSQL *mysql,MYSQL_STMT *statement,const char *message)
{
    if(mysql){mysql->net.last_errno=CR_OUT_OF_MEMORY;snprintf(mysql->net.last_error,sizeof(mysql->net.last_error),"%s",message);memcpy(mysql->net.sqlstate,"HY001",6);}
    if(statement){statement->last_errno=CR_OUT_OF_MEMORY;snprintf(statement->last_error,sizeof(statement->last_error),"%s",message);memcpy(statement->sqlstate,"HY001",6);}
    return 1;
}
MYSQL_STMT *pbl_stmt_init(MYSQL *mysql)
{
    if(statement_count>=PBL_STATEMENTS){policy_error(mysql,NULL,"Native prepared statement count limit reached (128)");return NULL;}
    statement_record *record=calloc(1,sizeof(*record));
    if(!record){policy_error(mysql,NULL,"Native prepared statement registry allocation failed");return NULL;}
    MYSQL_STMT *statement=mysql_stmt_init(mysql);
    if(!statement){free(record);return NULL;}
    record->statement=statement;record->connection=mysql;record->next=statements;statements=record;++statement_count;
    return statement;
}
int pbl_stmt_prepare(MYSQL_STMT *statement,const char *sql,unsigned long length)
{
    statement_record *record=statements;
    while(record&&record->statement!=statement)record=record->next;
    if(!record)return policy_error(NULL,statement,"Native prepared statement is not registered");
    if(length>PBL_QUERY_BYTES)return policy_error(record->connection,statement,"Native SQL exceeds request byte limit (8 MiB)");
    size_t remaining=statement_bytes-record->reserved_sql;
    if(length>PBL_PREPARED_BYTES-remaining)return policy_error(record->connection,statement,"Native prepared SQL byte budget exceeded (16 MiB)");
    int failed=mysql_stmt_prepare(statement,sql,length);
    /* Conservatively retain the larger reservation on a failed reprepare.
     * A successful smaller prepare or close releases it; no uncertain partial
     * native/server allocation is reported as freed merely because prepare failed. */
    size_t reserved=failed&&record->reserved_sql>length?record->reserved_sql:length;
    statement_bytes=remaining+reserved;record->reserved_sql=reserved;
    return failed;
}
my_bool pbl_stmt_close(MYSQL_STMT *statement)
{
    statement_record **link=&statements;
    while(*link){statement_record *record=*link;if(record->statement==statement){*link=record->next;statement_bytes-=record->reserved_sql;--statement_count;free(record);return mysql_stmt_close(statement);}link=&record->next;}
    return 1;
}
int pbl_mysql_query(MYSQL *mysql,const char *sql,unsigned long length)
{
    if(length>PBL_QUERY_BYTES)return policy_error(mysql,NULL,"Native SQL exceeds request byte limit (8 MiB)");
    return mysql_real_query(mysql,sql,length);
}
static uint64_t owner_counter, current_owner;
static int started,phase;
static const char *initialization_error="Embedded SQL initialization, allocation or connection limit failure";
int pbl_mysql_phase(void) { return phase; } /* 0 dormant, 1 running, 2 stopped, 3 failed */
const char *pbl_mysql_last_error(void) {
    if(phase==2) return "SQL is stopped; save the project and create a fresh runtime before using SQL";
    if(phase==3) return "SQL initialization failed; create a fresh runtime; the previous persistent snapshot was not overwritten";
    return initialization_error;
}

uint64_t pbl_mysql_owner_begin(void) { current_owner = ++owner_counter; return current_owner; }
uint64_t pbl_mysql_owner_current(void) { return current_owner; }
int pbl_mysql_started(void) { return started; }
unsigned pbl_mysql_connection_count(void)
{
    unsigned count = 0;
    for (connection_record *c = connections; c; c = c->next) ++count;
    return count;
}
MYSQL *pbl_mysql_init_owner(uint64_t owner)
{
    if(phase>=2) return NULL;
    if (pbl_mysql_connection_count() >= 32) {initialization_error="Native SQL caller connection limit reached";return NULL;}
    if (!started) {
        if(pbl_prepare_sql_workers(PBL_SQL_WORKER_COUNT)!=0){phase=3;return NULL;}
        if (l4m_open() != 0) {phase=3;return NULL;}
        started = 1;phase=1;
    }
    connection_record *record = calloc(1, sizeof(*record));
    if (!record) return NULL;
    MYSQL *mysql = mysql_init(NULL);
    if (!mysql) { free(record); return NULL; }
    if (mysql_options(mysql, MYSQL_OPT_USE_EMBEDDED_CONNECTION, NULL) != 0) {
        mysql_close(mysql); free(record); return NULL;
    }
    record->mysql = mysql;
    record->owner = owner;
    record->next = connections;
    connections = record;
    return mysql;
}
MYSQL *pbl_mysql_init(MYSQL *unused) { (void)unused; return pbl_mysql_init_owner(current_owner); }
void pbl_mysql_close(MYSQL *mysql)
{
    connection_record **link = &connections;
    while (*link) {
        connection_record *record = *link;
        if (record->mysql == mysql) {
            *link = record->next;
            statement_record *statement=statements;
            while(statement){statement_record *next=statement->next;if(statement->connection==mysql)pbl_stmt_close(statement->statement);statement=next;}
            /* Release only this connection's transaction, not the SQL console. */
            mysql_rollback(mysql);
            mysql_close(mysql);
            free(record);
            return;
        }
        link = &record->next;
    }
}
void pbl_mysql_owner_cleanup(uint64_t owner)
{
    connection_record *record = connections;
    while (record) {
        connection_record *next = record->next;
        if (record->owner == owner) pbl_mysql_close(record->mysql);
        record = next;
    }
}
int pbl_mysql_stop(void)
{
    if (connections) return -1;
    if(phase==3)return -2;
    if (started) { l4m_close(); started = 0;phase=2; }
    return 0;
}
