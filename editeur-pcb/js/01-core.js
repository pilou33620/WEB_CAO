"use strict";
/* ==========================================================================
   Éditeur PCB — noyau
   État, couches, repères, empreintes génériques, nets et classes, contour.
   ========================================================================== */
/* ==========================================================================
   Éditeur PCB — reprend le style et les conventions de l'éditeur schématique.
   Unité monde : le millimètre. S.scale = pixels par millimètre.
   ========================================================================== */
const C_BG      = "#141416";
const C_GRID    = "#232529";
const C_GRIDMAJ = "#32353c";
const C_SUB     = "#182120";        // substrat de la carte
const C_EDGE    = "#e6e8ec";        // contour de carte
const C_SILK_T  = "#eef1f5";
const C_SILK_B  = "#7e8794";
const C_THRU    = "#f2c744";        // pastille traversante : toutes couches
const C_DRILL   = "#0c0d0f";
const C_SEL     = "#8af0ff";
const C_RATS    = "#5d6773";
const C_ERR     = "#e8443a";
const INNER_PAL = ["#5bd6a0","#c98cf0","#f2a03d","#b5d334","#f070b0","#8fa0ff"];

const PWR_RE = /^(gnd|agnd|dgnd|pgnd|masse|0v|vcc|vdd|vee|vss|\+?\d+v\d*|v\+|v-)$/i;

