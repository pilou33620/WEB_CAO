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
const C_COMP    = "#4fa8e8";
const C_FILL    = "#2f86cc";
const C_RED     = "#e8443a";
const C_TXT     = "#ffffff";
const C_SEL     = "#8af0ff";
const C_GLOB    = "#2a7d74";        // remplissage des étiquettes globales
const HANDLE    = 4.5;              // demi-côté des poignées de fil, en pixels écran

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
const _meas=document.createElement("canvas").getContext("2d");
function textW(t,size,bold){
  _meas.font=(bold?"bold ":"")+(size||12)+'px "Segoe UI",system-ui,sans-serif';
  return _meas.measureText(String(t)).width;
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
