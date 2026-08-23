"use strict";
/* =============================================================================
   Éditeur PCB — 10-pns-geom.js
   La géométrie du routeur : enveloppes convexes, polylignes, trame 45°.

   Ce fichier ouvre la série des `1x-pns-*`, qui remplacent le tracé « bute sur
   l'obstacle » par la méthode du routeur de KiCad (*Push and Shove*). Le
   principe tient en une phrase : on ne raisonne pas sur les distances, on
   raisonne sur des **enveloppes**.

   Une enveloppe (*hull*) est le polygone convexe qui entoure un obstacle,
   gonflé de l'isolation exigée **plus la demi-largeur** de la piste qui
   circule. Sa vertu : la piste devient une ligne sans épaisseur, et la question
   « cette piste respecte-t-elle l'isolation ? » se ramène à « cette ligne
   entre-t-elle dans ce polygone ? ». C'est ce changement de point de vue qui
   rend possible tout le reste — contourner, c'est longer le bord de
   l'enveloppe ; pousser, c'est demander à la ligne adverse de longer la nôtre.

   Une seule primitive suffit à toutes les enveloppes : l'octogone **aligné sur
   les huit sens du tracé** (`pnsOct`), construit par la fonction d'appui de la
   forme. Un rond, un oblong, un rectangle tourné, un segment : chacun n'a qu'à
   dire jusqu'où il va dans une direction donnée, le reste est commun.

   Rien ici ne connaît l'état de la carte : ce fichier ne parle que de points et
   de polygones. Le monde est dans `11-pns-node.js`.
   ============================================================================= */

/* ==========================================================================
   L'enveloppe
   --------------------------------------------------------------------------
   Une enveloppe qui épouserait la forme serait plus serrée, mais ses pans
   suivraient la rotation de la pastille : la contourner donnerait une piste à
   30° si la pastille est à 30° — un angle bâtard, que le tracé refuse.
   On prend donc l'octogone dont les huit pans sont **exactement** dans les huit
   sens du tracé. Sa construction : pour chacune des huit directions, la
   projection la plus lointaine de la forme gonflée — sa *fonction d'appui* —
   puis le croisement des huit demi-plans deux à deux. C'est le plus petit
   octogone de cette orientation qui contienne la forme : un peu plus gras
   qu'un contour épousé pour une pastille tournée, mais dont le bord se longe en
   45° sans avoir rien à redresser après coup — donc sans risque de retomber
   dans l'obstacle qu'on venait d'éviter.
   En règle « 90 », quatre directions suffisent, et l'octogone devient le
   rectangle englobant.
   ========================================================================== */
const PNS_D8=[[1,0],[1,1],[0,1],[-1,1],[-1,0],[-1,-1],[0,-1],[1,-1]]
  .map(d=>{const n=Math.hypot(d[0],d[1]);return {x:d[0]/n,y:d[1]/n};});
const PNS_D4=[{x:1,y:0},{x:0,y:1},{x:-1,y:0},{x:0,y:-1}];

/* Appui d'une pastille : le centre projeté, plus l'extension du rectangle sous
   sa propre rotation, plus l'arrondi qui la borde. Les trois formes se disent
   ainsi d'une seule écriture, et à l'identique de ce que mesure `padDist`. */
function pnsSupPad(q,dx,dy){
  const c=q.x*dx+q.y*dy;
  if(q.shape==="circ")return c+Math.max(q.w,q.h)/2;
  const r=q.shape==="oval"?Math.min(q.w,q.h)/2:0;
  const ca=Math.cos(q.rot||0), sa=Math.sin(q.rot||0);
  return c+Math.abs(dx*ca+dy*sa)*(q.w/2-r)+Math.abs(-dx*sa+dy*ca)*(q.h/2-r)+r;
}
function pnsSupVia(v,dx,dy){return v.x*dx+v.y*dy+v.d/2;}
function pnsSupSeg(t,dx,dy){
  return Math.max(t.x1*dx+t.y1*dy,t.x2*dx+t.y2*dy)+t.w/2;
}
/* Le croisement de deux demi-plans `p·d = h`. Deux directions consécutives sont
   à 45° l'une de l'autre : elles ne sont jamais parallèles. */
function pnsPlaneMeet(d1,h1,d2,h2){
  const den=d1.x*d2.y-d1.y*d2.x;
  if(Math.abs(den)<1e-12)return null;
  return {x:(h1*d2.y-h2*d1.y)/den, y:(d1.x*h2-d2.x*h1)/den};
}
/* L'octogone (ou le rectangle, en règle « 90 ») circonscrit à la forme gonflée
   de `infl`. `sup` est la fonction d'appui de la forme nue. Les pans
   redondants — le cas d'un rectangle droit, dont les diagonales ne coupent
   rien — se replient d'eux-mêmes sur un sommet unique. */
