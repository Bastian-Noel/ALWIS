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
import { guestPreviewSandbox } from "./preview-security.mjs";
import { HostHttpGateway, GuestHttpGateway } from "./http-gateway.mjs";
import { shareNetworkRecord, networkRecordReceiver } from "./shared-network.mjs";
import { SchemaSync } from "./schema-sync.mjs";
import { drawSchema } from "../workbench/views/schema.mjs";
import { PreviewDelivery } from "./preview-delivery.mjs";
import { IsolatedGuestPreviewController } from "./isolated-preview-controller.mjs";
import { updatePreviewStatus } from "../workbench/views/code.mjs";

const SQL = "#sql";
const guard = (fn) => (...a) => { try { return fn(...a); } catch (e) { console.error("[collab]", e); } };
const throttle = (fn, ms) => { let t = 0, pending = null; return (...a) => { const now = Date.now(); if (now - t >= ms) { t = now; fn(...a); } else { clearTimeout(pending); pending = setTimeout(() => { t = Date.now(); fn(...a); }, ms - (now - t)); } }; };

export function installWiring(collab) {
  let run = null; // active role state, null when no session

  ctx.schemaMoved = (db, table, pos, final) => run?.schema?.move(db, table, pos, final);
  const applyPlacement = ({ db, table, pos }) => {
    S.layouts ??= {};
    const exists = Object.hasOwn(S.layouts, db);
    if (!exists && Object.keys(S.layouts).length >= 128) return false;
    const positions = exists ? S.layouts[db] : {};
    if (!Object.hasOwn(positions, table) && Object.keys(positions).length >= 4096) return false;
    const old = Object.hasOwn(positions, table) ? positions[table] : null;
    if (old?.[0] === pos[0] && old?.[1] === pos[1]) return;
    Object.defineProperty(positions, table, { value: [...pos], writable: true, configurable: true, enumerable: true });
    Object.defineProperty(S.layouts, db, { value: positions, writable: true, configurable: true, enumerable: true });
    if (db === S.db) {
      S.pos = positions;
      S.layoutDB = db;
      if (S.view === "schema") drawSchema();
    }
    S.layoutDirty = true;
    S.layoutVersion++;
    ctx.shell();
    ctx.schedulePersist?.();
  };
  const layoutSnapshot = () => ({ ...S.layouts, ...(S.db ? { [S.db]: S.pos } : {}) });

  const peerInfo = (id) => {
    const p = collab.session?.peer(id);
    return { id, name: p?.name ?? "Invité", variant: p?.variant ?? 0, state: p?.state ?? "online", css: cssVars(p?.name ?? "Invité", p?.variant ?? 0) };
  };
  const ctxState = () => ({ view: S.view, dmode: S.dmode, table: S.view === "schema" ? (S.schemaSel ?? S.table) : S.table, db: S.db, active: S.active, pv: S.pv, pvPath: S.pvPath, pan: S.pan, zoom: S.zoom, cw: document.querySelector("#canvas")?.clientWidth ?? 0, ch: document.querySelector("#canvas")?.clientHeight ?? 0 });
  /** Follow mode: keep the same world point at the canvas centre. */
  const applyViewport = guard(({ cx, cy, zoom }) => {
    const box = document.querySelector("#canvas");
    if (!box || !box.clientWidth || !Number.isFinite(cx) || !Number.isFinite(zoom)) return;
    S.zoom = Math.max(0.4, Math.min(1.6, zoom));
    S.pan = [box.clientWidth / 2 - cx * S.zoom, box.clientHeight / 2 - cy * S.zoom];
    document.querySelector("#layer")?.setAttribute("transform", `translate(${S.pan[0]} ${S.pan[1]}) scale(${S.zoom})`);
    const label = document.querySelector("#zl");
    if (label) label.textContent = Math.round(S.zoom * 100) + " %";
  });
  const onPeerView = (id) => { if (collab.following === id) collab.emit("follow", id, { quiet: true }); };
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
    collab.previewEnabled = collab.config?.guestPreviewEnabled === true; // Deployment policy, never a per-user setting.
    const schema = new SchemaSync({ host: true, send: m => session.broadcast(m), apply: applyPlacement, layouts: layoutSnapshot });
    const previewDelivery = new PreviewDelivery();
    const http = new HostHttpGateway({
      origin: location.origin,
      sessions: { create: label => ctx.engine.sessions.create(label), remove: id => ctx.engine.sessions.remove(id) },
      route: (id, request) => ctx.engine.sessions.route(id, { ...request, remoteGuest: true }),
      cookieState: id => ctx.engine.sessions.list().find(item => item.id === id)?.cookies ?? [],
      setCookie: (id, value, url) => ctx.engine.sessions.cookie(id, value, url),
      canPreview: from => collab.previewEnabled && session.peer(from)?.state === "online",
      send, log,
    });
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
      peer: peerInfo, getCtx: ctxState, onViewport: applyViewport, onPeerView, isFollowing: id => collab.following === id,
    });
    focus.start();
    const pvWatch = watchPreview({ container: () => document.querySelector("#pvFrames"), send: (m, o) => {
      const recipients = previewDelivery.targets(session.links.keys(), collab.previewEnabled);
      for (const peer of recipients)
        session.send(peer, { ...m, info: S.pvInfo[S.pvSessions?.[0]] ?? null, path: S.pvPath }, o);
    } });
    const unwrapQ = wrapQueries((m) => { session.broadcast({ ...m, from: "h" }); });
    let changedTimer;
    const offRequest = ctx.engine.on("request", record => shareNetworkRecord(record,
      message => session.broadcast(message)));
    const offChanged = ctx.engine.on("changed", (c) => {
      clearTimeout(changedTimer);
      changedTimer = setTimeout(async () => {
        session.broadcast({ t: "changed", kind: c?.kind ?? null, path: c?.path ?? null });
        if ((S.view === "data" || S.view === "schema") && A.refreshData) await A.refreshData().catch(() => {});
      }, 150);
    });
    const onMessage = guard(({ from, msg }) => {
      if (["http-request", "http-ack", "http-error", "http-cookie"].includes(msg.t)) return http.receive(from, msg);
      switch (msg.t) {
        case "schema-move":
          if (session.peer(from)?.state === "online") schema.receive(msg);
          return;
        case "hello":
          send(from, { t: "welcome", project: S.project, db: S.db, host: session.me.name, httpPreview: collab.previewEnabled });
          schema.snapshot(m => send(from, m));
          for (const record of S.reqs.slice(-20)) shareNetworkRecord(record, message => send(from, message));
          pvWatch.resend(); focus.announce(true); return send(from, { t: "focus-state", ...focus.snapshot(from) });
        case "http-preview-status":
          if (session.peer(from)?.state === "online") {
            const fallback = previewDelivery.update(from, {
              enabled: collab.previewEnabled, usable: msg.usable === true,
            });
            if (fallback) pvWatch.resend();
          }
          return;
        case "focus-req": return send(from, { t: "focus-state", ...focus.snapshot(from) });
        case "rpc": return rpc.handle(from, msg);
        case "open": case "ops": case "sync": case "close-doc": return docs.handle(from, msg);
        case "aware": return docs.handle(from, msg);
        case "qres": if (receiveQuery(from, msg)) { /* fan-out below */ } for (const id of session.links.keys()) if (id !== from) send(id, { ...msg, from }); return;
        case "focus":
          focus.receive(from, msg);
          if (msg.k === "view" && msg.pv) pvWatch.resend();
          for (const id of session.links.keys()) if (id !== from) send(id, { ...msg, from }, { droppable: true, key: `focus:${from}:${msg.k}` });
          return;
        case "preview-event":
          if (replayPreview(msg)) pvWatch.resend();
          return;
      }
    });
    const offMsg = collab.on("message", onMessage);
    const offDown = collab.on("peer-down", ({ id }) => {
      docs.dropPeer(id); focus.drop(id); previewDelivery.drop(id);
      http.drop(id).catch(error => log("warn", "guest_http_drop", { message: error.message }));
    });
    run = {
      role: "host",
      schema, focus,
      local: (path, changes) => docs.local(path, changes),
      cursor: (path, a, h) => docs.hostCursor(path, a, h),
      stop() {
        collab.previewEnabled = false;
        schema.stop(); offMsg(); offDown(); offChanged(); offRequest(); unwrapQ(); focus.stop(); pvWatch.stop(); clearTimeout(changedTimer);
        previewDelivery.reset();
        http.close().catch(error => log("warn", "guest_http_close", { message: error.message }));
      },
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
    const schema = new SchemaSync({ send, apply: applyPlacement, layouts: layoutSnapshot });
    const rpc = new RpcGuest({ send, onBusy: (n) => document.documentElement.toggleAttribute("data-collab-busy", n > 0) });
    const receiveNetwork = networkRecordReceiver(record => {
      if (!S.reqs.some(item => item.id === record.id)) ctx.engine.emit("request", record);
    });
    const http = new GuestHttpGateway({ origin: location.origin, name: session.me.name,
      timeoutMs: 30_000, send });
    const preview = collab.config?.guestPreviewEnabled
      ? new IsolatedGuestPreviewController({
          origin: collab.config.previewOrigin || location.origin,
          allowSameOrigin: collab.config.previewRequiresTrust === true,
          confirmTrust: () => window.confirm("Faire confiance à ce projet ?\n\nAucun domaine d’aperçu séparé n’est configuré. Le JavaScript du projet pourra accéder à votre studio ALWIS, à son stockage local et aux projets accessibles dans ce navigateur. PHP et MariaDB restent chez l’hôte.\n\nAcceptez uniquement si vous faites confiance à l’hôte et au code du projet. Annuler conserve l’aperçu statique."),
          request: request => http.request(request),
          cookie: (value, url) => http.cookie(value, url),
          online: () => session.status === "live" && session.hostState === "online",
        }) : null;
    let interactivePreview = false;
    const setInteractivePreview = async enabled => {
      if (!!enabled === interactivePreview) return;
      if (enabled) {
        try {
          if (!preview) throw Error("Aucune origine d'aperçu isolée n'est configurée.");
          await preview.start(); interactivePreview = true;
        }
        catch (error) {
          log("w", "Aperçu HTTP invité indisponible : " + error.message);
          send({ t: "http-preview-status", usable: false });
          return;
        }
      } else { interactivePreview = false; preview?.stop(); }
      send({ t: "http-preview-status", usable: interactivePreview });
      document.documentElement.toggleAttribute("data-guest-http-preview", interactivePreview);
      document.documentElement.toggleAttribute("data-guest-preview-trusted", interactivePreview && preview?.sameOrigin && preview.trustDecision === true);
      if (interactivePreview) document.documentElement.dataset.guestPreviewOrigin = preview.origin;
      else document.documentElement.removeAttribute("data-guest-preview-origin");
      for (const frame of document.querySelectorAll("#pvFrames iframe"))
        frame.setAttribute("sandbox", guestPreviewSandbox(interactivePreview, {
          previewOrigin: preview?.origin, studioOrigin: location.origin, trustedSameOrigin: preview?.trustDecision === true,
        }));
      if (S.mode === "work" && S.pv) {
        A.pvReload?.().catch(error => log("w", `Aperçu indisponible : ${error.message}`));
      }
    };
    const restoreEngine = installGuestEngine(ctx.engine, rpc);
    const docs = new DocGuest({ lib, send, peer: peerInfo, editorFor, myId: () => session.me.id, onHeadless: headless, onDesync: (p) => log("w", `Resynchronisation de ${p}`) });
    const focus = new FocusLayer({ send: (m, o) => send(m, o), peer: peerInfo, getCtx: ctxState, onViewport: applyViewport, onPeerView, isFollowing: id => collab.following === id, previewInteractive: () => interactivePreview,
      onPreview: m => send({ t: "preview-event", ...m }) });
    const mirror = createMirror({ container: () => document.querySelector("#pvFrames") });
    const sessionsFrame = ctx.engine.sessions?.frame;
    const sessionsList = ctx.engine.sessions?.list;
    const sessionsRouteURL = ctx.engine.sessions?.routeURL;
    if (ctx.engine.sessions) {
      ctx.engine.sessions.routeURL = (_id, path) => {
        if (!interactivePreview || !preview) throw Error("Aperçu invité interactif indisponible.");
        return preview.url(path);
      };
      ctx.engine.sessions.frame = async (_id, path) => ({ src: interactivePreview && preview ? preview.url(path) : "about:blank" });
      ctx.engine.sessions.list = () => [{ id: "host", label: interactivePreview ? "Mon visiteur PHP" : "Aperçu de l’hôte", hue: "#276ac4", short: "invité", cookies: [], hidden: 0 }];
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
        vdirs: new Set(), applied: new Set(), dbDirty: false, saveFail: false, reqs: [], wins: [], cat: null, dbs: [], table: null, pos: {}, layouts: {}, layoutDB: null, layoutDirty: false, layoutVersion: 0,
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
      send({ t: "focus-req" });
      bindAll();
      await setInteractivePreview(!!w.httpPreview);
    });

    const onMessage = guard(({ from, msg }) => {
      if (["http-response", "http-ack", "http-error", "http-cookie-result"].includes(msg.t)) return http.receive(msg);
      switch (msg.t) {
        case "welcome": return enter(msg);
        case "schema-placement": if (from === "h") return schema.receive(msg); return;
        case "network-record": if (from === "h") return receiveNetwork(msg); return;
        case "http-preview-permission": return setInteractivePreview(!!msg.enabled);
        case "pv-scroll": if (!interactivePreview) mirror.scroll(msg.scroll); return;
        case "pv":
          if (interactivePreview) return;
          S.pvInfo.host = msg.info ?? { status: 200, ms: 0 };
          updatePreviewStatus();
          if (msg.path) S.pvPath = msg.path;
          return mirror.receive(msg);
        case "rpc-res": return rpc.handle(msg);
        case "file": case "file-error": case "ops": case "resync": case "caught-up": case "aware": return docs.handle(msg);
        case "qres": return receiveQuery(msg.from ?? from, msg);
        case "focus": return focus.receive(msg.from ?? from, msg);
        case "focus-state": return focus.applySnapshot(msg, "h", session.me?.id);
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
      preview?.stop(); http.close();
      schema.stop(); focus.stop(); unwrapQ(); restoreEngine(); unbindAll();
      document.documentElement.removeAttribute("data-collab-guest");
      document.documentElement.removeAttribute("data-guest-http-preview");
      document.documentElement.removeAttribute("data-guest-preview-trusted");
      document.documentElement.removeAttribute("data-guest-preview-origin");
      if (ctx.engine.sessions && sessionsFrame) { ctx.engine.sessions.frame = sessionsFrame; ctx.engine.sessions.list = sessionsList; ctx.engine.sessions.routeURL = sessionsRouteURL; }
      Object.assign(ctx, { persist: saved.persist, schedulePersist: saved.schedulePersist });
      Object.assign(A, { openFile: saved.openFile, save: saved.save, close: saved.close });
      Object.assign(S, { mode: "launcher", project: null, files: [], base: {}, drafts: {}, tabs: [], active: null, cat: null, dbs: [], table: null, rs: null });
      run = null;
      try { ctx.draw?.(); } catch {}
    }
    run = {
      role: "guest",
      schema, focus,
      local: (path, changes) => docs.local(path, changes),
      cursor: (path, a, h) => docs.cursor(path, a, h),
      reconnect() {
        hello(); send({ t: "focus-req" }); rpc.replay(); docs.catchUpAll();
        if (!interactivePreview) mirror.reapply();
      },
      stop: leaveGuest,
    };
  }

  collab.on("ready", () => {
    if (collab.session.role === "host") { if (!run) startHost(); }
    else startGuest();
  });
  collab.on("status", (s) => { if (s === "closed" && run?.role === "host") { run.stop(); run = null; unbindAll(); } });
  let following = false; // re-entrancy guard: our own navigation must not trigger another follow
  collab.on("follow", guard(async (id, opts = {}) => {
    if (following || !run) return;
    following = true;
    try {
      let st = run.focus?.remote.get(id);
      if (!st?.view && run.role === "guest") { // we never heard from them: ask the host for the full picture
        collab.session.send("h", { t: "focus-req" });
        await new Promise((r) => setTimeout(r, 450));
        st = run.focus?.remote.get(id);
      }
      if (!st?.view) { if (!opts.quiet) log("w", `${peerInfo(id).name} n’a pas encore indiqué où il se trouve.`); return; }
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
          if (st.viewport) applyViewport(st.viewport);
          else if (Array.isArray(st.pan)) { S.pan = [...st.pan]; S.zoom = Number(st.zoom) || 1; }
        }
        S.view = st.view;
        S.dmode = st.dmode || S.dmode;
        if (st.view === "data") await A.refreshData?.();
        ctx.draw?.();
        return;
      }
      const path = st.file || st.active;
      if (path && S.files?.some((f) => f.path === path) && S.active !== path) await A.openFile(path);
      S.view = st.view || "code";
      ctx.draw?.();
    } finally { following = false; }
  }));
}
