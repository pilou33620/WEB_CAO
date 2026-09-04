/* =============================================================================
   editeur-schematique/test/harness.js
   Banc d'essai : le bundle dist/schema.js est exécuté sur le DOM minimal
   partagé (commun/test/dom-stub.js), sans navigateur.

       python3 outils/build-monofichier.py && node test/harness.js

   Ce qui est couvert en priorité, parce que c'est du code pur et que tout le
   reste en dépend : la découpe automatique des fils et l'extraction des nets
   (07-connectivite.js), l'analyse du CSV de bibliothèque (18-csv.js), la
   netlist et la nomenclature (13-fichiers.js), l'échappement HTML des
   panneaux (12-panneaux.js) et l'espace de travail (commun/workspace.js).
   ============================================================================= */
"use strict";
const fs=require("fs");
const path=require("path");
const ROOT=path.join(__dirname,"..","..");

const CSV_PATH=path.join(ROOT,"LIB_composants.csv");
const CSV_TEXT=fs.existsSync(CSV_PATH)?fs.readFileSync(CSV_PATH,"utf8"):null;

const dom=require(path.join(ROOT,"commun","test","dom-stub.js")).install({
  panels:{palette:"Bibliothèque",props:"Propriétés",list:"Nomenclature & Nets"},
  canvasId:"sheet",
  /* le module CSV essaie trois chemins : on ne sert que le premier, ce qui
     vérifie aussi qu'il s'arrête dès qu'il a trouvé */
  files:CSV_TEXT?{"../LIB_composants.csv":CSV_TEXT}:{}
});

/* BroadcastChannel simulé : Node en fournit un vrai, mais il livre les messages
   de façon asynchrone alors que ce banc d'essai est synchrone. Celui-ci
   respecte la seule règle qui compte ici — un canal ne reçoit jamais ses
   propres messages — et livre tout de suite. Installé AVANT le bundle : c'est
   au chargement que commun/session.js ouvre le canal. */
const bcBus={};
global.BroadcastChannel=function(nom){
  this.name=nom;this.onmessage=null;
  (bcBus[nom]=bcBus[nom]||[]).push(this);
};
global.BroadcastChannel.prototype.postMessage=function(data){
  for(const c of (bcBus[this.name]||[]).slice())
    if(c!==this&&typeof c.onmessage==="function")
      c.onmessage({data:JSON.parse(JSON.stringify(data))});
};
global.BroadcastChannel.prototype.close=function(){
  const a=bcBus[this.name]||[],i=a.indexOf(this);
  if(i>=0)a.splice(i,1);
};

const code=fs.readFileSync(path.join(__dirname,"..","dist","schema.js"),"utf8");
const EXPOSE=[
  /* état et feuilles */
  "S","G","newPage","loadPage","storeCurrent","gotoPage","addPage","removePage","clearSel",
  "push","undo","redo","touchWires","buildTabs","draw","fit","resize",
  /* bus et hiérarchie */
  "C_BUS","BUS_WIDTH","sheetBlocks","hitSheetBlock","newHierPage",
  /* bibliothèque et géométrie */
  "bbox",
  "defOf","allPins","pinCount","icGeom","key","LIB","pinsOf",
  /* brochage (04 + 19) */
  "icPins","icBodyOf","icSideOf","icPinLabel","icFree","icShapeOf","icStep","IC_STEP",
  "icSetCount","icSetShape","icSetBody","icFitNames","icMovePin","reshapeComp",
  "peOpen","peClose","ceOpen","ceClose",
  /* libellés déplaçables et étiquettes de net (08 + 09) */
  "compTexts","textBox","textOff","setTextOff","netLabelAt","netLabelBoxes",
  "pinContacts","reconnectContacts","resetTexts","pinContactPoints","moveSelBy",
  "rotateSel","mirrorSel",
  "splitWireArray","textW",
  /* presse-papier et grille (10) */
  "copySel","cutSel","pasteClip","clipContent","setClip","getClip","setGridStep","snap","delSel","dupSel",
  "delWiresSel","gridLabel","gridShownStep","normComp","normWire","normDrawing","selDrawings","hitDrawing","loadDoc",
  /* connectivité (07) */
  "computeNets","nets","docNets","splitWireArray","resolveSplits","endpointList",
  "insideSeg","netAt","netAtLive","isRealNet","setNetName","selectNet","netColor",
  "docGroupOf","sheetList","NAME_SRC",
  /* panneaux (12) */
  "refreshPanels","buildList","buildNets","buildBom","setListTab","connList",
  "netBlock","pkgField","esc",
  /* fichiers (13) */
  "netlistText","bomRows","bomCsvText","csvCell","serialize","loadJsonText",
  "schFile",
  /* nom de projet commun (commun/projet.js) */
  "projNom","projOuvrir","projFermer","projDoc","projPeindre",
  /* CSV de bibliothèque (18) */
  "parseCSVLine","loadCSVFromString","loadCSVLib",
  /* repérage commun : chercher un repère, mesurer une distance
     (commun/reperage.js + le module d'adaptation de l'éditeur) */
  "cv","setMode","w2s","s2w","setGrid","gridMm",
  "RP","rpInit","rpMesClic","rpMesBouge","rpMesRaz","rpMesEnCours","rpMesPaire",
  "rpMesCotes","rpMesLecture","rpMesDire","rpMesTrace","rpRang","rpTrouve",
  "rpQBuild","rpQOuvrir","rpQFermer","rpQAller","rpQBascule","rpCadrer","rpNetBox",
  "RP_SCH","rpNetFrais",
  /* session d'onglet commune (commun/session.js) */
  "sessBrancher","sessEnregistrer","sessLire","sessEcrire","sessEffacer",
  "sessTient","sessUrl","sessQuitte","sessionSchema","restoreBackup","clearBackup",
  "sessCibleEcrire","sessCiblePrendre","schSonde","schSonderCible","sessAller",
  "sessCanalDispo","sessMontrerAilleurs","sessEcouterProbe","SESS_CANAL",
  "schMontrerAilleurs","schCibleTrouver","schCibleAller","sessCibleAuChargement",
  /* espace de travail commun */
  "wsDefault","wsApply","wsMove","wsPlaceOf","wsLabel","wsToggleFloat","wsToggleMaximize",
  "wsToggleCollapse","wsClose","wsShow","wsMenuBuild","wsLoad","wsSave","wsEl","WS_KEY",
  "WS_SECTION",
  /* profils utilisateur communs (commun/profils.js) */
  "profNom","profListe","profChoisir","profCreer","profSupprimer","profLire",
  "profEcrire","profOublier","profRecents","profNoterDocument","profNomValide",
  /* réglages d'affichage propres à l'utilisateur (20-profil.js) */
  "profilEtat","profilNoter","profilAppliquer",
  "setGrid","setGridStep","setNetLabels","setListTab",
  /* recherche de composants & conflits */
  "crDetecterConflitsCablage","crRealignerFilsBroches"
];
/* les noms absents du bundle sont ignorés : le banc d'essai reste utilisable
   même si un module est renommé, les essais concernés échoueront tout seuls */
eval(code.replace(/^"use strict";/,"")+"\n"
     +EXPOSE.map(n=>'try{globalThis.'+n+'='+n+';}catch(e){}').join("\n")+"\n"
     +'Object.defineProperty(globalThis,"WS",'
     +'{get:()=>WS,set:v=>{WS=v;},configurable:true});');

/* ==========================================================================
   Outils du banc
   ========================================================================== */
let ok=0,ko=0;
function T(name,fn){
  try{fn();console.log("  ok  "+name);ok++;}
  catch(e){console.log("  KO  "+name+" → "+e.message+"\n"+(e.stack||"").split("\n")[1]);ko++;}
}
/* fil sur la grille : les coordonnées sont données en pas, pas en pixels */
function W(x1,y1,x2,y2,net){
  const w={x1:x1*G,y1:y1*G,x2:x2*G,y2:y2*G};
  if(net)w.net=net;
  return w;
}
let _uid=1000;
/* composant posé sur la grille ; `pins` est le nombre de broches pour un CI */
function C(type,x,y,opts){
  const el=Object.assign({id:++_uid,type:type,x:x*G,y:y*G,rot:0},opts||{});
  return el;
}
/* document d'essai : une seule feuille, contenu imposé */
function sheet(comps,wires){
  S.pages=[newPage("Essai")];
  S.page=0;
  S.comps=comps;S.wires=wires;
  S.pages[0].comps=comps;S.pages[0].wires=wires;
  clearSel();touchWires();
}
function netNamed(name){
  return nets().list.find(n=>String(n.name).toUpperCase()===String(name).toUpperCase())||null;
}

console.log("— banc d'essai éditeur schématique —");

/* ==========================================================================
   Découpe automatique des fils (07-connectivite.js)
   ========================================================================== */
T("extrémités relevées sans doublon",()=>{
  const ws=[W(0,0,4,0),W(4,0,4,4)];
  const pts=endpointList(ws);
  if(pts.length!==3)throw new Error("3 points distincts attendus, "+pts.length);
});
T("point strictement intérieur à un segment",()=>{
  const w=W(0,0,4,0);
  if(!insideSeg({x:2*G,y:0},w))throw new Error("le milieu est intérieur");
  if(insideSeg({x:0,y:0},w))throw new Error("une extrémité n'est pas intérieure");
  if(insideSeg({x:4*G,y:0},w))throw new Error("l'autre extrémité non plus");
  if(insideSeg({x:6*G,y:0},w))throw new Error("au-delà du segment : dehors");
  if(insideSeg({x:2*G,y:G},w))throw new Error("hors de la droite : dehors");
});
T("un fil déposé au milieu d'un autre le scinde",()=>{
  const ws=[W(0,0,6,0),W(3,0,3,3)];
  if(!splitWireArray(ws))throw new Error("aucune scission");
  if(ws.length!==3)throw new Error("3 segments attendus après scission, "+ws.length);
  const horiz=ws.filter(w=>w.y1===w.y2&&w.y1===0);
  if(horiz.length!==2)throw new Error("le segment traversé devait devenir deux moitiés");
  if(!horiz.some(w=>w.x2===3*G||w.x1===3*G))throw new Error("scission au mauvais point");
  // rien à faire au second passage : l'opération est idempotente
  if(splitWireArray(ws))throw new Error("seconde scission inattendue");
});
T("le label survit à la scission",()=>{
  const ws=[W(0,0,6,0,"HORLOGE"),W(3,0,3,3)];
  splitWireArray(ws);
  const named=ws.filter(w=>w.net==="HORLOGE");
  if(named.length!==2)throw new Error("les deux moitiés portent le label, "+named.length);
});
T("un croisement sans extrémité commune ne scinde rien",()=>{
  const ws=[W(0,2,6,2),W(3,0,3,4)];
  // les deux extrémités du vertical sont hors du segment horizontal
  const before=ws.length;
  splitWireArray(ws);
  if(ws.length!==before)throw new Error("un simple croisement ne doit rien couper");
});
T("la sélection suit les moitiés",()=>{
  sheet([],[W(0,0,6,0),W(3,0,3,3)]);
  S.selW.add(S.wires[0]);
  resolveSplits();
  if(S.selW.size!==2)throw new Error("2 moitiés sélectionnées attendues, "+S.selW.size);
  for(const w of S.selW)
    if(S.wires.indexOf(w)<0)throw new Error("la sélection garde un fil mort");
});
T("segment oblique : balayage complet",()=>{
  const ws=[W(0,0,4,4),W(2,2,2,5)];
  if(!splitWireArray(ws))throw new Error("l'oblique traversée doit être coupée");
  if(ws.length!==3)throw new Error("3 segments attendus, "+ws.length);
});

/* ==========================================================================
   Extraction des nets (07-connectivite.js)
   ========================================================================== */
