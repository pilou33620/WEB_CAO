/* =============================================================================
   editeur-schematique — 04-etat.js
   État global, sélection, canvas, géométrie des symboles
   ============================================================================= */
"use strict";
/* ==========================================================================
   État
   ========================================================================== */
const S={
  pages:[], page:0,               // feuilles du document
  comps:[], wires:[],             // contenu de la feuille active (références)
  sel:new Set(),                  // ids des composants sélectionnés
  selW:new Set(),                 // fils sélectionnés (références directes)
  mode:"select",                  // select | wire | erase
  place:null,                     // type en cours de pose
  scale:1, ox:0, oy:0,
  showGrid:true,
  wireStart:null, mouse:{x:0,y:0}, hoverPin:null,
  drag:null, pan:null, marquee:null,
  uid:1, hist:[], redo:[],
  grid:G, gridShown:G,             // pas d'accrochage · pas réellement affiché
  wireVer:0, dirty:false, bomAll:false,
  netLabels:2, hoverNet:null, listTab:"bom", netAll:false  // 0 aucune · 1 nommés · 2 tous
};
const HIST_MAX=60;
// toute modification des fils invalide le cache des jonctions
function touchWires(){S.wireVer++;}

/* ---------- sélection mixte : composants (par id) + fils (par référence) ---------- */
function clearSel(){S.sel.clear();S.selW.clear();}
function selEls(){return S.comps.filter(c=>S.sel.has(c.id));}
function selWires(){return S.wires.filter(w=>S.selW.has(w));}
function selCount(){return S.sel.size+selWires().length;}
// un fil supprimé peut rester dans selW : on écarte les références mortes
function pruneSel(){
  if(!S.selW.size)return;
  const live=new Set(S.wires);
  for(const w of S.selW) if(!live.has(w)) S.selW.delete(w);
}
const cv=document.getElementById("sheet"), ctx=cv.getContext("2d");

/* ---------- géométrie ---------- */
/* Le symbole d'un CI se dessine de trois façons, au choix :
   — « dip »   : rectangle, deux rangées. Broches 1..n : colonne gauche de haut
                 en bas, puis colonne droite de bas en haut (convention
                 DIP/SOIC). La largeur du corps est réglable (el.icW).
   — « quad »  : carré, quatre côtés. Numérotation antihoraire depuis le haut du
                 côté gauche : gauche ↓, bas →, droite ↑, haut ← (convention
                 QFP/QFN). Au-delà d'une trentaine de broches, la colonne unique
                 du rectangle devient interminable : le carré reste lisible.
   — « libre » : chaque broche est posée à la main dans l'éditeur de brochage
                 (el.pinPos), le corps étant décrit par el.icBody. C'est ce qui
                 permet de grouper les alimentations en haut, les entrées à
                 gauche, les sorties à droite — la lecture du schéma y gagne
                 plus qu'à respecter l'ordre physique du boîtier.
   Pas de 20 px dans tous les cas, pour rester sur la grille. */
const IC_STEP=20;                    // pas de la grille des symboles
const IC_QUAD_MIN=4;                 // au moins une broche par côté
function icCount(el){return Math.max(2,Math.min(64,Math.round((el&&el.npins)||8)));}
/* Disposition libre exploitable, ou null : un fichier peut arriver avec un
   tableau de la mauvaise longueur, on retombe alors sur la forme rectangulaire. */
