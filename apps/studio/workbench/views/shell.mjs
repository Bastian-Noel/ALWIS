/** Coque du studio : barre du haut, rail, état, accueil, actions de projet, palette de commandes, raccourcis. */
import {
  $,
  $$,
  esc,
  plural,
  toast,
  menu,
  modal,
  closeMenus,
  clock,
} from "../ui.mjs";
import {
  S,
  A,
  ctx,
  eng,
  log,
  fail,
  task,
  dirty,
  drafts,
  persistState,
  sessions,
} from "../state.mjs";
import { drawCode, drawTabs, resetEditor } from "./code.mjs";
import { refreshFiles } from "./explorer.mjs";
import { drawData, refreshDb } from "./data.mjs";
import { drawSchema } from "./schema.mjs";
import { drawSessions } from "./sessions.mjs";
import { drawDock } from "./dock.mjs";

const VIEWS = [
  ["code", "Code", '<path d="M8 8l-5 4 5 4M16 8l5 4-5 4M14 5l-4 14"/>'],
  [
    "data",
    "Données",
    '<ellipse cx="12" cy="6" rx="8" ry="3"/><path d="M4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/>',
  ],
  [
    "schema",
    "Schéma",
    '<rect x="3" y="4" width="7" height="6" rx="1"/><rect x="14" y="14" width="7" height="6" rx="1"/><path d="M10 7h4v10"/>',
  ],
  [
    "sessions",
    "Sessions",
    '<circle cx="8" cy="8" r="3"/><circle cx="17" cy="9" r="2.4"/><path d="M2.5 19c.6-3.2 2.8-5 5.5-5s4.9 1.8 5.5 5M14.5 14.4c.8-.3 1.6-.4 2.5-.4 2.2 0 3.9 1.4 4.5 4"/>',
  ],
];

