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

/* La LIB réelle, comme gestion-lib/test/banc-catalogue.js : WEB_CAO_LIB, sinon
   LIB/ à côté de l'outil, sinon celle de WEB_SUITE (../PROJETS/LIB_CAO, clonée
   là par ci.yml). La racine du dépôt n'a plus de LIB_composants.csv depuis le
   déménagement de la LIB : l'essai y était sauté en silence. */
const CSV_PATH=[process.env.WEB_CAO_LIB,path.join(ROOT,"LIB"),path.join(ROOT,"..","PROJETS","LIB_CAO")]
  .filter(Boolean).map(d=>path.join(d,"LIB_composants.csv")).find(p=>fs.existsSync(p))||"";
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
  "SCHEMA_PATTERNS","NET_CLASSES","netClassSelect",
  "addComp","schComposantsDansZone","schToutesLesZones",
  "push","undo","redo","touchWires","buildTabs","draw","fit","resize",
  /* bus et hiérarchie */
  "C_BUS","BUS_WIDTH","sheetBlocks","hitSheetBlock","hitSheetPin","sheetInterconnections","newHierPage",
  "schDevelopperSignauxBus","schBusDuPoint","schPiquageSurFil","schTousLesPiquages",
  "schSignauxOccupesSurBus","schSuggererProchainSignal","schPiquerSignal","schOuvrirPiquageModal","schFermerPiquageModal",
  "SCH_PIQUAGE_MEMOIRE",
  /* bibliothèque et géométrie */
  "bbox",
  "defOf","allPins","pinCount","icGeom","key","LIB","pinsOf",
  "pkgBaseOf","pkgKnown","pkgBaseList","PKG_BASES",
  /* brochage (04 + 19) */
  "icPins","icBodyOf","icSideOf","icPinLabel","icFree","icShapeOf","icStep","IC_STEP",
  "icSetCount","icSetShape","icSetBody","icFitNames","icMovePin","reshapeComp",
  "peOpen","peClose","ceOpen","ceClose",
  /* libellés déplaçables et étiquettes de net (08 + 09) */
  "compTexts","textBox","textOff","setTextOff","netLabelAt","netLabelBoxes",
  "pinContacts","reconnectContacts","resetTexts","pinContactPoints","moveSelBy",
  "hitText","hitComp","selCount","tactileMultiDefinir","tactileMultiActif","schRouletteCible","trToucheParse",
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
  /* variantes de montage (commun/variantes.js + 26-variantes.js) */
  "varNorm","varVide","varAjouter","varSupprimer","varRenommer","varDefinirMonte","varEstMonte",
  "varReperesNonMontes","varSlug","varNom","schVarComposants","schVarChoisir","schVarDessiner",
  "schVarPropsHtml","schVarOuvrir","schVarFermer","bomCsvNom",
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
  "sessTient","sessUrl","sessQuitte","sessionSchema","autosave","clearBackup",
  "sessCibleEcrire","sessCiblePrendre","schSonde","schSonderCible","sessAller",
  /* exporter vers le PCB, enregistrer en local, sauvegarder le projet */
  "exporterVersPcb","SCH_EXPORT_PCB","saveJson","saveProjetGithub","schDocCourant",
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
  "crDetecterConflitsCablage","crRealignerFilsBroches",
  "CR_ETAT","crBuildModal","crRechercherDistributeurs","crTrierEtAfficherCandidats","crAppliquerAuComposant",
  /* synchronisation et alertes Gestion LIB */
  "SCH_LIB_ALERTE","schTrouverComposantsAmettreAJour","schComposantAlerteLib",
  "schAppliquerMajLibComposant","schAppliquerMajLibTous","sessDiffuserLibModif","sessEcouterLibModif",
  /* explorateur visuel de bibliothèque */
  "ELIB","explorateurLibOuvrir","explorateurLibFermer","elibClassifierItem","elibIsSmd","elibIsTht","elibHasSpice","elibFiltrerEtAfficher","schOuvrirExplorateurLib",
  /* schémas d'exemples */
  "demo","demo2","demo12v","demo12v_p2","SCH_EXEMPLES","schChargerExemple","schExOuvrir",
  /* brochage par référence (commun/brochage.js + 25-brochage.js) */
  "brochageLire","brochagePartie","brochageParties","brochagePattes","brochageNom",
  "brNomBroche","brPatte","brPattes","brochageListe","BROCHAGE_PATTES","brDepuisLib","brAppliquer","brChoisirPartie","brSaisirPatte",
  "brCandidats","brReferenceAChoisir","brPattesBoitier","brControles","brControlesDe",
  "brAjouterPartie","brPartieLibre","brRepere","brPanneauHtml","PKG_MAX","buildProps"
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
/* essais asynchrones : lancés à la fin, l'un après l'autre */
const T_ASYNC=[];
function TA(name,fn){T_ASYNC.push([name,fn]);}
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
T("session : projet ouvert, une session sans travail non enregistré laisse la place au fichier",()=>{
  dom.session.clear();
  projOuvrir("carte PIR");
  try{
    // l'éditeur ouvert avant que le projet soit lu : feuille vide, mise de côté
    sheet([],[]);S.dirty=false;
    if(!sessEnregistrer())throw new Error("rien de mis de côté");
    if(sessionSchema())throw new Error("une session vide et propre ne doit pas masquer le fichier du projet");
    // un travail non enregistré, lui, revient
    sheet([C("resistor",2,2,{ref:"R1",value:"10k"})],[]);S.dirty=true;
    sessEnregistrer();
    sheet([],[]);S.dirty=false;
    if(!sessionSchema()||!S.comps.length)throw new Error("le travail non enregistré doit revenir");
  }finally{projFermer();dom.session.clear();S.dirty=false;}
});
T("navigateur : aucune copie du schéma n'y est gardée",()=>{
  dom.session.clear();dom.storage.clear();
  /* une copie dans le navigateur finissait par concurrencer, en plus vieille,
     le fichier du projet : le dossier fait foi, l'onglet seul garde la session */
  sheet([C("resistor",1,1,{ref:"R9",value:"en cours"})],[]);
  S.dirty=true;
  autosave();
  if(dom.storage.getItem("schemedit.autosave"))
    throw new Error("autosave() ne doit plus rien écrire dans le navigateur");
  /* l'ancienne sauvegarde d'une version précédente est effacée, pas reprise */
  dom.storage.setItem("schemedit.autosave",JSON.stringify({t:1,doc:{pages:[]}}));
  clearBackup();
  if(dom.storage.getItem("schemedit.autosave"))throw new Error("ancienne sauvegarde restée");
  S.dirty=false;
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

T("synoptique hiérarchique : sheet pins, bus traversants et interconnexions inter-blocs",()=>{
  S.pages = [
    newHierPage("Hiérarchie"),
    newPage("Microcontrôleur"),
    newPage("Mémoire Flash")
  ];
  // Feuille 1 (MCU)
  S.pages[1].comps = [
    C("gport", 10, 10, {value: "SPI"}),
    C("gport", 10, 20, {value: "+3V3"}),
    C("gport", 10, 30, {value: "GND"}),
    C("gport", 10, 40, {value: "IRQ_FLASH"})
  ];
  // Feuille 2 (Flash)
  S.pages[2].comps = [
    C("gport", 20, 10, {value: "SPI"}),
    C("gport", 20, 20, {value: "+3V3"}),
    C("gport", 20, 30, {value: "GND"}),
    C("gport", 20, 40, {value: "HOLD_WP"})
  ];

  gotoPage(0);
  const blocks = sheetBlocks();
  if(blocks.length !== 2) throw new Error("2 blocs attendus sur la feuille racine");

  const bMcu = blocks[0];
  const bFlash = blocks[1];

  // Vérification de la classification des pins du MCU
  const pinSpi = bMcu.pins.find(p => p.name === "SPI");
  if(!pinSpi || pinSpi.type !== "bus" || !pinSpi.isBus) throw new Error("port SPI doit être classé en bus");
  if(pinSpi.side !== "right") throw new Error("port bus SPI doit être placé sur le côté droit du bloc");

  const pin3v3 = bMcu.pins.find(p => p.name === "+3V3");
  if(!pin3v3 || pin3v3.type !== "power" || !pin3v3.isPower) throw new Error("port +3V3 doit être classé en power");
  if(pin3v3.side !== "left") throw new Error("port alim +3V3 doit être placé sur le côté gauche du bloc");

  // Détection des interconnexions
  const inters = sheetInterconnections();
  if(!inters || inters.length < 3) throw new Error("au moins 3 interconnexions attendues (SPI, +3V3, GND), trouvé: " + inters.length);

  const linkSpi = inters.find(l => l.name === "SPI");
  if(!linkSpi || !linkSpi.isBus) throw new Error("liaison SPI doit être un bus traversant");
  if(linkSpi.pins.length !== 2) throw new Error("liaison SPI doit interconnecter 2 broches");
  if(linkSpi.blocks.length !== 2) throw new Error("liaison SPI doit interconnecter 2 blocs distincts");

  const linkGnd = inters.find(l => l.name === "GND");
  if(!linkGnd || !linkGnd.isPower) throw new Error("liaison GND doit être une alimentation");

  // Test de hitSheetPin
  const hitP = hitSheetPin(pinSpi.x, pinSpi.y, 10);
  if(!hitP || hitP.name !== "SPI") throw new Error("hitSheetPin n'a pas détecté la broche SPI");
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

T("recherche distributeurs : agrégation Mouser et DigiKey", async ()=>{
  // Mock crApiAppel
  const ancienFetch = global.fetch;
  global.fetch = async (url, opts) => {
    const body = JSON.parse(opts.body || "{}");
    if (body.tool === "mouser_get_part") {
      return {
        ok: true,
        json: async () => ({
          result: {
            results: [{
              mfr_part_number: "IRA-S400ST01A01",
              manufacturer: "Murata",
              package: "TO-5",
              stock: 450,
              price: 3.25,
              currency: "EUR",
              description: "Pyroelectric Infrared Sensor",
              datasheet_url: "//www.mouser.com/ds/2/281/ira-s400st01a01-1234.pdf",
              part_number: "81-IRA-S400ST01A01",
              parameters: { "Package / Case": "TO-5", "Supply Voltage": "2V-15V" }
            }]
          }
        })
      };
    }
    if (body.tool === "digikey_get_part") {
      return {
        ok: true,
        json: async () => ({
          result: {
            results: [{
              mfr_part_number: "IRA-S400ST01A01",
              manufacturer: "Murata Electronics",
              package: "TO-5-3",
              stock: 120,
              price: 3.50,
              currency: "EUR",
              part_number: "490-IRA-S400ST01A01-ND",
              parameters: { "Sensitivity": "3.3mV" }
            }]
          }
        })
      };
    }
    return { ok: true, json: async () => ({ result: {} }) };
  };

  try {
    const cands = await crRechercherDistributeurs("IRA-S400ST01A01");
    if (!cands || cands.length !== 1) {
      throw new Error("1 candidat agrégé attendu, reçu: " + (cands ? cands.length : 0));
    }
    const c = cands[0];
    if (c.source !== "distrib") throw new Error("source attendue 'distrib', reçu: " + c.source);
    if (c.model !== "IRA-S400ST01A01") throw new Error("modèle incorrect: " + c.model);
    if (c.package !== "TO-5") throw new Error("package incorrect: " + c.package);
    if (!c.mouserData || !c.digikeyData) throw new Error("mouserData et digikeyData doivent être présents");
    if (!c.datasheet.startsWith("https://")) throw new Error("l'url de datasheet doit avoir le protocole https: " + c.datasheet);
    if (c.parameters["Supply Voltage"] !== "2V-15V" || c.parameters["Sensitivity"] !== "3.3mV") {
      throw new Error("les paramètres Mouser et DigiKey doivent être fusionnés");
    }
  } finally {
    global.fetch = ancienFetch;
  }
});

T("recherche composants : tri, affichage et badges distributeurs", ()=>{
  crBuildModal();
  const modal = document.getElementById("crModal");
  if (!modal) throw new Error("crModal n'a pas été créé dans le DOM");

  CR_ETAT.candidates = [
    {
      source: "distrib",
      model: "IRA-S400ST01A01",
      manufacturer: "Murata",
      package: "TO-5",
      stock: 450,
      price: 3.25,
      currency: "EUR",
      mouserData: { part_number: "81-IRA" },
      digikeyData: { part_number: "490-IRA-ND" }
    },
    {
      source: "mouser",
      model: "MAX3232",
      manufacturer: "Texas Instruments",
      package: "SOIC-16",
      stock: 1200,
      price: 1.10,
      mouserData: { part_number: "595-MAX3232" }
    }
  ];

  crTrierEtAfficherCandidats(false);
  const listHtml = document.getElementById("crList").innerHTML;
  if (!listHtml.includes("cr-badge-distrib")) {
    throw new Error("Le badge Mouser + DigiKey (cr-badge-distrib) doit être présent");
  }
  if (!listHtml.includes("cr-badge-mouser")) {
    throw new Error("Le badge Mouser (cr-badge-mouser) doit être présent");
  }
});

T("recherche composants : application au composant schématique", async ()=>{
  const comp = C("ic", 10, 10, { ref: "U1", val: "IRA-S400ST01A01", lcsc: "C99999" });
  CR_ETAT.el = comp;
  CR_ETAT.partDetails = {
    model: "IRA-S400ST01A01",
    manufacturer: "Murata",
    package: "TO-5",
    parameters: { "Supply Voltage": "2V-15V" }
  };
  CR_ETAT.mouserData = { part_number: "81-IRA-S400ST01A01", stock: 450, price: 3.25 };
  CR_ETAT.digikeyData = { part_number: "490-IRA-ND", stock: 120, price: 3.50 };
  CR_ETAT.selectedCand = { model: "IRA-S400ST01A01" };

  // Construire des checkboxes simulées
  document.body.innerHTML += 
    '<input type="checkbox" id="cp_mpn" checked>' +
    '<input type="checkbox" id="cp_mfr" checked>' +
    '<input type="checkbox" id="cp_pkg" checked>' +
    '<input type="checkbox" id="cp_mouser" checked>' +
    '<input type="checkbox" id="cp_digikey" checked>' +
    '<input type="checkbox" class="cp-spec" data-spec-key="Supply Voltage" data-spec-val="2V-15V" checked>';

  await crAppliquerAuComposant();

  if (comp.mpn !== "IRA-S400ST01A01") throw new Error("MPN non mis à jour: " + comp.mpn);
  if (comp.manufacturer !== "Murata") throw new Error("Fabricant non mis à jour");
  if (comp.pkg !== "TO-5") throw new Error("Boîtier non mis à jour");
  if (comp.mouser_part !== "81-IRA-S400ST01A01") throw new Error("Référence Mouser manquante");
  if (comp.digikey_part !== "490-IRA-ND") throw new Error("Référence DigiKey manquante");
  if (comp.lcsc) throw new Error("L'ancien LCSC sans correspondance doit avoir été retiré");
  if (!comp.specs || comp.specs["Supply Voltage"] !== "2V-15V") throw new Error("Spécifications manquantes");
  if (!comp.distributeurs || !comp.distributeurs.mouser || !comp.distributeurs.digikey) {
    throw new Error("Résumé distributeurs manquant");
  }
});

T("recherche composants : retour systématique du pinout et conservation", async () => {
  const saveFetch = global.fetch;
  const oldComp = {
    id: 10,
    type: "opamp",
    ref: "U1",
    value: "LM358",
    pkg: "SOIC-8",
    x: 100,
    y: 100
  };
  S.comps = [oldComp];

  global.fetch = async (url, opts) => {
    const body = opts && opts.body ? JSON.parse(opts.body) : {};
    if (body.tool === "jlc_get_pinout") {
      return {
        ok: true,
        json: async () => ({
          result: {
            lcsc: "C7950",
            model: "LM358DR2G",
            pins: [
              { number: "1", name: "1OUT" },
              { number: "2", name: "1IN-" },
              { number: "3", name: "1IN+" },
              { number: "4", name: "GND" },
              { number: "5", name: "2IN+" },
              { number: "6", name: "2IN-" },
              { number: "7", name: "2OUT" },
              { number: "8", name: "VCC" }
            ]
          }
        })
      };
    }
    if (body.tool === "jlc_get_part") {
      return {
        ok: true,
        json: async () => ({
          result: {
            lcsc: "C7950",
            model: "LM358DR2G",
            package: "SOIC-8",
            manufacturer: "onsemi",
            stock: 5000,
            price: 0.05
          }
        })
      };
    }
    return { ok: true, json: async () => ({ result: {} }) };
  };

  try {
    CR_ETAT.el = oldComp;
    const cand = { lcsc: "C7950", model: "LM358DR2G" };
    await crSelectionnerCandidat(cand);

    if (!CR_ETAT.pinoutData || CR_ETAT.pinoutData.length !== 8) {
      throw new Error("Pinout non récupéré systématiquement (attendu: 8 broches)");
    }

    const pnl = document.getElementById("crDetailsPanel");
    if (!pnl.innerHTML.includes("BROCHAGE SCHÉMATIQUE OFFICIEL") || !pnl.innerHTML.includes("1OUT") || !pnl.innerHTML.includes("VCC")) {
      throw new Error("Section de pinout schématique non rendue dans les détails");
    }

    // Appliquer au composant
    document.body.innerHTML += '<input type="checkbox" id="cp_pinout" checked>';
    await crAppliquerAuComposant();

    if (!Array.isArray(oldComp.pinout) || oldComp.pinout.length !== 8) {
      throw new Error("el.pinout manquant ou incomplet sur le composant");
    }
    if (!oldComp.pinoutVerified) {
      throw new Error("el.pinoutVerified doit être vrai");
    }
    if (!oldComp.pinNames || oldComp.pinNames[3] !== "GND" || oldComp.pinNames[7] !== "VCC") {
      throw new Error("pinNames incorrects sur le composant");
    }

    // Vérifier la conservation par normComp
    const reloaded = normComp(oldComp, 0);
    if (!reloaded.pinout || reloaded.pinout.length !== 8 || !reloaded.pinoutVerified) {
      throw new Error("normComp n'a pas conservé le pinout");
    }
  } finally {
    global.fetch = saveFetch;
  }
});

T("symbole testpoint_pth : définition, boîtier par défaut et netlist", ()=>{
  if(!LIB.testpoint_pth) throw new Error("testpoint_pth absent de LIB");
  const def = LIB.testpoint_pth;
  if(def.n !== "Point de test percé") throw new Error("Nom incorrect : " + def.n);
  if(def.cat !== "Divers") throw new Error("Catégorie incorrecte : " + def.cat);
  if(def.p !== "TP") throw new Error("Préfixe incorrect : " + def.p);
  if(def.pins.length !== 1 || def.pins[0][0] !== 0 || def.pins[0][1] !== 20) {
    throw new Error("Broche hors grille ou nombre incorrect : " + JSON.stringify(def.pins));
  }
  const expPkg = "Trou metalise diam. trou 1.2mm - dim. plated 2.54mmx1.6mm";
  if(def.pkg !== expPkg) throw new Error("Boîtier par défaut inattendu : " + def.pkg);

  // Vérifier la détection et reconnaissance du boîtier
  const b = pkgBaseOf(expPkg);
  if(!b || !b.base) throw new Error("pkgBaseOf n'a pas reconnu le boîtier");
  if(b.pins !== 1) throw new Error("Nombre de broches attendu 1, obtenu " + b.pins);
  if(!pkgKnown(expPkg)) throw new Error("pkgKnown doit être vrai pour ce boîtier");

  // Instanciation du composant
  sheet([], []);
  const el = addComp("testpoint_pth", 100, 100);
  if(!el.ref || !el.ref.startsWith("TP")) throw new Error("Repère inattendu : " + el.ref);
  if(el.pkg !== expPkg) throw new Error("el.pkg non assigné par défaut : " + el.pkg);

  // Compatibilité boîte de boîtiers (fit)
  const list = pkgBaseList(el);
  const tpFam = list.find(g => g.fam === "Points de test");
  if(!tpFam) throw new Error("Famille 'Points de test' absente de pkgBaseList");
  const tpBase = tpFam.bases.find(x => x.base.b === expPkg);
  if(!tpBase || !tpBase.fit) throw new Error("L'empreinte 'Trou metalise' devrait être marquée 'fit'");

  // Export netlist
  const nl = netlistText();
  if(!nl.includes(el.ref) || !nl.includes(expPkg)) {
    throw new Error("La netlist ne contient pas le composant ou son empreinte : " + nl);
  }
});

T("nouveaux symboles schématiques : AOP 5 broches, TVS, ESD, USB, Barrettes, Ferrite", () => {
  const types = [
    { type: "opamp", expPins: 5, expPkg: "SOIC-8", expP: "U" },
    { type: "ferrite_bead", expPins: 2, expPkg: "0805", expP: "FB" },
    { type: "tvs_diode", expPins: 2, expPkg: "SOD-323", expP: "D" },
    { type: "esd_array", expPins: 6, expPkg: "SOT-23-6", expP: "U" },
    { type: "usb_c_pwr", expPins: 5, expPkg: "USB-C-6P", expP: "J" },
    { type: "usb_c", expPins: 8, expPkg: "USB-C-16P", expP: "J" },
    { type: "usb_micro", expPins: 6, expPkg: "MICRO-USB-B", expP: "J" },
    { type: "header_1x3", expPins: 3, expPkg: "HEADER-2.54-1x3", expP: "J" },
    { type: "header_1x4", expPins: 4, expPkg: "HEADER-2.54-1x4", expP: "J" },
    { type: "header_1x6", expPins: 6, expPkg: "HEADER-2.54-1x6", expP: "J" },
    { type: "header_1x8", expPins: 8, expPkg: "HEADER-2.54-1x8", expP: "J" },
    { type: "header_2x5", expPins: 10, expPkg: "HEADER-2.54-2x5", expP: "J" }
  ];

  for(const t of types) {
    sheet([], []);
    const el = addComp(t.type, 100, 100);
    if(!el) throw new Error("Impossible d'instancier " + t.type);
    if(el.pkg !== t.expPkg) throw new Error(t.type + " : boîtier attendu " + t.expPkg + ", obtenu " + el.pkg);
    const ps = pinsOf(el);
    if(ps.length !== t.expPins) throw new Error(t.type + " : " + t.expPins + " broches attendues, obtenu " + ps.length);
    if(!el.ref.startsWith(t.expP)) throw new Error(t.type + " : préfixe de repère attendu " + t.expP + ", obtenu " + el.ref);
    if(!pkgKnown(el.pkg)) throw new Error(t.type + " : boîtier inconnu dans PKG_BASES " + el.pkg);

    // Vérification de la présence dans la netlist
    const nl = netlistText();
    if(!nl.includes(el.ref) || !nl.includes(el.pkg)) {
      throw new Error("Netlist incomplète pour " + t.type + " : " + nl);
    }
  }

  // Vérification de la compatibilité des barrettes 1,27 mm
  const h4 = C("header_1x4", 10, 10, { ref: "J10", pkg: "HEADER-1.27-1x4" });
  sheet([h4], []);
  if(!pkgKnown(h4.pkg)) throw new Error("HEADER-1.27-1x4 non reconnu");
  const bList = pkgBaseList(h4);
  const fam127 = bList.find(f => f.fam === "Barrettes 1,27 mm");
  if(!fam127) throw new Error("Famille Barrettes 1,27 mm absente");
  const b4 = fam127.bases.find(b => b.base.b === "HEADER-1.27-1x4");
  if(!b4 || !b4.fit) throw new Error("HEADER-1.27-1x4 devrait être 'fit' pour header_1x4");
});

T("Gestion LIB : association complète du composant (Part Name, symbole, empreinte PCB, netlist)", () => {
  const r1 = C("resistor", 10, 10, {
    ref: "R1",
    value: "10k",
    pkg: "0603",
    csvPartName: "RES_0603_10K",
    fpPcb: "0603.json",
    symSch: "resistor.json",
    simModel: "resistor.sub"
  });
  sheet([r1], []);
  const nl = netlistText();
  if(!nl.includes("R1") || !nl.includes("0603")) {
    throw new Error("La netlist doit comporter R1 et 0603");
  }
  const s = JSON.parse(serialize());
  const c = s.pages[0].comps[0];
  if(c.csvPartName !== "RES_0603_10K" || c.fpPcb !== "0603.json" || c.symSch !== "resistor.json") {
    throw new Error("Les métadonnées LIB ne sont pas conservées dans le schéma: " + JSON.stringify(c));
  }
});

T("Gestion LIB Schématique : réception d'alerte de modification et mise à jour assistée", () => {
  const r1 = C("resistor", 10, 10, {
    id: 9901,
    ref: "R1",
    val: "10k",
    pkg: "0603",
    csvPartName: "RES_0603_10K",
    symSch: "resistor.json",
    fpPcb: "0603.json"
  });
  sheet([r1], []);

  // Détection des composants concernés
  const matches = schTrouverComposantsAmettreAJour({
    genre: "fichier",
    typeFichier: "schematique",
    nom: "resistor.json"
  });
  if(matches.length !== 1 || matches[0].id !== r1.id) {
    throw new Error("schTrouverComposantsAmettreAJour doit trouver R1 pour resistor.json");
  }

  // Simulation d'une alerte reçue
  SCH_LIB_ALERTE.active = true;
  SCH_LIB_ALERTE.compIds = new Set([r1.id]);
  if(!schComposantAlerteLib(r1)) {
    throw new Error("schComposantAlerteLib doit indiquer une alerte active pour R1");
  }

  // Application de la mise à jour assistée avec nouvelle métadonnée
  window.CSV_LIB = [{
    "Part Name": "RES_0603_10K",
    "Manufacturer": "YAGEO",
    "MPN": "RC0603FR-0710KL",
    "Empreinte PCB": "0603_DENSE.json",
    "Empreinte Schématique": "resistor.json"
  }];

  const count = schAppliquerMajLibTous({ genre: "fichier", nom: "resistor.json" });
  if(count !== 1) throw new Error("1 composant aurait dû être mis à jour, obtenu: " + count);
  if(r1.manufacturer !== "YAGEO" || r1.mpn !== "RC0603FR-0710KL" || r1.fpPcb !== "0603_DENSE.json") {
    throw new Error("Les champs mis à jour n'ont pas été appliqués: " + JSON.stringify(r1));
  }
  if(schComposantAlerteLib(r1)) {
    throw new Error("L'alerte doit être levée après la mise à jour de R1");
  }
});

T("Zones fonctionnelles schématiques : inclusion géométrique et capture des composants", () => {
  const u1 = C("ic", 3, 3, { id: 101, ref: "U1", val: "LM2596" });
  const l1 = C("inductor", 4, 3, { id: 102, ref: "L1", val: "33uH" });
  const c1 = C("capacitor", 2, 3, { id: 103, ref: "C1", val: "100uF" });
  const r_hors = C("resistor", 20, 20, { id: 104, ref: "R99", val: "10k" });

  sheet([u1, l1, c1, r_hors], []);

  const zoneAlim = {
    id: 1,
    shape: "rect",
    x1: 1 * G, y1: 1 * G,
    x2: 6 * G, y2: 6 * G,
    isZone: true,
    category: "Alimentation",
    color: "#f59e0b",
    label: "BUCK_5V"
  };

  const inclus = schComposantsDansZone(zoneAlim, S.comps);
  if(inclus.length !== 3) {
    throw new Error("3 composants attendus dans la zone BUCK_5V, obtenu: " + inclus.length);
  }
  if(!inclus.includes("U1") || !inclus.includes("L1") || !inclus.includes("C1")) {
    throw new Error("U1, L1 et C1 doivent être capturés dans la zone: " + inclus.join(", "));
  }
  if(inclus.includes("R99")) {
    throw new Error("R99 est hors de la zone et ne doit pas être capturé");
  }

  S.drawings = [zoneAlim];
  const toutes = schToutesLesZones();
  if(toutes.length !== 1) {
    throw new Error("1 zone attendue dans schToutesLesZones, obtenu: " + toutes.length);
  }
  const z0 = toutes[0];
  if(z0.nom !== "BUCK_5V" || z0.categorie !== "Alimentation" || z0.couleur !== "#f59e0b") {
    throw new Error("Métadonnées de zone non conformes: " + JSON.stringify(z0));
  }
  if(z0.composants.length !== 3) {
    throw new Error("La zone retournée doit lister ses 3 composants: " + JSON.stringify(z0.composants));
  }
});

T("Explorateur visuel pop-up : initialisation, recherche, classification et pose d'un composant", () => {
  // 1. Module ELIB disponible
  if(typeof explorateurLibOuvrir !== "function" || typeof ELIB === "undefined") {
    throw new Error("explorateurLibOuvrir ou ELIB absent");
  }

  // 2. Base de composants d'essai
  window.CSV_LIB = [
    {
      "Part Name": "C0402_100NF",
      "Reference designator Prefix": "C",
      "Value": "100nF",
      "Package type": "0402",
      "Empreinte PCB": "0402.json",
      "Empreinte Schématique": "cap",
      "Modèle Simulation": "murata_gcm155.sub",
      "Voltage Rating": "10V",
      "Description": "Condensateur céramique CMS 100nF 10V X7R 0402",
      "Manufacturer": "Murata",
      "Part Number": "GCM155R71A104KA55D"
    },
    {
      "Part Name": "RES0603_10K",
      "Reference designator Prefix": "R",
      "Value": "10k",
      "Package type": "0603",
      "Empreinte PCB": "0603.json",
      "Empreinte Schématique": "resistor",
      "Modèle Simulation": "-",
      "current Rating": "50mA",
      "Description": "Résistance couche épaisse 10k 1% 0603",
      "Manufacturer": "Yageo",
      "Part Number": "RC0603FR-0710KL"
    },
    {
      "Part Name": "STM32F103C8T6",
      "Reference designator Prefix": "U",
      "Value": "STM32F103",
      "Package type": "LQFP-48",
      "Empreinte PCB": "LQFP-48.json",
      "Empreinte Schématique": "ic",
      "Description": "Microcontrôleur ARM Cortex-M3 72MHz 64KB Flash",
      "Manufacturer": "STMicroelectronics",
      "Part Number": "STM32F103C8T6"
    }
  ];

  // 3. Test de classification
  if(elibClassifierItem(window.CSV_LIB[0]) !== "c") throw new Error("C0402 doit être classé en 'c'");
  if(elibClassifierItem(window.CSV_LIB[1]) !== "r") throw new Error("RES0603 doit être classé en 'r'");
  if(elibClassifierItem(window.CSV_LIB[2]) !== "ic") throw new Error("STM32 doit être classé en 'ic'");

  if(!elibIsSmd(window.CSV_LIB[0])) throw new Error("0402 doit être détecté CMS (SMD)");
  if(!elibHasSpice(window.CSV_LIB[0])) throw new Error("C0402 possède un modèle SPICE");
  if(elibHasSpice(window.CSV_LIB[1])) throw new Error("RES0603 n'a pas de modèle SPICE");

  // 4. Ouverture et sélection via explorateurLibOuvrir
  let selected = null;
  explorateurLibOuvrir({
    mode: "schema",
    onSelect: (item) => { selected = item; }
  });

  if(!ELIB.open) throw new Error("ELIB doit être ouvert");
  if(ELIB.items.length !== 3) throw new Error("3 composants attendus dans ELIB.items");

  // Simuler recherche '100n'
  ELIB.query = "100n";
  elibFiltrerEtAfficher();
  if(ELIB.filtered.length !== 1 || ELIB.filtered[0]["Part Name"] !== "C0402_100NF") {
    throw new Error("La recherche '100n' doit trouver exactement C0402_100NF");
  }

  // Fermer
  explorateurLibFermer();
  if(ELIB.open) throw new Error("ELIB doit être fermé");

  // 5. Test de pose interactive sur le schéma avec enrichissement complet
  S.comps = [];
  S.place = "capacitor";
  S.placeRot = 90;
  S.placeLibItem = window.CSV_LIB[0];

  const el = addComp(S.place, 20 * G, 15 * G);
  el.rot = S.placeRot;
  const it = S.placeLibItem;
  el.csvPartName = it["Part Name"];
  el.csvMpn = it["Part Number"];
  el.manufacturer = it["Manufacturer"];
  el.value = it["Value"];
  el.symSch = it["Empreinte Schématique"];
  el.fpPcb = it["Empreinte PCB"];
  el.pkg = it["Package type"];
  el.simModel = it["Modèle Simulation"];
  el.specs = { "Voltage Rating": it["Voltage Rating"] };

  if(el.csvPartName !== "C0402_100NF") throw new Error("csvPartName non assigné: " + el.csvPartName);
  if(el.value !== "100nF") throw new Error("valeur non assignée: " + el.value);
  if(el.pkg !== "0402") throw new Error("boîtier non assigné: " + el.pkg);
  if(el.simModel !== "murata_gcm155.sub") throw new Error("modèle SPICE non assigné: " + el.simModel);
  if(el.rot !== 90) throw new Error("rotation non respectée");
  if(!el.ref.startsWith("C")) throw new Error("préfixe C attendu pour condensateur: " + el.ref);
});

T("schémas d'exemples : exemple 0 (IoT 4 couches) raccordé au PCB", function(){
  schChargerExemple(0);
  if(S.pages.length !== 3) throw new Error("3 feuilles attendues: " + S.pages.length);
  if(S.pages[1].name !== "Microcontrôleur & Bus") throw new Error("Feuille 1 erronée: " + S.pages[1].name);
  if(S.pages[2].name !== "Alimentation & RF") throw new Error("Feuille 2 erronée: " + S.pages[2].name);

  const dNets = docNets();
  const netNames = dNets.groups.map(g => g.name);
  const required = ["+3V3", "+5V", "GND", "RF_ANT", "SPI_CS", "SPI_MISO", "SPI_MOSI", "SPI_SCK", "SWCLK", "SWDIO", "USB_DM", "USB_DP"];
  for(const r of required){
    if(!netNames.includes(r)) throw new Error("Net manquant dans exemple 0: " + r);
  }

  const bom = bomRows();
  const refs = bom.map(b => b.ref);
  const requiredRefs = ["U1", "U2", "U3", "J1", "J2", "J3", "C1", "C2", "C3", "C4", "C5"];
  for(const rf of requiredRefs){
    if(!refs.includes(rf)) throw new Error("Composant manquant dans BOM: " + rf);
  }

  // Vérification de la présence des métadonnées LIB
  const u1 = bom.find(b => b.ref === "U1");
  if(!u1.csvPartName || u1.csvPartName !== "MCU_STM32WL55CCU6") throw new Error("PartName erroné U1: " + u1.csvPartName);
  const j1 = bom.find(b => b.ref === "J1");
  if(!j1.csvPartName || j1.csvPartName !== "CONN-USB_Mini_651005136421") throw new Error("PartName erroné J1: " + j1.csvPartName);
});

T("schémas d'exemples : exemple 1 (Commande 12 V 2 couches) raccordé au PCB", function(){
  schChargerExemple(1);
  if(S.pages.length !== 3) throw new Error("3 feuilles attendues: " + S.pages.length);
  if(S.pages[1].name !== "Commande NPN") throw new Error("Feuille 1 erronée: " + S.pages[1].name);
  if(S.pages[2].name !== "Alimentation") throw new Error("Feuille 2 erronée: " + S.pages[2].name);

  const dNets = docNets();
  const netNames = dNets.groups.map(g => g.name);
  if(!netNames.includes("+5V") || !netNames.includes("12V") || !netNames.includes("GND")){
    throw new Error("Rails d'alimentation manquants dans exemple 1");
  }
});

T("bus de signaux : expansion syntaxique (D[0..7], SPI{...}, I2C, UART)", function(){
  const d07 = schDevelopperSignauxBus("D[0..7]");
  if(d07.length !== 8 || d07[0] !== "D0" || d07[7] !== "D7"){
    throw new Error("Erreur expansion D[0..7]: " + JSON.stringify(d07));
  }
  const dInv = schDevelopperSignauxBus("D[3..0]");
  if(dInv.length !== 4 || dInv[0] !== "D3" || dInv[3] !== "D0"){
    throw new Error("Erreur expansion inversée D[3..0]: " + JSON.stringify(dInv));
  }
  const spi = schDevelopperSignauxBus("SPI{MOSI,MISO,SCK,CS}");
  if(!spi.includes("SPI_MOSI") || !spi.includes("SPI_MISO") || !spi.includes("SPI_SCK") || !spi.includes("SPI_CS")){
    throw new Error("Erreur faisceau SPI: " + JSON.stringify(spi));
  }
  const bare = schDevelopperSignauxBus("{TX,RX}");
  if(bare.length !== 2 || bare[0] !== "TX" || bare[1] !== "RX"){
    throw new Error("Erreur faisceau bare {TX,RX}: " + JSON.stringify(bare));
  }
  const stdSpi = schDevelopperSignauxBus("SPI");
  if(!stdSpi.includes("SPI_MOSI") || !stdSpi.includes("SPI_SCK")){
    throw new Error("Erreur protocole standard SPI: " + JSON.stringify(stdSpi));
  }
  const stdI2c = schDevelopperSignauxBus("I2C");
  if(!stdI2c.includes("I2C_SDA") || !stdI2c.includes("I2C_SCL")){
    throw new Error("Erreur protocole standard I2C: " + JSON.stringify(stdI2c));
  }
});

T("bus de signaux : isolation électrique des piquages dans computeNets", function(){
  const wBus = {x1: 0, y1: 100, x2: 200, y2: 100, bus: true, net: "D[0..7]"};
  const r1 = C("resistor", 50, 50, {ref: "R1", value: "10k"});
  const p1 = allPins(r1);
  const w1 = {x1: p1[0].x, y1: p1[0].y, x2: 50, y2: 100, net: "D0"};

  const r2 = C("resistor", 150, 50, {ref: "R2", value: "10k"});
  const p2 = allPins(r2);
  const w2 = {x1: p2[0].x, y1: p2[0].y, x2: 150, y2: 100, net: "D1"};

  const wires = [wBus, w1, w2];
  splitWireArray(wires);
  const res = computeNets([r1, r2], wires);

  // R1.1 et R2.1 ne doivent PAS être dans le même net malgré leur raccordement au même bus !
  const netR1 = res.byWire.get(w1);
  const netR2 = res.byWire.get(w2);
  if(!netR1 || !netR2) throw new Error("Nets introuvables pour w1 ou w2");
  if(netR1 === netR2) throw new Error("Court-circuit anormal via le bus : R1 et R2 partagent le même net !");
  if(netR1.name !== "D0") throw new Error("Nom de net incorrect pour w1: " + netR1.name);
  if(netR2.name !== "D1") throw new Error("Nom de net incorrect pour w2: " + netR2.name);

  // Un second piquage D0 ailleurs doit par contre rejoindre le net D0 par nom
  const r3 = C("resistor", 180, 50, {ref: "R3", value: "1k"});
  const p3 = allPins(r3);
  const w3 = {x1: p3[0].x, y1: p3[0].y, x2: 180, y2: 100, net: "D0"};
  const wires2 = [wBus, w1, w2, w3];
  splitWireArray(wires2);
  const res2 = computeNets([r1, r2, r3], wires2);
  const netR1_b = res2.byWire.get(w1);
  const netR3_b = res2.byWire.get(w3);
  if(netR1_b !== netR3_b) throw new Error("Les deux signaux D0 doivent être fusionnés par nom !");
});

T("bus de signaux : détection de piquage, suggestion auto-incrémentée et application", function(){
  const wBus = {x1: 0, y1: 100, x2: 200, y2: 100, bus: true, net: "D[0..7]"};
  const wSig = {x1: 50, y1: 50, x2: 50, y2: 100};
  const wires = [wBus, wSig];
  splitWireArray(wires);

  const piq = schPiquageSurFil(wSig, wires);
  if(!piq) throw new Error("Piquage non détecté sur wSig");
  if(piq.busName !== "D[0..7]") throw new Error("Nom du bus piqué incorrect: " + piq.busName);
  if(piq.x !== 50 || piq.y !== 100) throw new Error("Coordonnées de piquage incorrectes: " + piq.x + "," + piq.y);

  // Test suggestion auto-incrémentée
  delete SCH_PIQUAGE_MEMOIRE["D[0..7]"];
  const s1 = schSuggererProchainSignal("D[0..7]");
  if(s1 !== "D0") throw new Error("Premier signal suggéré doit être D0, reçu: " + s1);

  schPiquerSignal(wSig, s1, "D[0..7]");
  if(wSig.net !== "D0") throw new Error("wSig n'a pas reçu le label D0");

  const s2 = schSuggererProchainSignal("D[0..7]");
  if(s2 !== "D1") throw new Error("Prochain signal suggéré doit être D1 (auto-incrément), reçu: " + s2);

  const occupes = schSignauxOccupesSurBus(wBus, wires);
  if(!occupes.has("D0")) throw new Error("D0 doit être relevé comme occupé sur le bus");
});

T("nomenclature et netlist enrichies : liaison automatique avec LIB_composants.csv", function(){
  const c1 = C("capacitor", 0, 0, {ref: "C1", value: "100nF", pkg: "0402", csvPartName: "C0402_100NF"});
  sheet([c1], []);

  const rows = bomRows();
  if(!rows.length) throw new Error("bomRows vide");
  const r = rows[0];
  if(r.mpn !== "GCM155R71A104KA55D") throw new Error("MPN non enrichi depuis LIB: " + r.mpn);
  if(r.manufacturer !== "Murata") throw new Error("Fabricant non enrichi: " + r.manufacturer);
  if(r.fpPcb !== "0402.json") throw new Error("Empreinte PCB non enrichie: " + r.fpPcb);

  const csv = bomCsvText();
  if(csv.indexOf("Empreinte PCB;Réf Bibliothèque;Part Number;Fabricant") < 0){
    throw new Error("Colonnes enrichies absentes du header CSV: " + csv.split("\r\n")[0]);
  }
  if(csv.indexOf("GCM155R71A104KA55D") < 0) throw new Error("MPN fabricant absent du CSV exporté");
  if(csv.indexOf("Murata") < 0) throw new Error("Fabricant Murata absent du CSV exporté");
  if(csv.indexOf("0402.json") < 0) throw new Error("Empreinte PCB absente du CSV exporté");

  const nl = netlistText();
  if(nl.indexOf("=== Références Fabricants & Bibliothèque ===") < 0){
    throw new Error("Section de références catalogue absente de la netlist: \n" + nl);
  }
  if(nl.indexOf("GCM155R71A104KA55D") < 0) throw new Error("MPN absent de la section netlist");
});

/* ==========================================================================
   Sélection multiple : saisir n'importe quel élément emmène le groupe
   (09-interaction.js). Au doigt, la commande « Multi » de la roulette tactile tient lieu de Ctrl.
   ========================================================================== */
function ptr(x,y,o){const q=w2s(x,y);return Object.assign({clientX:q.x,clientY:q.y,pointerType:"mouse"},o||{});}
function glisseSch(a,b){
  dom.fire("pointerdown",a);
  dom.fire("pointermove",Object.assign({},a,{clientX:(a.clientX+b.clientX)/2,clientY:(a.clientY+b.clientY)/2}));
  dom.fire("pointermove",b);
  dom.fireWin("pointerup",b);
}
function groupeTroisR(){
  const rs=[1,2,3].map(i=>C("resistor",10*i,10,{ref:"R"+i,value:"10k"}));
  // un fil libre, loin des symboles : ses bouts ne touchent rien
  const w={x1:40*G,y1:10*G,x2:45*G,y2:10*G};
  sheet(rs,[w]);
  S.scale=1;S.ox=0;S.oy=0;setMode("select");
  for(const r of rs)S.sel.add(r.id);
  S.selW.add(w);
  return {rs,w};
}
T("sélection multiple : saisir le libellé d'un composant emmène tout le groupe",()=>{
  const {rs}=groupeTroisR();
  const t=compTexts(rs[1]).find(t=>t.kind==="val"), b=textBox(t);
  const cx=(b.x1+b.x2)/2, cy=(b.y1+b.y2)/2;
  if(!hitText(cx,cy))throw new Error("le décor doit viser le libellé");
  glisseSch(ptr(cx,cy),ptr(cx+2*G,cy+G));
  if(selCount()!==4)throw new Error("la sélection devait rester entière : "+selCount());
  rs.forEach((r,i)=>{
    if(r.x!==(10+10*i+2)*G||r.y!==11*G)throw new Error(r.ref+" devait suivre le groupe : "+r.x+","+r.y);
  });
  if(textOff(rs[1],t.kind))throw new Error("le libellé ne devait pas se décaler de son symbole");
});
T("composant seul sélectionné : son libellé se déplace toujours à part",()=>{
  const {rs}=groupeTroisR();
  clearSel();S.sel.add(rs[1].id);
  const t=compTexts(rs[1]).find(t=>t.kind==="val"), b=textBox(t);
  const cx=(b.x1+b.x2)/2, cy=(b.y1+b.y2)/2;
  glisseSch(ptr(cx,cy),ptr(cx+G,cy));
  if(rs[1].x!==20*G)throw new Error("le symbole ne devait pas bouger");
  if(!textOff(rs[1],t.kind))throw new Error("le libellé devait se décaler");
});
T("sélection multiple : le bout d'un fil pris avec le groupe ne l'étire pas",()=>{
  const {rs,w}=groupeTroisR();
  // tout près de l'extrémité : jadis la poignée d'étirement
  const ex=w.x1+3, ey=w.y1;
  glisseSch(ptr(ex,ey),ptr(ex,ey+2*G));
  if(w.x1!==40*G||w.x2!==45*G||w.y1!==12*G||w.y2!==12*G)
    throw new Error("le fil devait partir en bloc : "+[w.x1,w.y1,w.x2,w.y2].join(","));
  if(rs[2].y!==12*G)throw new Error("R3 devait suivre le groupe : "+rs[2].y);
});
T("fil seul sélectionné : son bout s'étire toujours",()=>{
  const {w}=groupeTroisR();
  clearSel();S.selW.add(w);
  glisseSch(ptr(w.x1+3,w.y1),ptr(w.x1+3,w.y1+2*G));
  if(w.y1!==12*G||w.y2!==10*G)throw new Error("seul le bout saisi devait bouger : "+[w.x1,w.y1,w.x2,w.y2].join(","));
});
T("Ctrl+clic sur un composant pris : il sort au relâchement, Ctrl+glisser emmène le groupe",()=>{
  const {rs}=groupeTroisR();
  const c=ptr(rs[2].x,rs[2].y,{ctrlKey:true});
  dom.fire("pointerdown",c);dom.fireWin("pointerup",c);
  if(S.sel.has(rs[2].id))throw new Error("le clic seul devait retirer R3");
  S.sel.add(rs[2].id);
  glisseSch(ptr(rs[2].x,rs[2].y,{ctrlKey:true}),ptr(rs[2].x+G,rs[2].y,{ctrlKey:true}));
  if(!S.sel.has(rs[2].id))throw new Error("après un glissement R3 reste pris");
  if(rs[0].x!==11*G)throw new Error("R1 devait suivre : "+rs[0].x);
});
/* Fils en équerre : déplacer un symbole ne doit jamais laisser un fil en biais */
function equerre(){
  const obl=S.wires.filter(w=>w.x1!==w.x2&&w.y1!==w.y2);
  if(obl.length)throw new Error("fil en biais : "+obl.map(w=>[w.x1,w.y1,w.x2,w.y2].join(",")).join(" | "));
  const nul=S.wires.filter(w=>w.x1===w.x2&&w.y1===w.y2);
  if(nul.length)throw new Error(nul.length+" segment(s) nul(s) laissé(s)");
}
function relies(a,b){
  const na=netAtLive(a.x,a.y);
  if(!na||na!==netAtLive(b.x,b.y))throw new Error("la liaison entre les deux broches est perdue");
}
T("déplacer un symbole hors de l'axe du fil : décroché en équerre, pas de biais",()=>{
  const r1=C("resistor",10,10,{ref:"R1"}), r2=C("resistor",30,10,{ref:"R2"});
  const a=allPins(r1)[1], b=allPins(r2)[0];
  sheet([r1,r2],[{x1:a.x,y1:a.y,x2:b.x,y2:b.y}]);
  S.scale=1;S.ox=0;S.oy=0;setMode("select");
  glisseSch(ptr(r1.x,r1.y),ptr(r1.x+G,r1.y+2*G));
  if(r1.y!==12*G)throw new Error("R1 devait descendre : "+r1.y);
  equerre();
  if(S.wires.length!==3)throw new Error("un Z de trois segments attendu : "+S.wires.length);
  relies(allPins(r1)[1],allPins(r2)[0]);
  undo();
  if(S.wires.length!==1||S.wires[0].y1!==S.wires[0].y2)throw new Error("annuler rend le fil d'origine");
});
T("déplacer un symbole : un coude libre glisse avec lui au lieu de casser l'équerre",()=>{
  const r1=C("resistor",10,10,{ref:"R1"}), r2=C("resistor",30,20,{ref:"R2"});
  const a=allPins(r1)[1], b=allPins(r2)[0];
  const ws=[{x1:a.x,y1:a.y,x2:25*G,y2:a.y},{x1:25*G,y1:a.y,x2:25*G,y2:b.y},{x1:25*G,y1:b.y,x2:b.x,y2:b.y}];
  sheet([r1,r2],ws);
  S.sel.add(r1.id);
  moveSelBy(0,3*G);
  equerre();
  if(S.wires.length!==3)throw new Error("le coude devait glisser sans ajouter de segment : "+S.wires.length);
  if(ws[0].y1!==13*G||ws[0].y2!==13*G||ws[1].y1!==13*G)throw new Error("coude non suivi : "+JSON.stringify(ws));
  relies(allPins(r1)[1],allPins(r2)[0]);
  // jusqu'au bout du voisin : le segment vertical disparaît, rien de nul ne reste
  moveSelBy(0,7*G);
  equerre();
  relies(allPins(r1)[1],allPins(r2)[0]);
});
T("flèches répétées sur un symbole : les fils restent en équerre",()=>{
  const r1=C("resistor",10,10,{ref:"R1"}), r2=C("resistor",30,10,{ref:"R2"});
  const a=allPins(r1)[1], b=allPins(r2)[0];
  sheet([r1,r2],[{x1:a.x,y1:a.y,x2:b.x,y2:b.y}]);
  S.sel.add(r1.id);
  for(const d of [[0,G],[0,G],[G,0],[0,-G],[0,-G],[-G,0]]){
    moveSelBy(d[0],d[1]);
    equerre();
    relies(allPins(r1)[1],allPins(r2)[0]);
  }
  if(S.wires.length>3)throw new Error("les décrochés s'empilent : "+S.wires.length);
});
T("mode tactile, bouton « Multi » : chaque toucher ajoute ou retire, le doigt trace le lasso",()=>{
  const {rs}=groupeTroisR();
  const garde=localStorage.getItem("cao.modeTactile");
  localStorage.setItem("cao.modeTactile","1");
  tactileMultiDefinir(true);
  try{
    clearSel();
    const tch=(x,y)=>ptr(x,y,{pointerType:"touch"});
    for(const r of rs){dom.fire("pointerdown",tch(r.x,r.y));dom.fireWin("pointerup",tch(r.x,r.y));}
    if(S.sel.size!==3)throw new Error("trois touchers devaient prendre trois composants : "+S.sel.size);
    dom.fire("pointerdown",tch(rs[0].x,rs[0].y));dom.fireWin("pointerup",tch(rs[0].x,rs[0].y));
    if(S.sel.has(rs[0].id))throw new Error("toucher un composant pris devait le retirer");
    clearSel();
    glisseSch(tch(0,0),tch(40*G,20*G));
    if(S.sel.size!==3)throw new Error("au doigt, « Multi » enclenché, glisser sur le vide trace un lasso : "+S.sel.size);
    tactileMultiDefinir(false);
    clearSel();
    const ox=S.ox;
    glisseSch(tch(0,0),tch(5*G,0));
    if(S.sel.size||S.ox===ox)throw new Error("« Multi » relâché, glisser sur le vide déplace la vue");
  }finally{
    tactileMultiDefinir(false);
    if(garde===null)localStorage.removeItem("cao.modeTactile");else localStorage.setItem("cao.modeTactile",garde);
  }
});

T("roulette tactile : ce qui est sous le stylet choisit les commandes",()=>{
  const {rs,w}=groupeTroisR();
  clearSel();
  const sur=(x,y)=>{const q=ptr(x,y);return schRouletteCible(q.clientX,q.clientY);};
  const c=sur(rs[1].x,rs[1].y);
  if(c.ctx!=="comp"||c.titre!=="R2")throw new Error("sur R2 : composant attendu, reçu "+c.ctx+" "+c.titre);
  if(!S.sel.has(rs[1].id)||selCount()!==1)throw new Error("le composant touché doit être pris, seul");
  if(typeof c.actions.props!=="function")throw new Error("Propriétés doit être proposé sur un composant");
  const f=sur((w.x1+w.x2)/2,w.y1);
  if(f.ctx!=="fil")throw new Error("sur le fil : fil attendu, reçu "+f.ctx);
  if(!S.selW.has(w)||S.sel.size)throw new Error("le fil touché doit être pris à la place du composant");
  if(sur(25*G,40*G).ctx!=="vide")throw new Error("loin de tout : le vide");
  S.wireStart={x:0,y:0};
  try{
    if(!sur(rs[0].x,rs[0].y).occupe)throw new Error("fil en cours : la roulette doit proposer de le terminer");
  }finally{S.wireStart=null;}
});
T("roulette tactile : les raccourcis tapés par l'utilisateur sont compris",()=>{
  const a=trToucheParse("Ctrl+Shift+N");
  if(a.key!=="n"||a.code!=="KeyN"||!a.ctrlKey||!a.shiftKey||a.altKey)throw new Error("Ctrl+Shift+N mal lu : "+JSON.stringify(a));
  const b=trToucheParse("Suppr");
  if(b.key!=="Delete"||b.ctrlKey)throw new Error("Suppr mal lu : "+JSON.stringify(b));
  if(trToucheParse("échap").key!=="Escape")throw new Error("échap mal lu");
  if(trToucheParse("w").code!=="KeyW"||trToucheParse("7").code!=="Digit7")throw new Error("codes de touche faux");
  if(trToucheParse("Ctrl+").key)throw new Error("un raccourci sans touche ne doit rien donner");
});

T("roulette tactile : un fil se vise au stylet à quelques pixels près",()=>{
  const {w}=groupeTroisR();
  clearSel();
  const q=ptr((w.x1+w.x2)/2,w.y1);
  if(schRouletteCible(q.clientX,q.clientY+10,"pen").ctx!=="fil")throw new Error("à 10 px du fil, le stylet doit le prendre");
  if(!S.selW.has(w))throw new Error("le fil visé doit être sélectionné, pour Supprimer");
  if(schRouletteCible(q.clientX,q.clientY+18,"touch").ctx!=="fil")throw new Error("à 18 px, le doigt doit encore le prendre");
  if(schRouletteCible(q.clientX,q.clientY+40,"touch").ctx!=="vide")throw new Error("à 40 px, c'est le vide");
});
T("roulette tactile : l'appui long garde la sélection multiple",()=>{
  const {rs}=groupeTroisR();
  const garde=localStorage.getItem("cao.modeTactile");
  localStorage.setItem("cao.modeTactile","1");
  try{
    clearSel();S.sel.add(rs[0].id);S.sel.add(rs[1].id);
    const sur=r=>{const q=ptr(r.x,r.y);return schRouletteCible(q.clientX,q.clientY,"pen");};
    if(sur(rs[0]).titre!=="2 sél."||S.sel.size!==2)throw new Error("sur un élément pris, la sélection reste entière");
    tactileMultiDefinir(true);
    sur(rs[2]);
    if(S.sel.size!==3)throw new Error("« Multi » enclenché, l'élément touché s'ajoute : "+S.sel.size);
    // l'appui long annule le geste de l'éditeur : l'élément pris ne doit pas en sortir
    const tch=ptr(rs[0].x,rs[0].y,{pointerType:"touch"});
    dom.fire("pointerdown",tch);
    dom.fireWin("pointercancel",Object.assign({type:"pointercancel"},tch));
    if(!S.sel.has(rs[0].id))throw new Error("un geste annulé ne doit rien retirer de la sélection");
  }finally{
    tactileMultiDefinir(false);
    if(garde===null)localStorage.removeItem("cao.modeTactile");else localStorage.setItem("cao.modeTactile",garde);
  }
});
T("stylet : glisser sur le vide trace un lasso, comme la souris",()=>{
  const {rs}=groupeTroisR();
  clearSel();
  const ox=S.ox;
  glisseSch(ptr(0,0,{pointerType:"pen"}),ptr(40*G,20*G,{pointerType:"pen"}));
  if(S.sel.size!==3||S.ox!==ox)throw new Error("le lasso au stylet devait prendre les trois résistances sans bouger la vue : "+S.sel.size);
});

/* ==========================================================================
   Brochage par référence (commun/brochage.js, 25-brochage.js)
   Relevé sur la carte PIR : un AOP posé en SOIC-8 sans brochage mettait V+
   sur la pastille 4 du LM358 — la masse. La référence de la LIB porte
   désormais, colonne « Brochage », la patte de chaque broche du symbole.
   ========================================================================== */
const BR_LM358="A:OUT=1,IN-=2,IN+=3|B:OUT=7,IN-=6,IN+=5|*:V-=4,V+=8";
const BR_MCP6001="OUT=1,V−=2,IN+=3,IN-=4,V+=5";
const BR_LIB=[
  {"Part Name":"AOP_MCP6001","Reference designator Prefix":"U","Value":"MCP6001",
   "Empreinte PCB":"lib/empreinte/SOT-23-5.json","Empreinte Schématique":"lib/symbole/opamp.json",
   "Brochage":BR_MCP6001},
  {"Part Name":"AOP_LM358","Reference designator Prefix":"U","Value":"LM358",
   "Empreinte PCB":"lib/empreinte/SOIC-8.json","Empreinte Schématique":"lib/symbole/opamp.json",
   "Brochage":BR_LM358},
  {"Part Name":"AOP_SANS","Reference designator Prefix":"U","Value":"TLV9001",
   "Empreinte PCB":"lib/empreinte/SOT-23-5.json","Empreinte Schématique":"lib/symbole/opamp.json"},
  {"Part Name":"R0603_10K","Reference designator Prefix":"R","Value":"10k",
   "Empreinte PCB":"lib/empreinte/0603.json","Empreinte Schématique":"lib/symbole/resistor.json"}
];
/* un AOP câblé : un bout de fil nommé par broche, vers l'extérieur
   (IN− et IN+ à gauche, OUT à droite, V+ en haut, V− en bas) */
function brAop(x,y,opts,noms){
  const el=C("opamp",x,y,Object.assign({value:"LM358",pkg:"SOIC-8"},opts||{}));
  const dir=[[-40,0],[-40,0],[40,0],[0,-40],[0,40]];
  const ps=allPins(el), ws=[];
  noms.forEach((nm,i)=>{if(nm)ws.push({x1:ps[i].x,y1:ps[i].y,x2:ps[i].x+dir[i][0],y2:ps[i].y+dir[i][1],net:nm});});
  return {el,ws};
}
function brAvecLib(fn){
  const avant=window.CSV_LIB;
  window.CSV_LIB=BR_LIB;
  try{fn();}finally{window.CSV_LIB=avant;}
}
T("brochage : lecture de la colonne (parties, « * », NC, signe moins)",()=>{
  const a=brochageLire(BR_MCP6001);
  if(a.erreurs.length)throw new Error("erreurs inattendues : "+a.erreurs.join(" ; "));
  const p=brochagePartie(a,"");
  if(p.broches["V-"]!=="2"||p.broches["IN-"]!=="4"||p.broches["V+"]!=="5")
    throw new Error("MCP6001 mal lu : "+JSON.stringify(p.broches));
  const b=brochageLire(BR_LM358);
  if(brochageParties(b).join()!=="A,B")throw new Error("deux parties attendues : "+brochageParties(b));
  const pb=brochagePartie(b,"B");
  if(pb.broches.OUT!=="7"||pb.broches["IN+"]!=="5"||pb.broches["V+"]!=="8"||pb.broches["V-"]!=="4")
    throw new Error("partie B : les alimentations « * » rejoignent chaque partie : "+JSON.stringify(pb.broches));
  if(brochagePattes(b).join()!=="1,2,3,4,5,6,7,8")throw new Error("pattes : "+brochagePattes(b));
  const nc=brochageLire("B=1,C=3,E=2,NC=4/5");
  if(brochagePartie(nc).nc.join()!=="4,5")throw new Error("NC : "+JSON.stringify(nc));
  if(brochageLire("")!==null||brochageLire("xx")!==null)throw new Error("vide ou « xx » : pas de brochage");
  const err=brochageLire("OUT=1,IN-=1,V+");
  if(err.erreurs.length!==2)throw new Error("deux erreurs attendues (patte prise deux fois, « = » manquant) : "+err.erreurs.join(" | "));
});
T("brochage : nombre de pattes déduit du nom de boîtier",()=>{
  const cas={"SOIC-8":8,"SOT-23-5":5,"SOT23-5":5,"SOT-223-4":4,"MSOP-8":8,"lib/empreinte/SOIC-14.json":14,
             "0603":2,"SOT-23":0,"SC-70":0,"SMA":2,"":0};
  for(const [k,v] of Object.entries(cas))
    if(brPattesBoitier(k)!==v)throw new Error(k+" : "+v+" attendu, "+brPattesBoitier(k));
});
T("brochage : le bug relevé — AOP en SOIC-8 sans référence, V+ sur la masse",()=>{
  /* V+ (broche 4 du symbole) va sur la patte 4 : la masse d'un LM358 */
  const {el,ws}=brAop(10,10,{id:++_uid,ref:"U1"},["FB","VIN","VOUT","VCC","GND"]);
  sheet([el],ws);
  const txt=netlistText("—");
  if(!/NET "VCC"[\s\S]*?U1\.4/.test(txt))throw new Error("sans table, V+ part bien sur U1.4 : "+txt);
  if(!/=== Contrôle du brochage ===\n  ; ERREUR U1 : symbole à 5 broches/.test(txt))
    throw new Error("l'alerte part aussi en commentaire dans la netlist : "+txt);
  const c=brControles().filter(x=>x.ref==="U1");
  if(!c.some(x=>x.niveau==="erreur"&&/5 broches sur un boîtier SOIC-8 à 8 pattes/.test(x.texte)))
    throw new Error("l'alerte « symbole plus petit que le boîtier » manque : "+JSON.stringify(c));
});
T("brochage : la référence MCP6001 applique la datasheet, la netlist suit",()=>brAvecLib(()=>{
  const {el,ws}=brAop(10,10,{id:++_uid,ref:"U1",pkg:"SOT-23-5"},["FB","VIN","VOUT","3V3","GND"]);
  sheet([el],ws);
  if(brReferenceAChoisir(el)!==3)throw new Error("trois références AOP proposées : "+brReferenceAChoisir(el));
  if(brCandidats(el)[0]["Part Name"]==="AOP_SANS")throw new Error("celles qui ont un brochage passent devant");
  el.csvPartName="AOP_MCP6001";
  brDepuisLib(el,BR_LIB[0],true);
  if(el.pinMap.join()!=="4,3,1,5,2")throw new Error("table IN-,IN+,OUT,V+,V- attendue 4,3,1,5,2 : "+el.pinMap);
  if(brReferenceAChoisir(el))throw new Error("la référence est choisie : plus de badge");
  const txt=netlistText("—");
  for(const [net,patte] of [["FB",4],["VIN",3],["VOUT",1],["3V3",5],["GND",2]])
    if(!new RegExp('NET "'+net+'"\\s*\\n\\s*U1\\.'+patte+'\\b').test(txt))
      throw new Error(net+" devait arriver sur U1."+patte+" :\n"+txt);
  if(!/U1\.5\s+V\+/.test(txt))throw new Error("le nom de la broche suit la patte : "+txt);
  if(brControles().length)throw new Error("aucune alerte attendue : "+JSON.stringify(brControles()));
  /* une autre référence sans brochage : la table s'en va */
  brDepuisLib(el,BR_LIB[2],true);
  if(el.pinMap||el.brochage)throw new Error("nouvelle référence sans brochage : plus de table");
}));
T("brochage : la référence sans colonne garde la table retouchée à la main à la mise à jour",()=>{
  const el=C("opamp",0,0,{id:++_uid,ref:"U2",pkg:"SOT-23-5"});
  sheet([el],[]);
  brSaisirPatte(el,3,"5");
  if(!el.pinMapMain||brPatte(el,3)!==5||brPatte(el,0)!==1)throw new Error("saisie manuelle : "+JSON.stringify(el.pinMap));
  if(brSaisirPatte(el,0,"x;y"))throw new Error("une patte illisible est refusée");
  brDepuisLib(el,BR_LIB[2],false);
  if(!el.pinMap||brPatte(el,3)!==5)throw new Error("mise à jour LIB sans brochage : la table manuelle reste");
});
T("brochage : AOP double LM358 — U3A et U3B, un seul boîtier",()=>brAvecLib(()=>{
  const A=brAop(10,10,{id:++_uid,ref:"U3",csvPartName:"AOP_LM358"},["FB1","IN1","OUT1","VCC","GND"]);
  const B=brAop(30,10,{id:++_uid,ref:"U3",csvPartName:"AOP_LM358",part:"B"},["FB2","IN2","OUT2","VCC","GND"]);
  brDepuisLib(A.el,BR_LIB[1],true);
  B.el.brochage=BR_LM358;B.el.part="B";brAppliquer(B.el);
  sheet([A.el,B.el],A.ws.concat(B.ws));
  if(A.el.part!=="A"||brRepere(A.el)!=="U3A"||brRepere(B.el)!=="U3B")
    throw new Error("repères affichés : "+brRepere(A.el)+" / "+brRepere(B.el));
  if(!compTexts(B.el).some(t=>t.kind==="ref"&&t.text==="U3B"))throw new Error("le symbole imprime U3B");
  if(B.el.pinMap.join()!=="6,5,7,8,4")throw new Error("table de la partie B : "+B.el.pinMap);
  const txt=netlistText("—");
  const vcc=txt.match(/NET "VCC"\s*\n((?:\s+U\S+.*\n?)*)/);
  if(!vcc||(vcc[1].match(/U3\.8/g)||[]).length!==1)throw new Error("U3.8 une seule fois dans VCC :\n"+txt);
  if(!/NET "OUT2"\s*\n\s*U3\.7/.test(txt)||!/NET "FB1"\s*\n\s*U3\.2/.test(txt))throw new Error("sorties : "+txt);
  const comps=txt.split("\n").filter(l=>/^\s{4}U3\s/.test(l));
  if(comps.length!==1)throw new Error("U3 une seule fois dans les composants : "+comps.length);
  if(bomRows().filter(r=>r.ref==="U3").length!==1)throw new Error("une ligne de nomenclature pour U3");
  if(brControles().length)throw new Error("rien à redire : "+JSON.stringify(brControles()));
  /* alimentations de B sur un autre net : deux nets sur la patte 8 */
  B.ws.find(w=>w.net==="VCC").net="5V";
  touchWires();
  const c=brControles();
  if(!c.some(x=>/patte U3\.8 reliée à (VCC et à 5V|5V et à VCC)/.test(x.texte)))
    throw new Error("conflit sur la patte partagée attendu : "+JSON.stringify(c));
  /* B retirée : son AOP reste en l'air */
  sheet([A.el],A.ws);
  const d=brControles();
  if(!d.some(x=>x.niveau==="alerte"&&/partie U3B non posée/.test(x.texte)))
    throw new Error("partie absente signalée : "+JSON.stringify(d));
  if(brPartieLibre(A.el)!=="B")throw new Error("B est la partie libre");
  const nv=brAjouterPartie(A.el);
  if(!nv||nv.ref!=="U3"||nv.part!=="B"||nv.pinMap.join()!=="6,5,7,8,4")
    throw new Error("« + U3B » pose la partie B : "+JSON.stringify(nv));
  if(brPartieLibre(A.el)!==null)throw new Error("plus de partie libre");
  const e=brControles();
  if(e.some(x=>/non posée/.test(x.texte)))throw new Error("les deux parties sont posées : "+JSON.stringify(e));
  /* deux fois la même partie */
  nv.part="A";
  if(!brControles().some(x=>/partie U3A posée deux fois/.test(x.texte)))throw new Error("partie en double");
}));
T("brochage : alimentation sur la masse signalée par le nom des broches",()=>{
  const el=C("opamp",10,10,{id:++_uid,ref:"U4",pkg:"SOT-23-5",pinMap:["4","3","1","5","2"]});
  const {ws}=brAop(10,10,{},["FB","VIN","VOUT","GND","3V3"]);
  sheet([el],ws);
  const c=brControles();
  if(!c.some(x=>/broche d'alimentation V\+ \(patte 5\) reliée à la masse GND/.test(x.texte)))
    throw new Error("V+ sur GND : "+JSON.stringify(c));
  if(!c.some(x=>/broche V- \(patte 2\) reliée au rail positif 3V3/.test(x.texte)))
    throw new Error("V− sur 3V3 : "+JSON.stringify(c));
});
T("brochage : normComp garde brochage, partie et table ; le boîtier long reste entier",()=>{
  const long="Trou metalise diam. trou 1.2mm - dim. plated 2.54mmx1.6mm";
  const n=normComp({id:5,type:"opamp",x:0,y:0,ref:"U3",value:"LM358",pkg:"SOIC-8",
    brochage:BR_LM358,part:"b",pinMap:["6","5","7","8","4"],pinMapMain:true},0);
  if(n.brochage!==BR_LM358||n.part!=="B"||n.pinMap.join()!=="6,5,7,8,4"||!n.pinMapMain)
    throw new Error("relu : "+JSON.stringify(n));
  const bad=normComp({id:6,type:"opamp",x:0,y:0,ref:"U1",pinMap:["<b>","1"],part:"<x>"},0);
  if(bad.part||bad.pinMap.join()!==",1")throw new Error("valeurs illisibles écartées : "+JSON.stringify(bad));
  const tp=normComp({id:7,type:"testpoint_pth",x:0,y:0,ref:"TP1",pkg:long},0);
  if(tp.pkg!==long||PKG_MAX<long.length)throw new Error("boîtier coupé : "+tp.pkg);
});
T("brochage : l'inspecteur propose les références du symbole et montre la table",()=>brAvecLib(()=>{
  const el=addComp("opamp",200,200);
  sheet([el],[]);
  clearSel();S.sel.add(el.id);refreshPanels();
  const box=document.getElementById("props");
  const html=String(box&&box.innerHTML||"");
  if(!/Référence à choisir \(3\)/.test(html))throw new Error("badge attendu dans l'inspecteur");
  if(!/IN-/.test(html)||!/V\+/.test(html))throw new Error("la table broche → patte s'affiche");
  if(!/5 broches sur un boîtier SOIC-8/.test(html))throw new Error("l'alerte s'affiche dans l'inspecteur");
  el.csvPartName="AOP_LM358";brDepuisLib(el,BR_LIB[1],true);refreshPanels();
  const h2=String(box.innerHTML||"");
  if(/Référence à choisir/.test(h2))throw new Error("plus de badge une fois la référence choisie");
  if(!/pBrPartie/.test(h2)||!/pBrAjout/.test(h2))throw new Error("choix de partie et « + U…B » attendus");
}));

T("brochage : une broche sur plusieurs pattes — languette OUT du régulateur SOT-223",()=>{
  const lu=brochageLire("GND=1,OUT=2 / 4,IN=3");
  if(lu.erreurs.length||brochagePartie(lu).broches.OUT!=="2/4")throw new Error("lecture : "+JSON.stringify(lu));
  if(brochagePattes(lu).join()!=="1,2,3,4")throw new Error("pattes : "+brochagePattes(lu));
  if(!brochageLire("OUT=2/x!").erreurs.length)throw new Error("une patte illisible dans la liste est refusée");
  if(!brochageLire("OUT=2/4,GND=4").erreurs.some(e=>/patte 4 donnée à OUT et à GND/.test(e)))
    throw new Error("une patte de la liste reprise par une autre broche est signalée");
  /* le régulateur câblé : IN à gauche, OUT à droite, GND en bas */
  const el=C("regulator",10,10,{id:++_uid,ref:"U1",value:"AMS1117",pkg:"SOT-223-4"});
  const ps=allPins(el);
  const ws=[{x1:ps[0].x,y1:ps[0].y,x2:ps[0].x-40,y2:ps[0].y,net:"5V"},
            {x1:ps[1].x,y1:ps[1].y,x2:ps[1].x+40,y2:ps[1].y,net:"3V3"},
            {x1:ps[2].x,y1:ps[2].y,x2:ps[2].x,y2:ps[2].y+40,net:"GND"}];
  sheet([el],ws);
  if(!brControles().some(x=>/3 broches sur un boîtier SOT-223-4 à 4 pattes/.test(x.texte)))
    throw new Error("sans table, la languette reste en l'air : alerte attendue");
  el.brochage="GND=1,OUT=2/4,IN=3";brAppliquer(el);
  if(el.pinMap.join()!=="3,2/4,1"||brPattes(el,1).join()!=="2,4"||brPatte(el,1)!==2)
    throw new Error("table : "+JSON.stringify(el.pinMap));
  const txt=netlistText("—");
  if(!/NET "3V3"\s*\n\s*U1\.2\s+OUT\s*\n\s*U1\.4\s+OUT/.test(txt))throw new Error("OUT sur les pattes 2 et 4 :\n"+txt);
  if(!/NET "5V"\s*\n\s*U1\.3\b/.test(txt)||!/NET "GND"\s*\n\s*U1\.1\b/.test(txt))throw new Error("IN et GND : "+txt);
  if(brControles().length)throw new Error("rien à redire : "+JSON.stringify(brControles()));
  /* saisie à la main, relecture */
  if(!brSaisirPatte(el,1," 2 / 4 ")||el.pinMap[1]!=="2/4")throw new Error("saisie « 2 / 4 » : "+el.pinMap[1]);
  if(brSaisirPatte(el,1,"2/<b>"))throw new Error("saisie illisible refusée");
  const n=normComp(JSON.parse(JSON.stringify(el)),0);
  if(n.pinMap[1]!=="2/4")throw new Error("normComp garde « 2/4 » : "+JSON.stringify(n.pinMap));
});
/* ---------- variantes de montage (BOM) ---------- */
function variantesEssai(){
  const mk=(ref,val)=>C("resistor",0,0,{ref:ref,value:val,pkg:"0603"});
  const r1=mk("R1","10k"),r2=mk("R2","10k"),r3=mk("R3","1k"),r4=mk("R4","0R");
  sheet([r1,r2,r3,r4],[]);
  S.variantes=varVide();
  const lite=varAjouter(S.variantes,"Lite",schVarComposants());
  const pro=varAjouter(S.variantes,"Version Pro",schVarComposants());
  varDefinirMonte(r2,lite,false);varDefinirMonte(r4,lite,false);
  varDefinirMonte(r3,pro,false);
  return {r1,r2,r3,r4,lite,pro};
}
function variantesFin(){S.variantes=varVide();}
T("variantes : la carte complète monte tout, chaque variante retire les siens",()=>{
  const v=variantesEssai();
  try{
    if(varReperesNonMontes(schVarComposants(),"").length)throw new Error("la carte complète ne retire rien");
    const a=varReperesNonMontes(schVarComposants(),v.lite).join(" ");
    if(a!=="R2 R4")throw new Error("Lite doit retirer R2 R4 : "+a);
    const b=varReperesNonMontes(schVarComposants(),v.pro).join(" ");
    if(b!=="R3")throw new Error("Pro doit retirer R3 : "+b);
  }finally{variantesFin();}
});
T("variantes : la nomenclature CSV suit la variante (DNP listés, récapitulatif sans eux)",()=>{
  const v=variantesEssai();
  try{
    const csv=bomCsvText(v.lite), l=csv.split("\r\n");
    if(l[0].slice(-8)!==";Montage")throw new Error("colonne Montage absente : "+l[0]);
    const r2=l.find(x=>x.indexOf("R2;")===0);
    if(!/Non monté \(DNP\)$/.test(r2))throw new Error("R2 doit être non monté : "+r2);
    // récapitulatif : les deux 10k ne font plus qu'un (R2 non monté), le 0R disparaît
    const recap=l.slice(l.findIndex(x=>x.indexOf("Qté;")===0)+1);
    if(!recap.some(x=>/^1;.*;R1$/.test(x)))throw new Error("10k : 1 pièce (R1) attendue :\n"+recap.join("\n"));
    if(recap.some(x=>/R4/.test(x)&&/^\d+;/.test(x)))throw new Error("R4 (non monté) ne doit pas être commandé");
    if(csv.indexOf("Non montés (DNP);2;R2 R4")<0)throw new Error("liste des DNP absente :\n"+csv);
    if(csv.indexOf("Variante;Lite")<0)throw new Error("nom de variante absent");
    // carte complète : tout est monté, les deux 10k regroupés
    const plein=bomCsvText("");
    if(plein.indexOf("Non monté (DNP)")>=0)throw new Error("la carte complète n'a pas de DNP");
    if(!/\r\n2;[^\r\n]*R1 R2/.test(plein))throw new Error("carte complète : 2 × 10k attendus");
    // sans argument : la variante active
    S.variantes.active=v.pro;
    if(bomRows().find(r=>r.ref==="R3").monte)throw new Error("la variante active doit s'appliquer par défaut");
  }finally{variantesFin();}
});
T("variantes : enregistrement, relecture et historique les gardent",()=>{
  const v=variantesEssai();
  try{
    S.variantes.active=v.lite;
    const js=serialize();
    const doc=JSON.parse(js);
    // une variante inconnue dans un fichier retouché est écartée
    doc.pages[0].comps.find(c=>c.ref==="R1").nonMonte=["fantome",v.pro];
    S.variantes=varVide();
    loadDoc(doc);
    if(S.variantes.liste.length!==2||S.variantes.active!==v.lite)throw new Error("modèle perdu : "+JSON.stringify(S.variantes));
    const tous=schVarComposants();
    const r1=tous.find(c=>c.ref==="R1"), r2=tous.find(c=>c.ref==="R2");
    if(JSON.stringify(r1.nonMonte)!==JSON.stringify([v.pro]))throw new Error("identifiant inconnu gardé : "+JSON.stringify(r1.nonMonte));
    if(varEstMonte(r2,v.lite))throw new Error("R2 doit rester non monté dans Lite après relecture");
    // annuler une modification de variante
    push();
    varDefinirMonte(r2,v.lite,true);
    undo();
    const r2b=schVarComposants().find(c=>c.ref==="R2");
    if(varEstMonte(r2b,v.lite))throw new Error("Ctrl+Z doit rendre R2 non monté");
    if(S.variantes.active!==v.lite)throw new Error("l'historique doit garder la variante active");
  }finally{variantesFin();}
});
T("variantes : copier, renommer, supprimer, noms de fichier",()=>{
  const v=variantesEssai();
  try{
    const copie=varAjouter(S.variantes,"Lite sans R1",schVarComposants(),v.lite);
    varDefinirMonte(v.r1,copie,false);
    if(varReperesNonMontes(schVarComposants(),copie).join(" ")!=="R1 R2 R4")throw new Error("la copie part des non-montés de Lite");
    if(varSlug(S.variantes,v.pro)!=="Version-Pro")throw new Error("slug : "+varSlug(S.variantes,v.pro));
    if(bomCsvNom(v.pro)!=="nomenclature-Version-Pro.csv")throw new Error("nom de fichier : "+bomCsvNom(v.pro));
    if(!varRenommer(S.variantes,v.pro,"Pro")||varNom(S.variantes,v.pro)!=="Pro")throw new Error("renommer");
    S.variantes.active=v.lite;
    varSupprimer(S.variantes,v.lite,schVarComposants());
    if(S.variantes.active!=="")throw new Error("supprimer la variante active revient à la carte complète");
    if(schVarComposants().some(c=>(c.nonMonte||[]).includes(v.lite)))throw new Error("trace de la variante supprimée");
  }finally{variantesFin();}
});
T("variantes : la feuille barre les non-montés, le panneau propose les cases",()=>{
  const v=variantesEssai();
  try{
    const traits=[];
    const ctx={save(){},restore(){},fillRect(){},beginPath(){},stroke(){},fillText(t){traits.push(t);},
      moveTo(){},lineTo(){},set fillStyle(_){},set strokeStyle(_){},set lineWidth(_){},set lineCap(_){},
      set font(_){},set textAlign(_){},set textBaseline(_){}};
    schVarDessiner(ctx);
    if(traits.length)throw new Error("carte complète : rien à barrer");
    S.variantes.active=v.lite;
    schVarDessiner(ctx);
    if(traits.length!==2)throw new Error("deux non-montés à barrer dans Lite, "+traits.length);
    const h=schVarPropsHtml(v.r2);
    if(h.indexOf('data-var="'+v.lite+'"')<0||h.indexOf('data-var="'+v.pro+'" checked')<0)
      throw new Error("cases du panneau : "+h);
    schVarOuvrir();schVarFermer();
  }finally{variantesFin();}
});

/* ==========================================================================
   Exporter vers le PCB (bouton « ⇉ PCB »)
   ========================================================================== */
/* ==========================================================================
   Classes de nets dans la liste des nets, sans serveur
   ========================================================================== */
T("classes de net : choisies dans la liste des nets, publiées au PCB même sans serveur",()=>{
  const r1=C("resistor",0,0,{ref:"R1"}), r2=C("resistor",6,0,{ref:"R2"}), r3=C("resistor",12,0,{ref:"R3"});
  const a=allPins(r1)[1], b=allPins(r2)[0], c=allPins(r2)[1], d=allPins(r3)[0];
  sheet([r1,r2,r3],[{x1:a.x,y1:a.y,x2:b.x,y2:b.y,net:"PIR_S"},{x1:c.x,y1:c.y,x2:d.x,y2:d.y,net:"3V3_A"}]);
  S.netClasses={};
  const P=SCHEMA_PATTERNS;
  if(P.classeAuto("3V3_A").classe!=="Alimentation")throw new Error("3V3_A : "+P.classeAuto("3V3_A").classe);
  if(P.classeAuto("GND").classe!=="Masse")throw new Error("GND non reconnu");
  if(P.classeAuto("10V").classe==="Masse")throw new Error("10V n'est pas une masse");
  if(P.classeAuto("PIR_S").classe!=="Lent")throw new Error("PIR_S : lent par défaut");
  // la liste des nets propose les huit classes, au net nommé seulement
  S.netAll=false;setListTab("nets");
  const box=document.getElementById("bom");
  const h=box.innerHTML;
  for(const k of NET_CLASSES)if(h.indexOf("<option>"+k+"</option>")<0)throw new Error("classe "+k+" absente");
  if(h.indexOf('data-netcls="PIR_S"')<0||h.indexOf("Auto · Alimentation")<0)
    throw new Error("menu de classe absent de la liste des nets");
  dom.session.clear();
  S.dirty=false;
  P.poserClasse("PIR_S","Analogique");
  if(S.netClasses.PIR_S!=="Analogique"||!S.dirty)throw new Error("correction non gardée");
  const pub=JSON.parse(sessionStorage.getItem("web_cao_netclasses")||"null");
  if(!pub||pub.PIR_S!=="Analogique"||pub["3V3_A"]!=="Alimentation")
    throw new Error("publication au PCB : "+JSON.stringify(pub));
  if(sessionStorage.getItem("web_cao_netclasses_partiel")!=="1")
    throw new Error("sans analyse, la publication est partielle");
  // gardée dans le document, rendue à l'auto par ""
  if(JSON.parse(serialize()).netClasses.PIR_S!=="Analogique")throw new Error("absente du document");
  if(netClassSelect("PIR_S").indexOf('class="netcls man"')<0)throw new Error("correction non signalée");
  P.poserClasse("PIR_S","");
  if(S.netClasses.PIR_S)throw new Error("« Auto » doit effacer la correction");
  // la copie par projet, pour un PCB ouvert dans un autre onglet
  projOuvrir("carte PIR");
  try{
    P.poserClasse("PIR_S","Horloge");
    const o=JSON.parse(localStorage.getItem("web_cao_netclasses."+projNom())||"null");
    if(!o||o.classes.PIR_S!=="Horloge"||o.partiel!==true)throw new Error("copie du projet : "+JSON.stringify(o));
  }finally{
    localStorage.removeItem("web_cao_netclasses."+projNom());
    projFermer();
    S.netClasses={};dom.session.clear();
  }
});
T("passifs : résistance, condensateur et bobine posés en 0402 par défaut",()=>{
  for(const t of ["resistor","capacitor","inductor"]){
    sheet([],[]);
    const el=addComp(t,100,100);
    if(el.pkg!=="0402")throw new Error(t+" : 0402 attendu, obtenu "+el.pkg);
    if(!pkgKnown(el.pkg))throw new Error(t+" : 0402 inconnu de PKG_BASES");
  }
});
TA("exporter vers le PCB : sans projet, la netlist suit l'onglet et la demande est déposée",async()=>{
  dom.session.clear();
  sheet([C("resistor",2,2,{ref:"R1",value:"10k",pkg:"0402"}),
         C("capacitor",6,2,{ref:"C1",value:"100n",pkg:"0402"})],[]);
  sessBrancher("schema",()=>({doc:JSON.parse(serialize()),
    netlist:netlistText(),sale:S.dirty,projet:""}),schSonde);
  clearSel();
  const ok=await exporterVersPcb();
  if(!ok)throw new Error("l'export devait partir vers le PCB");
  const dem=JSON.parse(sessionStorage.getItem(SCH_EXPORT_PCB)||"null");
  if(!dem||!(dem.t>0)||dem.ecrire!==false)
    throw new Error("demande d'export attendue, sans écriture (aucun projet) : "+JSON.stringify(dem));
  const sch=sessLire("schema");
  const nl=sch&&sch.etat&&sch.etat.netlist||"";
  if(!/R1\s+10k\s+0402/.test(nl)||!/C1\s+100n\s+0402/.test(nl))
    throw new Error("la netlist mise de côté doit porter les boîtiers : "+nl);
  if(!/editeur-pcb\.html$/.test(String(location.href)))
    throw new Error("l'éditeur PCB devait s'ouvrir : "+location.href);
});

(async()=>{
  for(const [name,fn] of T_ASYNC){
    try{await fn();console.log("  ok  "+name);ok++;}
    catch(e){console.log("  KO  "+name+" → "+e.message+"\n"+(e.stack||"").split("\n")[1]);ko++;}
  }
  console.log("\n"+ok+" essais réussis, "+ko+" en échec.");
  process.exit(ko?1:0);
})();


