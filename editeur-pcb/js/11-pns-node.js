"use strict";
/* =============================================================================
   Éditeur PCB — 11-pns-node.js
   Le modèle du monde : ce que le routeur voit, et comment il l'essaie.

   Un **nœud** est une vue de tout le cuivre de la carte. Le nœud racine reflète
   `S` ; toute autre vue est une **branche** — une couche mince posée par-dessus
   son parent, qui ne retient que ce qu'elle ajoute et ce qu'elle masque. C'est
   la pièce qui manque le plus au tracé actuel : sans elle, essayer de pousser
   une piste voisine oblige à la déplacer pour de bon, puis à la remettre si
   l'essai rate. Avec elle, on branche, on essaie, et on jette la branche.

   Le nœud rend aussi au routeur ce que le balayage de listes plates ne savait
   pas donner :

     · un **index spatial** — hachage à maille fixe, comme celui que
       `computeConn` s'était déjà taillé pour les jonctions en T. Interroger un
       voisinage ne coûte plus la carte entière ;
     · des **articulations** (`jointAt`) : ce qui se touche en un point ;
     · l'**assemblage** (`assemble`) : `S.tracks` range des segments, le routeur
       raisonne en polylignes. Le pont est ici, et lui seul — le format de
       fichier ne bouge pas d'un octet.

   Une règle tient tout l'édifice : **la collision se mesure exactement comme le
   DRC**. Les mêmes fonctions (`segPadDist`, `segSegDist`, `segDist`), la même
   tolérance. Un routeur plus tolérant que son contrôle pose du cuivre que le
   contrôle refuse ensuite ; un routeur plus sévère refuse des passages qui
   tiennent. Ni l'un ni l'autre n'est acceptable.
   ============================================================================= */

const PNS_CELL=5;            // maille du hachage spatial, en mm
/* La tolérance du DRC, au micromètre près : le routeur juge au même seuil. */
const PNS_EPS=1e-6;
/* Ce qu'on se garde en plus quand on POSE du cuivre. Juger au micromètre et
   poser au micromètre laisse la moitié des trajets sur le fil du rasoir, où le
   moindre arrondi bascule. Un micron de marge suffit à ranger le doute du bon
   côté, et reste mille fois sous la précision d'un fabricant. */
const PNS_MARGIN=1e-3;

/* ==========================================================================
   Les objets du monde
   --------------------------------------------------------------------------
   Trois familles, un contrat commun : un net, une plage de couches, une boîte
   englobante pour l'index. `src` retient l'objet de `S` dont l'item est né —
   nul pour le cuivre qui n'existe encore que dans une branche.
   ========================================================================== */
function pnsItemPad(fp,q){
  const ls=padLayers(fp,q), r=Math.hypot(q.w,q.h)/2;
  return {k:"P", q, fp, net:q.net||"", l0:ls[0], l1:ls[ls.length-1], src:q,
          bx1:q.x-r, by1:q.y-r, bx2:q.x+r, by2:q.y+r};
}
function pnsItemVia(v){
  const r=v.d/2;
  return {k:"V", v, net:v.net||"", l0:v.a, l1:v.b, src:v,
          bx1:v.x-r, by1:v.y-r, bx2:v.x+r, by2:v.y+r};
}
/* Un segment de cuivre. `src` porte la piste de `S` quand elle existe ; le
   shove fabrique aussi des segments qui n'ont pas encore de piste derrière eux. */
function pnsItemSeg(l,net,w,x1,y1,x2,y2,src){
  const r=w/2;
  return {k:"S", l0:l, l1:l, net:net||"", w,
          seg:{x1,y1,x2,y2}, src:src||null,
          bx1:Math.min(x1,x2)-r, by1:Math.min(y1,y2)-r,
          bx2:Math.max(x1,x2)+r, by2:Math.max(y1,y2)+r};
}
function pnsItemTrack(t){return pnsItemSeg(t.l,t.net,t.w,t.x1,t.y1,t.x2,t.y2,t);}
/* Une piste circulaire entre dans le monde en cordes — le modèle ne sait
   mesurer que des segments — mais elle y entre **figée** : `arc` marque les
   morceaux qu'aucun assemblage ne doit reprendre. Sans cette marque, le shove
   aurait enfilé les cordes en polyligne, poussé la polyligne, et rendu à
   `S.tracks` une suite de segments droits : l'arc aurait disparu au premier
   coup de coude d'une autre piste. Comme obstacle, en revanche, il vaut
   exactement ce qu'il est — c'est ce que le contrôle d'isolation mesure. */
