#ifndef PBL_PDO_ADAPTER_H
#define PBL_PDO_ADAPTER_H
#include "pbl_mysql.h"
/* Stock PHP PDO MySQL external-client code, linked to the embedded server.
 * Its per-request object destructors return connections through this registry.
 * Only connection allocation/teardown is redirected; SQL stays native C.
 */
#define mysql_init pbl_mysql_init
#define mysql_close pbl_mysql_close
#endif
