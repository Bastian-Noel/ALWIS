# Native SQL boundary

Implemented now: `src/pbl_mysql.c` provides the shared embedded connection registry, lazy startup, request owners, rollback/close and SQL-stop admission used by the native PDO and MySQLi adapters. `src/console.c` adds an independent console connection with typed, length-delimited binary PBL1 result frames; 64-bit numeric text and binary cells are not coerced through JavaScript numbers or JSON/base64.

The console owns connection ID 0 independently of PHP request owners. Its session marker survives requests from both PHP drivers. Closing a request does not reset the SQL server or invalidate the console. Closing the console rolls back its uncommitted transaction.

`include/pbl_sql.h` remains the broader design contract for future cursor/batch integration; it is not presented as fully implemented. The current adapters use the embedded MySQL C API through `include/pbl_mysql.h`. See `packages/php-native/README.md` for the working surface and remaining compatibility/peak-memory limits.

Real browser integration receipts are under `engine/fusion/receipts/native-runtime/`. The target is `pbl-runtime`, built using `PBL_TARGET=pbl-runtime bash engine/native/build/build.sh` with the documented pinned prerequisites.
