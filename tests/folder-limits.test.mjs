import test from "node:test";
import assert from "node:assert/strict";
import { readFolder } from "../apps/studio/workbench/folder-access.mjs";
const MiB = 1048576;
function directory(entries) {
  return {
    async *entries() {
      yield* entries;
    },
  };
}
function file(size, read) {
  return { kind: "file", getFile: async () => ({ size, arrayBuffer: read }) };
}
test("folder limits identify the exceeded budget before reading any file content", async () => {
  let reads = 0;
  const read = async () => {
    reads++;
    return new ArrayBuffer(0);
  };
  const cases = [
    {
      entries: [
        ["small.txt", file(1, read)],
        ["archive.zip", file(16 * MiB + 1, read)],
      ],
      limit: "file",
      pattern: /archive.zip.*16,01 Mio.*16 Mio/,
    },
    {
      entries: Array.from({ length: 1025 }, (_, i) => [
        "file" + i,
        file(0, read),
      ]),
      limit: "count",
      pattern: /1.025 fichiers.*1 024 fichiers/,
    },
    {
      entries: Array.from({ length: 5 }, (_, i) => [
        "chunk" + i,
        file(15 * MiB, read),
      ]),
      limit: "total",
      pattern: /75 Mio.*64 Mio.*chunk4/,
    },
  ];
  for (const item of cases) {
    await assert.rejects(readFolder(directory(item.entries)), (error) => {
      assert.equal(error.code, "FOLDER_LIMIT");
      assert.equal(error.limit, item.limit);
      assert.match(error.message, item.pattern);
      assert.ok(error.path.startsWith("/"));
      return true;
    });
  }
  assert.equal(
    reads,
    0,
    "rejected folders must not allocate their file contents",
  );
});
test("folder depth violations identify the directory", async () => {
  let root = directory([]);
  for (let i = 0; i < 13; i++)
    root = directory([["nested", { ...root, kind: "directory" }]]);
  await assert.rejects(readFolder(root), (error) => {
    assert.equal(error.code, "FOLDER_LIMIT");
    assert.equal(error.limit, "depth");
    assert.match(error.message, /nested.*12 niveaux/);
    return true;
  });
});
test("exactly 1024 files remain allowed and each validated file is read once", async () => {
  let reads = 0;
  const files = await readFolder(
    directory(
      Array.from({ length: 1024 }, (_, i) => [
        "file" + i,
        file(0, async () => {
          reads++;
          return new ArrayBuffer(0);
        }),
      ]),
    ),
  );
  assert.equal(files.size, 1024);
  assert.equal(reads, 1024);
});
