"use strict";
/* ==========================================================================
   Visionneuse IPC-2581 — fiche de mesure et retrofit : l'entrée
   --------------------------------------------------------------------------
   Le dessin et les panneaux sont communs (commun/fiche-mesure.js), la
   fenêtre est celle des plans (10-plans.js) ; ce fichier en tire l'entrée
   neutre du modèle lu, celle du dossier méca (contour, corps, faces) plus
   les pastilles. Les mesures vont dans `V.modele.mesures`, le retrofit dans
   `V.modele.retrofit`, donc dans « Exporter .json ».
   ========================================================================== */
function mesEntreeIpc(m){
  const E=mecaEntreeIpc(m), k=/INCH/i.test(m.unites||"")?25.4:/MICRON/i.test(m.unites||"")?0.001:1;
  /* beaucoup de fichiers ne rattachent pas les pastilles au composant : ses
     broches (`pins`) disent seulement où elles sont ; la forme est celle de
     la pastille libre posée au même endroit */
  const cle=(x,y)=>Math.round(x*100)+","+Math.round(y*100), libres=new Map();
  for(const L of V.couches)if(L.cuivre)for(const q of L.pads)if(!q.hote&&!libres.has(cle(q.x,q.y)))libres.set(cle(q.x,q.y),q);
  E.composants=E.composants.map((o,i)=>{
    const c=m.composants[i], pads=[], vus=new Set();
    const poser=(n,net,q,x,y)=>{
      n=String(n);
      if(vus.has(n))return;                      // une traversante : une fois, pas une par couche
      vus.add(n);
      const poly=q?simDCPadPolysIpc(q,k).plein[0]||[]:[], ps=q&&m.padstacks&&m.padstacks[q.pad.ps], e=0.25;
      pads.push({n,net:net>=0?m.nets[net]||"":"",x:x*k,y:y*k,trou:!!(ps&&ps.trou>0),
        pts:poly.length?poly.map(([x,y])=>({x,y})):[[-e,-e],[e,-e],[e,e],[-e,e]].map(([u,v])=>({x:x*k+u,y:y*k+v}))});
    };
    const places=[];
    for(const pad of (c.pads||[]))mdlPadPlace(pad,c,V.couches,places);
    places.forEach((q,j)=>poser(q.pad.pin||j+1,q.pad.n,q,q.x,q.y));
    for(const p of (c.pins||[])){
      const w=mdlPlacer(p.x,p.y,c.x,c.y,c.r,!!c.m);
      poser(p.num,p.n,libres.get(cle(w.x,w.y)),w.x,w.y);
    }
    return {ref:o.ref,face:o.face,corps:o.corps,pads,val:o.val,pkg:o.pkg,mpn:o.mpn,monte:o.monte};   // les trois derniers : les plans (10-plans.js)
  });
  return E;
}
function mesIpcListe(){return (V.modele.mesures=mesNormListe(V.modele.mesures));}
function retIpcListe(){return (V.modele.retrofit=retNormListe(V.modele.retrofit));}
