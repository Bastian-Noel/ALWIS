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
int pbl_mysql_stop(void); /* Refuses while live caller connections remain. */
unsigned pbl_mysql_connection_count(void);
#endif
