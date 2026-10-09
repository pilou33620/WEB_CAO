"use strict";
/* =============================================================================
   editeur-pcb — 28-placement-satellites.js
   Placement des « satellites » : les petits composants qui n'ont de sens que
   collés à une broche précise d'un circuit.
   - Découplage : un condensateur entre une alimentation et la masse va contre
     la broche d'alimentation d'un circuit de ce net. Un par broche d'abord,
     le plus petit au plus près ; les plus gros passent derrière.
   - Série et liaison : un composant à deux pattes dont un net de signal ne
     touche qu'un seul circuit va contre cette broche (résistance série, pont
     de contre-réaction, condensateur de filtrage d'une référence…).
   - Chaîne : ce qui ne touche aucun circuit mais touche un satellite déjà
     posé va contre ce satellite (la LED derrière sa résistance, le
     condensateur au bout d'un pont).
   Chaque satellite est tourné pour que sa pastille du net partagé regarde la
   broche, puis posé à la première place libre en partant de la broche. Les
   points de test restent où on les a mis : ils se placent à la main.
   ============================================================================= */

/* Points de test : placés à la main, le placement automatique n'y touche pas. */
function placeManuelle(fp){return /^TP\d/i.test(String(fp&&fp.ref||""));}
/* Connecteurs : ni satellites ni circuits d'accueil, on les place à la main. */
function satConnecteur(fp){return /^(J|CN|CON|X?P)\d/i.test(String(fp&&fp.ref||""));}

function satEstMasse(n){
  if(!n)return false;
  if(typeof pcbNomEstMasse==="function"&&pcbNomEstMasse(n))return true;
  return /^(gnd|agnd|dgnd|pgnd|masse|0v|vss)$/i.test(String(n).replace(/\s/g,""));
}
function satEstAlim(n){
  if(!n||satEstMasse(n))return false;
  if(typeof pcbNomEstAlim==="function"&&pcbNomEstAlim(n))return true;
  return isPower(n)||className(n)==="Alimentation";
}
/* Valeur d'un condensateur en farads : « 100n », « 4.7u », « 4µ7 », « 6,8n ».
   Une valeur illisible passe en dernier (derrière les autres). */
function satValeurF(v){
  const m=String(v||"").trim().replace(",",".").match(/^(\d+(?:\.\d+)?)\s*([pnuµm]?)(\d*)/i);
  if(!m)return Infinity;
  const mult={p:1e-12,n:1e-9,u:1e-6,"µ":1e-6,m:1e-3,"":1}[m[2].toLowerCase()];
  return parseFloat(m[1]+(m[3]?"."+m[3]:""))*mult;
}

/* La carte en boîte englobante, l'empreinte entièrement dedans. */
function satDansCarte(bb,m){
  return inBoard(bb.x1,bb.y1,m)&&inBoard(bb.x2,bb.y1,m)&&
         inBoard(bb.x2,bb.y2,m)&&inBoard(bb.x1,bb.y2,m);
}
/* écart entre deux boîtes : de quoi passer une piste entre deux satellites */
const SAT_ECART=0.6;
function satChevauche(a,b,g){
  return a.x1<b.x2+g&&b.x1<a.x2+g&&a.y1<b.y2+g&&b.y1<a.y2+g;
}

/* Décalages essayés depuis la broche, du plus proche au plus loin : `o` en
   sortant du circuit (jusqu'à 20 mm), `t` le long de son côté (± 12 mm). */
const SAT_ESSAIS=(()=>{
  const out=[];
  for(let k=0;k<=40;k++)
    for(let l=0;l<=24;l++){
      const o=k*0.5, t=l*0.5;
      out.push({o,t,c:o+t*0.8});
      if(l)out.push({o,t:-t,c:o+t*0.8});
    }
  return out.sort((a,b)=>a.c-b.c);
})();
/* Pose `sat` contre la pastille `padHote` (coordonnées monde) d'un composant
   centré en (hx,hy). `padSatN` est la pastille du satellite qui doit regarder
   la broche. `obst` : boîtes déjà prises. Rend vrai si une place est trouvée. */
