"use strict";
/* =============================================================================
   visionneuse IPC-2581 — 00-espace-config.js
   Paramétrage de l'espace de travail commun (../commun/workspace.js).
   Ce fichier doit être chargé AVANT le module commun ; il ne contient que la
   clé de stockage local et la disposition d'usine des six panneaux.
   ============================================================================= */
const WS_CONFIG={
  key:"ipc2581.espace-travail.v1",
  layout:{
    docks:{dockL:230,dockR:330,dockB:180},
    /* Les couches à gauche : c'est le réglage qu'on touche le plus souvent, et
       il commande tout le reste de l'image. À droite, ce qu'on consulte : la
       carte elle-même, puis la sélection. Nets et composants au même endroit,
       repliés — ce sont deux longues listes, et on n'en cherche qu'une. */
    /* La simulation EM n'est pas dans le dock d'usine : elle ne répond qu'à
       une question qu'on se pose après avoir regardé la carte, jamais avant.
       Le bouton « Simulation EM… » de la barre d'outils l'ouvre, et le menu
       « Espace de travail » la liste comme les autres. Déclarée ici sans
       figurer dans `order`, elle démarre masquée ; `last` dit où elle ira. */
    order:{dockL:["couches"],dockR:["carte","detail"],dockB:["composants","nets"]},
    hidden:["sim","ia"],
    panels:{
      couches   :{grow:1,collapsed:false,x:80 ,y:140,w:250,h:520,last:"dockL"},
      carte     :{grow:1,collapsed:false,x:150,y:140,w:340,h:420,last:"dockR"},
      detail    :{grow:1,collapsed:false,x:190,y:200,w:340,h:380,last:"dockR"},
      composants:{grow:1,collapsed:false,x:220,y:260,w:520,h:320,last:"dockB"},
      nets      :{grow:1,collapsed:true ,x:260,y:300,w:520,h:320,last:"dockB"},
      sim       :{grow:1.3,collapsed:true,x:250,y:180,w:560,h:520,last:"dockR"},
      ia        :{grow:1.5,collapsed:false,x:250,y:140,w:440,h:580,last:"dockR"}
    }
  }
};
