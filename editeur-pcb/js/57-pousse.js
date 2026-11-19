"use strict";
/* ==========================================================================
   57-pousse.js — pousser au lieu de buter (Altium : « Push » des composants,
   glissement de piste qui écarte ses voisines)
   --------------------------------------------------------------------------
   Deux gestes, une même idée : ce qu'on déplace ne s'arrête plus contre son
   voisin, c'est le voisin qui fait de la place.

   BOÎTIERS (« Pousser les boîtiers », coupé d'usine) : un boîtier tiré passe
   par-dessus ses voisins ; au relâchement, chaque voisin recouvert rejoint la
   place libre la plus proche, son cuivre avec lui (`transformFps`). Un voisin
   verrouillé ne se pousse pas : le geste bute sur lui comme avant.
   shortcut: la poussée se fait au relâchement, pas pendant le geste ; à porter
   dans `dragMoveBy` si l'on veut voir les voisins s'écarter en direct.

   PISTES : en conduite « pousser » (Règles > Face à un obstacle), une piste
   qu'on fait glisser écarte les pistes voisines avec le moteur du tracé
   (`pnsShoveHeads`) ; une pastille ou un via ne s'écartent pas, la piste y
   bute toujours.
   ========================================================================== */
function pousseVoisinOk(o){return !!o&&!o.locked;}
/* Pendant le geste : en mode pousser, un boîtier qui ne recouvre que des boîtiers
   poussables ne bute pas. */
function pousseLaissePasser(f,skip){
  if(!S.pousse)return false;
  const G=fpGeneTous(f,skip);
  return G.size>0&&[...G].every(k=>k[0]==="F"&&pousseVoisinOk(fpById(+k.slice(1))));
}
/* Au relâchement : les voisins recouverts par les boîtiers `ids` font de la place. */
function pousseAuDepot(ids){
  if(!S.pousse||!S.avoid||!ids.length||(typeof drag!=="undefined"&&drag))return 0;
  const tires=new Set(ids), refs=[];
  for(let tour=0;tour<24;tour++){
    let v=null;
    for(const id of [...tires]){
      const f=fpById(id);
      if(!f)continue;
      for(const k of fpGeneTous(f,new Set([f]))){
        const o=k[0]==="F"?fpById(+k.slice(1)):null;
        if(o&&!tires.has(o.id)&&pousseVoisinOk(o)){v=o;break;}
      }
      if(v)break;
    }
    if(!v)break;
    const p=fpPlaceLibre([v]);
    if(!p||(!p.dx&&!p.dy))break;                 // nulle part où aller : la garde anti-collision tranchera
    transformFps([v.id],()=>{v.x=r3(v.x+p.dx);v.y=r3(v.y+p.dy);});
    touch();
    tires.add(v.id);                             // il est posé : il ne se repousse pas, il peut pousser
    refs.push(v.ref);
  }
  if(refs.length){
    refreshPanels();draw();
    hint(refs.join(", ")+(refs.length>1?" poussés":" poussé")+" à la place libre la plus proche — Ctrl+Z défait le geste entier.");
  }
  return refs.length;
}
/* Une piste qu'on glisse écarte ses voisines. Posé à chaque mouvement, après les articulations. */
function pousseGlisse(){
  const F=typeof drag!=="undefined"&&drag&&drag.follow;
  if(!F||!F.base||F.fps.length||F.vias.length)return;      // boîtier ou via tiré : `followShove` s'en charge
  F.shove=null;S.dragShove=null;
  if(routeMode()!=="shove")return;
  const heads=[];
  for(const t of movedTracks()){
    if(dist(t.x1,t.y1,t.x2,t.y2)<1e-9)continue;
    for(const s of trkSegs(t))heads.push({l:t.l,net:t.net,w:t.w,pts:[{x:s.x1,y:s.y1},{x:s.x2,y:s.y2}]});
  }
  if(!heads.length||!heads.some(h=>F.base.firstObstacle(h,null)))return;   // rien ne gêne
  let r=null;
  try{r=pnsShoveHeads(F.base,heads,null,Date.now(),{tendre:true});}catch(_){r=null;}
  if(!r||!r.ok||!(r.lignes&&r.lignes.length))return;
  if((r.vias||[]).some(Boolean))return;                     // un via ne se pousse pas en glissant une piste
  for(const L of r.lignes)if(dpOfNet(L.net))return;         // ni une paire, brin par brin
  // ce qui ne s'écarte pas (pastille, via) : la piste y bute toujours
  if(r.node&&heads.some(h=>r.node.firstObstacle(h,null)))return;
  F.shove=r;S.dragShove=r;
}
(function(){
  const b=typeof $==="function"&&$("bPousse");
  if(!b)return;
  const maj=()=>b.classList.toggle("on",!!S.pousse);
  b.onclick=()=>{
    S.pousse=!S.pousse;maj();
    if(typeof profilNoter==="function")profilNoter();
    hint(S.pousse?"Pousser les boîtiers : un boîtier tiré sur ses voisins les écarte au relâchement (les verrouillés restent)."
                 :"Pousser les boîtiers coupé : un boîtier tiré bute de nouveau sur ses voisins.");
  };
  if(typeof profLire==="function"&&typeof PCB_PROFIL!=="undefined"){
    const lu=profLire(PCB_PROFIL);
    if(lu&&typeof lu.pousse==="boolean")S.pousse=lu.pousse;
  }
  maj();
})();
