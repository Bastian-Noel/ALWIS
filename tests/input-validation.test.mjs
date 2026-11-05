import test from "node:test";
import assert from "node:assert/strict";
import {
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
