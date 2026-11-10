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
