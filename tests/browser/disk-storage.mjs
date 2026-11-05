import assert from "node:assert/strict";
import { mkdir, writeFile, stat } from "node:fs/promises";
import {
  chromium,
  firefox,
} from "../../build-work/php/node_modules/playwright/index.mjs";
import { createStudioServer } from "../../scripts/serve-studio.mjs";
const server = createStudioServer();
await new Promise((r) => server.listen(0, "127.0.0.1", r));
await mkdir("build-work/disk-storage", { recursive: true });
const receipts = [];
try {
  for (const engine of [chromium, firefox]) {
    const browser = await engine.launch({
      headless: true,
      ...(engine === chromium ? { args: ["--no-sandbox"] } : {}),
    });
    try {
      const page = await browser.newPage();
      await page.goto("http://127.0.0.1:" + server.address().port);
      const downloaded = page.waitForEvent("download", { timeout: 180000 });
      const result = await page.evaluate(async () => {
        const { ProjectDisk, crcStep, classifyFile } =
          await import("/packages/runtime/src/project-disk.mjs");
        const { ProjectHub } = await import("/apps/studio/project-hub.mjs");
        const { streamZip } = await import("/apps/studio/zip-stream.mjs");
        const { inspectZipFile, zipEntryStream } =
          await import("/apps/studio/zip.mjs");
        const key = "storage-" + crypto.randomUUID(),
          disk = await ProjectDisk.reserve(key),
          size = 256 * 1048576;
        // Only a 256 KiB source chunk is created at once, with deterministic seekable content.
        let position = 0;
        const source = new ReadableStream({
          pull(c) {
            if (position === size) {
              c.close();
              return;
            }
            const bytes = new Uint8Array(Math.min(262144, size - position));
            for (let i = 0; i < bytes.length; i++)
              bytes[i] = (position + i) % 251;
            position += bytes.length;
            c.enqueue(bytes);
          },
        });
        const start = performance.now(),
          media = await disk.put("/media.mp4", source, { size });
        const code =
          '<?php $f=fopen(__DIR__."/media.mp4","rb"); fseek($f,-16,SEEK_END);echo json_encode([filesize(__DIR__."/media.mp4"),bin2hex(fread($f,16))]);fclose($f);file_put_contents(__DIR__."/note.txt","saved");';
        const script = await disk.put("/index.php", new Blob([code]));
        await disk.publish(await disk.prepare([media, script]));
        const hub = await ProjectHub.open(key),
          before = await hub.runtime.state(),
          session = [...hub.sessions.sessions.keys()][0];
        const response = await hub.route(session, {
          url: "http://alwis.local/index.php",
          method: "GET",
          headers: [],
        });
        const parsed = JSON.parse(new TextDecoder().decode(response.body));
        const ranged = await hub.route(session, {
          url: "http://alwis.local/media.mp4",
          method: "GET",
          headers: [["Range", "bytes=-16"]],
        });
        const range = Array.from(
          new Uint8Array(await ranged.file.arrayBuffer()),
        );
        const head = await hub.route(session, {
          url: "http://alwis.local/media.mp4",
          method: "HEAD",
          headers: [],
        });
        const invalid = await hub.route(session, {
          url: "http://alwis.local/media.mp4",
          method: "GET",
          headers: [["Range", "bytes=999999999-"]],
        });
        // PHP mutations invalidate old immutable entries, even through /workspace aliases.
        await hub.runtime.write(
          "/workspace/change.php",
          '<?php file_put_contents(__DIR__."/index.php","changed");',
        );
        hub.invalidate("/change.php");
        await hub.route(session, {
          url: "http://alwis.local/change.php",
          method: "GET",
          headers: [],
        });
        const changed = await hub.route(session, {
          url: "http://alwis.local/index.php.txt",
          method: "GET",
          headers: [],
        });
        const invalidated = hub.invalidFiles.has("/index.php"),
          after = await hub.runtime.state();
        await hub.saveAndRestart();
        const saved = await hub.runtime.state(),
          note = new TextDecoder().decode(
            await hub.runtime.read("/workspace/note.txt"),
          );
        const catalogue = await hub.runtime.call("diskCatalog");
        const exportStart = performance.now(),
          archive = await streamZip([
            { name: "media.mp4", size, open: () => disk.file(media) },
            {
              name: "index.php",
              size: script.size,
              open: () => disk.file(script),
            },
          ]);
        const central = await inspectZipFile(archive),
          reader = (
            await zipEntryStream(
              archive,
              central.find((e) => e.name === "media.mp4"),
            )
          ).getReader();
        let count = 0,
          crc = 0xffffffff;
        for (;;) {
          const item = await reader.read();
          if (item.done) break;
          count += item.value.length;
          crc = crcStep(crc, item.value);
        }
        reader.releaseLock();
        const cancel = new AbortController();
        let cancelled = false;
        try {
          await disk.put("/cancel.bin", new Blob([new Uint8Array(1048576)]), {
            signal: cancel.signal,
            onProgress: () => cancel.abort(),
          });
        } catch (e) {
          cancelled = e.name === "AbortError";
        }
        let badCRC = false;
        try {
          await disk.put("/bad.txt", new Blob(["x"]), { expectedCRC: 42 });
        } catch (e) {
          badCRC = e.message.includes("Intégrité");
        }
        const { stageFiles } = await import("/apps/studio/disk-import.mjs");
        const estimate = navigator.storage.estimate.bind(navigator.storage),
          quotaKey = "quota-" + crypto.randomUUID();
        let quotaRefused = false;
        try {
          navigator.storage.estimate = async () => ({ quota: 1, usage: 1 });
          await stageFiles(quotaKey, [
            { path: "/a.txt", size: 1, file: new Blob(["x"]) },
          ]);
        } catch (error) {
          quotaRefused = error.message.includes(
            "Espace navigateur insuffisant",
          );
        } finally {
          navigator.storage.estimate = estimate;
        }
        const quotaClean = !(await ProjectDisk.has(quotaKey));
        const all = [];
        for await (const [name] of disk.objects.entries()) all.push(name);
        const svg = classifyFile("/diagram.svg"),
          unknown = classifyFile("/thing.unknown");
        const url = URL.createObjectURL(archive),
          a = document.createElement("a");
        a.href = url;
        a.download = "large-project.zip";
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 60000);
        await hub.close({ save: false });
        // Exercise the actual Service Worker transfer, not only the owner response helper.
        const { ctx } = await import("/apps/studio/workbench/state.mjs");
        await ctx.engine.projects.open(key, "existing");
        const client = ctx.engine.sessions.list()[0],
          urlPath = ctx.engine.sessions.routeURL(client.id, "/media.mp4");
        const swResponse = await fetch(urlPath, {
            headers: { Range: "bytes=-16" },
          }),
          swBytes = Array.from(new Uint8Array(await swResponse.arrayBuffer()));
        await ctx.engine.projects.close({ save: false });
        return {
          swStatus: swResponse.status,
          swBytes,
          quotaRefused,
          quotaClean,
          size,
          parsed,
          range,
          rangeStatus: ranged.status,
          head: {
            status: head.status,
            length: new Headers(head.headers).get("content-length"),
            hasBody: !!head.file,
          },
          invalid: invalid.status,
          before,
          after,
          saved,
          note,
          catalogue: catalogue.length,
          count,
          crc: (crc ^ 0xffffffff) >>> 0,
          expectedCRC: media.crc,
          archiveSize: archive.size,
          invalidated,
          cancelled,
          badCRC,
          objects: all.length,
          svg,
          unknown,
          importMs: exportStart - start,
          exportMs: performance.now() - exportStart,
        };
      });
      const download = await downloaded,
        downloadPath = "build-work/disk-storage/" + engine.name() + ".zip";
      await download.saveAs(downloadPath);
      assert.equal((await stat(downloadPath)).size, result.archiveSize);
      assert.equal(result.invalidated, true);
      assert.equal(result.parsed[0], result.size);
      assert.deepEqual(
        result.range,
        Array.from({ length: 16 }, (_, i) => (result.size - 16 + i) % 251),
      );
      assert.equal(result.parsed[1], Buffer.from(result.range).toString("hex"));
      assert.equal(result.rangeStatus, 206);
      assert.equal(result.head.length, String(result.size));
      assert.equal(result.head.hasBody, false);
      assert.equal(result.invalid, 416);
      assert.equal(result.before.vfs.groups.project.bytes, 0);
      assert.ok(result.after.vfs.groups.project.bytes < 1048576);
      assert.ok(result.after.disk.cacheBytes <= 4 * 1048576);
      assert.equal(result.saved.vfs.groups.project.bytes, 0);
      assert.equal(result.note, "saved");
      assert.equal(result.saved.sqlPhase, "dormant");
      assert.equal(result.count, result.size);
      assert.equal(result.crc, result.expectedCRC);
      assert.equal(result.swStatus, 206);
      assert.deepEqual(result.swBytes, result.range);
      assert.equal(result.quotaRefused, true);
      assert.equal(result.quotaClean, true);
      assert.equal(result.cancelled, true);
      assert.equal(result.badCRC, true);
      assert.equal(result.svg.kind, "svg");
      assert.equal(result.unknown.kind, "binary");
      receipts.push({ browser: engine.name(), ...result });
      console.log(
        engine.name(),
        "256 MiB disk source, bounded PHP reads, Range/HEAD, save/restart and streamed ZIP verified.",
      );
    } finally {
      await browser.close();
    }
  }
} finally {
  await new Promise((r) => server.close(r));
  await writeFile(
    "build-work/disk-storage/results.json",
    JSON.stringify(receipts, null, 2),
  );
}
