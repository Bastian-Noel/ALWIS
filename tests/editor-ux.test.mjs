import test from "node:test";
import assert from "node:assert/strict";
import { EditorState } from "@codemirror/state";
import { html } from "@codemirror/lang-html";
import { php } from "@codemirror/lang-php";
import { renameClosingTag } from "../apps/studio/editor/tag-rename.mjs";
import { cssDiagnostics } from "../apps/studio/editor/css-diagnostics.mjs";
import { formatMixedHtml } from "../apps/studio/editor/mixed-format.mjs";
import { markdownDocument } from "../apps/studio/workbench/markdown.mjs";
import { format } from "prettier";
test("paired tag edits target the matching closing tag, including nested PHP templates", () => {
  for (const language of [html(), php()]) {
    const state = EditorState.create({
      doc: "<div><div>child</div></div>",
      extensions: [language, renameClosingTag],
    });
    const tr = state.update({
      changes: { from: 1, to: 4, insert: "section" },
      userEvent: "input.type",
    });
    assert.equal(tr.newDoc.toString(), "<section><div>child</div></section>");
  }
  const state = EditorState.create({
    doc: '<div title="div">div</div>',
    extensions: [html(), renameClosingTag],
  });
  assert.equal(
    state
      .update({
        changes: { from: 12, to: 15, insert: "span" },
        userEvent: "input.type",
      })
      .newDoc.toString(),
    '<div title="span">div</div>',
  );
});
test("CSS diagnostics catch missing braces while leaving strings and comments alone", () => {
  assert.ok(cssDiagnostics("a { color: red;").length);
  assert.deepEqual(
    cssDiagnostics('a { content: "}"; /* { */ color:red; }'),
    [],
  );
});
test("mixed formatter indents HTML without altering PHP strings containing close delimiters", async () => {
  const text =
    '<main><section><?php echo "?> <span>"; ?><p><?= $name ?></p></section></main>';
  const result = await formatMixedHtml(text, format, { tabWidth: 2 });
  assert.match(result, /<main>\n  <section>/);
  assert.match(result, /<\?php echo "\?> <span>"; \?>/);
  assert.match(result, /<\?= \$name \?>/);
  assert.equal(await formatMixedHtml(result, format, { tabWidth: 2 }), result);
});
test("Markdown preview never executes raw HTML or javascript links", () => {
  const html = markdownDocument(
    "# Title\n<script>alert(1)</script>\n[x](javascript:alert(1))\n```\n<img onerror=boom>\n```",
  );
  assert.match(html, /<h1>Title<\/h1>/);
  assert.doesNotMatch(html, /<script>|<img|href="javascript:/);
  assert.match(html, /default-src 'none'/);
});
