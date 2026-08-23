"use strict";
/* =============================================================================
   Éditeur PCB — 13-pns-shove.js
   Le shove : la piste qu'on tire pousse celles qui la gênent.

   C'est le cœur de la méthode, et ce que l'éditeur n'avait jamais su faire.
   Jusqu'ici, face à un obstacle, le cuivre butait ; depuis `12-pns-walk.js`, il
   le contourne. Ici, il lui demande de s'écarter.

   La mécanique, celle de `pns_shove.cpp` :

     · une **branche** du monde (`11-pns-node.js`) reçoit tout ce que l'essai
       déplace. Si l'essai échoue, on jette la branche et rien n'a bougé. C'est
       cette pièce qui rend le shove possible : sans elle, il faudrait déplacer
       pour de bon, puis tout remettre ;
     · une **pile de lignes**. On y met la tête — la piste en cours, qui ne se
       pousse pas. On dépile, on cherche le premier obstacle de la ligne du
       dessus, on l'écarte, et **on empile la ligne qu'on vient d'écarter** :
       elle a maintenant ses propres voisins à convaincre. La poussée se
       propage ainsi de piste en piste, aussi loin qu'il faut ;
     · **écarter, c'est contourner**. Pousser une ligne hors du chemin de la
       tête, c'est lui faire longer l'enveloppe de la tête — le même geste que
       `12-pns-walk.js`, appliqué à l'autre. Ses deux bouts, eux, ne bougent
       pas : ils sont tenus par une pastille, un via ou un embranchement. Une
       ligne entièrement prise dans l'enveloppe n'a ni entrée ni sortie — deux
       pistes qui se longent — et n'a donc pas de tour : celle-là se translate
       en bloc, à la condition que ses deux bouts soient libres ;
     · trois issues, dans cet ordre : **poussé**, sinon **contourné**, sinon
       **collision signalée**. Le dernier cas est l'ancien comportement de
       l'éditeur, devenu dernier recours au lieu de règle.

   Ce qui ne se pousse pas : une pastille (elle appartient à un boîtier placé,
   ce n'est pas au routeur de déménager un composant). La tête la contourne.

   Ce qui se pousse mais coûte cher : un via. Le déplacer emmène les bouts de
   toutes les pistes qui s'y rejoignent, lesquelles repartent aussitôt sur la
   pile. C'est `pushOrShoveVia`, et c'est la partie la plus fragile du PNS de
   KiCad comme d'ici — d'où les garde-fous, et le repli propre en cas d'échec.
   ============================================================================= */

const PNS_SHOVE_MAX=64;        // poussées d'un même geste : au-delà, on renonce
const PNS_SHOVE_RANG=8;        // profondeur de propagation
const PNS_SHOVE_REPRISE=3;     // fois qu'une même ligne accepte d'être repoussée
const PNS_SHOVE_MS=25;         // budget de temps : le geste doit rester fluide

/* ==========================================================================
   Écarter une ligne
   ========================================================================== */
/* Un tour d'enveloppe, sans rien chercher : l'enveloppe est donnée. C'est
   l'opération élémentaire du shove — `pnsWalkSide` la répète en découvrant ses
   obstacles, ici on sait déjà de quoi il faut s'écarter. Les deux bouts de la
   ligne sont conservés par construction : `pnsWalkCross` refuse de travailler
   si l'un d'eux est dans l'enveloppe, et `pnsSplice` ne touche jamais aux
   extrémités. */
function pnsPushOut(pts,H,side){
  const c=pnsWalkCross(pts,H);
  if(!c)return null;
  return pnsUnloop(pnsSplice(pts,c.A.i,c.B.i+1,
                             pnsHullWalk(H,c.A.edge,c.A,c.B.edge,c.B,side)));
}
/* Les segments d'une ligne, vus comme des objets du monde : c'est sous cette
   forme qu'on mesure une isolation et qu'on bâtit une enveloppe. */