export function drawShell() {
  const w = S.mode === "work",
    app = $("#app");
  app.dataset.mode = S.mode;
  app.dataset.lamp = S.lamp;
  $("#chip").hidden = !w;
  $("#primary").hidden = !w;
  $("#sPersist").hidden = !w;
  $("#pname").textContent = S.project || "";
  $("#themeBtn").textContent = S.theme === "dark" ? "Clair" : "Sombre";
  if (w) {
    const p = persistState();
    $("#ladder").innerHTML = p.l.map((c) => `<i class="${c}"></i>`).join("");
    $("#psum").textContent = p.t;
    $("#sPersist").innerHTML =
      `<span class="lamp ${p.lvl === "k" ? "ok" : p.lvl === "e" ? "err" : "warn"}"></span>${p.t}`;
    const d = drafts().length,
      a = S.applied.size + (S.dbDirty ? 1 : 0),
      b = $("#primary");
    b.disabled = !d && !a;
    b.innerHTML = d
      ? "Enregistrer <kbd>Ctrl S</kbd>"
      : a
        ? "Sauvegarder"
        : "À jour";
  }
  $("#slamp").className =
    "lamp " + ({ ok: "ok", on: "ok", busy: "warn", err: "err" }[S.lamp] || "");
  $("#stext").textContent = S.stext;
  const errs = S.logs.filter((l) => l.l === "e").length;
  $("#sCount").textContent = errs
    ? plural(errs, "erreur", "erreurs")
    : S.reqs.length
      ? plural(S.reqs.length, "requête", "requêtes")
      : "";
  $("#sDock").setAttribute("aria-expanded", !!S.dock);
  $("#rail").innerHTML =
    VIEWS.map(
      ([id, l, ic]) =>
        `<button data-act="nav" data-arg="${id}" ${S.view === id ? 'aria-current="page"' : ""}><svg viewBox="0 0 24 24" aria-hidden="true">${ic}</svg>${l}${id === "sessions" && S.wins.length ? `<span class="badge num">${S.wins.length}</span>` : ""}</button>`,
    ).join("") +
    `<span class="sp"></span><button class="minor" data-act="dockToggle"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 15h18"/></svg>Serveur${errs ? `<span class="badge num">${errs}</span>` : ""}</button>`;
}
export function drawAlert() {
  const a = S.alert;
  $("#alertHost").innerHTML = a
    ? `<div class="alert" role="alert"><div class="grow"><p><b>${esc(a.title)}</b> ${esc(a.msg)}</p>${a.recover ? `<p>${esc(a.recover)}</p>` : ""}</div><button class="btn sm" data-act="dockTab" data-arg="log">Voir les détails</button><button class="btn quiet sm" data-act="alertX" aria-label="Masquer l’erreur">✕</button></div>`
    : "";
}
function drawLauncher() {
  const n = $("#pn").value.trim(),
    R = eng().projects.recents(),
    ex = R.find((r) => r.name === n),
    ok = /^[A-Za-z0-9_-]{1,64}$/.test(n);
  $("#recent").innerHTML = R.length
    ? R.map(
        (r) =>
          `<button class="proj-row" data-act="open" data-arg="${esc(r.name)}"><b>${esc(r.name)}</b><span class="go">Ouvrir →</span><span class="mut num">${plural(r.files, "fichier", "fichiers")} · ${r.saved ? "sauvegardé" : "non sauvegardé"} · ${esc(r.when)}</span></button>`,
      ).join("")
    : '<div class="empty" style="margin:0;padding:16px 12px"><b>Aucun projet ici.</b>Créez le premier à droite : l’exemple scolaire montre PHP, MariaDB et deux sessions en trois minutes.</div>';
  const h = $("#pnh");
  h.className = "hint " + (!n ? "" : !ok ? "bad" : ex ? "good" : "");
  h.textContent = !n
    ? "Lettres, chiffres, tirets et underscore. 64 caractères maximum."
    : !ok
      ? "Nom invalide : lettres, chiffres, tirets et underscore uniquement."
      : ex
        ? "Ce projet existe déjà : il sera ouvert, pas écrasé."
        : "Nom disponible.";
  const b = $("#pgo");
  b.disabled = !ok;
  b.textContent = ex ? "Ouvrir le projet" : "Créer le projet";
  $$("input[name=tpl]").forEach((i) => (i.disabled = !!ex));
  const v = eng().env();
  $("#env").innerHTML =
    `<span><i class="lamp ok"></i>PHP ${v.php}</span><span><i class="lamp ok"></i>${v.maria}</span><span><i class="lamp ${v.isolated ? "ok" : "err"}"></i>Isolation inter-origines ${v.isolated ? "active" : "absente"}</span><span><i class="lamp ${v.persistent ? "ok" : "warn"}"></i>Stockage local du navigateur</span><span class="mut">moteur natif</span>`;
}
export function draw() {
  drawShell();
  drawAlert();
  $("#launcher").hidden = S.mode !== "launcher";
  $("#ws").hidden = S.mode !== "work";
  drawDock();
  if (S.mode === "launcher") {
    drawLauncher();
    return;
  }
  $$(".view").forEach((v) => (v.hidden = v.id !== "v-" + S.view));
  ({
    code: drawCode,
    data: drawData,
    schema: drawSchema,
    sessions: drawSessions,
  })[S.view]?.();
}

