import {
  bindPreviewFrame,
  updateBrowserButtons,
  recordPreviewPath,
} from "../preview-browser.mjs";
import { drawNetwork } from "./network.mjs";
import { guestPreviewSandbox } from "../../collab/preview-security.mjs";
/** Espace Code : onglets, éditeur, recherche, aperçu lié aux sessions et ouverture de fenêtres clientes. */
import {
  $,
  $$,
  esc,
  plural,
  toast,
  menu,
  at,
  modal,
  mkEditor,
  LANGS,
  langOf,
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
  sessions,
  sessionOf,
} from "../state.mjs";
import { fileIcon, fileKind, isWeb, ui, icon } from "../icons.mjs";
import { drawExplorer, refreshFiles, dirOf, nameOf } from "./explorer.mjs";

let markdownTimer;
let ed = null,
  edFile = null;
const isPage = (p) =>
  (isWeb(p) || /\.md$/i.test(p)) &&
  !/^\/(lib|includes?|inc|vendor|src|config)\//.test(p);
const sw = (s) => `<span class="sw" style="background:${s.hue}"></span>`;

function tabsHtml() {
  return S.tabs
    .map(
      (t, i) =>
        `<div class="tab" role="presentation">${fileIcon(t)}<button id="file-tab-${i}" role="tab" aria-description="Flèches pour choisir un onglet, Entrée pour l’ouvrir, Suppr pour le fermer." data-act="openFile" data-arg="${esc(t)}" class="trunc" aria-selected="${t === S.active}" tabindex="${t === S.active ? 0 : -1}" aria-controls="${S.files.find((f) => f.path === t)?.kind === "text" ? "ed1" : "edBin"}" aria-label="${esc(nameOf(t))}${dirty(t) ? ", modifié" : ""}">${esc(nameOf(t))}</button>${dirty(t) ? '<i class="d" title="Brouillon non enregistré"></i>' : ""}<button class="c" tabindex="-1" aria-hidden="true" data-act="closeTab" data-arg="${esc(t)}" aria-label="Fermer ${esc(nameOf(t))}">${icon("x")}</button></div>`,
    )
    .join("");
}
export function drawTabs() {
  $("#tabs").innerHTML = tabsHtml();
  $('#tabs [aria-selected="true"]')?.scrollIntoView({
    block: "nearest",
    inline: "nearest",
  });
  for (const panel of [$("#ed1"), $("#edBin")]) {
    if (S.tabs.includes(S.active))
      panel.setAttribute(
        "aria-labelledby",
        "file-tab-" + S.tabs.indexOf(S.active),
      );
    else panel.removeAttribute("aria-labelledby");
  }
}

