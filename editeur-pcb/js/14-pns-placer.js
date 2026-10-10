"use strict";
/* =============================================================================
   Éditeur PCB — 14-pns-placer.js
   L'optimiseur : ce qui donne aux tracés leur allure finie.

   Le contournement et le shove trouvent un chemin ; ils ne le trouvent pas
   beau. Chaque tour d'enveloppe laisse derrière lui les sommets du polygone
   qu'il a longé, y compris ceux dont plus rien ne justifie l'existence une fois
   l'obstacle passé. C'est ce que `pns_optimizer.cpp` nettoie après chaque clic,
   et c'est la moitié de l'impression de propreté qu'on a en routant sous KiCad.

   Une seule passe, celle qui compte — `MERGE_SEGMENTS` : on prend une fenêtre
   glissante de sommets, on essaie de la remplacer par le coude direct que
   `routeCorner` poserait entre ses deux bouts, et on garde le remplacement s'il
   est **plus court**, **à 45°**, **sur la carte** et **sans faute
   d'isolation**. Répété de la fenêtre la plus large à la plus étroite, cela
   absorbe aussi bien un tour d'enveloppe devenu inutile qu'un zigzag posé à la
   main : le `MERGE_OBTUSE` de KiCad n'est que le cas d'une fenêtre de deux.

   `KEEP_TOPOLOGY` est là aussi, sous le nom d'**ancres** : un sommet posé sur
   une pastille, un via ou un embranchement ne se déplace pas. Raccourcir en
   décrochant une connexion ne serait pas une optimisation, ce serait une
   erreur — et le chevelu ne le dirait qu'après coup.

   Ce que cet optimiseur ne reprend PAS de KiCad : `SMART_PADS`, qui décale
   l'entrée d'une piste vers le bord d'une grosse pastille plutôt que vers son
   centre. Cet éditeur fait le choix inverse, explicitement : `magnet` accroche
   au **centre** de la pastille, et un essai du banc le vérifie. Les deux
   règles ne peuvent pas coexister ; celle d'ici est restée.
   ============================================================================= */

const PNS_OPT_WIN=8;           // largeur maximale de la fenêtre de fusion
const PNS_OPT_ROUNDS=4;        // passes avant de s'arrêter, en plus d'une par sommet
const PNS_OPT_QUEUE=16;        // sommets réexaminés après un clic, en plus de ceux qu'il a posés

/* ==========================================================================
   Les ancres
   ========================================================================== */
/* Les indices des sommets qu'on n'a pas le droit de bouger : les deux bouts,
   toujours, et tout sommet qui tient à quelque chose — pastille, via,
   embranchement. `hors` retire du décompte le cuivre de la ligne elle-même,
   qui n'est pas un embranchement mais sa propre continuité. */
function pnsAnchors(node,l,pts,hors){
  const a=new Set([0,pts.length-1]);
  for(let i=1;i+1<pts.length;i++){
    const j=node.jointAt(l,pts[i].x,pts[i].y);
    if(j.pads.length||j.vias.length){a.add(i);continue;}
    let n=0;
    for(const o of j.ends)if(!hors||!hors.has(o.it))n++;
    if(n>2)a.add(i);
  }
  return a;
}

/* ==========================================================================
   La fusion
   ========================================================================== */
/* Un remplacement candidat de la portion [i, i+n] par le coude direct. Rend la
   polyligne entière, ou `null` si le raccourci ne tient pas. */
function pnsMergeTry(node,line,pts,i,n,mode,skip){
  let best=null;
  for(const post of [false,true]){
    const legs=routeCorner(pts[i],pts[i+n],post,mode,0);
    if(!legs.length)continue;
    const cand=pnsSimplify(pts.slice(0,i+1)
                              .concat(legs.map(s=>({x:s.x2,y:s.y2})),
                                      pts.slice(i+n+1)));
    if(cand.length<2)continue;
    if(pnsLen(cand)>=pnsLen(pts)-1e-6)continue;       // rien à gagner
    if(!pnsIs45(cand,mode))continue;
    if(!pnsSurCarte(cand))continue;
    if(node.firstObstacle({l:line.l,net:line.net,w:line.w,nets:line.nets,pts:cand},skip))continue;
    if(!best||pnsLen(cand)<pnsLen(best))best=cand;
  }
  return best;
}
/* L'optimiseur. `depuis` borne le travail aux derniers sommets : après un clic,
   seul ce qu'on vient de poser a changé, et repasser sur toute la piste à
   chaque coude coûterait cher pour rien. C'est la file d'attente de KiCad,
   ramenée à un index. */
