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
