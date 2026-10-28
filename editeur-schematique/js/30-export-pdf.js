/* ==========================================================================
   Export PDF vectoriel : les fonctions de dessin du schéma (drawComp,
   drawWires, schCartouche…) tournent sur un faux contexte canvas qui écrit des
   opérateurs PDF. Les textes (références, valeurs, noms de nets) sont de vrais
   textes Helvetica : Ctrl+F les trouve. Une page par feuille du schéma.
   shortcut: flux non compressé, logo du cartouche omis (drawImage ignoré),
   Ω en Symbol et tout autre caractère hors WinAnsi remplacé par « ? » ;
   passer à Flate / une fonte embarquée si les fichiers ou les caractères le
   demandent.
   ========================================================================== */
const PDF_PAPIERS={A4:[297,210],A3:[420,297],A2:[594,420],A1:[841,594],A0:[1189,841]};   // mm, paysage
let schPdfReglages={feuilles:"toutes",papier:"auto",l:297,h:210,orient:"auto",echelle:"fit",pct:100,fond:"blanc"};

function pdfRgba(s){
  s=String(s).trim();let m;
  if((m=/^#([0-9a-f]{3,8})$/i.exec(s))){
    let h=m[1];if(h.length<5)h=[...h].map(x=>x+x).join("");
    return [0,2,4].map(i=>parseInt(h.substr(i,2),16)/255).concat(h.length>6?parseInt(h.substr(6,2),16)/255:1);
  }
  if((m=/^rgba?\(([^)]+)\)/.exec(s))){const v=m[1].split(/[ ,\/]+/).map(parseFloat);return [v[0]/255,v[1]/255,v[2]/255,v.length>3?v[3]:1];}
  return [0,0,0,1];
}
/* Sur papier blanc : les teintes sombres du fond d'écran deviennent blanches,
   les claires sont assombries en gardant leur teinte (le blanc devient noir). */
function pdfPapier([r,g,b,a]){
  const l=(Math.max(r,g,b)+Math.min(r,g,b))/2;
  if(l<.25)return [1,1,1,a];
  if(l<.55)return [r,g,b,a];
  const f=(1-l)/l;return [r*f,g*f,b*f,a];
}
const pdfN=v=>String(+(+v).toFixed(3));
const PDF_W1252={"€":128,"‚":130,"ƒ":131,"„":132,"…":133,"‘":145,"’":146,"“":147,"”":148,"•":149,"–":150,"—":151,"™":153};
/* octets WinAnsi d'une chaîne, en littéral PDF */
function pdfLit(s){
  let o="";
  for(const ch of s){
    const k=ch.codePointAt(0);
    if(ch==="("||ch===")"||ch==="\\")o+="\\"+ch;
    else if(k>=32&&k<127)o+=ch;
    else if(k>=160&&k<256)o+="\\"+k.toString(8);
    else if(PDF_W1252[ch])o+="\\"+PDF_W1252[ch].toString(8);
    else o+=ch==="→"?"->":"?";
  }
  return o;
}

