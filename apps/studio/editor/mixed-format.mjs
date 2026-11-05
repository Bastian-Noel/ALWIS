import { formatTemplateHtml } from "./template-html.mjs";
import { php } from "@codemirror/lang-php";
import { parsers } from "prettier/plugins/html";

const parser = php().language.parser;
const rawTags = new Set(["pre", "textarea", "script", "style"]);
const containers = new Set([
  "html",
  "head",
  "body",
  "main",
  "section",
  "article",
  "aside",
  "nav",
  "div",
  "form",
  "fieldset",
  "ul",
  "ol",
  "table",
  "thead",
  "tbody",
  "tfoot",
  "tr",
  "select",
  "optgroup",
]);
const scopesOf = (node) => {
  const scopes = [];
  for (let p = node.parent; p; p = p.parent)
    if (p.name === "Block" || p.name === "ColonBlock") scopes.unshift(p.from);
  return scopes;
};
function phpSpans(text) {
  const spans = [];
  let start = null;
  parser.parse(text).iterate({
    enter(n) {
      if (n.name === "PhpOpen") start = n.from;
      if (n.name === "PhpClose" && start !== null) {
        spans.push({
          from: start,
          to: n.to,
          closed: true,
          after: scopesOf(n.node),
        });
        start = null;
      }
    },
  });
  if (start !== null)
    spans.push({ from: start, to: text.length, closed: false, after: [] });
  return spans;
}
function sharedDepth(a, b) {
  let n = 0;
  while (n < a.length && n < b.length && a[n] === b[n]) n++;
  return n;
}
function protectedHtml(text) {
  const ranges = [],
    contexts = [];
  function walk(node, parent = null, raw = false) {
    if (node.kind === "element") {
      const start = node.startSourceSpan?.end.offset,
        end = node.endSourceSpan?.start.offset;
      const ownRaw = rawTags.has(node.name?.toLowerCase());
      if (ownRaw && start != null && end != null) ranges.push([start, end]);
      if (node.startSourceSpan)
        contexts.push({
          from: node.startSourceSpan.start.offset,
          to: start,
          kind: "tag",
        });
      if (node.endSourceSpan)
        contexts.push({
          from: end,
          to: node.endSourceSpan.end.offset,
          kind: "tag",
        });
      for (const attr of node.attrs ?? [])
        if (attr.valueSpan)
          ranges.push([attr.valueSpan.start.offset, attr.valueSpan.end.offset]);
      raw ||= ownRaw;
    }
    if (node.kind === "text")
      contexts.push({
        from: node.sourceSpan.start.offset,
        to: node.sourceSpan.end.offset,
        kind: raw ? "raw" : "text",
        parent: parent?.name?.toLowerCase(),
      });
    for (const child of node.children ?? []) walk(child, node, raw);
  }
  walk(parsers.html.parse(text));
  return { ranges, contexts };
}
function normalizeBlock(block) {
  // The PHP formatter preserves an old newline after <?php even for endforeach.
  if (
    /^<\?php\s*(?:end(?:if|foreach|for|while|switch|declare)\s*;|else\s*:)\s*\?>$/i.test(
      block,
    )
  )
    return block.replace(/\s+/g, " ");
  if (block.includes("\n")) {
    const eol = block.includes("\r\n") ? "\r\n" : "\n";
    if (block.startsWith("<?php"))
      block = "<?php" + eol + block.slice(5).trimStart();
    if (block.endsWith("?>")) block = block.slice(0, -2).trimEnd() + eol + "?>";
  }
  return block;
}
function indentBlock(block, prefix) {
  const literals = [];
  parser.parse(block).iterate({
    enter(n) {
      if (/String$/.test(n.name)) {
        literals.push([n.from, n.to]);
        return false;
      }
    },
  });
  let offset = 0;
  return block
    .split("\n")
    .map((line, i) => {
      const protectedLine = literals.some(([a, b]) => offset > a && offset < b);
      offset += line.length + 1;
      return i && line && !protectedLine ? prefix + line : line;
    })
    .join("\n");
}

/** Format PHP in its own syntax tree, HTML in its own tree, then restore islands.
 * No PHP source is ever passed as an HTML attribute or interpreted as JavaScript.
 */