function satPoser(sat,padHote,hx,hy,padSatN,obst){
  let vx=padHote.x-hx, vy=padHote.y-hy;
  if(Math.hypot(vx,vy)<0.01){vx=0;vy=1;}
  /* on sort par le côté où se trouve la broche */
  const d=Math.abs(vx)>=Math.abs(vy)?{x:Math.sign(vx),y:0}:{x:0,y:Math.sign(vy)};
  const old={x:sat.x,y:sat.y,rot:sat.rot};
  /* orientation : la pastille partagée tournée vers la broche */
  let best=null;
  for(const r of [0,90,180,270]){
    sat.x=0;sat.y=0;sat.rot=r;
    const ps=padsWorld(sat), a=ps.find(q=>q.n===padSatN), o=ps.find(q=>q.n!==padSatN);
    if(!a||!o)continue;
    const s=-((a.x-o.x)*d.x+(a.y-o.y)*d.y);
    if(!best||s>best.s+1e-6)best={r,s,ax:a.x,ay:a.y,ah:Math.max(a.w,a.h)/2};
  }
  if(!best){Object.assign(sat,old);return false;}
  sat.rot=best.r;
  const hh=Math.max(padHote.w||0,padHote.h||0)/2;
  /* la pastille du satellite à 0,6 mm de la broche, dans l'axe de sortie */
  const gap=hh+best.ah+SAT_ECART;
  const bx=padHote.x+d.x*gap-best.ax, by=padHote.y+d.y*gap-best.ay;
  const px=-d.y, py=d.x;              // le long du côté du circuit
  for(const c of SAT_ESSAIS){
    sat.x=snapX(bx+d.x*c.o+px*c.t);
    sat.y=snapY(by+d.y*c.o+py*c.t);
    const bb=fpBBox(sat);
    if(!satDansCarte(bb,0.2))continue;
    if(obst.some(o=>satChevauche(bb,o,SAT_ECART)))continue;
    obst.push(bb);
    return true;
  }
  Object.assign(sat,old);
  return false;
}

/* Cherche une place libre au plus près de la position actuelle (empreinte
   laissée par le placement d'ensemble sur un satellite déjà posé). */
function satLibre(fp,obst){
  const x0=fp.x, y0=fp.y;
  for(let k=0;k<=60;k++){
    const r=k*0.5, n=k?Math.max(8,Math.round(2*Math.PI*r/0.5)):1;
    for(let i=0;i<n;i++){
      const a=2*Math.PI*i/n;
      fp.x=snapX(x0+r*Math.cos(a));fp.y=snapY(y0+r*Math.sin(a));
      const bb=fpBBox(fp);
      if(!satDansCarte(bb,0.2))continue;
      if(obst.some(o=>satChevauche(bb,o,SAT_ECART)))continue;
      obst.push(bb);
      return true;
    }
  }
  fp.x=x0;fp.y=y0;
  return false;
}

/* Le placement des satellites lui-même. Ne fait pas de push() : l'appelant
   (autoPlace) a déjà mémorisé l'état pour Ctrl+Z. */
