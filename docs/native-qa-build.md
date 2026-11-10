# QA build of the independent PHP/MariaDB engine

Historical native binaries may be used as read-only comparison witnesses.
They must never be copied into the next ALWIS FTP ZIP or Docker image.

The independent GitHub Actions job builds PHP 8.4.27 and MariaDB from seven
SHA-256-pinned upstream archives, with original GPLv2 ALWIS source. A successful
candidate requires real browser parity, cURL HTTP tests, two real guests,
sustained load and restart/crash recovery checks. The QA artifact has a
short retention period, requires authenticated GitHub access, and contains
both compiled WASM/JS and its complete corresponding source tarball:

- independent-native-qa-with-sources/runtime/pbl-runtime.wasm and .mjs
- independent-native-build.json (Chromium and Firefox parity proof)
- qa-manifest.json (WASM, JavaScript and all native-input SHA-256 hashes)
- corresponding-sources.tar.gz and matching receipt
- native-license-evidence.json (releaseApproved false)

To consume, pin a successful native Actions run ID and exact checksums in
config/independent-native-qa.json, then execute
python3 scripts/restore_independent_native_qa.py. It checks the run, pinned
hashes and every tracked native source before copying new engine bytes.
No fallback to the deleted JoomEngine binary is allowed.

Build artifacts produced for internal QA ARE NOT a public release approval.
The FTP/Docker release gates still check legal notices and licensing status;
test artifacts do not bypass them.
