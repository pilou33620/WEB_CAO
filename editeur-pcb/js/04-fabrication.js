"use strict";
/* ==========================================================================
   Éditeur PCB — fabrication
   Masque et pâte, Gerber RS-274X, perçage Excellon, archive ZIP.
   ========================================================================== */

/* ==========================================================================
   Fabrication : masque, pâte, Gerber RS-274X, perçage Excellon
   Les couches de masque et de pâte ne se dessinent pas : elles se déduisent
   des pastilles, une ouverture par pastille, dilatée ou rétreinte selon la
   règle. C'est aussi ce que fait le rendu à l'écran quand on les affiche.
   ========================================================================== */
const C_MASK="#a97bf0", C_PASTE="#c3cad4";

/* ouvertures de masque d'une face : toutes les pastilles présentes, plus les
   vias si on ne les recouvre pas de vernis */
function maskOpenings(side){
  const l=side?S.cu-1:0, out=[];
  for(const fp of S.fps)
    for(const q of padsWorld(fp)){
      if(!padLayers(fp,q).includes(l))continue;
      out.push({q,grow:S.rule.mask});
    }
  if(!viaTented())
    for(const v of S.vias)
      if(l>=v.a&&l<=v.b)
        out.push({q:{x:v.x,y:v.y,w:v.d,h:v.d,shape:"circ",rot:0,drill:v.drill,net:v.net},
                  grow:S.rule.mask});
  return out;
}
/* ouvertures de pochoir : uniquement les pastilles brasées en surface, jamais
   un trou métallisé — on ne sérigraphie pas de pâte dans un trou */
function pasteOpenings(side){
  const l=side?S.cu-1:0, out=[];
  for(const fp of S.fps){
    if(!!fp.side!==!!side)continue;
    for(const q of padsWorld(fp)){
      if(q.drill>0)continue;
      if(!padLayers(fp,q).includes(l))continue;
      out.push({q,grow:-S.rule.paste});
    }
  }
  return out;
}
function padOutline(c,q,grow,color,lw){
  c.save();c.translate(q.x,q.y);c.rotate(q.rot);
  const g=grow||0;
  c.beginPath();
  if(q.shape==="circ")c.arc(0,0,Math.max(q.w,q.h)/2+g,0,Math.PI*2);
  else{
    const w=Math.max(0.02,q.w+2*g), h=Math.max(0.02,q.h+2*g), r=Math.min(w,h)*0.22;
    c.moveTo(-w/2+r,-h/2);
    c.arcTo(w/2,-h/2,w/2,h/2,r);c.arcTo(w/2,h/2,-w/2,h/2,r);
    c.arcTo(-w/2,h/2,-w/2,-h/2,r);c.arcTo(-w/2,-h/2,w/2,-h/2,r);
    c.closePath();
  }
  c.strokeStyle=color;c.lineWidth=lw;c.stroke();
  c.restore();
}
function drawTech(c){
  for(const [side,keyM,keyP] of [[0,"maskT","pasteT"],[1,"maskB","pasteB"]]){
    if(S.show[keyM])
      for(const o of maskOpenings(side))padOutline(c,o.q,o.grow,C_MASK,px(1.1));
    if(S.show[keyP])
      for(const o of pasteOpenings(side))padOutline(c,o.q,o.grow,C_PASTE,px(1));
  }
}

/* ==========================================================================
   Police à traits pour la sérigraphie
   Les Gerber n'ont pas de texte : chaque caractère est une suite de segments,
   sur une grille de 4 × 6. Les points sont codés par paires « xy ».
   ========================================================================== */
