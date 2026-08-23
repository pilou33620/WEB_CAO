"use strict";
/* =============================================================================
   Éditeur PCB — 12-pns-walk.js
   Le contournement : la piste longe l'obstacle au lieu de buter dessus.

   L'idée tient en trois gestes, et c'est celle de `pns_walkaround.cpp` :

     1. trouver le **premier** obstacle sur la route — pas le plus proche du
        curseur, le premier rencontré en marchant depuis le départ ;
     2. couper la ligne là où elle entre dans son enveloppe et là où elle en
        sort, et remplacer le morceau du milieu par un tour du bord ;
     3. recommencer, car le détour peut à son tour rencontrer autre chose.

   Deux tours sont possibles, l'un par la gauche, l'autre par la droite. On les
   mène tous les deux jusqu'au bout et on garde le plus court qui aboutisse —
   c'est ce qui donne l'impression que la piste « choisit » le bon côté.

   Ce que ce fichier ne fait pas : déplacer quoi que ce soit. Le contournement
   se faufile, il ne pousse pas. Pousser, c'est `13-pns-shove.js`, et le shove
   se sert du contournement à chaque fois qu'il demande à une ligne adverse de
   s'écarter — d'où l'ordre des deux fichiers.

   Le tour est **nativement à 45°** : les enveloppes que l'on longe ici sont
   celles de `pnsOct`, dont les pans sont dans les huit sens du tracé. Rien à
   redresser après coup, donc rien qui puisse retomber dans l'obstacle qu'on
   venait d'éviter. Le redressement de secours n'est là que pour la règle
   « libre », où une ligne d'entrée peut arriver de biais.
   ============================================================================= */

const PNS_WALK_MAX=24;         // tours d'enveloppe avant d'abandonner
const PNS_WALK_GROWTH=6;       // un détour six fois plus long que la ligne : on renonce

/* ==========================================================================
   Un tour de bord
   ========================================================================== */
/* Le chemin qui va de A à B en longeant le polygone, dans le sens `dir`. A est
   sur l'arête `ea`, B sur l'arête `eb` ; une arête `e` joint `H[e]` à
   `H[e+1]`. En marche avant on passe par les sommets qui suivent, en marche
   arrière par ceux qui précèdent. */
function pnsHullWalk(H,ea,A,eb,B,dir){
  const n=H.length, out=[{x:A.x,y:A.y}];
  let e=ea;
  for(let g=0;g<=n&&e!==eb;g++){
    if(dir>0){e=(e+1)%n;out.push({x:H[e].x,y:H[e].y});}
    else{out.push({x:H[e].x,y:H[e].y});e=(e-1+n)%n;}
  }
  out.push({x:B.x,y:B.y});
  return out;
}
/* Où la ligne entre dans l'enveloppe et où elle en ressort. On retient le
   PREMIER franchissement et le DERNIER : tout ce qui se passe entre les deux
   est à jeter, quel qu'en soit le détail.
   Un bout de ligne posé à l'intérieur de l'enveloppe n'a pas de tour possible —
   on ne contourne pas depuis le dedans. C'est le cas d'une arrivée visée en
   plein sur une pastille étrangère : le geste doit être refusé, pas rattrapé. */
function pnsWalkCross(pts,H){
  if(pnsInHull(pts[0].x,pts[0].y,H))return null;
  if(pnsInHull(pts[pts.length-1].x,pts[pts.length-1].y,H))return null;
  let A=null,B=null;
  for(let i=0;i+1<pts.length;i++)
    for(const h of pnsSegPolyHits(pts[i].x,pts[i].y,pts[i+1].x,pts[i+1].y,H)){
      const c={i,edge:h.edge,x:h.x,y:h.y};
      if(!A)A=c;
      B=c;
    }
  if(!A||A===B)return null;                 // effleurée en un point : rien à contourner
  return {A,B};
}

/* Le contour de carte borne le détour. Sans cette borne, une piste barrée par
   une génératrice qui traverse toute la carte se voit proposer le tour par
   l'extérieur : géométriquement valide, matériellement absurde — il n'y a pas
   de cuivre là-bas. On ne juge que les tours qui NAISSENT dedans : une carte
   dont le cuivre déborde déjà doit rester routable. */
