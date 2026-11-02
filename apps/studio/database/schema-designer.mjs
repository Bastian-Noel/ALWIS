import { identifier as q, literal } from "./sql-values.mjs";
import { node, option, ddlDialog } from "./database-tools.mjs";
// A foreign key always points to at most one parent when its referenced key is unique.
export function relationModel(columns, keys, indexes) {
  const tables = new Map();
  for (const row of columns) {
    const [table, name, type, key, nullable] = row;
    if (!tables.has(table)) tables.set(table, []);
    tables.get(table).push({ name, type, key, nullable: nullable === "YES" });
  }
  const unique = new Map();
  for (const [table, index, nonUnique, column, sequence] of indexes) {
    if (Number(nonUnique) !== 0) continue;
    const id = JSON.stringify([table, index]);
    if (!unique.has(id)) unique.set(id, { table, columns: [] });
    unique.get(id).columns[Number(sequence) - 1] = column;
  }
  const isUnique = (table, fields) =>
    [...unique.values()].some(
      (key) =>
        key.table === table &&
        key.columns.length === fields.length &&
        key.columns.every((c) => fields.includes(c)),
    );
  const grouped = new Map();
  for (const [
    from,
    to,
    column,
    reference,
    constraint,
    ordinal,
    referencedDatabase,
  ] of keys) {
    const id = JSON.stringify([from, constraint]);
    if (!grouped.has(id))
      grouped.set(id, {
        from,
        to,
        constraint,
        columns: [],
        references: [],
        referencedDatabase,
      });
    const link = grouped.get(id);
    link.columns[Number(ordinal) - 1] = column;
    link.references[Number(ordinal) - 1] = reference;
  }
  const relations = [...grouped.values()].map((link) => ({
    ...link,
    childRange: isUnique(link.from, link.columns) ? "0..1" : "0..N",
    parentRange: !tables.has(link.to)
      ? "?"
      : isUnique(link.to, link.references)
        ? link.columns.some(
            (c) => tables.get(link.from)?.find((f) => f.name === c)?.nullable,
          )
          ? "0..1"
          : "1"
        : link.columns.some(
              (c) => tables.get(link.from)?.find((f) => f.name === c)?.nullable,
            )
          ? "0..N"
          : "1..N",
    parentUnique: isUnique(link.to, link.references),
  }));
  const junctions = [];
  for (const [name] of tables) {
    const links = relations.filter((r) => r.from === name);
    if (
      links.length === 2 &&
      !links.some((r) => r.childRange === "0..1") &&
      isUnique(name, [...new Set(links.flatMap((r) => r.columns))])
    )
      junctions.push({ table: name, left: links[0].to, right: links[1].to });
  }
  return { tables, relations, unique, isUnique, junctions };
}
export async function renderSchemaDesigner(
  container,
  saved,
  { rows, run, changed, openTable },
) {
  container.innerHTML = `<div class="schema-toolbar bar"><label>Base <select class="database" aria-label="Base du schéma"></select></label><button class="refresh primary">Lire le schéma</button><button class="new-relation">Créer une relation</button><button class="junction">Créer une liaison N–N</button><button class="arrange">Réorganiser</button><label>Zoom <select class="schema-zoom"><option value="0.6">60 %</option><option value="0.8">80 %</option><option value="1" selected>100 %</option><option value="1.25">125 %</option></select></label></div><p class="message hint" role="status">Lire le schéma initialise MariaDB si nécessaire.</p><div class="schema-scroll"><div class="schema-canvas"><svg class="relation-lines" aria-label="Relations entre les tables"></svg><div class="schema-tables"></div></div></div><details class="relation-list"><summary>Clés étrangères et cardinalités</summary><div class="relations-text"></div></details><div class="schema-dialogs"></div>`;
  const $ = (s) => container.querySelector(s),
    database = $(".database"),
    canvas = $(".schema-canvas"),
    svg = $("svg"),
    cards = $(".schema-tables"),
    message = $(".message");
  let model,
    positions = {},
    activeDB,
    disposed = false,
    connecting,
    drawEdges = () => {},
    move = () => {};
  const layouts =
    saved?.layouts ??
    (saved?.database ? { [saved.database]: saved.positions ?? {} } : {});
  database.replaceChildren(option(saved?.database ?? "test"));
  database.value = saved?.database ?? "test";
  const ddl = ddlDialog($(".schema-dialogs"), {
    run,
    changed: async (sql, db) => {
      if (!sql.trim()) throw Error("SQL vide.");
      await rows(sql, db);
      changed();
      await refresh();
    },
  });
  const relation = node("dialog", {
      "aria-label": "Créer une relation",
      class: "relation-dialog",
    }),
    form = node("form", { method: "dialog" });
  relation.append(form);
  $(".schema-dialogs").append(relation);
  const title = node("h2", {}, "Créer une relation"),
    fields = node("div", { class: "relation-fields" }),
    from = node("select", { "aria-label": "Table enfant" }),
    column = node("select", {
      "aria-label": "Colonne enfant",
      multiple: "",
      size: "4",
    }),
    to = node("select", { "aria-label": "Table parente" }),
    reference = node("select", { "aria-label": "Clé parente" }),
    kind = node("select", { "aria-label": "Type de relation" }),
    onDelete = node("select", { "aria-label": "À la suppression" }),
    onUpdate = node("select", { "aria-label": "À la modification" }),
    junction = node("input", { "aria-label": "Nom de la table de liaison" }),
    preview = node("textarea", {
      "aria-label": "SQL de la relation",
      rows: 5,
      readOnly: "",
      spellcheck: "false",
    }),
    failure = node("p", { role: "status", class: "message" }),
    submit = node(
      "button",
      { type: "button", class: "primary" },
      "Créer la relation",
    );
  let junctionMode = false,
    relationDB,
    editingRelation,
    referentialRules = new Map();
  for (const [value, label] of [
    ["many", "Plusieurs enfants pour un parent (1–N)"],
    ["one", "Un enfant au plus par parent (1–1)"],
  ])
    kind.append(option(value, label));
  for (const select of [onDelete, onUpdate])
    for (const value of ["RESTRICT", "CASCADE", "SET NULL", "NO ACTION"])
      select.append(option(value));
  for (const [label, input] of [
    ["Table enfant", from],
    ["Colonne enfant", column],
    ["Table parente", to],
    ["Clé parente", reference],
    ["Relation", kind],
    ["À la suppression", onDelete],
    ["À la modification", onUpdate],
    ["Table de liaison N–N", junction],
  ]) {
    const wrap = node("label", {}, label);
    wrap.append(input);
    fields.append(wrap);
  }
  const bar = node("div", { class: "bar" });
  bar.append(submit, node("button", { value: "cancel" }, "Annuler"));
  form.append(
    title,
    fields,
    node(
      "p",
      { class: "hint" },
      "Les index uniques existants sont conservés. Pour autoriser plusieurs enfants sur une colonne unique, retirez son index dans la structure SQL.",
    ),
    preview,
    failure,
    bar,
  );
  function uniqueSingle(table) {
    return [...model.unique.values()]
      .filter((k) => k.table === table && k.columns.length === 1)
      .map((k) => k.columns[0]);
  }
  function parentColumns() {
    const value = reference.value;
    return value.startsWith("[") ? JSON.parse(value) : value ? [value] : [];
  }
  function selectedChildren() {
    return [...column.selectedOptions].map((o) => o.value);
  }
  function updateColumns() {
    const before = selectedChildren(),
      parentBefore = reference.value;
    column.replaceChildren(
      ...(model.tables.get(from.value) ?? [])
        .filter(
          (f) => !junctionMode || uniqueSingle(from.value).includes(f.name),
        )
        .map((f) => option(f.name, f.name + " · " + f.type)),
    );
    for (const item of column.options)
      item.selected = before.includes(item.value);
    if (!column.selectedOptions.length && column.options.length)
      column.options[0].selected = true;
    reference.replaceChildren(
      ...[...model.unique.values()]
        .filter(
          (key) =>
            key.table === to.value &&
            (!junctionMode || key.columns.length === 1),
        )
        .map((key) =>
          option(
            key.columns.length === 1
              ? key.columns[0]
              : JSON.stringify(key.columns),
            key.columns.join(" + "),
          ),
        ),
    );
    if ([...reference.options].some((o) => o.value === parentBefore))
      reference.value = parentBefore;
  }
  function statement() {
    const children = selectedChildren().map((name) =>
        model.tables.get(from.value)?.find((f) => f.name === name),
      ),
      parents = parentColumns().map((name) =>
        model.tables.get(to.value)?.find((f) => f.name === name),
      );
    if (
      !children.length ||
      !parents.length ||
      [...children, ...parents].some((c) => !c)
    )
      throw Error(
        "Choisissez les colonnes enfants et une clé parente UNIQUE ou primaire.",
      );
    if (children.length !== parents.length)
      throw Error(
        "La clé enfant doit avoir autant de colonnes que la clé parente. L’ordre suit celui des colonnes de la table.",
      );
    const child = children[0],
      parent = parents[0];
    if (junctionMode) {
      if (!junction.value || junction.value.length > 64)
        throw Error("Nommez la table de liaison.");
      if (from.value === to.value)
        throw Error(
          "Pour une liaison réflexive, utilisez SQL et nommez explicitement les deux rôles.",
        );
      return `CREATE TABLE ${q(junction.value)} (${q("left_id")} ${child.type} NOT NULL, ${q("right_id")} ${parent.type} NOT NULL, PRIMARY KEY (${q("left_id")}, ${q("right_id")}), FOREIGN KEY (${q("left_id")}) REFERENCES ${q(from.value)} (${q(child.name)}), FOREIGN KEY (${q("right_id")}) REFERENCES ${q(to.value)} (${q(parent.name)})) ENGINE=InnoDB`;
    }
    if (
      (onDelete.value === "SET NULL" || onUpdate.value === "SET NULL") &&
      children.some((c) => !c.nullable)
    )
      throw Error(
        "SET NULL exige que toutes les colonnes enfants autorisent NULL. Modifiez leur structure avant de créer la relation.",
      );
    const childNames = children.map((c) => c.name),
      unique =
        kind.value === "one" && !model.isUnique(from.value, childNames)
          ? `ADD UNIQUE INDEX ${q("uq_" + crypto.randomUUID().replaceAll("-", "").slice(0, 16))} (${childNames.map(q).join(", ")}), `
          : "";
    const drop = editingRelation
        ? `DROP FOREIGN KEY ${q(editingRelation.constraint)}, `
        : "",
      constraint =
        editingRelation?.constraint ??
        "fk_" + crypto.randomUUID().replaceAll("-", "").slice(0, 16);
    return `ALTER TABLE ${q(from.value)} ${drop}${unique}ADD CONSTRAINT ${q(constraint)} FOREIGN KEY (${childNames.map(q).join(", ")}) REFERENCES ${q(to.value)} (${parents.map((p) => q(p.name)).join(", ")}) ON DELETE ${onDelete.value} ON UPDATE ${onUpdate.value}`;
  }
  function previewSQL() {
    try {
      preview.value = statement();
      failure.textContent = "";
    } catch (e) {
      preview.value = "";
      failure.textContent = e.message;
    }
  }
  from.onchange = to.onchange = () => {
    updateColumns();
    previewSQL();
  };
  for (const input of [column, reference, kind, onDelete, onUpdate, junction])
    input.oninput = previewSQL;
  function openRelation({
    child,
    parent,
    childColumn,
    parentColumn,
    manyToMany = false,
    existing,
  } = {}) {
    if (!model?.tables.size) {
      message.textContent =
        "Lisez une base contenant des tables avant de créer une relation.";
      return;
    }
    relationDB = activeDB;
    junctionMode = manyToMany;
    editingRelation = existing;
    title.textContent = manyToMany
      ? "Créer une table de liaison N–N"
      : existing
        ? "Modifier " + existing.constraint
        : "Créer une clé étrangère";
    for (const select of [from, to])
      select.replaceChildren(...[...model.tables.keys()].map((n) => option(n)));
    if (child) from.value = child;
    if (parent) to.value = parent;
    else if (to.options.length > 1) to.selectedIndex = 1;
    kind.closest("label").hidden =
      onDelete.closest("label").hidden =
      onUpdate.closest("label").hidden =
        manyToMany;
    junction.closest("label").hidden = !manyToMany;
    kind.value = "many";
    onDelete.value = onUpdate.value = "RESTRICT";
    junction.value = from.value + "_" + to.value;
    updateColumns();
    if (childColumn) column.value = childColumn;
    if (parentColumn) reference.value = parentColumn;
    if (existing) {
      for (const item of column.options)
        item.selected = existing.columns.includes(item.value);
      reference.value =
        existing.references.length === 1
          ? existing.references[0]
          : JSON.stringify(existing.references);
      const rule = referentialRules.get(
        JSON.stringify([existing.from, existing.constraint]),
      );
      onDelete.value = rule?.[0] ?? "RESTRICT";
      onUpdate.value = rule?.[1] ?? "RESTRICT";
      kind.value = existing.childRange === "0..1" ? "one" : "many";
      from.disabled = true;
    } else from.disabled = false;
    previewSQL();
    relation.showModal();
  }
  submit.onclick = () =>
    run(async () => {
      submit.disabled = true;
      try {
        const sql = preview.value;
        if (!sql)
          throw Error(failure.textContent || "Choisissez des clés valides.");
        await rows(sql, relationDB);
        changed();
        relation.close();
        await refresh();
      } catch (e) {
        failure.textContent = e.message;
        throw e;
      } finally {
        submit.disabled = false;
      }
    });
  async function refresh() {
    message.textContent = "Lecture des tables et des clés…";
    clearConnecting();
    const chosen = database.value;
    if (activeDB && activeDB !== chosen) {
      cards.replaceChildren();
      svg.replaceChildren();
      $(".relations-text").replaceChildren();
      model = undefined;
    }
    const databases = await rows("SHOW DATABASES");
    database.replaceChildren(...databases.rows.map((r) => option(r[0])));
    database.value = [...database.options].some((o) => o.value === chosen)
      ? chosen
      : "test";
    const db = database.value;
    const columns = await rows(
      `SELECT TABLE_NAME,COLUMN_NAME,COLUMN_TYPE,COLUMN_KEY,IS_NULLABLE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=${literal(db)} ORDER BY TABLE_NAME,ORDINAL_POSITION`,
      db,
    );
    if (
      new Set(columns.rows.map((r) => r[0])).size > 50 ||
      columns.rows.length > 2000
    )
      throw Error(
        "Diagramme limité à 50 tables et 2 000 colonnes. Utilisez l’explorateur SQL pour cette base.",
      );
    const keys = await rows(
      `SELECT TABLE_NAME,REFERENCED_TABLE_NAME,COLUMN_NAME,REFERENCED_COLUMN_NAME,CONSTRAINT_NAME,ORDINAL_POSITION,REFERENCED_TABLE_SCHEMA FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA=${literal(db)} AND REFERENCED_TABLE_NAME IS NOT NULL ORDER BY TABLE_NAME,CONSTRAINT_NAME,ORDINAL_POSITION`,
      db,
    );
    const indexes = await rows(
      `SELECT TABLE_NAME,INDEX_NAME,NON_UNIQUE,COLUMN_NAME,SEQ_IN_INDEX FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=${literal(db)} ORDER BY TABLE_NAME,INDEX_NAME,SEQ_IN_INDEX`,
      db,
    );
    const rules = await rows(
      `SELECT TABLE_NAME,CONSTRAINT_NAME,DELETE_RULE,UPDATE_RULE FROM information_schema.REFERENTIAL_CONSTRAINTS WHERE CONSTRAINT_SCHEMA=${literal(db)}`,
      db,
    );
    referentialRules = new Map(
      rules.rows.map(([table, name, del, update]) => [
        JSON.stringify([table, name]),
        [del, update],
      ]),
    );
    if (disposed) return;
    activeDB = db;
    model = relationModel(columns.rows, keys.rows, indexes.rows);
    positions = layouts[db] ??= {};
    cards.replaceChildren();
    svg.replaceChildren();
    for (const name of Object.keys(positions))
      if (!model.tables.has(name)) delete positions[name];
    const cardMap = new Map();
    const maxHeight = Math.max(
      120,
      ...[...model.tables.values()].map((fields) => 50 + fields.length * 28),
    );
    for (const [name, fields] of model.tables) {
      if (!positions[name]) {
        for (let slot = 0; slot < 250; slot++) {
          const candidate = {
            x: 35 + (slot % 3) * 360,
            y: 35 + Math.floor(slot / 3) * (maxHeight + 85),
          };
          const occupied = Object.entries(positions).some(
            ([other, p]) =>
              candidate.x < p.x + 335 &&
              candidate.x + 335 > p.x &&
              candidate.y <
                p.y + 65 + (model.tables.get(other)?.length ?? 0) * 28 &&
              candidate.y + 65 + fields.length * 28 > p.y,
          );
          if (!occupied) {
            positions[name] = candidate;
            break;
          }
        }
        positions[name] ??= { x: 35, y: 35 + 250 * (maxHeight + 85) };
      }
      const card = node("section", {
          class: "schema-table",
          "data-table": name,
        }),
        heading = node("div", {
          class: "schema-table-heading",
          role: "group",
          tabindex: "0",
          "aria-label": name + " : déplacer avec les flèches",
        }),
        button = node("button", { class: "schema-open" }, name);
      heading.append(button);
      button.onclick = () => openTable?.(activeDB, name);
      card.append(heading);
      heading.onkeydown = (e) => {
        const offsets = {
          ArrowLeft: [-20, 0],
          ArrowRight: [20, 0],
          ArrowUp: [0, -20],
          ArrowDown: [0, 20],
        };
        if (offsets[e.key]) {
          e.preventDefault();
          move(name, ...offsets[e.key]);
        }
      };
      heading.onpointerdown = (e) => {
        if (e.target.closest("button")) return;
        const start = { ...positions[name], x0: e.clientX, y0: e.clientY },
          zoom = Number($(".schema-zoom").value);
        heading.setPointerCapture(e.pointerId);
        heading.onpointermove = (m) => {
          positions[name] = {
            x: Math.min(
              8000,
              Math.max(0, start.x + (m.clientX - start.x0) / zoom),
            ),
            y: Math.min(
              8000,
              Math.max(0, start.y + (m.clientY - start.y0) / zoom),
            ),
          };
          place(card, name);
          drawEdges();
        };
        heading.onpointerup = heading.onpointercancel = () => {
          heading.onpointermove = null;
          fit();
        };
      };
      for (const field of fields) {
        const row = node("div", {
            class: "schema-field",
            "data-column": field.name,
          }),
          key = node(
            "span",
            { class: "key-kind" },
            field.key === "PRI"
              ? "PK"
              : model.relations.some(
                    (r) => r.from === name && r.columns.includes(field.name),
                  )
                ? "FK"
                : uniqueSingle(name).includes(field.name)
                  ? "UQ"
                  : "",
          ),
          col = node(
            "button",
            {
              class: "column-port",
              draggable: "true",
              "data-table": name,
              "data-column": field.name,
              "aria-label": `Relier ${name}.${field.name}`,
            },
            field.name,
          ),
          type = node(
            "span",
            { class: "column-type" },
            field.type + (field.nullable ? " ?" : ""),
          );
        row.append(key, col, type);
        card.append(row);
        col.ondragstart = (e) => {
          const data = { table: name, column: field.name };
          e.dataTransfer.setData(
            "application/x-pbl-column",
            JSON.stringify(data),
          );
          e.dataTransfer.setData("text/plain", name + "." + field.name);
          e.dataTransfer.effectAllowed = "link";
        };
        col.ondragover = (e) => {
          if ([...e.dataTransfer.types].includes("application/x-pbl-column")) {
            e.preventDefault();
            e.dataTransfer.dropEffect = "link";
          }
        };
        col.ondrop = (e) => {
          e.preventDefault();
          try {
            const source = JSON.parse(
              e.dataTransfer.getData("application/x-pbl-column"),
            );
            if (
              !model.tables
                .get(source.table)
                ?.some((f) => f.name === source.column)
            )
              return;
            const sourceUnique = uniqueSingle(source.table).includes(
              source.column,
            );
            openRelation(
              sourceUnique
                ? {
                    parent: source.table,
                    parentColumn: source.column,
                    child: name,
                    childColumn: field.name,
                  }
                : {
                    child: source.table,
                    childColumn: source.column,
                    parent: name,
                    parentColumn: field.name,
                  },
            );
          } catch (error) {
            message.textContent = error.message;
          }
        };
        col.onclick = () => {
          if (!connecting) {
            connecting = { table: name, column: field.name };
            message.textContent = `${name}.${field.name} sélectionnée. Cliquez sur la colonne à relier, ou Échap pour annuler.`;
            col.setAttribute("aria-pressed", "true");
          } else {
            const source = connecting;
            clearConnecting();
            const sourceUnique = uniqueSingle(source.table).includes(
              source.column,
            );
            openRelation(
              sourceUnique
                ? {
                    parent: source.table,
                    parentColumn: source.column,
                    child: name,
                    childColumn: field.name,
                  }
                : {
                    child: source.table,
                    childColumn: source.column,
                    parent: name,
                    parentColumn: field.name,
                  },
            );
          }
        };
      }
      cards.append(card);
      cardMap.set(name, card);
      place(card, name);
    }
    function fit() {
      const width = Math.max(
          1050,
          ...[...model.tables.keys()].map((n) => positions[n].x + 335),
        ),
        height = Math.max(
          450,
          ...[...model.tables].map(
            ([n, f]) => positions[n].y + 70 + f.length * 28,
          ),
        );
      canvas.style.width = width + "px";
      canvas.style.height = height + "px";
      svg.setAttribute("width", width);
      svg.setAttribute("height", height);
    }
    move = (name, dx, dy) => {
      positions[name] = {
        x: Math.max(0, Math.min(8000, positions[name].x + dx)),
        y: Math.max(0, Math.min(8000, positions[name].y + dy)),
      };
      place(cardMap.get(name), name);
      drawEdges();
      fit();
    };
    drawEdges = () => {
      svg.replaceChildren();
      const NS = "http://www.w3.org/2000/svg";
      const element = (tag, attrs, text) => {
        const n = document.createElementNS(NS, tag);
        for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
        if (text) n.textContent = text;
        return n;
      };
      for (const link of model.relations) {
        if (link.referencedDatabase !== activeDB || !positions[link.to])
          continue;
        const a = positions[link.from],
          b = positions[link.to],
          left = a.x <= b.x,
          same = link.from === link.to;
        const x1 = a.x + (left ? 310 : 0),
          x2 = b.x + (same ? 310 : left ? 0 : 310),
          y1 =
            a.y +
            49 +
            model.tables
              .get(link.from)
              .findIndex((c) => c.name === link.columns[0]) *
              28,
          y2 =
            b.y +
            49 +
            model.tables
              .get(link.to)
              .findIndex((c) => c.name === link.references[0]) *
              28,
          offset = Math.max(45, Math.abs(x2 - x1) / 2),
          curve = same
            ? `M ${x1} ${y1} C ${x1 + 90} ${y1}, ${x2 + 90} ${y2}, ${x2} ${y2}`
            : `M ${x1} ${y1} C ${x1 + (left ? offset : -offset)} ${y1}, ${x2 + (left ? -offset : offset)} ${y2}, ${x2} ${y2}`;
        const group = element("g", { "data-constraint": link.constraint }),
          path = element("path", {
            d: curve,
            fill: "none",
            class: "relation-edge",
          });
        path.append(
          element(
            "title",
            {},
            `${link.from} (${link.childRange}) → ${link.to} (${link.parentRange}) · ${link.constraint}`,
          ),
        );
        group.append(
          path,
          element(
            "text",
            {
              x: x1 + (left ? 8 : -(link.childRange.length * 7 + 8)),
              y: y1 - 7,
              class: "cardinality",
            },
            link.childRange,
          ),
          element(
            "text",
            {
              x:
                x2 + (same ? 8 : left ? -(link.parentRange.length * 7 + 8) : 8),
              y: y2 - 7,
              class: "cardinality",
            },
            link.parentRange,
          ),
        );
        svg.append(group);
      }
      for (const junction of model.junctions) {
        const a = positions[junction.left],
          b = positions[junction.right];
        if (!a || !b) continue;
        const x1 = a.x + 155,
          x2 = b.x + 155,
          y = Math.max(12, Math.min(a.y, b.y) - 20),
          group = element("g", { "data-junction": junction.table });
        group.append(
          element("path", {
            d: `M ${x1} ${a.y} V ${y} H ${x2} V ${b.y}`,
            fill: "none",
            class: "junction-edge",
          }),
          element(
            "text",
            {
              x: (x1 + x2) / 2,
              y: y - 4,
              class: "cardinality",
              "text-anchor": "middle",
            },
            "N–N · " + junction.table,
          ),
        );
        svg.append(group);
      }
    };
    drawEdges();
    fit();
    const text = $(".relations-text");
    text.replaceChildren();
    for (const link of model.relations) {
      const row = node("div", { class: "relation-row" }),
        label = node(
          "span",
          {},
          `${link.from} (${link.columns.join(", ")}) [${link.childRange}] → ${link.referencedDatabase}.${link.to} (${link.references.join(", ")}) [${link.parentRange}]`,
        ),
        drop = node("button", {}, "Supprimer la relation");
      drop.onclick = () =>
        ddl.open({
          heading: "Supprimer " + link.constraint,
          db: activeDB,
          statement: `ALTER TABLE ${q(link.from)} DROP FOREIGN KEY ${q(link.constraint)}`,
        });
      const edit = node("button", {}, "Modifier");
      edit.disabled = link.referencedDatabase !== activeDB;
      edit.onclick = () =>
        openRelation({ child: link.from, parent: link.to, existing: link });
      row.append(label, edit, drop);
      text.append(row);
    }
    for (const junction of model.junctions)
      text.append(
        node(
          "p",
          { class: "junction-note" },
          `${junction.left} N–N ${junction.right} · table de liaison : ${junction.table}`,
        ),
      );
    text.prepend(
      node(
        "p",
        { class: "hint" },
        "Les extrémités donnent les multiplicités autorisées. 0..N côté enfant ; 1 ou 0..1 côté parent selon NULL. Une clé étrangère ne garantit pas qu’un parent possède au moins un enfant. N–N est déduit des tables de liaison.",
      ),
    );
    message.textContent = model.tables.size
      ? `${model.tables.size} tables · ${model.relations.length} clés étrangères. Glissez une clé vers la colonne à relier, ou cliquez successivement sur deux colonnes.`
      : "Aucune table dans cette base. Créez une table dans Base de données.";
  }
  function place(card, name) {
    card.style.left = positions[name].x + "px";
    card.style.top = positions[name].y + "px";
  }
  function clearConnecting() {
    connecting = null;
    for (const n of container.querySelectorAll("[aria-pressed]"))
      n.removeAttribute("aria-pressed");
  }
  container.addEventListener("keydown", (e) => {
    if (e.key === "Escape") clearConnecting();
  });
  $(".refresh").onclick = () => run(refresh);
  $(".new-relation").onclick = () => openRelation();
  $(".junction").onclick = () => openRelation({ manyToMany: true });
  $(".arrange").onclick = () =>
    run(async () => {
      layouts[database.value] = {};
      await refresh();
    });
  $(".schema-zoom").onchange = () => {
    canvas.style.zoom = $(".schema-zoom").value;
  };
  database.onchange = () => run(refresh);
  return {
    snapshot: () => ({ database: database.value, layouts }),
    refresh,
    async setDatabase(db) {
      const all = await rows("SHOW DATABASES");
      database.replaceChildren(...all.rows.map((r) => option(r[0])));
      database.value = db;
      await refresh();
    },
    dispose() {
      disposed = true;
      ddl.dispose();
    },
  };
}
