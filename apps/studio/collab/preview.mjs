// Shared web preview: the host's rendered page is mirrored to guests as a static snapshot
// (scripts removed, stylesheets inlined). Pointers and clicks are handled by focus.mjs.
import { chunkText } from "./protocol.mjs";

const MAX = 700_000;
export function previewScroll(frame) {
  try {
    const doc = frame.contentDocument, win = frame.contentWindow;
    if (!doc || !win) return null;
    return { x: win.scrollX, y: win.scrollY, elements: [...doc.querySelectorAll("*")]
      .map((el, i) => ({ i, x: el.scrollLeft, y: el.scrollTop }))
      .filter(p => p.x || p.y).slice(0, 200) };
  } catch { return null; }
}
export function applyPreviewScroll(frame, scroll) {
  if (!scroll || !Number.isFinite(scroll.x) || !Number.isFinite(scroll.y)) return;
  try {
    frame.__cbApplyingScrollUntil = Date.now() + 250;
    frame.contentWindow.scrollTo(scroll.x, scroll.y);
    const nodes = [...frame.contentDocument.querySelectorAll("[data-cbi]")];
    const positions = new Map((scroll.elements ?? []).map(p => [p.i, p]));
    for (const node of nodes) {
      const p = positions.get(+node.dataset.cbi);
      // documentElement/body scrolling belongs to window.scrollTo above.
      if (!/^(HTML|BODY)$/.test(node.tagName)) { node.scrollLeft = p?.x ?? 0; node.scrollTop = p?.y ?? 0; }
    }
  } catch {}
}

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
  let timer = null, scrollTimer = null, last = "", lastAt = 0, stopped = false;
  const watchers = new Map();
  const pushScroll = () => {
    if (stopped) return;
    const scroll = previewScroll(container()?.querySelector("iframe"));
    if (scroll) send({ t: "pv-scroll", scroll }, { key: "pv-scroll", droppable: true });
  };
  const push = () => {
    const frame = container()?.querySelector("iframe");
    const html = snapshot(frame);
    if (html == null || html === last) return;
    last = html;
    lastAt = Date.now();
    const id = Math.random().toString(36).slice(2);
    const parts = chunkText(html, 12 * 1024);
    parts.forEach((d, part) => send({ t: "pv", id, part, parts: parts.length, d, scroll: previewScroll(frame) }, { group: "pv" }));
  };
  const schedule = (delay = ms) => {
    if (stopped) return;
    clearTimeout(timer);
    timer = setTimeout(push, Math.max(delay, minGap - (Date.now() - lastAt)));
  };
  const watch = frame => {
    let cleanupDocument = () => {};
    const bind = () => {
      cleanupDocument();
      schedule();
      try {
        const doc = frame.contentDocument;
        if (!doc?.documentElement) return;
        const observer = new MutationObserver(() => schedule());
        observer.observe(doc.documentElement, { subtree: true, childList: true, attributes: true, characterData: true });
        const onScroll = () => { clearTimeout(scrollTimer); scrollTimer = setTimeout(pushScroll, 80); };
        const onInput = () => schedule(120);
        doc.addEventListener("scroll", onScroll, true);
        for (const type of ["input", "change"]) doc.addEventListener(type, onInput, true);
        cleanupDocument = () => {
          observer.disconnect(); doc.removeEventListener("scroll", onScroll, true);
          for (const type of ["input", "change"]) doc.removeEventListener(type, onInput, true);
        };
        pushScroll();
      } catch {}
    };
    frame.addEventListener("load", bind);
    watchers.set(frame, () => { frame.removeEventListener("load", bind); cleanupDocument(); });
    bind(); // Sharing may start after the host page has already loaded.
  };
  const iv = setInterval(() => {
    const frame = container()?.querySelector("iframe");
    for (const [known, cleanup] of watchers) if (known !== frame) { cleanup(); watchers.delete(known); }
    if (frame && !watchers.has(frame)) watch(frame);
  }, 500);
  return { resend: () => { last = ""; schedule(0); }, stop: () => { stopped = true; clearInterval(iv); clearTimeout(timer); clearTimeout(scrollTimer); for (const cleanup of watchers.values()) cleanup(); watchers.clear(); } };
}

/** Guest: reassemble and display the mirror in every preview frame. */
export function createMirror({ container }) {
  const bufs = new Map();
  let pending = null, retry = null, scroll = null;
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
      f.addEventListener("load", () => { try { (scroll ? applyPreviewScroll(f, scroll) : f.contentWindow.scrollTo(sx, sy)); f.contentDocument.addEventListener("input", () => (f.__cbTyped = Date.now()), true); } catch {} }, { once: true });
      f.srcdoc = html;
    }
  };
  return {
    receive(m) {
      if (m.scroll) scroll = m.scroll;
      const e = bufs.get(m.id) ?? bufs.set(m.id, { parts: [], got: 0 }).get(m.id);
      if (e.parts[m.part] === undefined) e.got++;
      e.parts[m.part] = m.d;
      if (e.got < m.parts) return false;
      bufs.delete(m.id);
      pending = e.parts.join("");
      apply();
      return true;
    },
    scroll(value) {
      scroll = value;
      for (const frame of container()?.querySelectorAll("iframe") ?? []) applyPreviewScroll(frame, scroll);
    },
    reapply: apply,
  };
}
