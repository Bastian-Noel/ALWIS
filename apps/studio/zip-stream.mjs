import { crcStep, storageBudget } from "/packages/runtime/src/project-disk.mjs";
/** Sequential ZIP writer with data descriptors; no whole-archive buffer or Blob assembly. */
export async function streamZip(
  entries,
  { signal, onProgress = () => {} } = {},
) {
  const expected = entries.reduce((n, e) => n + e.size, 0);
  await storageBudget(expected);
  if (entries.length > 50000 || expected > 3 * 1024 * 1048576)
    throw Error("Export ZIP trop volumineux.");
  const dir = await (
    await navigator.storage.getDirectory()
  ).getDirectoryHandle("alwis-exports", { create: true });
  for await (const [name, entry] of dir.entries())
    if (
      entry.kind === "file" &&
      (await entry.getFile()).lastModified < Date.now() - 86400000
    )
      await dir.removeEntry(name).catch(() => {});
  const name = crypto.randomUUID() + ".zip",
    handle = await dir.getFileHandle(name, { create: true }),
    writer = await handle.createWritable();
  const encode = new TextEncoder(),
    central = [];
  let offset = 0,
    centralBytes = 0,
    progress = 0;
  const write = async (bytes) => {
    signal?.throwIfAborted();
    await writer.write(bytes);
    offset += bytes.length;
    if (offset > 0xffffffff)
      throw Error("ZIP64 requis : export trop volumineux.");
  };
  try {
    const seen = new Set();
    for (const entry of entries) {
      signal?.throwIfAborted();
      if (
        seen.has(entry.name) ||
        entry.name.startsWith("/") ||
        entry.name.split("/").some((p) => !p || p === "..") ||
        entry.name.includes("\\")
      )
        throw Error("Chemin ZIP invalide ou dupliqué.");
      seen.add(entry.name);
      const file = entry.file ?? (await entry.open());
      if (!(file instanceof Blob) || file.size !== entry.size)
        throw Error("Le fichier a changé pendant l’export : " + entry.name);
      const filename = encode.encode(entry.name);
      if (filename.length > 65535) throw Error("Nom ZIP trop long.");
      let compressor;
      try {
        if (
          /\.(php|phtml|html?|css|[cm]?js|json|csv|sql|txt|md|svg)$/i.test(
            entry.name,
          )
        )
          compressor = new CompressionStream("deflate-raw");
      } catch {}
      const method = compressor ? 8 : 0,
        start = offset,
        header = new Uint8Array(30),
        h = new DataView(header.buffer);
      h.setUint32(0, 0x04034b50, true);
      h.setUint16(4, 20, true);
      h.setUint16(6, 0x808, true);
      h.setUint16(8, method, true);
      h.setUint16(26, filename.length, true);
      await write(header);
      await write(filename);
      const packedStart = offset;
      let crc = 0xffffffff,
        size = 0;
      let stream = file.stream().pipeThrough(
        new TransformStream({
          transform(chunk, controller) {
            signal?.throwIfAborted();
            size += chunk.length;
            if (size > entry.size)
              throw Error("Taille de fichier modifiée pendant l’export.");
            crc = crcStep(crc, chunk);
            controller.enqueue(chunk);
          },
        }),
      );
      if (compressor) stream = stream.pipeThrough(compressor);
      const reader = stream.getReader();
      try {
        for (;;) {
          const part = await reader.read();
          if (part.done) break;
          await write(part.value);
          onProgress(progress + size, entry.name);
        }
      } finally {
        await reader.cancel();
      }
      if (size !== entry.size) throw Error("Lecture du fichier incomplète.");
      progress += size;
      const compressed = offset - packedStart,
        checksum = (crc ^ 0xffffffff) >>> 0,
        descriptor = new Uint8Array(16),
        d = new DataView(descriptor.buffer);
      d.setUint32(0, 0x08074b50, true);
      d.setUint32(4, checksum, true);
      d.setUint32(8, compressed, true);
      d.setUint32(12, size, true);
      await write(descriptor);
      const record = new Uint8Array(46),
        v = new DataView(record.buffer);
      v.setUint32(0, 0x02014b50, true);
      v.setUint16(4, 20, true);
      v.setUint16(6, 20, true);
      v.setUint16(8, 0x808, true);
      v.setUint16(10, method, true);
      v.setUint32(16, checksum, true);
      v.setUint32(20, compressed, true);
      v.setUint32(24, size, true);
      v.setUint16(28, filename.length, true);
      v.setUint32(42, start, true);
      centralBytes += record.length + filename.length;
      if (centralBytes > 16 * 1048576) throw Error("Catalogue ZIP trop grand.");
      central.push(record, filename);
    }
    const directoryOffset = offset;
    for (const item of central) await write(item);
    const end = new Uint8Array(22),
      e = new DataView(end.buffer);
    e.setUint32(0, 0x06054b50, true);
    e.setUint16(8, entries.length, true);
    e.setUint16(10, entries.length, true);
    e.setUint32(12, offset - directoryOffset, true);
    e.setUint32(16, directoryOffset, true);
    await write(end);
    await writer.close();
    return await handle.getFile();
  } catch (error) {
    await writer.abort().catch(() => {});
    await dir.removeEntry(name).catch(() => {});
    throw error;
  }
}
