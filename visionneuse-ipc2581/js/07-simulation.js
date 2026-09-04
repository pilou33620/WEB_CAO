"use strict";
/* =============================================================================
   visionneuse IPC-2581 — 07-simulation.js
   L'adaptateur qui relie la carte lue au solveur de section
   (python/ligne_mom.py, via python/simulation_em.py). Ce n'est PAS
   mom_solver/ : le moteur 2,5D pleine onde est hors du chemin de calcul, et
   A-FAIRE.md dit pourquoi.

   Le panneau lui-même — saisie, envoi, fiche, courbe, exports — est dans
   `../commun/simulation-em.js`, que l'éditeur PCB charge aussi. Ce fichier ne
   fait que deux choses : décrire la portée désignée au format d'échange, et
   peindre le résultat sur le cuivre.

   Ce qui distingue cet outil de l'éditeur PCB, et qui vaut d'être dit :

   · **L'empilage n'est pas saisi ici, il est LU** — et un fichier IPC-2581 ne
     dit pas toujours tout. C'est déjà le problème de la ligne de transmission
     du panneau « Sélection », et il a déjà sa réponse : `LT`, l'empilage de
     calcul dressé par `ltPreparer()` (02-modele.js), où chaque valeur vient du
     fichier, d'une saisie de l'utilisateur ou d'un repli, et où l'on sait
     laquelle. La simulation part du même `LT` : deux empilages pour une carte
     donneraient deux réponses différentes à la même question, et l'utilisateur
     n'aurait aucun moyen de savoir laquelle croire.

   · **Tout est ramené en millimètres.** Un fichier IPC-2581 peut être en
     pouces ; le document de simulation, lui, est en millimètres, comme tout ce
     qui circule entre les outils du dépôt. La conversion se fait ici, une fois.

   · **Rien n'est modifié.** Cette page ne touche pas au fichier ouvert ; ce
     panneau non plus. Il lit du cuivre et il envoie une copie.

   LES GESTES sont ceux que la page a déjà, et ce sont ceux du fichier :
     · clic sur une piste  -> cette piste, sur sa couche  (`V.mev.couche`) ;
     · Maj+clic            -> tout le net, sur toutes les couches.
   Il n'y a pas de troisième portée : le double-clic est pris — il cadre la
   carte — et une visionneuse n'a pas de « tronçon » à isoler, IPC-2581
   décrivant une piste comme une polyligne entière.
   ============================================================================= */

/* Facteur de conversion vers le millimètre : le fichier commande. */
function simKUnite(){return (V.unite==="in")?25.4:1;}

/* Le conducteur `k` de l'empilage de calcul occupe la place `2k` dans
   l'empilage envoyé — un conducteur, un intervalle, un conducteur. Même
   convention que côté éditeur PCB : le serveur n'a qu'une règle à connaître. */
function simRangCu(k){return 2*k;}

/* L'index de conducteur (rang dans LT.cu) d'une couche du modèle, ou -1 si
   cette couche n'est pas un cuivre de l'empilage. Une piste posée sur une
   couche absente de l'empilage n'a pas de place dans le problème : mieux vaut
   la laisser de côté en le disant que lui inventer une altitude. */
function simCuDe(coucheIdx){
  if(!LT.pret)return -1;
  return LT.cu.findIndex(e=>e.couche===coucheIdx);
}

/* L'empilage de calcul, mis au format du serveur. `LT.cu` porte les
   conducteurs dans l'ordre physique et `LT.gap[i]` ce qui sépare le conducteur
   i du suivant : c'est exactement la forme attendue. */
/* Le net qui possede le cuivre PLEIN d'une couche : celui qui en couvre le
   plus. C'est la meme lecture que `simRefCandidatsIpc`, faite couche par
   couche au lieu de net par net.

   POURQUOI « LE PLUS GRAND » ET NON « LE SEUL ». Une couche de plan porte
   presque toujours plusieurs ilots : la masse sur toute la surface, et deux ou
   trois flaques d'alimentation posees dessus. Celui qui la DEFINIT est celui
   qui la couvre, et c'est aussi celui qui fera face a une piste de la couche
   voisine. Prendre « le seul » ne rendrait jamais rien. */
function simNetDuPlanIpc(coucheIdx){
  if(!V.parNet)return "";
  let best="", aire=0;
  for(const n of V.parNet){
    if(!n.nom)continue;
    let a=0;
    for(const pl of (n.plans||[])){
      if(pl.c!==coucheIdx)continue;
      for(const ct of pl.g){
        a+=ltAire(ct.o);
        for(const t of (ct.t||[]))a-=ltAire(t);
      }
    }
    if(a>aire){aire=a; best=n.nom;}
  }
  return aire>0?best:"";
}

function simStackupIpc(){
  const couches=[];
  LT.cu.forEach(function(cu,k){
    couches.push({type:"copper", name:cu.nom, thickness:cu.ep,
                  role:cu.plan?"plane":"signal",
                  net:simNetDuPlanIpc(cu.couche)});
    const g=LT.gap[k];
    if(g)couches.push({
      type:"dielectric", name:g.cle, thickness:g.t, epsilon_r:g.er,
      /* IPC-2581 porte le Df dans la même `<Spec>` que le Dk. Il est moyenné
         par `ltPreparer` comme l'est le Dk, et c'est cette moyenne-là qui part
         — pas un repli. Ce code lisait auparavant `LT.pile[…].df`, un champ que
         `ltPreparer` ne construisait pas : la boucle ne trouvait jamais rien et
         retombait invariablement sur 0,02, y compris sur les cartes qui
         portent la valeur dans leur fichier. Les pertes diélectriques
         affichées étaient alors les mêmes pour tout le monde. */
      tan_delta:g.df||LT_DF
    });
  });
  return {layers:couches};
}

/* ==========================================================================
   L'ÉCART AU CUIVRE DE MASSE, mesuré sur la carte
   --------------------------------------------------------------------------
   Une piste noyée dans un plan arrosé n'est pas un microruban : le cuivre qui
   la borde sur sa propre couche lui prend une part de son champ et fait tomber
   son impédance de vingt pour cent et davantage. Sur une carte RF, où l'on
   arrose et où l'on coud de vias, c'est le cas ordinaire.

   ICI IL FAUT MESURER, contrairement à l'éditeur PCB : la visionneuse lit une
   carte livrée, elle ne connaît pas la règle d'isolation qui a creusé le plan.
   Elle a en revanche le plan lui-même, contour par contour — et la piste est
   dans un de ses trous, celui qu'on a découpé autour d'elle. La distance de
   l'axe de la piste au bord de ce trou, moins la demi-largeur, EST l'écart.

   UNE GRILLE, PARCE QU'UN PLAN A DES MILLIERS D'ARÊTES. Parcourir toutes les
   arêtes du plan pour chaque point de chaque piste serait quadratique et se
   verrait. On range donc les arêtes dans un pavage régulier, une fois par
   couche, et on n'interroge que les cases du voisinage. La grille est refaite
   quand la carte change, et pas avant.

   ON NE COMPTE QUE LE CUIVRE DES NETS DE RÉFÉRENCE. Le même net que la piste ne
   laisse aucun écart — il la touche, c'est le même conducteur ; et un autre net
   qui n'est pas une masse n'est pas un plan de retour, c'est un couplage. Cette
   grille porte donc le net de chaque arête, et c'est `simEcartsEn` qui trie.
   ========================================================================== */
const SIM_GAP_MAX=3.0;          // mm ; au-delà, l'effet coplanaire est nul
const SIM_GAP_CASE=1.0;         // mm ; le pas du pavage
let SIM_GRILLES=new Map();      // couche -> pavage des arêtes de plan
let SIM_GRILLES_SRC=null;       // le modèle pour lequel elles ont été bâties

function simCleCase(i,j){return i+"|"+j;}

/* Le pavage des arêtes de plan d'une couche. Les coordonnées restent dans
   l'unité du fichier : c'est la conversion en millimètres qui se fait à la
   sortie, une fois, comme partout ailleurs dans cet adaptateur. */
function simGrilleCuivre(coucheIdx){
  if(SIM_GRILLES_SRC!==V.modele){SIM_GRILLES=new Map();SIM_GRILLES_SRC=V.modele;}
  if(SIM_GRILLES.has(coucheIdx))return SIM_GRILLES.get(coucheIdx);

  const pas=SIM_GAP_CASE/simKUnite();      // un millimètre, en unités fichier
  const cases=new Map();
  /* ON SUIT L'ARÊTE, on ne remplit pas sa boîte englobante. La première version
     posait le segment dans toutes les cases de son rectangle et refusait les
     arêtes de plus de soixante-quatre cases pour ne pas exploser — ce qui
     revenait à JETER exactement les arêtes qui comptent : la paroi d'un couloir
     de plan court sur toute la longueur de la piste qu'elle borde, et se voyait
     donc écartée. Une diagonale de cent millimètres traverse une centaine de
     cases, pas dix mille : on marche dessus par demi-case, et le problème
     disparaît des deux côtés. */
  const poser=function(x1,y1,x2,y2,net){
    const l=Math.hypot(x2-x1,y2-y1);
    const n=Math.max(1,Math.ceil(2*l/pas));
    let dernier="";
    for(let s=0;s<=n;s++){
      const x=x1+(x2-x1)*s/n, y=y1+(y2-y1)*s/n;
      const k=simCleCase(Math.floor(x/pas),Math.floor(y/pas));
      if(k===dernier)continue;
      dernier=k;
      let t=cases.get(k);
      if(!t){t=[];cases.set(k,t);}
      t.push(x1,y1,x2,y2,net);
    }
  };
  const contour=function(pts,net){
    if(!pts||pts.length<4)return;
    for(let i=0;i+3<pts.length;i+=2)
      poser(pts[i],pts[i+1],pts[i+2],pts[i+3],net);
    poser(pts[pts.length-2],pts[pts.length-1],pts[0],pts[1],net);
  };
  const c=V.couches[coucheIdx];
  for(const pl of ((c&&c.plans)||[]))
    for(const ct of pl.g){
      contour(ct.o,pl.n);
      for(const t of (ct.t||[]))contour(t,pl.n);
    }
  const g={pas:pas, cases:cases, vide:cases.size===0};
  SIM_GRILLES.set(coucheIdx,g);
  return g;
}

/* Un arc, ramené à une polyligne.

   UN ARC EST UNE PISTE, et l'IPC-2581 le range ailleurs. Le format décrit les
   segments droits et les arcs dans deux collections distinctes ; `mdlCharger`
   les garde séparés, et c'est fidèle au fichier. Mais pour tout ce qui suit —
   la longueur, l'écart au cuivre de masse, le raccord d'un via — un arc est du
   cuivre qui court comme un autre.

   CE QUE COÛTAIT L'OUBLI, mesuré sur une carte livrée : la liaison partait au
   serveur en morceaux droits SÉPARÉS par les arcs qui les joignent. Les
   tronçons ne se touchaient donc pas, le panneau annonçait « la sélection
   n'est pas un parcours continu », les angles se prenaient entre des tronçons
   qui ne se suivent pas — un coude de 168°, c'est-à-dire un demi-tour, sur une
   piste presque droite — et surtout AUCUN via ne s'accrochait : un via se pose
   là où la fin d'un tronçon rejoint le début du suivant, et cela n'arrivait
   jamais. Ni son perçage, ni sa portée, ni les vias de masse voisins ne
   partaient, et le chevelu du retour n'avait rien à dessiner.

   Le chemin de la chute continue, lui, les pliait déjà (`simDCPolysArcIpc`).
   Le pliage est donc écrit ICI, une fois, et les deux le lisent.

   ON PASSE PAR `mdlArc`, ET C'EST TOUT L'INTÉRÊT. Un arc du modèle porte
   `s` (début), `e` (fin), `m` (centre) et `h` (sens horaire) — PAS un tableau
   `p` de sommets, qui est la forme d'une piste. La version précédente de ce
   pliage lisait justement `a.p` : elle ne trouvait rien, retombait sur son
   repli « ce n'est pas un arc » et rendait une piste SANS SOMMETS. Le chemin de
   la chute continue passait déjà par là et croyait donc traiter les arcs alors
   qu'il les perdait en silence. Une seule définition de la géométrie d'un arc
   existe dans cet outil, c'est `mdlArc` — c'est celle du dessin, donc celle qui
   ne peut pas se désynchroniser de ce qu'on voit à l'écran.

   LES DEUX BOUTS SONT CEUX DU FICHIER, et non ceux du cercle reconstruit. Le
   rayon se déduit du point de départ ; le dernier point calculé peut retomber
   à un micron du bout déclaré, et un micron suffit à casser un chaînage. On
   les replace donc. */
function simArcEnPolyligne(a){
  if(!(a&&a.s&&a.e&&a.m&&typeof mdlArc==="function"))return null;
  const g=mdlArc(a);
  if(!(g.r>0))return [a.s[0],a.s[1], a.e[0],a.e[1]];
  /* `mdlArc` rend les deux angles bruts ; le SENS vient de `h`, comme pour le
     dessin. Un arc dont les deux bouts sont confondus est un cercle entier, et
     `mdlArc` l'a déjà ouvert d'un tour complet. */
  let d=g.f-g.d;
  if(g.h){ while(d>0)d-=2*Math.PI; }
  else   { while(d<0)d+=2*Math.PI; }
  /* LA FINESSE SE PREND SUR L'ANGLE, ET NON SUR LA LARGEUR DE LA PISTE. Le
     critère « une facette par largeur de piste » vient du tracé de CONTOUR,
     où il suffit : la facette y est plus fine que le trait qu'elle dessine.
     Pour une LONGUEUR il est trop grossier — un quart de cercle y tombait à
     quatre facettes, et une corde est plus courte qu'un arc : 0,64 % de moins,
     que le retard de propagation emporte tel quel. Un pas de deux degrés
     ramène l'écart à cinq millionièmes, pour quarante-cinq facettes par quart
     de tour, ce qui ne se sent nulle part. */
  const n=Math.max(2,Math.min(256,Math.ceil(Math.abs(d)/(Math.PI/90))));
  const pts=[];
  for(let i=0;i<=n;i++){
    const t=g.d+d*i/n;
    pts.push(g.cx+g.r*Math.cos(t), g.cy+g.r*Math.sin(t));
  }
  pts[0]=a.s[0]; pts[1]=a.s[1];
  pts[pts.length-2]=a.e[0]; pts[pts.length-1]=a.e[1];
  return pts;
}

/* Distance d'un point à un segment, ET le point le plus proche : c'est lui qui
   dit DE QUEL CÔTÉ de la piste se trouve le cuivre, et le côté est justement
   ce qui manquait à la version précédente. `out`, s'il est fourni, le reçoit —
   pas de tableau alloué par arête, il y en a des dizaines de milliers. */
function simDistSeg(px,py,x1,y1,x2,y2,out){
  const dx=x2-x1, dy=y2-y1, l2=dx*dx+dy*dy;
  let u=(l2<=0)?0:((px-x1)*dx+(py-y1)*dy)/l2;
  u=u<0?0:(u>1?1:u);
  const cx=x1+u*dx, cy=y1+u*dy;
  if(out){out.x=cx; out.y=cy;}
  return Math.hypot(px-cx,py-cy);
}

/* ==========================================================================
   LA POLYLIGNE, PARAMÉTRÉE PAR SA LONGUEUR
   --------------------------------------------------------------------------
   Il faut pouvoir se placer à la fraction `u` du parcours et savoir dans quel
   sens on va : c'est ce qui permet d'échantillonner régulièrement, de séparer
   la gauche de la droite, et de peindre exactement la plage dont on affiche
   l'impédance. Une polyligne IPC-2581 ne le donne pas — elle donne des sommets.
   ========================================================================== */
function simCumul(p){
  const c=[0];
  for(let i=0;i+3<p.length;i+=2)
    c.push(c[c.length-1]+Math.hypot(p[i+2]-p[i],p[i+3]-p[i+1]));
  return c;
}

/* Le point à la fraction `u`, et la tangente unitaire qui y passe. La tangente
   est celle du SEGMENT courant, et non une moyenne : au sommet d'un coude il y
   en a deux, et moyenner ferait pointer la normale de biais — donc chercher le
   cuivre là où il n'est pas. */
function simSurPoly(p,cum,u){
  const total=cum[cum.length-1];
  const s=Math.max(0,Math.min(total,u*total));
  let i=1;
  while(i<cum.length-1&&cum[i]<s)i++;
  const a=2*(i-1), l=cum[i]-cum[i-1];
  const f=(l>0)?(s-cum[i-1])/l:0;
  const x1=p[a],y1=p[a+1],x2=p[a+2],y2=p[a+3];
  const dx=x2-x1, dy=y2-y1, d=Math.hypot(dx,dy)||1;
  return {x:x1+dx*f, y:y1+dy*f, tx:dx/d, ty:dy/d};
}

/* La projection d'un point quelconque sur la polyligne : distance
   perpendiculaire, position le long du parcours, et de quel côté. Sert à ranger
   les vias de couture le long de la piste qu'ils bordent. */
function simProjPoly(p,cum,x,y){
  const cp={x:0,y:0};
  let best=null;
  for(let i=0;i+3<p.length;i+=2){
    const d=simDistSeg(x,y,p[i],p[i+1],p[i+2],p[i+3],cp);
    if(best&&d>=best.d)continue;
    const dx=p[i+2]-p[i], dy=p[i+3]-p[i+1], l=Math.hypot(dx,dy)||1;
    best={d:d, s:cum[i/2]+Math.hypot(cp.x-p[i],cp.y-p[i+1]),
          cote:(-dy/l)*(x-cp.x)+(dx/l)*(y-cp.y)};
  }
  return best;
}

/* ==========================================================================
   LES DEUX ÉCARTS EN UN POINT DE L'AXE
   --------------------------------------------------------------------------
   TROIS HYPOTHÈSES SONT TOMBÉES ICI, et c'est le cœur de cette version. La
   mesure d'avant parcourait l'axe, retenait le MINIMUM sur toute la longueur et
   des DEUX CÔTÉS confondus, et comptait tout cuivre d'un autre net comme de la
   masse. Elle posait donc ce même écart à gauche et à droite :

   1. UN SEUL MINIMUM POUR TOUTE LA PISTE. C'est `simPlagesDe`
      (../commun/simulation-em.js) qui le corrige : la piste est découpée en
      plages d'écart constant, et chacune part au solveur avec le sien.
   2. LES DEUX CÔTÉS CONFONDUS. Corrigé ici : le produit vectoriel de la
      tangente par le vecteur qui va du point de mesure au cuivre trouvé donne
      le côté, et l'on tient DEUX minima. Une piste qui longe une découpe d'un
      côté et du plan serré de l'autre était sur-corrigée de plusieurs ohms.
   3. TOUT CUIVRE D'UN AUTRE NET. Corrigé ici aussi : seul le cuivre des nets de
      référence entre dans l'écart. Le reste est relevé à part — c'est un
      COUPLAGE, pas un plan de retour, et le taire remplacerait une erreur par
      un silence.

   ON GARDE LES ANNEAUX CROISSANTS, qui rendaient la mesure abordable. La
   condition d'arrêt tient compte des deux côtés : on ne s'arrête que quand
   AUCUN des deux ne peut plus être battu. Un côté sans masse ne s'arrête donc
   jamais tôt — mais le rayon utile ne fait que trois cases, et c'est borné.
   ========================================================================== */
function simEcartsEn(g,k,px,py,tx,ty,demi,net,refs){
  const rayonMax=Math.ceil((SIM_GAP_MAX/k+demi)/g.pas);
  const ci=Math.floor(px/g.pas), cj=Math.floor(py/g.pas);
  const cp={x:0,y:0};
  let mg=Infinity, md=Infinity;          // masse de référence, par côté
  let hg=null, hd=null;                  // cuivre hors référence, par côté

  for(let r=0;r<=rayonMax;r++){
    for(let i=ci-r;i<=ci+r;i++)
      for(let j=cj-r;j<=cj+r;j++){
        if(r>0&&Math.abs(i-ci)!==r&&Math.abs(j-cj)!==r)continue;
        const t=g.cases.get(simCleCase(i,j));
        if(!t)continue;
        for(let e=0;e<t.length;e+=5){
          const nt=t[e+4];
          if(nt===net)continue;          // même net : pas d'écart, il la touche
          const d=simDistSeg(px,py,t[e],t[e+1],t[e+2],t[e+3],cp);
          /* LE CUIVRE DOIT ÊTRE À CÔTÉ, PAS DEVANT. On décompose le vecteur qui
             va du point de mesure au cuivre trouvé : une composante en travers
             de la piste, une le long. Si la seconde domine, ce cuivre n'est pas
             une masse coplanaire — c'est ce qui ferme le couloir DEVANT le bout
             de la piste, là où le plan se refait après la pastille. Le compter
             comme un bord latéral donnait un écart coplanaire aux deux
             extrémités de toute piste, sur un demi-millimètre, et cette plage
             fantôme ressortait dans le tableau.

             Ce qui reste après ce tri a forcément une composante latérale non
             nulle : son signe donne le côté, sans cas d'égalité à trancher. */
          const vx=cp.x-px, vy=cp.y-py;
          const lat=(-ty)*vx+tx*vy;
          if(Math.abs(lat)<=Math.abs(tx*vx+ty*vy))continue;
          const gauche=lat>0;
          if(refs.has(nt)){
            if(gauche){if(d<mg)mg=d;}else if(d<md)md=d;
          }else{
            const o=gauche?hg:hd;
            if(!o||d<o.d){
              if(gauche)hg={d:d,net:nt}; else hd={d:d,net:nt};
            }
          }
        }
      }
    if(mg<=r*g.pas&&md<=r*g.pas)break;   // rien de plus près ne peut venir
  }

  /* De la distance d'AXE à cuivre à la distance de CUIVRE à cuivre, en
     millimètres. Au-delà de la portée utile, il n'y a pas d'effet coplanaire :
     on rend zéro plutôt qu'un grand nombre, qui se lirait comme une mesure. */
  const conv=function(v){
    if(!isFinite(v))return 0;
    const e=(v-demi)*k;
    return (e>0&&e<=SIM_GAP_MAX)?Math.round(e*1000)/1000:0;
  };
  const hors=[], horsD=[];
  for(const o of [hg,hd]){
    if(!o)continue;
    const e=conv(o.d);
    if(e>0){hors.push(o.net); horsD.push(e);}
  }
  return {g:conv(mg), d:conv(md), hors:hors, horsD:horsD};
}

/* ==========================================================================
   QUI EST LA MASSE, ici
   --------------------------------------------------------------------------
   Le panneau pose la question (`simRefSet`, ../commun/simulation-em.js) ; ce
   fichier propose la réponse. ET IL DOIT LA DEVINER, contrairement à l'éditeur
   PCB qui porte le rôle de ses couches : un fichier IPC-2581 ne déclare pas
   quel net est la masse. Trois indices, dans cet ordre :

     · le NOM. « GND », « AGND », « VSS »… c'est le plus sûr des trois quand il
       est là, et il l'est presque toujours ;
     · le CUIVRE PLEIN. Un net qui couvre une bonne part de la carte est un
       plan, quel que soit son nom. C'est déjà le parti pris de `ltEstPlan`
       pour reconnaître un plan de référence dans l'empilage — le cuivre en
       place, pas l'intention ;
     · les PERÇAGES. Un plan cousu de deux cents vias n'est pas un îlot.

   ET LA PROPOSITION EST CORRIGEABLE, ce qui est le point important : la
   deviner, c'est se tromper parfois. Une alimentation arrosée n'est pas
   proposée d'office — au repos elle est bien une masse RF, mais c'est un choix
   de modélisation qui appartient à celui qui lit la carte, pas à l'outil.
   ========================================================================== */
const SIM_GND_RE=
  /^(a|d|p|)gnd\d*$|^(masse|ground|earth|terre|0v|vss|vee|shield|blindage)\d*$/i;
