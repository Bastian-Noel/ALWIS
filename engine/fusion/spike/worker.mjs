import createFusion from './pbl-fusion.mjs';
try {
  const output = [];
  const module = await createFusion({ print: text => output.push(text), printErr: text => console.warn(text) });
  if (module._pbl_sql_started() !== 0) throw Error('SQL started eagerly');
  const status = module._pbl_run_select();
  if (status !== 0 || module._pbl_direct_calls() !== 1 || !output.join('').includes('fusion-select-one-ok')) {
    throw Error(`Native PHP SELECT failed: status=${status}, calls=${module._pbl_direct_calls()}, output=${output.join('')}`);
  }
  const evidence = { status, directCalls: module._pbl_direct_calls(), sqlStarted: module._pbl_sql_started(), linearMemoryBytes: module.HEAPU8.buffer.byteLength, output };
  module._pbl_sql_stop();
  evidence.sqlStopped = module._pbl_sql_started() === 0;
  postMessage({ ok: true, evidence });
} catch (error) {
  postMessage({ ok: false, error: { message: error.message, stack: error.stack } });
}
