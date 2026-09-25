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
  const genes=gene.hitems||pnsLineItems(gene);
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
      const H=g.grp?pnsHullGroup(g.grp,line.net,line.w):pnsHullOct(g,line.net,line.w);
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

/* L'enveloppe d'un GROUPE d'objets — les pastilles d'un boîtier qu'on
   déplace : l'octogone qui les entoure toutes, gonflé de la plus large de leurs
   isolations. Le cuivre poussé fait le tour du boîtier d'un seul geste, au lieu
   de longer chaque pastille et de venir serpenter entre les broches. */
function pnsHullGroup(grp,net,w,mode){
  let infl=0;
  for(const it of grp)infl=Math.max(infl,pnsClr(it,net)+w/2+PNS_MARGIN);
  const sup=(dx,dy)=>{
    let m=-Infinity;
    for(const it of grp){
      const v=it.k==="P"?pnsSupPad(it.q,dx,dy):it.k==="V"?pnsSupVia(it.v,dx,dy)
             :pnsSupSeg(Object.assign({w:it.w},it.seg),dx,dy);
      if(v>m)m=v;
    }
    return m;
  };
  return pnsOct(sup,infl,mode);
}
/* Retendre une ligne qu'on vient d'écarter, AVANT qu'elle ne pousse ses
   voisines. Le tour d'enveloppe colle au bord, marches comprises ; retendu
   après coup, deux lignes poussées l'une contre l'autre se bloqueraient
   mutuellement — aucune ne peut couper son coin tant que l'autre n'a pas
   bougé. Retendue ici, la première prend sa forme propre, et celles qu'elle
   pousse ensuite s'alignent dessus.
   On ne regarde que ce qui ne bougera plus : les têtes, la ligne qui pousse
   (`genes`) et les pastilles. Le reste du cuivre sera poussé à son tour.
   Un raccourci est gardé s'il est plus court, ou aussi long avec moins de
   coudes — entre deux points, tous les chemins à 45° sans retour en arrière
   ont la même longueur. */
