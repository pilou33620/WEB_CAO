"use strict";
/* ==========================================================================
   Éditeur PCB — 25-liens.js
   Les liens du cuivre : à quoi chaque bout de piste est accroché
   --------------------------------------------------------------------------
   Une piste reste une suite de segments en coordonnées : c'est ce que lisent
   le DRC, les Gerber, l'IPC-2581 et les solveurs, et ce qui fait foi. Chaque
   bout porte EN PLUS le lien de ce qui le tient :

       a1:{f:17, p:"1"}     le bout 1 sur la pastille « 1 » du boîtier 17
       a2:{v:42}            le bout 2 sur le via 42

   Le lien n'est jamais cru sur parole : il ne vaut que si le bout est encore
   dans le cuivre de ce qu'il vise (`linkFind`). Un outil qui coupe, pousse ou
   recolle une piste sans rien savoir des liens ne casse donc rien — le lien
   faux est reconstruit d'après la géométrie au prochain passage. Ce que le
   lien apporte en plus de la géométrie, c'est l'identité : la pastille visée
   quand deux se chevauchent, celle que doit retrouver un boîtier qui tourne
   ou change de face, et demain le via qui appartient à son boîtier.

   `transformFps` est la porte unique de ce qui transforme un boîtier d'un
   coup — rotation, retournement, cotes du panneau, « Aller à » : le cuivre
   accroché suit par le même moteur que le glissement à la souris
   (`followMoved` / `applyFollow`), seule la règle « où va ce point » change.
   ========================================================================== */
function linkNorm(a){
  if(!a||typeof a!=="object")return null;
  if(a.v!=null){
    const v=+a.v;
    return Number.isInteger(v)&&v>=1?{v}:null;
  }
  const f=+a.f;
  if(!Number.isInteger(f)||f<0)return null;
  if(typeof a.p==="number"&&Number.isFinite(a.p))return {f,p:a.p};
  if(typeof a.p==="string"&&a.p)return {f,p:a.p.slice(0,16)};
  return null;
}
/* Chaque via reçoit un identifiant unique : le routeur, le shove, la paire
   différentielle ou le presse-papier en créent sans, ou en dupliquent. */
function viaIds(){
  const seen=new Set();
  for(const v of S.vias){
    if(!Number.isInteger(v.id)||v.id<1||seen.has(v.id))v.id=S.nextId++;
    seen.add(v.id);
  }
}
/* Index des pastilles par case : une carte chargée ne compare pas chaque bout
   de piste à chaque pastille. */
const LINK_CELL=2;
function linkIndex(fps){
  const cells=new Map(), byId=new Map();
  const cle=(i,j)=>i+"|"+j;
  for(const fp of fps){
    const ps=padsWorld(fp);
    byId.set(fp.id,{fp,ps});
    ps.forEach((q,i)=>{
      let r=Math.hypot(q.w||0,q.h||0)/2;
      for(const p of (q.pts||[]))r=Math.max(r,Math.hypot(p.x,p.y));
      const i1=Math.floor((q.x-r)/LINK_CELL), i2=Math.floor((q.x+r)/LINK_CELL);
      const j1=Math.floor((q.y-r)/LINK_CELL), j2=Math.floor((q.y+r)/LINK_CELL);
      for(let a=i1;a<=i2;a++)for(let b=j1;b<=j2;b++){
        const k=cle(a,b);
        if(!cells.has(k))cells.set(k,[]);
        cells.get(k).push({fp,q,i});
      }
    });
  }
  return {cells,byId,
          at:(x,y)=>cells.get(cle(Math.floor(x/LINK_CELL),Math.floor(y/LINK_CELL)))||[]};
}
function padHolds(fp,q,l,x,y){
  if(!padCuLayers(fp,q).includes(l))return false;
  const s=padSurCouche(q,l);
  return !!s&&padDist(x,y,s)<=EPS_J;
}
/* Ce qui tient le point (l, x, y). Un via au point l'emporte, comme dans
   `anchorKey` : c'est lui qui relie les couches. Puis le lien d'avant s'il
   tient encore, sinon la pastille dont le centre est le plus proche. */
