// Connects the collaboration core to the ALWIS workbench.
// Host: serves files/database/presence from the real engine, relays between guests.
// Guest: swaps the engine for remote calls, edits through deltas, loads everything lazily.
import * as lib from "../editor/dist/codemirror.mjs";
import { ctx, S, A, log } from "../workbench/state.mjs";
import { editorInstances } from "../workbench/ui.mjs";
import { refreshFiles } from "../workbench/views/explorer.mjs";
import { RpcHost, RpcGuest, installGuestEngine, encode, decode } from "./rpc.mjs";
import { DocHost, DocGuest } from "./docs.mjs";
import { FocusLayer, replayClick, replayPreview } from "./focus.mjs";
import { cssVars } from "./colors.mjs";
import { chunkText } from "./protocol.mjs";
import { showLoading } from "./presence-ui.mjs";
import { watchPreview, createMirror } from "./preview.mjs";
import { updatePreviewStatus } from "../workbench/views/code.mjs";

const SQL = "#sql";
const guard = (fn) => (...a) => { try { return fn(...a); } catch (e) { console.error("[collab]", e); } };
const throttle = (fn, ms) => { let t = 0, pending = null; return (...a) => { const now = Date.now(); if (now - t >= ms) { t = now; fn(...a); } else { clearTimeout(pending); pending = setTimeout(() => { t = Date.now(); fn(...a); }, ms - (now - t)); } }; };

