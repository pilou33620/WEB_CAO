"use strict";
/* Déplacé tel quel de editeur-pcb/js/04-fabrication.js (fabrication.zip),
   pour servir aussi au dossier mécanique de la visionneuse IPC-2581. */

/* ==========================================================================
   Archive ZIP (sans compression) — pour livrer un seul fichier
   ========================================================================== */
const CRC_T=(()=>{
  const t=new Uint32Array(256);
  for(let n=0;n<256;n++){
    let c=n;
    for(let k=0;k<8;k++)c=(c&1)?(0xEDB88320^(c>>>1)):(c>>>1);
    t[n]=c>>>0;
  }
  return t;
})();
function crc32(buf){
  let c=0xFFFFFFFF;
  for(let i=0;i<buf.length;i++)c=CRC_T[(c^buf[i])&0xFF]^(c>>>8);
  return (c^0xFFFFFFFF)>>>0;
}
/* Les octets de l'archive : le dossier JLCPCB y glisse l'archive Gerber telle quelle. */
function zipOctets(files){
  const enc=new TextEncoder();
  const parts=[], central=[];
  let off=0;
  const u16=v=>[v&255,(v>>8)&255];
  const u32=v=>[v&255,(v>>8)&255,(v>>16)&255,(v>>24)&255];
  const now=new Date();
  const time=((now.getHours()<<11)|(now.getMinutes()<<5)|(now.getSeconds()>>1))&0xFFFF;
  const date=(((now.getFullYear()-1980)<<9)|((now.getMonth()+1)<<5)|now.getDate())&0xFFFF;
  for(const f of files){
    const name=enc.encode(f.name);
    // les CSV doivent porter la marque d'ordre UTF-8 pour Excel et les
    // outils d'assemblage (JLCPCB, PCBA…)
    const csvBOM=f.name.endsWith(".csv")?"\ufeff":"";
    // f.data pour les fichiers binaires (PDF…), f.text pour le reste
    const data=f.data||enc.encode(csvBOM+f.text);
    const crc=crc32(data);
    const head=[].concat(u32(0x04034b50),u16(20),u16(0x0800),u16(0),
      u16(time),u16(date),u32(crc),u32(data.length),u32(data.length),
      u16(name.length),u16(0));
    parts.push(new Uint8Array(head),name,data);
    central.push([].concat(u32(0x02014b50),u16(20),u16(20),u16(0x0800),u16(0),
      u16(time),u16(date),u32(crc),u32(data.length),u32(data.length),
      u16(name.length),u16(0),u16(0),u16(0),u16(0),u32(0),u32(off)));
    central.push(name);
    off+=head.length+name.length+data.length;
  }
  let cLen=0;
  const cParts=[];
  for(const c of central){
    const a=(c instanceof Uint8Array)?c:new Uint8Array(c);
    cParts.push(a);cLen+=a.length;
  }
  const end=new Uint8Array([].concat(u32(0x06054b50),u16(0),u16(0),
    u16(files.length),u16(files.length),u32(cLen),u32(off),u16(0)));
  const tout=parts.concat(cParts,[end]), out=new Uint8Array(tout.reduce((n,a)=>n+a.length,0));
  let o=0;
  for(const a of tout){out.set(a,o);o+=a.length;}
  return out;
}
function zipBlob(files){
  return new Blob([zipOctets(files)],{type:"application/zip"});
}
