"use strict";
/* =============================================================================
   Éditeur PCB — 09-diffpair.js
   Paires différentielles : le tracé couplé, son panneau de règles, son contrôle.

   Pourquoi un outil à part plutôt que deux tracés côte à côte : une paire ne se
   route pas piste après piste. Ce qui compte, c'est ce qui se passe ENTRE les
   deux — l'écart, tenu au centième sur toute la longueur, et le peu de trajet
   où il ne l'est pas. Router la P puis la N donne deux pistes qui se
   ressemblent ; router la paire donne une paire.

   L'algorithme reprend celui du routeur de KiCad (`pns_diff_pair_placer.cpp`,
   à la racine du dépôt), ramené à ce que cet éditeur sait faire :

     · un **couple d'ancres** (FindDpPrimitivePair) : on clique près d'une
       pastille, le routeur va chercher tout seul l'ancre complémentaire la plus
       proche dans l'autre net de la paire, et se refuse à partir d'un point qui
       n'est pas un bout libre ;
     · un **axe** : le trajet se calcule au milieu des deux pistes, avec la
       géométrie 45° de l'éditeur (`routeCorner`), puis se dédouble de part et
       d'autre au demi-pas. C'est ce que fait DP_GATEWAYS::FitGateways, sans
       son catalogue de portes : décaler l'axe suffit tant que le pas de la
       paire quantifie les décrochements, ce dont `minSeg` se charge ;
     · des **amorces** (les gateways) : de l'ancre réelle vers l'entrée de
       l'axe, une jambe à 45° par piste. C'est par là que la paire s'ouvre en
       sortant de deux pastilles écartées, et se referme en arrivant ;
     · une **tête repoussée** (propagateDpHeadForces) : le point visé s'écarte
       des obstacles comme s'il portait un via du diamètre de la paire entière,
       écart compris. La paire ne se glisse donc jamais à moitié dans un
       couloir trop étroit ;
     · un **écartement de via** (EffectiveDiffPairViaGap) : deux vias ne
       tiennent pas au pas des pistes. La paire s'ouvre en éventail juste avant,
       et se referme de l'autre côté.

   Le **shove** et le **contournement** ne sont plus à part : depuis le moteur
   `1x-pns-*`, la paire les obtient en se présentant à lui comme une seule ligne
   large, celle de son axe (`dpLine`, `dpAxis`). Le cuivre gênant s'écarte donc
   devant une paire comme devant une piste seule, et par le même code.
   ============================================================================= */

/* ==========================================================================
   Géométrie couplée
   ========================================================================== */
/* Une suite de segments bout à bout, vue comme une suite de points, et
   réciproquement. Le reste du module travaille en points — un décalage ne se
   raisonne pas segment par segment, il se raisonne sommet par sommet. */
function dpPts(segs){
  if(!segs.length)return [];
  const out=[{x:segs[0].x1,y:segs[0].y1}];
  for(const s of segs)out.push({x:s.x2,y:s.y2});
  return out;
}
function dpSegs(pts){
  const out=[];
  for(let i=0;i<pts.length-1;i++){
    const a=pts[i], b=pts[i+1];
    if(Math.abs(a.x-b.x)<1e-9&&Math.abs(a.y-b.y)<1e-9)continue;
    out.push({x1:r3(a.x),y1:r3(a.y),x2:r3(b.x),y2:r3(b.y)});
  }
  return out;
}
function dpDir(a,b){
  const dx=b.x-a.x, dy=b.y-a.y, L=Math.hypot(dx,dy);
  return L<1e-12?{x:0,y:0}:{x:dx/L,y:dy/L};
}
/* La normale à gauche du sens de marche. Tout le module s'y tient : « le côté
   + », c'est la gauche, et le côté de P s'exprime en +1 ou -1. */
function dpPerp(u){return {x:-u.y,y:u.x};}
function dpCross(a,b){return a.x*b.y-a.y*b.x;}
function dpDot(a,b){return a.x*b.x+a.y*b.y;}

/* Décale une ligne brisée de `d` (signé). Aux sommets, les deux droites
   décalées se coupent : c'est le décalage à onglet, celui qui garde l'écart
   constant y compris dans les coudes — l'intérieur du coude se raccourcit,
   l'extérieur s'allonge, et la paire reste à distance constante. Un onglet peut
   partir très loin sur un angle rasant ; on le borne à trois fois le décalage,
   au-delà le sommet n'apporte plus rien. */
const DP_MITER=3;
function dpOffset(pts,d){
  const n=pts.length;
  if(n<2)return pts.map(p=>({x:p.x,y:p.y}));
  const u=[],nr=[];
  for(let i=0;i<n-1;i++){
    const ui=dpDir(pts[i],pts[i+1]);
    u.push(ui);nr.push(dpPerp(ui));
  }
  const out=[];
  for(let i=0;i<n;i++){
    if(i===0){out.push({x:pts[0].x+nr[0].x*d,y:pts[0].y+nr[0].y*d});continue;}
    if(i===n-1){
      out.push({x:pts[i].x+nr[i-1].x*d,y:pts[i].y+nr[i-1].y*d});continue;
    }
    const u1=u[i-1],u2=u[i],n1=nr[i-1],n2=nr[i];
    const den=dpCross(u1,u2);
    const p1={x:pts[i].x+n1.x*d,y:pts[i].y+n1.y*d};
    if(Math.abs(den)<1e-9){out.push(p1);continue;}   // tout droit : rien à couper
    const p2={x:pts[i].x+n2.x*d,y:pts[i].y+n2.y*d};
    let t=dpCross({x:p2.x-p1.x,y:p2.y-p1.y},u2)/den;
    const lim=DP_MITER*Math.abs(d);
    t=clamp(t,-lim,lim);
    out.push({x:p1.x+u1.x*t,y:p1.y+u1.y*t});
  }
  for(const q of out){q.x=r3(q.x);q.y=r3(q.y);}
  /* Un sommet replié — le décalage a mangé plus que la longueur du segment —
     laisserait la piste repartir en arrière sur son propre cuivre. On efface
     alors le sommet plutôt que de poser ce recouvrement, que le Gerber ne sait
     pas rendre. */
  for(let i=0;i<out.length-1;i++){
    const v=dpDir(out[i],out[i+1]);
    if(dpDot(v,u[Math.min(i,u.length-1)])<-1e-9){
      out.splice(i+1,1);i=Math.max(-1,i-2);
    }
  }
  return out;
}
/* Une jambe d'amorce : de l'ancre réelle vers l'entrée de l'axe. Diagonale
   d'abord — c'est l'éventail par lequel une paire sort de deux pastilles plus
   écartées que son pas, et il faut qu'il s'ouvre tout de suite. */
function dpLeg(a,b){
  /* Au micron près : c'est la précision à laquelle le cuivre se range dans le
     document. En deçà, l'ancre EST déjà l'entrée de l'axe, et une jambe de
     quelques dixièmes de micron ne serait qu'un segment nul de plus. */
  const A={x:r3(a.x),y:r3(a.y)}, B={x:r3(b.x),y:r3(b.y)};
  if(A.x===B.x&&A.y===B.y)return [];
  return routeCorner(A,B,true,null,0);
}

/* ==========================================================================
   Les ancres : d'où part la paire, où elle arrive
   --------------------------------------------------------------------------
   Port de FindDpPrimitivePair. On cherche l'ancre la plus proche du curseur
   dans l'un des deux nets, puis la plus proche de celle-là dans l'autre net.
   Comme chez KiCad, un bout de piste ne fait une ancre que s'il est **libre** :
   repartir du milieu d'une piste déjà posée ne relie rien.
   ========================================================================== */
function dpFreeEnd(t,e,l){
  const x=e===1?t.x1:t.x2, y=e===1?t.y1:t.y2;
  let k=0;
  for(const o of S.tracks){
    if(o.l!==l||o.net!==t.net)continue;
    if(Math.abs(o.x1-x)<EPS_J&&Math.abs(o.y1-y)<EPS_J)k++;
    if(Math.abs(o.x2-x)<EPS_J&&Math.abs(o.y2-y)<EPS_J)k++;
  }
  return k<=1;
}
/* Toutes les ancres d'un net sur une couche : centres de pastilles, vias, bouts
   de piste libres. */
function dpAnchors(net,layer){
  const out=[];
  if(!net)return out;
  for(const fp of S.fps)
    for(const q of padsWorld(fp)){
      if(q.net!==net||!padLayers(fp,q).includes(layer))continue;
      out.push({x:q.x,y:q.y,obj:q,pad:true});
    }
  for(const v of S.vias){
    if(v.net!==net||layer<v.a||layer>v.b)continue;
    out.push({x:v.x,y:v.y,obj:v,via:true});
  }
  for(const t of S.tracks){
    if(t.net!==net||t.l!==layer)continue;
    for(const e of [1,2])
      if(dpFreeEnd(t,e,layer))
        out.push({x:e===1?t.x1:t.x2,y:e===1?t.y1:t.y2,obj:t});
  }
  return out;
}
/* L'ancre la plus proche d'un point, dans une liste, hors de celles qu'on
   s'interdit (les ancres de départ, quand on cherche l'arrivée). */
