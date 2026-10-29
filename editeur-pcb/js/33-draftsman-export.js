"use strict";
/* ==========================================================================
   Éditeur PCB — Draftsman : fonte embarquée
   --------------------------------------------------------------------------
   LA FONTE EMBARQUÉE dans le PDF des plans. Helvetica n'est pas
   embarquée : chaque lecteur la remplace par ce qu'il a (Arial, Nimbus,
   parfois pire), et WinAnsi ne connaît ni Ω, ni ≤, ni ≥. La fonte est ici
   PlansSans, un sous-ensemble de Liberation Sans (OFL 1.1) pré-réduit par
   outils/fonte-plans.py dans js/fontes/plans-sans.js : 432 caractères,
   29 Ko par graisse, 80 Ko de base64 pour les deux — pour 820 Ko de
   fontes d'origine. Liberation Sans a les chasses d'Arial, donc
   d'Helvetica : la mise en page des plans (repères centrés, colonnes
   coupées avec la table d'Helvetica) ne bouge pas d'un trait.

   À chaque PDF, on ne garde que les glyphes que ses feuilles emploient :
   tables glyf / loca réduites, cmap, hmtx, head, hhea, maxp, OS/2, name et
   post minimal, réécrits en JavaScript pur. Le PDF la déclare en
   CIDFontType2, codage Identity-H (deux octets par glyphe), avec une
   /ToUnicode : le texte reste cherchable et copiable, Ω, µ, ±, °, ≤ et ≥
   compris, et les textes invisibles du plan aussi. Un caractère que la
   fonte n'a pas suit le même chemin qu'avant (⌀ → Ø, ✓ → OK, lettre
   sans son accent, puis « ? »).

   Option « Fonte embarquée » de la fenêtre, cochée par défaut, gardée
   dans le document (`dessin.fonte`). Sans elle, ou si la fonte n'est pas
   chargée, le PDF reprend Helvetica en WinAnsi, comme avant.

   Le Master Drawing (04-pdf-masterdraw.js) emporte la même fonte, par
   le même sous-ensembleur et sous la même option, mais en TrueType
   simple d'un octet par caractère (dffPreparerSimple) : l'ASCII y garde
   son code, et son contenu se relit en clair. dffStyles, dffEtiquette,
   dffToUnicode et dffDescripteur servent les deux.

   Points d'accroche dans les autres fichiers, un appel chacun :
   dfFontePreparer() dans dfPdf() (29-draftsman.js), dffCadre() à la fin de
   dfRendreCadre(), dffPreparerSimple() dans mdFonte() (04-pdf-masterdraw.js).
   ========================================================================== */

/* Appelé à la fin de dfRendreCadre() : l'option de fonte dans le volet des réglages. */
function dffCadre(m){
  if(!m||!m.querySelector)return;
  const fm=m.querySelector('select[data-cfg="format"]');
  if(fm&&fm.insertAdjacentHTML)
    fm.insertAdjacentHTML("afterend",'<div class="df-h">PDF</div><label class="df-case" title="Sous-ensemble de la fonte PlansSans (Liberation Sans) embarqué : même rendu dans tous les lecteurs, Ω, ≤, ≥ écrits tels quels, texte toujours cherchable et copiable — vaut aussi pour le Master Drawing de Fabrication .zip">'+
      '<input type="checkbox" data-fonte="1"'+(dfCfg().fonte?" checked":"")+'> Fonte embarquée</label>');
  if(m.dffBranche)return;
  m.dffBranche=true;
  m.addEventListener("change",e=>{
    const t=e.target;
    if(t&&t.dataset&&t.dataset.fonte){push();dfRegler("fonte",!!t.checked);}
  });
}

/* ==========================================================================
   Fonte embarquée : lecture d'une TrueType
   ========================================================================== */
