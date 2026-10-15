"use strict";
/* ==========================================================================
   Éditeur PCB — dossier mécanique
   --------------------------------------------------------------------------
   Le calcul, la feuille et le DXF sont communs à la visionneuse
   (commun/dossier-meca.js). Ici : l'entrée neutre tirée de la carte, dans le
   repère des Gerber et du DXF de la carte (origine `gOrigin`, Y vers le haut),
   comme `dxfCarte`.
   ========================================================================== */

function mecaEntreeEditeur(){
  const o=gOrigin(), P=p=>({x:p.x-o.x,y:o.y-p.y});
  const vid=(S.variantes&&S.variantes.active)||"";
  return {
    contour:boardPoly().map(P),
    decoupes:boardCutouts().map(c=>c.map(P)),
    epaisseur:stackTotal(),
    trous:(S.holes||[]).filter(h=>h.d>0).map(h=>Object.assign(P(h),{d:h.d,metallise:false})),
    composants:S.fps.map(fp=>{
      const T=fpXform(fp), b=bodyOf(fp);
      return Object.assign(P(fp),{
        id:fp.id, ref:fp.ref, face:fp.side?"dessous":"dessus", rot:fp.rot||0,
        corps:[T(b.x1,b.y1),T(b.x2,b.y1),T(b.x2,b.y2),T(b.x1,b.y2)].map(P),
        part_name:fp.csvPartName||fp.partName||"", mpn:fp.mpn||fp.csvMpn||"",
        pkg:fp.pkg||"", val:fp.value||"",
        monte:typeof varEstMonte!=="function"||varEstMonte(fp,vid),
        /* pastilles percées : métallisées, comme au tableau de perçage */
        trous:padsWorld(fp).filter(q=>q.drill>0)
          .map(q=>Object.assign(P(q),{d:q.drill,metallise:true,pad:Math.max(q.w||0,q.h||0)}))});
    })};
}
/* Le dossier de la carte ouverte : LIB chargée (`CSV_LIB`, 21-lib-sync.js),
   réglages posés à la main (`S.dessin.meca`), cartouche des plans. */
function mecaDossier(){
  const c=dfContexte();
  const lib=(typeof window!=="undefined"&&Array.isArray(window.CSV_LIB))?window.CSV_LIB:[];
  return mecaDonnees(mecaEntreeEditeur(),lib,(S.dessin&&S.dessin.meca)||{},
                     {projet:c.projet,revision:c.rev,date:c.date});
}
