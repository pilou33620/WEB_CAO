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

   2. **Les vias ne sont pas modélisés.** Une piste qui change de couche part
      quand même, ses tronçons des deux couches compris, mais la transition
      verticale manque. Le panneau le dit sous la fiche plutôt que de laisser
      croire à un modèle complet.

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
function simSegments(){
  const objets=[], envoi=[], pistes=[], hors=new Map();
  const refs=simRefSet();
  for(const t of S.tracks){
    if(!S.sel.tracks.has(t))continue;
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
    for(const p of (r.plages.length?r.plages
                                   :[{u1:0,u2:1,longueur:total,g:0,d:0}])){
      const a=trkAt(t,p.u1), b=trkAt(t,p.u2);
      envoi.push({
        type:"track",
        start:[r3(a.x),r3(a.y)], end:[r3(b.x),r3(b.y)],
        length:r3(total*(p.u2-p.u1)), width:t.w, layer:simCuIndex(t.l),
        net:t.net||"", copper_thickness:cuT(t.l),
        gap_left:p.g, gap_right:p.d
      });
      objets.push({trk:t, u1:p.u1, u2:p.u2,
                   couche:cuLabel(t.l,S.cu), l:t.l});
    }
  }
  return {envoi:envoi, objets:objets,
          couture:simCouturePcb(pistes,refs),
          voisins:[...hors.values()].sort((a,b)=>b.longueur-a.longueur)};
}

/* Ce que la sélection couvre, en une ligne — c'est elle qui dit lequel des
   trois gestes est en vigueur, sans avoir à s'en souvenir. */
function simPortee(objets){
  if(!objets.length)return "";
  const couches=new Set(objets.map(o=>o.l));
  const nets=new Set([...S.sel.tracks].map(t=>t.net).filter(Boolean));
  const net=nets.size===1?[...nets][0]:null;
  const n=S.sel.tracks.size;
  const quoi=n===1
    ? "un tronçon"
    : (couches.size>1
        ? "la piste sur "+couches.size+" couches"
        : "la piste, sur "+cuLabel(objets[0].l,S.cu));
  return (net?net+" — ":"")+quoi;
}

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

function simZTrace(c){
  if(typeof simZActif!=="function"||!simZActif())return;
  const n=SIM.objets.length;
  c.save();
  c.lineCap="round"; c.lineJoin="round";

  const passe=(alpha,largeur)=>{
    for(let i=0;i<n;i++){
      const s=simZSegment(i);
      if(!s||!s.obj||!s.obj.trk)continue;
      c.strokeStyle=simZCouleur(s.z0,alpha);
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
  simZValeurs(c);
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
    const s=simZSegment(i);
    if(!s||!s.obj||!s.obj.trk||!(s.z0>0))continue;
    const cle=Math.round(s.z0*10);
    const lg=s.seg.longueur||0;
    const p=parValeur.get(cle);
    if(!p||lg>p.lg)parValeur.set(cle,{lg:lg, z0:s.z0, obj:s.obj});
  }
  if(!parValeur.size)return;

  c.save();
  c.setTransform(1,0,0,1,0,0);
  const dpr=window.devicePixelRatio||1;
  c.scale(dpr,dpr);
  c.font="600 11px "+
    "\"JetBrains Mono\",\"SF Mono\",Consolas,\"Roboto Mono\",monospace";
  c.textAlign="center"; c.textBaseline="middle";
  for(const v of parValeur.values()){
    const u=(v.obj.u1+v.obj.u2)/2;
    const p=trkAt(v.obj.trk,u), e=w2s(p.x,p.y);
    const txt=simNb(v.z0,1)+" Ω";
    const w=c.measureText(txt).width+10;
    /* Un cartouche sombre sous le texte : posé à même le cuivre, un chiffre
       clair sur une piste claire ne se lit pas. */
    c.fillStyle="rgba(15,16,18,0.82)";
    c.beginPath();
    if(c.roundRect)c.roundRect(e.x-w/2,e.y-9,w,18,4);
    else c.rect(e.x-w/2,e.y-9,w,18);
    c.fill();
    c.strokeStyle=simZCouleur(v.z0,1); c.lineWidth=1.2;
    c.stroke();
    c.fillStyle="#e6e8ec";
    c.fillText(txt,e.x,e.y+0.5);
  }
  c.restore();
}

/* ==========================================================================
   L'adaptateur
   ========================================================================== */
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
    if(!S.sel.tracks.size)
      return {erreur:"Aucune piste sélectionnée.",
              conseil:S.tracks.length
                ? "Cliquez une piste sur la carte. Maj+clic la prend entière."
                : "Cette carte n'a pas encore de piste routée."};

    const g=simSegments();
    if(!g.envoi.length)
      return {erreur:"La sélection ne porte aucun tronçon exploitable."};

    const notes=[];
    const nets=new Set([...S.sel.tracks].map(t=>t.net).filter(Boolean));
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
        carte:this.carte(), net:net,
        stackup:simStackup(),
        geometry:{objects:g.envoi},
        ports:[{id:1,impedance:opts.z0},{id:2,impedance:opts.z0}],
        analyse:{f_debut:opts.f1, f_fin:opts.f2, points:opts.points,
                 f_centre:opts.fc}
      },
      objets:g.objets,
      portee:simPortee(g.objets),
      notes:notes,
      couture:g.couture,
      voisins:g.voisins
    };
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