const DFF_B64="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
function dffBase64(s){
  const t=new Int16Array(128).fill(-1);
  for(let i=0;i<64;i++)t[DFF_B64.charCodeAt(i)]=i;
  s=String(s).replace(/[^A-Za-z0-9+/]/g,"");
  const out=new Uint8Array(Math.floor(s.length*3/4));
  let o=0,acc=0,nb=0;
  for(let i=0;i<s.length;i++){
    acc=(acc<<6)|t[s.charCodeAt(i)];nb+=6;
    if(nb>=8){nb-=8;out[o++]=(acc>>nb)&255;}
  }
  return out.subarray(0,o);
}
/* Tables, métriques, cmap (formats 4 et 12) et décalages des glyphes. */
function dffLire(u8){
  const dv=new DataView(u8.buffer,u8.byteOffset,u8.byteLength);
  const tab={};
  const nt=dv.getUint16(4);
  for(let i=0;i<nt;i++){
    const p=12+16*i;
    tab[String.fromCharCode(u8[p],u8[p+1],u8[p+2],u8[p+3])]={off:dv.getUint32(p+8),len:dv.getUint32(p+12)};
  }
  for(const k of ["head","hhea","maxp","hmtx","loca","glyf","cmap"])
    if(!tab[k])throw new Error("fonte : table "+k+" absente");
  const H=tab.head.off, ng=dv.getUint16(tab.maxp.off+4);
  const longue=dv.getInt16(H+50)===1;
  const loca=[];
  for(let i=0;i<=ng;i++)loca.push(longue?dv.getUint32(tab.loca.off+4*i):2*dv.getUint16(tab.loca.off+2*i));
  const nh=dv.getUint16(tab.hhea.off+34), hm=[];
  for(let i=0;i<ng;i++){
    const k=Math.min(i,nh-1);
    hm.push([dv.getUint16(tab.hmtx.off+4*k),
             i<nh?dv.getInt16(tab.hmtx.off+4*i+2):dv.getInt16(tab.hmtx.off+4*nh+2*(i-nh))]);
  }
  const cmap=new Map(), C=tab.cmap.off;
  let f4=-1,f12=-1;
  for(let i=0;i<dv.getUint16(C+2);i++){
    const pid=dv.getUint16(C+4+8*i), eid=dv.getUint16(C+6+8*i), o=C+dv.getUint32(C+8+8*i);
    const fmt=dv.getUint16(o);
    if(pid===3&&eid===10&&fmt===12)f12=o;
    else if((pid===3&&eid===1||pid===0)&&fmt===4)f4=o;
  }
  if(f12>=0){
    for(let k=0;k<dv.getUint32(f12+12);k++){
      const a=dv.getUint32(f12+16+12*k), b=dv.getUint32(f12+20+12*k), g=dv.getUint32(f12+24+12*k);
      for(let c=a;c<=b&&c-a<0x10000;c++)cmap.set(c,g+c-a);
    }
  }else if(f4>=0){
    const seg=dv.getUint16(f4+6)/2, E=f4+14, St=E+2*seg+2, De=St+2*seg, Ro=De+2*seg;
    for(let i=0;i<seg;i++){
      const e=dv.getUint16(E+2*i), s=dv.getUint16(St+2*i), d=dv.getInt16(De+2*i), r=dv.getUint16(Ro+2*i);
      for(let c=s;c<=e&&c!==0xFFFF;c++){
        let g;
        if(!r)g=(c+d)&0xFFFF;
        else{g=dv.getUint16(Ro+2*i+r+2*(c-s));if(g)g=(g+d)&0xFFFF;}
        if(g)cmap.set(c,g);
      }
    }
  }else throw new Error("fonte : pas de cmap Unicode");
  const O=tab["OS/2"]?tab["OS/2"].off:-1;
  return {u8,dv,tab,ng,loca,hm,cmap,
    upm:dv.getUint16(H+18),
    bbox:[dv.getInt16(H+36),dv.getInt16(H+38),dv.getInt16(H+40),dv.getInt16(H+42)],
    asc:O>=0?dv.getInt16(O+68):dv.getInt16(tab.hhea.off+4),
    desc:O>=0?dv.getInt16(O+70):dv.getInt16(tab.hhea.off+6),
    caps:O>=0&&dv.getUint16(O)>=2?dv.getInt16(O+88):Math.round(dv.getUint16(H+18)*0.716),
    gras:O>=0?dv.getUint16(O+4)>=600:false};
}
/* Les octets du glyphe g, et les glyphes que ses composants appellent. */
function dffGlyphe(Fo,g){return Fo.u8.subarray(Fo.tab.glyf.off+Fo.loca[g],Fo.tab.glyf.off+Fo.loca[g+1]);}
function dffComposants(b){
  const out=[];
  if(b.length<10)return out;
  const dv=new DataView(b.buffer,b.byteOffset,b.byteLength);
  if(dv.getInt16(0)>=0)return out;
  let p=10;
  for(;;){
    const fl=dv.getUint16(p), gi=dv.getUint16(p+2);
    out.push({pos:p+2,gi,fl});
    p+=4+(fl&1?4:2)+(fl&8?2:(fl&0x40?4:(fl&0x80?8:0)));
    if(!(fl&0x20))return out;
  }
}
/* Le glyphe sans son code de hinting (la fonte du sous-ensemble n'a plus de
   fpgm ni de prep à lui donner), composants renumérotés, longueur exacte. */
