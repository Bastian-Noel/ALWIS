import test from "node:test";
import assert from "node:assert/strict";
import {
  foreignKeyIssue,
  columnValueError,
  rowConstraintError,
  isResizeDeliveryNotification,
} from "../apps/studio/workbench/input-validation.mjs";
test("integer validation is exact, bounded and does not reject text columns", () => {
  for (const value of ["test", "1.5", "1e2", "2147483648"])
    assert.ok(columnValueError({ type: "int(11)" }, value));
  for (const value of ["42", "-2147483648", "+0"])
    assert.equal(columnValueError({ type: "int" }, value), "");
  assert.equal(
    columnValueError({ type: "bigint unsigned" }, "18446744073709551615"),
    "",
  );
  assert.ok(
    columnValueError({ type: "bigint unsigned" }, "18446744073709551616"),
  );
  assert.ok(columnValueError({ type: "tinyint unsigned" }, "-1"));
  assert.equal(columnValueError({ type: "varchar(30)" }, "test"), "");
});
test("only known row constraints and browser layout notifications are handled locally", () => {
  assert.equal(
    rowConstraintError(
      { errno: 1406, message: "Data too long for column 'name' at row 1" },
      [{ name: "name" }],
    ).column,
    "name",
  );
  assert.equal(
    rowConstraintError({ errno: 1064, message: "SQL syntax" }, []),
    null,
  );
  const message =
    "ResizeObserver loop completed with undelivered notifications.";
  assert.equal(isResizeDeliveryNotification({ message }), true);
  assert.equal(
    isResizeDeliveryNotification({ message, error: Error(message) }),
    false,
  );
  assert.equal(
    isResizeDeliveryNotification({ message: "Other problem" }),
    false,
  );
});

test("foreign-key errors resolve related tables and conservative propagation proposals", () => {
  const parent = { name: "departments", fks: [] },
    child = {
      name: "teachers",
      fks: [
        {
          name: "2",
          column: "department_id",
          columns: ["department_id"],
          refTable: "departments",
          refColumn: "id",
          refColumns: ["id"],
          onDelete: "RESTRICT",
          onUpdate: "RESTRICT",
        },
      ],
    };
  const message =
    "Cannot add or update a child row: a foreign key constraint fails (`school`.`teachers`, CONSTRAINT `2` FOREIGN KEY (`department_id`) REFERENCES `departments` (`id`))";
  const input = foreignKeyIssue(
    { errno: 1452, message },
    { tables: [parent, child], table: child },
  );
  assert.equal(input.column, "department_id");
  assert.equal(input.navigation.table, "departments");
  assert.equal(input.relation, undefined);
  const blocked = foreignKeyIssue(
    { errno: 1451, message },
    {
      tables: [parent, child],
      table: parent,
      row: { id: "7" },
      operation: "delete",
    },
  );
  assert.deepEqual(blocked.navigation, {
    table: "teachers",
    filter: { c: "department_id", op: "=", v: "7" },
  });
  assert.equal(blocked.relation.onDelete, "CASCADE");
  assert.equal(blocked.relation.onUpdate, "RESTRICT");
  assert.equal(
    foreignKeyIssue(
      { errno: 1451, message: "unknown" },
      {
        tables: [parent, child, { name: "other", fks: [{ ...child.fks[0] }] }],
        table: parent,
      },
    ),
    null,
  );
});

test("duplicate keys and missing defaults identify the input to correct", () => {
  assert.equal(
    rowConstraintError(
      { errno: 1062, message: "Duplicate entry 'abc' for key 'name'" },
      [{ name: "name" }],
      [{ name: "name", columns: ["name"] }],
    ).column,
    "name",
  );
  assert.equal(
    rowConstraintError(
      { errno: 1364, message: "Field 'title' doesn't have a default value" },
      [{ name: "title" }],
    ).column,
    "title",
  );
});
