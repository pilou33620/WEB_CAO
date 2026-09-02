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
          stackup:"Empilage physique",dpair:"Paires différentielles",
          sim:"Simulation EM"},
  canvasId:"board"
});
const realCanvas=dom.realCanvas;
const ctxStub=dom.ctxStub;
const listeners=dom.listeners;
function noop(){}

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

const code=fs.readFileSync(path.join(__dirname,"..","dist","pcb.js"),"utf8");
const EXPOSE=["S","conn","draw","init","importNetlist","setCuCount","setMode","startRoute",
  "updateRoute","stepRoute","commitRoute","routeToLayer","runDrc","buildTabs",
  "buildLayers","refreshPanels","buildList","buildProps","clearSel","rotateSel",
  /* sélection multiple : les groupes du panneau Propriétés */
  "mpOuvert","mpRaz","mpIdx","mpSection","mpRangs","MP_MIX",
  /* nature d'un via : traversant, borgne dessus/dessous, enterre */
  "VIA_KINDS","viaKindOf","viaKindTxt","viaKindsAvail","viaSetKind","viaBuild","fabBase",
  "flipSel","push","undo","redo","touch","padsWorld","cuId","serialize","loadDoc","exportPng",
  "setFlip","setContrast","autoPlace","conn","netTable","fit","zoneClick","zoneMove",
  "closeZone","fullBoardZone","zoneMask","labelMask","maskAt","classOf","setNetClass","defaultWidth",
  "clrPair","applyClasses","jointAt","splitTrack","netTracks","selectNetRouting",
  "deleteNetRouting","autoClass","mkFp","w2s","runDrc","padsOf",
  "buildFabFiles","gerberCopper","gerberMask","gerberPaste","gerberSilk",
  "gerberEdge","gerberOutline","ipcNetlist","masterDrawingPdf","noAcc",
  "drillFile","maskOpenings","pasteOpenings","textStrokes","crc32","zipBlob","exportFab",
  "positionsCsvText","bomPcbCsvText","pcbCsvCell",
  "edgeClick","edgeMove","closeEdge","boardPoly","setBoardSize","setBoardRect","inBoard",
  "boardChanged","polyEdgeDist","segDist","orient","signedArea",
  "coordOpen","coordClose","coordApply","coordMode","coordPoint","coordAnchor",
  "placeOrigin","ux","uy","wxu","wyu","snapX","snapY","gOrigin","routeToPoint","hint",
  "pushClear","magnet","projOnSeg","mitreSel","mitreAt","collinearRun","runFrom","segClearBad","setActive","segSegDist","segCross","routeBad","focusNet","cancelRoute","updateRoute","classOf","syncAutoZones","detachAuto","zoneCanvas","inPoly","hitTest","px","dist","boardZonePts",
  "selectLayerZones","zoneUnder",
  /* repérage commun : chercher un repère, mesurer une distance
     (commun/reperage.js + le module d'adaptation de l'éditeur) */
  "cv",
  "RP","rpInit","rpMesClic","rpMesBouge","rpMesRaz","rpMesEnCours","rpMesPaire",
  "rpMesCotes","rpMesLecture","rpMesDire","rpMesTrace","rpRang","rpTrouve",
  "rpQBuild","rpQOuvrir","rpQFermer","rpQAller","rpQBascule","rpCadrer","rpNetBox",
  "RP_PCB",
  /* session d'onglet commune (commun/session.js) */
  "sessBrancher","sessEnregistrer","sessLire","sessEcrire","sessEffacer",
  "sessPoids","sessTient","sessUrl","sessAller","sessQuitte","sessAutonome",
  "sessBarre","sessionPcb","SESS_CLE","SESS_MAX",
  "sessCibleEcrire","sessCiblePrendre","pcbSonde","pcbSonderCible",
  "sessCibleAuChargement","sessCanalDispo","sessMontrerAilleurs",
  "sessEcouterProbe","SESS_CANAL","pcbMontrerAilleurs","pcbCibleTrouver",
  "pcbCibleAller",
  /* espace de travail commun (commun/workspace.js) */
  "wsDefault","wsApply","wsMove","wsPlaceOf","wsLabel","wsToggleFloat",
  "wsToggleCollapse","wsClose","wsShow","wsMenuBuild","wsLoad","wsSave","wsEl","WS_KEY",
  "WS_SECTION",
  /* profils utilisateur communs (commun/profils.js) */
  "profNom","profListe","profChoisir","profCreer","profSupprimer","profLire",
  "profEcrire","profOublier","profRecents","profNoterDocument","profNomValide",
  "profEtat","profSurChangement","profSurListe","profBarre","PROF_CLE",
  /* réglages d'affichage propres à l'utilisateur (16-profil.js) */
  "profilEtat","profilNoter","profilAppliquer",
  "esc","fmt","$",
  /* empilage physique et rôles de couche */
  "stackDefaults","stackResize","stackRows","rowT","stackTotal","stackLam",
  "stackCuT","stackDiT","stackSpan","stackFit","stackSym","stackMirror",
  "worstAspect","applyPreset","presetsFor","diCount","cuT","diAt","maskFaces",
  "stackAsym","asymLabel","viaBuild","viaCensus","aspectOf","viaTented",
  "VIA_FINISH","roleCheck","ASPECT_WARN","ASPECT_MAX",
  "umLabel","ozLabel","buildStackup","stackReport","r3","padLayers","segPadDist",
  "normStack","stkPick","CU_ROLES","CU_ROLE_SHORT","rolePlane",
  "layerRole","roleLabel","setLayerRole","coherentRole","roleFromPlane",
  "roleNet","STACK_PRESETS","FINISHES","MASK_COLORS","DI_KIND","OZ","r4",
  /* sélection multiple et presse-papier */
  "selectHit","toggleHit","altTarget","selCount","trackRun","selectRun","deleteSel","unrouteSel","copySelPcb","cutSelPcb",
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
  "dpBack","drawDp","dpCoupling","dpDrc","dpMakePair","dpFromSel","dpAutoAll","dpDelete",
  "dpNetFree","dpNetOpts","dpMateGuess",
  "dpPanelRule","dpMaterialize","dpFigure","dpLayerCells","buildDiffPairs",
  /* ligne de transmission : impédance, retard, C et L de la sélection */
  "LT_C0","LT_KIND","ltEeff","ltZ0","ltSeg","ltVia","ltLine",
  "ltT","ltC","ltL","ltRange","ltTable","ltSection","propsTrack","propsTracks",
  "dpLayerEdit",
  /* cartes d'exemple (17-exemples.js) */
  "EXEMPLES","exemple1","exemple2","exCharger","exOuvrir","exDoc","exPlane",
  "exFp","exPin","exWire","exVia","exStub","exPair","exPower",
  /* rendu et fusion des lignes droites */
  "drawTracks","sameLine","routeVia",
  /* géométrie du tracé 45° et posture du coude */
  "route45","routeCorner","minJog","autoPosture","routePosture","dir8",
  "angleOff","angleOk","angleDeg","ANG_TOL","DIR8","tendMagnet",
  "cornerMode","setCornerMode","CORNER_MODES","MITRE_AUTO",
  /* anti-collision et ménage du dépôt */
  "moveClearBad","pruneHooks","pruneDeadTracks","hookAt","endFar","endDir",
  "diagTracks","mitreAfterDrag","chamferPosed","pruneAfterDrag",
  /* moteur de routage : géométrie (10-pns-geom) et modèle du monde (11-pns-node) */
  "pnsOnEdge","pnsInHull","pnsSegPolyHits","pnsSegs","pnsPts","pnsLen",
  "pnsSimplify","pnsSplice","pnsDirOk","pnsIs45","pnsSnap45","pnsSnap45One",
  "PNS_CELL","PNS_EPS","PNS_MARGIN","pnsItemPad","pnsItemVia","pnsItemSeg",
  "pnsItemTrack","pnsMaxClr","pnsClr","pnsGap","pnsPairGap",
  "pnsNode","pnsBuild","pnsWorld","pnsInvalidate","pnsStamp","pnsHullOct",
  "PNS_D8","PNS_D4","pnsSupPad","pnsSupVia","pnsSupSeg","pnsPlaneMeet","pnsOct","pnsUnloop",
  "PNS_WALK_MAX","pnsSurCarte","pnsHullWalk","pnsWalkCross","pnsWalkSide","pnsWalkaround","routeSegsTo",
  "PNS_SHOVE_MAX","PNS_SHOVE_RANG","pnsPushOut","pnsShoveAside","pnsRelink","pnsShoveVia",
  "pnsShove","pnsShoveHeads","pnsApply","pnsSlideOut","pnsBoutsLibres","crossN","ROUTE_MODES","routeMode","setRouteMode","pushSnap","drawShove",
  "placeVia","mkVia","viaObstacle","viaIsole","viaTrou","viaPaire","dpViaGap","holeClr","viaDrill","pnsItemVia","pnsPairGap","pnsWorld","pnsClr","pnsLineItems","pnsViaEscape","pnsViaSuites","pnsPointEscape","dpNets","dpLine","dpAxis","dpAxisDirect","dpPose",
  "PNS_OPT_WIN","pnsAnchors","pnsMergeTry","pnsOptimize","routeOptimizeTail",
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
  "fpMoveMark","fpSetMarkD","fpXform","feZoom","feRefit","feReattach",
  /* matrice des natures de cuivre et éditeur de règles */
  "DRC_KINDS","DRC_ORDER","DRC_KIND_NAME","matKey","matHas","matGet","matSet",
  "matMax","matEff","clrK","dpGapPair","dMat","pnsKind","pnsClrPair",
  "defClass","maxClr","FALLBACK_CLASS",
  "RE_TREE","RE_MATCH","RE_PAGE","reIsOpen","reOpen","reClose","reGo",
  "reSync","reTree","reBind","reTitle","reCat","reFindings","reMatrix","reObj",
  "figClr","figWidth","figVia","figHole","figAspect","figTherm","figEdge","figMask",
  "figShort","figClass","figBoard","reHoleCase","reDimHSoft","reFact","reClassTable",
  "reClassSel","reFinishSel","aspWarn","aspMax","ASPECT_WARN","ASPECT_MAX",
  /* pistes circulaires : l'arc rangé comme une piste de plus */
  "ARC_MIN","ARC_MAX","ARC_SAG","isArc","arcOf","arcSweep","arcOn",
  "trkLen","trkAt","trkMid","trkDist","trkBBox","trkSegs","trkPath",
  "normTrack","gTrk","pnsItemsTrack",
  /* nom de projet commun (commun/projet.js) et nommage des exports */
  "projNom","projOuvrir","projFermer","projDoc","projListe","projOublier",
  "projNomValide","projSurChangement","projPeindre","PROJ_CLE",
  "pcbProjNom","fabBase","fabDocNum","pcbFile",
  /* dossier de projet sur le disque (commun/projet-disque.js) */
  "projdEtat","projdLie","projdChemin","projdRevision","projdAuteur",
  "projdNomDoc","projdNeuf","projdAdopter","projdDetacher","PROJD_FORMAT",
  /* simulation EM : la masse de référence, l'écart par côté, le découpage en
     plages, la couture de vias (commun/simulation-em.js + 19-simulation.js) */
  "SIM","SIM_PCB","simRefSet","simRefListe","simRefCandidats",
  /* chute continue : les deux bornes, le cuivre du net, les vias */
  "SIM_DCB","simDCClic","simDCPolysPiste","simDCPolyPastille",
  "simDCHauteurVia","simDCBornePastille","simDCCercle",
  "simTableauVias","simDesequilibreVias","SIM_DC_VIAS_MAX",
  "simCorpsDC","simBrancherDC","simRendreDC","simDCArmer",
  "simDCCouleur","simDCConstruireImages","simDCTrace","simDCActif",
  "simDCEchelle","SIM_DC_RAMPE","SIM_DC_GRANDEURS","simDCGrandeur",
  "simDCRepeindre","simTableauPire","simCarteDCListe","simTableauBornes",
  "simDCLancer","simRendreBornes","SIM_ANALYSES","simRendre","simAnalyse",
  "simDCFinesse","simDCCuivrePris","SIM_DC_CARREAUX_MINI",
  "simDCIndexer","simDCNoeudEn","simDCLireEn","simDCSurvol",
  "simDCTraceSonde",
  "SIM_DC_NOEUDS_CIBLE",
  "simRefCandidatsPcb","simPlagesDe","simMemeEcart","simZoneEn","simCoteEn",
  "simEcartsA","simPlages","simSegments","simCouturePcb","simEspacement",
  "simAccrocherVias","simViaAuRaccord","stackSpan",
  /* Le rangement de la selection en parcours, et ce que la marche n'a pas
     pu trancher. */
  "simChainerPcb","SIM_CHAINE_PCB","SIM_TOL_VIA",
  /* Les lots : un document par parcours continu de la selection. */
  "simLotsDeTracks","SIM_LOTS_MAX","simDocPcb","simPortee",
  /* Le voisinage : le cuivre qui longe la selection, et les paires declarees.
     Sans eux, ni Z differentielle ni crosstalk -- l'autre moitie d'une paire
     et l'agresseur ne sont jamais dans la selection. */
  "simVoisinagePcb","simPairesPcb","SIM_ECART_COUPLAGE",
  "SIM_VOISINAGE_MAX","trkSegs","trkBBox",
  /* L'onglet de Z differentielle (commun/simulation-em.js). */
  "simCouplage","simCouplagePaires","simFicheDiff",
  "simCorpsDiff","simRendreDiff",
  /* Le seuil qui juge le crosstalk -- pourcentage ou millivolts -- et la
     tension qui convertit un rapport en volts. */
  "simSeuilFraction","simSeuilNom","simTension",
  "simDocFinir",
  /* Les DEUX cartes de chaleur, et ce qui les colore. `simCarteSegment` est
     le seul point par lequel un canevas apprend ce qu'il peint. */
  "simCarteQuoi","simCarteActive","simCarteSegment","simCarteRetenir",
  "simChaleurRes","simChaleurLots","simCouleurBande","simZCouleur",
  "simZSegment","simZActif","simZVerdict","simZTolAbs",
  "simZDiffCouleur","simZDiffTolAbs","simZDiffVerdict",
  "simCarteDiffPartenaire","simCarteDiffLegende",
  /* Le voile : ce qui n'est pas dans la simulation s'estompe. */
  "simVoileActif","SIM_VOILE_ALPHA",
  /* Choisir sa paire a la main plutot que de la laisser deviner. */
  "simPaireCandidats","simPaireSoi","simPaireEcrire","simDocFinir",
  "simCoupleSection","simCoupleSections",
  "SIM_UNITES_TR","SIM_UNITES_V","simUniteTr","simUniteV","simBruitAbsEcrire",
  "simLotsPeints","simLotsMultiples","simPourChaqueLot","simLotMirroir",
  "simLotBilan","simTableauLots","simOublierRes",
  "simDiscontinuites","simCoteSource",
  /* CROSSTALK : COMBIEN une voisine prend -- en pour-cent, en decibels et en
     VOLTS -- et OU, le long du parcours, cela se fabrique. Section entiere -- l'etat, les commandes, la fiche, la
     carte, le profil d'espacement et son recoupement -- plus les trois
     mesures que seule la page peut faire : les positions de couture, les
     fentes du plan, les vias de masse. */
  "SIM_XT","SIM_XT_ROUTE","SIM_XT_FORMAT","SIM_XT_SENS","SIM_XT_FENETRES",
  "simCorpsCrosstalk","simRendreCrosstalk","simXtReglages","simXtVitesses",
  "simXtVitessesRefusees",
  "simXtCarte","simXtReduire","simXtCouleur","simXtTableauCandidats","simXY",
  "simXtTableauCouples","simXtValidation","simXtMasse","simXtBandeau",
  "simXtAvertissements","simXtMapping","SIM_XT_COLONNES",
  "simXtReduireEsp","simXtTraitEspacement","simXtBoutonEspacement",
  /* La figure : une fiche par victime, l'echantillonnage commun aux trois
     blocs, les cases a cocher, la reglette et sa lecture chiffree. */
  "simXtFiches","simXtEchant","simXtEchantEsp","simXtCoches",
  "simXtLectureLignes","simXtCurseurPoser","SIM_XT_IDENT",
  /* Le cuivre : la chaleur peinte le long des victimes, et le point de la
     reglette qui s'y promene. */
  "simXtVictimesVoulues","simXtVictimesVues","simXtProjVictimes",
  "simXtCurseurPoints","simXtCurseurAgresseur","simXtPos","simXtGeomBrute",
  "simXtCourbeDe","simXtValeurA","simXtPeindreChaleur","simXtPeindreCurseur",
  "simXtCouleurVictime","simXtSurCuivre","simXtCorridor","simXtBoutonChaleur",
  "SIM_XT_RAMPE","simXtPct","simXtTension",
  /* Le repli des reglages : il vaut pour toutes les analyses, il vit donc
     dans les onglets et non dans un corps. */
  "simOnglets","simPoser","simPlierAppliquer","simCorps",
  "simXtDesaccords","simXtBoutonRisques","simXtZonesFondues",
  "simXtNiveau","simXtRatio","simXtResume","simXtReserves","simXtRepli",
  "simXtRapportTexte","simXtExportRapport","simXtActions","simXtMethode",
  "simXtBandeDite",
  "simXtSensBrancher",
  /* Les zones a risque, posees sur le cuivre : l'algorithme est commun,
     l'outil ne fournit que les deux formes neutres. */
  "simXtRisques","simXtRisqueGeom","simXtRisqueTraits","simXtProjParcours",
  "simXtRisqueCouleur","simXtRisqueTrace","simXtGeometriePcb","simXtPolyDe",
  "SIM_XT_PAS_TRAIT",

  "simXtParcours","simXtAbscisse","simXtCouture","simXtFentes",
  "simXtViasMasse","simXtPlanDe","simXtZoneMasse","SIM_XT_PAS",
  "simXtProbleme","simRefSet",
  /* Le chemin de retour a son propre onglet : « Current Return Path ». */
  "simFicheRetour","simRendreRetour","simCorpsRetour","simViaNotes",
  "SIM_FAMILLES","simCheveluRes",
  "simRetourNotes",
  "simSaisie","simSaisieEcrire","simUnite",
  /* DEUX UNITES DE BANDE, une par borne : le panneau les a separees, et cette
     liste nommait encore l'unique `simUniteBande` d'avant -- elle faisait
     donc echouer le CHARGEMENT du banc entier, pas un cas. */
  "simUniteBande1","simUniteBande2",
  "simUniteChanger","simCorpsImpedance","simEl","SIM_UNITES",
  /* Le chemin de retour et son chevelu. */
  "simBoucleVias","simMutuelleVia","simGroverF","simResoudre",
  "simVoisinageVia","simChevelu","simRetourActif","simCotesVia",
  "simAntipadVia","simPlansRef","simPlansJoints","simPlansOntUnNet",
  "simRetourCouleur","SIM_RAYON_RETOUR",
  "simPontsPlans","SIM_RAYON_PONT",
  "simProjU","simTangente","simStackup","simCuIndex",
  "SIM_ECART_MAX","SIM_COULOIR","SIM_PLAGE_MIN","SIM_PAS"];
/* WS est réassigné par « Réinitialiser la disposition » : on l'expose en
   accesseur pour que le banc d'essai voie toujours l'objet courant. */
eval(code.replace(/^"use strict";/,"")+"\n"
     +EXPOSE.map(n=>"globalThis."+n+"="+n+";").join("\n")+"\n"
     +'Object.defineProperty(globalThis,"WS",'
     +'{get:()=>WS,set:v=>{WS=v;},configurable:true});'
     /* SESS_QUITTE bascule à la sortie vers un autre outil : le banc
        d'essai doit pouvoir le remettre à zéro entre deux essais */
     +'Object.defineProperty(globalThis,"SESS_QUITTE",'
     +'{get:()=>SESS_QUITTE,set:v=>{SESS_QUITTE=v;},configurable:true});'
     /* RE, l'état de la fenêtre des règles : en accesseur lui aussi, pour
        qu'un essai puisse le remettre à l'état où il est au démarrage —
        pas encore initialisé — et vérifier que rien n'en dépend. */
     +'Object.defineProperty(globalThis,"RE",'
     +'{get:()=>RE,set:v=>{RE=v;},configurable:true});');

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
  if(h.inside)throw new Error("le contour est une prise franche, pas un repli");
});
/* Le plein d'une zone la désigne aussi — c'est la seule prise qu'offre un plan
   pleine carte — mais en dernier ressort, et marqué : le clic ne tranche qu'au
   relâchement, pour que le lasso tiré au-dessus d'un plan reste possible. */
T("sélection par le plein, en dernier ressort",()=>{
  const z=S.zones[0];
  const mx=(z.pts[0].x+z.pts[2].x)/2, my=(z.pts[0].y+z.pts[2].y)/2;
  const inside=hitTest(mx,my);
  if(!inside||inside.zone!==z)throw new Error("le plein devrait désigner la zone");
  if(!inside.inside)throw new Error("une prise par le plein doit s'annoncer comme telle");
  // ce qui est posé par-dessus garde la priorité
  const onEdge=hitTest(z.pts[0].x,z.pts[0].y);
  if(onEdge.inside)throw new Error("le contour passe avant le plein");
  // zones masquées : rien à attraper
  S.show.plane=false;
  if(hitTest(mx,my))throw new Error("zones masquées : le plein ne doit rien rendre");
  S.show.plane=true;
});
T("le cuivre d'une couche se prend par sa couche",()=>{
  const z=S.zones[0], act=S.active;
  clearSel();
  selectLayerZones(z.l);
  if(!S.sel.zones.has(z))throw new Error("selectLayerZones devrait prendre la zone");
  const seules=S.zones.filter(o=>o.l===z.l).length;
  if(S.sel.zones.size!==seules)throw new Error("toutes les zones de la couche, et elles seules");
  clearSel();S.active=act;
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
  reSync();
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
/* Décor de la prise à la piste entière : une piste en L sur la couche du
   dessus, avec un embranchement, qui plonge par un via vers un segment de la
   couche 1 ; à côté, un morceau d'un autre net qui ne doit jamais suivre. */
function pisteDeuxCouches(){
  setCuCount(4);
  S.fps=[];S.tracks=[];S.vias=[];touch();
  const a ={l:0,net:"T",w:0.3,x1: 0,y1:0, x2:10,y2: 0};
  const b ={l:0,net:"T",w:0.3,x1:10,y1:0, x2:20,y2: 0};
  const c ={l:0,net:"T",w:0.3,x1:20,y1:0, x2:20,y2:10};   // vers le via
  const br={l:0,net:"T",w:0.3,x1:20,y1:0, x2:30,y2: 0};   // embranchement
  const d ={l:1,net:"T",w:0.3,x1:20,y1:10,x2:30,y2:10};   // de l'autre côté du via
  const o ={l:0,net:"U",w:0.3,x1: 0,y1:5, x2:10,y2: 5};   // net voisin
  S.tracks.push(a,b,c,br,d,o);
  const v={x:20,y:10,d:0.6,h:0.3,a:0,b:3,net:"T"};
  S.vias.push(v);touch();
  setMode("select");S.active=0;clearSel();
  return {a,b,c,br,d,o,v};
}
T("Maj+clic prend la piste entière sur sa couche",()=>{
  const {a,b,c,br,d,o}=pisteDeuxCouches();
  fire("pointerdown",Object.assign(sc(15,0),{shiftKey:true}));
  fire("pointerup",Object.assign(sc(15,0),{shiftKey:true}));
  for(const [nom,t] of [["a",a],["b",b],["c",c],["embranchement",br]])
    if(!S.sel.tracks.has(t))throw new Error(nom+" devait entrer dans la sélection");
  if(S.sel.tracks.has(d))throw new Error("la couche d'en dessous ne se prend qu'au doublé");
  if(S.sel.tracks.has(o))throw new Error("le net voisin n'a rien à faire dans la sélection");
  if(S.sel.vias.size)throw new Error("le via tient la piste à l'autre couche : pas au premier clic");
  if(S.sel.tracks.size!==4)throw new Error("4 segments attendus, "+S.sel.tracks.size);
});
T("le doublé Maj+clic étend la piste à toutes les couches",()=>{
  const {a,b,c,br,d,o,v}=pisteDeuxCouches();
  const clic=()=>{
    fire("pointerdown",Object.assign(sc(15,0),{shiftKey:true}));
    fire("pointerup",Object.assign(sc(15,0),{shiftKey:true}));
  };
  clic();clic();
  for(const [nom,t] of [["a",a],["b",b],["c",c],["embranchement",br],["couche 1",d]])
    if(!S.sel.tracks.has(t))throw new Error(nom+" devait entrer dans la sélection");
  if(S.sel.tracks.has(o))throw new Error("le net voisin n'a rien à faire dans la sélection");
  if(!S.sel.vias.has(v))throw new Error("le via qui relie les deux couches devait suivre");
  if(S.sel.tracks.size!==5)throw new Error("5 segments attendus, "+S.sel.tracks.size);
});
T("Maj+clic remplace la sélection, Ctrl+Maj l'y ajoute",()=>{
  const {a,o}=pisteDeuxCouches();
  S.sel.tracks.add(o);
  fire("pointerdown",Object.assign(sc(15,0),{shiftKey:true}));
  fire("pointerup",Object.assign(sc(15,0),{shiftKey:true}));
  if(S.sel.tracks.has(o))throw new Error("Maj seul repart d'une sélection vide");
  clearSel();S.sel.tracks.add(o);
  fire("pointerdown",Object.assign(sc(15,0),{shiftKey:true,ctrlKey:true}));
  fire("pointerup",Object.assign(sc(15,0),{shiftKey:true,ctrlKey:true}));
  if(!S.sel.tracks.has(o))throw new Error("Ctrl+Maj devait garder ce qui était pris");
  if(!S.sel.tracks.has(a))throw new Error("Ctrl+Maj devait ajouter la piste entière");
});
/* Le cas qui manquait : la piste change de couche, revient, et repart. Le
   parcours doit franchir autant de vias qu'il en rencontre — s'arrêter au
   premier laissait le bout du dessus derrière. */
function pisteAllerRetour(){
  setCuCount(2);
  S.fps=[];S.tracks=[];S.vias=[];touch();
  const A={l:0,net:"T",w:0.3,x1: 5,y1:5,x2:15,y2:5};
  const B={l:1,net:"T",w:0.3,x1:15,y1:5,x2:25,y2:5};
  const C={l:0,net:"T",w:0.3,x1:25,y1:5,x2:35,y2:5};
  const D={l:1,net:"T",w:0.3,x1:35,y1:5,x2:45,y2:5};
  S.tracks.push(A,B,C,D);
  const v1={x:15,y:5,d:0.8,h:0.4,a:0,b:1,net:"T"};
  const v2={x:25,y:5,d:0.8,h:0.4,a:0,b:1,net:"T"};
  const v3={x:35,y:5,d:0.8,h:0.4,a:0,b:1,net:"T"};
  S.vias.push(v1,v2,v3);touch();
  setMode("select");S.active=0;clearSel();
  return {A,B,C,D,v1,v2,v3};
}
T("le doublé franchit tous les vias, pas seulement le premier",()=>{
  const {A,B,C,D}=pisteAllerRetour();
  const r=trackRun(A,true);
  for(const [nom,t] of [["dessus 1",A],["dessous 1",B],["dessus 2",C],["dessous 2",D]])
    if(!r.tracks.has(t))throw new Error(nom+" manque : la piste s'est arrêtée en route");
  if(r.vias.size!==3)throw new Error("les 3 vias de passage devaient suivre, "+r.vias.size);
});
T("le doublé part aussi bien du bout que du milieu de la piste",()=>{
  const {A,C,D}=pisteAllerRetour();
  for(const [nom,dep] of [["du milieu",C],["de la fin",D]]){
    const r=trackRun(dep,true);
    if(r.tracks.size!==4)throw new Error("en partant "+nom+" : 4 segments attendus, "+r.tracks.size);
    if(!r.tracks.has(A))throw new Error("en partant "+nom+" : le tout premier bout manque");
  }
});
/* Un bout posé dans le cuivre du via sans tomber pile sur son axe y est relié
   pour de bon — la connectivité le dit, la sélection doit le dire aussi. */
T("un via franchit même si les bouts ne tombent pas sur son axe",()=>{
  const {A,B,C,v2}=pisteAllerRetour();
  v2.x=25.2;v2.y=5.15;touch();                 // via décalé, mais toujours dessus
  const r=trackRun(A,true);
  if(!r.tracks.has(C))throw new Error("le bout d'après le via décalé manque");
  if(!r.vias.has(v2))throw new Error("le via décalé devait entrer dans la sélection");
  if(!r.tracks.has(B))throw new Error("le dessous ne devait pas se perdre au passage");
});
T("un via posé au milieu d'une ligne relie quand même",()=>{
  setCuCount(2);
  S.fps=[];S.tracks=[];S.vias=[];touch();
  const A={l:0,net:"T",w:0.3,x1:0,y1:0,x2:30,y2:0};
  const B={l:1,net:"T",w:0.3,x1:15,y1:0,x2:15,y2:20};
  S.tracks.push(A,B);
  const v={x:15,y:0,d:0.8,h:0.4,a:0,b:1,net:"T"};
  S.vias.push(v);touch();
  setMode("select");S.active=0;clearSel();
  const r=trackRun(A,true);
  if(!r.tracks.has(B))throw new Error("la branche du dessous, prise en cours de ligne, manque");
  if(!r.vias.has(v))throw new Error("le via du milieu devait suivre");
});
T("le franchissement s'arrête au via d'un autre net",()=>{
  const {A,v1}=pisteAllerRetour();
  v1.net="V";touch();
  const r=trackRun(A,true);
  if(r.tracks.size!==1)throw new Error("un via nommé autrement n'est pas de la piste, "+r.tracks.size);
  if(r.vias.size)throw new Error("et il n'entre pas dans la sélection");
});
T("trackRun ne franchit pas un via qui change de net",()=>{
  const {c,d,v}=pisteDeuxCouches();
  d.net="V";v.net="V";touch();
  const r=trackRun(c,true);
  if(r.tracks.has(d))throw new Error("un net différent arrête la piste, via ou non");
  if(r.tracks.size!==4)throw new Error("4 segments attendus, "+r.tracks.size);
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
/* Le coude dépassé se replie — le 45° d'origine disparaît, le mur suivant prend
   le relais. Mais le coude, lui, ne doit pas redevenir franc pour autant : le
   relâchement lui rend un chanfrein borné (`mitreAfterDrag`). Raccourcir une
   piste ne doit pas se payer d'un angle droit à reprendre à la main. */
T("le coude dépassé se replie, mais le 45° est rendu au relâchement",()=>{
  const {h,d,v}=pisteEnEquerre();
  fire("pointerdown",sc(10,20));
  fire("pointermove",sc(-4,20));
  fire("pointerup",sc(-4,20));
  if(S.tracks.indexOf(d)>=0)throw new Error("le 45° replié devait disparaître au dépôt");
  if(S.tracks.length!==3)
    throw new Error("l'horizontale, le chanfrein rendu et la verticale : 3 segments, "+
                    S.tracks.length);
  if(Math.abs(h.y2)>1e-9)throw new Error("l'horizontale devait rester horizontale : "+h.y2);
  if(Math.abs(h.x1+20)>1e-9)throw new Error("l'autre bout ne devait pas bouger");
  if(Math.abs(v.x1+4)>0.6)throw new Error("la verticale devait tenir le coude : "+v.x1);
  // la piste reste d'un seul tenant, et sans angle droit d'axe
  const bouts=new Map();
  for(const t of S.tracks)
    for(const k of [t.x1+"|"+t.y1,t.x2+"|"+t.y2])bouts.set(k,(bouts.get(k)||0)+1);
  if([...bouts.values()].filter(n=>n===1).length!==2)
    throw new Error("la piste s'est ouverte : "+[...bouts.entries()].map(e=>e[0]+"×"+e[1]));
  const axe=t=>Math.abs(t.x1-t.x2)<1e-9?"V":(Math.abs(t.y1-t.y2)<1e-9?"H":"D");
  if(!S.tracks.some(t=>axe(t)==="D"))throw new Error("le chanfrein n'a pas été rendu");
  for(const a of S.tracks)
    for(const b of S.tracks){
      if(a===b)continue;
      const touche=dist(a.x2,a.y2,b.x1,b.y1)<1e-9||dist(a.x2,a.y2,b.x2,b.y2)<1e-9||
                   dist(a.x1,a.y1,b.x1,b.y1)<1e-9||dist(a.x1,a.y1,b.x2,b.y2)<1e-9;
      if(!touche)continue;
      if((axe(a)==="H"&&axe(b)==="V")||(axe(a)==="V"&&axe(b)==="H"))
        throw new Error("le coude est redevenu franc");
    }
  /* Ctrl+Z défait le glissement ET le chanfrein rendu d'un seul coup : le
     `push()` du premier mouvement couvre les deux. On juge la géométrie, non
     les objets — `loadDoc` reconstruit des pistes neuves. */
  undo();
  if(S.tracks.length!==3)
    throw new Error("Ctrl+Z devait rendre les trois segments d'origine, "+S.tracks.length);
  if(!S.tracks.some(t=>dist(t.x1,t.y1,0,0)<1e-9&&dist(t.x2,t.y2,10,10)<1e-9))
    throw new Error("le 45° d'origine devait revenir tel quel");
  if(!S.tracks.some(t=>dist(t.x1,t.y1,-20,0)<1e-9&&dist(t.x2,t.y2,0,0)<1e-9))
    throw new Error("l'horizontale d'origine devait revenir telle quelle");
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
  /* Le profil de découpe porte l'attribut normalisé, le keepout ne doit PAS le
     porter : deux fichiers annonçant le profil, et le fabricant ne sait plus
     lequel découper. */
  const ol=gerberOutline();
  if(ol.indexOf("Profile,NP")<0)throw new Error("fonction du profil de découpe");
  if((ol.match(/D01\*/g)||[]).length!==4)throw new Error("le profil a quatre côtés");
  const ed=gerberEdge();
  if(ed.indexOf("Other,Keepout")<0)throw new Error("fonction du keepout");
  if(ed.indexOf("Profile")>=0)throw new Error("le keepout ne doit pas s'annoncer profil");
  if((ed.match(/D01\*/g)||[]).length!==4)throw new Error("le keepout a quatre côtés");
});
T("perçage Excellon",()=>{
  const d=drillFile();
  // drillFile() retourne maintenant un tableau de fichiers
  if(!d.files.length)throw new Error("aucun fichier de perçage");
  const txt=d.files[0].text;
  if(txt.indexOf("M48")!==0)throw new Error("entête M48");
  if(txt.indexOf("METRIC,TZ")<0)throw new Error("unité manquante");
  if(!/T1C[\d.]+/.test(txt))throw new Error("aucun outil");
  if(txt.indexOf("M30")<0)throw new Error("fin de fichier");
  if(d.holes!==8+1)throw new Error("8 trous du DIP + 1 via, "+d.holes);
  // origine au coin inférieur gauche : plus de coordonnée négative
  const xs=txt.match(/^X(-?[\d.]+)Y(-?[\d.]+)$/gm)||[];
  if(!xs.length)throw new Error("aucune coordonnée");
  if(xs.some(l=>/-/.test(l)))throw new Error("coordonnée négative : origine mal placée");
});
T("dossier de fabrication complet",()=>{
  const {files,drill}=buildFabFiles();
  const names=files.map(f=>f.name);
  for(const n of ["carte.GTL","carte.GBL","carte.GTS","carte.GBS",
                  "carte.GTP","carte.GBP","carte.GTO","carte.GBO",
                  "carte.GM1","carte.GKO","carte-1-2.TXT","carte.ipc",
                  "LISEZ-MOI.txt",
                  "positions.csv","bom.csv","EMPILAGE.txt"])
    if(names.indexOf(n)<0)throw new Error("fichier manquant : "+n+" — obtenus : "+names.join(" "));
  /* Un fichier binaire (le Master Drawing PDF) porte f.data et non f.text :
     les deux comptent, mais aucun ne doit être vide. */
  if(files.some(f=>{
    const body=f.data||f.text;
    return !body||!body.length;
  }))throw new Error("fichier vide");
  if(drill.tools<1)throw new Error("aucun outil de perçage");
  // 4 couches : autant de fichiers cuivre (GTL, GL2, GL3, GBL)
  setCuCount(4);
  const f4=buildFabFiles().files.filter(f=>/\.(GTL|GBL|GL\d+)$/.test(f.name));
  if(f4.length!==4)throw new Error("4 fichiers cuivre attendus, "+f4.length);
  setCuCount(2);
});
T("netlist IPC-D-356",()=>{
  const txt=ipcNetlist();
  if(!txt)throw new Error("ipcNetlist() retourne du vide");
  if(txt.indexOf("IPC-D-356")<0)throw new Error("en-tete IPC-D-356 absente");
  const nets=netTable();
  if(nets.length){
    const n=noAcc(String(nets[0].name)).toUpperCase().slice(0,14);
    if(txt.indexOf(n)<0)throw new Error("net '"+nets[0].name+"' absent de la netlist");
  }
  const fp=S.fps[0];
  if(fp){
    const pads=padsOf(fp);
    if(pads.length){
      const p=pads.find(q=>q.net);
      if(p&&txt.indexOf("317")<0)throw new Error("aucun 317 dans la netlist");
    }
  }
  if(txt.indexOf("999")<0)throw new Error("fin 999 absente");
});
T("master drawing PDF",()=>{
  const {files}=buildFabFiles();
  const md=files.find(f=>/-MASTER-DRAWING\.pdf$/.test(f.name));
  if(!md)throw new Error("PDF absent du dossier de fab — obtenus : "
    +files.map(f=>f.name).join(" "));
  if(!(md.data instanceof Uint8Array)||!md.data.length)
    throw new Error("PDF vide ou non binaire");
  const head=String.fromCharCode(...md.data.slice(0,8));
  if(!head.startsWith("%PDF-1.4"))throw new Error("signature PDF absente : "+head);
  const tail=String.fromCharCode(...md.data.slice(-32));
  if(tail.indexOf("%%EOF")<0)throw new Error("marqueur %%EOF absent");
  /* Le binaire en chaîne latin1 pour chercher la structure. L'espace final de
     « /Type /Page » écarte « /Type /Pages », l'arbre. Le document fait trois
     pages nominales ; un débordement peut en ajouter une, ce qui reste valide
     — ce qui ne l'est pas, c'est un /Count qui mentirait sur le compte. */
  let bin="";
  for(let i=0;i<md.data.length;i+=0x8000)
    bin+=String.fromCharCode.apply(null,md.data.subarray(i,i+0x8000));
  let count=0, idx=0;
  while((idx=bin.indexOf("/Type /Page ",idx))>=0){count++;idx++;}
  if(count<3)throw new Error("au moins 3 objets Page attendus, "+count);
  if(bin.indexOf("/Count "+count)<0)
    throw new Error("/Count incohérent : "+count+" objets Page dans le fichier");
  /* Un objet Page par entrée de /Kids, et autant de cartouches numérotés */
  let sheets=0, si=0;
  while((si=bin.indexOf("SHEET: ",si))>=0){sheets++;si++;}
  if(sheets!==count)
    throw new Error(count+" cartouche(s) attendu(s), "+sheets);
  if(bin.indexOf("/BaseFont /Helvetica-Bold")<0)
    throw new Error("fonte Helvetica-Bold absente");
  if(bin.indexOf("/Contents ")<0)throw new Error("référence /Contents absente");
});
T("fichier de placement positions.csv",()=>{
  // le projet de test charge par défaut : vérifier le contenu
  const txt=positionsCsvText();
  if(!txt)throw new Error("positionsCsvText() retourne du vide");
  const lines=txt.trim().split(/\r?\n/);
  // en-tête + une ligne par empreinte
  if(lines.length!==1+S.fps.length)
    throw new Error("lignes attendues : "+(1+S.fps.length)+", obtenues : "+lines.length);
  // colonnes
  const head=lines[0].split(",");
  if(head.join(",")!=="Designator,Value,Package,X,Y,Rotation,Side")
    throw new Error("en-tete inattendu : "+head.join(","));
  // la dernière colonne est une face nommée, jamais un 0/1
  for(const l of lines.slice(1)){
    const side=l.split(",").pop();
    if(side!=="Top"&&side!=="Bottom")
      throw new Error("la face doit etre Top ou Bottom : "+side);
  }
  // origine au coin inférieur gauche : aucune coordonnée négative
  for(const l of lines.slice(1)){
    const col=l.split(",");
    if(+col[3]<0||+col[4]<0)
      throw new Error("coordonnee negative : origine mal placee sur "+col[0]);
  }
  // la marque d'ordre est posée par l'archive, pas par le texte : la doubler
  // dans les deux ferait un fichier à deux BOM, illisible pour un tableur
  if(txt.charCodeAt(0)===0xFEFF)
    throw new Error("le texte ne porte pas la marque d'ordre : zipBlob() l'ajoute");
});
T("nomenclature bom.csv pour assemblage",()=>{
  const txt=bomPcbCsvText();
  if(!txt)throw new Error("bomPcbCsvText() retourne du vide");
  const lines=txt.trim().split(/\r?\n/);
  if(lines.length<2)throw new Error("au moins en-tete + 1 ligne, "+lines.length);
  // en-tête de la section principale
  if(lines[0]!=="Reference,Value,Package")
    throw new Error("en-tete inattendu : "+lines[0]);
  // la marque d'ordre vient de l'archive, pas d'ici
  if(txt.charCodeAt(0)===0xFEFF)
    throw new Error("le texte ne porte pas la marque d'ordre : zipBlob() l'ajoute");
  // tri par repère (alphabétique et numérique à la fois)
  const refs=lines.slice(1,1+S.fps.length).map(l=>l.split(",")[0]);
  const sorted=[...refs].sort((a,b)=>String(a).localeCompare(String(b),"fr",{numeric:true}));
  if(refs.join("|")!==sorted.join("|"))
    throw new Error("les repères ne sont pas tries : "+refs.join(" "));
  /* Le récapitulatif suit une ligne vide, et porte son propre en-tête : il a
     quatre colonnes là où la section principale en a trois, les nommer évite
     au monteur de compter les virgules. */
  const emptyIdx=lines.indexOf("");
  if(emptyIdx<0)throw new Error("pas de separateur avant le recapitulatif");
  if(lines[emptyIdx+1]!=="Qty,Value,Package,References")
    throw new Error("en-tete du recapitulatif inattendu : "+lines[emptyIdx+1]);
  const recap=lines[emptyIdx+2];
  if(!/^\d+,.*,.*,/.test(recap))
    throw new Error("le recapitulatif doit commencer par une quantite : "+recap);
  // la somme des quantités doit retomber sur le nombre d'empreintes
  let qty=0;
  for(const l of lines.slice(emptyIdx+2))qty+=+l.split(",")[0]||0;
  if(qty!==S.fps.length)
    throw new Error("somme des quantites "+qty+" pour "+S.fps.length+" empreinte(s)");
});
T("placement : un composant sur chaque face",()=>{
  // empreinte top et bottom, vérification de la face dans le CSV
  const save=serialize();
  S.fps=[];S.tracks=[];S.vias=[];S.zones=[];clearSel();touch();
  S.board={x:0,y:0,w:50,h:50,pts:null};touch();
  const top=mkFp("U1","MCU","QFN-32",32);top.x=10;top.y=10;top.side=0;S.fps.push(top);
  const bot=mkFp("U2","EEPROM","SOIC-8",8);bot.x=20;bot.y=20;bot.side=1;S.fps.push(bot);
  touch();
  const txt=positionsCsvText();
  if(txt.indexOf("Top")<0)throw new Error("pas de face Top");
  if(txt.indexOf("Bottom")<0)throw new Error("pas de face Bottom");
  if(txt.indexOf("Top")>txt.indexOf("Bottom"))
    throw new Error("U1 (top) devrait precede U2 (bottom) en Y");
  loadDoc(JSON.parse(save),true);touch();
});
T("placement et bom.csv dans l'archive de fabrication",()=>{
  const {files}=buildFabFiles();
  const names=files.map(f=>f.name);
  if(names.indexOf("positions.csv")<0)throw new Error("positions.csv absent de l'archive");
  if(names.indexOf("bom.csv")<0)throw new Error("bom.csv absent de l'archive");
  // BOM UTF-8 ajouté par l'archive ZIP, pas par le texte source
  const pos=files.find(f=>f.name==="positions.csv");
  if(!pos.text.trim())throw new Error("positions.csv est vide");
  const bom=files.find(f=>f.name==="bom.csv");
  if(!bom.text.trim())throw new Error("bom.csv est vide");
  // chaque CSV a son en-tête correct
  if(pos.text.indexOf("Designator,Value,Package,X,Y,Rotation,Side")<0)
    throw new Error("en-tete positions.csv incorrect");
  if(bom.text.indexOf("Reference,Value,Package")<0)
    throw new Error("en-tete bom.csv incorrect");
  /* le LISEZ-MOI recense l'archive : les deux CSV doivent y figurer, sans quoi
     le monteur croit avoir reçu un dossier sans placement */
  const rm=files.find(f=>f.name==="LISEZ-MOI.txt").text;
  for(const n of ["positions.csv","bom.csv"])
    if(rm.indexOf(n)<0)throw new Error("le LISEZ-MOI ne cite pas "+n);
});
/* Un Excellon par portée : le défaut de fabrication silencieux qu'on vient de
   corriger. Sur 4 couches avec un via borgne 1-2 et un traversant 1-4, le
   fabricant doit recevoir deux fichiers distincts, sinon il perce de part en
   part un trou qui devait s'arrêter à la couche 2. */
T("perçage Excellon : un fichier par portée de via",()=>{
  const save=serialize();
  S.fps=[];S.tracks=[];S.vias=[];S.zones=[];touch();
  setCuCount(4);
  S.board={x:0,y:0,w:40,h:30,pts:null};
  const cls=classOf(null);
  // via traversant 1-4, via borgne 1-2, via enterré 2-3
  S.vias.push({x:10,y:10,d:cls.via,drill:cls.drill,net:null,a:0,b:3});
  S.vias.push({x:15,y:10,d:cls.via,drill:cls.drill,net:null,a:0,b:1});
  S.vias.push({x:20,y:10,d:cls.via,drill:cls.drill,net:null,a:1,b:2});
  touch();
  const d=drillFile();
  const names=d.files.map(f=>f.name);
  for(const n of ["carte-1-4.TXT","carte-1-2.TXT","carte-2-3.TXT"])
    if(names.indexOf(n)<0)
      throw new Error("fichier de portée manquant : "+n+" — obtenus : "+names.join(" "));
  if(d.files.length!==3)
    throw new Error("3 portées attendues, "+d.files.length+" : "+names.join(" "));
  // chaque fichier ne contient QUE les trous de sa portée
  const byName=new Map(d.files.map(f=>[f.name,f]));
  for(const n of names)
    if(byName.get(n).holes!==1)
      throw new Error(n+" devrait porter 1 trou, "+byName.get(n).holes);
  // la nature de la portée est annoncée dans l'entête
  if(byName.get("carte-1-2.TXT").text.indexOf("borgne")<0)
    throw new Error("la portée 0-1 devrait s'annoncer borgne");
  if(byName.get("carte-2-3.TXT").text.indexOf("enterre")<0)
    throw new Error("la portée 1-2 devrait s'annoncer enterree");
  if(byName.get("carte-1-4.TXT").text.indexOf("traverse")<0)
    throw new Error("la portée 0-3 devrait s'annoncer traversante");
  // les pastilles traversantes ne partent que dans le fichier traversant
  const fp=mkFp("U9","","",8);fp.style="dip";fp.x=25;fp.y=20;S.fps.push(fp);touch();
  const d2=drillFile();
  const m2=new Map(d2.files.map(f=>[f.name,f]));
  if(m2.get("carte-1-4.TXT").holes!==1+8)
    throw new Error("traversant : 1 via + 8 pastilles, "+m2.get("carte-1-4.TXT").holes);
  if(m2.get("carte-1-2.TXT").holes!==1)
    throw new Error("le borgne ne doit pas recevoir les pastilles, "+
                    m2.get("carte-1-2.TXT").holes);
  // l'archive porte bien un fichier par portée
  const fabNames=buildFabFiles().files.map(f=>f.name);
  for(const n of ["carte-1-4.TXT","carte-1-2.TXT","carte-2-3.TXT"])
    if(fabNames.indexOf(n)<0)throw new Error("archive : "+n+" manquant");
  loadDoc(JSON.parse(save),true);setCuCount(2);touch();
});
/* Sans via, les pastilles traversantes sortent quand meme : un simple deux
   couches percé ne doit pas repartir sans fichier de perçage. */
T("perçage Excellon : pastilles sans via",()=>{
  const save=serialize();
  S.fps=[];S.tracks=[];S.vias=[];S.zones=[];touch();
  setCuCount(2);
  const fp=mkFp("U8","","",8);fp.style="dip";fp.x=20;fp.y=15;S.fps.push(fp);touch();
  const d=drillFile();
  if(d.files.length!==1)
    throw new Error("un seul fichier attendu, "+d.files.length);
  if(d.files[0].name!=="carte-1-2.TXT")
    throw new Error("nom du fichier traversant : "+d.files[0].name);
  if(d.holes!==8)throw new Error("8 trous du DIP, "+d.holes);
  loadDoc(JSON.parse(save),true);touch();
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
  const txt=d.files[0].text;
  if(txt.indexOf("X0.000Y0.000")<0&&!/X-?0\./.test(txt))
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
/* La conduite « signaler » : celle de l'éditeur avant le moteur PNS, et qui
   reste disponible. Rien ne s'écarte, rien ne se contourne — le point visé est
   repoussé hors des obstacles, et un trajet qui traverse est refusé. */
T("anti-collision au tracé, conduite « signaler »",()=>{
  S.fps=[];S.tracks=[];S.vias=[];S.zones=[];touch();
  setCuCount(2);S.board={x:0,y:0,w:60,h:40,pts:null};boardChanged();
  setActive(0);S.avoid=true;S.rule.route="mark";
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
  S.avoid=true;S.rule.route="shove";cancelRoute();
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
  buildTabs();buildLayers();reSync();refreshPanels();
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
  reSync();buildLayers();buildTabs();
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
  buildLayers();buildTabs();reSync();
  assertPropre($("layers").innerHTML,"empilage");
  assertPresent($("layers").innerHTML,"empilage");
  /* Le nom de classe s'affichait dans le panneau « Règles de tracé » ; il
     s'affiche maintenant dans la fenêtre des règles. On juge le balisage qui
     interpole vraiment du texte du document : le tableau des classes et son
     sélecteur. `assertPropre` refuse toute balise <svg>, or les figures en
     portent une par construction — la figure se juge donc à part, sur la seule
     balise que l'injection produirait. */
  assertPropre(reClassTable()+reClassSel(),"tableau des classes de net");
  assertPresent(reClassTable(),"tableau des classes de net");
  if(figClass().indexOf("<img")>=0)
    throw new Error("figure de classe : balise injectée telle quelle");
  if(figClass().indexOf("&lt;img")<0)
    throw new Error("figure de classe : la charge n'apparaît pas, l'essai ne prouve rien");
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
  draw();runDrc();buildLayers();reSync();refreshPanels();buildList();
  loadDoc({cu:"beaucoup",cuL:"non",fps:"non",tracks:{},vias:null,zones:0,
           board:"grande",rule:[],classes:[],netClass:"x",active:-4},true);
  if(S.cu<1||S.cu>8)throw new Error("nombre de couches hors bornes : "+S.cu);
  if(S.cuL.length!==S.cu)throw new Error("empilage incohérent");
  if(S.active<0||S.active>=S.cu)throw new Error("couche active hors empilage : "+S.active);
  draw();runDrc();buildLayers();reSync();refreshPanels();buildList();
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
  if(drillFile().files.some(f=>f.text.indexOf("epaisseur du stratifie")<0))
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
  if(JSON.stringify(dom.dockIds("dockL"))!==JSON.stringify(["stack"]))
    throw new Error("dock gauche : "+dom.dockIds("dockL"));
  if(JSON.stringify(dom.dockIds("dockR"))!==JSON.stringify(["props","list","stackup"]))
    throw new Error("dock droit : "+dom.dockIds("dockR"));
  if(dom.dockIds("dockB").length)throw new Error("le dock du bas devrait être vide");
  if(!dom.docks.dockB.classList.contains("empty"))
    throw new Error("un dock vide porte la classe « empty »");
});
T("séparateur entre panneaux d'un même dock",()=>{
  const n=dom.docks.dockR.children.filter(c=>c.classList.contains("psplit")).length;
  if(n!==2)throw new Error("3 panneaux = 2 séparateurs, obtenu "+n);
  const g=dom.docks.dockL.children.filter(c=>c.classList.contains("psplit")).length;
  if(g!==0)throw new Error("1 panneau = aucun séparateur, obtenu "+g);
});
T("déplacer un panneau d'un dock à l'autre",()=>{
  wsMove("props","dockB",0);
  if(wsPlaceOf("props")!=="dockB")throw new Error("place non mise à jour");
  if(wsLabel("props")!=="bas")throw new Error("libellé : "+wsLabel("props"));
  if(dom.panels.props.parentNode!==dom.docks.dockB)
    throw new Error("le panneau n'a pas suivi dans l'arbre");
  if(JSON.stringify(dom.dockIds("dockR"))!==JSON.stringify(["list","stackup"]))
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
  wsToggleCollapse("stackup");
  if(!dom.panels.stackup.classList.contains("collapsed"))throw new Error("repli sans effet");
  wsToggleCollapse("stackup");
  if(dom.panels.stackup.classList.contains("collapsed"))throw new Error("dépli sans effet");
});
T("la disposition est écrite dans le profil de l'utilisateur",()=>{
  const d=profLire(WS_SECTION);
  if(!d)throw new Error("rien sous la section "+WS_SECTION);
  if(d.order.dockB.indexOf("stack")<0)
    throw new Error("le déplacement n'a pas été enregistré : "+JSON.stringify(d.order));
  // et la copie locale porte bien le nom de l'utilisateur, pas la clé nue
  if(dom.storage.getItem(WS_KEY))
    throw new Error("la disposition traîne encore hors du profil");
});
T("relecture d'une disposition enregistrée",()=>{
  const saved=JSON.stringify(profLire(WS_SECTION));
  WS=wsDefault();wsApply(false);
  if(JSON.stringify(dom.dockIds("dockL"))!==JSON.stringify(["stack"]))
    throw new Error("réinitialisation ratée");
  wsLoad();wsApply(false);
  if(wsPlaceOf("stack")!=="dockB")throw new Error("disposition non relue");
  if(JSON.stringify(profLire(WS_SECTION))!==saved)
    throw new Error("wsApply(false) ne doit pas réécrire le profil");
});
T("une disposition corrompue retombe sur l'usine",()=>{
  profEcrire(WS_SECTION,
    {order:{dockL:["stack","fantome","stack"]},docks:{dockL:-9}});
  WS=wsDefault();wsLoad();wsApply(false);
  if(wsPlaceOf("fantome")!=="hidden")
    throw new Error("un panneau inconnu ne doit pas être placé");
  if(dom.dockIds("dockL").filter(x=>x==="stack").length!==1)
    throw new Error("doublon accepté : "+dom.dockIds("dockL"));
  if(WS.docks.dockL<150)throw new Error("largeur négative acceptée : "+WS.docks.dockL);
  // les panneaux absents du fichier retrouvent leur place d'usine
  for(const id of ["stackup","props","list"])
    if(wsPlaceOf(id)==="hidden")throw new Error(id+" a disparu");
  profOublier(WS_SECTION);
  WS=wsDefault();wsLoad();wsApply(false);
  if(JSON.stringify(dom.dockIds("dockL"))!==JSON.stringify(["stack"]))
    throw new Error("section absente : la disposition d'usine devait s'appliquer");
});
T("la disposition d'avant les profils est reprise une dernière fois",()=>{
  // Un dépôt mis à jour trouve une disposition sous la clé nue : elle sert
  // encore, faute de quoi chacun retrouverait ses panneaux d'usine un matin.
  profOublier(WS_SECTION);
  dom.storage.setItem(WS_KEY,JSON.stringify({
    docks:{dockL:212,dockR:330,dockB:200},
    order:{dockL:[],dockR:["props","list","stackup"],dockB:["stack"]},
    panels:{}}));
  WS=wsDefault();wsLoad();wsApply(false);
  if(wsPlaceOf("stack")!=="dockB")
    throw new Error("héritage ignoré : "+wsPlaceOf("stack"));
  wsSave();
  if(!profLire(WS_SECTION))throw new Error("l'héritage n'a pas rejoint le profil");
  dom.storage.removeItem(WS_KEY);
  profOublier(WS_SECTION);
  WS=wsDefault();wsApply(false);      // la suite part de la disposition d'usine
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
  wsMove("stack","hidden");
  if(!g.classList.contains("off"))throw new Error("un dock vide neutralise sa poignée");
  wsShow("stack");
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
T("deux listes de nets : la polarité choisie fait loi",()=>{
  carteDp();
  S.tracks.push({l:0,net:"GND",w:0.3,x1:10,y1:12,x2:20,y2:12});
  const noms=netTable().map(n=>n.name);
  // le net d'en face se devine depuis le côté P, et pas depuis le côté N
  if(dpMateGuess(noms,"USB_DP")!=="USB_DM")
    throw new Error("complémentaire non proposé : "+dpMateGuess(noms,"USB_DP"));
  if(dpMateGuess(noms,"USB_DM")!=="")
    throw new Error("le côté N ne doit rien proposer, la polarité est déjà donnée");
  if(dpMateGuess(noms,"GND")!=="")throw new Error("GND n'a pas de complémentaire");
  // l'ordre des listes passe devant les suffixes des noms
  const q=dpMakePair("USB_DM","USB_DP",true);
  if(!q)throw new Error("deux nets libres devaient faire une paire");
  if(q.p!=="USB_DM"||q.n!=="USB_DP")
    throw new Error("la polarité désignée doit tenir : "+JSON.stringify(q));
  if(q.name!=="USB")throw new Error("nom de paire : "+q.name);
  // un net déjà apparié n'est plus libre, et ne refait pas de paire
  if(dpNetFree(noms,"USB_DP"))throw new Error("un net apparié reste offert");
  if(!dpNetFree(noms,"GND"))throw new Error("GND devait rester libre");
  if(dpMakePair("USB_DP","GND",true)!==q)
    throw new Error("un net déjà apparié doit renvoyer sa paire");
  // deux fois le même net, ou un net manquant : rien
  if(dpMakePair("GND","GND",true))throw new Error("un net ne s'apparie pas à lui-même");
  if(dpMakePair("","GND",true))throw new Error("une paire demande deux nets");
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
T("vias de paire : l'éventail s'ouvre du bon côté quel que soit le curseur",()=>{
  /* `D.side` suit le DERNIER mouvement de souris, pas le sens de marche de la
     paire : ramener le curseur en arrière le faisait basculer, l'éventail
     partait à l'envers et les deux vias se recouvraient. Le côté se lit
     désormais sur les ancres, qui ne mentent pas. */
  for(const vise of [{x:40,y:55},{x:40,y:30},{x:55,y:45},{x:25,y:45}]){
    const c=carteDp(4);
    dpAutoAll();
    const q=S.dpPairs[0];
    setMode("dpair");
    dpStart((c.a.p.x+c.a.n.x)/2,(c.a.p.y+c.a.n.y)/2);
    dpUpdate(40,45);dpStep();
    dpUpdate(vise.x,vise.y);              // le curseur bouge AVANT la touche V
    dpVia();
    const [v1,v2]=S.vias.slice(-2);
    if(!v1||!v2)throw new Error("curseur en "+vise.x+","+vise.y+" : vias non posés");
    const d=dist(v1.x,v1.y,v2.x,v2.y);
    if(d<dpViaSpread(q)-1e-3)
      throw new Error("curseur en "+vise.x+","+vise.y+" : entraxe "+fmt(d,3)+
                      " pour "+fmt(dpViaSpread(q),3)+" attendus");
    if(d-v1.d/2-v2.d/2<-1e-6)
      throw new Error("curseur en "+vise.x+","+vise.y+" : le cuivre des deux vias se touche");
    /* chaque via sous SON net, et du côté de sa propre piste : un éventail
       retourné écarte bien les vias mais croise les deux pistes */
    const vP=v1.net==="USB_DP"?v1:v2, vN=v1.net==="USB_DP"?v2:v1;
    if(vP.net!=="USB_DP"||vN.net!=="USB_DM")
      throw new Error("nets des vias : "+v1.net+" / "+v2.net);
    if(dist(vP.x,vP.y,S.dp.aP.x,S.dp.aP.y)>1e-6||dist(vN.x,vN.y,S.dp.aN.x,S.dp.aN.y)>1e-6)
      throw new Error("les vias ne sont pas sous les ancres de leur piste");
    dpCancel();
  }
});
T("anti-collision : un via ne se pose pas dans le cuivre du voisin",()=>{
  S.fps=[];S.tracks=[];S.vias=[];S.zones=[];S.cuts=[];S.dpPairs=[];S.dpRules=[];
  clearSel();setCuCount(4,true);
  S.avoid=true;
  if(!placeVia(30,30,"A",0,3,false))throw new Error("le premier via devait tenir");
  /* un via est plus large que la piste qui l'amène : le passage libre pour la
     piste ne l'est pas pour la rondelle, et rien ne le disait */
  if(placeVia(30.1,30,"B",0,3,false))throw new Error("un via posé dans un autre");
  if(S.vias.length!==1)throw new Error("le via refusé a quand même été posé");
  const clr=clrPair("A","B");
  if(placeVia(30+S.vias[0].d+clr-0.01,30,"B",0,3,false))
    throw new Error("un via posé sous l'isolation exigée");
  if(!placeVia(30+S.vias[0].d+clr+0.01,30,"B",0,3,false))
    throw new Error("un via au-delà de l'isolation devait tenir");
  // même net : pas d'isolation à tenir, la couture de masse reste possible
  S.vias.length=0;touch();
  placeVia(30,30,"GND",0,3,false);
  if(!placeVia(30.9,30,"GND",0,3,false))throw new Error("deux vias de masse voisins refusés");
  // l'anti-collision coupée, on force comme pour une piste
  S.vias.length=0;touch();S.avoid=false;
  placeVia(30,30,"A",0,3,false);
  if(!placeVia(30.1,30,"B",0,3,false))throw new Error("anti-collision coupée : le forçage doit passer");
  S.avoid=true;
});
T("anti-collision : le changement de couche refusé ne change pas de couche",()=>{
  const c=carteDp(4);
  dpAutoAll();
  setMode("dpair");
  S.avoid=true;
  dpStart((c.a.p.x+c.a.n.x)/2,(c.a.p.y+c.a.n.y)/2);
  dpUpdate(40,45);dpStep();
  /* deux vias d'un autre net posés pile là où la paire voudrait les siens */
  S.avoid=false;
  placeVia(S.dp.aP.x,S.dp.aP.y,"GND",0,3,false);
  placeVia(S.dp.aN.x,S.dp.aN.y,"GND",0,3,false);
  S.avoid=true;
  const av=S.vias.length, cu=S.dp.layer, pas=S.dp.steps.length;
  const dp=S.dp.doneP.length;
  dpVia();
  if(S.vias.length!==av)throw new Error("les vias de la paire ont été posés dans du cuivre étranger");
  if(S.dp.layer!==cu)throw new Error("la couche a changé sans via pour l'y amener");
  if(S.dp.steps.length!==pas)throw new Error("un marque-page est resté derrière");
  if(S.dp.doneP.length!==dp)throw new Error("l'éventail a été posé pour rien");
  dpCancel();
  S.vias.length=0;touch();
});
/* Le geste le plus courant pour placer un via de masse : on le pose, puis on le
   TIRE là où on le veut. La pose se faisait juger ; le glissement, lui, ne
   parcourait que des pistes — un via emmené entrait donc dans le cuivre du
   voisin par la porte de derrière. */
function viaATirer(){
  S.fps=[];S.tracks=[];S.vias=[];S.zones=[];S.cuts=[];S.dpPairs=[];S.dpRules=[];
  clearSel();setCuCount(4,true);S.avoid=true;S.grid=0.1;
  setMode("select");S.active=0;fit();
  return null;
}
T("un via tiré à la main bute sur un autre via",()=>{
  viaATirer();
  const cible=placeVia(30,30,"SIG",0,3,false);
  const gnd=placeVia(34,30,"GND",0,3,false);
  clearSel();S.sel.vias.add(gnd);
  glisseSur(gnd,{x:34,y:30},{x:30.1,y:30});
  const e=dist(gnd.x,gnd.y,cible.x,cible.y)-gnd.d/2-cible.d/2;
  if(e<clrPair("GND","SIG")-1e-6)
    throw new Error("le via s'est posé sous l'isolation : "+fmt(e,3)+" mm");
  if(Math.abs(gnd.x-34)<1e-9)
    throw new Error("il devait tout de même avancer jusqu'à l'obstacle");
  undo();
});
T("un via tiré à la main bute sur une piste d'un autre net",()=>{
  viaATirer();
  S.tracks.push({l:0,net:"SIG",w:0.3,x1:20,y1:30,x2:40,y2:30});touch();
  const v=placeVia(30,36,"GND",0,3,false);
  clearSel();S.sel.vias.add(v);
  glisseSur(v,{x:30,y:36},{x:30,y:30});
  const e=Math.abs(v.y-30)-v.d/2-0.15;
  if(e<clrPair("GND","SIG")-1e-6)
    throw new Error("le via a traversé la piste : "+fmt(e,3)+" mm");
  if(Math.abs(v.y-36)<1e-9)throw new Error("il devait avancer jusqu'à l'obstacle");
  if(runDrc().some(x=>!x.info))throw new Error("le glissement a laissé une faute");
  undo();
});
T("un via tiré : l'anti-collision coupée ne retient rien",()=>{
  viaATirer();
  placeVia(30,30,"SIG",0,3,false);
  const gnd=placeVia(34,30,"GND",0,3,false);
  clearSel();S.sel.vias.add(gnd);
  S.avoid=false;
  glisseSur(gnd,{x:34,y:30},{x:30.1,y:30});
  S.avoid=true;
  if(Math.abs(gnd.x-30.1)>0.2)
    throw new Error("anti-collision coupée : rien ne doit retenir, x="+fmt(gnd.x,3));
  undo();
});
T("un via déjà en faute peut encore être dégagé",()=>{
  /* Même principe que pour une piste : on ne juge que ce qui était propre AVANT
     le geste, sinon la carte se fige et l'on ne peut plus sortir le via de là où
     il n'aurait jamais dû être. On le force sur une piste étrangère — un seul
     via sur la carte, donc aucune ambiguïté sur ce que le clic attrape. */
  viaATirer();
  S.tracks.push({l:0,net:"SIG",w:0.3,x1:20,y1:30,x2:40,y2:30});touch();
  S.avoid=false;
  const v=placeVia(30,30,"GND",0,3,false);
  S.avoid=true;
  if(!v)throw new Error("anti-collision coupée : le via devait se poser");
  clearSel();S.sel.vias.add(v);
  glisseSur(v,{x:30,y:30},{x:33,y:30});        // le long de la piste, toujours dedans
  if(Math.abs(v.x-33)>0.3)
    throw new Error("un via déjà en faute doit rester déplaçable, x="+fmt(v.x,3));
  undo();
});
T("outil « Via » : un via sans net se fait juger comme les autres",()=>{
  /* Un via posé à côté du cuivre n'a pas de net — l'aimant n'a rien accroché.
     Ce n'est pas du cuivre libre dessiné exprès, comme une piste sans net :
     c'est un via dont le net n'a pas été reconnu, et l'exempter revenait à le
     laisser tomber en plein milieu d'une piste étrangère. */
  viaATirer();
  S.tracks.push({l:0,net:"SIG",w:0.3,x1:20,y1:30,x2:40,y2:30});touch();
  setMode("via");
  fire("pointerdown",sc(30,30.5));fire("pointerup",sc(30,30.5));
  if(S.vias.length)throw new Error("un via sans net posé sur une piste étrangère");
  // plus loin, il tient : l'isolation de la classe par défaut suffit à trancher
  const loin=30+0.15+0.4+clrPair("","SIG")+0.05;
  fire("pointerdown",sc(30,loin));fire("pointerup",sc(30,loin));
  if(S.vias.length!==1)throw new Error("au-delà de l'isolation, le via devait tenir");
  setMode("select");
  if(runDrc().some(x=>!x.info))throw new Error("le via posé a laissé une faute");
});
T("trou à trou : la règle qui ne connaît pas les nets",()=>{
  S.fps=[];S.tracks=[];S.vias=[];S.zones=[];S.cuts=[];S.dpPairs=[];S.dpRules=[];
  clearSel();setCuCount(4,true);S.avoid=true;
  /* L'isolation s'annule d'office au sein d'un net — du cuivre relié n'a rien à
     tenir — et laissait donc deux vias de masse entrer l'un dans l'autre. Le
     foret, lui, ne sait pas ce qu'est un net. */
  const v=placeVia(30,30,"GND",0,3,false);
  if(!v)throw new Error("le premier via devait tenir");
  if(placeVia(30.2,30,"GND",0,3,false))
    throw new Error("deux vias d'un même net posés l'un dans l'autre");
  if(S.vias.length!==1)throw new Error("le via refusé a quand même été posé");
  // la limite est bien celle de la règle, mesurée de trou à trou
  const lim=v.drill+holeClr();
  if(placeVia(30+lim-0.02,30,"GND",0,3,false))
    throw new Error("un via sous la règle du trou à trou est passé");
  if(!placeVia(30+lim+0.02,30,"GND",0,3,false))
    throw new Error("un via au-delà de la règle devait tenir");
  // la règle se règle : desserrée, elle laisse passer ; resserrée, elle refuse
  S.vias.length=0;touch();
  placeVia(30,30,"GND",0,3,false);
  S.rule.hole=0.05;
  if(!placeVia(30+v.drill+0.1,30,"GND",0,3,false))
    throw new Error("règle desserrée : le via devait passer");
  S.vias.length=1;touch();
  S.rule.hole=1;
  if(placeVia(30+v.drill+0.1,30,"GND",0,3,false))
    throw new Error("règle resserrée : le via devait être refusé");
  // un via sans net échappe à l'isolation, jamais au trou à trou
  S.vias.length=0;touch();S.rule.hole=0.25;
  placeVia(30,30,"",0,3,false);
  if(placeVia(30.2,30,"",0,3,false))
    throw new Error("deux perçages sans net se recouvrent quand même");
  // le contrôle mesure comme la pose : un manque sans recouvrement se dit aussi
  S.vias.length=0;touch();S.avoid=false;
  placeVia(30,30,"GND",0,3,false);
  placeVia(30+v.drill+0.1,30,"GND",0,3,false);
  if(!runDrc().some(e=>/Trou à trou/.test(e.msg)))
    throw new Error("le manque de trou à trou n'est pas signalé");
  S.vias.length=0;touch();S.avoid=true;
});
T("trou à trou : une pastille traversante est un perçage comme un autre",()=>{
  S.fps=[];S.tracks=[];S.vias=[];S.zones=[];S.cuts=[];S.dpPairs=[];S.dpRules=[];
  clearSel();setCuCount(4,true);S.avoid=true;
  importNetlist(NET,true);
  const u1=S.fps.find(f=>f.ref==="U1");
  u1.x=40;u1.y=40;touch();
  const q=padsWorld(u1).find(o=>o.drill>0&&o.net);
  if(!q)throw new Error("le DIP-8 devait porter des pastilles traversantes");
  /* Le via porte le net de la pastille : l'isolation se tait d'office, et seul
     le trou à trou peut encore refuser. C'est bien lui qu'on éprouve. */
  const dr=viaDrill(classOf(q.net));
  if(placeVia(q.x+0.05,q.y,q.net,0,3,false))
    throw new Error("un via percé dans le trou d'une pastille du même net");
  const loin=q.x+q.drill/2+dr/2+holeClr()+0.05;
  if(!placeVia(loin,q.y,q.net,0,3,false))
    throw new Error("au-delà de la règle, le via devait tenir");
  S.vias.length=0;touch();
});
T("vias de paire : la même isolation que deux vias posés à la main",()=>{
  /* L'écart serré de la règle de paire fait l'impédance des PISTES. Sur deux
     vias le couplage est rompu : il ne reste que du cuivre étranger, et rien ne
     justifiait que les vias de la paire se tiennent plus serrés que ceux qu'on
     pose à la main — ce qui se voyait à l'œil sur une carte qui mêle les deux. */
  const c=carteDp(4);
  dpAutoAll();
  const q=S.dpPairs[0], cl=classOf("USB_DP");
  if(dpViaGap(q)!==cl.clr)
    throw new Error("l'isolation des vias devait être celle de la classe : "+
                    fmt(dpViaGap(q),3));
  setMode("dpair");S.avoid=true;
  dpStart((c.a.p.x+c.a.n.x)/2,(c.a.p.y+c.a.n.y)/2);
  dpUpdate(40,45);dpStep();
  dpVia();
  const [p1,p2]=S.vias.slice(-2);
  if(!p1||!p2)throw new Error("les deux vias de la paire devaient tenir");
  const paire=dist(p1.x,p1.y,p2.x,p2.y)-p1.d/2-p2.d/2;
  dpCancel();
  if(paire<cl.clr-1e-6)
    throw new Error("vias de paire sous l'isolation : "+fmt(paire,3)+
                    " pour "+fmt(cl.clr,3)+" mm");
  /* Deux vias posés à la main, poussés au plus près que l'anti-collision
     tolère : c'est la référence que l'œil compare. */
  S.vias.length=0;touch();
  const h1=placeVia(10,10,"A",0,3,false);
  let h2=null;
  for(let d=cl.via;d<cl.via+2&&!h2;d+=0.005)h2=placeVia(10+d,10,"B",0,3,false);
  if(!h2)throw new Error("impossible de poser le via de référence");
  const main=dist(h1.x,h1.y,h2.x,h2.y)-h1.d/2-h2.d/2;
  if(Math.abs(paire-main)>0.01)
    throw new Error("les vias de paire ne serrent pas comme ceux de la main : "+
                    fmt(paire,3)+" contre "+fmt(main,3));
  S.vias.length=0;touch();
});
T("vias de paire : une règle plus large que la classe l'emporte quand même",()=>{
  /* `dpViaGap` prend l'isolation ordinaire, mais jamais moins que le minimum de
     la règle : une paire tenue plus large que sa classe reste une paire. */
  const c=carteDp(4);
  dpAutoAll();
  const q=S.dpPairs[0], cl=classOf("USB_DP");
  const gR=S.dpRules.slice();
  S.dpRules=[Object.assign({},DP_FALLBACK,{name:"LARGE",uid:dpUid(),
    minGap:cl.clr+0.3,prefGap:cl.clr+0.3,maxGap:cl.clr+0.5,layers:{}})];
  const g=dpViaGap(q), mini=dpMinGap(q);
  S.dpRules=gR;
  if(g<mini-1e-9)
    throw new Error("la règle de paire devait l'emporter : "+fmt(g,3)+" < "+fmt(mini,3));
});
T("contrôle : deux vias de paire rapprochés à la main sont signalés",()=>{
  /* Le contrôle général mesure entre deux nets appariés à `clrPair` — l'écart
     de la règle — et les laisserait donc passer bien plus près. La règle des
     vias est propre aux paires : c'est `dpDrc` qui la porte. */
  const c=carteDp(4);
  dpAutoAll();
  const q=S.dpPairs[0], cl=classOf("USB_DP");
  S.avoid=false;
  placeVia(30,30,"USB_DP",0,3,false);
  placeVia(30+cl.via+cl.clr-0.05,30,"USB_DM",0,3,false);
  S.avoid=true;
  const e=[];dpDrc(e);
  if(!e.some(x=>/vias USB_DP et USB_DM/.test(x.msg)))
    throw new Error("deux vias de paire sous l'isolation non signalés");
  // écartés comme il faut, plus rien
  S.vias[1].x=30+cl.via+cl.clr+0.05;touch();
  const e2=[];dpDrc(e2);
  if(e2.some(x=>/vias USB_DP et USB_DM/.test(x.msg)))
    throw new Error("des vias corrects ne doivent rien lever");
  S.vias.length=0;touch();
});
T("un via de paire tiré à la main bute sur son jumeau",()=>{
  const c=carteDp(4);
  dpAutoAll();
  const cl=classOf("USB_DP");
  S.vias.length=0;touch();
  S.avoid=true;S.grid=0.1;setMode("select");S.active=0;fit();
  const vp=placeVia(30,30,"USB_DP",0,3,false);
  const vn=placeVia(34,30,"USB_DM",0,3,false);
  if(!vp||!vn)throw new Error("les deux vias devaient se poser");
  clearSel();S.sel.vias.add(vn);
  glisseSur(vn,{x:34,y:30},{x:30.9,y:30});
  const e=dist(vp.x,vp.y,vn.x,vn.y)-vp.d/2-vn.d/2;
  if(e<cl.clr-1e-6)
    throw new Error("le via de paire a franchi l'isolation : "+fmt(e,3)+" mm");
  if(Math.abs(vn.x-34)<1e-9)throw new Error("il devait avancer jusqu'à l'obstacle");
  S.vias.length=0;touch();
});
T("vias de paire : l'écartement tient le cuivre ET les perçages",()=>{
  const c=carteDp(4);
  dpAutoAll();
  const q=S.dpPairs[0];
  const cl=classOf("USB_DP");
  /* Cotes d'usine : c'est le cuivre qui commande, la couronne débordant
     largement du trou. Et l'isolation retenue est l'ORDINAIRE, pas l'écart
     serré de la règle de paire : sur deux vias le couplage est rompu, il ne
     reste que du cuivre étranger. */
  if(dpViaGap(q)<=clrPair(q.p,q.n))
    throw new Error("l'isolation des vias doit dépasser l'écart de la règle de paire");
  const parCuivre=cl.via+dpViaGap(q);
  if(dpViaSpread(q)<parCuivre-1e-9||dpViaSpread(q)>parCuivre+0.01)
    throw new Error("cotes d'usine : le cuivre devait commander, "+fmt(dpViaSpread(q),3));
  /* Couronne mince et règle de trou à trou sévère : c'est le foret qui commande,
     et l'éventail doit s'ouvrir davantage — sinon les deux trous se rejoignent
     alors même que le cuivre, lui, tient l'écart.
     Les cotes se remettent AVANT tout verdict : la classe et la règle sont
     partagées, et un essai qui s'arrête en chemin les laisserait de travers
     pour les suivants. */
  const gVia=cl.via, gDr=cl.drill, gH=S.rule.hole;
  cl.via=0.5;cl.drill=0.4;S.rule.hole=0.5;touch();
  const vise=viaDrill(cl)+holeClr(), spread=dpViaSpread(q);
  setMode("dpair");
  dpStart((c.a.p.x+c.a.n.x)/2,(c.a.p.y+c.a.n.y)/2);
  dpUpdate(40,45);dpStep();
  dpVia();
  const [v1,v2]=S.vias.slice(-2);
  const trou=(v1&&v2)?dist(v1.x,v1.y,v2.x,v2.y)-v1.drill/2-v2.drill/2:null;
  const err=runDrc().filter(e=>/Trou à trou|recouvrent|même point/.test(e.msg));
  dpCancel();
  cl.via=gVia;cl.drill=gDr;S.rule.hole=gH;touch();
  if(spread<vise-1e-9)
    throw new Error("le trou à trou n'a pas commandé : "+fmt(spread,3)+
                    " pour "+fmt(vise,3));
  if(trou==null)throw new Error("les deux vias de la paire devaient tenir");
  if(trou<0.5-1e-6)
    throw new Error("les deux perçages de la paire sont sous la règle : "+fmt(trou,4));
  if(err.length)throw new Error("la paire posée devait passer sa propre règle : "+err[0].msg);
});
T("anti-collision : la paire ne change pas deux fois de couche au même point",()=>{
  /* C'est le cas de la capture : deux vias corrects, puis deux autres posés
     par-dessus. Ils portaient le MÊME net que les premiers — l'isolation ne les
     voyait donc pas, et quatre perçages se retrouvaient en deux trous. */
  const c=carteDp(4);
  dpAutoAll();
  setMode("dpair");
  S.avoid=true;
  dpStart((c.a.p.x+c.a.n.x)/2,(c.a.p.y+c.a.n.y)/2);
  dpUpdate(40,45);dpStep();
  dpVia();
  const n=S.vias.length, cu=S.dp.layer;
  if(n!==2)throw new Error("le premier changement devait poser deux vias");
  dpVia();                                   // aussitôt, sans avancer
  if(S.vias.length!==n)throw new Error("quatre vias en deux trous : "+S.vias.length);
  if(S.dp.layer!==cu)throw new Error("la couche a changé sans via pour l'y amener");
  dpCancel();
});
T("document : le trou à trou se range avec la carte",()=>{
  S.fps=[];S.tracks=[];S.vias=[];S.zones=[];S.cuts=[];S.dpPairs=[];S.dpRules=[];
  clearSel();setCuCount(2,true);
  S.rule.hole=0.35;touch();
  loadDoc(JSON.parse(serialize()),true);
  if(Math.abs(S.rule.hole-0.35)>1e-9)throw new Error("trou à trou perdu : "+S.rule.hole);
  // un fichier antérieur à la règle prend le minimum de fabrication courant
  const d=JSON.parse(serialize());
  delete d.rule.hole;
  loadDoc(d,true);
  if(Math.abs(S.rule.hole-0.25)>1e-9)
    throw new Error("fichier muet : 0,25 mm attendu, "+S.rule.hole);
});
T("contrôle : deux vias qui se recouvrent, même sur un même net",()=>{
  S.fps=[];S.tracks=[];S.vias=[];S.zones=[];S.cuts=[];S.dpPairs=[];S.dpRules=[];
  clearSel();setCuCount(4,true);S.avoid=false;
  /* l'isolation ne juge que les nets différents : deux perçages d'un même net
     qui se recouvrent passaient sans un mot */
  placeVia(30,30,"GND",0,3,false);
  placeVia(30.2,30,"GND",0,3,false);
  if(!runDrc().some(e=>/recouvrent/.test(e.msg)))
    throw new Error("le recouvrement de deux vias de masse n'est pas signalé");
  S.vias.length=0;touch();
  placeVia(30,30,"GND",0,3,false);
  placeVia(30,30,"GND",0,3,false);
  if(!runDrc().some(e=>/même point/.test(e.msg)))
    throw new Error("deux vias au même point ne sont pas signalés");
  // une couture de masse au pas normal ne réclame rien
  S.vias.length=0;touch();
  placeVia(30,30,"GND",0,3,false);
  placeVia(31.5,30,"GND",0,3,false);
  if(runDrc().some(e=>/recouvrent|même point/.test(e.msg)))
    throw new Error("une couture de masse au pas normal ne doit rien lever");
  // deux vias enterrés empilés sur des plages disjointes : une technique, pas un défaut
  S.vias.length=0;touch();
  placeVia(30,30,"GND",0,1,false);
  placeVia(30,30,"GND",2,3,false);
  if(runDrc().some(e=>/recouvrent|même point/.test(e.msg)))
    throw new Error("un empilage de vias enterrés disjoints est légitime");
  S.vias.length=0;touch();S.avoid=true;
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
/* ==========================================================================
   Cross-probing schéma ↔ PCB (commun/session.js + pcbSonde/pcbSonderCible)
   « ce U1 » sélectionné ici doit amener sur ce même U1 là-bas — et rien de
   sélectionné ne doit rien changer à la navigation d'avant.
   ========================================================================== */
T("cross-probing : pcbSonde répond pour une empreinte, un net, ou rien",()=>{
  dom.session.clear();
  carteVide();importNetlist(NET,false);
  const u1=S.fps.find(f=>f.ref==="U1");
  clearSel();S.sel.fps.add(u1.id);
  const s=pcbSonde("schema");
  if(!s||s.quoi!=="ref"||s.valeur!=="U1")
    throw new Error("une empreinte seule sélectionnée doit sonder sa référence : "+JSON.stringify(s));
  if(pcbSonde("composants")!==null)
    throw new Error("pcbSonde ne répond que pour \"schema\"");
  clearSel();S.hlNet="GND";
  const sn=pcbSonde("schema");
  if(!sn||sn.quoi!=="net"||sn.valeur!=="GND")
    throw new Error("un net mis en évidence doit se sonder par son nom : "+JSON.stringify(sn));
  clearSel();S.hlNet=null;
  if(pcbSonde("schema")!==null)
    throw new Error("rien de sélectionné ne doit rien sonder");
});
T("cross-probing : sessAller écrit la cible, l'arrivée la consomme une seule fois",()=>{
  dom.session.clear();
  carteVide();importNetlist(NET,false);
  sessBrancher("pcb",()=>({doc:docObj(),sale:S.dirty}),pcbSonde);
  const u1=S.fps.find(f=>f.ref==="U1");
  clearSel();S.sel.fps.add(u1.id);
  sessAller("schema");              // écrit la cible {outil:"schema", quoi:"ref", valeur:"U1"}
  const c=sessCiblePrendre("schema");
  if(!c||c.quoi!=="ref"||c.valeur!=="U1")
    throw new Error("la cible écrite pour le schéma ne revient pas telle quelle : "+JSON.stringify(c));
  if(sessCiblePrendre("schema")!==null)
    throw new Error("une cible consommée ne doit pas resservir");
  dom.session.clear();
});
T("cross-probing : arrivée sans sélection ne pose aucune cible",()=>{
  dom.session.clear();
  carteVide();importNetlist(NET,false);
  sessBrancher("pcb",()=>({doc:docObj(),sale:S.dirty}),pcbSonde);
  clearSel();
  sessAller("schema");
  if(sessCiblePrendre("schema")!==null)
    throw new Error("sans sélection, la navigation ne doit pas déposer de cible");
  dom.session.clear();
});
T("cross-probing : pcbSonderCible sélectionne et cadre l'empreinte visée",()=>{
  dom.session.clear();
  carteVide();importNetlist(NET,false);
  clearSel();S.scale=1;S.ox=0;S.oy=0;
  sessCibleEcrire("pcb","ref","D1");
  pcbSonderCible();
  const d1=S.fps.find(f=>f.ref==="D1");
  if(!S.sel.fps.has(d1.id))throw new Error("D1 devait être sélectionné après le saut");
  if(sessCiblePrendre("pcb")!==null)
    throw new Error("pcbSonderCible doit consommer la cible");
  dom.session.clear();
});
/* ==========================================================================
   Cross-probing entre deux onglets (BroadcastChannel)
   Deux onglets côte à côte ne partagent pas sessionStorage : c'est ce canal-ci
   qui porte « montre-moi ça » de l'un à l'autre, sur demande.
   ========================================================================== */
function pied(){ return document.getElementById("fHint").textContent||""; }
function voisinOnglet(){
  /* un onglet d'à côté : il écoute le même canal sans être le nôtre */
  const bc=new BroadcastChannel(SESS_CANAL);
  bc.recu=[];
  bc.onmessage=ev=>{bc.recu.push(ev.data);};
  return bc;
}
T("2 onglets : le canal est disponible et la demande part avec le bon repère",()=>{
  const voisin=voisinOnglet();
  carteVide();importNetlist(NET,false);
  const u1=S.fps.find(f=>f.ref==="U1");
  clearSel();S.sel.fps.add(u1.id);
  if(!sessCanalDispo())throw new Error("le canal devait être disponible");
  pcbMontrerAilleurs();
  const m=voisin.recu.find(x=>x.type==="montre");
  if(!m)throw new Error("aucune demande n'est partie vers l'onglet voisin");
  if(m.outil!=="schema"||m.quoi!=="ref"||m.valeur!=="U1")
    throw new Error("demande inattendue : "+JSON.stringify(m));
  voisin.close();
});
T("2 onglets : sans sélection, rien ne part et on le dit",()=>{
  const voisin=voisinOnglet();
  carteVide();importNetlist(NET,false);
  clearSel();S.hlNet=null;
  pcbMontrerAilleurs();
  if(voisin.recu.length)
    throw new Error("rien ne devait partir : "+JSON.stringify(voisin.recu));
  voisin.close();
});
T("2 onglets : l'accusé de réception distingue « vu » de « absent »",()=>{
  const voisin=voisinOnglet();
  carteVide();importNetlist(NET,false);
  const u1=S.fps.find(f=>f.ref==="U1");
  clearSel();S.sel.fps.add(u1.id);
  /* l'onglet voisin répond qu'il l'a trouvé */
  voisin.onmessage=ev=>{
    if(ev.data.type==="montre")
      voisin.postMessage({v:1,type:"vu",outil:"schema",ok:true});
  };
  pcbMontrerAilleurs();
  if(!/montré sur le schéma/.test(pied()))
    throw new Error("« vu » devait être annoncé : "+pied());
  /* et maintenant qu'il ne l'a pas */
  voisin.onmessage=ev=>{
    if(ev.data.type==="montre")
      voisin.postMessage({v:1,type:"vu",outil:"schema",ok:false});
  };
  pcbMontrerAilleurs();
  if(!/n'est pas sur le schéma/.test(pied()))
    throw new Error("« absent » devait être annoncé : "+pied());
  voisin.close();
});
T("2 onglets : une demande venue d'à côté sélectionne et répond « vu »",()=>{
  const voisin=voisinOnglet();
  carteVide();importNetlist(NET,false);
  clearSel();
  voisin.postMessage({v:1,type:"montre",outil:"pcb",quoi:"ref",valeur:"D1"});
  const d1=S.fps.find(f=>f.ref==="D1");
  if(!S.sel.fps.has(d1.id))throw new Error("D1 devait être sélectionné");
  const vu=voisin.recu.find(x=>x.type==="vu");
  if(!vu||vu.ok!==true)throw new Error("l'accusé « vu » devait revenir : "+JSON.stringify(vu));
  /* un repère absent : on répond, mais en disant que non */
  voisin.recu.length=0;clearSel();
  voisin.postMessage({v:1,type:"montre",outil:"pcb",quoi:"ref",valeur:"ZZ99"});
  const non=voisin.recu.find(x=>x.type==="vu");
  if(!non||non.ok!==false)throw new Error("l'accusé devait dire « pas trouvé »");
  if(S.sel.fps.size)throw new Error("rien ne devait être sélectionné");
  voisin.close();
});
T("2 onglets : une demande adressée à un autre outil est ignorée",()=>{
  const voisin=voisinOnglet();
  carteVide();importNetlist(NET,false);
  clearSel();
  voisin.postMessage({v:1,type:"montre",outil:"schema",quoi:"ref",valeur:"D1"});
  if(S.sel.fps.size)throw new Error("le PCB ne doit pas répondre à une demande pour le schéma");
  if(voisin.recu.some(x=>x.type==="vu"))throw new Error("aucun accusé ne devait partir");
  voisin.close();
});
T("cross-probing : le saut attend la fin du chargement, sinon fit() l'efface",()=>{
  /* Régression : commun/workspace.js est chargé APRÈS js/18-reperage.js et se
     termine par resize() puis fit(). Consommée au fil du script, la cible
     était bien trouvée et sélectionnée, puis fit() recadrait sur la carte
     entière — la sélection devenait un point invisible et le saut paraissait
     n'avoir rien fait. sessCibleAuChargement() diffère jusqu'à « load », qui
     passe forcément après le dernier script de la page. */
  let appels=0;
  const marque=()=>{appels++;};
  sessCibleAuChargement(marque);
  if(appels)throw new Error("le document n'est pas « complete » : il fallait attendre");
  dom.fireWin("load",{});
  if(appels!==1)throw new Error("« load » devait déclencher le saut, "+appels+" appel(s)");
  /* une page déjà chargée n'a rien à attendre : on ne diffère pas pour rien */
  const sauve=document.readyState;
  document.readyState="complete";
  let direct=0;
  sessCibleAuChargement(()=>{direct++;});
  document.readyState=sauve;
  if(direct!==1)throw new Error("document complete : le saut devait partir tout de suite");
});
T("cross-probing : une cible introuvable ne casse rien et ne sélectionne rien",()=>{
  dom.session.clear();
  carteVide();importNetlist(NET,false);
  clearSel();
  sessCibleEcrire("pcb","ref","N_EXISTE_PAS");
  pcbSonderCible();                 // ne doit pas lever
  if(S.sel.fps.size)throw new Error("rien ne devait être sélectionné");
  dom.session.clear();
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

/* ==========================================================================
   Le moteur de routage : géométrie et modèle du monde
   --------------------------------------------------------------------------
   Deux propriétés portent tout le reste, et se vérifient ici plutôt qu'en
   observant le tracé : une enveloppe qui n'est jamais trop petite — sinon le
   routeur pose du cuivre que le DRC refuse — et un index qui rend exactement
   ce que rendait le balayage complet, ni plus ni moins.
   ========================================================================== */
/* Un générateur reproductible : deux exécutions du banc doivent tomber sur la
   même carte, faute de quoi un échec ne se rejoue pas. */
function alea(graine){
  let s=graine>>>0;
  return ()=>{s=(s*1664525+1013904223)>>>0;return s/4294967296;};
}
/* L'enveloppe se juge sur deux propriétés, et ce sont les deux seules qui
   comptent :
     · elle **contient** la forme gonflée — sinon le routeur poserait du cuivre
       que le DRC refuse ;
     · chacun de ses huit pans **touche** cette forme — sinon elle serait plus
       grasse qu'il ne faut, et refuserait des passages qui tiennent.
   La seconde est la définition même du plus petit octogone de cette
   orientation : aucune constante d'ajustement à choisir, aucune tolérance à
   débattre. */
const PNS_D8T=[[1,0],[1,1],[0,1],[-1,1],[-1,0],[-1,-1],[0,-1],[1,-1]]
  .map(d=>{const n=Math.hypot(d[0],d[1]);return {x:d[0]/n,y:d[1]/n};});
/* Le contour de la forme gonflée de `infl`, échantillonné : pour chaque
   direction, le rayon où `mesure` vaut exactement `infl`. */
function contourGonfle(cx,cy,mesure,infl,n){
  const out=[];
  for(let i=0;i<(n||96);i++){
    const a=i*2*Math.PI/(n||96);
    let lo=0, hi=40;
    for(let k=0;k<64;k++){
      const m=(lo+hi)/2;
      if(mesure(cx+Math.cos(a)*m,cy+Math.sin(a)*m)<infl)lo=m;else hi=m;
    }
    out.push({x:cx+Math.cos(a)*lo,y:cy+Math.sin(a)*lo});
  }
  return out;
}
function verifieOctogone(nom,sup,infl,H,bord){
  if(H.length<4)throw new Error(nom+" : enveloppe dégénérée ("+H.length+" sommets)");
  /* Le pan touche la forme : son appui vaut EXACTEMENT celui de la forme
     gonflée. On le compare à la fonction d'appui elle-même et non à un contour
     échantillonné — un échantillonnage radial rate le point extrémal d'une
     forme allongée, et ferait passer pour de la graisse ce qui n'est que le
     pas de l'échantillon. */
  for(const d of PNS_D8T){
    let hh=-1e18;
    for(const q of H)hh=Math.max(hh,q.x*d.x+q.y*d.y);
    const att=sup(d.x,d.y)+infl;
    if(Math.abs(hh-att)>1e-9)
      throw new Error(nom+" : le pan à "+fmt(Math.atan2(d.y,d.x)*180/Math.PI,0)+
                      "° est à "+fmt(hh-att,6)+" mm de son appui");
  }
  /* Et la forme gonflée tient dedans — conséquence de ce qui précède, vérifiée
     tout de même : c'est la propriété dont dépend l'absence de faute DRC. */
  for(const p of bord)
    if(!inPoly(p.x,p.y,H)&&!pnsOnEdge(p.x,p.y,H,1e-6))
      throw new Error(nom+" : la forme gonflée déborde de son enveloppe en "+
                      fmt(p.x,3)+","+fmt(p.y,3));
}
T("enveloppe : elle contient la forme gonflée, et chaque pan la touche",()=>{
  setCornerMode("45");
  const infl=0.35;
  const formes=[
    {shape:"circ",w:1.2,h:1.2,rot:0},
    {shape:"rect",w:1.6,h:0.8,rot:0},
    {shape:"sharp",w:1.6,h:0.8,rot:30*Math.PI/180},
    {shape:"oval",w:2.0,h:0.9,rot:-0.7}
  ];
  for(const f of formes){
    const q=Object.assign({x:7.3,y:-2.1,net:"",n:1,drill:0},f);
    const sup=(dx,dy)=>pnsSupPad(q,dx,dy);
    verifieOctogone(f.shape,sup,infl,pnsOct(sup,infl),
                    contourGonfle(q.x,q.y,(x,y)=>padDist(x,y,q),infl));
  }
});
T("enveloppe : le via et le segment suivent la même règle",()=>{
  setCornerMode("45");
  const infl=0.28;
  const v={x:3,y:4,d:0.8,a:0,b:1,net:""};
  const supV=(dx,dy)=>pnsSupVia(v,dx,dy);
  verifieOctogone("via",supV,infl,pnsOct(supV,infl),
                  contourGonfle(v.x,v.y,(x,y)=>dist(x,y,v.x,v.y)-v.d/2,infl));
  const t={x1:2,y1:2,x2:9,y2:6,w:0.5};
  const supS=(dx,dy)=>pnsSupSeg(t,dx,dy);
  const H=pnsOct(supS,infl);
  verifieOctogone("segment",supS,infl,H,
    contourGonfle((t.x1+t.x2)/2,(t.y1+t.y2)/2,
                  (x,y)=>segDist(x,y,t.x1,t.y1,t.x2,t.y2)-t.w/2,infl));
  if(!inPoly(t.x1,t.y1,H)||!inPoly(t.x2,t.y2,H))
    throw new Error("l'enveloppe d'un segment doit couvrir ses extrémités");
});
T("enveloppe : en règle « 90 », l'octogone devient le rectangle englobant",()=>{
  const q={x:0,y:0,w:1.6,h:0.8,rot:0,shape:"rect",net:"",n:1,drill:0};
  const H=pnsOct((dx,dy)=>pnsSupPad(q,dx,dy),0.2,"90");
  if(H.length!==4)throw new Error("quatre sommets attendus, "+H.length);
  for(const p of H)
    if(Math.abs(Math.abs(p.x)-1.0)>1e-9||Math.abs(Math.abs(p.y)-0.6)>1e-9)
      throw new Error("sommet inattendu : "+fmt(p.x,3)+","+fmt(p.y,3));
});
T("index : le voisinage rend exactement ce que rendait le balayage complet",()=>{
  const rnd=alea(20260823);
  S.fps=[];S.tracks=[];S.vias=[];S.zones=[];clearSel();
  setCuCount(4);S.board={x:0,y:0,w:60,h:60,pts:null};boardChanged();
  const nets=["A","B","C",""];
  for(let i=0;i<8;i++){
    const f=mkFp("U"+i,"","",4);
    f.style="row";f.pitch=2.54;
    f.x=r3(4+rnd()*50);f.y=r3(4+rnd()*50);f.rot=Math.floor(rnd()*4)*90;
    f.side=rnd()<0.3?1:0;
    f.nets={1:nets[Math.floor(rnd()*4)],2:nets[Math.floor(rnd()*4)],
            3:nets[Math.floor(rnd()*4)],4:nets[Math.floor(rnd()*4)]};
    S.fps.push(f);
  }
  for(let i=0;i<40;i++){
    const x=r3(2+rnd()*56), y=r3(2+rnd()*56);
    S.tracks.push({l:Math.floor(rnd()*4), net:nets[Math.floor(rnd()*4)],
                   w:0.2+r3(rnd()*0.4), x1:x, y1:y,
                   x2:r3(x+(rnd()-0.5)*14), y2:r3(y+(rnd()-0.5)*14)});
  }
  for(let i=0;i<10;i++)
    S.vias.push({x:r3(2+rnd()*56), y:r3(2+rnd()*56), d:0.8, drill:0.4,
                 a:0, b:3, net:nets[Math.floor(rnd()*4)]});
  touch();

  const cle=o=>{
    if(o.k==="P")return "P"+o.fp.id+"."+o.q.n;
    if(o.k==="V")return "V"+S.vias.indexOf(o.v);
    return "T"+S.tracks.indexOf(o.src);
  };
  /* la référence : l'ancien balayage, mot pour mot, au seuil du DRC */
  const naif=(s,l,net,w,self)=>{
    const out=[];
    for(const fp of S.fps)
      for(const q of padsWorld(fp)){
        if(!padLayers(fp,q).includes(l))continue;
        if(net&&q.net===net)continue;
        if(segPadDist({x1:s.x1,y1:s.y1,x2:s.x2,y2:s.y2,w},q)<clrPair(net,q.net)-PNS_EPS)
          out.push("P"+fp.id+"."+q.n);
      }
    S.vias.forEach((v,i)=>{
      if(l<v.a||l>v.b)return;
      if(net&&v.net===net)return;
      if(segDist(v.x,v.y,s.x1,s.y1,s.x2,s.y2)-v.d/2-w/2<clrPair(net,v.net)-PNS_EPS)
        out.push("V"+i);
    });
    S.tracks.forEach((t,i)=>{
      if(t===self||t.l!==l)return;
      if(net&&t.net===net)return;
      if(segSegDist({x1:s.x1,y1:s.y1,x2:s.x2,y2:s.y2},t)-t.w/2-w/2<clrPair(net,t.net)-PNS_EPS)
        out.push("T"+i);
    });
    return out.sort().join(",");
  };
  const N=pnsWorld();
  let vus=0;
  for(const t of S.tracks){
    const att=naif(t,t.l,t.net,t.w,t);
    const got=N.segColliding(t,t.l,t.net,t.w,new Set([t])).map(cle).sort().join(",");
    if(att!==got)
      throw new Error("voisinage différent sur T"+S.tracks.indexOf(t)+
                      "\n  balayage : "+att+"\n  index    : "+got);
    if(att)vus++;
  }
  if(vus<5)throw new Error("le décor devait produire des conflits, il en a "+vus);
});
T("index : une branche essaie sans salir son parent",()=>{
  S.fps=[];S.tracks=[];S.vias=[];S.zones=[];clearSel();
  setCuCount(2);S.board={x:0,y:0,w:40,h:40,pts:null};boardChanged();
  const gene={l:0,net:"GENE",w:0.4,x1:20,y1:0,x2:20,y2:40};
  S.tracks.push(gene);touch();
  const R=pnsWorld();
  const seg={x1:10,y1:20,x2:30,y2:20};
  if(!R.segBad(seg,0,"SIG",0.3))throw new Error("la piste en travers doit gêner");

  const B=R.branch();
  const it=[...B.query(0,0,19,19,21,21)].find(o=>o.src===gene);
  if(!it)throw new Error("la branche doit voir le cuivre de son parent");
  B.remove(it);
  if(B.segBad(seg,0,"SIG",0.3))throw new Error("la branche l'a retiré, elle ne doit plus le voir");
  if(!R.segBad(seg,0,"SIG",0.3))throw new Error("le parent, lui, n'a pas bougé");
  // du cuivre neuf, posé là où le parent n'a rien : à gauche de la génératrice
  const sonde={x1:5,y1:23,x2:5,y2:27};
  B.add(pnsItemSeg(0,"GENE",0.4,2,25,8,25,null));
  if(!B.segBad(sonde,0,"SIG",0.3))
    throw new Error("le cuivre posé dans la branche doit gêner dans la branche");
  if(R.segBad(sonde,0,"SIG",0.3))
    throw new Error("il ne doit pas exister pour le parent");

  B.commit();
  if(R.segBad(seg,0,"SIG",0.3))throw new Error("après versement, le retrait vaut pour le parent");
  if(!R.segBad(sonde,0,"SIG",0.3))
    throw new Error("après versement, l'ajout vaut pour le parent");
});
T("assemblage : des segments bout à bout font une ligne, un embranchement l'arrête",()=>{
  S.fps=[];S.tracks=[];S.vias=[];S.zones=[];clearSel();
  setCuCount(2);S.board={x:0,y:0,w:40,h:40,pts:null};boardChanged();
  const a={l:0,net:"T",w:0.3,x1:5,y1:5,x2:10,y2:5};
  const b={l:0,net:"T",w:0.3,x1:10,y1:5,x2:15,y2:10};
  const c={l:0,net:"T",w:0.3,x1:15,y1:10,x2:15,y2:20};
  S.tracks.push(a,b,c);touch();
  const N=pnsWorld();
  const item=[...N.all()].find(o=>o.src===b);
  const L=N.assemble(item);
  if(L.pts.length!==4)
    throw new Error("trois segments font quatre sommets, pas "+L.pts.length);
  if(dist(L.pts[0].x,L.pts[0].y,5,5)>1e-9&&dist(L.pts[0].x,L.pts[0].y,15,20)>1e-9)
    throw new Error("la ligne doit partir d'un bout libre : "+L.pts[0].x+","+L.pts[0].y);
  if(Math.abs(pnsLen(L.pts)-(5+Math.hypot(5,5)+10))>1e-6)
    throw new Error("longueur assemblée : "+fmt(pnsLen(L.pts),3));

  // un embranchement en T coupe l'assemblage net
  S.tracks.push({l:0,net:"T",w:0.3,x1:10,y1:5,x2:10,y2:0});touch();
  const N2=pnsWorld();
  const it2=[...N2.all()].find(o=>o.src===b);
  const L2=N2.assemble(it2);
  if(L2.items.length!==2)
    throw new Error("l'assemblage doit s'arrêter à l'embranchement, "+L2.items.length+" segments");
});
T("trame 45° : un tronçon bâtard se redresse, les deux postures sont rendues",()=>{
  setCornerMode("45");
  const droite=[{x:0,y:0},{x:5,y:5},{x:10,y:5}];
  const r1=pnsSnap45(droite);
  if(r1.length!==1)throw new Error("une ligne déjà droite ne se dédouble pas");
  if(!pnsIs45(r1[0]))throw new Error("elle doit rester droite");

  const biais=[{x:0,y:0},{x:10,y:3}];
  const r2=pnsSnap45(biais);
  if(r2.length!==2)throw new Error("un tronçon bâtard doit rendre deux postures");
  for(const p of r2){
    if(!pnsIs45(p))throw new Error("posture non redressée");
    if(dist(p[0].x,p[0].y,0,0)>1e-9)throw new Error("le départ ne doit pas bouger");
    const f=p[p.length-1];
    if(dist(f.x,f.y,10,3)>1e-9)throw new Error("l'arrivée ne doit pas bouger");
  }
  if(pnsLen(r2[0])<=pnsLen(biais)-1e-9)throw new Error("redresser ne raccourcit pas");
  // en angle libre, rien n'est bâtard
  setCornerMode("free");
  if(!pnsIs45(biais))throw new Error("en angle libre, tout tronçon est droit");
  setCornerMode("45");
});

/* ==========================================================================
   Le contournement
   ========================================================================== */
/* Un plateau nu : la carte, une couche active, l'anti-collision en marche. */
function plateau(w,h,mode){
  S.fps=[];S.tracks=[];S.vias=[];S.zones=[];clearSel();
  setCuCount(2);S.board={x:0,y:0,w:w||60,h:h||40,pts:null};boardChanged();
  setActive(0);S.avoid=true;setCornerMode("45");
  S.rule.route=mode||"shove";
  S.grid=0;S.origin.x=0;S.origin.y=0;
  touch();
}
/* Ce que tout trajet posé doit respecter, quel que soit le chemin pris. */
function trajetPropre(nom,segs,net,w){
  const N=pnsWorld();
  for(const s of segs){
    if(!pnsDirOk({x:s.x1,y:s.y1},{x:s.x2,y:s.y2}))
      throw new Error(nom+" : segment hors des huit sens ("+
                      fmt(s.x1,2)+","+fmt(s.y1,2)+" → "+fmt(s.x2,2)+","+fmt(s.y2,2)+")");
    const gene=N.segColliding(s,s.l,net,w);
    if(gene.length)
      throw new Error(nom+" : isolation violée par "+gene.length+" objet(s) sur le segment "+
                      fmt(s.x1,2)+","+fmt(s.y1,2)+" → "+fmt(s.x2,2)+","+fmt(s.y2,2));
  }
}
T("contournement : la piste fait le tour de l'obstacle au lieu de buter",()=>{
  plateau(60,40,"walk");
  S.vias.push({x:30,y:20,d:1.0,drill:0.5,a:0,b:1,net:"AUTRE"});touch();
  setMode("track");
  startRoute(10,20,true);
  S.route.net="SIG";S.route.w=0.3;
  routeToPoint({x:50,y:20});
  if(S.route.bad)throw new Error("le trajet devait être contourné, pas refusé");
  if(!S.route.contourne)throw new Error("le contournement devait servir");
  const P=S.route.preview;
  if(!P.length)throw new Error("aucun trajet");
  if(Math.abs(P[0].x1-10)>1e-9||Math.abs(P[0].y1-20)>1e-9)
    throw new Error("le départ ne doit pas bouger");
  const f=P[P.length-1];
  if(Math.abs(f.x2-50)>1e-9||Math.abs(f.y2-20)>1e-9)
    throw new Error("l'arrivée ne doit pas bouger : "+fmt(f.x2,3)+","+fmt(f.y2,3));
  if(!P.some(s=>Math.abs(s.y1-20)>0.3))
    throw new Error("le trajet est resté droit : il n'a rien contourné");
  trajetPropre("contournement",P,"SIG",0.3);
  stepRoute();commitRoute();setMode("select");
  const d=runDrc().filter(e=>!e.info);
  if(d.length)throw new Error("le DRC doit être muet, il dit : "+d[0].msg);
});
T("contournement : le côté le plus court l'emporte",()=>{
  plateau(60,40,"walk");
  /* L'obstacle mord la route, mais décentré vers le haut : son bord inférieur
     est à 0,6 mm de l'axe, son bord supérieur à 2,2 mm. Le tour par le bas est
     donc le plus court, et c'est celui que le contournement doit trouver. */
  S.vias.push({x:30,y:19.2,d:2.0,drill:0.6,a:0,b:1,net:"AUTRE"});touch();
  setMode("track");
  startRoute(10,20,true);
  S.route.net="SIG";S.route.w=0.3;
  routeToPoint({x:50,y:20});
  if(S.route.bad)throw new Error("le trajet devait passer");
  const ymax=Math.max(...S.route.preview.map(s=>Math.max(s.y1,s.y2)));
  const ymin=Math.min(...S.route.preview.map(s=>Math.min(s.y1,s.y2)));
  if(!(ymax-20>20-ymin))
    throw new Error("le tour devait passer par le bas (y croissant) : "+
                    fmt(ymin,2)+" → "+fmt(ymax,2));
  trajetPropre("côté court",S.route.preview,"SIG",0.3);
  cancelRoute();
});
T("contournement : sans passage, le trajet reste refusé",()=>{
  plateau(60,40,"walk");
  // deux pastilles laissant moins que l'isolation entre elles
  const cl=classOf("SIG").clr;
  const e=0.3+2*cl-0.1;                       // largeur de piste + isolations, moins un poil
  const A=mkFp("J1","","",1);A.style="row";A.x=30;A.y=20-e/2-0.5;A.nets={1:"A"};
  const B=mkFp("J2","","",1);B.style="row";B.x=30;B.y=20+e/2+0.5;B.nets={1:"B"};
  S.fps.push(A,B);touch();
  setMode("track");
  startRoute(28,20,true);
  S.route.net="SIG";S.route.w=0.3;
  routeToPoint({x:32,y:20});
  // le couloir est trop étroit, et la carte trop courte pour un grand tour
  if(!S.route.bad&&!S.route.contourne)
    throw new Error("sans passage ni contournement, le trajet doit être signalé");
  if(S.route.contourne)trajetPropre("faufilé",S.route.preview,"SIG",0.3);
  cancelRoute();
});
T("contournement : le détour ne sort pas de la carte",()=>{
  plateau(60,40,"walk");
  // une génératrice qui barre toute la hauteur : le seul tour possible sort
  S.tracks.push({l:0,net:"AUTRE",w:0.4,x1:30,y1:0,x2:30,y2:40});touch();
  setMode("track");
  startRoute(10,20,true);
  S.route.net="SIG";S.route.w=0.3;
  routeToPoint({x:50,y:20});
  if(!S.route.bad)
    throw new Error("le tour par l'extérieur de la carte ne doit pas être proposé");
  if(S.route.contourne)throw new Error("aucun contournement n'était possible");
  const avant=S.tracks.length;
  stepRoute();
  if(S.tracks.length!==avant)throw new Error("un trajet en défaut ne se pose pas");
  cancelRoute();
});
T("contournement : deux obstacles à la file se contournent l'un après l'autre",()=>{
  plateau(80,40,"walk");
  S.vias.push({x:26,y:20,d:1.0,drill:0.5,a:0,b:1,net:"A"});
  S.vias.push({x:40,y:20,d:1.0,drill:0.5,a:0,b:1,net:"B"});
  touch();
  setMode("track");
  startRoute(10,20,true);
  S.route.net="SIG";S.route.w=0.3;
  routeToPoint({x:60,y:20});
  if(S.route.bad)throw new Error("les deux obstacles devaient se contourner");
  trajetPropre("deux obstacles",S.route.preview,"SIG",0.3);
  stepRoute();commitRoute();setMode("select");
  const d=runDrc().filter(e=>!e.info);
  if(d.length)throw new Error("le DRC doit être muet, il dit : "+d[0].msg);
});

/* ==========================================================================
   Le shove
   ========================================================================== */
/* Un bout de piste existe-t-il encore, au point où on l'avait laissé ? Le shove
   a le droit de déformer une ligne, jamais d'en détacher les bouts. */
function boutTenu(x,y,l){
  for(const t of S.tracks){
    if(t.l!==l)continue;
    if(dist(t.x1,t.y1,x,y)<1e-6||dist(t.x2,t.y2,x,y)<1e-6)return true;
  }
  return false;
}
/* Toutes les pistes d'un net forment-elles encore une seule ligne continue ? */
function drcMuet(quoi){
  const d=runDrc().filter(e=>!e.info);
  if(d.length)throw new Error(quoi+" : le DRC dit « "+d[0].msg+" »");
}
T("shove : la piste gênante s'écarte au lieu de bloquer",()=>{
  plateau();
  const G={l:0,net:"GENE",w:0.3,x1:10,y1:20.3,x2:50,y2:20.3};
  S.tracks.push(G);touch();
  setMode("track");
  startRoute(15,20,true);
  S.route.net="SIG";S.route.w=0.3;
  routeToPoint({x:45,y:20});
  if(S.route.bad)throw new Error("le trajet devait passer en poussant");
  if(!S.route.shove||!S.route.shove.lignes.length)
    throw new Error("aucune ligne n'a été poussée");
  if(S.route.shove.lignes.length!==1)
    throw new Error("une seule ligne devait bouger, "+S.route.shove.lignes.length);
  // l'aperçu ne touche pas encore la carte
  if(S.tracks.length!==1)throw new Error("l'aperçu ne doit rien poser");
  stepRoute();commitRoute();setMode("select");
  if(!boutTenu(10,20.3,0)||!boutTenu(50,20.3,0))
    throw new Error("les bouts de la piste poussée ne doivent pas bouger");
  // la piste poussée s'est bien écartée du couloir
  const ecart=S.tracks.filter(t=>t.net==="GENE")
                      .some(t=>Math.max(t.y1,t.y2)>20.5);
  if(!ecart)throw new Error("la piste n'a pas été écartée");
  for(const t of S.tracks)
    if(!pnsDirOk({x:t.x1,y:t.y1},{x:t.x2,y:t.y2}))
      throw new Error("segment hors des huit sens après poussée");
  drcMuet("après poussée");
});
T("shove : la poussée se propage de piste en piste",()=>{
  plateau();
  for(let k=0;k<3;k++)
    S.tracks.push({l:0,net:"G"+k,w:0.3,x1:10,y1:20.3+k*0.6,x2:50,y2:20.3+k*0.6});
  touch();
  setMode("track");
  startRoute(15,20,true);
  S.route.net="SIG";S.route.w=0.3;
  routeToPoint({x:45,y:20});
  if(S.route.bad)throw new Error("le trajet devait passer");
  const bouge=new Set(S.route.shove.lignes.map(L=>L.net));
  if(bouge.size!==3)
    throw new Error("les trois pistes devaient s'écarter, "+bouge.size+" l'ont fait");
  stepRoute();commitRoute();setMode("select");
  for(let k=0;k<3;k++)
    if(!boutTenu(10,20.3+k*0.6,0)||!boutTenu(50,20.3+k*0.6,0))
      throw new Error("les bouts de G"+k+" ne doivent pas bouger");
  drcMuet("après propagation");
});
T("shove : une pastille ne se pousse pas, la tête la contourne",()=>{
  plateau();
  const A=mkFp("J1","","",1);A.style="row";A.x=30;A.y=20;A.nets={1:"AUTRE"};
  S.fps.push(A);touch();
  setMode("track");
  startRoute(15,20,true);
  S.route.net="SIG";S.route.w=0.3;
  routeToPoint({x:45,y:20});
  if(S.route.bad)throw new Error("la pastille devait être contournée");
  if(S.route.shove&&S.route.shove.lignes.length)
    throw new Error("rien ne devait être poussé");
  const fp=S.fps[0];
  if(Math.abs(fp.x-30)>1e-9||Math.abs(fp.y-20)>1e-9)
    throw new Error("le boîtier ne doit pas avoir bougé");
  trajetPropre("pastille contournée",S.route.preview,"SIG",0.3);
  cancelRoute();
});
T("shove : sans issue, on se rabat sans jamais casser le DRC",()=>{
  plateau();
  /* Une arrivée visée en plein sur une pastille étrangère : il n'y a pas de
     trajet, ni en poussant — une pastille ne se pousse pas — ni en
     contournant : le bout est DANS l'obstacle. Le seul comportement juste est
     de le dire et de ne rien poser. */
  const A=mkFp("J1","","",1);A.style="row";A.x=30;A.y=20;A.nets={1:"AUTRE"};
  S.fps.push(A);touch();
  const q=padsWorld(A)[0];
  setMode("track");
  startRoute(15,20,true);
  S.route.net="SIG";S.route.w=0.3;
  routeToPoint({x:q.x,y:q.y});
  if(!S.route.bad)throw new Error("aucun trajet ne passe : il faut le dire");
  const avant=S.tracks.length;
  stepRoute();
  if(S.tracks.length!==avant)throw new Error("un trajet en défaut ne se pose pas");
  if(S.route.done.length)throw new Error("aucun segment ne doit être retenu");
  cancelRoute();
  drcMuet("après un refus");
});
T("shove : un via s'écarte et emmène ce qui s'y raccroche",()=>{
  plateau();
  const V={x:30,y:20,d:0.8,drill:0.4,a:0,b:1,net:"AUTRE"};
  S.vias.push(V);
  S.tracks.push({l:0,net:"AUTRE",w:0.3,x1:30,y1:20,x2:30,y2:32});
  touch();
  setMode("track");
  startRoute(15,20,true);
  S.route.net="SIG";S.route.w=0.3;
  routeToPoint({x:45,y:20});
  if(S.route.bad)throw new Error("le via devait s'écarter");
  if(!S.route.shove||!S.route.shove.vias.length)
    throw new Error("aucun via n'a bougé");
  stepRoute();commitRoute();setMode("select");
  if(Math.abs(V.y-20)<1e-6&&Math.abs(V.x-30)<1e-6)
    throw new Error("le via n'a pas bougé");
  // la piste qui y était raccrochée l'a suivi
  if(!boutTenu(V.x,V.y,0))
    throw new Error("la piste doit toujours toucher le via, à sa nouvelle place");
  if(!boutTenu(30,32,0))throw new Error("l'autre bout ne doit pas bouger");
  drcMuet("après poussée d'un via");
});
T("shove : Ctrl+Z et l'abandon remettent le cuivre poussé en place",()=>{
  plateau();
  S.tracks.push({l:0,net:"GENE",w:0.3,x1:10,y1:20.3,x2:50,y2:20.3});
  touch();
  const avant=serialize();

  // abandon en cours de route (Échap)
  setMode("track");
  startRoute(15,20,true);
  S.route.net="SIG";S.route.w=0.3;
  routeToPoint({x:45,y:20});
  stepRoute();
  if(S.tracks.length<2)throw new Error("le clic devait poser du cuivre");
  cancelRoute();
  if(serialize()!==avant)
    throw new Error("l'abandon devait remettre la carte comme avant");

  // dépôt puis Ctrl+Z
  startRoute(15,20,true);
  S.route.net="SIG";S.route.w=0.3;
  routeToPoint({x:45,y:20});
  stepRoute();commitRoute();setMode("select");
  if(serialize()===avant)throw new Error("le dépôt devait changer la carte");
  undo();
  if(serialize()!==avant)
    throw new Error("Ctrl+Z devait défaire le tracé ET la poussée");
});
T("shove : la conduite face à l'obstacle se règle et se range avec le document",()=>{
  plateau();
  if(routeMode()!=="shove")throw new Error("le défaut est « pousser »");
  setRouteMode("walk");
  if(routeMode()!=="walk")throw new Error("le réglage n'a pas pris");
  const d=JSON.parse(serialize());
  if(d.rule.route!=="walk")throw new Error("le réglage doit suivre le document");
  loadDoc(normDoc(d),true);
  if(routeMode()!=="walk")throw new Error("il doit se relire");
  // un document muet se pousse, comme KiCad
  delete d.rule.route;
  loadDoc(normDoc(d),true);
  if(routeMode()!=="shove")throw new Error("un fichier muet vaut « pousser »");
  undo();
});

/* ==========================================================================
   L'optimiseur
   ========================================================================== */
T("optimiseur : un détour inutile se résorbe, les bouts ne bougent pas",()=>{
  plateau();
  const pts=[{x:10,y:20},{x:15,y:20},{x:15,y:25},{x:35,y:25},{x:35,y:20},{x:40,y:20}];
  const opt=pnsOptimize(pnsWorld(),{l:0,net:"SIG",w:0.3,pts},null,0);
  if(dist(opt[0].x,opt[0].y,10,20)>1e-9)throw new Error("le départ a bougé");
  const f=opt[opt.length-1];
  if(dist(f.x,f.y,40,20)>1e-9)throw new Error("l'arrivée a bougé");
  if(!pnsIs45(opt))throw new Error("le résultat doit rester à 45°");
  if(pnsLen(opt)>30+1e-6)
    throw new Error("le détour devait se résorber entièrement : "+fmt(pnsLen(opt),3)+
                    " mm au lieu de 30");
});
T("optimiseur : il ne raccourcit jamais à travers un obstacle",()=>{
  plateau();
  S.vias.push({x:25,y:20,d:1.2,drill:0.6,a:0,b:1,net:"AUTRE"});touch();
  const pts=[{x:10,y:20},{x:15,y:20},{x:15,y:25},{x:35,y:25},{x:35,y:20},{x:40,y:20}];
  const N=pnsWorld();
  const opt=pnsOptimize(N,{l:0,net:"SIG",w:0.3,pts},null,0);
  if(N.firstObstacle({l:0,net:"SIG",w:0.3,pts:opt}))
    throw new Error("l'optimiseur a raccourci à travers le via");
  if(pnsLen(opt)<=30+1e-6)
    throw new Error("il ne pouvait pas descendre jusqu'à la ligne droite");
});
T("optimiseur : un sommet tenu par un via ne se déplace pas",()=>{
  plateau();
  // le via est du même net : ce n'est pas un obstacle, c'est une ancre
  S.vias.push({x:15,y:25,d:0.8,drill:0.4,a:0,b:1,net:"SIG"});touch();
  const pts=[{x:10,y:20},{x:15,y:20},{x:15,y:25},{x:35,y:25},{x:35,y:20},{x:40,y:20}];
  const opt=pnsOptimize(pnsWorld(),{l:0,net:"SIG",w:0.3,pts},null,0);
  if(!opt.some(p=>dist(p.x,p.y,15,25)<1e-9))
    throw new Error("le sommet posé sur le via devait être conservé");
});
T("optimiseur : il nettoie le tour d'enveloppe, jamais le coude voulu",()=>{
  plateau(60,40,"walk");
  S.vias.push({x:30,y:20,d:1.0,drill:0.5,a:0,b:1,net:"AUTRE"});touch();
  setMode("track");
  startRoute(10,20,true);
  S.route.net="SIG";S.route.w=0.3;
  routeToPoint({x:50,y:20});
  stepRoute();
  const apres=pnsLen(pnsPts(S.route.done));
  if(!pnsIs45(pnsPts(S.route.done)))throw new Error("le tracé doit rester à 45°");
  if(apres<20-1e-9)throw new Error("plus court que la ligne droite : impossible");
  commitRoute();setMode("select");
  drcMuet("après optimisation d'un contournement");

  // un coude posé au doigt, sans obstacle : l'optimiseur ne doit pas y toucher
  plateau(60,40,"walk");
  setMode("track");
  startRoute(10,10,true);
  S.route.net="SIG";S.route.w=0.3;
  routeToPoint({x:10,y:30});stepRoute();
  routeToPoint({x:40,y:30});stepRoute();
  const p=pnsPts(S.route.done);
  if(!p.some(q=>dist(q.x,q.y,10,30)<1e-6))
    throw new Error("le coude voulu par l'utilisateur doit être conservé");
  cancelRoute();
});

/* ==========================================================================
   Les paires différentielles sur le moteur
   ========================================================================== */
/* Les deux pastilles de la paire, sur un connecteur donné. */
function padsPaire(f){
  const l=padsWorld(f);
  return {p:l.find(q=>q.net==="USB_DP"),n:l.find(q=>q.net==="USB_DM")};
}
T("paire : la ligne équivalente porte les deux nets de la paire",()=>{
  const c=carteDp();
  dpAutoAll();
  const q=S.dpPairs[0], g=dpGeom(q,0);
  // du cuivre de la paire elle-même, en travers de l'axe
  S.tracks.push({l:0,net:q.n,w:g.w,x1:30,y1:26,x2:50,y2:26});touch();
  const D={layer:0,pair:q,w:g.w,gap:g.gap};
  const L=dpLine(D,[{x:40,y:20},{x:40,y:34}]);
  if(!L.nets.has(q.p)||!L.nets.has(q.n))
    throw new Error("la ligne doit connaître ses deux nets");
  if(Math.abs(L.w-(g.gap+2*g.w))>1e-9)
    throw new Error("la largeur doit valoir l'encombrement de la paire");
  if(pnsWorld().firstObstacle(L))
    throw new Error("son propre jumeau n'est pas un obstacle");
  // le même trajet, sans les nets jumeaux : là, il gêne
  const seul=Object.assign({},L);delete seul.nets;
  if(!pnsWorld().firstObstacle(seul))
    throw new Error("le décor devait produire un conflit");
});
T("paire : le cuivre gênant s'écarte devant la paire",()=>{
  const c=carteDp();
  dpAutoAll();
  S.rule.route="shove";S.avoid=true;
  S.board={x:0,y:0,w:90,h:60,pts:null};boardChanged();
  const q=S.dpPairs[0];
  /* Une génératrice étrangère qui LONGE le trajet de la paire, d'un peu trop
     près. Ses bouts sont libres : elle peut se déformer pour laisser passer.
     Une barrière en travers, elle, n'aurait pas de solution — une paire ne
     traverse pas du cuivre étranger sans changer de couche. */
  S.tracks.push({l:0,net:"GENE",w:0.3,x1:30,y1:25.9,x2:44,y2:25.9});touch();
  setMode("dpair");
  if(!dpStart((c.a.p.x+c.a.n.x)/2,(c.a.p.y+c.a.n.y)/2))
    throw new Error("départ refusé");
  dpUpdate(c.b.p.x,c.b.p.y);
  if(S.dp.bad)throw new Error("la paire devait passer en poussant : "+
                              (S.dp.cross?"croisement":"isolation"));
  if(!S.dp.shove||!S.dp.shove.lignes.length)
    throw new Error("la génératrice devait s'écarter");
  dpStep();
  if(S.dp)dpCommit();
  setMode("select");
  /* La génératrice est libre à ses deux bouts : elle se translate en bloc.
     Elle a donc bougé, mais elle n'a ni changé de longueur ni été coupée. */
  const G=S.tracks.filter(t=>t.net==="GENE");
  const lg=G.reduce((s2,t)=>s2+dist(t.x1,t.y1,t.x2,t.y2),0);
  if(Math.abs(lg-14)>1e-6)
    throw new Error("la génératrice a changé de longueur : "+fmt(lg,3));
  if(!G.some(t=>Math.abs(t.y1-25.9)>1e-6||Math.abs(t.y2-25.9)>1e-6))
    throw new Error("la génératrice n'a pas bougé");
  drcMuet("après poussée devant une paire");
  // et l'écart de la paire est resté celui de la règle
  const cp=dpCoupling(q);
  if(cp.coupled<cp.len*0.6)
    throw new Error("le couplage s'est perdu : "+fmt(cp.coupled,1)+" sur "+fmt(cp.len,1));
});
T("paire : l'abandon et le Ctrl+Z remettent le cuivre poussé en place",()=>{
  const c=carteDp();
  dpAutoAll();
  S.rule.route="shove";S.avoid=true;
  S.board={x:0,y:0,w:90,h:60,pts:null};boardChanged();
  S.tracks.push({l:0,net:"GENE",w:0.3,x1:30,y1:25.9,x2:44,y2:25.9});touch();
  const avant=serialize();
  setMode("dpair");
  dpStart((c.a.p.x+c.a.n.x)/2,(c.a.p.y+c.a.n.y)/2);
  dpUpdate(c.b.p.x,c.b.p.y);
  dpStep();
  if(S.dp&&serialize()===avant)throw new Error("le clic devait changer la carte");
  if(S.dp)dpCancel();else undo();
  if(serialize()!==avant)
    throw new Error("l'abandon devait remettre la carte comme avant");
});

T("un départ qui n'accroche rien le dit tout de suite",()=>{
  plateau();
  const f=mkFp("R1","10k","0603",2);f.style="row";f.pitch=2.54;f.x=10;f.y=12;f.rot=90;
  f.nets={1:"NET1",2:""};
  S.fps.push(f);touch();
  const q=padsWorld(f).find(p=>p.n===1);
  S.scale=20;                              // l'aimant porte alors à 0,45 mm
  setMode("track");
  // dans le cuivre de la pastille : on accroche, et on hérite du net
  startRoute(q.x,q.y);
  if(S.route.net!=="NET1")throw new Error("le net de la pastille devait être repris");
  if(dist(S.route.pt.x,S.route.pt.y,q.x,q.y)>1e-9)
    throw new Error("le départ devait être le centre de la pastille");
  cancelRoute();
  // un demi-millimètre à côté du cuivre : hors de portée, et il faut le dire
  startRoute(q.x-q.w/2-0.5,q.y-0.3);
  if(S.route.net!=="")throw new Error("aucun net ne pouvait être accroché");
  const dit=$("fHint").textContent;
  if(!/aucun net/.test(dit))
    throw new Error("le départ sur rien doit être annoncé, or le pied dit : "+dit);
  cancelRoute();
});
T("la touche D casse l'angle droit sans lâcher la pastille",()=>{
  plateau(60,40,"walk");
  const f=mkFp("R1","10k","0603",2);f.style="row";f.pitch=2.54;f.x=10;f.y=12;f.rot=90;
  f.nets={1:"NET1",2:""};
  S.fps.push(f);touch();
  const q=padsWorld(f).find(p=>p.n===1);
  setCornerMode("45");
  /* La topologie qui pose problème : une longue horizontale depuis la
     pastille, une courte verticale, puis un 45° déjà en place. */
  const T1={l:0,net:"NET1",w:0.3,x1:q.x,y1:q.y,x2:37,y2:q.y};
  const T2={l:0,net:"NET1",w:0.3,x1:37,y1:q.y,x2:37,y2:13.7};
  const T3={l:0,net:"NET1",w:0.3,x1:37,y1:13.7,x2:35.4,y2:15.3};
  S.tracks.push(T1,T2,T3);touch();
  if(!mitreAt(0,37,q.y,true))throw new Error("l'angle droit devait être adoucissable");
  setMode("select");clearSel();S.sel.tracks.add(T2);
  if(mitreSel()!==1)throw new Error("un angle devait être adouci");
  /* Le coude visé n'est plus un angle droit d'axe — une horizontale qui
     rencontre une verticale. Deux diagonales qui se rejoignent à 90°, en
     revanche, sont du 45° parfaitement fabricable : ce n'est pas ce qu'on
     cherchait à casser, et `mitreAt` accepterait pourtant de les reprendre. */
  const axe=t=>Math.abs(t.x1-t.x2)<1e-9?"V":(Math.abs(t.y1-t.y2)<1e-9?"H":"D");
  for(const a of S.tracks)
    for(const b of S.tracks){
      if(a===b||dist(a.x2,a.y2,b.x1,b.y1)>1e-6)continue;
      const ka=axe(a), kb=axe(b);
      if((ka==="H"&&kb==="V")||(ka==="V"&&kb==="H"))
        throw new Error("il reste un angle droit d'axe en "+fmt(a.x2,2)+","+fmt(a.y2,2));
    }
  // et la pastille n'a pas été lâchée
  if(!S.tracks.some(t=>dist(t.x1,t.y1,q.x,q.y)<1e-9||dist(t.x2,t.y2,q.x,q.y)<1e-9))
    throw new Error("le chanfrein a décroché la piste de sa pastille");
  for(const t of S.tracks)
    if(!pnsDirOk({x:t.x1,y:t.y1},{x:t.x2,y:t.y2}))
      throw new Error("segment hors des huit sens après chanfrein");
});

T("le chanfrein posé d'office casse l'angle sans déplacer le coude",()=>{
  plateau(80,50);
  setCornerMode("45");S.grid=0.25;
  const R1=mkFp("R1","10k","0603",2);R1.style="row";R1.pitch=2.54;
  R1.x=10;R1.y=12;R1.rot=90;R1.nets={1:"NET1",2:""};
  S.fps.push(R1);touch();
  const q=padsWorld(R1).find(p=>p.n===1);
  setMode("track");
  startRoute(q.x,q.y);
  const w=S.route.w;
  routeToPoint({x:55,y:q.y});stepRoute();     // longue horizontale : 45 mm
  routeToPoint({x:55,y:30});stepRoute();      // verticale : 19 mm
  commitRoute();setMode("select");

  /* Le coude reste à x = 55 : le chanfrein l'a cassé, pas déplacé. Maximal, il
     aurait ramené le coude à 55 − 19 = 36 mm, et le clic aurait disparu. */
  const borne=MITRE_AUTO*w;
  const proche=S.tracks.filter(t=>Math.min(t.x1,t.x2)>55-borne-1e-6);
  if(!proche.length)throw new Error("plus rien près du coude cliqué");
  const xmin=Math.min(...S.tracks.map(t=>Math.min(t.x1,t.x2)));
  if(Math.abs(xmin-q.x)>1e-9)throw new Error("le tracé doit toujours partir de la pastille");
  const droite=S.tracks.find(t=>Math.abs(t.y1-q.y)<1e-9&&Math.abs(t.y2-q.y)<1e-9);
  if(!droite)throw new Error("l'horizontale de départ a disparu");
  const bout=Math.max(droite.x1,droite.x2);
  if(Math.abs(bout-(55-borne))>1e-6)
    throw new Error("le chanfrein devait valoir "+fmt(borne,3)+" mm, l'horizontale "+
                    "s'arrête à "+fmt(bout,3)+" au lieu de "+fmt(55-borne,3));
  // plus aucun angle droit d'axe, et tout est à 45°
  const axe=t=>Math.abs(t.x1-t.x2)<1e-9?"V":(Math.abs(t.y1-t.y2)<1e-9?"H":"D");
  for(const a of S.tracks)
    for(const b of S.tracks){
      if(a===b||dist(a.x2,a.y2,b.x1,b.y1)>1e-6)continue;
      if((axe(a)==="H"&&axe(b)==="V")||(axe(a)==="V"&&axe(b)==="H"))
        throw new Error("angle droit d'axe restant en "+fmt(a.x2,2)+","+fmt(a.y2,2));
    }
  for(const t of S.tracks)
    if(!pnsDirOk({x:t.x1,y:t.y1},{x:t.x2,y:t.y2}))
      throw new Error("segment hors des huit sens");
  drcMuet("après un chanfrein borné");
});
T("borné ou maximal : la touche D chanfreine bien plus large que le dépôt",()=>{
  plateau();
  setCornerMode("45");
  const w=0.3;
  const pose=cap=>{
    S.tracks=[];clearSel();
    S.tracks.push({l:0,net:"T",w,x1:5,y1:20,x2:40,y2:20});    // 35 mm
    S.tracks.push({l:0,net:"T",w,x1:40,y1:20,x2:40,y2:32});   // 12 mm
    touch();
    if(!mitreAt(0,40,20,false,cap))throw new Error("chanfrein refusé (cap="+cap+")");
    const d=S.tracks.find(t=>Math.abs(t.x1-t.x2)>1e-9&&Math.abs(t.y1-t.y2)>1e-9);
    return Math.abs(d.x2-d.x1);
  };
  const borne=pose(MITRE_AUTO), max=pose(0);
  if(Math.abs(borne-MITRE_AUTO*w)>1e-6)
    throw new Error("le chanfrein borné doit valoir "+fmt(MITRE_AUTO*w,3)+", il vaut "+fmt(borne,3));
  if(Math.abs(max-12)>1e-6)
    throw new Error("le chanfrein maximal doit valoir la jambe courte (12 mm), il vaut "+fmt(max,3));
});
T("un coude entre deux jambes courtes se chanfreine entièrement",()=>{
  plateau();
  setCornerMode("45");
  /* Deux jambes plus courtes que la borne : le chanfrein les mange en entier,
     comme avant. Borner ne doit pas empêcher le petit coude de disparaître. */
  const w=0.3, L=0.8;                       // 0,8 mm < MITRE_AUTO × 0,3 = 1,2 mm
  const A={l:0,net:"T",w,x1:20,y1:20,x2:20+L,y2:20};
  const B={l:0,net:"T",w,x1:20+L,y1:20,x2:20+L,y2:20+L};
  S.tracks.push(A,B);touch();
  if(!mitreAt(0,20+L,20,true,MITRE_AUTO))throw new Error("ce coude devait être adoucissable");
  mitreAt(0,20+L,20,false,MITRE_AUTO);
  const d=S.tracks.filter(t=>Math.abs(t.x1-t.x2)>1e-9&&Math.abs(t.y1-t.y2)>1e-9);
  if(d.length!==1)throw new Error("une diagonale attendue, "+d.length);
  if(dist(d[0].x1,d[0].y1,20,20)>1e-6&&dist(d[0].x2,d[0].y2,20,20)>1e-6)
    throw new Error("la diagonale devait partir du début de la première jambe");
});

T("un coude déjà franc avant le glissement le reste",()=>{
  /* Le pendant du précédent : on ne rend un 45° que s'il y en avait un. Un
     angle droit voulu ne doit pas être réécrit par un geste qui ne demandait
     que de raccourcir. */
  S.fps=[];S.tracks=[];S.vias=[];touch();
  setCuCount(2);S.board={x:0,y:0,w:60,h:60,pts:null};boardChanged();
  setCornerMode("45");S.avoid=false;
  const h={l:0,net:"T",w:0.3,x1:5,y1:20,x2:30,y2:20};
  const v={l:0,net:"T",w:0.3,x1:30,y1:20,x2:30,y2:45};
  S.tracks.push(h,v);touch();
  setMode("select");S.active=0;clearSel();S.sel.tracks.add(v);
  const n0=S.tracks.length;
  glisseSur(v,{x:30,y:35},{x:24,y:35});
  S.avoid=true;
  if(S.tracks.length!==n0)
    throw new Error("aucun chanfrein ne devait naître : "+S.tracks.length+
                    " segments au lieu de "+n0);
  if(!S.tracks.some(t=>Math.abs(t.x1-t.x2)>1e-9&&Math.abs(t.y1-t.y2)<1e-9))
    throw new Error("l'horizontale devait rester horizontale");
  undo();
});

/* =============================================================================
   Ligne de transmission : impédance, retard, C et L de la sélection
   ============================================================================= */
/* Une carte 4 couches avec ses deux plans internes : la couche 0 est un
   microruban sur le prépreg, la couche 1 une triplaque entre les deux plans.
   C'est l'empilage sur lequel on route vraiment de la ligne contrôlée. */
function carte4c(){
  S.fps=[];S.tracks=[];S.vias=[];S.zones=[];clearSel();
  setCuCount(4);applyPreset(presetsFor(4)[0]);
  S.board={x:0,y:0,w:60,h:40,pts:null};boardChanged();
  setLayerRole(0,"signal");setLayerRole(1,"gnd");
  setLayerRole(2,"pwr");setLayerRole(3,"signal");
  setActive(0);S.grid=0;touch();
}
/* Le 6 couches est le premier empilage qui offre une couche de signal entre
   deux plans : sur un 4 couches, les deux internes sont les plans. C'est là
   qu'on éprouve la triplaque. */
function carte6c(){
  S.fps=[];S.tracks=[];S.vias=[];S.zones=[];clearSel();
  setCuCount(6);applyPreset(presetsFor(6)[0]);
  S.board={x:0,y:0,w:60,h:40,pts:null};boardChanged();
  setLayerRole(0,"signal");setLayerRole(1,"gnd");setLayerRole(2,"signal");
  setLayerRole(3,"signal");setLayerRole(4,"pwr");setLayerRole(5,"signal");
  setActive(0);S.grid=0;touch();
}
function pisteLT(l,w,x1,x2,net){
  const t={l:l,net:net||"CLK",w:w,x1:x1,y1:10,x2:x2,y2:10};
  S.tracks.push(t);touch();
  return t;
}
T("εr effective : entre l'air et le stratifié, et d'autant plus haute que la piste est large",()=>{
  carte4c();
  const g=dpStripGeom(0);
  if(g.kind!=="micro")throw new Error("la couche extérieure est un microruban, pas "+g.kind);
  const bas=(g.er+1)/2, e1=ltEeff(g,0.1), e2=ltEeff(g,0.5);
  if(!(e1>bas&&e1<g.er))throw new Error("εeff hors de [ (εr+1)/2 , εr ] : "+e1);
  if(!(e2>e1))throw new Error("une piste large voit plus de stratifié : "+e1+" → "+e2);
  /* la triplaque est noyée : elle ne voit que le stratifié */
  carte6c();
  const s=dpStripGeom(2);
  if(s.kind!=="strip")throw new Error("la couche 2 du 6 couches est entre deux plans");
  if(Math.abs(ltEeff(s,0.2)-s.er)>1e-3)throw new Error("noyée, εeff vaut εr");
});
T("les deux branches de Wheeler se raccordent en w = h",()=>{
  carte4c();
  const g=dpStripGeom(0), h=g.h;
  const a=ltZ0(g,h*0.999), b=ltZ0(g,h*1.001);
  if(!(a>0&&b>0))throw new Error("impédance nulle au raccord");
  if(Math.abs(a-b)/a>0.01)
    throw new Error("marche de "+fmt(100*Math.abs(a-b)/a,2)+" % au passage d'une branche à l'autre");
});
T("Z₀ tombe quand la piste s'élargit, monte quand le plan s'éloigne",()=>{
  carte4c();
  const g=dpStripGeom(0);
  if(!(ltZ0(g,0.5)<ltZ0(g,0.2)))throw new Error("élargir une piste baisse son impédance");
  const loin=Object.assign({},g,{h:g.h*2});
  if(!(ltZ0(loin,0.2)>ltZ0(g,0.2)))throw new Error("éloigner le plan monte l'impédance");
});
T("l'empilage commande : doubler le diélectrique monte l'impédance",()=>{
  carte4c();
  const t=pisteLT(0,0.2,5,25);
  const avant=ltSeg(t).z0;
  S.stack.di[0].t=r4(S.stack.di[0].t*2);touch();
  const apres=ltSeg(t).z0;
  if(!(apres>avant+1))
    throw new Error("le panneau doit suivre l'empilage : "+avant+" → "+apres);
});
T("retard : de l'ordre de 6 ps/mm sur du FR-4, et C avec L le retrouve",()=>{
  carte4c();
  const t=pisteLT(0,0.2,5,25);                 // 20 mm de microruban
  const s=ltSeg(t);
  const psmm=s.tpd*1e12/s.len;
  if(!(psmm>4.5&&psmm<7.5))throw new Error(fmt(psmm,2)+" ps/mm : hors de tout FR-4 connu");
  /* C = t/Z₀ et L = t·Z₀ : le produit rend le retard au carré, le rapport rend
     l'impédance. C'est la définition même de la ligne. */
  if(Math.abs(Math.sqrt(s.ind*s.c)-s.tpd)/s.tpd>1e-9)throw new Error("√(L·C) doit rendre le retard");
  if(Math.abs(Math.sqrt(s.ind/s.c)-s.z0)/s.z0>1e-9)throw new Error("√(L/C) doit rendre Z₀");
});
T("la ligne somme ses tronçons et n'invente pas d'impédance unique",()=>{
  carte4c();
  const a=pisteLT(0,0.2,5,15), b=pisteLT(0,0.4,15,25);
  const e=ltLine([a,b],[]);
  const sa=ltSeg(a), sb=ltSeg(b);
  if(Math.abs(e.len-(sa.len+sb.len))>1e-9)throw new Error("la longueur est une somme");
  if(Math.abs(e.tpd-(sa.tpd+sb.tpd))>1e-18)throw new Error("le retard est une somme");
  if(Math.abs(e.c-(sa.c+sb.c))>1e-18)throw new Error("la capacité est une somme");
  if(Math.abs(e.ind-(sa.ind+sb.ind))>1e-18)throw new Error("l'inductance est une somme");
  if(e.uniform)throw new Error("deux largeurs : l'impédance n'est pas uniforme");
  if(e.groups.length!==2)throw new Error("2 tronçons attendus, "+e.groups.length);
  if(!(e.z0eq>Math.min(sa.z0,sb.z0)&&e.z0eq<Math.max(sa.z0,sb.z0)))
    throw new Error("l'équivalente √(L/C) tient entre les deux : "+e.z0eq);
  /* le plus long passe devant : c'est lui qui décide de la ligne */
  if(e.groups[0].len<e.groups[1].len)
    throw new Error("les tronçons se lisent du plus long au plus court");
});
T("un coude à 45° ne fait qu'un tronçon : même couche, même largeur",()=>{
  carte4c();
  const a=pisteLT(0,0.2,5,15);
  const b={l:0,net:"CLK",w:0.2,x1:15,y1:10,x2:18,y2:13};
  const c={l:0,net:"CLK",w:0.2,x1:18,y1:13,x2:28,y2:13};
  S.tracks.push(b,c);touch();
  const e=ltLine([a,b,c],[]);
  if(e.groups.length!==1)throw new Error("un seul tronçon attendu, "+e.groups.length);
  if(!e.uniform)throw new Error("rien n'a changé en chemin : l'impédance est uniforme");
  if(e.groups[0].n!==3)throw new Error("les 3 segments du coude sont dans ce tronçon");
  if(Math.abs(e.groups[0].len-e.len)>1e-9)throw new Error("et toute la longueur avec");
});
T("changer de couche change l'impédance : le tronçon suit la couche",()=>{
  carte6c();
  const a=pisteLT(0,0.25,5,15), b=pisteLT(2,0.25,15,25);
  const e=ltLine([a,b],[]);
  if(e.groups.length!==2)throw new Error("deux couches, deux tronçons");
  if(e.kinds.length!==2)throw new Error("microruban dessus, triplaque dedans : "+e.kinds.join("+"));
  if(Math.abs(ltSeg(a).z0-ltSeg(b).z0)<1)
    throw new Error("la même largeur ne donne pas la même impédance d'une topologie à l'autre");
});
T("un via ajoute self, capacité et retard, et le total les compte",()=>{
  carte4c();
  const a=pisteLT(0,0.2,5,15), b=pisteLT(3,0.2,15,25);
  const v={x:15,y:10,d:0.8,drill:0.4,a:0,b:3,net:"CLK"};
  S.vias.push(v);touch();
  const nu=ltLine([a,b],[]), avec=ltLine([a,b],[v]);
  const x=ltVia(v);
  if(!(x.ind>0.2e-9&&x.ind<3e-9))
    throw new Error("self de via hors du plausible : "+(x.ind*1e9)+" nH");
  if(!(x.cap>0.05e-12&&x.cap<2e-12))
    throw new Error("capacité de via hors du plausible : "+(x.cap*1e12)+" pF");
  if(Math.abs(avec.indAll-(nu.ind+x.ind))>1e-18)throw new Error("la self du via entre dans le total");
  if(Math.abs(avec.cAll-(nu.c+x.cap))>1e-18)throw new Error("la capacité du via entre dans le total");
  if(!(avec.tpdAll>nu.tpdAll))throw new Error("traverser le tube prend du temps");
  if(avec.vias.n!==1)throw new Error("un via compté");
  /* un via borgne perce moins loin : moins de self, moins de capacité */
  const court={x:15,y:10,d:0.8,drill:0.4,a:0,b:1,net:"CLK"};
  const y=ltVia(court);
  if(!(y.ind<x.ind&&y.cap<x.cap))throw new Error("un via borgne pèse moins qu'un traversant");
});
T("le panneau donne la ligne du segment seul comme de la piste entière",()=>{
  carte4c();
  const a=pisteLT(0,0.2,5,15), b=pisteLT(3,0.3,15,25);
  const v={x:15,y:10,d:0.8,drill:0.4,a:0,b:3,net:"CLK"};
  S.vias.push(v);touch();
  clearSel();S.sel.tracks.add(a);buildProps();
  const un=$("props").innerHTML;
  if(un.indexOf("Ligne de transmission")<0)throw new Error("un segment seul a déjà une impédance");
  if(un.indexOf("Vias franchis")>=0)throw new Error("aucun via dans cette sélection");
  /* Maj+clic : la piste entière d'une couche */
  clearSel();S.sel.tracks.add(a);S.sel.tracks.add(b);buildProps();
  const deux=$("props").innerHTML;
  if(deux.indexOf("Ligne de transmission")<0)throw new Error("la piste entière aussi");
  if(deux.indexOf("équivalente")<0)throw new Error("deux largeurs : l'équivalente doit paraître");
  /* Maj+double-clic : les vias de passage sont de la sélection */
  clearSel();S.sel.tracks.add(a);S.sel.tracks.add(b);S.sel.vias.add(v);buildProps();
  const tout=$("props").innerHTML;
  if(tout.indexOf("Vias franchis")<0)
    throw new Error("le doublé prend les vias : le panneau doit les compter");
  if(tout.indexOf("Retard total")<0)throw new Error("le retard annoncé comprend alors les vias");
});
T("Maj+double-clic sur une piste multicouche : le panneau reste celui de la piste",()=>{
  carte4c();
  const a=pisteLT(0,0.3,5,15), b=pisteLT(3,0.3,15,25);
  const v={x:15,y:10,d:0.8,drill:0.4,a:0,b:3,net:"CLK"};
  S.vias.push(v);touch();
  setMode("select");clearSel();
  const r=trackRun(a,true);
  r.tracks.forEach(t=>S.sel.tracks.add(t));
  r.vias.forEach(x=>S.sel.vias.add(x));
  if(!S.sel.vias.size)throw new Error("le doublé devait prendre le via");
  buildProps();
  const h=$("props").innerHTML;
  if(h.indexOf("Ligne de transmission")<0)
    throw new Error("une piste prise avec ses vias n'est pas un lasso : elle garde son panneau");
  if(h.indexOf("Dérouter ")>=0)throw new Error("ce n'est plus le panneau de sélection mêlée");
});
T("sans plan de référence, le panneau le dit plutôt que d'afficher un nombre net",()=>{
  S.fps=[];S.tracks=[];S.vias=[];S.zones=[];clearSel();
  setCuCount(2);                                  // deux couches signal, aucun plan
  setLayerRole(0,"signal");setLayerRole(1,"signal");
  S.board={x:0,y:0,w:60,h:40,pts:null};boardChanged();touch();
  const t=pisteLT(0,0.25,5,25);
  if(!ltLine([t],[]).noRef)throw new Error("aucune couche ne porte de plan : il faut le signaler");
  clearSel();S.sel.tracks.add(t);buildProps();
  if($("props").innerHTML.indexOf("Aucun plan de référence")<0)
    throw new Error("l'avertissement doit paraître dans le panneau");
  /* poser un plan de masse dessous suffit à rendre la mesure honnête */
  setLayerRole(1,"gnd");touch();
  if(ltLine([t],[]).noRef)throw new Error("le plan posé, l'avertissement tombe");
});
T("une zone pleine carte vaut plan de référence, comme pour le DRC",()=>{
  S.fps=[];S.tracks=[];S.vias=[];S.zones=[];clearSel();
  setCuCount(2);setLayerRole(0,"signal");setLayerRole(1,"signal");
  S.board={x:0,y:0,w:60,h:40,pts:null};boardChanged();touch();
  const t=pisteLT(0,0.25,5,25);
  if(!ltLine([t],[]).noRef)throw new Error("rien n'est encore posé");
  S.zones.push({l:1,net:"GND",pts:boardZonePts(),auto:true});touch();
  if(ltLine([t],[]).noRef)
    throw new Error("le cuivre réellement posé compte, pas seulement le rôle de couche");
});

/* ==========================================================================
   Matrice des natures de cuivre, et la fenêtre des règles qui l'édite
   ========================================================================== */
/* Une carte nue : deux couches, un contour, aucune classe retouchée. Chaque
   essai de cette section repart de là, sinon l'isolation mesurée serait celle
   qu'un essai précédent a laissée. */
function carteRegles(){
  S.fps=[];S.tracks=[];S.vias=[];S.zones=[];S.cuts=[];
  S.dpPairs=[];S.dpRules=[];clearSel();
  setCuCount(2);
  S.classes=[{name:"Défaut",w:0.25,clr:0.25,via:0.8,drill:0.4}];
  S.netClass={};
  S.rule.mat={};S.rule.hole=0.25;S.rule.short=false;
  S.rule.aspWarn=ASPECT_WARN;S.rule.aspMax=ASPECT_MAX;
  S.board={x:0,y:0,w:60,h:40,pts:null};boardChanged();
  S.grid=0;S.avoid=true;touch();
}
/* Deux pistes parallèles de nets étrangers, séparées de `gap` millimètres de
   cuivre à cuivre. */
function deuxPistes(gap,w){
  const e=w||0.25;
  S.tracks.push({l:0,net:"A",w:e,x1:5,y1:10,x2:40,y2:10});
  S.tracks.push({l:0,net:"B",w:e,x1:5,y1:10+e+gap,x2:40,y2:10+e+gap});
  touch();
}
T("matrice : une case relève l'isolation là où les classes se taisent",()=>{
  carteRegles();
  deuxPistes(0.30);
  if(runDrc().some(e=>/^Isolation piste\/piste/.test(e.msg)))
    throw new Error("0,30 mm passe la classe à 0,25 mm : rien à signaler");
  matSet("trk","trk",0.40);
  const e=runDrc().filter(x=>/^Isolation piste\/piste/.test(x.msg));
  if(e.length!==1)throw new Error("un défaut attendu, "+e.length);
  if(e[0].msg.indexOf("0.400 mm")<0)
    throw new Error("la cote exigée doit être dite : "+e[0].msg);
  if(e[0].msg.indexOf("0.300 mm")<0)
    throw new Error("la cote mesurée doit être dite : "+e[0].msg);
  /* la case rendue à zéro rend la carte saine, sans avoir touché la classe */
  matSet("trk","trk",0);
  if(runDrc().some(x=>/^Isolation piste\/piste/.test(x.msg)))
    throw new Error("case libre : la classe seule décide, et elle est tenue");
  if(defClass().clr!==0.25)throw new Error("la classe n'a pas à bouger");
});
T("matrice : chaque couple de natures a sa propre case",()=>{
  carteRegles();
  /* une piste et un via de nets étrangers, à 0,30 mm : la case piste/piste ne
     doit rien y changer, la case piste/via si */
  S.tracks.push({l:0,net:"A",w:0.25,x1:5,y1:10,x2:40,y2:10});
  S.vias.push({x:20,y:10+0.125+0.30+0.4,d:0.8,drill:0.4,a:0,b:1,net:"B"});
  touch();
  const vias=()=>runDrc().filter(e=>/^Isolation via\/piste/.test(e.msg)).length;
  if(vias())throw new Error("0,30 mm tient la classe : rien à signaler");
  matSet("trk","trk",0.40);
  if(vias())throw new Error("la case piste/piste ne juge pas un via");
  matSet("trk","trk",0);
  matSet("trk","via",0.40);
  if(vias()!==1)throw new Error("la case piste/via devait relever le défaut");
  /* et l'ordre des natures ne compte pas : c'est la même case */
  if(matGet("via","trk")!==0.40)throw new Error("la case doit se lire dans les deux sens");
  if(matKey("via","trk")!==matKey("trk","via"))throw new Error("deux noms pour une case");
});
T("matrice : une pastille percée n'est pas une pastille CMS",()=>{
  carteRegles();
  importNetlist(NET,true);
  const th=[], smd=[];
  for(const fp of S.fps)
    for(const q of padsWorld(fp))(q.drill>0?th:smd).push(q);
  if(!th.length||!smd.length)
    throw new Error("la netlist doit donner des deux sortes : "+th.length+" / "+smd.length);
  if(pnsKind({k:"P",q:th[0]})!=="th")throw new Error("une pastille percée est traversante");
  if(pnsKind({k:"P",q:smd[0]})!=="smd")throw new Error("une pastille pleine est CMS");
  if(pnsKind({k:"V"})!=="via"||pnsKind({k:"S"})!=="trk")
    throw new Error("via et piste mal reconnus");
});
T("matrice : la case trou/trou EST la règle de trou à trou",()=>{
  carteRegles();
  if(matGet("hole","hole")!==holeClr())
    throw new Error("la case doit lire la règle de perçage");
  matSet("hole","hole",0.31);
  if(S.rule.hole!==0.31)throw new Error("la case doit écrire dans S.rule.hole");
  if(Object.keys(S.rule.mat).length)
    throw new Error("elle n'a rien à ranger dans la matrice : "+JSON.stringify(S.rule.mat));
  /* le reste de la ligne « trou » n'existe pas : la rondelle s'occupe du cuivre */
  for(const [k] of DRC_KINDS){
    if(k==="hole")continue;
    if(matHas("hole",k))throw new Error("trou ↔ "+k+" ne devrait pas exister");
    matSet("hole",k,0.5);
    if(matGet("hole",k)!==0)throw new Error("trou ↔ "+k+" a pourtant retenu une valeur");
  }
  S.rule.hole=0.25;
});
T("matrice : elle ne peut pas relever l'écart d'une paire différentielle",()=>{
  carteRegles();
  const pair=dpMakePair("USB_DP","USB_DM",true);
  if(!pair)throw new Error("la paire n'a pas été créée");
  const g=dpMinGap(pair);
  matSet("trk","trk",Math.max(1,g*4));
  if(Math.abs(clrK("USB_DP","USB_DM","trk","trk")-g)>1e-9)
    throw new Error("l'écart de paire doit tenir contre la matrice : "+
      clrK("USB_DP","USB_DM","trk","trk")+" au lieu de "+g);
  /* contre un net tiers, en revanche, la case s'applique pleinement */
  if(clrK("USB_DP","GND","trk","trk")<1)
    throw new Error("hors de la paire, la case vaut : "+clrK("USB_DP","GND","trk","trk"));
  S.dpPairs=[];S.rule.mat={};touch();
});
T("matrice : le routeur juge au même seuil que le contrôle",()=>{
  carteRegles();
  S.tracks.push({l:0,net:"A",w:0.25,x1:5,y1:10,x2:40,y2:10});
  touch();
  const y=10+0.125+0.30+0.4;                 // 0,30 mm de cuivre à cuivre
  if(!placeVia(20,y,"B",0,1,false))
    throw new Error("0,30 mm tient la classe : le via devait passer");
  S.vias.length=0;touch();
  matSet("trk","via",0.40);
  if(placeVia(20,y,"B",0,1,false))
    throw new Error("la case relevée, le via devait être refusé");
  const gene=viaObstacle(mkVia(20,y,"B",0,1),null);
  if(gene.indexOf("0.400")<0)
    throw new Error("le refus doit dire la cote exigée : "+gene);
  /* la fenêtre d'interrogation doit s'élargir avec la matrice, sans quoi un
     obstacle dont l'isolation porte loin passerait inaperçu */
  if(pnsMaxClr()<0.40)throw new Error("la marge d'interrogation ignore la matrice");
  if(maxClr()<0.40)throw new Error("la résolution des zones ignore la matrice");
  S.rule.mat={};touch();
});
T("matrice : le dégagement d'un plan se prend sur la ligne « Cuivre »",()=>{
  carteRegles();
  if(clrK("GND","A","cu","trk")!==0.25)throw new Error("au départ, la classe décide");
  matSet("cu","trk",0.45);
  if(clrK("GND","A","cu","trk")!==0.45)
    throw new Error("la case cuivre/piste doit valoir : "+clrK("GND","A","cu","trk"));
  if(clrK("GND","A","trk","trk")!==0.25)
    throw new Error("elle ne doit pas déborder sur piste/piste");
  matSet("cu","via",0.6);
  if(clrK("GND","A","cu","via")!==0.6)throw new Error("cuivre/via doit valoir aussi");
  S.rule.mat={};touch();
});
T("document : la matrice se range, se relit, et l'aller-retour est neutre",()=>{
  carteRegles();
  matSet("trk","via",0.33);
  matSet("cu","th",0.42);
  matSet("smd","smd",0.18);
  S.rule.hole=0.3;
  touch();
  const a=docObj();
  loadDoc(JSON.parse(JSON.stringify(a)),true);
  const d=firstDiff(a,docObj(),"doc");
  if(d)throw new Error("l'aller-retour a changé le document : "+d);
  if(matGet("trk","via")!==0.33||matGet("cu","th")!==0.42)
    throw new Error("les cases ne sont pas revenues");
  if(holeClr()!==0.3)throw new Error("le trou à trou n'est pas revenu");
  /* un document hostile : clés inventées, valeurs absurdes, ligne « trou » */
  const sale=JSON.parse(JSON.stringify(a));
  sale.rule.mat={"trk|via":"0.5","piste|via":9,"trk|trk":-3,"hole|trk":1,
                 "hole|hole":7,"cu|cu":1e9};
  loadDoc(sale,true);
  const m=S.rule.mat;
  if(Math.abs(matGet("trk","via")-0.5)>1e-9)
    throw new Error("une valeur lisible devait passer : "+matGet("trk","via"));
  if(m["piste|via"]!==undefined)throw new Error("une nature inventée est entrée");
  if(m["trk|trk"]!==undefined)throw new Error("une valeur négative est entrée");
  if(m["hole|trk"]!==undefined||m["hole|hole"]!==undefined)
    throw new Error("la ligne « trou » n'a rien à faire dans la matrice");
  if(matGet("cu","cu")!==100)throw new Error("une valeur démesurée doit être bornée");
  carteRegles();
});
T("règles : l'arbre porte toutes les pages, et chaque page se construit",()=>{
  carteRegles();
  importNetlist(NET,true);
  reOpen();
  if(!reIsOpen())throw new Error("la fenêtre devait s'ouvrir");
  const arbre=$("reTree").innerHTML;
  for(const g of RE_TREE){
    if(arbre.indexOf(esc(g.cat))<0)throw new Error("famille absente de l'arbre : "+g.cat);
    for(const [id,t] of g.n){
      if(arbre.indexOf('data-page="'+id+'"')<0)
        throw new Error("règle absente de l'arbre : "+id);
      reGo(id);
      const h=$("rePage").innerHTML;
      if(!h||h.length<200)throw new Error("page vide : "+id);
      if(h.indexOf(esc(t))<0)throw new Error("la page ne se nomme pas : "+id);
      if(h.indexOf("DRC-"+id.toUpperCase())<0)
        throw new Error("identifiant absent de la page : "+id);
      if(h.indexOf("<svg")<0&&id!=="dp")throw new Error("page sans figure : "+id);
    }
  }
  reClose();
  if(reIsOpen())throw new Error("la fenêtre devait se fermer");
});
T("règles : les figures portent les cotes du document, pas des valeurs d'exemple",()=>{
  carteRegles();
  S.rule.hole=0.32;S.rule.edge=0.55;S.rule.thermal=0.44;S.rule.mask=0.07;
  S.classes[0].w=0.35;S.classes[0].via=0.9;S.classes[0].drill=0.45;
  touch();
  reOpen("hole");
  if($("rePage").innerHTML.indexOf("0.320")<0)
    throw new Error("la figure du trou à trou ignore la règle");
  reGo("edge");
  if($("rePage").innerHTML.indexOf("0.550")<0)
    throw new Error("la figure de la marge ignore la règle");
  reGo("therm");
  if($("rePage").innerHTML.indexOf("0.440")<0)
    throw new Error("la figure du bras thermique ignore la règle");
  reGo("width");
  if($("rePage").innerHTML.indexOf("0.350")<0)
    throw new Error("la figure de largeur ignore la classe");
  reGo("via");
  const h=$("rePage").innerHTML;
  if(h.indexOf("0.900")<0||h.indexOf("0.450")<0)
    throw new Error("la figure du via ignore la classe");
  if(h.indexOf("0.225")<0)throw new Error("la couronne doit être calculée : (0,9-0,45)/2");
  reClose();
  carteRegles();
});
T("règles : la figure d'isolation dessine la case choisie",()=>{
  carteRegles();
  matSet("trk","via",0.47);
  reOpen("clr");
  RE.mx={a:"trk",b:"trk"};
  let f=figClr();
  if(f.indexOf("0.250")<0)throw new Error("piste/piste : la classe décide encore");
  if(f.indexOf("0.470")>=0)throw new Error("la case du via n'a rien à faire ici");
  RE.mx={a:"trk",b:"via"};
  f=figClr();
  if(f.indexOf("0.470")<0)throw new Error("la figure doit porter la case choisie");
  if(f.indexOf(DRC_KIND_NAME.via)<0)throw new Error("la figure doit nommer les natures");
  /* la case libre se lit comme telle, et le dessin montre la classe */
  RE.mx={a:"smd",b:"smd"};
  if(figClr().indexOf("la case est libre")<0)
    throw new Error("une case libre doit le dire : "+figClr().slice(-200));
  reClose();
  S.rule.mat={};touch();
});
T("règles : chaque défaut se compte une fois, et sous la bonne règle",()=>{
  carteRegles();
  importNetlist(NET,true);
  S.avoid=false;
  deuxPistes(0.05);                                  // isolation
  S.tracks.push({l:0,net:"",w:0.25,x1:5,y1:20,x2:15,y2:20});     // piste sans net
  S.tracks.push({l:0,net:"A",w:0.05,x1:5,y1:25,x2:15,y2:25});    // sous la classe
  S.vias.push({x:-5,y:20,d:0.8,drill:0.4,a:0,b:1,net:"A"});      // hors contour
  S.zones.push({id:S.nextId++,l:1,net:"",pts:boardZonePts()});   // zone sans net
  touch();
  const drc=runDrc();
  if(!drc.length)throw new Error("le document devait produire des défauts");
  for(const e of drc){
    const vus=Object.keys(RE_MATCH).filter(k=>RE_MATCH[k].test(e.msg));
    if(vus.length>1)
      throw new Error("« "+e.msg+" » compté par "+vus.length+" règles : "+vus.join(", "));
  }
  const iso=reFindings("clr");
  if(!iso.length)throw new Error("l'isolation devait relever quelque chose");
  if(!reFindings("width").length)throw new Error("la largeur devait relever quelque chose");
  if(!reFindings("edge").length)throw new Error("la marge devait relever le via sorti");
  if(!reFindings("zone").length)throw new Error("la zone sans net devait remonter");
  /* une règle sans motif ne compte rien, et sa page le dit plutôt que de
     laisser croire à un contrôle réussi */
  if(reFindings("obst")!==null)throw new Error("« face à un obstacle » ne juge rien");
  reOpen("obst");
  if($("rePage").innerHTML.indexOf("ne produit pas de défaut")<0)
    throw new Error("la page doit dire qu'elle ne produit pas de défaut");
  reClose();
  S.avoid=true;carteRegles();
});
T("règles : les champs de la fenêtre écrivent dans le document, annulables",()=>{
  carteRegles();
  const av=holeClr();
  reOpen("hole");
  const el=$("reHole");
  el.value="0.42";
  if(el.onchange)el.onchange();
  if(Math.abs(holeClr()-0.42)>1e-9)
    throw new Error("le champ devait écrire la règle : "+holeClr());
  undo();
  if(Math.abs(holeClr()-av)>1e-9)
    throw new Error("Ctrl+Z devait rendre la règle d'avant : "+holeClr());
  reClose();
});

T("via à via : la figure cote le cuivre, pas seulement le trou",()=>{
  carteRegles();
  /* La rondelle porte de la couronne de part et d'autre du trou : entre deux
     vias, c'est donc le cuivre qui se rencontre le premier, et la figure ne
     doit jamais les dessiner en recouvrement. */
  const q=reHoleCase();
  if(!q.cuiMene)
    throw new Error("Ø 0,8 percé à 0,4 : le cuivre doit décider, pas le foret");
  if(Math.abs(q.axe-(q.d+q.cu))>1e-9)
    throw new Error("l'axe en axe doit valoir Ø + cuivre : "+q.axe);
  if(q.gapCu<=0)throw new Error("les rondelles se recouvrent dans le dessin");
  if(q.gapTr<=q.gapCu)throw new Error("le trou a plus de mou que le cuivre, pas moins");
  reOpen("hole");
  const h=$("rePage").innerHTML;
  if(h.indexOf("cuivre à cuivre")<0)throw new Error("la page doit nommer le cuivre à cuivre");
  if(h.indexOf("le cuivre qui décide")<0)
    throw new Error("la figure doit dire quelle règle décide");
  /* la case Via ↔ Via s'édite sur cette page comme dans la matrice */
  const el=$("reV2V");
  el.value="0.55";
  if(el.onchange)el.onchange();
  if(matGet("via","via")!==0.55)
    throw new Error("le champ doit écrire la case de la matrice : "+matGet("via","via"));
  if(Math.abs(reHoleCase().axe-1.35)>1e-9)
    throw new Error("l'écart imposé doit suivre : "+reHoleCase().axe);
  undo();
  if(matGet("via","via")!==0)throw new Error("Ctrl+Z devait rendre la case libre");
  /* une règle de perçage démesurée reprend la main, et la figure le dit */
  S.rule.hole=0.9;touch();
  if(reHoleCase().cuiMene)throw new Error("0,9 mm de trou à trou passe devant le cuivre");
  reSync();
  if($("rePage").innerHTML.indexOf("le foret qui décide")<0)
    throw new Error("la figure doit dire que le foret décide");
  reClose();
  carteRegles();
});
T("via à via : les deux règles se contrôlent chacune de son côté",()=>{
  carteRegles();
  /* deux vias de nets ÉTRANGERS à 0,30 mm de cuivre : la classe tient à 0,25,
     rien à dire — puis la case Via ↔ Via relevée les condamne */
  S.vias.push({x:20,y:20,d:0.8,drill:0.4,a:0,b:1,net:"A"});
  S.vias.push({x:21.1,y:20,d:0.8,drill:0.4,a:0,b:1,net:"B"});
  touch();
  const iso=()=>runDrc().filter(e=>/^Isolation via\/via/.test(e.msg));
  const trou=()=>runDrc().filter(e=>/Trou à trou/.test(e.msg));
  if(iso().length)throw new Error("0,30 mm de cuivre tient la classe");
  if(trou().length)throw new Error("0,70 mm de trou à trou tient la règle");
  matSet("via","via",0.45);
  if(iso().length!==1)throw new Error("la case cuivre devait condamner : "+iso().length);
  if(iso()[0].msg.indexOf("0.450")<0)
    throw new Error("le message doit dire la cote de cuivre exigée : "+iso()[0].msg);
  if(trou().length)throw new Error("le foret n'a rien à redire : ses 0,70 mm tiennent");
  /* et l'inverse : deux vias du MÊME net, que le cuivre laisse passer, mais
     dont les trous se serrent — c'est le foret seul qui parle */
  matSet("via","via",0);
  S.vias[1].net="A";S.vias[1].x=20.5;touch();
  if(iso().length)throw new Error("même net : le cuivre n'a rien à isoler");
  if(trou().length!==1)throw new Error("0,10 mm de trou à trou devait être signalé");
  carteRegles();
});
T("court-circuit : la figure montre deux pistes qui se croisent",()=>{
  carteRegles();
  reOpen("short");
  const h=$("rePage").innerHTML;
  /* deux tracés de cuivre, pas deux plages superposées : une tache unique ne
     laissait voir ni les deux nets ni ce qui les relie */
  const pistes=(h.match(/<path d="M18 /g)||[]).length;
  if(pistes!==2)throw new Error("deux pistes attendues dans la figure, "+pistes);
  if(h.indexOf("<rect")>=0)throw new Error("plus de plages superposées dans cette figure");
  if(h.indexOf("le cuivre les relie")<0)throw new Error("le point de croisement doit se nommer");
  if(h.indexOf("défaut sans cote")<0)
    throw new Error("un court-circuit n'est pas une distance : la note doit le dire");
  reClose();
});

/* ==========================================================================
   La fenêtre est le seul éditeur de règles : les deux panneaux ont disparu
   ========================================================================== */
T("règles : tout ce qui ressemble à un champ s'écrit",()=>{
  carteRegles();
  importNetlist(NET,true);
  reOpen("cls");
  /* La promesse de la fenêtre : aucun champ grisé. Ce qui ne se règle pas se
     présente en valeur lue (`reFact`), pas en saisie bloquée — sans quoi on
     passe son temps à cliquer dans du vide. La page des paires est la seule
     exception admise : son profil d'impédance est désactivé par SA case à
     cocher, ce qui est un usage et non une valeur bloquée. */
  /* On ne compte que les CHAMPS : un bouton sans effet a le droit de se griser,
     c'est ainsi qu'il dit qu'il n'y a rien à faire. Le motif se vérifie d'abord
     sur des témoins — un motif qui ne reconnaît rien ferait passer l'essai pour
     de mauvaises raisons (ce fut le cas : un caractère parasite le rendait
     inerte, et l'essai passait sans rien juger). */
  const off=h=>(h.match(/<(?:input|select)\b[^>]*\sdisabled/g)||[]).length;
  if(off('<input value="x" disabled>')!==1||off('<select disabled></select>')!==1)
    throw new Error("le motif de champ grisé ne reconnaît rien : l'essai ne prouve rien");
  if(off('<button class="tb" disabled>x</button>'))
    throw new Error("le motif compte les boutons : il ne devrait pas");
  for(const g of RE_TREE)
    for(const [id] of g.n){
      reGo(id);
      if(id==="dp")continue;                 // son contenu vit dans #dpair
      const h=$("rePage").innerHTML;
      const n=off(h);
      if(n)throw new Error("page « "+id+" » : "+n+" champ(s) grisé(s)");
      if(h.indexOf('class="reval"')<0)
        throw new Error("page « "+id+"» : aucune valeur lue, l'entête en porte");
    }
  const nd=off($("dpair").innerHTML);
  if(nd>1)throw new Error("panneau des paires : "+nd+" champ(s) grisé(s), 1 admis");
  reClose();
  carteRegles();
});
T("règles : chaque champ de la fenêtre écrit dans le document",()=>{
  carteRegles();
  const set=(page,id,v)=>{
    reGo(page);
    const el=$(id);
    if(!el)throw new Error("champ absent : "+page+"/"+id);
    if(v===true||v===false)el.checked=v;else el.value=String(v);
    if(el.onchange)el.onchange();
  };
  reOpen("cls");
  set("cls","clsW",0.42);      set("cls","clsClr",0.31);
  set("cls","clsVia",0.95);    set("cls","clsDrill",0.5);
  set("board","reBW",120);     set("board","reBH",90);
  set("board","reOX",7.5);     set("board","reOY",3.25);
  set("aspect","reAspW",6);    set("aspect","reAspM",12);
  set("zone","reCuTrk",0.4);   set("zone","reCuVia",0.5);
  set("therm","reTh",0.6);     set("mask","reMask",0.08);
  set("mask","rePaste",0.02);  set("edge","reEdge",0.7);
  set("hole","reHole",0.3);    set("hole","reV2V",0.35);
  set("short","reShort",true);
  set("via","reFinish","filled");
  set("board","reFab","1");
  reClose();
  const c=S.classes[0];
  const veut={
    "classe.w":[c.w,0.42], "classe.clr":[c.clr,0.31],
    "classe.via":[c.via,0.95], "classe.drill":[c.drill,0.5],
    "carte.w":[S.board.w,120], "carte.h":[S.board.h,90],
    "origine.x":[S.origin.x,7.5], "origine.y":[S.origin.y,3.25],
    "aspWarn":[aspWarn(),6], "aspMax":[aspMax(),12],
    "cu/piste":[matGet("cu","trk"),0.4], "cu/via":[matGet("cu","via"),0.5],
    "thermal":[S.rule.thermal,0.6], "mask":[S.rule.mask,0.08],
    "paste":[S.rule.paste,0.02], "edge":[S.rule.edge,0.7],
    "hole":[S.rule.hole,0.3], "via/via":[matGet("via","via"),0.35]
  };
  for(const k in veut)
    if(Math.abs(veut[k][0]-veut[k][1])>1e-9)
      throw new Error(k+" : "+veut[k][0]+" au lieu de "+veut[k][1]);
  if(S.rule.short!==true)throw new Error("la case du court-circuit n'a pas écrit");
  if(S.rule.viaFinish!=="filled")throw new Error("le traitement des vias n'a pas écrit");
  if(S.fabOrigin!==true)throw new Error("le repère des fichiers n'a pas écrit");
  /* et tout cela s'annule : chaque champ prend son instantané */
  undo();
  if(S.fabOrigin!==false)throw new Error("Ctrl+Z devait rendre le repère d'avant");
  carteRegles();
});
T("règles : les seuils du rapport d'aspect sont ceux du document",()=>{
  carteRegles();
  if(aspWarn()!==ASPECT_WARN||aspMax()!==ASPECT_MAX)
    throw new Error("sans réglage, les valeurs d'usine");
  /* une pile de 1,6 mm percée à 0,2 mm fait 8 : 1 — sous le refus d'usine,
     au-dessus d'un refus resserré à 6 : 1 */
  S.vias.push({x:20,y:20,d:0.5,drill:0.2,a:0,b:1,net:"A"});touch();
  const dur=()=>runDrc().filter(e=>/Rapport d'aspect/.test(e.msg)&&!e.info).length;
  S.rule.aspWarn=8;S.rule.aspMax=10;touch();
  const avant=dur();
  S.rule.aspWarn=3;S.rule.aspMax=4;touch();
  if(dur()<=avant)throw new Error("un refus resserré doit condamner davantage");
  /* et le seuil de refus ne peut pas passer sous celui de l'alerte */
  S.rule.aspWarn=9;S.rule.aspMax=2;
  if(aspMax()<aspWarn())throw new Error("refus sous alerte : "+aspMax()+" < "+aspWarn());
  carteRegles();
});
T("règles : le court-circuit admis fait taire le contrôle, et lui seul",()=>{
  carteRegles();
  /* deux pastilles de nets différents superposées dans une même empreinte */
  const fp=mkFp("U9","","",2);
  fp.x=40;fp.y=30;fp.nets={1:"A",2:"B"};
  S.fps.push(fp);
  fpFreeze(fp);
  fpSetPad(fp,1,"x",padsOf(fp)[0].x);
  fpSetPad(fp,1,"y",padsOf(fp)[0].y);
  touch();
  const cc=()=>runDrc().filter(e=>/Pastilles superposées/.test(e.msg)).length;
  if(!cc())throw new Error("le recouvrement devait être signalé");
  S.rule.short=true;touch();
  if(cc())throw new Error("court-circuit admis : le contrôle doit se taire");
  /* mais il ne fait taire QUE cela : l'isolation continue de juger */
  S.tracks.push({l:0,net:"C",w:0.25,x1:5,y1:10,x2:40,y2:10});
  S.tracks.push({l:0,net:"D",w:0.25,x1:5,y1:10.3,x2:40,y2:10.3});
  touch();
  if(!runDrc().some(e=>/^Isolation piste\/piste/.test(e.msg)))
    throw new Error("l'isolation n'a pas à se taire pour autant");
  carteRegles();
});
T("document : court-circuit admis et seuils d'aspect font l'aller-retour",()=>{
  carteRegles();
  S.rule.short=true;S.rule.aspWarn=6.5;S.rule.aspMax=11;touch();
  const a=docObj();
  loadDoc(JSON.parse(JSON.stringify(a)),true);
  const d=firstDiff(a,docObj(),"doc");
  if(d)throw new Error("l'aller-retour a changé le document : "+d);
  if(S.rule.short!==true)throw new Error("le court-circuit admis n'est pas revenu");
  if(aspWarn()!==6.5||aspMax()!==11)throw new Error("les seuils ne sont pas revenus");
  /* un fichier hostile : seuils absurdes, drapeau qui n'est pas un booléen */
  const sale=JSON.parse(JSON.stringify(a));
  sale.rule.aspWarn="beaucoup";sale.rule.aspMax=-4;sale.rule.short="oui";
  loadDoc(sale,true);
  if(aspWarn()!==ASPECT_WARN)throw new Error("un seuil illisible reprend l'usine");
  if(aspMax()<aspWarn())throw new Error("un seuil négatif ne doit pas passer");
  if(S.rule.short!==true)throw new Error("« oui » est vrai, et reste un booléen");
  if(typeof S.rule.short!=="boolean")throw new Error("le drapeau doit être un booléen");
  carteRegles();
});
T("le dock ne garde que ce qu'on regarde en routant",()=>{
  /* Les règles de conception et les paires différentielles ont quitté le dock
     pour la fenêtre : leurs panneaux n'existent plus, et une disposition
     enregistrée avant le changement ne doit pas les ressusciter. */
  const d=wsDefault();
  if(d.panels.rules||d.panels.dpair)
    throw new Error("la disposition d'usine porte encore un panneau supprimé");
  if(JSON.stringify(d.order.dockL)!==JSON.stringify(["stack"]))
    throw new Error("dock gauche d'usine : "+d.order.dockL);
  if(JSON.stringify(d.order.dockR)!==JSON.stringify(["props","list","stackup"]))
    throw new Error("dock droit d'usine : "+d.order.dockR);
  const av=profLire(WS_SECTION);
  profEcrire(WS_SECTION,{
    docks:{dockL:212,dockR:330,dockB:200},
    order:{dockL:["stack","rules"],dockR:["props","list","stackup","dpair"],dockB:[]},
    panels:{rules:{grow:1.5,last:"dockL"},dpair:{grow:1.4,last:"dockR"}}});
  WS=wsDefault();wsLoad();wsApply(false);
  if(wsPlaceOf("rules")!=="hidden"||wsPlaceOf("dpair")!=="hidden")
    throw new Error("un panneau supprimé est revenu du stockage");
  if(JSON.stringify(dom.dockIds("dockL"))!==JSON.stringify(["stack"]))
    throw new Error("dock gauche après relecture : "+dom.dockIds("dockL"));
  if(wsMenuBuild().innerHTML.indexOf('data-tgl="dpair"')>=0)
    throw new Error("le menu propose encore un panneau supprimé");
  if(av==null)profOublier(WS_SECTION);else profEcrire(WS_SECTION,av);
  WS=wsDefault();wsApply(false);
});
T("règles : le panneau des paires vit dans la page qui le porte",()=>{
  carteRegles();
  importNetlist(NET,true);
  reOpen("dp");
  /* La page pose `#dpair`, `buildDiffPairs()` le remplit : le panneau est
     entier, cotes et figure comprises, et il s'édite de là. */
  if($("rePage").innerHTML.indexOf('id="dpair"')<0)
    throw new Error("la page doit poser l'élément que le panneau remplit");
  const h=$("dpair").innerHTML;
  if(h.indexOf("Règle de paire différentielle")<0)
    throw new Error("le panneau des paires n'est pas rempli");
  if(h.indexOf("<svg")<0)throw new Error("sa figure doit y être");
  const el=$("dpMinG");
  el.value="0.18";
  if(el.onchange)el.onchange();
  if(!S.dpRules.length)throw new Error("la retouche devait inscrire la règle d'usine");
  if(Math.abs(S.dpRules[0].minGap-0.18)>1e-9)
    throw new Error("l'écart mini n'a pas été écrit : "+S.dpRules[0].minGap);
  reClose();
  carteRegles();
});


/* ==========================================================================
   Profils utilisateur (commun/profils.js)
   Ce qui est vérifié ici : un nom devient un nom de fichier, deux personnes
   ne se marchent pas dessus, et changer d'utilisateur replace vraiment les
   panneaux et les réglages. Le fichier profils/<nom>.json, lui, est du
   ressort de serveur.py — le banc d'essai n'a pas de serveur, et le module
   doit s'en passer sans broncher : c'est le cas du double-clic (file://).
   ========================================================================== */
T("premier utilisateur : Pilou",()=>{
  if(profNom()!=="Pilou")
    throw new Error("utilisateur au démarrage : "+profNom());
  if(profListe().indexOf("Pilou")<0)throw new Error("liste : "+profListe());
});
T("un nom d'utilisateur reste un nom de fichier",()=>{
  if(profNomValide("Pilou")!=="Pilou")throw new Error("un nom simple est refusé");
  if(profNomValide("  Zoé   Marie ")!=="Zoé Marie")
    throw new Error("espaces mal recollés : "+profNomValide("  Zoé   Marie "));
  for(const mauvais of ["..",".","a/b","a"+String.fromCharCode(92)+"b","C:","x?","y*",
                        String.fromCharCode(34),"a<b","a|b",".cache","fin.","CON",
                        "lpt3",""," ","x".repeat(41)])
    if(profNomValide(mauvais)!=="")
      throw new Error("nom accepté à tort : "+JSON.stringify(mauvais)+
                      " -> "+JSON.stringify(profNomValide(mauvais)));
  /* Une espace en trop se rattrape ; un point final, non — il disparaîtrait
     du nom de fichier sous Windows, et le profil ne se retrouverait plus. */
  if(profNomValide("fin ")!=="fin")throw new Error("espace finale non rattrapée");
});
T("deux utilisateurs ne partagent rien",()=>{
  profEcrire("essai:cloison",{v:"pilou"});
  if(!profCreer("Marie"))throw new Error("création refusée");
  if(profNom()!=="Marie")throw new Error("bascule ratée : "+profNom());
  if(profLire("essai:cloison"))throw new Error("Marie voit les réglages de Pilou");
  profEcrire("essai:cloison",{v:"marie"});
  profChoisir("Pilou");
  const p=profLire("essai:cloison");
  if(!p||p.v!=="pilou")throw new Error("Pilou a perdu les siens : "+JSON.stringify(p));
  profChoisir("Marie");
  if(profLire("essai:cloison").v!=="marie")throw new Error("aller-retour perdu");
  profChoisir("Pilou");
});
T("changer d'utilisateur replace les panneaux",()=>{
  wsMove("stack","dockB",0);                 // Pilou range l'empilage en bas
  if(!profCreer("Marie2"))throw new Error("création refusée");
  if(wsPlaceOf("stack")!=="dockL")
    throw new Error("un utilisateur neuf part de la disposition d'usine : "+
                    wsPlaceOf("stack"));
  profChoisir("Pilou");
  if(wsPlaceOf("stack")!=="dockB")
    throw new Error("Pilou n'a pas retrouvé la sienne : "+wsPlaceOf("stack"));
  wsMove("stack","dockL",0);
  profSupprimer("Marie2");
  if(profListe().indexOf("Marie2")>=0)throw new Error("suppression sans effet");
});
T("le dernier utilisateur ne se supprime pas",()=>{
  for(const n of profListe())if(n!=="Pilou")profSupprimer(n);
  if(profListe().length!==1)throw new Error("il devait rester Pilou seul : "+profListe());
  if(profSupprimer("Pilou"))throw new Error("le seul utilisateur a été supprimé");
  if(profNom()!=="Pilou")throw new Error("utilisateur courant perdu : "+profNom());
});
T("derniers documents : sans doublon, le plus récent d'abord, et borné",()=>{
  profOublier("recents:pcb");
  for(let i=1;i<=10;i++)profNoterDocument("pcb","carte"+i+".json");
  profNoterDocument("pcb","carte3.json");
  const r=profRecents("pcb");
  if(r.length!==8)throw new Error("liste non bornée : "+r.length);
  if(r[0].nom!=="carte3.json")throw new Error("ordre : "+r[0].nom);
  if(r.filter(e=>e.nom==="carte3.json").length!==1)
    throw new Error("doublon dans la liste");
  if(!r[0].t)throw new Error("date manquante");
  profOublier("recents:pcb");
});
T("réglages d'affichage : ils suivent l'utilisateur, pas la carte",()=>{
  setGridStep(0.5);setContrast(2);setFlip(true);
  const av=profLire("reglages:pcb");
  if(!av)throw new Error("rien enregistré sous reglages:pcb");
  if(Math.abs(av.grille-0.5)>1e-9)throw new Error("pas de grille : "+av.grille);
  if(av.contraste!==2)throw new Error("contraste : "+av.contraste);
  if(av.vue!=="dessous")throw new Error("vue : "+av.vue);
  /* rien de tout cela n'a le droit d'entrer dans le document */
  const doc=docObj();
  for(const k of ["grid","showGrid","flip","contrast","avoid"])
    if(k in doc)throw new Error("« "+k+" » s'est glissé dans la carte");
  /* Retour aux valeurs d'usine — ce que fait init() au démarrage — puis on
     remet dans le profil ce qu'il contenait : c'est exactement la situation
     d'une page qui s'ouvre, ou d'un changement d'utilisateur. */
  setGridStep(0.1);setContrast(0);setFlip(false);
  profEcrire("reglages:pcb",av);
  profilAppliquer(false);
  if(Math.abs(S.grid-0.5)>1e-9)throw new Error("grille non rétablie : "+S.grid);
  if(S.contrast!==2)throw new Error("contraste non rétabli : "+S.contrast);
  if(!S.flip)throw new Error("vue non rétablie");
  /* `garderVue` : la session d'onglet vient de trancher, on ne la contredit pas */
  setFlip(false);
  profEcrire("reglages:pcb",av);
  profilAppliquer(true);
  if(S.flip)throw new Error("la vue de la session d'onglet a été écrasée");
  if(Math.abs(S.grid-0.5)>1e-9)throw new Error("le reste devait être rétabli");
  setGridStep(0.1);setContrast(1);setFlip(false);
});
T("un contrôle DRC ne devient pas une habitude",()=>{
  S.listTab="drc";
  if(profilEtat().liste!=="nets")
    throw new Error("l'onglet DRC a été retenu : "+profilEtat().liste);
  S.listTab="nets";
});
T("sans stockage, l'éditeur s'ouvre quand même",()=>{
  /* Mode privé, stockage coupé par une stratégie : profEcrire renonce, mais
     rien ne lève — c'est tout ce qui compte ici. */
  const vrai=dom.storage.setItem;
  dom.storage.setItem=()=>{throw new Error("stockage refusé");};
  try{
    profEcrire("essai:refus",{a:1});
    wsSave();
    wsApply(false);
  }finally{ dom.storage.setItem=vrai; }
  profOublier("essai:refus");
  profOublier("essai:cloison");
});


/* ==========================================================================
   Ordre de chargement : ce qui tourne au démarrage ne peut compter sur rien
   de ce qui vient après
   --------------------------------------------------------------------------
   init() (fin de 07-app.js) se termine par sessionPcb(), qui rappelle
   loadDoc() pour ramener la carte laissée dans l'onglet. Or 15-regles.js est
   chargé APRÈS 07-app.js : à cet instant précis, la fenêtre des règles
   n'existe pas — ni sa fonction en pages séparées, ni son état dans la
   version un seul fichier, où la fonction est hoistée mais où `RE` est encore
   sur le pas de la porte. loadDoc() a levé pendant tout un temps pour cette
   raison, et sessionPcb(), qui attrape, déclarait la carte illisible et
   effaçait la session : le travail était perdu à chaque aller-retour entre le
   schéma et le PCB.
   ========================================================================== */
/* ==========================================================================
   Pistes circulaires
   --------------------------------------------------------------------------
   Le cas qui les amène : une antenne NFC ronde. Elle arrive d'un fichier — le
   routeur ne pose que du 45° — et l'éditeur doit savoir la montrer, la
   mesurer, la relier, la contrôler et la sortir en Gerber sans la redresser.
   Chacun de ces passages a son essai ici.
   ========================================================================== */
/* Un demi-cercle de rayon 5 mm, allant de gauche à droite : les deux bouts
   sont sur l'horizontale, l'angle balayé fait un demi-tour. */
function arcDemi(sens){
  return {l:0,net:"ANT",w:0.3,x1:15,y1:15,x2:25,y2:15,ca:sens*Math.PI};
}
T("arc : centre, rayon et angles se déduisent de la corde",()=>{
  const A=arcOf(arcDemi(1));
  if(!A)throw new Error("un demi-tour devrait donner un arc");
  if(Math.abs(A.r-5)>1e-9)throw new Error("rayon 5 mm attendu, "+A.r);
  if(Math.abs(A.cx-20)>1e-9||Math.abs(A.cy-15)>1e-9)
    throw new Error("le centre d'un demi-tour est au milieu de la corde : "+A.cx+","+A.cy);
  /* Les deux bouts sont bien sur le cercle : c'est toute la raison de ranger
     l'angle plutôt que le centre. */
  for(const p of [{x:15,y:15},{x:25,y:15}])
    if(Math.abs(Math.hypot(p.x-A.cx,p.y-A.cy)-A.r)>1e-9)
      throw new Error("un bout a quitté le cercle");
  if(isArc({l:0,net:"",w:0.3,x1:0,y1:0,x2:1,y2:0}))
    throw new Error("sans ca, la piste est droite");
});
T("arc : le sens décide du côté où passe le cuivre",()=>{
  const haut=trkMid(arcDemi(1)), bas=trkMid(arcDemi(-1));
  /* Sens des aiguilles d'une montre pour un angle positif : d'un bout gauche à
     un bout droit, l'arc passe par le haut — de 9 h à 3 h en passant par midi. */
  if(!(haut.y<15-4.9))throw new Error("l'arc positif devrait passer par le haut, y="+haut.y);
  if(!(bas.y>15+4.9))throw new Error("l'arc négatif devrait passer par le bas, y="+bas.y);
  if(Math.abs(haut.x-20)>1e-9||Math.abs(bas.x-20)>1e-9)
    throw new Error("le milieu d'un demi-tour est au sommet du ventre");
});
T("arc : la longueur est celle du cuivre, pas celle de la corde",()=>{
  const t=arcDemi(1);
  if(Math.abs(trkLen(t)-Math.PI*5)>1e-9)
    throw new Error("pi*R attendu pour un demi-tour, "+trkLen(t));
  const droit={l:0,net:"",w:0.3,x1:0,y1:0,x2:3,y2:4};
  if(Math.abs(trkLen(droit)-5)>1e-12)throw new Error("une piste droite mesure sa corde");
});
T("arc : la boîte englobe le ventre, pas seulement la corde",()=>{
  const b=trkBBox(arcDemi(1));
  if(Math.abs(b.y1-10)>1e-9)
    throw new Error("le ventre monte à 10 mm, la boîte s'arrête à "+b.y1);
  if(Math.abs(b.y2-15)>1e-9||Math.abs(b.x1-15)>1e-9||Math.abs(b.x2-25)>1e-9)
    throw new Error("la boîte déborde du demi-cercle : "+JSON.stringify(b));
});
T("arc : on l'attrape sur son ventre, pas sur sa corde",()=>{
  const t=arcDemi(1);
  if(trkDist(20,10,t)>1e-9)throw new Error("le sommet du ventre est sur l'axe");
  if(trkDist(20,15,t)<4.9)throw new Error("le milieu de la corde est loin du cuivre");
  /* Sous la corde, on est hors du balayage : c'est le bout le plus proche qui
     compte, le cuivre s'arrête là et ne fait pas le tour du cercle. */
  if(Math.abs(trkDist(20,20,t)-Math.hypot(5,5))>1e-9)
    throw new Error("sous la corde, le bout le plus proche fait la distance");
  const sauve=S.tracks, act=S.active;
  S.tracks=[t];S.active=0;touch();
  try{
    const h=hitTest(20,10,null);
    if(!h||h.track!==t)throw new Error("le clic sur le ventre n'attrape pas la piste");
    const c=hitTest(20,15,null);
    if(c&&c.track===t)throw new Error("le clic sur la corde attrape du cuivre absent");
  }finally{S.tracks=sauve;S.active=act;touch();}
});
T("arc : les cordes de découpe restent sous la flèche tolérée",()=>{
  const t=arcDemi(1), A=arcOf(t), segs=trkSegs(t);
  if(segs.length<4)throw new Error("un demi-tour ne tient pas en "+segs.length+" cordes");
  for(const s of segs){
    const d=Math.hypot(s.x2-s.x1,s.y2-s.y1);
    const f=A.r-Math.sqrt(Math.max(0,A.r*A.r-d*d/4));   // flèche de la corde
    if(f>ARC_SAG+1e-9)throw new Error("corde trop longue : flèche de "+f+" mm");
  }
  /* Les cordes vont bien d'un bout à l'autre, sans trou ni saut. */
  if(Math.abs(segs[0].x1-15)>1e-9||Math.abs(segs[segs.length-1].x2-25)>1e-9)
    throw new Error("la découpe ne part pas des bouts de la piste");
  const droit={l:0,net:"",w:0.3,x1:0,y1:0,x2:3,y2:4};
  if(trkSegs(droit).length!==1)throw new Error("une piste droite rend un seul segment");
});
T("document : l'angle fait l'aller-retour, et lui seul",()=>{
  const doc=normDoc({cu:2,tracks:[{l:0,net:"ANT",w:0.3,x1:15,y1:15,x2:25,y2:15,ca:Math.PI},
                                  {l:0,net:"N1",w:0.3,x1:0,y1:0,x2:5,y2:0}]});
  const a=doc.tracks[0], b=doc.tracks[1];
  if(Math.abs(a.ca-r4(Math.PI))>1e-9)throw new Error("l'angle est perdu à la relecture");
  if("ca" in b)throw new Error("une piste droite ne doit pas écrire la clé : "+
                               "un document sans arc doit ressortir inchangé");
  /* Un fichier écrit à la main peut dire n'importe quoi : le tour complet n'a
     pas de corde, et un angle absurde ne doit pas faire de NaN. */
  const fou=normDoc({cu:2,tracks:[{l:0,net:"",w:0.3,x1:0,y1:0,x2:5,y2:0,ca:99},
                                  {l:0,net:"",w:0.3,x1:0,y1:1,x2:5,y2:1,ca:"oui"}]});
  if(Math.abs(fou.tracks[0].ca)>ARC_MAX)throw new Error("l'angle n'est pas borné");
  if("ca" in fou.tracks[1])throw new Error("un angle illisible doit disparaître");
  const A=arcOf(fou.tracks[0]);
  if(!A||!Number.isFinite(A.r)||!Number.isFinite(A.cx))
    throw new Error("un angle borné doit encore donner un cercle");
});
T("arc : couper en deux garde le cercle",()=>{
  const sauve=S.tracks;
  const t=arcDemi(1);
  S.tracks=[t];touch();
  try{
    const A0=arcOf(t);
    const pt=projOnSeg(20,5,t);             // au-dessus du ventre : retombe sur le sommet
    if(Math.abs(pt.x-20)>1e-3||Math.abs(pt.y-10)>1e-3)
      throw new Error("la projection quitte le cuivre : "+pt.x+","+pt.y);
    const nt=splitTrack(t,pt);
    if(Math.abs(t.ca+nt.ca-Math.PI)>1e-3)
      throw new Error("les deux moitiés ne se partagent pas l'angle");
    for(const m of [t,nt]){
      const A=arcOf(m);
      if(!A||Math.abs(A.r-A0.r)>1e-3||Math.abs(A.cx-A0.cx)>1e-3||Math.abs(A.cy-A0.cy)>1e-3)
        throw new Error("un morceau a changé de cercle : R="+(A&&A.r));
    }
  }finally{S.tracks=sauve;touch();}
});
T("antenne ronde : deux demi-tours font un net d'un seul tenant",()=>{
  const sFps=S.fps, sTr=S.tracks, sVia=S.vias, sZ=S.zones;
  S.fps=[];S.vias=[];S.zones=[];
  /* Une boucle fermée s'écrit en deux demi-tours : deux bouts confondus ne
     seraient plus une piste. C'est ainsi qu'une antenne se range. */
  S.tracks=[{l:0,net:"ANT",w:0.3,x1:15,y1:15,x2:25,y2:15,ca:Math.PI},
            {l:0,net:"ANT",w:0.3,x1:25,y1:15,x2:15,y2:15,ca:Math.PI},
            /* une piste droite qui vient toucher le ventre du haut, en T */
            {l:0,net:"ANT",w:0.3,x1:20,y1:10,x2:20,y2:4}];
  touch();
  try{
    const c=conn(true);
    if(c.find("T0a")!==c.find("T1a"))
      throw new Error("les deux demi-tours ne se rejoignent pas");
    if(c.find("T0a")!==c.find("T2a"))
      throw new Error("une piste posée sur le ventre de l'arc devrait s'y relier");
    /* Le même point, sur la corde et non sur le cuivre, ne relie rien. */
    S.tracks[2]={l:0,net:"ANT",w:0.3,x1:20,y1:15,x2:20,y2:2};
    touch();
    const c2=conn(true);
    if(c2.find("T0a")===c2.find("T2a"))
      throw new Error("une piste posée sur la corde ne touche aucun cuivre");
  }finally{S.fps=sFps;S.tracks=sTr;S.vias=sVia;S.zones=sZ;touch();}
});
T("Gerber : l'arc sort en arc, pas en escalier",()=>{
  const sTr=S.tracks;
  S.tracks=[{l:0,net:"ANT",w:0.3,x1:15,y1:15,x2:25,y2:15,ca:Math.PI}];
  touch();
  try{
    const g=gerberCopper(0);
    if(g.indexOf("G75*")<0)throw new Error("le mode multi-quadrant doit être déclaré");
    const m=/G0([23])X(-?\d+)Y(-?\d+)I(-?\d+)J(-?\d+)D01\*/.exec(g);
    if(!m)throw new Error("aucune interpolation circulaire dans le fichier");
    /* L'axe Y du Gerber monte, celui du document descend : l'arc horaire à
       l'écran s'écrit antihoraire dans le fichier. */
    if(m[1]!=="2")throw new Error("sens d'arc inversé : G0"+m[1]);
    /* I et J vont du départ au centre : cinq millimètres vers la droite,
       rien en Y — le centre est au milieu de la corde. */
    if(+m[4]!==5000000||+m[5]!==0)
      throw new Error("décalages I/J faux : I="+m[4]+" J="+m[5]);
    if((g.match(/D01\*/g)||[]).length>3)
      throw new Error("l'arc a été découpé en segments au lieu d'être écrit en arc");
    if(g.slice(g.indexOf("G75*")).indexOf("G01*")<0)
      throw new Error("le trait droit doit être rétabli derrière l'arc");
  }finally{S.tracks=sTr;touch();}
});
T("DRC : un arc trop près se signale une fois, pas vingt",()=>{
  const sFps=S.fps, sTr=S.tracks, sVia=S.vias, sZ=S.zones;
  S.fps=[];S.vias=[];S.zones=[];
  /* La droite passe juste sous le ventre du demi-tour : le défaut court sur
     tout l'arc, donc sur toutes ses cordes. C'est UNE piste en faute. */
  S.tracks=[{l:0,net:"ANT",w:0.3,x1:15,y1:15,x2:25,y2:15,ca:Math.PI},
            {l:0,net:"N1", w:0.3,x1:14,y1:9.69,x2:26,y2:9.69}];
  touch();
  try{
    const d=runDrc().filter(e=>/Isolation piste\/piste/.test(e.msg));
    if(!d.length)throw new Error("l'arc frôle la piste : le défaut n'est pas vu — "+
                                 "c'est la corde qui a été mesurée");
    if(d.length>1)throw new Error(d.length+" fois le même défaut : une par corde");
    /* Écartée de deux millimètres, la même piste ne dérange plus personne. */
    S.tracks[1].y1=S.tracks[1].y2=7;
    touch();
    if(runDrc().some(e=>/Isolation piste\/piste/.test(e.msg)))
      throw new Error("défaut inventé là où l'isolation est tenue");
    /* Et la corde, elle, ne doit gêner personne : une piste qui la longe passe. */
    S.tracks[1]={l:0,net:"N1",w:0.3,x1:16,y1:15,x2:24,y2:15};
    touch();
    if(runDrc().some(e=>/Isolation piste\/piste/.test(e.msg)))
      throw new Error("la corde d'un arc a été prise pour du cuivre");
  }finally{S.fps=sFps;S.tracks=sTr;S.vias=sVia;S.zones=sZ;touch();}
});
T("arc : ni écharde de gravure, ni angle bâtard",()=>{
  const sFps=S.fps, sTr=S.tracks, sVia=S.vias, sZ=S.zones;
  S.fps=[];S.vias=[];S.zones=[];
  /* Un congé plus court que la piste n'est large. Droit, ce serait une écharde
     de gravure ; courbe, c'est un raccord, et sa corde n'est pas un angle. */
  S.tracks=[{l:0,net:"N1",w:0.3,x1:10,y1:15,x2:20,y2:15},
            {l:0,net:"N1",w:0.3,x1:20,y1:15,x2:20.09,y2:15.21,ca:Math.PI/2},
            {l:0,net:"N1",w:0.3,x1:20.09,y1:15.21,x2:20.09,y2:25}];
  touch();
  try{
    for(const e of runDrc()){
      if(/Décrochement/.test(e.msg))throw new Error("un congé pris pour une écharde");
      if(/hors des huit sens/.test(e.msg))
        throw new Error("la corde d'un arc prise pour un angle bâtard");
    }
  }finally{S.fps=sFps;S.tracks=sTr;S.vias=sVia;S.zones=sZ;touch();}
});
T("arc : ses propres cordes ne se prennent pas les unes pour des obstacles",()=>{
  const sFps=S.fps, sTr=S.tracks, sVia=S.vias, sZ=S.zones;
  S.fps=[];S.vias=[];S.zones=[];
  /* Sans net, deux cuivres voisins ne se reconnaissent pas comme reliés : les
     cordes d'un même arc se seraient déclarées en défaut d'isolation les unes
     contre les autres, alors qu'elles sont un seul trait de cuivre. */
  S.tracks=[{l:0,w:0.3,net:"",x1:15,y1:15,x2:25,y2:15,ca:Math.PI}];
  touch();
  try{
    for(const e of runDrc())
      if(/Isolation piste\/piste/.test(e.msg))
        throw new Error("l'arc se prend lui-même pour un obstacle : "+e.msg);
  }finally{S.fps=sFps;S.tracks=sTr;S.vias=sVia;S.zones=sZ;touch();}
});
T("arc : le routeur ne le redresse pas en le poussant",()=>{
  const sFps=S.fps, sTr=S.tracks, sVia=S.vias, sZ=S.zones;
  S.fps=[];S.vias=[];S.zones=[];
  const arc={l:0,net:"ANT",w:0.3,x1:15,y1:15,x2:25,y2:15,ca:Math.PI};
  S.tracks=[arc];
  touch();
  try{
    /* Le modèle du monde le range en cordes — sans quoi le contrôle mesurerait
       une droite — mais chacune porte la piste d'origine et la marque `arc` :
       c'est elle qui interdit au shove de l'enfiler dans une polyligne, puis
       de la rendre à `S.tracks` en segments droits. */
    const its=pnsItemsTrack(arc);
    if(its.length<4)throw new Error("l'arc doit entrer en plusieurs cordes");
    if(!its.every(i=>i.arc===arc&&i.src===arc))
      throw new Error("une corde a perdu la piste dont elle vient");
    const N=pnsWorld();
    const seed=[...N.all()].find(i=>i.arc===arc);
    if(!seed)throw new Error("les cordes de l'arc n'entrent pas dans le monde");
    const L=N.assemble(seed);
    if(L.items.length!==1)
      throw new Error("l'assemblage a enfilé "+L.items.length+" cordes : "+
                      "poussées, elles seraient rendues en segments droits");
  }finally{S.fps=sFps;S.tracks=sTr;S.vias=sVia;S.zones=sZ;touch();}
});
T("pages séparées : l'appel du démarrage est gardé à la source",()=>{
  /* Le banc d'essai tourne sur le bundle, où toutes les fonctions sont
     hoistées : il ne peut pas voir qu'en pages séparées reSync n'existe pas
     encore au moment où loadDoc l'appelle. C'est donc la source qu'on lit. */
  const src=fs.readFileSync(path.join(__dirname,"..","js","05-tools.js"),"utf8");
  const corps=src.slice(src.indexOf("function loadDoc("),
                        src.indexOf("function undo("));
  if(!/typeof\s+reSync\s*===\s*"function"/.test(corps))
    throw new Error("loadDoc() appelle la fenêtre des règles sans garde : "+
                    "en pages séparées, elle n'est pas encore chargée quand "+
                    "la carte de la session revient");
});
T("reprise au démarrage : loadDoc ne dépend pas de la fenêtre des règles",()=>{
  const sauve=RE, doc=JSON.parse(serialize());
  RE=undefined;                       // l'état de la fenêtre, avant son fichier
  try{
    if(reIsOpen())throw new Error("une fenêtre inexistante ne peut pas être ouverte");
    reSync();                         // ne doit rien faire, surtout pas lever
    loadDoc(doc,true);
  }catch(e){
    throw new Error("le démarrage lève : "+e.message);
  }finally{
    RE=sauve;
  }
  const d=firstDiff(doc,docObj(),"doc");
  if(d)throw new Error("la carte n'a pas été relue à l'identique : "+d);
});
T("session : la carte revient même quand la page vient de démarrer",()=>{
  /* Le même défaut, vu du côté de l'utilisateur : c'est sessionPcb() qui
     décide, et un échec ici efface silencieusement le travail mis de côté. */
  const doc=JSON.parse(serialize());
  sessEcrire("pcb",{doc:doc,sale:true,vue:{scale:S.scale,ox:S.ox,oy:S.oy,flip:false}});
  const sauve=RE;
  RE=undefined;
  let repris=false;
  try{ repris=sessionPcb(); }finally{ RE=sauve; }
  if(!repris)throw new Error("la carte mise de côté n'a pas été reprise : "+
                             $("fHint").textContent);
  if(!S.dirty)throw new Error("l'état « modifié » devait revenir avec elle");
  sessEffacer("pcb");
  S.dirty=false;
});


/* ==========================================================================
   Cartes d'exemple (17-exemples.js)
   Une carte d'exemple est là pour montrer du travail fini. Si elle laissait un
   net ouvert, ou si le contrôle avait quelque chose à lui reprocher, elle
   apprendrait exactement le contraire de ce qu'elle prétend montrer — et
   personne ne s'en apercevrait, puisqu'on l'ouvre justement pour ne pas avoir
   à vérifier soi-même. D'où ces essais : les exemples se chargent comme le
   fait le bouton « Exemples… », et subissent tout ce qu'un utilisateur leur
   ferait subir.
   ========================================================================== */
EXEMPLES.forEach(ex=>{
  T("exemple « "+ex.titre+" » : entièrement routé, et sans remarque au contrôle",()=>{
    loadDoc(ex.build());
    if(S.fps.length<5)throw new Error("carte trop maigre : "+S.fps.length+" empreinte(s)");
    if(!S.tracks.length)throw new Error("aucune piste");
    let miss=0;
    for(const n of conn(true).nets.values())miss+=n.miss;
    if(miss)throw new Error(miss+" liaison(s) non routée(s)");
    const e=runDrc();
    if(e.length)throw new Error(e.length+" remarque(s), la première : "+e[0].msg);
  });
  T("exemple « "+ex.titre+" » : l'aller-retour du document ne le change pas",()=>{
    /* Un exemple s'enregistre et s'annule comme une carte à soi : il passe donc
       par normDoc(), qui doit le rendre tel quel. */
    loadDoc(ex.build());
    const a=JSON.parse(serialize());
    loadDoc(a);
    const d=firstDiff(a,docObj(),"doc");
    if(d)throw new Error("le document a changé en chemin : "+d);
  });
});
T("exemple 4 couches : deux plans internes, une paire couplée, un dos qui sert",()=>{
  loadDoc(exemple2());
  if(S.cu!==4)throw new Error("4 couches attendues, "+S.cu);
  if(layerRole(1)!=="gnd")throw new Error("L2 devrait être un plan de masse");
  if(layerRole(2)!=="pwr")throw new Error("L3 devrait être un plan d'alimentation");
  for(const t of S.tracks)
    if(t.l===1||t.l===2)throw new Error("une piste traverse un plan interne");
  if(!S.tracks.some(t=>t.l===S.cu-1))throw new Error("le dos ne porte aucune piste");
  const q=S.dpPairs[0];
  if(!q)throw new Error("aucune paire différentielle déclarée");
  for(const t of S.tracks)
    if((t.net===q.p||t.net===q.n)&&t.l!==0)
      throw new Error("la paire change de couche : elle perdrait son plan de référence");
  const cp=dpCoupling(q);
  if(Math.abs(cp.len-cp.lenN)>0.05)
    throw new Error("les deux pistes de la paire n'ont pas la même longueur : "+
                    fmt(Math.abs(cp.len-cp.lenN),3)+" mm d'écart");
  const r=dpRuleFor(q);
  if(cp.uncoupled>r.maxUncoupled)
    throw new Error(fmt(cp.uncoupled,2)+" mm découplés pour "+r.maxUncoupled+" admis");
  if(cp.coupled<cp.len*0.9)
    throw new Error("paire couplée sur "+fmt(cp.coupled,1)+" mm seulement, pour "+
                    fmt(cp.len,1)+" mm de piste");
});
T("plan pleine carte : ses sommets sont SUR le contour, pas dehors",()=>{
  /* Le rôle de couche dessine sa zone aux dimensions exactes de la carte : ses
     quatre sommets tombent sur le trait du contour. `inPoly` ne tranche pas sur
     sa propre frontière — un coin y passait, le suivant non — et toute carte à
     plan se voyait donc reprocher un débordement qu'elle n'avait pas. */
  loadDoc(exemple1());
  if(runDrc().some(x=>/débordant/.test(x.msg)))
    throw new Error("le plan pleine carte est compté hors du contour");
  /* Une zone réellement dehors, elle, doit toujours être signalée. */
  push();
  S.zones.push({id:S.nextId++,l:0,net:"GND",
                pts:[{x:-8,y:-8},{x:-2,y:-8},{x:-2,y:-2},{x:-8,y:-2}]});
  touch();
  if(!runDrc().some(x=>/débordant/.test(x.msg)))
    throw new Error("une zone posée hors de la carte passe inaperçue");
  undo();
});


/* ==========================================================================
   Repérage : chercher un repère, mesurer une distance
   --------------------------------------------------------------------------
   Le comportement est dans commun/reperage.js, ce que la carte en fait est
   dans 18-reperage.js. Les deux se vérifient ici par le geste, pas par l'état
   interne : on clique, et on lit ce que la cote annonce.
   ========================================================================== */
T("mesure : deux points, la cote, les deltas et l'angle",()=>{
  loadDoc(exemple1());
  S.scale=20;                       // portée de l'aimant : px(9) = 0,45 mm
  setMode("mesure");
  /* Hors de la carte : rien à quoi s'accrocher, la grille décide seule. */
  rpMesClic(-10,-10);
  rpMesClic(-7,-6);
  const c=rpMesCotes();
  if(!c)throw new Error("aucune cote après deux clics");
  if(Math.abs(c.dx-3)>1e-6||Math.abs(c.dy-4)>1e-6)
    throw new Error("deltas faux : dX "+c.dx+" dY "+c.dy);
  if(Math.abs(c.d-5)>1e-6)throw new Error("3-4-5 attendu, "+c.d+" mm");
  /* L'angle est celui qu'on lit à l'écran : Y descend, il est donc négatif. */
  if(Math.abs(c.ang+53.13)>0.02)throw new Error("angle : "+c.ang+" degrés");
  setMode("select");
});
T("mesure : le point s'accroche au centre de la pastille, pas au pixel visé",()=>{
  loadDoc(exemple1());
  S.scale=20;setActive(0);
  setMode("mesure");
  const r1=S.fps.find(f=>f.ref==="R1");
  const q=padsWorld(r1)[0];
  rpMesClic(q.x+0.08,q.y-0.06);     // visé à côté, dans la portée de l'aimant
  const a=RP.mes.a;
  if(a.quoi!=="pastille")throw new Error("accroché sur "+a.quoi);
  if(Math.abs(a.x-q.x)>1e-9||Math.abs(a.y-q.y)>1e-9)
    throw new Error("le point n'est pas au centre de la pastille");
  setMode("select");
});
T("mesure : hors de portée d'un aimant, c'est la grille — jamais le point brut",()=>{
  loadDoc(exemple1());
  S.scale=20;setGridStep(0.5);
  setMode("mesure");
  rpMesClic(-10.31,-10.19);
  const a=RP.mes.a;
  if(a.quoi!=="grille")throw new Error("accroché sur "+a.quoi);
  if(a.x!==snapX(-10.31)||a.y!==snapY(-10.19))
    throw new Error("relevé au pixel visé : "+a.x+" ; "+a.y);
  setMode("select");
});
T("mesure : la cote se fige, et un clic de plus repart d'ailleurs",()=>{
  loadDoc(exemple1());
  S.scale=20;
  setMode("mesure");
  rpMesClic(-10,-10);
  rpMesClic(-7,-6);
  /* Figée : la souris qui passe ne doit plus la bouger — c'est ce qui permet
     de relire une cote posée. */
  const avant=rpMesCotes().d;
  rpMesBouge(-30,-30);
  if(Math.abs(rpMesCotes().d-avant)>1e-9)
    throw new Error("la cote figée a suivi la souris");
  rpMesClic(0,0);                   // troisième clic : nouvelle mesure
  if(RP.mes.b)throw new Error("le troisième clic n'a pas rouvert une mesure");
  if(RP.mes.a.x!==0||RP.mes.a.y!==0)
    throw new Error("le nouveau départ n'est pas là où l'on a cliqué");
  setMode("select");
});
T("mesure : quitter le mode efface la cote, Échap aussi",()=>{
  loadDoc(exemple1());
  S.scale=20;
  setMode("mesure");
  rpMesClic(-10,-10);rpMesClic(-7,-6);
  if(!rpMesEnCours())throw new Error("rien de mesuré");
  rpMesRaz();
  if(rpMesEnCours()||rpMesPaire())throw new Error("Échap laisse la cote en place");
  rpMesClic(-10,-10);rpMesClic(-7,-6);
  setMode("select");
  if(rpMesEnCours())
    throw new Error("la cote survit au retour à la sélection");
});
T("mesure : la lecture donne des millimètres, et dit que c'est une cote",()=>{
  loadDoc(exemple1());
  S.scale=20;
  setMode("mesure");
  rpMesClic(-10,-10);rpMesClic(-7,-6);
  const L=rpMesLecture();
  if(!/^Mesure 5 mm/.test(L))throw new Error("lecture : "+L);
  if(L.indexOf("cote figée")<0)throw new Error("la cote figée ne se dit pas : "+L);
  /* Au PCB la mesure EST la cote de fabrication : rien ne doit la relativiser,
     contrairement au schématique. */
  if(L.indexOf("convention de dessin")>=0)
    throw new Error("le PCB relativise une cote qui est pourtant physique");
  setMode("select");
});
T("recherche : le repère tapé en entier passe devant ses homonymes plus longs",()=>{
  loadDoc(exemple1());
  /* R1 existe ; on lui ajoute deux voisins qui le contiennent. Sans classement,
     R1 sortirait après R10 et R100 — c'est-à-dire que la frappe la plus courte,
     la plus fréquente, serait la plus mal servie. */
  for(const r of ["R10","R100"]){
    const f=mkFp(r,"1k","0603",2);
    f.x=40;f.y=30;S.fps.push(f);
  }
  const res=rpTrouve("R1");
  if(!res.length)throw new Error("R1 introuvable");
  if(res[0].cle!=="R1")throw new Error("premier résultat : "+res[0].cle);
  const cles=res.map(x=>x.cle);
  if(cles.indexOf("R10")<0||cles.indexOf("R100")<0)
    throw new Error("les homonymes ont disparu de la liste : "+cles.join(", "));
});
T("recherche : aller sur une empreinte la sélectionne et l'amène au centre",()=>{
  loadDoc(exemple1());
  S.scale=2;clearSel();
  const cible=rpTrouve("Q3").find(x=>x.cle==="Q3");
  if(!cible)throw new Error("Q3 introuvable");
  cible.aller();
  const q3=S.fps.find(f=>f.ref==="Q3");
  if(!S.sel.fps.has(q3.id))throw new Error("Q3 n'est pas sélectionné");
  const p=w2s(q3.x,q3.y);
  if(Math.abs(p.x-cv.clientWidth/2)>2||Math.abs(p.y-cv.clientHeight/2)>2)
    throw new Error("Q3 n'est pas au centre : "+fmt(p.x,0)+" ; "+fmt(p.y,0));
  /* Un SOT-23 vu de trop loin ne se verrait pas : le cadrage s'approche. */
  if(S.scale<2)throw new Error("le cadrage a reculé au lieu de s'approcher");
});
T("recherche : un net se trouve par son nom et sort son cuivre",()=>{
  loadDoc(exemple1());
  clearSel();S.hlNet=null;
  const cible=rpTrouve("SORTIE").find(x=>x.cle==="SORTIE");
  if(!cible)throw new Error("le net SORTIE ne se trouve pas");
  if(cible.type!=="net")throw new Error("trouvé comme "+cible.type);
  cible.aller();
  if(S.hlNet!=="SORTIE")throw new Error("le net n'est pas mis en avant");
  if(!S.sel.tracks.size)throw new Error("aucun segment de SORTIE sélectionné");
  for(const t of S.sel.tracks)
    if(t.net!=="SORTIE")throw new Error("du cuivre étranger dans la sélection");
});
T("recherche : un net déclaré mais nulle part ne fait pas sauter le cadrage",()=>{
  loadDoc(exemple1());
  S.scale=7;
  const s0=S.scale, ox=S.ox, oy=S.oy;
  /* rpNetBox ne rend rien pour un net sans pastille ni cuivre : l'appelant doit
     garder sa vue plutôt que de cadrer sur une boîte vide. */
  if(rpNetBox("NET_FANTOME"))throw new Error("une boîte pour un net absent");
  const cible=rpTrouve("SORTIE").find(x=>x.cle==="SORTIE");
  cible.aller();
  if(S.scale===s0&&S.ox===ox&&S.oy===oy)
    throw new Error("un net bien présent, lui, doit recadrer");
});
T("recherche : la liste échappe ce qui vient du document",()=>{
  loadDoc(exemple1());
  const f=mkFp("R9",XSS,"0603",2);
  f.x=40;f.y=30;S.fps.push(f);
  $("rpQ").value="R9";
  rpQBuild();
  assertPropre($("rpRes").innerHTML,"liste de recherche");
  assertPresent($("rpRes").innerHTML,"liste de recherche");
});
T("recherche : la boîte s'ouvre, se ferme, et ne liste rien sur un champ vide",()=>{
  loadDoc(exemple1());
  $("rpQ").value="";
  rpQOuvrir();
  if(!RP.q.ouvert)throw new Error("la boîte ne s'ouvre pas");
  if(!$("rpBox").classList.contains("on"))throw new Error("la boîte reste cachée");
  /* Champ vide : on invite, on ne liste pas les cent empreintes de la carte. */
  if(RP.q.res.length)throw new Error("une liste sortie d'un champ vide");
  rpQFermer();
  if(RP.q.ouvert||$("rpBox").classList.contains("on"))
    throw new Error("la boîte ne se ferme pas");
});

/* ==========================================================================
   Nom de projet : d'où viennent les noms de fichiers
   --------------------------------------------------------------------------
   Le nom du projet est choisi à l'accueil et vit dans localStorage. Tous les
   noms de fichiers en découlent — et sans projet, ils doivent rester ceux
   d'avant, au caractère près.
   ========================================================================== */
const PROJ_FIXES=new Set(["LISEZ-MOI.txt","positions.csv","bom.csv","EMPILAGE.txt"]);
T("noms de fichiers : le projet les mène, et sans projet rien ne change",()=>{
  loadDoc(exemple1());
  projFermer();
  const avant=buildFabFiles().files.map(f=>f.name);
  for(const n of ["carte.GTL","carte.GM1","carte.ipc","carte-MASTER-DRAWING.pdf"])
    if(!avant.includes(n))throw new Error("sans projet, "+n+" a changé de nom");
  projOuvrir("carte PIR");
  try{
    if(fabBase()!=="carte PIR-PCB")throw new Error("fabBase : "+fabBase());
    const apres=buildFabFiles().files.map(f=>f.name);
    if(apres.length!==avant.length)
      throw new Error(avant.length+" fichiers sans projet, "+apres.length+" avec");
    /* Un projet ne doit rien faire d'autre que préfixer : même liste, même
       ordre, seule la base change. Les fichiers à nom fixe ne bougent pas. */
    for(let i=0;i<avant.length;i++){
      const attendu=PROJ_FIXES.has(avant[i])?avant[i]
                    :avant[i].replace(/^carte/,"carte PIR-PCB");
      if(apres[i]!==attendu)
        throw new Error(attendu+" attendu, "+apres[i]+" obtenu");
    }
  }finally{ projFermer(); }
});
T("master drawing : le PDF n'annonce aucun fichier que l'archive n'écrit pas",()=>{
  loadDoc(exemple1());
  projOuvrir("carte PIR");
  try{
    const files=buildFabFiles().files;
    const noms=files.map(f=>f.name);
    const pdf=files.find(f=>/MASTER-DRAWING\.pdf$/.test(f.name));
    if(!pdf)throw new Error("pas de master drawing dans l'archive");
    const txt=Buffer.from(pdf.data).toString("latin1");
    if(txt.indexOf("P01x")>=0)throw new Error("le nom figé P01xXXX est resté");
    const annonces=[...new Set(txt.match(/carte PIR-PCB[-\w]*\.[A-Za-z0-9]{2,4}/g)||[])];
    if(!annonces.length)throw new Error("le PDF n'annonce plus aucun nom de fichier");
    const manquants=annonces.filter(n=>!noms.includes(n));
    if(manquants.length)
      throw new Error("annoncé dans le PDF mais absent de l'archive : "+manquants.join(", "));
  }finally{ projFermer(); }
});
T("entête : le nom du projet s'affiche, et s'effface à sa fermeture",()=>{
  const el=document.createElement("span");
  el.setAttribute("data-cao-projet","pcb");
  document.body.appendChild(el);
  try{
    projOuvrir("carte PIR");
    projPeindre();
    if(el.textContent!=="carte PIR-PCB")throw new Error("affiché : "+el.textContent);
    if(el.hidden)throw new Error("le nom reste masqué");
    projFermer();
    projPeindre();
    if(el.textContent!=="")throw new Error("le nom subsiste : "+el.textContent);
    if(!el.hidden)throw new Error("la place reste visible sans projet");
  }finally{ projFermer(); }
});

/* ==========================================================================
   Dossier de projet (commun/projet-disque.js)
   --------------------------------------------------------------------------
   Une couche au-dessus du nom : un fichier projet.cao.json qui porte la
   révision et les liens vers le schéma et la carte. Le miroir synchrone fait
   que projdRevision() et les autres répondent sans attendre, alors que le
   fichier est asynchrone.
   ========================================================================== */
T("dossier : miroir synchrone, détacher, et le nom de fichier se déduit du projet",()=>{
  projdDetacher();
  if(projdLie())throw new Error("détaché mais encore lié");
  projOuvrir("carte PIR");
  const f=projdNeuf(projNom());
  f.revision="B";
  f.fichiers.pcb="carte PIR-PCB.json";
  projdAdopter("test","C:\\test\\carte PIR",f);
  if(projdChemin()!=="C:\\test\\carte PIR")throw new Error("chemin: "+projdChemin());
  if(projdRevision()!=="B")throw new Error("révision: "+projdRevision());
  if(projdNomDoc("pcb")!=="carte PIR-PCB.json")
    throw new Error("nom du document pcb: "+projdNomDoc("pcb"));
  if(projdNomDoc("schema")!=="carte PIR-SCH.json")
    throw new Error("nom du document schéma: "+projdNomDoc("schema"));
  projdDetacher();
  if(projdLie())throw new Error("re-détaché mais encore lié");
  if(projdChemin()!=="")throw new Error("le chemin subsiste");
  /* Le nom du projet survit au détachement : on peut nommer sans attacher. */
  if(projNom()!=="carte PIR")throw new Error("le nom du projet est effacé");
  projFermer();
});
T("dossier : la révision du fichier projet alimente le master drawing",()=>{
  projdDetacher();
  loadDoc(exemple1());
  const avant=buildFabFiles();
  if(!avant||!avant.files.length)throw new Error("aucun fichier de fabrication");
  const pdf1=avant.files.find(f=>/MASTER-DRAWING\.pdf$/i.test(f.name));
  if(!pdf1)throw new Error("pas de master drawing");
  const txt1=Buffer.from(pdf1.data).toString("latin1");
  if(txt1.indexOf("REV: A")<0)throw new Error("révision A attendue, absente");
  projOuvrir("carte PIR");
  const f=projdNeuf(projNom());
  f.revision="C3";
  projdAdopter("test","C:\\test\\carte PIR",f);
  const apres=buildFabFiles();
  const pdf2=apres.files.find(f=>/MASTER-DRAWING\.pdf$/i.test(f.name));
  const txt2=Buffer.from(pdf2.data).toString("latin1");
  if(txt2.indexOf("REV: C3")<0)throw new Error("révision C3 attendue, absente du PDF");
  if(txt2.indexOf("REV: A")>=0)throw new Error("révision A subsiste dans le PDF");
  /* Elle figure aussi dans le tableau de la page 1, pas seulement au cartouche */
  if(txt2.indexOf("[C3]")<0)throw new Error("révision absente du tableau de la page 1");
  projdDetacher();
  projFermer();
});

/* ==========================================================================
   Sélection multiple : les groupes du panneau Propriétés
   ========================================================================== */
/* Cinq vias, dont trois de mêmes cotes : c'est le cas que le panneau doit
   ramener à deux lignes plus la ligne « tous ». */
function cinqVias(){
  carte4c();
  S.vias=[{x:5,y:5,d:0.8,drill:0.4,a:0,b:3,net:"GND"},
          {x:8,y:5,d:0.8,drill:0.4,a:0,b:3,net:"GND"},
          {x:11,y:5,d:0.8,drill:0.4,a:0,b:3,net:"GND"},
          {x:14,y:5,d:0.6,drill:0.3,a:0,b:3,net:"VCC"},
          {x:17,y:5,d:0.5,drill:0.25,a:0,b:1,net:"CLK"}];
  touch();
  clearSel();S.vias.forEach(v=>S.sel.vias.add(v));
  mpRaz();
  buildProps();
  return S.vias;
}
T("cinq vias sélectionnés : trois de mêmes cotes tiennent sur une ligne",()=>{
  const v=cinqVias();
  const h=$("props").innerHTML;
  if(h.indexOf("Vias · 5")<0)throw new Error("la section doit annoncer les cinq vias");
  if(h.indexOf("×3")<0)throw new Error("les trois vias identiques doivent tenir sur une ligne");
  if(h.indexOf("tous")<0)throw new Error("la ligne « tous » manque");
  /* deux groupes d'un seul via : autant de lignes ×1 */
  if(h.split("×1").length-1!==2)throw new Error("deux vias isolés, deux lignes ×1");
  /* la ligne « tous » est ouverte d'office : les cotes diffèrent, elle le dit */
  if(h.indexOf('id="mpViaD" type="number" step="0.05" min="0.2" placeholder="mixte"')<0)
    throw new Error("diamètres différents : le champ doit porter « mixte »");
  if(h.indexOf("— mixte —")<0)throw new Error("le net diffère : l'option « mixte » manque");
  if(v.length!==5)throw new Error("le panneau ne doit toucher à rien");
});
T("le groupe de trois change de diamètre sans entraîner les deux autres",()=>{
  const v=cinqVias();
  /* le clic sur la ligne du groupe : le banc d'essai le fait par l'index */
  const r=mpIdx["vias:0"];
  if(!r||r.list.length!==3)throw new Error("le premier groupe devrait être celui des trois");
  mpOuvert.vias=r.ancre;
  buildProps();
  const h=$("props").innerHTML;
  if(h.indexOf('id="mpViaD" type="number" step="0.05" min="0.2" value="0.80"')<0)
    throw new Error("le groupe partage un diamètre : le champ doit le montrer");
  $("mpViaD").value="1.2";
  $("mpViaD").onchange();
  if(!v.slice(0,3).every(x=>Math.abs(x.d-1.2)<1e-9))
    throw new Error("les trois vias du groupe devaient suivre");
  if(Math.abs(v[3].d-0.6)>1e-9||Math.abs(v[4].d-0.5)>1e-9)
    throw new Error("les deux autres vias ne sont pas du groupe");
  /* un seul coup d'annulation pour les trois */
  undo();
  if(!S.vias.slice(0,3).every(x=>Math.abs(x.d-0.8)<1e-9))
    throw new Error("Ctrl+Z devait rendre les trois diamètres d'un coup");
});
T("un perçage ne peut pas dépasser la pastille, même changé en groupe",()=>{
  const v=cinqVias();
  mpOuvert.vias=mpIdx["vias:0"].ancre;
  buildProps();
  $("mpViaDr").value="5";
  $("mpViaDr").onchange();
  for(const x of v.slice(0,3))
    if(!(x.drill<=x.d-0.1+1e-9))throw new Error("perçage plus large que la pastille : "+x.drill);
});
T("la ligne « tous » aligne toute la sélection sur le champ renseigné",()=>{
  const v=cinqVias();
  if(mpOuvert.vias!=="tous")throw new Error("plusieurs groupes : « tous » s'ouvre d'office");
  $("mpViaD").value="0.7";
  $("mpViaD").onchange();
  if(!v.every(x=>Math.abs(x.d-0.7)<1e-9))throw new Error("les cinq vias devaient suivre");
  /* le net, lui, n'a pas été touché : « mixte » laissé tel quel ne change rien */
  if(v[0].net!=="GND"||v[3].net!=="VCC"||v[4].net!=="CLK")
    throw new Error("un champ laissé sur « mixte » ne doit rien écrire");
});
T("le champ laissé sur « mixte » ne touche à rien",()=>{
  const v=cinqVias();
  $("mpViaN").value=MP_MIX;
  $("mpViaN").onchange();
  if(v[0].net!=="GND"||v[3].net!=="VCC")throw new Error("« mixte » a écrasé les nets");
  /* renseigné, en revanche, il rattache toute la sélection */
  $("mpViaN").value="GND";
  $("mpViaN").onchange();
  if(!v.every(x=>x.net==="GND"))throw new Error("le net choisi devait s'appliquer aux cinq");
});
T("le groupe ouvert le reste après la modification qui l'a déplacé",()=>{
  const v=cinqVias();
  mpOuvert.vias=mpIdx["vias:0"].ancre;
  buildProps();
  const ancre=mpOuvert.vias;
  $("mpViaD").value="1.4";
  $("mpViaD").onchange();
  /* les cotes ont changé, donc la signature du groupe aussi : c'est l'objet
     d'ancrage qui doit le retrouver, pas son rang */
  if(mpIdx[Object.keys(mpIdx).find(k=>mpIdx[k].ouvert)].list.indexOf(ancre)<0)
    throw new Error("la ligne ouverte devait rester celle du groupe modifié");
  if(mpIdx[Object.keys(mpIdx).find(k=>mpIdx[k].ouvert)].list.length!==3)
    throw new Error("le groupe compte toujours ses trois vias");
});
T("empreintes sélectionnées : mêmes boîtier et valeur, une seule ligne",()=>{
  carte4c();
  S.fps=[mkFp("C1","100nF","0402",2),mkFp("C2","100nF","0402",2),
         mkFp("C3","100nF","0402",2),mkFp("R1","10k","0603",2)];
  S.fps.forEach((f,i)=>{f.x=5+i*4;f.y=20;});
  touch();
  clearSel();S.fps.forEach(f=>S.sel.fps.add(f.id));
  mpRaz();
  buildProps();
  const h=$("props").innerHTML;
  if(h.indexOf("Empreintes · 4")<0)throw new Error("la section doit annoncer les quatre");
  if(h.indexOf("×3")<0)throw new Error("les trois condensateurs devaient se grouper");
  if(h.indexOf("C1, C2, C3")<0)throw new Error("la ligne doit nommer ses repères");
  /* le repère et la position ne sont pas modifiables en groupe */
  if(h.indexOf('id="mpFpRef"')>=0||h.indexOf('id="mpFpX"')>=0)
    throw new Error("ni repère ni position en groupe");
  mpOuvert.fps=mpIdx["fps:0"].ancre;
  buildProps();
  $("mpFpRot").value="90";
  $("mpFpRot").onchange();
  const c=S.fps.filter(f=>f.value==="100nF");
  if(!c.every(f=>f.rot===90))throw new Error("les trois condensateurs devaient pivoter");
  if(S.fps.find(f=>f.ref==="R1").rot!==0)throw new Error("R1 n'est pas du groupe");
  $("mpFpVal").value="220nF";
  $("mpFpVal").onchange();
  if(!S.fps.filter(f=>f.rot===90).every(f=>f.value==="220nF"))
    throw new Error("la valeur devait suivre sur les trois");
});
T("une découpe seule a maintenant son panneau",()=>{
  carte4c();
  S.cuts=[{id:S.nextId++,l:0,pts:[{x:5,y:5},{x:9,y:5},{x:9,y:9}]}];
  clearSel();S.sel.cuts.add(S.cuts[0]);
  mpRaz();
  buildProps();
  const h=$("props").innerHTML;
  if(h.indexOf("Découpes · 1")<0)throw new Error("la découpe sélectionnée n'est plus « rien »");
  if(h.indexOf('id="mpCtL"')<0)throw new Error("sa couche doit être modifiable");
  S.cuts=[];clearSel();
});
T("sélection mêlée : une section par famille, et le cuivre se déroute à part",()=>{
  carte4c();
  S.fps=[mkFp("U1","","SOIC-8",8)];S.fps[0].x=20;S.fps[0].y=20;
  S.tracks=[{l:0,net:"GND",w:0.3,x1:2,y1:2,x2:9,y2:2}];
  S.vias=[{x:5,y:5,d:0.8,drill:0.4,a:0,b:3,net:"GND"}];
  S.zones=[{id:S.nextId++,l:0,net:"GND",pts:boardZonePts()}];
  touch();
  clearSel();
  S.sel.fps.add(S.fps[0].id);S.sel.tracks.add(S.tracks[0]);
  S.sel.vias.add(S.vias[0]);S.sel.zones.add(S.zones[0]);
  mpRaz();
  buildProps();
  const h=$("props").innerHTML;
  for(const t of ["Empreintes · 1","Segments · 1","Vias · 1","Zones · 1"])
    if(h.indexOf(t)<0)throw new Error("section manquante : "+t);
  if(h.indexOf("Dérouter 1 segment et 1 via")<0)
    throw new Error("le bouton de déroutage doit rester");
  /* un seul groupe par famille : pas de tableau à choisir */
  if(h.indexOf('data-mp=')>=0)throw new Error("une famille homogène n'a rien à choisir");
  $("mpTrW").value="0.5";
  $("mpTrW").onchange();
  if(Math.abs(S.tracks[0].w-0.5)>1e-9)throw new Error("la largeur devait s'appliquer");
});
T("panneau de groupes : ce qui vient du document reste échappé",()=>{
  carte4c();
  S.fps=[mkFp("R1",XSS,XSS,2),mkFp("R2",XSS,XSS,2)];
  S.fps.forEach((f,i)=>{f.x=5+i*4;f.y=20;});
  S.vias=[{x:5,y:5,d:0.8,drill:0.4,a:0,b:3,net:XSS},
          {x:9,y:5,d:0.6,drill:0.3,a:0,b:3,net:"GND"}];
  touch();
  clearSel();
  S.fps.forEach(f=>S.sel.fps.add(f.id));
  S.vias.forEach(v=>S.sel.vias.add(v));
  mpRaz();
  buildProps();
  assertPropre($("props").innerHTML,"panneau de groupes");
  assertPresent($("props").innerHTML,"panneau de groupes");
});

/* ==========================================================================
   Perçage : la portée dans le nom, et la nature qu'on choisit
   ========================================================================== */
T("perçage Excellon : les couches du nom se comptent à partir de 1",()=>{
  const save=serialize();
  S.fps=[];S.tracks=[];S.vias=[];S.zones=[];touch();
  setCuCount(4);
  S.board={x:0,y:0,w:40,h:30,pts:null};
  const cls=classOf(null);
  S.vias.push({x:10,y:10,d:cls.via,drill:cls.drill,net:null,a:0,b:3});
  S.vias.push({x:15,y:10,d:cls.via,drill:cls.drill,net:null,a:0,b:1});
  touch();
  const d=drillFile();
  const names=d.files.map(f=>f.name);
  /* Il n'existe pas de couche 0 : un dossier qui en annonce une se fait
     retourner au contrôle d'entrée. */
  if(names.some(n=>/-0-|-0\.TXT/.test(n)))
    throw new Error("couche 0 dans un nom de fichier : "+names.join(" "));
  const bl=d.files.find(f=>f.kind==="blind");
  if(!bl)throw new Error("le borgne manque");
  if(bl.name!=="carte-1-2.TXT")throw new Error("le borgne va de L1 à L2 : "+bl.name);
  if(bl.a!==0||bl.b!==1)throw new Error("la portée doit voyager avec le fichier");
  /* Trois .TXT dans une archive ne se distinguent pas sans légende. */
  const rm=buildFabFiles().files.find(f=>f.name==="LISEZ-MOI.txt").text;
  if(rm.indexOf("carte-1-2.TXT : percage borgne L1-L2")<0)
    throw new Error("le LISEZ-MOI devrait donner la portée de chaque fichier");
  if(rm.indexOf("carte-1-4.TXT : percage traversant L1-L4")<0)
    throw new Error("le traversant aussi");
  loadDoc(JSON.parse(save),true);setCuCount(2);touch();
});
/* La portée se lisait dans le nom du fichier, à coups d'expression régulière.
   Le nom commence par celui du projet : un chiffre dedans, et le master drawing
   annonçait n'importe quoi. Elle voyage maintenant avec le fichier. */
T("master drawing : la portée du perçage ne se relit pas dans le nom du projet",()=>{
  const save=serialize();
  S.fps=[];S.tracks=[];S.vias=[];S.zones=[];touch();
  setCuCount(4);
  S.board={x:0,y:0,w:40,h:30,pts:null};
  const cls=classOf(null);
  S.vias.push({x:10,y:10,d:cls.via,drill:cls.drill,net:null,a:0,b:1});
  touch();
  projOuvrir("carte 2");
  try{
    const files=buildFabFiles().files;
    const dr=files.filter(f=>/\.TXT$/.test(f.name));
    if(dr.length!==1)throw new Error("un seul perçage attendu, "+dr.length);
    if(dr[0].name!==fabBase()+"-1-2.TXT")throw new Error("nom du fichier : "+dr[0].name);
    const pdf=files.find(f=>/MASTER-DRAWING\.pdf$/i.test(f.name));
    const txt=Buffer.from(pdf.data).toString("latin1");
    if(txt.indexOf("copper layer 1 to 2")<0)
      throw new Error("le master drawing devrait annoncer la portée L1-L2");
  }finally{ projFermer(); }
  loadDoc(JSON.parse(save),true);setCuCount(2);touch();
});
T("type de via : la nature choisie pose la portée",()=>{
  carte4c();
  const v={x:10,y:10,d:0.8,drill:0.4,a:0,b:3,net:"GND"};
  S.vias=[v];touch();
  if(viaKindOf(v)!=="through")throw new Error("0-3 sur quatre couches : traversant");
  clearSel();S.sel.vias.add(v);buildProps();
  if($("props").innerHTML.indexOf('id="vK"')<0)
    throw new Error("le panneau d'un via doit offrir sa nature");
  $("vK").value="blindTop";$("vK").onchange();
  if(v.a!==0||v.b!==1)throw new Error("borgne dessus : L1-L2, obtenu "+v.a+"-"+v.b);
  if(viaKindOf(v)!=="blindTop")throw new Error("relu, c'est toujours un borgne dessus");
  $("vK").value="blindBot";$("vK").onchange();
  if(v.a!==2||v.b!==3)throw new Error("borgne dessous : L3-L4, obtenu "+v.a+"-"+v.b);
  $("vK").value="buried";$("vK").onchange();
  if(!(v.a>0&&v.b<S.cu-1))throw new Error("enterré : deux couches internes, "+v.a+"-"+v.b);
  $("vK").value="through";$("vK").onchange();
  if(v.a!==0||v.b!==S.cu-1)throw new Error("traversant : de bout en bout");
  /* chaque nature est un coup d'annulation */
  undo();
  if(viaKindOf(S.vias[0])!=="buried")throw new Error("Ctrl+Z devait rendre l'enterré");
});
T("le panneau d'un via dit ce qu'un seul pressage permet",()=>{
  carte4c();
  const v={x:10,y:10,d:0.8,drill:0.4,a:0,b:2,net:"GND"};   // borgne sur deux diélectriques
  S.vias=[v];touch();
  clearSel();S.sel.vias.add(v);buildProps();
  const h=$("props").innerHTML;
  if(h.indexOf("laminage séquentiel")<0)
    throw new Error("un borgne sur deux diélectriques demande un laminage séquentiel");
  if(h.indexOf("valider avec le fabricant")<0)
    throw new Error("et cela doit se voir, pas se découvrir sur le devis");
});
T("l'empilage ferme les natures qu'il ne permet pas",()=>{
  S.fps=[];S.tracks=[];S.vias=[];S.zones=[];clearSel();
  setCuCount(2);touch();
  const k2=viaKindsAvail().map(x=>x[0]);
  if(k2.length!==1||k2[0]!=="through")
    throw new Error("deux couches : le traversant est la seule nature, "+k2.join(" "));
  setCuCount(4);touch();
  const k4=viaKindsAvail().map(x=>x[0]);
  for(const k of ["through","blindTop","blindBot","buried"])
    if(k4.indexOf(k)<0)throw new Error("quatre couches : "+k+" devrait être offert");
});
T("Ctrl+clic sur plusieurs vias : la nature se change pour tout le groupe",()=>{
  carte4c();
  S.vias=[{x:5,y:5,d:0.8,drill:0.4,a:0,b:3,net:"GND"},
          {x:9,y:5,d:0.8,drill:0.4,a:0,b:3,net:"GND"},
          {x:13,y:5,d:0.6,drill:0.3,a:0,b:3,net:"VCC"}];
  touch();
  clearSel();S.vias.forEach(x=>S.sel.vias.add(x));
  mpRaz();buildProps();
  const h=$("props").innerHTML;
  if(h.indexOf('id="mpViaK"')<0)throw new Error("le groupe doit offrir la nature du via");
  if(h.indexOf("traversant")<0)throw new Error("la ligne doit dire ce que sont ces vias");
  $("mpViaK").value="blindTop";$("mpViaK").onchange();
  if(!S.vias.every(x=>x.a===0&&x.b===1))
    throw new Error("les trois vias devaient passer en borgne dessus");
  undo();
  if(!S.vias.every(x=>x.b===3))throw new Error("un seul coup d'annulation pour les trois");
  /* et le perçage qui en sort tient dans un fichier de portée L1-L2 */
  clearSel();S.vias.forEach(x=>S.sel.vias.add(x));
  mpRaz();buildProps();
  $("mpViaK").value="blindTop";$("mpViaK").onchange();
  const names=drillFile().files.map(f=>f.name);
  if(names.length!==1||names[0]!=="carte-1-2.TXT")
    throw new Error("le dossier devrait porter le seul borgne L1-L2 : "+names.join(" "));
});

/* ==========================================================================
   SIMULATION EM : LA MASSE COPLANAIRE
   --------------------------------------------------------------------------
   Trois hypothèses tacites sont tombées dans `19-simulation.js`, et ce sont
   elles qu'on éprouve ici — pas le solveur, qui a son propre banc
   (python/test/banc-ligne-mom.py) :

     · l'écart n'était mesuré QU'AU MILIEU de la piste ;
     · il était posé DES DEUX CÔTÉS, symétriquement ;
     · TOUT cuivre d'un autre net comptait comme masse.

   Chacune a son essai, plus un pour la découpe — que `zoneAt` ne voyait pas —
   et un pour la couture de vias. Ils partent tous de la même carte : un plan de
   masse ARROSÉ SUR LA COUCHE DE LA PISTE, ce qui est le cas ordinaire d'un
   tracé RF et le seul où la coplanaire existe.
   ========================================================================== */
/* La carte des essais : 4 couches, une piste droite de 40 mm sur Top, et rien
   d'autre. Chaque essai pose le cuivre latéral qu'il veut éprouver. */
const SIM_Y=20, SIM_X1=10, SIM_X2=50, SIM_W=0.4;
function simCarte(){
  carte4c();
  S.cuts=[];
  S.tracks.push({l:0, net:"N$1", w:SIM_W,
                 x1:SIM_X1, y1:SIM_Y, x2:SIM_X2, y2:SIM_Y});
  clearSel(); S.sel.tracks.add(S.tracks[S.tracks.length-1]);
  /* La proposition de masse se refait : `simRefSet` ne reprend la main que sur
     une AUTRE carte, et ici c'est toujours la même. */
  SIM.refCle=null; SIM.refAuto=true; SIM.ref=null;
  touch();
  return S.tracks[S.tracks.length-1];
}
/* Un rectangle de zone, sur la couche 0. */
function simZone(net,x1,y1,x2,y2){
  const z={id:S.nextId++, l:0, net:net,
           pts:[{x:x1,y:y1},{x:x2,y:y1},{x:x2,y:y2},{x:x1,y:y2}]};
  S.zones.push(z); touch();
  return z;
}
function simCoupe(x1,y1,x2,y2){
  S.cuts.push({id:S.nextId++, l:0,
               pts:[{x:x1,y:y1},{x:x2,y:y1},{x:x2,y:y2},{x:x1,y:y2}]});
  touch();
}

T("masse de référence : GND est proposée, un net de signal ne l'est pas",()=>{
  simCarte();
  simZone("GND",5,10,55,30);
  simZone("N$2",5,32,55,38);
  const c=simRefCandidats();
  const gnd=c.find(o=>o.net==="GND"), n2=c.find(o=>o.net==="N$2");
  if(!gnd)throw new Error("GND devrait être candidate : "+c.map(o=>o.net));
  if(!gnd.defaut)throw new Error("GND devrait être proposée d'office");
  if(!n2)throw new Error("N$2 porte du cuivre plein : elle doit être candidate");
  if(n2.defaut)throw new Error("un net de signal ne doit pas être proposé");
  /* Le plan de couche 1 (rôle « gnd ») est proposé lui aussi : c'est ce que
     « plan de référence » veut dire dans cet outil. */
  if(!simRefSet().has("GND"))throw new Error("l'ensemble retenu doit porter GND");
  if(simRefSet().has("N$2"))throw new Error("N$2 ne doit pas y être");
});

/* --------------------------------------------------------------------------
   LES COTES DU VIA PARTENT AVEC LA SÉLECTION
   --------------------------------------------------------------------------
   CE QUE LE SERVEUR FAISAIT SANS ELLES. `_cotes_via` l'écrivait en toutes
   lettres : « LES PAGES N'ENVOIENT PAS ENCORE LES VIAS ». Le modèle π L-C
   tournait donc sur 0,3 mm de perçage et 2,5 fois cela en pastille, alors que
   l'éditeur connaît les deux exactement — c'est lui qui perce l'Excellon.

   CE QUE CES CAS VERROUILLENT, et il en faut trois : que le via soit trouvé au
   raccord ; qu'il soit accroché au BON tronçon, celui que le serveur relit ;
   et qu'il ne soit PAS accroché quand rien ne le justifie, faute de quoi une
   rupture passerait pour une transition.
   -------------------------------------------------------------------------- */

/* Une liaison qui change de couche au milieu, et le via qui la réalise. */
function simCarteVia(drill,pad,a,b){
  carte4c();
  S.cuts=[]; S.vias=[];
  const xm=(SIM_X1+SIM_X2)/2;
  S.tracks.push({l:0, net:"N$1", w:SIM_W, x1:SIM_X1, y1:SIM_Y, x2:xm, y2:SIM_Y});
  S.tracks.push({l:3, net:"N$1", w:SIM_W, x1:xm, y1:SIM_Y, x2:SIM_X2, y2:SIM_Y});
  S.vias.push({x:xm, y:SIM_Y, d:pad, drill:drill,
               a:(a==null?0:a), b:(b==null?3:b), net:"N$1"});
  clearSel();
  S.sel.tracks.add(S.tracks[S.tracks.length-2]);
  S.sel.tracks.add(S.tracks[S.tracks.length-1]);
  SIM.refCle=null; SIM.refAuto=true; SIM.ref=null;
  touch();
  return xm;
}


/* --------------------------------------------------------------------------
   LA SÉLECTION EST RANGÉE EN PARCOURS
   --------------------------------------------------------------------------
   CE QUE L'ÉDITEUR FAISAIT. `simSegments` parcourait `S.tracks` dans l'ordre du
   DOCUMENT — l'ordre de création. Tant qu'on route une liaison d'un bout à
   l'autre en une fois, c'est le bon par accident ; ça cesse dès qu'on retouche.

   ET LE PRODUIT ABCD N'EST PAS COMMUTATIF : les mêmes tronçons dans un autre
   ordre donnent un autre S₁₁. Le serveur voyait la sélection rompue et le
   disait, mais dire « rangez-la » sans la ranger laisse le travail à la seule
   personne qui ne peut pas le faire.
   -------------------------------------------------------------------------- */

/* Trois tronçons colinéaires, POUSSÉS DANS LE DÉSORDRE — c'est ce que donne
   une piste retouchée : le segment redessiné passe en fin de liste. */
function simCarteDesordre(alEnvers){
  carte4c();
  S.cuts=[]; S.vias=[];
  const a=(SIM_X1+SIM_X2)/3, b=2*(SIM_X1+SIM_X2)/3;
  const droite=(x1,x2)=>({l:0, net:"N$1", w:SIM_W,
                          x1:x1, y1:SIM_Y, x2:x2, y2:SIM_Y});
  clearSel();
  /* ordre du document : premier, DERNIER, milieu */
  const t1=droite(SIM_X1,a);
  const t3=droite(b,SIM_X2);
  const t2=alEnvers?droite(b,a):droite(a,b);   /* le milieu, parfois à l'envers */
  for(const t of [t1,t3,t2]){S.tracks.push(t); S.sel.tracks.add(t);}
  SIM.refCle=null; SIM.refAuto=true; SIM.ref=null;
  touch();
  return {a:a, b:b};
}

T("la sélection part dans l'ordre du parcours, pas dans celui du document",()=>{
  const p=simCarteDesordre(false);
  const env=simSegments().envoi;
  if(env.length!==3)
    throw new Error("trois tronçons attendus, "+env.length);
  const xs=env.map(e=>[e.start[0],e.end[0]]);
  const attendu=[[SIM_X1,p.a],[p.a,p.b],[p.b,SIM_X2]];
  for(let i=0;i<3;i++)
    for(let k=0;k<2;k++)
      if(Math.abs(xs[i][k]-attendu[i][k])>1e-6)
        throw new Error("tronçon "+i+" : "+JSON.stringify(xs)+
                        " au lieu de "+JSON.stringify(attendu));
  /* ET LE PARCOURS EST CONTINU : chaque fin touche le début suivant. C'est
     exactement ce que `_ruptures` vérifie côté serveur, et le seul critère qui
     autorise la mise en cascade. */
  for(let i=1;i<3;i++)
    if(Math.abs(env[i-1].end[0]-env[i].start[0])>1e-6||
       Math.abs(env[i-1].end[1]-env[i].start[1])>1e-6)
      throw new Error("raccord manquant entre "+(i-1)+" et "+i);
});

T("une piste dessinée à l'envers est retournée, pas laissée telle quelle",()=>{
  /* LE CAS QUI FAIT LE PLUS DE DÉGÂTS. Une piste dont les points sont écrits
     dans l'autre sens ne casse pas seulement l'ordre : elle donne au serveur
     un coude de 168° — un demi-tour sur du cuivre parfaitement droit — et un
     raccord manquant de part et d'autre. Trois symptômes pour un défaut. */
  const p=simCarteDesordre(true);
  const env=simSegments().envoi;
  if(Math.abs(env[1].start[0]-p.a)>1e-6||Math.abs(env[1].end[0]-p.b)>1e-6)
    throw new Error("le tronçon du milieu part de "+env[1].start[0]+
                    " vers "+env[1].end[0]+" au lieu de "+p.a+"→"+p.b);
  for(let i=1;i<3;i++)
    if(Math.abs(env[i-1].end[0]-env[i].start[0])>1e-6)
      throw new Error("raccord manquant entre "+(i-1)+" et "+i);
});

T("le sens de dessin d'une piste ne change pas quel bord longe la masse",()=>{
  /* GAUCHE ET DROITE SE DÉFINISSENT PAR RAPPORT AU SENS DE MARCHE, et c'est
     tout l'objet de l'échange : le MÊME cuivre, avec la MÊME masse du MÊME
     côté, parcouru dans le MÊME sens, doit rendre les mêmes deux écarts —
     que la piste ait été dessinée dans un sens ou dans l'autre.

     `simEcartsA` mesure gauche et droite par rapport au sens propre de la
     piste (x1 → x2). Retourner la piste sans échanger ses écarts décrirait
     donc la section EN MIROIR. Ça ne change pas Z₀ — la géométrie est
     symétrique — mais la fiche mentirait sur quel bord longe quoi, et c'est
     cette fiche-là qu'on lit pour comprendre d'où viennent trois ohms. */
  const masse=()=>{simZone("GND",5,SIM_Y+1.2,55,SIM_Y+8); touch();};

  simCarteDesordre(false); masse();
  const droit=simSegments().envoi[1];
  if(!(droit.gap_left>0)||droit.gap_right>0)
    throw new Error("la carte d'essai n'est pas dissymétrique comme prévu : g="+
                    droit.gap_left+" d="+droit.gap_right);

  simCarteDesordre(true); masse();
  const envers=simSegments().envoi[1];
  if(Math.abs(envers.gap_left-droit.gap_left)>1e-6||
     Math.abs(envers.gap_right-droit.gap_right)>1e-6)
    throw new Error("la piste dessinée à l'envers décrit sa section en "+
                    "miroir : à l'endroit g="+droit.gap_left+" d="+
                    droit.gap_right+", à l'envers g="+envers.gap_left+
                    " d="+envers.gap_right);
});

T("la marche s'arrête à la dérivation, et le dit",()=>{
  /* ON NE TRANCHE PAS. Quatre tronçons sur un point : choisir une branche
     rendrait des paramètres S qui ont l'air justes en ignorant des moignons
     qui chargent réellement la ligne. On s'arrête, et on retient OÙ — de quoi
     le montrer sur la carte plutôt que de le décrire. */
  const xm=simCarteRamifiee();
  simSegments();
  if(!SIM_CHAINE_PCB.arrets.length)
    throw new Error("la dérivation n'a pas été retenue");
  const a=SIM_CHAINE_PCB.arrets[0];
  if(Math.abs(a.x-xm)>1e-6||Math.abs(a.y-SIM_Y)>1e-6)
    throw new Error("arrêt retenu en "+a.x+";"+a.y+" au lieu de "+xm+";"+SIM_Y);
  if(a.branches<3)
    throw new Error(a.branches+" branches comptées à la dérivation");
  /* LE REVERS : un parcours simple ne doit RIEN retenir, sans quoi la mention
     perdrait tout sens à force de s'afficher. */
  simCarteDesordre(false);
  simSegments();
  if(SIM_CHAINE_PCB.arrets.length)
    throw new Error("un parcours simple annonce une dérivation");
  if(SIM_CHAINE_PCB.orphelines)
    throw new Error("un parcours simple laisse "+SIM_CHAINE_PCB.orphelines+
                    " piste(s) hors chaîne");
});

/* Un net qui se RAMIFIE : trois pistes de couche extérieure aboutissent au
   même via, d'où une quatrième repart vers une couche interne. La sélection
   n'est plus un parcours, et c'est le cas ordinaire d'un bus. */
function simCarteRamifiee(){
  carte4c();
  S.cuts=[]; S.vias=[];
  const xm=(SIM_X1+SIM_X2)/2;
  const poser=(l,x1,y1)=>{
    S.tracks.push({l:l, net:"N$1", w:SIM_W, x1:x1, y1:y1, x2:xm, y2:SIM_Y});
    S.sel.tracks.add(S.tracks[S.tracks.length-1]);
  };
  clearSel();
  poser(0, SIM_X1, SIM_Y);
  poser(0, xm, SIM_Y-6);
  poser(0, xm, SIM_Y+6);
  poser(3, SIM_X2, SIM_Y);
  S.vias.push({x:xm, y:SIM_Y, d:0.55, drill:0.25, a:0, b:3, net:"N$1"});
  SIM.refCle=null; SIM.refAuto=true; SIM.ref=null;
  touch();
  return xm;
}

T("un net ramifié envoie son via hors de tout parcours",()=>{
  /* MÊME BESOIN QUE CÔTÉ VISIONNEUSE, ET IL FAUT QUE CE SOIT LA MÊME CHOSE.
     Quatre tronçons aboutissent au via, dont un seul sur une autre couche : il
     n'y a pas d'ordre dans lequel les enchaîner, donc la détection par
     tronçons CONSÉCUTIFS ne peut rien garantir. Le via part quand même, dans
     la liste que le serveur analyse sans ordre. */
  const xm=simCarteRamifiee();
  const g=simSegments();
  const v=g.vias||[];
  if(v.length!==1)
    throw new Error(v.length+" via(s) envoyé(s) hors chaîne au lieu de 1");
  if(Math.abs(v[0].x-xm)>1e-9||Math.abs(v[0].y-SIM_Y)>1e-9)
    throw new Error("le via est envoyé en "+v[0].x+";"+v[0].y);
  if(Math.abs(v[0].drill_diameter-0.25)>1e-9)
    throw new Error("perçage "+v[0].drill_diameter+" au lieu de 0,25");
  /* LA PORTÉE EST CONNUE ICI, contrairement à la visionneuse : l'éditeur perce
     l'Excellon, il sait entre quelles couches court le via. */
  if(v[0].layer_from!==0||v[0].layer_to!==6)
    throw new Error("portée "+v[0].layer_from+"→"+v[0].layer_to+
                    " au lieu de 0→6");
  if(!("retours" in v[0]))
    throw new Error("le via part sans ses vias de masse voisins");
  /* ET IL ATTEINT LE DOCUMENT. */
  const p=SIM_PCB.probleme(simSaisie());
  if(!p.doc.vias||p.doc.vias.length!==1)
    throw new Error("le document n'emporte pas les vias : "+
                    JSON.stringify(p.doc.vias));
});

T("un via borgne qui n'atteint pas le tronçon n'est pas un via de la liaison",()=>{
  /* LE REVERS. Un via posé au même endroit mais dont la portée ne couvre pas
     la couche du tronçon ne l'y raccorde pas — il passe dessous. Le compter
     rendrait une inductance de boucle pour une liaison qui n'existe pas. */
  simCarteRamifiee();
  S.vias[0].a=1; S.vias[0].b=2;      /* enterré : ne touche ni la 0 ni la 3 */
  touch();
  const g=simSegments();
  if((g.vias||[]).length)
    throw new Error("un via enterré hors portée a été envoyé comme via de la "+
                    "liaison");
});

T("le via du raccord part avec ses cotes, sur le bon tronçon",()=>{
  simCarteVia(0.25,0.55);
  const g=simSegments();
  if(g.envoi.length!==2)
    throw new Error("deux tronçons attendus, "+g.envoi.length);
  /* LE SERVEUR RANGE LA TRANSITION AU RANG DU SECOND TRONÇON : c'est
     `objets[trans["troncon"]]` qu'il relit, et `troncon` vaut l'indice du
     tronçon d'ARRIVÉE. Accrocher le via au premier serait invisible ici et
     silencieux là-bas. */
  if(g.envoi[0].via)
    throw new Error("le via ne doit pas être accroché au tronçon de départ");
  const v=g.envoi[1].via;
  if(!v)throw new Error("le via n'a pas été accroché au tronçon d'arrivée");
  if(Math.abs(v.drill_diameter-0.25)>1e-9)
    throw new Error("perçage "+v.drill_diameter+" au lieu de 0,25");
  if(Math.abs(v.pad_diameter-0.55)>1e-9)
    throw new Error("pastille "+v.pad_diameter+" au lieu de 0,55");
  /* LA HAUTEUR N'EST PAS ENVOYÉE, ET C'EST VOULU : le serveur la recalcule
     depuis l'empilage, par la même somme que `stackSpan`. Deux définitions de
     la même longueur, c'est deux chiffres le jour où l'une dérive. */
  if("height" in v)
    throw new Error("la hauteur ne doit pas être envoyée : le serveur la lit "+
                    "dans l'empilage");
});

T("pas de via au raccord : pas de cotes, mais le raccord part",()=>{
  /* CE QUE « PAS DE VIA RECONNU » VEUT DIRE, ET CE QUE ÇA NE VEUT PAS DIRE. Le
     changement de couche existe indépendamment du perçage qu'on sait nommer :
     ses deux tronçons se raccordent quelque part, et ce quelque part suffit à
     mesurer l'écart aux vias de masse. L'ancien contrat n'envoyait rien du
     tout, et le serveur en concluait « aucun via de masse ne referme la
     boucle » — une affirmation sur la carte là où on n'avait pas cherché. */
  simCarteVia(0.25,0.55);
  S.vias=[];                         /* la liaison change de couche sans via */
  touch();
  const g=simSegments();
  if(g.envoi.length!==2)throw new Error("deux tronçons attendus");
  const v=g.envoi[1].via;
  if(!v)throw new Error("le raccord doit partir même sans via reconnu");
  if(v.drill_diameter!==undefined||v.pad_diameter!==undefined)
    throw new Error("des cotes ont été inventées là où il n'y a pas de via");
  if(!Array.isArray(v.retours))
    throw new Error("les vias de masse voisins doivent être cherchés quand même");
});

T("un via qui ne couvre pas le saut ne donne pas ses cotes",()=>{
  /* Un via borgne 0→1 ne réalise pas une liaison 0→3. Reprendre son perçage
     donnerait un chiffre juste pour un via faux, ce qui est pire qu'un repli
     avoué. Le raccord, lui, part quand même. */
  simCarteVia(0.25,0.55,0,1);
  const v=simSegments().envoi[1].via;
  if(!v)throw new Error("le raccord doit partir");
  if(v.drill_diameter!==undefined)
    throw new Error("un via borgne 0→1 a été pris pour la liaison 0→3");
});

T("entre deux vias au même endroit, le plus court décrit la liaison",()=>{
  /* Deux vias au même endroit couvrent tous deux le saut : un traversant 0→3
     et un enterré 0→2. C'est le plus SPÉCIFIQUE qui décrit la liaison — un
     traversant retenu à la place d'un enterré donnerait une inductance presque
     double, et personne ne le verrait. */
  carte4c();
  S.cuts=[]; S.vias=[];
  const xm=(SIM_X1+SIM_X2)/2;
  S.tracks.push({l:0, net:"N$1", w:SIM_W, x1:SIM_X1, y1:SIM_Y, x2:xm, y2:SIM_Y});
  S.tracks.push({l:2, net:"N$1", w:SIM_W, x1:xm, y1:SIM_Y, x2:SIM_X2, y2:SIM_Y});
  S.vias.push({x:xm, y:SIM_Y, d:0.75, drill:0.30, a:0, b:3, net:"N$1"});
  S.vias.push({x:xm, y:SIM_Y, d:0.45, drill:0.15, a:0, b:2, net:"N$1"});
  clearSel();
  S.sel.tracks.add(S.tracks[S.tracks.length-2]);
  S.sel.tracks.add(S.tracks[S.tracks.length-1]);
  SIM.refCle=null; SIM.refAuto=true; SIM.ref=null;
  touch();
  const v=simSegments().envoi[1].via;
  if(!v)throw new Error("aucun via accroché alors que deux conviennent");
  if(Math.abs(v.drill_diameter-0.15)>1e-9)
    throw new Error("perçage "+v.drill_diameter+" : c'est le traversant qui a "+
                    "été retenu au lieu de l'enterré");
});

T("un via loin du raccord ne donne pas ses cotes",()=>{
  const xm=simCarteVia(0.25,0.55);
  S.vias=[{x:xm+1.0, y:SIM_Y, d:0.55, drill:0.25, a:0, b:3, net:"N$1"}];
  touch();
  const v=simSegments().envoi[1].via;
  if(v.drill_diameter!==undefined)
    throw new Error("un via à 1 mm du raccord a été pris pour le via du raccord");
  /* ET IL N'EST PAS NON PLUS UN VIA DE RETOUR : il est sur le net du signal. */
  if(v.retours.length)
    throw new Error("un via de signal a été envoyé comme retour");
});


/* --------------------------------------------------------------------------
   LE CHEMIN DE RETOUR DU COURANT, ET LE CHEVELU QUI LE MONTRE
   --------------------------------------------------------------------------
   CE QUI ÉTAIT FAUX. Un via était chiffré par une inductance PARTIELLE PROPRE :
   celle d'un conducteur seul, sans dire par où le courant revient. Deux cartes
   identiques à ceci près que l'une a son via de masse à 0,4 mm et l'autre à
   3 mm rendaient donc le même résultat — alors qu'elles diffèrent d'un facteur
   deux, et que le placement de ce via est justement la décision qu'on prend
   en routant.

   CE QUE CES CAS VERROUILLENT :
     · que la physique JS rende EXACTEMENT ce que rend `ligne_mom` en Python.
       C'est le seul essai qui tienne la duplication assumée : le chevelu doit
       répondre pendant qu'on déplace le via, donc sans serveur ;
     · que la référence qui change SANS être rejointe soit vue et nommée ;
     · que trois vias comptent pour trois, et pas pour le plus proche ;
     · que ce qui est envoyé au serveur porte tout cela.
   -------------------------------------------------------------------------- */

/* Une liaison TOP → BOT au milieu, l'empilage nommé, et de quoi poser des vias
   de masse autour. `netInterne` décide de tout : « GND » et le retour se
   referme, « PWR » et rien ne peut le refermer. */
function simCarteRetour(netInterne){
  carte4c();
  S.cuts=[]; S.vias=[];
  S.cuL[1].net="GND";
  S.cuL[2].net=netInterne||"PWR";
  const xm=(SIM_X1+SIM_X2)/2;
  S.tracks.push({l:0, net:"N$1", w:SIM_W, x1:SIM_X1, y1:SIM_Y, x2:xm, y2:SIM_Y});
  S.tracks.push({l:3, net:"N$1", w:SIM_W, x1:xm, y1:SIM_Y, x2:SIM_X2, y2:SIM_Y});
  S.vias.push({x:xm, y:SIM_Y, d:0.55, drill:0.25, a:0, b:3, net:"N$1"});
  clearSel();
  S.sel.tracks.add(S.tracks[S.tracks.length-2]);
  S.sel.tracks.add(S.tracks[S.tracks.length-1]);
  /* La masse de référence est fixée à la main : `simRefSet` proposerait AUSSI
     le plan d'alimentation — au radiofréquence c'en est un, via le découplage
     — et l'essai perdrait ce qu'il veut mesurer. */
  SIM.refCle=null; SIM.refAuto=false; SIM.ref=new Set(["GND"]);
  touch();
  return {x:xm, via:S.vias[0]};
}
function simPoserMasse(x,y,a,b,net){
  const v={x:x, y:y, d:0.55, drill:0.25,
           a:(a==null?0:a), b:(b==null?3:b), net:net||"GND"};
  S.vias.push(v); touch();
  return v;
}

T("la physique du chevelu rend ce que rend ligne_mom",()=>{
  /* LE SEUL ESSAI QUI TIENNE LA DUPLICATION. `simBoucleVias` refait en JS ce
     que `ligne_mom.inductance_boucle_vias` fait en Python — il le faut, un
     chevelu qui demande un aller-retour au serveur à chaque mouvement de
     souris n'est pas un chevelu. Les valeurs attendues viennent du banc
     Python, pas d'ici : `python/test/banc-ligne-mom.py`, mêmes géométries.
     Le jour où l'une des deux dérive, celui-ci tombe. */
  const h=1.54, sig={x:0, y:0, drill:0.25};
  const un=simBoucleVias(h, sig, [{x:0.6, y:0, drill:0.25}]);
  if(Math.abs(un.L*1e9-0.798207662)>1e-7)
    throw new Error("un retour à 0,6 mm : "+(un.L*1e9).toFixed(9)+
                    " nH au lieu de 0,798207662 (ligne_mom)");
  const trois=simBoucleVias(h, sig, [{x:0.5,y:0,drill:0.25},
                                     {x:-1.2,y:0,drill:0.25},
                                     {x:0,y:2.5,drill:0.25}]);
  if(Math.abs(trois.L*1e9-0.547383415)>1e-7)
    throw new Error("trois retours : "+(trois.L*1e9).toFixed(9)+
                    " nH au lieu de 0,547383415 (ligne_mom)");
  const att=[0.558882663,0.271646005,0.169471332];
  trois.parts.forEach((p,i)=>{
    if(Math.abs(p-att[i])>1e-7)
      throw new Error("part "+i+" : "+p.toFixed(9)+" au lieu de "+att[i]);
  });
  /* Et sans aucun retour, c'est la self partielle — le chiffre qui ne dépend
     pas du routage. */
  const seul=simBoucleVias(h, sig, []);
  if(!seul.seul||Math.abs(seul.L*1e9-0.703439422)>1e-7)
    throw new Error("sans retour : "+(seul.L*1e9).toFixed(9)+
                    " nH au lieu de 0,703439422");
});

T("rapprocher le via de masse fait baisser l'inductance, et ça se voit",()=>{
  const vus=[];
  for(const e of [0.4,0.6,1.0,2.0,3.0]){
    const c=simCarteRetour("GND");
    simPoserMasse(c.x+e, SIM_Y);
    vus.push(simVoisinageVia(c.via).L*1e9);
  }
  for(let i=1;i<vus.length;i++)
    if(!(vus[i]>vus[i-1]))
      throw new Error("l'inductance ne croît pas avec l'écartement : "+vus);
  /* L'AMPLEUR COMPTE AUTANT QUE LE SENS : si le chiffre bougeait de un pour
     cent, la question « faut-il le rapprocher ? » n'aurait pas de réponse. */
  if(!(vus[4]>1.9*vus[0]))
    throw new Error("0,4 mm contre 3 mm ne double pas l'inductance : "+
                    vus[0].toFixed(3)+" puis "+vus[4].toFixed(3));
});

T("une référence qui change écarte le via de masse, en disant pourquoi",()=>{
  /* LE DÉFAUT GRAVE, ET IL EST INVISIBLE SUR LE DESSIN. Sur TOP/GND/PWR/BOT,
     le retour doit passer de GND à PWR — et aucun via de masse ne sait faire
     cela : il joindrait de la masse à de la masse. Le via est là, bien placé,
     et il ne sert à rien. */
  const c=simCarteRetour("PWR");
  simPoserMasse(c.x+0.6, SIM_Y);
  const g=simVoisinageVia(c.via);
  if(!g.change)throw new Error("le changement de référence n'est pas vu");
  if(g.retenus.length)
    throw new Error("un via de masse a été cru capable de joindre GND à PWR");
  if(!g.seul)throw new Error("l'inductance devrait être celle d'un conducteur seul");
  if(!/ne rejoint pas/.test(g.voisins[0].raison))
    throw new Error("la raison ne nomme pas le plan non rejoint : « "+
                    g.voisins[0].raison+" »");

  /* LA MÊME CARTE, UN SEUL NET CHANGÉ : la boucle se referme. Le chiffre ne
     BAISSE pas pour autant — sans retour on affichait la self partielle, qui
     est un PLANCHER, et une boucle réelle vaut forcément davantage. Ce qui
     change, c'est que le chiffre dépend désormais du routage. */
  const c2=simCarteRetour("GND");
  simPoserMasse(c2.x+0.6, SIM_Y);
  const g2=simVoisinageVia(c2.via);
  if(g2.retenus.length!==1)throw new Error("le via n'a pas été retenu");
  if(g2.seul)throw new Error("la boucle n'est pas comptée comme refermée");
  if(!(g2.L>g.L))
    throw new Error("la boucle refermée passe SOUS le plancher : "+
                    (g2.L*1e9).toFixed(3)+" contre "+(g.L*1e9).toFixed(3));
});

T("trois vias de masse comptent pour trois, et disent lequel travaille",()=>{
  const c=simCarteRetour("GND");
  simPoserMasse(c.x+0.5, SIM_Y);
  simPoserMasse(c.x-1.2, SIM_Y);
  simPoserMasse(c.x, SIM_Y+2.5);
  const g=simVoisinageVia(c.via);
  if(g.retenus.length!==3)throw new Error("les trois n'ont pas été retenus");
  const somme=g.retenus.reduce((s,f)=>s+f.part,0);
  if(Math.abs(somme-1)>1e-9)
    throw new Error("les parts ne somment pas à un : "+somme);
  /* LE PLUS PROCHE PORTE LE PLUS, mais pas tout — et c'est le point : trois
     vias serrés ne divisent PAS l'inductance par trois, leur mutuelle les en
     empêche. */
  const tri=g.retenus.slice().sort((a,b)=>a.distance-b.distance);
  if(!(tri[0].part>tri[2].part))
    throw new Error("le plus proche ne porte pas la plus grosse part");
  const c1=simCarteRetour("GND");
  simPoserMasse(c1.x+0.5, SIM_Y);
  const seul=simVoisinageVia(c1.via).L;
  if(!(g.L<seul))throw new Error("trois retours ne valent pas mieux qu'un");
  if(!(g.L>seul/3))
    throw new Error("trois retours ont divisé l'inductance par trois ou plus :"+
                    " la mutuelle entre eux n'est pas comptée");
});

T("un via borgne est écarté en le disant, un via d'un autre net est ignoré",()=>{
  /* LES DEUX N'ONT PAS LE MÊME STATUT, et c'est tout le sujet. Un via de MASSE
     qui ne couvre pas la portée AURAIT PU refermer la boucle : il est listé,
     en rouge, avec sa raison — c'est une information de routage. Un via de
     SIGNAL n'est pas un candidat, il est hors sujet : le lister mettrait un
     trait rouge par via voisin sur une carte dense, et noierait les seuls qui
     comptent. */
  const c=simCarteRetour("GND");
  simPoserMasse(c.x+0.5, SIM_Y, 0, 1);         /* borgne : ne couvre pas 0→3 */
  simPoserMasse(c.x+0.7, SIM_Y, 0, 3, "D+");   /* pas une référence          */
  const g=simVoisinageVia(c.via);
  if(g.retenus.length)throw new Error("un via inutilisable a été retenu");
  if(g.voisins.length!==1)
    throw new Error("seul le via de masse borgne doit être listé, "+
                    g.voisins.length+" le sont");
  if(!/ne couvre pas/.test(g.voisins[0].raison))
    throw new Error("le borgne n'est pas écarté pour sa portée : « "+
                    g.voisins[0].raison+" »");
});

T("le chevelu ne s'ouvre que sur un via de signal sélectionné",()=>{
  const c=simCarteRetour("GND");
  const m=simPoserMasse(c.x+0.6, SIM_Y);
  SIM.ouvert=true; SIM.analyse="retour";
  clearSel();
  if(simChevelu().length)throw new Error("chevelu sans via sélectionné");
  S.sel.vias.add(m);
  if(simChevelu().length)
    throw new Error("un via de MASSE a ouvert un chevelu : il n'a pas de "+
                    "boucle à lui, il EST le retour de quelqu'un d'autre");
  clearSel(); S.sel.vias.add(c.via);
  if(simChevelu().length!==1)throw new Error("le via de signal n'ouvre rien");
  SIM.analyse="dc";
  if(simChevelu().length)throw new Error("le chevelu survit à l'onglet DC");
  /* ET IL NE SURVIT PAS DAVANTAGE À L'ONGLET IMPÉDANCE, d'où il vient. Le
     chevelu y montrait un défaut dont la fiche d'à côté ne parlait pas ; il
     est maintenant le sujet de « Current Return Path », et l'y laisser
     paraître aussi rendrait le déménagement sans effet. */
  SIM.analyse="impedance";
  if(simChevelu().length)
    throw new Error("le chevelu paraît encore sous l'onglet Impédance");
  SIM.analyse="retour"; SIM.ouvert=false;
  if(simChevelu().length)throw new Error("le chevelu survit au panneau fermé");
  SIM.ouvert=false; SIM.analyse="";
});

T("le via envoyé porte sa position, son antipad et ses retours",()=>{
  const c=simCarteRetour("GND");
  simPoserMasse(c.x+0.6, SIM_Y);
  const g=simSegments();
  const v=g.envoi[1].via;
  if(!v)throw new Error("aucun via accroché");
  /* LA POSITION DÉBLOQUE TOUT LE RESTE : sans elle le serveur ne peut pas
     mesurer l'écart aux vias de masse. */
  if(Math.abs(v.x-c.x)>1e-6||Math.abs(v.y-SIM_Y)>1e-6)
    throw new Error("la position du via n'est pas envoyée");
  if(!v.retours||v.retours.length!==1)
    throw new Error("les vias de masse voisins ne sont pas envoyés");
  const r=v.retours[0];
  if(r.layer_from!==0||r.layer_to!==6)
    throw new Error("la portée du retour est envoyée en couches de CUIVRE au "+
                    "lieu d'indices d'EMPILAGE : "+r.layer_from+"→"+r.layer_to);
  if(r.net!=="GND")throw new Error("le net du retour manque");
  /* L'ANTIPAD EST CELUI DU GERBER, pas une estimation : `04-fabrication.js`
     écrit `v.d + 2*clrK(...)`, et c'est la même formule. */
  const att=r3(0.55+2*clrK(S.cuL[1].net,"N$1","cu","via"));
  if(Math.abs(v.antipad_diameter-att)>1e-6)
    throw new Error("antipad "+v.antipad_diameter+" au lieu de "+att);
  /* ET TOUJOURS PAS LA HAUTEUR : le serveur la lit dans l'empilage. */
  if("height" in v)throw new Error("la hauteur ne doit pas être envoyée");
});

T("un via de masse hors de portée n'est ni retenu ni envoyé",()=>{
  const c=simCarteRetour("GND");
  simPoserMasse(c.x+4.0, SIM_Y);      /* au-delà des 3 mm du rayon */
  const g=simVoisinageVia(c.via);
  if(g.voisins.length)
    throw new Error("un via à 4 mm a été ramassé");
  if(!g.seul)throw new Error("sans retour à portée, ce n'est pas une boucle");
  const env=simSegments().envoi[1].via;
  if(env.retours.length)throw new Error("un via hors de portée a été envoyé");
});


/* --------------------------------------------------------------------------
   LE DÉFAUT, LE DOUTE, ET CE QUI LES SÉPARE
   --------------------------------------------------------------------------
   CE QUI A ÉTÉ FAUX, ET QUI CRIAIT SUR LES CARTES SAINES. Deux plans de NOMS
   différents ne sont pas deux plans de NETS différents. Sur une carte quatre
   couches, une piste sur TOP se réfère au plan interne du haut et la même
   piste sur BOT à celui du bas : les noms diffèrent TOUJOURS. La première
   version en concluait « aucun via de masse ne joint les deux » — y compris
   quand les deux plans sont de la masse et qu'un via de masse les joint
   parfaitement, ce qui est le cas ordinaire.

   TROIS ÉTATS, DONC, ET LE TROISIÈME EST LE DOUTE : sans le net des plans, on
   ne peut PAS trancher, et le dire vaut mieux que de choisir.
   -------------------------------------------------------------------------- */

T("le chevelu distingue le défaut, le doute et le cas ordinaire",()=>{
  /* 1. Deux plans de MASSE : le plan change, ce n'est pas grave, et le via de
        masse referme la boucle. */
  const a=simCarteRetour("GND");
  simPoserMasse(a.x+0.6, SIM_Y);
  const ga=simVoisinageVia(a.via);
  if(!ga.planChange)throw new Error("le plan change bel et bien");
  if(ga.netsDiff!==false)
    throw new Error("deux plans de net GND ne sont pas de nets différents");
  if(ga.change||ga.doute)
    throw new Error("le défaut a été levé sur deux plans de masse");
  if(ga.retenus.length!==1)throw new Error("le via de masse devrait servir");

  /* 2. Un plan de MASSE et un d'ALIMENTATION : rien ne peut refermer. */
  const b=simCarteRetour("PWR");
  simPoserMasse(b.x+0.6, SIM_Y);
  const gb=simVoisinageVia(b.via);
  if(gb.netsDiff!==true)throw new Error("GND et PWR sont bien deux nets");
  if(!gb.change)throw new Error("le défaut grave n'est pas vu");
  if(gb.retenus.length)throw new Error("un via de masse a joint GND à PWR");

  /* 3. Les mêmes plans, sans net déclaré : on ne peut pas trancher. */
  const c=simCarteRetour("GND");
  S.cuL[1].net=""; S.cuL[2].net="";
  touch();
  simPoserMasse(c.x+0.6, SIM_Y);
  const gc=simVoisinageVia(c.via);
  if(gc.netsDiff!==null)
    throw new Error("sans net déclaré, on ne peut conclure ni oui ni non");
  if(gc.change)throw new Error("le défaut grave exige la certitude");
  if(!gc.doute)throw new Error("le doute n'est pas signalé");
});

T("les découplages qui joignent les deux plans partent avec le via",()=>{
  /* SANS EUX, LE COÛT DU RETOUR EST INCHIFFRABLE. Deux plans de nets
     différents ne sont joints que par ce qui les joint volontairement : un
     condensateur de découplage. C'est lui qui porte le retour, et sa distance
     qui en fixe le prix. */
  const v=simCarteRetour("PWR");
  const C=mkFp("C1","","",2);
  C.style="row"; C.pitch=0.8; C.x=v.x+2.0; C.y=SIM_Y;
  C.nets={1:"GND", 2:"PWR"};
  /* Un composant à VINGT pattes qui touche les deux nets est un régulateur :
     il ne joint rien en alternatif, et le compter inventerait un chemin de
     retour. Le filtre est le nombre de bornes. */
  const U=mkFp("U1","","",20);
  U.style="row"; U.pitch=0.5; U.x=v.x+1.0; U.y=SIM_Y+1.0;
  U.nets={1:"GND", 2:"PWR"};
  S.fps.push(C,U); touch();

  const env=simSegments().envoi[1].via;
  if(!env.ponts)throw new Error("les ponts ne sont pas envoyés");
  if(env.ponts.length!==1)
    throw new Error("un seul pont attendu — le régulateur n'en est pas un — "+
                    env.ponts.length+" envoyé(s)");
  if(env.ponts[0].repere!=="C1")
    throw new Error("le mauvais composant a été pris : "+env.ponts[0].repere);
  if(!(env.ponts_rayon_mm>0))
    throw new Error("le rayon de recherche doit partir : sans lui, « aucun "+
                    "pont » ne veut rien dire");
});

T("entre deux plans de masse, aucun pont n'est envoyé",()=>{
  /* IL N'Y A RIEN À TRAVERSER : le retour passe par le premier via de masse
     venu, ce dont la boucle rend déjà compte. Envoyer des ponts ferait
     compter deux fois le même chemin. */
  const v=simCarteRetour("GND");
  const C=mkFp("C1","","",2);
  C.style="row"; C.pitch=0.8; C.x=v.x+2.0; C.y=SIM_Y;
  C.nets={1:"GND", 2:"GND"};
  S.fps.push(C); touch();
  const env=simSegments().envoi[1].via;
  if(env.ponts)
    throw new Error("des ponts ont été envoyés entre deux plans de masse");
});

T("la portée percée du via part, c'est elle qui donne le moignon",()=>{
  /* LE MOIGNON SE SOUSTRAIT : ce qui est percé moins ce qui est emprunté.
     Sans la portée, un via traversant et un via enterré bien ajusté ont
     exactement la même apparence, et conclure « pas de moignon » serait
     retenir le cas le plus flatteur par défaut. */
  const v=simCarteRetour("GND");
  const env=simSegments().envoi[1].via;
  if(env.layer_from!==0||env.layer_to!==6)
    throw new Error("la portée percée n'est pas envoyée en indices "+
                    "d'EMPILAGE : "+env.layer_from+"→"+env.layer_to);
});

/* --------------------------------------------------------------------------
   LA FICHE DIT CE QUI A ÉTÉ CASCADÉ
   --------------------------------------------------------------------------
   CE QUI MANQUAIT, ET QUI NE SE VOYAIT PAS. Le serveur cascade les coudes et
   les vias depuis le lot 3b — la courbe S les porte —, mais `discontinuites`
   arrivait dans le résultat et n'était lu NULLE PART. Devant un |S₂₁| qui
   plonge, personne ne pouvait savoir si un via y était compté ; devant une
   liaison qui change de couche, personne ne pouvait vérifier qu'il avait
   seulement été vu.

   ON ÉPROUVE LES TROIS ÉTATS, parce qu'ils disent trois choses différentes :
   rien à signaler, quelque chose de chiffré, et quelque chose de SUPPOSÉ.
   -------------------------------------------------------------------------- */

function simResDisc(disc,troncons){
  return {ligne:{troncons:troncons==null?2:troncons}, discontinuites:disc};
}

/* LA FICHE DU CHEMIN DE RETOUR, sur le meme resultat que la fiche des
   discontinuites.

   POURQUOI CE HELPER EXISTE. Le chemin de retour se lisait sous l'onglet
   « Impedance », en marge d'un tableau qui parle d'autre chose : une colonne,
   quelques notes en bas de page. Il a desormais son propre onglet — « Current
   Return Path » —, et c'est LUI qu'il faut interroger. Les cas ci-dessous
   n'ont pas change d'un mot : ils posaient deja les bonnes questions, ils les
   posaient au mauvais endroit.

   `simFicheRetour` lit `SIM.res` et non un argument : on le pose, on le rend. */
function simFicheRet(res){
  const garde=[SIM.res, SIM.portee];
  try{
    SIM.res=Object.assign({reference_nets:["GND"], f_centre:1e9, duree:0.05},
                          res);
    SIM.portee="essai";
    return simFicheRetour();
  }finally{[SIM.res, SIM.portee]=garde;}
}

T("la fiche nomme ce qui a été cascadé, et ce qu'il pèse",()=>{
  const h=simDiscontinuites(simResDisc({
    coudes:[{troncon:1, angle_deg:90,
             modelise:{inductance_pH:120, capacite_fF:21.3, phase_deg:0.42}}],
    transitions:[{troncon:3, nom_depart:"TOP", nom_arrivee:"BOT",
                  cotes_supposees:false,
                  cotes:{hauteur_mm:1.34, hauteur_source:"empilage",
                         percage_mm:0.25, percage_source:"page",
                         pastille_mm:0.55, pastille_source:"page"},
                  modelise:{inductance_nH:1.041, capacite_fF:9.81,
                            phase_deg:1.55}}]
  },4));
  if(!/1 coude, 1 via/.test(h))
    throw new Error("le décompte n'est pas annoncé : "+h.slice(0,200));
  if(!/TOP → BOT/.test(h))throw new Error("les couches du via ne sont pas dites");
  if(!/1,041 nH/.test(h))throw new Error("l'inductance du via n'est pas affichée");
  if(!/1,55°/.test(h))throw new Error("la phase du via n'est pas affichée");
  if(!/1,340 mm/.test(h))throw new Error("la hauteur du via n'est pas affichée");
  /* Les cotes viennent de la page : rien ne doit être annoncé comme supposé. */
  if(/valeurs par défaut/.test(h))
    throw new Error("les cotes viennent de la page et sont dites supposées");
});

T("un chiffre supposé est affiché comme supposé",()=>{
  const h=simDiscontinuites(simResDisc({
    coudes:[],
    transitions:[{troncon:1, nom_depart:"TOP", nom_arrivee:"BOT",
                  cotes_supposees:true,
                  cotes:{hauteur_mm:1.34, hauteur_source:"empilage",
                         percage_mm:0.30, percage_source:"repli",
                         pastille_mm:0.75, pastille_source:"repli"},
                  modelise:{inductance_nH:1.041, capacite_fF:9.81,
                            phase_deg:1.55}}]
  }));
  if(!/valeurs par défaut/.test(h))
    throw new Error("le repli n'est pas signalé");
  if(!/perçage 0,30 mm/.test(h))throw new Error("le perçage supposé n'est pas nommé");
  if(!/pastille 0,75 mm/.test(h))throw new Error("la pastille supposée n'est pas nommée");
  /* LA HAUTEUR, ELLE, N'EST PAS SUPPOSÉE, et il faut que ça se lise : la dire
     supposée avec le reste ferait douter d'un chiffre exact. */
  if(!/n'est pas supposée/.test(h))
    throw new Error("la fiche ne dit pas que la hauteur, elle, est exacte");
});

T("sans discontinuité, la fiche le dit — mais seulement s'il y a de quoi",()=>{
  /* Plusieurs tronçons et rien entre eux : c'est une information. */
  const h=simDiscontinuites(simResDisc({coudes:[],transitions:[]},3));
  if(!/Aucune discontinuité/.test(h))
    throw new Error("le silence n'est pas expliqué");
  /* Un seul tronçon : il n'y a pas d'« entre », donc rien à dire. */
  const h1=simDiscontinuites(simResDisc({coudes:[],transitions:[]},1));
  if(h1!=="")throw new Error("une liaison d'un seul tronçon n'a pas d'entre-deux");
});

T("une discontinuité qui ne pèse rien est marquée comme telle",()=>{
  const h=simDiscontinuites(simResDisc({
    coudes:[{troncon:1, angle_deg:5,
             modelise:{inductance_pH:7, capacite_fF:1.2, phase_deg:0.02}}],
    transitions:[]
  }));
  if(!/z0ok/.test(h))
    throw new Error("une phase sous le dixième de degré devrait être marquée");
});

/* --------------------------------------------------------------------------
   LA FICHE DIT AUSSI PAR OÙ LE COURANT REVIENT
   --------------------------------------------------------------------------
   POURQUOI UNE COLONNE ENTIÈRE. « 1,29 nH » ne dit pas d'où le chiffre sort.
   Il peut décrire une boucle mesurée sur le routage — et alors le rapprocher
   fera baisser — ou la self d'un conducteur seul, qui ne bougera jamais quoi
   qu'on route. Le même nombre, deux significations opposées, dans un tableau
   dont tout l'objet est de juger le routage.

   ET UN AVERTISSEMENT QUI NE CRIE PAS SUR LE CAS ORDINAIRE. Une référence qui
   change ET qu'un via rejoint est banal ; une référence qui change sans que
   rien ne la rejoigne est le défaut grave. Les confondre sous un seul drapeau
   ferait cesser de le lire — et emporterait avec lui celui qui comptait.
   -------------------------------------------------------------------------- */

function simTransRetour(retour,cotes){
  return {troncon:1, nom_depart:"TOP", nom_arrivee:"BOT",
          cotes_supposees:false,
          cotes:Object.assign({hauteur_mm:1.34, hauteur_source:"empilage",
                               percage_mm:0.25, percage_source:"page",
                               pastille_mm:0.55, pastille_source:"page",
                               antipad_mm:0.80, antipad_source:"page"},
                              cotes||{}),
          modelise:{inductance_nH:0.7982, capacite_fF:86.8, phase_deg:1.20,
                    inductance_source:retour&&retour.raccorde?"boucle":"self"},
          capacite:{totale_fF:86.8, antipad_fF:14.4,
                    pastille_depart_fF:36.2, pastille_arrivee_fF:36.2,
                    plans_traverses:["GND","PWR"]},
          retour:retour};
}

T("la fiche dit combien de vias referment la boucle, et à quelle distance",()=>{
  const h=simFicheRet(simResDisc({coudes:[], transitions:[
    simTransRetour({plans_depart:["GND"], plans_arrivee:["IN2"],
                    nets_depart:["GND"], nets_arrivee:["GND"],
                    plan_change:true, nets_differents:false,
                    reference_change:false, raccorde:true, retenus:2,
                    trouves:2, source:"boucle",
                    vias:[{distance_mm:0.60, part:0.62, retenu:true, net:"GND"},
                          {distance_mm:1.40, part:0.38, retenu:true, net:"GND"}]})
  ]}));
  if(!/Retour/.test(h))throw new Error("la colonne « Retour » manque");
  if(!/2 vias/.test(h))throw new Error("le nombre de retours n'est pas dit");
  if(!/0,60 mm/.test(h))
    throw new Error("la distance du plus proche n'est pas dite : "+h);
  /* LA RÉFÉRENCE CHANGE ET ELLE EST REJOINTE : pas d'alerte. */
  if(/simAlerte/.test(h))
    throw new Error("l'alerte grave crie sur une liaison saine");
  /* LA RÉPARTITION EST DITE : c'est elle qui désigne le via qui ne sert à rien. */
  if(!/62 %/.test(h)||!/38 %/.test(h))
    throw new Error("le partage du courant n'est pas montré");
  /* ET L'ANTIPAD EST ENTRÉ DANS LES COTES — mais dans LE TABLEAU DES
     DISCONTINUITÉS, et plus dans cette fiche-ci. C'est une cote du via, elle
     entre dans sa capacité, et sa place est sous le chiffre qu'elle explique.
     Le chemin de retour n'en dit rien : il parle de ce qui referme la boucle. */
  const hd=simDiscontinuites(simResDisc({coudes:[], transitions:[
    simTransRetour({plans_depart:["GND"], plans_arrivee:["IN2"],
                    nets_depart:["GND"], nets_arrivee:["GND"],
                    plan_change:true, nets_differents:false,
                    reference_change:false, raccorde:true, retenus:2,
                    trouves:2, source:"boucle",
                    vias:[{distance_mm:0.60, part:0.62, retenu:true, net:"GND"},
                          {distance_mm:1.40, part:0.38, retenu:true, net:"GND"}]})
  ]}));
  if(!/anti. 0,80/.test(hd))throw new Error("l'antipad n'est pas affiché");
  /* ET IL N'EST PLUS DANS LA FICHE DU RETOUR : une cote montrée aux deux
     endroits redevient une colonne en marge, ce qu'on vient de défaire. */
  if(/anti. 0,80/.test(h))
    throw new Error("l'antipad reparaît dans la fiche du chemin de retour");
});

T("une référence qui change sans être rejointe lève l'alerte",()=>{
  const h=simFicheRet(simResDisc({coudes:[], transitions:[
    simTransRetour({plans_depart:["GND"], plans_arrivee:["PWR"],
                    nets_depart:["GND"], nets_arrivee:["PWR"],
                    plan_change:true, nets_differents:true,
                    reference_change:true, raccorde:false, retenus:0,
                    trouves:1, source:"self",
                    vias:[{distance_mm:0.60, part:0, retenu:false, net:"GND",
                           raison:"ne rejoint pas PWR, le plan d'arrivée"}]})
  ]}));
  if(!/simAlerte/.test(h))
    throw new Error("le défaut grave ne lève pas d'alerte");
  if(!/GND/.test(h)||!/PWR/.test(h))
    throw new Error("l'alerte ne nomme pas les deux plans");
  /* CE QU'ELLE DOIT DIRE, ET QU'AUCUNE AUTRE NOTE NE DIT : que la réponse
     n'est pas un via de plus. */
  if(!/masse à de la masse/.test(h))
    throw new Error("l'alerte ne dit pas qu'un via de masse n'y peut rien");
  /* Et la cellule porte le verdict, pas un compte. */
  if(!/⚠/.test(h))throw new Error("la cellule ne porte pas le verdict");
});

T("sans retour, la fiche annonce un plancher et non une mesure",()=>{
  const h=simFicheRet(simResDisc({coudes:[], transitions:[
    simTransRetour({plans_depart:["GND"], plans_arrivee:["GND"],
                    plan_change:false, nets_differents:false,
                    reference_change:false, raccorde:false, retenus:0,
                    trouves:0, source:"self", vias:[]})
  ]}));
  if(!/plancher/.test(h))
    throw new Error("le chiffre sans retour n'est pas annoncé comme un plancher");
  if(!/ne dépend pas du routage/.test(h))
    throw new Error("la fiche ne dit pas que le chiffre ignore le routage");
  if(/simAlerte/.test(h))
    throw new Error("l'alerte grave sort alors que la référence ne change pas");
});

T("une page muette et une carte sans via ne se confondent pas",()=>{
  /* L'ABSENCE D'INFORMATION N'EST PAS UN DÉFAUT DE LA CARTE. Les deux donnent
     la même inductance ; dans un cas c'est le routage qu'on juge, dans l'autre
     l'outil. */
  const muet=simFicheRet(simResDisc({coudes:[], transitions:[
    simTransRetour({plans_depart:["GND"], plans_arrivee:["GND"],
                    plan_change:false, nets_differents:false,
                    reference_change:false, raccorde:false, retenus:0,
                    trouves:0, source:"absent", vias:[]})
  ]}));
  if(!/ne sont pas envoyés par/.test(muet))
    throw new Error("le silence de la page n'est pas distingué");
  if(!/non envoyé/.test(muet))
    throw new Error("la cellule ne distingue pas « non envoyé » de « aucun »");
});

T("la fiche montre le moignon, sa résonance et ce qu'il pèse",()=>{
  /* LE MOIGNON EST UNE COTE DU VIA — celle qu'on ne voit pas sur le dessin.
     Un via traversant utilisé jusqu'à une couche interne laisse pendre le
     reste du perçage : il charge la liaison sous sa résonance, et la
     COURT-CIRCUITE à sa résonance quart d'onde. C'est le seul défaut de cette
     fiche qui efface un lien au lieu de le dégrader. */
  const t=simTransRetour({plans_depart:["GND"], plans_arrivee:["GND"],
                          plan_change:false, nets_differents:false,
                          reference_change:false, raccorde:true, retenus:1,
                          trouves:1, source:"boucle",
                          vias:[{distance_mm:0.6, part:1, retenu:true,
                                 net:"GND"}]});
  t.moignons={connu:true, depart:null,
              arrivee:{longueur_mm:0.620, er:4.3, resonance_hz:58.3e9,
                       capacite_fF:127.7, impedance_ohm:415,
                       couches:[4,8]}};
  t.modelise.capacite_totale_fF=200.5;
  const h=simDiscontinuites(simResDisc({coudes:[], transitions:[t]}));
  if(!/moignon 0,620 mm/.test(h))
    throw new Error("la longueur du moignon n'est pas affichée");
  if(!/58,3 GHz/.test(h))
    throw new Error("la résonance n'est pas affichée : c'est LE chiffre qui "+
                    "dit s'il faut s'en soucier");
  if(!/court-circuite/.test(h))
    throw new Error("la fiche ne dit pas ce qui se passe à la résonance");
  /* LA CAPACITÉ AFFICHÉE EST CELLE QUI EST CASCADÉE — via PLUS moignons —,
     sans quoi la colonne C et la colonne Phase ne parleraient pas de la même
     chose. */
  if(!/200,50 fF/.test(h))
    throw new Error("la colonne C montre le via seul, pas ce qui est cascadé");
});

T("une portée percée inconnue ne s'affiche pas comme un moignon nul",()=>{
  const t=simTransRetour({plans_depart:["GND"], plans_arrivee:["GND"],
                          plan_change:false, nets_differents:false,
                          reference_change:false, raccorde:false, retenus:0,
                          trouves:0, source:"self", vias:[]});
  t.moignons={connu:false, depart:null, arrivee:null};
  const h=simDiscontinuites(simResDisc({coudes:[], transitions:[t]}));
  if(!/moignon inconnu/.test(h))
    throw new Error("l'inconnu doit se lire dans la ligne du via");
  if(!/portée percée/.test(h))
    throw new Error("la fiche n'explique pas pourquoi on ne sait pas");
});

T("la traversée de cavité est chiffrée, et son détail avec",()=>{
  /* CE QUI ÉTAIT UN CONSEIL DEVIENT UN CHIFFRE. La fiche disait « ne changez
     pas de référence » et rendait un plancher ; elle peut dire combien cela
     coûte, donc si l'on peut se le permettre. */
  const t=simTransRetour({plans_depart:["GND"], plans_arrivee:["PWR"],
                          nets_depart:["GND"], nets_arrivee:["PWR"],
                          plan_change:true, nets_differents:true,
                          reference_change:true, raccorde:false, retenus:0,
                          trouves:0, source:"self", vias:[]});
  t.cavite={plan_haut:"GND", plan_bas:"PWR", hauteur_mm:1.0, cherche:true,
            ponts:1, pont:{x:12, y:0, distance_mm:2.0, repere:"C12"},
            capacite_plans_pF:95.0, aire_source:"page",
            impedance_plans_ohm:3.64, impedance_fc_ohm:6.65,
            etalement_nH:1.7192, esl_nH:1.0, esl_source:"repli",
            borne:false};
  const h=simFicheRet(simResDisc({coudes:[], transitions:[t]}));
  if(!/C12/.test(h))throw new Error("le découplage retenu n'est pas nommé");
  /* LE COÛT EST EN OHMS, ET NON EN NANOHENRYS : la cavité n'est pas une
     inductance, elle résonne. La capacité répartie des plans et l'inductance
     du découplage forment une résonance parallèle où l'impédance culmine ;
     une inductance équivalente figée manquerait exactement cela. */
  if(!/6,65 Ω/.test(h))throw new Error("le coût en ohms n'est pas affiché");
  if(!/95 pF/.test(h))
    throw new Error("la capacité des plans n'est pas dite : c'est par elle que "+
                    "le retour passe");
  /* LA DÉDUCTION RESTE : aucun via de masse ne peut joindre deux nets. */
  if(!/masse à de la masse/.test(h))
    throw new Error("la fiche ne dit plus qu'un via de masse n'y peut rien");
  /* LE DÉTAIL COMPTE : étalement et montage ne se corrigent pas de la même
     façon — l'un en rapprochant le condensateur, l'autre en le changeant. */
  if(!/1,72/.test(h)||!/1,00/.test(h))
    throw new Error("le détail étalement/montage n'est pas donné");
  if(!/supposés/.test(h))
    throw new Error("l'ESL est un repli et doit être annoncée comme telle");
  /* ET LE CONSEIL QUI N'EST PAS CELUI QU'ON ATTEND. */
  if(!/amincir le diélectrique/.test(h))
    throw new Error("la fiche ne dit pas que l'écart entre plans commande "+
                    "davantage que la distance au condensateur");
  /* ET L'ALERTE GRAVE NE SORT PLUS : le coût est connu, ce n'est plus une
     alarme mais une information de conception. */
  if(/simAlerte/.test(h))
    throw new Error("l'alerte crie alors que le coût est chiffré");
});

T("sans le net des plans, la fiche affiche le doute et non le défaut",()=>{
  /* LE DÉFAUT EXACT QUI CRIAIT SUR LES CARTES SAINES. Deux plans de noms
     différents dont on ignore les nets peuvent être deux masses — cas
     ordinaire — ou une masse et une alimentation — défaut grave. Trancher
     faisait sortir l'alerte sur toute carte quatre couches dont l'empilage ne
     nomme pas ses nets, c'est-à-dire presque toutes. */
  const t=simTransRetour({plans_depart:["Conductor-2"],
                          plans_arrivee:["Conductor-3"],
                          plan_change:true, nets_differents:null,
                          reference_change:false, raccorde:false, retenus:0,
                          trouves:0, source:"absent", vias:[]});
  const h=simFicheRet(simResDisc({coudes:[], transitions:[t]}));
  if(/simAlerte/.test(h))
    throw new Error("l'alerte grave est sortie sans preuve");
  if(!/on ne peut pas dire si c'est grave/.test(h))
    throw new Error("le doute n'est pas dit");
  if(!/Renseigner le net des plans/.test(h))
    throw new Error("la fiche ne dit pas comment lever le doute");
  /* La cellule porte le doute, pas un verdict. */
  if(!/\? Conductor-2→Conductor-3/.test(h))
    throw new Error("la cellule ne montre pas le doute");
});


/* --------------------------------------------------------------------------
   « CURRENT RETURN PATH » EST UNE SECTION, ET PLUS UNE COLONNE
   --------------------------------------------------------------------------
   OÙ IL VIVAIT. Le chemin de retour était éparpillé sous l'onglet
   « Impédance » : une colonne du tableau des discontinuités, quelques notes en
   bas de fiche, et un chevelu sur la carte. Trois endroits, aucun qui réponde
   à « par où revient le courant de ce via, et est-ce que ça se ferme ».

   CE QUE CES CAS VERROUILLENT : que la section existe et soit dans la famille
   SI ; qu'elle dise quelque chose quand il n'y a rien à dire ; et — le revers,
   qui est le vrai sujet — que la fiche d'impédance ne la redise PLUS. Un
   déménagement qui laisse une copie derrière lui n'est pas un déménagement.
   -------------------------------------------------------------------------- */

T("« Current Return Path » est une analyse de la famille SI",()=>{
  const a=SIM_ANALYSES.retour;
  if(!a)throw new Error("l'analyse n'est pas au catalogue");
  if(a.nom!=="Current Return Path")
    throw new Error("elle s'appelle « "+a.nom+" »");
  if(typeof a.corps!=="function"||typeof a.rendre!=="function"||
     typeof a.brancher!=="function")
    throw new Error("l'analyse n'est pas complète : un onglet qui ne sait ni "+
                    "se poser ni se rendre ne s'ouvrira pas");
  /* ELLE NE PEINT PAS LES Z0. `peint` commande la carte de chaleur des
     impédances ; la mettre à vrai ferait apparaître des couleurs sous une
     fiche qui n'en parle pas. */
  if(a.peint)
    throw new Error("l'onglet du retour repeint la carte de chaleur des Z0");
  const si=SIM_FAMILLES.find(f=>f.cle==="si");
  if(!si||si.analyses.indexOf("retour")<0)
    throw new Error("l'analyse n'est pas dans la famille SI : "+
                    JSON.stringify(si&&si.analyses));
  /* ET ELLE NE REMPLACE PAS L'IMPÉDANCE : les deux répondent à deux
     questions, et la seconde reste la première qu'on ouvre. */
  if(si.analyses[0]!=="impedance")
    throw new Error("l'impédance n'est plus l'analyse d'accueil de SI");
});

T("sans via, la fiche du retour répond au lieu de rester vide",()=>{
  /* UNE PAGE VIDE SE LIT COMME UN CALCUL QUI N'A PAS ABOUTI. Une liaison qui
     ne change pas de couche n'a pas de courant de retour VERTICAL à chiffrer,
     et c'est une réponse. */
  const h=simFicheRet(simResDisc({coudes:[], transitions:[]},3));
  if(!/Aucun via/.test(h))
    throw new Error("la fiche ne dit pas qu'il n'y a pas de via : "+h);
  if(!/plan de référence/.test(h))
    throw new Error("elle ne dit pas par où le courant revient quand même");
});

T("la fiche d'impédance ne parle PLUS du chemin de retour",()=>{
  /* LE REVERS, ET C'EST LE VRAI SUJET. Un déménagement qui laisse une copie
     derrière lui n'en est pas un : on lirait deux fois la même chose, dont une
     en marge d'un tableau qui parle d'autre chose. */
  const disc={coudes:[], transitions:[
    simTransRetour({plans_depart:["GND"], plans_arrivee:["PWR"],
                    nets_depart:["GND"], nets_arrivee:["PWR"],
                    plan_change:true, nets_differents:true,
                    reference_change:true, raccorde:false, retenus:0,
                    trouves:1, source:"self",
                    vias:[{distance_mm:0.60, part:0, retenu:false, net:"GND",
                           raison:"ne rejoint pas PWR"}]})
  ]};
  const hd=simDiscontinuites(simResDisc(disc));
  if(/<th>Retour<\/th>/.test(hd))
    throw new Error("la colonne « Retour » est encore dans le tableau des "+
                    "discontinuités");
  if(/masse à de la masse/.test(hd))
    throw new Error("l'alerte du plan de référence est encore sous l'impédance");
  if(/plancher/.test(hd))
    throw new Error("la note du plancher est encore sous l'impédance");

  /* ET ELLE EST BIEN QUELQUE PART : le retirer d'un côté sans le poser de
     l'autre serait une perte, pas un rangement. */
  const h=simFicheRet(simResDisc(disc));
  if(!/masse à de la masse/.test(h))
    throw new Error("l'alerte a disparu au lieu de déménager");
});

T("le chevelu ne se dessine que sous l'onglet du retour",()=>{
  /* LE CHEVELU SUIT SON SUJET. Il montrait, sous « Impédance », un défaut dont
     la fiche d'à côté ne parlait pas — et c'est précisément ce qui le rendait
     illisible : on voyait un trait rouge sans savoir où lire pourquoi. */
  const garde=[SIM.ouvert, SIM.analyse, SIM.res];
  try{
    SIM.ouvert=true; SIM.res={discontinuites:{transitions:[
      {retour:{x:1, y:2, retenus:1, vias:[{distance_mm:0.6, part:1,
                                           retenu:true, net:"GND"}]},
       modelise:{inductance_nH:0.8, inductance_source:"boucle"},
       cotes:{pastille_mm:0.55}}]}};
    SIM.analyse="retour";
    if(simCheveluRes().length!==1)
      throw new Error("le chevelu ne sort pas sous son propre onglet");
    SIM.analyse="impedance";
    if(simCheveluRes().length)
      throw new Error("le chevelu sort encore sous l'onglet Impédance");
    SIM.analyse="dc";
    if(simCheveluRes().length)
      throw new Error("le chevelu sort sous l'onglet DC");
  }finally{[SIM.ouvert, SIM.analyse, SIM.res]=garde;}
});
T("la portée supposée et l'antipad incertain sont nommés",()=>{
  const h=simFicheRet(simResDisc({coudes:[], transitions:[
    simTransRetour({plans_depart:["GND"], plans_arrivee:["GND"],
                    plan_change:false, nets_differents:false,
                    reference_change:false, raccorde:true, retenus:1,
                    trouves:1, source:"boucle", portee_supposee:true,
                    plans_incertains:true,
                    vias:[{distance_mm:0.60, part:1, retenu:true, net:"GND",
                           portee_supposee:true}]},
                   {antipad_max:1.05})
  ]}));
  if(!/supposée traversante/.test(h))
    throw new Error("la portée supposée n'est pas dite");
  if(!/ne déclare pas le net de ses plans/.test(h))
    throw new Error("l'empilage sans net de plan n'est pas signalé");
  /* LA FOURCHETTE D'ANTIPAD EST UNE COTE DU VIA : elle se lit sous le tableau
     des discontinuités, avec la capacité qu'elle explique. */
  const hd=simDiscontinuites(simResDisc({coudes:[], transitions:[
    simTransRetour({plans_depart:["GND"], plans_arrivee:["GND"],
                    plan_change:false, nets_differents:false,
                    reference_change:false, raccorde:true, retenus:1,
                    trouves:1, source:"boucle", portee_supposee:true,
                    plans_incertains:true,
                    vias:[{distance_mm:0.60, part:1, retenu:true, net:"GND",
                           portee_supposee:true}]},
                   {antipad_max:1.05})
  ]}));
  if(!/0,80 à 1,05 mm/.test(hd))
    throw new Error("la fourchette d'antipad n'est pas nommée : "+hd);
  if(!/au plus capacitif/.test(hd))
    throw new Error("la fiche ne dit pas de quel côté la fourchette est prise");
});

/* --------------------------------------------------------------------------
   LA BANDE S A SON UNITÉ, INDÉPENDANTE DE CELLE DE f₀
   --------------------------------------------------------------------------
   POURQUOI DEUX ET NON UNE. Une seule liste servait les trois champs. Une carte
   qui travaille à 250 MHz sur une bande de 100 MHz à 1 GHz devait donc écrire
   « 0,25 » et « 0,1 → 1 » en gigahertz — trois ordres de grandeur dans une
   seule unité, et des zéros à compter à chaque saisie.

   CE QUE CES CAS VERROUILLENT : que les deux unités soient vraiment
   indépendantes, que changer l'une CONVERTISSE sans toucher aux hertz, et que
   le repli rende exactement l'ancien comportement pour un état qui ne porte pas
   encore la seconde.
   -------------------------------------------------------------------------- */

function simAvecSaisie(f,etat){
  const garde=JSON.parse(JSON.stringify(SIM.saisie));
  Object.assign(SIM.saisie,etat||{});
  try{ f(); } finally { SIM.saisie=garde; }
}

T("la bande S et f₀ s'écrivent chacune dans SON unité",()=>{
  simAvecSaisie(()=>{
    simSaisieEcrire();
    /* f₀ en gigahertz, la bande en mégahertz : ce sont les mêmes hertz. */
    if(simEl("simFc").value!=="0,25")
      throw new Error("f₀ écrite « "+simEl("simFc").value+" » au lieu de 0,25");
    if(simEl("simF1").value!=="100")
      throw new Error("f₁ écrite « "+simEl("simF1").value+" » au lieu de 100");
    /* f₂ VAUT 1 EN GIGAHERTZ, et c'est tout l'objet de la séparation : les
       mêmes 1000 MHz s'écrivent « 1 » dès que la borne haute porte son unité à
       elle. Attendre « 1000 » ici revenait à demander que le champ ignore la
       liste posée juste à côté. */
    if(simEl("simF2").value!=="1")
      throw new Error("f₂ écrite « "+simEl("simF2").value+" » au lieu de 1");
    /* Et les deux listes montrent chacune la sienne. */
    if(simEl("simFUnite").value!=="GHz")
      throw new Error("la liste de f₀ montre "+simEl("simFUnite").value);
    if(simEl("simFUniteBande1").value!=="MHz")
      throw new Error("la liste de bande 1 montre "+simEl("simFUniteBande1").value);
    if(simEl("simFUniteBande2").value!=="GHz")
      throw new Error("la liste de bande 2 montre "+simEl("simFUniteBande2").value);
  },{fc:250e6, f1:100e6, f2:1000e6, unite:"GHz", uniteBande1:"MHz", uniteBande2:"GHz"});
});

T("relire rend les mêmes hertz, chaque champ dans son unité",()=>{
  simAvecSaisie(()=>{
    simSaisieEcrire();
    const s=simSaisie();
    if(Math.abs(s.fc-250e6)>1)throw new Error("f₀ relue "+s.fc);
    if(Math.abs(s.f1-100e6)>1)throw new Error("f₁ relue "+s.f1);
    if(Math.abs(s.f2-1000e6)>1)throw new Error("f₂ relue "+s.f2);
  },{fc:250e6, f1:100e6, f2:1000e6, unite:"GHz", uniteBande1:"MHz", uniteBande2:"GHz"});
});

T("changer l'unité de la bande ne déplace ni les hertz ni f₀",()=>{
  simAvecSaisie(()=>{
    simSaisieEcrire();
    simUniteChanger("kHz","bande1");
    /* LES HERTZ NE BOUGENT PAS : c'est toute la règle de la conversion. */
    if(Math.abs(SIM.saisie.f1-100e6)>1)
      throw new Error("f₁ a bougé : "+SIM.saisie.f1);
    if(simEl("simF1").value!=="100000")
      throw new Error("f₁ devrait s'écrire 100000 en kHz, pas « "+
                      simEl("simF1").value+" »");
    /* ET f₀ N'A PAS SUIVI : c'est l'autre moitié de l'indépendance. */
    if(SIM.saisie.unite!=="GHz")
      throw new Error("l'unité de f₀ a changé avec celle de la bande");
    if(simEl("simFc").value!=="0,25")
      throw new Error("f₀ s'est réécrite : « "+simEl("simFc").value+" »");
  },{fc:250e6, f1:100e6, f2:1000e6, unite:"GHz", uniteBande1:"MHz", uniteBande2:"GHz"});
});

T("changer l'unité de f₀ ne touche pas la bande",()=>{
  simAvecSaisie(()=>{
    simSaisieEcrire();
    simUniteChanger("MHz","fc");
    if(SIM.saisie.uniteBande1!=="MHz")
      throw new Error("l'unité de bande a suivi celle de f₀");
    if(Math.abs(SIM.saisie.f2-1000e6)>1)
      throw new Error("f₂ a bougé : "+SIM.saisie.f2);
    if(simEl("simFc").value!=="250")
      throw new Error("f₀ devrait s'écrire 250 en MHz, pas « "+
                      simEl("simFc").value+" »");
  },{fc:250e6, f1:100e6, f2:1000e6, unite:"GHz", uniteBande1:"MHz", uniteBande2:"GHz"});
});

T("un état sans unité de bande retombe sur celle de f₀",()=>{
  /* LE REPLI N'EST PAS UNE CONSTANTE, ET C'EST LE POINT. Un état enregistré
     avant la séparation ne porte pas `uniteBande1` ; lui donner du gigahertz
     par défaut ferait sauter la bande d'un facteur mille sous les yeux de qui
     rouvre le panneau. Retomber sur `unite` rend exactement l'ancien
     comportement. */
  simAvecSaisie(()=>{
    delete SIM.saisie.uniteBande1;
    delete SIM.saisie.uniteBande2;
    delete SIM.saisie.uniteBande;
    if(simUniteBande1().cle!=="MHz")
      throw new Error("le repli 1 donne "+simUniteBande1().cle+" au lieu de MHz");
    simSaisieEcrire();
    if(simEl("simF1").value!=="100")
      throw new Error("f₁ écrite « "+simEl("simF1").value+" » : le repli n'a "+
                      "pas pris l'unité de f₀");
  },{fc:250e6, f1:100e6, f2:1000e6, unite:"MHz", uniteBande1:"MHz", uniteBande2:"GHz"});
});

T("une unité inconnue ne change rien",()=>{
  simAvecSaisie(()=>{
    simUniteChanger("THz","bande1");
    if(SIM.saisie.uniteBande1!=="MHz")
      throw new Error("une unité hors liste a été acceptée");
  },{fc:250e6, f1:100e6, f2:1000e6, unite:"GHz", uniteBande1:"MHz", uniteBande2:"GHz"});
});

T("les commandes portent trois listes d'unité distinctes",()=>{
  const h=simCorpsImpedance();
  if(!/id="simFUnite"/.test(h))throw new Error("la liste de f₀ manque");
  if(!/id="simFUniteBande1"/.test(h))throw new Error("la liste de bande 1 manque");
  if(!/id="simFUniteBande2"/.test(h))throw new Error("la liste de bande 2 manque");
  /* L'ANCIENNE ÉTIQUETTE FIGÉE DOIT AVOIR DISPARU : la laisser afficherait une
     unité qui ne serait plus celle de la bande. */
  if(/id="simUBande"/.test(h))
    throw new Error("l'étiquette figée de la bande est encore là");
});

T("écart symétrique : c'est la règle d'isolation, des deux côtés",()=>{
  const t=simCarte();
  simZone("GND",5,10,55,30);
  const regle=r3(clrK("GND","N$1","cu","trk"));
  const g=simSegments();
  if(g.envoi.length!==1)
    throw new Error("un plan uniforme donne UNE plage, pas "+g.envoi.length);
  const o=g.envoi[0];
  if(Math.abs(o.gap_left-regle)>1e-6||Math.abs(o.gap_right-regle)>1e-6)
    throw new Error("les deux écarts devraient valoir la règle "+regle+
                    " : "+o.gap_left+" / "+o.gap_right);
  if(Math.abs(o.length-(SIM_X2-SIM_X1))>1e-6)
    throw new Error("longueur "+o.length+" au lieu de "+(SIM_X2-SIM_X1));
  if(!g.voisins.length===false)throw new Error("aucun voisin hors masse attendu");
});

T("masse d'un seul côté : l'autre reste à zéro, il n'est pas recopié",()=>{
  simCarte();
  /* Le plan ne couvre que le dessus de la piste, à trois dixièmes de son axe.
     C'EST LE CAS QUI ÉTAIT FAUX : l'écart mesuré d'un côté était posé des deux,
     et Z0 tombait deux fois trop. */
  simZone("GND",5,SIM_Y+0.5,55,30);
  const g=simSegments();
  const o=g.envoi[0];
  const plein=Math.max(o.gap_left,o.gap_right);
  const vide=Math.min(o.gap_left,o.gap_right);
  if(!(plein>0))throw new Error("le côté qui porte le plan doit avoir un écart");
  if(vide!==0)
    throw new Error("le côté sans plan doit rester à zéro, pas "+vide);
  /* 0,5 mm de l'axe moins 0,2 mm de demi-piste : trois dixièmes, et la règle
     d'isolation est plus serrée que cela — c'est donc la mesure qui commande. */
  if(Math.abs(plein-0.3)>0.02)
    throw new Error("écart mesuré "+plein+" au lieu de 0,30 mm environ");
  /* Et c'est bien le côté du plan : la normale gauche pointe vers les y
     croissants, là où on a posé le cuivre. */
  if(!(o.gap_left>0)||o.gap_right!==0)
    throw new Error("le plan est en +y, donc à gauche du sens de parcours : "+
                    o.gap_left+" / "+o.gap_right);
});

T("une découpe ôte la masse de son côté : zoneAt seule ne la voyait pas",()=>{
  simCarte();
  simZone("GND",5,10,55,30);
  simCoupe(5,SIM_Y+0.21,55,30);          // le cuivre du dessus est évidé
  const g=simSegments();
  const o=g.envoi[0];
  if(o.gap_left!==0)
    throw new Error("la découpe est en +y : ce côté ne doit plus porter de "+
                    "masse, écart "+o.gap_left);
  if(!(o.gap_right>0))
    throw new Error("le côté intact doit garder son écart");
});

T("un îlot d'un autre signal n'est pas de la masse, et il est signalé",()=>{
  simCarte();
  simZone("N$2",5,SIM_Y+0.5,55,30);      // du cuivre serré, mais pas une masse
  const g=simSegments();
  const o=g.envoi[0];
  if(o.gap_left!==0||o.gap_right!==0)
    throw new Error("un net de signal ne doit pas entrer dans l'écart : "+
                    o.gap_left+" / "+o.gap_right);
  const v=g.voisins.find(x=>x.net==="N$2");
  if(!v)throw new Error("le cuivre écarté doit être signalé comme couplage");
  if(Math.abs(v.ecart-0.3)>0.05)
    throw new Error("le couplage devrait être relevé à 0,30 mm, pas "+v.ecart);
  if(Math.abs(v.longueur-(SIM_X2-SIM_X1))>1)
    throw new Error("il longe toute la piste : "+v.longueur+" mm relevés");
});

T("le plan qui s'arrête à mi-parcours découpe la piste en deux plages",()=>{
  simCarte();
  /* LE CAS QUE LE MINIMUM SUR TOUTE LA LONGUEUR ÉCRASAIT : la moitié serrée
     donnait son écart aux quarante millimètres. */
  simZone("GND",5,10,30,30);
  const g=simSegments();
  if(g.envoi.length!==2)
    throw new Error("deux plages attendues, pas "+g.envoi.length+
                    " ("+g.envoi.map(o=>o.gap_left+"/"+o.gap_right).join(" ")+")");
  const a=g.envoi[0], b=g.envoi[1];
  if(!(a.gap_left>0&&a.gap_right>0))
    throw new Error("la première moitié est dans le plan : "+a.gap_left);
  if(b.gap_left!==0||b.gap_right!==0)
    throw new Error("la seconde n'a plus de plan : "+b.gap_left+"/"+b.gap_right);
  const som=a.length+b.length;
  if(Math.abs(som-(SIM_X2-SIM_X1))>1e-6)
    throw new Error("les plages doivent couvrir toute la piste : "+som);
  if(Math.abs(a.length-20)>0.5)
    throw new Error("la rupture est à mi-parcours : "+a.length+" mm");
  /* Les deux plages sont bout à bout : sans cela la mise en cascade
     signalerait une rupture de parcours. */
  if(Math.abs(a.end[0]-b.start[0])>1e-6||Math.abs(a.end[1]-b.start[1])>1e-6)
    throw new Error("les plages doivent se toucher");
});

T("une plage plus courte qu'un demi-millimètre rejoint sa voisine",()=>{
  simCarte();
  simZone("GND",5,10,55,30);
  /* Une encoche de deux dixièmes : c'est une discontinuité, pas une section.
     Le modèle de ligne ne sait pas traiter une discontinuité — elle doit donc
     disparaître dans sa voisine plutôt que d'entrer comme une ligne. */
  simCoupe(29.9,SIM_Y+0.21,30.1,30);
  const g=simSegments();
  if(g.envoi.length!==1)
    throw new Error("l'encoche ne doit pas créer de tronçon : "+
                    g.envoi.length+" envoyés");
});

T("couture d'un seul côté : l'autre côté pèse, et c'est voulu",()=>{
  simCarte();
  simZone("GND",5,10,55,30);             // du plan des DEUX côtés de la piste
  for(let x=11;x<=49;x+=4)
    S.vias.push({x:x, y:SIM_Y+1, d:0.8, drill:0.4, a:0, b:3, net:"GND"});
  touch();
  const c=simSegments().couture;
  if(!c)throw new Error("la couture devrait être mesurée");
  if(c.n<10)throw new Error("dix vias au moins dans le couloir, "+c.n+" vus");
  /* LE CONTRÔLE EST PAR CÔTÉ, et c'est le sens de la mesure : le plan du côté
     −y porte du cuivre et AUCUNE couture. Son trou vaut donc la piste entière,
     et c'est bien ce qu'il faut annoncer — ce cuivre-là n'est ramené à la masse
     nulle part, et le solveur le tient pourtant à zéro volt. */
  if(Math.abs(c.ecartMax-(SIM_X2-SIM_X1))>1e-6)
    throw new Error("le côté non cousu doit ressortir avec ses 40 mm, pas "+
                    c.ecartMax);
});

T("couture des deux côtés : l'espacement mesuré est celui des vias",()=>{
  simCarte();
  simZone("GND",5,10,55,30);
  for(let x=11;x<=49;x+=4){
    S.vias.push({x:x, y:SIM_Y+1, d:0.8, drill:0.4, a:0, b:3, net:"GND"});
    S.vias.push({x:x, y:SIM_Y-1, d:0.8, drill:0.4, a:0, b:3, net:"GND"});
  }
  touch();
  const c=simSegments().couture;
  if(!c)throw new Error("la couture devrait être mesurée");
  if(c.n<20)throw new Error("vingt vias attendus dans le couloir, "+c.n);
  /* Un via tous les 4 mm, le premier à 1 mm du bout et le dernier à 1 mm de
     l'autre : le plus grand trou est de 4 mm, bouts compris. */
  if(c.ecartMax>4.05)
    throw new Error("espacement max attendu 4 mm, mesuré "+c.ecartMax);
  /* Un via HORS du couloir ne compte pas : il ne coud pas le cuivre qui borde
     la piste, il coud le plan trois millimètres plus loin. */
  S.vias.push({x:30, y:SIM_Y+9, d:0.8, drill:0.4, a:0, b:3, net:"GND"});
  touch();
  if(simSegments().couture.n!==c.n)
    throw new Error("un via à 9 mm de l'axe est hors du couloir de 2 mm");
});

T("aucun via de masse : le trou vaut toute la longueur de la piste",()=>{
  simCarte();
  simZone("GND",5,10,55,30);
  S.vias=[]; touch();
  const c=simSegments().couture;
  if(!c)throw new Error("la couture devrait être mesurée");
  if(c.n!==0)throw new Error("aucun via attendu, "+c.n+" comptés");
  if(Math.abs(c.ecartMax-(SIM_X2-SIM_X1))>1e-6)
    throw new Error("le trou devrait valoir les 40 mm de la piste, pas "+
                    c.ecartMax);
});

T("un arc part avec la longueur de son CUIVRE, pas celle de ses cordes",()=>{
  simCarte();
  S.tracks.length=0;
  const t={l:0, net:"N$1", w:SIM_W, x1:10, y1:20, x2:30, y2:20,
           ca:Math.PI};
  S.tracks.push(t);
  clearSel(); S.sel.tracks.add(t);
  simZone("GND",0,0,60,40);
  const attendu=trkLen(t);                 // r·|ca| = 10·π ≈ 31,42 mm
  const g=simSegments();
  const som=g.envoi.reduce((a,o)=>a+o.length,0);
  if(Math.abs(som-attendu)>0.05)
    throw new Error("longueur envoyée "+som.toFixed(3)+" au lieu de "+
                    attendu.toFixed(3)+" (la corde ne vaut que 20 mm)");
});

T("aucune masse retenue : l'écart tombe à zéro et le panneau le dit",()=>{
  simCarte();
  simZone("GND",5,10,55,30);
  /* Le panneau a d'abord affiché la proposition — c'est ce premier appel qui
     retient la carte —, puis l'utilisateur a tout décoché. Sans lui, la
     vérification « est-ce une autre carte ? » reprendrait la main juste après
     et reproposerait GND. */
  simRefSet();
  SIM.refAuto=false; SIM.ref=new Set();
  const g=simSegments();
  if(g.envoi[0].gap_left!==0||g.envoi[0].gap_right!==0)
    throw new Error("sans masse retenue, il n'y a pas d'écart coplanaire");
  const p=SIM_PCB.probleme({z0:50,f1:1e8,f2:5e9,points:11,fc:1e9});
  if(!p.notes.some(n=>/Aucun net de masse/.test(n)))
    throw new Error("le panneau doit signaler qu'aucune masse n'est retenue");
  SIM.refAuto=true; SIM.ref=null;
});

T("les plages : dix pour cent d'écart les sépare, un demi-millimètre les fond",()=>{
  /* `simPlagesDe` est dans commun/simulation-em.js : c'est un choix de
     MODÉLISATION, partagé par les deux outils, et il vaut d'être éprouvé seul. */
  if(!simMemeEcart(0.20,0.21))throw new Error("0,20 et 0,21 : même plage");
  if(simMemeEcart(0.20,0.30))throw new Error("0,20 et 0,30 : plages distinctes");
  if(simMemeEcart(0,0.20))throw new Error("l'absence de masse est sa propre classe");
  if(!simMemeEcart(0,0))throw new Error("deux absences vont ensemble");
  /* Une piste de 10 mm dont le millimètre central est serré : le serré fait
     moins d'un demi-millimètre ? non, un millimètre — il tient. */
  const r=simPlagesDe(10,u=>({g:(u>0.45&&u<0.55)?0.1:0.4, d:0.4}));
  if(r.plages.length!==3)
    throw new Error("trois plages attendues, "+r.plages.length);
  if(Math.abs(r.plages.reduce((a,p)=>a+p.longueur,0)-10)>1e-9)
    throw new Error("les plages doivent couvrir toute la longueur");
  /* Le même creux réduit à deux dixièmes de millimètre disparaît. */
  const r2=simPlagesDe(10,u=>({g:(u>0.49&&u<0.51)?0.1:0.4, d:0.4}));
  if(r2.plages.length!==1)
    throw new Error("un creux de 0,2 mm n'est pas une section : "+
                    r2.plages.length+" plages");
});

/* ==========================================================================
   LA CHUTE CONTINUE : le cuivre qui part au solveur, et les deux bornes
   --------------------------------------------------------------------------
   Le solveur resistif a ses propres essais (python/test/banc-dc.py) et il est
   verifie contre rho L/(W t). Ce qui se joue ICI est l'autre moitie : ce que
   l'editeur LUI ENVOIE. Un solveur juste nourri d'un mauvais cuivre rend un
   mauvais chiffre, et rien dans le panneau ne le dirait.

   La carte des essais : deux pastilles traversantes du meme net, une piste sur
   la couche 0, un via, une piste sur la couche 3. Le courant DOIT changer de
   couche pour aller d'une pastille a l'autre -- c'est le cas qui interesse.
   ========================================================================== */
function dcCarte(){
  carte4c();
  S.cuts=[];
  /* Deux empreintes a deux broches, posees loin l'une de l'autre. Le net
     d'une pastille vient de `fp.nets`, indexe par le NUMERO de broche :
     l'ecrire sur l'objet rendu par padsOf() ne servirait a rien, cet objet
     est reconstruit a chaque appel. Les pastilles sont TRAVERSANTES
     (`drill` > 0) : c'est ce qui les fait exister sur les quatre couches. */
  const mk=(ref,x,y)=>{
    const fp=mkFp(ref,"","",2);
    fp.x=x;fp.y=y;
    fp.nets={1:"VDD"};
    fp.pads=padsOf(fp).map(q=>Object.assign(padClone(q),
                    {w:1.4,h:1.4,shape:"circ",drill:0.6}));
    S.fps.push(fp);
    return fp;
  };
  const a=mk("J1",10,20), b=mk("J2",50,20);
  S.tracks.push({l:0, net:"VDD", w:0.5, x1:padsWorld(a)[0].x, y1:20, x2:30, y2:20});
  S.tracks.push({l:3, net:"VDD", w:0.5, x1:30, y1:20, x2:padsWorld(b)[0].x, y2:20});
  S.vias.push({id:S.nextId++, x:30, y:20, a:0, b:3, d:0.8, drill:0.4,
               net:"VDD"});
  SIM_PCB.dcOublier();
  touch();
  return {a:a, b:b};
}
/* Poser une borne comme le ferait un clic sur la carte. */
function dcBorne(role,x,y){
  SIM_PCB.dcChoisir(role);
  simDCClic(x,y);
}

T("chute DC : sans les deux bornes, un refus qui dit quoi faire",()=>{
  dcCarte();
  const r=SIM_PCB.cuivreDC({courant:1});
  if(!r.erreur)throw new Error("aucun refus alors qu'aucune borne n'est posee");
  if(!/au moins une source et une charge/.test(r.erreur))
    throw new Error("refus muet : "+r.erreur);
  if(!r.conseil)throw new Error("un refus sans conseil laisse chercher");
});

T("chute DC : le clic prend la pastille, et la nomme",()=>{
  const c=dcCarte();
  const q=padsWorld(c.a)[0];
  dcBorne("source",q.x,q.y);
  const B=SIM_PCB.dcBornes();
  if(B.length!==1)throw new Error("aucune borne posee par le clic");
  if(B[0].nom!=="J1.1")throw new Error("nom faux : "+B[0].nom);
  if(B[0].net!=="VDD")throw new Error("net faux : "+B[0].net);
  if(B[0].role!=="source")throw new Error("role faux : "+B[0].role);
});

T("chute DC : un clic dans le vide ne pose rien",()=>{
  dcCarte();
  dcBorne("source",5,38);            // loin de toute pastille
  if(SIM_PCB.dcBornes().length)
    throw new Error("une borne a ete posee la ou il n'y a pas de pastille");
});

T("chute DC : deux nets differents, c'est un refus explicite",()=>{
  const c=dcCarte();
  c.b.nets={1:"GND",2:"GND"};touch();
  const qa=padsWorld(c.a)[0], qb=padsWorld(c.b)[0];
  dcBorne("source",qa.x,qa.y);
  dcBorne("charge",qb.x,qb.y);
  const r=SIM_PCB.cuivreDC({courant:1});
  if(!r.erreur)throw new Error("deux nets differents ont ete acceptes");
  if(!/m..?me net/.test(r.erreur))throw new Error("refus hors sujet : "+r.erreur);
});

T("chute DC : le cuivre du net part, celui des autres reste",()=>{
  const c=dcCarte();
  S.tracks.push({l:0, net:"GND", w:2, x1:10, y1:30, x2:50, y2:30});
  simZone("GND",5,32,55,38);
  const qa=padsWorld(c.a)[0], qb=padsWorld(c.b)[0];
  dcBorne("source",qa.x,qa.y);
  dcBorne("charge",qb.x,qb.y);
  const r=SIM_PCB.cuivreDC({courant:1.2, tension:0});
  if(r.erreur)throw new Error("refus inattendu : "+r.erreur);
  if(r.net!=="VDD")throw new Error("net faux : "+r.net);
  for(const g of r.polygones)
    if(g.net!=="VDD")throw new Error("du cuivre d'un autre net est parti : "+g.net);
  /* Les deux couches doivent etre representees : sans cela le courant ne
     pourrait pas changer de couche, et le via ne servirait a rien. */
  const couches=new Set(r.polygones.map(g=>g.couche));
  if(!couches.has(0)||!couches.has(3))
    throw new Error("les deux couches ne sont pas la : "+[...couches]);
});

T("chute DC : le via part avec ses deux couches et sa hauteur",()=>{
  const c=dcCarte();
  const qa=padsWorld(c.a)[0], qb=padsWorld(c.b)[0];
  dcBorne("source",qa.x,qa.y);
  dcBorne("charge",qb.x,qb.y);
  const r=SIM_PCB.cuivreDC({courant:1});
  /* Le VIA proprement dit, distingue des tubes de pastille par son repere :
     les deux sont des percages metallises et partent par le meme canal. */
  const vs=r.vias.filter(v=>/^V1/.test(v.repere));
  if(vs.length!==1)throw new Error("1 via attendu, "+vs.length);
  const v=vs[0];
  if(v.couche_a!==0||v.couche_b!==3)
    throw new Error("couches du via fausses : "+v.couche_a+"→"+v.couche_b);
  if(v.percage!==0.4)throw new Error("percage faux : "+v.percage);
  /* La hauteur traversee, c'est le dielectrique ENTRE les deux couches plus le
     cuivre des couches intermediaires -- pas l'epaisseur de la carte. */
  const attendu=diAt(0).t+diAt(1).t+diAt(2).t+cuT(1)+cuT(2);
  if(Math.abs(v.hauteur-attendu)>1e-9)
    throw new Error("hauteur "+v.hauteur+" au lieu de "+attendu);
  if(v.net!=="VDD")throw new Error("le via a perdu son net");
  if(!v.repere)throw new Error("le via n'a pas de repere : le tableau ne "+
                               "pourra pas le nommer");
});

T("chute DC : un via d'un autre net ne part pas",()=>{
  const c=dcCarte();
  S.vias.push({id:S.nextId++, x:20, y:30, a:0, b:3, d:0.8, drill:0.4,
               net:"GND"});
  const qa=padsWorld(c.a)[0], qb=padsWorld(c.b)[0];
  dcBorne("source",qa.x,qa.y);
  dcBorne("charge",qb.x,qb.y);
  const r=SIM_PCB.cuivreDC({courant:1});
  const vs=r.vias.filter(v=>/^V\d/.test(v.repere));
  if(vs.length!==1)
    throw new Error("le via GND est parti avec : "+vs.length+" vias");
});

T("chute DC : une decoupe part en trou, pas en cuivre",()=>{
  const c=dcCarte();
  simZone("VDD",5,15,55,25);
  simCoupe(28,17,32,23);
  const qa=padsWorld(c.a)[0], qb=padsWorld(c.b)[0];
  dcBorne("source",qa.x,qa.y);
  dcBorne("charge",qb.x,qb.y);
  const r=SIM_PCB.cuivreDC({courant:1});
  const trous=r.polygones.filter(g=>g.trou);
  if(trous.length!==1)throw new Error("1 trou attendu, "+trous.length);
  /* ET IL DOIT VENIR APRES : une decoupe posee avant le plan qu'elle evide
     n'evide rien. Le solveur reordonne, mais l'envoyer deja dans l'ordre est
     ce qui rend la lecture du document possible. */
  if(!r.polygones[r.polygones.length-1].trou)
    throw new Error("la decoupe n'est pas en fin de liste");
});

T("chute DC : la borne part en boite, pas en point",()=>{
  const c=dcCarte();
  const qa=padsWorld(c.a)[0], qb=padsWorld(c.b)[0];
  dcBorne("source",qa.x,qa.y);
  dcBorne("charge",qb.x,qb.y);
  SIM_PCB.dcValeur(0,3.3);          // la source, en volts
  SIM_PCB.dcValeur(1,2.5);          // la charge, en amperes
  const r=SIM_PCB.cuivreDC();
  const charge=r.sources[0], alim=r.references[0];
  if(!charge.boite||charge.boite.length!==4)
    throw new Error("la charge n'a pas de boite : tout l'amperage sortirait "+
                    "par un seul noeud, et la constriction serait inventee");
  if(charge.courant!==-2.5)
    throw new Error("une charge TIRE : -2,5 A attendus, "+charge.courant);
  if(alim.tension!==3.3)throw new Error("tension fausse : "+alim.tension);
  const large=charge.boite[2]-charge.boite[0];
  if(!(large>=1.3))throw new Error("boite trop etroite : "+large);
});

T("chute DC : le percage d'une pastille traversante part comme un tube",()=>{
  /* LE DEFAUT QUE CE CAS GARDE. Une pastille traversante pose un anneau de
     cuivre sur CHAQUE couche. Ce qui les relie, c'est le tube metallise du
     percage -- et la premiere version ne l'envoyait pas. Les anneaux des
     couches intermediaires restaient donc electriquement flottants, et le
     solveur refusait TOUT le calcul : « 2016 noeuds n'atteignent aucune
     reference ». Rien dans l'editeur ne l'aurait montre : il a fallu envoyer
     le document au serveur pour le voir. */
  const c=dcCarte();
  const qa=padsWorld(c.a)[0], qb=padsWorld(c.b)[0];
  dcBorne("source",qa.x,qa.y);
  dcBorne("charge",qb.x,qb.y);
  const r=SIM_PCB.cuivreDC({courant:2});
  const tubes=r.vias.filter(v=>/^J1\.1/.test(v.repere));
  if(tubes.length!==3)
    throw new Error("une pastille traversante sur 4 couches demande 3 "+
                    "liaisons, "+tubes.length+" envoyee(s)");
  /* Chaque liaison relie deux couches VOISINES, avec la hauteur de SON
     intervalle -- pas celle de la carte entiere. */
  for(const t of tubes){
    if(Math.abs(t.couche_b-t.couche_a)!==1)
      throw new Error("liaison non contigue : "+t.couche_a+"→"+t.couche_b);
    const attendu=simDCHauteurVia(t.couche_a,t.couche_b);
    if(Math.abs(t.hauteur-attendu)>1e-9)
      throw new Error("hauteur "+t.hauteur+" au lieu de "+attendu);
  }
  const pleine=simDCHauteurVia(0,3);
  if(tubes.some(t=>Math.abs(t.hauteur-pleine)<1e-9))
    throw new Error("une liaison porte l'epaisseur de toute la carte");
});

T("chute DC : aucun cuivre du net n'est laisse sans liaison verticale",()=>{
  /* L'INVARIANT QUI RESUME LE PRECEDENT, et qui tient quelle que soit la
     carte : toute couche ou le net pose du cuivre doit etre atteignable
     depuis la couche de la source en suivant les liaisons envoyees. Sans
     cela, le solveur a du cuivre flottant et refuse -- ce qui est le bon
     comportement, mais c'est ICI qu'il faut l'empecher. */
  const c=dcCarte();
  const qa=padsWorld(c.a)[0], qb=padsWorld(c.b)[0];
  dcBorne("source",qa.x,qa.y);
  dcBorne("charge",qb.x,qb.y);
  const r=SIM_PCB.cuivreDC({courant:1});
  const couches=[...new Set(r.polygones.filter(g=>!g.trou).map(g=>g.couche))];
  const vus=new Set([r.sources[0].couche]);
  for(let passe=0;passe<couches.length+1;passe++)
    for(const v of r.vias){
      if(vus.has(v.couche_a))vus.add(v.couche_b);
      if(vus.has(v.couche_b))vus.add(v.couche_a);
    }
  const orphelines=couches.filter(l=>!vus.has(l));
  if(orphelines.length)
    throw new Error("cuivre sans chemin vertical sur la ou les couches "+
                    orphelines.map(l=>l+1).join(", "));
});

T("chute DC : un tube ne relie que les couches qui portent du cuivre",()=>{
  /* Relier une couche vide ne servirait a rien et ferait une ligne « hors
     calcul » de plus dans le tableau. Le via de la carte d'essai traverse
     quatre couches, mais le net n'a de cuivre que sur la premiere et la
     derniere : UNE seule liaison, pas trois. */
  const c=dcCarte();
  const qa=padsWorld(c.a)[0], qb=padsWorld(c.b)[0];
  dcBorne("source",qa.x,qa.y);
  dcBorne("charge",qb.x,qb.y);
  const r=SIM_PCB.cuivreDC({courant:1});
  const v1=r.vias.filter(v=>/^V1/.test(v.repere));
  if(v1.length!==1)
    throw new Error("le via traverse du vide : "+v1.length+" liaisons");
  if(v1[0].couche_a!==0||v1[0].couche_b!==3)
    throw new Error("couches fausses : "+v1[0].couche_a+"→"+v1[0].couche_b);
});

T("chute DC : le tableau des bornes dit ce qui ARRIVE a chaque charge",()=>{
  /* C'EST LA QUESTION QU'ON POSE A CE CALCUL : « j'ai 3,3 V au regulateur,
     combien en reste-t-il la-bas ? ». La chute du net n'y repond pas des
     qu'il y a plus d'un consommateur. */
  const res={bornes:[
    {repere:"U1.3", role:"tension", consigne:3.3, tension:3.3,   chute:0},
    {repere:"U5.1", role:"courant", consigne:-1.0, tension:3.2928, chute:0.0072},
    {repere:"U9.2", role:"courant", consigne:-0.5, tension:3.2904, chute:0.0096}
  ]};
  const h=simTableauBornes(res);
  if(!/U1\.3/.test(h)||!/U5\.1/.test(h)||!/U9\.2/.test(h))
    throw new Error("une borne manque au tableau");
  if(!/3,300 V/.test(h))throw new Error("la consigne de la source manque");
  if(!/1,000 A/.test(h))
    throw new Error("le courant d'une charge doit s'ecrire en valeur "+
                    "absolue : « -1 A » fait douter");
  if(!/3,2904 V/.test(h))throw new Error("la tension arrivee manque");
  /* LA PIRE CHARGE, dite en une phrase : c'est la decision qu'on prend. */
  if(!/U9\.2/.test(h.split("</table>")[1]||""))
    throw new Error("la pire charge n'est pas nommee sous le tableau");
  if(simTableauBornes({})!=="")throw new Error("un tableau sans donnee");
});

T("chute DC : une source porte des VOLTS, une charge des AMPERES",()=>{
  /* LE VOCABULAIRE EST CELUI DU SCHEMA, et l'inverser rend le panneau
     illisible : une source est une alimentation, on lui regle sa TENSION ;
     une charge est un consommateur, on lui regle son COURANT. La premiere
     version les avait a l'envers. */
  const c=dcCarte();
  const qa=padsWorld(c.a)[0], qb=padsWorld(c.b)[0];
  dcBorne("source",qa.x,qa.y);
  dcBorne("charge",qb.x,qb.y);
  const B=SIM_PCB.dcBornes();
  const src=B.find(b=>b.role==="source"), ch=B.find(b=>b.role==="charge");
  if(!src||!ch)throw new Error("roles : "+B.map(b=>b.role).join(","));
  if(src.valeur!==3.3)throw new Error("une source neuve doit valoir 3,3 V, "+
                                      "pas "+src.valeur);
  if(ch.valeur!==1)throw new Error("une charge neuve doit tirer 1 A, pas "+
                                   ch.valeur);
  const r=SIM_PCB.cuivreDC();
  if(r.erreur)throw new Error("refus inattendu : "+r.erreur);
  /* LA TRADUCTION vers le solveur : la source part en DIRICHLET (tension), la
     charge en NEUMANN avec un courant NEGATIF -- il SORT du cuivre. */
  if(r.references.length!==1||r.references[0].tension!==3.3)
    throw new Error("la source n'est pas passee en tension imposee");
  if(r.sources.length!==1||r.sources[0].courant!==-1)
    throw new Error("la charge doit tirer -1 A, elle porte "+
                    r.sources[0].courant);
});

T("chute DC : sans source, ou sans charge, le refus dit LEQUEL manque",()=>{
  const c=dcCarte();
  const qa=padsWorld(c.a)[0], qb=padsWorld(c.b)[0];
  dcBorne("source",qa.x,qa.y);
  let r=SIM_PCB.cuivreDC();
  if(!r.erreur||!/charge/.test(r.erreur+r.conseil))
    throw new Error("sans charge : "+r.erreur);
  SIM_PCB.dcOublier();
  dcBorne("charge",qb.x,qb.y);
  r=SIM_PCB.cuivreDC();
  if(!r.erreur||!/source/.test(r.erreur+r.conseil))
    throw new Error("sans source : "+r.erreur);
});

T("chute DC : plusieurs charges tirent, chacune son amperage",()=>{
  /* CE QUE CE CAS DEBLOQUE. Un rail nourrit plusieurs composants, et ce que
     chacun voit depend de ce que TIRENT LES AUTRES. La premiere version
     n'acceptait qu'un consommateur : il aurait fallu autant de calculs
     separes, dont aucun n'aurait ete juste. */
  const c=dcCarte();
  const qa=padsWorld(c.a)[0], qb=padsWorld(c.b)[0];
  dcBorne("source",qa.x,qa.y);
  dcBorne("charge",qb.x,qb.y);
  /* Une seconde charge, sur la pastille 2 de J2. */
  c.b.nets={1:"VDD",2:"VDD"};touch();
  const q2=padsWorld(c.b).find(q=>q.n===2);
  dcBorne("charge",q2.x,q2.y);
  const B=SIM_PCB.dcBornes();
  const chs=B.filter(b=>b.role==="charge");
  if(chs.length!==2)throw new Error("2 charges attendues, "+chs.length);
  SIM_PCB.dcValeur(B.indexOf(chs[0]),1.2);
  SIM_PCB.dcValeur(B.indexOf(chs[1]),0.3);
  const r=SIM_PCB.cuivreDC();
  if(r.erreur)throw new Error("refus inattendu : "+r.erreur);
  if(r.sources.length!==2)
    throw new Error("2 injections attendues, "+r.sources.length);
  /* Elles TIRENT : le courant est negatif, et la somme fait -1,5 A. */
  const tot=r.sources.reduce((x,o)=>x+o.courant,0);
  if(Math.abs(tot+1.5)>1e-9)throw new Error("total "+tot+" A au lieu de -1,5");
  for(const o of r.sources)
    if(!o.repere)throw new Error("une injection sans repere : le panneau ne "+
                                 "pourra pas dire laquelle");
});

T("chute DC : plusieurs sources sont acceptees",()=>{
  /* Deux regulateurs en parallele, ou un connecteur d'alimentation a deux
     broches : le solveur les tient toutes a leur tension et repartit le
     courant entre elles. */
  const c=dcCarte();
  c.a.nets={1:"VDD",2:"VDD"};touch();
  const qb=padsWorld(c.b)[0];
  const s1=padsWorld(c.a).find(q=>q.n===1), s2=padsWorld(c.a).find(q=>q.n===2);
  dcBorne("source",s1.x,s1.y);
  dcBorne("source",s2.x,s2.y);
  dcBorne("charge",qb.x,qb.y);
  const r=SIM_PCB.cuivreDC();
  if(r.erreur)throw new Error("refus inattendu : "+r.erreur);
  if(r.references.length!==2)
    throw new Error("2 sources attendues, "+r.references.length);
});

T("chute DC : recliquer la meme pastille corrige le tir, ne double pas",()=>{
  /* Cliquer deux fois la meme pastille est une correction de visee, pas une
     demande d'y injecter deux fois le courant -- ce qui doublerait le courant
     du net en silence. */
  const c=dcCarte();
  const qa=padsWorld(c.a)[0];
  dcBorne("source",qa.x,qa.y);
  SIM_PCB.dcValeur(0,2.5);
  dcBorne("source",qa.x,qa.y);
  const B=SIM_PCB.dcBornes();
  if(B.length!==1)throw new Error(B.length+" bornes pour une seule pastille");
  if(B[0].valeur!==2.5)
    throw new Error("l'amperage saisi a ete perdu : "+B[0].valeur);
});

T("chute DC : changer le role d'une pastille la remplace",()=>{
  const c=dcCarte();
  const qa=padsWorld(c.a)[0];
  dcBorne("source",qa.x,qa.y);
  dcBorne("charge",qa.x,qa.y);
  const B=SIM_PCB.dcBornes();
  if(B.length!==1)throw new Error(B.length+" bornes pour une seule pastille");
  if(B[0].role!=="charge")throw new Error("role non change : "+B[0].role);
});

T("chute DC : retirer une borne par son rang",()=>{
  const c=dcCarte();
  const qa=padsWorld(c.a)[0], qb=padsWorld(c.b)[0];
  dcBorne("source",qa.x,qa.y);
  dcBorne("charge",qb.x,qb.y);
  SIM_PCB.dcOublier(0);
  const B=SIM_PCB.dcBornes();
  if(B.length!==1)throw new Error(B.length+" bornes apres retrait");
  if(B[0].role!=="charge")throw new Error("la mauvaise borne est partie");
  SIM_PCB.dcOublier();
  if(SIM_PCB.dcBornes().length)throw new Error("l'effacement n'a rien efface");
});

T("chute DC : une borne sans net est nommee dans le refus",()=>{
  const c=dcCarte();
  c.a.nets={};touch();
  const qa=padsWorld(c.a)[0], qb=padsWorld(c.b)[0];
  dcBorne("source",qa.x,qa.y);
  dcBorne("charge",qb.x,qb.y);
  const r=SIM_PCB.cuivreDC();
  if(!r.erreur)throw new Error("une pastille sans net a ete acceptee");
  if(r.erreur.indexOf("J1.1")<0)
    throw new Error("le refus ne dit pas LAQUELLE : "+r.erreur);
});

T("chute DC : une droite fait un quadrilatere, un arc en fait plusieurs",()=>{
  dcCarte();
  const droite={l:0, net:"VDD", w:0.5, x1:0, y1:0, x2:10, y2:0};
  if(simDCPolysPiste(droite).length!==1)
    throw new Error("une droite ne doit faire qu'un quadrilatere");
  const arc={l:0, net:"VDD", w:0.5, x1:0, y1:0, x2:10, y2:0, ca:Math.PI/2};
  const n=simDCPolysPiste(arc).length;
  if(n<4)throw new Error("un quart de tour rendu en "+n+" morceaux : le "+
                         "contour serait un polygone, pas un arc");
});

T("chute DC : les bouts de piste sont allonges d'une demi-largeur",()=>{
  const q=simDCPolysPiste({l:0, net:"VDD", w:1, x1:0, y1:0, x2:10, y2:0})[0];
  const xs=q.map(p=>p[0]);
  if(Math.abs(Math.min.apply(null,xs)+0.5)>1e-9)
    throw new Error("le bout n'est pas allonge : x min = "+Math.min.apply(null,xs));
  const ys=q.map(p=>p[1]);
  if(Math.abs(Math.max.apply(null,ys)-0.5)>1e-9)
    throw new Error("largeur fausse : y max = "+Math.max.apply(null,ys));
});

/* --------------------------------------------------------------------------
   CE QUE LE PANNEAU ECRIT DU TABLEAU DES VIAS
   -------------------------------------------------------------------------- */
function dcVia(rep,a,b,i){
  return {repere:rep, couche_a:a, couche_b:b, x:0, y:0, net:"VDD",
          courant:i, chute:Math.abs(i)*1e-3, resistance:1e-3,
          puissance:i*i*1e-3, relie:true};
}

T("chute DC : sans via, le panneau dit que tout reste sur une couche",()=>{
  const h=simTableauVias({vias:[]});
  if(!/une seule couche/.test(h))throw new Error("silence sur l'absence de via");
});

T("chute DC : un via non relie est montre, et marque",()=>{
  const h=simTableauVias({vias:[{repere:"V9", couche_a:0, couche_b:3, x:0, y:0,
                                 net:"VDD", courant:0, chute:0, resistance:0,
                                 relie:false, motif:"aucun cuivre du net"}]});
  if(!/V9/.test(h))throw new Error("le via absent n'est pas montre");
  if(!/hors calcul/.test(h))
    throw new Error("rien ne dit qu'il est hors du calcul : on croirait qu'il "+
                    "porte zero ampere");
});

T("chute DC : des vias EN SERIE ne se comparent pas entre eux",()=>{
  /* LE DEFAUT QUE CE CAS GARDE. Le tube d'une pastille traversante est une
     CHAINE : trois liaisons entre couches voisines, qui portent toutes le
     meme courant l'une apres l'autre. La premiere version les sommait comme
     si elles etaient en parallele et annoncait « le plus charge porte 25 % »
     la ou un seul chemin portait la TOTALITE. Un chiffre rassurant, et faux. */
  const h=simTableauVias({vias:[dcVia("J1.1 1→2",0,1,2), dcVia("J1.1 2→3",1,2,2),
                                dcVia("J1.1 3→4",2,3,2)]});
  if(/%/.test(h))
    throw new Error("une part est annoncee alors qu'aucun via n'est en "+
                    "parallele : "+h.replace(/<[^>]*>/g," "));
});

T("chute DC : des vias EN PARALLELE se comparent, et le chiffre est juste",()=>{
  /* Quatre vias entre les MEMES couches : la somme vaut le courant qui change
     de couche, et la part du plus charge se lit directement. */
  const h=simDesequilibreVias([dcVia("V1",0,3,0.5), dcVia("V2",0,3,0.2),
                               dcVia("V3",0,3,0.2), dcVia("V4",0,3,0.1)]);
  if(!/50,0 %/.test(h))
    throw new Error("part fausse : "+h.replace(/<[^>]*>/g," "));
  if(!/25,0 %/.test(h))
    throw new Error("la part a parts egales manque : "+h.replace(/<[^>]*>/g," "));
  if(!/couches 1 et 4/.test(h))
    throw new Error("le couple de couches n'est pas nomme : "+
                    h.replace(/<[^>]*>/g," "));
});

T("chute DC : un tableau trop long est coupe, et le dit",()=>{
  const vias=[];
  for(let k=0;k<SIM_DC_VIAS_MAX+7;k++)vias.push(dcVia("V"+k,0,3,1/(k+1)));
  const h=simTableauVias({vias:vias});
  if(!/7 via\(s\) de plus/.test(h))
    throw new Error("la coupe est silencieuse : on croirait avoir tout vu");
});

/* --------------------------------------------------------------------------
   LA FINESSE DE LA TRAME
   -------------------------------------------------------------------------- */
function dcQuad(x0,y0,x1,y1,couche){
  return {couche:(couche||0), net:"VDD", epaisseur:0.035,
          vertices:[[x0,y0],[x1,y0],[x1,y1],[x0,y1]]};
}

T("trame : elle se deduit de la forme la plus ETROITE, pas de la plus grande",()=>{
  /* CE QUE LE REGLAGE COUTAIT. Une valeur d'usine de 0,2 mm donne DEUX
     carreaux dans une piste de 0,4 -- le mailleur refuse en dessous de
     quatre, et entre les deux la resistance sort de la position de deux
     points au lieu de la geometrie. La regle est donc : quatre carreaux dans
     la plus etroite, et c'est elle qui commande, pas le plan de 40 mm. */
  /* Un plan MODESTE : a huit carreaux dans 0,3 mm, un plan de 40 x 30
     demanderait 857 000 noeuds et le budget elargirait la trame -- ce qui est
     juste, et fait l'objet du cas « elle s'elargit plutot que de faire
     crouler le calcul ». Ici on eprouve la REGLE, pas le garde-fou. */
  const f=simDCFinesse([dcQuad(0,0,10,8),           // un plan modeste
                        dcQuad(0,0,8,0.3)]);        // une piste de 0,3 mm
  if(!f)throw new Error("aucune finesse rendue");
  if(Math.abs(f.mini-0.3)>1e-9)
    throw new Error("la forme la plus etroite vue : "+f.mini);
  if(Math.abs(f.pas-0.3/SIM_DC_CARREAUX_MINI)>1e-9)
    throw new Error("pas "+f.pas+" au lieu de "+(0.3/SIM_DC_CARREAUX_MINI));
  if(f.mini/f.pas<SIM_DC_CARREAUX_MINI-1e-9)
    throw new Error("moins de "+SIM_DC_CARREAUX_MINI+" carreaux dans la "+
                    "piste la plus fine");
});

T("trame : un plan seul n'impose aucune finesse",()=>{
  /* Un plan de cinquante millimetres n'a pas besoin d'etre decoupe finement :
     s'il commandait, le calcul ramperait pour rien. */
  const plan=simDCFinesse([dcQuad(0,0,50,40)]);
  const avec=simDCFinesse([dcQuad(0,0,50,40), dcQuad(0,0,10,0.2)]);
  if(!(plan.pas>avec.pas*5))
    throw new Error("le plan devrait autoriser une trame bien plus large : "+
                    plan.pas+" contre "+avec.pas);
});

T("trame : une decoupe ne compte pas comme une forme etroite",()=>{
  /* Une decoupe RETIRE du cuivre : elle ne porte pas de courant, et sa
     largeur n'a donc rien a imposer. */
  const sans=simDCFinesse([dcQuad(0,0,40,30)]);
  const avecTrou=simDCFinesse([dcQuad(0,0,40,30),
                               Object.assign(dcQuad(5,5,6,5.05),{trou:true})]);
  if(Math.abs(sans.pas-avecTrou.pas)>1e-12)
    throw new Error("une decoupe a resserre la trame : "+avecTrou.pas+
                    " contre "+sans.pas);
  if(avecTrou.trous!==1)throw new Error("les decoupes ne sont pas comptees");
});

T("trame : elle s'elargit plutot que de faire crouler le calcul, et le DIT",()=>{
  /* Quatre carreaux dans une piste de 0,05 mm sur une carte de 100 x 100
     demanderaient des milliards de noeuds. On elargit -- et on previent, parce
     qu'a partir de la les retrecissements les plus fins ne sont plus decrits. */
  const f=simDCFinesse([dcQuad(0,0,100,100), dcQuad(0,0,50,0.05)]);
  const cellules=(100*100)/(f.pas*f.pas);
  if(cellules>SIM_DC_NOEUDS_CIBLE*1.05)
    throw new Error("la trame laisse "+Math.round(cellules)+" carreaux");
  if(!f.note)throw new Error("l'elargissement est silencieux : on croirait "+
                             "la piste fine decrite");
  if(!/n'y re/.test(f.note))throw new Error("la note ne dit pas ce qu'on perd");
});

T("trame : les couches multiplient le cout, et la finesse en tient compte",()=>{
  const une=simDCFinesse([dcQuad(0,0,100,100), dcQuad(0,0,50,0.05)]);
  const six=simDCFinesse([dcQuad(0,0,100,100), dcQuad(0,0,50,0.05),
                          dcQuad(0,0,100,100,1), dcQuad(0,0,100,100,2),
                          dcQuad(0,0,100,100,3), dcQuad(0,0,100,100,4),
                          dcQuad(0,0,100,100,5)]);
  if(!(six.pas>une.pas))
    throw new Error("six couches n'ont pas elargi la trame : "+six.pas+
                    " contre "+une.pas);
  if(six.couches!==6)throw new Error("couches comptees : "+six.couches);
});

T("trame : rien a mailler rend null, pas une valeur inventee",()=>{
  if(simDCFinesse([])!==null)throw new Error("une finesse sans cuivre");
  if(simDCFinesse(null)!==null)throw new Error("une finesse sans polygones");
  if(simDCFinesse([{couche:0,net:"V",vertices:[[0,0],[1,1]]}])!==null)
    throw new Error("une forme a deux sommets a ete maillee");
});

T("trame : le panneau dit ce qu'il a pris, et pourquoi cette finesse",()=>{
  /* On ne peut pas verifier un chiffre dont on ignore l'assiette. Le panneau
     doit donc dire combien de formes, sur combien de couches, et d'ou vient
     la trame -- « 0,075 parce que ta piste la plus fine fait 0,3 » se
     discute, « trame 0,2 » ne se discute pas. */
  const garde=SIM.dcFinesse;
  try{
    SIM.dcFinesse={pas:0.075, mini:0.3, couches:3, formes:128, trous:2,
                   choisi:0.075, impose:false, note:""};
    const h=simDCCuivrePris({pas:0.075, n_noeuds:12000, n_aretes:23000,
                             n_vias:7});
    if(!/128 forme/.test(h))throw new Error("le nombre de formes manque");
    if(!/3 couche/.test(h))throw new Error("le nombre de couches manque");
    if(!/plans compris/.test(h))
      throw new Error("rien ne dit que les plans sont dedans");
    if(!/2 d..?coupe/.test(h))throw new Error("les decoupes ne sont pas dites");
    if(!/0,300 mm/.test(h))
      throw new Error("la forme la plus etroite n'est pas nommee : "+h);
    SIM.dcFinesse.impose=true;
    if(!/impos/.test(simDCCuivrePris({pas:0.5,n_noeuds:1,n_aretes:1,n_vias:0})))
      throw new Error("une trame saisie a la main doit se distinguer");
  }finally{SIM.dcFinesse=garde;}
});

T("panneau : toute analyse du registre REND une chaine",()=>{
  /* LE CONTRAT DU REGISTRE, et ce qu'il en coutait de ne pas le verifier.

     `simRendre` fait `box.innerHTML = a.rendre()`. Une analyse qui ecrit dans
     un <div> a elle et ne rend RIEN pose donc `undefined` dans la zone de
     sortie -- et le mot s'affiche, en toutes lettres, sous le panneau. C'est
     arrive a « Chute DC », et aucun essai ne l'a vu : ils appelaient
     `rendre()` directement, ou la valeur de retour ne gene personne.

     On eprouve donc le CONTRAT, pas l'affichage : chaque analyse, dans chacun
     de ses etats, doit rendre une chaine. */
  const etats=[
    ()=>{SIM.res=null;SIM.err="";SIM.occupe=false;
         SIM.resDC=null;SIM.erreurDC="";SIM.occupeDC=false;},
    ()=>{SIM.err="un refus";SIM.erreurDC="un refus";},
    ()=>{SIM.err="";SIM.erreurDC="";SIM.occupe=true;SIM.occupeDC=true;}
  ];
  const garde={res:SIM.res,err:SIM.err,occupe:SIM.occupe,
               resDC:SIM.resDC,erreurDC:SIM.erreurDC,occupeDC:SIM.occupeDC};
  try{
    for(const cle of Object.keys(SIM_ANALYSES)){
      const a=SIM_ANALYSES[cle];
      if(!a.rendre)continue;
      for(let k=0;k<etats.length;k++){
        etats[k]();
        const sortie=a.rendre();
        if(typeof sortie!=="string")
          throw new Error("l'analyse « "+cle+" » rend "+
                          (sortie===undefined?"undefined":typeof sortie)+
                          " dans l'etat "+k+" : « undefined » s'afficherait "+
                          "sous le panneau");
      }
    }
  }finally{Object.assign(SIM,garde);}
});

T("panneau : la chute DC n'ecrit plus dans un div a elle",()=>{
  /* Le corps du panneau ne doit plus porter de zone de resultat : la sortie
     est celle du registre, une seule pour toutes les analyses. En laisser une
     seconde ferait deux endroits ou lire la meme chose, qui divergeraient. */
  if(simCorpsDC().indexOf('id="simDCResultat"')>=0)
    throw new Error("le corps porte encore sa propre zone de resultat");
  const src=simRendreDC.toString();
  if(/\bsimDCResultat\b/.test(src))
    throw new Error("simRendreDC ecrit encore dans son div");
});

T("chute DC : tout ce que le panneau cable existe dans son HTML",()=>{
  /* LE DEFAUT QUE CE CAS GARDE, et il est de ceux qui ne se voient jamais en
     relisant : `simBrancherDC` accroche ses gestionnaires par identifiant. Un
     champ renomme dans `simCorpsDC` et pas dans `simBrancherDC` ne produit ni
     erreur ni message -- juste un bouton qui ne fait rien. On verifie donc que
     CHAQUE identifiant cherche par le cablage est bel et bien pose par le
     corps du panneau.

     Le controle est statique : il lit le texte des deux fonctions. C'est
     grossier, et c'est ce qui le rend possible sans navigateur. */
  const corps=simCorpsDC();
  /* `simDCLancer` EN FAIT PARTIE, et c'est ce qui manquait. Elle lisait encore
     `simDCI` et `simDCU`, deux champs disparus du panneau le jour ou les
     bornes sont devenues une liste. `parseFloat(undefined)` rend NaN, donc le
     bouton « Calculer » refusait TOUJOURS -- et rien ne l'a vu, parce que ce
     controle ne lisait que le cablage et l'affichage, jamais le lancement. */
  const src=[simBrancherDC,simRendreDC,simDCLancer,simRendreBornes]
              .map(f=>f.toString()).join("\n");
  const cherches=new Set();
  const re=/simEl\("([A-Za-z0-9_]+)"\)/g;
  let m;
  while((m=re.exec(src)))cherches.add(m[1]);
  if(cherches.size<5)
    throw new Error("le controle ne trouve presque rien a verifier ("+
                    cherches.size+" identifiant(s)) : il ne mesure plus rien");
  const manquants=[...cherches].filter(id=>corps.indexOf('id="'+id+'"')<0);
  if(manquants.length)
    throw new Error("cable mais jamais pose dans le panneau : "+
                    manquants.join(", "));
});

T("chute DC : une borne neuve arrive avec une valeur utilisable",()=>{
  /* Un champ vide au premier calcul, c'est un refus au premier clic. Une
     source neuve porte donc 3,3 V et une charge un ampere -- de quoi calculer
     tout de suite, quitte a corriger ensuite. */
  const c=dcCarte();
  const qa=padsWorld(c.a)[0], qb=padsWorld(c.b)[0];
  dcBorne("source",qa.x,qa.y);
  dcBorne("charge",qb.x,qb.y);
  const B=SIM_PCB.dcBornes();
  if(B[0].valeur!==3.3)throw new Error("source a "+B[0].valeur+" V");
  if(B[1].valeur!==1)throw new Error("charge a "+B[1].valeur+" A");
  if(simBrancherDC.toString().indexOf("simDCPas")<0)
    throw new Error("la trame ne recoit pas de valeur d'usine");
});

/* --------------------------------------------------------------------------
   LA CARTE DE POTENTIEL
   -------------------------------------------------------------------------- */
/* Un canevas hors ecran minimal : le DOM du banc n'en fournit pas de vrai, et
   ce qu'on verifie ici n'est pas le rendu mais CE QUI EST ECRIT DEDANS. */
function dcToile(){
  return (w,h)=>{
    const px=new Uint8ClampedArray(w*h*4);
    return {width:w, height:h, _px:px,
            getContext:()=>({
              createImageData:(a,b)=>({width:a,height:b,
                                       data:new Uint8ClampedArray(a*b*4)}),
              putImageData:img=>{px.set(img.data);}
            })};
  };
}
/* Le pixel (ix,iy) d'une image construite. */
function dcPixel(e,ix,iy){
  const px=e.canvas._px, nx=e.canvas.width, o=(iy*nx+ix)*4;
  return [px[o],px[o+1],px[o+2],px[o+3]];
}

T("carte DC : la rampe part du cyan et finit a l'ambre, sans rouge d'erreur",()=>{
  const bas=simDCCouleur(0), haut=simDCCouleur(1);
  if(bas.join()!==SIM_DC_RAMPE[0].join())throw new Error("bas : "+bas);
  if(haut.join()!==SIM_DC_RAMPE[SIM_DC_RAMPE.length-1].join())
    throw new Error("haut : "+haut);
  /* LE ROUGE DU DRC EST #e8443a = 232,68,58. La carte d'impedance s'y confond
     deja (voir A-FAIRE.md) ; celle-ci ne doit pas s'y ajouter. */
  for(let k=0;k<=20;k++){
    const c=simDCCouleur(k/20);
    if(Math.abs(c[0]-232)<24&&Math.abs(c[1]-68)<24&&Math.abs(c[2]-58)<24)
      throw new Error("la rampe passe par le rouge du DRC en t="+(k/20)+
                      " : "+c);
  }
  /* Et elle doit etre MONOTONE en clair/fonce percu, sinon deux potentiels
     differents se peignent pareil. */
  let prec=-Infinity;
  for(let k=0;k<=20;k++){
    const c=simDCCouleur(k/20);
    const cle=c[0]-c[2];                 // du cyan (negatif) vers l'ambre
    if(cle<=prec)throw new Error("rampe non monotone en t="+(k/20));
    prec=cle;
  }
});

T("carte DC : un noeud, un pixel — et rien hors du cuivre",()=>{
  /* CE QUE CE CAS GARDE. Le serveur rend aussi une grille interpolee au plus
     proche, qui couvre la BOITE ENGLOBANTE : hors du cuivre elle porte le
     potentiel du noeud le plus proche. La peindre etalerait de la couleur sur
     du vide -- une chute affichee la ou il n'y a pas de conducteur. On peint
     donc les NOEUDS, et ce cas verifie qu'un carreau sans noeud reste
     TRANSPARENT. */
  const res={pas:1, potentiel:[0, 1, 2],
             noeuds:[[0,0,0],[2,0,0],[2,2,0]]};   // un L : (1,1) est vide
  const im=simDCConstruireImages(res,dcToile(),"potentiel");
  if(!im)throw new Error("aucune image construite");
  const e=im.images.get(0);
  if(!e)throw new Error("pas d'image pour la couche 0");
  if(e.canvas.width!==3||e.canvas.height!==3)
    throw new Error("taille "+e.canvas.width+"x"+e.canvas.height+
                    " au lieu de 3x3");
  /* L'ORIENTATION, ET C'EST LE CONTRAT DE `drawImage` QUI LA FIXE :
     `drawImage(img, x0, y0, w, h)` pose la LIGNE 0 de l'image au y MINIMUM de
     la destination. La ligne 0 porte donc le monde en y0, exactement comme la
     colonne 0 porte le monde en x0 — aucun miroir, dans aucun des deux sens. */
  if(dcPixel(e,0,0)[3]!==255)throw new Error("le noeud (0,0) n'est pas peint");
  if(dcPixel(e,2,0)[3]!==255)throw new Error("le noeud (2,0) n'est pas peint");
  if(dcPixel(e,2,2)[3]!==255)throw new Error("le noeud (2,2) n'est pas peint");
  if(dcPixel(e,1,1)[3]!==0)
    throw new Error("un carreau SANS cuivre a ete peint : la carte invente "+
                    "une chute la ou il n'y a pas de conducteur");
});

T("carte DC : la carte n'est PAS en miroir — ni en y, ni en x",()=>{
  /* LE DEFAUT QUE CE CAS GARDE, et il s'est vu a l'ecran avant de se voir
     ici. La premiere version retournait l'image « parce que l'ecran a son y
     vers le bas ». C'est vrai de l'ECRAN, pas de la DESTINATION : on dessine
     en coordonnees MONDE, et la transformation du canevas s'occupe du reste.

     Retourner ici, c'etait retourner DEUX fois cote visionneuse -- dont la
     transformation est `setTransform(s,0,0,-s,...)`, y inverse -- et ZERO fois
     cote editeur, dont la transformation est `(s,0,0,s,...)`. La carte sortait
     en miroir des deux cotes, et un defaut d'alimentation se lisait a l'oppose
     de la ou il est.

     L'epreuve est ASYMETRIQUE dans les deux axes : un motif symetrique
     passerait un miroir sans broncher, et c'est precisement ce qui avait
     laisse ce defaut vivre. */
  const res={pas:1, potentiel:[0, 1, 2, 3],
             noeuds:[[0,0,0],[1,0,0],[2,0,0],   // une rangee en bas
                     [0,1,0]]};                  // un seul carreau au-dessus, a GAUCHE
  const e=simDCConstruireImages(res,dcToile(),"potentiel").images.get(0);
  if(e.canvas.width!==3||e.canvas.height!==2)
    throw new Error("taille "+e.canvas.width+"x"+e.canvas.height);
  /* La rangee du monde en y = 0 doit etre la LIGNE 0 de l'image. */
  for(let ix=0;ix<3;ix++)
    if(dcPixel(e,ix,0)[3]!==255)
      throw new Error("la rangee du monde en y=0 n'est pas la ligne 0 : "+
                      "la carte est en miroir vertical");
  /* Et le carreau isole du monde en (0,1) doit etre en HAUT A GAUCHE de
     l'image -- (0,1) --, pas en haut a droite ni en bas. */
  if(dcPixel(e,0,1)[3]!==255)
    throw new Error("le carreau du monde en (0,1) n'est pas a l'image en (0,1)");
  if(dcPixel(e,2,1)[3]!==0)
    throw new Error("un carreau est peint en (2,1) : miroir horizontal");
  /* LES COINS DU RECTANGLE DE DESTINATION suivent la meme regle : x0 et y0
     sont les MINIMUMS du monde, decales d'un demi-carreau puisque le noeud est
     au CENTRE du sien. */
  if(Math.abs(e.x0-(-0.5))>1e-9||Math.abs(e.y0-(-0.5))>1e-9)
    throw new Error("origine du rectangle : "+e.x0+" ; "+e.y0);
  if(Math.abs(e.w-3)>1e-9||Math.abs(e.h-2)>1e-9)
    throw new Error("taille du rectangle : "+e.w+" x "+e.h);
});

T("carte DC : la couleur suit le potentiel, pas le rang du noeud",()=>{
  const res={pas:1, potentiel:[0, 0.5, 1],
             noeuds:[[0,0,0],[1,0,0],[2,0,0]]};
  const e=simDCConstruireImages(res,dcToile(),"potentiel").images.get(0);
  const a=dcPixel(e,0,0), b=dcPixel(e,1,0), c=dcPixel(e,2,0);
  const bas=simDCCouleur(0), mid=simDCCouleur(0.5), haut=simDCCouleur(1);
  if(a.slice(0,3).join()!==bas.join())throw new Error("min : "+a);
  if(b.slice(0,3).join()!==mid.join())throw new Error("milieu : "+b);
  if(c.slice(0,3).join()!==haut.join())throw new Error("max : "+c);
});

T("carte DC : chaque couche a son image, jamais melangees",()=>{
  const res={pas:1, potentiel:[0, 1],
             noeuds:[[0,0,0],[0,0,3]]};
  const im=simDCConstruireImages(res,dcToile(),"potentiel");
  if(im.images.size!==2)
    throw new Error(im.images.size+" image(s) pour deux couches : deux "+
                    "potentiels peints l'un sur l'autre");
  if(!im.images.get(0)||!im.images.get(3))
    throw new Error("les couches ne sont pas celles du resultat");
});

T("carte DC : l'echelle NORMALISE sur tout le resultat, pas par couche",()=>{
  /* Deux couches a des potentiels tres differents doivent se comparer d'un
     coup d'oeil. Normaliser couche par couche donnerait a chacune toute la
     rampe, et la couche tranquille aurait l'air aussi chargee que l'autre. */
  const res={pas:1, potentiel:[0, 0.01, 0, 1],
             noeuds:[[0,0,0],[1,0,0],[0,0,3],[1,0,3]]};
  const im=simDCConstruireImages(res,dcToile(),"potentiel");
  const c0=dcPixel(im.images.get(0),1,0).slice(0,3);
  const c3=dcPixel(im.images.get(3),1,0).slice(0,3);
  if(c0.join()===c3.join())
    throw new Error("0,01 V et 1 V peints de la meme couleur");
  if(c0.join()!==simDCCouleur(0.01).join())
    throw new Error("la couche tranquille n'est pas a sa place sur la rampe");
});

T("carte DC : sans canevas, on ne peint pas — on ne casse pas",()=>{
  const res={pas:1, potentiel:[0,1], noeuds:[[0,0,0],[1,0,0]]};
  if(simDCConstruireImages(res,()=>null,"potentiel")!==null)
    throw new Error("une image a ete rendue sans canevas");
  if(simDCConstruireImages(null,dcToile(),"potentiel")!==null)
    throw new Error("une image a ete rendue sans resultat");
  if(simDCConstruireImages({pas:1,potentiel:[0],noeuds:[]},dcToile(),
                            "potentiel")!==null)
    throw new Error("une image a ete rendue sans noeud");
  /* Un potentiel qui ne correspond pas aux noeuds est une incoherence : on
     refuse plutot que de peindre un decalage. */
  if(simDCConstruireImages({pas:1,potentiel:[0],
                            noeuds:[[0,0,0],[1,0,0]]},dcToile(),
                           "potentiel")!==null)
    throw new Error("un potentiel plus court que les noeuds a ete peint");
});

T("carte DC : les trois grandeurs se peignent, et la liste les propose",()=>{
  /* LA CHUTE NE DIT PAS TOUT : une piste peut tenir sa chute et fondre quand
     meme. Les trois grandeurs arrivent ensemble du serveur, et en changer ne
     doit rien relancer -- seulement refaire une image. */
  const cles=SIM_DC_GRANDEURS.map(g=>g.cle).sort().join(",");
  if(cles!=="densite,echauffement,potentiel")
    throw new Error("grandeurs : "+cles);
  const html=simCarteDCListe();
  for(const g of SIM_DC_GRANDEURS)
    if(html.indexOf('value="'+g.cle+'"')<0)
      throw new Error(g.cle+" n'est pas dans la liste");
  const res={pas:1, noeuds:[[0,0,0],[1,0,0]],
             potentiel:[0,1], densite:[5,50], echauffement:[2,40]};
  for(const g of SIM_DC_GRANDEURS){
    const im=simDCConstruireImages(res,dcToile(),g.cle);
    if(!im)throw new Error("aucune image pour "+g.cle);
    if(im.quoi!==g.cle)throw new Error("image marquee "+im.quoi);
    if(im.vmin!==res[g.cle][0]||im.vmax!==res[g.cle][1])
      throw new Error(g.cle+" : echelle "+im.vmin+".."+im.vmax);
  }
});

T("carte DC : l'echauffement est la grandeur peinte d'office",()=>{
  /* C'EST LE CHIFFRE QUI DECIDE. La densite de pointe est singuliere a un
     angle vif -- elle dit ou regarder, pas combien --, et le potentiel se lit
     deja dans le tableau des nets. Celui qu'on veut voir sur la carte, c'est
     celui sur lequel on elargit une piste. */
  if(simDCGrandeur().cle!=="echauffement")
    throw new Error("grandeur d'office : "+simDCGrandeur().cle);
  if(SIM_DC_GRANDEURS[0].cle!=="echauffement")
    throw new Error("la liste ne commence pas par l'echauffement");
});

T("carte DC : chaque grandeur porte son unite et son avertissement",()=>{
  /* Un nombre sans unite ne se lit pas, et « 129 A/mm2 » sans savoir que le
     pic est singulier se lit comme un fait. */
  for(const g of SIM_DC_GRANDEURS){
    if(!g.unite)throw new Error(g.cle+" n'a pas d'unite");
    if(!g.aide||g.aide.length<40)throw new Error(g.cle+" n'a pas d'aide");
  }
  const d=SIM_DC_GRANDEURS.find(g=>g.cle==="densite");
  if(!/maillage|singuli/.test(d.aide))
    throw new Error("la densite ne previent pas de sa singularite : "+d.aide);
});

T("carte DC : le tableau du pire point nomme le modele thermique",()=>{
  const res={pire_par_net:{VDD:{densite:42.9, largeur:2, echauffement:5.34,
                                largeur_chaude:2,
                                echauffement_en:[21,1,0],
                                densite_en:[21,1,0]}},
             modele_thermique:"IPC-2221 … IPC-2152 lui a succédé",
             couches_externes:[0]};
  const h=simTableauPire(res);
  if(!/5,34 K/.test(h))throw new Error("l'echauffement manque : "+h);
  if(!/42,9 A\/mm²/.test(h))throw new Error("la densite manque");
  if(!/IPC-2221/.test(h))throw new Error("le modele thermique n'est pas nomme");
  if(!/couche/i.test(h))throw new Error("les couches exterieures ne sont pas dites");
  /* Rien a dire quand il n'y a rien : un tableau vide vaut mieux qu'un
     tableau d'en-tetes. */
  if(simTableauPire({})!=="")throw new Error("un tableau sans donnee");
});

/* --------------------------------------------------------------------------
   LA SONDE : LA VALEUR SOUS LE CURSEUR
   -------------------------------------------------------------------------- */
/* Un resultat de laboratoire : quatre carreaux d'un millimetre, en L, sur deux
   couches. Les valeurs sont choisies pour se reconnaitre du premier coup. */
function dcResSonde(){
  return {pas:1,
          noeuds:[[10,10,0],[11,10,0],[12,10,0],[10,11,0],[10,10,3]],
          potentiel:[3.3, 3.2, 3.1, 3.0, 2.9],
          densite:  [ 10,  20,  30,  40,  50],
          echauffement:[1, 2, 3, 4, 5]};
}
function dcSondeArmer(quoi){
  SIM.resDC=dcResSonde();
  SIM.dcIndex=simDCIndexer(SIM.resDC);
  SIM.dcImages={images:new Map([[0,{}],[3,{}]]), vmin:0, vmax:1,
                quoi:(quoi||"echauffement")};
  SIM.dcQuoi=quoi||"echauffement";
  SIM.ouvert=true; SIM.analyse="dc"; SIM.dcSonde=null;
}

T("sonde : elle lit le RESULTAT, pas la couleur du pixel",()=>{
  /* Repasser par l'image ferait relire une couleur pour en rededuire un
     nombre -- deux conversions, deux arrondis, et une valeur qui ne serait
     plus celle du solveur. On va chercher le NOEUD. */
  const garde=[SIM.resDC,SIM.dcIndex,SIM.dcImages,SIM.dcQuoi,SIM.ouvert,
               SIM.analyse,SIM.dcSonde];
  try{
    dcSondeArmer("densite");
    const lu=simDCLireEn(11,10,0);
    if(!lu)throw new Error("rien lu sur un carreau qui existe");
    if(lu.valeur!==20)throw new Error("valeur "+lu.valeur+" au lieu de 20");
    if(!/20,0 A\/mm²/.test(lu.texte))throw new Error("texte : "+lu.texte);
    /* Et la position rendue est celle du NOEUD, pas celle du curseur : c'est
       elle qui place le point sous l'etiquette. */
    if(lu.x!==11||lu.y!==10)throw new Error("position : "+lu.x+" ; "+lu.y);
  }finally{[SIM.resDC,SIM.dcIndex,SIM.dcImages,SIM.dcQuoi,SIM.ouvert,
            SIM.analyse,SIM.dcSonde]=garde;}
});

T("sonde : hors du cuivre elle ne rend RIEN, pas un zero",()=>{
  /* Un zero se lirait comme une mesure. Et rendre la valeur du voisin le plus
     proche, c'est exactement ce qu'on a refuse de peindre. */
  const garde=[SIM.resDC,SIM.dcIndex,SIM.dcImages,SIM.ouvert,SIM.analyse,
               SIM.dcSonde];
  try{
    dcSondeArmer();
    if(simDCLireEn(11,11,0)!==null)
      throw new Error("une valeur rendue sur un carreau VIDE du L");
    if(simDCLireEn(40,40,0)!==null)
      throw new Error("une valeur rendue loin de tout cuivre");
  }finally{[SIM.resDC,SIM.dcIndex,SIM.dcImages,SIM.ouvert,SIM.analyse,
            SIM.dcSonde]=garde;}
});

T("sonde : elle ne confond pas deux couches au meme endroit",()=>{
  /* (10,10) porte du cuivre sur la couche 0 ET sur la couche 3, a des
     potentiels differents. Les melanger ferait lire la mauvaise. */
  const garde=[SIM.resDC,SIM.dcIndex,SIM.dcImages,SIM.dcQuoi,SIM.ouvert,
               SIM.analyse,SIM.dcSonde];
  try{
    dcSondeArmer("potentiel");
    const a=simDCLireEn(10,10,0), b=simDCLireEn(10,10,3);
    if(!a||!b)throw new Error("une des deux couches ne rend rien");
    if(a.valeur===b.valeur)
      throw new Error("les deux couches rendent la meme valeur");
    if(a.valeur!==3.3||b.valeur!==2.9)
      throw new Error("valeurs : "+a.valeur+" et "+b.valeur);
    if(simDCLireEn(10,10,1)!==null)
      throw new Error("une couche sans cuivre rend une valeur");
  }finally{[SIM.resDC,SIM.dcIndex,SIM.dcImages,SIM.dcQuoi,SIM.ouvert,
            SIM.analyse,SIM.dcSonde]=garde;}
});

T("sonde : elle suit la grandeur choisie sur la carte",()=>{
  const garde=[SIM.resDC,SIM.dcIndex,SIM.dcImages,SIM.dcQuoi,SIM.ouvert,
               SIM.analyse,SIM.dcSonde];
  try{
    for(const [quoi,attendu,unite] of [["echauffement",3,"K"],
                                       ["densite",30,"A/mm²"],
                                       ["potentiel",3.1,"mV"]]){
      dcSondeArmer(quoi);
      const lu=simDCLireEn(12,10,0);
      if(lu.valeur!==attendu)
        throw new Error(quoi+" : "+lu.valeur+" au lieu de "+attendu);
      if(lu.texte.indexOf(unite)<0)
        throw new Error(quoi+" : « "+lu.texte+" » n'est pas en "+unite);
    }
    /* Le potentiel s'ecrit en MILLIVOLTS : 3,1 V doit donner 3100 mV, pas
       « 3,10 ». Le facteur de la grandeur doit etre applique. */
    dcSondeArmer("potentiel");
    if(!/3100,00 mV/.test(simDCLireEn(12,10,0).texte))
      throw new Error("le facteur d'unite n'est pas applique : "+
                      simDCLireEn(12,10,0).texte);
  }finally{[SIM.resDC,SIM.dcIndex,SIM.dcImages,SIM.dcQuoi,SIM.ouvert,
            SIM.analyse,SIM.dcSonde]=garde;}
});

T("sonde : elle ne redessine QUE si l'on change de carreau",()=>{
  /* Un survol qui redessine a chaque pixel rend la carte inutilisable sur une
     grande selection. `simDCSurvol` rend donc vrai UNIQUEMENT quand ce qui
     est affiche a change. */
  const garde=[SIM.resDC,SIM.dcIndex,SIM.dcImages,SIM.ouvert,SIM.analyse,
               SIM.dcSonde];
  try{
    dcSondeArmer();
    if(!simDCSurvol(10,10,0))throw new Error("le premier survol ne dit rien");
    if(simDCSurvol(10.2,10.1,0))
      throw new Error("bouger DANS le meme carreau demande un redessin");
    if(!simDCSurvol(11,10,0))
      throw new Error("changer de carreau ne demande pas de redessin");
    if(!simDCSurvol(40,40,0))
      throw new Error("sortir du cuivre doit effacer l'etiquette");
    if(SIM.dcSonde)throw new Error("l'etiquette survit hors du cuivre");
    if(simDCSurvol(41,41,0))
      throw new Error("rester hors du cuivre demande un redessin");
  }finally{[SIM.resDC,SIM.dcIndex,SIM.dcImages,SIM.ouvert,SIM.analyse,
            SIM.dcSonde]=garde;}
});

T("sonde : sans carte affichee, elle se tait",()=>{
  /* L'onglet Impedance ne doit pas voir passer d'etiquette de chute DC, et un
     panneau ferme non plus. */
  const garde=[SIM.resDC,SIM.dcIndex,SIM.dcImages,SIM.ouvert,SIM.analyse,
               SIM.dcSonde];
  try{
    dcSondeArmer();
    simDCSurvol(10,10,0);
    if(!SIM.dcSonde)throw new Error("rien sous le curseur");
    SIM.analyse="impedance";
    if(!simDCSurvol(11,10,0))
      throw new Error("passer sur un autre onglet doit effacer l'etiquette");
    if(SIM.dcSonde)throw new Error("l'etiquette survit a l'onglet Impedance");
  }finally{[SIM.resDC,SIM.dcIndex,SIM.dcImages,SIM.ouvert,SIM.analyse,
            SIM.dcSonde]=garde;}
});

T("sonde : l'index se bat une fois, et refuse ce qu'il ne peut pas indexer",()=>{
  if(simDCIndexer(null)!==null)throw new Error("un index sans resultat");
  if(simDCIndexer({noeuds:[]})!==null)throw new Error("un index sans noeud");
  const ix=simDCIndexer(dcResSonde());
  if(ix.table.size!==5)throw new Error("noeuds indexes : "+ix.table.size);
  if(ix.pas!==1)throw new Error("pas : "+ix.pas);
  /* L'ancre est le MINIMUM des noeuds, pas l'origine du monde : une selection
     loin de l'origine s'indexe comme une autre. */
  if(ix.xmin!==10||ix.ymin!==10)
    throw new Error("ancre : "+ix.xmin+" ; "+ix.ymin);
});

T("carte DC : rien n'est peint tant que l'onglet DC n'est pas ouvert",()=>{
  const ouvert=SIM.ouvert, analyse=SIM.analyse, res=SIM.resDC, im=SIM.dcImages;
  try{
    SIM.resDC={}; SIM.dcImages={images:new Map()};
    SIM.ouvert=true; SIM.analyse="impedance";
    if(simDCActif())throw new Error("la carte DC peint sous l'onglet Impedance");
    SIM.analyse="dc";
    if(!simDCActif())throw new Error("la carte DC ne peint pas sous son onglet");
    SIM.ouvert=false;
    if(simDCActif())throw new Error("la carte DC peint panneau ferme");
  }finally{
    SIM.ouvert=ouvert;SIM.analyse=analyse;SIM.resDC=res;SIM.dcImages=im;
  }
});

T("chute DC : une pastille effacee disparait du panneau",()=>{
  const c=dcCarte();
  const qa=padsWorld(c.a)[0];
  dcBorne("source",qa.x,qa.y);
  if(!SIM_PCB.dcBornes().length)throw new Error("borne non posee");
  S.fps=S.fps.filter(f=>f!==c.a);touch();
  if(SIM_PCB.dcBornes().length)
    throw new Error("la borne survit a la pastille qui la portait");
});


/* --------------------------------------------------------------------------
   LES LOTS : PLUSIEURS MORCEAUX SÉLECTIONNÉS, UN RÉSULTAT CHACUN
   --------------------------------------------------------------------------
   LE CAS QUI L'A DEMANDÉ. Une ligne RF de 50 Ω coupée par trois condensateurs
   de liaison n'est pas un net mais quatre, bout à bout. Ctrl+clic prenait déjà
   les quatre morceaux — la sélection de l'éditeur est additive depuis toujours
   — mais ils partaient dans un SEUL document, où le serveur voyait une liaison
   rompue et refusait la cascade. À juste titre : entre deux morceaux il y a un
   boîtier, dont ce panneau ne sait rien. On les envoie donc séparément.

   CE QU'ON ÉPROUVE : que ce qui se touche reste ensemble, que ce qui ne se
   touche pas se sépare, et que chaque document ne porte que SES tronçons.
   -------------------------------------------------------------------------- */

/* Une ligne coupée en trois par deux condensateurs : trois nets, trois
   morceaux de 10 mm, séparés de 2 mm. */
function simLigneCoupee(){
  carte4c();
  S.cuts=[]; S.vias=[];
  clearSel();
  const t=[];
  [["RF1",10,20],["RF2",22,32],["RF3",34,44]].forEach(function(d){
    const p={l:0, net:d[0], w:SIM_W, x1:d[1], y1:SIM_Y, x2:d[2], y2:SIM_Y};
    S.tracks.push(p); S.sel.tracks.add(p); t.push(p);
  });
  SIM.refCle=null; SIM.refAuto=true; SIM.ref=null;
  touch();
  return t;
}

T("ce qui ne se touche pas fait un lot chacun ; ce qui se touche, un seul lot",()=>{
  const t=simLigneCoupee();
  let lots=simLotsDeTracks(t);
  if(lots.length!==3)throw new Error("trois lots attendus, "+lots.length);
  if(lots.map(l=>l[0].net).join(",")!=="RF1,RF2,RF3")
    throw new Error("les lots suivent l'ordre de la sélection : "+
                    lots.map(l=>l[0].net).join(","));

  /* DEUX TRONÇONS BOUT À BOUT DU MÊME NET : un seul parcours, donc un seul lot.
     C'est ce qui garde intact le geste ordinaire — Maj+clic sur une piste de
     cinquante segments ne doit pas partir en cinquante requêtes. */
  carte4c(); S.cuts=[]; S.vias=[]; clearSel();
  const a={l:0, net:"N$1", w:SIM_W, x1:10, y1:SIM_Y, x2:20, y2:SIM_Y};
  const b={l:0, net:"N$1", w:SIM_W, x1:20, y1:SIM_Y, x2:30, y2:SIM_Y};
  for(const p of [a,b]){S.tracks.push(p);S.sel.tracks.add(p);}
  touch();
  lots=simLotsDeTracks([a,b]);
  if(lots.length!==1)throw new Error("un seul lot attendu, "+lots.length);

  /* MÊME POINT, NETS DIFFÉRENTS : deux lots. Deux pistes de nets distincts qui
     se rejoignent au même XY ne sont pas la même liaison — c'est le cas d'une
     piste qui passe au ras d'une pastille voisine. */
  b.net="N$2"; touch();
  lots=simLotsDeTracks([a,b]);
  if(lots.length!==2)
    throw new Error("nets différents au même point : deux lots, pas "+
                    lots.length);
});

T("un lot par morceau, et chaque document ne porte que ses tronçons",()=>{
  simLigneCoupee();
  const r=SIM_PCB.problemes(simSaisie());
  if(r.erreur)throw new Error("refus inattendu : "+r.erreur);
  if(r.lots.length!==3)throw new Error("trois lots attendus, "+r.lots.length);
  if(r.lots.map(p=>p.doc.net).join(",")!=="RF1,RF2,RF3")
    throw new Error("nets des lots : "+r.lots.map(p=>p.doc.net).join(","));
  for(const p of r.lots){
    const o=p.doc.geometry.objects;
    if(o.length!==1)
      throw new Error("un tronçon par lot, "+o.length+" pour "+p.doc.net);
    if(Math.abs(o[0].length-10)>1e-6)
      throw new Error("longueur "+o[0].length+" au lieu de 10");
    if(o[0].net!==p.doc.net)
      throw new Error("le tronçon d'un lot appartient à son net");
    if(!p.titre||p.titre.indexOf(p.doc.net)<0)
      throw new Error("le titre du lot doit nommer son net : "+p.titre);
  }
});

T("une liaison continue reste un seul lot, et le document est celui d'avant",()=>{
  /* LA NON-RÉGRESSION QUI COMPTE : trois tronçons colinéaires du même net —
     le geste de tous les jours — doivent rendre UN lot, et le même document
     que `probleme` rendait avant les lots. */
  simCarteDesordre(false);
  const r=SIM_PCB.problemes(simSaisie());
  if(r.erreur)throw new Error("refus inattendu : "+r.erreur);
  if(r.lots.length!==1)throw new Error("un seul lot attendu, "+r.lots.length);
  const seul=SIM_PCB.probleme(simSaisie());
  const a=JSON.stringify(r.lots[0].doc.geometry.objects);
  const b=JSON.stringify(seul.doc.geometry.objects);
  if(a!==b)throw new Error("les deux chemins doivent rendre le même document");
});

T("au-delà du plafond, tout part dans un seul document — et la note le dit",()=>{
  /* AUCUN PLAFOND SILENCIEUX. Un Ctrl+A sur une carte entière ne doit pas
     devenir dix-sept allers-retours au serveur : on retombe sur le
     comportement d'avant, en disant que la comparaison n'a pas eu lieu. */
  carte4c(); S.cuts=[]; S.vias=[]; clearSel();
  for(let i=0;i<SIM_LOTS_MAX+1;i++){
    const p={l:0, net:"RF"+i, w:SIM_W,
             x1:2+i*3, y1:SIM_Y, x2:4+i*3, y2:SIM_Y};
    S.tracks.push(p); S.sel.tracks.add(p);
  }
  touch();
  const r=SIM_PCB.problemes(simSaisie());
  if(r.erreur)throw new Error("refus inattendu : "+r.erreur);
  if(r.lots.length!==1)
    throw new Error("un seul document attendu au-delà du plafond, "+
                    r.lots.length);
  if(!r.lots[0].notes.some(n=>/morceaux qui ne se touchent pas/.test(n)))
    throw new Error("la note manque : "+JSON.stringify(r.lots[0].notes));
  if(r.lots[0].doc.geometry.objects.length!==SIM_LOTS_MAX+1)
    throw new Error("le document unique porte tous les tronçons, "+
                    r.lots[0].doc.geometry.objects.length);
});

T("chaque lot chaîne ses propres tronçons, sans regarder ceux du voisin",()=>{
  /* CE QUI SERAIT FAUX SANS LE DÉCOUPAGE : `simChainerPcb` cherche un bout
     LIBRE pour partir, et sur une sélection en trois morceaux il en trouve six.
     La marche s'arrêtait au premier morceau et les deux autres repartaient dans
     l'ordre du document, en « orphelines » — donc sans via accroché et sans
     cascade. Un lot par morceau, et chaque marche retrouve un parcours. */
  const t=simLigneCoupee();
  for(const p of simLotsDeTracks(t)){
    simChainerPcb(p);
    if(SIM_CHAINE_PCB.orphelines)
      throw new Error("un lot d'un seul parcours ne laisse pas d'orpheline : "+
                      SIM_CHAINE_PCB.orphelines);
    if(SIM_CHAINE_PCB.arrets.length)
      throw new Error("un lot d'un seul parcours ne se ramifie pas");
  }
});

/* --------------------------------------------------------------------------
   LE VOISINAGE — CE QUI PART POUR LA DIAPHONIE ET LA Z DIFFÉRENTIELLE
   --------------------------------------------------------------------------
   L'AGRESSEUR N'EST JAMAIS DANS LA SÉLECTION, et l'autre moitié d'une paire
   non plus : sans ce que la page joint au document, les deux onglets n'ont
   rien à calculer. Ce que ces cas verrouillent est le CONTRAT, pas la
   physique — le serveur apparie et chiffre, le banc de `python/test` le
   mesure. Ici : ce qui part, ce qui ne part pas, et sous quel format.
   -------------------------------------------------------------------------- */

/* La piste d'essai, plus une voisine parallèle à `dy` millimètres d'axe. */
function simCarteVoisine(dy,net,couche){
  const t=simCarte();
  S.tracks.push({l:(couche==null?0:couche), net:net||"AGR", w:SIM_W,
                 x1:SIM_X1, y1:SIM_Y+dy, x2:SIM_X2, y2:SIM_Y+dy});
  touch();
  return t;
}

T("le cuivre qui longe la sélection part avec le problème",()=>{
  simCarteVoisine(0.65);
  const v=simVoisinagePcb();
  if(v.length!==1)
    throw new Error(v.length+" tronçon(s) de voisinage au lieu de 1");
  const o=v[0];
  if(o.net!=="AGR")throw new Error("net « "+o.net+" »");
  if(o.layer!==0)throw new Error("couche "+o.layer);
  if(Math.abs(o.width-SIM_W)>1e-9)throw new Error("largeur "+o.width);
  if(!(o.copper_thickness>0))
    throw new Error("le voisinage part sans épaisseur de cuivre");
  if(Math.abs(o.start[1]-(SIM_Y+0.65))>1e-6)
    throw new Error("la voisine est envoyée en y="+o.start[1]);
  /* ET IL ATTEINT LE DOCUMENT, avec les paires déclarées et le temps de
     montée : c'est ce que le serveur lit, et rien d'autre. */
  const d=SIM_PCB.probleme(simSaisie()).doc;
  if(!d.voisinage||d.voisinage.length!==1)
    throw new Error("le document n'emporte pas le voisinage : "+
                    JSON.stringify(d.voisinage));
  if(!("paires" in d))throw new Error("le document ne porte pas les paires");
  if(!("temps_montee" in d.analyse))
    throw new Error("l'analyse ne porte pas le temps de montée");
});

T("ce qui ne peut pas longer ne part pas",()=>{
  /* TROIS EXCLUSIONS, et elles sont toutes les trois du ressort de la page :
     la sélection elle-même — un conducteur ne s'agresse pas —, une autre
     couche de cuivre, et ce qui est hors de portée. Le reste (parallélisme,
     recouvrement, écart exact) est au serveur, qui le fait pour les deux
     outils à la fois. */
  simCarteVoisine(40.0);                       /* bien au-delà des 3 mm */
  if(simVoisinagePcb().length)
    throw new Error("une piste à 40 mm est envoyée comme voisine");

  simCarteVoisine(0.65,"AGR",2);               /* couche 1 de cuivre */
  if(simVoisinagePcb().length)
    throw new Error("une piste d'une autre couche est envoyée comme voisine");

  const t=simCarteVoisine(0.65);
  S.sel.tracks.add(S.tracks[S.tracks.length-1]);   /* les deux sélectionnées */
  touch();
  if(simVoisinagePcb().length)
    throw new Error("une piste sélectionnée est envoyée comme sa propre voisine");
  if(!t)throw new Error("la carte d'essai n'a pas été montée");
});

T("un arc voisin part en cordes, comme partout ailleurs",()=>{
  /* LE SERVEUR NE SAIT APPARIER QUE DES SEGMENTS DROITS. Une piste courbe qui
     partirait comme un seul segment de sa corde décrirait un longement qui
     n'existe pas — et `trkSegs` est déjà la conversion que tout le reste de
     l'éditeur emploie. */
  simCarte();
  S.tracks.push({l:0, net:"ARC", w:SIM_W, ca:Math.PI/2,
                 x1:SIM_X1+5, y1:SIM_Y+1.0, x2:SIM_X1+10, y2:SIM_Y+1.5});
  touch();
  const v=simVoisinagePcb();
  if(v.length<2)
    throw new Error("un arc voisin part en "+v.length+" tronçon(s)");
  for(const o of v)
    if(!(o.start&&o.end&&o.start.length===2))
      throw new Error("un tronçon de voisinage mal formé : "+JSON.stringify(o));
});

T("les paires déclarées dans l'éditeur partent avec le problème",()=>{
  /* LE SERVEUR SAIT RECONNAÎTRE _P/_N, mais une paire déclarée à la main ne
     suit pas forcément une convention de nommage. C'est la page qui détient
     cette vérité-là, et elle doit la joindre. */
  simCarteVoisine(0.65,"BETA");
  S.dpPairs=[{id:1,name:"P1",p:"N$1",n:"BETA"}];
  touch();
  const paires=simPairesPcb();
  if(paires.length!==1||paires[0][0]!=="N$1"||paires[0][1]!=="BETA")
    throw new Error("paires envoyées : "+JSON.stringify(paires));
  S.dpPairs=[];
});

/* --------------------------------------------------------------------------
   LES DEUX FICHES DE COUPLAGE
   --------------------------------------------------------------------------
   ELLES LISENT LA MÊME LISTE et n'en montrent pas les mêmes colonnes : c'est
   tout l'intérêt d'avoir résolu UNE section à deux conducteurs. Ce qu'on
   vérifie ici est ce qu'aucun banc Python ne peut voir — que la fiche se monte
   sans lever sur un résultat réel, qu'elle juge dans le bon sens, et qu'elle
   distingue les trois silences possibles (pas de serveur, pas de voisinage,
   rien qui longe) au lieu d'afficher une page vide qui ressemble à « aucun
   problème ».
   -------------------------------------------------------------------------- */

/* Un résultat de serveur, réduit à ce que les deux fiches lisent. */
function simResCouplage(paires,voisinage){
  const sec=(paires||[]).length
    ? [{couche:0, net:"USB_DP", topo:"micro", h:0.2, er:4.3,
        ecart_g:1.5, ecart_d:0, gap_g:2, gap_d:0, gardes:0, ecartes:[],
        raison:"", z0_selection:57.1,
        conducteurs:[{net:"USB_DP", x:0, largeur:0.25, selection:true,
                      garde:false}].concat(
          (paires||[]).map((f,k)=>({net:f.net_voisin, x:-0.5*(k+1),
                                    largeur:0.25, selection:false,
                                    garde:false})))}]
    : [];
  return {f_centre:1e9, reference_nets:["GND"], segments:[],
          couplage:{paires:paires||[], sections:sec, temps_montee:70e-12,
                    temps_montee_source:"deduit de la bande (0,35 / f_max)",
                    voisinage:(voisinage==null?12:voisinage),
                    longements:(paires||[]).length,
                    hypotheses:["La section couplée est résolue SANS masse "+
                                "coplanaire."]}};
}
function simPaireEssai(sur){
  return Object.assign({
    couche:0, nom_couche:"Top", net:"USB_DP", net_voisin:"USB_DM",
    longueur:25, ecart:0.25, ecart_min:0.25, largeur:0.25,
    largeur_voisine:0.25, troncons:1, deux_cotes:false, differentielle:true,
    raison:"", topo:"micro", h:0.2, er:4.3,
    z_diff:99.3, z_commune:32.5, z_impair:49.7, z_pair:65.0,
    eps_eff_impair:3.17, eps_eff_pair:3.58, cote:"gauche",
    z0:57.1, z0_voisine:57.1, k_c:0.104, k_l:0.163,
    k_arriere:0.067, k_avant:-0.030, next:0.067, fext:-0.065,
    sature:true, longueur_saturation:5.7, retard:1.5e-10,
    /* LES DEUX SENS : le serveur les rend tous les deux depuis la MÊME
       matrice. `next`/`fext` en tête de fiche répètent le sens REÇU, qui est
       celui qui juge. */
    recu:{next:0.067, fext:-0.065, k_c:0.104, k_l:0.163, k_arriere:0.067,
          k_avant:-0.030, sature:true, longueur_saturation:5.7,
          retard:1.5e-10},
    emis:{next:0.066, fext:-0.068, k_c:0.101, k_l:0.161, k_arriere:0.066,
          k_avant:-0.030, sature:true, longueur_saturation:5.7,
          retard:1.5e-10}
  },sur||{});
}

T("la fiche de Z différentielle juge contre la cible, et nomme la paire",()=>{
  SIM.res=simResCouplage([simPaireEssai()]);
  SIM.saisie.cibleDiff=100; SIM.saisie.tolDiffPct=10;
  let h=simFicheDiff();
  if(!/dans la tolérance/.test(h))
    throw new Error("99,3 Ω sur une cible de 100 ± 10 devrait passer : "+
                    h.slice(0,200));
  if(h.indexOf("USB_DP")<0||h.indexOf("USB_DM")<0)
    throw new Error("la fiche ne nomme pas les deux nets");
  if(h.indexOf("Top")<0)
    throw new Error("la fiche n'écrit pas le nom de couche");

  /* MÊME PAIRE, CIBLE DÉPLACÉE : le verdict doit basculer, sans recalcul. */
  SIM.saisie.cibleDiff=85;
  h=simFicheDiff();
  if(!/hors tolérance/.test(h))
    throw new Error("99,3 Ω sur une cible de 85 ± 8,5 devrait être refusée");
  SIM.saisie.cibleDiff=100;
  SIM.res=null;
});

T("un longement qui n'est pas une paire est rangé à part",()=>{
  SIM.res=simResCouplage([simPaireEssai({net_voisin:"CLK",
                                         differentielle:false})]);
  const h=simFicheDiff();
  if(!/Aucune paire différentielle reconnue/.test(h))
    throw new Error("le verdict devrait dire qu'aucune paire n'est reconnue");
  if(h.indexOf("ce ne sont pas des paires")<0)
    throw new Error("le longement devrait être rangé sous son propre titre");
  /* ET SON IMPÉDANCE RESTE ÉCRITE : deux pistes qui se longent ONT un mode
     impair, et le taire priverait d'un renseignement juste. */
  if(h.indexOf("99,3")<0&&h.indexOf("99.3")<0)
    throw new Error("Z_diff n'est plus écrite : "+h.slice(0,300));
  SIM.res=null;
});


/* ==========================================================================
   LE BALAYAGE — LA MÉTHODE DU CROSSTALK SCANNER
   --------------------------------------------------------------------------
   CE QUE CES CAS DÉFENDENT : que le mode par défaut ne demande RIEN. C'est la
   raison d'être du balayage — K_NEXT et K_FEXT sortent de la seule géométrie
   de la section —, et c'est aussi ce qui se perd le plus facilement : il
   suffit qu'un champ du mode budget reste dans le corps du panneau pour que
   la promesse tombe sans qu'aucun chiffre ne bouge.
   ========================================================================== */

/* Un résultat qui porte SON balayage, à côté de ce que le mode budget lit. */
function simResScan(classes){
  const paires=Object.keys(classes||{}).map((net,k)=>simPaireEssai({
    net_voisin:net, differentielle:false,
    scan:{k_next:classes[net].kn, k_fext:classes[net].kf,
          classe:classes[net].c, ecart:0.15+0.1*k, source:"serre"}}));
  const r=simResCouplage(paires);
  const cl=Object.values(classes||{});
  r.couplage.scan={
    seuils:{next_alerte:0.01, next_violation:0.025,
            fext_alerte:0.10, fext_violation:0.15},
    chiffrees:cl.length,
    violations:cl.filter(x=>x.c==="violation").length,
    alertes:cl.filter(x=>x.c==="alerte").length};
  return r;
}


/* ==========================================================================
   LES DEUX CARTES DE CHALEUR DU COUPLAGE, ET LA PAIRE CHOISIE A LA MAIN
   ========================================================================== */

/* Un resultat qui porte SA carte de chaleur, alignee sur les objets. */
function simResChaleur(chaleur,paires){
  const r=simResCouplage(paires||[simPaireEssai()]);
  r.segments=chaleur.map(()=>({z0:50, longueur:10, couche:0,
                               nom_couche:"Top"}));
  r.couplage.chaleur=chaleur;
  return r;
}
function simObjetsBidon(n){
  const out=[];
  for(let i=0;i<n;i++)out.push({trk:{w:0.25}, u1:0, u2:1, couche:"Top"});
  return out;
}
function simCh(sur){
  return Object.assign({net:"USB_DP", couche:0, bruit:0.01, pire:0.01,
                        agresseur:"USB_DM", ecart:0.25, longueur:10,
                        agresseurs:[], z_diff:100, z_diff_net:"USB_DM",
                        z_diff_declare:true},sur||{});
}

T("chaque analyse déclare CE qu'elle peint, et pas une autre grandeur",()=>{
  const attendu={impedance:"z", diff:"zdiff", retour:"", dc:""};
  /* L'ONGLET « DIAPHONIE » A DISPARU AVEC SA CARTE : le crosstalk répond seul
     au couplage, et deux verdicts concurrents sur le même cuivre — obtenus
     par deux physiques — ne s'arbitrent pas. */
  if(SIM_ANALYSES.diaphonie)
    throw new Error("l'analyse Diaphonie est encore au registre");
  for(const cle of Object.keys(attendu)){
    const a=SIM_ANALYSES[cle];
    if(!a)throw new Error("analyse absente : "+cle);
    if((a.carte||"")!==attendu[cle])
      throw new Error(cle+" peint « "+(a.carte||"")+" » au lieu de « "+
                      attendu[cle]+" »");
  }
  /* `peint` RESTE LA CARTE DES Z₀, ET ELLE SEULE : la mettre à vrai ailleurs
     ferait apparaître des ohms sous une fiche qui parle de pourcentages. */
  for(const cle of ["diff","retour","dc"])
    if(SIM_ANALYSES[cle].peint)
      throw new Error(cle+" repeint la carte des Z₀");
});

T("la paire choisie à la main part avec le document, comme une déclarée",()=>{
  /* LE CAS QUE LA DÉTECTION RATE, et il est courant : deux nets qui forment
     une paire sans en porter les suffixes. « N$1 » et « AGR » ne sont ni
     _P/_N, ni +/−, ni déclarés dans l'éditeur — la fiche les rangeait donc
     sous « ce ne sont pas des paires », avec des impédances pourtant justes. */
  simCarteVoisine(0.65);
  const soi=SIM_PCB.probleme(simSaisie()).doc.net;

  SIM.saisie.paireN="";
  let d=simDocFinir(SIM_PCB.probleme(simSaisie()).doc);
  if((d.paires||[]).some(c=>c.indexOf("AGR")>=0))
    throw new Error("une paire est déclarée alors que rien ne l'a demandée");

  /* AVEC LE CHOIX : le net désigné voyage dans `doc.paires`, au même endroit
     et au même format que ceux de l'éditeur — le serveur ne les distingue
     pas, et c'est ce qui fait de celle-ci LA paire, carte de chaleur
     comprise. */
  SIM.saisie.paireN="AGR";
  d=simDocFinir(SIM_PCB.probleme(simSaisie()).doc);
  if(!(d.paires||[]).some(c=>c[0]===soi&&c[1]==="AGR"))
    throw new Error("la paire choisie n'est pas dans le document : "+
                    JSON.stringify(d.paires));
  /* ELLE PASSE EN TÊTE : un choix explicite prime sur une convention. */
  if(d.paires[0][1]!=="AGR")
    throw new Error("le choix explicite ne passe pas devant");

  /* ET LE CANDIDAT SE PROPOSE AVANT LE PREMIER CALCUL : sans cela il faudrait
     calculer pour pouvoir demander le bon calcul. */
  const res0=SIM.res, lots0=SIM.lots;
  SIM.res=null; SIM.lots=[];
  const cands=simPaireCandidats();
  if(cands.indexOf("AGR")<0)
    throw new Error("« AGR » longe la sélection et n'est pas proposé : "+
                    JSON.stringify(cands));
  /* LA MASSE N'EST PAS UNE MOITIÉ DE PAIRE : elle borde le groupe, elle ne
     l'appaire pas — proposer « GND » comme second conducteur d'une paire
     différentielle serait proposer un non-sens. */
  if(cands.some(n=>simRefSet().has(n)))
    throw new Error("un net de masse est proposé comme moitié de paire : "+
                    JSON.stringify(cands));
  SIM.res=res0; SIM.lots=lots0; SIM.saisie.paireN="";
});


/* ==========================================================================
   LES TERMINAISONS, LE SEUIL EN MILLIVOLTS, ET LE BUDGET DE LA SÉLECTION
   --------------------------------------------------------------------------
   Trois choses que le tableau seul ne montre pas et qui décident pourtant :
     · c'est ce que chaque BOUT voit qui juge, pas l'amplitude engendrée ;
     · un seuil en millivolts REMPLACE le pourcentage, il ne s'y ajoute pas ;
     · la sélection, elle, cumule ce qu'elle prend — et c'est le seul total de
       cette fiche qui décrive une tension existant quelque part.
   ========================================================================== */

/* Un longement qui porte les deux bouts, comme le serveur les rend désormais. */
function simTermEssai(sur){
  const f=simPaireEssai(Object.assign({differentielle:false},sur||{}));
  f.emis=Object.assign({next:0.02, fext:-0.01, sature:true,
                        longueur_saturation:5.7,
                        bout_proche:0.021, bout_lointain:0.090,
                        proche_direct:0.021, proche_reflechi:0,
                        lointain_direct:-0.020, lointain_reflechi:-0.070,
                        resonne:false, pire:0.090},(sur&&sur.emis)||{});
  f.recu=Object.assign({next:0.02, fext:-0.01, sature:true,
                        longueur_saturation:5.7,
                        bout_proche:0.010, bout_lointain:0.030,
                        pire:0.030},(sur&&sur.recu)||{});
  return f;
}

/* ==========================================================================
   CROSSTALK — OÙ le couplage se fabrique
   --------------------------------------------------------------------------
   CE QUE CES CAS DÉFENDENT, ET C'EST TOUJOURS LA MÊME CHOSE : que rien ne se
   devine en silence. Toute la chaîne — matrice S, fenêtre, IFFT, axe de
   position — rend une carte lisse et colorée QUELLE QUE SOIT l'erreur qu'on y
   glisse. Un mapping de ports non confirmé, une liste de zones vide sous un
   contrôle qui n'a jamais eu lieu, un pourcentage envoyé là où le serveur
   attend une fraction : aucun ne lève, aucun ne se voit, et tous rendent une
   carte parfaitement crédible.
   ========================================================================== */

T("l'onglet Crosstalk est déclaré, et il ne peint pas le cuivre",()=>{
  const a=SIM_ANALYSES.crosstalk;
  if(!a)throw new Error("l'analyse n'est pas au registre");
  for(const cle of ["corps","brancher","rendre"])
    if(typeof a[cle]!=="function")
      throw new Error("l'analyse ne déclare pas "+cle);
  /* `peint` COMMANDE simZActif(), donc la carte de chaleur des IMPÉDANCES. Le
     mettre à vrai ferait apparaître des ohms sur le cuivre sous une fiche qui
     parle de positions. */
  if(a.peint)throw new Error("l'onglet Crosstalk ne peint pas les Z₀");
  /* ET IL N'A PAS DE `carte` NON PLUS : sa carte de chaleur est une figure du
     PANNEAU, une ligne par victime sur un axe commun. Deux victimes sur deux
     tracés différents ne se comparent qu'alignées. */
  if(a.carte)throw new Error("l'onglet Crosstalk ne peint aucune grandeur "+
                             "sur le cuivre : "+a.carte);
  const si=SIM_FAMILLES.find(f=>f.cle==="si");
  if(si.analyses.indexOf("crosstalk")<0)
    throw new Error("l'onglet doit être dans la famille SI");
  /* IL SUIT « Z DIFFÉRENTIELLE », ET IL A PRIS LA PLACE DE « DIAPHONIE » :
     les deux répondaient à la même question, la seconde sans dire où. */
  if(si.analyses.indexOf("crosstalk")!==si.analyses.indexOf("diff")+1)
    throw new Error("Crosstalk doit suivre Z différentielle : "+
                    si.analyses.join(","));
  if(si.analyses.indexOf("diaphonie")>=0)
    throw new Error("l'onglet Diaphonie est encore dans la famille SI");
});

T("le corps demande la bande, et c'est elle qui fixe la résolution",()=>{
  const corps=simCorpsCrosstalk();
  /* LA BANDE EST LE SEUL RÉGLAGE DONT DÉPEND CE QUE LA CARTE PEUT DISTINGUER.
     La laisser sous un autre onglet reviendrait à cacher la commande dont on
     se sert le plus. Et ce sont LES MÊMES CHAMPS que l'onglet Impédance —
     mêmes identifiants, donc même état. */
  for(const id of ["simF2","simN","simTr"])
    if(corps.indexOf('id="'+id+'"')<0)
      throw new Error("la bande doit être saisissable ici : "+id);
  for(const id of ["simXtDist","simXtLong","simXtSeuil","simXtFen",
                   "simXtBeta","simXtPad","simXtAdj","simXtRes",
                   "simXtEcartV","simXtAsym","simXtDesac","simXtAgreger",
                   "simXtVit"])
    if(corps.indexOf('id="'+id+'"')<0)
      throw new Error("réglage manquant : "+id);
  if(corps.indexOf('id="simXtGo"')<0)
    throw new Error("il faut pouvoir lancer l'analyse");
  /* LES TROIS SORTIES : la donnée brute est la seule qui compte pour recouper
     avec le dessin. */
  for(const id of ["simXtCsv","simXtSnp","simXtJson"])
    if(corps.indexOf('id="'+id+'"')<0)
      throw new Error("sortie manquante : "+id);
  /* ET AUCUNE ENTRÉE DE FICHIER : la source est le design, et rien d'autre.
     Un champ d'import laissé là ferait croire qu'un .sNp peut encore décider
     de la carte — ce que le serveur refuse désormais. */
  if(/type="file"/.test(corps))
    throw new Error("aucun fichier ne s'importe ici : la matrice se génère "+
                    "à partir du design");
});

T("les réglages partent dans les unités du serveur, jamais dans celles de l'écran",()=>{
  const garde=JSON.parse(JSON.stringify(SIM_XT.saisie));
  SIM_XT.saisie.ecartV=5;
  SIM_XT.saisie.seuil=-40;
  SIM_XT.saisie.pad=4;
  const r=simXtReglages();
  /* LE POURCENTAGE DEVIENT UNE FRACTION, et c'est le genre de traduction qui,
     oubliée, fait qu'un seuil affiché à 5 % en vaut 500 côté calcul — sans
     qu'aucun chiffre ne paraisse anormal. */
  if(Math.abs(r.ecart_vitesse_max-0.05)>1e-9)
    throw new Error("5 % doit partir en 0,05 : "+r.ecart_vitesse_max);
  if(r.seuil_db!==-40)
    throw new Error("le seuil part en décibels : "+r.seuil_db);
  if(r.zero_pad!==4)throw new Error("padding : "+r.zero_pad);
  /* UN PADDING À ZÉRO N'EXISTE PAS : le plancher est un. */
  SIM_XT.saisie.pad=0;
  if(simXtReglages().zero_pad!==1)
    throw new Error("un padding nul doit valoir un");
  SIM_XT.saisie=garde;
});

T("une vitesse illisible est ignorée, et elle se dit",()=>{
  const garde=SIM_XT.saisie.vitesses;
  SIM_XT.saisie.vitesses="CLK=1.5e8, DATA = 1.6e8 ; n'importe quoi, VIC=0";
  const v=simXtVitesses();
  if(Math.abs(v.CLK-1.5e8)>1||Math.abs(v.DATA-1.6e8)>1)
    throw new Error("les deux lisibles doivent passer : "+JSON.stringify(v));
  /* ZÉRO N'EST PAS UNE VITESSE : l'accepter donnerait un retard infini et un
     axe de position entièrement faux. */
  if("VIC" in v)throw new Error("une vitesse nulle doit être refusée");
  const refus=simXtVitessesRefusees();
  if(refus.indexOf("n'importe quoi")<0)
    throw new Error("ce qui n'est pas relu doit être NOMMÉ : "+refus.join("|"));
  SIM_XT.saisie.vitesses=garde;
});

T("la carte réduit par le MAXIMUM, jamais par la moyenne",()=>{
  /* C'EST LE PIC QU'ON EST VENU VOIR. Une moyenne l'effacerait exactement là
     où il compte : un couplage local sur un millimètre au milieu de quarante
     disparaîtrait dans la case, et la carte dirait que tout va bien. */
  const v=[0,0,0,1,0,0,0,0];
  const r=simXtReduire(v,2);
  if(r.length!==2)throw new Error("deux cases attendues : "+r.length);
  if(r[0]!==1)throw new Error("le pic doit survivre à la réduction : "+r);
  if(simXtReduire([1,2,3],9).length!==3)
    throw new Error("on n'invente pas de colonnes quand il y en a moins");
});


/* ==========================================================================
   LA SOURCE EST LE DESIGN, ET LE MAPPING N'EST PLUS UNE SAISIE
   --------------------------------------------------------------------------
   Rien dans un .s6p ne dit que le port 3 est le bout proche de la victime de
   gauche. C'était la seule chose de ce panneau qu'on ne pouvait pas déduire,
   et elle coûtait une table à composer, une case à cocher et un refus total.
   Elle a disparu avec l'import : le serveur pose les ports à partir de la
   géométrie. Ce qui reste est un COMPTE RENDU, et il doit rester AFFICHÉ —
   c'est ce qui permet de vérifier que la piste qu'on appelle « la victime de
   gauche » est bien celle que le calcul appelle ainsi.
   ========================================================================== */

T("le document envoyé ne porte aucune matrice venue de l'extérieur",()=>{
  /* CE QUE LE PANNEAU N'A PLUS LE DROIT D'ENVOYER. Le serveur REFUSE ces
     champs plutôt que de les ignorer — les ignorer ferait croire à la page
     que son fichier a été calculé, alors que la carte viendrait d'ailleurs.
     Le panneau ne doit donc jamais les fabriquer. */
  for(const cle of ["fichier","nomFichier","nPorts","ports","confirme"])
    if(cle in SIM_XT)
      throw new Error("l'état porte encore « "+cle+" » : la section n'a plus "+
                      "de fichier à importer");
  const r=simXtReglages();
  for(const cle of ["touchstone","ports","mapping_confirme","extrapoler_dc"])
    if(cle in r)
      throw new Error("les réglages portent encore « "+cle+" »");
  /* ET LES DEUX NOUVEAUX RÉGLAGES PARTENT, eux : la résolution voulue et le
     rapport de désaccord. Un réglage qui ne part pas est un réglage qui ment
     à l'écran. */
  for(const cle of ["resolution_cible","desaccord"])
    if(!(cle in r))throw new Error("réglage non transmis : "+cle);
});

T("le mapping s'affiche en compte rendu, sans rien demander",()=>{
  const garde={r:SIM_XT.res, e:SIM_XT.err};
  SIM_XT.res=simXtResEssai(); SIM_XT.err="";
  const h=simRendreCrosstalk();
  if(h.indexOf("Les ports du réseau")<0)
    throw new Error("le mapping doit rester lisible : un résultat sans lui "+
                    "n'est pas vérifiable");
  if(h.indexOf("CLK proche = port 1")<0)
    throw new Error("chaque port doit être nommé : "+h.slice(0,200));
  /* MAIS PLUS RIEN À SAISIR : ni menu déroulant, ni case à cocher. */
  if(/data-xtnet|data-xtbout|simXtConfirme/.test(h))
    throw new Error("le mapping n'est plus une saisie");
  /* ET IL EST REPLIÉ, EN FIN DE FICHE : on l'ouvre pour vérifier, pas pour
     lire la fiche. */
  const iCarte=h.indexOf("Carte du couplage");
  const iMap=h.indexOf("Les ports du réseau");
  if(!(iCarte<iMap))
    throw new Error("le compte rendu des ports passe après la carte");
  SIM_XT.res=garde.r; SIM_XT.err=garde.e;
});

/* ==========================================================================
   LES DEUX TABLEAUX, ET LA CARTE
   ========================================================================== */

/* Un résultat de crosstalk complet, pour juger la fiche sans serveur. */
function simXtResEssai(sur){
  const r={
    format:"cao-crosstalk-resultat-1", carte:"essai",
    agresseurs:["CLK"], principal:"CLK", longueur:40,
    source:"réseau de lignes couplées synthétisé",
    mapping:{confirme:true, fichier_ports:6,
             source:"connu : les ports sont posés ici, à partir de la"+
                    " géométrie",
             ports:[{nom:"CLK_proche",index:1,net:"CLK",bout:"proche",
                     role:"agresseur"},
                    {nom:"CLK_lointain",index:4,net:"CLK",bout:"lointain",
                     role:"agresseur"},
                    {nom:"VIC_G_proche",index:2,net:"VIC_G",bout:"proche",
                     role:"victime"},
                    {nom:"VIC_G_lointain",index:5,net:"VIC_G",
                     bout:"lointain",role:"victime"},
                    {nom:"VIC_D_proche",index:3,net:"VIC_D",bout:"proche",
                     role:"victime"},
                    {nom:"VIC_D_lointain",index:6,net:"VIC_D",
                     bout:"lointain",role:"victime"}]},
    etape0:{regardes:12, retenus:["VIC_G","VIC_D"],
      seuils:{distance_max:0.75, source:"déduit", hauteur:0.2,
              longueur_min_source:"déduit", couches_adjacentes:true},
      /* LE PROFIL D'ESPACEMENT : cinq points comme l'axe de la carte, et un
         TROU au départ — la victime de gauche ne longe pas avant 10 mm. Un
         trou n'est pas un zéro, et c'est ce que la fiche doit montrer. */
      espacements:{VIC_G:{valeurs:[null,0.2,0.2,0.55,0.55], median:0.2,
                          min:0.2, max:0.55, couverture:0.8}},
      candidats:[
        {net:"VIC_G", couche:0, nom_couche:"Top", type:"latéral", cote:"gauche",
         distance:0.2, longueur:30, retenu:true, raison:"", paire:false,
         role:"victime"},
        {net:"VIC_D", couche:0, nom_couche:"Top", type:"latéral", cote:"droite",
         distance:0.35, longueur:40, retenu:true, raison:"", paire:false,
         role:"victime"},
        {net:"LOIN", couche:0, nom_couche:"Top", type:"latéral", cote:"droite",
         distance:1.4, longueur:20, retenu:false, paire:false, role:"victime",
         raison:"à 1.400 mm, au-delà du seuil de 0.750 mm : vue mais non simulée"}]},
    couples:[
      {agresseur:"CLK", victime:"VIC_G", role:"victime", paire:false,
       distance:0.2, longement:30, type:"latéral", cote:"gauche",
       next_db:-16.1, fext_db:-8.1, pire_db:-8.1, confirmee:true, raison:"",
       vitesse_agresseur:1.6e8, vitesse_victime:1.61e8, ecart_vitesse:0.009,
       resolution_next:5.9, resolution_fext:11.7},
      {agresseur:"CLK", victime:"VIC_D", role:"victime", paire:false,
       distance:0.35, longement:40, type:"latéral", cote:"droite",
       next_db:-44.2, fext_db:-51.0, pire_db:-44.2, confirmee:false,
       raison:"couplage à -44.2 dB, sous le seuil de -40.0 dB",
       vitesse_agresseur:1.6e8, vitesse_victime:1.60e8, ecart_vitesse:0.001}],
    victimes:["VIC_G"],
    carte_chaleur:{
      axe:[0,10,20,30,40],
      /* LES DEUX VICTIMES ONT LEURS COURBES, ET UNE SEULE EST CONFIRMÉE.
         C'est le cas qui compte : une candidate sous le seuil garde sa courbe
         — sans quoi une figure vide se lirait « aucun couplage » — mais elle
         ne porte aucun verdict, et elle ne s'allume pas toute seule tant qu'il
         y a une confirmée à regarder. */
      lignes:[{agresseur:"CLK", victime:"VIC_G", sens:"next", confirmee:true,
               valeurs:[0.001,0.03,0.02,0.01,0.005], max:0.03, max_db:-30.5,
               echantillons:800, resolution:5.9},
              {agresseur:"CLK", victime:"VIC_G", sens:"fext", confirmee:true,
               valeurs:[0,0,0.001,0.04,0.02], max:0.04, max_db:-28,
               echantillons:800, resolution:11.7},
              {agresseur:"CLK", victime:"VIC_D", sens:"next", confirmee:false,
               valeurs:[0.0002,0.0004,0.0006,0.0003,0.0001], max:0.0006,
               max_db:-64.4, echantillons:800, resolution:5.9},
              {agresseur:"CLK", victime:"VIC_D", sens:"fext", confirmee:false,
               valeurs:[0,0,0.0001,0.0002,0.0002], max:0.0002, max_db:-74,
               echantillons:800, resolution:11.7}],
      max:0.04, zones:sur||[],
      espacements:{VIC_G:{valeurs:[null,0.2,0.2,0.55,0.55], median:0.2,
                          min:0.2, max:0.55, couverture:0.8}}},
    desaccords:[],
    masse:{seuil:0.75, source:"λ/10 à 20 GHz", longueur:40,
           mesure:["6 via(s) de couture repérés le long du parcours"],
           zones:sur||[]},
    validation:{passivite:{ok:true, sigma_max:1.0, f:0},
                reciprocite:{ok:true, ecart:1e-15, f:9e8},
                bande:{pas:1e8, constant:true, f_min:0, f_max:2e10,
                       points:201, ajoutes:0, extrapole:false}},
    asymetries:[], reglages:{seuil_db:-40, ecart_vitesse_max:0.05,
                             fenetre:"kaiser", zero_pad:4,
                             resolution_cible:0, desaccord:1.25},
    avertissements:[], hypotheses:["une hypothèse"]};
  return r;
}

/* ==========================================================================
   LE BRUIT EN VOLTS — CE QUE LA VICTIME VOIT VRAIMENT
   --------------------------------------------------------------------------
   POURQUOI CES CAS-LÀ. « VIC_G prend 3,00 % de CLK » est exact et ne décide
   rien : un récepteur ne connaît pas les pour-cent, il connaît la distance
   entre la tension qui lui arrive et son seuil de basculement. Le même 3 %
   vaut 99 mV sur un LVCMOS 3,3 V — invisible devant 700 mV de marge — et
   10,5 mV sur un LVDS 350 mV, où la marge est de 50.

   ET LA CONVERSION EST UN PRODUIT, DONT LA PAGE FOURNIT UN FACTEUR. Le serveur
   ne connaît que des rapports ; l'amplitude saisie les convertit. C'est le
   seul champ de ce panneau qui ne relance rien, et c'est ce qui est éprouvé
   ici — un recalcul de matrice S pour écrire 1,8 au lieu de 3,3 serait trente
   secondes perdues pour une multiplication.
   ========================================================================== */
T("le bruit se dit en volts, et la tension vient du panneau",()=>{
  const garde={r:SIM_XT.res, e:SIM_XT.err, c:SIM_XT.caches,
               s:SIM.saisie.swing, b:SIM.saisie.bruitPct, m:SIM.saisie.marge};
  SIM_XT.res=simXtResEssai(); SIM_XT.err=""; SIM_XT.caches={};
  SIM.saisie.swing=3.3; SIM.saisie.bruitPct=5; SIM.saisie.marge=0;
  let h=simRendreCrosstalk();
  /* 3 % DE 3,3 V FONT 99 mV, et c'est le pire point de la courbe NEXT de
     VIC_G (max 0,03). Le FEXT, lui, culmine à 0,04, soit 132 mV. */
  if(h.indexOf("99,0 mV")<0)
    throw new Error("le NEXT de VIC_G doit valoir 99 mV sur 3,3 V");
  if(h.indexOf("132,0 mV")<0)
    throw new Error("le FEXT de VIC_G doit valoir 132 mV sur 3,3 V");
  /* LE POUR-CENT RESTE À CÔTÉ : c'est la mesure, les volts sont sa
     conversion. Perdre l'un des deux ferait douter de l'autre. */
  if(h.indexOf("3,00 %")<0||h.indexOf("4,00 %")<0)
    throw new Error("le pour-cent doit rester écrit à côté des volts");

  /* CHANGER L'AMPLITUDE DÉPLACE LES VOLTS ET RIEN D'AUTRE. Le résultat n'est
     pas jeté — c'est tout l'intérêt —, et les pour-cent ne bougent pas d'un
     millième : ils ne dépendent que du cuivre. */
  SIM.saisie.swing=1.8;
  h=simRendreCrosstalk();
  if(!SIM_XT.res)
    throw new Error("changer l'amplitude ne doit RIEN jeter");
  if(h.indexOf("54,0 mV")<0)
    throw new Error("le NEXT de VIC_G doit suivre l'amplitude : 54 mV sur 1,8 V");
  if(h.indexOf("3,00 %")<0)
    throw new Error("le pour-cent ne dépend pas de l'amplitude");

  /* SOUS LE MILLIVOLT, ON CHANGE D'UNITÉ PLUTÔT QUE DE COMPTER LES ZÉROS.
     VIC_D prend 0,0006 de son agresseur : sur 1,8 V cela fait 1,08 mV, et sur
     un LVDS de 0,35 V, 210 µV. « 0,000 V » se lirait « rien », ce qui est le
     contresens que ces courbes existent pour corriger. */
  SIM.saisie.swing=0.35;
  h=simRendreCrosstalk();
  if(h.indexOf("210,0 \u00b5V")<0&&h.indexOf("210,0 µV")<0)
    throw new Error("sous le millivolt, la tension passe en microvolts");
  SIM_XT.res=garde.r; SIM_XT.err=garde.e; SIM_XT.caches=garde.c||{};
  SIM.saisie.swing=garde.s; SIM.saisie.bruitPct=garde.b;
  SIM.saisie.marge=garde.m;
});

/* ==========================================================================
   LES TROIS CASES DE LA FIGURE — CE QU'ELLE TRACE, ET DANS QUELLE UNITÉ
   --------------------------------------------------------------------------
   TROIS RÉGLAGES D'AFFICHAGE, ET AUCUN NE TOUCHE AU CALCUL. Les deux courbes
   et les deux unités sont dans le MÊME résultat ; ce qu'on éprouve ici est
   qu'éteindre l'un ne fait ni disparaître le résultat, ni rétrécir la figure
   sur du vide, ni laisser sur la carte un chiffre que plus aucun trait ne
   montre.
   ========================================================================== */
T("les trois cases de la figure sont posées, et cochées d'office",()=>{
  const garde={r:SIM_XT.res, e:SIM_XT.err, c:SIM_XT.courbes};
  SIM_XT.res=simXtResEssai(); SIM_XT.err=""; SIM_XT.caches={};
  SIM_XT.courbes={next:true, fext:true, volts:true};
  const h=simRendreCrosstalk();
  for(const cle of ["next","fext","volts"])
    if(h.indexOf('data-xtvoir="'+cle+'"')<0)
      throw new Error("la case « "+cle+" » manque sur la figure");
  /* ELLES SONT SUR LA FIGURE, PAS DANS LES RÉGLAGES DU PANNEAU : ceux-là se
     replient une fois l'analyse lancée, et ces trois-là se touchent
     justement en lisant la figure. */
  if(simCorpsCrosstalk().indexOf("data-xtvoir")>=0)
    throw new Error("les cases ne doivent pas vivre dans les réglages");
  /* COCHÉES D'OFFICE : une figure qui s'ouvrirait sur une seule courbe
     ferait chercher la seconde. */
  if((h.match(/data-xtvoir="[a-z]+" checked/g)||[]).length!==3)
    throw new Error("les trois cases doivent être cochées au départ");
  SIM_XT.res=garde.r; SIM_XT.err=garde.e; SIM_XT.courbes=garde.c;
});

T("éteindre un sens retire son graphe et resserre la figure",()=>{
  const garde={r:SIM_XT.res, e:SIM_XT.err, c:SIM_XT.courbes};
  SIM_XT.res=simXtResEssai(); SIM_XT.err=""; SIM_XT.caches={};

  const haut=(html)=>{
    /* La hauteur du viewBox : c'est elle qui dit que la figure s'est
       resserrée au lieu de garder un cadre vide. */
    const m=html.match(/viewBox="0 0 [\d.]+ ([\d.]+)"/);
    if(!m)throw new Error("pas de figure");
    return parseFloat(m[1]);
  };
  SIM_XT.courbes={next:true, fext:true, volts:true};
  const deux=simRendreCrosstalk();
  const h2=haut(deux);
  if(deux.indexOf('data-sens="next"')<0||deux.indexOf('data-sens="fext"')<0)
    throw new Error("les deux graphes doivent être tracés");

  SIM_XT.courbes={next:true, fext:false, volts:true};
  const un=simRendreCrosstalk();
  if(un.indexOf('data-sens="fext"')>=0)
    throw new Error("le graphe du FEXT doit disparaître");
  if(un.indexOf('data-sens="next"')<0)
    throw new Error("celui du NEXT doit rester");
  /* UN CADRE QUI GARDERAIT SA TAILLE se lirait comme un graphe vide, donc
     comme un couplage nul — le contresens exact que cette figure évite. */
  if(!(haut(un)<h2-40))
    throw new Error("la figure doit se resserrer : "+haut(un)+" contre "+h2);
  /* ET LA PHRASE DE LECTURE SUIT : annoncer « deux courbes » au-dessus d'un
     seul graphe ferait chercher la seconde. */
  if(un.indexOf("Une courbe par victime")<0)
    throw new Error("la phrase de lecture doit dire qu'il n'en reste qu'une");
  /* LA LECTURE CHIFFRÉE NE LIT PLUS LE SENS ÉTEINT : aucun trait ne le
     montre plus, et le lire ferait chercher la courbe. On interroge la
     fonction et non le HTML entier : la légende, elle, parle des deux sens
     à bon droit, et la chercher dans le même texte ne prouverait rien. */
  const lect=simXtLectureLignes(0);
  if(lect.indexOf("FEXT")>=0)
    throw new Error("la réglette ne doit plus lire le FEXT éteint : "+lect);
  if(lect.indexOf("NEXT")<0)
    throw new Error("elle doit toujours lire le NEXT : "+lect);

  /* LE RÉSULTAT, LUI, NE BOUGE PAS : c'est un geste d'affichage. */
  if(!SIM_XT.res)throw new Error("éteindre un sens ne doit RIEN jeter");
  SIM_XT.res=garde.r; SIM_XT.err=garde.e; SIM_XT.courbes=garde.c;
});

T("les deux sens éteints le disent, et la réglette reste",()=>{
  const garde={r:SIM_XT.res, e:SIM_XT.err, c:SIM_XT.courbes};
  SIM_XT.res=simXtResEssai(); SIM_XT.err=""; SIM_XT.caches={};
  SIM_XT.courbes={next:false, fext:false, volts:true};
  const h=simRendreCrosstalk();
  /* PAS DE FIGURE VIDE : un SVG sans courbe se lirait comme « aucun
     couplage », qui est l'inverse du fait. */
  if(h.indexOf("<svg")>=0)
    throw new Error("aucune figure ne doit être tracée");
  if(h.indexOf("Les deux sens sont <b>éteints</b>")<0)
    throw new Error("la figure doit dire pourquoi elle est vide");
  /* LES CASES RESTENT AU-DESSUS DU MESSAGE : il faut un clic pour revenir. */
  if(h.indexOf('data-xtvoir="next"')<0)
    throw new Error("les cases doivent rester à portée de clic");
  /* ET LA RÉGLETTE AUSSI : elle promène le point blanc sur le CUIVRE, où la
     chaleur est toujours peinte. La retirer laisserait un repère qu'on ne
     pourrait plus déplacer — une commande partie, son effet resté. */
  if(h.indexOf('id="simXtPos"')<0)
    throw new Error("la réglette commande aussi le cuivre : elle reste");
  SIM_XT.res=garde.r; SIM_XT.err=garde.e; SIM_XT.courbes=garde.c;
});

T("les volts se lisent SUR la courbe : un axe à droite, la valeur au pic",()=>{
  /* CE QUI MANQUAIT. Les volts ne donnaient qu'UNE hauteur — le haut du
     graphe — et il fallait amener la réglette sur un point pour lire ce qu'il
     valait. Deux réponses : un AXE gradué à droite, qui convertit n'importe
     quelle hauteur, et la valeur écrite AU PIC de chaque courbe, qui est le
     point qu'on cherche en premier. */
  const garde={r:SIM_XT.res, e:SIM_XT.err, c:SIM_XT.courbes,
               s:SIM.saisie.swing};
  SIM_XT.res=simXtResEssai(); SIM_XT.err=""; SIM_XT.caches={};
  SIM.saisie.swing=3.3;
  SIM_XT.courbes={next:true, fext:true, volts:true};
  const h=simRendreCrosstalk();

  /* TROIS CRANS PAR GRAPHE ET PAR UNITÉ : le haut, la moitié, zéro. Deux
     graphes font donc six graduations en volts. */
  const grads=(h.match(/class="simXtGradV"/g)||[]).length;
  if(grads!==6)
    throw new Error("il faut trois crans de volts par graphe : "+grads);
  /* ET LA MOITIÉ EST CHIFFRÉE, sans quoi l'axe ne convertirait que ses deux
     bouts — ce que la version d'avant faisait déjà. 3,00 % valent 99,0 mV,
     donc la moitié 49,5 mV. */
  if(h.indexOf("49,5 mV")<0)
    throw new Error("le cran de moitié doit porter sa tension");
  if(h.indexOf("1,50 %")<0)
    throw new Error("le pour-cent aussi gradue sa moitié, à gauche");

  /* LA VALEUR AU PIC DE CHAQUE COURBE, dans la couleur de SA victime : sur un
     graphe à cinq courbes, savoir à qui appartient un chiffre passe avant
     savoir de quelle famille il est. */
  const pics=(h.match(/class="simXtSommet"/g)||[]).length;
  if(pics!==2)
    throw new Error("une valeur par courbe tracée, pas "+pics);
  const f=simXtFiches(SIM_XT.res).filter(x=>x.visible)[0];
  if(h.indexOf('class="simXtSommet" x=')<0||h.indexOf('fill="'+f.couleur+'"')<0)
    throw new Error("l'étiquette doit porter la couleur de sa victime");
  /* ELLE DIT AUSSI OÙ, dans son infobulle : une tension sans son abscisse ne
     désigne pas le millimètre à reprendre. */
  if(h.indexOf("le pire point de cette courbe")<0)
    throw new Error("l'étiquette doit dire de quoi elle est le pic");

  /* LA MARGE DE DROITE S'OUVRE POUR L'AXE, et se referme sans lui : une
     colonne vide de cinquante pixels rognerait la courbe pour rien. */
  const large=(txt)=>{
    const m=txt.match(/class="simXtAxe" x1="([\d.]+)" y1="[\d.]+" x2="([\d.]+)"/);
    if(!m)throw new Error("pas d'axe");
    return parseFloat(m[2])-parseFloat(m[1]);
  };
  const avecAxe=large(h);
  SIM_XT.courbes={next:true, fext:true, volts:false};
  const sansAxe=large(simRendreCrosstalk());
  if(!(sansAxe>avecAxe+30))
    throw new Error("sans axe de volts, la courbe doit reprendre la place : "+
                    sansAxe+" contre "+avecAxe);
  SIM_XT.res=garde.r; SIM_XT.err=garde.e; SIM_XT.courbes=garde.c;
  SIM.saisie.swing=garde.s;
});

T("la case mV n'éteint que l'unité, jamais la mesure",()=>{
  const garde={r:SIM_XT.res, e:SIM_XT.err, c:SIM_XT.courbes,
               s:SIM.saisie.swing};
  SIM_XT.res=simXtResEssai(); SIM_XT.err=""; SIM_XT.caches={};
  SIM.saisie.swing=3.3;

  SIM_XT.courbes={next:true, fext:true, volts:true};
  const avec=simRendreCrosstalk();
  if(avec.indexOf("99,0 mV")<0)
    throw new Error("les volts doivent être là quand la case est cochée");

  SIM_XT.courbes={next:true, fext:true, volts:false};
  const sans=simRendreCrosstalk();
  /* AUCUNE TENSION DANS LA FIGURE — ni les cases, ni la graduation, ni la
     réglette, ni l'échelle de la légende. */
  if(sans.indexOf("99,0 mV")>=0||sans.indexOf("132,0 mV")>=0)
    throw new Error("la case décochée doit retirer les volts de la figure");
  /* LE POUR-CENT, LUI, NE DÉPEND QUE DU CUIVRE : il reste. */
  if(sans.indexOf("3,00 %")<0||sans.indexOf("4,00 %")<0)
    throw new Error("le pour-cent ne doit pas partir avec les volts");
  /* ET LES DEUX COURBES SONT TOUJOURS LÀ : l'unité n'est pas un sens. */
  if(sans.indexOf('data-sens="next"')<0||sans.indexOf('data-sens="fext"')<0)
    throw new Error("éteindre les volts ne doit retirer aucune courbe");
  /* LA LÉGENDE DIT QUE C'EST LA CASE, et non l'absence d'amplitude : sans
     cela on irait chercher un champ vide dans le panneau. */
  if(sans.indexOf("Les <b>volts</b> sont <b>éteints</b>")<0)
    throw new Error("la légende doit dire d'où vient l'absence de volts");
  SIM_XT.res=garde.r; SIM_XT.err=garde.e; SIM_XT.courbes=garde.c;
  SIM.saisie.swing=garde.s;
});

T("le verdict se juge sur la marge en millivolts quand elle est remplie",()=>{
  /* UN BUDGET EN POUR-CENT EST UNE CONVENTION ; ce qui décide qu'une carte
     marche, c'est la marge du récepteur. Remplie, elle REMPLACE le
     pourcentage — deux seuils concurrents seraient pires que pas de seuil,
     puisqu'on ne saurait plus lequel a rougi. */
  const garde={r:SIM_XT.res, e:SIM_XT.err,
               s:SIM.saisie.swing, b:SIM.saisie.bruitPct, m:SIM.saisie.marge};
  const r=simXtResEssai();
  r.graves=[];
  /* -26 dB valent 5,01 % de l'agresseur, soit 165 mV sur 3,3 V. */
  r.couples=[{agresseur:"CLK",victime:"VIC",pire_db:-26,next_db:-26,
              fext_db:-40,confirmee:true}];
  SIM_XT.res=r;
  SIM.saisie.swing=3.3; SIM.saisie.bruitPct=5; SIM.saisie.marge=0;

  /* SANS MARGE : le pourcentage juge, et 5,01 % crèvent un budget de 5 %. */
  let h=simRendreCrosstalk();
  if(h.indexOf("AU-DESSUS DU BUDGET")<0||h.indexOf("budget 5,0 %")<0)
    throw new Error("sans marge, le budget en pourcentage doit juger");

  /* AVEC UNE MARGE LARGE : 165 mV tiennent dans 400 mV, et le pourcentage
     n'a plus voix au chapitre. */
  SIM.saisie.marge=0.400;
  h=simRendreCrosstalk();
  if(h.indexOf("SOUS LE BUDGET")<0)
    throw new Error("165 mV tiennent dans une marge de 400 mV");
  if(h.indexOf("marge 400 mV")<0)
    throw new Error("le résumé doit nommer la marge qu'il applique");
  if(h.indexOf("budget 5,0 %")>=0)
    throw new Error("les deux seuils ne doivent pas s'afficher ensemble");

  /* AVEC UNE MARGE SERRÉE : ils ne tiennent plus. */
  SIM.saisie.marge=0.100;
  h=simRendreCrosstalk();
  if(h.indexOf("AU-DESSUS DU BUDGET")<0)
    throw new Error("165 mV crèvent une marge de 100 mV");
  /* ET LE VERDICT ÉCRIT LA TENSION, pas seulement le rapport : c'est elle
     qu'on compare à une fiche technique. */
  if(h.indexOf("165,4 mV")<0)
    throw new Error("le verdict doit écrire le bruit en volts");
  SIM_XT.res=garde.r; SIM_XT.err=garde.e;
  SIM.saisie.swing=garde.s; SIM.saisie.bruitPct=garde.b;
  SIM.saisie.marge=garde.m;
});

T("le panneau porte la rangée Signal, et elle seule ne jette rien",()=>{
  /* LES TROIS CHAMPS SONT DANS LE CORPS DE L'ONGLET : sans eux, la fiche
     entière parlerait en pourcentages d'une grandeur qu'elle ne nomme
     jamais. */
  const corps=simCorpsCrosstalk();
  for(const id of ["simSwing","simBruit","simMarge"])
    if(corps.indexOf('id="'+id+'"')<0)
      throw new Error("l'onglet Crosstalk ne pose pas le champ "+id);
  if(corps.indexOf('id="simSwingUnite"')<0)
    throw new Error("l'amplitude doit avoir sa liste d'unités");
  if(corps.indexOf('id="simBruitAbs"')<0)
    throw new Error("le budget doit s'écrire aussi en clair, en volts");
});

T("les deux étapes zéro restent DEUX tableaux, et chacune garde ses chiffres",()=>{
  const garde={r:SIM_XT.res, e:SIM_XT.err};
  SIM_XT.res=simXtResEssai(); SIM_XT.err="";
  const h=simRendreCrosstalk();
  /* LES DEUX TITRES, ET DANS CET ORDRE. Fusionnés, on ne saurait plus si une
     piste absente du résultat est LOIN ou PROCHE ET BLINDÉE — deux gestes de
     routage opposés. */
  const i0a=h.indexOf("Étape 0a"), i0b=h.indexOf("Étape 0b");
  if(i0a<0||i0b<0)throw new Error("les deux étapes doivent être nommées");
  if(!(i0a<i0b))throw new Error("0a doit précéder 0b");
  /* UNE PISTE ÉCARTÉE EN 0a GARDE SA DISTANCE ET SA LONGUEUR. */
  if(h.indexOf("LOIN")<0||h.indexOf("1,400")<0)
    throw new Error("l'écartée de 0a doit garder son chiffre mesuré");
  /* UNE PISTE ÉCARTÉE EN 0b GARDE SON NIVEAU. C'est la différence entre
     « proche et découplée » et « absente » — une réponse, pas un silence. */
  if(h.indexOf("VIC_D")<0||h.indexOf("-44,2")<0)
    throw new Error("l'écartée de 0b doit garder son niveau de couplage");
  if(h.indexOf("sous le seuil")<0)
    throw new Error("l'écartée de 0b doit dire POURQUOI");
  /* ET LA CARTE NE PEINT QUE LA CONFIRMÉE. */
  const svg=h.slice(h.indexOf("<svg"),h.indexOf("</svg>"));
  if(svg.indexOf("VIC_D")>=0)
    throw new Error("la carte ne peint pas une victime non confirmée");
  if(svg.indexOf("VIC_G")<0)
    throw new Error("la carte doit nommer la victime qu'elle peint");
  /* L'ÉTAPE 0a PORTE AUSSI L'ÉCART MÉDIAN, à côté de la distance minimale :
     les deux ensemble disent si le longement est régulier ou s'il tient à un
     seul resserrement — et c'est ce dernier cas qui se corrige d'un coup de
     souris. */
  if(h.indexOf("écart médian")<0)
    throw new Error("le tableau 0a doit porter l'écart médian mesuré");
  SIM_XT.res=garde.r; SIM_XT.err=garde.e;
});

/* ==========================================================================
   LE PROFIL D'ESPACEMENT, ET SON RECOUPEMENT AVEC LA CARTE
   --------------------------------------------------------------------------
   UNE COURBE DE COUPLAGE SEULE NE SE VÉRIFIE PAS : elle a des pics, ils sont
   quelque part, et rien à l'écran ne dit s'ils sont à leur place. Le profil
   d'espacement vient de la GÉOMÉTRIE et non du calcul électromagnétique : les
   deux ne peuvent pas se tromper de la même façon, et c'est tout l'intérêt de
   les superposer.
   ========================================================================== */

T("l'espacement se réduit par le MINIMUM, et un trou reste un trou",()=>{
  /* L'INVERSE DU COUPLAGE, ET C'EST LA MÊME RÈGLE VUE DES DEUX CÔTÉS : dans
     une case, ce qui compte est le PIRE — et le pire d'un espacement est le
     plus PETIT. */
  const r=simXtReduireEsp([0.9,0.2,0.8,0.85],2);
  if(r[0]!==0.2)
    throw new Error("le resserrement doit survivre à la réduction : "+r);
  /* ET UNE CASE OÙ RIEN NE LONGE RESTE VIDE, surtout pas à zéro : un zéro se
     lirait comme un contact, et un pic dans un trou du profil est justement
     le plus fort des désaccords. */
  const t=simXtReduireEsp([null,null,0.3,0.3],2);
  if(t[0]!==null)throw new Error("un trou ne vaut pas zéro : "+t);
  if(t[1]!==0.3)throw new Error("le reste doit passer : "+t);
});

T("le profil se superpose à la carte, sur la ligne de SA victime",()=>{
  const garde={r:SIM_XT.res, e:SIM_XT.err, v:SIM_XT.espacement};
  SIM_XT.res=simXtResEssai(); SIM_XT.err=""; SIM_XT.espacement=true;
  const h=simRendreCrosstalk();
  if(h.indexOf("simXtEsp")<0)
    throw new Error("le trait d'espacement doit être dessiné");
  /* L'AXE EST INVERSÉ, ET ÇA SE DIT : un axe retourné qui ne s'annonce pas
     ferait lire un écartement comme un resserrement. */
  if(!/axe est inversé/.test(h))
    throw new Error("l'inversion de l'axe doit être annoncée");
  /* LE TROU DU PROFIL INTERROMPT LE TRAIT et ne le ramène pas à zéro : sur
     cinq points dont le premier est vide, il ne reste qu'un morceau. */
  const morceaux=(h.match(/class="simXtEsp"/g)||[]).length;
  if(morceaux!==1)
    throw new Error("un seul morceau attendu pour un seul trou : "+morceaux);
  /* ET ON PEUT LE CACHER SANS RIEN RELANCER : il est déjà dans le résultat. */
  SIM_XT.espacement=false;
  const sans=simRendreCrosstalk();
  if(sans.indexOf('class="simXtEsp"')>=0)
    throw new Error("le trait doit pouvoir se cacher");
  if(SIM_XT.res===null)
    throw new Error("cacher le profil ne doit rien jeter");
  if(sans.indexOf('id="simXtVoirEsp"')<0)
    throw new Error("le bouton doit rester pour le remontrer");
  SIM_XT.res=garde.r; SIM_XT.err=garde.e; SIM_XT.espacement=garde.v;
});

T("un pic que la géométrie n'explique pas est nommé, et distingué du plan",()=>{
  const garde={r:SIM_XT.res, e:SIM_XT.err, s:SIM_XT.sens};
  const r=simXtResEssai();
  r.desaccords=[
    {victime:"VIC_G", agresseur:"CLK", sens:"next", s:30, niveau:1,
     niveau_db:-30, espacement:0.55, median:0.2, rapport:2.75, tolerance:5.9,
     verdict:"inexplique", zone:"",
     detail:"l'espacement y vaut 0.550 mm, soit 2.75 fois l'espacement "+
            "médian du longement (0.200 mm), et il n'y varie pas de plus "+
            "de 10 %"},
    {victime:"VIC_G", agresseur:"CLK", sens:"next", s:10, niveau:0.8,
     niveau_db:-32, espacement:0.5, median:0.2, rapport:2.5, tolerance:5.9,
     verdict:"plan", zone:"fente", detail:"l'espacement y vaut 0.500 mm"}];
  SIM_XT.res=r; SIM_XT.err=""; SIM_XT.sens="next";
  const h=simRendreCrosstalk();
  if(h.indexOf("Recoupement carte")<0)
    throw new Error("le bloc de recoupement doit exister");
  if(h.indexOf("non justifié")<0)
    throw new Error("le pic inexpliqué doit être nommé comme tel");
  /* LES DEUX VERDICTS NE DEMANDENT PAS LE MÊME GESTE : « expliqué par le
     plan » désigne le blindage, « non justifié » ne désigne rien — et c'est
     pour cela qu'il faut aller voir. Les confondre ferait corriger le cuivre
     de masse là où le problème est ailleurs. */
  if(h.indexOf("expliqué par « fente »")<0)
    throw new Error("le pic qu'une zone explique doit le dire");
  if(h.indexOf("simXtPic-inexplique")<0||h.indexOf("simXtPic-plan")<0)
    throw new Error("les deux verdicts se marquent différemment sur la carte");
  /* ET RIEN N'EST MARQUÉ SUR LA COURBE DE FEXT : il ne localise rien à
     vitesses égales, et l'y marquer ferait pointer un millimètre qui ne veut
     rien dire. Les deux courbes étant maintenant affichées ensemble, c'est le
     BLOC du FEXT qu'on inspecte et non la figure entière — et le recoupement
     reste sur celle du NEXT quel que soit le sens PEINT. */
  SIM_XT.sens="fext";
  const f=simRendreCrosstalk();
  const bloc=(txt,cle)=>{
    const i=txt.indexOf('data-sens="'+cle+'"');
    return i<0?"":txt.slice(i,txt.indexOf("</g>",i));
  };
  if(bloc(f,"fext").indexOf("simXtPic")>=0)
    throw new Error("le FEXT n'est pas recoupé, donc rien ne s'y marque");
  if(bloc(f,"next").indexOf("simXtPic")<0)
    throw new Error("le recoupement se marque sur la courbe de NEXT, même "+
                    "quand c'est le FEXT qui peint les pistes");
  SIM_XT.res=garde.r; SIM_XT.err=garde.e; SIM_XT.sens=garde.s;
});

T("un écart entre deux victimes que la géométrie annonce n'est pas une alerte",()=>{
  const garde={r:SIM_XT.res, e:SIM_XT.err};
  const r=simXtResEssai();
  r.asymetries=[{agresseur:"CLK", haute:"VIC_G", basse:"VIC_D",
                 ecart_db:12, explique:true,
                 detail:"« VIC_G » prend 12.0 dB de plus que « VIC_D »"}];
  SIM_XT.res=r; SIM_XT.err="";
  let h=simRendreCrosstalk();
  if(h.indexOf("Écart annoncé par la géométrie")<0)
    throw new Error("un écart expliqué se lit, mais ne s'alarme pas");
  if(/ASYMÉTRIE non expliquée/.test(h))
    throw new Error("un agresseur équidistant de ses deux voisines à tout "+
                    "instant est l'exception : l'écart n'est pas une anomalie");
  r.asymetries[0].explique=false;
  h=simRendreCrosstalk();
  if(h.indexOf("ASYMÉTRIE non expliquée")<0)
    throw new Error("deux voisines à espacement comparable qui ne prennent "+
                    "pas la même chose désignent le PLAN, et cela s'alerte");
  SIM_XT.res=garde.r; SIM_XT.err=garde.e;
});

T("aucune coordonnée SVG ne porte de virgule décimale",()=>{
  /* CE DÉFAUT NE SE VOIT PAS EN LISANT LE CODE, ET IL COÛTE LE DESSIN ENTIER.
     `simNb` écrit la virgule décimale française — ce qu'il faut dans une fiche,
     et ce qu'un SVG ne sait pas lire : `x="123,45"` est un attribut invalide,
     ramené à zéro sans un mot, et `points="12,3 45,6"` se relit comme QUATRE
     nombres au lieu de deux paires. La carte devient alors un éventail de
     traits partant du même point, ce qui ressemble à un défaut de calcul et
     n'en est pas un. Une lecture de code ne l'attrape pas ; cet invariant si. */
  const garde={r:SIM_XT.res, e:SIM_XT.err, s:SIM_XT.sens, v:SIM_XT.espacement};
  const r=simXtResEssai([{type:"fente", s0:18, s1:19.5, detail:"fente"}]);
  r.desaccords=[{victime:"VIC_G", agresseur:"CLK", sens:"next", s:30,
                 niveau:1, niveau_db:-30, espacement:0.55, median:0.2,
                 rapport:2.75, tolerance:5.9, verdict:"inexplique", zone:"",
                 detail:"d"}];
  SIM_XT.res=r; SIM_XT.err=""; SIM_XT.sens="next"; SIM_XT.espacement=true;
  const svg=simRendreCrosstalk();
  /* LA VIRGULE EST UN SÉPARATEUR LÉGITIME dans `points` et dans `d` : ce qu'on
     interdit n'est pas la virgule, c'est la virgule ENTRE DEUX CHIFFRES d'un
     même nombre — qui fait lire trois nombres là où il en faut deux. On
     découpe donc en jetons numériques et l'on refuse ceux qui en portent. */
  const attrs=/\s(?:x|y|x1|y1|x2|y2|cx|cy|r|width|height|points|d)="([^"]*)"/g;
  let m;
  while((m=attrs.exec(svg))!==null)
    for(const jeton of (m[1].match(/-?\d+(?:[.,]\d+)?/g)||[]))
      if(jeton.indexOf(",")>=0)
        throw new Error("nombre à virgule dans une géométrie SVG : "+m[0]);
  SIM_XT.res=garde.r; SIM_XT.err=garde.e; SIM_XT.sens=garde.s;
  SIM_XT.espacement=garde.v;
});

T("la carte aligne les victimes sur un axe commun, et dit sa résolution",()=>{
  const garde={r:SIM_XT.res, e:SIM_XT.err, s:SIM_XT.sens};
  SIM_XT.res=simXtResEssai(); SIM_XT.err=""; SIM_XT.sens="next";
  const h=simRendreCrosstalk();
  if(h.indexOf("<svg")<0)throw new Error("la carte doit être dessinée");
  /* LA RÉSOLUTION EST SOUS LA CARTE, et c'est ce qui empêche de la lire au
     dixième de millimètre alors qu'elle ne distingue rien sous plusieurs. */
  if(h.indexOf("Résolution spatiale")<0||h.indexOf("5,90")<0)
    throw new Error("la résolution doit être affichée à côté du résultat");
  if(!/zero-padding interpole/.test(h))
    throw new Error("la fiche doit dire que le padding ne distingue rien");
  /* CHANGER DE SENS NE RELANCE RIEN : les deux sont dans le même résultat. */
  SIM_XT.sens="fext";
  const f=simRendreCrosstalk();
  if(f.indexOf("11,70")<0)
    throw new Error("le FEXT a sa propre résolution : "+f.slice(0,200));
  if(SIM_XT.res===null)
    throw new Error("changer de sens ne doit rien jeter");
  SIM_XT.res=garde.r; SIM_XT.err=garde.e; SIM_XT.sens=garde.s;
});

T("la figure porte les DEUX courbes, et AUCUN schéma de piste",()=>{
  /* LES DEUX SENS SONT DANS LE MÊME RÉSULTAT, et l'on ne pouvait en voir
     qu'un à la fois. Ils ne se lisent pas au même bout de la victime : les
     mettre l'un sous l'autre, sur le même axe, est la seule façon de voir que
     le pic de l'un ne tombe pas où le pic de l'autre tombe. */
  const garde={r:SIM_XT.res, e:SIM_XT.err, s:SIM_XT.sens};
  SIM_XT.res=simXtResEssai(); SIM_XT.err=""; SIM_XT.sens="next";
  const h=simRendreCrosstalk();
  for(const cle of ["next","fext"])
    if(h.indexOf('data-sens="'+cle+'"')<0)
      throw new Error("la courbe de "+cle+" doit être tracée");
  if((h.match(/class="simXtCourbe"/g)||[]).length!==2)
    throw new Error("une courbe par victime et par sens, ni plus ni moins");
  /* LA PISTE DE LA VICTIME N'EST PAS DANS LE PANNEAU, et c'est délibéré : la
     vraie est sur la carte, avec ses coudes et ses vias. Un ruban approché à
     côté obligeait à faire la correspondance de tête — exactement le travail
     que la réglette fait maintenant toute seule. */
  if(/class="simXtPiste/.test(h))
    throw new Error("le schéma de piste est parti sur le cuivre : il ne doit "+
                    "pas revenir dans le panneau");
  SIM_XT.res=garde.r; SIM_XT.err=garde.e; SIM_XT.sens=garde.s;
});

T("la réglette dit COMBIEN à l'endroit désigné, et ne relance rien",()=>{
  /* UNE CARTE DE CHALEUR MONTRE OÙ, JAMAIS COMBIEN : on lit « c'est rouge »,
     on ne lit pas « 3,00 % ». C'est la lecture chiffrée qui répond, et c'est
     la même correction que la sonde de la chute DC a reçue. */
  const garde={r:SIM_XT.res, e:SIM_XT.err, p:SIM_XT.pos};
  SIM_XT.res=simXtResEssai(); SIM_XT.err=""; SIM_XT.pos=0;
  const h=simRendreCrosstalk();
  if(h.indexOf('id="simXtPos"')<0||h.indexOf('id="simXtLect"')<0)
    throw new Error("la réglette et sa lecture doivent exister");
  if(h.indexOf('id="simXtCur"')<0||h.indexOf("simXtPt")<0)
    throw new Error("le trait et les points doivent désigner le même endroit "+
                    "sur la piste et sur les deux courbes");
  /* L'AXE DE L'ESSAI VA DE 0 À 40 mm EN CINQ POINTS : le deuxième cran vaut
     10 mm, et le NEXT y vaut 0,03 — soit 3,00 % de l'agresseur. */
  const lu=simXtLectureLignes(1);
  if(lu.indexOf("VIC_G")<0||lu.indexOf("3,00 %")<0)
    throw new Error("la lecture doit chiffrer le point désigné : "+lu);
  if(lu.indexOf("écart 0,200 mm")<0)
    throw new Error("l'écart mesuré se rappelle à côté du chiffre : c'est lui "+
                    "qui l'explique, ou ne l'explique pas");
  /* ET LÀ OÙ LA VICTIME NE LONGE PAS, on le dit plutôt que d'écrire un écart
     nul, qui se lirait comme un contact. */
  if(simXtLectureLignes(0).indexOf("ne longe pas ici")<0)
    throw new Error("un trou du profil se dit, il ne vaut pas zéro");
  /* BOUGER LE CURSEUR NE JETTE RIEN ET NE RELANCE RIEN : le résultat porte
     déjà tous les points. */
  simXtCurseurPoser(4);
  if(SIM_XT.res===null)throw new Error("la réglette ne doit rien jeter");
  if(Math.abs(SIM_XT.pos-1)>1e-9)
    throw new Error("le dernier cran est le bout du parcours : "+SIM_XT.pos);
  SIM_XT.res=garde.r; SIM_XT.err=garde.e; SIM_XT.pos=garde.p;
});

T("décocher une victime l'éteint partout, sans rien relancer",()=>{
  /* CINQ VICTIMES SUR UNE FIGURE, c'est cinq pistes, dix courbes et cinq
     lignes de lecture : lisible tant qu'on les regarde toutes, illisible dès
     qu'on en suit UNE. La case est donc ce qui permet de comparer, pas un
     filtre de confort — et elle vaut aussi pour le cuivre, sans quoi la carte
     montrerait une victime que la figure vient d'éteindre. */
  const garde={r:SIM_XT.res, e:SIM_XT.err, c:SIM_XT.caches};
  SIM_XT.res=simXtResEssai(); SIM_XT.err=""; SIM_XT.caches={};
  const avant=simRendreCrosstalk();
  if(avant.indexOf('data-xtvic="VIC_G"')<0)
    throw new Error("chaque victime doit avoir sa case");
  if(avant.indexOf("simXtCourbe")<0)
    throw new Error("cochée, ses courbes se tracent");
  if(!simXtVictimesVues().length)
    throw new Error("cochée, elle est peinte sur le cuivre");
  SIM_XT.caches={VIC_G:true};
  const apres=simRendreCrosstalk();
  if(apres.indexOf("simXtCourbe")>=0)
    throw new Error("décochée, ses courbes s'éteignent");
  if(simXtVictimesVues().length)
    throw new Error("décochée, elle n'est plus peinte sur le cuivre non plus");
  if(apres.indexOf('data-xtvic="VIC_G"')<0)
    throw new Error("sa case doit rester, sinon on ne peut plus la rallumer");
  if(SIM_XT.res===null)
    throw new Error("éteindre une victime ne doit rien jeter : les deux sens "+
                    "sont déjà dans le résultat");
  /* SES PLAGES SUR LE CUIVRE S'ÉTEIGNENT AVEC ELLE : c'est éprouvé plus bas,
     là où la géométrie du cuivre existe pour de bon. */
  SIM_XT.res=garde.r; SIM_XT.err=garde.e; SIM_XT.caches=garde.c||{};
});

T("une candidate sous le seuil garde ses courbes, et ne compte nulle part",()=>{
  /* UNE FIGURE VIDE EST LA PIRE DES RÉPONSES. « Aucun couple confirmé » avec
     rien à regarder se lit « aucun couplage », alors que le fait est « du
     couplage, sous le seuil que VOUS avez posé » — et le seuil, lui, ne se
     voit pas. Les courbes sont donc tracées dans tous les cas ; ce qui reste
     réservé aux confirmées est ce qui PORTE UN VERDICT. */
  const garde={r:SIM_XT.res, e:SIM_XT.err, c:SIM_XT.caches};
  SIM_XT.res=simXtResEssai(); SIM_XT.err=""; SIM_XT.caches={};
  const parNet={};
  for(const f of simXtFiches(SIM_XT.res))parNet[f.net]=f;
  if(!parNet.VIC_D)
    throw new Error("la candidate sous le seuil doit avoir sa fiche");
  if(parNet.VIC_D.confirmee||!parNet.VIC_G.confirmee)
    throw new Error("l'étiquette vient de la ligne tracée, pas d'ailleurs");
  /* ELLE ATTEND SA CASE, ET C'EST LA DEUXIÈME MOITIÉ DE LA RÈGLE : neuf
     candidates allumées d'office pour une seule qui compte donnent une figure
     illisible, ce qui n'est pas mieux qu'une figure vide. */
  if(!parNet.VIC_G.visible)
    throw new Error("une confirmée s'allume toute seule");
  if(parNet.VIC_D.visible)
    throw new Error("tant qu'il y a une confirmée à regarder, la candidate "+
                    "sous le seuil attend qu'on la coche");
  const h=simRendreCrosstalk();
  if(h.indexOf('data-xtvic="VIC_D"')<0)
    throw new Error("sa case doit exister, sinon on ne peut pas l'allumer");
  if(h.indexOf("sous le seuil")<0)
    throw new Error("sa case doit dire pourquoi elle est éteinte");
  /* ET SON CHIFFRE NE S'ARRONDIT PAS À ZÉRO. Son NEXT vaut 0,06 % : écrit
     « 0,00 % » à deux décimales, il se lirait « rien » — exactement le
     contresens que ces courbes-là sont venues corriger. */
  if(simXtPct(0.0006)!=="0,0600")
    throw new Error("le pour-cent doit suivre l'ordre de grandeur : "+
                    simXtPct(0.0006));
  if(h.indexOf("0,0600 %")<0)
    throw new Error("la case doit chiffrer ce qu'elle prend, pas un zéro");
  /* COCHÉE À LA MAIN, elle se trace ET se peint : la figure et le cuivre
     parlent des mêmes victimes, confirmées ou non. */
  SIM_XT.caches={VIC_D:false};
  const h2=simRendreCrosstalk();
  const svg=h2.slice(h2.indexOf("<svg"),h2.indexOf("</svg>"));
  if(svg.indexOf("VIC_D")<0)
    throw new Error("cochée, sa courbe se trace");
  if(simXtVictimesVues().indexOf("VIC_D")<0)
    throw new Error("cochée, son cuivre se peint comme les autres");
  /* AUCUNE CONFIRMÉE : TOUT S'ALLUME. C'est le cas qui a motivé tout ceci —
     une bande trop basse, neuf candidates sous le seuil, et un écran qui ne
     montrait rien. */
  const r2=simXtResEssai();
  for(const l of r2.carte_chaleur.lignes)l.confirmee=false;
  for(const c of r2.couples)c.confirmee=false;
  r2.victimes=[]; r2.risques=[];
  SIM_XT.res=r2; SIM_XT.caches={};
  if(!simXtFiches(r2).every(f=>f.visible))
    throw new Error("aucune confirmée : tout s'allume, sans quoi la figure "+
                    "serait vide et se lirait « aucun couplage »");
  const h3=simRendreCrosstalk();
  if((h3.match(/class="simXtCourbe"/g)||[]).length!==4)
    throw new Error("les deux sens des deux candidates doivent être tracés");
  if(h3.indexOf("AUCUN COUPLE CONFIRMÉ")<0)
    throw new Error("le verdict reste ce qu'il est : aucune n'est confirmée");
  /* ET LE RÉSUMÉ NOMME LA PLUS COUPLÉE AVEC SON NIVEAU, à côté du seuil qui
     l'a écartée : les deux ensemble disent d'un coup d'œil si l'on est à trois
     décibels du seuil ou à trente. */
  if(h3.indexOf("la plus couplée est")<0||h3.indexOf("-8,1")<0)
    throw new Error("le résumé doit nommer la plus couplée et la chiffrer");
  if(h3.indexOf("-40,0 dB")<0)
    throw new Error("le seuil qui l'a écartée se lit à côté d'elle");
  SIM_XT.res=garde.r; SIM_XT.err=garde.e; SIM_XT.caches=garde.c||{};
});

T("les réglages se replient, et la rangée qui lance reste",()=>{
  /* LES RÉGLAGES DU CROSSTALK FONT UNE PLEINE HAUTEUR D'ÉCRAN, et l'on passe
     son temps à faire défiler entre la réglette et les courbes qu'elle
     commande. Les replier est un geste de mise en page — RIEN ne doit
     disparaître avec eux, et surtout pas le bouton qui relance : on aurait
     troqué de la place contre une impasse. */
  /* L'ONGLET DOIT ÊTRE UNE ANALYSE QUI EXISTE : le bouton de repli ne paraît
     que sous une analyse calculable, et un banc qui laisserait `SIM.analyse`
     sur un onglet retiré verrait disparaître un bouton qui va très bien. */
  const garde={p:SIM.plie, a:SIM.analyse};
  SIM.plie=false; SIM.analyse="crosstalk";
  const ouvert=simOnglets();
  if(ouvert.indexOf('id="simPlier"')<0)
    throw new Error("le bouton de repli doit être au bout des onglets, où il "+
                    "vaut pour toutes les analyses");
  if(ouvert.indexOf("▾ réglages")<0)
    throw new Error("déplié, le bouton doit le montrer");
  SIM.plie=true;
  if(simOnglets().indexOf("▸ réglages")<0)
    throw new Error("replié aussi");
  /* LA CLASSE EST POSÉE À UN SEUL ENDROIT, et c'est la feuille de style qui
     décide ensuite ce qui disparaît. */
  const ctl=document.getElementById("simCtl");
  simPlierAppliquer();
  if(!ctl.classList.contains("simPlie"))
    throw new Error("replié, le corps des réglages doit porter la marque");
  SIM.plie=false;
  simPlierAppliquer();
  if(ctl.classList.contains("simPlie"))
    throw new Error("déplié, elle s'en va");
  /* CHAQUE ANALYSE GARDE UNE RANGÉE QUI PORTE SON BOUTON D'ACTION. Prendre
     « la dernière rangée » aurait caché le « Calculer » de la chute DC, qui
     vit au milieu de ses réglages : c'est la rangée qui se marque elle-même,
     là où elle s'écrit. */
  const rangees=(txt)=>{
    const out=[];
    let i=txt.indexOf('<div class="pnl-bar');
    while(i>=0){
      const j=txt.indexOf('<div class="pnl-bar',i+1);
      out.push(txt.slice(i,j<0?txt.length:j));
      i=j;
    }
    return out;
  };
  for(const cle of Object.keys(SIM_ANALYSES)){
    const a=SIM_ANALYSES[cle];
    if(!a||!a.corps)continue;
    const fixes=rangees(a.corps()).filter(b=>b.indexOf("simBarFixe")>=0);
    if(!fixes.length)
      throw new Error("« "+cle+" » : aucune rangée ne survit au repli");
    if(!fixes.some(b=>/id="sim\w*Go"/.test(b)))
      throw new Error("« "+cle+" » : la rangée qui survit doit être celle qui "+
                      "porte le bouton d'action, sinon on ne peut plus "+
                      "relancer sans déplier");
  }
  SIM.analyse=garde.a;
  SIM.plie=garde.p;
});

T("les zones du plan se superposent à la carte sans se confondre avec elle",()=>{
  const garde={r:SIM_XT.res, e:SIM_XT.err};
  const zones=[{type:"couture", s0:4, s1:30, pas:26, cote:"gauche",
                detail:"pas de couture de 26.00 mm"},
               {type:"fente", s0:18, s1:19.5,
                detail:"fente du plan de référence"}];
  SIM_XT.res=simXtResEssai(zones); SIM_XT.err="";
  const h=simRendreCrosstalk();
  /* HACHURÉES ET NON COLORÉES : elles ne sortent pas de la matrice S, et un
     aplat par-dessus une cellule donnerait une troisième couleur qu'on lirait
     comme une amplitude. */
  if(h.indexOf("simXtH-couture")<0||h.indexOf("simXtH-fente")<0)
    throw new Error("chaque type de zone a son motif");
  if(h.indexOf("<pattern")<0)
    throw new Error("les zones doivent être hachurées, pas peintes en aplat");
  /* ET LE DÉTAIL EST LISIBLE AILLEURS QUE SUR LA CARTE : un survol ne se
     recopie pas dans un compte rendu. */
  if(h.indexOf("Plan de référence")<0||h.indexOf("pas de couture")<0)
    throw new Error("le tableau du plan doit reprendre les zones");
  if(h.indexOf("fente du plan")<0)
    throw new Error("la fente doit y figurer aussi, avec son abscisse");
  SIM_XT.res=garde.r; SIM_XT.err=garde.e;
});

T("une matrice non passive est dénoncée avant la carte, pas après",()=>{
  const garde={r:SIM_XT.res, e:SIM_XT.err};
  const r=simXtResEssai();
  r.validation.passivite={ok:false, sigma_max:1.21, f:1.2e10};
  /* LE SERVEUR MARQUE À LA SOURCE ce qui change la lecture — la page ne le
     devine pas au texte, ce qui finirait par en laisser passer un. */
  r.avertissements=["MATRICE NON PASSIVE : la plus grande valeur singulière "+
                    "vaut 1.210000 à 12 GHz."];
  r.graves=[{titre:"matrice NON PASSIVE : la carte peut être fausse",
             texte:r.avertissements[0]}];
  SIM_XT.res=r; SIM_XT.err="";
  const h=simRendreCrosstalk();
  const iAvert=h.indexOf("MATRICE NON PASSIVE");
  const iCarte=h.indexOf("Carte du couplage");
  if(iAvert<0)throw new Error("le défaut de passivité doit être affiché");
  if(!(iAvert<iCarte))
    throw new Error("ce qui rend la carte fausse se lit AVANT elle : sinon on "+
                    "regarde de belles couleurs avant d'apprendre qu'elles ne "+
                    "veulent rien dire");
  if(h.indexOf("simKo")<0)
    throw new Error("le tableau de validation doit marquer l'échec");
  SIM_XT.res=garde.r; SIM_XT.err=garde.e;
});

T("un plan qu'on n'a pas pu sonder ne se lit pas « rien à signaler »",()=>{
  const garde={r:SIM_XT.res, e:SIM_XT.err};
  const r=simXtResEssai();
  r.masse={seuil:0.75, source:"λ/10", zones:[], mesure:[], longueur:40};
  SIM_XT.res=r; SIM_XT.err="";
  const h=simRendreCrosstalk();
  if(h.indexOf("Rien n'a pu être examiné")<0)
    throw new Error("l'absence d'examen doit être dite : une liste vide se "+
                    "lit « rien à signaler », ce qui est le contraire");
  SIM_XT.res=garde.r; SIM_XT.err=garde.e;
});

/* ==========================================================================
   CE QUE SEULE LA PAGE PEUT MESURER
   --------------------------------------------------------------------------
   Trois choses que le serveur ne peut pas deviner et sans lesquelles les
   contrôles de plan de référence ne diraient RIEN : les positions des vias de
   couture le long du parcours, les fentes du plan, et les vias de masse.
   ========================================================================== */

/* Une liaison droite de 40 mm sur la couche 0, cousue de vias de masse. */
function simXtBancCarte(coudre){
  carte4c();
  S.cuts=[]; S.vias=[]; S.zones=[];
  const t={l:0, net:"CLK", w:SIM_W, x1:SIM_X1, y1:SIM_Y, x2:SIM_X2, y2:SIM_Y};
  S.tracks.push(t);
  clearSel(); S.sel.tracks.add(t);
  if(coudre)
    for(const x of coudre)
      S.vias.push({x:x, y:SIM_Y+1.0, d:0.6, drill:0.3, a:0, b:3, net:"GND"});
  SIM.refCle=null; SIM.refAuto=true; SIM.ref=null;
  touch();
  return t;
}

/* ==========================================================================
   LES ZONES À RISQUE, POSÉES SUR LE CUIVRE DE LA VICTIME
   --------------------------------------------------------------------------
   LA CARTE DU PANNEAU RÉPOND À « LAQUELLE PREND LE PLUS » ; ces zones-là
   répondent à « quel millimètre de CELLE-CI reprendre », et c'est le même
   chiffre posé là où l'on corrige. Ce qui doit être défendu est la GÉOMÉTRIE :
   une plage peinte au mauvais endroit, ou sur la mauvaise piste, est le pire
   des résultats — visiblement précis, et faux.
   ========================================================================== */

T("une zone à risque se pose sur le cuivre de SA victime, et nulle part ailleurs",()=>{
  const garde={r:SIM_XT.res, a:SIM.analyse, o:SIM.ouvert, z:SIM_XT.risques};
  simXtBancCarte([]);
  /* Une victime qui longe l'agresseur de bout en bout, 0,5 mm plus haut, et
     une piste LOINTAINE qui ne longe rien : la seconde ne doit jamais être
     peinte, quoi qu'il arrive. */
  const vic={l:0, net:"VIC", w:SIM_W,
             x1:SIM_X1, y1:SIM_Y+0.5, x2:SIM_X2, y2:SIM_Y+0.5};
  const loin={l:0, net:"VIC", w:SIM_W,
              x1:SIM_X1, y1:SIM_Y+20, x2:SIM_X2, y2:SIM_Y+20};
  S.tracks.push(vic,loin);
  touch();

  SIM.ouvert=true; SIM.analyse="crosstalk"; SIM_XT.risques=true;
  SIM_XT.res={etape0:{candidats:[], seuils:{distance_max:0.75},
                      retenus:["VIC"], espacements:{}},
              couples:[], carte_chaleur:null, masse:{zones:[], mesure:[]},
              agresseurs:["CLK"], principal:"CLK", longueur:40,
              reglages:{}, avertissements:[], hypotheses:[],
              risques:[{victime:"VIC", agresseur:"CLK", s0:10, s1:20,
                        niveau:1, niveau_db:-30, justifie:true, zone:""}]};
  const zones=simXtRisqueGeom();
  if(zones.length!==1)
    throw new Error("une zone attendue, "+zones.length);
  const traits=zones[0].traits;
  if(!traits.length)throw new Error("la zone ne porte aucun trait");
  const xs=[], ys=[];
  for(const m of traits)
    for(let i=0;i+1<m.length;i+=2){xs.push(m[i]);ys.push(m[i+1]);}
  /* ELLE TOMBE SUR LA VICTIME, pas sur l'agresseur : l'ordonnée le dit. */
  if(Math.min(...ys)<SIM_Y+0.4||Math.max(...ys)>SIM_Y+0.6)
    throw new Error("le trait n'est pas sur la victime : y de "+
                    Math.min(...ys)+" à "+Math.max(...ys));
  /* ET DANS LA PLAGE, à un pas d'échantillonnage près. L'agresseur commence à
     SIM_X1, donc l'abscisse 10 mm est en SIM_X1+10. */
  const tol=SIM_XT_PAS_TRAIT+0.01;
  if(Math.min(...xs)<SIM_X1+10-tol||Math.max(...xs)>SIM_X1+20+tol)
    throw new Error("le trait déborde la plage : x de "+Math.min(...xs)+
                    " à "+Math.max(...xs));
  if(Math.min(...xs)>SIM_X1+10+1||Math.max(...xs)<SIM_X1+20-1)
    throw new Error("le trait ne couvre pas la plage : x de "+
                    Math.min(...xs)+" à "+Math.max(...xs));
  /* LA PISTE LOINTAINE PORTE LE MÊME NET et ne doit rien recevoir : c'est le
     couloir qui l'écarte, et sans lui on peindrait du cuivre qui ne longe
     rien. */
  if(Math.max(...ys)>SIM_Y+1)
    throw new Error("une piste hors du couloir a été peinte");

  /* UNE VICTIME DÉCOCHÉE DANS LA FIGURE NE SE PEINT PLUS ICI : la figure du
     panneau et le cuivre doivent parler des MÊMES victimes, sinon on va
     reprendre une piste qu'on vient d'éteindre à l'écran. */
  const gardeC=SIM_XT.caches;
  SIM_XT.caches={VIC:true};
  if(simXtRisqueGeom().length)
    throw new Error("une victime éteinte ne se peint plus sur le cuivre");
  SIM_XT.caches=gardeC||{};
  if(simXtRisqueGeom().length!==1)
    throw new Error("rallumée, elle revient — et sans que la géométrie ait "+
                    "été recalculée : le filtre est posé à la sortie");

  /* ÉTEINDRE LA SURIMPRESSION N'EFFACE PAS LE RÉSULTAT : c'est un geste
     d'affichage, comme le sens peint. */
  SIM_XT.risques=false;
  if(simXtRisques().length)
    throw new Error("éteinte, la surimpression ne rend plus rien");
  if(!SIM_XT.res)throw new Error("l'éteindre ne doit rien jeter");
  /* ET ELLE SUIT SON ONGLET : elle désignerait sinon du cuivre sous une fiche
     qui n'en parle pas. */
  SIM_XT.risques=true; SIM.analyse="impedance";
  if(simXtRisques().length)
    throw new Error("la surimpression ne survit pas au changement d'onglet");

  SIM_XT.res=garde.r; SIM.analyse=garde.a; SIM.ouvert=garde.o;
  SIM_XT.risques=garde.z;
});

T("le point de la réglette se pose sur le cuivre de la VRAIE victime",()=>{
  /* C'EST LUI QUI RECOUD LA FIGURE ET LE DESSIN. « Ce pic-ci, c'est CE
     millimètre-là de CETTE piste » ne se lit nulle part ailleurs : la figure
     donne une abscisse le long du parcours, et une abscisse ne se retrouve sur
     le cuivre qu'à la règle. Ce qui doit être défendu est donc la GÉOMÉTRIE —
     un point posé au mauvais endroit, ou sur la mauvaise piste, est le pire
     des résultats : visiblement précis, et faux. */
  const garde={r:SIM_XT.res, a:SIM.analyse, o:SIM.ouvert, p:SIM_XT.pos,
               c:SIM_XT.caches};
  simXtBancCarte([]);
  const vic={l:0, net:"VIC", w:SIM_W,
             x1:SIM_X1, y1:SIM_Y+0.5, x2:SIM_X2, y2:SIM_Y+0.5};
  const loin={l:0, net:"LOIN", w:SIM_W,
              x1:SIM_X1, y1:SIM_Y+20, x2:SIM_X2, y2:SIM_Y+20};
  S.tracks.push(vic,loin);
  touch();
  SIM.ouvert=true; SIM.analyse="crosstalk"; SIM_XT.caches={};
  SIM_XT.res={etape0:{candidats:[], seuils:{distance_max:0.75},
                      retenus:["VIC"], espacements:{}},
              couples:[{agresseur:"CLK", victime:"VIC", confirmee:true,
                        cote:"gauche", pire_db:-20}],
              victimes:["VIC"], risques:[], reglages:{},
              carte_chaleur:{axe:[0,10,20,30,40], max:0.03, zones:[],
                espacements:{},
                lignes:[{agresseur:"CLK", victime:"VIC", sens:"next",
                         valeurs:[0.001,0.03,0.02,0.01,0.005], max:0.03,
                         resolution:2}]},
              masse:{zones:[], mesure:[]}, agresseurs:["CLK"],
              principal:"CLK", longueur:40, avertissements:[], hypotheses:[]};
  /* LE DEUXIÈME CRAN SUR CINQ : 10 mm le long du parcours, et le parcours
     commence en SIM_X1. Le point doit donc tomber en x = SIM_X1 + 10, SUR la
     victime — pas sur l'agresseur, qui est 0,5 mm plus bas. */
  SIM_XT.pos=0.25;
  const pts=simXtCurseurPoints();
  if(pts.length!==1)
    throw new Error("un point attendu sur la seule victime affichée, "+
                    pts.length);
  if(pts[0].net!=="VIC")
    throw new Error("le point est sur la mauvaise piste : "+pts[0].net);
  if(Math.abs(pts[0].x-(SIM_X1+10))>SIM_XT_PAS_TRAIT+0.01)
    throw new Error("le point n'est pas à l'abscisse demandée : x="+pts[0].x);
  if(Math.abs(pts[0].y-(SIM_Y+0.5))>0.01)
    throw new Error("le point n'est pas sur le cuivre de la victime : y="+
                    pts[0].y);
  /* ET L'AGRESSEUR PORTE LE SIEN, à la même abscisse : c'est de son parcours
     que l'abscisse se compte, et deux points sur des victimes sans origine ne
     disent pas d'où ils se mesurent. */
  const agr=simXtCurseurAgresseur();
  if(!agr||Math.abs(agr.x-(SIM_X1+10))>0.01||Math.abs(agr.y-SIM_Y)>0.01)
    throw new Error("le point de l'agresseur doit suivre son parcours : "+
                    JSON.stringify(agr));
  /* LA PISTE LOINTAINE N'EN PORTE JAMAIS : elle ne longe rien, le serveur ne
     l'a pas retenue, et un point sur elle désignerait un couplage qui
     n'existe pas. */
  if(pts.some(q=>q.net==="LOIN"))
    throw new Error("une piste hors du couloir a reçu un point");
  /* DÉCOCHÉE, LA VICTIME N'EN PORTE PLUS : la figure et le cuivre parlent des
     mêmes victimes. */
  SIM_XT.caches={VIC:true};
  if(simXtCurseurPoints().length)
    throw new Error("une victime éteinte ne porte pas de point");
  /* ET LE POINT SUIT SON ONGLET : il désignerait sinon du cuivre sous une
     fiche qui n'en parle pas. */
  SIM_XT.caches={}; SIM.analyse="impedance";
  if(simXtCurseurPoints().length)
    throw new Error("le point ne survit pas au changement d'onglet");
  SIM_XT.res=garde.r; SIM.analyse=garde.a; SIM.ouvert=garde.o;
  SIM_XT.pos=garde.p; SIM_XT.caches=garde.c||{};
});

T("une victime qui s'écarte au milieu donne DEUX morceaux, jamais un trait qui traverse",()=>{
  /* UN TROU RESTE UN TROU, et c'est la même règle que le profil d'espacement :
     une victime qui contourne un composant ne couple pas dans le détour, et un
     trait continu ferait croire le contraire — sur le dessin, à l'endroit
     exact où l'on regarde. */
  const garde={r:SIM_XT.res, a:SIM.analyse, o:SIM.ouvert};
  simXtBancCarte([]);
  const pres=y=>({l:0, net:"VIC", w:SIM_W,
                  x1:SIM_X1, y1:y, x2:SIM_X2, y2:y});
  /* Deux morceaux proches, séparés par un troisième qui s'éloigne. */
  S.tracks.push({l:0, net:"VIC", w:SIM_W, x1:SIM_X1+8, y1:SIM_Y+0.5,
                 x2:SIM_X1+13, y2:SIM_Y+0.5});
  S.tracks.push({l:0, net:"VIC", w:SIM_W, x1:SIM_X1+13, y1:SIM_Y+0.5,
                 x2:SIM_X1+16, y2:SIM_Y+9});
  S.tracks.push({l:0, net:"VIC", w:SIM_W, x1:SIM_X1+17, y1:SIM_Y+0.5,
                 x2:SIM_X1+22, y2:SIM_Y+0.5});
  touch();
  SIM.ouvert=true; SIM.analyse="crosstalk"; SIM_XT.risques=true;
  SIM_XT.res={etape0:{candidats:[], seuils:{distance_max:0.75},
                      retenus:["VIC"], espacements:{}},
              couples:[], carte_chaleur:null, masse:{zones:[], mesure:[]},
              agresseurs:["CLK"], principal:"CLK", longueur:40,
              reglages:{}, avertissements:[], hypotheses:[],
              risques:[{victime:"VIC", agresseur:"CLK", s0:5, s1:25,
                        niveau:1, niveau_db:-30, justifie:false, zone:""}]};
  const zones=simXtRisqueGeom();
  if(!zones.length)throw new Error("la zone doit exister");
  if(zones[0].traits.length<2)
    throw new Error("le détour doit couper le trait en deux : "+
                    zones[0].traits.length+" morceau(x)");
  /* ET LA COULEUR DIT LE VERDICT AVANT LE NIVEAU : non justifiée, donc rouge. */
  const c=simXtRisqueCouleur(zones[0]);
  if(!/^rgba\(232,68,58/.test(c))
    throw new Error("une zone non justifiée se peint en rouge : "+c);
  const vert=simXtRisqueCouleur({justifie:true, niveau:1});
  if(!/^rgba\(232,164,58/.test(vert))
    throw new Error("une zone justifiée se peint en ambre : "+vert);
  SIM_XT.res=garde.r; SIM.analyse=garde.a; SIM.ouvert=garde.o;
});

T("les vias de couture sont projetés sur l'abscisse du parcours",()=>{
  simXtBancCarte([SIM_X1+5, SIM_X1+20]);
  const refs=simRefSet();
  const par=simXtParcours(simSegments(null));
  if(Math.abs(par.total-(SIM_X2-SIM_X1))>0.01)
    throw new Error("le parcours doit faire 40 mm : "+par.total);
  const pos=simXtCouture(par,refs);
  if(pos.length!==2)
    throw new Error("deux vias de couture attendus, "+pos.length);
  /* L'ABSCISSE EST CELLE DU PARCOURS, pas la coordonnée de la carte : c'est
     elle qui met un via de couture et un pic de couplage au même endroit sur
     la carte, et c'est toute la raison d'être de cette projection. */
  if(Math.abs(pos[0].s-5)>0.05||Math.abs(pos[1].s-20)>0.05)
    throw new Error("abscisses attendues 5 et 20 mm : "+JSON.stringify(pos));
  /* ET LE CÔTÉ SUIT : les deux vias sont du même bord, donc du même signe. */
  if(pos[0].cote!==pos[1].cote)
    throw new Error("deux vias du même bord doivent avoir le même côté");
});

T("un via de masse hors couloir n'est pas une couture",()=>{
  simXtBancCarte([]);
  S.vias.push({x:SIM_X1+10, y:SIM_Y+8, d:0.6, drill:0.3, a:0, b:3, net:"GND"});
  touch();
  const par=simXtParcours(simSegments(null));
  const pos=simXtCouture(par,simRefSet());
  if(pos.length)
    throw new Error("un via à 8 mm de la piste ne la coud pas : "+
                    JSON.stringify(pos));
});

T("un plan qu'on ne sait pas sonder rend null, jamais une liste vide",()=>{
  simXtBancCarte([]);
  /* AUCUNE ZONE SUR LES COUCHES DE PLAN : on ne SAIT pas où le cuivre est, ce
     qui n'est pas la même chose que savoir qu'il est partout. Rendre une liste
     vide ferait écrire « aucune zone de vigilance » sous un contrôle qui n'a
     jamais eu lieu. */
  S.zones=[]; touch();
  const par=simXtParcours(simSegments(null));
  if(simXtFentes(par,simRefSet())!==null)
    throw new Error("sans zone de plan, on ne sait pas sonder : il faut null");
});

T("une fente du plan sous le parcours est trouvée et localisée",()=>{
  simXtBancCarte([]);
  /* LE PLAN, EN DEUX MORCEAUX : il s'arrête à 10 mm du départ et reprend
     10 mm plus loin. C'est exactement ce que fait une découpe de plan sous une
     piste, et c'est ce qui produit un pic de couplage là où le plan paraît
     continu partout ailleurs. */
  const plan=1;
  const bande=(x1,x2)=>({l:plan, net:"GND",
    pts:[{x:x1,y:SIM_Y-5},{x:x2,y:SIM_Y-5},{x:x2,y:SIM_Y+5},{x:x1,y:SIM_Y+5}]});
  S.zones=[bande(0,SIM_X1+10), bande(SIM_X1+20,60)];
  touch();
  const par=simXtParcours(simSegments(null));
  const f=simXtFentes(par,simRefSet());
  if(!f||!f.length)
    throw new Error("la fente doit être trouvée : "+JSON.stringify(f));
  const t=f[0];
  if(Math.abs(t.s-10)>1.0)
    throw new Error("la fente commence vers 10 mm : "+JSON.stringify(t));
  if(Math.abs(t.longueur-10)>1.5)
    throw new Error("elle dure une dizaine de millimètres : "+
                    JSON.stringify(t));
  if(!t.quoi)throw new Error("une zone doit dire ce qui a été vu");
  /* ET UN PLAN CONTINU N'EN A PAS. */
  S.zones=[bande(0,60)]; touch();
  const rien=simXtFentes(simXtParcours(simSegments(null)),simRefSet());
  if(rien===null||rien.length)
    throw new Error("un plan continu n'a pas de fente : "+
                    JSON.stringify(rien));
});

T("le voisinage du crosstalk voit les couches adjacentes, pas celui de la diaphonie",()=>{
  simXtBancCarte([]);
  /* UNE VOISINE SUR LA COUCHE D'À CÔTÉ. La section droite de l'onglet
     Diaphonie n'a qu'un plan de conducteurs et ne sait pas la décrire ; la
     présélection du crosstalk, elle, doit la VOIR — deux pistes superposées
     couplent souvent plus que les mêmes côte à côte, et les écarter d'office
     se lirait comme un couplage nul. */
  S.tracks.push({l:1, net:"DESSOUS", w:SIM_W,
                 x1:SIM_X1, y1:SIM_Y, x2:SIM_X2, y2:SIM_Y});
  touch();
  const plat=simVoisinagePcb(null,false).map(v=>v.net);
  const large=simVoisinagePcb(null,true).map(v=>v.net);
  if(plat.indexOf("DESSOUS")>=0)
    throw new Error("sans les couches adjacentes, elle n'a rien à faire là");
  if(large.indexOf("DESSOUS")<0)
    throw new Error("le crosstalk doit la voir : "+large.join(","));
});

T("le problème de crosstalk porte ce que seule la page peut mesurer",()=>{
  simXtBancCarte([SIM_X1+5, SIM_X1+20]);
  S.tracks.push({l:0, net:"VIC", w:SIM_W,
                 x1:SIM_X1, y1:SIM_Y+0.8, x2:SIM_X2, y2:SIM_Y+0.8});
  const plan=1;
  S.zones=[{l:plan, net:"GND",
            pts:[{x:0,y:0},{x:60,y:0},{x:60,y:40},{x:0,y:40}]}];
  touch();
  /* ON PASSE PAR LE CHEMIN REEL — `simXtProbleme` du module commun, qui
     estampille le format et pose les réglages, exactement comme `simDocFinir`
     le fait pour la simulation. Interroger l'adaptateur seul sauterait la
     moitié du contrat. */
  const p=simXtProbleme();
  if(!p)throw new Error("refus inattendu : "+SIM_XT.err);
  const d=p.doc;
  if(d.format!=="cao-crosstalk-1")
    throw new Error("format : "+d.format);
  if(!d.agresseurs||d.agresseurs[0]!=="CLK")
    throw new Error("l'agresseur est la sélection : "+
                    JSON.stringify(d.agresseurs));
  if(!d.couture||!d.couture.positions.length)
    throw new Error("les positions de couture doivent partir");
  if(!d.vias_masse||!d.vias_masse.length)
    throw new Error("les vias de masse doivent partir");
  /* LE PLAN EST PLEIN : on a su sonder, et il n'y a pas de fente. Le champ
     doit donc être là ET vide — c'est la différence entre « rien vu » et
     « pas regardé ». */
  if(!("fentes" in d))
    throw new Error("un plan sondable doit poser le champ, même vide");
  if(d.fentes.length)
    throw new Error("un plan plein n'a pas de fente : "+
                    JSON.stringify(d.fentes));
  /* ET LE VOISINAGE EST CELUI DES COUCHES ADJACENTES. */
  if(!d.voisinage.some(v=>v.net==="VIC"))
    throw new Error("la voisine doit être dans le voisinage");
  /* LES RÉGLAGES AUSSI : ils sont le contrat entre le panneau et le serveur. */
  if(!d.reglages||!("seuil_db" in d.reglages))
    throw new Error("les réglages doivent partir avec le document");
});

T("sans masse déclarée, le problème le DIT plutôt que de se taire",()=>{
  simXtBancCarte([SIM_X1+5]);
  S.zones=[];
  /* On force la masse à vide : sans elle, ni couture, ni fente, ni via de
     retour ne peuvent être examinés — et c'est exactement le silence qui rend
     une carte trompeuse. */
  /* `simRefSet` REMET LA PROPOSITION EN VIGUEUR quand la carte change : il
     faut donc l'appeler AVANT de vider, sans quoi le vidage est effacé par le
     rattrapage automatique. */
  simRefSet(); SIM.ref=new Set(); SIM.refAuto=false; touch();
  const p=simXtProbleme();
  if(!p)throw new Error("refus inattendu : "+SIM_XT.err);
  if(!p.notes.some(n=>/masse/i.test(n)))
    throw new Error("l'absence de masse doit être notée : "+
                    JSON.stringify(p.notes));
  if("fentes" in p.doc)
    throw new Error("sans masse ni zone, on n'a rien sondé : le champ ne "+
                    "doit pas être posé");
  SIM.ref=null; SIM.refAuto=true; SIM.refCle=null;
});

T("l'onglet Crosstalk oublie SON résultat et relance SON calcul",()=>{
  const a=SIM_ANALYSES.crosstalk;
  /* SANS CES DEUX CROCHETS, changer de sélection sous cet onglet laissait sa
     carte à l'écran — donc le couplage d'une piste peint sous le nom d'une
     autre —, et relançait par-dessus un calcul d'impédance dont personne
     n'avait besoin. C'est exactement ce que `simRafraichir` existe pour
     empêcher, et les quatre autres analyses l'obtiennent gratuitement parce
     qu'elles partagent `SIM.res`. */
  if(typeof a.oublier!=="function"||typeof a.relancer!=="function")
    throw new Error("l'analyse doit déclarer son oubli et sa relance");
  const garde={r:SIM_XT.res, f:SIM_XT.fichier, n:SIM_XT.nomFichier,
               p:SIM_XT.ports};
  SIM_XT.res=simXtResEssai();
  SIM_XT.fichier="# HZ S RI R 50\n"; SIM_XT.nomFichier="m.s4p";
  SIM_XT.ports=[{index:1,net:"CLK",bout:"proche"}];
  if(a.oublier()!==true)
    throw new Error("l'oubli doit dire qu'il y avait quelque chose");
  if(SIM_XT.res!==null)
    throw new Error("la carte d'une autre sélection ne doit pas rester");
  /* MAIS LE FICHIER ET SON MAPPING SURVIVENT : ils appartiennent à
     l'utilisateur, pas à la sélection. Les jeter obligerait à recharger un
     fichier de plusieurs mégaoctets à chaque clic sur la carte. */
  if(!SIM_XT.fichier||!SIM_XT.ports.length)
    throw new Error("le fichier importé n'appartient pas à la sélection");
  if(a.oublier()!==false)
    throw new Error("oublier deux fois ne trouve rien la seconde");
  SIM_XT.res=garde.r; SIM_XT.fichier=garde.f;
  SIM_XT.nomFichier=garde.n; SIM_XT.ports=garde.p;
});

T("un outil qui ne sait pas décrire de crosstalk le dit, et dit quoi lui manque",()=>{
  const vrai=SIM_PCB.problemeCrosstalk;
  delete SIM_PCB.problemeCrosstalk;
  try{
    SIM_XT.err="";
    if(simXtProbleme()!==null)
      throw new Error("sans la méthode, il ne peut pas y avoir de problème");
    /* ET LE REFUS NOMME CE QUI MANQUE. « Cet outil ne sait pas » laisse
       chercher ; la liste des trois mesures dit quoi écrire. */
    for(const mot of ["couture","plan de référence","vias de masse"])
      if(SIM_XT.err.indexOf(mot)<0)
        throw new Error("le refus doit nommer « "+mot+" » : "+SIM_XT.err);
  }finally{
    SIM_PCB.problemeCrosstalk=vrai;
    SIM_XT.err="";
  }
});

/* ==========================================================================
   LES BOUTONS DE LA FICHE
   --------------------------------------------------------------------------
   ILS NE VIVENT PAS DANS LE PANNEAU, mais dans la SORTIE — celle que
   `simRendre` réécrit d'un bloc à chaque rafraîchissement. Les brancher au
   montage du panneau, comme ceux des réglages, les laisse muets : au moment
   où le panneau s'écrit, la carte n'existe pas encore, et le branchement ne
   trouve rien à brancher. La panne ne se voit pas en relisant, et ne se voit
   pas à l'écran — les boutons sont là, armés du bon état, et le clic ne fait
   rien. Il faut CLIQUER pour la voir ; ces deux essais cliquent.
   ========================================================================== */

T("les boutons de la carte sont branchés à CHAQUE rendu, pas au montage",()=>{
  const garde={a:SIM.analyse, r:SIM_XT.res, s:SIM_XT.sens};
  let box=document.getElementById("simSortie");
  let posee=false;
  if(!box){
    box=document.createElement("div");
    box.id="simSortie";
    document.body.appendChild(box);
    posee=true;
  }
  try{
    const a=SIM_ANALYSES.crosstalk;
    if(typeof a.apres!=="function")
      throw new Error("l'analyse crosstalk ne déclare pas de crochet « apres »");
    /* ET `simRendre` L'APPELLE : c'est le fil exact qui manquait. */
    let vu=0;
    const vrai=a.apres;
    a.apres=function(){vu++; return vrai.apply(this,arguments);};
    try{
      SIM.analyse="crosstalk";
      SIM_XT.res=null;          // la fiche d'attente suffit : on teste le fil
      simRendre();
      if(vu!==1)
        throw new Error("simRendre n'appelle pas le crochet de l'analyse ("+
                        vu+" appel(s))");
    }finally{ a.apres=vrai; }
  }finally{
    SIM.analyse=garde.a; SIM_XT.res=garde.r; SIM_XT.sens=garde.s;
    if(posee&&box.parentNode)box.parentNode.removeChild(box);
  }
});

T("un bouton de la carte, une fois branché, agit quand on clique dessus",()=>{
  const garde={s:SIM_XT.sens, e:SIM_XT.espacement, z:SIM_XT.risques};
  const faits=[];
  for(const cle of ["next","fext"]){
    const b=document.createElement("button");
    b.setAttribute("data-xtsens",cle);
    document.body.appendChild(b);
    faits.push(b);
  }
  /* PRIS PAR SON IDENTIFIANT, et non créé à côté : le DOM bouchon indexe les
     identifiants dans sa propre table, et `simEl` ira chercher CELUI-LÀ. */
  const esp=document.getElementById("simXtVoirEsp");
  faits.push(esp);
  try{
    SIM_XT.sens="next";
    simXtSensBrancher();
    for(const b of faits)
      if(typeof b.onclick!=="function")
        throw new Error("un bouton de la carte est resté muet");
    faits[1].onclick.call(faits[1]);
    if(SIM_XT.sens!=="fext")
      throw new Error("le clic ne change pas le sens peint : "+SIM_XT.sens);
    const avant=SIM_XT.espacement;
    esp.onclick.call(esp);
    if(SIM_XT.espacement===avant)
      throw new Error("le clic ne bascule pas le profil d'espacement");
  }finally{
    for(const b of faits){
      if(b.parentNode)b.parentNode.removeChild(b);
      b.onclick=null;
    }
    SIM_XT.sens=garde.s; SIM_XT.espacement=garde.e; SIM_XT.risques=garde.z;
  }
});

T("les zones de vigilance se fondent par type, et jamais entre types",()=>{
  /* Le serveur rend un intervalle par trou ET PAR CÔTÉ du parcours : sur un
     plan mal cousu, quatorze rectangles hachurés se recouvrent et la carte
     disparaît dessous. On les fond pour la DESSINER — jamais pour le tableau,
     où deux côtés cousus inégalement restent deux faits. */
  const zones=[{type:"couture",s0:0,s1:1.2,detail:"a"},
               {type:"couture",s0:0,s1:1.2,detail:"a"},
               {type:"couture",s0:1.2,s1:3.0,detail:"b"},
               {type:"couture",s0:4.3,s1:9.05,detail:"c"},
               {type:"fente",  s0:2.0,s1:2.5,detail:"f"}];
  const f=simXtZonesFondues(zones,10);
  const cout=f.filter(z=>z.type==="couture");
  const fent=f.filter(z=>z.type==="fente");
  if(cout.length!==2)
    throw new Error("deux bandes de couture attendues, "+cout.length);
  if(cout[0].s0!==0||cout[0].s1!==3.0)
    throw new Error("la fusion n'a pas soudé 0→1.2 et 1.2→3 : "+
                    cout[0].s0+"→"+cout[0].s1);
  if(cout[0].n!==3)throw new Error("le compte des mesures fondues est faux");
  if(cout[0].detail.indexOf("3 mesures")<0)
    throw new Error("l'infobulle doit dire combien de mesures elle recouvre");
  /* LA FENTE TOMBE DANS L'INTERVALLE DE COUTURE ET RESTE SÉPARÉE : les deux
     ne demandent pas le même geste. */
  if(fent.length!==1||fent[0].s0!==2.0||fent[0].s1!==2.5)
    throw new Error("la fente a été fondue avec la couture");
  if(simXtZonesFondues([],10).length!==0||simXtZonesFondues(null,10).length!==0)
    throw new Error("rien à fondre doit rendre une liste vide, pas une erreur");
});

T("le tableau du plan nomme le côté, et dit ce que l'union couvre",()=>{
  /* DEUX LIGNES IDENTIQUES À L'ŒIL SONT LES DEUX CÔTÉS du parcours. Sans la
     colonne, elles se lisent comme un doublon — donc comme un bug — et l'on
     cherche dans le calcul ce qui est dans le dessin. */
  const html=simXtMasse({masse:{seuil:0.15, source:"λ/10 à 100 GHz",
    ecarte:"la règle du front (front) donnerait 4.05 mm",
    mesure:["13 via(s) de couture repérés"], couvert:1, vain:true,
    zones:[{type:"couture",s0:0,s1:1.2,cote:"gauche",detail:"x"},
           {type:"couture",s0:0,s1:1.2,cote:"droite",detail:"x"}]}});
  for(const mot of ["côté","gauche","droite"])
    if(html.indexOf(mot)<0)
      throw new Error("le tableau doit nommer « "+mot+" » : sinon deux "+
                      "mesures distinctes passent pour un doublon");
  if(html.indexOf("100 %")<0)
    throw new Error("la part du parcours couverte doit être écrite");
  if(html.indexOf("INDÉCIDABLES")<0)
    throw new Error("quand les zones couvrent tout, la fiche doit dire que "+
                    "« expliqué par le plan » ne vaut plus rien");
  /* ET D'OÙ SORT LE SEUIL : c'est un réglage du panneau qui le fixe, pas le
     cuivre. */
  if(html.indexOf("donnerait 4.05 mm")<0)
    throw new Error("la règle écartée doit être écrite");
});

T("le verdict indécidable a sa colonne, sa couleur et son compte",()=>{
  const html=simXtDesaccords({desaccords:[
    {victime:"V",s:0.2,espacement:null,median:0.285,tolerance:1.21,
     verdict:"indecidable",zone:"couture",detail:"rien ne longe"}]});
  if(html.indexOf("indécidable")<0)
    throw new Error("le verdict doit être nommé dans le tableau");
  if(html.indexOf("expliqué par «")>=0)
    throw new Error("un pic indécidable ne doit pas se lire « expliqué »");
  if(html.indexOf("RIEN conclure")<0)
    throw new Error("l'en-tête doit dire qu'on ne peut rien conclure");
  /* LE PIC A SA CLASSE SUR LA CARTE, distincte des deux autres. */
  const garde=SIM_XT.sens;
  SIM_XT.sens="next";
  const carte=simXtCarte({carte_chaleur:{axe:[0,1,2],max:1,zones:[],
      espacements:{V:{valeurs:[0.3,0.3,0.3],median:0.3,min:0.3,max:0.3,
                      couverture:1}},
      lignes:[{victime:"V",agresseur:"A",sens:"next",valeurs:[1,0.2,0.1],
               max:1,resolution:0.5}]},
    desaccords:[{victime:"V",s:0.2,verdict:"indecidable",zone:"couture",
                 detail:"x"}], risques:[], reglages:{}});
  SIM_XT.sens=garde;
  if(carte.indexOf("simXtPic-indecidable")<0)
    throw new Error("le triangle indécidable doit avoir sa propre classe");
});

T("la colonne « au genou » n'apparaît que s'il y a un genou à montrer",()=>{
  /* Les décibels de l'étape 0b sont un maximum sur TOUTE la bande analysée, et
     la bande se règle pour la résolution spatiale. Sur un front lent et une
     bande haute, le chiffre est exact et parle d'une fréquence où le signal ne
     porte rien : la fiche doit dire où se trouve ce pire point. */
  const c={agresseur:"A",victime:"V",next_db:-13.8,fext_db:-13.8,
           pire_db:-13.8,confirmee:true,f_pire:80e9,pire_db_genou:-52.0,
           vitesse_agresseur:1.6e8,vitesse_victime:1.6e8,ecart_vitesse:0.003};
  const avec=simXtTableauCouples({couples:[c],reglages:{seuil_db:-40},
                                  f_genou:38.9e6});
  if(avec.indexOf("≤ genou")<0||avec.indexOf("pire à")<0)
    throw new Error("les deux colonnes doivent être là");
  if(avec.indexOf("-52,0 dB")<0)
    throw new Error("le niveau sous le genou doit être écrit");
  if(avec.indexOf("simXtAlerte")<0)
    throw new Error("un pire point bien au-dessus du genou doit être signalé");
  /* SANS TEMPS DE MONTÉE SAISI, PAS DE COLONNE : le genou se déduirait de la
     bande et vaudrait la bande — une colonne qui recopie sa voisine. */
  const sans=simXtTableauCouples({couples:[{agresseur:"A",victime:"V",
    next_db:-13.8,fext_db:-13.8,confirmee:true}],
    reglages:{seuil_db:-40},f_genou:0});
  if(sans.indexOf("genou")>=0)
    throw new Error("sans genou, rien ne doit s'afficher à son sujet");
  const compte=t=>(t.match(/<th>/g)||[]).length;
  if(compte(avec)!==compte(sans)+2)
    throw new Error("les deux colonnes s'ajoutent aux autres, elles ne les "+
                    "remplacent pas");
});

T("un avis ordinaire se replie, une réserve passe devant la carte",()=>{
  /* LA FICHE EST DEVENUE COURTE, et c'est exactement là qu'un avertissement
     peut disparaître sans que personne s'en aperçoive. La règle : ce que le
     SERVEUR a marqué grave se lit avant la carte, le reste se déplie. La page
     ne classe rien elle-même — reconnaître un avertissement à son texte aurait
     fini par en manquer un. */
  const garde={r:SIM_XT.res, e:SIM_XT.err};
  const r=simXtResEssai();
  r.avertissements=["RÉSERVE QUI COMPTE : la fenêtre replie sur elle-même et "+
                    "ce qui se couple au-delà revient se poser au début.",
                    "avis ordinaire sur une vitesse de 0,3 %"];
  r.graves=[{titre:"RÉSERVE QUI COMPTE",texte:r.avertissements[0]}];
  SIM_XT.res=r; SIM_XT.err="";
  const h=simRendreCrosstalk();
  const iCarte=h.indexOf("Carte du couplage");
  if(!(h.indexOf("RÉSERVE QUI COMPTE")<iCarte))
    throw new Error("une réserve doit se lire AVANT la carte");
  if(h.indexOf("avis ordinaire")<iCarte)
    throw new Error("un avis ordinaire n'a pas à occuper le haut de la fiche");
  if(h.indexOf("avis ordinaire")<0)
    throw new Error("il doit rester lisible, replié — pas disparaître");
  /* ET SANS RÉSERVE, PAS DE BANDEAU VIDE. */
  r.graves=[];
  if(simRendreCrosstalk().indexOf("change la lecture")>=0)
    throw new Error("sans réserve, le bandeau ne s'affiche pas");
  SIM_XT.res=garde.r; SIM_XT.err=garde.e;
});

T("le résumé compare au budget de l'utilisateur, jamais à un barème maison",()=>{
  const garde={r:SIM_XT.res, b:SIM.saisie.bruitPct};
  const r=simXtResEssai();
  r.graves=[];
  /* −30 dB valent 3,2 % de l'agresseur : c'est de l'arithmétique, pas une
     convention. La seule convention est le BUDGET, et il est à l'utilisateur. */
  r.couples=[{agresseur:"CLK",victime:"VIC",pire_db:-30,next_db:-30,
              fext_db:-40,confirmee:true}];
  SIM_XT.res=r;

  SIM.saisie.bruitPct=10;
  let h=simRendreCrosstalk();
  if(h.indexOf("SOUS LE BUDGET")<0)
    throw new Error("3,2 % sous un budget de 10 % : sous le budget");
  SIM.saisie.bruitPct=5;
  h=simRendreCrosstalk();
  if(h.indexOf("À SURVEILLER")<0)
    throw new Error("3,2 % pour un budget de 5 % : à surveiller");
  SIM.saisie.bruitPct=2;
  h=simRendreCrosstalk();
  if(h.indexOf("AU-DESSUS DU BUDGET")<0)
    throw new Error("3,2 % pour un budget de 2 % : au-dessus");
  if(h.indexOf("3,2 %")<0)
    throw new Error("le pourcentage doit être écrit, pas seulement les dB");
  /* LE SEUIL EST NOMMÉ, ET C'EST CE QUI REND LE VERDICT VÉRIFIABLE. « AU-DESSUS
     DU BUDGET » sans dire de quel budget serait un barème maison déguisé. */
  if(h.indexOf("budget 2,0 %")<0)
    throw new Error("le résumé doit nommer le seuil contre lequel il juge");
  /* AUCUN COUPLE CONFIRMÉ N'EST PAS UN RISQUE FAIBLE : c'est une autre
     réponse, et l'écrire « sous le budget » ferait croire à une mesure. */
  r.couples=[{agresseur:"CLK",victime:"VIC",pire_db:-80,confirmee:false}];
  h=simRendreCrosstalk();
  if(h.indexOf("AUCUN COUPLE CONFIRMÉ")<0)
    throw new Error("rien de confirmé se dit tel quel");
  SIM_XT.res=garde.r; SIM.saisie.bruitPct=garde.b;
});

T("le rapport texte garde TOUT ce que la fiche replie",()=>{
  /* LA FICHE S'EST RACCOURCIE, et c'est exactement là qu'un renseignement peut
     disparaître sans bruit. Le rapport est le contrepoids : ce qui n'est plus
     à l'écran doit s'y trouver, et il doit dire sous quels réglages il a été
     produit — sorti de la page, un rapport qui ne les porte pas n'est plus
     vérifiable. */
  const garde=SIM_XT.res;
  const r=simXtResEssai();
  r.graves=[{titre:"RÉSERVE QUI COMPTE",
             texte:"RÉSERVE QUI COMPTE : la fenêtre replie sur elle-même."}];
  r.avertissements=[r.graves[0].texte,"avis ordinaire"];
  r.actions=[{quoi:"écarter",cible:"VIC",ou:"de 10,00 à 14,00 mm",
              pourquoi:"le profil d'espacement l'explique"}];
  r.desaccords=[{victime:"VIC",s:12.5,verdict:"indecidable",zone:"couture",
                 detail:"rien ne longe",tolerance:1.2}];
  r.risques=[{victime:"VIC",agresseur:"CLK",s0:10,s1:20,niveau:1,
              niveau_db:-30,justifie:false,zone:"couture"}];
  SIM_XT.res=r;
  const txt=simXtRapportTexte(r);

  for(const mot of ["RAPPORT DE CROSSTALK","LE VERDICT",
                    "CE QUI CHANGE LA LECTURE","SOUS QUELS RÉGLAGES",
                    "ÉTAPE 0a","ÉTAPE 0b","RECOUPEMENT",
                    "LES PLAGES À RISQUE","LE PLAN DE RÉFÉRENCE"])
    if(txt.indexOf(mot)<0)
      throw new Error("le rapport doit porter la section « "+mot+" »");
  if(txt.indexOf("RÉSERVE QUI COMPTE")<0||txt.indexOf("avis ordinaire")<0)
    throw new Error("les deux sortes d'avertissement doivent y être");
  if(txt.indexOf("INDÉCIDABLE")<0)
    throw new Error("le verdict d'un pic doit s'écrire en toutes lettres");
  if(txt.indexOf("NON expliqué par le dessin")<0)
    throw new Error("une plage rouge doit se lire comme telle dans le texte");
  /* LES RÉGLAGES, CHIFFRÉS : un rapport sans eux ne se vérifie plus. */
  if(txt.indexOf("Seuil de confirmation")<0||txt.indexOf("Fenêtre")<0)
    throw new Error("les réglages doivent être écrits");
  /* DES FINS DE LIGNE WINDOWS : il s'ouvre dans le Bloc-notes. */
  if(txt.indexOf("\r\n")<0)
    throw new Error("le texte doit être en CRLF");
  SIM_XT.res=garde;
});

T("le rapport ne s'exporte pas quand il n'y a rien à rapporter",()=>{
  const garde={r:SIM_XT.res, e:SIM_XT.err};
  SIM_XT.res=null; SIM_XT.err="";
  simXtExportRapport();
  if(!SIM_XT.err)
    throw new Error("un bouton qui ne fait rien sans le dire se clique trois "+
                    "fois avant qu'on comprenne");
  SIM_XT.res=garde.r; SIM_XT.err=garde.e;
});

T("une réserve tient sur une ligne, sa version longue attend dessous",()=>{
  /* UNE RÉSERVE EN SOIXANTE MOTS N'EST PAS LUE, et une réserve non lue vaut
     une réserve absente — le défaut même que toute cette section cherche à ne
     jamais produire. Le titre s'affiche, le texte se déplie, et le fichier
     exporté garde les deux. */
  const garde=SIM_XT.res;
  const r=simXtResEssai();
  const long="TEXTE LONG : "+new Array(40).join("mot ");
  r.graves=[{titre:"titre court",texte:long}];
  r.avertissements=[long];
  SIM_XT.res=r;
  const h=simRendreCrosstalk();
  const iCarte=h.indexOf("Carte du couplage");
  if(!(h.indexOf("titre court")<iCarte))
    throw new Error("le titre se lit avant la carte");
  const iLong=h.indexOf("TEXTE LONG");
  if(iLong<0)
    throw new Error("la version longue ne disparaît pas : elle se déplie");
  const iDet=h.indexOf('<details class="simXtPourquoi"');
  if(!(iDet>=0&&h.indexOf("titre court")<iDet&&iDet<iLong))
    throw new Error("le texte long doit être DANS le dépliant, pas à côté");
  if(h.indexOf("1 réserve")<0)
    throw new Error("le compte des réserves doit être écrit");
  /* ET LE RAPPORT GARDE LES DEUX : c'est là qu'on relit six mois plus tard. */
  const txt=simXtRapportTexte(r);
  if(txt.indexOf("titre court")<0||txt.indexOf("TEXTE LONG")<0)
    throw new Error("le fichier garde le titre ET le texte");
  SIM_XT.res=garde;
});

T("la fiche dit ce qu'il y a à faire, avant même la carte",()=>{
  const garde=SIM_XT.res;
  const r=simXtResEssai();
  r.graves=[];
  r.actions=[{quoi:"écarter",cible:"VIC",ou:"de 10,00 à 14,00 mm",
              pourquoi:"le couplage y atteint -14,0 dB et le profil "+
                       "d'espacement l'explique"},
             {quoi:"coudre le plan",cible:"masse",ou:"de 5,00 à 9,00 mm",
              pourquoi:"le plus grand pas vaut 4,00 mm"}];
  SIM_XT.res=r;
  const h=simRendreCrosstalk();
  const iFaire=h.indexOf("À faire");
  const iCarte=h.indexOf("Carte du couplage");
  if(iFaire<0)throw new Error("le bloc « à faire » doit exister");
  if(!(iFaire<iCarte))
    throw new Error("la consigne se lit avant la figure : c'est elle qu'on "+
                    "emporte devant le layout");
  if(h.indexOf("de 10,00 à 14,00 mm")<0)
    throw new Error("un geste sans endroit n'est pas un geste");
  /* LE POURQUOI EST REPLIÉ : la consigne tient sur une ligne. */
  const iDet=h.indexOf('<details class="simXtPourquoi"');
  if(!(iDet>iFaire&&iDet<h.indexOf("le couplage y atteint")))
    throw new Error("le pourquoi doit être dans le dépliant");
  /* RIEN À FAIRE N'EST PAS UN BLOC VIDE : il n'y a pas de bloc. */
  r.actions=[];
  if(simRendreCrosstalk().indexOf("À faire")>=0)
    throw new Error("sans geste, le bloc ne s'affiche pas");
  SIM_XT.res=garde;
});

T("le rapport s'ouvre sur ce qui se lit seul, les pièces viennent après",()=>{
  const garde=SIM_XT.res;
  const r=simXtResEssai();
  r.graves=[{titre:"court",texte:"long"}];
  r.avertissements=["long"];
  r.actions=[{quoi:"écarter",cible:"VIC",ou:"de 10,00 à 14,00 mm",
              pourquoi:"resserrement réel"}];
  SIM_XT.res=r;
  const txt=simXtRapportTexte(r);
  const i=m=>txt.indexOf(m);
  /* L'ORDRE EST LE PLAN DU FICHIER, et c'est ce qui le rend utilisable : les
     trois questions d'abord — y a-t-il un risque, que dois-je reprendre, à
     quoi me méfier —, les pièces ensuite. */
  if(!(i("LE VERDICT")<i("CE QU'IL Y A À FAIRE")))
    throw new Error("le verdict ouvre le rapport");
  if(!(i("CE QU'IL Y A À FAIRE")<i("CE QUI CHANGE LA LECTURE")))
    throw new Error("les gestes viennent avant les réserves");
  if(!(i("CE QUI CHANGE LA LECTURE")<i("SOUS QUELS RÉGLAGES")))
    throw new Error("les réserves viennent avant les réglages");
  if(!(i("SOUS QUELS RÉGLAGES")<i("ÉTAPE 0a")))
    throw new Error("les pièces viennent en dernier");
  if(i("ÉCARTER")<0)
    throw new Error("le geste doit être écrit dans le fichier aussi");
  if(i("se lisent seules")<0)
    throw new Error("le fichier doit dire comment il se lit");
  SIM_XT.res=garde;
});

T("le bouton « sur le cuivre » ne disparaît pas en silence",()=>{
  /* UNE COMMANDE ABSENTE EST UN BUG AUX YEUX DE QUI S'EN SERVAIT LA VEILLE.
     Quand le serveur refuse de rendre des plages — la carte ne localise rien à
     cette résolution —, la place du bouton doit porter le pourquoi, sans quoi
     on cherche ce qu'on a cassé. */
  const garde=SIM_XT.res;
  const r=simXtResEssai();
  r.risques=[];
  r.risques_refus=[{victime:"VIC",
                    raison:"résolution de 18.06 mm pour un parcours de "+
                           "18.06 mm : une plage couvrirait le tracé entier."}];
  SIM_XT.res=r;
  let h=simRendreCrosstalk();
  if(h.indexOf("rien à peindre")<0)
    throw new Error("la place du bouton doit dire qu'il n'y a rien à peindre");
  if(h.indexOf("18.06 mm")<0)
    throw new Error("et le pourquoi doit être lisible, pas seulement le fait");
  /* SANS REFUS ET SANS PLAGE, RIEN : il n'y a alors rien à expliquer. */
  r.risques_refus=[];
  if(simRendreCrosstalk().indexOf("rien à peindre")>=0)
    throw new Error("sans refus, pas de mention");
  SIM_XT.res=garde;
});

T("des hachures qui couvrent tout ne se peignent pas sur la carte",()=>{
  /* UN MOTIF QUI RECOUVRE LA FIGURE ENTIÈRE NE DÉSIGNE PLUS RIEN, et il
     détruit ce qu'il recouvre. C'est la même règle que le verdict « expliqué
     par le plan », qui cesse de rien dire dans le même cas. */
  const garde=SIM_XT.res;
  const r=simXtResEssai();
  r.carte_chaleur.zones=[{type:"couture",s0:0,s1:40,detail:"partout"}];
  r.masse={seuil:0.5,source:"λ/10",zones:r.carte_chaleur.zones,
           mesure:["13 vias"],couvert:1,vain:true,longueur:40};
  SIM_XT.res=r;
  let h=simRendreCrosstalk();
  if(h.indexOf("simXtZone")>=0)
    throw new Error("aucune bande hachurée quand elles couvrent tout");
  if(h.indexOf("ne sont PAS hachurées")<0)
    throw new Error("et la légende doit dire pourquoi elles ont disparu");
  /* AVEC UNE COUVERTURE ORDINAIRE, ELLES REVIENNENT. */
  r.masse.couvert=0.2; r.masse.vain=false;
  h=simRendreCrosstalk();
  if(h.indexOf("simXtZone")<0)
    throw new Error("une zone qui ne couvre qu'un cinquième se peint");
  SIM_XT.res=garde;
});

T("la carte porte, au-dessus d'elle, de quoi la lire",()=>{
  const garde=SIM_XT.res;
  const r=simXtResEssai();
  SIM_XT.res=r;
  const h=simRendreCrosstalk();
  const iLire=h.indexOf("courbes par victime");
  const iSvg=h.indexOf("<svg");
  if(iLire<0)throw new Error("la ligne de lecture doit exister");
  if(!(iLire<iSvg))
    throw new Error("elle se lit AVANT la figure : après, on a déjà renoncé");
  for(const mot of ["parcours de l’agresseur","couleur"])
    if(h.indexOf(mot)<0)
      throw new Error("elle doit dire « "+mot+" »");
});

T("la méthode tient en une ligne, avec les chiffres de CE calcul",()=>{
  const r=simXtResEssai();
  r.validation={bande:{f_max:2e10,points:201,pas:1e8,dc:true}};
  r.reglages={fenetre:"kaiser",kaiser_beta:8.6};
  const m=simXtMethode(r);
  if(m.split("\n").length!==1)
    throw new Error("une ligne veut dire une ligne");
  for(const mot of ["20,0 GHz","201","Kaiser","v·t/2"])
    if(m.indexOf(mot)<0)
      throw new Error("la méthode doit porter « "+mot+" » : sans les chiffres "+
                      "de ce calcul-ci, c'est une phrase de brochure");
  /* ET ELLE EST DANS LES DEUX SORTIES : l'écran et le fichier doivent dire la
     même chose. */
  const garde=SIM_XT.res;
  SIM_XT.res=r;
  if(simRendreCrosstalk().indexOf("Méthode :")<0)
    throw new Error("la fiche doit la porter");
  if(simXtRapportTexte(r).indexOf("Méthode :")<0)
    throw new Error("le rapport aussi");
  SIM_XT.res=garde;
});

T("la bande déduite se demande, s'écrit dans les champs, et se dit",()=>{
  /* UN RÉGLAGE CALCULÉ AILLEURS ET JAMAIS MONTRÉ NE PEUT PAS ÊTRE CONTREDIT :
     on lirait « 44 GHz » sous la carte et « 5 GHz » dans le panneau, et l'on
     croirait à un bug. */
  const garde={r:SIM_XT.res, a:SIM_XT.saisie.bandeAuto,
               f:SIM.saisie.f2, n:SIM.saisie.points};
  try{
    /* (1) LA CASE PART AU SERVEUR. Sans cela, la déduction n'a jamais lieu et
       le panneau ment sur ce qu'il a demandé. */
    SIM_XT.saisie.bandeAuto=false;
    if(simXtReglages().bande_auto!==false)
      throw new Error("décochée, la case doit partir à faux");
    SIM_XT.saisie.bandeAuto=true;
    if(simXtReglages().bande_auto!==true)
      throw new Error("cochée, la case doit partir à vrai");

    /* (2) CE QUI A ÉTÉ DÉDUIT SE LIT, AVEC LA BORNE QUI A MORDU : c'est elle
       qui dit quoi changer. */
    const r=simXtResEssai();
    r.graves=[];
    r.bande_deduite={f_max:4.46e10,points:34,pas:1.35e9,cible:2.67,
                     atteinte:2.67,vitesse:1.634e8,borne:"résolution",
                     source_cible:"le tiers du plus court longement (8,00 mm)",
                     f_tem:7.78e10,hauteur:0.21};
    SIM_XT.res=r;
    let h=simRendreCrosstalk();
    for(const mot of ["Bande déduite du dessin","44,60 GHz","34 points",
                      "2,67 mm","plus court longement"])
      if(h.indexOf(mot)<0)
        throw new Error("la fiche doit dire « "+mot+" »");

    /* (3) « PLAFONNÉE PAR LE MODÈLE » N'EST PAS LA MÊME RÉPONSE que
       « plafonnée par les points » : la première dit qu'aucun réglage
       n'affinera davantage sans mentir. */
    r.bande_deduite.borne="modèle";
    if(simRendreCrosstalk().indexOf("quasi-TEM")<0)
      throw new Error("le plafond du modèle doit être nommé");
    r.bande_deduite.borne="points";
    if(simRendreCrosstalk().indexOf("fenêtre passe avant")<0)
      throw new Error("le plafond des points doit dire ce qu'on a préféré");

    /* (4) SANS DÉDUCTION, PAS DE LIGNE : un bandeau qui annonce une déduction
       qui n'a pas eu lieu vaut un mensonge. */
    r.bande_deduite=null;
    if(simRendreCrosstalk().indexOf("Bande déduite du dessin")>=0)
      throw new Error("sans déduction, rien ne s'annonce");
  }finally{
    SIM_XT.res=garde.r; SIM_XT.saisie.bandeAuto=garde.a;
    SIM.saisie.f2=garde.f; SIM.saisie.points=garde.n;
  }
});

console.log("\n"+ok+" essais réussis, "+ko+" en échec.");
process.exit(ko?1:0);
