/* =============================================================================
   commun/simulation-em.js
   Simulation électromagnétique : le panneau, le transport, la carte de chaleur.

   DEUX FAMILLES, ET UNE SEULE ANALYSE POUR L'INSTANT. Le panneau se range en
   **SI** — intégrité du signal, ce qu'un front devient en parcourant le
   cuivre — et **PI** — intégrité de l'alimentation, ce que le réseau de
   distribution laisse passer. SI porte « Impédance » ; PI porte « Chute DC »,
   dont le SOLVEUR est fait et mesuré (`python/dc_solver.py`, 16 cas dans
   `python/test/banc-dc.py`) mais dont AUCUN des deux outils ne sait encore
   extraire le cuivre ni les courants — l'onglet le dit lui-même, en toutes
   lettres, plutôt que de laisser croire à une erreur de sélection.

   Le registre est `SIM_FAMILLES` / `SIM_ANALYSES`, plus bas : une analyse y
   déclare son nom, ses commandes, son branchement, sa sortie, et si elle peint
   la carte. En ajouter une, c'est ajouter une entrée — l'onglet apparaît seul.

   CE QUE FAIT « IMPÉDANCE » : le serveur résout la section droite de chaque
   tronçon par méthode des moments (`python/ligne_mom.py`), rend son impédance
   caractéristique à la fréquence centrale, et les paramètres S de la liaison
   entière par mise en cascade. La page peint le résultat SUR la piste et
   l'écrit à côté.

   Le solveur est en Python et en numpy : un navigateur ne peut pas l'exécuter,
   et c'est la seule raison pour laquelle ce fichier parle à un serveur — le
   chemin est exactement celui de la visionneuse IPC-2581.

   CE QUE LE MODÈLE COUVRE, ET CE QU'IL NE COUVRE PAS. La méthode est vérifiée
   à 0,4 % près contre Hammerstad-Jensen (microruban) et à 0,3 % contre la
   solution exacte en intégrales elliptiques (triplaque) — ce n'est pas une
   formule ajustée, c'est un calcul de champ sur la section, et il traite des
   cas que les formules ne savent pas traiter, à commencer par la triplaque
   décentrée. Mais il ne voit qu'une suite de sections uniformes : les coudes,
   les moignons, les transitions de via et le rayonnement n'y sont pas. Le
   serveur joint cet avertissement à chaque réponse, et le panneau l'affiche.

   Deux outils l'utilisent, et ils n'ont pas le même document :

     · **l'éditeur PCB** connaît son empilage physique au micron près, et sa
       sélection porte les trois gestes — clic, Maj+clic, Maj+clic à nouveau ;
     · **la visionneuse IPC-2581** lit une carte livrée, dont l'empilage est
       parfois muet ; l'utilisateur l'a alors complété à la main.

   Ce fichier ne connaît ni l'un ni l'autre. Tout ce qui diffère passe par un
   adaptateur remis à `simInit()`, comme `commun/reperage.js` et son `RP_ED` :

     outil            -> "editeur-pcb" | "visionneuse-ipc2581"
     carte()          -> texte           nom du document
     refCandidats()   -> [{net, defaut, quoi}]   les nets qui pourraient être
                                         la masse de référence, le meilleur
                                         d'abord ; `defaut` dit lesquels sont
                                         proposés d'office
     probleme(opts)   -> {doc, objets, portee, notes, couture, voisins}
                         ou {erreur, conseil}
     bout(pt, obj)    -> texte           ce qu'il y a au point `pt` [x,y] sur
                                         la couche de `obj` (l'objet du
                                         document d'échange) : « pastille
                                         J1.1 », « via », ou "" si l'outil ne
                                         sait pas. Sert à NOMMER les deux
                                         ports. Facultatif
     redessiner()                        redessine le canevas de l'outil
     astuce(txt)                         la ligne de pied de page

   Et pour l'analyse « Chute DC », deux méthodes FACULTATIVES — un outil qui
   ne les déclare pas voit l'onglet dire pourquoi il ne calcule pas :

     cuivreDC()   -> {polygones, vias, sources, references, pas}
                     ou {erreur, conseil}    le problème résistif, en mm
     peindreDC(r)                        peint la carte de potentiel

   `doc` est le document d'échange, `objets` la liste des objets de l'outil
   ALIGNÉE sur `doc.geometry.objects` : c'est par cet alignement que le
   résultat du serveur retrouve la piste à peindre. `opts` porte ce que
   l'utilisateur a saisi : {f1, f2, points, fc, z0} — hertz et ohms.

   QUI EST LA MASSE ? C'est une question que le cuivre ne répond pas tout seul,
   et elle commande tout le calcul coplanaire. Le panneau la pose ici, une fois,
   et les deux outils lisent la réponse par `simRefSet()` — l'un la déduit du
   rôle de ses couches, l'autre la devine sur le cuivre livré, mais aucun des
   deux ne décide seul : l'utilisateur voit la proposition et peut la corriger.
   Avant, tout cuivre d'un autre net comptait comme masse ; un îlot d'un autre
   signal aussi, donc, et il n'y avait rien pour le dire.
   ============================================================================= */
"use strict";

const SIM_PORT=8000;                   // DEFAULT_PORT de serveur.py
const SIM_ROUTE="/api/simulation";
const SIM_DC_ROUTE="/api/simulation-dc";
const SIM_DC_FORMAT="cao-sim-dc-1";   // FORMAT de python/dc_solver.py

/* ===========================================================================
   L'ANALYSE « CHUTE DC » (IR drop), famille PI

   CE QUE C'EST. Pas de l'électromagnétisme : un problème résistif sur les
   formes de cuivre, sans fréquence — `python/dc_solver.py`, un réseau de
   résistances sur une trame carrée et un gradient conjugué. Vérifié contre
   ρL/(Wt), qui se pose à la main : 16 cas dans `python/test/banc-dc.py`.

   LE VOCABULAIRE, ET IL EST CELUI DU SCHÉMA. Deux sortes de bornes, et elles
   ne se règlent pas avec la même grandeur :

     · une SOURCE est une alimentation — un régulateur, une arrivée de
       connecteur. On lui règle sa TENSION, en volts.
     · une CHARGE est un consommateur. On lui règle le COURANT qu'il tire, en
       ampères.

   Autant de l'une et de l'autre qu'on veut. Le calcul rend alors CE QUI ARRIVE
   à chaque charge — « il reste 3,29 V à U5.1 » —, ce qui est la question qu'on
   se pose vraiment devant une carte.

   D'OÙ VIENNENT LES COURANTS. Pas du PCB, et pas encore du schéma : de
   l'utilisateur. Attendre que le schéma porte la consommation de chaque
   composant, c'était n'avoir aucune analyse DC du tout.

   POURQUOI PAS LE MOTEUR MoM, puisqu'il est là. Parce qu'il ne répond pas à
   cette question : MoM résout la SECTION d'une ligne pour son impédance, à une
   fréquence donnée. La chute continue n'a pas de fréquence — c'est un problème
   résistif sur des surfaces, et le résoudre par un réseau de résistances est
   exact, pas approché : un barreau y redonne ρL/(Wt) à 0,000 %.

   LE CHANGEMENT DE COUCHE N'EST PAS UNE OPTION. Le net des deux pastilles
   décide du cuivre envoyé : ses pistes, ses zones, ses pastilles et SES VIAS,
   sur toutes les couches. Dès qu'un via du net existe, le courant peut le
   prendre, et c'est le solveur qui dit quelle part le prend vraiment. Le
   panneau rend ensuite CE QUE CHAQUE VIA A PORTÉ — c'est le seul chiffre qui
   permette de décider d'en doubler un.

   L'ADAPTATEUR :

     dcBornes()        -> {source, reference}, chacune {nom, x, y, couche, net}
                          ou null. Relues à chaque affichage : une pastille
                          effacée doit disparaître du panneau.
     dcChoisir(role)   -> arme la désignation ; le clic suivant sur la carte
                          choisit la pastille et rappelle simDCBorneChoisie()
     dcOublier(role)   -> efface une borne, ou les deux si role est absent
     cuivreDC(opts)    -> {polygones, vias, sources, references, net, bornes}
                          ou {erreur, conseil} ; `opts` porte {courant, tension}

   avec, EN MILLIMÈTRES comme tout le reste du document d'échange :

     polygones   [{vertices:[[x,y],…], couche, net, epaisseur, trou?}]
     vias        [{x, y, couche_a, couche_b, percage, placage, hauteur, net,
                   repere}]
     sources     [{couche, net, courant, x, y | boite:[x0,y0,x1,y1]}]
     references  [{couche, net, tension, x, y | boite:[x0,y0,x1,y1]}]

   `trou` retire du cuivre au lieu d'en poser : c'est une découpe de plan.
   ========================================================================== */

/* La chute par net, telle que le solveur la rend. `SIM.resDC` porte aussi
   `cartes`, une carte de chaleur par couche, que l'outil peut peindre s'il
   déclare `peindreDC()`. */
function simCorpsDC(){
  return ''+
  '<div class="pnl-bar">'+
    '<span class="pnl-lbl">Ajouter</span>'+
    '<button class="tb mini" id="simDCAddSrc" '+
            'title="Une SOURCE est une alimentation — un régulateur, une '+
            'arrivée de connecteur. On lui règle sa TENSION, en volts. '+
            'Cliquez ici, puis la pastille sur la carte.">'+
            '+ source (V)</button>'+
    '<button class="tb mini" id="simDCAddRef" '+
            'title="Une CHARGE est un consommateur. On lui règle le COURANT '+
            'qu\'il tire, en ampères. Cliquez ici, puis la pastille sur la '+
            'carte. Un rail qui nourrit dix composants en porte dix.">'+
            '+ charge (A)</button>'+
    '<button class="tb mini" id="simDCRaz" '+
            'title="Oublier toutes les bornes">Effacer</button>'+
  '</div>'+
  '<div id="simDCListe"></div>'+
  '<div class="pnl-bar">'+
    '<span class="pnl-lbl">Trame</span>'+
    simChamp("simDCPas","Le côté du carreau de maillage, en millimètres — la "+
                        "finesse du calcul. LAISSEZ VIDE : elle est choisie "+
                        "pour que la forme la plus étroite du cuivre reçoive "+
                        "au moins quatre carreaux dans sa largeur, ce qui est "+
                        "ce qu'il faut pour qu'une résistance veuille dire "+
                        "quelque chose. N'y touchez que pour raffiner un "+
                        "rétrécissement, ou pour alléger un calcul trop lourd.")+
    '<span class="pnl-u">mm</span>'+
    '<button class="tb mini on" id="simDCGo" '+
            'title="Calculer la chute de tension continue">▶ Calculer</button>'+
  '</div>'+
  '<div class="pnl-bar">'+
    '<span class="pnl-lbl">Carte</span>'+
    simCarteDCListe()+
  '</div>';
}

/* CE QUE LA CARTE MONTRE, en liste. Les trois grandeurs arrivent ensemble du
   serveur : en changer ne relance rien, cela ne coûte qu'une image. */
function simCarteDCListe(){
  let h='<select class="simU simUSel" id="simDCQuoi" title="La grandeur '+
        'peinte sur le cuivre analysé.">';
  for(const g of SIM_DC_GRANDEURS)
    h+='<option value="'+g.cle+'">'+simEsc(g.nom)+'</option>';
  return h+"</select>";
}

function simBrancherDC(){
  const btn=simEl("simDCGo");
  if(btn)btn.onclick=simDCLancer;
  const q=simEl("simDCQuoi");
  if(q){
    q.value=SIM.dcQuoi;
    q.onchange=()=>{simDCRepeindre(q.value);simRendre();};
  }
  const as=simEl("simDCAddSrc");
  if(as)as.onclick=()=>simDCArmer("source");
  const ar=simEl("simDCAddRef");
  if(ar)ar.onclick=()=>simDCArmer("charge");
  const raz=simEl("simDCRaz");
  if(raz)raz.onclick=()=>{
    if(SIM_ED&&SIM_ED.dcOublier)SIM_ED.dcOublier();
    SIM.resDC=null;SIM.erreurDC="";SIM.dcImages=null;SIM.dcFinesse=null;SIM.dcIndex=null;SIM.dcSonde=null;
    simRendre();
  };
  /* PAS DE VALEUR D'USINE : le champ vide veut dire « choisis-la ». Y écrire
     0,2 mm d'office, c'était imposer une finesse qui ne convient ni à une
     piste de 0,15 mm — deux carreaux, une résistance qui ne veut rien dire —
     ni à un plan de cinquante millimètres, qu'elle fait payer cher pour rien. */
  const pas=simEl("simDCPas");
  if(pas)pas.placeholder="auto";
  simRendre();
}

/* Armer la désignation d'une borne. Le panneau ne fait que le demander : c'est
   la carte qui reçoit le clic, parce que c'est elle qui sait ce qu'il y a
   dessous. */
function simDCArmer(role){
  if(!(SIM_ED&&SIM_ED.dcChoisir))return;
  SIM_ED.dcChoisir(role);
  simRendre();
}

/* Rappelée par l'outil quand une borne vient d'être choisie. */
function simDCBorneChoisie(){
  simRendre();
}

/* ===========================================================================
   LA LISTE DES BORNES

   POURQUOI UNE LISTE, ET PAS DEUX CHAMPS. La première version n'acceptait
   qu'une source et une référence, ce qui décrit un cas et un seul : un
   régulateur, un consommateur. Un net d'alimentation en nourrit dix, et la
   chute que chacun voit dépend de ce que TIRENT LES AUTRES — c'est même tout
   l'intérêt du calcul. Deux champs obligeaient à dix calculs séparés, dont
   aucun n'aurait été juste.

   PLUSIEURS RÉFÉRENCES ONT AUSSI UN SENS : deux régulateurs en parallèle, ou
   un connecteur d'alimentation à deux broches. Le solveur les tient toutes à
   leur tension et répartit le courant entre elles.
   ========================================================================== */
function simRendreBornes(){
  const el=simEl("simDCListe");
  if(!el)return;
  const bornes=(SIM_ED&&SIM_ED.dcBornes)?SIM_ED.dcBornes():[];
  if(!bornes.length){
    el.innerHTML='<p class="pnl-note">Aucune borne.<br>'+
      '<b>Source</b> = l\'alimentation, on lui règle sa <b>tension</b> (V).<br>'+
      '<b>Charge</b> = un consommateur, on lui règle le <b>courant</b> qu\'il '+
      'tire (A).<br>Il en faut au moins une de chaque.</p>';
    return;
  }
  let h='';
  bornes.forEach((b,k)=>{
    const src=b.role==="source";
    h+='<div class="pnl-bar">'+
       '<span class="pnl-lbl" title="'+(src
          ? "Alimentation : sa tension est imposée"
          : "Consommateur : son courant est imposé")+'">'+
       (src?"source":"charge")+'</span>'+
       '<span class="pnl-u" title="'+simEsc("net "+(b.net||"aucun")+
           ", couche "+(b.couche+1))+'">'+simEsc(b.nom)+'</span>'+
       '<input id="simDCV'+k+'" type="text" inputmode="decimal" '+
       'spellcheck="false" value="'+simEsc(simNbLibre(b.valeur))+'" '+
       'title="'+(src
          ? "La TENSION que cette alimentation impose, en volts."
          : "Le COURANT que ce composant tire, en ampères.")+'">'+
       '<span class="pnl-u">'+(src?"V":"A")+'</span>'+
       '<button class="tb mini" id="simDCDel'+k+'" '+
       'title="Retirer cette borne">×</button>'+
       '</div>';
  });
  el.innerHTML=h;
  bornes.forEach((b,k)=>{
    const ch=simEl("simDCV"+k);
    if(ch)ch.onchange=()=>{
      const v=parseFloat(String(ch.value).replace(",","."));
      if(SIM_ED.dcValeur)SIM_ED.dcValeur(k,isFinite(v)?v:0);
    };
    const del=simEl("simDCDel"+k);
    if(del)del.onclick=()=>{
      if(SIM_ED.dcOublier)SIM_ED.dcOublier(k);
      SIM.resDC=null;SIM.erreurDC="";SIM.dcImages=null;SIM.dcFinesse=null;SIM.dcIndex=null;SIM.dcSonde=null;
      simRendre();
    };
  });
}



/* ===========================================================================
   LA FINESSE DE LA TRAME, CHOISIE TOUTE SEULE

   CE QUE LA TRAME EST. Le solveur découpe le cuivre en carreaux carrés et
   relie les voisins par une conductance. Le pas est le côté du carreau.

   POURQUOI ELLE NE DOIT PAS ÊTRE UN RÉGLAGE. Trop grossière, la forme la plus
   étroite ne reçoit qu'un ou deux carreaux : sa résistance sort de la position
   de deux points, pas de sa géométrie, et le solveur refuse carrément en
   dessous de quatre. Trop fine, le nombre de nœuds va comme 1/pas² et le
   calcul rampe pour une précision dont personne n'a besoin sur un plan.
   Entre les deux, la bonne valeur se DÉDUIT du cuivre — il n'y a rien à
   deviner.

   LA RÈGLE : HUIT carreaux dans la largeur de la forme la plus étroite.

   POURQUOI HUIT ET NON QUATRE, qui est le seuil du mailleur. Parce que la
   largeur que le solveur VOIT est quantifiée par la trame : selon la phase du
   cuivre sur la grille, une piste tombe sur n ou n+1 carreaux. À quatre, c'est
   ±12 % sur la largeur — et l'échauffement va en A^(−0,725/0,44), donc ±19 %
   sur la température. Mesuré : la même piste de 0,5 mm rendait 0,60 mm de
   section au pas de 0,15 et 0,50 mm au pas de 0,125, soit 15,45 K contre
   20,87 — un rapport de 0,740, exactement (0,5/0,6)^1,6477. À huit carreaux
   l'écart tombe de moitié, pour quatre fois plus de nœuds ; c'est le prix
   d'un chiffre qu'on peut lire.

   IL EN RESTE UNE INCERTITUDE, et il faut la connaître : ±6 % sur la largeur
   vue, donc une dizaine de pour cent sur la température de la forme la plus
   fine. Les formes plus larges, elles, sont bien mieux résolues.

   LE GARDE-FOU : si cette finesse-là demande plus de nœuds que le solveur n'en
   accepte, on l'élargit — et on le DIT, parce qu'à partir de là les
   rétrécissements les plus fins ne sont plus décrits.
   ========================================================================== */
const SIM_DC_CARREAUX_MINI=8;      // dans la largeur de la forme la plus fine
const SIM_DC_NOEUDS_CIBLE=250000;  // MAX_NOEUDS de dc_solver.py est à 400 000

function simDCFinesse(polygones){
  const pleins=(polygones||[]).filter(g=>!g.trou&&g.vertices&&
                                          g.vertices.length>=3);
  if(!pleins.length)return null;
  let mini=Infinity, aireCuivre=0;
  let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity;
  const couches=new Set();
  for(const g of pleins){
    couches.add(g.couche);
    let a=Infinity,b=Infinity,c=-Infinity,d=-Infinity;
    for(const v of g.vertices){
      if(v[0]<a)a=v[0]; if(v[0]>c)c=v[0];
      if(v[1]<b)b=v[1]; if(v[1]>d)d=v[1];
    }
    /* L'AIRE RÉELLE DE LA FORME, par la formule du lacet. C'est elle qui dit
       combien de carreaux le maillage coûtera — la boîte englobante de tout le
       cuivre, elle, compte le vide entre deux pistes éloignées et ferait
       élargir la trame pour rien. Des formes qui se recouvrent sont comptées
       deux fois : l'estimation penche du côté prudent, ce qui est le bon
       côté pour un budget. */
    let lacet=0;
    for(let i=0,j=g.vertices.length-1;i<g.vertices.length;j=i++)
      lacet+=(g.vertices[j][0]*g.vertices[i][1]
              -g.vertices[i][0]*g.vertices[j][1]);
    aireCuivre+=Math.abs(lacet)/2;
    /* LE PETIT CÔTÉ de la boîte d'une forme est sa largeur : pour le
       quadrilatère d'un tronçon de piste c'est sa largeur de cuivre, pour une
       pastille son plus petit diamètre, pour un plan c'est grand — et c'est
       juste, un plan n'impose aucune finesse. */
    const court=Math.min(c-a,d-b);
    if(court>1e-6&&court<mini)mini=court;
    if(a<x0)x0=a; if(c>x1)x1=c;
    if(b<y0)y0=b; if(d>y1)y1=d;
  }
  if(!isFinite(mini))return null;

  let pas=mini/SIM_DC_CARREAUX_MINI;
  /* Le cuivre EFFECTIF, borné par la boîte : deux quadrilatères qui se
     recouvrent ne font pas plus de cuivre que la surface qu'ils occupent. */
  const boite=Math.max((x1-x0)*(y1-y0),1e-9)*Math.max(couches.size,1);
  const aire=Math.max(Math.min(aireCuivre,boite),1e-9);
  let note="";
  if(aire/(pas*pas)>SIM_DC_NOEUDS_CIBLE){
    const large=Math.sqrt(aire/SIM_DC_NOEUDS_CIBLE);
    note="Trame élargie à "+simNb(large,3)+" mm pour tenir le calcul : la "+
         "forme la plus étroite ("+simNb(mini,3)+" mm) n'y reçoit que "+
         simNb(mini/large,1)+" carreau(x), et les rétrécissements plus fins "+
         "qu'elle ne sont pas décrits.";
    pas=large;
  }
  return {pas:pas, mini:mini, couches:couches.size, formes:pleins.length,
          trous:(polygones||[]).length-pleins.length, note:note};
}

/* ===========================================================================
   LA CARTE DE POTENTIEL

   CE QU'ON PEINT, ET CE QU'ON REFUSE DE PEINDRE. Le serveur rend aussi
   `cartes` — une grille régulière de 120 × 120 par couche, interpolée AU PLUS
   PROCHE. On ne s'en sert pas : cette grille couvre la BOÎTE ENGLOBANTE du
   cuivre, et hors du cuivre elle porte le potentiel du nœud le plus proche.
   La peindre telle quelle étalerait de la couleur sur du vide — une chute
   affichée là où il n'y a pas de conducteur. On peint donc les NŒUDS, un
   carreau de trame chacun : exactement le cuivre qui a été calculé, et rien
   d'autre.

   UNE IMAGE PRÉ-CALCULÉE, PAS DES MILLIERS DE RECTANGLES. Un maillage courant
   porte des dizaines de milliers de nœuds ; les redessiner à chaque
   rafraîchissement rendrait la vue inutilisable. On construit donc UNE image
   par couche, à la résolution de la trame — un pixel par carreau —, et le
   canevas ne fait plus que l'étirer.

   LA TEINTE ÉVITE LE ROUGE, ET C'EST DÉLIBÉRÉ. `SIM_Z_ROUGE` vaut exactement
   la couleur d'erreur du DRC, et la carte d'impédance s'y confond déjà (voir
   A-FAIRE.md). Celle-ci va du CYAN (au potentiel de référence) au VIOLET puis
   à l'AMBRE (le plus loin) : trois teintes qu'aucun autre calque n'emploie,
   donc lisibles par-dessus un DRC allumé.
   ========================================================================== */

/* LES TROIS GRANDEURS QU'ON PEUT PEINDRE, et ce qu'elles disent.

   LA CHUTE NE DIT PAS TOUT, et c'est la raison d'être des deux autres. Une
   piste peut tenir sa chute et fondre quand même : c'est la SECTION qui
   chauffe, pas la longueur. Un rétrécissement de deux millimètres ne pèse
   presque rien sur la tension — mesuré : +6 % — et il multiplie la
   température par TROIS. Aucun contrôle géométrique ne le voit non plus, parce
   que la piste y respecte sa largeur minimale.

   `cle` est le tableau que le serveur rend, un nombre par nœud ; `unite` et
   `facteur` disent comment l'écrire. */
const SIM_DC_GRANDEURS=[
  {cle:"echauffement", nom:"Échauffement", unite:"K", facteur:1, dec:2,
   aide:"La montée en température au-dessus de l'ambiante, par IPC-2221. "+
        "C'est un chiffre : il ne dépend pas de la finesse du maillage."},
  {cle:"densite", nom:"Densité", unite:"A/mm²", facteur:1, dec:1,
   aide:"Le courant par unité de section. Elle montre OÙ le courant se "+
        "presse ; à un angle vif elle est singulière, donc son maximum "+
        "dépend du maillage — c'est un repère, pas un chiffre."},
  {cle:"potentiel", nom:"Potentiel", unite:"mV", facteur:1e3, dec:2,
   aide:"La tension en chaque point du cuivre. L'écart d'un bout à l'autre "+
        "est la chute."}
];
function simDCGrandeur(cle){
  return SIM_DC_GRANDEURS.find(g=>g.cle===(cle||SIM.dcQuoi))
         ||SIM_DC_GRANDEURS[0];
}

