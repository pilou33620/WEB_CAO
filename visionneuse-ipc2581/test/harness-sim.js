/* =============================================================================
   visionneuse-ipc2581/test/harness-sim.js
   Banc d'essai de la MESURE DE MASSE COPLANAIRE, côté visionneuse.

       node test/harness-sim.js

   POURQUOI UN BANC À PART. `banc-essai.py` éprouve le PARSEUR — ce qui entre
   dans le modèle. Ce fichier-ci éprouve la GÉOMÉTRIE qu'on lit ensuite dessus :
   où est le cuivre de masse, de quel côté, sur quelle longueur, et si des vias
   le ramènent au plan d'en face. C'est le morceau le plus délicat de la
   simulation dans cet outil, et le seul qui n'était couvert par rien.

   Trois hypothèses tacites sont tombées dans `07-simulation.js`, et ce sont
   elles qu'on vérifie :
     · l'écart était le MINIMUM sur toute la longueur ;
     · il était pris LES DEUX CÔTÉS CONFONDUS, puis posé de part et d'autre ;
     · TOUT cuivre d'un autre net comptait comme masse.

   CE QUI N'EST PAS ICI : le solveur, qui a son propre banc
   (python/test/banc-ligne-mom.py) et ses étalons extérieurs.

   Le style est celui du banc de l'éditeur PCB (editeur-pcb/test/harness.js) :
   pas de framework, un décompte à la fin, un code de retour.
   ============================================================================= */
"use strict";
const fs=require("fs");
const path=require("path");

/* Le DOM minimal partagé. Les panneaux de la visionneuse n'ont pas à exister :
   `simInit` rend faux si son conteneur manque, et rien d'autre ici ne touche à
   la page. On lui donne quand même le canevas, que `03-rendu.js` cherche au
   chargement. */
require(path.join(__dirname,"..","..","commun","test","dom-stub.js")).install({
  panels:{}, canvasId:"cv"
});

/* Path2D, qui ENREGISTRE ses points. Node n'en fournit pas, et le DOM minimal
   partagé non plus — mais un chemin muet ne prouverait rien du sous-chemin
   d'une plage, qui est justement une des corrections à vérifier. Celui-ci garde
   la liste des sommets posés, et c'est tout ce qu'il faut : `simSousPoly` ne
   trace que des droites. */
global.Path2D=function(){this.pts=[];};
["moveTo","lineTo"].forEach(function(k){
  global.Path2D.prototype[k]=function(x,y){this.pts.push([x,y]);};
});
["arc","rect","roundRect","closePath","addPath","quadraticCurveTo",
 "bezierCurveTo","ellipse","arcTo"].forEach(function(k){
  global.Path2D.prototype[k]=function(){};
});

/* Les fichiers, dans l'ordre de la page. `06-demarrage.js` et les panneaux ne
   sont pas chargés : ils branchent l'interface, et ce banc ne clique pas. */
const RACINE=path.join(__dirname,"..");
const FICHIERS=[
  path.join(RACINE,"js","02-modele.js"),
  path.join(RACINE,"..","commun","simulation-em.js"),
  path.join(RACINE,"js","07-simulation.js")
];
const EXPOSE=["SIM_UNITES","simUnite","simUniteChanger","simNbLibre",
  "simSaisie","simPorts","SIM_FORMAT",
  "V","LT","ltAire","ltPreparer","LT_SEUIL_PLAN","mdlLongueur",
  "mdlNetNom","mdlNb","mdlCharger","mdlCouches","mdlPlansDans",
  "mdlCheminsNet","mdlMevTout",
  "SIM","SIM_IPC","simRefSet","simRefListe","simRefCandidats",
  "simRefCandidatsIpc",
  "simRefIdx","simPlagesDe","simMemeEcart","simKUnite","simCumul","simSurPoly",
  "simProjPoly","simSousPoly","simDistSeg","simGrilleCuivre","simEcartsEn",
  "simPlagesIpc","simCoutureIpc","simSegments","simCuDe","simRangCu",
  "simAccrocherViasIpc","simViaAuRaccordIpc","simKUnite",
  "simChainePistes","simBoutsPiste","simZPistes","simArcEnPolyligne",
  "simJonctionsIpc","simJoncCommuneIpc","SIM_RAYON_JONCTION_IPC","simViasIpc",
  "mdlArc",
  "simCheveluRes","simRetourCouleurRes","simRetourActifIpc",
  "simRetourTraceIpc",
  "simRetoursIpc","SIM_RAYON_RETOUR_IPC",
  "simStackupIpc","simNetDuPlanIpc",
  "simTopo","simTopoNom","simCoplanaire","simCouture","simVoisins",
  "simNb","simSection","simProvenanceIpc",
  "SIM_GAP_MAX","SIM_COULOIR","SIM_GND_RE","SIM_REF_TAUX",
  /* chute continue : le cuivre livre, les bornes, les percages */
  /* selection multiple et lots */
  "mdlMevTout","selMeme","selPoser","selRefleter","selNets","selRefs",
  "simZPistesDe","simLotsDePistes","SIM_LOTS_MAX","simDocIpc",
  /* Le voisinage : le cuivre qui longe la selection. Sans lui, ni Z
     differentielle ni diaphonie -- l'agresseur n'est jamais dans la
     selection. */
  "simVoisinageIpc","simPairesIpc","SIM_ECART_COUPLAGE_IPC",
  "SIM_VOISINAGE_MAX_IPC",
  /* CROSSTALK : les trois mesures que seule la page peut faire — l'abscisse
     du parcours, les vias de couture qui s'y projettent, les fentes du plan
     sondées dessous, et les perçages de masse. */
  "simXtParcoursIpc","simXtAbscisseIpc","simXtCoutureIpc","simXtFentesIpc",
  "simXtViasMasseIpc","simXtPlanDeIpc","simXtZoneMasseIpc",
  "simXtContoursIpc","simXtDansContourIpc","SIM_XT_PAS_IPC",
  /* Les zones a risque, posees sur le cuivre : l'algorithme est commun,
     l'outil ne fournit que les deux formes neutres, en MILLIMETRES. */
  "simXtGeometrieIpc","simXtRisqueGeom","simXtRisqueTraits","simXtRisques",
  "simXtProjParcours","simXtRisqueCouleur","SIM_XT_PAS_TRAIT","SIM_XT",

  /* L'onglet de Z differentielle (commun/simulation-em.js). */
  "simCouplage","simCouplagePaires","simFicheDiff",
  "simCorpsDiff","simRendreDiff",
  /* Le seuil qui juge le crosstalk, et la tension qui convertit un rapport
     en volts. */
  "simSeuilFraction","simSeuilNom","simTension","simXtTension",
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
  "SIM_UNITES_TR","SIM_UNITES_V","simUniteTr","simUniteV",
  "simLotsPeints","simLotsMultiples","simPourChaqueLot","simLotMirroir",
  "simLotBilan","simTableauLots","simOublierRes","simZVerdict","simGrouper",
  "SIM_DCB","simDCClic","simDCBornePastilleIpc","simDCPolysPisteIpc",
  "simDCPolysArcIpc","simDCPadPolysIpc","simDCFormeIpc","simDCRangIpc",
  "simDCHauteurIpc","simDCCoucheVue","simDCCercleIpc",
  /* Les cotes que le solveur thermique attend, tirees de l'empilage. */
  "simDCThermiqueIpc",
  /* La portee d'un percage, et le compte de celles qui restent supposees. */
  "simXtPortee","simXtPorteesSupposees",
  /* Le choix de la couche peinte : ce que cet outil propose, et ce que la
     fiche en fait. */
  "simDCCouchePeinte","simDCCouchesPeintes","simDCCoucheVoulue",
  "simDCNomCouche","simDCOublier"];

/* Un seul `eval`, sur les trois fichiers concaténés : ils se voient l'un
   l'autre comme dans la page, où ils partagent la portée globale. Le "use
   strict" de chacun est retiré — en mode strict, `eval` créerait une portée
   propre et rien ne sortirait. */
const code=FICHIERS.map(f=>fs.readFileSync(f,"utf8")
                            .replace(/^"use strict";\s*/,"")).join("\n;\n");
eval(code+"\n"+EXPOSE.map(n=>"globalThis."+n+"="+n+";").join("\n"));

let ok=0, ko=0;
function T(nom,fn){
  try{fn();console.log("  ok  "+nom);ok++;}
  catch(e){console.log("  KO  "+nom+" → "+e.message+"\n      "+
                       (e.stack||"").split("\n")[1]);ko++;}
}

/* ==========================================================================
   Une carte de laboratoire
   --------------------------------------------------------------------------
   On monte `V` à la main plutôt que de parser un IPC-2581 : ce banc éprouve la
   géométrie, et un fichier d'essai ne ferait qu'ajouter un parseur entre la
   question et la réponse. Le modèle est celui que `mdlCharger` produit — mêmes
   champs, mêmes unités —, ce qui est justement ce qu'il faut vérifier par
   ailleurs, et que `banc-essai.py` vérifie.

   La carte : 60 × 40 mm, deux couches, une piste de 40 mm sur la couche 0.
   ========================================================================== */
const Y=20, X1=10, X2=50, W=0.4;
const CONTOUR=[0,0, 60,0, 60,40, 0,40];

function rect(x1,y1,x2,y2){return [x1,y1, x2,y1, x2,y2, x1,y2];}

/* `nets` est la table des noms ; un objet porte l'INDICE de son net. */
function carte(opts){
  opts=opts||{};
  const nets=opts.nets||["N$1","GND","N$2"];
  const piste={c:0, n:0, w:W, p:[X1,Y, X2,Y]};
  if(opts.piste)Object.assign(piste,opts.piste);

  const modele={
    unites:"MM",
    nets:nets,
    contour:{o:CONTOUR, t:[]},
    /* L'EMPILAGE SE REMPLACE, et c'est le seul moyen d'éprouver ce qui dépend
       d'une TROISIÈME couche : le voisinage vertical du crosstalk, qui n'a
       aucun sens sur une carte dont les deux cuivres sont un signal et son
       plan. Le défaut reste la carte deux couches de tous les autres essais. */
    empilage:opts.empilage||[
      {nom:"Top",    seq:1, ep:0.035, type:"CONDUCTOR"},
      {nom:"Coeur",  seq:2, ep:0.2,   type:"DIELECTRIC", dk:"4.3", df:"0.02"},
      {nom:"Bottom", seq:3, ep:0.035, type:"PLANE"}
    ],
    /* `couches` est la liste des NOMS, dans l'ordre du fichier : c'est
       `mdlCouches` qui en fait des objets, et les rattache a l'empilage par ce
       nom-la. */
    couches:opts.couches||["Top","Bottom"],
    pistes:(opts.pistes||[piste]),
    arcs:[], plans:(opts.plans||[]), textes:[],
    /* Pastilles et composants : vides par defaut -- la plupart des essais
       n'eprouvent que du cuivre. `padstacks` doit exister meme vide :
       `mdlPadPlace` y cherche la definition avant tout autre test, et un
       modele sans ce champ leverait la ou il devrait retomber sur son repli. */
    padstacks:(opts.padstacks||{}),
    /* Les deux dictionnaires de formes, vides mais PRESENTS : `mdlForme` y
       cherche toute forme nommee par un padstack, et un modele sans ces
       champs leve au chargement la ou il devrait rendre null. Le vrai modele
       les porte toujours. */
    formes:(opts.formes||{}), formesuser:(opts.formesuser||{}),
    pads:(opts.pads||[]), composants:(opts.composants||[]),
    percages:(opts.percages||[])
  };
  mdlCharger(modele);
  /* La PORTÉE : le net entier, sur toutes ses couches. C'est le Maj+clic de la
     page, et c'est ce que `simZPistes` lit. Sans elle, la sélection est vide et
     tout essai passerait à vide sans rien éprouver. */
  V.net=piste.n;
  /* La grille des arêtes est bâtie par modèle : un nouveau modèle, une nouvelle
     grille — c'est `SIM_GRILLES_SRC` qui le garantit, et changer de carte entre
     deux essais l'éprouve au passage. */
  SIM.refCle=null; SIM.refAuto=true; SIM.ref=null;
  return {modele:modele, piste:V.parNet[piste.n].pistes[0]||piste};
}

/* Un plan : un contour extérieur, des trous éventuels. `n` est l'indice du
   net. Le trou est ce que le fondeur creuse autour du cuivre étranger — c'est
   dedans que la piste se trouve, et c'est sa paroi que la mesure cherche. */
function plan(n,o,trous){return {c:0, n:n, g:[{o:o, t:trous||[]}]};}

console.log("— banc d'essai : masse coplanaire, visionneuse IPC-2581 —");

T("le modèle de laboratoire se charge et l'empilage est prêt",()=>{
  carte();
  if(!LT.pret)throw new Error("LT devrait être prêt");
  if(LT.cu.length!==2)throw new Error("deux conducteurs attendus, "+LT.cu.length);
  if(simCuDe(0)!==0)throw new Error("la couche 0 est le conducteur 0");
  if(!(LT.aire>2000))throw new Error("aire de carte : "+LT.aire);
});

T("la polyligne se paramètre par sa longueur, et la tangente suit le segment",()=>{
  const p=[0,0, 10,0, 10,10];
  const cum=simCumul(p);
  if(cum[cum.length-1]!==20)throw new Error("longueur 20 attendue, "+cum[2]);
  const a=simSurPoly(p,cum,0.25);
  if(Math.abs(a.x-5)>1e-9||Math.abs(a.y)>1e-9)
    throw new Error("le quart tombe à (5,0), pas ("+a.x+","+a.y+")");
  if(Math.abs(a.tx-1)>1e-9||Math.abs(a.ty)>1e-9)
    throw new Error("la tangente du premier segment est (1,0)");
  const b=simSurPoly(p,cum,0.75);
  if(Math.abs(b.x-10)>1e-9||Math.abs(b.y-5)>1e-9)
    throw new Error("les trois quarts tombent à (10,5)");
  if(Math.abs(b.ty-1)>1e-9)
    throw new Error("la tangente du second segment est (0,1), pas ("+
                    b.tx+","+b.ty+")");
});

T("le sous-chemin d'une plage garde les sommets qui tombent dedans",()=>{
  /* LA RÉGRESSION QUI MENAÇAIT : peindre la polyligne entière à la couleur de
     la première plage. Le sous-chemin doit être coupé aux deux bouts, et garder
     les sommets du milieu — sans eux, une plage à cheval sur un coude serait
     peinte en ligne droite au travers du cuivre. */
  const p=[0,0, 10,0, 10,10];
  const cum=simCumul(p);
  const eq=(a,b)=>Math.abs(a-b)<1e-9;

  /* La plage entière : les deux bouts et le coude au milieu. */
  const tout=simSousPoly(p,cum,0,1).pts;
  if(tout.length!==3)
    throw new Error("trois sommets attendus, "+JSON.stringify(tout));
  if(!eq(tout[1][0],10)||!eq(tout[1][1],0))
    throw new Error("le coude doit être gardé : "+JSON.stringify(tout));

  /* Une plage à cheval sur le coude : coupée à 8 et à 12 mm du départ. */
  const cheval=simSousPoly(p,cum,0.4,0.6).pts;
  if(cheval.length!==3)
    throw new Error("le coude doit rester dedans : "+JSON.stringify(cheval));
  if(!eq(cheval[0][0],8)||!eq(cheval[0][1],0))
    throw new Error("départ à (8,0) : "+JSON.stringify(cheval[0]));
  if(!eq(cheval[2][0],10)||!eq(cheval[2][1],2))
    throw new Error("arrivée à (10,2) : "+JSON.stringify(cheval[2]));

  /* Une plage entièrement dans le second segment : aucun sommet à garder. */
  const droit=simSousPoly(p,cum,0.6,0.9).pts;
  if(droit.length!==2)
    throw new Error("deux points seulement : "+JSON.stringify(droit));
  if(!eq(droit[0][1],2)||!eq(droit[1][1],8))
    throw new Error("de (10,2) à (10,8) : "+JSON.stringify(droit));
});

T("masse de référence : GND est devinée sur son nom et son cuivre",()=>{
  carte({plans:[plan(1,rect(2,2,58,38),[rect(5,10,55,30)])]});
  const c=simRefCandidats();
  const gnd=c.find(o=>o.net==="GND");
  if(!gnd)throw new Error("GND devrait être candidate : "+c.map(o=>o.net));
  if(!gnd.defaut)
    throw new Error("GND porte un plan et s'appelle GND : elle doit être "+
                    "proposée d'office");
  if(!simRefSet().has("GND"))throw new Error("l'ensemble retenu doit porter GND");
  if(simRefIdx().has(0))throw new Error("N$1 n'est pas une masse");
  if(!simRefIdx().has(1))throw new Error("l'indice de GND doit y être");
});

T("un net de signal arrosé est candidat mais pas proposé",()=>{
  carte({plans:[plan(2,rect(2,2,58,38),[])]});
  const c=simRefCandidats();
  const n2=c.find(o=>o.net==="N$2");
  if(!n2)throw new Error("N$2 couvre la carte : elle doit être candidate");
  /* Elle couvre plus que le seuil de plan, et aucune masse nommée n'existe :
     c'est le seul candidat évident, donc il EST proposé. Mieux vaut proposer le
     bon plan que laisser le calcul coplanaire désarmé en silence. */
  if(!n2.defaut)
    throw new Error("seul plan de la carte : il doit être proposé faute de "+
                    "mieux");
  /* Mais dès qu'une masse nommée porte un plan, c'est elle qui passe devant. */
  carte({plans:[plan(2,rect(2,2,30,38),[]),
                plan(1,rect(31,2,58,38),[])]});
  const d=simRefCandidats();
  if(!d.find(o=>o.net==="GND").defaut)
    throw new Error("GND doit être proposée");
  if(d.find(o=>o.net==="N$2").defaut)
    throw new Error("N$2 ne doit plus l'être quand GND existe");
});

/* Le cas ordinaire : la piste est dans un TROU du plan, découpé autour d'elle.
   `creux` est la demi-largeur de ce trou, mesurée depuis l'axe.

   LE TROU COURT D'UN BORD À L'AUTRE de la carte, et pas seulement le long de la
   piste : sans cela ses parois VERTICALES tomberaient près des deux bouts, et
   ce n'est pas du cuivre latéral — c'est le couloir qui se referme devant la
   pastille. C'est ce que `simEcartsEn` écarte désormais ; le trou traversant
   évite de faire dépendre tous les autres essais de ce tri-là. */
function avecPlan(creux,net,y1,y2){
  return carte({plans:[plan(net==null?1:net,
                            rect(2,2,58,38),
                            [rect(2,
                                  (y1==null?Y-creux:y1),
                                  58,
                                  (y2==null?Y+creux:y2))])]});
}

T("écart symétrique : la paroi du trou, moins la demi-largeur",()=>{
  const c=avecPlan(0.4);                 // trou de 0,8 mm de large
  const g=simSegments();
  if(g.envoi.length!==1)
    throw new Error("un trou uniforme donne UNE plage, pas "+g.envoi.length);
  const o=g.envoi[0];
  /* 0,4 mm de l'axe à la paroi, moins 0,2 mm de demi-piste : 0,2 mm des deux
     côtés. */
  for(const [nom,v] of [["gauche",o.gap_left],["droite",o.gap_right]])
    if(Math.abs(v-0.2)>0.005)
      throw new Error("écart "+nom+" : "+v+" au lieu de 0,200 mm");
  if(Math.abs(o.length-(X2-X1))>1e-6)
    throw new Error("longueur "+o.length+" au lieu de 40");
});

T("masse d'un seul côté : l'autre reste à zéro, il n'est pas recopié",()=>{
  /* LE CAS QUI ÉTAIT FAUX. Le trou du plan est très large vers les y
     décroissants — le cuivre y est hors de portée — et serré vers les y
     croissants. L'ancienne mesure retenait le minimum des deux côtés confondus
     et le posait de part et d'autre : Z0 tombait deux fois trop. */
  avecPlan(null,1,Y-8,Y+0.4);
  const o=simSegments().envoi[0];
  const plein=Math.max(o.gap_left,o.gap_right);
  const vide=Math.min(o.gap_left,o.gap_right);
  if(Math.abs(plein-0.2)>0.005)
    throw new Error("le côté serré vaut 0,2 mm, pas "+plein);
  if(vide!==0)
    throw new Error("le côté large est hors de portée : il doit rester à "+
                    "zéro, pas "+vide);
});

T("un plan hors de portée ne compte pas du tout",()=>{
  avecPlan(SIM_GAP_MAX+2);               // les deux parois au-delà de 3 mm
  const o=simSegments().envoi[0];
  if(o.gap_left!==0||o.gap_right!==0)
    throw new Error("au-delà de la portée utile, pas d'effet coplanaire : "+
                    o.gap_left+" / "+o.gap_right);
});

T("un îlot d'un autre signal n'est pas de la masse, et il est signalé",()=>{
  /* Du cuivre serré porté par N$2, et un plan GND bien réel mais LOIN. Il faut
     les deux : sans GND nommée, N$2 serait le seul plan de la carte et se
     verrait proposé faute de mieux — ce qui est le bon comportement, mais pas
     ce qu'on éprouve ici. */
  carte({plans:[plan(2,rect(2,Y+0.4,58,38),[]),
                plan(1,rect(2,2,58,Y-5),[])]});
  const g=simSegments();
  const o=g.envoi[0];
  if(o.gap_left!==0||o.gap_right!==0)
    throw new Error("un net de signal ne doit pas entrer dans l'écart : "+
                    o.gap_left+" / "+o.gap_right);
  const v=g.voisins.find(x=>x.net==="N$2");
  if(!v)throw new Error("le cuivre écarté doit être signalé comme couplage : "+
                        JSON.stringify(g.voisins));
  if(Math.abs(v.ecart-0.2)>0.005)
    throw new Error("le couplage est à 0,2 mm, pas "+v.ecart);
  if(Math.abs(v.longueur-(X2-X1))>1)
    throw new Error("il longe toute la piste : "+v.longueur+" mm relevés");
});

T("le trou qui s'élargit à mi-parcours découpe la piste en deux plages",()=>{
  /* LE CAS QUE LE MINIMUM SUR TOUTE LA LONGUEUR ÉCRASAIT : la moitié serrée
     donnait son écart aux quarante millimètres. Deux trous bout à bout dans le
     même plan, l'un serré et l'autre large. */
  /* UN SEUL polygone de trou, en marche d'escalier : serré de x=2 à x=30, large
     ensuite. Deux rectangles qui se chevauchent auraient des arêtes INTÉRIEURES
     au cuivre absent, et la mesure les prendrait pour des bords de plan — un
     vrai fichier IPC-2581 ne les produit pas, le fondeur ayant déjà fait
     l'union. */
  carte({plans:[plan(1,rect(2,2,58,38),
                     [[2,Y-0.4, 30,Y-0.4, 30,Y-1.2, 58,Y-1.2,
                       58,Y+1.2, 30,Y+1.2, 30,Y+0.4, 2,Y+0.4]])]});
  const g=simSegments();
  if(g.envoi.length!==2)
    throw new Error("deux plages attendues, pas "+g.envoi.length+" ("+
                    g.envoi.map(o=>o.gap_left+"/"+o.gap_right).join(" ")+")");
  const a=g.envoi[0], b=g.envoi[1];
  if(Math.abs(a.gap_left-0.2)>0.01)
    throw new Error("la première moitié est serrée : "+a.gap_left);
  if(Math.abs(b.gap_left-1.0)>0.01)
    throw new Error("la seconde est large : "+b.gap_left);
  const som=a.length+b.length;
  if(Math.abs(som-(X2-X1))>1e-6)
    throw new Error("les plages doivent couvrir toute la piste : "+som);
  if(Math.abs(a.length-20)>0.5)
    throw new Error("la rupture est à mi-parcours : "+a.length+" mm");
  /* Bout à bout : sans cela la mise en cascade signalerait une rupture de
     parcours, et les paramètres S ne voudraient plus rien dire. */
  if(Math.abs(a.end[0]-b.start[0])>1e-6||Math.abs(a.end[1]-b.start[1])>1e-6)
    throw new Error("les plages doivent se toucher");
});

