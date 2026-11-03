const escape = (text) =>
  text.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
function inline(text) {
  return escape(text)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
    .replace(
      /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
      '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>',
    );
}
/** Bounded, no raw HTML, no scripts or remote images, no runtime engine. */
export function markdownDocument(text, dark = false) {
  const lines = text.slice(0, 262144).split(/\r?\n/),
    out = [];
  let code = null,
    list = false;
  const endList = () => {
    if (list) {
      out.push("</ul>");
      list = false;
    }
  };
  for (const line of lines) {
    if (/^```/.test(line)) {
      endList();
      if (code !== null) {
        out.push("<pre><code>" + escape(code.join("\n")) + "</code></pre>");
        code = null;
      } else code = [];
      continue;
    }
    if (code !== null) {
      code.push(line);
      continue;
    }
    const heading = /^(#{1,6})\s+(.*)$/.exec(line),
      item = /^\s*[-*+]\s+(.*)$/.exec(line);
    if (item) {
      if (!list) {
        out.push("<ul>");
        list = true;
      }
      out.push("<li>" + inline(item[1]) + "</li>");
      continue;
    }
    endList();
    if (heading)
      out.push(
        `<h${heading[1].length}>${inline(heading[2])}</h${heading[1].length}>`,
      );
    else if (/^>\s?/.test(line))
      out.push(
        "<blockquote>" + inline(line.replace(/^>\s?/, "")) + "</blockquote>",
      );
    else if (/^\s*---+\s*$/.test(line)) out.push("<hr>");
    else if (line.trim()) out.push("<p>" + inline(line) + "</p>");
  }
  endList();
  if (code !== null)
    out.push("<pre><code>" + escape(code.join("\n")) + "</code></pre>");
  return `<!doctype html><html lang="fr"><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'"><title>Aperçu Markdown</title><style>body{font:16px/1.65 system-ui;margin:32px;color:${dark ? "#e4e8ed" : "#202832"};background:${dark ? "#191e25" : "#fff"};overflow-wrap:anywhere}pre,code{background:${dark ? "#28303a" : "#eef1f4"};border-radius:5px}pre{padding:16px;overflow:auto}code{padding:2px 4px}a{color:${dark ? "#8bc7ff" : "#075fb5"}}blockquote{border-left:3px solid #8793a1;margin-left:0;padding-left:16px}h1,h2{border-bottom:1px solid #8793a144}p{white-space:pre-wrap}</style><body>${out.join("\n")}</body></html>`;
}