function linkFind(I,V,l,x,y,old){
  for(const v of (V.get(r3(x)+"|"+r3(y))||[]))if(l>=v.a&&l<=v.b)return {v:v.id};
  if(old&&old.f!=null){
    const E=I.byId.get(old.f);
    if(E)for(const q of E.ps)
      if(String(q.n)===String(old.p)&&padHolds(E.fp,q,l,x,y))return {f:old.f,p:old.p};
  }
  let best=null, bd=1e9;
  for(const o of I.at(x,y)){
    if(!padHolds(o.fp,o.q,l,x,y))continue;
    const d=dist(x,y,o.q.x,o.q.y);
    if(d<bd){bd=d;best=o;}
  }
  return best?{f:best.fp.id,p:best.q.n}:null;
}
function linkEnds(tracks){
  viaIds();
  if(!tracks||!tracks.length)return;
  const I=linkIndex(S.fps), V=new Map();
  for(const v of S.vias){
    const k=r3(v.x)+"|"+r3(v.y);
    if(!V.has(k))V.set(k,[]);
    V.get(k).push(v);
  }
  for(const t of tracks)
    for(const e of [1,2]){
      const k="a"+e;
      const n=linkFind(I,V,t.l,e===1?t.x1:t.x2,e===1?t.y1:t.y2,t[k]);
      if(n)t[k]=n;else delete t[k];
    }
}
/* Les liens à jour de la carte, recalculés seulement si elle a changé. */
function linkSync(){
  if(S.linkVer===S.ver)return;
  linkEnds(S.tracks);
  S.linkVer=S.ver;
}
/* Le boîtier qui tient le bout `e` de la piste `t`, parmi ceux de `ids` :
   son lien d'abord, la géométrie ensuite. */
function linkHolder(t,e,ids,I){
  const a=t["a"+e];
  if(a&&a.f!=null&&ids.has(a.f))return a.f;
  const x=e===1?t.x1:t.x2, y=e===1?t.y1:t.y2;
  for(const o of I.at(x,y))
    if(ids.has(o.fp.id)&&padHolds(o.fp,o.q,t.l,x,y))return o.fp.id;
  return null;
}

/* ==========================================================================
   Transformer un boîtier, son cuivre avec lui
   ========================================================================== */
/* L'inverse de `fpXform` : du monde au repère de l'empreinte, d'après un état
   relevé AVANT la transformation. */
function fpXformInv(o){
  const a=(o.rot||0)*Math.PI/180, ca=Math.cos(a), sa=Math.sin(a), m=o.side?-1:1;
  return (X,Y)=>{
    const dx=X-o.x, dy=Y-o.y;
    return {x:m*(dx*ca+dy*sa), y:-dx*sa+dy*ca};
  };
}
/* Où va le point P qu'un boîtier emporte. Au centre d'une pastille : au centre
   de cette même pastille, recalculé — pas d'arrondi qui dériverait d'un geste à
   l'autre. Ailleurs (un bout volontairement décalé, le coude d'une piste
   tendue entre deux broches) : dans le repère du boîtier, qui tourne et se
   retourne avec lui. `own` : le boîtier à suivre faute de pastille sous P. */
function linkMover(avant){
  return (P,own)=>{
    let id=null, E=null;
    for(const [k,A] of avant)
      for(let i=0;i<A.ps.length;i++){
        const q=A.ps[i];
        if(Math.abs(q.x-P.x)<EPS_J&&Math.abs(q.y-P.y)<EPS_J){
          const n=padsWorld(A.fp)[i];
          return {x:n.x,y:n.y};
        }
        if(id==null&&padDist(P.x,P.y,q)<=EPS_J){id=k;E=A;}
      }
    if(!E)E=avant.get(own);
    if(!E)return {x:P.x,y:P.y};
    const L=E.inv(P.x,P.y), W=fpXform(E.fp)(L.x,L.y);
    return {x:r3(W.x),y:r3(W.y)};
  };
}
/* La porte unique. `ids` : les boîtiers ; `mutate` les transforme (rot, side,
   x, y). Le geste se joue comme un glissement à la souris d'un seul pas : la
   même relève de départ (`beginMove`), le même suivi (`applyFollow`), le même
   ménage au relâchement. La sélection en cours est mise de côté le temps du
   geste : seuls les boîtiers bougent, pas la piste ou le via sélectionnés à
   côté. Rend le nombre de bouts que le geste a laissés hors de leur pastille —
   une pastille CMS passée sur l'autre face que rien n'a pu re-router. */
