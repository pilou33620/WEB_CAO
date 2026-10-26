"use strict";
/* ==========================================================================
   Visionneuse IPC-2581 — plans (Draftsman) : fabrication et assemblage
   --------------------------------------------------------------------------
   Les feuilles calculées du Draftsman de l'éditeur (29-draftsman.js), refaites
   sur le modèle lu : les mêmes briques (dfNouvelle, dfTexte, dfTableau,
   dfSymbole, dfCote…), donc le même aperçu et le même PDF cherchable. Ce que
   l'éditeur tire de sa carte (empilage, vias, notes), elles le lisent dans le
   fichier ; les cotes et détails posés à la main restent dans l'éditeur.
   L'entrée est celle de la fiche de mesure (mesEntreeIpc, 09-fiche-mesure.js).
   ========================================================================== */
function plnEchelle(m){return /INCH/i.test(m.unites||"")?25.4:/MICRON/i.test(m.unites||"")?0.001:1;}

/* Les trous, rangés par outil : diamètre, métallisation, portée (couches du
   fichier) et longueur d'une fente. */
function plnPercages(m){
  const k=plnEchelle(m), g=new Map();
  for(const t of (m.percages||[])){
    if(!(t.d>0))continue;
    const plaque=!/NON/i.test(t.p||""), via=/VIA/i.test(t.p||""), L=t.l>t.d?t.l*k:0;
    const portee=!plaque?"—":t.sa!=null&&t.sb!=null?(m.couches[t.sa]||"?")+" – "+(m.couches[t.sb]||"?"):"traversant";
    const cle=[fmt(t.d*k,3),plaque,portee,fmt(L,3)].join("|");
    let e=g.get(cle);
    if(!e)g.set(cle,e={d:t.d*k,L,plaque,portee,usages:new Set(),pts:[]});
    e.usages.add(via?"vias":plaque?"pastilles":"fixation");
    e.pts.push({x:t.x*k,y:t.y*k});
  }
  return [...g.values()].sort((u,v)=>(v.plaque-u.plaque)||(u.d-v.d)||u.portee.localeCompare(v.portee));
}
const plnMm=(v,n)=>fmt(v,n==null?2:n).replace(".",",");

function plnFeuillesFab(m,E,ctx){
  const F=dfNouvelle(ctx,"Plan de fabrication","fab");
  const Z=dfZone(F), colW=Z.cart.w, colX=Z.x2-colW;
  const V=mesVue(E,{x:Z.x1+12,y:Z.y1,w:colX-Z.x1-24,h:Z.y2-Z.y1-12},false);
  F.echelle=dfEchelleTxt(V.k);
  dfTexte(F,"VUE DE DESSUS — ÉCHELLE "+F.echelle,Z.x1,Z.y1+5,9,{gras:true,cat:"titre"});
  dfCalque(F,"CONTOUR");
  if(E.contour.length)dfPoly(F,E.contour.map(p=>V.T(p.x,p.y)),{ferme:true,lw:0.45});
  for(const d of E.decoupes)dfPoly(F,d.map(p=>V.T(p.x,p.y)),{ferme:true,lw:0.35});
  const groupes=plnPercages(m), rs=clamp(V.k*0.35,0.7,1.3);
  dfCalque(F,"PERCAGE");
  groupes.forEach((e,i)=>{for(const p of e.pts){const s=V.T(p.x,p.y);dfSymbole(F,i,s.x,s.y,rs);}});
  dfCalque(F);
  if(E.contour.length){                          // cotes hors tout, Y vers le haut : le bas est y1
    const B=mecaBoite(E.contour);
    dfCote(F,V.T(B.x1,B.y1),V.T(B.x2,B.y1),"h",7,plnMm(B.x2-B.x1)+" mm");
    dfCote(F,V.T(B.x1,B.y2),V.T(B.x1,B.y1),"v",7,plnMm(B.y2-B.y1)+" mm");
  }

  /* colonne de droite : perçage, empilage, notes */
  const blocs=[dfBlocTitre("Tableau de perçage"),...dfTableau(
    [{t:"Symb.",p:9,a:"m"},{t:"Ø fini (mm)",p:16,a:"d"},{t:"Qté",p:10,a:"d"},{t:"Métallisé",p:14,a:"m"},
     {t:"Portée",p:24,a:"m"},{t:"Usage",p:27}],
    groupes.map(e=>["",plnMm(e.d)+(e.L?" × "+plnMm(e.L)+" oblong":""),String(e.pts.length),e.plaque?"Oui":"Non",
                    e.portee,[...e.usages].join(", ")]).concat([["","Total",String(groupes.reduce((a,e)=>a+e.pts.length,0)),"","",""]]),
    {symbole:(G,ri,cx,cy)=>{if(ri<groupes.length)dfSymbole(G,ri,cx,cy,1.05);},gras:ri=>ri===groupes.length,cat:"percage"})];
  const k=plnEchelle(m), couches=(m.empilage||[]).slice().sort((a,b)=>a.seq-b.seq);
  const total=+m.epaisseur>0?m.epaisseur*k:couches.reduce((a,c)=>a+(+c.ep||0),0)*k;
  const nCu=couches.filter(c=>/COPPER/i.test(c.mat||"")).length||(V.couches||[]).filter(c=>c.cuivre).length;
  if(couches.length)blocs.push(dfBlocEspace(4),dfBlocTitre("Empilage"),...dfTableau(
    [{t:"Couche",p:26},{t:"Type",p:20},{t:"Ép. (mm)",p:14,a:"d"},{t:"Matériau",p:28},{t:"εr",p:10,a:"d"}],
    couches.map(c=>[c.nom,c.type||"",plnMm((+c.ep||0)*k,3),c.mat||"",c.dk?String(c.dk).replace(".",","):"—"])
      .concat([["Total","",plnMm(total,3),"",""]]),
    {gras:ri=>ri===couches.length,cat:"empilage"}));
  const notes=["Fabriquer selon IPC-6012, classe 2 ; contrôle d'aspect selon IPC-A-600, classe 2.",
    "Épaisseur finie : "+plnMm(total)+" mm ± 10 % ; "+nCu+" couche(s) de cuivre — voir l'empilage.",
    "Diamètres de perçage FINIS, après métallisation ; tolérance ± 0,08 mm (métallisés), ± 0,05 mm (non métallisés).",
    "Données tirées du fichier IPC-2581 « "+(V.fichier||ctx.projet)+" » : matériaux et finition à confirmer avec le fabricant.",
    "Cotes en millimètres, vue de dessus, sauf indication contraire."];
  blocs.push(dfBlocEspace(2),dfBlocTitre("Notes de fabrication"),
    ...dfBlocParagraphes(notes.map((t,i)=>({num:(i+1)+".",texte:t,retrait:6}))));
  return dfFlux(ctx,F,{x:colX,y:Z.y1,w:colW,bas:Z.cart.y-4},blocs,"Plan de fabrication","fab");
}