const SIM_REF_TAUX=0.02;        // 2 % de la carte : en deçà, ce n'est pas un plan

let SIM_CAND=null, SIM_CAND_SRC=null;
function simRefCandidatsIpc(){
  if(SIM_CAND_SRC===V.modele&&SIM_CAND)return SIM_CAND;
  SIM_CAND=[]; SIM_CAND_SRC=V.modele;
  if(!V.modele||!V.parNet)return SIM_CAND;

  const liste=[];
  for(const n of V.parNet){
    if(!n.nom)continue;
    let aire=0;
    for(const pl of n.plans)for(const ct of pl.g){
      aire+=ltAire(ct.o);
      for(const t of (ct.t||[]))aire-=ltAire(t);
    }
    aire=Math.max(0,aire);
    const taux=(LT.aire>0)?aire/LT.aire:0;
    const gnd=SIM_GND_RE.test(String(n.nom).replace(/[\s_-]/g,""));
    /* Il faut du cuivre PLEIN pour être candidat : un net qui n'a que des
       pistes n'est pas un plan de retour, même nommé « GND ». Un net nommé
       comme une masse est retenu dès qu'il en a un peu. */
    if(!(taux>=SIM_REF_TAUX)&&!(gnd&&aire>0))continue;
    liste.push({net:n.nom, taux:taux, trous:n.trous.length, gnd:gnd});
  }

  /* Ce qui est proposé d'office : les nets nommés comme une masse qui portent
     un plan. Aucun ? Alors le plus gros plan, s'il couvre assez la carte pour
     que `ltEstPlan` l'appellerait un plan — mieux vaut proposer le bon candidat
     évident que laisser le calcul coplanaire désarmé sans rien dire. */
  liste.sort(function(a,b){
    if(a.gnd!==b.gnd)return a.gnd?-1:1;
    return b.taux-a.taux;
  });
  let propose=false;
  for(const c of liste)
    if(c.gnd&&c.taux>=SIM_REF_TAUX){c.defaut=true; propose=true;}
  if(!propose&&liste.length&&liste[0].taux>=LT_SEUIL_PLAN)
    liste[0].defaut=true;

  SIM_CAND=liste.map(function(c){
    const quoi=[];
    if(c.taux>0)quoi.push("cuivre plein sur "+mdlNb(100*c.taux,0)+" % de la carte");
    if(c.trous)quoi.push(c.trous+" perçage(s)");
    if(c.gnd)quoi.push("nom de masse");
    if(!c.defaut)quoi.push("pas proposé d'office : à vous de dire si ce net "+
                           "est bien un plan de retour");
    return {net:c.net, defaut:!!c.defaut, quoi:quoi.join(" ; ")};
  });
  return SIM_CAND;
}

/* Les nets de référence, en INDICES : c'est sous cette forme que la grille des
   arêtes porte le net d'un plan, et convertir à chaque arête coûterait cher
   pour rien. */
function simRefIdx(){
  const noms=simRefSet(), s=new Set();
  if(!V.parNet)return s;
  for(const n of V.parNet)if(n.nom&&noms.has(n.nom))s.add(n.i);
  return s;
}

/* ==========================================================================
   Les plages d'une piste
   --------------------------------------------------------------------------
   Le découpage lui-même est dans `../commun/simulation-em.js` : c'est un choix
   de modélisation, et il doit valoir la même chose dans les deux outils. Ici on
   ne fait que le nourrir, et relever au passage ce qu'il ne regarde pas — les
   côtés qui portent de la masse, et le cuivre voisin qui n'en est pas.
   ========================================================================== */
function simPlagesIpc(piste,coucheIdx,refs,cum,total){
  const cotes={g:false, d:false}, hors=new Map();
  const seule=[{u1:0, u2:1, longueur:total, g:0, d:0}];
  if(!(total>0)||!piste.p||piste.p.length<4)
    return {plages:[], hors:[], cotes:cotes};
  const g=simGrilleCuivre(coucheIdx);
  if(g.vide)return {plages:seule, hors:[], cotes:cotes};

  const k=simKUnite(), demi=(piste.w||0)/2;
  const r=simPlagesDe(total,function(u){
    const s=simSurPoly(piste.p,cum,u);
    const e=simEcartsEn(g,k,s.x,s.y,s.tx,s.ty,demi,piste.n,refs);
    if(e.g>0)cotes.g=true;
    if(e.d>0)cotes.d=true;
    e.hors.forEach(function(net,i){
      let o=hors.get(net);
      if(!o){o={net:net, ecart:Infinity, n:0}; hors.set(net,o);}
      o.n++;
      if(e.horsD[i]<o.ecart)o.ecart=e.horsD[i];
    });
    return e;
  });
  return {
    plages:r.plages.length?r.plages:seule,
    hors:[...hors.values()].map(function(o){
      return {net:(o.net>=0)?mdlNetNom(o.net):"(sans net)",
              ecart:o.ecart, longueur:Math.round(o.n*r.pas*1000)/1000};
    }),
    cotes:cotes
  };
}

/* ==========================================================================
   LA COUTURE DE VIAS
   --------------------------------------------------------------------------
   CE QUI FAIT QU'UN PLAN COPLANAIRE EST VRAIMENT DE LA MASSE. Le solveur tient
   le cuivre latéral à zéro volt : c'est sa condition aux limites, et c'est ce
   que « plan de masse » veut dire. Sur une carte, ce cuivre ne l'est qu'autant
   que des vias le ramènent au plan d'en face. Sans couture il flotte, et à
   partir d'une certaine fréquence il résonne au lieu de servir de retour.

   On ne le modélise pas — il faudrait l'onde complète, c'est-à-dire
   `mom_solver/`, hors du chemin de calcul. On le MESURE : le plus grand
   espacement entre deux coutures consécutives le long de la piste. C'est le
   panneau qui en tire un verdict, parce que lui seul connaît la permittivité
   effective calculée et le haut de la bande analysée.

   PAR CÔTÉ, et seulement du côté qui porte de la masse : un côté sans cuivre
   latéral n'a pas de couture à avoir, et le compter ferait crier à tort sur
   toutes les pistes qui longent un bord de carte.

   CE QUE CE CONTRÔLE NE VOIT PAS. Un perçage IPC-2581 ne dit pas ici quelle
   plage de couches il relie : un via borgne qui s'arrête avant le plan de
   référence compte donc comme une couture. C'est optimiste, et c'est dit.
   ========================================================================== */
const SIM_COULOIR=2.0;          // mm ; largeur du couloir, depuis le bord du cuivre

/* ==========================================================================
   LES COTES DU VIA, CÔTÉ VISIONNEUSE
   --------------------------------------------------------------------------
   MÊME BESOIN QUE DANS L'ÉDITEUR, MAIS UNE SOURCE PLUS PAUVRE. L'éditeur tient
   un objet via avec son perçage et sa pastille ; l'IPC-2581, lui, porte des
   TROUS d'un côté et des PASTILLES de l'autre, et c'est à nous de les
   rapprocher par leur position. C'est déjà ce que fait le chemin DC, dont on
   reprend les deux règles :

     · un trou marqué NON métallisé ne joint rien — on ne l'accroche pas ;
     · à défaut de trou déclaré, une pastille présente sur les deux couches
       vaut un tube, et le perçage se déduit de la pastille moins un anneau de
       0,25 mm de part et d'autre. C'est un repli, et il repart marqué comme
       tel : le serveur ne dira « cotes supposées » que si on ne lui donne
       rien, donc c'est ICI qu'il faut être honnête.

   ON N'ENVOIE PAS LA HAUTEUR. Le serveur la calcule depuis l'empilage qu'on
   lui envoie ; une seconde définition ici finirait par en dire autre chose.
   ========================================================================== */
const SIM_TOL_VIA_IPC = 0.02;           /* mm — la tolérance de raccord du serveur */

function simViaAuRaccordIpc(N, x, y, cuA, cuB){
  if(!N) return null;
  const k = simKUnite();
  const pres = (a, b) => Math.abs(a - b) <= SIM_TOL_VIA_IPC;

  /* 1. Un trou déclaré, et métallisé. C'est la meilleure source : le perçage
        y est écrit, il ne se déduit pas. */
  for(const t of (N.trous || [])){
    /* LA POSITION D'ABORD, LE PLACAGE ENSUITE, et l'ordre inverse etait un
       defaut : « ce trou-ci n'est pas metallise » rendait null pour TOUTE la
       fonction, donc un seul trou nu quelque part sur le net -- un trou de
       fixation, un point de test -- empechait de reconnaitre le via a l'autre
       bout de la piste. Le placage ne dit rien du trou qu'on cherche tant
       qu'on n'a pas verifie que c'est bien celui-la. */
    if(!pres(t.x * k, x) || !pres(t.y * k, y)) continue;
    if(/NON/i.test(t.p || "")) return null;      /* nu : il ne joint rien */
    const d = Math.max((t.d || 0) * k, 0.05);
    let pastille = 0;
    for(const q of (N.pads || []))
      if(pres(q.x * k, x) && pres(q.y * k, y))
        pastille = Math.max(pastille, (q.d || 0) * k);
    /* LA PASTILLE DU PADSTACK, faute de pastille de composant au même
       endroit — et l'aveu qui va avec : sans définition dans le fichier,
       `ipc2581_parser.py` la fabrique à « perçage + 0,3 mm ». */
    let sup = false;
    if(!(pastille > 0)){
      const ps = (V.modele && V.modele.padstacks) ? V.modele.padstacks[t.ps]
                                                  : null;
      if(ps && ps.pad > 0){ pastille = ps.pad * k; sup = !!ps.pad_sup; }
    }
    /* ON N'ENVOIE PAS UNE PASTILLE QU'ON N'A PAS. `d * 2,5` était le repli du
       serveur recopié ici : le chiffre ne changeait pas, mais il arrivait
       déclaré par la page, ce qui faisait taire la mention « supposée ». Voir
       `simViasIpc`, où le même défaut vivait. */
    const fiche = {drill_diameter: d};
    if(pastille > 0){
      fiche.pad_diameter = pastille;
      if(sup) fiche.pad_diameter_supposee = true;
    }
    return fiche;
  }

  /* 2. Pas de trou déclaré : deux pastilles au même endroit valent un tube.
        Le perçage se déduit, et c'est un repli — la pastille, elle, est lue. */
  let pastille = 0, combien = 0;
  for(const q of (N.pads || []))
    if(pres(q.x * k, x) && pres(q.y * k, y)){
      combien++;
      pastille = Math.max(pastille, (q.d || 0) * k);
    }
  if(combien < 2 || !(pastille > 0)) return null;
  return {drill_diameter: Math.max(pastille - 0.5, 0.05),
          /* DÉDUIT, DONC DÉCLARÉ DÉDUIT. La pastille est lue dans le fichier,
             le perçage ne l'est pas : il se devine à un demi-millimètre de
             moins, ce qui est un usage, pas une cote. */
          drill_diameter_supposee: true,
          pad_diameter: pastille};
}

/* ==========================================================================
   LES JONCTIONS DU NET, ET POURQUOI LE RACCORD NE SE MESURE PAS ENTRE PISTES
   --------------------------------------------------------------------------
   CE QUE MONTRE UN VRAI FICHIER. Sur une carte exportée par un flot courant,
   les bouts de piste qui arrivent à un via s'arrêtent tous à UN DIAMÈTRE DE
   PASTILLE du centre — mesuré : 0,5500 mm des quatre côtés d'un via de
   pastille 0,55, perçage 0,25, anneau 0,15, à la quatrième décimale. Ce n'est
   pas du bruit d'arrondi, c'est une convention d'exportateur. Il reste donc,
   dans le document, un quart de millimètre sans cuivre déclaré entre le bout
   de la piste et le bord de l'anneau.

   AUCUNE TOLÉRANCE DE RACCORD NE FRANCHIT CELA HONNÊTEMENT. Il faudrait la
   monter au demi-millimètre, et à ce compte-là elle joindrait des pistes qui
   n'ont rien à voir ensemble. Le raccord ne se mesure pas entre deux bouts de
   piste : il se fait PAR UNE JONCTION — un via, une pastille —, et c'est la
   jonction qu'il faut chercher.

   ET C'EST LE NET QUI REND LA RÈGLE SÛRE. On ne regarde que les jonctions du
   net de la piste : deux bouts qui désignent la même pastille de leur propre
   net sont reliés, et rien de ce qui traîne à côté ne peut les tromper. Sur le
   cas mesuré la règle tombe juste six fois sur six, sans seuil : chaque bout
   côté via a son perçage à 0,55 mm quand le bout de piste voisin est à 0,67,
   et les deux vrais bouts de la liaison sont à 0,0000 d'une pastille de
   composant.

   `SIM_RAYON_JONCTION_IPC` n'est donc PAS le critère : le critère est « la
   jonction la plus proche ». C'est un garde-fou, qui empêche un bout perdu au
   milieu de nulle part de s'accrocher à l'autre bout de la carte.
   ========================================================================== */
const SIM_RAYON_JONCTION_IPC = 1.5;     /* mm — garde-fou, pas critère */

function simJonctionsIpc(N){
  const k = simKUnite(), out = [], vus = new Map();
  /* Groupées par lieu au centième de millimètre : un perçage tombe presque
     toujours SOUS une pastille, et les compter deux fois ferait deux nœuds
     là où il n'y a qu'un tube. C'est la clé du chemin DC, et pour la même
     raison. */
  const cle = (x, y) => Math.round(x * 100) + "/" + Math.round(y * 100);
  for(const t of ((N && N.trous) || [])){
    /* Un trou NON métallisé ne joint rien — même règle que partout ailleurs
       dans cette page. */
    if(/NON/i.test(t.p || "")) continue;
    const x = t.x * k, y = t.y * k, c = cle(x, y);
    if(vus.has(c)) continue;
    const j = {x: x, y: y, percage: Math.max((t.d || 0) * k, 0.05),
               pastille: 0, pastilleSup: false, perce: true};
    /* LA PASTILLE DU PERÇAGE SE LIT DANS SON PADSTACK — et il faut savoir si
       le fichier la déclare ou si le lecteur l'a devinée. Faute de définition,
       `ipc2581_parser.py` en fabrique une à « perçage + 0,3 mm », soit un
       anneau de 0,15 posé par convention. C'est un repli honnête pour
       dessiner ; ce n'est pas une cote, et la faire entrer dans la capacité
       d'un via sans le dire reviendrait à inventer un chiffre. */
    const ps = (V.modele && V.modele.padstacks) ? V.modele.padstacks[t.ps]
                                                : null;
    if(ps && ps.pad > 0){
      j.pastille = ps.pad * k;
      j.pastilleSup = !!ps.pad_sup;
    }
    vus.set(c, j); out.push(j);
  }
  for(const q of ((N && N.pads) || [])){
    const x = q.x * k, y = q.y * k, c = cle(x, y);
    let j = vus.get(c);
    if(!j){ j = {x: x, y: y, percage: 0, pastille: 0, pastilleSup: false,
                 perce: false};
            vus.set(c, j); out.push(j); }
    /* UNE PASTILLE DE COMPOSANT EST LUE DANS LE FICHIER : elle l'emporte sur
       une pastille de via devinée, et pas seulement parce qu'elle est plus
       grande. */
    const d = (q.d || 0) * k;
    if(j.pastilleSup && d > 0){
      /* UNE COTE LUE REMPLACE UNE COTE DEVINÉE, elle ne se compare pas à elle.
         Prendre « la plus grande des deux » gardait le 0,90 mm que le lecteur
         avait fabriqué contre le 0,60 mm écrit dans le fichier — et effaçait
         au passage la mention « supposé », ce qui est le pire des deux : le
         chiffre inventé restait, et il ne se présentait plus comme tel. */
      j.pastille = d;
      j.pastilleSup = false;
    }else if(d > j.pastille){
      j.pastille = d;
    }
  }
  return out;
}

/* LA JONCTION COMMUNE À DEUX BOUTS. On prend celle qui minimise la distance au
   PLUS ÉLOIGNÉ des deux — un via au milieu de deux bouts symétriques gagne
   contre une pastille collée à l'un et loin de l'autre, ce qui est bien ce
   qu'on veut : la jonction cherchée est celle qui les joint TOUS LES DEUX. */
function simJoncCommuneIpc(jonctions, p, q){
  let mieux = null, md = Infinity;
  for(const j of jonctions){
    const d = Math.max(Math.hypot(j.x - p[0], j.y - p[1]),
                       Math.hypot(j.x - q[0], j.y - q[1]));
    if(d < md){ md = d; mieux = j; }
  }
  return (mieux && md <= SIM_RAYON_JONCTION_IPC) ? mieux : null;
}

/* Deux bouts vraiment confondus font une jonction à eux seuls, sans cote. Ce
   n'est pas le cas d'un fichier exporté — voir plus haut —, mais c'est celui
   d'un document écrit à la main, et le raccord doit partir quand même. */
function simJoncDeBoutsIpc(p, q){
  if(Math.abs(p[0] - q[0]) > SIM_TOL_VIA_IPC ||
     Math.abs(p[1] - q[1]) > SIM_TOL_VIA_IPC) return null;
  return {x: (p[0] + q[0]) / 2, y: (p[1] + q[1]) / 2,
          percage: 0, pastille: 0, perce: false};
}

/* Le rayon de recherche d'un via de masse, en millimètres — le même que côté
   éditeur : au-delà, un retour ne referme plus grand-chose. */
const SIM_RAYON_RETOUR_IPC = 3.0;

/* Les vias de masse autour d'un via de signal.

   CE QUE L'IPC-2581 NE DIT PAS, ET IL FAUT LE DIRE. Un perçage y porte sa
   position, son diamètre et son net — mais PAS SA PORTÉE : rien n'y distingue
   un via traversant d'un via enterré. On les envoie donc en les supposant
   traversants, avec `portee_supposee`, et le panneau le répète. Supposer sans
   le dire ferait passer un via enterré — qui ne referme pas la boucle et qui
   donnerait une inductance trop petite de près de vingt pour cent — pour un
   retour valable.

   Un trou NON métallisé ne joint rien : c'est la même règle que pour le via de
   signal, et que pour le chemin du courant continu. */
function simRetoursIpc(x, y, cuMax){
  const refs = simRefIdx();
  if(!refs || !refs.size) return [];
  const k = simKUnite();
  const out = [];
  for(const n of V.parNet){
    if(!n.nom || !refs.has(n.i)) continue;
    for(const t of (n.trous || [])){
      if(/NON/i.test(t.p || "")) continue;
      const tx = t.x * k, ty = t.y * k;
      const d = Math.hypot(tx - x, ty - y);
      if(!(d > SIM_TOL_VIA_IPC) || d > SIM_RAYON_RETOUR_IPC) continue;
      out.push({x: Math.round(tx * 1000) / 1000, y: Math.round(ty * 1000) / 1000,
                layer_from: 0, layer_to: simRangCu(cuMax),
                drill_diameter: Math.max((t.d || 0) * k, 0.05),
                /* PAS DE PASTILLE FABRIQUÉE ICI NON PLUS. Le perçage du via de
                   masse est lu ; sa pastille ne l'est pas, et `× 2,5` n'était
                   qu'un ordre de grandeur déguisé en cote. */
                pad_diameter_supposee: true,
                pad_diameter: Math.max((t.d || 0) * k, 0.05) * 2.5,
                net: n.nom, portee_supposee: true});
    }
  }
  out.sort((a, b) => Math.hypot(a.x - x, a.y - y) -
                     Math.hypot(b.x - x, b.y - y));
  return out;
}

/* LES VIAS DE LA SÉLECTION, AU FORMAT DU SERVEUR — format « cao-sim-em-3 ».

   POURQUOI UNE LISTE À PART. Un via n'existait pour le calcul que s'il tombait
   entre deux tronçons CONSÉCUTIFS d'un parcours unique. Sur un net qui se
   ramifie il n'y a pas de parcours, donc pas de via, donc aucun chemin de
   retour — alors que le via est là, avec ses coordonnées et son perçage. Or
   son retour ne doit rien à l'ordre des tronçons.

   ON ENVOIE DONC LES DEUX. Les tronçons dans leur ordre, pour la cascade ; les
   vias sans ordre, pour le retour. Le serveur écarte ceux que la chaîne a déjà
   pris — un même via chiffré deux fois donnerait deux valeurs.

   LA PORTÉE EST SUPPOSÉE TRAVERSANTE, comme partout ailleurs sur cette page :
   l'IPC-2581 ne déclare pas les couches d'un perçage. */
function simViasIpc(N){
  if(!N) N = V.parNet ? V.parNet[V.net] : null;
  if(!N) return [];
  const cuMax = Math.max(0, (LT.pret ? LT.cu.length : 1) - 1);
  const out = [];
  for(const v of (SIM_CHAINE_IPC.vias || [])){
    /* Les couches relevées sont celles du MODÈLE ; le serveur compte en rangs
       d'empilage. Une couche absente de l'empilage n'a pas d'altitude, donc
       pas de via : on préfère n'en pas parler. */
    const cu = v.couches.map(simCuDe).filter(k => k >= 0);
    if(cu.length < 2) continue;
    const lo = Math.min(...cu), hi = Math.max(...cu);
    if(lo === hi) continue;
    const fiche = {x: Math.round(v.x * 1000) / 1000,
                   y: Math.round(v.y * 1000) / 1000,
                   layer_from: simRangCu(lo), layer_to: simRangCu(hi),
                   retours: simRetoursIpc(v.x, v.y, cuMax),
                   portee_supposee: true};
    /* LES COTES NE S'INVENTENT PAS — ET C'EST ICI QU'ELLES S'INVENTAIENT.

       CE QUE FAISAIT LA VERSION PRÉCÉDENTE. Faute de pastille connue, elle
       envoyait `perçage × 2,5` : très exactement le repli que le serveur
       applique lui-même quand la page ne dit rien. Le chiffre était donc le
       même — mais il arrivait DÉCLARÉ PAR LA PAGE. Or c'est là-dessus que
       `_cotes_via` se fonde pour écrire la provenance : `pad_diameter`
       présent vaut « page », absent vaut « repli ». En fabriquant la valeur,
       la page passait `pastille_source` de « repli » à « page » et
       `cotes_supposees` à faux. Le résultat ne changeait pas d'un micron ;
       ce qui changeait, c'est que la fiche cessait de prévenir. Une supposition
       qui se présente comme une mesure est pire qu'une supposition.

       ON N'ENVOIE DONC QUE CE QU'ON A. Rien pour la pastille inconnue — le
       serveur reprend son repli et le DIT ; la pastille du fichier quand elle
       existe ; et celle que le lecteur a devinée, marquée comme telle. */
    if(v.perce && v.percage > 0){
      fiche.drill_diameter = v.percage;
      if(v.pastille > 0){
        fiche.pad_diameter = v.pastille;
        if(v.pastilleSup) fiche.pad_diameter_supposee = true;
      }
    }else if(v.pastille > 0){
      /* UNE PASTILLE SANS PERÇAGE VAUT UN TUBE, et le perçage s'en déduit —
         c'est la règle de `simViaAuRaccordIpc`, et elle doit rester la même
         des deux côtés. Déduite, elle se déclare déduite. */
      fiche.drill_diameter = Math.max(v.pastille - 0.5, 0.05);
      fiche.drill_diameter_supposee = true;
      fiche.pad_diameter = v.pastille;
      if(v.pastilleSup) fiche.pad_diameter_supposee = true;
    }
    out.push(fiche);
  }
  return out;
}