T("deux broches reliées par un fil forment un net",()=>{
  const r1=C("resistor",0,0,{ref:"R1",value:"10k"});
  const r2=C("resistor",6,0,{ref:"R2",value:"1k"});
  const p1=allPins(r1), p2=allPins(r2);
  sheet([r1,r2],[{x1:p1[1].x,y1:p1[1].y,x2:p2[0].x,y2:p2[0].y}]);
  const N=nets();
  const n=N.list.find(x=>x.nodes.length===2);
  if(!n)throw new Error("aucun net à deux nœuds : "+N.list.map(x=>x.nodes.length));
  if(n.named)throw new Error("un net sans label reste anonyme");
  if(!/^N\$\d+$/.test(n.name))throw new Error("numérotation automatique attendue : "+n.name);
});
T("une masse nomme son net et le rend global",()=>{
  const r1=C("resistor",0,0,{ref:"R1"});
  const p=allPins(r1);
  const g=C("gnd",0,4,{value:"GND"});
  const pg=allPins(g);
  sheet([r1,g],[{x1:p[1].x,y1:p[1].y,x2:pg[0].x,y2:pg[0].y}]);
  const n=netNamed("GND");
  if(!n)throw new Error("net GND absent : "+nets().list.map(x=>x.name).join(" "));
  if(!n.named)throw new Error("GND devrait être nommé");
  if(!n.global)throw new Error("une masse est un net global");
  if(n.src!==3)throw new Error("priorité de nommage : "+n.src);
});
T("une étiquette de fil nomme le net, un nom automatique non",()=>{
  const r1=C("resistor",0,0,{ref:"R1"}), r2=C("resistor",6,0,{ref:"R2"});
  const a=allPins(r1)[1], b=allPins(r2)[0];
  sheet([r1,r2],[{x1:a.x,y1:a.y,x2:b.x,y2:b.y,net:"HORLOGE"}]);
  if(!netNamed("HORLOGE"))throw new Error("label de fil ignoré");
  // « N$3 » ressemble à un nom attribué d'office : il ne doit pas faire label
  sheet([r1,r2],[{x1:a.x,y1:a.y,x2:b.x,y2:b.y,net:"N$3"}]);
  const n=nets().list.find(x=>x.nodes.length===2);
  if(n&&n.named)throw new Error("un nom automatique ne doit pas compter comme label");
});
T("deux étiquettes globales de même nom fusionnent sans fil",()=>{
  const a=C("gport",0,0,{value:"BUS"});
  const b=C("gport",10,10,{value:"BUS"});
  const r1=C("resistor",0,4,{ref:"R1"}), r2=C("resistor",10,14,{ref:"R2"});
  const pa=allPins(a)[0], pb=allPins(b)[0];
  const q1=allPins(r1)[0], q2=allPins(r2)[0];
  sheet([a,b,r1,r2],[{x1:pa.x,y1:pa.y,x2:q1.x,y2:q1.y},
                     {x1:pb.x,y1:pb.y,x2:q2.x,y2:q2.y}]);
  const n=netNamed("BUS");
  if(!n)throw new Error("net BUS absent");
  if(n.nodes.length!==2)
    throw new Error("les deux résistances devraient partager BUS, "+n.nodes.length);
});
T("noms rivaux sur un même net : conflit signalé",()=>{
  const a=C("gport",0,0,{value:"ALPHA"});
  const b=C("gport",6,0,{value:"BETA"});
  const pa=allPins(a)[0], pb=allPins(b)[0];
  sheet([a,b],[{x1:pa.x,y1:pa.y,x2:pb.x,y2:pb.y}]);
  const n=nets().list[0];
  if(!n)throw new Error("aucun net");
  if(!n.conflict)throw new Error("deux noms sur un net : conflit attendu");
  if(n.names.length!==2)throw new Error("2 noms relevés attendus, "+n.names.join("/"));
});
T("une broche posée en plein milieu d'un fil rejoint le net",()=>{
  const r1=C("resistor",0,0,{ref:"R1"});
  const p=allPins(r1);
  // fil qui passe par la broche 2 sans s'y arrêter et sans toucher la broche 1
  sheet([r1],[{x1:r1.x,y1:p[1].y,x2:p[1].x+4*G,y2:p[1].y}]);
  const N=nets();
  const n=N.list.find(x=>x.nodes.some(nd=>nd.ref==="R1"&&nd.pin===2));
  if(!n)throw new Error("la broche traversée devrait rejoindre le fil : "
    +N.list.map(x=>x.nodes.map(nd=>nd.ref+"."+nd.pin).join("+")).join(" | "));
  if(!n.wires.length)throw new Error("le net devrait contenir le fil traversé");
  if(n.nodes.length!==1)throw new Error("seule la broche 2 est sur le fil, "+n.nodes.length);
});
T("une broche isolée n'est pas un net",()=>{
  const r1=C("resistor",0,0,{ref:"R1"});
  sheet([r1],[]);
  const N=nets();
  if(N.list.length)throw new Error("aucun net établi attendu, "+N.list.length);
  if(!N.loose.length)throw new Error("les broches en l'air devraient être relevées");
  if(isRealNet(N.loose[0]))throw new Error("un point isolé n'est pas un vrai net");
});
T("numérotation automatique stable de haut en bas",()=>{
  const mk=(ref,y)=>{
    const r=C("resistor",0,y,{ref:ref});
    return {r:r,p:allPins(r)};
  };
  const bas=mk("R1",10), haut=mk("R2",0);
  const bas2=mk("R3",10), haut2=mk("R4",0);
  bas2.r.x=6*G;haut2.r.x=6*G;
  const pb2=allPins(bas2.r), ph2=allPins(haut2.r);
  sheet([bas.r,haut.r,bas2.r,haut2.r],[
    {x1:bas.p[1].x,y1:bas.p[1].y,x2:pb2[1].x,y2:pb2[1].y},
    {x1:haut.p[0].x,y1:haut.p[0].y,x2:ph2[0].x,y2:ph2[0].y}]);
  const list=nets().list;
  if(list.length<2)throw new Error("2 nets attendus, "+list.length);
  if(list[0].min.y>list[1].min.y)throw new Error("les nets ne sont pas triés de haut en bas");
  if(list[0].name!=="N$1")throw new Error("le net du haut prend N$1, obtenu "+list[0].name);
});
T("cache de connectivité invalidé au bon moment",()=>{
  const r1=C("resistor",0,0,{ref:"R1"}), r2=C("resistor",6,0,{ref:"R2"});
  const a=allPins(r1)[1], b=allPins(r2)[0];
  sheet([r1,r2],[{x1:a.x,y1:a.y,x2:b.x,y2:b.y}]);
  const first=nets();
  if(nets()!==first)throw new Error("le cache devrait resservir à l'identique");
  S.wires.push(W(20,20,26,20));touchWires();
  if(nets()===first)throw new Error("le cache devrait être invalidé");
});
T("renommer un net pose un label unique",()=>{
  const r1=C("resistor",0,0,{ref:"R1"}), r2=C("resistor",8,0,{ref:"R2"});
  const a=allPins(r1)[1], b=allPins(r2)[0];
  sheet([r1,r2],[{x1:a.x,y1:a.y,x2:b.x,y2:b.y,net:"VIEUX"},
                 {x1:b.x,y1:b.y,x2:b.x+2*G,y2:b.y,net:"VIEUX"}]);
  const n=netNamed("VIEUX");
  if(!n)throw new Error("net VIEUX absent");
  if(!setNetName(n,"NEUF"))throw new Error("renommage refusé");
  const labels=S.wires.filter(w=>w.net);
  if(labels.length!==1)throw new Error("un seul label doit rester, "+labels.length);
  if(labels[0].net!=="NEUF")throw new Error("label : "+labels[0].net);
  if(!netNamed("NEUF"))throw new Error("le net ne porte pas le nouveau nom");
  // un nom imposé par un symbole n'est pas modifiable par le fil
  const g=C("gnd",0,4,{value:"GND"});
  const pg=allPins(g);
  sheet([r1,g],[{x1:allPins(r1)[1].x,y1:allPins(r1)[1].y,x2:pg[0].x,y2:pg[0].y}]);
  if(setNetName(netNamed("GND"),"AUTRE"))
    throw new Error("un net nommé par un symbole ne se renomme pas depuis le fil");
});
T("nom vidé : le net redevient anonyme",()=>{
  const r1=C("resistor",0,0,{ref:"R1"}), r2=C("resistor",8,0,{ref:"R2"});
  const a=allPins(r1)[1], b=allPins(r2)[0];
  sheet([r1,r2],[{x1:a.x,y1:a.y,x2:b.x,y2:b.y,net:"TEMPORAIRE"}]);
  setNetName(netNamed("TEMPORAIRE"),"");
  if(S.wires.some(w=>w.net))throw new Error("le label devait disparaître");
  if(netNamed("TEMPORAIRE"))throw new Error("le nom devrait avoir disparu");
});
T("couleur de net : masse en rouge, reste stable",()=>{
  const rouge=netColor({named:true,name:"GND"});
  if(rouge!==netColor({named:true,name:"gnd"}))throw new Error("la casse ne doit pas compter");
  const a=netColor({named:true,name:"HORLOGE"});
  if(a!==netColor({named:true,name:"HORLOGE"}))throw new Error("couleur instable");
  if(!/^hsl\(\d+,/.test(a))throw new Error("teinte calculée attendue : "+a);
  if(netColor({named:false,name:"N$1"})!=="#8b919c")
    throw new Error("un net anonyme garde la teinte neutre");
});

/* ==========================================================================
   Nets globaux entre feuilles
   ========================================================================== */
T("un net global relie deux feuilles",()=>{
  const mkPage=(ref,val)=>{
    const r=C("resistor",0,0,{ref:ref});
    const g=C("gport",0,4,{value:val});
    const p=allPins(r), pg=allPins(g);
    const pg1=newPage("f");
    pg1.comps=[r,g];
    pg1.wires=[{x1:p[1].x,y1:p[1].y,x2:pg[0].x,y2:pg[0].y}];
    return pg1;
  };
  S.pages=[mkPage("R1","BUS"),mkPage("R2","BUS")];
  loadPage(0);touchWires();
  const D=docNets();
  const g=D.groups.find(x=>x.global&&x.name==="BUS");
  if(!g)throw new Error("groupe global BUS absent : "+D.groups.map(x=>x.name).join(" "));
  if(g.pages.length!==2)throw new Error("le net devrait couvrir 2 feuilles, "+g.pages.length);
  if(g.nodes.length!==2)throw new Error("2 nœuds attendus, "+g.nodes.length);
  if(sheetList(g.pages)!=="f1, f2")throw new Error("libellé de feuilles : "+sheetList(g.pages));
});
T("une étiquette locale reste cantonnée à sa feuille",()=>{
  const mkPage=ref=>{
    const r=C("resistor",0,0,{ref:ref});
    const q=C("port",0,4,{value:"LOCAL"});
    const p=allPins(r), pq=allPins(q);
    const pg=newPage("f");
    pg.comps=[r,q];
    pg.wires=[{x1:p[1].x,y1:p[1].y,x2:pq[0].x,y2:pq[0].y}];
    return pg;
  };
  S.pages=[mkPage("R1"),mkPage("R2")];
  loadPage(0);touchWires();
  const locaux=docNets().groups.filter(g=>!g.global&&g.name==="LOCAL");
  if(locaux.length!==2)
    throw new Error("2 nets locaux distincts attendus, "+locaux.length);
});

/* ==========================================================================
   Netlist et nomenclature (13-fichiers.js)
   ========================================================================== */
T("netlist : entête, composants, nets",()=>{
  const r1=C("resistor",0,0,{ref:"R1",value:"10k",pkg:"0603"});
  const c1=C("capacitor",8,0,{ref:"C1",value:"100n",pkg:"0603"});
  const g=C("gnd",0,4,{value:"GND"});
  const p1=allPins(r1), p2=allPins(c1), pg=allPins(g);
  sheet([r1,c1,g],[{x1:p1[1].x,y1:p1[1].y,x2:pg[0].x,y2:pg[0].y},
                   {x1:p1[0].x,y1:p1[0].y,x2:p2[0].x,y2:p2[0].y}]);
  const txt=netlistText("01/01/2026 00:00");
  if(txt.indexOf("* Netlist")!==0)throw new Error("entête absente");
  if(txt.indexOf("01/01/2026 00:00")<0)throw new Error("horodatage non injecté");
  if(txt.indexOf("=== Composants ===")<0)throw new Error("section composants absente");
  if(!/R1\s+10k\s+0603/.test(txt))throw new Error("ligne R1 absente :\n"+txt);
  if(txt.indexOf('NET "GND"')<0)throw new Error("net GND absent :\n"+txt);
  if(txt.indexOf("=== Nets globaux")<0)throw new Error("section des nets globaux absente");
  if(!/R1\.[12]/.test(txt))throw new Error("nœud de R1 absent :\n"+txt);
});
T("netlist : le boîtier reste la troisième colonne, même sans valeur",()=>{
  /* l'éditeur de PCB découpe la ligne sur deux espaces au moins : une valeur
     vide doit garder sa colonne, sinon le boîtier passe pour une valeur et
     l'empreinte importée n'a plus rien à voir avec celle choisie ici */
  const j=C("header",0,0,{ref:"J1",pkg:"DIP-8"});
  const r=C("resistor",8,0,{ref:"R1",value:"10 k ohms",pkg:"0603"});
  sheet([j,r],[]);
  const txt=netlistText("x");
  const ligne=n=>txt.split(String.fromCharCode(10)).find(l=>l.trim().indexOf(n+" ")===0)||"";
  const col=n=>ligne(n).trim().split(/\s{2,}/);
  const cj=col("J1");
  if(cj.length!==3)throw new Error("trois colonnes attendues : "+JSON.stringify(cj));
  if(cj[1]!=="—")throw new Error("la valeur vide devait tenir sa colonne : "+cj[1]);
  if(cj[2]!=="DIP-8")throw new Error("boîtier en troisième colonne : "+JSON.stringify(cj));
  const cr=col("R1");
  if(cr.length!==3||cr[2]!=="0603")throw new Error("colonnes de R1 : "+JSON.stringify(cr));
  if(cr[1]!=="10 k ohms")
    throw new Error("les espaces d'une valeur sont réduits, pas supprimés : "+cr[1]);
  if(/\s$/.test(ligne("R1")))throw new Error("pas d'espaces en fin de ligne");
});
T("netlist : les broches en l'air sont signalées",()=>{
  const r1=C("resistor",0,0,{ref:"R1",value:"10k"});
  sheet([r1],[]);
  const txt=netlistText("x");
  if(txt.indexOf("broches en l'air")<0)throw new Error("broche isolée non signalée :\n"+txt);
});
T("nomenclature : lignes puis récapitulatif par référence",()=>{
  const mk=(ref,val)=>C("resistor",0,0,{ref:ref,value:val,pkg:"0603"});
  sheet([mk("R1","10k"),mk("R2","10k"),mk("R3","1k")],[]);
  const rows=bomRows();
  if(rows.length!==3)throw new Error("3 lignes attendues, "+rows.length);
  if(rows[0].ref!=="R1")throw new Error("tri par repère : "+rows.map(r=>r.ref));
  const csv=bomCsvText();
  const parts=csv.split("\r\n");
  if(parts[0].indexOf("Repère;Composant")!==0)throw new Error("entête CSV : "+parts[0]);
  if(csv.indexOf("Qté;Composant")<0)throw new Error("récapitulatif absent");
  if(csv.indexOf("2;")<0)throw new Error("les deux 10k devaient être regroupés :\n"+csv);
  // les symboles sans repère (masses, étiquettes) ne comptent pas
  sheet([C("gnd",0,0,{value:"GND"})],[]);
  if(bomRows().length)throw new Error("une masse n'est pas un composant de nomenclature");
  if(bomCsvText()!=="")throw new Error("document vide : CSV vide attendu");
});
T("nomenclature : les séparateurs sont protégés",()=>{
  if(csvCell("a;b")!=='"a;b"')throw new Error("point-virgule non protégé : "+csvCell("a;b"));
  if(csvCell('dit "oui"')!=='"dit ""oui"""')throw new Error("guillemets : "+csvCell('dit "oui"'));
  if(csvCell("simple")!=="simple")throw new Error("valeur simple inutilement protégée");
  if(csvCell(null)!=="")throw new Error("valeur absente : chaîne vide attendue");
});
T("nomenclature : colonnes enrichies (MPN, Fabricant, Specs, Datasheet)",()=>{
  const c1 = C("resistor",0,0,{
    ref:"R1", value:"10k", pkg:"0603",
    mpn:"0603WAF1002T5E", manufacturer:"UNI-ROYAL", lcsc:"C25804",
    specs:{Tolerance:"±1%", Power:"100mW"},
    datasheet_local:"datasheets/0603WAF1002T5E.pdf"
  });
  sheet([c1],[]);
  const rows = bomRows();
  if(!rows.length || rows[0].mpn !== "0603WAF1002T5E") throw new Error("mpn non relevé dans bomRows");
  if(rows[0].manufacturer !== "UNI-ROYAL") throw new Error("fabricant non relevé");
  if(rows[0].lcsc !== "C25804") throw new Error("lcsc non relevé");
  const csv = bomCsvText();
  if(csv.indexOf("0603WAF1002T5E") < 0) throw new Error("MPN absent du CSV : " + csv);
  if(csv.indexOf("UNI-ROYAL") < 0) throw new Error("Fabricant absent du CSV : " + csv);
  if(csv.indexOf("datasheets/0603WAF1002T5E.pdf") < 0) throw new Error("Datasheet absente du CSV : " + csv);
});
T("import : conservation des métadonnées d'enrichissement (MPN, specs, datasheet)",()=>{
  const cRaw = {
    id: 1, type: "resistor", x: 10, y: 10, ref: "R1", value: "10k", pkg: "0603",
    mpn: "0603WAF1002T5E", manufacturer: "UNI-ROYAL",
    specs: { Tolerance: "±1%", Power: "100mW" },
    datasheet_local: "datasheets/0603WAF1002T5E.pdf",
    datasheet_url: "/api/datasheet/ouvrir?fichier=0603WAF1002T5E.pdf",
    lcsc: "C25804", mouser_part: "603-0603WAF1002T5E", digikey_part: "DK-0603WAF1002T5E"
  };
  const c = normComp(cRaw, 0);
  if(!c) throw new Error("composant non normalisé");
  if(c.mpn !== "0603WAF1002T5E") throw new Error("mpn perdu après import : " + c.mpn);
  if(c.manufacturer !== "UNI-ROYAL") throw new Error("manufacturer perdu après import");
  if(!c.specs || c.specs.Tolerance !== "±1%") throw new Error("specs perdues après import");
  if(c.datasheet_local !== "datasheets/0603WAF1002T5E.pdf") throw new Error("datasheet_local perdue après import");
  if(c.lcsc !== "C25804") throw new Error("lcsc perdu après import");
  if(c.mouser_part !== "603-0603WAF1002T5E") throw new Error("mouser_part perdu après import");
  if(c.digikey_part !== "DK-0603WAF1002T5E") throw new Error("digikey_part perdu après import");
});

/* ==========================================================================
   Bibliothèque CSV (18-csv.js)
   ========================================================================== */
T("analyse d'une ligne CSV",()=>{
  const eq=(got,want,msg)=>{
    if(JSON.stringify(got)!==JSON.stringify(want))
      throw new Error(msg+" : "+JSON.stringify(got));
  };
  eq(parseCSVLine("a;b;c"),["a","b","c"],"champs simples");
  eq(parseCSVLine('a;"b;c";d'),["a","b;c","d"],"séparateur entre guillemets");
  eq(parseCSVLine('"il dit ""oui""";x'),['il dit "oui"',"x"],"guillemet doublé");
  eq(parseCSVLine("a;;c"),["a","","c"],"champ vide");
  eq(parseCSVLine(""),[""],"ligne vide");
  eq(parseCSVLine("a;b;"),["a","b",""],"champ final vide");
});
T("chargement d'une bibliothèque CSV",()=>{
  loadCSVFromString(
    "Part Name;Value;Package type;Part Number;Description;Reference designator Prefix\r\n"+
    "RES-10K;10k;0603;RC0603FR-0710KL;Resistance 10k 1%;R\r\n"+
    "\r\n"+
    "CAP-100N;100n;0603;CL10B104KB8NNNC;Condensateur 100nF;C\r\n",
    "essai.csv");
  const lib=window.CSV_LIB;
  if(lib.length!==2)throw new Error("2 références attendues (ligne vide ignorée), "+lib.length);
  if(lib[0]["Part Name"]!=="RES-10K")throw new Error("première référence : "+lib[0]["Part Name"]);
  if(lib[0]["Reference designator Prefix"]!=="R")throw new Error("préfixe non lu");
  if(lib[1]["Value"]!=="100n")throw new Error("valeur non lue : "+lib[1]["Value"]);
  // un fichier vide ne doit pas écraser une bibliothèque déjà chargée
  loadCSVFromString("",   "vide.csv");
  if(window.CSV_LIB.length!==2)throw new Error("un fichier vide a écrasé la bibliothèque");
});
T("la bibliothèque du dépôt se charge",()=>{
  if(CSV_TEXT===null){console.log("     (LIB_composants.csv absent : essai ignoré)");return;}
  loadCSVFromString(CSV_TEXT,"LIB_composants.csv");
  const lib=window.CSV_LIB;
  if(lib.length<10)throw new Error("bibliothèque trop courte : "+lib.length);
  const cols=Object.keys(lib[0]);
  for(const c of ["Part Name","Value","Package type","Part Number",
                  "Reference designator Prefix"])
    if(cols.indexOf(c)<0)throw new Error("colonne attendue absente : "+c+" — "+cols.join("|"));
  if(lib.some(r=>r["Part Name"]===undefined))throw new Error("ligne mal découpée");
});

/* ==========================================================================
   Panneaux : échappement HTML (12-panneaux.js)
   ========================================================================== */
const XSS='"><img src=x onerror="pan()">';
function assertPropre(html,quoi){
  /* une injection réussie produit forcément un « < » non échappé : c'est le
     seul indice à chercher — la charge échappée, elle, contient encore le
     texte « onerror= » sans le moindre danger. */
  if(html.indexOf("<img")>=0||html.indexOf("<svg")>=0)
    throw new Error(quoi+" : balise injectée telle quelle");
}
T("esc() couvre les caractères dangereux",()=>{
  const got=esc('<&>"\'`');
  if(got!=="&lt;&amp;&gt;&quot;&#39;&#96;")throw new Error("échappement : "+got);
  if(esc(null)!=="null")throw new Error("valeur absente : "+esc(null));
});
T("nomenclature : repère et valeur d'un fichier importé échappés",()=>{
  sheet([C("resistor",0,0,{ref:XSS,value:XSS,pkg:XSS})],[]);
  setListTab("bom");
  assertPropre(document.getElementById("bom").innerHTML,"nomenclature");
});
T("nomenclature : un identifiant non numérique est échappé",()=>{
  const bad=C("resistor",0,0,{ref:"R1",value:"10k"});
  bad.id=XSS;                       // un fichier .json trafiqué peut le faire
  sheet([bad],[]);
  setListTab("bom");
  assertPropre(document.getElementById("bom").innerHTML,"identifiant de composant");
});
T("liste des nets : nom de net échappé",()=>{
  const r1=C("resistor",0,0,{ref:"R1"}), r2=C("resistor",8,0,{ref:"R2"});
  const a=allPins(r1)[1], b=allPins(r2)[0];
  sheet([r1,r2],[{x1:a.x,y1:a.y,x2:b.x,y2:b.y,net:XSS}]);
  setListTab("nets");
  assertPropre(document.getElementById("bom").innerHTML,"liste des nets");
  S.netAll=true;buildList();
  assertPropre(document.getElementById("bom").innerHTML,"vue document des nets");
  S.netAll=false;setListTab("bom");
});
T("propriétés : nom de broche et boîtier échappés",()=>{
  const u=C("ic",0,0,{ref:"U1",value:XSS,npins:4,pinNames:[XSS,"B","C","D"],pkg:XSS});
  sheet([u],[]);
  clearSel();S.sel.add(u.id);
  refreshPanels();
  assertPropre(document.getElementById("props").innerHTML,"panneau des propriétés");
});
T("bloc net des propriétés : noms rivaux échappés",()=>{
  const a=C("gport",0,0,{value:XSS});
  const b=C("gport",6,0,{value:"AUTRE"});
  const pa=allPins(a)[0], pb=allPins(b)[0];
  const w={x1:pa.x,y1:pa.y,x2:pb.x,y2:pb.y};
  sheet([a,b],[w]);
  const n=nets().list[0];
  if(!n)throw new Error("aucun net");
  assertPropre(netBlock(n),"bloc net");
  assertPropre(connList(a),"liste des connexions");
});

/* ==========================================================================
   Espace de travail (commun/workspace.js)
   ========================================================================== */
T("disposition d'usine du schématique",()=>{
  if(WS_KEY!=="schema.espace-travail.v1")throw new Error("clé de stockage : "+WS_KEY);
  WS=wsDefault();wsApply(false);
  if(JSON.stringify(dom.dockIds("dockL"))!==JSON.stringify(["palette"]))
    throw new Error("dock gauche : "+dom.dockIds("dockL"));
  if(JSON.stringify(dom.dockIds("dockR"))!==JSON.stringify(["props","list"]))
    throw new Error("dock droit : "+dom.dockIds("dockR"));
});
T("déplacer, détacher, fermer un panneau",()=>{
  wsMove("palette","dockR",0);
  if(JSON.stringify(dom.dockIds("dockR"))!==JSON.stringify(["palette","props","list"]))
    throw new Error("insertion en tête : "+dom.dockIds("dockR"));
  wsToggleFloat("palette");
  if(wsPlaceOf("palette")!=="float")throw new Error("détachement raté");
  if(dom.panels.palette.querySelectorAll(".fres").length!==8)
    throw new Error("poignées de redimensionnement absentes");
  wsClose("palette");
  if(wsPlaceOf("palette")!=="hidden")throw new Error("fermeture ratée");
  wsShow("palette");
  if(wsPlaceOf("palette")==="hidden")throw new Error("réouverture ratée");
  wsToggleFloat("palette");
  wsToggleMaximize("palette");
  if(!dom.panels.palette.classList.contains("maximized"))
    throw new Error("classe « maximized » attendue");
  if(dom.panels.palette.querySelectorAll(".fres").length)
    throw new Error("poignées présentes en plein écran");
  wsToggleMaximize("palette");
  if(dom.panels.palette.classList.contains("maximized"))
    throw new Error("classe « maximized » non retirée");
  if(dom.panels.palette.querySelectorAll(".fres").length!==8)
    throw new Error("8 poignées attendues après restauration");
  wsToggleFloat("palette");
  WS=wsDefault();wsApply(false);
});
T("menu de l'espace de travail : titres échappés",()=>{
  dom.panels.props.dataset.title=XSS;
  const h=wsMenuBuild().innerHTML;
  dom.panels.props.dataset.title="Propriétés";
  assertPropre(h,"menu de l'espace de travail");
});

/* ==========================================================================
   Rendu et parcours complet
   ========================================================================== */
T("dessin d'une feuille complète",()=>{
  const r1=C("resistor",0,0,{ref:"R1",value:"10k"});
  const u1=C("ic",6,0,{ref:"U1",value:"NE555",npins:8});
  const g=C("gnd",0,6,{value:"GND"});
  const p=allPins(r1), pg=allPins(g);
  sheet([r1,u1,g],[{x1:p[1].x,y1:p[1].y,x2:pg[0].x,y2:pg[0].y}]);
  resize();draw();
  S.netLabels=0;draw();
  S.netLabels=2;
  clearSel();S.sel.add(r1.id);S.selW.add(S.wires[0]);
  refreshPanels();draw();
  setListTab("nets");buildList();
  setListTab("bom");buildList();
});
T("annuler / rétablir",()=>{
  const r1=C("resistor",0,0,{ref:"R1"});
  sheet([r1],[]);
  const n=S.wires.length;
  push();
  S.wires.push(W(0,0,4,0));touchWires();
  undo();
  if(S.wires.length!==n)throw new Error("annulation : "+S.wires.length+" ≠ "+n);
  redo();
  if(S.wires.length!==n+1)throw new Error("rétablissement raté");
  undo();
});
T("un CI carré répartit ses broches sur quatre côtés",()=>{
  const u=C("ic",0,0,{ref:"U1",npins:8,icShape:"quad"});
  const g=icGeom(u);
  if(!g.quad)throw new Error("forme carrée non reconnue");
  if(g.cnt.reduce((a,b)=>a+b,0)!==8)throw new Error("répartition : "+g.cnt.join("+"));
  if(allPins(u).length!==8)throw new Error("8 broches attendues, "+allPins(u).length);
  const dip=C("ic",0,0,{ref:"U2",npins:8});
  if(icGeom(dip).quad)throw new Error("la forme par défaut est rectangulaire");
  if(allPins(dip).length!==8)throw new Error("8 broches attendues en DIP");
});

/* ==========================================================================
   Presse-papier (10-actions.js)
   ========================================================================== */
T("copier / coller : la sélection est reposée sous le pointeur",()=>{
  const r1=C("resistor",0,0,{ref:"R1",value:"10k"});
  const r2=C("resistor",6,0,{ref:"R2",value:"1k"});
  sheet([r1,r2],[W(2,0,4,0)]);
  S.uid=100;
  clearSel();S.sel.add(r1.id);S.sel.add(r2.id);S.selW.add(S.wires[0]);
  if(!copySel())throw new Error("copie refusée");
  S.mouse={x:20*G,y:10*G};
  pasteClip();
  if(S.comps.length!==4)throw new Error("4 composants attendus, "+S.comps.length);
  if(S.wires.length!==2)throw new Error("2 fils attendus, "+S.wires.length);
  const refs=S.comps.map(c=>c.ref);
  if(new Set(refs).size!==4)throw new Error("repères en double : "+refs.join(" "));
  if(S.sel.size!==2)throw new Error("le collage doit sélectionner ce qu'il vient de poser");
  const posed=S.comps.filter(c=>S.sel.has(c.id)).sort((a,b)=>a.x-b.x);
  if(posed[0].x!==20*G||posed[0].y!==10*G)
    throw new Error("coin haut-gauche attendu sous le pointeur, reçu "+posed[0].x+","+posed[0].y);
});
T("couper : l'original s'en va, le presse-papier le garde",()=>{
  const r1=C("resistor",0,0,{ref:"R1"});
  sheet([r1],[]);
  clearSel();S.sel.add(r1.id);
  cutSel();
  if(S.comps.length)throw new Error("l'original devait disparaître");
  S.mouse={x:0,y:0};
  pasteClip();
  if(S.comps.length!==1)throw new Error("le collage devait rendre le composant");
});
T("presse-papier : un contenu invalide ne casse rien",()=>{
  sheet([],[]);
  setClip({comps:[{type:"inconnu",x:0,y:0},null],wires:[{x1:0,y1:0}]});
  S.mouse={x:0,y:0};
  pasteClip();
  if(S.comps.length||S.wires.length)throw new Error("rien ne devait être posé");
});

/* ==========================================================================
   Brochage : disposition libre, taille du corps, noms (04 + 19)
   ========================================================================== */
T("brochage libre : la broche déplacée emmène son fil",()=>{
  const u=C("ic",0,0,{ref:"U1",npins:8});
  sheet([u],[]);
  const p=allPins(u)[0];
  S.wires.push({x1:p.x,y1:p.y,x2:p.x-4*G,y2:p.y});
  touchWires();
  if(icMovePin(u,0,p.x,p.y-3*IC_STEP)!==1)throw new Error("déplacement refusé");
  if(icShapeOf(u)!=="libre")throw new Error("la représentation devait passer en libre");
  const q=allPins(u)[0];
  if(q.y!==p.y-3*IC_STEP)throw new Error("la broche n'a pas bougé");
  if(S.wires[0].x1!==q.x||S.wires[0].y1!==q.y)throw new Error("le fil est resté en arrière");
  // une case déjà occupée est refusée : deux broches au même point se
  // souderaient l'une à l'autre sans qu'aucun fil ne le montre
  const r=allPins(u)[1];
  if(icMovePin(u,0,r.x,r.y)!==-1)throw new Error("la case occupée devait être refusée");
});
T("brochage libre : ajouter des broches ne déplace pas les anciennes",()=>{
  const u=C("ic",0,0,{ref:"U1",npins:4});
  sheet([u],[]);
  icSetShape(u,"libre");
  const avant=icPins(u).map(p=>p.join(","));
  icSetCount(u,6);
  const apres=icPins(u).map(p=>p.join(","));
  if(apres.length!==6)throw new Error("6 broches attendues, "+apres.length);
  for(let i=0;i<4;i++)
    if(avant[i]!==apres[i])throw new Error("broche "+(i+1)+" déplacée : "+avant[i]+" → "+apres[i]);
  if(new Set(apres).size!==6)throw new Error("deux broches partagent une case");
});
T("largeur du corps : les rangées de broches s'écartent d'autant",()=>{
  const u=C("ic",0,0,{ref:"U1",npins:8});
  sheet([u],[]);
  if(icPins(u)[0][0]!==-60)throw new Error("largeur d'usine : "+icPins(u)[0][0]);
  icSetBody(u,8,null);                       // 8 cases de large
  if(icBodyOf(u).x1!==-80)throw new Error("corps attendu à -80, "+icBodyOf(u).x1);
  if(icPins(u)[0][0]!==-100)throw new Error("broche gauche attendue à -100, "+icPins(u)[0][0]);
});
T("nom de broche : écrit sur les côtés gauche et droit seulement",()=>{
  const u=C("ic",0,0,{npins:8,pinNames:["VCC"]});
  if(icPinLabel(u,0,"L")!=="1 VCC")throw new Error(icPinLabel(u,0,"L"));
  if(icPinLabel(u,0,"R")!=="1 VCC")throw new Error(icPinLabel(u,0,"R"));
  if(icPinLabel(u,0,"T")!=="1")throw new Error("le haut ne porte que le numéro");
  if(icPinLabel(u,1,"L")!=="2")throw new Error("broche sans nom : numéro seul");
});
T("import : une disposition libre incohérente retombe sur le rectangle",()=>{
  const ko=normComp({type:"ic",x:0,y:0,npins:8,icShape:"libre",pinPos:[[0,0],[20,20]]},0);
  if(ko.icShape!=="dip")throw new Error("forme retenue : "+ko.icShape);
  if(ko.pinPos)throw new Error("des positions inutilisables ont été gardées");
  const bon=normComp({type:"ic",x:0,y:0,npins:2,icShape:"libre",
                      pinPos:[[-63,7],[57,-3]],icBody:{x1:-40,y1:-20,x2:40,y2:20}},0);
  if(bon.icShape!=="libre")throw new Error("disposition valable rejetée");
  if(bon.pinPos[0][0]!==-60||bon.pinPos[0][1]!==0)
    throw new Error("les broches doivent tomber sur la grille : "+bon.pinPos[0]);
  if(icBodyOf(bon).x2!==40)throw new Error("corps importé : "+icBodyOf(bon).x2);
});

/* ==========================================================================
   Pas de grille (06 + 10)
   ========================================================================== */
T("pas de grille : accrochage et échelle suivent le réglage",()=>{
  S.scale=1;
  setGridStep(G);
  if(snap(11)!==G)throw new Error("accrochage au pas plein : "+snap(11));
  if(gridLabel()!=="1 carré = 1 mm")throw new Error(gridLabel());
  setGridStep(G/2);
  if(snap(11)!==G/2)throw new Error("accrochage au demi-pas : "+snap(11));
  if(gridLabel()!=="1 carré = 0,5 mm")throw new Error(gridLabel());
  // trop serrée à l'écran : c'est la case réellement tracée qui est annoncée
  S.scale=0.3;
  const vue=gridShownStep();
  if(vue*S.scale<7)throw new Error("case trop serrée pour être tracée : "+vue);
  if(vue<=S.grid)throw new Error("la case affichée devait être élargie : "+vue);
  const attendu="1 carré = "+String(vue/G).replace(".",",")+" mm · pas "+
                String(S.grid/G).replace(".",",")+" mm";
  if(gridLabel()!==attendu)
    throw new Error("le pied de page doit annoncer la case tracée et le pas : "+gridLabel());
  S.scale=1;setGridStep(G);
});

/* ==========================================================================
   Contacts broche à broche (10-actions.js)
   ========================================================================== */
T("deux broches posées l'une sur l'autre forment un net",()=>{
  const r1=C("resistor",0,0,{ref:"R1"}), r2=C("resistor",4,0,{ref:"R2"});
  sheet([r1,r2],[]);
  const a=allPins(r1)[1], b=allPins(r2)[0];
  if(a.x!==b.x||a.y!==b.y)throw new Error("les deux broches devaient coïncider");
  const n=nets().list.find(x=>x.nodes.length===2);
  if(!n)throw new Error("aucun net à deux nœuds sans fil");
  if(pinContactPoints().length!==1)throw new Error("le point de jonction manque");
});
T("séparer deux broches en contact tire un fil",()=>{
  const r1=C("resistor",0,0,{ref:"R1"}), r2=C("resistor",4,0,{ref:"R2"});
  sheet([r1,r2],[]);
  const c=allPins(r1)[1];
  clearSel();S.sel.add(r2.id);
  moveSelBy(0,3*G);
  if(S.wires.length!==1)throw new Error("un fil attendu, "+S.wires.length);
  const w=S.wires[0];
  const q=allPins(r2)[0];
  const touche=p=>(w.x1===p.x&&w.y1===p.y)||(w.x2===p.x&&w.y2===p.y);
  if(!touche(c)||!touche(q))throw new Error("le fil ne relie pas les deux broches");
  const n=nets().list.find(x=>x.nodes.length===2);
  if(!n)throw new Error("la liaison est perdue");
  // un second déplacement ne doit pas empiler un deuxième fil : le premier
  // est accroché à la broche, il s'étire
  moveSelBy(0,G);
  if(S.wires.length!==1)throw new Error("fil en double : "+S.wires.length);
});
T("rotation : le contact se change aussi en fil",()=>{
  const r1=C("resistor",0,0,{ref:"R1"}), r2=C("resistor",4,0,{ref:"R2"});
  sheet([r1,r2],[]);
  clearSel();S.sel.add(r2.id);
  rotateSel();
  if(!S.wires.length)throw new Error("la liaison devait être matérialisée");
});

/* ==========================================================================
   Libellés déplaçables (08-rendu-schema.js)
   ========================================================================== */
T("libellé de composant : décalage, boîte d'accrochage et remise en place",()=>{
  const r=C("resistor",0,0,{ref:"R1",value:"10k"});
  sheet([r],[]);
  const t0=compTexts(r).find(t=>t.kind==="val");
  if(!t0)throw new Error("la valeur d'une résistance est un libellé extérieur");
  if(compTexts(r).some(t=>t.kind==="ref"))
    throw new Error("le repère d'une résistance est imprimé dans le symbole");
  setTextOff(r,"val",40,-20);
  const t1=compTexts(r).find(t=>t.kind==="val");
  if(t1.x-t0.x!==40||t1.y-t0.y!==-20)throw new Error("le décalage n'est pas appliqué");
  if(!t1.moved)throw new Error("le libellé devrait être signalé comme déplacé");
  const b=textBox(t1);
  if(!(b.x1<=t1.x&&t1.x<=b.x2&&b.y1<=t1.y&&t1.y<=b.y2))
    throw new Error("la boîte d'accrochage ne couvre pas le texte");
  if(!resetTexts([r]))throw new Error("rien n'a été remis en place");
  if(textOff(r,"val"))throw new Error("le décalage devait disparaître");
});
T("étiquette de net : déplaçable, masquable, et les réglages survivent à une scission",()=>{
  const r1=C("resistor",0,0,{ref:"R1"}), r2=C("resistor",8,0,{ref:"R2"});
  const a=allPins(r1)[1], b=allPins(r2)[0];
  sheet([r1,r2],[{x1:a.x,y1:a.y,x2:b.x,y2:b.y,net:"HORLOGE"}]);
  S.netLabels=2;
  const n=netNamed("HORLOGE");
  const box=netLabelAt(n);
  if(!box)throw new Error("aucune étiquette");
  const w=n.anchorWire;
  if(!w)throw new Error("le net ne désigne pas le fil porteur");
  w.lblOff=[10,-20];
  const box2=netLabelAt(nets().list.find(x=>x.name==="HORLOGE"));
  if(box2.x-box.x!==10||box2.y-box.y!==-20)throw new Error("déplacement non appliqué");
  if(!box2.moved)throw new Error("étiquette déplacée non signalée");
  w.lblHide=1;
  if(netLabelAt(nets().list.find(x=>x.name==="HORLOGE")))
    throw new Error("étiquette masquée quand même tracée");
  if(netLabelBoxes().length)throw new Error("elle reste dans la liste des boîtes");
  // scission : les deux moitiés gardent le réglage
  const ws=[W(0,0,6,0,"HORLOGE"),W(3,0,3,3)];
  ws[0].lblHide=1;ws[0].lblOff=[5,5];
  splitWireArray(ws);
  const moities=ws.filter(x=>x.y1===0&&x.y2===0);
  if(moities.length!==2)throw new Error("scission attendue");
  if(!moities.every(x=>x.lblHide&&x.lblOff&&x.lblOff[0]===5))
    throw new Error("les réglages d'étiquette n'ont pas suivi la scission");
});
T("import : décalages de libellés bornés, réglages d'étiquette relus",()=>{
  const el=normComp({type:"resistor",x:0,y:0,refOff:[40,-20],valOff:["x",2]},0);
  if(!el.refOff||el.refOff[0]!==40||el.refOff[1]!==-20)throw new Error("décalage valable perdu");
  if(el.valOff)throw new Error("un décalage non numérique a été accepté");
  const w=normWire({x1:0,y1:0,x2:40,y2:0,lblHide:true,lblOff:[10,10]});
  if(!w.lblHide||!w.lblOff||w.lblOff[0]!==10)throw new Error("réglages d'étiquette perdus");
  const w2=normWire({x1:0,y1:0,x2:40,y2:0,lblOff:[1e9,0]});
  if(w2.lblOff[0]>4000)throw new Error("décalage non borné : "+w2.lblOff[0]);
});

/* ==========================================================================
   Corps du CI ajusté à la valeur (04-etat.js)
   ========================================================================== */
T("une valeur trop longue élargit le corps du CI",()=>{
  const u=C("ic",0,0,{ref:"U1",value:"NE555",npins:8});
  sheet([u],[]);
  const x0=icPins(u)[0][0], w0=icBodyOf(u).x2-icBodyOf(u).x1;
  if(w0!==80)throw new Error("largeur d'usine attendue à 80, "+w0);
  u.value="IRA-S400st01A01";
  const w1=icBodyOf(u).x2-icBodyOf(u).x1;
  if(w1<textW(u.value,13,true))throw new Error("le texte déborde encore : "+w1);
  if(icPins(u)[0][0]>=x0)throw new Error("les broches devaient s'écarter");
  u.value="NE555";
  if(icBodyOf(u).x2-icBodyOf(u).x1!==80)throw new Error("le corps devait revenir");
});

T("U n'efface que les fils de la sélection",()=>{
  const r1=C("resistor",0,0,{ref:"R1"}), r2=C("resistor",8,0,{ref:"R2"});
  const a=allPins(r1)[1], b=allPins(r2)[0];
  sheet([r1,r2],[{x1:a.x,y1:a.y,x2:b.x,y2:b.y},W(0,4,8,4)]);
  clearSel();
  S.comps.forEach(c=>S.sel.add(c.id));
  S.wires.forEach(w=>S.selW.add(w));
  delWiresSel();
  if(S.wires.length)throw new Error("les fils devaient partir, "+S.wires.length+" restent");
  if(S.comps.length!==2)throw new Error("les composants devaient rester");
  if(S.sel.size!==2)throw new Error("les composants devaient rester sélectionnés");
  // sélection sans fil : rien ne bouge, et surtout pas les composants
  delWiresSel();
  if(S.comps.length!==2)throw new Error("une sélection sans fil ne doit rien supprimer");
  // seuls les fils sélectionnés partent
  sheet([r1,r2],[W(0,0,4,0),W(0,4,8,4)]);
  clearSel();S.selW.add(S.wires[1]);
  delWiresSel();
  if(S.wires.length!==1)throw new Error("un seul fil devait partir");
  if(S.wires[0].y1!==0)throw new Error("le mauvais fil a été supprimé");
});

T("catalogue : broches au millimètre, traits au quart de millimètre",()=>{
  const mult=(v,m)=>Math.abs(v%m)<1e-9;
  const horsPas=[], horsEmprise=[];
  for(const [type,def] of Object.entries(LIB)){
    const ech={type,npins:8,value:def.v,pinNames:[]};
    const ps=pinsOf(ech)||[];
    for(const q of ps)
      if(!mult(q[0],20)||!mult(q[1],20)){horsPas.push(type+" ("+q+")");break;}
    const e=(typeof def.ext==="function")?def.ext(ech):def.ext;
    if(e)for(const v of e)
      if(!mult(v,5)){horsEmprise.push(type+" ("+e+")");break;}
  }
  if(horsPas.length)throw new Error("broches hors du millimètre : "+horsPas.join(" · "));
  if(horsEmprise.length)throw new Error("emprises hors du quart de millimètre : "+horsEmprise.join(" · "));
});

/* ==========================================================================
   Session d'onglet (commun/session.js)
   Passer au routage, revenir vérifier une valeur : le schéma doit être là,
   tel quel, tant que l'onglet est ouvert.
   ========================================================================== */
T("session : le schéma repart dans l'état où il a été laissé",()=>{
  dom.session.clear();
  sheet([C("resistor",2,2,{ref:"R1",value:"10k",pkg:"0603"}),
         C("capacitor",6,2,{ref:"C1",value:"100n",pkg:"0603"})],
        [W(2,2,6,2,"N1")]);
  S.pages[0].scale=2.5;S.pages[0].ox=42;S.pages[0].oy=-17;
  S.scale=2.5;S.ox=42;S.oy=-17;
  S.dirty=true;
  if(!sessEnregistrer())throw new Error("le schéma n'a pas été mis de côté");
  /* la page est rechargée : on retombe sur le schéma de démonstration */
  sheet([],[]);S.dirty=false;S.scale=1;S.ox=0;S.oy=0;
  if(!sessionSchema())throw new Error("reprise refusée");
  if(S.comps.length!==2||S.wires.length!==1)
    throw new Error("contenu perdu : "+S.comps.length+" composant(s), "+
                    S.wires.length+" fil(s)");
  const r=S.comps.find(c=>c.ref==="R1"), c1=S.comps.find(c=>c.ref==="C1");
  if(!r||!c1)throw new Error("les repères ne sont pas revenus");
  if(r.value!=="10k"||r.pkg!=="0603")
    throw new Error("valeur ou boîtier perdus : "+r.value+" / "+r.pkg);
  if(r.x!==2*G||r.y!==2*G||c1.x!==6*G)throw new Error("positions déplacées");
  if(S.wires[0].net!=="N1")throw new Error("nom de net perdu");
  if(S.scale!==2.5||S.ox!==42||S.oy!==-17)
    throw new Error("le cadrage doit revenir aussi, pas un recadrage d'office");
  if(!S.dirty)throw new Error("l'état « modifié » doit revenir : sans lui, "+
    "fermer l'onglet ne dirait rien d'un schéma jamais enregistré");
  if(S.hist.length)throw new Error("l'historique de la démonstration n'a plus de sens");
});
T("session : elle passe avant la sauvegarde automatique",()=>{
  dom.session.clear();dom.storage.clear();
  /* deux filets tendus en même temps : celui de l'onglet doit gagner, c'est le
     plus récent et le seul qui n'ait rien à demander à l'utilisateur */
  sheet([C("resistor",1,1,{ref:"R9",value:"session"})],[]);
  S.dirty=true;
  sessEnregistrer();
  dom.storage.setItem("schemedit.autosave",JSON.stringify({t:Date.now(),
    doc:{pages:[{name:"Sauvegarde",comps:[C("resistor",1,1,{ref:"R8",value:"secours"})],
                 wires:[]}],page:0}}));
  sheet([],[]);
  if(!sessionSchema())throw new Error("la session devait être reprise");
  if(S.comps[0].value!=="session")
    throw new Error("c'est la sauvegarde de secours qui a été reprise");
  /* sans session, le filet de secours reprend son rôle (confirm() dit oui) */
  dom.session.clear();
  sheet([],[]);
  if(sessionSchema())throw new Error("plus de session : rien à reprendre");
  if(!restoreBackup())throw new Error("la sauvegarde automatique devait servir");
  if(S.comps[0].value!=="secours")throw new Error("mauvais document repris");
  dom.storage.clear();
});
T("session : un état illisible ou hostile ne casse pas le démarrage",()=>{
  dom.session.setItem("cao.session.v1.schema","pas du json");
  if(sessLire("schema"))throw new Error("du texte quelconque ne doit rien donner");
  dom.session.setItem("cao.session.v1.schema",
    JSON.stringify({v:1,t:1,etat:{doc:{pages:"beaucoup"}}}));
  if(sessionSchema())throw new Error("un document sans feuille doit être refusé");
  if(sessLire("schema"))throw new Error("l'état refusé devait être effacé");
  dom.session.setItem("cao.session.v1.schema",JSON.stringify({v:1,t:1,etat:{
    doc:{pages:[{name:"Piégée",comps:[{type:"inconnu",x:"ici"},null],wires:[{x1:"?"}]}],
         page:0},sale:true}}));
  if(!sessionSchema())throw new Error("le document devait être repris, filtré");
  if(S.comps.length)throw new Error("aucun composant ne devait survivre au tamis");
  dom.session.clear();
});

/* ==========================================================================
   Cross-probing schéma ↔ PCB (commun/session.js + schSonde/schSonderCible)
   « ce R1 » sélectionné ici doit amener sur ce même R1 là-bas — et rien de
   sélectionné ne doit rien changer à la navigation d'avant.
   ========================================================================== */
T("cross-probing : schSonde répond pour un composant, un net, ou rien",()=>{
  dom.session.clear();
  sheet([C("resistor",2,2,{ref:"R1",value:"10k",pkg:"0603"}),
         C("capacitor",6,2,{ref:"C1",value:"100n",pkg:"0603"})],
        [W(2,2,6,2,"N1")]);
  const r1=S.comps.find(c=>c.ref==="R1");
  clearSel();S.sel.add(r1.id);
  const s=schSonde("pcb");
  if(!s||s.quoi!=="ref"||s.valeur!=="R1")
    throw new Error("un composant seul sélectionné doit sonder sa référence : "+JSON.stringify(s));
  if(schSonde("composants")!==null)
    throw new Error("schSonde ne répond que pour \"pcb\"");
  clearSel();S.selW.add(S.wires[0]);
  const sn=schSonde("pcb");
  if(!sn||sn.quoi!=="net"||sn.valeur!=="N1")
    throw new Error("un fil sélectionné doit sonder le nom de son net : "+JSON.stringify(sn));
  clearSel();
  if(schSonde("pcb")!==null)
    throw new Error("rien de sélectionné ne doit rien sonder");
});
T("cross-probing : sessAller écrit la cible, l'arrivée la consomme une seule fois",()=>{
  dom.session.clear();
  sheet([C("resistor",2,2,{ref:"R1",value:"10k",pkg:"0603"})],[]);
  sessBrancher("schema",()=>({doc:JSON.parse(serialize()),sale:S.dirty}),schSonde);
  clearSel();S.sel.add(S.comps[0].id);
  sessAller("pcb");                 // écrit la cible {outil:"pcb", quoi:"ref", valeur:"R1"}
  const c=sessCiblePrendre("pcb");
  if(!c||c.quoi!=="ref"||c.valeur!=="R1")
    throw new Error("la cible écrite pour le PCB ne revient pas telle quelle : "+JSON.stringify(c));
  if(sessCiblePrendre("pcb")!==null)
    throw new Error("une cible consommée ne doit pas resservir");
});
T("cross-probing : une cible ne sert qu'à sa destination, jamais à une autre",()=>{
  dom.session.clear();
  sessCibleEcrire("pcb","ref","R1");
  /* Lue par le mauvais outil, elle ne doit ni répondre ni rester en attente
     pour un lecteur ultérieur qui, lui, tomberait juste : une cible n'a de
     sens qu'à destination d'UN départ précis. */
  if(sessCiblePrendre("schema")!==null)
    throw new Error("une cible pour \"pcb\" ne doit pas répondre à \"schema\"");
  if(sessCiblePrendre("pcb")!==null)
    throw new Error("une lecture, même ratée, doit consommer la cible");
});
T("cross-probing : arrivée sans sélection ne pose aucune cible",()=>{
  dom.session.clear();
  sheet([C("resistor",2,2,{ref:"R1",value:"10k",pkg:"0603"})],[]);
  sessBrancher("schema",()=>({doc:JSON.parse(serialize()),sale:S.dirty}),schSonde);
  clearSel();
  sessAller("pcb");
  if(sessCiblePrendre("pcb")!==null)
    throw new Error("sans sélection, la navigation ne doit pas déposer de cible");
});
T("cross-probing : schSonderCible sélectionne et cadre le composant visé",()=>{
  dom.session.clear();
  sheet([C("resistor",2,2,{ref:"R1",value:"10k",pkg:"0603"}),
         C("capacitor",30,30,{ref:"C9",value:"100n",pkg:"0603"})],[]);
  clearSel();S.scale=1;S.ox=0;S.oy=0;
  sessCibleEcrire("schema","ref","C9");
  schSonderCible();
  const c9=S.comps.find(c=>c.ref==="C9");
  if(!S.sel.has(c9.id))throw new Error("C9 devait être sélectionné après le saut");
  if(sessCiblePrendre("schema")!==null)
    throw new Error("schSonderCible doit consommer la cible");
});
/* ==========================================================================
   Cross-probing entre deux onglets (BroadcastChannel)
   Deux onglets côte à côte ne partagent pas sessionStorage : c'est ce canal-ci
   qui porte « montre-moi ça » de l'un à l'autre, sur demande.
   ========================================================================== */
function pied(){ return document.getElementById("fHint").textContent||""; }
function voisinOnglet(){
  const bc=new BroadcastChannel(SESS_CANAL);
  bc.recu=[];
  bc.onmessage=ev=>{bc.recu.push(ev.data);};
  return bc;
}
T("2 onglets : la demande part avec le bon repère, et rien sans sélection",()=>{
  const voisin=voisinOnglet();
  sheet([C("resistor",2,2,{ref:"R1",value:"10k",pkg:"0603"})],[]);
  clearSel();S.sel.add(S.comps[0].id);
  if(!sessCanalDispo())throw new Error("le canal devait être disponible");
  schMontrerAilleurs();
  const m=voisin.recu.find(x=>x.type==="montre");
  if(!m||m.outil!=="pcb"||m.quoi!=="ref"||m.valeur!=="R1")
    throw new Error("demande inattendue : "+JSON.stringify(m));
  voisin.recu.length=0;
  clearSel();
  schMontrerAilleurs();
  if(voisin.recu.length)throw new Error("rien ne devait partir sans sélection");
  voisin.close();
});
T("2 onglets : l'accusé de réception distingue « vu » de « absent »",()=>{
  const voisin=voisinOnglet();
  sheet([C("resistor",2,2,{ref:"R1",value:"10k",pkg:"0603"})],[]);
  clearSel();S.sel.add(S.comps[0].id);
  voisin.onmessage=ev=>{
    if(ev.data.type==="montre")voisin.postMessage({v:1,type:"vu",outil:"pcb",ok:true});
  };
  schMontrerAilleurs();
  if(!/montré sur le PCB/.test(pied()))
    throw new Error("« vu » devait être annoncé : "+pied());
  voisin.onmessage=ev=>{
    if(ev.data.type==="montre")voisin.postMessage({v:1,type:"vu",outil:"pcb",ok:false});
  };
  schMontrerAilleurs();
  if(!/n'est pas sur la carte/.test(pied()))
    throw new Error("« absent » devait être annoncé : "+pied());
  voisin.close();
});
T("2 onglets : une demande venue d'à côté sélectionne et répond « vu »",()=>{
  const voisin=voisinOnglet();
  sheet([C("resistor",2,2,{ref:"R1",value:"10k",pkg:"0603"}),
         C("capacitor",6,2,{ref:"C9",value:"100n",pkg:"0603"})],[]);
  clearSel();
  voisin.postMessage({v:1,type:"montre",outil:"schema",quoi:"ref",valeur:"C9"});
  const c9=S.comps.find(c=>c.ref==="C9");
  if(!S.sel.has(c9.id))throw new Error("C9 devait être sélectionné");
  const vu=voisin.recu.find(x=>x.type==="vu");
  if(!vu||vu.ok!==true)throw new Error("l'accusé « vu » devait revenir");
  /* un repère absent, et une demande adressée à l'autre outil */
  voisin.recu.length=0;clearSel();
  voisin.postMessage({v:1,type:"montre",outil:"schema",quoi:"ref",valeur:"ZZ99"});
  const non=voisin.recu.find(x=>x.type==="vu");
  if(!non||non.ok!==false)throw new Error("l'accusé devait dire « pas trouvé »");
  voisin.recu.length=0;
  voisin.postMessage({v:1,type:"montre",outil:"pcb",quoi:"ref",valeur:"C9"});
  if(S.sel.size)throw new Error("le schéma ne doit pas répondre à une demande pour le PCB");
  if(voisin.recu.some(x=>x.type==="vu"))throw new Error("aucun accusé ne devait partir");
  voisin.close();
});
T("cross-probing : une cible introuvable ne casse rien et ne sélectionne rien",()=>{
  dom.session.clear();
  sheet([C("resistor",2,2,{ref:"R1",value:"10k",pkg:"0603"})],[]);
  clearSel();
  sessCibleEcrire("schema","ref","N_EXISTE_PAS");
  schSonderCible();               // ne doit pas lever
  if(S.sel.size)throw new Error("rien ne devait être sélectionné");
});


/* ==========================================================================
   Profils utilisateur (commun/profils.js, 20-profil.js)
   ========================================================================== */
T("la disposition du schématique va dans le profil, pas dans la clé nue",()=>{
  wsMove("palette","dockB",0);
  const d=profLire(WS_SECTION);
  if(!d||d.order.dockB.indexOf("palette")<0)
    throw new Error("disposition non enregistrée dans le profil");
  if(dom.storage.getItem(WS_KEY))
    throw new Error("la disposition traîne encore hors du profil");
  WS=wsDefault();wsApply(false);
});
T("réglages d'affichage : ils suivent l'utilisateur, pas le schéma",()=>{
  setGridStep(20);setNetLabels(0);setListTab("nets");
  const av=profLire("reglages:schema");
  if(!av)throw new Error("rien enregistré sous reglages:schema");
  if(av.grille!==20)throw new Error("pas de grille : "+av.grille);
  if(av.nets!==0)throw new Error("étiquettes de net : "+av.nets);
  if(av.liste!=="nets")throw new Error("onglet de liste : "+av.liste);
  /* rien de tout cela n'a le droit d'entrer dans le document */
  const doc=JSON.parse(serialize());
  for(const k of ["grid","showGrid","netLabels","listTab"])
    if(k in doc)throw new Error("« "+k+" » s'est glissé dans le document");
  setGridStep(10);setNetLabels(2);setListTab("bom");
  profEcrire("reglages:schema",av);
  profilAppliquer();
  if(S.grid!==20)throw new Error("grille non rétablie : "+S.grid);
  if(S.netLabels!==0)throw new Error("étiquettes non rétablies : "+S.netLabels);
  if(S.listTab!=="nets")throw new Error("onglet non rétabli : "+S.listTab);
  setGridStep(10);setNetLabels(2);setListTab("bom");
});
T("un utilisateur neuf part de la disposition d'usine",()=>{
  wsMove("palette","dockB",0);
  if(!profCreer("Marie"))throw new Error("création refusée");
  if(wsPlaceOf("palette")!=="dockL")
    throw new Error("disposition d'usine attendue : "+wsPlaceOf("palette"));
  profChoisir("Pilou");
  if(wsPlaceOf("palette")!=="dockB")
    throw new Error("Pilou n'a pas retrouvé la sienne : "+wsPlaceOf("palette"));
  profSupprimer("Marie");
  WS=wsDefault();wsApply(false);
});


/* ==========================================================================
   Repérage : chercher un repère, mesurer une distance
   --------------------------------------------------------------------------
   Le comportement est dans commun/reperage.js, partagé avec l'éditeur PCB ; ce
   que le schéma en fait est dans 21-reperage.js. Deux choses lui sont propres,
   et ce sont elles qu'on éprouve ici : la recherche traverse les feuilles, et
   la mesure dit qu'elle n'est pas une cote de fabrication.
   ========================================================================== */
T("mesure : deux points, la cote, les deltas et l'angle",()=>{
  sheet([],[]);
  S.scale=1;
  setMode("mesure");
  /* Feuille vide : aucune broche à proximité, la grille décide seule. Trois
     cases sur X, quatre sur Y — une case vaut 1 mm. */
  rpMesClic(10*G,10*G);
  rpMesClic(13*G,14*G);
  const c=rpMesCotes();
  if(!c)throw new Error("aucune cote après deux clics");
  if(Math.abs(c.dx-3)>1e-6||Math.abs(c.dy-4)>1e-6)
    throw new Error("deltas faux : dX "+c.dx+" dY "+c.dy);
  if(Math.abs(c.d-5)>1e-6)throw new Error("3-4-5 attendu, "+c.d+" mm");
  if(Math.abs(c.ang+53.13)>0.02)throw new Error("angle : "+c.ang+" degrés");
  setMode("select");
});
T("mesure : la lecture dit que le millimètre est une convention, pas une cote",()=>{
  sheet([],[]);
  S.scale=1;
  setMode("mesure");
  rpMesClic(10*G,10*G);rpMesClic(13*G,14*G);
  const L=rpMesLecture();
  if(L.indexOf("Mesure 5 mm")!==0)throw new Error("lecture : "+L);
  /* C'est la différence de fond avec le PCB : un schéma n'a pas d'échelle
     physique, et la lecture ne doit pas laisser croire à une dimension de
     carte. */
  if(L.indexOf("convention de dessin")<0)
    throw new Error("la convention de dessin n'est pas dite : "+L);
  if(L.indexOf("cote figée")>=0)
    throw new Error("le schématique parle de cote figée comme le PCB : "+L);
  setMode("select");
});
T("mesure : le point s'accroche à la broche, pas au pixel visé",()=>{
  const r=C("resistor",6,6,{ref:"R1"});
  sheet([r],[]);
  S.scale=1;
  setMode("mesure");
  const p=allPins(r)[0];
  rpMesClic(p.x+3,p.y-2);           // visé à côté, dans la portée de l'aimant
  const a=RP.mes.a;
  if(a.quoi!=="broche")throw new Error("accroché sur "+a.quoi);
  if(a.x!==p.x||a.y!==p.y)throw new Error("le point n'est pas sur la broche");
  setMode("select");
});
T("mesure : quitter le mode efface la cote",()=>{
  sheet([],[]);
  S.scale=1;
  setMode("mesure");
  rpMesClic(0,0);rpMesClic(4*G,0);
  if(!rpMesEnCours())throw new Error("rien de mesuré");
  setMode("select");
  if(rpMesEnCours())throw new Error("la cote survit au retour à la sélection");
});
T("recherche : le repère tapé en entier passe devant ses homonymes plus longs",()=>{
  sheet([C("resistor",0,0,{ref:"R1"}),
         C("resistor",4,0,{ref:"R10"}),
         C("resistor",8,0,{ref:"R100"})],[]);
  const res=rpTrouve("R1");
  if(res.length<3)throw new Error("3 résultats attendus, "+res.length);
  if(res[0].cle!=="R1")throw new Error("premier résultat : "+res[0].cle);
});
T("recherche : un composant d'une autre feuille fait changer de feuille",()=>{
  const p1=newPage("f1"), p2=newPage("f2");
  p1.comps=[C("resistor",0,0,{ref:"R1"})];p1.wires=[];
  const r2=C("capacitor",20,12,{ref:"C47"});
  p2.comps=[r2];p2.wires=[];
  S.pages=[p1,p2];loadPage(0);touchWires();
  /* Le cas qui motive la recherche : C47 n'est pas sur la feuille regardée. */
  const cible=rpTrouve("C47").find(x=>x.cle==="C47");
  if(!cible)throw new Error("C47 ne se trouve pas depuis l'autre feuille");
  if(cible.detail.indexOf("f2")<0)
    throw new Error("la ligne ne dit pas sur quelle feuille il est : "+cible.detail);
  cible.aller();
  if(S.page!==1)throw new Error("la feuille n'a pas changé : page "+S.page);
  const el=S.comps.find(c=>c.ref==="C47");
  if(!el||!S.sel.has(el.id))throw new Error("C47 n'est pas sélectionné à l'arrivée");
  /* C'est le symbole qu'on amène au centre, pas son point d'ancrage : le corps
     d'un CI ne se dessine pas autour de son origine, et centrer l'ancre
     laisserait le symbole à moitié sorti de l'écran. */
  const b=bbox(el), p=w2s((b.x1+b.x2)/2,(b.y1+b.y2)/2);
  if(Math.abs(p.x-cv.clientWidth/2)>2||Math.abs(p.y-cv.clientHeight/2)>2)
    throw new Error("C47 n'est pas au centre : "+Math.round(p.x)+" ; "+Math.round(p.y));
});
T("recherche : un net global se trouve, et par sa feuille d'origine",()=>{
  const mkPage=(ref,nom)=>{
    const r=C("resistor",0,0,{ref:ref});
    const g=C("gport",0,4,{value:nom});
    const p=allPins(r), pg=allPins(g);
    const pgz=newPage("f");
    pgz.comps=[r,g];
    pgz.wires=[{x1:p[1].x,y1:p[1].y,x2:pg[0].x,y2:pg[0].y}];
    return pgz;
  };
  S.pages=[mkPage("R1","BUS"),mkPage("R2","BUS")];
  loadPage(0);touchWires();
  const cible=rpTrouve("BUS").find(x=>x.cle==="BUS");
  if(!cible)throw new Error("le net BUS ne se trouve pas");
  if(cible.type!=="net global")throw new Error("trouvé comme "+cible.type);
  if(cible.detail.indexOf("2 feuilles")<0)
    throw new Error("la ligne ne dit pas qu'il court sur deux feuilles : "+cible.detail);
  cible.aller();
  if(!S.selW.size)throw new Error("aucun fil du net sélectionné");
});
T("recherche : le net repris après changement de feuille est celui de l'arrivée",()=>{
  /* docNets() calcule sur les feuilles rangées ; arriver sur l'une d'elles
     refait ses nets, et l'objet retenu par la cible n'est alors plus celui du
     document affiché. rpNetFrais() le reprend par son premier fil. */
  const r=C("resistor",0,0,{ref:"R1"});
  const g=C("port",0,4,{value:"LOCAL"});
  const p=allPins(r), pg=allPins(g);
  const pgz=newPage("f1");
  pgz.comps=[r,g];
  pgz.wires=[{x1:p[1].x,y1:p[1].y,x2:pg[0].x,y2:pg[0].y}];
  S.pages=[pgz];loadPage(0);touchWires();
  const vieux=docNets().groups.find(x=>x.name==="LOCAL").members[0].net;
  const frais=rpNetFrais(vieux);
  const vivant=netNamed("LOCAL");
  if(frais!==vivant)
    throw new Error("le net repris n'est pas celui de la feuille affichée");
});
T("recherche : un symbole sans repère ne se cherche pas",()=>{
  /* Une étiquette de net, une masse : elles n'ont pas de repère, et une ligne
     vide dans la liste ne mène nulle part. */
  sheet([C("resistor",0,0,{ref:"R1"}),C("gnd",4,0,{})],[]);
  for(const t of RP_SCH.cibles())
    if(!t.cle)throw new Error("une cible sans clé dans la liste");
});
T("recherche : la liste échappe ce qui vient du document",()=>{
  sheet([C("resistor",0,0,{ref:"R1",value:XSS})],[]);
  document.getElementById("rpQ").value="R1";
  rpQBuild();
  assertPropre(document.getElementById("rpRes").innerHTML,"liste de recherche");
});

/* ==========================================================================
   Nom de projet : d'où viennent les noms de fichiers exportés
   --------------------------------------------------------------------------
   Le nom est choisi à l'accueil, commun aux deux éditeurs, et le schéma en
   dérive le suffixe -SCH. Sans projet, les noms restent ceux d'avant.
   ========================================================================== */
T("noms de fichiers : le projet les mène, et sans projet rien ne change",()=>{
  const cas=[[".json","schema.json"],[".png","schema.png"],
             ["-netlist.txt","netlist.txt"],
             ["-nomenclature.csv","nomenclature.csv"]];
  projFermer();
  for(const [suf,repli] of cas)
    if(schFile(suf,repli)!==repli)
      throw new Error("sans projet, "+repli+" devient "+schFile(suf,repli));
  projOuvrir("carte PIR");
  try{
    if(projDoc("schema","")!=="carte PIR-SCH")
      throw new Error("document schéma : "+projDoc("schema",""));
    /* Le PCB tire son propre nom du même projet : les deux éditeurs doivent
       parler du même ouvrage sans jamais se recopier l'un l'autre. */
    if(projDoc("pcb","")!=="carte PIR-PCB")
      throw new Error("document PCB : "+projDoc("pcb",""));
    for(const [suf,repli] of cas)
      if(schFile(suf,repli)!=="carte PIR-SCH"+suf)
        throw new Error("carte PIR-SCH"+suf+" attendu, "+schFile(suf,repli)+" obtenu");
  }finally{ projFermer(); }
});
T("entête : le nom du projet s'affiche, et s'effface à sa fermeture",()=>{
  const el=document.createElement("span");
  el.setAttribute("data-cao-projet","schema");
  document.body.appendChild(el);
  try{
    projOuvrir("carte PIR");
    projPeindre();
    if(el.textContent!=="carte PIR-SCH")throw new Error("affiché : "+el.textContent);
    if(el.hidden)throw new Error("le nom reste masqué");
    projFermer();
    projPeindre();
    if(el.textContent!=="")throw new Error("le nom subsiste : "+el.textContent);
    if(!el.hidden)throw new Error("la place reste visible sans projet");
  }finally{ projFermer(); }
});

/* ==========================================================================
   Traits de délimitation graphique (traits)
   ========================================================================== */
T("trait graphique : normalisation, style et libellé",()=>{
  const d=normDrawing({id:5,x1:10,y1:20,x2:100,y2:20,style:"dashed",width:2,color:"#2f86cc",label:"ALIMENTATION"},0);
  if(!d||d.type!=="line")throw new Error("trait invalide");
  if(d.x1!==10||d.x2!==100||d.y1!==20||d.y2!==20)throw new Error("coordonnées erronées");
  if(d.style!=="dashed"||d.width!==2||d.color!=="#2f86cc"||d.label!=="ALIMENTATION")
    throw new Error("propriétés du trait altérées");
  // segment nul écarté
  if(normDrawing({x1:10,y1:20,x2:10,y2:20}))throw new Error("segment nul non filtré");
  // style inconnu ramené à dashed
  const d2=normDrawing({x1:0,y1:0,x2:40,y2:40,style:"inconnu"},0);
  if(d2.style!=="dashed")throw new Error("repli du style invalide");
});

T("trait graphique : cycle de sauvegarde, sélection et déplacement",()=>{
  S.comps=[];S.wires=[];S.drawings=[];clearSel();
  const d={id:S.uid++,type:"line",x1:20,y1:20,x2:200,y2:20,style:"dashed",width:2,color:"#6b7280",label:"BLOC 1"};
  S.drawings.push(d);
  S.selD.add(d.id);
  if(selDrawings().length!==1)throw new Error("trait non sélectionné");
  moveSelBy(40,20);
  if(d.x1!==60||d.y1!==40||d.x2!==240||d.y2!==40)throw new Error("déplacement du trait incorrect");
  dupSel();
  if(S.drawings.length!==2)throw new Error("duplication du trait échouée");
  delSel();
  if(S.drawings.length!==1)throw new Error("suppression échouée");
  // import de document contenant des traits
  const doc={format:"schemedit-2",pages:[{name:"Feuille 1",comps:[],wires:[],drawings:[d]}]};
  loadDoc(doc);
  if(S.pages.length>1)gotoPage(1);
  if(!S.drawings||S.drawings.length!==1)throw new Error("rechargement de trait échoué");
});

T("rectangle graphique : normalisation, hit-test périmétrique et panneau",()=>{
  const r=normDrawing({id:10,shape:"rect",x1:50,y1:50,x2:250,y2:150,style:"solid",width:2,label:"ZONE"},0);
  if(!r||r.shape!=="rect")throw new Error("rectangle non normalisé");
  S.drawings=[r];clearSel();
  // Clic sur l'arête du haut (x: 100, y: 50) -> doit toucher
  const hTop=hitDrawing(100,50);
  if(!hTop||hTop.id!==r.id)throw new Error("hit-test manqué sur arête haut du rectangle");
  // Clic sur l'arête droite (x: 250, y: 100) -> doit toucher
  const hRight=hitDrawing(250,100);
  if(!hRight||hRight.id!==r.id)throw new Error("hit-test manqué sur arête droite");
  // Clic au centre du rectangle (x: 150, y: 100) -> ne doit PAS toucher (laisse l'accès aux composants intérieurs)
  const hCenter=hitDrawing(150,100);
  if(hCenter)throw new Error("le centre du rectangle ne doit pas intercepter le hit-test");
  // Sélection et panneau de propriétés
  S.selD.add(r.id);
  refreshPanels();
  const html=document.getElementById("props").innerHTML;
  if(html.indexOf("Rectangle (cadre)")<0||html.indexOf("selected>Rectangle")<0)
    throw new Error("sélecteur de forme absent ou erroné");
  if(html.indexOf("Largeur :")<0||html.indexOf("Hauteur :")<0)
    throw new Error("cotes du rectangle absentes du panneau");
});

T("bus de signaux : mode bus, propriétés, tracé et scission",()=>{
  setMode("bus");
  if(S.mode!=="bus")throw new Error("le mode bus n'a pas été activé");
  const bBus=document.getElementById("mBus");
  if(bBus&&!bBus.classList.contains("on"))throw new Error("le bouton mBus n'est pas allumé en mode bus");
  if(C_BUS!=="#00c4df"||BUS_WIDTH!==6.5)throw new Error("constantes de style du bus incorrectes");

  const wBus1={x1:0,y1:100,x2:200,y2:100,bus:true,net:"D[0..7]"};
  const wNorm={x1:100,y1:0,x2:100,y2:100};
  const wires=[wBus1,wNorm];
  const splitDone=splitWireArray(wires);
  if(!splitDone)throw new Error("la scission au croisement avec le bus a échoué");
  const buses=wires.filter(w=>w.bus);
  if(buses.length!==2)throw new Error("les deux moitiés du bus scindé doivent conserver bus:true, trouvé "+buses.length);
  if(buses[0].net!=="D[0..7]"||buses[1].net!=="D[0..7]")throw new Error("le nom de net du bus n'a pas survécu à la scission");
});

T("bus de signaux : import défensif et panneau de propriétés",()=>{
  const nw=normWire({x1:0,y1:0,x2:80,y2:0,bus:true,net:"DATA[0..15]"});
  if(!nw||!nw.bus||nw.net!=="DATA[0..15]")throw new Error("normWire n'a pas conservé le bus");
  S.wires=[nw];S.comps=[];S.drawings=[];clearSel();
  S.selW.add(nw);
  refreshPanels();
  const html=document.getElementById("props").innerHTML;
  if(html.indexOf("Bus horizontal")<0)throw new Error("direction du bus absente du panneau");
  if(html.indexOf("DATA[0..15]")<0)throw new Error("nom du bus absent du panneau");
});

T("feuilles hiérarchiques : feuille racine, blocs hiérarchiques dynamiques et protection",()=>{
  S.pages=[newHierPage("Hiérarchie")];
  loadPage(0);
  if(sheetBlocks().length!==0)throw new Error("une seule feuille ne doit pas générer de bloc hiérarchique");

  addPage(false);
  S.pages[1].name="Alimentation";
  addPage(false);
  S.pages[2].name="Microcontrôleur";

  gotoPage(0);
  const blocks=sheetBlocks();
  if(blocks.length!==2)throw new Error("deux blocs hiérarchiques attendus sur la feuille racine, trouvé "+blocks.length);
  if(blocks[0].name!=="Alimentation"||blocks[0].sheetIndex!==1)throw new Error("premier bloc hiérarchique incorrect");
  if(blocks[1].name!=="Microcontrôleur"||blocks[1].sheetIndex!==2)throw new Error("second bloc hiérarchique incorrect");

  const b0=blocks[0];
  const hit=hitSheetBlock(b0.x+10,b0.y+10);
  if(!hit||hit.sheetIndex!==1)throw new Error("hitSheetBlock n'a pas trouvé le bloc");

  let alertShown=false;
  const oldAlert=global.alert;
  global.alert=()=>{alertShown=true;};
  try{
    removePage(0);
  }finally{
    global.alert=oldAlert;
  }
  if(!alertShown)throw new Error("la suppression de la feuille racine (page 0) doit être refusée");
  if(S.pages.length!==3)throw new Error("la feuille racine a été supprimée à tort");
});

T("feuilles hiérarchiques : ouverture du document sur la feuille racine et navigation",()=>{
  const doc={
    format:"schemedit-2",
    page:2,
    pages:[
      {name:"Synoptique",comps:[],wires:[]},
      {name:"Capteurs",comps:[],wires:[]},
      {name:"Traitement",comps:[],wires:[]}
    ]
  };
  loadDoc(doc);
  if(S.page!==0)throw new Error("loadDoc doit ouvrir sur la feuille racine (page 0), ouvert sur "+S.page);
  // Ancien document sans feuille hiérarchique : insérée en index 0, devant Synoptique
  if(S.pages.length!==4)throw new Error("la feuille hiérarchique doit être insérée avant la première feuille");
  if(S.pages[0].name!=="Hiérarchie"||!S.pages[0].isHierarchy)throw new Error("la première feuille doit être la feuille hiérarchique");
  if(S.pages[1].name!=="Synoptique")throw new Error("la première sous-feuille doit être Synoptique");
  gotoPage(1);
  if(S.page!==1)throw new Error("navigation vers feuille 2 échouée");
  if(hitSheetBlock(100,100)!==null)throw new Error("hitSheetBlock ne doit être actif que sur la feuille 0");
});

T("démarrage : avec projet vierge sans démo vs sans projet avec démo",()=>{
  projFermer();
  if(projNom()!=="")throw new Error("aucun projet ne doit être actif après projFermer");
  projOuvrir("mon_projet_test");
  if(projNom()!=="mon_projet_test")throw new Error("le projet actif doit être mon_projet_test");
  projFermer();
});

T("feuilles hiérarchiques : ancien projet mono-feuille gagne sa feuille hiérarchique en page 0",()=>{
  const oldDoc={
    format:"schemedit-2",
    pages:[
      {name:"01 Commande NPN",comps:[C("resistor",2,2,{ref:"R1"})],wires:[]}
    ]
  };
  loadDoc(oldDoc);
  if(S.pages.length!==2)throw new Error("la feuille hiérarchique doit être ajoutée devant la feuille unique existante");
  if(S.pages[0].name!=="Hiérarchie"||!S.pages[0].isHierarchy)throw new Error("la page 0 doit être la feuille hiérarchique");
  if(S.pages[1].name!=="01 Commande NPN")throw new Error("la page 1 doit être l'ancienne feuille 01 Commande NPN");
  if(S.page!==0)throw new Error("le schéma doit s'ouvrir sur la feuille hiérarchique (page 0)");
  const blocks=sheetBlocks();
  if(blocks.length!==1)throw new Error("un bloc attendu pour la feuille 01 Commande NPN");
  if(blocks[0].name!=="01 Commande NPN"||blocks[0].sheetIndex!==1)throw new Error("bloc incorrect");

  // Duplication de la feuille hiérarchique interdite
  let alertTriggered=false;
  const oldAlert=global.alert;
  global.alert=()=>{alertTriggered=true;};
  try{
    addPage(true);
  }finally{
    global.alert=oldAlert;
  }
  if(!alertTriggered)throw new Error("dupliquer la feuille hiérarchique doit être interdit");
  if(S.pages.length!==2)throw new Error("la feuille hiérarchique ne doit pas être dupliquée");
});

T("édition des broches sur un composant non-IC (connecteur)",()=>{
  const j = C("header", 5, 5, {ref:"J1"});
  sheet([j], []);
  if(pinCount(j)!==2) throw new Error("un header natif a 2 broches, reçu: "+pinCount(j));
  peOpen(j);
  icSetCount(j, 4);
  j.pinNames = ["VCC", "TX", "RX", "GND"];
  if(pinCount(j)!==4) throw new Error("le header doit avoir 4 broches après icSetCount");
  if(j.pinNames.length!==4||j.pinNames[1]!=="TX") throw new Error("noms des broches incorrects");
  const ps = pinsOf(j);
  if(ps.length!==4) throw new Error("pinsOf doit renvoyer 4 broches");
  peClose();
});

T("édition du composant (modale CE) pour modifier ref, valeur, boîtier",()=>{
  const op = C("opamp", 10, 10, {ref:"U1", value:"LM358"});
  sheet([op], []);
  ceOpen(op);
  op.ref = "U5";
  op.value = "TL072";
  op.pkg = "SOIC-8";
  ceClose();
  if(op.ref!=="U5"||op.value!=="TL072"||op.pkg!=="SOIC-8") throw new Error("propriétés du composant non mises à jour");
});

T("normComp : conservation des broches personnalisées et des noms pour tout composant",()=>{
  const src = {
    id: 12, type: "header", x: 100, y: 100, ref: "J2", value: "UART",
    npins: 4, pinNames: ["VCC", "TX", "RX", "GND"],
    pinPos: [[-40,-30], [-40,-10], [-40,10], [-40,30]]
  };
  const norm = normComp(src, 0);
  if(!norm) throw new Error("normComp a renvoyé null");
  if(norm.npins!==4) throw new Error("npins attendu: 4, reçu: "+norm.npins);
  if(!Array.isArray(norm.pinNames)||norm.pinNames[1]!=="TX") throw new Error("pinNames non conservé");
  if(!Array.isArray(norm.pinPos)||norm.pinPos.length!==4) throw new Error("pinPos non conservé");
});

T("détection de conflits de câblage et réalignement assisté des broches (alim/masse critique)",()=>{
  const u1 = C("header", 10, 10, {ref:"U1", value:"TEST_IC"});
  sheet([u1], []);
  peOpen(u1);
  icSetCount(u1, 4);
  peClose();

  const pins = allPins(u1);
  if(pins.length !== 4) throw new Error("4 broches attendues pour U1, reçu: " + pins.length);

  const w1 = { x1: pins[0].x, y1: pins[0].y, x2: pins[0].x - 40, y2: pins[0].y, net: "+3.3V" };
  const w2 = { x1: pins[1].x, y1: pins[1].y, x2: pins[1].x - 40, y2: pins[1].y, net: "GND" };
  sheet([u1], [w1, w2]);

  const pinoutInverse = [
    { number: 1, name: "GND" },
    { number: 2, name: "+3.3V" },
    { number: 3, name: "NC" },
    { number: 4, name: "NC" }
  ];

  const conflits = crDetecterConflitsCablage(u1, pinoutInverse);
  if(!conflits || conflits.length !== 1) {
    throw new Error("1 conflit attendu, obtenu : " + (conflits ? conflits.length : 0));
  }
  const c = conflits[0];
  if(c.type !== "swap") throw new Error("type attendu: swap, reçu: " + c.type);
  if(!c.critique) throw new Error("le conflit alim/masse doit être marqué critique");
  if(c.numA !== 1 || c.numB !== 2) throw new Error("broches permutées incorrectes: " + c.numA + ", " + c.numB);

  // Réaligner les fils selon l'action approuvée
  const count = crRealignerFilsBroches(u1, conflits);
  if(count !== 1) throw new Error("1 permutation attendue, reçu: " + count);

  // w1 (+3.3V) connecté à la broche 2, w2 (GND) connecté à la broche 1
  if(w1.x1 !== pins[1].x || w1.y1 !== pins[1].y) {
    throw new Error("Le fil +3.3V aurait dû être réaligné sur la broche 2");
  }
  if(w2.x1 !== pins[0].x || w2.y1 !== pins[0].y) {
    throw new Error("Le fil GND aurait dû être réaligné sur la broche 1");
  }

  // Plus aucun conflit après réalignement
  const conflitsApres = crDetecterConflitsCablage(u1, pinoutInverse);
  if(conflitsApres.length !== 0) {
    throw new Error("Aucun conflit ne devrait subsister après réalignement, reçu: " + conflitsApres.length);
  }
});

T("détection d'inversion de signaux de bus (SDA ⇄ SCL)",()=>{
  const u2 = C("header", 20, 20, {ref:"U2"});
  sheet([u2], []);
  peOpen(u2);
  icSetCount(u2, 4);
  peClose();

  const pins = allPins(u2);
  const wA = { x1: pins[0].x, y1: pins[0].y, x2: pins[0].x + 40, y2: pins[0].y, net: "I2C_SDA" };
  const wB = { x1: pins[1].x, y1: pins[1].y, x2: pins[1].x + 40, y2: pins[1].y, net: "I2C_SCL" };
  sheet([u2], [wA, wB]);

  const pinoutI2C = [
    { number: 1, name: "SCL" },
    { number: 2, name: "SDA" },
    { number: 3, name: "NC" },
    { number: 4, name: "NC" }
  ];

  const conflits = crDetecterConflitsCablage(u2, pinoutI2C);
  if(!conflits || conflits.length !== 1) {
    throw new Error("1 conflit attendu pour SDA/SCL, reçu: " + (conflits ? conflits.length : 0));
  }
  if(conflits[0].type !== "swap") throw new Error("type attendu: swap");
  if(conflits[0].critique) throw new Error("un swap SDA/SCL n'est pas critique alim/masse");

  crRealignerFilsBroches(u2, conflits);
  if(wA.x1 !== pins[1].x || wA.y1 !== pins[1].y) throw new Error("SDA doit être sur pin 2");
  if(wB.x1 !== pins[0].x || wB.y1 !== pins[0].y) throw new Error("SCL doit être sur pin 1");
});

console.log("\n"+ok+" essais réussis, "+ko+" en échec.");
process.exit(ko?1:0);


