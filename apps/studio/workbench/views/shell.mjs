import { ProjectDisk } from "/packages/runtime/src/project-disk.mjs";
import { discardImportedProject } from "../import-progress.mjs";
import { prepareZip } from "../zip-import.mjs";
import { withProjectLoading } from "../project-loading.mjs";
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
  confirmDlg,
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

import { ui, icon } from "../icons.mjs";
import { unusedArchiveName } from "../project-name.mjs";
let launcherExpanded = false;
let projectSavePromise = null;

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
  const guest = document.documentElement.hasAttribute("data-collab-guest");
  $("#primary").hidden = !w || guest;
  $("#sPersist").hidden = !w || guest;
  $("#pname").title = ctx.folder
    ? "Fichiers enregistrés vers le PC ; bases et contexte conservés dans .alwis. Sélectionnez ce dossier pour le rouvrir."
    : "Projet conservé dans ce navigateur. Exportez un ZIP pour une copie externe.";
  $("#pname").textContent = ctx.folder?.name || S.project || "";
  $(".project-caption").textContent = ctx.folder
    ? "Projet ouvert · dossier PC"
    : "Projet ouvert";
  $("#chip").setAttribute(
    "aria-label",
    `Projet ouvert : ${ctx.folder?.name || S.project || ""}. Changer de projet`,
  );
  document
    .querySelectorAll(".project-transfer")
    .forEach((e) => (e.hidden = !w));
  $("#themeBtn").innerHTML = icon(S.theme === "dark" ? "sun" : "moon");
  $("#themeBtn").title =
    S.theme === "dark" ? "Activer le thème clair" : "Activer le thème sombre";
  $("#themeBtn").setAttribute("aria-label", $("#themeBtn").title);
  if (w) {
    const p = persistState();
    $("#ladder").innerHTML = p.l.map((c) => `<i class="${c}"></i>`).join("");
    $("#psum").textContent = p.t;
    $("#psum").dataset.lvl = p.lvl;
    $("#sPersist").innerHTML =
      `<span class="lamp ${p.lvl === "k" ? "ok" : p.lvl === "e" ? "err" : "warn"}"></span>${p.t}`;
    const d = drafts().length,
      a = S.applied.size + (S.dbDirty || S.layoutDirty ? 1 : 0),
      b = $("#primary");
    b.disabled = S.saving || (!d && !a);
    b.setAttribute("aria-busy", String(!!S.saving));
    b.setAttribute("aria-live", "polite");
    b.setAttribute(
      "aria-label",
      S.saving ? "Enregistrement du projet en cours" : d || a ? "Enregistrer le projet" : "Projet enregistré",
    );
    const buttonState = S.saving ? "saving" : d || a ? "pending" : "saved";
    if (b.dataset.saveState !== buttonState) {
      b.dataset.saveState = buttonState;
      b.innerHTML = `${S.saving ? '<span class="save-spinner" aria-hidden="true"></span>' : ui.save}<span>${S.saving ? "Enregistrement…" : d || a ? "Enregistrer" : "Enregistré"}</span>`;
    }
    b.title =
      "Enregistre tous les brouillons et conserve le projet dans ce navigateur.";
  }
  $("#slamp").className =
    "lamp " + ({ ok: "ok", on: "ok", busy: "warn", err: "err" }[S.lamp] || "");
  $("#stext").textContent = S.stext;
  $("#main").setAttribute("aria-busy", String(S.lamp === "busy"));
  const errs = S.logs.filter((l) => l.l === "e" && !l.read).length;
  $("#sCount").textContent = errs ? plural(errs, "erreur", "erreurs") : "";
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
    ? `<div class="alert" role="alert"><span class="alert-ic">${icon("error")}</span><div class="alert-body"><b>${esc(a.title)}</b><p>${esc(a.msg)}</p>${a.recover ? `<p class="alert-recover">${esc(a.recover)}</p>` : ""}</div><div class="alert-actions"><button class="btn sm" data-act="dockTab" data-arg="log">Voir les détails</button><button class="iconbtn" data-act="alertX" aria-label="Masquer l’erreur">${icon("x")}</button></div></div>`
    : "";
}
function drawLauncher() {
  const n = $("#pn").value.trim(),
    R = eng().projects.recents(),
    ex = R.find((r) => r.name === n),
    ok = /^[A-Za-z0-9_-]{1,64}$/.test(n);
  const query = $("#projectFilter").value.trim().toLocaleLowerCase("fr");
  const matches = R.filter((r) =>
    r.name.toLocaleLowerCase("fr").includes(query),
  );
  const shown = query || launcherExpanded ? matches : matches.slice(0, 6);
  $("#welcomeTitle").textContent = R.length
    ? "Reprenez là où vous en étiez."
    : "Commençons par un projet.";
  $("#recentSection").hidden = !R.length;
  $("#recentCount").textContent = R.length;
  $("#recent").innerHTML = shown.length
    ? shown
        .map(
          (r) =>
            `<div class="project-entry"><button class="proj-row" data-act="open" data-arg="${esc(r.name)}" aria-label="Ouvrir le projet ${esc(r.name)}"><b title="${esc(r.name)}">${esc(r.name)}</b><span class="go" aria-hidden="true">→</span><span class="project-meta">${plural(r.files, "fichier", "fichiers")} · ${r.saved ? "Sauvegardé" : "À sauvegarder"}<br>${esc(r.when)}</span></button><button class="btn quiet project-remove" data-act="deleteProject" data-arg="${esc(r.name)}" title="Supprimer le projet du navigateur" aria-label="Supprimer le projet ${esc(r.name)}">${ui.trash}</button></div>`,
        )
        .join("")
    : '<p class="recent-empty" role="status">Aucun projet ne correspond à cette recherche.</p>';
  const more = $("#showRecent");
  more.hidden = !!query || R.length <= 6;
  more.setAttribute("aria-expanded", String(launcherExpanded));
  more.textContent = launcherExpanded
    ? "Afficher moins"
    : `Voir les ${R.length} projets`;
  const h = $("#pnh");
  h.className = "hint project-name-help " + (!n || ok ? "" : "bad");
  h.textContent = !n
    ? "Sans espace, 64 caractères maximum."
    : !ok
      ? "Utilisez des lettres sans accent, des chiffres, - ou _."
      : ex
        ? "Ce projet existe déjà : vous pouvez le rouvrir."
        : "Nom disponible.";
  const b = $("#pgo");
  b.disabled = !ok;
  b.innerHTML =
    (ex ? "Ouvrir le projet" : "Créer le projet") + icon("arrow-right");
  $("#pn").setAttribute("aria-invalid", String(!!n && !ok));
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
  projectMenu(_, el) {
    const recent = eng()
      .projects.recents()
      .filter((r) => r.name !== S.project);
    menu(el || $("#chip"), [
      {
        label: "Tous les projets",
        act: "home",
        icon: ui.folder,
        description: "Revenir à l’accueil pour ouvrir ou créer un projet",
      },
      ...recent.slice(0, 8).map((r) => ({
        label: esc(r.name),
        act: "switchProject",
        arg: r.name,
        icon: ui.folder,
        description:
          "Ouvrir ce projet — les modifications en cours seront proposées à l’enregistrement",
      })),
      "-",
      {
        label: "Exporter le projet en ZIP",
        act: "exportZip",
        icon: ui.download,
        description: "Télécharger une copie des fichiers et des bases",
      },
      ...(ctx.folder
        ? [
            {
              label: "Délier le dossier du PC",
              act: "detachFolder",
              icon: ui.folder,
            },
          ]
        : []),
      { label: "État de l’enregistrement", act: "persist", icon: ui.save },
      { label: "Fermer le projet", act: "close", icon: ui.close },
    ]);
  },
  async deleteProject(name) {
    if (!name) return;
    if (
      !(await confirmDlg(
        "Supprimer « " + name + " » ?",
        "Les fichiers et bases de ce projet seront supprimés du navigateur. Les dossiers du PC et leur configuration .alwis sont conservés.",
        "Supprimer le projet",
        true,
      ))
    )
      return;
    await eng().projects.remove(name);
    draw();
    toast("Projet supprimé du navigateur");
  },
  async detachFolder() {
    if (!ctx.folder) return;
    if (
      !(await confirmDlg(
        "Délier le dossier du PC ?",
        "Le projet reste disponible dans le navigateur. Les prochains enregistrements ne modifieront plus le dossier du PC.",
        "Délier le dossier",
      ))
    )
      return;
    ctx.folder = null;
    draw();
    toast("Dossier délié");
  },
  async switchProject(name) {
    if (!name || name === S.project) return;
    await A.close();
    if (S.mode === "launcher") await A.open(name);
  },
  async close() {
    const d = drafts().length,
      a = S.applied.size + (S.dbDirty || S.layoutDirty ? 1 : 0);
    let keep = true,
      savedDuringClose = false;
    if (d || a) {
      const r = await modal({
        title: "Fermer le projet ?",
        body: `<p class="sec">${d ? plural(d, "brouillon non enregistré", "brouillons non enregistrés") + ". " : ""}${a ? "Des modifications ne sont pas encore sauvegardées dans le navigateur." : ""}</p>`,
        actions: [
          { label: "Annuler", v: "no" },
          { label: "Fermer sans enregistrer", v: "drop", kind: "bad" },
          { label: "Enregistrer et fermer", v: "save", kind: "pri" },
        ],
      });
      if (!r || r === "no") return;
      keep = r === "save";
      if (r === "save") {
        if (!(await A.applyAll())) return;
        await A.save();
        if (S.saveFail) return;
        savedDuringClose = true;
      }
    }
    await ctx.persist?.();
    if (keep && !savedDuringClose) await ctx.folder?.saveContext?.();
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
    ctx.folder = null;
    $("#pn").value = "";
    $("#projectFilter").value = "";
    launcherExpanded = false;
    resetEditor();
    log("i", "Projet fermé");
    draw();
    toast("Projet fermé");
  },
  toggleRecent() {
    launcherExpanded = !launcherExpanded;
    drawLauncher();
  },
  async create() {
    const n = $("#pn").value.trim();
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(n)) return;
    await A.open(n, $("input[name=tpl]:checked").value);
  },
  async open(name, tpl = "demo") {
    return withProjectLoading(
      async (progress) => {
        if (name) $("#pn").value = name;
        name = $("#pn").value.trim();
        const R = eng().projects.recents(),
          ex = R.some((r) => r.name === name);
        const r = await task("Ouverture du projet", () =>
          eng().projects.open(name, ex ? "existing" : tpl, progress),
        );
        if (!r) return;
        Object.assign(S, {
          project: name,
          db: r.defaultDB ?? "test",
          dbCollapsed: false,
          files: [],
          base: {},
          drafts: {},
          tabs: [],
          active: null,
          vdirs: new Set(),
          applied: new Set(),
          dbDirty: false,
          layoutDirty: false,
          layoutVersion: 0,
          savedAt: Date.now(),
          saveFail: false,
          reqs: [],
          wins: [],
          cat: null,
          dbs: [],
          table: null,
          pos: {},
          viewFit: false,
          schemaSel: null,
          pv: false,
          pvDouble: false,
          pvPath: "/index.php",
          pvInfo: {},
          pvHistory: {},
          networkOpen: false,
          networkSelected: null,
          networkTab: "headers",
          phpRun: null,
          conflict: {},
          find: { open: false, i: 0 },
          exSel: null,
          dmode: "data",
          grid: null,
          search: "",
          tableQuery: "",
          filter: null,
          sort: null,
          page: 1,
          newEntry: null,
          ren: null,
        });
        if (r.initialized) {
          S.applied = new Set(["/index.php"]);
          S.savedAt = null;
        }
        S.pvSessions = [sessions()[0].id];
        $("#tableSearch").value = "";
        progress("Lecture des fichiers du projet…");
        resetEditor();
        await refreshFiles();
        progress("Restauration de vos onglets et brouillons…");
        const saved = await eng().projects.loadWorkspace();
        if (saved) {
          S.vdirs = new Set(saved.vdirs ?? []);
          Object.assign(S, {
            db: saved.db ?? r.defaultDB ?? "test",
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
        progress("Ouverture de votre espace de travail…");
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
      { name: name || $("#pn").value.trim() },
    );
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
    if (document.documentElement.hasAttribute("data-collab-guest")) return;
    await A.save();
  },
  save() {
    // Every caller waits for the same checkpoint and runtime restart.
    if (projectSavePromise) return projectSavePromise;
    S.saving = true;
    S.saveFail = false;
    ctx.shell();
    let savedLayoutVersion;
    projectSavePromise = (async () => {
      try {
        // Keep the precise file-conflict diagnostic produced by apply().
        if (!(await A.applyAll())) {
          S.saveFail = true;
          return false;
        }
        const ok = await task("Sauvegarde du projet", async () => {
          await eng().db.close();
          await eng().projects.save();
          savedLayoutVersion = S.layoutVersion;
          await ctx.persist?.();
          await ctx.folder?.saveContext?.();
          return true;
        });
        if (!ok) {
          S.saveFail = true;
          return false;
        }
        S.applied.clear();
        S.dbDirty = false;
        if (S.layoutVersion === savedLayoutVersion) S.layoutDirty = false;
        S.savedAt = Date.now();
        log("i", "Projet sauvegardé dans le navigateur");
        toast("Projet sauvegardé dans ce navigateur");
        return true;
      } catch (error) {
        S.saveFail = true;
        fail("Enregistrement impossible.", error);
        return false;
      } finally {
        S.saving = false;
        ctx.draw();
      }
    })().finally(() => {
      projectSavePromise = null;
    });
    return projectSavePromise;
  },
  persist(_, el) {
    const pending = drafts().length || S.applied.size || S.dbDirty || S.layoutDirty;
    menu(el?.isConnected ? el : $("#chip"), 0, {
      html: `<div class="ph">Enregistrement du projet</div><div class="save-summary"><b>${esc(S.project)}</b><p>${pending ? "Des modifications sont à enregistrer." : "Toutes les modifications sont enregistrées."}</p><p class="hint">${ctx.folder ? "Les fichiers sont écrits dans votre dossier du PC. Les bases et le contexte sont sauvegardés dans .alwis." : "Votre projet est conservé dans ce navigateur. Exportez un ZIP pour une copie externe."}</p>${pending ? '<button class="btn pri" data-act="save">Enregistrer le projet</button>' : ""}${S.savedAt ? `<p class="hint">Dernier enregistrement à ${clock(new Date(S.savedAt)).slice(0, 5)}.</p>` : ""}</div>`,
    });
  },
  async exportZip() {
    if (projectSavePromise && !(await projectSavePromise)) return;
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
      { l: "Enregistrer le projet", s: "Ctrl S", f: A.save },
      { l: "Changer de projet", s: "Projet", f: () => A.projectMenu() },
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
          `<li role="presentation"><button id="palette-option-${i}" role="option" tabindex="-1" data-i="${i}" aria-selected="${i === pSel}">${esc(c.l)}<small class="${/Ctrl|Alt|Maj|^F\d/.test(c.s) ? "shortcut-label" : ""}">${c.s}</small></button></li>`,
      )
      .join("") ||
    '<li role="presentation" class="hint" style="padding:12px">Aucune action.</li>';
  if (pList.length)
    $("#pq").setAttribute("aria-activedescendant", "palette-option-" + pSel);
  else $("#pq").removeAttribute("aria-activedescendant");
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
    Promise.resolve()
      .then(() => fn(b.dataset.arg, b, e))
      .catch((er) => fail("Action impossible.", er));
  });
  document.addEventListener("change", (e) => {
    const t = e.target;
    if (t.dataset.actChange) {
      const fn = A[t.dataset.actChange];
      Promise.resolve()
        .then(() => fn?.(t.dataset.arg ?? t.value, t))
        .catch((er) => fail("Action impossible.", er));
    }
  });
  $("#pn").addEventListener("input", drawLauncher);
  $("#projectFilter").addEventListener("input", drawLauncher);
  $("#pn").addEventListener("keydown", (e) => {
    if (e.key === "Enter" && S.lamp !== "busy") A.create();
  });
  $("#zipIn").addEventListener("change", async (e) => {
    const files = [...e.target.files];
    e.target.value = "";
    if (files.some((f) => /\.zip$/i.test(f.name))) {
      let created,
        staged,
        attached = false;
      try {
        const archive = files.find((f) => /\.zip$/i.test(f.name));
        created = await unusedArchiveName(
          archive.name,
          eng().projects.recents(),
        );
        const occupied = [...eng().projects.recents()];
        while (await ProjectDisk.has(created)) {
          occupied.push({ name: created });
          created = await unusedArchiveName(archive.name, occupied);
        }
        const project = created;
        staged = await prepareZip(archive, project);
        const sources = staged.entries.filter(
          (e) => !e.path.startsWith("/.pbl-backup/"),
        );
        if (S.project) {
          await A.close();
          if (S.project) {
            await staged.discard();
            await ProjectDisk.remove(created);
            return;
          }
        }
        await staged.disk.publish(await staged.disk.prepare(sources));
        await A.open(created, "archive");
        if (S.mode !== "work")
          throw Error("Impossible d’ouvrir le projet importé.");
        attached = true;
        await withProjectLoading(
          async (step) => {
            step("Validation des fichiers et restauration des bases…");
            const backups = [];
            for (const entry of staged.entries.filter((e) =>
              e.path.startsWith("/.pbl-backup/"),
            )) {
              if (entry.size > 8 * 1048576)
                throw Error("Sauvegarde SQL supérieure à 8 Mio.");
              backups.push({
                name: entry.path.slice(1),
                bytes: new Uint8Array(
                  await (await staged.disk.file(entry)).arrayBuffer(),
                ),
              });
            }
            if (backups.length) await eng().projects.importZip(backups);
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
            step("Enregistrement du projet importé…");
            await eng().projects.save();
            await ctx.persist?.();
            await staged.disk.discard(
              staged.entries.filter((e) => e.path.startsWith("/.pbl-backup/")),
            );
            S.applied.clear();
            S.dbDirty = false;
            S.savedAt = Date.now();
          },
          { name: created },
        );
        toast(
          "ZIP ouvert : " + sources.length + " fichier(s) retenu(s).",
          null,
          { kind: "success" },
        );
      } catch (error) {
        if (created && (staged || attached))
          await discardImportedProject(created);
        else if (staged && !attached) await staged.discard();
        if (error.name !== "AbortError")
          await modal({
            title: "ZIP non ouvert",
            body: `<p role="alert">${esc(error.message)}</p><p>Vérifiez que le ZIP est complet et non chiffré. Vous pouvez aussi ouvrir le dossier du PC pour choisir les fichiers utiles.</p>`,
            actions: [{ label: "Fermer", v: "no" }],
          });
      }
    } else if (files.length) {
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
    if (
      e.defaultPrevented ||
      S.lamp === "busy" ||
      document.querySelector("dialog[open]")
    )
      return;
    const m = e.ctrlKey || e.metaKey,
      k = e.key.toLowerCase(),
      w = S.mode === "work";
    if ((m && k === "k") || (m && k === "p" && w)) {
      e.preventDefault();
      openPal();
    } else if (m && k === "s" && w) {
      e.preventDefault();
      A.save();
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
    if (S.mode === "work" && (drafts().length || S.applied.size || S.dbDirty || S.layoutDirty)) {
      e.preventDefault();
      e.returnValue = "";
    }
  });
  addEventListener("hashchange", () => {
    const v = location.hash.slice(1);
    if (S.project && VIEWS.some((x) => x[0] === v) && v !== S.view) A.nav(v);
  });
}
