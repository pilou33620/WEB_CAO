"use strict";
/* ==========================================================================
   Visionneuse IPC-2581 — dossier mécanique
   --------------------------------------------------------------------------
   Le calcul et la feuille sont communs (commun/dossier-meca.js) ; le PDF est
   celui des plans de l'éditeur, chargé tel quel (editeur-pcb/js/29, 33, 34 et
   la fonte), le STEP celui de commun/export-step.js. Ce fichier fournit ce
   qu'ils prennent ailleurs dans l'éditeur.
   ========================================================================== */

/* les mêmes que 01-core.js de l'éditeur, que la visionneuse ne charge pas */
const clamp=(v,a,b)=>v<a?a:(v>b?b:v);
const fmt=(v,n)=>Number(v).toFixed(n==null?2:n);

/* L'entrée neutre du dossier (commun/dossier-meca.js) tirée du modèle lu. Le
   fichier est déjà dans le repère des Gerber (Y vers le haut, son origine) ;
   tout passe en millimètres. */
function mecaEntreeIpc(m){
  const k=/INCH/i.test(m.unites||"")?25.4:/MICRON/i.test(m.unites||"")?0.001:1;
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
    /* la face par la couche de cuivre ; une couche d'assemblage ou de
       sérigraphie ne le dit pas : le miroir alors */
    const dessous=L&&(L.dessus||L.dessous)?(L.dessous&&!L.dessus):!!c.m;
    const o={id:c.ref,ref:c.ref,face:dessous?"dessous":"dessus",
      x:c.x*k,y:c.y*k,rot:c.r||0,corps,part_name:props.PART_NAME||"",mpn:props.MPN||c.part||"",
      pkg:c.pkg||"",val:c.val||"",monte:mdlMonte(c.ref),trous};
    if(estime)o.corps_estime=true;
    if(c.hauteur>0)o.hauteur_fichier=c.hauteur*k;
    return o;
  });
  /* un NPTH libre est un trou de fixation ; dans le corps d'un composant, il
     est à lui (plot de centrage d'un connecteur, trou d'une empreinte de
     fixation sans pastille) — s'il n'y est pas déjà comme pastille percée */
  const trous=[];
  for(const t0 of npth){
    const t={x:t0.x*k,y:t0.y*k,d:t0.d*k,metallise:false};
    if(t0.l>t0.d){t.l=t0.l*k;t.rot=t0.r||0;}        // une fente : longueur et angle, comme l'éditeur
    const c=composants.find(c=>mecaDedans(t,c.corps));
    if(!c)trous.push(t);
    else if(!c.trous.some(q=>pres(q,t)))c.trous.push(t);
  }
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
  if(MECA_IPC.lib&&!MECA_IPC.libKo)return Promise.resolve(MECA_IPC.lib);
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
  const J=mecaIpcDossier(), r=mecaIpcReglages(), e=esc;
  document.getElementById("mecaTable").innerHTML=
    '<tr><th>Repère</th><th>Hauteur (mm)</th><th title="Ouverture dans le boîtier">Ouv.</th></tr>'+
    J.composants.map(c=>{
      const ph=c.source_hauteur==="saisie"||c.hauteur==null?"?":mecaFr(c.hauteur)+" ("+c.source_hauteur+")";
      return '<tr><td>'+e(c.ref)+'</td><td><input type="number" min="0" max="100" step="0.01" data-meca-h="'+e(c.ref)+
        '" value="'+(mecaPropre(r.h,c.ref)!=null?r.h[c.ref]:"")+'" placeholder="'+e(ph)+'" aria-label="Hauteur de '+e(c.ref)+'"></td>'+
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
    m.tabIndex=-1;                   // le focus reste dans la fenêtre : Échap, et pas les raccourcis de la carte
    m.setAttribute("role","dialog");m.setAttribute("aria-modal","true");m.setAttribute("aria-label","Dossier mécanique");
    m.innerHTML='<div class="modal-box meca-box"><header class="modal-head"><div>'+
      '<h3>Dossier mécanique</h3><small id="mecaEtat"></small></div><div class="meca-actions">'+
      '<button class="tb on" type="button" data-a="zip" title="Plan mécanique (PDF), données (JSON) et carte en 3D avec ses composants (STEP), pour concevoir le boîtier">⬇ Télécharger .zip</button>'+
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
        const nom=mecaIpcBase()+"-MECA.zip", f=mecaIpcFichiers();
        stepFabriquer(stepSceneIpc(),{carte:true,dessus:true,dessous:true}).then(r=>{
          if(r)f.push({name:mecaIpcBase()+"-MECA.step",text:r.texte});
          telecharger(zipBlob(f),nom);
          hint("Dossier mécanique "+nom+" : plan PDF, JSON"+(r?" et STEP 3D":"")+".");
        });
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
  if(m.focus)m.focus();
  mecaIpcLib().then(mecaIpcRendre);
}
/* ==========================================================================
   Export STEP
   --------------------------------------------------------------------------
   La scène de commun/export-step.js tirée du dossier : contour, découpes,
   trous (libres et pastilles percées), corps et hauteurs, et le modèle 3D de
   la LIB trouvé par la Part Name ou la référence fabricant. Ni cuivre ni
   sérigraphie : la visionneuse ne les a pas en polygones.
   ========================================================================== */
function stepSceneIpc(){
  const J=mecaIpcDossier(), E=mecaEntreeIpc(V.modele), lib=MECA_IPC.lib||[];
  const cle=v=>String(v||"").trim().toLowerCase(), parRef=new Map(E.composants.map(c=>[c.ref,c]));
  const ligne=e=>(cle(e.part_name)&&lib.find(l=>cle(l["Part Name"])===cle(e.part_name)))||
    (cle(e.mpn)&&lib.find(l=>cle(l["Part Number"])===cle(e.mpn)||cle(l["manufacturer part Number"])===cle(e.mpn)))||null;
  const aire=c=>Math.abs(c.reduce((s,p,i)=>{const q=c[(i+1)%c.length];return s+p[0]*q[1]-q[0]*p[1];},0))/2;
  const vide={cuivre:{},seri:{}};
  return {titre:mecaIpcBase(),ep:J.carte.epaisseur||1.6,contour:J.carte.contour,decoupes:J.carte.decoupes,
    trous:E.trous.concat(...E.composants.map(c=>c.trous)).filter(t=>t.d>0).map(t=>[t.x,t.y,t.d]),
    faces:[vide,vide],
    composants:J.composants.filter(c=>c.monte&&c.corps.length>=3).map(c=>{
      const e=parRef.get(c.ref)||{}, l=ligne(e);
      const nom=l?String(l["Modèle 3D"]||"").trim().replace(/^Models\//,""):"";
      /* shortcut: sans hauteur, une boîte à 0,4 × le côté moyen, comme l'animation 3D de l'éditeur */
      const h=c.hauteur!=null?c.hauteur:Math.min(3,Math.max(0.3,0.4*Math.sqrt(aire(c.corps))));
      /* IPC-2581 tourne en sens trigonométrique, l'éditeur (Y vers le bas) à l'inverse : anim3dPose attend le second */
      const m3d=nom&&anim3dPosition(l["Position 3D"])?{nom,pos:l["Position 3D"],x:e.x,y:e.y,rot:-(e.rot||0)}:null;
      return Object.assign({ref:c.ref,face:c.face==="dessous"?1:0,corps:c.corps,h},m3d?{m3d}:{});
    })};
}
function stepIpcOuvrir(){
  if(!V.modele){hint("Aucune carte ouverte : rien à exporter en STEP.");return;}
  stepFenetre(o=>{
    hint("Export STEP : chargement des modèles 3D de la LIB…");
    mecaIpcLib().then(()=>stepFabriquer(stepSceneIpc(),o)).then(r=>{
      if(!r){hint("Export STEP : rien à exporter.");return;}
      const nom=mecaIpcBase()+"-3D.step";
      telecharger(new Blob([r.texte],{type:"model/step"}),nom);
      hint(nom+" : "+r.n.pieces+" pièce(s) — "+r.n.modeles+" composant(s) avec leur modèle de la LIB, "+
           r.n.boites+" en boîte extrudée"+stepNoteTrous(r.n)+".");
    });
  },["vias","cuivre","seri"],{fond:"modal-overlay",boite:"modal-box step-box"});
}
(function(){
  const b=typeof document!=="undefined"&&document.getElementById&&document.getElementById("bStep");
  if(b)b.onclick=stepIpcOuvrir;
})();
(function(){
  const b=typeof document!=="undefined"&&document.getElementById&&document.getElementById("bMeca");
  if(b)b.onclick=mecaOuvrir;
})();