function simAccrocherViasIpc(envoi,N){
  if(!N) N = V.parNet ? V.parNet[V.net] : null;
  if(!N) return 0;
  const jonctions = simJonctionsIpc(N);
  const cuMax = Math.max(0, (LT.pret ? LT.cu.length : 1) - 1);
  let poses = 0;
  for(let i = 1; i < envoi.length; i++){
    const a = envoi[i - 1], b = envoi[i];
    if(a.layer === b.layer) continue;
    const p = a.end, q = b.start;
    if(!p || !q) continue;
    /* LE VIA SE CHERCHE À LA JONCTION, PAS LÀ OÙ DEUX BOUTS COÏNCIDENT — et
       c'était le défaut. Exiger que la fin d'un tronçon rejoigne le début du
       suivant à 20 µm suppose que l'exportateur fasse toucher les deux, ce
       qu'il ne fait pas : il arrête chaque piste à un diamètre de pastille du
       centre du via. Le test échouait donc TOUJOURS sur un vrai fichier, et
       avec lui partaient les cotes du via, sa position, et les vias de masse
       voisins — donc le chevelu du retour. */
    /* À DÉFAUT DE JONCTION, DEUX BOUTS QUI COÏNCIDENT EN FONT UNE. Le
       changement de couche existe indépendamment de ce qu'on sait du via : ses
       deux tronçons se raccordent quelque part, et ce quelque part suffit à
       mesurer les écarts et à chercher les vias de masse. Ce repli ne porte
       aucune cote — `simViaAuRaccordIpc` n'y trouvera rien, et c'est juste :
       inventer un perçage serait pire que de n'en pas donner. */
    const j = simJoncCommuneIpc(jonctions, p, q) || simJoncDeBoutsIpc(p, q);
    if(!j) continue;
    /* `layer` est un indice d'EMPILAGE ; les couches de cuivre se comptent en
       le divisant par deux, comme `simRangCu` l'a produit. */
    /* LE VIA PART MEME QUAND SES COTES SONT INCONNUES, et c'était le défaut :
       on n'envoyait rien du tout tant que le perçage n'était pas identifié —
       donc ni la position, ni les vias de masse voisins. Le serveur en
       concluait « aucun via de masse ne referme la boucle », ce qui est une
       affirmation SUR LA CARTE là où on n'avait simplement pas cherché. Or le
       changement de couche existe indépendamment : ses deux tronçons se
       raccordent quelque part, et ce quelque part suffit à mesurer les écarts.
       Les cotes manquantes ne touchent que le perçage et la pastille, qui ont
       leurs replis annoncés. */
    const trouve = simViaAuRaccordIpc(N, j.x, j.y, a.layer / 2, b.layer / 2);
    const via = trouve || {};
    /* LE POINT DU VIA EST CELUI DE LA JONCTION, et non le bout de la piste :
       c'est de là que partent le chevelu et la recherche des vias de masse.
       Prendre le bout de piste décalerait les deux d'un demi-millimètre, et le
       chevelu désignerait un point où il n'y a pas de via. */
    via.x = Math.round(j.x * 1000) / 1000;
    via.y = Math.round(j.y * 1000) / 1000;
    via.retours = simRetoursIpc(j.x, j.y, cuMax);
    b.via = via;
    if(trouve) poses++;
  }
  return poses;
}

function simCoutureIpc(entrees,refs){
  if(!refs.size||!entrees.length)return null;
  const k=simKUnite();
  const trous=[];
  for(const n of V.parNet)
    if(n.nom&&refs.has(n.i))for(const t of n.trous)trous.push(t);
  /* AUCUN PERÇAGE DE MASSE SUR LA CARTE : on ne rend pas pour autant « rien à
     signaler ». La boucle qui suit s'en charge et compte un trou de la longueur
     entière pour chaque côté qui porte du cuivre — c'est exactement ce qu'il
     faut dire, et c'est le même verdict que côté éditeur PCB. */

  let n=0, pire=0, vu=false;
  for(const e of entrees){
    const demi=(e.piste.w||0)/2;
    for(const signe of [1,-1]){
      if(signe>0&&!e.cotes.g)continue;
      if(signe<0&&!e.cotes.d)continue;
      vu=true;
      const pos=[];
      for(const t of trous){
        const pr=simProjPoly(e.piste.p,e.cum,t.x,t.y);
        if(!pr)continue;
        if(signe*pr.cote<0)continue;
        if(((pr.d-demi-(t.d||0)/2)*k)>SIM_COULOIR)continue;
        pos.push(pr.s*k);
      }
      n+=pos.length;
      /* Aucune couture de ce côté : le trou vaut toute la longueur de la
         piste. C'est bien ce qu'il faut dire — pas « rien à signaler ». */
      if(!pos.length){pire=Math.max(pire,e.total); continue;}
      pos.sort((a,b)=>a-b);
      let m=pos[0];                        // du bout au premier via
      for(let i=1;i<pos.length;i++)m=Math.max(m,pos[i]-pos[i-1]);
      m=Math.max(m,e.total-pos[pos.length-1]);   // du dernier à l'autre bout
      pire=Math.max(pire,m);
    }
  }
  if(!vu)return null;
  return {n:n, ecartMax:Math.round(pire*1000)/1000, couloir:SIM_COULOIR};
}

/* Les pistes qu'UNE désignation couvre, avec leur couche.

   `vus` porte les objets du modèle déjà pris : deux entrées de la sélection se
   recouvrent souvent — on clique une piste, puis Ctrl+Maj+clic prend son net
   entier — et la même piste envoyée deux fois se serait chaînée avec elle-même. */
function simZPistesDe(s,mev,out,vus){
  out=out||[]; vus=vus||new Set();
  if(!V.modele||!LT.pret||!s)return out;
  mev=mev||mdlMevTout();
  const pousser=function(src,e){
    if(vus.has(src))return;
    vus.add(src); out.push(e);
  };
  /* Une piste désignée, sans Maj : elle seule. C'est la réponse à « qu'est-ce
     qui court ici », et c'est le geste le plus fréquent. */
  if(s.type==="piste"&&mev.couche>=0){
    pousser(s.piste,{piste:s.piste, couche:s.couche});
    return out;
  }
  /* Sinon le net entier. Les perçages n'ont pas d'impédance de ligne. */
  const net=(s.net!=null&&s.net>=0)?s.net:-1;
  if(net<0||mev.quoi==="trous"||mev.seul)return out;
  const n=V.parNet[net];
  if(!n)return out;
  for(const p of n.pistes)
    if(mev.couche<0||p.c===mev.couche)pousser(p,{piste:p, couche:p.c});
  /* LES ARCS SONT DU CUIVRE COMME LE RESTE. Les laisser dehors coupait la
     liaison en morceaux qui ne se touchent pas — voir `simArcEnPolyligne`.
     On les plie en polylignes et on les traite comme des pistes ; le chaînage
     (`simChainePistes`) les remet ensuite à leur place dans le parcours, ce
     qu'aucune des deux collections ne dit à elle seule. */
  for(const a of (n.arcs||[])){
    if(!(mev.couche<0||a.c===mev.couche))continue;
    const pts=simArcEnPolyligne(a);
    if(!pts)continue;
    pousser(a,{piste:{c:a.c, n:a.n, w:a.w, p:pts, arc:a}, couche:a.c});
  }
  return out;
}

/* Les pistes que la portée courante désigne, avec leur couche.

   LA LISTE DE SÉLECTION COMMANDE quand elle porte quelque chose : c'est elle
   qui sait ce que Ctrl+clic a empilé. Le repli sur `V.survol` et `V.net` reste
   pour ce qui les pose sans passer par elle — un banc d'essai, et tout code
   d'avant la sélection multiple. */
function simZPistes(){
  if(V.sel&&V.sel.length){
    const out=[], vus=new Set();
    for(const e of V.sel)simZPistesDe(e.s,e.mev,out,vus);
    return out;
  }
  const s=(V.survol&&V.survol.type==="piste")
    ? V.survol : {type:"net", net:V.net};
  return simZPistesDe(s,V.mev);
}

/* ==========================================================================
   DÉCOUPER LA SÉLECTION EN PARCOURS CONTINUS — LES LOTS
   --------------------------------------------------------------------------
   POURQUOI ON DÉCOUPE. Une ligne RF de 50 Ω coupée par trois condensateurs de
   liaison, c'est quatre morceaux de cuivre sur quatre nets. Envoyés dans un
   seul document, ils forment une liste que le serveur voit rompue : il refuse
   la cascade, et à juste titre — la sortie de l'un n'est pas l'entrée du
   suivant, il y a un boîtier entre les deux. Envoyés en quatre documents, ils
   rendent quatre résultats justes, comparables ligne à ligne, et c'est la
   réponse à la question qu'on posait : « fait-elle 50 Ω partout ? »

   CE QUI FAIT UN LOT : le même net, et du cuivre qui se touche. Deux bouts au
   même point sur deux couches différentes se touchent aussi — c'est un via, et
   c'est la même règle que `simChainePistes` applique pour chaîner. Un net qui
   se ramifie reste donc UN lot, avec l'arrêt de marche que le panneau annonce
   déjà : on ne découpe pas les branches, on découpe ce qui ne se touche pas.

   ON NE DÉCOUPE QUE CE QUI A ÉTÉ DÉSIGNÉ SÉPARÉMENT. Un seul clic — même
   Maj+clic sur un net entier — rend un seul lot, exactement comme avant : un
   net de masse dont le cuivre est en cinquante îlots ne doit pas partir en
   cinquante requêtes parce qu'on l'a effleuré. Voir `problemes`.
   ========================================================================== */
const SIM_LOTS_MAX=16;          // au-delà, on ne compare plus, on inonde

function simLotsDePistes(liste){
  const k=simKUnite();
  const n=liste.length;
  const parent=new Array(n);
  for(let i=0;i<n;i++)parent[i]=i;
  const chef=function(i){while(parent[i]!==i){parent[i]=parent[parent[i]];i=parent[i];}return i;};
  const joindre=function(a,b){a=chef(a);b=chef(b);if(a!==b)parent[b]=a;};
  const bouts=liste.map(e=>simBoutsPiste(e.piste,k));
  const tol=SIM_TOL_CHAINE_IPC;
  for(let i=0;i<n;i++){
    if(!bouts[i])continue;
    for(let j=i+1;j<n;j++){
      if(!bouts[j])continue;
      /* LE NET D'ABORD : deux pistes de nets différents qui se croisent sur
         deux couches ne sont pas la même liaison, même si leurs bouts
         coïncident au micron. C'est le cas d'un via qui passe au ras d'une
         pastille voisine, et il est fréquent sur une carte dense. */
      if(liste[i].piste.n!==liste[j].piste.n)continue;
      let touche=false;
      for(const a of bouts[i])
        for(const b of bouts[j])
          if(Math.abs(a.x-b.x)<=tol&&Math.abs(a.y-b.y)<=tol)touche=true;
      if(touche)joindre(i,j);
    }
  }
  /* DANS L'ORDRE OÙ ON A CLIQUÉ : le lot 1 du tableau doit être le premier
     morceau pris, sinon les numéros ne désignent rien de reconnaissable. */
  const rangs=new Map(), lots=[];
  for(let i=0;i<n;i++){
    const c=chef(i);
    if(!rangs.has(c)){rangs.set(c,lots.length);lots.push([]);}
    lots[rangs.get(c)].push(liste[i]);
  }
  return lots;
}

/* Le parcours, remis dans l'ordre où le courant le suit.

   L'ORDRE DU FICHIER N'EST PAS L'ORDRE DU PARCOURS, et c'était le défaut de
   fond de cet outil. `simZPistes` rend les pistes du net dans l'ordre où
   l'IPC-2581 les a écrites, et le sens de chaque polyligne y est arbitraire :
   rien dans le format ne dit par quel bout on entre. Tout ce qui suit
   supposait pourtant une chaîne parcourue dans l'ordre envoyé. Trois choses en
   tombaient à la fois, et elles avaient l'air de trois défauts distincts :

     · LES RACCORDS. Deux tronçons voisins dans la liste ne se touchaient pas,
       et le panneau annonçait « la sélection n'est pas un parcours continu »
       devant une liaison parfaitement continue ;
     · LES COUDES. L'angle se prend entre les vecteurs départ->arrivée. Une
       piste écrite à l'envers donnait un coude de 168°, c'est-à-dire un
       demi-tour, là où le cuivre est presque droit ;
     · LES VIAS, et c'est le plus coûteux. `simAccrocherViasIpc` ne pose un via
       que là où la fin d'un tronçon rejoint le début du suivant. Ce test
       échouait, donc AUCUN via n'était posé — donc ni son perçage, ni sa
       pastille, ni sa portée, ni les vias de masse voisins ne partaient. Le
       serveur les remplaçait par des replis et disait « non envoyé », ce qui
       était vrai mais ne disait pas pourquoi.

   ON CHAÎNE DONC PAR LES EXTRÉMITÉS, en retournant les pistes qu'il faut. Deux
   bouts au même point sont un raccord ; deux bouts au même point sur des
   couches différentes sont un via, et c'est le même test — c'est justement ce
   qui fait qu'un via se pose tout seul une fois la chaîne dans l'ordre.

   ON NE FORCE RIEN. Un nœud où trois pistes se rejoignent est une DÉRIVATION :
   il n'y a plus de parcours unique, et en choisir un au hasard rendrait des
   paramètres S qui ont l'air justes. La marche s'arrête là ; ce qui reste part
   dans l'ordre du fichier, et le serveur continue d'annoncer les raccords
   manquants. Une sélection éparse doit rester visiblement éparse. */
const SIM_TOL_CHAINE_IPC = 0.02;        /* mm — la tolérance du serveur */

/* CE QUE LA MARCHE A RENCONTRÉ, gardé pour que le panneau puisse le DIRE.

   UNE ABSENCE NE S'EXPLIQUE PAS TOUTE SEULE. Sur un net qui se ramifie — un
   bus I²C qui dessert trois boîtiers, le cas ordinaire — le parcours n'est pas
   unique, la marche s'arrête, et il n'y a ni via accroché ni chevelu du
   retour. C'est le bon comportement : choisir une branche rendrait des
   paramètres S qui ont l'air justes en ignorant des moignons qui chargent
   réellement la ligne. Mais rien à l'écran ne distinguait ce silence-là d'un
   défaut, et c'est ce qui le rendait illisible : on voit un chevelu manquant,
   pas une décision.

   On retient donc OÙ la marche s'est arrêtée et COMBIEN de branches s'y
   rejoignent. Le point est celui du nœud, donc du via ou de la pastille — de
   quoi le montrer sur la carte plutôt que de le décrire. */
let SIM_CHAINE_IPC = {arrets: [], orphelines: 0, vias: []};

function simBoutsPiste(piste, k){
  const t = piste && piste.p;
  if(!t || t.length < 4) return null;
  return [{x: t[0] * k, y: t[1] * k},
          {x: t[t.length - 2] * k, y: t[t.length - 1] * k}];
}

function simChainePistes(liste){
  const n = liste.length;
  SIM_CHAINE_IPC = {arrets: [], orphelines: 0, vias: []};
  if(n < 2) return liste.map(e => ({piste: e.piste, couche: e.couche,
                                    retourne: false}));
  const k = simKUnite();
  const bouts = liste.map(e => simBoutsPiste(e.piste, k));

  /* Les nœuds : un point du plan, et les bouts de piste qui s'y rejoignent.

     GROUPÉS PAR TOLÉRANCE, ET NON PAR ÉGALITÉ — et c'était LE défaut de cet
     outil. La version précédente rangeait chaque bout dans un casier dont la
     clé était la coordonnée arrondie au micron, en la disant « vingt fois plus
     fine que la tolérance de raccord ». Un casier n'est pas une tolérance :
     deux bouts distants de trois microns qui tombent de part et d'autre d'une
     graduation vont dans DEUX casiers, et ne se rejoignent jamais. La
     tolérance effective était donc ZÉRO, et `SIM_TOL_CHAINE_IPC` — déclaré
     juste au-dessus, commenté « la tolérance du serveur » — n'était employé
     nulle part.

     L'ÉDITEUR PCB NE VOIT PAS CE DÉFAUT, et c'est ce qui l'a caché : il ne
     chaîne pas, il envoie la sélection dans son ordre, et ses pistes sont
     accrochées à la grille, donc leurs bouts coïncident au bit près. Un
     IPC-2581 porte des coordonnées lues dans un fichier texte, souvent en
     pouces multipliés par 25,4 : les deux bouts d'un même via y diffèrent
     presque toujours de quelques microns.

     ET QUAND LA MARCHE S'ARRÊTE, TOUT TOMBE ENSEMBLE. Les pistes non vues
     repartent dans l'ordre du fichier, avec leur sens d'origine : le serveur
     annonce des raccords manquants, une piste écrite à l'envers donne un coude
     de 168° — un demi-tour sur du cuivre presque droit —, aucun via ne
     s'accroche, donc ni ses cotes ni les vias de masse voisins ne partent, et
     le chevelu du retour n'a plus rien à dessiner. Quatre symptômes qui ont
     l'air de quatre défauts.

     ON COMPARE DONC AXE PAR AXE, comme le fait `simAccrocherViasIpc` et comme
     le fait le serveur : les trois doivent s'accorder, sans quoi la chaîne
     poserait un raccord là où l'accrochage ne pose pas de via. Le groupement
     est glouton — un bout rejoint le premier nœud qui le contient, sinon il en
     ouvre un — et quadratique dans le nombre de pistes du net, ce qui ne coûte
     rien à cette échelle et se lit. */
  /* LES JONCTIONS DU NET SONT DES NŒUDS À PART ENTIÈRE, et c'est ce qui fait
     marcher le chaînage sur un fichier réel. Un bout de piste qui arrive à un
     via ne touche pas le bout d'en face : il s'arrête à un diamètre de
     pastille du centre. Ce qui les joint est le via, et c'est donc au via
     qu'il faut rattacher les deux. On ne regarde que les jonctions DU NET —
     voir `simJonctionsIpc` — ce qui est ce qui rend la règle sûre. */
  const jonctions = simJonctionsIpc(V.parNet ? V.parNet[V.net] : null);
  const centres = jonctions.map(j => ({x: j.x, y: j.y}));
  const noeuds = jonctions.map(() => []);
  const fixes = centres.length;         /* au-delà : les nœuds de tolérance */

  /* `rangs[i][b]` : le nœud du bout `b` de la piste `i`, ou −1 si la piste
     n'a pas de bouts exploitables. */
  const rangs = [];
  for(let i = 0; i < n; i++) rangs.push([-1, -1]);

  /* 1. CHAQUE BOUT REJOINT SA JONCTION LA PLUS PROCHE. Le critère est « la
        plus proche », pas un seuil : `SIM_RAYON_JONCTION_IPC` n'est là que
        pour empêcher un bout perdu de s'accrocher à l'autre bout de la carte.

        DEUX BOUTS D'UNE MÊME PISTE NE PARTAGENT PAS UNE JONCTION. Sans cette
        règle, une piste courte dont les deux bouts voient la même pastille s'y
        replierait sur elle-même — mesuré sur un vrai fichier : un tronçon de
        0,3 mm dont le bout libre est SUR sa pastille et l'autre bout à 0,55 mm
        du via voisin, mais à 0,31 mm de cette même pastille. Le plus proche
        des deux garde la jonction, l'autre prend son second choix. */
  /* ET LA JONCTION NE PREND PAS LE PAS SUR DU CUIVRE QUI SE TOUCHE VRAIMENT.
     Un bout confondu avec un autre bout est raccordé, point : l'envoyer vers
     une pastille plus loin ferait converger sur un nœud des bouts que rien ne
     joint. Le critère est la TOLÉRANCE DE RACCORD, et rien d'autre.

     PREMIÈRE VERSION, ET POURQUOI ELLE ÉTAIT FAUSSE : elle comparait la
     distance à la jonction à celle du bout de piste le plus proche, quel qu'il
     soit. Or deux bouts voisins n'ont pas forcément affaire ensemble — mesuré
     sur un bus qui dessert trois boîtiers, deux branches passent à 0,4210 mm
     l'une de l'autre en montant vers LE MÊME via, à 0,55 mm. Le voisin gagnait,
     les deux branches perdaient leur via, et le changement de couche
     disparaissait. « Plus proche qu'un voisin quelconque » n'est pas un
     critère ; « posé sur le même cuivre » en est un. */
  const touche = (i, b) => {
    const q = bouts[i][b];
    for(let u = 0; u < n; u++){
      if(u === i || !bouts[u]) continue;
      for(let v = 0; v < 2; v++)
        if(Math.abs(bouts[u][v].x - q.x) <= SIM_TOL_CHAINE_IPC &&
           Math.abs(bouts[u][v].y - q.y) <= SIM_TOL_CHAINE_IPC) return true;
    }
    return false;
  };
  const classe = (i, b) => {
    if(!bouts[i] || touche(i, b)) return [];
    const q = bouts[i][b];
    return jonctions
      .map((j, x) => ({x: x, d: Math.hypot(j.x - q.x, j.y - q.y)}))
      .filter(e => e.d <= SIM_RAYON_JONCTION_IPC)
      .sort((u, v) => u.d - v.d);
  };
  for(let i = 0; i < n; i++){
    if(!bouts[i]) continue;
    const c0 = classe(i, 0), c1 = classe(i, 1);
    let j0 = c0.length ? c0[0] : null, j1 = c1.length ? c1[0] : null;
    if(j0 && j1 && j0.x === j1.x){
      if(j0.d <= j1.d) j1 = c1.length > 1 ? c1[1] : null;
      else             j0 = c0.length > 1 ? c0[1] : null;
    }
    if(j0){ rangs[i][0] = j0.x; noeuds[j0.x].push({i: i, b: 0}); }
    if(j1){ rangs[i][1] = j1.x; noeuds[j1.x].push({i: i, b: 1}); }
  }

  /* 2. CE QUI N'A PAS DE JONCTION SE GROUPE PAR TOLÉRANCE — le cuivre qui se
        touche vraiment, et le document écrit à la main qui ne porte ni via ni
        pastille. */
  const noeudDe = q => {
    for(let c = fixes; c < centres.length; c++)
      if(Math.abs(centres[c].x - q.x) <= SIM_TOL_CHAINE_IPC &&
         Math.abs(centres[c].y - q.y) <= SIM_TOL_CHAINE_IPC) return c;
    return -1;
  };
  for(let i = 0; i < n; i++){
    if(!bouts[i]) continue;
    for(let b = 0; b < 2; b++){
      if(rangs[i][b] >= 0) continue;
      let c = noeudDe(bouts[i][b]);
      if(c < 0){ c = centres.length; centres.push(bouts[i][b]); noeuds.push([]); }
      noeuds[c].push({i: i, b: b});
      rangs[i][b] = c;
    }
  }

  /* Le départ : un bout LIBRE, c'est-à-dire un vrai bout de liaison. À défaut
     — une boucle fermée, ou une sélection dont on ne voit pas les extrémités —
     on part du premier de la liste, ce qui vaut l'ordre du fichier. */
  let depart = null;
  for(let i = 0; i < n && !depart; i++){
    if(!bouts[i]) continue;
    for(let b = 0; b < 2; b++)
      if((noeuds[rangs[i][b]] || []).length === 1){
        depart = {i: i, b: b};            /* on entre par ce bout-là */
        break;
      }
  }
  if(!depart){
    if(!bouts[0]) return liste.map(e => ({piste: e.piste, couche: e.couche,
                                          retourne: false}));
    depart = {i: 0, b: 0};
  }

  const vus = new Array(n).fill(false);
  const suite = [];
  let cour = depart;
  while(cour && !vus[cour.i]){
    vus[cour.i] = true;
    /* On entre par le bout `b` : la piste part donc à l'endroit si `b` vaut 0,
       et à l'envers sinon. */
    suite.push({piste: liste[cour.i].piste, couche: liste[cour.i].couche,
                retourne: cour.b === 1});
    const sortie = rangs[cour.i][1 - cour.b];
    const voisins = (noeuds[sortie] || []).filter(v => !vus[v.i]);
    /* UN SEUL VOISIN, OU RIEN. Deux voisins au même point sont une dérivation :
       le parcours n'est plus unique et on s'arrête plutôt que de trancher. */
    if(voisins.length > 1 && centres[sortie])
      SIM_CHAINE_IPC.arrets.push({
        x: centres[sortie].x, y: centres[sortie].y,
        branches: (noeuds[sortie] || []).length,
        /* Un nœud PERCÉ est un via : c'est le repère qu'on peut nommer sur la
           carte. Une pastille de composant en est un aussi, et il faut les
           distinguer — « au via » et « à la pastille » ne se cherchent pas du
           même œil. */
        perce: sortie < fixes && !!jonctions[sortie].perce
      });
    cour = (voisins.length === 1) ? voisins[0] : null;
  }
  for(let i = 0; i < n; i++)
    if(!vus[i]){
      SIM_CHAINE_IPC.orphelines++;
      suite.push({piste: liste[i].piste, couche: liste[i].couche,
                  retourne: false});
    }

  /* LES VIAS DE LA SÉLECTION, RELEVÉS ICI ET NON DANS LA CHAÎNE. Une jonction
     où se rejoignent des bouts de piste de DEUX couches différentes est un
     via, que le parcours passe par elle ou non. C'est tout ce qu'il faut pour
     en chiffrer le chemin de retour : sa position, les couches qu'il joint,
     ses cotes. L'ordre des tronçons n'y entre pas — et c'est justement ce qui
     le rend calculable sur un net qui se ramifie, où il n'y a pas d'ordre. */
  for(let j = 0; j < fixes; j++){
    const cs = new Set();
    for(const e of noeuds[j]) cs.add(liste[e.i].couche);
    if(cs.size < 2) continue;
    SIM_CHAINE_IPC.vias.push({x: jonctions[j].x, y: jonctions[j].y,
                              perce: !!jonctions[j].perce,
                              percage: jonctions[j].percage,
                              pastille: jonctions[j].pastille,
                              pastilleSup: !!jonctions[j].pastilleSup,
                              couches: [...cs].sort((u, v) => u - v)});
  }
  return suite;
}