/* ---------- helpers courts ---------- */
const $ = id => document.getElementById(id);
const clamp = (v,a,b) => v<a?a:(v>b?b:v);
const r3 = v => Math.round(v*1000)/1000;
const fmt = (v,n) => Number(v).toFixed(n==null?2:n);
function esc(s){
  return String(s).replace(/[&<>"'`]/g,ch=>
    ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;","`":"&#96;"}[ch]));
}
function dist(x1,y1,x2,y2){return Math.hypot(x2-x1,y2-y1);}
/* distance d'un point au segment [a,b] */
function segDist(px,py,x1,y1,x2,y2){
  const dx=x2-x1, dy=y2-y1, l2=dx*dx+dy*dy;
  if(l2<1e-12)return dist(px,py,x1,y1);
  let t=((px-x1)*dx+(py-y1)*dy)/l2;
  t=clamp(t,0,1);
  return dist(px,py,x1+t*dx,y1+t*dy);
}

/* ==========================================================================
   Couches
   ========================================================================== */
function cuId(i,n){return i===0?"L1_Top":(i===n-1?"L"+n+"_Bottom":"L"+(i+1)+"_Inner");}
function cuLabel(i,n){return i===0?"Top":(i===n-1?"Bottom":"Inner "+i);}
function cuColor(i,n){
  if(i===0)return "#e8443a";
  if(i===n-1)return "#3fa0ea";
  return INNER_PAL[(i-1)%INNER_PAL.length];
}

/* ==========================================================================
   État
   ========================================================================== */
const S = {
  cu:2,                       // nombre de couches cuivre
  cuL:[],                     // {name,color,vis,plane,net}
  active:0,                   // couche cuivre active (indice)
  pair:[0,1],                 // paire de couches pour le changement rapide
  show:{silkT:true,silkB:true,edge:true,rats:true,plane:true,drc:true,
        maskT:false,maskB:false,pasteT:false,pasteB:false},
  board:{x:0,y:0,w:100,h:80,pts:null},   // pts = contour libre, sinon rectangle
  fps:[], tracks:[], vias:[], zones:[], cuts:[],
  rule:{edge:0.4,thermal:0.5,mask:0.05,paste:0.0,tented:true},
  classes:[{name:"Défaut",      w:0.3, clr:0.25, via:0.8, drill:0.4},
           {name:"Alimentation",w:0.6, clr:0.25, via:0.9, drill:0.45}],
  netClass:{},                // net → nom de classe ; absent = classe par défaut
  scale:5, ox:0, oy:0,
  grid:0.5, showGrid:true, flip:false, contrast:1,
  origin:{x:0,y:0}, fabOrigin:false,   // origine utilisateur ; repère des fichiers
  coord:{open:false,mode:"abs"},       // saisie de coordonnées au clavier
  avoid:true,                          // le tracé se tient à distance des obstacles
  mode:"select",
  sel:{fps:new Set(),tracks:new Set(),vias:new Set(),zones:new Set(),cuts:new Set(),edge:false},
  route:null,                 // tracé de piste en cours
  zoneDraft:null,             // zone en cours de saisie
  cutDraft:null,              // découpe de zone en cours
  hlNet:null,                 // net mis en avant
  hlText:null,                // texte de composant en cours de déplacement
  drc:[], drcRun:false,
  listTab:"nets", onlyUnrouted:false,
  mouse:{x:0,y:0},
  ver:0, nextId:1,
  undo:[], redo:[], dirty:false
};
function touch(){S.ver++;}

/* Construit / reconstruit l'empilage en conservant ce qui peut l'être.
   Les pistes des couches supprimées sont ramenées vers la couche voisine :
   perdre du cuivre sans prévenir serait pire que de le déplacer. */
function setCuCount(n,silent){
  const old=S.cu, oldL=S.cuL;
  const L=[];
  for(let i=0;i<n;i++){
    // report des réglages : dessus→dessus, dessous→dessous, internes par rang
    let src=null;
    if(oldL.length){
      if(i===0)src=oldL[0];
      else if(i===n-1)src=oldL[old-1];
      else src=oldL[Math.min(i,old-2)]||null;
    }
    L.push({
      name:(src&&src.custom)?src.name:cuLabel(i,n),
      custom:!!(src&&src.custom),
      color:(src&&src.color&&src.custom)?src.color:cuColor(i,n),
      vis:src?src.vis!==false:true,
      plane:!!(src&&src.plane),
      net:(src&&src.net)||"GND"
    });
  }
  const map=i=>{
    if(i===0)return 0;
    if(i===old-1)return n-1;
    return Math.min(i,n-2)>0?Math.min(i,n-2):0;
  };
  for(const t of S.tracks) t.l=clamp(map(t.l),0,n-1);
  for(const z of S.zones) z.l=clamp(map(z.l),0,n-1);
  for(const v of S.vias){
    v.a=clamp(map(v.a),0,n-1); v.b=clamp(map(v.b),0,n-1);
    if(v.a>v.b){const k=v.a;v.a=v.b;v.b=k;}
    if(v.a===v.b){v.a=0;v.b=n-1;}
  }
  S.cu=n; S.cuL=L;
  syncAutoZones();
  S.active=clamp(S.active,0,n-1);
  S.pair=[0,n-1];
  touch();
  if(!silent){buildLayers();buildTabs();refreshPanels();draw();}
}
function layerColor(i){return (S.cuL[i]&&S.cuL[i].color)||cuColor(i,S.cu);}
function activeColor(){return layerColor(S.active);}

/* ==========================================================================
   Repère écran / monde  (la vue « dessous » est un miroir autour du centre
   de la carte : les coordonnées stockées, elles, ne bougent jamais)
   ========================================================================== */
function bcx(){return S.board.x+S.board.w/2;}
function mirX(x){return S.flip?(2*bcx()-x):x;}
function w2s(x,y){return {x:mirX(x)*S.scale+S.ox, y:y*S.scale+S.oy};}
function s2w(px,py){
  const X=(px-S.ox)/S.scale;
  return {x:mirX(X), y:(py-S.oy)/S.scale};
}
function setWorld(c,dpr){
  const s=S.scale*dpr;
  if(S.flip)c.setTransform(-s,0,0,s, dpr*(2*bcx()*S.scale+S.ox), dpr*S.oy);
  else c.setTransform(s,0,0,s, dpr*S.ox, dpr*S.oy);
}
/* La grille s'accroche à l'origine utilisateur : la déplacer redresse toute la
   saisie sur un repère choisi, ce qui est tout l'intérêt de la poser. */
function snapTo(v,o){return S.grid>0?r3(Math.round((v-o)/S.grid)*S.grid+o):r3(v);}
function snapX(v){return snapTo(v,S.origin.x);}
function snapY(v){return snapTo(v,S.origin.y);}
function snap(v){return snapX(v);}
/* coordonnées telles que l'utilisateur les lit et les saisit */
function ux(x){return r3(x-S.origin.x);}
function uy(y){return r3(y-S.origin.y);}
function wxu(u){return r3(u+S.origin.x);}
function wyu(u){return r3(u+S.origin.y);}
function px(n){return n/S.scale;}          // n pixels écran, exprimés en mm

/* ==========================================================================
   Empreintes génériques
   La bibliothèque de boîtiers n'est pas gérée : chaque composant reçoit une
   empreinte paramétrique (rangée, DIP, SOIC, puce) dérivée du nombre de
   broches. Les dimensions restent modifiables dans le panneau Propriétés.
   ========================================================================== */
const STYLES={
  chip:{n:"Puce 2 pastilles (CMS)", thru:false},
  row :{n:"1 rangée (traversant)",  thru:true },
  dip :{n:"2 rangées DIP (traversant)", thru:true },
  sop :{n:"2 rangées SOIC (CMS)",   thru:false}
};
function defaultStyle(pins){
  if(pins<=2)return "chip";
  if(pins<=4)return "row";
  return "dip";
}
function defaultGeom(style){
  if(style==="chip")return {pitch:2.4, span:2.4};
  if(style==="row") return {pitch:2.54,span:2.54};
  if(style==="dip") return {pitch:2.54,span:7.62};
  return {pitch:1.27,span:5.2};
}
function mkFp(ref,value,pkg,pins){
  const style=defaultStyle(pins), g=defaultGeom(style);
  return {id:S.nextId++, ref:ref||("U"+S.nextId), value:value||"", pkg:pkg||"",
          pins:Math.max(1,pins|0), style, pitch:g.pitch, span:g.span,
          x:0, y:0, rot:0, side:0, nets:{}};
}
/* pastilles en coordonnées locales, dans l'ordre des numéros de broche */
function padsOf(fp){
  const out=[], n=fp.pins, p=fp.pitch, sp=fp.span;
  if(fp.style==="chip"){
    const w=Math.max(0.8,sp*0.55), h=Math.max(0.9,sp*0.62);
    for(let i=0;i<n;i++)
      out.push({n:i+1, x:(i-(n-1)/2)*sp, y:0, w, h, shape:"rect", drill:0});
  }else if(fp.style==="row"){
    for(let i=0;i<n;i++)
      out.push({n:i+1, x:(i-(n-1)/2)*p, y:0, w:p*0.68, h:p*0.68,
                shape:i===0?"rect":"circ", drill:Math.min(1.0,p*0.34)});
  }else{
    const h=Math.ceil(n/2), smd=fp.style==="sop";
    const pw=smd?Math.max(0.9,sp*0.30):p*0.68, ph=smd?p*0.55:p*0.68;
    for(let i=0;i<h;i++)                       // colonne gauche : 1 → h
      out.push({n:i+1, x:-sp/2, y:(i-(h-1)/2)*p, w:pw, h:ph,
                shape:(smd||i===0)?"rect":"circ", drill:smd?0:Math.min(1.0,p*0.34)});
    for(let i=h;i<n;i++){                      // colonne droite : h+1 → n, de bas en haut
      const k=n-1-i;
      out.push({n:i+1, x:sp/2, y:(k-(h-1)/2)*p, w:pw, h:ph,
                shape:smd?"rect":"circ", drill:smd?0:Math.min(1.0,p*0.34)});
    }
  }
  for(const q of out){q.net=fp.nets[q.n]||"";}
  return out;
}
/* enveloppe du corps (sérigraphie) en coordonnées locales */
function bodyOf(fp){
  const ps=padsOf(fp);
  let x1=1e9,y1=1e9,x2=-1e9,y2=-1e9;
  for(const q of ps){
    x1=Math.min(x1,q.x-q.w/2);x2=Math.max(x2,q.x+q.w/2);
    y1=Math.min(y1,q.y-q.h/2);y2=Math.max(y2,q.y+q.h/2);
  }
  if(x1>x2)return {x1:-1,y1:-1,x2:1,y2:1};
  if(fp.style==="dip"||fp.style==="sop"){
    const in1=fp.span/2-(fp.style==="dip"?1.3:0.9);
    return {x1:-in1, y1:y1-0.4, x2:in1, y2:y2+0.4};
  }
  return {x1:x1-0.25,y1:y1-0.35,x2:x2+0.25,y2:y2+0.35};
}
/* transformation locale → monde */
function fpXform(fp){
  const a=(fp.rot||0)*Math.PI/180, ca=Math.cos(a), sa=Math.sin(a), m=fp.side?-1:1;
  return (x,y)=>({x:fp.x+(m*x)*ca-y*sa, y:fp.y+(m*x)*sa+y*ca});
}
function padsWorld(fp){
  const T=fpXform(fp), a=(fp.rot||0)*Math.PI/180;
  return padsOf(fp).map(q=>{
    const c=T(q.x,q.y);
    return {n:q.n, x:r3(c.x), y:r3(c.y), w:q.w, h:q.h, shape:q.shape,
            drill:q.drill, net:q.net, rot:a, fp};
  });
}
function padLayers(fp,pad){
  if(pad.drill>0){const L=[];for(let i=0;i<S.cu;i++)L.push(i);return L;}
  return [fp.side?S.cu-1:0];
}
function fpBBox(fp){
  const T=fpXform(fp), b=bodyOf(fp), ps=padsWorld(fp);
  let x1=1e9,y1=1e9,x2=-1e9,y2=-1e9;
  for(const c of [T(b.x1,b.y1),T(b.x2,b.y1),T(b.x2,b.y2),T(b.x1,b.y2)]){
    x1=Math.min(x1,c.x);x2=Math.max(x2,c.x);y1=Math.min(y1,c.y);y2=Math.max(y2,c.y);
  }
  for(const q of ps){
    const r=Math.max(q.w,q.h)/2;
    x1=Math.min(x1,q.x-r);x2=Math.max(x2,q.x+r);y1=Math.min(y1,q.y-r);y2=Math.max(y2,q.y+r);
  }
  return {x1,y1,x2,y2};
}
function fpTextPos(fp){
  const b=bodyOf(fp);
  const size=Math.max(0.9,Math.min(2.2,(b.x2-b.x1)*0.34));
  return {
    ref: {x: fp.x+(fp.refOffX||0), y: fp.y-((b.y2-b.y1)/2+size*0.85)+(fp.refOffY||0), size: size},
    val: {x: fp.x+(fp.valOffX||0), y: fp.y+((b.y2-b.y1)/2+size*0.85)+(fp.valOffY||0), size: size*0.85}
  };
}
function fpById(id){return S.fps.find(f=>f.id===id)||null;}

/* ==========================================================================
   Zones de cuivre — polygones tracés à la main, rattachés à un net
   ========================================================================== */
function inPoly(x,y,pts){
  let inside=false;
  for(let i=0,j=pts.length-1;i<pts.length;j=i++){
    const a=pts[i], b=pts[j];
    if((a.y>y)!==(b.y>y) && x < (b.x-a.x)*(y-a.y)/(b.y-a.y)+a.x) inside=!inside;
  }
  return inside;
}
function polyBBox(pts){
  let x1=1e9,y1=1e9,x2=-1e9,y2=-1e9;
  for(const p of pts){
    x1=Math.min(x1,p.x);x2=Math.max(x2,p.x);
    y1=Math.min(y1,p.y);y2=Math.max(y2,p.y);
  }
  return {x1,y1,x2,y2};
}
/* distance d'un point au contour du polygone (utile pour l'attraper au clic) */
function polyEdgeDist(x,y,pts){
  let d=1e9;
  for(let i=0,j=pts.length-1;i<pts.length;j=i++)
    d=Math.min(d,segDist(x,y,pts[j].x,pts[j].y,pts[i].x,pts[i].y));
  return d;
}
function zoneAt(l,x,y){
  for(let i=S.zones.length-1;i>=0;i--){
    const z=S.zones[i];
    if(z.l===l&&inPoly(x,y,z.pts))return z;
  }
  return null;
}
/* Le rôle « plan de cuivre » d'une couche n'est qu'un raccourci : il entretient
   une zone pleine carte, marquée auto, qui suit le contour et le net choisis.
   Tout le reste du programme ne connaît donc que des zones. */
function syncAutoZones(){
  S.zones=S.zones.filter(z=>!z.auto||(S.cuL[z.l]&&S.cuL[z.l].plane));
  S.cuL.forEach((L,i)=>{
    if(!L.plane)return;
    let z=S.zones.find(o=>o.auto&&o.l===i);
    if(!z){z={id:S.nextId++,l:i,net:L.net||"",pts:[],auto:true};S.zones.push(z);}
    z.net=L.net||"";
    z.pts=boardZonePts();
  });
  touch();
}
/* Déformer un plan de couche à la main le détache de son rôle : à partir de là
   c'est une zone ordinaire, qui ne suivra plus les dimensions de la carte. */
function detachAuto(z){
  if(!z||!z.auto)return false;
  z.auto=false;
  if(S.cuL[z.l])S.cuL[z.l].plane=false;
  return true;
}
/* Contour de carte : rectangle par défaut, polygone dès qu'on en dessine un.
   Tout le reste du programme passe par boardPoly() et n'a pas à savoir lequel
   des deux est en vigueur. */
function boardPoly(){
  const b=S.board;
  if(b.pts&&b.pts.length>=3)return b.pts;
  return [{x:b.x,y:b.y},{x:b.x+b.w,y:b.y},{x:b.x+b.w,y:b.y+b.h},{x:b.x,y:b.y+b.h}];
}
function signedArea(pts){
  let a=0;
  for(let i=0,j=pts.length-1;i<pts.length;j=i++)
    a+=(pts[j].x*pts[i].y-pts[i].x*pts[j].y);
  return a/2;
}
function orient(pts,ccw){
  return (signedArea(pts)>0)===!!ccw?pts.slice():pts.slice().reverse();
}
/* Le remplissage d'une zone est rogné au contour moins la marge de bord : la
   zone peut donc être tracée grossièrement, elle ne débordera pas. */
function boardZonePts(){return boardPoly().map(p=>({x:r3(p.x),y:r3(p.y)}));}
function boardChanged(){
  const P=S.board.pts;
  if(P&&P.length>=3){
    const b=polyBBox(P);
    S.board.x=r3(b.x1);S.board.y=r3(b.y1);
    S.board.w=Math.max(1,r3(b.x2-b.x1));S.board.h=Math.max(1,r3(b.y2-b.y1));
  }
  syncAutoZones();
  if(typeof zoneCache!=="undefined")zoneCache.clear();
  touch();
}
/* Redimensionner : un rectangle change de côtés, un contour libre se met à
   l'échelle — ses proportions changent, pas son dessin. */
function setBoardSize(w,h){
  const b=S.board;
  w=Math.max(5,w);h=Math.max(5,h);
  if(b.pts&&b.pts.length>=3){
    const sx=w/b.w, sy=h/b.h, ox=b.x, oy=b.y;
    for(const p of b.pts){p.x=r3(ox+(p.x-ox)*sx);p.y=r3(oy+(p.y-oy)*sy);}
  }
  b.w=w;b.h=h;
  boardChanged();
}
function setBoardRect(){
  S.board.pts=null;
  boardChanged();
}

/* ==========================================================================
   Nets
   ========================================================================== */
function netColor(name){
  if(!name)return "#8b919c";
  if(/^(gnd|agnd|dgnd|pgnd|masse|0v)$/i.test(name))return "#e8746a";
  let h=0;
  for(let i=0;i<name.length;i++)h=(h*31+name.charCodeAt(i))|0;
  return "hsl("+(((h%360)+360)%360)+",64%,64%)";
}
function isPower(name){return PWR_RE.test(String(name||"").replace(/\s/g,""));}
/* ---------- classes de net ----------
   Une classe nomme un jeu de règles (largeur, isolation, via) et s'applique aux
   nets qu'on lui rattache. Tout net non rattaché suit la première, « Défaut ». */
const FALLBACK_CLASS={name:"Défaut",w:0.3,clr:0.25,via:0.8,drill:0.4};
function defClass(){return S.classes[0]||FALLBACK_CLASS;}
function classOf(net){
  const n=S.netClass[net];
  if(n){
    const c=S.classes.find(x=>x.name===n);
    if(c)return c;
  }
  return defClass();
}
function className(net){return classOf(net).name;}
function setNetClass(net,name){
  if(!net)return;
  if(!name||name===defClass().name)delete S.netClass[net];
  else S.netClass[net]=name;
}
function defaultWidth(net){return classOf(net).w;}
/* isolation entre deux nets : la plus exigeante des deux classes l'emporte */
function clrPair(a,b){return Math.max(classOf(a).clr,classOf(b).clr);}
function maxClr(){
  let m=0;
  for(const c of S.classes)m=Math.max(m,c.clr);
  return m||FALLBACK_CLASS.clr;
}
/* rattache d'office les nets d'alimentation à la classe du même nom, si elle
   existe : c'est ce que faisait l'ancienne largeur « alimentation » */
function autoClass(){
  const pwr=S.classes.find(c=>/aliment/i.test(c.name));
  if(!pwr)return;
  for(const n of netTable())
    if(isPower(n.name)&&!S.netClass[n.name])S.netClass[n.name]=pwr.name;
}
/* liste des nets présents, avec leurs nœuds */
function netTable(){
  const m=new Map();
  for(const fp of S.fps)
    for(const q of padsOf(fp)){
      if(!q.net)continue;
      if(!m.has(q.net))m.set(q.net,{name:q.net,nodes:[],color:netColor(q.net)});
      m.get(q.net).nodes.push({ref:fp.ref,pin:q.n,id:fp.id});
    }
  for(const t of S.tracks) if(t.net&&!m.has(t.net))
    m.set(t.net,{name:t.net,nodes:[],color:netColor(t.net)});
  return [...m.values()].sort((a,b)=>
    (isPower(b.name)?1:0)-(isPower(a.name)?1:0) ||
    String(a.name).localeCompare(String(b.name),"fr",{numeric:true}));
}
