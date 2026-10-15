"use strict";
/* ==========================================================================
   Visionneuse IPC-2581 — dossier mécanique
   --------------------------------------------------------------------------
   Le calcul et la feuille sont communs (commun/dossier-meca.js) ; les sorties
   PDF et DXF sont celles des plans de l'éditeur, chargées telles quelles
   (editeur-pcb/js/29, 33, 34 et la fonte). Ce fichier fournit ce qu'elles
   prennent ailleurs dans l'éditeur.
   ========================================================================== */

/* les mêmes que 01-core.js de l'éditeur, que la visionneuse ne charge pas */
const clamp=(v,a,b)=>v<a?a:(v>b?b:v);
const fmt=(v,n)=>Number(v).toFixed(n==null?2:n);

/* L'entrée neutre du dossier (commun/dossier-meca.js) tirée du modèle lu. Le
   fichier est déjà dans le repère des Gerber (Y vers le haut, son origine) ;
   tout passe en millimètres. */
function mecaEntreeIpc(m){
  const k=/INCH/i.test(m.unites||"")?25.4:1;
  const pts=o=>{const P=[];for(let i=0;i+1<(o||[]).length;i+=2)P.push({x:o[i]*k,y:o[i+1]*k});return P;};
  const ct=m.contour||{};
  let ep=(+m.epaisseur||0)*k;
  if(!(ep>0))ep=(m.empilage||[]).reduce((a,c)=>a+(+c.ep||0),0)*k;
  const npth=(m.percages||[]).filter(t=>t.d>0&&/NON/i.test(t.p||""));
  const pres=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y)<1e-3;

  const composants=(m.composants||[]).map(c=>{
    const place=(x,y)=>{const q=mdlPlacer(x,y,c.x,c.y,c.r,!!c.m);return {x:q.x*k,y:q.y*k};};
    const L=(V.couches||[])[c.c];
    let corps=[], estime=false;
    if(Array.isArray(c.corps)&&c.corps.length>=6){
      for(let i=0;i+1<c.corps.length;i+=2)corps.push(place(c.corps[i],c.corps[i+1]));
      const a=corps[0], z=corps[corps.length-1];
      if(corps.length>3&&Math.hypot(a.x-z.x,a.y-z.y)<1e-9)corps.pop();   // polygone refermé
    }else{
      const b=c.boite||mdlBoiteComp(c);
      corps=[{x:b.x1*k,y:b.y1*k},{x:b.x2*k,y:b.y1*k},{x:b.x2*k,y:b.y2*k},{x:b.x1*k,y:b.y2*k}];
      estime=true;
    }
    /* ses pastilles percées : un NPTH du fichier au même endroit dit qu'elle
       n'est pas métallisée */
    const trous=[];
    for(const p of (c.pads||[])){
      const ps=m.padstacks&&m.padstacks[p.ps];
      if(!ps||!(ps.trou>0))continue;
      const q=place(p.x,p.y);
      trous.push({x:q.x,y:q.y,d:ps.trou*k,pad:(ps.pad||0)*k,
                  metallise:!npth.some(t=>pres({x:t.x*k,y:t.y*k},q))});
    }
    const props=c.props||{};
    const o={id:c.ref,ref:c.ref,face:(L?(L.dessous&&!L.dessus):!!c.m)?"dessous":"dessus",
      x:c.x*k,y:c.y*k,rot:c.r||0,corps,part_name:props.PART_NAME||"",mpn:props.MPN||c.part||"",
      pkg:c.pkg||"",val:c.val||"",monte:mdlMonte(c.ref),trous};
    if(estime)o.corps_estime=true;
    if(c.hauteur>0)o.hauteur_fichier=c.hauteur*k;
    return o;
  });
  /* un NPTH libre est un trou de fixation ; dans le corps d'un composant, il
     est à lui (plot de centrage d'un connecteur) */
  const trous=npth.map(t=>({x:t.x*k,y:t.y*k,d:t.d*k,metallise:false}))
    .filter(t=>!composants.some(c=>mecaDedans(t,c.corps)));
  return {contour:pts(ct.o),decoupes:(ct.t||[]).map(pts),epaisseur:ep>0?ep:null,trous,composants};
}
