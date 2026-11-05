import { withProjectLoading } from "./project-loading.mjs";
import { stageFiles } from "../disk-import.mjs";
import { importProgress, discardImportedProject } from "./import-progress.mjs";
import { chooseImport } from "./import-dialog.mjs";
import { A, S, ctx, eng } from "./state.mjs";
import { toast, modal, esc, plural } from "./ui.mjs";
import { refreshFiles } from "./views/explorer.mjs";
import { resetEditor } from "./views/code.mjs";
import {
  selectFolder,
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
  let excludedCount = 0,
    created,
    owned = false;
  try {
    const directory = await showDirectoryPicker({ mode: "readwrite" });
    const selected = await selectFolder(
      directory,
      (records, options) =>
        chooseImport(records, {
          ...options,
          title: "Ouvrir le dossier « " + directory.name + " »",
          source:
            "Choisissez ce qui sera chargé dans ALWIS. Les éléments écartés restent sur votre PC.",
        }),
      { metadataOnly: true },
    );
    excludedCount = selected.excluded;
    const name = "dossier-" + crypto.randomUUID();
    created = name;
    const staged = await importProgress(
      (options) => stageFiles(name, selected.records, options),
      selected.records.reduce((n, e) => n + e.size, 0),
    );
    owned = true;
    await staged.disk.publish(await staged.disk.prepare(staged.entries));
    const files = new Map(
        staged.entries.map((e) => [
          e.path,
          {
            size: e.size,
            crc: e.crc,
            mtime: selected.records.find((r) => r.path === e.path)?.file
              .lastModified,
          },
        ]),
      ),
      metadata = await folderContext(directory),
      archive = await metadata.archive();
    await A.open(name, "existing");
    if (S.project !== name)
      throw Error("Impossible d’ouvrir le dossier importé.");
    await withProjectLoading(
      async (step) => {
        step("Restauration du contexte du dossier…");
        // A new isolated owner avoids replacing any previous browser copy or external file.
        if (archive) await eng().projects.importZip(archive);
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
            await metadata.save(
              workspace,
              await eng().projects.exportFolderData(),
            );
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
            ? saved.queryHistory
                .filter((x) => typeof x === "string")
                .slice(0, 20)
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
        step("Enregistrement de la copie dans le navigateur…");
        await eng().projects.save();
        await ctx.persist?.();
        S.applied.clear();
        S.dbDirty = false;
        S.savedAt = Date.now();
        ctx.draw();
      },
      { name: directory.name },
    );
    toast(
      "Dossier " +
        directory.name +
        " ouvert" +
        (excludedCount
          ? " sans " +
            plural(excludedCount, "élément écarté", "éléments écartés")
          : "") +
        ". Enregistrer conserve aussi les bases et le contexte dans .alwis.",
      null,
      { kind: "success" },
    );
  } catch (e) {
    if (created && owned) await discardImportedProject(created);
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
