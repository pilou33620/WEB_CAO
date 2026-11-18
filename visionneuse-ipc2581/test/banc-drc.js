"use strict";
/* =============================================================================
   visionneuse-ipc2581/test/banc-drc.js
   Le DRC de la visionneuse (js/12-drc.js) : une petite carte au format du
   modèle JSON est traduite en document pcbedit-1, puis jugée par le vrai
   runDrc() de l'éditeur (dist/pcb.js), sans navigateur.

       cargo run -p outils --bin build-monofichier -- editeur-pcb
       node visionneuse-ipc2581/test/banc-drc.js
   ============================================================================= */
const fs=require("fs"), path=require("path"), vm=require("vm");
const RACINE=path.join(__dirname,"..","..");
function verifier(c,m){ if(!c){ console.error("ÉCHEC : "+m); process.exit(1); } }

/* --- la visionneuse : 02-modele.js et 12-drc.js, sur des toiles factices --- */
const bac={console,Math,Map,Set,JSON,
  Path2D:class{moveTo(){}lineTo(){}arc(){}arcTo(){}rect(){}closePath(){}addPath(){}},
  localStorage:{getItem(){return null;},setItem(){},removeItem(){}}};
vm.createContext(bac);
for(const f of ["commun/echappe.js","commun/classes-interface.js","visionneuse-ipc2581/js/02-modele.js","visionneuse-ipc2581/js/12-drc.js"])
  vm.runInContext(fs.readFileSync(path.join(RACINE,f),"utf8"),bac,{filename:f});

/* Deux couches, un V à 45° sur NET1 (angle aigu), une piste NET2 à 0,05 mm de
   NET1 (isolation), un via, une résistance CMS dessus, un contour. Y en haut. */
const modele={unites:"MILLIMETER",couches:["TOP","BOTTOM"],
  empilage:[{nom:"TOP",seq:1,type:"CONDUCTOR"},{nom:"BOTTOM",seq:3,type:"CONDUCTOR"}],
  nets:["NET1","NET2"],
  pistes:[{c:0,n:0,w:0.2,p:[10,10, 20,10, 12,18]},
          {c:0,n:1,w:0.2,p:[10,10.25, 9,10.25]},
          {c:1,n:1,w:0.25,p:[30,10, 30,20]},
          // la capture : à 45° jusqu'au bord gauche de la pastille de U2, puis à plat dedans
          {c:0,n:1,w:0.25,p:[22,25, 27,30, 30,30]}],
  arcs:[],plans:[],textes:[],pads:[{x:30,y:20,ps:"V",n:1}],
  padstacks:{V:{pad:0.6,trou:0.3,pads:[{c:"TOP",f:"C6",d:0.6},{c:"BOTTOM",f:"C6",d:0.6}]},
             R:{pad:1,pads:[{c:"TOP",f:"R1",d:1}]},Q:{pad:6,pads:[{c:"TOP",f:"Q6",d:6}]}},
  formes:{C6:{t:"CIRCLE",d:0.6},R1:{t:"RECTCENTER",w:1,h:1.2},Q6:{t:"RECTCENTER",w:6,h:6}},formesuser:{},
  composants:[{ref:"R1",val:"10k",pkg:"0805",x:40,y:30,r:90,m:false,c:0,
               pads:[{x:-1,y:0,ps:"R",n:0,pin:"1"},{x:1,y:0,ps:"R",n:1,pin:"2"}]},
              {ref:"U2",val:"",pkg:"",x:30,y:30,r:0,m:false,c:0,pads:[{x:0,y:0,ps:"Q",n:1,pin:"1"}]}],
  percages:[{x:30,y:20,d:0.3,p:"PLATED",ps:"V"}],
  contour:{o:[0,0, 50,0, 50,40, 0,40]}};
bac.MODELE=modele;
vm.runInContext("mdlCharger(MODELE,'essai.xml');",bac);
const doc=vm.runInContext("drcDocPcb()",bac);

verifier(doc.cu===2,"deux cuivres");
verifier(doc.vias.length===1&&doc.vias[0].drill===0.3&&doc.vias[0].y===-20,"le via, en Y vers le bas");
const r1=doc.fps.find(f=>f.ref==="R1");
verifier(r1&&r1.pads.length===2&&r1.nets[1]==="NET1"&&r1.side===0,"R1 et ses nets");
verifier(Math.abs(r1.pads[0].x-40)<1e-9&&Math.abs(r1.pads[0].y+29)<1e-9,"pastille 1 de R1 au monde (rotation 90°)");
verifier(doc.board.pts.length===4,"le contour");

/* --- l'éditeur : son DRC, tel quel --- */
const bundle=path.join(RACINE,"editeur-pcb","dist","pcb.js");
if(!fs.existsSync(bundle)){ console.log("dist/pcb.js absent : traduction vérifiée, DRC non lancé."); process.exit(0); }
require(path.join(RACINE,"commun","test","dom-stub.js")).install({panels:{props:"Propriétés"},canvasId:"board"});
global.BroadcastChannel=function(){};
global.BroadcastChannel.prototype.postMessage=global.BroadcastChannel.prototype.close=function(){};
(0,eval)(fs.readFileSync(bundle,"utf8").replace(/^"use strict";/,"")+"\nglobalThis.__pcb={loadDoc,runDrc};");
__pcb.loadDoc(JSON.parse(JSON.stringify(doc)));
const msgs=__pcb.runDrc().map(e=>e.msg);
verifier(msgs.some(m=>/^Angle aigu de 45°/.test(m)),"angle aigu de 45° détecté\n"+msgs.join("\n"));
const pp=msgs.filter(m=>/^Angle aigu de \d+° entre la piste et la pastille/.test(m));
verifier(pp.length===1&&/^Angle aigu de 45° entre la piste et la pastille U2/.test(pp[0]),"angle aigu piste/pastille de 45° sur U2, et lui seul\n"+msgs.join("\n"));
verifier(msgs.some(m=>/^Isolation piste\/piste/.test(m)),"isolation NET1/NET2 détectée\n"+msgs.join("\n"));
console.log("banc-drc : OK ("+msgs.length+" écarts relevés par l'éditeur)");
process.exit(0);   // les minuteries de l'éditeur garderaient Node en vie
