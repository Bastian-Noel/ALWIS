import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CookieJar, ClientSessions } from '../packages/runtime/src/client-sessions.mjs';
test('virtual cookie paths, HttpOnly and expiration remain separate from client storage', () => {
  const jar = new CookieJar(); const url = 'https://school.example/app/index.php';
  assert.equal(jar.set('session=private; Path=/; HttpOnly; Secure', url), true);
  assert.equal(jar.set('view=one; Path=/app', url), true);
  assert.equal(jar.header(url, { javascript: true }), 'view=one');
  assert.equal(jar.header('https://school.example/application/index.php'), 'session=private');
  assert.equal(jar.set('session=overwrite; Path=/', url, { javascript: true }), false);
  jar.set('view=gone; Path=/app; Max-Age=0', url);
  assert.equal(jar.header(url), 'session=private');
  assert.equal(jar.set('other=x; Domain=foreign.example', url), false);
  assert.equal(jar.set('__Host-bad=x; Path=/app; Secure', url), false);
});
test('N identities serialize and restore without merging their cookie jars', () => {
  const sessions = new ClientSessions(); const a = sessions.create('A'), b = sessions.create('B'), c = sessions.create('C');
  sessions.get(a).jar.set('identity=a; Path=/', 'https://school.example/');
  sessions.get(b).jar.set('identity=b; Path=/', 'https://school.example/');
  const restored = new ClientSessions(sessions.export());
  assert.equal(restored.get(a).jar.header('https://school.example/'), 'identity=a');
  assert.equal(restored.get(b).jar.header('https://school.example/'), 'identity=b');
  assert.equal(restored.get(c).jar.header('https://school.example/'), '');
});

test('groups session creation synchronously and rejects a partial batch', () => {
  const sessions = new ClientSessions([], { maxSessions: 3 });
  const ids = sessions.createMany(['Charge A', 'Charge B']);
  assert.equal(ids.length, 2);
  assert.notEqual(ids[0], ids[1]);
  assert.deepEqual(ids.map(id => sessions.get(id).label), ['Charge A', 'Charge B']);
  assert.throws(() => sessions.createMany(['Charge C', 'Charge D']), /Session limit reached/);
  assert.equal(sessions.sessions.size, 2);
});

test('Default cookie path includes its directory without requiring a trailing slash',()=>{
 const jar=new CookieJar();jar.set('view=one','https://school.example/app/index.php');
 assert.equal(jar.header('https://school.example/app'),'view=one');
 assert.equal(jar.header('https://school.example/application'),'');
});
