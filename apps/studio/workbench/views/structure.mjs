import { relationRule, relationRules } from "../relation-rules.mjs";
import * as G from "../sqlgen.mjs";
import { ui, icon } from "../icons.mjs";
import { ddl, modal, esc, toast } from "../ui.mjs";
import { S, A, ctx, eng, task, sql } from "../state.mjs";
import {
  identifier as id,
  literal,
  editValue,
} from "../../database/sql-values.mjs";
import {
  buildColumn,
  columnDefinitions,
  patchColumn,
} from "../../database/column-definition.mjs";
import { refreshDb, describeRowIssue, showDataIssue } from "./data.mjs";
import { columnValueError } from "../input-validation.mjs";
const table = () => S.cat?.tables.find((t) => t.name === S.table);
const names = (text) =>
  text
    .split(",")
    .map((n) => n.trim())
    .filter(Boolean);
const checkName = (name) =>
  !name || name.length > 64 || /[\x00-\x1f]/.test(name);
async function execute(statement) {
  await sql(statement);
  await refreshDb();
  ctx.draw();
}
export async function columnForm({
  name = "",
  type = "VARCHAR(255)",
  nullable = true,
} = {}) {
  const t = table();
  if (!t) throw Error("Sélectionnez une table.");
  const parsedType = /^(\w+)(?:\(([^)]+)\))?/i.exec(type);
  const values = {
    name,
    type,
    nullable: nullable ? "NULL" : "NOT NULL",
    defaultMode: "none",
    defaultValue: "",
    auto: "Non",
    key: "Aucune",
    comment: "",
    charset: "",
    collation: "",
    onUpdate: "",
    values: "",
    position: "En dernier",
  };
  const input = (key, label, hint = "") =>
    `<label class="field"><span>${label}</span><input class="in" data-f="${key}" value="${esc(values[key])}" ${key === "name" ? 'required maxlength="64" autofocus' : ""} ${key === "type" ? 'list="column-types"' : ""}>${hint ? `<small class="hint">${hint}</small>` : ""}</label>`;
  const select = (key, label, options) =>
    `<label class="field"><span>${label}</span><select class="in" data-f="${key}">${options.map(([value, text]) => `<option value="${value}" ${values[key] === value ? "selected" : ""}>${esc(text)}</option>`).join("")}</select></label>`;
  const pairs = (items) => items.map((x) => [x, x]);
  const build = (v) => {
    const c = {
      ...v,
      nullable: v.nullable === "NULL",
      auto: v.auto === "Oui",
      key: v.key === "Aucune" ? "" : v.key,
    };
    if (c.auto && !c.key)
      throw Error("AUTO_INCREMENT nécessite une clé PRIMARY ou UNIQUE.");
    if (c.auto && t.columns.some((c) => /auto_increment/i.test(c.extra)))
      throw Error("La table possède déjà une colonne AUTO_INCREMENT.");
    if (c.key === "PRIMARY" && t.indexes.some((i) => i.name === "PRIMARY"))
      throw Error(
        "La table possède déjà une clé primaire. Utilisez la gestion des index.",
      );
    if (c.key === "PRIMARY" && c.nullable)
      throw Error("Une clé primaire doit être NOT NULL.");
    return `ALTER TABLE ${id(t.name)} ADD COLUMN ${buildColumn(c)}${v.position === "En premier" ? " FIRST" : v.position.startsWith("Après ") ? " AFTER " + id(v.position.slice(6)) : ""};`;
  };
  let statement = "";
  let touched = false;
  const paint = (d) => {
    d.querySelectorAll("[data-f]").forEach(
      (el) => (values[el.dataset.f] = el.value),
    );
    const baseType = d.querySelector("#column-type").value;
    const size = d.querySelector("#column-size");
    const sized =
      /^(VARCHAR|CHAR|VARBINARY|BINARY|DECIMAL|NUMERIC|BIT|DATETIME|TIME|TIMESTAMP)$/.test(
        baseType,
      );
    size.closest("label").hidden = !sized;
    const unsigned = d.querySelector("#column-unsigned");
    unsigned.disabled =
      !/^(TINYINT|SMALLINT|MEDIUMINT|INT|BIGINT|DECIMAL|NUMERIC)$/.test(
        baseType,
      );
    values.type =
      baseType +
      (sized && size.value.trim() ? "(" + size.value.trim() + ")" : "") +
      (!unsigned.disabled && unsigned.checked ? " UNSIGNED" : "");
    const error = d.querySelector("#column-error");
    const defaultField = d
      .querySelector('[data-f="defaultValue"]')
      .closest("label");
    defaultField.hidden = !["literal", "expression"].includes(
      values.defaultMode,
    );
    d.querySelector('[data-f="values"]').closest("label").hidden =
      !/^(ENUM|SET)$/i.test(values.type);
    try {
      if (checkName(values.name)) throw Error("Donnez un nom à la colonne.");
      if (t.columns.some((c) => c.name === values.name))
        throw Error("Cette colonne existe déjà.");
      statement = build(values);
      error.textContent = "";
      d.querySelector('[data-v="ok"]').disabled = false;
      d.querySelector("#column-sql").textContent = statement;
    } catch (e) {
      error.textContent = touched || values.name ? e.message : "";
      d.querySelector('[data-v="ok"]').disabled = true;
      d.querySelector("#column-sql").textContent = "";
    }
  };
  await modal({
    title: "Ajouter une colonne",
    wide: true,
    body: `<p class="column-target">Table <strong>${esc(t.name)}</strong></p>
      <div class="column-form">
        <fieldset><legend>Définition</legend><div class="column-fields">${input("name", "Nom de la colonne")}
        <label class="field"><span>Type SQL</span><select class="in" id="column-type">${["VARCHAR", "TEXT", "INT", "BIGINT", "DECIMAL", "DATE", "DATETIME", "TIMESTAMP", "BOOLEAN", "JSON", "BLOB", "CHAR", "TINYINT", "SMALLINT", "MEDIUMINT", "FLOAT", "DOUBLE", "NUMERIC", "TIME", "YEAR", "BIT", "BINARY", "VARBINARY", "MEDIUMTEXT", "LONGTEXT", "MEDIUMBLOB", "LONGBLOB", "ENUM", "SET"].map((x) => `<option ${x === parsedType?.[1]?.toUpperCase() ? "selected" : ""}>${x}</option>`).join("")}</select></label>
        <label class="field"><span>Longueur / précision</span><input class="in" id="column-size" value="${esc(parsedType?.[2] ?? "")}" placeholder="255 ou 10,2"><small class="hint">DECIMAL : nombre de chiffres, puis décimales.</small></label>
        <label class="chk2 span-all"><input type="checkbox" id="column-unsigned" ${/UNSIGNED/i.test(type) ? "checked" : ""}> Nombres positifs uniquement</label>
        </div>${input("values", "Valeurs autorisées", 'Liste JSON : ["petit", "grand"]')}</fieldset>
        <fieldset><legend>Valeurs et contraintes</legend><div class="column-fields">
          ${select("nullable", "Valeur obligatoire", [
            ["NULL", "Non — NULL autorisé"],
            ["NOT NULL", "Oui — valeur requise"],
          ])}
          ${select("defaultMode", "Valeur par défaut", [
            ["none", "Aucune"],
            ["null", "NULL"],
            ["literal", "Valeur précise"],
            ["expression", "Expression SQL"],
          ])}
          ${input("defaultValue", "Valeur ou expression", "Ex. bonjour ou CURRENT_TIMESTAMP")}
          ${select("key", "Clé", [
            ["Aucune", "Aucune"],
            ["PRIMARY", "Clé primaire"],
            ["UNIQUE", "Valeur unique"],
          ])}
          ${select("auto", "Numérotation automatique", [
            ["Non", "Non"],
            ["Oui", "Oui — AUTO_INCREMENT"],
          ])}
        </div></fieldset>
        <details><summary>Options avancées</summary><div class="column-fields">
          ${select("position", "Position", pairs(["En dernier", "En premier", ...t.columns.map((c) => "Après " + c.name)]))}
          ${input("comment", "Commentaire")}${input("charset", "Jeu de caractères")}${input("collation", "Collation")}${input("onUpdate", "Mise à jour automatique", "CURRENT_TIMESTAMP")}
        </div></details>
        <p id="column-error" role="status"></p><details><summary>Voir la requête SQL</summary><pre id="column-sql" class="pre"></pre></details>
      </div>`,
    actions: [
      { label: "Annuler", v: "no" },
      { label: "Ajouter la colonne", v: "ok", kind: "pri" },
    ],
    onOpen(d) {
      paint(d);
      d.addEventListener("input", (event) => {
        if (event.target.dataset?.f === "name") touched = true;
        paint(d);
      });
      d.addEventListener("change", (event) => {
        if (event.target.id === "column-type")
          d.querySelector("#column-size").value =
            {
              VARCHAR: "255",
              CHAR: "1",
              BINARY: "1",
              VARBINARY: "255",
              DECIMAL: "10,2",
              NUMERIC: "10,2",
              BIT: "1",
            }[event.target.value] ?? "";
        paint(d);
      });
    },
    async beforeClose(value, d) {
      if (value !== "ok") return true;
      const button = d.querySelector('[data-v="ok"]');
      button.disabled = true;
      try {
        await execute(statement);
        toast("Colonne ajoutée à " + t.name);
        return true;
      } catch (e) {
        d.querySelector("#column-error").textContent = e.message;
        return false;
      } finally {
        button.disabled = false;
      }
    },
  });
}
async function definitionForm(name) {
  const t = table(),
    definition = columnDefinitions(t.ddl).get(name);
  await ddl({
    title: "Modifier la définition de " + name,
    fields: [
      {
        id: "definition",
        label: "Définition SQL complète (attributs existants conservés)",
        value: definition,
      },
    ],
    check: (v) => (!v.definition ? "Définition requise." : ""),
    sql: (v) =>
      `ALTER TABLE ${id(t.name)} MODIFY COLUMN ${id(name)} ${v.definition};`,
    onApply: (v) =>
      execute(
        `ALTER TABLE ${id(t.name)} MODIFY COLUMN ${id(name)} ${v.definition};`,
      ),
  });
}
async function patch(name, changes) {
  const t = table(),
    c = t.columns.find((c) => c.name === name);
  if (c.generation)
    throw Error(
      "Colonne générée : utilisez la définition complète pour préserver son expression.",
    );
  const definition = columnDefinitions(t.ddl).get(name);
  const next = patchColumn(definition, changes);
  await ddl({
    title: "Modifier " + name,
    fields: [],
    sql: () => `ALTER TABLE ${id(t.name)} MODIFY COLUMN ${id(name)} ${next};`,
    onApply: () =>
      execute(`ALTER TABLE ${id(t.name)} MODIFY COLUMN ${id(name)} ${next};`),
  });
}
export async function relationForm(initial = {}) {
  const tables = S.cat?.tables ?? [];
  if (!tables.length) return;
  const current =
    tables.find((t) => t.name === (initial.child ?? S.table)) ?? tables[0];
  const build = (v) => {
    const child = tables.find((t) => t.name === v.child),
      parent = tables.find((t) => t.name === v.parent),
      cols = v.columns,
      refs = v.refColumns;
    if (checkName(v.name))
      throw Error(
        "Le nom de la relation doit contenir entre 1 et 64 caractères. Modifiez-le dans les options.",
      );
    if (!refs.length)
      throw Error("Choisissez une table avec une clé primaire ou unique.");
    if (!cols.length || cols.some((c) => !c) || cols.length !== refs.length)
      throw Error(
        "Choisissez une colonne source pour chaque colonne de la clé.",
      );
    if (
      new Set(cols).size !== cols.length ||
      new Set(refs).size !== refs.length
    )
      throw Error(
        "Chaque colonne doit être utilisée une seule fois dans le lien.",
      );
    for (let i = 0; i < cols.length; i++) {
      const a = child.columns.find((c) => c.name === cols[i]),
        b = parent.columns.find((c) => c.name === refs[i]);
      if (!a || !b) throw Error("Une colonne sélectionnée n’existe pas.");
      if (a.type.toLowerCase() !== b.type.toLowerCase())
        throw Error(
          "Les types et attributs des colonnes liées doivent correspondre.",
        );
      if ((v.delete === "SET NULL" || v.update === "SET NULL") && !a.nullable)
        throw Error("SET NULL nécessite des colonnes enfant nullables.");
    }
    if (
      !parent.indexes.some(
        (idx) =>
          idx.unique &&
          idx.columns.length === refs.length &&
          idx.columns.every((c, i) => c === refs[i]),
      )
    )
      throw Error(
        "Les colonnes parentes doivent former une clé PRIMARY ou UNIQUE complète et dans le même ordre.",
      );
    return `ALTER TABLE ${id(child.name)} ${initial.name ? "DROP FOREIGN KEY " + id(initial.name) + ", " : ""}ADD CONSTRAINT ${id(v.name)} FOREIGN KEY (${cols.map(id).join(",")}) REFERENCES ${id(parent.name)} (${refs.map(id).join(",")}) ON DELETE ${v.delete} ON UPDATE ${v.update};`;
  };
  const keys = (t) =>
    t.indexes.filter((index) => index.unique && index.columns.length);
  const parent =
    tables.find((t) => t.name === initial.parent) ??
    tables.find((t) => t.name !== current.name && keys(t).length) ??
    current;
  const key =
    keys(parent).find(
      (k) =>
        JSON.stringify(k.columns) ===
        JSON.stringify(initial.refColumns ?? [initial.refColumn ?? "id"]),
    ) ?? keys(parent)[0];
  const value = {
    child: current.name,
    parent: parent.name,
    columns: initial.columns ?? [
      initial.column ??
        current.columns.find((c) => c.key !== "PRI")?.name ??
        current.columns[0]?.name,
    ],
    refColumns: key?.columns ?? [],
    name:
      initial.name ??
      ("fk_" + current.name).slice(0, 48) + "_" + Date.now().toString(36),
    delete: initial.onDelete ?? "RESTRICT",
    update: initial.onUpdate ?? "CASCADE",
  };
  const tableOptions = (selected) =>
    tables
      .map(
        (t) =>
          `<option value="${esc(t.name)}" ${t.name === selected ? "selected" : ""}>${esc(t.name)}</option>`,
      )
      .join("");
  const ruleOptions = (selected, update = false) =>
    relationRules
      .map(
        (code) =>
          `<option value="${code}" ${code === selected ? "selected" : ""}>${esc(relationRule(code, update).label)}</option>`,
      )
      .join("");
  await modal({
    title: initial.name ? "Modifier la relation" : "Relier deux tables",
    wide: true,
    body: `<p class="relation-intro">Choisissez la table qui porte le lien, puis celle qu’elle référence.</p>
      <div class="relation-tables"><label class="relation-card"><span class="relation-step">1 · Depuis</span><b>Plusieurs lignes de…</b><select class="in" id="rel-child" aria-label="Table qui porte le lien">${tableOptions(value.child)}</select><span class="hint">La table qui contient la clé étrangère</span></label><span class="relation-connector" aria-hidden="true">${ui.link}<span>N ${icon("arrow-right", "sm")} 1</span></span><label class="relation-card"><span class="relation-step">2 · Vers</span><b>Une ligne de…</b><select class="in" id="rel-parent" aria-label="Table référencée">${tableOptions(value.parent)}</select><span class="hint">La table dont on référence une clé</span></label></div>
      <section class="relation-mapping" aria-labelledby="rel-mapping-title"><h2 id="rel-mapping-title">Associer les colonnes</h2><label class="field"><span>Clé de la table référencée</span><select class="in" id="rel-key"></select></label><div id="rel-pairs"></div><p id="rel-summary" class="hint" aria-live="polite"></p></section>
      <details class="relation-options"><summary>Comportement et nom de la relation</summary><label class="field"><span>Si la ligne référencée est supprimée</span><select class="in" id="rel-delete" aria-describedby="rel-delete-help">${ruleOptions(value.delete)}</select></label><p class="hint relation-rule-help" id="rel-delete-help" aria-live="polite"></p><label class="field"><span>Si sa clé est modifiée</span><select class="in" id="rel-update" aria-describedby="rel-update-help">${ruleOptions(value.update, true)}</select></label><p class="hint relation-rule-help" id="rel-update-help" aria-live="polite"></p><label class="field"><span>Nom de la relation</span><input class="in" id="rel-name" value="${esc(value.name)}" maxlength="64"></label></details>
      <details class="sql-disclosure"><summary>Voir la requête SQL</summary><pre class="pre" id="rel-sql"></pre></details><p class="hint bad" id="rel-error" role="status"></p>`,
    actions: [
      { label: "Annuler", v: "no" },
      {
        label: initial.name ? "Enregistrer la relation" : "Créer la relation",
        v: "ok",
        kind: "pri",
      },
    ],
    onOpen(d) {
      const get = (id) => d.querySelector("#rel-" + id);
      function validate() {
        value.columns = [...d.querySelectorAll("[data-rel-column]")].map(
          (input) => input.value,
        );
        value.delete = get("delete").value;
        value.update = get("update").value;
        get("delete-help").textContent = relationRule(
          value.delete,
          false,
          value.child,
          value.parent,
        ).detail;
        get("update-help").textContent = relationRule(
          value.update,
          true,
          value.child,
          value.parent,
        ).detail;
        value.name = get("name").value.trim();
        try {
          get("sql").textContent = build(value);
          get("error").textContent = "";
          d.querySelector('[data-v="ok"]').disabled = false;
          get("summary").textContent =
            `Chaque ligne de ${value.child} référence une ligne de ${value.parent}.`;
        } catch (error) {
          get("error").textContent = error.message;
          get("sql").textContent = "";
          get("summary").textContent =
            "Choisissez des colonnes de même type pour établir le lien.";
          d.querySelector('[data-v="ok"]').disabled = true;
        }
      }
      function pairs() {
        const child = tables.find((t) => t.name === value.child),
          parent = tables.find((t) => t.name === value.parent);
        const refs = value.refColumns,
          selected = value.columns;
        get("pairs").innerHTML = refs.length
          ? refs
              .map((ref, i) => {
                const target = parent.columns.find((c) => c.name === ref),
                  compatible = child.columns.filter(
                    (c) => c.type.toLowerCase() === target.type.toLowerCase(),
                  );
                const chosen =
                  compatible.find((c) => c.name === selected[i]) ??
                  compatible.find((c) => c.name === value.parent + "_" + ref) ??
                  compatible[0];
                return `<div class="relation-pair"><label class="field"><span>${esc(value.child)}</span><select class="in" data-rel-column aria-label="Colonne à relier à ${esc(value.parent)}.${esc(ref)}"><option value="">Choisir une colonne…</option>${child.columns.map((c) => `<option value="${esc(c.name)}" ${c === chosen ? "selected" : ""} ${compatible.includes(c) ? "" : "disabled"}>${esc(c.name)} · ${esc(c.type)}</option>`).join("")}</select></label><span class="relation-pair-arrow" aria-hidden="true">${ui.arrow}</span><div class="relation-target"><span>${esc(value.parent)}</span><b>${ui.key}${esc(ref)}</b><small>${esc(target.type)}</small></div></div>`;
              })
              .join("")
          : '<p class="hint">Cette table n’a pas encore de clé primaire ou unique. Ajoutez-en une dans Structure ou choisissez une autre table.</p>';
        validate();
      }
      function parentKeys() {
        const available = keys(tables.find((t) => t.name === value.parent));
        get("key").innerHTML = available.length
          ? available
              .map(
                (k) =>
                  `<option value="${esc(JSON.stringify(k.columns))}" ${JSON.stringify(k.columns) === JSON.stringify(value.refColumns) ? "selected" : ""}>${esc(k.name === "PRIMARY" ? "Clé primaire" : k.name)} · ${esc(k.columns.join(" + "))}</option>`,
              )
              .join("")
          : '<option value="">Aucune clé disponible</option>';
        value.refColumns = JSON.parse(get("key").value || "[]");
        pairs();
      }
      get("child").onchange = () => {
        value.child = get("child").value;
        value.columns = [];
        pairs();
      };
      get("parent").onchange = () => {
        value.parent = get("parent").value;
        value.refColumns = [];
        parentKeys();
      };
      get("key").onchange = () => {
        value.refColumns = JSON.parse(get("key").value || "[]");
        pairs();
      };
      d.addEventListener("change", validate);
      get("name").addEventListener("input", validate);
      parentKeys();
      get("child").focus();
    },
    beforeClose: async (action, d) => {
      if (action !== "ok") return true;
      const button = d.querySelector('[data-v="ok"]');
      button.disabled = true;
      try {
        await execute(build(value));
        toast("Relation enregistrée");
        return true;
      } catch (error) {
        d.querySelector("#rel-error").textContent = error.message;
        return false;
      } finally {
        button.disabled = false;
      }
    },
  });
}
async function advancedInsert() {
  const t = table();
  await modal({
    title: "Insérer une ligne",
    wide: true,
    body:
      t.columns
        .map(
          (c, i) =>
            `<label class="field"><span>${esc(c.name)} · ${esc(c.type)}</span><select class="in" data-mode="${i}" aria-label="Mode ${esc(c.name)}"><option value="default">DEFAULT — omettre</option><option value="text">Texte / nombre exact</option><option value="null">NULL</option><option value="hex">Binaire hexadécimal</option></select><input class="in" data-value="${i}" aria-label="Valeur ${esc(c.name)}"></label>`,
        )
        .join("") + '<p class="hint" id="insert-error" role="status"></p>',
    actions: [
      { label: "Annuler", v: "no" },
      { label: "Insérer", v: "ok", kind: "pri" },
    ],
    onOpen(d) {
      const clear = () => {
        for (const input of d.querySelectorAll("[aria-invalid]")) {
          input.removeAttribute("aria-invalid");
          input.removeAttribute("aria-describedby");
        }
        d.querySelector("#insert-error").replaceChildren();
      };
      d.addEventListener("input", clear);
      d.addEventListener("change", clear);
    },
    beforeClose: async (value, d) => {
      if (value !== "ok") return true;
      const submit = d.querySelector('[data-v="ok"]');
      submit.disabled = true;
      const row = {};
      try {
        const cols = [],
          values = [];
        for (let i = 0; i < t.columns.length; i++) {
          const col = t.columns[i],
            mode = d.querySelector(`[data-mode="${i}"]`).value;
          if (mode === "default") continue;
          const text = d.querySelector(`[data-value="${i}"]`).value;
          const message =
            mode === "text"
              ? columnValueError(col, text)
              : mode === "null" && !col.nullable
                ? "Cette colonne ne peut pas être vide (NULL)."
                : "";
          if (message) throw Object.assign(Error(message), { field: col.name });
          row[col.name] = mode === "null" ? null : text;
          cols.push(id(col.name));
          values.push(literal(editValue(mode, text)));
        }
        await execute(
          cols.length
            ? `INSERT INTO ${id(t.name)} (${cols}) VALUES (${values});`
            : `INSERT INTO ${id(t.name)} () VALUES ();`,
        );
        return true;
      } catch (error) {
        const issue = error.field
          ? { message: error.message, column: error.field }
          : (describeRowIssue(error, t, row, "insert") ?? {
              message: error.message,
            });
        showDataIssue(d.querySelector("#insert-error"), issue);
        const index = t.columns.findIndex((c) => c.name === issue.column);
        if (index >= 0) {
          const input = d.querySelector(`[data-value="${index}"]`);
          input.setAttribute("aria-invalid", "true");
          input.setAttribute("aria-describedby", "insert-error");
          input.focus();
        }
        return false;
      } finally {
        submit.disabled = false;
      }
    },
  });
}
Object.assign(A, {
  async binaryCell(row, column) {
    const t = table(),
      original = S.grid.rows[row],
      old = original[column];
    await ddl({
      title: "Modifier le binaire " + t.columns[column].name,
      fields: [
        {
          id: "hex",
          label: "Octets hexadécimaux (sans 0x)",
          value: [...old].map((x) => x.toString(16).padStart(2, "0")).join(""),
        },
      ],
      sql: (v) =>
        `UPDATE ${id(t.name)} SET ${id(t.columns[column].name)}=${literal(editValue("hex", v.hex))} WHERE ${t.columns.map((c, i) => id(c.name) + " <=> " + literal(original[i])).join(" AND ")} LIMIT 1;`,
      onApply: async (v) => {
        const result = await eng().db.query(
          `UPDATE ${id(t.name)} SET ${id(t.columns[column].name)}=${literal(editValue("hex", v.hex))} WHERE ${t.columns.map((c, i) => id(c.name) + " <=> " + literal(original[i])).join(" AND ")} LIMIT 1;`,
          S.db,
        );
        if (String(result[0].affected) === "0")
          throw Error("La ligne a changé : rechargez la grille.");
        S.dbDirty = true;
        await refreshDb();
        ctx.draw();
      },
    });
  },
  async createTable() {
    await ddl({
      title: "Créer une table",
      ok: "Créer la table",
      fields: [
        { id: "name", label: "Nom de la table", value: "nouvelle_table" },
        { id: "cols", type: "cols" },
      ],
      check: (v) =>
        checkName(v.name)
          ? "Nom de table requis, 64 caractères maximum."
          : !v.cols.length
            ? "Ajoutez une colonne."
            : v.cols.some((c) => checkName(c.name))
              ? "Chaque colonne a besoin d’un nom."
              : new Set(v.cols.map((c) => c.name.toLowerCase())).size !==
                  v.cols.length
                ? "Les noms de colonnes doivent être distincts."
                : v.cols.filter((c) => c.ai).length > 1
                  ? "Une seule colonne AUTO_INCREMENT autorisée."
                  : "",
      sql: (v) =>
        G.createTable(
          v.name,
          v.cols.map((c) => ({ ...c, nullable: !!c.nul })),
        ),
      onApply: async (v) => {
        await sql(
          G.createTable(
            v.name,
            v.cols.map((c) => ({ ...c, nullable: !!c.nul })),
          ),
        );
        S.table = v.name;
        S.dmode = "struct";
        await refreshDb();
        ctx.draw();
      },
    });
  },
  async primaryKeyForm() {
    const t = table();
    await ddl({
      title: "Clé primaire",
      fields: [
        {
          id: "columns",
          label: "Colonnes dans l’ordre, séparées par des virgules",
          value:
            t.indexes.find((i) => i.name === "PRIMARY")?.columns.join(",") ??
            "",
        },
      ],
      sql: (v) => {
        const cols = names(v.columns);
        if (
          !cols.length ||
          cols.some((c) => !t.columns.some((x) => x.name === c))
        )
          throw Error("Choisissez des colonnes existantes.");
        return `ALTER TABLE ${id(t.name)} ${t.indexes.some((i) => i.name === "PRIMARY") ? "DROP PRIMARY KEY, " : ""}ADD PRIMARY KEY (${cols.map(id).join(",")});`;
      },
      onApply: async (v) =>
        execute(
          `ALTER TABLE ${id(t.name)} ${t.indexes.some((i) => i.name === "PRIMARY") ? "DROP PRIMARY KEY, " : ""}ADD PRIMARY KEY (${names(v.columns).map(id).join(",")});`,
        ),
    });
  },
  columnForm,
  relationForm,
  colQuick: () => columnForm(),
  colAdd: () => columnForm(),
  colSetType: (arg) => {
    const [name, type] = arg.split("|");
    return patch(name, { type });
  },
  colNull: (name) =>
    patch(name, {
      nullable: !table().columns.find((c) => c.name === name).nullable,
    }),
  definitionForm,
  insertAdvanced: advancedInsert,
  schemaColAdd: (name) => {
    S.table = name;
    return columnForm();
  },
  async importSQL() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".sql";
    input.onchange = () =>
      task("Import SQL", async () => {
        await eng().db.import(input.files[0], S.db);
        S.dbDirty = true;
        await refreshDb();
        ctx.draw();
      });
    input.click();
  },
  exportSQL: () => eng().db.export(S.db),
  async tableRename() {
    const t = table();
    await ddl({
      title: "Renommer la table",
      fields: [{ id: "name", label: "Nouveau nom", value: t.name }],
      check: (v) => (checkName(v.name) ? "Nom invalide." : ""),
      sql: (v) => `RENAME TABLE ${id(t.name)} TO ${id(v.name)};`,
      onApply: async (v) => {
        await sql(`RENAME TABLE ${id(t.name)} TO ${id(v.name)};`);
        S.table = v.name;
        await refreshDb();
        ctx.draw();
      },
    });
  },
});