/* Assemblage d'une face : contour, pastilles en gris, corps, broche 1,
   repères ; valeur, boîtier et référence en texte invisible, cherchable ;
   non montés en tirets, « NM ». */
function plnFeuilleAsm(E,ctx,dessous){
  const F=dfNouvelle(ctx,"Assemblage — face "+(dessous?"dessous":"dessus"),dessous?"asmB":"asmT");
  const Z=dfZone(F), V=mesVue(E,{x:Z.x1,y:Z.y1+4,w:Z.x2-Z.x1,h:Z.cart.y-6-(Z.y1+4)},dessous);
  F.echelle=dfEchelleTxt(V.k);
  const face=dessous?"dessous":"dessus";
  const comps=E.composants.filter(c=>c.face===face).sort((a,b)=>String(a.ref).localeCompare(String(b.ref),"fr",{numeric:true}));
  const nm=comps.filter(c=>c.monte===false);
  dfTexte(F,(dessous?"VUE DE DESSOUS (carte retournée, vue en miroir)":"VUE DE DESSUS")+" — ÉCHELLE "+F.echelle,
          Z.x1,Z.y1+5,9,{gras:true,cat:"titre"});
  dfTexte(F,comps.length+" composant(s) sur cette face"+(nm.length?" — "+nm.length+" non monté(s), en tirets : "+
          nm.map(c=>c.ref).join(", "):""),Z.x1,Z.y1+10,6.5,{c:0.3,cat:"legende"});
  dfCalque(F,"CONTOUR");
  if(E.contour.length)dfPoly(F,E.contour.map(p=>V.T(p.x,p.y)),{ferme:true,lw:0.4});
  for(const d of E.decoupes)dfPoly(F,d.map(p=>V.T(p.x,p.y)),{ferme:true,lw:0.35});
  dfCalque(F,"PASTILLES");
  for(const c of comps)for(const p of c.pads){
    const pts=p.pts.map(q=>V.T(q.x,q.y));
    dfPoly(F,pts,{ferme:true,lw:0.08,trait:0.55,plein:0.9});
    if(p.net){const s=V.T(p.x,p.y);dfTexte(F,p.net,s.x,s.y,3,{ancre:"m",cache:true,cat:"net",lieu:c.ref+" · broche "+p.n});}
  }
  dfCalque(F,"COMPOSANTS");
  for(const c of comps){
    if(c.corps.length<3)continue;
    const monte=c.monte!==false, pts=c.corps.map(p=>V.T(p.x,p.y)), b=mecaBoite(pts);
    dfPoly(F,pts,{ferme:true,lw:monte?0.25:0.2,trait:monte?0:0.35,tirets:!monte});
    const p1=c.pads.length>2&&c.pads.find(p=>String(p.n)==="1");
    if(p1&&monte){const s=V.T(p1.x,p1.y);dfCercle(F,s.x,s.y,clamp(0.35*V.k,0.3,0.9),{plein:0,trait:null});}
    const cx=(b.x1+b.x2)/2, cy=(b.y1+b.y2)/2, bw=b.x2-b.x1, bh=b.y2-b.y1, vertical=bh>bw*1.15;
    const long=vertical?bh:bw, court=vertical?bw:bh, ref=String(c.ref||"?");
    let hmm=clamp(court*0.55,0.9,3.2);
    const lw=dfLargeur(ref,hmm/DF_PT,true);
    if(lw>long*0.92)hmm=Math.max(0.9,hmm*long*0.92/lw);
    const pt=hmm/DF_PT, cible={x1:b.x1,y1:b.y1,x2:b.x2,y2:b.y2};
    if(vertical)dfTexte(F,ref,cx+hmm*0.35,cy,pt,{ancre:"m",rot:90,gras:true,c:monte?0:0.4,cible,cat:"repere"});
    else dfTexte(F,ref,cx,cy+hmm*0.35,pt,{ancre:"m",gras:true,c:monte?0:0.4,cible,cat:"repere"});
    if(!monte)dfTexte(F,"NM",b.x2+0.4,b.y1+1.6,5,{c:0.35,cible,cat:"nm"});
    for(const [v,cat] of [[c.val,"valeur"],[c.pkg,"boitier"],[c.mpn,"mpn"]])
      if(v)dfTexte(F,ref+" "+v,cx,cy,pt,{ancre:"m",cache:true,cible,cat});
    F.signets.push({titre:ref+(c.val?" — "+c.val:"")+(monte?"":" (NM)"),x:cx,y:cy});
  }
  dfCalque(F);
  return F;
}

