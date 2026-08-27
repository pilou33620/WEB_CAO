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
/* Les noms de fichiers viennent de pcbFile() (04-fabrication.js) : une seule
   source pour l'archive de fabrication comme pour les exports d'ici.
   Avec un dossier de projet rattaché, enregistrer écrit dans ce dossier ; sans
   dossier, on télécharge comme avant. Le repli n'est pas un luxe : en
   double-clic sur le monofichier, aucun accès disque n'est possible. */
function saveJson(){
  const doc=docObj();
  if(typeof projdLie==="function" && projdLie()){
    projdDocEcrire("pcb",doc).then(function(nom){
      S.dirty=false;
      if(typeof profNoterDocument==="function")profNoterDocument("pcb",nom);
      hint("Carte enregistrée dans le dossier du projet ("+nom+").");
    }).catch(function(e){
      /* On ne fait pas semblant : si l'écriture échoue, le travail n'est pas
         sauvé, et on le dit avant de proposer le téléchargement. */
      hint("Écriture refusée : "+e.message+" — enregistrement en téléchargement.");
      saveJsonTelecharger(doc);
    });
    return;
  }
  saveJsonTelecharger(doc);
}
function saveJsonTelecharger(doc){
  const nom=pcbFile(".json","carte.json");
  dl(new Blob([JSON.stringify(doc||docObj(),null,1)],{type:"application/json"}),nom);
  S.dirty=false;
  if(typeof profNoterDocument==="function")profNoterDocument("pcb",nom);
  hint("Carte enregistrée dans "+nom+".");
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
        push();loadDoc(d);
        if(typeof profNoterDocument==="function")profNoterDocument("pcb",f.name);
        hint("Carte "+f.name+" chargée.");
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
       (res.repkg?", "+res.repkg+" empreinte(s) refaite(s) sur un nouveau boîtier":"")+
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
    dl(bl,pcbFile(".png","carte.png"));
  });
  draw();
  hint("Vue exportée dans "+pcbFile(".png","carte.png")+
       " (couches visibles, orientation courante).");
}
function newDoc(){
  if(S.fps.length&&!confirm("Repartir d'une carte vide ? Le travail en cours sera perdu."))return;
  push();
  S.fps=[];S.tracks=[];S.vias=[];S.zones=[];S.drc=[];S.drcRun=false;S.hlNet=null;
  S.dpPairs=[];S.dp=null;   // les règles restent : elles décrivent un métier, pas une carte
  clearSel();zoneCache.clear();touch();
  refreshPanels();draw();
  hint("Carte vide. Importez une netlist pour commencer.");
}
/* ---------- boîte d'import ---------- */
function openImport(){
  const m=document.createElement("div");
  m.className="modal";
  m.innerHTML='<div class="box"><h3>Importer une netlist</h3>'+
    '<p>Collez le contenu du fichier <b>netlist.txt</b> exporté par l\'éditeur schématique, ou choisissez-le sur le disque. Les empreintes déjà posées gardent leur position ; seules les nouvelles sont ajoutées. Le boîtier indiqué par le schéma (0603, SOIC-8, TQFP-64…) fixe le style et les cotes de l\'empreinte : il n\'y a qu\'à replacer et router.</p>'+
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
$("mDiff").onclick=()=>setMode("dpair");
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
  if(typeof profilNoter==="function")profilNoter();
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
  if(typeof reIsOpen==="function"&&reIsOpen())reSync();
  hint(hard?hard+" erreur(s) de règles détectée(s).":"Contrôle DRC : aucune erreur de règles.");
};
/* La fenêtre des règles. Elle a remplacé les panneaux « Règles de tracé » et
   « Paires différentielles » du dock : c'est désormais le seul endroit où une
   règle de conception s'écrit, et ce bouton est sa porte. */
$("bRules").onclick=()=>reOpen();
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
    if(typeof profilNoter==="function")profilNoter();
    buildList();
  };
$("onlyUnrouted").onchange=()=>{
  S.onlyUnrouted=$("onlyUnrouted").checked;
  if(typeof profilNoter==="function")profilNoter();
  buildList();
};

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
  /* Changer d'outil met la carte en session : il n'y a rien à perdre, la
     question ne se pose plus. Elle reste posée pour une vraie fermeture. */
  if(sessQuitte())return;
  if(S.dirty){e.preventDefault();e.returnValue="";}
});

/* ==========================================================================
   Session d'onglet : le travail suit l'utilisateur d'un outil à l'autre
   Aller vérifier une valeur sur le schéma, ou chercher une référence, ne doit
   plus coûter le routage en cours. Le document, la vue et l'état « modifié »
   partent en session (commun/session.js) et reviennent tels quels ; l'état
   « modifié » compte autant que le reste, sans lui la garde de sortie
   laisserait fermer l'onglet sans un mot sur une carte jamais enregistrée.
   ========================================================================== */
/* Vrai quand la session d'onglet a rétabli la vue : 16-profil.js ne la
   contredit pas avec la vue enregistrée dans le profil, plus ancienne. */