function icFree(el){
  const p=el&&el.pinPos;
  if(!Array.isArray(p)||p.length!==icCount(el))return null;
  for(const q of p)
    if(!Array.isArray(q)||!Number.isFinite(+q[0])||!Number.isFinite(+q[1]))return null;
  return p;
}
function icShapeOf(el){
  if(el&&el.icShape==="libre")return icFree(el)?"libre":"dip";
  return (el&&el.icShape==="quad")?"quad":"dip";
}
function icStep(v){return Math.round(v/IC_STEP)*IC_STEP;}
function icCeil(v){return Math.ceil(v/IC_STEP)*IC_STEP;}
/* Demi-largeur minimale du corps : tout ce qui s'imprime dedans doit y tenir —
   la colonne de noms de gauche, celle de droite, et la valeur au milieu, marges
   comprises. Un composant nommé « IRA-S400st01A01 » élargit donc son symbole au
   lieu de laisser le texte déborder sur les fils voisins. Les broches s'écartent
   d'autant — c'est ce qui garde le texte à l'intérieur — et le câblage suit
   (reshapeComp), de sorte qu'un symbole déjà relié ne se décroche pas.

   Le calcul ne dépend que du texte : icPinLabel n'a pas besoin de la géométrie,
   sans quoi la largeur se définirait à partir d'elle-même. */
const IC_TXT_PAD=14;                 // marge de part et d'autre du texte
function icNameCols(el,n,shape){
  // indices des broches des côtés gauche et droit, selon la représentation
  let left=[], right=[];
  if(shape==="quad"){
    const b=Math.floor(n/4), r=n%4;
    const cL=b+(r>0?1:0), cB=b+(r>1?1:0), cR=b+(r>2?1:0);
    for(let i=0;i<cL;i++)left.push(i);
    for(let i=0;i<cR;i++)right.push(cL+cB+i);
  }else{
    const half=Math.ceil(n/2);
    for(let i=0;i<half;i++)left.push(i);
    for(let i=half;i<n;i++)right.push(i);
  }
  /* Seules les broches nommées comptent : un simple numéro tient dans la marge,
     et le faire entrer dans le calcul élargirait tous les symboles sans raison. */
  const w=(list,side)=>list.reduce((m,i)=>
    (el&&el.pinNames&&el.pinNames[i]) ? Math.max(m,textW(icPinLabel(el,i,side),9.5,true)) : m, 0);
  return {l:w(left,"L"), r:w(right,"R")};
}
function icTextHalf(el,n,shape){
  const t=String((el&&el.value)||"CI");
  const c=icNameCols(el,n,shape);
  return icCeil((c.l+c.r+textW(t,13,true)+2*IC_TXT_PAD)/2);
}
function icGeom(el){
  const n=icCount(el), shape=icShapeOf(el);
  if(shape==="libre"){
    const free=icFree(el).map(p=>[icStep(+p[0]),icStep(+p[1])]);
    let body=null;
    const b=el&&el.icBody;
    if(b&&["x1","y1","x2","y2"].every(k=>Number.isFinite(+b[k]))){
      body={x1:icStep(Math.min(+b.x1,+b.x2)),y1:icStep(Math.min(+b.y1,+b.y2)),
            x2:icStep(Math.max(+b.x1,+b.x2)),y2:icStep(Math.max(+b.y1,+b.y2))};
      if(body.x2-body.x1<2*IC_STEP)body.x2=body.x1+2*IC_STEP;
      if(body.y2-body.y1<2*IC_STEP)body.y2=body.y1+2*IC_STEP;
    }
    if(!body)body=icAutoBody(free);
    return {n,shape,quad:false,free,body,
            top:body.y1,h:body.y2-body.y1,mid:(body.y1+body.y2)/2};
  }
  if(shape==="quad"){
    const n4=Math.max(IC_QUAD_MIN,n);
    // répartition dans l'ordre du brochage : gauche, bas, droite, haut
    const b=Math.floor(n4/4), r=n4%4;
    const cnt=[b+(r>0?1:0), b+(r>1?1:0), b+(r>2?1:0), b];
    const m=Math.max(cnt[0],cnt[1],cnt[2],cnt[3],1);
    /* Corps carré : demi-côté arrondi au pas de grille, pour que les broches
       tombent sur des multiples de 20 depuis le centre. La marge d'angle est de
       deux pas : à un seul pas, le dernier numéro d'une colonne et le premier de
       la rangée voisine se chevauchent dans le coin. Plancher à 60 pour laisser
       la valeur s'imprimer au centre. Un demi-côté imposé (icHs, réglé dans
       l'éditeur de brochage pour loger les noms) ne descend pas sous ce plancher. */
    const end=Math.ceil((m-1)/2)*20;          // broche la plus excentrée d'un côté
    const min=Math.max(60,Math.ceil((end+40)/20)*20,icTextHalf(el,n4,"quad"));
    const hs=Math.max(min,icStep(+(el&&el.icHs)||0));
    return {n:n4,shape,quad:true,cnt,hs,hsMin:min,d:hs+20,top:-hs,h:2*hs,mid:0,
            off:k=>-Math.floor((k-1)/2)*20,
            body:{x1:-hs,y1:-hs,x2:hs,y2:hs}};
  }
  const half=Math.ceil(n/2), r=n-half;
  const y0=-Math.floor((half-1)/2)*20;
  // le corps déborde d'un millimètre au-dessus de la première broche et
  // au-dessous de la dernière : les quatre côtés tombent alors sur la grille
  const top=y0-20, h=(half-1)*20+40;
  const hwMin=Math.max(40,icTextHalf(el,n,"dip"));
  const hw=Math.max(hwMin,icStep(+(el&&el.icW)||0));   // demi-largeur du corps
  return {n,shape,quad:false,half,r,y0,top,h,hw,hwMin,mid:y0+(half-1)*10,
          body:{x1:-hw,y1:top,x2:hw,y2:top+h}};
}
function icBodyOf(el){return icGeom(el).body;}
// une seule source pour les positions : le dessin et le calcul des nets ne
// peuvent pas diverger
function icPins(el){
  const g=icGeom(el), a=[];
  if(g.shape==="libre")return g.free.map(p=>[p[0],p[1]]);
  if(g.quad){
    const [cL,cB,cR,cT]=g.cnt;
    let s=g.off(cL); for(let i=0;i<cL;i++)a.push([-g.d, s+i*20]);
    s=g.off(cB);     for(let i=0;i<cB;i++)a.push([s+i*20, g.d]);
    s=g.off(cR);     for(let i=0;i<cR;i++)a.push([g.d, s+(cR-1-i)*20]);
    s=g.off(cT);     for(let i=0;i<cT;i++)a.push([s+(cT-1-i)*20, -g.d]);
    return a;
  }
  const x=g.hw+20;
  for(let i=0;i<g.half;i++)a.push([-x,g.y0+i*20]);
  for(let j=0;j<g.r;j++)a.push([x,g.y0+(g.r-1-j)*20]);
  return a;
}
/* Côté du corps par lequel une broche entre : c'est ce qui décide du sens du
   trait de patte et de l'alignement de son numéro. */
