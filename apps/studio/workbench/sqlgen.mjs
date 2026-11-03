import { identifier, literal } from "../database/sql-values.mjs";
import { buildColumn } from "../database/column-definition.mjs";
/** Génération SQL pure : l'interface ne parle au moteur qu'en SQL. Aucune dépendance au DOM. */
export const id = identifier,
  lit = literal;
export const where = (pairs) =>
  pairs
    .map(([c, v]) =>
      v === null ? `${id(c)} IS NULL` : `${id(c)} <=> ${lit(v)}`,
    )
    .join(" AND ");
export const OPS = ["=", "!=", "<", ">", "LIKE", "IS NULL", "IS NOT NULL"];
export const filterSql = (f) =>
  !f
    ? ""
    : f.op === "IS NULL" || f.op === "IS NOT NULL"
      ? `${id(f.c)} ${f.op}`
      : f.op === "LIKE"
        ? `${id(f.c)} LIKE ${lit("%" + f.v + "%")}`
        : `${id(f.c)} ${f.op} ${lit(f.v)}`;
export const select = (
  t,
  { filter, sort, limit = 100, offset = 0, count } = {},
) =>
  `SELECT ${count ? "COUNT(*)" : "*"} FROM ${id(t)}${filter ? " WHERE " + filterSql(filter) : ""}` +
  (!count && sort
    ? ` ORDER BY ${id(sort.c)} ${sort.d < 0 ? "DESC" : "ASC"}`
    : "") +
  (count ? "" : ` LIMIT ${limit} OFFSET ${offset}`) +
  ";";
export const insert = (t, cols, vals) =>
  cols.length
    ? `INSERT INTO ${id(t)} (${cols.map(id).join(", ")}) VALUES (${vals.map(lit).join(", ")});`
    : `INSERT INTO ${id(t)} () VALUES ();`;
export const update = (t, c, v, key) =>
  `UPDATE ${id(t)} SET ${id(c)} = ${lit(v)} WHERE ${where(key)} LIMIT 1;`;
export const remove = (t, key) =>
  `DELETE FROM ${id(t)} WHERE ${where(key)} LIMIT 1;`;
const colDef = (c) =>
  buildColumn({
    ...c,
    nullable: c.nullable ?? !!c.nul,
    auto: !!c.ai,
    defaultMode: c.defaultMode ?? "none",
  });
export const createTable = (name, cols) =>
  `CREATE TABLE ${id(name)} (\n${[
    ...cols.map((c) => "  " + colDef(c)),
    ...(cols.some((c) => c.pk)
      ? [
          `  PRIMARY KEY (${cols
            .filter((c) => c.pk)
            .map((c) => id(c.name))
            .join(", ")})`,
        ]
      : []),
  ].join(",\n")}\n) ENGINE=InnoDB;`;
export const quickTable = (name) =>
  createTable(name, [{ name: "id", type: "INT", nul: 0, ai: 1, pk: 1 }]);
export const addColumn = (t, c) =>
  `ALTER TABLE ${id(t)} ADD COLUMN ${colDef(c)};`;
export const modifyColumn = (t, c) =>
  `ALTER TABLE ${id(t)} MODIFY COLUMN ${colDef(c)};`;
export const dropColumn = (t, n) =>
  `ALTER TABLE ${id(t)} DROP COLUMN ${id(n)};`;
export const renameColumn = (t, a, b) =>
  `ALTER TABLE ${id(t)} RENAME COLUMN ${id(a)} TO ${id(b)};`;
export const fkName = (t, c) => `fk_${t}_${c}`;
export const addFk = (
  t,
  {
    col,
    ref,
    refCol = "id",
    onDelete = "RESTRICT",
    onUpdate = "CASCADE",
    name,
  },
) =>
  `ALTER TABLE ${id(t)} ADD CONSTRAINT ${id(name || fkName(t, col))} FOREIGN KEY (${id(col)}) REFERENCES ${id(ref)} (${id(refCol)}) ON DELETE ${onDelete} ON UPDATE ${onUpdate};`;
export const dropFk = (t, name) =>
  `ALTER TABLE ${id(t)} DROP FOREIGN KEY ${id(name)};`;
export const addIndex = (t, name, cols, unique) =>
  `ALTER TABLE ${id(t)} ADD ${unique ? "UNIQUE " : ""}INDEX ${id(name)} (${cols.map(id).join(", ")});`;
export const dropIndex = (t, name) =>
  `ALTER TABLE ${id(t)} DROP INDEX ${id(name)};`;
export const dropTable = (t) => `DROP TABLE ${id(t)};`;
export const truncate = (t) => `TRUNCATE TABLE ${id(t)};`;
export const createDb = (n) => `CREATE DATABASE IF NOT EXISTS ${id(n)};`;
export const dropDb = (n) => `DROP DATABASE ${id(n)};`;
/** Table de liaison N–N : deux clés étrangères et une clé primaire composée. */
export function joinTable(name, a, b, catalog) {
  if (a === b) throw Error("Choisissez deux tables distinctes.");
  const keys = (parent) => {
    const t = catalog?.find((t) => t.name === parent);
    if (!t) throw Error("Table parente absente.");
    const pk = t.indexes.find((i) => i.name === "PRIMARY");
    if (!pk?.columns.length)
      throw Error("Chaque table doit avoir une clé primaire.");
    return pk.columns.map((column) => {
      const c = t.columns.find((c) => c.name === column);
      return { name: parent + "_" + column, type: c.type, ref: column };
    });
  };
  const x = keys(a),
    y = keys(b);
  if ([...x, ...y].some((c) => c.name.length > 64))
    throw Error("Noms de colonnes de liaison trop longs.");
  const fk = (parent, cols) =>
    `FOREIGN KEY (${cols.map((c) => id(c.name)).join(",")}) REFERENCES ${id(parent)} (${cols.map((c) => id(c.ref)).join(",")}) ON DELETE CASCADE ON UPDATE CASCADE`;
  return `CREATE TABLE ${id(name)} (${[...x, ...y].map((c) => id(c.name) + " " + c.type + " NOT NULL").join(",")}, PRIMARY KEY (${[...x, ...y].map((c) => id(c.name)).join(",")}),${fk(a, x)},${fk(b, y)}) ENGINE=InnoDB;`;
}
export const family = (t) =>
  /bool|tinyint\(1\)/i.test(t)
    ? "bool"
    : /int|serial/i.test(t)
      ? "int"
      : /decimal|numeric|float|double/i.test(t)
        ? "num"
        : /date|time|year/i.test(t)
          ? "date"
          : /blob|binary/i.test(t)
            ? "bin"
            : "str";
