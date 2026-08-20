/* =============================================================================
   editeur-schematique — 17-demarrage.js
   Démarrage de l'application
   ============================================================================= */
"use strict";
/* ==========================================================================
   Démarrage
   ========================================================================== */
buildPalette();
S.pages=[newPage("Commande NPN"),newPage("Alimentation")];
loadPage(1);demo2();touchWires();resolveSplits();storeCurrent();
loadPage(0);demo();touchWires();resolveSplits();storeCurrent();
S.pages[0].viewed=true;
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
S.dirty=false;              // le schéma de démonstration n'est pas un travail à protéger
restoreBackup();            // propose de reprendre la session précédente si elle existe