T("couture de vias : l'espacement le plus grand est mesuré, bouts compris",()=>{
  const percages=[];
  for(let x=X1+1;x<=X2-1;x+=4){
    percages.push({x:x, y:Y+1, d:0.4, n:1, p:"PTH"});
    percages.push({x:x, y:Y-1, d:0.4, n:1, p:"PTH"});
  }
  carte({plans:[plan(1,rect(2,2,58,38),[rect(X1-1,Y-0.4,X2+1,Y+0.4)])],
         percages:percages});
  const c=simSegments().couture;
  if(!c)throw new Error("la couture devrait être mesurée");
  if(c.n<20)throw new Error("vingt perçages attendus dans le couloir, "+c.n);
  if(c.ecartMax>4.05)
    throw new Error("un via tous les 4 mm : espacement max "+c.ecartMax);
});

T("aucun via de masse : le trou vaut toute la longueur de la piste",()=>{
  avecPlan(0.4);
  const c=simSegments().couture;
  if(!c)throw new Error("la couture devrait être mesurée");
  if(c.n!==0)throw new Error("aucun perçage attendu, "+c.n);
  if(Math.abs(c.ecartMax-(X2-X1))>1e-6)
    throw new Error("le trou devrait valoir les 40 mm de la piste, pas "+
                    c.ecartMax);
});

T("un via hors du couloir ne coud pas le cuivre qui borde la piste",()=>{
  carte({plans:[plan(1,rect(2,2,58,38),[rect(X1-1,Y-0.4,X2+1,Y+0.4)])],
         percages:[{x:30, y:Y+9, d:0.4, n:1, p:"PTH"}]});
  const c=simSegments().couture;
  if(c.n!==0)
    throw new Error("un via à 9 mm de l'axe est hors du couloir de "+
                    SIM_COULOIR+" mm, "+c.n+" compté(s)");
});

T("aucune masse retenue : l'écart tombe à zéro et le panneau le dit",()=>{
  avecPlan(0.4);
  simRefSet();                           // le panneau a affiché la proposition
  SIM.refAuto=false; SIM.ref=new Set();  // puis l'utilisateur a tout décoché
  const g=simSegments();
  if(g.envoi[0].gap_left!==0||g.envoi[0].gap_right!==0)
    throw new Error("sans masse retenue, il n'y a pas d'écart coplanaire");
  const p=SIM_IPC.probleme({z0:50,f1:1e8,f2:5e9,points:11,fc:1e9});
  if(!p.notes||!p.notes.some(n=>/Aucun net de masse/.test(n)))
    throw new Error("le panneau doit signaler qu'aucune masse n'est retenue");
  SIM.refAuto=true; SIM.ref=null;
});

T("une piste coudée se mesure sur les deux segments, sans fausse normale",()=>{
  /* Au sommet d'un coude il y a DEUX tangentes. `simSurPoly` prend celle du
     segment courant : moyenner les deux ferait pointer la normale de biais,
     donc chercher le cuivre là où il n'est pas. Le trou du plan suit le coude ;
     l'écart doit rester le même d'un bout à l'autre. */
  carte({piste:{p:[X1,Y, 30,Y, 30,Y+15]},
         plans:[plan(1,rect(2,2,58,38),
                     /* Le trou suit le coude d'un seul trait : un L de 0,8 mm
                        de large, du bord gauche de la carte jusqu'en haut. */
                     [[2,Y-0.4, 30.4,Y-0.4, 30.4,38, 29.6,38,
                       29.6,Y+0.4, 2,Y+0.4]])]});
  const g=simSegments();
  if(!g.envoi.length)throw new Error("rien envoyé");
  for(const o of g.envoi){
    if(!(o.gap_left>0)||!(o.gap_right>0))
      throw new Error("le coude reste bordé des deux côtés : "+
                      o.gap_left+" / "+o.gap_right);
    /* Le couloir fait 0,8 mm de large, donc 0,2 mm d'écart sur les parties
       droites. AU COIN INTÉRIEUR la masse recule pour de bon — l'angle du
       cuivre s'éloigne en diagonale — et il est juste que l'écart y monte un
       peu. Ce qui ne doit PAS arriver, et qui arriverait avec une tangente
       moyennée au sommet, c'est un écart qui s'effondre à zéro ou qui part
       chercher du cuivre à l'autre bout de la carte. */
    for(const v of [o.gap_left,o.gap_right])
      if(v<0.19||v>0.35)
        throw new Error("écart hors du plausible pour un couloir de 0,8 mm : "+
                        v+" mm (plages : "+
                        g.envoi.map(x=>x.gap_left+"/"+x.gap_right).join(" ")+")");
  }
  /* Et les plages couvrent tout le cuivre, coude compris. */
  const som=g.envoi.reduce((a,o)=>a+o.length,0);
  if(Math.abs(som-35)>1e-6)
    throw new Error("20 mm + 15 mm de cuivre attendus, "+som+" envoyés");
});

T("un fichier en pouces donne les mêmes millimètres",()=>{
  /* Tout ce qui sort d'ici est en millimètres, quelle que soit l'unité du
     fichier. La conversion se fait en un seul endroit, et c'est ce qui doit
     rester vrai : une grille dont le pas serait converti deux fois, ou pas du
     tout, ferait chercher le cuivre dans les mauvaises cases. */
  const k=1/25.4;
  const modele={
    unites:"INCH", nets:["N$1","GND"],
    contour:{o:CONTOUR.map(v=>v*k), t:[]},
    empilage:[{nom:"Top",seq:1,ep:0.035*k,type:"CONDUCTOR"},
              {nom:"Coeur",seq:2,ep:0.2*k,type:"DIELECTRIC",dk:"4.3"},
              {nom:"Bottom",seq:3,ep:0.035*k,type:"PLANE"}],
    /* `couches` est la liste des NOMS, dans l'ordre du fichier : c'est
       `mdlCouches` qui en fait des objets, et les rattache a l'empilage par ce
       nom-la. */
    couches:["Top","Bottom"],
    pistes:[{c:0,n:0,w:W*k,p:[X1*k,Y*k, X2*k,Y*k]}],
    arcs:[], plans:[plan(1,rect(2,2,58,38).map(v=>v*k),
                        [rect(X1-1,Y-0.4,X2+1,Y+0.4).map(v=>v*k)])],
    textes:[], pads:[], composants:[], percages:[]
  };
  mdlCharger(modele);
  V.net=0;
  SIM.refCle=null; SIM.refAuto=true; SIM.ref=null;
  const o=simSegments().envoi[0];
  if(Math.abs(o.gap_left-0.2)>0.005||Math.abs(o.gap_right-0.2)>0.005)
    throw new Error("écart en pouces mal converti : "+
                    o.gap_left+" / "+o.gap_right);
  if(Math.abs(o.length-(X2-X1))>1e-6)
    throw new Error("longueur en pouces mal convertie : "+o.length);
  if(Math.abs(o.width-W)>1e-9)
    throw new Error("largeur en pouces mal convertie : "+o.width);
});

/* ==========================================================================
   CE QUE LA FICHE ÉCRIT
   --------------------------------------------------------------------------
   Les trois corrections ne valent que si elles se LISENT. `simTopo`,
   `simCoplanaire`, `simCouture` et `simVoisins` sont le seul endroit où
   l'utilisateur apprend qu'une masse est d'un seul côté, qu'une couture est
   trop lâche, ou qu'un îlot d'un autre net longe sa piste — et rien ne les
   exerçait. On les appelle donc sur un résultat monté à la main : la mise en
   forme n'a pas besoin d'un solveur pour être fausse.
   ========================================================================== */
function res(segments,ref){
  return {segments:segments, reference_nets:ref||["GND"],
          ligne:{}, avertissements:[], f_centre:1e9};
}
const SEG={z0:50, eps_eff:3.3, longueur:10, largeur:0.4, couche:0,
           topo:"micro", coplanaire:true, cotes:2,
           ecart:0.2, ecart_g:0.2, ecart_d:0.2};

T("le tableau nomme la masse d'un seul côté, et n'invente pas l'autre",()=>{
  const deux=simTopo(Object.assign({},SEG));
  if(!/coplanaire/.test(deux)||/seul/.test(deux))
    throw new Error("deux côtés égaux : « coplanaire (0,200 mm) », lu « "+deux+" »");
  const un=simTopo(Object.assign({},SEG,{cotes:1, ecart_d:0}));
  if(!/un seul côté/.test(un))
    throw new Error("un côté doit être nommé, lu « "+un+" »");
  /* Deux écarts différents s'écrivent tous les deux : un seul chiffre laisserait
     croire à une masse symétrique, ce qui est l'hypothèse qu'on vient de lever. */
  const asym=simTopo(Object.assign({},SEG,{ecart_g:0.2, ecart_d:0.9, ecart:0.2}));
  if(asym.indexOf("0,900")<0||asym.indexOf("0,200")<0)
    throw new Error("les deux écarts doivent figurer, lu « "+asym+" »");
  /* Et un microruban nu ne parle pas de coplanaire. */
  const nu=simTopo({z0:50, topo:"micro", coplanaire:false});
  if(/coplanaire/.test(nu))throw new Error("lu « "+nu+" »");
});

T("la note coplanaire dit ce qui compte comme masse, et la dissymétrie",()=>{
  /* DEUX masses sur la carte, toutes deux nommées et arrosées : elles doivent
     être proposées ensemble, et la note doit les nommer toutes les deux. Une
     carte RF sépare couramment l'analogique du numérique. */
  carte({nets:["N$1","AGND","GND"],
         plans:[plan(1,rect(2,2,30,38),[]), plan(2,rect(31,2,58,38),[])]});
  const l=simRefListe();
  if(l.length!==2||l.join(",")!=="AGND,GND")
    throw new Error("les deux masses doivent être retenues : "+l.join(","));
  const h=simCoplanaire(res([Object.assign({},SEG)]));
  if(h.indexOf("AGND, GND")<0)
    throw new Error("la note doit nommer les nets retenus : "+h);
  if(/dissymétrique/.test(h))
    throw new Error("deux côtés égaux : rien à signaler");
  const d=simCoplanaire(res([Object.assign({},SEG,{ecart_g:0.2, ecart_d:0.9})]));
  if(!/dissymétrique/.test(d))
    throw new Error("un facteur 4,5 entre les côtés doit être signalé");
  if(d.indexOf("0,900")<0)throw new Error("le pire écart doit figurer : "+d);
});

T("la couture est jugée contre λ/10 en haut de bande",()=>{
  SIM.saisie.f2=5e9;                     // λ/10 ≈ 3,3 mm dans un ε_eff de 3,3
  const serre=simCouture(res([Object.assign({},SEG)]));   // SIM.couture absent
  if(serre!=="")throw new Error("sans mesure, rien ne s'écrit");

  SIM.couture={n:20, ecartMax:1.0, couloir:2.0};
  const a=simCouture(res([Object.assign({},SEG)]));
  if(!/serrée/.test(a))throw new Error("1 mm est sous λ/20 : « "+a+" »");

  SIM.couture={n:6, ecartMax:2.5, couloir:2.0};
  const b=simCouture(res([Object.assign({},SEG)]));
  if(!/limite/.test(b))throw new Error("2,5 mm est entre λ/20 et λ/10 : « "+b+" »");

  SIM.couture={n:2, ecartMax:12, couloir:2.0};
  const c=simCouture(res([Object.assign({},SEG)]));
  if(!/lâche/.test(c))throw new Error("12 mm dépasse λ/10 : « "+c+" »");

  SIM.couture={n:0, ecartMax:40, couloir:2.0};
  const d=simCouture(res([Object.assign({},SEG)]));
  if(!/Aucun via de masse/.test(d))
    throw new Error("aucune couture : il faut le dire en toutes lettres");
  /* Et la fréquence qui juge est bien le HAUT de la bande : c'est là que le
     cuivre latéral résonne, pas à f0. */
  SIM.saisie.f2=1e8;
  SIM.couture={n:2, ecartMax:12, couloir:2.0};
  if(!/serrée/.test(simCouture(res([Object.assign({},SEG)]))))
    throw new Error("à 100 MHz, 12 mm est une couture serrée");
  SIM.couture=null; SIM.saisie.f2=5e9;
});