function pnsTendre(B,line,pts,genes,hors){
  const mode=cornerMode();
  const bad=q=>{
    if(!pnsIs45(q,mode)||!pnsSurCarte(q))return true;
    for(const s of pnsSegs(q))
      for(const g of genes)
        if(pnsGap(g,s,line.w)<pnsClr(g,line.net)-PNS_EPS)return true;
    return !!B.firstObstacle({l:line.l,net:line.net,w:line.w,nets:line.nets,pts:q},hors,"P");
  };
  pts=pnsSimplify(pts);
  for(let r=0;r<PNS_OPT_ROUNDS*2&&pts.length>2;r++){
    const anc=pnsAnchors(B,line.l,pts,hors);
    const L0=pnsLen(pts);
    let gagne=null;
    for(let n=pts.length-1;n>=2&&!gagne;n--)
      for(let i=0;i+n<pts.length&&!gagne;i++){
        let libre=true;
        for(let k=i+1;k<i+n;k++)if(anc.has(k)){libre=false;break;}
        if(!libre)continue;
        for(const post of [false,true]){
          const legs=routeCorner(pts[i],pts[i+n],post,mode,0);
          if(!legs.length)continue;
          const cand=pnsSimplify(pts.slice(0,i+1)
                                    .concat(legs.map(s=>({x:s.x2,y:s.y2})),pts.slice(i+n+1)));
          const L=pnsLen(cand);
          if(L>L0+1e-6)continue;
          if(L>=L0-1e-6&&cand.length>=pts.length)continue;
          if(bad(cand))continue;
          gagne=cand;break;
        }
      }
    if(!gagne)break;
    pts=gagne;
  }
  return pts;
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
  if(gene.hitems)return pnsViaEscapeItems(it,gene.hitems,sens);
  let p={x:it.v.x,y:it.v.y};
  for(let k=0;k<8;k++){
    let pire=null;
    for(const s of pnsSegs(gene.pts)){
      const g=pnsItemSeg(gene.l,gene.net,gene.w,s.x1,s.y1,s.x2,s.y2,null);
      const need=pnsClr(g,it.net,"via")+it.v.d/2+g.w/2+PNS_MARGIN;
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
/* La même fuite devant des OBJETS — les pastilles d'un boîtier qu'on déplace,
   un via tiré à la main. Un objet n'a pas de normale : le via s'en éloigne
   depuis son centre, qui est le plus court chemin dehors pour un rond et une
   bonne approximation pour une pastille — on itère jusqu'à l'isolation. Un
   seul sens a un sens ici ; l'autre est refusé. */
function pnsViaEscapeItems(it,genes,sens){
  if(sens<0)return null;
  let p={x:it.v.x,y:it.v.y};
  for(let k=0;k<8;k++){
    const probe=pnsItemVia(Object.assign({},it.v,{x:p.x,y:p.y}));
    let pire=null;
    for(const g of genes){
      const def=pnsClrPair(probe,g)+PNS_MARGIN-pnsPairGap(probe,g);
      if(def<=1e-6||(pire&&def<=pire.def))continue;
      let cx,cy;
      if(g.k==="P"){cx=g.q.x;cy=g.q.y;}
      else if(g.k==="V"){cx=g.v.x;cy=g.v.y;}
      else{const c=projOnSeg(p.x,p.y,g.seg);cx=c.x;cy=c.y;}
      const dx=p.x-cx, dy=p.y-cy, ln=Math.hypot(dx,dy);
      pire={def,nx:ln>1e-9?dx/ln:1,ny:ln>1e-9?dy/ln:0};
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
      if(o.it.arc)return null;             // une courbe part du fichier, pas du routeur
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
    const rec={l:s.ligne.l,net:s.ligne.net,w:s.ligne.w,pts:s.pts,orig,items:neufs};
    if(lignes)lignes.push(rec);
    pile.push({items:neufs,pts:s.pts,l:s.ligne.l,net:s.ligne.net,w:s.ligne.w,
               rang:rang+1,reprises:0,rec:lignes?rec:null});
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
function pnsShoveHeads(node,heads,skip,t0,opts){
  const tendre=!!(opts&&opts.tendre);
  const debut=t0==null?null:t0;
  const B=node.branch();
  const sauf=new Set(skip||[]);
  const pile=[], teteItems=[];
  for(const h of heads){
    /* Une tête peut être un OBJET — pastille d'un boîtier qu'on déplace, via
       tiré : il ne se pousse pas, il pousse. Sa gêne se mesure alors objet
       contre objet, et non le long d'une ligne. */
    if(h.item||h.items){
      const its=(h.items||[h.item]).map(x=>B.add(x));
      if(!its.length)continue;
      // `group` : un seul bloc, dont le cuivre poussé fait le tour entier
      if(h.group&&its.length>1)for(const it of its)it.grp=its;
      for(const it of its)teteItems.push(it);
      pile.push({items:its,hitems:its,pts:null,l:its[0].l0,net:its[0].net,w:0,
                 fixe:true,rang:0,reprises:0});
      continue;
    }
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
  /* Toutes les têtes réunies : c'est d'elles, ensemble, que le cuivre poussé
     doit s'écarter. Écarté d'une seule, il retomberait sur la voisine — la
     pastille d'à côté du même boîtier, l'autre brin d'une paire. */
  const toutes={hitems:teteItems};
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
    const ob=cur.hitems?pnsItemsObstacle(B,cur.hitems,moi)
                       :B.firstObstacle({l:cur.l,net:cur.net,w:cur.w,nets:cur.nets,pts:cur.pts},moi);
    if(!ob){pile.pop();continue;}
    /* Une tête ne se pousse pas, pas même par le cuivre qu'elle a écarté : ce
       serait défaire ce qu'on essaie de poser. */
    if(!cur.fixe&&tetes.has(ob.it)){
      /* ... mais le cuivre poussé peut s'en écarter à nouveau : c'est lui qui
         bouge, de toutes les têtes à la fois cette fois-ci. */
      if(!cur.rec||cur.reprises>=PNS_SHOVE_REPRISE)return {ok:false,cause:"tête"};
      let neuf=pnsShoveAside(B,{l:cur.l,net:cur.net,w:cur.w,nets:cur.nets,pts:cur.pts},toutes);
      if(!neuf)return {ok:false,cause:"tête"};
      if(tendre)neuf=pnsTendre(B,cur,neuf,teteItems,new Set(cur.items));
      cur.items=pnsRelink(B,cur,neuf);
      cur.pts=neuf;cur.rec.pts=neuf;cur.rec.items=cur.items;cur.reprises++;
      continue;
    }
    if(ob.it.k==="P")return {ok:false,cause:"pastille"};
    /* Une piste circulaire ne se pousse pas : la pousser voudrait dire la
       rendre en segments droits, et l'arc serait perdu. Le tracé la contourne,
       comme il contourne une pastille. */
    if(ob.it.arc)return {ok:false,cause:"courbe"};
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
    let neufPts=pnsShoveAside(B,L,cur.fixe?toutes:cur);
    if(!neufPts)return {ok:false,cause:"coincé"};
    if(tendre)neufPts=pnsTendre(B,L,neufPts,cur.fixe?teteItems:cur.items.concat(teteItems),
                                new Set(L.items));
    const orig=L.items.map(o=>o.src).filter(Boolean);
    const neufs=pnsRelink(B,L,neufPts);
    const rec={l:L.l,net:L.net,w:L.w,pts:neufPts,orig,items:neufs};
    lignes.push(rec);
    pile.push({items:neufs,pts:neufPts,l:L.l,net:L.net,w:L.w,
               rang:cur.rang+1,reprises:vu,rec});
  }
  return {ok:false,cause:"itérations"};
}

/* Le premier objet qui serre l'un des objets de tête de trop près. */
function pnsItemsObstacle(B,items,skip){
  for(const it of items){
    const hits=B.colliding(it,skip);
    if(hits.length)return {it:hits[0]};
  }
  return null;
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
