/** Small policies shared by the UI and tests. No second language engine. */
export const templates = {
  php: [
    [
      "foreach",
      "foreach (${1:$items} as ${2:$item}) {\n\t${0}\n}",
      "Parcourir une collection",
    ],
    [
      "if",
      "if (${1:condition}) {\n\t${0}\n}",
      "Exécuter un bloc sous condition",
    ],
    [
      "for",
      "for (${1:$i = 0}; ${2:$i < 10}; ${3:$i++}) {\n\t${0}\n}",
      "Boucle avec initialisation, condition et incrément",
    ],
    [
      "function",
      "function ${1:nom}(${2}) {\n\t${0}\n}",
      "Déclarer une fonction",
    ],
    [
      "try",
      "try {\n\t${1}\n} catch (\\Throwable ${2:$error}) {\n\t${0}\n}",
      "Intercepter une exception",
    ],
    ["while", "while (${1:condition}) {\n\t${0}\n}", "Boucle conditionnelle"],
  ],
  js: [
    [
      "for",
      "for (${1:let i = 0}; ${2:i < items.length}; ${3:i++}) {\n\t${0}\n}",
      "Boucle avec compteur",
    ],
    [
      "foreach",
      "${1:items}.forEach((${2:item}) => {\n\t${0}\n});",
      "Parcourir une collection",
    ],
    ["while", "while (${1:condition}) {\n\t${0}\n}", "Boucle conditionnelle"],
    ["if", "if (${1:condition}) {\n\t${0}\n}", "Bloc conditionnel"],
    [
      "forof",
      "for (const ${1:item} of ${2:items}) {\n\t${0}\n}",
      "Parcourir une collection",
    ],
    [
      "function",
      "function ${1:name}(${2}) {\n\t${0}\n}",
      "Déclarer une fonction",
    ],
    [
      "try",
      "try {\n\t${1}\n} catch (${2:error}) {\n\t${0}\n}",
      "Intercepter une exception",
    ],
  ],
};
export function documentation(value) {
  if (typeof value === "string") return value.slice(0, 6000);
  if (Array.isArray(value))
    return value.map(documentation).join("\n").slice(0, 6000);
  return String(value?.value ?? "").slice(0, 6000);
}
// Only translate the common LSP subset. Never insert unsupported transforms literally.
export function snippetTemplate(text) {
  if (/\$\{\d+[/|]/.test(text) || /\$(?:[A-Z_]+|\{[A-Z_]+)/.test(text))
    return null;
  return text.replace(/(?<!\\)\$(\d+)/g, "${$1}");
}
export function rankOptions(options, prefix, variableOnly = false) {
  const seen = new Set();
  return options
    .filter((item) => {
      if (seen.has(item.label)) return false;
      if (variableOnly && !item.label.startsWith("$")) return false;
      if (prefix && !item.label.toLowerCase().includes(prefix.toLowerCase()))
        return false;
      seen.add(item.label);
      return true;
    })
    .map((item) => ({
      ...item,
      boost: Math.min(
        99,
        (item.boost ?? 0) +
          (item.label === prefix
            ? 40
            : item.label.toLowerCase().startsWith(prefix.toLowerCase())
              ? 20
              : 0),
      ),
    }));
}
export function textEdits(text, edits, offsetAt) {
  const changes = edits
    .map((edit) => ({
      from: offsetAt(text, edit.range.start),
      to: offsetAt(text, edit.range.end),
      insert: edit.newText,
    }))
    .sort((a, b) => a.from - b.from);
  if (
    changes.some(
      (c, i) => c.from > c.to || (i > 0 && c.from < changes[i - 1].to),
    )
  )
    throw Error("Modifications de langage incompatibles.");
  return changes;
}
