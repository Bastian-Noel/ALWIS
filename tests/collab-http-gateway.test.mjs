import { test } from "node:test";
import assert from "node:assert/strict";
import { HostHttpGateway, GuestHttpGateway } from "../apps/studio/collab/http-gateway.mjs";

test("guest HTTP gateways share a single host runtime but have distinct host-issued session IDs", async () => {
  const routes = []; const removed = []; let count = 0;
  let guestA, guestB;
  const host = new HostHttpGateway({
    origin: "https://studio.mmi.place",
    canPreview: from => from === "guest-a" || from === "guest-b",
    sessions: { create: async label => { count++; return label + "/" + count; }, remove: async id => removed.push(id) },
    route: async (session, req) => {
      routes.push({ session, req });
      return { status: 200, headers: [["Content-Type", "application/octet-stream"], ["Set-Cookie", "PHPSESSID=server-only"]],
        body: Uint8Array.from({ length: 90_000 }, (_, i) => i % 256) };
    },
    send: (to, msg) => { (to === "guest-a" ? guestA : guestB).receive(msg); },
  });
  guestA = new GuestHttpGateway({ origin: "https://studio.mmi.place", name: "Alice", send: frame => host.receive("guest-a", frame) });
  guestB = new GuestHttpGateway({ origin: "https://studio.mmi.place", name: "Bob", send: frame => host.receive("guest-b", frame) });
  const [a, b] = await Promise.all([
    guestA.request({ url: "/index.php", method: "POST", body: [0, 3, 255], headers: [["Cookie", "forged"]] }),
    guestB.request({ url: "/index.php", method: "GET" }),
  ]);
  assert.equal(a.status, 200);
  assert.equal(a.body.length, 90_000);
  assert.equal(a.body[1], 1);
  assert.deepEqual(a.headers, [["Content-Type", "application/octet-stream"]]);
  assert.equal(b.body.length, 90_000);
  assert.notEqual(routes[0].session, routes[1].session);
  assert.equal(routes[0].req.headers.length, 0);
  await host.close(); guestA.close(); guestB.close();
  assert.equal(removed.length, 2);
});

