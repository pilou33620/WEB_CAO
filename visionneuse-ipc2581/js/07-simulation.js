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
function simStackupIpc(){
  const couches=[];
  LT.cu.forEach(function(cu,k){
    couches.push({type:"copper", name:cu.nom, thickness:cu.ep,
                  role:cu.plan?"plane":"signal"});
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

/* Les pistes que la portée courante désigne, avec leur couche. */
function simZPistes(){
  const out=[];
  if(!V.modele||!LT.pret)return out;
  const s=V.survol;
  /* Une piste désignée, sans Maj : elle seule. C'est la réponse à « qu'est-ce
     qui court ici », et c'est le geste le plus fréquent. */
  if(s&&s.type==="piste"&&V.mev.couche>=0){
    out.push({piste:s.piste, couche:s.couche});
    return out;
  }
  /* Sinon le net entier. Les perçages n'ont pas d'impédance de ligne. */
  if(V.net<0||V.mev.quoi==="trous"||V.mev.seul)return out;
  const n=V.parNet[V.net];
  if(!n)return out;
  for(const p of n.pistes)
    if(V.mev.couche<0||p.c===V.mev.couche)out.push({piste:p, couche:p.c});
  return out;
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
function simSegments(){
  const k=simKUnite(), envoi=[], objets=[], entrees=[];
  const refs=simRefIdx(), hors=new Map();
  let ignorees=0;
  for(const e of simZPistes()){
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
    for(const pl of r.plages){
      const a=simSurPoly(p.p,cum,pl.u1), b=simSurPoly(p.p,cum,pl.u2);
      envoi.push({
        type:"track",
        start:[a.x*k, a.y*k], end:[b.x*k, b.y*k],
        length:pl.longueur, width:(p.w||0)*k, layer:simRangCu(cu),
        net:(p.n>=0)?mdlNetNom(p.n):"", copper_thickness:LT.cu[cu].ep,
        gap_left:pl.g, gap_right:pl.d
      });
      objets.push({piste:p, cum:cum, u1:pl.u1, u2:pl.u2,
                   couche:(c?c.nom:"?"), coucheIdx:e.couche});
    }
  }
  return {envoi:envoi, objets:objets, ignorees:ignorees,
          couture:simCoutureIpc(entrees,refs),
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

   ET UNE RÉSERVE QUI VAUT POUR TOUT FICHIER IPC-2581, même complet : l'empilage
   qu'il porte est le NOMINAL, celui du dossier de fabrication, pas celui de la
   carte pressée. Un prepreg annoncé à 0,36 mm sort couramment à 0,32, et
   quarante microns de moins valent deux ohms et demi sur une ligne à 50. C'est
   la première chose à vérifier quand le calcul ne tombe pas sur la mesure, et
   l'outil ne peut que la signaler.
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
  /* LA RÉSERVE QUI VAUT MÊME QUAND TOUT EST LU DANS LE FICHIER, et qui est la
     première chose à vérifier quand le calcul ne tombe pas sur la mesure. */
  return t+". Empilage nominal du fichier, pas la carte pressée : quarante "+
         "microns de diélectrique valent deux ohms et demi sur une ligne à "+
         "50 Ω.";
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

function simZTrace(c,dpr){
  if(typeof simZActif!=="function"||!simZActif())return;
  poserMonde(c,dpr);
  const px=1/V.vue.scale;                    // un pixel écran, en unités monde
  c.lineCap="round"; c.lineJoin="round";

  const traits=[];
  for(let i=0;i<SIM.objets.length;i++){
    const s=simZSegment(i);
    if(!s||!s.obj||!s.obj.piste||!s.obj.piste.p)continue;
    const o=s.obj;
    traits.push({chemin:simSousPoly(o.piste.p,o.cum,o.u1,o.u2),
                 w:o.piste.w||0, z0:s.z0, obj:o, seg:s.seg});
  }
  for(const t of traits){
    c.strokeStyle=simZCouleur(t.z0,0.30);
    c.lineWidth=t.w+px*7; c.stroke(t.chemin);
  }
  for(const t of traits){
    c.strokeStyle=simZCouleur(t.z0,0.95);
    c.lineWidth=Math.max(t.w,px*2.5); c.stroke(t.chemin);
  }
  for(const t of traits){
    c.strokeStyle=simZCouleur(t.z0,1);
    c.lineWidth=px*2; c.stroke(t.chemin);
  }
  simZValeurs(c,dpr,traits);
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
    if(!(t.z0>0))continue;
    const cle=Math.round(t.z0*10);
    const lg=(t.seg&&t.seg.longueur)||0;
    const p=parValeur.get(cle);
    if(!p||lg>p.lg)parValeur.set(cle,{lg:lg, z0:t.z0, obj:t.obj});
  }
  if(!parValeur.size)return;

  c.save();
  c.setTransform(1,0,0,1,0,0);
  c.scale(dpr,dpr);
  c.font="600 11px \"JetBrains Mono\",\"SF Mono\",Consolas,monospace";
  c.textAlign="center"; c.textBaseline="middle";
  for(const v of parValeur.values()){
    /* Le milieu de la PLAGE, et non de la piste : une piste découpée en trois
       plages porte trois étiquettes, et chacune doit tomber sur le morceau
       qu'elle chiffre. Posée au sommet médian de la polyligne, comme avant,
       elles se seraient toutes empilées au même endroit. */
    const o=v.obj;
    const m=simSurPoly(o.piste.p,o.cum,(o.u1+o.u2)/2);
    const e=w2s(m.x,m.y);
    const txt=mdlNb(v.z0,1)+" Ω";
    const w=c.measureText(txt).width+10;
    c.fillStyle="rgba(15,16,18,0.82)";
    c.beginPath();
    if(c.roundRect)c.roundRect(e.x-w/2,e.y-9,w,18,4);
    else c.rect(e.x-w/2,e.y-9,w,18);
    c.fill();
    c.strokeStyle=simZCouleur(v.z0,1); c.lineWidth=1.2; c.stroke();
    c.fillStyle="#e6e8ec";
    c.fillText(txt,e.x,e.y+0.5);
  }
  c.restore();
}

/* ==========================================================================
   L'adaptateur
   ========================================================================== */
const SIM_IPC={
  outil:"visionneuse-ipc2581",

  carte:function(){
    return (V.fichier||"carte").replace(/\.[^.]+$/,"");
  },

  refCandidats:simRefCandidatsIpc,
  provenance:simProvenanceIpc,

  probleme:function(opts){
    if(!V.modele)
      return {erreur:"Aucune carte ouverte.",
              conseil:"Ouvrez un fichier IPC-2581."};
    if(!LT.pret)
      return {erreur:"L'empilage de calcul n'est pas prêt.",
              conseil:"Complétez-le dans le panneau « La carte », "+
                      "sous « Empilage du calcul »."};

    const g=simSegments();
    if(!g.envoi.length)
      return {erreur:(V.mev.quoi==="trous"||V.mev.seul)
                ? "Un perçage n'a pas d'impédance de ligne."
                : "Aucune piste désignée.",
              conseil:g.ignorees
                ? "Ses "+g.ignorees+" piste(s) sont sur des couches absentes "+
                  "de l'empilage : complétez-le d'abord."
                : "Cliquez une piste sur la carte. Maj+clic prend le net entier."};

    const notes=[];
    if(g.ignorees)
      notes.push(g.ignorees+" piste(s) écartée(s) : leur couche n'est pas dans "+
                 "l'empilage.");
    const n=(V.net>=0)?V.parNet[V.net]:null;
    if(n&&n.trous.length)
      notes.push(n.trous.length+" perçage(s) du net ne sont pas modélisés : "+
                 "la transition verticale manque au modèle.");
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

    const net=(V.net>=0)?mdlNetNom(V.net):"";
    return {
      doc:{
        carte:this.carte(), net:net,
        stackup:simStackupIpc(),
        geometry:{objects:g.envoi},
        ports:[{id:1,impedance:opts.z0},{id:2,impedance:opts.z0}],
        analyse:{f_debut:opts.f1, f_fin:opts.f2, points:opts.points,
                 f_centre:opts.fc}
      },
      objets:g.objets,
      portee:(net?net+" — ":"")+
             (typeof pnlPortee==="function"?pnlPortee():""),
      notes:notes,
      couture:g.couture,
      voisins:g.voisins
    };
  },

  redessiner:function(){
    if(typeof dessiner==="function")dessiner();
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