function dpNearest(list,x,y,rad,skip){
  let best=null,bd=rad==null?Infinity:rad;
  for(const a of list){
    if(skip&&skip.some(s=>dist(s.x,s.y,a.x,a.y)<EPS_J))continue;
    const d=a.pad&&a.obj?Math.max(0,padDist(x,y,a.obj)):dist(x,y,a.x,a.y);
    if(d<bd){bd=d;best=a;}
  }
  return best;
}
/* Le couple d'ancres d'une paire, autour d'un point : {P,N} ou null. */
function dpPrimPair(pair,x,y,layer,rad,skip){
  const lp=dpAnchors(pair.p,layer), ln=dpAnchors(pair.n,layer);
  const p=dpNearest(lp,x,y,rad,skip), n=dpNearest(ln,x,y,rad,skip);
  if(!p&&!n)return null;
  /* On part de la plus proche des deux, et on cherche sa complémentaire au
     plus près d'ELLE : le curseur est entre les deux pastilles, la bonne
     référence est la pastille, pas la souris. */
  const dp=p?dist(x,y,p.x,p.y):Infinity, dn=n?dist(x,y,n.x,n.y):Infinity;
  if(dp<=dn){
    const m=dpNearest(ln,p.x,p.y,null,skip);
    return m?{P:p,N:m}:null;
  }
  const m=dpNearest(lp,n.x,n.y,null,skip);
  return m?{P:m,N:n}:null;
}
/* La paire visée par un clic : celle d'un net sous le curseur, sinon celle que
   le panneau a mise en avant. */
function dpPairAt(x,y,layer){
  const at=netAtPoint(x,y,layer);
  const byNet=at&&at.net?dpOfNet(at.net):null;
  if(byNet)return byNet;
  for(const pair of S.dpPairs)
    if(dpPrimPair(pair,x,y,layer,px(14)))return pair;
  return dpSelected();
}

/* ==========================================================================
   La paire vue par le moteur de routage
   --------------------------------------------------------------------------
   Une paire occupe la largeur de ses deux pistes plus l'écart. Tout le moteur
   (`11-pns-node.js` et la suite) sait travailler sur une ligne de largeur
   quelconque : il suffit donc de lui présenter la paire comme **une seule
   ligne large**, celle de son axe. Le contournement et le shove s'y appliquent
   alors sans une ligne de code de plus, et le dédoublement se fait après, comme
   il se faisait déjà.
   C'est exactement le raisonnement de KiCad, qui se donne un via virtuel du
   diamètre de la paire entière plutôt que de raffiner la forme réelle.
   ========================================================================== */
/* Les deux nets d'une paire, sous la forme que le moteur attend. */
function dpNets(pair){return new Set([pair.p,pair.n]);}
/* La ligne équivalente à la paire : l'axe, à la largeur de tout ce qu'elle
   occupe. Deux nets circulent dessous, le sien et celui de son jumeau ; `nets`
   les réunit, faute de quoi la paire se prendrait elle-même pour un obstacle
   dès le premier millimètre. */
function dpLine(D,pts,ext){
  return {l:D.layer, net:D.pair.p, nets:dpNets(D.pair),
          w:ext==null?(D.gap+2*D.w):ext, pts};
}
/* Le point visé, ramené hors de ce qui ne s'écartera pas. Même règle que pour
   une piste seule : en mode « pousser », seules les pastilles repoussent le
   curseur, le reste s'effacera de lui-même. */
function dpPush(pt,l,pair,ext){
  if(!S.avoid)return {x:pt.x,y:pt.y,pushed:false};
  const dur=routeMode()==="shove"?"P":"PSV";
  const nets=dpNets(pair);
  const N=pnsWorld();
  let p={x:pt.x,y:pt.y}, moved=false;
  for(let k=0;k<8;k++){
    const sonde=pnsItemSeg(l,pair.p,ext,p.x,p.y,p.x,p.y,null);
    sonde.nets=nets;
    let best=null;
    for(const o of N.colliding(sonde)){
      if(dur.indexOf(o.k)<0)continue;
      const e=pnsPointEscape(o,p,pair.p,ext);
      if(e&&(!best||e.def>best.def))best=e;
    }
    if(!best)break;
    p={x:r3(p.x+best.dx*(best.def+0.005)),y:r3(p.y+best.dy*(best.def+0.005))};
    moved=true;
  }
  return {x:p.x,y:p.y,pushed:moved};
}
/* L'axe direct, de la porte de départ au point visé.
   `minSeg` reste au pas de la paire : un décrochement plus court que
   l'écartement ne survivrait pas au décalage — l'onglet mangerait le segment et
   la piste repartirait sur elle-même. C'est la quantification que KiCad obtient
   par son catalogue de portes. */
function dpAxisDirect(D,from,to,snap){
  const pitch=D.gap+D.w;
  return routeCorner(from,to,dpPosture(D,from,to),null,snap?0:pitch);
}
/* Le même axe, mais faufilé autour de ce qui le gêne : la paire y passe pour
   une seule ligne large, et le contournement fait le reste. Rend `null` quand
   il n'y a rien à contourner ou qu'aucun tour ne passe. */
function dpAxis(D,from,to,snap){
  const direct=dpAxisDirect(D,from,to,snap);
  if(!direct.length||!S.avoid)return null;
  const N=pnsWorld();
  const line=dpLine(D,pnsPts(direct),D.gap+2*D.w);
  if(!N.firstObstacle(line))return null;
  const t=pnsWalkaround(N,line,null);
  return t.ok?pnsSegs(t.pts):null;
}

/* ==========================================================================
   Le tracé
   ========================================================================== */
/* La paire mise en avant par le panneau — celle que P vise quand le clic ne
   tombe sur aucun net. */
let _dpSel=0;
function dpSelected(){
  if(!S.dpPairs.length)return null;
  _dpSel=clamp(_dpSel,0,S.dpPairs.length-1);
  return S.dpPairs[_dpSel];
}
function dpSelect(i){
  _dpSel=clamp(i,0,Math.max(0,S.dpPairs.length-1));
  buildDiffPairs();
}
/* Écartement de deux vias de la paire : leur diamètre plus ce que l'isolation
   exige entre les deux nets. En deçà, le cuivre des deux vias se touche. */
function dpViaSpread(pair){
  const cl=classOf(pair.p);
  return r3(cl.via+clrPair(pair.p,pair.n));
}
/* ---------- la porte d'un couple d'ancres ----------
   C'est le BuildFromPrimitivePair de KiCad, ramené à un point et un sens. Deux
   pastilles côte à côte n'ont qu'une façon d'ouvrir une paire : sortir
   **perpendiculairement à leur axe**. Prendre le sens de marche du curseur,
   comme le fait une piste seule, ferait repartir la piste N sur la pastille P —
   deux pistes qui se recouvrent, ce qu'aucun Gerber ne sait rendre.

   La porte, c'est le point de l'axe d'où la paire est déjà au pas : les deux
   jambes qui y mènent forment l'éventail. Elle est en avant du milieu des
   ancres de la moitié de ce qu'il faut rattraper — à 45°, on avance d'autant
   qu'on se décale.
   ========================================================================== */
function dpGate(aP,aN,toward,pitch,prevSide,w){
  const mid={x:(aP.x+aN.x)/2,y:(aP.y+aN.y)/2};
  const D=dist(aP.x,aP.y,aN.x,aN.y);
  let nh=D>1e-9?dpPerp(dpDir(aP,aN)):{x:0,y:0};
  const away={x:toward.x-mid.x,y:toward.y-mid.y};
  if(!nh.x&&!nh.y)nh=dpDir(mid,toward);            // ancres confondues : droit devant
  else if(dpDot(nh,away)<0)nh={x:-nh.x,y:-nh.y};
  /* La porte se pose un pas plus loin que le strict nécessaire. Sans cette
     marge, le coude de l'axe tombe pile là où l'éventail se referme, et il
     reste un décrochement plus court que la piste — l'écharde que le graveur
     sous-attaque, et que le contrôle DRC signale à juste titre. Un pas de
     paire suffit à dégager le coude. */
  const lead=Math.abs(D-pitch)/2+pitch/2+w;
  const gate={x:r3(mid.x+nh.x*lead),y:r3(mid.y+nh.y*lead)};
  const pr=dpPerp(nh);
  const s=dpDot({x:aP.x-mid.x,y:aP.y-mid.y},pr);
  return {mid:mid,gate:gate,n:nh,lead:lead,
          side:Math.abs(s)<1e-9?(prevSide||1):(s>0?1:-1)};
}
/* Le milieu du couple d'ancres courant : c'est de là que part l'axe. */
function dpMid(D){
  return {x:r3((D.aP.x+D.aN.x)/2),y:r3((D.aP.y+D.aN.y)/2)};
}
/* La posture du coude en cours, prise sur l'axe : même règle que pour une
   piste seule, la paire continue dans sa direction puis tourne. */
