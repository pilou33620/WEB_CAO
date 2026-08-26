"use strict";
/* ==========================================================================
   Master Drawing PDF — Manufacturing Data Package
   --------------------------------------------------------------------------
   Document de référence IPC pour la commande et la fabrication : trois pages
   (PCB Details, Files Included, Stack-up), générées en pur JavaScript sans
   aucune dépendance. Le PDF est du texte structuré (ISO 32000) : on l'écrit
   directement, fontes Helvetica standard (built-in Type1).

   Géométrie : la mise en page se pense en millimètres, Y vers le bas comme
   sur une feuille de papier ; l'émission convertit en points PDF, Y vers le
   haut, à chaque opération. Les textes passent par noAcc() : les fontes
   standard du PDF ne connaissent pas l'UTF-8, et un document technique
   international s'écrit sans accents de toute façon.
   ========================================================================== */

/* ---------- constantes de mise en page, en millimètres ---------- */
const MD_PW=210, MD_PH=297;           // A4 portrait
const MD_ML=16, MD_MR=16, MD_MT=18;   // marges
const MD_LH=5.2;                      // interlignage de base

/* mm → points PDF. ptY() prend la mesure DEPUIS LE HAUT de la page et la
   ramène en coordonnées PDF (depuis le bas) : c'est la seule conversion qui
   évite le dessin tête en bas, et c'est elle que tout le reste utilise. */
function mdPt(v){return (Math.round(v*1000)/1000).toFixed(3);}
function mdX(mm){return mdPt(mm*72/25.4);}
function mdY(mm){return mdPt((MD_PH-mm)*72/25.4);}
function mdL(mm){return mdPt(mm*72/25.4);}

/* ---------- émission des primitives ---------- */
/* Chaque fonction pousse des opérateurs PDF dans un tableau de lignes.
   Règle d'or : le texte vit dans BT…ET, le tracé dehors — jamais les deux
   dans le même bloc, le lecteur PDF rejeterait le contenu. */

/* Texte. `size` en points, `x`/`y` en mm depuis le haut, `gray` 0..1. */
function mdText(L,txt,x,y,size,bold,gray){
  L.push("BT /F"+(bold?"2":"1")+" "+mdPt(size)+" Tf "
         +(gray==null?"0 g":mdPt(gray)+" g")+" "
         +mdX(x)+" "+mdY(y)+" Td "+pdfStr(noAcc(txt))+" Tj ET");
}
/* Segment. */
function mdLine(L,x1,y1,x2,y2,gray,w){
  L.push(mdPt(gray==null?0:gray)+" G "+mdPt(w||0.3)+" w "
         +mdX(x1)+" "+mdY(y1)+" m "+mdX(x2)+" "+mdY(y2)+" l S");
}
/* Rectangle. `y` est le bord SUPÉRIEUR en mm depuis le haut : le `re` PDF
   attend le coin inférieur, d'où y+h dans la conversion. */
function mdRect(L,x,y,w,h,fill,stroke,lw){
  let s="";
  if(fill!=null)s+=mdPt(fill)+" g ";
  if(stroke!=null)s+=mdPt(stroke)+" G "+mdPt(lw||0.3)+" w ";
  s+=mdX(x)+" "+mdY(y+h)+" "+mdL(w)+" "+mdL(h)+" re ";
  s+=fill!=null?(stroke!=null?"B":"f"):"S";
  L.push(s);
}
/* Cercle centré en (cx,cy), rayon r en mm. Le PDF n'a pas d'arc de cercle :
   quatre courbes de Bézier, avec le kappa classique qui fait passer la courbe
   à moins d'un micron du vrai cercle à cette échelle. */
