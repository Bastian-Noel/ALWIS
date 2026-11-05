import { parsers } from "prettier/plugins/html";
import { htmlVoidStyle } from "./html-style.mjs";
const raw = new Set(["pre", "textarea", "script", "style"]);
const inline = new Set(
  "a abbr b bdi bdo cite code em i kbd mark q s small span strong sub sup time u var wbr".split(
    " ",
  ),
);
const textContainers = new Set(
  "p h1 h2 h3 h4 h5 h6 title button option legend summary".split(" "),
);
const name = (n) => n.name?.toLowerCase();
const phrasing = (n) =>
  n.kind !== "element" || (inline.has(name(n)) && n.children.every(phrasing));
/** Lay out structural markup without separating inline words or rewriting raw content. */
export async function formatTemplateHtml(text, format, options) {
  let prefix = "alwishtmlisland";
  while (text.includes(prefix)) prefix += "x";
  const islands = [];
  const save = (from, to, exact) =>
    islands.push({
      from,
      to,
      exact,
      token: `<!--${prefix}${islands.length}-->`,
    });
  function visit(node) {
    if (node.kind === "element" && raw.has(name(node))) {
      save(node.sourceSpan.start.offset, node.sourceSpan.end.offset, true);
      return;
    }
    if (
      node.kind === "element" &&
      textContainers.has(name(node)) &&
      node.children.every(phrasing)
    ) {
      save(node.sourceSpan.start.offset, node.sourceSpan.end.offset, false);
      return;
    }
    const children = node.children ?? [];
    for (let i = 0; i < children.length;) {
      const child = children[i];
      if (
        child.kind === "text" ||
        (child.kind === "element" && inline.has(name(child)) && phrasing(child))
      ) {
        let j = i,
          hasElement = false;
        while (
          j < children.length &&
          (children[j].kind === "text" ||
            (children[j].kind === "element" &&
              inline.has(name(children[j])) &&
              phrasing(children[j])))
        ) {
          hasElement ||= children[j].kind === "element";
          j++;
        }
        if (hasElement) {
          // Keep whitespace outside the group available to the structural printer.
          while (
            i < j &&
            children[i].kind === "text" &&
            !children[i].value.trim()
          )
            i++;
          while (
            j > i &&
            children[j - 1].kind === "text" &&
            !children[j - 1].value.trim()
          )
            j--;
          if (j > i) {
            let from = children[i].sourceSpan.start.offset,
              to = children[j - 1].sourceSpan.end.offset;
            const value = text.slice(from, to);
            from += value.match(/^\s*/)[0].length;
            to -= value.match(/\s*$/)[0].length;
            save(from, to, true);
          }
          i = Math.max(i + 1, j);
        } else i = j;
      } else {
        visit(child);
        i++;
      }
    }
  }
  visit(parsers.html.parse(text));
  for (const island of islands) {
    const source = text.slice(island.from, island.to);
    island.value = island.exact
      ? source
      : (
          await format(source, {
            ...options,
            parser: "html",
            htmlWhitespaceSensitivity: "css",
            embeddedLanguageFormatting: "off",
          })
        ).trimEnd();
  }
  let masked = text;
  for (const island of [...islands].sort((a, b) => b.from - a.from))
    masked =
      masked.slice(0, island.from) + island.token + masked.slice(island.to);
  let result = htmlVoidStyle(
    await format(masked, {
      ...options,
      parser: "html",
      htmlWhitespaceSensitivity: "ignore",
      embeddedLanguageFormatting: "off",
    }),
  );
  for (const island of islands) {
    const at = result.indexOf(island.token);
    if (at < 0 || result.indexOf(island.token, at + island.token.length) !== -1)
      throw Error("Une zone de texte HTML ne peut pas être restaurée.");
    const indent = result
      .slice(result.lastIndexOf("\n", at) + 1, at)
      .match(/^[ \t]*/)[0];
    // Raw contents, including their closing-line whitespace, stay byte-for-byte intact.
    const attributeRanges = [];
    function attributes(node) {
      for (const attr of node.attrs ?? [])
        if (attr.valueSpan)
          attributeRanges.push([
            attr.valueSpan.start.offset,
            attr.valueSpan.end.offset,
          ]);
      for (const child of node.children ?? []) attributes(child);
    }
    if (!island.exact) attributes(parsers.html.parse(island.value));
    let offset = 0;
    const value = island.exact
      ? island.value
      : island.value
          .split("\n")
          .map((line, i) => {
            const literal = attributeRanges.some(
              ([a, b]) => offset >= a && offset <= b,
            );
            offset += line.length + 1;
            return i && !literal ? indent + line : line;
          })
          .join("\n");
    result = result.replace(island.token, () => value);
  }
  return htmlVoidStyle(result);
}
