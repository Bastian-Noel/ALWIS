/** Keyboard access and transient shortcut hints. No accesskey: avoid browser/OS conflicts. */
import { S, A } from "./state.mjs";
const commands = [
  ["Digit1", "Alt+1", '[data-act="nav"][data-arg="code"]'],
  ["Digit2", "Alt+2", '[data-act="nav"][data-arg="data"]'],
  ["Digit3", "Alt+3", '[data-act="nav"][data-arg="schema"]'],
  ["Digit4", "Alt+4", '[data-act="nav"][data-arg="sessions"]'],
  ["KeyS", "Alt+S", "#primary"],
  ["KeyR", "Alt+R", "#runBtn"],
  ["KeyJ", "Alt+J", "#sDock"],
  ["KeyK", "Alt+K", '[data-act="palette"]'],
  ["KeyF", "Alt+F", '#codeTools [data-tool="Formater"]'],
  ["KeyE", "Alt+E", '#codeTools [data-tool="Emmet"]'],
  ["KeyP", "Alt+P", '#codeTools [data-tool="Problèmes"]'],
  ["KeyN", "Alt+N", '[data-act="newFile"]'],
];
const visible = (el) =>
  el?.isConnected &&
  !el.closest("[hidden],[inert]") &&
  el.getClientRects().length &&
  getComputedStyle(el).visibility !== "hidden";
