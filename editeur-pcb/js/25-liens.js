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
  let perdus=0;
  try{
    beginMove();
    const F=drag.follow;
    mutate();
    const mv=linkMover(avant);
    F.map=P0=>mv(P0,F.p0fp.get(P0));
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
  return perdus;
}
function linkPerdusHint(n){
  if(n>0)hint(n+" bout(s) de piste ne touchent plus leur pastille (passée sur "+
              "l'autre face ?) : le chevelu les montre, à re-router.");
}