function dffGlypheNu(Fo,g,remap){
  const b=dffGlyphe(Fo,g);
  if(!b.length)return new Uint8Array(0);
  const dv=new DataView(b.buffer,b.byteOffset,b.byteLength);
  const nc=dv.getInt16(0);
  if(nc>=0){
    const p=10+2*nc, il=dv.getUint16(p);
    let q=p+2+il;
    if(nc>0){
      const npts=dv.getUint16(10+2*(nc-1))+1, fl=[];
      while(fl.length<npts){
        const f=b[q++];let k=1;
        if(f&8)k+=b[q++];
        for(let j=0;j<k;j++)fl.push(f);
      }
      for(const f of fl)q+=f&2?1:(f&16?0:2);
      for(const f of fl)q+=f&4?1:(f&32?0:2);
    }
    const o=new Uint8Array(p+2+(q-p-2-il));
    o.set(b.subarray(0,p),0);
    o.set(b.subarray(p+2+il,q),p+2);
    return o;
  }
  const comps=dffComposants(b), last=comps[comps.length-1];
  const fin=last.pos-2+4+(last.fl&1?4:2)+(last.fl&8?2:(last.fl&0x40?4:(last.fl&0x80?8:0)));
  const o=b.slice(0,fin), ov=new DataView(o.buffer);
  for(const c of comps)ov.setUint16(c.pos,remap.get(c.gi));
  ov.setUint16(last.pos-2,last.fl&~0x100);
  return o;
}

/* ==========================================================================
   Fonte embarquée : écriture du sous-ensemble
   ========================================================================== */
function dffSomme(u8){
  let s=0;
  for(let i=0;i<u8.length;i+=4)
    s=(s+(((u8[i]<<24)|((u8[i+1]||0)<<16)|((u8[i+2]||0)<<8)|(u8[i+3]||0))>>>0))>>>0;
  return s;
}
/* Sous-table cmap de format 4 : paires [code, glyphe] triées, un segment par
   suite consécutive. */
function dffCmap4(paires){
  const segs=[];
  for(const [c,g] of paires){
    const s=segs[segs.length-1];
    if(s&&c===s.e+1&&g===s.g+(c-s.s))s.e=c;
    else segs.push({s:c,e:c,g});
  }
  segs.push({s:0xFFFF,e:0xFFFF,g:1});
  const n=segs.length;
  let e=1;while(e*2<=n)e*=2;
  const len=16+8*n, b=new Uint8Array(len), dv=new DataView(b.buffer);
  dv.setUint16(0,4);dv.setUint16(2,len);
  dv.setUint16(6,2*n);dv.setUint16(8,2*e);dv.setUint16(10,Math.log2(e));dv.setUint16(12,2*n-2*e);
  segs.forEach((s,i)=>{
    dv.setUint16(14+2*i,s.e);
    dv.setUint16(16+2*n+2*i,s.s);
    dv.setUint16(16+4*n+2*i,(s.g-s.s)&0xFFFF);
  });
  return b;
}
/* Sous-table de format 6 : un glyphe par code, du premier au dernier — les
   codes d'un octet d'une fonte simple. */
