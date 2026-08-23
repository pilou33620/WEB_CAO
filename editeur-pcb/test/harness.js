/* =============================================================================
   editeur-pcb/test/harness.js
   Banc d'essai : le bundle dist/pcb.js est exécuté sur le DOM minimal partagé
   (commun/test/dom-stub.js), sans navigateur.

       python3 outils/build-monofichier.py && node test/harness.js

   L'installation de « canvas » (npm i canvas) est facultative : sans elle, les
   essais qui rasterisent vraiment le cuivre sont ignorés, les autres tournent.
   ============================================================================= */
"use strict";
const fs=require("fs");
const path=require("path");
const dom=require(path.join(__dirname,"..","..","commun","test","dom-stub.js")).install({
  panels:{stack:"Empilage",rules:"Règles de tracé",
          props:"Propriétés",list:"Nets & composants",
          stackup:"Empilage physique",dpair:"Paires différentielles"},
  canvasId:"board"
});
const realCanvas=dom.realCanvas;
const ctxStub=dom.ctxStub;
const listeners=dom.listeners;
function noop(){}

const code=fs.readFileSync(path.join(__dirname,"..","dist","pcb.js"),"utf8");
const EXPOSE=["S","conn","draw","init","importNetlist","setCuCount","setMode","startRoute",
  "updateRoute","stepRoute","commitRoute","routeToLayer","runDrc","buildTabs",
  "buildLayers","buildRules","refreshPanels","buildList","buildProps","clearSel","rotateSel",
  "flipSel","push","undo","redo","touch","padsWorld","cuId","serialize","loadDoc","exportPng",
  "setFlip","setContrast","autoPlace","conn","netTable","fit","zoneClick","zoneMove",
  "closeZone","fullBoardZone","zoneMask","labelMask","maskAt","classOf","setNetClass","defaultWidth",
  "clrPair","applyClasses","jointAt","splitTrack","netTracks","selectNetRouting",
  "deleteNetRouting","autoClass","mkFp","w2s","buildRules","runDrc","padsOf",
  "buildFabFiles","gerberCopper","gerberMask","gerberPaste","gerberSilk","gerberEdge",
  "drillFile","maskOpenings","pasteOpenings","textStrokes","crc32","zipBlob","exportFab",
  "edgeClick","edgeMove","closeEdge","boardPoly","setBoardSize","setBoardRect","inBoard",
  "boardChanged","polyEdgeDist","segDist","orient","signedArea",
  "coordOpen","coordClose","coordApply","coordMode","coordPoint","coordAnchor",
  "placeOrigin","ux","uy","wxu","wyu","snapX","snapY","gOrigin","routeToPoint","hint",
  "pushClear","magnet","projOnSeg","mitreSel","mitreAt","collinearRun","runFrom","segClearBad","setActive","segSegDist","segCross","routeBad","focusNet","cancelRoute","updateRoute","classOf","syncAutoZones","detachAuto","zoneCanvas","inPoly","hitTest","px","dist","boardZonePts",
  /* session d'onglet commune (commun/session.js) */
  "sessBrancher","sessEnregistrer","sessLire","sessEcrire","sessEffacer",
  "sessPoids","sessTient","sessUrl","sessAller","sessQuitte","sessAutonome",
  "sessBarre","sessionPcb","SESS_CLE","SESS_MAX",
  /* espace de travail commun (commun/workspace.js) */
  "wsDefault","wsApply","wsMove","wsPlaceOf","wsLabel","wsToggleFloat",
  "wsToggleCollapse","wsClose","wsShow","wsMenuBuild","wsLoad","wsSave","wsEl","WS_KEY",
  "esc","fmt","$",
  /* empilage physique et rôles de couche */
  "stackDefaults","stackResize","stackRows","rowT","stackTotal","stackLam",
  "stackCuT","stackDiT","stackSpan","stackFit","stackSym","stackMirror",
  "worstAspect","applyPreset","presetsFor","diCount","cuT","diAt","maskFaces",
  "stackAsym","asymLabel","viaBuild","viaCensus","aspectOf","viaTented",
  "VIA_FINISH","roleCheck","ASPECT_WARN","ASPECT_MAX",
  "umLabel","ozLabel","buildStackup","stackReport",
  "normStack","stkPick","CU_ROLES","CU_ROLE_SHORT","rolePlane",
  "layerRole","roleLabel","setLayerRole","coherentRole","roleFromPlane",
  "roleNet","STACK_PRESETS","FINISHES","MASK_COLORS","DI_KIND","OZ","r4",
  /* sélection multiple et presse-papier */
  "selectHit","toggleHit","altTarget","selCount","deleteSel","unrouteSel","copySelPcb","cutSelPcb",
  "pasteClipPcb","pcbClipContent","pcbSetClip","pcbGetClip","freeFpRef","GRID_STEPS",
  "setGridStep","gridShownStep","gridLabel","fpById",
  /* import défensif (normDoc) et aller-retour de document */
  "docObj","normDoc","setNetClass",
  /* paires différentielles : modèle, règles, tracé couplé, contrôle */
  "DP_SUF","DP_FALLBACK","DP_KEYS","DP_PROFILES","DP_MITER","DP_STEP",
  "dpSplit","dpMateName","dpMatch","dpDetect","dpById","dpByName","dpOfNet",
  "dpMateNet","dpFreeName","dpRuleFor","dpValues","dpMinGap","dpGeom","dpUid",
  "dpProfile","dpIsPlane","dpDiBetween","dpStripGeom","dpZ0","dpZdiff",
  "dpSolveW","dpSolveGap","normDpPair","normDpRule",
  "dpPts","dpSegs","dpDir","dpPerp","dpCross","dpDot","dpOffset","dpLeg",
  "dpFreeEnd","dpAnchors","dpNearest","dpPrimPair","dpPairAt","dpPush",
  "dpSelected","dpSelect","dpViaSpread","dpPosture","dpGate","dpMid","dpTarget",
  "dpStart","dpUpdate","dpStep","dpVia","dpToLayer","dpCommit","dpCancel",
  "dpBack","drawDp","dpCoupling","dpDrc","dpFromSel","dpAutoAll","dpDelete",
  "dpPanelRule","dpMaterialize","dpFigure","dpLayerCells","buildDiffPairs",
  "dpLayerEdit",
  /* rendu et fusion des lignes droites */
  "drawTracks","sameLine","routeVia",
  /* géométrie du tracé 45° et posture du coude */
  "route45","routeCorner","minJog","autoPosture","routePosture","dir8",
  "angleOff","angleOk","angleDeg","ANG_TOL","DIR8","tendMagnet",
  "cornerMode","setCornerMode","CORNER_MODES",
  /* anti-collision et ménage du dépôt */
  "moveClearBad","pruneHooks","pruneDeadTracks","hookAt","endFar","endDir",
  /* boîtiers nommés : le nom venu du schéma décide de l'empreinte */
  "PKG_LIB","pkgKey","pkgGeom","fpGeomFor","applyPkgGeom","fpWiredPins",
  "parseNetlist","parseCompLine","applyNetlist","STYLES","bodyOf",
  /* empreintes dessinees a la main et bibliotheque personnelle */
  "fpFree","padClone","fpAutoBody","fpFreeze","fpGeneric","fpSyncPins",
  "fpMovePad","fpSetPad","fpAddPad","fpDelPad","fpSetPins","fpSetBody",
  "dPads","dBody","fpDefOf","normFpDef","fpApplyDef","fpLibAll","fpLibWrite",
  "fpLibNames","fpLibGet","fpLibPut","fpLibDel","fpLibFile","fpLibParse",
  "fpLibMerge","feOverlap","FPLIB_KEY","FPLIB_FORMAT","FE","feIsOpen","feClose",
  /* formes de pastille, rotation, origine de l'empreinte */
  "PAD_SHAPES","padShape","padRadius","padRot","padHalf","padDist","padOpening",
  "fpLocalBox","fpMoveOrigin","fpOffCenter","fpIsCentered","fpCenterOrigin",
  "apSet","apForPad","fePad",
  /* repère de broche 1 */
  "MARK_D","PASSIF_REF","fpMarkWanted","fpMarkAuto","fpMark","fpSetMark",
  "fpMoveMark","fpSetMarkD","fpXform","feZoom","feRefit","feReattach"];
/* WS est réassigné par « Réinitialiser la disposition » : on l'expose en
   accesseur pour que le banc d'essai voie toujours l'objet courant. */
eval(code.replace(/^"use strict";/,"")+"\n"
     +EXPOSE.map(n=>"globalThis."+n+"="+n+";").join("\n")+"\n"
     +'Object.defineProperty(globalThis,"WS",'
     +'{get:()=>WS,set:v=>{WS=v;},configurable:true});'
     /* SESS_QUITTE bascule à la sortie vers un autre outil : le banc
        d'essai doit pouvoir le remettre à zéro entre deux essais */
     +'Object.defineProperty(globalThis,"SESS_QUITTE",'
     +'{get:()=>SESS_QUITTE,set:v=>{SESS_QUITTE=v;},configurable:true});');

const fire=dom.fire, key=dom.key;
/* Première différence entre deux documents, ou null s'ils sont équivalents.
   On compare la structure et non le texte JSON : l'ordre des clés n'a pas de
   sens ici, ce qui compte est qu'aucune valeur ne soit perdue ni modifiée. */
function firstDiff(a,b,path){
  const t=v=>v===null?"null":Array.isArray(v)?"array":typeof v;
  if(t(a)!==t(b))return path+" : "+t(a)+" devenu "+t(b);
  if(t(a)==="array"){
    if(a.length!==b.length)return path+" : "+a.length+" élément(s) devenus "+b.length;
    for(let i=0;i<a.length;i++){
      const d=firstDiff(a[i],b[i],path+"["+i+"]");
      if(d)return d;
    }
    return null;
  }
  if(t(a)==="object"){
    const ka=Object.keys(a).sort(), kb=Object.keys(b).sort();
    for(const k of ka)if(kb.indexOf(k)<0)return path+"."+k+" : clé perdue";
    for(const k of kb)if(ka.indexOf(k)<0)return path+"."+k+" : clé ajoutée";
    for(const k of ka){
      const d=firstDiff(a[k],b[k],path+"."+k);
      if(d)return d;
    }
    return null;
  }
  return a===b?null:path+" : "+JSON.stringify(a)+" devenu "+JSON.stringify(b);
}
function sc(x,y){const p=w2s(x,y);return {clientX:p.x,clientY:p.y};}
/* closeZone() et fullBoardZone() demandent le net dans une boîte <dialog> :
   on choisit le net et on clique « Valider » à la place de l'utilisateur.
   net===null -> bouton « Annuler ». */
function zoneDialog(net){
  const d=dom.dialog();
  if(!d)throw new Error("aucune boîte de dialogue ouverte");
  const sel=d.querySelector("select");
  if(!sel)throw new Error("sélecteur de net absent de la boîte");
  const btns=d.querySelectorAll("button");
  if(btns.length!==2)throw new Error("2 boutons attendus, "+btns.length);
  if(net===null){btns[0].onclick();return null;}
  sel.value=net||"";
  btns[1].onclick();
  return S.zones[S.zones.length-1];
}

const NET=`* Netlist — Éditeur schématique
* 1 feuille(s) · 4 net(s)

=== Composants ===
    R1      10k               0603              f1
    C1      100n              0603              f1
    U1      NE555             DIP-8             f1
    D1      LED               0805              f1

=== Nets globaux (masses, alimentations, étiquettes globales) ===

NET "GND"   ; feuille 1
    C1.2
    U1.1
    R1.2

NET "+5V"   ; feuille 1
    U1.8
    U1.4
    D1.1

=== Feuille 1 — Principale ===

NET "N$1"
    U1.3        SORTIE
    R1.1

NET "N$2"
    U1.6
    U1.2
    C1.1
`;

/* Réglages d'usine, relevés avant que le premier essai ne les remue : c'est ce
   que voit l'utilisateur qui ouvre l'éditeur. */
const USINE={grid:S.grid,corner:S.rule.corner};

let ok=0,ko=0;
function T(name,fn){
  try{fn();console.log("  ok  "+name);ok++;}
  catch(e){console.log("  KO  "+name+" → "+e.message+"\n"+(e.stack||"").split("\n")[1]);ko++;}
}
console.log("— banc d'essai éditeur PCB —");
T("import netlist",()=>{
  importNetlist(NET,false);
  if(S.fps.length!==4)throw new Error("4 empreintes attendues, "+S.fps.length);
  const u1=S.fps.find(f=>f.ref==="U1");
  if(u1.pins!==8)throw new Error("U1 doit avoir 8 broches, "+u1.pins);
  if(u1.nets[1]!=="GND")throw new Error("U1.1 devrait être GND");
});
T("nets et chevelu",()=>{
  const c=conn();
  if(c.nets.size!==4)throw new Error("4 nets attendus, "+c.nets.size);
  if(!c.rats.length)throw new Error("chevelu vide");
  if(c.unrouted!==7)throw new Error("7 liaisons attendues, "+c.unrouted);
});
T("empilage 4 couches",()=>{
  setCuCount(4);
  if(S.cu!==4||S.cuL.length!==4)throw new Error("empilage incorrect");
  if(cuId(0,4)!=="L1_Top")throw new Error("nom de couche extérieure faux : "+cuId(0,4));
  if(cuId(1,4)!=="L2_Inner")throw new Error("nom de couche interne faux : "+cuId(1,4));
  if(cuId(3,4)!=="L4_Bottom")throw new Error("nom de couche opposée faux : "+cuId(3,4));
});
T("routage d'un segment entre deux pastilles",()=>{
  S.avoid=false;                       // trajet direct : l'anti-collision a son propre essai
  const u1=S.fps.find(f=>f.ref==="U1"), r1=S.fps.find(f=>f.ref==="R1");
  u1.x=10;u1.y=10;r1.x=30;r1.y=30;touch();
  const a=padsWorld(u1).find(q=>q.n===3), b=padsWorld(r1).find(q=>q.n===1);
  setMode("track");
  startRoute(a.x,a.y);
  if(S.route.net!=="N$1")throw new Error("net de départ faux : "+S.route.net);
  updateRoute(b.x,b.y);stepRoute();
  if(S.route)commitRoute();
  if(!S.tracks.length)throw new Error("aucune piste posée");
  const c=conn();
  if(c.nets.get("N$1").miss!==0)throw new Error("N$1 devrait être routé");
  S.avoid=true;
});
T("via et changement de couche",()=>{
  const n=S.tracks.length;
  setMode("track");
  startRoute(50,50);
  routeToLayer(2);
  if(!S.vias.length)throw new Error("via non posé");
  if(S.route.layer!==2)throw new Error("couche non changée");
  updateRoute(60,58);stepRoute();commitRoute();
  const last=S.tracks[S.tracks.length-1];
  if(last.l!==2)throw new Error("piste posée sur la mauvaise couche");
  if(S.tracks.length<=n)throw new Error("piste manquante");
});
T("connexion via inter-couches",()=>{
  const before=conn().unrouted;
  if(typeof before!=="number")throw new Error("unrouted non calculé");
});
T("zone dessinée point par point",()=>{
  setCuCount(4);
  S.fps.forEach((f,i)=>{f.x=15+i*20;f.y=20+(i%2)*20;f.side=0;});
  touch();
  setMode("zone");
  zoneClick(5,5);zoneClick(90,5);zoneMove(90,70);zoneClick(90,70);zoneClick(5,70);
  if(S.zoneDraft.pts.length!==4)throw new Error("4 sommets attendus");
  // retour sur le premier point : la zone se ferme et le net est demandé
  zoneClick(5,5);
  if(S.zoneDraft)throw new Error("la zone aurait dû se fermer");
  if(S.zones.length)throw new Error("rien ne doit être posé avant validation");
  zoneDialog("");
  if(S.zones.length!==1)throw new Error("zone non créée");
  const z=S.zones[0];
  if(z.l!==S.active)throw new Error("mauvaise couche");
  if(!S.sel.zones.has(z))throw new Error("la zone créée devrait être sélectionnée");
  setMode("select");
});
T("la zone relie les pastilles de son net",()=>{
  const z=S.zones[0];
  z.l=0;z.net="GND";touch();
  const g=conn().nets.get("GND");
  if(g.miss!==0)throw new Error("GND devrait être relié par la zone, reste "+g.miss);
  z.net="";touch();
  if(conn().nets.get("GND").miss===0)throw new Error("sans net, la zone ne doit rien relier");
  z.net="GND";z.l=2;touch();
  if(conn().nets.get("GND").miss===0)
    throw new Error("une zone interne ne doit pas atteindre les pastilles CMS du dessus");
  z.l=0;touch();
});
T("remplissage et cache",()=>{
  const a=zoneCanvas(0);
  if(!a)throw new Error("remplissage non généré");
  const b=zoneCanvas(0);
  if(a!==b)throw new Error("le cache devrait resservir");
  touch();
  if(zoneCanvas(0)===a)throw new Error("le cache devrait être invalidé après modification");
});
T("sélection par le contour et poignées",()=>{
  const z=S.zones[0];
  const h=hitTest(z.pts[0].x,z.pts[0].y);
  if(!h||h.zone!==z)throw new Error("la zone devrait s'attraper par son contour");
  const inside=hitTest((z.pts[0].x+z.pts[2].x)/2,(z.pts[0].y+z.pts[2].y)/2);
  if(inside&&inside.zone)throw new Error("cliquer au milieu ne doit pas saisir la zone");
});
T("plan pleine carte",()=>{
  const n=S.zones.length;
  fullBoardZone();
  zoneDialog("");
  if(S.zones.length!==n+1)throw new Error("plan non créé");
  const z=S.zones[S.zones.length-1];
  if(z.pts.length!==4)throw new Error("rectangle attendu");
  S.zones.pop();clearSel();touch();
});
T("rôle plan de couche",()=>{
  S.cuL[3].plane=true;S.cuL[3].net="GND";syncAutoZones();
  const z=S.zones.find(o=>o.auto&&o.l===3);
  if(!z)throw new Error("plan non créé");
  if(z.pts.length!==4)throw new Error("rectangle attendu");
  const w0=z.pts[1].x-z.pts[0].x;
  S.board.w+=20;syncAutoZones();
  if(S.zones.find(o=>o.auto&&o.l===3).pts[1].x-z.pts[0].x<=w0)
    throw new Error("le plan devrait suivre la carte");
  S.board.w-=20;syncAutoZones();
  // le déformer le rend libre
  detachAuto(z);
  if(S.cuL[3].plane)throw new Error("le rôle devrait retomber en signal");
  if(S.zones.indexOf(z)<0)throw new Error("la zone devrait survivre au détachement");
  S.zones=S.zones.filter(o=>o!==z);touch();
  // et le retirer du rôle supprime son plan
  S.cuL[3].plane=true;S.cuL[3].net="GND";syncAutoZones();
  const n=S.zones.length;
  S.cuL[3].plane=false;syncAutoZones();
  if(S.zones.length!==n-1)throw new Error("le plan aurait dû disparaître");
});
T("étiquetage des îlots",()=>{
  // une bande pleine coupée en deux par une colonne vide
  const W=20,H=6,a=new Uint8Array(W*H);
  for(let y=0;y<H;y++)for(let x=0;x<W;x++)a[y*W+x]=(x===10)?0:1;
  const r=labelMask(a,W,H);
  if(r.count!==2)throw new Error("2 îlots attendus, "+r.count);
  if(r.lab[0]===r.lab[W-1])throw new Error("les deux moitiés ne doivent pas partager l'étiquette");
  // un contact en diagonale ne conduit pas
  const b=new Uint8Array(4);b[0]=1;b[3]=1;
  if(labelMask(b,2,2).count!==2)throw new Error("la diagonale ne doit pas relier");
});
T("un faisceau qui coupe un plan le coupe vraiment",()=>{
  if(!realCanvas){console.log("     (canvas absent : essai ignoré)");return;}
  const saved=serialize();          // l'essai repart d'une carte neuve, on rendra l'autre
  // carte propre : deux pastilles GND de part et d'autre, plan pleine carte
  S.fps=[];S.tracks=[];S.vias=[];S.zones=[];touch();
  setCuCount(2);
  S.board={x:0,y:0,w:60,h:40};
  const mk=(ref,x,y)=>{
    const f=mkFp(ref,"","",2);f.style="row";f.pitch=2.54;f.x=x;f.y=y;
    f.nets={1:"GND",2:"GND"};S.fps.push(f);return f;
  };
  mk("J1",10,20);mk("J2",50,20);
  S.zones.push({id:999,l:0,net:"GND",pts:boardZonePts()});
  touch();
  if(conn().nets.get("GND").miss!==0)throw new Error("le plan intact devrait tout relier");
  // huit pistes serrées, de bord à bord, en travers du plan
  for(let i=0;i<8;i++){
    const x=26+i*1.2;
    S.tracks.push({l:0,net:"SIG"+i,w:0.6,x1:x,y1:-2,x2:x,y2:42});
  }
  touch();
  const m=conn().nets.get("GND").miss;
  if(m===0)throw new Error("le plan est coupé : GND ne devrait plus être relié");
  const zi=conn().zoneIslands[0];
  if(!zi||zi.islands<2)throw new Error("les deux îlots devraient être comptés, "+(zi&&zi.islands));
  // un via de couture ne suffit pas non plus : on rouvre un passage à la place
  S.tracks=S.tracks.filter(t=>t.y2!==42);
  for(const t of S.tracks)t.y2=20;
  touch();
  if(conn().nets.get("GND").miss!==0)
    throw new Error("le passage rouvert devrait rétablir GND");
  const e=runDrc();
  if(e.some(x=>/îlots/.test(x.msg)))throw new Error("plus de coupure : plus d'erreur d'îlot");
  loadDoc(JSON.parse(saved),true);
});
T("classes de net",()=>{
  const d=classOf("N$1");
  if(d.name!=="Défaut")throw new Error("classe par défaut attendue");
  if(defaultWidth("N$1")!==d.w)throw new Error("largeur par défaut faussée");
  setNetClass("N$1","Alimentation");
  const a=S.classes.find(x=>x.name==="Alimentation");
  if(classOf("N$1").name!=="Alimentation")throw new Error("rattachement raté");
  if(defaultWidth("N$1")!==a.w)throw new Error("la largeur devrait suivre la classe");
  // l'isolation retenue entre deux nets est la plus exigeante
  a.clr=0.4;
  if(Math.abs(clrPair("N$1","N$2")-0.4)>1e-9)throw new Error("isolation de paire fausse");
  a.clr=0.25;
  // le routage existant ne bouge qu'à la demande
  const t=S.tracks.find(x=>x.net==="N$1");
  const w0=t.w;
  if(t.w!==w0)throw new Error("largeur modifiée sans demande");
  applyClasses();
  if(Math.abs(t.w-a.w)>1e-9)throw new Error("la piste devrait être recalée sur sa classe");
  // les nets d'alimentation sont rattachés d'office à l'import
  autoClass();
  if(classOf("GND").name!=="Alimentation")throw new Error("GND devrait être en Alimentation");
  if(classOf("N$2").name!=="Défaut")throw new Error("un net de signal ne doit pas bouger");
  setNetClass("N$1","Défaut");
  if(S.netClass["N$1"])throw new Error("le rattachement par défaut ne doit rien stocker");
  buildRules();
});
T("largeur de classe au tracé",()=>{
  setNetClass("N$2","Alimentation");
  const a=S.classes.find(x=>x.name==="Alimentation");
  const u1=S.fps.find(f=>f.ref==="U1"), c1=S.fps.find(f=>f.ref==="C1");
  const p=padsWorld(u1).find(q=>q.n===6), q=padsWorld(c1).find(x=>x.n===1);
  setMode("track");
  startRoute(p.x,p.y);
  if(Math.abs(S.route.w-a.w)>1e-9)throw new Error("le tracé devrait prendre la largeur de classe");
  updateRoute(q.x,q.y);stepRoute();
  if(S.route)commitRoute();
  setMode("select");
});
/* Le routeur pose un segment par clic, et route45 en pose deux. Suivre une même
   direction sur plusieurs clics laissait autant de morceaux bout à bout là où
   l'œil ne voit qu'un trait — et les coutures se voyaient à l'écran. */
T("une ligne droite tracée en plusieurs clics fait un seul segment",()=>{
  S.fps=[];S.tracks=[];S.vias=[];S.zones=[];touch();
  S.avoid=false;
  setMode("track");S.active=0;
  startRoute(0,0,true);
  updateRoute(10,10);stepRoute();         // 45° plein
  updateRoute(20,20);stepRoute();         // on continue dans le même axe
  updateRoute(30,30);stepRoute();
  updateRoute(40,30);stepRoute();         // changement de direction : nouveau segment
  commitRoute();
  setMode("select");
  if(S.tracks.length!==2)
    throw new Error("un segment par direction attendu, "+S.tracks.length+" : "
      +S.tracks.map(t=>`(${t.x1},${t.y1})->(${t.x2},${t.y2})`).join(" "));
  const d=S.tracks[0];
  if(Math.abs(d.x2-30)>1e-9||Math.abs(d.y2-30)>1e-9)
    throw new Error("la diagonale devait aller d'un bout à l'autre : "+d.x2+","+d.y2);
  S.avoid=true;
  undo();
});
/* Le chemin en L chanfreiné se décompose en une diagonale et une portion
   droite. Prise comme |dx| - |dy|, la seconde devient négative dès que le trajet
   est plus haut que large : elle repart en arrière par-dessus la diagonale et le
   contour se recroise — le papillon, cette auto-intersection que la spec Gerber
   refuse dans une région G36/G37. */
T("route45 : deux longueurs positives, quel que soit le trajet",()=>{
  const cas=[[3,10],[-3,10],[3,-10],[-3,-10],[10,3],[10,-3],[-10,3],[-10,-3],
             [0.5,7],[7,0.5],[1,1000]];
  for(const p of [false,true])
    for(const [bx,by] of cas){
      const segs=route45({x:0,y:0},{x:bx,y:by},p);
      if(segs.length!==2)
        throw new Error(`(${bx},${by}) posture ${p} : deux segments attendus, `+segs.length);
      let px=0,py=0;
      for(const s of segs){
        const dx=Math.abs(s.x2-s.x1), dy=Math.abs(s.y2-s.y1);
        if(dx<1e-9&&dy<1e-9)
          throw new Error(`(${bx},${by}) posture ${p} : segment de longueur nulle`);
        if(dx>1e-9&&dy>1e-9&&Math.abs(dx-dy)>1e-9)
          throw new Error(`(${bx},${by}) posture ${p} : segment de biais`);
        // bout à bout, et jamais un retour en arrière sur le précédent
        if(Math.abs(s.x1-px)>1e-9||Math.abs(s.y1-py)>1e-9)
          throw new Error(`(${bx},${by}) posture ${p} : la polyligne s'est ouverte`);
        px=s.x2;py=s.y2;
      }
      const u={x:segs[0].x2-segs[0].x1,y:segs[0].y2-segs[0].y1};
      const v={x:segs[1].x2-segs[1].x1,y:segs[1].y2-segs[1].y1};
      if(u.x*v.x+u.y*v.y<=0)
        throw new Error(`(${bx},${by}) posture ${p} : la portion droite repart en arrière`);
      if(Math.abs(px-bx)>1e-9||Math.abs(py-by)>1e-9)
        throw new Error(`(${bx},${by}) posture ${p} : l'arrivée n'y est pas`);
    }
  // trajets dégénérés : un seul segment, pas de point milieu
  for(const [bx,by] of [[10,0],[0,10],[10,10],[-10,10]])
    if(route45({x:0,y:0},{x:bx,y:by},false).length!==1||
       route45({x:0,y:0},{x:bx,y:by},true).length!==1)
      throw new Error(`(${bx},${by}) : un seul segment attendu`);
  if(route45({x:5,y:5},{x:5,y:5},false).length!==0)throw new Error("sur place : rien à poser");
});
/* Le papillon mort, l'écharde restait. `s` n'est plus négatif, mais avec un
   curseur libre il ne vaut jamais exactement zéro : trois centièmes de
   décrochement, une languette plus fine que la piste qu'elle prolonge, que le
   bain de gravure sous-attaque. `minSeg` déplace alors l'arrivée pour forcer le
   rail — c'est l'aimant angulaire du routeur de KiCad. */
T("route45 : le décrochement sous le seuil s'aimante sur le rail",()=>{
  const W=0.3;
  for(const sx of [1,-1])
    for(const sy of [1,-1]){
      const segs=route45({x:0,y:0},{x:sx*10,y:sy*9.97},false,W);
      if(segs.length!==1)
        throw new Error("un seul segment attendu : "+JSON.stringify(segs));
      const s=segs[0];
      if(Math.abs(Math.abs(s.x2-s.x1)-Math.abs(s.y2-s.y1))>1e-9)
        throw new Error("l'aimant devait donner un 45° exact : "+JSON.stringify(s));
      if(Math.abs(s.x2-sx*9.985)>1e-9||Math.abs(s.y2-sy*9.985)>1e-9)
        throw new Error("l'arrivée devait venir sur la diagonale : "+JSON.stringify(s));
      // diagonale trop courte : c'est l'axe qui aimante
      const ax=route45({x:0,y:0},{x:sx*10,y:sy*0.03},false,W);
      if(ax.length!==1||Math.abs(ax[0].y2-ax[0].y1)>1e-9||Math.abs(ax[0].x2-sx*10)>1e-9)
        throw new Error("l'aimant devait redresser sur l'axe : "+JSON.stringify(ax));
    }
  if(route45({x:0,y:0},{x:10,y:9.5},false,W).length!==2)
    throw new Error("un décrochement franc reste un décrochement");
  // aucun segment plus court que le seuil, sur tout le balayage de la zone morte
  for(let i=0;i<=400;i++){
    const y=Math.round(i*25)/1000;
    for(const p of [false,true])
      for(const s of route45({x:0,y:0},{x:10,y:y},p,W)){
        const L=Math.hypot(s.x2-s.x1,s.y2-s.y1);
        if(L>1e-9&&L<W-1e-9)
          throw new Error("écharde de "+L.toFixed(3)+" mm à y="+y);
      }
  }
  // sans seuil, la géométrie reste celle d'avant : l'aimant ne s'invite pas
  if(route45({x:0,y:0},{x:10,y:9.97},false).length!==2)
    throw new Error("sans seuil, le décrochement se pose tel quel");
});
/* Le seuil se prend sur la largeur de la piste, et le tracé le porte de
   lui-même : une grille au dixième sous une piste de trois dixièmes fabriquait
   des échardes à la chaîne. */
T("le tracé ne pose plus d'écharde sous la largeur de piste",()=>{
  S.fps=[];S.tracks=[];S.vias=[];S.zones=[];touch();
  S.avoid=false;setMode("track");S.active=0;S.grid=0.1;
  startRoute(0,0,true);
  const W=S.route.w;
  updateRoute(10,9.9);                       // un décrochement d'un pas de grille
  if(S.route.preview.length!==1)
    throw new Error("l'aimant devait tout ramener sur la diagonale : "+
                    JSON.stringify(S.route.preview));
  stepRoute();
  updateRoute(14,9.9);stepRoute();           // puis une horizontale franche
  commitRoute();
  for(const t of S.tracks){
    const L=Math.hypot(t.x2-t.x1,t.y2-t.y1);
    if(L<W-1e-9)
      throw new Error("écharde de "+L.toFixed(3)+" mm posée : "+JSON.stringify(t));
  }
  setMode("select");
});
/* Celles qu'un ancien clic a posées, ou qu'une arrivée sur une pastille hors
   grille impose, ne se voient qu'au contrôle. */
T("le DRC signale le décrochement plus court que la piste",()=>{
  const keep=serialize();
  S.fps=[];S.vias=[];S.zones=[];
  S.tracks=[{l:0,net:"A",w:0.3,x1:0,y1:0,x2:5,y2:0},
            {l:0,net:"A",w:0.3,x1:5,y1:0,x2:5.03,y2:0.03},
            {l:0,net:"A",w:0.3,x1:5.03,y1:0.03,x2:10,y2:0.03}];
  touch();
  if(!runDrc().some(e=>/écharde/.test(e.msg)))
    throw new Error("le décrochement de 0,03 mm devrait être signalé");
  // un bout de piste libre est court par nécessité, pas par accident
  S.tracks=[{l:0,net:"A",w:0.3,x1:0,y1:0,x2:5,y2:0},
            {l:0,net:"A",w:0.3,x1:5,y1:0,x2:5.1,y2:0}];
  touch();
  if(runDrc().some(e=>/écharde/.test(e.msg)))
    throw new Error("un moignon en bout de piste n'est pas une écharde");
  loadDoc(JSON.parse(keep),true);
});
/* La posture ne se mémorise pas : la retenir verrouille le coude en angle droit,
   et le chanfrein ne réapparaît plus. Elle se relève à chaque mouvement de la
   direction déjà prise — la piste continue tout droit, puis tourne. */
T("la posture se recalcule à chaque mouvement",()=>{
  S.fps=[];S.tracks=[];S.vias=[];S.zones=[];touch();
  S.avoid=false;setMode("track");S.active=0;
  startRoute(0,0,true);
  updateRoute(30,0);stepRoute();                  // une horizontale
  updateRoute(36,4);
  let p=S.route.preview;
  if(p.length!==2||Math.abs(p[0].y2)>1e-9)
    throw new Error("la droite devait continuer avant de tourner : "+JSON.stringify(p));
  updateRoute(40,10);stepRoute();                 // puis un 45° plein
  if(S.route.done[S.route.done.length-1].x2!==40)
    throw new Error("le 45° devait être posé : "+JSON.stringify(S.route.done));
  updateRoute(48,14);
  p=S.route.preview;
  if(p.length!==2)throw new Error("le chanfrein devait revenir : "+JSON.stringify(p));
  if(Math.abs(Math.abs(p[0].x2-p[0].x1)-Math.abs(p[0].y2-p[0].y1))>1e-9)
    throw new Error("après un 45°, la diagonale devait passer devant : "+JSON.stringify(p));
  commitRoute();setMode("select");
});
/* Repartir en arrière posait la portion droite par-dessus le cuivre qu'on venait
   de poser : deux segments bout à bout en sens contraire, un recouvrement de
   surface nulle. La diagonale, elle, quitte le point tout de suite. */