function pnsItemsTrack(t){
  if(!isArc(t))return [pnsItemTrack(t)];
  return trkSegs(t).map(s=>{
    const it=pnsItemSeg(t.l,t.net,t.w,s.x1,s.y1,s.x2,s.y2,t);
    it.arc=t;
    return it;
  });
}

/* L'isolation la plus large que le document puisse exiger. Elle donne la marge
   des fenêtres d'interrogation : chercher plus près serait rater un obstacle
   dont l'isolation porte plus loin que sa géométrie. `clrPair` ne rend jamais
   davantage — l'écart d'une paire différentielle est un minimum, pas un
   supplément. */
function pnsMaxClr(){
  let m=0;
  for(const c of S.classes){const v=+c.clr;if(Number.isFinite(v)&&v>m)m=v;}
  return Math.max(m,matMax());
}
/* La nature d'un item au sens de la matrice des règles : une pastille percée
   est une pastille traversante, une pastille pleine une pastille CMS. Le
   cuivre plein des zones n'entre pas dans l'index — c'est le masque de zone
   qui l'écarte, et il demande sa case lui-même. */
function pnsKind(it){
  if(!it)return "trk";
  if(it.k==="V")return "via";
  if(it.k==="P")return (it.q&&it.q.drill>0)?"th":"smd";
  return "trk";
}
/* L'isolation exigée entre un item et du cuivre du net `net`, de nature
   `kind` — une piste par défaut, ce que le routeur pose. C'est le seul endroit
   du moteur où les classes de net et la matrice entrent en jeu ; le reste ne
   connaît que des polygones. */
function pnsClr(it,net,kind){return clrK(net,it.net,kind||"trk",pnsKind(it));}
/* L'isolation exigée entre deux items quelconques : les deux natures viennent
   de l'index. C'est la mesure du contrôle DRC. */
function pnsClrPair(a,b){return clrK(a.net,b.net,pnsKind(a),pnsKind(b));}
/* L'enveloppe d'un item, vue par une piste de largeur `w` sur ce net : la forme
   gonflée de l'isolation, de la demi-largeur de la piste et d'un micron de
   marge, ramenée à l'octogone aligné sur les huit sens du tracé. C'est ce
   polygone que le contournement longe et dont le shove fait sortir les autres. */
function pnsHullOct(it,net,w,mode,extra){
  const infl=pnsClr(it,net)+w/2+(extra==null?PNS_MARGIN:extra);
  if(it.k==="P")return pnsOct((dx,dy)=>pnsSupPad(it.q,dx,dy),infl,mode);
  if(it.k==="V")return pnsOct((dx,dy)=>pnsSupVia(it.v,dx,dy),infl,mode);
  return pnsOct((dx,dy)=>pnsSupSeg(Object.assign({w:it.w},it.seg),dx,dy),infl,mode);
}
/* L'écart réel entre un item et un segment de largeur `w`, isolation non
   comprise : négatif quand le cuivre se recouvre. Les trois mesures sont
   celles du DRC, pas des équivalents. */
function pnsGap(it,s,w){
  if(it.k==="P")return segPadDist({x1:s.x1,y1:s.y1,x2:s.x2,y2:s.y2,w},it.q);
  if(it.k==="V")return segDist(it.v.x,it.v.y,s.x1,s.y1,s.x2,s.y2)-it.v.d/2-w/2;
  return segSegDist({x1:s.x1,y1:s.y1,x2:s.x2,y2:s.y2},it.seg)-it.w/2-w/2;
}
/* Le même écart entre deux items quelconques : six combinaisons, toutes
   reprises du DRC à l'identique — y compris l'approximation pastille/pastille,
   qui mesure du centre de l'une au cuivre de l'autre. Le routeur ne peut pas
   être plus fin que le contrôle sans se mettre à poser du cuivre que le
   contrôle refusera. */