function placerSatellites(){
  const res={decouplage:0,serie:0,chaine:0,sansPlace:[]};
  const centreSurCarte=fp=>inBoard(fp.x,fp.y);
  /* circuits d'accueil : trois pattes ou plus, posés sur la carte */
  const hotes=new Set(S.fps.filter(fp=>!satConnecteur(fp)&&!placeManuelle(fp)&&
    padsOf(fp).length>=3&&centreSurCarte(fp)));
  /* satellites possibles : deux pattes */
  const cands=S.fps.filter(fp=>padsOf(fp).length===2&&!placeManuelle(fp)&&!satConnecteur(fp));
  const candSet=new Set(cands);
  /* boîtes occupées : tout sauf les satellites possibles, qu'on soulève */
  const obst=S.fps.filter(fp=>!candSet.has(fp)).map(fpBBox);
  for(const h of (S.holes||[]))obst.push(holeBBox(h));
  /* pastilles par net (positions des circuits, fixes pendant l'opération) */
  const parNet=new Map();
  for(const fp of S.fps)
    for(const q of padsOf(fp)){
      if(!q.net)continue;
      if(!parNet.has(q.net))parNet.set(q.net,[]);
      parNet.get(q.net).push({fp,n:q.n});
    }
  const padMonde=(fp,n)=>padsWorld(fp).find(q=>q.n===n);
  const pose=new Set();
  const poser=(sat,hote,nHote,nSat,type)=>{
    const ph=padMonde(hote,nHote);
    if(ph&&satPoser(sat,ph,hote.x,hote.y,nSat,obst)){
      pose.add(sat);res[type]++;return true;
    }
    return false;
  };

  /* 1. Découplage */
  const parAlim=new Map();
  for(const c of cands){
    if(!/^C/i.test(c.ref))continue;
    const ps=padsOf(c);
    const m=ps.find(q=>satEstMasse(q.net)), a=ps.find(q=>q!==m&&satEstAlim(q.net));
    if(!m||!a)continue;
    if(!parAlim.has(a.net))parAlim.set(a.net,[]);
    parAlim.get(a.net).push({c,n:a.n});
  }
  for(const [net,caps] of parAlim){
    const broches=(parNet.get(net)||[]).filter(e=>hotes.has(e.fp))
      .sort((a,b)=>String(a.fp.ref).localeCompare(String(b.fp.ref),undefined,{numeric:true})||a.n-b.n);
    if(!broches.length)continue;
    caps.sort((a,b)=>satValeurF(a.c.value)-satValeurF(b.c.value)||
      String(a.c.ref).localeCompare(String(b.c.ref),undefined,{numeric:true}));
    /* un par broche, le plus petit d'abord ; les suivants repassent derrière */
    caps.forEach((e,i)=>{
      const b=broches[i%broches.length];
      poser(e.c,b.fp,b.n,e.n,"decouplage");
    });
  }
  /* les condensateurs de découplage sans circuit restent au placement d'ensemble */
  const decap=new Set([...parAlim.values()].flat().map(e=>e.c));

  /* 2. Série / liaison, puis 3. chaîne : un passage par niveau */
  for(let passe=0;passe<3;passe++){
    const accueil=passe===0?hotes:pose;
    const plan=[];
    for(const c of cands){
      if(pose.has(c)||decap.has(c))continue;
      let best=null;
      for(const q of padsOf(c)){
        if(!q.net||satEstMasse(q.net)||satEstAlim(q.net))continue;
        const mem=(parNet.get(q.net)||[]).filter(e=>e.fp!==c);
        for(const e of mem){
          if(!accueil.has(e.fp))continue;
          const ph=padMonde(e.fp,e.n);
          /* le net le plus privé d'abord, puis le circuit le plus proche */
          const s=mem.length*1000+Math.hypot(ph.x-c.x,ph.y-c.y);
          if(!best||s<best.s)best={s,hote:e.fp,nHote:e.n,nSat:q.n};
        }
      }
      if(best)plan.push({c,...best});
    }
    if(!plan.length)break;
    plan.sort((a,b)=>a.s-b.s);
    for(const p of plan)
      if(!pose.has(p.c))poser(p.c,p.hote,p.nHote,p.nSat,passe===0?"serie":"chaine");
  }

  /* 4. Le reste reprend une place libre près de là où il était */
  for(const c of cands){
    if(pose.has(c))continue;
    if(!centreSurCarte(c)){res.sansPlace.push(c.ref);continue;}
    if(!satLibre(c,obst))res.sansPlace.push(c.ref);
  }
  return res;
}
