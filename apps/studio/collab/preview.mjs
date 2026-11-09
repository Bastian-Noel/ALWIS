// Shared web preview: the host's rendered page is mirrored to guests as a static snapshot
// (scripts removed, stylesheets inlined). Pointers and clicks are handled by focus.mjs.
import { chunkText } from "./protocol.mjs";

const MAX = 700_000;

export function snapshot(frame) {
  const doc = frame?.contentDocument;
  if (!doc?.documentElement) return null;
  const clone = doc.documentElement.cloneNode(true);
  clone.querySelectorAll("script, noscript, iframe, object, embed").forEach((n) => n.remove());
  clone.querySelectorAll("*").forEach((n) => { for (const a of [...n.attributes]) if (/^on/i.test(a.name)) n.removeAttribute(a.name); });
  // DOM properties are not reflected to attributes while a form is edited.
  // Copy current values so a refreshed guest mirror shows the same state.
  const originals = [...doc.querySelectorAll("input, textarea, select")];
  const copies = [...clone.querySelectorAll("input, textarea, select")];
  originals.forEach((node, i) => {
    const copy = copies[i];
    if (!copy) return;
    if (node instanceof doc.defaultView.HTMLTextAreaElement) copy.textContent = node.value;
    else if (node instanceof doc.defaultView.HTMLSelectElement) {
      [...copy.options].forEach((o, j) => o.toggleAttribute("selected", !!node.options[j]?.selected));
    } else if (node.type === "checkbox" || node.type === "radio") copy.toggleAttribute("checked", node.checked);
    else copy.setAttribute("value", node.value);
  });
  let css = "";
  for (const sheet of [...doc.styleSheets]) {
    try { css += [...sheet.cssRules].map((r) => r.cssText).join("\n") + "\n"; } catch { /* cross-origin sheet */ }
  }
  clone.querySelectorAll('link[rel~="stylesheet"]').forEach((n) => n.remove());
  const style = doc.createElement("style");
  style.textContent = css;
  (clone.querySelector("head") ?? clone).prepend(style);
  const html = "<!doctype html>" + clone.outerHTML;
  return html.length > MAX ? null : html;
}

/** Host: watch the real frame and push snapshots when it changes. */
export function watchPreview({ container, send, ms = 600 }) {
  let timer = null, last = "";
  const push = () => {
    const frame = container()?.querySelector("iframe");
    const html = snapshot(frame);
    if (html == null || html === last) return;
    last = html;
    const id = Math.random().toString(36).slice(2);
    const parts = chunkText(html, 12 * 1024);
    parts.forEach((d, part) => send({ t: "pv", id, part, parts: parts.length, d }));
  };
  const schedule = () => { clearTimeout(timer); timer = setTimeout(push, ms); };
  const iv = setInterval(() => {
    const frame = container()?.querySelector("iframe");
    if (!frame || frame.__cbWatched) return;
    frame.__cbWatched = true;
    frame.addEventListener("load", () => {
      schedule();
      try { new MutationObserver(schedule).observe(frame.contentDocument.documentElement, { subtree: true, childList: true, attributes: true, characterData: true }); } catch {}
    });
    schedule();
  }, 700);
  return { resend: () => { last = ""; schedule(); }, stop: () => { clearInterval(iv); clearTimeout(timer); } };
}

/** Guest: reassemble and display the mirror in every preview frame. */
export function createMirror({ container }) {
  const bufs = new Map();
  return {
    receive(m) {
      const e = bufs.get(m.id) ?? bufs.set(m.id, { parts: [], got: 0 }).get(m.id);
      if (e.parts[m.part] === undefined) e.got++;
      e.parts[m.part] = m.d;
      if (e.got < m.parts) return false;
      bufs.delete(m.id);
      for (const f of container()?.querySelectorAll("iframe") ?? []) { f.removeAttribute("src"); f.setAttribute("sandbox", "allow-same-origin"); f.srcdoc = e.parts.join(""); }
      return true;
    },
  };
}
