import { identifier, literal } from "./sql-values.mjs";
export const quote = identifier;
export function columnSQL({
  name,
  type,
  nullable = false,
  primary = false,
  auto = false,
}) {
  if (!name || name.length > 64)
    throw Error("Nom de colonne requis, 64 caractères maximum.");
  if (
    !/^(?:TINYINT|SMALLINT|MEDIUMINT|INT|BIGINT)(?: UNSIGNED)?$|^(?:VARCHAR|CHAR|VARBINARY|BINARY)\([1-9]\d{0,4}\)$|^(?:DECIMAL\(\d{1,2},\d{1,2}\)|TEXT|MEDIUMTEXT|LONGTEXT|BLOB|JSON|DATE|DATETIME|TIMESTAMP|TIME|BOOLEAN|FLOAT|DOUBLE)$/i.test(
      type.trim(),
    )
  )
    throw Error(
      "Type non reconnu par le formulaire. Utilisez la console SQL pour un type avancé.",
    );
  if (
    auto &&
    !/^(TINYINT|SMALLINT|MEDIUMINT|INT|BIGINT)( UNSIGNED)?$/i.test(type)
  )
    throw Error("AUTO_INCREMENT nécessite un entier indexé.");
  return `${quote(name)} ${type.trim()} ${nullable ? "NULL" : "NOT NULL"}${auto ? " AUTO_INCREMENT" : ""}${primary ? " PRIMARY KEY" : ""}`;
}
export function node(tag, attrs = {}, text) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") n.className = v;
    else n.setAttribute(k, v);
  }
  if (text !== undefined) n.textContent = text;
  return n;
}
export function option(value, text = value) {
  return Object.assign(document.createElement("option"), {
    value,
    textContent: text,
  });
}
export function ddlDialog(host, { run, changed }) {
  const dialog = node("dialog", {
      class: "ddl-dialog",
      "aria-label": "Modification de structure",
    }),
    form = node("form", { method: "dialog" }),
    title = node("h2"),
    fields = node("div", { class: "ddl-fields" }),
    label = node("label", {}, "SQL à appliquer"),
    sql = node("textarea", {
      "aria-label": "SQL à appliquer",
      spellcheck: "false",
      rows: 6,
    }),
    error = node("p", { class: "message", role: "status" }),
    bar = node("div", { class: "bar" }),
    apply = node("button", { type: "button", class: "primary" }, "Appliquer"),
    cancel = node("button", { value: "cancel" }, "Annuler");
  label.append(sql);
  bar.append(apply, cancel);
  form.append(title, fields, label, error, bar);
  dialog.append(form);
  host.append(dialog);
  let database, build;
  apply.onclick = () =>
    run(async () => {
      apply.disabled = true;
      try {
        error.textContent = "";
        await changed(sql.value, database);
        dialog.close();
      } catch (e) {
        error.textContent = e.message;
        throw e;
      } finally {
        apply.disabled = false;
      }
    });
  function preview() {
    try {
      sql.value = build();
      error.textContent = "";
    } catch (e) {
      sql.value = "";
      error.textContent = e.message;
    }
  }
  return {
    open({ heading, db, controls = [], statement, generate }) {
      database = db;
      title.textContent = heading;
      fields.replaceChildren(...controls);
      build = generate;
      sql.value = statement ?? "";
      error.textContent = "";
      fields.oninput = fields.onchange = null;
      if (build) {
        fields.oninput = preview;
        fields.onchange = preview;
        preview();
      }
      dialog.showModal();
    },
    dispose: () => dialog.remove(),
  };
}
function field(label, type = "text", value = "") {
  const wrap = node("label", {}, label),
    input = node("input", { type });
  input.value = value;
  wrap.append(input);
  return { wrap, input };
}
export function attachDatabaseManager(
  container,
  { rows, run, changed, refreshTables, browse, showStructure },
) {
  const database = container.querySelector(".database"),
    tree = container.querySelector(".database-tree"),
    selected = container.querySelector(".table");
  const dialog = ddlDialog(container.querySelector(".sql-ddl-host"), {
    run,
    changed: async (sql, db) => {
      if (!sql.trim())
        throw Error("SQL vide. Corrigez les champs avant d’appliquer.");
      await rows(sql, db);
      changed();
      await databases();
      await refreshTables();
    },
  });
  async function databases() {
    tree.setAttribute("aria-busy", "true");
    try {
      const result = await rows("SHOW DATABASES");
      const names = result.rows.map((r) => String(r[0])),
        current = database.value;
      database.replaceChildren(...names.map((n) => option(n)));
      database.value = names.includes(current)
        ? current
        : names.includes("test")
          ? "test"
          : (names[0] ?? "");
      tree.replaceChildren();
      for (const name of names) {
        const details = node("details"),
          summary = node("summary", {}, name),
          list = node("div", { class: "table-list" });
        details.append(summary, list);
        tree.append(details);
        details.open = name === database.value;
        let loaded = false;
        const load = async () => {
          if (loaded) return;
          list.textContent = "Lecture…";
          const data = await rows("SHOW FULL TABLES", name);
          list.replaceChildren(
            ...data.rows.map(([table, kind]) => {
              const button = node(
                "button",
                { "data-database": name, "data-table": table },
                table,
              );
              button.title = kind;
              button.onclick = () =>
                run(async () => {
                  database.value = name;
                  await refreshTables();
                  selected.value = table;
                  await browse();
                  mark();
                });
              return button;
            }),
          );
          if (!data.rows.length) list.textContent = "Aucune table";
          loaded = true;
        };
        details.ontoggle = () => {
          if (details.open) run(load, { background: true });
        };
        if (details.open) await load();
      }
      mark();
    } finally {
      tree.removeAttribute("aria-busy");
    }
  }
  function mark() {
    for (const button of tree.querySelectorAll("button")) {
      if (
        button.dataset.database === database.value &&
        button.dataset.table === selected.value
      )
        button.setAttribute("aria-current", "true");
      else button.removeAttribute("aria-current");
    }
  }
  container.querySelector(".refresh-databases").onclick = () => run(databases);
  database.onchange = () =>
    run(async () => {
      container.querySelector(".grid").replaceChildren();
      container.querySelector(".structure-grid").hidden = true;
      container.querySelector(".structure-output").hidden = true;
      await refreshTables();
      await databases();
    });
  container.querySelector(".create-database").onclick = () => {
    const name = field("Nom de la base");
    dialog.open({
      heading: "Créer une base",
      controls: [name.wrap],
      generate: () => {
        if (!name.input.value || name.input.value.length > 64)
          throw Error("Nom requis, 64 caractères maximum.");
        return `CREATE DATABASE ${quote(name.input.value)} CHARACTER SET utf8mb4`;
      },
    });
  };
  container.querySelector(".drop-database").onclick = () => {
    if (
      ["mysql", "information_schema", "performance_schema", "sys"].includes(
        database.value,
      )
    )
      throw Error("Cette base système est réservée au moteur.");
    dialog.open({
      heading: "Supprimer la base " + database.value,
      statement: "DROP DATABASE " + quote(database.value),
    });
  };
  container.querySelector(".create-table").onclick = () => {
    const name = field("Nom de la table"),
      box = node("div", { class: "table-columns" }),
      add = node("button", { type: "button" }, "Ajouter une colonne");
    let columns = [];
    function addColumn(initial = false) {
      const row = node("fieldset", { class: "table-column-form" }),
        legend = node("legend", {}, "Colonne " + (columns.length + 1)),
        column = field("Nom", "text", initial ? "id" : ""),
        type = field("Type", "text", initial ? "INT" : "VARCHAR(255)"),
        nullable = field("NULL", "checkbox"),
        primary = field("Clé primaire", "checkbox"),
        auto = field("AUTO_INCREMENT", "checkbox"),
        remove = node("button", { type: "button" }, "Retirer");
      primary.input.checked = auto.input.checked = initial;
      const entry = { row, column, type, nullable, primary, auto };
      columns.push(entry);
      remove.onclick = () => {
        columns = columns.filter((c) => c !== entry);
        row.remove();
        box.dispatchEvent(new Event("input", { bubbles: true }));
      };
      row.append(
        legend,
        column.wrap,
        type.wrap,
        nullable.wrap,
        primary.wrap,
        auto.wrap,
        remove,
      );
      box.append(row);
    }
    addColumn(true);
    add.onclick = () => {
      if (columns.length >= 64) return;
      addColumn();
      box.dispatchEvent(new Event("input", { bubbles: true }));
    };
    dialog.open({
      heading: "Créer une table",
      db: database.value,
      controls: [name.wrap, box, add],
      generate: () => {
        if (!name.input.value || name.input.value.length > 64)
          throw Error("Nom requis, 64 caractères maximum.");
        if (!columns.length) throw Error("Ajoutez au moins une colonne.");
        const names = columns.map((c) => c.column.input.value);
        if (new Set(names).size !== names.length)
          throw Error("Chaque colonne doit avoir un nom distinct.");
        const definitions = columns.map((c) =>
            columnSQL({
              name: c.column.input.value,
              type: c.type.input.value,
              nullable: c.nullable.input.checked,
              auto: c.auto.input.checked,
            }),
          ),
          keys = columns
            .filter((c) => c.primary.input.checked)
            .map((c) => quote(c.column.input.value));
        if (keys.length)
          definitions.push("PRIMARY KEY (" + keys.join(", ") + ")");
        return (
          "CREATE TABLE " +
          quote(name.input.value) +
          " (\n  " +
          definitions.join(",\n  ") +
          "\n) ENGINE=InnoDB"
        );
      },
    });
  };
  container.querySelector(".manage-table").onclick = () =>
    run(async () => {
      if (!selected.value) throw Error("Choisissez une table.");
      const name = selected.value,
        db = database.value;
      const operation = node("label", {}, "Opération"),
        select = node("select", { "aria-label": "Opération de structure" });
      for (const [v, t] of [
        ["add", "Ajouter une colonne"],
        ["modify", "Modifier une colonne"],
        ["rename-column", "Renommer une colonne"],
        ["drop", "Supprimer une colonne"],
        ["primary", "Définir la clé primaire"],
        ["unique", "Créer un index UNIQUE"],
        ["index", "Créer un index"],
        ["drop-index", "Supprimer un index"],
        ["rename", "Renommer la table"],
        ["truncate", "Vider la table"],
        ["drop-table", "Supprimer la table"],
      ])
        select.append(option(v, t));
      operation.append(select);
      const nameField = field("Colonne / nouveau nom / index"),
        type = field("Type SQL", "text", "VARCHAR(255)"),
        nullable = field("Autoriser NULL", "checkbox"),
        auto = field("AUTO_INCREMENT", "checkbox"),
        columns = field("Colonnes de la clé / index, séparées par une virgule");
      const info = node(
        "p",
        { class: "hint" },
        "DDL : les changements peuvent valider les transactions en cours. Vérifiez le SQL ci-dessous. Pour une modification, reprenez tous les attributs à conserver.",
      );
      const current = await rows(`SHOW FULL COLUMNS FROM ${quote(name)}`, db);
      const names = node(
        "p",
        { class: "hint" },
        "Colonnes : " +
          current.rows
            .map((r) => `${r[0]} ${r[1]}${r[4] === "PRI" ? " [PK]" : ""}`)
            .join(" · "),
      );
      dialog.open({
        heading: db + "." + name,
        db,
        controls: [
          operation,
          nameField.wrap,
          type.wrap,
          nullable.wrap,
          auto.wrap,
          columns.wrap,
          names,
          info,
        ],
        generate: () => {
          const op = select.value,
            c = nameField.input.value;
          nameField.wrap.hidden = [
            "truncate",
            "drop-table",
            "primary",
          ].includes(op);
          type.wrap.hidden =
            nullable.wrap.hidden =
            auto.wrap.hidden =
              !["add", "modify"].includes(op);
          columns.wrap.hidden = ![
            "primary",
            "unique",
            "index",
            "rename-column",
          ].includes(op);
          if (["add", "modify"].includes(op))
            return `ALTER TABLE ${quote(name)} ${op === "add" ? "ADD" : "MODIFY"} COLUMN ${columnSQL({ name: c, type: type.input.value, nullable: nullable.input.checked, auto: auto.input.checked })}`;
          if (op === "rename-column") {
            if (!current.rows.some((r) => r[0] === c) || !columns.input.value)
              throw Error(
                "Indiquez une colonne existante et son nouveau nom dans le champ Colonnes.",
              );
            return `ALTER TABLE ${quote(name)} RENAME COLUMN ${quote(c)} TO ${quote(columns.input.value)}`;
          }
          if (op === "truncate") return `TRUNCATE TABLE ${quote(name)}`;
          if (op === "drop-table") return `DROP TABLE ${quote(name)}`;
          if (op === "primary" || op === "unique" || op === "index") {
            const parts = columns.input.value.split(",").map((x) => x.trim());
            if (parts.some((x) => !current.rows.some((r) => r[0] === x)))
              throw Error(
                "Choisissez les colonnes existantes, séparées par une virgule.",
              );
            const primaryExists = current.rows.some((r) => r[4] === "PRI");
            return `ALTER TABLE ${quote(name)} ${op === "primary" ? `${primaryExists ? "DROP PRIMARY KEY, " : ""}ADD PRIMARY KEY` : op === "unique" ? `ADD UNIQUE INDEX ${quote(c || "idx_unique")}` : `ADD INDEX ${quote(c || "idx")}`} (${parts.map(quote).join(", ")})`;
          }
          if (!c) throw Error("Nom requis.");
          return op === "rename"
            ? `RENAME TABLE ${quote(name)} TO ${quote(c)}`
            : op === "drop-index"
              ? `ALTER TABLE ${quote(name)} DROP ${c === "PRIMARY" ? "PRIMARY KEY" : "INDEX " + quote(c)}`
              : `ALTER TABLE ${quote(name)} DROP COLUMN ${quote(c)}`;
        },
      });
    });
  return { refresh: databases, mark, dispose: () => dialog.dispose() };
}
