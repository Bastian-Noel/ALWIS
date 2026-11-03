import test from "node:test";
import assert from "node:assert/strict";
import {
  columnDefinitions,
  patchColumn,
  buildColumn,
} from "../apps/studio/database/column-definition.mjs";
test("column changes preserve server attributes and quoted NULL/comma values", () => {
  const ddl =
    "CREATE TABLE `x` (`id` bigint unsigned NOT NULL AUTO_INCREMENT, `label` varchar(40) CHARACTER SET utf8mb4 NOT NULL DEFAULT 'NOT NULL' COMMENT 'x,y', PRIMARY KEY (`id`))";
  const defs = columnDefinitions(ddl);
  assert.equal(defs.size, 2);
  const result = patchColumn(defs.get("label"), {
    type: "VARCHAR(80)",
    nullable: true,
  });
  assert.equal(
    result,
    "VARCHAR(80) CHARACTER SET utf8mb4 NULL DEFAULT 'NOT NULL' COMMENT 'x,y'",
  );
  assert.equal(
    patchColumn("int DEFAULT NULL COMMENT 'NOT NULL'", { nullable: false }),
    "int DEFAULT NULL COMMENT 'NOT NULL' NOT NULL",
  );
});
test("column builder validates dimensions, defaults, generated identity and injection", () => {
  assert.throws(() => buildColumn({ name: "x", type: "DECIMAL(4,5)" }));
  assert.throws(() => buildColumn({ name: "x", type: "INT; DROP TABLE x" }));
  assert.throws(() => buildColumn({ name: "x", type: "VARCHAR(0)" }));
  assert.throws(() =>
    buildColumn({
      name: "x",
      type: "INT",
      nullable: false,
      defaultMode: "null",
    }),
  );
  assert.throws(() =>
    buildColumn({ name: "x", type: "TEXT", auto: true, defaultMode: "none" }),
  );
  assert.match(
    buildColumn({
      name: "x",
      type: "DECIMAL(65,30)",
      nullable: true,
      defaultMode: "literal",
      defaultValue: "900719925474099312345678.123",
    }),
    /DECIMAL\(65,30\)/,
  );
  assert.match(
    buildColumn({
      name: "x",
      type: "ENUM",
      values: '["one","two"]',
      nullable: true,
      defaultMode: "none",
    }),
    /ENUM\('one','two'\)/,
  );
});
