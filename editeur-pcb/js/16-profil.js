"use strict";
/* =============================================================================
   editeur-pcb — 16-profil.js
   Les réglages d'affichage suivent l'utilisateur, pas la carte.

   Une carte décrit un circuit : ses couches, ses classes de net, ses règles.
   Elle est la même pour tout le monde, et c'est pourquoi elle ne dit rien de
   la grille d'accrochage ni du sens de la vue — ceux-là décrivent une façon de
   travailler. Ils sont donc rangés dans le profil de qui travaille
   (commun/profils.js), à côté de la disposition des panneaux, et non dans le
   .json de la carte.

   Le partage se lit facilement : tout ce que docObj() emporte appartient au
   document ; ce qui est ici appartient à la personne.

     grille, accroche      pas d'accrochage et affichage de la grille
     antiCollision         le tracé se tient ou non à distance
     vue, contraste        dessus/dessous, et l'atténuation des autres couches
     liste, nonRoutes      l'onglet du panneau de listes et son filtre

   Ce fichier est chargé APRÈS 07-app.js, donc après init() : les valeurs
   d'usine sont déjà posées, on ne fait que les remplacer. C'est aussi ce qui
   permet de ne rien enregistrer pendant le démarrage — profilNoter() se tait
   tant que profilAppliquer() n'a pas rendu la main.
   ============================================================================= */

const PCB_PROFIL="reglages:pcb";
/* Faux pendant le démarrage et pendant un rétablissement : les setters
   appellent profilNoter(), et sans ce garde-fou les valeurs d'usine d'init()
   écraseraient le profil avant même qu'il soit relu. */
/* `var` et non `let` : dans la version un seul fichier (dist/), tous les
   modules partagent une seule portée, et init() tourne AVANT cette ligne.
   Une déclaration `let` serait alors dans sa zone morte et profilNoter()
   planterait au démarrage ; hoistée, la variable vaut undefined — donc
   faux, donc « on n'enregistre pas encore », ce qui est exactement la
   réponse voulue. */
var PCB_PROFIL_PRET=false;

/* Les valeurs d'usine, celles que pose init(). Un utilisateur dont le profil
   ne dit rien de la grille ou du contraste ne doit pas hériter de ceux du
   précédent : sans elles, changer d'utilisateur replacerait les panneaux mais
   laisserait la barre d'outils telle quelle. */
const PCB_PROFIL_USINE={grille:0.1,accroche:true,antiCollision:true,
                        vue:"dessus",contraste:1,liste:"nets",nonRoutes:false};

function profilEtat(){
  return {
    grille:S.grid,
    accroche:!!S.showGrid,
    antiCollision:!!S.avoid,
    vue:S.flip?"dessous":"dessus",
    contraste:S.contrast,
    /* « drc » est un résultat de contrôle, pas une habitude : on ne rouvre pas
       l'éditeur sur une liste d'erreurs qui n'ont pas encore été cherchées. */
    liste:(S.listTab==="drc")?"nets":S.listTab,
    nonRoutes:!!S.onlyUnrouted
  };
}
function profilNoter(){
  if(!PCB_PROFIL_PRET||typeof profEcrire!=="function")return false;
  return profEcrire(PCB_PROFIL,profilEtat());
}
/* Onglet du panneau de listes : même geste que les boutons de la barre. */
function profilListe(t){
  S.listTab=t;
  for(const [id,v] of [["tabNets","nets"],["tabComps","comps"],["tabDrc","drc"]])
    $(id).classList.toggle("on",v===t);
  buildList();
}
/* `garderVue` : la session d'onglet vient de rétablir la vue telle qu'elle
   était il y a dix secondes, en changeant d'outil. Elle est plus récente que
   l'habitude enregistrée — on ne la contredit pas. */
function profilAppliquer(garderVue){
  PCB_PROFIL_PRET=false;
  const lu=(typeof profLire==="function")?profLire(PCB_PROFIL):null;
  /* Ce que le profil ne dit pas, l'usine le dit : un réglage absent revient à
     sa valeur de départ, il ne reste pas sur celle de l'utilisateur d'avant. */
  const p=Object.assign({},PCB_PROFIL_USINE,(lu&&typeof lu==="object")?lu:{});
  /* Rétablir n'est pas un geste de l'utilisateur : cela ne doit rien annoncer
     dans le pied de page, où l'on vient peut-être de lui dire que sa carte a
     été reprise. D'où le pas de grille posé directement plutôt que par
     setGridStep(), qui, lui, commente. */
  if(Number.isFinite(+p.grille)&&+p.grille>0&&+p.grille!==S.grid){
    S.grid=+p.grille;
    updateGridInfo();
  }
  buildGridMenu();
  if(typeof p.accroche==="boolean")setGrid(p.accroche);
  if(typeof p.antiCollision==="boolean"){
    S.avoid=p.antiCollision;
    $("bAvoid").classList.toggle("on",S.avoid);
  }
  if(!garderVue&&(p.vue==="dessus"||p.vue==="dessous"))setFlip(p.vue==="dessous");
  if([0,1,2].indexOf(+p.contraste)>=0)setContrast(+p.contraste);
  if(p.liste==="nets"||p.liste==="comps")profilListe(p.liste);
  if(typeof p.nonRoutes==="boolean"){
    S.onlyUnrouted=!!p.nonRoutes;
    $("onlyUnrouted").checked=S.onlyUnrouted;
    buildList();
  }
  draw();
  PCB_PROFIL_PRET=true;
}

/* Changer d'utilisateur, ou voir arriver son fichier de profil après coup :
   les réglages de la barre d'outils suivent, comme les panneaux. La vue de la
   session d'onglet, elle, n'a plus à être ménagée — c'est un choix explicite
   de changer de personne. */
if(typeof profSurChangement==="function")
  profSurChangement(function(){profilAppliquer(false);});
profilAppliquer(PCB_REPRISE);