function plnIpcFeuilles(){
  const m=V.modele, E=mesEntreeIpc(m), ctx=mecaIpcCtx();
  ctx.docNum=mecaIpcBase()+"-PLANS";
  const F=plnFeuillesFab(m,E,ctx);
  F.push(plnFeuilleAsm(E,ctx,false));
  if(E.composants.some(c=>c.face==="dessous"))F.push(plnFeuilleAsm(E,ctx,true));
  F.forEach((f,i)=>dfCadre(f,ctx,i+1,F.length));
  return F;
}
function plnIpcFermer(){const m=document.getElementById("modalePlans");if(m)m.hidden=true;}
function plnOuvrir(){
  if(!V.modele){hint("Aucune carte ouverte : pas de plans.");return;}
  let m=document.getElementById("modalePlans");
  if(!m){
    m=document.createElement("div");
    m.id="modalePlans";m.className="modal-overlay";m.tabIndex=-1;
    m.setAttribute("role","dialog");m.setAttribute("aria-modal","true");m.setAttribute("aria-label","Plans de fabrication et d'assemblage");
    m.innerHTML='<div class="modal-box meca-box"><header class="modal-head"><div>'+
      '<h3>Plans (Draftsman) — fabrication et assemblage</h3><small id="plnEtat"></small></div><div class="meca-actions">'+
      '<button class="tb on" type="button" data-a="pdf" title="Les plans en PDF : texte cherchable, signets par composant">⬇ Télécharger le PDF</button>'+
      '<button class="pnl-btn" type="button" data-a="fermer" title="Fermer (Échap)">✕</button></div></header>'+
      '<div class="modal-body meca-corps"><main class="meca-apercu" id="plnApercu"></main></div></div>';
    document.body.appendChild(m);
    m.addEventListener("pointerdown",ev=>{if(ev.target===m)plnIpcFermer();});
    m.addEventListener("keydown",ev=>{if(ev.key==="Escape"){ev.stopPropagation();plnIpcFermer();}});
    m.addEventListener("click",ev=>{
      const b=ev.target.closest&&ev.target.closest("[data-a]");
      if(!b)return;
      if(b.dataset.a==="fermer")plnIpcFermer();
      else if(b.dataset.a==="pdf"){
        const F=plnIpcFeuilles(), nom=mecaIpcBase()+"-PLANS.pdf", refs=(V.modele.composants||[]).map(c=>c.ref);
        telecharger(new Blob([dfPdf(F,{titre:mecaIpcBase()+" — plans de fabrication et d'assemblage",auteur:"",fonte:true,
          sujet:"Plans de fabrication et d'assemblage — "+mecaIpcBase(),
          motsCles:["PCB","fabrication","assemblage"].concat(refs.slice(0,400)).join(", ")})],{type:"application/pdf"}),nom);
        hint("Plans "+nom+" : "+F.length+" feuille(s), texte cherchable.");
      }
    });
  }
  const F=plnIpcFeuilles();
  document.getElementById("plnApercu").innerHTML=F.map(f=>dfSvg(f)).join("");
  document.getElementById("plnEtat").textContent=F.map(f=>f.titre).join(" · ");
  m.hidden=false;
  if(m.focus)m.focus();
}
(function(){
  const b=typeof document!=="undefined"&&document.getElementById&&document.getElementById("bPlansDf");
  if(b)b.onclick=plnOuvrir;
})();