function dpPosture(D,from,b){
  const last=D.mid.length?D.mid[D.mid.length-1]:null;
  return D.flip!==autoPosture(from,b,last?dir8(last):null);
}
/* Le point visé : une arrivée accrochée sur le couple d'ancres opposé, ou un
   point libre repoussé hors des obstacles. La portée d'accrochage se mesure au
   cuivre des pastilles, comme celle de l'aimant du tracé simple : survoler la
   pastille d'arrivée suffit à terminer la paire. */
function dpTarget(D,x,y){
  const pair=D.pair, pitch=D.gap+D.w, mid=dpMid(D);
  const skip=[D.aP,D.aN];
  const tgt=dpPrimPair(pair,x,y,D.layer,Math.max(px(14),1),skip);
  if(tgt){
    S.hover={x:r3((tgt.P.x+tgt.N.x)/2),y:r3((tgt.P.y+tgt.N.y)/2)};
    return {x:S.hover.x,y:S.hover.y,snap:true,tP:tgt.P,tN:tgt.N,pushed:false};
  }
  S.hover=null;
  const p=dpPush({x:snapXn(x,mid.x),y:snapYn(y,mid.y)},D.layer,pair,pitch+D.w);
  return {x:p.x,y:p.y,snap:false,pushed:p.pushed};
}
/* Départ : le clic désigne la paire, le couple d'ancres et la couche. */
function dpStart(x,y){
  const pair=dpPairAt(x,y,S.active);
  if(!pair){
    hint(S.dpPairs.length
      ? "Aucune paire différentielle par ici : cliquez sur une pastille de la paire visée."
      : "Aucune paire différentielle déclarée. Choisissez ses deux nets dans le "+
        "panneau puis « Créer la paire », ou « Détecter ».");
    return false;
  }
  const a=dpPrimPair(pair,x,y,S.active,Math.max(px(20),5));
  if(!a){
    hint("Paire "+pair.name+" : pas de point de départ ici. Il faut un bout libre "+
         "des deux nets sur la couche "+cuId(S.active,S.cu)+" — une pastille, un via, "+
         "ou la fin d'une piste déjà posée.");
    return false;
  }
  const g=dpGeom(pair,S.active);
  S.dp={pair:pair,layer:S.active,w:g.w,gap:g.gap,
        pt:{x:r3((a.P.x+a.N.x)/2),y:r3((a.P.y+a.N.y)/2)},
        aP:{x:a.P.x,y:a.P.y}, aN:{x:a.N.x,y:a.N.y},
        side:1, mid:[], doneP:[], doneN:[], prevP:[], prevN:[], midPrev:[],
        vias:[], steps:[], flip:false, bad:false, end:null, snap:false,
        /* `doc` : la carte avant le geste. Le shove écarte du cuivre dès le
           premier clic ; sans cet instantané, ni l'abandon ni le Ctrl+Z ne
           sauraient le remettre en place. */
        shove:null, shoved:false, doc:serialize()};
  S.hlNet=null;
  hint("Paire "+pair.name+" — "+pair.p+" / "+pair.n+" : "+fmt(g.w,3)+" mm de piste, "+
       fmt(g.gap,3)+" mm d'écart. Clic pour poser un coude · « / » bascule la posture · "+
       "V pose les deux vias · Échap termine.");
  return true;
}
/* Le trajet, de la porte de départ au point visé. Tout se joue ici : les deux
   portes, l'axe entre elles, son dédoublement, et les jambes d'éventail qui
   relient les ancres réelles à la paire déjà au pas.

   Le point délicat, c'est le raccord entre l'éventail et l'axe. L'éventail sort
   perpendiculairement à l'axe des ancres ; l'axe, lui, part vers le curseur. Le
   décalage doit donc connaître les DEUX directions pour couper son onglet au
   bon endroit — d'où le milieu des ancres glissé en tête de la ligne brisée,
   puis retiré du résultat : il n'a servi qu'à donner le sens d'entrée. Sans
   lui, la jambe de N arrivait de travers et repassait à cinq centièmes de la
   jambe de P. */
function dpUpdate(x,y){
  const D=S.dp;
  if(!D)return;
  const pair=D.pair, pitch=D.gap+D.w;
  const t=dpTarget(D,x,y);
  D.end=t;D.snap=!!t.snap;D.pushed=!!t.pushed;
  const gA=dpGate(D.aP,D.aN,{x:t.x,y:t.y},pitch,D.side,D.w);
  D.side=gA.side;
  D.pt=gA.mid;
  const gB=t.snap?dpGate(t.tP,t.tN,gA.gate,pitch,D.side,D.w):null;
  const to=gB?gB.gate:{x:t.x,y:t.y};
  const direct=dpAxisDirect(D,gA.gate,to,t.snap);
  D.shove=null;D.detour=false;

  /* Trois tentatives, dans l'ordre de la règle en vigueur. Chacune se juge sur
     les DEUX pistes réellement obtenues, éventails compris : c'est la seule
     géométrie qui compte, et près des pastilles la paire s'ouvre bien au-delà
     de son pas — un axe large ne la représenterait pas.
       1. la route directe, si elle est libre ;
       2. la poussée, à partir des deux pistes telles qu'elles sont ;
       3. le faufilage, qui redessine l'axe autour de l'obstacle.
     Faute de quoi le trajet est signalé, et ne se posera pas. */
  if(dpPose(D,gA,gB,t,direct,null)){D.bad=false;return;}
  const mode=routeMode();
  if(mode==="shove"&&S.avoid){
    const r=pnsShoveHeads(pnsWorld(),
      [{l:D.layer,net:pair.p,w:D.w,pts:pnsPts(D.prevP)},
       {l:D.layer,net:pair.n,w:D.w,pts:pnsPts(D.prevN)}],null,Date.now());
    if(r.ok&&dpPose(D,gA,gB,t,direct,r)){D.bad=false;return;}
  }
  if(mode!=="mark"){
    const tour=dpAxis(D,gA.gate,to,t.snap);
    if(tour&&dpPose(D,gA,gB,t,tour,null)){D.detour=true;D.bad=false;return;}
  }
  dpPose(D,gA,gB,t,direct,null);
  D.bad=true;
}
/* Une tentative : l'axe donné, dédoublé en deux pistes, rangé dans `D`, puis
   jugé. Rend `true` si le résultat tient — c'est-à-dire s'il n'y a plus rien à
   essayer. */
