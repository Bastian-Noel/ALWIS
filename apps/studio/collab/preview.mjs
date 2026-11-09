// Shared web preview: the host's rendered page is mirrored to guests as a static snapshot
// (scripts removed, stylesheets inlined). Pointers and clicks are handled by focus.mjs.
import { chunkText } from "./protocol.mjs";

const MAX = 700_000;

export function snapshot(frame) {
  const doc = frame?.contentDocument;
  if (!doc?.documentElement) return null;
  const clone = doc.documentElement.cloneNode(true);
  // Index of every element in the live page: guests send it back so the host can find the same element.
  const live = [doc.documentElement, ...doc.documentElement.querySelectorAll("*")];
  [clone, ...clone.querySelectorAll("*")].forEach((n, i) => { if (i < live.length) n.setAttribute("data-cbi", String(i)); });
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
export function watchPreview({ container, send, ms = 450, minGap = 900 }) {
  let timer = null, last = "", lastAt = 0;
  const push = () => {
    const frame = container()?.querySelector("iframe");
    const html = snapshot(frame);
    if (html == null || html === last) return;
    last = html;
    lastAt = Date.now();
    const id = Math.random().toString(36).slice(2);
    const parts = chunkText(html, 12 * 1024);
    parts.forEach((d, part) => send({ t: "pv", id, part, parts: parts.length, d }, { group: "pv" }));
  };
  const schedule = (delay = ms) => {
    clearTimeout(timer);
    timer = setTimeout(push, Math.max(delay, minGap - (Date.now() - lastAt)));
  };
  const watch = (frame) => {
    frame.__cbWatched = true;
    frame.addEventListener("load", () => {
      schedule();
      try {
        const doc = frame.contentDocument;
        new MutationObserver(() => schedule()).observe(doc.documentElement, { subtree: true, childList: true, attributes: true, characterData: true });
        // typing changes properties, not attributes: the observer cannot see it
        for (const type of ["input", "change"]) doc.addEventListener(type, () => schedule(120), true);
      } catch {}
    });
    schedule();
  };
  const iv = setInterval(() => {
    const frame = container()?.querySelector("iframe");
    if (frame && !frame.__cbWatched) watch(frame);
  }, 500);
  return { resend: () => { last = ""; schedule(0); }, stop: () => { clearInterval(iv); clearTimeout(timer); } };
}

/** Guest: reassemble and display the mirror in every preview frame. */
export function createMirror({ container }) {
  const bufs = new Map();
  let pending = null, retry = null;
  const typing = (f) => { try { const a = f.contentDocument?.activeElement; return a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) && Date.now() - (f.__cbTyped ?? 0) < 1200; } catch { return false; } };
  const apply = () => {
    if (!pending) return;
    const frames = [...(container()?.querySelectorAll("iframe") ?? [])];
    if (frames.some(typing)) { clearTimeout(retry); retry = setTimeout(apply, 400); return; } // do not erase what the guest is typing
    const html = pending;
    pending = null;
    for (const f of frames) {
      let sx = 0, sy = 0;
      try { sx = f.contentWindow.scrollX; sy = f.contentWindow.scrollY; } catch {}
      f.removeAttribute("src");
      f.setAttribute("sandbox", "allow-same-origin"); // no script can run: the snapshot is inert
      f.addEventListener("load", () => { try { f.contentWindow.scrollTo(sx, sy); f.contentDocument.addEventListener("input", () => (f.__cbTyped = Date.now()), true); } catch {} }, { once: true });
      f.srcdoc = html;
    }
  };
  return {
    receive(m) {
      const e = bufs.get(m.id) ?? bufs.set(m.id, { parts: [], got: 0 }).get(m.id);
      if (e.parts[m.part] === undefined) e.got++;
      e.parts[m.part] = m.d;
      if (e.got < m.parts) return false;
      bufs.delete(m.id);
      pending = e.parts.join("");
      apply();
      return true;
    },
    reapply: apply,
  };
}