function pnsOct(sup,infl,mode){
  const D=(mode||cornerMode())==="90"?PNS_D4:PNS_D8;
  const h=D.map(d=>sup(d.x,d.y)+infl);
  const out=[];
  for(let i=0;i<D.length;i++){
    const j=(i+1)%D.length;
    const p=pnsPlaneMeet(D[i],h[i],D[j],h[j]);
    if(!p)continue;
    const q=out[out.length-1];
    if(q&&dist(p.x,p.y,q.x,q.y)<1e-9)continue;
    out.push(p);
  }
  while(out.length>1&&dist(out[0].x,out[0].y,out[out.length-1].x,out[out.length-1].y)<1e-9)
    out.pop();
  return out;
}

/* ==========================================================================
   Polygones
   ========================================================================== */
/* Le point est-il dans le polygone, bord compris ? `inPoly` tranche l'intérieur
   franc ; on lui ajoute le bord, car une ligne qui rase une enveloppe la longe
   — elle n'y entre pas, et le contournement doit pouvoir s'y poser. */
function pnsOnEdge(x,y,poly,eps){
  const e=eps==null?1e-7:eps;
  for(let i=0,j=poly.length-1;i<poly.length;j=i++)
    if(segDist(x,y,poly[j].x,poly[j].y,poly[i].x,poly[i].y)<=e)return true;
  return false;
}
function pnsInHull(x,y,poly){return inPoly(x,y,poly)&&!pnsOnEdge(x,y,poly);}

/* Les points où le segment [a,b] croise le bord du polygone, rendus dans
   l'ordre du parcours de a vers b. `i` retient l'arête franchie : le
   contournement en a besoin pour savoir où raccrocher son tour. */
function pnsSegPolyHits(ax,ay,bx,by,poly){
  const out=[], dx=bx-ax, dy=by-ay;
  for(let i=0,j=poly.length-1;i<poly.length;j=i++){
    const p=poly[j], q=poly[i];
    const ex=q.x-p.x, ey=q.y-p.y;
    const den=dx*ey-dy*ex;
    if(Math.abs(den)<1e-12)continue;            // parallèles : pas de franchissement net
    const t=((p.x-ax)*ey-(p.y-ay)*ex)/den;
    const u=((p.x-ax)*dy-(p.y-ay)*dx)/den;
    if(t<-1e-9||t>1+1e-9||u<-1e-9||u>1+1e-9)continue;
    out.push({t:clamp(t,0,1),edge:j,x:ax+dx*t,y:ay+dy*t});
  }
  out.sort((m,n)=>m.t-n.t);
  return out;
}

/* ==========================================================================
   Polylignes
   --------------------------------------------------------------------------
   Tout le moteur travaille en **suites de points**, jamais en segments : un
   contournement se raisonne sommet par sommet, et `S.tracks` ne reçoit des
   segments qu'au tout dernier moment. Les deux conversions sont ici.
   ========================================================================== */
function pnsSegs(pts){
  const out=[];
  for(let i=0;i+1<pts.length;i++)
    out.push({x1:pts[i].x,y1:pts[i].y,x2:pts[i+1].x,y2:pts[i+1].y});
  return out;
}
function pnsPts(segs){
  if(!segs.length)return [];
  const out=[{x:segs[0].x1,y:segs[0].y1}];
  for(const s of segs)out.push({x:s.x2,y:s.y2});
  return out;
}
function pnsLen(pts){
  let d=0;
  for(let i=0;i+1<pts.length;i++)d+=dist(pts[i].x,pts[i].y,pts[i+1].x,pts[i+1].y);
  return d;
}
/* Retire les points confondus et les sommets qui n'en sont pas — trois points
   alignés ne font qu'un segment. Sans cette passe, chaque tour d'enveloppe
   laisserait derrière lui des sommets fantômes qui finiraient dans le Gerber. */