/* Les tronçons à envoyer, et les objets alignés dessus.

   UNE PISTE PORTE UNE LARGEUR ET UNE COUCHE, donc une seule section — mais pas
   forcément un seul ÉCART AU PLAN, et c'est ce qui a changé. Elle partait
   jusqu'ici comme un tronçon unique, avec le point le plus serré de toute sa
   longueur : une piste de trente millimètres qui traverse un couloir serré sur
   trois se voyait calculée au serré sur les trente. Elle part maintenant
   découpée en plages d'écart constant (`simPlagesIpc`), une par section
   réellement différente — la mise en cascade sait les enchaîner, c'est son
   métier, et chaque plage se peint à sa propre couleur.

   `objets` porte donc `u1` et `u2`, la fraction du parcours que la plage
   couvre, et `cum` la table des longueurs cumulées qui sert à la retrouver. */
/* LA LISTE ET LE NET SONT CEUX D'UN LOT quand on en découpe (voir
   `simLotsDePistes`), et ceux de la portée courante sinon : un seul chemin de
   calcul, et non deux qui auraient dérivé l'un de l'autre. */
function simSegments(liste,N){
  const k=simKUnite(), envoi=[], objets=[], entrees=[];
  const refs=simRefIdx(), hors=new Map();
  let ignorees=0;
  for(const e of simChainePistes(liste||simZPistes())){
    const cu=simCuDe(e.couche);
    if(cu<0){ignorees++;continue;}
    const p=e.piste;
    if(!p.p||p.p.length<4)continue;
    const cum=simCumul(p.p);
    const total=(cum[cum.length-1]||0)*k;
    if(!(total>0))continue;

    const r=simPlagesIpc(p,e.couche,refs,cum,total);
    entrees.push({piste:p, cum:cum, total:total, cotes:r.cotes});
    for(const o of r.hors){
      const v=hors.get(o.net);
      if(!v)hors.set(o.net,{net:o.net, ecart:o.ecart, longueur:o.longueur});
      else{v.longueur=Math.round((v.longueur+o.longueur)*1000)/1000;
           v.ecart=Math.min(v.ecart,o.ecart);}
    }

    const c=V.couches[e.couche];
    /* LA PISTE RETOURNÉE SE PARCOURT DANS L'AUTRE SENS, ET TOUT SUIT. Ses
       plages sortent en ordre inverse, chacune bout pour bout — et GAUCHE ET
       DROITE S'ÉCHANGENT, parce que `simEcartsEn` les mesure par rapport à la
       TANGENTE du parcours : le côté gauche d'une piste lue à l'envers est son
       côté droit. Les oublier écrirait « 0,187 / 2,325 » à l'envers sur un
       tronçon sur deux, dans un panneau qui dit justement mesurer chaque côté
       séparément.
       `u1`/`u2` ne bougent PAS : ils repèrent la plage sur la POLYLIGNE, dont
       le sens n'a pas changé — c'est le parcours qu'on retourne, pas le
       cuivre, et la carte de chaleur se peint sur le cuivre. */
    const suite=e.retourne?r.plages.slice().reverse():r.plages;
    for(const pl of suite){
      const q1=simSurPoly(p.p,cum,pl.u1), q2=simSurPoly(p.p,cum,pl.u2);
      const a=e.retourne?q2:q1, b=e.retourne?q1:q2;
      envoi.push({
        type:"track",
        start:[a.x*k, a.y*k], end:[b.x*k, b.y*k],
        length:pl.longueur, width:(p.w||0)*k, layer:simRangCu(cu),
        net:(p.n>=0)?mdlNetNom(p.n):"", copper_thickness:LT.cu[cu].ep,
        gap_left:e.retourne?pl.d:pl.g, gap_right:e.retourne?pl.g:pl.d
      });
      /* `retourne` VOYAGE AVEC L'OBJET, et il faut qu'il voyage : la
         polyligne ne change pas de sens, c'est le PARCOURS qui la remonte.
         Sans ce drapeau, une abscisse curviligne calculée plus tard sur cette
         plage — celle d'un via de couture, par exemple — tomberait à l'envers
         dans le tronçon, et la carte de crosstalk poserait la zone de
         vigilance à l'autre bout. Le côté gauche/droite s'inverse avec lui,
         pour la même raison. */
      objets.push({piste:p, cum:cum, u1:pl.u1, u2:pl.u2,
                   retourne:!!e.retourne,
                   couche:(c?c.nom:"?"), coucheIdx:e.couche});
    }
  }
  simAccrocherViasIpc(envoi,N);

  return {envoi:envoi, objets:objets, ignorees:ignorees,
          couture:simCoutureIpc(entrees,refs),
          chaine:SIM_CHAINE_IPC, vias:simViasIpc(N),
          voisins:[...hors.values()].sort((a,b)=>b.longueur-a.longueur)};
}

/* ==========================================================================
   D'OÙ VIENNENT LES COTES DE LA SECTION
   --------------------------------------------------------------------------
   C'EST LA MOITIÉ DE L'INFORMATION, et elle n'existe que dans cet outil. Le
   serveur rend la section qu'il a résolue — h, εr, tan δ, épaisseur de cuivre —
   mais il ne peut pas savoir si chaque valeur a été LUE dans le fichier, saisie
   à la main, ou remplacée par un repli faute de mieux. « h = 0,380 mm » et
   « h = 0,380 mm, supposé » ne se lisent pas du tout de la même façon quand on
   cherche pourquoi une ligne sort à 54 Ω au lieu de 50.

   `LT` porte déjà cette provenance, valeur par valeur (`epSrc`, `tSrc`,
   `erSrc`, `dfSrc`, dressés par `ltPreparer`) : il ne reste qu'à la dire. La
   fiche de ligne de transmission s'en sert de son côté ; c'est la même vérité,
   et ce doit rester la même.

   ========================================================================== */
function simProvenanceIpc(seg){
  if(!LT.pret)return "";
  const k=Math.floor((seg.couche||0)/2);
  const cu=LT.cu[k];
  if(!cu)return "";

  /* Le plan de référence, retrouvé par son nom : c'est le serveur qui l'a
     choisi, et on ne redécide rien ici — on cherche seulement les intervalles
     de diélectrique traversés pour en lire la provenance. */
  const nom=seg.plan_haut||seg.plan_bas||"";
  const kp=LT.cu.findIndex(e=>e.nom===nom);
  const gaps=[];
  if(kp>=0)
    for(let i=Math.min(k,kp);i<Math.max(k,kp);i++)
      if(LT.gap[i])gaps.push(LT.gap[i]);

  /* GROUPÉ PAR PROVENANCE, et non valeur par valeur : « cuivre, h et εr du
     fichier » se lit d'un coup là où « cuivre du fichier, h du fichier, εr du
     fichier » fait trois fois le même bruit. */
  const par={fichier:[], saisi:[], suppose:[]};
  const ranger=function(quoi,src){
    if(src==="saisi")par.saisi.push(quoi);
    else if(src==="fichier")par.fichier.push(quoi);
    else par.suppose.push(quoi);
  };
  ranger("cuivre",cu.epSrc);
  /* Les intervalles peuvent avoir des provenances différentes : on retient la
     PLUS FAIBLE, celle qui commande la confiance qu'on peut avoir dans le
     total. Un h dont un tronçon est supposé est un h supposé. */
  const pire=function(cle){
    let vu="saisi";
    for(const g of gaps){
      const v=g[cle]||"";
      if(!v)return "";
      if(v==="fichier")vu="fichier";
    }
    return gaps.length?vu:"";
  };
  ranger("h",pire("tSrc"));
  ranger("εr",pire("erSrc"));
  ranger("tan δ",gaps.some(g=>g.dfSrc)?"fichier":"");

  const bouts=[];
  if(par.fichier.length)bouts.push(par.fichier.join(", ")+" du fichier");
  if(par.saisi.length)bouts.push(par.saisi.join(", ")+" saisi"+
                                 (par.saisi.length>1?"s":""));
  if(par.suppose.length)
    bouts.push(par.suppose.join(", ")+" supposé"+
               (par.suppose.length>1?"s":"")+", à saisir dans « La carte »");
  let t=bouts.join(" ; ");
  t=t.charAt(0).toUpperCase()+t.slice(1);
  return t+".";
}

/* ==========================================================================
   La carte de chaleur sur le cuivre
   --------------------------------------------------------------------------
   Appelée par `peindre()` (03-rendu.js), après la mise en évidence du net :
   c'est un jugement sur ce que celle-ci vient de montrer, il doit passer
   au-dessus. Avant les composants et les textes, qui restent lisibles.

   TROIS TRAITS par piste, du plus large au plus fin, et pour la même raison
   qu'à l'éditeur PCB : la mise en évidence peint déjà le cuivre EN BLANC à
   85 % (`peindreNet`), et un trait coloré à la seule largeur du cuivre
   disparaissait dessous. Le halo de chaleur est plus large que la piste : il
   l'encadre, et la couleur se voit sans avoir à zoomer.
   ========================================================================== */
/* Le sous-chemin [u1,u2] d'une polyligne. IL EST NÉCESSAIRE depuis que la piste
   se découpe en plages : peindre la polyligne entière à la couleur de la
   première plage ferait mentir la carte de chaleur là où elle est justement
   utile — à l'endroit où l'impédance change. On coupe donc aux deux bouts, sur
   la polyligne elle-même, en gardant tous les sommets qui tombent dedans. */
function simSousPoly(p,cum,u1,u2){
  const t=new Path2D();
  const total=cum[cum.length-1];
  if(!(total>0))return t;
  const a=simSurPoly(p,cum,u1), b=simSurPoly(p,cum,u2);
  const s1=u1*total, s2=u2*total;
  t.moveTo(a.x,a.y);
  for(let i=1;i<cum.length;i++){
    if(cum[i]<=s1)continue;
    if(cum[i]>=s2)break;
    t.lineTo(p[2*i],p[2*i+1]);
  }
  t.lineTo(b.x,b.y);
  return t;
}

/* ==========================================================================
   LE VOILE — CE QUI N'EST PAS DANS LA SIMULATION S'ESTOMPE
   --------------------------------------------------------------------------
   Posé par `peindre()` JUSTE AVANT les cartes de chaleur. Voir `simVoileActif`
   (commun/simulation-em.js) : tout ce qui a été dessiné avant s'efface d'un
   cran, tout ce qui se peint après reste plein — le cuivre qui n'entre dans
   aucun calcul cesse de se confondre avec celui qui porte une couleur de
   chaleur, et une couleur de COUCHE cesse de se lire comme une couleur de
   BRUIT.

   IL SE POSE EN PIXELS ÉCRAN, à la transformation d'identité : c'est la toile
   entière qu'il couvre, pas une région du monde.
   ========================================================================== */
function simVoile(c,W,H){
  if(typeof simVoileActif!=="function"||!simVoileActif())return;
  c.save();
  c.setTransform(1,0,0,1,0,0);
  c.globalAlpha=SIM_VOILE_ALPHA;
  c.fillStyle=FOND;
  c.fillRect(0,0,W,H);
  c.restore();
}

/* TOUS LES LOTS SE PEIGNENT, ET C'EST LE POINT. La fiche ne peut déplier qu'un
   morceau à la fois — six jeux de paramètres S ne se lisent pas ensemble —, mais
   la question « est-ce 50 Ω sur toute la longueur ? » se répond d'un coup d'œil
   sur la carte. Le tableau des lots compare des chiffres ; la carte, elle,
   montre OÙ ça sort de la bande. Sans lot, la boucle tourne une fois et le
   dessin est celui d'avant. */
/* TROIS ANALYSES PEIGNENT CE CUIVRE, ET PAS LA MÊME GRANDEUR — voir
   `simCarteSegment` dans commun/simulation-em.js : ce fichier ne sait plus ce
   qu'il peint, il sait seulement où. */
function simZTrace(c,dpr){
  if(typeof simCarteActive!=="function"||!simCarteActive())return;
  if(typeof simPourChaqueLot!=="function"){simZTraceLot(c,dpr,null);return;}
  simPourChaqueLot(function(lot){simZTraceLot(c,dpr,lot);});
}

function simZTraceLot(c,dpr,lot){
  poserMonde(c,dpr);
  const px=1/V.vue.scale;                    // un pixel écran, en unités monde
  c.lineCap="round"; c.lineJoin="round";

  const traits=[];
  for(let i=0;i<SIM.objets.length;i++){
    const s=simCarteSegment(i);
    if(!s||!s.obj||!s.obj.piste||!s.obj.piste.p)continue;
    const o=s.obj;
    traits.push({chemin:simSousPoly(o.piste.p,o.cum,o.u1,o.u2),
                 w:o.piste.w||0, valeur:s.valeur, texte:s.texte,
                 couleur:s.couleur, obj:o, seg:s.seg});
  }
  for(const t of traits){
    c.strokeStyle=t.couleur(0.30);
    c.lineWidth=t.w+px*7; c.stroke(t.chemin);
  }
  for(const t of traits){
    c.strokeStyle=t.couleur(0.95);
    c.lineWidth=Math.max(t.w,px*2.5); c.stroke(t.chemin);
  }
  for(const t of traits){
    c.strokeStyle=t.couleur(1);
    c.lineWidth=px*2; c.stroke(t.chemin);
  }
  simZValeurs(c,dpr,traits);
  simZNumeroLot(c,dpr,lot,traits);
}


/* LE NUMÉRO DU LOT, POSÉ SUR SON CUIVRE. Le tableau parle de « lot 3 » ; sans
   ce jeton, rien sur la carte ne dit lequel c'est, et il faudrait déplier les
   six fiches pour retrouver le morceau qui sort de la bande. Il ne paraît que
   s'il y a plus d'un lot : sur une sélection ordinaire il n'y aurait rien à
   distinguer, et un chiffre de plus au milieu du cuivre gênerait la lecture.

   AU DÉBUT DU PARCOURS, et non au milieu : le milieu porte déjà l'étiquette
   d'impédance, et deux cartouches au même endroit se recouvrent. */
function simZNumeroLot(c,dpr,lot,traits){
  if(!lot||!lot.rang||!traits.length)return;
  if(typeof simLotsMultiples!=="function"||!simLotsMultiples())return;
  const o=traits[0].obj;
  if(!o||!o.piste||!o.piste.p)return;
  const m=simSurPoly(o.piste.p,o.cum,o.u1);
  const e=w2s(m.x,m.y);
  c.save();
  c.setTransform(1,0,0,1,0,0);
  c.scale(dpr,dpr);
  c.font="700 10px \"JetBrains Mono\",\"SF Mono\",Consolas,monospace";
  c.textAlign="center"; c.textBaseline="middle";
  c.beginPath();
  c.arc(e.x,e.y,9,0,2*Math.PI);
  c.fillStyle="rgba(15,16,18,0.9)"; c.fill();
  c.strokeStyle=traits[0].couleur(1); c.lineWidth=1.4; c.stroke();
  c.fillStyle="#e6e8ec";
  c.fillText(String(lot.rang),e.x,e.y+0.5);
  c.restore();
}


/* ==========================================================================
   LE CHEVELU DU COURANT DE RETOUR
   --------------------------------------------------------------------------
   CE QU'IL MONTRE, ET POURQUOI IL EST ICI. Un via de signal qui change de
   couche oblige son courant de retour à changer de plan avec lui. Ce qui l'y
   aide, ce sont les vias de MASSE d'à côté — et rien sur le dessin d'une carte
   livrée ne dit lesquels y arrivent, ni ce que chacun porte. Le chevelu relie
   le via de signal à chacun d'eux, épaissit le trait de ceux qui travaillent,
   pointille ceux qui ne peuvent rien et écrit pourquoi.

   IL EST LU DANS LE RÉSULTAT, et c'est ce qui le distingue de celui de
   l'éditeur PCB. Là-bas on route, donc il faut répondre pendant qu'on déplace
   le via, donc il se recalcule à chaque image. Ici la carte est faite : le
   seul chevelu qui vaille est celui que le modèle a réellement employé, et
   c'est `simCheveluRes` qui le lit. Le trait et le chiffre viennent de la même
   source — il ne peut pas y avoir de désaccord entre le dessin et la fiche.

   LES COORDONNÉES ARRIVENT EN MILLIMÈTRES, parce que c'est l'unité du document
   envoyé au serveur. Le monde de la visionneuse, lui, est dans l'unité du
   fichier IPC — `simKUnite` est le facteur, et on le remonte à l'envers.
   ========================================================================== */

function simRetourActifIpc(){
  /* LE CHEVELU SUIT SON ONGLET — voir `simCheveluRes` dans commun/. */
  return !!(typeof SIM!=="undefined"&&SIM.ouvert&&SIM.analyse==="retour"
            &&SIM.res&&typeof simCheveluRes==="function");
}

function simRetourTraceIpc(c,dpr){
  if(!simRetourActifIpc())return;
  const liens=simCheveluRes();
  if(!liens.length)return;
  const k=simKUnite();
  if(!(k>0))return;
  const u=v=>v/k;                          /* millimètres -> unités du fichier */

  const actif=(typeof SIM!=="undefined"&&SIM.viaActif!=null)?SIM.viaActif:null;
  const actifGnd=(actif!=null&&typeof SIM!=="undefined"&&SIM.gndViaActif!=null)?SIM.gndViaActif:null;

  poserMonde(c,dpr);
  c.save();
  c.lineCap="round";
  const px=1/V.vue.scale;                  /* un pixel écran, en unités monde */

  for(const g of liens){
    const isSel=(actif!=null&&g.idx===actif);
    const dimmed=(actif!=null&&!isSel);
    const gx=u(g.x), gy=u(g.y);

    c.save();
    if(dimmed){
      c.globalAlpha=0.22;
    }

    /* Le halo de mise en surbrillance si ce via est sélectionné au rapport */
    if(isSel){
      c.save();
      c.beginPath();
      c.arc(gx,gy,u(g.pastille)/2+px*12,0,Math.PI*2);
      c.fillStyle="rgba(73, 192, 122, 0.22)";
      c.fill();
      c.strokeStyle="#ffe066";
      c.lineWidth=px*3.2;
      c.stroke();
      c.restore();
    }

    const vias=g.vias||[];
    for(let fIdx=0; fIdx<vias.length; fIdx++){
      const f=vias[fIdx];
      const isThisGnd=(isSel&&actifGnd===fIdx);
      const isOtherGndDimmed=(isSel&&actifGnd!=null&&!isThisGnd);

      c.save();
      if(isOtherGndDimmed){
        c.globalAlpha=0.20;
      }

      c.strokeStyle=isThisGnd?"#ffe066":simRetourCouleurRes(f);
      /* L'ÉPAISSEUR DIT LA PART DU COURANT */
      let baseW=f.retenu?px*(1.2+4.0*Math.max(f.part||0,0)):px*1.2;
      if(isSel){
        baseW*=isThisGnd?2.6:1.4;
        if(f.retenu&&!isThisGnd&&actifGnd==null)
          c.strokeStyle=(f.part>=0.20?"#5efc82":"#ffd166");
      }
      c.lineWidth=baseW;
      c.setLineDash(f.retenu?[]:[px*3,px*3]);
      c.beginPath();
      c.moveTo(gx,gy);
      c.lineTo(u(f.x),u(f.y));
      c.stroke();

      /* Halo brillant doré sur le via de masse ciblé */
      if(isThisGnd){
        c.save();
        c.beginPath();
        c.arc(u(f.x),u(f.y),px*10,0,Math.PI*2);
        c.fillStyle="rgba(255, 224, 102, 0.35)";
        c.fill();
        c.strokeStyle="#ffe066";
        c.lineWidth=px*2.5;
        c.stroke();
        c.restore();
      }
      c.restore();
    }

    /* Le via de signal, cerclé */
    c.setLineDash([]);
    c.strokeStyle=isSel?"#ffffff":(g.retenus?"#49c07a":"#e8564a");
    c.lineWidth=isSel?px*2.8:px*1.6;
    c.beginPath();
    c.arc(gx,gy,u(g.pastille)/2+px*3,0,Math.PI*2);
    c.stroke();

    c.restore();
  }
  c.restore();
  simRetourValeursIpc(c,liens,dpr,u);
}

/* Les chiffres, tracés en PIXELS ÉCRAN et non en unités monde : une étiquette
   qui grossit avec le zoom finit par couvrir la carte, et celle-ci doit rester
   lisible quand on dézoome pour voir la liaison entière. C'est la règle de
   `simZValeurs`, et c'est la même ici. */