function dpPose(D,gA,gB,t,axis,shove){
  const pair=D.pair, pitch=D.gap+D.w;
  D.shove=shove||null;
  D.midPrev=axis.map(sg=>Object.assign({l:D.layer},sg));
  let pts=axis.length?dpPts(axis):[{x:gA.gate.x,y:gA.gate.y}];
  /* Le point d'appui, en arrière de la porte : il ne sera pas posé, il ne sert
     qu'à donner à l'onglet le sens d'ARRIVÉE de la paire. Sans lui, le premier
     sommet se décale perpendiculairement au sens de DÉPART de l'axe, et les
     deux jambes se rejoignent au milieu — deux pistes qui se touchent. */
  const back=Math.max(gA.lead,pitch);
  pts=[{x:r3(gA.gate.x-gA.n.x*back),y:r3(gA.gate.y-gA.n.y*back)}].concat(pts);
  let tail=0;
  if(gB){
    const fwd=Math.max(gB.lead,pitch);
    pts=pts.concat([{x:r3(gB.gate.x-gB.n.x*fwd),y:r3(gB.gate.y-gB.n.y*fwd)}]);
    tail=1;
  }
  let oP,oN;
  if(pts.length>2||(pts.length===2&&!tail)){
    oP=dpOffset(pts, gA.side*pitch/2).slice(1,tail?-1:undefined);
    oN=dpOffset(pts,-gA.side*pitch/2).slice(1,tail?-1:undefined);
  }else{
    /* Ni axe ni éventail : la paire est déjà à sa porte. Les deux entrées se
       posent de part et d'autre, perpendiculairement au sens de sortie. */
    const pr=dpPerp(gA.n);
    oP=[{x:r3(gA.gate.x+pr.x*gA.side*pitch/2),y:r3(gA.gate.y+pr.y*gA.side*pitch/2)}];
    oN=[{x:r3(gA.gate.x-pr.x*gA.side*pitch/2),y:r3(gA.gate.y-pr.y*gA.side*pitch/2)}];
  }
  if(!oP.length||!oN.length){D.prevP=[];D.prevN=[];D.cross=false;return true;}
  let chP=dpLeg(D.aP,oP[0]).concat(dpSegs(oP));
  let chN=dpLeg(D.aN,oN[0]).concat(dpSegs(oN));
  D.cross=false;
  if(t.snap&&t.tP&&t.tN){
    const eP=oP[oP.length-1], eN=oN[oN.length-1];
    /* Le couple d'arrivée est déjà rangé (P avec P, N avec N). S'il se trouve
       dans l'ordre inverse du nôtre, les deux jambes se croisent : c'est un
       court-circuit franc, pas un tracé. Cela arrive quand le trajet fait
       demi-tour — une paire ne change pas de côté sans se croiser. On le
       montre en rouge et on refuse de le poser ; il faut arriver par l'autre
       bord, ou permuter les deux pistes à la main avec l'outil « Piste ». */
    D.cross=dist(eP.x,eP.y,t.tP.x,t.tP.y)>dist(eP.x,eP.y,t.tN.x,t.tN.y);
    chP=chP.concat(dpLeg(eP,t.tP));
    chN=chN.concat(dpLeg(eN,t.tN));
  }
  D.prevP=chP.map(sg=>Object.assign({l:D.layer},sg));
  D.prevN=chN.map(sg=>Object.assign({l:D.layer},sg));
  if(D.cross)return false;
  /* Le contrôle se fait sur le monde TEL QU'IL SERA : quand le shove a écarté
     du cuivre, c'est la branche qu'il faut relire, pas la carte d'avant. Sans
     cela, la paire se verrait refuser le passage que la poussée vient
     justement d'ouvrir. Les deux pistes qu'on a soumises à la poussée ne
     comptent évidemment pas contre elles-mêmes. */
  const NB=(shove&&shove.node)||pnsWorld();
  const hors=new Set(shove&&shove.tete?shove.tete:[]);
  const chaineBad=(segs,net,ignore)=>{
    if(!S.avoid||!net)return false;
    for(const sg of segs){
      const sk=new Set(hors);
      if(ignore)sk.add(ignore);
      if(NB.segBad(sg,D.layer,net,D.w,sk))return true;
    }
    return false;
  };
  return !chaineBad(D.prevP,pair.p,t.snap?t.tP.obj:null)&&
         !chaineBad(D.prevN,pair.n,t.snap?t.tN.obj:null);
}
/* Un clic : le trajet en cours passe du côté « posé ». Comme pour une piste
   seule, un trajet qui ne respecte pas l'isolation ne se pose pas — on le dit
   au lieu de le refuser en silence. */
/* Un marque-page avant chaque avancée : c'est par lui que le retour arrière
   revient exactement à l'état d'avant, vias compris. Compter les segments à
   rebours ne suffisait pas — un éventail de vias en pose d'autres, et d'autres
   longueurs de chaque côté. */
function dpMark(D){
  D.steps.push({p:D.doneP.length,n:D.doneN.length,m:D.mid.length,
                v:D.vias.length,layer:D.layer,side:D.side,w:D.w,gap:D.gap,
                aP:{x:D.aP.x,y:D.aP.y},aN:{x:D.aN.x,y:D.aN.y}});
}
function dpStep(){
  const D=S.dp;
  if(!D||(!D.prevP.length&&!D.prevN.length))return;
  if(D.bad){
    hint(D.cross
      ? "Les deux pistes arriveraient croisées sur les pastilles d'en face — le "+
        "trajet fait demi-tour, et une paire ne change pas de côté sans se "+
        "court-circuiter. Approchez par l'autre bord."
      : "Ce trajet passe sous l'isolation : contournez l'obstacle, ou coupez "+
        "l'anti-collision pour forcer.");
    return;
  }
  dpMark(D);
  if(D.shove&&pnsApply(D.shove)){D.shoved=true;D.shove=null;refreshPanels();}
  for(const s of D.prevP)D.doneP.push(s);
  for(const s of D.prevN)D.doneN.push(s);
  for(const s of D.midPrev)D.mid.push(s);
  const lp=D.prevP[D.prevP.length-1], ln=D.prevN[D.prevN.length-1];
  if(lp)D.aP={x:lp.x2,y:lp.y2};
  if(ln)D.aN={x:ln.x2,y:ln.y2};
  D.pt=dpMid(D);
  D.prevP=[];D.prevN=[];D.midPrev=[];
  D.flip=false;
  if(D.snap)dpCommit();
}
/* Les deux vias. Au pas des pistes ils se toucheraient : la paire s'ouvre donc
   en éventail juste avant — une jambe à 45° de chaque côté — jusqu'à
   l'écartement que l'isolation réclame. De l'autre côté, les amorces se
   chargent de la refermer. */
function dpVia(){
  const D=S.dp;
  if(!D||S.cu<2)return;
  const pair=D.pair, pitch=D.gap+D.w, spread=dpViaSpread(pair);
  let u=null;
  dpMark(D);
  const lm=D.mid.length?D.mid[D.mid.length-1]:(D.midPrev.length?D.midPrev[D.midPrev.length-1]:null);
  if(lm)u=dpDir({x:lm.x1,y:lm.y1},{x:lm.x2,y:lm.y2});
  if((!u||(!u.x&&!u.y))&&spread>pitch+1e-6){
    D.steps.pop();
    hint("Posez d'abord un bout de paire : l'éventail des vias a besoin d'un sens "+
         "de marche pour s'ouvrir.");
    return;
  }
  if(spread>pitch+1e-6){
    const k=r3((spread-pitch)/Math.SQRT2);        // jambe à 45°, de chaque côté
    const nP={x:dpPerp(u).x*D.side,y:dpPerp(u).y*D.side};
    const fan=(a,sg)=>{
      const b={x:r3(a.x+(u.x+nP.x*sg)/Math.SQRT2*k),
               y:r3(a.y+(u.y+nP.y*sg)/Math.SQRT2*k)};
      return {b:b,seg:{l:D.layer,x1:a.x,y1:a.y,x2:b.x,y2:b.y}};
    };
    const fP=fan(D.aP,1), fN=fan(D.aN,-1);
    D.doneP.push(fP.seg);D.doneN.push(fN.seg);
    const before=D.pt;
    D.aP=fP.b;D.aN=fN.b;D.pt=dpMid(D);
    D.mid.push({l:D.layer,x1:before.x,y1:before.y,x2:D.pt.x,y2:D.pt.y});
  }
  const other=(D.layer===S.pair[0])?S.pair[1]:S.pair[0];
  const a=Math.min(D.layer,other), b=Math.max(D.layer,other);
  const vP=placeVia(D.aP.x,D.aP.y,pair.p,a,b,true);
  const vN=placeVia(D.aN.x,D.aN.y,pair.n,a,b,true);
  if(vP)D.vias.push(vP);
  if(vN)D.vias.push(vN);
  D.layer=other;S.active=other;
  /* La couche a changé : la règle peut y imposer d'autres cotes. */
  const g=dpGeom(pair,other);
  D.w=g.w;D.gap=g.gap;
  buildTabs();buildLayers();refreshPanels();
  hint("Paire "+pair.name+" sur "+cuId(other,S.cu)+" : "+fmt(g.w,3)+" mm de piste, "+
       fmt(g.gap,3)+" mm d'écart · vias écartés de "+fmt(spread,3)+" mm.");
}
/* Changement de couche direct (touches 1-8) : deux vias et on continue. */
function dpToLayer(i){
  const D=S.dp;
  if(!D||i===D.layer||i<0||i>=S.cu)return;
  const save=S.pair;
  S.pair=[Math.min(D.layer,i),Math.max(D.layer,i)];
  dpVia();
  S.pair=save;
}
/* Dépôt : le cuivre de la paire rejoint la carte. Même ménage que pour une
   piste seule — les segments alignés fusionnent, les angles droits laissés au
   passage se chanfreinent. */
function dpCommit(){
  const D=S.dp;
  S.dp=null;
  if(!D)return;
  if(!D.doneP.length&&!D.doneN.length&&!D.shoved){touch();draw();return;}
  pushSnap(D.doc);
  const posed=[];
  for(const [segs,net] of [[D.doneP,D.pair.p],[D.doneN,D.pair.n]]){
    let prev=null;
    for(const s of segs){
      const t={l:s.l,net:net,w:D.w,x1:r3(s.x1),y1:r3(s.y1),x2:r3(s.x2),y2:r3(s.y2)};
      if(t.x1===t.x2&&t.y1===t.y2)continue;
      if(prev&&sameLine(prev,t)){prev.x2=t.x2;prev.y2=t.y2;continue;}
      S.tracks.push(t);prev=t;posed.push(t);
    }
  }
  /* Pas de chanfrein automatique ici, à la différence d'une piste seule : le
     décalage a déjà taillé chaque coude à sa place, l'intérieur raccourci et
     l'extérieur allongé, pour que l'écart reste constant d'un bout à l'autre.
     Reprendre chaque angle une piste à la fois le déferait — c'est justement ce
     que mesure la longueur découplée. */
  touch();refreshPanels();draw();
  hint("Paire "+D.pair.name+" posée : "+posed.length+" segment(s), "+
       D.vias.length+" via(s).");
}
function dpCancel(){
  const D=S.dp;
  if(!D)return;
  S.dp=null;
  // le cuivre poussé se remet en place, comme pour une piste seule
  if(D.shoved&&D.doc){loadDoc(JSON.parse(D.doc),true);return;}
  for(const v of D.vias){const i=S.vias.indexOf(v);if(i>=0)S.vias.splice(i,1);}
  touch();draw();
}
/* Revenir d'un coude : les deux pistes reculent ensemble, l'axe aussi, et les
   vias posés en chemin repartent avec. Le marque-page dit exactement où
   c'était — pas de géométrie à refaire, donc rien à retrouver de travers. */
