/** Layer dependencies, then align related tables while avoiding overlapping cards. */
export function schemaLayout(tables) {
  const sorted = [...tables].sort((a,b)=>a.name.localeCompare(b.name));
  const nodes = new Map(sorted.map(t=>[t.name,t]));
  const depths = new Map(), visiting = new Set();
  const parents = t => (t.fks??[]).map(f=>f.refTable).filter(n=>n!==t.name&&nodes.has(n));
  function depth(name) {
    if(depths.has(name))return depths.get(name);
    if(visiting.has(name))return 0;
    visiting.add(name);
    const refs=parents(nodes.get(name));
    const value=refs.length?1+Math.max(...refs.map(depth)):0;
    visiting.delete(name);depths.set(name,value);return value;
  }
  const layers=new Map();
  for(const t of sorted){const d=depth(t.name);if(!layers.has(d))layers.set(d,[]);layers.get(d).push(t);}
  const positions={};
  const height=t=>46+t.columns.length*26;
  const center=name=>positions[name][1]+height(nodes.get(name))/2;
  for(const [d,list] of [...layers].sort((a,b)=>a[0]-b[0])) {
    const target=t=>{const refs=parents(t).filter(n=>positions[n]);return refs.length?refs.reduce((sum,n)=>sum+center(n),0)/refs.length:40+height(t)/2;};
    list.sort((a,b)=>target(a)-target(b)||a.name.localeCompare(b.name));
    let bottom=40;
    for(const t of list){const y=Math.max(bottom,target(t)-height(t)/2);positions[t.name]=[40+d*328,y];bottom=y+height(t)+36;}
  }
  return positions;
}