T("la portion droite ne double pas le cuivre posé",()=>{
  S.fps=[];S.tracks=[];S.vias=[];S.zones=[];touch();
  S.avoid=false;setMode("track");S.active=0;
  startRoute(0,0,true);
  updateRoute(30,0);stepRoute();
  updateRoute(20,3);
  const p=S.route.preview;
  if(p.length!==2)throw new Error("deux segments attendus : "+JSON.stringify(p));
  if(Math.abs(Math.abs(p[0].x2-p[0].x1)-Math.abs(p[0].y2-p[0].y1))>1e-9)
    throw new Error("la diagonale devait partir la première : "+JSON.stringify(p));
  commitRoute();setMode("select");
});
/* « / » bascule la posture à la main, comme le routeur de KiCad — et la bascule
   ne vaut que pour le coude en cours. */
T("la touche / bascule la posture, rendue au dépôt",()=>{
  S.fps=[];S.tracks=[];S.vias=[];S.zones=[];touch();
  S.avoid=false;setMode("track");S.active=0;
  startRoute(0,0,true);
  fire("pointermove",sc(10,4));                   // la bascule repart du curseur
  const droit=S.route.preview.map(s=>[s.x2,s.y2].join());
  if(Math.abs(S.route.preview[0].y2)>1e-9)
    throw new Error("la portion droite devait partir la première : "+JSON.stringify(S.route.preview));
  key("/");
  const diag=S.route.preview.map(s=>[s.x2,s.y2].join());
  if(droit.join()===diag.join())throw new Error("la posture n'a pas basculé");
  if(Math.abs(S.route.preview[0].x2-4)>1e-9||Math.abs(S.route.preview[0].y2-4)>1e-9)
    throw new Error("la diagonale devait passer devant : "+JSON.stringify(S.route.preview));
  stepRoute();
  if(S.route.flip)throw new Error("la bascule devait être rendue au dépôt");
  commitRoute();setMode("select");
});
T("un via garde la césure au milieu d'une ligne droite",()=>{
  if(S.cu<2)setCuCount(2);
  S.fps=[];S.tracks=[];S.vias=[];S.zones=[];touch();
  S.avoid=false;
  setMode("track");S.active=0;
  startRoute(0,0,true);
  updateRoute(0,10);stepRoute();
  routeVia();                             // B : via, et on revient sur la couche 0
  routeToLayer(0);
  updateRoute(0,20);stepRoute();
  commitRoute();
  setMode("select");
  if(S.tracks.length!==2)
    throw new Error("le via devait garder la césure, "+S.tracks.length+" segment(s)");
  S.avoid=true;
  undo();
});
/* Deux segments bout à bout se recouvrent au coude : peints l'un après l'autre,
   ils y déposent deux fois l'encre et la couture se voit. */
T("les segments d'une même piste ne sont peints qu'une fois",()=>{
  S.fps=[];S.tracks=[];S.vias=[];touch();
  const a={l:0,net:"T",w:0.3,x1:0, y1:0,x2:10,y2:0};
  const b={l:0,net:"T",w:0.3,x1:10,y1:0,x2:20,y2:0};
  const e={l:0,net:"T",w:0.5,x1:20,y1:0,x2:30,y2:0};   // autre largeur : son propre lot
  S.tracks.push(a,b,e);touch();
  clearSel();S.sel.tracks.add(a);S.sel.tracks.add(b);
  const cx=ctxStub();
  let n=0;cx.stroke=()=>n++;
  drawTracks(cx,0,1);
  if(n!==3)throw new Error("3 coups de pinceau attendus (halo, 0,3 mm, 0,5 mm), "+n);
  clearSel();
});
/* Le centre d'une pastille de 2 mm est à plus d'un millimètre de son bord :
   mesurer l'accroche depuis le centre ne l'attrapait qu'en visant le milieu.
   Manqué de peu, le point retombait sur le quadrillage — hors de l'axe de la
   pastille, et court d'un rien : la piste n'entrait plus au centre. */
function deuxPastilles(netB){
  S.fps=[];S.tracks=[];S.vias=[];S.zones=[];clearSel();
  setGridStep(0.5);S.scale=20;S.ox=0;S.oy=0;S.origin.x=0;S.origin.y=0;
  const A=mkFp("J8","","",2);A.style="row";A.pitch=2.54;A.x=10;A.y=10;A.nets={1:"T",2:""};
  const B=mkFp("J9","","",2);B.style="row";B.pitch=2.54;B.x=40;B.y=25;B.nets={1:netB,2:""};
  S.fps.push(A,B);touch();
  const a=padsWorld(A).find(p=>p.n===1), b=padsWorld(B).find(p=>p.n===1);
  if(Math.abs(b.x-snapX(b.x))<1e-9)throw new Error("le décor voulait une pastille hors grille");
  return {a,b};
}
T("une pastille attire depuis son cuivre, pas depuis son centre",()=>{
  const {b}=deuxPastilles("T");
  S.active=0;
  const m=magnet(b.x-b.w/2-px(4),b.y+b.h/4,0);   // juste dehors, près du bord
  if(!m||!m.pad)throw new Error("la pastille devait accrocher depuis son bord");
  if(Math.abs(m.x-b.x)>1e-9||Math.abs(m.y-b.y)>1e-9)
    throw new Error("l'accroche devait rendre le centre : "+m.x+","+m.y);
  if(magnet(b.x-b.w/2-px(30),b.y,0))
    throw new Error("loin de la pastille, plus rien ne doit accrocher");
});
T("la piste entre au centre de la pastille d'arrivée",()=>{
  const {a,b}=deuxPastilles("T");
  S.avoid=false;
  setMode("track");S.active=0;
  startRoute(a.x,a.y);
  updateRoute(b.x-b.w/2-px(4),b.y+b.h/4);      // on vise le bord, pas le milieu
  stepRoute();
  if(S.route)commitRoute();
  setMode("select");
  const last=S.tracks[S.tracks.length-1];
  if(!last)throw new Error("aucune piste posée");
  if(Math.abs(last.x2-b.x)>1e-9||Math.abs(last.y2-b.y)>1e-9)
    throw new Error("la piste devait finir au centre : "+last.x2+","+last.y2+
                    " au lieu de "+b.x+","+b.y);
  S.avoid=true;
  undo();
});
T("édition des extrémités de piste",()=>{
  S.tracks=[];S.vias=[];touch();
  const a={l:0,net:"T",w:0.3,x1:10,y1:10,x2:20,y2:10};
  const b={l:0,net:"T",w:0.3,x1:20,y1:10,x2:20,y2:20};
  S.tracks.push(a,b);touch();
  const j=jointAt(20,10,0);
  if(j.ends.length!==2)throw new Error("le coude réunit deux extrémités, "+j.ends.length);
  setMode("select");S.active=0;
  clearSel();S.sel.tracks.add(a);S.sel.tracks.add(b);
  fire("pointerdown",sc(20,10));
  fire("pointermove",sc(24,14));
  fire("pointerup",sc(24,14));
  if(Math.abs(a.x2-24)>0.6||Math.abs(b.x1-24)>0.6)
    throw new Error("les deux extrémités devaient suivre : "+a.x2+" / "+b.x1);
  if(Math.abs(a.x1-10)>1e-9)throw new Error("l'autre bout ne devait pas bouger");
});
/* Un centre de pastille tombe rarement sur la grille : une rangée au pas de
   2,54 mm pose ses colonnes à 1,27 mm de son axe. Accrocher la suite du tracé
   au seul quadrillage faisait sortir la piste de travers du centre — d'un
   décalage plus large que la piste elle-même. */
function pastilleHorsGrille(){
  S.fps=[];S.tracks=[];S.vias=[];S.zones=[];clearSel();
  const j=mkFp("J9","","",2);
  j.style="row";j.pitch=2.54;j.x=10;j.y=10;j.nets={1:"T"};
  S.fps.push(j);touch();
  setGridStep(0.5);S.scale=20;S.ox=0;S.oy=0;S.origin.x=0;S.origin.y=0;
  const q=padsWorld(j).find(p=>p.n===1);
  if(Math.abs(q.x-snapX(q.x))<1e-9)throw new Error("le décor voulait une pastille hors grille");
  return q;
}
T("la piste sort droit du centre d'une pastille hors grille",()=>{
  const q=pastilleHorsGrille();
  S.avoid=false;
  setMode("track");S.active=0;
  startRoute(q.x,q.y);
  if(Math.abs(S.route.pt.x-q.x)>1e-9)throw new Error("le départ doit être le centre de la pastille");
  updateRoute(q.x+0.1,q.y+8);stepRoute();     // la main vise la colonne de la pastille
  if(S.route)commitRoute();
  setMode("select");
  if(S.tracks.length!==1)throw new Error("un seul segment attendu, "+S.tracks.length);
  const t=S.tracks[0];
  if(Math.abs(t.x1-q.x)>1e-9||Math.abs(t.x2-q.x)>1e-9)
    throw new Error("la piste devait rester sur la colonne de la pastille : "+t.x1+" → "+t.x2);
  S.avoid=true;
});
T("recentrer une piste sur le centre d'une pastille",()=>{
  const q=pastilleHorsGrille();
  const g=snapX(q.x);                         // là où la grille seule posait le bout
  const a={l:0,net:"T",w:0.3,x1:g,y1:q.y,x2:g,y2:q.y+8};
  const b={l:0,net:"T",w:0.3,x1:g,y1:q.y+8,x2:g+10,y2:q.y+8};
  S.tracks=[a,b];touch();
  setMode("select");S.active=0;
  clearSel();S.sel.tracks.add(a);
  fire("pointerdown",sc(a.x1,a.y1));
  fire("pointermove",sc(q.x,q.y));
  fire("pointerup",sc(q.x,q.y));
  if(Math.abs(a.x1-q.x)>1e-9)throw new Error("le bout devait rejoindre le centre : "+a.x1);
  if(Math.abs(a.x2-q.x)>1e-9)throw new Error("le segment devait se redresser : "+a.x2);
  if(Math.abs(b.x1-q.x)>1e-9)throw new Error("le coude devait suivre : "+b.x1);
  if(Math.abs(b.y1-(q.y+8))>1e-9)throw new Error("le voisin devait rester horizontal : "+b.y1);
  if(Math.abs(b.x2-(g+10))>1e-9)throw new Error("l'autre bout du voisin ne devait pas bouger");
  undo();
});
T("glisser un segment : la piste reste d'un seul tenant",()=>{
  S.tracks=[];S.vias=[];touch();
  const a={l:0,net:"T",w:0.3,x1:10,y1:10,x2:20,y2:10};
  const b={l:0,net:"T",w:0.3,x1:20,y1:10,x2:20,y2:20};
  S.tracks.push(a,b);touch();
  setMode("select");S.active=0;
  clearSel();S.sel.tracks.add(a);
  const mid={x:(a.x1+a.x2)/2,y:a.y1};
  fire("pointerdown",sc(mid.x,mid.y));
  fire("pointermove",sc(mid.x,mid.y+4));
  fire("pointerup",sc(mid.x,mid.y+4));
  if(Math.abs(a.y1-14)>0.6||Math.abs(a.y2-14)>0.6)
    throw new Error("le segment tiré devait descendre : "+a.y1+" / "+a.y2);
  if(Math.abs(b.x1-20)>0.6||Math.abs(b.y1-14)>0.6)
    throw new Error("le voisin devait s'étirer jusqu'au segment : "+b.x1+","+b.y1);
  if(Math.abs(b.y2-20)>1e-9)throw new Error("l'autre bout du voisin ne devait pas bouger");
  undo();
});
/* Le décor de la capture : une pastille, un 45°, une longue portion droite
   découpée en trois segments par le routeur, un second 45°. */
function pisteEnZ(){
  S.fps=[];S.tracks=[];S.vias=[];touch();   // le décor est nu : on juge la géométrie
  const d ={l:0,net:"T",w:0.3,x1:0, y1:0, x2:10,y2:10};
  const r1={l:0,net:"T",w:0.3,x1:10,y1:10,x2:20,y2:10};
  const r2={l:0,net:"T",w:0.3,x1:20,y1:10,x2:40,y2:10};
  const r3={l:0,net:"T",w:0.3,x1:40,y1:10,x2:50,y2:10};
  const e ={l:0,net:"T",w:0.3,x1:50,y1:10,x2:60,y2:20};
  S.tracks.push(d,r1,r2,r3,e);touch();
  setMode("select");S.active=0;clearSel();
  return {d,r1,r2,r3,e};
}
T("la portion droite entière se déplace, pas le seul morceau tiré",()=>{
  const {d,r1,r2,r3,e}=pisteEnZ();
  S.sel.tracks.add(r2);
  fire("pointerdown",sc(30,10));
  fire("pointermove",sc(30,14));
  fire("pointerup",sc(30,14));
  for(const [nom,t] of [["r1",r1],["r2",r2],["r3",r3]])
    if(Math.abs(t.y1-14)>0.6||Math.abs(t.y2-14)>0.6)
      throw new Error(nom+" devait suivre la portion : "+t.y1+" / "+t.y2);
  if(S.sel.tracks.size!==3)throw new Error("la portion droite devait être prise entière, "+S.sel.tracks.size);
  if(S.sel.tracks.has(d)||S.sel.tracks.has(e))throw new Error("un coude ne fait pas partie de la portion");
  undo();
});
T("les coudes voisins glissent sans changer d'angle",()=>{
  const {d,r1,r3,e,r2}=pisteEnZ();
  const ang=t=>Math.atan2(t.y2-t.y1,t.x2-t.x1);
  const a0=ang(d), a1=ang(e);
  S.sel.tracks.add(r2);
  fire("pointerdown",sc(30,10));
  fire("pointermove",sc(30,14));
  fire("pointerup",sc(30,14));
  if(Math.abs(ang(d)-a0)>1e-6)throw new Error("le 45° de gauche a bougé : "+(ang(d)*180/Math.PI));
  if(Math.abs(ang(e)-a1)>1e-6)throw new Error("le 45° de droite a bougé : "+(ang(e)*180/Math.PI));
  // le coude glisse le long du voisin jusqu'à retomber sur la piste tirée
  if(Math.abs(d.x2-14)>0.6||Math.abs(d.y2-14)>0.6)
    throw new Error("le coude de gauche devait glisser en 14,14 : "+d.x2+","+d.y2);
  if(Math.abs(e.x1-54)>0.6||Math.abs(e.y1-14)>0.6)
    throw new Error("le coude de droite devait glisser en 54,14 : "+e.x1+","+e.y1);
  if(Math.abs(r1.x1-d.x2)>1e-9||Math.abs(r1.y1-d.y2)>1e-9)
    throw new Error("la piste s'est ouverte à gauche");
  if(Math.abs(r3.x2-e.x1)>1e-9||Math.abs(r3.y2-e.y1)>1e-9)
    throw new Error("la piste s'est ouverte à droite");
  if(Math.abs(d.x1)>1e-9||Math.abs(d.y1)>1e-9)throw new Error("le bout sur la pastille ne devait pas bouger");
  if(Math.abs(e.x2-60)>1e-9||Math.abs(e.y2-20)>1e-9)throw new Error("l'autre bout ne devait pas bouger");
  undo();
});
/* Tirer la portion plus loin que la naissance de son coude faisait repartir le
   45° en arrière : la piste se repliait en crochet au-dessus de son départ.
   Sans mur derrière lui, le coude se retourne — son angle intact. */
T("le coude se retourne au lieu de partir en crochet",()=>{
  S.fps=[];S.tracks=[];S.vias=[];touch();
  const d={l:0,net:"T",w:0.3,x1:0,y1:0,x2:10,y2:10};
  const v={l:0,net:"T",w:0.3,x1:10,y1:10,x2:10,y2:30};
  S.tracks.push(d,v);touch();
  setMode("select");S.active=0;clearSel();S.sel.tracks.add(v);
  fire("pointerdown",sc(10,20));
  fire("pointermove",sc(-4,20));
  fire("pointerup",sc(-4,20));
  if(d.y2<d.y1)throw new Error("la piste repart en crochet au-dessus de son départ : "+d.y2);
  if(Math.abs(Math.abs(d.x2-d.x1)-Math.abs(d.y2-d.y1))>1e-9)
    throw new Error("le 45° devait rester un 45° : "+d.x2+","+d.y2);
  if(Math.abs(d.x2+4)>0.6||Math.abs(d.y2-4)>0.6)
    throw new Error("le coude devait passer de l'autre côté : "+d.x2+","+d.y2);
  if(Math.abs(v.x1-d.x2)>1e-9||Math.abs(v.y1-d.y2)>1e-9)throw new Error("la piste s'est ouverte");
  if(Math.abs(d.x1)>1e-9||Math.abs(d.y1)>1e-9)throw new Error("le départ ne devait pas bouger");
  undo();
});
/* Le décor de la capture : une pastille tenue par une horizontale, un 45°, une
   verticale. Tirer la verticale au-delà du 45° doit replier celui-ci et laisser
   l'horizontale tenir le coude — pas dessiner un crochet. */
function pisteEnEquerre(){
  S.fps=[];S.tracks=[];S.vias=[];touch();
  const h={l:0,net:"T",w:0.3,x1:-20,y1:0,x2:0, y2:0};
  const d={l:0,net:"T",w:0.3,x1:0,  y1:0,x2:10,y2:10};
  const v={l:0,net:"T",w:0.3,x1:10, y1:10,x2:10,y2:30};
  S.tracks.push(h,d,v);touch();
  setMode("select");S.active=0;clearSel();S.sel.tracks.add(v);
  return {h,d,v};
}
T("le coude dépassé se replie, le mur suivant prend le relais",()=>{
  const {h,d,v}=pisteEnEquerre();
  fire("pointerdown",sc(10,20));
  fire("pointermove",sc(-4,20));
  fire("pointerup",sc(-4,20));
  if(S.tracks.indexOf(d)>=0)throw new Error("le 45° replié devait disparaître au dépôt");
  if(S.tracks.length!==2)throw new Error("deux segments attendus, "+S.tracks.length);
  if(Math.abs(h.y2)>1e-9)throw new Error("l'horizontale devait rester horizontale : "+h.y2);
  if(Math.abs(h.x2+4)>0.6)throw new Error("l'horizontale devait tenir le coude : "+h.x2);
  if(Math.abs(v.x1-h.x2)>1e-9||Math.abs(v.y1-h.y2)>1e-9)throw new Error("la piste s'est ouverte");
  if(Math.abs(h.x1+20)>1e-9)throw new Error("l'autre bout ne devait pas bouger");
  undo();
});
T("revenir en arrière rend le coude replié",()=>{
  const {h,d,v}=pisteEnEquerre();
  fire("pointerdown",sc(10,20));
  fire("pointermove",sc(-4,20));            // le 45° est mangé
  fire("pointermove",sc(14,20));            // ... et on revient
  fire("pointerup",sc(14,20));
  if(S.tracks.length!==3)throw new Error("les trois segments devaient revenir, "+S.tracks.length);
  if(Math.abs(d.x1)>1e-9||Math.abs(d.y1)>1e-9)
    throw new Error("le coude replié devait retrouver sa place : "+d.x1+","+d.y1);
  if(Math.abs(Math.abs(d.x2-d.x1)-Math.abs(d.y2-d.y1))>1e-9)
    throw new Error("le 45° devait rester un 45° : "+d.x2+","+d.y2);
  if(Math.abs(h.x2)>1e-9)throw new Error("l'horizontale devait retrouver son bout : "+h.x2);
  undo();
});
/* Le décor de la capture : deux 45° pris entre trois horizontales. Tirer
   l'horizontale du milieu par-dessus l'un des coudes laissait son mur suivant
   parallèle au segment tiré — donc sans appui — et l'articulation se contentait
   alors de suivre la souris : le 45° partait de biais, ni droit ni à 45°, en
   travers de la grille. */
function pisteEnZigzag(){
  S.fps=[];S.tracks=[];S.vias=[];touch();
  const h1={l:0,net:"T",w:0.3,x1:10,y1:10,x2:16,y2:10};
  const d1={l:0,net:"T",w:0.3,x1:16,y1:10,x2:20,y2:14};
  const h2={l:0,net:"T",w:0.3,x1:20,y1:14,x2:30,y2:14};
  const d2={l:0,net:"T",w:0.3,x1:30,y1:14,x2:34,y2:18};
  const h3={l:0,net:"T",w:0.3,x1:34,y1:18,x2:44,y2:18};
  S.tracks.push(h1,d1,h2,d2,h3);touch();
  setMode("select");S.active=0;clearSel();S.sel.tracks.add(h2);
  return {h1,d1,h2,d2,h3};
}
/* Aucun segment de biais : tout reste droit ou à 45°. */
function angles(nom){
  for(const t of S.tracks){
    const dx=Math.abs(t.x2-t.x1), dy=Math.abs(t.y2-t.y1);
    if(dx<1e-9||dy<1e-9||Math.abs(dx-dy)<1e-9)continue;
    throw new Error(nom+" : segment de biais ("+t.x1+","+t.y1+") → ("+t.x2+","+t.y2+")");
  }
}
/* Aucune auto-intersection : deux segments qui ne se touchent pas par un bout
   ne doivent pas se croiser. La polyligne qui se recroise — le papillon — est
   interdite par la spec Gerber dans une région G36/G37. */
function croisements(nom){
  const cote=(p,q,r)=>(q.x-p.x)*(r.y-p.y)-(q.y-p.y)*(r.x-p.x);
  const bout=(a,b)=>[[a.x1,a.y1],[a.x2,a.y2]].some(u=>
    [[b.x1,b.y1],[b.x2,b.y2]].some(v=>Math.abs(u[0]-v[0])<1e-9&&Math.abs(u[1]-v[1])<1e-9));
  for(let i=0;i<S.tracks.length;i++)
    for(let j=i+1;j<S.tracks.length;j++){
      const a=S.tracks[i], b=S.tracks[j];
      if(a.l!==b.l||bout(a,b))continue;
      const A={x:a.x1,y:a.y1},B={x:a.x2,y:a.y2},C={x:b.x1,y:b.y1},D={x:b.x2,y:b.y2};
      const d1=cote(C,D,A),d2=cote(C,D,B),d3=cote(A,B,C),d4=cote(A,B,D);
      if(((d1>1e-9&&d2<-1e-9)||(d1<-1e-9&&d2>1e-9))&&
         ((d3>1e-9&&d4<-1e-9)||(d3<-1e-9&&d4>1e-9)))
        throw new Error(nom+" : papillon ("+a.x1+","+a.y1+")→("+a.x2+","+a.y2+
                        ") croise ("+b.x1+","+b.y1+")→("+b.x2+","+b.y2+")");
    }
}
T("par-dessus le coude, le mur parallèle ne casse pas l'angle",()=>{
  const {h1,d1,h2}=pisteEnZigzag();
  fire("pointerdown",sc(25,14));
  for(let i=1;i<=12;i++)fire("pointermove",sc(25,14-i*0.5));
  fire("pointerup",sc(25,8));
  angles("vers le haut");
  if(Math.abs(h2.y1-8)>0.6||Math.abs(h2.y2-8)>0.6)
    throw new Error("le segment tiré devait monter : "+h2.y1+" / "+h2.y2);
  if(Math.abs(h1.y1-10)>1e-9||Math.abs(h1.y2-10)>1e-9)
    throw new Error("l'horizontale d'en face ne devait pas bouger : "+h1.y2);
  if(Math.abs(d1.x1-16)>1e-9||Math.abs(d1.y1-10)>1e-9)
    throw new Error("la naissance du coude ne devait pas bouger : "+d1.x1+","+d1.y1);
  if(Math.abs(d1.x2-h2.x1)>1e-9||Math.abs(d1.y2-h2.y1)>1e-9)throw new Error("la piste s'est ouverte");
  undo();
});
T("le même geste vers le bas garde ses angles",()=>{
  pisteEnZigzag();
  fire("pointerdown",sc(25,14));
  for(let i=1;i<=12;i++)fire("pointermove",sc(25,14+i*0.5));
  fire("pointerup",sc(25,20));
  angles("vers le bas");
  undo();
});
/* Les deux bouts d'une portion glissent chacun le long de son mur, et rien ne
   les empêchait de se croiser : la portion prenait une longueur négative et la
   piste se recroisait au-dessus d'elle-même — le papillon. Quand le
   retournement du coude renverse la portion, c'est l'appui du premier mur,
   au-delà de sa naissance, qui reprend la main : l'angle est gardé et rien ne
   se croise. */
T("la portion tirée ne se renverse pas : pas de papillon",()=>{
  for(const [dx,dy] of [[-16,-16],[-14,-12],[-16,12],[-10,16],[-16,-10]]){
    const {h1,h2,h3}=pisteEnZigzag();
    fire("pointerdown",sc(25,14));
    for(let i=1;i<=8;i++)fire("pointermove",sc(25+dx*i/8,14+dy*i/8));
    croisements(`pendant d=(${dx},${dy})`);
    fire("pointerup",sc(25+dx,14+dy));
    croisements(`après d=(${dx},${dy})`);
    angles(`d=(${dx},${dy})`);
    if(h2.x2<h2.x1)
      throw new Error(`d=(${dx},${dy}) : la portion tirée est à l'envers `+
        `(${h2.x1},${h2.y1})→(${h2.x2},${h2.y2})`);
    if(Math.abs(h1.y1-10)>1e-9||Math.abs(h1.x1-10)>1e-9)
      throw new Error("le bout libre d'en face ne devait pas bouger");
    if(Math.abs(h3.x2-44)>1e-9||Math.abs(h3.y2-18)>1e-9)
      throw new Error("l'autre bout non plus");
    undo();
  }
});
/* Deux 45° qui convergent tiennent une verticale : leurs lignes se rencontrent
   en (10,10). Tirée au-delà, la verticale se retournait entre ses deux murs, qui
   se croisaient alors l'un par-dessus l'autre — le papillon en grand. Aucun
   arrangement de coudes ne rattrape cela : le geste bute, comme sur un obstacle
   d'isolation, et la piste reste lisible. */
function pisteEnEntonnoir(){
  S.fps=[];S.tracks=[];S.vias=[];touch();
  const w1={l:0,net:"T",w:0.3,x1:0,y1:0, x2:5,y2:5};
  const v ={l:0,net:"T",w:0.3,x1:5,y1:5, x2:5,y2:15};
  const w2={l:0,net:"T",w:0.3,x1:5,y1:15,x2:0,y2:20};
  S.tracks.push(w1,v,w2);touch();
  setMode("select");S.active=0;clearSel();S.sel.tracks.add(v);
  return {w1,v,w2};
}
T("la portion tirée bute au lieu de croiser ses deux murs",()=>{
  const {v}=pisteEnEntonnoir();
  fire("pointerdown",sc(5,10));
  for(let x=5.5;x<=8;x+=0.5)fire("pointermove",sc(x,10));
  croisements("avant la rencontre");
  if(Math.abs(v.x1-8)>1e-9||v.y1>=v.y2)
    throw new Error("la verticale devait suivre en se raccourcissant : "+
                    `(${v.x1},${v.y1})→(${v.x2},${v.y2})`);
  for(let x=8.5;x<=20;x+=0.5)fire("pointermove",sc(x,10));
  croisements("au-delà de la rencontre");
  angles("au-delà de la rencontre");
  fire("pointerup",sc(20,10));
  croisements("au dépôt");
  angles("au dépôt");
  if(S.tracks.length!==2)
    throw new Error("le coude devait rester net : "+
      S.tracks.map(t=>`(${t.x1},${t.y1})→(${t.x2},${t.y2})`).join(" "));
  const c=S.tracks.find(t=>Math.abs(t.x2-10)<1e-9&&Math.abs(t.y2-10)<1e-9);
  if(!c)throw new Error("les deux murs devaient se rejoindre en (10,10)");
  undo();
});
/* Le coude mangé laissait ses deux voisins bout à bout dans le même sens : la
   piste repartait en arrière sur son propre cuivre, puis en l'air — le V refermé
   des captures. Au dépôt, le crochet se défait. */
function pisteEnV(){
  S.fps=[];S.tracks=[];S.vias=[];touch();
  const h1={l:0,net:"T",w:0.3,x1:0,y1:0, x2:8, y2:0};
  const d ={l:0,net:"T",w:0.3,x1:8,y1:0, x2:2, y2:-6};      // 45° qui remonte
  const h2={l:0,net:"T",w:0.3,x1:2,y1:-6,x2:10,y2:-6};
  S.tracks.push(h1,d,h2);touch();
  setMode("select");S.active=0;clearSel();S.sel.tracks.add(h2);
  return {h1,d,h2};
}
T("le crochet se défait au dépôt",()=>{
  pisteEnV();
  fire("pointerdown",sc(6,-6));
  for(let i=1;i<=6;i++)fire("pointermove",sc(6-i,-6+i));    // on ramène le haut sur le bas
  fire("pointerup",sc(0,0));
  for(const t of S.tracks)
    for(const e of [1,2])
      if(hookAt(t,e))throw new Error("un crochet est resté");
  if(S.tracks.some(t=>dist(t.x1,t.y1,t.x2,t.y2)<1e-6))throw new Error("un segment mort est resté");
  if(S.tracks.length!==1)throw new Error("il ne devait rester qu'un segment, "+S.tracks.length);
  const t=S.tracks[0];
  if(Math.abs(t.y1)>1e-9||Math.abs(t.y2)>1e-9)throw new Error("la piste devait rester d'aplomb");
  const x1=Math.min(t.x1,t.x2), x2=Math.max(t.x1,t.x2);
  if(Math.abs(x1)>1e-9||Math.abs(x2-4)>1e-9)
    throw new Error("le cuivre en double devait partir, pas la liaison : "+x1+" → "+x2);
  undo();
});
/* Le routeur refuse d'avancer sous l'isolation ; le glissement, lui, ne
   regardait rien : on traversait un boîtier entier sans un mot, et seul le DRC,
   après coup, le disait. */
function pisteSurBoitier(){
  S.fps=[];S.tracks=[];S.vias=[];S.zones=[];clearSel();
  const u=mkFp("U9","NE555","DIP-8",8);
  u.x=40;u.y=20;u.nets={1:"GND",2:"N$2",3:"N$1",8:"+5V"};
  S.fps.push(u);
  const t={l:0,net:"AUTRE",w:0.3,x1:30,y1:12,x2:50,y2:12};   // au-dessus du boîtier
  S.tracks.push(t);touch();
  setMode("select");S.active=0;clearSel();S.sel.tracks.add(t);
  return {u,t};
}
function glisseSur(t,de,vers){
  fire("pointerdown",sc(de.x,de.y));
  for(let i=1;i<=16;i++)
    fire("pointermove",sc(de.x+(vers.x-de.x)*i/16,de.y+(vers.y-de.y)*i/16));
  fire("pointerup",sc(vers.x,vers.y));
}
T("une piste tirée bute sur les pastilles d'un autre net",()=>{
  const {t}=pisteSurBoitier();
  glisseSur(t,{x:40,y:12},{x:40,y:18.7});    // 18,73 : la rangée du haut, net N$2
  if(segClearBad(t,0,t.net,t.w,null))
    throw new Error("la piste s'est posée sous l'isolation : y="+t.y1);
  if(Math.abs(t.y1-12)<1e-9)throw new Error("elle devait tout de même avancer jusqu'à l'obstacle");
  undo();
});
T("anti-collision coupée : le geste passe quand même",()=>{
  const {t}=pisteSurBoitier();
  S.avoid=false;
  glisseSur(t,{x:40,y:12},{x:40,y:20});
  S.avoid=true;
  if(Math.abs(t.y1-20)>0.6)throw new Error("sans anti-collision, rien ne doit retenir : "+t.y1);
  undo();
});
/* Une carte déjà en faute doit rester réparable : sinon le geste se fige et
   l'on ne peut plus sortir la piste de là où elle n'aurait jamais dû être. */
