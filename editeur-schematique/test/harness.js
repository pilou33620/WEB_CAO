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
  "S","G","newPage","refStartPage","refStartDe","usedRefs","schCartoucheBasculer","schCartouche","schPage","schContenu","CARTOUCHE_FORMATS","cartoucheSuivant","loadPage","storeCurrent","gotoPage","addPage","removePage","clearSel",
  "SCHEMA_PATTERNS","NET_CLASSES","netClassSelect",
  "addComp","schComposantsDansZone","schToutesLesZones",
  "push","undo","redo","histBorner","HIST_MAX","touchWires","buildTabs","draw","fit","resize",
  /* canal de pilotage du MCP de web_suite (commun/pilote-cao.js) */
  "piloteCao",
  /* bus et hiérarchie */
  "C_BUS","BUS_WIDTH","sheetBlocks","hitSheetBlock","hitSheetPin","sheetInterconnections","newHierPage",
  "schDevelopperSignauxBus","schBusDuPoint","schPiquageSurFil","schTousLesPiquages",
  "schSignauxOccupesSurBus","schSuggererProchainSignal","schPiquerSignal","schOuvrirPiquageModal","schFermerPiquageModal",
  "SCH_PIQUAGE_MEMOIRE",
  /* bibliothèque et géométrie */
  "bbox","hitBox","schPoserDepuisCatalogue","schTypeDuCatalogue",
  "defOf","allPins","pinCount","icGeom","key","LIB","pinsOf","LECTURE_CAO","ECRITURE_CAO",
  "pkgBaseOf","pkgKnown","pkgBaseList","PKG_BASES",
  /* brochage (04 + 19) */
  "icPins","icBodyOf","icSideOf","icPinLabel","icFree","icShapeOf","icStep","IC_STEP",
  "icSetCount","icSetShape","icSetBody","icFitNames","icMovePin","reshapeComp",
  "ceOpen","ceClose",
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
  "bomXlsxFichiers","bomXlsxNom",
  /* nom de projet commun (commun/projet.js) */
  "projNom","projOuvrir","projFermer","projDoc","projPeindre",
  /* dossier de projet et brouillon (commun/projet-disque.js) */
  "projdAdopter","projdNeuf","projdDetacher","projdNomBrouillon","projdBrouillonTic",
  "saveJsonProjet","schChargerProjet","SCH_REPRISE",
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
  "schMontrerAilleurs","schPoserLcsc","schCibleTrouver","schCibleAller","sessCibleAuChargement",
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
  "CR_ETAT","crBuildModal","crRechercherDistributeurs","crSelectionnerCandidat","crTrierEtAfficherCandidats","crAppliquerAuComposant",
  /* synchronisation et alertes Gestion LIB */
  "SCH_LIB_ALERTE","schTrouverComposantsAmettreAJour","schComposantAlerteLib","schCleLib",
  "schAppliquerMajLibComposant","schAppliquerMajLibTous","sessDiffuserLibModif","sessEcouterLibModif",
  /* explorateur visuel de bibliothèque */
  "ELIB","explorateurLibOuvrir","explorateurLibFermer","elibClassifierItem","elibIsSmd","elibIsTht","elibHasSpice","elibFiltrerEtAfficher","schOuvrirExplorateurLib",
  /* schémas d'exemples */
  "schPdfDoc","demo","demo2","demo12v","demo12v_p2","SCH_EXEMPLES","schChargerExemple","schExOuvrir",
  /* brochage par référence (commun/brochage.js + 25-brochage.js) */
  "brochageLire","brochagePartie","brochageParties","brochagePattes","brochageNom",
  "brNomBroche","brPatte","brPattes","brochageListe","BROCHAGE_PATTES","brDepuisLib","brAppliquer","brChoisirPartie","brSaisirPatte",
  "brCandidats","brReferenceAChoisir","brPattesBoitier","brControles","brControlesDe",
  "brAjouterPartie","brPartieLibre","brRepere","brPanneauHtml","PKG_MAX","buildProps",
  /* contraintes de nets pour le PCB (commun/contraintes.js, 27-contraintes.js) */
  "schCmModele","schCmPoser","schCmGroupeCreer","schCmGroupeModifier","schCmGroupeSupprimer",
  "schCmNetsNommes","schCmOrphelins","schCmResumeNet","schCmOuvrir","schCmFermer","SCM",
  "cmNormNets","cmNormGroupes","cmLireChamp","schDocCourant","restore",
  /* classes d'interface (commun/classes-interface.js) */
  "CLASSES_INTERFACE","familleClasse","titreClasse","loadDoc",
  /* symboles de la LIB (29-symboles-lib.js) */
  "schSymboleLire","schSymboleDefinir","schSymbolesDuDocument","SYM_LIB_LUS","schTypeDuCatalogue","LIB"
];
/* les noms absents du bundle sont ignorés : le banc d'essai reste utilisable
   même si un module est renommé, les essais concernés échoueront tout seuls */
eval(code.replace(/^"use strict";/,"")+"\n"
     +EXPOSE.map(n=>'try{globalThis.'+n+'='+n+';}catch(e){}').join("\n")+"\n"
     +'Object.defineProperty(globalThis,"WS",'
     +'{get:()=>WS,set:v=>{WS=v;},configurable:true});'
     +'Object.defineProperty(globalThis,"SCH_PROJET_LU",'
     +'{get:()=>SCH_PROJET_LU,set:v=>{SCH_PROJET_LU=v;},configurable:true});');

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
/* ==========================================================================
   Lectures du schéma (commun/lecture-cao.js, LECTURE_CAO.schema) : ce que
   Claude lit par le canal de pilotage (web_suite, registre-cao)
   ========================================================================== */
