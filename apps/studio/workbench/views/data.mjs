/** Espace Données : arbre avec actions rapides, grille éditable au clavier, ligne d'ajout, structure colorée, console SQL. */
import {
  $,
  $$,
  esc,
  plural,
  toast,
  menu,
  ddl,
  modal,
  confirmDlg,
  mkEditor,
  sqlHtml,
  at,
} from "../ui.mjs";
import {
  S,
  A,
  ctx,
  eng,
  log,
  fail,
  task,
  sql,
  setLamp,
  tableHue,
  hueStyle,
} from "../state.mjs";
import { ui } from "../icons.mjs";
import * as G from "../sqlgen.mjs";

let edQ = null;
const cur = () => S.cat?.tables.find((t) => t.name === S.table);
const pkOf = (t) => t.columns.filter((c) => c.key === "PRI");
const isAuto = (c) => /auto/i.test(c.extra);
const TYPES = [
  "INT",
  "BIGINT",
  "VARCHAR(255)",
  "TEXT",
  "DATE",
  "DATETIME",
  "DECIMAL(10,2)",
  "TINYINT(1)",
];
const tyChip = (t, extra = "") =>
  `<span class="ty ${G.family(t)}" ${extra}>${esc(t)}</span>`;
const NAME = /^\w{1,64}$/;

export async function loadCatalog() {
  S.cat = null;
  S.cat = await eng().db.catalog(S.db);
  if (!S.table || !cur()) S.table = S.cat.tables[0]?.name ?? null;
}
export async function loadRows() {
  const t = cur();
  if (!t || S.dmode === "sql") {
    S.grid = null;
    return;
  }
  const q = (s) => eng().db.query(s, S.db);
  const search = { text: S.search, columns: t.columns.map((c) => c.name) };
  S.total = Number(
    (await q(G.select(t.name, { filter: S.filter, search, count: 1 })))[0]
      .rows[0][0],
  );
  if (!S.filter && !S.search) t.rows = S.total;
  S.page = Math.min(S.page, Math.max(1, Math.ceil(S.total / 100)));
  S.grid = (
    await q(
      G.select(t.name, {
        filter: S.filter,
        search,
        sort: S.sort,
        offset: (S.page - 1) * 100,
      }),
    )
  )[0];
}
export async function refreshDb({ rows = true } = {}) {
  if (S.layoutDB !== S.db) {
    S.layouts ??= {};
    if (S.layoutDB) S.layouts[S.layoutDB] = S.pos;
    S.pos = S.layouts[S.db] ?? {};
    S.layouts[S.db] = S.pos;
    S.layoutDB = S.db;
  }
  S.dbs = await eng().db.databases();
  if (!S.dbs.some((d) => d.name === S.db))
    S.db = S.dbs.find((d) => !d.system)?.name ?? S.dbs[0]?.name;
  await loadCatalog();
  if (rows) await loadRows();
}
async function run(label, fn) {
  const r = await task(label, async () => {
    await fn();
    await refreshDb();
    return true;
  });
  ctx.draw();
  return r;
}

/* ───────── arbre : bases et tables ───────── */
export function drawDtree() {
  $("#dbtree").innerHTML =
    [...S.dbs]
      .sort(
        (a, b) =>
          Number(a.system) - Number(b.system) || a.name.localeCompare(b.name),
      )
      .map((d) => {
        const open = d.name === S.db && !S.dbCollapsed;
        return (
          `<div class="row db${d.system ? " sys" : ""}" data-act="toggleDb" data-arg="${esc(d.name)}" role="treeitem" aria-level="1" aria-selected="${d.name === S.db}" aria-expanded="${open}" tabindex="0">${ui.chev.replace('class="chev"', 'class="chev' + (open ? " open" : "") + '"')}<span class="nm trunc">${esc(d.name)}</span>${d.system ? '<span class="cnt">système</span>' : `<span class="acts"><button data-act="quickTableStart" data-arg="${esc(d.name)}" aria-label="Nouvelle table dans ${esc(d.name)}" title="Nouvelle table">${ui.plus}</button><button data-act="dbMenu" aria-label="Actions sur la base" aria-haspopup="true">${ui.more}</button></span>`}</div>` +
          (open && S.cat
            ? S.cat.tables
                .filter(
                  (t) =>
                    !S.tableQuery ||
                    t.name
                      .toLocaleLowerCase("fr")
                      .includes(S.tableQuery.toLocaleLowerCase("fr")),
                )
                .map(
                  (t) =>
                    `<div class="row tb${t.name === S.table ? " active" : ""}" data-act="selectTable" data-arg="${esc(t.name)}" role="treeitem" aria-level="2" aria-selected="${t.name === S.table}" tabindex="0" style="${hueStyle(t.name)}"><i class="td"></i><span class="nm trunc">${esc(t.name)}</span><span class="cnt num">${t.rows}</span><span class="acts"><button data-act="rowQuick" data-arg="${esc(t.name)}" aria-label="Ajouter une ligne à ${esc(t.name)}" title="Ajouter une ligne">${ui.plus}</button></span></div>`,
                )
                .join("") +
              (d.system
                ? ""
                : S.newTable
                  ? `<div class="row tb new" role="treeitem"><i class="td ghost"></i><input class="ren" id="ntName" placeholder="nom_de_la_table" aria-label="Nom de la nouvelle table" spellcheck="false" autocomplete="off"></div>`
                  : `<button role="treeitem" class="row tb ghostrow" data-act="quickTableStart">${ui.plus}<span>Nouvelle table</span></button>`)
            : "")
        );
      })
      .join("") +
    `<button role="treeitem" class="row ghostrow" data-act="createDb" style="margin-top:6px">${ui.plus}<span>Nouvelle base</span></button>`;
  const i = $("#ntName");
  if (i && !i.dataset.f) {
    i.dataset.f = 1;
    i.focus();
  }
}

