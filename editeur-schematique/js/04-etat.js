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
/* Le symbole d'un CI se dessine de deux façons, au choix :
   — « dip »  : rectangle, deux rangées. Broches 1..n : colonne gauche de haut en
                bas, puis colonne droite de bas en haut (convention DIP/SOIC).
   — « quad » : carré, quatre côtés. Numérotation antihoraire depuis le haut du
                côté gauche : gauche ↓, bas →, droite ↑, haut ← (convention
                QFP/QFN). Au-delà d'une trentaine de broches, la colonne unique
                du rectangle devient interminable : le carré reste lisible.
   Pas de 20 px dans les deux cas, pour rester sur la grille. */
function icShapeOf(el){return (el&&el.icShape==="quad")?"quad":"dip";}
const IC_QUAD_MIN=4;                 // au moins une broche par côté
function icGeom(el){
  let n=Math.max(2,Math.min(64,Math.round((el&&el.npins)||8)));
  if(icShapeOf(el)==="quad"){
    n=Math.max(IC_QUAD_MIN,n);
    // répartition dans l'ordre du brochage : gauche, bas, droite, haut
    const b=Math.floor(n/4), r=n%4;
    const cnt=[b+(r>0?1:0), b+(r>1?1:0), b+(r>2?1:0), b];
    const m=Math.max(cnt[0],cnt[1],cnt[2],cnt[3],1);
    /* Corps carré : demi-côté arrondi au pas de grille, pour que les broches
       tombent sur des multiples de 20 depuis le centre. La marge d'angle est de
       deux pas : à un seul pas, le dernier numéro d'une colonne et le premier de
       la rangée voisine se chevauchent dans le coin. Plancher à 60 pour laisser
       la valeur s'imprimer au centre. */
    const end=Math.ceil((m-1)/2)*20;          // broche la plus excentrée d'un côté
    const hs=Math.max(60,Math.ceil((end+40)/20)*20);
    return {n,quad:true,cnt,hs,d:hs+20,top:-hs,h:2*hs,mid:0,
            off:k=>-Math.floor((k-1)/2)*20};
  }
  const half=Math.ceil(n/2), r=n-half;
  const y0=-Math.floor((half-1)/2)*20;
  const top=y0-16, h=(half-1)*20+32;
  return {n,quad:false,half,r,y0,top,h,mid:y0+(half-1)*10};
}
// une seule source pour les positions : le dessin et le calcul des nets ne
// peuvent pas diverger
function icPins(el){
  const g=icGeom(el), a=[];
  if(g.quad){
    const [cL,cB,cR,cT]=g.cnt;
    let s=g.off(cL); for(let i=0;i<cL;i++)a.push([-g.d, s+i*20]);
    s=g.off(cB);     for(let i=0;i<cB;i++)a.push([s+i*20, g.d]);
    s=g.off(cR);     for(let i=0;i<cR;i++)a.push([g.d, s+(cR-1-i)*20]);
    s=g.off(cT);     for(let i=0;i<cT;i++)a.push([s+(cT-1-i)*20, -g.d]);
    return a;
  }
  for(let i=0;i<g.half;i++)a.push([-60,g.y0+i*20]);
  for(let j=0;j<g.r;j++)a.push([60,g.y0+(g.r-1-j)*20]);
  return a;
}
/* Boîtier proposé à la création, ou quand on bascule d'une représentation à
   l'autre sans y avoir touché : deux rangées → DIP, quatre côtés → le premier
   boîtier carré de la bibliothèque qui existe dans ce brochage. */
function icAutoPkg(el){
  const n=icGeom(el).n;
  if(icShapeOf(el)!=="quad")return "DIP-"+n;
  for(const b of ["QFN","LQFP","TQFP","QFP","PLCC"]){
    const base=PKG_BASES.find(x=>x.b===b);
    if(base&&base.pins&&base.pins.includes(n))return b+"-"+n;
  }
  return "QFN-"+n;
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
function snap(v){return Math.round(v/G)*G;}
function key(x,y){return x+","+y;}