/* La rampe, en trois arrêts. `t` va de 0 (au potentiel de référence) à 1 (le
   point le plus éloigné électriquement). */
const SIM_DC_RAMPE=[[ 34,197,213],    // cyan   : on est à la référence
                    [124, 92,214],    // violet : à mi-chemin
                    [240,166, 46]];   // ambre  : le pire point du net
function simDCCouleur(t){
  const u=Math.max(0,Math.min(1,t))*(SIM_DC_RAMPE.length-1);
  const k=Math.min(SIM_DC_RAMPE.length-2,Math.floor(u)), f=u-k;
  const a=SIM_DC_RAMPE[k], b=SIM_DC_RAMPE[k+1];
  return [Math.round(a[0]+(b[0]-a[0])*f),
          Math.round(a[1]+(b[1]-a[1])*f),
          Math.round(a[2]+(b[2]-a[2])*f)];
}

/* Peint-on ? Il faut l'onglet DC ouvert ET un résultat. La carte d'impédance
   et celle-ci ne s'affichent jamais ensemble : elles répondent à deux
   questions, et superposées on ne saurait plus laquelle. */
function simDCActif(){
  return SIM.ouvert&&SIM.analyse==="dc"&&!!SIM.resDC&&!!SIM.dcImages;
}

/* Les images, une par couche, construites une fois pour toutes à l'arrivée du
   résultat. Rend {images:Map(couche -> {canvas,x0,y0,pas,nx,ny}), vmin, vmax}
   ou null. `fabrique` crée un canevas hors écran — le DOM du banc d'essai n'en
   fournit pas toujours, et l'absence doit se traduire par « on ne peint pas »,
   pas par une pile d'appels. */
function simDCConstruireImages(res,fabrique,quoi){
  if(!res||!res.noeuds||!res.noeuds.length)return null;
  const g=simDCGrandeur(quoi);
  const v=res[g.cle]||[], pas=res.pas||0.2;
  if(v.length!==res.noeuds.length)return null;
  let vmin=Infinity,vmax=-Infinity;
  for(const x of v){if(x<vmin)vmin=x;if(x>vmax)vmax=x;}
  if(!(isFinite(vmin)&&isFinite(vmax)))return null;
  const etendue=(vmax-vmin)||1;

  /* Un groupe par couche : peindre deux potentiels l'un sur l'autre les
     mélangerait sans le dire. */
  const par=new Map();
  res.noeuds.forEach((n,i)=>{
    const c=n[2];
    if(!par.has(c))par.set(c,{x0:Infinity,y0:Infinity,x1:-Infinity,y1:-Infinity,
                             idx:[]});
    const g=par.get(c);
    g.idx.push(i);
    if(n[0]<g.x0)g.x0=n[0]; if(n[0]>g.x1)g.x1=n[0];
    if(n[1]<g.y0)g.y0=n[1]; if(n[1]>g.y1)g.y1=n[1];
  });

  const images=new Map();
  for(const [c,g] of par){
    const nx=Math.round((g.x1-g.x0)/pas)+1, ny=Math.round((g.y1-g.y0)/pas)+1;
    if(!(nx>0&&ny>0)||nx*ny>4e6)continue;
    const cv=fabrique(nx,ny);
    if(!cv)return null;
    const ctx=cv.getContext("2d");
    if(!ctx)return null;
    const img=ctx.createImageData(nx,ny);
    const d=img.data;
    for(const i of g.idx){
      const n=res.noeuds[i];
      const ix=Math.round((n[0]-g.x0)/pas);
      /* PAS DE MIROIR ICI, et c'est le contrat de `drawImage` qui le dit :
         `drawImage(img, x0, y0, w, h)` pose la LIGNE 0 de l'image au y
         MINIMUM de la destination, et la dernière ligne au maximum. La ligne 0
         porte donc le monde en y0, comme la colonne 0 porte le monde en x0.

         La première version retournait l'image « parce que l'écran a son y
         vers le bas ». C'est vrai de l'ÉCRAN, pas de la destination : on
         dessine en coordonnées MONDE, et la transformation du canevas s'occupe
         du reste — d'autant qu'elle n'est pas la même dans les deux outils,
         `setTransform(s,0,0,s,…)` côté éditeur et `(s,0,0,-s,…)` côté
         visionneuse. Retourner ici, c'était retourner DEUX fois là où le
         canevas retourne déjà, et zéro fois là où il ne retourne pas : la
         carte sortait en miroir des deux côtés, et un défaut d'alimentation se
         lisait à l'opposé de là où il est. */
      const iy=Math.round((n[1]-g.y0)/pas);
      if(ix<0||iy<0||ix>=nx||iy>=ny)continue;
      const rgb=simDCCouleur((v[i]-vmin)/etendue);
      const o=(iy*nx+ix)*4;
      d[o]=rgb[0]; d[o+1]=rgb[1]; d[o+2]=rgb[2]; d[o+3]=255;
    }
    ctx.putImageData(img,0,0);
    images.set(c,{canvas:cv, x0:g.x0-pas/2, y0:g.y0-pas/2,
                  w:nx*pas, h:ny*pas});
  }
  return images.size?{images:images, vmin:vmin, vmax:vmax, quoi:g.cle}:null;
}

/* Reconstruire pour une autre grandeur. Le calcul n'est pas refait : les trois
   tableaux arrivent ensemble, changer de carte ne coûte qu'une image. */
function simDCRepeindre(quoi){
  SIM.dcQuoi=simDCGrandeur(quoi).cle;
  SIM.dcImages=(SIM.resDC&&SIM_ED&&SIM_ED.canevasHorsEcran)
    ? simDCConstruireImages(SIM.resDC,SIM_ED.canevasHorsEcran,SIM.dcQuoi)
    : null;
  if(SIM_ED&&SIM_ED.redessiner)SIM_ED.redessiner();
}

/* Le tracé, appelé par le canevas des deux outils. `couche` est le rang de
   cuivre à montrer — celui que l'outil affiche. */
function simDCTrace(c,couche){
  if(!simDCActif())return;
  const e=SIM.dcImages.images.get(couche);
  if(!e)return;
  c.save();
  c.globalAlpha=0.85;
  /* PAS DE LISSAGE : un carreau de trame est un carreau, et l'interpoler
     inventerait un dégradé entre deux nœuds qui n'ont rien entre eux. */
  c.imageSmoothingEnabled=false;
  /* EN COORDONNÉES MONDE, et rien d'autre. Le rectangle va de (x0, y0) à
     (x0+w, y0+h) du monde ; la transformation du canevas — qui n'est pas la
     même dans les deux outils — le pose ensuite où il faut à l'écran. */
  try{c.drawImage(e.canvas,e.x0,e.y0,e.w,e.h);}catch(_){}
  c.restore();
}


/* ===========================================================================
   LA SONDE : LA VALEUR SOUS LE CURSEUR

   POURQUOI ELLE MANQUAIT. Une carte de chaleur montre OÙ, jamais COMBIEN : on
   voit que ça chauffe là, sans savoir si c'est deux degrés ou quarante. Le
   tableau donne le pire point de chaque net, et c'est tout — pour tout le
   reste il fallait deviner à la couleur. Or ce qu'on veut savoir devant une
   carte, c'est « et ICI, ça fait combien ».

   ELLE NE LIT PAS L'IMAGE, ELLE LIT LE RÉSULTAT. Repasser par le pixel peint
   ferait relire une couleur pour en redéduire un nombre — deux conversions,
   deux arrondis, et une valeur qui ne serait plus celle du solveur. On va
   chercher le NŒUD, et on rend SA valeur.

   HORS DU CUIVRE, RIEN. Pas de zéro, pas de valeur du voisin le plus proche :
   il n'y a pas de conducteur là, donc il n'y a pas de valeur. Inventer la plus
   proche, c'est ce que fait la grille interpolée du serveur, et c'est
   précisément ce qu'on a refusé de peindre.
   ========================================================================== */

/* La table du carreau vers le nœud. Les nœuds sont posés sur une grille de pas
   `res.pas` ancrée au coin du maillage : on indexe donc par le rang du carreau
   et non par la coordonnée, qui ne se compare pas au flottant près. */
function simDCIndexer(res){
  if(!res||!res.noeuds||!res.noeuds.length)return null;
  const pas=res.pas||0.2;
  let xmin=Infinity, ymin=Infinity;
  for(const n of res.noeuds){
    if(n[0]<xmin)xmin=n[0];
    if(n[1]<ymin)ymin=n[1];
  }
  const table=new Map();
  res.noeuds.forEach((n,i)=>{
    table.set(n[2]+"|"+Math.round((n[0]-xmin)/pas)+"|"+
              Math.round((n[1]-ymin)/pas), i);
  });
  return {table:table, xmin:xmin, ymin:ymin, pas:pas};
}

/* Le nœud sous un point du monde, ou -1. */
function simDCNoeudEn(x,y,couche){
  const ix=SIM.dcIndex;
  if(!ix)return -1;
  const k=couche+"|"+Math.round((x-ix.xmin)/ix.pas)+"|"+
          Math.round((y-ix.ymin)/ix.pas);
  const i=ix.table.get(k);
  return (i===undefined)?-1:i;
}

/* Ce que la sonde affiche. Rend null hors du cuivre. */
function simDCLireEn(x,y,couche){
  if(!SIM.resDC||!SIM.dcIndex)return null;
  const i=simDCNoeudEn(x,y,couche);
  if(i<0)return null;
  const g=simDCGrandeur(SIM.dcQuoi);
  const v=(SIM.resDC[g.cle]||[])[i];
  if(v===undefined)return null;
  return {rang:i, valeur:v,
          texte:simNb(v*g.facteur,g.dec)+" "+g.unite,
          x:SIM.resDC.noeuds[i][0], y:SIM.resDC.noeuds[i][1]};
}

/* Le survol, appelé par l'outil. Rend VRAI quand l'affichage a changé — c'est
   ce qui évite de redessiner toute la carte à chaque pixel parcouru. */
function simDCSurvol(x,y,couche){
  if(!simDCActif()){
    if(!SIM.dcSonde)return false;
    SIM.dcSonde=null;
    return true;
  }
  const lu=simDCLireEn(x,y,couche);
  const avant=SIM.dcSonde;
  if(!lu){
    if(!avant)return false;
    SIM.dcSonde=null;
    return true;
  }
  /* On ne redessine que si on a changé de CARREAU : bouger de trois pixels
     dans le même carreau ne change rien à ce qui est écrit. */
  if(avant&&avant.rang===lu.rang)return false;
  SIM.dcSonde=lu;
  return true;
}

/* L'étiquette, en pixels d'écran et non en millimètres : un texte qui grandit
   au zoom devient illisible de près et minuscule de loin. `w2s` est celle de
   l'outil — c'est lui qui sait où le monde tombe sur son canevas. */
function simDCTraceSonde(c,dpr,w2s){
  const s=SIM.dcSonde;
  if(!s||!simDCActif()||typeof w2s!=="function")return;
  const p=w2s(s.x,s.y);
  if(!p||!isFinite(p.x)||!isFinite(p.y))return;
  const txt=s.texte;
  c.save();
  c.setTransform(dpr||1,0,0,dpr||1,0,0);
  c.font="12px ui-monospace, Menlo, Consolas, monospace";
  const l=c.measureText(txt).width, h=18, m=6;
  /* L'étiquette se pose EN HAUT À DROITE du curseur, et bascule quand elle
     sortirait du canevas : une bulle coupée au bord ne se lit pas. */
  let x=p.x+12, y=p.y-h-8;
  const W=(c.canvas.width||0)/(dpr||1), H=(c.canvas.height||0)/(dpr||1);
  if(W&&x+l+2*m>W)x=p.x-12-l-2*m;
  if(y<2)y=p.y+12;
  if(H&&y+h>H)y=H-h-2;
  c.fillStyle="rgba(18,20,24,0.92)";
  c.strokeStyle="rgba("+simDCCouleur(0.5).join(",")+",0.9)";
  c.lineWidth=1;
  if(c.roundRect){c.beginPath();c.roundRect(x,y,l+2*m,h,4);c.fill();c.stroke();}
  else{c.fillRect(x,y,l+2*m,h);c.strokeRect(x,y,l+2*m,h);}
  c.fillStyle="#e6e8ec";
  c.textAlign="left"; c.textBaseline="middle";
  c.fillText(txt,x+m,y+h/2+0.5);
  /* Un point sur le carreau lu : sans lui, on ne sait pas de QUEL carreau
     l'étiquette parle quand le curseur est entre deux. */
  c.beginPath();
  c.arc(p.x,p.y,2.5,0,2*Math.PI);
  c.fillStyle="rgba("+simDCCouleur(1).join(",")+",1)";
  c.fill();
  c.restore();
}

/* L'échelle, en toutes lettres sous le tableau : une teinte sans son échelle
   ne se lit pas. */
function simDCEchelle(){
  if(!SIM.dcImages)return '';
  const g=simDCGrandeur(SIM.dcImages.quoi);
  const bas=SIM.dcImages.vmin*g.facteur, haut=SIM.dcImages.vmax*g.facteur;
  return '<p class="pnl-note"><b>'+simEsc(g.nom)+'</b> peint sur le cuivre : '+
         'du <b>cyan</b> ('+simNb(bas,g.dec)+' '+g.unite+') à l\'<b>ambre</b> ('+
         simNb(haut,g.dec)+' '+g.unite+'). Un carreau de trame par pixel — '+
         'hors du cuivre, rien n\'est peint.<br>'+simEsc(g.aide)+'</p>';
}

/* CE QUE L'ONGLET DIT QUAND IL N'A RIEN À CALCULER. Trois états distincts, et
   les confondre serait mentir sur l'un des trois :
     · l'outil ne sait pas fournir le cuivre — c'est un manque de l'outil ;
     · le serveur n'a pas le solveur — c'est un manque d'installation ;
     · l'utilisateur n'a rien désigné — c'est à lui de jouer.

   ELLE REND UNE CHAÎNE, comme toutes les analyses du registre : c'est
   `simRendre` qui la pose dans la zone de sortie. Cette fonction-ci écrivait
   dans un `<div>` à elle et ne rendait RIEN — donc `simRendre` posait
   `undefined` dans la zone de sortie, et le mot s'affichait sous le panneau.
   Les essais ne l'ont pas vu : ils appelaient `simRendreDC` directement, où
   la valeur de retour ne gêne personne. C'est le CONTRAT du registre qui
   n'était pas tenu, et c'est lui qu'un cas vérifie désormais. */
function simRendreDC(){
  const btn=simEl("simDCGo");

  if(!(SIM_ED&&typeof SIM_ED.cuivreDC==="function")){
    if(btn)btn.disabled=true;
    for(const id of ["simDCAddSrc","simDCAddRef","simDCRaz"]){
      const b=simEl(id);
      if(b)b.disabled=true;
    }
    const l=simEl("simDCListe");
    if(l)l.innerHTML="";
    return '<p class="simEtat">Le solveur de chute continue existe et '+
      'est vérifié (<code>python/dc_solver.py</code>), mais '+
      (SIM_ED&&SIM_ED.outil?'<b>'+SIM_ED.outil+'</b>':'cet outil')+
      ' ne sait pas encore lui livrer le cuivre à analyser.</p>';
  }
  if(btn)btn.disabled=false;

  /* LES BORNES, RELUES À CHAQUE FOIS. Le panneau n'en garde pas de copie :
     une pastille effacée entre deux calculs doit disparaître d'ici, pas y
     rester comme un souvenir. */
  simRendreBornes();
  const bornes=(SIM_ED.dcBornes?SIM_ED.dcBornes():[])||[];
  const nSrc=bornes.filter(b=>b.role==="source").length;
  const nCharge=bornes.filter(b=>b.role==="charge").length;

  if(SIM.occupeDC)
    return '<p class="simEtat">Le solveur travaille…<br><small>Un réseau '+
      'résistif sur tout le cuivre du net, puis un gradient conjugué.</small></p>';
  if(SIM.erreurDC)
    return '<p class="simErr">'+simEsc(SIM.erreurDC)+'</p>';
  if(!SIM.resDC){
    return '<p class="simEtat">'+
      (nSrc&&nCharge
        ? 'Pas encore de calcul.'
        : (!nSrc?'Il manque une <b>source</b> — l\'alimentation, dont on '+
                 'règle la tension.'
                :'Il manque une <b>charge</b> — un consommateur, dont on '+
                 'règle le courant.')+
          '<br>Tout le cuivre de leur net part au solveur : pistes, plans, '+
          'pastilles et vias, sur toutes les couches.')+'</p>';
  }

  const res=SIM.resDC;
  let html=simTableauBornes(res);
  const ch=res.chute_par_net||{};
  const cour=res.courant_par_net||{};
  const refs=res.reference_nets||[];
  html+='<table class="pnl-tab"><tr><th>Net</th><th>Courant</th>'+
        '<th>Chute</th></tr>';
  Object.keys(ch).sort().forEach(net=>{
    const i=cour[net]||0;
    /* Un net de RÉFÉRENCE est tenu à sa tension : sa « chute » est celle du
       cuivre entre ses points d'ancrage, ce qui n'est pas la même grandeur
       que la chute d'un net alimenté. On le marque plutôt que de laisser
       lire les deux dans la même colonne. */
    const ref=refs.indexOf(net)>=0?' <span class="pnl-u">(réf.)</span>':'';
    html+='<tr><td>'+simEsc(net)+ref+'</td>'+
          '<td>'+(i?simNb(i,3)+' A':'—')+'</td>'+
          '<td>'+simNb(ch[net]*1e3,2)+' mV</td></tr>';
  });
  html+='</table>';
  html+=simTableauPire(res);
  html+=simTableauVias(res);
  html+=simDCEchelle();
  html+=simDCCuivrePris(res);
  (res.avertissements||[]).forEach(a=>{
    html+='<p class="pnl-note">'+simEsc(a)+'</p>';
  });
  return html;
}




/* ===========================================================================
   CE QUI A ÉTÉ ANALYSÉ, ET AVEC QUELLE FINESSE

   POURQUOI LE DIRE. Le panneau prend tout le cuivre du net des bornes — ses
   pistes, ses pastilles, SES PLANS, sur TOUTES les couches, plus les vias et
   les tubes qui les relient. C'est ce qu'on veut, mais rien à l'écran ne le
   montrait : on ne pouvait pas savoir si le plan de masse était dedans ou si
   seule la piste avait été prise. Un chiffre dont on ignore l'assiette ne se
   vérifie pas.

   ET LA TRAME AVEC. Elle n'est plus un réglage : elle se déduit de la forme la
   plus étroite. Le dire, c'est permettre de la contester — « 0,037 mm parce
   que ta piste la plus fine fait 0,15 » se discute, « trame 0,2 » ne se
   discute pas.
   ========================================================================== */
function simDCCuivrePris(res){
  const f=SIM.dcFinesse;
  let h='<p class="pnl-note">';
  if(f){
    h+='<b>Cuivre analysé</b> : '+f.formes+' forme(s) sur '+f.couches+
       ' couche(s)'+(f.trous?', '+f.trous+' découpe(s) retirée(s)':'')+
       ', tout le cuivre du net — pistes, pastilles et plans compris.<br>';
    h+='<b>Trame</b> : '+simNb(res.pas,4)+' mm, '+
       (f.impose
         ? 'que vous avez imposée'
         : 'choisie pour que la forme la plus étroite ('+simNb(f.mini,3)+
           ' mm) reçoive '+simNb(f.mini/res.pas,1)+' carreaux')+'.<br>';
  }else{
    h+='<b>Trame</b> : '+simNb(res.pas,4)+' mm.<br>';
  }
  h+=res.n_noeuds+' nœuds, '+res.n_aretes+' liaisons, '+res.n_vias+
     ' trou(s) métallisé(s) relié(s).</p>';
  if(f&&f.note)h+='<p class="pnl-note">'+simEsc(f.note)+'</p>';
  return h;
}

/* ===========================================================================
   CE QUI ARRIVE À CHAQUE BORNE

   C'EST LE TABLEAU QU'ON VIENT LIRE, et il passe donc en premier. La question
   posée à ce calcul n'est pas « quelle est la chute du net » — elle n'a de
   sens qu'avec un seul consommateur — mais « j'ai 3,3 V au régulateur, combien
   en reste-t-il à CE composant-là ». Dès qu'un rail en nourrit plusieurs, ce
   que chacun voit dépend de ce que tirent les autres, et seul un tableau par
   borne le dit.

   LE SIGNE DU COURANT. Une charge TIRE : son courant sort du cuivre, donc il
   est négatif dans la convention du solveur. On l'écrit en valeur absolue —
   « 1,5 A » se lit, « −1,5 A » fait douter.
   ========================================================================== */
function simTableauBornes(res){
  const bornes=(res&&res.bornes)||[];
  if(!bornes.length)return '';
  const alims=bornes.filter(b=>b.role==="tension");
  const charges=bornes.filter(b=>b.role==="courant");
  let html='<table class="pnl-tab"><tr><th>Borne</th><th>Réglage</th>'+
           '<th>Tension</th><th>Perdu</th></tr>';
  const ligne=(b,src)=>{
    html+='<tr><td>'+simEsc(b.repere||"—")+
          ' <span class="pnl-u">'+(src?"source":"charge")+'</span></td>'+
          '<td>'+(src?simNb(b.consigne,3)+' V'
                     :simNb(Math.abs(b.consigne),3)+' A')+'</td>'+
          '<td>'+simNb(b.tension,4)+' V</td>'+
          '<td>'+(src?'—':('−'+simNb(b.chute*1e3,2)+' mV'))+'</td></tr>';
  };
  alims.forEach(b=>ligne(b,true));
  charges.forEach(b=>ligne(b,false));
  html+='</table>';
  if(charges.length){
    /* LA PIRE CHARGE, dite en une phrase : c'est la décision qu'on prend en
       lisant ce panneau, et la faire chercher dans dix lignes est une perte
       de temps. */
    const pire=charges.reduce((a,b)=>(b.chute>a.chute?b:a));
    const ref=alims.length?alims[0].consigne:0;
    html+='<p class="pnl-note">La charge la plus mal servie est <b>'+
          simEsc(pire.repere||"—")+'</b> : il lui arrive '+
          simNb(pire.tension,4)+' V, soit '+simNb(pire.chute*1e3,2)+
          ' mV de moins qu\'à la source'+
          (ref?' ('+simNb(100*pire.chute/ref,2)+' %)':'')+'.</p>';
  }
  return html;
}

/* ===========================================================================
   LE PIRE POINT DE CHAQUE NET

   POURQUOI CE TABLEAU EST LE PLUS UTILE DES TROIS. La chute dit ce qu'on perd,
   et c'est ce qu'on vient chercher. Mais une piste peut tenir sa chute et
   fondre quand même — c'est la SECTION qui chauffe, pas la longueur —, et
   c'est ici qu'on le voit : sur un rétrécissement de deux millimètres, mesuré,
   la chute monte de 6 % et la température TRIPLE.

   LES DEUX CHIFFRES NE SE LISENT PAS PAREIL, et le tableau doit le dire.
   L'ÉCHAUFFEMENT est un chiffre : il vient d'un flux à travers une coupe, il
   ne bouge pas quand on raffine la trame. La DENSITÉ de pointe, elle, est
   singulière à un angle vif — son maximum croît sans borne au raffinement
   (93,7 puis 104,4 puis 129,3 A/mm² aux pas 0,2 / 0,1 / 0,05 sur la même
   géométrie). Elle dit OÙ regarder, jamais COMBIEN.
   ========================================================================== */