/* Le faux contexte : ops reçoit les opérateurs, alphas les opacités employées. */
function pdfCtx(papier,alphas){
  const ops=[], pile=[], P=["fillStyle","strokeStyle","lineWidth","lineCap","lineJoin","globalAlpha","font","textAlign","textBaseline"];
  let cur=null, mes=null;
  try{mes=document.createElement("canvas").getContext("2d");}catch(e){}
  const taille=f=>+(/(\d+(?:\.\d+)?)px/.exec(f)||[0,10])[1], gras=f=>/bold|\b[6-9]00\b/.test(f);
  const larg=(s,f)=>{
    const t=taille(f);
    if(mes&&mes.measureText){mes.font=(gras(f)?"bold ":"")+t+"px Helvetica, Arial, sans-serif";return mes.measureText(s).width;}
    return s.length*t*.55;
  };
  const col=(s,alpha)=>{let q=pdfRgba(s);if(papier)q=pdfPapier(q);return {rgb:q.slice(0,3).map(pdfN).join(" "),a:q[3]*alpha};};
  const gs=a=>{const n=Math.round(Math.max(0,Math.min(1,a))*100);alphas.add(n);return "/G"+n+" gs";};
  const c={
    fillStyle:"#000",strokeStyle:"#000",lineWidth:1,lineCap:"butt",lineJoin:"miter",globalAlpha:1,
    font:"10px sans-serif",textAlign:"left",textBaseline:"alphabetic",_d:[],ops,
    save(){pile.push(P.map(k=>c[k]).concat([c._d]));ops.push("q");},
    restore(){const s=pile.pop();if(!s)return;P.forEach((k,i)=>c[k]=s[i]);c._d=s[P.length];ops.push("Q");},
    translate(x,y){ops.push("1 0 0 1 "+pdfN(x)+" "+pdfN(y)+" cm");},
    scale(x,y){ops.push(pdfN(x)+" 0 0 "+pdfN(y)+" 0 0 cm");},
    rotate(a){const s=Math.sin(a),k=Math.cos(a);ops.push([k,s,-s,k,0,0].map(pdfN).join(" ")+" cm");},
    setLineDash(d){c._d=d||[];},
    beginPath(){cur=null;},
    moveTo(x,y){ops.push(pdfN(x)+" "+pdfN(y)+" m");cur=[x,y];},
    lineTo(x,y){if(!cur)return c.moveTo(x,y);ops.push(pdfN(x)+" "+pdfN(y)+" l");cur=[x,y];},
    closePath(){ops.push("h");},
    rect(x,y,w,h){ops.push([x,y,w,h].map(pdfN).join(" ")+" re");cur=[x,y];},
    arc(x,y,r,a0,a1,ccw){
      const T=2*Math.PI;let d=a1-a0;
      if(!ccw)d=d>=T?T:((d%T)+T)%T;else d=d<=-T?-T:-(((-d)%T)+T)%T;
      const n=Math.max(1,Math.ceil(Math.abs(d)/(Math.PI/2))), s=d/n, k=4/3*Math.tan(s/4);
      let a=a0;
      c.lineTo(x+r*Math.cos(a),y+r*Math.sin(a));
      for(let i=0;i<n;i++){
        const b=a+s, e=[x+r*Math.cos(b),y+r*Math.sin(b)];
        ops.push([x+r*(Math.cos(a)-k*Math.sin(a)),y+r*(Math.sin(a)+k*Math.cos(a)),
                  x+r*(Math.cos(b)+k*Math.sin(b)),y+r*(Math.sin(b)-k*Math.cos(b)),e[0],e[1]].map(pdfN).join(" ")+" c");
        cur=e;a=b;
      }
    },
    arcTo(x1,y1,x2,y2,r){
      if(!cur)return c.moveTo(x1,y1);
      const [x0,y0]=cur, ax=x0-x1, ay=y0-y1, bx=x2-x1, by=y2-y1, la=Math.hypot(ax,ay), lb=Math.hypot(bx,by);
      const ux=ax/la, uy=ay/la, vx=bx/lb, vy=by/lb;
      if(!la||!lb||!r||Math.abs(ux*vy-uy*vx)<1e-9)return c.lineTo(x1,y1);
      const ang=Math.acos(Math.max(-1,Math.min(1,ux*vx+uy*vy))), t=r/Math.tan(ang/2), kk=4/3*Math.tan((Math.PI-ang)/4)*r;
      const p1=[x1+ux*t,y1+uy*t], p2=[x1+vx*t,y1+vy*t];
      c.lineTo(p1[0],p1[1]);
      ops.push([p1[0]-ux*kk,p1[1]-uy*kk,p2[0]-vx*kk,p2[1]-vy*kk,p2[0],p2[1]].map(pdfN).join(" ")+" c");
      cur=p2;
    },
    roundRect(x,y,w,h,r){
      r=Math.min(Array.isArray(r)?r[0]:r||0,Math.abs(w)/2,Math.abs(h)/2);
      c.moveTo(x+r,y);c.arcTo(x+w,y,x+w,y+h,r);c.arcTo(x+w,y+h,x,y+h,r);c.arcTo(x,y+h,x,y,r);c.arcTo(x,y,x+w,y,r);c.closePath();
    },
    _remp(){const q=col(c.fillStyle,c.globalAlpha);ops.push(gs(q.a),q.rgb+" rg");},
    _trait(){
      const q=col(c.strokeStyle,c.globalAlpha);
      ops.push(gs(q.a),q.rgb+" RG",pdfN(c.lineWidth)+" w",({butt:0,round:1,square:2}[c.lineCap]||0)+" J",
               ({miter:0,round:1,bevel:2}[c.lineJoin]||0)+" j","["+c._d.map(pdfN).join(" ")+"] 0 d");
    },
    fill(){c._remp();ops.push("f");},
    stroke(){c._trait();ops.push("S");},
    fillRect(x,y,w,h){c._remp();ops.push([x,y,w,h].map(pdfN).join(" ")+" re f");},
    strokeRect(x,y,w,h){c._trait();ops.push([x,y,w,h].map(pdfN).join(" ")+" re S");},
    clearRect(){}, drawImage(){},
    measureText(s){return {width:larg(String(s),c.font)};},
    fillText(s,x,y,max){
      s=String(s);if(!s)return;
      const t=taille(c.font), g=gras(c.font);
      let w=larg(s,c.font), tz=100;
      if(max&&w>max){tz=max/w*100;w=max;}
      x-={center:w/2,right:w,end:w}[c.textAlign]||0;
      y+={top:.78,hanging:.7,middle:.36,bottom:-.2,ideographic:-.2}[c.textBaseline]*t||0;
      c._remp();
      /* Ω dans la fonte Symbol (W), le reste en Helvetica */
      const runs=s.split(/(Ω)/).filter(Boolean).map(p=>p==="Ω"?"/F3 "+pdfN(t)+" Tf (W) Tj":"/F"+(g?2:1)+" "+pdfN(t)+" Tf ("+pdfLit(p)+") Tj");
      ops.push("BT "+pdfN(tz)+" Tz 1 0 0 -1 "+pdfN(x)+" "+pdfN(y)+" Tm "+runs.join(" ")+" ET");
    },
  };
  return c;
}