const FONT={
  "0":"103041453616050110","1":"122026 0646","2":"01103041420646",
  "3":"01103041423313 334445361605","4":"300444 3036",
  "5":"400003334445361605","6":"4130100105163645443303",
  "7":"004016","8":"103041423313020110 1304051636454433",
  "9":"3313020110304145361605",
  "A":"0602204246 0444","B":"003041423303 03334445360600",
  "C":"4130100105163645","D":"00304145360600","E":"40000333 030646",
  "F":"400006 0333","G":"41301001051636454323","H":"0006 4046 0343",
  "I":"1030 2026 1636","J":"4045361605","K":"0006 400346",
  "L":"000646","M":"0600234046","N":"06004640","O":"103041453616050110",
  "P":"06003041423303","Q":"103041453616050110 2446",
  "R":"06003041423303 2346","S":"413010010213334445361605",
  "T":"0040 2026","U":"000516364540","V":"002640","W":"0016233640",
  "X":"0046 4006","Y":"002340 2326","Z":"00400646",
  "-":"0343","_":"0646",".":"2526","+":"0343 2125","/":"0640",
  "(":"30121436",")":"10323416","*":"0343 1124 1421",":":"2223 2425",
  "µ":"00051636 4046","#":"1016 3036 0242 0444","%":"0640 0102 4445",
  ",":"2526","=":"0242 0444","'":"2022","!":"2024 2526"
};
function glyph(ch){
  const c=String(ch).toUpperCase();
  if(FONT[c])return FONT[c];
  if(c===" ")return "";
  return FONT[c]||"";
}
/* renvoie les polylignes d'un texte, à l'échelle demandée, centrées en (x,y) */
function textStrokes(txt,x,y,h,mirror){
  const s=h/6, out=[], str=String(txt);
  const wCh=5*s, total=str.length*wCh-s;
  let ox=x-total/2;
  for(const ch of str){
    const g=glyph(ch);
    if(g)for(const poly of g.split(" ")){
      const pts=[];
      for(let i=0;i+1<poly.length;i+=2){
        const px_=parseInt(poly[i],10), py_=parseInt(poly[i+1],10);
        if(isNaN(px_)||isNaN(py_))continue;
        const gx=ox+px_*s;
        pts.push({x:mirror?(2*x-gx):gx, y:y-h/2+py_*s});
      }
      if(pts.length>1)out.push(pts);
    }
    ox+=wCh;
  }
  return out;
}

/* ==========================================================================
   Écriture Gerber
   ========================================================================== */
function gNum(v){return String(Math.round(v*1e6));}
/* Repère des fichiers : le coin inférieur gauche de la carte par défaut, ou
   l'origine utilisateur si on la préfère — c'est elle que le fabricant verra. */
function gOrigin(){
  if(S.fabOrigin)return {x:S.origin.x, y:S.origin.y};
  return {x:S.board.x, y:S.board.y+S.board.h};
}
function gXY(x,y){
  const o=gOrigin();
  return "X"+gNum(x-o.x)+"Y"+gNum(o.y-y);   // le Gerber a l'axe Y vers le haut
}
function apSet(){
  return {defs:[],macros:[],map:new Map(),next:10,
    get(def,macro){
      if(this.map.has(def))return this.map.get(def);
      if(macro&&this.macros.indexOf(macro)<0)this.macros.push(macro);
      const n=this.next++;
      this.map.set(def,n);
      this.defs.push("%ADD"+n+def+"*%");
      return n;
    }};
}
const AM_RECT="%AMRRECT*\n21,1,$1,$2,0,0,$3*%";
function apForPad(A,q,grow){
  const g=grow||0;
  if(q.shape==="circ")return A.get("C,"+fmt(Math.max(0.01,Math.max(q.w,q.h)+2*g),4));
  let w=Math.max(0.01,q.w+2*g), h=Math.max(0.01,q.h+2*g);
  const deg=((Math.round((q.rot||0)*180/Math.PI)%360)+360)%360;
  if(deg===0||deg===180)return A.get("R,"+fmt(w,4)+"X"+fmt(h,4));
  if(deg===90||deg===270)return A.get("R,"+fmt(h,4)+"X"+fmt(w,4));
  return A.get("RRECT,"+fmt(w,4)+"X"+fmt(h,4)+"X"+deg,AM_RECT);
}
function gHeader(fn){
  return ["G04 Editeur PCB - "+fn+"*",
          "%FSLAX46Y46*%","%MOMM*%",
          "%TF.GenerationSoftware,Editeur PCB,HTML,1.2*%",
          "%TF.CreationDate,"+new Date().toISOString()+"*%",
          "%TF.FileFunction,"+fn+"*%",
          "%TF.FilePolarity,Positive*%",
          "%LPD*%","G01*"];
}
function gAssemble(head,A,body){
  return head.concat(A.macros,A.defs,body,["M02*"]).join("\n")+"\n";
}
function gSeg(body,A,x1,y1,x2,y2,w){
  body.push("D"+A.get("C,"+fmt(Math.max(0.01,w),4))+"*");
  body.push(gXY(x1,y1)+"D02*");
  body.push(gXY(x2,y2)+"D01*");
}
function gFlash(body,A,ap,x,y){
  body.push("D"+ap+"*");
  body.push(gXY(x,y)+"D03*");
}
function gRegion(body,pts){
  if(pts.length<3)return;
  body.push("G36*");
  body.push(gXY(pts[0].x,pts[0].y)+"D02*");
  for(let i=1;i<pts.length;i++)body.push(gXY(pts[i].x,pts[i].y)+"D01*");
  body.push(gXY(pts[0].x,pts[0].y)+"D01*");
  body.push("G37*");
}
/* Extérieur du contour de carte, en une seule région : le rectangle englobant
   parcouru dans un sens, le contour dans l'autre, reliés par une entaille —
   c'est la construction admise pour une région à trou. Puis une bande au trait
   le long du bord retire la marge. */