function simTableauPire(res){
  const pires=res&&res.pire_par_net;
  if(!pires||!Object.keys(pires).length)return '';
  let html='<table class="pnl-tab"><tr><th>Net</th><th>Échauffement</th>'+
           '<th>Section</th><th>Densité de pointe</th></tr>';
  for(const net of Object.keys(pires).sort()){
    const p=pires[net];
    const ou=p.echauffement_en
      ? " en "+simNb(p.echauffement_en[0],2)+" ; "+
        simNb(p.echauffement_en[1],2)+" mm, couche "+(p.echauffement_en[2]+1)
      : "";
    html+='<tr><td>'+simEsc(net)+'</td>'+
          '<td title="'+simEsc("Le plus chaud"+ou)+'">+'+
          simNb(p.echauffement,2)+' K</td>'+
          '<td>'+simNb(p.largeur_chaude,2)+' mm</td>'+
          '<td title="'+simEsc("Maximum ponctuel : il dit où regarder, pas "+
            "combien. À un angle vif il croît quand on affine la trame.")+
          '">'+simNb(p.densite,1)+' A/mm²</td></tr>';
  }
  html+='</table>';
  if(res.modele_thermique)
    html+='<p class="pnl-note">'+simEsc(res.modele_thermique)+
          ' Couche(s) prise(s) pour extérieure(s) : '+
          ((res.couches_externes||[]).map(c=>c+1).join(", ")||"aucune")+
          '.</p>';
  return html;
}

/* ===========================================================================
   CE QUE CHAQUE VIA A PORTÉ

   POURQUOI CE TABLEAU EXISTE, ET PAS SEULEMENT UN COMPTE. « 12 vias » ne dit
   rien : ce qu'on veut savoir, c'est si l'UN d'eux prend la moitié du courant
   pendant que les onze autres se reposent. C'est ce chiffre-là, et lui seul,
   qui décide d'en ajouter un — et il ne se devine pas de la géométrie, parce
   qu'il dépend de tout le reste du cuivre.

   LES PLUS CHARGÉS EN TÊTE : le serveur les rend déjà triés, et c'est le seul
   ordre qui ne demande pas de relire tout le tableau. Au-delà de quinze on
   s'arrête, en disant combien restent : une liste de deux cents lignes dans un
   panneau latéral n'est pas une lecture, c'est un déversement.

   UN VIA NON RELIÉ EST MONTRÉ QUAND MÊME, et marqué. Il est dans la carte, il
   n'est pas dans le calcul : le passer sous silence laisserait croire que le
   résultat porte sur la carte entière.
   ========================================================================== */
const SIM_DC_VIAS_MAX=15;
function simTableauVias(res){
  const vias=(res&&res.vias)||[];
  if(!vias.length)
    return '<p class="pnl-note">Aucun via sur ce net : tout le courant reste '+
           'sur une seule couche.</p>';

  const relies=vias.filter(v=>v.relie);
  let html='<table class="pnl-tab"><tr><th>Via</th><th>Couches</th>'+
           '<th>Courant</th><th>Chute</th><th>R</th></tr>';
  vias.slice(0,SIM_DC_VIAS_MAX).forEach(v=>{
    if(!v.relie){
      html+='<tr><td>'+simEsc(v.repere||"—")+'</td>'+
            '<td>'+(v.couche_a+1)+'→'+(v.couche_b+1)+'</td>'+
            '<td colspan="3"><span class="pnl-u">hors calcul — '+
            simEsc(v.motif||"non relié")+'</span></td></tr>';
      return;
    }
    /* Le courant en MILLIAMPÈRES sous l'ampère : « 0,043 A » se lit mal, et
       c'est précisément dans cette plage que se tiennent les vias qui ne
       travaillent pas. */
    const i=Math.abs(v.courant);
    const ia=(i>=1)?simNb(i,3)+' A':simNb(i*1e3,1)+' mA';
    html+='<tr><td title="'+simEsc('en '+simNb(v.x,3)+' ; '+simNb(v.y,3)+
          ' mm')+'">'+simEsc(v.repere||"—")+'</td>'+
          '<td>'+(v.couche_a+1)+'→'+(v.couche_b+1)+'</td>'+
          '<td>'+ia+'</td>'+
          '<td>'+simNb(v.chute*1e3,3)+' mV</td>'+
          '<td>'+simNb(v.resistance*1e3,3)+' mΩ</td></tr>';
  });
  html+='</table>';
  if(vias.length>SIM_DC_VIAS_MAX)
    html+='<p class="pnl-note">'+(vias.length-SIM_DC_VIAS_MAX)+
          ' via(s) de plus, moins chargés que ceux-ci.</p>';

  html+=simDesequilibreVias(relies);
  return html;
}

/* LE DÉSÉQUILIBRE, dit en une phrase — mais dit JUSTE.

   LE PIÈGE, ET IL EST GROS. Sommer le courant de tous les vias pour en tirer
   une part ne vaut QUE si les vias sont en PARALLÈLE. Or ils ne le sont pas
   tous : le tube d'une pastille traversante est une CHAÎNE de liaisons entre
   couches voisines, qui portent toutes le même courant l'une après l'autre.
   La première version les sommait quand même et annonçait « le plus chargé
   porte 25 % » là où un seul chemin portait la totalité — un chiffre
   rassurant, et faux.

   Ce qu'on compare, ce sont donc les vias qui relient LE MÊME COUPLE DE
   COUCHES : ceux-là sont bien en parallèle, et c'est exactement la question
   qu'on se pose — « mes quatre vias de retour travaillent-ils autant ? ». */
function simDesequilibreVias(relies){
  const groupes=new Map();
  for(const v of relies){
    const a=Math.min(v.couche_a,v.couche_b), b=Math.max(v.couche_a,v.couche_b);
    const cle=a+"-"+b;
    if(!groupes.has(cle))groupes.set(cle,[]);
    groupes.get(cle).push(Math.abs(v.courant));
  }
  let pire=null;
  for(const [cle,cs] of groupes){
    if(cs.length<2)continue;
    const tot=cs.reduce((x,y)=>x+y,0);
    if(!(tot>0))continue;
    const part=100*Math.max.apply(null,cs)/tot;
    if(!pire||part>pire.part)
      pire={cle:cle, part:part, n:cs.length};
  }
  if(!pire)return '';
  const c=pire.cle.split("-");
  return '<p class="pnl-note">Entre les couches '+(+c[0]+1)+' et '+(+c[1]+1)+
         ', '+pire.n+' vias se partagent le passage : le plus chargé en prend '+
         simNb(pire.part,1)+' %, contre '+simNb(100/pire.n,1)+
         ' % s\'ils travaillaient à parts égales.</p>';
}

async function simDCLancer(){
  if(SIM.occupeDC)return;
  const btn=simEl("simDCGo");
  SIM.occupeDC=true;
  SIM.erreurDC="";
  if(btn)btn.disabled=true;
  try{
    /* CHAQUE BORNE PORTE SA VALEUR : le panneau la lui a posée, l'adaptateur
       la garde avec la pastille. Il ne reste ici qu'à vérifier qu'une charge
       tire bien quelque chose — sans courant, tout le cuivre est à la tension
       de la source et la chute est nulle par construction, ce qui se lirait
       comme une bonne nouvelle.

       CE BLOC ETAIT RESTE SUR LES DEUX CHAMPS D'ORIGINE, `simDCI` et
       `simDCU`, disparus du panneau quand les bornes sont devenues une liste.
       `parseFloat(undefined)` rend NaN, donc le bouton « Calculer » refusait
       TOUJOURS — et aucun essai ne l'a vu, parce qu'aucun n'exerçait cette
       fonction. C'est pour cela que le contrôle de câblage la lit désormais
       elle aussi. */
    const bornes=(SIM_ED.dcBornes?SIM_ED.dcBornes():[])||[];
    const total=bornes.filter(b=>b.role==="charge")
                      .reduce((x,b)=>x+Math.abs(+b.valeur||0),0);
    if(!(total>0)){
      SIM.erreurDC="Aucune charge ne tire de courant.\nPosez l'ampérage que "+
                   "consomme chaque charge : sans courant, tout le cuivre est "+
                   "à la tension de la source, et la chute est nulle par "+
                   "construction. C'est juste, et ça ne dit rien.";
      SIM.resDC=null; SIM.dcImages=null; SIM.dcFinesse=null; SIM.dcIndex=null; SIM.dcSonde=null;
      return;
    }
    const probleme=SIM_ED.cuivreDC();
    if(!probleme||probleme.erreur){
      SIM.erreurDC=((probleme&&probleme.erreur)||"Rien à analyser.")+
                   (probleme&&probleme.conseil?"\n"+probleme.conseil:"");
      SIM.resDC=null; SIM.dcImages=null; SIM.dcFinesse=null; SIM.dcIndex=null; SIM.dcSonde=null;
      return;
    }
    /* LA FINESSE : celle qu'on a écrite, sinon celle que le cuivre impose. */
    const fin=simDCFinesse(probleme.polygones);
    const saisi=parseFloat(String((simEl("simDCPas")||{}).value||"")
                             .replace(",","."));
    const pas=(saisi>0)?saisi:(fin?fin.pas:0);
    SIM.dcFinesse=fin?Object.assign({},fin,{choisi:pas,
                                            impose:(saisi>0)}):null;
    SIM.resDC=await simDCCalculer({
      format:SIM_DC_FORMAT,
      polygones:probleme.polygones||[],
      vias:probleme.vias||[],
      sources:probleme.sources||[],
      references:probleme.references||[],
      couches_externes:probleme.couches_externes,
      pas:(pas>0?pas:(probleme.pas||undefined))
    });
    /* LES IMAGES SE CONSTRUISENT ICI, une fois — pas à chaque redessin. Le
       canevas hors écran vient de l'outil : c'est lui qui sait comment en
       fabriquer un (un navigateur, un banc d'essai, ce n'est pas le même). */
    SIM.dcImages=(SIM_ED.canevasHorsEcran)
      ? simDCConstruireImages(SIM.resDC,SIM_ED.canevasHorsEcran,SIM.dcQuoi)
      : null;
    SIM.dcIndex=simDCIndexer(SIM.resDC);
    SIM.dcSonde=null;
    if(SIM_ED.peindreDC)SIM_ED.peindreDC(SIM.resDC);
    if(SIM_ED.redessiner)SIM_ED.redessiner();
  }catch(e){
    SIM.resDC=null; SIM.dcImages=null; SIM.dcFinesse=null; SIM.dcIndex=null; SIM.dcSonde=null;
    SIM.erreurDC=(e&&e.message)||String(e);
  }finally{
    SIM.occupeDC=false;
    if(btn)btn.disabled=false;
    simRendre();
  }
}

/* Le transport. Même forme que `simLancerCalcul` : le refus du serveur arrive
   en JSON sous « detail », et c'est CE texte qu'il faut montrer — il dit le
   motif et ce qu'il faut changer. Rendre le corps brut afficherait une page
   d'erreur HTTP à la place de la phrase utile. */
async function simDCCalculer(doc){
  const rep=await fetch((SIM_BASE||"")+SIM_DC_ROUTE,{
    method:"POST",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify(doc)
  });
  let corps=null;
  try{corps=await rep.json();}catch(e){corps=null;}
  if(!rep.ok)
    throw new Error((corps&&corps.detail)||("Le serveur a refusé le calcul ("+
                    rep.status+")."));
  return corps;
}

/* LES PAGES ANNONCAIENT ENCORE « -1 » PENDANT QUE LE SERVEUR EN ETAIT A
   « -2 » : le serveur acceptait les deux, donc rien ne se voyait, et la
   version envoyee ne disait plus ce que le document contenait. Remis
   d'aplomb avec le passage a « -3 », qui ajoute la liste `vias`. */
const SIM_FORMAT="cao-sim-em-3";

let SIM_ED=null;                       // l'adaptateur de l'outil courant
let SIM_BASE=null;                     // racine retenue, "" = même origine
let SIM_ETAT=null;                     // réponse de la sonde : {dispo, limites…}

/* L'état du panneau.

   `objets` est la liste des objets de l'outil, dans l'ordre où ils ont été
   envoyés : `res.segments[i]` décrit `objets[i]`. C'est ce qui permet au
   canevas de peindre, et c'est pour cela que les deux listes ne sont jamais
   remplacées séparément.

   `suivre` s'arme au premier calcul réussi : à partir de là, changer de
   sélection relance tout seul. Avant, non — on ne lance pas de requête réseau
   dans le dos de quelqu'un qui n'a encore rien demandé. */
const SIM={
  ouvert:false, occupe:false, suivre:false,
  res:null, objets:[], doc:null, err:"", portee:"", notes:[],
  /* L'analyse DC a son propre etat : elle ne partage ni sa selection, ni son
     document, ni son verrou avec l'impedance. Les melanger ferait qu'un calcul
     de section en cours bloquerait un calcul de chute, et l'inverse. */
  resDC:null, occupeDC:false, erreurDC:"",
  /* Ce que le cuivre a imposé comme finesse de trame, et ce qu'il porte. */
  dcFinesse:null,
  /* Les images de la carte, une par couche, construites a l'arrivee du
     resultat et non a chaque rafraichissement. `dcQuoi` dit LAQUELLE des trois
     grandeurs elles portent. */
  dcImages:null, dcQuoi:"echauffement",
  /* LA SONDE : le carreau sous le curseur, et sa valeur. `dcIndex` est la
     table qui va du carreau au rang du noeud -- bâtie une fois à l'arrivée du
     résultat, parce qu'un survol ne peut pas se permettre de parcourir dix
     mille nœuds à chaque pixel. */
  dcIndex:null, dcSonde:null,
  /* La masse de référence : l'ensemble des nets qui comptent comme plan de
     retour. `refAuto` dit qu'on suit encore la proposition de l'outil — dès
     qu'on décoche une case, non, et le choix tient. `refCle` est la liste des
     candidats pour laquelle la proposition a été faite : elle change quand on
     ouvre une autre carte, et c'est ce qui remet la proposition en vigueur. */
  ref:null, refAuto:true, refCle:null,
  /* Ce que l'outil a mesuré de la COUTURE de vias et du cuivre voisin qui
     n'est pas de la masse. Ni l'un ni l'autre n'entre dans le calcul ; les deux
     disent si le calcul veut dire quelque chose. */
  couture:null, voisins:[],
  /* Où l'on se trouve dans le panneau : la famille, et l'analyse dedans. On
     démarre sur ce qui existe — SI, impédance —, parce qu'ouvrir un panneau
     sur une famille vide n'apprendrait rien à qui vient de cliquer. */
  famille:"si", analyse:"impedance",
  /* Les fréquences vivent EN HERTZ ici et jusqu'au serveur ; `unite` ne dit
     que dans quoi on les écrit et les relit à l'écran. Séparer les deux est
     tout l'objet de la liste déroulante : saisir 868 en croyant écrire des
     mégahertz alors que le champ attendait des gigahertz donnait une bande
     ramenée de force, des pertes fausses d'un facteur trois, et rien à
     l'écran pour le voir avant le calcul. */
  saisie:{f1:1e8, f2:5e9, points:21, fc:1e9, z0:50, cible:50, tolPct:10,
          /* TROIS UNITÉS. `unite` écrit f₀ ; `uniteBande1` et `uniteBande2` écrivent
             les deux bouts de la bande S. Elles étaient autrefois confondues,
             puis il y en a eu deux, et maintenant trois pour permettre "10 kHz -> 1 GHz".
             Tout circule en hertz de bout en bout. */
          unite:"GHz", uniteBande1:"GHz", uniteBande2:"GHz"}
};

/* Les unités offertes, du hertz au gigahertz. Elles ne changent RIEN au
   calcul : elles multiplient ce qu'on tape et divisent ce qu'on relit. */
const SIM_UNITES=[
  {cle:"Hz",  f:1},
  {cle:"kHz", f:1e3},
  {cle:"MHz", f:1e6},
  {cle:"GHz", f:1e9}
];
function simUnite(){
  return SIM_UNITES.find(u=>u.cle===SIM.saisie.unite)||SIM_UNITES[3];
}
/* Les unités de la bande S. LE REPLI SE FAIT EN CASCADE :
   un état d'avant la séparation en trois porte `uniteBande`, on retombe
   dessus, puis sur `unite`. */
function simUniteBande1(){
  const cle=SIM.saisie.uniteBande1||SIM.saisie.uniteBande||SIM.saisie.unite;
  return SIM_UNITES.find(u=>u.cle===cle)||simUnite();
}
function simUniteBande2(){
  const cle=SIM.saisie.uniteBande2||SIM.saisie.uniteBande||SIM.saisie.unite;
  return SIM_UNITES.find(u=>u.cle===cle)||simUnite();
}

function simEsc(s){
  return String(s==null?"":s).replace(/&/g,"&amp;").replace(/</g,"&lt;")
    .replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}
function simEl(id){return document.getElementById(id);}
/* Virgule décimale, comme partout ailleurs dans les deux outils. */
function simNb(v,dec){
  if(!isFinite(v))return "—";
  return Number(v).toFixed(dec==null?2:dec).replace(".",",");
}
/* Une fréquence se lit en GHz au-dessus du gigahertz, en MHz en dessous : une
   bande 100 MHz – 5 GHz écrite tout en hertz est illisible. */
function simFreq(hz){
  if(hz>=1e9)return simNb(hz/1e9,3)+" GHz";
  if(hz>=1e6)return simNb(hz/1e6,1)+" MHz";
  return simNb(hz/1e3,1)+" kHz";
}
/* Un retard se compte en picosecondes sur une carte, en nanosecondes sur une
   longue liaison. */
function simRetard(s){
  const ps=s*1e12;
  return ps>=1000?simNb(ps/1000,3)+" ns":simNb(ps,1)+" ps";
}
function simDb(c){
  const m=Math.hypot(c[0],c[1]);
  return m>1e-15?20*Math.log10(m):SIM_PLANCHER;
}
const SIM_PLANCHER=-300;

/* ==========================================================================
   La carte de chaleur : trois couleurs, et ce qu'elles veulent dire
   --------------------------------------------------------------------------
     · BLEU   — dans la tolérance. C'est la cible, et la seule couleur qui ne
                dit rien à corriger ;
     · ROUGE  — au-dessus. La piste est trop étroite, ou trop loin de son plan ;
     · VERT   — en dessous. La piste est trop large, ou trop près de son plan.

   Le vert ne veut donc PAS dire « bon » ici : il veut dire « trop bas ». C'est
   contraire à l'habitude, et c'est assumé — sur une carte de chaleur ce sont
   les deux sens de l'écart qu'il faut distinguer d'un coup d'œil, pas le bien
   du mal. La légende du panneau le redit en toutes lettres, parce qu'un
   lecteur qui n'a pas lu ce commentaire lira « vert = correct ».

   La CLARTÉ porte l'écart : pâle en bord de bande, pleine une tolérance plus
   loin. La TEINTE, elle, ne bouge pas — une piste hors bande est rouge, plus
   ou moins soutenu, jamais autre chose. Interpoler depuis le bleu, comme on
   l'a d'abord fait, donnait du mauve d'un côté et du turquoise de l'autre :
   deux teintes qui ne se lisent ni comme du rouge, ni comme du vert.
   ========================================================================== */
const SIM_Z_BLEU =[ 63,160,234];
const SIM_Z_ROUGE=[232, 68, 58];
const SIM_Z_VERT =[ 76,195,138];
const SIM_Z_ROUGE_PALE=[244,166,161];
const SIM_Z_VERT_PALE =[168,225,199];

/* La tolérance en ohms. Un plancher d'un dixième d'ohm : une tolérance nulle
   peindrait toute la carte, y compris le tronçon qui tombe pile. */
function simZTolAbs(){
  return Math.max(0.1, SIM.saisie.cible*SIM.saisie.tolPct/100);
}
/* -1 trop bas, 0 dans la bande, +1 trop haut. */
function simZVerdict(z0){
  const t=simZTolAbs(), d=z0-SIM.saisie.cible;
  return d>t?1:(d<-t?-1:0);
}
function simZCouleur(z0,alpha){
  const a=(alpha==null)?1:alpha;
  if(!(z0>0))return "rgba(139,145,156,"+a+")";      // pas de valeur : gris
  const t=simZTolAbs(), d=z0-SIM.saisie.cible, v=simZVerdict(z0);
  if(v===0)return "rgba("+SIM_Z_BLEU.join(",")+","+a+")";
  const pale=v>0?SIM_Z_ROUGE_PALE:SIM_Z_VERT_PALE;
  const plein=v>0?SIM_Z_ROUGE:SIM_Z_VERT;
  const k=Math.min(1,(Math.abs(d)-t)/t);
  const c=pale.map((p,i)=>Math.round(p+(plein[i]-p)*k));
  return "rgba("+c.join(",")+","+a+")";
}
/* Le canevas des deux outils demande d'abord s'il y a quelque chose à peindre.
   Il faut un résultat ET les objets qui vont avec : peindre un résultat sur
   une sélection qui a changé montrerait la couleur d'une piste sur une autre.

   Il faut aussi que l'ANALYSE AFFICHÉE soit celle qui peint. La carte de
   chaleur d'impédance n'a rien à faire sur la carte pendant qu'on regarde
   l'onglet PI : elle répondrait à une question qui n'est plus posée. Le
   résultat n'est pas effacé pour autant — revenir sur l'onglet le retrouve. */
function simZActif(){
  const a=simAnalyse();
  return SIM.ouvert&&!!(a&&a.peint)&&!!SIM.res&&SIM.objets.length>0
         &&SIM.res.segments.length===SIM.objets.length;
}
/* Le tronçon i : son objet, son impédance, sa couleur. Un seul endroit fait
   l'appariement — le canevas et le tableau ne peuvent pas diverger. */
function simZSegment(i){
  if(!simZActif())return null;
  const s=SIM.res.segments[i];
  return s?{obj:SIM.objets[i], z0:s.z0, seg:s}:null;
}

/* ==========================================================================
   Trouver le serveur
   Même ordre que la visionneuse (01-api.js) : l'origine qui sert la page, puis
   le même hôte sur le port de serveur.py, puis 127.0.0.1 pour une page ouverte
   en file://. La sonde ne se fait qu'une fois par session.
   ========================================================================== */
function simCandidats(){
  const out=[], ajoute=function(v){if(v!==null&&out.indexOf(v)<0)out.push(v);};
  if(location.protocol==="http:"||location.protocol==="https:"){
    ajoute("");
    ajoute(location.protocol+"//"+location.hostname+":"+SIM_PORT);
  }
  ajoute("http://127.0.0.1:"+SIM_PORT);
  return out;
}
/* Le serveur répond {"detail": "…"}, et le détail porte parfois deux lignes —
   le refus, puis ce qu'il faut changer. */
async function simErreur(rep){
  let detail="";
  try{
    const j=await rep.json();
    detail=(j&&(j.detail||j.message))||"";
    if(typeof detail!=="string")detail=JSON.stringify(detail);
  }catch(e){}
  return detail||("HTTP "+rep.status);
}
async function simConnecter(){
  if(SIM_ETAT)return SIM_ETAT;
  const essais=[];
  for(const base of simCandidats()){
    try{
      const rep=await fetch(base+SIM_ROUTE,{headers:{Accept:"application/json"}});
      if(!rep.ok){essais.push((base||"cette page")+" : "+await simErreur(rep));continue;}
      const j=await rep.json();
      if(!j||!j.dispo){
        essais.push((base||"cette page")+" : "+
          ((j&&j.detail)||"solveur absent")+((j&&j.conseil)?"\n  "+j.conseil:""));
        continue;
      }
      SIM_BASE=base; SIM_ETAT=j;
      return SIM_ETAT;
    }catch(e){
      essais.push((base||"cette page")+" : "+(e.message||"injoignable"));
    }
  }
  throw new Error("Aucun serveur pour calculer.\n\n"+
    "Le solveur est en Python : lancez « python serveur.py » depuis le dossier "+
    "du dépôt, puis ouvrez cette page par l'adresse qu'il affiche. Il lui faut "+
    "numpy — « pip install numpy ».\n\n"+
    "Tentatives :\n  "+essais.join("\n  "));
}
/* Envoie le document et rend le résultat. Le corps est le JSON tel quel : la
   route ne lit pas de fichier et n'écrit rien sur le disque. */
async function simLancer(doc){
  await simConnecter();
  const rep=await fetch(SIM_BASE+SIM_ROUTE,{
    method:"POST", headers:{"Content-Type":"application/json"},
    body:JSON.stringify(doc)
  });
  if(!rep.ok)throw new Error(await simErreur(rep));
  const res=await rep.json();
  if(!res||!Array.isArray(res.segments))
    throw new Error("Réponse inattendue du serveur.");
  return res;
}

/* ==========================================================================
   Enregistrer
   ========================================================================== */
function simTelecharger(texte,nom,type){
  const b=new Blob([texte],{type:type||"application/json"});
  const u=URL.createObjectURL(b), a=document.createElement("a");
  a.href=u; a.download=nom; document.body.appendChild(a); a.click();
  document.body.removeChild(a);
  setTimeout(()=>URL.revokeObjectURL(u),1000);
}
/* Un nom de fichier qui tient sur tous les systèmes : le net s'y retrouve, mais
   « D+ » et « VCC/3V3 » n'ont rien à faire dans un nom de fichier. */
