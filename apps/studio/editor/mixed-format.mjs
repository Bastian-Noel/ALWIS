import { php } from "@codemirror/lang-php";
/** Protect PHP strings/comments from the HTML formatter, including literal ?>. */
export async function formatMixedHtml(text, format, options) {
  if (!text.includes("?>")) return text;
  const spans = [];
  let start = null;
  php()
    .language.parser.parse(text)
    .iterate({
      enter(n) {
        if (n.name === "PhpOpen") start = n.from;
        if (n.name === "PhpClose" && start !== null) {
          spans.push([start, n.to]);
          start = null;
        }
      },
    });
  if (start !== null) spans.push([start, text.length]);
  if (!spans.length) return text;
  let marker = "ALWIS_PHP_BLOCK_";
  while (text.includes(marker)) marker += "X";
  let masked = text;
  for (let i = spans.length - 1; i >= 0; i--)
    masked =
      masked.slice(0, spans[i][0]) +
      `<?${marker}${i}?>` +
      masked.slice(spans[i][1]);
  try {
    let result = await format(masked, { ...options, parser: "html" });
    for (let i = 0; i < spans.length; i++) {
      const token = `<?${marker}${i}?>`,
        position = result.indexOf(token);
      if (position < 0 || result.indexOf(token, position + token.length) >= 0)
        return text;
      const block = text.slice(...spans[i]);
      // Restore PHP byte-for-byte, including whitespace inside multiline strings.
      result = result.replace(token, block);
    }
    return result;
  } catch {
    return text;
  } // Dynamic tag structures may not form one static HTML tree.
}
