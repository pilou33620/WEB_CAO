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
    trous:trousMonde().filter(h=>h.d>0).map(h=>Object.assign(P(h),{d:h.d,metallise:false})),
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
/* Entre le repère de l'éditeur (Y vers le bas) et celui des Gerber : la vue
   de dessus de la feuille en a besoin pour les cotes posées à la main. */
function mecaMonde(){
  const o=gOrigin();
  return {vers:(x,y)=>({x:x-o.x,y:o.y-y}),depuis:(x,y)=>({x:x+o.x,y:o.y-y})};
}
/* Le dossier de la carte ouverte : LIB chargée (`CSV_LIB`, 21-lib-sync.js),
   réglages posés à la main (`S.dessin.meca`), cartouche des plans. */
function mecaDossier(){
  const c=dfContexte();
  const lib=(typeof window!=="undefined"&&Array.isArray(window.CSV_LIB))?window.CSV_LIB:[];
  return mecaDonnees(mecaEntreeEditeur(),lib,c.cfg.meca,
                     {projet:c.projet,revision:c.rev,date:c.date});
}

/* ---------- export ---------- */
function mecaFichiersEditeur(){
  const ctx=dfContexte(), J=mecaDossier();
  ctx.docNum=fabBase()+"-MECA";            // document à part, pas une feuille des plans
  return mecaFichiers(J,mecaPlan(J,ctx,mecaMonde()),fabBase(),ctx.cfg.fonte);
}
function mecaExporter(){
  const f=mecaFichiersEditeur(), J=JSON.parse(f[1].text), nom=pcbFile("-MECA.zip","meca.zip");
  dl(zipBlob(f),nom);
  const n=J.composants.filter(c=>c.hauteur==null).length;
  hint("Dossier mécanique "+nom+" : plan PDF, JSON et DXF 1:1 — "+J.fixations.length+" fixation(s), "+
       J.composants.filter(c=>c.ouverture).length+" ouverture(s)"+
       (n?", "+n+" composant(s) sans hauteur (voir les notes du plan)":"")+".");
}
/* ---------- réglages posés à la main ----------
   `champ` "h" : hauteur saisie (vide = celle de la LIB ou du fichier) ;
   "ouv" : la case ouverture. Bornés par `dfCfg` comme le reste des plans. */
function mecaRegler(id,champ,val){
  const c=dfCfg(), k=String(id);
  if(champ==="h"){if(val===""||val==null)delete c.meca.h[k];else c.meca.h[k]=val;}
  else if(champ==="ouv")c.meca.ouv[k]=!!val;
  S.dessin=c;
  S.dessin=dfCfg();          // la valeur saisie repasse par les bornes
  S.dirty=true;
}
/* Le tableau des composants, sous les réglages des plans, quand la feuille
   est cochée : la hauteur retenue en grisé, la case de l'ouverture. */
function mecaRendreReglages(m){
  const z=m.querySelector("#mecaRegl");
  if(!z)return;
  const cfg=dfCfg();
  if(!cfg.feuilles.meca){z.innerHTML="";return;}
  const J=mecaDossier(), parRef=new Map(S.fps.map(fp=>[fp.ref,fp]));
  z.innerHTML='<div class="df-h">Dossier méca : hauteurs (mm) et ouvertures</div>'+
    '<table class="df-meca"><tr><th>Repère</th><th>Hauteur</th><th title="Ouverture dans le boîtier">Ouv.</th></tr>'+
    J.composants.map(c=>{
      const fp=parRef.get(c.ref);
      if(!fp)return "";
      const saisie=mecaPropre(cfg.meca.h,fp.id);
      const ph=c.source_hauteur==="saisie"||c.hauteur==null?"?":mecaFr(c.hauteur)+" ("+c.source_hauteur+")";
      return '<tr><td>'+esc(c.ref)+'</td><td><input type="number" min="0" max="100" step="0.01" data-meca-h="'+fp.id+
        '" value="'+(saisie!=null?saisie:"")+'" placeholder="'+esc(ph)+'" aria-label="Hauteur de '+esc(c.ref)+'"></td>'+
        '<td><input type="checkbox" data-meca-ouv="'+fp.id+'"'+(c.ouverture?" checked":"")+
        ' aria-label="Ouverture pour '+esc(c.ref)+'"></td></tr>';
    }).join("")+'</table>';
}
/* Appelé à la fin de dfRendreCadre() : le bouton du zip après ceux du DXF,
   et la place du tableau. La fenêtre refait son HTML à chaque fois ; ses
   écouteurs, eux, ne se posent qu'une fois. */
function mecaCadre(m){
  if(!m||!m.querySelector)return;
  const ap=m.querySelector('[data-dxf="feuille"]')||m.querySelector('[data-a="pdf"]');
  if(ap&&ap.insertAdjacentHTML&&!m.querySelector("[data-meca]"))
    ap.insertAdjacentHTML("afterend",'<button class="tb" type="button" data-meca="zip" '+
      'title="Dossier pour concevoir le boîtier : plan mécanique (PDF), données (JSON) et carte à 1:1 (DXF)">'+
      '⬇ Dossier méca .zip</button>');
  const cotes=m.querySelector("#dfCotes");
  if(cotes&&cotes.insertAdjacentHTML&&!m.querySelector("#mecaRegl"))
    cotes.insertAdjacentHTML("afterend",'<div id="mecaRegl"></div>');
  mecaRendreReglages(m);
  if(m.mecaBranche)return;
  m.mecaBranche=true;
  m.addEventListener("click",e=>{
    const b=e.target&&e.target.closest&&e.target.closest('[data-meca="zip"]');
    if(b)mecaExporter();
  });
  m.addEventListener("input",e=>{
    const t=e.target;
    if(t&&t.dataset&&t.dataset.mecaH!=null){dfAnnulable(t);mecaRegler(t.dataset.mecaH,"h",t.value);dfReconstruire();}
  });
  m.addEventListener("change",e=>{
    const t=e.target;
    if(!t||!t.dataset)return;
    DF.saisie=null;
    if(t.dataset.mecaOuv!=null){push();mecaRegler(t.dataset.mecaOuv,"ouv",t.checked);dfReconstruire();}
    else if(t.dataset.feuille==="meca")mecaRendreReglages(m);
  });
}
