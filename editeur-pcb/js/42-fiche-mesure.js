"use strict";
/* ==========================================================================
   Éditeur PCB — fiche de mesure du technicien
   --------------------------------------------------------------------------
   Le dessin est commun (commun/fiche-mesure.js) ; ce fichier en fournit
   l'entrée neutre tirée de la carte ouverte, et le panneau de saisie dans la
   fenêtre des plans. Les mesures sont dans `S.dessin.mesures` (dfCfg).
   ========================================================================== */
function mesEntreeEditeur(){
  const o=gOrigin(), P=p=>({x:p.x-o.x,y:o.y-p.y});
  return {contour:boardPoly().map(P),decoupes:boardCutouts().map(c=>c.map(P)),
    composants:S.fps.filter(fp=>fp.ref).map(fp=>{
      const T=fpXform(fp), b=bodyOf(fp);
      return {ref:fp.ref,face:fp.side?"dessous":"dessus",
        corps:[T(b.x1,b.y1),T(b.x2,b.y1),T(b.x2,b.y2),T(b.x1,b.y2)].map(P),
        pads:padsWorld(fp).map(q=>Object.assign(P(q),{n:q.n,net:q.net||"",trou:q.drill>0,pts:dfPadForme(q).map(P)}))};
    })};
}
function mesEcrire(m,z,liste){
  push();
  const c=dfCfg();
  c.mesures=liste;c.feuilles.mes=true;
  S.dessin=c;S.dessin=dfCfg();S.dirty=true;
  const cas=m.querySelector('[data-feuille="mes"]');
  if(cas)cas.checked=true;
  mesRendreListe(z,mesEntreeEditeur(),dfCfg().mesures);
  DF.doc=null;dfReconstruire();             // sans attendre, puis la feuille de mesure à l'écran
  const i=DF.doc.feuilles.findIndex(F=>F.genre==="mes");
  if(i>=0){DF.page=i;dfRendreApercu();}
}
function mesCadre(m){
  const cotes=m&&m.querySelector&&m.querySelector("#dfCotes");
  if(!cotes||!cotes.insertAdjacentHTML||m.querySelector("#mesPanneau"))return;
  cotes.insertAdjacentHTML("afterend",'<div class="df-h">Fiche de mesure (technicien)</div><div id="mesPanneau"></div>');
  const z=m.querySelector("#mesPanneau"), E=mesEntreeEditeur();
  z.innerHTML=mesFormHtml(E);
  mesRendreListe(z,E,dfCfg().mesures);
  mesBrancher(z,{entree:mesEntreeEditeur,liste:()=>dfCfg().mesures,ecrire:l=>mesEcrire(m,z,l)});
}