function mdCircle(L,cx,cy,r){
  const k=0.5523*r;
  L.push(mdPt(0.5)+" G 0.4 w");
  L.push(mdX(cx+r)+" "+mdY(cy)+" m");
  L.push(mdX(cx+r)+" "+mdY(cy+k)+" "+mdX(cx+k)+" "+mdY(cy+r)
        +" "+mdX(cx)+" "+mdY(cy+r)+" c");
  L.push(mdX(cx-k)+" "+mdY(cy+r)+" "+mdX(cx-r)+" "+mdY(cy+k)
        +" "+mdX(cx-r)+" "+mdY(cy)+" c");
  L.push(mdX(cx-r)+" "+mdY(cy-k)+" "+mdX(cx-k)+" "+mdY(cy-r)
        +" "+mdX(cx)+" "+mdY(cy-r)+" c");
  L.push(mdX(cx+k)+" "+mdY(cy-r)+" "+mdX(cx+r)+" "+mdY(cy-k)
        +" "+mdX(cx+r)+" "+mdY(cy)+" c S");
}
/* Échappe une chaîne pour un littéral PDF : (, ) et \ précédés de \,
   caractères de contrôle en octal. Le reste passe tel quel. */
function pdfStr(s){
  let out="(";
  for(const ch of String(s)){
    const c=ch.charCodeAt(0);
    /* Les fontes Helvetica de base s'arretent a Latin-1 : au-dela, l'octal
       ne tiendrait pas dans un octet et le lecteur afficherait n'importe
       quoi. Un point d'interrogation dit la verite. */
    if(c>0xFF)out+="?";
    else if(c<0x20||c===0x28||c===0x29||c===0x5C||c>0x7E)
      out+="\\"+((c>>6)&7)+((c>>3)&7)+(c&7);
    else out+=ch;
  }
  return out+")";
}
/* Coupe un texte pour qu'il tienne dans `maxW` mm. Helvetica moyenne ≈ 0.5
   fois le corps de lettre ; l'estimation large évite les débordements, un
   retour à la ligne de trop ne coûte rien. */
function mdWrap(txt,maxW,size){
  const cw=size*0.5*25.4/72;             // largeur moyenne d'un caractère, en mm
  const max=Math.max(4,Math.floor(maxW/cw));
  const words=String(txt).split(" ");
  const out=[];
  let cur="";
  for(const w of words){
    const n=cur?cur+" "+w:w;
    if(n.length>max&&cur){out.push(cur);cur=w;}
    else cur=n;
  }
  if(cur)out.push(cur);
  return out.length?out:[String(txt)];
}

/* ---------- assembleur PDF ----------
   Reçoit les contenus de pages (tableaux de lignes d'opérateurs) et rend un
   Uint8Array. Plan des objets, fixe : 1=catalogue, 2=arbre des pages,
   3..5=fontes, 6=ressources, puis par page un objet Page et un objet
   Contents. Les offsets de la xref se comptent en écrivant — c'est ce qui
   les rend justes. */
