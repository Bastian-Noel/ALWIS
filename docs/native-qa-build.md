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

To consume, execute python3 scripts/restore_independent_native_qa.py.
If config/independent-native-qa.json exists, its explicit committed lock
specifies the mandatory GitHub Actions run ID and exact checksums. If it does
not exist yet, restoration searches only COMPLETED SUCCESSFUL native CI runs
on the ALWIS development branch, and requires an artifact with exactly the
same SHA-256 for EVERY tracked native input as the current checkout.
It also validates GitHub workflow name and run SHA, compiled WASM/JS, full
original-source archive, licensing evidence and real Chromium/Firefox parity.
The historical JoomEngine WASM hash is explicitly rejected. No fallback.

The chosen run ID and exact hashes are written to
build-work/independent-native-qa-selection.json; the QA FTP/Docker workflow
verifies its exact new engine using that record even if no committed pin
exists. This is an authenticated build-time attestation, not permission to
publish. An explicit source-control pin can be committed after all tests pass.

Build artifacts produced for internal QA ARE NOT a public release approval.
The FTP/Docker release gates still check legal notices and licensing status;
test artifacts do not bypass them.
