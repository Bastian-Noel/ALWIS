/** Small bounded ZIP importer/exporter: stored export, stored/deflate import. No ZIP64/encryption/symlinks. */
const MAX_BYTES = 64 * 1024 * 1024,
  MAX_FILES = 1024;
const encoder = new TextEncoder(),
  decoder = new TextDecoder("utf-8", { fatal: true });
const table = Uint32Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let i = 0; i < 8; i++)
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  return value >>> 0;
});
export function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = table[(crc ^ byte) & 255] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
function filename(name) {
  if (
    typeof name !== "string" ||
    !name ||
    name.startsWith("/") ||
    /^[A-Za-z]:/.test(name) ||
    name.includes("\\") ||
    name.includes("\0") ||
    name.split("/").some((part) => part === "..") ||
    name.length > 4000
  )
    throw Error("Chemin ZIP invalide");
  return name;
}
function join(chunks) {
  const output = new Uint8Array(
    chunks.reduce((sum, chunk) => sum + chunk.length, 0),
  );
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.length;
  }
  return output;
}
export function makeZip(entries) {
  if (entries.length > MAX_FILES)
    throw Error("Trop de fichiers dans le projet");
  let total = 0,
    offset = 0;
  const local = [],
    central = [],
    names = new Set();
  for (const entry of entries) {
    const name = encoder.encode(filename(entry.name)),
      bytes = entry.bytes;
    if (names.has(entry.name)) throw Error("Nom de fichier ZIP dupliqué");
    names.add(entry.name);
    if (
      !(bytes instanceof Uint8Array) ||
      name.length > 65535 ||
      (total += bytes.length) > MAX_BYTES
    )
      throw Error("Projet trop volumineux");
    const packed = entry.packed ?? bytes,
      method = entry.packed ? 8 : 0;
    const crc = crc32(bytes),
      header = new Uint8Array(30),
      h = new DataView(header.buffer);
    h.setUint32(0, 0x04034b50, true);
    h.setUint16(4, 20, true);
    h.setUint16(6, 0x800, true);
    h.setUint32(14, crc, true);
    h.setUint16(8, method, true);
    h.setUint32(18, packed.length, true);
    h.setUint32(22, bytes.length, true);
    h.setUint16(26, name.length, true);
    local.push(header, name, packed);
    const record = new Uint8Array(46),
      c = new DataView(record.buffer);
    c.setUint32(0, 0x02014b50, true);
    c.setUint16(4, 20, true);
    c.setUint16(6, 20, true);
    c.setUint16(8, 0x800, true);
    c.setUint32(16, crc, true);
    c.setUint16(10, method, true);
    c.setUint32(20, packed.length, true);
    c.setUint32(24, bytes.length, true);
    c.setUint16(28, name.length, true);
    c.setUint32(42, offset, true);
    central.push(record, name);
    offset += header.length + name.length + packed.length;
  }
  const directory = join(central),
    end = new Uint8Array(22),
    e = new DataView(end.buffer);
  e.setUint32(0, 0x06054b50, true);
  e.setUint16(8, entries.length, true);
  e.setUint16(10, entries.length, true);
  e.setUint32(12, directory.length, true);
  e.setUint32(16, offset, true);
  return join([...local, directory, end]);
}
export async function readZip(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.length > MAX_BYTES + 1024 * 1024)
    throw Error("Archive trop volumineuse");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const requireRange = (offset, size) => {
    if (offset < 0 || size < 0 || offset + size > bytes.length)
      throw Error("Archive ZIP tronquée");
  };
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--)
    if (
      view.getUint32(i, true) === 0x06054b50 &&
      i + 22 + view.getUint16(i + 20, true) === bytes.length
    ) {
      end = i;
      break;
    }
  if (end < 0) throw Error("Répertoire ZIP introuvable");
  if (view.getUint16(end + 4, true) || view.getUint16(end + 6, true))
    throw Error("ZIP multi-volumes non pris en charge");
  const count = view.getUint16(end + 10, true),
    directorySize = view.getUint32(end + 12, true);
  let offset = view.getUint32(end + 16, true);
  if (
    count > MAX_FILES ||
    offset === 0xffffffff ||
    directorySize === 0xffffffff
  )
    throw Error("ZIP64 ou archive trop grande");
  const directoryEnd = offset + directorySize;
  if (directoryEnd > end) throw Error("Répertoire ZIP invalide");
  const entries = [],
    names = new Set();
  let total = 0;
  for (let i = 0; i < count; i++) {
    requireRange(offset, 46);
    if (view.getUint32(offset, true) !== 0x02014b50)
      throw Error("Entrée ZIP invalide");
    const flags = view.getUint16(offset + 8, true),
      method = view.getUint16(offset + 10, true),
      crc = view.getUint32(offset + 16, true),
      compressed = view.getUint32(offset + 20, true),
      size = view.getUint32(offset + 24, true);
    const nameLength = view.getUint16(offset + 28, true),
      extra = view.getUint16(offset + 30, true),
      comment = view.getUint16(offset + 32, true),
      attributes = view.getUint32(offset + 38, true),
      local = view.getUint32(offset + 42, true);
    requireRange(offset + 46, nameLength + extra + comment);
    if (
      flags & 1 ||
      ![0, 8].includes(method) ||
      compressed === 0xffffffff ||
      size === 0xffffffff ||
      ((attributes >>> 16) & 0xf000) === 0xa000
    )
      throw Error(
        "ZIP chiffré, méthode, ZIP64 ou lien symbolique non pris en charge",
      );
    const name = filename(
      decoder.decode(bytes.subarray(offset + 46, offset + 46 + nameLength)),
    );
    offset += 46 + nameLength + extra + comment;
    if (offset > directoryEnd || names.has(name))
      throw Error("Entrées ZIP dupliquées ou invalides");
    names.add(name);
    if (name.endsWith("/")) continue;
    if (size > 16 * 1024 * 1024 || (total += size) > MAX_BYTES)
      throw Error("Fichiers ZIP au-delà du budget");
    requireRange(local, 30);
    if (view.getUint32(local, true) !== 0x04034b50)
      throw Error("En-tête local ZIP invalide");
    const start =
      local +
      30 +
      view.getUint16(local + 26, true) +
      view.getUint16(local + 28, true);
    requireRange(start, compressed);
    const packed = bytes.subarray(start, start + compressed);
    let unpacked;
    if (method === 0) unpacked = packed.slice();
    else {
      const reader = new Blob([packed])
        .stream()
        .pipeThrough(new DecompressionStream("deflate-raw"))
        .getReader();
      const chunks = [];
      let length = 0;
      try {
        while (true) {
          const part = await reader.read();
          if (part.done) break;
          length += part.value.length;
          if (length > size) throw Error("Taille ZIP décompressée invalide");
          chunks.push(part.value);
        }
      } finally {
        await reader.cancel();
      }
      unpacked = join(chunks);
    }
    if (unpacked.length !== size || crc32(unpacked) !== crc)
      throw Error("Intégrité ZIP incorrecte");
    entries.push({ name, bytes: unpacked });
  }
  if (offset !== directoryEnd) throw Error("Répertoire ZIP incohérent");
  return entries;
}