function pnsLineItems(L){
  return pnsSegs(L.pts).map(s=>{
    const it=pnsItemSeg(L.l,L.net,L.w,s.x1,s.y1,s.x2,s.y2,null);
    if(L.nets)it.nets=L.nets;
    return it;
  });
}
/* La ligne translatée en bloc, hors de l'enveloppe, par le plus court des huit
   sens du tracé. Elle sort du côté où le déplacement est le moindre : celui
   dont le plan d'appui de l'enveloppe est le plus près.
   Ce cas-là, le tour d'enveloppe ne sait rien en faire — il lui faut un point
   d'entrée et un point de sortie, et une ligne entièrement DANS l'enveloppe
   n'en a aucun. C'est pourtant la poussée la plus courante : deux pistes qui se
   longent. La translation garde évidemment les angles, puisqu'elle ne change
   aucune direction. */
function pnsSlideOut(pts,H){
  let best=null;
  for(const d of PNS_D8){
    let hh=-1e18, mn=1e18;
    for(const q of H)hh=Math.max(hh,q.x*d.x+q.y*d.y);
    for(const p of pts)mn=Math.min(mn,p.x*d.x+p.y*d.y);
    const t=hh-mn+PNS_MARGIN;
    if(t<=0)return pts.slice();                 // déjà dehors de ce côté-là
    if(!best||t<best.t)best={t,d};
  }
  if(!best)return null;
  return pts.map(p=>({x:r3(p.x+best.d.x*best.t),y:r3(p.y+best.d.y*best.t)}));
}
/* Les deux bouts d'une ligne sont-ils libres ? Un bout tenu par une pastille,
   un via ou un embranchement ne se translate pas : le déplacer romprait la
   connexion. */
function pnsBoutsLibres(B,l,pts){
  for(const p of [pts[0],pts[pts.length-1]]){
    const j=B.jointAt(l,p.x,p.y);
    if(j.pads.length||j.vias.length||j.ends.length>1)return false;
  }
  return true;
}
/* Écarter `line` de tout ce que `gene` occupe. Le critère d'arrêt est
   l'isolation elle-même, et non le franchissement d'une enveloppe : une ligne
   qui vient d'être poussée longe le bord de l'enveloppe qu'elle fuyait, et
   « longer » se lit comme « franchir » pour peu qu'on regarde les sommets. On
   tournerait alors sans fin autour du même obstacle, déjà écarté. C'est
   `pnsGap` qui tranche, au seuil du DRC.
   Deux façons de s'écarter, dans cet ordre : le **tour** de l'enveloppe, qui
   laisse les bouts en place — c'est le cas d'une piste ancrée à ses deux
   extrémités, la plus fréquente ; et, quand la ligne est trop prise dedans pour
   qu'un tour existe, la **translation** en bloc, réservée aux lignes dont les
   deux bouts sont libres.
   Le tour s'essaie dans les deux sens ; on garde le plus court qui aboutisse,
   reste à 45°, et ne sort pas de la carte. */
function pnsShoveAside(B,line,gene){
  const genes=pnsLineItems(gene);
  const conflit=pts=>{
    for(const g of genes)
      for(const s of pnsSegs(pts))
        if(pnsGap(g,s,line.w)<pnsClr(g,line.net)-PNS_EPS)return g;
    return null;
  };
  const libre=pnsBoutsLibres(B,line.l,line.pts);
  const cand=[];
  for(const side of [1,-1]){
    let pts=pnsSimplify(line.pts), bon=true;
    for(let k=0;k<=PNS_WALK_MAX;k++){
      const g=conflit(pts);
      if(!g)break;
      if(k===PNS_WALK_MAX){bon=false;break;}   // on tourne en rond
      const H=pnsHullOct(g,line.net,line.w);
      const suite=pnsPushOut(pts,H,side)||(libre?pnsSlideOut(pts,H):null);
      if(!suite||!pnsIs45(suite)||!pnsSurCarte(suite)){bon=false;break;}
      pts=suite;
    }
    if(bon&&pts.length>1)cand.push(pts);
  }
  if(!cand.length)return null;
  cand.sort((a,b)=>pnsLen(a)-pnsLen(b));
  return cand[0];
}

/* ==========================================================================
   La pile
   ========================================================================== */
