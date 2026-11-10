#include "../../packages/php-native/src/request-state.h"
#include <assert.h>
#include <stdint.h>
#include <stdio.h>
#include <string.h>

int main(void)
{
    pbl_request_state state = {0};
    assert(pbl_request_valid_script("/workspace/index.php"));
    assert(pbl_request_valid_script("/workspace/nested/file.php"));
    assert(!pbl_request_valid_script("/workspace/"));
    assert(!pbl_request_valid_script("/workspace/../config.php"));
    assert(!pbl_request_valid_script("/workspace/./index.php"));
    assert(!pbl_request_valid_script("/workspace/a//index.php"));
    assert(!pbl_request_valid_script("/workspace/a/"));
    assert(!pbl_request_valid_script("/workspace/escape\\.php"));
    assert(!pbl_request_valid_script("/other/index.php"));
    assert(!pbl_request_valid_script("/workspace/a\n.php"));
    assert(!pbl_request_begin(&state, "/workspace/index.php", 5));
    assert(state.active && state.sequence == 1);
    assert(pbl_request_available(&state, 2) == 2);
    assert(state.body_offset == 0); /* A failed host copy cannot consume bytes. */
    assert(pbl_request_available(&state, SIZE_MAX) == 5);
    assert(pbl_request_begin(&state, "/workspace/second.php", 3) < 0);
    const unsigned char binary[] = {0x00, 0x7f, 0x80, 0xff, 0x0a};
    unsigned char result[5];
    size_t position = 0;
    while (position < sizeof(result)) {
        const size_t step = pbl_request_consume(&state, 2);
        memcpy(result + position, binary + position, step);
        position += step;
    }
    assert(!memcmp(binary, result, sizeof(binary)));
    assert(pbl_request_consume(&state, 100) == 0);
    assert(pbl_request_available(&state, 100) == 0);
    assert(!pbl_request_account_output(&state, PBL_HTTP_OUTPUT_MAX - 1));
    assert(pbl_request_account_output(&state, 2) < 0);
    assert(pbl_request_available(&state, 1) == 0);
    assert(pbl_request_consume(&state, 1) == 0);
    assert(pbl_request_account_output(&state, 0) < 0);
    pbl_request_end(&state);
    assert(!state.active && !state.overflow && !state.body_offset);
    assert(pbl_request_begin(&state, "/workspace/file.php", PBL_HTTP_REQUEST_MAX + 1u) < 0);
    assert(!pbl_request_begin(&state, "/workspace/file.php", 0));
    assert(state.sequence == 2);
    assert(!pbl_request_account_output(&state, 0));
    assert(pbl_request_consume(&state, 1) == 0);
    pbl_request_end(&state);
    puts("ALWIS native HTTP request state: passed");
    return 0;
}