T("le cuivre voisin hors masse est nommé, chiffré, et jamais tu",()=>{
  SIM.voisins=[];
  if(simVoisins()!=="")throw new Error("rien à dire s'il n'y a rien");
  SIM.voisins=[{net:"CLK", ecart:0.2, longueur:12}];
  const h=simVoisins();
  if(h.indexOf("CLK")<0||h.indexOf("0,200")<0||h.indexOf("12,00")<0)
    throw new Error("le net, l'écart et la longueur doivent figurer : "+h);
  if(!/n'entre PAS dans Z/.test(h))
    throw new Error("la note doit dire que ce cuivre ne compte pas dans Z0");
  /* Au-delà de quatre, on compte le reste plutôt que d'écrire une liste. */
  SIM.voisins=[1,2,3,4,5,6].map(i=>({net:"N"+i, ecart:0.3, longueur:i}));
  if(simVoisins().indexOf("2 autre(s)")<0)
    throw new Error("le surplus doit être compté : "+simVoisins());
  SIM.voisins=[];
});

/* ==========================================================================
   LA SECTION RÉSOLUE, ÉCRITE SOUS LA FICHE
   --------------------------------------------------------------------------
   C'est la ligne qui manquait : sans elle, comprendre pourquoi une ligne sort à
   54 Ω au lieu de 50 demandait d'INVERSER le résultat pour retrouver la hauteur
   au plan. Elle doit donc porter toutes les cotes, et surtout leur PROVENANCE —
   « h = 0,380 mm » et « h = 0,380 mm, supposé » ne se lisent pas pareil.
   ========================================================================== */
const SECT={z0:53.4, eps_eff:3.08, longueur:10.69, largeur:0.520, couche:0,
            nom_couche:"Conductor-4", topo:"micro", couvert:false,
            coplanaire:true, cotes:2, ecart:0.287, ecart_g:0.287,
            ecart_d:0.287, plan_haut:"", plan_bas:"Bottom",
            h:0.380, er:4.44, tan_delta:0.02, cuivre:0.035,
            couverture:0, entre_plans:0};

T("la section affiche h, εr, le plan et ε_eff — les cotes, pas seulement Z₀",()=>{
  carte();                               // pour que SIM_IPC.provenance ait LT
  const h=simSection(res([Object.assign({},SECT)]));
  for(const [quoi,motif] of [
      ["la couche",       /Conductor-4/],
      ["le plan",         /plan Bottom/],
      ["la hauteur",      /h 0,380 mm/],
      ["la permittivité", /4,44/],
      ["la tangente",     /tan δ 0,0200/],
      ["le cuivre",       /cuivre 35 µm/],
      ["la largeur",      /piste 0,520 mm/],
      ["eps_eff",         /ε_eff 3,080/],
      ["la topologie",    /microruban/]])
    if(!motif.test(h))throw new Error(quoi+" manque : "+h);
  /* Une couche EXTÉRIEURE porte un masque de soudure, absent de l'empilage
     envoyé : deux à trois pour cent de Z0, et c'est exactement l'ordre de
     grandeur qu'on cherche quand il manque trois ohms. */
  if(!/masque de soudure/.test(h))
    throw new Error("le masque non modélisé doit être signalé sur un "+
                    "microruban nu : "+h);
});

T("une piste interne ne parle pas de masque, et dit sa couverture",()=>{
  carte();
  const h=simSection(res([Object.assign({},SECT,
                          {couvert:true, couverture:0.2})]));
  if(/masque de soudure/.test(h))
    throw new Error("une piste couverte de stratifié n'a pas de masque : "+h);
  if(!/couvert de 0,200 mm de stratifié/.test(h))
    throw new Error("la couverture doit être dite : "+h);
  if(!/microruban couvert/.test(h))throw new Error("topologie : "+h);
});

T("une triplaque dit ses deux plans et où le ruban se trouve entre eux",()=>{
  carte();
  const h=simSection(res([Object.assign({},SECT,
                          {topo:"strip", plan_haut:"Top", plan_bas:"Bottom",
                           entre_plans:1.205, h:0.380})]));
  if(!/plans Top et Bottom/.test(h))throw new Error("les deux plans : "+h);
  if(!/écart entre plans 1,205 mm/.test(h))
    throw new Error("l'écart entre plans commande la triplaque : "+h);
  if(!/ruban à 0,380 mm du plus proche/.test(h))
    throw new Error("la position du ruban : "+h);
  if(/masque de soudure/.test(h))
    throw new Error("une triplaque est enterrée : pas de masque");
});

T("une seule ligne par section distincte, pas une par tronçon",()=>{
  carte();
  /* Trois plages d'écart sur la même piste : même section verticale, seuls les
     bords changent. Trois fois la même ligne n'apprendrait rien. */
  const trois=[
    Object.assign({},SECT,{ecart_g:0.293, ecart_d:0.400, longueur:0.94}),
    Object.assign({},SECT,{ecart_g:0.291, ecart_d:0.363, longueur:0.50}),
    Object.assign({},SECT,{ecart_g:0.287, ecart_d:0.287, longueur:9.25})];
  const h=simSection(res(trois));
  if((h.match(/<p class="simSection">/g)||[]).length!==1)
    throw new Error("une seule ligne attendue : "+h);
  /* Deux couches différentes, en revanche, sont deux sections. */
  const deux=simSection(res([trois[0],
    Object.assign({},SECT,{nom_couche:"Conductor-1", h:0.2})]));
  if((deux.match(/<p class="simSection">/g)||[]).length!==2)
    throw new Error("deux couches, deux sections : "+deux);
  /* Et chacune porte alors la longueur qu'elle couvre, sinon on ne sait pas
     laquelle pèse. */
  if(!/\(0,94 mm\)/.test(deux))
    throw new Error("la longueur par section manque : "+deux);
});

T("rien à décrire ne produit rien",()=>{
  carte();
  if(simSection(res([]))!=="")throw new Error("aucun tronçon : rien à écrire");
  /* Un tronçon écarté par le serveur — pas de plan en face — n'a pas de
     section : il ne porte ni h ni topologie, et l'inventer serait pire que de
     se taire. */
  if(simSection(res([{z0:0, raison:"aucun plan de reference"}]))!=="")
    throw new Error("un tronçon sans impédance n'a pas de section");
});

T("la provenance dit si chaque cote vient du fichier, d'une saisie ou d'un repli",()=>{
  /* Le fichier de laboratoire donne tout : épaisseur de cuivre, épaisseur de
     diélectrique, Dk. Il ne donne PAS de Df — c'est le cas le plus courant. */
  carte();
  const p=SIM_IPC.provenance(Object.assign({},SECT,{plan_bas:"Bottom"}));
  if(!/du fichier/.test(p))
    throw new Error("les valeurs lues doivent être annoncées comme telles : "+p);
  /* ET RIEN D'AUTRE QUE LA PROVENANCE. La phrase portait une réserve générale
     sur l'empilage nominal et la carte pressée ; elle a été retirée, et le
     banc le garde retiré. Elle se répétait à l'identique sous chaque section,
     elle ne se rapportait à aucune des cotes qu'elle suivait, et une réserve
     qu'on lit à chaque calcul cesse d'être lue. */
  if(/[Nn]ominal|press/.test(p))
    throw new Error("la provenance dit d'où viennent les cotes, et rien "+
                    "d'autre : "+p);
  /* Une valeur SAISIE se distingue d'une valeur lue : c'est l'utilisateur qui
     répond du chiffre, et il doit le savoir. */
  V.sur.cu["Top"]=0.070;
  ltPreparer();
  const q=SIM_IPC.provenance(Object.assign({},SECT,{plan_bas:"Bottom"}));
  if(!/cuivre[^;.]*saisi/.test(q))
    throw new Error("une épaisseur saisie doit être dite saisie : "+q);
  V.sur.cu={}; ltPreparer();
});

T("une cote qui manque au fichier est annoncée SUPPOSÉE, avec où la saisir",()=>{
  /* L'empilage ne donne ni épaisseur de diélectrique ni Dk : c'est le cas
     ordinaire d'un IPC-2581 qui ne liste que ses conducteurs, et le repli FR-4
     entre alors en vigueur SANS que rien ne le dise sur la fiche. */
  const modele={
    unites:"MM", nets:["N$1","GND"],
    contour:{o:CONTOUR, t:[]},
    empilage:[{nom:"Top",seq:1,ep:0,type:"CONDUCTOR"},
              {nom:"Bottom",seq:3,ep:0,type:"PLANE"}],
    couches:["Top","Bottom"],
    pistes:[{c:0,n:0,w:W,p:[X1,Y, X2,Y]}],
    arcs:[], plans:[], textes:[], pads:[], composants:[], percages:[]
  };
  mdlCharger(modele); V.net=0;
  SIM.refCle=null; SIM.refAuto=true; SIM.ref=null;
  const p=SIM_IPC.provenance(Object.assign({},SECT,{plan_bas:"Bottom"}));
  if(!/supposé/.test(p))
    throw new Error("une valeur absente du fichier doit être dite supposée : "+p);
  if(!/La carte/.test(p))
    throw new Error("il faut dire OÙ la saisir, sinon l'avertir n'aide pas : "+p);
});


/* ==========================================================================
   L'UNITÉ DES FRÉQUENCES
   --------------------------------------------------------------------------
   La faute qu'on cherche à rendre impossible : écrire 868 dans un champ qui
   attend des gigahertz. Elle ne produisait ni refus ni champ vide — seulement
   une bande ramenée de force par le serveur, des pertes fausses d'un facteur
   trois, et le repère f₀ posé au mauvais endroit sur la courbe.

   CE QUI EST ÉPROUVÉ ICI est l'invariant qui compte : changer d'unité CONVERTIT
   l'écriture, il ne réinterprète pas la valeur. Les hertz ne bougent pas.
   ========================================================================== */
T("changer d'unité ne change pas la fréquence, seulement son écriture",()=>{
  /* ON PASSE PAR LES CHAMPS, parce que c'est par là que passe l'utilisateur :
     `simSaisie()` lit le DOM et le DOM l'emporte sur `SIM.saisie`. Poser la
     valeur en mémoire seule éprouverait un chemin que personne n'emprunte. */
  const ch=id=>document.getElementById(id);
  /* TROIS UNITÉS DEPUIS LE 2026-08-30 : f₀ a la sienne, la bande S a f1 et f2.
     Les régler toutes les trois ici n'est pas une commodité d'essai — c'est ce
     que fait le panneau, qui pose les trois listes. Ne régler que la première
     laisserait la bande se lire en gigahertz, et « 100 » vaudrait 100 GHz. */
  SIM.saisie.unite="MHz"; SIM.saisie.uniteBande1="MHz"; SIM.saisie.uniteBande2="MHz";
  ch("simFc").value="868"; ch("simF1").value="100"; ch("simF2").value="3000";
  simSaisie();
  if(SIM.saisie.fc!==868e6)
    throw new Error("868 en MHz vaut 868 MHz, pas "+SIM.saisie.fc+" Hz");
  simUniteChanger("GHz","fc");
  if(SIM.saisie.unite!=="GHz")throw new Error("l'unité doit avoir changé");
  if(SIM.saisie.fc!==868e6)
    throw new Error("changer d'unité ne déplace pas f₀ : "+SIM.saisie.fc+" Hz");
  if(SIM.saisie.f1!==1e8||SIM.saisie.f2!==3e9)
    throw new Error("la bande ne doit pas bouger non plus");
  /* ET SON UNITÉ NON PLUS : changer celle de f₀ ne doit pas emporter celle de
     la bande, sans quoi les listes n'en feraient qu'une. */
  if(SIM.saisie.uniteBande1!=="MHz" || SIM.saisie.uniteBande2!=="MHz")
    throw new Error("l'unité de la bande a suivi celle de f₀");
  /* ET LE CHAMP A ÉTÉ RÉÉCRIT dans la nouvelle unité : c'est la moitié
     visible du contrat. Sans cela on lirait 868 sous une étiquette GHz. */
  if(ch("simFc").value!=="0,868")
    throw new Error("le champ doit montrer 0,868 : « "+ch("simFc").value+" »");
  /* Et l'aller-retour retombe exactement où il était : sans cela, choisir son
     unité deux fois de suite ferait dériver la valeur. */
  simUniteChanger("MHz","fc");
  simUniteChanger("GHz","fc");
  if(SIM.saisie.fc!==868e6)throw new Error("aller-retour : "+SIM.saisie.fc);
  /* Une unité inconnue ne fait rien plutôt que de poser un facteur absent :
     `simUnite()` retomberait sur GHz et multiplierait par un milliard. */
  simUniteChanger("parsecs","fc");
  if(SIM.saisie.unite!=="GHz")throw new Error("une unité inconnue est refusée");
});

T("les quatre unités portent le bon facteur, et GHz reste le défaut",()=>{
  const attendu={Hz:1, kHz:1e3, MHz:1e6, GHz:1e9};
  for(const u of SIM_UNITES)
    if(u.f!==attendu[u.cle])throw new Error(u.cle+" vaut "+u.f);
  SIM.saisie.unite="GHz";
  if(simUnite().cle!=="GHz")throw new Error("le défaut est le gigahertz");
  /* Une division par un milliard laisse des décimales parasites ; le champ
     doit montrer 0,868, pas 0,8680000000000001. */
  if(simNbLibre(868e6/1e9)!=="0,868")
    throw new Error("écriture du champ : "+simNbLibre(868e6/1e9));
});

/* ==========================================================================
   LES DEUX BOUTS DE LA CHAÎNE
   --------------------------------------------------------------------------
   Le panneau nomme ses ports avec `bout()`. « Port 1 sur la pastille J1.1 » se
   vérifie sans quitter la fiche ; un couple de coordonnées oblige à aller
   regarder la carte, et c'est cette vérification-là qu'on saute.
   ========================================================================== */
T("le bout de la chaîne nomme la pastille et son composant",()=>{
  carte({composants:[{ref:"J1", c:0, x:0, y:0, r:0, m:0,
                      pads:[{x:X1, y:Y, r:0, m:0, ps:"P1", pin:"1", n:0}]}],
         padstacks:{P1:{pad:0.8, pads:[{c:"Top", d:0.8}]}}});
  const obj={layer:simRangCu(0)};
  const t=SIM_IPC.bout([X1,Y],obj);
  if(!/J1[.]1/.test(t))throw new Error("la pastille doit être nommée : « "+t+" »");
  /* Loin de tout cuivre on ne dit RIEN, plutôt que d'attraper la pastille la
     plus proche : un nom faux est pire qu'une coordonnée seule. */
  if(SIM_IPC.bout([X2,Y],obj)!=="")
    throw new Error("l'autre bout ne porte aucune pastille");
  /* Une couche qui n'est pas celle de la pastille ne la voit pas : la même
     coordonnée sur le plan du dessous n'est pas la même chose. */
  if(SIM_IPC.bout([X1,Y],{layer:simRangCu(1)})!=="")
    throw new Error("la pastille est sur Top, pas sur Bottom");
});


/* ==========================================================================
   LA CHUTE CONTINUE : le cuivre d'une carte LIVREE
   --------------------------------------------------------------------------
   Le solveur a ses propres etalons (python/test/banc-dc.py, contre rho L/(W t)).
   Ce qui se joue ici est l'autre moitie : ce que la visionneuse LUI ENVOIE.
   Un solveur juste nourri d'un mauvais cuivre rend un mauvais chiffre, et rien
   dans le panneau ne le dirait.
   ========================================================================== */

/* Une carte a deux couches, deux pastilles traversantes du meme net, une piste
   par couche et un percage au milieu : le courant DOIT changer de couche. */
function dcCarteIpc(opts){
  opts=opts||{};
  const r=carte({
    nets:["VDD","GND"],
    piste:{c:0, n:0, w:0.5, p:[10,20, 30,20]},
    formes:{rond:{t:"CIRCLE", d:1.4}},
    padstacks:{PS:{pad:1.4, pads:[{c:"Top", d:1.4, f:"rond"},
                                  {c:"Bottom", d:1.4, f:"rond"}]}},
    pads:[{ps:"PS", x:10, y:20, n:0, pin:1},
          {ps:"PS", x:50, y:20, n:0, pin:2}],
    percages:opts.percages||[{x:30, y:20, d:0.4, p:"PLATED", n:0}]
  });
  /* La seconde piste, sur la couche du bas. `carte()` n'en pose qu'une. */
  V.modele.pistes.push({c:1, n:0, w:0.5, p:[30,20, 50,20]});
  mdlCharger(V.modele);
  ltPreparer();
  SIM_IPC.dcOublier();
  return r;
}
function dcBorneIpc(role,x,y){
  SIM_IPC.dcChoisir(role);
  simDCClic(x,y);
}

T("chute DC : sans empilage pret, un refus qui dit ou aller",()=>{
  dcCarteIpc();
  const garde=LT.pret;
  try{
    LT.pret=false;
    const r=SIM_IPC.cuivreDC();
    if(!r.erreur)throw new Error("calcul lance sans empilage");
    if(!/[Ee]mpilage/.test(r.erreur))throw new Error("refus muet : "+r.erreur);
    if(!/La carte/.test(r.conseil||""))
      throw new Error("le refus ne dit pas ou completer : "+r.conseil);
  }finally{LT.pret=garde;}
});

T("chute DC : sans les deux bornes, un refus explicite",()=>{
  dcCarteIpc();
  const r=SIM_IPC.cuivreDC();
  if(!r.erreur)throw new Error("aucun refus sans borne");
  if(!/au moins une source et une charge/.test(r.erreur))
    throw new Error("refus muet : "+r.erreur);
});

T("chute DC : le clic prend la pastille et la nomme par son net",()=>{
  dcCarteIpc();
  dcBorneIpc("source",10,20);
  const B=SIM_IPC.dcBornes();
  if(B.length!==1)throw new Error(B.length+" borne(s) apres un clic");
  if(B[0].net!=="VDD")throw new Error("net faux : "+B[0].net);
  if(B[0].role!=="source")throw new Error("role faux : "+B[0].role);
  if(B[0].couche!==0)throw new Error("couche fausse : "+B[0].couche);
});

T("chute DC : un clic loin de tout ne pose rien",()=>{
  dcCarteIpc();
  dcBorneIpc("source",5,38);
  if(SIM_IPC.dcBornes().length)
    throw new Error("une borne posee la ou il n'y a pas de pastille");
});

T("chute DC : le cuivre part sur les DEUX couches, avec son epaisseur",()=>{
  dcCarteIpc();
  dcBorneIpc("source",10,20);
  dcBorneIpc("charge",50,20);
  const r=SIM_IPC.cuivreDC();
  if(r.erreur)throw new Error("refus inattendu : "+r.erreur);
  const couches=[...new Set(r.polygones.map(g=>g.couche))].sort();
  if(couches.join()!=="0,1")
    throw new Error("couches envoyees : "+couches.join()+" au lieu de 0,1");
  for(const g of r.polygones){
    if(g.net!=="VDD")throw new Error("cuivre d'un autre net : "+g.net);
    if(!(g.epaisseur>0))throw new Error("epaisseur nulle sur la couche "+g.couche);
    if(Math.abs(g.epaisseur-LT.cu[g.couche].ep)>1e-12)
      throw new Error("epaisseur "+g.epaisseur+" au lieu de "+
                      LT.cu[g.couche].ep);
  }
});

T("chute DC : le percage part comme un tube, entre couches voisines",()=>{
  dcCarteIpc();
  dcBorneIpc("source",10,20);
  dcBorneIpc("charge",50,20);
  const r=SIM_IPC.cuivreDC();
  const tubes=r.vias.filter(v=>/^T\d/.test(v.repere));
  if(!tubes.length)throw new Error("aucun tube : le courant ne peut pas "+
                                   "changer de couche");
  for(const v of tubes){
    if(Math.abs(v.couche_b-v.couche_a)!==1)
      throw new Error("liaison non contigue : "+v.couche_a+"→"+v.couche_b);
    if(!(v.hauteur>0))throw new Error("hauteur nulle");
    if(v.net!=="VDD")throw new Error("le tube a perdu son net");
  }
  /* LE FICHIER NE DIT PAS LA PORTEE d'un percage : on le suppose traversant,
     et il faut que le panneau le DISE plutot que de le taire. */
  if(!(r.notes||[]).some(t=>/TRAVERSANT/.test(t)))
    throw new Error("l'hypothese de percage traversant n'est pas dite : "+
                    (r.notes||[]).join(" | "));
});

/* ==========================================================================
   LA PORTEE DU PERCAGE — QUATRE COUCHES, PARCE QU'A DEUX ON NE VOIT RIEN
   --------------------------------------------------------------------------
   Sur une carte deux couches, un via ne peut etre que traversant : le defaut
   et la verite se confondent, et l'essai ne prouverait rien. A quatre, un
   borgne 1-2 doit poser UNE liaison la ou l'hypothese traversante en posait
   TROIS -- deux resistances en serie de trop, et deux chemins verticaux qui
   n'existent pas.

   Le cuivre du net est present sur les quatre couches au droit du trou : c'est
   le cas qui piege, parce que le code d'avant en concluait que le trou les
   relie toutes.
   ========================================================================== */
function dcCarte4Ipc(percages){
  const pistes=[0,1,2,3].map(c=>({c:c, n:0, w:0.5, p:[10,20, 40,20]}));
  carte({
    nets:["VDD","GND"],
    piste:pistes[0],
    pistes:pistes,
    couches:["Top","In1","In2","Bottom"],
    empilage:[
      {nom:"Top",    seq:1, ep:0.035, type:"CONDUCTOR"},
      {nom:"D1",     seq:2, ep:0.2,   type:"DIELECTRIC", dk:"4.3", df:"0.02"},
      {nom:"In1",    seq:3, ep:0.035, type:"CONDUCTOR"},
      {nom:"D2",     seq:4, ep:0.4,   type:"DIELECTRIC", dk:"4.3", df:"0.02"},
      {nom:"In2",    seq:5, ep:0.035, type:"CONDUCTOR"},
      {nom:"D3",     seq:6, ep:0.2,   type:"DIELECTRIC", dk:"4.3", df:"0.02"},
      {nom:"Bottom", seq:7, ep:0.035, type:"CONDUCTOR"}
    ],
    percages:percages
  });
  ltPreparer();
  SIM_IPC.dcOublier();
  /* Pas de pastille sur cette carte : les bornes se posent a la main, comme
     dans l'essai des decoupes de plan. */
  SIM_DCB.bornes=[
    {role:"source", nom:"A", x:10, y:20, couche:0, net:"VDD", d:1, valeur:3.3},
    {role:"charge", nom:"B", x:40, y:20, couche:3, net:"VDD", d:1, valeur:1}
  ];
  return SIM_IPC.cuivreDC.call({dcBornes:()=>SIM_DCB.bornes});
}

T("chute DC : sans portee declaree, le trou relie tout et le dit",()=>{
  const r=dcCarte4Ipc([{x:30, y:20, d:0.4, p:"PLATED", n:0}]);
  if(r.erreur)throw new Error("refus inattendu : "+r.erreur);
  const en30=r.vias.filter(v=>Math.abs(v.x-30)<1e-6);
  if(en30.length!==3)
    throw new Error(en30.length+" liaison(s) au lieu de 3 sur quatre couches");
  if(!(r.notes||[]).some(t=>/TRAVERSANT/.test(t)))
    throw new Error("l'hypothese n'est pas dite : "+(r.notes||[]).join(" | "));
  if((r.notes||[]).some(t=>/PORT[ÉE]E d/i.test(t)))
    throw new Error("une portee declaree est annoncee alors qu'il n'y en a pas");
});

T("chute DC : une portee declaree borne le tube, et le cuivre au-dela n'est pas relie",()=>{
  /* LE CAS QUI COMPTE : un borgne Top -> In1 sur une carte qui porte du cuivre
     du meme net sur les quatre couches. `sa` / `sb` sont des index de COUCHE
     du modele -- ici 0 et 1 dans ["Top","In1","In2","Bottom"]. */
  const r=dcCarte4Ipc([{x:30, y:20, d:0.4, p:"PLATED", n:0,
                        sa:0, sb:1, ss:"calque"}]);
  if(r.erreur)throw new Error("refus inattendu : "+r.erreur);
  const en30=r.vias.filter(v=>Math.abs(v.x-30)<1e-6);
  if(en30.length!==1)
    throw new Error(en30.length+" liaison(s) au lieu d'une pour un borgne 1-2");
  const v=en30[0];
  if(v.couche_a!==0||v.couche_b!==1)
    throw new Error("le borgne relie "+v.couche_a+"→"+v.couche_b);
  /* LA HAUTEUR SUIT LA PORTEE : le premier intervalle seul, pas la carte. */
  if(Math.abs(v.hauteur-simDCHauteurIpc(0,1))>1e-9)
    throw new Error("hauteur "+v.hauteur+" au lieu de "+simDCHauteurIpc(0,1));
  const notes=(r.notes||[]).join(" | ");
  if(!/PORT[ÉE]E d[ée]clar/i.test(notes))
    throw new Error("la portee lue n'est pas dite : "+notes);
  if(/TRAVERSANT/.test(notes))
    throw new Error("le trou est encore annonce traversant : "+notes);
  /* LES ANNEAUX HORS PORTEE SONT COMPTES : du cuivre du net existe sur In2 et
     Bottom au droit du trou, et il n'est PAS raccorde par lui. Le taire
     laisserait croire que le trou ne rencontre rien la-bas. */
  if(!/hors de la port[ée]e/i.test(notes))
    throw new Error("le cuivre hors portee n'est pas signale : "+notes);
});

T("chute DC : une portee vers une couche hors empilage est ignoree, pas devinee",()=>{
  /* Une portee a moitie resolue vaudrait moins que rien : elle bornerait le
     tube n'importe ou. On retombe sur l'hypothese traversante, QUI NE PERD
     AUCUN CHEMIN, et on le dit. */
  const r=dcCarte4Ipc([{x:30, y:20, d:0.4, p:"PLATED", n:0,
                        sa:0, sb:99, ss:"calque"}]);
  const en30=r.vias.filter(v=>Math.abs(v.x-30)<1e-6);
  if(en30.length!==3)
    throw new Error(en30.length+" liaison(s) : la portee douteuse a ete suivie");
  if(!(r.notes||[]).some(t=>/TRAVERSANT/.test(t)))
    throw new Error("le repli n'est pas dit : "+(r.notes||[]).join(" | "));
});

/* ==========================================================================
   LES PLANS : UN CHEMIN PAR CONTOUR
   --------------------------------------------------------------------------
   evenodd N'EST PAS UNE UNION, c'est un OU EXCLUSIF -- et tous les contours de
   plans d'une couche etaient verses dans UN SEUL Path2D rempli en evenodd.
   Trois defauts visibles a l'oeil, tous du meme mecanisme :

     · deux DEGAGEMENTS qui se recouvrent -- le cas ordinaire d'un connecteur a
       broches serrees -- se rendent mutuellement leur cuivre : la lentille
       commune se remplit, et un anneau de cuivre apparait entre deux pastilles
       la ou le fondeur n'en a pas laisse ;
     · deux ILOTS de plan qui se recouvrent s'annulent : leur intersection
       devient un TROU, avec le contour de l'intersection pour forme ;
     · le degagement d'un contour, s'il traverse un autre contour, cesse d'etre
       un trou.

   LA BONNE GRANULARITE EST LE CONTOUR : dedans, evenodd fait le trou qu'il
   faut (un degagement est INCLUS dans son exterieur) ; dehors, deux `fill()`
   successifs sont une union.
   ========================================================================== */
T("plans : un chemin par contour, et non un seul pour toute la couche",()=>{
  const carre=(x0,y0,x1,y1)=>[x0,y0, x1,y0, x1,y1, x0,y1];
  /* Deux ilots qui SE RECOUVRENT, chacun avec son degagement. C'est la
     geometrie qui produisait un trou noir a l'intersection. */
  const plans=[{c:0, n:0, g:[
    {o:carre(0,0,20,20), t:[carre(4,4,6,6)]},
    {o:carre(10,0,30,20), t:[carre(24,4,26,6)]}
  ]}];
  const out=mdlPlansDans(plans);
  if(!Array.isArray(out))
    throw new Error("les plans sortent encore en un seul chemin : evenodd y "+
                    "ferait un OU exclusif entre contours");
  if(out.length!==2)
    throw new Error(out.length+" chemin(s) au lieu d'un par contour");
  /* CHAQUE CHEMIN NE PORTE QUE SON CONTOUR : quatre sommets d'exterieur et
     quatre de degagement, et pas ceux du voisin. Le stub de Path2D enregistre
     ses points, ce qui rend la verification exacte. */
  for(const p of out)
    if(p.pts.length!==8)
      throw new Error("un chemin porte "+p.pts.length+" sommets au lieu de 8 :"+
                      " il a ramasse ceux d'un autre contour");
  /* ET LE CHEMIN DU PREMIER CONTOUR EST BIEN LE PREMIER : l'ordre est celui du
     fichier, et c'est celui dans lequel le cuivre se pose. */
  if(out[0].pts[0][0]!==0||out[1].pts[0][0]!==10)
    throw new Error("les contours sont melanges");
  /* RIEN A DESSINER REND NULL, pas un tableau vide : le rendu teste `if
     (chemins.plans)` et un tableau vide est VRAI -- il entrerait dans la
     boucle pour rien a chaque image. */
  if(mdlPlansDans([])!==null)throw new Error("un tableau pour rien");
  if(mdlPlansDans(null)!==null)throw new Error("un tableau sans plans");
  /* UN CONTOUR SANS EXTERIEUR EXPLOITABLE EST ECARTE : trois nombres ne font
     pas un polygone, et `moveTo` sur un tableau court poserait un NaN. */
  if(mdlPlansDans([{c:0,n:0,g:[{o:[0,0,1,1]}]}])!==null)
    throw new Error("un contour a deux sommets a ete garde");
});

T("plans : le cuivre d'un net mis en evidence suit la meme regle",()=>{
  /* La mise en evidence construisait son propre chemin unique, avec le meme
     defaut : surligner un plan de masse trouait sa propre surface la ou deux
     ilots se recouvrent. */
  const carre=(x0,y0,x1,y1)=>[x0,y0, x1,y0, x1,y1, x0,y1];
  carte({
    nets:["GND"],
    piste:{c:0, n:0, w:0.4, p:[10,20, 20,20]},
    plans:[{c:0, n:0, g:[{o:carre(0,0,20,20), t:[]},
                         {o:carre(10,0,30,20), t:[]}]}]
  });
  V.net=0;
  const g=mdlCheminsNet(0,mdlMevTout());
  if(!g.plans)throw new Error("aucune surface mise en evidence");
  if(!Array.isArray(g.plans))
    throw new Error("la mise en evidence garde un chemin unique");
  if(g.plans.length!==2)
    throw new Error(g.plans.length+" chemin(s) au lieu de deux");
});

T("chute DC : les formes ecartees NOMMENT leur couche",()=>{
  /* « 90 forme(s) ecartee(s) » ne se corrige pas : il faut savoir LAQUELLE des
     couches manque a l'empilage de calcul pour aller la completer -- et le
     compte par couche dit s'il s'agit d'un oubli (une couche de cuivre
     entiere absente) ou du cas normal : du cuivre sur une couche technique,
     qui n'a rien a faire dans un reseau resistif. */
  const pistes=[{c:0,n:0,w:0.5,p:[10,20, 40,20]},
                {c:1,n:0,w:0.5,p:[10,22, 40,22]},
                {c:1,n:0,w:0.5,p:[10,24, 40,24]}];
  carte({
    nets:["VDD","GND"],
    piste:pistes[0], pistes:pistes,
    /* La couche 1 est dans `couches` mais PAS dans l'empilage : c'est
       exactement le cas qui ecarte des formes. */
    couches:["Top","Masque","Bottom"],
    empilage:[
      {nom:"Top",    seq:1, ep:0.035, type:"CONDUCTOR"},
      {nom:"D1",     seq:2, ep:0.2,   type:"DIELECTRIC", dk:"4.3"},
      {nom:"Bottom", seq:3, ep:0.035, type:"CONDUCTOR"}
    ]
  });
  ltPreparer();
  SIM_IPC.dcOublier();
  SIM_DCB.bornes=[
    {role:"source", nom:"A", x:10, y:20, couche:0, net:"VDD", d:1, valeur:3.3},
    {role:"charge", nom:"B", x:40, y:20, couche:0, net:"VDD", d:1, valeur:1}
  ];
  const r=SIM_IPC.cuivreDC.call({dcBornes:()=>SIM_DCB.bornes});
  if(r.erreur)throw new Error("refus inattendu : "+r.erreur);
  const n=(r.notes||[]).find(t=>/ecart|écart/.test(t))||"";
  if(!n)throw new Error("aucune note sur les formes ecartees");
  if(!/Masque/.test(n))
    throw new Error("la note ne nomme pas la couche : "+n);
  if(!/\(2\)/.test(n))
    throw new Error("la note ne dit pas combien par couche : "+n);
  if(!/empilage/.test(n))
    throw new Error("la note ne dit pas quoi faire : "+n);
});

T("chute DC : la portee sert aussi au chemin de retour, dans le bon sens",()=>{
  /* LE SENS DE L'ERREUR S'INVERSE ICI, et c'est pour cela que la portee y
     compte encore plus. Cote solveur DC, un borgne pris pour traversant rend
     une resistance SURESTIMEE -- le cote prudent. Cote chemin de retour, il
     fait passer pour REFERMEE une boucle qui reste ouverte : ca rassure. */
  dcCarte4Ipc([]);
  const p=simXtPortee({sa:0, sb:1, ss:"calque"});
  if(!p.declaree)throw new Error("la portee lue n'est pas reconnue");
  if(p.a!==simRangCu(0)||p.b!==simRangCu(1))
    throw new Error("portee envoyee "+p.a+"→"+p.b);
  const q=simXtPortee({});
  if(q.declaree)throw new Error("une portee absente se declare lue");
  if(q.a!==simRangCu(0)||q.b!==simRangCu(3))
    throw new Error("le repli ne couvre pas la carte : "+q.a+"→"+q.b);
  /* ET LE COMPTE : la note d'optimisme ne doit parler QUE des supposes. Zero
     suppose, pas de note -- l'ecrire quand meme apprendrait a ne plus la
     lire. */
  if(simXtPorteesSupposees([{portee_declaree:true},
                            {portee_declaree:true}])!==0)
    throw new Error("des supposes comptes la ou il n'y en a pas");
  if(simXtPorteesSupposees([{portee_declaree:true},{}])!==1)
    throw new Error("un suppose n'est pas compte");
});

T("chute DC : les cotes thermiques viennent de l'empilage, pas d'un repli",()=>{
  /* LE SOLVEUR NE LIT PLUS L'ECHAUFFEMENT SUR UNE CHARTE : il resout
     l'etalement dans le stratifie, et il lui faut deux cotes que seul
     l'empilage porte. Sur la carte a quatre couches ci-dessus : trois
     intervalles de 0,2 + 0,4 + 0,2 = 0,8 mm de dielectrique. */
  const r=dcCarte4Ipc([]);
  const th=r.thermique;
  if(!th)throw new Error("aucune cote thermique envoyee");
  if(Math.abs(th.epaisseur_stratifie-0.8)>1e-9)
    throw new Error("stratifie : "+th.epaisseur_stratifie+" mm au lieu de 0,8");
  /* AUCUN PLAN SUR CETTE CARTE : quatre pistes, rien qui couvre. Le cuivre
     etaleur doit donc etre NUL -- un repli optimiste inventerait un plan de
     masse et rendrait une temperature plus basse que la verite, ce qui est
     l'erreur du cote qui rassure. */
  if(th.cuivre_etaleur>1e-12)
    throw new Error("un cuivre etaleur invente : "+th.cuivre_etaleur);
  /* λ N'EST PAS FOURNI : « FR-4 » ne donne pas une conductivite thermique, il
     la suggere. Le poser ici la ferait passer pour une cote lue ; on laisse le
     solveur mettre son repli et l'ANNONCER comme suppose. */
  if(th.k_stratifie!=null)
    throw new Error("un lambda est fourni alors qu'aucun fichier ne le porte");

  /* AVEC UN PLAN, il doit remonter. Une zone qui couvre la carte sur la couche
     du bas : `ltPreparer` en fait un plan, et le meme taux qui decide d'une
     masse de reference decide de l'ailette. */
  carte({
    nets:["VDD","GND"],
    piste:{c:0, n:0, w:0.5, p:[10,20, 40,20]},
    couches:["Top","Bottom"],
    plans:[{c:1, n:1, g:[{o:CONTOUR, t:[]}]}]
  });
  ltPreparer();
  const th2=simDCThermiqueIpc();
  if(!(th2.cuivre_etaleur>0.03))
    throw new Error("le plan n'etale pas : "+th2.cuivre_etaleur);
});

T("carte DC : cet outil PROPOSE la couche de la charge, il ne l'impose plus",()=>{
  /* CE QUI NE MARCHAIT PAS. La visionneuse affiche toutes les couches et n'a
     pas de couche active : elle prenait celle de la premiere CHARGE, et rien
     d'autre. Sur un rail qui traverse la carte -- le cas ordinaire d'un calcul
     de chute --, la couche ou ca chauffe n'est presque jamais celle-la, et il
     fallait effacer les bornes et les reposer dans un autre ordre pour la
     voir, ce qui relance le calcul pour rien. */
  dcCarte4Ipc([]);
  SIM_DCB.bornes=[
    {role:"source", nom:"A", x:10, y:20, couche:0, net:"VDD", d:1, valeur:3.3},
    {role:"charge", nom:"B", x:40, y:20, couche:3, net:"VDD", d:1, valeur:1}
  ];
  if(SIM_IPC.dcCoucheProposee()!==3)
    throw new Error("la charge n'est pas proposee : "+
                    SIM_IPC.dcCoucheProposee());
  if(SIM_IPC.dcNomCouche(3)!=="Bottom")
    throw new Error("la couche n'est pas nommee : "+SIM_IPC.dcNomCouche(3));
  const garde=SIM.dcImages, gardeC=SIM.dcCouche;
  try{
    SIM.dcImages={images:new Map([[0,{}],[3,{}]]), vmin:0, vmax:1,
                  quoi:"echauffement"};
    SIM.dcCouche=null;
    if(simDCCoucheVue()!==3)
      throw new Error("sans choix, la proposition n'est pas suivie : "+
                      simDCCoucheVue());
    SIM.dcCouche=0;
    if(simDCCoucheVue()!==0)
      throw new Error("le choix de la fiche n'est pas suivi : "+
                      simDCCoucheVue());
  }finally{SIM.dcImages=garde;SIM.dcCouche=gardeC;}
});

T("chute DC : un percage NON metallise ne conduit rien, et c'est dit",()=>{
  dcCarteIpc({percages:[{x:30, y:20, d:0.4, p:"NON_PLATED", n:0}]});
  dcBorneIpc("source",10,20);
  dcBorneIpc("charge",50,20);
  const r=SIM_IPC.cuivreDC();
  /* Les tubes des PASTILLES traversantes restent, eux : ils sont legitimes.
     Ce qu'on verifie, c'est qu'aucun tube ne s'est pose SUR le trou nu. */
  const en30=r.vias.filter(v=>Math.abs(v.x-30)<1e-6&&Math.abs(v.y-20)<1e-6);
  if(en30.length)
    throw new Error("un trou non metallise a ete monte : "+en30.length);
  if(!(r.notes||[]).some(t=>/non m/.test(t)))
    throw new Error("l'ecart n'est pas dit : "+(r.notes||[]).join(" | "));
});

T("chute DC : un trou NU sous une pastille ne se metallise pas tout seul",()=>{
  /* La regle « pastille sur deux couches donc tube » ne doit pas passer par
     dessus ce que le fichier DIT : un trou declare non metallise n'est pas
     plaque, et les anneaux qu'il traverse ne sont pas joints. */
  dcCarteIpc({percages:[{x:10, y:20, d:0.6, p:"NON_PLATED", n:0}]});
  dcBorneIpc("source",10,20);
  dcBorneIpc("charge",50,20);
  const r=SIM_IPC.cuivreDC();
  const en10=r.vias.filter(v=>Math.abs(v.x-10)<1e-6&&Math.abs(v.y-20)<1e-6);
  if(en10.length)
    throw new Error("la regle de pastille a metallise un trou declare nu");
});

T("chute DC : les decoupes d'un plan partent en trou",()=>{
  const r0=carte({
    nets:["VDD","GND"],
    piste:{c:0, n:0, w:0.5, p:[10,20, 50,20]},
    plans:[{c:0, n:0, g:[{o:rect(5,10,55,30), t:[rect(28,18,32,22)]}]}]
  });
  ltPreparer();
  SIM_IPC.dcOublier();
  /* Sans pastille, on pose les bornes a la main : ce cas n'eprouve que le
     plan. */
  SIM_DCB.bornes=[
    {role:"source", nom:"A", x:10, y:20, couche:0, net:"VDD", d:1, valeur:3.3},
    {role:"charge", nom:"B", x:50, y:20, couche:0, net:"VDD", d:1, valeur:1}
  ];
  const r=SIM_IPC.cuivreDC.call({dcBornes:()=>SIM_DCB.bornes});
  if(r.erreur)throw new Error("refus inattendu : "+r.erreur);
  const trous=r.polygones.filter(g=>g.trou);
  if(trous.length!==1)throw new Error(trous.length+" trou(s) au lieu d'un");
  if(!r.polygones[r.polygones.length-1].trou)
    throw new Error("la decoupe n'est pas en fin de liste : posee avant le "+
                    "plan, elle n'evide rien");
});

T("chute DC : aucun cuivre du net n'est laisse sans liaison verticale",()=>{
  /* L'INVARIANT QUI COMPTE, ET CE QU'IL A COUTE DE NE PAS L'AVOIR.

     Les cas ci-dessus verifient la FORME de ce qui part -- un tube contigu,
     une hauteur juste, un net conserve. Tous passaient pendant que le
     document, dans son ensemble, etait INCALCULABLE : les pastilles
     traversantes posaient du cuivre sur les deux couches et rien ne les
     joignait, faute d'un percage liste a leur emplacement. Le solveur
     refusait tout -- « 1240 noeuds n'atteignent aucune reference » -- et il
     a fallu lui envoyer le document pour le voir.

     Celui-ci le voit sans serveur : toute couche ou le net pose du cuivre
     doit etre atteignable depuis la couche de la source en suivant les
     liaisons envoyees. C'est le seul cas de cette section qui juge le
     document ENTIER plutot qu'un morceau. */
  dcCarteIpc();
  dcBorneIpc("source",10,20);
  dcBorneIpc("charge",50,20);
  const r=SIM_IPC.cuivreDC();
  if(r.erreur)throw new Error("refus inattendu : "+r.erreur);
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
                    orphelines.map(l=>l+1).join(", ")+" : le solveur refusera "+
                    "tout le calcul");
});