function dpBack(){
  const D=S.dp;
  if(!D||!D.steps.length)return;
  const m=D.steps.pop();
  D.doneP.length=m.p;D.doneN.length=m.n;D.mid.length=m.m;
  for(const v of D.vias.slice(m.v)){
    const i=S.vias.indexOf(v);
    if(i>=0)S.vias.splice(i,1);
  }
  D.vias.length=m.v;
  D.aP={x:m.aP.x,y:m.aP.y};D.aN={x:m.aN.x,y:m.aN.y};
  D.side=m.side;D.w=m.w;D.gap=m.gap;
  D.pt=dpMid(D);
  if(D.layer!==m.layer){D.layer=m.layer;setActive(m.layer);}
  D.prevP=[];D.prevN=[];D.midPrev=[];
  touch();refreshPanels();draw();
}

/* ==========================================================================
   Rendu
   ========================================================================== */
function drawDp(c){
  const D=S.dp;
  if(!D)return;
  drawShove(c,D.shove);            // le cuivre que la paire écarterait
  const col=layerColor(D.layer);
  c.lineCap="round";c.lineJoin="round";
  c.globalAlpha=0.85;c.strokeStyle=col;c.lineWidth=D.w;
  strokeRuns(c,D.doneP);strokeRuns(c,D.doneN);
  c.setLineDash([px(6),px(4)]);
  if(D.bad)c.strokeStyle=C_ERR;
  strokeRuns(c,D.prevP);strokeRuns(c,D.prevN);
  c.setLineDash([]);
  /* L'axe : le trait fin qui dit que les deux pistes n'en font qu'une. Il ne
     part pas au Gerber, il n'existe que le temps du tracé. */
  c.globalAlpha=0.4;c.strokeStyle=C_SEL;c.lineWidth=px(0.8);
  c.setLineDash([px(2),px(3)]);
  strokeRuns(c,D.mid);strokeRuns(c,D.midPrev);
  c.setLineDash([]);
  c.globalAlpha=1;
  c.fillStyle=C_SEL;
  for(const a of [D.aP,D.aN]){
    c.beginPath();c.arc(a.x,a.y,px(2.5),0,Math.PI*2);c.fill();
  }
  if(D.end&&D.pushed){
    c.strokeStyle=C_ERR;c.lineWidth=px(1.4);
    c.beginPath();c.arc(D.end.x,D.end.y,px(7),0,Math.PI*2);c.stroke();
  }
}

/* ==========================================================================
   Couplage : ce que la paire fait vraiment sur la carte
   --------------------------------------------------------------------------
   Une paire tenue à son écart est couplée ; partout ailleurs elle ne l'est
   plus, et c'est cette longueur découplée que la règle borne. On la mesure en
   parcourant la piste P au pas fin et en regardant, à chaque pas, si la piste N
   est bien là où elle doit être. Rien de plus fin ne servirait : la mesure sert
   à décider si un contournement est trop long, pas à publier un chiffre.
   ========================================================================== */
const DP_STEP=0.1;                  // pas d'échantillonnage, en mm
const DP_SAMPLES=40e3;              // au-delà, on desserre le pas
function dpCoupling(pair){
  const P=S.tracks.filter(t=>t.net===pair.p);
  const N=S.tracks.filter(t=>t.net===pair.n);
  const out={len:0,coupled:0,uncoupled:0,lenN:0};
  if(!P.length||!N.length)return out;
  let total=0;
  for(const t of P)total+=dist(t.x1,t.y1,t.x2,t.y2);
  for(const t of N)out.lenN+=dist(t.x1,t.y1,t.x2,t.y2);
  out.len=r3(total);
  const step=Math.max(DP_STEP,total/DP_SAMPLES);
  for(const t of P){
    const L=dist(t.x1,t.y1,t.x2,t.y2);
    if(L<1e-9)continue;
    const v=dpValues(dpRuleFor(pair),t.l);
    const n=Math.max(1,Math.ceil(L/step)), dl=L/n;
    for(let i=0;i<n;i++){
      const f=(i+0.5)/n;
      const x=t.x1+(t.x2-t.x1)*f, y=t.y1+(t.y2-t.y1)*f;
      let best=Infinity, bw=0;
      for(const o of N){
        if(o.l!==t.l)continue;
        const c=projOnSeg(x,y,o);
        const d=dist(x,y,c.x,c.y);
        if(d<best){best=d;bw=o.w;}
      }
      const gap=best-t.w/2-bw/2;                 // écart entre bords de cuivre
      if(gap>=v.minGap-1e-4&&gap<=v.maxGap+1e-4)out.coupled+=dl;
    }
  }
  out.coupled=r3(out.coupled);
  out.uncoupled=r3(Math.max(0,total-out.coupled));
  return out;
}
/* Le contrôle des paires, greffé sur `runDrc`. Trois reproches possibles : une
   piste hors des bornes de largeur, un trop long trajet découplé, une paire
   dont un net a disparu de la carte. L'écart trop serré, lui, remonte tout seul
   par l'isolation piste/piste — `clrPair` sait déjà qu'entre les deux nets
   d'une paire, c'est l'écart mini qui fait loi. */
function dpDrc(out){
  const nets=new Set(netTable().map(n=>n.name));
  for(const pair of S.dpPairs){
    const r=dpRuleFor(pair);
    const miss=[pair.p,pair.n].filter(n=>!nets.has(n));
    const anchor=()=>{
      const t=S.tracks.find(x=>x.net===pair.p||x.net===pair.n);
      return t?{x:t.x1,y:t.y1,l:t.l}:{x:S.board.x,y:S.board.y,l:0};
    };
    if(miss.length){
      const a=anchor();
      out.push({info:true,x:a.x,y:a.y,l:a.l,
        msg:"Paire "+pair.name+" : "+miss.join(" et ")+" absent(s) de la carte"});
      continue;
    }
    for(const t of S.tracks){
      if(t.net!==pair.p&&t.net!==pair.n)continue;
      const v=dpValues(r,t.l);
      if(t.w<v.minW-1e-4||t.w>v.maxW+1e-4)
        out.push({x:(t.x1+t.x2)/2,y:(t.y1+t.y2)/2,l:t.l,
          msg:"Paire "+pair.name+" : piste "+t.net+" de "+fmt(t.w,3)+
              " mm, hors des bornes "+fmt(v.minW,3)+" – "+fmt(v.maxW,3)+" mm"});
    }
    const cp=dpCoupling(pair);
    if(cp.len>0&&cp.uncoupled>r.maxUncoupled+1e-3){
      const a=anchor();
      out.push({x:a.x,y:a.y,l:a.l,
        msg:"Paire "+pair.name+" : "+fmt(cp.uncoupled,2)+" mm découplés pour "+
            fmt(r.maxUncoupled,2)+" mm admis"});
    }
    /* Deux pistes de longueurs franchement différentes, c'est un décalage
       temporel entre les deux fronts — le désappariement. On le signale pour
       information : le corriger demande un serpentin, que cet éditeur ne pose
       pas encore. */
    if(cp.len>0&&cp.lenN>0&&Math.abs(cp.len-cp.lenN)>0.5)
      out.push({info:true,x:anchor().x,y:anchor().y,l:anchor().l,
        msg:"Paire "+pair.name+" : "+fmt(Math.abs(cp.len-cp.lenN),2)+
            " mm d'écart de longueur entre "+pair.p+" et "+pair.n});
  }
}

/* ==========================================================================
   Créer une paire
   ========================================================================== */
/* Deux nets, une paire. Tout passe par ici — les deux listes du panneau, la
   détection, l'ancienne sélection de deux pistes — parce que les vérifications
   sont les mêmes partout : deux nets distincts, aucun des deux déjà apparié.

   `keepOrder` dit si l'appelant a déjà tranché qui est P. Les deux listes du
   panneau le savent (c'est justement ce qu'on y désigne), une sélection de deux
   pistes non : là, les suffixes des noms de net décident, et faute de suffixe
   lisible l'ordre reste celui d'arrivée. */
