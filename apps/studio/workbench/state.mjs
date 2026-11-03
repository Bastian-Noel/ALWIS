import { describeFailure } from "../diagnostics.mjs";
/**
 * État unique du studio + registre d'actions.
 * Les vues lisent S, appellent A.nom() et se redessinent via ctx.draw(). Elles ne se connaissent pas entre elles.
 * Les vues appellent les services réels de services.mjs via ctx.engine.
 */
import { clock, plural } from "./ui.mjs";
export const ctx = { engine: null, draw() {}, shell() {}, views: {} };
export const A = {};
export const eng = () => ctx.engine;

export const S = {
  mode: "launcher",
  view: "code",
  project: null,
  lamp: "off",
  stext: "Prêt",
  alert: null,
  theme: "light",
  /* fichiers */
  files: [],
  vdirs: new Set(),
  openDirs: new Set(["/css", "/lib", "/js"]),
  base: {},
  drafts: {},
  tabs: [],
  active: null,
  conflict: {},
  ren: null,
  exSel: null,
  ff: "",
  exOpen: false,
  applied: new Set(),
  dbDirty: false,
  savedAt: null,
  saveFail: false,
  find: { open: false, i: 0 },
  /* aperçu et sessions */
  pv: false,
  pvDouble: false,
  pvFollow: true,
  pvPath: "/index.php",
  pvSessions: [],
  pvInfo: {},
  wins: [],
  /* données */
  db: "test",
  dbs: [],
  cat: null,
  table: null,
  dmode: "data",
  sort: null,
  filter: null,
  page: 1,
  total: 0,
  grid: null,
  cell: null,
  sel: new Set(),
  rs: null,
  rsi: 0,
  hist: [],
  qtext: "SELECT * FROM eleves;",
  lastSQL: "",
  newTable: false,
  gmsg: "",
  /* schéma */
  layouts: {},
  layoutDB: null,
  pos: {},
  hue: {},
  zoom: 1,
  pan: [24, 24],
  schemaSel: null,
  link: null,
  /* serveur */
  dock: null,
  dockTab: "req",
  lvl: "",
  openLog: new Set(),
  reqs: [],
  logs: [],
};

export function log(level, msg, detail) {
  S.logs.push({
    t: clock(),
    l: level,
    read: S.dock === "log",
    msg: String(msg).slice(0, 1600),
    detail: detail ? String(detail).slice(0, 8192) : undefined,
  });
  if (S.logs.length > 200) S.logs.shift();
}
export function setLamp(lamp, text) {
  S.lamp = lamp;
  if (text !== undefined) S.stext = text;
  ctx.shell();
}
export function fail(title, e) {
  const info = describeFailure(e);
  log(
    "e",
    info.message,
    [info.details, info.recovery].filter(Boolean).join("\n"),
  );
  S.alert = {
    title: title + " · " + info.category,
    msg: info.message,
    recover: e.recover ?? info.recovery,
  };
  setLamp("err", "Erreur — voir le bandeau");
  ctx.draw();
}
let pendingTasks = 0;
export async function task(label, fn) {
  pendingTasks++;
  setLamp("busy", label + "…");
  let failed = false;
  try {
    return await fn();
  } catch (e) {
    failed = true;
    fail("Action impossible.", e);
    return undefined;
  } finally {
    pendingTasks--;
    if (pendingTasks) setLamp("busy", "Opération en cours…");
    else if (!failed) setLamp("ok", "Prêt");
    ctx.schedulePersist?.();
  }
}
/** Exécute du SQL généré, le journalise et marque la base comme modifiée. Lève en cas d'erreur. */
export async function sql(statements, { quiet } = {}) {
  const list = [].concat(statements);
  if (
    S.dbs.find((d) => d.name === S.db)?.system &&
    list.some((s) => !/^\s*(SELECT|SHOW|DESCRIBE|EXPLAIN)\b/i.test(s))
  )
    throw Error("Les bases système sont en lecture seule dans les outils.");
  let last;
  for (const s of list) {
    last = await eng().db.query(s, S.db);
    S.lastSQL = s;
    log("i", "SQL : " + s.replace(/\s+/g, " ").slice(0, 110));
    if (!/^\s*select|^\s*show/i.test(s)) S.dbDirty = true;
  }
  if (!quiet) ctx.shell();
  return last;
}

export const dirty = (p) => p in S.drafts && S.drafts[p] !== S.base[p];
export const drafts = () => Object.keys(S.drafts).filter(dirty);
export function persistState() {
  const d = drafts().length,
    a = S.applied.size + (S.dbDirty ? 1 : 0);
  if (S.saveFail)
    return { lvl: "e", t: "Sauvegarde échouée", l: ["e", "e", "e"] };
  if (d)
    return {
      lvl: "w",
      t: plural(d, "brouillon", "brouillons"),
      l: ["w", "", ""],
    };
  if (a) return { lvl: "w", t: "À sauvegarder", l: ["k", "w", ""] };
  return {
    lvl: "k",
    t: S.savedAt
      ? "Sauvegardé " + clock(new Date(S.savedAt)).slice(0, 5)
      : "À jour",
    l: ["k", "k", "k"],
  };
}
export const sessions = () => eng().sessions.list();
export const sessionOf = (id) =>
  sessions().find((s) => s.id === id) || sessions()[0];

const HUE8 = [212, 162, 28, 338, 48, 190, 100, 275];
export const HUES = HUE8;
export function tableHue(name) {
  if (S.hue[name] != null) return S.hue[name];
  const i = S.cat?.tables.findIndex((t) => t.name === name) ?? -1;
  if (i >= 0) return HUE8[i % 8];
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return HUE8[h % 8];
}
export const hueStyle = (name) => `--h:${tableHue(name)}`;