function dffCmap6(paires){
  const a=paires[0][0], n=paires[paires.length-1][0]-a+1;
  const b=new Uint8Array(10+2*n), dv=new DataView(b.buffer);
  dv.setUint16(0,6);dv.setUint16(2,b.length);dv.setUint16(6,a);dv.setUint16(8,n);
  for(const [c,g] of paires)dv.setUint16(10+2*(c-a),g);
  return b;
}
/* La table cmap : des sous-tables [plateforme, codage, octets], rangées par
   plateforme puis par codage. */
function dffCmap(sous){
  let taille=4+8*sous.length;
  for(const x of sous)taille+=x[2].length;
  const u=new Uint8Array(taille), dv=new DataView(u.buffer);
  dv.setUint16(2,sous.length);
  let off=4+8*sous.length;
  sous.forEach(([p,e,b],i)=>{
    dv.setUint16(4+8*i,p);dv.setUint16(6+8*i,e);dv.setUint32(8+8*i,off);
    u.set(b,off);off+=b.length;
  });
  return u;
}
/* Sous-ensemble de Fo réduit aux glyphes `garde` (Set d'anciens numéros) et
   à la carte `uni` (Map unicode → ancien glyphe). Rend les octets de la
   fonte et la renumérotation. `simple` (Master Drawing) : `uni` va alors
   d'un code d'un octet à l'ancien glyphe, et la cmap est celle d'une fonte
   symbolique — (1,0) code → glyphe, (3,0) 0xF000 + code → glyphe —, que le
   PDF lit sans /Encoding. */
function dffSousEnsemble(Fo,garde,uni,simple){
  const tous=new Set([0,...garde]);
  const pile=[...tous];
  while(pile.length)
    for(const c of dffComposants(dffGlyphe(Fo,pile.pop())))
      if(!tous.has(c.gi)){tous.add(c.gi);pile.push(c.gi);}
  const ordre=[...tous].sort((a,b)=>a-b), remap=new Map(ordre.map((g,i)=>[g,i])), n=ordre.length;
  const corps=ordre.map(g=>dffGlypheNu(Fo,g,remap));
  const loca=new Uint8Array(4*(n+1)), lv=new DataView(loca.buffer);
  let tg=0;
  corps.forEach((b,i)=>{lv.setUint32(4*i,tg);tg+=(b.length+3)&~3;});
  lv.setUint32(4*n,tg);
  const glyf=new Uint8Array(tg);
  corps.forEach((b,i)=>glyf.set(b,lv.getUint32(4*i)));
  const hmtx=new Uint8Array(4*n), hv=new DataView(hmtx.buffer);
  ordre.forEach((g,i)=>{hv.setUint16(4*i,Fo.hm[g][0]);hv.setInt16(4*i+2,Fo.hm[g][1]);});
  const copie=k=>Fo.u8.slice(Fo.tab[k].off,Fo.tab[k].off+Fo.tab[k].len);
  const head=copie("head"), hd=new DataView(head.buffer);
  hd.setUint32(8,0);hd.setInt16(50,1);
  const hhea=copie("hhea");new DataView(hhea.buffer).setUint16(34,n);
  const maxp=copie("maxp");new DataView(maxp.buffer).setUint16(4,n);
  const post=new Uint8Array(32);
  if(Fo.tab.post)post.set(Fo.u8.subarray(Fo.tab.post.off,Fo.tab.post.off+Math.min(32,Fo.tab.post.len)));
  new DataView(post.buffer).setUint32(0,0x00030000);
  const paires=[...uni].map(([c,g])=>[c,remap.get(g)]).filter(([c])=>c<0xFFFF).sort((a,b)=>a[0]-b[0]);
  const cmap=simple?dffCmap([[1,0,dffCmap6(paires)],[3,0,dffCmap4(paires.map(([c,g])=>[0xF000+c,g]))]])
                   :dffCmap([[3,1,dffCmap4(paires)]]);
  const T={head,hhea,maxp,hmtx,loca,glyf,post,cmap};
  if(Fo.tab["OS/2"])T["OS/2"]=copie("OS/2");
  if(Fo.tab.name)T.name=copie("name");
  /* assemblage : répertoire trié, tables alignées sur 4 octets */
  const tags=Object.keys(T).sort();
  let e=1;while(e*2<=tags.length)e*=2;
  let taille=12+16*tags.length;
  for(const k of tags)taille+=(T[k].length+3)&~3;
  const u=new Uint8Array(taille), dv=new DataView(u.buffer);
  dv.setUint32(0,0x00010000);dv.setUint16(4,tags.length);
  dv.setUint16(6,16*e);dv.setUint16(8,Math.log2(e));dv.setUint16(10,16*tags.length-16*e);
  let off=12+16*tags.length, oHead=0;
  tags.forEach((k,i)=>{
    const p=12+16*i;
    for(let j=0;j<4;j++)u[p+j]=k.charCodeAt(j);
    dv.setUint32(p+4,dffSomme(T[k]));dv.setUint32(p+8,off);dv.setUint32(p+12,T[k].length);
    u.set(T[k],off);
    if(k==="head")oHead=off;
    off+=(T[k].length+3)&~3;
  });
  dv.setUint32(oHead+8,(0xB1B0AFBA-dffSomme(u))>>>0);
  return {octets:u,remap,n};
}