function dpMakePair(a,b,keepOrder){
  a=String(a||"");b=String(b||"");
  if(!a||!b){hint("Une paire demande deux nets : choisissez le net P et le net N.");return null;}
  if(a===b){hint("Le net "+a+" ne peut pas faire une paire avec lui-même.");return null;}
  const exist=dpOfNet(a)||dpOfNet(b);
  if(exist){
    hint("Le net "+(dpOfNet(a)?a:b)+" appartient déjà à la paire "+exist.name+".");
    _dpSel=S.dpPairs.indexOf(exist);
    buildDiffPairs();
    return exist;
  }
  const m=dpMatch(a,b);
  push();
  const pair={id:S.nextId++,
              name:dpFreeName(m?m.base:a),
              p:keepOrder?a:(m?m.p:a),
              n:keepOrder?b:(m?m.n:b)};
  S.dpPairs.push(pair);
  _dpSel=S.dpPairs.length-1;
  touch();refreshPanels();draw();
  hint("Paire "+pair.name+" créée : "+pair.p+" en P, "+pair.n+" en N"+
       (keepOrder||m?"":" — l'ordre vient de la sélection, les noms ne disent pas "+
        "lequel est lequel.")+
       " Touche P pour la router.");
  return pair;
}
/* Deux pistes sélectionnées, deux nets : voilà une paire. Le panneau ne s'en
   sert plus — il a ses deux listes — mais le geste garde son intérêt quand on
   vient de tirer deux amorces à la main et qu'on ne sait plus leurs noms. */
function dpFromSel(){
  const nets=[];
  for(const t of S.sel.tracks)if(t.net&&nets.indexOf(t.net)<0)nets.push(t.net);
  for(const v of S.sel.vias)if(v.net&&nets.indexOf(v.net)<0)nets.push(v.net);
  if(nets.length!==2){
    hint(nets.length<2
      ? "Sélectionnez deux pistes de deux nets différents pour en faire une paire."
      : "Trop de nets dans la sélection ("+nets.length+") : une paire n'en réunit que deux.");
    return null;
  }
  return dpMakePair(nets[0],nets[1],false);
}
/* Toutes les paires que les noms de net trahissent, d'un coup. */
function dpAutoAll(){
  const found=dpDetect().filter(f=>!dpOfNet(f.p)&&!dpOfNet(f.n));
  if(!found.length){
    hint("Aucune nouvelle paire à déduire des noms de net. Les noms reconnus se "+
         "terminent par P/N, +/-, DP/DM.");
    return 0;
  }
  push();
  for(const f of found)
    S.dpPairs.push({id:S.nextId++,name:dpFreeName(f.name),p:f.p,n:f.n});
  touch();refreshPanels();draw();
  hint(found.length+" paire(s) déduite(s) des noms de net : "+
       found.map(f=>f.name).join(", ")+".");
  return found.length;
}
function dpDelete(pair){
  const i=S.dpPairs.indexOf(pair);
  if(i<0)return;
  push();
  S.dpPairs.splice(i,1);
  for(const r of S.dpRules)if(r.scope===pair.name)r.scope="";
  _dpSel=clamp(_dpSel,0,Math.max(0,S.dpPairs.length-1));
  touch();refreshPanels();draw();
  hint("Paire "+pair.name+" supprimée. Le cuivre déjà posé ne bouge pas : "+
       "seules les règles de couplage cessent de s'y appliquer.");
}

/* ==========================================================================
   Panneau « Paires différentielles »
   --------------------------------------------------------------------------
   La disposition reprend celle des logiciels de CAO du commerce, parce que
   c'est celle que connaissent ceux qui routent des paires : l'entête nomme la
   règle, « Objets visés » dit à quoi elle s'applique, « Contraintes » aligne
   les six cotes en trois lignes mini / préféré / maxi, et le tableau du bas
   les décline couche par couche. L'habillage, lui, est celui de l'éditeur —
   mêmes jetons de couleur, même monospace, mêmes tableaux que l'empilage.
   ========================================================================== */
/* ---------- les deux listes de nets ----------
   Une paire se déclare en désignant ses deux nets, pas en montrant deux pistes :
   c'est le seul geste qui marche avant qu'une seule piste soit tirée, et le seul
   où l'on choisit soi-même qui est P. Les deux choix en attente vivent dans
   `01-core` (`_dpNewP`, `_dpNewN`) : voir là-bas pourquoi.

   Un net utilisable : il existe dans la netlist et n'est pas déjà apparié. */
function dpNetFree(names,n){
  return !!n&&names.indexOf(n)>=0&&!dpOfNet(n);
}
/* Les options d'une des deux listes. Un net déjà apparié reste visible, grisé,
   suivi du nom de sa paire : le voir disparaître ne dirait pas pourquoi. Le net
   retenu dans l'autre liste se grise aussi — une paire, c'est deux nets. */
function dpNetOpts(names,cur,other){
  let h='<option value=""'+(cur?"":" selected")+'>— net —</option>';
  for(const n of names){
    const own=dpOfNet(n), off=!!own||n===other;
    h+='<option value="'+esc(n)+'"'+(n===cur?" selected":"")+
       (off&&n!==cur?" disabled":"")+'>'+esc(n)+(own?" · "+esc(own.name):"")+
       '</option>';
  }
  return h;
}
/* Le net d'en face, quand le nom du premier le dit. On ne le propose que si le
   net choisi se lit comme le côté P : c'est la liste P qui l'a reçu, et
   retourner la polarité derrière le dos de celui qui vient de la désigner
   serait pire que de ne rien proposer. */
function dpMateGuess(names,net){
  for(const sp of dpSplit(net)){
    if(sp.pol!=="p")continue;
    const mate=dpMateName(sp);
    if(mate!==net&&dpNetFree(names,mate))return mate;
  }
  return "";
}

let _dpRule=0;
/* La règle affichée. Tant qu'aucune n'a été écrite, on montre celle d'usine :
   la première retouche l'inscrit dans le document. */
function dpPanelRule(){
  if(!S.dpRules.length)return {r:Object.assign({},DP_FALLBACK,{layers:{}}),draft:true};
  _dpRule=clamp(_dpRule,0,S.dpRules.length-1);
  return {r:S.dpRules[_dpRule],draft:false};
}
/* Inscrire la règle d'usine dans le document, au premier changement. */
function dpMaterialize(r){
  push();
  const n=Object.assign({},r,{layers:{},uid:r.uid||dpUid()});
  S.dpRules.push(n);
  _dpRule=S.dpRules.length-1;
  return n;
}
/* Le dessin de tête : deux pistes couplées, leurs cotes nommées. Il ne
   remplace pas les chiffres, il dit lequel est lequel — c'est tout ce qu'on
   demande à une figure de règle. */