T("chute DC : une pastille posee sur deux couches emporte son tube",()=>{
  /* Un padstack qui place du cuivre sur deux conducteurs DECRIT un trou
     metallise : c'est le tube qui joint ses anneaux. Le fichier ne liste pas
     toujours le percage a cet endroit -- il faut donc le deduire, et le DIRE. */
  dcCarteIpc({percages:[]});          // aucun percage liste
  dcBorneIpc("source",10,20);
  dcBorneIpc("charge",50,20);
  const r=SIM_IPC.cuivreDC();
  if(r.erreur)throw new Error("refus inattendu : "+r.erreur);
  if(r.vias.length<2)
    throw new Error("les pastilles traversantes n'ont pas de tube : "+
                    r.vias.length);
  if(!(r.notes||[]).some(t=>/SUPPOS/.test(t)))
    throw new Error("le percage suppose n'est pas annonce : "+
                    (r.notes||[]).join(" | "));
});

T("chute DC : un percage sous une pastille ne compte qu'une fois",()=>{
  /* Un percage tombe presque toujours SOUS une pastille. Le compter deux fois
     mettrait deux resistances en parallele la ou il n'y a qu'un tube, et la
     chute ressortirait trop faible -- du cote qui rassure. */
  dcCarteIpc({percages:[{x:10, y:20, d:0.6, p:"PLATED", n:0},
                        {x:30, y:20, d:0.4, p:"PLATED", n:0}]});
  dcBorneIpc("source",10,20);
  dcBorneIpc("charge",50,20);
  const r=SIM_IPC.cuivreDC();
  const en10=r.vias.filter(v=>Math.abs(v.x-10)<1e-6&&Math.abs(v.y-20)<1e-6);
  if(en10.length!==1)
    throw new Error(en10.length+" tubes au meme endroit : le percage et la "+
                    "pastille ont ete comptes chacun de leur cote");
  /* Et c'est le percage DU FICHIER qui gagne sur le repli. */
  if(Math.abs(en10[0].percage-0.6)>1e-9)
    throw new Error("le percage suppose l'emporte sur celui du fichier : "+
                    en10[0].percage);
});

T("chute DC : une piste rend un quadrilatere par segment, allonge aux bouts",()=>{
  const g=simDCPolysPisteIpc({p:[0,0, 10,0], w:1},1);
  if(g.length!==1)throw new Error(g.length+" morceaux pour un segment");
  const xs=g[0].map(p=>p[0]), ys=g[0].map(p=>p[1]);
  if(Math.abs(Math.min.apply(null,xs)+0.5)>1e-9)
    throw new Error("bout non allonge : x min = "+Math.min.apply(null,xs));
  if(Math.abs(Math.max.apply(null,ys)-0.5)>1e-9)
    throw new Error("largeur fausse : y max = "+Math.max.apply(null,ys));
  const b=simDCPolysPisteIpc({p:[0,0, 10,0, 10,10], w:1},1);
  if(b.length!==2)throw new Error("une ligne brisee de deux segments rend "+
                                  b.length+" morceaux");
});

T("chute DC : le pouce se convertit en millimetres",()=>{
  /* LE DOCUMENT D'ECHANGE EST EN MILLIMETRES, toujours. Une carte en pouces
     dont le cuivre partirait tel quel serait 25,4 fois trop petite, et sa
     resistance 25,4 fois trop faible -- du cote qui rassure. */
  const g=simDCPolysPisteIpc({p:[0,0, 1,0], w:0.1},simKUnite());
  const avant=Math.max.apply(null,g[0].map(p=>p[0]));
  V.unite="in";
  const h=simDCPolysPisteIpc({p:[0,0, 1,0], w:0.1},simKUnite());
  const apres=Math.max.apply(null,h[0].map(p=>p[0]));
  V.unite="mm";
  if(Math.abs(apres-avant*25.4)>1e-9)
    throw new Error("le pouce ne vaut pas 25,4 mm ici : "+apres+" contre "+
                    (avant*25.4));
});

T("chute DC : une forme de pastille ronde rend un polygone place et tourne",()=>{
  V.modele={formes:{rond:{t:"CIRCLE", d:2}}, formesuser:{}};
  const g=simDCPadPolysIpc({forme:"rond", x:5, y:7, rot:0, mir:0, d:2},1);
  if(g.plein.length!==1)throw new Error("aucun contour");
  const xs=g.plein[0].map(p=>p[0]), ys=g.plein[0].map(p=>p[1]);
  const cx=(Math.min.apply(null,xs)+Math.max.apply(null,xs))/2;
  const cy=(Math.min.apply(null,ys)+Math.max.apply(null,ys))/2;
  if(Math.abs(cx-5)>1e-9||Math.abs(cy-7)>1e-9)
    throw new Error("centre en "+cx+" ; "+cy+" au lieu de 5 ; 7");
  if(Math.abs(Math.max.apply(null,xs)-6)>1e-9)
    throw new Error("rayon faux : x max = "+Math.max.apply(null,xs));
});

T("chute DC : un rectangle tourne de 90 degres echange ses cotes",()=>{
  V.modele={formes:{r:{t:"RECTCENTER", w:4, h:2}}, formesuser:{}};
  const d=simDCPadPolysIpc({forme:"r", x:0, y:0, rot:0, mir:0},1).plein[0];
  const t=simDCPadPolysIpc({forme:"r", x:0, y:0, rot:90, mir:0},1).plein[0];
  const larg=a=>Math.max.apply(null,a.map(p=>p[0]))-
                Math.min.apply(null,a.map(p=>p[0]));
  const haut=a=>Math.max.apply(null,a.map(p=>p[1]))-
                Math.min.apply(null,a.map(p=>p[1]));
  if(Math.abs(larg(d)-4)>1e-9||Math.abs(haut(d)-2)>1e-9)
    throw new Error("droit : "+larg(d)+" x "+haut(d));
  if(Math.abs(larg(t)-2)>1e-9||Math.abs(haut(t)-4)>1e-9)
    throw new Error("tourne : "+larg(t)+" x "+haut(t));
});

T("chute DC : la couche peinte est celle de la charge",()=>{
  SIM_DCB.bornes=[];
  if(simDCCoucheVue()!==-1)
    throw new Error("une couche est peinte sans borne");
  SIM_DCB.bornes=[{role:"source", couche:1},{role:"charge", couche:0}];
  if(simDCCoucheVue()!==0)
    throw new Error("couche peinte : "+simDCCoucheVue()+" au lieu de 0");
  SIM_DCB.bornes=[];
});


function xm0(){return (X1+X2)/2;}

/* ==========================================================================
   LES COTES DU VIA PARTENT AVEC LA SÉLECTION
   --------------------------------------------------------------------------
   MÊME BESOIN QUE DANS L'ÉDITEUR, SOURCE PLUS PAUVRE. Le serveur chiffrait le
   via sur des replis — 0,3 mm de perçage, 2,5 fois cela en pastille — parce que
   les deux pages ne les envoyaient pas. L'IPC-2581, lui, porte des TROUS d'un
   côté et des PASTILLES de l'autre : c'est à nous de les rapprocher par leur
   position, exactement comme le fait déjà le chemin DC.

   TROIS CAS, ET LE TROISIÈME EST LE PLUS IMPORTANT : un trou déclaré NON
   métallisé ne joint rien, et l'accrocher donnerait une liaison là où le
   fichier dit qu'il n'y en a pas.
   ========================================================================== */

/* Une liaison qui change de couche au milieu, et de quoi la réaliser. */
function carteVia(opts){
  opts=opts||{};
  const xm=(X1+X2)/2;
  const c=carte({
    percages:opts.percages||[],
    pads:opts.pads||[],
    padstacks:opts.padstacks||{}
  });
  /* Deux pistes : couche 0 jusqu'au milieu, couche 1 ensuite. */
  c.modele.pistes=[{c:0, n:0, w:W, p:[X1,Y, xm,Y]},
                   {c:1, n:0, w:W, p:[xm,Y, X2,Y]}];
  mdlCharger(c.modele);
  V.net=0;
  SIM.refCle=null; SIM.refAuto=true; SIM.ref=null;
  return xm;
}

/* Une pastille traversante : le padstack la pose sur les deux cuivres, et
   c'est `mdlPadPlace` qui en fait des pastilles POSÉES avec leur diamètre. */
function padTraversante(d){
  return {padstacks:{V1:{pad:d, pads:[{c:"Top", d:d}, {c:"Bottom", d:d}]}},
          pads:[{x:xm0(), y:Y, ps:"V1", n:0}]};
}

T("le via du raccord part avec ses cotes, sur le bon tronçon",()=>{
  const o=padTraversante(0.55);
  o.percages=[{x:xm0(), y:Y, d:0.25, n:0, p:"PTH"}];
  carteVia(o);
  const g=simSegments();
  if(g.envoi.length!==2)
    throw new Error("deux tronçons attendus, "+g.envoi.length);
  /* LE SERVEUR RANGE LA TRANSITION AU RANG DU SECOND TRONÇON : c'est
     `objets[trans["troncon"]]` qu'il relit. */
  if(g.envoi[0].via)
    throw new Error("le via ne doit pas être accroché au tronçon de départ");
  const v=g.envoi[1].via;
  if(!v)throw new Error("le via n'a pas été accroché");
  if(Math.abs(v.drill_diameter-0.25)>1e-9)
    throw new Error("perçage "+v.drill_diameter+" au lieu de 0,25");
  if(Math.abs(v.pad_diameter-0.55)>1e-9)
    throw new Error("pastille "+v.pad_diameter+" au lieu de 0,55");
  if("height" in v)
    throw new Error("la hauteur ne doit pas être envoyée : le serveur la lit "+
                    "dans l'empilage");
});

T("sans perçage déclaré, deux pastilles au même lieu valent un tube",()=>{
  carteVia(padTraversante(0.60));
  const v=simSegments().envoi[1].via;
  if(!v)throw new Error("deux pastilles au même lieu devraient valoir un tube");
  /* La pastille est LUE ; le perçage se déduit, moins un anneau de 0,25 mm de
     part et d'autre — c'est la règle du chemin DC, et on n'en invente pas une
     seconde. */
  if(Math.abs(v.pad_diameter-0.60)>1e-9)
    throw new Error("pastille "+v.pad_diameter+" au lieu de 0,60");
  if(Math.abs(v.drill_diameter-0.10)>1e-9)
    throw new Error("perçage déduit "+v.drill_diameter+" au lieu de 0,10");
});

/* CE QUE « PAS DE VIA IDENTIFIÉ » VEUT DIRE, ET CE QUE ÇA NE VEUT PAS DIRE.
   Le changement de couche existe indépendamment du perçage qu'on sait nommer :
   ses deux tronçons se raccordent quelque part, et ce quelque part suffit à
   mesurer l'écart aux vias de masse. On envoie donc toujours la POSITION et
   les VIAS VOISINS ; ce qui manque, ce sont les COTES, et elles ont leurs
   replis annoncés.

   POURQUOI CE CONTRAT A CHANGÉ. L'ancien n'envoyait rien du tout tant que le
   perçage n'était pas reconnu. Le serveur en concluait « aucun via de masse ne
   referme la boucle » — une affirmation SUR LA CARTE là où on n'avait
   simplement pas cherché, et fausse dès qu'il y a un via de masse à côté, ce
   qui est le cas courant. */
T("un trou NON métallisé ne donne pas de cotes, mais la position part",()=>{
  const o=padTraversante(0.55);
  o.percages=[{x:xm0(), y:Y, d:0.25, n:0, p:"NON_PLATED"}];
  carteVia(o);
  const v=simSegments().envoi[1].via;
  if(!v)throw new Error("le raccord doit partir même sans via identifié");
  if(v.drill_diameter!==undefined)
    throw new Error("un trou nu a été pris pour un via : perçage "+
                    v.drill_diameter);
  if(Math.abs(v.x-xm0())>1e-9)throw new Error("la position ne part pas");
  if(!Array.isArray(v.retours))
    throw new Error("les vias de masse voisins doivent être cherchés quand "+
                    "même : c'est le seul moyen de ne pas conclure à tort");
});

T("un trou nu AILLEURS sur le net n'empêche pas de voir le via",()=>{
  /* L'ORDRE DES DEUX TESTS COMPTAIT, ET IL ÉTAIT INVERSE. « ce trou n'est pas
     métallisé » sortait de la fonction AVANT qu'on ait vérifié qu'il s'agit du
     trou cherché : un seul trou nu quelque part sur le net — une fixation, un
     point de test — rendait le via du raccord invisible, et toute la fiche
     tombait sur des replis. */
  const o=padTraversante(0.55);
  o.percages=[{x:xm0()-8, y:Y+5, d:2.0, n:0, p:"NON_PLATED"},
              {x:xm0(),   y:Y,   d:0.25, n:0, p:"PTH"}];
  carteVia(o);
  const v=simSegments().envoi[1].via;
  if(!v||Math.abs(v.drill_diameter-0.25)>1e-9)
    throw new Error("le via du raccord n'a pas été vu : "+JSON.stringify(v));
});

T("rien au raccord : pas de cotes, mais le raccord part quand même",()=>{
  carteVia({});
  const v=simSegments().envoi[1].via;
  if(!v)throw new Error("le raccord doit partir même sans via identifié");
  if(v.drill_diameter!==undefined||v.pad_diameter!==undefined)
    throw new Error("des cotes ont été inventées là où il n'y a rien");
});

T("l'empilage envoie le net de ses plans",()=>{
  /* SANS LUI, LE VERDICT EST INDÉCIDABLE. Deux plans de NOMS différents ne
     sont pas deux plans de NETS différents : « TOP se réfère à GND, BOT se
     réfère à GND2 » est le cas ordinaire d'une carte quatre couches, qu'un via
     de masse referme. Sans le net, le serveur voyait deux noms différents et
     criait au défaut grave sur toute carte correcte. */
  carte({nets:["N$1","GND"], plans:[plan(1, rect(2,2,58,38), [])]});
  const st=simStackupIpc();
  const cu=st.layers.filter(l=>l.type==="copper");
  const avecNet=cu.filter(l=>l.net==="GND");
  if(!avecNet.length)
    throw new Error("aucune couche de cuivre ne porte le net de son plan : "+
                    JSON.stringify(cu));
});


/* ==========================================================================
   LES VIAS DE MASSE VOISINS, ET CE QUE L'IPC-2581 N'EN DIT PAS
   --------------------------------------------------------------------------
   POURQUOI LES ENVOYER. Un via n'a pas d'inductance à lui seul : c'est la
   BOUCLE qu'il forme avec ses vias de masse qui en porte une. Sans eux, le
   serveur rend la self d'un conducteur seul — un plancher, qui ne dépend pas
   du routage.

   CE QUE LE FORMAT NE PORTE PAS, ET QU'IL FAUT DIRE. Un perçage IPC-2581
   déclare sa position, son diamètre et son net, mais PAS SES COUCHES : rien
   n'y distingue un via traversant d'un via enterré. On les envoie donc en les
   supposant traversants, avec `portee_supposee` — et un via enterré compté
   comme traversant rendrait une inductance trop PETITE, donc flatteuse. C'est
   la raison pour laquelle le drapeau existe, et ces cas le verrouillent.
   ========================================================================== */

/* Une carte avec une masse : un net nommé GND et ses perçages. `refs` la
   retient parce que son nom la désigne — c'est la même règle que le chemin DC. */
function carteViaMasse(trousGnd, opts){
  opts = opts || {};
  const xm = (X1 + X2) / 2;
  const o = padTraversante(0.55);
  o.percages = [{x:xm, y:Y, d:0.25, n:0, p:"PTH"}].concat(
    (trousGnd || []).map(t => ({x:t.x, y:t.y, d:t.d == null ? 0.30 : t.d,
                                n:1, p:t.p || "PTH"})));
  /* IL FAUT DU CUIVRE PLEIN POUR ÊTRE UNE RÉFÉRENCE, même nommé « GND » :
     `simRefCandidatsIpc` refuse un net qui n'a que des pistes. Un plan arrosé,
     donc — et c'est la bonne règle : un net nommé masse qui ne porte aucun
     cuivre n'est pas un chemin de retour. */
  const c = carte({percages:o.percages, pads:o.pads, padstacks:o.padstacks,
                   nets:["N$1", "GND"],
                   plans:[plan(1, rect(2, 2, 58, 38), [])]});
  c.modele.pistes = [{c:0, n:0, w:W, p:[X1,Y, xm,Y]},
                     {c:1, n:0, w:W, p:[xm,Y, X2,Y]}];
  mdlCharger(c.modele);
  V.net = 0;
  SIM.refCle = null; SIM.refAuto = true; SIM.ref = null;
  return xm;
}