/* ==========================================================================
   Fonte embarquée : le PDF
   ========================================================================== */
var DFF_CACHE={};
/* La fonte d'un style ("normal" ou "gras"), lue une fois ; null si le module
   js/fontes/plans-sans.js n'est pas chargé ou ne se lit pas. */
function dffFonte(style){
  if(style in DFF_CACHE)return DFF_CACHE[style];
  let Fo=null;
  try{
    if(typeof DF_FONTE_TTF!=="undefined"&&DF_FONTE_TTF&&DF_FONTE_TTF[style])
      Fo=dffLire(dffBase64(DF_FONTE_TTF[style]));
  }catch(_){Fo=null;}
  return (DFF_CACHE[style]=Fo);
}
/* Le texte en glyphes : [{g, u}] (glyphe de la fonte, texte qu'il porte pour
   /ToUnicode). Ce que la fonte n'a pas suit le chemin de dfWinAnsi : la
   substitution d'un technicien, la lettre sans son accent, puis « ? ». */
function dffGlyphes(Fo,s){
  const out=[];
  const un=(ch,prof)=>{
    const c=ch.codePointAt(0);
    if(c===9||c===10||c===13){un(" ",prof);return;}
    const g=Fo.cmap.get(c);
    if(g){out.push({g,u:ch});return;}
    const sub=DF_SUBST[ch];
    if(sub!=null&&prof<3){for(const x of sub)un(x,prof+1);return;}
    const d=ch.normalize("NFD").replace(/[̀-ͯ]/g,"");
    if(d&&d!==ch&&prof<3){for(const x of d)un(x,prof+1);return;}
    out.push({g:Fo.cmap.get(0x3F)||0,u:"?"});
  };
  for(const ch of String(s==null?"":s).normalize("NFC"))un(ch,0);
  return out;
}
function dffHex(v){return v.toString(16).toUpperCase().padStart(4,"0");}
function dffUtf16(s){let o="";for(let i=0;i<s.length;i++)o+=dffHex(s.charCodeAt(i));return o;}
/* Les glyphes qu'emploie une suite de textes ({s, gras}), par style : la
   fonte, la carte unicode → glyphe (`uni`) et glyphe → texte qu'il porte
   (`gl`). null si l'une des deux graisses manque : Helvetica alors. Partagé
   par les deux PDF, les plans et le Master Drawing. */
