import { relationRule, relationRules } from "../relation-rules.mjs";
/** Espace Schéma : tables colorées, déplacement, relation par glisser-déposer d'un champ vers un autre, panoramique et zoom. */
import { $, $$, esc, plural, toast, menu, ddl, sqlHtml, at } from "../ui.mjs";
import {
  S,
  A,
  ctx,
  eng,
  log,
  fail,
  task,
  sql,
  tableHue,
  hueStyle,
  HUES,
} from "../state.mjs";
import { ui, icon as uiIcon } from "../icons.mjs";
import * as G from "../sqlgen.mjs";
import { refreshDb } from "./data.mjs";

import { schemaLayout } from "../schema-layout.mjs";

const BW = 232,
  RH = 26,
  HH = 38,
  SNAP = 8;
const geo = (t) => {
  const p = S.pos[t.name],
    h = HH + t.columns.length * RH + 8;
  return { x: p[0], y: p[1], w: BW, h, ry: (i) => p[1] + HH + i * RH + RH / 2 };
};
const colIdx = (t, c) => t.columns.findIndex((k) => k.name === c);
const tables = () => S.cat?.tables || [];
const byName = (n) => tables().find((t) => t.name === n);
let drag = null,
  pan = null,
  dragFrame = 0;

function schemaChanged(names, final = false) {
  S.layouts[S.db] = S.pos;
  if (!final) {
    S.layoutDirty = true;
    S.layoutVersion++;
    ctx.shell();
    ctx.schedulePersist?.();
  }
  for (const table of names) ctx.schemaMoved?.(S.db, table, S.pos[table], final);
}

function layout() {
  Object.assign(S.pos, schemaLayout(tables()));
}
function ensurePos() {
  if (tables().some((t) => !S.pos[t.name])) {
    const had = Object.keys(S.pos).length;
    if (!had) layout();
    else
      for (const t of tables())
        if (!S.pos[t.name]) {
          for (let i = 0; i < 4000; i++) {
            const x = 40 + (i % 4) * (BW + 96),
              y = 40 + Math.floor(i / 4) * 64,
              h = HH + t.columns.length * RH + 8;
            const hit = tables()
              .filter((other) => other.name !== t.name && S.pos[other.name])
              .some((other) => {
                const [ox, oy] = S.pos[other.name],
                  oh = HH + other.columns.length * RH + 8;
                return (
                  x < ox + BW + 20 &&
                  x + BW + 20 > ox &&
                  y < oy + oh + 20 &&
                  y + h + 20 > oy
                );
              });
            if (!hit) {
              S.pos[t.name] = [x, y];
              break;
            }
          }
        }
  }
}
function fit() {
  const T = tables();
  const box = $("#canvas");
  if (!T.length || !box.clientWidth) return;
  const xs = T.map((t) => S.pos[t.name][0]),
    ys = T.map((t) => S.pos[t.name][1]),
    w = Math.max(...xs) + BW + 40 - Math.min(...xs),
    h = Math.max(...T.map((t) => geo(t).y + geo(t).h)) + 40 - Math.min(...ys);
  S.zoom = Math.max(
    0.4,
    Math.min(1.1, Math.min(box.clientWidth / w, box.clientHeight / h)),
  );
  S.pan = [
    (box.clientWidth - w * S.zoom) / 2 - Math.min(...xs) * S.zoom + 20,
    (box.clientHeight - h * S.zoom) / 2 - Math.min(...ys) * S.zoom + 20,
  ];
}
const applyView = () => {
  $("#layer")?.setAttribute(
    "transform",
    `translate(${S.pan[0]} ${S.pan[1]}) scale(${S.zoom})`,
  );
  const z = $("#zl");
  if (z) z.textContent = Math.round(S.zoom * 100) + " %";
};