export function drawCode() {
  const p = S.active,
    info = p && S.files.find((f) => f.path === p),
    isText = !!p && info?.kind === "text" && p in S.base;
  $("#cgrid").className = "cgrid" + (S.pv ? " pv" : "");
  $("#cgrid").dataset.ex = S.exOpen ? "on" : "";
  drawExplorer();
  drawTabs();
  $("#crumb").innerHTML = p
    ? p
        .split("/")
        .filter(Boolean)
        .map((s, i, a) =>
          i === a.length - 1
            ? `<b>${esc(s)}</b>`
            : `<span class="mut">${esc(s)}</span><span class="mut">/</span>`,
        )
        .join("")
    : '<span class="mut">Aucun fichier ouvert</span>';
  $("#ficon").innerHTML = p ? fileIcon(p) : "";
  const cur = sessionOf(S.pvSessions[0]);
  $("#runBtn").innerHTML = `${ui.play}<span>Aperçu</span>${cur ? sw(cur) : ""}`;
  $("#runBtn").setAttribute("aria-pressed", S.pv);
  $("#runBtn").disabled = false;
  $("#ed1").hidden = !isText;
  if (S.editorUnloaded)
    $("#ed1").innerHTML =
      '<div class="empty"><b>Éditeur déchargé</b><button class="btn" data-act="activateEditor">Réactiver l’éditeur</button></div>';
  $("#edEmpty").hidden = !!p;
  $("#edBin").hidden = !(p && !isText);
  $("#edFoot").hidden = !isText;
  $("#findbar").hidden = !S.find.open || !isText;
  const cf = $("#conflict");
  cf.hidden = !(p && S.conflict[p]);
  if (p && S.conflict[p])
    cf.innerHTML = `<div class="alert" style="margin:0"><div class="grow"><p><b>Ce fichier a changé dans le projet.</b> Un autre onglet ou une fenêtre l’a modifié depuis son ouverture.</p></div><button class="btn sm" data-act="conflictReload">Recharger</button><button class="btn sm" data-act="conflictKeep">Garder mon brouillon</button></div>`;
  if (p && !isText && info)
    $("#edBin").innerHTML =
      info.kind === "bin"
        ? `<b>${esc(nameOf(p))}</b><span>Fichier binaire de ${Math.round(info.size / 1024)} Kio. Les fichiers binaires ne s’éditent pas ici.</span><button class="btn" data-act="downloadFile">Télécharger</button>`
        : `<b>Fichier trop volumineux pour l’éditeur</b><span>${esc(nameOf(p))} fait ${(info.size / 1048576).toFixed(1).replace(".", ",")} Mio ; la limite d’édition est de 1 Mio. Consultez un extrait ou téléchargez-le.</span>${["code", "text", "svg"].includes(info.storeKind) ? '<button class="btn" data-act="previewText">Voir les 64 premiers Kio</button>' : ""}<button class="btn" data-act="downloadFile">Télécharger</button>`;
  if (isText) {
    if (!ed && !S.editorUnloaded)
      ed = mkEditor($("#ed1"), {
        lang: "php",
        onSave: () => A.save(),
        onCursor: (l, c) => ($("#pos").textContent = `Ln ${l}, col ${c}`),
        onInput(v) {
          if (v === S.base[S.active]) delete S.drafts[S.active];
          else S.drafts[S.active] = v;
          drawExplorer();
          drawTabs();
          ctx.shell();
          ctx.schedulePersist?.();
          if (S.find.open) A.findUpdate();
          if (S.pv && S.pvPath === S.active && /\.md$/i.test(S.active)) {
            clearTimeout(markdownTimer);
            markdownTimer = setTimeout(() => A.pvReload(), 200);
          }
        },
      });
    if (edFile !== p) {
      edFile = p;
      ed?.set(S.drafts[p] ?? S.base[p], langOf(p), p);
      S.find.i = 0;
    }
    $("#lang").innerHTML =
      `${fileIcon(p)}<span>${LANGS[(p.split(".").pop() || "").toLowerCase()] || fileKind(p)}</span>`;
  } else edFile = null;
  drawPv();
}
export const resetEditor = () => {
  clearTimeout(markdownTimer);
  ed?.destroy();
  ed = null;
  edFile = null;
};