function pnsPairGap(a,b){
  if(a.k==="S")return pnsGap(b,a.seg,a.w);
  if(b.k==="S")return pnsGap(a,b.seg,b.w);
  if(a.k==="V"&&b.k==="V")return dist(a.v.x,a.v.y,b.v.x,b.v.y)-a.v.d/2-b.v.d/2;
  if(a.k==="V")return padDist(a.v.x,a.v.y,b.q)-a.v.d/2;
  if(b.k==="V")return padDist(b.v.x,b.v.y,a.q)-b.v.d/2;
  return padDist(a.q.x,a.q.y,b.q)-Math.min(a.q.w,a.q.h)/2;
}
/* De combien, et dans quel sens, un point doit s'écarter d'un item pour qu'une
   piste de largeur `w` y tienne son isolation. Rend `null` quand il n'y a rien
   à corriger. C'est ce qui sert à ramener une arrivée hors d'un obstacle : un
   point n'a pas de forme à contourner, seulement une place à trouver. */
function pnsPointEscape(it,p,net,w){
  const s={x1:p.x,y1:p.y,x2:p.x,y2:p.y};
  const def=pnsClr(it,net)-pnsGap(it,s,w);
  if(def<=1e-4)return null;
  let cx,cy;
  if(it.k==="P"){cx=it.q.x;cy=it.q.y;}
  else if(it.k==="V"){cx=it.v.x;cy=it.v.y;}
  else{const c=projOnSeg(p.x,p.y,it.seg);cx=c.x;cy=c.y;}
  const dx=p.x-cx, dy=p.y-cy, len=Math.hypot(dx,dy);
  return {def, dx:len>1e-9?dx/len:1, dy:len>1e-9?dy/len:0};
}
/* ==========================================================================
   Le nœud
   ========================================================================== */
function pnsCellKey(l,cx,cy){return l+"|"+cx+"|"+cy;}

