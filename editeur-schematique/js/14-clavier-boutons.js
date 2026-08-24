/* =============================================================================
   editeur-schematique — 14-clavier-boutons.js
   Raccourcis clavier et branchement des boutons
   ============================================================================= */
"use strict";
/* ==========================================================================
   Clavier
   ========================================================================== */
let arrowStamp=0, arrowSplit=0;
/* Un champ de saisie garde ses lettres pour lui : sans ce garde-fou, taper le
   nom d'un net poserait un fil (W), repasserait en sélection (V)… On regarde la
   cible de l'événement ET le champ qui a réellement le focus, les deux pouvant
   diverger selon la façon dont la frappe arrive. */
function isField(n){
  const tag=(n&&n.tagName||"").toLowerCase();
  return tag==="input"||tag==="textarea"||tag==="select"||!!(n&&n.isContentEditable);
}
window.addEventListener("keydown",e=>{
  if(isField(e.target)||isField(document.activeElement))return;
  const k=e.key.toLowerCase();
  const mod=e.ctrlKey||e.metaKey;
  /* Fenêtre de brochage ouverte : elle prend Échap pour se fermer, et rien
     d'autre ne doit agir sur la feuille pendant ce temps. */
  if(typeof peIsOpen==="function"&&peIsOpen()){
    if(k==="escape"){e.preventDefault();peClose();return;}
    /* Annuler et rétablir traversent : c'est dans la fenêtre qu'on vient de se
       tromper. restore() recharge la feuille, donc le composant en cours de
       brochage : peReattach() le reprend par son identifiant. */
    if(mod&&(k==="z"||k==="y")){
      e.preventDefault();
      (k==="y"||e.shiftKey)?redo():undo();
      peReattach();
      return;
    }
    return;
  }
  if(mod&&k==="z"){e.preventDefault();e.shiftKey?redo():undo();return;}
  if(mod&&k==="y"){e.preventDefault();redo();return;}
  if(mod&&k==="s"){e.preventDefault();saveJson();return;}
  if(mod&&k==="a"){e.preventDefault();S.comps.forEach(c=>S.sel.add(c.id));S.wires.forEach(w=>S.selW.add(w));refreshPanels();draw();return;}
  // Ctrl+C sur du texte sélectionné appartient au navigateur : on ne lui prend
  // le raccourci que lorsqu'il n'y a rien à copier à l'écran
  if(mod&&k==="c"){
    const sel=window.getSelection&&window.getSelection();
    if(sel&&!sel.isCollapsed)return;
    e.preventDefault();copySel();return;
  }
  if(mod&&k==="x"){e.preventDefault();cutSel();return;}
  if(mod&&k==="v"){e.preventDefault();pasteClip();return;}
  // toute autre combinaison avec Ctrl/Cmd appartient au navigateur :
  // sans ce garde-fou, Ctrl+R faisait pivoter la sélection puis rechargeait la page
  if(mod||e.altKey)return;
  if(e.key==="PageDown"){e.preventDefault();gotoPage(S.page+1);return;}
  if(e.key==="PageUp"){e.preventDefault();gotoPage(S.page-1);return;}
  if(k==="escape"){setMode("select");S.wireStart=null;S.place=null;clearSel();setPalette(null);refreshPanels();draw();return;}
  if(k==="v"){setMode("select");return;}
  if(k==="w"){setMode("wire");return;}
  if(k==="x"){setMode("erase");return;}
  if(k==="r"){if(S.place){S.placeRot=((S.placeRot||0)+90)%360;draw();}else rotateSel();return;}
  if(k==="m"){mirrorSel();return;}
  if(k==="d"){dupSel();return;}
  if(k==="g"){setGrid(!S.showGrid);return;}
  if(k==="n"){cycleNetLabels();return;}
  if(k==="u"){delWiresSel();return;}
  if(k==="delete"||k==="backspace"){e.preventDefault();delSel();return;}
  if(k.startsWith("arrow")){
    // le pas d'une flèche est celui de la grille : ce qu'on voit est ce qu'on
    // déplace, y compris en demi-pas
    const g=S.grid||G;
    const d={arrowleft:[-g,0],arrowright:[g,0],arrowup:[0,-g],arrowdown:[0,g]}[k];
    if(!d||!selCount())return;
    e.preventDefault();
    // une rafale de flèches ne compte que pour une entrée d'historique
    const now=Date.now();
    if(now-arrowStamp>700)push();
    arrowStamp=now;
    moveSelBy(d[0],d[1]);
    // la découpe attend la fin de la rafale : sinon on sèmerait un point de
    // coupe à chaque case traversée
    clearTimeout(arrowSplit);
    arrowSplit=setTimeout(()=>{if(resolveSplits()){refreshPanels();draw();}},450);
    return;
  }
});

/* ==========================================================================
   Boutons
   ========================================================================== */
document.getElementById("mSelect").onclick=()=>setMode("select");
document.getElementById("mWire").onclick=()=>setMode("wire");
document.getElementById("mErase").onclick=()=>setMode("erase");
document.getElementById("bRot").onclick=rotateSel;
document.getElementById("bMir").onclick=mirrorSel;
document.getElementById("bDup").onclick=dupSel;
document.getElementById("bDel").onclick=delSel;
document.getElementById("bDelW").onclick=delWiresSel;
document.getElementById("bUndo").onclick=undo;
document.getElementById("bRedo").onclick=redo;
document.getElementById("bCopy").onclick=copySel;
document.getElementById("bPaste").onclick=pasteClip;
document.getElementById("bGrid").onclick=()=>setGrid(!S.showGrid);
document.getElementById("selGrid").onchange=e=>setGridStep(+e.target.value);
document.getElementById("bFit").onclick=fit;
document.getElementById("bSave").onclick=saveJson;
document.getElementById("bPng").onclick=exportPng;
document.getElementById("bomAll").onchange=e=>{
  S.bomAll=e.target.checked;
  if(typeof profilNoter==="function")profilNoter();
  buildList();
};
document.getElementById("netAll").onchange=e=>{
  S.netAll=e.target.checked;
  if(typeof profilNoter==="function")profilNoter();
  buildList();
};
document.getElementById("tabBom").onclick=()=>setListTab("bom");
document.getElementById("tabNets").onclick=()=>setListTab("nets");
document.getElementById("bNets").onclick=cycleNetLabels;
document.getElementById("bNetlist").onclick=exportNetlist;
document.getElementById("bCsv").onclick=exportBomCsv;
document.getElementById("bNew").onclick=()=>{
  if(!confirm("Effacer le contenu de la feuille « "+S.pages[S.page].name+" » ?"))return;
  push();
  S.comps=[];S.wires=[];clearSel();S.uid=1;
  storeCurrent();touchWires();refreshPanels();draw();
};
document.getElementById("bOpen").onclick=()=>document.getElementById("fileIn").click();