/* Une feuille → {w,h} en points et ses opérateurs, ou null si elle est vide. */
function schPdfPage(o,alphas){
  const cad=schPage(), b=cad||schContenu();
  if(!b)return null;
  const cw=(b.x2-b.x1)/SCH_U, ch=(b.y2-b.y1)/SCH_U;                 // mm
  let [pw,ph]=o.papier==="custom"?[o.l,o.h]:PDF_PAPIERS[o.papier]||
    (cad&&CARTOUCHE_FORMATS[S.pages[S.page].format]?[CARTOUCHE_FORMATS[S.pages[S.page].format].w,CARTOUCHE_FORMATS[S.pages[S.page].format].h]:PDF_PAPIERS.A4);
  const paysage=o.orient==="auto"?cw>=ch:o.orient==="paysage";
  if(paysage!==(pw>=ph))[pw,ph]=[ph,pw];
  const m=cad?0:10;                                                  // un cartouche remplit sa page
  const s=o.echelle==="fit"?Math.min((pw-2*m)/cw,(ph-2*m)/ch):(o.echelle==="pct"?o.pct:100)/100;   // mm page par mm schéma
  const k=s/SCH_U*72/25.4, W=pw*72/25.4, H=ph*72/25.4;              // points par unité
  const ox=(W-(b.x2-b.x1)*k)/2, oy=(H-(b.y2-b.y1)*k)/2;
  const c=pdfCtx(o.fond==="blanc",alphas);
  if(o.fond!=="blanc")c.ops.push("0.078 0.078 0.086 rg 0 0 "+pdfN(W)+" "+pdfN(H)+" re f");
  c.ops.push([k,0,0,-k,ox-b.x1*k,H-oy+b.y1*k].map(pdfN).join(" ")+" cm");   // y vers le bas, comme le canvas
  schCartouche(c);
  drawDrawings(c);
  if(typeof drawSheetBlocks==="function")drawSheetBlocks(c);
  drawWires(c);
  drawJunctions(c);
  for(const el of S.comps)drawComp(c,el,false);
  if(typeof schVarDessiner==="function")schVarDessiner(c);
  drawNetLabels(c,true);
  return {W,H,ops:c.ops};
}

