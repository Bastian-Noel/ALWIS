/** Explorateur de fichiers : dossiers repliables, renommage en place, glisser-déposer, menu contextuel, clavier. */
import { $, $$, esc, plural, toast, menu, confirmDlg, at } from "../ui.mjs";
import { S, A, ctx, eng, log, fail, dirty } from "../state.mjs";
import { fileIcon, folderIcon, ui, isWeb, fileKind } from "../icons.mjs";

export const nameOf = (p) => p.split("/").pop();
export const dirOf = (p) => p.slice(0, p.lastIndexOf("/")) || "/";
const join = (d, n) => (d === "/" ? "" : d) + "/" + n;
const BAD = /\/\/|\/\.\.?(\/|$)|\0/;

function build() {
  const root = { name: "", path: "", dirs: new Map(), files: [] };
  const add = (p, isFile) => {
    const parts = p.split("/").filter(Boolean),
      upto = isFile ? parts.length - 1 : parts.length;
    let n = root;
    for (let i = 0; i < upto; i++) {
      const k = parts[i];
      if (!n.dirs.has(k))
        n.dirs.set(k, {
          name: k,
          path: n.path + "/" + k,
          dirs: new Map(),
          files: [],
        });
      n = n.dirs.get(k);
    }
    if (isFile)
      n.files.push({
        name: parts.at(-1),
        path: p,
        info: S.files.find((f) => f.path === p),
      });
  };
  S.files.forEach((f) => add(f.path, true));
  S.vdirs.forEach((d) => add(d, false));
  return root;
}
const count = (n) =>
  n.files.length + [...n.dirs.values()].reduce((a, d) => a + count(d), 0);
const mark = (name, q) => {
  const i = q ? name.toLowerCase().indexOf(q) : -1;
  return i < 0
    ? esc(name)
    : esc(name.slice(0, i)) +
        "<mark>" +
        esc(name.slice(i, i + q.length)) +
        "</mark>" +
        esc(name.slice(i + q.length));
};

function rows() {
  const q = S.ff.trim().toLowerCase(),
    out = [];
  const walk = (n, depth) => {
    const res = [];
    for (const d of [...n.dirs.values()].sort((a, b) =>
      a.name.localeCompare(b.name),
    )) {
      const sub = walk(d, depth + 1),
        hit = !q || d.name.toLowerCase().includes(q);
      if (q && !hit && !sub.length) continue;
      const open = q ? true : S.openDirs.has(d.path);
      res.push({
        kind: "dir",
        path: d.path,
        name: d.name,
        depth,
        open,
        n: count(d),
        empty: !count(d) && !d.dirs.size,
      });
      if (open) res.push(...sub);
    }
    for (const f of [...n.files].sort((a, b) => a.name.localeCompare(b.name)))
      if (!q || f.name.toLowerCase().includes(q))
        res.push({
          kind: "file",
          path: f.path,
          name: f.name,
          depth,
          info: f.info,
        });
    return res;
  };
  out.push(...walk(build(), 0));
  return out;
}
export const visibleRows = () => rows();

