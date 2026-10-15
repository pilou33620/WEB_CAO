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
const esc=mdlEsc;          // l'aperçu SVG des plans (dfSvg) échappe ses textes

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

/* ==========================================================================
   Fenêtre « Dossier méca »
   --------------------------------------------------------------------------
   Le tableau des composants (hauteur saisie, case d'ouverture), l'aperçu de
   la feuille et le zip. Les réglages vont dans le modèle, `V.modele.meca`
   (clé : le repère), donc dans « Exporter .json » comme les natures de nets.
   ========================================================================== */
const MECA_IPC={lib:null,libKo:false,minuterie:null};

function mecaIpcBase(){
  return typeof nomBase==="function"?nomBase():((V.fichier||"carte").replace(/\.[^.]+$/,"")||"carte");
}
function mecaIpcReglages(){
  V.modele.meca=mecaNormReglages(V.modele.meca,(V.modele.composants||[]).map(c=>c.ref));
  return V.modele.meca;
}
function mecaIpcRegler(ref,champ,val){
  const r=mecaIpcReglages();
  if(champ==="h"){if(val===""||val==null)delete r.h[ref];else r.h[ref]=val;}
  else if(champ==="ouv")r.ouv[ref]=!!val;
  mecaIpcReglages();                 // la valeur saisie repasse par les bornes
}
function mecaIpcDossier(){
  return mecaDonnees(mecaEntreeIpc(V.modele),MECA_IPC.lib||[],mecaIpcReglages(),
    {projet:mecaIpcBase(),revision:"",date:new Date().toISOString().slice(0,10)});
}
function mecaIpcCtx(){
  const b=mecaIpcBase();
  return {cfg:{format:"A3",societe:"",auteur:"",verifie:"",approuve:""},
          projet:b,docNum:b+"-MECA",rev:"—",date:new Date().toISOString().slice(0,10),variante:""};
}
function mecaIpcFichiers(){
  const J=mecaIpcDossier();
  return mecaFichiers(J,mecaPlan(J,mecaIpcCtx(),null),mecaIpcBase(),true);
}
/* La LIB du serveur, une fois ; sans serveur (un .json rouvert), on s'en
   passe et on le dit : restent les hauteurs du fichier et la saisie. */
function mecaIpcLib(){
  if(MECA_IPC.lib)return Promise.resolve(MECA_IPC.lib);
  return Promise.resolve().then(()=>fetch("/api/lib/composants")).then(r=>r.ok?r.json():null)
    .then(d=>{MECA_IPC.lib=d&&Array.isArray(d.composants)?d.composants:[];MECA_IPC.libKo=!(d&&d.composants);})
    .catch(()=>{MECA_IPC.lib=[];MECA_IPC.libKo=true;});
}
function mecaIpcFermer(){
  const m=document.getElementById("modaleMeca");
  if(m)m.hidden=true;
}
function mecaIpcApercu(){
  const z=document.getElementById("mecaApercu");
  if(!z)return;
  const J=mecaIpcDossier(), F=mecaPlan(J,mecaIpcCtx(),null);
  z.innerHTML=F.map(f=>dfSvg(f)).join("");
  const n=J.composants.filter(c=>c.hauteur==null).length;
  document.getElementById("mecaEtat").textContent=J.fixations.length+" fixation(s) · "+
    J.composants.filter(c=>c.ouverture).length+" ouverture(s) · "+
    (n?n+" composant(s) sans hauteur":"toutes les hauteurs connues")+
    (MECA_IPC.libKo?" · LIB indisponible (hors serveur) : hauteurs du fichier et saisies seulement":"");
}
function mecaIpcRendre(){
  const J=mecaIpcDossier(), r=mecaIpcReglages(), e=mdlEsc;
  document.getElementById("mecaTable").innerHTML=
    '<tr><th>Repère</th><th>Hauteur (mm)</th><th title="Ouverture dans le boîtier">Ouv.</th></tr>'+
    J.composants.map(c=>{
      const ph=c.source_hauteur==="saisie"||c.hauteur==null?"?":mecaFr(c.hauteur)+" ("+c.source_hauteur+")";
      return '<tr><td>'+e(c.ref)+'</td><td><input type="number" min="0" max="100" step="0.01" data-meca-h="'+e(c.ref)+
        '" value="'+(r.h[c.ref]!=null?r.h[c.ref]:"")+'" placeholder="'+e(ph)+'" aria-label="Hauteur de '+e(c.ref)+'"></td>'+
        '<td><input type="checkbox" data-meca-ouv="'+e(c.ref)+'"'+(c.ouverture?" checked":"")+
        ' aria-label="Ouverture pour '+e(c.ref)+'"></td></tr>';
    }).join("");
  mecaIpcApercu();
}
function mecaOuvrir(){
  if(!V.modele){hint("Aucune carte ouverte : pas de dossier méca.");return;}
  let m=document.getElementById("modaleMeca");
  if(!m){
    m=document.createElement("div");
    m.id="modaleMeca";m.className="modal-overlay";
    m.setAttribute("role","dialog");m.setAttribute("aria-modal","true");m.setAttribute("aria-label","Dossier mécanique");
    m.innerHTML='<div class="modal-box meca-box"><header class="modal-head"><div>'+
      '<h3>Dossier mécanique</h3><small id="mecaEtat"></small></div><div class="meca-actions">'+
      '<button class="tb on" type="button" data-a="zip" title="Plan mécanique (PDF), données (JSON) et carte à 1:1 (DXF), pour concevoir le boîtier">⬇ Télécharger .zip</button>'+
      '<button class="pnl-btn" type="button" data-a="fermer" title="Fermer (Échap)">✕</button></div></header>'+
      '<div class="modal-body meca-corps"><aside class="meca-cfg"><table class="meca-table" id="mecaTable"></table></aside>'+
      '<main class="meca-apercu" id="mecaApercu"></main></div></div>';
    document.body.appendChild(m);
    m.addEventListener("pointerdown",ev=>{if(ev.target===m)mecaIpcFermer();});
    m.addEventListener("keydown",ev=>{if(ev.key==="Escape"){ev.stopPropagation();mecaIpcFermer();}});
    m.addEventListener("click",ev=>{
      const b=ev.target.closest&&ev.target.closest("[data-a]");
      if(!b)return;
      if(b.dataset.a==="fermer")mecaIpcFermer();
      else if(b.dataset.a==="zip"){
        const nom=mecaIpcBase()+"-MECA.zip";
        telecharger(zipBlob(mecaIpcFichiers()),nom);
        hint("Dossier mécanique "+nom+" : plan PDF, JSON et DXF 1:1.");
      }
    });
    m.addEventListener("input",ev=>{
      const t=ev.target;
      if(!t.dataset||t.dataset.mecaH==null)return;
      mecaIpcRegler(t.dataset.mecaH,"h",t.value);
      clearTimeout(MECA_IPC.minuterie);
      MECA_IPC.minuterie=setTimeout(mecaIpcApercu,250);
    });
    m.addEventListener("change",ev=>{
      const t=ev.target;
      if(t.dataset&&t.dataset.mecaOuv!=null){mecaIpcRegler(t.dataset.mecaOuv,"ouv",t.checked);mecaIpcApercu();}
    });
  }
  m.hidden=false;
  mecaIpcLib().then(mecaIpcRendre);
}
(function(){
  const b=typeof document!=="undefined"&&document.getElementById&&document.getElementById("bMeca");
  if(b)b.onclick=mecaOuvrir;
})();
