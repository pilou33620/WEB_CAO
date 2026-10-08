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
   une pastille CMS passée sur l'autre face, typiquement. */
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
    rr=followCheck(F);
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
function fanoutChains(v,max){
  if(max==null)max=FANOUT_MAX;
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
        if(len>max)break;
        pad=padAt(cur.l,F.x,F.y);
        if(pad||viaAt(cur.l,F.x,F.y))break;
        const j=jointAt(F.x,F.y,cur.l);
        if(j.ends.length!==2||j.vias.length)break;
        const nx=j.ends.find(o=>o.t!==cur);
        if(!nx||nx.t.net!==cur.net)break;
        cur=nx.t;ce=nx.e;
      }
      out.push({pad:len<=max?pad:null,len});
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
    // marqué à la main : libre, ou lié à un boîtier quelle que soit la distance
    if(v.lie===0)continue;
    if(v.lie>0){
      if(ids.has(v.lie)&&viaTientA(v,v.lie))res.set(v,v.lie);
      if(fpById(v.lie)&&viaTientA(v,v.lie))continue;
    }
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
   Après le suivi : vérifier et signaler, sans rien refaire
   --------------------------------------------------------------------------
   Au relâchement, chaque liaison qui a suivi est jugée :
   - elle passe sous l'isolation d'un autre net, ou en croise une piste ;
   - son bout ne touche plus sa pastille (une CMS passée sur l'autre face).
   Elle n'est PAS refaite : un re-routage silencieux changerait la longueur
   d'une liaison appariée, l'écart d'une paire ou la couche d'une piste
   d'impédance contrôlée, sans qu'on l'ait vu. Elle reste telle quelle,
   TRACÉE EN ROUGE, et le DRC la porte « à re-router » — c'est la conduite
   des outils du commerce. La marque tombe d'elle-même quand la piste
   disparaît (effacée, annulée, reprise à la main) ou n'est plus en faute.
   Le contournement PENDANT le geste (`followPath`) reste : on le voit faire,
   et on lâche ou pas.
   ========================================================================== */
/* Les liaisons marquées : {trk:[pistes], msg, x, y, l, bout}. Hors document :
   une marque dit l'état d'un geste, pas une propriété de la carte. */
S.aRerouter=[];
function rerouteLive(){
  const T=new Set(S.tracks);
  S.aRerouter=S.aRerouter.filter(g=>g.trk.some(t=>T.has(t)));
  return T;
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
/* La pastille du boîtier `fid` sous P : les couches où elle a du cuivre. */
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
   {marques, perdus}. */
function followCheck(F){
  const res={marques:0,perdus:0};
  if(!F)return res;
  touch();
  const T=rerouteLive();
  const W=pnsWorld();
  const jobs=[];
  for(const c of F.chains){
    const pts=c.cur||c.V, P=pts[pts.length-1], V0=c.V[0];
    if(P.x===c.P0.x&&P.y===c.P0.y)continue;
    const L=rerouteHeldLayers(F.p0fp.get(c.P0),P);
    if(L.length&&L.indexOf(c.l)<0){jobs.push({trk:c.trk,perdu:true,bout:{l:c.l,x:P.x,y:P.y}});continue;}
    const ends=[{l:c.l,x:V0.x,y:V0.y},{l:c.l,x:P.x,y:P.y}];
    if(rerouteFaulty(W,c.trk,rerouteSkip(W,ends),T))jobs.push({trk:c.trk});
  }
  // le cuivre emporté en bloc ou étiré d'un trait
  for(const t of [...F.rigid,...F.rubber.map(r=>r.t)]){
    if(!T.has(t))continue;
    const ends=[{l:t.l,x:t.x1,y:t.y1},{l:t.l,x:t.x2,y:t.y2}];
    if(rerouteFaulty(W,[t],rerouteSkip(W,ends),T))jobs.push({trk:[t]});
  }
  for(const j of jobs){
    const trk=j.trk.filter(t=>T.has(t)&&dist(t.x1,t.y1,t.x2,t.y2)>=1e-6);
    if(!trk.length)continue;
    const m=trk[Math.floor(trk.length/2)];
    S.aRerouter=S.aRerouter.filter(g=>!g.trk.some(t=>trk.indexOf(t)>=0));
    S.aRerouter.push({trk,x:(m.x1+m.x2)/2,y:(m.y1+m.y2)/2,l:m.l,bout:j.bout||null,
      msg:j.perdu?"Piste "+(m.net||"sans net")+" : sa pastille a changé de face, à re-router"
                 :"Piste "+(m.net||"sans net")+" en défaut après le déplacement : à re-router"});
    res.marques++;
    if(j.perdu)res.perdus++;
  }
  rerouteForget(F,T,new Set(jobs.flatMap(j=>j.trk)));
  return res;
}
/* Une liaison marquée qui n'est plus en faute perd sa marque : à la fin d'un
   geste, et à chaque DRC. Celle dont la pastille a changé de face la garde
   tant que son bout pend dans le vide — c'est la couche qui est fausse, pas
   l'isolation : un via posé là, ou la piste reprise, la lève. */
function rerouteForget(F,T,neuves){
  const N=pnsWorld();
  S.aRerouter=S.aRerouter.filter(g=>{
    if(neuves&&g.trk.some(t=>neuves.has(t)))return true;
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
  if(!r||!r.marques)return;
  hint(r.marques+" liaison(s) à re-router — en rouge, et au DRC"+
       (r.perdus?" ("+r.perdus+" dont la pastille a changé de face)":"")+".");
}
/* Pour le DRC : une ligne par liaison marquée. */
function rerouteDrc(out){
  if(S.aRerouter.length)rerouteForget(null,rerouteLive());
  for(const g of S.aRerouter)out.push({x:g.x,y:g.y,l:g.l,msg:g.msg});
}

/* ==========================================================================
   Ce que deviennent les pistes quand on déplace un boîtier
   --------------------------------------------------------------------------
   Trois conduites, comme les options du déplacement d'Allegro :
     « glisser »   le cuivre suit en gardant ses 45° : le coude glisse le long
                   de la piste, et contourne ce qui gêne (`followPath`) ;
     « étirer »    le dernier segment s'étire d'un trait jusqu'à la pastille,
                   à l'angle que donne le déplacement — rien d'autre ne bouge ;
     « arracher »  les pistes qui arrivent sur le boîtier sont retirées
                   jusqu'à ce qui les tenait (pastille, via, embranchement) :
                   le chevelu reprend la liaison, à router de nouveau.
   La piste tendue entre deux broches du boîtier, et le via de sortie, partent
   avec lui dans les trois cas. C'est un réglage de l'utilisateur, pas de la
   carte : il ne va pas dans le document, et se garde d'une session à l'autre.
   Maj+Espace le change en plein geste : le geste repart de l'état d'avant et
   refait le chemin parcouru (`dragRestart`).
   ========================================================================== */
const MOVE_ETCH={glisser:"glisser",etirer:"étirer",arracher:"arracher"};
const MOVE_ETCH_CLE="pcb.moveEtch";
function moveEtch(){
  if(!MOVE_ETCH[S.moveEtch]){
    let m=null;
    try{m=localStorage.getItem(MOVE_ETCH_CLE);}catch(_){}
    S.moveEtch=MOVE_ETCH[m]?m:"glisser";
  }
  return S.moveEtch;
}
function setMoveEtch(m){
  if(!MOVE_ETCH[m])return;
  S.moveEtch=m;
  try{localStorage.setItem(MOVE_ETCH_CLE,m);}catch(_){}
  if(typeof drag!=="undefined"&&drag&&drag.move&&drag.moved)dragRestart();
  hint("Pistes au déplacement d'un boîtier : « "+MOVE_ETCH[m]+" »"+
       (m==="glisser"?" — elles suivent à 45°."
        :m==="etirer"?" — le dernier segment s'étire jusqu'à la pastille."
        :" — elles sont retirées, le chevelu reprend la liaison.")+
       " Maj+Espace pour changer.");
  if(typeof reSync==="function")reSync();
  draw();
}
function cycleMoveEtch(){
  const k=Object.keys(MOVE_ETCH);
  setMoveEtch(k[(k.indexOf(moveEtch())+1)%k.length]);
}

/* ==========================================================================
   Tourner pendant qu'on glisse
   --------------------------------------------------------------------------
   R ou Espace, la souris enfoncée sur un boîtier : il tourne d'un quart de
   tour autour de son centre (Maj+R dans l'autre sens) et le geste continue.
   Le cuivre qui suit ne raisonne plus en décalage (dx, dy) mais en « où va ce
   point » : `linkMover`, d'après l'état relevé au départ du geste — la même
   règle que la rotation hors glissement (`transformFps`).
   ========================================================================== */
function linkAvant(fps){
  const avant=new Map();
  for(const f of fps)
    avant.set(f.id,{fp:f,ps:padsWorld(f),inv:fpXformInv({x:f.x,y:f.y,rot:f.rot,side:f.side})});
  return avant;
}
/* Après un pas de glissement : ce qui tourne avec les boîtiers reprend sa
   place — le suivi par `F.map`, la piste tendue entre deux broches et le via
   de sortie par leur boîtier. Sans rotation, rien à faire : le décalage suffit. */
function dragRotFix(alt){
  if(!drag||!drag.rot||!drag.follow)return;
  const F=drag.follow, mv=linkMover(drag.avant);
  F.map=P0=>mv(P0,F.p0fp.get(P0));
  for(const o of drag.trk){
    if(!F.rigidOf.has(o.t)||(alt&&F.rigidVia.has(o.t)))continue;
    const k=F.rigidOf.get(o.t), A=mv({x:o.x1,y:o.y1},k), B=mv({x:o.x2,y:o.y2},k);
    o.t.x1=A.x;o.t.y1=A.y;o.t.x2=B.x;o.t.y2=B.y;
  }
  for(const o of drag.via){
    if(!drag.fanout||!drag.fanout.has(o.v)||alt)continue;
    const P=mv({x:o.x,y:o.y},drag.fanout.get(o.v));
    o.v.x=P.x;o.v.y=P.y;
  }
}
function dragRotate(sens){
  if(typeof drag==="undefined"||!drag||!drag.move||!S.sel.fps.size)return false;
  if(!drag.moved){push();drag.moved=true;beginMove();}
  fpsTourner([...S.sel.fps],sens);
  drag.rotN=(drag.rotN||0)+sens;
  drag.rot=true;
  dragRotFix();
  applyJoints(drag.joints,drag.dx,drag.dy,false);
  applyFollow(drag.follow,drag.dx,drag.dy,false);
  touch();draw();
  return true;
}
/* La sélection telle qu'elle était au départ du geste, en indices : elle doit
   survivre au rechargement de l'instantané (`dragRestart`). */
function dragSelSnap(){
  const ix=(arr,set)=>[...set].map(o=>arr.indexOf(o)).filter(i=>i>=0);
  return {fps:[...S.sel.fps],tracks:ix(S.tracks,S.sel.tracks),vias:ix(S.vias,S.sel.vias),
          zones:ix(S.zones,S.sel.zones),cuts:ix(S.cuts,S.sel.cuts),
          drawings:[...(S.sel.drawings||[])],holes:[...(S.sel.holes||[])],
          decoupes:S.sel.decoupes?ix(boardCutouts(),S.sel.decoupes):[],edge:S.sel.edge};
}
function dragSelRestore(st){
  clearSel();
  for(const id of st.fps)S.sel.fps.add(id);
  for(const i of st.tracks)if(S.tracks[i])S.sel.tracks.add(S.tracks[i]);
  for(const i of st.vias)if(S.vias[i])S.sel.vias.add(S.vias[i]);
  for(const i of st.zones)if(S.zones[i])S.sel.zones.add(S.zones[i]);
  for(const i of st.cuts)if(S.cuts[i])S.sel.cuts.add(S.cuts[i]);
  if(!S.sel.drawings)S.sel.drawings=new Set();
  for(const id of st.drawings)S.sel.drawings.add(id);
  if(!S.sel.holes)S.sel.holes=new Set();
  for(const id of st.holes)S.sel.holes.add(id);
  if(st.decoupes.length){
    if(!S.sel.decoupes)S.sel.decoupes=new Set();
    const D=boardCutouts();
    for(const i of st.decoupes)if(D[i])S.sel.decoupes.add(D[i]);
  }
  S.sel.edge=st.edge;
}
/* Rejouer le geste en cours sous une autre conduite : retour à l'instantané
   d'avant le geste (celui que `push` a pris au premier mouvement), même
   sélection, puis le même chemin — décalage et quarts de tour. */
function dragRestart(){
  if(!drag||!drag.move||!drag.moved||!S.undo.length)return;
  const st=drag.selSnap, dx=drag.dx, dy=drag.dy, rn=drag.rotN||0, mx=drag.x, my=drag.y;
  if(drag.follow)S.dragShove=null;
  loadDoc(JSON.parse(S.undo[S.undo.length-1]),true);
  dragSelRestore(st);
  drag.dx=0;drag.dy=0;drag.rot=false;
  beginMove();
  if(dx||dy)dragMoveBy(dx,dy,false);
  drag.x=mx;drag.y=my;
  if(rn%4){
    for(let i=0;i<Math.abs(rn);i++)fpsTourner([...S.sel.fps],Math.sign(rn));
    drag.rotN=rn;
    drag.rot=true;
    dragRotFix();
    applyJoints(drag.joints,drag.dx,drag.dy,false);
    applyFollow(drag.follow,drag.dx,drag.dy,false);
  }
  touch();
}

/* Le via `v` est-il encore relié au boîtier `fid` : posé dans une de ses
   pastilles, ou au bout d'une piste sans embranchement qui y mène ? Un via
   copié avec son marquage, loin de son boîtier, ne le suit donc pas. */
function viaTientA(v,fid){
  const f=fpById(fid);
  if(!f)return false;
  for(const q of padsWorld(f))
    if(padCuLayers(f,q).some(l=>l>=v.a&&l<=v.b&&padHolds(f,q,l,v.x,v.y)))return true;
  return fanoutChains(v,1e9).some(c=>c.pad&&c.pad.fp===f);
}
/* Les boîtiers auxquels le via peut être lié : ceux qu'une piste ou une
   pastille lui relie. Pour le panneau Propriétés. */
function viaBoitiersRelies(v){
  const out=new Map();
  for(const f of S.fps)
    for(const q of padsWorld(f))
      if(padCuLayers(f,q).some(l=>l>=v.a&&l<=v.b&&padHolds(f,q,l,v.x,v.y)))out.set(f.id,f);
  for(const c of fanoutChains(v,1e9))if(c.pad)out.set(c.pad.fp.id,c.pad.fp);
  return [...out.values()];
}
/* Le boîtier que la règle automatique donnerait au via, marquage mis de côté. */
function viaLieAuto(v){
  const lie=v.lie;
  delete v.lie;
  try{
    for(const f of viaBoitiersRelies(v))if(fanoutVias([f]).has(v))return f;
    return null;
  }finally{if(lie!=null)v.lie=lie;}
}

/* ==========================================================================
   Alt en plein glissement : rien de ce qui n'est pas le boîtier ne bouge
   --------------------------------------------------------------------------
   Les pistes qui suivent restent déjà en place sous Alt (`applyFollow`). Le
   via de sortie aussi, et la piste qui le relie à sa pastille avec lui.
   ========================================================================== */
function dragAltHold(alt){
  if(!alt||!drag||!drag.fanout||!drag.fanout.size)return;
  const F=drag.follow;
  for(const o of drag.via)
    if(drag.fanout.has(o.v)){o.v.x=o.x;o.v.y=o.y;}
  for(const o of drag.trk)
    if(F&&F.rigidVia.has(o.t)){o.t.x1=o.x1;o.t.y1=o.y1;o.t.x2=o.x2;o.t.y2=o.y2;}
}

/* ==========================================================================
   Tourner plusieurs boîtiers : le groupe en bloc
   --------------------------------------------------------------------------
   Un boîtier seul tourne autour de son centre. Plusieurs tournent ENSEMBLE
   autour du centre de leur encombrement commun, comme dans Altium ou KiCad :
   chacun prend le quart de tour et sa place tourne avec lui, si bien que la
   piste tendue entre deux d'entre eux part en bloc, sans se déformer. Un quart
   de tour garde l'encombrement d'un groupe centré sur lui-même : enchaîner les
   quarts de tour, ou les rejouer après un décalage, donne la même chose.
   ========================================================================== */
function fpsTourner(ids,sens){
  const fps=ids.map(fpById).filter(Boolean);
  if(!fps.length)return;
  let cx=null, cy=null;
  if(fps.length>1){
    let x1=1e9,y1=1e9,x2=-1e9,y2=-1e9;
    for(const f of fps){
      const b=fpBBox(f);
      x1=Math.min(x1,b.x1);y1=Math.min(y1,b.y1);x2=Math.max(x2,b.x2);y2=Math.max(y2,b.y2);
    }
    cx=(x1+x2)/2;cy=(y1+y2)/2;
  }
  for(const f of fps){
    f.rot=(((f.rot||0)+90*sens)%360+360)%360;
    if(cx==null)continue;
    // le même sens que `fpXform` : x' = −y, y' = x pour un quart de tour direct
    const dx=f.x-cx, dy=f.y-cy;
    f.x=r3(cx-dy*sens);f.y=r3(cy+dx*sens);
  }
}

/* ==========================================================================
   Contrôle : la piste qui n'entre pas au centre de sa pastille
   --------------------------------------------------------------------------
   La règle est d'entrer au centre ; un bout décalé est permis (Ctrl au
   routage), mais il se voit : une ligne d'information par bout, jamais une
   faute. Les cartes d'avant les liens y trouvent leurs entrées de travers.
   ========================================================================== */
function linkHorsCentreDrc(out){
  linkSync();
  const vus=new Set();
  /* un coude qui tombe dans le cuivre d'une pastille longue n'est pas une
     entrée : la piste continue jusqu'au centre. Seul le bout où elle S'ARRÊTE
     dans la pastille est jugé. */
  const bouts=new Map(), cle=(t,x,y)=>t.l+"|"+t.net+"|"+r3(x)+"|"+r3(y);
  for(const t of S.tracks)
    for(const k of [cle(t,t.x1,t.y1),cle(t,t.x2,t.y2)])bouts.set(k,(bouts.get(k)||0)+1);
  for(const t of S.tracks)
    for(const e of [1,2]){
      const a=t["a"+e];
      if(!a||a.f==null)continue;
      if(bouts.get(cle(t,e===1?t.x1:t.x2,e===1?t.y1:t.y2))>1)continue;
      const f=fpById(a.f);
      if(!f)continue;
      const x=e===1?t.x1:t.x2, y=e===1?t.y1:t.y2;
      const q=padsWorld(f).find(o=>String(o.n)===String(a.p)&&padHolds(f,o,t.l,x,y));
      if(!q)continue;
      const d=dist(x,y,q.x,q.y);
      if(d<=EPS_J)continue;
      const k=t.l+"|"+r3(x)+"|"+r3(y);
      if(vus.has(k))continue;
      vus.add(k);
      out.push({info:true,x,y,l:t.l,
        msg:"Piste "+(t.net||"sans net")+" : entre dans "+f.ref+"."+q.n+" à "+fmt(d,2)+
            " mm de son centre"});
    }
}
