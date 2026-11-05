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
export function rowConstraintError(error, columns) {
  const messages = {
    1366: "Cette valeur ne correspond pas au type de la colonne.",
    1264: "Cette valeur dépasse les limites de la colonne.",
    1406: "Ce texte est trop long pour cette colonne.",
    1048: "Cette colonne ne peut pas être vide (NULL).",
    1292: "Cette valeur n’a pas le format attendu.",
    1062: "Cette valeur existe déjà dans une clé unique. Choisissez une autre valeur.",
    1452: "La valeur liée n’existe pas dans la table de référence.",
    4025: "Cette ligne ne respecte pas une contrainte de la table.",
  };
  const message = messages[error.errno];
  if (!message) return null;
  const match =
    /for column ['`"]([^'`"]+)['`"]|Column ['`"]([^'`"]+)['`"]/i.exec(
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