function dffStyles(textes){
  const styles={normal:null,gras:null};
  for(const st of ["normal","gras"]){
    const Fo=dffFonte(st);
    if(!Fo)return null;
    styles[st]={Fo,uni:new Map(),gl:new Map(),vu:false};
  }
  for(const it of textes){
    const E=styles[it.gras?"gras":"normal"];
    E.vu=true;
    for(const x of dffGlyphes(E.Fo,it.s)){
      if(!E.gl.has(x.g))E.gl.set(x.g,x.u);
      const c=x.u.codePointAt(0);
      if(!E.uni.has(c))E.uni.set(c,x.g);
    }
  }
  return styles;
}
/* L'étiquette de sous-ensemble (« ABCDEF+ ») : six capitales tirées d'une
   suite de nombres, les glyphes gardés. */
function dffEtiquette(v){
  let h=2166136261;
  for(const g of v){h^=g;h=Math.imul(h,16777619)>>>0;}
  let tag="";for(let i=0;i<6;i++){tag+=String.fromCharCode(65+h%26);h=Math.floor(h/26)+i*7919;}
  return tag;
}
/* La /ToUnicode : `bf` les couples « <code> <UTF-16BE> », `octets` la
   longueur d'un code (2 en Identity-H, 1 pour une fonte simple). */
function dffToUnicode(bf,octets){
  let cmap="/CIDInit /ProcSet findresource begin\n12 dict begin\nbegincmap\n"+
    "/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def\n"+
    "/CMapName /Adobe-Identity-UCS def\n/CMapType 2 def\n"+
    "1 begincodespacerange\n"+(octets===1?"<00> <FF>":"<0000> <FFFF>")+"\nendcodespacerange\n";
  for(let i=0;i<bf.length;i+=100){
    const lot=bf.slice(i,i+100);
    cmap+=lot.length+" beginbfchar\n"+lot.join("\n")+"\nendbfchar\n";
  }
  return cmap+"endcmap\nCMapName currentdict /CMap defineresource pop\nend\nend\n";
}
/* Le descripteur de la fonte du style `st`, son fichier en objet FF.
   `flags` : 32 (non symbolique) pour la CIDFont, 4 (symbolique) pour la
   fonte simple, dont la cmap dit seule quel glyphe porte quel code. */
function dffDescripteur(E,st,FF,flags){
  const Fo=E.Fo, k=1000/Fo.upm;
  return "<< /Type /FontDescriptor /FontName /"+E.nom+" /Flags "+flags+
    " /FontBBox ["+Fo.bbox.map(v=>Math.round(v*k)).join(" ")+"] /ItalicAngle 0"+
    " /Ascent "+Math.round(Fo.asc*k)+" /Descent "+Math.round(Fo.desc*k)+
    " /CapHeight "+Math.round(Fo.caps*k)+" /StemV "+(st==="gras"?120:80)+
    (st==="gras"?" /FontWeight 700":"")+" /FontFile2 "+FF+" 0 R >>";
}
function dffNom(st){return "PlansSans-"+(st==="gras"?"Bold":"Regular");}

/* Préparation, appelée par dfPdf() avant d'écrire : les glyphes de chaque
   style, le sous-ensemble, et de quoi coder le texte et écrire les objets.
   null quand l'option est décochée ou la fonte absente : Helvetica alors. */
/* `fonte` : le choix de qui appelle ; à défaut, le réglage des plans. La
   visionneuse, qui n'a pas de réglages de plans (pas de `S`), le passe. */
