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
  "simSaisie","simPorts",
  "V","LT","ltAire","ltPreparer","LT_SEUIL_PLAN","mdlLongueur",
  "mdlNetNom","mdlNb","mdlCharger","mdlCouches",
  "SIM","SIM_IPC","simRefSet","simRefListe","simRefCandidats",
  "simRefCandidatsIpc",
  "simRefIdx","simPlagesDe","simMemeEcart","simKUnite","simCumul","simSurPoly",
  "simProjPoly","simSousPoly","simDistSeg","simGrilleCuivre","simEcartsEn",
  "simPlagesIpc","simCoutureIpc","simSegments","simCuDe","simRangCu",
  "simTopo","simTopoNom","simCoplanaire","simCouture","simVoisins",
  "simNb","simSection","simProvenanceIpc",
  "SIM_GAP_MAX","SIM_COULOIR","SIM_GND_RE","SIM_REF_TAUX"];

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
    empilage:[
      {nom:"Top",    seq:1, ep:0.035, type:"CONDUCTOR"},
      {nom:"Coeur",  seq:2, ep:0.2,   type:"DIELECTRIC", dk:"4.3", df:"0.02"},
      {nom:"Bottom", seq:3, ep:0.035, type:"PLANE"}
    ],
    /* `couches` est la liste des NOMS, dans l'ordre du fichier : c'est
       `mdlCouches` qui en fait des objets, et les rattache a l'empilage par ce
       nom-la. */
    couches:["Top","Bottom"],
    pistes:[piste],
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
  SIM.saisie.unite="MHz";
  ch("simFc").value="868"; ch("simF1").value="100"; ch("simF2").value="3000";
  simSaisie();
  if(SIM.saisie.fc!==868e6)
    throw new Error("868 en MHz vaut 868 MHz, pas "+SIM.saisie.fc+" Hz");
  simUniteChanger("GHz");
  if(SIM.saisie.unite!=="GHz")throw new Error("l'unité doit avoir changé");
  if(SIM.saisie.fc!==868e6)
    throw new Error("changer d'unité ne déplace pas f₀ : "+SIM.saisie.fc+" Hz");
  if(SIM.saisie.f1!==1e8||SIM.saisie.f2!==3e9)
    throw new Error("la bande ne doit pas bouger non plus");
  /* ET LE CHAMP A ÉTÉ RÉÉCRIT dans la nouvelle unité : c'est la moitié
     visible du contrat. Sans cela on lirait 868 sous une étiquette GHz. */
  if(ch("simFc").value!=="0,868")
    throw new Error("le champ doit montrer 0,868 : « "+ch("simFc").value+" »");
  /* Et l'aller-retour retombe exactement où il était : sans cela, choisir son
     unité deux fois de suite ferait dériver la valeur. */
  simUniteChanger("MHz");
  simUniteChanger("GHz");
  if(SIM.saisie.fc!==868e6)throw new Error("aller-retour : "+SIM.saisie.fc);
  /* Une unité inconnue ne fait rien plutôt que de poser un facteur absent :
     `simUnite()` retomberait sur GHz et multiplierait par un milliard. */
  simUniteChanger("parsecs");
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

console.log("\n"+ok+" essais réussis, "+ko+" en échec.");
process.exit(ko?1:0);
