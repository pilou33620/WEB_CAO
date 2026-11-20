/* ==========================================================================
   55-capa-vias.js — via de masse automatique des condensateurs de découplage
   --------------------------------------------------------------------------
   Une capa CMS dont une patte est sur un net d'alimentation et l'autre sur la
   masse reçoit un via de masse (taille de la classe du net, traversant) au
   plus près de sa pastille de masse, relié par une courte piste à la largeur
   de la classe. Le via se place du côté de la patte de masse du CI découplé
   (la boucle la plus courte), là où la place le permet : isolement du DRC,
   bord de carte, et une digue de vernis entre la pastille et le via (pas de
   via dans la pastille, qui boirait la soudure).

   Deux déclenchements :
   - l'option « Vias de masse auto » (S.rule.capaVia) : à la pose ou au
     déplacement d'une capa, son via est posé ou replacé ;
   - le bouton « Vias des capas » : toutes les capas qui n'en ont pas.
   ========================================================================== */

/* {fp, g, p, l} : pastille de masse, pastille d'alimentation, couche — ou null */
function capaDecouplage(fp){
  if(!fp||!/^C[0-9]/i.test(String(fp.ref||"")))return null;
  const ps=padsWorld(fp);
  if(ps.length!==2)return null;
  const g=ps.find(q=>q.net&&pcbNomEstMasse(q.net));
  const p=ps.find(q=>q!==g&&q.net&&!pcbNomEstMasse(q.net)&&(pcbNomEstAlim(q.net)||isPower(q.net)));
  if(!g||!p||g.drill>0)return null;         // une traversante relie déjà toutes les couches
  return {fp,g,p,l:fp.side?S.cu-1:0};
}

/* La patte de masse du CI découplé : le boîtier (hors passifs) qui partage
   l'alimentation de la capa, le plus proche ; sur lui, la pastille de masse
   la plus proche de celle de la capa. null s'il n'y en a pas. */
function capaCibleMasse(c){
  let best=null, bd=1e9;
  for(const f of S.fps){
    if(f===c.fp||/^(C|R|L|FB)[0-9]/i.test(String(f.ref||"")))continue;
    const ps=padsWorld(f);
    if(!ps.some(q=>q.net===c.p.net))continue;
    for(const q of ps){
      if(q.net!==c.g.net)continue;
      const d=dist(q.x,q.y,c.g.x,c.g.y);
      if(d<bd){bd=d;best=q;}
    }
  }
  return best;
}

/* Les vias de masse déjà posés pour cette capa, avec leur piste : un via dans
   la pastille, ou relié à elle par une piste de la couche de la pastille. */
function capaViasExistants(c){
  const out=[];
  const dansPad=(x,y)=>padDist(x,y,c.g)<=1e-3;
  for(const v of S.vias){
    if(v.net!==c.g.net||c.l<v.a||c.l>v.b)continue;
    if(padDist(v.x,v.y,c.g)<=v.d/2){out.push({v,pistes:[]});continue;}
    const pistes=S.tracks.filter(t=>t.net===c.g.net&&t.l===c.l&&
      ((dansPad(t.x1,t.y1)&&dist(t.x2,t.y2,v.x,v.y)<=v.d/2)||(dansPad(t.x2,t.y2)&&dist(t.x1,t.y1,v.x,v.y)<=v.d/2)));
    if(pistes.length){out.push({v,pistes});continue;}
    /* le via posé ici pour cette capa, dont la piste a été étirée en plusieurs segments par un déplacement */
    const ch=v.capa===c.fp.id&&capaChaine(c,v);
    if(ch)out.push({v,pistes:ch});
  }
  return out;
}
/* Les pistes qui mènent de la pastille de masse au via, bout à bout (6 segments au plus), ou null. */
function capaChaine(c,v){
  // du centre de la pastille d'abord : un bout de piste resté dans la pastille fait partie de la chaîne
  const pres=t=>Math.min(dist(t.x1,t.y1,c.g.x,c.g.y),dist(t.x2,t.y2,c.g.x,c.g.y));
  const T=S.tracks.filter(t=>t.net===c.g.net&&t.l===c.l).sort((a,b)=>pres(a)-pres(b));
  const aller=(x,y,vus)=>{
    if(vus.length>=6)return null;
    for(const t of T){
      if(vus.includes(t))continue;
      for(const [ax,ay,bx,by] of [[t.x1,t.y1,t.x2,t.y2],[t.x2,t.y2,t.x1,t.y1]]){
        if(!(vus.length?dist(ax,ay,x,y)<=1e-3:padDist(ax,ay,c.g)<=1e-3))continue;
        const suite=vus.concat([t]);
        if(dist(bx,by,v.x,v.y)<=v.d/2)return suite;
        const r=aller(bx,by,suite);
        if(r)return r;
      }
    }
    return null;
  };
  return aller(0,0,[]);
}

/* La meilleure place pour le via de la capa `c`, ou null. `skip` : le cuivre
   à ignorer (l'ancien via et sa piste, qu'on remplace). Les candidats, sur
   des anneaux autour de la pastille, sont classés d'abord ; le premier qui
   passe tous les contrôles l'emporte. */