function simRetourValeursIpc(c,liens,dpr,u){
  c.save();
  c.setTransform(1,0,0,1,0,0);
  c.scale(dpr,dpr);
  c.textAlign="center"; c.textBaseline="middle";

  const actif=(typeof SIM!=="undefined"&&SIM.viaActif!=null)?SIM.viaActif:null;
  const actifGnd=(actif!=null&&typeof SIM!=="undefined"&&SIM.gndViaActif!=null)?SIM.gndViaActif:null;

  const cartouche=(e,txt,bord,dy,petit,isSel)=>{
    c.font=(petit?(isSel?"700 10.5px ":"600 9.5px "):(isSel?"700 12px ":"600 11px "))+
      "\"JetBrains Mono\",\"SF Mono\",Consolas,\"Roboto Mono\",monospace";
    const w=c.measureText(txt).width+10, hh=petit?15:18;
    c.fillStyle=isSel?"rgba(20,24,28,0.96)":"rgba(15,16,18,0.86)";
    c.beginPath();
    if(c.roundRect)c.roundRect(e.x-w/2,e.y+dy-hh/2,w,hh,4);
    else c.rect(e.x-w/2,e.y+dy-hh/2,w,hh);
    c.fill();
    c.strokeStyle=isSel?"#ffe066":bord; c.lineWidth=isSel?2.0:1.2; c.stroke();
    c.fillStyle=isSel?"#ffffff":"#e6e8ec";
    c.fillText(txt,e.x,e.y+dy+0.5);
  };

  for(const g of liens){
    const isSel=(actif!=null&&g.idx===actif);
    const dimmed=(actif!=null&&!isSel);
    if(dimmed)continue; // Si un via précis est sélectionné, on n'affiche que ses étiquettes

    const o=w2s(u(g.x),u(g.y));
    const vias=g.vias||[];
    for(let fIdx=0; fIdx<vias.length; fIdx++){
      const f=vias[fIdx];
      const isThisGnd=(isSel&&actifGnd===fIdx);
      const isOtherGndDimmed=(isSel&&actifGnd!=null&&!isThisGnd);
      if(isOtherGndDimmed)continue;
      const e=w2s(u(f.x),u(f.y));
      const lg=Math.hypot(e.x-o.x,e.y-o.y);
      if(lg<45&&f.retenu&&!isSel&&!isThisGnd)continue;
      const m={x:o.x+0.66*(e.x-o.x), y:o.y+0.66*(e.y-o.y)};
      if(!f.retenu)cartouche(m,f.raison||"écarté","#e8564a",-14,true,isThisGnd||isSel);
      else if((f.part||0)>=0.05||isThisGnd)
        cartouche(m,Math.round(100*f.part)+" %",
                  isThisGnd?"#ffe066":simRetourCouleurRes(f),0,true,isThisGnd||isSel);
    }
    const txt=(g.seul
      ? "L ≥ "+simNb(g.L_nH,2)+" nH · sans retour"
      : "L = "+simNb(g.L_nH,2)+" nH")+(g.cascade?"":" · hors parcours");
    const rayon=(u(g.pastille)/2)*V.vue.scale+14;
    cartouche(o,txt,g.seul?"#e8564a":(isSel?"#ffe066":"#49c07a"),-Math.max(18,rayon),false,isSel);

    if(g.change)
      cartouche(o,"référence "+g.plans+" : aucun via ne peut joindre les deux",
                "#e8564a",Math.max(20,rayon),true,isSel);
    else if(g.doute)
      cartouche(o,"référence "+g.plans+" : nets des plans non déclarés",
                "#e0a63c",Math.max(20,rayon),true,isSel);
    else if(g.supposee&&!g.seul)
      cartouche(o,"portée des vias de masse supposée traversante",
                "#7d8590",Math.max(20,rayon),true,isSel);
  }
  c.restore();
}

/* Clic sur le canvas pour désigner un via de signal, un via de masse ou un trait du chevelu */
function simRetourClicIpc(wx,wy){
  if(!simRetourActifIpc())return false;
  const liens=simCheveluRes();
  if(!liens||!liens.length)return false;
  const k=simKUnite();
  if(!(k>0))return false;
  const u=v=>v/k;

  const tol=Math.max(0.4/k, 12/V.vue.scale);

  // 1. Clic sur un via de signal
  for(const g of liens){
    const gx=u(g.x), gy=u(g.y);
    const r=Math.max(u(g.pastille)/2, tol);
    if(Math.hypot(wx-gx, wy-gy)<=r){
      if(typeof simSelectionnerVia==="function"){
        simSelectionnerVia(g.idx);
        const row=document.querySelector('[data-via-idx="'+g.idx+'"]');
        if(row&&typeof row.scrollIntoView==="function")row.scrollIntoView({block:"nearest",behavior:"smooth"});
      }
      return true;
    }
  }

  // 2. Clic sur un via de masse ou un trait du chevelu
  for(const g of liens){
    const gx=u(g.x), gy=u(g.y);
    const vias=g.vias||[];
    for(let fIdx=0; fIdx<vias.length; fIdx++){
      const f=vias[fIdx];
      const fx=u(f.x), fy=u(f.y);
      const dGnd=Math.hypot(wx-fx, wy-fy);
      const dRay=distSegment(wx, wy, gx, gy, fx, fy);
      if(dGnd<=tol*1.5 || dRay<=tol*0.9){
        if(typeof simSelectionnerGndVia==="function"){
          simSelectionnerGndVia(g.idx, fIdx);
          const item=document.querySelector('[data-via-idx="'+g.idx+'"] [data-gnd-idx="'+fIdx+'"]');
          if(item&&typeof item.scrollIntoView==="function")item.scrollIntoView({block:"nearest",behavior:"smooth"});
        }
        return true;
      }
    }
  }
  return false;
}

/* Les valeurs écrites sur la piste.
   Une étiquette par IMPÉDANCE DISTINCTE, et non par piste : un net de vingt
   pistes de même largeur sur la même couche a une seule impédance, et vingt
   fois « 61,1 Ω » empilés ne se lisent pas. On pose donc l'étiquette au milieu
   de la plus longue piste de chaque valeur.

   Le texte est tracé en pixels écran, pas en unités monde : une étiquette qui
   grossit avec le zoom finit par couvrir la carte, et elle doit rester lisible
   quand on dézoome pour voir la liaison entière. */
function simZValeurs(c,dpr,traits){
  const parValeur=new Map();
  for(const t of traits){
    if(!t.texte)continue;
    /* UNE ÉTIQUETTE PAR VALEUR AFFICHÉE — c'est le TEXTE qui groupe, si bien
       que la règle vaut pour les ohms comme pour les pourcentages. */
    const lg=(t.seg&&t.seg.longueur)||0;
    const p=parValeur.get(t.texte);
    if(!p||lg>p.lg)
      parValeur.set(t.texte,{lg:lg, valeur:t.valeur, texte:t.texte,
                             couleur:t.couleur, obj:t.obj});
  }
  if(!parValeur.size)return;
  const retenues=simCarteRetenir(parValeur);

  c.save();
  c.setTransform(1,0,0,1,0,0);
  c.scale(dpr,dpr);
  c.font="600 11px \"JetBrains Mono\",\"SF Mono\",Consolas,monospace";
  c.textAlign="center"; c.textBaseline="middle";
  for(const v of retenues){
    /* Le milieu de la PLAGE, et non de la piste : une piste découpée en trois
       plages porte trois étiquettes, et chacune doit tomber sur le morceau
       qu'elle chiffre. Posée au sommet médian de la polyligne, comme avant,
       elles se seraient toutes empilées au même endroit. */
    const o=v.obj;
    const m=simSurPoly(o.piste.p,o.cum,(o.u1+o.u2)/2);
    const e=w2s(m.x,m.y);
    const txt=v.texte;
    const w=c.measureText(txt).width+10;
    c.fillStyle="rgba(15,16,18,0.82)";
    c.beginPath();
    if(c.roundRect)c.roundRect(e.x-w/2,e.y-9,w,18,4);
    else c.rect(e.x-w/2,e.y-9,w,18);
    c.fill();
    c.strokeStyle=v.couleur(1); c.lineWidth=1.2; c.stroke();
    c.fillStyle="#e6e8ec";
    c.fillText(txt,e.x,e.y+0.5);
  }
  c.restore();
}

/* ==========================================================================
   LA CHUTE CONTINUE — le cuivre d'une carte LIVRÉE
   --------------------------------------------------------------------------
   MÊME CONTRAT QUE L'ÉDITEUR PCB, autre matière première. L'éditeur construit
   son cuivre et connaît donc chaque forme ; ici la carte arrive faite, décrite
   par des pistes, des arcs, des plans à contours et des pastilles tirées de
   padstacks. Tout cela doit ressortir en polygones, dans l'unité du document
   d'échange — le MILLIMÈTRE, quelle que soit l'unité du fichier.

   CE QUE LE FICHIER NE DIT PAS, ET QU'IL FAUT DONC SUPPOSER. Un perçage
   IPC-2581 tel que ce modèle le porte n'a pas de PORTÉE : rien n'y dit entre
   quelles couches il court. On le suppose donc TRAVERSANT — c'est le cas de la
   très grande majorité, et c'est l'hypothèse qui ne perd pas de chemin —, et
   le panneau le dit dans ses notes plutôt que de le taire. Un perçage NON
   métallisé, lui, ne conduit rien : il est écarté.
   ========================================================================== */

const SIM_DCB={bornes:[], attente:null};

/* Un cercle en polygone, dans l'unité du modèle. */
function simDCCercleIpc(x,y,r,n){
  const pts=[]; n=n||24;
  for(let i=0;i<n;i++){
    const a=2*Math.PI*i/n;
    pts.push([x+r*Math.cos(a), y+r*Math.sin(a)]);
  }
  return pts;
}

/* Les contours d'une forme de padstack, en coordonnées LOCALES.

   On repart des données brutes (`V.modele.formes`) et non du `Path2D` que le
   rendu fabrique : un chemin de canevas ne se relit pas, et c'est de sommets
   qu'on a besoin. Les arrondis et les chanfreins sont rendus par le rectangle
   plein — à l'échelle d'une trame de maillage, l'écart tient dans un carreau,
   et il va du côté prudent : un peu plus de cuivre, donc une chute un peu
   sous-estimée, que le maillage grossier sur-estime par ailleurs. */
function simDCFormeIpc(id,dParDefaut){
  const f=V.modele&&V.modele.formes?V.modele.formes[id]:null;
  const u=V.modele&&V.modele.formesuser?V.modele.formesuser[id]:null;
  const plein=[], creux=[];
  const rect=(w,h)=>plein.push([[-w/2,-h/2],[w/2,-h/2],[w/2,h/2],[-w/2,h/2]]);
  const dePlat=pl=>{
    const o=[];
    for(let i=0;i+1<pl.length;i+=2)o.push([pl[i],pl[i+1]]);
    return o;
  };
  if(f){
    switch(f.t){
      case "CIRCLE":     plein.push(simDCCercleIpc(0,0,(f.d||0)/2)); break;
      case "RECTCENTER":
      case "OVAL":
      case "RECTROUND":
      case "RECTCHAM":   rect(f.w||0,f.h||0); break;
      case "POLYGON":    if(f.p&&f.p.length>=6)plein.push(dePlat(f.p)); break;
      default: break;
    }
  }else if(u){
    for(const g of (u.plans||[])){
      if(g.o&&g.o.length>=6)plein.push(dePlat(g.o));
      for(const t of (g.t||[]))if(t&&t.length>=6)creux.push(dePlat(t));
    }
  }
  if(!plein.length&&dParDefaut>0)
    plein.push(simDCCercleIpc(0,0,dParDefaut/2));
  return {plein:plein, creux:creux};
}

/* Une pastille posée : ses contours, tournés, miroités, placés et convertis en
   millimètres. La matrice est celle de `mdlPadDans` — la même, pour que le
   cuivre calculé soit exactement celui qu'on voit. */
function simDCPadPolysIpc(q,k){
  const g=simDCFormeIpc(q.forme,q.d||0);
  const a=(q.rot||0)*Math.PI/180, co=Math.cos(a), si=Math.sin(a);
  const m=q.mir?-1:1;
  const pose=pts=>pts.map(pt=>[(co*m*pt[0]-si*pt[1]+q.x)*k,
                               (si*m*pt[0]+co*pt[1]+q.y)*k]);
  return {plein:g.plein.map(pose), creux:g.creux.map(pose)};
}

/* Une piste : un quadrilatère par segment de sa ligne brisée, allongé d'une
   demi-largeur à chaque bout — le cuivre finit en demi-disque, pas au ras de
   l'axe, et sans cela deux segments à angle droit laisseraient leur coin vide.
   `p.p` est un tableau PLAT [x1,y1,x2,y2,…]. */
function simDCPolysPisteIpc(pi,k){
  const pl=pi.p||[], out=[], w=Math.max((pi.w||0)*k,1e-4);
  for(let i=0;i+3<pl.length;i+=2){
    const ax=pl[i]*k, ay=pl[i+1]*k, bx=pl[i+2]*k, by=pl[i+3]*k;
    let dx=bx-ax, dy=by-ay;
    const L=Math.hypot(dx,dy);
    if(L<1e-9){dx=1;dy=0;}else{dx/=L;dy/=L;}
    const e=w/2, nx=-dy*e, ny=dx*e;
    const x0=ax-dx*e, y0=ay-dy*e, x1=bx+dx*e, y1=by+dy*e;
    out.push([[x0+nx,y0+ny],[x1+nx,y1+ny],[x1-nx,y1-ny],[x0-nx,y0-ny]]);
  }
  /* Une piste réduite à UN point est une pastille de fortune : un rond de sa
     largeur, plutôt que rien. */
  if(!out.length&&pl.length>=2)
    out.push(simDCCercleIpc(pl[0]*k,pl[1]*k,w/2));
  return out;
}

/* Un arc : la même chose, échantillonné le long de sa course. */
function simDCPolysArcIpc(a,k){
  const pts=simArcEnPolyligne(a);
  if(!pts)return simDCPolysPisteIpc(a,k);
  return simDCPolysPisteIpc({p:pts, w:a.w}, k);
}

/* Le rang de conducteur d'une couche du modèle, ou -1. Le document DC parle en
   rangs de `LT.cu` : c'est ce qui donne accès à l'épaisseur du cuivre et à la
   hauteur des diélectriques, que la couche du modèle ne porte pas. */
function simDCRangIpc(coucheIdx){
  return LT.pret?LT.cu.findIndex(e=>e.couche===coucheIdx):-1;
}

/* ==========================================================================
   CE QUE LA CARTE EMPORTE DE CHALEUR — LES COTES DE L'EMPILAGE
   --------------------------------------------------------------------------
   Le solveur ne lit plus l'échauffement sur la charte IPC-2221 : il résout
   l'ÉTALEMENT dans le stratifié, ce que la campagne IPC-2152 a mesuré et que
   la charte ignore (voir `simDCThermique` dans `../commun/simulation-em.js`).
   Il lui faut deux cotes que seul l'empilage porte.

   L'ÉPAISSEUR DE STRATIFIÉ est la somme des INTERVALLES de `LT.gap`, donc le
   diélectrique seul : le cuivre est compté à part, et le masque n'étale rien.
   Un empilage qui ne liste que ses conducteurs rend zéro — le solveur pose
   alors son repli ET LE DIT, ce qui est mieux que d'inventer 1,6 mm ici.

   LE CUIVRE ÉTALEUR EST CE QUI ÉTALE VRAIMENT. 35 µm de cuivre pleine carte
   portent dix fois la conductance de nappe de tout le FR-4 : compter tout le
   cuivre de l'empilage rendrait une température dix fois trop basse sur une
   carte dont les couches internes ne sont que du routage. `LT` a déjà la
   mesure qu'il faut — `taux`, la part de la carte que les PLANS de la couche
   couvrent, calculée par `ltPreparer` sur le cuivre POSÉ et non sur le rôle
   annoncé. C'est la même que celle qui décide si une couche est un plan de
   référence, et c'est heureux : ce sont les mêmes 40 % de cuivre qui font une
   masse et une ailette.

   LES PISTES ET LES PASTILLES NE COMPTENT PAS : quelques pour cent d'une
   couche de routage, fragmentés — donc mauvaises ailettes. Le chiffre penche
   ainsi vers le chaud, ce qui est le bon sens de l'erreur.

   λ N'EST PAS FOURNI : « FR-4 » ne donne pas une conductivité thermique, il la
   suggère. Le solveur met son repli et l'annonce comme supposé ; le champ du
   panneau l'emporte dès qu'on a la fiche du fabricant. */
function simDCThermiqueIpc(){
  if(!LT.pret)return {};
  let diel=0;
  for(const g of LT.gap)diel+=(g&&g.t)||0;
  let etaleur=0;
  for(const cu of LT.cu)
    etaleur+=(cu.ep||0)*Math.max(0,Math.min(cu.taux||0,1));
  const th={cuivre_etaleur:etaleur};
  if(diel>0)th.epaisseur_stratifie=diel;
  return th;
}

/* La hauteur traversée entre deux conducteurs voisins, en millimètres. */
function simDCHauteurIpc(a,b){
  const lo=Math.min(a,b), hi=Math.max(a,b);
  let h=0;
  for(let i=lo;i<hi;i++)h+=(LT.gap[i]&&LT.gap[i].t)||0;
  for(let i=lo+1;i<hi;i++)h+=(LT.cu[i]&&LT.cu[i].ep)||0;
  return h>0?h:0.2;
}

/* La pastille sous le curseur, sur n'importe quelle couche de l'empilage de
   calcul. Une borne doit pouvoir se NOMMER — « U3.7 » se vérifie d'un coup
   d'œil, un couple de coordonnées non —, donc on ne retient que les pastilles,
   jamais un bout de piste. */
function simDCBornePastilleIpc(x,y){
  let best=null,bd=1e9;
  for(const cu of (LT.pret?LT.cu:[])){
    const c=V.couches[cu.couche];
    if(!c)continue;
    for(const q of (c.pads||[])){
      const r=Math.max((q.d||0)/2,0.05);
      const d=Math.hypot(q.x-x,q.y-y)-r;
      if(d<bd){
        bd=d;
        const ref=(q.hote&&q.hote.ref)?String(q.hote.ref):"";
        const pin=(q.pad&&q.pad.pin!=null)?String(q.pad.pin):"";
        best={nom:ref?(ref+(pin?"."+pin:"")):("pastille "+
                 (Math.round(q.x*100)/100)+" ; "+(Math.round(q.y*100)/100)),
              x:q.x, y:q.y, couche:simDCRangIpc(cu.couche),
              net:(q.pad&&q.pad.n>=0)?mdlNetNom(q.pad.n):"",
              d:Math.max(q.d||0,0.1), q:q};
      }
    }
  }
  /* Au-delà d'un millimètre du cuivre, ce n'est pas la pastille qu'on visait :
     rendre la plus proche de toute la carte serait pire que ne rien rendre. */
  return (best&&bd<=1.0)?best:null;
}

function simDCAstuce(t){
  const el=document.getElementById("fHint");
  if(el)el.textContent=t;
}

/* QUELLE COUCHE LA CARTE DE POTENTIEL MONTRE.

   L'éditeur PCB a une couche ACTIVE, celle qu'on route ; la visionneuse les
   affiche toutes à la fois et n'en a pas. Il faut pourtant en choisir une :
   superposer deux potentiels les mélangerait sans le dire.

   CE QUI NE MARCHAIT PAS. On prenait celle de la première CHARGE, et rien
   d'autre. Sur un rail qui traverse la carte — le cas ordinaire d'un calcul de
   chute — la couche où ça chauffe n'est presque jamais celle-là, et il n'y
   avait AUCUN moyen de la voir : il fallait effacer les bornes et les reposer
   dans un autre ordre, ce qui relance le calcul pour rien.

   CE QUI LA REMPLACE. Cette fonction ne fait plus que PROPOSER — la charge, ou
   à défaut la première borne posée. C'est `simDCCouchePeinte` (module commun)
   qui tranche, en préférant la couche choisie dans la liste de la fiche quand
   le résultat en porte une image. Le choix reste unique, mais il appartient à
   qui regarde.

   Rend -1 quand il n'y a pas de borne : `simDCTrace` ne trouve alors aucune
   image et ne peint rien. */
function simDCCoucheVue(){
  if(typeof simDCCoucheVoulue==="function")return simDCCoucheVoulue();
  return SIM_IPC.dcCoucheProposee();
}

/* Le clic qui désigne une borne, appelé par l'interaction quand le mode est
   armé. Recliquer la même pastille corrige le tir : on remplace, on ne double
   pas — sans quoi le courant du net doublerait en silence. */
function simDCClic(x,y){
  const role=SIM_DCB.attente;
  SIM_DCB.attente=null;
  const b=simDCBornePastilleIpc(x,y);
  if(!b){
    simDCAstuce("Aucune pastille sous le clic : visez le cuivre d'une pastille.");
  }else if(role){
    b.role=role;
    /* 3,3 V pour une alimentation, un ampère pour un consommateur : de quoi
       calculer dès le premier clic, quitte à corriger ensuite. */
    b.valeur=(role==="source")?3.3:1;
    /* L'IDENTITÉ D'UNE BORNE EST SA POSITION, PAS SON NOM — voir la même
       correction côté éditeur : un nom qui se renomme ne peut plus servir de
       clé, sans quoi recliquer une pastille renommée poserait une SECONDE
       borne au même endroit, donc deux fois le courant. */
    const k=SIM_DCB.bornes.findIndex(o=>Math.abs(o.x-b.x)<1e-9&&
                                        Math.abs(o.y-b.y)<1e-9&&
                                        o.couche===b.couche);
    /* On garde ce que l'utilisateur avait posé dessus : sa valeur, son unité
       ET SON NOM. */
    if(k>=0){
      const av=SIM_DCB.bornes[k];
      b.valeur=av.valeur; b.unite=av.unite;
      if(av.renomme){b.nom=av.nom;b.renomme=true;}
      SIM_DCB.bornes[k]=b;
    }
    else SIM_DCB.bornes.push(b);
  }
  if(typeof simDCBorneChoisie==="function")simDCBorneChoisie();
}

/* ==========================================================================
   L'adaptateur
   ========================================================================== */
/* ==========================================================================
   UN DOCUMENT POUR UNE LISTE DE PISTES
   --------------------------------------------------------------------------
   MÊME CORPS POUR UN LOT ET POUR LA PORTÉE ENTIÈRE, et c'est la raison d'être
   de cette fonction : les notes, les manques de l'empilage, les réserves sur la
   tangente de pertes et le verdict sur la masse de référence doivent être les
   mêmes qu'on calcule un morceau ou quatre. Deux copies auraient dérivé, et
   c'est la fiche du lot 3 qui aurait cessé de prévenir.

   `seul` dit qu'il n'y a pas de lot — un seul clic, ou Maj+clic sur un net
   entier. C'est ce qui permet aux messages de parler du GESTE (« Maj+clic prend
   le net entier ») là où ils ont un sens, et de la PORTÉE du morceau sinon.
   ========================================================================== */
/* ==========================================================================
   LE VOISINAGE — LE CUIVRE QUI LONGE LA SÉLECTION
   --------------------------------------------------------------------------
   L'AGRESSEUR N'EST JAMAIS DANS LA SÉLECTION, par définition ; et l'autre
   moitié d'une paire différentielle n'y est pas non plus, puisqu'on désigne un
   net et pas deux. Sans ce qui suit, ni le crosstalk ni l'impédance
   différentielle n'ont de quoi exister, quel que soit le solveur derrière.

   LA PAGE ENVOIE DU CUIVRE, ELLE N'APPARIE PAS. C'est le serveur qui décide ce
   qui longe (`simulation_em._scenes_paralleles`) : même couche, parallèle à
   quinze degrés près, un recouvrement réel, un écart qui reste un écart. La
   règle est écrite une fois pour les deux outils — l'éditeur PCB et cette
   visionneuse doivent rendre le même chiffre sur la même carte, et deux
   implémentations d'une même géométrie auraient dérivé.

   ON RESTREINT SUR LA BOÎTE, et rien d'autre : la couche de la sélection, une
   boîte englobante élargie de la portée du couplage, et le net qui n'est pas
   celui qu'on analyse. Un fichier de dix mille pistes ne doit pas en envoyer
   dix mille.

   LES ARCS PARTENT EN CORDES, par `simArcEnPolyligne` — la même conversion que
   pour le reste de ce panneau. Une polyligne part segment par segment : c'est
   ce que le serveur sait apparier, et un coude cesse de longer de lui-même dès
   qu'il sort des quinze degrés.
   ========================================================================== */
const SIM_VOISINAGE_MAX_IPC=600;   /* tronçons envoyés ; au-delà, on écrête */
const SIM_ECART_COUPLAGE_IPC=3.0;  /* mm ; ECART_COUPLAGE_MAX de simulation_em.py */

/* `adjacentes` OUVRE LE VOISINAGE AUX COUCHES VOISINES, et c'est la seule
   différence entre le document d'impédance et celui de crosstalk. Deux pistes
   SUPERPOSÉES couplent souvent PLUS que les mêmes côte à côte : les écarter
   d'office ferait lire un couplage nul là où il est maximal. Un conducteur
   occupe le rang 2k dans l'empilage envoyé, donc le conducteur voisin est à
   ±2 — c'est la convention de `simRangCu`, et elle n'a pas d'autre lecture. */
