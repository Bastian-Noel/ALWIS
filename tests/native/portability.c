#include <assert.h>
#include <limits.h>
#include <unistd.h>
#include <stdio.h>
int getdtablesize(void);
int main(void)
{
    int limit = getdtablesize();
    assert(limit > 0 && limit <= INT_MAX);
#ifdef _SC_OPEN_MAX
    long expected = sysconf(_SC_OPEN_MAX);
    if (expected > 0 && expected <= INT_MAX) assert(limit == (int)expected);
#endif
    puts("ALWIS getdtablesize portability passed");
    return 0;
}
