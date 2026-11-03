import { createCodeEditor } from "../editor/dist/codemirror.mjs";
import { S, A, eng } from "./state.mjs";
/** Primitives d'interface partagées. Aucune connaissance du moteur ni de l'état du studio. */
export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export const esc = (s) =>
  String(s ?? "").replace(
    /[&<>"]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c],
  );
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const clock = (d = new Date()) => d.toLocaleTimeString("fr-FR");
export const plural = (n, a, b) => n + " " + (n > 1 ? b : a);
export const at = (x, y) => ({
  getBoundingClientRect: () => ({ left: x, right: x, top: y, bottom: y }),
});

let toastTimer;
export function toast(msg, action) {
  const t = $("#toast");
  t.innerHTML =
    esc(msg) +
    (action
      ? ` <button class="toast-act" data-act="${action.act}" data-arg="${esc(action.arg ?? "")}">${esc(action.label)}</button>`
      : "");
  t.classList.add("on");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("on"), action ? 6000 : 2600);
}

/** Boîte modale : le nœud <dialog> est recréé à chaque ouverture, donc aucun écouteur ne s'accumule. */
export function modal({
  title,
  body = "",
  actions,
  onOpen,
  wide,
  beforeClose,
}) {
  return new Promise((res) => {
    const old = $("#modal"),
      d = old.cloneNode(false);
    old.replaceWith(d);
    d.innerHTML = `<div class="dlg-h"><h1>${esc(title)}</h1></div><div class="dlg-b">${body}</div><div class="dlg-f">${actions.map((a) => `<button class="btn ${a.kind || ""}" data-v="${a.v}" ${a.dis ? "disabled" : ""}>${a.label}</button>`).join("")}</div>`;
    d.style.width = wide ? "min(680px,calc(100vw - 24px))" : "";
    let val = null;
    d.onclick = async (e) => {
      const b = e.target.closest("[data-v]");
      if (b && !b.disabled) {
        if (beforeClose && !(await beforeClose(b.dataset.v, d))) return;
        val = b.dataset.v;
        d.close();
      }
    };
    d.onclose = () => res(val);
    d.onkeydown = (e) => {
      if (
        e.key === "Enter" &&
        e.target.tagName === "INPUT" &&
        !e.target.closest(".cols-ed")
      ) {
        const p = $(".btn.pri", d);
        if (p && !p.disabled) {
          e.preventDefault();
          p.click();
        }
      }
    };
    d.showModal();
    onOpen?.(d);
  });
}
export const confirmDlg = (title, text, ok, danger) =>
  modal({
    title,
    body: `<p class="sec">${text}</p>`,
    actions: [
      { label: "Annuler", v: "no" },
      { label: ok, v: "ok", kind: danger ? "pri bad" : "pri" },
    ],
  }).then((v) => v === "ok");