function gOutside(body,A,x1,y1,x2,y2){
  const P=boardPoly(), m=S.rule.edge;
  const out=orient([{x:x1,y:y1},{x:x2,y:y1},{x:x2,y:y2},{x:x1,y:y2}],true);
  const inn=orient(P,false);
  const pts=out.concat([out[0]],inn,[inn[0]]);
  gRegion(body,pts);
  if(m>0)
    for(let i=0,j=P.length-1;i<P.length;j=i++)
      gSeg(body,A,P[j].x,P[j].y,P[i].x,P[i].y,2*m);
}
function gRect(body,x1,y1,x2,y2){
  gRegion(body,[{x:x1,y:y1},{x:x2,y:y1},{x:x2,y:y2},{x:x1,y:y2}]);
}
/* Le cuivre d'une couche reprend l'ordre exact du rendu : la zone, puis les
   dégagements en polarité négative, puis le cuivre par-dessus. */
function gerberCopper(i){
  const A=apSet(), body=[];
  const zs=S.zones.filter(z=>z.l===i&&z.pts.length>=3);
  const b=S.board, m=S.rule.edge;
  if(zs.length){
    for(const z of zs)gRegion(body,z.pts);
    /* hors carte : on rogne comme à l'écran, contour libre compris */
    body.push("%LPC*%");
    let zx1=1e9,zy1=1e9,zx2=-1e9,zy2=-1e9;
    for(const z of zs){
      const q=polyBBox(z.pts);
      zx1=Math.min(zx1,q.x1);zy1=Math.min(zy1,q.y1);
      zx2=Math.max(zx2,q.x2);zy2=Math.max(zy2,q.y2);
    }
    zx1-=1;zy1-=1;zx2+=1;zy2+=1;
    gOutside(body,A,zx1,zy1,zx2,zy2);
    for(const ct of S.cuts){
      if(ct.l===i&&ct.pts.length>=3)gRegion(body,ct.pts);
    }
    const zn=(x,y)=>{const z=zoneAt(i,x,y);return z?z.net:null;};
    for(const t of S.tracks){
      if(t.l!==i)continue;
      const z=zn((t.x1+t.x2)/2,(t.y1+t.y2)/2);
      if(z===null||z===t.net)continue;
      gSeg(body,A,t.x1,t.y1,t.x2,t.y2,t.w+2*clrPair(z,t.net));
    }
    for(const v of S.vias){
      if(i<v.a||i>v.b)continue;
      const z=zn(v.x,v.y);
      if(z===null)continue;
      if(z===v.net)gFlash(body,A,A.get("C,"+fmt(v.drill,4)),v.x,v.y);
      else gFlash(body,A,A.get("C,"+fmt(v.d+2*clrPair(z,v.net),4)),v.x,v.y);
    }
    const thermals=[];
    for(const fp of S.fps)
      for(const q of padsWorld(fp)){
        if(!padLayers(fp,q).includes(i))continue;
        const z=zn(q.x,q.y);
        if(z===null)continue;
        const same=(z===q.net&&q.net);
        gFlash(body,A,apForPad(A,q,same?classOf(z).clr:clrPair(z,q.net)),q.x,q.y);
        if(same)thermals.push(q);
        else if(q.drill>0)
          gFlash(body,A,A.get("C,"+fmt(q.drill+2*clrPair(z,q.net),4)),q.x,q.y);
      }
    body.push("%LPD*%");
    const tw=S.rule.thermal;
    for(const q of thermals){          // les quatre bras des liaisons thermiques
      const len=Math.max(q.w,q.h)/2+classOf(q.net).clr+0.2;
      const ca=Math.cos(q.rot), sa=Math.sin(q.rot);
      gSeg(body,A,q.x-len*ca,q.y-len*sa,q.x+len*ca,q.y+len*sa,tw);
      gSeg(body,A,q.x+len*sa,q.y-len*ca,q.x-len*sa,q.y+len*ca,tw);
      if(q.drill>0){
        body.push("%LPC*%");
        gFlash(body,A,A.get("C,"+fmt(q.drill,4)),q.x,q.y);
        body.push("%LPD*%");
      }
    }
  }
  for(const t of S.tracks)
    if(t.l===i)gSeg(body,A,t.x1,t.y1,t.x2,t.y2,t.w);
  for(const v of S.vias)
    if(i>=v.a&&i<=v.b)gFlash(body,A,A.get("C,"+fmt(v.d,4)),v.x,v.y);
  for(const fp of S.fps)
    for(const q of padsWorld(fp))
      if(padLayers(fp,q).includes(i))gFlash(body,A,apForPad(A,q,0),q.x,q.y);
  const fn="Copper,L"+(i+1)+","+(i===0?"Top":(i===S.cu-1?"Bot":"Inr"));
  return gAssemble(gHeader(fn),A,body);
}
function gerberMask(side){
  const A=apSet(), body=[];
  for(const o of maskOpenings(side))gFlash(body,A,apForPad(A,o.q,o.grow),o.q.x,o.q.y);
  return gAssemble(gHeader("Soldermask,"+(side?"Bot":"Top")),A,body);
}
function gerberPaste(side){
  const A=apSet(), body=[];
  for(const o of pasteOpenings(side))gFlash(body,A,apForPad(A,o.q,o.grow),o.q.x,o.q.y);
  return gAssemble(gHeader("Paste,"+(side?"Bot":"Top")),A,body);
}
function gerberSilk(side){
  const A=apSet(), body=[], lw=0.15;
  for(const fp of S.fps){
    if(!!fp.side!==!!side)continue;
    const T=fpXform(fp), bb=bodyOf(fp);
    const c=[T(bb.x1,bb.y1),T(bb.x2,bb.y1),T(bb.x2,bb.y2),T(bb.x1,bb.y2)];
    for(let k=0;k<4;k++)gSeg(body,A,c[k].x,c[k].y,c[(k+1)%4].x,c[(k+1)%4].y,lw);
    const ps=padsWorld(fp);
    if(ps.length){                       // point de repère de la broche 1
      const p1=ps[0], r=Math.max(p1.w,p1.h)/2+0.4;
      const a0=Math.atan2(p1.y-fp.y,p1.x-fp.x)||Math.PI;
      gFlash(body,A,A.get("C,"+fmt(0.4,4)),
        p1.x+Math.cos(a0)*r,p1.y+Math.sin(a0)*r);
    }
    const h=clamp((bb.x2-bb.x1)*0.34,0.8,1.6);
    // sur la face inférieure, le texte doit être en miroir dans le fichier
    // pour se lire à l'endroit une fois la carte retournée
    for(const poly of textStrokes(fp.ref,fp.x,fp.y-((bb.y2-bb.y1)/2+h*0.9),h,!!side))
      for(let k=0;k+1<poly.length;k++)
        gSeg(body,A,poly[k].x,poly[k].y,poly[k+1].x,poly[k+1].y,lw);
  }
  return gAssemble(gHeader("Legend,"+(side?"Bot":"Top")),A,body);
}
function gerberEdge(){
  const A=apSet(), body=[], c=boardPoly();
  for(let k=0;k<c.length;k++)
    gSeg(body,A,c[k].x,c[k].y,c[(k+1)%c.length].x,c[(k+1)%c.length].y,0.1);
  return gAssemble(gHeader("Profile,NP"),A,body);
}
/* ---------- perçage Excellon ---------- */
function drillFile(){
  const tools=new Map();
  const add=(d,x,y)=>{
    const k=fmt(d,3);
    if(!tools.has(k))tools.set(k,[]);
    tools.get(k).push({x,y});
  };
  for(const fp of S.fps)
    for(const q of padsWorld(fp))
      if(q.drill>0)add(q.drill,q.x,q.y);
  for(const v of S.vias)add(v.drill,v.x,v.y);
  const keys=[...tools.keys()].sort((a,b)=>parseFloat(a)-parseFloat(b));
  const out=["M48","; Editeur PCB - percage metallise (PTH)",
             "; epaisseur du stratifie "+fmt(stackLam(),3)+" mm",
             "; "+new Date().toISOString(),"METRIC,TZ"];
  keys.forEach((k,i)=>out.push("T"+(i+1)+"C"+k));
  out.push("%","G90","G05");
  const o=gOrigin();
  keys.forEach((k,i)=>{
    out.push("T"+(i+1));
    for(const p of tools.get(k))
      out.push("X"+fmt(p.x-o.x,3)+"Y"+fmt(o.y-p.y,3));
  });
  out.push("T0","M30");
  return {text:out.join("\n")+"\n",tools:keys.length,
          holes:[...tools.values()].reduce((a,v)=>a+v.length,0)};
}
/* ==========================================================================
   Feuille d'empilage
   Ce que le fabricant doit reproduire : la coupe de la carte, ses matières et
   ses épaisseurs. Les Gerber ne portent pas cette information — d'où un
   fichier à part, joint à l'archive et exportable seul depuis le panneau.
   Pas d'accent dans ce fichier : il traverse des chaînes d'outils CAM qui n'en
   veulent pas toujours, comme le LISEZ-MOI et l'Excellon.
   ========================================================================== */
