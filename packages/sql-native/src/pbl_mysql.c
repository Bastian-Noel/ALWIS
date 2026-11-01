#include "pbl_mysql.h"
#include <stdlib.h>

int l4m_open(void);
void l4m_close(void);
typedef struct connection_record {
    MYSQL *mysql;
    uint64_t owner;
    struct connection_record *next;
} connection_record;
static connection_record *connections;
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
