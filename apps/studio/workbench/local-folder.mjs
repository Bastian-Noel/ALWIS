import { A, S, ctx, eng } from "./state.mjs";
import { toast } from "./ui.mjs";
import { refreshFiles } from "./views/explorer.mjs";
import { resetEditor } from "./views/code.mjs";
import { readFolder, folderWriter, folderContext } from "./folder-access.mjs";
A.openLocalFolder = async () => {
  if (!globalThis.showDirectoryPicker)
    return toast(
      "L’accès aux dossiers nécessite Chrome ou Edge sur ordinateur. Vous pouvez importer un ZIP.",
    );
  if (S.project)
    return toast("Fermez le projet actuel avant d’ouvrir un dossier du PC.");
  try {
    const directory = await showDirectoryPicker({ mode: "readwrite" });
    const metadata = await folderContext(directory),
      files = await readFolder(directory),
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
        " ouvert. Enregistrer conserve aussi les bases et le contexte dans .alwis.",
    );
  } catch (e) {
    if (e.name !== "AbortError") toast("Ouverture du dossier : " + e.message);
  }
};