export async function formatMixedHtml(text, format, options) {
  const original = phpSpans(text);
  if (!original.length) return formatTemplateHtml(text, format, options);
  let cursor = 0,
    hasHtml = false;
  for (const span of original) {
    hasHtml ||= !!text.slice(cursor, span.from).trim();
    cursor = span.to;
  }
  hasHtml ||= !!text.slice(cursor).trim();
  if (!hasHtml) return format(text, { ...options, parser: "php" });
  let prefix = "alwisphpx";
  while (text.includes(prefix)) prefix += "x";
  // HTML length must not determine wrapping inside PHP expressions.
  const skeleton = original
    .map(
      (s, i) =>
        text.slice(s.from, s.to) +
        (s.closed ? "\n" + prefix + "html" + i + "\n" : ""),
    )
    .join("");
  const formatted = await format(skeleton, { ...options, parser: "php" });
  const spans = phpSpans(formatted);
  if (spans.length !== original.length)
    throw Error(
      "Impossible de conserver tous les blocs PHP pendant la mise en forme.",
    );
  const blocks = spans.map((s, i) => {
    const code = normalizeBlock(formatted.slice(s.from, s.to));
    const token =
      prefix +
      i +
      "z" +
      "x".repeat(
        Math.max(
          0,
          Math.min(options.printWidth ?? 100, code.length) -
            (prefix.length + String(i).length + 1),
        ),
      );
    return { ...s, code, token };
  });
  let masked = "",
    last = 0;
  original.forEach((s, i) => {
    masked += text.slice(last, s.from) + blocks[i].token;
    last = s.to;
  });
  masked += text.slice(last);
  const { contexts } = protectedHtml(masked);
  const changes = [];
  for (const block of blocks) {
    const at = masked.indexOf(block.token);
    const context = contexts.find((c) => at >= c.from && at < c.to);
    block.context = context?.kind ?? "text";
    const statement = !/^<\?=|^<\?php\s*(?:echo|print)\b/i.test(block.code);
    if (statement && block.context === "text") {
      block.placeholder = "<!--" + block.token + "-->";
      // Separate statements in structural containers, never in phrasing/raw text.
      const standalone = !context?.parent || containers.has(context.parent);
      const before = masked.slice(0, at).match(/[ \t\r\n]*$/)[0];
      const after = masked
        .slice(at + block.token.length)
        .match(/^[ \t\r\n]*/)[0];
      changes.push([
        at,
        block.token.length,
        (standalone && at && !before.includes("\n") ? "\n" : "") +
          block.placeholder +
          (standalone && !after.includes("\n") ? "\n" : ""),
      ]);
    } else block.placeholder = block.token;
  }
  for (const [at, len, value] of changes.sort((a, b) => b[0] - a[0]))
    masked = masked.slice(0, at) + value + masked.slice(at + len);
  // Embedded JS/CSS can contain PHP; leave their literal source to their own editor.
  let html = await formatTemplateHtml(masked, format, options);
  for (const b of blocks) {
    const at = html.indexOf(b.placeholder);
    if (at < 0 || html.indexOf(b.placeholder, at + b.placeholder.length) !== -1)
      throw Error(
        "La structure HTML ne permet pas de conserver les blocs PHP sans ambiguïté.",
      );
  }
  const tail = blocks.at(-1);
  if (
    !tail.closed &&
    html.slice(html.indexOf(tail.placeholder) + tail.placeholder.length).trim()
  )
    throw Error(
      "Fermez les balises HTML avant le dernier bloc PHP ouvert pour conserver la structure du document.",
    );
  const { ranges } = protectedHtml(html);
  const unit = options.useTabs ? "\t" : " ".repeat(options.tabWidth ?? 2);
  let active = [],
    offset = 0;
  html = html
    .split("\n")
    .map((line) => {
      const protectedLine = ranges.some(([a, b]) => offset >= a && offset <= b);
      offset += line.length + 1;
      const present = blocks
        .filter((b) => line.includes(b.placeholder))
        .sort(
          (a, b) => line.indexOf(a.placeholder) - line.indexOf(b.placeholder),
        );
      let depth = active.length;
      if (present[0] && line.trimStart().startsWith(present[0].placeholder))
        depth = sharedDepth(active, present[0].after);
      const indentation =
        (line.match(/^[ \t]*/)?.[0] ?? "") +
        (protectedLine ? "" : unit.repeat(depth));
      if (!protectedLine && line.trim()) line = unit.repeat(depth) + line;
      for (const b of present) {
        line = line.replace(b.placeholder, () =>
          indentBlock(b.code, indentation),
        );
        active = b.after;
      }
      return line;
    })
    .join("\n");
  return html;
}