function pnsOptimize(node,line,skip,depuis){
  let pts=pnsSimplify(line.pts);
  if(pts.length<3)return pts;
  const mode=cornerMode();
  const i0=Math.max(0,depuis==null?0:depuis);
  /* Une fusion par passe : un tour d'enveloppe qui longe une rangée de
     pastilles laisse une dent par pastille, et quatre passes n'en
     retiraient que quatre. Une passe de plus par sommet suffit à tout voir. */
  const tours=PNS_OPT_ROUNDS+pts.length;
  for(let r=0;r<tours;r++){
    const anc=pnsAnchors(node,line.l,pts,line.hors);
    let gagne=null;
    for(let n=Math.min(pts.length-1,PNS_OPT_WIN);n>=2&&!gagne;n--)
      for(let i=i0;i+n<pts.length;i++){
        let libre=true;
        for(let k=i+1;k<i+n&&libre;k++)if(anc.has(k))libre=false;
        if(!libre)continue;
        const cand=pnsMergeTry(node,line,pts,i,n,mode,skip);
        if(cand){gagne=cand;break;}
      }
    if(!gagne)break;
    pts=gagne;                    // strictement plus court : la boucle termine
  }
  return pnsDejog(node,line,pts,skip,mode,i0);
}

/* ==========================================================================
   Les échardes
   --------------------------------------------------------------------------
   Un segment plus court que la piste, pris entre deux autres, est une écharde
   de gravure — le DRC la signale (`runDrc`, « Décrochement »). Le contournement
   en laisse en longeant deux enveloppes voisines qui ne débordent pas
   d'autant : la piste passe d'un palier à l'autre par une marche de quelques
   dixièmes. La fusion ci-dessus n'y peut rien, elle ne garde que ce qui
   raccourcit, et une marche ne se raccourcit pas : elle se déplace. On remplace
   donc la fenêtre qui l'entoure par le coude direct, quitte à rallonger d'au
   plus une largeur de piste, pourvu que la ligne compte moins d'échardes
   après — ce qui fait aussi terminer la boucle.
   ========================================================================== */
function pnsEchardes(pts,w){
  let n=0;
  for(let i=1;i+2<pts.length;i++)
    if(dist(pts[i].x,pts[i].y,pts[i+1].x,pts[i+1].y)<minJog(w)-1e-6)n++;
  return n;
}
function pnsDejog(node,line,pts,skip,mode,i0){
  let nb=pnsEchardes(pts,line.w);
  while(nb){
    const anc=pnsAnchors(node,line.l,pts,line.hors), L0=pnsLen(pts);
    let mieux=null,nbMieux=nb;
    for(let k=Math.max(1,i0);k+2<pts.length&&!mieux;k++){
      if(dist(pts[k].x,pts[k].y,pts[k+1].x,pts[k+1].y)>=minJog(line.w)-1e-6)continue;
      for(let i=Math.max(0,k-3);i<=k;i++)
        for(let j=k+1;j<pts.length&&j<=k+4;j++){
          let libre=true;
          for(let m=i+1;m<j&&libre;m++)if(anc.has(m))libre=false;
          if(!libre)continue;
          for(const post of [false,true]){
            const legs=routeCorner(pts[i],pts[j],post,mode,0);
            if(!legs.length)continue;
            const cand=pnsSimplify(pts.slice(0,i+1)
                                      .concat(legs.map(s=>({x:s.x2,y:s.y2})),pts.slice(j+1)));
            if(cand.length<2||pnsLen(cand)>L0+line.w)continue;
            const n=pnsEchardes(cand,line.w);
            if(n>=nbMieux)continue;
            if(!pnsIs45(cand,mode)||!pnsSurCarte(cand))continue;
            if(node.firstObstacle({l:line.l,net:line.net,w:line.w,nets:line.nets,pts:cand},skip))continue;
            mieux=cand;nbMieux=n;
          }
        }
    }
    if(!mieux)break;
    pts=mieux;nb=nbMieux;
  }
  return pts;
}

/* ==========================================================================
   La queue du tracé
   --------------------------------------------------------------------------
   Après chaque clic, la portion qu'on vient de figer repasse à l'optimiseur.
   On ne touche qu'à la fin du tracé, et seulement sur la couche courante : un
   via coupe la piste en deux morceaux qui ne se raccourcissent pas l'un
   l'autre. Les ancres protègent le reste.
   ========================================================================== */
function routeOptimizeTail(R,ajout){
  if(!S.avoid||!R||!R.net||R.done.length<2)return false;
  let i=R.done.length-1;
  while(i>0&&R.done[i-1].l===R.done[i].l)i--;
  const pts=pnsPts(R.done.slice(i));
  if(pts.length<3)return false;
  const N=pnsWorld();
  /* Un clic à la main pose un coude ; un contournement, lui, en pose
     parfois cinquante d'un coup. La file suit donc ce que le clic a posé
     (`ajout` segments), et pas seulement ses seize derniers sommets. */
  const depuis=Math.max(0,pts.length-1-PNS_OPT_QUEUE-(ajout||0));
  const opt=pnsOptimize(N,{l:R.layer,net:R.net,w:R.w,pts},null,depuis);
  // gagné : plus court, ou moins d'échardes (pnsDejog peut rallonger un peu)
  if(pnsLen(opt)>=pnsLen(pts)-1e-6&&pnsEchardes(opt,R.w)>=pnsEchardes(pts,R.w))return false;
  R.done.length=i;
  for(const s of pnsSegs(opt))R.done.push(Object.assign({l:R.layer,w:R.w},s));
  const f=opt[opt.length-1];
  R.pt={x:f.x,y:f.y};
  return true;
}