/* ───────── actions de projet ───────── */
Object.assign(A, {
  home() {
    if (S.mode === "work") return A.close();
    S.mode = "launcher";
    draw();
  },
  async close() {
    const d = drafts().length,
      a = S.applied.size + (S.dbDirty ? 1 : 0);
    let keep = true;
    if (d || a) {
      const r = await modal({
        title: "Fermer le projet ?",
        body: `<p class="sec">${d ? plural(d, "brouillon non enregistré", "brouillons non enregistrés") + ". " : ""}${a ? "Des modifications ne sont pas encore sauvegardées dans le navigateur." : ""}</p>`,
        actions: [
          { label: "Annuler", v: "no" },
          { label: "Fermer sans sauvegarder", v: "drop", kind: "bad" },
          { label: "Sauvegarder et fermer", v: "save", kind: "pri" },
        ],
      });
      if (!r || r === "no") return;
      keep = r === "save";
      if (r === "save") {
        if (!(await A.applyAll())) return;
        await A.save();
        if (S.saveFail) return;
      }
    }
    await ctx.persist?.();
    await eng().db.close();
    await eng().projects.close({ save: keep });
    Object.assign(S, {
      mode: "launcher",
      project: null,
      tabs: [],
      active: null,
      drafts: {},
      dock: null,
      alert: null,
    });
    resetEditor();
    log("i", "Projet fermé");
    draw();
    toast("Projet fermé");
  },
  async create() {
    const n = $("#pn").value.trim();
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(n)) return;
    await A.open(n, $("input[name=tpl]:checked").value);
  },
  async open(name, tpl = "demo") {
    if (name) $("#pn").value = name;
    name = $("#pn").value.trim();
    const R = eng().projects.recents(),
      ex = R.some((r) => r.name === name);
    const r = await task("Ouverture du projet", () =>
      eng().projects.open(name, ex ? "existing" : tpl),
    );
    if (!r) return;
    Object.assign(S, {
      project: name,
      files: [],
      base: {},
      drafts: {},
      tabs: [],
      active: null,
      vdirs: new Set(),
      applied: new Set(),
      dbDirty: false,
      savedAt: Date.now(),
      saveFail: false,
      reqs: [],
      wins: [],
      cat: null,
      dbs: [],
      table: null,
      db: "test",
      pos: {},
      viewFit: false,
      schemaSel: null,
      pv: false,
      pvDouble: false,
      pvPath: "/index.php",
      pvInfo: {},
      conflict: {},
      find: { open: false, i: 0 },
      exSel: null,
      dmode: "data",
      grid: null,
    });
    if (r.initialized) {
      S.applied = new Set(["/index.php"]);
      S.savedAt = null;
    }
    S.pvSessions = [sessions()[0].id];
    resetEditor();
    await refreshFiles();
    const saved = await eng().projects.loadWorkspace();
    if (saved) {
      S.vdirs = new Set(saved.vdirs ?? []);
      Object.assign(S, {
        db: saved.db ?? "test",
        qtext: saved.query ?? "SELECT 1;",
        hist: saved.queryHistory ?? [],
        table: saved.table ?? null,
        tabs: saved.tabs ?? [],
        active: saved.active ?? null,
        base: saved.base ?? {},
        drafts: saved.drafts ?? {},
        pos: saved.pos ?? {},
        layouts: saved.layouts ?? {},
        layoutDB: null,
        hue: saved.hue ?? {},
      });
    }
    if (!ex)
      R.unshift({
        name,
        files: S.files.length,
        when: "à l’instant",
        saved: false,
      });
    S.mode = "work";
    S.view = "code";
    log("i", `Projet « ${name} » ouvert`);
    if (S.active && S.files.some((f) => f.path === S.active))
      await A.openFile(S.active);
    else if (S.files.some((f) => f.path === "/index.php"))
      await A.openFile("/index.php");
    else draw();
    toast(`« ${name} » ouvert`);
  },
  async nav(v) {
    if (!S.project) return;
    S.view = v;
    history.replaceState(null, "", "#" + v);
    if (v === "data" || v === "schema") {
      if (!eng().db.ready) {
        ctx.draw();
        await task("Initialisation de MariaDB", async () => {
          await eng().db.init();
          log("i", "MariaDB initialisée (démarrage à la demande)");
        });
      }
      await task("Lecture de la base", () => refreshDb({ rows: v === "data" }));
      if (v === "schema") S.viewFit = false;
    }
    ctx.draw();
  },
  async primary() {
    if (drafts().length) await A.applyAll();
    else if (S.applied.size || S.dbDirty) await A.save();
  },
  async save() {
    S.saveFail = false;
    const ok = await task("Sauvegarde du projet", async () => {
      if (!(await A.applyAll()))
        throw Error("Certains brouillons n’ont pas pu être enregistrés.");
      await eng().db.close();
      await eng().projects.save();
      await ctx.persist?.();
      return true;
    });
    if (!ok) {
      S.saveFail = true;
      ctx.draw();
      return;
    }
    S.applied.clear();
    S.dbDirty = false;
    S.savedAt = Date.now();
    log("i", "Projet sauvegardé dans le navigateur");
    ctx.draw();
    toast("Projet sauvegardé dans ce navigateur");
  },
  persist(_, el) {
    const d = drafts().length,
      a = S.applied.size + (S.dbDirty ? 1 : 0);
    const row = (k, sub, btn) =>
      `<div style="display:grid;grid-template-columns:1fr auto;gap:2px 10px;padding:6px 10px;align-items:center"><b>${k}</b>${btn || "<span></span>"}<span class="sec" style="grid-column:1/3">${sub}</span></div>`;
    menu(el || $("#chip"), 0, {
      html:
        `<div class="ph">Où sont vos modifications ?</div>` +
        row(
          "Brouillon",
          d
            ? plural(d, "fichier", "fichiers") + " seulement dans l’éditeur."
            : "Rien en attente.",
          d
            ? '<button class="btn sm pri" data-act="applyAll">Enregistrer</button>'
            : "",
        ) +
        row(
          "Appliqué",
          a
            ? `${S.applied.size ? plural(S.applied.size, "fichier", "fichiers") + " lus par PHP" : ""}${S.applied.size && S.dbDirty ? " et " : ""}${S.dbDirty ? "des changements du projet" : ""}, perdus si l’onglet se ferme.`
            : "Tout est sauvegardé.",
          a
            ? '<button class="btn sm pri" data-act="save">Sauvegarder</button>'
            : "",
        ) +
        row(
          "Conservé",
          S.savedAt
            ? "Dernière sauvegarde à " +
                clock(new Date(S.savedAt)).slice(0, 5) +
                "."
            : "Jamais sauvegardé.",
        ) +
        '<hr><button class="mi" data-act="exportZip">Exporter le projet en ZIP</button><button class="mi" data-act="importZip">Importer un ZIP ou des fichiers</button><button class="mi" data-act="close" style="color:var(--err)">Fermer le projet</button>',
    });
  },
  async exportZip() {
    if (!(await A.applyAll())) return;
    await eng().projects.exportZip();
    toast("Export ZIP : fichiers et bases actives (sessions exclues)");
  },
  importZip() {
    $("#zipIn").click();
  },
  docsHost() {
    window.open(
      "https://github.com/Bastian-Noel/ALWIS/blob/main/docs/deployment.md",
      "_blank",
      "noopener",
    );
  },
  unblock() {
    $("#blocked").hidden = true;
  },
  theme() {
    const n = S.theme === "dark" ? "light" : "dark";
    S.theme = n;
    document.documentElement.dataset.theme = n;
    try {
      localStorage.setItem("alwis-theme", n);
    } catch {
      /* stockage indisponible */
    }
    drawShell();
  },
  alertX() {
    S.alert = null;
    ctx.draw();
  },
  nothing() {},
});

