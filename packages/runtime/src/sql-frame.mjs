/** Decode native PBL1 frames. Integers/decimals stay exact strings, binary stays bytes. */
export function decodeSqlFrame(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 0;
  const u32 = () => { if (offset + 4 > bytes.length) throw Error('Truncated SQL frame'); const value = view.getUint32(offset, true); offset += 4; return value; };
  const take = length => { if (length > bytes.length - offset) throw Error('Truncated SQL cell'); const value = bytes.slice(offset, offset + length); offset += length; return value; };
  if (u32() !== 0x314c4250) throw Error('Invalid SQL frame magic');
  const count = u32(), rowCount = u32();
  const uint64 = () => { const low = u32(), high = u32(); return ((BigInt(high) << 32n) | BigInt(low)).toString(); };
  const affectedRows = uint64(), insertId = uint64();
  if (u32() !== bytes.length || count > 1024 || rowCount > 10000) throw Error('Invalid SQL frame dimensions');
  const text = new TextDecoder();
  const columns = Array.from({ length: count }, () => {
    const kind = u32(), nativeType = u32(), flags = u32();
    return { kind, nativeType, flags, name: text.decode(take(u32())) };
  });
  const rows = Array.from({ length: rowCount }, () => columns.map(column => {
    const length = u32();
    if (length === 0xffffffff) return null;
    const value = take(length);
    return column.kind === 2 ? value : text.decode(value);
  }));
  if (offset !== bytes.length) throw Error('Unexpected trailing SQL bytes');
  return { columns, rows, affectedRows, insertId };
}