function links() {
  const out = [];
  for (const t of tables())
    for (const f of t.fks) {
      const p = byName(f.refTable);
      if (!p) continue;
      const g1 = geo(t),
        g2 = geo(p),
        ci = colIdx(t, f.column),
        pi = colIdx(p, f.refColumn);
      if (ci < 0 || pi < 0) continue;
      let cs, ps;
      if (g1.x > g2.x + BW) {
        cs = -1;
        ps = 1;
      } else if (g1.x + BW < g2.x) {
        cs = 1;
        ps = -1;
      } else {
        cs = ps = 1;
      }
      const a = [g1.x + (cs < 0 ? 0 : BW), g1.ry(ci)],
        b = [g2.x + (ps < 0 ? 0 : BW), g2.ry(pi)],
        dx = cs === ps ? 70 : Math.max(50, Math.abs(a[0] - b[0]) / 2);
      out.push({
        t: t.name,
        f,
        a,
        b,
        cs,
        ps,
        nullable: (f.columns ?? [f.column]).some(
          (c) => t.columns.find((x) => x.name === c)?.nullable,
        ),
        many: !t.indexes.some(
          (i) =>
            i.unique &&
            i.columns.every((c) => (f.columns ?? [f.column]).includes(c)),
        ),
        d: `M${a[0]} ${a[1]} C${a[0] + cs * dx} ${a[1]},${b[0] + ps * dx} ${b[1]},${b[0]} ${b[1]}`,
        mid: [(a[0] + b[0]) / 2 + (cs === ps ? 40 : 0), (a[1] + b[1]) / 2],
      });
    }
  return out;
}
const icon = (kind, x, y) =>
  kind === "pk"
    ? `<g class="ic pk" transform="translate(${x},${y - 7}) scale(.9)"><circle cx="4.5" cy="8" r="2.8"/><path d="M7.3 8H13M11 8v2.4"/></g>`
    : `<g class="ic fk" transform="translate(${x},${y - 7}) scale(.9)"><path d="M6.5 9.5l3-3M5 8L3.6 9.4a2.2 2.2 0 0 0 3.1 3.1L8 11.2M11 8l1.4-1.4a2.2 2.2 0 0 0-3.1-3.1L8 4.8"/></g>`;

