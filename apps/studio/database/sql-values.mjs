/** Lossless literals shared by tools. No JavaScript number coercion of SQL values. */
export const identifier = value => '`' + String(value).replace(/`/g, '``') + '`';
export function literal(value,column) {
  if (value === null) return 'NULL';
  const binary=value instanceof Uint8Array;
  if(binary&&column?.nativeType===16)return `b'${[...value].map(byte=>byte.toString(2).padStart(8,'0')).join('')}'`;
  const hex=[...(binary?value:new TextEncoder().encode(String(value)))].map(byte=>byte.toString(16).padStart(2,'0')).join('');
  return binary?`X'${hex}'`:`CONVERT(X'${hex}' USING utf8mb4)`;
}
export function editValue(mode,text) {
  if(mode==='null') return null;
  if(mode==='text') return text;
  if(mode!=='hex' || !/^(?:[\da-fA-F]{2})*$/.test(text)) throw Error('Valeur binaire : utilisez un nombre pair de chiffres hexadécimaux.');
  return Uint8Array.from(text.match(/../g)??[],byte=>parseInt(byte,16));
}
export const sameValue=(a,b)=>a instanceof Uint8Array&&b instanceof Uint8Array?a.length===b.length&&a.every((byte,i)=>byte===b[i]):a===b;
