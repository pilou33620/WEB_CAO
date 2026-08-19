/* =============================================================================
   editeur-schematique — 14-clavier-boutons.js
   Raccourcis clavier et branchement des boutons
   ============================================================================= */
"use strict";
/* ==========================================================================
   Clavier
   ========================================================================== */
let arrowStamp=0, arrowSplit=0;
window.addEventListener("keydown",e=>{
  const t=e.target;
  const tag=(t&&t.tagName||"").toLowerCase();
  if(tag==="input"||tag==="textarea"||tag==="select"||(t&&t.isContentEditable))return;
  const k=e.key.toLowerCase();
  const mod=e.ctrlKey||e.metaKey;
  if(mod&&k==="z"){e.preventDefault();e.shiftKey?redo():undo();return;}
  if(mod&&k==="y"){e.preventDefault();redo();return;}
  if(mod&&k==="s"){e.preventDefault();saveJson();return;}
  if(mod&&k==="a"){e.preventDefault();S.comps.forEach(c=>S.sel.add(c.id));S.wires.forEach(w=>S.selW.add(w));refreshPanels();draw();return;}
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
  if(k==="delete"||k==="backspace"){e.preventDefault();delSel();return;}
  if(k.startsWith("arrow")){
    const d={arrowleft:[-G,0],arrowright:[G,0],arrowup:[0,-G],arrowdown:[0,G]}[k];
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
document.getElementById("bUndo").onclick=undo;
document.getElementById("bRedo").onclick=redo;
document.getElementById("bGrid").onclick=()=>setGrid(!S.showGrid);
document.getElementById("bFit").onclick=fit;
document.getElementById("bSave").onclick=saveJson;
document.getElementById("bPng").onclick=exportPng;
document.getElementById("bomAll").onchange=e=>{S.bomAll=e.target.checked;buildList();};
document.getElementById("netAll").onchange=e=>{S.netAll=e.target.checked;buildList();};
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
