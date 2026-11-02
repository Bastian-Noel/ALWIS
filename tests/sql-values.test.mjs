import assert from 'node:assert/strict';
import {test} from 'node:test';
import {identifier,literal,editValue,sameValue} from '../apps/studio/database/sql-values.mjs';
test('SQL tool values preserve empty, NULL, Unicode, binary and exact integers',()=>{
 assert.equal(literal(null),'NULL');assert.equal(literal(''),"CONVERT(X'' USING utf8mb4)");
 assert.equal(literal(Uint8Array.of(0,255)),"X'00ff'");
 assert.equal(literal(Uint8Array.of(170),{nativeType:16}),"b'10101010'");
 assert.equal(literal('18446744073709551615'),"CONVERT(X'3138343436373434303733373039353531363135' USING utf8mb4)");
 assert.deepEqual(editValue('hex','4100FF'),Uint8Array.of(65,0,255));
 assert.equal(editValue('null','NULL'),null);assert.equal(editValue('text','NULL'),'NULL');
 assert.throws(()=>editValue('hex','0xFF'));assert.throws(()=>editValue('hex','F'));
 assert.ok(sameValue(editValue('hex','00ff'),Uint8Array.of(0,255)));
 assert.equal(identifier('a`b'),'`a``b`');
});