/** Browser-native compression, offloaded by zip-worker. Avoid a second WASM heap. */
export async function makeCompressedZip(entries) {
  if (
    entries.length > MAX_FILES ||
    entries.reduce((n, e) => n + e.bytes.length, 0) > MAX_BYTES
  )
    throw Error("Projet au-delà du budget ZIP (64 Mio, 1 024 fichiers).");
  const packed = [];
  for (const entry of entries) {
    let compressed;
    try {
      const stream = new Blob([entry.bytes])
        .stream()
        .pipeThrough(new CompressionStream("deflate-raw"));
      compressed = new Uint8Array(await new Response(stream).arrayBuffer());
    } catch {
      /* Stored ZIP remains compatible on browsers without deflate-raw compression. */
    }
    packed.push({
      ...entry,
      packed: compressed?.length < entry.bytes.length ? compressed : undefined,
    });
  }
  return makeZip(packed);
}

/** Inspect the central directory of a File/Blob without reading excluded payloads. */
export async function inspectZipFile(file) {
  if (!(file instanceof Blob) || file.size < 22)
    throw Error("Ce fichier ne contient pas un ZIP complet.");
  const tailStart = Math.max(0, file.size - 65557),
    tail = new Uint8Array(await file.slice(tailStart).arrayBuffer());
  const v = new DataView(tail.buffer);
  let end = -1;
  for (let i = tail.length - 22; i >= 0; i--)
    if (
      v.getUint32(i, true) === 0x06054b50 &&
      i + 22 + v.getUint16(i + 20, true) === tail.length
    ) {
      end = i;
      break;
    }
  if (end < 0)
    throw Error(
      "Répertoire ZIP introuvable : archive incomplète ou format non pris en charge.",
    );
  if (v.getUint16(end + 4, true) || v.getUint16(end + 6, true))
    throw Error("Les ZIP multi-volumes ne sont pas pris en charge.");
  const count = v.getUint16(end + 10, true),
    length = v.getUint32(end + 12, true),
    start = v.getUint32(end + 16, true);
  if (count === 65535 || length === 0xffffffff || start === 0xffffffff)
    throw Error(
      "ZIP64 non pris en charge. Exportez un ZIP standard ou ouvrez le dossier local.",
    );
  if (count > 50000 || length > 16 * 1048576)
    throw Error(
      "L’archive dépasse la limite d’analyse de 50 000 entrées ou 16 Mio de métadonnées. Ouvrez un sous-dossier.",
    );
  if (start + length !== tailStart + end)
    throw Error("Répertoire ZIP tronqué.");
  const bytes = new Uint8Array(
      await file.slice(start, start + length).arrayBuffer(),
    ),
    view = new DataView(bytes.buffer);
  const entries = [],
    names = new Set();
  let offset = 0;
  for (let i = 0; i < count; i++) {
    if (
      offset + 46 > bytes.length ||
      view.getUint32(offset, true) !== 0x02014b50
    )
      throw Error("Entrée ZIP invalide.");
    const flags = view.getUint16(offset + 8, true),
      method = view.getUint16(offset + 10, true),
      crc = view.getUint32(offset + 16, true),
      compressed = view.getUint32(offset + 20, true),
      size = view.getUint32(offset + 24, true),
      n = view.getUint16(offset + 28, true),
      extra = view.getUint16(offset + 30, true),
      comment = view.getUint16(offset + 32, true),
      attributes = view.getUint32(offset + 38, true),
      local = view.getUint32(offset + 42, true);
    if (offset + 46 + n + extra + comment > bytes.length)
      throw Error("Nom ZIP tronqué.");
    const name = filename(
      decoder.decode(bytes.subarray(offset + 46, offset + 46 + n)),
    );
    if ([size, compressed, local].includes(0xffffffff))
      throw Error("ZIP64 non pris en charge : " + name);
    const reason =
      flags & 1
        ? "Fichier chiffré"
        : ((attributes >>> 16) & 0xf000) === 0xa000
          ? "Lien symbolique"
          : ![0, 8].includes(method)
            ? "Compression non prise en charge"
            : "";
    if (names.has(name)) throw Error("Fichier dupliqué dans le ZIP : " + name);
    names.add(name);
    offset += 46 + n + extra + comment;
    if (name.endsWith("/")) continue;
    if (local + 30 > start || local + 30 + compressed > start)
      throw Error("Position ZIP invalide : " + name);
    entries.push({
      name,
      size,
      compressed,
      method,
      crc,
      local,
      directoryStart: start,
      locked: !!reason,
      reason,
    });
  }
  if (offset !== bytes.length) throw Error("Répertoire ZIP incohérent.");
  return entries;
}
export async function extractZipFile(file, selected) {
  const entries = await inspectZipFile(file),
    names = new Set(selected),
    chosen = entries.filter((e) => names.has(e.name));
  if (chosen.some((e) => e.locked))
    throw Error(
      "Fichier non importable : " + chosen.find((e) => e.locked).name,
    );
  if (chosen.length !== names.size)
    throw Error("La sélection ne correspond plus au ZIP.");
  if (
    chosen.length > 1024 ||
    chosen.reduce((n, e) => n + e.size, 0) > MAX_BYTES ||
    chosen.reduce((n, e) => n + e.compressed, 0) > 65 * 1048576 ||
    chosen.some((e) => e.size > 16 * 1048576 || e.compressed > 17 * 1048576)
  )
    throw Error(
      "Sélection ZIP trop grande : 16 Mio par fichier, 64 Mio et 1 024 fichiers au total.",
    );
  const result = [];
  for (const entry of chosen) {
    const header = new Uint8Array(
        await file.slice(entry.local, entry.local + 30).arrayBuffer(),
      ),
      h = new DataView(header.buffer);
    if (
      h.getUint32(0, true) !== 0x04034b50 ||
      h.getUint16(8, true) !== entry.method ||
      h.getUint16(6, true) & 1
    )
      throw Error("En-tête ZIP invalide : " + entry.name);
    const n = h.getUint16(26, true),
      extra = h.getUint16(28, true),
      start = entry.local + 30 + n + extra;
    if (start + entry.compressed > entry.directoryStart)
      throw Error("Contenu ZIP tronqué : " + entry.name);
    if (
      decoder.decode(
        await file.slice(entry.local + 30, entry.local + 30 + n).arrayBuffer(),
      ) !== entry.name
    )
      throw Error("Chemins ZIP incohérents : " + entry.name);
    let unpacked;
    if (entry.method === 0)
      unpacked = new Uint8Array(
        await file.slice(start, start + entry.compressed).arrayBuffer(),
      );
    else {
      const reader = file
          .slice(start, start + entry.compressed)
          .stream()
          .pipeThrough(new DecompressionStream("deflate-raw"))
          .getReader(),
        chunks = [];
      let size = 0;
      try {
        for (;;) {
          const part = await reader.read();
          if (part.done) break;
          size += part.value.length;
          if (size > entry.size)
            throw Error("Taille ZIP décompressée invalide : " + entry.name);
          chunks.push(part.value);
        }
      } finally {
        await reader.cancel();
      }
      unpacked = join(chunks);
    }
    if (unpacked.length !== entry.size || crc32(unpacked) !== entry.crc)
      throw Error("Intégrité ZIP incorrecte : " + entry.name);
    result.push({ name: entry.name, bytes: unpacked });
  }
  return result;
}

/** Streaming source for one chosen entry; the disk sink verifies size and CRC. */
export async function zipEntryStream(file,entry) {
 const header=new Uint8Array(await file.slice(entry.local,entry.local+30).arrayBuffer()),h=new DataView(header.buffer);
 if(header.length!==30||h.getUint32(0,true)!==0x04034b50||h.getUint16(8,true)!==entry.method||h.getUint16(6,true)&1)throw Error('En-tête ZIP invalide : '+entry.name);
 const n=h.getUint16(26,true),extra=h.getUint16(28,true),start=entry.local+30+n+extra;
 if(start+entry.compressed>entry.directoryStart)throw Error('Contenu ZIP tronqué : '+entry.name);
 if(decoder.decode(await file.slice(entry.local+30,entry.local+30+n).arrayBuffer())!==entry.name)throw Error('Chemins ZIP incohérents : '+entry.name);
 if(entry.size>16*1048576&&entry.size>Math.max(1,entry.compressed)*2000)throw Error('Compression disproportionnée : '+entry.name);
 const stream=file.slice(start,start+entry.compressed).stream();return entry.method===8?stream.pipeThrough(new DecompressionStream('deflate-raw')):stream;
}
