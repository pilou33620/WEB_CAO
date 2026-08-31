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
function simPontsPlans(cuA, cuB, x, y){
  const netDe = i => String((S.cuL[i] && S.cuL[i].net) || "").trim();
  const nA = new Set(simPlansRef(cuA).map(netDe).filter(Boolean));
  const nB = new Set(simPlansRef(cuB).map(netDe).filter(Boolean));
  if(!nA.size || !nB.size) return null;              /* nets non déclarés */
  let commun = false;
  nA.forEach(n => {if(nB.has(n)) commun = true;});
  if(commun) return null;                            /* rien à traverser */

  const out = [];
  for(const fp of S.fps){
    const d = Math.hypot(fp.x - x, fp.y - y);
    if(d > SIM_RAYON_PONT) continue;
    const pads = padsOf(fp);
    if(pads.length !== 2) continue;
    const nets = new Set(pads.map(q => String(q.net || "").trim())
                             .filter(Boolean));
    let a = false, b = false;
    nets.forEach(n => {if(nA.has(n)) a = true; if(nB.has(n)) b = true;});
    if(!a || !b) continue;
    /* LA VALEUR DU CONDENSATEUR COMPTE, ET PLUS QU'ON NE CROIT. En dessous de
       sa résonance propre, c'est SA capacité qui fixe l'impédance de la
       branche, pas son inductance : un 100 nF vaut 1,6 Ω à 1 MHz, là où son
       ESL n'en vaut que 0,02. L'omettre ferait passer le pont pour un
       court-circuit parfait en basse fréquence. On la lit dans la valeur du
       composant quand elle s'y trouve, et le serveur suppose 100 nF sinon. */
    const pont = {x: r3(fp.x), y: r3(fp.y), repere: fp.ref || ""};
    const cap = simValeurFarads(fp.value);
    if(cap) pont.capacite_F = cap;
    out.push(pont);
  }
  out.sort((p, q) => Math.hypot(p.x - x, p.y - y) -
                     Math.hypot(q.x - x, q.y - y));
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
  out.retours = g.voisins.map(f => ({
    x: r3(f.via.x), y: r3(f.via.y),
    layer_from: simCuIndex(Math.min(f.via.a, f.via.b)),
    layer_to: simCuIndex(Math.max(f.via.a, f.via.b)),
    drill_diameter: f.via.drill, pad_diameter: f.via.d,
    net: f.via.net || ""
  }));
  const ponts = simPontsPlans(cuA, cuB, x, y);
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
        gap_left:e.retourne?p.d:p.g, gap_right:e.retourne?p.g:p.d
      });
      objets.push({trk:t, u1:Math.min(p.u1,p.u2), u2:Math.max(p.u1,p.u2),
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
/* TROIS ANALYSES PEIGNENT CE CUIVRE, ET PAS LA MÊME GRANDEUR : l'impédance
   ses Z₀, la Z différentielle sa Z_diff tronçon par tronçon, la diaphonie le
   bruit attribué à chaque tronçon. Le parcours du canevas est le même dans les
   trois cas — c'est `simCarteSegment` (commun/simulation-em.js) qui sait ce
   qu'il faut peindre, et ce fichier ne le sait plus. */
function simZTrace(c){
  if(typeof simCarteActive!=="function"||!simCarteActive())return;
  if(typeof simPourChaqueLot!=="function"){simZTraceLot(c,null);return;}
  simPourChaqueLot(function(lot){simZTraceLot(c,lot);});
}

function simZTraceLot(c,lot){
  const n=SIM.objets.length;
  c.save();
  c.lineCap="round"; c.lineJoin="round";

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
  };
  passe(0.30, t=>t.w+px(7));
  passe(0.95, t=>Math.max(t.w,px(2.5)));
  passe(1.00, ()=>px(2));

  c.restore();
  simVoisinsTrace(c);
  simZValeurs(c);
  simZNumeroLot(c,lot);
}

/* ==========================================================================
   LE CUIVRE VOISIN — CE QUE LA SÉLECTION LEUR INFLIGE
   --------------------------------------------------------------------------
   La sélection est peinte avec ce qu'elle PREND ; les voisines, avec ce que la
   sélection leur ENVOIE. Même règle pour les deux : une piste peinte montre ce
   qu'elle subit.

   ON NE PASSE PAR AUCUN OBJET DE L'OUTIL, et c'est voulu : `voisinage` est une
   liste de tronçons du DOCUMENT — deux points et une largeur, en millimètres,
   les arcs déjà en cordes —, la même qui est partie au serveur. Retrouver la
   piste de l'outil derrière chaque tronçon coûterait une recherche et pourrait
   échouer ; tracer un segment ne peut pas.

   TROIS PASSES COMME AILLEURS, mais plus discrètes que sur la sélection : le
   halo est moins large et l'âme moins opaque. La sélection reste ce qu'on a
   désigné, et le cuivre voisin ne doit pas la couvrir.
   ========================================================================== */
function simVoisinsTrace(c){
  if(typeof simCarteVoisins!=="function")return;
  const liste=simCarteVoisins();
  if(!liste.length)return;
  c.save();
  c.lineCap="round"; c.lineJoin="round";
  const chemin=v=>{
    c.beginPath();
    c.moveTo(v.seg.start[0],v.seg.start[1]);
    c.lineTo(v.seg.end[0],v.seg.end[1]);
  };
  const passe=(alpha,largeur,quels)=>{
    for(const v of liste){
      if(quels&&!quels(v))continue;
      c.strokeStyle=v.couleur(alpha);
      c.lineWidth=largeur(v.seg.width||0);
      chemin(v); c.stroke();
    }
  };
  /* LA PISTE VICTIME EST PEINTE ENTIÈRE — voir `simCarteVoisins`
     (commun/simulation-em.js). Ce qui ne couple pas passe D'ABORD, gris, fin et
     translucide : il donne à la piste sa continuité, et ne doit pas couvrir le
     millimètre qui, lui, porte le bruit. */
  passe(0.55, w=>Math.max(w*0.6,px(1.2)), v=>!v.couple);
  passe(0.22, w=>w+px(5), v=>v.couple);
  passe(0.85, w=>Math.max(w,px(2)), v=>v.couple);
  c.restore();
  simVoisinsValeurs(c);
}

/* Les valeurs sur le cuivre voisin — une par NET agressé, posée À CÔTÉ de sa
   piste. Voir `simCarteVoisinsEtiquettes` (commun/simulation-em.js) : c'est là
   que se décide laquelle et de quel côté. */
/* LE DÉCALAGE SE CALCULE DANS L'ÉCRAN, et non dans le monde : c'est la seule
   façon d'obtenir la même marge quel que soit le zoom, et de récupérer au
   passage un éventuel retournement de la vue. On projette la normale — rendue
   en millimètres par `simCarteVoisinsEtiquettes` — en prenant la différence de
   deux points transformés, puis on la ramène à la longueur voulue. */
const SIM_VOISIN_MARGE=13;             // pixels écran, du cuivre au cartouche
function simVoisinsValeurs(c){
  if(typeof simCarteVoisinsEtiquettes!=="function")return;
  const etiq=simCarteVoisinsEtiquettes();
  if(!etiq.length)return;
  c.save();
  c.setTransform(1,0,0,1,0,0);
  const dpr=window.devicePixelRatio||1;
  c.scale(dpr,dpr);
  c.font="600 10px "+
    "\"JetBrains Mono\",\"SF Mono\",Consolas,\"Roboto Mono\",monospace";
  c.textAlign="center"; c.textBaseline="middle";
  for(const v of etiq){
    const a=w2s(v.ancre[0],v.ancre[1]);
    const b=w2s(v.ancre[0]+v.normale[0],v.ancre[1]+v.normale[1]);
    let dx=b.x-a.x, dy=b.y-a.y;
    const l=Math.hypot(dx,dy);
    if(l>1e-9){dx/=l;dy/=l;}else{dx=0;dy=-1;}
    const e={x:a.x+dx*SIM_VOISIN_MARGE, y:a.y+dy*SIM_VOISIN_MARGE};
    const txt=v.net+" "+v.texte;
    const w=c.measureText(txt).width+10;
    simCheveluBruit(c,v,a,e);
    c.fillStyle="rgba(15,16,18,0.86)";
    c.beginPath();
    if(c.roundRect)c.roundRect(e.x-w/2,e.y-8,w,16,4);
    else c.rect(e.x-w/2,e.y-8,w,16);
    c.fill();
    c.strokeStyle=v.couleur(1); c.lineWidth=1.1; c.stroke();
    c.fillStyle="#e6e8ec";
    c.fillText(txt,e.x,e.y+0.5);
  }
  c.restore();
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
function simZValeurs(c){
  const n=SIM.objets.length;
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
                             couleur:s.couleur, obj:s.obj});
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
    const p=trkAt(v.obj.trk,u), e=w2s(p.x,p.y);
    const txt=v.texte;
    const w=c.measureText(txt).width+10;
    /* Un cartouche sombre sous le texte : posé à même le cuivre, un chiffre
       clair sur une piste claire ne se lit pas. */
    c.fillStyle="rgba(15,16,18,0.82)";
    c.beginPath();
    if(c.roundRect)c.roundRect(e.x-w/2,e.y-9,w,18,4);
    else c.rect(e.x-w/2,e.y-9,w,18);
    c.fill();
    c.strokeStyle=v.couleur(1); c.lineWidth=1.2;
    c.stroke();
    c.fillStyle="#e6e8ec";
    c.fillText(txt,e.x,e.y+0.5);
  }
  c.restore();
}