export function installWiring(collab) {
  let run = null; // active role state, null when no session

  const peerInfo = (id) => {
    const p = collab.session?.peer(id);
    return { id, name: p?.name ?? "Invité", variant: p?.variant ?? 0, state: p?.state ?? "online", css: cssVars(p?.name ?? "Invité", p?.variant ?? 0) };
  };
  const ctxState = () => ({ view: S.view, dmode: S.dmode, table: S.view === "schema" ? (S.schemaSel ?? S.table) : S.table, db: S.db, active: S.active, pv: S.pv, pvPath: S.pvPath, pan: S.pan, zoom: S.zoom });
  const sessionSend = (to, m, o) => collab.session?.send(to, m, o);

  /* ---------- editors ---------- */
  const editorFor = (path) => { for (const ed of editorInstances()) if (ed.path?.() === path && ed.model?.applyRemote) return ed.model; return null; };
  const bindEditor = guard((ed) => {
    if (!run || !ed.model?.setCollab) return;
    const path = () => ed.path();
    let last = null;
    const cursor = throttle(guard((sel) => {
      const p = path();
      if (last && last.p === p && last.a === sel.anchor && last.h === sel.head) return;
      last = { p, a: sel.anchor, h: sel.head };
      run.cursor(p, sel.anchor, sel.head);
    }), 60);
    ed.model.setCollab({ local: guard((changes) => run?.local(path(), changes)), selection: cursor });
  });
  document.addEventListener("alwis:editor", (e) => bindEditor(e.detail));
  const bindAll = () => editorInstances().forEach(bindEditor);
  const unbindAll = () => editorInstances().forEach((ed) => ed.model?.setCollab?.(null));

  const redrawSoon = throttle(() => { try { ctx.draw?.(); } catch {} }, 400);
  const headless = (path, text) => {
    if (path === SQL) S.qtext = text;
    else if (text === S.base[path]) delete S.drafts[path];
    else S.drafts[path] = text;
    redrawSoon();
  };

  /* ---------- query results are shared with everybody ---------- */
  function wrapQueries(send) {
    const orig = A.runSQL;
    if (!orig || orig.__collab) return () => {};
    const wrapped = async function (...args) {
      const out = await orig.apply(this, args);
      guard(() => {
        const text = encode({ rs: S.rs, qtext: S.qtext, db: S.db, by: collab.session.me.id });
        if (text.length > 900_000) return;
        const parts = chunkText(text, 12 * 1024);
        const id = Math.random().toString(36).slice(2);
        parts.forEach((d, part) => send({ t: "qres", id, part, parts: parts.length, d }));
      })();
      return out;
    };
    wrapped.__collab = true;
    A.runSQL = wrapped;
    return () => { if (A.runSQL === wrapped) A.runSQL = orig; };
  }
  const qbuf = new Map();
  function receiveQuery(from, m) {
    const e = qbuf.get(m.id) ?? qbuf.set(m.id, { parts: [], got: 0 }).get(m.id);
    e.parts[m.part] = m.d;
    if (++e.got < m.parts) return false;
    qbuf.delete(m.id);
    try {
      const v = decode(e.parts.join(""));
      S.rs = v.rs;
      S.rsi = 0;
      if (typeof v.qtext === "string") S.qtext = v.qtext;
      log("i", `Résultat partagé par ${peerInfo(from).name}`);
      ctx.draw?.();
    } catch {}
    return true;
  }

  /* ====================== HOST ====================== */
  function startHost() {
    if (S.mode !== "work" || !S.project) { collab.session?.leave(); return; }
    const session = collab.session;
    const send = (to, m, o) => session.send(to, m, o);
    const rpc = new RpcHost({
      engine: ctx.engine, send, log,
      onWrite: guard((path, data) => { S.base[path] = data; delete S.drafts[path]; S.applied?.delete?.(path); redrawSoon(); }),
    });
    const docs = new DocHost({
      lib, send, peer: peerInfo, editorFor, onHeadless: headless, log,
      loadText: async (path) => {
        if (path === SQL) return S.qtext ?? "";
        const cached = S.drafts[path] ?? S.base[path];
        if (typeof cached === "string") return cached;
        const r = await ctx.engine.fs.read(path);
        if (typeof r.text !== "string") throw Error("Ce fichier n’est pas un fichier texte.");
        return r.text;
      },
    });
    const focus = new FocusLayer({
      send: (m, o) => session.broadcast({ ...m, from: "h" }, o),
      peer: peerInfo, getCtx: ctxState,
      onClick: guard((_from, m) => replayClick(m)),
    });
    focus.start();
    const pvWatch = watchPreview({ container: () => document.querySelector("#pvFrames"), send: (m) => session.broadcast({ ...m, info: S.pvInfo[S.pvSessions?.[0]] ?? null, path: S.pvPath }) });
    const unwrapQ = wrapQueries((m) => { session.broadcast({ ...m, from: "h" }); });
    let changedTimer;
    const offChanged = ctx.engine.on("changed", (c) => {
      clearTimeout(changedTimer);
      changedTimer = setTimeout(async () => {
        session.broadcast({ t: "changed", kind: c?.kind ?? null, path: c?.path ?? null });
        if ((S.view === "data" || S.view === "schema") && A.refreshData) await A.refreshData().catch(() => {});
      }, 150);
    });
    const onMessage = guard(({ from, msg }) => {
      switch (msg.t) {
        case "hello": pvWatch.resend(); return send(from, { t: "welcome", project: S.project, db: S.db, host: session.me.name });
        case "rpc": return rpc.handle(from, msg);
        case "open": case "ops": case "sync": case "close-doc": return docs.handle(from, msg);
        case "aware": return docs.handle(from, msg);
        case "qres": if (receiveQuery(from, msg)) { /* fan-out below */ } for (const id of session.links.keys()) if (id !== from) send(id, { ...msg, from }); return;
        case "focus":
          focus.receive(from, msg);
          if (msg.k === "view" && msg.pv) pvWatch.resend();
          for (const id of session.links.keys()) if (id !== from) send(id, { ...msg, from }, { droppable: true });
          return;
        case "preview-event":
          if (replayPreview(msg)) pvWatch.resend();
          return;
      }
    });
    const offMsg = collab.on("message", onMessage);
    const offDown = collab.on("peer-down", ({ id }) => { docs.dropPeer(id); focus.drop(id); });
    run = {
      role: "host",
      focus,
      local: (path, changes) => docs.local(path, changes),
      cursor: (path, a, h) => docs.hostCursor(path, a, h),
      stop() { offMsg(); offDown(); offChanged(); unwrapQ(); focus.stop(); pvWatch.stop(); clearTimeout(changedTimer); },
    };
    bindAll();
  }

  /* ====================== GUEST ====================== */
  async function startGuest() {
    const session = collab.session;
    if (run?.role === "guest") { run.reconnect(); return; }
    // a local project must be closed first: a guest works inside the host's project
    if (S.mode === "work" && S.project) {
      try { await A.close(); } catch {}
      if (S.mode === "work") { session.leave(); return; }
    }
    const main = document.querySelector("#main");
    const release = showLoading(main, "Connexion au projet de l’hôte…");
    const send = (m, o) => session.send("h", m, o);
    const rpc = new RpcGuest({ send, onBusy: (n) => document.documentElement.toggleAttribute("data-collab-busy", n > 0) });
    const restoreEngine = installGuestEngine(ctx.engine, rpc);
    const docs = new DocGuest({ lib, send, peer: peerInfo, editorFor, myId: () => session.me.id, onHeadless: headless, onDesync: (p) => log("w", `Resynchronisation de ${p}`) });
    const focus = new FocusLayer({ send: (m, o) => send(m, o), peer: peerInfo, getCtx: ctxState, onPreview: (m) => send({ t: "preview-event", ...m }, { droppable: true }) });
    const mirror = createMirror({ container: () => document.querySelector("#pvFrames") });
    const sessionsFrame = ctx.engine.sessions?.frame;
    const sessionsList = ctx.engine.sessions?.list;
    if (ctx.engine.sessions) {
      ctx.engine.sessions.frame = async () => ({ src: "about:blank" });
      ctx.engine.sessions.list = () => [{ id: "host", label: "Aperçu de l’hôte", hue: "#276ac4", short: "hôte", cookies: [], hidden: 0 }];
    }
    const saved = { persist: ctx.persist, schedulePersist: ctx.schedulePersist, openFile: A.openFile, save: A.save, close: A.close };
    ctx.persist = async () => {};
    ctx.schedulePersist = () => {};
    const unwrapQ = wrapQueries(send);

    A.openFile = async function (p, ...rest) {
      const info = S.files.find((f) => f.path === p);
      if (info?.kind === "text" && !docs.entries.has(p)) {
        const stop = showLoading(document.querySelector("#ed1")?.parentElement ?? document.querySelector("#main"), `Chargement de ${p.split("/").pop()}…`);
        try { S.base[p] = await docs.open(p); delete S.drafts[p]; }
        catch (e) { stop(); throw e; }
        stop();
      }
      return saved.openFile.call(this, p, ...rest);
    };
    A.save = async function () { log("i", "La sauvegarde du projet est réservée à l’hôte."); };
    A.close = async function () { session.leave(); };

    let entered = false;
    const enter = guard(async (w) => {
      if (entered) return; // reconnects get a new welcome: keep the user's tabs
      entered = true;
      document.documentElement.setAttribute("data-collab-guest", "");
      Object.assign(S, {
        project: w.project || "Projet partagé", db: w.db ?? "test", dbCollapsed: false, files: [], base: {}, drafts: {}, tabs: [], active: null,
        vdirs: new Set(), applied: new Set(), dbDirty: false, saveFail: false, reqs: [], wins: [], cat: null, dbs: [], table: null, pos: {},
        pv: false, pvDouble: false, pvPath: "/index.php", pvInfo: {}, pvSessions: ["host"], dmode: "data",
        qtext: "SELECT 1;", rs: null,
      });
      await refreshFiles();
      S.mode = "work";
      S.view = "code";
      try { S.qtext = await docs.open(SQL); } catch {}
      release();
      ctx.draw?.();
      log("i", `Projet « ${S.project} » rejoint (${w.host})`);
      const first = S.files.find((f) => f.path === "/index.php") ?? S.files.find((f) => f.kind === "text");
      if (first) await A.openFile(first.path).catch(() => {});
      focus.start();
      bindAll();
    });

    const onMessage = guard(({ from, msg }) => {
      switch (msg.t) {
        case "welcome": return enter(msg);
        case "pv":
          S.pvInfo.host = msg.info ?? { status: 200, ms: 0 };
          updatePreviewStatus();
          if (msg.path) S.pvPath = msg.path;
          return mirror.receive(msg);
        case "rpc-res": return rpc.handle(msg);
        case "file": case "file-error": case "ops": case "resync": case "caught-up": case "aware": return docs.handle(msg);
        case "qres": return receiveQuery(msg.from ?? from, msg);
        case "focus": return focus.receive(msg.from ?? from, msg);
        case "changed":
          ctx.engine.emit("changed", { kind: msg.kind, path: msg.path });
          if (msg.kind === "files" || !msg.kind) refreshFiles().then(() => redrawSoon()).catch(() => {});
          if (msg.kind !== "files" && (S.view === "data" || S.view === "schema")) Promise.resolve(A.refreshData?.()).catch(() => { S.dbDirty = true; redrawSoon(); });
          else if (msg.kind === "sql" || !msg.kind) { S.dbDirty = true; redrawSoon(); }
          return;
      }
    });
    const offMsg = collab.on("message", onMessage);
    const offPeer = collab.on("peer-down", ({ id }) => focus.drop(id));
    const offStatus = collab.on("status", (s, why) => { if (s === "closed") { leaveGuest(why); } });
    const hello = () => send({ t: "hello", name: session.me.name });
    hello();
    const timeout = setTimeout(() => { release(); log("w", "L’hôte n’a pas répondu."); }, 20_000);

    function leaveGuest() {
      clearTimeout(timeout);
      release();
      offMsg(); offPeer(); offStatus();
      focus.stop(); unwrapQ(); restoreEngine(); unbindAll();
      document.documentElement.removeAttribute("data-collab-guest");
      if (ctx.engine.sessions && sessionsFrame) { ctx.engine.sessions.frame = sessionsFrame; ctx.engine.sessions.list = sessionsList; }
      Object.assign(ctx, { persist: saved.persist, schedulePersist: saved.schedulePersist });
      Object.assign(A, { openFile: saved.openFile, save: saved.save, close: saved.close });
      Object.assign(S, { mode: "launcher", project: null, files: [], base: {}, drafts: {}, tabs: [], active: null, cat: null, dbs: [], table: null, rs: null });
      run = null;
      try { ctx.draw?.(); } catch {}
    }
    run = {
      role: "guest",
      focus,
      local: (path, changes) => docs.local(path, changes),
      cursor: (path, a, h) => docs.cursor(path, a, h),
      reconnect() { hello(); rpc.replay(); docs.catchUpAll(); },
      stop: leaveGuest,
    };
  }

  collab.on("ready", () => {
    if (collab.session.role === "host") { if (!run) startHost(); }
    else startGuest();
  });
  collab.on("status", (s) => { if (s === "closed" && run?.role === "host") { run.stop(); run = null; unbindAll(); } });
  collab.on("follow", guard(async (id) => {
    const st = run?.focus?.remote.get(id);
    if (!st) return;
    if (st.db && st.db !== S.db) await A.selectDb(st.db);
    if ((st.view === "code" && st.pv) || st.view === "preview") {
      S.view = "code";
      S.pv = true;
      if (st.pvPath) S.pvPath = st.pvPath;
      else if (st.active) S.pvPath = st.active;
      ctx.draw?.();
      await A.pvReload?.();
      return;
    }
    S.pv = false;
    if (st.view === "data" || st.view === "schema") {
      if (st.view === "schema") await A.nav("schema");
      if (st.view === "data" && st.table && st.table !== S.table) await A.selectTable(st.table);
      if (st.view === "schema") {
        S.schemaSel = st.table || null;
        if (Array.isArray(st.pan)) { S.pan = [...st.pan]; S.zoom = Number(st.zoom) || 1; }
      }
      S.view = st.view;
      S.dmode = st.dmode || S.dmode;
      if (st.view === "data") await A.refreshData?.();
      ctx.draw?.();
      return;
    }
    if (st.file && S.files?.some((f) => f.path === st.file)) await A.openFile(st.file);
    else if (st.active && S.files?.some((f) => f.path === st.active)) await A.openFile(st.active);
    S.view = st.view || "code";
    ctx.draw?.();
  }));
}