/* deux feuilles : BUS est global (les deux), LOCAL est local à chaque feuille, R3 est en l'air */
function docLecture(){
  const mk=(nom,ref,x,extra)=>{
    const r=C("resistor",x,0,Object.assign({ref:ref,value:"10k",pkg:"0603"},extra||{}));
    const g=C("gport",x,4,{value:"BUS"}), q=C("port",x,-4,{value:"LOCAL"});
    const p=allPins(r), pg=allPins(g), pq=allPins(q);
    const pg1=newPage(nom);
    pg1.comps=[r,g,q];
    pg1.wires=[{x1:p[1].x,y1:p[1].y,x2:pg[0].x,y2:pg[0].y},{x1:p[0].x,y1:p[0].y,x2:pq[0].x,y2:pq[0].y}];
    return pg1;
  };
  const f2=mk("Logique","R2",5);
  f2.comps.push(C("resistor",10,0,{ref:"R3",value:"1k"}));
  S.pages=[mk("Alim","R1",0,{mpn:"RC0603FR-0710KL"}),f2];
  loadPage(0);touchWires();
}
const lireSch=(quoi,a)=>[].concat(LECTURE_CAO.schema[quoi].fn(a||{})).join("\n");
T("Vérif BOM du PCB : les codes LCSC reçus se posent en une étape d'historique",()=>{
  const avant=serialize();
  try{
    docLecture();
    const n=S.hist.length;
    // R2 est sur la feuille 2, la 1 est affichée
    if(!schPoserLcsc(JSON.stringify({R1:"C8",R2:"C9"}))||S.hist.length!==n+1)throw new Error("code non posé");
    const tous=S.pages.flatMap((p,i)=>i===S.page?S.comps:p.comps);
    if(tous.find(c=>c.ref==="R1").lcsc!=="C8"||tous.find(c=>c.ref==="R2").lcsc!=="C9")throw new Error("feuilles");
    if(schPoserLcsc(JSON.stringify({ZZ999:"C1"}))||schPoserLcsc("pas du json"))throw new Error("faux succès");
  }finally{restore(avant);}
});
T("lectures du schéma : feuilles, composants, composant, nets, net",()=>{
  try{lecturesSchema();}finally{sheet([],[]);}
});
function lecturesSchema(){
  docLecture();
  const hist=S.hist.length, dirty=S.dirty, page=S.page, ver=S.wireVer;
  const f=lireSch("feuilles");
  if(!/2 feuille\(s\), 3 composant\(s\)/.test(f)||!/f1 « Alim » : 1 composant\(s\)/.test(f)||!/f2 « Logique » : 2 composant\(s\)/.test(f))throw new Error(f);
  const cs=lireSch("composants");
  if(!/^- R1 = 10k \(0603\), RC0603FR-0710KL, f1, x 0 y 0 mm, rotation 0°$/m.test(cs))throw new Error(cs);
  if(!/^- R2 = 10k \(0603\), f2, x 5 y 0 mm/m.test(cs)||/LOCAL|BUS/.test(cs))throw new Error(cs);
  if(lireSch("composants",{filtre:"r2"}).split("\n").length!==1)throw new Error(lireSch("composants",{filtre:"r2"}));
  const c2=lireSch("composant",{ref:"r2"});           // sur la feuille 2, la 1 est affichée
  if(!/^R2 = 10k \(0603\), f2/.test(c2)||!/^- 1 → LOCAL$/m.test(c2)||!/^- 2 → BUS$/m.test(c2))throw new Error(c2);
  if(!/^- 1 → non connectée$/m.test(lireSch("composant",{ref:"R3"})))throw new Error(lireSch("composant",{ref:"R3"}));
  if(!/introuvable : demande la liste avec l'outil « composants »/.test(lireSch("composant",{ref:"R9"})))throw new Error("R9");
  const ns=lireSch("nets");
  if(!/^- BUS \[global\] : 2 broches, f1, f2$/m.test(ns)||(ns.match(/^- LOCAL : 1 broches?, f[12]$/mg)||[]).length!==2)throw new Error(ns);
  const b=lireSch("net",{nom:"bus"});
  if(!/^Net BUS, global, sur f1, f2\.$/m.test(b)||!/Broches \(2\) : R1\.2, R2\.2/.test(b))throw new Error(b);
  if(!/plusieurs feuilles.*f1, f2.*feuille/.test(lireSch("net",{nom:"LOCAL"})))throw new Error(lireSch("net",{nom:"LOCAL"}));
  if(!/Broches \(1\) : R2\.1$/m.test(lireSch("net",{nom:"LOCAL",feuille:2})))throw new Error(lireSch("net",{nom:"LOCAL",feuille:2}));
  if(!/introuvable : demande la liste avec l'outil « nets »/.test(lireSch("net",{nom:"XYZ"})))throw new Error("XYZ");
  if(S.hist.length!==hist||S.dirty!==dirty||S.page!==page||S.wireVer!==ver)throw new Error("une lecture a modifié le document");
}
T("lectures du schéma : bornes reprises (150 composants)",()=>{
  const comps=[];
  for(let i=0;i<160;i++)comps.push(C("resistor",i*3,0,{ref:"R"+(i+1)}));
  sheet(comps,[]);
  const L=lireSch("composants").split("\n");
  sheet([],[]);   // feuille vide pour les essais suivants (ils posent leur propre R7)
  if(L.length!==151||!/^\.\.\. \(10 composants de plus : précise le filtre\)$/.test(L[150]))throw new Error(L.slice(-2).join(" | "));
});

TA("canal de pilotage : cao_vue change de feuille et cadre sans écrire",async()=>{
  const cmds={}, ancien=global.Pilote;
  global.Pilote={declarer(){return this;},capture(){return this;},commande(n,d){cmds[n]=d;return this;}};
  const refus=async a=>{try{await cmds.cao_vue.executer(a);}catch(e){return e.message;}return "";};
  try{
    piloteCao("schema");
    docLecture();
    const hist=S.hist.length, dirty=S.dirty;
    S.scale=1;S.ox=0;S.oy=0;
    if(!/ni repère ni net/.test(await refus({cadrer:"ZZ9"}))||S.ox!==0||S.page!==0)throw new Error("repère inconnu : la vue a bougé");
    if(!/Feuille 9 inconnue : 1 à 2/.test(await refus({feuille:9,cadrer:"R2"}))||S.page!==0)throw new Error("feuille inconnue");
    if(!/couches.*PCB/.test(await refus({couches:["Top"]})))throw new Error("couches au schéma");
    if(cmds.cao_drc)throw new Error("pas de DRC au schéma");
    await cmds.cao_vue.executer({cadrer:"r2"});
    const r2=S.comps.find(c=>c.ref==="R2");
    if(S.page!==1||!r2||!S.sel.has(r2.id))throw new Error("R2 non atteint : feuille "+S.page);
    await cmds.cao_vue.executer({feuille:1,ajuster:true});
    if(S.page!==0)throw new Error("feuille 1 attendue");
    /* surligner garde la vue : une cible d'une autre feuille est refusée ; « feuille » contredite aussi */
    const vue=[S.scale,S.ox,S.oy];
    if(!/R2 » est sur f2, pas sur f1 : donne « feuille »/.test(await refus({surligner:"R2"}))||S.page!==0)throw new Error("surligner R2 depuis f1");
    if(!/R2 » est sur f2, pas sur f1 : change « feuille »/.test(await refus({feuille:1,cadrer:"R2"}))||S.page!==0)throw new Error("feuille contredite");
    await cmds.cao_vue.executer({surligner:"bus"});
    if(!S.hoverNet||S.hoverNet.name!=="BUS"||S.selW.size||S.sel.size||String([S.scale,S.ox,S.oy])!==String(vue))
      throw new Error("surligner BUS : halo, sans sélection ni vue changée");
    const t=await cmds.cao_vue.executer({feuille:2,cadrer:"BUS"});
    if(S.page!==1||!S.selW.size||!/cadré sur BUS \(f2\)/.test(t))throw new Error("BUS cadré sur f2 attendu : feuille "+S.page+", "+t);
    if(S.hist.length!==hist||S.dirty!==dirty)throw new Error("la vue a écrit");
  }finally{global.Pilote=ancien;sheet([],[]);}
});
TA("canal de pilotage : cao_schema_lire lit sans rien écrire",async()=>{
  const cmds={}, ancien=global.Pilote;
  global.Pilote={declarer(){return this;},capture(){return this;},commande(n,d){cmds[n]=d;return this;}};
  try{
    piloteCao("schema");
    docLecture();
    const hist=S.hist.length, dirty=S.dirty, page=S.page, lus={};
    for(const quoi of ["feuilles","composants","composant","nets","net"])
      lus[quoi]=await cmds.cao_schema_lire.executer({quoi,ref:"R2",nom:"BUS"});
    if(!/R2\.2/.test(lus.net)||!/f2 « Logique »/.test(lus.feuilles)||!/^- 2 → BUS$/m.test(lus.composant))throw new Error(JSON.stringify(lus));
    if(S.hist.length!==hist||S.dirty!==dirty||S.page!==page)throw new Error("une lecture a écrit");
  }finally{global.Pilote=ancien;sheet([],[]);}
});
T("canal de pilotage : cao_valeur_composant propose, applique en une étape, Ctrl+Z la défait",()=>{
  const cmds={}, ancien=global.Pilote;
  global.Pilote={declarer(){return this;},capture(){return this;},commande(n,d){cmds[n]=d;return this;}};
  try{
    piloteCao("schema");
    const d=cmds.cao_valeur_composant;
    if(!(d&&d.ecriture&&d.historique))throw new Error("écriture par l'historique de l'éditeur attendue");
    const c=addComp("resistor",100,100); c.ref="R7"; c.value="1k";
    const prop=d.proposer({ref:"r7",valeur:"4k7"});      // repère sans tenir compte de la casse
    if(prop.avant!=="1k"||prop.apres!=="4k7"||!/R7/.test(prop.titre))throw new Error("carte : "+JSON.stringify(prop));
    if(c.value!=="1k")throw new Error("proposer ne doit rien écrire");
    const n=S.hist.length;
    d.appliquer({ref:"R7",valeur:"4k7"});
    const apres=S.comps.find(x=>x.ref==="R7");
    if(apres.value!=="4k7")throw new Error("valeur non appliquée : "+apres.value);
    if(S.hist.length!==n+1)throw new Error("une seule étape d'undo attendue, "+(S.hist.length-n)+" poussée(s)");
    undo();
    if(S.comps.find(x=>x.ref==="R7").value!=="1k")throw new Error("Ctrl+Z ne défait pas la valeur");
    for(const f of [()=>d.proposer({ref:"R99",valeur:"1k"}),()=>d.appliquer({ref:"R99",valeur:"1k"})]){
      const avant=S.hist.length;
      let msg="";
      try{f();}catch(e){msg=e.message;}
      if(!/R99/.test(msg))throw new Error("repère inconnu : message attendu, lu « "+msg+" »");
      if(S.hist.length!==avant)throw new Error("repère inconnu : rien ne doit être poussé");
    }
  }finally{global.Pilote=ancien;}
});

T("export PDF : une page par feuille, xref juste, textes cherchables, feuille d'origine remise",()=>{
  const avant=serialize(), Bl=global.Blob;
  try{
    demo2();schCartoucheBasculer();
    let oct=null;global.Blob=function(parts){oct=Buffer.concat(parts.map(x=>Buffer.from(x)));};
    const o={feuilles:"toutes",papier:"auto",l:297,h:210,orient:"auto",echelle:"fit",pct:100,fond:"blanc"};
    const page=S.page;
    if(!schPdfDoc(o)||!oct)throw new Error("pas de PDF");
    if(process.env.PDF_SORTIE)fs.writeFileSync(process.env.PDF_SORTIE,oct);   // pour l'ouvrir à la main
    const t=oct.toString("latin1");
    if(!t.startsWith("%PDF-1.4"))throw new Error("en-tête");
    loadPage(page);
    const xr=+/startxref\n(\d+)/.exec(t)[1];
    const n=+/xref\n0 (\d+)/.exec(t.slice(xr))[1];
    const ent=t.slice(xr).split("\n").slice(2,2+n);
    ent.slice(1).forEach((l,i)=>{if(t.substr(+l.slice(0,10),(i+1+" 0 obj").length)!==(i+1)+" 0 obj")throw new Error("xref objet "+(i+1));});
    const refs=S.comps.map(c=>c.ref).filter(Boolean);
    if(!refs.length||!refs.some(r=>t.includes("("+r+")")))throw new Error("références absentes du texte du PDF");
    if(S.page!==page)throw new Error("feuille d'origine non remise");
  }finally{global.Blob=Bl;loadDoc(JSON.parse(avant),true);}
});
T("cartouche : aucun → A4 → A3 → aucun, par feuille, gardé à l'enregistrement",()=>{
  const avant=serialize();
  try{
    addPage(false); const i=S.page;
    const r=addComp("resistor",3000,4000);
    schCartoucheBasculer();
    if(S.pages[i].format!=="A4")throw new Error("A4 attendu : "+S.pages[i].format);
    const P=schPage();
    if(!(P.x1<r.x&&r.x<P.x2&&P.y1<r.y&&r.y<P.y2))throw new Error("la page doit entourer le dessin : "+JSON.stringify(P));
    schCartoucheBasculer();
    if(S.pages[i].format!=="A3")throw new Error("A3 attendu : "+S.pages[i].format);
    if(!/A3/.test(document.getElementById("bCartouche").textContent))throw new Error("bouton pas à jour");
    S.cartoucheInfo={titre:"Carte essai",dessine:"AB",dateDessin:"01/02/2026",schNo:"X1SCH-A",bidon:"<b>"};
    draw();                                   // le cadre se dessine sans erreur
    const nom=S.pages[i].name;
    loadDoc(JSON.parse(serialize()),true);
    if(!S.pages.some(p=>p.name===nom&&p.format==="A3"))throw new Error("format perdu au rechargement");
    if(S.cartoucheInfo.titre!=="Carte essai"||S.cartoucheInfo.schNo!=="X1SCH-A"||"bidon" in S.cartoucheInfo)
      throw new Error("champs du cartouche : "+JSON.stringify(S.cartoucheInfo));
    S.page=S.pages.findIndex(p=>p.name===nom&&p.format==="A3");loadPage(S.page);
    schCartoucheBasculer();
    if("format" in S.pages[S.page])throw new Error("retour à « aucun » attendu");
  }finally{loadDoc(JSON.parse(avant),true);}
});
T("feuille : premier numéro des repères, renumérotation sur demande, gardé à l'enregistrement",()=>{
  const avant=serialize(), pr=global.prompt, conf=global.confirm;
  try{
    addPage(false); const i=S.page;
    const libre=!usedRefs().has("C"+i*100), d=addComp("capacitor",-40,0);
    if(libre&&d.ref!=="C"+i*100)throw new Error("feuille "+i+" : "+d.ref+", C"+i*100+" attendu par défaut");
    global.prompt=()=>"9100"; global.confirm=()=>false;
    refStartPage(i);
    const a=addComp("resistor",0,0), b=addComp("resistor",40,0), j=addComp("header",80,0);
    if(a.ref!=="R9100"||b.ref!=="R9101"||j.ref!=="J9100")throw new Error("repères : "+[a.ref,b.ref,j.ref]);
    a.ref="R5"; b.ref="R3";
    global.prompt=()=>"9200"; global.confirm=()=>true;
    refStartPage(i);
    if(b.ref!=="R9200"||a.ref!=="R9201"||j.ref!=="J9200")throw new Error("renumérotation : "+[a.ref,b.ref,j.ref]);
    loadDoc(JSON.parse(serialize()),true);     // peut ajouter la feuille Hiérarchie en tête : on cherche la feuille
    if(!S.pages.some(p=>p.refStart===9200))throw new Error("refStart perdu au rechargement");
    global.prompt=()=>"1"; global.confirm=()=>false;
    const k=S.pages.findIndex(p=>p.refStart===9200);
    refStartPage(k);
    if(refStartDe(k)!==1)throw new Error("le départ 1 doit pouvoir se choisir : "+refStartDe(k));
  }finally{global.prompt=pr;global.confirm=conf;loadDoc(JSON.parse(avant),true);}
});
T("Propriétés : repère, valeur et boîtier font une étape, que Ctrl+Z défait",()=>{
  const el=addComp("resistor",300,300); el.ref="R41"; el.value="1k";
  clearSel();S.sel.add(el.id);refreshPanels();
  const n=S.hist.length, avant=serialize();
  for(const [id,txt] of [["pVal","4"],["pVal","4k"],["pVal","4k7"],["pRef","R4"],["pRef","R42"]]){
    const i=document.getElementById(id); i.value=txt; i.oninput();
  }
  if(el.value!=="4k7"||el.ref!=="R42")throw new Error("saisie non appliquée : "+el.ref+" "+el.value);
  if(S.hist.length!==n+1)throw new Error("une étape attendue, "+(S.hist.length-n)+" poussée(s)");
  undo();
  if(serialize()!==avant)throw new Error("Ctrl+Z ne défait pas la saisie");
  clearSel();S.sel.add(S.comps.find(c=>c.ref==="R41").id);refreshPanels();
  const v=document.getElementById("pVal"); v.value="10k"; v.oninput();
  if(S.hist.length!==n+1)throw new Error("après Ctrl+Z, une nouvelle saisie refait une étape");
  /* le boîtier choisi dans la liste : une étape aussi */
  undo();
  const R=S.comps.find(c=>c.ref==="R41"); clearSel();S.sel.add(R.id);refreshPanels();
  const bs=document.getElementById("pPkgB"), choix=bs&&(PKG_BASES.find(b=>b.b!==bs.value&&!(R.pkg||"").startsWith(b.b))||{}).b;
  if(!choix)throw new Error("liste des boîtiers vide");
  const doc=serialize(), m=S.hist.length;
  bs.value=choix; bs.onchange();
  if(S.hist.length!==m+1||serialize()===doc)throw new Error("boîtier : une étape attendue, "+(S.hist.length-m));
  undo();
  if(serialize()!==doc)throw new Error("Ctrl+Z ne défait pas le boîtier");
});

T("historique : un flot de lots de Claude se fond, les étapes de l'utilisateur restent",()=>{
  const pile=[];
  for(let i=0;i<20;i++){pile.push('{"u":'+i+'}');histBorner(pile);}
  for(let i=0;i<150;i++){pile.push('{"c":'+i+'} ');histBorner(pile);}
  if(pile.length!==HIST_MAX)throw new Error("plafond : "+pile.length);
  if(pile.slice(0,20).some((t,i)=>t!=='{"u":'+i+'}'))throw new Error("une étape de l'utilisateur est partie");
  if(pile[HIST_MAX-1]!=='{"c":149} ')throw new Error("le dernier lot de Claude doit rester à part");
  const n=S.hist.length, doc=serialize();
  ECRITURE_CAO.pousser();
  if(S.hist.length!==n+1||S.hist[n]!==doc+" ")throw new Error("instantané de Claude non marqué");
  undo();
  if(serialize()!==doc)throw new Error("Ctrl+Z ne relit pas l'instantané marqué");
});

T("canal de pilotage : cao_composants_ecrire, un lot en une étape, refus sans rien toucher",()=>{
  const cmds={}, ancien=global.Pilote;
  global.Pilote={declarer(){return this;},capture(){return this;},commande(n,d){cmds[n]=d;return this;}};
  const refus=(a,motif)=>{
    const n=S.hist.length, avant=serialize();
    let m="";try{cmds.cao_composants_ecrire.proposer(a);}catch(e){m=e.message;}
    if(!motif.test(m))throw new Error("refus attendu "+motif+", lu « "+m+" »");
    if(S.hist.length!==n||serialize()!==avant)throw new Error("un refus a écrit : "+motif);
  };
  try{
    piloteCao("schema");
    const d=cmds.cao_composants_ecrire;
    if(!(d&&d.ecriture&&d.historique))throw new Error("écriture par l'historique attendue");
    docLecture();
    const lot=[{ref:"r1",champs:{valeur:"4k7",mpn:"ERJ-3EKF4701V",fabricant:"Panasonic"}},
               {ref:"R2",champs:{ref:"R20",non_monte:true}},                 // sur la feuille 2, la 1 est affichée
               {ref:"R3",champs:{specs:{tolerance:"1%"},boitier:"0402"}}];
    const avant=serialize(), n=S.hist.length;
    const prop=d.proposer({lot});
    if(serialize()!==avant)throw new Error("proposer a écrit");
    if(!/Composants du schéma \(7 changements\)/.test(prop.titre)||!/^R1\.valeur : 10k$/m.test(prop.avant)||
       !/^R1\.valeur : 4k7$/m.test(prop.apres)||!/^R2\.ref : R20$/m.test(prop.apres)||!/^R3\.specs\.tolerance : —$/m.test(prop.avant))
      throw new Error("carte : "+JSON.stringify(prop));
    d.appliquer({lot},prop);
    const c=r=>[...S.comps,...S.pages.flatMap((p,i)=>i===S.page?[]:p.comps)].find(x=>x.ref===r);
    if(S.hist.length!==n+1)throw new Error("une seule étape attendue, "+(S.hist.length-n));
    if(c("R1").value!=="4k7"||c("R1").manufacturer!=="Panasonic"||!c("R20")||!c("R20").nonMonte||c("R3").pkg!=="0402"||c("R3").specs.tolerance!=="1%")
      throw new Error("lot mal appliqué");
    undo();
    if(serialize()!==avant)throw new Error("Ctrl+Z ne remet pas tout");
    /* refus : tout le lot, rien d'écrit */
    refus({lot:[{ref:"R1",champs:{valeur:"1k"}},{ref:"R9",champs:{valeur:"1k"}}]},/R9.*introuvable/);
    refus({lot:[{ref:"R1",champs:{ref:"r3"}}]},/« r3 » est déjà pris/);
    refus({lot:[{ref:"R1",champs:{couleur:"bleu"}}]},/champ « couleur » inconnu/);
    refus({lot:[{ref:"R1",champs:{valeur:"x".repeat(201)}}]},/200 caractères/);
    refus({lot:[{ref:"R1",champs:{valeur:"a\nb"}}]},/une ligne/);
    refus({lot:[{ref:"R1",champs:{specs:Object.fromEntries(Array.from({length:31},(_,i)=>["k"+i,"v"]))}}]},/30 clés/);
    refus({lot:Array.from({length:51},()=>({ref:"R1",champs:{valeur:"1k"}}))},/51 éléments, 50 au plus/);
    refus({lot:[{ref:"R1",champs:{valeur:"10k"}}]},/Rien à changer/);
    refus({lot:[]},/au moins un élément/);
    refus({lot:[{ref:"",champs:{valeur:"x"}}]},/introuvable/);                 // un port n'a pas de repère : jamais visé
    refus({lot:[{ref:"R1",champs:{specs:JSON.parse('{"__proto__":"x"}')}}]},/clé « __proto__ » invalide/);   // tel que le JSON du MCP l'apporte
    /* le document bouge sous la carte : refus au clic */
    const p2=d.proposer({lot:[{ref:"R1",champs:{valeur:"22k"}}]});
    c("R1").value="33k";
    let m="";try{d.appliquer({lot:[{ref:"R1",champs:{valeur:"22k"}}]},p2);}catch(e){m=e.message;}
    if(!/a changé depuis la carte/.test(m)||c("R1").value!=="33k"||S.hist.length!==n)throw new Error("carte périmée : « "+m+" »");
    /* un CI sur la feuille 2 : les fils de la feuille affichée ne bougent pas, même posés sur ses
       anciennes coordonnées de broche (reshapeComp ne fait suivre que S.wires) */
    docLecture();
    const ci=addComp("ic",600,200); ci.ref="U9";
    S.comps.splice(S.comps.indexOf(ci),1); S.pages[1].comps.push(ci);
    const pins=allPins(ci), bout=pins[pins.length-1];
    const leurre={x1:bout.x,y1:bout.y,x2:bout.x+40,y2:bout.y};                 // feuille 1, sur une broche du CI
    const sien={x1:bout.x,y1:bout.y,x2:bout.x+40,y2:bout.y}; S.pages[1].wires.push(sien);   // feuille 2, son fil
    S.wires.push(leurre); const copie=JSON.stringify(leurre);
    d.appliquer({lot:[{ref:"U9",champs:{valeur:"CIRCUIT-INTEGRE-AU-NOM-TRES-LONG-1234"}}]});   // un texte long élargit le corps
    const apres=allPins(ci);
    if(JSON.stringify(apres[apres.length-1])===JSON.stringify(bout))throw new Error("valeur longue : les broches devaient bouger");
    if(JSON.stringify(leurre)!==copie)throw new Error("un fil de la feuille affichée a suivi le CI de la feuille 2");
    if(!apres.some(p=>p.x===sien.x1&&p.y===sien.y1))throw new Error("le fil du CI, sur sa feuille, n'a pas suivi sa broche");
    /* un CI : la valeur passe par reshapeComp, sans erreur */
    const u=addComp("ic",200,200); u.ref="U1";
    d.appliquer({lot:[{ref:"U1",champs:{valeur:"LM358"}}]});
    if(S.comps.find(x=>x.ref==="U1").value!=="LM358")throw new Error("valeur du CI");
  }finally{global.Pilote=ancien;sheet([],[]);}
});

T("canal de pilotage : cao_schema_dessiner, texte libre (annot_text) et cadre, note ou zone",()=>{
  const cmds={}, ancien=global.Pilote;
  global.Pilote={declarer(){return this;},capture(){return this;},commande(n,d){cmds[n]=d;return this;}};
  try{
    piloteCao("schema");
    const d=cmds.cao_schema_dessiner;
    sheet([],[]);S.drawings=[];S.hist.length=0;
    const lot=[{op:"poser",type:"annot_text",valeur:"LED UV 365 nm|côté bouchon",x:40,y:40},
               {op:"cadre",x1:0,y1:0,x2:30,y2:20,titre:"Note : côté LED"},
               {op:"cadre",x1:50,y1:0,x2:80,y2:20,titre:"Alim",zone:true}];
    const prop=d.proposer({lot});
    if(!/^2\. cadre « Note : côté LED » : de \(0, 0\) à \(30, 20\) mm, cadre de note$/m.test(prop.apres)||!/3\. cadre « Alim » .*room au PCB/.test(prop.apres))
      throw new Error("carte : "+prop.apres);
    d.appliquer({lot},prop);
    if(S.hist.length!==1||!S.comps.some(c=>c.type==="annot_text"&&/bouchon/.test(c.value))||S.drawings.length!==2)throw new Error("lot mal appliqué");
    const zones=schToutesLesZones().map(z=>z.nom);
    if(zones.join()!=="Alim")throw new Error("seul le cadre « zone » est un bloc : "+zones.join());
    let m="";try{d.proposer({lot:[{op:"cadre",x1:0,y1:0,x2:1,y2:10}]});}catch(e){m=e.message;}
    if(!/2 mm de côté/.test(m))throw new Error("cadre trop petit : "+m);
  }finally{global.Pilote=ancien;}
});
T("symboles de la LIB (schsym-1) : contrôlés, posés depuis le catalogue, gardés dans le document",()=>{
  const cmds={}, ancien=global.Pilote, lib=window.CSV_LIB;
  global.Pilote={declarer(){return this;},capture(){return this;},commande(n,d){cmds[n]=d;return this;}};
  const MCU={format:"schsym-1",id:"mcu_essai",name:"MCU d'essai",prefix:"U",defaultValue:"MCU1",defaultPkg:"QFN-16",
    pins:[{n:1,x:-60,y:-20,name:"VDD"},{n:2,x:-60,y:20,name:"GND"},{n:3,x:60,y:0,name:"TX"}],
    ext:[-60,-40,60,40],
    primitives:[{op:"rect",x:-40,y:-40,w:80,h:80,r:3,fill:true},{op:"line",x1:-60,y1:-20,x2:-40,y2:-20},
                {op:"text",text:"MCU",x:0,y:0,size:11},{op:"poly",pts:[[0,10],[5,20],[-5,20]]},{op:"circle",x:0,y:-25,r:3},
                {op:"arc",cx:0,cy:-40,r:6,start:0,end:Math.PI},{op:"arrow",x:50,y:0,angle:0,size:6}]};
  try{
    // contrôles : refus d'un fichier fautif, priorité aux intégrés
    const faute=(m,motif)=>{const r=schSymboleLire(m);if(r.def||!r.erreurs.some(e=>motif.test(e)))throw new Error("refus attendu "+motif+" : "+JSON.stringify(r.erreurs));};
    faute(Object.assign({},MCU,{format:"autre"}),/schsym-1/);
    faute(Object.assign({},MCU,{pins:[{n:1,x:0,y:0},{n:3,x:20,y:0}]}),/la 2 manque/);
    faute(Object.assign({},MCU,{primitives:[{op:"script",x:0}]}),/primitive inconnue/);
    faute(Object.assign({},MCU,{primitives:[{op:"line",x1:0,y1:0,x2:1e9,y2:0}]}),/finies/);
    faute(Object.assign({},MCU,{id:"../x"}),/id :/);
    if(schSymboleDefinir(Object.assign({},MCU,{id:"resistor"})))throw new Error("un fichier ne remplace pas l'intégré resistor");
    if(schSymboleDefinir(MCU)!=="mcu_essai"||!LIB.mcu_essai.lib||LIB.mcu_essai.pn.join()!=="VDD,GND,TX")throw new Error("symbole non défini");
    // posé depuis le catalogue par Claude, relié par nom de broche
    window.CSV_LIB=[{"Part Name":"MCU_ESSAI","Reference designator Prefix":"U","Empreinte Schématique":"lib/symbole/mcu_essai.json"}];
    if(schTypeDuCatalogue(window.CSV_LIB[0])!=="mcu_essai")throw new Error("le catalogue ne trouve pas le symbole de la LIB");
    // un symbole JLC garde la casse de son MPN : cherché tel quel avant les minuscules
    if(schSymboleDefinir(Object.assign({},MCU,{id:"LM358DR_ESSAI"}))!=="LM358DR_ESSAI"
       ||schTypeDuCatalogue({"Reference designator Prefix":"U","Empreinte Schématique":"lib/symbole/LM358DR_ESSAI.json"})!=="LM358DR_ESSAI")
      throw new Error("symbole en majuscules non trouvé");
    delete LIB.LM358DR_ESSAI; SYM_LIB_LUS.delete("LM358DR_ESSAI");
    piloteCao("schema");
    sheet([],[]);S.symboles={};S.hist.length=0;
    const r1=addComp("resistor",-200,-20);r1.ref="R1";
    const lot=[{op:"poser",catalogue:"MCU_ESSAI",ref:"U1",x:0,y:0},{op:"relier",de:"R1.2",a:"U1.VDD"}];
    const prop=cmds.cao_schema_dessiner.proposer({lot});
    if(/générique/.test(prop.apres))throw new Error("le symbole de la LIB est tombé sur le générique : "+prop.apres);
    cmds.cao_schema_dessiner.appliquer({lot},prop);
    const u1=S.comps.find(c=>c.ref==="U1");
    if(!u1||u1.type!=="mcu_essai"||!S.symboles.mcu_essai)throw new Error("posé sans être gardé dans le document");
    draw();                                                   // les primitives se dessinent sans erreur
    // le document rouvert sur un poste qui n'a pas ce symbole dans sa LIB
    const doc=JSON.parse(schDocCourant?JSON.stringify(schDocCourant()):serialize());
    delete LIB.mcu_essai; SYM_LIB_LUS.delete("mcu_essai");
    loadDoc(doc);
    // loadDoc met une feuille de hiérarchie en tête : U1 est sur une autre feuille
    const f=S.pages.find(pg=>(pg.comps||[]).some(c=>c.ref==="U1"));
    const u=f&&f.comps.find(c=>c.ref==="U1");
    if(!u||u.type!=="mcu_essai"||!LIB.mcu_essai||allPins(u).length!==3||!S.symboles.mcu_essai)
      throw new Error("le symbole ne revient pas avec le document");
    const vdd=allPins(u)[0];
    if(!(f.wires||[]).some(w=>(w.x1===vdd.x&&w.y1===vdd.y)||(w.x2===vdd.x&&w.y2===vdd.y)))throw new Error("le fil de U1.VDD est perdu");
  }finally{global.Pilote=ancien;window.CSV_LIB=lib;delete LIB.mcu_essai;SYM_LIB_LUS.delete("mcu_essai");S.symboles={};sheet([],[]);}
});
T("canal de pilotage : cao_schema_dessiner, un fil par coordonnées ne relie que par ses bouts",()=>{
  const cmds={}, ancien=global.Pilote;
  global.Pilote={declarer(){return this;},capture(){return this;},commande(n,d){cmds[n]=d;return this;}};
  try{
    piloteCao("schema");
    const d=cmds.cao_schema_dessiner;
    sheet([],[]);S.hist.length=0;
    const r1=addComp("resistor",0,0);r1.ref="R1";
    const r2=addComp("resistor",200,100);r2.ref="R2";
    const r3=addComp("resistor",100,60);r3.ref="R3";
    const lot=[{op:"fil",points:[{x:2,y:0},{x:8,y:0},{x:8,y:5}]}];
    const prop=d.proposer({lot});
    if(!/^1\. fil \(2, 0\) → \(8, 0\) → \(8, 5\)$/m.test(prop.avant)&&!/1\. fil \(2, 0\)/.test(prop.apres))throw new Error("carte : "+prop.avant+" | "+prop.apres);
    if(!/touche R1\.2 et R2\.1/.test(prop.apres))throw new Error("bouts : "+prop.apres);
    d.appliquer({lot},prop);
    const g=nets(), net=el=>g.list.findIndex(x=>x.nodes.some(nd=>nd.id===el.id&&nd.pin===(el===r1?2:1)));
    if(S.hist.length!==1||net(r1)<0||net(r1)!==net(r2))throw new Error("R1.2 et R2.1 non reliées par le fil");
    const refus=(l,motif)=>{let m="";try{d.proposer({lot:l});}catch(e){m=e.message;}if(!motif.test(m))throw new Error("refus attendu "+motif+" : "+m);};
    // passer sur les deux broches de R3 en chemin : refusé, rien ne reste
    const fils=S.wires.length;
    refus([{op:"fil",points:[{x:2,y:-3},{x:2,y:3},{x:10,y:3}]}],/relierait aussi|ne devaient pas/);
    if(S.wires.length!==fils)throw new Error("un refus a laissé du fil");
    refus([{op:"fil",points:[{x:0,y:0},{x:3,y:3}]}],/horizontal ou vertical/);
    refus([{op:"fil",points:[{x:0,y:0}]}],/de 2 à 50 points/);
    refus([{op:"fil",points:[{x:0,y:0},{x:5000,y:0}]}],/±1000/);
  }finally{global.Pilote=ancien;sheet([],[]);}
});
T("canal de pilotage : cao_schema_dessiner, simulé sans trace puis appliqué en une étape",()=>{
  const cmds={}, ancien=global.Pilote;
  global.Pilote={declarer(){return this;},capture(){return this;},commande(n,d){cmds[n]=d;return this;}};
  const etat=()=>JSON.stringify([serialize(),S.hist.length,S.dirty,[...S.sel],S.scale,S.ox,S.oy]);
  const refus=(lot,motif)=>{
    const avant=etat();
    let m="";try{cmds.cao_schema_dessiner.proposer({lot});}catch(e){m=e.message;}
    if(!motif.test(m))throw new Error("refus attendu "+motif+", lu « "+m+" »");
    if(etat()!==avant)throw new Error("un refus a laissé une trace : "+motif);
  };
  try{
    piloteCao("schema");
    const d=cmds.cao_schema_dessiner;
    if(!(d&&d.ecriture&&d.historique))throw new Error("écriture par l'historique attendue");
    sheet([],[]);
    const r1=addComp("resistor",0,0); r1.ref="R1";
    const p=allPins(r1); S.wires.push({x1:p[1].x,y1:p[1].y,x2:p[1].x+100,y2:p[1].y}); touchWires();
    S.hist.length=0; S.dirty=false; clearSel(); S.sel.add(r1.id); S.scale=1.5; S.ox=10; S.oy=20;
    const lot=[{op:"poser",type:"resistor",ref:"R10",valeur:"1k",x:20,y:0},
               {op:"poser",type:"capacitor"},                                   // place libre, repère tiré : C1
               {op:"tourner",ref:"R1",angle:90},
               {op:"deplacer",ref:"c1",dx:0,dy:5}];
    const avant=etat();
    const prop=d.proposer({lot});
    if(etat()!==avant)throw new Error("proposer a laissé une trace");
    if(!/^1\. poser R10 : resistor 1k( \([^)]*\))?, x 20 y 0 mm, 0°$/m.test(prop.apres)||!/^2\. poser C1 : capacitor/m.test(prop.apres)||
       !/^4\. deplacer C1 : /m.test(prop.avant))throw new Error("carte : "+prop.apres+" | "+prop.avant);
    d.appliquer({lot},prop);
    const c=r=>S.comps.find(x=>x.ref===r);
    if(S.hist.length!==1)throw new Error("une étape attendue, "+S.hist.length);
    if(!c("R10")||c("R10").x!==400||!c("C1")||c("R1").rot!==90)throw new Error("lot mal appliqué");
    if(!allPins(c("R1")).some(q=>S.wires.some(w=>(w.x1===q.x&&w.y1===q.y)||(w.x2===q.x&&w.y2===q.y))))throw new Error("le fil n'a pas suivi R1 tourné");
    if(S.comps.some(a=>S.comps.some(b=>a!==b&&(()=>{const A=hitBox(a),B=hitBox(b);return A.x1<B.x2&&B.x1<A.x2&&A.y1<B.y2&&B.y1<A.y2;})())))
      throw new Error("des composants se chevauchent");
    undo();
    if(c("R10")||c("C1")||c("R1").rot!==0)throw new Error("Ctrl+Z ne remet pas tout");
    S.hist.length=0;
    refus([{op:"poser",type:"resistor",x:0,y:0}],/chevauche R1/);
    refus([{op:"poser",type:"licorne"}],/type « licorne » inconnu/);
    refus([{op:"tourner",ref:"R9",angle:90}],/R9.*introuvable/);
    refus([{op:"tourner",ref:"R1",angle:45}],/90, 180 ou 270/);
    refus([{op:"poser",type:"resistor",x:30}],/donne x et y/);
    refus([{op:"poser",type:"resistor",ref:"r1"}],/« r1 » déjà pris/);
    refus([{op:"poser",type:"gnd",x:60,y:60}],/se pose avec etiqueter/);
    refus([{op:"poser",type:"resistor",ref:"constructor",x:60,y:60}],/nom réservé/);
    refus([{op:"voler",ref:"R1"}],/opération inconnue/);
    refus(Array.from({length:41},()=>({op:"miroir",ref:"R1"})),/41 éléments, 40 au plus/);
    /* le premier refus arrête tout : rien de ce qui précède ne reste */
    refus([{op:"poser",type:"resistor",ref:"R11",x:40,y:0},{op:"supprimer",ref:"R99"}],/2\. supprimer.*R99/);
    d.appliquer({lot:[{op:"supprimer",ref:"R1"}]});
    if(c("R1"))throw new Error("supprimer");
  }finally{global.Pilote=ancien;sheet([],[]);}
});

T("canal de pilotage : cao_schema_dessiner relie broche à broche, sans connexion par accident",()=>{
  const cmds={}, ancien=global.Pilote;
  global.Pilote={declarer(){return this;},capture(){return this;},commande(n,d){cmds[n]=d;return this;}};
  const etat=()=>JSON.stringify([serialize(),S.hist.length,S.dirty]);
  const refus=(lot,motif)=>{
    const avant=etat();
    let m="";try{cmds.cao_schema_dessiner.proposer({lot});}catch(e){m=e.message;}
    if(!motif.test(m))throw new Error("refus attendu "+motif+", lu « "+m+" »");
    if(etat()!==avant)throw new Error("un refus a laissé une trace : "+motif);
  };
  const ensemble=(a,b)=>nets().list.some(n=>n.nodes.some(x=>x.ref===a[0]&&x.pin===a[1])&&n.nodes.some(x=>x.ref===b[0]&&x.pin===b[1]));
  try{
    piloteCao("schema");
    const d=cmds.cao_schema_dessiner;
    sheet([],[]);
    const r1=addComp("resistor",0,0); r1.ref="R1";
    const r2=addComp("resistor",400,200); r2.ref="R2";
    S.hist.length=0; S.dirty=false;
    const prop=d.proposer({lot:[{op:"relier",de:"R1.2",a:"r2.1"}]});
    if(!/^1\. relier R1\.2 — R2\.1 : net N\$\d+$/m.test(prop.apres))throw new Error("carte : "+prop.apres);
    d.appliquer({lot:[{op:"relier",de:"R1.2",a:"r2.1"}]},prop);
    if(!ensemble(["R1",2],["R2",1])||S.hist.length!==1)throw new Error("R1.2 et R2.1 doivent être reliées, en une étape");
    /* R3 posée debout, une broche sur le chemin du fil : refus qui la nomme */
    const r3=addComp("resistor",0,0); r3.ref="R3"; r3.rot=90;
    const q=allPins(r3)[0]; r3.x+=200-q.x; r3.y+=-400-q.y;
    const r4=addComp("resistor",-200,-400); r4.ref="R4"; const r5=addComp("resistor",600,-400); r5.ref="R5";
    touchWires(); S.hist.length=0;
    refus([{op:"relier",de:"R4.2",a:"R5.1"}],/relierait aussi R3\.1/);
    /* supprimer_fil défait le relier ; sans fil direct : refus */
    d.appliquer({lot:[{op:"supprimer_fil",de:"R1.2",a:"R2.1"}]});
    if(ensemble(["R1",2],["R2",1]))throw new Error("supprimer_fil n'a pas séparé R1.2 et R2.1");
    refus([{op:"supprimer_fil",de:"R1.2",a:"R2.1"}],/pas de fil direct/);
    refus([{op:"relier",de:"R1.9",a:"R2.1"}],/R1 n'a pas de broche « 9 »/);
    refus([{op:"relier",de:"R1",a:"R2.1"}],/REPÈRE\.broche/);
    refus([{op:"relier",de:"R1.1",a:"R1.1"}],/avec elle-même/);
    /* poser puis relier dans le même lot */
    d.appliquer({lot:[{op:"poser",type:"capacitor",ref:"C9",x:-20,y:20},{op:"relier",de:"C9.1",a:"R1.1"}]});
    if(!ensemble(["C9",1],["R1",1]))throw new Error("un repère posé dans le lot doit pouvoir être relié");
  }finally{global.Pilote=ancien;sheet([],[]);}
});

T("canal de pilotage : cao_schema_dessiner étiquette (local, global, VCC, GND) dans les quatre directions",()=>{
  const cmds={}, ancien=global.Pilote;
  global.Pilote={declarer(){return this;},capture(){return this;},commande(n,d){cmds[n]=d;return this;}};
  const sur=(nom,ref,pin)=>docNets().groups.some(g=>g.name.toUpperCase()===nom&&g.nodes.some(x=>x.ref===ref&&x.pin===pin));
  try{
    piloteCao("schema");
    const d=cmds.cao_schema_dessiner;
    sheet([],[]);
    const lot=[{op:"poser",type:"resistor",ref:"R1",x:0,y:0},
               {op:"poser",type:"resistor",ref:"R2",x:20,y:0,rotation:90},
               {op:"poser",type:"resistor",ref:"R3",x:0,y:20},
               {op:"etiqueter",broche:"R1.1",net:"SDA",genre:"local"},     // vers la gauche
               {op:"etiqueter",broche:"R1.2",net:"BUS",genre:"global"},    // vers la droite
               {op:"etiqueter",broche:"R2.1",net:"3V3",genre:"vcc"},       // vers le haut ou le bas
               {op:"etiqueter",broche:"R2.2",genre:"gnd"},
               {op:"etiqueter",broche:"R3.1",net:"SDA",genre:"local"}];   // rejoint le SDA de R1.1
    const prop=d.proposer({lot});
    if(!/^4\. etiqueter R1\.1 : étiquette locale SDA \(#\d+ : /m.test(prop.apres)||!/^7\. etiqueter R2\.2 : masse GND \(#\d+ : /m.test(prop.apres))throw new Error("carte : "+prop.apres);
    d.appliquer({lot},prop);
    for(const [nom,ref,pin] of [["SDA","R1",1],["BUS","R1",2],["3V3","R2",1],["GND","R2",2],["SDA","R3",1]])
      if(!sur(nom,ref,pin))throw new Error(ref+"."+pin+" devrait être sur "+nom+" : "+JSON.stringify(docNets().groups.map(g=>[g.name,g.nodes.map(x=>x.ref+"."+x.pin)])));
    if(!docNets().groups.find(g=>g.name.toUpperCase()==="BUS").global)throw new Error("BUS doit être global");
    let m="";try{d.proposer({lot:[{op:"etiqueter",broche:"R3.2",net:"",genre:"local"}]});}catch(e){m=e.message;}
    if(!/1 à 40 caractères/.test(m))throw new Error("net vide : "+m);
    m="";try{d.proposer({lot:[{op:"etiqueter",broche:"R3.2",net:"X",genre:"rouge"}]});}catch(e){m=e.message;}
    if(!/local, global, vcc ou gnd/.test(m))throw new Error("genre : "+m);
    /* une étiquette n'a pas de repère : la carte et la lecture donnent son #id, que le dessin reprend */
    const id=+/^8\. etiqueter R3\.1 : étiquette locale SDA \(#(\d+) /m.exec(prop.apres)[1];
    const lu=LECTURE_CAO.schema.etiquettes.fn({filtre:"sda"});
    if(lu.length!==2||!lu.some(l=>l.indexOf("- #"+id+" étiquette locale SDA, f1 [affichée], x ")===0))throw new Error("lecture : "+lu.join(" | "));
    if(!/^- #\d+ masse GND, /.test(LECTURE_CAO.schema.etiquettes.fn({filtre:"gnd"})[0]))throw new Error("lecture GND");
    const lab=S.comps.find(c=>c.id===id), x0=lab.x;
    const p2=d.proposer({lot:[{op:"deplacer",ref:"#"+id,dx:0,dy:5},{op:"supprimer",ref:"#"+id}]});
    if(!/^1\. deplacer #\d+ : /m.test(p2.apres)||!/^2\. supprimer #\d+$/m.test(p2.avant.split("\n").map(l=>l.replace(/ : .*/,"")).join("\n")))throw new Error("carte #id : "+p2.avant+" / "+p2.apres);
    if(lab.x!==x0||!S.comps.includes(lab))throw new Error("proposer a touché l'étiquette");
    d.appliquer({lot:[{op:"supprimer",ref:"#"+id}]},d.proposer({lot:[{op:"supprimer",ref:"#"+id}]}));
    if(S.comps.some(c=>c.id===id)||sur("SDA","R3",1))throw new Error("étiquette #"+id+" non supprimée");
    m="";try{d.proposer({lot:[{op:"deplacer",ref:"#99999",dx:1,dy:0}]});}catch(e){m=e.message;}
    if(!/« #99999 » introuvable sur la feuille affichée/.test(m))throw new Error("#id inconnu : "+m);
  }finally{global.Pilote=ancien;sheet([],[]);}
});

T("canal de pilotage : cao_schema_dessiner crée une feuille, y dessine, renumérote le document",()=>{
  const cmds={}, ancien=global.Pilote;
  global.Pilote={declarer(){return this;},capture(){return this;},commande(n,d){cmds[n]=d;return this;}};
  try{
    piloteCao("schema");
    const d=cmds.cao_schema_dessiner;
    docLecture();                                     // f1 « Alim » : R1 ; f2 « Logique » : R2, R3
    S.hist.length=0;
    const avant=serialize(), nf=S.pages.length;
    const lot=[{op:"feuille",creer:"Régulateur"},
               {op:"poser",type:"capacitor",ref:"C20",x:0,y:0},{op:"poser",type:"capacitor",ref:"C21",x:20,y:0},
               {op:"relier",de:"C20.2",a:"C21.1"},
               {op:"feuille",renommer:1,nom:"Alimentation"},
               {op:"poser",type:"resistor",ref:"R30",x:60,y:30,feuille:1}];
    const prop=d.proposer({lot});
    if(serialize()!==avant||S.pages.length!==nf)throw new Error("proposer a laissé la feuille");
    if(!/^1\. feuille f3 : créée « Régulateur »$/m.test(prop.apres))throw new Error("carte : "+prop.apres);
    d.appliquer({lot},prop);
    storeCurrent();
    const f3=S.pages[2];
    if(S.pages.length!==nf+1||f3.name!=="Régulateur"||!f3.comps.some(c=>c.ref==="C20")||S.pages[0].name!=="Alimentation")throw new Error("feuilles mal faites");
    if(!S.pages[0].comps.some(c=>c.ref==="R30"))throw new Error("« feuille: 1 » devait poser R30 sur f1");
    if(S.hist.length!==1)throw new Error("une étape attendue");
    undo();
    if(S.pages.length!==nf||S.pages[0].name!=="Alim")throw new Error("Ctrl+Z ne retire pas la feuille");
    let m="";try{d.proposer({lot:[{op:"poser",type:"resistor",feuille:9}]});}catch(e){m=e.message;}
    if(!/feuille 9 inconnue : 1 à 2/.test(m))throw new Error("feuille inconnue : "+m);
    /* renuméroter : feuille par feuille, haut → bas puis gauche → droite */
    docLecture();
    storeCurrent();
    const f2=S.pages[1].comps.filter(c=>c.ref);
    S.pages[0].comps.find(c=>c.ref==="R1").ref="R7";
    const [a,b]=f2.sort((x,y)=>(x.y-y.y)||(x.x-y.x));      // a est lu avant b
    a.ref="R9"; b.ref="R4";
    const p2=d.proposer({lot:[{op:"renumeroter"}]});
    if(!/^1\. renumeroter R7 : R1$/m.test(p2.apres)||!/^1\. PCB : garde les anciens repères/m.test(p2.apres))throw new Error("carte : "+p2.apres);
    d.appliquer({lot:[{op:"renumeroter"}]});
    storeCurrent();
    const refs=S.pages.map(p=>p.comps.filter(c=>c.ref).map(c=>c.ref).sort());
    if(JSON.stringify(refs)!==JSON.stringify([["R1"],["R2","R3"]]))throw new Error("renumérotation : "+JSON.stringify(refs));
    if(a.ref!=="R2"||b.ref!=="R3")throw new Error("ordre de lecture : "+a.ref+", "+b.ref);
    m="";try{d.proposer({lot:[{op:"renumeroter"}]});}catch(e){m=e.message;}
    if(!/déjà dans l'ordre/.test(m))throw new Error("rien à renuméroter : "+m);
  }finally{global.Pilote=ancien;sheet([],[]);}
});

T("canal de pilotage : un montage dessiné en un lot (régulateur, deux condensateurs, VCC, GND) a les nets voulus",()=>{
  const cmds={}, ancien=global.Pilote;
  global.Pilote={declarer(){return this;},capture(){return this;},commande(n,d){cmds[n]=d;return this;}};
  const membres=nom=>{const g=docNets().groups.find(x=>x.name.toUpperCase()===nom);return g?g.nodes.map(x=>x.ref+"."+x.pin).sort():[];};
  try{
    piloteCao("schema");
    sheet([],[]);
    const lot=[{op:"poser",type:"regulator",ref:"U1",valeur:"AMS1117-3.3",x:0,y:0},
               {op:"poser",type:"capacitor",ref:"C1",valeur:"10u",x:-10,y:8,rotation:90},
               {op:"poser",type:"capacitor",ref:"C2",valeur:"10u",x:10,y:8,rotation:90},
               {op:"relier",de:"U1.IN",a:"C1.1"},{op:"relier",de:"U1.OUT",a:"C2.1"},
               {op:"etiqueter",broche:"U1.IN",net:"5V",genre:"vcc"},
               {op:"etiqueter",broche:"U1.OUT",net:"3V3",genre:"local"},
               {op:"etiqueter",broche:"U1.GND",genre:"gnd"},
               {op:"etiqueter",broche:"C1.2",genre:"gnd"},{op:"etiqueter",broche:"C2.2",genre:"gnd"}];
    cmds.cao_schema_dessiner.appliquer({lot},cmds.cao_schema_dessiner.proposer({lot}));
    const att={"5V":["C1.1","U1.1"],"3V3":["C2.1","U1.2"],"GND":["C1.2","C2.2","U1.3"]};
    for(const [nom,liste] of Object.entries(att))
      if(JSON.stringify(membres(nom))!==JSON.stringify(liste))throw new Error(nom+" : "+JSON.stringify(membres(nom))+" au lieu de "+JSON.stringify(liste));
    if(S.hist.length<1)throw new Error("une étape attendue");
    /* aucune étiquette n'est posée en travers d'un fil tracé avant elle */
    for(const e of S.comps.filter(c=>defOf(c.type).noRef)){
      const h=hitBox(e), pin=allPins(e)[0];
      const coupe=S.wires.some(w=>[[w.x1,w.y1],[w.x2,w.y2],[(w.x1+w.x2)/2,(w.y1+w.y2)/2]].some(([x,y])=>
        x>h.x1&&x<h.x2&&y>h.y1&&y<h.y2&&Math.hypot(x-pin.x,y-pin.y)>12));
      if(coupe)throw new Error("l'étiquette "+e.type+" "+e.value+" est posée sur un fil");
    }
  }finally{global.Pilote=ancien;sheet([],[]);}
});

T("canal de pilotage : cao_schema_dessiner, garde sur poser/déplacer/tourner, noms, parties d'un boîtier, geste en cours",()=>{
  const cmds={}, ancien=global.Pilote;
  global.Pilote={declarer(){return this;},capture(){return this;},commande(n,d){cmds[n]=d;return this;}};
  const refus=(lot,motif)=>{
    const avant=serialize();
    let m="";try{cmds.cao_schema_dessiner.proposer({lot});}catch(e){m=e.message;}
    if(!motif.test(m))throw new Error("refus attendu "+motif+", lu « "+m+" »");
    if(serialize()!==avant)throw new Error("un refus a laissé une trace : "+motif);
  };
  try{
    piloteCao("schema");
    const d=cmds.cao_schema_dessiner;
    sheet([],[]);
    const r1=addComp("resistor",0,0); r1.ref="R1";
    S.wires.push({x1:-400,y1:400,x2:400,y2:400}); touchWires();          // un fil seul, à y = 20 mm
    /* une broche posée, déplacée ou tournée sur ce fil le rejoindrait : refus */
    refus([{op:"poser",type:"resistor",ref:"R2",x:0,y:20}],/toucherait un fil ou une broche/);
    refus([{op:"deplacer",ref:"R1",x:0,y:20}],/toucherait un fil ou une broche/);
    /* une étiquette GND posée à la main, puis un fil qui passerait sur sa broche : le nom GND serait pris */
    const g=addComp("gnd",0,0); const pg=allPins(g)[0]; g.x+=200-pg.x; g.y+=-200-pg.y;
    const r4=addComp("resistor",-200,-200); r4.ref="R4"; const r5=addComp("resistor",600,-200); r5.ref="R5";
    touchWires();
    refus([{op:"relier",de:"R4.2",a:"R5.1"}],/le nom de net « GND »/);
    refus([{op:"etiqueter",broche:"R1.1",net:"constructor",genre:"local"}],/1 à 40 caractères/);
    /* renuméroter : les parties d'un même boîtier gardent un seul repère, l'échange est signalé */
    sheet([],[]);
    const a=addComp("opamp",0,0); a.ref="U9"; a.part="A";
    const b=addComp("opamp",400,0); b.ref="U9"; b.part="B";
    const u1=addComp("opamp",0,400); u1.ref="U1";
    const pr=d.proposer({lot:[{op:"renumeroter"}]});
    d.appliquer({lot:[{op:"renumeroter"}]},pr);
    if(a.ref!=="U1"||b.ref!=="U1"||u1.ref!=="U2")throw new Error("parties : "+[a.ref,b.ref,u1.ref]);
    if(!/U1, U2 y désignent alors d'autres composants|U1.*d'autres composants/.test(pr.apres))throw new Error("échange non signalé : "+pr.apres);
    /* une proposition n'interrompt pas une pose en cours */
    S.place="capacitor"; S.placeLibItem={"Part Name":"X"};
    d.proposer({lot:[{op:"poser",type:"resistor",x:80,y:80}]});
    if(S.place!=="capacitor"||!S.placeLibItem)throw new Error("la pose en cours a été perdue");
    S.place=null; S.placeLibItem=null;
  }finally{global.Pilote=ancien;sheet([],[]);}
});

T("canal de pilotage : cao_schema_dessiner, objets d'origine gardés, conflits de noms, fils à branches, symbole inconnu",()=>{
  const cmds={}, ancien=global.Pilote;
  global.Pilote={declarer(){return this;},capture(){return this;},commande(n,d){cmds[n]=d;return this;}};
  const msg=lot=>{let m="";try{cmds.cao_schema_dessiner.proposer({lot});}catch(e){m=e.message;}return m;};
  try{
    piloteCao("schema");
    const d=cmds.cao_schema_dessiner;
    sheet([],[]);
    const r1=addComp("resistor",0,0); r1.ref="R1"; const r2=addComp("resistor",400,0); r2.ref="R2";
    const r3=addComp("resistor",0,400); r3.ref="R3";
    /* proposer garde les objets eux-mêmes (une fenêtre ouverte sur R1 reste branchée) */
    const pages=S.pages, comps=S.comps;
    d.proposer({lot:[{op:"poser",type:"resistor",x:60,y:60},{op:"feuille",creer:"X"}]});
    if(S.pages!==pages||S.comps!==comps||S.comps[0]!==r1)throw new Error("proposer a remplacé les objets du document");
    /* déjà reliées ; deux noms réunis */
    d.appliquer({lot:[{op:"relier",de:"R1.2",a:"R2.1"}]});
    if(!/déjà reliées/.test(msg([{op:"relier",de:"R1.2",a:"R2.1"}])))throw new Error("déjà reliées");
    d.appliquer({lot:[{op:"etiqueter",broche:"R1.1",net:"SDA",genre:"local"},{op:"etiqueter",broche:"R3.1",net:"SCL",genre:"local"}]});
    if(!/réunirait les nets SDA et SCL|réunirait les nets SCL et SDA/.test(msg([{op:"relier",de:"R1.1",a:"R3.1"}])))throw new Error("conflit SDA/SCL : "+msg([{op:"relier",de:"R1.1",a:"R3.1"}]));
    if(!/réunirait les nets/.test(msg([{op:"etiqueter",broche:"R2.2",net:"SDA",genre:"local"},{op:"etiqueter",broche:"R2.2",net:"SCL",genre:"local"}])))
      throw new Error("deux étiquettes de noms différents sur un net");
    /* supprimer_fil : R2.2 a deux fils, le bon est trouvé ; une broche au milieu du chemin : refus */
    sheet([],[]);
    const a=addComp("resistor",0,0); a.ref="R1"; const b=addComp("resistor",400,0); b.ref="R2";
    const pa=allPins(a)[1], pb=allPins(b)[0];
    S.wires.push({x1:pa.x,y1:pa.y,x2:pa.x,y2:pa.y-100},{x1:pa.x,y1:pa.y,x2:pb.x,y2:pb.y}); touchWires();
    d.appliquer({lot:[{op:"supprimer_fil",de:"R1.2",a:"R2.1"}]});
    if(S.wires.length!==1)throw new Error("le fil direct devait partir, le moignon rester : "+S.wires.length);
    sheet([],[]);
    const c=addComp("resistor",0,0); c.ref="R1"; const e=addComp("resistor",800,0); e.ref="R2";
    const m=addComp("resistor",0,0); m.ref="R3"; m.rot=90;
    const pc=allPins(c)[1], pe=allPins(e)[0], pm=allPins(m)[0]; m.x+=400-pm.x; m.y+=pc.y-pm.y;
    S.wires.push({x1:pc.x,y1:pc.y,x2:pe.x,y2:pe.y}); touchWires();
    if(!/passe par une autre broche/.test(msg([{op:"supprimer_fil",de:"R1.2",a:"R2.1"}])))throw new Error("broche au milieu : "+msg([{op:"supprimer_fil",de:"R1.2",a:"R2.1"}]));
    /* symbole du catalogue inconnu de la page : dit sur la carte */
    const lib=window.CSV_LIB;
    window.CSV_LIB=[{"Part Name":"BIZARRE","Reference designator Prefix":"U","Empreinte Schématique":"lib/symbole/licorne.json"}];
    try{
      const pr=d.proposer({lot:[{op:"poser",catalogue:"BIZARRE",x:100,y:100}]});
      if(!/symbole « licorne » inconnu de la page/.test(pr.apres))throw new Error("symbole inconnu non dit : "+pr.apres);
    }finally{window.CSV_LIB=lib;}
    if(!/pas de « nom » avec lui/.test(msg([{op:"feuille",creer:"A",nom:"B"}])))throw new Error("creer + nom");
    /* renuméroter : r5 et R3 partagent le compteur */
    sheet([],[]);
    const x1=addComp("resistor",0,0); x1.ref="r5"; const x2=addComp("resistor",400,0); x2.ref="R3";
    d.appliquer({lot:[{op:"renumeroter"}]});
    if(x1.ref.toUpperCase()===x2.ref.toUpperCase())throw new Error("doublon de casse : "+x1.ref+" / "+x2.ref);
  }finally{global.Pilote=ancien;sheet([],[]);}
});

T("classes d'interface : la table commune est chargée",()=>{
  if(Object.keys(CLASSES_INTERFACE).length!==7)throw new Error("7 interfaces attendues");
  if(familleClasse("USB HS")!=="Rapide"||familleClasse("CAN")!=="Lent"||familleClasse("RF")!=="RF")
    throw new Error("famille d'une classe");
});
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
  // une valeur écrite par Claude ou venue d'un projet ne doit pas devenir une formule de tableur
  for(const [v,att] of [["=1+1","'=1+1"],["+5V","'+5V"],["@SUM(A1)","'@SUM(A1)"],["-x","'-x"],["-40","-40"],["-.5","-.5"],["10k","10k"]])
    if(csvCell(v)!==att)throw new Error("formule : "+v+" → "+csvCell(v));
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
  if(esc(null)!==""||esc(undefined)!=="")throw new Error("valeur absente : "+esc(null));
  if(esc(0)!=="0")throw new Error("zéro : "+esc(0));
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
/* Brouillon : la sauvegarde automatique va à côté du document du projet, sur
   le serveur simulé ; rien dans le navigateur. */
TA("brouillon : écrit si modifié et changé, effacé à l'enregistrement, repris à la réouverture",async()=>{
  if(SCH_REPRISE)throw new Error("le banc démarre sans session : la reprise du projet est sautée");
  const avant=global.fetch, conf=global.confirm, luAvant=SCH_PROJET_LU;
  const disque={}, appels=[];
  let horloge=1000;
  const rep=(st,o)=>Promise.resolve({ok:st<400,status:st,text:()=>Promise.resolve(JSON.stringify(o))});
  global.fetch=(url,opt)=>{
    const u=String(url), m=(opt&&opt.method)||"GET";
    if(u.split("?")[0]!=="/api/projet/doc")return rep(404,{detail:"absent"});
    const cle=/brouillon=1/.test(u)?"brouillon":"doc";
    appels.push(m+" "+cle);
    if(m==="PUT"){disque[cle]={document:JSON.parse(opt.body),modifie:horloge+=1000};return rep(200,{fichier:cle,modifie:horloge});}
    if(m==="DELETE"){delete disque[cle];return rep(200,{ok:true});}
    return disque[cle]?rep(200,disque[cle]):rep(404,{detail:"introuvable"});
  };
  const avis=document.getElementById("projdAvis"), qs=avis.querySelector;
  avis.querySelector=()=>({textContent:""});      // l'avis remplit son HTML, que le DOM simulé ne découpe pas
  SCH_PROJET_LU=true;          // l'adoption du projet ne relit pas le schéma : l'essai le fait
  dom.storage.clear();
  try{
    projdAdopter("serveur","carte",projdNeuf("carte"),{});
    if(projdNomBrouillon("schema")!=="carte-SCH.brouillon.json")throw new Error("nom : "+projdNomBrouillon("schema"));
    const tic=()=>projdBrouillonTic("schema",S.dirty,function(){return schDocCourant(true);});
    sheet([C("resistor",1,1,{ref:"R9",value:"en cours"})],[]);S.dirty=false;
    if(await tic())throw new Error("schéma propre : rien à écrire");
    S.dirty=true;
    if(!await tic())throw new Error("schéma modifié : brouillon attendu");
    if(await tic())throw new Error("rien n'a changé : pas de second brouillon (la netlist et son heure n'y sont pas)");
    if(disque.brouillon.document.netlist!==null)throw new Error("le brouillon ne porte pas de netlist");
    if([...dom.storage._map.values(),...dom.session._map.values()].some(v=>v.indexOf("en cours")>=0))
      throw new Error("le brouillon ne va pas dans le navigateur");
    if(!await saveJsonProjet(schDocCourant(),false))throw new Error("enregistrement refusé");
    for(let i=0;i<20;i++)await null;     // microtâches seulement : un tour de boucle réveillerait le rejet orphelin d'un essai plus haut (crSelectionnerCandidat)
    if(disque.brouillon||appels.join()!=="PUT brouillon,PUT doc,DELETE brouillon")throw new Error("appels : "+appels);
    /* réouverture : un brouillon plus récent se propose, repris il reste « modifié » */
    const b=JSON.parse(JSON.stringify(disque.doc.document));
    b.pages[b.pages.length-1].comps[0].value="brouillon";
    disque.brouillon={document:b,modifie:horloge+500};
    global.confirm=()=>true;
    sheet([],[]);S.dirty=false;SCH_PROJET_LU=false;
    schChargerProjet();
    for(let i=0;i<40;i++)await null;
    storeCurrent();
    const r9=S.pages.flatMap(p=>p.comps).find(c=>c.ref==="R9");
    if(!r9||r9.value!=="brouillon")throw new Error("le brouillon n'est pas repris");
    if(!S.dirty)throw new Error("un brouillon repris doit rester « modifié »");
    /* refusé (ou boîte fermée par le navigateur) : le document enregistré, le brouillon reste */
    global.confirm=()=>false;
    sheet([],[]);S.dirty=false;SCH_PROJET_LU=false;
    schChargerProjet();
    for(let i=0;i<40;i++)await null;
    storeCurrent();
    if(!disque.brouillon)throw new Error("refusé, le brouillon ne s'efface pas : le prochain enregistrement le fera");
    if(S.dirty||S.pages.flatMap(p=>p.comps).find(c=>c.ref==="R9").value!=="en cours")
      throw new Error("refusé : le schéma enregistré devait être chargé");
    /* travail commencé pendant la lecture : rien ne se propose */
    let question="";global.confirm=t=>{question=t;return true;};
    sheet([],[]);S.dirty=false;SCH_PROJET_LU=false;
    schChargerProjet();S.dirty=true;
    for(let i=0;i<40;i++)await null;
    if(question||!disque.brouillon)throw new Error("occupé : le brouillon ne devait pas se proposer");
    /* nom déclaré sans .json : pas de brouillon, il serait le document lui-même */
    projdAdopter("serveur","carte",Object.assign(projdNeuf("carte"),{fichiers:{schema:"carte-SCH"}}),{});
    if(projdNomBrouillon("schema")!=="")throw new Error("sans .json : "+projdNomBrouillon("schema"));
    const n=appels.length;
    if(await tic()||appels.length!==n)throw new Error("sans .json : rien ne s'écrit");
  }finally{
    global.fetch=avant;global.confirm=conf;avis.querySelector=qs;SCH_PROJET_LU=luAvant;
    projdDetacher();projFermer();S.dirty=false;dom.storage.clear();
  }
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
T("netlist multi-feuilles : deux N$1 de feuilles différentes restent deux nets",()=>{
  const mk=(r1,r2)=>{
    const a=C("resistor",0,0,{ref:r1,value:"1k",pkg:"0603"}), b=C("resistor",10,0,{ref:r2,value:"1k",pkg:"0603"});
    const pa=allPins(a), pb=allPins(b), pg=newPage("f");
    pg.comps=[a,b];pg.wires=[{x1:pa[1].x,y1:pa[1].y,x2:pb[0].x,y2:pb[0].y}];
    return pg;
  };
  S.pages=[mk("R1","R2"),mk("R3","R4")];loadPage(0);touchWires();
  const txt=netlistText("x");
  const noms=(txt.match(/^NET "[^"]*"/gm)||[]);
  if(new Set(noms).size!==noms.length)throw new Error("noms de net en double (le PCB les fusionne) :\n"+noms.join("\n"));
  if(!/NET "N\$1_f1"/.test(txt)||!/NET "N\$1_f2"/.test(txt))throw new Error("suffixe de feuille attendu :\n"+txt);
});
T("netlist multi-feuilles : un deuxième nom global relie les feuilles",()=>{
  // feuille 1 : R1.2 sur GND et l'étiquette globale AGND ; feuille 2 : R2.2 sur AGND
  const r1=C("resistor",0,0,{ref:"R1",value:"1k",pkg:"0603"}), g=C("gnd",0,6,{value:"GND"}), l=C("gport",6,6,{value:"AGND"});
  const p=allPins(r1), pg=allPins(g), pl=allPins(l);
  const s1=newPage("a");s1.comps=[r1,g,l];
  s1.wires=[{x1:p[1].x,y1:p[1].y,x2:pg[0].x,y2:pg[0].y},{x1:pg[0].x,y1:pg[0].y,x2:pl[0].x,y2:pl[0].y}];
  const r2=C("resistor",0,0,{ref:"R2",value:"1k",pkg:"0603"}), l2=C("gport",0,6,{value:"AGND"});
  const q=allPins(r2), ql=allPins(l2);
  const s2=newPage("b");s2.comps=[r2,l2];s2.wires=[{x1:q[1].x,y1:q[1].y,x2:ql[0].x,y2:ql[0].y}];
  S.pages=[s1,s2];loadPage(0);touchWires();
  const grp=docNets().groups.filter(x=>x.nodes.some(n=>n.ref==="R1"&&n.pin===2)||x.nodes.some(n=>n.ref==="R2"&&n.pin===2));
  if(grp.length!==1)throw new Error("R1.2 et R2.2 doivent être sur un seul net, "+grp.length+" groupes");
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

T("dupliquer, copier, recharger : le bus et les attributs de la LIB suivent",()=>{
  const bus=W(2,2,10,2,"D[0..7]");bus.bus=true;
  sheet([],[bus]);S.selW.add(bus);
  if(!clipContent().wires[0].bus)throw new Error("copier perd le bus");
  dupSel();
  if(S.wires.length!==2||!S.wires[1].bus)throw new Error("dupliquer perd le bus : "+JSON.stringify(S.wires));
  const champs={fpPcb:"lib/empreinte/0603.json",symSch:"lib/symbole/LM358DR.json",simModel:"LM358.lib",desc:"AOP double",specsProvenance:"catalogue"};
  const r=normComp(Object.assign({type:"resistor",ref:"R1",x:0,y:0},champs),0);
  for(const [k,v] of Object.entries(champs))if(r[k]!==v)throw new Error("normComp perd "+k+" : "+r[k]);
  if(normComp({type:"resistor",ref:"R1",desc:"x".repeat(9999)},0).desc.length!==500)throw new Error("desc non bornée");
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

T("touches Z puis T : le tracé suivant n'est plus une zone",()=>{
  const k=(key,sh)=>dom.fireWin("keydown",{key,shiftKey:!!sh,target:{tagName:"BODY"}});
  for(const [suite,sh] of [["t",false],["T",true]]){
    k("z");
    if(!S.drawIsZone||S.mode!=="draw")throw new Error("Z doit armer le tracé de zone");
    k(suite,sh);
    if(S.drawIsZone)throw new Error(suite+" après Z doit quitter le mode zone");
  }
  k("z");k("Escape");
  if(S.drawIsZone)throw new Error("quitter le mode tracé doit désarmer la zone");
});

T("removePage : la confirmation compte aussi les traits et les zones",()=>{
  const avant=serialize(), conf=global.confirm;
  try{
    loadDoc({format:"schemedit-2",pages:[{name:"H",isHierarchy:true,comps:[],wires:[]},
      {name:"A",comps:[],wires:[]},
      {name:"B",comps:[],wires:[],drawings:[{id:1,shape:"rect",type:"rect",x1:0,y1:0,x2:40,y2:40,isZone:true}]}]});
    let demande=0;global.confirm=()=>{demande++;return false;};
    removePage(2);
    if(demande!==1||S.pages.length!==3)throw new Error("une feuille ne contenant qu'un dessin doit demander confirmation");
    removePage(1);
    if(demande!==1||S.pages.length!==2)throw new Error("une feuille vide se supprime sans confirmation");
  }finally{global.confirm=conf;loadDoc(JSON.parse(avant),true);}
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

T("dupliquer une feuille renumérote ses repères, les parties d'un boîtier restent ensemble",()=>{
  loadDoc({pages:[{name:"Une",comps:[C("resistor",2,2,{ref:"R1"}),C("resistor",6,2,{ref:"R2"}),
    C("ic",10,2,{ref:"U1",part:"A"}),C("ic",20,2,{ref:"U1",part:"B"}),C("gnd",2,8,{})],wires:[]}]});
  gotoPage(1);addPage(true);
  const avant=S.pages[1].comps.map(c=>c.ref), apres=S.comps.map(c=>c.ref);
  if(S.page!==2||apres.slice(0,4).some(r=>avant.includes(r))||new Set(apres.slice(0,2)).size!==2
     ||apres[2]!==apres[3]||apres[4])
    throw new Error("repères de la copie : "+apres.join()+" (source "+avant.join()+")");
  sheet([],[]);                                   // l'essai suivant part de la feuille 0
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

T("nombre de broches d'un composant non-IC (connecteur)",()=>{
  const j = C("header", 5, 5, {ref:"J1"});
  sheet([j], []);
  if(pinCount(j)!==2) throw new Error("un header natif a 2 broches, reçu: "+pinCount(j));
  icSetCount(j, 4);
  j.pinNames = ["VCC", "TX", "RX", "GND"];
  if(pinCount(j)!==4) throw new Error("le header doit avoir 4 broches après icSetCount");
  if(j.pinNames.length!==4||j.pinNames[1]!=="TX") throw new Error("noms des broches incorrects");
  const ps = pinsOf(j);
  if(ps.length!==4) throw new Error("pinsOf doit renvoyer 4 broches");
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
  icSetCount(u1, 4);

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
  icSetCount(u2, 4);

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

/* Les essais de la fenêtre de recherche partagent CR_ETAT, fetch et les cases à
   cocher (le DOM simulé n'analyse pas l'innerHTML : une case est l'élément que
   rend getElementById) : chacun part d'un état propre (et d'une feuille vide)
   et rend l'ancien. */
const CR_CASES=["cp_mpn","cp_mfr","cp_pkg","cp_dsheet","cp_lcsc","cp_mouser","cp_digikey","cp_pinout","crBatchApply"];
function TAcr(name,fn){
  TA(name,async()=>{
    const etat={...CR_ETAT}, f=global.fetch, cases=CR_CASES.map(id=>document.getElementById(id).checked);
    Object.assign(CR_ETAT,{el:null,selectedCand:null,partDetails:null,mouserData:null,digikeyData:null,pinoutData:null,pinoutMeta:null,detectedConflicts:[]});
    CR_CASES.forEach(id=>{document.getElementById(id).checked=false;});
    sheet([],[]);      // l'application rafraîchit les panneaux : pas de composant laissé par un autre essai
    try{await fn();}
    finally{
      for(const k of Object.keys(CR_ETAT))if(!(k in etat))delete CR_ETAT[k];
      Object.assign(CR_ETAT,etat);global.fetch=f;
      CR_CASES.forEach((id,i)=>{document.getElementById(id).checked=cases[i];});
    }
  });
}

/* réponse de la passerelle POST /api/tool : {name, arguments} -> {data} (python/passerelle_mcp.py) */
TAcr("recherche distributeurs : agrégation Mouser et DigiKey", async ()=>{
  const ancienFetch = global.fetch;
  global.fetch = async (url, opts) => {
    const body = JSON.parse(opts.body || "{}");
    if (body.name === "mouser_get_part") {
      return {
        ok: true,
        json: async () => ({
          data: {
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
    if (body.name === "digikey_get_part") {
      return {
        ok: true,
        json: async () => ({
          data: {
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
    return { ok: true, json: async () => ({ data: {} }) };
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

TAcr("recherche composants : application au composant schématique", async ()=>{
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

  // cases cochées (le DOM simulé n'analyse pas l'innerHTML : on coche les éléments eux-mêmes)
  ["cp_mpn","cp_mfr","cp_pkg","cp_mouser","cp_digikey"].forEach(id=>{document.getElementById(id).checked=true;});
  const spec=document.createElement("input");
  spec.className="cp-spec";spec.setAttribute("data-spec-key","Supply Voltage");spec.setAttribute("data-spec-val","2V-15V");spec.checked=true;
  document.body.appendChild(spec);
  try{ await crAppliquerAuComposant(); }finally{ spec.remove(); }

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

TAcr("recherche composants : retour systématique du pinout et conservation", async () => {
  const saveFetch = global.fetch;
  const oldComp = {
    id: 10,
    type: "opamp",
    ref: "U1",
    value: "LM358",
    pkg: "SOIC-8",
    x: 100,
    y: 100,
    rot: 0          // un composant posé a toujours son orientation (normComp) : sans elle, allPins casse
  };
  sheet([oldComp], []);

  global.fetch = async (url, opts) => {
    const body = opts && opts.body ? JSON.parse(opts.body) : {};
    if (body.name === "jlc_get_pinout") {
      return {
        ok: true,
        json: async () => ({
          data: {
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
    if (body.name === "jlc_get_part") {
      return {
        ok: true,
        json: async () => ({
          data: {
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
    return { ok: true, json: async () => ({ data: {} }) };
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
    document.getElementById("cp_pinout").checked = true;
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

TAcr("recherche composants : une réponse en retard n'écrase pas le candidat choisi ensuite", async ()=>{
  let lacher;
  const retard=new Promise(r=>lacher=r);
  global.fetch=async(url,opt)=>{
    const b=JSON.parse(opt.body);
    if(b.name==="jlc_get_part"&&b.arguments.lcsc==="C1")await retard;
    const data=b.name==="jlc_get_part"?{lcsc:b.arguments.lcsc,model:"M"+b.arguments.lcsc}:null;
    return {ok:true,json:async()=>({data})};
  };
  const a=crSelectionnerCandidat({lcsc:"C1",model:"MC1"});
  await crSelectionnerCandidat({lcsc:"C2",model:"MC2"});
  lacher();await a;
  if(!CR_ETAT.partDetails||CR_ETAT.partDetails.lcsc!=="C2")throw new Error("détails écrasés : "+JSON.stringify(CR_ETAT.partDetails));
});

TAcr("recherche composants : bouton Valider rétabli (succès, erreur), datasheet refusée gardée en ligne", async ()=>{
  const btn=document.getElementById("crBtnApply"), ds=document.getElementById("cp_dsheet"), hint=document.getElementById("fHint");
  const sauve={fetch:global.fetch, el:CR_ETAT.el, d:CR_ETAT.partDetails, err:console.error, ds:ds.checked};
  const pret=()=>btn.textContent==="✓ Valider et enrichir"&&!btn.disabled;
  try{
    const comp=C("ic",10,10,{ref:"U9"});
    CR_ETAT.el=comp;
    CR_ETAT.partDetails={model:"X1",datasheet:"https://exemple.org/x1.pdf"};
    ds.checked=true;
    global.fetch=async()=>({ok:false,status:403,json:async()=>({detail:"hors --local"})});
    await crAppliquerAuComposant();
    if(!pret())throw new Error("succès : bouton « "+btn.textContent+" », désactivé="+btn.disabled);
    if(comp.datasheet_url!=="https://exemple.org/x1.pdf")throw new Error("refus : datasheet_url="+comp.datasheet_url);
    if(!/hors --local/.test(hint.textContent))throw new Error("raison du refus non dite : "+hint.textContent);
    // erreur au milieu de l'enrichissement : le bouton revient quand même
    CR_ETAT.el=C("ic",12,10,{ref:"U10"});
    CR_ETAT.partDetails={get model(){throw new Error("panne simulée");}};
    console.error=()=>{};
    await crAppliquerAuComposant();
    if(!pret())throw new Error("erreur : bouton « "+btn.textContent+" », désactivé="+btn.disabled);
    if(!/panne simulée/.test(hint.textContent))throw new Error("erreur non dite : "+hint.textContent);
  }finally{
    global.fetch=sauve.fetch;CR_ETAT.el=sauve.el;CR_ETAT.partDetails=sauve.d;console.error=sauve.err;ds.checked=sauve.ds;
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
    { type: "esd_rail4", expPins: 6, expPkg: "SOT-23-6", expP: "U" },
    { type: "esd_rail2", expPins: 4, expPkg: "SOT-23-6", expP: "U" },
    { type: "mos_np", expPins: 6, expPkg: "SOT-23-6", expP: "Q" },
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

T("symboles à broches nommées : le brochage de la LIB les place (FDS9934C, SR05)",()=>{
  sheet([],[]);
  const q=addComp("mos_np",100,100); q.pkg="SOIC-8";
  brDepuisLib(q,{"Brochage":"G1=2,S1=1,D1=7/8,G2=4,S2=3,D2=5/6"},true);
  const vu=[0,1,2,3,4,5].map(i=>brPattes(q,i).join("/")).join(" ");
  if(vu!=="2 1 7/8 4 3 5/6")throw new Error("FDS9934C : "+vu);
  if(brControles().some(x=>x.id===q.id&&x.niveau==="erreur"))
    throw new Error("FDS9934C signalé : "+JSON.stringify(brControles()));
  const u=addComp("esd_rail2",300,100); u.pkg="SOT-143";
  brDepuisLib(u,{"Brochage":"IO1=2,IO2=3,VCC=4,GND=1"},true);
  if([0,1,2,3].map(i=>brPatte(u,i)).join()!=="2,3,4,1")throw new Error("SR05 : "+u.pinMap);
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
  SCH_LIB_ALERTE.compIds = new Set([schCleLib(r1)]);
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

  // les id sont propres à chaque feuille : le même id sur une autre feuille n'est pas concerné ;
  // le lot entier s'annule d'un seul Ctrl+Z
  const a = C("resistor", 10, 10, { id: 7, ref: "R1", csvPartName: "RES_0603_10K", symSch: "resistor.json" });
  const b = C("capacitor", 10, 10, { id: 7, ref: "C2", csvPartName: "AUTRE", symSch: "autre.json" });
  const c = C("resistor", 14, 10, { id: 8, ref: "R3", csvPartName: "RES_0603_10K", symSch: "resistor.json" });
  sheet([a, c], []);
  const p2 = newPage("Deux"); p2.comps = [b]; S.pages.push(p2);
  SCH_LIB_ALERTE.active = true;
  SCH_LIB_ALERTE.compIds = new Set(schTrouverComposantsAmettreAJour({ genre: "fichier", nom: "resistor.json" }).map(schCleLib));
  if(SCH_LIB_ALERTE.compIds.size !== 2 || !schComposantAlerteLib(a) || !schComposantAlerteLib(c) || schComposantAlerteLib(b))
    throw new Error("clés feuille:id : " + [...SCH_LIB_ALERTE.compIds].join());
  // une feuille insérée devant, entre l'alerte et le clic : son R1 (même id 7) n'est pas visé
  const d = C("resistor", 10, 10, { id: 7, ref: "R9", csvPartName: "RES_0603_10K", symSch: "resistor.json" });
  const p0 = newPage("Zéro"); p0.comps = [d]; S.pages.unshift(p0); S.page++;
  S.hist.length = 0;
  window.CSV_LIB.push({ "Part Name": "AUTRE", "Manufacturer": "PAS_MOI" });
  if(schAppliquerMajLibTous({ genre: "fichier", nom: "resistor.json" }) !== 2 || b.manufacturer || d.manufacturer)
    throw new Error("la mise à jour touche une autre feuille : " + JSON.stringify([b, d]));
  if(S.hist.length !== 1) throw new Error("le lot doit tenir en une étape d'annulation : " + S.hist.length);
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
      "Number Of pins": "48",
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

  // la pose à la souris passe par schPoserDepuisCatalogue (09-interaction.js) : on l'appelle, au lieu de la recopier
  const el = addComp(S.place, 20 * G, 15 * G);
  el.rot = S.placeRot;
  schPoserDepuisCatalogue(el, S.placeLibItem);
  if(schTypeDuCatalogue(S.placeLibItem) !== "capacitor") throw new Error("type du catalogue : " + schTypeDuCatalogue(S.placeLibItem));
  // le catalogue réel écrit le symbole avec son chemin : « lib/symbole/regulator.json »
  if(schTypeDuCatalogue({"Part Name":"REG","Reference designator Prefix":"U","Empreinte Schématique":"lib/symbole/regulator.json"}) !== "regulator")
    throw new Error("chemin du symbole non retiré : " + schTypeDuCatalogue({"Empreinte Schématique":"lib/symbole/regulator.json"}));
  if(el.specs["Voltage Rating"] !== "10V" || el.manufacturer !== "Murata" || el.csvMpn !== "GCM155R71A104KA55D")
    throw new Error("enrichissement du catalogue : " + JSON.stringify(el));

  if(el.csvPartName !== "C0402_100NF") throw new Error("csvPartName non assigné: " + el.csvPartName);
  if(el.value !== "100nF") throw new Error("valeur non assignée: " + el.value);
  if(el.pkg !== "0402") throw new Error("boîtier non assigné: " + el.pkg);
  /* Claude pose la même ligne par cao_schema_dessiner : même composant qu'à la souris */
  const cmds={}, ancien=global.Pilote;
  global.Pilote={declarer(){return this;},capture(){return this;},commande(n,d){cmds[n]=d;return this;}};
  try{
    piloteCao("schema");
    const d=cmds.cao_schema_dessiner;
    const prop=d.proposer({lot:[{op:"poser",catalogue:"stm32f103c8t6",x:60,y:0}]});
    if(!/catalogue STM32F103C8T6, ic STM32F103 \(LQFP-48\)/.test(prop.apres))throw new Error("carte : "+prop.apres);
    d.appliquer({lot:[{op:"poser",catalogue:"C0402_100NF",x:60,y:0},{op:"poser",catalogue:"STM32F103C8T6",x:120,y:0}]});
    const c2=S.comps[S.comps.length-2], u=S.comps[S.comps.length-1];
    const garde=["type","value","pkg","csvPartName","csvMpn","manufacturer","simModel","specs"];
    if(JSON.stringify(garde.map(k=>c2[k]))!==JSON.stringify(garde.map(k=>el[k])))
      throw new Error("Claude et la souris ne posent pas le même composant : "+JSON.stringify([garde.map(k=>c2[k]),garde.map(k=>el[k])]));
    if(u.type!=="ic"||!/^U\d+$/.test(u.ref)||u.pkg!=="LQFP-48")throw new Error("CI du catalogue : "+JSON.stringify(u));
    if(u.npins!==48||pinsOf(u).length!==48)throw new Error("nombre de broches du catalogue : "+u.npins+", "+pinsOf(u).length);
    let m="";try{d.proposer({lot:[{op:"poser",catalogue:"INCONNU"}]});}catch(e){m=e.message;}
    if(!/absent du catalogue \(voir lib_composants\)/.test(m))throw new Error("Part Name inconnue : "+m);
    const lib=window.CSV_LIB; delete window.CSV_LIB;
    m="";try{d.proposer({lot:[{op:"poser",catalogue:"C0402_100NF"}]});}catch(e){m=e.message;}finally{window.CSV_LIB=lib;}
    if(!/catalogue n'est pas encore chargé/.test(m))throw new Error("catalogue absent : "+m);
    m="";try{d.proposer({lot:[{op:"poser",catalogue:"C0402_100NF",type:"resistor"}]});}catch(e){m=e.message;}
    if(!/un seul/.test(m))throw new Error("type et catalogue : "+m);
  }finally{global.Pilote=ancien;}
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
T("brochage : un repère que le PCB ne lit pas (espace, accent) est une erreur",()=>{
  sheet([C("resistor",2,2,{ref:"R 1"}),C("resistor",8,2,{ref:"Ré2"}),C("resistor",14,2,{ref:"R_3-a$"})],[]);
  const fautifs=brControles().filter(x=>x.niveau==="erreur"&&/^repère « /.test(x.texte)).map(x=>x.ref);
  if(fautifs.join()!=="R 1,Ré2")throw new Error("repères signalés : "+fautifs.join());
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
T("nomenclature .xlsx : trois onglets, CIP1 en tête, un repère par ligne, DNP en rouge",()=>{
  const v=variantesEssai();
  try{
    const f=bomXlsxFichiers(v.lite), par=n=>f.find(x=>x.name===n).text;
    for(const n of ["[Content_Types].xml","xl/workbook.xml","xl/styles.xml","xl/worksheets/sheet3.xml"])
      if(!f.some(x=>x.name===n))throw new Error(n+" absent");
    const wb=par("xl/workbook.xml");
    if(!/name="Presentation".*name="History".*name="BOM"/.test(wb))throw new Error("onglets : "+wb);
    const bom=par("xl/worksheets/sheet3.xml");
    if(bom.indexOf(">1st SOURCE P/N<")<0||bom.indexOf(">DESIGNATION<")<0)throw new Error("en-tête BOM incomplet");
    if(!/<row r="11">.*>CIP1</.test(bom))throw new Error("la ligne 11 doit être la carte nue (CIP1)");
    // R1..R4 en lignes 13 à 16, R2 et R4 non montés (style 6, rouge)
    const l=r=>(bom.match(new RegExp('<row r="'+r+'">.*?</row>'))||[""])[0];
    if(l(14).indexOf(">R2<")<0||l(14).indexOf("[Not Fitted]")<0||l(14).indexOf('s="6"')<0)throw new Error("R2 doit être [Not Fitted] en rouge : "+l(14));
    if(l(13).indexOf("[Not Fitted]")>=0||l(13).indexOf('s="6"')>=0)throw new Error("R1 est monté : "+l(13));
    if(l(17))throw new Error("4 repères, pas plus");
    if(bom.indexOf('<autoFilter ref="A12:N16"/>')<0)throw new Error("filtre attendu sur A12:N16");
    if(bomXlsxFichiers("")===null||bomXlsxNom(v.lite)!=="carteBOM-Lite.xlsx")throw new Error("nom : "+bomXlsxNom(v.lite));
    sheet([],[]);
    if(bomXlsxFichiers("")!==null)throw new Error("document vide : rien à exporter");
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
  for(const k of NET_CLASSES)if(h.indexOf("<option"+titreClasse(k)+">"+k+"</option>")<0)throw new Error("classe "+k+" absente");
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
T("classes d'interface : au menu du schéma, gardées dans le document et publiées au PCB",()=>{
  S.netClasses={};dom.session.clear();
  const h=netClassSelect("PIR_S");
  for(const k in CLASSES_INTERFACE)
    if(h.indexOf('<option title="'+CLASSES_INTERFACE[k].nom+'">'+k+"</option>")<0)
      throw new Error("interface "+k+" absente du menu, ou sans son nom long :\n"+h);
  SCHEMA_PATTERNS.poserClasse("PIR_S","ETH 100");
  try{
    if(S.netClasses.PIR_S!=="ETH 100")throw new Error("classe non gardée : "+S.netClasses.PIR_S);
    // le PCB la lit ici (schemaPublie → autoClass) et la crée aux règles de Rapide
    const pub=JSON.parse(sessionStorage.getItem("web_cao_netclasses")||"null");
    if(!pub||pub.PIR_S!=="ETH 100")throw new Error("publication au PCB : "+JSON.stringify(pub));
    // un schéma rouvert la garde
    loadDoc(JSON.parse(serialize()));
    if(S.netClasses.PIR_S!=="ETH 100")throw new Error("perdue à la réouverture : "+JSON.stringify(S.netClasses));
  }finally{
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

/* ==========================================================================
   Contraintes de nets pour le PCB (27-contraintes.js)
   ========================================================================== */
function scmFeuille(){
  const r1=C("resistor",0,0,{ref:"R1"}), r2=C("resistor",6,0,{ref:"R2"}), r3=C("resistor",12,0,{ref:"R3"});
  const a=allPins(r1)[1], b=allPins(r2)[0], c=allPins(r2)[1], d=allPins(r3)[0];
  sheet([r1,r2,r3],[{x1:a.x,y1:a.y,x2:b.x,y2:b.y,net:"CLK"},{x1:c.x,y1:c.y,x2:d.x,y2:d.y,net:"DATA"}]);
  S.contraintes={nets:{},groupes:[]};
}
T("contraintes de nets : saisie bornée comme au PCB",()=>{
  scmFeuille();
  schCmPoser("CLK","z","50");schCmPoser("CLK","zTol","5");schCmPoser("CLK","lMax","40,5");
  schCmPoser("CLK","topo","chaine");schCmPoser("CLK","ordre","R1 > R2");schCmPoser("CLK","couches","1, 4");
  schCmPoser("CLK","stubMax","0");
  const r=schCmModele().nets.CLK;
  const att={z:50,zTol:5,lMax:40.5,couches:[0,3],topo:"chaine",ordre:["R1","R2"],stubMax:0};
  if(JSON.stringify(r)!==JSON.stringify(att))throw new Error(JSON.stringify(r));
  schCmPoser("CLK","z","abc");
  if("z" in schCmModele().nets.CLK)throw new Error("une saisie illisible efface le champ");
  schCmPoser("CLK","lMax","1e9");
  if("lMax" in schCmModele().nets.CLK)throw new Error("hors bornes : écarté");
  for(const k of ["zTol","couches","topo","ordre","stubMax"])schCmPoser("CLK",k,"");
  if(schCmModele().nets.CLK)throw new Error("un net sans contrainte disparaît de la table");
});
T("contraintes de nets : dans le document, l'aller-retour et l'annulation",()=>{
  scmFeuille();
  schCmPoser("CLK","lMax","30");
  const js=serialize();
  if(JSON.parse(js).contraintes.nets.CLK.lMax!==30)throw new Error("absent de serialize()");
  if(schDocCourant().contraintes.nets.CLK.lMax!==30)throw new Error("absent du document enregistré");
  schCmPoser("CLK","lMax","10");
  undo();
  if(schCmModele().nets.CLK.lMax!==30)throw new Error("Ctrl+Z doit rendre 30 mm");
  /* un document retouché à la main est borné à la lecture */
  const doc=JSON.parse(js);
  doc.contraintes={nets:{CLK:{lMax:-3,viasMax:"2"},X:"n'importe quoi"},groupes:[{nom:"G",nets:["CLK","DATA"],tol:"x"}]};
  loadDoc(doc);
  const C2=schCmModele();
  if(JSON.stringify(C2.nets)!=='{"CLK":{"viasMax":2}}')throw new Error(JSON.stringify(C2.nets));
  if(C2.groupes.length!==1||C2.groupes[0].tol!==0.5)throw new Error(JSON.stringify(C2.groupes));
  loadDoc({format:"schemedit-2",pages:[{name:"Feuille 1",comps:[],wires:[]}]});
  if(Object.keys(schCmModele().nets).length||schCmModele().groupes.length)
    throw new Error("un document sans contraintes n'en hérite pas du précédent");
});
T("contraintes de nets : groupes d'appariement, nets disparus, résumé",()=>{
  scmFeuille();
  const noms=schCmNetsNommes().map(n=>n.name);
  if(noms.indexOf("CLK")<0||noms.indexOf("DATA")<0)throw new Error("nets nommés : "+noms.join(" "));
  if(schCmGroupeCreer("seul",["CLK"],"mm",1))throw new Error("un groupe demande deux nets");
  const g=schCmGroupeCreer("BUS",["CLK","DATA"],"ps",15);
  if(!g||g.mode!=="ps"||g.tol!==15)throw new Error(JSON.stringify(g));
  /* tolérance vide (null ou "" du champ) : le défaut, pas ± 0 ; un 0 saisi reste 0 */
  const tols=[[null,"mm"],["","mm"],[null,"ps"],["","ps"],["0","mm"],[2,"mm"]].map(([t,m])=>{
    const x=schCmGroupeCreer("T",["CLK","DATA"],m,t);schCmGroupeSupprimer(x.id);return x.tol;});
  if(tols.join()!=="0.5,0.5,10,10,0,2")throw new Error("tolérances : "+tols.join());
  schCmGroupeModifier(g.id,x=>{x.ref="DATA";});
  if(schCmModele().groupes[0].ref!=="DATA")throw new Error("référence");
  schCmPoser("CLK","z","50");schCmPoser("CLK","topo","p2p");
  const r=schCmResumeNet("CLK");
  if(!/50 Ω/.test(r)||!/point à point/.test(r)||!/groupe BUS/.test(r))throw new Error(r);
  schCmPoser("ANCIEN","lMax","5");
  const o=schCmOrphelins();
  if(o.nets.join()!=="ANCIEN")throw new Error("net disparu : "+JSON.stringify(o.nets));
  schCmGroupeSupprimer(g.id);
  if(schCmModele().groupes.length)throw new Error("groupe non supprimé");
  schCmOuvrir("CLK");
  try{
    if(SCM.filtre!=="CLK")throw new Error("la fenêtre s'ouvre filtrée sur le net");
  }finally{schCmFermer();}
  S.contraintes={nets:{},groupes:[]};
});
T("canal de pilotage : cao_classes_ecrire et cao_contraintes_ecrire au schéma, un lot une étape",()=>{
  const cmds={}, ancien=global.Pilote;
  global.Pilote={declarer(){return this;},capture(){return this;},commande(n,d){cmds[n]=d;return this;}};
  try{
    piloteCao("schema");
    scmFeuille();
    S.netClasses={};S.contraintes={nets:{},groupes:[]};S.hist.length=0;
    const K=cmds.cao_classes_ecrire, C=cmds.cao_contraintes_ecrire;
    const pk=K.proposer({lot:[{action:"affecter",net:"CLK",classe:"horloge"}]});
    if(!/net CLK, classe : Horloge/.test(pk.apres)||S.netClasses.CLK)throw new Error("carte des classes : "+pk.apres);
    K.appliquer({lot:[{action:"affecter",net:"CLK",classe:"horloge"}]},pk);
    if(S.netClasses.CLK!=="Horloge"||S.hist.length!==1)throw new Error("classe non posée en une étape");
    const lot=[{action:"net",net:"CLK",z:50,l_max:40,couches:[1,4],topologie:"chaine",ordre:["U1","U2"]},
               {action:"net",net:"DATA",vias_max:2}];
    const pc=C.proposer({lot});
    if(!/contraintes CLK : z 50, l_max 40, couches 1,4, topologie chaine, ordre U1 → U2/.test(pc.apres))throw new Error("carte : "+pc.apres);
    C.appliquer({lot},pc);
    const n=schCmModele().nets;
    if(n.CLK.z!==50||n.CLK.couches.join()!=="0,3"||n.CLK.topo!=="chaine"||n.DATA.viasMax!==2||S.hist.length!==2)
      throw new Error("contraintes : "+JSON.stringify(n));
    undo();
    if(schCmModele().nets.CLK)throw new Error("Ctrl+Z ne remet pas les contraintes");
    const refus=(cmd,l,motif)=>{let m="";try{cmd.proposer({lot:l});}catch(e){m=e.message;}if(!motif.test(m))throw new Error("refus attendu "+motif+" : "+m);};
    refus(K,[{action:"affecter",net:"NUL",classe:"RF"}],/inconnu : un net nommé/);
    refus(K,[{action:"affecter",net:"CLK",classe:"Licorne"}],/inconnue du schéma/);
    refus(K,[{action:"creer",nom:"X"}],/seule l'action « affecter »/);
    refus(C,[{action:"paire",nom:"USB"}],/règles de paire sont au PCB/);
    refus(C,[{action:"net",net:"CLK",couches:["Top"]}],/rangs de couche/);
    refus(C,[{action:"net",net:"CLK",l_min:5,l_max:2}],/l_min plus grand/);
    refus(C,[{action:"net",net:"CLK",topologie:"anneau"}],/p2p, chaine, etoile, flyby/);
  }finally{global.Pilote=ancien;S.netClasses={};S.contraintes={nets:{},groupes:[]};}
});

(async()=>{
  for(const [name,fn] of T_ASYNC){
    try{await fn();console.log("  ok  "+name);ok++;}
    catch(e){console.log("  KO  "+name+" → "+e.message+"\n"+(e.stack||"").split("\n")[1]);ko++;}
  }
  console.log("\n"+ok+" essais réussis, "+ko+" en échec.");
  process.exit(ko?1:0);
})();