function simVoisinageIpc(envoi,objets,adjacentes){
  if(!V.modele||!LT.pret||!envoi||!envoi.length)return [];
  const k=simKUnite();
  const couches=new Set(envoi.map(e=>e.layer));
  if(adjacentes)
    for(const l of [...couches]){couches.add(l-2);couches.add(l+2);}
  const prises=new Set((objets||[]).map(o=>o.piste));
  /* La boîte de la sélection, élargie de la portée et de la demi-largeur la
     plus grande : en deçà on écarterait du cuivre que le serveur aurait retenu. */
  let x1=Infinity,y1=Infinity,x2=-Infinity,y2=-Infinity,large=0;
  for(const e of envoi){
    x1=Math.min(x1,e.start[0],e.end[0]); y1=Math.min(y1,e.start[1],e.end[1]);
    x2=Math.max(x2,e.start[0],e.end[0]); y2=Math.max(y2,e.start[1],e.end[1]);
    large=Math.max(large,e.width||0);
  }
  const marge=SIM_ECART_COUPLAGE_IPC+large;
  x1-=marge;y1-=marge;x2+=marge;y2+=marge;

  /* DES INDICES DE NET, ET NON DES NOMS. `simEcartsEn` compare ce que porte la
     grille des arêtes, et la grille porte `pl.n`, qui est l'INDICE du net —
     c'est ainsi que `mdlCharger` range les plans. La version précédente lui
     passait `simRefSet()`, c'est-à-dire des noms : `refs.has(indice)` était
     TOUJOURS faux, et chaque voisine partait au serveur avec un écart à la
     masse nul. Rien ne levait, rien ne paraissait anormal — et le serveur en
     concluait qu'aucun cuivre de masse ne s'interpose jamais entre la
     sélection et ses voisines, donc un couplage PESSIMISTE sur toute carte
     arrosée. Les tronçons de la sélection, eux, recevaient bien des indices
     (`simSegments` passe `simRefIdx()`) : les deux moitiés du même document ne
     se mesuraient pas avec la même règle. */
  const refs=simRefIdx();
  const out=[];
  /* CHAQUE VOISINE PART AVEC SES DEUX ÉCARTS À LA MASSE, comme les tronçons de
     la sélection : c'est ce qui permet au serveur de savoir si du cuivre de
     masse S'INTERPOSE entre les deux pistes — voir `_masse_interposee` dans
     `python/simulation_em.py`. Sans eux, deux pistes séparées par un plan
     arrosé se résolvaient comme deux pistes face à face au-dessus du
     diélectrique nu.

     MESURÉ UNE FOIS PAR PISTE, en son milieu, et non par tronçon : la sonde
     parcourt des anneaux de cases et coûte, là où la sélection est découpée en
     plages parce que c'est SON impédance qu'on rend. */
  const ecartsDe=function(pts,couche,w){
    const g=simGrilleCuivre(couche);
    if(!g||g.vide)return {g:0, d:0};
    /* Le milieu de la polyligne, au sommet, et la direction qui y passe. */
    const n=Math.floor((pts.length/2-1)/2)*2;
    const ax=pts[n], ay=pts[n+1], bx=pts[n+2], by=pts[n+3];
    const dx=bx-ax, dy=by-ay, l=Math.hypot(dx,dy);
    if(!(l>0))return {g:0, d:0};
    const e=simEcartsEn(g,k,(ax+bx)/2,(ay+by)/2,dx/l,dy/l,w/2/k,-1,refs);
    return {g:e.g, d:e.d};
  };
  const pousser=function(pts,couche,w,net){
    const cu=simCuDe(couche);
    if(cu<0)return true;
    const layer=simRangCu(cu);
    if(!couches.has(layer)||!(w>0))return true;
    const demi=w/2;
    let ec=null;
    for(let i=0;i+3<pts.length;i+=2){
      const ax=pts[i]*k, ay=pts[i+1]*k, bx=pts[i+2]*k, by=pts[i+3]*k;
      if(Math.max(ax,bx)+demi<x1||Math.min(ax,bx)-demi>x2)continue;
      if(Math.max(ay,by)+demi<y1||Math.min(ay,by)-demi>y2)continue;
      if(Math.abs(ax-bx)<1e-9&&Math.abs(ay-by)<1e-9)continue;
      /* La sonde ne part QUE si un tronçon de cette piste est retenu : une
         piste écartée par la boîte ne coûte alors rien du tout. */
      if(ec===null)ec=ecartsDe(pts,couche,w);
      out.push({type:"track", start:[ax,ay], end:[bx,by], width:w,
                layer:layer, net:net, copper_thickness:LT.cu[cu].ep,
                gap_left:ec.g, gap_right:ec.d});
      if(out.length>=SIM_VOISINAGE_MAX_IPC)return false;
    }
    return true;
  };

  for(const n of (V.parNet||[])){
    if(!n)continue;
    const nom=mdlNetNom(n.i);
    for(const pi of (n.pistes||[])){
      if(prises.has(pi)||!pi.p||pi.p.length<4)continue;
      if(!pousser(pi.p,pi.c,(pi.w||0)*k,nom))return out;
    }
    for(const a of (n.arcs||[])){
      const pts=simArcEnPolyligne(a);
      if(!pts||pts.length<4)continue;
      if(!pousser(pts,a.c,(a.w||0)*k,nom))return out;
    }
  }
  return out;
}

/* LES PAIRES DIFFÉRENTIELLES D'UN FICHIER LIVRÉ : il n'y en a pas de
   déclarées. L'IPC-2581 sait porter des `LogicalNet` groupés, mais rien
   n'oblige un exporteur à le faire, et aucun de ceux qu'on lit ne le fait. Le
   serveur retombe donc sur les suffixes — _P/_N, +/−, _DP/_DM —, qui sont ce
   qu'une carte livrée porte réellement. La fonction existe pour que le contrat
   de l'adaptateur soit le même des deux côtés, et pour qu'il y ait un endroit
   où brancher la déclaration le jour où le format la donne. */
function simPairesIpc(){return [];}

function simDocIpc(liste,netIdx,opts,seul){
  if(!V.modele)
    return {erreur:"Aucune carte ouverte.",
            conseil:"Ouvrez un fichier IPC-2581."};
  if(!LT.pret)
    return {erreur:"L'empilage de calcul n'est pas prêt.",
            conseil:"Complétez-le dans le panneau « La carte », "+
                    "sous « Empilage du calcul »."};

  /* Le net du lot : c'est lui qui porte les perçages, les jonctions et les
     vias de masse voisins. Sans lot, celui de la portée courante. */
  const N=(netIdx!=null&&netIdx>=0)?V.parNet[netIdx]:null;
  const g=simSegments(liste,N);
  if(!g.envoi.length)
    return {erreur:(seul&&(V.mev.quoi==="trous"||V.mev.seul))
              ? "Un perçage n'a pas d'impédance de ligne."
              : "Aucune piste désignée.",
            conseil:g.ignorees
              ? "Ses "+g.ignorees+" piste(s) sont sur des couches absentes "+
                "de l'empilage : complétez-le d'abord."
              : "Cliquez une piste sur la carte. Maj+clic prend le net "+
                "entier, Ctrl+clic ajoute un morceau à la sélection."};

  const notes=[];
  if(g.ignorees)
    notes.push(g.ignorees+" piste(s) écartée(s) : leur couche n'est pas dans "+
               "l'empilage.");
  /* LA RAMIFICATION SE DIT, ET C'EST LA NOTE LA PLUS IMPORTANTE DE LA LISTE
     QUAND ELLE PARAÎT. Un net multipoint — un bus qui dessert trois boîtiers
     — n'a pas de parcours unique : la mise en cascade s'arrête au nœud, donc
     aucun via ne s'accroche, donc le chemin de retour n'est pas chiffré et
     le chevelu ne dessine rien. Tout cela est VOULU. Ce qui ne l'était pas,
     c'est que l'écran n'en dise rien : on voyait une absence, et une absence
     ressemble à une panne. La note donne le POINT, pour qu'on puisse aller
     le regarder, et le nombre de branches, qui dit à quoi on a affaire. */
  const ar=((g.chaine||{}).arrets)||[];
  if(ar.length){
    const a0=ar[0];
    notes.push("Le net se ramifie : "+a0.branches+" branches se rejoignent "+
               (a0.perce?"au via ":"à la pastille ")+
               "("+simNb(a0.x,3)+" ; "+simNb(a0.y,3)+")"+
               (ar.length>1?", et en "+(ar.length-1)+" autre(s) point(s)":"")+
               ". Il n'y a donc pas de parcours unique : les impédances par "+
               "tronçon et la carte de chaleur restent justes, chacune ne "+
               "dépendant que de sa propre section, mais la mise en cascade "+
               "s'arrête là — aucun via n'est rattaché au parcours, donc ni "+
               "son inductance de boucle ni le chevelu du courant de retour "+
               "ne sont calculés. Cliquez UNE piste (sans Maj) pour "+
               "n'analyser qu'une branche.");
  }
  const n=N;
  /* CETTE NOTE ANNONCAIT COMME ABSENT CE QUI EST CASCADÉ. Les transitions de
     couche portent un modèle π L-C depuis le lot 3b ; ce qui reste vrai est
     qu'un perçage du net qui ne réalise AUCUN changement de couche de la
     sélection — un via de report, un point de test — n'entre nulle part.
     C'est cela qu'on compte, et pas les autres. */
  const trans=(g.envoi||[]).filter(function(e){return e&&e.via;}).length;
  const nonVus=n?Math.max(0,n.trous.length-trans):0;
  if(nonVus)
    notes.push(nonVus+" perçage(s) du net ne réalisent aucun changement de "+
               "couche de la sélection : ils ne sont pas dans le modèle.");
  /* Les manques de l'empilage sont ceux que la fiche de ligne signale déjà
     (`ltManques()`) : une seule liste, un seul verdict. */
  const m=(typeof ltManques==="function")?ltManques():null;
  if(m){
    if(m.aucunPlan)
      notes.push("Aucun plan de référence dans l'empilage : sans plan en "+
                 "face de la piste, il n'y a pas de ligne de transmission.");
    if(m.epaisseur.length)
      notes.push("Épaisseur de diélectrique absente du fichier ("+
                 m.epaisseur.join(", ")+") : saisissez-la dans « La carte », "+
                 "sinon le solveur travaille sur un empilage qui n'existe pas.");
    if(m.er.length)
      notes.push("Permittivité absente du fichier ("+m.er.join(", ")+
                 ") : le repli FR-4 est en vigueur.");
    if(m.ep.length)
      notes.push("Épaisseur de cuivre supposée ("+m.ep.join(", ")+").");
  }
  /* La tangente de pertes commande les pertes diélectriques, et elle est
     absente de la plupart des fichiers. Le dire évite de lire « 0,42 dB »
     comme une mesure alors que c'est un FR-4 générique qui parle. */
  const sansDf=LT.gap.filter(g=>g.t>0&&!g.dfSrc).map(g=>g.cle);
  if(sansDf.length)
    notes.push("Tangente de pertes absente du fichier ("+sansDf.join(", ")+
               ") : le repli "+String(LT_DF).replace(".",",")+" est en "+
               "vigueur. Les pertes diélectriques sont indicatives ; "+
               "l'impédance, elle, n'en dépend pas.");

  /* AUCUNE MASSE RETENUE : le calcul coplanaire est désarmé, et toute piste
     noyée dans un plan arrosé ressortira en microruban, soit vingt pour cent
     trop haut. Sur une carte livrée c'est le cas qui arrive vraiment — un
     plan nommé autrement que « GND » n'est pas deviné —, et c'est le seul
     endroit où on puisse le dire. */
  if(!simRefSet().size)
    notes.push("Aucun net de masse retenu : le cuivre qui borde la piste sur "+
               "sa propre couche n'est pas compté. Une piste noyée dans un "+
               "plan arrosé ressortira en microruban, soit vingt pour cent "+
               "trop haut. Choisissez la masse dans la barre du panneau.");

  const net=(netIdx!=null&&netIdx>=0)?mdlNetNom(netIdx):"";
  const couches=[...new Set(g.objets.map(o=>o.couche))];
  return {
    doc:{
      carte:SIM_IPC.carte(), net:net,
      stackup:simStackupIpc(),
      geometry:{objects:g.envoi},
      /* LES VIAS DE LA SÉLECTION, SANS ORDRE — voir `simViasIpc`. Leur
         chemin de retour ne dépend pas du parcours, et c'est ce qui le rend
         calculable sur un net qui se ramifie. */
      vias:g.vias||[],
      ports:[{id:1,impedance:opts.z0},{id:2,impedance:opts.z0}],
      /* LE CUIVRE QUI LONGE — voir « LE VOISINAGE ». Il ne change RIEN au
         calcul d'impédance ; sans lui il n'y a pas de Z différentielle, parce
         que l'autre moitié d'une paire n'est pas toujours sélectionnée. */
      voisinage:simVoisinageIpc(g.envoi,g.objets),
      paires:simPairesIpc(),
      /* LE TEMPS DE MONTÉE est déjà en SECONDES dans la saisie, comme les
         fréquences y sont en hertz : l'unité du champ ne dit que dans quoi on
         l'écrit. Zéro veut dire « déduis-le de la bande ». */
      analyse:{f_debut:opts.f1, f_fin:opts.f2, points:opts.points,
               f_centre:opts.fc, temps_montee:opts.tr||0}
    },
    objets:g.objets,
    /* LA PORTÉE se lit dans la fiche : sans lot, elle dit le geste en vigueur
       (`pnlPortee`, 05-panneaux.js) ; avec des lots, elle dit ce que CE morceau
       couvre — le geste, lui, est le même pour tous, et le répéter quatre fois
       n'apprendrait rien. */
    portee:(net?net+" — ":"")+
           (seul&&typeof pnlPortee==="function"
              ? pnlPortee()
              : g.objets.length+" tronçon"+(g.objets.length>1?"s":"")+
                " sur "+couches.join(", ")),
    /* LE TITRE tient dans une cellule du tableau des lots : le net, la ou les
       couches, et de combien de tronçons c'est fait. */
    titre:(net||"sans net")+" · "+couches.slice(0,2).join(", ")+
          (couches.length>2?" +"+(couches.length-2):"")+
          " · "+g.objets.length+" tronçon"+(g.objets.length>1?"s":""),
    notes:notes,
    couture:g.couture,
    voisins:g.voisins
  };
}

/* ==========================================================================
   CROSSTALK — CE QUE SEULE LA PAGE PEUT MESURER
   --------------------------------------------------------------------------
   LE SERVEUR NE VOIT QUE CE QU'ON LUI ENVOIE, et la section Crosstalk demande
   trois choses que la simulation d'impédance ne demandait pas. Aucune n'est un
   raffinement : sans elles, les contrôles de plan de référence ne diraient
   RIEN, et une liste vide de zones à risque se lit « rien à signaler » — ce
   qui est exactement le contraire de la vérité.

   CE QUI CHANGE PAR RAPPORT À L'ÉDITEUR PCB, et pourquoi ce code n'est pas le
   sien. L'éditeur connaît ses vias — position, PORTÉE, net — et ses zones de
   cuivre une par une. Une carte livrée en IPC-2581 ne donne ni l'une ni
   l'autre sous cette forme :

     · UN PERÇAGE NE DÉCLARE PAS SA PORTÉE. Le format porte sa position, son
       diamètre et son net, jamais les couches qu'il traverse. On le suppose
       TRAVERSANT — comme partout ailleurs sur cette page (`simRetoursIpc`) —
       et la note le dit. Un via enterré compté comme traversant fait passer
       pour cousu un plan qui ne l'est pas : c'est un contrôle OPTIMISTE, et
       c'est le sens qu'il faut connaître avant de lire la carte ;
     · LE PLAN EST UN CONTOUR, PAS UNE GRILLE DE CASES. `simGrilleCuivre` range
       les ARÊTES du plan pour mesurer un écart ; ici il faut répondre à « y
       a-t-il du cuivre de masse SOUS ce point », ce qui est une question
       d'appartenance et non de distance. On teste donc le point dans le
       contour, trous compris, avec une boîte englobante en garde — un plan de
       carte livrée porte des milliers de sommets, et le pas de sonde en
       demande deux mille.

   ET QUAND ON N'A PAS PU REGARDER, ON N'ENVOIE PAS LE CHAMP. Un plan de
   référence dont aucun contour ne couvre le parcours n'est pas un plan sans
   fente : c'est un plan qu'on ne sait pas sonder, et le dire est la seule
   réponse honnête. Le serveur écrit alors « rien n'a pu être examiné » au lieu
   de « aucune zone de vigilance ».
   ========================================================================== */
const SIM_XT_PAS_IPC=0.5;         /* mm — le pas de sonde du plan de référence */
const SIM_XT_SONDES_MAX_IPC=2000; /* au-delà, on grossit le pas plutôt que d'inonder */

/* Le parcours, plage par plage, avec son abscisse curviligne cumulée.

   `g.envoi` ET `g.objets` MARCHENT EN PAS, un pour un : `simSegments` les
   empile ensemble, et c'est ce qui permet de tenir la longueur (envoyée au
   serveur, en millimètres) d'un côté et la géométrie (la polyligne du modèle,
   en unités fichier) de l'autre. C'est le même axe que celui du serveur
   (`_parcours`), et il faut que ce soit le même : c'est lui qui met un via de
   couture et un pic de couplage à la même abscisse sur la carte. */
function simXtParcoursIpc(g){
  const out=[];
  let s=0;
  for(let i=0;i<g.objets.length;i++){
    const l=((g.envoi[i]||{}).length)||0;
    out.push({o:g.objets[i], s0:s, longueur:l});
    s+=l;
  }
  return {liste:out, total:s};
}

/* L'abscisse curviligne d'un point du plan, en MILLIMÈTRES, ou -1 s'il ne
   tombe sur aucune plage du parcours. Le point est en unités FICHIER, comme
   tout ce qui vient du modèle.

   ON PROJETTE SUR CHAQUE PLAGE ET L'ON GARDE LA PLUS PROCHE : deux plages d'un
   même repli peuvent toutes deux accepter la projection, et prendre la
   première venue placerait le via à l'autre bout. */
function simXtAbscisseIpc(par,x,y){
  let meilleur=-1, dmin=Infinity;
  for(const e of par.liste){
    const o=e.o;
    const total=o.cum[o.cum.length-1]||0;
    if(!(total>0))continue;
    const pr=simProjPoly(o.piste.p,o.cum,x,y);
    if(!pr||pr.d>=dmin)continue;
    const u=pr.s/total;
    const a=Math.min(o.u1,o.u2), b=Math.max(o.u1,o.u2);
    if(u<a-1e-6||u>b+1e-6)continue;
    const etendue=b-a;
    let frac=(etendue<1e-9)?0:(u-a)/etendue;
    /* LE PARCOURS REMONTE LA POLYLIGNE quand la plage est retournée : son
       abscisse zéro est alors le bout u2, pas le bout u1. */
    if(o.retourne)frac=1-frac;
    dmin=pr.d;
    meilleur=e.s0+Math.max(0,Math.min(1,frac))*e.longueur;
  }
  return meilleur;
}

/* Les perçages de masse, chacun à son abscisse et de son côté. Le couloir est
   celui de `simCoutureIpc` — la même règle mesurée deux fois finirait par
   donner deux réponses.

   LE CÔTÉ SUIT LE SENS DU PARCOURS, et non celui de la polyligne : sur une
   plage retournée il s'inverse. Le serveur groupe les coutures par côté pour
   mesurer le pas de chacun ; un signe qui bascule au milieu du parcours
   couperait un côté en deux et fabriquerait deux trous là où il n'y en a
   aucun. */
function simXtCoutureIpc(par,idx){
  const out=[];
  if(!idx||!idx.size||!V.parNet)return out;
  const k=simKUnite();
  for(const n of V.parNet){
    if(!n||!n.nom||!idx.has(n.i))continue;
    for(const t of (n.trous||[])){
      /* Un trou NON métallisé ne coud rien : même règle que le via de
         signal, et que le chemin du courant continu. */
      if(/NON/i.test(t.p||""))continue;
      const s=simXtAbscisseIpc(par,t.x,t.y);
      if(s<0)continue;
      let cote=0, dist=Infinity;
      for(const e of par.liste){
        const o=e.o;
        const pr=simProjPoly(o.piste.p,o.cum,t.x,t.y);
        if(!pr)continue;
        const d=(pr.d-(o.piste.w||0)/2-(t.d||0)/2)*k;
        if(d>=dist)continue;
        dist=d;
        cote=((pr.cote>=0)?1:-1)*(o.retourne?-1:1);
      }
      if(!(dist<=SIM_COULOIR))continue;
      out.push({s:Math.round(s*1000)/1000, cote:cote});
    }
  }
  return out.sort((a,b)=>a.s-b.s);
}

/* Le plan de référence le plus proche d'un conducteur : d'abord dessous, puis
   dessus. C'est le même ordre que `section_de_couche` côté serveur — le plan
   qui porte le retour est celui qui fait face à la piste, et sur un empilage
   courant il est en dessous. Rend l'index de COUCHE DU MODÈLE, celui qui porte
   les contours de plan, ou -1. */
function simXtPlanDeIpc(cu){
  if(!LT.pret)return -1;
  for(let i=cu+1;i<LT.cu.length;i++)if(LT.cu[i].plan)return LT.cu[i].couche;
  for(let i=cu-1;i>=0;i--)if(LT.cu[i].plan)return LT.cu[i].couche;
  return -1;
}

/* Un point dans un contour, par lancer de rayon. Les coordonnées sont celles
   du fichier, comme le contour. */
function simXtDansContourIpc(pts,x,y){
  if(!pts||pts.length<6)return false;
  let dedans=false;
  const n=pts.length/2;
  for(let i=0,j=n-1;i<n;j=i++){
    const xi=pts[2*i], yi=pts[2*i+1], xj=pts[2*j], yj=pts[2*j+1];
    if((yi>y)!==(yj>y)&&x<(xj-xi)*(y-yi)/((yj-yi)||1e-12)+xi)dedans=!dedans;
  }
  return dedans;
}

/* Les contours de masse d'une couche, avec leur boîte englobante, mis en
   cache. LA BOÎTE EST LA MOITIÉ DU COÛT : un plan de carte livrée porte des
   milliers de sommets, et le pas de sonde en demande deux mille — sans elle on
   testerait chaque sommet deux mille fois pour un contour qui ne couvre même
   pas le parcours. */
let SIM_XT_PLANS_IPC=new Map();
let SIM_XT_PLANS_SRC_IPC=null;

function simXtContoursIpc(coucheIdx,idx){
  if(SIM_XT_PLANS_SRC_IPC!==V.modele){
    SIM_XT_PLANS_IPC=new Map();
    SIM_XT_PLANS_SRC_IPC=V.modele;
  }
  const cle=coucheIdx+"|"+[...(idx||[])].sort().join(",");
  if(SIM_XT_PLANS_IPC.has(cle))return SIM_XT_PLANS_IPC.get(cle);
  const out=[];
  const boite=function(p){
    let x1=Infinity,y1=Infinity,x2=-Infinity,y2=-Infinity;
    for(let i=0;i+1<p.length;i+=2){
      x1=Math.min(x1,p[i]); x2=Math.max(x2,p[i]);
      y1=Math.min(y1,p[i+1]); y2=Math.max(y2,p[i+1]);
    }
    return [x1,y1,x2,y2];
  };
  const c=V.couches[coucheIdx];
  for(const pl of ((c&&c.plans)||[])){
    /* SEUL LE CUIVRE DE MASSE EST UN PLAN DE RETOUR. Le cuivre d'un AUTRE net
       posé sur la couche de plan est un TROU du retour tout autant qu'une
       absence de cuivre : le courant ne peut pas y passer.

       `pl.n` EST UN INDICE DE NET, pas un nom — c'est ainsi que `mdlCharger`
       range les plans, et c'est ce que lit déjà `simGrilleCuivre`. On attend
       donc `simRefIdx()` et jamais `simRefSet()` : la seconde comparerait des
       noms à des indices, ne trouverait jamais rien, et rendrait un plan de
       masse entièrement percé de fentes qui n'existent pas. */
    if(idx&&idx.size&&!idx.has(pl.n))continue;
    for(const ct of (pl.g||[])){
      if(!ct.o||ct.o.length<6)continue;
      out.push({o:ct.o, b:boite(ct.o),
                t:(ct.t||[]).filter(t=>t&&t.length>=6)});
    }
  }
  SIM_XT_PLANS_IPC.set(cle,out);
  return out;
}

