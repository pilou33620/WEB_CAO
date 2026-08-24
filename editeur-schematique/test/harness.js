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

const code=fs.readFileSync(path.join(__dirname,"..","dist","schema.js"),"utf8");
const EXPOSE=[
  /* état et feuilles */
  "S","G","newPage","loadPage","storeCurrent","gotoPage","addPage","clearSel",
  "push","undo","redo","touchWires","buildTabs","draw","fit","resize",
  /* bibliothèque et géométrie */
  "defOf","allPins","pinCount","icGeom","key","LIB","pinsOf",
  /* brochage (04 + 19) */
  "icPins","icBodyOf","icSideOf","icPinLabel","icFree","icShapeOf","icStep","IC_STEP",
  "icSetCount","icSetShape","icSetBody","icFitNames","icMovePin","reshapeComp",
  /* libellés déplaçables et étiquettes de net (08 + 09) */
  "compTexts","textBox","textOff","setTextOff","netLabelAt","netLabelBoxes",
  "pinContacts","reconnectContacts","resetTexts","pinContactPoints","moveSelBy",
  "rotateSel","mirrorSel",
  "splitWireArray","textW",
  /* presse-papier et grille (10) */
  "copySel","cutSel","pasteClip","clipContent","setClip","getClip","setGridStep","snap","delSel",
  "delWiresSel",
  "gridLabel","gridShownStep","normComp","normWire",
  /* connectivité (07) */
  "computeNets","nets","docNets","splitWireArray","resolveSplits","endpointList",
  "insideSeg","netAt","netAtLive","isRealNet","setNetName","selectNet","netColor",
  "docGroupOf","sheetList","NAME_SRC",
  /* panneaux (12) */
  "refreshPanels","buildList","buildNets","buildBom","setListTab","connList",
  "netBlock","pkgField","esc",
  /* fichiers (13) */
  "netlistText","bomRows","bomCsvText","csvCell","serialize","loadJsonText",
  /* CSV de bibliothèque (18) */
  "parseCSVLine","loadCSVFromString","loadCSVLib",
  /* session d'onglet commune (commun/session.js) */
  "sessBrancher","sessEnregistrer","sessLire","sessEcrire","sessEffacer",
  "sessTient","sessUrl","sessQuitte","sessionSchema","restoreBackup","clearBackup",
  /* espace de travail commun */
  "wsDefault","wsApply","wsMove","wsPlaceOf","wsLabel","wsToggleFloat",
  "wsToggleCollapse","wsClose","wsShow","wsMenuBuild","wsLoad","wsSave","wsEl","WS_KEY",
  "WS_SECTION",
  /* profils utilisateur communs (commun/profils.js) */
  "profNom","profListe","profChoisir","profCreer","profSupprimer","profLire",
  "profEcrire","profOublier","profRecents","profNoterDocument","profNomValide",
  /* réglages d'affichage propres à l'utilisateur (20-profil.js) */
  "profilEtat","profilNoter","profilAppliquer",
  "setGrid","setGridStep","setNetLabels","setListTab"
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

console.log("\n"+ok+" essais réussis, "+ko+" en échec.");
process.exit(ko?1:0);
