// Entry point: only activates on the server edition (GET /api/collab/config answers 200).
import { CollabSession } from "./session.mjs";
import { PresenceUI, closedMessage, showLoading } from "./presence-ui.mjs";
import { Emitter } from "./transport.mjs";
import { S } from "../workbench/state.mjs";

class CollabHub extends Emitter {
  session = null;
  ui = null;
  config = null;
  get active() { return !!this.session && ["live", "reconnecting"].includes(this.session.status); }
  get isHost() { return this.active && this.session.isHost; }
  get isGuest() { return this.active && !this.session.isHost; }
}
export const collab = new CollabHub();
export { showLoading, closedMessage };

function newSession(config) {
  const session = new CollabSession(config);
  collab.session = session;
  collab.ui.attach(session);
  session.on("status", (s, detail) => collab.emit("status", s, detail));
  session.on("ready", (info) => collab.emit("ready", info));
  session.on("message", (m) => collab.emit("message", m));
  session.on("roster", (r) => collab.emit("roster", r));
  session.on("link", (l) => collab.emit("link", l));
  session.on("peer-down", (p) => collab.emit("peer-down", p));
  return session;
}

export async function initCollab() {
  const config = await CollabSession.probe();
  const slot = document.querySelector("#collabSlot");
  if (!config || !slot) return null; // static edition: nothing is added to the interface
  collab.config = config;
  document.documentElement.dataset.collab = "available";
  collab.ui = new PresenceUI({
    slot,
    config: { ...config, canStart: () => S.mode === "work" && !!S.project, projectName: () => S.project },
    onStart: (name) => {
      if (S.mode !== "work" || !S.project) { collab.ui.showNoProject(); return; }
      newSession(config).host(name); collab.ui.toggle(false);
    },
    onLeave: () => { collab.session?.leave(); collab.ui.toggle(false); },
    onFollow: (id) => collab.emit("follow", id),
    onKick: (id) => collab.session?.kick(id),
    onLock: (v) => collab.session?.setLocked(v),
  });
  const url = new URL(location.href);
  const invite = url.searchParams.get("collab");
  if (invite) {
    url.searchParams.delete("collab");
    history.replaceState(null, "", url.pathname + (url.search || "") + url.hash);
  }
  const saved = (() => { try { return JSON.parse(sessionStorage.getItem("alwis-collab-v1") ?? "null"); } catch { return null; } })();
  const prompt = invite && !(saved?.role === "guest" && saved.room === invite.toUpperCase())
    ? collab.ui.askJoin(invite)
    : null;
  let installWiring;
  try {
    ({ installWiring } = await import("./wire.mjs"));
    installWiring(collab);
  } catch (error) {
    collab.ui.announce(`Le partage ne peut pas démarrer : ${error?.message ?? "chargement impossible"}`);
    throw error;
  }
  const join = (room, name) => {
    if (!name) return;
    const session = newSession(config);
    session.on("status", (s, why) => s === "closed" && why && why !== "left" && why !== "kicked" && ["full", "locked", "no-room"].includes(why) && collab.ui.announce(closedMessage(why)));
    session.join(room, name);
  };
  if (invite) {
    if (saved?.role === "guest" && saved.room === invite.toUpperCase()) newSession(config).join(invite, saved.name);
    else join(invite, await prompt);
  } else if (saved?.role === "host") newSession(config).host(saved.name);
  else if (saved?.role === "guest") newSession(config).join(saved.room, saved.name);
  return collab;
}
