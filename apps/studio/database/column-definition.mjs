/** Parse only SHOW CREATE column boundaries; keep unknown server attributes byte-for-byte. */
import { identifier, literal } from "./sql-values.mjs";
export function columnDefinitions(ddl) {
  let start = -1,
    prefixQuote = "";
  for (let i = 0; i < ddl.length; i++) {
    const c = ddl[i];
    if (prefixQuote) {
      if (c === "\\") {
        i++;
        continue;
      }
      if (c === prefixQuote) {
        if (ddl[i + 1] === prefixQuote) i++;
        else prefixQuote = "";
      }
    } else if (c === "`" || c === "'" || c === '"') prefixQuote = c;
    else if (c === "(") {
      start = i;
      break;
    }
  }
  if (start < 0) return new Map();
  let depth = 1,
    quote = "",
    begin = start + 1;
  const parts = [];
  for (let i = start + 1; i < ddl.length; i++) {
    const c = ddl[i];
    if (quote) {
      if (c === "\\") {
        i++;
        continue;
      }
      if (c === quote) {
        if (ddl[i + 1] === quote) i++;
        else quote = "";
      }
      continue;
    }
    if (c === "'" || c === '"' || c === "`") {
      quote = c;
      continue;
    }
    if (c === "(") depth++;
    else if (c === ")") {
      if (--depth === 0) {
        parts.push(ddl.slice(begin, i));
        break;
      }
    } else if (c === "," && depth === 1) {
      parts.push(ddl.slice(begin, i));
      begin = i + 1;
    }
  }
  const result = new Map();
  for (const part of parts) {
    const match = /^\s*`((?:``|[^`])+)`\s+([\s\S]+)$/.exec(part);
    if (match) result.set(match[1].replace(/``/g, "`"), match[2].trim());
  }
  return result;
}
export function validateType(type) {
  type = String(type).trim().toUpperCase();
  const integer =
    /^(TINYINT|SMALLINT|MEDIUMINT|INT|INTEGER|BIGINT)(?:\(\d{1,3}\))?(?: UNSIGNED)?(?: ZEROFILL)?$/;
  if (
    integer.test(type) ||
    /^(TEXT|TINYTEXT|MEDIUMTEXT|LONGTEXT|BLOB|TINYBLOB|MEDIUMBLOB|LONGBLOB|JSON|DATE|YEAR|BOOLEAN|BOOL|FLOAT|DOUBLE|REAL)$/.test(
      type,
    ) ||
    /^(DATETIME|TIMESTAMP|TIME)(?:\([0-6]\))?$/.test(type)
  )
    return type;
  let match = /^(CHAR|VARCHAR|BINARY|VARBINARY)\((\d+)\)$/.exec(type);
  if (match && +match[2] > 0 && +match[2] <= 65535) return type;
  match = /^(DECIMAL|NUMERIC)\((\d+),(\d+)\)(?: UNSIGNED)?$/.exec(type);
  if (
    match &&
    +match[2] >= 1 &&
    +match[2] <= 65 &&
    +match[3] <= 38 &&
    +match[3] <= +match[2]
  )
    return type;
  match = /^BIT\((\d+)\)$/.exec(type);
  if (match && +match[1] >= 1 && +match[1] <= 64) return type;
  // ENUM / SET literals are handled separately without uppercasing their values.
  throw Error(
    "Type invalide. Vérifiez longueur, précision et échelle. Pour un type avancé, utilisez la définition SQL.",
  );
}
export function buildColumn(c) {
  if (!c.name || c.name.length > 64 || /[\x00-\x1f]/.test(c.name))
    throw Error("Nom de colonne requis, 64 caractères maximum.");
  let type;
  if (/^(ENUM|SET)$/i.test(c.type)) {
    let values;
    try {
      values = JSON.parse(c.values);
    } catch {
      throw Error("ENUM/SET : fournissez une liste JSON de textes.");
    }
    if (
      !Array.isArray(values) ||
      !values.length ||
      values.some((v) => typeof v !== "string" || v.length > 65535)
    )
      throw Error("ENUM/SET : liste de textes requise.");
    type =
      c.type.toUpperCase() +
      "(" +
      values
        .map((v) => "'" + v.replace(/\\/g, "\\\\").replace(/'/g, "''") + "'")
        .join(",") +
      ")";
  } else type = validateType(c.type);
  if (
    c.auto &&
    !/^(TINYINT|SMALLINT|MEDIUMINT|INT|INTEGER|BIGINT)\b/.test(type)
  )
    throw Error("AUTO_INCREMENT nécessite une colonne entière et indexée.");
  if (c.auto && c.defaultMode && c.defaultMode !== "none")
    throw Error(
      "AUTO_INCREMENT ne peut pas avoir de valeur par défaut explicite.",
    );
  if (c.defaultMode === "null" && !c.nullable)
    throw Error("DEFAULT NULL nécessite une colonne nullable.");
  let sql = identifier(c.name) + " " + type;
  for (const key of ["charset", "collation"])
    if (c[key]) {
      if (!/^[a-zA-Z0-9_]+$/.test(c[key]))
        throw Error("Jeu de caractères ou collation invalide.");
      sql += (key === "charset" ? " CHARACTER SET " : " COLLATE ") + c[key];
    }
  sql += c.nullable ? " NULL" : " NOT NULL";
  if (c.defaultMode === "null") sql += " DEFAULT NULL";
  else if (c.defaultMode === "literal")
    sql += " DEFAULT (" + literal(c.defaultValue ?? "") + ")";
  else if (c.defaultMode === "expression") {
    if (
      !/^(CURRENT_TIMESTAMP(?:\([0-6]?\))?|CURRENT_DATE(?:\(\))?|CURRENT_TIME(?:\([0-6]?\))?)$/i.test(
        c.defaultValue,
      )
    )
      throw Error(
        "Expression de défaut : CURRENT_TIMESTAMP, CURRENT_DATE ou CURRENT_TIME uniquement.",
      );
    sql += " DEFAULT " + c.defaultValue;
  }
  if (c.auto) sql += " AUTO_INCREMENT";
  if (c.onUpdate) {
    if (!/^CURRENT_TIMESTAMP(?:\([0-6]?\))?$/i.test(c.onUpdate))
      throw Error("ON UPDATE : utilisez CURRENT_TIMESTAMP.");
    sql += " ON UPDATE " + c.onUpdate;
  }
  if (c.comment)
    sql +=
      " COMMENT " +
      "'" +
      String(c.comment).replace(/\\/g, "\\\\").replace(/'/g, "''") +
      "'";
  if (c.key === "PRIMARY" || c.primary) sql += " PRIMARY KEY";
  else if (c.key === "UNIQUE") sql += " UNIQUE";
  return sql;
}
/** Change only the requested type/nullability. Quoted DEFAULT and COMMENT contents are untouched. */
export function patchColumn(definition, { type, nullable } = {}) {
  if (!definition)
    throw Error("Définition actuelle absente : rechargez la structure.");
  let out = definition;
  if (type) {
    const current =
      /^[a-zA-Z]+(?:\((?:[^()'"\\]|'(?:''|\\.|[^'])*'|"(?:""|\\.|[^"])*")*\))?(?:\s+UNSIGNED)?(?:\s+ZEROFILL)?/i.exec(
        out,
      );
    if (!current) throw Error("Type actuel non reconnu.");
    out = validateType(type) + out.slice(current[0].length);
  }
  if (nullable !== undefined) {
    const tokens = [
      ...out.matchAll(
        /'(?:''|\\.|[^'])*'|"(?:""|\\.|[^"])*"|`(?:``|[^`])*`|\b[A-Za-z_]+\b/g,
      ),
    ];
    let found;
    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];
      if (
        token[0].toUpperCase() === "NULL" &&
        tokens[i - 1]?.[0].toUpperCase() !== "DEFAULT"
      ) {
        const previous = tokens[i - 1];
        found = {
          from:
            previous?.[0].toUpperCase() === "NOT"
              ? previous.index
              : token.index,
          to: token.index + 4,
        };
        break;
      }
    }
    const value = nullable ? "NULL" : "NOT NULL";
    out = found
      ? out.slice(0, found.from) + value + out.slice(found.to)
      : out + " " + value;
  }
  return out;
}