function simNomFichier(ext){
  const net=(SIM.res&&SIM.res.net)||(SIM.doc&&SIM.doc.net)||"";
  const carte=(SIM.res&&SIM.res.carte)||
              (SIM_ED&&SIM_ED.carte?SIM_ED.carte():"")||"carte";
  const propre=s=>String(s).replace(/[^\w.-]+/g,"_").replace(/^_+|_+$/g,"");
  return (propre(carte)||"carte")+(net?"-"+propre(net):"")+ext;
}

/* ==========================================================================
   La courbe des paramètres S
   Un SVG écrit à la main plutôt qu'un canevas : il se redimensionne avec le
   panneau sans qu'on ait à écouter quoi que ce soit. Trois traces, et le
   repère de la fréquence centrale, qui est l'endroit où l'impédance a été lue.

   DEUX TRACES, ET DEUX SEULEMENT. S₁₂ n'est pas tracé parce que le modèle est
   réciproque : S₁₂ vaut S₂₁ exactement, et une courbe qui en recouvre une
   autre n'apprend rien. S₂₂ l'a été un temps, au motif qu'une cascade de
   sections différentes ne se voit pas pareil des deux bouts — c'était vrai en
   théorie et nuisible en pratique : sur une piste de largeur constante, le cas
   ordinaire, S₂₂ égale S₁₁ au bit près et vient donc se peindre PAR-DESSUS,
   masquant la trace qu'on était venu lire. Une courbe qui cache l'information
   dans le cas courant pour la donner dans le cas rare est un mauvais échange.

   Quand la liaison est dissymétrique, l'écart S₂₂ − S₁₁ est signalé sous la
   courbe (`simDissymetrie`) : le fait est dit, sans coûter une trace. */
const SIM_TRACES=[
  {i:0, j:0, nom:"S11", couleur:"var(--yellow)"},
  {i:1, j:0, nom:"S21", couleur:"var(--blue)"}
];
function simTerme(res,k,i,j){
  const m=res.s[k], p=i*2+j;
  return (m&&m[p])?m[p]:[0,0];
}
/* Le repère du dernier tracé, gardé pour la lecture au survol : sans lui il
   faudrait redériver l'échelle à chaque mouvement de souris. */
let SIM_REPERE=null;

/* LA LARGEUR DU TRACÉ SUIT CELLE DU PANNEAU, et c'est un vrai défaut corrigé,
   pas un raffinement. Le SVG avait un viewBox fixe de 520 unités et un
   `preserveAspectRatio` : dans un panneau étroit il tenait bien, mais agrandi
   en plein écran il s'étirait tout entier — texte compris. Les cotes de 10 px
   devenaient des 30 px, « 100,0 MHz » barrait le bas de la fenêtre, et plus le
   panneau était grand moins la courbe était lisible. On dessine donc à la
   largeur réelle : les cotes gardent leur taille, la courbe gagne en détail.
   La hauteur, elle, ne bouge pas — une courbe de paramètres S n'a rien à
   gagner à être haute, et la fiche au-dessus a besoin de la place. */
function simLargeurTrace(){
  const box=simEl("simSortie");
  const w=box?box.clientWidth:0;
  return Math.round(Math.max(420,Math.min(1400,(w||540)-22)));
}

function simCourbe(res){
  if(!res||!res.freqs||res.freqs.length<2){SIM_REPERE=null;return "";}
  const W=simLargeurTrace(), H=170, mg={g:44,d:10,h:12,b:26};
  let hi=-1e9, lo=1e9;
  for(const t of SIM_TRACES)for(let k=0;k<res.freqs.length;k++){
    const v=simDb(simTerme(res,k,t.i,t.j));
    if(v>hi)hi=v; if(v<lo)lo=v;
  }
  if(!isFinite(hi)||!isFinite(lo)){hi=0;lo=-60;}
  if(hi-lo<6){hi+=3;lo-=3;}
  if(hi-lo>120)lo=hi-120;
  const f0=res.freqs[0], f1=res.freqs[res.freqs.length-1];
  const X=f=>mg.g+(W-mg.g-mg.d)*((f1>f0)?(f-f0)/(f1-f0):0.5);
  const Y=v=>mg.h+(H-mg.h-mg.b)*(1-(Math.max(lo,Math.min(hi,v))-lo)/(hi-lo));

  /* La quadrature de la bande est-elle assez fine pour la ligne qu'on regarde ?
     Une liaison résonne tous les 1/(2·retard) : sous une dizaine de points par
     période, la courbe rate ses creux et les relie à la règle — c'est
     exactement ce qui donne l'aspect anguleux, et le creux affiché est alors
     plus haut que le vrai. On le dit sous la courbe, avec le nombre à saisir. */
  SIM_REPERE={res:res, W:W, H:H, mg:mg, f0:f0, f1:f1, lo:lo, hi:hi};

  let svg='<svg class="simCourbe" viewBox="0 0 '+W+' '+H+'" '+
          'preserveAspectRatio="xMidYMid meet" role="img" '+
          'aria-label="Paramètres S en fonction de la fréquence">';
  for(let i=0;i<=3;i++){
    const v=lo+(hi-lo)*i/3, y=Y(v);
    svg+='<line class="simGrille" x1="'+mg.g+'" y1="'+y.toFixed(1)+
         '" x2="'+(W-mg.d)+'" y2="'+y.toFixed(1)+'"/>'+
         '<text class="simCote" x="'+(mg.g-6)+'" y="'+(y+3.5).toFixed(1)+
         '" text-anchor="end">'+simNb(v,0)+"</text>";
  }
  /* Le repère de la fréquence centrale : c'est là qu'a été lue l'impédance
     peinte sur la carte, et sans ce trait la courbe et la carte auraient l'air
     de parler de deux choses. */
  if(res.f_centre>=f0&&res.f_centre<=f1){
    const x=X(res.f_centre);
    svg+='<line class="simFc" x1="'+x.toFixed(1)+'" y1="'+mg.h+
         '" x2="'+x.toFixed(1)+'" y2="'+(H-mg.b)+'"/>'+
         '<text class="simCote simFcTxt" x="'+(x+4).toFixed(1)+'" y="'+
         (mg.h+9)+'">f₀</text>';
  }
  svg+='<text class="simCote" x="'+mg.g+'" y="'+(H-8)+'">'+simFreq(f0)+"</text>"+
       '<text class="simCote" x="'+(W-mg.d)+'" y="'+(H-8)+
       '" text-anchor="end">'+simFreq(f1)+"</text>"+
       '<text class="simCote simUnite" x="4" y="'+(mg.h+4)+'">dB</text>';
  for(const t of SIM_TRACES){
    let d="";
    for(let k=0;k<res.freqs.length;k++)
      d+=(k?"L":"M")+X(res.freqs[k]).toFixed(1)+" "+
         Y(simDb(simTerme(res,k,t.i,t.j))).toFixed(1);
    svg+='<path class="simTrace" d="'+d+'" stroke="'+t.couleur+'"/>';
  }
  /* Le curseur de lecture : un trait, un point par trace. Il est posé caché et
     ne bouge qu'au survol — le construire à la volée coûterait une
     manipulation du DOM par pixel parcouru. */
  svg+='<g id="simCurseur" style="display:none">'+
       '<line class="simCurTrait" y1="'+mg.h+'" y2="'+(H-mg.b)+'"/>';
  for(const t of SIM_TRACES)
    svg+='<circle class="simCurPt" r="3.2" fill="'+t.couleur+'"/>';
  svg+="</g>"+
       '<rect id="simCurZone" x="'+mg.g+'" y="'+mg.h+'" width="'+
       (W-mg.g-mg.d)+'" height="'+(H-mg.h-mg.b)+'" fill="transparent"/>';
  svg+="</svg>";

  let leg='<div class="simLeg">';
  for(const t of SIM_TRACES)
    leg+='<span><i style="background:'+t.couleur+'"></i>'+t.nom+"</span>";
  leg+='<span class="simLecture" id="simLecture">'+
       "survolez la courbe pour lire une fréquence</span>";
  leg+="</div>";
  return svg+leg+simEchantillonnage(res);
}

/* Ce que la bande vaut comme échantillonnage.

   UNE LIAISON RÉSONNE TOUS LES 1/(2τ), τ étant son retard : c'est là que S₁₁
   plonge, la ligne devenant transparente à la demi-onde. Ce creux est ÉTROIT.
   Si le pas de la bande ne le vise pas, aucun point calculé ne tombe dedans,
   la courbe passe à côté sans rien signaler, et l'on repart avec une
   adaptation qu'on croit meilleure qu'elle n'est.

   LE SEUIL EST À VINGT POINTS PAR PÉRIODE, et il est mesuré, pas choisi. Sur
   une piste de 28,7 mm à 61 Ω, dont le creux vrai est à −39,5 dB :
       21 points -> 12,0 par période -> creux RATÉ, minimum affiché −33,3 dB
                                        et trouvé au bord de bande ;
       51 points -> 29,9 par période -> −39,5 dB à 2,942 GHz, juste.
   Douze points par période paraissent confortables et ne le sont pas : c'est
   pourquoi ce test existe plutôt qu'une confiance dans le nombre par défaut.

   On vise trente, et non vingt tout juste : le nombre proposé doit tenir même
   si l'utilisateur élargit un peu sa bande ensuite. */
function simEchantillonnage(res){
  const L=res.ligne, n=res.freqs.length;
  if(!L||!(L.retard>0)||n<2)return "";
  const periode=1/(2*L.retard);
  const largeur=res.freqs[n-1]-res.freqs[0];
  const parPeriode=periode/(largeur/(n-1));
  if(parPeriode>=20)return "";
  const vise=Math.min(MAX_POINTS_S,
                      Math.ceil(largeur/(periode/30))+1);
  return '<p class="simNote simNoteBas">· Bande trop peu échantillonnée : '+
    simNb(parPeriode,1)+" point(s) par période de résonance ("+
    simFreq(periode)+", soit "+simFreq(periode/2)+" pour le premier pic). "+
    "Les creux de S₁₁ tombent entre deux points calculés : la courbe les "+
    "relie à la règle et les montre <b>moins profonds qu'ils ne sont</b> — "+
    "l'aspect anguleux vient de là. Passez à <b>"+vise+" points</b>.</p>";
}
const MAX_POINTS_S=401;                 // le plafond du serveur (MAX_POINTS)

/* La liaison se voit-elle pareil des deux bouts ? Elle le fait dès que tous
   les tronçons ont la même section — le cas courant —, et alors S₂₂ = S₁₁ et
   il n'y a rien à dire. Sinon on le dit, plutôt que de tracer une seconde
   courbe qui, le reste du temps, viendrait masquer la première. */
function simDissymetrie(res){
  if(!res.s||!res.s.length)return "";
  let pire=0, kPire=0;
  for(let k=0;k<res.s.length;k++){
    const d=Math.abs(simDb(simTerme(res,k,0,0))-simDb(simTerme(res,k,1,1)));
    if(d>pire){pire=d;kPire=k;}
  }
  if(!(pire>0.5))return "";
  return '<p class="simNote">· Liaison dissymétrique : vue du port 2, la '+
    "réflexion diffère de "+simNb(pire,1)+" dB de celle du port 1 (au plus "+
    "fort, à "+simFreq(res.freqs[kPire])+"). Seul S₁₁ est tracé ; S₂₂ est dans "+
    "le fichier <code>.s2p</code>.</p>";
}

/* ==========================================================================
   La lecture au survol
   --------------------------------------------------------------------------
   Une courbe de paramètres S sans lecture chiffrée oblige à compter les
   carreaux. On donne donc, au point survolé : la fréquence, les deux modules
   en décibels, le rapport d'ondes stationnaires, et surtout L'IMPÉDANCE VUE
   PAR LE PORT — celle qu'un circuit d'attaque trouverait devant lui à cette
   fréquence-là.

       Z_in = Z_réf (1 + S₁₁) / (1 - S₁₁)

   Elle est COMPLEXE, et c'est tout l'intérêt : au quart d'onde une piste de
   61 Ω vue à travers 50 Ω ne présente pas 61 Ω mais 41 Ω, et la partie
   imaginaire dit de quel côté on se trouve. La donner en module seul ferait
   perdre exactement ce qu'on est venu chercher.

   On se cale sur le point CALCULÉ le plus proche, jamais sur une interpolation :
   la courbe est un segment de droite entre deux points, mais la réalité entre
   ces deux points n'a pas été calculée, et afficher une valeur intermédiaire
   inventerait un chiffre.
   ========================================================================== */
function simLire(k){
  const R=SIM_REPERE;
  if(!R)return null;
  const res=R.res, f=res.freqs[k];
  const s11=simTerme(res,k,0,0), s21=simTerme(res,k,1,0);
  const m=Math.hypot(s11[0],s11[1]);
  const ros=m<1?(1+m)/(1-m):Infinity;
  /* Z = Zréf (1+S11)/(1-S11), en complexe. */
  const zr=res.impedance_reference||50;
  const ar=1+s11[0], ai=s11[1], br=1-s11[0], bi=-s11[1];
  const d=br*br+bi*bi;
  const zre=d>1e-15?zr*(ar*br+ai*bi)/d:Infinity;
  const zim=d>1e-15?zr*(ai*br-ar*bi)/d:0;
  return {f:f, s11:simDb(s11), s21:simDb(s21), ros:ros, zre:zre, zim:zim};
}
function simLectureTexte(k){
  const v=simLire(k);
  if(!v)return "";
  const signe=v.zim>=0?"+ j":"− j";
  return simFreq(v.f)+"  ·  S₁₁ "+simNb(v.s11,1)+" dB  ·  S₂₁ "+
    simNb(v.s21,2)+" dB  ·  ROS "+(isFinite(v.ros)?simNb(v.ros,2):"∞")+
    "  ·  Z "+simNb(v.zre,1)+" "+signe+simNb(Math.abs(v.zim),1)+" Ω";
}
/* Branché après chaque pose de la fiche : le SVG vient d'être réécrit, les
   anciens gestionnaires sont partis avec. */
function simBrancherCourbe(){
  const R=SIM_REPERE;
  const zone=simEl("simCurZone"), grp=simEl("simCurseur"),
        txt=simEl("simLecture");
  if(!R||!zone||!grp||!txt)return;
  const svg=zone.ownerSVGElement||zone.closest("svg");
  const pts=grp.querySelectorAll(".simCurPt");
  const trait=grp.querySelector(".simCurTrait");
  const repos=txt.textContent;

  const bouger=function(ev){
    const r=svg.getBoundingClientRect();
    if(!r.width)return;
    /* De la fenêtre au repère du SVG : il est étiré par `preserveAspectRatio`,
       le rapport des largeurs suffit à revenir en arrière. */
    const x=(ev.clientX-r.left)*R.W/r.width;
    const u=(x-R.mg.g)/(R.W-R.mg.g-R.mg.d);
    const n=R.res.freqs.length;
    const k=Math.max(0,Math.min(n-1,Math.round(u*(n-1))));
    const X=R.mg.g+(R.W-R.mg.g-R.mg.d)*
            ((R.f1>R.f0)?(R.res.freqs[k]-R.f0)/(R.f1-R.f0):0.5);
    const Y=v=>R.mg.h+(R.H-R.mg.h-R.mg.b)*
              (1-(Math.max(R.lo,Math.min(R.hi,v))-R.lo)/(R.hi-R.lo));
    trait.setAttribute("x1",X.toFixed(1));
    trait.setAttribute("x2",X.toFixed(1));
    SIM_TRACES.forEach((t,i)=>{
      if(!pts[i])return;
      pts[i].setAttribute("cx",X.toFixed(1));
      pts[i].setAttribute("cy",Y(simDb(simTerme(R.res,k,t.i,t.j))).toFixed(1));
    });
    grp.style.display="";
    txt.textContent=simLectureTexte(k);
    txt.classList.add("on");
  };
  zone.onmousemove=bouger;
  zone.onmouseleave=function(){
    grp.style.display="none";
    txt.textContent=repos;
    txt.classList.remove("on");
  };
}

/* ==========================================================================
   La fiche
   ========================================================================== */
function simZLegende(){
  const c=SIM.saisie.cible, t=simZTolAbs();
  return '<div class="simLegZ">'+
    '<span><i style="background:'+simZCouleur(c-2*t)+'"></i>trop faible '+
      "(&lt; "+simNb(c-t,1)+" Ω)</span>"+
    '<span><i style="background:'+simZCouleur(c)+'"></i>dans la tolérance</span>'+
    '<span><i style="background:'+simZCouleur(c+2*t)+'"></i>trop élevé '+
      "(&gt; "+simNb(c+t,1)+" Ω)</span>"+
    "</div>";
}

function simFiche(){
  const res=SIM.res;
  if(!res)return "";
  const L=res.ligne;
  let h="";

  /* Le verdict d'ensemble d'abord : c'est la réponse à la question posée. Le
     détail est en dessous, pour qui veut savoir QUEL tronçon sort.

     ON COMPTE COMME LE TABLEAU COMPTE, c'est-à-dire en sections regroupées et
     non en tronçons envoyés. Un arc part en une vingtaine de cordes : compter
     les tronçons annonçait « 17 hors tolérance » sous un tableau qui affichait
     une seule ligne, et les deux chiffres ne parlaient pas de la même chose.
     La LONGUEUR hors tolérance est jointe, parce que c'est elle qui dit si ça
     compte — trois millimètres et trente millimètres ne se corrigent pas de la
     même façon. */
  const gr=simGrouper(res.segments);
  const sortis=gr.filter(g=>g.seg.z0>0&&simZVerdict(g.seg.z0)!==0);
  const dehors=sortis.length;
  const mmDehors=sortis.reduce((a,g)=>a+g.longueur,0);
  h+='<p class="simVerdict '+(dehors?"dehors":"dedans")+'">'+
     (dehors
       ? dehors+" section"+(dehors>1?"s":"")+" hors tolérance, "+
         simNb(mmDehors,2)+" mm"
       : "Toute la sélection est dans la tolérance")+
     " <span>"+simNb(L.z0_min,1)+" – "+simNb(L.z0_max,1)+
     " Ω, moyenne pondérée "+simNb(L.z0_moyen,1)+" Ω à "+
     simFreq(res.f_centre)+"</span></p>";

  /* L'impédance de RÉFÉRENCE des ports est ici, et pas seulement dans le champ
     de saisie : c'est sur elle que la courbe S est normalisée, et une courbe
     de réflexion ne se lit pas sans savoir contre quoi elle réfléchit. */
  h+='<div class="simMeta"><span>'+simEsc(SIM.portee||res.net||"—")+"</span>"+
     "<span>"+L.troncons+" tronçon"+(L.troncons>1?"s":"")+"</span>"+
     "<span>"+simNb(L.longueur,2)+" mm</span>"+
     "<span>"+simRetard(L.retard)+"</span>"+
     "<span>"+simNb(L.pertes_db,2)+" dB</span>"+
     "<span>réf. "+simNb(res.impedance_reference||SIM.saisie.z0,0)+" Ω</span>"+
     "<span>"+simNb(res.duree,2)+" s</span></div>";

  h+=simZLegende();

  /* LA SECTION RÉSOLUE, avant tout le reste. Ce n'est pas une réserve, c'est le
     problème lui-même : la hauteur au plan, la permittivité, la couche de
     référence. Quand un chiffre ne tombe pas sur la carte réelle, c'est là que
     la cause se lit — et il faut pouvoir la lire sans dérouler la fiche. */
  h+=simSection(res);

  /* Ce que l'outil sait du modèle et que le serveur ne peut pas deviner, puis
     ce que le serveur sait des limites du calcul. */
  for(const n of SIM.notes)h+='<p class="simNote">· '+simEsc(n)+"</p>";
  for(const a of (res.avertissements||[]))
    h+='<p class="simNote">· '+simEsc(a)+"</p>";
  if(L.ecartes)
    h+='<p class="simNote">· '+L.ecartes+" tronçon(s) écarté(s) : pas de "+
       "plan de référence en face, ou couche absente de l'empilage.</p>";

  /* Ce que la dispersion a fait au chiffre peint sur la carte. Le calcul de
     section est quasi-statique et Getsinger le monte en fréquence — c'est dit
     plus haut, mais dire « c'est un modèle » sans montrer de combien il a
     bougé le résultat ne permet à personne de juger. On ne l'écrit que si
     l'écart se voit : sous le pour cent, il n'y a rien à signaler. */
  const disp=simDispersion(res.segments);
  if(disp)
    h+='<p class="simNote">· '+disp+"</p>";

  /* OÙ SONT LES PORTS. Personne ne les a placés : ils se déduisent, et c'est
     précisément pour cela qu'il faut les écrire. Sans cette ligne, S₁₁ est un
     chiffre dont on ne sait pas de quel bout il est vu. */
  h+=simCoplanaire(res);
  /* Les deux contrôles qui ne changent pas le chiffre mais disent s'il veut
     dire quelque chose : la couture qui fait du cuivre latéral une vraie masse,
     et le cuivre voisin qui n'en est pas une. Ils viennent juste après la note
     coplanaire — c'est la même question, prise par ses deux bouts. */
  h+=simCouture(res);
  h+=simVoisins();
  h+=simPorts(res);
  h+=simDissymetrie(res);

  /* Le tableau : une ligne par tronçon, dans l'ordre du tracé. Les tronçons
     identiques qui se suivent sont regroupés — une piste de cinquante segments
     de même largeur sur la même couche donnerait cinquante lignes identiques,
     et on ne lirait plus rien. */
  h+='<table class="simTab simTabZ"><tr><th>Tronçon</th><th>l (mm)</th>'+
     "<th>Larg.</th><th>Topo.</th><th>Z₀ Ω</th><th>Écart</th></tr>";
  for(const g of gr.slice(0,60)){
    const s=g.seg, v=s.z0>0?simZVerdict(s.z0):null;
    const d=s.z0>0?s.z0-SIM.saisie.cible:0;
    /* L'écart porte la MÊME couleur que la carte : rouge au-dessus, vert en
       dessous. Il était jaune dans les deux sens, ce qui contredisait la
       légende qui venait d'être lue trois lignes plus haut. */
    const cls=v===null?"":(v===0?"z0ok":(v>0?"z0haut":"z0bas"));
    h+='<tr><td><i class="simPuce" style="background:'+simZCouleur(s.z0)+
       '"></i>'+(g.n>1?g.n+" × ":"")+simEsc(g.couche)+"</td>"+
       "<td>"+simNb(g.longueur,2)+"</td>"+
       "<td>"+simNb(s.largeur,3)+"</td>"+
       "<td>"+simEsc(simTopo(s))+"</td>"+
       "<td>"+(s.z0>0?simNb(s.z0,1):"—")+"</td>"+
       '<td class="'+cls+'">'+
       (s.z0>0?(d>=0?"+":"−")+simNb(Math.abs(d),1):"—")+"</td></tr>";
  }
  if(gr.length>60)
    h+='<tr><td colspan="6">… et '+(gr.length-60)+" autres</td></tr>";
  h+="</table>";

  /* CE QUI EST ENTRE LES TRONCONS, et que la courbe S porte deja. Le serveur
     cascade les coudes et les vias depuis le lot 3b ; la fiche ne les montrait
     pas, si bien qu'un |S21| qui plonge ne pouvait pas etre attribue. */
  h+=simDiscontinuites(res);

  h+=simCourbe(res);
  return h;
}

/* ==========================================================================
   LA SECTION RÉSOLUE, ÉCRITE EN CLAIR
   --------------------------------------------------------------------------
   POURQUOI ELLE EST LÀ. Une ligne à 54 Ω sur une carte qui doit en faire 50,
   c'est trois ohms à expliquer — et la fiche n'aidait pas : elle montrait
   l'impédance sans montrer SUR QUOI elle avait été obtenue. Ni la hauteur au
   plan, ni la permittivité, ni quelle couche servait de référence, ni si ces
   valeurs venaient du fichier, d'une saisie ou d'un repli. Retrouver la cause
   demandait d'inverser le résultat, ce qui est absurde quand le serveur les a
   toutes sous la main.

   ET C'EST PRESQUE TOUJOURS LÀ QUE SE TROUVE LA RÉPONSE. Le solveur est vérifié
   à 0,25 % contre la transformation conforme sur la section coplanaire, à 0,42 %
   contre Hammerstad-Jensen sur le microruban : quand il ne tombe pas sur la
   carte réelle, ce sont ses ENTRÉES qui diffèrent — et c'est la provenance de
   chaque cote, écrite en italique sous la section, qui le dit.

   UNE LIGNE PAR SECTION DISTINCTE, et non par tronçon : une piste découpée en
   trois plages d'écart a la même section droite verticale — même couche, même
   hauteur au plan, même stratifié —, seuls ses bords changent. Trois fois la
   même ligne n'apprendrait rien.
   ========================================================================== */