/** Formulaire + SQL affiché avant application : un seul composant pour toutes les opérations de structure. */
export async function ddl({
  title,
  fields,
  sql,
  check,
  ok = "Appliquer",
  typed,
  onApply,
}) {
  const vals = {};
  fields.forEach(
    (f) =>
      (vals[f.id] =
        f.value ??
        (f.type === "cols"
          ? [{ name: "id", type: "INT", nul: 0, pk: 1, ai: 1 }]
          : f.type === "select"
            ? f.options[0]
            : "")),
  );
  const fld = (f) =>
    f.type === "select"
      ? `<label class="field"><span>${f.label}</span><select class="in" data-f="${f.id}" style="width:100%">${f.options.map((o) => `<option ${o === f.value ? "selected" : ""}>${esc(o)}</option>`).join("")}</select></label>`
      : f.type === "cols"
        ? `<div class="field"><span>Colonnes</span><div class="cols-ed" id="cols-ed"></div><button class="btn sm" data-addcol style="justify-self:start;margin-top:4px">Ajouter une colonne</button></div>`
        : `<label class="field"><span>${f.label}</span><input class="in" data-f="${f.id}" value="${esc(f.value || "")}" autocomplete="off" spellcheck="false"></label>`;
  const paint = (d) => {
    try {
      const err =
        check?.(vals) ||
        (typed && vals.__t !== typed
          ? `Tapez « ${typed} » pour confirmer.`
          : "");
      const statement = sql(vals);
      $("#ddl-sql", d).textContent = Array.isArray(statement)
        ? statement.join("\n")
        : statement;
      $("#ddl-err", d).textContent = err;
      $("[data-v=ok]", d).disabled = !!err;
    } catch (e) {
      $("#ddl-err", d).textContent = e.message;
      $("#ddl-sql", d).textContent = "";
      $("[data-v=ok]", d).disabled = true;
    }
  };
  const colsPaint = (d) => {
    const h = $("#cols-ed", d);
    if (!h) return;
    h.innerHTML = vals.cols
      .map(
        (c, i) =>
          `<div class="column-row"><div class="r"><input class="in" data-c="name" data-i="${i}" value="${esc(c.name)}" aria-label="Nom de colonne ${i + 1}"><input class="in" data-c="type" data-i="${i}" value="${esc(c.type)}" aria-label="Type SQL de colonne ${i + 1}" placeholder="VARCHAR(255)"><label><input type="checkbox" data-c="nul" data-i="${i}" ${c.nul ? "checked" : ""}>NULL</label><label><input type="checkbox" data-c="pk" data-i="${i}" ${c.pk ? "checked" : ""}>Clé primaire</label><label><input type="checkbox" data-c="ai" data-i="${i}" ${c.ai ? "checked" : ""}>AUTO_INCREMENT</label><button class="btn quiet sm" data-delcol="${i}" aria-label="Retirer la colonne ${i + 1}">✕</button></div><details><summary>Défaut et attributs</summary><label class="field"><span>Mode du défaut</span><select class="in" data-c="defaultMode" data-i="${i}" aria-label="Mode du défaut de colonne ${i + 1}">${["none", "null", "literal", "expression"].map((v) => `<option ${v === (c.defaultMode ?? "none") ? "selected" : ""}>${v}</option>`).join("")}</select></label><label class="field"><span>Valeur par défaut</span><input class="in" data-c="defaultValue" data-i="${i}" value="${esc(c.defaultValue ?? "")}"></label><label class="field"><span>Commentaire</span><input class="in" data-c="comment" data-i="${i}" value="${esc(c.comment ?? "")}"></label><label class="field"><span>Collation</span><input class="in" data-c="collation" data-i="${i}" value="${esc(c.collation ?? "")}"></label></details></div>`,
      )
      .join("");
  };
  const r = await modal({
    title,
    wide: 1,
    body:
      fields.map(fld).join("") +
      (typed
        ? `<label class="field"><span>Confirmation</span><input class="in" data-f="__t" autocomplete="off" placeholder="${esc(typed)}"></label>`
        : "") +
      `<div class="field"><span>SQL à appliquer</span><pre class="pre" id="ddl-sql"></pre></div><p id="ddl-err" class="hint" role="status"></p>`,
    beforeClose: async (value, d) => {
      if (value !== "ok" || !onApply) return true;
      const button = $("[data-v=ok]", d);
      button.disabled = true;
      try {
        await onApply(vals);
        return true;
      } catch (e) {
        $("#ddl-err", d).textContent = e.message;
        return false;
      } finally {
        button.disabled = false;
      }
    },
    actions: [
      { label: "Annuler", v: "no" },
      { label: ok, v: "ok", kind: typed ? "pri bad" : "pri", dis: 1 },
    ],
    onOpen(d) {
      colsPaint(d);
      paint(d);
      d.addEventListener("input", (e) => {
        const t = e.target;
        if (t.dataset.f) vals[t.dataset.f] = t.value;
        if (t.dataset.c) {
          const c = vals.cols[+t.dataset.i];
          c[t.dataset.c] =
            t.type === "checkbox" ? (t.checked ? 1 : 0) : t.value;
        }
        paint(d);
      });
      d.addEventListener("click", (e) => {
        if (e.target.closest("[data-addcol]")) {
          vals.cols.push({ name: "", type: "VARCHAR(255)", nul: 1 });
          colsPaint(d);
          paint(d);
        }
        const x = e.target.closest("[data-delcol]");
        if (x) {
          vals.cols.splice(+x.dataset.delcol, 1);
          colsPaint(d);
          paint(d);
        }
      });
      $("input", d)?.focus();
      $("input", d)?.select?.();
    },
  });
  return r === "ok" && !onApply ? vals : null;
}

