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
/* Les extrémités de fils accrochées à une broche qui bouge suivent le
   mouvement : sans cela, une rotation — ou un changement de brochage —
   détacherait visuellement tout le câblage. `moves` liste les couples
   (position avant, position après). */
function followWires(moves,movedEls){
  const done=new Set();
  for(const [a,b] of moves){
    for(let i=0;i<S.wires.length;i++){
      const w=S.wires[i];
      if(!done.has(i+":1")&&w.x1===a.x&&w.y1===a.y){w.x1=b.x;w.y1=b.y;done.add(i+":1");}
      if(!done.has(i+":2")&&w.x2===a.x&&w.y2===a.y){w.x2=b.x;w.y2=b.y;done.add(i+":2");}
    }
  }
  // les sondes posées sur une broche déplacée suivent aussi
  const shifted=new Set();
  for(const [a,b] of moves){
    for(const el of S.comps){
      if(!isProbe(el)||movedEls.has(el)||shifted.has(el))continue;
      const p=allPins(el)[0];
      if(p&&p.x===a.x&&p.y===a.y){el.x+=b.x-a.x;el.y+=b.y-a.y;shifted.add(el);}
    }
  }
}
// couples avant/après pour les broches d'un composant que `fn` vient de modifier
function pinMoves(before,after){
  const moves=[];
  before.forEach((p,i)=>{
    const q=after[i];
    if(q&&(p.x!==q.x||p.y!==q.y))moves.push([p,q]);
  });
  return moves;
}
/* Transforme la sélection en emmenant les extrémités de fils accrochées aux
   broches. */
function transformSel(fn){
  const els=selEls();if(!els.length)return;
  push();
  const contacts=pinContacts(els);
  const moves=[];
  for(const el of els){
    const before=allPins(el);
    fn(el);
    moves.push(...pinMoves(before,allPins(el)));
  }
  followWires(moves,new Set(els));
  reconnectContacts(contacts);
  touchWires();refreshPanels();draw();
}
/* Modification du symbole lui-même — nombre de broches, représentation, taille
   du corps, position d'une patte : le câblage suit les broches déplacées, comme
   pour une rotation. L'historique est laissé à l'appelant : l'éditeur de
   brochage n'empile qu'une fois, à l'ouverture. */
function reshapeComp(el,fn){
  const before=allPins(el);
  fn(el);
  followWires(pinMoves(before,allPins(el)),new Set([el]));
  touchWires();
}
/* ==========================================================================
   Contacts broche à broche
   Deux composants mis bout à bout, broche contre broche, sont reliés sans
   qu'aucun fil ne soit tracé : l'extraction des nets les met dans le même
   groupe, et un point de jonction le montre. Reste le cas de la séparation :
   si l'un des deux s'en va, la liaison doit être conservée. On relève donc les
   contacts avant le mouvement, et on tire un fil en équerre entre les deux
   broches après coup, comme si l'utilisateur l'avait posé lui-même.
   ========================================================================== */
function pinContacts(els){
  if(!els||!els.length)return [];
  const moving=new Set(els), fixed=new Set();
  for(const el of S.comps){
    if(moving.has(el)||isProbe(el))continue;
    for(const q of allPins(el))fixed.add(key(q.x,q.y));
  }
  const out=[];
  for(const el of els){
    if(isProbe(el))continue;
    allPins(el).forEach((p,i)=>{
      if(fixed.has(key(p.x,p.y)))out.push({el,i,x:p.x,y:p.y});
    });
  }
  return out;
}
function wireBetween(a,b){
  return S.wires.some(w=>(w.x1===a.x&&w.y1===a.y&&w.x2===b.x&&w.y2===b.y)||
                         (w.x2===a.x&&w.y2===a.y&&w.x1===b.x&&w.y1===b.y));
}
function reconnectContacts(list){
  if(!list||!list.length)return false;
  let added=false;
  for(const c of list){
    const p=allPins(c.el)[c.i];
    if(!p||(p.x===c.x&&p.y===c.y))continue;      // le contact tient toujours
    if(wireBetween(c,p))continue;                // déjà relié par un fil
    const segs=routeL({x:c.x,y:c.y},{x:p.x,y:p.y});
    if(segs.length){S.wires.push(...segs);added=true;}
  }
  if(added)touchWires();
  return added;
}
/* Libellés remis à leur place d'origine — la sortie de secours quand un texte
   a été traîné trop loin de son symbole. */
