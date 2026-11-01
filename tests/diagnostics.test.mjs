import test from 'node:test';
import assert from 'node:assert/strict';
import {createDiagnosticLog,describeFailure} from '../apps/studio/diagnostics.mjs';
test('diagnostics evict oldest entries and bound messages, details and recovery',()=>{
  const log=createDiagnosticLog({maxEntries:3,maxMessage:32,maxDetails:64});
  for(let i=0;i<100;i++)log.add('error','x'.repeat(1000),{details:'y'.repeat(1000),recovery:'z'.repeat(2000)});
  const entries=log.list();assert.equal(entries.length,3);assert.equal(entries[0].id,'WWS-0098');assert.ok(entries.every(entry=>entry.message.length<64&&entry.details.length<96&&entry.recovery.length<1100));
  entries[0].details='mutated';assert.notEqual(log.list()[0].details,'mutated');
  log.clear();assert.equal(log.list().length,0);assert.equal(log.add('info','continued').id,'WWS-0101');
});
test('SQL failures preserve actual codes and offer recovery; oversized banners stay bounded',()=>{
  const failure=describeFailure(Object.assign(Error('Unknown column'),{sqlstate:'42S22',errno:1054}));
  assert.equal(failure.category,'SQL');assert.match(failure.details,/42S22.*1054/);assert.match(failure.recovery,/Corrigez/);
  const giant=describeFailure({message:'x'.repeat(1000000),stack:'s'.repeat(1000000)});assert.equal(giant.message.length,4096);assert.equal(giant.details.length,8192);
});
test('save and conflict failures advise recovery without automatic replay',()=>{
  assert.equal(describeFailure(Error('IndexedDB save failed')).category,'SAUVEGARDE');
  assert.match(describeFailure(Error('SQL is stopped')).recovery,/ne seront pas rejouées/);
  assert.equal(describeFailure(Error('La ligne a changé')).category,'CONFLIT');
});