function schPdfAssembler(pages,alphas){
  const enc=new TextEncoder(), parts=[], off=[];let pos=0;
  const put=d=>{if(typeof d==="string")d=enc.encode(d);parts.push(d);pos+=d.length;};
  const obj=(n,d,flux)=>{
    off[n]=pos;put(n+" 0 obj\n"+d+"\n");
    if(flux){put("stream\n");put(flux);put("\nendstream\n");}
    put("endobj\n");
  };
  const N=6+pages.length*2;
  put("%PDF-1.4\n");
  obj(1,"<< /Type /Catalog /Pages 2 0 R >>");
  obj(2,"<< /Type /Pages /Kids ["+pages.map((_,i)=>(7+i*2)+" 0 R").join(" ")+"] /Count "+pages.length+" >>");
  obj(3,"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
  obj(4,"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");
  obj(5,"<< /Type /Font /Subtype /Type1 /BaseFont /Symbol >>");
  obj(6,"<< /Font << /F1 3 0 R /F2 4 0 R /F3 5 0 R >> /ExtGState << "+
    [...alphas].map(a=>"/G"+a+" << /ca "+a/100+" /CA "+a/100+" >>").join(" ")+" >> >>");
  pages.forEach((p,i)=>{
    const flux=enc.encode(p.ops.join("\n")+"\n");
    obj(7+i*2,"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 "+pdfN(p.W)+" "+pdfN(p.H)+"] /Contents "+(8+i*2)+" 0 R /Resources 6 0 R >>");
    obj(8+i*2,"<< /Length "+flux.length+" >>",flux);
  });
  const xr=pos;
  put("xref\n0 "+(N+1)+"\n0000000000 65535 f \n");
  for(let n=1;n<=N;n++)put(String(off[n]).padStart(10,"0")+" 00000 n \n");
  put("trailer\n<< /Size "+(N+1)+" /Root 1 0 R >>\nstartxref\n"+xr+"\n%%EOF\n");
  return new Blob(parts,{type:"application/pdf"});
}

/* Le document : les feuilles demandées, chacune chargée à son tour puis la
   feuille d'origine remise. null si tout est vide. */
function schPdfDoc(o){
  const orig=S.page, alphas=new Set([100]), pages=[];
  storeCurrent();
  try{
    for(let i=0;i<S.pages.length;i++){
      if(o.feuilles!=="toutes"&&i!==orig)continue;
      if(i!==S.page)loadPage(i);
      const p=schPdfPage(o,alphas);if(p)pages.push(p);
    }
  }finally{if(S.page!==orig)loadPage(orig);}
  return pages.length?schPdfAssembler(pages,alphas):null;
}

function exportPdf(){
  const R=schPdfReglages, multi=S.pages.length>1;
  const sel=(id,opts,v)=>'<select class="tbsel" data-p="'+id+'">'+opts.map(([k,l])=>'<option value="'+k+'"'+(k===String(v)?" selected":"")+'>'+l+'</option>').join("")+'</select>';
  const ligne=(l,h)=>'<label style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin:6px 0;font-size:12.5px">'+l+h+'</label>';
  const m=document.createElement("div");m.className="modal";
  m.innerHTML='<div class="box" style="max-width:420px"><h3>📄 Exporter en PDF</h3>'+
    (multi?ligne("Feuilles",sel("feuilles",[["toutes","Toutes (une page chacune)"],["courante","Feuille courante"]],R.feuilles)):"")+
    ligne("Format",sel("papier",[["auto","Auto (cartouche, sinon A4)"],["A4","A4"],["A3","A3"],["A2","A2"],["A1","A1"],["A0","A0"],["custom","Personnalisé (mm)"]],R.papier))+
    '<div data-p="perso" style="display:none">'+ligne("Largeur × hauteur (mm)",'<span><input class="tbsel" data-p="l" type="number" min="20" max="5000" value="'+R.l+'" style="width:70px"> × <input class="tbsel" data-p="h" type="number" min="20" max="5000" value="'+R.h+'" style="width:70px"></span>')+'</div>'+
    ligne("Orientation",sel("orient",[["auto","Auto"],["paysage","Paysage"],["portrait","Portrait"]],R.orient))+
    ligne("Échelle",sel("echelle",[["fit","Ajuster à la page"],["pct","Fixe (%)"]],R.echelle)+'<input class="tbsel" data-p="pct" type="number" min="5" max="1000" value="'+R.pct+'" style="width:70px;display:none" title="100 % : le schéma à sa taille (grille de 2,54 mm)">')+
    ligne("Fond",sel("fond",[["blanc","Blanc (impression)"],["sombre","Sombre, comme l'écran"]],R.fond))+
    '<div style="display:flex;justify-content:flex-end;gap:8px;margin-top:12px"><button class="tb" data-p="non">Annuler</button><button class="tb" data-p="ok">Exporter</button></div></div>';
  document.body.appendChild(m);
  const $=id=>m.querySelector('[data-p="'+id+'"]');
  const maj=()=>{$("perso").style.display=$("papier").value==="custom"?"":"none";$("pct").style.display=$("echelle").value==="pct"?"":"none";};
  m.onchange=maj;maj();
  $("non").onclick=()=>m.remove();
  $("ok").onclick=()=>{
    const num=(id,d)=>{const v=parseFloat($(id).value);return v>0?v:d;};
    Object.assign(R,{feuilles:multi?$("feuilles").value:"courante",papier:$("papier").value,l:num("l",R.l),h:num("h",R.h),
      orient:$("orient").value,echelle:$("echelle").value,pct:num("pct",100),fond:$("fond").value});
    m.remove();
    const b=schPdfDoc(R);
    if(!b){alert("Feuille vide : rien à exporter.");return;}
    dl(b,schFile(".pdf","schema.pdf"));
    draw();
  };
}
