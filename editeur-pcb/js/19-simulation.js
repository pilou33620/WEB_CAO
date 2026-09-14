"use strict";
/* ==========================================================================
   Éditeur PCB — simulation électromagnétique
   L'adaptateur qui relie la carte routée au solveur de section
   (python/ligne_mom.py, via python/simulation_em.py). Ce n'est PAS
   mom_solver/ : le moteur 2,5D pleine onde est hors du chemin de calcul, et
   A-FAIRE.md dit pourquoi.

   Tout le panneau — la saisie, l'envoi, la fiche, la courbe, les exports — est
   dans `../commun/simulation-em.js`, que la visionneuse IPC-2581 charge aussi.
   Ce fichier ne fait que deux choses : décrire la SÉLECTION au format
   d'échange, et peindre le résultat sur le cuivre. C'est le principe de
   `18-reperage.js` et de son `RP_ED`.

   LES TROIS GESTES viennent gratuitement, et c'est le point important : la
   sélection de l'éditeur les porte DÉJÀ.
     · clic simple sur une piste  -> ce tronçon seul  (`S.sel.tracks` = 1) ;
     · Maj+clic                   -> la piste entière (`selectRun`) ;
     · Maj+clic à nouveau         -> la piste sur toutes les couches, vias
                                     de passage compris.
   Ce fichier ne lit que `S.sel.tracks` : il suit les trois sans les connaître,
   et suivra le quatrième le jour où il existera.

   TROIS PARTIS PRIS DE MODÉLISATION, et ils commandent tout ce qui suit.

   1. **L'empilage part en entier, conducteurs ET diélectriques**, dans l'ordre
      physique : cuivre 0, diélectrique 0, cuivre 1… L'indice `layer` d'un
      tronçon désigne une entrée de cette liste-là, pas un rang de cuivre —
      d'où `simCuIndex()`, qui fait la conversion en un seul endroit. C'est le
      serveur qui y cherche les plans de référence (`section_de_couche`,
      python/simulation_em.py), avec la même règle que `dpStripGeom()` ici : le
      premier conducteur de rôle « plan » au-dessus et en dessous. Le masque de
      soudure n'y est pas — l'ajouter en tête décalerait tous les indices pour
      un effet marginal sur un microruban.

   2. **Les vias sont modélisés, et leur CHEMIN DE RETOUR avec.** Une piste qui
      change de couche emporte le via qui la réalise — perçage, pastille,
      antipad, position — et les vias de masse voisins qui referment la boucle
      du courant. C'est cette boucle qui porte l'inductance, pas le via seul :
      le même via avec son retour à 0,4 mm ou à 3 mm, c'est un facteur deux.
      Ce que le modèle ne couvre toujours pas — le moignon, la cavité entre
      plans, le retour qui change de plan de référence — est NOMMÉ plutôt que
      tu, ici par le chevelu et dans la fiche par le panneau.

   3. **La masse coplanaire est lue CÔTÉ PAR CÔTÉ, le long du parcours, et
      seulement sur les nets de référence.** Les trois hypothèses tacites de la
      version précédente — un seul point de mesure, un seul écart posé des deux
      côtés, tout autre net compté comme masse — sont tombées ensemble ; le
      détail est au-dessus de `simEcartsA` et de `simPlages`. Ce qui n'est PAS
      de la masse et longe quand même la piste part en note de couplage, et la
      COUTURE de vias est mesurée puis jugée par le panneau : c'est elle qui
      décide si le cuivre latéral est vraiment un plan de retour.
   ========================================================================== */

/* Le cuivre de rang `i` occupe la place `2i` dans l'empilage envoyé : un
   conducteur, un diélectrique, un conducteur… */
function simCuIndex(i){return 2*clamp(i,0,S.cu-1);}

/* L'empilage, à plat. Les épaisseurs sont en millimètres — le document de
   simulation l'est entièrement. Le rôle voyage avec la couche : c'est lui qui
   dit au serveur quel conducteur est un plan de référence. */
function simStackup(){
  const couches=[];
  for(let i=0;i<S.cu;i++){
    const L=S.cuL[i]||{};
    couches.push({
      type:"copper", name:cuLabel(i,S.cu),
      thickness:cuT(i),
      role:rolePlane(layerRole(i))?"plane":"signal",
      net:L.net||""
    });
    if(i<diCount(S.cu)){
      const d=diAt(i);
      couches.push({type:"dielectric", name:d.mat||"FR-4",
                    thickness:d.t, epsilon_r:d.er, tan_delta:d.df});
    }
  }
  return {layers:couches};
}

/* Les tronçons sélectionnés, dans l'ordre où la carte les porte — l'ordre
   compte pour la mise en cascade des paramètres S, et pour la lecture du
   tableau : une piste se lit d'un bout à l'autre, pas dans l'ordre des clics.

   CE QUI DÉCOUPE UNE PISTE, c'est l'ÉCART AU PLAN et non sa courbure. Le
   solveur n'a besoin que du couple (section, longueur) : une corde d'arc a la
   même section que la suivante, la découper n'apprend rien. Un couloir de plan
   qui s'ouvre à mi-parcours, lui, change la section — c'est donc lui qui
   commande le découpage (`simPlages`). La longueur envoyée est celle du
   CUIVRE (`trkLen`), au prorata de la plage : mesurer la corde raccourcirait
   un demi-tour d'un tiers, et le retard avec.

   `objets` est aligné sur `doc.geometry.objects` : c'est par cet alignement
   que le résultat du serveur retrouve la piste à peindre. Une piste dont
   l'écart change donne plusieurs entrées, toutes rattachées à la même piste —
   chacune portant la fraction du parcours qu'elle couvre, ce qui permet de
   peindre chaque plage à sa propre couleur.
*/
/* ==========================================================================
   QUI EST LA MASSE, ici
   --------------------------------------------------------------------------
   Le panneau pose la question (`simRefSet`, ../commun/simulation-em.js) ; ce
   fichier propose la réponse. L'éditeur est bien placé pour cela : il porte le
   RÔLE de chaque couche — masse, alimentation, blindage —, et le net de chaque
   zone de cuivre. Il n'a donc rien à deviner sur de la géométrie.

   CE QUI EST PROPOSÉ D'OFFICE, et pourquoi. Les trois rôles de plan
   (`rolePlane`) entretiennent une zone pleine carte : c'est ce que « plan de
   référence » veut dire dans cet outil, et un plan d'alimentation découplé est
   une masse RF. Un net dont le NOM est celui d'une masse l'est aussi, même posé
   en zone sur une couche de signal — un arrosage GND sur une couche de signal
   est le cas ordinaire d'un tracé RF, et le rôle de la couche ne le dit pas.

   CE QUI EST CANDIDAT SANS ÊTRE PROPOSÉ : tout autre net qui porte du cuivre
   plein. Une alimentation arrosée qu'on n'a pas déclarée en plan, par exemple.
   Elle est là, d'un clic, et c'est un choix — pas une évidence.
   ========================================================================== */
function simRefCandidatsPcb(){
  const m=new Map();
  const ajoute=function(net,quoi,defaut){
    if(!net)return;
    let e=m.get(net);
    if(!e){e={net:net, quoi:[], defaut:false, poids:0}; m.set(net,e);}
    if(quoi&&e.quoi.indexOf(quoi)<0)e.quoi.push(quoi);
    e.defaut=e.defaut||defaut;
    e.poids++;
  };
  S.cuL.forEach(function(L,i){
    const r=layerRole(i);
    if(rolePlane(r)&&L.net)
      ajoute(L.net,CU_ROLE_SHORT[r]+" sur "+cuLabel(i,S.cu),true);
  });
  for(const z of S.zones){
    if(!z.net)continue;
    ajoute(z.net,"zone de cuivre sur "+cuLabel(z.l,S.cu),
           GND_RE.test(String(z.net).replace(/\s/g,"")));
  }
  /* Les proposés d'abord, puis les plus présents : la première pastille est
     celle qu'on veut voir allumée sans avoir à chercher. */
  return [...m.values()]
    .sort(function(a,b){
      if(a.defaut!==b.defaut)return a.defaut?-1:1;
      return b.poids-a.poids;
    })
    .map(function(e){
      return {net:e.net, defaut:e.defaut,
              quoi:e.quoi.slice(0,3).join(" ; ")+
                   (e.defaut?"" : " — pas proposé d'office : ce net n'est ni"+
                                  " déclaré en plan ni nommé comme une masse")};
    });
}

/* ==========================================================================
   L'ÉCART AU CUIVRE DE MASSE, sur la couche de la piste
   --------------------------------------------------------------------------
   Une piste noyée dans un plan arrosé n'est pas un microruban : le cuivre qui
   la borde sur sa propre couche lui prend une part de son champ et fait tomber
   son impédance de vingt pour cent et davantage. C'est le cas ordinaire d'un
   tracé RF, où l'on arrose et où l'on coud de vias.

   L'ÉCART EST CELUI DE LA RÈGLE, et c'est le luxe de l'éditeur. Le plan n'est
   pas un dessin : il est CREUSÉ autour du cuivre à une valeur que l'outil
   connaît, `clrK(net du plan, net de la piste, "cu", "trk")`, celle-là même que
   `04-fabrication.js:267` applique en écrivant le Gerber. Reste à savoir QUELLE
   zone borde la piste, et de quel côté — et cela, il faut le regarder.

   TROIS HYPOTHÈSES SONT TOMBÉES ICI, et elles sont ce que cette version
   corrige. La lecture d'avant se résumait à `zoneAt(milieu de la piste)` :

   1. UN SEUL POINT, le milieu, pour toute la piste. Un plan qui s'ouvre à
      mi-parcours ne se voyait pas. On échantillonne maintenant l'axe et on
      DÉCOUPE la piste en plages d'écart constant — la mise en cascade sait
      enchaîner des sections différentes, c'est son métier.
   2. UN SEUL ÉCART, posé des deux côtés. Une piste qui longe une découpe d'un
      côté et du plan serré de l'autre était calculée comme si elle avait du
      plan serré des deux côtés. On sonde maintenant chaque côté séparément.
   3. TOUT AUTRE NET COMPTAIT COMME MASSE. Un îlot d'un autre signal aussi,
      donc. Seul le cuivre des nets de référence compte désormais ; le reste est
      relevé comme un COUPLAGE et signalé, pas jeté en silence.

   S'y ajoute un quatrième oubli, moins visible : `zoneAt` ne connaît pas les
   DÉCOUPES. Elle teste le contour de la zone, et une découpe est un trou dans
   le cuivre qui n'y figure pas — une piste qui longe une découpe trouvait donc
   du plan là où il n'y a rien. C'est exactement le cas du point 2, et il
   fallait les deux corrections pour qu'il sorte juste.
   ========================================================================== */
const SIM_ECART_MAX=3.0;        // mm ; au-delà, l'effet coplanaire est nul
/* LA PORTÉE DU COUPLAGE, et elle n'est pas celle de la masse coplanaire. Elle
   doit valoir ECART_COUPLAGE_MAX de `python/simulation_em.py` — c'est le
   serveur qui écarte, la page ne fait que ne pas l'inonder. */
const SIM_ECART_COUPLAGE=3.0;   // mm ; ECART_COUPLAGE_MAX de simulation_em.py
/* Les distances de sonde, depuis le BORD du cuivre de la piste. La première
   porte presque tout : la piste est d'ordinaire DEDANS le plan, creusé autour
   d'elle à la règle d'isolation, et deux centièmes au-delà de son bord tombent
   donc dans le cuivre. Les suivantes rattrapent le plan qui ne commence que
   plus loin — un couloir large, un bord de zone. */
const SIM_SONDES=[0.02,0.1,0.25,0.5,1.0,1.5,2.0,3.0];

/* La zone de cuivre en un point, DÉCOUPES COMPRISES. Même lecture que
   `zoneUnder` (05-tools.js) : la dernière zone posée l'emporte, et une découpe
   rend son creux — là il n'y a pas de cuivre, donc pas de masse. */
function simZoneEn(l,x,y){
  for(let i=S.zones.length-1;i>=0;i--){
    const z=S.zones[i];
    if(z.l!==l||!z.pts||z.pts.length<3)continue;
    if(!inPoly(x,y,z.pts))continue;
    if(S.cuts.some(c=>c.l===l&&c.pts.length>2&&inPoly(x,y,c.pts)))continue;
    return z;
  }
  return null;
}

/* LE NET DU CUIVRE DE PLAN EN CE POINT — et non celui de la couche.

   CE QUE L'HYPOTHÈSE « UN NET PAR COUCHE » COÛTAIT. Une couche de plan est
   PARTITIONNÉE : sur une carte réelle, le plan d'alimentation porte plusieurs
   versements — +3V3 ici, +5V là — et souvent de la masse sur tout ce qui reste.
   Lire `S.cuL[i].net`, c'est appliquer à TOUTE la surface le net que l'empilage
   donne à la couche.

   Les deux erreurs que cela produit, et elles sont symétriques :
     · un via qui plonge là où le plan est de la MASSE se voyait déclaré
       « la référence change de net, aucun via de masse ne peut refermer » —
       faux, et ses vias de retour, qui travaillent, étaient écartés ;
     · un via qui plonge dans un ÎLOT D'ALIMENTATION d'une couche par ailleurs
       majoritairement de masse passait pour sain — alors qu'il traverse
       vraiment GND → PWR. C'est le sens dangereux.

   LE NET D'UN PLAN EST DONC UNE PROPRIÉTÉ DU POINT. `simZoneEn` sait le dire :
   la dernière zone posée l'emporte, une découpe rend son creux. On retombe sur
   le net de la couche quand il n'y a AUCUN cuivre au droit du point — la couche
   déclare ce qu'elle est, à défaut de mieux, et c'est un repli, pas une mesure. */
function simNetPlanEn(l, x, y){
  const z = simZoneEn(l, x, y);
  const net = z ? String(z.net || "").trim() : "";
  /* UNE ZONE SANS NET DÉCLARÉ N'EST PAS UNE MESURE. Du cuivre dont on ignore le
     net ne dit rien de plus que la couche qui le porte : on retombe sur le net
     de la couche, comme lorsqu'il n'y a pas de cuivre du tout. Rendre la chaîne
     vide, ce serait remplacer « je ne sais pas » par « aucun net », c'est-à-dire
     effacer le seul renseignement dont on dispose. */
  return net || String((S.cuL[l] && S.cuL[l].net) || "").trim();
}

/* La tangente unitaire de la piste à la fraction `u`. Prise numériquement : une
   droite et un arc y répondent du même coup, et `trkAt` sait déjà placer le
   point sur l'axe dans les deux cas. */
function simTangente(t,u){
  const h=0.002;
  const a=trkAt(t,Math.max(0,u-h)), b=trkAt(t,Math.min(1,u+h));
  const dx=b.x-a.x, dy=b.y-a.y, l=Math.hypot(dx,dy);
  if(l<1e-9)return {x:1,y:0};
  return {x:dx/l, y:dy/l};
}

/* Le cuivre qui borde la piste D'UN CÔTÉ, au point (x,y), la normale (nx,ny)
   désignant ce côté-là.

   Rend {ecart, net, hors} : `ecart` en millimètres, 0 quand il n'y a pas de
   masse de ce côté ; `hors` porte le net du cuivre trouvé quand ce n'est PAS
   une masse de référence — c'est lui qui alimente la note de couplage. */
function simCoteEn(t,x,y,nx,ny,refs){
  const w2=(t.w||0)/2;
  let d0=0;
  for(const d of SIM_SONDES){
    const z=simZoneEn(t.l,x+nx*(w2+d),y+ny*(w2+d));
    if(!z){d0=d;continue;}
    /* Même net : ce n'est pas un écart, c'est le même conducteur — il la
       touche. */
    if(z.net===t.net)return {ecart:0, net:"", hors:""};
    /* OÙ COMMENCE VRAIMENT LA ZONE, entre la sonde qui n'a rien vu et celle
       qui a vu : six bissections la placent au centième de millimètre, et cela
       ne coûte que six tests de polygone. ON LE FAIT AVANT de savoir si c'est
       de la masse — cette distance sert aussi à chiffrer un couplage, et rendre
       le pas de sonde à sa place ferait annoncer « à 0,5 mm » un cuivre qui est
       à 0,3. */
    let lo=d0, hi=d;
    for(let k=0;k<6;k++){
      const mid=(lo+hi)/2;
      if(simZoneEn(t.l,x+nx*(w2+mid),y+ny*(w2+mid)))hi=mid; else lo=mid;
    }
    if(hi>SIM_ECART_MAX)return {ecart:0, net:"", hors:""};
    /* Pas de la masse : ce n'est pas un plan de retour, donc pas d'écart — mais
       c'est un couplage, et on le rend pour qu'il soit dit. */
    if(!refs.has(z.net))
      return {ecart:0, net:"", hors:z.net, distance:r3(hi)};
    /* Puis le MAXIMUM avec la règle d'isolation : c'est elle qui a creusé le
       plan autour de la piste, donc elle qui commande quand la piste est
       dedans ; c'est la distance mesurée qui commande quand le plan ne commence
       que plus loin. */
    const e=Math.max(r3(clrK(z.net,t.net,"cu","trk")),hi);
    return e>SIM_ECART_MAX
      ? {ecart:0, net:"", hors:""}
      : {ecart:r3(e), net:z.net, hors:""};
  }
  return {ecart:0, net:"", hors:""};
}

/* Les deux écarts à la fraction `u` du parcours. « Gauche » et « droite » sont
   pris dans le SENS DE PARCOURS du tronçon, et le solveur est symétrique par
   miroir — le banc d'essai le vérifie —, si bien que le choix du signe n'entre
   pas dans le résultat. Il n'entre que dans la lecture du tableau. */
function simEcartsA(t,u,refs){
  const p=trkAt(t,u), tg=simTangente(t,u);
  const g=simCoteEn(t,p.x,p.y,-tg.y, tg.x,refs);
  const d=simCoteEn(t,p.x,p.y, tg.y,-tg.x,refs);
  return {g:g.ecart, d:d.ecart,
          hors:[g.hors,d.hors].filter(Boolean),
          horsD:[g,d].filter(o=>o.hors).map(o=>o.distance||0)};
}

/* Le découpage en plages d'écart constant est dans `../commun/simulation-em.js`
   (`simPlagesDe`) : c'est un choix de MODÉLISATION, et il doit valoir la même
   chose dans les deux outils. Ici on ne fait que le nourrir, et relever au
   passage ce qu'il ne regarde pas — les côtés qui portent de la masse, et le
   cuivre voisin qui n'en est pas. */