export function drawExplorer() {
  const list = rows(),
    q = S.ff.trim().toLowerCase();
  if (S.newEntry) {
    const parent = S.newEntry.dir,
      parentIndex = list.findIndex((r) => r.path === parent);
    const depth = parentIndex < 0 ? 0 : list[parentIndex].depth + 1;
    list.splice(parentIndex + 1, 0, { kind: "new", depth });
  }
  const selectedPath = list.some((r) => r.path === S.exSel)
    ? S.exSel
    : list[0]?.path;
  $("#tree").innerHTML =
    list
      .map((r) => {
        if (r.kind === "new") {
          const entry = S.newEntry;
          return `<div class="row new-entry" role="treeitem" aria-level="${r.depth + 1}" style="--d:${r.depth}"><span class="chev sp"></span>${entry.kind === "dir" ? folderIcon(true) : fileIcon(entry.value || "nouveau.php")}<div class="entry-input"><input class="ren" id="newEntryName" value="${esc(entry.value)}" placeholder="${entry.kind === "dir" ? "nom-du-dossier" : "nom-du-fichier.php"}" aria-label="Nom du nouveau ${entry.kind === "dir" ? "dossier" : "fichier"}" aria-describedby="newEntryHelp newEntryError" aria-invalid="${!!entry.error}" spellcheck="false" autocomplete="off"><span id="newEntryHelp" class="hint">${esc(entry.dir === "/" ? "À la racine du projet" : entry.dir)} · Entrée pour créer</span><span id="newEntryError" class="hint bad" role="status">${esc(entry.error || "")}</span></div></div>`;
        }
        const sel = selectedPath === r.path,
          renaming = S.ren === r.path,
          pad = `style="--d:${r.depth}"`;
        const label = renaming
          ? `<input class="ren" value="${esc(r.name)}" aria-label="Nouveau nom" spellcheck="false">`
          : `<span class="nm trunc">${mark(r.name, q)}</span>`;
        if (r.kind === "dir")
          return `<div class="row dir" role="treeitem" aria-level="${r.depth + 1}" aria-expanded="${r.open}" aria-selected="${sel}" tabindex="${sel ? 0 : -1}" draggable="true" data-path="${esc(r.path)}" data-kind="dir" ${pad}>${ui.chev.replace('class="chev"', 'class="chev' + (r.open ? " open" : "") + '"')}${folderIcon(r.open)}${label}<span class="cnt num">${r.empty ? "vide" : r.n}</span><span class="acts"><button data-act="newFile" data-arg="${esc(r.path)}" aria-label="Nouveau fichier dans ${esc(r.name)}" title="Nouveau fichier">${ui.plus}</button><button data-act="exMenuBtn" data-arg="${esc(r.path)}|dir" aria-label="Actions" aria-haspopup="true">${ui.more}</button></span></div>`;
        const web = isWeb(r.path),
          big = r.info && r.info.kind !== "text";
        return `<div class="row file${S.active === r.path ? " active" : ""}" role="treeitem" aria-level="${r.depth + 1}" aria-selected="${sel}" tabindex="${sel ? 0 : -1}" draggable="true" data-path="${esc(r.path)}" data-kind="file" ${pad}><span class="chev sp"></span>${fileIcon(r.path)}${label}${r.path === "/index.php" ? '<span class="entry" title="Page d’accueil du site">accueil</span>' : ""}${dirty(r.path) ? '<i class="d" title="Brouillon non enregistré"></i>' : S.applied.has(r.path) ? '<i class="d a" title="Appliqué, pas encore sauvegardé"></i>' : ""}${big ? `<span class="cnt num">${r.info.kind === "big" ? (r.info.size / 1048576).toFixed(1).replace(".", ",") + " Mio" : Math.round(r.info.size / 1024) + " Kio"}</span>` : ""}<span class="acts">${web ? `<button data-act="runFile" data-arg="${esc(r.path)}" aria-label="Ouvrir ${esc(r.name)} dans une session" title="Ouvrir dans la session active">${ui.play}</button>` : ""}<button data-act="exMenuBtn" data-arg="${esc(r.path)}|file" aria-label="Actions" aria-haspopup="true">${ui.more}</button></span></div>`;
      })
      .join("") ||
    `<p class="hint" style="padding:10px 12px">${q ? "Aucun fichier ne correspond." : "Aucun fichier. Créez-en un, ou déposez des fichiers ici."}</p>`;
  $("#treeNote").textContent =
    plural(S.files.length, "fichier", "fichiers") + " · 1 024 maximum";
  const creating = $("#newEntryName");
  if (creating) {
    creating.focus();
    creating.select();
  }
  if (S.ren) {
    const i = $("#tree .ren");
    if (i && !i.dataset.f) {
      i.dataset.f = 1;
      i.focus();
      const dot = i.value.lastIndexOf(".");
      i.setSelectionRange(0, dot > 0 ? dot : i.value.length);
    }
  }
}

export async function refreshFiles() {
  S.files = await eng().fs.list();
}

const exists = (p) =>
  S.files.some((f) => f.path === p) ||
  S.vdirs.has(p) ||
  S.files.some((f) => f.path.startsWith(p + "/"));