/* ───────── zone principale ───────── */
export function drawData() {
  drawDtree();
  const m = $("#dmain"),
    db = S.dbs.find((d) => d.name === S.db);
  if (!eng().db.ready) {
    m.innerHTML = `<div class="empty"><b>Initialisation de MariaDB…</b><span>La base démarre au premier passage dans cet espace. Les fichiers PHP n’en ont pas besoin pour s’ouvrir.</span></div>`;
    return;
  }
  const t = cur();
  const head = `<div class="bar dh"><span class="crumbs" style="padding:0;min-height:0"><span>${esc(S.db)}</span>${t ? `<span>›</span><b style="${hueStyle(t.name)}"><i class="td"></i> ${esc(t.name)}</b>` : ""}</span>
    <span class="seg" role="group" aria-label="Vue">${[
      ["data", "Données"],
      ["struct", "Structure"],
      ["sql", "Requête SQL"],
    ]
      .map(
        ([k, l]) =>
          `<button aria-pressed="${S.dmode === k}" data-act="dmode" data-arg="${k}">${l}</button>`,
      )
      .join("")}</span><span class="grow"></span>
    ${S.dmode === "data" && t ? `<button class="btn pri" data-act="rowQuick" data-arg="${esc(t.name)}">${ui.plus}Ligne</button><button class="btn" data-act="colQuick">${ui.plus}Colonne</button>` : ""}
    ${S.dmode === "struct" && t ? `<button class="btn" data-act="columnForm">${ui.plus}Colonne</button><button class="btn" data-act="primaryKeyForm">Clé primaire</button><button class="btn" data-act="relationForm">${ui.link}Relation</button><button class="btn" data-act="idxAdd">${ui.plus}Index</button>` : ""}
    <button class="btn" data-act="quickTableStart">${ui.plus}Table</button><button class="btn quiet" data-act="tableMenu" aria-haspopup="true" aria-label="Plus d’actions">${ui.more}</button></div>`;
  if (S.dmode === "sql") {
    drawSql(head);
    return;
  }
  if (!t) {
    m.innerHTML =
      head +
      `<div class="empty"><b>${db?.system ? "Base système" : "Aucune table dans cette base"}</b><span>${db?.system ? "Cette base appartient au moteur. Elle reste en lecture seule ici." : "Créez la première en une saisie : un identifiant automatique est ajouté, vous complétez ensuite les colonnes."}</span>${db?.system ? "" : `<button class="btn pri" data-act="quickTableStart">${ui.plus}Nouvelle table</button>`}</div>`;
    return;
  }
  edQ?.destroy();
  edQ = null;
  m.innerHTML = head + (S.dmode === "struct" ? structHtml(t) : dataHtml(t));
  if (S.dmode === "data") afterGrid();
  else if (S.focus === "newcol") {
    $("#ncName")?.focus();
    S.focus = null;
  }
}

/* ───────── grille ───────── */
function dataHtml(t) {
  const g = S.grid,
    pages = Math.max(1, Math.ceil(S.total / 100));
  S.page = Math.min(S.page, pages);
  const searchBar = `<form class="data-searchbar" id="dataSearchForm" role="search" aria-label="Rechercher dans la table"><label class="data-search">${ui.search}<input class="in" id="dataSearch" type="search" value="${esc(S.search || "")}" placeholder="Rechercher dans toutes les colonnes…" aria-label="Rechercher dans toutes les lignes de ${esc(t.name)}"></label><button class="btn sm" type="submit">Rechercher</button>${S.search ? '<button class="btn quiet sm" type="button" data-act="searchReset">Effacer</button>' : ""}<span class="hint num" role="status">${plural(S.total, "ligne", "lignes")}${S.search || S.filter ? " trouvée" + (S.total > 1 ? "s" : "") : ""}</span></form>`;
  const flt =
    searchBar +
    `<details class="data-filters" ${S.filter ? "open" : ""}><summary>Filtrer par colonne${S.filter ? " · 1 filtre actif" : ""}</summary><div class="bar tight fl"><select class="in" id="fcol" aria-label="Colonne du filtre"><option value="">Filtrer…</option>${t.columns.map((c) => `<option ${S.filter?.c === c.name ? "selected" : ""}>${esc(c.name)}</option>`).join("")}</select><select class="in" id="fop" aria-label="Opérateur">${G.OPS.map((o) => `<option ${S.filter?.op === o ? "selected" : ""}>${o}</option>`).join("")}</select><input class="in" id="fval" placeholder="Valeur" value="${esc(S.filter?.v || "")}" style="width:160px" aria-label="Valeur du filtre"><button class="btn sm" data-act="filterApply">Appliquer</button>${S.filter ? '<button class="btn quiet sm" data-act="filterReset">Réinitialiser</button>' : ""}<span class="grow"></span>${S.sel.size ? `<span class="hint">${plural(S.sel.size, "ligne sélectionnée", "lignes sélectionnées")}</span><button class="btn sm bad" data-act="deleteRows" data-arg="sel">Supprimer…</button>` : '<span class="hint hide-s">Cliquez une cellule · Entrée ou saisie pour modifier · Tab pour avancer</span>'}</div></details>`;
  if (!g) return flt + '<div class="empty"><b>Chargement…</b></div>';
  const cols = t.columns,
    pk = pkOf(t),
    fkOf = (n) => t.fks.find((f) => (f.columns ?? [f.column]).includes(n));
  const th = cols
    .map((c) => {
      const f = fkOf(c.name);
      return `<th aria-sort="${S.sort?.c === c.name ? (S.sort.d > 0 ? "ascending" : "descending") : "none"}"><button class="sort-column" data-act="sort" data-arg="${esc(c.name)}" aria-label="Trier par ${esc(c.name)}"><span class="cn">${esc(c.name)}</span>${c.key === "PRI" ? `<span class="kb pk" title="Clé primaire">${ui.key}</span>` : f ? `<span class="kb fk" style="--h:${tableHue(f.refTable)}" title="Référence ${esc(f.refTable)}.${esc(f.refColumn)}">${ui.link}</span>` : ""}${tyChip(c.type)}${S.sort?.c === c.name ? `<span class="srt">${S.sort.d > 0 ? "↑" : "↓"}</span>` : ""}</button></th>`;
    })
    .join("");
  const body = g.rows
    .map(
      (r, ri) =>
        `<tr class="${S.sel.has(ri) ? "sel" : ""}" data-r="${ri}"><td class="ck"><input type="checkbox" ${S.sel.has(ri) ? "checked" : ""} data-act-change="rowSel" data-arg="${ri}" aria-label="Sélectionner la ligne ${ri + 1}"></td>${r
          .map((v, ci) => {
            const f = fkOf(cols[ci].name);
            return v === null
              ? `<td class="nul" tabindex="-1" data-r="${ri}" data-c="${ci}"><span class="nulchip">NULL</span></td>`
              : `<td tabindex="-1" data-r="${ri}" data-c="${ci}" class="${f ? "fkc" : ""} ${/int|decimal/i.test(cols[ci].type) ? "r" : ""}" title="${esc(v instanceof Uint8Array ? "Binaire : " + v.length + " octets" : v)}">${f ? `<i class="fkd" style="--h:${tableHue(f.refTable)}"></i>` : ""}${esc(v instanceof Uint8Array ? "0x" + [...v].map((x) => x.toString(16).padStart(2, "0")).join("") : v)}</td>`;
          })
          .join(
            "",
          )}<td class="ra"><button data-act="rowMenu" data-arg="${ri}" aria-label="Actions sur la ligne ${ri + 1}" aria-haspopup="true">${ui.more}</button></td></tr>`,
    )
    .join("");
  const ghost = `<tr class="ghost"><td class="ck">${ui.plus}</td>${cols.map((c) => `<td><input data-g="${esc(c.name)}" ${isAuto(c) ? "disabled" : ""} placeholder="${isAuto(c) ? "auto" : c.nullable ? c.name : c.name + " *"}" aria-label="Nouvelle valeur de ${esc(c.name)}" autocomplete="off" spellcheck="false"></td>`).join("")}<td class="ra"><button class="btn sm pri" data-act="ghostAdd" aria-label="Ajouter la ligne">↵</button></td></tr>`;
  return (
    flt +
    `<div class="gridwrap" id="gw"><table class="dg"><thead><tr><th class="ck"><input type="checkbox" data-act-change="rowAll" aria-label="Tout sélectionner" ${S.sel.size && S.sel.size === g.rows.length ? "checked" : ""}></th>${th}<th class="ra"><button data-act="colQuick" aria-label="Ajouter une colonne" title="Ajouter une colonne">${ui.plus}</button></th></tr></thead><tbody>${body}${ghost}</tbody></table>${!g.rows.length && !S.filter && !S.search ? '<p class="hint" style="padding:14px 18px">Table vide : saisissez une première ligne ci-dessus. Une cellule vide prend la valeur par défaut.</p>' : ""}${!g.rows.length && (S.filter || S.search) ? '<p class="hint" style="padding:14px 18px">Aucune ligne ne correspond à votre recherche ou aux filtres.</p>' : ""}</div>
    <div class="foot"><span class="num">${plural(S.total, "ligne", "lignes")}</span><span class="mono trunc grow sqlecho" title="${esc(S.lastSQL)}" aria-live="polite">${S.gmsg ? esc(S.gmsg) : esc(S.lastSQL)}</span><button class="btn quiet sm" data-act="page" data-arg="-1" ${S.page < 2 ? "disabled" : ""} aria-label="Page précédente">‹</button><span class="num">Page ${S.page} / ${pages}</span><button class="btn quiet sm" data-act="page" data-arg="1" ${S.page >= pages ? "disabled" : ""} aria-label="Page suivante">›</button></div>`
  );
}
function afterGrid() {
  if (!S.cell && S.grid?.rows.length) S.cell = { r: 0, c: 0 };
  const c = S.cell;
  if (c) {
    const td = $(`#gw td[data-r="${c.r}"][data-c="${c.c}"]`);
    if (td) {
      td.classList.add("cur");
      td.tabIndex = 0;
      if (S.focus === "cell") {
        td.focus();
        S.focus = null;
      }
    }
  }
  if (S.focus === "ghost") {
    $("#gw [data-g]:not(:disabled)")?.focus();
    const w = $("#gw");
    if (w) w.scrollTop = w.scrollHeight;
    S.focus = null;
  }
}
function keyOf(t, row) {
  const pk = pkOf(t);
  if (!pk.length) return null;
  return t.columns.map((c, i) => [c.name, row[i]]);
}