function capaViaPlace(c,skip){
  if(S.cu<2)return null;
  const g=c.g, net=g.net, v0=mkVia(g.x,g.y,net,0,S.cu-1), w=defaultWidth(net,c.l);
  // pastille → via : la demi-taille du via, la dilatation du vernis et une digue
  const digue=(typeof vernisDigueMin==="function"?vernisDigueMin():0.1)+Math.max(0,+S.rule.mask||0);
  const T=capaCibleMasse(c);
  const autres=S.fps.filter(f=>f!==c.fp).map(f=>fpBBox(f));
  const R=Math.hypot(g.w,g.h)/2;
  const cands=[];
  for(let r=0.1;r<=R+3;r+=0.1)
    for(let k=0;k<32;k++){
      const a=k*Math.PI/16, x=r3(g.x+r*Math.cos(a)), y=r3(g.y+r*Math.sin(a));
      const dp=dist(x,y,g.x,g.y);
      let s=1.5*dp;
      if(T)s+=dist(x,y,T.x,T.y);
      // sans CI : pas entre les deux pattes, du côté opposé à l'alimentation
      else s+=2*Math.max(0,dist(g.x,g.y,c.p.x,c.p.y)-dist(x,y,c.p.x,c.p.y));
      if(autres.some(b=>x>=b.x1&&x<=b.x2&&y>=b.y1&&y<=b.y2))s+=2;   // sous un autre boîtier : en dernier recours
      cands.push({x,y,s});
    }
  cands.sort((a,b)=>a.s-b.s);
  const N=pnsWorld();
  for(const o of cands){
    if(padDist(o.x,o.y,g)<v0.d/2+digue)continue;          // la digue de vernis, pas de via dans la pastille
    if(padDist(o.x,o.y,c.p)<v0.d/2+clrK(net,c.p.net,"cu","via"))continue;
    if(!inBoard(o.x,o.y,S.rule.edge+v0.d/2))continue;
    const v=mkVia(o.x,o.y,net,0,S.cu-1);
    if(viaIsole(v,null,skip)||viaPaire(v,skip)||viaTrou(v,skip))continue;
    const t={l:c.l,net,w,x1:g.x,y1:g.y,x2:v.x,y2:v.y};
    if(N.segBad(t,c.l,net,w,skip||new Set()))continue;
    return {v,t};
  }
  return null;
}

/* Pose (ou replace) le via de masse de la capa. `replacer` : l'ancien via
   posé pour elle est retiré si une meilleure place existe. Rend "pose",
   "deja", "place" (pas de place) ou "" (pas une capa de découplage). */
function capaViaPoser(fp,replacer){
  const c=capaDecouplage(fp);
  if(!c)return "";
  if(S.cu<2)return "place";
  const ex=capaViasExistants(c);
  if(ex.length&&!replacer)return "deja";
  // seuls les vias posés par cette fonction sont replacés, jamais ceux de l'utilisateur
  const miens=ex.filter(e=>e.v.capa===fp.id);
  if(ex.length&&!miens.length)return "deja";
  const skip=new Set();
  for(const e of miens){skip.add(e.v);for(const t of e.pistes)skip.add(t);}
  const pl=capaViaPlace(c,skip);
  if(!pl)return miens.length?"deja":"place";
  if(miens.length){
    S.vias=S.vias.filter(v=>!skip.has(v));
    S.tracks=S.tracks.filter(t=>!skip.has(t));
  }
  pl.v.capa=fp.id;
  S.vias.push(pl.v);
  S.tracks.push(pl.t);
  touch();
  return "pose";
}

/* Après une pose ou un déplacement : les capas de `fps`, si l'option est active.
   Pas d'étape d'historique : celle du geste couvre aussi le via. */
function capaViasAuto(fps){
  if(!S.rule||!S.rule.capaVia||S.cu<2)return 0;
  let n=0;
  for(const f of fps||[])if(f&&capaViaPoser(f,true)==="pose")n++;
  if(n){zoneCache.clear();if(typeof refreshPanels==="function")refreshPanels();}
  return n;
}

/* Le bouton : toutes les capas de découplage qui n'ont pas encore leur via. */
function capaViasTous(){
  if(S.cu<2){hint("Une seule couche de cuivre : un via n'aurait rien à relier.");return {poses:0,place:0};}
  const caps=S.fps.filter(f=>capaDecouplage(f)&&!capaViasExistants(capaDecouplage(f)).length);
  if(!caps.length){hint("Aucune capa de découplage sans via de masse (CMS, une patte d'alimentation, une de masse).");return {poses:0,place:0};}
  push();
  let poses=0, place=0;
  for(const f of caps){const r=capaViaPoser(f,false);if(r==="pose")poses++;else if(r==="place")place++;}
  if(!poses)S.undo.pop();                    // rien posé : pas d'étape vide
  zoneCache.clear();touch();refreshPanels();draw();
  hint(poses+" via(s) de masse posé(s) près des capas de découplage"+
       (place?" · "+place+" capa(s) sans place libre (isolement, bord, voisins)":"")+
       (poses?" — Ctrl+Z les retire.":"."));
  return {poses,place};
}

function capaViaBasculer(){
  push();
  S.rule.capaVia=!S.rule.capaVia;touch();
  capaViaBouton();
  hint(S.rule.capaVia?"Vias de masse auto : une capa de découplage posée ou déplacée reçoit son via.":
                      "Vias de masse auto : coupé.");
}
function capaViaBouton(){
  const b=typeof document!=="undefined"&&$("bCapaViaAuto");
  if(b)b.classList.toggle("on",!!(S.rule&&S.rule.capaVia));
}

(function(){
  if(typeof document==="undefined")return;
  const on=(id,f)=>{const b=$(id);if(b)b.onclick=f;};
  on("bCapaVias",()=>capaViasTous());
  on("bCapaViaAuto",()=>capaViaBasculer());
  capaViaBouton();
})();
