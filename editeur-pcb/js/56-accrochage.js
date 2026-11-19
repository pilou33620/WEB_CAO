"use strict";
/* ==========================================================================
   56-accrochage.js — l'accrochage aux objets, à priorités réglables, et les
   guides d'alignement (Altium « Snap to object », « Snap to axis »)
   --------------------------------------------------------------------------
   La grille n'est qu'un des aimants. Par ordre de priorité, le curseur prend :
     1. le centre d'une pastille                         (S.snap.pad)
     2. un via, un bout de piste                          (S.snap.bout)
     3. le milieu d'un segment du net, sinon son axe      (S.snap.milieu)
     4. l'axe d'un objet voisin : même X ou même Y qu'une pastille, un via, un
        bout de piste — hors grille compris               (S.snap.axe)
     5. le nœud de grille.
   `S.snap.portee` est la portée des aimants, en pixels d'écran. Le point
   accroché se dit à l'écran (cercle et son nom), et un guide en pointillé
   relie le curseur à l'objet avec lequel il est aligné.
   Ces réglages décrivent une façon de travailler : ils suivent l'utilisateur
   (16-profil.js), pas la carte.
   ========================================================================== */
/* Une fonction, pas une constante : dans la version un seul fichier, 16-profil.js appelle
   snapNorm() avant que cette ligne ne soit exécutée (voir la note de PCB_PROFIL_PRET). */
function snapUsine(){return {pad:true,bout:true,milieu:true,axe:true,portee:9};}
/* S.snap et S.guides naissent avec l'état (01-core.js) ; le profil les remplace (16-profil.js). */
function snapPortee(){const p=+(S.snap&&S.snap.portee);return px(p>=3&&p<=40?p:9);}
function snapNorm(o){
  const s=snapUsine();
  if(o&&typeof o==="object"){
    for(const k of ["pad","bout","milieu","axe"])if(typeof o[k]==="boolean")s[k]=o[k];
    if(+o.portee>=3&&+o.portee<=40)s.portee=Math.round(+o.portee);
  }
  return s;
}
/* Les points de la couche `l` sur lesquels on s'aligne ; `sauf` : boîtiers qu'on déplace. */
function accrochePoints(l,sauf){
  const P=[];
  for(const fp of S.fps){
    if(sauf&&sauf.has(fp.id))continue;
    if(l==null){P.push({x:fp.x,y:fp.y});continue;}
    for(const q of padsWorld(fp))if(padCuLayers(fp,q).includes(l))P.push({x:q.x,y:q.y});
  }
  if(l!=null){
    for(const v of S.vias)if(l>=v.a&&l<=v.b)P.push({x:v.x,y:v.y});
    for(const t of S.tracks)if(t.l===l){P.push({x:t.x1,y:t.y1});P.push({x:t.x2,y:t.y2});}
  }
  return P;
}
/* Le point `p` (déjà sur la grille) tiré sur l'axe d'un objet voisin, quand le pointeur
   (x, y) en est à moins de la demi-portée — et jamais à plus d'un demi-pas, pour que les
   nœuds voisins restent atteignables. */
function accrocheAxes(p,x,y,l,sauf){
  if(!S.snap.axe)return p;
  const tol=Math.min(snapPortee()/2,S.grid>0?S.grid/2:Infinity);
  let bx=tol,by=tol,ax=p.x,ay=p.y;
  for(const o of accrochePoints(l,sauf)){
    const dx=Math.abs(o.x-x), dy=Math.abs(o.y-y);
    if(dx<bx&&dy>1e-6){bx=dx;ax=o.x;}
    if(dy<by&&dx>1e-6){by=dy;ay=o.y;}
  }
  return {x:r3(ax),y:r3(ay)};
}
/* Les guides : pour le point posé `p`, l'objet le plus proche qui partage son X, et celui
   qui partage son Y (à 60 mm au plus). */