/* Ce qui fait qu'une section est LA MÊME : la couche, la géométrie verticale,
   le stratifié, le cuivre et la largeur. L'écart au plan coplanaire n'y est
   pas — il varie d'une plage à l'autre, et c'est le tableau qui le porte. */
function simSectionCle(s){
  return [s.nom_couche||s.couche, s.topo, s.h, s.er, s.cuivre,
          s.couverture, s.entre_plans, s.largeur].join("|");
}

function simSection(res){
  const vues=new Map();
  for(const s of res.segments){
    if(!(s.z0>0)||s.h==null||!simTopoNom(s))continue;   // rien résolu à décrire
    const cle=simSectionCle(s);
    const v=vues.get(cle);
    if(!v)vues.set(cle,{seg:s, longueur:s.longueur});
    else v.longueur+=s.longueur;
  }
  if(!vues.size)return "";

  let h="";
  for(const v of [...vues.values()].sort((a,b)=>b.longueur-a.longueur).slice(0,4)){
    const s=v.seg;
    const bouts=[];
    if(s.topo==="strip"){
      /* Triplaque : ce qui compte est l'écart ENTRE plans et où le ruban se
         trouve dedans — un empilage 4 couches n'est jamais symétrique, et
         c'est justement ce que la formule IPC ne sait pas prendre. */
      bouts.push("plans "+simEsc(s.plan_haut||"?")+" et "+
                 simEsc(s.plan_bas||"?"));
      bouts.push("écart entre plans "+simNb(s.entre_plans,3)+" mm");
      bouts.push("ruban à "+simNb(s.h,3)+" mm du plus proche");
    }else{
      bouts.push("plan "+simEsc(s.plan_haut||s.plan_bas||"?"));
      bouts.push("h "+simNb(s.h,3)+" mm");
      if(s.couverture>0)
        bouts.push("couvert de "+simNb(s.couverture,3)+" mm de stratifié");
    }
    bouts.push("ε<sub>r</sub> "+simNb(s.er,2));
    bouts.push("tan δ "+simNb(s.tan_delta,4));
    bouts.push("cuivre "+simNb(1000*s.cuivre,0)+" µm");
    bouts.push("piste "+simNb(s.largeur,3)+" mm");

    /* LA PROVENANCE vient de l'outil, pas du serveur : lui seul sait si une
       épaisseur a été lue dans le fichier, saisie à la main, ou remplacée par
       un repli. C'est la moitié de l'information — « h = 0,380 mm » et
       « h = 0,380 mm, supposé » ne se lisent pas de la même façon. */
    const prov=(SIM_ED&&typeof SIM_ED.provenance==="function")
      ? SIM_ED.provenance(s) : "";

    h+='<p class="simSection"><b>Section</b> '+
       simEsc(s.nom_couche||("couche "+s.couche))+" — "+
       simEsc(simTopoNom(s))+" : "+bouts.join(", ")+
       " → ε_eff "+simNb(s.eps_eff,3)+
       (vues.size>1?" ("+simNb(v.longueur,2)+" mm)":"")+"."+
       (prov?" <i>"+simEsc(prov)+"</i>":"")+
       /* LE MASQUE DE SOUDURE N'EST PAS DANS L'EMPILAGE ENVOYÉ, et sur une
          piste de couche extérieure il compte : il remplit l'écart coplanaire,
          là où le champ est le plus fort. Deux à trois pour cent de Z₀ en
          moins, dans le sens qui rapproche du cuivre réel. Le dire ICI, sur la
          section concernée, plutôt qu'en note générale : une piste interne n'a
          pas de masque, et l'avertir n'aurait aucun sens. */
       ((s.topo==="micro"&&!(s.couverture>0))
         ? ' <i>Le masque de soudure n\'est pas dans l\'empilage : sur une '+
           "couche extérieure il fait baisser Z₀ de deux à trois pour cent, "+
           "non comptés ici.</i>"
         : "")+
       "</p>";
  }
  if(vues.size>4)
    h+='<p class="simSection">… et '+(vues.size-4)+" autre(s) section(s).</p>";
  return h;
}

/* Le nom de la topologie, sans l'écart coplanaire : celui-ci varie d'une plage
   à l'autre et appartient au tableau. `simTopo` le porte, lui. */
function simTopoNom(s){
  if(s.topo==="strip")return "triplaque";
  if(s.topo==="micro")return s.couvert?"microruban couvert":"microruban";
  return "";                       // topologie inconnue : rien à nommer
}

/* ==========================================================================
   QUI EST LA MASSE
   --------------------------------------------------------------------------
   C'EST UNE HYPOTHÈSE, PAS UNE MESURE, et c'est pourquoi elle est ici plutôt
   qu'enfouie dans les deux adaptateurs. Le calcul coplanaire a besoin de savoir
   quel cuivre latéral est un plan de retour. Jusqu'ici la règle était « tout
   net différent de celui de la piste », et elle est fausse deux fois :

     · un ÎLOT d'un autre signal qui longe la piste comptait comme masse. Il
       n'en est pas : il ne porte pas le courant de retour, il se couple. Z₀
       sortait trop bas, et rien ne le disait ;
     · à l'inverse, un plan d'ALIMENTATION découplé EST une masse RF. Il faut
       donc pouvoir le compter — et c'est un choix, pas une évidence.

   D'où cet ensemble de nets, proposé par l'outil et corrigeable d'un clic. Les
   deux adaptateurs le lisent par `simRefSet()` : un seul endroit décide, et le
   document d'échange l'emporte avec lui pour que le .csv et le .s2p disent sous
   quelle hypothèse leurs chiffres ont été obtenus.
   ========================================================================== */

/* Les candidats, tels que l'outil les voit. Un outil qui ne sait pas répondre
   rend une liste vide : `simRefSet()` est alors vide, et l'adaptateur retombe
   sur « pas de masse coplanaire » plutôt que d'en inventer une. */
function simRefCandidats(){
  if(!SIM_ED||typeof SIM_ED.refCandidats!=="function")return [];
  const l=SIM_ED.refCandidats();
  return Array.isArray(l)?l.filter(c=>c&&c.net):[];
}

/* L'ensemble des nets tenus pour de la masse.

   TANT QU'ON SUIT LA PROPOSITION on la recalcule à chaque appel : changer le
   rôle d'une couche dans l'éditeur, ou compléter l'empilage dans la
   visionneuse, doit se voir tout de suite. Dès qu'un clic a tranché, on garde.

   ON NE REPREND LA MAIN QUE SUR UNE AUTRE CARTE, et c'est important : un choix
   fait sur une carte ne veut rien dire sur la suivante, mais dessiner une zone
   de plus sur la même carte ne l'invalide en rien. Le déclencheur est donc le
   NOM DE LA CARTE, et non la liste des candidats — laquelle bouge au moindre
   coup de crayon, et reprendre la main à chaque fois effacerait un choix
   délibéré.

   Un net choisi qui n'est plus candidat est retiré : il n'y a plus de cuivre
   derrière. Vider l'ensemble à la main reste en revanche respecté — c'est un
   choix, et la fiche le signale plutôt que de le défaire.

   Appelé UNE FOIS par construction de problème, pas par point de mesure : les
   adaptateurs se passent l'ensemble et non la fonction. */
function simRefSet(){
  const cle=(SIM_ED&&SIM_ED.carte)?String(SIM_ED.carte()):"";
  if(SIM.refCle!==cle){SIM.refCle=cle; SIM.refAuto=true; SIM.ref=null;}
  const cand=simRefCandidats();
  if(SIM.refAuto||!SIM.ref)
    SIM.ref=new Set(cand.filter(c=>c.defaut).map(c=>c.net));
  else{
    const noms=new Set(cand.map(c=>c.net));
    SIM.ref=new Set([...SIM.ref].filter(n=>noms.has(n)));
  }
  return SIM.ref;
}
function simRefListe(){return [...simRefSet()].sort();}
function simRefBasculer(net){
  const s=simRefSet();
  if(s.has(net))s.delete(net); else s.add(net);
  SIM.refAuto=false;
  /* L'hypothèse a changé, donc l'impédance : le résultat affiché ne lui
     correspond plus. Même parti pris que la fréquence — on l'efface et on le
     dit, plutôt que de laisser lire un chiffre pour un autre. */
  if(SIM.res){SIM.res=null; SIM.objets=[];}
  SIM.err="La masse de référence a changé : relancez le calcul.";
  simRefEcrire(); simRendre(); simRepeindre();
}
function simRefAuto(){
  SIM.refAuto=true; SIM.ref=null;
  if(SIM.res){SIM.res=null; SIM.objets=[];}
  SIM.err="Masse de référence revenue à ce que propose la carte.";
  simRefEcrire(); simRendre(); simRepeindre();
}

/* La rangée de pastilles. Pas un `<select multiple>` : dans un panneau étroit
   il faut le dérouler pour savoir ce qu'il contient, et c'est justement ce
   qu'il faut voir sans cliquer. Huit candidats au plus — au-delà, ce ne sont
   plus des plans. */
const SIM_REF_MAX=8;
function simRefEcrire(){
  const box=simEl("simRefBar");
  if(!box)return;
  const cand=simRefCandidats(), s=simRefSet();
  if(!cand.length){
    /* DEUX SILENCES DIFFÉRENTS, et les confondre envoie chercher au mauvais
       endroit : un outil qui ne sait pas répondre, et une carte qui n'a pas de
       cuivre plein. Le second est le cas courant — une carte pas encore
       arrosée — et il n'y a alors rien à corriger. */
    const sait=!!(SIM_ED&&typeof SIM_ED.refCandidats==="function");
    box.innerHTML='<span class="pnl-lbl">Masse</span>'+
      '<span class="simRefVide">'+
      (sait
        ? "aucun net ne porte de cuivre plein sur cette carte : il n'y a pas "+
          "de masse coplanaire à compter."
        : "cet outil ne sait pas proposer de net de référence : le cuivre "+
          "coplanaire n'est pas compté.")+
      "</span>";
    return;
  }
  let h='<span class="pnl-lbl" title="Les nets tenus pour plan de retour. '+
        "Le cuivre de ces nets qui borde la piste sur sa propre couche entre "+
        'dans le calcul ; celui des autres nets, non.">Masse</span>';
  for(const c of cand.slice(0,SIM_REF_MAX))
    h+='<button class="simRefNet'+(s.has(c.net)?" on":"")+
       '" data-ref="'+simEsc(c.net)+'" title="'+simEsc(c.quoi||"")+'">'+
       simEsc(c.net)+"</button>";
  if(cand.length>SIM_REF_MAX)
    h+='<span class="simRefVide">+'+(cand.length-SIM_REF_MAX)+" autre(s)</span>";
  h+='<span class="simRefEtat">'+
     (SIM.refAuto?"proposé par la carte"
                 :'<span class="simRefRaz" id="simRefRaz">revenir à la '+
                  "proposition</span>")+"</span>";
  box.innerHTML=h;
  for(const b of box.querySelectorAll("[data-ref]"))
    b.onclick=function(){simRefBasculer(this.getAttribute("data-ref"));};
  const raz=simEl("simRefRaz");
  if(raz)raz.onclick=simRefAuto;
}

/* ==========================================================================
   LES PLAGES D'ÉCART CONSTANT
   --------------------------------------------------------------------------
   POURQUOI DÉCOUPER. Retenir le point le plus serré de toute la piste, c'est
   la calculer entière au pire de ce qu'elle rencontre : un couloir de plan qui
   s'ouvre à mi-parcours donnait une impédance de bout en bout qui n'était juste
   sur aucun des deux bouts. La mise en cascade des matrices ABCD sait pourtant
   enchaîner des sections différentes — c'est exactement son métier —, et une
   piste découpée en plages homogènes lui donne le problème qu'elle sait
   résoudre.

   ICI ET PAS DANS LES DEUX ADAPTATEURS, parce que « plage » doit vouloir dire
   la même chose des deux côtés. L'éditeur sonde des zones de cuivre, la
   visionneuse mesure des arêtes de plan ; mais le seuil au-delà duquel deux
   écarts sont « différents », et la longueur en dessous de laquelle une plage
   n'est plus une section, sont des choix de MODÉLISATION. Deux valeurs
   divergentes feraient répondre les deux outils différemment sur la même carte,
   et personne ne saurait laquelle croire.

   DEUX GARDE-FOUS, sans quoi une piste de cinquante millimètres sortirait en
   deux cents tronçons illisibles :
     · on regroupe les échantillons dont les DEUX côtés s'accordent à dix pour
       cent près ; l'absence de masse est sa propre classe, et ne se confond
       avec aucun écart, même très grand ;
     · une plage de moins d'un demi-millimètre n'est pas une section, c'est une
       discontinuité — et le modèle de ligne ne sait pas traiter une
       discontinuité. Elle rejoint donc sa voisine la plus longue et en prend la
       section, plutôt que d'entrer dans le calcul comme une ligne qu'elle
       n'est pas.
   ========================================================================== */
const SIM_PAS=0.25;             // mm ; le pas d'échantillonnage sur l'axe
const SIM_ECH_MAX=400;          // au-delà, la piste est longue et le pas grossit
const SIM_PLAGE_MIN=0.5;        // mm ; en deçà, ce n'est pas une section
const SIM_PLAGE_TOL=0.10;       // 10 % : deux échantillons de la même plage

function simMemeEcart(a,b){
  if(!(a>0)&&!(b>0))return true;            // ni l'un ni l'autre : même classe
  if(!(a>0)||!(b>0))return false;           // l'un oui, l'autre non : rupture
  return Math.abs(a-b)<=SIM_PLAGE_TOL*Math.max(a,b);
}

/* Découpe une piste de longueur `total` (mm) en plages d'écart constant.

   `mesure(u, i)` rend {g, d} — les deux écarts, en millimètres, à la fraction
   `u` du parcours. L'appelant y fait ce qu'il veut d'autre : relever le cuivre
   voisin, compter les côtés qui portent de la masse. Ce n'est pas le problème
   d'ici.

   Rend {plages, pas, n} : `plages` porte {u1, u2, longueur, g, d}, l'écart
   retenu d'une plage étant le point le plus SERRÉ qu'elle contient. Le minimum
   reste le choix prudent — mais sur une plage homogène il ne s'écarte plus de
   la moyenne que de dix pour cent, alors qu'un minimum pris sur la piste
   entière pouvait en être à un facteur dix. */
function simPlagesDe(total,mesure){
  if(!(total>0))return {plages:[], pas:0, n:0};
  const n=Math.max(1,Math.min(SIM_ECH_MAX,Math.ceil(total/SIM_PAS)));
  const pas=total/n;
  const plages=[];
  for(let i=0;i<n;i++){
    const e=mesure((i+0.5)/n,i)||{g:0,d:0};
    const p=plages[plages.length-1];
    if(p&&simMemeEcart(p.g,e.g)&&simMemeEcart(p.d,e.d)){
      p.i2=i;
      if(e.g>0)p.g=(p.g>0)?Math.min(p.g,e.g):e.g;
      if(e.d>0)p.d=(p.d>0)?Math.min(p.d,e.d):e.d;
    }else plages.push({i1:i, i2:i, g:e.g||0, d:e.d||0});
  }

  /* Les plages trop courtes rejoignent leur voisine la plus longue. On
     recommence tant qu'il en reste : absorber une plage courte peut en laisser
     une autre courte à côté. Une piste entière plus courte que le seuil garde
     sa plage unique — elle n'a pas de voisine, et ne pas la calculer du tout
     serait pire que de la calculer telle quelle. */
  let encore=true;
  while(encore&&plages.length>1){
    encore=false;
    for(let i=0;i<plages.length;i++){
      const p=plages[i];
      if((p.i2-p.i1+1)*pas>=SIM_PLAGE_MIN)continue;
      const a=plages[i-1], b=plages[i+1];
      const cible=(!a)?b:((!b)?a:((a.i2-a.i1)>=(b.i2-b.i1)?a:b));
      cible.i1=Math.min(cible.i1,p.i1);
      cible.i2=Math.max(cible.i2,p.i2);
      plages.splice(i,1);
      encore=true;
      break;
    }
  }

  return {
    n:n, pas:pas,
    plages:plages.map(function(p){
      return {u1:p.i1/n, u2:(p.i2+1)/n,
              longueur:(p.i2-p.i1+1)*pas, g:p.g, d:p.d};
    })
  };
}

/* ==========================================================================
   LA COUTURE DE VIAS
   --------------------------------------------------------------------------
   CE QUI FAIT QU'UN PLAN COPLANAIRE EST VRAIMENT DE LA MASSE. Le calcul de
   section tient le cuivre latéral à zéro volt — c'est sa condition aux
   limites, et c'est ce que « plan de masse » veut dire. Sur une carte, ce
   cuivre ne l'est qu'autant que des vias le ramènent au plan de référence
   d'en face. Sans couture, il flotte : à partir d'une certaine fréquence il
   résonne, cesse d'être une masse, et l'impédance calculée ne décrit plus rien.

   ON NE LE MODÉLISE PAS — il faudrait l'onde complète, c'est-à-dire
   `mom_solver/`, que CE PANNEAU n'appelle pas. Le moteur, lui, n'est plus
   bloqué : son port vertical est fait et mesuré depuis le 2026-08-30, et il
   rend des paramètres S dé-embarqués à 0,93 % de `ligne_mom`. Ce qui manque
   ici est la couture entre la page et lui, pas la physique. On le CONTRÔLE :
   l'outil mesure
   l'espacement le plus grand entre deux coutures consécutives le long de la
   piste, et on le compare à la longueur d'onde dans le stratifié en haut de la
   bande analysée. C'est là que le risque est le plus fort, pas à f₀.

   λ/20 est l'usage pour une couture qui tient, λ/10 la limite au-delà de
   laquelle on ne peut plus dire que le cuivre latéral est de la masse. Les deux
   chiffres sont des règles de l'art, pas des théorèmes : le verdict dit
   « vérifiez », il ne dit pas « faux ».
   ========================================================================== */
function simCouture(res){
  const c=SIM.couture;
  if(!c)return "";
  /* La permittivité effective la plus forte de la sélection : c'est elle qui
     raccourcit le plus la longueur d'onde, donc celle qui juge. */
  let eps=1;
  for(const s of res.segments)if(s.eps_eff>eps)eps=s.eps_eff;
  const f=SIM.saisie.f2;                       // le haut de la bande analysée
  const lambda=299792458/(f*Math.sqrt(eps))*1e3;   // en mm
  const l10=lambda/10, l20=lambda/20;
  const ou=" (λ/10 = "+simNb(l10,2)+" mm à "+simFreq(f)+", ε_eff "+
           simNb(eps,2)+")";

  if(!c.n)
    return '<p class="simNote">· <b>Aucun via de masse</b> dans le couloir de '+
      simNb(c.couloir,2)+" mm qui borde la piste. Le cuivre latéral est "+
      "compté comme plan de retour par le calcul, mais rien ne le ramène au "+
      "plan d'en face : à cette fréquence il peut résonner au lieu de servir "+
      "de masse, et Z₀ ne décrirait alors plus la ligne"+ou+".</p>";

  const e=c.ecartMax;
  const verdict=e<=l20
    ? "<b>couture serrée</b> : le cuivre latéral se comporte en masse, "+
      "l'hypothèse coplanaire tient"
    : (e<=l10
        ? "<b>couture limite</b> : entre λ/20 et λ/10. Le cuivre latéral tient "+
          "encore lieu de masse, mais la marge est mince — resserrez si la "+
          "bande doit monter"
        : "<b>couture trop lâche</b> : au-delà de λ/10, le cuivre latéral peut "+
          "résonner et cesser d'être une masse. L'impédance calculée le suppose "+
          "pourtant à zéro volt");
  return '<p class="simNote">· Couture de vias : '+c.n+" via(s) de masse dans "+
    "le couloir de "+simNb(c.couloir,2)+" mm, espacement maximal "+
    simNb(e,2)+" mm — "+verdict+ou+".</p>";
}

/* ==========================================================================
   LE CUIVRE VOISIN QUI N'EST PAS DE LA MASSE
   --------------------------------------------------------------------------
   Ce que le filtre des nets de référence a écarté, et qu'il ne faut surtout
   pas jeter en silence. Un îlot d'un autre signal à deux dixièmes de
   millimètre n'est pas un plan de retour — il n'entre donc pas dans Z₀ — mais
   il est un COUPLAGE, et le modèle de ligne ne le voit pas. L'écarter du calcul
   sans le dire remplacerait une erreur par un silence.
   ========================================================================== */
function simVoisins(){
  const v=SIM.voisins;
  if(!v||!v.length)return "";
  const l=v.slice(0,4).map(o=>simEsc(o.net)+" à "+simNb(o.ecart,3)+" mm sur "+
                             simNb(o.longueur,2)+" mm");
  return '<p class="simNote">· Du cuivre <b>qui n\'est pas de la masse</b> '+
    "longe la piste sur sa propre couche : "+l.join(", ")+
    (v.length>4?", et "+(v.length-4)+" autre(s)":"")+
    ". Il n'entre PAS dans Z₀ — ce n'est pas un plan de retour —, mais c'est "+
    "un couplage, et le modèle de ligne ne le voit pas. Si l'un de ces nets "+
    "est en réalité de la masse, ajoutez-le à « Masse » ci-dessus.</p>";
}

/* ==========================================================================
   Les ports, écrits noir sur blanc
   --------------------------------------------------------------------------
   PERSONNE NE LES PLACE, ET C'EST VOULU. Le modèle est une chaîne de lignes
   uniformes : elle a exactement deux bouts, et il n'y a donc rien à choisir.
   Le port 1 est le DÉPART du premier tronçon envoyé, le port 2 l'ARRIVÉE du
   dernier ; tous deux sont ramenés à l'impédance du champ « Réf. ».

   Ce que cela veut dire, et qu'il vaut mieux lire que deviner :
     · ils sont IDÉAUX — pas de pastille, pas de via, pas de connecteur, pas
       de longueur d'accès à retrancher. S₁₁ est la réflexion du cuivre nu ;
     · leur ORDRE suit celui d'envoi des tronçons, qui n'est pas forcément le
       sens de parcours électrique. Sur une chaîne c'est sans conséquence pour
       S₂₁ ; pour S₁₁ contre S₂₂, cela dit lequel est « l'entrée ».

   ON LES NOMME QUAND L'OUTIL SAIT CE QU'IL Y A LÀ. « Port 1 sur la pastille
   J1.1 » se vérifie d'un coup d'œil ; « (12,40 ; 8,15) » oblige à aller
   regarder, et c'est justement la vérification qu'on saute. Les coordonnées
   restent — elles départagent deux pastilles du même repère —, mais elles ne
   sont plus la seule chose écrite. L'adaptateur répond par `bout()` ; celui
   qui ne sait pas répondre rend une chaîne vide, et on retombe sur les
   coordonnées seules. */
function simPorts(res){
  const objs=(SIM.doc&&SIM.doc.geometry&&SIM.doc.geometry.objects)||[];
  const zr=res.impedance_reference||SIM.saisie.z0;
  const ou=function(p,obj){
    if(!(p&&p.length>=2))return "";
    const xy=" ("+simNb(p[0],2)+" ; "+simNb(p[1],2)+")";
    const nom=(SIM_ED&&typeof SIM_ED.bout==="function")
      ? (SIM_ED.bout(p,obj)||"") : "";
    return (nom?", sur "+nom:"")+xy;
  };
  const pre=objs.length?objs[0]:null;
  const der=objs.length?objs[objs.length-1]:null;
  const a=pre?ou(pre.start,pre):"";
  const b=der?ou(der.end,der):"";
  /* NOMMER LA PASTILLE ET DIRE QU'ELLE N'EST PAS MODÉLISÉE n'est pas une
     contradiction, c'est le point entier : le port est posé LÀ où elle est,
     et son cuivre à elle ne compte pas. Sans les deux phrases côte à côte, on
     lit S₁₁ comme s'il comprenait la pastille. */
  return '<p class="simNote">· Ports déduits, non placés : <b>1</b> au départ '+
    "du premier tronçon"+simEsc(a)+", <b>2</b> à l'arrivée du dernier"+
    simEsc(b)+", tous deux sur "+simNb(zr,0)+" Ω. Le modèle est une chaîne : "+
    "elle a exactement deux bouts, il n'y a donc rien à placer. Ils sont "+
    "idéaux — le port est posé là, mais ni la pastille, ni le via, ni le "+
    "connecteur, ni la longueur d'accès n'entrent dans le modèle : S₁₁ est la "+
    "réflexion du cuivre nu, et il est nécessairement meilleur qu'une mesure "+
    "au VNA.</p>";
}