function icSideOf(body,p){
  const x=p[0], y=p[1];
  if(x<=body.x1)return "L";
  if(x>=body.x2)return "R";
  if(y<=body.y1)return "T";
  if(y>=body.y2)return "B";
  // broche à l'intérieur du corps : on la rattache au bord le plus proche
  const d=[[x-body.x1,"L"],[body.x2-x,"R"],[y-body.y1,"T"],[body.y2-y,"B"]];
  d.sort((a,b)=>a[0]-b[0]);
  return d[0][1];
}
// point d'attache du trait de patte sur le bord du corps
function icLead(body,p,side){
  switch(side){
    case "L":return [body.x1,p[1]];
    case "R":return [body.x2,p[1]];
    case "T":return [p[0],body.y1];
    default :return [p[0],body.y2];
  }
}
/* Place horizontale libre autour d'une broche du haut ou du bas : la distance
   à sa plus proche voisine du même côté. C'est elle qui décide si un nom tient
   sans mordre sur celui d'à côté. */
function icPinRoom(pins,sides,i){
  let d=1e9;
  for(let k=0;k<pins.length;k++){
    if(k===i||sides[k]!==sides[i])continue;
    d=Math.min(d,Math.abs(pins[k][0]-pins[i][0]));
  }
  return d;
}
/* Nom affiché à côté du numéro. Sur les côtés haut et bas, deux broches ne sont
   séparées que d'un pas : un nom y déborderait sur ses voisines, on n'écrit
   alors que le numéro. */
