/* =============================================================================
   editeur-schematique — 17-demarrage.js
   Démarrage de l'application
   ============================================================================= */
"use strict";
/* ==========================================================================
   Démarrage
   ========================================================================== */
buildPalette();
const PROJ_ACTIF=(typeof projNom==="function")?projNom():"";
if(PROJ_ACTIF){
  // NOUVEAU PROJET : pas de schématique exemple !
  // La première feuille est la feuille hiérarchique racine, suivie d'une première feuille de schématique vierge.
  S.pages=[newHierPage("Hiérarchie"),newPage("Feuille 1")];
  loadPage(0);
  S.pages[0].viewed=true;
  S.dirty=false;
}else{
  // SANS PROJET : on charge la schématique exemple (démo)
  S.pages=[newHierPage("Hiérarchie"),newPage("Commande NPN"),newPage("Alimentation")];
  loadPage(2);demo2();touchWires();resolveSplits();storeCurrent();
  loadPage(1);demo();touchWires();resolveSplits();storeCurrent();
  loadPage(0); // ouvre sur la feuille hiérarchique racine
  S.pages[0].viewed=true;
  S.dirty=false;
}
buildTabs();
setMode("select");
setGrid(true);
buildGridMenu();
setNetLabels(S.netLabels);
setListTab("bom");
window.addEventListener("resize",resize);
resize();
fit();
refreshPanels();
S.dirty=false;
/* Deux filets, dans cet ordre. La session d'onglet d'abord : elle vient du
   même travail, poursuivi il y a quelques secondes dans un autre outil, et
   se reprend sans rien demander. À défaut seulement, la sauvegarde
   automatique du navigateur, qui elle peut dater et demande confirmation. */
const SCH_REPRISE=sessionSchema();
if(!SCH_REPRISE)
  restoreBackup();          // propose de reprendre la session précédente si elle existe

/* Troisième filet, et le plus solide : le dossier du projet. Les deux premiers
   sont des filets de rattrapage (l'onglet, le navigateur) ; celui-ci est un
   vrai fichier sur le disque.
   Il vient en dernier parce qu'il est le plus ancien des trois : la session
   porte le travail de la minute qui précède, le fichier celui de la dernière
   fois qu'on a enregistré. Et il ne remplace jamais un travail non enregistré.
   Le rattachement est asynchrone (projet-disque.js), d'où l'abonnement. */
let SCH_PROJET_LU=false;
function schChargerProjet(){
  if(SCH_PROJET_LU||SCH_REPRISE||S.dirty)return;
  if(typeof projdLie!=="function")return;
  /* Le dossier est retrouvé mais le navigateur redemande l'autorisation, et
     une demande sans geste de l'utilisateur échoue. Ici il n'y a pas de geste
     à offrir : on le dit, plutôt que de laisser croire à un dossier vide. */
  if(!projdLie()){
    const a=(typeof projdAReconnecter==="function")?projdAReconnecter():"";
    if(a){
      const h=document.getElementById("fHint");
      if(h)h.textContent="Dossier « "+a+" » à rouvrir : passez par l'accueil, "
        +"le travail en cours reste dans l'onglet.";
    }
    return;
  }
  SCH_PROJET_LU=true;
  projdDocLire("schema").then(function(d){
    if(!d)return;            // dossier sans schéma : il n'y a rien à reprendre
    if(S.dirty)return;       // travail commencé pendant la lecture : on n'écrase pas
    loadDoc(d);
    S.dirty=false;
    const h=document.getElementById("fHint");
    if(h)h.textContent="Schéma chargé depuis le dossier du projet.";
    /* La cible du cross-probing n'a pu être reprise au démarrage (21-reperage.js,
       juste après cette page) que si la session d'onglet avait déjà un schéma :
       un schéma lu APRÈS coup, comme ici, doit retenter une fois chargé. */
    if(typeof sessCibleAuChargement==="function")
      sessCibleAuChargement(schSonderCible);
  }).catch(function(e){
    SCH_PROJET_LU=false;     // un échec ne condamne pas les essais suivants
    const h=document.getElementById("fHint");
    if(h)h.textContent="Schéma du projet illisible : "+e.message;
  });
}
try{ projSurChangement(schChargerProjet); }catch(_){}
schChargerProjet();