function pnsSurCarte(pts){
  const P=boardPoly();
  if(!P||P.length<3)return true;
  /* Le bord compte comme dedans. `inPoly` tranche l'intérieur strict : une
     piste posée pile sur le contour — cela arrive, et c'est légitime — s'y
     déclare dehors, et le moteur refusait alors de la toucher. */
  for(const p of pts)
    if(!inPoly(p.x,p.y,P)&&polyEdgeDist(p.x,p.y,P)>1e-6)return false;
  return true;
}

/* ==========================================================================
   Le tour complet, d'un côté
   ========================================================================== */
/* `side` vaut +1 ou −1 : le sens dans lequel on longe chaque enveloppe. On
   garde le même d'un obstacle à l'autre — c'est ce qui donne un contour
   cohérent plutôt qu'un zigzag entre les deux côtés. */
function pnsWalkSide(node,line,skip,side,max,only){
  let pts=pnsSimplify(line.pts);
  const l0=pnsLen(pts);
  const dedans=pnsSurCarte(pts);          // la route directe tenait-elle sur la carte ?
  const vus=new Set();
  for(let k=0;k<(max||PNS_WALK_MAX);k++){
    const ob=node.firstObstacle({l:line.l,net:line.net,w:line.w,nets:line.nets,pts},skip,only);
    if(!ob)return {pts,ok:true,tours:k};
    /* Retomber deux fois sur le même obstacle après l'avoir contourné veut dire
       que le tour ne sert à rien de ce côté-là : l'autre côté, peut-être. */
    if(vus.has(ob.it))return {pts,ok:false,bloque:ob.it};
    vus.add(ob.it);
    const H=pnsHullOct(ob.it,line.net,line.w);
    const c=pnsWalkCross(pts,H);
    if(!c)return {pts,ok:false,bloque:ob.it};
    const suite=pnsUnloop(pnsSplice(pts,c.A.i,c.B.i+1,
                                    pnsHullWalk(H,c.A.edge,c.A,c.B.edge,c.B,side)));
    if(pnsLen(suite)>l0*PNS_WALK_GROWTH+10)return {pts,ok:false,bloque:ob.it};
    if(dedans&&!pnsSurCarte(suite))return {pts,ok:false,bloque:ob.it};
    pts=suite;
  }
  return {pts,ok:false};
}
/* Les deux côtés, et le plus court qui passe. Rien ne garantit qu'un côté
   aboutisse : entre deux pastilles trop serrées, aucun des deux ne passe, et
   c'est l'appelant qui décide de ce qu'il en fait — buter, ou pousser. */
function pnsWalkaround(node,line,skip,max,only){
  if(!line.pts||line.pts.length<2)return {ok:false,pts:line.pts||[]};
  if(!node.firstObstacle(line,skip,only))
    return {ok:true,pts:pnsSimplify(line.pts),direct:true};
  const G=pnsWalkSide(node,line,skip,1,max,only);
  const D=pnsWalkSide(node,line,skip,-1,max,only);
  let r=null;
  if(G.ok&&D.ok)r=pnsLen(G.pts)<=pnsLen(D.pts)?G:D;
  else if(G.ok)r=G;
  else if(D.ok)r=D;
  if(!r)return {ok:false,pts:pnsSimplify(line.pts),bloque:(G.bloque||D.bloque)||null};
  /* Filet de sécurité : en règle « libre » une ligne peut arriver de biais et
     ressortir de biais. Les enveloppes, elles, restent octogonales — le tour
     est droit, mais les raccords ne le sont pas forcément. */
  if(pnsIs45(r.pts))return {ok:true,pts:r.pts,tours:r.tours};
  for(const cand of pnsSnap45(r.pts))
    if(!node.firstObstacle({l:line.l,net:line.net,w:line.w,nets:line.nets,pts:cand},skip,only))
      return {ok:true,pts:cand,tours:r.tours};
  return {ok:false,pts:r.pts};
}