function pnsSimplify(pts){
  const out=[];
  for(const p of pts){
    const q=out[out.length-1];
    if(q&&dist(p.x,p.y,q.x,q.y)<1e-7)continue;
    out.push({x:p.x,y:p.y});
  }
  for(let i=1;i+1<out.length;){
    const a=out[i-1], b=out[i], c=out[i+1];
    const cr=(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
    const dot=(b.x-a.x)*(c.x-b.x)+(b.y-a.y)*(c.y-b.y);
    if(Math.abs(cr)<1e-9&&dot>0)out.splice(i,1);      // aligné et dans le même sens
    else i++;
  }
  return out;
}
/* Défait les boucles qu'une polyligne se fait à elle-même. Contourner deux
   obstacles voisins par le même côté finit par ramener la piste sur son propre
   trajet : la boucle ne se voit pas à l'écran — le cuivre se recouvre — mais
   elle est là, dans le fichier comme dans la longueur du net. On coupe au
   premier croisement franc, et on recommence tant qu'il en reste. */
function pnsUnloop(pts){
  let p=pts;
  for(let pass=0;pass<16;pass++){
    let cut=null;
    for(let i=0;i+1<p.length&&!cut;i++)
      for(let j=i+2;j+1<p.length;j++){
        const a={x1:p[i].x,y1:p[i].y,x2:p[i+1].x,y2:p[i+1].y};
        const b={x1:p[j].x,y1:p[j].y,x2:p[j+1].x,y2:p[j+1].y};
        if(!segCross(a,b))continue;
        const h=pnsSegPolyHits(a.x1,a.y1,a.x2,a.y2,[p[j],p[j+1]]);
        if(!h.length)continue;
        cut={i,j,x:h[0].x,y:h[0].y};
        break;
      }
    if(!cut)return p;
    p=pnsSimplify(p.slice(0,cut.i+1).concat([{x:cut.x,y:cut.y}],p.slice(cut.j+1)));
  }
  return p;
}
/* Remplace la portion [i,j] de la polyligne par un autre chemin. C'est
   l'opération de base du contournement comme de l'optimiseur : on ne réécrit
   jamais une ligne entière, on lui greffe un morceau. */
function pnsSplice(pts,i,j,path){
  return pnsSimplify(pts.slice(0,i+1).concat(path,pts.slice(j)));
}
/* ==========================================================================
   La trame 45°
   --------------------------------------------------------------------------
   Le contournement raisonne en angle libre : le bord d'une enveloppe suit les
   pans de son octogone, qui eux ne sont pas dans les huit sens du tracé dès que
   la pastille est tournée. On redresse donc **après**, en remplaçant chaque
   tronçon bâtard par le coude à 45° que `route45` sait poser — la même
   primitive que le tracé à la main, celle que KiCad appelle
   `DIRECTION_45::BuildInitialTrace`.

   Redresser rallonge : le coude sort forcément du côté d'un des deux sens
   possibles, et l'un des deux peut retomber dans l'enveloppe qu'on venait de
   contourner. `pnsSnap45` rend donc les **deux** postures, à charge de
   l'appelant — qui, lui, a le monde sous la main — de garder celle qui passe.
   ========================================================================== */
/* La règle en vigueur décide de ce qui est droit : en 90° un pan à 45° est
   bâtard tout autant qu'un angle bâtard l'est en 45°, et en angle libre rien ne
   l'est. On passe donc par `routeCorner`, la même porte que le tracé à la main. */
function pnsDirOk(a,b,mode){
  const dx=b.x-a.x, dy=b.y-a.y;
  if(Math.abs(dx)<1e-7&&Math.abs(dy)<1e-7)return true;
  const m=mode||cornerMode();
  if(m==="free")return true;
  if(m==="90")return Math.abs(dx)<1e-7||Math.abs(dy)<1e-7;
  return angleOk(dx,dy);
}
function pnsIs45(pts,mode){
  for(let i=0;i+1<pts.length;i++)if(!pnsDirOk(pts[i],pts[i+1],mode))return false;
  return true;
}
/* Une posture donnée, appliquée à toute la polyligne. Les tronçons déjà droits
   passent tels quels : on ne réécrit que ce qui est de travers. */
function pnsSnap45One(pts,flip,mode){
  const out=[pts[0]];
  for(let i=0;i+1<pts.length;i++){
    const a=out[out.length-1], b=pts[i+1];
    if(pnsDirOk(a,b,mode)){out.push(b);continue;}
    for(const s of routeCorner(a,b,flip,mode,0))out.push({x:s.x2,y:s.y2});
  }
  return pnsSimplify(out);
}
function pnsSnap45(pts,mode){
  if(pts.length<2)return [pts.slice()];
  const m=mode||cornerMode();
  if(pnsIs45(pts,m))return [pnsSimplify(pts)];
  return [pnsSnap45One(pts,false,m),pnsSnap45One(pts,true,m)];
}
