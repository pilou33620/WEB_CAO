"use strict";
/* =============================================================================
   editeur-schematique — 20-profil.js
   Les réglages d'affichage suivent l'utilisateur, pas le schéma.

   Un schéma décrit un circuit : ses feuilles, ses composants, ses fils. Il est
   le même pour tout le monde. La grille sur laquelle on accroche, les
   étiquettes de net qu'on veut voir, l'onglet ouvert dans le panneau de
   listes — cela décrit une façon de travailler, pas le circuit. Ces réglages
   sont donc rangés dans le profil de qui travaille (commun/profils.js), à côté
   de la disposition des panneaux, et non dans le .json du document.

     grille, accroche      pas d'accrochage et affichage de la grille
     nets                  étiquettes de net : 0 aucune · 1 nommées · 2 toutes
     liste, toutesFeuilles l'onglet du panneau de listes et sa portée

   Chargé APRÈS 17-demarrage.js : les valeurs d'usine sont déjà posées et la
   session d'onglet a déjà été reprise, on ne fait que remplacer. C'est aussi
   ce qui permet de ne rien enregistrer pendant le démarrage — profilNoter()
   se tait tant que profilAppliquer() n'a pas rendu la main.
   ============================================================================= */

const SCH_PROFIL="reglages:schema";
/* Faux pendant le démarrage et pendant un rétablissement : les setters
   appellent profilNoter(), et sans ce garde-fou les valeurs d'usine
   écraseraient le profil avant même qu'il soit relu. */
/* `var` et non `let` : dans la version un seul fichier (dist/), tous les
   modules partagent une seule portée, et init() tourne AVANT cette ligne.
   Une déclaration `let` serait alors dans sa zone morte et profilNoter()
   planterait au démarrage ; hoistée, la variable vaut undefined — donc
   faux, donc « on n'enregistre pas encore », ce qui est exactement la
   réponse voulue. */
var SCH_PROFIL_PRET=false;

/* Les valeurs d'usine, celles que pose 17-demarrage.js. Un utilisateur dont
   le profil ne dit rien ne doit pas hériter des réglages du précédent. */
const SCH_PROFIL_USINE={grille:G,accroche:true,nets:2,liste:"bom",
                        toutesFeuilles:{bom:false,nets:false}};

function profilEtat(){
  return {
    grille:S.grid,
    accroche:!!S.showGrid,
    nets:S.netLabels,
    liste:S.listTab,
    toutesFeuilles:{bom:!!S.bomAll, nets:!!S.netAll}
  };
}
function profilNoter(){
  if(!SCH_PROFIL_PRET||typeof profEcrire!=="function")return false;
  return profEcrire(SCH_PROFIL,profilEtat());
}
function profilAppliquer(){
  SCH_PROFIL_PRET=false;
  const lu=(typeof profLire==="function")?profLire(SCH_PROFIL):null;
  /* Ce que le profil ne dit pas, l'usine le dit : un réglage absent revient à
     sa valeur de départ, il ne reste pas sur celle de l'utilisateur d'avant. */
  const p=Object.assign({},SCH_PROFIL_USINE,(lu&&typeof lu==="object")?lu:{});
  /* Le pas de grille est posé directement plutôt que par setGridStep() :
     rétablir n'est pas un geste de l'utilisateur, et le pied de page peut
     porter un message qui compte — la reprise de la session, par exemple. */
  if(Number.isFinite(+p.grille)&&+p.grille>=1&&Math.round(+p.grille)!==S.grid){
    S.grid=Math.round(+p.grille);
    updateGridInfo();
  }
  buildGridMenu();
  if(typeof p.accroche==="boolean")setGrid(p.accroche);
  if([0,1,2].indexOf(+p.nets)>=0)setNetLabels(+p.nets);
  const tf=(p.toutesFeuilles&&typeof p.toutesFeuilles==="object")?p.toutesFeuilles:{};
  S.bomAll=!!tf.bom;
  S.netAll=!!tf.nets;
  document.getElementById("bomAll").checked=S.bomAll;
  document.getElementById("netAll").checked=S.netAll;
  setListTab(p.liste==="nets"?"nets":"bom");
  draw();
  SCH_PROFIL_PRET=true;
}

/* Changer d'utilisateur, ou voir arriver son fichier de profil après coup :
   les réglages de la barre d'outils suivent, comme les panneaux. */
if(typeof profSurChangement==="function")
  profSurChangement(profilAppliquer);
profilAppliquer();
