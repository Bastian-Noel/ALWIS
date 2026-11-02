/** MySQL client script lexer: delimiters inside strings/comments are data. */
export function splitSQL(text,{maxStatements=256}={}){
 if(typeof text!=='string'||text.includes('\0'))throw Error('Le script SQL ne doit pas contenir d’octet nul.');
 if(new TextEncoder().encode(text).length>8*1024*1024)throw Error('Script SQL limité à 8 Mio.');
 const statements=[];let delimiter=';',current='',quote='',comment='',hasCode=false,lineStart=true,words=[],routine=false,ordinaryCreate=false,blocks=[],afterEnd=false,statementStart=true;
 const flush=()=>{if(hasCode){statements.push(current.trim());if(statements.length>maxStatements)throw Error(`Script limité à ${maxStatements} instructions. Découpez le fichier.`);}current='';hasCode=false;words=[];routine=false;ordinaryCreate=false;blocks=[];afterEnd=false;statementStart=true;};
 for(let i=0;i<text.length;){const c=text[i],next=text[i+1];
  if(comment==='line'){current+=c;i++;if(c==='\n'){comment='';lineStart=true;}continue;}
  if(comment==='block'){current+=c;i++;if(c==='*'&&next==='/'){current+='/';i++;comment='';}lineStart=c==='\n';continue;}
  if(quote){current+=c;i++;if(c==='\\'&&quote!=='`'&&i<text.length){current+=text[i++];continue;}if(c===quote){if(text[i]===quote){current+=text[i++];}else quote='';}lineStart=c==='\n';continue;}
  if(lineStart){const directive=/^[ \t]*DELIMITER[ \t]+([^\s]+)[ \t]*(?:\r?\n|$)/i.exec(text.slice(i));if(directive){if(hasCode)throw Error('DELIMITER doit suivre une instruction terminée.');if(directive[1].length>16||/[\x00-\x20'"`\\]/.test(directive[1]))throw Error('Délimiteur SQL invalide (16 caractères maximum).');delimiter=directive[1];i+=directive[0].length;lineStart=true;continue;}}
  if(text.startsWith(delimiter,i)){if(delimiter===';'&&blocks.length){current+=';';statementStart=true;}else flush();i+=delimiter.length;lineStart=false;continue;}
  if(c==='#'||(c==='-'&&next==='-'&&(/\s/.test(text[i+2]??'\n')))){comment='line';current+=c;if(c==='-'){current+='-';i++;}i++;continue;}
  if(c==='/'&&next==='*'){if(text[i+2]==='!'||text.slice(i+2,i+4)==='M!')hasCode=true;comment='block';current+='/*';i+=2;continue;}
  if(/[A-Za-z_]/.test(c)){
   let token=/^[A-Za-z_][A-Za-z_0-9$]*/.exec(text.slice(i))[0];if(delimiter!==';'&&token.includes(delimiter))token=token.slice(0,token.indexOf(delimiter));const word=token.toUpperCase();
   if(words.length<64)words.push(word);
   if(words[0]==='CREATE'&&!routine){if(['TABLE','VIEW','DATABASE','SCHEMA','INDEX','USER'].includes(word))ordinaryCreate=true;if(!ordinaryCreate&&['PROCEDURE','FUNCTION','TRIGGER','EVENT'].includes(word))routine=true;}
   if(routine){
    if(word==='END'){if(blocks.length)blocks.pop();afterEnd=true;statementStart=false;}
    else if(afterEnd&&['IF','LOOP','WHILE','REPEAT','CASE'].includes(word)){afterEnd=false;}
    else{afterEnd=false;const nextCode=text.slice(i+token.length).trimStart();if(word==='BEGIN'||word==='CASE'||(blocks.length&&(['LOOP','WHILE','REPEAT'].includes(word)&&!nextCode.startsWith('(')||word==='IF'&&statementStart)))blocks.push(word);statementStart=['BEGIN','THEN','ELSE','DO'].includes(word);}
   }
   current+=token;hasCode=true;i+=token.length;lineStart=false;continue;
  }
  if(c==="'"||c==='"'||c==='`'){quote=c;hasCode=true;}else if(!/\s/.test(c))hasCode=true;
  current+=c;i++;lineStart=c==='\n';
 }
 if(quote||comment==='block')throw Error('Chaîne ou commentaire SQL non terminé. Corrigez le script avant de l’exécuter.');
 flush();return statements;
}
export function encodeSQLScript(statements){const chunks=statements.map(sql=>new TextEncoder().encode(sql));const length=chunks.reduce((n,b)=>n+4+b.length,0);if(length>8*1024*1024+16384)throw Error('Import SQL trop volumineux.');const output=new Uint8Array(length),view=new DataView(output.buffer);let offset=0;for(const bytes of chunks){view.setUint32(offset,bytes.length,true);offset+=4;output.set(bytes,offset);offset+=bytes.length;}return output;}