/* ───────── palette ───────── */
let pSel = 0,
  pList = [];
function cmds() {
  const w = S.mode === "work",
    c = [];
  if (w) {
    S.files
      .filter((f) => f.kind === "text")
      .forEach((f) =>
        c.push({ l: f.path, s: "Fichier", f: () => A.openFile(f.path) }),
      );
    c.push(
      { l: "Aller au code", s: "Espace", f: () => A.nav("code") },
      { l: "Aller aux données", s: "Espace", f: () => A.nav("data") },
      { l: "Aller au schéma", s: "Espace", f: () => A.nav("schema") },
      { l: "Aller aux sessions", s: "Espace", f: () => A.nav("sessions") },
      { l: "Nouveau fichier", s: "Fichiers", f: () => A.newFile() },
      { l: "Nouveau dossier", s: "Fichiers", f: () => A.newFolder() },
      { l: "Enregistrer le fichier", s: "Ctrl S", f: () => A.apply() },
      { l: "Sauvegarder le projet", s: "Ctrl Maj S", f: A.save },
      {
        l: "Afficher ou masquer l’aperçu",
        s: "Ctrl ⏎",
        f: () => {
          A.nav("code");
          A.pvToggle();
        },
      },
      { l: "Comparer deux sessions côte à côte", s: "Aperçu", f: A.compare },
      {
        l: "Ouvrir la page dans une fenêtre",
        s: "Sessions",
        f: () => A.openWindow(),
      },
      { l: "Nouvelle session", s: "Sessions", f: A.newIdent },
      {
        l: "Nouvelle table",
        s: "Données",
        f: () => {
          A.nav("data").then(() => A.quickTableStart());
        },
      },
      {
        l: "Exécuter une requête SQL",
        s: "Données",
        f: () => {
          S.dmode = "sql";
          A.nav("data");
        },
      },
      {
        l: "Réorganiser le schéma",
        s: "Schéma",
        f: () => A.nav("schema").then(A.schemaLayout),
      },
      {
        l: "Afficher les requêtes du serveur",
        s: "Ctrl J",
        f: () => A.dockTab("req"),
      },
      { l: "Exporter le projet en ZIP", s: "Projet", f: A.exportZip },
      { l: "Fermer le projet", s: "Projet", f: A.close },
    );
  }
  c.push({ l: "Changer de thème", s: "Apparence", f: A.theme });
  return c;
}
function palDraw() {
  const q = $("#pq").value.toLowerCase();
  pList = cmds()
    .filter((c) => c.l.toLowerCase().includes(q))
    .slice(0, 40);
  pSel = Math.min(pSel, Math.max(0, pList.length - 1));
  $("#pl").innerHTML =
    pList
      .map(
        (c, i) =>
          `<li><button role="option" data-i="${i}" aria-selected="${i === pSel}">${esc(c.l)}<small>${c.s}</small></button></li>`,
      )
      .join("") || '<li class="hint" style="padding:12px">Aucune action.</li>';
}
export function openPal(q = "") {
  $("#pq").value = q;
  pSel = 0;
  palDraw();
  $("#pal").showModal();
  $("#pq").focus();
}
A.palette = () => openPal();