/* Le nom de la section. « Microruban couvert » n'est pas une coquetterie : une
   piste interne qui n'a de plan que d'un côté a du stratifié au-dessus d'elle
   et pas de l'air, ce qui la sépare d'une piste de couche extérieure par une
   dizaine de pour cent d'impédance. Les deux portent le même mot dans les
   normes ; les distinguer ici évite de croire à une erreur en comparant deux
   lignes du tableau. */
function simTopo(s){
  const base=simTopoNom(s);
  if(!base)return "—";
  /* « Coplanaire » n'est pas un détail de vocabulaire : c'est ce qui sépare
     57 Ω de 50 Ω sur la même piste. Le tableau doit le dire, avec l'écart
     mesuré, sans quoi on ne sait pas quel calcul on lit.

     ET AVEC LE NOMBRE DE CÔTÉS. Une masse d'un seul côté ne fait pas la moitié
     de l'effet, elle en fait les deux tiers environ — mais surtout, écrire
     « coplanaire (0,20 mm) » pour une piste qui longe une découpe laisse croire
     à un écart des deux côtés, et c'est exactement l'hypothèse qu'on vient de
     lever. Un seul côté se nomme donc, et les deux écarts s'écrivent quand ils
     diffèrent. */
  if(!s.coplanaire)return base;
  if(s.cotes===1)
    return base+" coplanaire, un seul côté ("+simNb(s.ecart,3)+" mm)";
  const g=s.ecart_g, d=s.ecart_d;
  if(g>0&&d>0&&Math.abs(g-d)>0.001*Math.max(g,d)+1e-6)
    return base+" coplanaire ("+simNb(Math.min(g,d),3)+" / "+
           simNb(Math.max(g,d),3)+" mm)";
  return base+" coplanaire ("+simNb(s.ecart,3)+" mm)";
}

/* Ce que la masse coplanaire a fait au résultat, et d'où vient l'écart mesuré.
   Deux outils, deux provenances, et il faut pouvoir les distinguer : l'éditeur
   PCB CONNAÎT son isolation — c'est elle qui creuse le plan —, la visionneuse
   la MESURE sur le cuivre livré. */
/* ==========================================================================
   CE QUI A ÉTÉ CASCADÉ ENTRE LES TRONÇONS
   --------------------------------------------------------------------------
   POURQUOI CETTE SECTION EXISTE. Le serveur calcule les coudes et les vias,
   il les insère dans la cascade ABCD, et donc la courbe S les porte — mais
   RIEN ne le disait. `res.discontinuites` arrivait dans le résultat et n'était
   lu nulle part. Devant un |S₂₁| qui plonge, personne ne pouvait savoir si un
   via y était compté ni ce qu'il pesait ; et devant une liaison qui change de
   couche, personne ne pouvait vérifier que le via avait seulement été VU.

   CE QUE LA COLONNE « PHASE » VEUT DIRE, ET POURQUOI ELLE EST LÀ. Une
   inductance en nanohenrys ne dit pas si elle compte : 1 nH est négligeable à
   100 MHz et dominant à 10 GHz. La phase que l'élément vaut À LA FRÉQUENCE
   CENTRALE, elle, se lit directement — sous un degré, on peut passer.

   LA PROVENANCE DE CHAQUE COTE VOYAGE AVEC. Les pages n'envoient pas encore le
   perçage ni la pastille : le modèle tourne alors sur des replis, et un
   chiffre supposé affiché comme un chiffre mesuré est pire que pas de chiffre.
   La hauteur, elle, se lit dans l'empilage et n'est plus supposée — c'est
   pourquoi on distingue cote par cote plutôt que de mettre un seul drapeau.
   ========================================================================== */
function simCoteSource(c,cle){
  return (c&&c[cle+"_source"])||"repli";
}

function simDiscontinuites(res){
  const d=res.discontinuites||{};
  /* LES VIAS HORS PARCOURS ENTRENT DANS LA MÊME TABLE, et il le faut : c'est
     là qu'on vient chercher « qu'est-ce que ce via me coûte ». Ils n'entrent
     PAS dans la cascade — ils portent `cascade:false` —, et le tableau le dit
     à la ligne près plutôt que dans une note générale : un chiffre qui n'est
     pas dans la courbe et un chiffre qui y est ne se lisent pas pareil. */
  const seuls=d.vias_hors_chaine||[];
  const coudes=d.coudes||[], vias=(d.transitions||[]).concat(seuls);
  const n=coudes.length+vias.length;

  /* LE SILENCE EST UNE RÉPONSE, MAIS SEULEMENT SI ON LE DIT. Une liaison d'un
     seul tronçon n'a rien entre ses tronçons : inutile d'ouvrir une section.
     Une liaison de plusieurs tronçons sans discontinuité, en revanche, mérite
     la ligne — c'est une information, pas une absence. */
  if(!n){
    if(((res.ligne&&res.ligne.troncons)||0)<2)return "";
    return '<p class="simNote">· Aucune discontinuité entre les tronçons : '+
      "la liaison est une suite de sections droites sur une seule couche, et "+
      "la courbe S ne porte que les lignes.</p>";
  }

  const quoi=[];
  if(coudes.length)quoi.push(coudes.length+" coude"+(coudes.length>1?"s":""));
  if(vias.length)quoi.push(vias.length+" via"+(vias.length>1?"s":""));

  /* LE TITRE NE PEUT PLUS DIRE « CASCADÉES » TOUT COURT dès qu'une partie ne
     l'est pas. Un en-tête qui affirme plus que le contenu est exactement le
     genre de texte qu'on relit six mois plus tard en le croyant. */
  let h='<p class="simVerdict dedans">'+
        (seuls.length&&seuls.length===vias.length&&!coudes.length
          ? "Discontinuités hors parcours"
          : (seuls.length?"Discontinuités":"Discontinuités cascadées"))+
        " <span>"+quoi.join(", ")+"</span></p>";

  h+='<table class="simTab simTabD"><tr><th>Après</th><th>Type</th>'+
     "<th>Détail</th><th>Retour</th><th>L</th><th>C</th><th>Phase</th></tr>";

  const lignes=[];
  for(const c of coudes)
    lignes.push({rang:c.troncon, type:"Coude",
                 detail:simNb(c.angle_deg,0)+"°",
                 m:c.modelise||{}, l:"inductance_pH", ul:" pH", dl:0});
  for(const t of vias){
    const c=t.cotes||{};
    const horsChaine=t.cascade===false;
    const cotes=[simNb(c.hauteur_mm,3)+" mm",
                 "⌀"+simNb(c.percage_mm,2),
                 "past. "+simNb(c.pastille_mm,2)];
    if(c.antipad_mm)cotes.push("anti. "+simNb(c.antipad_mm,2));
    /* LE MOIGNON SE LIT SOUS LES COTES DU VIA, parce que c'est une cote du via
       — celle qu'on ne voit pas sur le dessin. Sa RÉSONANCE part avec, et
       c'est elle qui décide : une capacité en femtofarads ne dit pas si le
       moignon est un problème, la fréquence à laquelle il court-circuite la
       liaison, si. */
    const moi=simMoignonTexte(t);
    lignes.push({/* UN VIA HORS PARCOURS N'A PAS DE RANG DE TRONÇON : il ne
                    tombe APRÈS rien. Le tri les met en queue, ce qui est leur
                    place — on lit d'abord la chaîne, puis ce qui n'en est pas. */
                 rang:horsChaine?Infinity:t.troncon,
                 apres:horsChaine?"—":null,
                 type:horsChaine?"Via <small>hors parcours</small>":"Via",
                 detail:simEsc((t.nom_depart||"?")+" → "+(t.nom_arrivee||"?"))+
                        '<br><small>'+simEsc(cotes.join(" · "))+"</small>"+moi,
                 m:t.modelise||{}, l:"inductance_nH", ul:" nH", dl:3,
                 cotes:c, retour:simRetourCellule(t),
                 /* LA CAPACITÉ AFFICHÉE EST CELLE QUI EST CASCADÉE : celle du
                    via PLUS celle de ses moignons. Montrer la seule capacité
                    du via à côté d'une phase qui compte les deux ferait deux
                    chiffres pour une grandeur. */
                 c:(t.modelise||{}).capacite_totale_fF});
  }
  lignes.sort((a,b)=>a.rang-b.rang);

  for(const L of lignes){
    /* SOUS UN DIXIÈME DE DEGRÉ, L'ÉLÉMENT NE PÈSE RIEN, et le dire évite qu'on
       aille chercher une cause là où il n'y en a pas. */
    const ph=L.m.phase_deg;
    const faible=isFinite(ph)&&Math.abs(ph)<0.1;
    /* UN VIA HORS PARCOURS N'A NI CAPACITÉ NI PHASE À MONTRER : rien de lui
       n'entre dans une matrice ABCD, et afficher un zéro le ferait passer
       pour mesuré. Un tiret dit « pas calculé » ; un zéro dit « négligeable »,
       et ce n'est pas la même chose. */
    const hors=L.apres==="—";
    h+="<tr><td>"+(hors?"—":"tronçon "+L.rang)+"</td>"+
       "<td>"+L.type+"</td>"+
       "<td>"+L.detail+"</td>"+
       "<td>"+(L.retour||"—")+"</td>"+
       "<td>"+simNb(L.m[L.l],L.dl)+L.ul+"</td>"+
       "<td>"+(hors?"—":simNb(L.c==null?L.m.capacite_fF:L.c,2)+" fF")+"</td>"+
       '<td class="'+(faible&&!hors?"z0ok":"")+'">'+
       (hors?"—":simNb(ph,2)+"°")+"</td></tr>";
  }
  h+="</table>";

  /* LES REPLIS, NOMMÉS UN PAR UN. « Cotes supposées » tout court ne dit pas
     LAQUELLE l'est : depuis que la hauteur se lit dans l'empilage, il n'y a
     plus qu'un drapeau à lever pour le perçage et la pastille, et il faut
     qu'on sache que la hauteur, elle, est exacte. */
  const supposees=vias.filter(t=>t.cotes_supposees);
  if(supposees.length){
    const c=supposees[0].cotes||{};
    const manque=[];
    if(simCoteSource(c,"percage")!=="page")
      manque.push("perçage "+simNb(c.percage_mm,2)+" mm");
    if(simCoteSource(c,"pastille")!=="page")
      manque.push("pastille "+simNb(c.pastille_mm,2)+" mm");
    h+='<p class="simNote">· '+
       (supposees.length>1?supposees.length+" vias sont chiffrés":
                           "Le via est chiffré")+
       " avec des valeurs par défaut : "+simEsc(manque.join(", "))+
       ". La page n'envoie pas encore ces cotes. La hauteur, elle, est lue "+
       "dans l'empilage ("+simNb((supposees[0].cotes||{}).hauteur_mm,3)+
       " mm) et n'est pas supposée.</p>";
  }

  if(seuls.length)
    h+='<p class="simNote">· '+
       (seuls.length>1?seuls.length+" vias ne sont PAS dans la cascade":
                       "Ce via n'est PAS dans la cascade")+
       " : la sélection n'est pas un parcours unique — un net qui se ramifie "+
       "n'en a pas —, et il n'y a donc pas d'ordre dans lequel les enchaîner. "+
       "Ce qui est rendu ici ne dépend d'aucun ordre : la hauteur percée, les "+
       "cotes, l'inductance de BOUCLE et le chemin de retour. Ce qui manque, "+
       "et qui en dépendrait : la capacité cascadée, la phase, et la part "+
       "que ce via prend dans la courbe S.</p>";

  h+=simRetourNotes(vias);

  /* CE QUE LE MODÈLE DE VIA EST, ET CE QU'IL N'EST PAS. Un π L-C localisé
     décrit un via court devant la longueur d'onde. Il compte désormais
     l'antipad de chaque plan traversé et l'inductance de BOUCLE avec les vias
     de masse ; il ne décrit toujours ni le moignon qui dépasse, ni la cavité
     entre deux plans. À 200 MHz sur une carte de 1,3 mm ces deux-là ne pèsent
     rien ; en haut de bande, il faut le savoir. */
  if(vias.length)
    h+='<p class="simNote">· Le via est un π L-C localisé, chargé par ses '+
       "moignons et par la traversée de cavité quand il y en a une. Ce qui "+
       "n'y est pas : les résonances propres de la paire de plans, et le "+
       "couplage entre deux vias voisins. C'est bon tant que le via est court "+
       "devant la longueur d'onde.</p>";

  return h;
}

/* ==========================================================================
   CE QUE LE CHEMIN DE RETOUR DIT, EN UNE CELLULE ET EN QUELQUES NOTES
   --------------------------------------------------------------------------
   POURQUOI UNE COLONNE ENTIÈRE POUR ÇA. L'inductance d'un via n'existe pas
   toute seule : c'est la BOUCLE qu'il forme avec ses vias de masse qui en
   porte une. Afficher « 1,29 nH » sans dire d'où ce chiffre sort laisse croire
   qu'il décrit la carte, alors qu'il peut décrire un conducteur seul — un
   chiffre qui ne dépend pas du routage, posé au milieu d'un tableau qui juge
   le routage.

   TROIS ÉTATS, ET ILS NE SE CONFONDENT PAS :
     · « 2 vias · 0,6 mm » — la boucle est refermée, le chiffre dépend du
       placement, et le rapprocher le fera baisser ;
     · « aucun » — rien ne referme la boucle. Le chiffre est une self, il ne
       bougera pas quoi qu'on route ;
     · « ⚠ GND→PWR » — la référence change et aucun via de masse ne peut la
       rejoindre. C'est le seul cas où la réponse n'est pas un chiffre mais un
       conseil : ne pas changer de référence.
   ========================================================================== */
/* Le moignon, sous les cotes du via. Absent quand il n'y en a pas — et DIT
   quand on ne peut pas savoir : une page qui n'envoie pas la portée percée
   n'est pas une carte sans moignon, et choisir le silence reviendrait à
   retenir le cas le plus flatteur par défaut. */
function simMoignonTexte(t){
  const mo=t.moignons||{};
  if(mo.incoherent)
    return '<br><small class="z0ko">portée percée incohérente</small>';
  if(!mo.connu)
    return '<br><small class="simFaible">moignon inconnu</small>';
  const bouts=[mo.depart,mo.arrivee].filter(Boolean);
  if(!bouts.length)return "";
  return "<br><small>"+bouts.map(f=>
    "moignon "+simNb(f.longueur_mm,3)+" mm · rés. "+
    simNb((f.resonance_hz||0)/1e9,1)+" GHz").join(" · ")+"</small>";
}

function simRetourCellule(t){
  const r=t.retour||{}, cav=t.cavite||{};
  /* LE COÛT CHIFFRÉ PASSE AVANT TOUT : quand on sait ce que la traversée coûte,
     c'est cela qu'il faut lire, pas un avertissement. En OHMS et non en
     nanohenrys : la cavité n'est pas une inductance, elle résonne — la
     capacité répartie des plans et l'inductance du découplage forment une
     résonance parallèle où l'impédance culmine. */
  if(cav.impedance_fc_ohm!=null)
    return '<span class="z0ko">cavité</span><br><small>'+
           simNb(cav.impedance_fc_ohm,2)+" Ω</small>";
  if(r.reference_change)
    return '<span class="z0ko">⚠ '+
           simEsc((r.nets_depart||r.plans_depart||["?"]).join("/")+"→"+
                  (r.nets_arrivee||r.plans_arrivee||["?"]).join("/"))+"</span>";
  /* LE DOUTE A SA PROPRE CASE, et il ne se confond ni avec le défaut ni avec
     le cas sain : deux plans de noms différents dont on ignore les nets
     peuvent être deux masses (ordinaire) ou une masse et une alimentation
     (grave), et rien ici ne permet de trancher. */
  if(r.plan_change&&r.nets_differents==null)
    return '<span class="simFaible">? '+
           simEsc((r.plans_depart||["?"]).join("/")+"→"+
                  (r.plans_arrivee||["?"]).join("/"))+"</span>";
  if(r.source==="absent")
    return '<span class="simFaible">non envoyé</span>';
  if(!r.retenus)
    return '<span class="z0ko">aucun</span>';
  const proche=(r.vias||[]).filter(v=>v.retenu)
                           .reduce((m,v)=>Math.min(m,v.distance_mm),Infinity);
  return '<span class="z0ok">'+r.retenus+" via"+(r.retenus>1?"s":"")+
         "</span><br><small>"+simNb(proche,2)+" mm</small>";
}

/* ==========================================================================
   LE CHEVELU, LU DANS LE RÉSULTAT
   --------------------------------------------------------------------------
   DEUX PAGES, DEUX SOURCES, ET C'EST VOULU. L'éditeur PCB dessine son chevelu
   pendant qu'on ROUTE : il le recalcule à chaque déplacement du via, sans rien
   demander au serveur — un outil de routage qui attendrait un calcul ne
   servirait à rien. La visionneuse, elle, lit une carte DÉJÀ FAITE : rien n'y
   bouge, et le seul chevelu qui vaille est celui que le modèle a réellement
   employé. Elle le lit donc dans le résultat.

   ET C'EST LA MEILLEURE SOURCE POUR ELLE. Le serveur a déjà tranché : quels
   vias de masse referment la boucle, lesquels ne le peuvent pas et pourquoi,
   quelle part du courant chacun porte, ce que vaut la boucle. Le recalculer
   côté page donnerait une seconde implémentation de la même physique — et deux
   implémentations d'une même grandeur finissent toujours par en donner deux
   valeurs. Ce qu'on dessine ici est, au trait près, ce que la fiche chiffre.

   Rend une liste, une entrée par via de signal dont on connaît la position.
   Les coordonnées sont en MILLIMÈTRES : c'est l'unité du document envoyé, et
   chaque page la ramène à la sienne. */
function simCheveluRes(){
  if(typeof SIM==="undefined"||!SIM.ouvert||SIM.analyse!=="impedance")return [];
  const r=SIM.res;
  if(!r)return [];
  /* LES DEUX LISTES, ET C'EST TOUT L'OBJET DU LOT. Les `transitions` sont les
     vias que la CHAÎNE a vus — ceux qui tombent entre deux tronçons
     consécutifs d'un parcours unique. `vias_hors_chaine` porte les autres :
     sur un net qui se ramifie il n'y a pas de parcours, donc pas une seule
     transition, et pourtant les vias sont là. Leur chemin de retour ne doit
     rien à l'ordre des tronçons, et le chevelu se dessine pareil.

     LE SEUL ÉCART EST `cascade` : un via hors parcours ne figure dans aucune
     matrice ABCD, la courbe S ne le porte pas, et la fiche doit le dire
     plutôt que de laisser croire qu'il y entre. */
  const d=r.discontinuites||{};
  const trs=(d.transitions||[]).concat(d.vias_hors_chaine||[]);
  const out=[];
  for(const t of trs){
    const ret=t.retour||{}, mod=t.modelise||{}, cotes=t.cotes||{};
    /* SANS POSITION, PAS DE TRAIT. Une page qui n'envoie pas le via ne peut
       pas se voir dessiner son chevelu, et l'inventer au raccord serait poser
       un point là où l'outil n'en connaît aucun. */
    if(ret.x==null||ret.y==null)continue;
    out.push({
      x:ret.x, y:ret.y,
      pastille:cotes.pastille_mm||0,
      vias:ret.vias||[],
      retenus:ret.retenus||0,
      L_nH:mod.inductance_nH||0,
      /* « boucle » dans la source veut dire qu'un retour la referme —
         « self », « self+cavite » veulent dire que non, et le chiffre est
         alors un PLANCHER, pas une mesure. */
      seul:String(mod.inductance_source||"").indexOf("boucle")<0,
      change:!!ret.reference_change,
      doute:!!(ret.plan_change&&ret.nets_differents==null),
      plans:(ret.plans_depart||[]).join("/")+" → "+
            (ret.plans_arrivee||[]).join("/"),
      /* `cascade` absent vaut VRAI : les transitions ne le portent pas, et
         elles sont bien cascadées. Seuls les vias hors parcours le posent, et
         à faux. */
      cascade:t.cascade!==false,
      /* L'IPC-2581 ne déclare pas la portée d'un perçage : les retours y sont
         SUPPOSÉS traversants. Un via enterré pris pour traversant rend une
         inductance trop petite de près de vingt pour cent, donc flatteuse — le
         chevelu doit le dire, sinon il donne à voir une certitude qu'il n'a
         pas. */
      supposee:!!ret.portee_supposee
    });
  }
  return out;
}

/* La couleur d'un lien, par sa part du courant de retour. Le vert du panneau
   pour celui qui travaille, l'ambre pour celui qui traîne, le gris pour celui
   qui ne rend presque rien, le rouge pour celui qui ne ferme pas. Ce sont les
   couleurs de la carte de chaleur des impédances, et c'est voulu : une même
   échelle pour un même jugement. */
function simRetourCouleurRes(f){
  if(!f.retenu)return "#e8564a";
  const part=f.part||0;
  if(part>=0.30)return "#49c07a";
  if(part>=0.10)return "#e0a63c";
  return "#7d8590";
}