export function drawSchema() {
  const T = tables();
  $("#sdb").innerHTML = S.dbs
    .filter((d) => !d.system)
    .map(
      (d) =>
        `<option ${d.name === S.db ? "selected" : ""}>${esc(d.name)}</option>`,
    )
    .join("");
  const rel = T.reduce((a, t) => a + t.fks.length, 0);
  $("#scount").textContent =
    `${plural(T.length, "table", "tables")} · ${plural(rel, "relation", "relations")}`;
  const sv = $("#sv");
  sv.toggleAttribute("hidden", !T.length);
  $("#schemaEmpty").hidden = !!T.length;
  $("#schemaHint").hidden = !T.length;
  for (const b of document.querySelectorAll("#v-schema .bar [data-act]")) {
    const two = b.dataset.act === "joinTable";
    b.disabled = two ? T.length < 2 : !T.length;
  }
  if (!T.length) {
    $("#layer").replaceChildren();
    $("#insp").replaceChildren();
    $("#sgrid").classList.remove("has-sel");
    S.schemaSel = null;
    S.link = null;
    S.viewFit = false;
    drag = pan = null;
    return;
  }
  ensurePos();
  if (!S.viewFit) {
    S.viewFit = true;
    requestAnimationFrame(() => {
      fit();
      applyView();
    });
  }
  const L = links(),
    sel = S.schemaSel,
    rel2 = new Set();
  if (sel)
    L.forEach(
      (l) =>
        (l.t === sel || l.f.refTable === sel) &&
        (rel2.add(l.t), rel2.add(l.f.refTable)),
    );
  const lk = S.link;
  let svg = L.map((l) => {
    const on = !sel || l.t === sel || l.f.refTable === sel,
      o = l.cs,
      po = l.ps;
    return `<g class="lkg ${on ? "" : "dim"}" style="--h:${tableHue(l.t)}" data-rel="${esc(l.t)}|${esc(l.f.name)}"><path class="lk-hit" d="${l.d}"/><path class="lk" d="${l.d}"/>
      <path class="crow" style="display:${l.many ? "" : "none"}" d="M${l.a[0]} ${l.a[1] - 5}L${l.a[0] + o * 11} ${l.a[1]}M${l.a[0]} ${l.a[1]}L${l.a[0] + o * 11} ${l.a[1]}M${l.a[0]} ${l.a[1] + 5}L${l.a[0] + o * 11} ${l.a[1]}"/>
      ${!l.many ? `<path class="one" d="M${l.a[0] + o * 9} ${l.a[1] - 5}L${l.a[0] + o * 9} ${l.a[1] + 5}"/>` : ""}<path class="one" d="M${l.b[0] + po * 9} ${l.b[1] - 5}L${l.b[0] + po * 9} ${l.b[1] + 5}"/>${l.nullable ? `<circle class="opt" cx="${l.b[0] + po * 16}" cy="${l.b[1]}" r="3.5"/>` : `${!l.many ? `<path class="one" d="M${l.a[0] + o * 9} ${l.a[1] - 5}L${l.a[0] + o * 9} ${l.a[1] + 5}"/>` : ""}<path class="one" d="M${l.b[0] + po * 14} ${l.b[1] - 5}L${l.b[0] + po * 14} ${l.b[1] + 5}"/>`}
      <title>${esc(l.t)} (${l.many ? "0..N" : "0..1"}) → ${esc(l.f.refTable)} (${l.nullable ? "0..1" : "1..1"}) · ${esc((l.f.columns ?? [l.f.column]).join(", "))}</title><text class="cardinality" x="${l.mid[0]}" y="${l.mid[1] - 12}" text-anchor="middle">${l.many ? "0..N" : "0..1"} → ${l.nullable ? "0..1" : "1..1"}</text><g class="lab" transform="translate(${l.mid[0]},${l.mid[1]})"><rect x="-58" y="-11" width="116" height="22" rx="11"/><text text-anchor="middle" y="4">ON DELETE ${esc(l.f.onDelete)}</text></g></g>`;
  }).join("");
  svg += T.map((t) => {
    const g = geo(t),
      isSel = sel === t.name,
      dim = sel && !isSel && !rel2.has(t.name),
      jt = t.fks.length === 2 && t.columns.length <= 3;
    return `<g class="tb ${isSel ? "sel" : ""} ${dim ? "dim" : ""} ${jt ? "jt" : ""}" data-t="${esc(t.name)}" style="${hueStyle(t.name)}" transform="translate(${g.x},${g.y})">
      <rect class="shadow" x="2" y="4" width="${BW}" height="${g.h}" rx="10"/><rect class="box" width="${BW}" height="${g.h}" rx="10"/><path class="head" d="M0 10a10 10 0 0 1 10-10h${BW - 20}a10 10 0 0 1 10 10v${HH - 10}H0z"/>
      <g data-drag="${esc(t.name)}" tabindex="0" role="button" aria-label="Table ${esc(t.name)}. Flèches pour déplacer, Entrée pour sélectionner" class="hd"><rect width="${BW}" height="${HH}" fill="transparent"/><text class="tt" x="14" y="24">${esc(t.name)}</text><text class="tn" x="${BW - 14}" y="24" text-anchor="end">${t.rows}</text></g>
      ${t.columns
        .map((c, i) => {
          const fk = t.fks.find((f) =>
              (f.columns ?? [f.column]).includes(c.name),
            ),
            y = HH + i * RH + RH / 2,
            hv = lk?.hover && lk.hover.t === t.name && lk.hover.c === c.name,
            tgt = lk && lk.from.t !== t.name;
          return `<g class="col ${c.key === "PRI" ? "pk" : ""} ${fk ? "fk" : ""} ${hv ? "hov" : ""} ${tgt && c.key === "PRI" ? "target" : ""} ${tgt && c.key !== "PRI" ? "muted" : ""}" data-col="${esc(c.name)}" data-t="${esc(t.name)}"><rect class="cbg" x="4" y="${y - RH / 2}" width="${BW - 8}" height="${RH}" rx="5"/>
          ${c.key === "PRI" ? icon("pk", 12, y) : fk ? icon("fk", 12, y) : ""}<text class="cn" x="30" y="${y + 4}">${esc(c.name)}</text><text class="cy" x="${BW - 16}" y="${y + 4}" text-anchor="end">${esc(c.type)}</text>
          <circle class="port" data-port="l" cx="0" cy="${y}" r="5.5"/><circle class="port" data-port="r" cx="${BW}" cy="${y}" r="5.5"/></g>`;
        })
        .join("")}</g>`;
  }).join("");
  if (lk) {
    const fg = geo(byName(lk.from.t)),
      fi = colIdx(byName(lk.from.t), lk.from.c),
      sx = lk.x > fg.x + BW / 2 ? fg.x + BW : fg.x,
      sy = fg.ry(fi);
    svg += `<path class="rubber" d="M${sx} ${sy} C${sx + (lk.x > sx ? 60 : -60)} ${sy},${lk.x + (lk.x > sx ? -60 : 60)} ${lk.y},${lk.x} ${lk.y}"/><circle class="rubber-dot" cx="${lk.x}" cy="${lk.y}" r="5"/>`;
  }
  // Last SVG child paints above every table without intercepting pointer input.
  $("#layer").innerHTML =
    svg +
    '<g id="schema-link-overlay" class="lkg schema-link-overlay" aria-hidden="true" pointer-events="none"></g>';
  applyView();
  ctx.schedulePersist?.();
  /* fiche de la table sélectionnée */
  const g = $("#sgrid"),
    t = sel && byName(sel);
  g.classList.toggle("has-sel", !!t);
  if (t)
    $("#insp").innerHTML =
      `<div style="${hueStyle(t.name)}"><div class="ihead"><i class="td big"></i><div class="grow"><h3 class="trunc">${esc(t.name)}</h3><p class="hint num">${plural(t.columns.length, "colonne", "colonnes")} · ${plural(t.rows, "ligne", "lignes")} · ${plural(t.fks.length, "relation", "relations")}</p></div><button class="btn quiet sm" data-act="schemaSel" data-arg="${esc(t.name)}" aria-label="Fermer la fiche">${uiIcon("x")}</button></div>
    <div class="sw8" role="group" aria-label="Couleur de la table">${HUES.map((h) => `<button class="hsw ${tableHue(t.name) === h ? "on" : ""}" style="--h:${h}" data-act="tableHue" aria-pressed="${tableHue(t.name) === h}" data-arg="${esc(t.name)}|${h}" aria-label="Couleur ${h}"></button>`).join("")}</div>
    <div class="ibtns"><button class="btn pri" data-act="selectTable" data-arg="${esc(t.name)}">Voir les données</button><button class="btn" data-act="openStruct" data-arg="${esc(t.name)}">Structure</button></div>
    <button class="btn" data-act="relationForm">Relier des tables</button><button class="btn" data-act="schemaColAdd" data-arg="${esc(t.name)}">Ajouter une colonne</button>
    <p class="hint" style="margin-top:12px">Glissez le point d’un champ vers la clé d’une autre table pour créer une relation. Cliquez un lien pour le modifier.</p></div>`;
}

