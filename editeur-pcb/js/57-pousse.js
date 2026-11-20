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
/* Les erreurs du DRC, comptées par code et lieu (`drcCle`), sans les remarques ni
   les liaisons non routées : celles qu'ouvre une poussée se disent à part
   (re-router), elles ne disqualifient pas une place. */
function pousseFautes(){
  const garde=[S.drc,S.drcRun,S.drcExclues,S.drcVus,S.drcIgnores], n=new Map();
  try{
    runDrc();
    for(const e of S.drc)if(!e.info&&e.kind!=="non-routee"){const k=drcCle(e);n.set(k,(n.get(k)||0)+1);}
  }finally{[S.drc,S.drcRun,S.drcExclues,S.drcVus,S.drcIgnores]=garde;}
  return n;
}
/* Ce qu'un essai de place peut changer (`transformFps` : le boîtier, ses pistes et
   ses vias, les liaisons à re-router), remis en l'état sans changer les objets. */
function pousseCliche(f){
  const T=S.tracks.slice(), V=S.vias.slice();
  return {A:S.tracks,B:S.vias,T,V,t:T.map(o=>({...o})),v:V.map(o=>({...o})),f,x:f.x,y:f.y,r:S.aRerouter.slice()};
}
function pousseRendre(c){
  const remet=(L,C)=>L.forEach((o,i)=>{for(const k of Object.keys(o))if(!(k in C[i]))delete o[k];Object.assign(o,C[i]);});
  remet(c.T,c.t);remet(c.V,c.v);
  S.tracks=c.A;S.tracks.length=0;S.tracks.push(...c.T);
  S.vias=c.B;S.vias.length=0;S.vias.push(...c.V);
  c.f.x=c.x;c.f.y=c.y;S.aRerouter=c.r;
  touch();
}
/* Au relâchement : les voisins recouverts par les boîtiers `ids` font de la place.
   Une place n'est retenue que si le voisin ET le cuivre qui le suit n'y ajoutent
   aucune erreur au DRC : la place est essayée pour de bon, et défaite sinon.
   Le voisin qui n'en trouve aucune n'est pas poussé (la garde anti-collision
   tranche alors le geste), et ça se dit. */
function pousseAuDepot(ids){
  if(!S.pousse||!S.avoid||!ids.length||(typeof drag!=="undefined"&&drag))return 0;
  const tires=new Set(ids), refs=[], restes=new Set();
  let ouvertes=null;                              // liaisons ouvertes avant la première poussée
  for(let tour=0;tour<24;tour++){
    let v=null;
    for(const id of [...tires]){
      const f=fpById(id);
      if(!f)continue;
      for(const k of fpGeneTous(f,new Set([f]))){
        const o=k[0]==="F"?fpById(+k.slice(1)):null;
        if(o&&!tires.has(o.id)&&!restes.has(o.id)&&pousseVoisinOk(o)){v=o;break;}
      }
      if(v)break;
    }
    if(!v)break;
    if(ouvertes==null)ouvertes=conn().unrouted;
    const base=pousseFautes();
    let essais=0;
    const p=fpPlaceLibre([v],false,(dx,dy)=>{
      if(essais++>=24)return null;              // places essayées par voisin, au plus : chacune coûte un DRC
      const c=pousseCliche(v);
      transformFps([v.id],()=>{v.x=r3(v.x+dx);v.y=r3(v.y+dy);});
      touch();
      const apres=pousseFautes();
      if([...apres].every(([k,n])=>n<=(base.get(k)||0)))return true;
      pousseRendre(c);
      return false;
    });
    if(!p||(!p.dx&&!p.dy)){restes.add(v.id);continue;}   // nulle part où aller : la garde anti-collision tranchera
    tires.add(v.id);                             // il est posé : il ne se repousse pas, il peut pousser
    refs.push(v.ref);
  }
  const nonPousses=[...restes].map(id=>fpById(id)).filter(Boolean).map(f=>f.ref);
  const dit=nonPousses.length?nonPousses.join(", ")+" non poussé"+(nonPousses.length>1?"s":"")+
    " : aucune place proche où lui et son cuivre ne créent de faute DRC":"";
  pousseAuDepot.dit=dit;                         // la garde anti-collision le redit si elle annule le geste
  if(refs.length||nonPousses.length){
    refreshPanels();draw();
    hint((refs.length?refs.join(", ")+(refs.length>1?" poussés":" poussé")+" à la place libre la plus proche"+
         // le cuivre d'un voisin poussé ne suit pas toujours : le dire, pas seulement le chevelu
         (conn().unrouted>ouvertes?" · "+(conn().unrouted-ouvertes)+" liaison(s) ouverte(s) par la poussée, à re-router":""):"")+
         (dit?(refs.length?" · ":"")+dit:"")+
         " — Ctrl+Z défait le geste entier.");
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
