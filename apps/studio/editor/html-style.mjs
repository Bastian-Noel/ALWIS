import { parsers } from 'prettier/plugins/html';
const voidTags = new Set('area base br col embed hr img input link meta param source track wbr'.split(' '));
/** Normalize only parsed HTML void tags; preserve embedded code, attributes and SVG/MathML. */
export function htmlVoidStyle(text) {
  const edits=[];
  function visit(node,foreign=false) {
    foreign ||= ['svg','math'].includes(node.name?.toLowerCase());
    if (!foreign && node.kind==='element' && voidTags.has(node.name?.toLowerCase())) {
      const end=node.startSourceSpan?.end.offset ?? node.sourceSpan.end.offset;
      if (text.slice(end-2,end)==='/>') edits.push(end-2);
    }
    for(const child of node.children??[])visit(child,foreign);
  }
  visit(parsers.html.parse(text));
  for(const offset of edits.sort((a,b)=>b-a))text=text.slice(0,offset).replace(/[ \t]+$/,'')+text.slice(offset+1);
  return text;
}
