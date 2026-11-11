/* =============================================================================
   editeur-schematique — 01-noyau.js
   Constantes de style + helpers de dessin
   ============================================================================= */
"use strict";
/* ==========================================================================
   Constantes de style — reprises du schéma de référence
   ========================================================================== */
const G = 20;                       // pas de grille (px monde)
const C_BG      = "#141416";
const C_GRID    = "#232529";
const C_GRIDMAJ = "#32353c";
const C_WIRE    = "#f2c744";
const C_BUS     = "#00c4df";        // couleur des bus de signaux
const BUS_WIDTH = 6.5;              // largeur de tracé des bus (contre 3.4 pour un fil)
const C_COMP    = "#4fa8e8";
const C_FILL    = "#2f86cc";
const C_RED     = "#e8443a";
const C_TXT     = "#ffffff";
const C_SEL     = "#8af0ff";
const C_GLOB    = "#2a7d74";        // remplissage des étiquettes globales
const HANDLE    = 4.5;              // demi-côté des poignées de fil, en pixels écran
/* Tri français « naturel » (R2 avant R10). Un seul Intl.Collator : appeler
   localeCompare(…, "fr", {numeric:true}) à chaque comparaison en recrée un, et
   un schéma de 5 000 composants passait 13 s à trier ses nets. */
const triFr = new Intl.Collator("fr", {numeric:true}).compare;

/* ==========================================================================
   Helpers de dessin (coordonnées locales du composant)
   ========================================================================== */
function L(c,x1,y1,x2,y2){c.beginPath();c.moveTo(x1,y1);c.lineTo(x2,y2);c.stroke();}
function P(c,pts,fill){
  c.beginPath();c.moveTo(pts[0][0],pts[0][1]);
  for(let i=1;i<pts.length;i++)c.lineTo(pts[i][0],pts[i][1]);
  c.closePath();
  if(fill){c.fillStyle=fill;c.fill();}
  c.stroke();
}
function RR(c,x,y,w,h,r,fill){
  c.beginPath();
  c.moveTo(x+r,y);c.arcTo(x+w,y,x+w,y+h,r);c.arcTo(x+w,y+h,x,y+h,r);
  c.arcTo(x,y+h,x,y,r);c.arcTo(x,y,x+w,y,r);c.closePath();
  if(fill){c.fillStyle=fill;c.fill();}
  c.stroke();
}
function CIR(c,x,y,r,fill){
  c.beginPath();c.arc(x,y,r,0,Math.PI*2);
  if(fill){c.fillStyle=fill;c.fill();}
  c.stroke();
}
function ARR(c,x,y,ang,s,col){ // pointe de flèche pleine
  const a=ang,d=s||9;
  c.save();c.translate(x,y);c.rotate(a);
  c.beginPath();c.moveTo(0,0);c.lineTo(-d,-d*0.42);c.lineTo(-d,d*0.42);c.closePath();
  c.fillStyle=col||C_COMP;c.fill();c.restore();
}
/* LA LARGEUR D'UN TEXTE DIMENSIONNE LES SYMBOLES (un CI s'élargit pour loger
   sa valeur et le nom de ses broches), donc elle place les broches : elle ne
   doit pas dépendre de la police de la machine. Mesurée par measureText, une
   police plus large (autre poste, iPad) écartait les broches et décrochait des
   fils dessinés ailleurs. Table fixe : chasses Helvetica / Helvetica-Bold (AFM
   Adobe, millièmes de cadratin) ; le texte, lui, reste dessiné dans la vraie
   police et peut déborder un peu. */
const _CHASSE=" !\"#$%&'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~";
const _CH_N=[278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,
  667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,333,
  556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584];
const _CH_G=[278,333,474,556,556,889,722,238,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,333,333,584,584,584,611,975,
  722,722,722,722,667,611,778,722,278,556,722,611,833,722,778,667,778,722,667,611,722,667,944,667,667,611,333,278,333,584,556,333,
  556,611,556,611,556,333,611,611,278,278,556,278,889,611,611,611,611,389,556,333,611,556,778,556,556,500,389,280,389,584];
const _measCache=new Map();
function textW(t,size,bold){
  const k=(bold?"b":"n")+(size||12)+"\u0000"+t;
  let w=_measCache.get(k);
  if(w!==undefined)return w;
  const tab=bold?_CH_G:_CH_N;
  let m=0;
  // une lettre accentuée prend la chasse de sa lettre de base ; le reste, 600
  for(const ch of String(t).normalize("NFD")){
    if(/[\u0300-\u036f]/.test(ch))continue;
    const i=_CHASSE.indexOf(ch);
    m+=i>=0?tab[i]:600;
  }
  w=m*(size||12)/1000;
  if(_measCache.size>4000)_measCache.clear();
  _measCache.set(k,w);
  return w;
}
// « | » sépare les lignes d'une annotation
function annotBox(el,size,padX,padY,fallback){
  const ls=String((el&&el.value)||fallback||"").split("|");
  let w=0;ls.forEach(l=>{w=Math.max(w,textW(l,size,true));});
  return {ls,w:w+padX*2,h:ls.length*(size+4)+padY*2};
}
/* Orientation du symbole en cours de tracé. Les textes internes (valeur d'une
   étiquette, numéros de broches d'un CI, « + » d'un chimique…) s'écrivent dans
   le repère du symbole : sans correction, un miroir les rend illisibles à
   l'envers et une rotation de 180° les met la tête en bas. */
let _symT=null;
/* TVS d'un réseau ESD, verticale entre VCC (cathode) et GND */
function ESDTVS(c){L(c,0,-40,0,-8);L(c,0,8,0,40);P(c,[[-7,8],[7,8],[0,-6]],C_TXT);
  L(c,-7,-6,7,-6);L(c,-7,-6,-9,-3);L(c,7,-6,9,-9);}
function TXT(c,t,x,y,size,col,align){
  c.save();c.fillStyle=col||C_TXT;
  c.font="bold "+(size||12)+'px "Segoe UI",system-ui,sans-serif';
  c.textAlign=align||"center";c.textBaseline="middle";
  if(_symT&&(_symT.mir||_symT.rot%360)){
    // on annule le miroir, et on ramène l'angle à 0° ou 90° : les deux seules
    // orientations lisibles, comme dans les outils du métier
    const rot=((_symT.rot%360)+360)%360;
    c.translate(x,y);
    if(_symT.mir)c.scale(-1,1);
    c.rotate((rot%180-rot)*Math.PI/180);
    c.fillText(t,0,0);
  }else{
    c.fillText(t,x,y);
  }
  c.restore();
}