function dpFigure(w,gap){
  const col=activeColor();
  const t=clamp(6+w*10,5,16), g=clamp(6+gap*10,5,20);
  const yA=44-(t+g)/2, yB=44+(t+g)/2;
  const L=(y)=>'<path d="M14 '+y+' H92 L124 '+(y===yA?y-14:y+14)+' H196 L228 '+y+' H316" '+
    'fill="none" stroke="'+esc(col)+'" stroke-width="'+t+'" stroke-linecap="round" '+
    'stroke-linejoin="round" opacity=".92"/>';
  const dim=(x1,y1,x2,y2)=>'<path d="M'+x1+' '+y1+' L'+x2+' '+y2+'" stroke="var(--txt-dim)" '+
    'stroke-width="1" stroke-dasharray="3 2"/>';
  return '<div class="dpfig"><svg viewBox="0 0 330 92" preserveAspectRatio="xMidYMid meet" '+
    'role="img" aria-label="Paire différentielle : largeur de piste et écart">'+
    L(yA-8)+L(yB-8)+
    dim(300,yA-8-t/2-4,300,yB-8+t/2+4)+
    '<text x="306" y="'+(yA-4)+'" fill="var(--yellow)" font-size="9" '+
      'font-family="var(--mono)">W</text>'+
    '<text x="306" y="'+(yB-2)+'" fill="var(--yellow)" font-size="9" '+
      'font-family="var(--mono)">G</text>'+
    '<text x="16" y="14" fill="var(--txt-dim)" font-size="9" '+
      'font-family="var(--mono)">P</text>'+
    '<text x="16" y="'+(yB+6)+'" fill="var(--txt-dim)" font-size="9" '+
      'font-family="var(--mono)">N</text>'+
    '</svg><div class="dpfignote">W '+fmt(w,3)+' mm · G '+fmt(gap,3)+' mm · pas '+
    fmt(w+gap,3)+' mm</div></div>';
}
/* Une ligne du tableau des couches. */
function dpLayerCells(r,i){
  const v=dpValues(r,i);
  return [fmt(v.minW,3),fmt(v.minGap,3),fmt(v.prefW,3),fmt(v.prefGap,3),
          fmt(v.maxW,3),fmt(v.maxGap,3)];
}
function buildDiffPairs(){
  const box=$("dpair");
  if(!box)return;
  const {r,draft}=dpPanelRule();
  const pair=dpSelected();
  const g=dpGeom(pair,S.active);
  const prof=dpProfile(r.imp), geo=dpStripGeom(S.active);
  const z=dpZdiff(g.w,g.gap,S.active);

  let h='<div class="cat">Règle de paire différentielle</div>'+
    '<div class="prop two">'+
      '<div><label>Nom</label><input id="dpName" value="'+esc(r.name)+'"></div>'+
      '<div><label>Commentaire</label><input id="dpCom" value="'+esc(r.comment)+'"></div>'+
    '</div>'+
    '<div class="prop two">'+
      '<div><label>Identifiant</label><input value="'+esc(r.uid||"— non inscrite —")+
        '" disabled title="Identifiant unique de la règle, attribué à sa création."></div>'+
      '<div><label>Règle</label><select id="dpRuleSel">'+
        (draft?'<option>'+esc(r.name)+' (usine)</option>'
              :S.dpRules.map((x,i)=>'<option value="'+i+'"'+(i===_dpRule?" selected":"")+
                 '>'+esc(x.name)+'</option>').join(""))+
      '</select></div>'+
    '</div>'+
    '<div class="prop"><div class="row" style="margin-top:0">'+
      '<button class="tb" id="dpRuleNew">Nouvelle règle</button>'+
      (draft||S.dpRules.length<2?"":'<button class="tb" id="dpRuleDel">Supprimer</button>')+
      '<button class="tb" id="dpRuleTest">Paires visées</button></div></div>'+
    '<div class="cat">Objets visés</div>'+
    '<div class="prop two">'+
      '<div><label>Critère</label><input value="Paire différentielle" disabled></div>'+
      '<div><label>Paire</label><select id="dpScope">'+
        '<option value=""'+(r.scope?"":" selected")+'>— toutes les paires —</option>'+
        S.dpPairs.map(q=>'<option'+(q.name===r.scope?" selected":"")+'>'+esc(q.name)+
          '</option>').join("")+
      '</select></div>'+
    '</div>'+
    dpFigure(g.w,g.gap)+
    '<div class="cat">Contraintes</div>'+
    '<div class="prop two">'+numProp("dpMinW","Largeur mini",fmt(r.minW,3),0.005,0.01)+
      numProp("dpMinG","Écart mini",fmt(r.minGap,3),0.005,0.01)+'</div>'+
    '<div class="prop two">'+numProp("dpPrefW","Largeur préférée",fmt(r.prefW,3),0.005,0.01)+
      numProp("dpPrefG","Écart préféré",fmt(r.prefGap,3),0.005,0.01)+'</div>'+
    '<div class="prop two">'+numProp("dpMaxW","Largeur maxi",fmt(r.maxW,3),0.005,0.01)+
      numProp("dpMaxG","Écart maxi",fmt(r.maxGap,3),0.005,0.01)+'</div>'+
    '<div class="prop"><label class="check"><input type="checkbox" id="dpAll"'+
      (r.allLayers?" checked":"")+'> Ces valeurs s\'appliquent à toutes les couches'+
      '</label></div>'+
    '<div class="prop two">'+
      numProp("dpUnc","Long. découplée maxi",fmt(r.maxUncoupled,2),0.5,0)+
      '<div><label>Pas de la paire</label><input value="'+fmt(g.w+g.gap,3)+
        ' mm" disabled></div></div>'+
    '<div class="prop"><label class="check"><input type="checkbox" id="dpImpOn"'+
      (r.useImp?" checked":"")+'> Profil d\'impédance</label></div>'+
    '<div class="prop two">'+
      '<div><label>Profil</label><select id="dpImp"'+(r.useImp?"":" disabled")+'>'+
        '<option value="">— aucun —</option>'+
        DP_PROFILES.map(p=>'<option value="'+p.id+'"'+(p.id===r.imp?" selected":"")+'>'+
          esc(p.n)+'</option>').join("")+
      '</select></div>'+
      '<div><label>Zdiff obtenue</label><input value="'+(z?fmt(z,1)+" Ω":"—")+
        '" disabled></div></div>';

  /* ---------- ce que l'empilage impose ---------- */
  h+='<div class="stkinfo">'+
     (geo.kind==="strip"
      ? "Triplaque sur "+cuId(S.active,S.cu)+" : plans de part et d'autre, "+
        fmt(geo.b,3)+" mm entre eux, Dk "+fmt(geo.er,2)+"."
      : "Microruban sur "+cuId(S.active,S.cu)+" : "+
        (geo.ref?fmt(geo.h,3)+" mm jusqu'au plan de référence, Dk "+fmt(geo.er,2)+"."
                :"aucun plan de référence dans l'empilage — la valeur ci-dessous ne "+
                 "vaut rien tant qu'une couche n'a pas le rôle « plan de masse »."))+
     (prof
      ? '<br>Visée <b>'+prof.z+' Ω</b>, obtenue <b class="'+
        (z&&Math.abs(z-prof.z)<=prof.z*0.1?"ok":"warn")+'">'+(z?fmt(z,1):"—")+' Ω</b>'+
        (z?' ('+(z>prof.z?"+":"")+fmt(z-prof.z,1)+' Ω).':'.')+
        '<br>Formules approchées IPC-2141 : ±10 % au mieux, le fabricant tranche.'
      : '<br>Sans profil, l\'impédance n\'est qu\'indicative : '+
        (z?fmt(z,1)+' Ω pour les cotes préférées.':'cotes hors domaine des formules.'))+
     '</div>';
  if(prof)
    h+='<div class="prop"><div class="row" style="margin-top:0">'+
       '<button class="tb" id="dpFitW">Ajuster la largeur</button>'+
       '<button class="tb" id="dpFitG">Ajuster l\'écart</button></div></div>';

  /* ---------- le tableau des couches ---------- */
  h+='<div class="stkwrap"><table class="stk imp"><thead><tr>'+
     '<th>Couche</th><th class="r">Lg mini</th><th class="r">Éc. mini</th>'+
     '<th class="r">Lg préf.</th><th class="r">Éc. préf.</th>'+
     '<th class="r">Lg maxi</th><th class="r">Éc. maxi</th></tr></thead><tbody>';
  for(let i=0;i<S.cu;i++){
    const c=dpLayerCells(r,i), on=(i===S.active);
    const over=!r.allLayers&&r.layers&&r.layers[i];
    h+='<tr class="'+roleCls(i)+(on?" on":"")+'" data-dpl="'+i+'" style="--sw:'+
       esc(layerColor(i))+'"><td class="nm">'+esc(cuId(i,S.cu))+
       (over?' <span class="pl">retouchée</span>':"")+'</td>'+
       c.map(v=>'<td class="r">'+v+'</td>').join("")+'</tr>';
  }
  h+='</tbody></table></div>'+
     '<div class="stkinfo">'+
     (r.allLayers
      ? "Les mêmes cotes partout. Décochez la case pour retoucher une couche : "+
        "un microruban extérieur et une triplaque intérieure ne tiennent pas la "+
        "même impédance avec la même largeur."
      : "Cliquez une couche pour y écrire ses propres cotes ; « Ces valeurs "+
        "s'appliquent à toutes les couches » les efface toutes d'un coup.")+
     '</div>';

  /* ---------- les paires de la carte ---------- */
  h+='<div class="cat">Paires de la carte</div>';
  if(!S.dpPairs.length)
    h+='<div class="empty">Aucune paire déclarée.</div>';
  else{
    h+='<div class="stkwrap"><table class="stk imp"><thead><tr>'+
       '<th>Paire</th><th>Net P</th><th>Net N</th><th class="r">Longueur</th>'+
       '<th class="r">Découplé</th></tr></thead><tbody>';
    S.dpPairs.forEach((q,i)=>{
      const cp=dpCoupling(q), rr=dpRuleFor(q);
      const bad=cp.len>0&&cp.uncoupled>rr.maxUncoupled+1e-3;
      h+='<tr'+(i===_dpSel?' class="on"':"")+' data-dpp="'+i+'" style="--sw:'+
         esc(netColor(q.p))+'"><td class="nm">'+esc(q.name)+'</td>'+
         '<td class="mat">'+esc(q.p)+'</td><td class="mat">'+esc(q.n)+'</td>'+
         '<td class="r">'+(cp.len?fmt(cp.len,1):"—")+'</td>'+
         '<td class="r"'+(bad?' style="color:var(--red)"':"")+'>'+
         (cp.len?fmt(cp.uncoupled,1):"—")+'</td></tr>';
    });
    h+='</tbody></table></div>';
  }
  /* ---------- déclarer une paire à la main ---------- */
  const netNames=netTable().map(n=>n.name);
  if(!dpNetFree(netNames,_dpNewP))_dpNewP="";
  if(!dpNetFree(netNames,_dpNewN))_dpNewN="";
  const canMake=!!_dpNewP&&!!_dpNewN&&_dpNewP!==_dpNewN;
  h+='<div class="prop two">'+
       '<div><label>Net P</label><select id="dpNetP">'+
         dpNetOpts(netNames,_dpNewP,_dpNewN)+'</select></div>'+
       '<div><label>Net N</label><select id="dpNetN">'+
         dpNetOpts(netNames,_dpNewN,_dpNewP)+'</select></div>'+
     '</div>'+
     '<div class="stkinfo">'+
     (netNames.length
      ? "Désignez les deux nets, P d'abord : c'est là qu'on choisit la polarité, "+
        "et le nom de la paire suit la base commune aux deux noms. Un net déjà "+
        "apparié est grisé.<br>« Détecter » les lit tous d'un coup : USB_DP/USB_DM, "+
        "CAN_P/CAN_N, D+/D−."
      : "Aucun net sur la carte : rien à apparier tant que la netlist est vide.")+
     '</div>'+
     '<div class="prop"><div class="row" style="margin-top:0">'+
       '<button class="tb" id="dpNew"'+(canMake?"":" disabled")+'>Créer la paire</button>'+
       '<button class="tb" id="dpAuto">Détecter</button></div>'+
     '<div class="row">'+
       '<button class="tb" id="dpGo">Router la paire <kbd>P</kbd></button>'+
       (S.dpPairs.length?'<button class="tb" id="dpDel">Supprimer</button>':"")+
     '</div></div>';
  box.innerHTML=h;

  /* ---------- câblage ---------- */
  /* Toute retouche d'une valeur passe par là : instantané, écriture de la
     règle d'usine si elle n'existait pas encore, puis reconstruction. */
  const edit=fn=>{
    const cur=dpPanelRule();
    if(cur.draft){const n=dpMaterialize(cur.r);fn(n);}
    else{push();fn(cur.r);}
    touch();buildDiffPairs();refreshPanels();draw();
  };
  const num=(id,key)=>{
    const el=$(id);
    if(!el)return;
    el.onchange=()=>edit(rr=>{
      const v=parseFloat(el.value);
      if(Number.isFinite(v)&&v>0)rr[key]=r3(v);
    });
  };
  num("dpMinW","minW");num("dpPrefW","prefW");num("dpMaxW","maxW");
  num("dpMinG","minGap");num("dpPrefG","prefGap");num("dpMaxG","maxGap");
  const unc=$("dpUnc");
  if(unc)unc.onchange=()=>edit(rr=>{
    const v=parseFloat(unc.value);
    if(Number.isFinite(v)&&v>=0)rr.maxUncoupled=r3(v);
  });
  const nm=$("dpName");
  if(nm)nm.onchange=()=>edit(rr=>{rr.name=dStr(nm.value,40).trim()||rr.name;});
  const cm=$("dpCom");
  if(cm)cm.onchange=()=>edit(rr=>{rr.comment=dStr(cm.value,120);});
  const sc=$("dpScope");
  if(sc)sc.onchange=()=>edit(rr=>{rr.scope=sc.value;});
  const all=$("dpAll");
  if(all)all.onchange=()=>edit(rr=>{
    rr.allLayers=all.checked;
    if(rr.allLayers)rr.layers={};
  });
  const io_=$("dpImpOn");
  if(io_)io_.onchange=()=>edit(rr=>{
    rr.useImp=io_.checked;
    if(rr.useImp&&!rr.imp)rr.imp=DP_PROFILES[0].id;
    if(!rr.useImp)rr.imp="";
  });
  const im=$("dpImp");
  if(im)im.onchange=()=>edit(rr=>{rr.imp=im.value;rr.useImp=!!im.value;});
  const rs=$("dpRuleSel");
  if(rs&&!draft)rs.onchange=()=>{_dpRule=+rs.value||0;buildDiffPairs();};
  const rn=$("dpRuleNew");
  if(rn)rn.onclick=()=>{
    const n=(prompt("Nom de la nouvelle règle :","PairesDiff_"+(S.dpRules.length+1))||"").trim();
    if(!n)return;
    push();
    S.dpRules.push(Object.assign({},r,{name:n,uid:dpUid(),layers:{},scope:""}));
    _dpRule=S.dpRules.length-1;
    touch();buildDiffPairs();refreshPanels();
  };
  const rd=$("dpRuleDel");
  if(rd)rd.onclick=()=>{
    push();S.dpRules.splice(_dpRule,1);_dpRule=0;
    touch();buildDiffPairs();refreshPanels();draw();
  };
  const rt=$("dpRuleTest");
  if(rt)rt.onclick=()=>{
    const hit=S.dpPairs.filter(q=>dpRuleFor(q)===r);
    hint(hit.length
      ? "Règle « "+r.name+" » : "+hit.length+" paire(s) visée(s) — "+
        hit.map(q=>q.name).join(", ")+"."
      : "Règle « "+r.name+" » : aucune paire ne la reçoit"+
        (S.dpPairs.length?" — une règle plus haut dans la liste passe devant.":"."));
  };
  const fw=$("dpFitW");
  if(fw)fw.onclick=()=>edit(rr=>{
    rr.prefW=dpSolveW(prof.z,g.gap,S.active);
    rr.minW=Math.min(rr.minW,rr.prefW);rr.maxW=Math.max(rr.maxW,rr.prefW);
  });
  const fg=$("dpFitG");
  if(fg)fg.onclick=()=>edit(rr=>{
    rr.prefGap=dpSolveGap(prof.z,g.w,S.active);
    rr.minGap=Math.min(rr.minGap,rr.prefGap);rr.maxGap=Math.max(rr.maxGap,rr.prefGap);
  });
  const np_=$("dpNetP");
  if(np_)np_.onchange=()=>{
    _dpNewP=np_.value;
    /* La liste N vide se remplit toute seule quand le nom du net P désigne son
       complémentaire. Elle reste modifiable : c'est une proposition. */
    if(_dpNewP&&!_dpNewN)_dpNewN=dpMateGuess(netNames,_dpNewP);
    buildDiffPairs();
  };
  const nn_=$("dpNetN");
  if(nn_)nn_.onchange=()=>{_dpNewN=nn_.value;buildDiffPairs();};
  const nw=$("dpNew");
  if(nw)nw.onclick=()=>{
    const a=_dpNewP, b=_dpNewN;
    if(!dpMakePair(a,b,true))return;
    _dpNewP="";_dpNewN="";
    buildDiffPairs();
  };
  const au=$("dpAuto");
  if(au)au.onclick=dpAutoAll;
  const go=$("dpGo");
  if(go)go.onclick=()=>setMode("dpair");
  const dl_=$("dpDel");
  if(dl_)dl_.onclick=()=>{
    const q=dpSelected();
    if(q&&confirm("Supprimer la paire "+q.name+" ? Le cuivre posé reste en place."))
      dpDelete(q);
  };
  box.querySelectorAll("tr[data-dpp]").forEach(tr=>{
    tr.onclick=()=>dpSelect(+tr.dataset.dpp);
  });
  box.querySelectorAll("tr[data-dpl]").forEach(tr=>{
    tr.onclick=()=>dpLayerEdit(+tr.dataset.dpl);
  });
}
/* Retoucher une couche : la règle cesse d'être uniforme et la couche reçoit ses
   propres cotes, préremplies avec celles qu'elle appliquait déjà. */
