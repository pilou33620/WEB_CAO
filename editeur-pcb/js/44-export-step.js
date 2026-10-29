"use strict";
/* ==========================================================================
   Éditeur PCB — Export STEP (menu Fichier, « Export STEP… »)
   --------------------------------------------------------------------------
   La scène de l'animation 3D (anim3dDonnees, sans l'image des zones) et le
   contour des zones de cuivre, écrits par commun/export-step.js. Une fenêtre
   de cases choisit carte, composants dessus / dessous, cuivre, sérigraphie.
   ========================================================================== */
function stepSceneEditeur(){
  const J=anim3dDonnees(true), o=gOrigin(), P=p=>[anim3dR(p.x-o.x),anim3dR(o.y-p.y)];
  /* shortcut: une zone sort en son contour (et ses trous de fichier), sans les dégagements autour du cuivre étranger ; les calculer si le STEP doit montrer l'isolement */
  [0,S.cu-1].forEach((L,f)=>{
    if(f&&!L)return;
    J.faces[f].cuivre.zones=S.zones.filter(z=>z.l===L&&z.pts.length>=3).map(z=>({p:z.pts.map(P),
      t:(zoneFichier(z)&&Array.isArray(z.trous)?z.trous.filter(t=>t&&t.length>=3):[]).map(t=>t.map(P))}));
  });
  return J;
}
function stepExporter(o){
  hint("Export STEP : chargement des modèles 3D de la LIB…");
  return stepFabriquer(stepSceneEditeur(),o).then(r=>{
    if(!r){hint("Export STEP : rien à exporter (pas de contour ni de composant parmi les cases cochées).");return null;}
    const nom=pcbFile("-3D.step","carte-3D.step");
    dl(new Blob([r.texte],{type:"model/step"}),nom);
    hint(nom+" : "+r.n.pieces+" pièce(s) — "+r.n.modeles+" composant(s) avec leur modèle de la LIB, "+
         r.n.boites+" en boîte extrudée à leur hauteur"+stepNoteTrous(r.n)+".");
    return r;
  });
}
function stepChoisir(){
  if(typeof document!=="undefined")stepFenetre(stepExporter);
}