/* ───────── Aperçu ───────── */
function frameHead(i) {
  const s = sessionOf(S.pvSessions[i]),
    r = S.pvInfo[s.id];
  return `<div class="fhead"><button class="btn sm" data-act="pvPickSession" data-arg="${i}" aria-haspopup="true">${sw(s)}${esc(s.label)}${icon("chevron-down", "sm")}</button><span class="grow"></span>${r ? `<span class="st2 s${String(r.status)[0]}">${r.status}</span><span class="num mut">${r.ms} ms</span>` : '<span class="mut">pas encore chargé</span>'}</div>`;
}
export function updatePreviewStatus() {
  const box = $("#pvFrames");
  if (!box) return;
  $$(".fhead-h", box).forEach((head, i) => (head.innerHTML = frameHead(i)));
}
export function drawPv() {
  const box = $("#pvFrames");
  const want = S.pvDouble ? 2 : 1;
  if (box.children.length !== want) {
    box.innerHTML = Array.from(
      { length: want },
      (_, i) =>
        `<div class="pv-cell"><div class="fhead-h" data-i="${i}"></div><div class="pv-frame"><iframe title="Aperçu ${i + 1}" sandbox="allow-scripts allow-forms allow-same-origin"></iframe></div></div>`,
    ).join("");
    $$("iframe", box).forEach(bindPreviewFrame);
  }
  // The guest is on the studio origin until dedicated preview-origin deployment exists.
  // Reapply on EVERY render, including when the iframe nodes are recycled.
  if (document.documentElement.hasAttribute("data-collab-guest")) {
    const sandbox = guestPreviewSandbox(document.documentElement.hasAttribute("data-guest-http-preview"), {
      previewOrigin: document.documentElement.dataset.guestPreviewOrigin,
      trustedSameOrigin: document.documentElement.hasAttribute("data-guest-preview-trusted"),
      studioOrigin: location.origin,
    });
    $$("iframe", box).forEach(frame => frame.setAttribute("sandbox", sandbox));
  }
  box.dataset.n = want;
  $$(".fhead-h", box).forEach((h, i) => (h.innerHTML = frameHead(i)));
  $("#pvPath").value = S.pvPath;
  $("#pvFollow").setAttribute("aria-pressed", S.pvFollow);
  $("#pvDouble").setAttribute("aria-pressed", S.pvDouble);
  updateBrowserButtons();
  drawNetwork();
}
Object.assign(A, {
  activateEditor() {
    return A.toolState("editor", "active");
  },
  editorIndent() {
    return ed?.model.chooseIndent();
  },
  editorFormat() {
    return ed?.model.format();
  },
  editorEmmet() {
    return ed?.model.emmet();
  },
  editorDefinition() {
    return ed?.model.navigate("definition");
  },
  editorReferences() {
    return ed?.model.navigate("references");
  },
  editorSymbols() {
    return ed?.model.outline();
  },
  editorProjectSearch() {
    return ed?.model.projectSearch();
  },
  editorRename() {
    return ed?.model.renameSymbol();
  },
  editorSearch() {
    ed?.model.search();
  },
  editorProblems() {
    ed?.model.problems();
  },
  async previewText() {
    if (!S.active) return;
    const text = await eng().fs.preview(S.active);
    await modal({
      title: "Extrait de " + nameOf(S.active),
      wide: true,
      body:
        '<p>Lecture limitée à 64 Kio. Le fichier complet reste sur disque.</p><pre style="white-space:pre-wrap;overflow-wrap:anywhere;max-height:55vh;overflow:auto">' +
        esc(text) +
        "</pre>",
      actions: [{ label: "Fermer", v: "no" }],
    });
  },
  async downloadFile() {
    if (S.active) await eng().fs.download(S.active);
  },
  async openFile(p, trigger, event) {
    if (!S.tabs.includes(p) && S.tabs.length >= 40)
      throw Error(
        "40 onglets maximum. Fermez un fichier avant d’en ouvrir un autre.",
      );
    const info = S.files.find((f) => f.path === p);
    if (!info) throw Error("Fichier absent du projet.");
    if (info.kind === "text" && !(p in S.base)) {
      const result = await eng().fs.read(p);
      if (result.text === undefined) info.kind = "bin";
      else {
        const retained =
          Object.values(S.base).reduce((n, t) => n + (t?.length ?? 0), 0) +
          Object.values(S.drafts).reduce((n, t) => n + t.length, 0);
        if (retained + result.text.length > 8 * 1024 * 1024)
          throw Error(
            "Budget des fichiers ouverts atteint (8 M caractères). Fermez des onglets.",
          );
        S.base[p] = result.text;
      }
    }
    if (!S.tabs.includes(p)) S.tabs.push(p);
    S.active = p;
    S.view = "code";
    S.exSel = p;
    S.exOpen = false;
    for (let d = dirOf(p); d && d !== "/"; d = dirOf(d)) S.openDirs.add(d);
    const follow = S.pv && S.pvFollow && isPage(p);
    if (follow) S.pvPath = p;
    ctx.draw();
    if (follow) A.pvReload();
    ctx.schedulePersist?.();
    requestAnimationFrame(() => {
      if (trigger?.getAttribute("role") === "tab" && event?.detail === 0)
        $("#tabs [aria-selected=true]")?.focus();
      else ed?.focus();
    });
  },
  async closeTab(p) {
    const restoreTabFocus =
      document.activeElement?.closest("#tabs") &&
      document.activeElement.dataset.arg === p;
    if (dirty(p)) {
      const r = await modal({
        title: "Fermer ce fichier ?",
        body: `<p class="sec"><b>${esc(p)}</b> contient un brouillon non enregistré.</p>`,
        actions: [
          { label: "Annuler", v: "no" },
          { label: "Ne pas enregistrer", v: "drop", kind: "bad" },
          { label: "Enregistrer", v: "save", kind: "pri" },
        ],
      });
      if (!r || r === "no") return;
      if (r === "save") {
        await A.save();
        if (S.saveFail) return;
      }
    }
    const i = S.tabs.indexOf(p);
    S.tabs.splice(i, 1);
    delete S.drafts[p];
    delete S.base[p];
    delete S.conflict[p];
    if (S.active === p) {
      S.active = S.tabs[Math.max(0, i - 1)] ?? null;
      edFile = null;
    }
    ctx.draw();
    if (restoreTabFocus) {
      const next =
        $("#tabs [aria-selected=true]") || $('#v-code [data-act="newFile"]');
      next?.focus({ preventScroll: true });
    }
  },
  async apply(p = S.active, quiet) {
    if (S.toolModes?.editor === "sleep")
      throw Error("Réactivez l’éditeur avant d’enregistrer.");
    if (!p || !dirty(p)) return quiet ? true : toast("Rien à enregistrer");
    if (S.conflict[p]) {
      S.alert = {
        title: "Enregistrement refusé.",
        msg: "Le fichier a changé dans le projet depuis son ouverture.",
        recover:
          "Utilisez « Recharger » ou « Garder mon brouillon » dans le bandeau du fichier.",
      };
      ctx.draw();
      return false;
    }
    const ok = await task("Écriture de " + p, async () => {
      await eng().fs.write(p, S.drafts[p], S.base[p] ?? null);
      if (ctx.folder) {
        try {
          await ctx.folder.write(p, S.drafts[p]);
        } catch (error) {
          // Keep the draft retryable if the PC file changed or access was revoked.
          await eng().fs.write(p, S.base[p] ?? "", S.drafts[p]);
          throw error;
        }
      }
      S.base[p] = S.drafts[p];
      delete S.drafts[p];
      S.applied.add(p);
      await refreshFiles();
      log("i", "Fichier écrit : " + p);
      return true;
    });
    if (ok && !quiet) toast(nameOf(p) + " enregistré");
    ctx.draw();
    if (ok && S.pv) A.pvReload();
    return !!ok;
  },
  async applyAll() {
    const d = Object.keys(S.drafts).filter(dirty);
    for (const p of d) if (!(await A.apply(p, true))) break;
    if (d.some(dirty)) return false;
    if (d.length)
      toast(plural(d.length, "fichier enregistré", "fichiers enregistrés"));
    return true;
  },
  conflictReload() {
    const p = S.active;
    delete S.drafts[p];
    delete S.conflict[p];
    delete S.base[p];
    edFile = null;
    A.openFile(p);
    toast("Fichier rechargé depuis le projet");
  },
  conflictKeep() {
    delete S.conflict[S.active];
    ctx.draw();
    toast(
      "Brouillon conservé. Copiez-le vers un nouveau fichier ou rechargez avant d’enregistrer.",
    );
  },
  exToggleMobile() {
    S.exOpen = !S.exOpen;
    $("#cgrid").dataset.ex = S.exOpen ? "on" : "";
  },
  fileMenu(_, el) {
    if (!S.active) return;
    menu(el, [
      { label: "Renommer", act: "renameStart", arg: S.active, hint: "F2" },
      { label: "Dupliquer", act: "dupFile", arg: S.active },
      { label: "Copier le chemin", act: "copyPath", arg: S.active },
      "-",
      {
        label: "Mettre en forme le fichier",
        act: "editorFormat",
        hint: "Alt Maj F",
      },
      { label: "Rechercher / remplacer", act: "editorSearch", hint: "Ctrl F" },
      { label: "Problèmes et corrections", act: "editorProblems" },
      { label: "Symboles du fichier", act: "editorSymbols" },
      {
        label: "Rechercher dans le projet",
        act: "editorProjectSearch",
        icon: ui.search,
      },
      {
        label: "Indentation…",
        act: "editorIndent",
        icon: ui.settings,
        description: "Choisir 2 espaces, 4 espaces ou des tabulations",
      },
      "-",
      { label: "Supprimer…", act: "deletePath", arg: S.active, bad: 1 },
    ]);
  },
  /* recherche */
  find() {
    ed?.model.search();
  },
  findIdx() {
    const q = $("#fq").value;
    if (!q || !ed) return [];
    const out = [],
      t = ed.get().toLowerCase(),
      n = q.toLowerCase();
    let i = -1;
    while ((i = t.indexOf(n, i + 1)) > -1) out.push(i);
    return out;
  },
  findUpdate() {
    const q = $("#fq").value,
      ix = A.findIdx();
    S.find.i = Math.min(S.find.i, Math.max(0, ix.length - 1));
    ed?.marks(q, S.find.i);
    $("#fc").textContent = q
      ? ix.length
        ? `${S.find.i + 1} / ${ix.length}`
        : "Aucun résultat"
      : "";
    if (ix.length) ed.scrollToIndex(ix[S.find.i]);
    for (const a of ["findPrev", "findNext", "replaceOne"]) {
      const b = $(`[data-act="${a}"]`);
      if (b) b.disabled = !ix.length;
    }
    const all = $('[data-act="replaceAll"]');
    if (all) all.disabled = !ix.length;
  },
  findNext() {
    const n = A.findIdx().length;
    if (n) {
      S.find.i = (S.find.i + 1) % n;
      A.findUpdate();
    }
  },
  findPrev() {
    const n = A.findIdx().length;
    if (n) {
      S.find.i = (S.find.i - 1 + n) % n;
      A.findUpdate();
    }
  },
  replaceOne() {
    const ix = A.findIdx();
    if (!ix.length) return;
    const q = $("#fq").value,
      t = ed.get(),
      i = ix[S.find.i];
    ed.set(t.slice(0, i) + $("#fr").value + t.slice(i + q.length));
    ed.ta.dispatchEvent(new Event("input"));
    A.findUpdate();
  },
  replaceAll() {
    const q = $("#fq").value;
    if (!q) return;
    const n = A.findIdx().length;
    ed.set(
      ed
        .get()
        .replace(
          new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"),
          () => $("#fr").value,
        ),
    );
    ed.ta.dispatchEvent(new Event("input"));
    A.findUpdate();
    toast(plural(n, "remplacement", "remplacements"));
  },
  /* aperçu et sessions depuis l'éditeur */
  pvToggle() {
    S.pv = !S.pv;
    if (S.pv && S.active && isPage(S.active) && S.pvFollow) S.pvPath = S.active;
    ctx.draw();
    if (S.pv) A.pvReload();
  },
  pvOpen(path) {
    S.pv = true;
    if (path) S.pvPath = path;
    S.view = "code";
    ctx.draw();
    A.pvReload();
  },
  runFile(path) {
    A.pvOpen(path);
  },
  pvFollowToggle() {
    S.pvFollow = !S.pvFollow;
    drawPv();
  },
  async pvDoubleToggle() {
    S.pvDouble = !S.pvDouble;
    if (S.pvDouble) {
      let l = sessions();
      if (l.length < 2) {
        await eng().sessions.create();
        l = sessions();
      }
      S.pvSessions = [
        S.pvSessions[0] || l[0].id,
        (l.find((s) => s.id !== S.pvSessions[0]) || l[1]).id,
      ];
    } else S.pvSessions = [S.pvSessions[0]];
    S.pv = true;
    ctx.draw();
    A.pvReload();
  },
  pvPickSession(i, el) {
    menu(
      el,
      sessions()
        .map((s) => ({
          label: `<span class="ident">${sw(s)}${esc(s.label)}</span>`,
          act: "pvSetSession",
          arg: i + "|" + s.id,
        }))
        .concat([
          "-",
          {
            label: "Nouvelle session indépendante",
            act: "pvNewSession",
            arg: i,
          },
        ]),
    );
  },
  pvSetSession(arg) {
    const [i, id] = arg.split("|");
    S.pvSessions[+i] = id;
    ctx.draw();
    A.pvReload();
  },
  async pvNewSession(i) {
    const id = await eng().sessions.create();
    S.pvSessions[+i || 0] = id;
    ctx.draw();
    A.pvReload();
    toast("Nouvelle session : cookies et session PHP distincts");
  },
  async pvReload() {
    if (!S.pv) return;
    S.pvPath = $("#pvPath").value || S.pvPath || "/index.php";
    if (/\.md$/i.test(S.pvPath)) {
      const path = S.pvPath;
      recordPreviewPath(path);
      const { markdownDocument } = await import("../markdown.mjs");
      const text =
        S.drafts[path] ??
        S.base[path] ??
        (await eng().fs.read(path)).text ??
        "";
      if (path !== S.pvPath || !S.pv) return;
      for (const frame of $$("#pvFrames iframe")) {
        frame.removeAttribute("src");
        frame.srcdoc = markdownDocument(text, S.theme === "dark");
      }
      return;
    }
    for (const frame of $$("#pvFrames iframe")) frame.removeAttribute("srcdoc");
    await Promise.all(
      S.pvSessions.map(async (id, i) => {
        try {
          const r = await eng().sessions.frame(id, S.pvPath);
          const f = $$("#pvFrames iframe")[i];
          if (!f) return;
          f.src = r.src;
          if (r.status) S.pvInfo[id] = { status: r.status, ms: r.ms };
        } catch (e) {
          fail("Aperçu impossible.", e);
        }
      }),
    );
    drawPv();
    ctx.shell();
    if (S.dock === "req") ctx.views.dock?.();
  },
  async executePHP() {
    const path = S.active,
      project = S.project;
    if (!/\.php$/i.test(path) || S.phpRun?.running) return;
    if (!(await A.applyAll())) return;
    S.phpRun = { path, running: true, text: "Exécution en cours…" };
    A.dockTab("out");
    try {
      const result = await eng().sessions.run(S.pvSessions[0], path);
      if (S.project === project) S.phpRun = { path, running: false, ...result };
    } catch (e) {
      if (S.project === project)
        S.phpRun = { path, running: false, text: e.message, error: true };
    }
    if (S.project === project) ctx.views.dock?.();
  },
  runMenu(_, el) {
    const cur = S.pvSessions[0];
    menu(el, [
      ...(/\.php$/i.test(S.active)
        ? [
            {
              label: "Exécuter PHP · sortie texte",
              act: "executePHP",
              icon: ui.play,
              dis: !!S.phpRun?.running,
              description:
                "Requête ponctuelle dans la session active. Vous pouvez continuer à éditer ; le moteur traite les requêtes en série.",
            },
            "-",
          ]
        : []),
      {
        label: S.pv ? "Fermer l’aperçu" : "Aperçu à côté",
        act: "pvToggle",
        icon: ui.play,
        hint: "Ctrl ⏎",
      },
      {
        label: S.pvDouble
          ? "Aperçu simple"
          : "Comparer deux sessions côte à côte",
        act: "pvDoubleToggle",
      },
      "-",
      {
        label: "Ouvrir dans une fenêtre",
        act: "openWindow",
        arg: cur,
        hint: esc(sessionOf(cur).label),
      },
      { label: "Fenêtre avec une nouvelle session", act: "openWindowNew" },
      "-",
      ...sessions().map((s) => ({
        label: `<span class="ident">${sw(s)}${esc(s.label)}</span>`,
        act: "pvSetSession",
        arg: "0|" + s.id,
        hint: s.id === cur ? icon("check", "sm") : "",
      })),
      "-",
      { label: "Gérer les sessions…", act: "nav", arg: "sessions" },
    ]);
  },
  /** window.open doit être appelé avant tout await, sinon le navigateur bloque la fenêtre. */
  openWindow(sid, path) {
    sid = typeof sid === "string" && sid ? sid : S.pvSessions[0];
    path =
      typeof path === "string" && path.startsWith("/")
        ? path
        : S.active && isPage(S.active)
          ? S.active
          : S.pvPath;
    const popup = window.open("about:blank", "_blank");
    if (!popup) return blocked();
    S.wins.push({ id: Date.now() + Math.random(), path, session: sid, popup });
    if (popup) popup.location.href = eng().sessions.routeURL(sid, path);
    eng()
      .sessions.frame(sid, path)
      .catch(() => {});
    log("i", `Fenêtre ouverte : ${path} (${sessionOf(sid).label})`);
    ctx.draw();
    toast(`Fenêtre ouverte · ${sessionOf(sid).label}`);
  },
  openWindowFor(path) {
    A.openWindow(S.pvSessions[0], path);
  },
  async openWindowNew(path) {
    const popup = window.open("about:blank", "_blank");
    if (!popup) return blocked();
    const id = await eng().sessions.create();
    const p =
      typeof path === "string" && path.startsWith("/")
        ? path
        : S.active && isPage(S.active)
          ? S.active
          : S.pvPath;
    S.wins.push({
      id: Date.now() + Math.random(),
      path: p,
      session: id,
      popup,
    });
    if (popup) popup.location.href = eng().sessions.routeURL(id, p);
    eng()
      .sessions.frame(id, p)
      .catch(() => {});
    ctx.draw();
    toast("Fenêtre ouverte avec une nouvelle session");
  },
  closeWin(id) {
    const w = S.wins.find((x) => String(x.id) === String(id));
    try {
      w?.popup?.close();
    } catch {
      /* déjà fermée */
    }
    S.wins = S.wins.filter((x) => x !== w);
    ctx.draw();
  },
});
function blocked() {
  S.alert = {
    title: "Fenêtre bloquée.",
    msg: "Autorisez les fenêtres pour ouvrir un client.",
    recover:
      "Cliquez sur l’icône de fenêtre bloquée dans la barre d’adresse, autorisez ce site, puis relancez.",
  };
  log("w", "Fenêtre bloquée par le navigateur");
  ctx.draw();
}

