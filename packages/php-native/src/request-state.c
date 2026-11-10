/* SPDX-License-Identifier: GPL-2.0-only */
#include "request-state.h"
#include <string.h>

int pbl_request_valid_script(const char *script)
{
    static const char prefix[] = "/workspace/";
    size_t length;
    const char *part;
    if (!script || strncmp(script, prefix, sizeof(prefix) - 1) != 0) return 0;
    length = strnlen(script, PBL_HTTP_SCRIPT_MAX + 1u);
    if (length >= PBL_HTTP_SCRIPT_MAX || length <= sizeof(prefix) - 1) return 0;
    part = script + sizeof(prefix) - 1;
    while (*part) {
        const char *end = strchr(part, '/');
        size_t size = end ? (size_t)(end - part) : strlen(part);
        if (size == 0 || (size == 1 && part[0] == '.') ||
            (size == 2 && part[0] == '.' && part[1] == '.')) return 0;
        for (size_t i = 0; i < size; ++i) {
            unsigned char c = (unsigned char)part[i];
            if (c < 0x20u || c == 0x7fu || c == '\\') return 0;
        }
        if (!end) break;
        part = end + 1;
        if (!*part) return 0;
    }
    return 1;
}

int pbl_request_begin(pbl_request_state *state, const char *script, size_t body_length)
{
    if (!state || state->active || !pbl_request_valid_script(script) ||
        body_length > PBL_HTTP_REQUEST_MAX) return -1;
    state->body_length = body_length;
    state->body_offset = 0;
    state->output_length = 0;
    state->overflow = 0;
    state->active = 1;
    ++state->sequence;
    return 0;
}

size_t pbl_request_consume(pbl_request_state *state, size_t requested)
{
    if (!state || !state->active || requested == 0) return 0;
    size_t remaining = state->body_length - state->body_offset;
    size_t consumed = requested > remaining ? remaining : requested;
    state->body_offset += consumed;
    return consumed;
}

int pbl_request_account_output(pbl_request_state *state, size_t length)
{
    if (!state || !state->active || state->overflow || state->output_length > PBL_HTTP_OUTPUT_MAX ||
        length > PBL_HTTP_OUTPUT_MAX - state->output_length) {
        if (state) state->overflow = 1;
        return -1;
    }
    state->output_length += length;
    return 0;
}

void pbl_request_end(pbl_request_state *state)
{
    if (!state) return;
    state->body_length = 0;
    state->body_offset = 0;
    state->output_length = 0;
    state->active = 0;
    state->overflow = 0;
}
