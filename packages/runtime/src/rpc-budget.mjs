/** Conservative bounded accounting before postMessage clones caller payloads. */
export function messageBytes(value,limit=8*1024*1024) {
  let total=0,nodes=0;const active=new Set();
  const add=bytes=>{total+=bytes;if(total>limit)throw Error('Runtime message exceeds byte budget');};
  const text=value=>{
    for(let i=0;i<value.length;i++){
      const code=value.charCodeAt(i);
      if(code<128)add(1);else if(code<2048)add(2);
      else if(code>=0xd800&&code<=0xdbff&&i+1<value.length&&value.charCodeAt(i+1)>=0xdc00&&value.charCodeAt(i+1)<=0xdfff){add(4);i++;}else add(3);
    }
  };
  const visit=(value,depth)=>{
    if(++nodes>8192||depth>16)throw Error('Runtime message has too much metadata');
    if(value===null||value===undefined||typeof value==='boolean'||typeof value==='number'){add(8);return;}
    if(typeof value==='string'){text(value);return;}
    if(value instanceof Uint8Array){add(value.byteLength);return;}
    if(typeof value!=='object'||(!Array.isArray(value)&&![Object.prototype,null].includes(Object.getPrototypeOf(value))))throw Error('Runtime messages require plain data');
    if(active.has(value))throw Error('Cyclic runtime message');
    active.add(value);add(16);
    for(const key of Object.keys(value)){text(key);visit(value[key],depth+1);}
    active.delete(value);
  };
  visit(value,0);return total;
}