const available = (el) => visible(el) && !el.disabled;
export function installKeyboard() {
  const layer = document.createElement("div");
  layer.id = "shortcutHints";
  layer.setAttribute("aria-hidden", "true");
  document.body.append(layer);
  let timer,
    held = false,
    shown = false,
    frame,
    lastFocus;
  function hide() {
    clearTimeout(timer);
    held = false;
    shown = false;
    document.documentElement.classList.remove("shortcut-hints");
    layer.replaceChildren();
  }
  function paint() {
    layer.replaceChildren();
    if (!shown || document.querySelector("dialog[open]")) return;
    for (const [, key, selector] of commands) {
      const el = [...document.querySelectorAll(selector)].find(available);
      if (!el) continue;
      const r = el.getBoundingClientRect();
      if (r.bottom < 0 || r.top > innerHeight) continue;
      const badge = document.createElement("span");
      badge.className = "shortcut-hint";
      badge.textContent = key;
      badge.style.left = Math.max(4, Math.min(innerWidth - 70, r.left)) + "px";
      badge.style.top =
        Math.max(4, Math.min(innerHeight - 24, r.bottom - 2)) + "px";
      layer.append(badge);
    }
  }
  function sync() {
    for (const [, key, selector] of commands)
      for (const el of document.querySelectorAll(selector))
        el.setAttribute("aria-keyshortcuts", key);
    document
      .querySelectorAll('#rail [data-act="nav"]')
      .forEach((el) => el.setAttribute("aria-controls", "v-" + el.dataset.arg));
    const dock = document.querySelector("#dock");
    if (dock) dock.inert = !dock.classList.contains("on");
    for (const el of document.querySelectorAll('[data-act="dockToggle"]')) {
      el.setAttribute("aria-controls", "dock");
      el.setAttribute("aria-expanded", String(!!S.dock));
    }
    for (const root of document.querySelectorAll('#tabs,[role="tablist"]')) {
      const tabs = [...root.querySelectorAll('[role="tab"]')];
      const entry = tabs.includes(document.activeElement)
        ? document.activeElement
        : tabs.find((el) => el.getAttribute("aria-selected") === "true");
      for (const el of tabs) el.tabIndex = el === entry ? 0 : -1;
    }
    if (
      document.activeElement === document.body &&
      lastFocus &&
      !lastFocus.el.isConnected
    ) {
      const next =
        (lastFocus.selector && document.querySelector(lastFocus.selector)) ||
        (lastFocus.el.matches("[role=tab]") &&
          document.querySelector("#tabs [aria-selected=true]"));
      if (available(next)) next.focus({ preventScroll: true });
    }
    paint();
  }
  document.addEventListener("focusin", (e) => {
    const el = e.target;
    let selector;
    if (el.id) selector = "#" + CSS.escape(el.id);
    else if (el.dataset.path)
      selector = '#tree [data-path="' + CSS.escape(el.dataset.path) + '"]';
    else if (el.dataset.act) {
      const parent = el.closest("[id]");
      selector =
        (parent ? "#" + CSS.escape(parent.id) + " " : "") +
        '[data-act="' +
        CSS.escape(el.dataset.act) +
        '"]';
      if (el.hasAttribute("data-arg"))
        selector += '[data-arg="' + CSS.escape(el.dataset.arg) + '"]';
    }
    lastFocus = { el, selector };
  });
  new MutationObserver((records) => {
    if (
      records.every(
        (r) => r.target instanceof Element && r.target.closest(".cm-editor"),
      )
    )
      return;
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(sync);
  }).observe(document.querySelector("#app"), {
    childList: true,
    subtree: true,
  });
  addEventListener(
    "keydown",
    (e) => {
      if (
        e.isComposing ||
        e.getModifierState("AltGraph") ||
        e.ctrlKey ||
        e.metaKey
      ) {
        hide();
        return;
      }
      if (e.key === "Alt") {
        if (!e.repeat && !held) {
          held = true;
          timer = setTimeout(() => {
            if (held) {
              shown = true;
              document.documentElement.classList.add("shortcut-hints");
              paint();
            }
          }, 400);
        }
        return;
      }
      if (e.key === "Escape" && shown) {
        hide();
        e.preventDefault();
        return;
      }
      if (!e.altKey) return;
      const command = commands.find(([code]) => code === e.code);
      hide();
      if (
        !command ||
        e.repeat ||
        e.shiftKey ||
        S.lamp === "busy" ||
        document.querySelector("dialog[open]")
      )
        return;
      const target = [...document.querySelectorAll(command[2])].find(available);
      if (
        !target &&
        command[0] === "KeyE" &&
        S.mode === "work" &&
        S.view === "code" &&
        S.active
      ) {
        e.preventDefault();
        Promise.resolve(A.editorEmmet()).catch(() => {});
      }
      if (target) {
        e.preventDefault();
        target.focus({ preventScroll: true });
        target.click();
      }
    },
    true,
  );
  addEventListener("keyup", (e) => {
    if (e.key === "Alt") {
      if (shown) e.preventDefault();
      hide();
    }
  });
  addEventListener("blur", hide);
  document.addEventListener("visibilitychange", hide);
  addEventListener("resize", paint);
  document.addEventListener(
    "scroll",
    () => {
      if (shown) paint();
    },
    true,
  );
  document.addEventListener("keydown", (e) => {
    if (
      e.defaultPrevented ||
      e.altKey ||
      e.ctrlKey ||
      e.metaKey ||
      e.isComposing
    )
      return;
    const target = e.target;
    // Tabs use manual activation: arrows move focus, Enter/Space activate.
    const group = target.closest(
      '[role="tablist"],[role="toolbar"],#rail,.seg[aria-label="Vue"],.rs-tabs,.pop',
    );
    if (group && !target.matches("input,textarea,select,[contenteditable]")) {
      const items = [...group.querySelectorAll("button:not(:disabled)")]
        .filter(visible)
        .filter((el) => !el.classList.contains("c"));
      const index = items.indexOf(target),
        vertical = group.matches("#rail,.pop");
      const previous = vertical ? "ArrowUp" : "ArrowLeft",
        next = vertical ? "ArrowDown" : "ArrowRight";
      if (index >= 0 && [previous, next, "Home", "End"].includes(e.key)) {
        e.preventDefault();
        const i =
          e.key === "Home"
            ? 0
            : e.key === "End"
              ? items.length - 1
              : (index + (e.key === next ? 1 : -1) + items.length) %
                items.length;
        if (group.matches("[role=tablist]"))
          for (const el of items) el.tabIndex = el === items[i] ? 0 : -1;
        items[i].focus();
        return;
      }
      if (target.matches('#tabs [role="tab"]') && e.key === "Delete") {
        e.preventDefault();
        target.parentElement.querySelector('[data-act="closeTab"]')?.click();
        return;
      }
    }
    const row = target.closest('#dbtree [role="treeitem"]');
    if (row && target === row) {
      const rows = [
          ...document.querySelectorAll('#dbtree [role="treeitem"]'),
        ].filter(visible),
        i = rows.indexOf(row);
      if (["ArrowUp", "ArrowDown", "Home", "End"].includes(e.key)) {
        e.preventDefault();
        rows[
          e.key === "Home"
            ? 0
            : e.key === "End"
              ? rows.length - 1
              : Math.max(
                  0,
                  Math.min(
                    rows.length - 1,
                    i + (e.key === "ArrowDown" ? 1 : -1),
                  ),
                )
        ].focus();
      } else if (["Enter", " "].includes(e.key)) {
        if (row.tagName !== "BUTTON") {
          e.preventDefault();
          row.click();
        }
      } else if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        e.preventDefault();
        if (row.hasAttribute("aria-expanded")) {
          if (
            (e.key === "ArrowRight") !==
            (row.getAttribute("aria-expanded") === "true")
          )
            row.click();
          else if (e.key === "ArrowRight") rows[i + 1]?.focus();
        } else if (e.key === "ArrowLeft")
          rows
            .slice(0, i)
            .reverse()
            .find((el) => el.hasAttribute("aria-expanded"))
            ?.focus();
      }
    }
  });
  sync();
}