T("une piste déjà en faute peut encore être déplacée",()=>{
  const {t}=pisteSurBoitier();
  t.y1=t.y2=18.73;touch();                 // posée en plein sur une rangée
  if(!segClearBad(t,0,t.net,t.w,null))throw new Error("le décor voulait une faute");
  glisseSur(t,{x:40,y:18.73},{x:40,y:17.5});
  if(Math.abs(t.y1-18.73)<1e-9)throw new Error("le geste s'est figé sur une faute d'avant");
  undo();
});
T("un bout de piste tiré bute aussi sur l'obstacle",()=>{
  const {t}=pisteSurBoitier();
  clearSel();S.sel.tracks.add(t);
  glisseSur(t,{x:t.x2,y:t.y2},{x:43.81,y:18.73});   // droit sur la pastille 7
  if(segClearBad(t,0,t.net,t.w,null))
    throw new Error("le bout s'est posé sous l'isolation : "+t.x2+","+t.y2);
  undo();
});
T("Alt pendant le glissement détache le voisin",()=>{
  S.tracks=[];S.vias=[];touch();
  const a={l:0,net:"T",w:0.3,x1:10,y1:10,x2:20,y2:10};
  const b={l:0,net:"T",w:0.3,x1:20,y1:10,x2:20,y2:20};
  S.tracks.push(a,b);touch();
  setMode("select");S.active=0;
  clearSel();S.sel.tracks.add(a);
  const mid={x:(a.x1+a.x2)/2,y:a.y1};
  fire("pointerdown",sc(mid.x,mid.y));
  fire("pointermove",Object.assign(sc(mid.x,mid.y+4),{altKey:true}));
  fire("pointerup",sc(mid.x,mid.y+4));
  if(Math.abs(a.y1-14)>0.6)throw new Error("le segment tiré devait descendre : "+a.y1);
  if(Math.abs(b.y1-10)>1e-9)throw new Error("Alt devait laisser le voisin en place : "+b.y1);
  undo();
});
T("une ligne droite qui change de couche reste droite",()=>{
  if(S.cu<2)setCuCount(2);
  S.fps=[];S.tracks=[];S.vias=[];touch();
  const a={l:0,net:"T",w:0.3,x1:10,y1:10,x2:20,y2:10};
  const b={l:1,net:"T",w:0.3,x1:20,y1:10,x2:30,y2:10};
  S.tracks.push(a,b);
  const v={x:20,y:10,d:0.8,drill:0.4,a:0,b:1,net:"T"};
  S.vias.push(v);touch();
  setMode("select");S.active=0;
  clearSel();S.sel.tracks.add(a);
  fire("pointerdown",sc(15,10));
  fire("pointermove",sc(15,14));
  fire("pointerup",sc(15,14));
  if(Math.abs(v.y-14)>0.6)throw new Error("le via devait suivre : "+v.y);
  // le via n'interrompt pas la ligne : la laisser derrière la coucherait
  if(Math.abs(b.y1-14)>0.6||Math.abs(b.y2-14)>0.6)
    throw new Error("la piste de l'autre couche devait suivre en entier : "+b.y1+" / "+b.y2);
  undo();
});
T("au via, la piste perpendiculaire glisse au lieu de basculer",()=>{
  if(S.cu<2)setCuCount(2);
  S.fps=[];S.tracks=[];S.vias=[];touch();
  const a={l:0,net:"T",w:0.3,x1:10,y1:10,x2:20,y2:10};
  const b={l:1,net:"T",w:0.3,x1:20,y1:10,x2:20,y2:30};   // repart à 90°
  S.tracks.push(a,b);
  const v={x:20,y:10,d:0.8,drill:0.4,a:0,b:1,net:"T"};
  S.vias.push(v);touch();
  setMode("select");S.active=0;
  clearSel();S.sel.tracks.add(a);
  fire("pointerdown",sc(15,10));
  fire("pointermove",sc(15,14));
  fire("pointerup",sc(15,14));
  if(S.sel.tracks.has(b))throw new Error("un coude ne fait pas partie de la portion droite");
  if(Math.abs(b.x1-20)>1e-9||Math.abs(b.x2-20)>1e-9)
    throw new Error("la piste perpendiculaire a basculé : "+b.x1+" / "+b.x2);
  if(Math.abs(b.y1-14)>0.6)throw new Error("elle devait glisser jusqu'à la ligne : "+b.y1);
  if(Math.abs(b.y2-30)>1e-9)throw new Error("son autre bout ne devait pas bouger");
  if(Math.abs(v.y-14)>0.6)throw new Error("le via devait suivre le coude : "+v.y);
  undo();
});
/* Garde-fou : un glissement ne doit jamais créer d'angle bâtard. Une ligne
   droite se trouve coupée par tout ce qu'elle rencontre — pastille traversée,
   via, embranchement, changement de largeur ; si un morceau restait en
   arrière, il basculerait de travers faute d'intersection à calculer. */
function surGrille(t){
  const a=((Math.atan2(t.y2-t.y1,t.x2-t.x1)*180/Math.PI)%180+180)%180;
  return [0,45,90,135,180].some(k=>Math.abs(a-k)<1e-6);
}
function glisseSansBiais(nom,build,from,to){
  T("aucun angle bâtard : "+nom,()=>{
    const g=build();
    setMode("select");S.active=0;clearSel();
    S.sel.tracks.add(g.pick);
    fire("pointerdown",sc(from.x,from.y));
    fire("pointermove",sc(to.x,to.y));
    fire("pointerup",sc(to.x,to.y));
    for(const t of S.tracks)
      if(!surGrille(t))
        throw new Error("segment de travers ("+t.x1+","+t.y1+")→("+t.x2+","+t.y2+")");
    undo();
  });
}
glisseSansBiais("ligne droite traversant une pastille",()=>{
  S.fps=[];S.tracks=[];S.vias=[];S.zones=[];
  const f=mkFp("R6","0R0","0603",2);f.x=30;f.y=10;
  S.fps.push(f);
  const q=padsWorld(f)[0];
  const h1={l:0,net:"T",w:0.3,x1:10,y1:q.y,x2:q.x,y2:q.y};
  const h2={l:0,net:"T",w:0.3,x1:q.x,y1:q.y,x2:50,y2:q.y};
  const d ={l:0,net:"T",w:0.3,x1:50,y1:q.y,x2:60,y2:q.y+10};
  S.tracks.push(h1,h2,d);touch();
  return {pick:h2};
},{x:45,y:10},{x:45,y:14});
glisseSansBiais("ligne droite changeant de largeur",()=>{
  S.fps=[];S.tracks=[];S.vias=[];S.zones=[];
  S.tracks.push({l:0,net:"T",w:0.5,x1:10,y1:10,x2:30,y2:10},
                {l:0,net:"T",w:0.3,x1:30,y1:10,x2:50,y2:10},
                {l:0,net:"T",w:0.3,x1:50,y1:10,x2:60,y2:20});
  touch();
  return {pick:S.tracks[1]};
},{x:40,y:10},{x:40,y:14});
glisseSansBiais("ligne droite passant par un via",()=>{
  if(S.cu<2)setCuCount(2);
  S.fps=[];S.tracks=[];S.vias=[];S.zones=[];
  S.tracks.push({l:0,net:"T",w:0.3,x1:10,y1:10,x2:30,y2:10},
                {l:0,net:"T",w:0.3,x1:30,y1:10,x2:50,y2:10},
                {l:0,net:"T",w:0.3,x1:50,y1:10,x2:60,y2:20});
  S.vias.push({x:30,y:10,d:0.8,drill:0.4,a:0,b:1,net:"T"});
  touch();
  return {pick:S.tracks[1]};
},{x:40,y:10},{x:40,y:14});
glisseSansBiais("ligne droite avec un embranchement",()=>{
  S.fps=[];S.tracks=[];S.vias=[];S.zones=[];
  S.tracks.push({l:0,net:"T",w:0.3,x1:10,y1:10,x2:30,y2:10},
                {l:0,net:"T",w:0.3,x1:30,y1:10,x2:50,y2:10},
                {l:0,net:"T",w:0.3,x1:30,y1:10,x2:30,y2:25});
  touch();
  return {pick:S.tracks[1]};
},{x:40,y:10},{x:40,y:14});
T("l'embranchement reste d'aplomb et se raccourcit",()=>{
  S.fps=[];S.tracks=[];S.vias=[];S.zones=[];
  const h1={l:0,net:"T",w:0.3,x1:10,y1:10,x2:30,y2:10};
  const h2={l:0,net:"T",w:0.3,x1:30,y1:10,x2:50,y2:10};
  const br={l:0,net:"T",w:0.3,x1:30,y1:10,x2:30,y2:25};
  S.tracks.push(h1,h2,br);touch();
  setMode("select");S.active=0;clearSel();S.sel.tracks.add(h2);
  fire("pointerdown",sc(40,10));
  fire("pointermove",sc(40,14));
  fire("pointerup",sc(40,14));
  if(Math.abs(h1.y1-14)>0.6||Math.abs(h1.y2-14)>0.6)
    throw new Error("la ligne droite devait suivre en entier : "+h1.y1+" / "+h1.y2);
  if(Math.abs(br.x1-30)>1e-9||Math.abs(br.x2-30)>1e-9)
    throw new Error("l'embranchement a basculé : "+br.x1+" / "+br.x2);
  if(Math.abs(br.y1-14)>0.6)throw new Error("l'embranchement devait se raccourcir : "+br.y1);
  if(Math.abs(br.y2-25)>1e-9)throw new Error("son autre bout ne devait pas bouger");
  undo();
});

/* ---------------- adoucir un angle droit : le coude passe en 45° ---------- */
T("angle droit adouci en 45°",()=>{
  S.fps=[];S.tracks=[];S.vias=[];S.zones=[];
  const h={l:0,net:"T",w:0.3,x1:0, y1:0,x2:20,y2:0};
  const v={l:0,net:"T",w:0.3,x1:20,y1:0,x2:20,y2:30};
  S.tracks.push(h,v);touch();
  setMode("select");S.active=0;clearSel();S.sel.tracks.add(h);
  if(mitreSel()!==1)throw new Error("un angle droit devait être adouci");
  const dia=S.tracks.find(t=>Math.abs(Math.abs(t.x2-t.x1)-Math.abs(t.y2-t.y1))<1e-6
                             &&Math.abs(t.x2-t.x1)>1e-6);
  if(!dia)throw new Error("aucune diagonale posée");
  const a=Math.abs(Math.atan2(dia.y2-dia.y1,dia.x2-dia.x1)*180/Math.PI);
  if(Math.abs(a-45)>1e-6&&Math.abs(a-135)>1e-6)
    throw new Error("la diagonale n'est pas à 45° : "+a);
  // la portion courte (20 mm) est entièrement consommée, l'autre raccourcie
  if(S.tracks.length!==2)throw new Error("2 segments attendus, "+S.tracks.length);
  const rest=S.tracks.find(t=>t!==dia);
  if(Math.abs(rest.x1-20)>1e-9||Math.abs(rest.x2-20)>1e-9)
    throw new Error("la portion restante devait rester verticale");
  if(Math.abs(Math.min(rest.y1,rest.y2)-20)>1e-9)
    throw new Error("elle devait repartir de 20 mm : "+Math.min(rest.y1,rest.y2));
  undo();
});
T("l'angle droit s'adoucit depuis n'importe quel morceau de la portion",()=>{
  S.fps=[];S.tracks=[];S.vias=[];S.zones=[];
  const h1={l:0,net:"T",w:0.3,x1:0, y1:0,x2:10,y2:0};
  const h2={l:0,net:"T",w:0.3,x1:10,y1:0,x2:20,y2:0};
  const v ={l:0,net:"T",w:0.3,x1:20,y1:0,x2:20,y2:30};
  S.tracks.push(h1,h2,v);touch();
  setMode("select");S.active=0;clearSel();S.sel.tracks.add(h1);   // le morceau loin du coude
  if(mitreSel()!==1)throw new Error("le coude de la portion devait être trouvé");
  undo();
});
/* Le chanfrein recule d'autant des deux côtés — c'est ce qui fait le 45°. La
   portion la plus longue gardait donc l'écart des deux longueurs : un reste de
   onze centièmes sous une piste de trois dixièmes, l'écharde que le tracé
   s'interdit maintenant de poser. */
T("le chanfrein ne laisse pas d'écharde derrière lui",()=>{
  S.fps=[];S.tracks=[];S.vias=[];S.zones=[];
  const h={l:0,net:"T",w:0.3,x1:0,   y1:0,x2:5.11,y2:0};
  const v={l:0,net:"T",w:0.3,x1:5.11,y1:0,x2:5.11,y2:5};
  S.tracks.push(h,v);touch();
  setMode("select");S.active=0;clearSel();S.sel.tracks.add(h);
  if(mitreSel()!==1)throw new Error("l'angle droit devait être adouci");
  for(const t of S.tracks){
    const L=Math.hypot(t.x2-t.x1,t.y2-t.y1);
    if(L<t.w-1e-9)
      throw new Error("écharde de "+L.toFixed(3)+" mm : "+JSON.stringify(t));
    if(!angleOk(t.x2-t.x1,t.y2-t.y1))
      throw new Error("segment de biais : "+JSON.stringify(t));
  }
  // un chanfrein plus court que la piste ne veut rien dire
  S.tracks=[{l:0,net:"T",w:0.3,x1:0,y1:0,x2:0.2,y2:0},
            {l:0,net:"T",w:0.3,x1:0.2,y1:0,x2:0.2,y2:0.2}];
  touch();clearSel();S.sel.tracks.add(S.tracks[0]);
  if(mitreSel()!==0)throw new Error("un chanfrein sous la largeur de piste se refuse");
  undo();
});
T("un 45° déjà en place n'est pas retouché",()=>{
  S.fps=[];S.tracks=[];S.vias=[];S.zones=[];
  const a={l:0,net:"T",w:0.3,x1:0, y1:0, x2:20,y2:0};
  const b={l:0,net:"T",w:0.3,x1:20,y1:0, x2:30,y2:10};
  S.tracks.push(a,b);touch();
  setMode("select");S.active=0;clearSel();S.sel.tracks.add(a);
  const n=S.tracks.length;
  if(mitreSel()!==0)throw new Error("un 45° n'est pas un angle droit");
  if(S.tracks.length!==n)throw new Error("rien ne devait changer");
});
/* Un champ garde ses lettres pour lui — sans quoi taper « 0,3 » dans l'isolation
   basculerait de couche. Mais le canevas n'est pas focusable : cliquer dessus ne
   retirait pas le focus du dernier réglage touché, et les raccourcis d'une seule
   touche restaient muets pour le reste de la séance. D ne cassait plus aucun
   angle droit, et rien ne le disait. */
T("cliquer le plan de travail rend les raccourcis d'une touche",()=>{
  S.fps=[];S.tracks=[];S.vias=[];S.zones=[];
  const a={l:0,net:"T",w:0.3,x1:0, y1:0, x2:20,y2:0};
  const b={l:0,net:"T",w:0.3,x1:20,y1:0, x2:20,y2:20};
  S.tracks.push(a,b);touch();
  setMode("select");S.active=0;clearSel();S.sel.tracks.add(a);
  /* le champ « isolation » du panneau Règles : celui qu'on touche juste avant
     de revenir router */
  const champ=document.createElement("input");
  champ.focus();
  if(!/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName))
    throw new Error("le banc d'essai ne modélise pas le focus");
  const n=S.tracks.length;
  key("d");
  if(S.tracks.length!==n)throw new Error("un champ focusé doit garder la touche D");
  // le clic sur le plan de travail rend la main aux raccourcis
  fire("pointerdown",sc(-40,-40));fire("pointerup",sc(-40,-40));
  clearSel();S.sel.tracks.add(a);
  key("d");
  // deux jambes de même longueur : le chanfrein les mange, il reste la diagonale
  if(S.tracks.length!==1||Math.abs(S.tracks[0].x2-S.tracks[0].y2)>1e-9)
    throw new Error("D devait adoucir l'angle droit après un clic sur le canevas : "+
                    JSON.stringify(S.tracks.map(t=>[t.x1,t.y1,t.x2,t.y2])));
});
/* Le sommet déplacé à la main était le dernier endroit d'où sortait un angle
   bâtard : les deux jambes partaient de biais, ni droites ni à 45°. Le geste
   reste libre, mais les places d'aplomb sont magnétiques. */
T("l'aimant angulaire redresse le sommet tiré",()=>{
  S.fps=[];S.tracks=[];S.vias=[];S.zones=[];touch();
  S.avoid=false;setMode("select");S.active=0;S.grid=0.1;
  const h={l:0,net:"T",w:0.3,x1:0, y1:0,x2:10,y2:0};
  const v={l:0,net:"T",w:0.3,x1:10,y1:0,x2:10,y2:10};
  S.tracks.push(h,v);touch();clearSel();S.sel.tracks.add(h);
  fire("pointerdown",sc(10,0));
  fire("pointermove",sc(0.2,9.9));            // près d'une place d'aplomb : (0,10)
  fire("pointerup",sc(0.2,9.9));
  if(Math.abs(h.x2)>1e-9||Math.abs(h.y2-10)>1e-9)
    throw new Error("le sommet devait s'aimanter sur (0,10) : "+h.x2+","+h.y2);
  for(const t of [h,v])
    if(!angleOk(t.x2-t.x1,t.y2-t.y1))
      throw new Error("jambe bâtarde : "+JSON.stringify(t));
  // un bout libre se projette sur le rail le plus proche des huit
  S.tracks=[{l:0,net:"T",w:0.3,x1:0,y1:0,x2:10,y2:0}];
  const t=S.tracks[0];
  touch();clearSel();S.sel.tracks.add(t);
  fire("pointerdown",sc(10,0));
  fire("pointermove",sc(14.2,0.2));
  fire("pointerup",sc(14.2,0.2));
  if(Math.abs(t.y2)>1e-9||Math.abs(t.x2-14.2)>1e-9)
    throw new Error("le bout devait revenir sur l'axe : "+t.x2+","+t.y2);
  // loin de toute place d'aplomb, le geste reste libre
  fire("pointerdown",sc(t.x2,t.y2));
  fire("pointermove",sc(18,5));
  fire("pointerup",sc(18,5));
  if(Math.abs(t.x2-18)>1e-9||Math.abs(t.y2-5)>1e-9)
    throw new Error("hors de portée de l'aimant, le point suit la souris : "+
                    t.x2+","+t.y2);
});
/* Ce que l'aimant ne peut pas empêcher — deux bouts fixes ne laissent pas
   toujours de place d'aplomb — le contrôle le dit avant l'export. */
T("le DRC signale l'angle bâtard",()=>{
  const keep=serialize();
  S.fps=[];S.vias=[];S.zones=[];
  S.tracks=[{l:0,net:"A",w:0.3,x1:0, y1:0,x2:10,y2:0},
            {l:0,net:"A",w:0.3,x1:10,y1:0,x2:20,y2:6.25}];      // 32°
  touch();
  const e=runDrc().filter(x=>/hors des huit sens/.test(x.msg));
  if(e.length!==1)throw new Error("un seul segment de biais attendu : "+e.length);
  if(!/32,?\.?0°|32.0°/.test(e[0].msg))throw new Error("l'angle devait être dit : "+e[0].msg);
  setCornerMode("free");
  if(runDrc().some(x=>/hors des huit sens/.test(x.msg)))
    throw new Error("en angle libre, c'est un choix : le contrôle se tait");
  setCornerMode("45");
  loadDoc(JSON.parse(keep),true);
});
T("découpe d'un segment (Alt+clic)",()=>{
  S.tracks=[{l:0,net:"T",w:0.3,x1:10,y1:10,x2:20,y2:10},
            {l:0,net:"T",w:0.3,x1:20,y1:10,x2:20,y2:20}];
  S.vias=[];touch();
  const a=S.tracks[0], n=S.tracks.length;
  clearSel();S.sel.tracks.add(a);
  const pt={x:(a.x1+a.x2)/2,y:(a.y1+a.y2)/2};
  fire("pointerdown",Object.assign(sc(pt.x,pt.y),{altKey:true}));
  fire("pointerup",sc(pt.x,pt.y));
  if(S.tracks.length!==n+1)throw new Error("un segment aurait dû naître");
  if(Math.abs(a.x2-pt.x)>1e-6)throw new Error("le segment d'origine devait s'arrêter au point");
});
T("segment réduit à un point : supprimé",()=>{
  const n=S.tracks.length, t=S.tracks[0];
  clearSel();S.sel.tracks.add(t);
  fire("pointerdown",sc(t.x2,t.y2));
  fire("pointermove",sc(t.x1,t.y1));
  fire("pointerup",sc(t.x1,t.y1));
  if(S.tracks.length!==n-1)throw new Error("le segment nul devait disparaître");
});
T("opérations sur tout le net",()=>{
  S.tracks=[];touch();
  for(let i=0;i<4;i++)S.tracks.push({l:0,net:"BUS",w:0.3,x1:i*5,y1:0,x2:i*5+4,y2:0});
  S.vias.push({x:2,y:0,d:0.8,drill:0.4,a:0,b:1,net:"BUS"});
  touch();
  selectNetRouting("BUS");
  if(S.sel.tracks.size!==4||S.sel.vias.size!==1)throw new Error("sélection du net incomplète");
  deleteNetRouting("BUS");
  if(S.tracks.length||S.vias.length)throw new Error("le net devait être dérouté");
});
T("couches de masque et de pâte",()=>{
  S.fps=[];S.tracks=[];S.vias=[];S.zones=[];touch();
  setCuCount(2);
  S.board={x:0,y:0,w:40,h:30};
  const cms=mkFp("R1","10k","0603",2);            // puce : pastilles CMS dessus
  cms.style="chip";cms.x=10;cms.y=10;cms.nets={1:"N1",2:"GND"};
  const dip=mkFp("U1","NE555","DIP-8",8);         // DIP : trous traversants
  dip.style="dip";dip.x=25;dip.y=15;dip.nets={1:"GND",8:"+5V"};
  const bot=mkFp("C1","100n","0603",2);
  bot.style="chip";bot.side=1;bot.x=10;bot.y=22;bot.nets={1:"GND",2:"+5V"};
  S.fps.push(cms,dip,bot);touch();
  const mT=maskOpenings(0), mB=maskOpenings(1);
  if(mT.length!==2+8)throw new Error("masque dessus : 10 ouvertures attendues, "+mT.length);
  if(mB.length!==2+8)throw new Error("masque dessous : 10 attendues, "+mB.length);
  const pT=pasteOpenings(0), pB=pasteOpenings(1);
  if(pT.length!==2)throw new Error("pâte dessus : seules les 2 pastilles CMS, "+pT.length);
  if(pB.length!==2)throw new Error("pâte dessous : les 2 pastilles de C1, "+pB.length);
  if(pT.some(o=>o.q.drill>0))throw new Error("pas de pâte dans un trou métallisé");
  // les vias suivent le réglage de recouvrement
  S.vias.push({x:20,y:20,d:0.8,drill:0.4,a:0,b:1,net:"GND"});touch();
  S.rule.viaFinish="tented";
  if(maskOpenings(0).length!==10)throw new Error("via recouvert : pas d'ouverture");
  S.rule.viaFinish="open";
  if(maskOpenings(0).length!==11)throw new Error("via ouvert : une ouverture de plus");
  for(const k of ["tented","plugged","filled"]){
    S.rule.viaFinish=k;
    if(!viaTented())throw new Error(k+" : le masque devrait rester fermé");
    if(maskOpenings(0).length!==10)throw new Error(k+" : ouverture de trop");
  }
  S.rule.viaFinish="tented";
  // dilatation effective
  S.rule.mask=0.06;
  if(Math.abs(maskOpenings(0)[0].grow-0.06)>1e-9)throw new Error("dilatation non appliquée");
});
T("police à traits",()=>{
  const s1=textStrokes("R1",0,0,1.2,false);
  if(!s1.length)throw new Error("aucun trait produit");
  if(s1.some(p=>p.length<2))throw new Error("polyligne dégénérée");
  const mir=textStrokes("R1",0,0,1.2,true);
  if(mir.length!==s1.length)throw new Error("le miroir doit produire autant de traits");
  if(Math.abs(mir[0][0].x+s1[0][0].x)>1e-9)throw new Error("miroir non symétrique");
});
T("Gerber : entête, ouvertures, unités",()=>{
  const g=gerberCopper(0);
  if(!/^G04 /.test(g))throw new Error("entête absente");
  if(g.indexOf("%FSLAX46Y46*%")<0)throw new Error("format de coordonnées manquant");
  if(g.indexOf("%MOMM*%")<0)throw new Error("unité millimétrique manquante");
  if(g.indexOf("%TF.FileFunction,Copper,L1,Top*%")<0)throw new Error("attribut de fonction manquant");
  if(!/M02\*\s*$/.test(g))throw new Error("fin de fichier manquante");
  const ad=(g.match(/%ADD\d+[^%]+%/g)||[]);
  if(!ad.length)throw new Error("aucune ouverture définie");
  if((g.match(/D03\*/g)||[]).length!==10+1)
    throw new Error("une éclosion par pastille et par via attendue");
  // toute ouverture utilisée doit avoir été définie
  const nums=new Set(ad.map(x=>+x.match(/%ADD(\d+)/)[1]));
  for(const m of g.match(/^D(\d+)\*$/gm)||[])
    if(!nums.has(+m.match(/D(\d+)/)[1]))throw new Error("ouverture "+m+" non définie");
});
T("Gerber : zone en polarité négative",()=>{
  S.zones.push({id:1,l:0,net:"GND",pts:boardZonePts()});
  S.tracks.push({l:0,net:"N1",w:0.3,x1:5,y1:5,x2:35,y2:25});
  touch();
  const g=gerberCopper(0);
  if(g.indexOf("G36*")<0||g.indexOf("G37*")<0)throw new Error("région de zone absente");
  if(g.indexOf("%LPC*%")<0)throw new Error("dégagements en polarité négative absents");
  if(g.lastIndexOf("%LPD*%")<g.lastIndexOf("%LPC*%"))
    throw new Error("le cuivre doit être redessiné après les dégagements");
});
T("Gerber : masque, pâte, sérigraphie, contour",()=>{
  if(gerberMask(0).indexOf("Soldermask,Top")<0)throw new Error("fonction du masque");
  if(gerberPaste(1).indexOf("Paste,Bot")<0)throw new Error("fonction de la pâte");
  const sk=gerberSilk(0);
  if(sk.indexOf("Legend,Top")<0)throw new Error("fonction de la sérigraphie");
  if((sk.match(/D01\*/g)||[]).length<8)throw new Error("contours et texte attendus");
  const ed=gerberEdge();
  if(ed.indexOf("Profile,NP")<0)throw new Error("fonction du contour");
  if((ed.match(/D01\*/g)||[]).length!==4)throw new Error("le contour a quatre côtés");
});
T("perçage Excellon",()=>{
  const d=drillFile();
  if(d.text.indexOf("M48")!==0)throw new Error("entête M48");
  if(d.text.indexOf("METRIC,TZ")<0)throw new Error("unité manquante");
  if(!/T1C[\d.]+/.test(d.text))throw new Error("aucun outil");
  if(d.text.indexOf("M30")<0)throw new Error("fin de fichier");
  if(d.holes!==8+1)throw new Error("8 trous du DIP + 1 via, "+d.holes);
  // origine au coin inférieur gauche : plus de coordonnée négative
  const xs=d.text.match(/^X(-?[\d.]+)Y(-?[\d.]+)$/gm)||[];
  if(!xs.length)throw new Error("aucune coordonnée");
  if(xs.some(l=>/-/.test(l)))throw new Error("coordonnée négative : origine mal placée");
});
T("dossier de fabrication complet",()=>{
  const {files,drill}=buildFabFiles();
  const names=files.map(f=>f.name);
  for(const n of ["carte.GTL","carte.GBL","carte.GTS","carte.GBS",
                  "carte.GTP","carte.GBP","carte.GTO","carte.GBO",
                  "carte.GKO","carte.TXT","LISEZ-MOI.txt"])
    if(names.indexOf(n)<0)throw new Error("fichier manquant : "+n+" — obtenus : "+names.join(" "));
  if(files.some(f=>!f.text||!f.text.length))throw new Error("fichier vide");
  if(drill.tools<1)throw new Error("aucun outil de perçage");
  // 4 couches : autant de fichiers cuivre (GTL, GL2, GL3, GBL)
  setCuCount(4);
  const f4=buildFabFiles().files.filter(f=>/\.(GTL|GBL|GL\d+)$/.test(f.name));
  if(f4.length!==4)throw new Error("4 fichiers cuivre attendus, "+f4.length);
  setCuCount(2);
});
T("archive ZIP",()=>{
  if(crc32(new TextEncoder().encode("123456789"))!==0xCBF43926)
    throw new Error("CRC32 faux");
  const b=zipBlob([{name:"a.txt",text:"bonjour"},{name:"b.txt",text:"monde"}]);
  if(!b)throw new Error("archive non produite");
});
let savedDoc=null;
T("contour de carte à main levée",()=>{
  savedDoc=serialize();          // ces essais repartent d'une carte neuve
  S.fps=[];S.tracks=[];S.vias=[];S.zones=[];touch();
  setCuCount(2);S.board={x:0,y:0,w:40,h:30,pts:null};
  if(boardPoly().length!==4)throw new Error("le rectangle donne quatre sommets");
  setMode("edge");
  // un L : on retire le coin supérieur droit
  edgeClick(0,0);edgeClick(20,0);edgeMove(20,15);edgeClick(20,15);
  edgeClick(40,15);edgeClick(40,30);edgeClick(0,30);
  if(S.edgeDraft.pts.length!==6)throw new Error("6 sommets attendus");
  edgeClick(0,0);                       // retour au premier point : fermeture
  if(S.edgeDraft)throw new Error("le contour aurait dû se fermer");
  if(!S.board.pts||S.board.pts.length!==6)throw new Error("contour non enregistré");
  if(Math.abs(S.board.w-40)>1e-6||Math.abs(S.board.h-30)>1e-6)
    throw new Error("l'emprise devrait suivre le contour : "+S.board.w+"x"+S.board.h);
  if(!S.sel.edge)throw new Error("le contour devrait être sélectionné après fermeture");
  // l'échancrure est bien hors carte, le reste dedans
  if(inBoard(35,5,0))throw new Error("le coin retiré doit être hors carte");
  if(!inBoard(10,10,0))throw new Error("le corps de la carte doit être dedans");
  if(inBoard(0.1,0.1,1))throw new Error("la marge de bord doit être respectée");
  setMode("select");
});
T("le contour pilote zones, DRC et Gerber",()=>{
  // une zone pleine carte épouse le contour
  S.cuL[0].plane=true;S.cuL[0].net="GND";syncAutoZones();
  const z=S.zones.find(o=>o.auto);
  if(!z||z.pts.length!==6)throw new Error("le plan devrait reprendre les 6 sommets");
  // un via dans l'échancrure est signalé
  S.vias.push({x:35,y:5,d:0.8,drill:0.4,a:0,b:1,net:"GND"});touch();
  if(!runDrc().some(e=>/hors du contour/.test(e.msg)))
    throw new Error("le via hors contour devrait être signalé");
  S.vias.pop();touch();
  // le remplissage lui-même s'arrête au contour : rien de cuivré dans l'échancrure
  if(realCanvas){
    const M=zoneMask(0,"GND");
    if(!M)throw new Error("masque non calculé");
    if(maskAt(M,35,5))throw new Error("l'échancrure ne doit pas être cuivrée");
    if(!maskAt(M,10,20))throw new Error("le corps de la carte doit l'être");
    if(maskAt(M,0.1,0.1))throw new Error("la marge de bord doit rester nue");
  }
  const ed=gerberEdge();
  if((ed.match(/D01\*/g)||[]).length!==6)throw new Error("le contour Gerber a six côtés");
  const g=gerberCopper(0);
  if(g.indexOf("%LPC*%")<0)throw new Error("rognage du plan absent");
  // l'entaille de la région extérieure referme bien le contour
  if((g.match(/G36\*/g)||[]).length<2)throw new Error("région de rognage absente");
  S.cuL[0].plane=false;syncAutoZones();
});
T("redimensionner et revenir au rectangle",()=>{
  const before=S.board.pts.map(p=>({x:p.x,y:p.y}));
  setBoardSize(80,30);
  if(Math.abs(S.board.w-80)>1e-6)throw new Error("largeur non appliquée");
  if(Math.abs(S.board.pts[1].x-before[1].x*2)>0.01)
    throw new Error("le contour libre devrait être mis à l'échelle");
  if(S.board.pts.length!==6)throw new Error("la mise à l'échelle ne change pas le dessin");
  setBoardRect();
  if(S.board.pts)throw new Error("retour au rectangle raté");
  if(boardPoly().length!==4)throw new Error("le rectangle englobant fait quatre sommets");
  if(!inBoard(70,5,0))throw new Error("le rectangle recouvre l'ancienne échancrure");
  S.board={x:0,y:0,w:40,h:30,pts:null};boardChanged();
  loadDoc(JSON.parse(savedDoc),true);
});
T("orientation des contours",()=>{
  const cw=[{x:0,y:0},{x:1,y:0},{x:1,y:1},{x:0,y:1}];
  const a=orient(cw,true), b=orient(cw,false);
  if(Math.sign(signedArea(a))===Math.sign(signedArea(b)))
    throw new Error("les deux sens devraient s'opposer");
  if(a.length!==cw.length)throw new Error("l'orientation ne perd pas de sommet");
});
T("origine utilisateur",()=>{
  savedDoc=serialize();        // ces trois essais repartent d'une carte neuve
  S.fps=[];S.tracks=[];S.vias=[];S.zones=[];touch();
  setCuCount(2);S.board={x:0,y:0,w:60,h:40,pts:null};boardChanged();
  S.origin={x:0,y:0};S.grid=0.5;
  placeOrigin(10.2,6.3);
  if(Math.abs(S.origin.x-10)>1e-9||Math.abs(S.origin.y-6.5)>1e-9)
    throw new Error("origine mal arrondie : "+S.origin.x+";"+S.origin.y);
  if(Math.abs(ux(15)-5)>1e-9||Math.abs(uy(6.5))>1e-9)throw new Error("conversion en coordonnées utilisateur");
  if(Math.abs(wxu(5)-15)>1e-9)throw new Error("conversion inverse");
  // la grille s'accroche à l'origine, pas au zéro absolu
  if(Math.abs(snapX(15.1)-15)>1e-9)throw new Error("accrochage sur la grille d'origine");
  if(Math.abs(snapY(6.4)-6.5)>1e-9)throw new Error("accrochage Y : "+snapY(6.4));
  // une pastille proche attire l'origine
  const f=mkFp("J1","","",2);f.style="row";f.x=30;f.y=20;S.fps.push(f);touch();
  const q=padsWorld(f)[0];
  placeOrigin(q.x+0.05,q.y+0.05);
  if(Math.abs(S.origin.x-q.x)>1e-9||Math.abs(S.origin.y-q.y)>1e-9)
    throw new Error("l'origine devrait se poser sur la pastille");
  // repère des fichiers de fabrication
  S.fabOrigin=false;
  if(Math.abs(gOrigin().y-(S.board.y+S.board.h))>1e-9)throw new Error("repère carte");
  S.fabOrigin=true;
  if(Math.abs(gOrigin().x-S.origin.x)>1e-9)throw new Error("repère utilisateur");
  const d=drillFile();
  if(d.text.indexOf("X0.000Y0.000")<0&&!/X-?0\./.test(d.text))
    throw new Error("le perçage devrait suivre l'origine choisie");
  S.fabOrigin=false;S.origin={x:0,y:0};touch();
});
T("saisie de coordonnées : absolu, relatif, polaire",()=>{
  S.fps=[];S.tracks=[];S.vias=[];touch();
  S.origin={x:5,y:5};
  setMode("track");
  coordOpen();
  if(!S.coord.open)throw new Error("la boîte devrait s'ouvrir");
  coordMode("abs");
  document.getElementById("ciA").value="10";
  document.getElementById("ciB").value="4";
  coordApply();
  if(!S.route)throw new Error("le tracé devrait démarrer");
  if(Math.abs(S.route.pt.x-15)>1e-9||Math.abs(S.route.pt.y-9)>1e-9)
    throw new Error("point absolu faux : "+S.route.pt.x+";"+S.route.pt.y);
  coordMode("rel");
  document.getElementById("ciA").value="10";
  document.getElementById("ciB").value="0";
  coordApply();
  if(Math.abs(S.route.pt.x-25)>1e-9||Math.abs(S.route.pt.y-9)>1e-9)
    throw new Error("point relatif faux : "+S.route.pt.x+";"+S.route.pt.y);
  coordMode("pol");
  document.getElementById("ciA").value="5";
  document.getElementById("ciB").value="90";        // 90° = vers le haut de l'écran
  coordApply();
  if(Math.abs(S.route.pt.x-25)>1e-9||Math.abs(S.route.pt.y-4)>1e-9)
    throw new Error("point polaire faux : "+S.route.pt.x+";"+S.route.pt.y);
  commitRoute();
  if(!S.tracks.length)throw new Error("les segments saisis doivent être posés");
  const ends=S.tracks.map(t=>t.x2+","+t.y2);
  if(ends.indexOf("25,4")<0)throw new Error("le dernier point n'a pas été posé : "+ends.join(" "));
  coordClose();
  if(S.coord.open)throw new Error("la boîte devrait se fermer");
});
T("saisie de coordonnées : zone, contour, empreinte",()=>{
  setMode("zone");
  coordOpen();coordMode("abs");
  const put=(a,b)=>{document.getElementById("ciA").value=String(a);
                    document.getElementById("ciB").value=String(b);coordApply();};
  put(0,0);put(20,0);put(20,10);
  if(!S.zoneDraft||S.zoneDraft.pts.length!==3)throw new Error("3 sommets saisis attendus");
  if(Math.abs(S.zoneDraft.pts[1].x-25)>1e-9)throw new Error("sommet mal placé");
  closeZone();zoneDialog("");
  setMode("edge");
  coordOpen();coordMode("abs");
  put(0,0);put(30,0);put(30,20);put(0,20);
  closeEdge();
  if(!S.board.pts||S.board.pts.length!==4)throw new Error("contour saisi non enregistré");
  if(Math.abs(S.board.w-30)>1e-6)throw new Error("emprise du contour saisi");
  // une empreinte sélectionnée se place aussi au clavier
  const f=S.fps[0]||mkFp("J1","","",2);
  if(!S.fps.length)S.fps.push(f);
  setMode("select");clearSel();S.sel.fps.add(f.id);
  coordOpen();coordMode("abs");put(12,7);
  if(Math.abs(f.x-17)>1e-9||Math.abs(f.y-12)>1e-9)
    throw new Error("empreinte mal positionnée : "+f.x+";"+f.y);
  coordClose();
  S.origin={x:0,y:0};
  loadDoc(JSON.parse(savedDoc),true);
});
let savedAvoid=null;
T("raccourcis et retour à la sélection",()=>{
  savedAvoid=serialize();
  setMode("select");
  key("t");if(S.mode!=="track")throw new Error("T devrait passer en tracé");
  key("v");if(S.mode!=="via")throw new Error("V devrait passer en via");
  key("z");if(S.mode!=="zone")throw new Error("Z devrait passer en zone");
  key("Escape");if(S.mode!=="select")throw new Error("Échap devrait rendre la sélection");
  // V pose un via quand un tracé est en cours, au lieu de changer d'outil
  setMode("track");S.tracks=[];S.vias=[];touch();
  startRoute(5,5,true);
  const n=S.vias.length;
  key("v");
  if(S.vias.length!==n+1)throw new Error("V devrait poser un via pendant le tracé");
  if(S.mode!=="track")throw new Error("l'outil ne doit pas changer pendant le tracé");
  key("Escape");
  if(S.route)throw new Error("Échap devrait clore le tracé");
  if(S.mode!=="select")throw new Error("puis revenir à la sélection");
  S.vias=[];touch();
});
T("anti-collision au tracé",()=>{
  S.fps=[];S.tracks=[];S.vias=[];S.zones=[];touch();
  setCuCount(2);S.board={x:0,y:0,w:60,h:40,pts:null};boardChanged();
  setActive(0);S.avoid=true;
  const cl=classOf("SIG").clr;
  // une piste étrangère en travers de la route
  S.tracks.push({l:0,net:"AUTRE",w:0.4,x1:20,y1:0,x2:20,y2:40});
  touch();
  setMode("track");
  startRoute(10,20,true);
  S.route.net="SIG";S.route.w=0.3;
  // viser pile sur l'obstacle : le point doit être repoussé au-delà de l'isolation
  updateRoute(20,20);
  const e=S.route.end;
  if(!e.pushed)throw new Error("le point aurait dû être repoussé");
  const d=Math.abs(e.x-20)-0.2-0.15;
  if(d<cl-1e-3)throw new Error("isolation non respectée après repoussage : "+fmt(d,3));
  // et le trajet qui traverse reste refusé
  routeToPoint({x:30,y:20});
  if(!S.route.bad)throw new Error("un trajet qui traverse doit être signalé");
  const before=S.tracks.length;
  stepRoute();
  if(S.tracks.length!==before)throw new Error("un trajet en défaut ne doit pas se poser");
  if(S.route.done.length)throw new Error("aucun segment ne doit être retenu");
  // même net : aucun obstacle
  S.route.net="AUTRE";
  routeToPoint({x:30,y:20});
  if(S.route.bad)throw new Error("son propre net n'est pas un obstacle");
  // anti-collision coupé : plus rien ne retient
  S.route.net="SIG";S.avoid=false;
  routeToPoint({x:30,y:20});
  if(S.route.bad)throw new Error("anti-collision coupé : plus de refus");
  stepRoute();
  if(!S.route.done.length)throw new Error("le trajet forcé doit passer");
  S.avoid=true;cancelRoute();
});
T("halo sur les pastilles du net suivi",()=>{
  S.fps=[];touch();
  const f=mkFp("J1","","",3);f.style="row";f.x=20;f.y=20;
  f.nets={1:"SIG",2:"GND",3:"SIG"};
  S.fps.push(f);touch();
  S.hlNet=null;S.route=null;
  if(focusNet())throw new Error("aucun net suivi par défaut");
  S.hlNet="SIG";
  if(focusNet()!=="SIG")throw new Error("le net choisi dans la liste est suivi");
  S.hlNet=null;
  setMode("track");startRoute(20,20,true);
  if(focusNet()!=="SIG"&&focusNet()!=="GND")
    throw new Error("le net du tracé est suivi : "+focusNet());
  cancelRoute();setMode("select");
  draw();
  loadDoc(JSON.parse(savedAvoid),true);
});
T("clic sur une pastille : son net remonte dans la liste",()=>{
  /* Pendant du clic sur la liste : le canevas désigne un net, l'onglet Nets
     revient au premier plan et la ligne porte la mise en avant — même si le
     filtre « non routés » l'aurait masquée. */
  const saved=serialize();
  S.fps=[];S.tracks=[];S.vias=[];touch();
  const f=mkFp("J9","","",2);f.style="row";f.x=20;f.y=20;
  f.nets={1:"SIG_A",2:"SIG_B"};
  S.fps.push(f);touch();
  setMode("select");clearSel();S.hlNet=null;
  S.listTab="comps";S.onlyUnrouted=false;buildList();
  const q=padsWorld(f).find(x=>x.n===2);
  fire("pointerdown",sc(q.x,q.y));
  fire("pointerup",sc(q.x,q.y));
  if(S.hlNet!=="SIG_B")
    throw new Error("le net de la pastille doit être mis en avant : "+S.hlNet);
  if(S.listTab!=="nets")
    throw new Error("la liste doit revenir sur l'onglet Nets : "+S.listTab);
  if(!/<tr data-net="SIG_B" class="on"/.test($("list").innerHTML))
    throw new Error("la ligne du net doit porter la mise en avant");
  S.onlyUnrouted=true;buildList();
  if(!/<tr data-net="SIG_B" class="on"/.test($("list").innerHTML))
    throw new Error("le filtre ne doit pas escamoter la ligne mise en avant");
  S.onlyUnrouted=false;S.hlNet=null;
  loadDoc(JSON.parse(saved),true);
  S.listTab="nets";buildList();
});
T("croisement de pistes",()=>{
  const keep=serialize();
  const a={x1:0,y1:10,x2:20,y2:10}, b={x1:10,y1:0,x2:10,y2:20};
  if(segSegDist(a,b)!==0)throw new Error("deux pistes qui se croisent sont à distance nulle");
  const c={x1:0,y1:0,x2:5,y2:0}, d={x1:0,y1:2,x2:5,y2:2};
  if(Math.abs(segSegDist(c,d)-2)>1e-9)throw new Error("deux parallèles gardent leur écart");
  S.fps=[];S.vias=[];S.zones=[];
  S.tracks=[{l:0,net:"A",w:0.3,x1:0,y1:10,x2:20,y2:10},
            {l:0,net:"B",w:0.3,x1:10,y1:0,x2:10,y2:20}];
  touch();
  if(!runDrc().some(e=>/piste\/piste/.test(e.msg)))
    throw new Error("le croisement devrait être signalé par le DRC");
  loadDoc(JSON.parse(keep),true);
});
T("DRC",()=>{
  const e=runDrc();
  if(!Array.isArray(e))throw new Error("pas de liste");
  if(!e.some(x=>x.info))throw new Error("les liaisons manquantes devraient être signalées");
});
T("panneaux",()=>{
  // l'essai fournit ses propres objets : les précédents ont pu les consommer
  if(!S.tracks.length)S.tracks.push({l:0,net:"GND",w:0.3,x1:2,y1:2,x2:9,y2:2});
  if(!S.vias.length)S.vias.push({x:5,y:5,d:0.8,drill:0.4,a:0,b:S.cu-1,net:"GND"});
  if(!S.zones.length)S.zones.push({id:S.nextId++,l:0,net:"GND",pts:boardZonePts()});
  touch();
  buildTabs();buildLayers();buildRules();refreshPanels();
  clearSel();S.sel.tracks.add(S.tracks[0]);S.sel.tracks.add(S.tracks[0]);buildProps();
  clearSel();S.sel.zones.add(S.zones[0]);buildProps();
  S.listTab="comps";buildList();
  S.listTab="drc";buildList();
  S.listTab="nets";buildList();
  clearSel();S.sel.fps.add(S.fps[0].id);buildProps();
  clearSel();S.sel.tracks.add(S.tracks[0]);buildProps();
  clearSel();S.sel.vias.add(S.vias[0]);buildProps();
  clearSel();buildProps();
});
T("sélection et transformations",()=>{
  const fp=S.fps[0];
  clearSel();S.sel.fps.add(fp.id);
  const r=fp.rot;rotateSel();
  if(fp.rot===r)throw new Error("rotation sans effet");
  flipSel();
  if(!fp.side)throw new Error("retournement sans effet");
  const pads=padsWorld(fp);
  if(!pads.length)throw new Error("pastilles perdues");
});
T("annuler / rétablir",()=>{
  const n=S.tracks.length;
  push();S.tracks.push({l:0,net:"",w:.3,x1:0,y1:0,x2:5,y2:0});touch();
  undo();
  if(S.tracks.length!==n)throw new Error("annulation incorrecte : "+S.tracks.length+" ≠ "+n);
  redo();
  if(S.tracks.length!==n+1)throw new Error("rétablissement incorrect");
  undo();
});
T("dessin complet",()=>{draw();});
T("vue dessous + contraste",()=>{
  setFlip(true);draw();
  setContrast(2);draw();
  setContrast(0);setFlip(false);draw();
});
T("export png / json",()=>{
  exportPng();
  const d=JSON.parse(serialize());
  if(d.format!=="pcbedit-1")throw new Error("format faux");
  loadDoc(d,true);
});
T("réduction de l'empilage",()=>{
  setCuCount(2);
  for(const t of S.tracks)if(t.l>1)throw new Error("piste sur une couche disparue");
  for(const v of S.vias)if(v.b>1)throw new Error("via hors empilage");
});
T("clavier et souris",()=>{
  key("v");key("p");key("x");key("g");key("n");key("y");key("h");key("y");key("h");key("v");
  fire("pointerdown",{clientX:100,clientY:100});
  fire("pointermove",{clientX:140,clientY:120});
  fire("pointerup",{clientX:140,clientY:120});
  key("Escape");
});
T("placement auto",()=>{autoPlace(20);draw();});
T("réimport (fusion)",()=>{
  const before=S.fps.map(f=>({r:f.ref,x:f.x,y:f.y}));
  importNetlist(NET,false);
  if(S.fps.length!==4)throw new Error("doublons créés : "+S.fps.length);
  const u=S.fps.find(f=>f.ref==="U1"), b=before.find(f=>f.r==="U1");
  if(u.x!==b.x||u.y!==b.y)throw new Error("position perdue au réimport");
});
/* ==========================================================================
   Échappement HTML : une netlist ou un document .json malveillant
   Le grammaire de la netlist borne les repères (^[A-Za-z_][\w$-]*) mais laisse
   libres la valeur, le boîtier et le nom de net : ce sont eux qu'on éprouve.
   Tout ce qui finit dans innerHTML doit passer par esc().
   ========================================================================== */