/* ───────── relations ───────── */
function relPop({ child, parent, fk, x, y }) {
  if ((fk?.columns?.length ?? 0) > 1) {
    A.relationForm({ child: child.t, parent: parent.t, ...fk });
    return;
  }
  const ct = byName(child.t),
    pt = byName(parent.t),
    cc = ct.columns.find((c) => c.name === child.c),
    pc = pt.columns.find((c) => c.name === parent.c);
  const unique =
    pc.key === "PRI" ||
    pt.indexes.some(
      (i) => i.unique && i.columns.length === 1 && i.columns[0] === pc.name,
    );
  const warn = !unique
    ? `La colonne parente « ${pt.name}.${pc.name} » doit être une clé primaire ou unique.`
    : G.family(cc.type) !== G.family(pc.type)
      ? `Les types diffèrent (${cc.type} et ${pc.type}) : MariaDB refusera la relation.`
      : "";
  const existing = fk || ct.fks.find((f) => f.column === cc.name);
  const state = {
    del: fk?.onDelete || "RESTRICT",
    upd: fk?.onUpdate || "CASCADE",
  };
  const build = () =>
    [
      existing ? G.dropFk(ct.name, existing.name) : null,
      G.addFk(ct.name, {
        col: cc.name,
        ref: pt.name,
        refCol: pc.name,
        onDelete: state.del,
        onUpdate: state.upd,
        name: existing?.name || G.fkName(ct.name, cc.name),
      }),
    ].filter(Boolean);
  const sel = (id, opts, v) =>
    `<label class="field" style="margin:0"><span>${id === "rd" ? "Si la ligne référencée est supprimée" : "Si sa clé est modifiée"}</span><select class="in" id="${id}" aria-describedby="${id}-help" style="width:100%">${opts.map((o) => `<option value="${o}" ${o === v ? "selected" : ""}>${esc(relationRule(o, id === "ru").label)}</option>`).join("")}</select></label><p class="hint relation-rule-help" id="${id}-help" aria-live="polite"></p>`;
  const p = menu(at(x, y), 0, {
    cls: "relpop",
    html: `<div class="ph">${fk ? "Modifier la relation" : existing ? "Remplacer la relation" : "Nouvelle relation"}</div>
    <div class="relhead"><span class="pillt" style="--h:${tableHue(ct.name)}">${esc(ct.name)}.${esc(cc.name)}</span><span class="relarrow">${uiIcon("arrow-right")}</span><span class="pillt" style="--h:${tableHue(pt.name)}">${esc(pt.name)}.${esc(pc.name)}</span></div>
    <p class="pp">Plusieurs <b>${esc(ct.name)}</b> pour un <b>${esc(pt.name)}</b>${cc.nullable ? ", le parent est facultatif" : ", le parent est obligatoire"}.</p>
    <div style="display:grid;gap:8px;padding:0 10px 6px">${sel("rd", relationRules, state.del)}${sel("ru", relationRules, state.upd)}<details class="sql-disclosure"><summary>Voir la requête SQL</summary><pre class="pre sqlh" id="rsql"></pre></details>${warn ? `<p class="hint bad">${esc(warn)}</p>` : ""}</div>
    <div style="display:flex;gap:6px;padding:4px 10px 10px;justify-content:space-between">${fk ? '<button class="btn sm bad" id="rdrop">Supprimer</button>' : "<span></span>"}<span style="display:flex;gap:6px"><button class="btn sm" id="rno">Annuler</button><button class="btn sm pri" id="rok" ${unique ? "" : "disabled"}>${fk ? "Appliquer" : "Créer la relation"}</button></span></div>`,
  });
  const paint = () => {
    $("#rd-help", p).textContent = relationRule(
      state.del,
      false,
      ct.name,
      pt.name,
    ).detail;
    $("#ru-help", p).textContent = relationRule(
      state.upd,
      true,
      ct.name,
      pt.name,
    ).detail;
    $("#rsql", p).innerHTML = sqlHtml(build().join("\n"));
    p.reposition?.();
  };
  paint();
  p.addEventListener("change", (e) => {
    if (e.target.id === "rd") state.del = e.target.value;
    if (e.target.id === "ru") state.upd = e.target.value;
    paint();
  });
  $("#rno", p).onclick = () => p.remove();
  $("#rok", p).onclick = async () => {
    const ok = await apply("Création de la relation", async () => {
      const statements = build();
      await sql(
        statements.length === 2
          ? statements[0].replace(/;$/, "") +
              ", " +
              statements[1].replace(/^ALTER TABLE `(?:``|[^`])+` /, "")
          : statements,
      );
    });
    if (!ok) return;
    p.remove();
    toast(
      fk
        ? "Relation modifiée"
        : `Relation créée : ${ct.name}.${cc.name} → ${pt.name}`,
    );
  };
  if (fk)
    $("#rdrop", p).onclick = async () => {
      const ok = await apply("Suppression de la relation", async () => {
        await sql(G.dropFk(ct.name, fk.name));
      });
      if (!ok) return;
      p.remove();
      toast("Relation supprimée : les données ne changent pas");
    };
}
async function apply(label, fn) {
  const ok = await task(label, async () => {
    await fn();
    await refreshDb({ rows: false });
    return true;
  });
  ctx.draw();
  return ok;
}

Object.assign(A, {
  schemaSel(t) {
    S.schemaSel = S.schemaSel === t ? null : t;
    drawSchema();
  },
  zoom(d) {
    const box = $("#canvas"),
      cx = box.clientWidth / 2,
      cy = box.clientHeight / 2,
      z = Math.max(0.4, Math.min(1.6, S.zoom * (+d > 0 ? 1.15 : 1 / 1.15)));
    S.pan = [
      cx - ((cx - S.pan[0]) * z) / S.zoom,
      cy - ((cy - S.pan[1]) * z) / S.zoom,
    ];
    S.zoom = z;
    applyView();
  },
  schemaFit() {
    fit();
    applyView();
  },
  schemaLayout() {
    layout();
    S.viewFit = false;
    schemaChanged(Object.keys(S.pos));
    schemaChanged(Object.keys(S.pos), true);
    drawSchema();
    toast("Tables réorganisées par dépendance");
  },
  tableHue(arg) {
    const [n, h] = arg.split("|");
    S.hue[n] = +h;
    ctx.draw();
  },
  async openStruct(t) {
    S.dmode = "struct";
    await A.selectTable(t);
  },
  async schemaColAdd(t) {
    await A.openStruct(t);
    return A.columnForm();
  },
  async joinTable() {
    const names = tables().map((t) => t.name);
    if (names.length < 2) return toast("Il faut au moins deux tables.");
    const r = await ddl({
      title: "Liaison N–N",
      ok: "Créer la table de liaison",
      fields: [
        { id: "a", type: "select", label: "Première table", options: names },
        {
          id: "b",
          type: "select",
          label: "Seconde table",
          options: names,
          value: names[1],
        },
        {
          id: "n",
          label: "Nom de la table de liaison",
          value: names[0] + "_" + names[1],
        },
      ],
      check: (v) =>
        v.a === v.b
          ? "Choisissez deux tables différentes."
          : !/^\w{1,64}$/.test(v.n)
            ? "Nom invalide."
            : byName(v.n)
              ? "Cette table existe déjà."
              : "",
      sql: (v) => G.joinTable(v.n, v.a, v.b, S.cat.tables),
    });
    if (r) {
      await apply("Création de la liaison", async () => {
        await sql(G.joinTable(r.n, r.a, r.b, S.cat.tables));
      });
      toast("Table de liaison créée");
    }
  },
  addRel() {
    return A.relationForm();
  },
  schemaSvg() {
    const original = $("#sv"),
      clone = original.cloneNode(true),
      a = [original, ...original.querySelectorAll("*")],
      b = [clone, ...clone.querySelectorAll("*")];
    const properties = [
      "fill",
      "stroke",
      "stroke-width",
      "stroke-dasharray",
      "stroke-linecap",
      "stroke-linejoin",
      "font-family",
      "font-size",
      "font-weight",
      "opacity",
      "paint-order",
    ];
    a.forEach((node, i) => {
      const style = getComputedStyle(node);
      for (const key of properties)
        b[i].style.setProperty(key, style.getPropertyValue(key));
    });
    const bounds = $("#layer").getBBox();
    clone.querySelector("#layer").removeAttribute("transform");
    clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    clone.setAttribute(
      "viewBox",
      `${bounds.x - 24} ${bounds.y - 24} ${bounds.width + 48} ${bounds.height + 48}`,
    );
    clone.setAttribute("width", bounds.width + 48);
    clone.setAttribute("height", bounds.height + 48);
    clone.style.background = getComputedStyle($("#canvas")).backgroundColor;
    const data = new XMLSerializer().serializeToString(clone),
      link = document.createElement("a"),
      url = URL.createObjectURL(new Blob([data], { type: "image/svg+xml" }));
    link.href = url;
    link.download = S.db + "-schema.svg";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast("Schéma exporté en SVG avec ses couleurs");
  },
});

/* ───────── interactions ───────── */
export function bindSchema() {
  const sv = $("#sv"),
    pt = (e) => {
      const r = sv.getBoundingClientRect();
      return [
        (e.clientX - r.left - S.pan[0]) / S.zoom,
        (e.clientY - r.top - S.pan[1]) / S.zoom,
      ];
    };
  const showHint = (relation) => {
    const overlay = $("#schema-link-overlay");
    if (!overlay) return;
    overlay.replaceChildren();
    if (!relation) return;
    for (const label of relation.querySelectorAll(".lab, .cardinality"))
      overlay.append(label.cloneNode(true));
  };
  const moveTable = () => {
    const [x, y] = pt(drag.pointer);
    const next = [Math.round((x - drag.anchor[0]) / SNAP) * SNAP,
      Math.round((y - drag.anchor[1]) / SNAP) * SNAP];
    const previous = S.pos[drag.t];
    if (next[0] === previous[0] && next[1] === previous[1]) return;
    S.pos[drag.t] = next;
    schemaChanged([drag.t]);
    drawSchema();
  };
  const edgePan = () => {
    dragFrame = 0;
    if (!drag?.moved || drag.rel || !drag.pointer) return;
    const r = sv.getBoundingClientRect(), p = drag.pointer;
    const speed = (value, min, max) => value < min + 36 ? Math.min(16, (min + 36 - value) / 3)
      : value > max - 36 ? -Math.min(16, (value - max + 36) / 3) : 0;
    const dx = speed(p.clientX, r.left, r.right), dy = speed(p.clientY, r.top, r.bottom);
    if (!dx && !dy) return;
    S.pan = [S.pan[0] + dx, S.pan[1] + dy];
    moveTable();
    applyView();
    dragFrame = requestAnimationFrame(edgePan);
  };
  const stopEdgePan = () => { cancelAnimationFrame(dragFrame); dragFrame = 0; };
  sv.addEventListener("pointerover", (e) =>
    showHint(e.target.closest("[data-rel]")),
  );
  sv.addEventListener("pointerleave", () => showHint(null));
  sv.addEventListener("focusin", (e) =>
    showHint(e.target.closest("[data-rel]")),
  );
  sv.addEventListener("focusout", () => showHint(null));
  sv.addEventListener("pointerdown", (e) => {
    const port = e.target.closest("[data-port]"),
      colEl = e.target.closest("[data-col]"),
      hd = e.target.closest("[data-drag]");
    if (port && colEl) {
      e.preventDefault();
      const [x, y] = pt(e);
      S.link = {
        from: { t: colEl.dataset.t, c: colEl.dataset.col },
        x,
        y,
        hover: null,
      };
      sv.setPointerCapture?.(e.pointerId);
      drawSchema();
      return;
    }
    if (hd) {
      sv.setPointerCapture?.(e.pointerId);
      drag = {
        t: hd.dataset.drag,
        sx: e.clientX,
        sy: e.clientY,
        anchor: pt(e).map((value, i) => value - S.pos[hd.dataset.drag][i]),
        pointer: { clientX: e.clientX, clientY: e.clientY },
        moved: false,
      };
      return;
    }
    const rel = e.target.closest("[data-rel]");
    if (rel) {
      drag = {
        rel: rel.dataset.rel,
        sx: e.clientX,
        sy: e.clientY,
        moved: false,
      };
      return;
    }
    pan = { sx: e.clientX, sy: e.clientY, o: [...S.pan], moved: false };
    sv.setPointerCapture?.(e.pointerId);
    sv.classList.add("panning");
  });
  sv.addEventListener("pointermove", (e) => {
    if (S.link) {
      const [x, y] = pt(e),
        el = document
          .elementFromPoint(e.clientX, e.clientY)
          ?.closest?.("[data-col]");
      S.link.x = x;
      S.link.y = y;
      const h =
        el && el.dataset.t !== S.link.from.t
          ? { t: el.dataset.t, c: el.dataset.col }
          : null;
      S.link.hover = h;
      drawSchema();
      return;
    }
    if (drag && !drag.rel) {
      const dx = (e.clientX - drag.sx) / S.zoom,
        dy = (e.clientY - drag.sy) / S.zoom;
      if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true;
      if (drag.moved) {
        drag.pointer = { clientX: e.clientX, clientY: e.clientY };
        moveTable();
        if (!dragFrame) dragFrame = requestAnimationFrame(edgePan);
      }
      return;
    }
    if (pan) {
      if (Math.abs(e.clientX - pan.sx) + Math.abs(e.clientY - pan.sy) > 3)
        pan.moved = true;
      S.pan = [pan.o[0] + e.clientX - pan.sx, pan.o[1] + e.clientY - pan.sy];
      applyView();
    }
  });
  sv.addEventListener("pointerup", (e) => {
    stopEdgePan();
    if (drag?.moved && !drag.rel) schemaChanged([drag.t], true);
    if (S.link) {
      const l = S.link;
      S.link = null;
      drawSchema();
      if (l.hover) {
        const ct = byName(l.from.t),
          pc = byName(l.hover.t).columns.find((c) => c.name === l.hover.c),
          fc = ct.columns.find((c) => c.name === l.from.c);
        const fromPk = fc.key === "PRI",
          toPk = pc.key === "PRI";
        const [child, parent] =
          fromPk && !toPk ? [l.hover, l.from] : [l.from, l.hover];
        relPop({ child, parent, x: e.clientX, y: e.clientY });
      }
      return;
    }
    if (drag) {
      const d = drag;
      drag = null;
      if (d.rel) {
        if (!d.moved) {
          const [t, name] = d.rel.split("|"),
            f = byName(t).fks.find((x) => x.name === name);
          if (f)
            relPop({
              child: { t, c: f.column },
              parent: { t: f.refTable, c: f.refColumn },
              fk: f,
              x: e.clientX,
              y: e.clientY,
            });
        }
      } else if (!d.moved) A.schemaSel(d.t);
      return;
    }
    if (pan) {
      const p = pan;
      pan = null;
      sv.classList.remove("panning");
      if (!p.moved && S.schemaSel) A.schemaSel(S.schemaSel);
    }
  });
  sv.addEventListener("pointercancel", () => {
    stopEdgePan();
    if (drag?.moved && !drag.rel) schemaChanged([drag.t], true);
    S.link = null;
    drag = null;
    pan = null;
    sv.classList.remove("panning");
    drawSchema();
  });
  sv.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      const r = sv.getBoundingClientRect(),
        mx = e.clientX - r.left,
        my = e.clientY - r.top,
        z = Math.max(
          0.4,
          Math.min(1.6, S.zoom * (e.deltaY < 0 ? 1.1 : 1 / 1.1)),
        );
      S.pan = [
        mx - ((mx - S.pan[0]) * z) / S.zoom,
        my - ((my - S.pan[1]) * z) / S.zoom,
      ];
      S.zoom = z;
      applyView();
    },
    { passive: false },
  );
  sv.addEventListener("keydown", (e) => {
    const g = e.target.closest("[data-drag]");
    if (!g) return;
    const n = g.dataset.drag,
      k = {
        ArrowLeft: [-SNAP, 0],
        ArrowRight: [SNAP, 0],
        ArrowUp: [0, -SNAP],
        ArrowDown: [0, SNAP],
      }[e.key];
    if (k) {
      e.preventDefault();
      S.pos[n] = [S.pos[n][0] + k[0], S.pos[n][1] + k[1]];
      schemaChanged([n]);
      schemaChanged([n], true);
      drawSchema();
      $(`[data-drag="${CSS.escape(n)}"]`)?.focus();
    } else if (e.key === "Enter") A.schemaSel(n);
  });
  $("#sdb").addEventListener("change", async (e) => {
    S.db = e.target.value;
    S.table = null;
    S.schemaSel = null;
    S.viewFit = false;
    await task("Lecture du schéma", () => refreshDb({ rows: false }));
    ctx.draw();
  });
}