function transformFps(ids,mutate){
  const fps=ids.map(fpById).filter(Boolean);
  if(!fps.length){mutate();return 0;}
  // un glissement en cours a déjà son suivi : on transforme seulement
  if(typeof drag!=="undefined"&&drag){mutate();return 0;}
  linkSync();
  const set=new Set(fps.map(f=>f.id));
  const avant=new Map();
  for(const f of fps)
    avant.set(f.id,{fp:f,ps:padsWorld(f),inv:fpXformInv({x:f.x,y:f.y,rot:f.rot,side:f.side})});
  const I=linkIndex(fps);
  const keep=S.sel;
  S.sel={fps:new Set(set),tracks:new Set(),vias:new Set(),zones:new Set(),cuts:new Set(),
         drawings:new Set(),holes:new Set(),decoupes:new Set(),edge:false};
  drag={move:true,moved:true,dx:0,dy:0,x:0,y:0};
  // qui tient chaque bout : relevé AVANT que les pastilles ne bougent
  const tient=[];
  for(const t of S.tracks)
    for(const e of [1,2]){
      const id=linkHolder(t,e,set,I);
      if(id!=null)tient.push({t,e,id});
    }
  let perdus=0, rr=null;
  try{
    beginMove();
    const F=drag.follow;
    mutate();
    const mv=linkMover(avant);
    F.map=P0=>mv(P0,F.p0fp.get(P0));
    // les vias de sortie tournent et se retournent avec leur boîtier
    for(const o of drag.via){
      const P=mv({x:o.x,y:o.y},drag.fanout.get(o.v));
      o.v.x=P.x;o.v.y=P.y;
    }
    // une piste tendue entre deux pastilles qui bougent part en bloc, coudes compris
    for(const o of drag.trk){
      const k=F.rigidOf.get(o.t);
      const A=mv({x:o.x1,y:o.y1},k), B=mv({x:o.x2,y:o.y2},k);
      o.t.x1=A.x;o.t.y1=A.y;o.t.x2=B.x;o.t.y2=B.y;
    }
    applyFollow(F,0,0,false);
    const sh=F.shove;
    S.dragShove=null;
    if(sh)pnsApply(sh);
    rr=followReroute(F);
    pruneAfterDrag([...movedTracks()]);
    mitreAfterDrag([...movedTracks()].filter(t=>S.tracks.indexOf(t)>=0),drag.diag);
    for(const o of tient){
      if(S.tracks.indexOf(o.t)<0)continue;
      const x=o.e===1?o.t.x1:o.t.x2, y=o.e===1?o.t.y1:o.t.y2;
      const f=fpById(o.id);
      if(f&&!padsWorld(f).some(q=>padHolds(f,q,o.t.l,x,y)))perdus++;
    }
  }finally{
    drag=null;S.sel=keep;S.dragShove=null;
  }
  rerouteHint(rr);
  return perdus;
}

/* ==========================================================================
   Les vias de sortie
   --------------------------------------------------------------------------
   Le via de masse au pied d'une capa de découplage appartient à la capa : on
   ne déplace pas l'une sans l'autre. Un via est emporté par les boîtiers
   qu'on déplace quand :
   - il est posé dans une de leurs pastilles (via dans la pastille), ou
   - il en part au moins une piste courte (≤ FANOUT_MAX, de coude en coude,
     sans embranchement) qui finit sur une de leurs pastilles,
   - et aucune piste courte ne le relie à la pastille d'un AUTRE boîtier,
     resté en place : ce via-là est partagé, il ne suit personne.
   Le reste de ce qui part du via (la piste vers le régulateur, sur l'autre
   face) le suit comme une piste suit un via qu'on tire. L'appartenance se
   déduit à chaque geste, d'après le cuivre tel qu'il est : rien à tenir à jour.
   ========================================================================== */
const FANOUT_MAX=3;
/* Les chaînes qui partent du via `v` : pour chacune, la pastille où elle
   aboutit (ou null) et sa longueur. */