/* LE CHEVELU DE LA DIAPHONIE — d'où à où, sans avoir à le deviner.
   --------------------------------------------------------------------------
   MÊME IDÉE QUE CELUI DU COURANT DE RETOUR, et pour la même raison : deux
   cuivres colorés côte à côte ne disent pas lequel agresse lequel. Le trait
   part du point de la SÉLECTION le plus proche, passe par le cuivre de la
   victime et finit sur son étiquette — trois points, un sens de lecture, et
   plus rien à deviner.

   POINTILLÉ ET FIN, parce qu'il DÉSIGNE au lieu de décrire : il ne doit pas
   se lire comme du cuivre. La flèche est portée par le point plein posé sur la
   victime, qui est là où le bruit arrive. */
function simCheveluBruit(c,v,surCuivre,surEtiquette){
  const d=v.depuis?w2s(v.depuis[0],v.depuis[1]):null;
  c.save();
  if(d){
    c.setLineDash([3,3]);
    c.strokeStyle=simAgresseurCouleur(0.85); c.lineWidth=1;
    c.beginPath(); c.moveTo(d.x,d.y); c.lineTo(surCuivre.x,surCuivre.y);
    c.stroke();
    c.setLineDash([]);
    /* LE DÉPART, SUR L'AGRESSEUR : un petit anneau creux — c'est de là que ça
       part, et ce n'est pas là que ça arrive. */
    c.beginPath(); c.arc(d.x,d.y,2.6,0,2*Math.PI); c.stroke();
  }
  /* L'ARRIVÉE, SUR LA VICTIME : un point PLEIN, de la couleur du bruit. C'est
     l'endroit précis que l'étiquette chiffre. */
  c.fillStyle=v.couleur(1);
  c.beginPath(); c.arc(surCuivre.x,surCuivre.y,2.6,0,2*Math.PI); c.fill();
  /* Puis le filet jusqu'au cartouche, qui a dû être écarté du cuivre. */
  c.strokeStyle=v.couleur(0.75); c.lineWidth=1;
  c.beginPath(); c.moveTo(surCuivre.x,surCuivre.y);
  c.lineTo(surEtiquette.x,surEtiquette.y); c.stroke();
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
/* Le rayon de recherche d'un via de masse, en millimètres. Au-delà de trois
   millimètres un retour ne referme plus grand-chose — l'inductance de boucle
   plafonne, elle croît en logarithme — mais on cherche large exprès : dire
   « le plus proche est à 4 mm » vaut mieux que dire « aucun ». */
const SIM_RAYON_RETOUR = 3.0;

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
  for(let i = l - 1; i >= 0; i--)
    if(rolePlane(layerRole(i))){out.push(i); break;}
  for(let i = l + 1; i < S.cu; i++)
    if(rolePlane(layerRole(i))){out.push(i); break;}
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
    if(!rolePlane(layerRole(i))) continue;
    const net = (S.cuL[i] && S.cuL[i].net) || "";
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
    const d = Math.hypot(w.x - v.x, w.y - v.y);
    if(d > SIM_RAYON_RETOUR) continue;
    const f = {via:w, distance:r3(d), part:0, retenu:false, raison:""};
    const wlo = Math.min(w.a, w.b), whi = Math.max(w.a, w.b);
    /* UN VIA QUI N'EST PAS SUR UNE MASSE N'EST PAS UN CANDIDAT, il est HORS
       SUJET. Le lister avec une raison encombrerait le chevelu d'un trait
       rouge par via de signal voisin — sur une carte dense, des dizaines — et
       noierait les seuls traits rouges qui comptent : ceux d'un via de MASSE
       qui, lui, aurait pu refermer la boucle et ne le fait pas. */
    if(!refs.has(w.net)) continue;
    const joints = simPlansJoints(w, verifNet);
    if(wlo > lo || whi < hi)
      f.raison = "ne couvre pas " + cuLabel(lo, S.cu) + "→" + cuLabel(hi, S.cu);
    else if(pDep.length && !dedans(pDep, joints))
      f.raison = "ne rejoint pas " + pDep.map(i => cuLabel(i, S.cu)).join("/");
    else if(pArr.length && !dedans(pArr, joints))
      f.raison = "ne rejoint pas " + pArr.map(i => cuLabel(i, S.cu)).join("/");
    else f.retenu = true;
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
  const netDe = i => String((S.cuL[i] && S.cuL[i].net) || "").trim();
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
  return {via:v, hauteur:hauteur, voisins:out, retenus:retenus,
          L:r.L, seul:r.seul, netsIncertains:!verifNet,
          planChange:planChange, netsDiff:netsDiff,
          /* `change` reste le nom du DÉFAUT : un changement que rien ne peut
             rejoindre, et il exige désormais la certitude. */
          change:planChange && netsDiff === true,
          doute:planChange && netsDiff === null,
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

  for(const g of liens){
    for(const f of g.voisins){
      c.strokeStyle = simRetourCouleur(f);
      /* L'ÉPAISSEUR DIT LA PART DU COURANT. Un trait fin est un via qui ne
         travaille pas, et c'est une information de routage : il occupe une
         place et ne rend rien. */
      c.lineWidth = f.retenu ? px(1.2 + 4.0 * Math.max(f.part, 0)) : px(1.2);
      c.setLineDash(f.retenu ? [] : [px(3), px(3)]);
      c.beginPath();
      c.moveTo(g.via.x, g.via.y);
      c.lineTo(f.via.x, f.via.y);
      c.stroke();
    }
    /* Le via de signal, cerclé : c'est lui dont on parle. */
    c.setLineDash([]);
    c.strokeStyle = g.retenus.length ? "#49c07a" : "#e8564a";
    c.lineWidth = px(1.6);
    c.beginPath();
    c.arc(g.via.x, g.via.y, g.via.d / 2 + px(3), 0, Math.PI * 2);
    c.stroke();
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

  const cartouche = (e, txt, bord, dy, petit) => {
    c.font = (petit ? "600 9.5px " : "600 11px ") +
      "\"JetBrains Mono\",\"SF Mono\",Consolas,\"Roboto Mono\",monospace";
    const w = c.measureText(txt).width + 10, hh = petit ? 15 : 18;
    c.fillStyle = "rgba(15,16,18,0.86)";
    c.beginPath();
    if(c.roundRect) c.roundRect(e.x - w / 2, e.y + dy - hh / 2, w, hh, 4);
    else c.rect(e.x - w / 2, e.y + dy - hh / 2, w, hh);
    c.fill();
    c.strokeStyle = bord; c.lineWidth = 1.2; c.stroke();
    c.fillStyle = "#e6e8ec";
    c.fillText(txt, e.x, e.y + dy + 0.5);
  };

  for(const g of liens){
    /* LA PART SUR CHAQUE LIEN, et seulement si elle se voit : sous cinq pour
       cent, l'étiquette encombre plus qu'elle n'informe — le trait fin dit
       déjà que ce via ne travaille pas. Un lien ÉCARTÉ, lui, porte toujours sa
       raison : c'est la seule chose qui explique pourquoi il ne compte pas. */
    const o = w2s(g.via.x, g.via.y);
    for(const f of g.voisins){
      const e = w2s(f.via.x, f.via.y);
      const lg = Math.hypot(e.x - o.x, e.y - o.y);
      /* UN LIEN TROP COURT À L'ÉCRAN NE PORTE PAS D'ÉTIQUETTE. En dessous de
         quarante-cinq pixels, le cartouche recouvre le via qu'il désigne et
         celui d'à côté : on perd les deux informations pour en afficher une.
         L'ÉPAISSEUR DU TRAIT, elle, dit toujours la part — et elle ne se
         chevauche avec rien. Un lien ÉCARTÉ garde sa raison quoi qu'il arrive :
         c'est la seule chose qui explique pourquoi il ne compte pas, et un via
         écarté est justement celui qu'on a posé tout contre. */
      if(lg < 45 && f.retenu) continue;
      /* AUX DEUX TIERS DU LIEN, ET NON AU MILIEU : le milieu de trois liens qui
         partent du même point retombe dans la même zone encombrée. */
      const m = {x:o.x + 0.66 * (e.x - o.x), y:o.y + 0.66 * (e.y - o.y)};
      /* LA RAISON D'UN ÉCART EST UNE PHRASE, PAS UN POURCENTAGE : elle est
         large, et posée sur le lien elle recouvre le via qu'elle désigne. On
         la remonte au-dessus du trait — le trait pointillé rouge dit déjà
         lequel des deux vias est en cause. */
      if(!f.retenu) cartouche(m, f.raison, "#e8564a", -14, true);
      else if(f.part >= 0.05)
        cartouche(m, Math.round(100 * f.part) + " %",
                  simRetourCouleur(f), 0, true);
    }
    /* L'INDUCTANCE DE BOUCLE, au pied du via, et ce qu'elle vaut. Quand rien ne
       referme la boucle, le chiffre n'est PAS une inductance de boucle : c'est
       la self d'un conducteur seul, elle ne dépend pas du routage, et
       l'afficher comme les autres laisserait croire qu'on a mesuré quelque
       chose. Le « ≥ » n'est pas une précaution de style : le courant revient
       quand même, par le cuivre des plans et plus loin, donc la boucle réelle
       vaut DAVANTAGE. La self partielle en est le plancher. */
    const txt = g.seul
      ? "L ≥ " + simNb(g.L * 1e9, 2) + " nH · sans retour"
      : "L = " + simNb(g.L * 1e9, 2) + " nH";
    /* AU-DESSUS DU VIA, ET AU-DESSUS DE SON CERCLE. Un décalage fixe suffit
       tant qu'on est dézoomé ; à fort grossissement la pastille dépasse le
       cartouche et le chiffre se pose SUR le via qu'il décrit. On le remonte
       donc du rayon écran de la pastille. */
    const rayon = (g.via.d / 2) * S.scale + 14;
    cartouche(o, txt, g.seul ? "#e8564a" : "#49c07a",
              -Math.max(18, rayon), false);
    /* LE DÉFAUT ET LE DOUTE NE SE DISENT PAS DE LA MÊME FAÇON, et surtout pas
       de la même couleur : un chevelu qui crie au rouge sur le cas ordinaire
       cesse d'être regardé. */
    const noms = g.plansDep.map(i => cuLabel(i, S.cu)).join("/") + " → " +
                 g.plansArr.map(i => cuLabel(i, S.cu)).join("/");
    if(g.change)
      cartouche(o, "référence " + noms + " : aucun via ne peut joindre les deux",
                "#e8564a", Math.max(20, rayon), true);
    else if(g.doute)
      cartouche(o, "référence " + noms + " : nets des plans non déclarés",
                "#e0a63c", Math.max(20, rayon), true);
  }
  c.restore();
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
function simDCTube(x,y,a,b,percage,net,repere,polygones,vias){
  const cs=simDCCouchesTouchees(x,y,a,b,polygones);
  if(cs.length<2)return 0;
  let n=0;
  for(let k=0;k<cs.length-1;k++){
    vias.push({x:x, y:y, couche_a:cs[k], couche_b:cs[k+1],
               percage:percage, placage:0.025,
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
        best={nom:(fp.ref||"?")+"."+(q.n==null?"?":q.n),
              x:q.x, y:q.y, couche:cu, net:q.net||"",
              w:q.w, h:q.h, shape:q.shape, rot:q.rot,
              couches:couches.slice()};
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
       pour un consommateur. Un champ vide au premier calcul, c'est un refus
       au premier clic. */
    b.valeur=(role==="source")?3.3:1;
    const k=SIM_DCB.bornes.findIndex(o=>o.nom===b.nom);
    if(k>=0){b.valeur=SIM_DCB.bornes[k].valeur;SIM_DCB.bornes[k]=b;}
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
   deux. Sans ce qui suit, ni la diaphonie ni l'impédance différentielle ne
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

function simVoisinagePcb(liste){
  const sel=new Set(liste||[...S.sel.tracks]);
  if(!sel.size)return [];
  /* La portée : l'écart maximal que le serveur regarde, plus la demi-largeur
     de la piste la plus large. En deçà, on écarterait du cuivre que le serveur
     aurait retenu ; bien au-delà, on l'inonderait. */
  const large=Math.max(...[...sel].map(t=>t.w||0),0);
  const couches=new Set([...sel].map(t=>t.l));
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
    for(const g of trkSegs(t)){
      out.push({type:"track",
                start:[r3(g.x1),r3(g.y1)], end:[r3(g.x2),r3(g.y2)],
                width:t.w, layer:simCuIndex(t.l), net:t.net||"",
                copper_thickness:cuT(t.l),
                gap_left:e.g, gap_right:e.d});
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
              ? "Cliquez une piste sur la carte. Maj+clic la prend entière, "+
                "Ctrl+clic ajoute un morceau à la sélection."
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
         part — mais sans eux il n'y a ni Z différentielle ni diaphonie. */
      voisinage:simVoisinagePcb(liste),
      paires:simPairesPcb(),
      /* LE TEMPS DE MONTÉE est déjà en SECONDES dans la saisie, comme les
         fréquences y sont en hertz : l'unité du champ ne dit que dans quoi on
         l'écrit. Zéro veut dire « déduis-le de la bande ». */
      analyse:{f_debut:opts.f1, f_fin:opts.f2, points:opts.points,
               f_centre:opts.fc, temps_montee:opts.tr||0}
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

const SIM_PCB={
  outil:"editeur-pcb",

  carte:function(){
    return (typeof fabBase==="function")?fabBase():"carte";
  },

  refCandidats:simRefCandidatsPcb,

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
        if(padLayers(fp,q).indexOf(cu)>=0&&padDist(pt[0],pt[1],q)<=0.02)
          return "la pastille "+(fp.ref||"?")+"."+(q.n==null?"?":q.n);
    for(const v of S.vias)
      if(cu>=Math.min(v.a,v.b)&&cu<=Math.max(v.a,v.b)&&
         Math.hypot(v.x-pt[0],v.y-pt[1])<=Math.max((v.d||0)/2,0.02))
        return "un via";
    return "";
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
                ? "Cliquez une piste sur la carte. Maj+clic la prend entière, "+
                  "Ctrl+clic ajoute un morceau à la sélection."
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




  /* ---------------------------------------------------------------------
     LA CHUTE CONTINUE
     --------------------------------------------------------------------- */

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
    if(b)b.valeur=(+v)||0;
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
    let n=0;
    for(const v of S.vias){
      if(v.net!==net)continue;
      n++;
      simDCTube(v.x, v.y, v.a, v.b,
                v.drill||Math.max((v.d||0.8)-0.1,0.1),
                net, "V"+n, polygones, vias);
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
      bornes:B.map(b=>b.nom)
    };
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
