import test from "node:test";
import assert from "node:assert/strict";
import { htmlVoidStyle } from "../apps/studio/editor/html-style.mjs";
test("HTML style preserves attributes, embedded code and foreign elements", () => {
  const source =
    '<meta charset="utf-8" /><input value="/>" /><script>const sample="<br />";</script><svg><path /></svg>';
  const result = htmlVoidStyle(source);
  assert.equal(
    result,
    '<meta charset="utf-8"><input value="/>"><script>const sample="<br />";</script><svg><path /></svg>',
  );
  assert.equal(htmlVoidStyle(result), result);
});

test("multiline void-tag closing delimiter retains its indentation", () => {
  assert.equal(
    htmlVoidStyle('<input\n    name="field"\n  />'),
    '<input\n    name="field"\n  >',
  );
});