/** Menu flottant. `anchor` : tout objet avec getBoundingClientRect (élément ou point via at(x, y)). */
export function menu(anchor, items, { html, cls = "" } = {}) {
  closeMenus();
  const p = document.createElement("div");
  p.className = "pop " + cls;
  p.setAttribute("role", "menu");
  p.innerHTML =
    html ||
    items
      .map((i) =>
        i === "-"
          ? "<hr>"
          : `<button class="mi" role="menuitem" data-act="${i.act}" data-arg="${esc(i.arg ?? "")}" ${i.dis ? "disabled" : ""} style="${i.bad ? "color:var(--err)" : ""}">${i.icon || ""}<span class="grow">${i.label}</span>${i.hint ? `<small>${i.hint}</small>` : ""}</button>`,
      )
      .join("");
  document.body.append(p);
  const r = anchor.getBoundingClientRect(),
    w = p.offsetWidth;
  p.style.top =
    Math.max(8, Math.min(r.bottom + 4, innerHeight - p.offsetHeight - 8)) +
    "px";
  p.style.left = Math.max(8, Math.min(r.left, innerWidth - w - 8)) + "px";
  p.reposition = () => {
    if (!p.isConnected) return;
    p.style.top =
      Math.max(8, Math.min(r.bottom + 4, innerHeight - p.offsetHeight - 8)) +
      "px";
    p.style.left =
      Math.max(8, Math.min(r.left, innerWidth - p.offsetWidth - 8)) + "px";
  };
  requestAnimationFrame(p.reposition);
  setTimeout(
    () =>
      $("button:not(:disabled),input,select", p)?.focus({
        preventScroll: true,
      }),
    0,
  );
  return p;
}
export const closeMenus = () => $$(".pop").forEach((p) => p.remove());
document.addEventListener("pointerdown", (e) => {
  if (!e.target.closest(".pop")) closeMenus();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeMenus();
});
document.addEventListener(
  "click",
  (e) => {
    if (e.target.closest(".pop button[data-act]")) closeMenus();
  },
  true,
);

/* ───────── Coloration (PHP, JS, CSS, SQL) ───────── */
const KW = {
  php: "function|return|if|else|elseif|foreach|for|while|as|echo|require|require_once|include|new|class|public|private|static|fn|const|use|namespace|null|true|false|try|catch|throw",
  js: "function|return|if|else|for|while|const|let|var|new|class|import|export|null|true|false|document|addEventListener|this|async|await",
  css: "",
  sql: "SELECT|FROM|WHERE|INSERT|INTO|VALUES|UPDATE|SET|DELETE|CREATE|TABLE|ALTER|DROP|JOIN|ON|ORDER|BY|LIMIT|OFFSET|GROUP|AND|OR|NOT|NULL|PRIMARY|KEY|SHOW|DATABASES|TABLES|COUNT|AS|LIKE|IN|IS|ADD|COLUMN|MODIFY|CONSTRAINT|FOREIGN|REFERENCES|DEFAULT|CASCADE|RESTRICT|ENGINE|INDEX|UNIQUE|AUTO_INCREMENT|TRUNCATE|RENAME|TO|IF|EXISTS|DATABASE|INT|VARCHAR|TEXT|DATE|DECIMAL",
};
export const LANGS = {
  php: "PHP",
  css: "CSS",
  js: "JavaScript",
  sql: "SQL",
  html: "HTML",
};
export const langOf = (p) =>
  ({
    php: "php",
    phtml: "php",
    css: "css",
    js: "js",
    mjs: "js",
    sql: "sql",
    html: "php",
    htm: "php",
  })[(p.split(".").pop() || "").toLowerCase()] || "txt";