function accrocheGuides(p,l,sauf){
  if(!p||!S.snap.axe)return [];
  let gx=null,gy=null;
  for(const o of accrochePoints(l,sauf)){
    const dx=Math.abs(o.x-p.x), dy=Math.abs(o.y-p.y);
    if(dx<1e-6&&dy>1e-6&&dy<60&&(!gx||dy<gx.d))gx={d:dy,o};
    if(dy<1e-6&&dx>1e-6&&dx<60&&(!gy||dx<gy.d))gy={d:dx,o};
  }
  return [gx,gy].filter(Boolean).map(g=>({x1:p.x,y1:p.y,x2:g.o.x,y2:g.o.y}));
}
function drawGuides(c){
  if(!S.guides||!S.guides.length)return;
  c.save();
  c.strokeStyle=C_SEL;c.lineWidth=px(1);c.globalAlpha=0.75;c.setLineDash([px(6),px(4)]);
  for(const g of S.guides){
    c.beginPath();c.moveTo(g.x1,g.y1);c.lineTo(g.x2,g.y2);c.stroke();
    c.beginPath();c.arc(g.x2,g.y2,px(4),0,Math.PI*2);c.stroke();
  }
  c.restore();
}
/* ---------- la fenêtre des réglages ---------- */
function accrocheDialogue(){
  if(typeof document==="undefined")return;
  const m=document.createElement("div");
  m.className="modal";
  const ligne=(k,t,aide)=>'<label class="check" style="display:block;margin:6px 0" title="'+aide+'">'+
    '<input type="checkbox" data-k="'+k+'"'+(S.snap[k]?" checked":"")+'> '+t+'</label>';
  m.innerHTML='<div class="box" style="max-width:460px"><h3>Accrochage aux objets</h3>'+
    '<p>Par ordre de priorité ; la grille vient en dernier. Ces réglages vous suivent, ils ne sont pas rangés dans la carte.</p>'+
    ligne("pad","1 · Centre de pastille","La piste entre au centre de la pastille visée")+
    ligne("bout","2 · Via et bout de piste","Reprendre une piste par son bout, arriver sur un via")+
    ligne("milieu","3 · Milieu de segment","Sur le corps d'une piste du net, le milieu du segment attire le point")+
    ligne("axe","4 · Axe d'un objet voisin, avec guides","Même X ou même Y qu'une pastille, un via, un bout de piste (ou le centre d'un boîtier voisin pendant un déplacement) : le curseur s'y aligne et un guide en pointillé le montre")+
    '<div style="margin:10px 0 4px">Portée des aimants <input type="number" id="snPortee" min="3" max="40" step="1" value="'+S.snap.portee+'" style="width:64px"> px</div>'+
    '<div style="display:flex;justify-content:flex-end;gap:8px;margin-top:12px">'+
    '<button class="tb" id="snUsine">Valeurs d\'usine</button><button class="tb on" id="snOk">Fermer</button></div></div>';
  document.body.appendChild(m);
  const lire=()=>{
    const o={portee:+m.querySelector("#snPortee").value};
    m.querySelectorAll("input[data-k]").forEach(i=>{o[i.dataset.k]=i.checked;});
    S.snap=snapNorm(o);
    if(typeof profilNoter==="function")profilNoter();
    draw();
  };
  m.addEventListener("change",lire);
  const fermer=()=>{lire();m.remove();};
  m.onclick=e=>{if(e.target===m)fermer();};
  m.querySelector("#snOk").onclick=fermer;
  m.querySelector("#snUsine").onclick=()=>{S.snap=snapUsine();if(typeof profilNoter==="function")profilNoter();m.remove();accrocheDialogue();};
}
(function(){const b=typeof $==="function"&&$("bAccroche");if(b)b.onclick=accrocheDialogue;})();
/* 16-profil.js s'applique avant le chargement de ce fichier (version éclatée) : le réglage se relit ici. */
if(typeof profLire==="function"&&typeof PCB_PROFIL!=="undefined"){
  const lu=profLire(PCB_PROFIL);
  if(lu&&lu.accrocheObj)S.snap=snapNorm(lu.accrocheObj);
}