const XSS='<img src=x onerror=pan()>';
const XSS_Q='"><img src=x onerror="pan()">';
function assertPropre(html,quoi){
  /* une injection réussie produit forcément un « < » non échappé : c'est le
     seul indice à chercher — la charge échappée, elle, contient encore le
     texte « onerror= » sans le moindre danger. */
  if(html.indexOf("<img")>=0||html.indexOf("<svg")>=0)
    throw new Error(quoi+" : balise injectée telle quelle");
}
/* la charge doit se retrouver échappée, sinon l'essai ne prouve rien */
function assertPresent(html,quoi){
  if(html.indexOf("&lt;img")<0&&html.indexOf("&lt;svg")<0)
    throw new Error(quoi+" : la charge n'apparaît pas, l'essai ne prouve rien");
}
T("esc() couvre les caractères dangereux",()=>{
  const got=esc('<&>"\'`');
  if(got!=="&lt;&amp;&gt;&quot;&#39;&#96;")throw new Error("échappement : "+got);
});
T("netlist malveillante : panneaux et listes restent propres",()=>{
  const nl="=== Composants ===\n"+
           "    R1      "+XSS+"      <svg onload=pan()>\n\n"+
           "=== Feuille 1 — Principale ===\n\n"+
           'NET "'+XSS+'"\n'+
           "    R1.1\n"+
           "    R1.2\n";
  importNetlist(nl,true);
  if(!S.fps.length)throw new Error("la netlist n'a pas été acceptée : essai vide");
  const fp=S.fps.find(f=>f.ref==="R1");
  if(!fp||fp.value.indexOf("<img")<0)throw new Error("la valeur n'a pas été reprise");
  if(!netTable().some(n=>n.name.indexOf("<img")>=0))
    throw new Error("le nom de net n'a pas été repris");
  buildRules();buildLayers();buildTabs();
  S.listTab="comps";buildList();
  assertPropre($("list").innerHTML,"liste des composants");
  assertPresent($("list").innerHTML,"liste des composants");
  S.listTab="nets";buildList();
  assertPropre($("list").innerHTML,"liste des nets");
  assertPresent($("list").innerHTML,"liste des nets");
  runDrc();S.listTab="drc";buildList();
  assertPropre($("list").innerHTML,"liste DRC");
  clearSel();S.sel.fps.add(fp.id);buildProps();
  assertPropre($("props").innerHTML,"propriétés d'empreinte");
  assertPresent($("props").innerHTML,"propriétés d'empreinte");
  clearSel();buildProps();
  assertPropre($("props").innerHTML,"panneau vide");
});
T("document .json trafiqué : les textes libres arrivent échappés",()=>{
  /* repères, valeurs, boîtiers, noms de couche, de classe et de net sont
     libres par nature : normDoc les laisse passer (tronqués), ce sont les
     panneaux qui doivent les échapper. */
  const doc=JSON.parse(serialize());
  doc.cuL=doc.cuL.map(L=>Object.assign({},L,{name:XSS_Q,net:XSS_Q}));
  doc.classes=[{name:XSS_Q,w:0.3,clr:0.25,via:0.8,drill:0.4},
               {name:"Alimentation",w:0.6,clr:0.25,via:0.9,drill:0.45}];
  doc.netClass={};
  doc.netClass[XSS_Q]="Alimentation";
  if(doc.fps&&doc.fps.length){
    doc.fps[0].ref=XSS_Q;doc.fps[0].value=XSS_Q;doc.fps[0].pkg=XSS_Q;
    doc.fps[0].nets={1:XSS_Q};
  }
  if(doc.tracks&&doc.tracks.length)doc.tracks[0].net=XSS_Q;
  if(doc.vias&&doc.vias.length)doc.vias[0].net=XSS_Q;
  loadDoc(doc,true);
  if(S.cuL[0].name.indexOf("<img")<0)throw new Error("nom de couche non repris : essai vide");
  if(S.classes[0].name.indexOf("<img")<0)throw new Error("nom de classe non repris");
  buildLayers();buildTabs();buildRules();
  assertPropre($("layers").innerHTML,"empilage");
  assertPresent($("layers").innerHTML,"empilage");
  assertPropre($("rules").innerHTML,"règles de tracé");
  assertPresent($("rules").innerHTML,"règles de tracé");
  S.listTab="comps";buildList();
  assertPropre($("list").innerHTML,"liste des composants");
  S.listTab="nets";buildList();
  assertPropre($("list").innerHTML,"liste des nets");
  if(S.fps.length){
    clearSel();S.sel.fps.add(S.fps[0].id);buildProps();
    assertPropre($("props").innerHTML,"propriétés d'empreinte");
    assertPresent($("props").innerHTML,"propriétés d'empreinte");
  }
  if(S.tracks.length){
    clearSel();S.sel.tracks.add(S.tracks[0]);buildProps();
    assertPropre($("props").innerHTML,"propriétés de piste");
  }
  if(S.vias.length){
    clearSel();S.sel.vias.add(S.vias[0]);buildProps();
    assertPropre($("props").innerHTML,"propriétés de via");
  }
  clearSel();buildProps();
});

/* ==========================================================================
   Import défensif (normDoc)
   Ce qui n'est pas un texte libre est ramené dans ses bornes dès l'entrée :
   pas de couche inexistante, de largeur négative ni de couleur qui n'en est pas.
   ========================================================================== */
