import test from "node:test";
import assert from "node:assert/strict";
import {
  classifyFile,
  validDiskPath,
  crcStep,
} from "../packages/runtime/src/project-disk.mjs";
import { fileResponse } from "../apps/studio/file-response.mjs";
test("disk classification keeps unknowns binary and SVG out of code analysis", () => {
  assert.deepEqual(classifyFile("/x.svg"), {
    kind: "svg",
    type: "image/svg+xml",
  });
  assert.equal(classifyFile("/x.custom").kind, "binary");
  assert.equal(classifyFile("/x.php", Uint8Array.of(0)).kind, "binary");
  assert.equal(classifyFile("/x.js", Uint8Array.of(0xff)).kind, "binary");
  assert.equal(
    classifyFile("/x.php", new TextEncoder().encode("<?php echo 1;")).kind,
    "code",
  );
});
test("incremental CRC matches the standard vector across chunk boundaries", () => {
  const b = new TextEncoder().encode("123456789");
  let crc = crcStep(0xffffffff, b.subarray(0, 3));
  crc = crcStep(crc, b.subarray(3));
  assert.equal((crc ^ 0xffffffff) >>> 0, 0xcbf43926);
});
test("disk paths refuse traversal, reserved folders and oversized components", () => {
  for (const p of [
    "/../x",
    "/a//b",
    "/a/./b",
    "/.sessions/x",
    "/.git/config",
    "/a\\b",
    "/" + "é".repeat(128),
  ])
    assert.throws(() => validDiskPath(p));
  assert.equal(
    validDiskPath("/.sessions/sess_x", { internal: true }),
    "/.sessions/sess_x",
  );
});
test("media ranges, validators and HEAD retain exact lengths without full payload reads", async () => {
  const f = new Blob(["0123456789"]);
  for (const [range, body, contentRange] of [
    ["bytes=2-4", "234", "bytes 2-4/10"],
    ["bytes=-3", "789", "bytes 7-9/10"],
    ["bytes=7-", "789", "bytes 7-9/10"],
  ]) {
    const r = fileResponse(
      f,
      { headers: [["Range", range]] },
      { version: "v1" },
    );
    assert.equal(r.status, 206);
    assert.equal(await r.file.text(), body);
    assert.equal(new Headers(r.headers).get("content-range"), contentRange);
  }
  for (const range of [
    "bytes=-0",
    "bytes=10-",
    "bytes=4-2",
    "bytes=0-1,4-5",
    "bytes=999999999999999999999-",
  ])
    assert.equal(fileResponse(f, { headers: [["Range", range]] }).status, 416);
  const head = fileResponse(f, { method: "HEAD" });
  assert.equal(head.file, null);
  assert.equal(new Headers(head.headers).get("content-length"), "10");
  assert.equal(
    fileResponse(f, { headers: [["If-None-Match", '"v1"']] }, { version: "v1" })
      .status,
    304,
  );
  assert.equal(
    fileResponse(
      f,
      {
        headers: [
          ["Range", "bytes=1-2"],
          ["If-Range", '"old"'],
        ],
      },
      { version: "v1" },
    ).status,
    200,
  );
});