function resetTexts(els){
  let n=0;
  for(const el of els){
    if(el.refOff){delete el.refOff;n++;}
    if(el.valOff){delete el.valOff;n++;}
  }
  return n;
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
/* Supprimer les seuls fils de la sélection.
   Attraper au lasso un morceau de schéma prend tout : composants et câblage.
   Quand on veut recâbler autrement, il fallait jusqu'ici désigner les fils un à
   un pour ne pas emporter les symboles. U vide le câblage de la sélection et
   laisse les composants en place — et sélectionnés, prêts à être déplacés. */
function delWiresSel(){
  const wires=selWires();
  if(!wires.length){
    clipHint(S.sel.size
      ? "Aucun fil dans la sélection : U ne supprime que les fils."
      : "Sélectionnez des fils (Maj+clic pour en ajouter), puis U pour n'effacer qu'eux.");
    return;
  }
  push();
  // suppression en place : la feuille garde la même référence de tableau
  for(let i=S.wires.length-1;i>=0;i--) if(S.selW.has(S.wires[i])) S.wires.splice(i,1);
  S.selW.clear();touchWires();
  clipHint(wires.length+(wires.length>1?" fils supprimés":" fil supprimé")+
    (S.sel.size?" · "+S.sel.size+" composant(s) laissé(s) en place.":"."));
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
  if(typeof profilNoter==="function")profilNoter();
  draw();
}
/* Menu des pas de grille : les intitulés sortent d'un seul calcul, ils ne
   peuvent pas mentir sur ce que vaut une case. */
function buildGridMenu(){
  const sel=document.getElementById("selGrid");
  if(!sel)return;
  sel.innerHTML=GRID_STEPS.map(w=>
    '<option value="'+w+'"'+(w===S.grid?" selected":"")+'>Grille '+
    fmtMm(gridMm(w))+' mm</option>').join("");
}
/* Pas d'accrochage : une seule porte d'entrée, le menu de la barre d'outils et
   le pied de page restent d'accord. */
function setGridStep(v){
  const w=Math.max(1,+v||G);
  if(w===S.grid)return;
  S.grid=w;
  updateGridInfo();
  if(typeof profilNoter==="function")profilNoter();
  draw();
}

/* ==========================================================================
   Presse-papier
   Copie interne, doublée dans le stockage local : on peut coller après avoir
   changé de feuille, rouvert l'éditeur ou basculé sur un autre onglet. Le bloc
   est rangé relativement à son coin haut-gauche, ce qui permet de le coller
   sous le pointeur. Ce qui en ressort repasse par normComp()/normWire() : un
   presse-papier vieux d'une version, ou trafiqué, n'est pas cru sur parole.
   ========================================================================== */
const CLIP_KEY="schemedit.clipboard";
let CLIP=null;
function clipContent(){
  const els=selEls(), wires=selWires();
  if(!els.length&&!wires.length)return null;
  let x=1e9,y=1e9;
  for(const el of els){x=Math.min(x,el.x);y=Math.min(y,el.y);}
  for(const w of wires){x=Math.min(x,w.x1,w.x2);y=Math.min(y,w.y1,w.y2);}
  return {
    comps:els.map(el=>{
      const c=JSON.parse(JSON.stringify(el));
      c.x-=x;c.y-=y;delete c.id;
      return c;
    }),
    wires:wires.map(w=>{
      const c={x1:w.x1-x,y1:w.y1-y,x2:w.x2-x,y2:w.y2-y};
      if(w.net)c.net=w.net;
      return c;
    })
  };
}
function setClip(c){
  CLIP=c;
  try{localStorage.setItem(CLIP_KEY,JSON.stringify(c));}catch(_){/* quota, mode privé */}
}
function getClip(){
  if(CLIP)return CLIP;
  try{
    const raw=localStorage.getItem(CLIP_KEY);
    if(raw)CLIP=JSON.parse(raw);
  }catch(_){CLIP=null;}
  return CLIP;
}
function clipHint(t){
  const b=document.getElementById("fHint");
  if(b)b.textContent=t;
}
function copySel(){
  const c=clipContent();
  if(!c){clipHint("Rien à copier : sélectionnez d'abord des composants ou des fils.");return false;}
  setClip(c);
  clipHint(c.comps.length+" composant(s) et "+c.wires.length+
           " fil(s) copiés — Ctrl+V colle sous le pointeur.");
  return true;
}
function cutSel(){if(copySel())delSel();}
/* Collage : le coin haut-gauche du bloc atterrit sur la case visée par le
   pointeur. Les composants reçoivent un repère libre — coller deux fois ne
   crée pas deux R1 — et les fils gardent leur nom de net, donc leur
   connectivité logique. */
function pasteClip(){
  const c=getClip();
  if(!c||!Array.isArray(c.comps)||!Array.isArray(c.wires))
    {clipHint("Presse-papier vide : copiez d'abord une sélection (Ctrl+C).");return;}
  if(!c.comps.length&&!c.wires.length){clipHint("Presse-papier vide.");return;}
  const bx=snap(S.mouse.x), by=snap(S.mouse.y);
  push();
  clearSel();
  let dropped=0;
  c.comps.forEach((src,i)=>{
    const el=normComp(src,i);
    if(!el){dropped++;return;}
    el.id=S.uid++;
    el.x+=bx;el.y+=by;
    const def=defOf(el.type);
    if(!def.noRef)el.ref=nextRef(def.p);
    S.comps.push(el);S.sel.add(el.id);
  });
  for(const src of c.wires){
    const w=normWire(src);
    if(!w){dropped++;continue;}
    w.x1+=bx;w.y1+=by;w.x2+=bx;w.y2+=by;
    S.wires.push(w);S.selW.add(w);
  }
  touchWires();resolveSplits();
  refreshPanels();draw();
  clipHint(S.sel.size+" composant(s) et "+selWires().length+" fil(s) collés."+
           (dropped?" "+dropped+" élément(s) ignoré(s).":""));
}
function setMode(m){
  S.mode=m;S.wireStart=null;S.hoverPin=null;
  if(m!=="select"){S.place=null;setPalette(null);}
  /* La cote appartient au mode : la garder affichée en revenant à la sélection
     laisserait une annotation qu'aucun geste ne reprend. */
  if(m!=="mesure"&&typeof rpMesRaz==="function")rpMesRaz();
  for(const [id,md] of [["mSelect","select"],["mWire","wire"],["mErase","erase"],
                        ["mMesure","mesure"]]){
    const b=document.getElementById(id);
    if(b)b.classList.toggle("on",S.mode===md);
  }
  document.getElementById("fMode").textContent=
    {select:"Sélection",wire:"Fil",erase:"Gomme",mesure:"Mesure"}[m];
  cv.style.cursor = m==="erase"?"not-allowed":"crosshair";
  document.getElementById("fHint").textContent = {
    select:"Ctrl+clic (ou Maj+clic) ajoute à la sélection · glisser pour déplacer · "+
           "Alt+glisser détache le câblage · Alt sur le vide déplace la vue.",
    wire:"Clic pour démarrer, clic pour poser un coude, clic sur une broche pour terminer · Clic droit ou Échap annule.",
    erase:"Clic sur un composant ou un fil pour le supprimer.",
    mesure:"Cliquez le premier point, puis le second : la cote se fige · les broches "+
           "attirent le point · un nouveau clic repart d'ailleurs · Échap efface. "+
           "Une case vaut 1 mm par convention de dessin, pas par cote de fabrication."
  }[m];
  draw();
}