/* Remplace dans la branche les segments d'une ligne par sa nouvelle géométrie.
   On garde trace des pistes de `S` concernées : c'est ce que le dépôt devra
   réécrire. */
function pnsRelink(B,ligne,pts){
  for(const it of ligne.items)B.remove(it);
  const neufs=[];
  for(const s of pnsSegs(pts))
    neufs.push(B.add(pnsItemSeg(ligne.l,ligne.net,ligne.w,s.x1,s.y1,s.x2,s.y2,null)));
  return neufs;
}
/* Où le via doit aller pour se dégager, en fuyant **perpendiculairement** à la
   ligne qui pousse. Un via n'a pas de forme à longer, seulement un centre à
   déplacer : la normale est le plus court chemin dehors, et c'est la seule
   direction qui ne dégénère pas quand le centre tombe pile sur l'axe de la
   ligne — le cas le plus courant, un via qu'on vise en plein.
   `sens` choisit le côté ; l'appelant essaie les deux. */
function pnsViaEscape(it,gene,sens){
  let p={x:it.v.x,y:it.v.y};
  for(let k=0;k<8;k++){
    let pire=null;
    for(const s of pnsSegs(gene.pts)){
      const g=pnsItemSeg(gene.l,gene.net,gene.w,s.x1,s.y1,s.x2,s.y2,null);
      const need=pnsClr(g,it.net)+it.v.d/2+g.w/2+PNS_MARGIN;
      const def=need-segDist(p.x,p.y,s.x1,s.y1,s.x2,s.y2);
      if(def>1e-6&&(!pire||def>pire.def)){
        const dx=s.x2-s.x1, dy=s.y2-s.y1, ln=Math.hypot(dx,dy)||1;
        pire={def,nx:-dy/ln*sens,ny:dx/ln*sens};
      }
    }
    if(!pire)return p;
    p={x:r3(p.x+pire.nx*(pire.def+PNS_MARGIN)),y:r3(p.y+pire.ny*(pire.def+PNS_MARGIN))};
  }
  return null;
}
/* Tout ce qui se rejoint sur le via, avec la géométrie que cela donnerait si le
   via allait en `p`. Un bout de ligne suit son via ; le tronçon devenu bâtard
   se redresse par un coude, faute de quoi le via traînerait un angle qu'aucun
   fabricant n'accepte. Rend `null` si l'une des lignes ne s'y prête pas. */
function pnsViaSuites(B,it,p){
  const suites=[];
  for(let l=it.l0;l<=it.l1;l++){
    const j=B.jointAt(l,it.v.x,it.v.y);
    if(j.pads.length)return null;                     // ancré sur une pastille
    /* Un via qui tient plus de quatre départs n'est plus un via de routage,
       c'est un nœud d'alimentation : on ne le déménage pas. */
    if(j.ends.length>4)return null;
    for(const o of j.ends){
      const L=B.assemble(o.it);
      if(L.pts.length<2)return null;
      const pts=L.pts.slice();
      const iBout=dist(pts[0].x,pts[0].y,it.v.x,it.v.y)<5e-4?0:pts.length-1;
      if(dist(pts[iBout].x,pts[iBout].y,it.v.x,it.v.y)>5e-4)return null;
      pts[iBout]={x:p.x,y:p.y};
      let neuf=null;
      for(const c of pnsSnap45(pts))if(pnsIs45(c)){neuf=c;break;}
      if(!neuf)return null;
      suites.push({ligne:L,pts:pnsSimplify(neuf)});
    }
  }
  return suites;
}
/* Le via poussé, et tout ce qui s'y raccroche emmené avec lui. Les lignes
   déplacées repartent sur la pile : leur nouveau tracé peut à son tour gêner
   quelqu'un. */
