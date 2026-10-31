/* Atomic project writes over the common POSIX filesystem used by PHP/MariaDB.
 * fsync here is NOT a promise of IndexedDB/OPFS durability; JS must sync the VFS.
 */
#include <sys/stat.h>
#include <fcntl.h>
#include <unistd.h>
#include <errno.h>
#include <string.h>
#include <stdio.h>
#include <stdint.h>
#include <limits.h>
#include <stdlib.h>
#include <emscripten.h>
static unsigned serial;
static int project_path(const char *path)
{
    if(!path || strncmp(path,"/workspace/",11) || !path[11] || strlen(path)>4000) return 0;
    const char *segment=path;
    while(*segment) {
        while(*segment=='/') ++segment;
        const char *end=strchr(segment,'/'); size_t n=end?(size_t)(end-segment):strlen(segment);
        if(n==2 && segment[0]=='.' && segment[1]=='.') return 0;
        if(!end) break; segment=end;
    }
    return 1;
}
static int parents(const char *path)
{
    char copy[4096]; strcpy(copy,path);
    for(char *p=copy+1;*p;p++) if(*p=='/') {
        *p=0; struct stat info;
        if(lstat(copy,&info)==0) { if(S_ISLNK(info.st_mode) && !strcmp(copy,"/workspace")) {
                char resolved[4096];
                if(!realpath(copy,resolved) || strncmp(resolved,"/.pbl/projects/",15)) return -EPERM;
            } else if(!S_ISDIR(info.st_mode) || S_ISLNK(info.st_mode)) return -EPERM; }
        else if(errno!=ENOENT || mkdir(copy,0700)) return -errno;
        *p='/';
    }
    struct stat info;
    if(lstat(path,&info)==0 && S_ISLNK(info.st_mode)) return -EPERM;
    return 0;
}
EMSCRIPTEN_KEEPALIVE int pbl_fs_write(const char *path,const uint8_t *bytes,size_t length)
{
    if(!project_path(path) || (!bytes && length)) return -EINVAL;
    if(length>16u*1024u*1024u) return -EFBIG;
    int status=parents(path); if(status) return status;
    char temporary[4096]; snprintf(temporary,sizeof(temporary),"%s.pbl-tmp-%u",path,++serial);
    int fd=open(temporary,O_WRONLY|O_CREAT|O_EXCL,0600); if(fd<0) return -errno;
    size_t written=0;
    while(written<length) { ssize_t n=write(fd,bytes+written,length-written); if(n<0 && errno==EINTR) continue; if(n<=0) { status=n<0?-errno:-EIO; break; } written+=(size_t)n; }
    if(!status && fsync(fd)) status=-errno;
    if(close(fd) && !status) status=-errno;
    if(!status && rename(temporary,path)) status=-errno;
    if(status) unlink(temporary);
    return status;
}
EMSCRIPTEN_KEEPALIVE int pbl_fs_remove(const char *path)
{
    if(!project_path(path)) return -EINVAL;
    int status=parents(path); if(status) return status;
    return unlink(path)==0?0:-errno;
}
EMSCRIPTEN_KEEPALIVE int pbl_fs_rename(const char *from,const char *to)
{
    if(!project_path(from) || !project_path(to)) return -EINVAL;
    int status=parents(from); if(!status) status=parents(to); if(status) return status;
    return rename(from,to)==0?0:-errno;
}
