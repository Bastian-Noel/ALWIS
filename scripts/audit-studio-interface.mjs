/** Audit the actual ALWIS interface in both themes with reproducible accessibility receipts. */
import {execFileSync} from 'node:child_process';
execFileSync(process.execPath,['tests/browser/alwis-accessibility.mjs'],{stdio:'inherit'});