/* ───────── structure ───────── */
function structHtml(t) {
  const fkOf = (n) => t.fks.find((f) => (f.columns ?? [f.column]).includes(n)),
    idxOf = (n) =>
      t.indexes.filter((i) => i.name !== "PRIMARY" && i.columns.includes(n));
  const incoming = S.cat.tables.flatMap((o) =>
    o.fks
      .filter((f) => f.refTable === t.name)
      .map((f) => ({ ...f, table: o.name })),
  );
  const rows = t.columns
    .map((c) => {
      const f = fkOf(c.name),
        u = idxOf(c.name).find((i) => i.unique);
      return `<tr data-col="${esc(c.name)}"><td class="cn2"><b class="cname" data-act="colRenameStart" data-arg="${esc(c.name)}" title="Double-clic pour renommer">${esc(c.name)}</b></td><td><button class="ty ${G.family(c.type)} btnty" data-act="colTypeMenu" data-arg="${esc(c.name)}" aria-haspopup="true" title="Changer le type">${esc(c.type)}</button></td>
      <td><button class="pill ${c.nullable ? "nl" : "nn"}" data-act="colNull" data-arg="${esc(c.name)}" ${c.key === "PRI" ? "disabled" : ""} title="Basculer NULL / NOT NULL">${c.nullable ? "NULL" : "NOT NULL"}</button></td>
      <td class="badges">${c.key === "PRI" ? `<span class="bd pk">${ui.key}PRIMARY</span>` : ""}${u ? '<span class="bd un">UNIQUE</span>' : idxOf(c.name).length && !f ? '<span class="bd ix">INDEX</span>' : ""}${f ? `<button class="bd fk" style="--h:${tableHue(f.refTable)}" data-act="selectTable" data-arg="${esc(f.refTable)}" title="Ouvrir ${esc(f.refTable)}">${ui.link}${esc(f.refTable)}.${esc(f.refColumn)}</button>` : ""}</td>
      <td>${isAuto(c) ? '<span class="bd ai">AUTO_INCREMENT</span>' : '<span class="mut">—</span>'}</td><td class="ra"><button data-act="colMenu" data-arg="${esc(c.name)}" aria-label="Actions sur ${esc(c.name)}" aria-haspopup="true">${ui.more}</button></td></tr>`;
    })
    .join("");
  return `<div class="gridwrap st"><div class="chips"><span class="chip2">${plural(t.columns.length, "colonne", "colonnes")}</span><span class="chip2">${plural(pkOf(t).length, "clé primaire", "clés primaires")}</span><span class="chip2">${plural(t.fks.length, "relation sortante", "relations sortantes")}</span><span class="chip2">${plural(t.rows, "ligne", "lignes")}</span></div>
    <table class="sg"><thead><tr><th>Colonne</th><th>Type</th><th>Valeur nulle</th><th>Clés et relations</th><th>Extra</th><th class="ra"><span class="sr-only">Actions</span></th></tr></thead><tbody>${rows}
    <tr class="addrow"><td colspan="6"><button class="btn" data-act="columnForm">Ajouter une colonne…</button></td></tr></tbody></table>
    <section class="sec2"><h3>Index</h3><div class="pills">${t.indexes.map((i) => `<span class="pillx ${i.name === "PRIMARY" ? "pk" : ""}">${i.name === "PRIMARY" ? ui.key : ""}<b>${esc(i.name)}</b><span class="mono">(${esc(i.columns.join(", "))})</span>${i.unique && i.name !== "PRIMARY" ? "<em>UNIQUE</em>" : ""}${i.name !== "PRIMARY" ? `<button data-act="idxDrop" data-arg="${esc(i.name)}" aria-label="Supprimer l’index ${esc(i.name)}">✕</button>` : ""}</span>`).join("") || '<span class="mut">Aucun index.</span>'}<button class="btn sm" data-act="idxAdd">${ui.plus}Index</button></div></section>
    <section class="sec2"><h3>Relations</h3><div class="pills">${t.fks.map((f) => `<button class="rel2" style="--h:${tableHue(f.refTable)}" data-act="selectTable" data-arg="${esc(f.refTable)}"><b>${esc(f.column)}</b> → <b>${esc(f.refTable)}.${esc(f.refColumn)}</b><em>ON DELETE ${f.onDelete}</em></button>`).join("")}${incoming.map((f) => `<button class="rel2 in" style="--h:${tableHue(f.table)}" data-act="selectTable" data-arg="${esc(f.table)}"><b>${esc(f.table)}.${esc(f.column)}</b> → <b>${esc(f.refColumn)}</b><em>référence cette table</em></button>`).join("")}${!t.fks.length && !incoming.length ? '<span class="mut">Aucune relation. Glissez un champ vers un autre dans le Schéma pour en créer une.</span>' : ""}</div></section>
    <section class="sec2"><h3>Définition <button class="btn quiet sm" data-act="copyDdl">Copier</button></h3><pre class="pre sqlh">${sqlHtml(t.ddl)}</pre></section>${S.lastSQL ? `<p class="hint mono" style="padding:0 18px 18px">Dernier SQL : ${esc(S.lastSQL.replace(/\s+/g, " ").slice(0, 160))}</p>` : ""}</div>`;
}

