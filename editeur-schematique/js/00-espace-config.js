"use strict";
/* =============================================================================
   editeur-schematique — 00-espace-config.js
   Paramétrage de l'espace de travail commun (../commun/workspace.js).
   Ce fichier doit être chargé AVANT le module commun ; il ne contient que ce
   qui distingue le schématique du PCB : la clé de stockage local et la
   disposition d'usine des panneaux.
   ============================================================================= */
const WS_CONFIG={
  key:"schema.espace-travail.v1",
  layout:{
    docks:{dockL:212,dockR:278,dockB:200},
    order:{dockL:["palette"],dockR:["props","list"],dockB:[]},
    hidden:["ia"],
    panels:{
      palette:{grow:1  ,collapsed:false,x:90 ,y:150,w:250,h:600,last:"dockL"},
      props  :{grow:1.2,collapsed:false,x:150,y:150,w:300,h:400,last:"dockR"},
      list   :{grow:1  ,collapsed:false,x:190,y:230,w:420,h:340,last:"dockR"},
      ia     :{grow:1.5,collapsed:false,x:240,y:140,w:420,h:580,last:"dockR"}
    }
  }
};
