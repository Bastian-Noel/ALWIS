import { A, S, ctx, eng } from "./state.mjs";
import { toast, modal, esc, plural } from "./ui.mjs";
import { refreshFiles } from "./views/explorer.mjs";
import { resetEditor } from "./views/code.mjs";
import {
  readFolder,
  folderWriter,
  folderContext,
  folderSizeText,
} from "./folder-access.mjs";
A.openLocalFolder = async () => {
  if (!globalThis.showDirectoryPicker)
    return toast(
      "L’accès aux dossiers nécessite Chrome ou Edge sur ordinateur. Vous pouvez importer un ZIP.",
    );
  if (S.project)
    return toast("Fermez le projet actuel avant d’ouvrir un dossier du PC.");
  let excludedCount = 0;
  try {
    const directory = await showDirectoryPicker({ mode: "readwrite" });
    const metadata = await folderContext(directory),
      files = await readFolder(directory, {
        async onOversized({ files, retainedCount, retainedBytes }) {
          const result = await modal({
            title: "Fichiers trop volumineux",
            body: `<div class="folder-failure"><p>${plural(files.length, "fichier", "fichiers")} ${files.length === 1 ? "dépasse" : "dépassent"} la limite de 16 Mio par fichier.</p><ul class="folder-exclusions" aria-label="Fichiers exclus">${files
              .slice(0, 50)
              .map(
                (file) =>
                  `<li><span>${esc(file.path)}</span><small>${folderSizeText(file.size)}</small></li>`,
              )
              .join(
                "",
              )}</ul>${files.length > 50 ? `<p class="hint">Et ${files.length - 50} autres fichiers trop volumineux.</p>` : ""}<p>${retainedCount ? `Le projet contiendra ${plural(retainedCount, "fichier", "fichiers")}, soit ${folderSizeText(retainedBytes)}.` : "Aucun autre fichier à ouvrir : le projet sera vide."}</p><p class="hint">Les fichiers listés ne seront pas chargés dans ALWIS. Ils resteront sur votre PC et ne seront pas modifiés lors de l’enregistrement du projet.</p></div>`,
            actions: [
              { label: "Annuler", v: "no" },
              { label: "Ouvrir sans ces fichiers", v: "skip", kind: "pri" },
            ],
          });
          if (result === "skip") excludedCount = files.length;
          return result === "skip";
        },
      }),
      archive = await metadata.archive();
    const name = "dossier-" + crypto.randomUUID().slice(0, 8);
    await A.open(name, "existing");
    if (!S.project) return;
    // A new isolated owner avoids replacing any previous browser copy or external file.
    if (archive) await eng().projects.importZip(archive);
    for (const [path, data] of files) {
      await eng().fs.write(path, data);
      S.applied.add(path);
    }
    ctx.folder = {
      name: directory.name,
      write: folderWriter(directory, files),
      async saveContext() {
        const workspace = {
          db: S.db,
          query: S.qtext,
          queryHistory: S.hist,
          table: S.table,
          tabs: S.tabs,
          active: S.active,
          pos: S.pos,
          layouts: S.layouts,
          hue: S.hue,
          vdirs: [...S.vdirs],
        };
        await metadata.save(workspace, await eng().projects.exportFolderData());
      },
    };
    await refreshFiles();
    const saved = metadata.saved?.workspace;
    if (saved && typeof saved === "object") {
      const paths = new Set(S.files.map((f) => f.path));
      S.tabs = Array.isArray(saved.tabs)
        ? saved.tabs
            .filter((p) => typeof p === "string" && paths.has(p))
            .slice(0, 40)
        : [];
      S.active = paths.has(saved.active) ? saved.active : null;
      S.qtext =
        typeof saved.query === "string"
          ? saved.query.slice(0, 262144)
          : "SELECT 1;";
      S.hist = Array.isArray(saved.queryHistory)
        ? saved.queryHistory.filter((x) => typeof x === "string").slice(0, 20)
        : [];
      if (typeof saved.db === "string") S.db = saved.db;
      if (typeof saved.table === "string") S.table = saved.table;
      for (const key of ["pos", "layouts", "hue"])
        if (
          saved[key] &&
          typeof saved[key] === "object" &&
          !Array.isArray(saved[key])
        )
          S[key] = saved[key];
      S.vdirs = new Set(
        Array.isArray(saved.vdirs)
          ? saved.vdirs.filter(
              (x) => typeof x === "string" && x.startsWith("/"),
            )
          : [],
      );
      S.base = {};
      S.drafts = {};
      resetEditor();
    }
    const first = S.active || S.files.find((f) => f.kind === "text")?.path;
    if (first) await A.openFile(first);
    ctx.draw();
    toast(
      "Dossier " +
        directory.name +
        " ouvert" +
        (excludedCount
          ? " sans " +
            plural(excludedCount, "fichier volumineux", "fichiers volumineux")
          : "") +
        ". Enregistrer conserve aussi les bases et le contexte dans .alwis.",
      null,
      { kind: "success" },
    );
  } catch (e) {
    if (e.name === "AbortError") return;
    if (e.code === "FOLDER_LIMIT") {
      const result = await modal({
        title: "Dossier non ouvert",
        body: `<div class="folder-failure"><p role="alert">${esc(e.message)}</p><p>L’ouverture s’est arrêtée avant la création du projet. Aucun fichier de votre PC n’a été modifié.</p><p class="hint">Choisissez un dossier plus petit contenant les fichiers à utiliser. Les dossiers cachés, node_modules et vendor sont déjà ignorés.</p></div>`,
        actions: [
          { label: "Fermer", v: "no" },
          { label: "Choisir un autre dossier", v: "retry", kind: "pri" },
        ],
      });
      if (result === "retry") return A.openLocalFolder();
      return;
    }
    toast("Ouverture du dossier : " + e.message, null, {
      kind: "error",
      title: "Dossier non ouvert",
      duration: 12000,
    });
  }
};
