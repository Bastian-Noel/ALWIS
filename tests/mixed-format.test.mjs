import test from "node:test";
import assert from "node:assert/strict";
import { format } from "prettier";
import * as phpPlugin from "@prettier/plugin-php";
import Engine from "php-parser";
import { formatMixedHtml } from "../apps/studio/editor/mixed-format.mjs";
import { files } from "../apps/studio/school-demo.mjs";
const options = {
  plugins: [phpPlugin],
  tabWidth: 2,
  printWidth: 100,
  phpVersion: "8.4",
};
const engine = new Engine({
  parser: { extractDoc: true },
  ast: { withPositions: false },
});
const normalize = (value) => {
  if (Array.isArray(value))
    return value.filter((x) => x?.kind !== "inline").map(normalize);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .filter(
          ([key]) =>
            ![
              "loc",
              "raw",
              "leadingComments",
              "trailingComments",
              "comments",
              "errors",
            ].includes(key),
        )
        .map(([key, v]) => [key, normalize(v)]),
    );
  return value;
};
const ast = (source) => normalize(engine.parseCode(source));
const check = async (source, config = options) => {
  const result = await formatMixedHtml(source, format, config);
  assert.deepEqual(ast(result), ast(source));
  assert.equal(
    await formatMixedHtml(result, format, config),
    result,
    "second format must not drift",
  );
  assert.doesNotMatch(result, /alwisphpx\d|alwishtmlisland\d/);
  return result;
};
test("Campus template: HTML, dynamic attributes and nested PHP are formatted together", async () => {
  // The old first pass produced the same broken layout as the supplied document.
  const source = await format(files["index.php"], {
    ...options,
    parser: "php",
  });
  const result = await check(source);
  assert.match(result, /\?>\n<!doctype html>\n<html lang="fr">\n  <head>/);
  assert.ok(
    result.includes("<title>Campus ALWIS — <?= h($pages[$page]) ?></title>"),
  );
  assert.match(result, /value="<\?= h\(\$_SESSION\["csrf"\]\) \?>"/);
  assert.match(
    result,
    /\n {14}<\?php foreach \(\$allUsers as \$person\): \?>\n {16}<option/,
  );
  assert.match(
    result,
    /<\?php elseif \(\$page === "students"\): \?>\n {8}<h2>/,
  );
  assert.match(result, /<input type="hidden" name="action" value="profile">\n/);
});
test("PHP strings, heredocs, comments and replacement-metacharacters retain their values", async () => {
  const source = `<main><?php $literal = "?> <tag> $& "; $multi = 'first\n  second'; $raw = <<<'TXT'\nunchanged\nTXT; /* ?> ignored */ ?><section><?= $literal ?></section><pre><?= $multi ?></pre></main>`;
  const result = await check(source);
  assert.match(result, /first\n  second/);
  assert.match(result, /\$&/);
  assert.match(result, /unchanged\nTXT/);
});
test("inline punctuation and raw HTML contents do not gain indentation whitespace", async () => {
  const source =
    '<?php if (true): ?><div><p>a<strong><?= "b" ?></strong>c</p><pre>  a\n b</pre><textarea>  a\n b</textarea><script>const template = "  a\\nb";</script></div><?php endif; ?>';
  const result = await check(source);
  assert.match(result, /<p>a<strong><\?= "b" \?><\/strong>c<\/p>/);
  assert.match(result, /<pre>  a\n b<\/pre>/);
  assert.match(result, /<textarea>  a\n b<\/textarea>/);
  assert.match(result, /<script>const template = "  a\\nb";<\/script>/);
});
test("braces, nested alternative syntax and attribute-condition fragments remain valid", async () => {
  for (const source of [
    "<?php if ($a) { ?><section><ul><?php foreach ($xs as $x): ?><li><?= $x ?></li><?php endforeach; ?></ul></section><?php } else { ?><p>Vide</p><?php } ?>",
    '<select><?php foreach ($rows as $row): ?><option value="<?= $row["id"] ?>" <?= $row["selected"] ? "selected" : "" ?>><?= $row["name"] ?></option><?php endforeach; ?></select>',
    "<div <?php if ($a): ?>hidden<?php endif; ?>>Texte</div>",
    '<?php $x = "php only";\n',
    "<main><?php if ($a): ?><b>Texte</b><?php endif; ?></main><?php $x=1;",
  ])
    await check(source);
});
test("indentation choices and CRLF are stable", async () => {
  const source =
    "<?php if (true): ?>\r\n<ul><?php foreach ([1,2] as $x): ?><li><?= $x ?></li><?php endforeach; ?></ul>\r\n<?php endif; ?>";
  for (const config of [
    { ...options, tabWidth: 4 },
    { ...options, useTabs: true },
  ])
    await check(source, config);
});

test("incomplete HTML cannot introduce markup into an unclosed PHP block", async () => {
  await assert.rejects(
    () =>
      formatMixedHtml(
        "<main><?php if ($a): ?><b>Texte</b><?php endif;",
        format,
        options,
      ),
    /Fermez les balises HTML/,
  );
});

test("multiline HTML attribute values stay unchanged inside PHP control flow", async () => {
  const result = await check(
    '<?php if(true): ?><div title="a\n b"><p title="c\n d">Hi <?= 1 ?></p></div><?php endif; ?>',
  );
  assert.ok(result.includes('title="a\n b"'));
  assert.ok(result.includes('title="c\n d"'));
});