T("les vias de masse voisins partent avec le via, portée supposée",()=>{
  const xm = carteViaMasse([{x:(X1+X2)/2 + 0.6, y:Y}]);
  const v = simSegments().envoi[1].via;
  if(!v)throw new Error("aucun via accroché");
  /* LA POSITION DU VIA DE SIGNAL DÉBLOQUE TOUT LE RESTE : sans elle le serveur
     ne peut mesurer aucun écart. */
  if(Math.abs(v.x - xm) > 1e-6 || Math.abs(v.y - Y) > 1e-6)
    throw new Error("la position du via de signal n'est pas envoyée");
  if(!v.retours || v.retours.length !== 1)
    throw new Error("le via de masse voisin n'est pas envoyé ("+
                    ((v.retours||[]).length)+" trouvé(s))");
  const r = v.retours[0];
  if(r.net !== "GND")throw new Error("le net du retour manque : "+r.net);
  if(!r.portee_supposee)
    throw new Error("la portée est supposée traversante et ne le dit pas — un "+
                    "via enterré passerait alors pour un retour valable");
  if(Math.abs(r.x - (xm + 0.6)) > 1e-6)
    throw new Error("la position du retour est fausse : "+r.x);
});

T("un trou de masse NON métallisé ne referme rien",()=>{
  /* MÊME RÈGLE QUE POUR LE VIA DE SIGNAL, et que pour le chemin du courant
     continu : un trou nu ne conduit pas. L'oublier ici ferait compter un trou
     de fixation comme un via de retour. */
  carteViaMasse([{x:(X1+X2)/2 + 0.6, y:Y, p:"NON_PLATED"}]);
  const v = simSegments().envoi[1].via;
  if(v.retours.length)
    throw new Error("un trou nu a été pris pour un via de retour");
});

T("un via de masse hors de portée n'est pas envoyé",()=>{
  const xm = (X1 + X2) / 2;
  carteViaMasse([{x:xm + SIM_RAYON_RETOUR_IPC + 1.0, y:Y}]);
  const v = simSegments().envoi[1].via;
  if(v.retours.length)
    throw new Error("un via au-delà du rayon a été ramassé");
});

T("les retours sont rendus du plus proche au plus lointain",()=>{
  const xm = (X1 + X2) / 2;
  carteViaMasse([{x:xm + 2.0, y:Y}, {x:xm + 0.5, y:Y}, {x:xm, y:Y + 1.2}]);
  const v = simSegments().envoi[1].via;
  if(v.retours.length !== 3)
    throw new Error("trois retours attendus, "+v.retours.length);
  const d = v.retours.map(r => Math.hypot(r.x - xm, r.y - Y));
  for(let i = 1; i < d.length; i++)
    if(d[i] < d[i-1] - 1e-9)
      throw new Error("les retours ne sont pas triés : "+d.map(x=>x.toFixed(2)));
});

T("sans net de référence, aucun retour n'est envoyé",()=>{
  /* Un via de masse n'est un retour que si son net est tenu pour une masse.
     Sans référence déclarée, on n'en invente pas une. */
  carteViaMasse([{x:(X1+X2)/2 + 0.6, y:Y}]);
  /* `simRefSet` remet la sélection à l'automatique dès que la CARTE change :
     il faut donc l'appeler une fois — c'est elle qui estampille la carte —
     avant de forcer une liste vide, sinon l'appel suivant la rétablit. */
  simRefSet();
  SIM.refAuto = false; SIM.ref = new Set();
  const v = simSegments().envoi[1].via;
  SIM.refAuto = true; SIM.ref = null;
  if(v.retours.length)
    throw new Error("un via a servi de retour sans référence déclarée");
});

/* ==========================================================================
   L'ORDRE DU PARCOURS
   --------------------------------------------------------------------------
   LE DÉFAUT LE PLUS COÛTEUX DE CET OUTIL, et le plus discret. `simZPistes`
   rend les pistes du net dans l'ordre où l'IPC-2581 les a écrites, et le sens
   de chaque polyligne y est arbitraire. Tout ce qui suit — raccords, coudes,
   vias — suppose une chaîne parcourue dans l'ordre envoyé.

   MESURÉ SUR UNE CARTE LIVRÉE : un coude annoncé à 168° — l'angle se prend
   ENTRE VECTEURS, donc 168° est un demi-tour — sur une piste presque droite,
   deux raccords annoncés manquants sur un parcours continu, et AUCUN via
   accroché. Le serveur remplaçait alors le perçage, la pastille, la portée et
   les vias de masse voisins par des replis, et disait « non envoyé ».

   Les trois essais ci-dessous tiennent les trois conséquences : le via se
   raccroche, les côtés ne s'inversent pas, et une dérivation ne se force pas.
   ========================================================================== */

/* La même liaison que `carteVia`, mais dont le second tronçon est ÉCRIT À
   L'ENVERS : il part du bout de la carte et revient vers le via. Rien sur le
   cuivre ne distingue les deux cartes. */
function carteViaEnvers(opts){
  opts=opts||{};
  const xm=(X1+X2)/2;
  const c=carte({percages:opts.percages||[], pads:opts.pads||[],
                 padstacks:opts.padstacks||{}});
  c.modele.pistes=[{c:0, n:0, w:W, p:[X1,Y, xm,Y]},
                   {c:1, n:0, w:W, p:[X2,Y, xm,Y]}];   /* <- à l'envers */
  mdlCharger(c.modele);
  V.net=0;
  SIM.refCle=null; SIM.refAuto=true; SIM.ref=null;
  return xm;
}

T("une piste écrite à l'envers ne casse plus le raccord du via",()=>{
  const o=padTraversante(0.55);
  o.percages=[{x:xm0(), y:Y, d:0.25, n:0, p:"PTH"}];
  const xm=carteViaEnvers(o);
  const g=simSegments();
  if(g.envoi.length!==2)
    throw new Error("deux tronçons attendus, "+g.envoi.length);
  /* LE TRONÇON RETOURNÉ PART DU VIA, pas du bord de la carte. C'est cela que
     `simAccrocherViasIpc` teste, et c'est cela qui échouait. */
  if(Math.abs(g.envoi[1].start[0]-xm)>1e-9)
    throw new Error("le second tronçon part de x="+g.envoi[1].start[0]+
                    " au lieu du via en "+xm);
  if(Math.abs(g.envoi[1].end[0]-X2)>1e-9)
    throw new Error("le second tronçon finit en x="+g.envoi[1].end[0]+
                    " au lieu de "+X2);
  const v=g.envoi[1].via;
  if(!v)
    throw new Error("le via n'a pas été accroché : le chaînage n'a pas remis "+
                    "la piste dans le sens du parcours");
  if(Math.abs(v.drill_diameter-0.25)>1e-9)
    throw new Error("perçage "+v.drill_diameter+" au lieu de 0,25");
  /* ET C'EST TOUTE LA CHAÎNE QUI SUIT : sans via accroché, les vias de masse
     voisins ne partaient pas non plus, et le serveur disait « non envoyé ». */
  if(!("retours" in v))
    throw new Error("le via part sans ses vias de masse voisins");
});

T("gauche et droite ne s'inversent pas avec le sens d'écriture",()=>{
  /* DEUX TRONÇONS QUI VONT DANS LE MÊME SENS SUR LE CUIVRE, dont un écrit à
     l'envers dans le fichier. Le plan est creusé très large d'un côté et serré
     de l'autre : les deux tronçons voient donc la MÊME dissymétrie, et doivent
     la rapporter à l'identique. Sans l'échange gauche/droite, le retourné la
     rapporterait en miroir — « 0,2 / 0 » d'un côté, « 0 / 0,2 » de l'autre —
     dans un panneau qui annonce mesurer chaque côté séparément. */
  const xm=(X1+X2)/2;
  const c=avecPlan(null,1,Y-8,Y+0.4);
  c.modele.pistes=[{c:0, n:0, w:W, p:[X1,Y, xm,Y]},
                   {c:0, n:0, w:W, p:[X2,Y, xm,Y]}];   /* <- à l'envers */
  mdlCharger(c.modele);
  V.net=0;
  SIM.refCle=null; SIM.refAuto=true; SIM.ref=null;
  const g=simSegments();
  if(g.envoi.length!==2)
    throw new Error("deux tronçons attendus, "+g.envoi.length);
  const a=g.envoi[0], b=g.envoi[1];
  /* La dissymétrie doit être RÉELLE, sinon l'essai ne prouverait rien. */
  if(Math.abs(Math.max(a.gap_left,a.gap_right)-0.2)>0.005||
     Math.min(a.gap_left,a.gap_right)!==0)
    throw new Error("le montage n'est pas dissymétrique : "+
                    a.gap_left+" / "+a.gap_right);
  if(a.gap_left!==b.gap_left||a.gap_right!==b.gap_right)
    throw new Error("les côtés sont inversés sur le tronçon retourné : "+
                    a.gap_left+"/"+a.gap_right+" contre "+
                    b.gap_left+"/"+b.gap_right);
});

/* ==========================================================================
   LE RACCORD SE MESURE, IL NE SE RANGE PAS DANS UN CASIER
   --------------------------------------------------------------------------
   TOUS LES ESSAIS DE CHAÎNAGE CI-DESSUS POSENT DES BOUTS EXACTEMENT CONFONDUS,
   et c'est ce qui a laissé passer le défaut. La version précédente rangeait
   chaque bout dans un casier dont la clé était la coordonnée arrondie au
   micron. Un casier n'est pas une tolérance : deux bouts distants de quelques
   microns qui tombent de part et d'autre d'une graduation vont dans DEUX
   casiers et ne se rejoignent jamais. La tolérance effective était zéro, et
   `SIM_TOL_CHAINE_IPC` — déclaré, commenté « la tolérance du serveur » —
   n'était employé nulle part.

   L'ÉDITEUR PCB NE POUVAIT PAS LE MONTRER : ses pistes sont accrochées à la
   grille, donc leurs bouts coïncident au bit près. Un IPC-2581 porte des
   coordonnées lues dans un fichier texte, souvent en pouces multipliés par
   25,4 : les deux bouts d'un même via y diffèrent presque toujours d'un peu.
   ========================================================================== */

T("deux bouts à quelques microns se raccordent quand même",()=>{
  /* L'ÉCART EST CHOISI POUR TOMBER DE PART ET D'AUTRE D'UNE GRADUATION AU
     MICRON : 0,6 µm de décalage suffisait à séparer les deux casiers, alors
     que le cuivre est continu à toute échelle qui compte. */
  const xm=xm0();
  const o=padTraversante(0.55);
  const c=carte({percages:[{x:xm, y:Y, d:0.25, n:0, p:"PTH"}],
                 pads:o.pads, padstacks:o.padstacks});
  /* LA SECONDE EST ÉCRITE À L'ENVERS, comme le fait un vrai fichier : rien
     dans l'IPC-2581 ne dit par quel bout on entre dans une piste. C'est ce qui
     OBLIGE le chaînage à travailler — deux pistes déjà dans le bon ordre
     sortent bonnes même sans lui, et un essai qui les pose ne mesure rien. */
  c.modele.pistes=[{c:0, n:0, w:W, p:[X1,Y, xm-0.0006,Y]},
                   {c:1, n:0, w:W, p:[X2,Y, xm+0.0006,Y]}];
  mdlCharger(c.modele);
  V.net=0;
  SIM.refCle=null; SIM.refAuto=true; SIM.ref=null;
  const g=simSegments();
  if(g.envoi.length!==2)
    throw new Error("deux tronçons attendus, "+g.envoi.length);
  /* LE CHAÎNAGE D'ABORD : sans lui rien de ce qui suit n'arrive. */
  if(g.envoi[0].layer===g.envoi[1].layer)
    throw new Error("les deux tronçons sortent sur la même couche : "+
                    "le parcours n'a pas été reconstruit");
  /* PUIS LE VIA, QUI EN DÉPEND — c'est la cascade réelle du défaut : pas de
     chaîne, pas de via accroché, donc pas de cotes ; et pas de vias de masse
     voisins, donc pas de chevelu du retour. */
  const v=g.envoi[1].via;
  if(!v)
    throw new Error("le via n'est pas accroché : le raccord à 1,2 µm a été "+
                    "pris pour une rupture");
  if(Math.abs(v.drill_diameter-0.25)>1e-9)
    throw new Error("perçage "+v.drill_diameter+" au lieu de 0,25");
  if(!("retours" in v))
    throw new Error("le via part sans ses vias de masse voisins : "+
                    "le chevelu du retour n'aura rien à dessiner");
});

T("une tolérance reste une tolérance : au-delà, pas de raccord",()=>{
  /* LE REVERS DOIT ÊTRE TENU. Élargir le raccord jusqu'à joindre n'importe
     quoi rendrait un parcours là où le cuivre est vraiment coupé, et des
     paramètres S qui ont l'air justes. 50 µm, c'est deux fois et demie la
     tolérance du serveur : ces deux bouts ne se touchent pas, et la sélection
     doit rester visiblement rompue. */
  const xm=xm0();
  const c=carte({});
  c.modele.pistes=[{c:0, n:0, w:W, p:[X1,Y, xm-0.025,Y]},
                   {c:1, n:0, w:W, p:[X2,Y, xm+0.025,Y]}];   /* <- à l'envers */
  mdlCharger(c.modele);
  V.net=0;
  SIM.refCle=null; SIM.refAuto=true; SIM.ref=null;
  const g=simSegments();
  if(g.envoi.length!==2)
    throw new Error("deux tronçons attendus, "+g.envoi.length);
  /* LE CHAÎNAGE DOIT REFUSER : la piste écrite à l'envers reste à l'envers,
     donc elle part de X2 et non du milieu. C'est ce refus qu'on mesure, et non
     seulement l'absence de via — l'accrochage a sa propre tolérance, et un
     essai qui ne regarderait que lui passerait quoi qu'il arrive ici. */
  if(Math.abs(g.envoi[1].start[0]-X2)>1e-9)
    throw new Error("le second tronçon a été retourné : un raccord de 50 µm "+
                    "a été pris pour une continuité");
  if(g.envoi[1].via)
    throw new Error("un via a été accroché sur un raccord de 50 µm : "+
                    "la tolérance joint désormais du cuivre séparé");
});

T("une dérivation ne s'invente pas un parcours, et ne perd rien",()=>{
  /* TROIS PISTES À UN MÊME NŒUD : il n'y a plus de parcours unique. En choisir
     un rendrait des paramètres S qui ont l'air justes. La marche s'arrête, le
     reste part dans l'ordre du fichier, et le serveur continue d'annoncer les
     raccords manquants — une sélection ramifiée doit rester visiblement
     ramifiée. CE QUI NE DOIT PAS ARRIVER, c'est qu'une piste disparaisse ou
     sorte deux fois. */
  const xm=(X1+X2)/2;
  const c=carte({});
  c.modele.pistes=[{c:0, n:0, w:W, p:[X1,Y, xm,Y]},
                   {c:0, n:0, w:W, p:[xm,Y, X2,Y]},
                   {c:0, n:0, w:W, p:[xm,Y, xm,Y+8]}];
  mdlCharger(c.modele);
  V.net=0;
  SIM.refCle=null; SIM.refAuto=true; SIM.ref=null;
  const suite=simChainePistes(simZPistes());
  if(suite.length!==3)
    throw new Error("trois pistes entrées, "+suite.length+" sorties");
  const vues=new Set(suite.map(e=>e.piste));
  if(vues.size!==3)
    throw new Error("une piste sort deux fois, ou une autre a disparu");
});

/* ==========================================================================
   LE RACCORD SE FAIT PAR UNE JONCTION, PAS EN SE TOUCHANT
   --------------------------------------------------------------------------
   CE CAS EST RELEVÉ SUR UNE VRAIE CARTE, coordonnées comprises. Le net
   SPI_SIGN00467 y court sur trois pistes et deux vias, et AUCUN de ses bouts de
   piste n'en touche un autre : les quatre bouts qui arrivent à un via sont à
   exactement 0,5500 mm de son centre — un diamètre de pastille —, parce que
   l'exportateur arrête là le tracé. Les deux vrais bouts de la liaison, eux,
   sont à 0,0000 d'une pastille de composant.

   AUCUNE TOLÉRANCE DE RACCORD NE PEUT SAUVER CELA. Il en faudrait une d'un
   demi-millimètre, qui joindrait alors des pistes étrangères. C'est la
   JONCTION du net — le via, la pastille — qui raccorde, et c'est elle qu'il
   faut suivre.

   TOUT EN DÉPENDAIT, et c'est pour cela que ce cas est ici : sans le bon
   parcours, le premier coude sortait à 168° — un demi-tour sur du cuivre
   presque droit —, le serveur annonçait des raccords manquants, aucun via ne
   s'accrochait, donc ni ses cotes ni les vias de masse voisins ne partaient, et
   le chevelu du retour n'avait rien à dessiner.
   ========================================================================== */

/* Les trois pistes, les deux vias et les deux pastilles de bout, aux
   coordonnées relevées. Les pistes sont posées dans l'ordre du FICHIER, qui
   n'est pas celui du parcours, et la deuxième est celle du milieu. */
function carteJonctions(trousGnd){
  const c=carte({
    /* UN PLAN DE MASSE ARROSÉ : `simRefCandidatsIpc` refuse un net qui n'a que
       des perçages, et il a raison — un net nommé masse sans cuivre n'est pas
       un chemin de retour. Sans référence, aucun via de masse ne part. */
    nets:["N$1","GND"],
    plans:[plan(1, rect(2,2,58,38), [])],
    percages:[{x:13.5, y:32.2, d:0.25, n:0, p:"PLATED", a:0.15},
              {x:16.3, y:29.9, d:0.25, n:0, p:"PLATED", a:0.15}].concat(
              (trousGnd||[]).map(t=>({x:t.x, y:t.y, d:t.d==null?0.30:t.d,
                                      n:1, p:t.p||"PLATED"}))),
    padstacks:{V55:{pad:0.55, pads:[{c:"Top", d:0.55},{c:"Bottom", d:0.55}]},
               P80:{pad:0.80, pads:[{c:"Top", d:0.80}]},
               P58:{pad:0.58, pads:[{c:"Top", d:0.58}]}},
    pads:[{x:13.5,  y:32.2,    ps:"V55", n:0},
          {x:16.3,  y:29.9,    ps:"V55", n:0},
          {x:11.444,y:30.6521, ps:"P80", n:0},
          {x:17.14, y:30.0,    ps:"P58", n:0}]
  });
  c.modele.pistes=[
    {c:0, n:0, w:0.21, p:[13.2242,31.7242, 11.4440,30.6521]},
    {c:0, n:0, w:0.21, p:[16.8500,29.9000, 17.1400,30.0000]},
    {c:1, n:0, w:0.21, p:[15.9111,30.2889, 13.8889,31.8111]}];
  mdlCharger(c.modele);
  V.net=0;
  SIM.refCle=null; SIM.refAuto=true; SIM.ref=null;
}

/* Le cas d'un net MULTIPOINT, relevé lui aussi sur une vraie carte : NFC_SDA,
   où trois pistes de couche extérieure montent de trois pastilles de composant
   vers un même via, d'où une quatrième repart vers une couche interne. Quatre
   bouts sur un nœud. */

/* --------------------------------------------------------------------------
   LA PASTILLE D'UN VIA : LUE, DEVINÉE, OU FABRIQUÉE ICI ?
   --------------------------------------------------------------------------
   CE QUE FAISAIT LA PAGE. Faute de pastille connue, `simViasIpc` envoyait
   `perçage × 2,5` — très exactement le repli que le serveur applique lui-même
   quand la page ne dit rien. Le chiffre était donc le même. Ce qui changeait,
   c'est qu'il arrivait DÉCLARÉ PAR LA PAGE : `_cotes_via` écrit la provenance
   selon que `pad_diameter` est présent ou absent, si bien que
   `pastille_source` passait de « repli » à « page » et `cotes_supposees` à
   faux. Le résultat ne bougeait pas d'un micron ; la fiche cessait de
   prévenir. Une supposition qui se présente comme une mesure est pire qu'une
   supposition.

   ET IL Y EN A UNE DEUXIÈME, EN AMONT. Quand aucun <PadstackDef> ne porte le
   nom du perçage, `ipc2581_parser.py` fabrique la pastille à « perçage +
   0,3 mm ». La page reçoit donc parfois une pastille qui n'est pas dans le
   fichier — d'où le drapeau `pad_sup`, qu'elle doit relayer.
   -------------------------------------------------------------------------- */

/* Une liaison qui change de couche sur un via, et rien d'autre : ce qu'on
   éprouve ici est la provenance de la pastille, pas la géométrie. */
function cartePastille(ps, padstack, pads){
  const c=carte({
    nets:["N$1","GND"],
    plans:[plan(1, rect(2,2,58,38), [])],
    percages:[Object.assign({x:30, y:20, d:0.25, n:0, p:"PLATED"},
                            ps?{ps:ps}:{})],
    padstacks:padstack||{},
    pads:pads||[]
  });
  /* LES BOUTS S'ARRÊTENT À 0,55 mm DU VIA, comme dans un vrai export — et
     c'est ce qui fait la jonction. Deux bouts qui coïncideraient exactement
     seraient raccordés l'un à l'autre, sans passer par le perçage : il n'y
     aurait alors pas de via à relever, ce qui est le bon comportement mais
     n'éprouve rien ici. */
  c.modele.pistes=[{c:0, n:0, w:0.21, p:[10,20, 29.45,20]},
                   {c:1, n:0, w:0.21, p:[30.55,20, 50,20]}];
  mdlCharger(c.modele);
  V.net=0;
  SIM.refCle=null; SIM.refAuto=true; SIM.ref=null;
  simChainePistes(simZPistes());
  const v=simViasIpc();
  if(v.length!==1)throw new Error(v.length+" via(s) relevé(s) au lieu de 1");
  return v[0];
}

T("une pastille devinée par le lecteur part en le disant",()=>{
  const v=cartePastille("VSUP",
    {VSUP:{pad:0.55, pad_sup:true,
           pads:[{c:"Top", d:0.55},{c:"Bottom", d:0.55}]}});
  if(Math.abs(v.pad_diameter-0.55)>1e-9)
    throw new Error("pastille "+v.pad_diameter+" au lieu de 0,55");
  if(v.pad_diameter_supposee!==true)
    throw new Error("la pastille devinée par le lecteur passe pour une cote "+
                    "du fichier : "+JSON.stringify(v));
});

T("une pastille déclarée dans le fichier part sans réserve",()=>{
  /* LE REVERS, et c'est lui qui donne son sens au drapeau : une mention qui
     s'affiche toujours ne se lit plus. */
  const v=cartePastille("VLU",
    {VLU:{pad:0.70, pads:[{c:"Top", d:0.70},{c:"Bottom", d:0.70}]}});
  if(Math.abs(v.pad_diameter-0.70)>1e-9)
    throw new Error("pastille "+v.pad_diameter+" au lieu de 0,70");
  if("pad_diameter_supposee" in v)
    throw new Error("une pastille lue est annoncée supposée");
});

