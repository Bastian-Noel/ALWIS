# PHP formatting exception found in the actual link

11 November 2026. The local WSL runtime `ca04e0300050e2c238163ac589dd0230c0894dbe46258aa4b123a6f1f4c8cb63` links `snprintf.o` and `spprintf.o` from PHP 8.4.27. Both source files contain the Apache Group 1995-1998 notice with an advertising clause. The independent link replay produced exactly the same WASM hash.

The [PHP licensing page](https://www.php.net/license/) explicitly preserves file-specific third-party requirements. Its PHP v4 / Zend v3 election cannot be treated as a replacement of these Apache terms. The [FSF license list](https://www.gnu.org/licenses/license-list.html) identifies old Apache licenses as GPL-incompatible. This is distinct from the withdrawn finding about the JoomEngine MariaDB engine patch.

The active release gate records this concrete issue. A compatible implementation must replace both translation units, retaining the PHP formatting API and tests for truncation, integer widths, floating point, PHP-specific format tokens and failure paths. Merely removing their notices is not a solution.

Other advertising-clause hits in PHP include Berkeley-derived code; examine the University of California's 1999 removal and actual compiled branches individually rather than assigning every hit the same conclusion. The Bison parser skeletons carry their output exception. wolfSSL carries its MariaDB GPLv2 exception.
