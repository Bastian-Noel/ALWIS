import test from "node:test";
import assert from "node:assert/strict";
import { PeerLink } from "../apps/studio/collab/transport.mjs";
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
class RTC {
  constructor() { this.ice = []; this.connectionState = "new"; }
  async setRemoteDescription(description) { await delay(5); this.remoteDescription = description; }
  async addIceCandidate(candidate) { assert.ok(this.remoteDescription); this.ice.push(candidate); }
  async createAnswer() { return { type: "answer", sdp: "answer" }; }
  async setLocalDescription(description) { this.localDescription = description; }
  close() { this.connectionState = "closed"; this.onconnectionstatechange?.(); }
}

test("early ICE waits for SDP, and slow negotiation upgrades the relay to P2P", async () => {
  const sent = [], modes = [];
  const link = new PeerLink({ signaling: { state: "open", send: m => { sent.push(m); return true; } },
    remoteId: "h", initiator: false, RTC, p2pTimeoutMs: 20, p2pDeadlineMs: 1000 });
  link.on("mode", mode => modes.push(mode));
  try {
    const pc = link.pc;
    await Promise.all([link.onSignal({ ice: { candidate: "early" } }), link.onSignal({ sdp: { type: "offer", sdp: "offer" } })]);
    assert.equal(pc.ice.length, 1);
    link.send({ id: "before" });
    await delay(35);
    assert.equal(link.mode, "relay"); assert.equal(link.pc, pc, "relay fallback must leave slow ICE alive until the deadline");
    assert.equal(sent.filter(message => message.t === "relay").length, 1);
    const direct = [], dc = { readyState: "open", bufferedAmount: 0, send: message => direct.push(JSON.parse(message)) };
    pc.ondatachannel({ channel: dc }); dc.onopen();
    link.send({ id: "after" });
    assert.equal(link.mode, "p2p"); assert.deepEqual(direct, [{ id: "after" }]);
    assert.deepEqual(modes, ["relay", "p2p"]);
    dc.onclose();
    assert.equal(link.mode, "relay"); assert.equal(link.pc, null);
  } finally { link.close(); }
});

test("relay frames remain pending until ack and retry after an explicit throttle", async () => {
  const sent = [], link = new PeerLink({ signaling: { state: "open", send: m => { sent.push(m); return true; } },
    remoteId: "h", RTC: null, relayAcknowledgements: true });
  try {
    link.send({ id: 1 }); link.send({ id: 2 });
    assert.equal(sent.length, 1);
    const ref = sent[0].ref;
    link.onThrottle(5, ref);
    await delay(20);
    assert.equal(sent.length, 2); assert.equal(sent[1].ref, ref);
    link.onRelayAck(ref);
    assert.equal(sent[2].d.id, 2);
    link.onRelayAck(sent[2].ref);
    assert.equal(link.relayPending, null);
  } finally { link.close(); }
});


test("an unacknowledged relay retry stays on the deduplicated relay during P2P upgrade", async () => {
  const sent = [], direct = [];
  const link = new PeerLink({ signaling: { state: "open", send: message => { sent.push(message); return true; } },
    remoteId: "h", RTC: null, relayAcknowledgements: true });
  try {
    link.send({ id: "uncertain" });
    const ref = sent[0].ref;
    link.mode = "p2p"; link.dc = { readyState: "open", bufferedAmount: 0, send: message => direct.push(JSON.parse(message)), close() {} };
    link.onThrottle(1, ref); link.send({ id: "next" });
    await delay(15);
    assert.equal(sent[1].ref, ref); assert.equal(direct.length, 0);
    link.onRelayAck(ref);
    assert.deepEqual(direct, [{ id: "next" }]);
  } finally { link.close(); }
});
