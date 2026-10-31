/** Inspect actual WASM import/export ABI without instantiating the engines.
 * Usage: node scripts/inspect-wasm-abi.mjs php.wasm mariadb.wasm [...]
 */
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const decoder = new TextDecoder();
function inspect(bytes, filename) {
  if (bytes.toString('hex', 0, 8) !== '0061736d01000000') throw new Error('Not a WebAssembly v1 module: ' + filename);
  let pos = 8;
  const u8 = () => { if (pos >= bytes.length) throw Error('Unexpected end of WASM'); return bytes[pos++]; };
  const u32 = () => {
    let number = 0, shift = 0;
    for (let i = 0; i < 5; i++) {
      const byte = u8(); number += (byte & 127) * 2 ** shift;
      if (!(byte & 128)) {
        if (number > 0xffffffff) throw Error('Invalid 32-bit unsigned integer');
        return number;
      }
      shift += 7;
    }
    throw Error('Invalid LEB128 integer');
  };
  const name = () => {
    const length = u32(), end = pos + length;
    if (end > bytes.length) throw Error('Truncated import name');
    const result = decoder.decode(bytes.subarray(pos, end)); pos = end; return result;
  };
  const limits = () => {
    const flags = u32();
    if (flags & ~3) throw Error('Only wasm32 memory/table limits are supported; flags=' + flags);
    const minPages = u32(), maxPages = flags & 1 ? u32() : null;
    return { minPages, maxPages, shared: !!(flags & 2), minBytes: minPages * 65536, maxBytes: maxPages === null ? null : maxPages * 65536 };
  };
  const memoryImports = [], definedMemories = [];
  while (pos < bytes.length) {
    const id = u8(), sectionSize = u32(), end = pos + sectionSize;
    if (end > bytes.length) throw Error('Truncated section');
    if (id === 2) {
      const count = u32();
      for (let i = 0; i < count; i++) {
        const module = name(), field = name(), kind = u8();
        if (kind === 0) u32();
        else if (kind === 1) { u8(); limits(); }
        else if (kind === 2) memoryImports.push({ module, name: field, ...limits() });
        else if (kind === 3) { u8(); u8(); }
        else if (kind === 4) { u32(); u32(); }
        else throw Error('Unsupported import kind: ' + kind);
      }
    } else if (id === 5) {
      const count = u32();
      for (let i = 0; i < count; i++) definedMemories.push(limits());
    }
    pos = end;
  }
  const module = new WebAssembly.Module(bytes);
  const imports = WebAssembly.Module.imports(module);
  const exports = WebAssembly.Module.exports(module);
  return {
    file: filename, sha256: createHash('sha256').update(bytes).digest('hex'), bytes: bytes.length,
    memoryImports, definedMemories, importedFunctions: imports.filter(x => x.kind === 'function').length,
    exportedMemories: exports.filter(x => x.kind === 'memory').map(x => x.name),
    interfaceExports: exports.filter(x => /^(php_wasm_|l4m_)/.test(x.name)).map(x => x.name),
    asyncifyExports: exports.filter(x => x.name.startsWith('asyncify_')).map(x => x.name),
    pthreadExports: exports.filter(x => /pthread|_emscripten_thread/.test(x.name)).map(x => x.name),
    hostCallImports: imports.filter(x => /host_call/i.test(x.name)).map(x => x.name),
  };
}
if (process.argv.length < 3) {
  console.error('Usage: node scripts/inspect-wasm-abi.mjs file.wasm [other.wasm ...]');
  process.exit(2);
}
for (const filepath of process.argv.slice(2)) {
  console.log(JSON.stringify(inspect(await readFile(filepath), filepath), null, 2));
}
