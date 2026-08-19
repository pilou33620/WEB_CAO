/* =============================================================================
   editeur-schematique — 10-actions.js
   Actions : pivoter, miroir, dupliquer, supprimer, recadrer, mode
   ============================================================================= */
"use strict";
/* ==========================================================================
   Actions
   ========================================================================== */
function deleteComps(ids){
  const set=new Set(ids);
  S.comps=S.comps.filter(c=>!set.has(c.id));
  ids.forEach(i=>S.sel.delete(i));
}
/* Transforme la sélection en emmenant les extrémités de fils accrochées aux
   broches : sans cela, une rotation détache visuellement tous les câblages. */
function transformSel(fn){
  const els=selEls();if(!els.length)return;
  push();
  const moves=[];
  for(const el of els){
    const before=allPins(el);
    fn(el);
    const after=allPins(el);
    before.forEach((p,i)=>{
      const q=after[i];
      if(q&&(p.x!==q.x||p.y!==q.y))moves.push([p,q]);
    });
  }
  const done=new Set();
  for(const [a,b] of moves){
    for(let i=0;i<S.wires.length;i++){
      const w=S.wires[i];
      if(!done.has(i+":1")&&w.x1===a.x&&w.y1===a.y){w.x1=b.x;w.y1=b.y;done.add(i+":1");}
      if(!done.has(i+":2")&&w.x2===a.x&&w.y2===a.y){w.x2=b.x;w.y2=b.y;done.add(i+":2");}
    }
  }
  // les sondes posées sur une broche déplacée par la rotation suivent aussi
  const moved=new Set(els), shifted=new Set();
  for(const [a,b] of moves){
    for(const el of S.comps){
      if(!isProbe(el)||moved.has(el)||shifted.has(el))continue;
      const p=allPins(el)[0];
      if(p&&p.x===a.x&&p.y===a.y){el.x+=b.x-a.x;el.y+=b.y-a.y;shifted.add(el);}
    }
  }
  touchWires();refreshPanels();draw();
}
function rotateSel(){transformSel(el=>{el.rot=((((el.rot|0)+90)%360)+360)%360;});}
function mirrorSel(){transformSel(el=>{el.mir=!el.mir;});}
function dupSel(){
  const els=selEls(), wires=selWires();
  if(!els.length&&!wires.length)return;
  push();
  const copies=wires.map(w=>{
    const c={x1:w.x1+40,y1:w.y1+40,x2:w.x2+40,y2:w.y2+40};
    if(w.net)c.net=w.net;          // même nom = même net, la copie reste raccordée
    return c;
  });
  clearSel();
  for(const e of els){
    const n=JSON.parse(JSON.stringify(e));
    n.id=S.uid++;n.x+=40;n.y+=40;
    if(!defOf(n.type).noRef)n.ref=nextRef(defOf(n.type).p);
    S.comps.push(n);S.sel.add(n.id);
  }
  for(const w of copies){S.wires.push(w);S.selW.add(w);}
  if(copies.length)touchWires();
  refreshPanels();draw();
}
function delSel(){
  const wires=selWires();
  if(!S.sel.size&&!wires.length)return;
  push();
  if(S.sel.size)deleteComps([...S.sel]);
  if(wires.length){
    // suppression en place : la feuille garde la même référence de tableau
    for(let i=S.wires.length-1;i>=0;i--) if(S.selW.has(S.wires[i])) S.wires.splice(i,1);
    S.selW.clear();touchWires();
  }
  refreshPanels();draw();
}
function fit(){
  if(!S.comps.length&&!S.wires.length){S.scale=1;S.ox=cv.clientWidth/2;S.oy=cv.clientHeight/2;draw();return;}
  let x1=1e9,y1=1e9,x2=-1e9,y2=-1e9;
  for(const el of S.comps){const b=bbox(el);x1=Math.min(x1,b.x1);y1=Math.min(y1,b.y1);x2=Math.max(x2,b.x2);y2=Math.max(y2,b.y2);}
  for(const w of S.wires){x1=Math.min(x1,w.x1,w.x2);y1=Math.min(y1,w.y1,w.y2);x2=Math.max(x2,w.x1,w.x2);y2=Math.max(y2,w.y1,w.y2);}
  const pad=60, W=cv.clientWidth, H=cv.clientHeight;
  S.scale=Math.max(.25,Math.min(2.5,Math.min(W/(x2-x1+pad*2),H/(y2-y1+pad*2))));
  S.ox=W/2-(x1+x2)/2*S.scale;S.oy=H/2-(y1+y2)/2*S.scale;
  draw();
}
// une seule porte d'entrée pour la grille : bouton et touche G restent d'accord,
// et le bouton s'allume quand la grille est visible (et non l'inverse)
function setGrid(v){
  S.showGrid=!!v;
  document.getElementById("bGrid").classList.toggle("on",S.showGrid);
  draw();
}
function setMode(m){
  S.mode=m;S.wireStart=null;S.hoverPin=null;
  if(m!=="select"){S.place=null;setPalette(null);}
  for(const [id,md] of [["mSelect","select"],["mWire","wire"],["mErase","erase"]])
    document.getElementById(id).classList.toggle("on",S.mode===md);
  document.getElementById("fMode").textContent={select:"Sélection",wire:"Fil",erase:"Gomme"}[m];
  cv.style.cursor = m==="erase"?"not-allowed":"crosshair";
  document.getElementById("fHint").textContent = {
    select:"Glisser pour déplacer · une sonde coulisse le long de son net, plus loin le fil s'étire · Ctrl+glisser pour détacher.",
    wire:"Clic pour démarrer, clic pour poser un coude, clic sur une broche pour terminer · Clic droit ou Échap annule.",
    erase:"Clic sur un composant ou un fil pour le supprimer."
  }[m];
  draw();
}