T("une pastille inconnue n'est pas fabriquée : rien ne part",()=>{
  /* LE CŒUR DU DÉFAUT. Aucun padstack, aucune pastille de composant : la page
     ne sait pas. Elle envoyait `0,25 × 2,5 = 0,625` — le repli du serveur,
     recopié —, ce qui faisait taire la mention « supposée ». Elle doit
     maintenant se taire elle-même, et laisser le serveur appliquer SON repli
     en le déclarant. */
  const v=cartePastille(null,{});
  if("pad_diameter" in v)
    throw new Error("la page fabrique encore une pastille : "+v.pad_diameter);
  if(Math.abs(v.drill_diameter-0.25)>1e-9)
    throw new Error("le perçage, lui, est lu : "+v.drill_diameter);
});

T("une pastille de composant l'emporte sur celle que le lecteur a devinée",()=>{
  /* DEUX SOURCES AU MÊME ENDROIT. Le padstack du perçage est une invention du
     lecteur ; la pastille du <Set> est écrite dans le fichier. La règle n'est
     pas « la plus grande » mais « celle qu'on a lue » — ici l'inventée est
     même la plus grande, et elle doit quand même perdre. */
  const v=cartePastille("VSUP",
    {VSUP:{pad:0.90, pad_sup:true,
           pads:[{c:"Top", d:0.90},{c:"Bottom", d:0.90}]},
     P60:{pad:0.60, pads:[{c:"Top", d:0.60}]}},
    [{x:30, y:20, ps:"P60", n:0}]);
  if(Math.abs(v.pad_diameter-0.60)>1e-9)
    throw new Error("pastille "+v.pad_diameter+" : l'invention du lecteur a "+
                    "gagné contre une cote du fichier");
  if("pad_diameter_supposee" in v)
    throw new Error("une pastille lue est annoncée supposée");
});

function carteRamifiee(){
  const c=carte({
    nets:["N$1","GND"],
    plans:[plan(1, rect(2,2,58,38), [])],
    percages:[{x:29.2, y:10.5, d:0.25, n:0, p:"PLATED", a:0.15}],
    padstacks:{V55:{pad:0.55, pads:[{c:"Top", d:0.55},{c:"Bottom", d:0.55}]},
               P58:{pad:0.58, pads:[{c:"Top", d:0.58}]},
               P10:{pad:1.00, pads:[{c:"Top", d:1.00}]}},
    pads:[{x:29.2,  y:10.5, ps:"V55", n:0},
          {x:28.8,  y:9.5,  ps:"P10", n:0},
          {x:28.46, y:11.1, ps:"P58", n:0},
          {x:30.04, y:10.7, ps:"P58", n:0}]});
  /* Les trois branches extérieures s'arrêtent à 0,55 mm du via, comme partout
     ailleurs dans ce fichier ; la quatrième, en couche interne, aussi. */
  c.modele.pistes=[
    {c:0, n:0, w:0.21, p:[28.8000,9.5000,  29.2000,9.9500]},
    {c:0, n:0, w:0.21, p:[28.4600,11.1000, 28.8111,10.8889]},
    {c:0, n:0, w:0.21, p:[30.0400,10.7000, 29.7124,10.7000]},
    {c:1, n:0, w:0.21, p:[29.2000,11.0500, 29.2000,20.0000]}];
  mdlCharger(c.modele);
  V.net=0;
  SIM.refCle=null; SIM.refAuto=true; SIM.ref=null;
}

T("un net qui se ramifie le DIT, au lieu de se taire",()=>{
  carteRamifiee();
  const g=simSegments();
  const ar=((g.chaine||{}).arrets)||[];
  if(!ar.length)
    throw new Error("la ramification n'est pas relevée : le panneau ne peut "+
                    "pas expliquer pourquoi il n'y a ni via ni chevelu");
  /* LE POINT EST CELUI DU VIA, pas un bout de piste : c'est ce qui permet de "+
     l'aller regarder sur la carte. */
  if(Math.abs(ar[0].x-29.2)>1e-6||Math.abs(ar[0].y-10.5)>1e-6)
    throw new Error("le nœud est annoncé en "+ar[0].x+";"+ar[0].y+
                    " au lieu du via (29,2 ; 10,5)");
  if(ar[0].branches!==4)
    throw new Error(ar[0].branches+" branches annoncées au lieu de 4");
  if(!ar[0].perce)
    throw new Error("le nœud est un via percé et n'est pas annoncé comme tel");
  /* ET LA NOTE ARRIVE JUSQU'AU PANNEAU. Un état relevé que personne ne lit ne
     vaut pas mieux que pas d'état du tout — c'est exactement ce qui est arrivé
     à `res.discontinuites`, resté sans lecteur pendant tout un lot. */
  const p=SIM_IPC.probleme(simSaisie());
  if(!(p.notes||[]).some(t=>/se ramifie/.test(t)))
    throw new Error("la note de ramification n'atteint pas le panneau : "+
                    JSON.stringify(p.notes));
});

T("un net ramifié envoie quand même ses vias, hors de tout parcours",()=>{
  /* LE CŒUR DU LOT. Le parcours n'existe pas — la marche s'arrête au nœud de
     quatre branches —, donc aucun tronçon consécutif ne change de couche,
     donc le serveur ne détectera AUCUNE transition. Le via, lui, est là : il
     part dans la liste `vias`, sans ordre, et son chemin de retour se
     calculera. */
  carteRamifiee();
  const g=simSegments();
  /* ON N'EXIGE PAS QU'AUCUN VIA NE S'ACCROCHE, et c'est délibéré. Une fois la
     marche arrêtée, les pistes restantes partent dans l'ordre du fichier ;
     deux d'entre elles peuvent s'y trouver voisines ET aboutir vraiment au
     même via, auquel cas l'accrochage est fortuit mais pas faux. Ce qui doit
     être VRAI DANS TOUS LES CAS, c'est que le via parte dans la liste : c'est
     la seule voie qui ne dépende pas de l'ordre, et le serveur écarte ensuite
     les doublons. */
  const v=g.vias||[];
  if(v.length!==1)
    throw new Error(v.length+" via(s) envoyé(s) hors chaîne au lieu de 1");
  if(Math.abs(v[0].x-29.2)>1e-6||Math.abs(v[0].y-10.5)>1e-6)
    throw new Error("le via est envoyé en "+v[0].x+";"+v[0].y);
  /* SES DEUX COUCHES, ET ELLES DOIVENT DIFFÉRER : c'est ce qui en fait un via
     plutôt qu'une pastille. */
  if(v[0].layer_from===v[0].layer_to)
    throw new Error("le via ne joint qu'une couche : "+v[0].layer_from);
  if(Math.abs(v[0].drill_diameter-0.25)>1e-9)
    throw new Error("perçage "+v[0].drill_diameter+" au lieu de 0,25");
  if(!("retours" in v[0]))
    throw new Error("le via part sans ses vias de masse voisins");
  /* ET IL PART DANS LE DOCUMENT, pas seulement dans la structure interne. */
  const p=SIM_IPC.probleme(simSaisie());
  if(!p.doc.vias||p.doc.vias.length!==1)
    throw new Error("le document n'emporte pas les vias : "+
                    JSON.stringify(p.doc.vias));
  /* LA VERSION ANNONCÉE DOIT SUIVRE LE CONTENU. `simProbleme` la pose, pas
     l'adaptateur — on vérifie donc la constante, qui est ce que le serveur
     lira. Les pages sont restées à « -1 » pendant tout le passage du serveur
     à « -2 » : personne ne l'a vu, parce que le serveur acceptait les deux. */
  if(SIM_FORMAT!=="cao-sim-em-3")
    throw new Error("les pages s'annoncent « "+SIM_FORMAT+
                    " » alors qu'elles portent la liste des vias");
});

T("un via déjà dans le parcours n'est pas envoyé deux fois",()=>{
  /* LA PAGE PEUT L'ENVOYER SANS SAVOIR — le serveur écarte les doublons —,
     mais ne pas l'envoyer du tout serait perdre le cas où la chaîne échoue.
     Ce qu'on vérifie ici est que la page ne se contredit pas : le via du
     parcours est accroché ET listé, avec les MÊMES cotes. Deux valeurs pour
     une grandeur, c'est le défaut à ne pas refaire. */
  carteJonctions();
  const g=simSegments();
  const accroches=g.envoi.filter(o=>o.via).map(o=>o.via);
  if(accroches.length!==2)
    throw new Error(accroches.length+" via(s) accroché(s) au lieu de 2");
  for(const a of accroches){
    const jumeau=(g.vias||[]).find(v=>Math.abs(v.x-a.x)<1e-6&&
                                       Math.abs(v.y-a.y)<1e-6);
    if(!jumeau)
      throw new Error("le via ("+a.x+";"+a.y+") est accroché mais pas listé");
    if(Math.abs(jumeau.drill_diameter-a.drill_diameter)>1e-9)
      throw new Error("deux perçages pour un même via : "+
                      a.drill_diameter+" contre "+jumeau.drill_diameter);
  }
});

T("le chevelu lit les deux listes, et marque ce qui n'est pas cascadé",()=>{
  /* `simCheveluRes` ne lisait que les transitions. Un via hors parcours porte
     exactement les mêmes champs, dans une autre liste — et il doit se
     dessiner, en disant que la courbe S ne le porte pas. */
  SIM.ouvert=true; SIM.analyse="retour";
  SIM.res={discontinuites:{coudes:[], transitions:[], vias_hors_chaine:[{
    rang:0, cascade:false,
    cotes:{pastille_mm:0.55},
    retour:{x:29.2, y:10.5, retenus:1, vias:[
      {x:29.8, y:10.5, part:1.0, retenu:true, raison:""}]},
    modelise:{inductance_nH:0.62, inductance_source:"boucle"}}]}};
  const l=simCheveluRes();
  if(l.length!==1)
    throw new Error("le chevelu ignore les vias hors parcours : "+l.length);
  if(Math.abs(l[0].x-29.2)>1e-9||Math.abs(l[0].y-10.5)>1e-9)
    throw new Error("le chevelu est posé en "+l[0].x+";"+l[0].y);
  if(l[0].cascade!==false)
    throw new Error("le via hors parcours se donne pour cascadé : la courbe "+
                    "S ne le porte pas, et le dessin doit le dire");
  if(l[0].seul)
    throw new Error("un retour referme la boucle et le chiffre est donné "+
                    "pour un plancher");
  /* ET UNE TRANSITION ORDINAIRE RESTE CASCADÉE : l'absence du champ vaut
     vrai, sinon tous les vias du parcours passeraient pour hors parcours. */
  SIM.res={discontinuites:{coudes:[], transitions:[{
    troncon:1, cotes:{pastille_mm:0.55},
    retour:{x:1, y:2, retenus:0, vias:[]},
    modelise:{inductance_nH:0.9, inductance_source:"self"}}]}};
  if(simCheveluRes()[0].cascade!==true)
    throw new Error("une transition du parcours est marquée hors parcours");
  SIM.res=null; SIM.ouvert=false;
});

T("un net qui ne se ramifie pas ne le dit pas",()=>{
  /* LE REVERS, et il compte autant : une note qui paraît sur le cas ordinaire
     cesse d'être lue le jour où elle est vraie. */
  carteJonctions();
  const g=simSegments();
  if((((g.chaine||{}).arrets)||[]).length)
    throw new Error("une ramification est annoncée sur un parcours simple");
  const p=SIM_IPC.probleme(simSaisie());
  if((p.notes||[]).some(t=>/se ramifie/.test(t)))
    throw new Error("la note de ramification paraît sur un parcours simple");
});

T("trois pistes qui ne se touchent pas se chaînent par leurs vias",()=>{
  carteJonctions();
  const suite=simChainePistes(simZPistes());
  if(suite.length!==3)
    throw new Error("trois pistes entrées, "+suite.length+" sorties");
  /* LE PARCOURS EST piste0 -> piste2 -> piste1, et les couches le disent :
     extérieure, intérieure, extérieure. Dans l'ordre du fichier ce serait
     0,0,1 — deux tronçons de même couche à la suite, séparés par un via qui
     n'existe pas. */
  const couches=suite.map(e=>e.couche).join(",");
  if(couches!=="0,1,0")
    throw new Error("ordre des couches : "+couches+" au lieu de 0,1,0 "+
                    "(le chaînage n'a pas suivi les vias)");
});

T("le parcours entre par un vrai bout, et les vias s'accrochent",()=>{
  carteJonctions();
  const g=simSegments();
  /* ON ENTRE PAR UNE PASTILLE DE COMPOSANT, pas au milieu de la liaison. Le
     défaut posait les deux ports à 0,67 mm l'un de l'autre, de part et d'autre
     du premier via : la liaison entière était repliée sur elle-même. */
  const d=g.envoi[0].start, f=g.envoi[g.envoi.length-1].end;
  const bouts=[[11.444,30.6521],[17.14,30.0]];
  const sur=(p,q)=>Math.hypot(p[0]-q[0],p[1]-q[1])<1e-6;
  if(!bouts.some(q=>sur(d,q))||!bouts.some(q=>sur(f,q)))
    throw new Error("les ports ne sont pas aux bouts de la liaison : "+
                    d+" -> "+f);
  if(Math.hypot(d[0]-f[0],d[1]-f[1])<1)
    throw new Error("les deux ports sont au même endroit : la liaison est "+
                    "repliée sur elle-même");
  /* DEUX CHANGEMENTS DE COUCHE, DONC DEUX VIAS, et ce sont les deux perçages
     du net que le serveur signalait comme inutilisés. */
  const vias=g.envoi.filter(o=>o.via);
  if(vias.length!==2)
    throw new Error(vias.length+" via(s) accroché(s) au lieu de 2");
  for(const o of vias){
    if(Math.abs(o.via.drill_diameter-0.25)>1e-9)
      throw new Error("perçage "+o.via.drill_diameter+" au lieu de 0,25");
    /* LE POINT DU VIA EST CELUI DU PERÇAGE, pas le bout de la piste : c'est de
       là que part le chevelu, et un demi-millimètre d'écart le ferait
       désigner du cuivre nu. */
    const centres=[[13.5,32.2],[16.3,29.9]];
    if(!centres.some(q=>Math.hypot(o.via.x-q[0],o.via.y-q[1])<1e-6))
      throw new Error("le via est posé en "+o.via.x+";"+o.via.y+
                      " au lieu du centre d'un perçage");
    if(!("retours" in o.via))
      throw new Error("le via part sans ses vias de masse voisins : "+
                      "le chevelu du retour n'aura rien à dessiner");
  }
});

T("les vias de masse voisins partent du centre du via, pas du bout de piste",()=>{
  /* LE RAYON DE RECHERCHE EST DE 3 mm, et un demi-millimètre d'erreur sur son
     origine change ce qu'il ramasse. On pose un via de masse à 2,80 mm du
     perçage : il doit être vu. Mesuré depuis le bout de piste, à 0,55 mm de
     là dans la mauvaise direction, il tomberait hors de portée. */
  carteJonctions([{x:13.5, y:35.0}]);
  const g=simSegments();
  const o=g.envoi.find(e=>e.via&&Math.abs(e.via.x-13.5)<1e-6);
  if(!o)throw new Error("le via de (13,5 ; 32,2) n'est pas accroché");
  const r=(o.via.retours||[]).filter(f=>Math.abs(f.y-35.0)<1e-6);
  if(r.length!==1)
    throw new Error("le via de masse à 2,80 mm n'est pas vu : "+
                    JSON.stringify(o.via.retours));
});

/* ==========================================================================
   LE CHEVELU DU COURANT DE RETOUR
   --------------------------------------------------------------------------
   IL EST LU DANS LE RÉSULTAT, et non recalculé. L'éditeur PCB recalcule le
   sien parce qu'il faut répondre pendant qu'on DÉPLACE le via ; la visionneuse
   lit une carte faite, où rien ne bouge, et le seul chevelu qui vaille est
   celui que le modèle a réellement employé. Ces essais tiennent le contrat de
   lecture : ce qui se dessine vient du résultat, et rien d'autre.
   ========================================================================== */

/* Un résultat de serveur réduit à ce que le chevelu y lit. */
function resChevelu(retour,modelise,cotes){
  return {discontinuites:{transitions:[
    {troncon:1, retour:retour, modelise:modelise||{}, cotes:cotes||{}}]}};
}

function avecPanneau(res,fn){
  const o=SIM.ouvert, a=SIM.analyse, r=SIM.res;
  SIM.ouvert=true; SIM.analyse="retour"; SIM.res=res;
  try{ return fn(); }
  finally{ SIM.ouvert=o; SIM.analyse=a; SIM.res=r; }
}

T("le chevelu vient du résultat : parts, motifs et position",()=>{
  const g=avecPanneau(resChevelu(
    {x:10.5, y:20.25, retenus:2,
     vias:[{x:11.1, y:20.25, distance_mm:0.6, net:"GND", retenu:true,
            part:0.62, raison:""},
           {x:10.5, y:21.05, distance_mm:0.8, net:"GND", retenu:true,
            part:0.38, raison:""},
           {x:9.0, y:20.25, distance_mm:1.5, net:"PWR", retenu:false,
            part:0, raison:"ne rejoint pas GND, le plan d'arrivée"}]},
    {inductance_nH:0.4526, inductance_source:"boucle"},
    {pastille_mm:0.75}),
    ()=>simCheveluRes());
  if(g.length!==1)throw new Error("un via attendu, "+g.length);
  const v=g[0];
  if(v.x!==10.5||v.y!==20.25)
    throw new Error("position "+v.x+" ; "+v.y);
  if(v.vias.length!==3)
    throw new Error("trois liens attendus, "+v.vias.length);
  if(v.seul)
    throw new Error("la source dit « boucle » : le chiffre EST une boucle");
  if(Math.abs(v.L_nH-0.4526)>1e-9)
    throw new Error("L "+v.L_nH);
  /* LE MOTIF DU REJET EST CE QUI FAIT LE PRIX DU CHEVELU : sans lui, un trait
     pointillé ne dit pas POURQUOI ce via-là ne compte pas. */
  if(!/ne rejoint pas/.test(v.vias[2].raison))
    throw new Error("le motif du rejet ne remonte pas");
});

T("« self+cavite » n'est pas une boucle : le chiffre est un plancher",()=>{
  /* LE PIÈGE, et il est facile à écrire de travers : la source vaut
     « self+cavite » quand la référence change et que rien ne referme la
     boucle. Chercher « self » marcherait ; chercher l'ABSENCE de « boucle »
     est la seule règle qui tienne aussi pour « boucle+cavite ». */
  const seul=avecPanneau(resChevelu(
    {x:1, y:1, retenus:0, vias:[]},
    {inductance_nH:0.5779, inductance_source:"self+cavite"}),
    ()=>simCheveluRes())[0];
  if(!seul.seul)
    throw new Error("« self+cavite » a été pris pour une boucle refermée");
  const boucle=avecPanneau(resChevelu(
    {x:1, y:1, retenus:1, vias:[{x:2, y:1, retenu:true, part:1}]},
    {inductance_nH:0.6758, inductance_source:"boucle+cavite"}),
    ()=>simCheveluRes())[0];
  if(boucle.seul)
    throw new Error("« boucle+cavite » a été pris pour une self");
});

T("sans position, pas de chevelu : on n'invente pas le point",()=>{
  /* Une page qui n'envoie pas le via ne peut pas se voir dessiner son chevelu.
     Poser le trait au raccord serait dessiner une origine que l'outil ne
     connaît pas. */
  const g=avecPanneau(resChevelu(
    {retenus:0, vias:[], source:"absent"},
    {inductance_nH:0.68, inductance_source:"self"}),
    ()=>simCheveluRes());
  if(g.length)
    throw new Error("un chevelu a été rendu sans position de via");
});

T("le chevelu ne sort pas hors de l'onglet Impédance",()=>{
  const res=resChevelu({x:1, y:1, retenus:1,
                        vias:[{x:2, y:1, retenu:true, part:1}]},
                       {inductance_nH:0.5, inductance_source:"boucle"});
  const o=SIM.ouvert, a=SIM.analyse, r=SIM.res;
  SIM.ouvert=true; SIM.res=res;
  SIM.analyse="dc";
  const horsOnglet=simCheveluRes().length;
  SIM.analyse="retour"; SIM.ouvert=false;
  const panneauFerme=simCheveluRes().length;
  SIM.ouvert=o; SIM.analyse=a; SIM.res=r;
  if(horsOnglet)
    throw new Error("le chevelu se dessine sur l'onglet DC");
  if(panneauFerme)
    throw new Error("le chevelu se dessine panneau fermé");
});

T("la couleur d'un lien suit sa part du courant",()=>{
  const co=f=>simRetourCouleurRes(f);
  if(co({retenu:false, part:0})!==co({retenu:false, part:0.9}))
    throw new Error("un lien écarté a une couleur, et une seule");
  if(co({retenu:true, part:0.62})===co({retenu:true, part:0.12}))
    throw new Error("celui qui travaille et celui qui traîne se confondent");
  if(co({retenu:true, part:0.62})===co({retenu:false, part:0}))
    throw new Error("le retenu et l'écarté se confondent");
});

/* Une toile qui ENREGISTRE ses traits. Le reste du banc n'en avait pas besoin
   — il éprouve des chiffres —, mais la seule chose que le chevelu puisse
   vraiment rater est de poser ses traits AILLEURS que sur le cuivre, et cela
   ne se voit que sur les points tracés. */
function toileMouchard(){
  const t={traits:[], cercles:[], txt:[], _p:null};
  const rien=()=>{};
  const o={
    save:rien, restore:rien, setTransform:rien, scale:rien, stroke:function(){
      if(t._p)t.traits.push(t._p); t._p=null;
    },
    beginPath:function(){t._p=null;},
    moveTo:function(x,y){t._p=[x,y,x,y];},
    lineTo:function(x,y){if(t._p){t._p[2]=x; t._p[3]=y;}},
    arc:function(x,y,r){t.cercles.push([x,y,r]); t._p=null;},
    rect:rien, roundRect:rien, fill:rien,
    fillText:function(s,x,y){t.txt.push({s:s, x:x, y:y});},
    measureText:function(s){return {width:6*String(s).length};},
    setLineDash:rien,
    lineCap:"", lineJoin:"", lineWidth:0, strokeStyle:"", fillStyle:"", font:""
  };
  t.ctx=o;
  return t;
}

T("le chevelu tombe sur le cuivre, en unités du fichier",()=>{
  /* LA SEULE CHOSE QUE CE DESSIN PUISSE VRAIMENT RATER. Le serveur travaille
     en MILLIMÈTRES — c'est l'unité du document envoyé — et le monde de la
     visionneuse est dans l'unité du FICHIER. Sur une carte en pouces le
     facteur vaut 25,4 : une conversion oubliée poserait le chevelu vingt-cinq
     fois trop loin, c'est-à-dire hors de la carte, où personne ne le
     trouverait pour s'en plaindre. */
  const t=toileMouchard();
  const monde=[], ecran=[];
  const vraiPoser=global.poserMonde, vraiW2s=global.w2s;
  global.poserMonde=function(){};
  global.w2s=function(x,y){ecran.push([x,y]); return {x:x, y:y};};
  const uni=V.unite;
  V.unite="in";                            /* 1 unité fichier = 25,4 mm */
  const res={discontinuites:{transitions:[{troncon:1,
    retour:{x:25.4, y:50.8, retenus:1,
            vias:[{x:50.8, y:50.8, retenu:true, part:1, raison:""}]},
    modelise:{inductance_nH:0.5, inductance_source:"boucle"},
    cotes:{pastille_mm:0.762}}]}};
  const o=SIM.ouvert, a=SIM.analyse, r=SIM.res;
  SIM.ouvert=true; SIM.analyse="retour"; SIM.res=res;
  try{
    simRetourTraceIpc(t.ctx,1);
  }finally{
    SIM.ouvert=o; SIM.analyse=a; SIM.res=r; V.unite=uni;
    global.poserMonde=vraiPoser; global.w2s=vraiW2s;
  }
  if(t.traits.length!==1)
    throw new Error("un trait attendu, "+t.traits.length);
  const [x1,y1,x2,y2]=t.traits[0];
  /* 25,4 mm = 1 pouce, 50,8 mm = 2 pouces. */
  if(Math.abs(x1-1)>1e-9||Math.abs(y1-2)>1e-9)
    throw new Error("le trait part de "+x1+" ; "+y1+" au lieu de 1 ; 2");
  if(Math.abs(x2-2)>1e-9||Math.abs(y2-2)>1e-9)
    throw new Error("le trait arrive en "+x2+" ; "+y2+" au lieu de 2 ; 2");
  /* Le cercle du via de signal : son rayon suit la PASTILLE, elle aussi en
     millimètres. */
  if(t.cercles.length!==1)
    throw new Error("un cercle attendu, "+t.cercles.length);
  if(!(t.cercles[0][2]>0.762/25.4/2))
    throw new Error("le cercle est plus petit que la pastille");
  /* ET LE CHIFFRE EST ÉCRIT. Un chevelu muet ne dit pas ce que vaut la
     boucle, qui est la raison de le regarder. */
  if(!t.txt.some(e=>/^L = /.test(e.s)))
    throw new Error("l'inductance de boucle n'est pas écrite : "+
                    t.txt.map(e=>e.s).join(" | "));
});