function stackReport(){
  const st=S.stack, L=[];
  const pad=(s,n)=>{s=String(s);return s.length>=n?s:s+" ".repeat(n-s.length);};
  const lpad=(s,n)=>{s=String(s);return s.length>=n?s:" ".repeat(n-s.length)+s;};
  L.push("Editeur PCB - feuille d'empilage");
  L.push(new Date().toLocaleString("fr-FR"));
  L.push("");
  L.push("Carte "+fmt(S.board.w,2)+" x "+fmt(S.board.h,2)+" mm, "+
         S.cu+" couche(s) de cuivre.");
  L.push("Epaisseur visee "+fmt(st.target,3)+" mm, obtenue "+fmt(stackTotal(),3)+
         " mm (masque compris).");
  L.push("Stratifie nu "+fmt(stackLam(),3)+" mm : cuivre "+fmt(stackCuT(),3)+
         " mm + dielectrique "+fmt(stackDiT(),3)+" mm.");
  L.push("Finition du cuivre : "+st.finish+".");
  L.push("Masque "+st.maskColor+", "+fmt(st.maskT,3)+" mm par face, er "+
         fmt(st.maskEr,2)+".");
  L.push("Serigraphie "+st.silkColor+".");
  L.push("Traitement des vias : "+VIA_TXT[S.rule.viaFinish]+".");
  const asym=stackAsym();
  if(!asym.length)L.push("Empilage symetrique.");
  else{
    L.push("Empilage ASYMETRIQUE, a compenser ou a valider :");
    for(const x of asym)
      L.push("  "+(x.what==="cu"?"cuivre ":"dielectrique ")+(x.i+1)+
             " ("+x.a+") contre le "+(x.j+1)+" ("+x.b+")");
  }
  const a=worstAspect();
  if(a)L.push("Rapport d'aspect le plus defavorable : "+fmt(a.ratio,1)+
              " pour 1 (percage "+fmt(a.drill,2)+" mm sur "+fmt(a.len,2)+" mm)"+
              (a.ratio>ASPECT_WARN?", au-dela de "+ASPECT_WARN+" pour 1.":"."));
  const vc=viaCensus();
  if(S.vias.length){
    L.push("Vias : "+vc.through+" traversant(s), "+vc.blind+" borgne(s), "+
           vc.buried+" enterre(s)"+
           (vc.seq?" dont "+vc.seq+" hors d'un pressage unique :":"."));
    for(const v of S.vias){
      const b=viaBuild(v.a,v.b);
      if(!b.ok)L.push("  "+cuId(v.a,S.cu)+" vers "+cuId(v.b,S.cu)+" : "+noAcc(b.why));
    }
  }
  L.push("");
  L.push("Coupe, de la face composants vers la face soudure :");
  L.push("");
  L.push("  "+pad("Element",26)+pad("Role",14)+pad("Matiere",18)+
         lpad("Epaisseur",11)+lpad("er",6)+lpad("tan d",7));
  L.push("  "+"-".repeat(80));
  for(const r of stackRows()){
    let el="", role="", mat="", th="", er="", df="";
    if(r.kind==="silk"){
      el="Serigraphie "+(r.i?"dessous":"dessus");
      role="-";mat="encre "+st.silkColor;
      th="-";er="-";df="-";
    }else if(r.kind==="mask"){
      el="Masque "+(r.i?"dessous":"dessus");
      role="-";mat="vernis "+st.maskColor;
      th=fmt(st.maskT,3)+" mm";er=fmt(st.maskEr,2);df="-";
    }else if(r.kind==="cu"){
      el=(r.i+1)+" "+cuId(r.i,S.cu);
      role=roleLabel(r.i);
      mat="cuivre "+ozLabel(cuT(r.i));
      th=fmt(cuT(r.i)*1000,1)+" um";er="-";df="-";
    }else{
      const d=diAt(r.i);
      el="  "+(d.k==="core"?"Ame (core)":(d.k==="prepreg"?"Prepreg":"Film"));
      role="-";mat=d.mat;
      th=fmt(d.t,3)+" mm";er=fmt(d.er,2);df=fmt(d.df,3);
    }
    L.push("  "+pad(el,26)+pad(role,14)+pad(mat,18)+lpad(th,11)+lpad(er,6)+lpad(df,7));
  }
  L.push("");
  L.push("Tolerance usuelle du fabricant sur l'epaisseur totale : +/- 10 %.");
  L.push("Les epaisseurs de cuivre sont celles apres depot : une couche interne");
  L.push("commandee en 17,5 um sort a 17,5 um, une couche externe en 35 um sort");
  L.push("plus epaisse si un cuivrage de trous s'y ajoute.");
  return L.join("\n")+"\n";
}
/* Les libellés de l'interface portent des accents ; ces fichiers-là n'en
   veulent pas. Ce qui vient de l'utilisateur — noms de couche, de net, de
   matière — passe tel quel : le déformer serait pire que de l'accentuer. */