function fanoutChains(v){
  const out=[];
  for(const t of S.tracks){
    if(t.l<v.a||t.l>v.b)continue;
    for(const e of [1,2]){
      const x=e===1?t.x1:t.x2, y=e===1?t.y1:t.y2;
      if(Math.abs(x-v.x)>=EPS_J||Math.abs(y-v.y)>=EPS_J)continue;
      let cur=t, ce=e, len=0, pad=null;
      for(let k=0;k<FOLLOW_MAX;k++){
        const F=endFar(cur,ce);
        len+=trkLen(cur);
        if(len>FANOUT_MAX)break;
        pad=padAt(cur.l,F.x,F.y);
        if(pad||viaAt(cur.l,F.x,F.y))break;
        const j=jointAt(F.x,F.y,cur.l);
        if(j.ends.length!==2||j.vias.length)break;
        const nx=j.ends.find(o=>o.t!==cur);
        if(!nx||nx.t.net!==cur.net)break;
        cur=nx.t;ce=nx.e;
      }
      out.push({pad:len<=FANOUT_MAX?pad:null,len});
    }
  }
  return out;
}
/* Les vias de sortie des boîtiers `fps` : via → id du boîtier qui l'emporte. */
function fanoutVias(fps){
  const res=new Map();
  if(!fps.length)return res;
  const ids=new Set(fps.map(f=>f.id));
  let x1=1e9,y1=1e9,x2=-1e9,y2=-1e9;
  for(const f of fps){
    const b=fpBBox(f);
    x1=Math.min(x1,b.x1);y1=Math.min(y1,b.y1);x2=Math.max(x2,b.x2);y2=Math.max(y2,b.y2);
  }
  x1-=FANOUT_MAX;y1-=FANOUT_MAX;x2+=FANOUT_MAX;y2+=FANOUT_MAX;
  for(const v of S.vias){
    if(v.x<x1||v.x>x2||v.y<y1||v.y>y2)continue;
    // via dans la pastille
    let dans=null;
    for(const f of fps){
      for(const q of padsWorld(f))
        if(padCuLayers(f,q).some(l=>l>=v.a&&l<=v.b&&padHolds(f,q,l,v.x,v.y))){dans=f.id;break;}
      if(dans!=null)break;
    }
    if(dans!=null){res.set(v,dans);continue;}
    let best=null, bl=1e9, autre=false;
    for(const c of fanoutChains(v)){
      if(!c.pad)continue;
      if(!ids.has(c.pad.fp.id)){autre=true;break;}
      if(c.len<bl){bl=c.len;best=c.pad.fp.id;}
    }
    if(best!=null&&!autre)res.set(v,best);
  }
  return res;
}
/* Au départ d'un geste qui emporte des boîtiers : leurs vias de sortie entrent
   dans le geste comme des vias tirés. Ils sont rendus à la sélection d'avant
   au relâchement (`fanoutRelease`) — on ne les a pas choisis. */
function fanoutTake(){
  const fps=[...S.sel.fps].map(fpById).filter(Boolean);
  const m=fanoutVias(fps);
  for(const v of [...m.keys()])
    if(S.sel.vias.has(v))m.delete(v);       // déjà tiré par l'utilisateur
    else S.sel.vias.add(v);
  return m;
}
function fanoutRelease(d){
  if(d&&d.fanout)for(const v of d.fanout.keys())S.sel.vias.delete(v);
}

/* ==========================================================================
   Le bout volontairement décalé
   --------------------------------------------------------------------------
   Une piste entre et sort au centre de la pastille : c'est la règle, et
   l'aimant du routeur la tient. Ctrl enfoncé, le bout se pose là où l'on
   vise DANS le cuivre de la pastille — sur la grille si elle y tombe, au
   point exact sinon. Il garde ensuite ce décalage dans le repère du boîtier :
   tourner ou retourner le boîtier l'emmène (`linkMover`). Hors du cuivre,
   Ctrl ne change rien : l'aimant ramène au centre.
   ========================================================================== */
function padOffPoint(q,l,x,y,ancre){
  const s=padSurCouche(q,l);
  if(!s||padDist(x,y,s)>0)return null;
  const g={x:snapXn(x,ancre?ancre.x:null),y:snapYn(y,ancre?ancre.y:null)};
  const p=padDist(g.x,g.y,s)<=0?g:{x:r3(x),y:r3(y)};
  if(Math.abs(p.x-q.x)<EPS_J&&Math.abs(p.y-q.y)<EPS_J)return null;   // c'est le centre
  return p;
}

/* ==========================================================================
   Après le suivi : vérifier, re-router, sinon signaler
   --------------------------------------------------------------------------
   Le suivi garde la forme de la piste et ne contourne qu'à petite dose, le
   temps du geste. Au relâchement, chaque liaison qui a suivi est jugée :
   - elle passe sous l'isolation d'un autre net, ou en croise une piste :
     on la RE-ROUTE en entier, de son bout tenu jusqu'à la pastille, en
     contournant (`pnsWalkaround`) — anti-collision active seulement ;
   - son bout ne touche plus sa pastille (une CMS passée sur l'autre face) :
     on la refait sur la couche où est désormais la pastille, si son autre
     bout y est accessible (un via, une pastille traversante) ;
   - sans issue, elle reste telle quelle, TRACÉE EN ROUGE, et le DRC la porte
     « à re-router ». La marque tombe d'elle-même quand la piste disparaît
     (effacée, annulée, re-routée à la main) ou qu'elle n'est plus en faute.
   ========================================================================== */
