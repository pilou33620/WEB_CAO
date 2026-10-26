"use strict";
/* ==========================================================================
   Visionneuse IPC-2581 — fiche de mesure du technicien
   --------------------------------------------------------------------------
   Le dessin et le panneau sont communs (commun/fiche-mesure.js) ; ce fichier
   en tire l'entrée neutre du modèle lu, celle du dossier méca (contour,
   corps, faces) plus les pastilles. Les mesures vont dans le modèle,
   `V.modele.mesures`, donc dans « Exporter .json ».
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
    return {ref:o.ref,face:o.face,corps:o.corps,pads};
  });
  return E;
}
function mesIpcListe(){return (V.modele.mesures=mesNormListe(V.modele.mesures));}
function mesIpcFeuilles(){
  const ctx=mecaIpcCtx();
  ctx.docNum=mecaIpcBase()+"-MESURES";
  const F=mesFeuilles(mesEntreeIpc(V.modele),mesIpcListe(),ctx);
  F.forEach((f,i)=>dfCadre(f,ctx,i+1,F.length));
  return F;
}
let MES_IPC_F=[];                                // les feuilles de l'aperçu, pour le clic
function mesIpcApercu(){
  const z=document.getElementById("mesApercu");
  if(z)z.innerHTML=(MES_IPC_F=mesIpcFeuilles()).map(f=>dfSvg(f)).join("");
}
function mesIpcFermer(){
  const m=document.getElementById("modaleMesure");
  if(m)m.hidden=true;
}
function mesOuvrir(){
  if(!V.modele){hint("Aucune carte ouverte : pas de fiche de mesure.");return;}
  let m=document.getElementById("modaleMesure");
  if(!m){
    m=document.createElement("div");
    m.id="modaleMesure";m.className="modal-overlay";m.tabIndex=-1;
    m.setAttribute("role","dialog");m.setAttribute("aria-modal","true");m.setAttribute("aria-label","Fiche de mesure");
    m.innerHTML='<div class="modal-box meca-box"><header class="modal-head"><div>'+
      '<h3>Fiche de mesure (technicien)</h3><small>Un point : repère.pastille (U3.12), TP2, ou un net (GND)</small></div><div class="meca-actions">'+
      '<button class="tb on" type="button" data-a="pdf" title="La fiche en PDF : texte cherchable">⬇ Télécharger le PDF</button>'+
      '<button class="pnl-btn" type="button" data-a="fermer" title="Fermer (Échap)">✕</button></div></header>'+
      '<div class="modal-body meca-corps"><aside class="meca-cfg mes-cfg" id="mesPanneau"></aside>'+
      '<main class="meca-apercu" id="mesApercu"></main></div></div>';
    document.body.appendChild(m);
    m.addEventListener("pointerdown",ev=>{if(ev.target===m)mesIpcFermer();});
    m.addEventListener("keydown",ev=>{if(ev.key==="Escape"){ev.stopPropagation();mesIpcFermer();}});
    m.addEventListener("click",ev=>{
      const b=ev.target.closest&&ev.target.closest("[data-a]");
      if(!b)return;
      if(b.dataset.a==="fermer")mesIpcFermer();
      else if(b.dataset.a==="pdf"){
        const nom=mecaIpcBase()+"-MESURES.pdf";
        telecharger(new Blob([dfPdf(mesIpcFeuilles(),{titre:mecaIpcBase()+" — fiche de mesure",auteur:"",fonte:true,
          sujet:"Fiche de mesure — "+mecaIpcBase(),motsCles:"PCB, mesure, test"})],{type:"application/pdf"}),nom);
        hint("Fiche de mesure "+nom+" : "+mesIpcListe().length+" mesure(s).");
      }
    });
  }
  /* le panneau se refait à chaque ouverture : un autre fichier a pu être ouvert entre-temps */
  const z=m.querySelector("#mesPanneau"), E=mesEntreeIpc(V.modele);
  const neuf=z.cloneNode(false);                 // sans les écouteurs de la carte précédente
  z.replaceWith(neuf);
  neuf.innerHTML=mesFormHtml(E);
  mesRendreListe(neuf,E,mesIpcListe());
  const ui=mesBrancher(neuf,{entree:()=>E,liste:mesIpcListe,ecrire:l=>{
    V.modele.mesures=mesNormListe(l);
    mesRendreListe(neuf,E,V.modele.mesures);
    mesIpcApercu();
  }});
  /* un clic sur une pastille de l'aperçu : le point de la sonde active */
  m.mesChoisir=ui.choisir;
  if(!m.mesClic){
    m.mesClic=true;
    m.addEventListener("click",ev=>{
      const svg=ev.target.closest&&ev.target.closest("#mesApercu svg");
      if(!svg)return;
      const F=MES_IPC_F[[...m.querySelectorAll("#mesApercu svg")].indexOf(svg)], r=svg.getBoundingClientRect();
      const cle=F&&r.width&&mesPadSous(F,(ev.clientX-r.left)*F.w/r.width,(ev.clientY-r.top)*F.h/r.height,9*F.w/r.width);
      if(cle)m.mesChoisir(cle);
    });
  }
  m.hidden=false;
  if(m.focus)m.focus();
  mesIpcApercu();
}
(function(){
  const b=typeof document!=="undefined"&&document.getElementById&&document.getElementById("bMesure");
  if(b)b.onclick=mesOuvrir;
})();