T("import : une couleur de couche qui n'en est pas est refusée",()=>{
  const doc=JSON.parse(serialize());
  doc.cuL[0].color='#123';                 // notation courte : légitime
  doc.cuL[1].color='red; background:url(x)';
  loadDoc(doc,true);
  if(S.cuL[0].color!=="#123")throw new Error("la notation courte devait passer");
  if(!/^#[0-9a-fA-F]{6}$/.test(S.cuL[1].color))
    throw new Error("couleur non reprise en main : "+S.cuL[1].color);
});
T("import : indices de couche, largeurs et diamètres bornés",()=>{
  const doc=JSON.parse(serialize());
  doc.cu=4;
  doc.cuL=[{},{},{},{}];
  doc.tracks=[{l:99,net:"A",w:-3,x1:0,y1:0,x2:10,y2:0},
              {l:1,net:"B",w:0.3,x1:5,y1:5,x2:5,y2:5},      // segment nul
              {l:"2",net:"C",w:"0.4",x1:"0",y1:"1",x2:"9",y2:"1"}];
  doc.vias=[{x:1,y:1,d:-5,drill:99,a:7,b:7,net:"A"}];
  doc.zones=[{id:1,l:50,net:"A",pts:[{x:0,y:0},{x:1,y:0}]},  // 2 sommets
             {id:2,l:1,net:"B",pts:[{x:0,y:0},{x:5,y:0},{x:5,y:5}]}];
  loadDoc(doc,true);
  if(S.tracks.length!==2)throw new Error("2 pistes exploitables attendues, "+S.tracks.length);
  const t0=S.tracks[0];
  if(t0.l<0||t0.l>3)throw new Error("indice de couche hors empilage : "+t0.l);
  if(!(t0.w>0))throw new Error("largeur négative acceptée : "+t0.w);
  const t1=S.tracks[1];
  if(t1.l!==2||Math.abs(t1.w-0.4)>1e-9)
    throw new Error("chaînes numériques mal converties : "+t1.l+" / "+t1.w);
  if(typeof t1.x2!=="number")throw new Error("coordonnée restée en chaîne");
  const v=S.vias[0];
  if(!(v.d>0))throw new Error("diamètre négatif accepté : "+v.d);
  if(!(v.drill<v.d))throw new Error("perçage plus large que le via : "+v.drill+"/"+v.d);
  if(v.a===v.b)throw new Error("un via doit relier deux couches distinctes");
  if(v.a<0||v.b>3)throw new Error("via hors empilage : "+v.a+"→"+v.b);
  if(S.zones.length!==1)throw new Error("la zone à 2 sommets devait être écartée");
});
T("import : identifiants uniques et nextId au-dessus",()=>{
  const doc=JSON.parse(serialize());
  doc.fps=[{ref:"R1",pins:2,id:5},{ref:"R2",pins:2,id:5},{ref:"R3",pins:2,id:"x"}];
  doc.nextId=1;
  loadDoc(doc,true);
  const ids=S.fps.map(f=>f.id);
  if(new Set(ids).size!==ids.length)throw new Error("identifiants en doublon : "+ids);
  if(ids.some(i=>!Number.isInteger(i)||i<1))throw new Error("identifiant non entier : "+ids);
  if(S.nextId<=Math.max(...ids))throw new Error("nextId sous les identifiants existants");
  // la sélection par identifiant retrouve bien l'empreinte
  clearSel();S.sel.fps.add(S.fps[0].id);buildProps();
  if($("props").innerHTML.indexOf("R1")<0)throw new Error("empreinte introuvable par son id");
});
T("import : un document vide ou absurde ne casse rien",()=>{
  loadDoc({},true);
  if(S.cu!==2||S.cuL.length!==2)throw new Error("empilage par défaut attendu");
  if(S.fps.length||S.tracks.length)throw new Error("carte vide attendue");
  if(!S.classes.length)throw new Error("il faut au moins une classe");
  draw();runDrc();buildLayers();buildRules();refreshPanels();buildList();
  loadDoc({cu:"beaucoup",cuL:"non",fps:"non",tracks:{},vias:null,zones:0,
           board:"grande",rule:[],classes:[],netClass:"x",active:-4},true);
  if(S.cu<1||S.cu>8)throw new Error("nombre de couches hors bornes : "+S.cu);
  if(S.cuL.length!==S.cu)throw new Error("empilage incohérent");
  if(S.active<0||S.active>=S.cu)throw new Error("couche active hors empilage : "+S.active);
  draw();runDrc();buildLayers();buildRules();refreshPanels();buildList();
});
T("import : rattachement de classe orphelin écarté",()=>{
  const doc=JSON.parse(serialize());
  doc.classes=[{name:"Défaut",w:0.3,clr:0.25,via:0.8,drill:0.4},
               {name:"Alimentation",w:0.6,clr:0.25,via:0.9,drill:0.45}];
  doc.netClass={GND:"Alimentation","+5V":"Classe disparue",SIG:"Défaut"};
  loadDoc(doc,true);
  if(S.netClass["GND"]!=="Alimentation")throw new Error("rattachement valide perdu");
  if(S.netClass["+5V"])throw new Error("rattachement orphelin conservé");
  if(S.netClass["SIG"])throw new Error("le rattachement par défaut ne se stocke pas");
  if(classOf("+5V").name!=="Défaut")throw new Error("classe de repli inattendue");
});
T("import : deux classes de même nom sont distinguées",()=>{
  const doc=JSON.parse(serialize());
  doc.classes=[{name:"Défaut",w:0.3,clr:0.25,via:0.8,drill:0.4},
               {name:"Défaut",w:0.9,clr:0.25,via:0.8,drill:0.4}];
  doc.netClass={};
  loadDoc(doc,true);
  const names=S.classes.map(c=>c.name);
  if(new Set(names).size!==names.length)throw new Error("noms en doublon : "+names);
  // sans quoi classOf() renverrait toujours la première et l'autre serait morte
  if(S.classes.length!==2)throw new Error("2 classes attendues, "+S.classes.length);
});
T("import : neutre sur un document produit par l'éditeur",()=>{
  /* loadDoc() sert aussi à annuler/rétablir : la normalisation ne doit RIEN
     changer à un document que l'éditeur a lui-même écrit, sinon chaque Ctrl+Z
     déformerait la carte. */
  /* les essais précédents ont pu renommer les classes : on repart d'un jeu
     connu, sinon le rattachement ci-dessous serait orphelin */
  S.classes=[{name:"Défaut",w:0.3,clr:0.25,via:0.8,drill:0.4},
             {name:"Alimentation",w:0.6,clr:0.25,via:0.9,drill:0.45}];
  S.netClass={};
  importNetlist(NET,true);
  setCuCount(4);
  S.board={x:0,y:0,w:80,h:60,pts:null};
  S.origin={x:2,y:3};S.fabOrigin=true;
  S.fps.forEach((f,i)=>{f.x=10+i*15;f.y=20;f.rot=(i%2)?90:0;f.side=i%2;});
  S.fps[0].refOffX=1.5;S.fps[0].refOffY=-2;
  S.fps[0].pins=2;S.fps[0].nets={1:"GND",2:"+5V",3:"RESTE"};  // clé au-delà de pins
  S.tracks=[{l:0,net:"GND",w:0.35,x1:1,y1:1,x2:20,y2:1},
            {l:2,net:"+5V",w:0.6,x1:2,y1:5,x2:2,y2:30}];
  S.vias=[{x:2,y:5,d:0.8,drill:0.4,a:0,b:3,net:"+5V"}];
  S.zones=[{id:S.nextId++,l:1,net:"GND",pts:boardZonePts()}];
  S.cuts=[{id:S.nextId++,l:1,pts:[{x:5,y:5},{x:15,y:5},{x:15,y:15}]}];
  S.cuL[1].custom=true;S.cuL[1].name="Masse";S.cuL[1].color="#12ab34";
  setNetClass("+5V","Alimentation");
  S.rule.viaFinish="plugged";S.rule.mask=0.06;
  touch();
  const a=docObj();
  loadDoc(JSON.parse(JSON.stringify(a)),true);
  const b=docObj();
  const diff=firstDiff(a,b,"doc");
  if(diff)throw new Error("l'aller-retour a modifié le document : "+diff);
  // et le second aller-retour non plus : la normalisation est idempotente
  loadDoc(JSON.parse(JSON.stringify(b)),true);
  const c=firstDiff(b,docObj(),"doc");
  if(c)throw new Error("second aller-retour instable : "+c);
});
/* ==========================================================================
   Empilage physique et rôles de couche
   ========================================================================== */
T("empilage physique : les modèles d'usine tombent sur leur épaisseur",()=>{
  for(const pr of STACK_PRESETS){
    setCuCount(pr.n);
    if(!applyPreset(pr))throw new Error("modèle refusé : "+pr.name);
    if(S.stack.cu.length!==pr.n)throw new Error(pr.name+" : "+S.stack.cu.length+" cuivres");
    if(S.stack.di.length!==Math.max(1,pr.n-1))
      throw new Error(pr.name+" : "+S.stack.di.length+" diélectriques");
    const e=Math.abs(stackTotal()-pr.th);
    if(e>0.02)throw new Error(pr.name+" : "+stackTotal()+" mm au lieu de "+pr.th);
    if(!stackSym())throw new Error(pr.name+" : modèle asymétrique");
  }
  setCuCount(4);
});
T("empilage physique : le compte de couches l'entraîne",()=>{
  setCuCount(2);
  S.stack.target=1;S.stack.cu[0].t=0.07;stackFit();
  const t0=S.stack.cu[0].t;
  setCuCount(6);
  if(S.stack.cu.length!==6)throw new Error("6 cuivres attendus, "+S.stack.cu.length);
  if(S.stack.di.length!==5)throw new Error("5 diélectriques attendus, "+S.stack.di.length);
  if(Math.abs(S.stack.cu[0].t-t0)>1e-9)throw new Error("le cuivre extérieur devait être gardé");
  if(Math.abs(S.stack.target-1)>1e-9)throw new Error("l'épaisseur visée devait être gardée");
  if(Math.abs(stackTotal()-1)>0.02)
    throw new Error("les diélectriques devaient se répartir : "+stackTotal());
  setCuCount(1);
  if(S.stack.cu.length!==1||S.stack.di.length!==1)
    throw new Error("une simple face garde une âme : "+S.stack.cu.length+"/"+S.stack.di.length);
  if(maskFaces()!==1)throw new Error("une simple face n'a qu'une face vernie");
  setCuCount(4);
});
T("empilage physique : répartir, symétriser",()=>{
  setCuCount(4);applyPreset(presetsFor(4)[0]);
  S.stack.target=2.4;
  if(!stackFit())throw new Error("répartition refusée");
  if(Math.abs(stackTotal()-2.4)>0.02)throw new Error("cible manquée : "+stackTotal());
  if(!stackSym())throw new Error("une répartition proportionnelle reste symétrique");
  S.stack.di[0].t=0.4;
  if(stackSym())throw new Error("l'asymétrie devrait être vue");
  stackMirror();
  if(!stackSym())throw new Error("symétrisation ratée");
  // le cuivre à lui seul dépasse la cible : la répartition refuse plutôt que d'inventer
  S.stack.target=0.05;
  if(stackFit())throw new Error("cible inatteignable acceptée");
  S.stack.target=1.6;stackFit();
});
T("empilage physique : perçages et rapport d'aspect",()=>{
  setCuCount(4);applyPreset(presetsFor(4)[0]);
  const lam=stackLam();
  if(Math.abs(stackSpan(0,3)-lam)>1e-9)
    throw new Error("un via traversant fait toute l'épaisseur : "+stackSpan(0,3)+"/"+lam);
  if(!(stackSpan(0,1)<stackSpan(0,3)))throw new Error("un via borgne est plus court");
  S.fps=[];S.vias=[{x:5,y:5,d:0.8,drill:0.4,a:0,b:3,net:"GND"},
                   {x:8,y:5,d:0.5,drill:0.25,a:0,b:1,net:"GND"}];
  touch();
  const a=worstAspect();
  if(!a)throw new Error("aucun rapport d'aspect calculé");
  if(Math.abs(a.ratio-lam/0.4)>1e-6)
    throw new Error("le via traversant devrait être le plus défavorable : "+a.ratio);
  // le panneau Propriétés d'un via rend compte de la longueur percée
  clearSel();S.sel.vias.add(S.vias[1]);buildProps();
  const h=$("props").innerHTML;
  if(h.indexOf("rapport d'aspect")<0)throw new Error("rapport d'aspect absent du via");
  if(h.indexOf(fmt(stackSpan(0,1),3))<0)
    throw new Error("un via borgne devrait annoncer sa longueur percée : "+h);
  clearSel();
  S.vias=[];touch();
  if(worstAspect())throw new Error("sans perçage, pas de rapport d'aspect");
});
T("panneau d'empilage : lignes de coupe et échappement",()=>{
  setCuCount(4);applyPreset(presetsFor(4)[0]);
  const rows=stackRows();
  // sérigraphie, masque, 4 cuivres, 3 diélectriques, masque, sérigraphie
  if(rows.length!==11)throw new Error("11 lignes attendues, "+rows.length);
  if(rows[0].kind!=="silk"||rows[rows.length-1].kind!=="silk")
    throw new Error("la coupe commence et finit par la sérigraphie");
  if(rows[1].kind!=="mask")throw new Error("le masque vient sous la sérigraphie");
  if(rows.filter(r=>r.kind==="cu").length!==4)throw new Error("4 cuivres dans la coupe");
  if(rowT(rows[0])!==0)throw new Error("la sérigraphie ne pèse rien dans l'épaisseur");
  if(Math.abs(rowT(rows[2])-S.stack.cu[0].t)>1e-9)throw new Error("épaisseur de ligne fausse");
  setCuCount(1);
  if(stackRows().filter(r=>r.kind==="mask").length!==1)
    throw new Error("une simple face n'a qu'un masque dans sa coupe");
  if(stackRows().filter(r=>r.kind==="silk").length!==1)
    throw new Error("une simple face n'a qu'une sérigraphie dans sa coupe");
  setCuCount(4);
  S.cuL[1].name='Masse <img src=x onerror="pan()">';S.cuL[1].custom=true;
  S.stack.di[0].mat='FR-4 <script>pan()</script>';
  buildStackup();
  const h=$("stk").innerHTML;
  if(h.indexOf("<img")>=0||h.indexOf("<script")>=0)
    throw new Error("nom de couche ou matière injecté tel quel");
  if(h.indexOf("&lt;img")<0)throw new Error("nom de couche non échappé");
  if(h.indexOf("&lt;script")<0)throw new Error("matière non échappée");
  // une ligne de tableau par élément de la coupe, plus le pied
  if((h.match(/data-r="/g)||[]).length!==stackRows().length)
    throw new Error("le tableau ne compte pas une ligne par élément");
  for(const c of ["Nom","Matière","Rôle","Poids","Dk","Df"])
    if(h.indexOf(">"+c+"<")<0)throw new Error("colonne manquante : "+c);
  if(h.indexOf("Épaisseur totale")<0)throw new Error("total absent du pied de tableau");
  if(h.indexOf(fmt(stackTotal(),3))<0)throw new Error("épaisseur totale non affichée");
  S.cuL[1].name="Inner 1";S.cuL[1].custom=false;S.stack.di[0].mat="FR-4";
});
T("panneau d'empilage : les champs modifient l'empilage et s'annulent",()=>{
  setCuCount(4);applyPreset(presetsFor(4)[0]);
  buildStackup();
  const before=S.stack.cu[0].t;
  // la ligne choisie par défaut est le premier cuivre
  $("skT").value="70";$("skT").onchange();
  if(Math.abs(S.stack.cu[0].t-0.07)>1e-9)
    throw new Error("cuivre non repris : "+S.stack.cu[0].t);
  undo();
  if(Math.abs(S.stack.cu[0].t-before)>1e-9)
    throw new Error("l'annulation n'a pas rendu l'empilage : "+S.stack.cu[0].t);
  // une saisie illisible ne casse rien
  buildStackup();
  $("skT").value="beaucoup";$("skT").onchange();
  if(!(S.stack.cu[0].t>0))throw new Error("épaisseur détruite par une saisie illisible");
  // « autre… » passe par une invite ; le banc la laisse sans réponse
  const t1=S.stack.cu[0].t;
  buildStackup();
  $("skT").value="autre";$("skT").onchange();
  if(Math.abs(S.stack.cu[0].t-t1)>1e-9)
    throw new Error("invite sans réponse : l'épaisseur ne doit pas bouger");
  // une épaisseur hors catalogue reste offerte au choix
  S.stack.cu[0].t=0.025;buildStackup();
  if($("stk").innerHTML.indexOf(">25 µm")<0)
    throw new Error("l'épaisseur en place devrait figurer dans la liste des cuivres");
  // le diélectrique : on choisit sa ligne, puis on l'édite
  const rows=stackRows();
  const k=rows.findIndex(r=>r.kind==="di");
  stkPick("di",rows[k].i);
  $("skDT").value="0.5";$("skDT").onchange();
  if(Math.abs(S.stack.di[0].t-0.5)>1e-9)throw new Error("diélectrique non repris");
  $("skEr").value="3.2";$("skEr").onchange();
  if(Math.abs(S.stack.di[0].er-3.2)>1e-9)throw new Error("εr non repris");
  $("skK").value="film";$("skK").onchange();
  if(S.stack.di[0].k!=="film")throw new Error("rôle du diélectrique non repris");
  $("skK").value="tissu de verre";$("skK").onchange();
  if(S.stack.di[0].k!=="film")throw new Error("rôle inconnu accepté");
  applyPreset(presetsFor(4)[0]);
  stkPick("cu",0);
});
T("panneau d'empilage : cible, finition et couleurs",()=>{
  setCuCount(4);applyPreset(presetsFor(4)[0]);
  S.cuL[1].plane=true;S.cuL[1].net="GND";syncAutoZones();
  S.classes=[{name:"Défaut",w:0.3,clr:0.25,via:0.8,drill:0.4}];
  buildStackup();
  $("skTarget").value="2";$("skTarget").onchange();
  if(Math.abs(S.stack.target-2)>1e-9)throw new Error("cible non reprise");
  $("skFit").onclick();
  if(Math.abs(stackTotal()-2)>0.02)throw new Error("répartition sans effet : "+stackTotal());
  $("skFin").value=FINISHES[2];$("skFin").onchange();
  if(S.stack.finish!==FINISHES[2])throw new Error("finition non reprise");
  $("skFin").value="peinture dorée";$("skFin").onchange();
  if(S.stack.finish!==FINISHES[2])throw new Error("finition inconnue acceptée");
  // couleurs : celle du masque et celle de l'encre s'éditent depuis leur ligne
  stkPick("mask",0);
  $("skMC").value="noir";$("skMC").onchange();
  if(S.stack.maskColor!=="noir")throw new Error("couleur de masque non reprise");
  stkPick("silk",0);
  $("skSC").value="jaune";$("skSC").onchange();
  if(S.stack.silkColor!=="jaune")throw new Error("couleur d'encre non reprise");
  $("skSC").value="rose fluo";$("skSC").onchange();
  if(S.stack.silkColor!=="jaune")throw new Error("couleur inconnue acceptée");
  stkPick("cu",0);
  S.cuL[1].plane=false;S.zones=[];syncAutoZones();
  S.classes=[{name:"Défaut",w:0.3,clr:0.25,via:0.8,drill:0.4},
             {name:"Alimentation",w:0.6,clr:0.25,via:0.9,drill:0.45}];
});
T("rôle d'une couche de cuivre",()=>{
  setCuCount(4);applyPreset(presetsFor(4)[0]);
  S.zones=[];S.cuL.forEach(L=>{L.plane=false;L.net="";L.role="signal";});
  touch();
  if(layerRole(0)!=="signal")throw new Error("rôle par défaut : "+layerRole(0));
  // un plan de masse pose sa zone pleine carte et sert de référence
  if(!setLayerRole(1,"gnd"))throw new Error("rôle refusé");
  if(!S.cuL[1].plane)throw new Error("un plan de masse pose du cuivre plein");
  if(!S.cuL[1].net)throw new Error("un plan sans net : le net par défaut manque");
  if(!S.zones.some(z=>z.auto&&z.l===1))throw new Error("zone pleine carte absente");
  const z=S.zones.find(o=>o.auto&&o.l===1);
  if(z.net!==S.cuL[1].net)throw new Error("la zone du plan devrait porter son net");
  if(z.pts.length!==boardZonePts().length)
    throw new Error("la zone du plan devrait épouser le contour");
  // le net du plan se change sans changer de rôle
  setLayerRole(1,"gnd","+5V");
  if(S.cuL[1].net!=="+5V")throw new Error("net du plan non repris");
  if(layerRole(1)!=="gnd")throw new Error("le rôle a bougé avec le net");
  // repasser en signal retire le cuivre plein
  setLayerRole(1,"signal");
  if(S.cuL[1].plane||S.cuL[1].net)throw new Error("le plan devait être retiré");
  if(S.zones.some(o=>o.auto&&o.l===1))throw new Error("la zone auto devait partir");
  // alimentation et blindage sont des plans, mixte n'en est pas un
  for(const r of ["pwr","shield"]){
    setLayerRole(2,r);
    if(!rolePlane(r)||!S.cuL[2].plane)throw new Error(r+" devrait être un plan");
    if(roleLabel(2).indexOf(CU_ROLE_SHORT[r])<0)
      throw new Error("libellé inattendu : "+roleLabel(2));
  }
  setLayerRole(2,"mixed");
  if(S.cuL[2].plane)throw new Error("une couche mixte ne porte pas de plan pleine carte");
  if(layerRole(2)!=="mixed")throw new Error("le rôle mixte devrait tenir");
  // un rôle inventé est refusé
  if(setLayerRole(2,"antenne"))throw new Error("rôle inconnu accepté");
  if(layerRole(2)!=="mixed")throw new Error("le rôle a été abîmé par un refus");
  S.cuL.forEach((L,i)=>setLayerRole(i,"signal"));
});
T("rôle : le cuivre posé tranche, et le rôle s'annule",()=>{
  setCuCount(4);
  S.zones=[];S.cuL.forEach(L=>{L.plane=false;L.net="";L.role="signal";});touch();
  // rôle qui contredit le cuivre : c'est `plane` qui dit la vérité
  S.cuL[1].role="gnd";
  if(layerRole(1)!=="signal")
    throw new Error("un plan annoncé sans cuivre plein n'est pas un plan : "+layerRole(1));
  // un rôle absent se déduit du couple (cuivre plein, net)
  if(roleFromPlane(true,"GND")!=="gnd")
    throw new Error("du cuivre plein sur un net de masse est un plan de masse");
  if(roleFromPlane(true,"+5V")!=="pwr")
    throw new Error("du cuivre plein sur une alimentation est un plan d'alimentation");
  if(roleFromPlane(false,"GND")!=="signal")
    throw new Error("sans cuivre plein, c'est une couche de signal");
  // aller-retour par le document : la normalisation remet le rôle d'aplomb
  S.cuL[1].role="signal";setLayerRole(1,"pwr","+5V");
  S.cuL[1].role="signal";                  // document trafiqué : rôle incohérent
  loadDoc(JSON.parse(serialize()),true);
  if(layerRole(1)!=="pwr")throw new Error("rôle non reconstruit à la lecture");
  if(!S.cuL[1].plane)throw new Error("le plan a été perdu à la lecture");
  // et il s'annule comme le reste
  setLayerRole(1,"signal");
  push();setLayerRole(1,"gnd");
  const n=S.zones.length;
  undo();
  if(layerRole(1)!=="signal")throw new Error("l'annulation n'a pas rendu le rôle");
  if(S.zones.length>=n)throw new Error("la zone du plan devait disparaître avec lui");
  S.zones=[];S.cuL.forEach(L=>{L.plane=false;L.net="";L.role="signal";});touch();
});
T("panneau d'empilage : le rôle se change depuis la coupe",()=>{
  setCuCount(4);applyPreset(presetsFor(4)[0]);
  S.zones=[];S.cuL.forEach(L=>{L.plane=false;L.net="";L.role="signal";});touch();
  stkPick("cu",2);buildStackup();
  $("skRole").value="pwr";$("skRole").onchange();
  if(layerRole(2)!=="pwr")throw new Error("rôle non repris depuis la coupe");
  if(!S.zones.some(z=>z.auto&&z.l===2))throw new Error("le plan n'a pas posé sa zone");
  $("skNet").value="+5V";$("skNet").onchange();
  if(S.cuL[2].net!=="+5V")throw new Error("net du plan non repris depuis la coupe");
  $("skRole").value="tapisserie";$("skRole").onchange();
  if(layerRole(2)!=="pwr")throw new Error("rôle inconnu accepté par le panneau");
  // la coupe nomme les rôles, et le net du plan n'apparaît que pour un plan
  setLayerRole(1,"gnd");buildStackup();
  let h=$("stk").innerHTML;
  if(h.indexOf(CU_ROLE_SHORT.gnd)<0||h.indexOf(CU_ROLE_SHORT.pwr)<0)
    throw new Error("la coupe devrait nommer les rôles");
  // l'éditeur d'un plan propose son net, celui d'un signal n'en parle pas
  stkPick("cu",1);buildStackup();
  if($("stk").innerHTML.indexOf("Net du plan")<0)
    throw new Error("un plan devrait proposer son net");
  stkPick("cu",0);buildStackup();
  if($("stk").innerHTML.indexOf("Net du plan")>=0)
    throw new Error("une couche de signal n'a pas de net de plan");
  setLayerRole(0,"signal");setLayerRole(1,"signal");setLayerRole(2,"signal");
  buildStackup();
  if($("stk").innerHTML.indexOf("skRole")<0)throw new Error("sélecteur de rôle absent");
  S.zones=[];S.cuL.forEach(L=>{L.plane=false;L.net="";L.role="signal";});touch();
});
T("panneau d'empilage : les boutons sans effet le disent",()=>{
  setCuCount(4);applyPreset(presetsFor(4)[0]);
  buildStackup();
  let h=$("stk").innerHTML;
  // empilage d'usine : sur la cible et symétrique, donc rien à corriger
  if(h.indexOf('id="skFit" disabled')<0)
    throw new Error("« Répartir » devrait être neutralisé sur la cible");
  if(h.indexOf('id="skSym" disabled')<0)
    throw new Error("« Symétriser » devrait être neutralisé sur un empilage symétrique");
  if(h.indexOf("l'empilage tient l'épaisseur commandée")<0)
    throw new Error("l'écart devrait être expliqué");
  if(h.indexOf("il apparaîtra dès qu'un via")<0)
    throw new Error("le rapport d'aspect absent devrait être expliqué");
  // on casse la symétrie et la cible : les deux boutons reprennent du service
  S.stack.di[0].t=0.5;S.stack.target=1.2;touch();
  buildStackup();h=$("stk").innerHTML;
  if(h.indexOf('id="skFit" disabled')>=0)throw new Error("« Répartir » devrait être actif");
  if(h.indexOf('id="skSym" disabled')>=0)throw new Error("« Symétriser » devrait être actif");
  $("skSym").onclick();
  if(!stackSym())throw new Error("le bouton n'a pas symétrisé");
  $("skFit").onclick();
  if(Math.abs(stackTotal()-1.2)>0.02)throw new Error("le bouton n'a pas réparti");
  applyPreset(presetsFor(4)[0]);
});
T("traitement des vias : lecture, migration, feuille",()=>{
  setCuCount(4);applyPreset(presetsFor(4)[0]);
  S.rule.viaFinish="filled";
  if(!viaTented())throw new Error("un via bouché et plaqué n'est pas ouvert");
  // un fichier d'avant le traitement porte encore le booléen
  let doc=JSON.parse(serialize());
  delete doc.rule.viaFinish;doc.rule.tented=false;
  loadDoc(doc,true);
  if(S.rule.viaFinish!=="open")throw new Error("migration de tented=false : "+S.rule.viaFinish);
  doc=JSON.parse(serialize());
  delete doc.rule.viaFinish;doc.rule.tented=true;
  loadDoc(doc,true);
  if(S.rule.viaFinish!=="tented")throw new Error("migration de tented=true : "+S.rule.viaFinish);
  // un traitement inventé retombe sur le recouvrement
  doc=JSON.parse(serialize());doc.rule.viaFinish="peinture";
  loadDoc(doc,true);
  if(!VIA_FINISH[S.rule.viaFinish])throw new Error("traitement inventé accepté : "+S.rule.viaFinish);
  // le panneau le propose, la feuille et le LISEZ-MOI le disent
  S.rule.viaFinish="plugged";
  buildStackup();
  const h=$("stk").innerHTML;
  if(h.indexOf("skVia")<0)throw new Error("sélecteur de traitement absent du panneau");
  if(h.indexOf("Bouchés résine")<0)throw new Error("libellé du traitement absent");
  $("skVia").value="filled";$("skVia").onchange();
  if(S.rule.viaFinish!=="filled")throw new Error("traitement non repris par le panneau");
  $("skVia").value="peinture";$("skVia").onchange();
  if(S.rule.viaFinish!=="filled")throw new Error("valeur inconnue acceptée par le panneau");
  S.fps=[];S.tracks=[{l:0,net:"GND",w:0.3,x1:1,y1:1,x2:20,y2:1}];
  S.vias=[{x:5,y:5,d:0.8,drill:0.4,a:0,b:3,net:"GND"}];touch();
  const files=buildFabFiles().files;
  const emp=files.find(x=>x.name==="EMPILAGE.txt").text;
  const rm=files.find(x=>x.name==="LISEZ-MOI.txt").text;
  if(emp.indexOf("bouches et plaques")<0)
    throw new Error("la feuille devrait dire le traitement : "+emp.slice(0,400));
  if(rm.indexOf("IPC-4761")<0)throw new Error("le LISEZ-MOI devrait citer la norme");
  if(emp.indexOf("Vias : 1 traversant")<0)
    throw new Error("la feuille devrait recenser les vias");
  S.rule.viaFinish="tented";
});
T("empilage : nature des vias que le pressage permet",()=>{
  setCuCount(4);applyPreset(presetsFor(4)[0]);
  // 4 couches : prépreg / âme / prépreg
  if(viaBuild(0,3).kind!=="through"||!viaBuild(0,3).ok)
    throw new Error("un via traversant est toujours faisable");
  const bur=viaBuild(1,2);
  if(bur.kind!=="buried"||!bur.ok)
    throw new Error("un via enterré dans une âme se perce avant pressage : "+bur.why);
  const bl=viaBuild(0,1);
  if(bl.kind!=="blind"||!bl.ok)
    throw new Error("un borgne dans le prépreg extérieur passe au laser : "+bl.why);
  if(viaBuild(0,2).ok)throw new Error("un borgne sur deux diélectriques n'est pas gratuit");
  if(viaBuild(1,3).ok)throw new Error("un borgne côté soudure sur deux diélectriques non plus");
  if(!/séquentiel/.test(viaBuild(0,2).why))throw new Error("le pourquoi devrait parler de laminage");
  // l'ordre des couches n'a pas d'importance
  if(JSON.stringify(viaBuild(3,1))!==JSON.stringify(viaBuild(1,3)))
    throw new Error("viaBuild devrait être symétrique");
  // 6 couches : un enterré entre deux prépregs ne tient pas en un pressage
  setCuCount(6);applyPreset(presetsFor(6)[0]);
  if(viaBuild(2,3).ok)throw new Error("pas d'âme entre L3 et L4 : il faut un second pressage");
  if(!viaBuild(1,2).ok)throw new Error("L2→L3 traverse une âme : faisable");
  if(viaBuild(1,4).ok)throw new Error("un enterré sur trois diélectriques n'est pas faisable");
  // recensement
  S.vias=[{x:1,y:1,d:0.8,drill:0.4,a:0,b:5,net:"GND"},
          {x:2,y:1,d:0.6,drill:0.3,a:1,b:2,net:"GND"},
          {x:3,y:1,d:0.6,drill:0.3,a:2,b:3,net:"GND"}];
  touch();
  const c=viaCensus();
  if(c.through!==1||c.buried!==2)throw new Error("recensement faux : "+JSON.stringify(c));
  if(c.seq!==1)throw new Error("un seul via hors pressage unique attendu, "+c.seq);
  setCuCount(4);applyPreset(presetsFor(4)[0]);S.vias=[];touch();
});
T("DRC : rapport d'aspect et faisabilité des vias",()=>{
  setCuCount(4);applyPreset(presetsFor(4)[0]);
  S.fps=[];S.tracks=[];S.zones=[];S.cuts=[];
  S.cuL.forEach(L=>{L.plane=false;L.net="";L.role="signal";});
  const lam=stackLam();
  const fin=Math.round(lam/(ASPECT_MAX+1)*1000)/1000;   // rapport franchement au-delà
  const moy=Math.round(lam/(ASPECT_WARN+1)*1000)/1000;  // entre l'alerte et la limite
  S.vias=[{x:10,y:10,d:0.5,drill:fin,a:0,b:3,net:"GND"},
          {x:20,y:10,d:0.6,drill:moy,a:0,b:3,net:"GND"},
          {x:30,y:10,d:0.8,drill:0.4,a:0,b:3,net:"GND"},
          {x:40,y:10,d:0.6,drill:0.3,a:0,b:2,net:"GND"}];
  touch();
  const e=runDrc();
  const asp=e.filter(x=>/Rapport d'aspect/.test(x.msg));
  if(asp.length!==2)throw new Error("2 rapports d'aspect signalés attendus, "+asp.length);
  const dur=asp.find(x=>!x.info), mou=asp.find(x=>x.info);
  if(!dur||dur.via!==S.vias[0])throw new Error("le perçage le plus fin devrait être une erreur");
  if(!mou||mou.via!==S.vias[1])throw new Error("l'alerte devrait porter sur le via moyen");
  if(asp.some(x=>x.via===S.vias[2]))throw new Error("un via confortable ne doit rien déclencher");
  // le via fautif voyage avec l'entrée : la liste peut le sélectionner
  clearSel();S.sel.vias.add(dur.via);
  if(!S.sel.vias.has(S.vias[0]))throw new Error("l'entrée ne désigne pas le bon via");
  clearSel();
  const fais=e.filter(x=>/^Via /.test(x.msg));
  if(fais.length!==1)throw new Error("1 via infaisable attendu, "+fais.length);
  if(fais[0].via!==S.vias[3])throw new Error("le borgne sur deux diélectriques devrait être visé");
  if(!fais[0].info)throw new Error("un laminage séquentiel est une remarque, pas une erreur");
  if(!/L1_Top → L3_Inner/.test(fais[0].msg))throw new Error("message : "+fais[0].msg);
  S.vias=[];touch();
});
T("DRC : le rôle annoncé contre le cuivre posé",()=>{
  setCuCount(4);applyPreset(presetsFor(4)[0]);
  S.fps=[];S.tracks=[];S.zones=[];S.vias=[];
  S.cuL.forEach(L=>{L.plane=false;L.net="";L.role="signal";});
  touch();
  if(roleCheck(0))throw new Error("une couche de signal nue ne pose pas de question");
  // un plan qui porte des pistes
  setLayerRole(1,"gnd");
  S.tracks=[{l:1,net:"GND",w:0.3,x1:1,y1:1,x2:20,y2:1}];touch();
  const rc=roleCheck(1);
  if(!rc)throw new Error("un plan qui porte une piste devrait interpeller");
  if(rc.hint.indexOf("Mixte")<0)throw new Error("le conseil devrait proposer « Mixte » : "+rc.hint);
  let e=runDrc().filter(x=>/annoncée/.test(x.msg));
  if(!e.length)throw new Error("le DRC devrait le signaler");
  if(e[0].layer!==1)throw new Error("l'entrée devrait désigner la couche 1");
  if(!e[0].info)throw new Error("c'est une remarque, pas une erreur de règles");
  // le panneau le dit aussi, et marque la ligne du tableau
  stkPick("cu",1);buildStackup();
  const h=$("stk").innerHTML;
  if(h.indexOf("Rôle douteux")<0)throw new Error("l'éditeur devrait signaler le rôle douteux");
  if(h.indexOf("douteux\"")<0&&h.indexOf(" douteux")<0)
    throw new Error("la ligne du tableau devrait être marquée");
  // une couche de signal qui porte une zone pleine carte
  S.tracks=[];setLayerRole(1,"signal");
  S.zones=[{id:S.nextId++,l:1,net:"GND",pts:boardZonePts()}];touch();
  const rc2=roleCheck(1);
  if(!rc2||rc2.msg.indexOf("pleine carte")<0)
    throw new Error("une zone pleine carte sur un signal devrait interpeller");
  // une couche mixte sans aucune zone
  S.zones=[];S.cuL[1].role="mixed";S.cuL[1].plane=false;touch();
  const rc3=roleCheck(1);
  if(!rc3||rc3.hint.indexOf("Signal")<0)
    throw new Error("une mixte sans zone devrait proposer « Signal » : "+JSON.stringify(rc3));
  S.cuL.forEach(L=>{L.plane=false;L.net="";L.role="signal";});
  S.zones=[];S.tracks=[];touch();
});
T("empilage : l'asymétrie est nommée",()=>{
  setCuCount(4);applyPreset(presetsFor(4)[0]);
  if(stackAsym().length)throw new Error("un modèle d'usine est symétrique");
  S.stack.di[0].t=0.5;
  const a=stackAsym();
  if(a.length!==1)throw new Error("une seule paire fautive attendue, "+a.length);
  if(a[0].what!=="di"||a[0].i!==0||a[0].j!==2)
    throw new Error("la paire désignée est fausse : "+JSON.stringify(a[0]));
  const lbl=asymLabel(a[0]);
  if(lbl.indexOf("Diélectrique 1")<0||lbl.indexOf("0.500")<0||lbl.indexOf("3")<0)
    throw new Error("libellé peu utile : "+lbl);
  // le cuivre aussi, et la nature du diélectrique
  S.stack.cu[0].t=0.07;
  S.stack.di[0].t=S.stack.di[2].t;S.stack.di[0].k="film";
  const b=stackAsym();
  if(b.length!==2)throw new Error("cuivre et nature devraient être vus : "+JSON.stringify(b));
  if(!b.some(x=>x.what==="cu"&&/µm/.test(x.a)))throw new Error("le cuivre devrait être en µm");
  if(!b.some(x=>x.what==="di"&&x.a===DI_KIND.film))
    throw new Error("la nature du diélectrique devrait être nommée");
  // le panneau les liste
  buildStackup();
  const h=$("stk").innerHTML;
  if(h.indexOf("Diélectrique 1")<0||h.indexOf("Cuivre 1")<0)
    throw new Error("le panneau devrait nommer les paires fautives");
  applyPreset(presetsFor(4)[0]);
  if(!stackSym())throw new Error("le modèle d'usine devrait tout remettre d'aplomb");
});
T("feuille d'empilage dans le dossier de fabrication",()=>{
  setCuCount(4);applyPreset(presetsFor(4)[0]);
  S.cuL[1].plane=true;S.cuL[1].net="GND";syncAutoZones();
  importNetlist(NET,true);
  const files=buildFabFiles().files;
  const f=files.find(x=>x.name==="EMPILAGE.txt");
  if(!f)throw new Error("EMPILAGE.txt absent : "+files.map(x=>x.name).join(" "));
  for(const s of ["feuille d'empilage","Epaisseur visee","Finition du cuivre",
                  "Coupe, de la face composants","Prepreg","Tolerance usuelle",
                  "Serigraphie dessus","Masque dessous"])
    if(f.text.indexOf(s)<0)throw new Error("« "+s+" » absent de la feuille");
  if(f.text.indexOf(CU_ROLE_SHORT.gnd)<0)
    throw new Error("le rôle des couches devrait figurer dans la feuille");
  const rm=files.find(x=>x.name==="LISEZ-MOI.txt");
  if(rm.text.indexOf("EMPILAGE.txt")<0)
    throw new Error("le LISEZ-MOI devrait renvoyer à la feuille d'empilage");
  if(drillFile().text.indexOf("epaisseur du stratifie")<0)
    throw new Error("l'Excellon devrait rappeler l'épaisseur");
  S.cuL[1].plane=false;S.zones=[];syncAutoZones();
});
T("import : empilage physique borné et listes fermées",()=>{
  const doc=JSON.parse(serialize());
  doc.cu=4;doc.cuL=[{},{},{},{}];
  doc.stack={target:-5,finish:"onyx massif",maskT:99,maskEr:0,
             maskColor:"rose fluo; background:url(x)",silkColor:42,
             cu:[{t:-1},{t:"0.0175"},null,{}],
             di:[{k:"béton",t:-2,er:0,df:"x",mat:"   "},{t:0.3},"non"]};
  loadDoc(doc,true);
  const st=S.stack;
  if(st.cu.length!==4)throw new Error("4 cuivres attendus, "+st.cu.length);
  if(st.di.length!==3)throw new Error("3 diélectriques attendus, "+st.di.length);
  if(!(st.target>0))throw new Error("épaisseur visée négative acceptée");
  if(FINISHES.indexOf(st.finish)<0)throw new Error("finition inventée acceptée : "+st.finish);
  if(MASK_COLORS.indexOf(st.maskColor)<0)
    throw new Error("couleur de masque inventée acceptée : "+st.maskColor);
  if(typeof st.silkColor!=="string")throw new Error("couleur de sérigraphie non textuelle");
  if(!(st.cu[0].t>0))throw new Error("cuivre négatif accepté");
  if(Math.abs(st.cu[1].t-0.0175)>1e-9)throw new Error("chaîne numérique mal convertie");
  if(!DI_KIND[st.di[0].k])throw new Error("rôle de diélectrique inventé accepté : "+st.di[0].k);
  if(!(st.di[0].t>0)||!(st.di[0].er>=1))throw new Error("diélectrique hors bornes accepté");
  if(!st.di[0].mat)throw new Error("matière vide acceptée");
  if(!(st.maskEr>=1))throw new Error("εr de vernis hors bornes accepté");
  draw();buildStackup();stackReport();
  // un document sans empilage du tout : celui d'usine
  loadDoc({cu:2},true);
  if(S.stack.cu.length!==2||!(stackTotal()>0))throw new Error("empilage d'usine attendu");
  buildStackup();stackReport();
});

T("le rôle « plan de couche » survit à un annuler",()=>{
  setCuCount(4);
  S.zones=[];S.cuL.forEach(L=>{delete L.plane;delete L.net;});
  S.cuL[3].plane=true;S.cuL[3].net="GND";syncAutoZones();
  const n=S.zones.length;
  push();S.board.w+=5;touch();
  undo();
  if(S.zones.length!==n)
    throw new Error("l'annulation a dupliqué la zone du plan : "+n+" → "+S.zones.length);
  if(!S.cuL[3].plane)throw new Error("le rôle « plan » a été effacé par l'annulation");
  if(S.cuL[3].net!=="GND")throw new Error("le net du plan a été perdu");
  // un fichier V1.0, lui, doit toujours être converti : rôle sans zone auto
  const doc=JSON.parse(serialize());
  doc.zones=doc.zones.filter(z=>!z.auto);
  loadDoc(doc,true);
  if(!S.zones.some(z=>z.l===3&&z.net==="GND"))
    throw new Error("fichier V1.0 : le plan de couche n'a pas été converti en zone");
  if(S.cuL[3].plane)throw new Error("fichier V1.0 : le rôle devait être retiré après conversion");
  S.zones=[];S.cuL.forEach(L=>{delete L.plane;delete L.net;});
  setCuCount(2);touch();
});

/* ==========================================================================
   Espace de travail (commun/workspace.js)
   C'est le module dont l'arrivée avait mis le banc d'essai à l'arrêt : il a
   maintenant ses propres essais. Le DOM factice déplace vraiment les panneaux,
   on interroge donc l'arbre et pas seulement l'état interne.
   ========================================================================== */
T("disposition d'usine appliquée au démarrage",()=>{
  const d=wsDefault();
  if(d.docks.dockL!==212)throw new Error("largeur du dock gauche perdue");
  // wsDefault() rend une copie : la modifier ne doit pas polluer la config
  d.order.dockL.push("intrus");d.panels.props.grow=99;
  const e=wsDefault();
  if(e.order.dockL.indexOf("intrus")>=0)throw new Error("wsDefault() partage son tableau");
  if(e.panels.props.grow===99)throw new Error("wsDefault() partage ses panneaux");
  if(JSON.stringify(dom.dockIds("dockL"))!==JSON.stringify(["stack","rules"]))
    throw new Error("dock gauche : "+dom.dockIds("dockL"));
  if(JSON.stringify(dom.dockIds("dockR"))!==JSON.stringify(["props","list","stackup","dpair"]))
    throw new Error("dock droit : "+dom.dockIds("dockR"));
  if(dom.dockIds("dockB").length)throw new Error("le dock du bas devrait être vide");
  if(!dom.docks.dockB.classList.contains("empty"))
    throw new Error("un dock vide porte la classe « empty »");
});
T("séparateur entre panneaux d'un même dock",()=>{
  const n=dom.docks.dockL.children.filter(c=>c.classList.contains("psplit")).length;
  if(n!==1)throw new Error("2 panneaux = 1 séparateur, obtenu "+n);
});
T("déplacer un panneau d'un dock à l'autre",()=>{
  wsMove("props","dockB",0);
  if(wsPlaceOf("props")!=="dockB")throw new Error("place non mise à jour");
  if(wsLabel("props")!=="bas")throw new Error("libellé : "+wsLabel("props"));
  if(dom.panels.props.parentNode!==dom.docks.dockB)
    throw new Error("le panneau n'a pas suivi dans l'arbre");
  if(JSON.stringify(dom.dockIds("dockR"))!==JSON.stringify(["list","stackup","dpair"]))
    throw new Error("dock droit après départ : "+dom.dockIds("dockR"));
  // l'ordre demandé est respecté
  wsMove("stack","dockB",0);
  if(JSON.stringify(dom.dockIds("dockB"))!==JSON.stringify(["stack","props"]))
    throw new Error("insertion en tête ratée : "+dom.dockIds("dockB"));
});
T("détacher puis rattacher un panneau",()=>{
  wsToggleFloat("props");
  if(wsPlaceOf("props")!=="float")throw new Error("le panneau devrait flotter");
  if(dom.panels.props.parentNode!==dom.floatLayer)
    throw new Error("le flottant doit vivre dans #floatLayer");
  if(!dom.panels.props.classList.contains("floating"))
    throw new Error("classe « floating » absente");
  const h=dom.panels.props.querySelectorAll(".fres").length;
  if(h!==8)throw new Error("8 poignées de redimensionnement attendues, "+h);
  wsToggleFloat("props");
  if(wsPlaceOf("props")!=="dockB")throw new Error("retour au dernier dock raté");
  if(dom.panels.props.querySelectorAll(".fres").length)
    throw new Error("les poignées devaient disparaître au rattachement");
  if(dom.panels.props.classList.contains("floating"))
    throw new Error("classe « floating » non retirée");
});
T("fermer et rouvrir un panneau",()=>{
  wsClose("list");
  if(wsPlaceOf("list")!=="hidden")throw new Error("le panneau devrait être masqué");
  if(dom.panels.list.parentNode!==dom.store)
    throw new Error("un panneau fermé retourne au magasin");
  wsShow("list");
  if(wsPlaceOf("list")==="hidden")throw new Error("réouverture ratée");
  if(dom.panels.list.parentNode!==dom.docks.dockR)
    throw new Error("le panneau devrait revenir à son dernier dock");
});
T("replier un panneau",()=>{
  wsToggleCollapse("rules");
  if(!dom.panels.rules.classList.contains("collapsed"))throw new Error("repli sans effet");
  wsToggleCollapse("rules");
  if(dom.panels.rules.classList.contains("collapsed"))throw new Error("dépli sans effet");
});
T("la disposition est écrite dans le stockage local",()=>{
  const raw=dom.storage.getItem(WS_KEY);
  if(!raw)throw new Error("rien sous la clé "+WS_KEY);
  const d=JSON.parse(raw);
  if(d.order.dockB.indexOf("stack")<0)
    throw new Error("le déplacement n'a pas été enregistré : "+JSON.stringify(d.order));
});
T("relecture d'une disposition enregistrée",()=>{
  const saved=dom.storage.getItem(WS_KEY);
  WS=wsDefault();wsApply(false);
  if(JSON.stringify(dom.dockIds("dockL"))!==JSON.stringify(["stack","rules"]))
    throw new Error("réinitialisation ratée");
  wsLoad();wsApply(false);
  if(wsPlaceOf("stack")!=="dockB")throw new Error("disposition non relue");
  if(dom.storage.getItem(WS_KEY)!==saved)
    throw new Error("wsApply(false) ne doit pas réécrire le stockage");
});
T("une disposition corrompue retombe sur l'usine",()=>{
  dom.storage.setItem(WS_KEY,
    '{"order":{"dockL":["stack","fantome","stack"]},"docks":{"dockL":-9}}');
  WS=wsDefault();wsLoad();wsApply(false);
  if(wsPlaceOf("fantome")!=="hidden")
    throw new Error("un panneau inconnu ne doit pas être placé");
  if(dom.dockIds("dockL").filter(x=>x==="stack").length!==1)
    throw new Error("doublon accepté : "+dom.dockIds("dockL"));
  if(WS.docks.dockL<150)throw new Error("largeur négative acceptée : "+WS.docks.dockL);
  // les panneaux absents du fichier retrouvent leur place d'usine
  for(const id of ["rules","props","list"])
    if(wsPlaceOf(id)==="hidden")throw new Error(id+" a disparu");
  dom.storage.setItem(WS_KEY,"{ceci n'est pas du JSON");
  WS=wsDefault();wsLoad();wsApply(false);
  if(JSON.stringify(dom.dockIds("dockL"))!==JSON.stringify(["stack","rules"]))
    throw new Error("JSON illisible : la disposition d'usine devait s'appliquer");
});
T("menu de l'espace de travail : titres échappés",()=>{
  dom.panels.list.dataset.title='Nets <img src=x onerror="pan()">';
  const h=wsMenuBuild().innerHTML;
  dom.panels.list.dataset.title="Nets & composants";
  if(h.indexOf("<img")>=0)throw new Error("titre de panneau injecté tel quel dans le menu");
  if(h.indexOf("&lt;img")<0)throw new Error("titre non échappé : "+h);
  const m=wsMenuBuild().innerHTML;
  for(const t of ["Tout afficher","Disposition en colonnes","Réinitialiser la disposition"])
    if(m.indexOf(t)<0)throw new Error("entrée de menu manquante : "+t);
  if(m.indexOf('data-tgl="stack"')<0)throw new Error("bascule de panneau manquante");
});
T("poignée d'un dock vide neutralisée",()=>{
  const g=document.querySelectorAll(".gut[data-dock]").find(x=>x.dataset.dock==="dockL");
  if(!g)throw new Error("poignée de dock introuvable");
  if(g.classList.contains("off"))throw new Error("un dock peuplé garde sa poignée active");
  wsMove("stack","hidden");wsMove("rules","hidden");
  if(!g.classList.contains("off"))throw new Error("un dock vide neutralise sa poignée");
  wsShow("stack");wsShow("rules");
});
/* ==========================================================================
   Sélection multiple au Ctrl+clic et presse-papier
   ========================================================================== */
/* Deux empreintes posées pour ces essais : le document a pu être remplacé par
   les essais précédents, on ne s'appuie pas sur la netlist importée. */
function deuxEmpreintes(){
  S.fps=[];S.tracks=[];S.vias=[];S.zones=[];S.cuts=[];
  const a=mkFp("U1","NE555","DIP-8",8); a.x=20; a.y=20;
  const b=mkFp("C1","100n","0603",2);   b.x=45; b.y=20;
  S.fps.push(a,b);touch();clearSel();
  return [a,b];
}
T("Ctrl+clic ajoute puis retire de la sélection",()=>{
  setMode("select");S.active=0;
  const [u1,c1]=deuxEmpreintes();
  clearSel();
  fire("pointerdown",sc(u1.x,u1.y));fire("pointerup",sc(u1.x,u1.y));
  if(S.sel.fps.size!==1)throw new Error("clic simple : une seule empreinte");
  fire("pointerdown",Object.assign(sc(c1.x,c1.y),{ctrlKey:true}));
  fire("pointerup",sc(c1.x,c1.y));
  if(S.sel.fps.size!==2)throw new Error("Ctrl+clic devait ajouter, "+S.sel.fps.size);
  // second Ctrl+clic : elle sort de la sélection
  fire("pointerdown",Object.assign(sc(c1.x,c1.y),{ctrlKey:true}));
  fire("pointerup",sc(c1.x,c1.y));
  if(S.sel.fps.size!==1)throw new Error("Ctrl+clic devait retirer, "+S.sel.fps.size);
  if(!S.sel.fps.has(u1.id))throw new Error("la mauvaise empreinte est sortie");
  // clic simple sur le vide : tout retombe
  fire("pointerdown",sc(-50,-50));fire("pointerup",sc(-50,-50));
  if(selCount())throw new Error("le vide devait vider la sélection");
});
T("une sélection multiple se déplace d'un bloc",()=>{
  const [u1,c1]=deuxEmpreintes();
  clearSel();
  fire("pointerdown",sc(u1.x,u1.y));fire("pointerup",sc(u1.x,u1.y));
  fire("pointerdown",Object.assign(sc(c1.x,c1.y),{ctrlKey:true}));
  fire("pointerup",sc(c1.x,c1.y));
  const x0=u1.x, y0=u1.y, x1=c1.x, y1=c1.y;
  fire("pointerdown",sc(c1.x,c1.y));
  fire("pointermove",sc(c1.x+5,c1.y+5));
  fire("pointerup",sc(c1.x+5,c1.y+5));
  if(Math.abs(u1.x-(x0+5))>0.6||Math.abs(u1.y-(y0+5))>0.6)
    throw new Error("la première empreinte devait suivre : "+u1.x+","+u1.y);
  if(Math.abs(c1.x-(x1+5))>0.6)throw new Error("la seconde n'a pas bougé");
  undo();
});
/* La touche U de l'éditeur schématique, portée sur la carte : le lasso prend
   tout, U ne retire que le cuivre routé — segments et vias — et laisse les
   empreintes en place, et sélectionnées. Les zones ne sont pas du routage. */
T("U ne déroute que le cuivre de la sélection",()=>{
  const [u1,c1]=deuxEmpreintes();
  setMode("select");S.active=0;
  S.tracks=[{l:0,net:"N$1",w:0.3,x1:10,y1:10,x2:20,y2:10},
            {l:0,net:"N$1",w:0.3,x1:20,y1:10,x2:20,y2:20}];
  S.vias=[{x:20,y:20,d:0.8,drill:0.4,a:0,b:S.cu-1,net:"N$1"}];
  S.zones=[{l:0,net:"GND",pts:[{x:0,y:0},{x:30,y:0},{x:30,y:30},{x:0,y:30}]}];
  touch();clearSel();
  // le lasso a tout pris : deux empreintes, deux segments, un via, une zone
  S.sel.fps.add(u1.id);S.sel.fps.add(c1.id);
  S.tracks.forEach(t=>S.sel.tracks.add(t));
  S.vias.forEach(v=>S.sel.vias.add(v));
  S.zones.forEach(z=>S.sel.zones.add(z));
  const n=unrouteSel();
  if(n!==3)throw new Error("2 segments et 1 via devaient partir, "+n);
  if(S.tracks.length)throw new Error(S.tracks.length+" segment(s) restent");
  if(S.vias.length)throw new Error("le via devait partir avec sa piste");
  if(S.fps.length!==2)throw new Error("les empreintes devaient rester");
  if(S.sel.fps.size!==2)throw new Error("les empreintes devaient rester sélectionnées");
  if(S.zones.length!==1||S.sel.zones.size!==1)
    throw new Error("une zone de cuivre n'est pas du routage : elle reste");
  // sélection sans cuivre routé : rien ne bouge, et surtout pas les empreintes
  if(unrouteSel())throw new Error("il n'y avait plus rien à dérouter");
  if(S.fps.length!==2)throw new Error("une sélection sans piste ne doit rien supprimer");
  if(S.zones.length!==1)throw new Error("la zone ne devait pas partir non plus");
  // seul le cuivre sélectionné part
  S.tracks=[{l:0,net:"N$1",w:0.3,x1:0,y1:0,x2:10,y2:0},
            {l:0,net:"N$2",w:0.3,x1:0,y1:5,x2:10,y2:5}];
  touch();clearSel();S.sel.tracks.add(S.tracks[1]);
  if(unrouteSel()!==1)throw new Error("un seul segment devait partir");
  if(S.tracks.length!==1)throw new Error("il devait rester un segment");
  if(S.tracks[0].net!=="N$1")throw new Error("le mauvais segment est parti");
  // et le geste se défait
  undo();
  if(S.tracks.length!==2)throw new Error("Ctrl+Z devait rendre le segment déroutés");
  // rien de sélectionné du tout : U le dit et ne touche à rien
  clearSel();
  if(unrouteSel())throw new Error("sans sélection, U ne supprime rien");
  if(S.tracks.length!==2)throw new Error("le cuivre non sélectionné ne bouge pas");
  // la touche elle-même, et le bouton de la barre d'outils
  S.sel.tracks.add(S.tracks[0]);
  key("u");
  if(S.tracks.length!==1)throw new Error("la touche U n'est pas branchée");
  S.sel.tracks.add(S.tracks[0]);
  $("bUnroute").onclick();
  if(S.tracks.length!==0)throw new Error("le bouton « Dérouter » n'est pas branché");
});
T("copier / coller une sélection",()=>{
  const u1=deuxEmpreintes()[0];
  S.tracks=[{l:0,net:"N$1",w:0.3,x1:10,y1:10,x2:20,y2:10}];
  touch();
  clearSel();S.sel.fps.add(u1.id);S.sel.tracks.add(S.tracks[0]);
  const nf=S.fps.length, nt=S.tracks.length;
  if(!copySelPcb())throw new Error("copie refusée");
  S.mouse={x:60,y:40};
  pasteClipPcb();
  if(S.fps.length!==nf+1)throw new Error("une empreinte devait naître, "+S.fps.length);
  if(S.tracks.length!==nt+1)throw new Error("une piste devait naître");
  const refs=S.fps.map(f=>f.ref);
  if(new Set(refs).size!==refs.length)throw new Error("repères en double : "+refs.join(" "));
  if(S.sel.fps.size!==1||S.sel.tracks.size!==1)
    throw new Error("le collage doit sélectionner ce qu'il pose");
  /* Le coin haut-gauche du bloc atterrit sous le pointeur : ici c'est le début
     de la piste (10,10), l'empreinte étant 10 mm plus loin dans les deux sens. */
  const piste=S.tracks.find(t=>S.sel.tracks.has(t));
  if(Math.abs(piste.x1-60)>0.6||Math.abs(piste.y1-40)>0.6)
    throw new Error("collage hors du pointeur : "+piste.x1+","+piste.y1);
  const neuf=S.fps.find(f=>S.sel.fps.has(f.id));
  if(Math.abs(neuf.x-70)>0.6||Math.abs(neuf.y-50)>0.6)
    throw new Error("écart interne au bloc non conservé : "+neuf.x+","+neuf.y);
  if(neuf.value!==u1.value)throw new Error("la copie a perdu sa valeur");
  undo();
  if(S.fps.length!==nf)throw new Error("l'annulation devait tout retirer");
});
T("presse-papier : un contenu invalide ne casse rien",()=>{
  const nf=S.fps.length, nt=S.tracks.length;
  pcbSetClip({fps:[{style:"inconnu"},null],tracks:[{x1:0,y1:0}],vias:["x"]});
  S.mouse={x:0,y:0};
  pasteClipPcb();
  if(S.tracks.length!==nt)throw new Error("une piste inutilisable a été posée");
  if(S.fps.length!==nf+1)throw new Error("l'empreinte devait être rattrapée par les valeurs d'usine");
  undo();
});
T("repère libre : R12 devient R13 puis R14",()=>{
  const used=new Set(["R12","R13"]);
  if(freeFpRef("R12",used)!=="R14")throw new Error(freeFpRef("R12",used));
  if(freeFpRef("Q1",used)!=="Q1")throw new Error("un repère libre ne doit pas changer");
  if(freeFpRef("",used)!=="U1")throw new Error("un repère vide reçoit un numéro");
});
T("réglages d'usine : grille 0,1 mm et pistes à 45°",()=>{
  if(USINE.grid!==0.1)throw new Error("grille d'usine attendue à 0,1 mm : "+USINE.grid);
  if(USINE.corner!=="45")throw new Error("angle d'usine attendu à 45° : "+USINE.corner);
  if(!GRID_STEPS.includes(0.1))throw new Error("0,1 mm doit rester dans les pas proposés");
});
/* Trois règles d'angle pour le tracé. Le contrat est le même pour les trois :
   des segments bout à bout, aucun de longueur nulle, et l'arrivée où on l'a
   demandée. La posture bascule le départ du coude dans les deux règles qui en
   posent deux. */
T("angle des pistes : 45°, 90° et libre",()=>{
  const attendu={
    "45":{droit:[[0,0,6,0],[6,0,10,4]], autre:[[0,0,4,4],[4,4,10,4]]},
    "90":{droit:[[0,0,10,0],[10,0,10,4]],autre:[[0,0,0,4],[0,4,10,4]]},
    "free":{droit:[[0,0,10,4]],          autre:[[0,0,10,4]]}
  };
  for(const m in attendu)
    for(const pose of ["droit","autre"]){
      const got=routeCorner({x:0,y:0},{x:10,y:4},pose==="autre",m)
                  .map(s=>[s.x1,s.y1,s.x2,s.y2].join());
      const want=attendu[m][pose].map(v=>v.join());
      if(got.join(" ")!==want.join(" "))
        throw new Error(m+" / "+pose+" : "+got.join(" ")+" au lieu de "+want.join(" "));
    }
  // trajets dégénérés : un seul segment, quelle que soit la règle
  for(const m in CORNER_MODES){
    if(routeCorner({x:0,y:0},{x:10,y:0},false,m).length!==1)
      throw new Error(m+" : un trajet droit ne fait qu'un segment");
    if(routeCorner({x:3,y:3},{x:3,y:3},false,m).length!==0)
      throw new Error(m+" : sur place, rien à poser");
  }
  if(routeCorner({x:0,y:0},{x:10,y:10},false,"90").length!==2)
    throw new Error("à 90°, un trajet en diagonale reste un coude");
});
T("la règle d'angle s'applique au tracé et se défait",()=>{
  S.fps=[];S.tracks=[];S.vias=[];S.zones=[];touch();
  S.avoid=false;setMode("track");S.active=0;
  setCornerMode("90");
  if(cornerMode()!=="90")throw new Error("la règle n'a pas pris");
  startRoute(0,0,true);
  fire("pointermove",sc(10,4));            // la bascule repart du curseur
  const p=S.route.preview;
  if(p.length!==2||Math.abs(p[0].y2)>1e-9||Math.abs(p[1].x2-p[1].x1)>1e-9)
    throw new Error("coude à 90° attendu : "+JSON.stringify(p));
  key("/");
  if(Math.abs(S.route.preview[0].x2)>1e-9)
    throw new Error("la posture devait basculer sur l'autre axe : "+
                    JSON.stringify(S.route.preview));
  commitRoute();
  setCornerMode("free");
  startRoute(0,0,true);updateRoute(10,4);
  if(S.route.preview.length!==1)throw new Error("en libre, un seul segment");
  cancelRoute();setMode("select");
  undo();                                  // la règle est dans le document
  if(cornerMode()!=="90")throw new Error("l'annulation devait rendre 90° : "+cornerMode());
  setCornerMode("45");
  if(setCornerMode("zigzag")||cornerMode()!=="45")
    throw new Error("une règle inconnue ne doit rien changer");
});
/* La règle « 45 » dit le L chanfreiné. `routeCorner` ne voit pourtant que la
   jambe du clic en cours : un clic franchement horizontal suivi d'un clic
   franchement vertical ne posait qu'un segment chacun, et les deux mis bout à
   bout faisaient l'angle droit franc que la touche D sert à rattraper. */
T("le routeur en règle 45° ne laisse pas d'angle droit",()=>{
  const coudes=()=>{
    const vus=new Set(), out=[];
    for(const t of S.tracks)for(const en of [1,2]){
      const x=en===1?t.x1:t.x2, y=en===1?t.y1:t.y2, k=x+","+y;
      if(vus.has(k))continue;
      const j=jointAt(x,y,t.l);
      if(j.ends.length!==2||j.ends[0].t===j.ends[1].t)continue;
      vus.add(k);
      const a=endDir(j.ends[0].t,j.ends[0].e), b=endDir(j.ends[1].t,j.ends[1].e);
      const c=(a.x*b.x+a.y*b.y)/(Math.hypot(a.x,a.y)*Math.hypot(b.x,b.y));
      out.push({at:k,deg:Math.acos(Math.max(-1,Math.min(1,c)))*180/Math.PI});
    }
    return out;
  };
  const trace=pts=>{
    S.fps=[];S.tracks=[];S.vias=[];S.zones=[];touch();clearSel();
    S.avoid=false;setMode("track");S.active=0;
    startRoute(pts[0].x,pts[0].y,true);
    for(const p of pts.slice(1)){updateRoute(p.x,p.y);stepRoute();}
    if(S.route)commitRoute();
    setMode("select");
  };
  setCornerMode("45");
  for(const [nom,pts] of [
        ["horizontal puis vertical",[{x:0,y:0},{x:10,y:0},{x:10,y:-8}]],
        ["vertical puis horizontal",[{x:0,y:0},{x:0,y:10},{x:9,y:10}]],
        ["deux coudes francs",     [{x:0,y:0},{x:12,y:0},{x:12,y:12},{x:24,y:12}]]]){
    trace(pts);
    const droits=coudes().filter(o=>Math.abs(o.deg-90)<0.5);
    if(droits.length)
      throw new Error(nom+" : "+droits.length+" angle(s) droit(s) posé(s) en règle 45° — "+
                      JSON.stringify(S.tracks.map(t=>[t.x1,t.y1,t.x2,t.y2])));
    for(const t of S.tracks)
      if(!angleOk(t.x2-t.x1,t.y2-t.y1))
        throw new Error(nom+" : angle bâtard posé "+JSON.stringify([t.x1,t.y1,t.x2,t.y2]));
    if(S.sel.tracks.size)throw new Error(nom+" : un dépôt ne doit rien sélectionner");
  }
  // en règle 90°, l'angle droit est ce qu'on demande : on n'y touche pas
  setCornerMode("90");
  trace([{x:0,y:0},{x:10,y:0},{x:10,y:-8}]);
  if(!coudes().some(o=>Math.abs(o.deg-90)<0.5))
    throw new Error("la règle 90° doit garder son angle droit : "+
                    JSON.stringify(S.tracks.map(t=>[t.x1,t.y1,t.x2,t.y2])));
  setCornerMode("45");
  S.avoid=true;
});
T("import : la règle d'angle est une liste fermée",()=>{
  const d=normDoc({rule:{corner:"90"}});
  if(d.rule.corner!=="90")throw new Error("une règle valide doit passer");
  for(const v of ["<script>",42,null,"120",""])
    if(normDoc({rule:{corner:v}}).rule.corner!=="45")
      throw new Error("valeur refusée attendue à 45° : "+JSON.stringify(v));
  if(normDoc({}).rule.corner!=="45")
    throw new Error("un fichier antérieur au réglage se lit à 45°");
});
T("pas de grille : valeurs rondes et pas impériaux",()=>{
  for(const g of [0.1,0.5,1,1.27,2.54])
    if(!GRID_STEPS.includes(g))throw new Error("pas manquant : "+g);
  setGridStep(1);
  if(S.grid!==1)throw new Error("réglage non appliqué");
  S.scale=20;
  if(gridLabel()!=="1 carré = 1 mm")throw new Error(gridLabel());
  setGridStep(0.5);
  S.scale=5;                       // trop serré : on n'en trace qu'une sur deux
  if(gridShownStep()<=S.grid)throw new Error("la case affichée devait être élargie");
  setGridStep(0.5);S.scale=20;
});

/* ==========================================================================
   Boîtiers nommés (01-core.js) et netlist qui les transporte (02-connectivity.js)
   Le boîtier choisi côté schématique doit décider de l'empreinte : c'est le
   seul lien entre « SOIC-8 » écrit dans la netlist et des pastilles au bon pas.
   ========================================================================== */
T("boîtier reconnu : style, pas et brochage",()=>{
  const cas=[
    ["0603",2,"chip",1.5],
    ["0805",2,"chip",1.9],
    ["SOIC-8",8,"sop",1.27],
    ["DIP-8",8,"dip",2.54],
    ["DIP-40",40,"dip",2.54],
    ["TSSOP-20",20,"sop",0.65],
    ["SOT-23",3,"sop",0.95],
    ["SOT-23-5",5,"sop",0.95],
    ["TO-220",3,"row",2.54],
    ["TO-252 (DPAK)",3,"sop",2.3],       // le surnom entre parenthèses n'est pas un brochage
    ["TQFP-64",64,"quad",0.5],
    ["LQFP-44",44,"quad",0.8],
    ["QFN-32",32,"quad",0.5],
    ["BGA-256",256,"bga",0.8],
    ["sot 23",3,"sop",0.95],             // séparateurs et casse indifférents
    ["QFN32",32,"quad",0.5]
  ];
  for(const [nom,pins,style,pitch] of cas){
    const g=pkgGeom(nom,0);
    if(!g)throw new Error(nom+" : boîtier non reconnu");
    if(g.style!==style)throw new Error(nom+" : style "+g.style+" au lieu de "+style);
    if(g.pins!==pins)throw new Error(nom+" : "+g.pins+" broches au lieu de "+pins);
    if(Math.abs(g.pitch-pitch)>1e-9)throw new Error(nom+" : pas "+g.pitch+" au lieu de "+pitch);
    if(!(g.span>0))throw new Error(nom+" : écartement nul");
  }
  // le SOIC passe en large au delà de 16 broches, le DIP à 32
  if(!(pkgGeom("SOIC-28",0).span>pkgGeom("SOIC-16",0).span))
    throw new Error("SOIC-28 devait être plus large que SOIC-16");
  if(!(pkgGeom("DIP-40",0).span>pkgGeom("DIP-16",0).span))
    throw new Error("DIP-40 devait être plus large que DIP-16");
  // l'écartement d'un boîtier à quatre côtés suit le brochage
  if(!(pkgGeom("TQFP-100",0).span>pkgGeom("TQFP-64",0).span))
    throw new Error("TQFP-100 devait être plus grand que TQFP-64");
});
T("boîtier hors table : rien n'est inventé",()=>{
  for(const nom of ["","SOD-80","XYZ-12","0805X7R","boîtier maison"])
    if(pkgGeom(nom,4))throw new Error("« "+nom+" » n'aurait pas dû être reconnu");
  // repli sur le brochage, comme avant les boîtiers nommés
  const g=fpGeomFor("XYZ-12",8);
  if(g.style!=="dip"||g.pins!==8)throw new Error("repli incorrect : "+JSON.stringify(g));
});
T("boîtier : une broche câblée ne reste jamais sans pastille",()=>{
  const g=pkgGeom("SOIC-8",14);
  if(g.pins!==14)throw new Error("14 broches câblées attendues, "+g.pins);
  if(g.style!=="sop")throw new Error("le style du boîtier devait rester : "+g.style);
  const c=pkgGeom("0603",3);
  if(c.pins!==3)throw new Error("une puce à trois broches câblées : "+c.pins);
});
T("empreinte à quatre côtés : numérotation trigonométrique",()=>{
  const fp=mkFp("U9","","TQFP-32",0);
  if(fp.style!=="quad"||fp.pins!==32)throw new Error("empreinte quad attendue");
  const ps=padsOf(fp);
  if(ps.length!==32)throw new Error("32 pastilles attendues, "+ps.length);
  const at=n=>ps[n-1];
  const sp=fp.span;
  if(Math.abs(at(1).x+sp/2)>1e-9||!(at(1).y<0))throw new Error("broche 1 en haut à gauche");
  if(Math.abs(at(8).x+sp/2)>1e-9||!(at(8).y>0))throw new Error("broche 8 en bas à gauche");
  if(Math.abs(at(9).y-sp/2)>1e-9||!(at(9).x<0))throw new Error("broche 9 en bas à gauche");
  if(Math.abs(at(17).x-sp/2)>1e-9||!(at(17).y>0))throw new Error("broche 17 en bas à droite");
  if(Math.abs(at(25).y+sp/2)>1e-9||!(at(25).x>0))throw new Error("broche 25 en haut à droite");
  const vus=new Set(ps.map(q=>q.x.toFixed(3)+";"+q.y.toFixed(3)));
  if(vus.size!==32)throw new Error("pastilles superposées : "+vus.size+" positions");
  for(const q of ps)
    if(q.drill)throw new Error("un QFP n'a pas de trou traversant");
  // les pastilles des côtés gauche et droit sont couchées, celles du haut et du bas debout
  if(!(at(1).w>at(1).h)||!(at(9).h>at(9).w))throw new Error("pastilles mal orientées");
});
T("empreinte quad : brochage non multiple de quatre",()=>{
  const fp=mkFp("U8","","QFN-14",14);
  fp.style="quad";fp.pins=14;
  const ps=padsOf(fp);
  if(ps.length!==14)throw new Error("14 pastilles attendues, "+ps.length);
  const vus=new Set(ps.map(q=>q.x.toFixed(3)+";"+q.y.toFixed(3)));
  if(vus.size!==14)throw new Error("pastilles superposées");
});
T("empreinte en grille : un BGA tient son pas",()=>{
  const fp=mkFp("U7","","BGA-16",0);
  if(fp.style!=="bga"||fp.pins!==16)throw new Error("grille attendue : "+fp.style+"/"+fp.pins);
  const ps=padsOf(fp);
  if(ps.length!==16)throw new Error("16 billes attendues, "+ps.length);
  const xs=[...new Set(ps.map(q=>q.x.toFixed(3)))].sort();
  if(xs.length!==4)throw new Error("grille 4×4 attendue, "+xs.length+" colonnes");
  const d=Math.abs(+xs[1]-+xs[0]);
  if(Math.abs(d-fp.pitch)>1e-9)throw new Error("pas de la grille : "+d);
});
T("deux rangées : la rangée impaire est recentrée",()=>{
  const q=mkFp("Q1","","SOT-23",0);
  const ps=padsOf(q);
  if(ps.length!==3)throw new Error("3 pastilles attendues, "+ps.length);
  if(Math.abs(ps[2].y)>1e-9)throw new Error("la broche 3 d'un SOT-23 est dans l'axe : "+ps[2].y);
  if(Math.abs(ps[0].y+ps[1].y)>1e-9)throw new Error("broches 1 et 2 dissymétriques");
  if(!(ps[0].x<0&&ps[2].x>0))throw new Error("les deux rangées sont de part et d'autre");
  // brochage pair : rien ne change par rapport aux DIP d'avant, la broche 8
  // reste en face de la 1 et la 5 en face de la 4
  const u=mkFp("U1","","DIP-8",8), pu=padsOf(u);
  if(Math.abs(pu[7].y-pu[0].y)>1e-9||Math.abs(pu[4].y-pu[3].y)>1e-9)
    throw new Error("un DIP-8 doit rester face à face : "+pu.map(q=>q.y).join(" "));
});
T("netlist : le boîtier survit à une valeur absente",()=>{
  // format courant : « — » tient la colonne de la valeur
  const a=parseCompLine("    J1      —                 DIP-8");
  if(a.pkg!=="DIP-8"||a.value!=="")throw new Error("colonnes mal relues : "+JSON.stringify(a));
  // format d'avant : la colonne vide laissait les deux champs collés
  const b=parseCompLine("    J1                        DIP-8");
  if(b.pkg!=="DIP-8"||b.value!=="")throw new Error("ancienne netlist : "+JSON.stringify(b));
  // valeur seule, sans boîtier : elle reste une valeur
  const c=parseCompLine("    R1      10k               —      f2");
  if(c.value!=="10k"||c.pkg!=="")throw new Error("valeur seule : "+JSON.stringify(c));
  const d=parseCompLine("    R2      10k               0603   f3");
  if(d.value!=="10k"||d.pkg!=="0603")throw new Error("trois colonnes : "+JSON.stringify(d));
  // le numéro de feuille n'est pas un boîtier
  if(parseCompLine("    C1      100n              f1").pkg)
    throw new Error("« f1 » n'est pas un boîtier");
  if(parseCompLine("    ; repère  valeur  boîtier")===null){}   // les titres sont écartés en amont
});
T("import netlist : le boîtier pose l'empreinte",()=>{
  S.fps=[];S.tracks=[];S.vias=[];S.zones=[];clearSel();touch();
  importNetlist(`=== Composants ===
    R1      10k               0603
    U1      MCP6001           SOT-23-5
    U2      STM32F030         TQFP-48
    J1      —                 DIP-8
    U3      —                 XYZ-99

=== Feuille 1 — Principale ===
NET "N$1"
    R1.1
    U1.1
NET "N$2"
    U2.1
    J1.2
    U3.3
`,true);
  const f=r=>S.fps.find(x=>x.ref===r);
  if(S.fps.length!==5)throw new Error("5 empreintes attendues, "+S.fps.length);
  if(f("R1").style!=="chip"||Math.abs(f("R1").span-1.5)>1e-9)
    throw new Error("R1 devait arriver en puce 0603 : "+JSON.stringify(f("R1")));
  if(f("U1").style!=="sop"||f("U1").pins!==5)
    throw new Error("U1 devait arriver en SOT-23-5 : "+JSON.stringify(f("U1")));
  if(f("U2").style!=="quad"||f("U2").pins!==48)
    throw new Error("U2 devait arriver en TQFP-48 : "+JSON.stringify(f("U2")));
  // valeur absente : le boîtier passe quand même, et c'est bien un DIP
  if(f("J1").pkg!=="DIP-8"||f("J1").style!=="dip"||f("J1").pins!==8)
    throw new Error("J1 a perdu son boîtier : "+JSON.stringify(f("J1")));
  if(f("J1").value)throw new Error("le tiret n'est pas une valeur : "+f("J1").value);
  // boîtier inconnu : repli sur le brochage, et le nom est conservé tel quel
  if(f("U3").pkg!=="XYZ-99"||f("U3").style!=="row")
    throw new Error("U3 : repli attendu sur le brochage : "+JSON.stringify(f("U3")));
  // les nets sont bien accrochés aux pastilles créées par le boîtier
  if(f("U2").nets[1]!=="N$2")throw new Error("U2.1 devait porter N$2");
  if(padsOf(f("U2")).length!==48)throw new Error("48 pastilles attendues sur U2");
});
T("réimport : boîtier inchangé, réglages manuels conservés",()=>{
  const u=S.fps.find(x=>x.ref==="U1");
  u.x=12;u.y=8;u.pitch=1.1;u.span=3.4;u.rot=90;
  const res=applyNetlist(`=== Composants ===
    U1      MCP6001           SOT-23-5

=== Feuille 1 — Principale ===
NET "N$1"
    U1.1
`,false);
  if(res.repkg)throw new Error("aucun boîtier n'a changé : "+res.repkg+" refonte(s)");
  const v=S.fps.find(x=>x.ref==="U1");
  if(v.x!==12||v.y!==8||v.rot!==90)throw new Error("l'empreinte a bougé");
  if(Math.abs(v.pitch-1.1)>1e-9||Math.abs(v.span-3.4)>1e-9)
    throw new Error("les cotes retouchées à la main devaient rester : "+v.pitch+"/"+v.span);
});
T("réimport : boîtier changé au schéma, empreinte refaite",()=>{
  const before=S.fps.find(x=>x.ref==="U1");
  before.x=12;before.y=8;
  const res=applyNetlist(`=== Composants ===
    U1      MCP6001           MSOP-8

=== Feuille 1 — Principale ===
NET "N$1"
    U1.1
`,false);
  if(res.repkg!==1)throw new Error("une refonte attendue, "+res.repkg);
  const u=S.fps.find(x=>x.ref==="U1");
  if(u.pkg!=="MSOP-8"||u.pins!==8)throw new Error("U1 devait passer en MSOP-8 : "+JSON.stringify(u));
  if(Math.abs(u.pitch-0.65)>1e-9)throw new Error("pas du MSOP : "+u.pitch);
  if(u.x!==12||u.y!==8)throw new Error("changer de boîtier ne déplace pas l'empreinte");
});
T("panneau Propriétés : saisir un boîtier repose l'empreinte",()=>{
  S.fps=[];S.tracks=[];S.vias=[];S.zones=[];clearSel();touch();
  const fp=mkFp("U1","","",8);
  fp.x=20;fp.y=20;fp.nets={1:"GND",8:"+5V"};
  S.fps.push(fp);S.sel.fps.add(fp.id);touch();
  buildProps();
  const inp=$("pPkg");
  if(!inp)throw new Error("champ Boîtier absent du panneau");
  inp.value="TSSOP-8";inp.onchange();
  if(fp.style!=="sop"||Math.abs(fp.pitch-0.65)>1e-9)
    throw new Error("l'empreinte devait suivre le boîtier saisi : "+JSON.stringify(fp));
  // brochage câblé respecté : une broche 8 tenue par un net garde sa pastille
  inp.value="SOT-23";inp.onchange();
  if(fp.pins<8)throw new Error("les broches câblées devaient tenir : "+fp.pins);
  // boîtier hors table : la géométrie reste telle quelle
  const avant=JSON.stringify([fp.style,fp.pitch,fp.span,fp.pins]);
  inp.value="boîtier maison";inp.onchange();
  if(JSON.stringify([fp.style,fp.pitch,fp.span,fp.pins])!==avant)
    throw new Error("un boîtier inconnu ne doit rien changer");
  if(fp.pkg!=="boîtier maison")throw new Error("le nom saisi doit être conservé");
});
T("document : les styles quad et bga se relisent",()=>{
  S.fps=[];S.tracks=[];S.vias=[];S.zones=[];clearSel();touch();
  const a=mkFp("U1","","TQFP-32",0), b=mkFp("U2","","BGA-16",0);
  a.x=10;a.y=10;b.x=30;b.y=20;
  S.fps.push(a,b);touch();
  const doc=normDoc(JSON.parse(JSON.stringify(docObj())));
  const ra=doc.fps.find(f=>f.ref==="U1"), rb=doc.fps.find(f=>f.ref==="U2");
  if(ra.style!=="quad"||ra.pins!==32)throw new Error("style quad perdu : "+JSON.stringify(ra));
  if(rb.style!=="bga"||rb.pins!==16)throw new Error("style bga perdu : "+JSON.stringify(rb));
  if(Math.abs(ra.pitch-0.8)>1e-9)throw new Error("pas du TQFP-32 perdu : "+ra.pitch);
  // un style inventé retombe sur le brochage, comme les autres champs
  if(normDoc({fps:[{ref:"U3",pins:8,style:"quadrifoglio"}]}).fps[0].style!=="dip")
    throw new Error("un style inconnu doit retomber sur le brochage");
});

/* netlist de réimport : U1 change de boîtier au schéma et gagne une broche 10 */
const NET_MANUEL = [
  "=== Composants ===",
  "    U1      NE555             MSOP-8",
  "",
  "=== Feuille 1 — Principale ===",
  'NET "N$1"',
  "    U1.10",
  ""].join("\n");

/* =============================================================================
   Empreintes dessinées à la main
   ============================================================================= */
/* Figer une empreinte ne doit rien changer à l'œil : c'est le même cuivre, au
   micron près, seulement décrit autrement. Sans cela, passer en dessin manuel
   déplacerait le cuivre déjà routé. */
T("figer une empreinte ne déplace pas une pastille",()=>{
  S.fps=[];S.tracks=[];S.vias=[];S.zones=[];clearSel();touch();
  const fp=mkFp("U1","","DIP-8",8);
  fp.x=30;fp.y=25;S.fps.push(fp);touch();
  const avant=JSON.stringify(padsOf(fp)), bAvant=JSON.stringify(bodyOf(fp));
  if(fpFree(fp))throw new Error("une empreinte neuve est calculée");
  if(!fpFreeze(fp))throw new Error("le figeage devait avoir lieu");
  if(!fpFree(fp))throw new Error("l'empreinte devait passer en liste explicite");
  if(JSON.stringify(padsOf(fp))!==avant)
    throw new Error("les pastilles ont bougé :\n"+avant+"\n"+JSON.stringify(padsOf(fp)));
  if(JSON.stringify(bodyOf(fp))!==bAvant)throw new Error("le contour a bougé");
  if(fpFreeze(fp))throw new Error("figer deux fois ne fait rien de plus");
});
T("glisser une pastille fait passer l'empreinte en dessin à la main",()=>{
  S.fps=[];clearSel();touch();
  const fp=mkFp("U1","","SOIC-8",8);
  S.fps.push(fp);touch();
  const avant=padsOf(fp);
  if(!fpMovePad(fp,0,-4,-3))throw new Error("le déplacement devait aboutir");
  if(!fpFree(fp))throw new Error("le premier déplacement fige l'empreinte");
  const apres=padsOf(fp);
  if(apres[0].x!==-4||apres[0].y!==-3)
    throw new Error("pastille 1 mal posée : "+JSON.stringify(apres[0]));
  for(let i=1;i<apres.length;i++)
    if(apres[i].x!==avant[i].x||apres[i].y!==avant[i].y)
      throw new Error("la pastille "+apres[i].n+" n'avait pas à bouger");
  if(fpMovePad(fp,0,-4,-3))throw new Error("reposer au même endroit ne change rien");
  /* les cotes génériques ne commandent plus : le pas ne redessine rien */
  const fige=JSON.stringify(padsOf(fp));
  fp.pitch=5;
  if(JSON.stringify(padsOf(fp))!==fige)
    throw new Error("le pas ne doit plus rien commander sur une empreinte libre");
});
T("pastille : dimensions, forme et perçage bornés",()=>{
  S.fps=[];clearSel();touch();
  const fp=mkFp("J1","","",4);
  S.fps.push(fp);touch();
  fpSetPad(fp,0,"w",1.6);fpSetPad(fp,0,"h",1.6);fpSetPad(fp,0,"shape","circ");
  fpSetPad(fp,0,"drill",9);
  const q=padsOf(fp)[0];
  if(q.shape!=="circ")throw new Error("forme non prise : "+q.shape);
  if(q.drill>q.w-0.049)
    throw new Error("un perçage plus large que la pastille ne laisse pas de cuivre : "+
      q.drill+" pour "+q.w);
  fpSetPad(fp,0,"w",0.5);
  if(padsOf(fp)[0].drill>0.451)
    throw new Error("retailler la pastille doit recaler le perçage : "+padsOf(fp)[0].drill);
  fpSetPad(fp,0,"w",-3);
  if(padsOf(fp)[0].w<0.05)throw new Error("une pastille garde une largeur positive");
  if(fpSetPad(fp,0,"couleur","rouge"))throw new Error("champ inconnu : rien à faire");
});
T("supprimer une pastille ne renumérote pas les autres",()=>{
  S.fps=[];clearSel();touch();
  const fp=mkFp("U1","","DIP-8",8);
  fp.nets={1:"GND",4:"N$1",8:"+5V"};
  S.fps.push(fp);touch();
  fpFreeze(fp);
  if(!fpDelPad(fp,2))throw new Error("la pastille 3 devait partir");
  const ns=padsOf(fp).map(q=>q.n).join(" ");
  if(ns!=="1 2 4 5 6 7 8")throw new Error("numéros attendus 1 2 4 5 6 7 8, obtenus "+ns);
  if(fp.pins!==8)throw new Error("le brochage reste celui du plus grand numéro : "+fp.pins);
  const q4=padsOf(fp).find(q=>q.n===4);
  if(q4.net!=="N$1")throw new Error("le net de la broche 4 devait suivre son numéro");
  /* la dernière pastille ne se retire pas : une empreinte sans cuivre ne
     s'attrape plus à la souris */
  while(fp.pads.length>1)fpDelPad(fp,0);
  if(fpDelPad(fp,0))throw new Error("la dernière pastille devait résister");
  if(!padsOf(fp).length)throw new Error("une empreinte garde au moins une pastille");
});
T("nombre de pastilles : ajout à la suite, retrait par la fin",()=>{
  S.fps=[];clearSel();touch();
  const fp=mkFp("J1","","",4);
  S.fps.push(fp);touch();
  fpFreeze(fp);
  const avant=padsOf(fp).map(q=>[q.x,q.y].join()).join(" ");
  fpSetPins(fp,6);
  const ps=padsOf(fp);
  if(ps.length!==6)throw new Error("6 pastilles attendues, "+ps.length);
  if(ps.map(q=>[q.x,q.y].join()).slice(0,4).join(" ")!==avant)
    throw new Error("les pastilles déjà placées n'avaient pas à bouger");
  if(ps[4].n!==5||ps[5].n!==6)throw new Error("les nouvelles se numérotent à la suite");
  fpSetPins(fp,3);
  if(padsOf(fp).length!==3)throw new Error("3 pastilles attendues après retrait");
  if(fp.pins!==3)throw new Error("le brochage suit : "+fp.pins);
});
T("retour au calcul : le boîtier reprend la main",()=>{
  S.fps=[];clearSel();touch();
  const fp=mkFp("U1","","TSSOP-8",8);
  S.fps.push(fp);touch();
  const attendu=JSON.stringify(padsOf(fp));
  fpMovePad(fp,0,-9,-9);
  fpSetBody(fp,{x1:-9,y1:-9,x2:9,y2:9});
  if(!fpGeneric(fp))throw new Error("le retour au calcul devait avoir lieu");
  if(fpFree(fp)||fp.body)throw new Error("ni pastilles ni contour ne doivent rester");
  if(JSON.stringify(padsOf(fp))!==attendu)
    throw new Error("le TSSOP-8 devait être reposé à l'identique");
  if(fpGeneric(fp))throw new Error("une empreinte déjà calculée n'a rien à rendre");
});
T("contour de sérigraphie imposé puis rendu au calcul",()=>{
  S.fps=[];clearSel();touch();
  const fp=mkFp("U1","","DIP-8",8);
  S.fps.push(fp);touch();
  const auto=JSON.stringify(fpAutoBody(fp));
  fpSetBody(fp,{x1:2,y1:2,x2:-6,y2:-4});             // coins dans le désordre
  const b=bodyOf(fp);
  if(b.x1!==-6||b.y1!==-4||b.x2!==2||b.y2!==2)
    throw new Error("le rectangle devait être remis d'aplomb : "+JSON.stringify(b));
  if(JSON.stringify(fpAutoBody(fp))!==auto)
    throw new Error("le contour automatique ne dépend pas du contour imposé");
  fpSetBody(fp,{x1:0,y1:0,x2:0,y2:0});
  const d=bodyOf(fp);
  if(d.x2-d.x1<0.1||d.y2-d.y1<0.1)throw new Error("un contour plat n'est pas un contour");
  fpSetBody(fp,null);
  if(JSON.stringify(bodyOf(fp))!==auto)throw new Error("le calcul devait reprendre la main");
});
T("pastilles superposées : la fenêtre les montre, le DRC les compte",()=>{
  S.fps=[];S.tracks=[];S.vias=[];S.zones=[];clearSel();touch();
  const fp=mkFp("U1","","",2);
  fp.x=40;fp.y=30;fp.nets={1:"GND",2:"+5V"};
  S.fps.push(fp);
  fpFreeze(fp);
  fpSetPad(fp,1,"x",padsOf(fp)[0].x);                // la pastille 2 sur la 1
  fpSetPad(fp,1,"y",padsOf(fp)[0].y);
  touch();
  const bad=feOverlap(padsOf(fp));
  if(bad.size!==2)throw new Error("les deux pastilles devaient être signalées");
  if(!runDrc().some(e=>/superpos/.test(e.msg)))
    throw new Error("deux nets superposés sont un court-circuit : le DRC doit le dire");
  /* mêmes pastilles, même net : c'est un choix de dessin, pas un défaut */
  fp.nets={1:"GND",2:"GND"};touch();
  if(runDrc().some(e=>/superpos/.test(e.msg)))
    throw new Error("deux pastilles d'un même net peuvent se recouvrir");
});
T("document : une empreinte dessinée fait l'aller-retour sans rien perdre",()=>{
  S.fps=[];S.tracks=[];S.vias=[];S.zones=[];clearSel();touch();
  const fp=mkFp("U1","NE555","DIP-8",8);
  fp.x=20;fp.y=15;fp.nets={1:"GND",8:"+5V"};
  S.fps.push(fp);
  fpFreeze(fp);
  fpMovePad(fp,0,-3.81,-4.5);
  fpSetPad(fp,0,"shape","circ");
  fpSetPad(fp,0,"drill",0.8);
  fpSetBody(fp,{x1:-4,y1:-5,x2:4,y2:5});
  touch();
  const doc=docObj();
  const d=firstDiff(JSON.parse(JSON.stringify(doc)),
                    normDoc(JSON.parse(JSON.stringify(doc))),"doc");
  if(d)throw new Error("la relecture a changé le document : "+d);
  /* fichier retouché à la main : le brochage se relit sur les pastilles */
  const bricole=normDoc({fps:[{ref:"U9",pins:2,
    pads:[{n:1,x:0,y:0,w:1,h:1},{n:7,x:2,y:0,w:1,h:1},{x:"nulle part"}]}]});
  if(bricole.fps[0].pins!==7)
    throw new Error("sept broches attendues d'après les pastilles : "+bricole.fps[0].pins);
  if(bricole.fps[0].pads.length!==2)
    throw new Error("la pastille sans centre devait être écartée");
  if(normDoc({fps:[{ref:"U9",pins:8,pads:[]}]}).fps[0].pads)
    throw new Error("une liste vide rend l'empreinte au calcul");
});
T("empreinte dessinée : ni le boîtier ni la netlist ne la refont",()=>{
  S.fps=[];S.tracks=[];S.vias=[];S.zones=[];clearSel();touch();
  const fp=mkFp("U1","","DIP-8",8);
  fp.x=20;fp.y=15;S.fps.push(fp);touch();
  fpMovePad(fp,0,-5,-5);
  const dessin=JSON.stringify(padsOf(fp));
  if(applyPkgGeom(fp))throw new Error("le boîtier ne doit pas refaire un dessin manuel");
  const res=applyNetlist(NET_MANUEL,false);
  if(res.repkg)throw new Error("aucune refonte ne doit être annoncée : "+res.repkg);
  const u=S.fps.find(f=>f.ref==="U1");
  if(u.pkg!=="MSOP-8")throw new Error("le nom du boîtier suit le schéma");
  const apres=JSON.parse(dessin), maintenant=padsOf(u);
  for(const q of apres){
    const r=maintenant.find(x=>x.n===q.n);
    if(!r||r.x!==q.x||r.y!==q.y)throw new Error("la pastille "+q.n+" a bougé");
  }
  /* une broche câblée au-delà du dessin reçoit une pastille : rien de ce que
     porte la netlist ne peut rester sans cuivre */
  if(u.pins<10)throw new Error("la broche 10 câblée doit avoir sa pastille : "+u.pins);
  if(!padsOf(u).some(q=>q.n===10))throw new Error("pastille 10 absente");
});

/* =============================================================================
   Bibliothèque d'empreintes
   ============================================================================= */
T("fenêtre d'empreinte ouverte : le clavier de la carte se tait",()=>{
  S.fps=[];S.tracks=[];S.vias=[];S.zones=[];clearSel();touch();
  const fp=mkFp("U1","","DIP-8",8);
  fp.x=20;fp.y=15;S.fps.push(fp);S.sel.fps.add(fp.id);touch();
  FE.open=true;FE.fp=fp;                    /* la fenêtre elle-même a besoin du DOM */
  key("Delete");
  if(S.fps.length!==1)throw new Error("Suppr ne doit pas effacer l'empreinte en cours d'édition");
  key("r");
  if(fp.rot!==0)throw new Error("R ne doit pas faire pivoter la carte sous la fenêtre");
  key("Escape");
  if(feIsOpen())throw new Error("Échap devait fermer la fenêtre");
  key("Delete");
  if(S.fps.length!==0)throw new Error("fenêtre fermée : le clavier reprend la main");
});

T("bibliothèque : enregistrer, relire, appliquer",()=>{
  localStorage.removeItem(FPLIB_KEY);
  S.fps=[];S.tracks=[];S.vias=[];S.zones=[];clearSel();touch();
  const src=mkFp("U1","","DIP-8",8);
  src.x=20;src.y=15;S.fps.push(src);
  fpMovePad(src,0,-6,-6);
  fpSetPad(src,0,"drill",0.9);
  const def=fpLibPut(fpDefOf(src,"DIP-8 maison"));
  if(!def)throw new Error("l'enregistrement a échoué");
  if(fpLibNames().join()!=="DIP-8 maison")throw new Error("bibliothèque : "+fpLibNames());
  const cible=mkFp("U2","LM358","SOIC-8",8);
  cible.x=60;cible.y=40;cible.rot=90;cible.side=1;cible.nets={1:"GND",8:"+5V"};
  S.fps.push(cible);touch();
  if(!fpApplyDef(cible,fpLibGet("DIP-8 maison")))throw new Error("application refusée");
  const forme=ps=>JSON.stringify(ps.map(q=>[q.n,q.x,q.y,q.w,q.h,q.shape,q.drill]));
  if(forme(padsOf(cible))!==forme(padsOf(src)))
    throw new Error("le cuivre devait être le même");
  if(cible.ref!=="U2"||cible.value!=="LM358"||cible.pkg!=="SOIC-8")
    throw new Error("le repère, la valeur et le boîtier appartiennent à la carte");
  if(cible.x!==60||cible.y!==40||cible.rot!==90||cible.side!==1)
    throw new Error("la position et la face ne bougent pas");
  if(padsOf(cible).find(q=>q.n===8).net!=="+5V")throw new Error("les nets devaient rester");
  /* une empreinte calculée s'enregistre aussi : elle se recalcule à l'arrivée */
  const gen=mkFp("R1","","0805",2);
  const d2=fpLibPut(fpDefOf(gen,"0805 large"));
  if(d2.pads)throw new Error("une empreinte calculée ne porte pas de pastilles");
  if(!fpApplyDef(cible,d2))throw new Error("application de l'empreinte calculée refusée");
  if(fpFree(cible))throw new Error("elle devait rendre la cible au calcul");
  if(cible.style!=="chip")throw new Error("style attendu chip : "+cible.style);
  if(cible.pins<8)throw new Error("les broches câblées font plancher : "+cible.pins);
  localStorage.removeItem(FPLIB_KEY);
});
T("bibliothèque : lecture défensive et fusion des noms",()=>{
  localStorage.removeItem(FPLIB_KEY);
  if(!fpLibParse("ceci n'est pas du json").err)
    throw new Error("un fichier illisible doit se dire");
  if(!fpLibParse('{"format":"pcbfp-1","footprints":[]}').err)
    throw new Error("un fichier sans empreinte exploitable doit se dire");
  if(!fpLibParse('[{"pins":8}]').err)throw new Error("une empreinte sans nom est refusée");
  /* définition seule, sans enveloppe : acceptée */
  const r=fpLibParse('{"name":"pont 4 broches","pins":4,"style":"row","pitch":2.54}');
  if(r.err)throw new Error("une définition seule devait passer : "+r.err);
  if(r.defs[0].name!=="pont 4 broches")throw new Error("nom perdu");
  fpLibMerge(r.defs);
  /* même nom, même empreinte : une seule entrée */
  fpLibMerge(fpLibParse('{"name":"pont 4 broches","pins":4,"style":"row","pitch":2.54}').defs);
  if(fpLibNames().length!==1)throw new Error("le doublon exact ne crée rien : "+fpLibNames());
  /* même nom, empreinte différente : renommée, jamais écrasée en silence */
  const m=fpLibMerge(fpLibParse('{"name":"pont 4 broches","pins":6,"style":"row","pitch":2}').defs);
  if(m.renamed.length!==1)throw new Error("le conflit devait renommer : "+JSON.stringify(m));
  if(fpLibNames().length!==2)throw new Error("deux entrées attendues : "+fpLibNames());
  if(fpLibGet("pont 4 broches").pins!==4)throw new Error("l'originale ne bouge pas");
  /* aller-retour par le fichier d'échange */
  const f=fpLibFile(null);
  if(f.format!==FPLIB_FORMAT||f.footprints.length!==2)
    throw new Error("fichier d'échange : "+JSON.stringify(f).slice(0,120));
  localStorage.removeItem(FPLIB_KEY);
  const back=fpLibParse(JSON.stringify(f));
  if(back.err||back.defs.length!==2)throw new Error("le fichier ne se relit pas");
  fpLibMerge(back.defs);
  if(fpLibNames().length!==2)throw new Error("les deux empreintes devaient revenir");
  /* un stockage pollué ne casse rien */
  localStorage.setItem(FPLIB_KEY,'{"x":{"name":"","pins":"beaucoup"},"y":42}');
  if(Object.keys(fpLibAll()).length)throw new Error("des entrées invalides devaient partir");
  localStorage.setItem(FPLIB_KEY,"pas du json");
  if(Object.keys(fpLibAll()).length)throw new Error("un contenu illisible devait être ignoré");
  if(fpLibDel("absente"))throw new Error("supprimer l'absent ne fait rien");
  localStorage.removeItem(FPLIB_KEY);
});

/* =============================================================================
   Formes de pastille, rotation, origine de l'empreinte
   ============================================================================= */
T("quatre formes de pastille, un rayon de coin chacune",()=>{
  if(padRadius("sharp",2,1)!==0)throw new Error("les angles droits n'ont pas de rayon");
  if(padRadius("oval",2,1)!==0.5)throw new Error("l'oblong s'arrondit sur son petit côté");
  if(Math.abs(padRadius("rect",2,1)-0.22)>1e-9)throw new Error("le rectangle reste adouci");
  /* une forme inconnue retombe sur celle des empreintes calculées */
  if(padShape("étoile")!=="rect")throw new Error("forme inconnue : rectangle adouci");
  if(padShape("oval")!=="oval")throw new Error("l'oblong doit être reconnu");
  /* l'oblong est mesuré pour ce qu'il est : un rectangle à bouts ronds */
  const ov={x:0,y:0,w:2,h:1,shape:"oval",rot:0};
  const sh={x:0,y:0,w:2,h:1,shape:"sharp",rot:0};
  if(Math.abs(padDist(1,0.5,ov)-(Math.hypot(0.5,0.5)-0.5))>1e-9)
    throw new Error("coin d'un oblong : "+padDist(1,0.5,ov));
  if(padDist(1,0.5,sh)!==0)throw new Error("le coin d'un rectangle droit est du cuivre");
  /* tournée d'un quart de tour, la même pastille se mesure dans l'autre sens */
  const t={x:0,y:0,w:2,h:1,shape:"sharp",rot:Math.PI/2};
  if(Math.abs(padDist(0,1,t))>1e-9)throw new Error("tournée de 90°, elle atteint y=1");
  if(Math.abs(padDist(1,0,t)-0.5)>1e-9)throw new Error("et ne va plus qu'à x=0,5");
});
T("rotation d'une pastille : cumulée à l'empreinte, inversée par le miroir",()=>{
  S.fps=[];S.tracks=[];S.vias=[];S.zones=[];clearSel();touch();
  const fp=mkFp("J1","","",2);
  fp.x=20;fp.y=20;S.fps.push(fp);touch();
  fpSetPad(fp,0,"rot",30);
  if(padsOf(fp)[0].rot!==30)throw new Error("rotation en degrés sur la pastille");
  if(Math.abs(padsWorld(fp)[0].rot-30*Math.PI/180)>1e-9)
    throw new Error("padsWorld donne des radians : "+padsWorld(fp)[0].rot);
  fp.rot=90;
  if(Math.abs(padsWorld(fp)[0].rot-120*Math.PI/180)>1e-9)
    throw new Error("les deux rotations s'ajoutent : "+padsWorld(fp)[0].rot);
  fp.side=1;
  if(Math.abs(padsWorld(fp)[0].rot-60*Math.PI/180)>1e-9)
    throw new Error("retournée, la rotation propre s'inverse : "+padsWorld(fp)[0].rot);
  /* angle ramené dans [0, 360[ : -90° et 270° sont la même pastille */
  fpSetPad(fp,0,"rot",-90);
  if(padsOf(fp)[0].rot!==270)throw new Error("angle attendu 270, obtenu "+padsOf(fp)[0].rot);
  /* l'encombrement d'une pastille tournée est la boîte droite qui la contient */
  const h0=padHalf({w:4,h:1,rot:0}), h90=padHalf({w:4,h:1,rot:90});
  if(Math.abs(h0.x-2)>1e-9||Math.abs(h0.y-0.5)>1e-9)
    throw new Error("sans rotation, c'est w/2 et h/2 : "+JSON.stringify(h0));
  if(Math.abs(h90.x-0.5)>1e-9||Math.abs(h90.y-2)>1e-9)
    throw new Error("tournée de 90°, les deux s'échangent : "+JSON.stringify(h90));
  /* et le contour de sérigraphie suit cet encombrement */
  const plat=mkFp("J2","","",1);
  S.fps.push(plat);
  fpSetPad(plat,0,"w",4);fpSetPad(plat,0,"h",1);fpSetPad(plat,0,"shape","sharp");
  const large=fpAutoBody(plat);
  if(large.x2-large.x1<large.y2-large.y1)throw new Error("contour couché attendu");
  fpSetPad(plat,0,"rot",90);
  const haut=fpAutoBody(plat);
  if(haut.y2-haut.y1<haut.x2-haut.x1)
    throw new Error("pastille debout : contour debout : "+JSON.stringify(haut));
  if(Math.abs((haut.y2-haut.y1)-(large.x2-large.x1)-0.2)>1e-6)
    throw new Error("le contour garde ses marges : 0,35 en haut et en bas, "+
      "0,25 à gauche et à droite : "+JSON.stringify(haut));
});
T("ouvertures Gerber : rond, rectangle, oblong, et leurs rotations",()=>{
  const ap=q=>{const A=apSet();apForPad(A,q,0);return A.defs.join(" ")+" "+A.macros.join(" ");};
  if(!/ADD10C,1\.5/.test(ap({x:0,y:0,w:1.5,h:1.5,shape:"circ",rot:0})))
    throw new Error("le rond est une ouverture C : "+ap({x:0,y:0,w:1.5,h:1.5,shape:"circ",rot:0}));
  if(!/ADD10R,2\.0*X1\.0*/.test(ap({x:0,y:0,w:2,h:1,shape:"sharp",rot:0})))
    throw new Error("le rectangle est une ouverture R : "+ap({x:0,y:0,w:2,h:1,shape:"sharp",rot:0}));
  /* tourné d'un quart de tour, un rectangle échange ses côtés : pas de macro */
  const r90=ap({x:0,y:0,w:2,h:1,shape:"sharp",rot:Math.PI/2});
  if(!/ADD10R,1\.0*X2\.0*/.test(r90))throw new Error("R tournée : "+r90);
  /* l'oblong a son ouverture O, et une macro dès qu'il est de biais */
  const o=ap({x:0,y:0,w:2,h:1,shape:"oval",rot:0});
  if(!/ADD10O,2\.0*X1\.0*/.test(o))throw new Error("l'oblong est une ouverture O : "+o);
  const ov=ap({x:0,y:0,w:1,h:2,shape:"oval",rot:0});
  if(!/ADD10O,1\.0*X2\.0*/.test(ov))
    throw new Error("oblong vertical : le grand axe reste le grand axe : "+ov);
  const ob=ap({x:0,y:0,w:2,h:1,shape:"oval",rot:Math.PI/6});
  if(!/AMOBR/.test(ob)||!/ADD10OBR,/.test(ob))
    throw new Error("oblong de biais : macro attendue : "+ob);
  /* un angle quelconque sur un rectangle garde la macro de rectangle tourné */
  if(!/AMRRECT/.test(ap({x:0,y:0,w:2,h:1,shape:"sharp",rot:Math.PI/6})))
    throw new Error("rectangle de biais : macro RRECT attendue");
});
T("déplacer l'origine ne déplace pas le cuivre",()=>{
  S.fps=[];S.tracks=[];S.vias=[];S.zones=[];clearSel();touch();
  const fp=mkFp("U1","","DIP-8",8);
  fp.x=30;fp.y=25;fp.rot=90;S.fps.push(fp);touch();
  const avant=padsWorld(fp).map(q=>[q.n,q.x,q.y].join());
  const cible=padsOf(fp)[0];                  // l'origine s'en va sur la pastille 1
  if(!fpMoveOrigin(fp,cible.x,cible.y))throw new Error("le déplacement devait aboutir");
  if(!fpFree(fp))throw new Error("déplacer l'origine fige l'empreinte");
  const apres=padsWorld(fp).map(q=>[q.n,q.x,q.y].join());
  if(apres.join(" ")!==avant.join(" "))
    throw new Error("le cuivre a bougé :\n"+avant.join(" ")+"\n"+apres.join(" "));
  /* la pastille 1 est maintenant à l'origine du repère local */
  const p1=padsOf(fp)[0];
  if(Math.abs(p1.x)>1e-9||Math.abs(p1.y)>1e-9)
    throw new Error("la pastille 1 devait tomber sur l'origine : "+JSON.stringify(p1));
  if(fpMoveOrigin(fp,0,0))throw new Error("ne rien déplacer ne change rien");
});
T("origine ramenée au centre du composant",()=>{
  S.fps=[];S.tracks=[];S.vias=[];S.zones=[];clearSel();touch();
  const fp=mkFp("U1","","DIP-8",8);
  fp.x=30;fp.y=25;S.fps.push(fp);touch();
  /* une empreinte calculée est centrée d'office : on ne la fige pas pour rien */
  if(!fpIsCentered(fp))throw new Error("une empreinte calculée est centrée");
  if(fpCenterOrigin(fp))throw new Error("rien à recentrer");
  if(fpFree(fp))throw new Error("recentrer une empreinte centrée ne doit pas la figer");
  /* un dessin décentré revient au centre, sans déplacer le cuivre */
  fpMovePad(fp,0,-12,-9);
  if(fpIsCentered(fp))throw new Error("le dessin est maintenant décentré");
  const avant=padsWorld(fp).map(q=>[q.n,q.x,q.y].join()).join(" ");
  if(!fpCenterOrigin(fp))throw new Error("le recentrage devait avoir lieu");
  if(!fpIsCentered(fp))throw new Error("après recentrage, l'origine est au centre");
  if(padsWorld(fp).map(q=>[q.n,q.x,q.y].join()).join(" ")!==avant)
    throw new Error("recentrer l'origine ne déplace pas le cuivre");
  /* le centre est celui de l'encombrement : pastilles et contour réunis */
  const b=fpLocalBox(fp);
  if(Math.abs(b.x1+b.x2)>1e-3||Math.abs(b.y1+b.y2)>1e-3)
    throw new Error("encombrement mal centré : "+JSON.stringify(b));
});
T("document : formes, rotations et origine déplacée se relisent",()=>{
  S.fps=[];S.tracks=[];S.vias=[];S.zones=[];clearSel();touch();
  const fp=mkFp("J1","","",4);
  fp.x=20;fp.y=15;fp.nets={1:"GND"};S.fps.push(fp);
  fpFreeze(fp);
  fpSetPad(fp,0,"shape","oval");fpSetPad(fp,0,"rot",45);
  fpSetPad(fp,1,"shape","sharp");
  fpSetPad(fp,2,"shape","circ");
  fpMoveOrigin(fp,1.27,0);
  touch();
  const doc=docObj();
  const d=firstDiff(JSON.parse(JSON.stringify(doc)),
                    normDoc(JSON.parse(JSON.stringify(doc))),"doc");
  if(d)throw new Error("la relecture a changé le document : "+d);
  const relu=normDoc(JSON.parse(JSON.stringify(doc))).fps[0];
  if(relu.pads[0].shape!=="oval"||relu.pads[0].rot!==45)
    throw new Error("forme ou rotation perdue : "+JSON.stringify(relu.pads[0]));
  if(relu.pads[1].shape!=="sharp")throw new Error("angles droits perdus");
  /* un fichier retouché : forme inventée, angle absurde */
  const b=normDoc({fps:[{ref:"U9",pins:1,
    pads:[{n:1,x:0,y:0,w:1,h:1,shape:"losange",rot:"beaucoup"},
          {n:2,x:2,y:0,w:1,h:1,shape:"oval",rot:-450}]}]}).fps[0];
  if(b.pads[0].shape!=="rect"||b.pads[0].rot!==0)
    throw new Error("forme et angle illisibles : valeurs sûres attendues : "+
      JSON.stringify(b.pads[0]));
  if(b.pads[1].rot!==270)throw new Error("-450° vaut 270° : "+b.pads[1].rot);
});

/* =============================================================================
   Repère de broche 1
   ============================================================================= */
T("repère de broche 1 : d'office là où il sert, pas sur un passif",()=>{
  S.fps=[];S.tracks=[];S.vias=[];S.zones=[];clearSel();touch();
  const mk=(ref,pkg,pins)=>{const f=mkFp(ref,"",pkg,pins||0);f.x=40;f.y=30;
    S.fps.push(f);return f;};
  const u1=mk("U1","SOIC-8",8), r1=mk("R1","0603"), c1=mk("C1","0603");
  const l1=mk("L1","0805"), d1=mk("D1","SOD-123"), ce=mk("C2","TO-92",2);
  touch();
  if(!fpMark(u1))throw new Error("un circuit intégré a besoin de son repère");
  if(fpMark(r1))throw new Error("une résistance n'a pas de sens de pose");
  if(fpMark(l1))throw new Error("une inductance non plus");
  if(fpMark(c1))throw new Error("un condensateur CMS non polarisé non plus");
  if(!fpMark(d1))throw new Error("une diode est polarisée : le repère reste");
  if(!fpMark(ce))throw new Error("un condensateur non-CMS peut être polarisé : "+
    "le repère vaut mieux qu'un doute");
  /* la place d'usine est dehors, du côté de la broche 1 */
  const m=fpMark(u1), p1=padsOf(u1)[0];
  if(Math.hypot(m.x-p1.x,m.y-p1.y)<Math.max(p1.w,p1.h)/2)
    throw new Error("le point ne doit pas être posé sur le cuivre");
  if(Math.abs(m.x)<Math.abs(p1.x))throw new Error("il est plus dehors que la pastille");
  if(m.d!==MARK_D)throw new Error("diamètre d'usine attendu : "+m.d);
});
T("repère de broche 1 : montré, déplacé, retiré, et le document s'en souvient",()=>{
  S.fps=[];S.tracks=[];S.vias=[];S.zones=[];clearSel();touch();
  const fp=mkFp("R1","10k","0603",2);
  fp.x=30;fp.y=20;S.fps.push(fp);touch();
  if(fpMark(fp))throw new Error("une résistance n'en a pas d'office");
  /* on en veut un quand même : il est écrit, et la règle ne décide plus */
  fpSetMark(fp,true);
  const m=fpMark(fp);
  if(!m)throw new Error("la case cochée devait poser un point");
  if(!fpMoveMark(fp,1.5,-1.2))throw new Error("le déplacement devait aboutir");
  if(fpMoveMark(fp,1.5,-1.2))throw new Error("reposer au même endroit ne change rien");
  fpSetMarkD(fp,0.8);
  const m2=fpMark(fp);
  if(m2.x!==1.5||m2.y!==-1.2||m2.d!==0.8)throw new Error("point mal réglé : "+JSON.stringify(m2));
  /* déplacer l'origine emmène le point : il est posé dans le repère local */
  const avant=fpXform(fp)(m2.x,m2.y);
  fpMoveOrigin(fp,0.5,0.5);
  const apres=fpXform(fp)(fpMark(fp).x,fpMark(fp).y);
  if(Math.abs(avant.x-apres.x)>1e-6||Math.abs(avant.y-apres.y)>1e-6)
    throw new Error("le point a sauté sur la carte : "+JSON.stringify([avant,apres]));
  /* retiré à la main : la règle automatique ne doit pas le faire revenir */
  fpSetMark(fp,false);
  if(fpMark(fp))throw new Error("retiré, il reste retiré");
  const u=mkFp("U1","","SOIC-8",8);
  u.x=50;u.y=20;fpSetMark(u,false);S.fps.push(u);touch();
  if(fpMark(u))throw new Error("retiré sur un CI aussi");
  /* aller-retour par le document, dans les deux états */
  const doc=docObj();
  const d=firstDiff(JSON.parse(JSON.stringify(doc)),
                    normDoc(JSON.parse(JSON.stringify(doc))),"doc");
  if(d)throw new Error("la relecture a changé le document : "+d);
  const relu=normDoc(JSON.parse(JSON.stringify(doc)));
  if(fpMark(relu.fps.find(f=>f.ref==="U1")))
    throw new Error("le retrait devait survivre à la relecture");
  /* un fichier retouché : ni point illisible, ni diamètre absurde */
  const b=normDoc({fps:[{ref:"U9",pins:2,mark:{x:"ici",y:0}},
                        {ref:"U8",pins:2,mark:{x:1,y:1,d:900}},
                        {ref:"U7",pins:2,mark:"oui"}]}).fps;
  if(b[0].mark)throw new Error("un point sans coordonnées est écarté");
  if(b[1].mark.d>10)throw new Error("diamètre borné : "+b[1].mark.d);
  if(b[2].mark)throw new Error("un point qui n'est pas un point est écarté");
});
T("sérigraphie : le point sort sur le film, et seulement s'il existe",()=>{
  S.fps=[];S.tracks=[];S.vias=[];S.zones=[];clearSel();touch();
  const u=mkFp("U1","","SOIC-8",8);
  u.x=30;u.y=25;S.fps.push(u);touch();
  const film=gerberSilk(0);
  if(!/%ADD\d+C,0\.4000\*%/.test(film))
    throw new Error("le point de repère devait donner une ouverture C,0.4");
  /* le diamètre réglé est celui du film */
  fpSetMark(u,true);fpSetMarkD(u,0.9);touch();
  if(!/%ADD\d+C,0\.9000\*%/.test(gerberSilk(0)))
    throw new Error("le diamètre réglé devait sortir tel quel");
  /* retiré : plus rien */
  fpSetMark(u,false);touch();
  if(/%ADD\d+C,0\.[49]000\*%/.test(gerberSilk(0)))
    throw new Error("point retiré : rien ne doit sortir");
  /* une résistance n'en a pas, et le film s'en passe aussi */
  S.fps=[];
  const r=mkFp("R1","","0603",2);
  r.x=30;r.y=25;S.fps.push(r);touch();
  if(/%ADD\d+C,0\.4000\*%/.test(gerberSilk(0)))
    throw new Error("pas de repère sur un passif, film compris");
});

/* ==========================================================================
   Paires différentielles
   Le couple de nets, la règle qui le borne, le tracé couplé et son contrôle.
   ========================================================================== */
const NET_DP=`* Netlist — Éditeur schématique
* 1 feuille(s) · 2 net(s)

=== Composants ===
    J1      USB               DIP-4             f1
    J2      USB               DIP-4             f1

=== Feuille 1 — Principale ===

NET "USB_DP"
    J1.2
    J2.2

NET "USB_DM"
    J1.3
    J2.3
`;
/* Deux connecteurs posés à plat, la paire à router de l'un à l'autre. Rendu :
   les deux pastilles de départ, les deux d'arrivée. */
function carteDp(cu){
  S.fps=[];S.tracks=[];S.vias=[];S.zones=[];S.cuts=[];S.dpPairs=[];S.dpRules=[];
  S.dp=null;clearSel();
  setCuCount(cu||2,true);
  importNetlist(NET_DP,true);
  const j1=S.fps.find(f=>f.ref==="J1"), j2=S.fps.find(f=>f.ref==="J2");
  j1.x=20;j1.y=20;j2.x=60;j2.y=40;
  touch();
  const pads=f=>{
    const l=padsWorld(f);
    return {p:l.find(q=>q.net==="USB_DP"),n:l.find(q=>q.net==="USB_DM")};
  };
  return {j1:j1,j2:j2,a:pads(j1),b:pads(j2)};
}
/* Écart entre bords de cuivre au point le plus proche : c'est ce que la règle
   borne, et ce que le graveur verra. */
function ecartDp(x,y,l){
  const P=S.tracks.filter(t=>t.net==="USB_DP"&&t.l===l);
  const N=S.tracks.filter(t=>t.net==="USB_DM"&&t.l===l);
  let best=Infinity;
  for(const t of P){
    const c=projOnSeg(x,y,t);
    if(dist(x,y,c.x,c.y)>0.6)continue;
    for(const o of N){
      const d=projOnSeg(c.x,c.y,o);
      best=Math.min(best,dist(c.x,c.y,d.x,d.y)-t.w/2-o.w/2);
    }
  }
  return best;
}
T("les noms de net trahissent le couple",()=>{
  const m=dpMatch("USB_DP","USB_DM");
  if(!m||m.p!=="USB_DP"||m.n!=="USB_DM")throw new Error("USB_DP/USB_DM : "+JSON.stringify(m));
  if(dpMatch("USB_DM","USB_DP").p!=="USB_DP")
    throw new Error("l'ordre des arguments ne doit rien changer");
  const s=dpMatch("CAN_P","CAN_N");
  if(!s||s.base!=="CAN")throw new Error("CAN_P/CAN_N : "+JSON.stringify(s));
  if(!dpMatch("D+","D-"))throw new Error("D+/D- devait former une paire");
  if(dpMatch("GND","VCC"))throw new Error("GND et VCC ne forment pas une paire");
  if(dpMatch("USB_DP","CAN_N"))throw new Error("deux bases différentes ne s'apparient pas");
  // la casse du suffixe se recopie : usb_dp appelle usb_dm, pas usb_DM
  const bas=dpSplit("usb_dp").find(x=>x.suf==="dp");
  if(dpMateName(bas)!=="usb_dm")throw new Error("casse perdue : "+dpMateName(bas));
});
T("détection : seules les paires dont les deux nets existent",()=>{
  carteDp();
  const d=dpDetect();
  if(d.length!==1)throw new Error("1 paire attendue, "+d.length);
  if(d[0].p!=="USB_DP"||d[0].n!=="USB_DM"||d[0].name!=="USB")
    throw new Error("paire déduite : "+JSON.stringify(d[0]));
  if(dpAutoAll()!==1)throw new Error("la détection devait créer une paire");
  if(dpAutoAll()!==0)throw new Error("une paire déjà déclarée ne se recrée pas");
  if(dpOfNet("USB_DP")!==dpOfNet("USB_DM"))
    throw new Error("les deux nets doivent désigner la même paire");
  if(dpMateNet("USB_DP")!=="USB_DM")throw new Error("net complémentaire perdu");
});
T("créer une paire depuis deux pistes sélectionnées",()=>{
  carteDp();
  push();
  const t1={l:0,net:"USB_DP",w:0.2,x1:10,y1:10,x2:20,y2:10};
  const t2={l:0,net:"USB_DM",w:0.2,x1:10,y1:11,x2:20,y2:11};
  S.tracks.push(t1,t2);
  clearSel();S.sel.tracks.add(t1);
  if(dpFromSel())throw new Error("une seule piste ne fait pas une paire");
  S.sel.tracks.add(t2);
  const q=dpFromSel();
  if(!q)throw new Error("deux pistes de deux nets devaient faire une paire");
  if(q.p!=="USB_DP"||q.n!=="USB_DM")throw new Error("P et N mal rangés : "+JSON.stringify(q));
  if(q.name!=="USB")throw new Error("nom de paire : "+q.name);
  // un net déjà pris ne se reprend pas
  const t3={l:0,net:"GND",w:0.3,x1:10,y1:12,x2:20,y2:12};
  S.tracks.push(t3);
  clearSel();S.sel.tracks.add(t1);S.sel.tracks.add(t3);
  if(dpFromSel()!==q)throw new Error("un net déjà apparié doit renvoyer sa paire");
  if(S.dpPairs.length!==1)throw new Error("aucune seconde paire ne devait naître");
});
T("l'écart d'une paire passe devant l'isolation de sa classe",()=>{
  carteDp();
  dpAutoAll();
  const q=S.dpPairs[0];
  if(clrPair("USB_DP","GND")!==0.25)throw new Error("isolation ordinaire changée");
  if(Math.abs(clrPair("USB_DP","USB_DM")-DP_FALLBACK.minGap)>1e-9)
    throw new Error("entre les deux nets de la paire : "+clrPair("USB_DP","USB_DM"));
  if(clrPair("USB_DM","USB_DP")!==clrPair("USB_DP","USB_DM"))
    throw new Error("l'isolation ne dépend pas de l'ordre");
  dpDelete(q);
  if(clrPair("USB_DP","USB_DM")!==0.25)
    throw new Error("la paire supprimée, l'isolation de classe reprend");
});
T("tracé couplé : deux pistes au pas, de même longueur",()=>{
  const c=carteDp();
  dpAutoAll();
  const q=S.dpPairs[0], g=dpGeom(q,0);
  setMode("dpair");
  if(!dpStart((c.a.p.x+c.a.n.x)/2,(c.a.p.y+c.a.n.y)/2))
    throw new Error("départ refusé entre les deux pastilles");
  if(S.dp.pair!==q)throw new Error("mauvaise paire accrochée");
  dpUpdate(40,32);
  if(!S.dp.prevP.length||!S.dp.prevN.length)throw new Error("aperçu vide");
  if(S.dp.bad)throw new Error("ce trajet ne rencontre rien");
  dpStep();
  dpUpdate(c.b.p.x,c.b.p.y);
  if(!S.dp.snap)throw new Error("le survol de la pastille d'arrivée doit accrocher");
  dpStep();                                   // l'accroche termine et dépose
  if(S.dp)throw new Error("la paire arrivée devait se déposer");
  const P=S.tracks.filter(t=>t.net==="USB_DP"), N=S.tracks.filter(t=>t.net==="USB_DM");
  if(!P.length||!N.length)throw new Error("les deux pistes devaient être posées");
  const lg=l=>l.reduce((a,t)=>a+dist(t.x1,t.y1,t.x2,t.y2),0);
  if(Math.abs(lg(P)-lg(N))>0.05)
    throw new Error("longueurs désappariées : "+fmt(lg(P),3)+" / "+fmt(lg(N),3));
  // chaque piste part bien de SA pastille et finit sur SA pastille
  const touche=(list,pt)=>list.some(t=>dist(t.x1,t.y1,pt.x,pt.y)<1e-6||
                                        dist(t.x2,t.y2,pt.x,pt.y)<1e-6);
  if(!touche(P,c.a.p)||!touche(P,c.b.p))throw new Error("la piste P ne relie pas ses pastilles");
  if(!touche(N,c.a.n)||!touche(N,c.b.n))throw new Error("la piste N ne relie pas ses pastilles");
  // au milieu du parcours, l'écart est celui de la règle
  const cp=dpCoupling(q);
  if(cp.coupled<cp.len*0.7)
    throw new Error("trop peu de couplage : "+fmt(cp.coupled,1)+" sur "+fmt(cp.len,1));
  const e=ecartDp((P[2].x1+P[2].x2)/2,(P[2].y1+P[2].y2)/2,0);
  if(Math.abs(e-g.gap)>0.002)throw new Error("écart mesuré "+fmt(e,3)+" pour "+fmt(g.gap,3));
});
T("l'éventail : la paire sort perpendiculairement à l'axe des pastilles",()=>{
  const c=carteDp();
  dpAutoAll();
  setMode("dpair");
  dpStart((c.a.p.x+c.a.n.x)/2,(c.a.p.y+c.a.n.y)/2);
  dpUpdate(40,45);
  /* Les deux pastilles sont côte à côte sur l'axe X : la paire doit descendre,
     et non partir vers la droite en repassant sur la pastille voisine. */
  const s0=S.dp.prevP[0];
  if(Math.abs(s0.y2-s0.y1)<1e-9)throw new Error("la paire n'est pas sortie de l'axe des pastilles");
  const gate=dpGate(S.dp.aP,S.dp.aN,{x:40,y:45},S.dp.gap+S.dp.w,1,S.dp.w);
  if(Math.abs(gate.n.x)>1e-9||gate.n.y<=0)
    throw new Error("sens de sortie : "+JSON.stringify(gate.n));
  if(gate.lead<=Math.abs(dist(S.dp.aP.x,S.dp.aP.y,S.dp.aN.x,S.dp.aN.y)-S.dp.gap-S.dp.w)/2)
    throw new Error("la porte doit dégager le coude de l'éventail");
  // les deux jambes de l'éventail ont la même longueur : la paire reste appariée
  const lp=dist(S.dp.prevP[0].x1,S.dp.prevP[0].y1,S.dp.prevP[0].x2,S.dp.prevP[0].y2);
  const ln=dist(S.dp.prevN[0].x1,S.dp.prevN[0].y1,S.dp.prevN[0].x2,S.dp.prevN[0].y2);
  if(Math.abs(lp-ln)>1e-6)throw new Error("éventail dissymétrique : "+lp+" / "+ln);
  dpCancel();
});
T("le tracé couplé ne laisse ni écharde ni angle bâtard",()=>{
  const c=carteDp();
  dpAutoAll();
  setMode("dpair");
  dpStart((c.a.p.x+c.a.n.x)/2,(c.a.p.y+c.a.n.y)/2);
  dpUpdate(42,32);dpStep();
  dpUpdate(c.b.p.x,c.b.p.y);dpStep();
  for(const t of S.tracks){
    if(!angleOk(t.x2-t.x1,t.y2-t.y1))
      throw new Error("segment hors des huit sens : "+fmt(angleDeg(t.x2-t.x1,t.y2-t.y1),2)+"°");
    if(dist(t.x1,t.y1,t.x2,t.y2)<1e-9)throw new Error("segment de longueur nulle posé");
  }
  const err=runDrc().filter(e=>!e.info);
  if(err.length)throw new Error("le tracé couplé devait passer le DRC : "+err[0].msg);
});
T("vias de paire : écartés de quoi ne pas se toucher",()=>{
  const c=carteDp(4);
  dpAutoAll();
  const q=S.dpPairs[0];
  setMode("dpair");
  dpStart((c.a.p.x+c.a.n.x)/2,(c.a.p.y+c.a.n.y)/2);
  dpUpdate(40,45);dpStep();
  const av=S.vias.length;
  dpVia();
  if(S.vias.length!==av+2)throw new Error("un via par piste : "+(S.vias.length-av));
  const [v1,v2]=S.vias.slice(-2);
  if(v1.net===v2.net)throw new Error("les deux vias doivent porter les deux nets");
  const d=dist(v1.x,v1.y,v2.x,v2.y);
  if(d<dpViaSpread(q)-1e-3)
    throw new Error("vias trop proches : "+fmt(d,3)+" pour "+fmt(dpViaSpread(q),3)+" attendus");
  if(S.dp.layer===0)throw new Error("le via devait changer de couche");
  if(S.active!==S.dp.layer)throw new Error("la couche active suit la paire");
  // le retour arrière défait l'éventail ET les deux vias
  dpBack();
  if(S.vias.length!==av)throw new Error("les vias devaient repartir : "+S.vias.length);
  if(S.dp.layer!==0)throw new Error("la couche devait revenir");
  dpCancel();
});
T("retour arrière : la paire recule d'un coude, pas d'un segment",()=>{
  const c=carteDp();
  dpAutoAll();
  setMode("dpair");
  dpStart((c.a.p.x+c.a.n.x)/2,(c.a.p.y+c.a.n.y)/2);
  dpUpdate(40,45);dpStep();
  const p1=S.dp.doneP.length, n1=S.dp.doneN.length;
  dpUpdate(50,50);dpStep();
  if(S.dp.doneP.length<=p1)throw new Error("le second coude n'a rien posé");
  dpBack();
  if(S.dp.doneP.length!==p1||S.dp.doneN.length!==n1)
    throw new Error("retour incomplet : "+S.dp.doneP.length+" / "+S.dp.doneN.length);
  dpBack();
  if(S.dp.doneP.length||S.dp.doneN.length)throw new Error("le premier coude devait partir aussi");
  dpBack();                                   // rien à défaire : sans effet
  dpCancel();
  if(S.tracks.length)throw new Error("un tracé abandonné ne laisse pas de cuivre");
});
T("contrôle : longueur découplée et largeur hors bornes",()=>{
  carteDp();
  dpAutoAll();
  const q=S.dpPairs[0];
  push();
  S.dpRules.push(Object.assign({},DP_FALLBACK,{name:"R1",uid:dpUid(),
    layers:{},maxUncoupled:1}));
  /* Deux pistes parallèles au bon écart sur 20 mm, puis 10 mm chacune dans son
     coin : vingt millimètres couplés, vingt découplés. */
  S.tracks.push({l:0,net:"USB_DP",w:0.2,x1:10,y1:10,x2:30,y2:10},
                {l:0,net:"USB_DM",w:0.2,x1:10,y1:10.35,x2:30,y2:10.35},
                {l:0,net:"USB_DP",w:0.2,x1:30,y1:10,x2:40,y2:0},
                {l:0,net:"USB_DM",w:0.2,x1:30,y1:10.35,x2:40,y2:20});
  touch();
  const cp=dpCoupling(q);
  if(Math.abs(cp.coupled-20)>0.5)throw new Error("couplé : "+fmt(cp.coupled,2)+" mm");
  if(cp.uncoupled<10)throw new Error("découplé : "+fmt(cp.uncoupled,2)+" mm");
  let e=[];dpDrc(e);
  if(!e.some(x=>/découplés/.test(x.msg)))throw new Error("le découplage devait être signalé");
  // une piste plus fine que le mini de la règle
  S.tracks[0].w=0.05;
  e=[];dpDrc(e);
  if(!e.some(x=>/hors des bornes/.test(x.msg)))throw new Error("largeur hors bornes non vue");
  // ... et la classe de net, elle, ne réclame plus rien sur une piste de paire
  if(runDrc().some(x=>/de la classe/.test(x.msg)))
    throw new Error("la classe ne commande pas la largeur d'une paire");
  // un net disparu de la carte se signale, sans faire tomber le contrôle
  S.dpPairs.push({id:S.nextId++,name:"FANTOME",p:"RX_P",n:"RX_N"});
  e=[];dpDrc(e);
  if(!e.some(x=>/absent/.test(x.msg)))throw new Error("paire orpheline non signalée");
});
T("impédance : microruban dehors, triplaque dedans",()=>{
  carteDp(4);
  setLayerRole(1,"gnd","GND");
  setLayerRole(2,"pwr","+5V");
  const dehors=dpStripGeom(0), dedans=dpStripGeom(3);
  if(dehors.kind!=="micro")throw new Error("la couche 1 est un microruban");
  if(dpStripGeom(1).kind!=="micro"&&dpStripGeom(1).kind!=="strip"){/* plan : peu importe */}
  const mid=dpStripGeom(0);
  if(!mid.ref)throw new Error("le plan de la couche 2 devait servir de référence");
  if(dedans.kind!=="micro")throw new Error("la couche 4 n'a de plan que d'un côté");
  // une couche de signal prise entre deux plans : triplaque
  setCuCount(6,true);
  setLayerRole(1,"gnd","GND");
  setLayerRole(3,"gnd","GND");
  if(dpStripGeom(2).kind!=="strip")throw new Error("entre deux plans : triplaque");
  if(dpStripGeom(2).b<=0)throw new Error("écart entre plans nul");
  // l'impédance décroît quand la piste s'élargit, croît quand l'écart grandit
  const z1=dpZdiff(0.15,0.15,2), z2=dpZdiff(0.30,0.15,2), z3=dpZdiff(0.15,0.40,2);
  if(!(z1>z2))throw new Error("élargir la piste doit faire baisser Zdiff");
  if(!(z3>z1))throw new Error("écarter les pistes doit faire monter Zdiff");
  // et la dichotomie retombe sur la cible
  const w=dpSolveW(90,0.15,2);
  if(Math.abs(dpZdiff(w,0.15,2)-90)>1)throw new Error("largeur résolue : Zdiff "+dpZdiff(w,0.15,2));
  const gp=dpSolveGap(90,w,2);
  if(Math.abs(dpZdiff(w,gp,2)-90)>1)throw new Error("écart résolu : Zdiff "+dpZdiff(w,gp,2));
});
T("règles : la plus précise l'emporte, et les couches se retouchent",()=>{
  carteDp();
  dpAutoAll();
  const q=S.dpPairs[0];
  if(dpRuleFor(q)!==DP_FALLBACK)throw new Error("sans règle écrite, celle d'usine sert");
  S.dpRules.push(Object.assign({},DP_FALLBACK,{name:"Générale",uid:dpUid(),
    layers:{},prefW:0.25}));
  if(dpRuleFor(q).name!=="Générale")throw new Error("la règle générale devait s'appliquer");
  S.dpRules.push(Object.assign({},DP_FALLBACK,{name:"USB seule",uid:dpUid(),
    layers:{},scope:"USB",prefW:0.18}));
  if(dpRuleFor(q).name!=="USB seule")throw new Error("une règle nommant la paire passe devant");
  const r=dpRuleFor(q);
  r.allLayers=false;r.layers[1]={prefW:0.12,prefGap:0.1,minGap:0.09};
  if(dpValues(r,0).prefW!==0.18)throw new Error("la couche 1 garde les valeurs générales");
  if(dpValues(r,1).prefW!==0.12)throw new Error("la couche 2 devait être retouchée");
  if(dpGeom(q,1).gap!==0.1)throw new Error("le tracé suit la retouche de couche");
  // le mini le plus bas de toutes les couches fait l'isolation
  r.layers[1].minGap=0.08;
  if(Math.abs(dpMinGap(q)-0.08)>1e-9)throw new Error("écart mini : "+dpMinGap(q));
  // les valeurs préférées restent bornées par le mini et le maxi
  r.prefW=9;
  if(dpGeom(q,0).w!==r.maxW)throw new Error("une préférée aberrante se ramène au maxi");
});
T("document : paires et règles se relisent, aller-retour neutre",()=>{
  carteDp();
  dpAutoAll();
  push();
  S.dpRules.push(Object.assign({},DP_FALLBACK,{name:"USB 90 Ω",comment:"USB 2.0",
    uid:"ABCDEFGH",scope:"USB",allLayers:false,useImp:true,imp:"D90",
    layers:{0:{prefW:0.22,prefGap:0.16}},maxUncoupled:5}));
  touch();
  const av=docObj(), ap=normDoc(JSON.parse(JSON.stringify(av)));
  const d=firstDiff(JSON.parse(JSON.stringify(av)),JSON.parse(JSON.stringify(ap)),"doc");
  if(d)throw new Error("l'aller-retour a changé quelque chose : "+d);
  loadDoc(JSON.parse(JSON.stringify(av)),true);
  if(S.dpPairs.length!==1||S.dpPairs[0].name!=="USB")throw new Error("paire perdue à la relecture");
  if(S.dpRules.length!==1||S.dpRules[0].uid!=="ABCDEFGH")throw new Error("règle perdue");
  if(S.dpRules[0].layers[0].prefW!==0.22)throw new Error("retouche de couche perdue");
});
T("document : une paire venue d'ailleurs ne passe pas telle quelle",()=>{
  carteDp();
  const d=normDoc({cu:2,
    dpPairs:[{id:"x",name:"<script>",p:"A_P",n:"A_N"},
             {name:"vide",p:"",n:"B"},              // sans les deux nets : rejetée
             {name:"boucle",p:"C",n:"C"},           // un net avec lui-même : rejetée
             {id:1,name:"<script>",p:"D_P",n:"D_N"}],
    dpRules:[{name:"R",uid:"a b<>c",scope:"inconnue",minW:-5,maxW:1e9,
              maxUncoupled:"beaucoup",imp:"D999",layers:{7:{prefW:1},x:{prefW:1},
              0:{prefW:"non"}}}]});
  if(d.dpPairs.length!==2)throw new Error("2 paires exploitables attendues, "+d.dpPairs.length);
  if(d.dpPairs[0].name===d.dpPairs[1].name)throw new Error("deux paires ne peuvent partager un nom");
  if(d.dpPairs[0].id===d.dpPairs[1].id)throw new Error("identifiants distincts attendus");
  const r=d.dpRules[0];
  if(/[^A-Za-z0-9]/.test(r.uid))throw new Error("identifiant non filtré : "+r.uid);
  if(r.scope!=="")throw new Error("une portée vers une paire absente ne vise plus rien");
  if(r.minW<0.01||r.maxW>100)throw new Error("largeurs non bornées");
  if(r.maxUncoupled!==DP_FALLBACK.maxUncoupled)throw new Error("longueur illisible non redressée");
  if(r.imp!=="")throw new Error("profil inconnu accepté");
  if(Object.keys(r.layers).length)throw new Error("retouches de couche fantômes gardées");
});
T("panneau des paires : ce qu'il montre, et ce qu'il échappe",()=>{
  carteDp();
  dpAutoAll();
  S.dpPairs[0].name='<img src=x onerror="alert(1)">';
  buildDiffPairs();
  const h=$("dpair").innerHTML;
  if(h.indexOf("onerror=\"alert")>=0)throw new Error("un nom de paire hostile est passé tel quel");
  if(h.indexOf("&lt;img")<0)throw new Error("le nom devait être échappé");
  if(h.indexOf("Contraintes")<0)throw new Error("la section des contraintes manque");
  if(h.indexOf("Largeur préférée")<0||h.indexOf("Écart préféré")<0)
    throw new Error("les six cotes doivent être là");
  if(h.indexOf("toutes les couches")<0)throw new Error("la case « toutes les couches » manque");
  if(h.indexOf("Profil d")<0)throw new Error("le profil d'impédance manque");
  for(let i=0;i<S.cu;i++)
    if(h.indexOf('data-dpl="'+i+'"')<0)throw new Error("couche "+i+" absente du tableau");
  if(h.indexOf('data-dpp="0"')<0)throw new Error("la paire manque à la liste");
  // la règle d'usine ne s'inscrit dans le document qu'à la première retouche
  if(S.dpRules.length)throw new Error("aucune règle ne devait être écrite d'office");
  if(!dpPanelRule().draft)throw new Error("la règle affichée devait être celle d'usine");
  $("dpMinW").value="0.12";
  $("dpMinW").onchange();
  if(S.dpRules.length!==1)throw new Error("la retouche devait inscrire la règle");
  if(S.dpRules[0].minW!==0.12)throw new Error("valeur non reprise : "+S.dpRules[0].minW);
  if(!/^[A-Z]{8}$/.test(S.dpRules[0].uid))throw new Error("identifiant : "+S.dpRules[0].uid);
  const uid=S.dpRules[0].uid;
  $("dpPrefW").value="0.21";$("dpPrefW").onchange();
  if(S.dpRules[0].uid!==uid)throw new Error("l'identifiant ne doit plus bouger");
  if(S.dpRules.length!==1)throw new Error("une seule règle après deux retouches");
});
T("la figure du panneau suit les cotes en vigueur",()=>{
  carteDp();
  dpAutoAll();
  const f=dpFigure(0.2,0.15);
  if(f.indexOf("<svg")<0)throw new Error("pas de figure");
  if(f.indexOf("0.200")<0||f.indexOf("0.150")<0)throw new Error("les cotes ne sont pas écrites");
  if(f.indexOf("0.350")<0)throw new Error("le pas de la paire manque");
});
T("mode paire : la barre, le clavier et le pied de page",()=>{
  carteDp();
  dpAutoAll();
  setMode("dpair");
  if(S.mode!=="dpair")throw new Error("mode non pris");
  if(!$("mDiff").classList.contains("on"))throw new Error("bouton non allumé");
  if($("fMode").textContent!=="Paire différentielle")throw new Error("pied de page : "+$("fMode").textContent);
  key("t");
  if(S.mode!=="track")throw new Error("T doit rendre la main au tracé simple");
  key("p");
  if(S.mode!=="dpair")throw new Error("P doit revenir à la paire");
  setMode("select");
  if($("mDiff").classList.contains("on"))throw new Error("bouton resté allumé");
});
T("changer d'outil dépose la paire en cours",()=>{
  const c=carteDp();
  dpAutoAll();
  setMode("dpair");
  dpStart((c.a.p.x+c.a.n.x)/2,(c.a.p.y+c.a.n.y)/2);
  dpUpdate(40,45);dpStep();
  if(!S.dp)throw new Error("tracé perdu");
  setMode("select");
  if(S.dp)throw new Error("le tracé devait se déposer");
  if(!S.tracks.length)throw new Error("le cuivre tracé devait rester");
  const nets=new Set(S.tracks.map(t=>t.net));
  if(!nets.has("USB_DP")||!nets.has("USB_DM"))throw new Error("les deux nets devaient être posés");
});
T("supprimer une paire laisse le cuivre en place",()=>{
  const c=carteDp();
  dpAutoAll();
  setMode("dpair");
  dpStart((c.a.p.x+c.a.n.x)/2,(c.a.p.y+c.a.n.y)/2);
  dpUpdate(40,45);dpStep();dpCommit();
  const n=S.tracks.length;
  if(!n)throw new Error("rien n'a été posé");
  dpDelete(S.dpPairs[0]);
  if(S.dpPairs.length)throw new Error("la paire devait partir");
  if(S.tracks.length!==n)throw new Error("le cuivre ne devait pas bouger");
  undo();
  if(S.dpPairs.length!==1)throw new Error("annuler devait rendre la paire");
});

/* ==========================================================================
   Session d'onglet (commun/session.js)
   Aller vérifier une valeur sur le schéma, puis revenir : le routage en cours
   doit être là, intact, tant que l'onglet n'a pas été fermé.
   ========================================================================== */
function carteVide(){
  S.fps=[];S.tracks=[];S.vias=[];S.zones=[];S.cuts=[];S.drc=[];
  clearSel();touch();
}
T("session : la carte mise de côté revient à l'identique",()=>{
  dom.session.clear();
  carteVide();
  importNetlist(NET,false);
  const u1=S.fps.find(f=>f.ref==="U1");
  u1.x=20;u1.y=15;touch();
  S.dirty=true;
  const avant=JSON.parse(JSON.stringify(docObj()));
  if(!sessEnregistrer())throw new Error("la carte n'a pas été mise de côté");
  /* la page est rechargée : l'éditeur repart d'une carte vierge */
  carteVide();S.dirty=false;
  if(!sessionPcb())throw new Error("reprise refusée");
  const d=firstDiff(avant,JSON.parse(JSON.stringify(docObj())),"doc");
  if(d)throw new Error("la carte a changé en chemin : "+d);
  if(!S.dirty)throw new Error("l'état « modifié » doit revenir aussi, sinon "+
    "l'onglet se fermerait sans un mot sur un travail jamais enregistré");
});
T("session : un état illisible, périmé ou hostile est écarté",()=>{
  dom.session.setItem(SESS_CLE+"pcb","pas du json");
  if(sessLire("pcb"))throw new Error("du texte quelconque ne doit rien donner");
  dom.session.setItem(SESS_CLE+"pcb",JSON.stringify({v:99,t:1,etat:{doc:{}}}));
  if(sessLire("pcb"))throw new Error("une autre version du format doit être ignorée");
  dom.session.setItem(SESS_CLE+"pcb",JSON.stringify({v:1,t:1,etat:"bonjour"}));
  if(sessLire("pcb"))throw new Error("un état qui n'est pas un objet doit être ignoré");
  /* un état retouché à la main : normDoc() le passe au tamis, comme à l'import */
  carteVide();
  dom.session.setItem(SESS_CLE+"pcb",JSON.stringify({v:1,t:1,etat:{
    doc:{format:"pcbedit-1",fps:"beaucoup",tracks:[{x1:"ici"}],cu:99},sale:true}}));
  sessionPcb();
  if(S.fps.length)throw new Error("aucune empreinte ne devait sortir de ce document");
  dom.session.clear();
});
T("session : un état qui déborde ne laisse pas de carte périmée derrière lui",()=>{
  dom.session.clear();
  const gros={pave:"x".repeat(SESS_MAX)};
  if(sessTient(gros))throw new Error("cet état devait être jugé trop gros");
  if(sessEcrire("pcb",gros))throw new Error("il ne devait pas être écrit");
  if(sessLire("pcb"))throw new Error("rien ne doit rester en session");
  /* quota atteint pendant l'écriture : l'état précédent, devenu faux, s'en va */
  dom.session.setItem(SESS_CLE+"pcb",JSON.stringify({v:1,t:1,etat:{doc:{}}}));
  const vrai=dom.session.setItem;
  dom.session.setItem=()=>{throw new Error("quota");};
  const ecrit=sessEcrire("pcb",{doc:{}});
  dom.session.setItem=vrai;
  if(ecrit)throw new Error("l'écriture aurait dû échouer");
  if(sessLire("pcb"))throw new Error("l'état périmé devait être retiré");
});
T("session : changer d'outil met de côté et fait taire la garde de sortie",()=>{
  dom.session.clear();
  SESS_QUITTE=false;
  carteVide();importNetlist(NET,false);S.dirty=true;
  sessAller("schema");
  if(location.href!=="../editeur-schematique/editeur-schematique.html")
    throw new Error("adresse inattendue : "+location.href);
  if(!sessLire("pcb"))throw new Error("la carte devait partir en session");
  if(!sessQuitte())throw new Error("la garde de sortie devait se taire");
  let barre=false;
  const ev=()=>({preventDefault(){barre=true;},returnValue:""});
  dom.fireWin("beforeunload",ev());
  if(barre)throw new Error("changer d'outil ne doit rien demander");
  /* une vraie fermeture d'onglet, elle, reste protégée */
  SESS_QUITTE=false;
  dom.fireWin("beforeunload",ev());
  if(!barre)throw new Error("fermer sur une carte non enregistrée doit avertir");
  dom.session.clear();
});
T("session : chemins relatifs, et pas de barre dans la version un seul fichier",()=>{
  if(sessUrl("pcb")!=="../editeur-pcb/editeur-pcb.html")
    throw new Error("chemin du PCB : "+sessUrl("pcb"));
  if(sessUrl("schema")!=="../editeur-schematique/editeur-schematique.html")
    throw new Error("chemin du schéma : "+sessUrl("schema"));
  if(sessUrl("accueil")!=="../index.html")throw new Error("chemin de l'accueil");
  if(sessUrl("inconnu")!==null)throw new Error("une cible inconnue ne mène nulle part");
  const b1=document.createElement("button"), b2=document.createElement("button");
  b1.setAttribute("data-cao-nav","composants");
  b2.setAttribute("data-cao-nav","ailleurs");
  document.body.appendChild(b1);document.body.appendChild(b2);
  if(sessBarre()!==1)throw new Error("un seul bouton était câblable");
  if(typeof b1.onclick!=="function")throw new Error("bouton non câblé");
  if(!b2.hidden)throw new Error("une cible inconnue doit disparaître");
  const chemin=dom.location.pathname;
  dom.location.pathname="/editeur-pcb/dist/editeur-pcb.html";
  if(!sessAutonome())throw new Error("la version un seul fichier doit se reconnaître");
  if(sessBarre()!==0)throw new Error("elle ne doit câbler aucun bouton");
  if(!b1.hidden)throw new Error("les boutons doivent s'effacer");
  dom.location.pathname=chemin;
  b1.remove();b2.remove();
});

console.log("\n"+ok+" essais réussis, "+ko+" en échec.");
process.exit(ko?1:0);