/* Les liaisons marquées : {trk:[pistes], msg, x, y}. Hors document : une
   marque dit l'état d'un geste, pas une propriété de la carte. */
S.aRerouter=[];
function rerouteLive(){
  const T=new Set(S.tracks);
  S.aRerouter=S.aRerouter.filter(g=>g.trk.some(t=>T.has(t)));
  return T;
}
function rerouteMarked(t){
  for(const g of S.aRerouter)if(g.trk.indexOf(t)>=0)return true;
  return false;
}
/* Ce qui tient les bouts d'une liaison n'est pas un obstacle. */
function rerouteSkip(N,ends){
  const skip=new Set();
  for(const e of ends){
    const j=N.jointAt(e.l,e.x,e.y);
    for(const it of j.pads)skip.add(it);
    for(const it of j.vias)skip.add(it);
  }
  return skip;
}
function rerouteFaulty(N,trk,skip,T){
  for(const t of trk){
    if(!T.has(t)||dist(t.x1,t.y1,t.x2,t.y2)<1e-6)continue;
    for(const it of pnsItemsTrack(t))if(N.colliding(it,skip).length)return true;
  }
  return false;
}
/* Le meilleur trajet de A à B sur la couche l dans le monde N : un coude
   direct s'il passe, sinon le plus court des contournements. */
function reroutePath(N,l,net,w,A,B,skip){
  const line=pts=>({l,net,w,pts});
  let best=null;
  for(const legs of followLegs(A,B,cornerMode())){
    let pts=legs;
    if(N.firstObstacle(line(pts),skip)){
      const r=pnsWalkaround(N,line(pts),skip);
      if(!r.ok||r.pts.length<2)continue;
      pts=pnsOptimize(N,line(r.pts),skip);
    }
    pts=followRound45(pnsSimplify(pts));
    pts[0]={x:A.x,y:A.y};pts[pts.length-1]={x:B.x,y:B.y};
    if(pts.length<2||N.firstObstacle(line(pts),skip))continue;
    if(cornerMode()!=="free"&&!pnsIs45(pts))continue;
    if(!best||pnsLen(pts)<pnsLen(best))best=pts;
  }
  return best;
}
/* La pastille du boîtier `fid` sous P, et les couches où elle a du cuivre. */
function rerouteHeldLayers(fid,P){
  const f=fpById(fid);
  if(!f)return [];
  for(const q of padsWorld(f)){
    const L=padCuLayers(f,q).filter(l=>padHolds(f,q,l,P.x,P.y));
    if(L.length)return L;
  }
  return [];
}
/* Le passage au relâchement. `F` : le suivi du geste (`followMoved`). Rend
   {faits, marques} ; les pistes refaites remplacent celles de la liaison. */