function simRetourNotes(vias){
  if(!vias.length)return "";
  let h="";
  const graves=vias.filter(t=>(t.retour||{}).reference_change
                              &&!(t.retour||{}).raccorde
                              &&(t.cavite||{}).impedance_fc_ohm==null
                              &&!(t.cavite||{}).etalement_seul);
  const cavites=vias.filter(t=>(t.cavite||{}).plan_haut);
  const doutes=vias.filter(t=>(t.retour||{}).plan_change
                              &&!(t.retour||{}).reference_change
                              &&(t.retour||{}).nets_differents==null);
  const moignons=vias.filter(t=>((t.moignons||{}).depart)
                                ||((t.moignons||{}).arrivee));
  const flousM=vias.filter(t=>(t.moignons||{}).connu===false);
  const nus=vias.filter(t=>(t.retour||{}).source==="self"
                           &&!(t.retour||{}).reference_change);
  const muets=vias.filter(t=>(t.retour||{}).source==="absent");
  const flous=vias.filter(t=>(t.retour||{}).plans_incertains);

  /* LE DÉFAUT GRAVE EN PREMIER, ET SEUL DE SON ESPÈCE. Il ne se corrige pas
     avec un via de plus : un via de masse joint de la masse à de la masse. */
  if(graves.length){
    const r=graves[0].retour;
    h+='<p class="simNote simAlerte">· <b>Le plan de référence change</b> à '+
       (graves.length>1?graves.length+" vias":"ce via")+" — "+
       simEsc((r.plans_depart||["?"]).join("/"))+" d'un côté, "+
       simEsc((r.plans_arrivee||["?"]).join("/"))+" de l'autre — et aucun via "+
       "de masse ne joint les deux. Le courant de retour passe par la cavité "+
       "entre plans et ses condensateurs de découplage, absents de ce modèle : "+
       "l'inductance réelle est plus grande, donc |S₁₁| est meilleur ici qu'il "+
       "ne le sera sur la carte. Un via de masse n'y peut rien — il joindrait "+
       "de la masse à de la masse. La réponse est de garder la même référence "+
       "des deux côtés du via.</p>";
  }
  /* « PLANCHER » N'EST PAS UNE PRÉCAUTION DE STYLE. Sans retour identifié, le
     courant revient quand même — par le cuivre des plans, plus loin. La self
     partielle est ce que vaudrait la boucle si le retour était collé au via :
     la vraie valeur est plus grande, jamais plus petite. Annoncer un chiffre
     tout court laisserait croire qu'on a mesuré la carte. */
  /* LE DOUTE EST UNE RÉPONSE, ET IL DOIT ÊTRE LISIBLE COMME TELLE. Deux plans
     de NOMS différents ne sont pas deux plans de NETS différents : « TOP se
     réfère à In1, BOT se réfère à In2 » est le cas ordinaire d'une carte
     quatre couches, qu'un via de masse referme si les deux sont de la masse.
     Trancher au vu des seuls noms faisait crier au défaut grave sur toute
     carte correcte dont l'empilage ne nomme pas ses nets. */
  if(doutes.length){
    const r=doutes[0].retour;
    h+='<p class="simNote">· Le plan de référence change à '+
       (doutes.length>1?doutes.length+" vias":"ce via")+" — "+
       simEsc((r.plans_depart||["?"]).join("/"))+" d'un côté, "+
       simEsc((r.plans_arrivee||["?"]).join("/"))+" de l'autre — et "+
       "<b>on ne peut pas dire si c'est grave</b> : l'empilage ne déclare pas "+
       "le net de ces plans. Deux plans de MASSE sont le cas ordinaire, qu'un "+
       "via de masse referme ; une masse et une alimentation sont le défaut "+
       "que rien ne referme. Renseigner le net des plans tranche.</p>";
  }
  if(cavites.length){
    const cav=cavites[0].cavite;
    /* CE QUE LE RETOUR TRAVERSE, ET PAR OÙ. Un via de masse ne peut PAS joindre
       deux plans de nets différents ; le courant passe par la capacité
       répartie des deux plans et par les découplages qui les joignent. C'est
       la section 7.14 de Bogatin : le plan intermédiaire, même flottant, porte
       des courants induits qui referment la boucle. Il n'y a jamais « pas de
       chemin » — il y a un chemin dont on connaît plus ou moins bien le prix. */
    h+='<p class="simNote">· Le retour change de plan — '+
       simEsc(cav.plan_haut+" → "+cav.plan_bas)+", "+simNb(cav.hauteur_mm,3)+
       " mm entre eux. <b>Aucun via de masse ne peut les joindre</b> : il "+
       "joindrait de la masse à de la masse. Le courant passe par la capacité "+
       "répartie des deux plans ("+simNb(cav.capacite_plans_pF,0)+" pF"+
       (cav.aire_source==="page"?"":", aire supposée")+") et par les "+
       "découplages.</p>";
    if(cav.etalement_seul){
      h+='<p class="simNote">· Cette page ne cherche pas les découplages : on '+
         "ne compte que l'étalement dans les plans ("+
         simNb(cav.etalement_cavite_nH,2)+" nH), et la traversée est donc "+
         "<b>sous-estimée</b>.</p>";
    }else{
      h+='<p class="simNote">· La traversée pèse <b>'+
         simNb(cav.impedance_fc_ohm,2)+" Ω</b> à f₀, cascadés dans le "+
         "résultat"+
         (cav.borne
           ? " — mais aucun découplage n'a été trouvé dans "+
             simNb(cav.rayon_mm,1)+" mm : on a supposé le plus proche <b>à ce "+
             "rayon</b>, ce qui est un <b>minorant</b>."
           : ", par "+simEsc(cav.pont.repere||"le découplage le plus proche")+
             " à "+simNb(cav.pont.distance_mm,2)+" mm.")+
         " Elle se décompose en "+simNb(cav.etalement_nH,2)+
         " nH d'étalement dans les plans (Bogatin éq. 13-35) et "+
         simNb(cav.esl_nH,2)+" nH de montage du condensateur"+
         (cav.esl_source==="page"?"":", supposés")+".</p>";
      /* LE CONSEIL N'EST PAS CELUI QU'ON ATTEND, et c'est pour cela qu'il est
         écrit. L'étalement croît LINÉAIREMENT avec l'écart entre plans et
         seulement en LOGARITHME avec la distance au condensateur. */
      h+='<p class="simNote">· Rapprocher le découplage ne gagne qu\'en '+
         "logarithme ; amincir le diélectrique entre les deux plans gagne "+
         "proportionnellement. L'impédance de la paire de plans vaut ici "+
         simNb(cav.impedance_plans_ohm,2)+" Ω — c'est elle qu'il faut comparer "+
         "à celle de la ligne pour savoir si la traversée compte.</p>";
    }
  }
  if(moignons.length){
    const f=(moignons[0].moignons.arrivee||moignons[0].moignons.depart);
    h+='<p class="simNote">· '+
       (moignons.length>1?moignons.length+" vias laissent":"Le via laisse")+
       " un <b>moignon</b> — la part du perçage que le signal n'emprunte pas. "+
       "Il pend en circuit ouvert et charge la liaison : "+
       simNb(f.longueur_mm,3)+" mm valent "+simNb(f.capacite_fF,0)+
       " fF ici. À sa résonance quart d'onde ("+
       simNb((f.resonance_hz||0)/1e9,1)+" GHz) il la <b>court-circuite</b>. "+
       "Un via enterré ou un contre-perçage l'enlèvent.</p>";
  }
  if(flousM.length)
    h+='<p class="simNote">· La portée percée des vias n\'est pas envoyée par '+
       "cette page : on ne peut pas savoir s'ils laissent un moignon. Un via "+
       "traversant utilisé jusqu'à une couche interne et un via enterré bien "+
       "ajusté ont ici exactement la même apparence.</p>";
  if(nus.length)
    h+='<p class="simNote">· Aucun via de masse ne referme la boucle à '+
       (nus.length>1?nus.length+" vias":"ce via")+" : le chiffre affiché est "+
       "la self d'un conducteur seul, c'est-à-dire un <b>plancher</b> — la "+
       "boucle réelle vaut davantage — et il <b>ne dépend pas du routage</b>.</p>";
  if(muets.length)
    h+='<p class="simNote">· Les vias de masse voisins ne sont pas envoyés par '+
       "cette page : le chiffre affiché est la self d'un conducteur seul, un "+
       "<b>plancher</b> qui ne dépend pas de leur placement.</p>";
  if(flous.length)
    h+='<p class="simNote">· L\'empilage ne déclare pas le net de ses plans : '+
       "on ne peut pas distinguer un plan de masse d'un plan d'alimentation, "+
       "et les vias de retour sont acceptés sans cette vérification. Renseigner "+
       "le net des plans lèverait le doute.</p>";

  /* LA PORTÉE SUPPOSÉE. L'IPC-2581 ne déclare pas les couches d'un perçage :
     un via enterré pris pour traversant rend une inductance trop PETITE de
     près de vingt pour cent, donc flatteuse. Le dire est tout ce qu'on peut
     faire, et c'est mieux que de rendre la visionneuse aveugle. */
  if(vias.some(t=>(t.retour||{}).portee_supposee))
    h+='<p class="simNote">· La portée des vias de masse est <b>supposée '+
       "traversante</b> : le format ne déclare pas les couches d'un perçage. "+
       "Un via enterré compté comme traversant donnerait une inductance trop "+
       "faible.</p>";

  /* LA RÉPARTITION DU COURANT, quand il y a de quoi la montrer. Elle dit
     LEQUEL des vias travaille — et donc lequel ne sert à rien là où il est. */
  const partages=vias.filter(t=>((t.retour||{}).retenus||0)>1);
  if(partages.length){
    const r=partages[0].retour;
    const parts=(r.vias||[]).filter(v=>v.retenu)
      .map(v=>simNb(v.distance_mm,2)+" mm : "+Math.round(100*v.part)+" %");
    h+='<p class="simNote">· Les vias de retour ne se partagent pas le courant '+
       "à parts égales — leur mutuelle les en empêche, et c'est pourquoi trois "+
       "vias ne divisent pas l'inductance par trois. Au tronçon "+
       partages[0].troncon+" : "+simEsc(parts.join(" · "))+".</p>";
  }

  /* LA FOURCHETTE D'ANTIPAD, quand les plans traversés n'ont pas la même
     règle. Le calcul prend le plus serré ; le taire donnerait un chiffre exact
     à l'air d'être le seul possible. */
  const fourchette=vias.filter(t=>(t.cotes||{}).antipad_max
                                  &&(t.cotes||{}).antipad_max>(t.cotes||{}).antipad_mm);
  if(fourchette.length){
    const c=fourchette[0].cotes;
    h+='<p class="simNote">· Les plans traversés n\'ont pas la même règle '+
       "d'isolation : l'antipad va de "+simNb(c.antipad_mm,2)+" à "+
       simNb(c.antipad_max,2)+" mm. La capacité est calculée au plus serré, "+
       "c'est-à-dire au plus capacitif.</p>";
  }
  return h;
}

function simCoplanaire(res){
  const cop=res.segments.filter(s=>s.coplanaire&&s.ecart>0);
  if(!cop.length)return "";
  const ecarts=[...new Set(cop.map(s=>s.ecart))].sort((a,b)=>a-b);
  /* « à de 0,287 à 0,293 mm » : la phrase portait déjà son « à », et la plage en
     ajoutait un second. Une fourchette se dit « entre … et … », un écart unique
     « à … » — deux tournures, pas une avec un trou dedans. */
  const quoi=ecarts.length>1
    ? "entre "+simNb(ecarts[0],3)+" et "+
      simNb(ecarts[ecarts.length-1],3)+" mm"
    : "à "+simNb(ecarts[0],3)+" mm";
  const refs=simRefListe();
  /* CE N'EST PAS UNE RÉSERVE, C'EST LE CALCUL QUI A ÉTÉ FAIT, et la phrase
     doit le dire dans cet ordre. Écrite comme un avertissement — « du cuivre
     borde la piste », « l'ignorer donnerait un chiffre trop haut » — elle se
     lisait comme un défaut de la carte, alors qu'une piste RF noyée dans un
     plan arrosé et cousu est le cas NORMAL, que c'est ce qui la fait tomber à
     l'impédance voulue, et que l'outil l'a pris en compte. Le chiffre affiché
     est celui de la carte ; c'est un calculateur de microruban ordinaire qui
     se tromperait ici, pas celui-ci. */
  let h='<p class="simNote">· Ligne <b>coplanaire</b> — le cas ordinaire sur '+
    "une carte RF arrosée : du cuivre de masse borde la piste sur sa propre "+
    "couche, "+quoi+". Ce cuivre prend une part du champ et abaisse Z₀ de "+
    "plusieurs ohms, et <b>l'impédance affichée en tient compte</b> : c'est "+
    "pour cela qu'elle décrit votre carte, là où un calculateur de microruban "+
    "ordinaire sortirait nettement plus haut sur la même piste. Chaque côté "+
    "est mesuré SÉPARÉMENT et entre dans le calcul pour ce qu'il est. "+
    "L'écart vient "+
    (SIM_ED&&SIM_ED.outil==="editeur-pcb"
      ? "de la règle d'isolation qui creuse le plan"
      : "d'une mesure sur le cuivre du fichier")+
    (refs.length?", et « masse » veut dire "+simEsc(refs.join(", ")):"")+
    "."+
    /* CE QUE CE CALCUL SUPPOSE est contrôlé par la note suivante, et les deux
       ne se lisent bien qu'ensemble : le cuivre latéral n'est tenu à zéro volt
       que si des vias l'y ramènent. Renvoyer explicitement évite qu'on lise
       l'une sans l'autre. */
    (SIM.couture
      ? " Ce que ce calcul suppose — que ce cuivre soit vraiment de la masse — "+
        "est contrôlé juste en dessous."
      : "")+
    "</p>";

  /* CE QUE LA DISSYMÉTRIE A CHANGÉ. Une piste dont les deux bords ne voient
     pas la même chose est le cas ordinaire dès qu'un plan s'arrête, et c'est
     précisément ce que le calcul d'avant ne savait pas prendre. Le dire avec
     le pire écart des deux côtés permet de juger si ça compte. */
  let pire=null;
  for(const s of cop){
    const g=s.ecart_g, d=s.ecart_d;
    if(!(g>0&&d>0))continue;
    const r=Math.max(g,d)/Math.min(g,d);
    if(!pire||r>pire.r)pire={r:r, g:Math.min(g,d), d:Math.max(g,d)};
  }
  if(pire&&pire.r>1.5)
    h+='<p class="simNote">· Masse <b>dissymétrique</b> : jusqu\'à '+
      simNb(pire.g,3)+" mm d'un côté contre "+simNb(pire.d,3)+
      " mm de l'autre. Les deux côtés partent au solveur tels quels — les "+
      "poser égaux, comme le faisait la version précédente, aurait fait "+
      "tomber Z₀ nettement trop bas.</p>";
  return h;
}

/* De combien la dispersion a déplacé Z₀ entre le quasi-statique et f₀ : on
   prend l'écart le plus fort de la sélection, parce que c'est celui qui décide
   si le chiffre affiché tient encore. */
function simDispersion(segments){
  let pire=null;
  for(const s of segments){
    if(!(s.z0>0)||!(s.z0_statique>0))continue;
    const e=Math.abs(s.z0-s.z0_statique)/s.z0_statique;
    if(!pire||e>pire.e)pire={e:e, s:s};
  }
  if(!pire||pire.e<0.01)return "";
  return "Dispersion (Getsinger) : à f₀ elle porte Z₀ de "+
         simNb(pire.s.z0_statique,1)+" Ω à "+simNb(pire.s.z0,1)+" Ω sur le "+
         "tronçon le plus touché, soit "+simNb(100*pire.e,1)+" %. "+
         "C'est un modèle, pas un calcul — au-delà de quelques gigahertz sur "+
         "stratifié courant, ce déplacement-là est le moins sûr du résultat.";
}

/* Les tronçons identiques qui se suivent, regroupés. « Identiques » veut dire
   même couche, même largeur, même impédance — donc la même section droite. */
function simGrouper(segments){
  const out=[];
  for(const s of segments){
    const p=out[out.length-1];
    if(p&&p.seg.couche===s.couche&&p.seg.largeur===s.largeur&&
       p.seg.z0===s.z0){
      p.n++; p.longueur+=s.longueur; continue;
    }
    out.push({seg:s, n:1, longueur:s.longueur,
              couche:s.nom_couche||("couche "+s.couche)});
  }
  return out;
}

/* ==========================================================================
   Le panneau
   ========================================================================== */
/* Les champs de nombres sont des champs TEXTE, avec `inputmode="decimal"` :
   ce panneau écrit ses valeurs avec la virgule décimale d'ici, et un
   `<input type="number">` refuse la virgule dès que le navigateur n'est pas en
   français — le champ se vide alors tout seul, en silence, et une bande
   0,1 GHz démarre à blanc. La lecture, elle, accepte les deux. C'est la règle
   du panneau d'empilage de la visionneuse (`pnlChamp`, 05-panneaux.js). */
function simChamp(id,titre,large){
  return '<input id="'+id+'" type="text" inputmode="decimal" spellcheck="false"'+
         (large?' class="large"':"")+' title="'+simEsc(titre)+'">';
}
/* L'UNITÉ DES FRÉQUENCES, EN LISTE PLUTÔT QU'EN ÉTIQUETTE. Le champ portait
   « GHz » écrit à côté, et écrire 868 dans un champ qui attend des gigahertz
   est une faute qu'on ne voit pas : elle ne produit ni refus ni champ vide,
   seulement une bande de trois cents fois trop haut que le serveur ramène au
   bord — avec des pertes fausses d'un facteur trois et le repère f₀ posé
   ailleurs qu'où on croit. Une liste ne se trompe pas de la même façon : on y
   choisit MHz, et 868 veut alors dire ce qu'on voulait dire.

   UNE SEULE LISTE POUR LES TROIS CHAMPS — f₀, début et fin de bande. Trois
   listes séparées permettraient d'écrire une bande en mégahertz et sa
   fréquence centrale en gigahertz, ce qui est précisément l'erreur qu'on
   cherche à rendre impossible. */
/* LE MÊME SÉLECTEUR SERT LES DEUX, et il en faut deux : f₀ et la bande ne se
   lisent pas dans la même unité dès qu'une carte travaille à 250 MHz sur une
   bande qui monte au gigahertz. `quoi` ne change que l'infobulle — le reste est
   identique, et c'est bien pour cela qu'une seule fonction les pose. */
function simChampUnite(id,quoi){
  let h='<select class="simU simUSel" id="'+id+'" title="Unité de '+quoi+
        ". En changer CONVERTIT ce qui est écrit, cela ne le réinterprète "+
        'pas.">';
  for(const u of SIM_UNITES)
    h+='<option value="'+u.cle+'">'+u.cle+"</option>";
  return h+"</select>";
}
/* ==========================================================================
   DEUX FAMILLES, ET DES ANALYSES DEDANS
   --------------------------------------------------------------------------
   Le panneau n'a longtemps porté qu'une question — que vaut l'impédance de ce
   cuivre — et son corps était écrit en dur. Il en portera d'autres, et elles
   ne se rangent pas toutes au même endroit : l'intégrité du SIGNAL demande ce
   qu'un front devient en chemin, l'intégrité de l'ALIMENTATION ce que le
   réseau de distribution laisse passer. Ce sont deux métiers, deux jeux de
   questions, deux façons de lire le résultat ; les empiler dans une seule
   liste d'options obligerait à lire quatre lignes de saisie pour trouver la
   sienne.

   D'où ce registre. Une famille porte des analyses ; une analyse déclare son
   nom, ce qu'elle demande (`corps`), comment on la branche (`brancher`), ce
   qu'elle écrit (`rendre`), et si elle PEINT la carte. Ajouter une analyse,
   c'est ajouter une entrée ici — pas toucher au panneau.

   ON N'INVENTE PAS DE PLACEHOLDERS. La famille PI n'a aucune analyse, et elle
   le dit en toutes lettres plutôt que d'afficher des onglets grisés qui
   promettent ce qui n'existe pas. Un onglet qui ne fait rien coûte plus cher
   qu'une phrase honnête.
   ========================================================================== */
const SIM_FAMILLES=[
  {cle:"si", court:"SI", nom:"Intégrité du signal",
   quoi:"Ce qu'un front devient en parcourant le cuivre : impédance, retard, "+
        "pertes, réflexions.",
   analyses:["impedance"]},
  {cle:"pi", court:"PI", nom:"Intégrité de l'alimentation",
   quoi:"Ce que le réseau de distribution laisse passer : chute continue, "+
        "impédance vue par le composant, résonances de plan.",
   analyses:["dc"]}
];

/* Le catalogue des analyses. `impedance` est la seule à exister, et tout ce
   qu'elle fait était jusqu'ici le panneau entier — d'où les fonctions qui
   suivent, qui n'ont pas changé de contenu, seulement de propriétaire. */
const SIM_ANALYSES={
  impedance:{
    nom:"Impédance",
    titre:"Impédance caractéristique du cuivre sélectionné, tronçon par "+
          "tronçon, et paramètres S de la liaison.",
    peint:true,
    corps:simCorpsImpedance,
    brancher:simBrancherImpedance,
    rendre:simRendreImpedance
  },
  dc:{
    nom:"Chute DC",
    titre:"Chute de tension continue dans le cuivre (IR drop).",
    /* `peint` COMMANDE simZActif(), donc la carte de chaleur des IMPÉDANCES.
       La chute DC ne peint pas la même chose, et pas sur le même cuivre :
       elle passe par `peindreDC()` de l'adaptateur, quand celui-ci existe.
       Le mettre à vrai ferait repeindre les Z₀ sous l'onglet DC. */
    peint:false,
    corps:simCorpsDC,
    brancher:simBrancherDC,
    rendre:simRendreDC
  }
};

/* La famille courante, et l'analyse dedans. Une famille vide n'a pas
   d'analyse : `SIM.analyse` vaut alors "" et tout ce qui calcule se tait. */
function simFamille(cle){
  return SIM_FAMILLES.find(f=>f.cle===(cle||SIM.famille))||SIM_FAMILLES[0];
}
function simAnalyse(){
  return SIM.analyse?SIM_ANALYSES[SIM.analyse]:null;
}
/* Peut-on calculer ici ? Tout ce qui lance, exporte ou peint passe par là :
   un seul endroit décide, et une famille sans analyse ne peut rien déclencher
   par mégarde. */
function simCalculable(){
  const a=simAnalyse();
  return !!(a&&a.corps);
}

/* Les onglets. Deux rangées : la famille, puis l'analyse dans la famille. La
   seconde s'affiche même quand elle ne porte qu'un onglet — elle NOMME ce
   qu'on regarde, et ce nom est justement ce qui manquera le jour où il y en
   aura trois. */
function simOnglets(){
  let h='<div class="simFam" role="tablist">';
  for(const f of SIM_FAMILLES)
    h+='<button class="simOnglet'+(f.cle===SIM.famille?" on":"")+
       '" data-fam="'+f.cle+'" title="'+simEsc(f.quoi)+'">'+
       '<b>'+f.court+"</b> "+simEsc(f.nom)+"</button>";
  h+="</div>";

  const fam=simFamille();
  h+='<div class="simAna" role="tablist">';
  if(!fam.analyses.length)
    h+='<span class="simAnaVide">aucune analyse pour l\'instant</span>';
  else for(const cle of fam.analyses){
    const a=SIM_ANALYSES[cle];
    if(!a)continue;
    h+='<button class="simOnglet mini'+(cle===SIM.analyse?" on":"")+
       '" data-ana="'+cle+'" title="'+simEsc(a.titre)+'">'+
       simEsc(a.nom)+"</button>";
  }
  h+="</div>";
  return h;
}

/* Le corps de l'analyse courante, replacé et rebranché. Appelé au démarrage et
   à chaque changement d'onglet — il n'y a pas deux chemins pour poser le
   panneau, donc pas deux états possibles. */
function simPoser(){
  const onglets=simEl("simOnglets"), ctl=simEl("simCtl");
  if(onglets)onglets.innerHTML=simOnglets();
  if(ctl)ctl.innerHTML=simCalculable()?simAnalyse().corps():"";
  if(onglets)for(const b of onglets.querySelectorAll("[data-fam]"))
    b.onclick=function(){simAllerFamille(this.getAttribute("data-fam"));};
  if(onglets)for(const b of onglets.querySelectorAll("[data-ana]"))
    b.onclick=function(){simAllerAnalyse(this.getAttribute("data-ana"));};
  if(simCalculable()&&simAnalyse().brancher)simAnalyse().brancher();
  simRendre();
}
/* Changer de famille prend sa première analyse, ou aucune si elle est vide. */
function simAllerFamille(cle){
  if(cle===SIM.famille)return;
  SIM.famille=cle;
  const fam=simFamille();
  SIM.analyse=fam.analyses[0]||"";
  simPoser();
  /* La carte de chaleur appartient à l'analyse d'impédance : quitter celle-ci
     doit l'éteindre. Le résultat, lui, est GARDÉ — revenir sur l'onglet le
     retrouve tel quel, et relancer un calcul pour rien serait à la fois lent
     et impoli. C'est `simZActif()` qui tranche, en un seul endroit. */
  simRepeindre();
}
function simAllerAnalyse(cle){
  if(cle===SIM.analyse||!SIM_ANALYSES[cle])return;
  SIM.analyse=cle;
  simPoser();
  simRepeindre();
}

function simCorps(){
  return '<div id="simOnglets"></div><div id="simCtl"></div>'+
         '<div class="scroll" id="simSortie"></div>';
}

function simCorpsImpedance(){
  return ''+
  /* La masse de référence en TÊTE des commandes, et non repliée en bas : elle
     commande le calcul coplanaire, donc plusieurs ohms sur le résultat. Elle se
     remplit à part (`simRefEcrire`) parce qu'elle dépend de la carte ouverte, et
     que ce corps-là est posé une fois pour toutes. */
  '<div class="pnl-bar simRefBar" id="simRefBar"></div>'+
  '<div class="pnl-bar">'+
    '<span class="pnl-lbl">Cible</span>'+
    simChamp("simZCible","Impédance visée pour la piste sélectionnée")+
    '<span class="simU">Ω</span>'+
    '<span class="pnl-lbl">Tolérance</span>'+
    simChamp("simZTol","En pourcentage de la cible. 10 % est l'usage.")+
    '<span class="simU">%</span>'+
    '<span class="simU" id="simZTolAbs">—</span>'+
  '</div>'+
  '<div class="pnl-bar simBarF">'+
    '<span class="pnl-lbl">Fréquence</span>'+
    simChamp("simFc","Fréquence centrale : c'est à celle-ci que l'impédance "+
                     "est donnée et que la carte est peinte")+
    simChampUnite("simFUnite","la fréquence centrale")+
    '<span class="pnl-lbl">Réf.</span>'+
    simChamp("simZ0","Impédance de référence des ports, pour les paramètres S")+
    '<span class="simU">Ω</span>'+
  '</div>'+
  '<div class="pnl-bar simBarF">'+
    '<span class="pnl-lbl">Bande S</span>'+
    simChamp("simF1","Début de bande, dans l'unité choisie à droite")+
    simChampUnite("simFUniteBande1","le début de la bande S")+
    '<span class="simSep">→</span>'+
    simChamp("simF2","Fin de bande, dans l'unité choisie à droite")+
    simChampUnite("simFUniteBande2","la fin de la bande S")+
    '<span class="simGr"><span class="pnl-lbl">Points</span>'+
    simChamp("simN","Nombre de points de la courbe S")+"</span>"+
  '</div>'+
  /* CE QUE LE SERVEUR AURAIT CORRIGÉ EN SILENCE, dit AVANT le calcul. Il
     ramène bien une f₀ hors bande au bord et le signale — mais il le signale
     APRÈS, sous un résultat déjà lu, dont les pertes portent alors sur une
     autre fréquence que celle qu'on croyait avoir demandée. */
  '<div class="pnl-bar simFAvertBar"><span id="simFAvert"></span></div>'+
  '<div class="pnl-bar">'+
    '<button class="tb mini on" id="simGo" title="Calculer la sélection">▶ Calculer</button>'+
    '<button class="tb mini" id="simCsv" title="Le tableau des tronçons, à joindre à un dossier de fabrication">.csv</button>'+
    '<button class="tb mini" id="simS2p" title="Les paramètres S au format Touchstone">.s2p</button>'+
    '<button class="tb mini" id="simJson" title="Le problème lui-même : il se donne au solveur en ligne de commande">.json</button>'+
    '<label class="simSuivre" title="Recalculer à chaque changement de sélection"><input type="checkbox" id="simAuto"> suivre</label>'+
  '</div>';
}

