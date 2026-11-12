/* =============================================================================
   Éditeur PCB — inspecteur au survol, repères replacés en lot, zones modifiées
   en lot (conversion zone / région pleine / rectangle plein, net, remplissage).
   Les jeux de couches sont avec les autres boutons de couches (06-panels.js).
   ============================================================================= */

/* ---------- inspecteur au survol ---------- */
/* Le pointeur posé un instant sur un objet, en sélection, montre son net, sa
   couche, sa largeur et l'isolement de sa classe. Rien pendant un geste. */
const INSP={actif:true,minuteur:0};
try{INSP.actif=localStorage.getItem("cao.pcb.inspecteur")!=="0";}catch(_){}
const inspLong=v=>S.unite==="mil"?fmt(v/MIL,1)+" mil":(+fmt(v,3))+" mm";
const inspCouche=l=>(S.cuL[l]&&S.cuL[l].name)||cuId(l,S.cu);
/* les lignes de la bulle pour un résultat de hitTest ; [] : rien à dire */
function inspLignes(h){
  if(!h)return [];
  const iso=(net,k)=>{const c=classOf(net||"");
    return "Isolement "+inspLong(k!=null?k:c.clr)+(c.name?" · classe "+c.name:"");};
  if(h.track){const t=h.track;
    return ["Piste · "+(t.net||"sans net"),inspCouche(t.l)+" · largeur "+inspLong(t.w),iso(t.net,clrK(t.net||"","","trk","trk"))];}
  if(h.via){const v=h.via;
    return ["Via · "+(v.net||"sans net"),"Ø "+inspLong(v.d)+" · perçage "+inspLong(v.dr)+" · "+inspCouche(v.a)+" → "+inspCouche(v.b),iso(v.net,clrK(v.net||"","","via","via"))];}
  if(h.pad){const q=h.pad;
    return ["Pastille "+padDesig(h.fp,q)+" · "+(q.net||"sans net"),
      inspLong(q.w)+" × "+inspLong(q.h)+(q.drill>0?" · perçage "+inspLong(q.drill):" · CMS "+(h.fp.side?"dessous":"dessus")),
      iso(q.net,Math.max(clrK(q.net||"","",q.drill>0?"th":"smd","trk"),q.clr>0?q.clr:0))];}
  if(h.fp||h.fpText){const f=h.fp||h.fpText;
    return [f.ref+(f.value?" · "+f.value:""),(f.pkg||"")+" · "+(f.side?"dessous":"dessus")+" · "+(+fmt(f.rot||0,1))+"°"];}
  if(h.zone){const z=h.zone;
    return [(z.plein?"Région pleine":z.hachure?"Zone hachurée":"Zone")+" · "+(z.net||"sans net"),
      inspCouche(z.l)+(z.nom?" · "+z.nom:""),"Isolement "+inspLong(clrZone(z,"","cu","trk"))];}
  if(h.hole)return ["Trou NPTH","Ø "+inspLong(h.hole.d)];
  return [];
}
function inspCacher(){
  clearTimeout(INSP.minuteur);
  const b=$("inspBulle");if(b)b.hidden=true;
}
function inspMontrer(cx,cy){
  const b=$("inspBulle"), w=$("canvasWrap");
  if(!b||!w||!INSP.actif||S.mode!=="select")return;
  const L=inspLignes(hitTest(S.mouse.x,S.mouse.y));
  if(!L.length)return;
  b.innerHTML=L.map((t,i)=>i?esc(t):"<b>"+esc(t)+"</b>").join("<br>");
  const r=w.getBoundingClientRect();
  b.style.left=Math.min(cx-r.left+14,Math.max(0,r.width-240))+"px";
  b.style.top=(cy-r.top+18)+"px";
  b.hidden=false;
}
function inspBasculer(v){
  INSP.actif=v;
  try{localStorage.setItem("cao.pcb.inspecteur",v?"1":"0");}catch(_){}
  const e=$("bInspecteur");
  if(e){e.innerHTML="Inspecteur au survol : "+(v?"actif":"coupé");e.classList.toggle("on",v);}
  if(!v)inspCacher();
}

/* ---------- repères de sérigraphie replacés en lot ---------- */
/* Pose le repère de chaque composant au-dessus, au centre, en dessous, à
   gauche ou à droite de son encombrement, par ses décalages (refOffX/Y). */
