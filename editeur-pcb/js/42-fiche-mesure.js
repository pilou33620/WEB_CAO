"use strict";
/* ==========================================================================
   Éditeur PCB — fiche de mesure du technicien
   --------------------------------------------------------------------------
   Le dessin est commun (commun/fiche-mesure.js) ; ce fichier en fournit
   l'entrée neutre tirée de la carte ouverte, et les panneaux de saisie de la
   fiche de mesure et du retrofit dans la fenêtre des plans. Les mesures sont
   dans `S.dessin.mesures`, le retrofit dans `S.dessin.retrofit` (dfCfg).
   ========================================================================== */
function mesEntreeEditeur(){
  const o=gOrigin(), P=p=>({x:p.x-o.x,y:o.y-p.y});
  return {contour:boardPoly().map(P),decoupes:boardCutouts().map(c=>c.map(P)),
    composants:S.fps.filter(fp=>fp.ref).map(fp=>{
      const T=fpXform(fp), b=bodyOf(fp);
      return {ref:fp.ref,face:fp.side?"dessous":"dessus",val:fp.value||"",
        corps:[T(b.x1,b.y1),T(b.x2,b.y1),T(b.x2,b.y2),T(b.x1,b.y2)].map(P),
        pads:padsWorld(fp).map(q=>Object.assign(P(q),{n:q.n,net:q.net||"",trou:q.drill>0,pts:dfPadForme(q).map(P)}))};
    })};
}
/* `genre` « mes » (champ `mesures`) ou « ret » (champ `retrofit`) */
function mesEcrire(m,genre,champ,liste){
  push();
  const c=dfCfg();
  c[champ]=liste;c.feuilles[genre]=true;
  S.dessin=c;S.dessin=dfCfg();S.dirty=true;
  const cas=m.querySelector('[data-feuille="'+genre+'"]');
  if(cas)cas.checked=true;
  mesRafraichir();
  DF.doc=null;dfReconstruire();             // sans attendre, puis la feuille à l'écran
  const i=DF.doc.feuilles.findIndex(F=>F.genre===genre);
  if(i>=0){DF.page=i;dfRendreApercu();}
}
/* Après un Ctrl+Z ou un Ctrl+Y dans la fenêtre des plans (dfApresEdition) :
   la liste suit le document. */
function mesRafraichir(){
  const d=typeof document!=="undefined"&&document.getElementById&&document;
  const z=d&&d.getElementById("mesPanneau"), r=d&&d.getElementById("retPanneau");
  if(z&&z.querySelector)mesRendreListe(z,mesEntreeEditeur(),dfCfg().mesures);
  if(r&&r.querySelector)retRendreListe(r,mesEntreeEditeur(),dfCfg().retrofit);
}
function mesCadre(m){
  const cotes=m&&m.querySelector&&m.querySelector("#dfCotes");
  if(!cotes||!cotes.insertAdjacentHTML||m.querySelector("#mesPanneau"))return;
  cotes.insertAdjacentHTML("afterend",'<div class="df-h">Fiche de mesure (technicien)</div><div id="mesPanneau"></div>'+
    '<div class="df-h">Retrofit (composants à reprendre)</div><div id="retPanneau"></div>');
  const z=m.querySelector("#mesPanneau"), zr=m.querySelector("#retPanneau"), E=mesEntreeEditeur();
  z.innerHTML=mesFormHtml(E);
  zr.innerHTML=retFormHtml(E);
  mesRafraichir();
  const ui=mesBrancher(z,{entree:mesEntreeEditeur,liste:()=>dfCfg().mesures,ecrire:l=>mesEcrire(m,"mes","mesures",l)});
  const uiR=retBrancher(zr,{entree:mesEntreeEditeur,liste:()=>dfCfg().retrofit,ecrire:l=>mesEcrire(m,"ret","retrofit",l)});
  /* un clic sur une pastille, outil de sélection : le point de la sonde active
     (fiche de mesure), ou le repère du composant (retrofit) */
  if(m.mesClic)m.removeEventListener("click",m.mesClic,true);
  m.mesClic=e=>{
    if(DF.outil!=="sel"||!e.target.closest||!e.target.closest("#dfFeuille"))return;
    const P=dfPointFeuille(e), g=P&&P.F.genre, cle=(g==="mes"||g==="ret")&&mesPadSous(P.F,P.X,P.Y,P.tol);
    if(cle&&g==="mes")ui.choisir(cle);
    else if(cle)uiR.choisir(retRefDeCle(cle));
  };
  m.addEventListener("click",m.mesClic,true);      // en capture : les outils redessinent l'aperçu au clic, la cible en sortirait
}