function simZTolEcrire(){
  const el=simEl("simZTolAbs");
  if(el)el.textContent="± "+simNb(simZTolAbs(),1)+" Ω";
}
/* Un nombre écrit comme on le saisirait : virgule décimale, et pas les douze
   décimales parasites que laisse une division par un million. */
function simNbLibre(v){
  if(!isFinite(v))return "";
  return String(Number(Number(v).toPrecision(12))).replace(".",",");
}

function simSaisieEcrire(){
  const s=SIM.saisie, pose=(id,v)=>{const e=simEl(id);if(e)e.value=v;};
  const k=simUnite().f, kb1=simUniteBande1().f, kb2=simUniteBande2().f;
  pose("simF1",simNbLibre(s.f1/kb1));
  pose("simF2",simNbLibre(s.f2/kb2));
  pose("simFc",simNbLibre(s.fc/k));
  pose("simN",s.points); pose("simZ0",s.z0);
  pose("simZCible",String(s.cible).replace(".",","));
  pose("simZTol",String(s.tolPct).replace(".",","));
  const sel=simEl("simFUnite");
  if(sel)sel.value=simUnite().cle;
  const selb1=simEl("simFUniteBande1");
  if(selb1)selb1.value=simUniteBande1().cle;
  const selb2=simEl("simFUniteBande2");
  if(selb2)selb2.value=simUniteBande2().cle;
  simZTolEcrire();
  simFAvertEcrire();
}
/* Ce que l'utilisateur a saisi, ramené aux unités du document : les fréquences
   se saisissent dans l'unité choisie et circulent en hertz. Une saisie vide ou
   aberrante retombe sur la valeur précédente plutôt que sur zéro — une bande
   nulle est un refus du serveur, pas une intention.

   LE PLANCHER SUIT L'UNITÉ : un hertz, quelle que soit la case dans laquelle
   on l'écrit. Il était figé à 1e-6, ce qui voulait dire un kilohertz en GHz —
   et aurait voulu dire un millionième de hertz en Hz. */
function simSaisie(){
  const lu=(id,defaut,mini)=>{
    const el=simEl(id);
    const v=el?parseFloat(String(el.value).replace(",",".")):NaN;
    return (isFinite(v)&&v>=(mini==null?0:mini))?v:defaut;
  };
  const s=SIM.saisie, k=simUnite().f, kb1=simUniteBande1().f, kb2=simUniteBande2().f;
  /* LE PLANCHER SUIT SON PROPRE CHAMP : un hertz reste un hertz, mais il ne
     s'écrit pas pareil selon la case, et les deux cases n'ont plus la même. */
  s.f1=lu("simF1",s.f1/kb1,1/kb1)*kb1;
  s.f2=lu("simF2",s.f2/kb2,1/kb2)*kb2;
  s.fc=lu("simFc",s.fc/k,1/k)*k;
  s.points=Math.round(lu("simN",s.points,1));
  s.z0=lu("simZ0",s.z0,1);
  s.cible=lu("simZCible",s.cible,0.1);
  s.tolPct=lu("simZTol",s.tolPct,0);
  return s;
}

/* CHANGER D'UNITÉ CONVERTIT, ÇA NE RÉINTERPRÈTE PAS. 868 en MHz devient 0,868
   en GHz, jamais 868 GHz : la valeur physique ne bouge pas, seule son écriture
   change. C'est ce qui fait qu'on peut choisir son unité APRÈS avoir tapé, et
   qu'aucun résultat déjà calculé n'est invalidé au passage. */
function simUniteChanger(cle,laquelle){
  if(!SIM_UNITES.some(u=>u.cle===cle))return;
  simSaisie();                       // fige ce qui est écrit, ancienne unité
  if(laquelle==="bande1")SIM.saisie.uniteBande1=cle;
  else if(laquelle==="bande2")SIM.saisie.uniteBande2=cle;
  else if(laquelle==="bande")SIM.saisie.uniteBande=cle;
  else                  SIM.saisie.unite=cle;
  simSaisieEcrire();                 // le réécrit dans la nouvelle
}

/* CE QUE LE SERVEUR AURAIT CORRIGÉ EN SILENCE. Il ramène bien une f₀ hors
   bande au bord le plus proche et le dit — mais dans les avertissements du
   RÉSULTAT, donc après coup, sous des pertes qui portent alors sur une autre
   fréquence que celle qu'on croyait avoir demandée. Le dire pendant la saisie
   coûte deux comparaisons. */
function simFAvertEcrire(){
  const el=simEl("simFAvert");
  if(!el)return;
  const s=SIM.saisie;
  const f1=Math.min(s.f1,s.f2), f2=Math.max(s.f1,s.f2);
  const txt=(s.fc<f1||s.fc>f2)
    ? "f₀ "+simFreq(s.fc)+" est hors de la bande "+simFreq(f1)+" – "+
      simFreq(f2)+" : le serveur la ramènera au bord, et les pertes affichées "+
      "ne seront pas celles de f₀."
    : "";
  el.textContent=txt;
  const bar=el.parentNode;
  if(bar)bar.style.display=txt?"flex":"none";
}

/* Ce qu'affiche la zone de sortie, selon là où on en est. Un seul endroit
   décide : sans cela, un message d'erreur survivait au calcul suivant.

   Une famille sans analyse écrit ce qu'elle EST et ce qu'elle n'a pas encore,
   plutôt qu'une page blanche ou un « à venir » qui n'apprend rien. */
function simRendre(){
  const box=simEl("simSortie");
  if(!box)return;
  const a=simAnalyse();
  if(!a){box.innerHTML=simRendreVide();SIM_REPERE=null;return;}
  box.innerHTML=a.rendre?a.rendre():"";
  /* La courbe vient d'être réécrite : ses gestionnaires sont partis avec
     l'ancien DOM, on les remet. Un seul endroit le fait, comme pour le reste. */
  SIM_LARGEUR=box.clientWidth;
  simBrancherCourbe();
  simSurveillerLargeur(box);
}

/* Le panneau se redimensionne — on le détache, on l'agrandit, on le met en
   plein écran. Le tracé est dessiné à une largeur fixée AU MOMENT du rendu :
   sans cela il resterait à l'ancienne, étiré ou rétréci, avec ses cotes
   déformées. On le refait quand la largeur a bougé POUR DE BON : un rendu
   change la barre de défilement, qui change la largeur de quelques pixels, qui
   déclencherait un rendu — la boucle est là, le seuil l'évite.

   TROIS DÉCLENCHEURS, ET C'EST VOULU. `ResizeObserver` est le bon mécanisme et
   le plus prompt, mais il ne livre ses notifications que dans le cycle de
   rendu : une page qui ne compose pas de frame ne le voit jamais partir. Les
   deux autres n'en dépendent pas — le redimensionnement de la fenêtre, et
   l'entrée du pointeur dans la zone de sortie, qui rattrape le cas d'un
   panneau redimensionné à la poignée juste avant qu'on vienne y lire quelque
   chose. Aucun des trois ne redessine si la largeur n'a pas changé, donc les
   cumuler ne coûte rien. */
let SIM_LARGEUR=0, SIM_OBSERVATEUR=null, SIM_RETARD_LARGEUR=null;
function simVerifierLargeur(box,differe){
  if(!SIM.res||!simCalculable()||!box)return;
  if(Math.abs(box.clientWidth-SIM_LARGEUR)<24)return;
  if(SIM_RETARD_LARGEUR)clearTimeout(SIM_RETARD_LARGEUR);
  if(!differe){SIM_RETARD_LARGEUR=null;simRendre();return;}
  SIM_RETARD_LARGEUR=setTimeout(function(){
    SIM_RETARD_LARGEUR=null; simRendre();
  },120);
}
function simSurveillerLargeur(box){
  box.onpointerenter=function(){simVerifierLargeur(box,false);};
  if(SIM_OBSERVATEUR)return;
  if(typeof ResizeObserver==="function"){
    SIM_OBSERVATEUR=new ResizeObserver(function(){
      simVerifierLargeur(box,true);
    });
    SIM_OBSERVATEUR.observe(box);
  }
  if(typeof window!=="undefined"&&window.addEventListener)
    window.addEventListener("resize",function(){
      simVerifierLargeur(simEl("simSortie"),true);
    });
}

function simRendreVide(){
  const fam=simFamille();
  return '<p class="simEtat"><b>'+simEsc(fam.nom)+"</b> — "+simEsc(fam.quoi)+
    "<br><small>Aucune analyse de cette famille n'est encore écrite. Ce qui "+
    "existe est dans <b>SI</b>, à côté.<br>"+
    "Le jour où l'une arrive, elle se déclare dans <code>SIM_ANALYSES</code> "+
    "(<code>commun/simulation-em.js</code>) et l'onglet apparaît tout seul."+
    "</small></p>";
}

function simRendreImpedance(){
  if(SIM.occupe)
    return '<p class="simEtat">Le solveur travaille…<br>'+
      "<small>Une résolution de section par largeur et par couche, puis les "+
      "paramètres S sur la bande.</small></p>";
  if(SIM.err)return '<p class="simErr">'+simEsc(SIM.err)+"</p>";
  if(SIM.res)return simFiche();
  return '<p class="simEtat">Sélectionnez une piste, puis calculez.<br>'+
    "<small><b>Clic</b> : le tronçon cliqué seul. <b>Maj+clic</b> : la piste "+
    "entière. <b>Maj+clic à nouveau</b> : la piste sur toutes les couches.<br>"+
    "Le calcul a lieu sur le serveur (<code>python serveur.py</code>) : le "+
    "solveur est en Python.</small></p>";
}

/* ==========================================================================
   Lancer
   ========================================================================== */
function simProbleme(){
  if(!SIM_ED||typeof SIM_ED.probleme!=="function"){
    SIM.err="Cet outil ne sait pas décrire de problème.";
    return null;
  }
  const p=SIM_ED.probleme(simSaisie());
  if(!p||p.erreur){
    SIM.err=((p&&p.erreur)||"Rien à calculer.")+
            ((p&&p.conseil)?"\n"+p.conseil:"");
    return null;
  }
  p.doc.format=SIM_FORMAT;
  p.doc.source=SIM_ED.outil;
  /* L'HYPOTHÈSE PART AVEC LE PROBLÈME. Le serveur ne s'en sert pas — les écarts
     sont déjà mesurés — mais le résultat, le .csv et l'entête Touchstone doivent
     dire ce qui a été tenu pour de la masse. Un chiffre sans son hypothèse
     n'est pas vérifiable. */
  p.doc.reference_nets=simRefListe();
  SIM.doc=p.doc;
  SIM.portee=p.portee||"";
  SIM.notes=p.notes||[];
  SIM.couture=p.couture||null;
  SIM.voisins=p.voisins||[];
  SIM.err="";
  return p;
}

async function simGo(){
  if(SIM.occupe||!simCalculable())return;
  /* Le résultat précédent s'efface AVANT le calcul : garder à l'écran, et sur
     la carte, la couleur d'une autre sélection est le meilleur moyen de lire
     un chiffre pour un autre. */
  SIM.res=null; SIM.objets=[]; SIM.err="";
  const p=simProbleme();
  if(!p){simRendre();simRepeindre();return;}
  SIM.occupe=true; simRendre(); simRepeindre();
  try{
    const res=await simLancer(p.doc);
    if(res.segments.length!==p.objets.length)
      throw new Error("Le serveur a rendu "+res.segments.length+
                      " tronçon(s) pour "+p.objets.length+" envoyé(s).");
    /* Le nom de couche est connu de l'outil, pas du serveur : on le recopie
       ici pour que le tableau le nomme au lieu d'un indice. */
    res.segments.forEach((s,i)=>{s.nom_couche=p.objets[i].couche||"";});
    SIM.res=res; SIM.objets=p.objets;
    SIM.suivre=true;
    const el=simEl("simAuto");
    if(el&&!el.checked)el.checked=true;
    if(SIM_ED.astuce)
      SIM_ED.astuce("Simulation : "+res.ligne.troncons+" tronçon(s), Z₀ "+
                    simNb(res.ligne.z0_min,1)+"–"+simNb(res.ligne.z0_max,1)+
                    " Ω à "+simFreq(res.f_centre)+".");
  }catch(e){
    SIM.err=e.message||String(e);
  }finally{
    SIM.occupe=false; simRendre(); simRepeindre();
  }
}

function simRepeindre(){
  if(SIM_ED&&SIM_ED.redessiner)SIM_ED.redessiner();
}

/* ==========================================================================
   Enregistrer les trois sorties
   ========================================================================== */
function simExportCsv(){
  if(!SIM.res){SIM.err="Rien à enregistrer : calculez d'abord.";simRendre();return;}
  const n=v=>String(v).replace(".",",");
  const c=SIM.saisie.cible;
  const verdict=z=>z>0?(simZVerdict(z)>0?"trop eleve"
                       :(simZVerdict(z)<0?"trop faible":"dans la tolerance"))
                     :"non calculable";
  /* `z0_statique` accompagne `z0` : la différence entre les deux est ce que la
     dispersion a ajouté, et c'est la part la moins sûre du chiffre. Un dossier
     de fabrication qui reprend l'un doit pouvoir retrouver l'autre. */
  /* L'écart de masse tient TROIS colonnes et non une : le côté gauche, le côté
     droit, et le nombre de côtés qui portent de la masse. Une seule colonne ne
     pouvait pas distinguer une coplanaire serrée des deux côtés d'une piste qui
     longe une découpe — et ce sont plusieurs ohms d'écart. */
  /* LA SECTION RÉSOLUE TIENT SES PROPRES COLONNES. Un `.csv` se détache de la
     page où il a été produit : sans la hauteur au plan, la permittivité et le
     plan de référence, il ne reste qu'une impédance dont on ne peut plus
     vérifier sur quoi elle a été obtenue — et c'est là que se trouve la cause
     neuf fois sur dix quand elle ne tombe pas sur la carte réelle. */
  const l=["troncon;couche;longueur_mm;largeur_mm;topologie;"+
           "ecart_masse_gauche_mm;ecart_masse_droite_mm;cotes_avec_masse;"+
           "plan_reference;h_mm;er;tan_delta;cuivre_mm;couverture_mm;"+
           "z0_ohm;z0_statique_ohm;ecart_ohm;eps_eff;retard_ps;pertes_db;verdict"];
  SIM.res.segments.forEach((s,i)=>{
    l.push([i+1, s.nom_couche||s.couche, n(s.longueur), n(s.largeur),
            simTopo(s).replace(/[éè]/g,"e"),
            s.coplanaire?n(s.ecart_g||0):"",
            s.coplanaire?n(s.ecart_d||0):"",
            s.coplanaire?(s.cotes==null?"":s.cotes):"",
            String(s.plan_haut||s.plan_bas||"").replace(/[;\r\n]+/g," "),
            s.h!=null?n(s.h):"",
            s.er!=null?n(s.er):"",
            s.tan_delta!=null?n(s.tan_delta):"",
            s.cuivre!=null?n(s.cuivre):"",
            s.couverture!=null?n(s.couverture):"",
            s.z0>0?n(Math.round(s.z0*10)/10):"",
            s.z0_statique>0?n(Math.round(s.z0_statique*10)/10):"",
            s.z0>0?n(Math.round((s.z0-c)*10)/10):"",
            s.eps_eff?n(s.eps_eff):"",
            s.retard?n(Math.round(s.retard*1e13)/10):"",
            s.pertes_db!=null?n(s.pertes_db):"",
            verdict(s.z0)].join(";"));
  });
  const L=SIM.res.ligne;
  l.push("");
  l.push("cible_ohm;"+n(c)+";tolerance_pct;"+n(SIM.saisie.tolPct)+
         ";tolerance_ohm;"+n(Math.round(simZTolAbs()*10)/10));
  l.push("frequence_hz;"+n(SIM.res.f_centre)+";z0_moyen_ohm;"+n(L.z0_moyen)+
         ";longueur_mm;"+n(L.longueur)+";pertes_db;"+n(L.pertes_db)+
         ";impedance_reference_ohm;"+
         n(SIM.res.impedance_reference||SIM.saisie.z0));
  l.push("portee;"+(SIM.portee||""));
  /* SOUS QUELLE HYPOTHÈSE. Le calcul coplanaire dépend entièrement de ce qui a
     été tenu pour de la masse : deux jeux de nets donnent deux impédances sur
     le même cuivre. Sans cette ligne, le tableau n'est pas reproductible. */
  const refs=(SIM.res.reference_nets||simRefListe());
  l.push("masse_de_reference;"+(refs.length?refs.join(" "):"non declaree"));
  if(SIM.couture)
    l.push("couture_vias;"+SIM.couture.n+";espacement_max_mm;"+
           n(Math.round(SIM.couture.ecartMax*100)/100)+";couloir_mm;"+
           n(SIM.couture.couloir));
  for(const v of (SIM.voisins||[]))
    l.push("cuivre_voisin_hors_masse;"+String(v.net).replace(/[;\r\n]+/g," ")+
           ";ecart_mm;"+n(v.ecart)+";longueur_mm;"+n(v.longueur));
  /* Les réserves partent AVEC les chiffres. Un .csv se détache de la page où
     il a été produit : sans elles, il ne reste qu'un tableau qui a l'air sûr.
     LES NOTES DE L'OUTIL AUSSI, et elles manquaient : « les vias ne sont pas
     modélisés », « l'épaisseur de diélectrique est supposée » ne partaient
     qu'avec le panneau, et le .csv avait donc l'air plus sûr que la page. */
  for(const a of (SIM.notes||[]))
    l.push("note;"+String(a).replace(/[;\r\n]+/g," "));
  for(const a of (SIM.res.avertissements||[]))
    l.push("avertissement;"+String(a).replace(/[;\r\n]+/g," "));
  /* Le BOM UTF-8 : sans lui, Excel lit les accents de travers. */
  simTelecharger("﻿"+l.join("\r\n")+"\r\n",
                 simNomFichier("-impedance.csv"), "text/csv;charset=utf-8");
}
function simExportS2p(){
  if(!SIM.res||!SIM.res.touchstone){
    SIM.err="Rien à enregistrer : calculez d'abord.";simRendre();return;
  }
  simTelecharger(SIM.res.touchstone,simNomFichier(".s2p"),"text/plain");
}
function simExportJson(){
  const p=simProbleme();
  if(!p){simRendre();return;}
  simTelecharger(JSON.stringify(p.doc,null,1),simNomFichier("-sim.json"),
                 "application/json");
}

/* ==========================================================================
   Branchement
   Appelé une fois par l'outil, quand le DOM est là. `conteneur` est l'élément
   qui reçoit le corps du panneau — chaque outil le déclare dans son HTML.
   ========================================================================== */
function simInit(adaptateur,conteneur){
  SIM_ED=adaptateur;
  const box=(typeof conteneur==="string")?simEl(conteneur):conteneur;
  if(!box||!SIM_ED)return false;

  box.innerHTML=simCorps();
  SIM.ouvert=true;
  simPoser();
  return true;
}

/* Le branchement de l'analyse d'impédance. Il est refait à chaque fois que ses
   commandes sont reposées — changer d'onglet et revenir remplace le DOM, et
   des gestionnaires accrochés à des éléments disparus ne servent personne.
   Les valeurs, elles, vivent dans `SIM.saisie` : elles survivent au va-et-vient
   entre les onglets, ce qui est bien le moindre. */
function simBrancherImpedance(){
  simSaisieEcrire();
  simRefEcrire();
  const pose=(id,quoi,fn)=>{const e=simEl(id);if(e)e[quoi]=fn;};
  pose("simGo","onclick",simGo);
  pose("simCsv","onclick",simExportCsv);
  pose("simS2p","onclick",simExportS2p);
  pose("simJson","onclick",simExportJson);
  const auto=simEl("simAuto");
  if(auto){auto.checked=SIM.suivre;
           auto.onchange=function(){SIM.suivre=this.checked;};}

  /* La cible et la tolérance ne demandent PAS de recalcul : elles ne changent
     pas l'impédance, seulement la bande dans laquelle on la juge. La carte se
     repeint donc au fil de la frappe, sans toucher au serveur. */
  for(const id of ["simZCible","simZTol"])
    pose(id,"oninput",function(){
      simSaisie(); simZTolEcrire(); simRendre(); simRepeindre();
    });
  /* La fréquence et la bande, elles, changent le calcul : le résultat affiché
     ne leur correspond plus, et le dire vaut mieux que de laisser croire. */
  for(const id of ["simFc","simF1","simF2","simN","simZ0"])
    pose(id,"oninput",function(){
      simSaisie();
      simFAvertEcrire();
      if(SIM.res&&!SIM.occupe){
        SIM.res=null; SIM.objets=[];
        SIM.err="La fréquence a changé : relancez le calcul.";
        simRendre(); simRepeindre();
      }
    });
  /* L'UNITÉ NE CHANGE AUCUNE VALEUR, donc elle n'efface aucun résultat : elle
     réécrit les mêmes hertz dans une autre case. C'est la différence avec les
     champs ci-dessus, et c'est ce qui permet de la choisir après coup. */
  pose("simFUnite","onchange",function(){simUniteChanger(this.value,"fc");});
  pose("simFUniteBande1","onchange",
       function(){simUniteChanger(this.value,"bande1");});
  pose("simFUniteBande2","onchange",
       function(){simUniteChanger(this.value,"bande2");});
}

/* La sélection a bougé — ou la carte. L'outil appelle, le panneau suit.

   `garderCarte` évite la boucle : l'outil appelle souvent depuis son propre
   rafraîchissement de panneaux, lui-même suivi d'un redessin. Vrai, on ne
   redemande pas de dessin — celui qui suit lira l'état de toute façon. */
let SIM_MINUTEUR=null;
function simRafraichir(garderCarte){
  /* Une famille sans analyse n'a rien à rafraîchir, et surtout rien à relancer
     en mode « suivre » : le panneau ne doit pas parler au serveur pendant qu'on
     regarde un onglet qui ne calcule pas. */
  if(!SIM.ouvert||!simCalculable())return;
  /* Un résultat porte sur UNE sélection. Dès qu'elle change, il ne vaut plus
     rien : on l'efface, plutôt que de peindre l'impédance d'une piste sur une
     autre. */
  const avait=!!SIM.res;
  SIM.res=null; SIM.objets=[];
  if(avait){SIM.err=""; simRendre();}
  /* La carte a peut-être changé : les candidats à la masse de référence avec
     elle. `simRefEcrire` relit la liste et remet la proposition en vigueur si
     ce n'est plus la même carte — c'est `simRefSet` qui le décide, ici on ne
     fait que réafficher. */
  simRefEcrire();
  if(!garderCarte)simRepeindre();

  /* En mode « suivre », on relance — mais après un court repos : déplacer la
     sélection à la souris déclenche des dizaines de rafraîchissements, et on
     n'envoie pas dix requêtes pour un geste. */
  if(!SIM.suivre||SIM.occupe)return;
  if(SIM_MINUTEUR)clearTimeout(SIM_MINUTEUR);
  SIM_MINUTEUR=setTimeout(function(){SIM_MINUTEUR=null;simGo();},180);
}