T("la sélection d'un via dans le rapport met son chevelu en surbrillance",()=>{
  const t=toileMouchard();
  const vraiPoser=global.poserMonde, vraiW2s=global.w2s;
  global.poserMonde=function(){};
  global.w2s=function(x,y){return {x:x, y:y};};
  const res={discontinuites:{transitions:[
    {troncon:1, retour:{x:25.4, y:50.8, retenus:1, vias:[{x:50.8, y:50.8, retenu:true, part:1}]},
     modelise:{inductance_nH:0.5, inductance_source:"boucle"}, cotes:{pastille_mm:0.762}},
    {troncon:2, retour:{x:60, y:60, retenus:1, vias:[{x:70, y:60, retenu:true, part:1}]},
     modelise:{inductance_nH:0.8, inductance_source:"boucle"}, cotes:{pastille_mm:0.762}}
  ]}};
  const o=SIM.ouvert, a=SIM.analyse, r=SIM.res, va=SIM.viaActif;
  SIM.ouvert=true; SIM.analyse="retour"; SIM.res=res;
  SIM.viaActif=0;
  try{
    simRetourTraceIpc(t.ctx,1);
  }finally{
    SIM.ouvert=o; SIM.analyse=a; SIM.res=r; SIM.viaActif=va;
    global.poserMonde=vraiPoser; global.w2s=vraiW2s;
  }
  if(t.cercles.length!==3)
    throw new Error("3 cercles attendus dont le halo du via actif, "+t.cercles.length);
  if(t.txt.filter(e=>/^L = /.test(e.s)).length!==1)
    throw new Error("seul le via sélectionné doit afficher son étiquette d'inductance");
});

/* ==========================================================================
   UNE PISTE COURBE EST UNE PISTE
   --------------------------------------------------------------------------
   L'IPC-2581 range les segments droits et les arcs dans deux collections
   distinctes. `simZPistes` ne lisait que la première. Sur une carte RF — où
   l'on courbe pour ne pas réfléchir — la liaison partait donc au serveur en
   morceaux droits SÉPARÉS par les arcs qui les joignent, et TOUT ce qui suppose
   un parcours en tombait : les raccords, les angles de coude, et surtout
   l'accrochage des vias, qui exige que la fin d'un tronçon rejoigne le début du
   suivant. Aucun via ne partait, donc aucun via de masse voisin non plus, donc
   pas de chevelu.

   Le chemin de la chute continue, lui, pliait déjà les arcs. Deux moitiés du
   même outil ne voyaient pas la même carte.
   ========================================================================== */

/* La topologie de la carte livrée : une droite, un ARC, un changement de
   couche, une droite. Le perçage est au bout de l'arc. */
function carteArc(){
  const c=carte({
    percages:[{x:15, y:21, d:0.25, n:0, p:"PTH"}],
    padstacks:{V1:{pad:0.55, pads:[{c:"Top", d:0.55},{c:"Bottom", d:0.55}]}},
    pads:[{x:15, y:21, ps:"V1", n:0}]
  });
  /* Les pistes d'abord, les arcs ensuite : c'est l'ordre du fichier, et c'est
     précisément ce qui ne dit pas le parcours. */
  c.modele.pistes=[{c:0, n:0, w:W, p:[10,20, 14,20]},
                   {c:1, n:0, w:W, p:[15,21, 19,21]}];
  /* L'arc va de (14,20) à (15,21) autour de (14,21) : un quart de tour, sur la
     couche 0, et c'est lui qui joint la droite au via. */
  c.modele.arcs=[{c:0, n:0, w:W, s:[14,20], e:[15,21], m:[14,21], h:0}];
  mdlCharger(c.modele);
  V.net=0;
  SIM.refCle=null; SIM.refAuto=true; SIM.ref=null;
}

T("un arc est plié en polyligne, et ses bouts sont ceux du fichier",()=>{
  const pts=simArcEnPolyligne({c:0, n:0, w:0.4,
                               s:[14,20], e:[15,21], m:[14,21], h:0});
  if(!pts||pts.length<6)
    throw new Error("l'arc n'est pas plié : "+JSON.stringify(pts));
  /* LES BOUTS SONT REPLACÉS, et ce n'est pas de la coquetterie : le rayon se
     déduit du premier point, le dernier point calculé peut retomber à un
     micron du bout déclaré, et un micron suffit à casser un chaînage. */
  if(pts[0]!==14||pts[1]!==20)
    throw new Error("le premier point a bougé : "+pts[0]+" ; "+pts[1]);
  if(pts[pts.length-2]!==15||pts[pts.length-1]!==21)
    throw new Error("le dernier point a bougé : "+
                    pts[pts.length-2]+" ; "+pts[pts.length-1]);
  /* Et le milieu est bien SUR le cercle, pas sur la corde : un arc plié en
     ligne droite ferait une longueur trop courte et un écart au cuivre mesuré
     au mauvais endroit. */
  const im=2*Math.floor(pts.length/4)*1;
  let hors=0;
  for(let i=0;i+1<pts.length;i+=2){
    const r=Math.hypot(pts[i]-14,pts[i+1]-21);
    if(Math.abs(r-1)>1e-9)hors++;
  }
  if(hors)throw new Error(hors+" point(s) hors du cercle");
});

T("un arc entre deux droites ne casse plus le parcours",()=>{
  carteArc();
  const g=simSegments();
  /* Trois tronçons : la droite, l'arc, la droite. L'arc en fait partie — sans
     lui il n'y en avait que deux, et ils ne se touchaient pas. */
  if(g.envoi.length!==3)
    throw new Error("trois tronçons attendus, "+g.envoi.length);
  /* L'ORDRE EST CELUI DU PARCOURS, pas celui du fichier : l'arc était écrit
     APRÈS les deux droites, il doit sortir ENTRE elles. */
  const suite=g.envoi.map(o=>o.layer).join(",");
  if(suite!=="0,0,2")
    throw new Error("ordre des couches : "+suite+" au lieu de 0,0,2");
  if(Math.abs(g.envoi[1].start[0]-14)>1e-9||Math.abs(g.envoi[1].end[0]-15)>1e-9)
    throw new Error("le tronçon du milieu n'est pas l'arc : "+
                    g.envoi[1].start+" -> "+g.envoi[1].end);
  /* LA LONGUEUR DE L'ARC EST CELLE DE L'ARC, pas celle de sa corde : un quart
     de cercle de rayon 1 fait pi/2, sa corde racine de 2. Les confondre
     raccourcirait la liaison de onze pour cent, et le retard avec. */
  if(Math.abs(g.envoi[1].length-Math.PI/2)>1e-4)
    throw new Error("longueur de l'arc "+g.envoi[1].length+
                    " au lieu de "+(Math.PI/2));
  /* ET LE VIA S'ACCROCHE, ce qui était tout l'enjeu. */
  const v=g.envoi[2].via;
  if(!v)
    throw new Error("le via n'est pas accroché : l'arc ne rejoint pas la "+
                    "droite du parcours");
  if(Math.abs(v.drill_diameter-0.25)>1e-9)
    throw new Error("perçage "+v.drill_diameter+" au lieu de 0,25");
  if(!("retours" in v))
    throw new Error("le via part sans ses vias de masse voisins");
});


/* ==========================================================================
   LA SÉLECTION À PLUSIEURS MORCEAUX, ET LES LOTS
   --------------------------------------------------------------------------
   LE CAS ÉPROUVÉ ICI est celui qui a demandé la chose : une ligne RF de 50 Ω
   coupée par des composants. Le cuivre est alors en morceaux, sur des nets
   différents, et la question — « fait-elle 50 Ω d'un bout à l'autre ? » —
   n'admet pas qu'on les mette en cascade : entre deux morceaux il y a un
   boîtier. Ce qu'on vérifie donc, c'est que chaque morceau part SEUL, avec ses
   seuls tronçons, et que les morceaux qui se TOUCHENT ne sont pas séparés.
   ========================================================================== */

/* Une ligne coupée en trois par deux condensateurs : trois nets, trois
   morceaux de 10 mm, séparés de 2 mm. C'est le montage du cas d'usage. */
function ligneCoupee(){
  const r=carte({
    nets:["RF1","GND","RF2","RF3"],
    pistes:[
      {c:0, n:0, w:W, p:[10,Y, 20,Y]},
      {c:0, n:2, w:W, p:[22,Y, 32,Y]},
      {c:0, n:3, w:W, p:[34,Y, 44,Y]}
    ]
  });
  const p=n=>V.parNet[n].pistes[0];
  return {p0:p(0), p2:p(2), p3:p(3), r:r};
}
function desPiste(pi,couche){
  return {type:"piste", piste:pi, couche:(couche==null?0:couche), net:pi.n};
}
const MEV_COUCHE={couche:0, quoi:"", seul:null};
const OPTS={z0:50, f1:1e8, f2:5e9, points:11, fc:1e9};

T("Ctrl+clic empile les morceaux, un clic simple les remplace",()=>{
  const L=ligneCoupee();
  selPoser(desPiste(L.p0),MEV_COUCHE,false);
  if(V.sel.length!==1)throw new Error("un clic pose UN morceau, "+V.sel.length);
  selPoser(desPiste(L.p2),MEV_COUCHE,true);
  selPoser(desPiste(L.p3),MEV_COUCHE,true);
  if(V.sel.length!==3)throw new Error("trois morceaux attendus, "+V.sel.length);
  /* Le même objet recliqué avec Ctrl SORT de la sélection : c'est ce qui rend
     le geste réversible sans avoir à tout reprendre. */
  selPoser(desPiste(L.p2),MEV_COUCHE,true);
  if(V.sel.length!==2)throw new Error("le morceau recliqué doit sortir, "+
                                      V.sel.length);
  if(V.sel.some(e=>e.s.piste===L.p2))
    throw new Error("c'est le mauvais morceau qui est sorti");
  /* Et un clic SANS Ctrl remplace tout : sans cela on ne pourrait plus revenir
     à une sélection simple qu'en vidant à la main. */
  selPoser(desPiste(L.p3),MEV_COUCHE,false);
  if(V.sel.length!==1||V.sel[0].s.piste!==L.p3)
    throw new Error("le clic simple ne remplace pas : "+V.sel.length);
});

T("le reflet suit la dernière entrée : les fiches lisent le dernier clic",()=>{
  const L=ligneCoupee();
  selPoser(desPiste(L.p0),MEV_COUCHE,false);
  if(V.net!==0)throw new Error("V.net devrait refléter le net 0, "+V.net);
  selPoser(desPiste(L.p3),MEV_COUCHE,true);
  if(V.net!==3)throw new Error("le reflet doit suivre le dernier, "+V.net);
  if(V.mev.couche!==0)throw new Error("la portée du dernier clic est sa couche");
  /* Les listes marquent TOUS les nets retenus, pas seulement le dernier. */
  const nets=[...selNets()].sort();
  if(nets.join(",")!=="0,3")throw new Error("nets retenus : "+nets.join(","));
  /* Vider remet l'état d'avant tout clic : c'est Échap, et le bouton du
     panneau. */
  selPoser(null,null,false);
  if(V.sel.length||V.net!==-1||V.comp!=="")
    throw new Error("la sélection vidée doit tout remettre à zéro");
});

T("la même piste prise deux fois ne part qu'une fois",()=>{
  /* LA RÉGRESSION QUI MENAÇAIT : cliquer une piste, puis Ctrl+Maj+clic pour
     prendre son net entier. La piste est alors dans les deux entrées, et sans
     dédoublonnage elle se chaînerait avec elle-même — deux tronçons au même
     endroit, une longueur double, et un raccord que le serveur compterait. */
  const L=ligneCoupee();
  selPoser(desPiste(L.p0),MEV_COUCHE,false);
  selPoser({type:"net", net:0}, mdlMevTout(), true);
  const liste=simZPistes();
  if(liste.length!==1)
    throw new Error("une seule piste attendue, "+liste.length);
});

T("ce qui ne se touche pas fait deux lots ; ce qui se touche, un seul",()=>{
  const L=ligneCoupee();
  let lots=simLotsDePistes([{piste:L.p0,couche:0},{piste:L.p2,couche:0}]);
  if(lots.length!==2)throw new Error("deux lots attendus, "+lots.length);

  /* Deux pistes du MÊME net, bout à bout : un seul parcours, donc un seul lot —
     et c'est ce qui garde le comportement d'avant sur une liaison routée en
     plusieurs segments. */
  carte({nets:["RF1","GND"], pistes:[
    {c:0, n:0, w:W, p:[10,Y, 20,Y]},
    {c:0, n:0, w:W, p:[20,Y, 30,Y]}
  ]});
  const a=V.parNet[0].pistes[0], b=V.parNet[0].pistes[1];
  lots=simLotsDePistes([{piste:a,couche:0},{piste:b,couche:0}]);
  if(lots.length!==1)throw new Error("un seul lot attendu, "+lots.length);
  if(lots[0].length!==2)throw new Error("le lot porte les deux pistes");

  /* MÊME POINT, NETS DIFFÉRENTS : deux lots. Un via qui passe au ras d'une
     pastille voisine est le cas ordinaire d'une carte dense, et les fondre
     inventerait une liaison que la carte ne porte pas. */
  carte({nets:["RF1","GND","RF2"], pistes:[
    {c:0, n:0, w:W, p:[10,Y, 20,Y]},
    {c:0, n:2, w:W, p:[20,Y, 30,Y]}
  ]});
  lots=simLotsDePistes([{piste:V.parNet[0].pistes[0],couche:0},
                        {piste:V.parNet[2].pistes[0],couche:0}]);
  if(lots.length!==2)
    throw new Error("nets différents au même point : deux lots, pas "+
                    lots.length);
});

T("un lot par morceau, et chacun ne part qu'avec ses tronçons",()=>{
  const L=ligneCoupee();
  selPoser(desPiste(L.p0),MEV_COUCHE,false);
  selPoser(desPiste(L.p2),MEV_COUCHE,true);
  selPoser(desPiste(L.p3),MEV_COUCHE,true);
  const r=SIM_IPC.problemes(OPTS);
  if(r.erreur)throw new Error("refus inattendu : "+r.erreur);
  if(r.lots.length!==3)throw new Error("trois lots attendus, "+r.lots.length);
  /* CHAQUE DOCUMENT EST COMPLET ET SÉPARÉ : un tronçon, son net, sa longueur.
     Un lot qui emporterait le cuivre du voisin rendrait un S21 de la ligne
     entière en ignorant les composants — le chiffre exact qu'on ne veut pas. */
  const nets=r.lots.map(p=>p.doc.net).join(",");
  if(nets!=="RF1,RF2,RF3")
    throw new Error("l'ordre des lots suit les clics : "+nets);
  for(const p of r.lots){
    const o=p.doc.geometry.objects;
    if(o.length!==1)
      throw new Error("un tronçon par lot, "+o.length+" dans "+p.doc.net);
    if(Math.abs(o[0].length-10)>1e-6)
      throw new Error("longueur "+o[0].length+" au lieu de 10 pour "+p.doc.net);
    if(!p.titre||p.titre.indexOf(p.doc.net)<0)
      throw new Error("le titre du lot doit nommer son net : "+p.titre);
  }
});

T("un seul morceau désigné rend un seul lot, par le chemin d'avant",()=>{
  /* CE QU'ON PROTÈGE ICI : un net de masse dont le cuivre est en îlots ne doit
     pas partir en autant de requêtes parce qu'on l'a effleuré. Un clic, un
     Maj+clic, un net choisi dans la liste : un lot, et le même document que
     `probleme` rendait. */
  const L=ligneCoupee();
  selPoser({type:"net", net:0}, mdlMevTout(), false);
  const r=SIM_IPC.problemes(OPTS);
  if(r.erreur)throw new Error("refus inattendu : "+r.erreur);
  if(r.lots.length!==1)throw new Error("un seul lot attendu, "+r.lots.length);
  const seul=SIM_IPC.probleme(OPTS);
  if(seul.doc.geometry.objects.length!==r.lots[0].doc.geometry.objects.length)
    throw new Error("les deux chemins doivent rendre le même document");
});