export function bindShell() {
  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-act]");
    if (
      !b ||
      b.disabled ||
      (S.lamp === "busy" && !["alertX", "unblock"].includes(b.dataset.act))
    )
      return;
    const fn = A[b.dataset.act];
    if (!fn) return;
    Promise.resolve(fn(b.dataset.arg, b, e)).catch((er) =>
      fail("Action impossible.", er),
    );
  });
  document.addEventListener("change", (e) => {
    const t = e.target;
    if (t.dataset.actChange) {
      const fn = A[t.dataset.actChange];
      Promise.resolve(fn?.(t.dataset.arg ?? t.value, t)).catch((er) =>
        fail("Action impossible.", er),
      );
    }
  });
  $("#pn").addEventListener("input", drawLauncher);
  $("#pn").addEventListener("keydown", (e) => {
    if (e.key === "Enter") A.create();
  });
  $("#zipIn").addEventListener("change", async (e) => {
    const files = [...e.target.files];
    e.target.value = "";
    if (files.some((f) => /\.zip$/i.test(f.name)))
      await task("Import ZIP", async () => {
        if (S.mode === "launcher") {
          const name = $("#pn").value.trim();
          if (!/^[A-Za-z0-9_-]{1,64}$/.test(name))
            throw Error("Choisissez un nom de projet avant l’import.");
          await A.open(name, "archive");
          if (S.mode !== "work") return;
        }
        S.applied.add("archive");
        await eng().projects.importZip(files[0]);
        await refreshFiles();
        S.dbDirty = true;
        S.applied.add("archive");
        S.base = {};
        S.drafts = {};
        S.tabs = [];
        S.active = null;
        resetEditor();
        ctx.draw();
        if (S.files.some((f) => f.path === "/index.php"))
          await A.openFile("/index.php");
      });
    else if (files.length) {
      await A.exImport(files, "/");
    }
  });
  $("#pq").addEventListener("input", () => {
    pSel = 0;
    palDraw();
  });
  $("#pl").addEventListener("click", (e) => {
    const b = e.target.closest("[data-i]");
    if (b) {
      $("#pal").close();
      pList[+b.dataset.i].f();
    }
  });
  $("#pq").addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      pSel = Math.min(pList.length - 1, pSel + 1);
      palDraw();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      pSel = Math.max(0, pSel - 1);
      palDraw();
    } else if (e.key === "Enter") {
      e.preventDefault();
      const c = pList[pSel];
      $("#pal").close();
      c?.f();
    }
  });
  addEventListener("keydown", (e) => {
    if (e.defaultPrevented || S.lamp === "busy") return;
    const m = e.ctrlKey || e.metaKey,
      k = e.key.toLowerCase(),
      w = S.mode === "work";
    if ((m && k === "k") || (m && k === "p" && w)) {
      e.preventDefault();
      openPal();
    } else if (m && k === "s" && w) {
      e.preventDefault();
      e.shiftKey
        ? A.save()
        : S.view === "code" && S.active
          ? A.apply()
          : A.applyAll();
    } else if (m && k === "j" && w) {
      e.preventDefault();
      A.dockToggle();
    } else if (m && k === "f" && w && S.view === "code" && S.active) {
      e.preventDefault();
      S.find.open ? $("#fq").focus() : A.find();
    } else if (m && e.key === "Enter" && w && S.view === "code") {
      e.preventDefault();
      A.pvToggle();
    } else if (k === "escape" && S.find.open && !$("#modal").open) A.find();
  });
  addEventListener("beforeunload", (e) => {
    if (S.mode === "work" && (drafts().length || S.applied.size || S.dbDirty)) {
      e.preventDefault();
      e.returnValue = "";
    }
  });
  addEventListener("hashchange", () => {
    const v = location.hash.slice(1);
    if (S.project && VIEWS.some((x) => x[0] === v) && v !== S.view) A.nav(v);
  });
}