function mdAssemble(pages){
  const chunks=[];
  let pos=0;
  const emit=s=>{const b=new TextEncoder().encode(s);chunks.push(b);pos+=b.length;};
  const emitB=b=>{chunks.push(b);pos+=b.length;};
  const offsets=[];

  emit("%PDF-1.4\n%\u00E2\u00E3\u00CF\u00D3\n");

  const nPages=pages.length;
  const firstPage=7;
  const totalObjs=6+nPages*2;
  const writeObj=(n,dict,stream)=>{
    offsets[n]=pos;
    emit(n+" 0 obj\n"+dict+"\n");
    if(stream){
      emit("stream\n");
      emitB(stream);
      emit("\nendstream\n");
    }
    emit("endobj\n");
  };

  writeObj(1,"<< /Type /Catalog /Pages 2 0 R >>");

  const kids=[];
  for(let i=0;i<nPages;i++)kids.push((firstPage+i*2)+" 0 R");
  writeObj(2,"<< /Type /Pages /Kids ["+kids.join(" ")+"] /Count "+nPages
           +" /MediaBox [0 0 "+mdPt(MD_PW*72/25.4)+" "+mdPt(MD_PH*72/25.4)+"] >>");

  writeObj(3,"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  writeObj(4,"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>");
  writeObj(5,"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Oblique >>");
  writeObj(6,"<< /Font << /F1 3 0 R /F2 4 0 R /F3 5 0 R >> >>");

  for(let i=0;i<nPages;i++){
    const content=new TextEncoder().encode(pages[i].join("\n")+"\n");
    const cObj=firstPage+i*2+1, pObj=firstPage+i*2;
    writeObj(cObj,"<< /Length "+content.length+" >>",content);
    writeObj(pObj,"<< /Type /Page /Parent 2 0 R"
             +" /MediaBox [0 0 "+mdPt(MD_PW*72/25.4)+" "+mdPt(MD_PH*72/25.4)+"]"
             +" /Contents "+cObj+" 0 R /Resources 6 0 R >>");
  }

  const xref=pos;
  emit("xref\n0 "+(totalObjs+1)+"\n");
  emit("0000000000 65535 f \n");
  for(let n=1;n<=totalObjs;n++)
    emit(String(offsets[n]||0).padStart(10,"0")+" 00000 n \n");
  emit("trailer\n<< /Size "+(totalObjs+1)+" /Root 1 0 R >>\n");
  emit("startxref\n"+xref+"\n%%EOF\n");

  const out=new Uint8Array(pos);
  let p=0;
  for(const c of chunks){out.set(c,p);p+=c.length;}
  return out;
}

/* ---------- le document ---------- */
/* `fabFiles` : la liste déjà construite par buildFabFiles(), passée en
   paramètre — la fonction ne reconstruit pas la liste, sinon récursion. */
function masterDrawingPdf(fabFiles){
  const pages=[];
  let L=[], page=0, y=MD_MT;

  const startPage=()=>{pages.push([]);L=pages[pages.length-1];
                       page=pages.length-1;y=MD_MT;};
  const need=h=>{if(y+h>MD_PH-34)startPage();};

  /* Titre de section : trait plein, puis libellé capitales */
  function section(t){
    need(MD_LH*2);
    mdLine(L,MD_ML,y,MD_PW-MD_MR,y,0.55,0.5);
    y+=MD_LH*0.75;
    mdText(L,t.toUpperCase(),MD_ML,y,8,true,0.25);
    y+=MD_LH*1.3;
  }
  /* Couple libellé/valeur sur une ligne ; la valeur passe à la ligne si
     trop longue. */
  function kv(label,value,x,lw,vw,size){
    need(MD_LH*1.2);
    mdText(L,label+":",x,y,size||7.5,true,0.35);
    const lines=mdWrap(value||"-",vw,size||7.5);
    for(let i=0;i<lines.length;i++)
      mdText(L,lines[i],x+lw,y+i*MD_LH*0.95,size||7.5,false,0);
    y+=Math.max(1,lines.length)*MD_LH*0.95+1;
  }
  /* Deux colonnes de couples, la plus haute des deux fait avancer */
  function twoCol(left,right,size){
    const cw=(MD_PW-MD_ML-MD_MR)/2-5;
    const mid=MD_ML+cw+10;
    const y0=y;
    for(const [l,v] of left)kv(l,v,MD_ML,cw*0.42,cw*0.55,size);
    const y1=y; y=y0;
    for(const [l,v] of right)kv(l,v,mid,cw*0.42,cw*0.55,size);
    y=Math.max(y1,y)+2;
  }
  /* Cartouche du bas de page, sur le modèle du template : TITLE, référence
     carte, date, révision, feuille. Appelé UNE fois par page, en dernier.
     `total` est fixe (3 pages) : pages.length croît au fil de la génération
     et donnerait « 1 / 1 » sur la première. */
  function cartouche(target,docNum,boardRef,rev,sheet,total){
    const h=16, w=MD_PW-MD_ML-MD_MR, ty=MD_PH-14-h;
    /* Trois colonnes, larges d'après le texte le plus long qu'elles portent :
       « BOARD REFERENCE (IdPCB): … » fait 44 mm en corps 6, le titre 43 mm en
       6,5 — des colonnes plus étroites les faisaient traverser les cloisons. */
    const cA=MD_ML, cB=MD_ML+56, cC=MD_ML+w-66;
    mdRect(target,MD_ML,ty,w,h,null,0,0.5);
    mdLine(target,cB,ty,cB,ty+h,0,0.3);
    mdLine(target,cC,ty,cC,ty+h,0,0.3);
    mdLine(target,cA,ty+8,cB,ty+8,0,0.3);
    mdLine(target,cB,ty+8,cC,ty+8,0,0.3);
    mdLine(target,cC,ty+8,MD_ML+w,ty+8,0,0.3);
    /* La note d'unité vit au-dessus du cadre : dans la colonne du milieu elle
       débordait sur la référence carte. */
    mdText(target,"If not specified all dimensions are in mm",MD_ML,ty-1.5,5,false,0.35);
    mdText(target,"CHECKED",cA+2,ty+5.5,6,true,0);
    mdText(target,"APPR.",cA+2,ty+13,6,true,0);
    mdText(target,"TITLE: "+docNum,cB+2,ty+5.5,6.5,true,0);
    mdText(target,"DATE: "+new Date().toISOString().slice(0,10),cB+2,ty+13,6,false,0);
    mdText(target,"BOARD REFERENCE (IdPCB): "+boardRef,cC+2,ty+5.5,6,false,0);
    mdText(target,"REV: "+rev,cC+2,ty+13,6.5,true,0);
    mdText(target,"SHEET: "+sheet+" / "+total,cC+26,ty+13,6.5,false,0);
    mdText(target,"CONFIDENTIAL : This document is proprietary and property of it shall not "
            +"be reproduced, copied, lent or otherwise disposed of directly or indirectly.",
           MD_ML,MD_PH-8,4.5,false,0.4);
  }

  /* Le nom du projet mène tout le document : « carte PIR » donne le repère
     « carte PIR-PCB », le numéro « carte PIR-PCB-D-MASTER-DRAWING », et les
     noms de fichiers annoncés dans la page « Files included ». fabBase() est
     la source unique, partagée avec l'archive : le PDF ne peut donc plus
     annoncer un nom que l'archive n'aurait pas produit. */
  const fbase=fabBase();
  const docNum=fabDocNum();      // même nom que le fichier dans l'archive
  const boardRef=fbase;
  /* Révision : elle vient du fichier projet (projet.cao.json), la seule pièce
     qui survit aux deux éditeurs et à la fermeture du navigateur. Sans dossier
     de projet rattaché, c'est « A » — la première. */
  const rev=(typeof projdRevision==="function")?projdRevision():"A";

  /* ================= PAGE 1 — PCB Details ================= */
  startPage();
  mdText(L,"Printed Circuit Board (PCB) Master Drawing",MD_ML,y,14,true,0);
  y+=MD_LH*1.6;
  mdLine(L,MD_ML,y,MD_PW-MD_MR,y,0,0.8);
  y+=MD_LH*1.2;

  section("Document information");
  kv("Document number",docNum,MD_ML,42,110);
  kv("Date",new Date().toISOString().slice(0,10)+"  (format YYYY-MM-DD)",MD_ML,42,110);
  kv("Revision","["+rev+"]",MD_ML,42,110);
  y+=MD_LH*0.4;

  section("Fabrication notes");
  mdText(L,"IPC Performance Class 2: PCB used for industry product",MD_ML+2,y,8);
  y+=MD_LH;
  mdText(L,"All materials must be RoHS compliant (RoHS 3, EU Directive 2015/863)",MD_ML+2,y,8);
  y+=MD_LH*1.4;

  section("PCB details");
  const maskC=S.stack.maskColor||"vert";
  const outerUm=cuT(0)*1000, innerUm=S.cu>2?cuT(1)*1000:null;
  const ozO=ozLabel(cuT(0));
  twoCol([
    ["Number of layers",String(S.cu)],
    ["Single board dimensions",
     S.board.pts?("Freeform: "+S.board.pts.length+" points"):"Rectangular"],
    ["Length x Width",fmt(S.board.w,2)+" mm x "+fmt(S.board.h,2)+" mm"],
    ["Markings","UL + Date (YYWW) + Manufacturer ID - Layer: Soldermask bottom"],
    ["Final board thickness",fmt(stackTotal(),3)+" mm (+/-10%)"],
    ["Base copper thickness","Outer: "+fmt(outerUm,1)+" um ("+ozO+")"
      +(innerUm?"   Inner: "+fmt(innerUm,1)+" um":"")],
    ["Final copper thickness","Outer: min "+fmt(outerUm*0.95,1)+" um"
      +(innerUm?"   Inner: min "+fmt(innerUm*0.95,1)+" um":"")],
  ],[
    ["Solder mask color",maskC],
    ["IPC class","Class 2"],
    ["RoHS","Compliant"],
    ["Lead free","Yes"],
    ["Ul94 rating","V-0"],
    ["CTI",">= 100V"],
  ]);
  y+=MD_LH*0.4;

  section("Material details");
  const mat=(S.stack.di[0]&&S.stack.di[0].mat)||"FR-4";
  twoCol([
    ["Board material",mat+", shall comply with IPC-4101/99/126, UL V-0 and Lead Free compliant"],
    ["Minimum Tg (TMA)",(S.stack.tg||150)+" C"],
  ],[
    ["Approved materials","S1000, S1000H, S1002-2, EM-827 and IT158TC"],
  ]);
  y+=MD_LH*0.4;

  section("Pattern");
  const trk=minTrack(), spc=minSpace(), hole=minDrill(), ann=minAnnRing();
  twoCol([
    ["Minimum track / space",
     (trk>0?fmt(trk,2):"—")+" mm / "+(spc>0?fmt(spc,2):"—")+" mm"],
    ["Minimum hole",(hole>0?fmt(hole,2):"—")+" mm"],
    ["Minimum annular ring",(ann>0?fmt(ann,2):"—")+" mm"],
    ["Hole wall copper",">= 20 um"],
  ],[
    ["Hole types","PTH and Non-PTH"],
    ["Via types","Through"+(viaCensus().blind?" , Blind":"")
      +(viaCensus().buried?" , Buried":"")],
    ["Via protection (IPC4761)",viaFinishLabel()],
  ]);
  /* schéma de l'anneau, à droite : deux cercles concentriques */
  {
    need(30);
    const cx=MD_PW-MD_MR-22, cy=y-8;
    mdCircle(L,cx,cy,9);
    mdCircle(L,cx,cy,4.5);
    mdText(L,"Annular ring",cx+12,cy-2,5,false,0.35);
  }
  y+=MD_LH*0.6;

  section("Surface details");
  const fin=(S.stack.finish||"ENIG");
  twoCol([
    ["Surface finish",fin],
    ["Nickel","118-236 uin (3-6 um)"],
    ["Gold",">= 2 uin (>= 0.05 um)"],
  ],[
    ["Finish class",/ENIG/i.test(fin)?"Electroless Nickel Immersion Gold":fin],
  ]);
  y+=MD_LH*0.4;

  /* ================= PAGE 2 — Finish, mask, test ================= */
  /* Coupure voulue : la page 1 est pleine ici. Sans ce startPage(), need()
     débordait tout seul et la page naissait au milieu d'une section. */
  startPage();
  section("Solder mask (IPC-SM-840)");
  mdText(L,"Applied to Top & Bottom        Colour: "+maskC,MD_ML+2,y,8);
  y+=MD_LH;
  mdText(L,"In supplied artwork, solder mask opening is same size as pad (1:1).",MD_ML+2,y,8);
  y+=MD_LH;
  mdText(L,"Manufacturer may open solder mask clearance as necessary and shall not",MD_ML+2,y,8);
  y+=MD_LH;
  mdText(L,"exceed 0.1mm and Bridge mini (Web): 100um.",MD_ML+2,y,8);
  y+=MD_LH*1.2;

  section("Silk screen");
  mdText(L,"Colour: "+(S.stack.silkColor||"blanc"),MD_ML+2,y,8);
  y+=MD_LH*1.2;

  section("Electrical test");
  mdText(L,"100% E-TEST  (flying probe)",MD_ML+2,y,8);
  y+=MD_LH;
  mdText(L,"Netlist provided in "+fbase+".ipc (IPC-D-356).",MD_ML+2,y,8);
  y+=MD_LH*1.2;

  section("Surface examination");
  mdText(L,"IPC-A-600H (Class 2)",MD_ML+2,y,8);
  y+=MD_LH*1.4;

  /* Les notes générales tiennent ici : la page 2 est courte, et la page de
     l'empilage était pleine. */
  section("General notes");
  for(const n of [
    "1. Board outline Gerber file ("+fbase+".GM1) defines the machining/contour profile.",
    "2. All dimensions in mm unless otherwise specified.",
    "3. IPC Performance Class 2 — commercial/industrial electronic assemblies.",
    "4. UL and RoHS compliance required for all materials.",
    "5. Copper weights shown are finished weights after plating process.",
    "6. Manufacturer shall validate sequential lamination requirements for blind/buried vias."]){
    need(MD_LH);
    mdText(L,n,MD_ML+2,y,7);
    y+=MD_LH*0.9;
  }

  /* ================= PAGE 3 — Files included ================= */
  startPage();
  section("Files included in data package");
  mdText(L,"All data is viewed from Top side.",MD_ML,y,8);
  y+=MD_LH*1.2;

  /* Tableau à deux colonnes, en-tête sur fond gris */
  const tW=MD_PW-MD_ML-MD_MR, c1=tW*0.42, c2=tW-c1;
  function tableHead(){
    need(MD_LH*2);
    mdRect(L,MD_ML,y,tW,6,0.88,0,0.35);
    mdText(L,"Included",MD_ML+2,y+4.2,6.5,true,0);
    mdText(L,"Filename",MD_ML+c1*0.18,y+4.2,6.5,true,0);
    mdText(L,"Description",MD_ML+c1,y+4.2,6.5,true,0);
    y+=6;
  }
  function tableRow(fn,desc,inc,alt){
    need(MD_LH*1.4);
    if(alt)mdRect(L,MD_ML,y,tW,6,0.955,null,null);
    if(inc)mdText(L,"X",MD_ML+2,y+4.2,7,false,0);
    mdText(L,fn||"",MD_ML+c1*0.18,y+4.2,6.5,false,0);
    const dLines=mdWrap(desc||"",c2-4,6.5);
    for(let i=0;i<dLines.length;i++)
      mdText(L,dLines[i],MD_ML+c1,y+4.2+i*5.2,6.5,false,0);
    mdLine(L,MD_ML,y+6,MD_PW-MD_MR,y+6,0.8,0.2);
    y+=6;
  }

  const gerberDesc={
    "GTL":"Copper layer 1 (Top)","GBL":"Copper layer "+S.cu+" (Bottom)",
    "GTS":"Solder mask Top","GBS":"Solder mask Bottom",
    "GTP":"Paste mask Top","GBP":"Paste mask Bottom",
    "GTO":"Silk screen Top","GBO":"Silk screen Bottom",
    "GM1":"Board outline (Mechanical 1, profile)","GKO":"Keep-out layer"};
  const drillDesc=k=>{
    const [a,b]=k.split("-").map(Number);
    const kind=(a===0&&b===S.cu-1)?"Through hole"
      :(a===0||b===S.cu-1)?"Blind (laser)":"Buried";
    return kind+" Excellon drill file (plated)";
  };
  const gFiles=(fabFiles||[]).filter(f=>/\.(GTL|GBL|GL\d+|GTS|GBS|GTP|GBP|GTO|GBO|GM1|GKO)$/.test(f.name));
  const dFiles=(fabFiles||[]).filter(f=>/\.TXT$/.test(f.name));
  const ipcF=(fabFiles||[]).find(f=>f.name.endsWith(".ipc"));

  tableHead();
  let alt=false;
  for(const f of gFiles){
    const ext=f.name.split(".").pop();
    tableRow(f.name,gerberDesc[ext]||"Gerber data",true,alt=!alt);
  }
  for(const f of dFiles)
    tableRow(f.name,drillDesc(f.name.replace(/^\D+/,"").replace(".TXT","")),true,alt=!alt);
  tableRow(fbase+".ipc","IPC-D-356 netlist (E-test / flying probe)",!!ipcF,alt=!alt);
  tableRow("positions.csv","Component positions (pick & place)",true,alt=!alt);
  tableRow("bom.csv","Bill of materials",true,alt=!alt);
  tableRow("EMPILAGE.txt","Stackup report",true,alt=!alt);
  tableRow(docNum+".pdf","Master drawing (this document)",true,alt=!alt);
  y+=MD_LH*1.2;

  section("Content of "+docNum+".pdf");
  const pdfRows=[
    ["Board dimensions (cotation)","Included in the PDF file"],
    ["Drilling map","Included in the PDF file"],
    ["Top and bottom equipment","Included in the PDF file"],
    ["PDF file of Gerber files","Included in the PDF file"]];
  tableHead();
  alt=false;
  for(const [d,c] of pdfRows)tableRow("",d+" — "+c,true,alt=!alt);

  /* ================= PAGE 3 — Stack-up ================= */
  startPage();
  section("Stack layer");
  mdText(L,"Stackup table:   Unit = Millimeter",MD_ML,y,8,true,0);
  y+=MD_LH*1.1;

  /* Largeurs de colonnes, en mm : leur somme doit valoir exactement la zone
     utile (MD_PW - marges = 178), sinon la colonne de droite sort de la page. */
  const sc=[7,31,24,62,29,25];
  const scT=sc.reduce((a,b)=>a+b,0);
  function stackHead(){
    need(MD_LH*1.6);
    mdRect(L,MD_ML,y,scT,6.5,0.88,0,0.35);
    let cx=MD_ML;
    const hs=["#","Name","Type","Material","Thickness","Tolerance"];
    for(let c=0;c<hs.length;c++){
      mdText(L,hs[c],cx+2,y+4.5,6.5,true,0);
      if(c<hs.length-1)mdLine(L,cx+sc[c],y,cx+sc[c],y+6.5,0,0.25);
      cx+=sc[c];
    }
    y+=6.5;
  }
  function stackRow(vals,alt,bold){
    need(MD_LH*1.6);
    if(alt)mdRect(L,MD_ML,y,scT,6.5,0.965,null,null);
    let cx=MD_ML;
    for(let c=0;c<vals.length;c++){
      const lines=mdWrap(vals[c]||"",sc[c]-3,6.2);
      for(let i=0;i<lines.length;i++)
        mdText(L,lines[i],cx+2,y+3+i*4.4,6.2,!!bold,0);
      if(c<sc.length-1)mdLine(L,cx+sc[c],y,cx+sc[c],y+6.5,0.8,0.2);
      cx+=sc[c];
    }
    mdLine(L,MD_ML,y+6.5,MD_ML+scT,y+6.5,0.8,0.2);
    y+=6.5;
  }

  stackHead();
  let salt=false, cuN=1;
  for(const r of stackRows()){
    if(r.kind==="cu"){
      const nm=cuN===1?"Layer1_TOP":(cuN===S.cu?"Layer"+cuN+"_BOTTOM":"Layer"+cuN);
      const role=roleLabel(r.i);
      stackRow([String(cuN),nm,"CONDUCTOR",
        "Copper "+ozLabel(cuT(r.i))+(role&&role!=="Signal"?" - "+role:""),
        fmt(cuT(r.i)*1000,3)+" mm","+/-10%"],salt=!salt);
      cuN++;
    }else if(r.kind==="di"){
      const d=diAt(r.i);
      stackRow(["","Dielectric "+(r.i+1),"DIELECTRIC",
        (d.mat||"FR-4")+" "+(d.k==="core"?"CORE":(d.k==="prepreg"?"PREPREG":"FILM"))
        +" er "+fmt(d.er,2),
        fmt(d.t,3)+" mm","+/-10%"],salt=!salt);
    }else if(r.kind==="mask"){
      stackRow(["","Solder Mask "+(r.i?"Bottom":"Top"),"DIELECTRIC",
        "Solder Mask IPC-SM840 ("+maskC+")",
        fmt(S.stack.maskT*1000,3)+" mm","+/-10%"],salt=!salt);
    }else{
      stackRow(["","Silk Screen "+(r.i?"Bottom":"Top"),"LEGEND",
        "Ink "+(S.stack.silkColor||"blanc"),"—","—"],salt=!salt);
    }
  }
  stackRow(["","","","Total thickness",fmt(stackTotal(),3)+" mm","+/-10%"],false,true);
  y+=MD_LH*1.2;

  section("Via summary");
  const vc=viaCensus();
  twoCol([
    ["Through vias",String(vc.through)],
    ["Blind vias",String(vc.blind)],
    ["Buried vias",String(vc.buried)],
  ],[
    ["Total vias",String(S.vias.length)],
    ["Sequential lamination",vc.seq?vc.seq+" via(s) - A VALIDER":"Not required"],
  ]);
  if(vc.seq){
    mdText(L,"Warning: "+vc.seq+" via(s) require sequential lamination — "
            +"validate with manufacturer.",MD_ML+2,y,7,false,0.1);
    y+=MD_LH;
  }
  y+=MD_LH*0.4;

  section("Board outline drawing");
  need(50);
  /* Le contour réel de la carte, mis à l'échelle dans un cadre : c'est le
     « master drawing » au sens propre — la forme que le fabricant découpe. */
  {
    /* Le cadre est décalé de 13 mm : la cote de hauteur s'écrit à sa gauche,
       et sans cette gouttière elle sortait de la marge. */
    const frameW=110, frameH=64, fx=MD_ML+13, fy=y;
    mdRect(L,fx,fy,frameW,frameH,null,0,0.4);
    const P=boardPoly();
    let x1=1e9,y1=1e9,x2=-1e9,y2=-1e9;
    for(const p of P){x1=Math.min(x1,p.x);x2=Math.max(x2,p.x);
                      y1=Math.min(y1,p.y);y2=Math.max(y2,p.y);}
    const bw=x2-x1||1, bh=y2-y1||1;
    const k=Math.min((frameW-16)/bw,(frameH-16)/bh);
    const ox=fx+(frameW-bw*k)/2, oy=fy+(frameH-bh*k)/2;
    L.push("q 0.6 G 0.5 w");
    for(let i=0;i<P.length;i++){
      const a=P[i], b=P[(i+1)%P.length];
      L.push(mdX(ox+(a.x-x1)*k)+" "+mdY(oy+(a.y-y1)*k+bh*k)+" m "
            +mdX(ox+(b.x-x1)*k)+" "+mdY(oy+(b.y-y1)*k+bh*k)+" l S");
    }
    L.push("Q");
    mdText(L,fmt(bw,2)+" mm",ox+bw*k/2-6,fy+frameH+3,6,false,0.35);
    mdText(L,fmt(bh,2)+" mm",fx-2,oy+bh*k/2,6,false,0.35);
    /* cotes : traits d'attache au-dessus et à gauche */
    mdLine(L,ox,fy+frameH+1.5,ox+bw*k,fy+frameH+1.5,0.35,0.2);
    mdLine(L,fx-1.5,oy,fx-1.5,oy+bh*k,0.35,0.2);
    y+=frameH+MD_LH*1.6;
  }

  /* Cartouche en dernier, sur TOUTES les pages : le total n'est connu qu'ici,
     et une page née d'un débordement se retrouve encadrée et numérotée comme
     les autres au lieu de sortir nue. */
  for(let i=0;i<pages.length;i++)
    cartouche(pages[i],docNum,boardRef,rev,i+1,pages.length);

  return mdAssemble(pages);
}

/* ---------- minima relevés dans l'état de l'éditeur ----------
   Le Pattern du Master Drawing annonce les plus petites valeurs réellement
   posées sur la carte : une règle plus fine mais sans piste à ce pas ne
   trompe personne, une piste plus fine que la règle est un défaut. */
function minTrack(){
  let m=Infinity;
  for(const c of S.classes)m=Math.min(m,c.w);
  for(const t of S.tracks)m=Math.min(m,t.w);
  return m<Infinity?m:0;
}
function minSpace(){
  let m=Infinity;
  for(const c of S.classes)m=Math.min(m,c.clr);
  return m<Infinity?m:0;
}
function minDrill(){
  let m=Infinity;
  for(const fp of S.fps)
    for(const q of padsOf(fp))
      if(q.drill>0)m=Math.min(m,q.drill);
  for(const v of S.vias)m=Math.min(m,v.drill);
  return m<Infinity?m:0;
}
function minAnnRing(){
  let m=Infinity;
  for(const fp of S.fps)
    for(const q of padsOf(fp)){
      if(q.drill<=0)continue;
      m=Math.min(m,Math.min(q.w,q.h)/2-q.drill/2);
    }
  for(const v of S.vias)m=Math.min(m,(v.d-v.drill)/2);
  return m<Infinity?m:0;
}
function viaFinishLabel(){
  return VIA_TXT[S.rule.viaFinish]||S.rule.viaFinish;
}
