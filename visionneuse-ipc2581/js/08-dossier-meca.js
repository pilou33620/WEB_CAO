"use strict";
/* ==========================================================================
   Visionneuse IPC-2581 — dossier mécanique
   --------------------------------------------------------------------------
   Le calcul et la feuille sont communs (commun/dossier-meca.js) ; les sorties
   PDF et DXF sont celles des plans de l'éditeur, chargées telles quelles
   (editeur-pcb/js/29, 33, 34 et la fonte). Ce fichier fournit ce qu'elles
   prennent ailleurs dans l'éditeur.
   ========================================================================== */

/* les mêmes que 01-core.js de l'éditeur, que la visionneuse ne charge pas */
const clamp=(v,a,b)=>v<a?a:(v>b?b:v);
const fmt=(v,n)=>Number(v).toFixed(n==null?2:n);
