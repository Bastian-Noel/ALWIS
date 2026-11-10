/*
 * ALWIS Emscripten/PHP 8.4 portability hooks.
 * SPDX-License-Identifier: GPL-2.0-only
 *
 * The browser's libc in Emscripten 6.0.6 does not export getdtablesize().
 * PHP's php://fd/ handler checks this value only for CLI SAPI, which ALWIS
 * does not use; still supply POSIX-compatible bounds rather than disable an
 * unrelated PHP source file or enable linker undefined symbols.
 */
#ifdef __EMSCRIPTEN__
#include <limits.h>
#include <unistd.h>

__attribute__((weak)) int getdtablesize(void)
{
#ifdef _SC_OPEN_MAX
    long maximum = sysconf(_SC_OPEN_MAX);
    if (maximum > 0 && maximum <= INT_MAX) return (int)maximum;
#endif
    return 1024;
}
#endif
