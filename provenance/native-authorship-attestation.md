# ALWIS native source ownership declaration (10 November 2026)

The maintainer instructed that ALWIS source without traceable third-party
attribution should be regarded as first-party ALWIS source. Git history
reports only the repository owner Bastian Noel as commit author of the
following ten native files, now bearing SPDX GPL-2.0-only and copyright tags:

- packages/files-native/src/files.c
- packages/network-native/src/http-stream.c
- packages/php-native/src/module.c
- packages/php-native/src/mysqli-extended.c
- packages/php-native/src/mysqli.c
- packages/php-native/src/pdo-adapter.h
- packages/php-native/src/pdo-values.h
- packages/sql-native/include/pbl_mysql.h
- packages/sql-native/src/console.c
- packages/sql-native/src/pbl_mysql.c

Git authorship and a maintainer declaration alone do not prove original
copyright or chain of title. This is a documented claim subject to correction
if externally sourced code or another rightsholder is later identified.
Third-party PHP, MariaDB, Connector/C, upstream PDO, wolfSSL and PCRE2 source
retains its original license and attribution and is NOT reclassified.

Verify each file's authors with git log and compare against
provenance/reuse-ledger.csv and provenance/source-map.csv. The native license
audit reports hashes of each first-party file.

Release authorization additionally requires exact binary/source correspondence
and complete third-party obligations. Do not remove notices or infer that
unidentified third-party code becomes originally authored.
