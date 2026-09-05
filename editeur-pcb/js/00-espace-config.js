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
    /* Les règles de conception et les paires différentielles n'ont plus de
       panneau : elles vivent dans la fenêtre « Règles et contraintes », que le
       bouton « Règles… » de la barre d'outils ouvre. Le dock ne garde que ce
       qu'on regarde EN ROUTANT — l'empilage, les propriétés, les listes. */
    /* La simulation EM n'est PAS dans le dock d'usine, et c'est voulu : ce
       dock ne garde que ce qu'on regarde en routant. Analyser un net est un
       autre geste, qu'on fait la piste posée — le bouton « Simulation EM… »
       de la barre d'outils ouvre le panneau, et le menu « Espace de travail »
       le liste comme les autres. Un panneau déclaré ici sans figurer dans
       `order` démarre masqué : c'est `last` qui dit où il ira. */
    order:{dockL:["stack"],dockR:["props","list","stackup"],dockB:[]},
    hidden:["sim","ia","placement"],
    panels:{
      stack:{grow:1  ,collapsed:false,x:90 ,y:150,w:250,h:300,last:"dockL"},
      props:{grow:1.2,collapsed:false,x:150,y:150,w:300,h:400,last:"dockR"},
      list :{grow:1  ,collapsed:false,x:190,y:230,w:420,h:340,last:"dockR"},
      placement:{grow:1.2,collapsed:false,x:200,y:160,w:330,h:420,last:"dockR"},
      stackup:{grow:1.4,collapsed:false,x:220,y:120,w:560,h:560,last:"dockR"},
      sim  :{grow:1.3,collapsed:true ,x:250,y:180,w:560,h:520,last:"dockR"},
      ia   :{grow:1.5,collapsed:false,x:250,y:140,w:440,h:580,last:"dockR"}
    }
  }
};
