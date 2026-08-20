"use strict";
/* =============================================================================
   recherche-composants — 00-espace-config.js
   Paramétrage de l'espace de travail commun (../commun/workspace.js).
   Ce fichier doit être chargé AVANT le module commun ; il ne contient que la
   clé de stockage local et la disposition d'usine des trois panneaux.
   ============================================================================= */
const WS_CONFIG={
  key:"recherche.espace-travail.v1",
  layout:{
    docks:{dockL:212,dockR:340,dockB:190},
    /* « Réponse brute » est replié dans le dock de droite : il ne consomme que
       la hauteur de son en-tête tant qu'on ne le déplie pas. */
    order:{dockL:["outils"],dockR:["details","brut"],dockB:[]},
    panels:{
      outils :{grow:1,collapsed:false,x:90 ,y:150,w:250,h:520,last:"dockL"},
      details:{grow:1,collapsed:false,x:150,y:150,w:340,h:520,last:"dockR"},
      brut   :{grow:1,collapsed:true ,x:190,y:230,w:520,h:300,last:"dockB"}
    }
  }
};
