/** Aggregate Linux PSS from Playwright descendant processes; never claim this is WASM heap.
 * PSS proportionalizes shared pages. RSS sums may double-count shared pages.
 */
import { readdir, readFile } from 'node:fs/promises';

export async function readBrowserProcessMemory(parentPid = process.pid) {
  if (process.platform !== 'linux') return { available: false, reason: 'Linux /proc required' };
  let entries;
  try { entries = (await readdir('/proc')).filter(name => /^\d+$/.test(name)); }
  catch (error) { return { available: false, reason: 'Cannot list /proc: ' + error.message }; }
  const processes = new Map();
  await Promise.all(entries.map(async pidStr => {
    try {
      const status = await readFile('/proc/' + pidStr + '/status', 'utf8');
      const parent = Number(status.match(/^PPid:\s+(\d+)/m)?.[1]);
      const rssKb = Number(status.match(/^VmRSS:\s+(\d+)\s+kB/m)?.[1]);
      if (Number.isFinite(parent)) processes.set(Number(pidStr), { parent, rssKb: Number.isFinite(rssKb) ? rssKb : null });
    } catch { /* Process exited, or access denied during sampling. */ }
  }));
  const descendants = [...processes.keys()].filter(pid => {
    const seen = new Set();
    let current = pid;
    while (current !== parentPid && processes.has(current) && !seen.has(current)) {
      seen.add(current);
      current = processes.get(current).parent;
    }
    return current === parentPid && pid !== parentPid;
  });
  if (!descendants.length) return { available: false, reason: 'No live descendant browser processes found' };
  let pssKb = 0, rssKb = 0, pssReadable = 0;
  await Promise.all(descendants.map(async pid => {
    const info = processes.get(pid);
    if (info.rssKb !== null) rssKb += info.rssKb;
    try {
      const rollup = await readFile('/proc/' + pid + '/smaps_rollup', 'utf8');
      const value = Number(rollup.match(/^Pss:\s+(\d+)\s+kB/m)?.[1]);
      if (Number.isFinite(value)) { pssKb += value; pssReadable++; }
    } catch { /* May be unavailable under runner process restrictions. */ }
  }));
  return {
    available: pssReadable === descendants.length,
    processCount: descendants.length,
    rssSumBytes: rssKb * 1024,
    pssBytes: pssReadable === descendants.length ? pssKb * 1024 : null,
    source: 'Linux /proc/<pid>/smaps_rollup of Node Playwright descendants',
    limitation: 'PSS includes browser, JS, workers and WASM; not WASM heap or physical system-wide RAM',
    ...(pssReadable !== descendants.length ? { reason: 'PSS readable for ' + pssReadable + '/' + descendants.length + ' processes' } : {}),
  };
}
