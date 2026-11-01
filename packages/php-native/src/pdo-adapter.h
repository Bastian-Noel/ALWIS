#ifndef PBL_PDO_ADAPTER_H
#define PBL_PDO_ADAPTER_H
#include "pbl_mysql.h"
/* Stock PHP PDO MySQL external-client code, linked to the embedded server.
 * Its per-request object destructors return connections through this registry.
 * Connection and statement ownership/budgets are redirected; SQL stays native C.
 */
#define mysql_init pbl_mysql_init
#define mysql_close pbl_mysql_close
#define mysql_stmt_init pbl_stmt_init
#define mysql_stmt_prepare pbl_stmt_prepare
#define mysql_stmt_close pbl_stmt_close
#define mysql_real_query pbl_mysql_query
#endif
