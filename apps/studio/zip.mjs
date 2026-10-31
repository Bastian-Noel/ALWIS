/** Small bounded ZIP importer/exporter: stored export, stored/deflate import. No ZIP64/encryption/symlinks. */
const MAX_BYTES = 64 * 1024 * 1024, MAX_FILES = 1024;
const encoder = new TextEncoder(), decoder = new TextDecoder('utf-8', { fatal: true });
const table = Uint32Array.from({ length: 256 }, (_, index) => { let value = index; for (let i = 0; i < 8; i++) value = value & 1 ? 0xedb88320 ^ value >>> 1 : value >>> 1; return value >>> 0; });
export function crc32(bytes) { let crc = 0xffffffff; for (const byte of bytes) crc = table[(crc ^ byte) & 255] ^ crc >>> 8; return (crc ^ 0xffffffff) >>> 0; }
function filename(name) {
  if (typeof name !== 'string' || !name || name.startsWith('/') || /^[A-Za-z]:/.test(name) || name.includes('\\') || name.includes('\0') || name.split('/').some(part => part === '..') || name.length > 4000) throw Error('Chemin ZIP invalide');
  return name;
}
function join(chunks) { const output = new Uint8Array(chunks.reduce((sum, chunk) => sum + chunk.length, 0)); let offset = 0; for (const chunk of chunks) { output.set(chunk, offset); offset += chunk.length; } return output; }
export function makeZip(entries) {
  if (entries.length > MAX_FILES) throw Error('Trop de fichiers dans le projet');
  let total = 0, offset = 0; const local = [], central = [], names = new Set();
  for (const entry of entries) {
    const name = encoder.encode(filename(entry.name)), bytes = entry.bytes;
    if (names.has(entry.name)) throw Error('Nom de fichier ZIP dupliqué'); names.add(entry.name);
    if (!(bytes instanceof Uint8Array) || name.length > 65535 || (total += bytes.length) > MAX_BYTES) throw Error('Projet trop volumineux');
    const crc = crc32(bytes), header = new Uint8Array(30), h = new DataView(header.buffer);
    h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x800, true); h.setUint32(14, crc, true); h.setUint32(18, bytes.length, true); h.setUint32(22, bytes.length, true); h.setUint16(26, name.length, true);
    local.push(header, name, bytes);
    const record = new Uint8Array(46), c = new DataView(record.buffer);
    c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x800, true); c.setUint32(16, crc, true); c.setUint32(20, bytes.length, true); c.setUint32(24, bytes.length, true); c.setUint16(28, name.length, true); c.setUint32(42, offset, true);
    central.push(record, name); offset += header.length + name.length + bytes.length;
  }
  const directory = join(central), end = new Uint8Array(22), e = new DataView(end.buffer);
  e.setUint32(0, 0x06054b50, true); e.setUint16(8, entries.length, true); e.setUint16(10, entries.length, true); e.setUint32(12, directory.length, true); e.setUint32(16, offset, true);
  return join([...local, directory, end]);
}
export async function readZip(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.length > MAX_BYTES + 1024 * 1024) throw Error('Archive trop volumineuse');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const requireRange = (offset, size) => { if (offset < 0 || size < 0 || offset + size > bytes.length) throw Error('Archive ZIP tronquée'); };
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) if (view.getUint32(i, true) === 0x06054b50 && i + 22 + view.getUint16(i + 20, true) === bytes.length) { end = i; break; }
  if (end < 0) throw Error('Répertoire ZIP introuvable');
  if (view.getUint16(end + 4, true) || view.getUint16(end + 6, true)) throw Error('ZIP multi-volumes non pris en charge');
  const count = view.getUint16(end + 10, true), directorySize = view.getUint32(end + 12, true); let offset = view.getUint32(end + 16, true);
  if (count > MAX_FILES || offset === 0xffffffff || directorySize === 0xffffffff) throw Error('ZIP64 ou archive trop grande');
  const directoryEnd = offset + directorySize; if (directoryEnd > end) throw Error('Répertoire ZIP invalide');
  const entries = [], names = new Set(); let total = 0;
  for (let i = 0; i < count; i++) {
    requireRange(offset, 46); if (view.getUint32(offset, true) !== 0x02014b50) throw Error('Entrée ZIP invalide');
    const flags = view.getUint16(offset + 8, true), method = view.getUint16(offset + 10, true), crc = view.getUint32(offset + 16, true), compressed = view.getUint32(offset + 20, true), size = view.getUint32(offset + 24, true);
    const nameLength = view.getUint16(offset + 28, true), extra = view.getUint16(offset + 30, true), comment = view.getUint16(offset + 32, true), attributes = view.getUint32(offset + 38, true), local = view.getUint32(offset + 42, true);
    requireRange(offset + 46, nameLength + extra + comment);
    if (flags & 1 || ![0, 8].includes(method) || compressed === 0xffffffff || size === 0xffffffff || (attributes >>> 16 & 0xf000) === 0xa000) throw Error('ZIP chiffré, méthode, ZIP64 ou lien symbolique non pris en charge');
    const name = filename(decoder.decode(bytes.subarray(offset + 46, offset + 46 + nameLength)));
    offset += 46 + nameLength + extra + comment;
    if (offset > directoryEnd || names.has(name)) throw Error('Entrées ZIP dupliquées ou invalides'); names.add(name);
    if (name.endsWith('/')) continue;
    if (size > 8 * 1024 * 1024 || (total += size) > MAX_BYTES) throw Error('Fichiers ZIP au-delà du budget');
    requireRange(local, 30); if (view.getUint32(local, true) !== 0x04034b50) throw Error('En-tête local ZIP invalide');
    const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
    requireRange(start, compressed);
    const packed = bytes.subarray(start, start + compressed); let unpacked;
    if (method === 0) unpacked = packed.slice();
    else {
      const reader = new Blob([packed]).stream().pipeThrough(new DecompressionStream('deflate-raw')).getReader();
      const chunks = []; let length = 0;
      try { while (true) { const part = await reader.read(); if (part.done) break; length += part.value.length; if (length > size) throw Error('Taille ZIP décompressée invalide'); chunks.push(part.value); } }
      finally { await reader.cancel(); }
      unpacked = join(chunks);
    }
    if (unpacked.length !== size || crc32(unpacked) !== crc) throw Error('Intégrité ZIP incorrecte');
    entries.push({ name, bytes: unpacked });
  }
  if (offset !== directoryEnd) throw Error('Répertoire ZIP incohérent');
  return entries;
}