/* Cross-probing vers le schéma : ce que « voir sur le schéma » doit y chercher.
   Une seule empreinte sélectionnée d'abord -- c'est le cas net, « ce R1
   précisément » --, et à défaut le net mis en évidence (S.hlNet), qui lui
   n'exige pas de sélection : cliquer une piste ou une ligne du panneau Nets
   suffit. Rien de sélectionné -> rien à sonder, et le clic sur « Éditeur
   schématique » reste la navigation simple d'avant. */
function pcbSonde(cible){
  if(cible!=="schema")return null;
  if(S.sel.fps.size===1){
    const fp=fpById([...S.sel.fps][0]);
    if(fp&&fp.ref)return {quoi:"ref",valeur:fp.ref};
  }
  if(S.hlNet)return {quoi:"net",valeur:S.hlNet};
  return null;
}
let PCB_REPRISE=false;
function sessionPcb(){
  const repris=sessBrancher("pcb",()=>({
    doc:docObj(),
    sale:S.dirty,
    vue:{scale:S.scale,ox:S.ox,oy:S.oy,flip:S.flip}
  }),pcbSonde);
  if(!repris)return false;
  try{
    loadDoc(repris.etat.doc,true);       // normDoc() se charge de tout vérifier
  }catch(_){
    sessEffacer("pcb");
    hint("Reprise impossible : la carte mise de côté était illisible.");
    return false;
  }
  const v=repris.etat.vue||{};
  if(Number.isFinite(+v.scale)&&+v.scale>0){
    S.scale=+v.scale;S.ox=+v.ox||0;S.oy=+v.oy||0;
  }
  setFlip(!!v.flip);
  S.dirty=!!repris.etat.sale;
  draw();
  hint("Carte reprise dans l'état où vous l'aviez laissée en changeant d'outil"+
       (repris.etat.sale?" — pensez à l'enregistrer avant de fermer l'onglet.":"."));
  return true;
}

/* ==========================================================================
   Démarrage
   ========================================================================== */
function init(){
  setCuCount(2,true);
  $("cuCount").value="2";
  /* Pas de `reSync()` ici : la fenêtre des règles vit dans un fichier chargé
     APRÈS celui-ci, et son état (`RE`) n'existe pas encore quand `init()`
     s'exécute en pages séparées. Elle est fermée au démarrage, il n'y a donc
     rien à rafraîchir — `reOpen()` la remplira le jour où on l'ouvre. */
  buildLayers();buildTabs();
  setMode("select");setGrid(true);setContrast(1);setFlip(false);
  $("bRats").classList.add("on");
  $("bAvoid").classList.toggle("on",S.avoid);
  refreshPanels();
  resize();fit();
  PCB_REPRISE=sessionPcb();   // en dernier : reprend la carte laissée dans l'onglet
  pcbChargerProjet();
}

/* Charge la carte depuis le dossier du projet, quand il y en a un.
   Trois précautions, et chacune répare un dégât possible :
     - la session d'onglet passe devant : elle porte le travail en cours, plus
       récent que le fichier ;
     - on ne remplace jamais un travail non enregistré ;
     - une seule fois, sinon chaque signal de changement de projet rechargerait
       la carte sous les doigts.
   Le rattachement du dossier est asynchrone (projet-disque.js le reprend au
   chargement) : d'où l'abonnement, en plus de l'appel depuis init(). */
let PCB_PROJET_LU=false;
function pcbChargerProjet(){
  if(PCB_PROJET_LU||PCB_REPRISE||S.dirty)return;
  if(typeof projdLie!=="function")return;
  /* Dossier retrouvé mais autorisation perdue : une demande sans geste de
     l'utilisateur échoue, et il n'y a pas de geste à offrir ici. On le dit. */
  if(!projdLie()){
    const a=(typeof projdAReconnecter==="function")?projdAReconnecter():"";
    if(a)hint("Dossier « "+a+" » à rouvrir : passez par l'accueil, la carte "
      +"en cours reste dans l'onglet.");
    return;
  }
  PCB_PROJET_LU=true;
  projdDocLire("pcb").then(function(d){
    if(!d)return;              // dossier sans carte : il n'y a rien à reprendre
    if(S.dirty)return;         // travail commencé pendant la lecture : on n'écrase pas
    loadDoc(d);
    draw();
    hint("Carte chargée depuis le dossier du projet.");
    /* La cible du cross-probing n'a pu être reprise au démarrage (18-reperage.js,
       juste après cette page) que si la session d'onglet avait déjà une carte :
       une carte lue APRÈS coup, comme ici, doit retenter une fois chargée. */
    if(typeof sessCibleAuChargement==="function")
      sessCibleAuChargement(pcbSonderCible);
  }).catch(function(e){
    PCB_PROJET_LU=false;       // un échec ne doit pas condamner les essais suivants
    hint("Carte du projet illisible : "+e.message);
  });
}
try{ projSurChangement(pcbChargerProjet); }catch(_){}
init();
