/* DESIGN CONTRACT v0.1: declarations only; no SQL engine implemented here.
 * Pointers below are module-local and MUST NOT cross Worker/WASM memories.
 * A separate-module adapter uses length-delimited transferable frames.
 */
#ifndef PBL_SQL_H
#define PBL_SQL_H
#include <stdint.h>
#include <stddef.h>
#ifdef __cplusplus
extern "C" {
#endif

typedef struct pbl_connection pbl_connection;
typedef struct pbl_statement pbl_statement;
typedef struct pbl_cursor pbl_cursor;
typedef uint64_t pbl_owner_id; /* request owner or independent console owner */
typedef struct { const uint8_t *ptr; size_t len; } pbl_bytes;
typedef enum { PBL_NULL, PBL_TEXT, PBL_BINARY, PBL_INT64, PBL_UINT64,
               PBL_FLOAT64, PBL_DECIMAL } pbl_type;
/* Text/decimal bytes are lossless; no JS Number coercion for BIGINT/DECIMAL. */
typedef struct {
    pbl_type type;
    union { pbl_bytes bytes; int64_t i64; uint64_t u64; double f64; } value;
} pbl_value;
typedef struct { uint32_t code; char sqlstate[6]; pbl_bytes message; } pbl_error;
typedef struct { pbl_bytes name; pbl_type type; uint32_t flags; } pbl_column;
typedef struct {
    size_t row_count, column_count;
    const pbl_value *cells; /* row-major; NULL has type PBL_NULL */
    const pbl_column *columns;
    uint8_t done;
} pbl_batch;
typedef enum { PBL_OK, PBL_EOF, PBL_ERROR, PBL_CANCELLED,
               PBL_LIMIT, PBL_UNSUPPORTED } pbl_status;
typedef struct { size_t max_batch_bytes, max_batch_rows, max_cell_bytes; } pbl_limits;

/* Open must set charset and database explicitly; auth here is virtual config,
 * not a network security boundary. Out pointers valid only on PBL_OK. */
pbl_status pbl_open(pbl_owner_id owner, pbl_bytes database, pbl_bytes charset,
                    const pbl_limits *limits, pbl_connection **out, pbl_error *error);
pbl_status pbl_query(pbl_connection *, pbl_bytes sql, pbl_cursor **out, pbl_error *);
pbl_status pbl_prepare(pbl_connection *, pbl_bytes sql, pbl_statement **out, pbl_error *);
pbl_status pbl_execute(pbl_statement *, const pbl_value *params, size_t count,
                       pbl_cursor **out, pbl_error *);
pbl_status pbl_fetch(pbl_cursor *, pbl_batch *out, pbl_error *);
/* Borrowed cells/columns live until next fetch or cursor close; copy required
 * by the PHP Zend result lifetime. One oversized cell returns PBL_LIMIT. */
pbl_status pbl_next_result(pbl_cursor *, pbl_error *);
pbl_status pbl_affected_rows(pbl_connection *, uint64_t *out, pbl_error *);
pbl_status pbl_insert_id(pbl_connection *, uint64_t *out, pbl_error *);
pbl_status pbl_begin(pbl_connection *, pbl_error *);
pbl_status pbl_commit(pbl_connection *, pbl_error *);
pbl_status pbl_rollback(pbl_connection *, pbl_error *);
void pbl_cursor_close(pbl_cursor *);
void pbl_statement_close(pbl_statement *);
void pbl_connection_close(pbl_connection *);
/* Roll back uncommitted work, close cursors/statements/connections for this
 * owner only; never close SQL console sessions at PHP request shutdown. */
void pbl_owner_cleanup(pbl_owner_id);
/* Cooperative: does not permit starting another request before completion. */
void pbl_owner_cancel(pbl_owner_id);
/* Durability barrier for VFS, separate from COMMIT acknowledgement. */
pbl_status pbl_persist(pbl_error *);
/* Error message storage is backend-owned until this explicit release. */
void pbl_error_release(pbl_error *);

#ifdef __cplusplus
}
#endif
#endif
