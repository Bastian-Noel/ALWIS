import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { openAsBlob } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { selectFolder } from "../apps/studio/workbench/folder-access.mjs";
import {
  exclusion,
  defaultSelection,
  importSummary,
  fitSelection,
} from "../apps/studio/workbench/import-plan.mjs";
import {
  inspectZipFile,
  extractZipFile,
  makeZip,
} from "../apps/studio/zip.mjs";
const MiB = 1048576;
const directory = (entries) => ({
  kind: "directory",
  async *entries() {
    yield* entries;
  },
});
const file = (size, read) => ({
  kind: "file",
  getFile: async () => ({ size, arrayBuffer: read }),
});
test("selection trims a 75 MiB folder before any content read", async () => {
  let reads = 0;
  const root = directory(
    Array.from({ length: 5 }, (_, i) => [
      "part" + i,
      file(15 * MiB, async () => {
        reads++;
        return new ArrayBuffer(15 * MiB);
      }),
    ]),
  );
  const result = await selectFolder(root, async (records) => {
    assert.equal(reads, 0);
    const chosen = new Set(records.map((e) => e.path));
    assert.equal(importSummary(records, chosen).valid, false);
    chosen.delete("/part4");
    assert.equal(importSummary(records, chosen).valid, true);
    return chosen;
  });
  assert.equal(reads, 4);
  assert.equal(result.files.size, 4);
});
test("recommended dependency trees are not scanned or read until explicitly requested", async () => {
  let walked = 0,
    reads = 0;
  const root = directory([
    ["index.php", file(1, async () => Uint8Array.of(1).buffer)],
    [
      "vendor",
      {
        kind: "directory",
        async *entries() {
          walked++;
          yield [
            "autoload.php",
            file(1, async () => {
              reads++;
              return Uint8Array.of(2).buffer;
            }),
          ];
        },
      },
    ],
  ]);
  let step = 0;
  const result = await selectFolder(root, async (records) => {
    if (step++ === 0) {
      assert.equal(walked, 0);
      return new Set(["/index.php", "/vendor"]);
    }
    assert.equal(walked, 1);
    assert.equal(reads, 0);
    return new Set(records.filter((e) => !e.directory).map((e) => e.path));
  });
  assert.equal(reads, 1);
  assert.ok(result.files.has("/vendor/autoload.php"));
});
test("recommendations are suggestions and distinguish Composer dependencies from its project files", () => {
  assert.ok(exclusion("/vendor/package/file.php").reason.includes("Composer"));
  assert.equal(exclusion("/composer.json"), null);
  assert.equal(exclusion("/composer.lock"), null);
  assert.equal(exclusion("/src/main.php"), null);
  assert.ok(exclusion("/node_modules/pkg/a.js"));
  const entries = [
    { path: "/index.php", size: 1 },
    { path: "/backup.zip", size: 17 * MiB },
    { path: "/vendor/autoload.php", size: 1, recommended: true },
  ];
  assert.deepEqual([...defaultSelection(entries)], ["/index.php"]);
});
test("a big ZIP and 1100 entries can be inspected with excluded contents unread", async () => {
  const dir = await mkdtemp(join(tmpdir(), "alwis-zip-"));
  try {
    const path = join(dir, "big.zip");
    execFileSync("python3", [
      "-c",
      `import zipfile,sys
with zipfile.ZipFile(sys.argv[1],'w',zipfile.ZIP_STORED) as z:
 z.writestr('index.php','<?php echo 42;')
 for i in range(1100): z.writestr('node_modules/p/f'+str(i),'x')
 with z.open('backup.zip','w') as f:
  for i in range(70): f.write(bytes(1048576))`,
      path,
    ]);
    const underlying = await openAsBlob(path);
    let readBytes = 0;
    class TrackedBlob extends Blob {
      async arrayBuffer() {
        throw Error("Whole archive must not be read");
      }
      slice(start, end, ...rest) {
        readBytes += (end ?? this.size) - (start ?? 0);
        return super.slice(start, end, ...rest);
      }
    }
    const blob = new TrackedBlob([underlying]);
    assert.ok(blob.size > 65 * MiB);
    const entries = await inspectZipFile(blob);
    assert.equal(entries.length, 1102);
    const result = await extractZipFile(blob, ["index.php"]);
    assert.equal(result.length, 1);
    assert.equal(new TextDecoder().decode(result[0].bytes), "<?php echo 42;");
    assert.ok(
      readBytes < 512 * 1024,
      "only directory, header and chosen payload should be read",
    );
    await assert.rejects(extractZipFile(blob, ["backup.zip"]), /16 Mio/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
test("selective extraction retains CRC and path protection", async () => {
  const bytes = makeZip([{ name: "index.php", bytes: Uint8Array.of(1) }]);
  bytes[39] ^= 255;
  await assert.rejects(
    extractZipFile(new Blob([bytes]), ["index.php"]),
    /Intégrité/,
  );
});

test("explicit fit proposal keeps entrypoints and trims optional media first", () => {
  const entries = [
    { path: "/index.php", size: 1 },
    { path: "/composer.json", size: 1 },
    ...Array.from({ length: 5 }, (_, i) => ({
      path: "/video" + i + ".bin",
      size: 15 * MiB,
    })),
  ];
  const selected = new Set(entries.map((e) => e.path)),
    fit = fitSelection(entries, selected);
  assert.equal(selected.size, 7);
  assert.equal(importSummary(entries, fit).valid, true);
  assert.ok(fit.has("/index.php"));
  assert.ok(fit.has("/composer.json"));
  assert.equal(fit.size, 6);
});