function dfFontePreparer(feuilles,fonte){
  if(!(fonte!=null?fonte:dfCfg().fonte))return null;
  const textes=[];
  for(const F of feuilles)for(const it of F.items)if(it.t==="t")textes.push(it);
  const styles=dffStyles(textes);
  if(!styles)return null;
  for(const st in styles){
    const E=styles[st];
    if(!E.vu)continue;
    E.sub=dffSousEnsemble(E.Fo,new Set(E.gl.keys()),E.uni);
    E.nom=dffEtiquette([...E.gl.keys()].sort((a,b)=>a-b))+"+"+dffNom(st);
  }
  const FE={styles,
    chaine(s,gras){
      const E=styles[gras?"gras":"normal"];
      return "<"+dffGlyphes(E.Fo,s).map(x=>dffHex(E.sub.remap.get(x.g))).join("")+">";
    },
    largeur(s,pt,gras){
      const E=styles[gras?"gras":"normal"];
      let w=0;
      for(const x of dffGlyphes(E.Fo,s))w+=E.Fo.hm[x.g][0];
      return w/E.Fo.upm*pt*DF_PT;
    },
    /* Les objets : F1 (normal) et F2 (gras) deviennent des Type0 ; un style
       qu'aucun texte n'emploie garde son Helvetica. */
    ecrire(F1,F2,alloc,obj){
      [["normal",F1,"/Helvetica"],["gras",F2,"/Helvetica-Bold"]].forEach(([st,id,repli])=>{
        const E=styles[st];
        if(!E.vu){obj(id,"<< /Type /Font /Subtype /Type1 /BaseFont "+repli+" /Encoding /WinAnsiEncoding >>");return;}
        const Fo=E.Fo, k=1000/Fo.upm, sub=E.sub;
        const CID=alloc(), DESC=alloc(), FF=alloc(), TU=alloc();
        const larg=[];
        const inv=new Array(sub.n).fill(0);
        for(const [g,i] of sub.remap)inv[i]=g;
        for(let i=0;i<sub.n;i++)larg.push(Math.round(Fo.hm[inv[i]][0]*k));
        const bf=[];
        for(const [g,u] of E.gl)bf.push("<"+dffHex(sub.remap.get(g))+"> <"+dffUtf16(u)+">");
        const cmap=dffToUnicode(bf,2);
        obj(id,"<< /Type /Font /Subtype /Type0 /BaseFont /"+E.nom+" /Encoding /Identity-H"+
            " /DescendantFonts ["+CID+" 0 R] /ToUnicode "+TU+" 0 R >>");
        obj(CID,"<< /Type /Font /Subtype /CIDFontType2 /BaseFont /"+E.nom+
            " /CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >>"+
            " /FontDescriptor "+DESC+" 0 R /CIDToGIDMap /Identity /DW "+(larg[0]||0)+
            " /W [0 ["+larg.join(" ")+"]] >>");
        obj(DESC,dffDescripteur(E,st,FF,32));
        obj(FF,"<< /Length "+sub.octets.length+" /Length1 "+sub.octets.length+" >>",sub.octets);
        obj(TU,"<< /Length "+cmap.length+" >>",cmap);
      });
    }};
  return FE;
}

/* ==========================================================================
   Fonte embarquée : la fonte simple du Master Drawing
   ========================================================================== */
/* Le Master Drawing (04-pdf-masterdraw.js) emporte la même fonte, mais en
   TrueType SIMPLE, un octet par caractère : l'ASCII y garde son propre code,
   si bien que le contenu des pages se lit encore en clair — « SHEET: 1 / 3 »,
   « REV: B », les noms de fichiers annoncés — par un grep, un diff entre deux
   révisions, ou le fabricant qui ouvre le fichier dans un éditeur. Le reste
   (é, Ω, µ, ±, °, ≤, ≥, —…) prend les codes libres, de 0x80 à 0xFF puis de
   0x01 à 0x1F : 159 caractères hors ASCII par graisse, bien plus qu'un
   Master Drawing n'en écrit. Au-delà, « ? ». La fonte est déclarée
   symbolique, sans /Encoding : sa cmap (1,0) et (3,0) dit quel glyphe porte
   quel code, et la /ToUnicode quel caractère — le texte se cherche et se
   copie, accents et symboles compris. `textes` : les {s, gras} du
   document. null si la fonte ne se charge pas. */