/* ───────── console SQL ───────── */
function drawSql(head) {
  if (S.toolModes?.sql === "unloaded") {
    $("#dmain").innerHTML =
      head +
      '<div class="empty"><b>Console SQL déchargée</b><button class="btn" data-act="activateSQL">Réactiver la console</button></div>';
    return;
  }

  edQ?.destroy();
  edQ = null;
  $("#dmain").innerHTML =
    head +
    `<div class="q-ed" id="qwrap"><div class="edwrap" id="edq"></div><div class="bar tight"><button class="btn pri sm" data-act="runSQL">Exécuter <kbd>Ctrl ↵</kbd></button><button class="btn quiet sm" data-act="histMenu" aria-haspopup="true">Récentes ▾</button><span class="hint hide-s">Exécute la sélection, sinon tout le script.</span><span class="grow"></span><span class="mono mut">${esc(S.db)}</span></div></div><div id="rsb" class="side grow"></div>`;
  edQ?.destroy();
  edQ = mkEditor($("#edq"), {
    lang: "sql",
    onInput: (v) => (S.qtext = v),
    onRun: (s) => A.runSQL(s),
  });
  edQ.set(S.qtext);
  if (S.toolModes?.sql === "sleep") edQ.model.setReadOnly(true);
  drawResults();
}
function drawResults() {
  if (edQ && S.cat)
    edQ.model.setSQLSchema(
      {
        [S.db]: Object.fromEntries(
          S.cat.tables.map((t) => [t.name, t.columns.map((c) => c.name)]),
        ),
      },
      S.db,
    );

  const b = $("#rsb"),
    r = S.rs;
  if (!b) return;
  if (!r) {
    b.innerHTML =
      '<div class="empty"><b>Aucun résultat</b><span>Écrivez une requête puis exécutez-la.</span></div>';
    return;
  }
  if (r.error) {
    b.innerHTML = `<div style="padding:14px"><div class="alert" style="margin:0"><div><p><b>Requête refusée.</b> ${esc(r.error.message)}</p>${r.error.state ? `<p class="mono">SQLSTATE ${r.error.state}</p>` : ""}${r.error.recover ? `<p>${esc(r.error.recover)}</p>` : ""}</div></div></div>`;
    return;
  }
  const c = r[S.rsi];
  b.innerHTML =
    (r.length > 1
      ? `<div class="rs-tabs" role="group" aria-label="Résultats SQL">${r.map((x, i) => `<button class="btn sm ${i === S.rsi ? "pri" : ""}" data-act="rsTab" aria-pressed="${i === S.rsi}" data-arg="${i}">Résultat ${i + 1}</button>`).join("")}</div>`
      : "") +
    (c.columns
      ? `<div class="gridwrap"><table class="dg ro"><thead><tr>${c.columns.map((n) => `<th><span class="cn">${esc(n)}</span></th>`).join("")}</tr></thead><tbody>${c.rows
          .slice(0, 200)
          .map(
            (row) =>
              `<tr>${row.map((v) => (v === null ? '<td class="nul"><span class="nulchip">NULL</span></td>' : `<td>${esc(v instanceof Uint8Array ? "0x" + [...v].map((x) => x.toString(16).padStart(2, "0")).join("") : v)}</td>`)).join("")}</tr>`,
          )
          .join(
            "",
          )}</tbody></table></div><div class="foot"><span class="num">${plural(c.rows.length, "ligne", "lignes")}${c.rows.length > 200 ? " · aperçu limité à 200 lignes, export CSV complet" : ""}</span><span class="grow"></span><button class="btn quiet sm" data-act="csv">Exporter en CSV</button></div>`
      : `<div class="empty"><b>${esc(c.msg || "Requête exécutée")}${c.affected ? ` · ${plural(c.affected, "ligne affectée", "lignes affectées")}` : ""}</b><span class="mono">${esc(c.sql)}</span></div>`);
}