function reperesPlacer(fps,pos){
  let n=0;
  for(const fp of fps){
    if(fp.locked)continue;
    const bb=fpBBox(fp), tp=fpTextPos(fp).ref, s=tp.size;
    const baseY=tp.y-(fp.refOffY||0);            // le repère d'usine : au-dessus
    const demiL=String(fp.ref||"").length*s*0.42;
    const cy=(bb.y1+bb.y2)/2;
    const cible={dessus:[fp.x,baseY],centre:[fp.x,cy],dessous:[fp.x,bb.y2+s*0.9],
      gauche:[bb.x1-demiL-s*0.3,cy],droite:[bb.x2+demiL+s*0.3,cy]}[pos];
    if(!cible)continue;
    const dx=r3(cible[0]-fp.x), dy=r3(cible[1]-baseY);
    if(dx)fp.refOffX=dx;else delete fp.refOffX;
    if(dy)fp.refOffY=dy;else delete fp.refOffY;
    n++;
  }
  return n;
}
function reperesCommande(pos,tous){
  const fps=tous?S.fps:[...S.sel.fps].map(fpById).filter(Boolean);
  if(!fps.length){hint("Repères : sélectionnez d'abord les composants, ou choisissez « tous les composants ».");return 0;}
  push();
  const n=reperesPlacer(fps,pos);
  touch();refreshPanels();draw();
  const v=fps.length-n;
  hint(n+" repère(s) replacé(s)"+(v?" · "+v+" composant(s) verrouillé(s) laissé(s)":"")+". Ctrl+Z annule.");
  return n;
}

/* ---------- zones modifiées en lot ---------- */
const ZL_TYPES=["inchangé","zone de cuivre","zone hachurée","polygone plein","rectangle plein"];
/* `o.type` : un des ZL_TYPES ; `o.net` : "" = inchangé, "(aucun)" = sans net */
function zonesLot(zs,o){
  for(const z of zs){
    const t=o.type;
    if(t==="zone de cuivre"){delete z.plein;delete z.hachure;}
    else if(t==="zone hachurée"){delete z.plein;if(!z.hachure)z.hachure={pas:1,larg:0.25};}
    else if(t==="polygone plein"||t==="rectangle plein"){z.plein=true;delete z.hachure;}
    if(t==="rectangle plein"){
      const b=polyBBox(z.pts);
      z.pts=[{x:b.x1,y:b.y1},{x:b.x2,y:b.y1},{x:b.x2,y:b.y2},{x:b.x1,y:b.y2}];
    }
    if(o.net==="(aucun)")z.net="";
    else if(o.net)z.net=o.net;
  }
  return zs.length;
}
function zonesLotCommande(o){
  const zs=[...S.sel.zones].filter(z=>!z.larme);
  if(!zs.length){hint("Zones : sélectionnez d'abord les zones à modifier (un clic sur leur bord, Ctrl+clic pour en ajouter).");return 0;}
  push();
  const n=zonesLot(zs,o);
  touch();refreshPanels();draw();
  hint(n+" zone(s) modifiée(s). Ctrl+Z annule.");
  return n;
}

(function(){
  const on=(id,f)=>{const b=$(id);if(b)b.onclick=f;};
  inspBasculer(INSP.actif);
  on("bInspecteur",()=>inspBasculer(!INSP.actif));
  if(typeof cv!=="undefined"&&cv&&cv.addEventListener){
    cv.addEventListener("pointermove",e=>{
      inspCacher();
      if(!INSP.actif||e.buttons||e.pointerType==="touch")return;
      INSP.minuteur=setTimeout(()=>inspMontrer(e.clientX,e.clientY),450);
    });
    for(const ev of ["pointerdown","pointerleave","wheel"])cv.addEventListener(ev,inspCacher);
  }
  on("bReperes",()=>{
    const nSel=S.sel.fps.size;
    vDialogue("Replacer les repères",[
      {id:"pos",label:"Position du repère",val:"au-dessus",options:["au-dessus","au centre","en dessous","à gauche","à droite"]},
      {id:"portee",label:"Composants",val:nSel?"la sélection ("+nSel+")":"tous les composants",
       options:(nSel?["la sélection ("+nSel+")"]:[]).concat(["tous les composants"])}],
      v=>reperesCommande({"au-dessus":"dessus","au centre":"centre","en dessous":"dessous","à gauche":"gauche","à droite":"droite"}[v.pos],
                         v.portee==="tous les composants"),"Replacer");
  });
  on("bZonesLot",()=>{
    const zs=[...S.sel.zones].filter(z=>!z.larme);
    if(!zs.length){zonesLotCommande({});return;}
    vDialogue("Modifier "+zs.length+" zone(s)",[
      {id:"type",label:"Convertir en",val:"inchangé",options:ZL_TYPES},
      {id:"net",label:"Net",val:"inchangé",options:["inchangé","(aucun)"].concat(netTable().map(n=>n.name))}],
      v=>zonesLotCommande({type:v.type,net:v.net==="inchangé"?"":v.net}),"Appliquer");
  });
})();
