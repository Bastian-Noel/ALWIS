import { modal } from "./ui.mjs";
export async function importProgress(work, total) {
  const controller = new AbortController();
  let result, failure;
  const dialog = modal({
    title: "Copie du projet sur disque",
    body: '<p>Seul le fichier en cours utilise un tampon. Le projet ne sera ouvert qu’après validation de la sélection.</p><progress id="importProgress" max="100" value="0" aria-label="Copie des fichiers"></progress><p id="importProgressText" role="status">Préparation…</p>',
    actions: [{ label: "Annuler", v: "cancel" }],
    beforeClose() {
      controller.abort();
      const b = document.querySelector("#modal [data-v]");
      if (b) b.textContent = "Nettoyage…";
      return false;
    },
    onOpen(d) {
      d.addEventListener("cancel", (event) => {
        event.preventDefault();
        controller.abort();
      });
      work({
        signal: controller.signal,
        onProgress: (bytes, path) => {
          d.querySelector("progress").value = total
            ? Math.min(100, (bytes / total) * 100)
            : 0;
          d.querySelector("#importProgressText").textContent =
            path + " — " + Math.round(bytes / 1048576) + " Mio copiés";
        },
      }).then(
        (value) => {
          result = value;
          d.close();
        },
        (error) => {
          failure = error;
          d.close();
        },
      );
    },
  });
  await dialog;
  if (failure) throw failure;
  return result;
}
export async function discardImportedProject(name) {
  if (!name) return;
  const { S, ctx, eng } = await import("./state.mjs");
  if (S.project === name) {
    await eng().projects.close({ save: false });
    Object.assign(S, {
      mode: "launcher",
      project: null,
      tabs: [],
      active: null,
      drafts: {},
      base: {},
      dbDirty: false,
      applied: new Set(),
    });
    ctx.folder = null;
    const { resetEditor } = await import("./views/code.mjs");
    resetEditor();
    ctx.draw();
  }
  await eng().projects.remove(name);
}
