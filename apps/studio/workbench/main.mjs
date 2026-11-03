import { installSiteUpdates } from "../site-updates.mjs";
import { createStudioServices } from "./services.mjs";
import { ctx, S, A, log, fail } from "./state.mjs";
import { draw, drawShell, bindShell } from "./views/shell.mjs";
import { bindExplorer } from "./views/explorer.mjs";
import { bindCode, updatePreviewStatus } from "./views/code.mjs";
import { bindData } from "./views/data.mjs";
import { bindSchema } from "./views/schema.mjs";
import { drawDock, bindDock } from "./views/dock.mjs";
import "./views/structure.mjs";
import { editorInstances } from "./ui.mjs";
ctx.engine = createStudioServices();
ctx.draw = draw;
ctx.shell = drawShell;
ctx.views.dock = drawDock;
let persistTimer,
  workspaceVersion = 0;
ctx.persist = async () => {
  if (!S.project) return;
  const snapshot = {
    db: S.db,
    query: S.qtext,
    queryHistory: S.hist,
    table: S.table,
    tabs: S.tabs,
    active: S.active,
    base: S.base,
    drafts: S.drafts,
    pos: S.pos,
    layouts: S.layouts,
    hue: S.hue,
    vdirs: [...S.vdirs],
  };
  await ctx.engine.projects.saveWorkspace(snapshot);
};
ctx.schedulePersist = () => {
  clearTimeout(persistTimer);
  persistTimer = setTimeout(
    () => ctx.persist().catch((e) => fail("Brouillon non conservé", e)),
    350,
  );
};
ctx.engine.on("request", (r) => {
  S.reqs.push(r);
  if (S.reqs.length > 200) S.reqs.shift();
  S.pvInfo[r.session] = r;
  if (S.pv) updatePreviewStatus();
  if (S.dock === "req") drawDock();
  drawShell();
});
ctx.engine.on("changed", (change) => {
  if (change?.kind === "files") S.applied.add(change.path);
  else S.dbDirty = true;
  drawShell();
});
ctx.engine.on("log", (l) => {
  log(l.l, l.msg, l.detail);
  if (l.l === "e") {
    S.alert = { title: l.msg, msg: l.detail?.slice(0, 8192) };
    draw();
  } else drawShell();
});
S.theme = document.documentElement.dataset.theme;
bindShell();
bindExplorer();
bindCode();
bindData();
bindSchema();
bindDock();
window.addEventListener("error", (e) =>
  fail("Erreur de l’interface", e.error ?? Error(e.message)),
);
window.addEventListener("unhandledrejection", (e) =>
  fail(
    "Action impossible",
    e.reason instanceof Error ? e.reason : Error(String(e.reason)),
  ),
);
Object.assign(A, {
  async toolState(name, state) {
    if (name === "editor") {
      for (const e of editorInstances().filter((e) => e.kind === name)) {
        if (state === "unloaded") {
          await ctx.persist();
          e.destroy();
        } else e.model.setReadOnly(state === "sleep");
      }
      if (state === "unloaded") {
        S.editorUnloaded = true;
        document.querySelector("#ed1").replaceChildren();
      } else if (S.editorUnloaded) {
        S.editorUnloaded = false;
        const { resetEditor } = await import("./views/code.mjs");
        resetEditor();
        draw();
      }
    }
    if (name === "sql") {
      for (const e of editorInstances().filter((e) => e.kind === "sql")) {
        if (state === "unloaded") e.destroy();
        else e.model.setReadOnly(state === "sleep");
      }
      if (state === "unloaded") await ctx.engine.db.close();
    }
    S.toolModes ??= {};
    S.toolModes[name] = state;
    await ctx.persist?.();
    ctx.draw();
  },
  async measure() {
    await ctx.engine.measure();
    drawDock();
  },
});
try {
  await ctx.engine.initialize();
  const name = new URLSearchParams(location.search).get("project");
  if (name) document.querySelector("#pn").value = name;
  log("i", "ALWIS prêt");
  draw();
} catch (e) {
  fail("Initialisation impossible", e);
  document.querySelector("#blocked").hidden = false;
}

window.addEventListener("focus", () => {
  S.wins = S.wins.filter((w) => w.popup && !w.popup.closed);
  if (S.project && S.view === "sessions") ctx.draw();
});

installSiteUpdates({
  persist: () => ctx.persist?.(),
  close: async () => {
    if (!S.project) return;
    // Save the applied runtime and SQL, while preserving unapplied drafts in workspace metadata.
    await ctx.engine.projects.save();
    await ctx.engine.projects.close({save: false});
  },
});