/* ───────── actions ───────── */
Object.assign(A, {
  activateSQL() {
    return A.toolState("sql", "active");
  },
  async toggleDb(d) {
    if (d === S.db) {
      S.dbCollapsed = !S.dbCollapsed;
      drawDtree();
      return;
    }
    return A.selectDb(d);
  },
  async selectDb(d) {
    S.dbCollapsed = false;
    S.db = d;
    S.table = null;
    S.page = 1;
    S.filter = null;
    S.search = "";
    S.sort = null;
    S.sel = new Set();
    S.rs = null;
    await run("Lecture de la base", async () => {});
  },
  async selectTable(t) {
    S.table = t;
    S.dmode = S.dmode === "sql" ? "data" : S.dmode;
    S.page = 1;
    S.sort = null;
    S.filter = null;
    S.search = "";
    S.sel = new Set();
    S.cell = null;
    S.view = "data";
    if (!eng().db.ready) return A.nav("data");
    await run("Lecture de la table", async () => {});
  },
  async dmode(m) {
    S.dmode = m;
    S.cell = null;
    await run("Lecture", async () => {});
  },
  async sort(c) {
    S.sort = S.sort?.c === c && S.sort.d === 1 ? { c, d: -1 } : { c, d: 1 };
    S.page = 1;
    await run("Tri", async () => {});
  },
  async page(d) {
    S.page = Math.max(1, S.page + +d);
    await run("Page", async () => {});
  },
  async searchRows() {
    S.search = $("#dataSearch").value.trim();
    S.page = 1;
    S.sel = new Set();
    S.cell = null;
    await run("Recherche dans la table", async () => {});
    $("#dataSearch")?.focus();
  },
  async searchReset() {
    S.search = "";
    S.page = 1;
    S.sel = new Set();
    S.cell = null;
    await run("Recherche dans la table", async () => {});
    $("#dataSearch")?.focus();
  },
  async filterApply() {
    const c = $("#fcol").value;
    S.cell = null;
    S.filter = c ? { c, op: $("#fop").value, v: $("#fval").value } : null;
    S.page = 1;
    S.sel = new Set();
    await run("Filtre", async () => {});
  },
  async filterReset() {
    S.filter = null;
    S.page = 1;
    S.sel = new Set();
    S.cell = null;
    await run("Filtre", async () => {});
  },
  rowSel(i, el) {
    el.checked ? S.sel.add(+i) : S.sel.delete(+i);
    drawData();
  },
  rowAll(_, el) {
    S.sel = el.checked ? new Set(S.grid.rows.map((_, i) => i)) : new Set();
    drawData();
  },
  /* ajout rapide */
  async rowQuick(t) {
    if (t && t !== S.table) {
      S.table = t;
      S.page = 1;
      S.filter = null;
      S.search = "";
      S.sort = null;
    }
    S.dmode = "data";
    S.view = "data";
    S.focus = "ghost";
    if (!eng().db.ready) {
      S.view = "data";
      return A.nav("data");
    }
    await run("Lecture de la table", async () => {});
  },
  async ghostAdd() {
    const t = cur(),
      inputs = $$("#gw [data-g]"),
      cols = [],
      vals = [];
    let bad = null;
    for (const i of inputs) {
      i.classList.remove("err");
      const c = t.columns.find((x) => x.name === i.dataset.g);
      if (i.value !== "") {
        cols.push(c.name);
        vals.push(i.value);
      } else if (!c.nullable && !isAuto(c) && c.default == null) {
        i.classList.add("err");
        bad ||= i;
      }
    }
    if (bad) {
      bad.focus();
      S.gmsg = `Renseignez « ${bad.dataset.g} » : cette colonne est obligatoire.`;
      $(".sqlecho").textContent = S.gmsg;
      return;
    }
    if (!cols.length && inputs.length) {
      inputs.find((i) => !i.disabled)?.focus();
      return;
    }
    S.gmsg = "";
    S.focus = "ghost";
    await run("Insertion", async () => {
      await sql(G.insert(t.name, cols, vals));
      S.page = Math.max(1, Math.ceil((S.total + 1) / 100));
    });
  },
  async rowInsertDup(ri) {
    const t = cur(),
      row = S.grid.rows[ri],
      cols = t.columns.filter((c) => !isAuto(c));
    await run("Duplication", async () => {
      await sql(
        G.insert(
          t.name,
          cols.map((c) => c.name),
          cols.map((c) => row[t.columns.indexOf(c)]),
        ),
      );
    });
    toast("Ligne dupliquée");
  },
  rowMenu(ri, el) {
    menu(el, [
      { label: "Dupliquer la ligne", act: "rowInsertDup", arg: ri },
      { label: "Supprimer…", act: "deleteRows", arg: String(ri), bad: 1 },
    ]);
  },
  async deleteRows(arg, el) {
    const t = cur(),
      idx = arg === "sel" ? [...S.sel] : [+arg],
      rows = idx.map((i) => S.grid.rows[i]),
      keys = rows.map((r) => keyOf(t, r));
    if (keys.some((k) => !k))
      return toast("Suppression impossible sans clé primaire");
    const go = async () => {
      await run("Suppression", async () => {
        for (const k of keys) {
          const results = await sql(G.remove(t.name, k));
          if (String(results[0].affected) === "0")
            throw Error(
              "La ligne a changé : rechargez la grille avant de supprimer.",
            );
        }
        S.sel = new Set();
      });
      toast(plural(keys.length, "ligne supprimée", "lignes supprimées"));
    };
    const p = menu(el || at(innerWidth / 2, 200), 0, {
      html: `<div class="ph">Supprimer ${plural(keys.length, "ligne", "lignes")} ?</div><p class="pp">La suppression vérifie que chaque ligne n’a pas changé depuis son affichage.</p><div style="display:flex;gap:6px;padding:4px 8px 8px;justify-content:flex-end"><button class="btn sm" data-x>Annuler</button><button class="btn sm pri bad" data-ok>Supprimer</button></div>`,
    });
    $("[data-x]", p).onclick = () => p.remove();
    $("[data-ok]", p).onclick = () => {
      p.remove();
      go();
    };
  },
  /* édition de cellule */
  cellEdit(td, init) {
    const t = cur(),
      ri = +td.dataset.r,
      ci = +td.dataset.c,
      col = t.columns[ci],
      old = S.grid.rows[ri][ci];
    if (old instanceof Uint8Array) return A.binaryCell(ri, ci);
    if (!pkOf(t).length)
      return toast("Modification impossible sans clé primaire");
    if (col.key === "PRI" && isAuto(col))
      return toast("Cette clé est générée automatiquement");
    td.classList.add("edit");
    td.innerHTML = `<input class="ce" value="${esc(init ?? old ?? "")}" aria-label="Valeur de ${esc(col.name)}"><button class="nullb" tabindex="-1" ${col.nullable ? "" : "disabled"} aria-label="Mettre NULL">NULL</button>`;
    const i = $("input", td);
    i.focus();
    init === undefined
      ? i.select()
      : i.setSelectionRange(i.value.length, i.value.length);
    let done = false,
      toNull = false;
    $(".nullb", td).addEventListener("pointerdown", (e) => {
      e.preventDefault();
      toNull = true;
      end(1, 0);
    });
    const end = async (ok, move) => {
      if (done) return;
      done = true;
      S.cell = { r: ri, c: ci };
      if (ok && (toNull ? old !== null : String(old ?? "") !== i.value)) {
        const v = toNull ? null : i.value;
        const r = await run("Mise à jour", async () => {
          const res = await sql(
            G.update(t.name, col.name, v, keyOf(t, S.grid.rows[ri])),
          );
          if (String(res?.[0]?.affected) === "0")
            throw Object.assign(
              new Error(
                "La ligne a changé depuis son affichage. Rechargez les données avant de modifier.",
              ),
              {
                recover:
                  "Les valeurs affichées ne sont plus à jour : la grille est rechargée.",
              },
            );
        });
        if (!r) {
          S.focus = "cell";
          return afterRedraw();
        }
      }
      if (move === "down")
        S.cell = { r: Math.min(ri + 1, S.grid.rows.length - 1), c: ci };
      if (move === "right")
        S.cell = { r: ri, c: Math.min(ci + 1, t.columns.length - 1) };
      S.focus = "cell";
      drawData();
    };
    i.onkeydown = (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        end(1, "down");
      } else if (e.key === "Tab") {
        e.preventDefault();
        end(1, "right");
      } else if (e.key === "Escape") {
        e.preventDefault();
        end(0);
      }
    };
    i.onblur = () => setTimeout(() => !done && end(1), 0);
  },
  /* colonnes et index */
  colQuick(_, el) {
    const p = menu(el || $("#dmain"), 0, {
      html: `<div class="ph">Nouvelle colonne</div><div style="display:grid;gap:6px;padding:4px 10px 10px"><input class="in" id="qcName" placeholder="nom_de_colonne" aria-label="Nom" autocomplete="off" spellcheck="false"><select class="in" id="qcType" style="width:100%" aria-label="Type">${TYPES.map((x) => `<option>${x}</option>`).join("")}</select><label class="chk2"><input type="checkbox" id="qcNull" checked> Accepte NULL</label><button class="btn pri" id="qcGo">Ajouter la colonne</button></div>`,
    });
    const go = () => {
      const n = $("#qcName", p).value.trim();
      if (!NAME.test(n)) return $("#qcName", p).classList.add("err");
      const type = $("#qcType", p).value,
        nul = $("#qcNull", p).checked;
      p.remove();
      A.colAddDo(n, type, nul);
    };
    $("#qcGo", p).onclick = go;
    p.addEventListener("keydown", (e) => {
      if (e.key === "Enter") go();
    });
    $("#qcName", p).focus();
  },
  colAdd() {
    const n = $("#ncName").value.trim();
    if (!NAME.test(n)) {
      $("#ncName").classList.add("err");
      $("#ncName").focus();
      return toast(
        "Nom requis : 64 caractères, lettres, chiffres et underscore.",
      );
    }
    A.colAddDo(n, $("#ncType").value, $("#ncNull").checked, 1);
  },
  async colAddDo(name, type, nul, stay) {
    S.focus = stay ? "newcol" : null;
    const t = cur();
    if (
      await run("Ajout de colonne", async () => {
        await sql(G.addColumn(t.name, { name, type, nullable: nul }));
      })
    )
      toast(`Colonne « ${name} » ajoutée`);
  },
  colTypeMenu(name, el) {
    menu(
      el,
      TYPES.map((t) => ({
        label: `<span class="ty ${G.family(t)}">${t}</span>`,
        act: "colSetType",
        arg: name + "|" + t,
      })),
    );
  },
  async colSetType(arg) {
    const [n, type] = arg.split("|"),
      t = cur(),
      c = t.columns.find((x) => x.name === n);
    await run("Changement de type", async () => {
      await sql(
        G.modifyColumn(t.name, {
          name: n,
          type,
          nullable: c.nullable,
          ai: isAuto(c),
        }),
      );
    });
  },
  async colNull(n) {
    const t = cur(),
      c = t.columns.find((x) => x.name === n);
    await run("Modification", async () => {
      await sql(
        G.modifyColumn(t.name, {
          name: n,
          type: c.type,
          nullable: !c.nullable,
          ai: isAuto(c),
        }),
      );
    });
  },
  colMenu(n, el) {
    menu(el, [
      { label: "Définition complète…", act: "definitionForm", arg: n },
      { label: "Renommer", act: "colRenameStart", arg: n },
      { label: "Supprimer la colonne…", act: "colDrop", arg: n, bad: 1 },
    ]);
  },
  colRenameStart(n) {
    const b = $(`tr[data-col="${CSS.escape(n)}"] .cname`);
    if (!b) return;
    b.outerHTML = `<input class="in cren" value="${esc(n)}" aria-label="Nouveau nom">`;
    const i = $(".cren");
    i.focus();
    i.select();
    let d = 0;
    const end = async (ok) => {
      if (d) return;
      d = 1;
      const v = i.value.trim();
      if (ok && v && v !== n) {
        if (!NAME.test(v)) {
          toast("Nom invalide.");
          return drawData();
        }
        await run("Renommage", async () => {
          await sql(G.renameColumn(S.table, n, v));
        });
      } else drawData();
    };
    i.onkeydown = (e) => {
      if (e.key === "Enter") end(1);
      if (e.key === "Escape") end(0);
    };
    i.onblur = () => end(1);
  },
  async colDrop(n) {
    const r = await ddl({
      title: `Supprimer la colonne ${n}`,
      ok: "Supprimer",
      typed: n,
      fields: [],
      sql: () => G.dropColumn(S.table, n),
      check: () => "",
    });
    if (r)
      await run("Suppression de colonne", async () => {
        await sql(G.dropColumn(S.table, n));
      });
  },
  async idxAdd() {
    const t = cur(),
      r = await ddl({
        title: "Créer un index",
        ok: "Créer l’index",
        fields: [
          {
            id: "cols",
            label: "Colonnes, séparées par une virgule",
            value: t.columns[1]?.name || t.columns[0].name,
          },
          {
            id: "u",
            type: "select",
            label: "Type",
            options: ["Index simple", "Index UNIQUE"],
          },
        ],
        check: (v) =>
          v.cols
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean)
            .some((c) => !t.columns.some((x) => x.name === c))
            ? "Une colonne n’existe pas dans cette table."
            : "",
        sql: (v) =>
          G.addIndex(
            t.name,
            "idx_" + v.cols.split(",")[0].trim(),
            v.cols.split(",").map((s) => s.trim()),
            v.u === "Index UNIQUE",
          ),
      });
    if (r)
      await run("Création d’index", async () => {
        await sql(
          G.addIndex(
            t.name,
            "idx_" + r.cols.split(",")[0].trim(),
            r.cols.split(",").map((s) => s.trim()),
            r.u === "Index UNIQUE",
          ),
        );
      });
  },
  async idxDrop(n) {
    await run("Suppression d’index", async () => {
      await sql(G.dropIndex(S.table, n));
    });
  },
  copyDdl() {
    try {
      navigator.clipboard?.writeText(cur().ddl);
    } catch {
      /* indisponible */
    }
    toast("Définition copiée");
  },
  /* tables et bases */
  quickTableStart(db) {
    if (typeof db === "string" && db && db !== S.db) S.db = db;
    S.newTable = true;
    S.view = "data";
    if (!eng().db.ready) return A.nav("data");
    ctx.draw();
  },
  async quickTableCreate(name) {
    S.newTable = false;
    name = name.trim();
    if (!name) return drawDtree();
    if (!NAME.test(name)) {
      fail(
        "Création impossible.",
        new Error(
          "Nom de table invalide : 64 caractères, lettres, chiffres et underscore.",
        ),
      );
      return;
    }
    if (S.cat.tables.some((t) => t.name === name)) {
      fail(
        "Création impossible.",
        new Error(`La table « ${name} » existe déjà.`),
      );
      return;
    }
    S.table = name;
    S.dmode = "struct";
    S.focus = "newcol";
    S.page = 1;
    S.filter = null;
    S.search = "";
    S.sort = null;
    if (
      await run("Création de la table", async () => {
        await sql(G.quickTable(name));
      })
    )
      toast(`Table « ${name} » créée avec un identifiant automatique`);
  },
  tableMenu(_, el) {
    const t = cur();
    menu(el, [
      { label: "Créer une table avec le formulaire…", act: "createTable" },
      {
        label: "Insérer avec options (DEFAULT, NULL, binaire)…",
        act: "insertAdvanced",
        dis: !t,
      },
      "-",
      { label: "Exporter la table en CSV", act: "csv", dis: !t },
      { label: "Importer un fichier SQL", act: "importSQL", hint: "8 Mio max" },
      { label: "Exporter la base en SQL", act: "exportSQL" },
      { label: "Renommer la table", act: "tableRename" },
      "-",
      { label: "Vider la table…", act: "tableTruncate", dis: !t, bad: 1 },
      { label: "Supprimer la table…", act: "tableDrop", dis: !t, bad: 1 },
    ]);
  },
  async createTable() {
    const r = await ddl({
      title: "Créer une table",
      ok: "Créer la table",
      fields: [
        { id: "name", label: "Nom de la table", value: "nouvelle_table" },
        { id: "cols", type: "cols" },
      ],
      check: (v) =>
        !NAME.test(v.name)
          ? "Nom requis : 64 caractères, lettres, chiffres et underscore."
          : !v.cols.length
            ? "Ajoutez au moins une colonne."
            : v.cols.some((c) => !NAME.test(c.name))
              ? "Chaque colonne a besoin d’un nom valide."
              : new Set(v.cols.map((c) => c.name)).size < v.cols.length
                ? "Chaque colonne doit avoir un nom distinct."
                : S.cat.tables.some((t) => t.name === v.name)
                  ? "Cette table existe déjà."
                  : "",
      sql: (v) =>
        G.createTable(
          v.name,
          v.cols.map((c) => ({ ...c, nullable: !!c.nul })),
        ),
    });
    if (!r) return;
    S.table = r.name;
    S.dmode = "struct";
    await run("Création de la table", async () => {
      await sql(
        G.createTable(
          r.name,
          r.cols.map((c) => ({ ...c, nullable: !!c.nul })),
        ),
      );
    });
  },
  async tableDrop() {
    const n = S.table;
    const r = await ddl({
      title: `Supprimer la table ${n}`,
      ok: "Supprimer définitivement",
      typed: n,
      fields: [],
      sql: () => G.dropTable(n),
      check: () => "",
    });
    if (r) {
      S.table = null;
      await run("Suppression de la table", async () => {
        await sql(G.dropTable(n));
      });
    }
  },
  async tableTruncate() {
    const n = S.table;
    if (
      await confirmDlg(
        `Vider ${n} ?`,
        "Toutes les lignes seront supprimées. La structure est conservée.",
        "Vider la table",
        1,
      )
    )
      await run("Vidage", async () => {
        await sql(G.truncate(n));
      });
  },
  async createDb() {
    const r = await ddl({
      title: "Créer une base",
      ok: "Créer la base",
      fields: [{ id: "n", label: "Nom de la base", value: "ma_base" }],
      check: (v) =>
        !NAME.test(v.n)
          ? "Nom requis : 64 caractères, lettres, chiffres et underscore."
          : S.dbs.some((d) => d.name === v.n)
            ? "Cette base existe déjà."
            : "",
      sql: (v) => G.createDb(v.n),
    });
    if (!r) return;
    await task("Création de la base", async () => {
      await eng().db.query(G.createDb(r.n), S.db);
      S.db = r.n;
      S.table = null;
      await refreshDb();
    });
    ctx.draw();
  },
  dbMenu(_, el) {
    const d = S.dbs.find((x) => x.name === S.db);
    menu(el, [
      { label: "Créer une table…", act: "quickTableStart" },
      { label: "Créer une base…", act: "createDb" },
      "-",
      {
        label: "Supprimer cette base…",
        act: "dropDb",
        bad: 1,
        dis: !!d?.system,
      },
    ]);
  },
  async dropDb() {
    const d = S.db;
    const r = await ddl({
      title: `Supprimer la base ${d}`,
      ok: "Supprimer définitivement",
      typed: d,
      fields: [],
      sql: () => G.dropDb(d),
      check: () => "",
    });
    if (!r) return;
    await task("Suppression de la base", async () => {
      await eng().db.query(G.dropDb(d), "test");
      S.db = "test";
      S.table = null;
      await refreshDb();
    });
    S.dbDirty = true;
    ctx.draw();
  },
  async insertAdvanced() {
    const t = cur();
    const body = t.columns
      .map(
        (c) =>
          `<div class="field"><span>${esc(c.name)} <span class="mut">${esc(c.type)}${c.key === "PRI" ? " · clé" : ""}</span></span><div style="display:grid;grid-template-columns:130px 1fr;gap:6px"><select class="in" data-kind="${esc(c.name)}" style="width:100%"><option value="def">DEFAULT</option><option value="null" ${c.nullable ? "" : "disabled"}>NULL</option><option value="text">Texte</option><option value="hex">Binaire (hex)</option></select><input class="in" data-val="${esc(c.name)}" disabled aria-label="Valeur de ${esc(c.name)}"></div></div>`,
      )
      .join("");
    const r = await modal({
      title: `Insérer une ligne dans ${esc(t.name)}`,
      wide: 1,
      body:
        `<p class="hint" style="margin-bottom:10px">DEFAULT laisse la base choisir. NULL reste distinct du texte vide.</p>` +
        body,
      actions: [
        { label: "Annuler", v: "no" },
        { label: "Insérer", v: "ok", kind: "pri" },
      ],
      onOpen(d) {
        d.addEventListener("change", (e) => {
          const k = e.target.dataset.kind;
          if (k) {
            const i = $(`[data-val="${CSS.escape(k)}"]`, d);
            i.disabled = !["text", "hex"].includes(e.target.value);
            if (!i.disabled) i.focus();
          }
        });
      },
    });
    if (r !== "ok") return;
    const cols = [],
      vals = [];
    for (const c of t.columns) {
      const k = $(`[data-kind="${CSS.escape(c.name)}"]`).value,
        v = $(`[data-val="${CSS.escape(c.name)}"]`).value;
      if (k === "def") continue;
      cols.push(c.name);
      vals.push(
        k === "null"
          ? null
          : /int|decimal/i.test(c.type) && v !== "" && !isNaN(v)
            ? Number(v)
            : v,
      );
    }
    await run("Insertion", async () => {
      await sql(G.insert(t.name, cols, vals));
    });
    toast("Ligne insérée");
  },
  /* console SQL */
  async runSQL(selection) {
    if (S.toolModes?.sql === "sleep")
      throw Error("Réactivez la console SQL avant d’exécuter une requête.");
    setLamp("busy", "Exécution SQL…");
    const text =
      typeof selection === "string" && selection
        ? selection
        : edQ?.get() || S.qtext;
    S.qtext = text;
    try {
      S.rs = await eng().db.query(text, S.db);
      S.rsi = 0;
      S.hist = [text.trim(), ...S.hist.filter((h) => h !== text.trim())].slice(
        0,
        20,
      );
      log("i", "SQL : " + text.trim().replace(/\s+/g, " ").slice(0, 100));
      S.alert = null;
      if (S.rs.some((r) => !r.columns)) {
        S.dbDirty = true;
        await refreshDb({ rows: false });
      }
    } catch (e) {
      e.state = e.sqlstate ?? e.state;
      S.rs = { error: e };
      log(
        "e",
        e.message,
        [e.state && "SQLSTATE " + e.state, e.recover]
          .filter(Boolean)
          .join("\n"),
      );
    }
    setLamp(
      S.rs?.error ? "err" : "ok",
      S.rs?.error ? "Requête refusée" : "Prêt",
    );
    $("#rsb") ? drawResults() : drawData();
    ctx.shell();
    drawDtree();
  },
  rsTab(i) {
    S.rsi = +i;
    drawResults();
  },
  histMenu(_, el) {
    menu(
      el,
      S.hist.length
        ? S.hist
            .map((h, i) => ({
              label: `<span class="mono trunc" style="max-width:300px">${esc(h.replace(/\s+/g, " ").slice(0, 60))}</span>`,
              act: "histUse",
              arg: i,
            }))
            .concat(["-", { label: "Effacer l’historique", act: "histClear" }])
        : [{ label: "Aucune requête récente", act: "x", dis: 1 }],
    );
  },
  histUse(i) {
    S.qtext = S.hist[+i];
    edQ?.set(S.qtext);
  },
  histClear() {
    S.hist = [];
    toast("Historique effacé");
  },
  csv() {
    const g = S.dmode === "sql" ? S.rs?.[S.rsi] : S.grid;
    if (!g?.columns) return toast("Aucun résultat à exporter");
    const text = [g.columns, ...g.rows]
      .map((r) =>
        r
          .map((v) =>
            v === null ? "" : '"' + String(v).replace(/"/g, '""') + '"',
          )
          .join(","),
      )
      .join("\n");
    try {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([text], { type: "text/csv" }));
      a.download = (S.table || "resultat") + ".csv";
      a.click();
    } catch {
      /* téléchargement indisponible */
    }
    toast(
      S.dmode === "sql"
        ? "CSV : lignes du résultat affiché"
        : "CSV : page courante de " + S.table,
    );
  },
  x() {
    toast("Disponible avec le moteur réel");
  },
});
async function afterRedraw() {
  drawData();
}