function noAcc(s){
  const M={"à":"a","â":"a","ä":"a","ç":"c","é":"e","è":"e","ê":"e","ë":"e",
           "î":"i","ï":"i","ô":"o","ö":"o","ù":"u","û":"u","ü":"u","ÿ":"y",
           "œ":"oe","æ":"ae","É":"E","È":"E","Ê":"E","À":"A","Â":"A","Ç":"C",
           "Î":"I","Ô":"O","Û":"U","«":'"',"»":'"',"’":"'","—":"-","–":"-",
           "…":"...","·":"-","µ":"u","Ω":"ohm","²":"2"};
  return String(s).replace(/[^ -~]/g,ch=>M[ch]===undefined?ch:M[ch]);
}
const VIA_TXT={
  open   :"ouverts au masque",
  tented :"recouverts de vernis (IPC-4761 type II)",
  plugged:"bouches resine, non plaques (IPC-4761 type V)",
  filled :"bouches et plaques, via-in-pad (IPC-4761 type VII)"
};
function fabReadme(files,dr){
  const L=[];
  L.push("Editeur PCB — dossier de fabrication");
  L.push(new Date().toLocaleString("fr-FR"));
  L.push("");
  L.push("Carte : "+fmt(S.board.w,2)+" x "+fmt(S.board.h,2)+" mm"+
         (S.board.pts?" (contour libre, "+S.board.pts.length+" sommets)":" (rectangle)")+
         ", "+S.cu+" couche(s) de cuivre.");
  L.push("Empilage : "+fmt(stackTotal(),3)+" mm, finition "+S.stack.finish+
         " ; la coupe complete est dans EMPILAGE.txt.");
  L.push("Origine des coordonnees : "+(S.fabOrigin
    ? "origine utilisateur (les coordonnees peuvent etre negatives)"
    : "coin inferieur gauche de la carte")+".");
  L.push("Gerber RS-274X, millimetres, format 4.6, polarite positive.");
  L.push("Percage Excellon metrique, trous metallises.");
  L.push("");
  L.push("Fichiers :");
  for(const f of files)L.push("  "+f.name);
  L.push("");
  L.push("Regles :");
  for(const c of S.classes)
    L.push("  classe "+c.name+" : piste "+fmt(c.w,2)+" mm, isolation "+fmt(c.clr,2)+
           " mm, via "+fmt(c.via,2)+"/"+fmt(c.drill,2)+" mm");
  L.push("  dilatation du masque : "+fmt(S.rule.mask,2)+" mm");
  L.push("  retrait de la pate : "+fmt(S.rule.paste,2)+" mm");
  L.push("  traitement des vias : "+VIA_TXT[S.rule.viaFinish]);
  L.push("  percages : "+dr.tools+" outil(s), "+dr.holes+" trou(s)");
  L.push("");
  L.push("Les zones de cuivre utilisent la polarite negative (LPC) pour leurs");
  L.push("degagements, conformement a la norme RS-274X.");
  return L.join("\n")+"\n";
}
function buildFabFiles(){
  const base="carte";
  const files=[];
  for(let i=0;i<S.cu;i++){
    const ext = i===0?".GTL":(i===S.cu-1?".GBL":".GL"+(i+1));
    files.push({name:base+ext,text:gerberCopper(i)});
  }
  files.push({name:base+".GTS",text:gerberMask(0)});
  if(S.cu>1)files.push({name:base+".GBS",text:gerberMask(1)});
  files.push({name:base+".GTP",text:gerberPaste(0)});
  if(S.cu>1)files.push({name:base+".GBP",text:gerberPaste(1)});
  files.push({name:base+".GTO",text:gerberSilk(0)});
  if(S.cu>1)files.push({name:base+".GBO",text:gerberSilk(1)});
  files.push({name:base+".GKO",text:gerberEdge()});
  const dr=drillFile();
  files.push({name:base+".TXT",text:dr.text});
  files.push({name:"EMPILAGE.txt",text:stackReport()});
  files.push({name:"LISEZ-MOI.txt",text:fabReadme(files,dr)});
  return {files,drill:dr};
}

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
function zipBlob(files){
  const enc=new TextEncoder();
  const parts=[], central=[];
  let off=0;
  const u16=v=>[v&255,(v>>8)&255];
  const u32=v=>[v&255,(v>>8)&255,(v>>16)&255,(v>>24)&255];
  const now=new Date();
  const time=((now.getHours()<<11)|(now.getMinutes()<<5)|(now.getSeconds()>>1))&0xFFFF;
  const date=(((now.getFullYear()-1980)<<9)|((now.getMonth()+1)<<5)|now.getDate())&0xFFFF;
  for(const f of files){
    const name=enc.encode(f.name), data=enc.encode(f.text);
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
  return new Blob(parts.concat(cParts,[end]),{type:"application/zip"});
}
function exportFab(){
  if(!S.fps.length&&!S.tracks.length){
    alert("Rien à fabriquer : la carte est vide.");
    return null;
  }
  const {files,drill}=buildFabFiles();
  dl(zipBlob(files),"fabrication.zip");
  hint(files.length+" fichier(s) exportés dans fabrication.zip — "+
       drill.holes+" trou(s), "+drill.tools+" outil(s) de perçage.");
  return files;
}
