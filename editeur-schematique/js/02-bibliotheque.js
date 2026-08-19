/* =============================================================================
   editeur-schematique — 02-bibliotheque.js
   Bibliothèque de symboles (LIB) et catégories
   ============================================================================= */
"use strict";
/* ==========================================================================
   Bibliothèque de composants
   pins : [[x,y],...] en coordonnées locales (multiples de la grille)
   ========================================================================== */
const LIB = {
/* ---------------- passifs ---------------- */
resistor:{n:"Résistance",cat:"Passifs",p:"R",v:"10k",refIn:true,pk:"passif",pkg:"0603",pins:[[-40,0],[40,0]],
  d(c){L(c,-40,0,-22,0);L(c,22,0,40,0);RR(c,-22,-11,44,22,4,C_FILL);}},
potentiometer:{n:"Potentiomètre",cat:"Passifs",p:"RV",v:"10k",refIn:true,pk:"passif",pins:[[-40,0],[40,0],[0,-40]],
  d(c){L(c,-40,0,-22,0);L(c,22,0,40,0);RR(c,-22,-11,44,22,4,C_FILL);
       L(c,0,-40,0,-22);ARR(c,0,-16,Math.PI/2,10);}},
capacitor:{n:"Condensateur",cat:"Passifs",p:"C",v:"100n",pk:"passif",pkg:"0603",pins:[[-40,0],[40,0]],
  d(c){L(c,-40,0,-7,0);L(c,7,0,40,0);c.lineWidth=4.5;L(c,-7,-17,-7,17);L(c,7,-17,7,17);c.lineWidth=3;}},
cap_pol:{n:"Chimique",cat:"Passifs",p:"C",v:"470µ",pk:"passif",pins:[[-40,0],[40,0]],
  d(c){L(c,-40,0,-8,0);L(c,8,0,40,0);c.lineWidth=4.5;L(c,-8,-17,-8,17);c.lineWidth=3;
       c.beginPath();c.arc(28,0,22,Math.PI*0.72,Math.PI*1.28);c.stroke();
       TXT(c,"+",-20,-19,14,C_TXT);}},
inductor:{n:"Bobine",cat:"Passifs",p:"L",v:"10µH",pk:"passif",pkg:"0805",pins:[[-40,0],[40,0]],
  d(c){for(let i=0;i<4;i++){c.beginPath();c.arc(-30+i*20,0,10,Math.PI,0);c.stroke();}}},
transformer:{n:"Transfo",cat:"Passifs",p:"T",v:"1:1",ext:[-40,-32,40,32],pins:[[-40,-20],[-40,20],[40,-20],[40,20]],
  d(c){L(c,-40,-20,-22,-20);L(c,-40,20,-22,20);L(c,40,-20,22,-20);L(c,40,20,22,20);
       L(c,-22,-20,-22,-18);L(c,-22,20,-22,18);L(c,22,-20,22,-18);L(c,22,20,22,18);
       for(let i=0;i<3;i++){c.beginPath();c.arc(-22,-12+i*12,6,-Math.PI/2,Math.PI/2);c.stroke();
                            c.beginPath();c.arc(22,-12+i*12,6,Math.PI/2,-Math.PI/2);c.stroke();}
       L(c,-5,-24,-5,24);L(c,5,-24,5,24);}},
crystal:{n:"Quartz",cat:"Passifs",p:"Y",v:"8MHz",pk:"passif",pins:[[-40,0],[40,0]],
  d(c){L(c,-40,0,-12,0);L(c,12,0,40,0);L(c,-12,-16,-12,16);L(c,12,-16,12,16);
       RR(c,-5,-13,10,26,2,C_FILL);}},
fuse:{n:"Fusible",cat:"Passifs",p:"F",v:"1A",pk:"passif",pins:[[-40,0],[40,0]],
  d(c){L(c,-40,0,-24,0);L(c,24,0,40,0);RR(c,-24,-11,48,22,3,null);
       c.beginPath();c.moveTo(-24,0);c.quadraticCurveTo(-8,-12,0,0);c.quadraticCurveTo(8,12,24,0);c.stroke();}},
varistor:{n:"Varistance",cat:"Passifs",p:"V",v:"VAR",pk:"passif",pins:[[-40,0],[40,0]],
  d(c){L(c,-40,0,-22,0);L(c,22,0,40,0);RR(c,-22,-11,44,22,4,C_FILL);
       L(c,-28,16,14,-16);L(c,14,-16,22,-16);}},
filter:{n:"Filtre SAW",cat:"Passifs",p:"FLT",v:"SAW",pins:[[-40,0],[40,0],[0,40]],
  d(c){RR(c,-24,-20,48,40,3,C_FILL);L(c,-40,0,-24,0);L(c,40,0,24,0);L(c,0,40,0,20);
       c.beginPath();c.moveTo(-12,-6);c.quadraticCurveTo(-6,-14,0,-6);c.quadraticCurveTo(6,2,12,-6);c.stroke();
       c.beginPath();c.moveTo(-12,6);c.quadraticCurveTo(-6,-2,0,6);c.quadraticCurveTo(6,14,12,6);c.stroke();}},
/* ---------------- semi-conducteurs ---------------- */
diode:{n:"Diode",cat:"Semi-conducteurs",p:"D",v:"1N4148",pk:"diode",pins:[[-40,0],[40,0]],
  d(c){L(c,-40,0,-9,0);P(c,[[-9,-14],[-9,14],[9,0]],C_FILL);c.lineWidth=4.5;L(c,9,-14,9,14);c.lineWidth=3;L(c,9,0,40,0);}},
led:{n:"LED",cat:"Semi-conducteurs",p:"D",v:"LED",pk:"diode",pkg:"0805",ext:[-40,-38,40,18],pins:[[-40,0],[40,0]],
  d(c){L(c,-40,0,-9,0);P(c,[[-9,-14],[-9,14],[9,0]],C_FILL);c.lineWidth=4.5;L(c,9,-14,9,14);c.lineWidth=3;L(c,9,0,40,0);
       L(c,-2,-20,10,-32);ARR(c,12,-34,-Math.PI/4,8);L(c,8,-18,20,-30);ARR(c,22,-32,-Math.PI/4,8);}},
zener:{n:"Zener",cat:"Semi-conducteurs",p:"D",v:"5V1",pk:"diode",pins:[[-40,0],[40,0]],
  d(c){L(c,-40,0,-9,0);P(c,[[-9,-14],[-9,14],[9,0]],C_FILL);c.lineWidth=4.5;L(c,9,-14,9,14);c.lineWidth=3;
       L(c,9,-14,1,-20);L(c,9,14,17,20);L(c,9,0,40,0);}},
schottky:{n:"Schottky",cat:"Semi-conducteurs",p:"D",v:"SS34",pk:"diode",pkg:"SMA",pins:[[-40,0],[40,0]],
  d(c){L(c,-40,0,-9,0);P(c,[[-9,-14],[-9,14],[9,0]],C_FILL);c.lineWidth=4.5;L(c,9,-14,9,14);c.lineWidth=3;
       L(c,9,-14,1,-14);L(c,1,-14,1,-8);L(c,9,14,17,14);L(c,17,14,17,8);L(c,9,0,40,0);}},
npn:{n:"NPN",cat:"Semi-conducteurs",p:"Q",v:"MMBT5551",pk:"transistor",pkg:"SOT-23-3",pins:[[-40,0],[20,-40],[20,40]],
  d(c){L(c,-40,0,-2,0);c.lineWidth=4.5;L(c,-2,-24,-2,24);c.lineWidth=3;
       L(c,-2,-14,20,-32);L(c,20,-32,20,-40);
       L(c,-2,14,20,32);L(c,20,32,20,40);ARR(c,16,29,Math.atan2(32-14,20+2),10);}},
pnp:{n:"PNP",cat:"Semi-conducteurs",p:"Q",v:"MMBT5401",pk:"transistor",pkg:"SOT-23-3",pins:[[-40,0],[20,-40],[20,40]],
  d(c){L(c,-40,0,-2,0);c.lineWidth=4.5;L(c,-2,-24,-2,24);c.lineWidth=3;
       L(c,-2,-14,20,-32);L(c,20,-32,20,-40);
       L(c,-2,14,20,32);L(c,20,32,20,40);ARR(c,2,17,Math.atan2(-32+14,-20-2),10);}},
nmos:{n:"MOSFET N",cat:"Semi-conducteurs",p:"Q",v:"AO3400",pk:"transistor",pkg:"SOT-23-3",pins:[[-40,0],[20,-40],[20,40]],
  d(c){L(c,-40,0,-14,0);L(c,-14,-24,-14,24);
       L(c,-2,-24,-2,-10);L(c,-2,-7,-2,7);L(c,-2,10,-2,24);
       L(c,-2,-17,20,-17);L(c,20,-17,20,-40);
       L(c,-2,17,20,17);L(c,20,17,20,40);
       L(c,-2,0,20,0);ARR(c,2,0,Math.PI,10);}},
pmos:{n:"MOSFET P",cat:"Semi-conducteurs",p:"Q",v:"AO3401",pk:"transistor",pkg:"SOT-23-3",pins:[[-40,0],[20,-40],[20,40]],
  d(c){L(c,-40,0,-14,0);L(c,-14,-24,-14,24);
       L(c,-2,-24,-2,-10);L(c,-2,-7,-2,7);L(c,-2,10,-2,24);
       L(c,-2,-17,20,-17);L(c,20,-17,20,-40);
       L(c,-2,17,20,17);L(c,20,17,20,40);
       L(c,-2,0,20,0);ARR(c,16,0,0,10);}},
/* ---------------- intégrés ---------------- */
opamp:{n:"AOP",cat:"Intégrés",p:"U",v:"LM358",pk:"ci",pkg:"SOIC-8",pins:[[-40,-20],[-40,20],[60,0]],
  d(c){L(c,-40,-20,-20,-20);L(c,-40,20,-20,20);L(c,40,0,60,0);
       P(c,[[-20,-40],[-20,40],[40,0]],"rgba(47,134,204,.35)");
       TXT(c,"−",-8,-20,15,C_TXT);TXT(c,"+",-8,20,14,C_TXT);}},
ic:{n:"Circuit intégré",cat:"Intégrés",p:"U",v:"NE555",icon:"CI",valSelf:true,pk:"ci",
  pkg(el){return icAutoPkg(el);},
  tOff(el){const g=icGeom(el);return g.quad?g.hs+38:Math.max(34,-g.top+15);},
  init(el){el.npins=8;el.pinNames=[];el.icShape="dip";},
  pins(el){return icPins(el);},
  d(c,el){
    const g=icGeom(el), ps=icPins(el);
    if(g.quad){
      // corps carré, broches sur les quatre côtés, numérotation antihoraire
      RR(c,-g.hs,-g.hs,2*g.hs,2*g.hs,4,C_FILL);
      CIR(c,-g.hs+13,-g.hs+13,5,null);        // repère de la broche 1
      ps.forEach((p,i)=>{
        const t=String(i+1);
        if(p[0]===-g.d){L(c,-g.hs,p[1],p[0],p[1]);TXT(c,t,-g.hs+7,p[1],9.5,"#cfe6fb","left");}
        else if(p[0]===g.d){L(c,g.hs,p[1],p[0],p[1]);TXT(c,t,g.hs-7,p[1],9.5,"#cfe6fb","right");}
        else if(p[1]===-g.d){L(c,p[0],-g.hs,p[0],p[1]);TXT(c,t,p[0],-g.hs+11,9.5,"#cfe6fb");}
        else{L(c,p[0],g.hs,p[0],p[1]);TXT(c,t,p[0],g.hs-11,9.5,"#cfe6fb");}
      });
      TXT(c,String((el&&el.value)||"CI"),0,0,13,C_TXT);
      return;
    }
    RR(c,-40,g.top,80,g.h,4,C_FILL);
    c.beginPath();c.arc(0,g.top,9,0,Math.PI);c.stroke();
    ps.forEach((p,i)=>{
      const left=p[0]<0;
      L(c,left?-40:40,p[1],p[0],p[1]);
      TXT(c,String(i+1),left?-34:34,p[1],9.5,"#cfe6fb",left?"left":"right");
    });
    TXT(c,String((el&&el.value)||"CI"),0,g.mid,13,C_TXT);}},
regulator:{n:"Régulateur",cat:"Intégrés",p:"U",v:"AMS1117",valIn:true,pk:"regulateur",pkg:"SOT-223-4",pins:[[-60,0],[60,0],[0,60]],
  d(c){RR(c,-40,-26,80,52,4,C_FILL);L(c,-60,0,-40,0);L(c,40,0,60,0);L(c,0,26,0,60);}},
/* ---------------- alimentation ---------------- */
vcc:{n:"Alimentation",cat:"Alimentation",p:"#",v:"12V",noRef:true,pins:[[0,20]],
  d(c){c.strokeStyle=C_WIRE;c.lineWidth=3;L(c,0,20,0,-8);
       c.strokeStyle=C_RED;c.lineWidth=5;L(c,-19,-8,19,-8);
       c.lineWidth=3;c.strokeStyle=C_COMP;}},
gnd:{n:"Masse",cat:"Alimentation",p:"#",v:"GND",noRef:true,noVal:true,pins:[[0,-20]],
  d(c){c.strokeStyle=C_RED;L(c,0,-20,0,0);c.lineWidth=5;
       L(c,-18,2,18,2);L(c,-11,10,11,10);L(c,-4,18,4,18);c.lineWidth=3;c.strokeStyle=C_COMP;}},
port:{n:"Étiquette / net",cat:"Alimentation",p:"#",v:"EN",noRef:true,noVal:true,valSelf:true,ext:[-60,-16,20,16],pins:[[20,0]],
  d(c,el){L(c,8,0,20,0);P(c,[[-60,-14],[-8,-14],[6,0],[-8,14],[-60,14]],C_FILL);
       TXT(c,(el&&el.value)||"NET",-28,0,13,C_TXT);}},
/* Étiquette globale : même nom = même net sur TOUTES les feuilles. Double
   chevron pour la distinguer d'un œil de l'étiquette locale. */
gport:{n:"Étiquette globale",cat:"Alimentation",p:"#",v:"BUS",noRef:true,noVal:true,valSelf:true,
  propLabel:"Nom du net (toutes feuilles)",ext:[-78,-16,20,16],pins:[[20,0]],
  d(c,el){L(c,8,0,20,0);
       P(c,[[-72,0],[-58,-14],[-8,-14],[6,0],[-8,14],[-58,14]],C_GLOB);
       TXT(c,(el&&el.value)||"NET",-32,0,13,C_TXT);}},
battery:{n:"Pile",cat:"Alimentation",p:"BT",v:"9V",pins:[[0,-40],[0,40]],
  d(c){L(c,0,-40,0,-14);L(c,0,14,0,40);c.lineWidth=4.5;
       L(c,-18,-14,18,-14);L(c,-8,-6,8,-6);L(c,-18,2,18,2);L(c,-8,10,8,10);c.lineWidth=3;}},
acsource:{n:"Source AC",cat:"Alimentation",p:"V",v:"230V",pins:[[0,-40],[0,40]],
  d(c){L(c,0,-40,0,-20);L(c,0,20,0,40);CIR(c,0,0,20,null);
       c.beginPath();c.moveTo(-12,0);c.quadraticCurveTo(-6,-14,0,0);c.quadraticCurveTo(6,14,12,0);c.stroke();}},
/* ---------------- électromécanique & divers ---------------- */
"switch":{n:"Interrupteur",cat:"Divers",p:"SW",v:"SPST",pins:[[-40,0],[40,0]],
  d(c){L(c,-40,0,-20,0);L(c,20,0,40,0);CIR(c,-20,0,4,C_FILL);CIR(c,20,0,4,C_FILL);
       L(c,-18,-2,18,-20);}},
button:{n:"Bouton poussoir",cat:"Divers",p:"SW",v:"PUSH",ext:[-40,-30,40,12],pins:[[-40,0],[40,0]],
  d(c){L(c,-40,0,-20,0);L(c,-20,0,-20,-10);L(c,40,0,20,0);L(c,20,0,20,-10);
       L(c,-27,-12,27,-12);L(c,0,-12,0,-26);L(c,-12,-26,12,-26);}},
relay:{n:"Relais",cat:"Divers",p:"K",v:"5V",valIn:true,pk:"ci",tOff:64,
  pins:[[-60,-20],[-60,20],[60,-40],[60,0],[60,40]],
  d(c){RR(c,-40,-50,80,100,4,C_FILL);L(c,-60,-20,-40,-20);L(c,-60,20,-40,20);
       L(c,60,-40,40,-40);L(c,60,0,40,0);L(c,60,40,40,40);}},
motor:{n:"Moteur",cat:"Divers",p:"M",v:"DC",pins:[[0,-40],[0,40]],
  d(c){L(c,0,-40,0,-20);L(c,0,20,0,40);CIR(c,0,0,20,C_FILL);TXT(c,"M",0,1,15,C_TXT);}},
buzzer:{n:"Buzzer",cat:"Divers",p:"BZ",v:"5V",pins:[[-40,0],[40,0]],
  d(c){L(c,-40,0,-18,0);L(c,40,0,18,0);CIR(c,0,0,18,C_FILL);
       c.beginPath();c.arc(0,0,9,-Math.PI/2,Math.PI/2);c.stroke();}},
lamp:{n:"Lampe",cat:"Divers",p:"LA",v:"12V",pins:[[-40,0],[40,0]],
  d(c){L(c,-40,0,-18,0);L(c,40,0,18,0);CIR(c,0,0,18,null);
       L(c,-12,-12,12,12);L(c,-12,12,12,-12);}},
antenna:{n:"Antenne",cat:"Divers",p:"E",v:"ANT",ext:[-22,-32,22,40],pins:[[0,40]],
  d(c){L(c,0,40,0,-8);L(c,0,-8,-20,-30);L(c,0,-8,20,-30);}},
header:{n:"Connecteur 2",cat:"Divers",p:"J",v:"CONN",pins:[[-40,-20],[-40,20]],
  d(c){L(c,-40,-20,-14,-20);L(c,-40,20,-14,20);RR(c,-14,-34,30,68,3,C_FILL);
       c.fillStyle="#0f1012";c.fillRect(-8,-25,12,10);c.fillRect(-8,15,12,10);}},
testpoint:{n:"Point de test",cat:"Divers",p:"TP",v:"TP",noVal:true,pins:[[0,20]],
  d(c){L(c,0,20,0,4);CIR(c,0,-3,7,C_FILL);}},
hole:{n:"Trou mécanique",cat:"Divers",p:"MECA",v:"M3",noVal:true,pins:[[0,20]],
  d(c){c.lineWidth=3;CIR(c,0,0,12,null);
       c.beginPath();c.moveTo(-16,0);c.lineTo(-8,0);c.moveTo(8,0);c.lineTo(16,0);
       c.moveTo(0,-16);c.lineTo(0,-8);c.moveTo(0,8);c.lineTo(0,16);c.stroke();
       L(c,0,16,0,20);c.lineWidth=3;}},
fiducial:{n:"Mire",cat:"Divers",p:"M",v:"FID",noVal:true,pins:[],
  d(c){c.lineWidth=3;CIR(c,0,0,8,C_FILL);CIR(c,0,0,20,null);
       c.beginPath();c.moveTo(-28,0);c.lineTo(-14,0);c.moveTo(14,0);c.lineTo(28,0);
       c.moveTo(0,-28);c.lineTo(0,-14);c.moveTo(0,14);c.lineTo(0,28);c.stroke();c.lineWidth=3;}},
strap:{n:"Pont de soudure",cat:"Divers",p:"ST",v:"STRAP",pins:[[-20,0],[20,0]],
  d(c){L(c,-20,0,-12,0);L(c,20,0,12,0);
       c.beginPath();c.arc(-12,0,8,Math.PI/2,-Math.PI/2);c.stroke();
       c.beginPath();c.arc(12,0,8,-Math.PI/2,Math.PI/2);c.stroke();}},
/* ---------------- annotations ---------------- */
annot_volt:{n:"Tension",cat:"Annotations",p:"#",v:"3,30 V",noRef:true,noVal:true,flat:true,
  probe:true,                       // sonde : suit le point mesuré, ne tire pas les fils
  propLabel:"Tension mesurée",pins:[[0,20]],
  ext(el){const b=annotBox(el,13,9,6,"0 V");return [-b.w/2-2,-16,b.w/2+2,24];},
  d(c,el){const t=String((el&&el.value)||"0 V"), w=Math.max(46,textW(t,13,true)+18);
    c.strokeStyle=C_WIRE;c.lineWidth=2.5;L(c,0,20,0,13);
    c.lineWidth=2;RR(c,-w/2,-13,w,26,6,"#1b1d21");
    TXT(c,t,0,1,13,C_WIRE);
    const live=el&&Number.isFinite(el.x)&&netAtLive(el.x,el.y+20);
    c.fillStyle=live?C_RED:"#6b7280";      // gris = sonde en l'air
    c.beginPath();c.arc(0,20,3.6,0,Math.PI*2);c.fill();}},
annot_curr:{n:"Courant",cat:"Annotations",p:"#",v:"I = 120 mA",icon:"I = 1 A",noRef:true,noVal:true,flat:true,
  propLabel:"Courant annoté",pins:[],
  ext(el){const w=Math.max(62,textW((el&&el.value)||"I",13,true)+8);return [-w/2,-22,w/2,20];},
  d(c,el){const t=String((el&&el.value)||"I");
    c.strokeStyle=C_WIRE;c.lineWidth=2.5;L(c,-26,10,20,10);ARR(c,29,10,0,10,C_WIRE);
    TXT(c,t,0,-8,13,C_WIRE);}},
annot_text:{n:"Texte libre",cat:"Annotations",p:"#",v:"Texte",noRef:true,noVal:true,flat:true,
  propLabel:"Texte (| = nouvelle ligne)",pins:[],
  ext(el){const b=annotBox(el,13.5,8,6,"Texte");return [-b.w/2,-b.h/2,b.w/2,b.h/2];},
  d(c,el){const b=annotBox(el,13.5,8,6,"Texte");
    b.ls.forEach((ln,i)=>TXT(c,ln,0,(i-(b.ls.length-1)/2)*17.5,13.5,C_TXT));}},
annot_note:{n:"Note encadrée",cat:"Annotations",p:"#",v:"Étage de commande|Q3 sature à 3,3 V",icon:"Note",
  noRef:true,noVal:true,flat:true,propLabel:"Note (| = nouvelle ligne)",pins:[],
  ext(el){const b=annotBox(el,12.5,16,10,"Note");return [-b.w/2,-b.h/2,b.w/2,b.h/2];},
  d(c,el){const b=annotBox(el,12.5,16,10,"Note");
    c.strokeStyle="#3a3e46";c.lineWidth=1.5;RR(c,-b.w/2,-b.h/2,b.w,b.h,5,"#1b1d21");
    c.fillStyle=C_WIRE;c.fillRect(-b.w/2+1.5,-b.h/2+4,3,b.h-8);
    b.ls.forEach((ln,i)=>TXT(c,ln,-b.w/2+14,(i-(b.ls.length-1)/2)*16.5,12.5,"#dfe3ea","left"));}}
};
const CATS=["Passifs","Semi-conducteurs","Intégrés","Alimentation","Divers","Annotations"];