/* Y a-t-il du cuivre DE MASSE sur cette couche, en ce point ? */
function simXtZoneMasseIpc(coucheIdx,x,y,idx){
  for(const ct of simXtContoursIpc(coucheIdx,idx)){
    if(x<ct.b[0]||x>ct.b[2]||y<ct.b[1]||y>ct.b[3])continue;
    if(!simXtDansContourIpc(ct.o,x,y))continue;
    let trou=false;
    for(const t of ct.t)if(simXtDansContourIpc(t,x,y)){trou=true;break;}
    if(!trou)return ct;
  }
  return null;
}

/* Les discontinuités du plan sous le parcours, en intervalles d'abscisse.

   REND `null` QUAND ON N'A PAS SU SONDER, et c'est la moitié de l'intérêt : un
   plan de référence dont aucun contour ne couvre le parcours n'est pas un plan
   sans fente, c'est un plan qu'on ne voit pas. Rendre une liste vide ferait
   écrire « aucune zone de vigilance » sous un contrôle qui n'a jamais eu
   lieu. */
function simXtFentesIpc(par,idx){
  if(!par.total||!LT.pret)return null;
  const pas=Math.max(SIM_XT_PAS_IPC,par.total/SIM_XT_SONDES_MAX_IPC);
  let sondable=false;
  const trous=[];
  let courant=null;
  for(const e of par.liste){
    const o=e.o;
    const cu=simCuDe(o.coucheIdx);
    if(cu<0)continue;
    const plan=simXtPlanDeIpc(cu);
    /* UNE COUCHE SANS PLAN N'A PAS DE FENTE À AVOIR : c'est un défaut d'un
       autre ordre, que l'onglet Impédance signale déjà. On passe, sans
       compter cette plage comme sondée. */
    if(plan<0)continue;
    if(!simXtContoursIpc(plan,idx).length)continue;
    sondable=true;
    const n=Math.max(1,Math.round(e.longueur/pas));
    const a=Math.min(o.u1,o.u2), b=Math.max(o.u1,o.u2);
    for(let j=0;j<=n;j++){
      const f=j/n;
      const u=o.retourne?(b-(b-a)*f):(a+(b-a)*f);
      const p=simSurPoly(o.piste.p,o.cum,u);
      const s=e.s0+f*e.longueur;
      if(simXtZoneMasseIpc(plan,p.x,p.y,idx)){
        if(courant){trous.push(courant);courant=null;}
      }else if(courant&&s-courant.fin<=pas*1.5){
        courant.fin=s;
      }else{
        if(courant)trous.push(courant);
        courant={debut:s, fin:s};
      }
    }
  }
  if(courant)trous.push(courant);
  if(!sondable)return null;
  /* UN SEUL POINT SANS CUIVRE N'EST PAS UNE FENTE : c'est le pas de sonde qui
     tombe dans un dégagement d'antipad. On garde ce qui dure au moins deux
     pas — en deçà, on inonderait la carte de marques que rien ne justifie. */
  const r3=x=>Math.round(x*1000)/1000;
  return trous.filter(t=>t.fin-t.debut>=pas*1.5)
    .map(t=>({s:r3(t.debut), longueur:r3(t.fin-t.debut),
              quoi:"le plan de référence n'a pas de cuivre de masse sous le "+
                   "parcours sur "+r3(t.fin-t.debut)+" mm"}));
}

/* Les perçages de masse à portée du parcours, pour juger les changements de
   couche. On envoie tous ceux de la boîte élargie : c'est le serveur qui
   mesure la distance, et il le fait au droit de la transition.

   LA PORTÉE VIENT DU FICHIER QUAND IL LA DÉCLARE, et c'est le sens de l'erreur
   qui l'imposait. IPC-2581 la porte sur le calque de perçage (`<Span
   fromLayer toLayer>`, voir `_lire_span` dans `python/ipc2581_parser.py`), et
   le modèle la transporte sous `sa` / `sb`. Un via enterré compté comme
   traversant fait passer pour REFERMÉ un retour qui ne l'est pas : ici,
   contrairement au solveur DC, l'erreur ne penche pas du côté prudent — elle
   rassure. Ce qui reste supposé traversant est ce que le fichier ne déclare
   pas, et `simXtPorteesSupposees` compte ceux-là pour que la note du document
   ne parle que d'eux. */
function simXtPortee(t){
  const cuMax=Math.max(0,LT.cu.length-1);
  const ra=(t.sa!=null)?simDCRangIpc(t.sa):-1;
  const rb=(t.sb!=null)?simDCRangIpc(t.sb):-1;
  if(ra>=0&&rb>=0&&ra!==rb)
    return {a:simRangCu(Math.min(ra,rb)), b:simRangCu(Math.max(ra,rb)),
            declaree:true};
  return {a:simRangCu(0), b:simRangCu(cuMax), declaree:false};
}
function simXtViasMasseIpc(par,idx){
  const out=[];
  if(!idx||!idx.size||!V.parNet||!LT.pret)return out;
  const k=simKUnite();
  const R=SIM_RAYON_RETOUR_IPC;
  const r3=x=>Math.round(x*1000)/1000;
  for(const n of V.parNet){
    if(!n||!n.nom||!idx.has(n.i))continue;
    for(const t of (n.trous||[])){
      if(/NON/i.test(t.p||""))continue;
      let proche=false;
      for(const e of par.liste){
        const o=e.o;
        const pr=simProjPoly(o.piste.p,o.cum,t.x,t.y);
        if(pr&&(pr.d-(o.piste.w||0)/2)*k<=R){proche=true;break;}
      }
      if(!proche)continue;
      const p=simXtPortee(t);
      out.push({x:r3(t.x*k), y:r3(t.y*k), a:p.a, b:p.b,
                /* LE DOCUMENT PORTE L'AVEU AVEC LA COTE. Le serveur n'a pas à
                   s'en servir ; c'est la fiche qui doit pouvoir dire lesquels
                   de ces vias ont une portée lue et lesquels sont supposés. */
                portee_declaree:p.declaree});
    }
  }
  return out;
}
/* Combien, parmi les vias de masse envoyés, sont encore SUPPOSÉS traversants.
   Zéro veut dire que la note d'optimisme n'a plus lieu d'être : c'est le seul
   cas où elle ne doit pas s'écrire, et l'écrire quand même apprendrait au
   lecteur à ne plus la lire. */
function simXtPorteesSupposees(vias){
  return (vias||[]).filter(v=>!v.portee_declaree).length;
}

/* ==========================================================================
   LES ZONES À RISQUE SUR LE CUIVRE — CE QUE CET OUTIL SAIT EN DIRE
   --------------------------------------------------------------------------
   L'ALGORITHME EST DANS `../commun/simulation-em.js`, comme pour l'éditeur
   PCB : il projette le cuivre d'une victime sur le parcours de l'agresseur,
   garde ce qui tombe dans la plage et découpe en morceaux contigus. Ce qu'on
   fournit ici tient en deux formes neutres, en MILLIMÈTRES — l'unité de l'axe
   du serveur, et non celle du fichier.

   LA CONVERSION EST LE SEUL PIÈGE DE CE BLOC. Le canevas de cette page vit en
   unités FICHIER (millimètres ou pouces selon ce que le fichier déclare) ; le
   serveur, lui, ne connaît que les millimètres. On sort donc en millimètres —
   `× simKUnite()` — et l'on redivise au moment de tracer. Une seule des deux
   moitiés oubliée, et la surimpression se poserait à vingt-cinq fois sa place
   sur un fichier en pouces, ce qui se voit ; ou pas du tout, ce qui ne se voit
   pas.
   ========================================================================== */

function simXtGeometrieIpc(){
  const k=simKUnite();
  const g=simSegments(null,(V.net!=null&&V.net>=0)?V.parNet[V.net]:null);
  const par=simXtParcoursIpc(g);
  const parcours=par.liste.map(function(e){
    const o=e.o;
    const a=Math.min(o.u1,o.u2), b=Math.max(o.u1,o.u2);
    /* On échantillonne la portion de polyligne que cette plage couvre, dans le
       SENS DU PARCOURS : sur une plage retournée, l'abscisse zéro est le bout
       u2. Le trait suivrait sinon la piste à l'envers, et toutes les plages de
       ce tronçon tomberaient en miroir. */
    const n=Math.max(2,Math.ceil(e.longueur/SIM_XT_PAS_IPC));
    const pts=[];
    for(let j=0;j<=n;j++){
      const f=j/n;
      const u=o.retourne?(b-(b-a)*f):(a+(b-a)*f);
      const p=simSurPoly(o.piste.p,o.cum,u);
      pts.push(p.x*k,p.y*k);
    }
    return {s0:e.s0, longueur:e.longueur, pts:pts};
  });

  const victimes={};
  for(const net of (typeof simXtVictimesVoulues==="function"
                    ? simXtVictimesVoulues() : [])){
    if(victimes[net])continue;
    const traits=[];
    for(const n of (V.parNet||[])){
      if(!n||!n.nom||n.nom!==net)continue;
      for(const pi of (n.pistes||[])){
        if(!pi.p||pi.p.length<4)continue;
        traits.push(pi.p.map((v,i)=>v*k));
      }
      /* UN ARC EST DU CUIVRE QUI COURT COMME UN AUTRE, et le format le range
         ailleurs. L'oublier laisserait sans surimpression exactement les
         portions courbes — celles où une victime se rapproche. */
      for(const a of (n.arcs||[])){
        const pts=simArcEnPolyligne(a);
        if(pts&&pts.length>=4)traits.push(pts.map(v=>v*k));
      }
    }
    victimes[net]=traits;
  }
  return {parcours:parcours, victimes:victimes};
}

/* La surimpression. Même place que le chevelu du retour dans la pile de
   dessin : elle désigne des portions de cuivre, elle ne décrit pas le cuivre. */
function simXtRisqueTraceIpc(c,dpr){
  if(typeof simXtRisqueGeom!=="function")return;
  const k=simKUnite();
  /* LA CHALEUR PASSE D'ABORD, LES PLAGES PAR-DESSUS, le point de la réglette
     en dernier : la chaleur décrit tout le longement, les plages ne désignent
     que ce qui est à reprendre et portent un verdict, et le point désigne un
     millimètre. Les unités sont celles du monde, comme le cuivre recouvert. */
  const conv=(x,y)=>[x/k,y/k];
  simXtPeindreChaleur(c,conv,0.38/k);
  const zones=simXtRisqueGeom();
  /* LE RAYON DU VISEUR EST EN PIXELS D'ÉCRAN, et non en unités du monde comme
     la chaleur : un repère qui grossit avec le zoom finit par cacher le
     millimètre de piste qu'il désigne. `V.vue.scale` est le nombre de pixels
     par unité du fichier, donc son inverse convertit dans l'autre sens. */
  const vis=4.5/Math.max(1e-9,V.vue.scale);
  if(!zones.length){simXtPeindreCurseur(c,conv,vis);return;}
  c.save();
  c.lineCap="round"; c.lineJoin="round";
  for(const z of zones){
    c.strokeStyle=simXtRisqueCouleur(z);
    /* L'épaisseur est en unités monde, comme le cuivre qu'elle recouvre : on
       veut continuer de reconnaître le tracé dessous. */
    c.lineWidth=0.45/k;
    for(const m of z.traits){
      c.beginPath();
      c.moveTo(m[0]/k,m[1]/k);
      for(let i=2;i+1<m.length;i+=2)c.lineTo(m[i]/k,m[i+1]/k);
      c.stroke();
    }
  }
  c.restore();
  simXtPeindreCurseur(c,conv,vis);
}