test("preview refuses guests without explicit host permission", async () => {
  let guest;
  const host = new HostHttpGateway({
    origin: "https://studio.mmi.place",
    sessions: { create: () => { throw Error("Should not create a session"); }, remove: () => {} },
    route: () => { throw Error("Should not run PHP"); },
    send: (_to, msg) => guest.receive(msg),
  });
  guest = new GuestHttpGateway({ origin: "https://studio.mmi.place", send: msg => host.receive("unauthorized", msg) });
  await assert.rejects(guest.request({ url: "/index.php" }), /n'autorise pas/);
  await host.close(); guest.close();
});

test("each guest reuses only its own PHP session across sequential requests", async () => {
  const calls = []; let next = 0; const removed = [];
  const guests = new Map();
  const host = new HostHttpGateway({
    origin: "https://studio.mmi.place",
    canPreview: () => true,
    sessions: { create: async () => `php-${++next}`, remove: async id => removed.push(id) },
    route: async (session, request) => {
      calls.push({ session, method: request.method });
      return { status: 200, headers: [], body: new Uint8Array([1]) };
    },
    send: (peer, frame) => guests.get(peer).receive(frame),
  });
  const makeGuest = peer => {
    const guest = new GuestHttpGateway({
      origin: "https://studio.mmi.place",
      send: frame => host.receive(peer, frame),
    });
    guests.set(peer, guest);
    return guest;
  };
  const alice = makeGuest("alice"), bob = makeGuest("bob");
  await alice.request({ url: "/login.php", method: "POST", body: [1] });
  await bob.request({ url: "/index.php" });
  await alice.request({ url: "/dashboard.php" });
  assert.equal(calls[0].session, calls[2].session);
  assert.notEqual(calls[0].session, calls[1].session);
  assert.deepEqual(calls.map(call => call.method), ["POST", "GET", "GET"]);
  await host.close(); alice.close(); bob.close();
  assert.deepEqual(removed.sort(), ["php-1", "php-2"]);
});

test("PHP cookies stay host-side, JavaScript cookies are scoped to each guest", async () => {
  const state = new Map(), calls = [];
  const clients = new Map();
  let counter = 0;
  const host = new HostHttpGateway({
    origin: "https://studio.mmi.place", canPreview: () => true,
    sessions: { create: () => `guest-session-${++counter}`, remove: () => {} },
    route: async session => ({ status: 200, headers: [["Content-Type", "text/html"]], body: new TextEncoder().encode(`<p>${session}</p>`) }),
    setCookie: (session, value, url) => { calls.push({ session, value, url }); state.set(session, [{ name: "visitor", value, path: "/", expires: null, secure: false }]); },
    cookieState: session => state.get(session) ?? [],
    send: (to, msg) => clients.get(to).receive(msg),
  });
  const guest = peer => {
    const client = new GuestHttpGateway({ origin: "https://studio.mmi.place", send: msg => host.receive(peer, msg) });
    clients.set(peer, client);
    return client;
  };
  const alice = guest("alice"), bob = guest("bob");
  assert.equal((await alice.cookie("first=1; Path=/", "/index.php"))[0].value, "first=1; Path=/");
  assert.deepEqual((await bob.request({ url: "/index.php", destination: "document" })).cookies, []);
  assert.equal((await alice.request({ url: "/index.php", destination: "document" })).cookies[0].name, "visitor");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://studio.mmi.place/index.php");
  await assert.rejects(async () => alice.cookie("forged=1", "https://other.example/"), /Cross-origin/);
  await host.close(); alice.close(); bob.close();
});

test("host preview revocation during a PHP request refuses to return private response bytes", async () => {
  let previewAllowed = true, resolveRoute, started;
  const arrived = new Promise(resolve => started = resolve);
  const sent = [];
  let guest;
  const host = new HostHttpGateway({
    origin: "https://studio.mmi.place",
    canPreview: () => previewAllowed,
    sessions: { create: async () => "private-session", remove: async () => {} },
    route: () => {
      started();
      return new Promise(resolve => { resolveRoute = resolve; });
    },
    send: (_peer, message) => {
      sent.push(message.t);
      guest.receive(message);
      return true;
    },
  });
  guest = new GuestHttpGateway({
    origin: "https://studio.mmi.place",
    send: message => host.receive("guest-a", message),
  });
  const request = guest.request({ url: "/private.php", method: "GET" });
  await arrived;
  previewAllowed = false;
  resolveRoute({ status: 200, headers: [["Content-Type", "text/html"]],
    body: new TextEncoder().encode("HOST-ONLY PHP SECRETS") });
  await assert.rejects(request, /retiré l'autorisation/);
  assert.equal(sent.filter(type => type === "http-response").length, 0,
    "No protected PHP content may reach a revoked guest");
  assert.equal(sent.filter(type => type === "http-error").length, 1);
  guest.close();
  await host.close();
});


test("HttpOnly PHP session cookies are never present in guest RPC metadata", async () => {
  let guest;
  const host = new HostHttpGateway({
    origin: "https://studio.mmi.place", canPreview: () => true,
    sessions: { create: async () => "private", remove: async () => {} },
    cookieState: () => [
      { name: "PHPSESSID", value: "not-for-guest", path: "/", httpOnly: true },
      { name: "theme", value: "dark", path: "/", httpOnly: false },
    ],
    route: async () => ({ status: 200, headers: [["Content-Type", "text/plain"]],
      body: new TextEncoder().encode("opaque-content") }),
    send: (_peer, frame) => { guest.receive(frame); return true; },
  });
  guest = new GuestHttpGateway({
    origin: "https://studio.mmi.place", send: frame => host.receive("guest", frame),
  });
  const result = await guest.request({ url: "/index.php" });
  assert.deepEqual(result.cookies.map(x => x.name), ["theme"]);
  assert.ok(!JSON.stringify(result).includes("not-for-guest"));
  guest.close();
  await host.close();
});


test("a burst of page assets queues instead of exceeding the host limit; POST is executed once", async () => {
  const calls = []; let active = 0, peak = 0;
  const host = new HostHttpGateway({ origin: "https://example.org", canPreview: () => true,
    sessions: { create: () => "private", remove() {} },
    route: async (_session, req) => {
      active++; peak = Math.max(active, peak); calls.push(req);
      await new Promise(r => setTimeout(r, 5)); active--;
      return { status: 200, headers: [], body: new Uint8Array([1]) };
    }, send: (_peer, m) => setTimeout(() => guest.receive(m), 0) });
  const guest = new GuestHttpGateway({ origin: "https://example.org", send: m => setTimeout(() => host.receive("guest", m), 0) });
  const responses = await Promise.all(Array.from({length:24}, (_,i) => guest.request({ url: "/asset-"+i, method:i===10?"POST":"GET", body:i===10?[7]:[] })));
  assert.ok(responses.every(r => r.status === 200));
  assert.equal(calls.length,24); assert.equal(calls.filter(r=>r.method==="POST").length,1);
  assert.ok(peak<=3); assert.equal(guest.queue.length,0);
  guest.close(); await host.close();
});

test("queued HTTP requests are bounded and cancelled on disconnect without later execution", async () => {
  const sent=[];
  const guest=new GuestHttpGateway({ origin:"https://example.org",send:m=>sent.push(m),timeoutMs:2000 });
  const results=[];
  for(let i=0;i<36;i++) results.push(guest.request({url:"/asset-"+i}).catch(e=>e.message));
  await new Promise(r=>setTimeout(r,0));
  assert.equal(guest.inFlight,3); assert.equal(guest.queue.length,32);
  guest.close(); const messages=await Promise.all(results);
  assert.ok(messages.some(m=>/pleine/.test(m))); assert.equal(guest.queueBytes,0);
  assert.equal(sent.filter(m=>m.t==="http-request").length,3);
});


test("disconnect before dispatch never sends a queued POST", async () => {
  const sent=[];
  const guest=new GuestHttpGateway({ origin:"https://example.org", send:m=>sent.push(m) });
  const pending=guest.request({url:"/write.php",method:"POST",body:[1]});
  guest.close(); await assert.rejects(pending,/déconnecté/); assert.equal(sent.length,0);
});


test("a queued POST expires before the preview broker timeout and is never sent later", async () => {
  const sent=[];
  const guest=new GuestHttpGateway({origin:"https://example.org",send:m=>sent.push(m),timeoutMs:1000,queueWaitMs:10});
  const active=Array.from({length:3},()=>guest.request({url:"/slow.php"}).catch(e=>e));
  const waiting=guest.request({url:"/write.php",method:"POST",body:[1]}).catch(e=>e);
  await new Promise(r=>setTimeout(r,30));
  assert.match((await waiting).message,/file/);assert.equal(guest.queue.length,0);
  guest.close();await Promise.all(active);
  assert.equal(sent.filter(m=>m.t==="http-request").length,3);
});
