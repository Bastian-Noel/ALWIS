import test from "node:test";
import assert from "node:assert/strict";
import {
  phpSyntaxDiagnostics,
  phpVariableDiagnostics,
  phpVariables,
} from "../apps/studio/editor/php-diagnostics.mjs";
import {
  rankOptions,
  snippetTemplate,
} from "../apps/studio/editor/intelligence.mjs";
test("PHP repair verifies missing semicolon and leaves valid multiline constructs alone", () => {
  assert.match(
    phpSyntaxDiagnostics('<?php $name="Alice"\necho $name;')[0].message,
    /point-virgule/,
  );
  for (const code of [
    '<?php if (true) { echo "ok"; }',
    "<?php $x = [\n1,\n2\n];",
    '<?php // ; missing?\necho "ok";',
    '<?php echo "x" ?>',
  ])
    assert.deepEqual(phpSyntaxDiagnostics(code), []);
});
test("PHP typo proposals respect scope, ambiguity, casing and dynamic includes", () => {
  assert.equal(
    phpVariableDiagnostics('<?php $utilisateur="A"; echo $Utilisateur;').length,
    1,
  );
  assert.equal(
    phpVariableDiagnostics(
      "<?php function a(){ $utilisateur=1; } function b(){echo $Utilisateur;}",
    ).length,
    0,
  );
  assert.equal(
    phpVariableDiagnostics(
      '<?php $utilisateur=1; include "vars.php"; echo $Utilisateur;',
    ).length,
    0,
  );
  assert.equal(
    phpVariableDiagnostics(
      "<?php $utilisateur=1; $Utilisateur=2; echo $Utilisateur;",
    ).length,
    0,
  );
  const code = "<?php function a($param){$local=1; echo $";
  assert.deepEqual(phpVariables(code, code.length), ["$param", "$local"]);
});
test("completion filters variable context and conservatively converts LSP snippets", () => {
  assert.deepEqual(
    rankOptions(
      [{ label: "strlen" }, { label: "$nom" }, { label: "$nom" }],
      "$",
      true,
    ).map((x) => x.label),
    ["$nom"],
  );
  assert.equal(snippetTemplate("call(${1:arg}, $0)"), "call(${1:arg}, ${0})");
  assert.equal(snippetTemplate("${1/foo/bar/}"), null);
});
