import test from "node:test";
import assert from "node:assert/strict";
import { relationModel } from "../apps/studio/schema-designer.mjs";
import { columnSQL } from "../apps/studio/database-tools.mjs";
test("cardinalities derive from nullable foreign keys and full unique indexes, including composite keys", () => {
  const columns = [
    ["p", "id", "int", "PRI", "NO"],
    ["c", "id", "int", "PRI", "NO"],
    ["c", "pid", "int", "MUL", "YES"],
    ["one", "pid", "int", "UNI", "NO"],
  ];
  const keys = [
    ["c", "p", "pid", "id", "fk_c", 1, "test"],
    ["one", "p", "pid", "id", "fk_one", 1, "test"],
  ];
  const indexes = [
    ["p", "PRIMARY", 0, "id", 1],
    ["c", "PRIMARY", 0, "id", 1],
    ["c", "idx_pid", 1, "pid", 1],
    ["one", "uniq", 0, "pid", 1],
  ];
  const model = relationModel(columns, keys, indexes);
  assert.deepEqual(
    model.relations.map((r) => [r.childRange, r.parentRange]),
    [
      ["0..N", "0..1"],
      ["0..1", "1"],
    ],
  );
  const compound = relationModel(
    [
      ["p", "a", "int", "PRI", "NO"],
      ["p", "b", "int", "PRI", "NO"],
      ["c", "a", "int", "PRI", "NO"],
      ["c", "b", "int", "PRI", "YES"],
    ],
    [
      ["c", "p", "a", "a", "fk", 1, "test"],
      ["c", "p", "b", "b", "fk", 2, "test"],
    ],
    [
      ["p", "PRIMARY", 0, "a", 1],
      ["p", "PRIMARY", 0, "b", 2],
      ["c", "PRIMARY", 0, "a", 1],
      ["c", "PRIMARY", 0, "b", 2],
    ],
  );
  assert.equal(compound.relations.length, 1);
  assert.equal(compound.relations[0].childRange, "0..1");
  assert.equal(compound.relations[0].parentRange, "0..1");
  assert.equal(compound.isUnique("p", ["a"]), false);
});
test("many-to-many annotation requires two foreign keys covered by the full unique junction key", () => {
  const columns = ["a", "b", "ab"].flatMap((t) =>
    t === "ab"
      ? [
          ["ab", "aid", "int", "PRI", "NO"],
          ["ab", "bid", "int", "PRI", "NO"],
        ]
      : [[t, "id", "int", "PRI", "NO"]],
  );
  const keys = [
    ["ab", "a", "aid", "id", "fka", 1, "test"],
    ["ab", "b", "bid", "id", "fkb", 1, "test"],
  ];
  const indexes = [
    ["a", "PRIMARY", 0, "id", 1],
    ["b", "PRIMARY", 0, "id", 1],
    ["ab", "PRIMARY", 0, "aid", 1],
    ["ab", "PRIMARY", 0, "bid", 2],
  ];
  assert.equal(relationModel(columns, keys, indexes).junctions.length, 1);
  assert.equal(
    relationModel(columns, keys, indexes.slice(0, 2)).junctions.length,
    0,
  );
});
test("column forms quote identifiers and refuse unsafe type fragments", () => {
  assert.equal(
    columnSQL({ name: "a`b", type: "INT", auto: true, primary: true }),
    "`a``b` INT NOT NULL AUTO_INCREMENT PRIMARY KEY",
  );
  assert.throws(() => columnSQL({ name: "x", type: "INT); DROP TABLE x;--" }));
  assert.throws(() => columnSQL({ name: "x", type: "TEXT", auto: true }));
});