T("au-delà du plafond, tout part dans un seul document — et la note le dit",()=>{
  /* AUCUN PLAFOND SILENCIEUX : dix-sept morceaux disjoints seraient dix-sept
     allers-retours au serveur. On retombe sur le comportement d'avant, en
     disant que la comparaison n'a pas eu lieu. */
  const pistes=[], nets=["GND"];
  for(let i=0;i<SIM_LOTS_MAX+1;i++){
    nets.push("RF"+i);
    pistes.push({c:0, n:i+1, w:W, p:[2+i*3, Y, 4+i*3, Y]});
  }
  carte({nets:nets, pistes:pistes});
  V.sel=pistes.map((_,i)=>({s:desPiste(V.parNet[i+1].pistes[0]),
                            mev:MEV_COUCHE}));
  selRefleter();
  const r=SIM_IPC.problemes(OPTS);
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

T("un morceau écarté est nommé, jamais tu",()=>{
  /* Une piste posée sur une couche absente de l'empilage de calcul n'a pas
     d'impédance. Son lot ne peut pas être rendu ; son absence du tableau se
     lirait comme un oubli si personne ne la nommait. */
  carte({nets:["RF1","GND","RF2"], pistes:[
    {c:0, n:0, w:W, p:[10,Y, 20,Y]},
    {c:9, n:2, w:W, p:[24,Y, 34,Y]}     // couche hors empilage
  ]});
  V.sel=[{s:desPiste(V.parNet[0].pistes[0],0), mev:MEV_COUCHE},
         {s:desPiste(V.parNet[2].pistes[0],9), mev:{couche:9,quoi:"",seul:null}}];
  selRefleter();
  const r=SIM_IPC.problemes(OPTS);
  if(r.erreur)throw new Error("refus inattendu : "+r.erreur);
  if(r.lots.length!==1)throw new Error("un lot calculable, "+r.lots.length);
  if(!r.lots[0].notes.some(n=>/écarté/.test(n)))
    throw new Error("l'écart doit être dit : "+JSON.stringify(r.lots[0].notes));
});

T("la carte peint tous les lots, et le reflet est remis en place",()=>{
  /* LE PANNEAU NE DÉPLIE QU'UNE FICHE, LA CARTE MONTRE TOUT : c'est ce qui
     répond d'un coup d'œil à « est-ce 50 Ω partout ». `simPourChaqueLot` pose
     le reflet le temps de peindre — s'il ne le remettait pas, la fiche
     afficherait le dernier lot peint au lieu de celui qu'on a déplié. */
  const faux=(z0,n)=>({res:{segments:[{z0:z0, longueur:10, couche:0,
                                       largeur:0.4, nom_couche:"Top"}],
                            ligne:{z0_min:z0, z0_max:z0, z0_moyen:z0,
                                   longueur:10, troncons:1}},
                       objets:[{couche:"Top"}], rang:n, titre:"lot"+n});
  SIM.lots=[faux(50,1), faux(72,2)];
  SIM.saisie.cible=50; SIM.saisie.tolPct=10;
  simLotMirroir(0);
  const vus=[];
  simPourChaqueLot(l=>vus.push(l.rang+":"+SIM.res.ligne.z0_moyen));
  if(vus.join(" ")!=="1:50 2:72")throw new Error("lots peints : "+vus.join(" "));
  if(SIM.res!==SIM.lots[0].res)
    throw new Error("le reflet n'a pas été remis en place");
  if(!simLotsMultiples())throw new Error("deux lots, c'est multiple");

  /* Le tableau de synthèse : c'est lui la réponse à la question posée. */
  const h=simTableauLots();
  if(!/2 morceaux sélectionnés/.test(h))
    throw new Error("le compte des morceaux manque");
  if(!/1 sur 2 dans la tolérance/.test(h))
    throw new Error("le verdict d'ensemble est faux : "+h.slice(0,200));
  const b=simLotBilan(SIM.lots[1]);
  if(b.dehors!==1)throw new Error("le lot 2 est hors tolérance");
  simOublierRes();
  if(SIM.lots.length||SIM.res)throw new Error("tout doit s'oublier ensemble");
});

/* ==========================================================================
   LE VOISINAGE — CE QUI PART POUR LA DIAPHONIE ET LA Z DIFFÉRENTIELLE
   --------------------------------------------------------------------------
   L'AGRESSEUR N'EST JAMAIS DANS LA SÉLECTION, et l'autre moitié d'une paire
   non plus : on désigne un net, pas deux. Sans ce que la page joint au
   document, les deux onglets n'ont rien à calculer, quel que soit le solveur
   derrière.

   CE QUE CES CAS VERROUILLENT est le CONTRAT — ce qui part, ce qui ne part
   pas, sous quel format et dans quelle unité. L'appariement lui-même et la
   physique sont au serveur, qui les fait pour les deux outils à la fois, et
   `python/test/banc-ligne-mom.py` les mesure.
   ========================================================================== */

/* La carte de laboratoire, plus une piste voisine parallèle à `dy` de l'axe. */
function carteVoisine(dy,net,couche){
  const r=carte({nets:["N$1","GND","AGR"],
                 pistes:[{c:0, n:0, w:W, p:[X1,Y, X2,Y]},
                         {c:(couche==null?0:couche), n:2, w:W,
                          p:[X1,Y+dy, X2,Y+dy]}]});
  /* La PORTÉE reste le net 0 : la voisine n'est pas sélectionnée, et c'est
     tout le point. */
  V.net=0;
  if(net)V.modele.nets[2]=net;
  return r;
}

T("le cuivre qui longe la sélection part avec le problème",()=>{
  carteVoisine(0.65);
  const g=simSegments();
  const v=simVoisinageIpc(g.envoi,g.objets);
  if(v.length!==1)
    throw new Error(v.length+" tronçon(s) de voisinage au lieu de 1");
  const o=v[0];
  if(o.net!=="AGR")throw new Error("net « "+o.net+" »");
  if(o.layer!==simRangCu(0))throw new Error("couche "+o.layer);
  if(Math.abs(o.width-W)>1e-9)throw new Error("largeur "+o.width);
  if(!(o.copper_thickness>0))
    throw new Error("le voisinage part sans épaisseur de cuivre");
  if(Math.abs(o.start[1]-(Y+0.65))>1e-6)
    throw new Error("la voisine est envoyée en y="+o.start[1]);
  /* ET IL ATTEINT LE DOCUMENT, avec le temps de montée. */
  const d=simDocIpc(null,0,{z0:50,f1:1e8,f2:5e9,points:11,fc:1e9,tr:0}).doc;
  if(!d.voisinage||d.voisinage.length!==1)
    throw new Error("le document n'emporte pas le voisinage : "+
                    JSON.stringify(d.voisinage));
  if(!("temps_montee" in d.analyse))
    throw new Error("l'analyse ne porte pas le temps de montée");
});

T("ce qui ne peut pas longer ne part pas",()=>{
  /* TROIS EXCLUSIONS, toutes du ressort de la page : la sélection elle-même,
     une autre couche de cuivre, et ce qui est hors de portée. Le reste —
     parallélisme, recouvrement, écart exact — est au serveur. */
  carteVoisine(30.0);
  let g=simSegments();
  if(simVoisinageIpc(g.envoi,g.objets).length)
    throw new Error("une piste à 30 mm est envoyée comme voisine");

  carteVoisine(0.65,null,1);
  g=simSegments();
  if(simVoisinageIpc(g.envoi,g.objets).length)
    throw new Error("une piste d'une autre couche est envoyée comme voisine");

  /* Les deux pistes du MÊME net : la seconde est dans la sélection, donc pas
     dans le voisinage. */
  carte({nets:["N$1","GND"],
         pistes:[{c:0, n:0, w:W, p:[X1,Y, X2,Y]},
                 {c:0, n:0, w:W, p:[X1,Y+0.65, X2,Y+0.65]}]});
  V.net=0;
  g=simSegments();
  if(simVoisinageIpc(g.envoi,g.objets).length)
    throw new Error("une piste sélectionnée est envoyée comme sa propre voisine");
});

T("le voisinage part en millimètres, même quand le fichier est en pouces",()=>{
  /* LA CONVERSION EST LA MÊME QUE POUR LA GÉOMÉTRIE, et il faut qu'elle le
     soit : le serveur compare les deux listes entre elles pour apparier. Une
     seule des deux en pouces, et il n'y aurait plus jamais de longement — ni
     erreur, ni chiffre, juste un silence. */
  carteVoisine(0.65);
  V.unite="in";
  const g=simSegments();
  const v=simVoisinageIpc(g.envoi,g.objets);
  if(v.length!==1)
    throw new Error(v.length+" tronçon(s) en pouces au lieu de 1");
  const k=simKUnite();
  if(Math.abs(v[0].start[1]-(Y+0.65)*k)>1e-6)
    throw new Error("la voisine sort en "+v[0].start[1]+" au lieu de "+
                    ((Y+0.65)*k));
  if(Math.abs(v[0].width-W*k)>1e-9)
    throw new Error("la largeur sort en "+v[0].width);
  V.unite="MM";
});

/* ==========================================================================
   CROSSTALK — LES TROIS MESURES QUE SEULE CETTE PAGE PEUT FAIRE
   --------------------------------------------------------------------------
   L'onglet Crosstalk demande à la page trois choses que la simulation
   d'impédance ne demandait pas, et sans lesquelles les contrôles de plan de
   référence ne diraient RIEN : les positions des vias de couture sur
   l'ABSCISSE du parcours, les discontinuités du plan sous la piste, et les
   perçages de masse. Une liste vide de zones à risque se lit « rien à
   signaler » — ce qui est exactement le contraire de « on n'a pas regardé »,
   et c'est cette différence-là que les cas ci-dessous défendent.
   ========================================================================== */

/* La même carte, mais dont le plan est sur la couche du DESSOUS : c'est celui
   que le crosstalk sonde, là où `plan()` en pose un sur la couche de la piste
   pour mesurer l'écart coplanaire. */
function planDessous(o,trous){return {c:1, n:1, g:[{o:o, t:trous||[]}]};}

T("une voisine part avec ses écarts à la masse, comme la sélection",()=>{
  /* LES DEUX MOITIÉS DU DOCUMENT SE MESURENT AVEC LA MÊME RÈGLE, et c'est ce
     que ce cas défend. `simEcartsEn` compare des INDICES de net — c'est ce que
     porte la grille des arêtes ; lui passer des noms rendait `refs.has(...)`
     toujours faux, et chaque voisine partait avec un écart nul. Rien ne
     levait : le serveur en concluait simplement qu'aucun cuivre de masse ne
     s'interpose jamais, donc un couplage PESSIMISTE sur toute carte arrosée.
     C'est exactement le genre de faux silencieux qui ne se voit sur aucun
     écran. */
  carte({plans:[plan(1,rect(2,2,58,38),[rect(2,Y-0.4,58,Y+0.4)])],
         pistes:[{c:0, n:0, w:W, p:[X1,Y, X2,Y]},
                 {c:0, n:2, w:W, p:[X1,Y+1.2, X2,Y+1.2]}]});
  const g=simSegments();
  if(!(g.envoi[0].gap_left>0))
    throw new Error("la sélection doit voir la masse : "+g.envoi[0].gap_left);
  const v=simVoisinageIpc(g.envoi,g.objets);
  if(!v.length)throw new Error("la voisine doit partir");
  if(!(v[0].gap_left>0)&&!(v[0].gap_right>0))
    throw new Error("la voisine part sans écart à la masse : "+
                    v[0].gap_left+" / "+v[0].gap_right);
});

T("l'abscisse curviligne d'un point suit le parcours, pas la carte",()=>{
  carte();
  const par=simXtParcoursIpc(simSegments());
  if(Math.abs(par.total-(X2-X1))>0.01)
    throw new Error("le parcours doit faire 40 mm : "+par.total);
  /* C'EST CETTE PROJECTION QUI MET UN VIA DE COUTURE ET UN PIC DE COUPLAGE AU
     MÊME ENDROIT sur la carte, et c'est toute sa raison d'être. */
  const s=simXtAbscisseIpc(par,X1+5,Y+1);
  if(Math.abs(s-5)>0.05)
    throw new Error("un point à 5 mm du départ doit sortir à 5 : "+s);
  /* LA PROJECTION EST TOUJOURS DÉFINIE, et c'est aux appelants de dire à
     quelle distance ils cessent d'y croire : la couture a son couloir, les
     vias de masse leur rayon. Un point situé au-delà du bout de la piste
     tombe donc sur le bout — et c'est bien ce qu'on veut, parce que sa
     DISTANCE, elle, porte l'écart et le fera écarter. */
  if(simXtAbscisseIpc(par,X1-9,Y)>0.01)
    throw new Error("un point avant le départ se rabat sur l'origine");
  if(simXtAbscisseIpc({liste:[],total:0},X1,Y)!==-1)
    throw new Error("un parcours vide n'a pas d'abscisse du tout");
});

T("les vias de couture sortent à leur abscisse, du bon côté",()=>{
  carte({plans:[plan(1,rect(2,2,58,38),[rect(X1-1,Y-0.4,X2+1,Y+0.4)])],
         percages:[{x:X1+5, y:Y+1, d:0.4, n:1, p:"PTH"},
                   {x:X1+20, y:Y+1, d:0.4, n:1, p:"PTH"},
                   {x:X1+12, y:Y-1, d:0.4, n:1, p:"PTH"},
                   /* Hors couloir : il ne coud rien. */
                   {x:X1+30, y:Y+9, d:0.4, n:1, p:"PTH"}]});
  const pos=simXtCoutureIpc(simXtParcoursIpc(simSegments()),simRefIdx());
  if(pos.length!==3)
    throw new Error("trois vias dans le couloir, "+pos.length+" comptés");
  if(Math.abs(pos[0].s-5)>0.05||Math.abs(pos[2].s-20)>0.05)
    throw new Error("abscisses 5, 12 et 20 attendues : "+
                    JSON.stringify(pos.map(p=>p.s)));
  /* LES DEUX BORDS SE DISTINGUENT : le serveur mesure le pas de couture côté
     par côté, et confondre les deux fabriquerait des trous qui n'existent pas
     sur un cuivre cousu en quinconce. */
  if(pos[0].cote!==pos[2].cote)
    throw new Error("deux vias du même bord doivent avoir le même côté");
  if(pos[1].cote===pos[0].cote)
    throw new Error("le via de l'autre bord doit changer de signe");
});

T("un plan qu'on ne sait pas sonder rend null, jamais une liste vide",()=>{
  /* AUCUN CONTOUR DE PLAN SOUS LE PARCOURS : on ne SAIT pas où le cuivre est,
     ce qui n'est pas la même chose que savoir qu'il est partout. Rendre une
     liste vide ferait écrire « aucune zone de vigilance » sous un contrôle qui
     n'a jamais eu lieu. */
  carte();
  const f=simXtFentesIpc(simXtParcoursIpc(simSegments()),simRefIdx());
  if(f!==null)
    throw new Error("sans contour de plan, il faut null : "+JSON.stringify(f));
});

T("une fente du plan sous le parcours est trouvée et localisée",()=>{
  /* LE PLAN, EN DEUX MORCEAUX : il s'arrête à 10 mm du départ de la piste et
     reprend 10 mm plus loin. C'est exactement ce que fait une découpe de plan,
     et c'est ce qui produit un pic de couplage là où le plan paraît continu
     partout ailleurs. */
  carte({plans:[planDessous(rect(2,2,X1+10,38)),
                planDessous(rect(X1+20,2,58,38))]});
  const par=simXtParcoursIpc(simSegments());
  const f=simXtFentesIpc(par,simRefIdx());
  if(!f||!f.length)
    throw new Error("la fente doit être trouvée : "+JSON.stringify(f));
  if(Math.abs(f[0].s-10)>1.0)
    throw new Error("la fente commence vers 10 mm : "+JSON.stringify(f[0]));
  if(Math.abs(f[0].longueur-10)>1.5)
    throw new Error("elle dure une dizaine de millimètres : "+
                    JSON.stringify(f[0]));
  if(!f[0].quoi)throw new Error("une zone doit dire ce qui a été vu");
  /* ET UN PLAN CONTINU N'EN A PAS. */
  carte({plans:[planDessous(rect(2,2,58,38))]});
  const rien=simXtFentesIpc(simXtParcoursIpc(simSegments()),simRefIdx());
  if(rien===null||rien.length)
    throw new Error("un plan continu n'a pas de fente : "+
                    JSON.stringify(rien));
});

T("le cuivre d'un autre net sur la couche de plan est un trou du retour",()=>{
  /* LE COURANT NE PASSE PAS DANS LE CUIVRE D'UN AUTRE NET : une flaque
     d'alimentation posée sur la couche de plan est une fente du retour tout
     autant qu'une absence de cuivre. La compter comme du plan ferait annoncer
     continu un retour qui ne l'est pas. */
  carte({plans:[planDessous(rect(2,2,58,38),[rect(X1+10,2,X1+20,38)]),
                {c:1, n:2, g:[{o:rect(X1+10,2,X1+20,38), t:[]}]}]});
  const f=simXtFentesIpc(simXtParcoursIpc(simSegments()),simRefIdx());
  if(!f||!f.length)
    throw new Error("le cuivre étranger doit ressortir comme une fente : "+
                    JSON.stringify(f));
  if(Math.abs(f[0].s-10)>1.0)
    throw new Error("elle commence vers 10 mm : "+JSON.stringify(f[0]));
});

T("les perçages de masse partent en supposant la portée, et on le dit",()=>{
  carte({plans:[plan(1,rect(2,2,58,38),[rect(X1-1,Y-0.4,X2+1,Y+0.4)])],
         percages:[{x:X1+5, y:Y+1, d:0.4, n:1, p:"PTH"},
                   /* Hors du rayon de retour : il ne referme rien ici. */
                   {x:X1+5, y:Y+12, d:0.4, n:1, p:"PTH"}]});
  const v=simXtViasMasseIpc(simXtParcoursIpc(simSegments()),simRefIdx());
  if(v.length!==1)
    throw new Error("un seul perçage à portée, "+v.length+" envoyé(s)");
  /* LA PORTÉE EST SUPPOSÉE TRAVERSANTE : l'IPC-2581 ne déclare pas les couches
     d'un perçage. C'est une hypothèse OPTIMISTE, et le document doit la dire. */
  if(v[0].a!==simRangCu(0)||v[0].b!==simRangCu(LT.cu.length-1))
    throw new Error("la portée supposée doit couvrir l'empilage : "+
                    JSON.stringify(v[0]));
});

T("le voisinage du crosstalk voit les couches adjacentes, pas celui de la simulation",()=>{
  /* TROIS CUIVRES : deux signaux face à face et un plan. C'est le cas que la
     section droite ne sait PAS décrire — deux pistes superposées —, et
     précisément pour cela qu'il doit arriver au serveur : c'est lui qui dit
     qu'il ne sait pas le modéliser, et le taire ferait lire un couplage nul là
     où il est maximal. */
  carte({empilage:[{nom:"Top",  seq:1, ep:0.035, type:"CONDUCTOR"},
                   {nom:"D1",   seq:2, ep:0.1, type:"DIELECTRIC", dk:"4.3"},
                   {nom:"In1",  seq:3, ep:0.035, type:"CONDUCTOR"},
                   {nom:"D2",   seq:4, ep:0.2, type:"DIELECTRIC", dk:"4.3"},
                   {nom:"Bot",  seq:5, ep:0.035, type:"PLANE"}],
         couches:["Top","In1","Bot"],
         pistes:[{c:0, n:0, w:W, p:[X1,Y, X2,Y]},
                 {c:1, n:2, w:W, p:[X1,Y, X2,Y]}]});
  const g=simSegments();
  const sans=simVoisinageIpc(g.envoi,g.objets);
  const avec=simVoisinageIpc(g.envoi,g.objets,true);
  if(sans.length)
    throw new Error("la simulation ne regarde que la couche de la sélection, "+
                    sans.length+" tronçon(s) retenus");
  if(!avec.length)
    throw new Error("le crosstalk doit voir la piste superposée");
  if(avec[0].layer===g.envoi[0].layer)
    throw new Error("la voisine doit être sur une AUTRE couche : "+
                    avec[0].layer);
});

T("le document de crosstalk porte les trois mesures, et pas les ports",()=>{
  carte({plans:[planDessous(rect(2,2,58,38))],
         percages:[{x:X1+5, y:Y+1, d:0.4, n:1, p:"PTH"},
                   {x:X1+20, y:Y+1, d:0.4, n:1, p:"PTH"}]});
  const p=SIM_IPC.problemeCrosstalk(simSaisie());
  if(p.erreur)throw new Error("le document est refusé : "+p.erreur);
  const d=p.doc;
  if(!d.agresseurs||d.agresseurs.length!==1)
    throw new Error("l'agresseur est la sélection : "+
                    JSON.stringify(d.agresseurs));
  if(!d.couture||!d.couture.positions.length)
    throw new Error("les positions de couture doivent partir");
  if(!d.fentes)
    throw new Error("un plan sondable doit rendre une liste, même vide");
  if(!d.vias_masse||!d.vias_masse.length)
    throw new Error("les vias de masse doivent partir");
  /* `ports` EST CELUI DU DOCUMENT DE SIMULATION — deux impédances de
     référence —, et il ne décrit rien dans un réseau multi-ports dont le
     serveur pose lui-même les ports. Un champ qui ne veut rien dire dans un
     document rejouable finit par être lu comme s'il voulait dire quelque
     chose. */
  if("ports" in d)
    throw new Error("le document de crosstalk ne porte pas de ports");
  /* ET LA LIMITE PROPRE À CETTE PAGE EST DITE : la portée supposée. */
  if(!p.notes.some(n=>/TRAVERSANTS/.test(n)))
    throw new Error("la portée supposée doit être annoncée : "+
                    JSON.stringify(p.notes));
});

T("un plan qu'on n'a pas su sonder ne met pas de fentes dans le document",()=>{
  /* LE CHAMP EST ABSENT, et c'est ce qui fait écrire au serveur « rien n'a pu
     être examiné » au lieu de « aucune zone de vigilance ».

     LA MASSE EST BIEN RETENUE ICI — elle a du cuivre sur la couche de la
     piste —, et c'est ce qui rend le cas intéressant : ce n'est pas « pas de
     masse », c'est « une masse dont le PLAN ne se voit pas sous le parcours ».
     Les deux silences ne se corrigent pas du même geste. */
  carte({plans:[plan(1,rect(2,2,58,38),[rect(X1-1,Y-0.4,X2+1,Y+0.4)])],
         percages:[{x:X1+5, y:Y+1, d:0.4, n:1, p:"PTH"}]});
  const p=SIM_IPC.problemeCrosstalk(simSaisie());
  if(p.erreur)throw new Error("le document est refusé : "+p.erreur);
  if("fentes" in p.doc)
    throw new Error("sans plan sondable, le champ doit être ABSENT");
  if(!p.notes.some(n=>/pas pu être sondé/.test(n)))
    throw new Error("le silence doit être nommé : "+JSON.stringify(p.notes));
});

/* ==========================================================================
   LES ZONES À RISQUE, POSÉES SUR LE CUIVRE DE LA VICTIME
   --------------------------------------------------------------------------
   L'algorithme est commun aux deux outils ; ce qui est propre à cette page est
   la CONVERSION. Le canevas vit en unités FICHIER, le serveur en millimètres,
   et une seule des deux moitiés oubliée pose la surimpression à vingt-cinq
   fois sa place sur un fichier en pouces — ou pas du tout, ce qui ne se voit
   pas. C'est cela qu'on défend ici.
   ========================================================================== */

function bancRisque(unite){
  /* L'ÉCART EST POSÉ EN MILLIMÈTRES, PAS EN UNITÉS FICHIER : c'est un demi-
     millimètre de cuivre à cuivre dans les deux cas, sans quoi le banc en
     pouces décrirait une victime à douze millimètres — que le couloir écarte
     à juste titre, et l'essai ne mesurerait plus rien de ce qu'il croit. */
  const k=(unite==="in")?25.4:1;
  carte({plans:[plan(1,rect(2,2,58,38),[rect(2,Y-0.4,58,Y+0.4)])],
         pistes:[{c:0, n:0, w:W, p:[X1,Y, X2,Y]},
                 {c:0, n:2, w:W, p:[X1,Y+0.5/k, X2,Y+0.5/k]}]});
  V.unite=unite||"MM";
  SIM.ouvert=true; SIM.analyse="crosstalk"; SIM_XT.risques=true;
  SIM_XT.res={etape0:{candidats:[], seuils:{distance_max:0.75},
                      retenus:["N$2"], espacements:{}},
              couples:[], carte_chaleur:null, masse:{zones:[], mesure:[]},
              agresseurs:["N$1"], principal:"N$1", longueur:X2-X1,
              reglages:{}, avertissements:[], hypotheses:[],
              risques:[{victime:"N$2", agresseur:"N$1", s0:10, s1:20,
                        niveau:1, niveau_db:-30, justifie:true, zone:""}]};
  return simXtRisqueGeom();
}

T("une zone à risque se pose sur le cuivre de SA victime, en millimètres",()=>{
  const zones=bancRisque("MM");
  if(zones.length!==1)throw new Error("une zone attendue, "+zones.length);
  const xs=[], ys=[];
  for(const m of zones[0].traits)
    for(let i=0;i+1<m.length;i+=2){xs.push(m[i]);ys.push(m[i+1]);}
  if(!xs.length)throw new Error("la zone ne porte aucun trait");
  /* ELLE TOMBE SUR LA VICTIME, pas sur l'agresseur : l'ordonnée le dit. */
  if(Math.min(...ys)<Y+0.4||Math.max(...ys)>Y+0.6)
    throw new Error("le trait n'est pas sur la victime : y de "+
                    Math.min(...ys)+" à "+Math.max(...ys));
  /* ET DANS LA PLAGE : l'agresseur part de X1, donc l'abscisse 10 est en
     X1+10. */
  const tol=SIM_XT_PAS_TRAIT+0.01;
  if(Math.min(...xs)<X1+10-tol||Math.max(...xs)>X1+20+tol)
    throw new Error("le trait déborde la plage : x de "+Math.min(...xs)+
                    " à "+Math.max(...xs));
  if(Math.min(...xs)>X1+11||Math.max(...xs)<X1+19)
    throw new Error("le trait ne couvre pas la plage : x de "+
                    Math.min(...xs)+" à "+Math.max(...xs));
  V.unite="MM"; SIM.ouvert=false; SIM_XT.res=null;
});

T("un fichier en pouces rend les mêmes millimètres",()=>{
  /* MÊME RÈGLE QUE LE VOISINAGE, et même conséquence si elle tombe : le
     serveur raisonne en millimètres, la page dessine en unités fichier, et une
     seule conversion oubliée met la surimpression hors de la carte. */
  const zones=bancRisque("in");
  if(zones.length!==1)throw new Error("une zone attendue, "+zones.length);
  const xs=[];
  for(const m of zones[0].traits)
    for(let i=0;i+1<m.length;i+=2)xs.push(m[i]);
  const k=25.4;
  /* Les polylignes sortent en MILLIMÈTRES : la piste va de X1 à X2 en unités
     fichier, donc de X1·25,4 à X2·25,4 en millimètres. La plage 10–20 mm du
     serveur tombe donc tout au début du cuivre. */
  if(Math.min(...xs)<X1*k-1)
    throw new Error("le trait sort en unités fichier au lieu de millimètres :"+
                    " x min "+Math.min(...xs)+", attendu ≥ "+(X1*k-1));
  V.unite="MM"; SIM.ouvert=false; SIM_XT.res=null;
});

T("la surimpression suit son onglet, et s'éteint sans rien jeter",()=>{
  bancRisque("MM");
  SIM_XT.risques=false;
  if(simXtRisques().length)
    throw new Error("éteinte, la surimpression ne rend plus rien");
  if(!SIM_XT.res)throw new Error("l'éteindre ne doit rien jeter");
  SIM_XT.risques=true; SIM.analyse="impedance";
  if(simXtRisques().length)
    throw new Error("elle ne survit pas au changement d'onglet : elle "+
                    "désignerait du cuivre sous une fiche qui n'en parle pas");
  SIM.analyse="crosstalk"; SIM.ouvert=false; SIM_XT.res=null;
});

T("le rôle d'une couche de cuivre peut être forcé en signal ou en plan",()=>{
  /* UNE COUCHE ARROSÉE PEUT ÊTRE DU SIGNAL, ET UNE COUCHE SIGNAL PEUT ÊTRE UN PLAN.
     Quand toutes les couches de cuivre portent un plan de masse arrosé, l'auto-détection
     les classe toutes en plan, ce qui fausse les références. L'utilisateur doit
     pouvoir forcer une couche en signal ou en plan via V.sur.role. */
  carte({nets:["N$1","GND"], plans:[plan(1, rect(2,2,58,38), [])]});
  ltPreparer();
  const c0 = LT.cu[0];
  const c1 = LT.cu[1];
  if(!c1.plan) throw new Error("c1 devrait être auto-détecté en plan");

  // Forcer c1 en signal
  V.sur.role[c1.nom] = "signal";
  ltPreparer();
  if(LT.cu[1].plan !== false) throw new Error("c1 devrait être devenu signal après surcharge");
  if(LT.cu[1].roleSaisi !== true) throw new Error("c1 devrait être marqué roleSaisi");

  // Vérifier que simStackupIpc envoie bien role: "signal"
  let st = simStackupIpc();
  let cu1 = st.layers.find(l => l.name === c1.nom);
  if(cu1.role !== "signal") throw new Error("simStackupIpc devrait émettre role: signal pour c1");

  // Forcer c0 (TOP signal) en plan
  V.sur.role[c0.nom] = "plan";
  ltPreparer();
  if(LT.cu[0].plan !== true) throw new Error("c0 devrait être devenu plan après surcharge");
  st = simStackupIpc();
  let cu0 = st.layers.find(l => l.name === c0.nom);
  if(cu0.role !== "plane") throw new Error("simStackupIpc devrait émettre role: plane pour c0");

  // Nettoyage de la surcharge
  delete V.sur.role[c0.nom];
  delete V.sur.role[c1.nom];
  ltPreparer();
  if(LT.cu[1].plan !== true) throw new Error("c1 devrait être redevenu plan après retrait de la surcharge");
  if(LT.cu[1].roleSaisi !== false) throw new Error("c1 ne devrait plus être marqué roleSaisi");
});

console.log("\n"+ok+" essais réussis, "+ko+" en échec.");
process.exit(ko?1:0);