function dffPreparerSimple(textes){
  const styles=dffStyles(textes);
  if(!styles)return null;
  for(const st in styles){
    const E=styles[st];
    if(!E.vu)continue;
    const ascii=new Map(), libres=[];
    for(let c=0x20;c<0x7F;c++){const g=E.Fo.cmap.get(c);if(g&&!ascii.has(g))ascii.set(g,c);}
    for(let c=0x80;c<=0xFF;c++)libres.push(c);
    for(let c=0x01;c<0x20;c++)libres.push(c);
    E.code=new Map();E.carte=new Map();          // glyphe → code, code → glyphe
    let deborde=false;
    for(const g of E.gl.keys()){
      const c=ascii.has(g)?ascii.get(g):libres.shift();
      if(c==null){deborde=true;continue;}
      E.code.set(g,c);E.carte.set(c,g);
    }
    const q=E.Fo.cmap.get(0x3F)||0;
    if(deborde&&!E.code.has(q)){E.code.set(q,0x3F);E.carte.set(0x3F,q);}
    const paires=[...E.carte].sort((a,b)=>a[0]-b[0]);
    E.sub=dffSousEnsemble(E.Fo,new Set(E.code.keys()),E.carte,true);
    E.nom=dffEtiquette([].concat(...paires))+"+"+dffNom(st);
  }
  const codes=(E,s)=>dffGlyphes(E.Fo,s).map(x=>E.code.has(x.g)?E.code.get(x.g):0x3F);
  return {styles,
    /* le littéral PDF : (, ) et \ échappés, le reste hors ASCII en octal */
    chaine(s,gras){
      let o="(";
      for(const c of codes(styles[gras?"gras":"normal"],s)){
        if(c===0x28||c===0x29||c===0x5C)o+="\\"+String.fromCharCode(c);
        else if(c<0x20||c>0x7E)o+="\\"+c.toString(8).padStart(3,"0");
        else o+=String.fromCharCode(c);
      }
      return o+")";
    },
    /* largeur en mm du texte en corps `pt` */
    largeur(s,pt,gras){
      const E=styles[gras?"gras":"normal"];
      let w=0;
      for(const c of codes(E,s))w+=E.Fo.hm[E.carte.get(c)][0];
      return w/E.Fo.upm*pt*DF_PT;
    },
    /* Les objets : la fonte d'id `F1` (normale) et `F2` (grasse), puis
       descripteur, fichier et /ToUnicode, numérotés par `alloc`. Un style
       qu'aucun texte n'emploie garde son Helvetica. */
    ecrire(F1,F2,alloc,obj){
      [["normal",F1,"/Helvetica"],["gras",F2,"/Helvetica-Bold"]].forEach(([st,id,repli])=>{
        const E=styles[st];
        if(!E.vu){obj(id,"<< /Type /Font /Subtype /Type1 /BaseFont "+repli+" /Encoding /WinAnsiEncoding >>");return;}
        const Fo=E.Fo, k=1000/Fo.upm, sub=E.sub;
        const DESC=alloc(), FF=alloc(), TU=alloc();
        const cs=[...E.carte.keys()].sort((a,b)=>a-b), c0=cs[0], c1=cs[cs.length-1];
        const larg=[];
        for(let c=c0;c<=c1;c++){const g=E.carte.get(c);larg.push(g==null?0:Math.round(Fo.hm[g][0]*k));}
        const bf=cs.map(c=>"<"+c.toString(16).toUpperCase().padStart(2,"0")+"> <"+
                            dffUtf16(E.gl.get(E.carte.get(c))||"?")+">");
        const cmap=dffToUnicode(bf,1);
        obj(id,"<< /Type /Font /Subtype /TrueType /BaseFont /"+E.nom+
            " /FirstChar "+c0+" /LastChar "+c1+" /Widths ["+larg.join(" ")+"]"+
            " /FontDescriptor "+DESC+" 0 R /ToUnicode "+TU+" 0 R >>");
        obj(DESC,dffDescripteur(E,st,FF,4));
        obj(FF,"<< /Length "+sub.octets.length+" /Length1 "+sub.octets.length+" >>",sub.octets);
        obj(TU,"<< /Length "+cmap.length+" >>",cmap);
      });
    }};
}
