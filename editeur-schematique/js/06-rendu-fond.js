/* =============================================================================
   editeur-schematique — 06-rendu-fond.js
   Rendu : cadrage, grille, fils, jonctions
   ============================================================================= */
"use strict";
/* ==========================================================================
   Rendu
   ========================================================================== */
function resize(){
  const r=cv.parentElement.getBoundingClientRect(), dpr=window.devicePixelRatio||1;
  cv.width=Math.round(r.width*dpr);cv.height=Math.round(r.height*dpr);
  cv.style.width=r.width+"px";cv.style.height=r.height+"px";
  draw();
}
function w2s(x,y){return {x:x*S.scale+S.ox, y:y*S.scale+S.oy};}
function s2w(x,y){return {x:(x-S.ox)/S.scale, y:(y-S.oy)/S.scale};}

/* Pas de grille et lecture de l'échelle.
   S.grid est le pas d'accrochage choisi par l'utilisateur, exprimé en pixels
   monde. Trop serrée à l'écran, la grille devient un aplat : on n'en trace
   alors qu'une case sur deux, sur quatre… et c'est cette case-là, celle que
   l'œil voit, que le pied de page annonce. */
/* Échelle du schématique : une case de grille — G pixels monde — vaut 1 mm.
   C'est une convention de dessin, pas une cote de fabrication : un schéma n'a
   pas d'échelle physique. Le millimètre a été retenu parce que tous les
   symboles sont dessinés à ce pas (broches sur le millimètre, traits au quart
   de millimètre) : les pas offerts tombent donc juste, sans reste, et une
   broche est toujours sur une ligne de la grille. */
const MM_PER_STEP=1;
const PX_PER_MM=G/MM_PER_STEP;
const GRID_STEPS=[0.25,0.5,1,2,5].map(mm=>mm*PX_PER_MM);   // 5 · 10 · 20 · 40 · 100 px
function gridMm(w){return w/G*MM_PER_STEP;}
function fmtMm(v){return String(Math.round(v*1000)/1000).replace(".",",");}
function gridShownStep(){
  let w=S.grid||G;
  if(!S.showGrid)return w;
  for(let i=0;i<12&&w*S.scale<7;i++)w*=2;
  return w;
}
/* Ce que l'œil voit d'abord — la case tracée — puis, quand le zoom a forcé à
   n'en tracer qu'une sur deux, le pas d'accrochage réel entre parenthèses. */
function gridLabel(){
  const w=gridShownStep(), g=S.grid||G;
  return "1 carré = "+fmtMm(gridMm(w))+" mm"+
         (w!==g?" · pas "+fmtMm(gridMm(g))+" mm":"");
}
function updateGridInfo(){
  const b=document.getElementById("fGrid");
  if(!b)return;
  const w=gridShownStep();
  b.textContent=gridLabel();
  b.parentElement.title=
    "Accrochage : "+fmtMm(gridMm(S.grid||G))+" mm"+
    (w!==(S.grid||G)?"\nÀ ce niveau de zoom, une case affichée en vaut plusieurs.":"");
  const sel=document.getElementById("selGrid");
  if(sel&&+sel.value!==(S.grid||G))sel.value=String(S.grid||G);
}
function drawGrid(c,w,h){
  S.gridShown=gridShownStep();
  if(!S.showGrid)return;
  const step=S.gridShown*S.scale;
  if(step<7)return;
  const x0=((S.ox%step)+step)%step, y0=((S.oy%step)+step)%step;
  c.lineWidth=1;
  c.strokeStyle=C_GRID;
  c.beginPath();
  for(let x=x0;x<w;x+=step){c.moveTo(Math.round(x)+.5,0);c.lineTo(Math.round(x)+.5,h);}
  for(let y=y0;y<h;y+=step){c.moveTo(0,Math.round(y)+.5);c.lineTo(w,Math.round(y)+.5);}
  c.stroke();
  const big=step*5;
  const bx=((S.ox%big)+big)%big, by=((S.oy%big)+big)%big;
  c.strokeStyle=C_GRIDMAJ;c.beginPath();
  for(let x=bx;x<w;x+=big){c.moveTo(Math.round(x)+.5,0);c.lineTo(Math.round(x)+.5,h);}
  for(let y=by;y<h;y+=big){c.moveTo(0,Math.round(y)+.5);c.lineTo(w,Math.round(y)+.5);}
  c.stroke();
}
function drawWires(c){
  const std=[], bus=[];
  for(const w of S.wires){
    if(w.bus) bus.push(w);
    else std.push(w);
  }
  if(std.length){
    c.strokeStyle=C_WIRE;c.lineWidth=3.4;c.lineCap="round";
    c.beginPath();
    for(const w of std){c.moveTo(w.x1,w.y1);c.lineTo(w.x2,w.y2);}
    c.stroke();
  }
  if(bus.length){
    c.strokeStyle=C_BUS;c.lineWidth=BUS_WIDTH;c.lineCap="round";
    c.beginPath();
    for(const w of bus){c.moveTo(w.x1,w.y1);c.lineTo(w.x2,w.y2);}
    c.stroke();
  }
}
let _junCache=null, _junVer=-1;
function junctions(){
  if(_junCache && _junVer===S.wireVer) return _junCache;
  const cnt=new Map(), out=new Map();
  for(const w of S.wires){
    for(const k of [key(w.x1,w.y1),key(w.x2,w.y2)]) cnt.set(k,(cnt.get(k)||0)+1);
  }
  for(const [k,n] of cnt) if(n>=3) out.set(k,1);
  // index par abscisse (fils verticaux) et par ordonnée (fils horizontaux) :
  // évite le balayage quadratique de la détection des jonctions en T
  const vert=new Map(), horiz=new Map();
  for(const w of S.wires){
    if(w.x1===w.x2){ if(!vert.has(w.x1))vert.set(w.x1,[]); vert.get(w.x1).push(w); }
    else if(w.y1===w.y2){ if(!horiz.has(w.y1))horiz.set(w.y1,[]); horiz.get(w.y1).push(w); }
  }
  for(const w of S.wires){
    for(const e of [[w.x1,w.y1],[w.x2,w.y2]]){
      const k=key(e[0],e[1]);
      if(out.has(k))continue;
      let on=false;
      for(const o of vert.get(e[0])||[]){
        if(o!==w && e[1]>Math.min(o.y1,o.y2) && e[1]<Math.max(o.y1,o.y2)){on=true;break;}
      }
      if(!on) for(const o of horiz.get(e[1])||[]){
        if(o!==w && e[0]>Math.min(o.x1,o.x2) && e[0]<Math.max(o.x1,o.x2)){on=true;break;}
      }
      if(on) out.set(k,1);
    }
  }
  _junCache=[...out.keys()].map(k=>k.split(",").map(Number));
  _junVer=S.wireVer;
  return _junCache;
}