export function bindCode() {
  let wheelAt = 0;
  $("#tabs").addEventListener(
    "wheel",
    (event) => {
      if (
        event.ctrlKey ||
        !S.tabs.length ||
        Math.abs(event.deltaY) + Math.abs(event.deltaX) < 3
      )
        return;
      event.preventDefault();
      if (performance.now() - wheelAt < 160) return;
      wheelAt = performance.now();
      const direction = (event.deltaY || event.deltaX) > 0 ? 1 : -1;
      const index = Math.max(
        0,
        Math.min(S.tabs.length - 1, S.tabs.indexOf(S.active) + direction),
      );
      if (S.tabs[index] !== S.active)
        A.openFile(S.tabs[index]).catch((e) => fail("Ouverture impossible", e));
    },
    { passive: false },
  );
  $("#tabs").addEventListener("contextmenu", async (event) => {
    const tab = event.target.closest('[data-act="openFile"]');
    if (!tab) return;
    event.preventDefault();
    await A.openFile(tab.dataset.arg);
    A.fileMenu(null, at(event.clientX, event.clientY));
  });
  $("#ed1").addEventListener("keydown", (event) => {
    if (
      !ed ||
      !(event.key === "ContextMenu" || (event.key === "F10" && event.shiftKey))
    )
      return;
    event.preventDefault();
    const view = ed.model.view,
      coords = view.coordsAtPos(view.state.selection.main.head);
    view.contentDOM.dispatchEvent(
      new MouseEvent("contextmenu", {
        bubbles: true,
        cancelable: true,
        clientX: coords?.left ?? 0,
        clientY: coords?.top ?? 0,
      }),
    );
  });
  $("#ed1").addEventListener("contextmenu", (event) => {
    if (!ed || !event.target.closest(".cm-content")) return;
    event.preventDefault();
    const view = ed.model.view,
      position = view.posAtCoords({ x: event.clientX, y: event.clientY });
    if (
      position != null &&
      (position < view.state.selection.main.from ||
        position > view.state.selection.main.to)
    )
      view.dispatch({ selection: { anchor: position } });
    const capabilities = ed.model.contextCapabilities();
    const kind = capabilities.language;
    const actions = [
      { label: "Rechercher / remplacer", act: "editorSearch", hint: "Ctrl F" },
      {
        label: "Mettre en forme le fichier",
        act: "editorFormat",
        hint: "Alt Maj F",
      },
    ];
    if (capabilities.definition)
      actions.push({
        label: "Aller à la définition",
        act: "editorDefinition",
        hint: "F12",
      });
    if (capabilities.references)
      actions.push({
        label: "Trouver les références",
        act: "editorReferences",
        hint: "Maj F12",
      });
    if (capabilities.rename)
      actions.push({
        label: "Renommer le symbole",
        act: "editorRename",
        hint: "F2",
      });
    if (["html", "css"].includes(kind))
      actions.push({
        label: "Développer l’abréviation Emmet",
        act: "editorEmmet",
        hint: "Alt E",
      });
    actions.push("-", {
      label: "Problèmes et corrections",
      act: "editorProblems",
    });
    menu(at(event.clientX, event.clientY), actions);
  });
  const tree = $("#tree");
  const syncCollapse = () => {
    const b = $('[data-act="exCollapseAll"]');
    if (!b || !tree) return;
    const f = [...tree.querySelectorAll("[role=treeitem][aria-expanded]")];
    b.disabled = !f.some((x) => x.getAttribute("aria-expanded") === "true");
  };
  if (tree) {
    new MutationObserver(syncCollapse).observe(tree, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["aria-expanded"],
    });
    syncCollapse();
  }
  A.findUpdate();
  $("#fq").addEventListener("input", () => {
    S.find.i = 0;
    A.findUpdate();
  });
  $("#fq").addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      e.shiftKey ? A.findPrev() : A.findNext();
    }
    if (e.key === "Escape") A.find();
  });
  $("#pvPath").addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      e.currentTarget.blur();
      A.pvReload();
    }
  });
}
