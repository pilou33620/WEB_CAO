"use strict";
/* =============================================================================
   editeur-pcb — 00-espace-config.js
   Paramétrage de l'espace de travail commun (../commun/workspace.js).
   Ce fichier doit être chargé AVANT le module commun ; il ne contient que ce
   qui distingue le PCB du schématique : la clé de stockage local et la
   disposition d'usine des panneaux.
   ============================================================================= */
const WS_CONFIG={
  key:"pcb.espace-travail.v1",
  layout:{
    docks:{dockL:212,dockR:330,dockB:200},
    order:{dockL:["stack","rules"],dockR:["props","list","stackup","dpair"],dockB:[]},
    panels:{
      stack:{grow:1  ,collapsed:false,x:90 ,y:150,w:250,h:300,last:"dockL"},
      rules:{grow:1.5,collapsed:false,x:120,y:190,w:280,h:360,last:"dockL"},
      props:{grow:1.2,collapsed:false,x:150,y:150,w:300,h:400,last:"dockR"},
      list :{grow:1  ,collapsed:false,x:190,y:230,w:420,h:340,last:"dockR"},
      stackup:{grow:1.4,collapsed:false,x:220,y:120,w:560,h:560,last:"dockR"},
      /* Replié au démarrage : le panneau est long, et une carte sur deux n'a
         pas une seule paire différentielle. Son entête reste visible dans le
         dock — un clic sur ▾ le déplie — et la disposition, une fois touchée,
         se garde d'une séance à l'autre. */
      dpair:{grow:1.4,collapsed:true ,x:250,y:140,w:520,h:620,last:"dockR"}
    }
  }
};
