/** Validate exact integer text without rounding BIGINT values through Number. */
export function columnValueError(column, value) {
  const match = /^(tinyint|smallint|mediumint|int|integer|bigint)\b/i.exec(
    column.type,
  );
  if (!match) return "";
  if (!/^[+-]?\d+$/.test(value.trim()))
    return "Saisissez un nombre entier, par exemple 42.";
  const bits = {
    tinyint: 8,
    smallint: 16,
    mediumint: 24,
    int: 32,
    integer: 32,
    bigint: 64,
  }[match[1].toLowerCase()];
  const unsigned = /\bunsigned\b/i.test(column.type),
    n = BigInt(value.trim());
  const min = unsigned ? 0n : -(1n << BigInt(bits - 1));
  const max = (1n << BigInt(unsigned ? bits : bits - 1)) - 1n;
  return n < min || n > max
    ? `Saisissez un entier entre ${min} et ${max}.`
    : "";
}
export function rowConstraintError(error, columns, indexes = []) {
  const messages = {
    1265: "Cette valeur n’est pas acceptée par le type ou les choix de cette colonne.",
    1364: "Cette colonne est obligatoire et n’a pas de valeur par défaut.",
    1366: "Cette valeur ne correspond pas au type de la colonne.",
    1264: "Cette valeur dépasse les limites de la colonne.",
    1406: "Ce texte est trop long pour cette colonne.",
    1048: "Cette colonne ne peut pas être vide (NULL).",
    1292: "Cette valeur n’a pas le format attendu.",
    1062: "Cette valeur existe déjà dans une clé unique. Choisissez une autre valeur.",
    1451: "Cette ligne est encore utilisée par une autre table. Modifiez ses liens avant de réessayer.",
    1452: "La valeur liée n’existe pas dans la table de référence.",
    4025: "Cette ligne ne respecte pas une contrainte de la table.",
  };
  const message = messages[error.errno];
  if (!message) return null;
  if (Number(error.errno) === 1062) {
    const key = /for key ['`"]([^'`"]+)['`"]/i.exec(error.message)?.[1];
    const exact = indexes.find((index) => index.name === key);
    const candidates = indexes.filter((index) =>
      key?.endsWith("." + index.name),
    );
    const index = exact ?? (candidates.length === 1 ? candidates[0] : null);
    if (index?.columns.length)
      return {
        message:
          index.columns.length > 1
            ? "Cette combinaison de valeurs existe déjà pour " +
              index.columns.join(", ") +
              "."
            : message,
        column: index.columns[0],
      };
  }
  const match =
    /for column ['`"]([^'`"]+)['`"]|(?:Column|Field) ['`"]([^'`"]+)['`"]/i.exec(
      error.message,
    );
  const column = columns.find((c) => c.name === (match?.[1] ?? match?.[2]));
  return { message, column: column?.name };
}
/** Browser layout delivery notifications have no exception; real errors still surface. */
export function isResizeDeliveryNotification(event) {
  return (
    !event.error &&
    /^(ResizeObserver loop completed with undelivered notifications\.|ResizeObserver loop limit exceeded)$/.test(
      event.message,
    )
  );
}

export function foreignKeyIssue(
  error,
  { tables, table, row = {}, operation = "update" },
) {
  if (![1451, 1452].includes(Number(error.errno))) return null;
  const childDatabase = /fails \(`([^`]+)`\./i.exec(error.message)?.[1];
  const parentDatabase = /REFERENCES `([^`]+)`\./i.exec(error.message)?.[1];
  if (parentDatabase && parentDatabase !== childDatabase) return null;
  const name = /CONSTRAINT `((?:``|[^`])+)`/i
    .exec(error.message)?.[1]
    ?.replaceAll("``", "`");
  const childName = /fails \(`(?:``|[^`])+`\.`((?:``|[^`])+)`/i
    .exec(error.message)?.[1]
    ?.replaceAll("``", "`");
  const candidates = tables.flatMap((child) =>
    child.fks
      .filter(
        (fk) =>
          (!name || fk.name === name) &&
          (!childName || child.name === childName) &&
          (Number(error.errno) === 1452
            ? child.name === table.name
            : fk.refTable === table.name),
      )
      .map((fk) => ({ child, fk })),
  );
  if (candidates.length !== 1) return null;
  const { child, fk } = candidates[0],
    columns = fk.columns ?? [fk.column],
    refs = fk.refColumns ?? [fk.refColumn];
  if (Number(error.errno) === 1452)
    return {
      column: columns[0],
      message: `Cette valeur ne correspond à aucune ligne de « ${fk.refTable} » (${refs.join(", ")}). Choisissez une valeur existante ou créez d’abord la ligne référencée.`,
      navigation: { table: fk.refTable },
    };
  const filter =
    columns.length === 1 && row[refs[0]] != null
      ? { c: columns[0], op: "=", v: row[refs[0]] }
      : null;
  return {
    message: `${operation === "delete" ? "Suppression" : "Modification"} bloquée : des lignes de « ${child.name} » utilisent cette clé. Corrigez leurs liens avant de réessayer, ou configurez explicitement leur propagation.`,
    navigation: { table: child.name, filter },
    relation: {
      child: child.name,
      parent: fk.refTable,
      ...fk,
      ...(operation === "delete"
        ? { onDelete: "CASCADE" }
        : { onUpdate: "CASCADE" }),
    },
  };
}
