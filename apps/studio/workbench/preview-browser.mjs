import { $ } from "./ui.mjs";
import { S, A, eng } from "./state.mjs";
import { bindPaneResizer } from "./pane-resizer.mjs";
const history = () =>
  (S.pvHistory[S.pvSessions[0]] ??= { paths: [], index: -1 });
export function updateBrowserButtons() {
  const h = history();
  $("#pvBack").disabled = h.index <= 0;
  $("#pvForward").disabled = h.index >= h.paths.length - 1;
}
export function recordPreviewPath(path) {
  const h = history();
  if (h.paths[h.index] !== path) {
    h.paths.splice(h.index + 1);
    h.paths.push(path);
    if (h.paths.length > 100) h.paths.shift();
    h.index = h.paths.length - 1;
  }
  S.pvPath = path;
  if (document.activeElement !== $("#pvPath")) $("#pvPath").value = path;
  updateBrowserButtons();
}
export function bindPreviewFrame(frame, index) {
  if (index !== 0) return;
  const sync = () => {
    try {
      const url = new URL(frame.contentWindow.location.href);
      const prefix = new URL(
        eng().sessions.routeURL(S.pvSessions[0], "/"),
        location.href,
      ).pathname;
      if (url.origin !== location.origin || !url.pathname.startsWith(prefix))
        return;
      recordPreviewPath(
        "/" + url.pathname.slice(prefix.length) + url.search + url.hash,
      );
    } catch {
      /* External pages cannot expose their address or DOM. */
    }
  };
  frame.addEventListener("load", () => {
    sync();
    try {
      frame.contentWindow.addEventListener("hashchange", sync);
      frame.contentWindow.addEventListener("popstate", sync);
    } catch {}
  });
}
Object.assign(A, {
  async pvBack() {
    const h = history();
    if (h.index <= 0) return;
    $("#pvPath").value = h.paths[--h.index];
    await A.pvReload();
    updateBrowserButtons();
  },
  async pvForward() {
    const h = history();
    if (h.index >= h.paths.length - 1) return;
    $("#pvPath").value = h.paths[++h.index];
    await A.pvReload();
    updateBrowserButtons();
  },
});
export function bindPreviewBrowser() {
  const grid = $("#cgrid"),
    column = $(".pv-col");
  bindPaneResizer($("#previewResize"), {
    axis: "x",
    initial: 60,
    min: 20,
    max: 80,
    key: "alwis:preview-width",
    measure: () => grid.clientWidth - 260 - 10,
    apply: (value) => {
      grid.style.setProperty("--editor-fr", value + "fr");
      grid.style.setProperty("--preview-fr", 100 - value + "fr");
    },
  });
  bindPaneResizer($("#networkResize"), {
    axis: "y",
    initial: 42,
    min: 20,
    max: 70,
    reverse: true,
    key: "alwis:network-height",
    measure: () => column.clientHeight,
    apply: (value) => column.style.setProperty("--network-height", value + "%"),
  });
}