function pnsShoveVia(B,via,gene,pile,rang,lignes){
  const it=via.item;
  let choix=null;
  for(const sens of [1,-1]){
    const p=pnsViaEscape(it,gene,sens);
    if(!p)continue;
    if(dist(p.x,p.y,it.v.x,it.v.y)<1e-9)continue;
    if(!inBoard(p.x,p.y,S.rule.edge))continue;
    const suites=pnsViaSuites(B,it,p);
    if(!suites)continue;
    const cout=dist(p.x,p.y,it.v.x,it.v.y)+
               suites.reduce((a,s)=>a+pnsLen(s.pts),0);
    if(!choix||cout<choix.cout)choix={p,suites,cout};
  }
  if(!choix)return false;
  const neuf=Object.assign({},it.v);
  neuf.x=choix.p.x;neuf.y=choix.p.y;
  const nit=pnsItemVia(neuf);
  /* `src` garde le via de `S` d'un bout à l'autre, même poussé deux fois : sans
     cela, la seconde poussée déplacerait la copie et non l'original. */
  nit.src=it.src||it.v;
  B.remove(it);
  B.add(nit);
  via.deplace={orig:nit.src,x:choix.p.x,y:choix.p.y};
  for(const s of choix.suites){
    const orig=s.ligne.items.map(o=>o.src).filter(Boolean);
    const neufs=pnsRelink(B,s.ligne,s.pts);
    const rec={l:s.ligne.l,net:s.ligne.net,w:s.ligne.w,pts:s.pts,orig};
    if(lignes)lignes.push(rec);
    pile.push({items:neufs,pts:s.pts,l:s.ligne.l,net:s.ligne.net,w:s.ligne.w,
               rang:rang+1,reprises:0});
  }
  return true;
}

/* ==========================================================================
   Le shove complet
   --------------------------------------------------------------------------
   Rend `{ok, node, pts, lignes, vias}` : la branche à verser, le trajet retenu
   pour la tête, et la liste de ce qui a bougé. Sur un échec, rien n'est à
   défaire — la branche part à la poubelle.
   ========================================================================== */
function pnsShove(node,head,skip,t0){
  const B=node.branch();
  const sauf=new Set(skip||[]);

  /* Passe 1 — les pastilles. Elles ne se poussent pas : c'est à la tête de les
     contourner, avant même de demander à quiconque de s'écarter. */
  let pts=pnsSimplify(head.pts);
  const ligne0={l:head.l,net:head.net,w:head.w,nets:head.nets,pts};
  if(B.firstObstacle(ligne0,sauf,"P")){
    const t=pnsWalkaround(B,ligne0,sauf,null,"P");
    if(!t.ok)return {ok:false,cause:"pastille"};
    pts=t.pts;
  }
  /* Passe 2 — la poussée proprement dite, sur la tête telle qu'elle sortira. */
  const r=pnsShoveHeads(B,[{l:head.l,net:head.net,w:head.w,nets:head.nets,pts}],skip,t0);
  if(r.ok)r.pts=pts;
  return r;
}
/* ==========================================================================
   La poussée à partir de têtes déjà tracées
   --------------------------------------------------------------------------
   Plusieurs têtes, et aucune ne bougera : c'est tout le reste qui s'écarte.
   Cette forme-là est celle dont la **paire différentielle** a besoin — ses deux
   pistes et leurs éventails sont une géométrie d'un seul bloc, qu'on ne peut
   pas résumer à une ligne unique près des pastilles, où la paire s'ouvre bien
   au-delà de son pas. On les présente donc telles quelles.
   `node` peut être une branche : `pnsShove` s'en sert après avoir contourné
   les pastilles.
   ========================================================================== */