function dpLayerEdit(i){
  const {r,draft}=dpPanelRule();
  if(r.allLayers){
    setActive(i);
    hint("Décochez « Ces valeurs s'appliquent à toutes les couches » pour retoucher "+
         cuId(i,S.cu)+" à part.");
    return;
  }
  const v=dpValues(r,i);
  const w=prompt("Largeur préférée sur "+cuId(i,S.cu)+" (mm) :",fmt(v.prefW,3));
  if(w===null)return;
  const gp=prompt("Écart préféré sur "+cuId(i,S.cu)+" (mm) :",fmt(v.prefGap,3));
  if(gp===null)return;
  const W=parseFloat(String(w).replace(",",".")), G=parseFloat(String(gp).replace(",","."));
  if(!(W>0)||!(G>0)){alert("Deux cotes en millimètres, strictement positives.");return;}
  const rr=draft?dpMaterialize(r):(push(),r);
  rr.allLayers=false;
  rr.layers[i]=Object.assign({},rr.layers[i]||{},{prefW:r3(W),prefGap:r3(G)});
  touch();setActive(i);buildDiffPairs();refreshPanels();draw();
}

/* ==========================================================================
   Premier affichage
   Ce fichier se charge APRÈS 07-app.js, dont l'`init()` a déjà tout monté :
   c'est donc ici que le panneau se remplit une première fois. L'appeler depuis
   `init()` ne marcherait qu'en version un seul fichier, où tout est concaténé
   et les déclarations remontées ; en pages séparées, la fonction n'existe pas
   encore quand `init()` s'exécute. `refreshPanels()` prend le relais ensuite.
   ========================================================================== */
buildDiffPairs();