function simPlages(t,refs){
  const total=trkLen(t);
  if(!(total>0))return {plages:[], hors:[], cotes:{g:false,d:false}};
  const hors=new Map();
  const cotes={g:false, d:false};

  const r=simPlagesDe(total,function(u){
    const e=simEcartsA(t,u,refs);
    if(e.g>0)cotes.g=true;
    if(e.d>0)cotes.d=true;
    /* Le cuivre voisin qui n'est pas de la masse : on cumule la LONGUEUR sur
       laquelle il longe la piste, et on garde le point le plus serré. Un îlot
       frôlé sur un quart de millimètre et un couloir parallèle sur trente ne
       se lisent pas de la même façon, et la note doit pouvoir les distinguer. */
    e.hors.forEach(function(net,k){
      let o=hors.get(net);
      if(!o){o={net:net, ecart:Infinity, n:0}; hors.set(net,o);}
      o.n++;
      const d=e.horsD[k];
      if(d>0&&d<o.ecart)o.ecart=d;
    });
    return e;
  });

  return {
    plages:r.plages.map(function(p){
      return {u1:p.u1, u2:p.u2, longueur:r3(p.longueur), g:p.g, d:p.d};
    }),
    hors:[...hors.values()]
      .filter(o=>isFinite(o.ecart))
      .map(o=>({net:o.net, ecart:r3(o.ecart), longueur:r3(o.n*r.pas)})),
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

   On ne le modélise pas — il faudrait l'onde complète. On le MESURE : le plus
   grand espacement entre deux coutures consécutives le long de la piste. C'est
   le panneau qui en tire un verdict, parce que lui seul connaît la permittivité
   effective calculée et le haut de la bande analysée.

   PAR CÔTÉ, et seulement du côté qui porte de la masse. Un côté sans cuivre
   latéral n'a pas de couture à avoir, et le compter ferait crier à tort sur
   toutes les pistes qui longent un bord de carte.

   CE QUE CE CONTRÔLE NE VOIT PAS, et il vaut mieux le savoir : il compte les
   vias de la PLAGE DE COUCHES qui contient celle de la piste, sans vérifier
   qu'ils atteignent le plan de référence lui-même. Un via borgne qui s'arrête
   avant compte donc comme une couture.
   ========================================================================== */
const SIM_COULOIR=2.0;          // mm ; largeur du couloir, depuis le bord du cuivre

/* La fraction du parcours à laquelle un point se projette, ou -1 s'il tombe
   au-delà d'un bout : le cuivre s'arrête là, il ne fait pas le tour. */
function simProjU(t,x,y){
  const A=arcOf(t);
  if(!A){
    const dx=t.x2-t.x1, dy=t.y2-t.y1, l2=dx*dx+dy*dy;
    if(l2<=0)return -1;
    const u=((x-t.x1)*dx+(y-t.y1)*dy)/l2;
    return (u<0||u>1)?-1:u;
  }
  const ca=Math.abs(A.ca);
  if(!(ca>0))return -1;
  const s=arcSweep(A,Math.atan2(y-A.cy,x-A.cx));
  return (s>ca)?-1:s/ca;
}

/* Le plus grand espacement entre coutures, sur une piste et un côté donné. Les
   deux BOUTS comptent : une piste cousue en son milieu et nulle part ailleurs a
   bien un grand trou, et ne pas mesurer du bout au premier via le cacherait. */
function simEspacement(t,refs,signe){
  const total=trkLen(t);
  if(!(total>0))return null;
  const w2=(t.w||0)/2;
  const pos=[];
  for(const v of S.vias){
    if(!refs.has(v.net))continue;
    if(!(v.a<=t.l&&t.l<=v.b))continue;
    const d=trkDist(v.x,v.y,t)-w2-(v.d||0)/2;
    if(!(d<=SIM_COULOIR))continue;
    const u=simProjU(t,v.x,v.y);
    if(u<0)continue;
    const tg=simTangente(t,u), p=trkAt(t,u);
    const cote=(-tg.y)*(v.x-p.x)+tg.x*(v.y-p.y);
    if(signe*cote<0)continue;
    pos.push(u*total);
  }
  /* Aucune couture de ce côté : le trou vaut toute la longueur de la piste.
     C'est bien ce qu'il faut dire — pas « rien à signaler ». */
  if(!pos.length)return {n:0, ecartMax:total};
  pos.sort((a,b)=>a-b);
  let pire=pos[0];                             // du bout au premier via
  for(let i=1;i<pos.length;i++)pire=Math.max(pire,pos[i]-pos[i-1]);
  pire=Math.max(pire,total-pos[pos.length-1]); // du dernier via à l'autre bout
  return {n:pos.length, ecartMax:pire};
}

/* ==========================================================================
   LES COTES DU VIA, ENVOYÉES PLUTÔT QUE SUPPOSÉES
   --------------------------------------------------------------------------
   CE QUE LE SERVEUR FAISAIT SANS ELLES. `_cotes_via` le disait en toutes
   lettres : « LES PAGES N'ENVOIENT PAS ENCORE LES VIAS ». Le modèle π L-C
   tournait donc sur des replis — 0,3 mm de perçage, 2,5 fois cela en pastille
   — alors que l'éditeur connaît les deux exactement, et connaît même la
   longueur percée, que `stackSpan` calcule déjà pour l'Excellon.

   OÙ LE VIA S'ACCROCHE, ET POURQUOI CE TRONÇON-LÀ. Le serveur déduit une
   transition de deux tronçons consécutifs sur des couches différentes, et la
   range au rang du SECOND — c'est `objets[trans["troncon"]]` qu'il relit. On
   accroche donc le via au second tronçon, pas au premier.

   QUAND PLUSIEURS VIAS RÉPONDENT, ON PREND LE PLUS COURT. Un via traversant et
   un via enterré peuvent être au même endroit et couvrir tous deux le saut
   demandé ; c'est le plus spécifique qui décrit la liaison.
   ========================================================================== */
const SIM_TOL_VIA = 0.02;               /* mm — la tolérance de raccord du serveur */

function simViaAuRaccord(x, y, cuA, cuB){
  let choisi = null, portee = Infinity;
  for(const v of S.vias){
    if(Math.abs(v.x - x) > SIM_TOL_VIA || Math.abs(v.y - y) > SIM_TOL_VIA)
      continue;
    const lo = Math.min(v.a, v.b), hi = Math.max(v.a, v.b);
    if(cuA < lo || cuA > hi || cuB < lo || cuB > hi) continue;
    const s = stackSpan(v.a, v.b);
    if(s < portee){ choisi = v; portee = s; }
  }
  return choisi;
}

/* Le diamètre d'antipad d'un via, en millimètres : la pastille plus deux fois
   l'isolation que la règle impose au plan qu'il traverse. C'EST EXACTEMENT CE
   QUI CREUSE LE GERBER — `04-fabrication.js` écrit `v.d + 2*clrK(...)` —, donc
   ce n'est pas une estimation : c'est la cote du cuivre fabriqué.

   PLUSIEURS PLANS, PLUSIEURS ANTIPADS. Un via traversant peut croiser un plan
   de masse et un plan d'alimentation, de classes différentes donc d'isolations
   différentes. Le serveur ne prend qu'un diamètre ; on lui donne le PLUS
   SERRÉ — celui qui pèse le plus — et on lui dit la fourchette, pour que la
   fiche puisse la nommer au lieu de la taire. */
function simAntipadVia(v){
  const lo = Math.min(v.a, v.b), hi = Math.max(v.a, v.b);
  let min = null, max = null;
  for(let i = lo + 1; i < hi; i++){
    if(!rolePlane(layerRole(i))) continue;
    const net = (S.cuL[i] && S.cuL[i].net) || "";
    if(net && v.net && net === v.net) continue;   /* il y est raccordé */
    const d = r3(v.d + 2 * clrK(net, v.net, "cu", "via"));
    if(min === null || d < min) min = d;
    if(max === null || d > max) max = d;
  }
  return min === null ? null : {min: min, max: max};
}

/* Ce qu'on envoie du via, et pourquoi pas davantage.

   ON N'ENVOIE PAS LA HAUTEUR, ET C'EST VOULU. `stackSpan` la connaît — c'est
   elle qui commande le foret de l'Excellon —, mais le serveur la recalcule
   depuis l'empilage qu'on lui envoie, et par la même somme. Deux définitions
   de la même longueur, c'est deux chiffres le jour où l'une des deux dérive.

   ON ENVOIE EN REVANCHE LA POSITION, ce qu'on ne faisait pas : sans elle le
   serveur ne peut pas mesurer l'écart aux vias de masse, et sans cet écart
   l'inductance rendue est celle d'un conducteur seul — elle ne dépend pas du
   routage, ce qui est exactement ce qu'on cherche à corriger. */
/* La valeur d'un condensateur, en farads, lue dans le champ « valeur » de
   l'empreinte. Rend 0 quand ce n'est pas une capacité reconnaissable — un
   champ vide, une référence de ferrite, un texte libre.

   ON NE DEVINE PAS, ON LIT OU L'ON S'ABSTIENT. Un composant à deux bornes
   entre GND et PWR peut être une ferrite ou une résistance de terminaison ;
   leur donner d'office 100 nF les ferait passer pour du découplage. Sans
   valeur lisible, on laisse le serveur poser son repli, qui est annoncé. */
function simValeurFarads(txt){
  const m = String(txt || "").trim()
    .match(/^([\d]+(?:[.,][\d]+)?)\s*(p|n|u|µ|m)?F?$/i);
  if(!m) return 0;
  const v = parseFloat(m[1].replace(",", "."));
  if(!isFinite(v) || v <= 0) return 0;
  const mult = {p:1e-12, n:1e-9, u:1e-6, "µ":1e-6, m:1e-3};
  const k = (m[2] || "").toLowerCase();
  /* Sans préfixe, un « 100 » seul n'est pas 100 farads : c'est une valeur
     qu'on ne sait pas lire, et l'inventer serait pire que l'ignorer. */
  if(!k) return 0;
  return v * (mult[k] || 0);
}

/* Le rayon de recherche d'un pont entre deux plans, en millimètres. Bien plus
   large que celui des vias de masse : un découplage est posé au pied d'un
   composant, pas au pied d'un via de signal, et dix millimètres est déjà loin
   — l'inductance d'étalement y vaut le double de ce qu'elle vaut à un
   millimètre. */
const SIM_RAYON_PONT = 10.0;

/* Les replis du serveur, repris à l'identique : `ESL_PONT_REPLI`,
   `C_PONT_REPLI` et `ESR_PONT_REPLI` de simulation_em.py. Deux jeux de valeurs
   pour une même hypothèse, ce sont deux chiffres le jour où l'un bouge. */
const SIM_ESL_PONT = 1.0e-9;      /* H — un 0402 sur deux vias courts */
const SIM_C_PONT   = 100e-9;      /* F — la valeur universelle du découplage */
const SIM_ESR_PONT = 0.03;        /* Ω — un MLCC 0402 X7R */

/* Base des parasites réels des composants Murata (extraits des sous-circuits SPICE .sub/.mod) */
const SIM_PARASITES_MURATA_DEFAUT = {"GCM0335C1E120FA16":{"c":1.2e-11,"esl":1.97e-10,"esr":0.188},"GCM0335C1E1R8CA16":{"c":1.8e-12,"esl":1.7e-10,"esr":0.28},"GCM0335C1E3R3CA16":{"c":3.3e-12,"esl":1.3e-10,"esr":0.248},"GCM0335C1E470FA16":{"c":4.7e-11,"esl":1.66e-10,"esr":0.126},"GCM0335C1E6R8CA16":{"c":6.8e-12,"esl":1.04e-10,"esr":0.195},"GCM0335C1ER70BA16":{"c":7e-13,"esl":2.02e-10,"esr":0.837},"GCM0335C1H7R5DA16":{"c":7.5e-12,"esl":7.19e-11,"esr":0.195},"GCM033R71E102KA03":{"c":1e-09,"esl":1.38e-10,"esr":0.228},"GCM1555C1H100JA16":{"c":1e-11,"esl":2.67e-10,"esr":0.211},"GCM1555C1H101JA16":{"c":1e-10,"esl":2.65e-10,"esr":0.0787},"GCM1555C1H120JA16":{"c":1.2e-11,"esl":2.25e-10,"esr":0.108},"GCM1555C1H121JA16":{"c":1.2e-10,"esl":1.45e-10,"esr":0.12},"GCM1555C1H150JA16":{"c":1.5e-11,"esl":2.37e-10,"esr":0.106},"GCM1555C1H181JA16":{"c":1.8e-10,"esl":1.15e-10,"esr":0.1},"GCM1555C1H1R5BA16":{"c":1.5e-12,"esl":3.66e-10,"esr":0.389},"GCM1555C1H1R8CA16":{"c":1.8e-12,"esl":3.44e-10,"esr":0.35},"GCM1555C1H220JA16":{"c":2.2e-11,"esl":1.7e-10,"esr":0.101},"GCM1555C1H221JA16":{"c":2.2e-10,"esl":2.06e-10,"esr":0.095},"GCM1555C1H2R0CA16":{"c":2e-12,"esl":3.35e-10,"esr":0.318},"GCM1555C1H330JA16":{"c":3.3e-11,"esl":2.32e-10,"esr":0.0805},"GCM1555C1H331JA16":{"c":3.3e-10,"esl":1.98e-10,"esr":0.0751},"GCM1555C1H390JA16":{"c":3.9e-11,"esl":1.54e-10,"esr":0.0755},"GCM1555C1H3R0BA16":{"c":3e-12,"esl":3.17e-10,"esr":0.274},"GCM1555C1H3R3CA16":{"c":3.3e-12,"esl":2.95e-10,"esr":0.272},"GCM1555C1H3R9BA16":{"c":3.9e-12,"esl":2.6e-10,"esr":0.254},"GCM1555C1H470JA16":{"c":4.7e-11,"esl":1e-10,"esr":0.0744},"GCM1555C1H471JA16":{"c":4.7e-10,"esl":1.3e-10,"esr":0.0529},"GCM1555C1H4R0BA16":{"c":4e-12,"esl":1.31e-10,"esr":0.25},"GCM1555C1H4R7CA16":{"c":4.7e-12,"esl":2.83e-10,"esr":0.247},"GCM1555C1H560JA16":{"c":5.6e-11,"esl":2.48e-10,"esr":0.0686},"GCM1555C1H5R0CA16":{"c":5e-12,"esl":2.99e-10,"esr":0.239},"GCM1555C1H5R6DA16":{"c":5.6e-12,"esl":2.93e-10,"esr":0.232},"GCM1555C1H680JA16":{"c":6.8e-11,"esl":2.48e-10,"esr":0.127},"GCM1555C1H6R0DA16":{"c":6e-12,"esl":2.7e-10,"esr":0.23},"GCM1555C1H6R8BA16":{"c":6.8e-12,"esl":2.77e-10,"esr":0.227},"GCM1555C1H6R8DA16":{"c":6.8e-12,"esl":2.77e-10,"esr":0.227},"GCM1555C1H8R2DA16":{"c":8.2e-12,"esl":2.94e-10,"esr":0.219},"GCM1555C1H9R0DA16":{"c":9e-12,"esl":2.95e-10,"esr":0.216},"GCM155R71C104KA55":{"c":1.02e-07,"esl":2.01e-10,"esr":0.0142},"GCM155R71H102KA37":{"c":1.01e-09,"esl":1.45e-10,"esr":0.245},"GCM155R71H103KA55":{"c":9.97e-09,"esl":1.92e-10,"esr":0.0493},"GCM155R71H104KE02":{"c":9.43e-08,"esl":1.53e-10,"esr":0.0167},"GCM155R71H152KA37":{"c":1.51e-09,"esl":1.43e-10,"esr":0.21},"GCM155R71H222KA37":{"c":2.2e-09,"esl":1.96e-10,"esr":0.165},"GCM155R71H223KA55":{"c":2.13e-08,"esl":1.85e-10,"esr":0.0345},"GCM1885C1H2R4BA16":{"c":2.4e-12,"esl":4.4e-10,"esr":0.322},"GCM1885C1H331JA16":{"c":3.3e-10,"esl":9e-11,"esr":0.0768},"GCM1885C1H332JA16":{"c":3.31e-09,"esl":5.56e-12,"esr":0.0144},"GCM1885C1H3R6BA16":{"c":3.6e-12,"esl":4.12e-10,"esr":0.257},"GCM188R71E105KA64":{"c":6.98e-07,"esl":1.99e-10,"esr":0.00775},"GCM188R71E474KA49":{"c":3.76e-07,"esl":1.53e-10,"esr":0.00878},"GCM188R71H102KA37":{"c":1.05e-09,"esl":1.6e-10,"esr":0.256},"GCM188R71H224KA64":{"c":2.18e-07,"esl":1.7e-10,"esr":0.00821},"GCM188R71H682KA37":{"c":6.82e-09,"esl":9e-11,"esr":0.0984},"GCM21BR71C475KA73":{"c":2.95e-06,"esl":1.74e-10,"esr":0.00442},"GCM21BR71E105KA56":{"c":9.89e-07,"esl":1.54e-10,"esr":0.00523},"GRM0115C1C240GE01":{"c":2.4e-11,"esl":8.87e-11,"esr":0.102},"GRM0115C1E221GE01":{"c":2.2e-10,"esl":7.9e-11,"esr":0.0664},"GRM011R60G104ME01":{"c":8.39e-08,"esl":8.02e-11,"esr":0.0296},"GRM022R60G105ME01":{"c":6.18e-07,"esl":1.03e-10,"esr":0.00902},"GRM0335C1H1R5CA01":{"c":1.5e-12,"esl":2.46e-10,"esr":0.29},"GRM0335C1H1R6CA01":{"c":1.6e-12,"esl":2.46e-10,"esr":0.29},"GRM0335C1H2R9CA01":{"c":2.9e-12,"esl":2.27e-10,"esr":0.25},"GRM1555C1H180GA01":{"c":1.8e-11,"esl":1.19e-10,"esr":0.12},"GRM155R61A474KE15":{"c":4.44e-07,"esl":2.01e-10,"esr":0.0112},"GRM155R61E225KE11":{"c":1.73e-06,"esl":1.79e-10,"esr":0.00635},"GRM155R71E473KA88":{"c":4.64e-08,"esl":1.46e-10,"esr":0.0219},"GRM188R61A106MAAL":{"c":7.91e-06,"esl":1.61e-10,"esr":0.00319},"GRM188R61C105KA12":{"c":9.32e-07,"esl":1.82e-11,"esr":0.00515},"GRM188R61C475KE11":{"c":3.68e-06,"esl":1.78e-10,"esr":0.00374},"GRM2165C1H471JA01":{"c":4.7e-10,"esl":1.82e-11,"esr":0.06},"GRM21BR61A226ME44":{"c":1.7e-05,"esl":1.6e-10,"esr":0.00211},"GRM21BR61A476ME15":{"c":3.8e-05,"esl":1.67e-10,"esr":0.00237},"GRM21BR71H474KA88":{"c":4.74e-07,"esl":1.57e-10,"esr":0.00695},"LQW15AN10NG00":{"l":1.2e-08,"dcr":0.12},"LQW15AN11NG00":{"l":1.26e-08,"dcr":0.1},"LQW15AN12NG00":{"l":1.4e-08,"dcr":0.1},"LQW15AN15NH00":{"l":1.72e-08,"dcr":0.11},"LQW15AN16NG80":{"l":1.69e-08,"dcr":0.105},"LQW15AN18NG80":{"l":1.94e-08,"dcr":0.108},"LQW15AN2N4B00":{"l":2.49e-09,"dcr":0.03},"LQW15AN2N5C00":{"l":3.12e-09,"dcr":0.03},"LQW15AN2N7B00":{"l":3.08e-09,"dcr":0.03},"LQW15AN2N7C00":{"l":3.08e-09,"dcr":0.03},"LQW15AN33NG00":{"l":3.87e-08,"dcr":0.45},"LQW15AN39NH00":{"l":4.5e-08,"dcr":0.5},"LQW15AN3N0B00":{"l":2.77e-09,"dcr":0.05},"LQW15AN3N3C10":{"l":3.37e-09,"dcr":0.028},"LQW15AN3N6C80":{"l":3.5e-09,"dcr":0.025},"LQW15AN3N9B00":{"l":4.39e-09,"dcr":0.05},"LQW15AN47NH00":{"l":5.51e-08,"dcr":0.77},"LQW15AN4N2B80":{"l":4.11e-09,"dcr":0.036},"LQW15AN4N7C00":{"l":5.58e-09,"dcr":0.05},"LQW15AN5N6C10":{"l":5.72e-09,"dcr":0.0368},"LQW15AN7N5G00":{"l":8.73e-09,"dcr":0.09},"LQW15AN8N2G00":{"l":8.91e-09,"dcr":0.1},"LQW15AN9N1H00":{"l":9.53e-09,"dcr":0.1},"LQW15AN9N5J80":{"l":9.93e-09,"dcr":0.067}};
let SIM_PARASITES_MURATA = SIM_PARASITES_MURATA_DEFAUT;
if (typeof require === "function") {
  try {
    const p = require("../../commun/parasites-murata.json");
    if (p && typeof p === "object") SIM_PARASITES_MURATA = p;
  } catch (_) {}
}
if (typeof window !== "undefined") {
  window.SIM_PARASITES_MURATA = SIM_PARASITES_MURATA;
}

function pcbParasitesComposant(c) {
  if (!c) return null;
  const ref = c.ref || "";
  const val = c.value || "";
  const pkg = String(c.pkg || c["Package type"] || "").toUpperCase();
  const mpn = String(c.mpn || c["Part Number"] || c["Part Number "] || "").toUpperCase();
  const partName = String(c.csvPartName || c["Part Name"] || "").toUpperCase();
  const spiceMod = String(c.spice || c["Modèle Simulation"] || "").replace(/\.(sub|mod)$/i, "").toUpperCase();

  let esr = c.esr != null ? c.esr : (c.esr_ohm != null ? c.esr_ohm : null);
  let esl = c.esl != null ? c.esl : (c.esl_nH != null ? c.esl_nH * 1e-9 : null);
  let dcr = c.dcr != null ? c.dcr : null;
  let isat = c.isat != null ? c.isat : null;
  let l = c.l != null ? c.l : null;
  let cap = c.c != null ? c.c : (c.capacite_F != null ? c.capacite_F : null);
  let provenance = "defaut";

  const dict = SIM_PARASITES_MURATA || (typeof window !== "undefined" && window.SIM_PARASITES_MURATA) || null;
  if (dict) {
    const cle = spiceMod || mpn || partName;
    const hit = dict[cle] || (mpn ? dict[mpn] : null) || (spiceMod ? dict[spiceMod] : null) || (partName ? dict[partName] : null);
    if (hit) {
      if (hit.esr != null && esr == null) { esr = hit.esr; provenance = "spice"; }
      if (hit.esl != null && esl == null) { esl = hit.esl; provenance = "spice"; }
      if (hit.dcr != null && dcr == null) { dcr = hit.dcr; provenance = "spice"; }
      if (hit.l != null && l == null) l = hit.l;
      if (hit.c != null && cap == null) cap = hit.c;
    }
  }

  if (typeof window !== "undefined" && Array.isArray(window.CSV_LIB)) {
    const entry = window.CSV_LIB.find(it => {
      const p = String(it["Part Name"] || "").toUpperCase().trim();
      const pn = String(it["Part Number"] || it["Part Number "] || "").toUpperCase().trim();
      return (mpn && pn === mpn) || (partName && p === partName) || (pn && pn === partName);
    });
    if (entry) {
      const desc = String(entry["Description"] || "");
      const cRating = String(entry["current Rating"] || entry["Current Rating"] || "");
      if (isat == null && cRating && cRating !== "xx" && cRating !== "-") {
        if (typeof pcbParseCourant === "function") isat = pcbParseCourant(cRating);
      }
      if (dcr == null) {
        const mDcr = desc.match(/(\d+(?:[.,]\d+)?)\s*(m?R|mOhm)/i);
        if (mDcr) {
          let vDcr = parseFloat(mDcr[1].replace(",", "."));
          if (/mR|mOhm/i.test(mDcr[2])) vDcr *= 1e-3;
          dcr = vDcr;
          if (provenance === "defaut") provenance = "catalogue";
        }
      }
    }
  }

  const isCapa = c.type === "capacitor" || /^[cC]/i.test(ref) || /[pnum]F/i.test(val);
  const isInduc = c.type === "inductor" || /^(L|FB|BEAD|SELF)/i.test(ref) || /[pnum]H/i.test(val);

  if (isCapa) {
    if (cap == null) cap = simValeurFarads(val);
    if (esl == null) {
      if (/0201/i.test(pkg) || /0201/i.test(ref) || /0201/i.test(partName)) esl = 0.20e-9;
      else if (/0402/i.test(pkg) || /0402/i.test(ref) || /0402/i.test(partName)) esl = 0.45e-9;
      else if (/0603/i.test(pkg) || /0603/i.test(ref) || /0603/i.test(partName)) esl = 0.70e-9;
      else if (/0805/i.test(pkg) || /0805/i.test(ref) || /0805/i.test(partName)) esl = 0.90e-9;
      else if (/1206/i.test(pkg) || /1206/i.test(ref) || /1206/i.test(partName)) esl = 1.20e-9;
      else esl = SIM_ESL_PONT;
    }
    if (esr == null) {
      if (/C0G|NP0/i.test(partName) || /C0G|NP0/i.test(mpn)) {
        esr = 0.025;
      } else if (cap && cap >= 10e-6) {
        esr = 0.008;
      } else if (cap && cap >= 1e-6) {
        esr = 0.015;
      } else if (cap && cap >= 100e-9) {
        esr = 0.028;
      } else {
        esr = SIM_ESR_PONT;
      }
    }
  }

  if (isInduc) {
    if (dcr == null) {
      if (/BEAD|BLM/i.test(ref) || /BEAD|BLM/i.test(partName)) dcr = 0.05;
      else if (/0201/i.test(pkg)) dcr = 0.25;
      else if (/0402/i.test(pkg)) dcr = 0.12;
      else dcr = 0.08;
    }
    if (isat == null) {
      if (/BEAD|BLM/i.test(ref) || /BEAD|BLM/i.test(partName)) isat = 0.8;
      else isat = 0.5;
    }
  }

  return {
    esr: esr != null ? esr : SIM_ESR_PONT,
    esl: esl != null ? esl : SIM_ESL_PONT,
    dcr: dcr,
    isat: isat,
    l: l,
    c: cap,
    provenance: provenance
  };
}

/* L'étalement entre DEUX contacts de via dans une paire de plans, en HENRYS.
   MÊME FORMULE QUE `ligne_mom.inductance_etalement_via_via` — équation 13-35
   de Bogatin, 21 pH par mil d'écartement entre plans. `h` et `d` en mm. */
function simEtalementViaVia(h, ecart, diam){
  if(!(h > 0 && diam > 0 && ecart > diam)) return 0;
  return (21e-12 / 25.4e-6) * (h * 1e-3) * Math.log(ecart / diam);
}

/* LA PART DU COURANT DE RETOUR DE CHAQUE PONT, à une fréquence donnée.

   MÊME PHYSIQUE QUE `ligne_mom.repartition_traversee` : la cavité inter-plans
   et chaque condensateur sont des branches EN PARALLÈLE, et le courant s'y
   répartit en raison de leurs ADMITTANCES complexes — I_k/I_tot = Y_k/ΣY.

   POURQUOI C'EST ICI AUSSI. Le chevelu doit répondre pendant qu'on déplace un
   via, sans aller-retour au serveur : c'est la même raison qui fait vivre
   `simBoucleVias` à côté de `inductance_boucle_vias`. Il faut donc que ce soit
   la MÊME formule, et le banc d'essai le vérifie.

   LA SOMME PEUT DÉPASSER 100 %, et ce n'est pas une erreur : au voisinage de
   l'antirésonance parallèle les branches sont en opposition de phase et le
   courant circule entre elles. Forcer la somme à un effacerait justement le
   phénomène qu'on veut voir. */
function simHauteurCavite(cuA, cuB){
  /* L'ÉCARTEMENT ÉLECTRIQUE de deux plans, en millimètres : le diélectrique qui
     les sépare, SANS le cuivre des plans eux-mêmes. C'est la hauteur de la
     cavité, pas l'épaisseur de l'empilage — et c'est elle qui commande
     l'étalement, LINÉAIREMENT. Même règle que `_plans_de_la_paire` côté
     serveur. */
  const lo = Math.min(cuA, cuB), hi = Math.max(cuA, cuB);
  let h = 0;
  for(let i = lo; i < hi; i++){
    const d = diAt(i);
    if(d && d.t > 0) h += d.t;
  }
  return h;
}

function simPartsPonts(freq, lCavite, cPlans, branches){
  const w = 2 * Math.PI * freq;
  const n = branches.length;
  if(!(w > 0)) return {parts:new Array(n).fill(0), cavite:1};
  /* Une admittance complexe, en {re, im}, pour une branche R-L-C série. */
  const adm = (l, c, r) => {
    let zr = r, zi = w * l;
    if(c > 0) zi -= 1 / (w * c);
    const m2 = zr * zr + zi * zi;
    return m2 < 1e-30 ? null : {re:zr / m2, im:-zi / m2};
  };
  const yc = adm(lCavite, cPlans, 0);
  const ys = branches.map(b => adm(b.l, b.c, b.esr));
  if(!yc || ys.some(y => !y)) return {parts:new Array(n).fill(0), cavite:1};
  let sr = yc.re, si = yc.im;
  for(const y of ys){sr += y.re; si += y.im;}
  const s2 = sr * sr + si * si;
  if(s2 < 1e-60) return {parts:new Array(n).fill(1), cavite:1};
  const mod = y => Math.sqrt((y.re * y.re + y.im * y.im) / s2);
  return {parts:ys.map(mod), cavite:mod(yc)};
}

/* Ce qui JOINT deux plans de nets différents près d'un via : un condensateur
   de découplage, et rien d'autre.

   POURQUOI DEUX PASTILLES, ET PAS PLUS. Un composant à deux bornes dont l'une
   est sur GND et l'autre sur PWR est un découplage — ou une ferrite, ou une
   résistance, qui font toutes un chemin alternatif entre les deux. Un
   composant à vingt pattes qui touche les deux nets est un régulateur : il ne
   joint rien en alternatif, et le compter donnerait un chemin de retour là où
   il n'y en a pas. Le filtre est donc le NOMBRE DE BORNES, et il est étroit
   exprès.

   ON N'ENVOIE RIEN QUAND LES DEUX PLANS SONT DU MÊME NET : le retour passe
   alors par le premier via de masse venu, ce dont la boucle du palier 1 rend
   déjà compte. */
function simPontsPlans(cuA, cuB, x, y, extraOut){
  /* LE NET AU DROIT DU VIA — voir `simNetPlanEn`. Un plan partitionné n'a pas
     UN net : ici de la masse, trois centimètres plus loin une alimentation.
     C'est le cuivre SOUS LE VIA qui dit s'il y a quelque chose à ponter. */
  const netDe = i => simNetPlanEn(i, x, y);
  const nA = new Set(simPlansRef(cuA).map(netDe).filter(Boolean));
  const nB = new Set(simPlansRef(cuB).map(netDe).filter(Boolean));
  if(!nA.size || !nB.size) return null;              /* nets non déclarés */
  let commun = false;
  nA.forEach(n => {if(nB.has(n)) commun = true;});
  if(commun) return null;                            /* rien à traverser */

  const out = [];
  let dHorsPontMin = Infinity, refHorsPontMin = "";
  for(const fp of S.fps){
    const pads = padsOf(fp);
    if(pads.length !== 2) continue;
    const nets = new Set(pads.map(q => String(q.net || "").trim())
                             .filter(Boolean));
    let a = false, b = false;
    nets.forEach(n => {if(nA.has(n)) a = true; if(nB.has(n)) b = true;});
    if(!a || !b) continue;
    const d = Math.hypot(fp.x - x, fp.y - y);
    if(d > SIM_RAYON_PONT){
      if(d < dHorsPontMin){
        dHorsPontMin = d;
        refHorsPontMin = fp.ref || "";
      }
      continue;
    }
    /* LA VALEUR DU CONDENSATEUR COMPTE, ET PLUS QU'ON NE CROIT. En dessous de
       sa résonance propre, c'est SA capacité qui fixe l'impédance de la
       branche, pas son inductance : un 100 nF vaut 1,6 Ω à 1 MHz, là où son
       ESL n'en vaut que 0,02. L'omettre ferait passer le pont pour un
       court-circuit parfait en basse fréquence. On la lit dans la valeur du
       composant quand elle s'y trouve, et le serveur suppose 100 nF sinon. */
    const pont = {x: r3(fp.x), y: r3(fp.y), repere: fp.ref || ""};
    const cap = simValeurFarads(fp.value);
    if(cap) pont.capacite_F = cap;
    if(typeof pcbParasitesComposant === "function"){
      const par = pcbParasitesComposant(fp);
      if(par){
        if(par.esr != null){ pont.esr_ohm = par.esr; pont.esr = par.esr; }
        if(par.esl != null){ pont.esl_nH = r3(par.esl * 1e9); pont.esl = par.esl; }
        if(par.c != null && !pont.capacite_F) pont.capacite_F = par.c;
      }
    }
    out.push(pont);
  }
  out.sort((p, q) => Math.hypot(p.x - x, p.y - y) -
                     Math.hypot(q.x - x, q.y - y));
  if(extraOut && typeof extraOut === "object"){
    if(isFinite(dHorsPontMin)){
      extraOut.pont_hors_rayon_mm = r3(dHorsPontMin);
      extraOut.pont_hors_rayon_ref = refHorsPontMin || null;
    }
  }
  return out;
}

/* Ce qu'on envoie d'un raccord de couche. `v` peut être NULL : le raccord
   existe indépendamment du perçage qu'on sait nommer.

   CE QUE LE `null` A COÛTÉ. L'ancienne version n'envoyait RIEN tant que le via
   n'était pas reconnu — donc ni la position, ni les vias de masse voisins. Le
   serveur en concluait « aucun via de masse ne referme la boucle », ce qui est
   une affirmation SUR LA CARTE là où on n'avait pas cherché, et fausse dès
   qu'il y a un via de masse à côté. Les cotes manquantes ne touchent que le
   perçage et la pastille, et celles-là ont leurs replis annoncés. */
function simCotesVia(v, x, y, cuA, cuB){
  const out = {x: r3(x), y: r3(y)};
  if(v){
    out.drill_diameter = v.drill;
    out.pad_diameter = v.d;
    out.net = v.net || "";
    out.layer_from = simCuIndex(Math.min(v.a, v.b));
    out.layer_to = simCuIndex(Math.max(v.a, v.b));
    const anti = simAntipadVia(v);
    if(anti){
      out.antipad_diameter = anti.min;
      if(anti.max > anti.min) out.antipad_max = anti.max;
    }
  }
  /* Le via de référence pour chercher les voisins : le vrai s'il est connu,
     sinon un via de substitution posé au raccord, sur la portée que le signal
     emprunte. Les écarts ne dépendent que de la position, et elle est sûre. */
  const ref = v || {x: x, y: y, a: Math.min(cuA, cuB), b: Math.max(cuA, cuB),
                    d: 0.55, drill: 0.3, net: ""};
  const g = simVoisinageVia(ref);
  /* JUSQU'OÙ ON A CHERCHÉ. Sans ce chiffre, « aucun via de masse ne referme la
     boucle » se lit comme un constat sur la carte alors que c'en est un sur le
     rayon. C'est le même soin que `ponts_rayon_mm` prend déjà en face. */
  out.retours_rayon_mm = SIM_RAYON_RETOUR;
  out.retours_rayon_optimal_mm = SIM_RAYON_RETOUR_OPTIMAL;
  if(g.horsRayonDist != null)
    out.retour_hors_rayon_mm = g.horsRayonDist;
  /* PAS DE CUIVRE SOUS LE VIA = PAS DE RÉFÉRENCE. Voir `simVoisinageVia`. */
  if((g.sansCuivre || []).length)
    out.plans_sans_cuivre = g.sansCuivre.map(i => cuLabel(i, S.cu));
  if(g.plansNets && Object.keys(g.plansNets).length)
    out.plans_nets = Object.assign({}, g.plansNets);
  out.retours = g.voisins.map(f => ({
    x: r3(f.via.x), y: r3(f.via.y),
    layer_from: simCuIndex(Math.min(f.via.a, f.via.b)),
    layer_to: simCuIndex(Math.max(f.via.a, f.via.b)),
    drill_diameter: f.via.drill, pad_diameter: f.via.d,
    net: f.via.net || "",
    plans_joints: (f.plans_joints || []).slice()
  }));
  const extraPont = {};
  const ponts = simPontsPlans(cuA, cuB, x, y, extraPont);
  if(extraPont.pont_hors_rayon_mm != null){
    out.pont_hors_rayon_mm = extraPont.pont_hors_rayon_mm;
    out.pont_hors_rayon_ref = extraPont.pont_hors_rayon_ref;
  }
  if(ponts){
    out.ponts = ponts;
    out.ponts_rayon_mm = SIM_RAYON_PONT;
    /* L'AIRE DES DEUX PLANS EN REGARD fixe leur capacité répartie, et c'est
       par elle que le retour passe quand aucun découplage n'est proche.
       ON ENVOIE L'AIRE DE LA CARTE, ET C'EST UNE MAJORATION : un plan ne
       couvre jamais toute la carte. Une capacité surestimée fait paraître la
       traversée MEILLEURE qu'elle n'est en basse fréquence — c'est le sens
       qui flatte, et c'est pour cela que la fiche le dit. Mesurer l'aire réelle
       des deux versements demanderait l'intersection de deux jeux de polygones
       à trous ; ce sera le jour où ce chiffre commandera une décision. */
    const b = S.board || {};
    const aire = Math.max(0, (b.w || 0) * (b.h || 0));
    if(aire > 0){
      out.aire_plans_mm2 = r3(aire);
      out.aire_plans_majoree = true;
    }
    const di = diAt(Math.min(cuA, cuB));
    if(di && di.er > 0) out.er_plans = di.er;
  }
  return out;
}

/* Accroche à chaque changement de couche le via qui le réalise. On le fait sur
   l'envoi CONSTITUÉ plutôt que dans la boucle qui le bâtit : la transition se
   lit sur DEUX tronçons, et on ne connaît le second qu'après. */
function simAccrocherVias(envoi){
  let poses = 0;
  for(let i = 1; i < envoi.length; i++){
    const a = envoi[i - 1], b = envoi[i];
    if(a.layer === b.layer) continue;
    /* Le point de raccord : la fin du précédent doit toucher le début du
       suivant. Sinon ce n'est pas un via, c'est une rupture — et le serveur
       le dira. */
    const p = a.end, q = b.start;
    if(!p || !q) continue;
    if(Math.abs(p[0] - q[0]) > SIM_TOL_VIA || Math.abs(p[1] - q[1]) > SIM_TOL_VIA)
      continue;
    /* `layer` est un indice d'EMPILAGE (cuivre et diélectrique alternés) ;
       les vias, eux, se comptent en couches de CUIVRE. */
    const cuA = a.layer / 2, cuB = b.layer / 2;
    const via = simViaAuRaccord(q[0], q[1], cuA, cuB);
    b.via = simCotesVia(via, q[0], q[1], cuA, cuB);
    if(via) poses++;
  }
  return poses;
}

/* LA COUTURE, PAR CÔTÉ, POUR LE CALCUL — et non plus seulement pour l'afficher.

   CE QUE CELA CORRIGE, ET C'EST GROS. La section pose le cuivre de masse
   coplanaire — plan arrosé, piste de garde — comme un conducteur TENU À ZÉRO
   VOLT. C'est vrai d'un cuivre cousu de vias ; c'est faux d'un cuivre qui ne
   l'est pas, et l'écart n'est pas une question de précision mais de NATURE :
   un cuivre cousu BLINDE, un cuivre flottant TRANSFÈRE. Mesuré sur une garde
   entre deux signaux : 0,53 % de NEXT cousue, 1,04 % non cousue — soit PIRE
   que pas de garde du tout, qui donne 0,88 %.

   `simEspacement` sait déjà mesurer le plus grand trou entre deux coutures le
   long d'une piste, d'un côté donné : il ne servait qu'à écrire une ligne dans
   la fiche. On l'envoie maintenant avec chaque tronçon, et c'est le serveur qui
   décide — il est le seul à connaître le temps de montée, donc la longueur
   d'onde au genou, donc le trou au-delà duquel le cuivre cesse d'être tenu. */
function simCoutureCotes(t,refs){
  if(!refs||!refs.size)return {g:0,d:0};
  const g=simEspacement(t,refs,1), d=simEspacement(t,refs,-1);
  return {g:g?r3(g.ecartMax):0, d:d?r3(d.ecartMax):0};
}

function simCouturePcb(pistes,refs){
  if(!refs.size)return null;
  let n=0, pire=0, vu=false;
  for(const e of pistes){
    for(const signe of [1,-1]){
      if(signe>0&&!e.cotes.g)continue;
      if(signe<0&&!e.cotes.d)continue;
      const m=simEspacement(e.trk,refs,signe);
      if(!m)continue;
      vu=true; n+=m.n;
      if(m.ecartMax>pire)pire=m.ecartMax;
    }
  }
  if(!vu)return null;
  return {n:n, ecartMax:r3(pire), couloir:SIM_COULOIR};
}

/* ==========================================================================
   Les tronçons à envoyer
   --------------------------------------------------------------------------
   UN TRONÇON PAR PLAGE D'ÉCART, et non par corde. Les cordes de `trkSegs`
   servaient à découper un arc pour le contrôle d'isolation ; le solveur, lui,
   n'a besoin que du couple (section, longueur), et une corde ne change pas de
   section. C'est l'écart au plan qui la change, donc c'est lui qui découpe.

   LA LONGUEUR EST CELLE DU CUIVRE. Elle est prise sur `trkLen`, au prorata de
   la plage : le code d'avant envoyait la longueur de la CORDE alors que son
   propre commentaire annonçait celle du cuivre, ce qui raccourcissait un
   demi-tour d'un tiers — et le retard avec.
   ========================================================================== */
/* LES VIAS DE LA SÉLECTION, SANS ORDRE — format « cao-sim-em-3 ».

   MÊME BESOIN QUE CÔTÉ VISIONNEUSE, ET IL FAUT QUE CE SOIT LA MÊME CHOSE. Un
   via n'existait pour le calcul que s'il tombait entre deux tronçons
   CONSÉCUTIFS de la sélection : c'est le serveur qui les détecte, en lisant
   les changements de couche le long de la liste envoyée. Sélectionnez un net
   qui se ramifie — un bus qui dessert trois boîtiers — et il n'y a plus de
   parcours : aucun via détecté, donc aucun chemin de retour, alors que les
   vias sont là, dans `S.vias`, avec leur perçage et leur portée.

   ICI ON NE REGARDE PAS L'ORDRE. Un via sur lequel aboutissent des tronçons
   SÉLECTIONNÉS de deux couches différentes est un via de la liaison, point.
   Le serveur écarte ensuite ceux que la chaîne a déjà pris, pour qu'un même
   via ne soit pas chiffré deux fois.

   LA PORTÉE, ELLE, EST CONNUE ICI — contrairement à la visionneuse, où
   l'IPC-2581 ne la déclare pas. `simCotesVia` l'emporte avec le reste. */
function simViasPcb(liste){
  const out=[];
  const sel=liste||[...S.sel.tracks];
  if(sel.length<2)return out;
  for(const v of S.vias){
    const couches=new Set();
    for(const t of sel){
      if(!simViaCouvre(v,t.l))continue;
      for(const u of [0,1]){
        const q=trkAt(t,u);
        if(Math.abs(q.x-v.x)<=SIM_TOL_VIA&&Math.abs(q.y-v.y)<=SIM_TOL_VIA){
          couches.add(t.l); break;
        }
      }
    }
    if(couches.size<2)continue;
    const cs=[...couches].sort((a,b)=>a-b);
    out.push(simCotesVia(v,v.x,v.y,cs[0],cs[cs.length-1]));
  }
  return out;
}

/* La portée d'un via couvre-t-elle cette couche ? Un via borgne qui s'arrête
   avant n'aboutit pas sur le tronçon, même s'il est juste dessous. */
function simViaCouvre(v,l){
  return l>=Math.min(v.a,v.b)&&l<=Math.max(v.a,v.b);
}

/* ==========================================================================
   RANGER LA SÉLECTION EN PARCOURS
   --------------------------------------------------------------------------
   CE QUE L'ÉDITEUR FAISAIT, ET POURQUOI C'ÉTAIT FAUX. `simSegments` parcourait
   `S.tracks` dans l'ordre du DOCUMENT — c'est-à-dire l'ordre de création — en
   ne gardant que les pistes sélectionnées. Tant qu'on route une liaison d'un
   bout à l'autre en une fois, cet ordre est le bon par accident. Il cesse de
   l'être dès qu'on retouche : une piste redessinée passe en fin de liste, un
   segment inséré au milieu arrive en dernier, un net importé n'a pas d'ordre
   du tout.

   ET LE PRODUIT DE MATRICES ABCD N'EST PAS COMMUTATIF. Les mêmes tronçons dans
   un autre ordre donnent un autre S₁₁ — mesuré : −1,65 contre −2,31 dB sur
   trois sections 75/25/48 Ω permutées. Le serveur voyait la sélection rompue
   et le disait, mais dire « rangez-la » sans la ranger laisse le travail à
   faire à la seule personne qui ne peut pas le faire.

   LA VISIONNEUSE LE FAISAIT DÉJÀ (`simChainePistes`), et c'est ce qui a caché
   le défaut ici : le fichier IPC-2581 arrive dans le désordre, donc le
   chaînage y était indispensable et visible. Ici il est indispensable et
   invisible.

   ON COMPARE EN XY SEULEMENT, sans regarder la couche — exactement comme
   `_ruptures` et `_topologie` côté serveur. Deux tronçons au même point sur
   deux couches différentes sont joints par un via, et les séparer ferait
   paraître coupée en deux morceaux toute liaison qui change de couche. C'est
   une règle, et elle est écrite au même endroit des deux côtés.
   ========================================================================== */
/* Où la marche s'est arrêtée, et ce qu'elle n'a pas vu. Même contenu que
   `SIM_CHAINE_IPC` côté visionneuse : les deux panneaux doivent dire la même
   chose du même défaut. */
/* ON VIDE CET OBJET, ON NE LE REMPLACE PAS. Le banc d'essai expose les
   globales par une copie prise au chargement (`globalThis.X = X`) : réaffecter
   `SIM_CHAINE_PCB` laisserait le banc regarder l'objet initial, vide à jamais,
   et tout cas qui l'interroge passerait au vert sans rien mesurer. Le même
   piège vaut pour quiconque garderait la référence. */
const SIM_CHAINE_PCB = {arrets:[], orphelines:0};
function simChaineRaz(){
  SIM_CHAINE_PCB.arrets.length=0;
  SIM_CHAINE_PCB.orphelines=0;
}

/* LA LISTE EST CELLE D'UN LOT quand on en découpe (voir `simLotsDeTracks`), et
   celle de la sélection sinon : un seul chemin de calcul, et non deux qui
   auraient dérivé l'un de l'autre. */
function simChainerPcb(liste){
  const sel=(liste||[...S.sel.tracks]).filter(t=>trkLen(t)>0);
  const n=sel.length;
  simChaineRaz();
  if(n<2)return sel.map(t=>({trk:t, retourne:false}));

  /* Les nœuds : un point du plan, et les bouts qui s'y rejoignent. Groupés par
     TOLÉRANCE et non par égalité — les pistes de l'éditeur sont accrochées à
     la grille, mais un arc calcule ses bouts et un net importé porte des
     coordonnées converties depuis le pouce. */
  const centres=[], noeuds=[], rangs=[];
  const noeudDe=function(q){
    for(let c=0;c<centres.length;c++)
      if(Math.abs(centres[c].x-q.x)<=SIM_TOL_VIA&&
         Math.abs(centres[c].y-q.y)<=SIM_TOL_VIA)return c;
    centres.push({x:q.x, y:q.y}); noeuds.push([]);
    return centres.length-1;
  };
  for(let i=0;i<n;i++){
    const r=[];
    for(let b=0;b<2;b++){
      const c=noeudDe(trkAt(sel[i],b));
      noeuds[c].push({i:i, b:b});
      r.push(c);
    }
    rangs.push(r);
  }

  /* Le départ : un bout LIBRE, c'est-à-dire une vraie extrémité de liaison. À
     défaut — une boucle fermée — on part du premier, ce qui vaut l'ordre du
     document et ne prétend à rien de plus. */
  let depart=null;
  for(let i=0;i<n&&!depart;i++)
    for(let b=0;b<2;b++)
      if(noeuds[rangs[i][b]].length===1){depart={i:i, b:b}; break;}
  if(!depart)depart={i:0, b:0};

  const vus=new Array(n).fill(false), suite=[];
  let cour=depart;
  while(cour&&!vus[cour.i]){
    vus[cour.i]=true;
    /* On entre par le bout `b` : la piste part donc à l'endroit si `b` vaut 0,
       et à l'envers sinon. */
    suite.push({trk:sel[cour.i], retourne:cour.b===1});
    const sortie=rangs[cour.i][1-cour.b];
    const voisins=noeuds[sortie].filter(v=>!vus[v.i]);
    /* UN SEUL VOISIN, OU RIEN. Deux voisins au même point sont une dérivation :
       le parcours n'est plus unique et on s'arrête plutôt que de trancher.
       Choisir une branche rendrait des paramètres S qui ont l'air justes en
       ignorant des moignons qui chargent réellement la ligne. */
    if(voisins.length>1)
      SIM_CHAINE_PCB.arrets.push({x:centres[sortie].x, y:centres[sortie].y,
                                  branches:noeuds[sortie].length});
    cour=(voisins.length===1)?voisins[0]:null;
  }
  /* Ce que la marche n'a pas atteint part quand même, dans l'ordre du
     document : la carte de chaleur et les impédances par tronçon n'ont pas
     besoin d'un parcours, et les taire priverait d'un résultat juste. Le
     serveur, lui, verra que ce n'est pas une chaîne et refusera la cascade. */
  for(let i=0;i<n;i++)
    if(!vus[i]){SIM_CHAINE_PCB.orphelines++;
                suite.push({trk:sel[i], retourne:false});}
  return suite;
}
function simSegments(liste){
  const objets=[], envoi=[], pistes=[], hors=new Map();
  const refs=simRefSet();
  /* DANS L'ORDRE DU PARCOURS, et non dans celui du document. Voir
     `simChainerPcb` : c'est le seul ordre sur lequel la mise en cascade ABCD
     veuille dire quelque chose. */
  for(const e of simChainerPcb(liste)){
    const t=e.trk;
    const total=trkLen(t);
    if(!(total>0))continue;
    const r=simPlages(t,refs);
    pistes.push({trk:t, cotes:r.cotes});
    for(const o of r.hors){
      const v=hors.get(o.net);
      if(!v)hors.set(o.net,{net:o.net,ecart:o.ecart,longueur:o.longueur});
      else{v.longueur=r3(v.longueur+o.longueur);
           v.ecart=Math.min(v.ecart,o.ecart);}
    }
    const plages=r.plages.length?r.plages
                                :[{u1:0,u2:1,longueur:total,g:0,d:0}];
    /* UNE PISTE PARCOURUE À L'ENVERS L'EST AUSSI DANS SES PLAGES. Les rendre
       dans l'ordre croissant de `u` alors que le parcours descend poserait un
       raccord manquant AU MILIEU d'une même piste — et le serveur le
       compterait, à juste titre. */
    const cout=simCoutureCotes(t,refs);
    for(const p of (e.retourne?plages.slice().reverse():plages)){
      const u1=e.retourne?p.u2:p.u1, u2=e.retourne?p.u1:p.u2;
      const a=trkAt(t,u1), b=trkAt(t,u2);
      envoi.push({
        type:"track",
        start:[r3(a.x),r3(a.y)], end:[r3(b.x),r3(b.y)],
        length:r3(total*Math.abs(p.u2-p.u1)), width:t.w, layer:simCuIndex(t.l),
        net:t.net||"", copper_thickness:cuT(t.l),
        /* GAUCHE ET DROITE SE DÉFINISSENT PAR RAPPORT AU SENS DE MARCHE :
           faire demi-tour les échange. Les laisser tels quels décrirait la
           section en miroir — ce qui ne change pas Z₀, la géométrie étant
           symétrique, mais fait mentir la fiche sur quel bord longe quoi. */
        gap_left:e.retourne?p.d:p.g, gap_right:e.retourne?p.g:p.d,
        /* LA COUTURE SUIT LE MÊME MIROIR QUE LES ÉCARTS : gauche et droite se
           définissent par rapport au sens de marche, et faire demi-tour les
           échange. Les laisser tels quels ferait juger la couture du mauvais
           bord — et c'est exactement le genre d'erreur qui ne se voit pas. */
        couture_left:e.retourne?cout.d:cout.g,
        couture_right:e.retourne?cout.g:cout.d
      });
      objets.push({trk:t, u1:Math.min(p.u1,p.u2), u2:Math.max(p.u1,p.u2),
                   /* `ua` et `ub` SONT LES MÊMES FRACTIONS, DANS LE SENS DU
                      PARCOURS — là où `u1`/`u2` sont rangées croissantes pour
                      peindre. La section Crosstalk en a besoin : elle projette
                      des vias et des sondes sur l'ABSCISSE CURVILIGNE de la
                      liaison, et un tronçon parcouru à rebours y rangerait
                      tout à l'envers. Peindre n'a pas ce problème, d'où les
                      deux couples. */
                   ua:u1, ub:u2, longueur:total*Math.abs(p.u2-p.u1),
                   couche:cuLabel(t.l,S.cu), l:t.l});
    }
  }
  simAccrocherVias(envoi);

  return {envoi:envoi, objets:objets, vias:simViasPcb(liste),
          couture:simCouturePcb(pistes,refs),
          voisins:[...hors.values()].sort((a,b)=>b.longueur-a.longueur)};
}

/* Ce que la sélection couvre, en une ligne — c'est elle qui dit lequel des
   trois gestes est en vigueur, sans avoir à s'en souvenir. */
function simPortee(objets,liste){
  if(!objets.length)return "";
  const sel=liste||[...S.sel.tracks];
  const couches=new Set(objets.map(o=>o.l));
  const nets=new Set(sel.map(t=>t.net).filter(Boolean));
  const net=nets.size===1?[...nets][0]:null;
  const n=sel.length;
  const quoi=n===1
    ? "un tronçon"
    : (couches.size>1
        ? "la piste sur "+couches.size+" couches"
        : "la piste, sur "+cuLabel(objets[0].l,S.cu));
  return (net?net+" — ":"")+quoi;
}

/* ==========================================================================
   DÉCOUPER LA SÉLECTION EN PARCOURS CONTINUS — LES LOTS
   --------------------------------------------------------------------------
   LE CAS QUI L'A DEMANDÉ. Une ligne RF de 50 Ω coupée par trois condensateurs
   de liaison n'est pas un net mais quatre, bout à bout. La question, elle, est
   unique : « fait-elle 50 Ω sur toute sa longueur ? » Ctrl+clic prenait déjà
   les quatre morceaux — la sélection de l'éditeur est additive depuis toujours
   — mais ils partaient dans un SEUL document, où le serveur voyait une liaison
   rompue et refusait la cascade, à juste titre : entre deux morceaux il y a un
   boîtier, dont ce panneau ne sait rien. On les envoie donc séparément, et la
   fiche en compare les résultats (voir « LES LOTS », commun/simulation-em.js).

   CE QUI FAIT UN LOT : le même net, et du cuivre qui se touche. On compare en
   XY sans regarder la couche, exactement comme `simChainerPcb` — deux tronçons
   au même point sur deux couches sont joints par un via, et les séparer
   couperait en deux toute liaison qui change de couche.

   UNE PISTE SANS NET NE SE JOINT QU'À CE QUI N'EN A PAS NON PLUS. Un tronçon
   fraîchement tracé n'a pas encore de net ; le faire fusionner avec le net qu'il
   effleure inventerait une liaison que la carte ne porte pas.
   ========================================================================== */
function simLotsDeTracks(sel){
  const n=sel.length;
  const parent=new Array(n);
  for(let i=0;i<n;i++)parent[i]=i;
  const chef=function(i){
    while(parent[i]!==i){parent[i]=parent[parent[i]];i=parent[i];}
    return i;
  };
  const bouts=sel.map(t=>[trkAt(t,0),trkAt(t,1)]);
  for(let i=0;i<n;i++)
    for(let j=i+1;j<n;j++){
      if((sel[i].net||"")!==(sel[j].net||""))continue;
      let touche=false;
      for(const a of bouts[i])
        for(const b of bouts[j])
          if(Math.abs(a.x-b.x)<=SIM_TOL_VIA&&Math.abs(a.y-b.y)<=SIM_TOL_VIA)
            touche=true;
      if(touche){
        const ci=chef(i), cj=chef(j);
        if(ci!==cj)parent[cj]=ci;
      }
    }
  /* DANS L'ORDRE DE LA SÉLECTION : le lot 1 du tableau doit être le premier
     morceau pris, sinon les numéros ne désignent rien de reconnaissable. */
  const rangs=new Map(), lots=[];
  for(let i=0;i<n;i++){
    const c=chef(i);
    if(!rangs.has(c)){rangs.set(c,lots.length);lots.push([]);}
    lots[rangs.get(c)].push(sel[i]);
  }
  return lots;
}
const SIM_LOTS_MAX=16;          // au-delà, on ne compare plus, on inonde

/* ==========================================================================
   La carte de chaleur sur le cuivre
   --------------------------------------------------------------------------
   Appelée par `paint()` (03-render.js), après le DRC : les deux jugent le
   tracé, et celui qui répond à la question posée à l'instant reste au-dessus.
   Absente du .png exporté, comme la cote de mesure et le phare du
   cross-probing : ni l'une ni l'autre ne décrivent la carte.

   TROIS TRAITS PAR TRONÇON, et leurs largeurs ne sont pas choisies au hasard.
   Une piste sélectionnée porte DÉJÀ un halo, cyan, de `w + px(3.4)`
   (`drawTracks`, 03-render.js). C'était le piège de la première version :
   peinte à la seule largeur du cuivre, la teinte tombait À L'INTÉRIEUR du halo
   de sélection et ne se voyait pas — un gros halo cyan, et un mince trait
   coloré perdu dedans. Le halo de chaleur est donc plus LARGE que celui de la
   sélection : il l'encadre au lieu de s'y noyer, et le cyan reste visible
   entre les deux, si bien qu'on continue de voir ce qui est pris.
   ========================================================================== */

/* Le sous-segment [u1,u2] d'une piste, posé dans le chemin courant. Une piste
   droite se coupe à la règle ; une piste courbe se coupe en angle, sur son
   propre arc — sans quoi la corde couperait au travers du cuivre. */
function simSousChemin(c,t,u1,u2){
  const A=arcOf(t);
  const a=trkAt(t,u1), b=trkAt(t,u2);
  c.moveTo(a.x,a.y);
  if(A)c.arc(A.cx,A.cy,A.r,A.a1+A.ca*u1,A.a1+A.ca*u2,A.ca<0);
  else c.lineTo(b.x,b.y);
}

/* ==========================================================================
   LE VOILE — CE QUI N'EST PAS DANS LA SIMULATION S'ESTOMPE
   --------------------------------------------------------------------------
   Posé par `paint()` JUSTE AVANT les cartes de chaleur. Voir `simVoileActif`
   (commun/simulation-em.js) : tout ce qui a été dessiné avant s'efface d'un
   cran, tout ce qui se peint après reste plein — le cuivre qui n'entre dans
   aucun calcul cesse de se confondre avec celui qui porte une couleur de
   chaleur, et une couleur de COUCHE cesse de se lire comme une couleur de
   BRUIT.

   IL SE POSE EN PIXELS ÉCRAN, à la transformation d'identité : c'est la toile
   entière qu'il couvre, pas une région du monde.
   ========================================================================== */
function simVoile(c,w,h){
  if(typeof simVoileActif!=="function"||!simVoileActif())return;
  c.save();
  c.setTransform(1,0,0,1,0,0);
  c.globalAlpha=SIM_VOILE_ALPHA;
  c.fillStyle=C_BG;
  c.fillRect(0,0,w,h);
  c.restore();
}

/* TOUS LES LOTS SE PEIGNENT, ET C'EST LE POINT. La fiche ne peut déplier qu'un
   morceau à la fois — quatre jeux de paramètres S ne se lisent pas ensemble —,
   mais la question « est-ce 50 Ω sur toute la longueur ? » se répond d'un coup
   d'œil sur la carte. Sans lot, la boucle tourne une fois et le dessin est celui
   d'avant. */
/* DEUX ANALYSES PEIGNENT CE CUIVRE, ET PAS LA MÊME GRANDEUR : l'impédance ses
   Z₀, la Z différentielle sa Z_diff tronçon par tronçon. Le parcours du canevas
   est le même dans les deux cas — c'est `simCarteSegment`
   (commun/simulation-em.js) qui sait ce qu'il faut peindre, et ce fichier ne le
   sait plus. Le crosstalk, lui, peint autre chose et autrement : ses plages à
   risque et sa chaleur suivent le cuivre des VICTIMES, pas celui de la
   sélection — voir `simXtRisqueTrace`, plus bas. */
/* Piste partenaire et projection géométrique pour l'affichage différentiel */
function simTrackU(t, pt){
  const A=arcOf(t);
  if(A){
    let a=Math.atan2(pt.y-A.cy, pt.x-A.cx);
    let da=a-A.a1;
    if(A.ca>0){
      while(da<0)da+=2*Math.PI;
      while(da>2*Math.PI)da-=2*Math.PI;
      return clamp(da/A.ca,0,1);
    }else{
      while(da>0)da-=2*Math.PI;
      while(da<-2*Math.PI)da+=2*Math.PI;
      return clamp(da/A.ca,0,1);
    }
  }
  const dx=t.x2-t.x1, dy=t.y2-t.y1, l2=dx*dx+dy*dy;
  if(l2<1e-12)return 0;
  return clamp(((pt.x-t.x1)*dx+(pt.y-t.y1)*dy)/l2, 0, 1);
}

function simPistePartenaire(trk, netVoisin){
  if(!trk||!netVoisin||typeof S==="undefined"||!S.tracks)return null;
  let meilleur=null, minD=Infinity;
  const pMid=trkMid(trk);
  for(const t of S.tracks){
    if(t.l!==trk.l||t.net!==netVoisin||t===trk)continue;
    const d=trkDist(pMid.x,pMid.y,t);
    if(d<minD&&d<=4.0){ // écartement maximal d'une paire à portée (< 4 mm)
      minD=d;
      meilleur=t;
    }
  }
  return meilleur;
}

function simProjSegmentSurPiste(tSource, u1, u2, tCible){
  if(!tSource||!tCible)return null;
  const p1=trkAt(tSource, u1);
  const p2=trkAt(tSource, u2);
  const q1=projOnSeg(p1.x, p1.y, tCible);
  const q2=projOnSeg(p2.x, p2.y, tCible);
  const d1=dist(p1.x, p1.y, q1.x, q1.y);
  const d2=dist(p2.x, p2.y, q2.x, q2.y);
  if(d1>4.0||d2>4.0)return null;
  const v1=simTrackU(tCible, q1);
  const v2=simTrackU(tCible, q2);
  const minU=Math.max(0, Math.min(v1, v2));
  const maxU=Math.min(1, Math.max(v1, v2));
  if(maxU-minU<1e-4)return null;
  return {u1:minU, u2:maxU, q1:q1, q2:q2, p1:p1, p2:p2};
}

function simLotsSontPaireDiff(){
  const quoi=typeof simCarteQuoi==="function"?simCarteQuoi():"";
  const isDiff=quoi==="zdiff"||(typeof SIM!=="undefined"&&(SIM.analyse==="diff"||SIM.analyse==="zdiff"));
  if(!isDiff)return false;
  if(typeof SIM==="undefined"||!SIM.lots||SIM.lots.length<2)return false;
  const nets=new Set(SIM.lots.map(l=>l.net).filter(Boolean));
  if(nets.size<2)return false;
  for(const l of SIM.lots){
    const ch=typeof simChaleurRes==="function"?simChaleurRes(l.res):(l.res&&l.res.couplage&&l.res.couplage.chaleur);
    const vn=Array.isArray(ch)&&ch.find(it=>it&&it.z_diff_net);
    if(!vn||!nets.has(vn.z_diff_net))return false;
  }
  return true;
}

var simZDrawnLabels = new Set();
function simZTrace(c){
  if(typeof simCarteActive!=="function"||!simCarteActive())return;
  if(typeof simZDrawnLabels!=="undefined"&&simZDrawnLabels.clear)simZDrawnLabels.clear();
  if(typeof simPourChaqueLot!=="function"){simZTraceLot(c,null);return;}
  simPourChaqueLot(function(lot){simZTraceLot(c,lot);});
}

function simZTraceLot(c,lot){
  const n=SIM.objets.length;
  const quoi=typeof simCarteQuoi==="function"?simCarteQuoi():"";
  c.save();
  c.lineCap="round"; c.lineJoin="round";

  // En mode Z différentielle, on repère aussi les tronçons de la piste partenaire
  const passesDiff=[];
  if(quoi==="zdiff"){
    const netGlobal=typeof simCarteDiffPartenaire==="function"?(simCarteDiffPartenaire()||{}).net:"";
    for(let i=0;i<n;i++){
      const s=simCarteSegment(i);
      if(!s||!s.obj||!s.obj.trk)continue;
      let netVoisin=(s.chaleur&&s.chaleur.z_diff_net)||"";
      if(!netVoisin&&typeof SIM!=="undefined"&&SIM.lots&&SIM.lots.length>=2){
        const curNet=(lot&&lot.net)||(SIM.res&&SIM.res.net)||(s.obj.trk&&s.obj.trk.net)||"";
        const alt=SIM.lots.find(l=>l&&l!==lot&&l.net&&l.net!==curNet);
        if(alt)netVoisin=alt.net;
      }
      if(!netVoisin)netVoisin=netGlobal;
      if(!netVoisin)continue;
      const vt=simPistePartenaire(s.obj.trk, netVoisin);
      if(vt){
        const proj=simProjSegmentSurPiste(s.obj.trk, s.obj.u1, s.obj.u2, vt);
        if(proj){
          passesDiff.push({s, vt, u1:proj.u1, u2:proj.u2});
        }
      }
    }
  }

  const passe=(alpha,largeur)=>{
    for(let i=0;i<n;i++){
      const s=simCarteSegment(i);
      if(!s||!s.obj||!s.obj.trk)continue;
      c.strokeStyle=s.couleur(alpha);
      c.lineWidth=largeur(s.obj.trk);
      c.beginPath();
      simSousChemin(c,s.obj.trk,s.obj.u1,s.obj.u2);
      c.stroke();
    }
    // Surbrillance synchronisée de la piste partenaire couplée
    for(const pd of passesDiff){
      c.strokeStyle=pd.s.couleur(alpha);
      c.lineWidth=largeur(pd.vt);
      c.beginPath();
      simSousChemin(c,pd.vt,pd.u1,pd.u2);
      c.stroke();
    }
  };
  passe(0.30, t=>t.w+px(7));
  passe(0.95, t=>Math.max(t.w,px(2.5)));
  passe(1.00, ()=>px(2));

  c.restore();
  simZValeurs(c,lot);
  simZNumeroLot(c,lot);
}


/* LE NUMÉRO DU LOT, POSÉ SUR SON CUIVRE. Le tableau du panneau parle de
   « lot 3 » ; sans ce jeton, rien sur la carte ne dit lequel c'est, et il
   faudrait déplier les quatre fiches pour retrouver le morceau qui sort de la
   bande. Il ne paraît que s'il y a plus d'un lot, et au DÉBUT du parcours : le
   milieu porte déjà l'étiquette d'impédance, et deux cartouches au même endroit
   se recouvrent. */
function simZNumeroLot(c,lot){
  if(!lot||!lot.rang)return;
  if(typeof simLotsMultiples!=="function"||!simLotsMultiples())return;
  if(simLotsSontPaireDiff())return; // Deux moitiés d'une même paire : ne pas polluer avec (1) et (2)
  const s=simCarteSegment(0);
  if(!s||!s.obj||!s.obj.trk)return;
  const p=trkAt(s.obj.trk,s.obj.u1), e=w2s(p.x,p.y);
  c.save();
  c.setTransform(1,0,0,1,0,0);
  const dpr=window.devicePixelRatio||1;
  c.scale(dpr,dpr);
  c.font="700 10px "+
    "\"JetBrains Mono\",\"SF Mono\",Consolas,\"Roboto Mono\",monospace";
  c.textAlign="center"; c.textBaseline="middle";
  c.beginPath();
  c.arc(e.x,e.y,9,0,2*Math.PI);
  c.fillStyle="rgba(15,16,18,0.9)"; c.fill();
  c.strokeStyle=s.couleur(1); c.lineWidth=1.4; c.stroke();
  c.fillStyle="#e6e8ec";
  c.fillText(String(lot.rang),e.x,e.y+0.5);
  c.restore();
}

/* Les valeurs écrites sur la piste.
   Une étiquette par IMPÉDANCE DISTINCTE, et non par tronçon : une piste de
   cinquante segments de même largeur sur la même couche a une seule impédance,
   et cinquante fois « 48,0 Ω » empilés au même endroit ne se lisent pas. On
   pose donc l'étiquette au milieu du plus long tronçon de chaque valeur.

   Le texte est tracé en pixels écran, pas en unités monde : une étiquette qui
   grossit avec le zoom finit par couvrir la carte, et elle doit rester lisible
   quand on dézoome pour voir la liaison entière. */
function simZValeurs(c,lot){
  const n=SIM.objets.length;
  const quoi=typeof simCarteQuoi==="function"?simCarteQuoi():"";
  const parValeur=new Map();
  for(let i=0;i<n;i++){
    const s=simCarteSegment(i);
    if(!s||!s.obj||!s.obj.trk||!s.texte)continue;
    /* UNE ÉTIQUETTE PAR VALEUR AFFICHÉE, et non par tronçon : c'est le TEXTE
       qui groupe, si bien que la règle vaut pour les ohms comme pour les
       pourcentages, sans que ce fichier ait à savoir lequel des deux il pose. */
    const lg=(s.seg&&s.seg.longueur)||0;
    const p=parValeur.get(s.texte);
    if(!p||lg>p.lg)
      parValeur.set(s.texte,{lg:lg, valeur:s.valeur, texte:s.texte,
                             couleur:s.couleur, obj:s.obj, chaleur:s.chaleur});
  }
  if(!parValeur.size)return;
  const retenues=simCarteRetenir(parValeur);

  c.save();
  c.setTransform(1,0,0,1,0,0);
  const dpr=window.devicePixelRatio||1;
  c.scale(dpr,dpr);
  c.font="600 11px "+
    "\"JetBrains Mono\",\"SF Mono\",Consolas,\"Roboto Mono\",monospace";
  c.textAlign="center"; c.textBaseline="middle";

  for(const v of retenues){
    const u=(v.obj.u1+v.obj.u2)/2;
    const p1=trkAt(v.obj.trk,u);
    let p2=null;
    let e1=w2s(p1.x,p1.y);
    let e2=null;
    let e=e1;

    if(quoi==="zdiff"){
      let netVoisin=(v.chaleur&&v.chaleur.z_diff_net)||"";
      let altLot=null;
      if(typeof SIM!=="undefined"&&SIM.lots&&SIM.lots.length>=2){
        const curNet=(lot&&lot.net)||(SIM.res&&SIM.res.net)||(v.obj&&v.obj.trk&&v.obj.trk.net)||"";
        altLot=SIM.lots.find(l=>l&&l!==lot&&l.net&&l.net!==curNet);
        if(!netVoisin&&altLot)netVoisin=altLot.net;
      }
      if(!netVoisin&&typeof simCarteDiffPartenaire==="function"){
        netVoisin=(simCarteDiffPartenaire()||{}).net||"";
      }

      // Collecter toutes les pistes candidates du partenaire sur la même couche
      const cands=[];
      const couche=(v.obj&&v.obj.trk)?v.obj.trk.l:null;
      if(altLot&&altLot.objets){
        for(const ao of altLot.objets){
          if(ao&&ao.trk&&ao.trk!==v.obj.trk){
            if(!cands.includes(ao.trk))cands.push(ao.trk);
          }
        }
      }
      if(netVoisin&&typeof S!=="undefined"&&S.tracks){
        for(const t of S.tracks){
          if(t.net===netVoisin&&(couche===null||t.l===couche)&&t!==v.obj.trk){
            if(!cands.includes(t))cands.push(t);
          }
        }
      }

      // Projeter p1 sur tous les candidats pour trouver le point perpendiculaire le plus proche
      let bestP2=null, bestD=Infinity;
      for(const cand of cands){
        const q=projOnSeg(p1.x,p1.y,cand);
        const d=dist(p1.x,p1.y,q.x,q.y);
        if(d<=4.0&&d<bestD){
          bestD=d;
          bestP2=q;
        }
      }

      if(bestP2){
        p2=bestP2;
        e2=w2s(p2.x,p2.y);
        e={x:(e1.x+e2.x)/2, y:(e1.y+e2.y)/2};
      }
    }

    // Déduplication : si deux lots calculent la même étiquette de paire, on ne la dessine qu'une fois
    const isDiffPair=typeof simLotsSontPaireDiff==="function"&&simLotsSontPaireDiff();
    const labelKey=isDiffPair
      ? ("diff_"+v.texte)
      : (v.texte+"_"+Math.round(e.x/8)+"_"+Math.round(e.y/8));
    if(simZDrawnLabels.has(labelKey))continue;
    simZDrawnLabels.add(labelKey);

    const txt=v.texte;
    const w=c.measureText(txt).width+14;
    const h=19;

    // Repère de couplage / accolade entre les deux pistes
    if(e2){
      const dx=e2.x-e1.x, dy=e2.y-e1.y;
      const d=Math.hypot(dx,dy);
      if(d>1){
        const tx=-dy/d, ty=dx/d;
        const tk=4.5;

        c.save();
        c.strokeStyle=v.couleur(0.7);
        c.lineWidth=1.2;

        // 1. Ligne de liaison entre les 2 pistes (en pointillés discrets)
        c.beginPath();
        c.setLineDash([2,2]);
        c.moveTo(e1.x,e1.y);
        c.lineTo(e2.x,e2.y);
        c.stroke();
        c.setLineDash([]);

        // 2. Ticks perpendiculaires sur chaque piste
        c.beginPath();
        c.moveTo(e1.x-tx*tk, e1.y-ty*tk);
        c.lineTo(e1.x+tx*tk, e1.y+ty*tk);
        c.moveTo(e2.x-tx*tk, e2.y-ty*tk);
        c.lineTo(e2.x+tx*tk, e2.y+ty*tk);
        c.stroke();

        // 3. Petits points de contact sur le cuivre
        c.fillStyle=v.couleur(1);
        c.beginPath();
        c.arc(e1.x,e1.y,2.2,0,2*Math.PI);
        c.arc(e2.x,e2.y,2.2,0,2*Math.PI);
        c.fill();

        c.restore();
      }
    }

    /* Un cartouche sombre sous le texte */
    c.fillStyle="rgba(15,16,18,0.88)";
    c.beginPath();
    if(c.roundRect)c.roundRect(e.x-w/2,e.y-h/2,w,h,4);
    else c.rect(e.x-w/2,e.y-h/2,w,h);
    c.fill();
    c.strokeStyle=v.couleur(1); c.lineWidth=1.3;
    c.stroke();
    c.fillStyle="#e6e8ec";
    c.fillText(txt,e.x,e.y+0.5);
  }
  c.restore();
}


/* ==========================================================================
   LE CHEMIN DE RETOUR DU COURANT — LE CHEVELU
   --------------------------------------------------------------------------
   CE QU'ON RÉPOND, ET À QUELLE QUESTION. Un via de signal n'a pas
   d'inductance à lui seul : c'est la BOUCLE qu'il forme avec ses vias de masse
   qui en porte une. Le même via avec son retour à 0,4 mm ou à 3 mm, c'est un
   facteur deux — et c'est justement la décision qu'on prend en routant. La
   question « faut-il le rapprocher ? » n'a donc de réponse que si le chiffre
   bouge quand on le rapproche, sous les yeux, sans repasser par le serveur.

   POURQUOI LA PHYSIQUE EST ICI AUSSI, ALORS QU'ELLE EST DÉJÀ EN PYTHON. Parce
   qu'un chevelu qui demande un aller-retour au serveur à chaque déplacement de
   souris n'est pas un chevelu. C'est une duplication, elle est assumée, et
   elle est TENUE : le banc de l'éditeur vérifie que cette fonction rend, sur
   une géométrie donnée, exactement ce que `ligne_mom.inductance_boucle_vias`
   rend sur la même — la valeur attendue vient du banc Python, pas d'ici. Le
   jour où l'une des deux dérive, l'essai tombe.

   CE QUE LE CHEVELU MONTRE, ET C'EST PLUS QUE DES TRAITS :
     · l'inductance de BOUCLE, en nanohenrys, au pied du via ;
     · un trait par via de masse retenu, dont l'épaisseur dit sa PART du
       courant de retour — parce que trois vias ne se partagent pas le courant
       à parts égales, et que celui qui ne travaille pas ne sert à rien ;
     · un trait barré, en rouge, pour un via voisin qui NE ferme PAS la boucle,
       avec la raison. C'est le cas qui compte : un via de masse posé à côté
       d'un via qui change de plan de référence a l'air de faire son travail et
       ne le fait pas.

   TROIS VIAS À PROXIMITÉ : LES TROIS, ET PAS LE PLUS PROCHE. Voir
   `simBoucleVias` — la répartition du courant se RÉSOUT.
   ========================================================================== */

const SIM_MU0 = 4e-7 * Math.PI;
/* Le rayon de recherche d'un via de masse, en millimètres : zone optimale ≤ 1,8 mm,
   zone de vigilance jusqu'à 5,0 mm. */
const SIM_RAYON_RETOUR = 5.0;
const SIM_RAYON_RETOUR_OPTIMAL = 1.8;

/* La primitive de Grover, et la mutuelle de deux filaments parallèles de même
   longueur `h` écartés de `d`. TOUT EN MÈTRES.

   C'EST LA FORME EXACTE, et non L = (µ₀h/π)ln(2s/d). Cette dernière suppose
   h ≫ s ; sur une carte h vaut 1,5 mm et s vaut 0,6, le rapport vaut 2,6, et
   l'approximation surestime de 21 % — de 56 % à 3 mm d'écart. */
function simGroverF(u, d){
  return u * Math.asinh(u / d) - Math.sqrt(u * u + d * d);
}
function simMutuelleVia(h, d){
  return (SIM_MU0 / (4 * Math.PI)) * (2 * simGroverF(h, d) - 2 * simGroverF(0, d));
}

/* Un système linéaire n×n par élimination de Gauss avec pivot partiel. n vaut
   au plus une poignée — le nombre de vias de masse autour d'un via —, donc la
   simplicité prime. Rend null si la matrice est singulière. */
function simResoudre(M, b){
  const n = b.length;
  const A = M.map((r, i) => r.slice().concat([b[i]]));
  for(let k = 0; k < n; k++){
    let p = k;
    for(let i = k + 1; i < n; i++)
      if(Math.abs(A[i][k]) > Math.abs(A[p][k])) p = i;
    if(!(Math.abs(A[p][k]) > 1e-30)) return null;
    if(p !== k){const t = A[p]; A[p] = A[k]; A[k] = t;}
    for(let i = k + 1; i < n; i++){
      const f = A[i][k] / A[k][k];
      if(!f) continue;
      for(let j = k; j <= n; j++) A[i][j] -= f * A[k][j];
    }
  }
  const x = new Array(n).fill(0);
  for(let i = n - 1; i >= 0; i--){
    let s = A[i][n];
    for(let j = i + 1; j < n; j++) s -= A[i][j] * x[j];
    x[i] = s / A[i][i];
  }
  return x;
}

/* L'inductance de boucle d'un via et de ses retours, en HENRYS.
   `hauteur` en mm, les vias en {x, y, drill} millimètres.

   LA RÉPARTITION DU COURANT SE RÉSOUT, ELLE NE SE POSTULE PAS. Le via de
   signal porte +1 A ; les retours se partagent −1 A en proportions aₖ
   inconnues. À haute fréquence le courant se distribue de façon à minimiser
   l'énergie magnétique — c'est-à-dire l'inductance elle-même. On minimise donc
   L(a) = L_ss − 2b·a + a·M·a sous Σaₖ = 1, par multiplicateur de Lagrange.

   CE QUE ÇA CHANGE CONTRE « LE PLUS PROCHE ». Sur trois vias à 0,5 / 1,2 /
   2,5 mm, ne garder que le plus proche surestime de 31 %. Et trois vias serrés
   ne divisent PAS l'inductance par trois : leur mutuelle les empêche de
   travailler indépendamment — on plafonne vers un facteur deux, quel que soit
   leur nombre. C'est ce que la matrice M porte, et rien qui somme des
   contributions séparées ne peut le rendre. */
function simBoucleVias(hauteur, signal, retours){
  const h = hauteur * 1e-3;
  const rs = Math.max(signal.drill, 1e-3) * 1e-3 / 2;
  const Lss = simMutuelleVia(h, rs);
  const n = retours.length;
  if(!n) return {L:Lss, parts:[], seul:true};

  const ec = (a, b) =>
    Math.max(Math.hypot(a.x - b.x, a.y - b.y) * 1e-3, 1e-9);
  const b = [], M = [];
  for(let k = 0; k < n; k++){
    b.push(simMutuelleVia(h, ec(signal, retours[k])));
    M.push(new Array(n).fill(0));
  }
  for(let k = 0; k < n; k++){
    M[k][k] = simMutuelleVia(h, Math.max(retours[k].drill, 1e-3) * 1e-3 / 2);
    for(let j = k + 1; j < n; j++){
      const v = simMutuelleVia(h, ec(retours[k], retours[j]));
      M[k][j] = v; M[j][k] = v;
    }
  }
  const un = new Array(n).fill(1);
  const mib = simResoudre(M, b), mi1 = simResoudre(M, un);
  let a;
  if(!mib || !mi1){
    /* Matrice singulière : deux retours indiscernables. On retombe sur le plus
       proche, et la part rendue le dit. */
    let k = 0;
    for(let i = 1; i < n; i++)
      if(ec(signal, retours[i]) < ec(signal, retours[k])) k = i;
    a = new Array(n).fill(0); a[k] = 1;
  }else{
    const den = mi1.reduce((s, v) => s + v, 0);
    const num = mib.reduce((s, v) => s + v, 0);
    const dl = Math.abs(den) < 1e-30 ? 0 : (1 - num) / den;
    a = mib.map((v, i) => v + dl * mi1[i]);
  }
  let L = Lss;
  for(let k = 0; k < n; k++){
    L -= 2 * a[k] * b[k];
    for(let j = 0; j < n; j++) L += a[k] * a[j] * M[k][j];
  }
  if(!isFinite(L) || L <= 0) return {L:Lss, parts:new Array(n).fill(0), seul:true};
  return {L:L, parts:a, seul:false};
}

/* Le plan de référence qui fait face à une couche de cuivre : le premier
   conducteur de rôle « plan » au-dessus et en dessous. C'est la MÊME règle que
   `section_de_couche` côté serveur — celle qui décide de l'impédance. */
function simPlansRef(l){
  const out = [];
  const estRef = i => rolePlane(layerRole(i)) ||
    S.zones.some(z => z.l === i && z.pts && z.pts.length >= 3);
  for(let i = l - 1; i >= 0; i--)
    if(estRef(i)){out.push(i); break;}
  for(let i = l + 1; i < S.cu; i++)
    if(estRef(i)){out.push(i); break;}
  return out;
}

/* L'empilage déclare-t-il le net de ses plans ?

   C'EST LA CONDITION DU TEST QUI COMPTE. Savoir si un via de masse rejoint le
   plan d'arrivée demande de connaître le net de ce plan. Sans lui, on ne peut
   pas distinguer un plan de masse d'un plan d'alimentation — et c'est
   justement cette distinction qui sépare une carte correcte du défaut grave.
   On accepte alors les vias de retour sans cette vérification, et la fiche le
   dit : refuser rendrait la mesure impossible, accepter en silence ferait
   passer le cas GND/PWR pour sain. MÊME RÈGLE QUE `_plans_ont_un_net` côté
   serveur, et c'est voulu — deux règles pour un même jugement, ce sont deux
   verdicts le jour où l'une bouge. */
function simPlansOntUnNet(){
  for(let i = 0; i < S.cu; i++)
    if(rolePlane(layerRole(i)) &&
       String((S.cuL[i] && S.cuL[i].net) || "").trim()) return true;
  return false;
}

/* Les plans qu'un via RACCORDE : ceux de sa portée dont le net est le sien.
   C'est ce qui distingue un via de masse utile d'un via de masse décoratif. */
function simPlansJoints(v, verifierNet){
  const lo = Math.min(v.a, v.b), hi = Math.max(v.a, v.b), out = [];
  for(let i = lo; i <= hi; i++){
    if(!rolePlane(layerRole(i)) && !simZoneEn(i, v.x, v.y)) continue;
    /* LE NET AU DROIT DU VIA, ET NON CELUI DE LA COUCHE. Un plan est
       PARTITIONNÉ : un îlot d'alimentation ici, de la masse trois centimètres
       plus loin. Le net de la couche est celui qu'on lui a donné dans
       l'empilage, et il s'appliquait à toute sa surface — donc ce via de masse
       était réputé toucher le plan PARTOUT, y compris au milieu d'un versement
       d'alimentation où il ne touche rien. Ce qui décide, c'est le cuivre
       SOUS LE VIA. */
    const net = simNetPlanEn(i, v.x, v.y);
    if(verifierNet && v.net && net !== v.net) continue;
    out.push(i);
  }
  return out;
}

/* Le voisinage d'un via de signal : les vias de masse à portée, chacun avec la
   raison pour laquelle il compte — ou ne compte pas.

   LES TROIS RAISONS D'ÉCARTER, dans l'ordre où elles se posent :
     1. ce n'est pas un net de référence — un via d'un autre signal, aussi
        proche soit-il, ne porte pas ce retour-là ;
     2. il ne couvre pas la portée du via de signal — un via borgne ne referme
        pas le courant, et la formule de boucle n'a alors PAS de sens : elle
        rendrait un chiffre trop PETIT de 18 %, donc flatteur ;
     3. il ne rejoint pas les deux plans de référence. C'est le cas grave :
        sur TOP/GND/PWR/BOT le retour doit passer de GND à PWR, et aucun via de
        masse ne sait faire cela. Il a l'air de travailler et ne travaille pas. */
function simVoisinageVia(v){
  const refs = simRefSet();
  const lo = Math.min(v.a, v.b), hi = Math.max(v.a, v.b);
  const pDep = simPlansRef(lo), pArr = simPlansRef(hi);
  const dedans = (s, e) => s.some(i => e.indexOf(i) >= 0);

  const verifNet = simPlansOntUnNet();
  const out = [];
  let dHorsMin = Infinity, wHorsProche = null;
  for(const w of S.vias){
    /* ON S'ÉCARTE SOI-MÊME PAR LA POSITION, ET NON PAR L'IDENTITÉ : le via de
       référence peut être un via de SUBSTITUTION posé au raccord quand le vrai
       n'a pas été reconnu, et il n'est alors identique à aucun objet de
       `S.vias`. Comparer les identités laisserait le vrai via de signal
       apparaître dans son propre chevelu, écarté au motif que son net n'est
       pas une référence — exact, mais absurde à lire. */
    if(w === v) continue;
    if(Math.abs(w.x - v.x) <= SIM_TOL_VIA &&
       Math.abs(w.y - v.y) <= SIM_TOL_VIA) continue;
    if(!refs.has(w.net)) continue;
    const d = Math.hypot(w.x - v.x, w.y - v.y);
    if(d > SIM_RAYON_RETOUR){
      if(d < dHorsMin){
        dHorsMin = d;
        wHorsProche = w;
      }
      continue;
    }
    const f = {via:w, distance:r3(d), part:0, retenu:false, raison:""};
    const wlo = Math.min(w.a, w.b), whi = Math.max(w.a, w.b);
    /* UN VIA QUI N'EST PAS SUR UNE MASSE N'EST PAS UN CANDIDAT, il est HORS
       SUJET. Le lister avec une raison encombrerait le chevelu d'un trait
       rouge par via de signal voisin — sur une carte dense, des dizaines — et
       noierait les seuls traits rouges qui comptent : ceux d'un via de MASSE
       qui, lui, aurait pu refermer la boucle et ne le fait pas. */
    if(!refs.has(w.net)) continue;
    const joints = simPlansJoints(w, verifNet);
    f.plans_joints = joints.map(i => cuLabel(i, S.cu));
    /* LE MÊME PLAN N'EST PAS LE MÊME CUIVRE. `simPlansJoints` regarde le
       cuivre au droit de CE VIA DE MASSE ; le courant de retour, lui, circule
       dans le cuivre au droit du VIA DE SIGNAL. Sur un plan partitionné les
       deux ne sont pas le même versement, et l'indice de couche ne les
       distingue pas : « rejoint Inner 2 » était vrai des deux côtés d'une
       frontière qui les sépare électriquement.

       C'EST LE SENS QUI FLATTE, et c'est pour cela qu'il fallait le fermer. Un
       via de signal qui plonge DANS un îlot d'alimentation, avec des vias de
       masse à un millimètre qui touchent la même couche HORS de l'îlot : les
       indices concordaient, les vias étaient retenus, et l'inductance sortait
       comme une MESURE de boucle au lieu d'un plancher. Même règle que
       `_analyse_retour` côté serveur : le chevelu et la fiche jugent la même
       chose, sinon l'un des deux mentira le jour où l'autre bougera. */
    const autre = joints.filter(i => {
      const sous = simNetPlanEn(i, v.x, v.y);
      return sous && w.net && sous !== w.net;
    });
    const porte = joints.filter(i => autre.indexOf(i) < 0);
    f.porte = porte.map(i => cuLabel(i, S.cu));
    /* DEUX REFUS QUI NE SE DISENT PAS PAREIL : « il ne rejoint pas le plan »
       envoie chercher un via borgne, « il le rejoint sur un autre versement »
       envoie regarder la DÉCOUPE du plan. C'est le seul geste qui répare. */
    const pourquoi = refsPlans => {
      const croise = refsPlans.filter(i => autre.indexOf(i) >= 0);
      if(croise.length)
        /* COURT, PARCE QUE C'EST UN LIBELLÉ DE CANVAS et qu'il se pose au
           milieu du cuivre. Trois mots portent le geste : le plan, le fait que
           le cuivre diffère, et le net qui occupe la place sous le via. */
        return cuLabel(croise[0], S.cu) + " : autre versement (" +
               (simNetPlanEn(croise[0], v.x, v.y) || "?") + " ici)";
      return "ne rejoint pas " + refsPlans.map(i => cuLabel(i, S.cu)).join("/");
    };
    if(wlo > lo || whi < hi)
      f.raison = "ne couvre pas " + cuLabel(lo, S.cu) + "→" + cuLabel(hi, S.cu);
    else if(pDep.length && !dedans(pDep, porte)) f.raison = pourquoi(pDep);
    else if(pArr.length && !dedans(pArr, porte)) f.raison = pourquoi(pArr);
    else {
      f.retenu = true;
      if(f.distance > SIM_RAYON_RETOUR_OPTIMAL){
        f.statut = "vigilance";
        f.reserve = "boucle large (distance " + simNb(f.distance,2) + " mm > rayon optimal " + SIM_RAYON_RETOUR_OPTIMAL + " mm)";
      }else{
        f.statut = "optimal";
      }
    }
    out.push(f);
  }
  out.sort((a, b) => a.distance - b.distance);

  const retenus = out.filter(f => f.retenu);
  const hauteur = stackSpan(v.a, v.b);
  const r = simBoucleVias(hauteur, v, retenus.map(f => f.via));
  retenus.forEach((f, i) => {f.part = r.parts[i] || 0;});

  /* DEUX PLANS DE NOMS DIFFÉRENTS NE SONT PAS DEUX PLANS DE NETS DIFFÉRENTS,
     et c'est de cette distinction que dépend tout le verdict. Sur une carte
     quatre couches, une piste sur TOP se réfère au plan interne du haut et la
     même piste sur BOT à celui du bas : les NOMS diffèrent TOUJOURS. Si les
     deux sont de la masse, un via de masse referme la boucle et c'est le cas
     ordinaire. S'ils sont GND et PWR, RIEN ne peut la refermer.

     TROIS ÉTATS, DONC, ET PAS DEUX — c'est la même règle que `_analyse_retour`
     côté serveur, et il faut qu'elle soit la même : le chevelu et la fiche
     jugent la même chose. */
  /* LE NET AU DROIT DU VIA, pas celui de la couche — voir `simNetPlanEn`.
     C'est ce qui décide si la référence change VRAIMENT ici, et donc si les
     vias de masse voisins peuvent refermer la boucle ou non. */
  const netDe = i => simNetPlanEn(i, v.x, v.y);
  const nDep = new Set(pDep.map(netDe).filter(Boolean));
  const nArr = new Set(pArr.map(netDe).filter(Boolean));
  const planChange = pDep.length > 0 && pArr.length > 0 && !dedans(pDep, pArr);
  let netsDiff = false;
  if(planChange){
    if(nDep.size && nArr.size){
      netsDiff = true;
      nDep.forEach(n => {if(nArr.has(n)) netsDiff = false;});
    }else netsDiff = null;                 /* l'empilage ne les déclare pas */
  }
  /* QUAND AUCUN VIA DE MASSE NE PEUT REFERMER, QUELQUE CHOSE LE FAIT QUAND
     MÊME, et le chevelu ne le montrait pas. Il traçait les vias de masse — tous
     barrés de rouge, à juste titre — et écrivait « aucun via ne peut joindre
     les deux » sans jamais désigner ce qui porte RÉELLEMENT le retour : le
     condensateur de découplage qui joint les deux plans. On voyait le défaut,
     pas le chemin — et le geste correctif (« rapprocher le découplage ») n'avait
     aucun objet à l'écran sur lequel se poser. `simPontsPlans` le calcule déjà
     pour l'envoi au serveur ; on le remonte ici et le dessin s'en sert.

     LE PONT RETENU EST LE PLUS PROCHE — la liste est triée par distance —,
     parce que c'est lui qui porte l'essentiel du courant : l'étalement croît
     avec la distance, et deux condensateurs en parallèle ne se partagent pas
     la charge à parts égales.

     RIEN QUAND LA RÉFÉRENCE NE CHANGE PAS DE NET : le retour passe alors par
     les vias de masse, qui sont déjà à l'écran. */
  /* PAS DE CUIVRE DU TOUT SOUS LE VIA : ce n'est pas « la référence change »,
     c'est « il n'y a pas de référence ». Le net de la couche sert alors de
     repli et l'outil annonce un changement vers un plan qui n'existe pas ICI —
     une phrase plausible et fausse. Entre deux versements d'alimentation, dans
     une découpe, au bord d'un dégagement : le courant de retour n'a aucun
     cuivre à suivre, et c'est un défaut d'un autre ordre, plus grave que le
     changement de référence, parce qu'aucun condensateur ne le rattrape. */
  const sansCuivre = [...new Set([...pDep, ...pArr])]
    .filter(i => !simZoneEn(i, v.x, v.y));

  const ponts = (planChange && netsDiff === true)
    ? (simPontsPlans(lo, hi, v.x, v.y) || []) : [];

  /* ET LEQUEL TRAVAILLE. Un via de retour porte sa part du courant depuis
     toujours — le chevelu la peint —, un condensateur de pontage n'en portait
     aucune : on n'en montrait qu'un, le plus proche, sans dire ce qu'il vaut.
     Or ils sont TOUS en parallèle, et sur une carte où trois découplages
     entourent la transition, « lequel travaille » est exactement la question.
     MÊME CALCUL QUE `_cavite_de_retour` côté serveur, à la même fréquence. */
  let partCavite = 0, freqParts = 0;
  if(ponts.length){
    const hCav = simHauteurCavite(pDep[0], pArr[0]);
    const b = S.board || {};
    const aire = Math.max(0, (b.w || 0) * (b.h || 0)) || 400;
    const di = diAt(Math.min(pDep[0], pArr[0]));
    const er = (di && di.er > 0) ? di.er : 4.3;
    /* La capacité répartie des deux plans, et l'étalement du via vers la cavité
       entière — les deux chemins qui existent sans aucun pont. */
    const cPlans = 8.854187817e-12 * er * (aire * 1e-6) / Math.max(hCav * 1e-3, 1e-9);
    const rExt = Math.sqrt(aire / Math.PI) * 1e-3;
    const rVia = Math.max(v.drill, 1e-3) * 1e-3 / 2;
    const lCav = (hCav > 0 && rExt > rVia)
      ? (4e-7 * Math.PI) * (hCav * 1e-3) / (2 * Math.PI) * Math.log(rExt / rVia)
      : 0;
    const fc = Number((SIM.saisie && SIM.saisie.fc) || 0) || 1e9;
    const tr = Number((SIM.saisie && SIM.saisie.tr) || 0);
    /* MÊME RÈGLE QUE LE SERVEUR : sous le mégahertz, la bande utile est celle
       du FRONT, pas de la fondamentale. */
    const fEval = (fc < 1e6 && tr > 0) ? Math.max(fc, 0.35 / tr) : fc;
    const branches = ponts.map(p => ({
      l: simEtalementViaVia(hCav, Math.hypot(p.x - v.x, p.y - v.y),
                            Math.max(v.drill, 1e-3)) + (p.esl != null ? p.esl : (p.esl_nH != null ? p.esl_nH * 1e-9 : SIM_ESL_PONT)),
      c: p.capacite_F || SIM_C_PONT,
      esr: (p.esr != null ? p.esr : (p.esr_ohm != null ? p.esr_ohm : SIM_ESR_PONT))
    }));
    const r = simPartsPonts(fEval, lCav, cPlans, branches);
    ponts.forEach((p, i) => {p.part = r.parts[i] || 0;});
    partCavite = r.cavite;
    /* LA PART DÉPEND DE LA FRÉQUENCE, et fortement : à 12 MHz un 100 nF proche
       porte tout, à 100 MHz c'est le petit condensateur qui prend la main, à
       1 GHz c'est la cavité. Une part affichée sans sa fréquence est un chiffre
       qu'on ne peut pas relire — l'inductance de boucle, elle, n'en dépend pas,
       et c'est pour cela que sa cartouche n'en porte pas. */
    freqParts = fEval;
    /* Le pont qui porte le PLUS DE COURANT n'est pas toujours le plus proche :
       un 100 nF à 3 mm bat un 1 nF à 1 mm en dessous de leurs résonances. On
       trie donc par part décroissante, et `pont` devient le dominant. */
    ponts.sort((a, c) => (c.part || 0) - (a.part || 0));
  }

  const plansNets = {};
  for(const i of [...new Set([...pDep, ...pArr])]){
    const n = simNetPlanEn(i, v.x, v.y);
    if(n) plansNets[cuLabel(i, S.cu)] = n;
  }

  return {via:v, hauteur:hauteur, voisins:out, retenus:retenus,
          horsRayonDist: isFinite(dHorsMin) ? r3(dHorsMin) : null,
          horsRayonProche: wHorsProche,
          partCavite:partCavite, freqParts:freqParts,
          L:r.L, seul:r.seul, netsIncertains:!verifNet,
          planChange:planChange, netsDiff:netsDiff,
          /* `change` reste le nom du DÉFAUT : un changement que rien ne peut
             rejoindre, et il exige désormais la certitude. */
          change:planChange && netsDiff === true,
          doute:planChange && netsDiff === null,
          ponts:ponts, pont:ponts[0] || null, pontRayon:SIM_RAYON_PONT,
          sansCuivre:sansCuivre,
          plansNets:plansNets,
          plansDep:pDep, plansArr:pArr};
}

/* Le chevelu est-il à l'écran ? Il lui faut le panneau ouvert sur l'impédance
   — la famille qui parle de vias — et au moins un via sélectionné. Il ne lui
   faut PAS de résultat : c'est un outil de routage, il doit répondre pendant
   qu'on déplace le via, pas après un calcul. */
function simRetourActif(){
  return !!(typeof SIM !== "undefined" && SIM.ouvert
            /* LE CHEVELU SUIT SON ONGLET. Il vivait sous « Impédance », où
               il montrait un défaut dont la fiche ne parlait pas ; il est
               maintenant le sujet de « Current Return Path ». */
            && SIM.analyse === "retour" && S.sel.vias.size > 0);
}

/* Les vias de signal sélectionnés, chacun avec son voisinage. Un via de MASSE
   sélectionné n'ouvre pas de chevelu : il n'a pas de boucle à lui, il EST le
   retour de quelqu'un d'autre. */
function simChevelu(){
  if(!simRetourActif()) return [];
  const refs = simRefSet();
  const out = [];
  for(const v of S.sel.vias){
    if(refs.has(v.net)) continue;
    out.push(simVoisinageVia(v));
  }
  return out;
}

/* La couleur d'un lien, par sa part du courant de retour. Le vert du panneau
   pour celui qui travaille, l'ambre pour celui qui traîne, le rouge pour celui
   qui ne ferme rien. Ce sont les trois couleurs de la carte de chaleur des
   impédances, et c'est voulu : une même échelle pour un même jugement. */
function simRetourCouleur(f){
  if(!f.retenu) return "#e8564a";
  if(f.part >= 0.30) return "#49c07a";
  if(f.part >= 0.10) return "#e0a63c";
  return "#7d8590";
}

function simRetourTrace(c, dpr){
  const liens = simChevelu();
  if(!liens.length) return;
  c.save();
  c.lineCap = "round";

  const actif = (typeof SIM !== "undefined" && SIM.viaActif != null) ? SIM.viaActif : null;
  const actifGnd = (actif != null && typeof SIM !== "undefined" && SIM.gndViaActif != null) ? SIM.gndViaActif : null;

  for(let gIdx = 0; gIdx < liens.length; gIdx++){
    const g = liens[gIdx];
    const isSel = (actif != null && gIdx === actif);
    const dimmed = (actif != null && !isSel);

    c.save();
    if(dimmed) c.globalAlpha = 0.22;

    /* Le halo de mise en surbrillance si ce via est sélectionné au rapport */
    if(isSel){
      c.save();
      c.beginPath();
      c.arc(g.via.x, g.via.y, g.via.d / 2 + px(12), 0, Math.PI * 2);
      c.fillStyle = "rgba(73, 192, 122, 0.22)";
      c.fill();
      c.strokeStyle = "#ffe066";
      c.lineWidth = px(3.2);
      c.stroke();
      c.restore();
    }

    for(let fIdx = 0; fIdx < g.voisins.length; fIdx++){
      const f = g.voisins[fIdx];
      const isThisGnd = (isSel && actifGnd === fIdx);
      const isOtherGndDimmed = (isSel && actifGnd != null && !isThisGnd);

      c.save();
      if(isOtherGndDimmed) c.globalAlpha = 0.20;

      c.strokeStyle = isThisGnd ? "#ffe066" : simRetourCouleur(f);
      /* L'ÉPAISSEUR DIT LA PART DU COURANT */
      let baseW = f.retenu ? px(1.2 + 4.0 * Math.max(f.part, 0)) : px(1.2);
      if(isSel){
        baseW *= isThisGnd ? 2.6 : 1.4;
        if(f.retenu && !isThisGnd && actifGnd == null)
          c.strokeStyle = (f.part >= 0.20 ? "#5efc82" : "#ffd166");
      }
      c.lineWidth = baseW;
      /* UN REFUS STRUCTUREL NE SE RÉPÈTE PAS PAR VIA. Quand la référence change
         de NET, AUCUN via de masse ne peut refermer — ils échouent tous pour
         la même raison, et sur un plan bien cousu cela fait une douzaine de
         traits rouges identiques qui noient le seul trait qui compte : celui du
         condensateur. On les garde VISIBLES — les effacer laisserait croire
         qu'on ne les a pas regardés, et la personne qui vient d'en poser un a
         besoin de le voir barré — mais on les met en sourdine. Le message est
         dit une fois, sous le via. */
      if(!f.retenu && g.change && !isThisGnd) c.globalAlpha *= 0.40;
      c.setLineDash(f.retenu ? [] : [px(3), px(3)]);
      c.beginPath();
      c.moveTo(g.via.x, g.via.y);
      c.lineTo(f.via.x, f.via.y);
      c.stroke();

      /* Halo brillant doré sur le via de masse ciblé */
      if(isThisGnd){
        c.save();
        c.beginPath();
        c.arc(f.via.x, f.via.y, px(10), 0, Math.PI * 2);
        c.fillStyle = "rgba(255, 224, 102, 0.35)";
        c.fill();
        c.strokeStyle = "#ffe066";
        c.lineWidth = px(2.5);
        c.stroke();
        c.restore();
      }
      c.restore();
    }

    /* LE CHEMIN QUE LE RETOUR PREND VRAIMENT. Quand la référence change de net,
       aucun via de masse ne referme — ils sont tous barrés — et le courant
       passe par le condensateur qui joint les deux plans. On le trace en CYAN,
       d'un trait long : c'est un AUTRE chemin, pas un via de retour, et il ne
       doit pas se confondre avec eux. */
    /* UN TRAIT PAR CONDENSATEUR, ET SON ÉPAISSEUR DIT SA PART — exactement
       comme pour les vias de retour. N'en montrer qu'un, le plus proche,
       laissait croire qu'il porte tout le courant : sur une carte où trois
       découplages entourent la transition, ils se le partagent, et « lequel
       travaille » est la question qu'on se pose. */
    for(const p of (g.ponts || [])){
      const part = Math.max(p.part || 0, 0);
      c.save();
      /* Sous 5 % le trait s'efface presque : ce pont est là, il ne sert pas —
         c'est une information, pas un chemin. */
      if(part < 0.05) c.globalAlpha *= 0.35;
      c.setLineDash([px(7), px(4)]);
      c.strokeStyle = "#38bdf8";
      c.lineWidth = px((isSel ? 1.4 : 1.0) * (1.0 + 3.0 * part));
      c.beginPath();
      c.moveTo(g.via.x, g.via.y);
      c.lineTo(p.x, p.y);
      c.stroke();
      c.setLineDash([]);
      c.beginPath();
      c.arc(p.x, p.y, px(7), 0, Math.PI * 2);
      c.fillStyle = "rgba(56, 189, 248, " + (0.10 + 0.30 * part).toFixed(3) + ")";
      c.fill();
      c.stroke();
      c.restore();
    }

    /* Le via de signal, cerclé : c'est lui dont on parle. */
    c.setLineDash([]);
    c.strokeStyle = isSel ? "#ffffff" : (g.retenus.length ? "#49c07a" : "#e8564a");
    c.lineWidth = isSel ? px(2.8) : px(1.6);
    c.beginPath();
    c.arc(g.via.x, g.via.y, g.via.d / 2 + px(3), 0, Math.PI * 2);
    c.stroke();

    c.restore();
  }
  c.restore();
  simRetourValeurs(c, liens, dpr);
}

/* Les chiffres, tracés en pixels écran : une étiquette qui grossit avec le
   zoom finit par couvrir la carte, et celle-ci doit rester lisible quand on
   dézoome pour voir la liaison entière. C'est la règle de `simZValeurs`. */
function simRetourValeurs(c, liens, dpr){
  c.save();
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.scale(dpr, dpr);
  c.textAlign = "center"; c.textBaseline = "middle";

  const actif = (typeof SIM !== "undefined" && SIM.viaActif != null) ? SIM.viaActif : null;
  const actifGnd = (actif != null && typeof SIM !== "undefined" && SIM.gndViaActif != null) ? SIM.gndViaActif : null;

  const cartouche = (e, txt, bord, dy, petit, isSel) => {
    c.font = (petit ? (isSel ? "700 10.5px " : "600 9.5px ") : (isSel ? "700 12px " : "600 11px ")) +
      "\"JetBrains Mono\",\"SF Mono\",Consolas,\"Roboto Mono\",monospace";
    const w = c.measureText(txt).width + 10, hh = petit ? 15 : 18;
    c.fillStyle = isSel ? "rgba(20,24,28,0.96)" : "rgba(15,16,18,0.86)";
    c.beginPath();
    if(c.roundRect) c.roundRect(e.x - w / 2, e.y + dy - hh / 2, w, hh, 4);
    else c.rect(e.x - w / 2, e.y + dy - hh / 2, w, hh);
    c.fill();
    c.strokeStyle = isSel ? "#ffe066" : bord; c.lineWidth = isSel ? 2.0 : 1.2; c.stroke();
    c.fillStyle = isSel ? "#ffffff" : "#e6e8ec";
    c.fillText(txt, e.x, e.y + dy + 0.5);
  };

  for(let gIdx = 0; gIdx < liens.length; gIdx++){
    const g = liens[gIdx];
    const isSel = (actif != null && gIdx === actif);
    const dimmed = (actif != null && !isSel);
    if(dimmed) continue;

    const o = w2s(g.via.x, g.via.y);
    /* UNE MÊME RAISON NE S'ÉCRIT QU'UNE FOIS. Sur un plan bien cousu, dix vias
       de masse écartés portent dix fois « ne rejoint pas L2 » : la répétition
       n'ajoute rien et couvre le reste du dessin. On garde tous les TRAITS —
       chacun désigne un via qu'on a bien examiné — et on ne pose l'étiquette
       qu'au premier de chaque raison. Une raison DIFFÉRENTE, elle, s'écrit :
       « ne couvre pas Top→Bottom » demande un autre geste que « ne rejoint
       pas L2 », et les confondre ferait manquer le via borgne. */
    const raisonsVues = new Set();
    for(let fIdx = 0; fIdx < g.voisins.length; fIdx++){
      const f = g.voisins[fIdx];
      const isThisGnd = (isSel && actifGnd === fIdx);
      const isOtherGndDimmed = (isSel && actifGnd != null && !isThisGnd);
      if(isOtherGndDimmed) continue;

      const e = w2s(f.via.x, f.via.y);
      const lg = Math.hypot(e.x - o.x, e.y - o.y);
      if(lg < 45 && f.retenu && !isSel && !isThisGnd) continue;
      const m = {x:o.x + 0.66 * (e.x - o.x), y:o.y + 0.66 * (e.y - o.y)};
      if(!f.retenu){
        /* Le via explicitement ciblé au rapport garde la sienne, toujours :
           on a cliqué dessus pour la lire. */
        if(isThisGnd || !raisonsVues.has(f.raison)){
          raisonsVues.add(f.raison);
          cartouche(m, f.raison, "#e8564a", -14, true, isThisGnd || isSel);
        }
      }
      else if(f.part >= 0.05 || isThisGnd)
        cartouche(m, Math.round(100 * f.part) + " %",
                  isThisGnd ? "#ffe066" : simRetourCouleur(f), 0, true, isThisGnd || isSel);
    }
    const txt = g.seul
      ? "L ≥ " + simNb(g.L * 1e9, 2) + " nH · sans retour"
      : "L = " + simNb(g.L * 1e9, 2) + " nH";
    const rayon = (g.via.d / 2) * S.scale + 14;
    cartouche(o, txt, g.seul ? "#e8564a" : (isSel ? "#ffe066" : "#49c07a"),
              -Math.max(18, rayon), false, isSel);

    const noms = g.plansDep.map(i => cuLabel(i, S.cu)).join("/") + " → " +
                 g.plansArr.map(i => cuLabel(i, S.cu)).join("/");
    /* PAS DE RÉFÉRENCE DU TOUT — et cela se dit AVANT le reste. Un plan sans
       cuivre au droit du via n'est pas une référence qui change, c'est une
       référence absente : aucun condensateur ne rattrape cela, et le net que
       la fiche affiche pour cette couche n'est qu'un repli. */
    if((g.sansCuivre || []).length){
      /* ET C'EST LE SEUL MESSAGE : « la référence change vers X » n'a aucun sens
         quand X n'a pas de cuivre ici. Le dire quand même, ce serait empiler
         une phrase plausible sur une phrase vraie. */
      cartouche(o, "aucun cuivre sur " +
                g.sansCuivre.map(i => cuLabel(i, S.cu)).join("/") +
                " sous ce via : pas de plan de référence ici",
                "#e8564a", Math.max(20, rayon), true, isSel);
    }else if(g.change){
      cartouche(o, "référence " + noms + " : aucun via ne peut joindre les deux",
                "#e8564a", Math.max(20, rayon), true, isSel);
      /* ET CE QUI PORTE LE RETOUR À LEUR PLACE, nommé, coté et CHIFFRÉ. Sans
         ces étiquettes, le dessin disait le défaut sans jamais désigner le
         chemin — ni dire lequel des découplages le porte. */
      if(g.ponts && g.ponts.length){
        for(const p of g.ponts){
          const part = Math.max(p.part || 0, 0);
          /* On n'étiquette que ce qui travaille : sous 5 % le trait pâle suffit
             à dire « il est là et il ne sert pas ». */
          if(part < 0.05 && g.ponts.length > 1) continue;
          const e = w2s(p.x, p.y);
          const d = Math.hypot(p.x - g.via.x, p.y - g.via.y);
          cartouche({x:o.x + 0.6 * (e.x - o.x), y:o.y + 0.6 * (e.y - o.y)},
                    (p.repere || "découplage") + " · " + simNb(d, 2) + " mm · " +
                    Math.round(100 * part) + " %", "#38bdf8", -12, true, isSel);
        }
        /* LA CAVITÉ EST UN CHEMIN SANS OBJET À DESSINER : le courant de
           déplacement passe par la capacité répartie des deux plans, il ne
           traverse aucun composant. On ne peut pas lui tracer un trait, alors
           on écrit sa part sous le via — sinon les pourcentages affichés ne
           somment à rien et la lecture est fausse. */
        cartouche(o, (g.partCavite >= 0.005
                        ? Math.round(100 * g.partCavite) +
                          " % par la capacité des plans · "
                        : "") + "parts à " + simFreq(g.freqParts),
                  "#38bdf8", Math.max(20, rayon) + 17, true, isSel);
      }else{
        cartouche(o, "aucun découplage entre les deux plans dans " +
                  simNb(g.pontRayon, 0) + " mm",
                  "#e8564a", Math.max(20, rayon) + 17, true, isSel);
      }
    }
    else if(g.doute)
      cartouche(o, "référence " + noms + " : nets des plans non déclarés",
                "#e0a63c", Math.max(20, rayon), true, isSel);
  }
  c.restore();
}

/* Clic sur le canvas PCB pour sélectionner un via de signal, un via de masse ou un trait du chevelu */
function simRetourClicPcb(wx, wy){
  if(typeof SIM === "undefined" || !SIM.ouvert || SIM.analyse !== "retour") return false;
  const liens = simChevelu();
  if(!liens.length) return false;
  const tol = Math.max(0.4, 12 / S.scale);

  // 1. Clic sur un via de signal
  for(let gIdx = 0; gIdx < liens.length; gIdx++){
    const g = liens[gIdx];
    const r = Math.max((g.via.d || 0.6) / 2, tol);
    if(Math.hypot(wx - g.via.x, wy - g.via.y) <= r){
      if(typeof simSelectionnerVia === "function"){
        simSelectionnerVia(gIdx);
        const row = document.querySelector('[data-via-idx="' + gIdx + '"]');
        if(row && typeof row.scrollIntoView === "function") row.scrollIntoView({block:"nearest", behavior:"smooth"});
      }
      return true;
    }
  }

  // 2. Clic sur un via de masse ou un trait du chevelu
  for(let gIdx = 0; gIdx < liens.length; gIdx++){
    const g = liens[gIdx];
    for(let fIdx = 0; fIdx < g.voisins.length; fIdx++){
      const f = g.voisins[fIdx];
      const dGnd = Math.hypot(wx - f.via.x, wy - f.via.y);
      const dx = f.via.x - g.via.x, dy = f.via.y - g.via.y, l2 = dx*dx + dy*dy;
      let t = l2 <= 0 ? 0 : ((wx - g.via.x)*dx + (wy - g.via.y)*dy) / l2;
      t = Math.max(0, Math.min(1, t));
      const dRay = Math.hypot(wx - (g.via.x + t*dx), wy - (g.via.y + t*dy));
      if(dGnd <= tol * 1.5 || dRay <= tol * 0.9){
        if(typeof simSelectionnerGndVia === "function"){
          simSelectionnerGndVia(gIdx, fIdx);
          const item = document.querySelector('[data-via-idx="' + gIdx + '"] [data-gnd-idx="' + fIdx + '"]');
          if(item && typeof item.scrollIntoView === "function") item.scrollIntoView({block:"nearest", behavior:"smooth"});
        }
        return true;
      }
    }
  }
  return false;
}

/* ==========================================================================
   LA CHUTE CONTINUE — le cuivre, les vias, et les deux bornes
   --------------------------------------------------------------------------
   CE QUE L'UTILISATEUR FAIT, et le vocabulaire est celui du schéma :

     · une SOURCE est une alimentation — un régulateur, une arrivée. On lui
       règle sa TENSION, en volts. C'est elle qui tient le potentiel.
     · une CHARGE est un consommateur. On lui règle le COURANT qu'il tire, en
       ampères. C'est lui qui fait chuter.

   Autant de l'une et de l'autre qu'on veut : un rail nourrit dix composants,
   et ce que chacun voit dépend de ce que tirent les autres.

   CE QUE ÇA DEVIENT POUR LE SOLVEUR. Une source est une condition de
   DIRICHLET (potentiel imposé), une charge une condition de NEUMANN (courant
   imposé) — et le courant d'une charge est NÉGATIF, puisqu'il SORT du cuivre.
   C'est la seule traduction, elle se fait ici, et elle explique pourquoi le
   document parle encore de `sources` et de `references` : ce sont les deux
   listes du solveur, pas les deux mots de l'utilisateur.

   Les courants ne viennent pas du PCB — c'est le schéma qui sait ce qu'un
   composant tire, et il ne le porte pas encore. C'est donc à la main.

   POURQUOI LES DEUX BORNES SUFFISENT À TOUT DÉTERMINER. Le net des deux
   pastilles décide du cuivre à envoyer : ses pistes, ses zones, ses pastilles
   et SES VIAS, sur TOUTES les couches. Le changement de couche n'est donc pas
   une option qu'on coche — il est là dès qu'un via du net existe, et c'est le
   solveur qui décide quelle part du courant l'emprunte.

   CE QUI EST ENVOYÉ, ET CE QUI NE L'EST PAS. Est envoyé : tout le cuivre du
   net. N'est PAS envoyé : le cuivre des autres nets, qui ne conduit pas le
   courant de celui-ci. Les découpes de zone partent en `trou` — un plan évidé
   qu'on calculerait plein rendrait une chute trop faible, du côté qui rassure.
   ========================================================================== */

/* Les bornes vivent ici, et non dans le panneau : c'est la carte qui les
   porte, et elles doivent survivre à un aller-retour dans un autre onglet.

   UNE LISTE, ET PAS DEUX CASES. Un net d'alimentation nourrit plusieurs
   composants, et la chute que chacun voit dépend de ce que tirent les autres :
   c'est même tout l'intérêt du calcul. Deux cases obligeaient à autant de
   calculs séparés, dont aucun n'aurait été juste. */
const SIM_DCB={bornes:[], attente:null};

/* Un cercle en polygone. Vingt-quatre côtés : à 0,4 mm de diamètre, l'écart au
   cercle vrai est de trois micromètres — très en dessous de la trame la plus
   fine que le solveur accepte. */
function simDCCercle(x,y,r,n){
  const pts=[]; n=n||24;
  for(let i=0;i<n;i++){
    const a=2*Math.PI*i/n;
    pts.push([x+r*Math.cos(a), y+r*Math.sin(a)]);
  }
  return pts;
}

/* Une pastille en polygone, dans ses coordonnées monde et sa rotation.
   L'oblong est rendu par ses deux demi-cercles et le rectangle entre eux —
   le traiter en rectangle plein lui donnerait des coins qui n'existent pas,
   et un peu de cuivre en trop justement là où le courant tourne. */
function simDCPolyPastille(q){
  const c=Math.cos(q.rot), s=Math.sin(q.rot);
  const mo=(lx,ly)=>[q.x+lx*c-ly*s, q.y+lx*s+ly*c];
  if(q.shape==="circ")return simDCCercle(q.x,q.y,Math.max(q.w,q.h)/2);
  if(q.shape==="poly"&&Array.isArray(q.pts)&&q.pts.length>=3){
    return q.pts.map(p=>mo(p.x!=null?p.x:p[0], p.y!=null?p.y:p[1]));
  }
  if(q.shape==="chamfer"){
    const ch=q.chamfer!=null?q.chamfer:padChamferVal(q);
    const pts=padChamferPts(q.w,q.h,ch,q.chamferCorners);
    return pts.map(p=>mo(p.x,p.y));
  }
  if(q.shape==="oval"){
    const r=Math.min(q.w,q.h)/2;
    const dx=Math.max(0,q.w/2-r), dy=Math.max(0,q.h/2-r);
    const pts=[];
    for(let i=0;i<=12;i++){                    // le bout « positif »
      const a=-Math.PI/2+Math.PI*i/12;
      pts.push(mo(dx+r*Math.cos(a), dy*0+r*Math.sin(a)+dy));
    }
    for(let i=0;i<=12;i++){                    // le bout opposé
      const a=Math.PI/2+Math.PI*i/12;
      pts.push(mo(-dx+r*Math.cos(a), -dy+r*Math.sin(a)));
    }
    return pts;
  }
  return [mo(-q.w/2,-q.h/2), mo(q.w/2,-q.h/2),
          mo(q.w/2,q.h/2), mo(-q.w/2,q.h/2)];
}

/* Une piste en polygones. UN SEUL QUADRILATÈRE pour une droite ; pour un arc,
   une suite de quadrilatères le long de l'axe — les faire se chevaucher ne
   coûte rien, le solveur pose ses carreaux et l'union se fait toute seule,
   alors qu'un contour décalé d'un arc serré se recouperait lui-même.

   LES BOUTS SONT ALLONGÉS D'UNE DEMI-LARGEUR : le cuivre d'une piste finit en
   demi-disque, pas au ras de l'axe. Sans cela, deux pistes qui se rejoignent à
   angle droit laisseraient un carreau vide à leur coin — une coupure franche
   là où la carte est pleine. */
function simDCPolysPiste(t){
  const w=Math.max(t.w||0,1e-4), A=(typeof arcOf==="function")?arcOf(t):null;
  const n=A?Math.max(2,Math.min(64,Math.ceil(trkLen(t)/Math.max(w,0.05)))):1;
  const out=[];
  for(let i=0;i<n;i++){
    const a=trkAt(t,i/n), b=trkAt(t,(i+1)/n);
    let dx=b.x-a.x, dy=b.y-a.y;
    const L=Math.hypot(dx,dy);
    if(L<1e-9){dx=1;dy=0;}else{dx/=L;dy/=L;}
    const e=w/2;                                   // l'allonge des deux bouts
    const ax=a.x-dx*e, ay=a.y-dy*e, bx=b.x+dx*e, by=b.y+dy*e;
    const nx=-dy*e, ny=dx*e;
    out.push([[ax+nx,ay+ny],[bx+nx,by+ny],[bx-nx,by-ny],[ax-nx,ay-ny]]);
  }
  return out;
}

/* La hauteur traversée par un via, en millimètres : les diélectriques entre
   ses deux couches, et le cuivre des couches intermédiaires. C'est cette
   longueur-là qui fait sa résistance — la prendre pour l'épaisseur de la carte
   surestimerait un via enterré. */
function simDCHauteurVia(a,b){
  const lo=Math.min(a,b), hi=Math.max(a,b);
  let h=0;
  for(let i=lo;i<hi;i++)h+=(diAt(i)||{}).t||0;
  for(let i=lo+1;i<hi;i++)h+=cuT(i);
  return h>0?h:0.2;
}

/* Un point est-il dans ce polygone ? Lancer de rayon, sur la liste de couples
   que le document d'échange transporte — `inPoly` de l'éditeur travaille, lui,
   sur des {x,y}. */
function simDCDedans(x,y,pts){
  let d=false;
  for(let i=0,j=pts.length-1;i<pts.length;j=i++){
    const yi=pts[i][1], yj=pts[j][1];
    if((yi>y)!==(yj>y)&&
       x<(pts[j][0]-pts[i][0])*(y-yi)/(yj-yi)+pts[i][0])d=!d;
  }
  return d;
}

/* LES COUCHES QUE LE TUBE TOUCHE VRAIMENT.

   Un perçage métallisé est UN conducteur qui traverse la carte : son tube
   touche toutes les couches qu'il croise, pas seulement les deux extrêmes. La
   première version n'en reliait que deux, et le cuivre des couches
   intermédiaires — l'anneau d'une pastille traversante, par exemple — restait
   ÉLECTRIQUEMENT FLOTTANT. Le solveur refusait alors le calcul en bloc, pour
   la bonne raison : « 2016 nœuds n'atteignent aucune référence ». C'est une
   erreur qui ne se voit qu'en envoyant le document au serveur ; aucune
   relecture ne l'aurait montrée.

   On ne retient QUE les couches où le net porte effectivement du cuivre sous
   le trou. Relier une couche vide ne servirait à rien et ferait un via « hors
   calcul » de plus dans le tableau, pour rien. */
/* ==========================================================================
   CE QUE LA CARTE EMPORTE DE CHALEUR — LES COTES DE L'EMPILAGE
   --------------------------------------------------------------------------
   Le solveur ne lit plus l'échauffement sur la charte IPC-2221 : il résout
   l'ÉTALEMENT dans le stratifié, ce que la campagne IPC-2152 a mesuré et que
   la charte ignore. Il lui faut deux cotes que seul l'empilage porte.

   L'ÉPAISSEUR DE STRATIFIÉ est le diélectrique seul, `stackDiT()` : le cuivre
   ne fait pas partie de l'ailette isolante, il est compté à part, et le masque
   n'étale rien (25 µm de résine à 0,2 W/(m·K)).

   LE CUIVRE ÉTALEUR EST CE QUI ÉTALE VRAIMENT, et c'est là qu'est le seul
   jugement de cette fonction. 35 µm de cuivre pleine carte portent 390 ×
   35e-6 = 1,37e-2 W/K, contre 0,8 × 1,6e-3 = 1,28e-3 pour tout le FR-4 :
   dix fois plus. Compter tout le cuivre de l'empilage rendrait donc une
   température dix fois trop basse sur une carte dont les couches internes ne
   sont que du routage. On pondère chaque couche par la PART DE LA CARTE que
   ses ZONES couvrent — c'est ce que « plan de masse » veut dire physiquement,
   et le rôle annoncé de la couche n'y change rien : c'est le cuivre posé qui
   conduit, pas l'intention (même parti pris que `roleCheck`).

   LES PISTES ET LES PASTILLES NE COMPTENT PAS, et c'est délibérément du côté
   prudent : elles couvrent quelques pour cent d'une couche de routage, elles
   sont fragmentées — donc mauvaises ailettes —, et les mesurer demanderait de
   rastériser tout le cuivre de la carte à chaque calcul. Le chiffre penche
   ainsi vers le chaud, ce qui est le bon sens de l'erreur.

   λ N'EST PAS FOURNI, ET C'EST VOULU. Aucun fichier de CAO ne porte la
   conductivité thermique d'un laminé : « FR-4 » ne la donne pas, il la
   suggère. La poser ici la ferait passer pour une cote lue ; on laisse donc le
   solveur mettre son repli — qu'il ANNONCE comme supposé — et le champ du
   panneau l'emporte dès qu'on a la fiche du fabricant. */
function simDCThermiquePcb(){
  const aire=Math.abs(S.board.w*S.board.h);
  let etaleur=0;
  for(let i=0;i<S.cu;i++){
    let a=0;
    for(const z of S.zones)
      if(z.l===i&&z.pts&&z.pts.length>=3)a+=Math.abs(signedArea(z.pts));
    /* Des zones qui se recouvrent ne font pas plus de cuivre que la carte : on
       borne à 1, sinon deux arrosages superposés doubleraient l'ailette. */
    const taux=aire>0?Math.min(a/aire,1):0;
    etaleur+=cuT(i)*taux;
  }
  return {epaisseur_stratifie:stackDiT(), cuivre_etaleur:etaleur};
}

function simDCCouchesTouchees(x,y,a,b,polygones){
  const lo=Math.min(a,b), hi=Math.max(a,b), out=[];
  for(let c=lo;c<=hi;c++)
    if(polygones.some(g=>!g.trou&&g.couche===c&&simDCDedans(x,y,g.vertices)))
      out.push(c);
  return out;
}

/* Le tube, en autant de liaisons qu'il y a d'intervalles entre les couches
   qu'il touche. Chacune porte SA hauteur : deux couches voisines sont bien
   plus proches que les deux faces de la carte. */
function simDCTube(x,y,a,b,percage,net,repere,polygones,vias,suppose){
  const cs=simDCCouchesTouchees(x,y,a,b,polygones);
  if(cs.length<2)return 0;
  let n=0;
  for(let k=0;k<cs.length-1;k++){
    vias.push({x:x, y:y, couche_a:cs[k], couche_b:cs[k+1],
               percage:percage, placage:0.025,
               /* UN PERÇAGE DÉDUIT N'EST PAS UNE COTE, et R va comme 1/A : un
                  diamètre deviné à cinquante pour cent près se paie double sur
                  l'ohm. Le drapeau voyage jusqu'au résultat pour que le
                  tableau MARQUE ces lignes. */
               percage_suppose:!!suppose,
               hauteur:simDCHauteurVia(cs[k],cs[k+1]),
               net:net,
               repere:repere+(cs.length>2?(" "+(cs[k]+1)+"→"+(cs[k+1]+1)):"")});
    n++;
  }
  return n;
}

/* La borne sous le curseur : une pastille, et rien d'autre. Un via ou un bout
   de piste ferait un point d'injection valable pour le solveur, mais pas une
   borne qu'on puisse NOMMER — et une borne sans nom ne se vérifie pas d'un
   coup d'œil dans le panneau. */
function simDCBornePastille(x,y){
  let best=null,bd=1e9;
  for(const fp of S.fps)
    for(const q of padsWorld(fp)){
      const couches=padLayers(fp,q);
      const d=padDist(x,y,q);
      if(d<bd){
        bd=d;
        const cu=couches.indexOf(S.active)>=0?S.active:couches[0];
        let nom=(fp.ref||"?")+"."+(q.n==null?"?":q.n);
        let specVal=null, specU=null, specProv=null;
        if(typeof pcbComposantsSchema==="function"&&typeof pcbSpecsComposant==="function"){
          const sm=pcbComposantsSchema();
          const c=sm&&sm.get(fp.ref);
          if(c){
            const sp=pcbSpecsComposant(c);
            const pinKey=String(q.n!=null?q.n:"");
            const pinNom=c.pinNames&&(c.pinNames[pinKey]||c.pinNames[q.n]);
            if(pinNom)nom+=" ("+pinNom+")";
            else if(sp.mpn||sp.value)nom+=" ("+(sp.mpn||sp.value)+")";
            specProv=sp.provenance;
            if(sp.estSource&&sp.tension!=null){
              specVal=sp.tension; specU="V";
            }else if(sp.estCharge&&sp.courant!=null){
              specVal=sp.courant;
              specU=sp.courant<0.001?"µA":(sp.courant<1?"mA":"A");
            }
          }
        }
        best={nom:nom,
              x:q.x, y:q.y, couche:cu, net:q.net||"",
              w:q.w, h:q.h, shape:q.shape, rot:q.rot,
              couches:couches.slice(),
              specValeur:specVal, specUnite:specU, specProvenance:specProv};
      }
    }
  /* Une pastille à plus d'un millimètre du clic n'est pas celle qu'on visait :
     rendre la plus proche de toute la carte serait pire que ne rien rendre. */
  return (best&&bd<=1.0)?best:null;
}

/* Le clic qui désigne une borne. Appelé par l'outil (05-tools.js) quand le
   mode « borne DC » est armé.

   UNE PASTILLE DÉJÀ PRISE EST REMPLACÉE, pas doublée : cliquer deux fois la
   même pastille est une correction de tir, pas une demande d'y injecter deux
   fois le courant. */
function simDCClic(x,y){
  const role=SIM_DCB.attente;
  SIM_DCB.attente=null;
  if(typeof setMode==="function")setMode("select");
  const b=simDCBornePastille(x,y);
  if(!b){
    if(typeof hint==="function")
      hint("Aucune pastille sous le clic : visez le cuivre d'une pastille.");
  }else if(role){
    b.role=role;
    /* Une valeur d'usine UTILISABLE : 3,3 V pour une alimentation, un ampère
       pour un consommateur. Si le schéma fournit une spécification réelle pour
       ce composant, elle est prise d'office. */
    const aSpec = b.specValeur!=null&&(role==="source"?b.specUnite==="V":b.specUnite!=="V");
    b.provenance = aSpec ? (b.specProvenance || "catalogue") : "manuel";
    if(aSpec){
      b.valeur=b.specValeur;
      if(b.specUnite)b.unite=b.specUnite;
    }else{
      b.valeur=(role==="source")?3.3:1;
    }
    /* L'IDENTITÉ D'UNE BORNE EST SA POSITION, PAS SON NOM. Elle se comparait
       par `nom`, ce qui marchait tant que le nom était fabriqué à partir de la
       pastille ; depuis qu'il se RENOMME, recliquer une pastille renommée
       posait une SECONDE borne au même endroit — deux injections au même point,
       donc deux fois le courant, sans un mot. */
    const k=SIM_DCB.bornes.findIndex(o=>Math.abs(o.x-b.x)<1e-6&&
                                        Math.abs(o.y-b.y)<1e-6&&
                                        o.couche===b.couche);
    /* RECLIQUER LA MEME PASTILLE CORRIGE LE TIR : on remplace, et on garde ce
       que l'utilisateur avait posé dessus -- sa valeur, son unité ET SON NOM.
       L'unité oubliée ici, un « 500 mA » corrigé d'un clic redevenait
       « 0,5 A » affiché en ampères ; le nom oublié, « VBAT connecteur »
       redevenait « J1.1 ». */
    if(k>=0){
      const av=SIM_DCB.bornes[k];
      b.valeur=av.valeur; b.unite=av.unite;
      if(av.renomme){b.nom=av.nom;b.renomme=true;}
      if(av.provenance)b.provenance=av.provenance;
      SIM_DCB.bornes[k]=b;
    }
    else SIM_DCB.bornes.push(b);
    if(typeof hint==="function")
      hint((role==="source"?"Source (tension imposée)"
                           :"Charge (courant tiré)")+" : "+b.nom+
           (b.net?" (net "+b.net+")":" — cette pastille n'a pas de net"));
  }
  if(typeof simDCBorneChoisie==="function")simDCBorneChoisie();
}

/* ==========================================================================
   LE VOISINAGE — LE CUIVRE QUI LONGE LA SÉLECTION
   --------------------------------------------------------------------------
   L'AGRESSEUR N'EST JAMAIS DANS LA SÉLECTION, par définition : on sélectionne
   la piste dont on se soucie, pas celle qui la perturbe. Et l'autre moitié
   d'une paire différentielle n'y est pas non plus — on clique une piste, pas
   deux. Sans ce qui suit, ni le crosstalk ni l'impédance différentielle ne
   peuvent exister, quel que soit le solveur qu'il y a derrière.

   CE QUE LA PAGE ENVOIE, ET CE QU'ELLE NE DÉCIDE PAS. Elle envoie du cuivre —
   des tronçons droits, au même format que la géométrie sélectionnée. Elle ne
   décide pas de ce qui longe : c'est le serveur qui apparie, une fois pour les
   deux outils (`simulation_em._scenes_paralleles`). Deux implémentations de la
   même règle géométrique auraient dérivé, et l'éditeur et la visionneuse
   doivent rendre le même chiffre sur la même carte.

   ON RESTREINT SUR LA BOÎTE, et c'est tout ce qu'on filtre ici : même couche
   de cuivre, hors sélection, et une boîte englobante qui touche celle de la
   sélection élargie de la portée du couplage. Une carte de dix mille pistes ne
   doit pas en envoyer dix mille ; celles qui restent sont peu nombreuses, et
   c'est le serveur qui tranchera lesquelles longent vraiment.

   LES ARCS PARTENT EN CORDES (`trkSegs`), comme partout ailleurs dans cet
   outil : le serveur ne sait apparier que des segments droits, et une piste
   courbe qui longe une droite est de toute façon un longement dont l'écart
   varie — le critère de parallélisme l'écartera de lui-même là où il n'a plus
   de sens.
   ========================================================================== */
const SIM_VOISINAGE_MAX=600;    /* tronçons envoyés ; au-delà, on écrête */

/* `adjacentes` ÉTEND LA PORTÉE AUX COUCHES VOISINES, et c'est la section
   Crosstalk qui le demande. La Z différentielle ne l'utilise pas : sa section
   droite n'a qu'un plan de conducteurs et ne sait pas décrire deux pistes
   superposées — les envoyer lui ferait écarter du cuivre pour rien. Le
   crosstalk, lui, les PRÉSÉLECTIONNE : deux pistes superposées couplent
   souvent plus que les mêmes côte à côte, et ne pas les regarder du tout se
   lirait comme un couplage nul. Ce que le calcul sait ou ne sait pas en faire
   se dit côté serveur, à l'étape 0b — pas ici, en les cachant. */
function simVoisinagePcb(liste,adjacentes){
  const sel=new Set(liste||[...S.sel.tracks]);
  if(!sel.size)return [];
  /* La portée : l'écart maximal que le serveur regarde, plus la demi-largeur
     de la piste la plus large. En deçà, on écarterait du cuivre que le serveur
     aurait retenu ; bien au-delà, on l'inonderait. */
  const large=Math.max(...[...sel].map(t=>t.w||0),0);
  const couches=new Set([...sel].map(t=>t.l));
  if(adjacentes)
    for(const l of [...couches]){
      if(l-1>=0)couches.add(l-1);
      if(l+1<S.cu)couches.add(l+1);
    }
  let x1=Infinity,y1=Infinity,x2=-Infinity,y2=-Infinity;
  for(const t of sel){
    const b=trkBBox(t);
    x1=Math.min(x1,b.x1);y1=Math.min(y1,b.y1);
    x2=Math.max(x2,b.x2);y2=Math.max(y2,b.y2);
  }
  const marge=SIM_ECART_COUPLAGE+large;
  x1-=marge;y1-=marge;x2+=marge;y2+=marge;

  /* CHAQUE VOISINE PART AVEC SES DEUX ÉCARTS À LA MASSE, exactement comme les
     tronçons de la sélection. C'est ce qui permet au serveur de savoir si du
     cuivre de masse S'INTERPOSE entre les deux pistes — voir
     `_masse_interposee` dans `python/simulation_em.py`.

     CE QUE CELA CORRIGEAIT, ET C'ÉTAIT GROS. La page ne mesurait que l'écart
     de LA SÉLECTION à la masse ; le serveur repoussait donc la masse au bord
     du groupe, l'écart devenait négatif, il était ramené à zéro — et deux
     pistes séparées par un plan arrosé cousu de vias se résolvaient comme deux
     pistes face à face au-dessus du diélectrique nu. Le couplage annoncé était
     celui d'un routage qu'on n'avait pas fait.

     MESURÉ UNE FOIS PAR PISTE, au milieu, et non par tronçon : la sonde coûte
     une trentaine de tests de polygone, et une piste voisine porte le plus
     souvent le même dégagement d'un bout à l'autre — c'est la règle
     d'isolation qui l'a creusé. La sélection, elle, est découpée en plages
     d'écart constant, parce que c'est SON impédance qu'on rend. */
  const refs=simRefSet();
  const out=[];
  for(const t of S.tracks){
    if(sel.has(t)||!couches.has(t.l))continue;
    if(!(t.w>0)||!trkLen(t))continue;
    const b=trkBBox(t), demi=(t.w||0)/2;
    if(b.x2+demi<x1||b.x1-demi>x2||b.y2+demi<y1||b.y1-demi>y2)continue;
    const e=simEcartsA(t,0.5,refs);
    const cv=simCoutureCotes(t,refs);
    for(const g of trkSegs(t)){
      out.push({type:"track",
                start:[r3(g.x1),r3(g.y1)], end:[r3(g.x2),r3(g.y2)],
                width:t.w, layer:simCuIndex(t.l), net:t.net||"",
                copper_thickness:cuT(t.l),
                gap_left:e.g, gap_right:e.d,
                /* UNE VOISINE DE MASSE EST UNE GARDE, et une garde non cousue
                   ne blinde pas : elle transfère. Sa couture part donc avec
                   elle, comme ses deux écarts. */
                couture_left:cv.g, couture_right:cv.d});
      if(out.length>=SIM_VOISINAGE_MAX)return out;
    }
  }
  return out;
}

/* LES PAIRES DÉCLARÉES DE L'ÉDITEUR. Le serveur sait reconnaître _P/_N et ses
   variantes, mais une paire déclarée à la main dans le panneau « Paires
   différentielles » ne suit pas forcément une convention de nommage — et c'est
   la page qui détient cette vérité-là. */
function simPairesPcb(){
  return (S.dpPairs||[]).map(d=>[d.p,d.n]);
}

/* ==========================================================================
   L'adaptateur
   ========================================================================== */
/* ==========================================================================
   UN DOCUMENT POUR UNE LISTE DE TRONÇONS
   --------------------------------------------------------------------------
   MÊME CORPS POUR UN LOT ET POUR LA SÉLECTION ENTIÈRE, et c'est la raison d'être
   de cette fonction : les notes — vias non modélisés, absence de plan de
   référence, masse non déclarée — doivent être les mêmes qu'on calcule un
   morceau ou quatre. Deux copies auraient dérivé, et c'est la fiche du lot 3
   qui aurait cessé de prévenir.
   ========================================================================== */
function simDocPcb(liste,opts){
  const sel=liste||[...S.sel.tracks];
  if(!sel.length)
    return {erreur:"Aucune piste sélectionnée.",
            conseil:S.tracks.length
              ? ((typeof SIM!=="undefined"&&(SIM.analyse==="diff"||SIM.analyse==="zdiff"))
                  ? "Double-clic gauche sur la 1ère piste\n"+
                    "→ toute la piste sur la couche est sélectionnée.\n"+
                    "Maintenez Ctrl et faites un double-clic gauche (ou un simple clic gauche avec Ctrl) sur la 2ème piste\n"+
                    "→ toute la 2ème piste s'ajoute à la sélection."
                  : "Double-clic gauche sur une piste : toute la piste sur la couche est sélectionnée.\n"+
                    "Ctrl+clic ajoute un morceau à la sélection, Maj+clic prend le net entier.")
              : "Cette carte n'a pas encore de piste routée."};

  const g=simSegments(liste);
  if(!g.envoi.length)
    return {erreur:"La sélection ne porte aucun tronçon exploitable."};

  const notes=[];
  const nets=new Set(sel.map(t=>t.net).filter(Boolean));
  const net=nets.size===1?[...nets][0]:"";
  const vias=net?S.vias.filter(v=>v.net===net).length:0;
  if(vias)
    notes.push(vias+" via(s) du net ne sont pas modélisés : la transition "+
               "verticale manque au modèle.");
  if(!S.cuL.some((L,i)=>rolePlane(layerRole(i))))
    notes.push("Aucun plan de référence dans l'empilage : sans plan en face "+
               "de la piste, il n'y a pas de ligne de transmission.");
  /* AUCUNE MASSE DÉCLARÉE, et il faut le dire fort : le calcul coplanaire
     est alors désarmé, et toute piste noyée dans un plan arrosé ressortira
     en microruban, donc vingt pour cent trop haut. C'est un silence, pas une
     erreur du solveur — il n'y a que le panneau pour le rompre. */
  if(!simRefSet().size)
    notes.push("Aucun net de masse retenu : le cuivre qui borde la piste sur "+
               "sa propre couche n'est pas compté. Une piste noyée dans un "+
               "plan arrosé ressortira en microruban, soit vingt pour cent "+
               "trop haut. Choisissez la masse dans la barre du panneau.");

  return {
    doc:{
      carte:SIM_PCB.carte(), net:net,
      stackup:simStackup(),
      geometry:{objects:g.envoi},
      /* LES VIAS DE LA SÉLECTION, SANS ORDRE — voir `simViasPcb`. Leur
         chemin de retour ne dépend pas du parcours. */
      vias:g.vias||[],
      ports:[{id:1,impedance:opts.z0},{id:2,impedance:opts.z0}],
      /* LE CUIVRE QUI LONGE, et les paires déclarées : voir « LE VOISINAGE ».
         Ils ne changent RIEN au calcul d'impédance — le serveur les lit à
         part — mais sans eux il n'y a pas de Z différentielle. */
      voisinage:simVoisinagePcb(liste),
      paires:simPairesPcb(),
      /* LE TEMPS DE MONTÉE est déjà en SECONDES dans la saisie, comme les
         fréquences y sont en hertz : l'unité du champ ne dit que dans quoi on
         l'écrit. Zéro veut dire « déduis-le de la bande ». */
      /* L'AMPLITUDE voyage avec le temps de montée, et pour la même raison :
         elle vient de la rangée « Signal » du panneau, qui la porte déjà pour
         la diaphonie. Le serveur en a besoin pour le RAYONNEMENT de la boucle
         de retour, où elle entre LINÉAIREMENT — se tromper d'un facteur deux
         sur l'amplitude, c'est six décibels sur le champ. Zéro veut dire
         « prends ton repli ». */
      analyse:{f_debut:opts.f1, f_fin:opts.f2, points:opts.points,
               f_centre:opts.fc, temps_montee:opts.tr||0,
               amplitude_v:(SIM.saisie&&SIM.saisie.swing)||0}
    },
    objets:g.objets,
    portee:simPortee(g.objets,liste),
    /* LE TITRE tient dans une cellule du tableau des lots : le net, la ou les
       couches, et de combien de tronçons c'est fait. */
    titre:(net||"sans net")+" · "+
          [...new Set(g.objets.map(o=>o.couche))].join(", ")+
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

     · LES POSITIONS DES VIAS DE COUTURE, projetées sur l'ABSCISSE CURVILIGNE
       du parcours. `simEspacement` mesurait déjà le plus grand trou par
       tronçon ; c'est assez pour dire QU'IL y a un trou, pas pour dire OÙ. Or
       toute la section existe pour dire où ;
     · LES DISCONTINUITÉS DU PLAN DE RÉFÉRENCE sous le parcours. On sonde le
       plan le plus proche, sous puis sur la piste, et l'on relève les endroits
       où il n'y a pas de cuivre de masse. C'est la cause la plus fréquente
       d'un pic de couplage localisé là où le plan paraît continu partout
       ailleurs ;
     · LES VIAS DE MASSE, pour juger les changements de couche : le retour doit
       changer de plan là où le signal change de couche, et s'il n'a pas de via
       pour le faire, il fait le tour.

   ET QUAND ON N'A PAS PU REGARDER, ON N'ENVOIE PAS LE CHAMP. Un plan de
   référence qui ne porte aucune zone de cuivre n'est pas un plan sans fente :
   c'est un plan qu'on ne sait pas sonder, et le dire est la seule réponse
   honnête. Le serveur écrit alors « rien n'a pu être examiné » au lieu de
   « aucune zone de vigilance ».
   ========================================================================== */
const SIM_XT_PAS=0.5;           /* mm — le pas de sonde du plan de référence */
const SIM_XT_SONDES_MAX=2000;   /* au-delà, on grossit le pas plutôt que d'inonder */

/* Le parcours, tronçon par tronçon, avec son abscisse curviligne cumulée.
   C'est le même axe que celui du serveur (`_parcours`), et il faut que ce soit
   le même : c'est lui qui met un via de couture et un pic de couplage à la
   même abscisse sur la carte. */
function simXtParcours(g){
  const out=[];
  let s=0;
  for(const o of g.objets){
    const l=o.longueur||0;
    out.push({o:o, s0:s, longueur:l});
    s+=l;
  }
  return {liste:out, total:s};
}

/* L'abscisse curviligne d'un point du plan, ou -1 s'il ne tombe sur aucun
   tronçon du parcours. On projette sur CHAQUE tronçon et l'on garde le plus
   proche : deux tronçons d'un même repli peuvent tous deux accepter la
   projection, et prendre le premier venu placerait le via à l'autre bout. */
function simXtAbscisse(par,x,y){
  let meilleur=-1, dmin=Infinity;
  for(const e of par.liste){
    const t=e.o.trk;
    const u=simProjU(t,x,y);
    if(u<0)continue;
    const a=Math.min(e.o.ua,e.o.ub), b=Math.max(e.o.ua,e.o.ub);
    if(u<a-1e-6||u>b+1e-6)continue;
    const p=trkAt(t,u), d=Math.hypot(p.x-x,p.y-y);
    if(d>=dmin)continue;
    const etendue=(e.o.ub-e.o.ua);
    const frac=Math.abs(etendue)<1e-9?0:(u-e.o.ua)/etendue;
    dmin=d;
    meilleur=e.s0+Math.max(0,Math.min(1,frac))*e.longueur;
  }
  return meilleur;
}

/* Les vias de couture, chacun à son abscisse et de son côté. Le couloir et le
   critère de portée sont ceux de `simEspacement` — la même règle mesurée deux
   fois finirait par donner deux réponses. */
function simXtCouture(par,refs){
  const out=[];
  if(!refs||!refs.size)return out;
  for(const v of S.vias){
    if(!refs.has(v.net))continue;
    const s=simXtAbscisse(par,v.x,v.y);
    if(s<0)continue;
    /* LA COUCHE COMPTE : un via borgne qui n'atteint pas la couche de la piste
       ne la coud pas. C'est le même critère que `simEspacement`. */
    const sur=par.liste.some(e=>v.a<=e.o.l&&e.o.l<=v.b);
    if(!sur)continue;
    let cote=0, dist=Infinity;
    for(const e of par.liste){
      const t=e.o.trk;
      const u=simProjU(t,v.x,v.y);
      if(u<0)continue;
      const d=trkDist(v.x,v.y,t)-(t.w||0)/2-(v.d||0)/2;
      if(d>=dist)continue;
      const tg=simTangente(t,u), p=trkAt(t,u);
      dist=d;
      cote=((-tg.y)*(v.x-p.x)+tg.x*(v.y-p.y))>=0?1:-1;
    }
    if(!(dist<=SIM_COULOIR))continue;
    out.push({s:r3(s), cote:cote});
  }
  return out.sort((a,b)=>a.s-b.s);
}

/* LES PLANS DE RÉFÉRENCE d'une couche de signal — au pluriel, et c'est le
   correctif. Cette fonction ne rendait que le premier plan EN DESSOUS, avec
   repli sur celui du dessus. Correct pour un microruban, qui n'en a qu'un ;
   faux pour une triplaque, qui en a deux et dont le retour se partage entre
   eux. Une fente dans le plan du DESSUS d'une piste interne n'était donc
   jamais sondée, alors que `simPlansRef` — celle qui décide de Z₀ — retient
   bien les deux.

   ON REND LA MÊME CHOSE QUE `simPlansRef`, et il faut que ce soit la même :
   deux règles pour désigner le plan de retour, ce sont deux verdicts le jour
   où l'une bouge. */
function simXtPlansDe(l){
  return simPlansRef(l);
}

/* Les discontinuités du plan sous le parcours, en intervalles d'abscisse.

   REND `null` QUAND ON N'A PAS SU SONDER, et c'est la moitié de l'intérêt : un
   plan de référence qui ne porte aucune zone de cuivre n'est pas un plan sans
   fente, c'est un plan qu'on ne voit pas. Rendre une liste vide ferait écrire
   « aucune zone de vigilance » sous un contrôle qui n'a jamais eu lieu. */
function simXtFentes(par,refs){
  if(!par.total)return null;
  const pas=Math.max(SIM_XT_PAS,par.total/SIM_XT_SONDES_MAX);
  let sondable=false;
  const trous=[];
  let courant=null;
  for(const e of par.liste){
    /* TOUS LES PLANS DE RÉFÉRENCE, ET PLUS SEULEMENT CELUI DU DESSOUS. Une
       triplaque en a deux, et le courant de retour se partage entre eux : une
       fente dans l'un ouvre la boucle même si l'autre est intact. Ne sonder
       que le premier trouvé en descendant laissait invisible toute fente au
       DESSUS d'une piste interne. */
    const plans=simXtPlansDe(e.o.l).filter(i=>S.zones.some(z=>z.l===i));
    /* UNE COUCHE SANS PLAN N'A PAS DE FENTE À AVOIR : c'est un défaut d'un
       autre ordre, que l'onglet Impédance signale déjà. On passe, sans
       compter ce tronçon comme sondé. */
    if(!plans.length)continue;
    sondable=true;
    const n=Math.max(1,Math.round(e.longueur/pas));
    for(let k=0;k<=n;k++){
      const f=k/n;
      const u=e.o.ua+(e.o.ub-e.o.ua)*f;
      const p=trkAt(e.o.trk,u);
      /* UN SEUL PLAN PERCÉ SUFFIT À OUVRIR LA BOUCLE. On note lequel : « le
         plan du dessus » et « le plan du dessous » ne demandent pas le même
         geste, et sur une triplaque la fiche doit pouvoir le dire. */
      const nus=plans.filter(i=>!simXtZoneMasse(i,p.x,p.y,refs));
      const s=e.s0+f*e.longueur;
      if(!nus.length){
        if(courant){trous.push(courant);courant=null;}
      }else if(courant&&s-courant.fin<=pas*1.5){
        courant.fin=s;
        for(const i of nus)if(courant.plans.indexOf(i)<0)courant.plans.push(i);
      }else{
        if(courant)trous.push(courant);
        courant={debut:s, fin:s, plans:nus.slice()};
      }
    }
  }
  if(courant)trous.push(courant);
  if(!sondable)return null;
  /* UN SEUL POINT SANS CUIVRE N'EST PAS UNE FENTE : c'est le pas de sonde qui
     tombe dans un dégagement d'antipad. On garde ce qui dure au moins deux
     pas — en deçà, on inonderait la carte de marques que rien ne justifie. */
  return trous.filter(t=>t.fin-t.debut>=pas*1.5)
    .map(t=>({s:r3(t.debut), longueur:r3(t.fin-t.debut),
              quoi:(t.plans.length>1
                      ? "les plans de référence "+t.plans.map(i=>cuLabel(i,S.cu)).join(" / ")+
                        " n'ont pas de cuivre de retour"
                      : "le plan de référence "+cuLabel(t.plans[0],S.cu)+
                        " n'a pas de cuivre de retour")+
                   " sous le parcours sur "+r3(t.fin-t.debut)+" mm"}));
}

/* Y a-t-il du cuivre DE MASSE sur cette couche, en ce point ? Le cuivre d'un
   AUTRE net y est un trou du plan de retour tout autant qu'une absence de
   cuivre : le courant ne peut pas y passer. */
function simXtZoneMasse(couche,x,y,refs){
  const z=simZoneEn(couche,x,y);
  return (z&&(!refs||!refs.size||refs.has(z.net)))?z:null;
}

/* Les vias de masse à portée du parcours, pour juger les changements de
   couche. On les envoie tous ceux qui sont dans la boîte élargie : c'est le
   serveur qui mesure la distance, et il le fait au droit de la transition. */
function simXtViasMasse(par,refs){
  const out=[];
  if(!refs||!refs.size)return out;
  const R=SIM_RAYON_RETOUR;
  for(const v of S.vias){
    if(!refs.has(v.net))continue;
    let proche=false;
    for(const e of par.liste){
      if(trkDist(v.x,v.y,e.o.trk)<=R+(e.o.trk.w||0)/2){proche=true;break;}
    }
    if(!proche)continue;
    out.push({x:r3(v.x), y:r3(v.y),
              a:simCuIndex(Math.min(v.a,v.b)),
              b:simCuIndex(Math.max(v.a,v.b))});
  }
  return out;
}

/* ==========================================================================
   LES ZONES À RISQUE SUR LE CUIVRE — CE QUE CET OUTIL SAIT EN DIRE
   --------------------------------------------------------------------------
   TOUT L'ALGORITHME EST DANS `commun/simulation-em.js`, et c'est voulu : il
   projette le cuivre d'une victime sur le parcours de l'agresseur, garde ce
   qui tombe dans la plage, et découpe en morceaux contigus. Deux copies de
   cette règle-là — une par outil — auraient fini par ne plus désigner le même
   cuivre sur la même carte, ce qui est exactement le défaut que la mise en
   commun de `_longement_intervalle` avait déjà corrigé côté serveur.

   CE QUE L'OUTIL FOURNIT SE RÉSUME À DEUX FORMES, en MILLIMÈTRES, qui sont
   celles de l'axe du serveur : le parcours de l'agresseur tronçon par tronçon,
   et les polylignes de chaque victime. Un arc est plié ici, une fois, par
   `trkAt` — la définition du dessin, donc celle qui ne peut pas se
   désynchroniser de ce qu'on voit à l'écran.
   ========================================================================== */
const SIM_XT_PLI=0.3;           /* mm — le pas de pliage d'un arc */

function simXtPolyDe(t){
  /* Une droite tient en ses deux bouts ; un arc se plie assez fin pour que la
     projection ne coupe pas les virages. */
  const L=trkLen(t)||0;
  const n=arcOf(t)?Math.max(2,Math.ceil(L/SIM_XT_PLI)):1;
  const pts=[];
  for(let k=0;k<=n;k++){
    const p=trkAt(t,k/n);
    pts.push(p.x,p.y);
  }
  return pts;
}

function simXtGeometriePcb(){
  const g=simSegments(null);
  const par=simXtParcours(g);
  const parcours=par.liste.map(function(e){
    const t=e.o.trk, a=e.o.ua, b=e.o.ub;
    const L=trkLen(t)||0;
    const n=arcOf(t)?Math.max(2,Math.ceil(L*Math.abs(b-a)/SIM_XT_PLI)):1;
    const pts=[];
    for(let k=0;k<=n;k++){
      const p=trkAt(t,a+(b-a)*k/n);
      pts.push(p.x,p.y);
    }
    return {s0:e.s0, longueur:e.longueur, pts:pts};
  });
  /* LES VICTIMES SONT PRISES PAR LEUR NET, sur TOUTES leurs couches. Une
     victime qui change de couche en cours de longement reste la même piste, et
     la portion à risque peut fort bien tomber après le via. */
  const victimes={};
  for(const net of (typeof simXtVictimesVoulues==="function"
                    ? simXtVictimesVoulues() : [])){
    if(victimes[net])continue;
    victimes[net]=S.tracks.filter(t=>t.net===net).map(simXtPolyDe);
  }
  return {parcours:parcours, victimes:victimes};
}

/* La surimpression elle-même. Elle passe APRÈS les cartes de chaleur et avant
   les étiquettes, comme le chevelu du retour : elle désigne des portions de
   cuivre, elle ne décrit pas le cuivre. */
function simXtRisqueTrace(c,dpr){
  if(typeof simXtRisqueGeom!=="function")return;
  /* LA CHALEUR PASSE D'ABORD, LES PLAGES PAR-DESSUS. La chaleur décrit TOUT le
     longement, du bleu au rouge ; les plages ne désignent que les portions à
     reprendre et portent un verdict. Peindre la chaleur au-dessus effacerait
     le verdict sous une couleur qui n'en porte pas. */
  simXtPeindreChaleur(c,(x,y)=>[x,y],px(2.5)+0.10);
  const zones=simXtRisqueGeom();
  if(!zones.length){
    /* LE POINT DE LA RÉGLETTE NE DÉPEND D'AUCUNE PLAGE : il se pose dès qu'il
       y a un résultat et une piste à désigner. SON RAYON EST EN PIXELS
       D'ÉCRAN, sans part fixe en millimètres : c'est un viseur, et un viseur
       qui grossit avec le zoom finit par cacher le millimètre de piste qu'il
       désigne. */
    simXtPeindreCurseur(c,(x,y)=>[x,y],px(4.5));
    return;
  }
  c.save();
  c.lineCap="round";
  c.lineJoin="round";
  for(const z of zones){
    c.strokeStyle=simXtRisqueCouleur(z);
    /* L'ÉPAISSEUR EST CELLE DU CUIVRE, débordée d'un peu : la surimpression
       doit se voir SUR la piste, pas à côté, et surtout pas la remplacer — on
       veut continuer de reconnaître le tracé dessous. */
    c.lineWidth=px(2.5)+0.18;
    for(const m of z.traits){
      c.beginPath();
      c.moveTo(m[0],m[1]);
      for(let i=2;i+1<m.length;i+=2)c.lineTo(m[i],m[i+1]);
      c.stroke();
    }
  }
  c.restore();
  simXtPeindreCurseur(c,(x,y)=>[x,y],px(4.5));
}

/* ==========================================================================
   LIAISON SCHÉMATIQUE & COMPOSANTS ENRICHIS
   --------------------------------------------------------------------------
   L'éditeur PCB s'appuie ici sur les données techniques saisies au schéma :
   tensions de fonctionnement, courants maximaux, puissances, résistances,
   fréquences et brochage.
   Trois sources possibles :
     · S.schDoc si déjà injecté ou chargé en mémoire ;
     · sessLire("schema") depuis la session d'onglets (inter-outils temps réel) ;
     · projdDocLire("schema") sur le disque du projet courant.
   ========================================================================== */

function pcbParseVolt(val){
  if(val==null)return null;
  const m=String(val).match(/(\d+(?:[.,]\d+)?)\s*V\b/i);
  return m?parseFloat(m[1].replace(",",".")):null;
}

function pcbParseCourant(val){
  if(val==null)return null;
  const m=String(val).match(/(\d+(?:[.,]\d+)?)\s*(µA|uA|mA|A)\b/i);
  if(!m)return null;
  const n=parseFloat(m[1].replace(",","."));
  const u=m[2].toLowerCase();
  if(u.includes("u")||u.includes("µ"))return n*1e-6;
  if(u.includes("m"))return n*1e-3;
  return n;
}

function pcbParsePuissance(val){
  if(val==null)return null;
  const s=String(val).trim();
  const frac=s.match(/(\d+(?:[.,]\d+)?)\s*\/\s*(\d+(?:[.,]\d+)?)\s*(mW|W)\b/i);
  if(frac){
    const num=parseFloat(frac[1].replace(",","."));
    const den=parseFloat(frac[2].replace(",","."));
    const factor=frac[3].toLowerCase()==="mw"?1e-3:1.0;
    return den!==0?(num/den)*factor:null;
  }
  const m=s.match(/(\d+(?:[.,]\d+)?)\s*(mW|W)\b/i);
  if(!m)return null;
  const n=parseFloat(m[1].replace(",","."));
  return m[2].toLowerCase()==="mw"?n*1e-3:n;
}

function pcbParseResistance(val){
  if(val==null) return null;
  const s=String(val).trim();
  if(!s) return null;

  const pkgCodes = ["0402", "0603", "0805", "1206", "1210", "1812", "2010", "2512", "0201", "01005"];
  if(pkgCodes.includes(s)) return null;

  // 1. Valeur numérique pure (ex: "560", "22", "1000", "4.7")
  if(/^\d+(?:[.,]\d+)?$/.test(s)){
    return parseFloat(s.replace(",", "."));
  }

  // 2. Format R standard : 4R7 -> 4.7, 22R -> 22, 0R5 -> 0.5, 22R0 -> 22.0
  const mCode = s.match(/\b(\d+)[rR](\d*)\b/);
  if(mCode){
    const dec = mCode[2] ? ("." + mCode[2]) : "";
    return parseFloat(mCode[1] + dec);
  }

  // 3. Format K standard : 4K7 -> 4700, 10K -> 10000, 10K5 -> 10500
  const mCodeK = s.match(/\b(\d+)[kK](\d*)\b/);
  if(mCodeK){
    const dec = mCodeK[2] ? ("." + mCodeK[2]) : "";
    return parseFloat(mCodeK[1] + dec) * 1000;
  }

  // 4. Format M standard : 1M -> 1e6, 2M2 -> 2.2e6
  const mCodeM = s.match(/\b(\d+)[mM](\d*)\b/);
  if(mCodeM && !/ohm/i.test(s)){
    const dec = mCodeM[2] ? ("." + mCodeM[2]) : "";
    return parseFloat(mCodeM[1] + dec) * 1e6;
  }

  // 5. Format R préfixe : R10 -> 0.10, R050 -> 0.050
  const mPreR = s.match(/\b[rR](\d+(?:[.,]\d+)?)\b/);
  if(mPreR){
    return parseFloat("0." + mPreR[1].replace(",", ""));
  }

  // 6. Format avec unité explicite : "560 ohm", "22 Ω", "4.7 kohm", "10k"
  const mUnit = s.match(/(\d+(?:[.,]\d+)?)\s*(k|m|r|ohm|Ω)\b/i);
  if(mUnit){
    const n = parseFloat(mUnit[1].replace(",", "."));
    const u = mUnit[2].toLowerCase();
    if(u.includes("k")) return n * 1000;
    if(u.includes("m") && !u.includes("ohm")) return n * 1e6;
    return n;
  }

  // 7. Nombre isolé ne correspondant pas à un code boîtier (0402, 0603, etc.)
  const allNums = s.match(/\b\d+(?:[.,]\d+)?\b/g);
  if(allNums){
    for(const numStr of allNums){
      if(["0402", "0603", "0805", "1206", "1210", "1812", "2010", "2512", "0201", "01005"].includes(numStr)) continue;
      const n = parseFloat(numStr.replace(",", "."));
      if(n >= 0) return n;
    }
  }

  return null;
}

function pcbParseFrequence(val){
  if(val==null)return null;
  const m=String(val).match(/(\d+(?:[.,]\d+)?)\s*(kHz|MHz|GHz|Hz)\b/i);
  if(!m)return null;
  const n=parseFloat(m[1].replace(",","."));
  const u=m[2].toLowerCase();
  if(u==="ghz")return n*1e9;
  if(u==="mhz")return n*1e6;
  if(u==="khz")return n*1e3;
  return n;
}

function pcbDefinirSchema(doc){
  if(typeof S!=="undefined")S.schDoc=doc;
}

function pcbSchemaDoc(){
  if(typeof S!=="undefined"&&S.schDoc)return S.schDoc;
  if(typeof sessLire==="function"){
    try{
      const s=sessLire("schema");
      if(s&&s.etat&&s.etat.doc){
        if(typeof S!=="undefined")S.schDoc=s.etat.doc;
        return s.etat.doc;
      }
    }catch(_){}
  }
  return null;
}

async function pcbSyncSchema(){
  if(typeof S!=="undefined"&&S.schDoc)return S.schDoc;
  if(typeof projdLie==="function"&&projdLie()&&typeof projdDocLire==="function"){
    try{
      const d=await projdDocLire("schema");
      if(d){
        if(typeof S!=="undefined")S.schDoc=d;
        return d;
      }
    }catch(_){}
  }
  return pcbSchemaDoc();
}

function pcbComposantsSchema(doc){
  const sch=doc||pcbSchemaDoc();
  const m=new Map();
  if(!sch)return m;
  const pages=Array.isArray(sch.pages)?sch.pages:[sch];
  pages.forEach((p,pIdx)=>{
    const comps=Array.isArray(p.comps)?p.comps:(Array.isArray(p.components)?p.components:[]);
    for(const c of comps){
      if(!c||!c.ref)continue;
      m.set(c.ref,{
        ref:c.ref,
        type:c.type||"",
        value:c.value||c.val||"",
        pkg:c.pkg||"",
        mpn:c.mpn||c.csvMpn||c.csvPartName||"",
        manufacturer:c.manufacturer||"",
        specs:c.specs||{},
        specsProvenance:c.specsProvenance||"",
        distributeurs:c.distributeurs||{},
        datasheet_local:c.datasheet_local||"",
        datasheet_url:c.datasheet_url||c.datasheet_web||c.datasheet||"",
        pinNames:Array.isArray(c.pinNames)?c.pinNames:(c.pinNames||[]),
        pinout:Array.isArray(c.pinout)?c.pinout:[],
        pinoutVerified:!!c.pinoutVerified,
        npins:c.npins||(Array.isArray(c.pinNames)?c.pinNames.length:0),
        lcsc:c.lcsc||"",
        pageIndex:pIdx,
        pageName:p.name||("Feuille "+(pIdx+1))
      });
    }
  });
  return m;
}

function pcbSpecsComposant(c){
  if(!c)return null;
  const sp=c.specs||{};
  let voltOut=null, voltIn=null, curr=null, power=null, res=null, freq=null;
  let prov=c.specsProvenance || null;
  
  for(const [k,v] of Object.entries(sp)){
    if(v==null || v==="" || v==="xx" || v==="-") continue;
    const kl=k.toLowerCase();
    if((kl.includes("output")||kl.includes("out"))&&kl.includes("volt"))voltOut=voltOut||pcbParseVolt(v);
    else if((kl.includes("supply")||kl.includes("operating")||kl.includes("input")||kl.includes("forward")||kl.includes("rating")||kl.includes("rated")||kl.includes("nom")||kl.includes("tension"))&&kl.includes("volt"))voltIn=voltIn||pcbParseVolt(v);
    else if(kl.includes("resistance"))res=res||pcbParseResistance(v);
    else if((kl.includes("current")||kl.includes("courant"))&&(kl.includes("supply")||kl.includes("operating")||kl.includes("max")||kl.includes("output")||kl.includes("forward")||kl.includes("rating")||kl.includes("rated")||kl.includes("consommation")||kl.includes("load")||kl.includes("charge")||kl.includes("nom")))curr=curr||pcbParseCourant(v);
    else if(kl.includes("power")||kl.includes("watt")||kl.includes("puissance"))power=power||pcbParsePuissance(v);
    else if(kl.includes("freq")||kl.includes("speed")||kl.includes("clock"))freq=freq||pcbParseFrequence(v);
  }

  if(!prov && (curr!=null || voltOut!=null || voltIn!=null)){
    prov = (sp["Current Rating"]||sp["Voltage Rating"]||sp["current Rating"]||sp["voltage rating"]) ? "catalogue" : "schema";
  }

  // Repli direct sur le catalogue CSV en mémoire si présent
  if((curr==null || (voltOut==null && voltIn==null)) && typeof window!=="undefined" && Array.isArray(window.CSV_LIB)){
    const targetPart=(c.csvPartName||c.mpn||c.value||"").toLowerCase().trim();
    const targetMpn=(c.mpn||c.csvMpn||"").toLowerCase().trim();
    if(targetPart || targetMpn){
      const entry=window.CSV_LIB.find(it=>{
        const p=(it["Part Name"]||"").toLowerCase().trim();
        const pn=(it["Part Number"]||it["Part Number "]||it["MPN"]||"").toLowerCase().trim();
        return (targetPart && p===targetPart) || (targetMpn && pn===targetMpn) || (targetPart && pn===targetPart);
      });
      if(entry){
        const vRating=entry["Voltage Rating"]||entry["voltage rating"]||entry["Voltage"]||"";
        const cRating=entry["current Rating"]||entry["Current Rating"]||entry["current rating"]||"";
        const wRating=entry["wattage"]||entry["Wattage"]||"";
        const fRating=entry["fréquency"]||entry["frequency"]||entry["Frequency"]||"";
        
        if(voltOut==null && voltIn==null && vRating && vRating!=="xx" && vRating!=="-"){
          const parsedV=pcbParseVolt(vRating);
          if(parsedV!=null){
            if(c.type==="regulator"||/^(VR|REG)/i.test(c.ref)) voltOut=parsedV;
            else voltIn=parsedV;
            prov="catalogue";
          }
        }
        if(curr==null && cRating && cRating!=="xx" && cRating!=="-"){
          const parsedI=pcbParseCourant(cRating);
          if(parsedI!=null){
            curr=parsedI;
            prov="catalogue";
          }
        }
        if(power==null && wRating && wRating!=="xx" && wRating!=="-"){
          power=pcbParsePuissance(wRating);
        }
        if(freq==null && fRating && fRating!=="xx" && fRating!=="-"){
          freq=pcbParseFrequence(fRating);
        }
      }
    }
  }
  
  if(voltOut==null&&(c.type==="regulator"||/^(VR|REG|U_REG)/i.test(c.ref))){
    voltOut=pcbParseVolt(c.value)||pcbParseVolt(c.mpn);
    if(voltOut!=null && !prov) prov="schema";
  }
  if(voltIn==null){
    voltIn=pcbParseVolt(c.value);
    if(voltIn!=null && !prov) prov="schema";
  }
  if(res==null&&(c.type==="resistor"||/^R/i.test(c.ref))){
    res=pcbParseResistance(c.value);
  }
  
  const estSource=(c.type==="vcc"||c.type==="regulator"||
                   /^(VR|REG|PWR|BAT|J|CON|U_REG)/i.test(c.ref)||
                   (voltOut!=null&&voltOut>0));
  const estCharge=!estSource&&(c.type==="ic"||c.type==="led"||c.type==="diode"||/^(U|IC|MCU|D|LED)/i.test(c.ref));
  
  let courantConsomme=curr;
  if(courantConsomme==null&&power!=null&&(voltIn||voltOut||3.3)>0){
    courantConsomme=power/(voltIn||voltOut||3.3);
    if(courantConsomme!=null && !prov) prov="schema";
  }

  /* Surcharge issue de l'analyse des motifs de circuits du schéma */
  try {
    const rawDc = typeof sessionStorage !== "undefined" && sessionStorage.getItem("web_cao_courants_dc");
    if (rawDc) {
      const listDc = JSON.parse(rawDc);
      if (Array.isArray(listDc)) {
        const match = listDc.find(x => (x.composant === c.ref || x.source === c.ref));
        if (match) {
          if (courantConsomme == null && match.courant_ma != null) {
            if (estCharge || match.role === "charge") {
              courantConsomme = match.courant_ma / 1000.0;
              prov="motif";
            }
          }
          if (match.tension_v != null) {
            if (estSource) { voltOut = match.tension_v; prov="motif"; }
            else if (voltIn == null) { voltIn = match.tension_v; prov="motif"; }
          }
        }
      }
    }
  } catch (_) {}

  if(courantConsomme==null&&estCharge){
    if(c.type==="led"||/^D/i.test(c.ref))courantConsomme=0.015;
    else courantConsomme=0.030;
    prov="defaut";
  } else if(!prov) {
    prov="defaut";
  }
  
  const par = typeof pcbParasitesComposant === "function" ? pcbParasitesComposant(c) : null;
  if (par) {
    if (par.dcr != null && res == null && (c.type === "inductor" || /^(L|FB|BEAD|SELF)/i.test(c.ref))) {
      res = par.dcr;
      if (!prov || prov === "defaut") prov = par.provenance;
    }
  }

  return {
    ref:c.ref,
    type:c.type,
    value:c.value,
    mpn:c.mpn||"",
    manufacturer:c.manufacturer||"",
    voltOut:voltOut,
    voltIn:voltIn,
    tension:voltOut||voltIn||3.3,
    courant:courantConsomme,
    courantSortie:estSource?(curr||1.0):null,
    resistance:res,
    dcr: par ? par.dcr : null,
    isat: par ? par.isat : null,
    esr: par ? par.esr : null,
    esl: par ? par.esl : null,
    inductance: par ? par.l : null,
    capacite: par ? par.c : null,
    puissance:power,
    frequence:freq,
    estSource:estSource,
    estCharge:estCharge,
    specs:sp,
    provenance:prov,
    pinNames:c.pinNames||{}
  };
}

/* ==========================================================================
   VÉRIFICATION DU PINOUT, DE LA TAILLE DU BOÎTIER ET DES DISTANCES ENTRE PINS
   --------------------------------------------------------------------------
   Vérifie automatiquement que chaque composant du schéma est correctement
   transposé sur l'empreinte PCB :
     1. Distance entre les pins (pitch) conforme aux spécifications du boîtier ;
     2. Taille et écartement du boîtier (span / dimensions) conformes ;
     3. Nombre de pastilles cohérent avec le nombre de broches du schéma ;
     4. Raccordement et absence de court-circuit alimentation / masse.
   ========================================================================== */

function pcbVerifierPinoutComposant(c, fp) {
  if (!c) return null;
  const ref = c.ref;
  if (!fp) {
    return {
      ref: ref,
      value: c.value,
      pkg: c.pkg,
      mpn: c.mpn,
      statut: "NON_PLACE",
      fpPresent: false,
      conforme: false,
      pitchCheck: { ok: false, msg: "Empreinte non encore posée sur le PCB" },
      spanCheck: { ok: false, msg: "Empreinte non encore posée sur le PCB" },
      pinCountCheck: { ok: false, msg: "Empreinte non encore posée sur le PCB" },
      anomalies: ["Empreinte " + ref + " absente de la carte"],
      resume: "Empreinte non encore posée sur le PCB",
      pins: []
    };
  }

  const pkgName = c.pkg || fp.pkg || "";
  const nSch = c.npins || (c.pinout && c.pinout.length) || (Array.isArray(c.pinNames) && c.pinNames.filter(Boolean).length) || fp.pins || 2;
  const nPcb = fp.pins || (Array.isArray(fp.pads) && fp.pads.length) || 2;

  // Géométrie attendue d'après le boîtier du schéma
  const expGeom = (typeof pkgGeom === "function" && pkgName) ? pkgGeom(pkgName, nSch) : null;
  const expPitch = expGeom ? expGeom.pitch : null;
  const expSpan = expGeom ? expGeom.span : null;

  const actPitch = fp.pitch != null ? fp.pitch : (expPitch || 1.27);
  const actSpan = fp.span != null ? fp.span : (expSpan || 5.4);

  const anomalies = [];
  const avertissements = [];

  // 1. Distance entre les pins (Pitch)
  let pitchOk = true;
  let pitchMsg = "Pas des broches : " + Number(actPitch).toFixed(2) + " mm";
  if (expPitch != null) {
    const dPitch = Math.abs(actPitch - expPitch);
    if (dPitch > 0.05) {
      pitchOk = false;
      const m = "Distance entre pins (pitch) incorrecte : " + expPitch.toFixed(2) + " mm attendu pour " + (pkgName || "boîtier") + ", mais empreinte PCB réglée à " + Number(actPitch).toFixed(2) + " mm";
      pitchMsg = m;
      anomalies.push(m);
    } else {
      pitchMsg = "Distance entre pins : " + Number(actPitch).toFixed(2) + " mm (Conforme ✓)";
    }
  }

  // 2. Taille du boîtier / Écartement des rangées (Span)
  let spanOk = true;
  let spanMsg = "Taille / Écartement : " + Number(actSpan).toFixed(2) + " mm";
  if (expSpan != null) {
    const dSpan = Math.abs(actSpan - expSpan);
    if (dSpan > 0.35) {
      spanOk = false;
      const m = "Taille / Écartement du boîtier incorrect : " + expSpan.toFixed(2) + " mm attendu pour " + (pkgName || "boîtier") + ", mais empreinte PCB à " + Number(actSpan).toFixed(2) + " mm";
      spanMsg = m;
      anomalies.push(m);
    } else {
      spanMsg = "Taille du boîtier / Écartement : " + Number(actSpan).toFixed(2) + " mm (Conforme ✓)";
    }
  }

  // 3. Nombre de broches / pastilles
  let pinCountOk = true;
  let pinCountMsg = nPcb + " pastilles";
  if (nSch && nPcb && nSch !== nPcb) {
    pinCountOk = false;
    const m = "Nombre de broches incohérent : " + nSch + " broches au schéma vs " + nPcb + " pastilles sur le PCB";
    pinCountMsg = m;
    anomalies.push(m);
  } else {
    pinCountMsg = nPcb + " broches / pastilles (Conforme ✓)";
  }

  // 4. Vérification détaillée pastille par pastille (Brochage & Nets)
  const pinDetails = [];
  const maxP = Math.max(nSch, nPcb);
  let hasCriticalNetConflict = false;

  const isPowerName = s => (typeof crIsPower === "function" ? crIsPower(s) : /(\+?3[V\.]?3V?|\+?5V?0?|\+?12V?|\+?1[V\.]?8V?|\+?2[V\.]?5V?|VCC|VDD|VIN|VOUT|VBUS|VBAT|\+V)/i.test(String(s || "")));
  const isGroundName = s => (typeof crIsGround === "function" ? crIsGround(s) : /^(GND|VSS|0V|AGND|DGND|PGND|VSSA|VSSD|MASSE)/i.test(String(s || "").trim()));

  for (let p = 1; p <= maxP; p++) {
    const pStr = String(p);
    const pinObj = Array.isArray(c.pinout) ? c.pinout.find(x => String(x.number) === pStr) : null;
    const schName = (pinObj && pinObj.name) || (Array.isArray(c.pinNames) && c.pinNames[p - 1]) || "";
    const pcbNet = (fp.nets && fp.nets[p]) || "";

    const isPwr = isPowerName(schName);
    const isGnd = isGroundName(schName);

    const pcbNetIsPwr = isPowerName(pcbNet);
    const pcbNetIsGnd = isGroundName(pcbNet);

    let statut = "ok";
    let detail = "Conforme";

    if (isPwr && pcbNetIsGnd) {
      statut = "critique";
      detail = "Court-circuit évité : broche " + schName + " reliée à la masse (" + pcbNet + ")";
      anomalies.push(ref + "." + p + " (" + schName + ") : reliée à la masse " + pcbNet + " !");
      hasCriticalNetConflict = true;
    } else if (isGnd && pcbNetIsPwr) {
      statut = "critique";
      detail = "Court-circuit évité : broche " + schName + " reliée à l'alimentation (" + pcbNet + ")";
      anomalies.push(ref + "." + p + " (" + schName + ") : reliée à l'alim " + pcbNet + " !");
      hasCriticalNetConflict = true;
    } else if (isGnd && pcbNetIsGnd) {
      statut = "ok";
      detail = "Masse conforme";
    } else if (isPwr && pcbNetIsPwr) {
      statut = "ok";
      detail = "Alimentation conforme";
    } else if (!pcbNet && schName) {
      statut = "info";
      detail = "Non raccordée";
    }

    pinDetails.push({
      pin: p,
      schName: schName,
      pcbNet: pcbNet,
      statut: statut,
      detail: detail
    });
  }

  const conforme = pitchOk && spanOk && pinCountOk && !hasCriticalNetConflict;
  const statutGlobal = conforme ? "CONFORME" : "ANOMALIE";

  let resume = "";
  if (conforme) {
    resume = "Brochage, pas (" + Number(actPitch).toFixed(2) + " mm) et taille (" + Number(actSpan).toFixed(2) + " mm) 100% conformes ✓";
  } else {
    resume = anomalies.join(" · ");
  }

  return {
    ref: ref,
    value: c.value || fp.value,
    pkg: pkgName,
    mpn: c.mpn,
    statut: statutGlobal,
    fpPresent: true,
    conforme: conforme,
    pitchCheck: { ok: pitchOk, pitch: actPitch, attendu: expPitch, msg: pitchMsg },
    spanCheck: { ok: spanOk, span: actSpan, attendu: expSpan, msg: spanMsg },
    pinCountCheck: { ok: pinCountOk, sch: nSch, pcb: nPcb, msg: pinCountMsg },
    anomalies: anomalies,
    avertissements: avertissements,
    resume: resume,
    pins: pinDetails,
    peutReposer: !!(expGeom && (!pitchOk || !spanOk || !pinCountOk))
  };
}

function pcbVerifierPinout(doc) {
  const schMap = pcbComposantsSchema(doc);
  if (typeof S === "undefined" || !Array.isArray(S.fps)) {
    return { conforme: true, nbComposants: 0, nbAnomalies: 0, composants: [], anomalies: [], resume: "Carte vide" };
  }

  const resultats = [];
  const anomaliesGlobales = [];
  const fpsMap = new Map(S.fps.map(f => [f.ref, f]));

  // 1. Vérifier les composants déclarés au schéma
  schMap.forEach(c => {
    const fp = fpsMap.get(c.ref);
    const diag = pcbVerifierPinoutComposant(c, fp);
    if (diag) {
      resultats.push(diag);
      if (!diag.conforme && diag.statut !== "NON_PLACE") {
        anomaliesGlobales.push(...diag.anomalies);
      }
    }
  });

  // 2. Vérifier les empreintes PCB absentes du schéma
  S.fps.forEach(fp => {
    if (!schMap.has(fp.ref)) {
      const diag = pcbVerifierPinoutComposant({ ref: fp.ref, value: fp.value, pkg: fp.pkg }, fp);
      if (diag) {
        resultats.push(diag);
        if (!diag.conforme) {
          anomaliesGlobales.push(...diag.anomalies);
        }
      }
    }
  });

  const allConforme = resultats.length > 0 && resultats.every(r => r.conforme || r.statut === "NON_PLACE");
  const nbAnom = resultats.filter(r => !r.conforme && r.statut !== "NON_PLACE").length;

  let resume = "";
  if (resultats.length === 0) {
    resume = "Aucun composant à vérifier";
  } else if (nbAnom === 0) {
    const c1 = resultats[0];
    resume = resultats.length === 1
      ? (c1.ref + " (" + (c1.pkg || c1.value) + ") : pas, taille du boîtier et pinout 100% conformes ✓")
      : (resultats.length + " composants vérifiés : distances des broches, tailles de boîtiers et pinouts conformes ✓");
  } else {
    resume = nbAnom + " composant(s) avec incohérence de pas, taille ou brochage !";
  }

  return {
    conforme: nbAnom === 0 && resultats.length > 0,
    nbComposants: resultats.length,
    nbAnomalies: nbAnom,
    anomalies: anomaliesGlobales,
    composants: resultats,
    resume: resume
  };
}

function pcbNetComposants(net){
  const schMap=pcbComposantsSchema();
  const sources=[], charges=[], resistances=[], ics=[], autres=[];
  if(!net||typeof S==="undefined"||!Array.isArray(S.fps))
    return {sources, charges, resistances, ics, autres};

  for(const fp of S.fps){
    const c=schMap.get(fp.ref)||{ref:fp.ref, value:fp.value, pkg:fp.pkg, type:"comp"};
    const sp=pcbSpecsComposant(c);
    const padsAll=padsWorld(fp);
    const padsNet=padsAll.filter(q=>q.net===net||(fp.nets&&fp.nets[q.n]===net));
    if(!padsNet.length)continue;

    for(const q of padsNet){
      const pinKey=String(q.n!=null?q.n:"");
      const pinNom=(c.pinNames&&(c.pinNames[pinKey]||c.pinNames[q.n]))||"";
      
      let isSource=false;
      let isCharge=false;
      
      if(sp.estSource){
        if(/^(VOUT|OUT|\+V|3V3|5V|VBUS|VIN_EXT|VDD_EXT|1\b)/i.test(pinNom)||
           c.type==="vcc"||/^(J|CON|BAT|PWR)/i.test(fp.ref)||padsNet.length===1||
           !/^(GND|VSS|0V|ADJ|FB|EN|NC|SHDN)/i.test(pinNom)){
          isSource=true;
        }
      }
      if(!isSource&&sp.estCharge){
        if(/^(VDD|VCC|VBAT|VIN|V\+|AVDD|DVDD)/i.test(pinNom)||
           c.type==="led"||/^(U|IC|MCU|D|LED)/i.test(fp.ref)){
          isCharge=true;
        }
      }
      
      const cu=padLayers(fp,q)[0]||0;
      const baseNom=fp.ref+"."+(q.n!=null?q.n:"?");
      
      if(isSource){
        const nbSrc = Math.max(1, padsNet.length);
        const pinIdx = padsNet.indexOf(q) + 1;
        sources.push({
          fp:fp, pad:q, comp:c, specs:sp, couche:cu,
          role:"source",
          valeur:sp.voltOut||sp.tension||3.3,
          unite:"V",
          provenance:sp.provenance||"catalogue",
          compRef:fp.ref,
          nbBroches:nbSrc,
          nom:baseNom+(pinNom?" ("+pinNom+")":" (Source)")+(nbSrc>1?" ["+pinIdx+"/"+nbSrc+"]":"")
        });
      }else if(isCharge){
        const nbChg = Math.max(1, padsNet.length);
        const pinIdx = padsNet.indexOf(q) + 1;
        const totalI = sp.courant || 0.03;
        const padI = totalI / nbChg;
        charges.push({
          fp:fp, pad:q, comp:c, specs:sp, couche:cu,
          role:"charge",
          valeur:padI,
          unite:padI<0.001?"µA":(padI<1?"mA":"A"),
          provenance:sp.provenance||"catalogue",
          compRef:fp.ref,
          totalCompI:totalI,
          nbBroches:nbChg,
          nom:baseNom+(pinNom?" ("+pinNom+")":(sp.mpn?" ("+sp.mpn+")":""))+(nbChg>1?" ["+pinIdx+"/"+nbChg+"]":"")
        });
      }else if(sp.resistance!=null){
        resistances.push({
          fp:fp, pad:q, comp:c, specs:sp, couche:cu,
          ohms:sp.resistance,
          nom:baseNom
        });
      }else if(sp.estCharge||c.type==="ic"||/^[U]/i.test(fp.ref)){
        ics.push({
          fp:fp, pad:q, comp:c, specs:sp, couche:cu,
          pinNom:pinNom,
          nom:baseNom
        });
      }else{
        autres.push({
          fp:fp, pad:q, comp:c, specs:sp, couche:cu,
          nom:baseNom
        });
      }
    }
  }
  return {sources, charges, resistances, ics, autres};
}

/* Récupère toutes les pastilles d'une empreinte avec leur net associé (nets direct ou piste touchant la pastille) */
function simFpPadsNets(fp){
  if(!fp) return [];
  const isPwr = n => /^(GND|VCC|\+?3V3|\+?5V|\+?1V[0-9]|\+?2V[0-9]|VDD|VSS|VIN|VBAT)$/i.test(n);
  let pads = [];
  let isWorldPads = false;
  if(typeof padsWorld === "function"){
    try { pads = padsWorld(fp) || []; isWorldPads = pads.length > 0; } catch(e){ pads = []; }
  }
  if(!pads.length && typeof padsOf === "function"){
    try { pads = padsOf(fp) || []; } catch(e){ pads = []; }
  }
  if(!pads.length && Array.isArray(fp.pads)){
    pads = fp.pads;
  }

  const out = [];
  for(let i = 0; i < pads.length; i++){
    const q = pads[i];
    const pinNum = q.n != null ? q.n : (i + 1);
    let net = (q && q.net) || "";
    if(!net && fp.nets && typeof fp.nets === "object"){
      net = fp.nets[pinNum] || fp.nets[String(pinNum)] ||
            fp.nets[i + 1] || fp.nets[String(i + 1)] ||
            fp.nets[i] || fp.nets[String(i)] || "";
      if(!net && Array.isArray(fp.nets)){
        net = fp.nets[i] || fp.nets[i + 1] || "";
      }
    }

    const qx = isWorldPads ? (q.x || 0) : ((fp.x || 0) + (q.x || 0));
    const qy = isWorldPads ? (q.y || 0) : ((fp.y || 0) + (q.y || 0));
    const padRadius = Math.max(q.w || 0.8, q.h || 0.8) / 2 + 0.15;

    if(!net && typeof S !== "undefined" && Array.isArray(S.tracks)){
      for(const t of S.tracks){
        if(!t.net || isPwr(t.net)) continue;
        if(typeof segPadDist === "function" && isWorldPads){
          if(segPadDist(t, q) <= 0.05){
            net = t.net;
            break;
          }
        }else if(typeof padDist === "function" && isWorldPads){
          if(padDist(t.x1, t.y1, q) <= 0.05 || padDist(t.x2, t.y2, q) <= 0.05){
            net = t.net;
            break;
          }
        }else{
          const d1 = Math.hypot(t.x1 - qx, t.y1 - qy);
          const d2 = Math.hypot(t.x2 - qx, t.y2 - qy);
          if(d1 <= padRadius || d2 <= padRadius){
            net = t.net;
            break;
          }
          const dx = t.x2 - t.x1, dy = t.y2 - t.y1;
          const l2 = dx*dx + dy*dy;
          if(l2 > 0){
            const u = Math.max(0, Math.min(1, ((qx - t.x1)*dx + (qy - t.y1)*dy) / l2));
            if(Math.hypot(qx - (t.x1 + u*dx), qy - (t.y1 + u*dy)) <= padRadius){
              net = t.net;
              break;
            }
          }
        }
      }
    }

    if(!net && typeof S !== "undefined" && Array.isArray(S.vias)){
      for(const v of S.vias){
        if(!v.net || isPwr(v.net)) continue;
        if(typeof padDist === "function" && isWorldPads){
          if(padDist(v.x, v.y, q) <= 0.05){
            net = v.net;
            break;
          }
        }else{
          if(Math.hypot(v.x - qx, v.y - qy) <= padRadius){
            net = v.net;
            break;
          }
        }
      }
    }

    out.push({ pin: pinNum, pad: q, net: net || "" });
  }

  // Si aucune pastille n'a pu être instanciée géométriquement, extraire directement depuis fp.nets
  if(!out.length && fp.nets && typeof fp.nets === "object"){
    for(const [k, n] of Object.entries(fp.nets)){
      if(n) out.push({ pin: k, pad: null, net: String(n).trim() });
    }
  }

  return out;
}

/* Ensemble des nets d'une empreinte (hors alimentations) */
function simFpNetSet(fp){
  const set = new Set();
  const isPwr = n => /^(GND|VCC|\+?3V3|\+?5V|\+?1V[0-9]|\+?2V[0-9]|VDD|VSS|VIN|VBAT)$/i.test(n);
  if(fp && fp.nets){
    for(const k of Object.keys(fp.nets)){
      const n = fp.nets[k];
      if(n && !isPwr(n)) set.add(n);
    }
  }
  const pn = simFpPadsNets(fp);
  for(const item of pn){
    if(item.net && !isPwr(item.net)) set.add(item.net);
  }
  return set;
}

/* Extrait la valeur et la résistance en ohms d'une empreinte PCB (avec repli schéma) */
function simPcbValeurResistance(fp){
  const rawVal = fp.value || fp.val || fp.spec || (fp.props && (fp.props.VALUE || fp.props.Value)) || "";
  let parsedR = pcbParseResistance(rawVal);
  if(parsedR == null){
    try {
      let sch = null;
      if(typeof sessLire === "function"){
        const s = sessLire("schema");
        sch = (s && s.etat && s.etat.doc) || (s && s.etat);
      }
      if(!sch && typeof pcbSchemaDoc === "function"){
        sch = pcbSchemaDoc();
      }
      if(!sch && typeof localStorage !== "undefined"){
        const raw = localStorage.getItem("cao_schema_backup") || localStorage.getItem("schema_auto");
        if(raw) sch = JSON.parse(raw);
      }
      if(sch && Array.isArray(sch.pages)){
        for(const pg of sch.pages){
          const sc = (pg.comps || []).find(c => c && c.ref === fp.ref);
          if(sc && (sc.value || sc.spec)){
            const sv = pcbParseResistance(sc.value || sc.spec);
            if(sv != null && sv >= 0){ parsedR = sv; break; }
          }
        }
      }
    } catch(e) {}
  }
  return { rawVal: String(rawVal).trim(), parsedR: parsedR };
}

/* Vérifie si l'empreinte PCB correspond à une résistance */
function simEstResistancePcb(ref, val, type){
  if(type && /resistor/i.test(String(type))) return true;
  const r = String(ref || "").trim();
  if(/^(R|RN|RP|RA|RES|RS)[0-9_]/i.test(r)) return true;
  if(/^(R|RN|RP|RA|RES|RS)$/i.test(r)) return true;
  if(/^R[A-Z0-9_-]*$/i.test(r)) return true;
  const v = String(val || "").trim();
  if(/(?:ohm|Ω|\b\d+[rR]\d*\b|\b\d+[kK]\d*\b)/i.test(v)) return true;
  return false;
}

const SIM_PCB={
  outil:"editeur-pcb",

  carte:function(){
    return (typeof fabBase==="function")?fabBase():"carte";
  },

  refCandidats:simRefCandidatsPcb,

  schemaDoc:pcbSchemaDoc,
  schemaComposants:pcbComposantsSchema,

  /* D'OÙ VIENNENT LES COTES DE LA SECTION. Ici, d'un seul endroit : le panneau
     « Empilage physique ». Rien n'est supposé, rien n'est lu dans un fichier
     tiers — il n'y a donc pas de provenance à détailler valeur par valeur comme
     le fait la visionneuse. Le dire sous la section, à côté du h qui vient
     d'être affiché, est le seul endroit où cela sert vraiment. */
  provenance:function(){
    return "Empilage saisi dans « Empilage physique ».";
  },

  /* CE QU'IL Y A AU BOUT DE LA CHAÎNE. Le panneau nomme ses deux ports avec
     ça, et c'est la seule vérification qui se fasse d'un coup d'œil : « port 1
     sur la pastille J1.1 » se contrôle sans quitter la fiche, un couple de
     coordonnées non.

     LA PASTILLE D'ABORD, LE VIA ENSUITE : les deux se superposent souvent —
     un via en pied de pastille — et c'est la pastille qui porte le nom utile.
     `padDist` rend une distance SIGNÉE au bord, négative dedans ; la tolérance
     de deux centièmes rattrape le bout de piste qui s'arrête au ras du cuivre
     plutôt qu'en son centre.

     L'indice `layer` du document désigne une entrée de l'empilage à plat, pas
     un rang de cuivre : c'est l'inverse de `simCuIndex()`. */
  bout:function(pt,obj){
    if(!(pt&&pt.length>=2))return "";
    const cu=Math.floor(((obj&&obj.layer)||0)/2);
    for(const fp of S.fps)
      for(const q of padsWorld(fp))
        if(padLayers(fp,q).indexOf(cu)>=0&&padDist(pt[0],pt[1],q)<=0.02){
          const schMap=typeof pcbComposantsSchema==="function"?pcbComposantsSchema():null;
          const c=schMap&&schMap.get(fp.ref);
          const pinKey=String(q.n!=null?q.n:"");
          const pinNom=c&&c.pinNames&&(c.pinNames[pinKey]||c.pinNames[q.n]);
          const compDesc=c?(" ("+(pinNom||c.mpn||c.value||fp.ref)+")"):"";
          return "la pastille "+(fp.ref||"?")+"."+(q.n==null?"?":q.n)+compDesc;
        }
    for(const v of S.vias)
      if(cu>=Math.min(v.a,v.b)&&cu<=Math.max(v.a,v.b)&&
         Math.hypot(v.x-pt[0],v.y-pt[1])<=Math.max((v.d||0)/2,0.02))
        return "un via";
    return "";
  },

  /* Composants et adaptation pour un net simulé en Impédance */
  schemaInfosNet:function(net){
    if(!net)return null;
    const schM=pcbComposantsSchema();
    const {resistances,ics,sources,charges}=pcbNetComposants(net);
    let rTerm=null, rTermComp=null, rTermRef=null;
    
    if(resistances.length){
      const rSerie=resistances.find(r=>r.ohms>0&&r.ohms<=200);
      if(rSerie){
        rTerm=rSerie.ohms;
        rTermComp=rSerie.comp;
        rTermRef=rSerie.fp.ref;
      }
    }
    const comps=[];
    for(const it of [...sources,...ics,...charges]){
      const label=it.nom||it.fp.ref;
      if(!comps.includes(label))comps.push(label);
    }
    return {
      net:net,
      rTerm:rTerm,
      rTermRef:rTermRef,
      rTermComp:rTermComp,
      composants:comps.slice(0,6)
    };
  },

  /* Amplitude agresseur et marge récepteur pour Crosstalk */
  schemaInfosCrosstalk:function(aggrNet){
    let net=aggrNet;
    if(!net&&S.sel&&S.sel.tracks&&S.sel.tracks.size){
      const tr=[...S.sel.tracks][0];
      if(tr&&tr.net)net=tr.net;
    }
    const schM=pcbComposantsSchema();
    let swing=3.3, driverName="Défaut 3.3V", marge=400;
    
    if(net){
      const {sources,charges,ics}=pcbNetComposants(net);
      const candidates=[...ics,...charges,...sources];
      for(const cand of candidates){
        const sp=cand.specs;
        if(sp&&(sp.tension>0||sp.voltIn>0||sp.voltOut>0)){
          const v=sp.voltOut||sp.tension||sp.voltIn;
          if(v>=0.8&&v<=15){
            swing=v;
            driverName=(cand.comp.ref||"?")+(sp.mpn?" ("+sp.mpn+")":(sp.value?" ("+sp.value+")":""));
            if(swing<=1.9)marge=250;
            else if(swing<=2.7)marge=300;
            else if(swing<=3.6)marge=400;
            else marge=400;
            break;
          }
        }
      }
    }
    return {swing:swing, driver:driverName, marge:marge};
  },

  /* Terminaison différentielle entre les deux nets d'une paire */
  schemaInfosDiff:function(netA, netB){
    let nA=netA, nB=netB;
    if(!nA||!nB){
      if(typeof dpOfNet==="function"&&typeof S!=="undefined"&&S.sel&&S.sel.tracks&&S.sel.tracks.size){
        const tr=[...S.sel.tracks][0];
        const dp=tr&&dpOfNet(tr.net);
        if(dp){nA=dp.netA; nB=dp.netB;}
      }
    }
    if(!nA||!nB)return null;
    const schM=pcbComposantsSchema();
    for(const fp of S.fps){
      const pads=padsWorld(fp);
      const hasA=pads.some(q=>q.net===nA||(fp.nets&&fp.nets[q.n]===nA));
      const hasB=pads.some(q=>q.net===nB||(fp.nets&&fp.nets[q.n]===nB));
      if(hasA&&hasB){
        const c=schM.get(fp.ref)||{ref:fp.ref, value:fp.value, type:"resistor"};
        const sp=pcbSpecsComposant(c);
        if(sp.resistance!=null&&sp.resistance>0){
          return {rTerm:sp.resistance, ref:fp.ref, mpn:sp.mpn, comp:c};
        }
      }
    }
    return null;
  },

  /* Le problème complet, tiré de la sélection. Les refus sont explicites et
     disent quoi faire : un panneau qui répond « erreur » laisse chercher. */
  probleme:function(opts){
    /* LA SÉLECTION ENTIÈRE, EN UN SEUL DOCUMENT. C'est ce que lit l'export
       .json quand aucun lot n'a été calculé, et ce sur quoi retombe un panneau
       qui ne connaîtrait pas les lots. */
    return simDocPcb(null,opts);
  },

  /* LES LOTS : un document par parcours continu de la sélection.

     UN SEUL PARCOURS REND UN SEUL LOT, par le chemin exact d'avant — c'est le
     cas de tous les gestes ordinaires : un clic, un Maj+clic sur la piste
     entière, un second Maj+clic qui l'étend aux autres couches. Ce sont les
     morceaux QUI NE SE TOUCHENT PAS qu'on sépare, et jusqu'ici ils partaient
     ensemble pour se faire refuser la cascade. */
  problemes:function(opts){
    if(!S.sel.tracks.size)
      return {erreur:"Aucune piste sélectionnée.",
              conseil:S.tracks.length
                ? ((typeof SIM!=="undefined"&&(SIM.analyse==="diff"||SIM.analyse==="zdiff"))
                    ? "Double-clic gauche sur la 1ère piste\n"+
                      "→ toute la piste sur la couche est sélectionnée.\n"+
                      "Maintenez Ctrl et faites un double-clic gauche (ou un simple clic gauche avec Ctrl) sur la 2ème piste\n"+
                      "→ toute la 2ème piste s'ajoute à la sélection."
                    : "Double-clic gauche sur une piste : toute la piste sur la couche est sélectionnée.\n"+
                      "Ctrl+clic ajoute un morceau à la sélection, Maj+clic prend le net entier.")
                : "Cette carte n'a pas encore de piste routée."};
    const sel=[...S.sel.tracks].filter(t=>trkLen(t)>0);
    if(!sel.length)
      return {erreur:"La sélection ne porte aucun tronçon exploitable."};
    const lots=simLotsDeTracks(sel);
    if(lots.length<2){
      const p=simDocPcb(null,opts);
      return p.erreur?p:{lots:[p]};
    }
    /* TROP DE MORCEAUX : ON N'INONDE PAS LE SERVEUR, ET ON LE DIT. Seize lots
       sont déjà seize allers-retours ; au-delà — un Ctrl+A, une sélection au
       lasso sur une carte entière — on n'a plus une comparaison mais une
       attente. Le repli est le comportement d'avant : un seul document, juste
       pour les impédances par tronçon, refusé à la cascade par le serveur. */
    if(lots.length>SIM_LOTS_MAX){
      const p=simDocPcb(null,opts);
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
      const p=simDocPcb(l,opts);
      if(p.erreur){refuses.push(p.erreur);continue;}
      out.push(p);
    }
    if(!out.length)
      return {erreur:refuses[0]||
                     "Aucun morceau de la sélection n'est calculable."};
    /* AUCUN REFUS SILENCIEUX : un morceau écarté se lirait comme un oubli si
       personne ne le nommait. */
    for(const r of refuses)
      out[0].notes.push("Un morceau de la sélection a été écarté : "+r);
    return {lots:out};
  },

  /* ==========================================================================
     LE PROBLÈME DE CROSSTALK
     --------------------------------------------------------------------------
     UN SEUL DOCUMENT, JAMAIS DE LOTS, et ce n'est pas une simplification : la
     carte a UN axe de position, celui du parcours de l'agresseur. Découper la
     sélection en morceaux qui ne se touchent pas donnerait plusieurs axes sans
     origine commune, et deux victimes ne se compareraient plus. Une sélection
     éparse est donc envoyée telle quelle, dans l'ordre du chaînage — le même
     que la simulation —, et le serveur en fait un parcours continu.

     L'AGRESSEUR EST LA SÉLECTION, et il peut porter PLUSIEURS nets : le serveur
     prend celui qui porte le plus de cuivre comme référence de l'axe et range
     les autres en agresseurs supplémentaires, avec leurs deux ports. Rien
     n'est codé en dur sur leur nombre — c'est ce que demandait le cahier des
     charges, et c'est aussi ce qui rend l'option « sommer les agresseurs »
     utilisable.
     ========================================================================== */
  problemeCrosstalk:function(opts){
    const base=simDocPcb(null,opts);
    if(base.erreur)return base;
    const sel=[...S.sel.tracks];
    const refs=simRefSet();
    const g=simSegments(null);
    const par=simXtParcours(g);
    if(!(par.total>0))
      return {erreur:"La sélection ne porte aucune longueur exploitable."};

    const nets=[...new Set(sel.map(t=>t.net).filter(Boolean))];
    if(!nets.length)
      return {erreur:"La piste sélectionnée n'a pas de net.",
              conseil:"Le crosstalk se lit d'un net vers un autre : "+
                      "l'agresseur doit porter un nom de net."};

    const doc=base.doc;
    doc.agresseurs=nets;
    /* LE VOISINAGE EST REPRIS AVEC LES COUCHES ADJACENTES : c'est la seule
       différence de géométrie avec le document de simulation, et elle compte —
       deux pistes superposées sont le cas que la section droite ne sait pas
       décrire, donc celui qu'on écartait sans un mot. */
    doc.voisinage=simVoisinagePcb(null,true);
    doc.couture={positions:simXtCouture(par,refs), couloir:SIM_COULOIR};
    /* `fentes` À `null` VEUT DIRE « ON N'A PAS PU REGARDER », et le champ est
       alors ABSENT du document. Une liste vide dirait « rien à signaler », ce
       qui est le contraire — et c'est exactement le genre de silence qui rend
       un outil de mesure nuisible. */
    const fentes=simXtFentes(par,refs);
    if(fentes)doc.fentes=fentes;
    doc.vias_masse=simXtViasMasse(par,refs);

    const notes=(base.notes||[]).slice();
    if(!refs.size)
      notes.push("Aucun net de masse retenu : ni la couture, ni les "+
                 "discontinuités du plan, ni les vias de retour ne peuvent "+
                 "être examinés. Choisissez la masse dans la barre du "+
                 "panneau — sans elle, l'absence de zone de vigilance sur la "+
                 "carte ne veut rien dire.");
    else if(!fentes)
      notes.push("Le plan de référence n'a pas pu être sondé : la ou les "+
                 "couches de plan ne portent aucune zone de cuivre dans cet "+
                 "éditeur. Les fentes ne sont donc pas cherchées, et le "+
                 "résultat le dira plutôt que d'annoncer qu'il n'y en a pas.");
    if(nets.length>1)
      notes.push("La sélection porte "+nets.length+" nets : le plus long "+
                 "donne l'axe de la carte, les autres deviennent des "+
                 "agresseurs supplémentaires. L'option « sommer les "+
                 "agresseurs » les additionne en phase vers chaque victime.");
    return {doc:doc, objets:g.objets, portee:simPortee(g.objets,null),
            notes:notes};
  },

  /* Les deux formes dont la surimpression des zones à risque a besoin. Voir
     « LES ZONES À RISQUE SUR LE CUIVRE », plus haut. */
  xtGeometrie:simXtGeometriePcb,


  /* ---------------------------------------------------------------------
     LA CHUTE CONTINUE
     --------------------------------------------------------------------- */

  /* Importer automatiquement les sources et charges depuis les composants du schéma */
  dcImporterSchema:function(netChoisi){
    if(typeof pcbSchemaDoc==="function")pcbSchemaDoc();
    let net=netChoisi;
    if(!net&&S.sel&&S.sel.tracks&&S.sel.tracks.size){
      const t=[...S.sel.tracks][0];
      if(t&&t.net)net=t.net;
    }
    if(!net&&S.hlNet)net=S.hlNet;
    if(!net&&SIM_DCB.bornes.length)net=SIM_DCB.bornes[0].net;
    if(!net&&S.tracks&&S.tracks.length){
      const powerNets=new Map();
      for(const t of S.tracks){
        if(t.net&&/(\+?3\.?3v|\+?5v|vcc|vdd|vbat|vbus|\+?12v|\+?1\.?8v)/i.test(t.net)){
          powerNets.set(t.net,(powerNets.get(t.net)||0)+1);
        }
      }
      if(powerNets.size){
        net=[...powerNets.entries()].sort((a,b)=>b[1]-a[1])[0][0];
      }
    }
    if(!net&&S.fps&&S.fps.length){
      const schM=pcbComposantsSchema();
      for(const fp of S.fps){
        const c=schM.get(fp.ref);
        if(c&&(c.type==="regulator"||c.type==="vcc"||/^(VR|REG)/i.test(c.ref))){
          for(const q of padsWorld(fp)){
            if(q.net&&!/gnd|0v|vss/i.test(q.net)){net=q.net;break;}
          }
        }
        if(net)break;
      }
    }
    if(!net){
      return {erreur:"Aucun net d'alimentation sélectionné ou détecté. "+
                     "Cliquez une piste ou pastille du rail d'alimentation à analyser."};
    }
    const {sources,charges}=pcbNetComposants(net);
    if(!sources.length&&!charges.length){
      return {erreur:"Aucun composant (source ou charge) trouvé sur le net "+net+" dans le schéma."};
    }
    
    const prevBornes = SIM_DCB.bornes.slice();
    SIM_DCB.bornes=[];
    for(const s of sources){
      const exist = prevBornes.find(b=>Math.abs(b.x-s.pad.x)<1e-6&&Math.abs(b.y-s.pad.y)<1e-6&&b.couche===s.couche);
      if(exist && exist.provenance === "manuel"){
        SIM_DCB.bornes.push(exist);
      } else {
        SIM_DCB.bornes.push({
          nom: (exist && exist.renomme) ? exist.nom : s.nom,
          renomme: !!(exist && exist.renomme),
          x: s.pad.x, y: s.pad.y,
          couche: s.couche,
          net: net,
          w: s.pad.w, h: s.pad.h, shape: s.pad.shape, rot: s.pad.rot,
          couches: padLayers(s.fp,s.pad).slice(),
          role: "source",
          valeur: s.valeur,
          unite: s.unite||"V",
          provenance: s.provenance||"catalogue",
          compRef: s.compRef||(s.comp?s.comp.ref:""),
          nbBroches: s.nbBroches||1
        });
      }
    }
    for(const c of charges){
      const exist = prevBornes.find(b=>Math.abs(b.x-c.pad.x)<1e-6&&Math.abs(b.y-c.pad.y)<1e-6&&b.couche===c.couche);
      if(exist && exist.provenance === "manuel"){
        SIM_DCB.bornes.push(exist);
      } else {
        SIM_DCB.bornes.push({
          nom: (exist && exist.renomme) ? exist.nom : c.nom,
          renomme: !!(exist && exist.renomme),
          x: c.pad.x, y: c.pad.y,
          couche: c.couche,
          net: net,
          w: c.pad.w, h: c.pad.h, shape: c.pad.shape, rot: c.pad.rot,
          couches: padLayers(c.fp,c.pad).slice(),
          role: "charge",
          valeur: c.valeur,
          unite: c.unite||"A",
          provenance: c.provenance||"catalogue",
          compRef: c.compRef||(c.comp?c.comp.ref:""),
          totalCompI: c.totalCompI,
          nbBroches: c.nbBroches||1
        });
      }
    }
    const totI=charges.reduce((acc,c)=>acc+c.valeur,0);
    const totTxt=totI<0.001?simNb(totI*1e6,1)+" µA":(totI<1?simNb(totI*1e3,1)+" mA":simNb(totI,2)+" A");
    return {
      ok:true, net:net,
      nSources:sources.length, nCharges:charges.length,
      totalCourant:totI,
      message:"⚡ Net "+net+" : "+sources.length+" source(s) et "+
              charges.length+" charge(s) importées ("+totTxt+" total)."
    };
  },

  /* Les bornes telles que la carte les porte, dans l'ordre où on les a
     posées. Le panneau les affiche et n'en garde pas de copie : une pastille
     effacée entre deux calculs doit disparaître du panneau, pas y rester
     comme un souvenir. */
  dcBornes:function(){
    SIM_DCB.bornes=SIM_DCB.bornes.filter(b=>{
      for(const fp of S.fps)
        for(const q of padsWorld(fp))
          if(Math.abs(q.x-b.x)<1e-6&&Math.abs(q.y-b.y)<1e-6)return true;
      return false;                      // la pastille n'est plus là
    });
    return SIM_DCB.bornes;
  },

  /* Armer la désignation. Le clic suivant sur la carte choisit la pastille. */
  dcChoisir:function(role){
    SIM_DCB.attente=(role==="charge")?"charge":"source";
    if(typeof setMode==="function")setMode("select");
    if(typeof hint==="function")
      hint("Cliquez la pastille "+
           (SIM_DCB.attente==="source"
              ? "de la SOURCE — l'alimentation, dont on impose la tension"
              : "de la CHARGE — le consommateur, dont on impose le courant")+".");
    return true;
  },

  /* La valeur d'une borne : des ampères pour une source, des volts pour une
     référence. Le panneau la pose, l'adaptateur la garde avec la pastille. */
  dcValeur:function(k,v){
    const b=SIM_DCB.bornes[k];
    if(b){
      b.valeur=(+v)||0;
      b.provenance="manuel";
    }
  },

  dcOublier:function(k){
    if(k==null)SIM_DCB.bornes=[];
    else SIM_DCB.bornes.splice(k,1);
    SIM_DCB.attente=null;
  },

  /* Le problème résistif complet, tiré des deux bornes.

     LES REFUS SONT EXPLICITES ET DISENT QUOI FAIRE. Un panneau qui répond
     « erreur » laisse chercher ; ici chaque refus nomme ce qui manque et le
     geste qui le comble. */
  cuivreDC:function(){
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
              conseil:"La chute se calcule le long d'un net : reliez ces "+
                      "pastilles, ou retirez-les des bornes."};
    const nets=[...new Set(B.map(b=>b.net))];
    if(nets.length>1)
      return {erreur:"Les bornes ne sont pas toutes sur le même net ("+
                     nets.join(", ")+").",
              conseil:"Le courant ne passe pas d'un net à l'autre : "+
                      "n'en gardez qu'un."};

    const net=nets[0];
    const polygones=[], vias=[];

    /* LE CUIVRE DU NET, sur toutes ses couches. */
    for(const t of S.tracks){
      if(t.net!==net)continue;
      for(const pts of simDCPolysPiste(t))
        polygones.push({vertices:pts, couche:t.l, net:net,
                        epaisseur:cuT(t.l)});
    }
    for(const z of S.zones){
      if(z.net!==net||!z.pts||z.pts.length<3)continue;
      polygones.push({vertices:z.pts.map(q=>[q.x,q.y]), couche:z.l, net:net,
                      epaisseur:cuT(z.l)});
    }
    for(const fp of S.fps)
      for(const q of padsWorld(fp)){
        if(q.net!==net)continue;
        const pts=simDCPolyPastille(q);
        for(const cu of padLayers(fp,q))
          polygones.push({vertices:pts, couche:cu, net:net,
                          epaisseur:cuT(cu)});
      }
    /* LES DÉCOUPES EN DERNIER, et en `trou` : elles retirent du cuivre. Une
       découpe ne porte pas de net — elle évide ce qu'elle recouvre —, donc on
       prend celles de la couche, quel que soit le net dessous. */
    for(const ct of S.cuts){
      if(!ct.pts||ct.pts.length<3)continue;
      polygones.push({vertices:ct.pts.map(q=>[q.x,q.y]), couche:ct.l,
                      net:net, epaisseur:cuT(ct.l), trou:true});
    }

    if(!polygones.length)
      return {erreur:"Le net "+net+" ne porte aucun cuivre.",
              conseil:"Routez-le avant d'en calculer la chute."};

    /* CE QUI FAIT CHANGER DE COUCHE, et c'est DEUX choses, pas une.

       Les VIAS, évidemment. Mais aussi le PERÇAGE MÉTALLISÉ D'UNE PASTILLE
       TRAVERSANTE : son tube est un conducteur au même titre, et c'est lui
       qui relie l'anneau de cuivre que la pastille pose sur chaque couche.
       L'oublier laissait ces anneaux flottants, et le solveur refusait tout
       le calcul plutôt que de rendre un chiffre sur un cuivre en morceaux. */
    let n=0, orphelins=0;
    for(const v of S.vias){
      if(v.net!==net){
        /* UN VIA DE COUTURE SANS NET NE RELIE RIEN, ET LE SILENCE COÛTAIT LE
           CALCUL ENTIER. C'est le cas ordinaire d'un plan cousu à un autre
           plan : on pose les vias en mode « via », sans net actif, et ils
           ressortent avec un net vide. Ce filtre les écartait sans un mot, le
           cuivre de la couche d'arrivée devenait flottant, et le solveur
           refusait tout en parlant de « nœuds qui n'atteignent aucune
           référence » — un message juste, dont la CAUSE était ailleurs.

           On ne les monte pas pour autant : un via sans net relierait le
           premier cuivre venu, celui d'un autre net compris, et un
           court-circuit inventé est pire qu'un chemin manquant. On les
           COMPTE, et seulement ceux qui auraient effectivement joint deux
           couches de ce net-là. */
        if(!v.net&&
           simDCCouchesTouchees(v.x,v.y,v.a,v.b,polygones).length>=2)
          orphelins++;
        continue;
      }
      n++;
      /* LE PERÇAGE D'UN VIA EST UNE COTE DE L'ÉDITEUR quand il est là. À
         défaut — un via importé sans perçage —, on le déduit de la pastille,
         et c'est un repli : il est marqué comme tel. */
      simDCTube(v.x, v.y, v.a, v.b,
                v.drill||Math.max((v.d||0.8)-0.1,0.1),
                net, "V"+n, polygones, vias, !(v.drill>0));
    }
    for(const fp of S.fps)
      for(const q of padsWorld(fp)){
        if(q.net!==net||!(q.drill>0))continue;
        const cs=padLayers(fp,q);
        if(cs.length<2)continue;
        simDCTube(q.x, q.y, cs[0], cs[cs.length-1], q.drill, net,
                  (fp.ref||"?")+"."+(q.n==null?"?":q.n), polygones, vias);
      }

    /* LA BORNE, EN BOÎTE ET NON EN POINT. Une pastille couvre plusieurs
       carreaux ; l'injecter en un point ferait entrer tout l'ampérage par un
       seul nœud et créerait une constriction qui n'existe pas sur la carte. */
    const boite=b=>{
      const r=Math.max(b.w||0,b.h||0)/2;
      return [b.x-r, b.y-r, b.x+r, b.y+r];
    };
    /* LA TRADUCTION, et c'est le seul endroit qui la fait.
       `sources` est la liste NEUMANN du solveur — les courants imposés —, donc
       elle porte les CHARGES, et leur courant est NÉGATIF : il sort du cuivre.
       `references` est la liste DIRICHLET — les potentiels imposés —, donc
       elle porte les SOURCES. Les noms du document sont ceux du solveur ; ceux
       du panneau sont ceux du schéma. */
    return {
      polygones:polygones,
      vias:vias,
      sources:charges.map(b=>({couche:b.couche, net:net,
                               courant:-Math.abs((+b.valeur)||0),
                               boite:boite(b), repere:b.nom})),
      references:alims.map(b=>({couche:b.couche, net:net,
                                tension:(+b.valeur)||0, boite:boite(b),
                                repere:b.nom})),
      net:net,
      /* QUELLES COUCHES SONT A L'AIR LIBRE. IPC-2221 leur donne le double du
         coefficient d'une interne, et un coefficient double rend une
         température presque CINQ FOIS plus basse (2^(1/0,44) = 4,83). Se
         tromper là-dessus ne se rattrape pas : l'éditeur connaît son
         empilage, il le dit. La première et la dernière couche de cuivre,
         par définition. */
      couches_externes:[0, S.cu-1],
      /* CE QUE LA CARTE EMPORTE DE CHALEUR. Voir `simDCThermique` dans
         `../commun/simulation-em.js` : le solveur résout l'étalement dans le
         stratifié, et ces trois cotes sont les seules qu'il ne peut pas
         deviner. L'éditeur les a toutes — c'est LUI qui dessine l'empilage. */
      thermique:simDCThermiquePcb(),
      /* CE QUE L'OUTIL SAIT ET QUE LE SERVEUR NE PEUT PAS DEVINER. La fiche
         les affiche ; les taire laissait un refus du solveur sans sa cause. */
      notes:(orphelins
        ? [orphelins+" via(s) posé(s) sur ce cuivre n'ont PAS de net : ils "+
           "joindraient deux couches du net "+net+", et ils sont écartés du "+
           "calcul. Assignez-leur le net — un via sans net relierait le "+
           "premier cuivre venu, et un court-circuit inventé serait pire "+
           "qu'un chemin manquant."]
        : []),
      bornes:B.map(b=>b.nom)
    };
  },

  /* LA COUCHE QUE CET OUTIL PROPOSE DE PEINDRE : la couche ACTIVE, celle
     qu'on route. La fiche peut en choisir une autre — voir
     `simDCCouchePeinte` dans `../commun/simulation-em.js` —, et c'est tout
     l'intérêt : la couche active n'est pas toujours celle où ça chauffe. */
  dcCoucheProposee:function(){return S.active;},
  dcNomCouche:function(rang){
    const L=S.cuL&&S.cuL[rang];
    return (L&&L.name)?L.name:"";
  },

  /* Le canevas hors écran de la carte de potentiel. C'est l'outil qui le
     fabrique : le module commun ne connaît pas le DOM sous lequel il tourne,
     et un banc d'essai peut n'en avoir aucun — l'absence doit alors se
     traduire par « on ne peint pas », pas par une pile d'appels. */
  canevasHorsEcran:function(w,h){
    try{
      const o=document.createElement("canvas");
      o.width=w; o.height=h;
      return (o.getContext&&o.getContext("2d"))?o:null;
    }catch(_){return null;}
  },

  /* La carte est déjà construite par le module commun ; il ne reste qu'à
     redemander un tracé. La méthode existe pour que le panneau sache que cet
     outil PEINT — un outil qui ne la déclare pas n'aura pas de carte. */
  peindreDC:function(){
    if(typeof draw==="function")draw();
  },

  redessiner:function(){
    if(typeof draw==="function")draw();
  },
  centrerSurVia:function(x_mm,y_mm){
    if(typeof S!=="undefined"&&typeof W!=="undefined"&&typeof H!=="undefined"){
      S.ox=W/2-(typeof mirX==="function"?mirX(x_mm):x_mm)*S.scale;
      S.oy=H/2-y_mm*S.scale;
      if(typeof draw==="function")draw();
    }
  },
  /* Extraction physique du temps de vol pour l'analyse de bus synchrone (supporte les XNets / nets composés "NET1 + NET2") */
  busNetFlight:function(netName){
    if(!netName) return {net:"", len:0, tflight:0, psmm:6.7, capPf:0, trksCount:0, viasCount:0};
    const cleanStr = String(netName).replace(/\s*\([^)]*\)/g, "");
    const parts = cleanStr.split(/[\+,]/).map(s=>s.trim()).filter(Boolean);
    let totalLen = 0, totalTflightPs = 0, totalCapPf = 0, totalTrks = 0, totalVias = 0;

    for(const partNet of parts){
      let trks=[], vs=[];
      if(typeof netTracks==="function"){
        const g=netTracks(partNet);
        trks=g.tracks||[];
        vs=g.vias||[];
      }else if(typeof S!=="undefined"){
        trks=(S.tracks||[]).filter(t=>t.net===partNet);
        vs=(S.vias||[]).filter(v=>v.net===partNet);
      }
      const lt=(typeof ltLine==="function")?ltLine(trks,vs):{len:0,tpdAll:0,c:0,psmm:6.7};
      const len=(typeof r3==="function")?r3(lt.len||0):Math.round((lt.len||0)*1000)/1000;
      const tflightPs=(typeof r1==="function")?r1((lt.tpdAll||0)*1e12):Math.round(((lt.tpdAll||0)*1e12)*10)/10;
      const capPf=Math.round(((lt.c||0)+((lt.vias&&lt.vias.cap)||0))*1e12*100)/100;
      totalLen += len;
      totalTflightPs += tflightPs;
      totalCapPf += capPf;
      totalTrks += trks.length;
      totalVias += vs.length;
    }
    const len=Math.round(totalLen*1000)/1000;
    const tflight=Math.round(totalTflightPs*10)/10;
    const psmm=(len>0&&tflight>0)?Math.round((tflight/len)*100)/100:6.7;
    const capPf=Math.round(totalCapPf*100)/100;

    // Détection d'une résistance série et calcul du retard RC induit
    let rOhms = 0, rComp = "", rcDelayPs = 0;
    const rMatch = String(netName).match(/\(([^)]+)\)/);
    if(rMatch){
      const raw = rMatch[1].trim();
      const tokens = raw.split(/\s+/);
      if(tokens.length > 1){
        rComp = tokens[0] || "";
        const valStr = tokens.slice(1).join(" ");
        const valMatch = valStr.match(/([0-9]+(?:\.[0-9]+)?)/);
        if(valMatch){
          let valNum = parseFloat(valMatch[1]);
          if(/k/i.test(valStr)) valNum *= 1000;
          rOhms = valNum;
        }
      }else if(tokens.length === 1){
        const vMatch = tokens[0].match(/([0-9]+(?:\.[0-9]+)?)/);
        if(/^[A-Za-z]+/.test(tokens[0]) && !/[ΩR]/i.test(tokens[0])){
          rComp = tokens[0];
          rOhms = 22;
        }else if(vMatch){
          rOhms = parseFloat(vMatch[1]);
        }
      }
      if(rOhms > 0 && parts.length > 1){
        let capAvalPf = 2.5; // Capacité d'entrée récepteur typique (pF)
        for(let pi = 1; pi < parts.length; pi++){
          let trks=[], vs=[];
          if(typeof netTracks==="function"){
            const g=netTracks(parts[pi]);
            trks=g.tracks||[]; vs=g.vias||[];
          }else if(typeof S!=="undefined"){
            trks=(S.tracks||[]).filter(t=>t.net===parts[pi]);
            vs=(S.vias||[]).filter(v=>v.net===parts[pi]);
          }
          const lt=(typeof ltLine==="function")?ltLine(trks,vs):{c:0};
          capAvalPf += ((lt.c||0)+((lt.vias&&lt.vias.cap)||0))*1e12;
        }
        rcDelayPs = Math.round(0.693 * rOhms * capAvalPf * 10) / 10;
      }
    }

    return {
      net:netName,
      len:len,
      tflight:tflight,
      tflightTotal:Math.round((tflight+rcDelayPs)*10)/10,
      rcDelayPs:rcDelayPs,
      rOhms:rOhms,
      rComp:rComp,
      psmm:psmm,
      capPf:capPf,
      trksCount:totalTrks,
      viasCount:totalVias
    };
  },

  trouverPontSerie:function(netName){
    if(typeof S==="undefined"||!Array.isArray(S.fps)||!netName) return null;
    const cleanTarget = String(netName).replace(/\s*\([^)]*\)/g, "").split(/[\+,]/)[0].trim();
    if(!cleanTarget) return null;
    const cleanTargetUpper = cleanTarget.toUpperCase();
    const isPwr=n=>/^(GND|VCC|\+?3V3|\+?5V|\+?1V[0-9]|\+?2V[0-9]|VDD|VSS|VIN|VBAT)$/i.test(n);
    const isPassiveRef=r=>/^(R|RN|RP|RA|RES|RS|L|FB|C)/i.test(r||"");

    let fallback=null;
    for(const fp of S.fps){
      if(!fp) continue;
      const ref = fp.ref || ("U" + fp.id);
      const pn = simFpPadsNets(fp);
      const allNets = [...new Set(pn.map(p=>p.net).filter(n=>n&&!isPwr(n)))];
      if(!allNets.some(n=>n.trim().toUpperCase() === cleanTargetUpper)) continue;

      let aval = null;
      if(allNets.length === 2){
        const other = allNets.find(n=>n.trim().toUpperCase() !== cleanTargetUpper);
        if(other) aval = other;
      }else if(allNets.length > 2){
        // Réseau de résistances ou multi-pins : apparier la broche associée
        const targetPinObj = pn.find(p=>p.net && p.net.trim().toUpperCase() === cleanTargetUpper);
        if(targetPinObj){
          const pNum = parseInt(targetPinObj.pin, 10);
          if(!isNaN(pNum)){
            const pinNums = pn.map(p => parseInt(p.pin, 10)).filter(n => !isNaN(n));
            const maxPin = pinNums.length ? Math.max(...pinNums) : 8;
            const nTotal = Math.max(pn.length, maxPin);
            const oppPin = String(nTotal + 1 - pNum);
            const consPin = String(pNum % 2 === 1 ? pNum + 1 : pNum - 1);
            let paired = pn.find(p => String(p.pin) === oppPin);
            if(!paired) paired = pn.find(p => String(p.pin) === consPin);
            if(paired && paired.net && paired.net.trim().toUpperCase() !== cleanTargetUpper){
              aval = paired.net;
            }
          }
        }
        if(!aval){
          const other = allNets.find(n=>n.trim().toUpperCase() !== cleanTargetUpper);
          if(other) aval = other;
        }
      }

      if(aval && aval.trim().toUpperCase() !== cleanTargetUpper){
        const { rawVal, parsedR } = simPcbValeurResistance(fp);
        const rOhms = (parsedR != null && parsedR >= 0) ? parsedR : 22;
        const cleanVal = (parsedR != null && parsedR >= 0) ? (rOhms + "Ω") : (rawVal || (rOhms + "Ω"));
        const valSuffix = " " + (rOhms >= 0 ? (rOhms + "Ω") : cleanVal);
        const bridge = {
          comp: ref || "R",
          val: cleanVal,
          rOhms: rOhms,
          netAmont: cleanTarget,
          netAval: aval,
          annotation: (ref || "R") + valSuffix,
          label: cleanTarget + " + " + aval + " (" + (ref || "R") + valSuffix + ")"
        };
        if(simEstResistancePcb(ref, rawVal, fp.type) || parsedR != null){
          return bridge;
        }
        if(isPassiveRef(ref) && !fallback){
          fallback = bridge;
        }
      }
    }
    return fallback;
  },

  listeComposants:function(){
    if(typeof S==="undefined"||!Array.isArray(S.fps)) return [];
    return S.fps.map(fp=>({
      ref: fp.ref||("U"+fp.id),
      val: fp.value||fp.pkg||"",
      pkg: fp.pkg||""
    })).sort((a,b)=>a.ref.localeCompare(b.ref, undefined, {numeric:true}));
  },

  netsEntreComposants:function(ref1, ref2){
    if(typeof S==="undefined"||!Array.isArray(S.fps)||!ref1||!ref2) return [];
    const fp1=S.fps.find(f=>(f.ref===ref1||("U"+f.id)===ref1));
    const fp2=S.fps.find(f=>(f.ref===ref2||("U"+f.id)===ref2));
    if(!fp1||!fp2) return [];
    const isPwr=n=>/^(GND|VCC|\+?3V3|\+?5V|\+?1V[0-9]|\+?2V[0-9]|VDD|VSS|VIN|VBAT)$/i.test(n);
    const s1=simFpNetSet(fp1), s2=simFpNetSet(fp2);
    const common=[];

    // 1. Nets directement communs
    for(const n of s1){
      if(s2.has(n)&&!isPwr(n)){
        common.push(n);
      }
    }

    // 2. Nets chaînés via un composant passif série
    for(const fp of S.fps){
      if(fp===fp1||fp===fp2) continue;
      const ref = fp.ref || ("U" + fp.id);
      const pn = simFpPadsNets(fp);
      const fNets=[...new Set(pn.map(p=>p.net).filter(n=>n&&!isPwr(n)))];
      if(fNets.length >= 2){
        const { rawVal, parsedR } = simPcbValeurResistance(fp);
        const rOhms = (parsedR != null && parsedR >= 0) ? parsedR : 22;
        const cleanVal = (parsedR != null && parsedR >= 0) ? (rOhms + "Ω") : (rawVal || (rOhms + "Ω"));
        const valSuffix = " " + (rOhms >= 0 ? (rOhms + "Ω") : cleanVal);

        if(fNets.length === 2){
          const [nA, nB] = fNets;
          if(nA !== nB){
            if(s1.has(nA) && s2.has(nB)){
              common.push(nA + " + " + nB + " (" + (ref || "R") + valSuffix + ")");
            }else if(s1.has(nB) && s2.has(nA)){
              common.push(nB + " + " + nA + " (" + (ref || "R") + valSuffix + ")");
            }
          }
        }else{
          for(const nA of fNets){
            if(s1.has(nA)){
              for(const nB of fNets){
                if(nA !== nB && s2.has(nB)){
                  const label = nA + " + " + nB + " (" + (ref || "R") + valSuffix + ")";
                  if(!common.includes(label)) common.push(label);
                }
              }
            }
          }
        }
      }
    }

    return common.sort((a,b)=>a.localeCompare(b, undefined, {numeric:true}));
  },

  listeLiaisonsSeries:function(){
    if(typeof S==="undefined"||!Array.isArray(S.fps)) return [];
    const isPwr=n=>/^(GND|VCC|\+?3V3|\+?5V|\+?1V[0-9]|\+?2V[0-9]|VDD|VSS|VIN|VBAT)$/i.test(n);
    const bridges=[];
    for(const fp of S.fps){
      const ref = fp.ref || ("U" + fp.id);
      const pn = simFpPadsNets(fp);
      const fNets=[...new Set(pn.map(p=>p.net).filter(n=>n&&!isPwr(n)))];
      if(fNets.length >= 2){
        const { rawVal, parsedR } = simPcbValeurResistance(fp);
        const rOhms = (parsedR != null && parsedR >= 0) ? parsedR : 22;
        const cleanVal = (parsedR != null && parsedR >= 0) ? (rOhms + "Ω") : (rawVal || (rOhms + "Ω"));
        const valSuffix = " " + (rOhms >= 0 ? (rOhms + "Ω") : cleanVal);
        if(fNets.length === 2){
          const [nA, nB] = fNets;
          if(nA !== nB){
            bridges.push(nA + " + " + nB + " (" + (ref || "R") + valSuffix + ")");
          }
        }else if(simEstResistancePcb(ref, rawVal, fp.type)){
          for(const p of pn){
            if(!p.net || isPwr(p.net)) continue;
            const pNum = parseInt(p.pin, 10);
            if(isNaN(pNum)) continue;
            const pinNums = pn.map(x => parseInt(x.pin, 10)).filter(n => !isNaN(n));
            const maxPin = pinNums.length ? Math.max(...pinNums) : 8;
            const nTotal = Math.max(pn.length, maxPin);
            const oppPin = String(nTotal + 1 - pNum);
            const consPin = String(pNum % 2 === 1 ? pNum + 1 : pNum - 1);
            let paired = pn.find(x => String(x.pin) === oppPin);
            if(!paired) paired = pn.find(x => String(x.pin) === consPin);
            if(paired && paired.net && paired.net !== p.net && !isPwr(paired.net)){
              const bLabel = p.net + " + " + paired.net + " (" + (ref || "R") + valSuffix + ")";
              const revLabel = paired.net + " + " + p.net + " (" + (ref || "R") + valSuffix + ")";
              if(!bridges.includes(bLabel) && !bridges.includes(revLabel)){
                bridges.push(bLabel);
              }
            }
          }
        }
      }
    }
    return bridges.sort((a,b)=>a.localeCompare(b, undefined, {numeric:true}));
  },

  listeNets:function(){
    if(typeof netTable==="function"){
      return netTable().map(x=>x.name).filter(n=>n&&n!=="GND"&&n!=="VCC"&&n!=="+3V3"&&n!=="+5V");
    }
    if(typeof S!=="undefined"&&S.tracks){
      return [...new Set(S.tracks.map(t=>t.net).filter(Boolean))];
    }
    return [];
  },

  netsSelectionnes:function(){
    const res = new Set();
    if(typeof S!=="undefined"){
      if(S.hlNet) res.add(S.hlNet);
      if(typeof focusNet==="function"){
        const fn = focusNet();
        if(fn) res.add(fn);
      }
      if(S.sel){
        if(S.sel.tracks&&S.sel.tracks.size){
          for(const t of S.sel.tracks) if(t&&t.net) res.add(t.net);
        }
        if(S.sel.vias&&S.sel.vias.size){
          for(const v of S.sel.vias) if(v&&v.net) res.add(v.net);
        }
        if(S.sel.fps&&S.sel.fps.size&&Array.isArray(S.fps)){
          for(const fid of S.sel.fps){
            const fp = S.fps.find(f=>f.id===fid);
            if(fp&&typeof simFpPadsNets==="function"){
              const pn = simFpPadsNets(fp);
              for(const p of pn) if(p&&p.net) res.add(p.net);
            }
          }
        }
      }
    }
    return [...res].filter(Boolean);
  },

  armerSerpentin:function(netName, addMm){
    if(typeof busSkewArmMeander==="function"){
      busSkewArmMeander(netName, addMm);
    }
  },

  astuce:function(t){
    if(typeof hint==="function")hint(t);
  }
};

/* Ouvrir le panneau depuis la barre d'outils. Il démarre masqué — le dock ne
   garde que ce qu'on regarde en routant (voir `00-espace-config.js`) — et ce
   bouton est ce qui le rend trouvable sans passer par le menu de l'espace de
   travail. Déjà ouvert, on le déplie plutôt que de le refermer : on vient de
   cliquer pour le voir. */
function simOuvrir(){
  if(typeof wsShow!=="function")return;
  if(wsPlaceOf("sim")==="hidden")wsShow("sim");
  if(WS.panels.sim&&WS.panels.sim.collapsed&&
     typeof wsToggleCollapse==="function")wsToggleCollapse("sim");
  simRafraichir(true);
}

/* Le panneau se branche au chargement, comme celui des paires
   différentielles : rien ne tourne ici avant qu'on clique. `simInit` rend faux
   si le conteneur n'est pas là — page en construction, banc d'essai —, et
   personne n'a à s'en soucier. */
if(typeof simInit==="function"){
  simInit(SIM_PCB,"simPanneau");
  const b=document.getElementById("bSim");
  if(b)b.onclick=simOuvrir;
}
