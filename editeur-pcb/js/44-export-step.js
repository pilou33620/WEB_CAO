"use strict";
/* ==========================================================================
   Éditeur PCB — Export STEP et import du contour (onglets Fabriquer et Carte)
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
  /* Une fente (trou oblong NPTH, perçage oblong d'une pastille) n'est qu'un rond dans la scène :
     elle devient une découpe à sa vraie forme, deux demi-cercles en cordes de 10° que le STEP
     relit en arcs. Seulement si elle est entière dans la carte et ne touche aucun autre trou ;
     sinon le rond de son diamètre reste, comme avant. */
  const tous=trousMonde().filter(h=>h.d>0).concat(...S.fps.map(fp=>padsWorld(fp).filter(q=>q.drill>0)));
  for(const a of tous.map(axePercage)){
    if(a.x1===a.x2&&a.y1===a.y2)continue;
    const r=a.d/2, ang=Math.atan2(a.y2-a.y1,a.x2-a.x1), pts=[];
    for(const [c,a0] of [[{x:a.x2,y:a.y2},ang-Math.PI/2],[{x:a.x1,y:a.y1},ang+Math.PI/2]])
      for(let k=0;k<=18;k++)pts.push({x:c.x+r*Math.cos(a0+k*Math.PI/18),y:c.y+r*Math.sin(a0+k*Math.PI/18)});
    const m=P({x:(a.x1+a.x2)/2,y:(a.y1+a.y2)/2}), i=J.trous.findIndex(t=>!t[3]&&Math.hypot(t[0]-m[0],t[1]-m[1])<2e-3);
    if(i<0||!pts.every(q=>inBoard(q.x,q.y,0.05)))continue;
    const A=P({x:a.x1,y:a.y1}), B=P({x:a.x2,y:a.y2});
    if(J.trous.some((t,j)=>j!==i&&segDist(t[0],t[1],A[0],A[1],B[0],B[1])<t[2]/2+r+1e-3))continue;
    J.trous.splice(i,1);
    J.decoupes.push(pts.map(P));
  }
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

/* ---------- import : le contour de la carte tiré d'un STEP de la mécanique ----------
   commun/export-step.js (stepLireCarte) lit la plus grande face plane : contour,
   découpes, trous ronds. L'origine du STEP devient celle des fichiers (fixée là
   où elle était) : l'export STEP retombe sur le modèle de la mécanique. Le
   contour et les découpes remplacent les anciens ; les trous s'ajoutent, sauf
   ceux déjà là. Une étape d'annulation. */
function stepImporterTexte(texte,nom){
  const r=stepLireCarte(texte);
  if(r.erreur){hint("Import STEP « "+nom+" » : "+r.erreur+".");return null;}
  const o=gOrigin(), V=p=>({x:r3(o.x+p.x),y:r3(o.y-p.y)});
  /* un trou sur un perçage déjà là (trou, pastille, via : un STEP exporté d'ici) n'est pas doublé */
  const perces=trousMonde().concat(S.vias.filter(v=>v.drill>0),...S.fps.map(fp=>padsWorld(fp).filter(q=>q.drill>0)));
  /* ni une fente déjà là, que l'export écrit en découpe (stepSceneEditeur) : elle ne devient pas une découpe de la carte */
  const fentes=perces.map(axePercage).filter(a=>a.x1!==a.x2||a.y1!==a.y2);
  const estFente=D=>{const b=polyBBox(D);
    return fentes.some(a=>Math.hypot((b.x1+b.x2-a.x1-a.x2)/2,(b.y1+b.y2-a.y1-a.y2)/2)<0.02);};
  r.decoupes=r.decoupes.map(D=>D.map(V)).filter(D=>!estFente(D));
  push();
  S.origin={x:o.x,y:o.y};S.fabOrigin=true;
  contourChanger(()=>{
    S.board.pts=r.contour.map(V);
    if(r.decoupes.length)S.board.cutouts=r.decoupes;else delete S.board.cutouts;
    boardChanged();
  });
  S.holes=S.holes||[];
  let n=0;
  for(const t of r.trous){
    const q=V(t);
    if(perces.some(h=>Math.hypot(h.x-q.x,h.y-q.y)<0.01))continue;
    S.holes.push(mkHole(q.x,q.y,t.d));n++;
  }
  touch();clearSel();S.sel.edge=true;
  if(typeof document!=="undefined"){refreshPanels();reSync();draw();}
  hint("Contour importé de « "+nom+" » : "+fmt(S.board.w,2)+" × "+fmt(S.board.h,2)+" mm, "+
       r.decoupes.length+" découpe(s), "+n+" trou(s) ajouté(s) en NPTH ; l'origine du STEP est celle des fichiers. Ctrl+Z annule.");
  return r;
}
function stepImporterChoisir(){
  const f=document.createElement("input");
  f.type="file";f.accept=".stp,.step,.STP,.STEP";
  f.onchange=()=>{const x=f.files&&f.files[0];if(x)x.text().then(t=>stepImporterTexte(t,x.name));};
  f.click();
}
