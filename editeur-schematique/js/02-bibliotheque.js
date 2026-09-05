/* =============================================================================
   editeur-schematique — 02-bibliotheque.js
   Bibliothèque de symboles (LIB) et catégories

   Pas de dessin : G = 20 px = 1 mm.
     · les broches tombent sur le millimètre (multiples de 20) — c'est ce qui
       permet de câbler sans jamais rater une patte, quel que soit le pas
       d'accrochage choisi ;
     · les traits des corps tombent sur le quart de millimètre (multiples de 5),
       le demi-millimètre partout où c'est possible : un symbole posé sur la
       feuille s'inscrit alors dans le quadrillage au lieu de flotter entre deux
       lignes.
   Les épaisseurs de trait et les pointes de flèche, elles, ne sont pas des
   positions : elles restent réglées à l'œil.

   pins : [[x,y],...] en coordonnées locales
   ========================================================================== */
"use strict";
/* Arrondi au quart de millimètre — sert aux emprises calculées à partir d'une
   largeur de texte, qui n'a aucune raison de tomber juste. */
function q5(v){return (v<0?-1:1)*Math.ceil(Math.abs(v)/5)*5;}

const LIB = {
/* ---------------- passifs ---------------- */
resistor:{n:"Résistance",cat:"Passifs",p:"R",v:"10k",refIn:true,pk:"passif",pkg:"0603",pins:[[-40,0],[40,0]],
  d(c){L(c,-40,0,-20,0);L(c,20,0,40,0);RR(c,-20,-10,40,20,4,C_FILL);}},
potentiometer:{n:"Potentiomètre",cat:"Passifs",p:"RV",v:"10k",refIn:true,pk:"passif",pins:[[-40,0],[40,0],[0,-40]],
  d(c){L(c,-40,0,-20,0);L(c,20,0,40,0);RR(c,-20,-10,40,20,4,C_FILL);
       L(c,0,-40,0,-20);ARR(c,0,-15,Math.PI/2,10);}},
capacitor:{n:"Condensateur",cat:"Passifs",p:"C",v:"100n",pk:"passif",pkg:"0603",pins:[[-40,0],[40,0]],
  d(c){L(c,-40,0,-5,0);L(c,5,0,40,0);c.lineWidth=4.5;L(c,-5,-15,-5,15);L(c,5,-15,5,15);c.lineWidth=3;}},
cap_pol:{n:"Chimique",cat:"Passifs",p:"C",v:"470µ",pk:"passif",pins:[[-40,0],[40,0]],
  d(c){L(c,-40,0,-5,0);L(c,5,0,40,0);c.lineWidth=4.5;L(c,-5,-15,-5,15);c.lineWidth=3;
       c.beginPath();c.arc(25,0,20,Math.PI*0.72,Math.PI*1.28);c.stroke();
       TXT(c,"+",-20,-20,14,C_TXT);}},
inductor:{n:"Bobine",cat:"Passifs",p:"L",v:"10µH",pk:"passif",pkg:"0805",pins:[[-40,0],[40,0]],
  d(c){for(let i=0;i<4;i++){c.beginPath();c.arc(-30+i*20,0,10,Math.PI,0);c.stroke();}}},
transformer:{n:"Transfo",cat:"Passifs",p:"T",v:"1:1",ext:[-40,-30,40,30],pins:[[-40,-20],[-40,20],[40,-20],[40,20]],
  d(c){L(c,-40,-20,-20,-20);L(c,-40,20,-20,20);L(c,40,-20,20,-20);L(c,40,20,20,20);
       for(let i=0;i<3;i++){c.beginPath();c.arc(-20,-10+i*10,5,-Math.PI/2,Math.PI/2);c.stroke();
                            c.beginPath();c.arc(20,-10+i*10,5,Math.PI/2,-Math.PI/2);c.stroke();}
       L(c,-5,-25,-5,25);L(c,5,-25,5,25);}},
crystal:{n:"Quartz",cat:"Passifs",p:"Y",v:"8MHz",pk:"passif",pins:[[-40,0],[40,0]],
  d(c){L(c,-40,0,-10,0);L(c,10,0,40,0);L(c,-10,-15,-10,15);L(c,10,-15,10,15);
       RR(c,-5,-15,10,30,2,C_FILL);}},
fuse:{n:"Fusible",cat:"Passifs",p:"F",v:"1A",pk:"passif",pins:[[-40,0],[40,0]],
  d(c){L(c,-40,0,-25,0);L(c,25,0,40,0);RR(c,-25,-10,50,20,3,null);
       c.beginPath();c.moveTo(-25,0);c.quadraticCurveTo(-10,-12,0,0);c.quadraticCurveTo(10,12,25,0);c.stroke();}},
varistor:{n:"Varistance",cat:"Passifs",p:"V",v:"VAR",pk:"passif",pins:[[-40,0],[40,0]],
  d(c){L(c,-40,0,-20,0);L(c,20,0,40,0);RR(c,-20,-10,40,20,4,C_FILL);
       L(c,-25,15,15,-15);L(c,15,-15,25,-15);}},
filter:{n:"Filtre SAW",cat:"Passifs",p:"FLT",v:"SAW",pins:[[-40,0],[40,0],[0,40]],
  d(c){RR(c,-25,-20,50,40,3,C_FILL);L(c,-40,0,-25,0);L(c,40,0,25,0);L(c,0,40,0,20);
       c.beginPath();c.moveTo(-10,-5);c.quadraticCurveTo(-5,-15,0,-5);c.quadraticCurveTo(5,5,10,-5);c.stroke();
       c.beginPath();c.moveTo(-10,10);c.quadraticCurveTo(-5,0,0,10);c.quadraticCurveTo(5,20,10,10);c.stroke();}},
ferrite_bead:{n:"Perle de ferrite",cat:"Passifs",p:"FB",v:"120R",pk:"passif",pkg:"0805",pins:[[-40,0],[40,0]],
  d(c){L(c,-40,0,-18,0);L(c,18,0,40,0);RR(c,-18,-9,36,18,4,C_FILL);
       c.lineWidth=5;L(c,-14,0,14,0);c.lineWidth=3;
       c.beginPath();c.arc(-6,-9,4,0,Math.PI);c.stroke();
       c.beginPath();c.arc(6,-9,4,0,Math.PI);c.stroke();}},
/* ---------------- semi-conducteurs ---------------- */
diode:{n:"Diode",cat:"Semi-conducteurs",p:"D",v:"1N4148",pk:"diode",pins:[[-40,0],[40,0]],
  d(c){L(c,-40,0,-10,0);P(c,[[-10,-15],[-10,15],[10,0]],C_FILL);
       c.lineWidth=4.5;L(c,10,-15,10,15);c.lineWidth=3;L(c,10,0,40,0);}},
led:{n:"LED",cat:"Semi-conducteurs",p:"D",v:"LED",pk:"diode",pkg:"0805",ext:[-40,-40,40,20],pins:[[-40,0],[40,0]],
  d(c){L(c,-40,0,-10,0);P(c,[[-10,-15],[-10,15],[10,0]],C_FILL);
       c.lineWidth=4.5;L(c,10,-15,10,15);c.lineWidth=3;L(c,10,0,40,0);
       L(c,-5,-20,5,-30);ARR(c,7,-32,-Math.PI/4,8);
       L(c,5,-20,15,-30);ARR(c,17,-32,-Math.PI/4,8);}},
zener:{n:"Zener",cat:"Semi-conducteurs",p:"D",v:"5V1",pk:"diode",pins:[[-40,0],[40,0]],
  d(c){L(c,-40,0,-10,0);P(c,[[-10,-15],[-10,15],[10,0]],C_FILL);
       c.lineWidth=4.5;L(c,10,-15,10,15);c.lineWidth=3;
       L(c,10,-15,5,-20);L(c,10,15,15,20);L(c,10,0,40,0);}},
schottky:{n:"Schottky",cat:"Semi-conducteurs",p:"D",v:"SS34",pk:"diode",pkg:"SMA",pins:[[-40,0],[40,0]],
  d(c){L(c,-40,0,-10,0);P(c,[[-10,-15],[-10,15],[10,0]],C_FILL);
       c.lineWidth=4.5;L(c,10,-15,10,15);c.lineWidth=3;
       L(c,10,-15,5,-15);L(c,5,-15,5,-10);L(c,10,15,15,15);L(c,15,15,15,10);L(c,10,0,40,0);}},
npn:{n:"NPN",cat:"Semi-conducteurs",p:"Q",v:"MMBT5551",pk:"transistor",pkg:"SOT-23-3",pins:[[-40,0],[20,-40],[20,40]],
  d(c){L(c,-40,0,-5,0);c.lineWidth=4.5;L(c,-5,-25,-5,25);c.lineWidth=3;
       L(c,-5,-15,20,-30);L(c,20,-30,20,-40);
       L(c,-5,15,20,30);L(c,20,30,20,40);ARR(c,15,27,Math.atan2(30-15,20+5),10);}},
pnp:{n:"PNP",cat:"Semi-conducteurs",p:"Q",v:"MMBT5401",pk:"transistor",pkg:"SOT-23-3",pins:[[-40,0],[20,-40],[20,40]],
  d(c){L(c,-40,0,-5,0);c.lineWidth=4.5;L(c,-5,-25,-5,25);c.lineWidth=3;
       L(c,-5,-15,20,-30);L(c,20,-30,20,-40);
       L(c,-5,15,20,30);L(c,20,30,20,40);ARR(c,0,18,Math.atan2(-30+15,-20-5),10);}},
nmos:{n:"MOSFET N",cat:"Semi-conducteurs",p:"Q",v:"AO3400",pk:"transistor",pkg:"SOT-23-3",pins:[[-40,0],[20,-40],[20,40]],
  d(c){L(c,-40,0,-15,0);L(c,-15,-25,-15,25);
       L(c,-5,-25,-5,-10);L(c,-5,-5,-5,5);L(c,-5,10,-5,25);
       L(c,-5,-20,20,-20);L(c,20,-20,20,-40);
       L(c,-5,20,20,20);L(c,20,20,20,40);
       L(c,-5,0,20,0);ARR(c,0,0,Math.PI,10);}},
pmos:{n:"MOSFET P",cat:"Semi-conducteurs",p:"Q",v:"AO3401",pk:"transistor",pkg:"SOT-23-3",pins:[[-40,0],[20,-40],[20,40]],
  d(c){L(c,-40,0,-15,0);L(c,-15,-25,-15,25);
       L(c,-5,-25,-5,-10);L(c,-5,-5,-5,5);L(c,-5,10,-5,25);
       L(c,-5,-20,20,-20);L(c,20,-20,20,-40);
       L(c,-5,20,20,20);L(c,20,20,20,40);
       L(c,-5,0,20,0);ARR(c,15,0,0,10);}},
tvs_diode:{n:"Diode TVS",cat:"Semi-conducteurs",p:"D",v:"TVS",pk:"diode",pkg:"SOD-323",pins:[[-40,0],[40,0]],
  d(c){L(c,-40,0,-15,0);L(c,15,0,40,0);
       P(c,[[-15,-10],[-15,10],[-2,0]],C_FILL);
       P(c,[[15,-10],[15,10],[2,0]],C_FILL);
       L(c,-2,0,2,0);c.lineWidth=4.5;
       L(c,0,-12,0,12);L(c,-4,-12,0,-12);L(c,0,12,4,12);c.lineWidth=3;}},
esd_array:{n:"Réseau ESD",cat:"Semi-conducteurs",p:"U",v:"USBLC6",pk:"ci",pkg:"SOT-23-6",
  ext:[-40,-35,40,35],pins:[[-40,-20],[-40,0],[-40,20],[40,20],[40,0],[40,-20]],
  d(c){RR(c,-25,-30,50,60,4,C_FILL);
       L(c,-40,-20,-25,-20);L(c,-40,0,-25,0);L(c,-40,20,-25,20);
       L(c,40,-20,25,-20);L(c,40,0,25,0);L(c,40,20,25,20);
       TXT(c,"ESD",0,-8,11,C_TXT);TXT(c,"ARRAY",0,8,8,"#93c5fd");}},
/* ---------------- intégrés ---------------- */
opamp:{n:"AOP",cat:"Intégrés",p:"U",v:"LM358",pk:"ci",pkg:"SOIC-8",pins:[[-40,-20],[-40,20],[60,0],[0,-40],[0,40]],
  d(c){L(c,-40,-20,-20,-20);L(c,-40,20,-20,20);L(c,40,0,60,0);
       L(c,0,-40,0,-27);L(c,0,40,0,27);
       P(c,[[-20,-40],[-20,40],[40,0]],"rgba(47,134,204,.35)");
       TXT(c,"−",-10,-20,15,C_TXT);TXT(c,"+",-10,20,14,C_TXT);
       TXT(c,"V+",10,-32,8.5,C_TXT);TXT(c,"V−",10,32,8.5,C_TXT);}},
ic:{n:"Circuit intégré",cat:"Intégrés",p:"U",v:"NE555",icon:"CI",valSelf:true,pk:"ci",
  pkg(el){return icAutoPkg(el);},
  // le repère se pose au-dessus de tout, corps comme pattes du haut
  tOff(el){
    const b=icBodyOf(el);
    let top=b.y1;
    for(const p of icPins(el))top=Math.min(top,p[1]);
    return Math.max(34,-top+15);
  },
  init(el){el.npins=8;el.pinNames=[];el.icShape="dip";},
  pins(el){return icPins(el);},
  // le corps peut être plus large que les broches (noms longs) : la boîte de
  // sélection doit l'englober, sans quoi on ne peut plus attraper le symbole
  ext(el){const b=icBodyOf(el);return [b.x1,b.y1,b.x2,b.y2];},
  /* Un seul tracé pour les trois représentations : le corps est un rectangle,
     chaque broche sort du bord que lui désigne icSideOf(). Ce qui distingue les
     formes tient donc au seul calcul des positions (icPins), pas au dessin.

     Les noms s'écrivent dans le corps, à côté du numéro. Sur les côtés haut et
     bas, ils ne sont écrits que si la voisine est assez loin : deux noms
     horizontaux à un pas d'écart se chevaucheraient. Et la valeur ne s'imprime
     au centre que si les colonnes de noms lui laissent la place ; sinon elle
     descend sous le corps, où elle reste lisible. */
  d(c,el){
    const g=icGeom(el), ps=icPins(el), b=g.body;
    const cx=(b.x1+b.x2)/2;
    RR(c,b.x1,b.y1,b.x2-b.x1,b.y2-b.y1,4,C_FILL);
    // repère de la broche 1 : encoche en haut du rectangle, pastille dans le
    // coin du carré. En disposition libre, la broche 1 peut être n'importe où :
    // le repère de coin mentirait, et les numéros suffisent à s'y retrouver.
    if(g.shape==="dip"){c.beginPath();c.arc(cx,b.y1,10,0,Math.PI);c.stroke();}
    else if(g.shape==="quad")CIR(c,b.x1+15,b.y1+15,5,null);
    const sides=ps.map(p=>icSideOf(b,p));
    let wl=0,wr=0;
    ps.forEach((p,i)=>{
      const w=textW(icPinLabel(el,i,sides[i]),9.5,true);
      if(sides[i]==="L")wl=Math.max(wl,w);
      else if(sides[i]==="R")wr=Math.max(wr,w);
    });
    ps.forEach((p,i)=>{
      const side=sides[i], a=icLead(b,p,side);
      L(c,a[0],a[1],p[0],p[1]);
      const t=icPinLabel(el,i,side);
      if(side==="L")     TXT(c,t,b.x1+7,p[1],9.5,"#cfe6fb","left");
      else if(side==="R")TXT(c,t,b.x2-7,p[1],9.5,"#cfe6fb","right");
      else if(side==="T")TXT(c,t,p[0],b.y1+11,9.5,"#cfe6fb");
      else               TXT(c,t,p[0],b.y2-11,9.5,"#cfe6fb");
      const nm=(el&&el.pinNames&&el.pinNames[i])||"";
      const room=nm?icPinRoom(ps,sides,i):0;
      if(nm&&room>=Math.max(60,textW(nm,9,true)+8)){
        if(side==="T")TXT(c,nm,p[0],b.y1+23,9,"#cfe6fb");
        else if(side==="B")TXT(c,nm,p[0],b.y2-23,9,"#cfe6fb");
      }
    });
    const val=String((el&&el.value)||"CI");
    const room=(b.x2-b.x1)-wl-wr-18;
    if(textW(val,13,true)<=room)TXT(c,val,cx,g.mid,13,C_TXT);
    else TXT(c,val,cx,b.y2+17,13,C_TXT);}},
regulator:{n:"Régulateur",cat:"Intégrés",p:"U",v:"AMS1117",valIn:true,pk:"regulateur",pkg:"SOT-223-4",pins:[[-60,0],[60,0],[0,60]],
  d(c){RR(c,-40,-25,80,50,4,C_FILL);L(c,-60,0,-40,0);L(c,40,0,60,0);L(c,0,25,0,60);}},
/* ---------------- alimentation ---------------- */
vcc:{n:"Alimentation",cat:"Alimentation",p:"#",v:"12V",noRef:true,pins:[[0,20]],
  d(c){c.strokeStyle=C_WIRE;c.lineWidth=3;L(c,0,20,0,-10);
       c.strokeStyle=C_RED;c.lineWidth=5;L(c,-20,-10,20,-10);
       c.lineWidth=3;c.strokeStyle=C_COMP;}},
gnd:{n:"Masse",cat:"Alimentation",p:"#",v:"GND",noRef:true,noVal:true,pins:[[0,-20]],
  d(c){c.strokeStyle=C_RED;L(c,0,-20,0,0);c.lineWidth=5;
       L(c,-20,0,20,0);L(c,-10,5,10,5);L(c,-5,10,5,10);c.lineWidth=3;c.strokeStyle=C_COMP;}},
port:{n:"Étiquette / net",cat:"Alimentation",p:"#",v:"EN",noRef:true,noVal:true,valSelf:true,ext:[-60,-20,20,20],pins:[[20,0]],
  d(c,el){L(c,5,0,20,0);P(c,[[-60,-15],[-10,-15],[5,0],[-10,15],[-60,15]],C_FILL);
       TXT(c,(el&&el.value)||"NET",-30,0,13,C_TXT);}},
/* Étiquette globale : même nom = même net sur TOUTES les feuilles. Double
   chevron pour la distinguer d'un œil de l'étiquette locale. */
gport:{n:"Étiquette globale",cat:"Alimentation",p:"#",v:"BUS",noRef:true,noVal:true,valSelf:true,
  propLabel:"Nom du net (toutes feuilles)",ext:[-80,-20,20,20],pins:[[20,0]],
  d(c,el){L(c,5,0,20,0);
       P(c,[[-75,0],[-60,-15],[-10,-15],[5,0],[-10,15],[-60,15]],C_GLOB);
       TXT(c,(el&&el.value)||"NET",-32,0,13,C_TXT);}},
battery:{n:"Pile",cat:"Alimentation",p:"BT",v:"9V",pins:[[0,-40],[0,40]],
  d(c){L(c,0,-40,0,-15);L(c,0,15,0,40);c.lineWidth=4.5;
       L(c,-20,-15,20,-15);L(c,-10,-5,10,-5);L(c,-20,5,20,5);L(c,-10,15,10,15);c.lineWidth=3;}},
acsource:{n:"Source AC",cat:"Alimentation",p:"V",v:"230V",pins:[[0,-40],[0,40]],
  d(c){L(c,0,-40,0,-20);L(c,0,20,0,40);CIR(c,0,0,20,null);
       c.beginPath();c.moveTo(-10,0);c.quadraticCurveTo(-5,-15,0,0);c.quadraticCurveTo(5,15,10,0);c.stroke();}},
/* ---------------- électromécanique & divers ---------------- */
"switch":{n:"Interrupteur",cat:"Divers",p:"SW",v:"SPST",ext:[-40,-25,40,15],pins:[[-40,0],[40,0]],
  d(c){L(c,-40,0,-20,0);L(c,20,0,40,0);CIR(c,-20,0,5,C_FILL);CIR(c,20,0,5,C_FILL);
       L(c,-15,-5,20,-20);}},
button:{n:"Bouton poussoir",cat:"Divers",p:"SW",v:"PUSH",ext:[-40,-30,40,10],pins:[[-40,0],[40,0]],
  d(c){L(c,-40,0,-20,0);L(c,-20,0,-20,-10);L(c,40,0,20,0);L(c,20,0,20,-10);
       L(c,-25,-15,25,-15);L(c,0,-15,0,-25);L(c,-10,-25,10,-25);}},
relay:{n:"Relais",cat:"Divers",p:"K",v:"5V",valIn:true,pk:"ci",tOff:65,
  pins:[[-60,-20],[-60,20],[60,-40],[60,0],[60,40]],
  d(c){RR(c,-40,-50,80,100,4,C_FILL);L(c,-60,-20,-40,-20);L(c,-60,20,-40,20);
       L(c,60,-40,40,-40);L(c,60,0,40,0);L(c,60,40,40,40);}},
motor:{n:"Moteur",cat:"Divers",p:"M",v:"DC",pins:[[0,-40],[0,40]],
  d(c){L(c,0,-40,0,-20);L(c,0,20,0,40);CIR(c,0,0,20,C_FILL);TXT(c,"M",0,1,15,C_TXT);}},
buzzer:{n:"Buzzer",cat:"Divers",p:"BZ",v:"5V",pins:[[-40,0],[40,0]],
  d(c){L(c,-40,0,-20,0);L(c,40,0,20,0);CIR(c,0,0,20,C_FILL);
       c.beginPath();c.arc(0,0,10,-Math.PI/2,Math.PI/2);c.stroke();}},
lamp:{n:"Lampe",cat:"Divers",p:"LA",v:"12V",pins:[[-40,0],[40,0]],
  d(c){L(c,-40,0,-20,0);L(c,40,0,20,0);CIR(c,0,0,20,null);
       L(c,-15,-15,15,15);L(c,-15,15,15,-15);}},
antenna:{n:"Antenne",cat:"Divers",p:"E",v:"ANT",ext:[-25,-30,25,40],pins:[[0,40]],
  d(c){L(c,0,40,0,-10);L(c,0,-10,-20,-30);L(c,0,-10,20,-30);}},
header:{n:"Connecteur 2",cat:"Divers",p:"J",v:"CONN",pk:"header",pkg:"HEADER-2.54-1x2",ext:[-40,-35,20,35],pins:[[-40,-20],[-40,20]],
  d(c){L(c,-40,-20,-15,-20);L(c,-40,20,-15,20);RR(c,-15,-35,30,70,3,C_FILL);
       c.fillStyle="#0f1012";c.fillRect(-10,-25,10,10);c.fillRect(-10,15,10,10);}},
header_1x3:{n:"Barrette 1x3",cat:"Divers",p:"J",v:"CONN3",pk:"header",pkg:"HEADER-2.54-1x3",ext:[-40,-35,20,35],pins:[[-40,-20],[-40,0],[-40,20]],
  d(c){for(let y=-20;y<=20;y+=20)L(c,-40,y,-15,y);RR(c,-15,-35,30,70,3,C_FILL);
       c.fillStyle="#0f1012";for(let y=-20;y<=20;y+=20)c.fillRect(-10,y-5,10,10);}},
header_1x4:{n:"Barrette 1x4",cat:"Divers",p:"J",v:"CONN4",pk:"header",pkg:"HEADER-2.54-1x4",ext:[-40,-55,20,35],pins:[[-40,-40],[-40,-20],[-40,0],[-40,20]],
  d(c){for(let y=-40;y<=20;y+=20)L(c,-40,y,-15,y);RR(c,-15,-50,30,80,3,C_FILL);
       c.fillStyle="#0f1012";for(let y=-40;y<=20;y+=20)c.fillRect(-10,y-5,10,10);}},
header_1x6:{n:"Barrette 1x6",cat:"Divers",p:"J",v:"CONN6",pk:"header",pkg:"HEADER-2.54-1x6",ext:[-40,-75,20,55],pins:[[-40,-60],[-40,-40],[-40,-20],[-40,0],[-40,20],[-40,40]],
  d(c){for(let y=-60;y<=40;y+=20)L(c,-40,y,-15,y);RR(c,-15,-70,30,120,3,C_FILL);
       c.fillStyle="#0f1012";for(let y=-60;y<=40;y+=20)c.fillRect(-10,y-5,10,10);}},
header_1x8:{n:"Barrette 1x8",cat:"Divers",p:"J",v:"CONN8",pk:"header",pkg:"HEADER-2.54-1x8",ext:[-40,-95,20,75],pins:[[-40,-80],[-40,-60],[-40,-40],[-40,-20],[-40,0],[-40,20],[-40,40],[-40,60]],
  d(c){for(let y=-80;y<=60;y+=20)L(c,-40,y,-15,y);RR(c,-15,-90,30,160,3,C_FILL);
       c.fillStyle="#0f1012";for(let y=-80;y<=60;y+=20)c.fillRect(-10,y-5,10,10);}},
header_2x5:{n:"Barrette 2x5",cat:"Divers",p:"J",v:"CONN2x5",pk:"header",pkg:"HEADER-2.54-2x5",ext:[-40,-55,40,55],
  pins:[[-40,-40],[-40,-20],[-40,0],[-40,20],[-40,40],[40,-40],[40,-20],[40,0],[40,20],[40,40]],
  d(c){for(let y=-40;y<=40;y+=20){L(c,-40,y,-20,y);L(c,20,y,40,y);}RR(c,-20,-50,40,100,3,C_FILL);
       c.fillStyle="#0f1012";for(let y=-40;y<=40;y+=20){c.fillRect(-15,y-5,10,10);c.fillRect(5,y-5,10,10);}}},
usb_c_pwr:{n:"USB Type-C (Alim)",cat:"Divers",p:"J",v:"USB-C",pk:"usb",pkg:"USB-C-6P",ext:[-40,-55,30,55],
  pins:[[-40,-40],[-40,-20],[-40,0],[-40,20],[-40,40]],
  d(c){RR(c,-20,-50,45,100,6,C_FILL);for(let y=-40;y<=40;y+=20)L(c,-40,y,-20,y);
       TXT(c,"USB-C",5,-35,9,C_TXT);TXT(c,"PWR",5,-22,8,"#93c5fd");
       TXT(c,"VBUS",-15,-40,7.5,"#93c5fd","left");TXT(c,"GND",-15,-20,7.5,"#93c5fd","left");
       TXT(c,"CC1",-15,0,7.5,"#93c5fd","left");TXT(c,"CC2",-15,20,7.5,"#93c5fd","left");
       TXT(c,"SHLD",-15,40,7.5,"#93c5fd","left");}},
usb_c:{n:"USB Type-C",cat:"Divers",p:"J",v:"USB-C",pk:"usb",pkg:"USB-C-16P",ext:[-40,-75,35,95],
  pins:[[-40,-60],[-40,-40],[-40,-20],[-40,0],[-40,20],[-40,40],[-40,60],[-40,80]],
  d(c){RR(c,-20,-70,50,160,6,C_FILL);for(let y=-60;y<=80;y+=20)L(c,-40,y,-20,y);
       TXT(c,"USB-C",8,-55,9,C_TXT);
       TXT(c,"VBUS",-15,-60,7.5,"#93c5fd","left");TXT(c,"GND",-15,-40,7.5,"#93c5fd","left");
       TXT(c,"D+",-15,-20,7.5,"#93c5fd","left");TXT(c,"D−",-15,0,7.5,"#93c5fd","left");
       TXT(c,"CC1",-15,20,7.5,"#93c5fd","left");TXT(c,"CC2",-15,40,7.5,"#93c5fd","left");
       TXT(c,"SBU",-15,60,7.5,"#93c5fd","left");TXT(c,"SHLD",-15,80,7.5,"#93c5fd","left");}},
usb_micro:{n:"Micro-USB",cat:"Divers",p:"J",v:"MICRO-USB",pk:"usb",pkg:"MICRO-USB-B",ext:[-40,-55,30,75],
  pins:[[-40,-40],[-40,-20],[-40,0],[-40,20],[-40,40],[-40,60]],
  d(c){RR(c,-20,-50,45,120,6,C_FILL);for(let y=-40;y<=60;y+=20)L(c,-40,y,-20,y);
       TXT(c,"µUSB",5,-35,9,C_TXT);
       TXT(c,"VBUS",-15,-40,7.5,"#93c5fd","left");TXT(c,"D−",-15,-20,7.5,"#93c5fd","left");
       TXT(c,"D+",-15,0,7.5,"#93c5fd","left");TXT(c,"ID",-15,20,7.5,"#93c5fd","left");
       TXT(c,"GND",-15,40,7.5,"#93c5fd","left");TXT(c,"SHLD",-15,60,7.5,"#93c5fd","left");}},
testpoint:{n:"Point de test",cat:"Divers",p:"TP",v:"TP",noVal:true,pk:"testpoint",pins:[[0,20]],
  d(c){L(c,0,20,0,5);CIR(c,0,0,5,C_FILL);}},
testpoint_pth:{n:"Point de test percé",cat:"Divers",p:"TP",v:"TP",noVal:true,pk:"testpoint",
  pkg:"Trou metalise diam. trou 1.2mm - dim. plated 2.54mmx1.6mm",pins:[[0,20]],
  d(c){L(c,0,20,0,7);CIR(c,0,0,7,C_FILL);
       c.beginPath();c.arc(0,0,3,0,Math.PI*2);c.fillStyle=C_BG;c.fill();
       c.lineWidth=1.5;c.stroke();c.lineWidth=3;}},
hole:{n:"Trou mécanique",cat:"Divers",p:"MECA",v:"M3",noVal:true,pins:[[0,20]],
  d(c){CIR(c,0,0,10,null);
       c.beginPath();c.moveTo(-15,0);c.lineTo(-10,0);c.moveTo(10,0);c.lineTo(15,0);
       c.moveTo(0,-15);c.lineTo(0,-10);c.moveTo(0,10);c.lineTo(0,15);c.stroke();
       L(c,0,15,0,20);}},
fiducial:{n:"Mire",cat:"Divers",p:"M",v:"FID",noVal:true,ext:[-30,-30,30,30],pins:[],
  d(c){CIR(c,0,0,5,C_FILL);CIR(c,0,0,20,null);
       c.beginPath();c.moveTo(-30,0);c.lineTo(-15,0);c.moveTo(15,0);c.lineTo(30,0);
       c.moveTo(0,-30);c.lineTo(0,-15);c.moveTo(0,15);c.lineTo(0,30);c.stroke();}},
strap:{n:"Pont de soudure",cat:"Divers",p:"ST",v:"STRAP",ext:[-20,-10,20,10],pins:[[-20,0],[20,0]],
  d(c){L(c,-20,0,-10,0);L(c,20,0,10,0);
       c.beginPath();c.arc(-10,0,10,Math.PI/2,-Math.PI/2);c.stroke();
       c.beginPath();c.arc(10,0,10,-Math.PI/2,Math.PI/2);c.stroke();}},
/* ---------------- annotations ----------------
   Leur taille dépend du texte saisi : l'emprise est arrondie au quart de
   millimètre (q5) pour que la boîte de sélection reste dans le quadrillage. */
annot_volt:{n:"Tension",cat:"Annotations",p:"#",v:"3,30 V",noRef:true,noVal:true,flat:true,
  probe:true,                       // sonde : suit le point mesuré, ne tire pas les fils
  propLabel:"Tension mesurée",pins:[[0,20]],
  ext(el){const b=annotBox(el,13,9,6,"0 V");return [-q5(b.w/2+2),-15,q5(b.w/2+2),25];},
  d(c,el){const t=String((el&&el.value)||"0 V"), w=Math.max(50,q5(textW(t,13,true)+20));
    c.strokeStyle=C_WIRE;c.lineWidth=2.5;L(c,0,20,0,15);
    c.lineWidth=2;RR(c,-w/2,-15,w,30,6,"#1b1d21");
    TXT(c,t,0,0,13,C_WIRE);
    const live=el&&Number.isFinite(el.x)&&netAtLive(el.x,el.y+20);
    c.fillStyle=live?C_RED:"#6b7280";      // gris = sonde en l'air
    c.beginPath();c.arc(0,20,3.6,0,Math.PI*2);c.fill();}},
annot_curr:{n:"Courant",cat:"Annotations",p:"#",v:"I = 120 mA",icon:"I = 1 A",noRef:true,noVal:true,flat:true,
  propLabel:"Courant annoté",pins:[],
  ext(el){const h=Math.max(30,q5(textW((el&&el.value)||"I",13,true)/2+5));return [-h,-20,h,20];},
  d(c,el){const t=String((el&&el.value)||"I");
    c.strokeStyle=C_WIRE;c.lineWidth=2.5;L(c,-25,10,20,10);ARR(c,30,10,0,10,C_WIRE);
    TXT(c,t,0,-10,13,C_WIRE);}},
annot_text:{n:"Texte libre",cat:"Annotations",p:"#",v:"Texte",noRef:true,noVal:true,flat:true,
  propLabel:"Texte (| = nouvelle ligne)",pins:[],
  ext(el){const b=annotBox(el,13.5,8,6,"Texte");return [-q5(b.w/2),-q5(b.h/2),q5(b.w/2),q5(b.h/2)];},
  d(c,el){const b=annotBox(el,13.5,8,6,"Texte");
    b.ls.forEach((ln,i)=>TXT(c,ln,0,(i-(b.ls.length-1)/2)*17.5,13.5,C_TXT));}},
annot_note:{n:"Note encadrée",cat:"Annotations",p:"#",v:"Étage de commande|Q3 sature à 3,3 V",icon:"Note",
  noRef:true,noVal:true,flat:true,propLabel:"Note (| = nouvelle ligne)",pins:[],
  ext(el){const b=annotBox(el,12.5,16,10,"Note");return [-q5(b.w/2),-q5(b.h/2),q5(b.w/2),q5(b.h/2)];},
  d(c,el){const b=annotBox(el,12.5,16,10,"Note");
    const w=q5(b.w), h=q5(b.h);
    c.strokeStyle="#3a3e46";c.lineWidth=1.5;RR(c,-w/2,-h/2,w,h,5,"#1b1d21");
    c.fillStyle=C_WIRE;c.fillRect(-w/2+2,-h/2+5,3,h-10);
    b.ls.forEach((ln,i)=>TXT(c,ln,-w/2+14,(i-(b.ls.length-1)/2)*16.5,12.5,"#dfe3ea","left"));}}
};
const CATS=["Passifs","Semi-conducteurs","Intégrés","Alimentation","Divers","Annotations"];
