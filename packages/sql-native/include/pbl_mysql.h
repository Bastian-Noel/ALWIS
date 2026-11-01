#ifndef PBL_MYSQL_H
#define PBL_MYSQL_H
#include <mysql.h>
#include <stdint.h>
/* Shared direct-C connection boundary for PHP PDO/MySQLi and the SQL console.
 * Call owner_cleanup AFTER PHP request destructors, never before them.
 * Runtime calls are serialized on the owner thread; SQL pthreads stay internal.
 */
uint64_t pbl_mysql_owner_begin(void);
uint64_t pbl_mysql_owner_current(void);
MYSQL *pbl_mysql_init(MYSQL *unused);
void pbl_mysql_close(MYSQL *connection);
void pbl_mysql_owner_cleanup(uint64_t owner);
int pbl_mysql_started(void);
int pbl_mysql_phase(void);
const char *pbl_mysql_last_error(void);
int pbl_mysql_stop(void); /* Refuses while live caller connections remain. */
unsigned pbl_mysql_connection_count(void);
MYSQL_STMT *pbl_stmt_init(MYSQL *connection);
int pbl_stmt_prepare(MYSQL_STMT *statement,const char *sql,unsigned long length);
my_bool pbl_stmt_close(MYSQL_STMT *statement);
int pbl_mysql_query(MYSQL *connection,const char *sql,unsigned long length);
unsigned pbl_mysql_statement_count(void);
size_t pbl_mysql_statement_bytes(void);
#endif