function pnsShoveHeads(node,heads,skip,t0){
  const debut=t0==null?null:t0;
  const B=node.branch();
  const sauf=new Set(skip||[]);
  const pile=[], teteItems=[];
  for(const h of heads){
    if(!h.pts||h.pts.length<2)continue;
    const items=[];
    for(const s of pnsSegs(h.pts)){
      const it=pnsItemSeg(h.l,h.net,h.w,s.x1,s.y1,s.x2,s.y2,null);
      if(h.nets)it.nets=h.nets;
      items.push(B.add(it));
      teteItems.push(it);
    }
    pile.push({items,pts:h.pts,l:h.l,net:h.net,w:h.w,nets:h.nets,
               fixe:true,rang:0,reprises:0});
  }
  if(!pile.length)return {ok:true,node:B,lignes:[],vias:[],tete:[]};
  const tetes=new Set(teteItems);
  const lignes=[];                 // ce qui a bougé, prêt pour le dépôt
  const vias=[];
  const compte=new Map();          // items d'origine → nombre de reprises

  for(let tour=0;tour<PNS_SHOVE_MAX;tour++){
    if(debut!=null&&Date.now()-debut>PNS_SHOVE_MS)return {ok:false,cause:"temps"};
    const cur=pile[pile.length-1];
    if(!cur)return {ok:true,node:B,lignes,vias,tete:teteItems};
    /* Une tête ne pousse pas une autre tête : elles forment ensemble la
       géométrie qu'on essaie de poser, et se tiennent déjà à leur écart. Le
       cuivre poussé, lui, les voit toutes — sans quoi il reviendrait dedans. */
    const moi=new Set([...sauf,...cur.items]);
    if(cur.fixe)for(const it of tetes)moi.add(it);
    const ob=B.firstObstacle({l:cur.l,net:cur.net,w:cur.w,nets:cur.nets,pts:cur.pts},moi);
    if(!ob){pile.pop();continue;}
    if(ob.it.k==="P")return {ok:false,cause:"pastille"};
    if(cur.rang>=PNS_SHOVE_RANG)return {ok:false,cause:"profondeur"};

    if(ob.it.k==="V"){
      const via={item:ob.it};
      if(!pnsShoveVia(B,via,cur,pile,cur.rang,lignes))return {ok:false,cause:"via"};
      vias.push(via.deplace);
      continue;
    }
    /* Un segment : on assemble sa ligne entière — pousser un segment seul le
       détacherait de ses voisins — et on l'écarte de la ligne courante. */
    const L=B.assemble(ob.it);
    if(L.pts.length<2)return {ok:false,cause:"assemblage"};
    const vu=(compte.get(ob.it)||0)+1;
    if(vu>PNS_SHOVE_REPRISE)return {ok:false,cause:"reprises"};
    for(const o of L.items)compte.set(o,vu);
    const neufPts=pnsShoveAside(B,L,cur);
    if(!neufPts)return {ok:false,cause:"coincé"};
    const orig=L.items.map(o=>o.src).filter(Boolean);
    const neufs=pnsRelink(B,L,neufPts);
    lignes.push({l:L.l,net:L.net,w:L.w,pts:neufPts,orig});
    pile.push({items:neufs,pts:neufPts,l:L.l,net:L.net,w:L.w,
               rang:cur.rang+1,reprises:vu});
  }
  return {ok:false,cause:"itérations"};
}

/* ==========================================================================
   Le dépôt
   --------------------------------------------------------------------------
   Le shove a raisonné en polylignes ; `S.tracks` range des segments. On rend
   ici ce qu'on avait emprunté : les pistes d'origine s'en vont, les nouvelles
   arrivent, et la largeur comme le net les suivent. Les segments colinéaires se
   fondent au passage — c'est `sameLine`, la même passe que le dépôt d'un tracé.
   ========================================================================== */
function pnsApply(r){
  if(!r||!r.ok)return false;
  let touche=false;
  for(const v of (r.vias||[])){
    if(!v)continue;
    v.orig.x=v.x;v.orig.y=v.y;touche=true;
  }
  for(const L of (r.lignes||[])){
    for(const t of L.orig){
      const i=S.tracks.indexOf(t);
      if(i>=0)S.tracks.splice(i,1);
    }
    let prev=null;
    for(const s of pnsSegs(L.pts)){
      const t={l:L.l,net:L.net,w:L.w,x1:r3(s.x1),y1:r3(s.y1),x2:r3(s.x2),y2:r3(s.y2)};
      if(t.x1===t.x2&&t.y1===t.y2)continue;
      if(prev&&sameLine(prev,t)){prev.x2=t.x2;prev.y2=t.y2;continue;}
      S.tracks.push(t);prev=t;
    }
    touche=true;
  }
  if(touche)touch();
  return touche;
}