function pnsNode(parent){
  const N={
    parent:parent||null,
    depth:parent?parent.depth+1:0,
    own:new Set(),           // les items nés ici
    gone:new Set(),          // les items des ancêtres que cette branche masque
    grid:new Map()           // cellule → items propres
  };
  /* --- index --- */
  function cells(it,fn){
    const ax=Math.floor(it.bx1/PNS_CELL), bx=Math.floor(it.bx2/PNS_CELL);
    const ay=Math.floor(it.by1/PNS_CELL), by=Math.floor(it.by2/PNS_CELL);
    for(let l=it.l0;l<=it.l1;l++)
      for(let cx=ax;cx<=bx;cx++)
        for(let cy=ay;cy<=by;cy++)fn(pnsCellKey(l,cx,cy));
  }
  N.add=function(it){
    N.own.add(it);
    N.gone.delete(it);
    cells(it,k=>{
      let a=N.grid.get(k);
      if(!a)N.grid.set(k,a=[]);
      a.push(it);
    });
    return it;
  };
  N.remove=function(it){
    if(N.own.has(it)){       // né ici : il suffit de le retirer de l'index
      N.own.delete(it);
      cells(it,k=>{
        const a=N.grid.get(k);
        if(!a)return;
        const i=a.indexOf(it);
        if(i>=0)a.splice(i,1);
      });
    }else N.gone.add(it);    // né plus haut : on le masque, sans toucher au parent
  };
  N.replace=function(a,b){N.remove(a);return N.add(b);};

  /* --- branches --- */
  N.branch=function(){return pnsNode(N);};
  /* Verser la branche dans son parent : ce qu'elle masquait disparaît, ce
     qu'elle a posé s'installe. On ne remonte que d'un cran — une branche de
     branche se verse d'abord dans la sienne. */
  N.commit=function(){
    if(!N.parent)return N;
    for(const it of N.gone)N.parent.remove(it);
    for(const it of N.own)N.parent.add(it);
    N.own.clear();N.gone.clear();N.grid.clear();
    return N.parent;
  };

  /* --- interrogation --- */
  /* Tous les items visibles depuis ce nœud dont la boîte croise la fenêtre, sur
     les couches [l0,l1]. On remonte la lignée en accumulant les masques : un
     item retiré par une branche ne doit pas ressortir par son parent. */
  N.query=function(l0,l1,x1,y1,x2,y2){
    const out=new Set(), hidden=new Set();
    const ax=Math.floor(x1/PNS_CELL), bx=Math.floor(x2/PNS_CELL);
    const ay=Math.floor(y1/PNS_CELL), by=Math.floor(y2/PNS_CELL);
    for(let n=N;n;n=n.parent){
      for(let l=l0;l<=l1;l++)
        for(let cx=ax;cx<=bx;cx++)
          for(let cy=ay;cy<=by;cy++){
            const a=n.grid.get(pnsCellKey(l,cx,cy));
            if(!a)continue;
            for(const it of a){
              if(hidden.has(it)||out.has(it))continue;
              if(it.bx2<x1||it.bx1>x2||it.by2<y1||it.by1>y2)continue;
              out.add(it);
            }
          }
      for(const g of n.gone)hidden.add(g);
    }
    return out;
  };
  /* Tout le cuivre visible, sans fenêtre : le DRC et l'assemblage en ont
     besoin, et c'est le seul endroit du moteur qui balaie tout. */
  N.all=function(){
    const out=new Set(), hidden=new Set();
    for(let n=N;n;n=n.parent){
      for(const it of n.own)if(!hidden.has(it))out.add(it);
      for(const g of n.gone)hidden.add(g);
    }
    return out;
  };

  /* --- collisions --- */
  /* Les items qui serrent le segment de trop près. `net` et `w` décrivent la
     piste qui passe ; `skip` réunit ce qu'il ne faut pas juger — le cuivre
     qu'on est en train de déplacer, la pastille visée en arrivée. Un item du
     même net n'est jamais un obstacle : c'est la connexion recherchée. */
  /* Les items qui serrent `probe` de trop près. `probe` n'a pas besoin d'être
     dans le nœud : le shove interroge le monde avec du cuivre qu'il n'a pas
     encore posé. */
  N.colliding=function(probe,skip){
    const r=pnsMaxClr();
    const hits=[];
    for(const it of N.query(probe.l0,probe.l1,probe.bx1-r,probe.by1-r,
                                              probe.bx2+r,probe.by2+r)){
      if(it===probe)continue;
      /* Deux cordes d'un même arc sont un seul trait de cuivre. Sans net pour
         les reconnaître reliées, elles se seraient déclarées en défaut
         d'isolation l'une contre l'autre — elles se touchent par construction. */
      if(it.arc&&probe.arc&&it.arc===probe.arc)continue;
      if(skip&&(skip.has(it)||(it.src&&skip.has(it.src))||(it.fp&&skip.has(it.fp))))continue;
      if(probe.net&&it.net===probe.net)continue;
      /* Une paire différentielle circule sous DEUX nets : le sien et celui de
         son jumeau. `nets` les réunit, faute de quoi la paire se prendrait
         elle-même pour un obstacle dès le premier millimètre. */
      if(probe.nets&&it.net&&probe.nets.has(it.net))continue;
      if(pnsPairGap(probe,it)<pnsClrPair(probe,it)-PNS_EPS)hits.push(it);
    }
    return hits;
  };
  N.segColliding=function(s,l,net,w,skip,nets){
    const probe=pnsItemSeg(l,net,w,s.x1,s.y1,s.x2,s.y2,s.src||null);
    if(nets)probe.nets=nets;
    return N.colliding(probe,skip);
  };
  N.segBad=function(s,l,net,w,skip){return N.segColliding(s,l,net,w,skip).length>0;};

  /* Les obstacles d'une polyligne entière, **rangés dans l'ordre de la
     marche**. C'est ce que le contournement et le shove attendent : le premier
     obstacle rencontré est celui qu'il faut traiter, les suivants viendront au
     tour d'après, une fois la ligne redessinée. */
  N.obstacles=function(line,skip,only){
    const seen=new Map();
    const segs=pnsSegs(line.pts);
    for(let i=0;i<segs.length;i++)
      for(const it of N.segColliding(segs[i],line.l,line.net,line.w,skip,line.nets)){
        if(only&&only.indexOf(it.k)<0)continue;
        const prev=seen.get(it);
        if(prev==null||prev.i>i)seen.set(it,{it,i,s:segs[i]});
      }
    return [...seen.values()].sort((a,b)=>a.i-b.i);
  };
  N.firstObstacle=function(line,skip,only){
    const o=N.obstacles(line,skip,only);
    return o.length?o[0]:null;
  };

  /* --- articulations --- */
  /* Ce qui se touche au point (x,y) sur la couche l. Les bouts de segments sont
     rendus avec leur extrémité (1 ou 2), ce dont l'assemblage a besoin pour
     savoir dans quel sens continuer. */
  N.jointAt=function(l,x,y){
    const j={ends:[],vias:[],pads:[]};
    const e=5e-4;            // un demi-micron : deux bouts arrondis au micron se touchent
    for(const it of N.query(l,l,x-e,y-e,x+e,y+e)){
      if(it.k==="S"){
        if(dist(x,y,it.seg.x1,it.seg.y1)<=e)j.ends.push({it,e:1});
        else if(dist(x,y,it.seg.x2,it.seg.y2)<=e)j.ends.push({it,e:2});
      }else if(it.k==="V"){
        if(dist(x,y,it.v.x,it.v.y)<=e)j.vias.push(it);
      }else if(padDist(x,y,it.q)<=e)j.pads.push(it);
    }
    return j;
  };

  /* --- assemblage --- */
  /* La polyligne maximale qui passe par ce segment. On remonte de proche en
     proche tant que l'articulation ne tient exactement que deux bouts, de même
     net et de même largeur, sans via ni pastille pour l'ancrer : au-delà, ce
     n'est plus la même ligne, c'est un embranchement — le pousser tirerait de
     travers tout ce qui s'y accroche.
     Une boucle fermée s'arrête d'elle-même : on ne repasse pas deux fois. */
  N.assemble=function(seed){
    const segs=[seed], vus=new Set([seed]);
    const walk=(from,end)=>{
      let cur=from, e=end;
      for(;;){
        const p=e===1?{x:cur.seg.x1,y:cur.seg.y1}:{x:cur.seg.x2,y:cur.seg.y2};
        const j=N.jointAt(cur.l0,p.x,p.y);
        if(j.vias.length||j.pads.length||j.ends.length!==2)break;
        const nx=j.ends.find(o=>o.it!==cur);
        if(!nx||vus.has(nx.it))break;
        if(nx.it.arc)break;                 // une courbe ne se pousse pas : elle se redresserait
        if(nx.it.net!==cur.net||Math.abs(nx.it.w-cur.w)>1e-9)break;
        vus.add(nx.it);
        if(e===1)segs.unshift(nx.it);else segs.push(nx.it);
        cur=nx.it;e=nx.e===1?2:1;
      }
    };
    walk(seed,1);walk(seed,2);
    /* Les segments sont dans l'ordre mais pas forcément dans le bon sens :
       on les enfile bout à bout en retournant ceux qui se présentent à l'envers. */
    const pts=[];
    for(let i=0;i<segs.length;i++){
      const s=segs[i].seg;
      let a={x:s.x1,y:s.y1}, b={x:s.x2,y:s.y2};
      if(i===0){
        const nx=segs[1]&&segs[1].seg;
        // si c'est le point 1 du premier segment qui touche le suivant, il part
        // à l'envers : la ligne commence par son autre bout
        if(nx&&(dist(a.x,a.y,nx.x1,nx.y1)<5e-4||dist(a.x,a.y,nx.x2,nx.y2)<5e-4)){
          const t=a;a=b;b=t;
        }
        pts.push(a,b);
      }else{
        const last=pts[pts.length-1];
        if(dist(last.x,last.y,a.x,a.y)>5e-4){const t=a;a=b;b=t;}
        pts.push(b);
      }
    }
    return {l:seed.l0, net:seed.net, w:seed.w, pts:pnsSimplify(pts), items:segs};
  };
  return N;
}

/* ==========================================================================
   La racine
   --------------------------------------------------------------------------
   Bâtie depuis `S`, gardée tant que le document ne bouge pas. `S.ver` suffit
   presque : on lui adjoint le compte des objets, pour le cas où une écriture
   oublierait son `touch()`. Reconstruire coûte un balayage — largement moins
   qu'un seul mouvement de souris de l'ancien routeur.
   ========================================================================== */
let pnsCache=null;
function pnsStamp(){
  return S.ver+"/"+S.cu+"/"+S.tracks.length+"/"+S.vias.length+"/"+S.fps.length;
}
function pnsBuild(){
  const N=pnsNode(null);
  for(const fp of S.fps)
    for(const q of padsWorld(fp))N.add(pnsItemPad(fp,q));
  for(const v of S.vias)N.add(pnsItemVia(v));
  for(const t of S.tracks)for(const it of pnsItemsTrack(t))N.add(it);
  return N;
}
function pnsWorld(){
  const st=pnsStamp();
  if(pnsCache&&pnsCache.st===st)return pnsCache.node;
  pnsCache={st,node:pnsBuild()};
  return pnsCache.node;
}
function pnsInvalidate(){pnsCache=null;}
