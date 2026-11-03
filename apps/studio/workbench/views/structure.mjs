import * as G from "../sqlgen.mjs";
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
import { refreshDb } from "./data.mjs";
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
  const fields = [
    { id: "name", label: "Nom de la colonne", value: name },
    {
      id: "type",
      label:
        "Type SQL et longueur / précision (ex. VARCHAR(255), DECIMAL(10,2), BIGINT UNSIGNED)",
      value: type,
    },
    {
      id: "nullable",
      label: "Valeur nulle",
      type: "select",
      options: ["NULL", "NOT NULL"],
      value: nullable ? "NULL" : "NOT NULL",
    },
    {
      id: "defaultMode",
      label: "Valeur par défaut",
      type: "select",
      options: ["none", "null", "literal", "expression"],
    },
    {
      id: "defaultValue",
      label:
        "Contenu du défaut (literal = texte exact ; expression = CURRENT_TIMESTAMP…) ",
    },
    {
      id: "auto",
      label: "AUTO_INCREMENT",
      type: "select",
      options: ["Non", "Oui"],
    },
    {
      id: "key",
      label: "Clé de la nouvelle colonne",
      type: "select",
      options: ["Aucune", "PRIMARY", "UNIQUE"],
    },
    { id: "comment", label: "Commentaire" },
    { id: "charset", label: "Jeu de caractères (facultatif)" },
    { id: "collation", label: "Collation (facultative)" },
    { id: "onUpdate", label: "ON UPDATE (facultatif, CURRENT_TIMESTAMP)" },
    {
      id: "values",
      label: 'Valeurs ENUM / SET : liste JSON, ex. ["petit","grand"]',
    },
    {
      id: "position",
      label: "Position",
      type: "select",
      options: [
        "En dernier",
        "En premier",
        ...t.columns.map((c) => "Après " + c.name),
      ],
    },
  ];
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
  await ddl({
    title: "Ajouter une colonne",
    fields,
    check: (v) =>
      checkName(v.name)
        ? "Nom requis, 64 caractères maximum."
        : t.columns.some((c) => c.name === v.name)
          ? "Cette colonne existe déjà."
          : "",
    sql: build,
    onApply: async (v) => execute(build(v)),
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
  const fields = [
    {
      id: "child",
      label: "Table enfant",
      type: "select",
      options: tables.map((t) => t.name),
      value: current.name,
    },
    {
      id: "columns",
      label: "Colonnes enfant, dans l’ordre (séparées par des virgules)",
      value: (
        initial.columns ?? [
          current.columns.find((c) => c.key !== "PRI")?.name ??
            current.columns[0].name,
        ]
      ).join(","),
    },
    {
      id: "parent",
      label: "Table parente",
      type: "select",
      options: tables.map((t) => t.name),
      value: initial.parent ?? tables[0].name,
    },
    {
      id: "refColumns",
      label: "Colonnes référencées, dans le même ordre",
      value: (initial.refColumns ?? ["id"]).join(","),
    },
    {
      id: "name",
      label: "Nom de la contrainte",
      value:
        initial.name ?? "fk_" + current.name + "_" + Date.now().toString(36),
    },
    {
      id: "delete",
      label: "ON DELETE",
      type: "select",
      options: ["RESTRICT", "CASCADE", "SET NULL", "NO ACTION"],
      value: initial.onDelete ?? "RESTRICT",
    },
    {
      id: "update",
      label: "ON UPDATE",
      type: "select",
      options: ["RESTRICT", "CASCADE", "SET NULL", "NO ACTION"],
      value: initial.onUpdate ?? "CASCADE",
    },
  ];
  const build = (v) => {
    const child = tables.find((t) => t.name === v.child),
      parent = tables.find((t) => t.name === v.parent),
      cols = names(v.columns),
      refs = names(v.refColumns);
    if (
      checkName(v.name) ||
      !cols.length ||
      cols.length !== refs.length ||
      new Set(cols).size !== cols.length ||
      new Set(refs).size !== refs.length
    )
      throw Error("Nom valide et même nombre de colonnes distinctes requis.");
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
  await ddl({
    title: initial.name ? "Modifier une relation" : "Créer une relation",
    fields,
    sql: build,
    onApply: (v) => execute(build(v)),
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
    beforeClose: async (value, d) => {
      if (value !== "ok") return true;
      try {
        const cols = [],
          values = [];
        for (let i = 0; i < t.columns.length; i++) {
          const mode = d.querySelector(`[data-mode="${i}"]`).value;
          if (mode === "default") continue;
          cols.push(id(t.columns[i].name));
          values.push(
            literal(
              editValue(mode, d.querySelector(`[data-value="${i}"]`).value),
            ),
          );
        }
        await execute(
          cols.length
            ? `INSERT INTO ${id(t.name)} (${cols}) VALUES (${values});`
            : `INSERT INTO ${id(t.name)} () VALUES ();`,
        );
        return true;
      } catch (e) {
        d.querySelector("#insert-error").textContent = e.message;
        return false;
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
  colAdd: () =>
    columnForm({
      name: document.querySelector("#ncName").value,
      type: document.querySelector("#ncType").value,
      nullable: document.querySelector("#ncNull").checked,
    }),
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
    return columnForm({
      name: document.querySelector("#sqName").value,
      type: document.querySelector("#sqType").value,
    });
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