function icPinLabel(el,i,side){
  const nm=el&&el.pinNames&&el.pinNames[i];
  const t=String(i+1);
  return (nm&&(side==="L"||side==="R")) ? t+" "+nm : t;
}
/* Boîtier proposé à la création, ou quand on bascule d'une représentation à
   l'autre sans y avoir touché : deux rangées → DIP, quatre côtés → le premier
   boîtier carré de la bibliothèque qui existe dans ce brochage. */
function icAutoPkg(el){
  const n=icGeom(el).n;
  if(icShapeOf(el)==="quad"){
    for(const b of ["QFN","LQFP","TQFP","QFP","PLCC"]){
      const base=PKG_BASES.find(x=>x.b===b);
      if(base&&base.pins&&base.pins.includes(n))return b+"-"+n;
    }
    return "QFN-"+n;
  }
  return "DIP-"+n;
}
function pinsOf(el){
  const p=defOf(el.type).pins;
  return typeof p==="function"?p(el):p;
}
const CS={0:[1,0],90:[0,1],180:[-1,0],270:[0,-1]};
function orient(el){                     // les annotations ignorent rotation et miroir
  const def=defOf(el.type);
  return def.flat?{rot:0,mir:false}:{rot:((el.rot%360)+360)%360,mir:!!el.mir};
}
function pinPos(el,i){
  const p=pinsOf(el)[i], o=orient(el);
  let x=p[0], y=p[1];
  if(o.mir)x=-x;
  const s=CS[o.rot];
  return {x:el.x+x*s[0]-y*s[1], y:el.y+x*s[1]+y*s[0]};
}
function allPins(el){return pinsOf(el).map((_,i)=>pinPos(el,i));}
function locToWorld(el,x,y){
  const o=orient(el);
  if(o.mir)x=-x;
  const s=CS[o.rot];
  return {x:el.x+x*s[0]-y*s[1], y:el.y+x*s[1]+y*s[0]};
}
function bbox(el,margin){
  const ps=allPins(el).concat([{x:el.x,y:el.y}]);
  const def=defOf(el.type);
  const e=typeof def.ext==="function"?def.ext(el):def.ext;
  if(e){
    ps.push(locToWorld(el,e[0],e[1]),locToWorld(el,e[2],e[1]),
            locToWorld(el,e[0],e[3]),locToWorld(el,e[2],e[3]));
  }
  let x1=1e9,y1=1e9,x2=-1e9,y2=-1e9;
  for(const p of ps){x1=Math.min(x1,p.x);y1=Math.min(y1,p.y);x2=Math.max(x2,p.x);y2=Math.max(y2,p.y);}
  const m=(margin===undefined)?(def.flat?7:24):margin;
  return {x1:x1-m,y1:y1-m,x2:x2+m,y2:y2+m};
}
// boîte de sélection au clic : marge réduite pour ne pas avaler les fils voisins
function hitBox(el){return bbox(el,defOf(el.type).flat?4:9);}
/* Accrochage sur le pas courant : G reste l'unité de dessin des symboles,
   S.grid ne décide que de la finesse de pose et de déplacement. */
function snap(v){
  const g=S.grid||G;
  // un pas en millimètres ne tombe pas rond en pixels : on arrondit le résultat
  // pour que deux points calculés au même endroit restent strictement égaux —
  // toute la connectivité repose sur cette égalité
  return Math.round(Math.round(v/g)*g*1e4)/1e4;
}
function key(x,y){return x+","+y;}