export function bindData() {
  const m = $("#dmain");
  $("#tableSearch").addEventListener("input", (e) => {
    S.tableQuery = e.target.value;
    drawDtree();
  });
  m.addEventListener("submit", (e) => {
    if (e.target.id !== "dataSearchForm") return;
    e.preventDefault();
    if (S.lamp !== "busy")
      A.searchRows().catch((error) => fail("Recherche impossible.", error));
  });
  m.addEventListener("click", (e) => {
    const td = e.target.closest("td[data-c]");
    if (td && !td.classList.contains("edit") && S.dmode === "data") {
      S.cell = { r: +td.dataset.r, c: +td.dataset.c };
      $$("#gw td.cur").forEach((x) => x.classList.remove("cur"));
      td.classList.add("cur");
      td.tabIndex = 0;
      td.focus();
    }
  });
  m.addEventListener("dblclick", (e) => {
    const td = e.target.closest("td[data-c]");
    if (td && S.dmode === "data" && !td.classList.contains("edit"))
      A.cellEdit(td);
  });
  m.addEventListener("keydown", (e) => {
    const gi = e.target.closest?.("[data-g]");
    if (gi) {
      if (e.key === "Enter") {
        e.preventDefault();
        A.ghostAdd();
      } else if (e.key === "ArrowUp" && S.grid?.rows.length) {
        e.preventDefault();
        S.cell = { r: S.grid.rows.length - 1, c: 0 };
        S.focus = "cell";
        drawData();
      }
      return;
    }
    const td = e.target.closest?.("td[data-c]");
    if (!td || td.classList.contains("edit") || S.dmode !== "data") return;
    const r = +td.dataset.r,
      c = +td.dataset.c,
      rows = S.grid.rows.length,
      cols = S.grid.columns.length;
    const mv = (nr, nc) => {
      e.preventDefault();
      if (nr >= rows) {
        $("#gw [data-g]:not(:disabled)")?.focus();
        return;
      }
      S.cell = { r: Math.max(0, nr), c: Math.max(0, Math.min(cols - 1, nc)) };
      drawData();
      $(`#gw td[data-r="${S.cell.r}"][data-c="${S.cell.c}"]`)?.focus();
    };
    if (e.key === "ArrowDown") mv(r + 1, c);
    else if (e.key === "ArrowUp") mv(r - 1, c);
    else if (e.key === "ArrowRight") mv(r, c + 1);
    else if (e.key === "ArrowLeft") mv(r, c - 1);
    else if (e.key === "Tab") {
      if (!e.shiftKey && c < cols - 1) mv(r, c + 1);
      else if (e.shiftKey && c > 0) mv(r, c - 1);
    } else if (e.key === "Enter" || e.key === "F2") {
      e.preventDefault();
      A.cellEdit(td);
    } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      A.cellEdit(td, e.key);
    }
  });
  $("#dbtree").addEventListener("keydown", (e) => {
    if (e.target.id === "ntName") {
      if (e.key === "Enter") {
        e.preventDefault();
        A.quickTableCreate(e.target.value);
      } else if (e.key === "Escape") {
        S.newTable = false;
        drawDtree();
      }
    }
  });
  $("#dbtree").addEventListener("focusout", (e) => {
    if (e.target.id === "ntName" && S.newTable) {
      S.newTable = false;
      A.quickTableCreate(e.target.value);
    }
  });
}
