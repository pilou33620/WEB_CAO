"use strict";
/* ==========================================================================
   Éditeur PCB — fichiers et démarrage
   Enregistrement, import, exports, câblage de l'interface, initialisation.
   ========================================================================== */
/* ==========================================================================
   Fichiers
   ========================================================================== */
function dl(blob,name){
  const a=document.createElement("a");
  a.href=URL.createObjectURL(blob);a.download=name;a.click();
  setTimeout(()=>URL.revokeObjectURL(a.href),2000);
}
function saveJson(){
  dl(new Blob([JSON.stringify(docObj(),null,1)],{type:"application/json"}),"carte.json");
  S.dirty=false;
  hint("Carte enregistrée dans carte.json.");
}
function openFile(f){
  const r=new FileReader();
  r.onload=()=>{
    const txt=String(r.result);
    if(/^\s*\{/.test(txt)){
      try{
        const d=JSON.parse(txt);
        if(d.format==="schemedit-2"){
          hint("Ce fichier est un schéma. Exportez sa netlist (.txt) puis importez-la ici.");
          alert("Ce fichier est un schéma (.json).\n\nDans l'éditeur schématique, cliquez sur « Netlist .txt », puis importez ce fichier ici.");
          return;
        }
        push();loadDoc(d);hint("Carte "+f.name+" chargée.");
      }catch(err){alert("Fichier illisible : "+err.message);}
    }else{
      importNetlist(txt,false);
    }
  };
  r.readAsText(f);
}
function importNetlist(txt,dropMissing){
  const res=applyNetlist(txt,dropMissing);
  if(res.err){alert(res.err);return;}
  zoneCache.clear();
  buildLayers();refreshPanels();
  if(!S.tracks.length)fit();else draw();
  hint("Netlist importée : "+res.added+" empreinte(s) créée(s), "+res.kept+" mise(s) à jour, "+
       res.nets+" net(s)"+(res.removed?", "+res.removed+" supprimée(s)":"")+
       ". Les nouvelles empreintes attendent à droite de la carte — « Placement auto » les fait entrer.");
}
function exportPng(){
  const save={scale:S.scale,ox:S.ox,oy:S.oy};
  const b=S.board, pad=6, res=12;
  const W=Math.round((b.w+pad*2)*res), H=Math.round((b.h+pad*2)*res);
  const o=document.createElement("canvas");o.width=W;o.height=H;
  const c=o.getContext("2d");
  /* le miroir de la vue « dessous » tourne autour du centre de la carte :
     l'intervalle occupé à l'écran ne change pas, le cadrage non plus */
  S.scale=res;S.ox=(pad-b.x)*res;S.oy=(pad-b.y)*res;
  paint(c,1,W,H,true);
  S.scale=save.scale;S.ox=save.ox;S.oy=save.oy;
  o.toBlob(bl=>{
    if(!bl){alert("Export impossible : image trop grande.");return;}
    dl(bl,"carte.png");
  });
  draw();
  hint("Vue exportée dans carte.png (couches visibles, orientation courante).");
}
function newDoc(){
  if(S.fps.length&&!confirm("Repartir d'une carte vide ? Le travail en cours sera perdu."))return;
  push();
  S.fps=[];S.tracks=[];S.vias=[];S.zones=[];S.drc=[];S.drcRun=false;S.hlNet=null;
  clearSel();zoneCache.clear();touch();
  refreshPanels();draw();
  hint("Carte vide. Importez une netlist pour commencer.");
}
/* ---------- boîte d'import ---------- */
function openImport(){
  const m=document.createElement("div");
  m.className="modal";
  m.innerHTML='<div class="box"><h3>Importer une netlist</h3>'+
    '<p>Collez le contenu du fichier <b>netlist.txt</b> exporté par l\'éditeur schématique, ou choisissez-le sur le disque. Les empreintes déjà posées gardent leur position ; seules les nouvelles sont ajoutées.</p>'+
    '<textarea id="nlTxt" placeholder="=== Composants ===&#10;    R1      10k        0603&#10;&#10;=== Feuille 1 — Principale ===&#10;NET &quot;+5V&quot;&#10;    U1.8&#10;    C1.1"></textarea>'+
    '<label style="display:flex;align-items:center;gap:7px;margin-top:9px;font-size:12px;color:var(--txt-dim)">'+
    '<input type="checkbox" id="nlDrop" style="accent-color:var(--blue)"> supprimer les empreintes absentes de la netlist</label>'+
    '<div class="row"><button class="tb" id="nlFile">Choisir un fichier…</button>'+
    '<button class="tb" id="nlCancel">Annuler</button>'+
    '<button class="tb on" id="nlOk">Importer</button></div></div>';
  document.body.appendChild(m);
  const close=()=>m.remove();
  m.onclick=e=>{if(e.target===m)close();};
  $("nlCancel").onclick=close;
  $("nlFile").onclick=()=>$("netIn").click();
  $("netIn").onchange=()=>{
    const f=$("netIn").files[0];
    if(!f)return;
    const r=new FileReader();
    r.onload=()=>{const t=$("nlTxt");if(t)t.value=String(r.result);};
    r.readAsText(f);
    $("netIn").value="";
  };
  $("nlOk").onclick=()=>{
    const txt=$("nlTxt").value;
    if(!txt.trim()){alert("Collez d'abord une netlist.");return;}
    const drop=$("nlDrop").checked;
    close();
    importNetlist(txt,drop);
  };
  $("nlTxt").focus();
}

/* ==========================================================================
   Câblage de l'interface
   ========================================================================== */
$("mSelect").onclick=()=>setMode("select");
$("mTrack").onclick=()=>setMode("track");
$("mVia").onclick=()=>setMode("via");
/* Le bouton passe en mode zone et déplie ses options :
   rôle de la couche active, net du plan, deux façons de poser du cuivre. */
$("mZone").onclick=e=>{e.stopPropagation();setMode("zone");zoneMenuToggle();};
$("mEdge").onclick=()=>setMode("edge");
$("mOrigin").onclick=()=>setMode("origin");
$("mErase").onclick=()=>setMode("cut");
$("bRot").onclick=rotateSel;
$("bFlip").onclick=flipSel;
$("bUnroute").onclick=unrouteSel;
$("bDel").onclick=deleteSel;
$("bUndo").onclick=undo;
$("bRedo").onclick=redo;
$("bCopy").onclick=copySelPcb;
$("bPaste").onclick=pasteClipPcb;
$("bGrid").onclick=()=>setGrid(!S.showGrid);
$("selGrid").onchange=e=>setGridStep(e.target.value);
buildGridMenu();
$("bAvoid").onclick=()=>{
  S.avoid=!S.avoid;
  $("bAvoid").classList.toggle("on",S.avoid);
  if(S.route)updateRoute(S.mouse.x,S.mouse.y);
  draw();
  hint(S.avoid?"Anti-collision actif : le tracé se tient à la distance d'isolation.":
       "Anti-collision coupé : plus rien ne retient le tracé.");
};
$("bRats").onclick=()=>{S.show.rats=!S.show.rats;$("bRats").classList.toggle("on",S.show.rats);buildLayers();draw();};
$("bView").onclick=()=>setFlip(!S.flip);
$("bContrast").onclick=()=>setContrast((S.contrast+1)%3);
$("bFit").onclick=fit;
$("bImport").onclick=openImport;
$("bDrc").onclick=()=>{
  const e=runDrc();
  S.listTab="drc";
  for(const [id,t] of [["tabNets","nets"],["tabComps","comps"],["tabDrc","drc"]])
    $(id).classList.toggle("on",t==="drc");
  buildList();draw();
  const hard=e.filter(x=>!x.info).length;
  hint(hard?hard+" erreur(s) de règles détectée(s).":"Contrôle DRC : aucune erreur de règles.");
};
$("bSave").onclick=saveJson;
$("bOpen").onclick=()=>$("fileIn").click();
$("fileIn").onchange=()=>{const f=$("fileIn").files[0];if(f)openFile(f);$("fileIn").value="";};
$("bPng").onclick=exportPng;
$("bFab").onclick=exportFab;
$("bNew").onclick=newDoc;
$("cuCount").onchange=()=>{
  const n=+$("cuCount").value;
  push();setCuCount(n);zoneCache.clear();
  hint("Empilage : "+n+" couche(s) de cuivre.");
};
for(const [id,t] of [["tabNets","nets"],["tabComps","comps"],["tabDrc","drc"]])
  $(id).onclick=()=>{
    S.listTab=t;
    for(const [i2,t2] of [["tabNets","nets"],["tabComps","comps"],["tabDrc","drc"]])
      $(i2).classList.toggle("on",t2===t);
    buildList();
  };
$("onlyUnrouted").onchange=()=>{S.onlyUnrouted=$("onlyUnrouted").checked;buildList();};

$("ciAbs").onclick=()=>coordMode("abs");
$("ciRel").onclick=()=>coordMode("rel");
$("ciPol").onclick=()=>coordMode("pol");
$("ciOk").onclick=coordApply;
for(const id of ["ciA","ciB"])
  $(id).addEventListener("keydown",e=>{
    if(e.key==="Enter"){e.preventDefault();coordApply();}
    else if(e.key==="Escape"){e.preventDefault();coordClose();draw();}
    else if(e.key==="Tab"&&id==="ciB"&&!e.shiftKey){e.preventDefault();$("ciA").focus();$("ciA").select();}
  });

/* glisser-déposer d'un fichier sur la carte */
["dragover","drop"].forEach(t=>
  document.addEventListener(t,e=>{
    e.preventDefault();
    if(t==="drop"&&e.dataTransfer.files[0])openFile(e.dataTransfer.files[0]);
  }));
document.addEventListener("pointerdown",e=>{
  const m=$("zoneMenu");
  if(m&&m.classList.contains("on")&&!m.contains(e.target)&&!$("mZone").contains(e.target))
    zoneMenuClose();
});
document.addEventListener("keydown",e=>{
  if(e.key!=="Escape")return;
  const m=$("zoneMenu");
  if(m&&m.classList.contains("on")){zoneMenuClose();e.stopPropagation();}
},true);
window.addEventListener("resize",()=>{zoneMenuClose();resize();});
window.addEventListener("beforeunload",e=>{
  if(S.dirty){e.preventDefault();e.returnValue="";}
});

/* ==========================================================================
   Démarrage
   ========================================================================== */
function init(){
  setCuCount(2,true);
  $("cuCount").value="2";
  buildLayers();buildTabs();buildRules();
  setMode("select");setGrid(true);setContrast(1);setFlip(false);
  $("bRats").classList.add("on");
  $("bAvoid").classList.toggle("on",S.avoid);
  refreshPanels();
  resize();fit();
}
init();