function followReroute(F){
  const res={faits:0,marques:0,perdus:0};
  if(!F)return res;
  touch();
  let T=rerouteLive();
  const W=pnsWorld();
  const jobs=[];
  for(const c of F.chains){
    const pts=c.cur||c.V, P=pts[pts.length-1], V0=c.V[0];
    if(P.x===c.P0.x&&P.y===c.P0.y)continue;
    const L=rerouteHeldLayers(F.p0fp.get(c.P0),P);
    const ends=[{l:c.l,x:V0.x,y:V0.y},{l:c.l,x:P.x,y:P.y}];
    if(L.length&&L.indexOf(c.l)<0){
      // la pastille a changé de face : la liaison change de couche avec elle
      const l2=L.find(l=>viaAt(l,V0.x,V0.y)||padAt(l,V0.x,V0.y));
      jobs.push({c,V0,P,l:l2,perdu:true});
      continue;
    }
    if(rerouteFaulty(W,c.trk,rerouteSkip(W,ends),T))jobs.push({c,V0,P,l:c.l});
  }
  // le cuivre emporté en bloc ou étiré d'un trait : on ne le refait pas, on le juge
  const bloc=[...F.rigid,...F.rubber.map(r=>r.t)].filter(t=>T.has(t));
  for(const t of bloc){
    const ends=[{l:t.l,x:t.x1,y:t.y1},{l:t.l,x:t.x2,y:t.y2}];
    if(rerouteFaulty(W,[t],rerouteSkip(W,ends),T))
      jobs.push({c:{trk:[t]},bloc:true});
  }
  if(!jobs.length){rerouteForget(F,T);return res;}
  // le monde sans les liaisons qu'on va refaire
  const out=new Set();
  for(const j of jobs)if(!j.bloc)for(const t of j.c.trk)out.add(t);
  const N=W.branch();
  for(const it of W.all())if(it.src&&out.has(it.src))N.remove(it);
  const neuves=[];
  for(const j of jobs){
    let pts=null;
    if(!j.bloc&&j.l!=null&&S.avoid){
      const ends=[{l:j.l,x:j.V0.x,y:j.V0.y},{l:j.l,x:j.P.x,y:j.P.y}];
      pts=reroutePath(N,j.l,j.c.net,j.c.w,j.V0,j.P,rerouteSkip(N,ends));
    }else if(!j.bloc&&j.l!=null&&j.perdu){
      // anti-collision coupée : la liaison change de couche telle quelle
      pts=(j.c.cur||j.c.V).map(p=>({x:p.x,y:p.y}));
    }
    if(pts){
      const drop=new Set(j.c.trk);
      S.tracks=S.tracks.filter(t=>!drop.has(t));
      const nv=[];
      for(let i=0;i+1<pts.length;i++){
        if(pts[i].x===pts[i+1].x&&pts[i].y===pts[i+1].y)continue;
        const t={l:j.l,net:j.c.net,w:j.c.w,x1:pts[i].x,y1:pts[i].y,x2:pts[i+1].x,y2:pts[i+1].y};
        S.tracks.push(t);nv.push(t);
        for(const it of pnsItemsTrack(t))N.add(it);
      }
      neuves.push(...nv);
      res.faits++;
      continue;
    }
    const trk=j.c.trk.filter(t=>T.has(t)&&dist(t.x1,t.y1,t.x2,t.y2)>=1e-6);
    if(!trk.length)continue;
    const m=trk[Math.floor(trk.length/2)];
    S.aRerouter=S.aRerouter.filter(g=>!g.trk.some(t=>trk.indexOf(t)>=0));
    S.aRerouter.push({trk,x:(m.x1+m.x2)/2,y:(m.y1+m.y2)/2,l:m.l,
      bout:j.perdu?{l:j.c.l,x:j.P.x,y:j.P.y}:null,
      msg:j.perdu?"Piste "+(m.net||"sans net")+" : sa pastille a changé de face, à re-router"
                 :"Piste "+(m.net||"sans net")+" en défaut après le déplacement : à re-router"});
    res.marques++;
    if(j.perdu)res.perdus++;
  }
  touch();
  rerouteForget(F,new Set(S.tracks));
  return res;
}
/* Une liaison marquée qui n'est plus en faute perd sa marque : à la fin d'un
   geste, et à chaque DRC. Celle dont la pastille a changé de face la garde
   tant que son bout pend dans le vide — c'est la couche qui est fausse, pas
   l'isolation : un via posé là, ou la piste reprise, la lève. */
function rerouteForget(F,T){
  const N=pnsWorld();
  S.aRerouter=S.aRerouter.filter(g=>{
    const trk=g.trk.filter(t=>T.has(t));
    if(!trk.length)return false;
    // pastille passée sur l'autre face : marquée tant que le bout y pend
    if(g.bout){
      const b=g.bout;
      if(padAt(b.l,b.x,b.y)||viaAt(b.l,b.x,b.y))return false;
      return trk.some(t=>t.l===b.l&&((Math.abs(t.x1-b.x)<EPS_J&&Math.abs(t.y1-b.y)<EPS_J)||
                                     (Math.abs(t.x2-b.x)<EPS_J&&Math.abs(t.y2-b.y)<EPS_J)));
    }
    const ends=[];
    for(const t of trk)ends.push({l:t.l,x:t.x1,y:t.y1},{l:t.l,x:t.x2,y:t.y2});
    return rerouteFaulty(N,trk,rerouteSkip(N,ends),T);
  });
}
function rerouteHint(r){
  if(!r||(!r.faits&&!r.marques))return;
  const a=r.faits?r.faits+" liaison(s) re-routée(s) automatiquement":"";
  const b=r.marques?r.marques+" liaison(s) à re-router — en rouge, et au DRC":"";
  hint([a,b].filter(Boolean).join(" ; ")+".");
}
/* Pour le DRC : une ligne par liaison marquée. */
function rerouteDrc(out){
  if(S.aRerouter.length)rerouteForget(null,rerouteLive());
  for(const g of S.aRerouter)out.push({x:g.x,y:g.y,l:g.l,msg:g.msg});
}
