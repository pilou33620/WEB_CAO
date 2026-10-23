"use strict";
/* =============================================================================
   commun/cartouche.js
   Cadre de page et cartouche, A4 ou A3 paysage, sur une feuille du schéma et
   autour de la carte du PCB. Tout se dessine dans le repère du monde de
   l'éditeur : `u` y vaut un millimètre (schéma : la grille de 20 unités fait
   0,1 pouce ; PCB : 1). Le titre, la révision et l'auteur sont ceux du projet
   (commun/projet.js, commun/projet-disque.js).
   ============================================================================= */
const CARTOUCHE_FORMATS={A4:{w:297,h:210},A3:{w:420,h:297}};
const CARTOUCHE_COULEURS={trait:"#6b7280",texte:"#cbd5e1",etiquette:"#7c8594"};

/* Au clic : aucun → A4 → A3 → aucun */
function cartoucheSuivant(f){return f==="A4"?"A3":f==="A3"?"":"A4";}

function cartoucheChamps(feuille,numero){
  const lu=fn=>{try{return typeof fn==="function"?String(fn()||""):"";}catch(_){return "";}};
  return {
    titre:lu(typeof projNom==="function"?projNom:null)||"Sans projet",
    feuille:feuille||"",
    numero:numero||"",
    rev:lu(typeof projdRevision==="function"?projdRevision:null)||"A",
    auteur:lu(typeof projdAuteur==="function"?projdAuteur:null),
    date:new Date().toLocaleDateString("fr-FR")
  };
}

/* Cadre à 10 mm du bord de la page ; cartouche de 120 × 24 mm dans le coin bas
   droit, en trois rangées : titre ; feuille | révision ; auteur | date |
   format | numéro. (x0, y0) : coin haut gauche de la page. */
function cartoucheDessiner(c,x0,y0,u,format,ch){
  const F=CARTOUCHE_FORMATS[format];
  if(!F)return;
  const K=CARTOUCHE_COULEURS, m=10*u, W=F.w*u, H=F.h*u;
  const bw=120*u, bx=x0+W-m-bw, by=y0+H-m-24*u, r1=by+10*u, r2=r1+7*u, bas=by+24*u;
  const trait=(xa,ya,xb,yb)=>{c.beginPath();c.moveTo(xa,ya);c.lineTo(xb,yb);c.stroke();};
  /* une case : étiquette grise en haut, valeur dessous, tassée à la largeur */
  const kase=(xa,xb,ya,yb,etiq,val,pt)=>{
    c.fillStyle=K.etiquette;c.font=(1.8*u)+"px sans-serif";
    c.fillText(etiq,xa+1.2*u,ya+2.3*u);
    c.fillStyle=K.texte;c.font="bold "+(pt*u)+"px sans-serif";
    c.fillText(val,xa+1.2*u,yb-1.4*u,Math.max(u,xb-xa-2.4*u));
  };
  c.save();
  c.strokeStyle=K.trait;c.textAlign="left";c.textBaseline="alphabetic";
  c.lineWidth=0.25*u;c.strokeRect(x0,y0,W,H);                  // bord de la page
  c.lineWidth=0.6*u;c.strokeRect(x0+m,y0+m,W-2*m,H-2*m);       // cadre
  c.strokeRect(bx,by,bw,24*u);
  c.lineWidth=0.3*u;
  trait(bx,r1,bx+bw,r1);trait(bx,r2,bx+bw,r2);
  trait(bx+90*u,r1,bx+90*u,r2);
  for(const x of [45,75,95])trait(bx+x*u,r2,bx+x*u,bas);
  kase(bx,bx+bw,by,r1,"Titre",ch.titre,4.2);
  kase(bx,bx+90*u,r1,r2,"Feuille",ch.feuille,2.8);
  kase(bx+90*u,bx+bw,r1,r2,"Révision",ch.rev,2.8);
  kase(bx,bx+45*u,r2,bas,"Auteur",ch.auteur||"—",2.8);
  kase(bx+45*u,bx+75*u,r2,bas,"Date",ch.date,2.8);
  kase(bx+75*u,bx+95*u,r2,bas,"Format",format,2.8);
  kase(bx+95*u,bx+bw,r2,bas,"N°",ch.numero,2.8);
  c.restore();
}