const RX = {};
function rxFor(l) {
  if (l in RX) return RX[l];
  const com = {
    php: "\\/\\*[\\s\\S]*?\\*\\/|<!--[\\s\\S]*?-->|\\/\\/[^\\n]*",
    js: "\\/\\*[\\s\\S]*?\\*\\/|\\/\\/[^\\n]*",
    css: "\\/\\*[\\s\\S]*?\\*\\/",
    sql: "--[^\\n]*|\\/\\*[\\s\\S]*?\\*\\/",
  }[l];
  if (!com) return (RX[l] = null);
  const kw = KW[l];
  return (RX[l] = new RegExp(
    `(${com})|("(?:\\\\.|[^"\\\\\\n])*"|'(?:\\\\.|[^'\\\\\\n])*'|\`[^\`\\n]*\`)` +
      (l === "php"
        ? "|(<\\?php|<\\?=|\\?>)|(\\$\\w+)|(<\\/?[a-zA-Z][\\w-]*|\\/?>)"
        : "|(?!)()()()") +
      `|(\\b\\d+(?:\\.\\d+)?\\b)` +
      (kw ? `|(\\b(?:${kw})\\b)` : "|(?!)()"),
    l === "sql" ? "gi" : "g",
  ));
}
export function hl(text, l) {
  const rx = rxFor(l);
  if (!rx) return esc(text) + "\n";
  let out = "",
    i = 0,
    m;
  rx.lastIndex = 0;
  while ((m = rx.exec(text))) {
    if (m[0] === "") {
      rx.lastIndex++;
      continue;
    }
    out += esc(text.slice(i, m.index));
    const c = m[1]
      ? "c"
      : m[2]
        ? "s"
        : m[3]
          ? "p"
          : m[4]
            ? "v"
            : m[5]
              ? "g"
              : m[6]
                ? "n"
                : "k";
    out += `<span class="t-${c}">${esc(m[0])}</span>`;
    i = m.index + m[0].length;
  }
  return out + esc(text.slice(i)) + "\n";
}
export const sqlHtml = (s) => hl(s, "sql");

/** The production CodeMirror, shared by source and SQL editing. */
const editors = new Set();
export function editorInstances() {
  return [...editors];
}
export function mkEditor(root, { lang, onInput, onRun, onSave, onCursor }) {
  let closed = false;
  let current = lang === "sql" ? "/query.sql" : "/index.php";
  root.replaceChildren();
  const model = createCodeEditor(root, {
    path: current,
    label: lang === "sql" ? "Requête SQL" : "Code source",
    onSave,
    onRun: () => onRun?.(model.getSelection() || null),
    onStatus: (text) => {
      if (lang !== "sql") {
        const el = document.querySelector("#lsp");
        if (el) el.textContent = text;
      }
    },
    onNavigate: async (target) => {
      await A.openFile(target.path);
      root.selectionStart = target.from;
      root.selectionEnd = target.from;
      model.view.dispatch({ scrollIntoView: true });
      model.view.focus();
    },
  });
  const input = () => onInput?.(root.value),
    select = () => {
      const pos = model.view.state.selection.main.head,
        line = model.view.state.doc.lineAt(pos);
      onCursor?.(line.number, pos - line.from + 1);
    };
  root.addEventListener("input", input);
  root.addEventListener("select", select);
  const result = {
    ta: root,
    model,
    kind: lang === "sql" ? "sql" : "editor",
    set(text, l, path) {
      if (path && path !== current) {
        current = path;
        model.setPath(path);
      }
      root.value = text ?? "";
      if ((l === "sql" || current.endsWith(".sql")) && S.cat)
        model.setSQLSchema(
          {
            [S.db]: Object.fromEntries(
              S.cat.tables.map((t) => [t.name, t.columns.map((c) => c.name)]),
            ),
          },
          S.db,
        );
      select();
    },
    get: () => root.value,
    marks() {},
    focus: () => model.view.focus(),
    scrollToIndex(ix) {
      root.selectionStart = ix;
      root.selectionEnd = ix;
      model.view.dispatch({ scrollIntoView: true });
    },
    paint: () => model.view.requestMeasure(),
    destroy() {
      if (closed) return;
      closed = true;
      editors.delete(result);
      model.destroy();
      root.removeEventListener("input", input);
      root.removeEventListener("select", select);
    },
  };
  editors.add(result);
  (lang === "sql" ? Promise.resolve(null) : eng()?.fs.context())
    .then((context) => {
      if (context && editors.has(result)) model.setProjectContext(context);
    })
    .catch(() => {});
  return result;
}
