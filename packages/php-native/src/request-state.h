/* SPDX-License-Identifier: GPL-2.0-only
 * ALWIS-owned request accounting; no PHP/JoomEngine ABI assumptions. */
#ifndef PBL_PHP_REQUEST_STATE_H
#define PBL_PHP_REQUEST_STATE_H
#include <stddef.h>
#include <stdint.h>

#define PBL_HTTP_REQUEST_MAX (8u * 1024u * 1024u)
#define PBL_HTTP_OUTPUT_MAX (8u * 1024u * 1024u)
#define PBL_HTTP_SCRIPT_MAX 4096u

typedef struct {
    size_t body_length;
    size_t body_offset;
    size_t output_length;
    uint64_t sequence;
    unsigned active;
    unsigned overflow;
} pbl_request_state;

/* Returns 0 on success. No new request may start until end() has been called. */
int pbl_request_begin(pbl_request_state *state, const char *script, size_t body_length);
/* Bounded read accounting: caller copies the returned byte count from the host. */
size_t pbl_request_consume(pbl_request_state *state, size_t requested);
/* Rejects over-limit output WITHOUT unsigned arithmetic overflow. */
int pbl_request_account_output(pbl_request_state *state, size_t length);
/* Always resets offsets, even after a failed/abandoned request. */
void pbl_request_end(pbl_request_state *state);
int pbl_request_valid_script(const char *script);
#endif