const checkPath = (p, self) =>
  !p.trim()
    ? "Le chemin ne peut pas être vide."
    : BAD.test("/" + p.replace(/^\//, ""))
      ? "Utilisez un chemin sans segment vide, point ou dossier interne."
      : p !== self && exists(p.startsWith("/") ? p : "/" + p)
        ? "Cet élément existe déjà. Choisissez un autre chemin."
        : "";
const norm = (p) => (p.startsWith("/") ? p : "/" + p).replace(/\/+$/, "");

Object.assign(A, {
  exClick(path) {
    S.exSel = path;
    const row = rows().find((r) => r.path === path);
    if (row?.kind === "dir") A.exToggle(path);
    else A.openFile(path);
  },
  exToggle(path) {
    S.openDirs.has(path) ? S.openDirs.delete(path) : S.openDirs.add(path);
    drawExplorer();
  },
  exCollapseAll() {
    S.openDirs.clear();
    drawExplorer();
  },
  exMenuBtn(arg, el) {
    const [p, k] = arg.split("|");
    S.exSel = p;
    A.exMenu(p, k, el);
  },
  exMenu(path, kind, anchor) {
    const isDir = kind === "dir";
    menu(
      anchor,
      isDir
        ? [
            { label: "Nouveau fichier ici…", act: "newFile", arg: path },
            { label: "Nouveau dossier ici…", act: "newFolder", arg: path },
            "-",
            { label: "Renommer", act: "renameStart", arg: path, hint: "F2" },
            { label: "Copier le chemin", act: "copyPath", arg: path },
            "-",
            {
              label: "Supprimer le dossier…",
              act: "deletePath",
              arg: path,
              bad: 1,
            },
          ]
        : [
            { label: "Ouvrir", act: "openFile", arg: path },
            ...(isWeb(path)
              ? [
                  {
                    label: "Aperçu à côté",
                    act: "pvOpen",
                    arg: path,
                    icon: ui.play,
                  },
                  {
                    label: "Ouvrir dans une fenêtre",
                    act: "openWindowFor",
                    arg: path,
                  },
                ]
              : []),
            "-",
            { label: "Renommer", act: "renameStart", arg: path, hint: "F2" },
            { label: "Dupliquer", act: "dupFile", arg: path },
            { label: "Copier le chemin", act: "copyPath", arg: path },
            "-",
            { label: "Supprimer…", act: "deletePath", arg: path, bad: 1 },
          ],
    );
  },
  newFile(dir) {
    A.entryStart("file", dir);
  },
  newFolder(dir) {
    A.entryStart("dir", dir);
  },
  entryStart(kind, dir) {
    dir =
      typeof dir === "string" && dir
        ? dir
        : S.exSel
          ? S.files.some((f) => f.path === S.exSel)
            ? dirOf(S.exSel)
            : S.exSel
          : "/";
    S.newEntry = { kind, dir, value: "", error: "" };
    S.ff = "";
    $("#ff").value = "";
    S.view = "code";
    S.exOpen = true;
    for (let d = dir; d !== "/"; d = dirOf(d)) S.openDirs.add(d);
    ctx.draw();
  },
  entryCancel() {
    S.newEntry = null;
    drawExplorer();
    const row = $$("#tree [data-path]").find(
      (el) => el.dataset.path === S.exSel,
    );
    (row || $('#v-code [data-act="newFile"]'))?.focus();
  },
  async entryCommit(value) {
    const entry = S.newEntry;
    if (!entry || entry.saving) return;
    entry.value = value.trim();
    const path = norm(
      entry.value.startsWith("/") ? entry.value : join(entry.dir, entry.value),
    );
    const error =
      !entry.value || path === "/" ? "Saisissez un nom." : checkPath(path);
    if (error) {
      entry.error = error;
      drawExplorer();
      return;
    }
    entry.saving = true;
    try {
      if (entry.kind === "file") {
        await eng().fs.write(path, "");
        S.applied.add(path);
        await refreshFiles();
      } else S.vdirs.add(path);
      for (let d = dirOf(path); d !== "/"; d = dirOf(d)) S.openDirs.add(d);
      S.exSel = path;
      S.newEntry = null;
      if (entry.kind === "file") await A.openFile(path);
      else {
        S.openDirs.add(path);
        drawExplorer();
        $$("#tree [data-path]")
          .find((el) => el.dataset.path === path)
          ?.focus();
        toast("Dossier créé. Ajoutez-y vos fichiers.");
      }
      ctx.schedulePersist?.();
    } catch (error) {
      entry.saving = false;
      entry.error = error.message;
      drawExplorer();
    }
  },
  renameStart(path) {
    S.ren = path || S.exSel || S.active;
    if (S.ren) {
      S.view = "code";
      S.exOpen = true;
      S.ff = "";
      $("#ff").value = "";
      for (let d = dirOf(S.ren); d !== "/"; d = dirOf(d)) S.openDirs.add(d);
      ctx.draw();
    }
  },
  async renameCommit(name) {
    const from = S.ren;
    S.ren = null;
    if (!from || !name.trim() || name === nameOf(from)) {
      drawExplorer();
      return;
    }
    const to = join(dirOf(from), name.trim());
    const err = checkPath(to, from);
    if (err) {
      fail("Renommage impossible.", new Error(err));
      drawExplorer();
      return;
    }
    await A.movePath(from, to);
  },
  async movePath(from, to) {
    if (to === from || to.startsWith(from + "/")) return;
    const isFile = S.files.some((f) => f.path === from),
      list = isFile
        ? [from]
        : S.files
            .filter((f) => f.path.startsWith(from + "/"))
            .map((f) => f.path);
    try {
      for (const p of list) {
        const t = isFile ? to : to + p.slice(from.length);
        if (S.files.some((f) => f.path === t))
          throw new Error(
            "Ce fichier existe déjà. Choisissez un autre chemin.",
          );
        await eng().fs.move(p, t);
        S.applied.add(t);
        for (const k of ["drafts", "base", "conflict"])
          if (p in S[k]) {
            S[k][t] = S[k][p];
            delete S[k][p];
          }
        S.tabs = S.tabs.map((x) => (x === p ? t : x));
        if (S.active === p) S.active = t;
        if (S.exSel === p) S.exSel = t;
      }
      if (!isFile) {
        [...S.vdirs].forEach((d) => {
          if (d === from || d.startsWith(from + "/")) {
            S.vdirs.delete(d);
            S.vdirs.add(to + d.slice(from.length));
          }
        });
        if (S.openDirs.delete(from)) S.openDirs.add(to);
        if (!list.length) {
          S.vdirs.delete(from);
          S.vdirs.add(to);
        }
      }
      S.openDirs.add(isFile ? dirOf(to) : to);
      await refreshFiles();
      log("i", `Déplacé : ${from} → ${to}`);
      ctx.draw();
    } catch (e) {
      fail("Déplacement impossible.", e);
    }
  },
  async dupFile(path) {
    try {
      const r = await eng().fs.read(path);
      if (r.text === undefined)
        return toast("Seuls les fichiers texte se dupliquent ici.");
      const dot = path.lastIndexOf("."),
        to =
          dot > path.lastIndexOf("/")
            ? path.slice(0, dot) + "-copie" + path.slice(dot)
            : path + "-copie";
      await eng().fs.write(to, S.drafts[path] ?? r.text);
      S.applied.add(to);
      await refreshFiles();
      S.exSel = to;
      ctx.draw();
      toast("Dupliqué : " + nameOf(to));
    } catch (e) {
      fail("Duplication impossible.", e);
    }
  },
  async deletePath(path) {
    const isFile = S.files.some((f) => f.path === path),
      n = isFile
        ? 1
        : S.files.filter((f) => f.path.startsWith(path + "/")).length;
    if (
      !(await confirmDlg(
        isFile ? "Supprimer ce fichier ?" : "Supprimer ce dossier ?",
        `<b>${esc(path)}</b>${isFile ? "" : ` et ses ${plural(n, "fichier", "fichiers")}`} seront supprimés du projet, brouillons compris.`,
        "Supprimer",
        1,
      ))
    )
      return;
    try {
      for (const p of isFile
        ? [path]
        : S.files
            .filter((f) => f.path.startsWith(path + "/"))
            .map((f) => f.path)) {
        await eng().fs.remove(p);
        delete S.drafts[p];
        delete S.base[p];
        S.applied.add(p);
        S.tabs = S.tabs.filter((x) => x !== p);
        if (S.active === p) S.active = S.tabs.at(-1) ?? null;
      }
      [...S.vdirs].forEach(
        (d) => (d === path || d.startsWith(path + "/")) && S.vdirs.delete(d),
      );
      await refreshFiles();
      S.exSel = null;
      log("w", "Supprimé : " + path);
      ctx.draw();
      toast(path + " supprimé");
    } catch (e) {
      fail("Suppression impossible.", e);
    }
  },
  copyPath(path) {
    try {
      navigator.clipboard?.writeText(path);
    } catch {
      /* presse-papiers indisponible */
    }
    toast("Chemin copié : " + path);
  },
  async exImport(files, dir = "/") {
    let n = 0;
    for (const f of files) {
      try {
        if (f.size > 8 * 1024 * 1024)
          throw new Error(`« ${f.name} » dépasse 8 Mio.`);
        const p = join(dir, f.name),
          isText =
            /\.(php|html?|css|js|mjs|json|sql|md|csv|txt|env|xml|svg)$/i.test(
              f.name,
            ) || f.name.startsWith(".");
        await eng().fs.write(
          p,
          isText ? await f.text() : new Uint8Array(await f.arrayBuffer()),
        );
        S.applied.add(p);
        n++;
      } catch (e) {
        fail("Import impossible.", e);
      }
    }
    if (n) {
      await refreshFiles();
      S.openDirs.add(dir);
      ctx.draw();
      toast(plural(n, "fichier importé", "fichiers importés"));
    }
  },
});

export function bindExplorer() {
  const tree = $("#tree");
  tree.addEventListener("focusin", (e) => {
    if (e.target.matches("[role=treeitem]")) S.exSel = e.target.dataset.path;
  });
  tree.addEventListener("click", (e) => {
    if (e.target.closest(".acts,.ren,.new-entry")) return;
    const r = e.target.closest(".row");
    if (r) A.exClick(r.dataset.path);
  });
  tree.addEventListener("contextmenu", (e) => {
    const r = e.target.closest(".row");
    if (!r) return;
    e.preventDefault();
    S.exSel = r.dataset.path;
    A.exMenu(r.dataset.path, r.dataset.kind, at(e.clientX, e.clientY));
  });
  tree.addEventListener("focusout", (e) => {
    if (e.target.classList?.contains("ren") && S.ren)
      A.renameCommit(e.target.value);
  });
  tree.addEventListener("input", (e) => {
    if (e.target.id !== "newEntryName" || !S.newEntry) return;
    S.newEntry.value = e.target.value;
    S.newEntry.error = "";
    e.target.setAttribute("aria-invalid", "false");
    $("#newEntryError").textContent = "";
  });
  tree.addEventListener("keydown", (e) => {
    if (e.target.id === "newEntryName") {
      if (e.key === "Enter") {
        e.preventDefault();
        A.entryCommit(e.target.value);
      } else if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        A.entryCancel();
      }
      return;
    }
    if (e.target.classList.contains("ren")) {
      if (e.key === "Enter") {
        e.preventDefault();
        A.renameCommit(e.target.value);
      } else if (e.key === "Escape") {
        S.ren = null;
        drawExplorer();
      }
      return;
    }
    if (e.target.closest("button")) return;
    const list = rows(),
      i = Math.max(
        0,
        list.findIndex((r) => r.path === S.exSel),
      ),
      cur = list[i];
    if (!cur) return;
    const go = (j) => {
      const r = list[Math.max(0, Math.min(list.length - 1, j))];
      S.exSel = r.path;
      drawExplorer();
      $(`#tree [data-path="${CSS.escape(r.path)}"]`)?.focus();
    };
    if (e.key === "Home" || e.key === "End") {
      e.preventDefault();
      go(e.key === "Home" ? 0 : list.length - 1);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      go(i + 1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      go(i - 1);
    } else if (e.key === "ArrowRight" && cur.kind === "dir") {
      e.preventDefault();
      if (!cur.open) A.exToggle(cur.path);
      else go(i + 1);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      if (cur.kind === "dir" && cur.open) A.exToggle(cur.path);
      else {
        const par = list.findIndex(
          (r) => r.kind === "dir" && cur.path.startsWith(r.path + "/"),
        );
        if (par >= 0) go(par);
      }
    } else if (e.key === "Enter") {
      e.preventDefault();
      A.exClick(cur.path);
    } else if (e.key === "F2") {
      e.preventDefault();
      A.renameStart(cur.path);
    } else if (e.key === "Delete") {
      e.preventDefault();
      A.deletePath(cur.path);
    }
  });
  /* glisser-déposer : déplacer dans l'arbre, ou importer depuis le bureau */
  let over = null;
  const clear = () => {
    over?.classList.remove("drop");
    over = null;
    $("#tree").classList.remove("drop");
  };
  tree.addEventListener("dragstart", (e) => {
    const r = e.target.closest(".row");
    if (!r) return;
    e.dataTransfer.setData("text/x-pbl-path", r.dataset.path);
    e.dataTransfer.effectAllowed = "move";
  });
  tree.addEventListener("dragover", (e) => {
    const types = [...e.dataTransfer.types];
    if (!types.includes("text/x-pbl-path") && !types.includes("Files")) return;
    e.preventDefault();
    const r = e.target.closest(".row.dir");
    clear();
    if (r) {
      r.classList.add("drop");
      over = r;
    } else tree.classList.add("drop");
  });
  tree.addEventListener("dragleave", (e) => {
    if (!tree.contains(e.relatedTarget)) clear();
  });
  tree.addEventListener("drop", (e) => {
    e.preventDefault();
    const r = e.target.closest(".row"),
      dir = r
        ? r.dataset.kind === "dir"
          ? r.dataset.path
          : dirOf(r.dataset.path)
        : "/";
    clear();
    const from = e.dataTransfer.getData("text/x-pbl-path");
    if (from) A.movePath(from, join(dir, nameOf(from)));
    else if (e.dataTransfer.files.length) A.exImport(e.dataTransfer.files, dir);
  });
  $("#ff").addEventListener("input", (e) => {
    S.ff = e.target.value;
    drawExplorer();
  });
}
