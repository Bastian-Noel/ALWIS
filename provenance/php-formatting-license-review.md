# PHP formatting exception found in the actual link

11 November 2026. The local WSL runtime `ca04e0300050e2c238163ac589dd0230c0894dbe46258aa4b123a6f1f4c8cb63` links `snprintf.o` and `spprintf.o` from PHP 8.4.27. Both source files contain the Apache Group 1995-1998 notice with an advertising clause. The independent link replay produced exactly the same WASM hash.

The [PHP licensing page](https://www.php.net/license/) explicitly preserves file-specific third-party requirements. Its PHP v4 / Zend v3 election cannot be treated as a replacement of these Apache terms. The [FSF license list](https://www.gnu.org/licenses/license-list.html) identifies old Apache licenses as GPL-incompatible. This is distinct from the withdrawn finding about the JoomEngine MariaDB engine patch.

The active release gate records this concrete issue. A compatible implementation must replace both translation units, retaining the PHP formatting API and tests for truncation, integer widths, floating point, PHP-specific format tokens and failure paths. Merely removing their notices is not a solution.

Other advertising-clause hits in PHP include Berkeley-derived code; examine the University of California's 1999 removal and actual compiled branches individually rather than assigning every hit the same conclusion. The Bison parser skeletons carry their output exception. wolfSSL carries its MariaDB GPLv2 exception.

## Follow-up verification requested by the maintainer

11 November 2026. Checked the official PHP licensing page, the accepted PHP License Update RFC, PHP's licensing policy and MariaDB's licensing FAQ. No applicable supplemental permission was located in these sources. This is a bounded search result, not proof that no permission exists anywhere.

- https://www.php.net/license/ preserves file-specific third-party conditions.
- https://github.com/php/policies/blob/main/php-license.rst records consent from the PHP Group and Zend Technologies. It does not establish an Apache Group waiver for these portions.
- https://wiki.php.net/rfc/php_license_update describes the PHP/Zend license upgrades; no specific authorization for these Apache formatter portions was identified.
- https://mariadb.com/docs/general-resources/community/community/faq/licensing-questions/licensing-faq describes a FLOSS exception for the client library. That statement cannot be extended automatically to the embedded server linked here.

The local exact-link replay selects both libphp.a(snprintf.o) and libphp.a(spprintf.o), and yields the same WASM hash as the tested runtime. This proves archive-member selection; it is not a claim that every function in those members survives dead-code elimination. No blanket release approval or blanket prohibition on distributing PHP follows from this finding.

## Maintainer decision: defer replacement, continue development builds

On 11 November 2026 the repository owner explicitly requested that replacement be deferred to a future version and that compilation continue with a documented internal exception. Development builds and QA remain authorized. No formatter replacement is activated by this decision. This is a project scheduling decision, not permission from third-party copyright holders or a finding of GPL compatibility. The publication gate is unchanged.

The scope is two upstream translation units with several formatting functions, not merely two isolated functions. The issue has not been classified as legally minor. Its original notice is retained in `LICENSES/PHP-formatting-legacy.txt` and the current code remains available in the pinned PHP source archive. No deadline or future release number is committed yet.