const SIM_IPC={
  outil:"visionneuse-ipc2581",

  carte:function(){
    return (V.fichier||"carte").replace(/\.[^.]+$/,"");
  },

  refCandidats:simRefCandidatsIpc,
  provenance:simProvenanceIpc,

  /* CE QU'IL Y A AU BOUT DE LA CHAÎNE, pour que le panneau nomme ses deux
     ports. « Port 1 sur la pastille J1.1 » se vérifie sans quitter la fiche ;
     un couple de coordonnées oblige à aller regarder sur la carte, et c'est
     cette vérification-là qu'on saute.

     LA PLUS PROCHE, PAS LA PREMIÈRE TROUVÉE : deux pastilles voisines d'un pas
     de 0,5 mm se recouvrent presque, et prendre celle qui sort d'abord de la
     liste donnerait un nom une fois sur deux. Le rayon de recherche est celui
     de la pastille, jamais moins de cinq centièmes — un bout de piste s'arrête
     au ras du cuivre, pas toujours au centre.

     L'indice `layer` du document désigne une entrée de l'empilage à plat :
     c'est l'inverse de `simRangCu()`, et `LT.cu[k].couche` ramène ensuite à la
     couche du modèle, qui est celle qui porte les pastilles. */
  bout:function(pt,obj){
    if(!(pt&&pt.length>=2)||!LT.pret)return "";
    const cu=LT.cu[Math.floor(((obj&&obj.layer)||0)/2)];
    const c=cu?V.couches[cu.couche]:null;
    if(!c)return "";
    let mieux=null;
    for(const q of (c.pads||[])){
      const d=Math.hypot(q.x-pt[0],q.y-pt[1]);
      if(d<=Math.max((q.d||0)/2,0.05)&&(!mieux||d<mieux.d))mieux={d:d,q:q};
    }
    if(!mieux)return "";
    const q=mieux.q;
    const ref=(q.hote&&q.hote.ref)?String(q.hote.ref):"";
    const pin=(q.pad&&q.pad.pin!=null)?String(q.pad.pin):"";
    /* Une pastille sans composant hôte est une pastille libre — un via, un
       point de test. On ne lui invente pas de repère : dire « une pastille »
       est vrai, « la pastille .1 » ne l'est pas. */
    if(!ref)return "une pastille";
    return "la pastille "+ref+(pin?"."+pin:"");
  },


  /* ---------------------------------------------------------------------
     LA CHUTE CONTINUE
     --------------------------------------------------------------------- */

  dcBornes:function(){
    /* Relues à chaque affichage : une carte refermée ou rechargée ne doit pas
       laisser de bornes fantômes dans le panneau. */
    SIM_DCB.bornes=SIM_DCB.bornes.filter(b=>{
      if(!LT.pret)return false;
      const cu=LT.cu[b.couche];
      const c=cu?V.couches[cu.couche]:null;
      if(!c)return false;
      return (c.pads||[]).some(q=>Math.abs(q.x-b.x)<1e-9&&
                                  Math.abs(q.y-b.y)<1e-9);
    });
    return SIM_DCB.bornes;
  },

  dcChoisir:function(role){
    SIM_DCB.attente=(role==="charge")?"charge":"source";
    simDCAstuce("Cliquez la pastille "+
        (SIM_DCB.attente==="source"
           ? "de la SOURCE — l'alimentation, dont on impose la tension"
           : "de la CHARGE — le consommateur, dont on impose le courant")+".");
    return true;
  },

  dcValeur:function(k,v){
    const b=SIM_DCB.bornes[k];
    if(b)b.valeur=(+v)||0;
  },

  dcOublier:function(k){
    if(k==null)SIM_DCB.bornes=[];
    else SIM_DCB.bornes.splice(k,1);
    SIM_DCB.attente=null;
  },

  /* LA COUCHE QUE CET OUTIL PROPOSE DE PEINDRE. Cette page affiche toutes les
     couches à la fois et n'a pas de couche active : elle propose donc celle de
     la CHARGE — le point dont on cherche la chute. Ce n'est qu'une
     proposition, et c'était tout le défaut : la fiche permet maintenant d'en
     choisir une autre, voir `simDCCouchePeinte`. */
  dcCoucheProposee:function(){
    const b=SIM_DCB.bornes.find(o=>o.role==="charge")||SIM_DCB.bornes[0];
    return b?b.couche:-1;
  },
  dcNomCouche:function(rang){
    const cu=LT.pret?LT.cu[rang]:null;
    return cu?cu.nom:"";
  },

  canevasHorsEcran:function(w,h){
    try{
      const o=document.createElement("canvas");
      o.width=w; o.height=h;
      return (o.getContext&&o.getContext("2d"))?o:null;
    }catch(_){return null;}
  },

  peindreDC:function(){
    if(typeof dessiner==="function")dessiner();
  },

  /* Le problème résistif complet, tiré des deux bornes et de la carte livrée. */
  cuivreDC:function(){
    if(!V.modele)
      return {erreur:"Aucune carte ouverte.",
              conseil:"Ouvrez un fichier IPC-2581."};
    if(!LT.pret)
      return {erreur:"L'empilage de calcul n'est pas prêt.",
              conseil:"Complétez-le dans le panneau « La carte », sous "+
                      "« Empilage du calcul » : sans épaisseur de cuivre, "+
                      "une résistance n'a pas de valeur."};
    const B=this.dcBornes();
    const alims=B.filter(b=>b.role==="source");
    const charges=B.filter(b=>b.role==="charge");
    if(!alims.length||!charges.length)
      return {erreur:"Il faut au moins une source et une charge.",
              conseil:"« + source » désigne l'alimentation, dont on impose la "+
                      "TENSION ; « + charge » le consommateur, dont on impose "+
                      "le COURANT."};
    const sansNet=B.filter(b=>!b.net);
    if(sansNet.length)
      return {erreur:"Sans net : "+sansNet.map(b=>b.nom).join(", ")+".",
              conseil:"La chute se calcule le long d'un net : choisissez des "+
                      "pastilles que le fichier rattache à un net."};
    const nets=[...new Set(B.map(b=>b.net))];
    if(nets.length>1)
      return {erreur:"Les bornes ne sont pas toutes sur le même net ("+
                     nets.join(", ")+").",
              conseil:"Le courant ne passe pas d'un net à l'autre : "+
                      "n'en gardez qu'un."};

    const net=nets[0], k=simKUnite();
    const rang=V.modele.nets.indexOf(net);
    const N=(rang>=0)?V.parNet[rang]:null;
    if(!N)
      return {erreur:"Le net "+net+" n'est pas dans le fichier."};

    const polygones=[], creux=[], vias=[], notes=[];
    /* CE QUI EST ÉCARTÉ, ET SUR QUELLE COUCHE. « 90 forme(s) écartée(s) » ne
       se corrige pas : il faut savoir LAQUELLE des couches manque à l'empilage
       de calcul pour aller la compléter. Et le compte par couche dit s'il
       s'agit d'un oubli — une couche de cuivre entière absente — ou du cas
       normal : du cuivre sur une couche technique, masque ou sérigraphie, qui
       n'a rien à faire dans un réseau résistif. */
    let horsEmpilage=0;
    const ecartees=new Map();
    const pose=(couche,pts)=>{
      const r=simDCRangIpc(couche);
      if(r<0){
        horsEmpilage++;
        ecartees.set(couche,(ecartees.get(couche)||0)+1);
        return;
      }
      polygones.push({vertices:pts, couche:r, net:net, epaisseur:LT.cu[r].ep});
    };

    for(const pi of N.pistes)
      for(const g of simDCPolysPisteIpc(pi,k))pose(pi.c,g);
    for(const a of N.arcs)
      for(const g of simDCPolysArcIpc(a,k))pose(a.c,g);
    for(const pl of N.plans)
      for(const contour of (pl.g||[])){
        const plat=o=>{const t=[];for(let i=0;i+1<o.length;i+=2)
                         t.push([o[i]*k,o[i+1]*k]);return t;};
        if(contour.o&&contour.o.length>=6)pose(pl.c,plat(contour.o));
        /* LES DÉCOUPES DU PLAN partent en `trou` : un plan évidé qu'on
           calculerait plein rendrait une chute trop faible — du côté qui
           rassure, le pire. */
        for(const t of (contour.t||[]))
          if(t&&t.length>=6){
            const r=simDCRangIpc(pl.c);
            if(r>=0)creux.push({vertices:plat(t), couche:r, net:net,
                                epaisseur:LT.cu[r].ep, trou:true});
          }
      }
    for(const q of N.pads){
      const g=simDCPadPolysIpc(q,k);
      for(const pts of g.plein)pose(q.c,pts);
      for(const pts of g.creux){
        const r=simDCRangIpc(q.c);
        if(r>=0)creux.push({vertices:pts, couche:r, net:net,
                            epaisseur:LT.cu[r].ep, trou:true});
      }
    }
    if(horsEmpilage){
      /* LA PLUS FOURNIE D'ABORD : c'est celle qui pèse, et celle qu'on va
         chercher à compléter. */
      const detail=[...ecartees.entries()]
        .sort((a,b)=>b[1]-a[1])
        .map(([c,n])=>{
          const nom=(V.couches&&V.couches[c])?V.couches[c].nom:("couche "+c);
          return nom+" ("+n+")";
        });
      notes.push(horsEmpilage+" forme(s) écartée(s), leur couche n'étant pas "+
                 "dans l'empilage de calcul : "+detail.slice(0,6).join(", ")+
                 (detail.length>6?", et "+(detail.length-6)+" autre(s)":"")+
                 ". Si l'une de ces couches porte du CUIVRE, le chemin "+
                 "qu'elle offre n'est pas dans ce résultat — complétez "+
                 "l'empilage dans « La carte ». Si ce sont des couches "+
                 "techniques (masque, sérigraphie, pâte), c'est normal : "+
                 "elles ne conduisent pas.");
    }
    if(!polygones.length)
      return {erreur:"Le net "+net+" ne porte aucun cuivre sur les couches "+
                     "de l'empilage.",
              conseil:"Complétez l'empilage de calcul, ou choisissez un "+
                      "autre net."};

    /* CE QUI FAIT CHANGER DE COUCHE, ET C'EST DEUX CHOSES.

       1. LES PERÇAGES métallisés que le fichier liste, CHACUN SUR SA PORTÉE.
          IPC-2581 la déclare sur le CALQUE de perçage
          (`<Layer layerFunction="DRILL"><Span fromLayer toLayer/>`), et le
          parseur la fait voyager en rangs de couche sous `sa` / `sb` — voir
          `_lire_span` dans `python/ipc2581_parser.py`. Un via borgne ou
          enterré ne relie donc plus que les couches qu'il traverse.

          CE QUE ÇA CORRIGEAIT, ET DANS LES DEUX SENS. Tous les trous étaient
          pris TRAVERSANTS. Sur une carte à six couches, un borgne 1-2 était
          monté en CHAÎNE 1→2→3→4→5→6 : cinq résistances en série là où il en
          faut une, donc une résistance de passage largement surestimée — le
          côté prudent —, mais aussi QUATRE liaisons verticales inventées entre
          des couches que rien ne joint. Un courant pouvait alors descendre par
          un chemin qui n'existe pas, et la chute ressortait trop FAIBLE : le
          côté qui rassure.

          SANS `sa` / `sb`, ON SUPPOSE ENCORE TRAVERSANT, et le panneau le dit.
          C'est l'hypothèse qui ne perd aucun chemin : la supposer borgne
          couperait une liaison réelle, laisserait du cuivre flottant et ferait
          refuser tout le calcul. Les deux comptes sont séparés dans les notes
          — déclarés d'un côté, supposés de l'autre —, parce que ce ne sont pas
          les mêmes chiffres qui se défendent.

          Un perçage NON métallisé ne conduit rien : il est écarté, et compté.

       2. LE TUBE D'UNE PASTILLE POSÉE SUR PLUSIEURS COUCHES. Un padstack qui
          place du cuivre sur deux conducteurs DÉCRIT un trou métallisé : c'est
          le tube qui joint ses anneaux. Ne pas l'envoyer laissait ces anneaux
          électriquement flottants, et le solveur refusait tout le calcul —
          « 1240 nœuds n'atteignent aucune référence ». Ce défaut ne s'est vu
          qu'en envoyant au serveur le document que la visionneuse produit
          vraiment ; le côté éditeur avait eu exactement le même, pour
          exactement la même raison.

       DANS LES DEUX CAS on ne relie que les couches qui portent effectivement
       du cuivre du net sous le trou : relier une couche vide ne servirait à
       rien et ferait une ligne « hors calcul » de plus dans le tableau. */
    const dedans=(x,y,pts)=>{
      let d=false;
      for(let i=0,j=pts.length-1;i<pts.length;j=i++){
        const yi=pts[i][1], yj=pts[j][1];
        if((yi>y)!==(yj>y)&&
           x<(pts[j][0]-pts[i][0])*(y-yi)/(yj-yi)+pts[i][0])d=!d;
      }
      return d;
    };
    /* LES EMPLACEMENTS DE TUBE, DÉDOUBLONNÉS PAR DISTANCE — et non par case
       d'arrondi, ce qui était le défaut. Un perçage tombe presque toujours
       SOUS une pastille, et le compter deux fois mettrait deux résistances en
       parallèle là où il n'y a qu'un tube : le courant s'y partagerait, et
       chacune des deux lignes du tableau annoncerait la moitié du passage
       réel.

       CE QUI NE MARCHAIT PAS. La clé était `Math.round(x*100)` : deux
       emplacements distants de DEUX MICRONS mais posés de part et d'autre d'un
       demi-centième — 32,1049 et 32,1051 — tombaient dans deux cases
       différentes et échappaient au dédoublonnage. Sur une carte de mille
       pastilles, quelques-unes tombent forcément sur cette frontière, et rien
       ne le signalait.

       ON REGARDE DONC LES NEUF CASES VOISINES et on compare les distances
       vraies. La tolérance est large — un dixième de millimètre — parce que
       deux perçages DISTINCTS ne sont jamais si proches : aucune règle de
       fabrication ne laisse deux trous à moins de deux ou trois dixièmes. */
    const tubes=new Map();
    const TOL=0.1;                       // mm entre deux trous « le même »
    const cle=(x,y)=>Math.round(x/TOL)+"/"+Math.round(y/TOL);
    /* Le tube déjà posé à cet endroit, à la tolérance près, ou null. */
    const dejaLa=(x,y)=>{
      const ix=Math.round(x/TOL), iy=Math.round(y/TOL);
      for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++){
        const t=tubes.get((ix+dx)+"/"+(iy+dy));
        if(t&&Math.hypot(t.x-x,t.y-y)<=TOL)return t;
      }
      return null;
    };
    /* Et le même voisinage pour les trous NUS : une pastille posée sur un trou
       déclaré non métallisé ne joint rien, et l'arrondi ne doit pas laisser
       passer un tube là-dessus. */
    const nuLa=(x,y)=>{
      const ix=Math.round(x/TOL), iy=Math.round(y/TOL);
      for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++)
        if(nus.has((ix+dx)+"/"+(iy+dy)))return true;
      return false;
    };
    let nonMetallises=0;
    /* UN TROU NON MÉTALLISÉ INTERDIT LE TUBE À SON EMPLACEMENT, et pas
       seulement pour lui-même : une pastille posée là-dessus sur deux couches
       ne les joint pas non plus, puisque rien n'est plaqué dans le trou. Sans
       cette liste, la règle de pastille ci-dessous aurait métallisé un trou
       que le fichier déclare nu. */
    const nus=new Set();
    for(const t of (N.trous||[])){
      if(/NON/i.test(t.p||"")){
        nonMetallises++;
        nus.add(cle(t.x*k,t.y*k));
        continue;
      }
      /* LA PORTÉE, TRADUITE EN RANGS DE CONDUCTEUR. `sa` / `sb` sont des
         index de COUCHE du modèle ; le document DC parle en rangs de `LT.cu`.
         Une portée qui désigne une couche absente de l'empilage de calcul —
         un diélectrique, une couche masquée — ne se traduit pas : on la laisse
         tomber plutôt que de borner le tube n'importe où. */
      const ra=(t.sa!=null)?simDCRangIpc(t.sa):-1;
      const rb=(t.sb!=null)?simDCRangIpc(t.sb):-1;
      const borne=(ra>=0&&rb>=0)
        ? {lo:Math.min(ra,rb), hi:Math.max(ra,rb), src:t.ss||"fichier"}
        : null;
      tubes.set(cle(t.x*k,t.y*k),
                {x:t.x*k, y:t.y*k, d:Math.max((t.d||0)*k,0.05), perce:true,
                 borne:borne});
    }
    /* Les pastilles du net, groupées par emplacement : plus d'une couche, donc
       un tube. Le diamètre de perçage n'est pas dans le modèle ici — on prend
       la pastille moins un anneau de 0,25 mm de part et d'autre, jamais moins
       de 0,05 : c'est un repli, et il est marqué comme tel dans les notes. */
    const parLieu=new Map();
    for(const q of N.pads){
      const c=cle(q.x*k,q.y*k);
      if(!parLieu.has(c))parLieu.set(c,{x:q.x*k, y:q.y*k, d:0, n:0});
      const g=parLieu.get(c);
      g.n++;
      g.d=Math.max(g.d,(q.d||0)*k);
    }
    let supposes=0;
    for(const [c,g] of parLieu){
      if(g.n<2||dejaLa(g.x,g.y)||nuLa(g.x,g.y))continue;
      tubes.set(c,{x:g.x, y:g.y, d:Math.max(g.d-0.5,0.05), perce:false});
      supposes++;
    }

    let nTube=0, nBorne=0, nSuppose=0, nHorsPortee=0;
    for(const t of tubes.values()){
      const touchees=[];
      for(let r=0;r<LT.cu.length;r++){
        /* HORS DE LA PORTÉE DU TROU, IL N'Y A PAS DE TUBE. Un anneau de cuivre
           du bon net sur une couche que le perçage ne traverse pas n'est PAS
           relié par lui : c'est un anneau d'un autre trou, ou du cuivre qui
           passe par là. Le compter serait inventer la liaison verticale que
           tout ce bloc s'efforce de ne plus inventer. */
        if(t.borne&&(r<t.borne.lo||r>t.borne.hi)){
          if(polygones.some(g=>g.couche===r&&dedans(t.x,t.y,g.vertices)))
            nHorsPortee++;
          continue;
        }
        if(polygones.some(g=>g.couche===r&&dedans(t.x,t.y,g.vertices)))
          touchees.push(r);
      }
      if(touchees.length<2)continue;
      nTube++;
      /* UN TUBE DÉDUIT D'UNE PASTILLE (`perce` faux) N'EST PAS « SUPPOSÉ
         TRAVERSANT » : sa portée est celle des couches où le padstack pose du
         cuivre, ce qui est une lecture du fichier et non une hypothèse. Il a
         déjà sa note, sur son perçage supposé. Le compter ici mélangerait deux
         réserves qui ne portent pas sur la même chose. */
      if(t.borne)nBorne++; else if(t.perce)nSuppose++;
      for(let i=0;i<touchees.length-1;i++)
        vias.push({x:t.x, y:t.y, couche_a:touchees[i], couche_b:touchees[i+1],
                   percage:t.d, placage:0.025,
                   /* UN PERÇAGE DÉDUIT D'UNE PASTILLE N'EST PAS UNE COTE. Le
                      drapeau voyage jusqu'au résultat pour que le tableau
                      MARQUE ces lignes : R va comme 1/A, donc un diamètre
                      deviné à cinquante pour cent près se paie double sur
                      l'ohm, et « 0,076 mΩ » se lisait avec le même aplomb que
                      « 0,295 mΩ » mesuré. */
                   percage_suppose:!t.perce,
                   /* LA PORTEE EST-ELLE LUE OU SUPPOSEE ? C'est le SEUL
                      endroit ou l'outil peut inventer du courant : si le trou
                      est en realite borgne, cette liaison n'existe pas, et le
                      courant qui la traverse n'existe pas non plus. Le drapeau
                      voyage jusqu'au resultat pour que la fiche MARQUE ces
                      lignes et chiffre ce qui depend de l'hypothese. */
                   portee_supposee:!t.borne,
                   hauteur:simDCHauteurIpc(touchees[i],touchees[i+1]),
                   net:net,
                   repere:"T"+nTube+(touchees.length>2
                     ?(" "+(touchees[i]+1)+"→"+(touchees[i+1]+1)):"")});
    }
    /* DEUX COMPTES, ET ILS NE SE DÉFENDENT PAS PAREIL : ce qui est déclaré se
       vérifie contre le fichier, ce qui est supposé penche du côté prudent
       pour la résistance et du côté qui rassure pour les chemins inventés. */
    if(nBorne)
      notes.push(nBorne+" trou(s) métallisé(s) montés sur leur PORTÉE "+
                 "déclarée : le fichier dit entre quelles couches ils "+
                 "courent, et les vias borgnes ou enterrés ne relient que "+
                 "celles-là."+
                 (nHorsPortee?" "+nHorsPortee+" anneau(x) du net rencontré(s) "+
                   "hors de la portée d'un trou n'y sont donc PAS raccordés.":""));
    if(nSuppose)
      notes.push(nSuppose+" trou(s) métallisé(s) pris pour TRAVERSANTS : le "+
                 "fichier ne déclare pas leur portée. Un borgne compté ainsi "+
                 "est monté en chaîne sur toute la hauteur — résistance "+
                 "surestimée — et ajoute des liaisons verticales qui "+
                 "n'existent pas.");
    if(supposes)
      notes.push(supposes+" tube(s) déduit(s) d'une pastille posée sur "+
                 "plusieurs couches, avec un perçage SUPPOSÉ.");
    if(nonMetallises)
      notes.push(nonMetallises+" perçage(s) non métallisé(s) écarté(s) : ils "+
                 "ne conduisent pas.");
    /* LES PERÇAGES QUE LE FICHIER NE RATTACHE À AUCUN NET, et qui joindraient
       pourtant deux couches de celui-ci. C'est le cas ordinaire d'un plan
       cousu à un autre plan : l'export ne met de net que sur ce qui vient du
       routage, et les coutures ressortent nues. `N.trous` ne porte que les
       perçages du net, donc ceux-là étaient écartés SANS UN MOT — le cuivre
       de la couche d'arrivée devenait flottant, et le solveur refusait tout en
       parlant de « nœuds qui n'atteignent aucune référence », un message juste
       dont la CAUSE était ailleurs.

       ON NE LES MONTE PAS POUR AUTANT : un perçage sans net relierait le
       premier cuivre venu, celui d'un autre net compris, et un court-circuit
       inventé est pire qu'un chemin manquant. On les COMPTE. */
    let nus2=0;
    for(const t of (V.modele.percages||[])){
      if(t.n===rang)continue;                  // déjà dans N.trous
      if(/NON/i.test(t.p||""))continue;
      const tx=t.x*k, ty=t.y*k;
      let touchees=0;
      for(let r=0;r<LT.cu.length&&touchees<2;r++)
        if(polygones.some(g=>g.couche===r&&dedans(tx,ty,g.vertices)))touchees++;
      if(touchees>=2)nus2++;
    }
    if(nus2)
      notes.push(nus2+" perçage(s) que le fichier ne rattache pas au net "+
                 net+" joindraient pourtant deux de ses couches : ils sont "+
                 "écartés du calcul. Un perçage sans net relierait le premier "+
                 "cuivre venu, et un court-circuit inventé serait pire qu'un "+
                 "chemin manquant — mais si ce sont des coutures de ce plan, "+
                 "le chemin vertical qu'elles portent n'est PAS dans ce "+
                 "résultat.");

    const boite=b=>{
      const r=Math.max((b.d||0)*k,0.1)/2;
      return [b.x*k-r, b.y*k-r, b.x*k+r, b.y*k+r];
    };
    return {
      polygones:polygones.concat(creux),
      vias:vias,
      /* LA TRADUCTION vers les deux listes du solveur : `sources` est celle
         de NEUMANN (courants imposés), donc elle porte les CHARGES, avec un
         courant NÉGATIF puisqu'il sort du cuivre ; `references` est celle de
         DIRICHLET (potentiels imposés), donc elle porte les SOURCES. */
      sources:charges.map(b=>({couche:b.couche, net:net,
                               courant:-Math.abs((+b.valeur)||0),
                               boite:boite(b), repere:b.nom})),
      references:alims.map(b=>({couche:b.couche, net:net,
                                tension:(+b.valeur)||0, boite:boite(b),
                                repere:b.nom})),
      net:net,
      /* Les couches à l'air libre, pour IPC-2221 : la première et la dernière
         de l'empilage de CALCUL. Un coefficient double rend une température
         presque cinq fois plus basse, donc s'en remettre au repli du solveur
         serait risquer de prendre une interne pour une externe. */
      couches_externes:(LT.cu.length>1)?[0, LT.cu.length-1]:[0],
      /* CE QUE LA CARTE EMPORTE DE CHALEUR : voir `simDCThermiqueIpc`. */
      thermique:simDCThermiqueIpc(),
      notes:notes,
      bornes:B.map(b=>b.nom)
    };
  },

  probleme:function(opts){
    /* LA PORTÉE COURANTE, EN UN SEUL DOCUMENT. C'est ce que lit l'export
       .json quand aucun lot n'a été calculé, et ce sur quoi retombe un panneau
       qui ne connaîtrait pas les lots. */
    return simDocIpc(null,V.net,opts,true);
  },

  /* LES LOTS : un document par parcours continu de la sélection.

     UN SEUL MORCEAU DÉSIGNÉ REND UN SEUL LOT, par le chemin exact d'avant : un
     clic, un Maj+clic, un net choisi dans la liste ne doivent pas se mettre à
     partir en plusieurs requêtes parce que leur cuivre est en îlots. Ce sont
     les morceaux pris à Ctrl+clic — et eux seuls — qu'on découpe. */
  problemes:function(opts){
    if(!V.sel||V.sel.length<2){
      const p=simDocIpc(null,V.net,opts,true);
      return p.erreur?p:{lots:[p]};
    }
    if(!V.modele)
      return {erreur:"Aucune carte ouverte.",
              conseil:"Ouvrez un fichier IPC-2581."};
    if(!LT.pret)
      return {erreur:"L'empilage de calcul n'est pas prêt.",
              conseil:"Complétez-le dans le panneau « La carte », "+
                      "sous « Empilage du calcul »."};
    const liste=simZPistes();
    if(!liste.length)
      return {erreur:"La sélection ne porte aucune piste.",
              conseil:"Un boîtier et un perçage n'ont pas d'impédance de "+
                      "ligne : ajoutez au moins une piste à la sélection."};
    const lots=simLotsDePistes(liste);
    /* TROP DE MORCEAUX : ON N'INONDE PAS LE SERVEUR, ET ON LE DIT. Seize lots
       sont déjà seize allers-retours ; au-delà on n'a plus une comparaison mais
       une attente. Le repli est le comportement d'avant — un seul document —,
       ce qui reste juste pour les impédances par tronçon et faux pour la mise
       en cascade, que le serveur refusera en le disant. Ce qui compte est que
       le panneau ne fasse pas semblant d'avoir comparé. */
    if(lots.length>SIM_LOTS_MAX){
      const p=simDocIpc(null,V.net,opts,true);
      if(p.erreur)return p;
      p.notes.unshift("La sélection compte "+lots.length+" morceaux qui ne se "+
        "touchent pas, soit plus que les "+SIM_LOTS_MAX+" lots calculés "+
        "séparément : tout part dans un seul document. Les impédances par "+
        "tronçon et la carte de chaleur restent justes ; la mise en cascade, "+
        "elle, verra une liaison rompue. Réduisez la sélection pour obtenir "+
        "un résultat par morceau.");
      return {lots:[p]};
    }
    const out=[], refuses=[];
    for(const l of lots){
      const netIdx=(l[0]&&l[0].piste&&l[0].piste.n!=null)?l[0].piste.n:-1;
      const p=simDocIpc(l,netIdx,opts,false);
      if(p.erreur){refuses.push(p.erreur);continue;}
      out.push(p);
    }
    if(!out.length)
      return {erreur:refuses[0]||"Aucun morceau de la sélection n'est calculable.",
              conseil:"Complétez l'empilage de calcul, ou choisissez des pistes "+
                      "posées sur des couches qu'il décrit."};
    /* AUCUN REFUS SILENCIEUX : un morceau posé sur une couche absente de
       l'empilage n'a pas d'impédance, et son absence du tableau se lirait comme
       un oubli si personne ne la nommait. */
    for(const r of refuses)
      out[0].notes.push("Un morceau de la sélection a été écarté : "+r);
    return {lots:out};
  },

  /* ==========================================================================
     LE DOCUMENT DE CROSSTALK
     --------------------------------------------------------------------------
     UN SEUL DOCUMENT, JAMAIS DE LOTS, et ce n'est pas une simplification : la
     carte a UN axe de position, celui du parcours de l'agresseur. Découper la
     sélection en morceaux qui ne se touchent pas donnerait plusieurs axes sans
     origine commune, et deux victimes ne se compareraient plus. Une sélection
     éparse est donc envoyée telle quelle, dans l'ordre du chaînage — le même
     que la simulation —, et le serveur en fait un parcours continu.

     L'AGRESSEUR EST LA SÉLECTION, et il peut porter PLUSIEURS nets : le serveur
     prend celui qui porte le plus de cuivre comme référence de l'axe et range
     les autres en agresseurs supplémentaires, avec leurs deux ports. Rien n'est
     codé en dur sur leur nombre.

     `ports` NE PART PAS. Le document de simulation porte les impédances de
     référence de ses deux bouts sous ce nom ; ici les ports sont ceux d'un
     réseau MULTI-PORTS que le serveur pose lui-même à partir de la géométrie,
     et une liste de deux impédances n'y décrit rien. La laisser passer ne
     casserait rien — le serveur ne la lit pas —, mais un champ qui ne veut
     rien dire dans un document rejouable finit par être lu comme s'il voulait
     dire quelque chose.
     ========================================================================== */
  problemeCrosstalk:function(opts){
    const base=simDocIpc(null,V.net,opts,true);
    if(base.erreur)return base;
    const g=simSegments(null,(V.net!=null&&V.net>=0)?V.parNet[V.net]:null);
    const par=simXtParcoursIpc(g);
    if(!(par.total>0))
      return {erreur:"La sélection ne porte aucune longueur exploitable."};

    const nets=[...new Set((g.envoi||[]).map(e=>e.net).filter(Boolean))];
    if(!nets.length)
      return {erreur:"La piste sélectionnée n'a pas de net.",
              conseil:"Le crosstalk se lit d'un net vers un autre : "+
                      "l'agresseur doit porter un nom de net."};

    const doc=base.doc;
    delete doc.ports;
    doc.agresseurs=nets;
    /* LE VOISINAGE EST REPRIS AVEC LES COUCHES ADJACENTES : c'est la seule
       différence de géométrie avec le document de simulation, et elle compte —
       deux pistes superposées sont le cas que la section droite ne sait pas
       décrire, donc celui qu'on écartait sans un mot. */
    doc.voisinage=simVoisinageIpc(g.envoi,g.objets,true);

    /* DES INDICES PARTOUT ICI, et un seul nom pour tout le bloc : les trois
       mesures interrogent la géométrie, qui range ses nets par indice. Garder
       les deux formes sous la main est le plus sûr moyen de passer un jour
       l'une pour l'autre — c'est exactement ce qui était arrivé au voisinage. */
    const idx=simRefIdx();
    doc.couture={positions:simXtCoutureIpc(par,idx), couloir:SIM_COULOIR};
    /* `fentes` À `null` VEUT DIRE « ON N'A PAS PU REGARDER », et le champ est
       alors ABSENT du document. Une liste vide dirait « rien à signaler », ce
       qui est le contraire — et c'est exactement le genre de silence qui rend
       un outil de mesure nuisible. */
    const fentes=simXtFentesIpc(par,idx);
    if(fentes)doc.fentes=fentes;
    doc.vias_masse=simXtViasMasseIpc(par,idx);

    const notes=(base.notes||[]).slice();
    if(!idx.size)
      notes.push("Aucun net de masse retenu : ni la couture, ni les "+
                 "discontinuités du plan, ni les vias de retour ne peuvent "+
                 "être examinés. Choisissez la masse dans la barre du "+
                 "panneau — sans elle, l'absence de zone de vigilance sur la "+
                 "carte ne veut rien dire.");
    else if(!fentes)
      notes.push("Le plan de référence n'a pas pu être sondé : aucun contour "+
                 "de plan de masse ne couvre le parcours dans le fichier. Les "+
                 "fentes ne sont donc pas cherchées, et le résultat le dira "+
                 "plutôt que d'annoncer qu'il n'y en a pas.");
    /* LA PORTÉE SUPPOSÉE EST LA LIMITE PROPRE À CETTE PAGE, et elle penche
       dans un sens qu'il faut connaître : optimiste. Elle ne concerne plus que
       les perçages dont le fichier ne DÉCLARE pas la portée — ceux qui la
       déclarent sont montés dessus, voir `simXtPortee`. */
    if(idx.size&&doc.vias_masse.length){
      const supposes=simXtPorteesSupposees(doc.vias_masse);
      const lus=doc.vias_masse.length-supposes;
      if(lus)
        notes.push(lus+" perçage(s) de masse sur "+doc.vias_masse.length+
                   " portent leur PORTÉE déclarée par le fichier : le "+
                   "contrôle des changements de couche les juge sur les "+
                   "couches qu'ils traversent vraiment.");
      if(supposes)
        notes.push(supposes+" perçage(s) de masse envoyés en les supposant "+
                   "TRAVERSANTS : le fichier ne déclare pas leur portée. Un "+
                   "via enterré compté comme traversant fait passer pour "+
                   "refermé un retour qui ne l'est pas — le contrôle des "+
                   "changements de couche est donc OPTIMISTE pour ceux-là.");
    }
    if(nets.length>1)
      notes.push("La sélection porte "+nets.length+" nets : le plus long "+
                 "donne l'axe de la carte, les autres deviennent des "+
                 "agresseurs supplémentaires. L'option « sommer les "+
                 "agresseurs » les additionne en phase vers chaque victime.");
    return {doc:doc, objets:g.objets, portee:base.portee, notes:notes};
  },

  /* Les deux formes dont la surimpression des zones à risque a besoin. Voir
     « LES ZONES À RISQUE SUR LE CUIVRE », plus haut. */
  xtGeometrie:simXtGeometrieIpc,

  redessiner:function(){
    if(typeof dessiner==="function")dessiner();
  },
  centrerSurVia:function(x_mm,y_mm){
    const k=simKUnite();
    if(k>0&&typeof centrerSur==="function"){
      centrerSur(x_mm/k, y_mm/k);
    }
  },
  astuce:function(t){
    const el=document.getElementById("fHint");
    if(el)el.textContent=t;
  }
};

/* Ouvrir le panneau depuis la barre d'outils. Il démarre masqué — voir
   `00-espace-config.js` — et ce bouton est ce qui le rend trouvable sans
   passer par le menu de l'espace de travail. */
function simOuvrir(){
  if(typeof wsShow!=="function")return;
  if(wsPlaceOf("sim")==="hidden")wsShow("sim");
  if(WS.panels.sim&&WS.panels.sim.collapsed&&
     typeof wsToggleCollapse==="function")wsToggleCollapse("sim");
  simRafraichir(true);
}

/* Branché au chargement, comme le reste des panneaux. */
if(typeof simInit==="function"){
  simInit(SIM_IPC,"simPanneau");
  const b=document.getElementById("bSim");
  if(b)b.onclick=simOuvrir;
}
