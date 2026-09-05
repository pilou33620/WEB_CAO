/* =============================================================================
   commun/simulation-em.js
   Simulation électromagnétique : le panneau, le transport, la carte de chaleur.

   DEUX FAMILLES, CINQ ANALYSES. Le panneau se range en **SI** — intégrité du
   signal, ce qu'un front devient en parcourant le cuivre — et **PI** —
   intégrité de l'alimentation, ce que le réseau de distribution laisse passer.
   SI porte « Impédance », « Z différentielle », « Crosstalk » et
   « Current Return Path » ; PI porte « Chute DC ».

   TROIS DES QUATRE DE SI LISENT LA MÊME RÉPONSE DU SERVEUR, et c'est voulu :
   changer d'onglet ne relance rien, et les trois fiches parlent
   nécessairement du même cuivre. Elles ne posent pas la même question —
   l'impédance est une propriété de la SECTION DROITE, le chemin de retour une
   propriété de la LIAISON VERTICALE, la Z différentielle une propriété de DEUX
   sections côte à côte. Une piste parfaitement à 50 Ω peut avoir un retour
   catastrophique : des défauts distincts, que les empiler dans une fiche
   unique rendait invisibles.

   LA QUATRIÈME EST À PART, ET C'EST ASSUMÉ. « Crosstalk » a sa propre route
   (`/api/crosstalk`), son propre calcul et son propre résultat, parce qu'elle
   ne répond pas à la même question avec les mêmes données : les trois autres
   lisent une SECTION DROITE, elle lit une MATRICE S MULTI-PORTS le long du
   parcours. Elle dit COMBIEN une voisine prend — en pour-cent de l'agresseur
   et en VOLTS — et OÙ, sur les quarante millimètres qui longent, ce couplage
   se fabrique. Voir « CROSSTALK », plus bas.

   ELLE A REMPLACÉ UN ONGLET « DIAPHONIE », ET LE REMPLACEMENT EST TOTAL. Celui-
   ci résolvait UNE section droite et rendait UN coefficient par longement : il
   disait combien, jamais où, et sa carte de chaleur ATTRIBUAIT le bruit aux
   tronçons au prorata du couplage local au lieu de le mesurer le long de la
   piste. Tout ce qu'il chiffrait — NEXT, FEXT, le budget, la tension de bruit
   sur la victime — se lit désormais sous « Crosstalk », avec une abscisse en
   plus. Garder les deux aurait laissé deux verdicts concurrents sur le même
   cuivre, obtenus par deux physiques différentes : c'est exactement le genre
   de désaccord qu'on ne sait pas arbitrer devant un client.

   Le registre est `SIM_FAMILLES` / `SIM_ANALYSES`, plus bas : une analyse y
   déclare son nom, ses commandes, son branchement, sa sortie, et si elle peint
   la carte. En ajouter une, c'est ajouter une entrée — l'onglet apparaît seul.

   CE QUE FAIT « IMPÉDANCE » : le serveur résout la section droite de chaque
   tronçon par méthode des moments (`python/ligne_mom.py`), rend son impédance
   caractéristique à la fréquence centrale, et les paramètres S de la liaison
   entière par mise en cascade. La page peint le résultat SUR la piste et
   l'écrit à côté.

   CE QUE FAIT « Z DIFFÉRENTIELLE » : la même section, à N conducteurs
   (`ligne_mom.solve_multiline`) — toutes les voisines d'une même piste y
   entrent, parce qu'une piste et ses deux voisines font UN problème à trois et
   non deux problèmes à deux. La matrice de capacité de Maxwell [C], puis
   [L] = μ₀ε₀[C₀]⁻¹ ; les modes pair et impair en sortent, donc Z différentielle
   et Z commune. L'autre moitié d'une paire n'étant pas toujours dans la
   sélection, chaque outil joint au problème le `voisinage` : le cuivre qui
   passe à portée. C'est le serveur qui apparie.

   LA SÉLECTION EST L'AGRESSEUR SOUS « CROSSTALK », et c'est le sens de lecture
   de tout l'onglet. On clique le net qu'on sait bruyant — l'horloge, le nœud
   de découpage, le bus qui commute — et la fiche dit CE QU'IL INFLIGE à chaque
   piste qui le longe.

   TROIS RÈGLES EN DÉCOULENT, qu'aucune ne se devine en lisant le tableau :

     · UN PARTENAIRE DIFFÉRENTIEL DÉCLARÉ N'EST PAS UNE VICTIME. Une paire est
       serrée par construction, et son couplage EST son mode impair — celui que
       le récepteur différentiel rejette. C'est l'onglet Z différentielle qui la
       juge, en ohms. Une voisine simplement proche, elle, compte ;
     · RIEN NE SE TOTALISE. Une VICTIME additionne ses agresseurs — trois à 3 %
       lui font 9 % —, un AGRESSEUR non : ses victimes sont des nets différents,
       chacun avec son budget. Chaque ligne se juge donc seule ;
     · CHAQUE VICTIME SE JUGE SUR LE PIRE DE SES DEUX BOUTS. Le NEXT s'observe
       à son bout proche, le FEXT à son bout lointain : jamais au même point,
       donc jamais additionnés, ni en pour-cent ni en volts.

   CE QUE CE BOUT-LÀ DE LA LUNETTE NE MONTRE PAS : les AUTRES agresseurs de
   chaque victime. Le chiffre annoncé est ce qu'elle prend à la sélection, pas
   son bruit total — c'est un minorant, et la fiche le dit.

   ET CE QUE LA SECTION DROITE NE SAIT PAS DÉCRIRE DU TOUT : les pistes
   SUPERPOSÉES. Elle n'a qu'un plan de conducteurs et les pose tous à la même
   hauteur ; les voisines d'une AUTRE couche étaient donc écartées côté serveur
   avant tout calcul, et disparaissaient sans un mot — ce qui se lit comme un
   couplage nul, alors que deux pistes superposées couplent souvent PLUS que
   les mêmes côte à côte. Elles sont désormais CHERCHÉES et rendues
   (`superposes`, affiché par `simCoupleSuperposes`) : la longueur en regard,
   le décalage de cuivre à cuivre et le diélectrique qui sépare les deux
   faces. Le couplage n'est toujours pas chiffré — il faudrait une section à
   conducteurs empilés —, mais il n'est plus invisible, et la fiche annonce
   alors ses chiffres comme un PLANCHER. Les longements qu'un plan de référence
   sépare sont comptés et tus : le plan est un écran, et c'est la raison d'être
   de l'empilage.

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

   Et le document que rend `probleme()` porte, pour les deux analyses de
   couplage, deux champs de plus — un outil qui ne les met pas voit les deux
   onglets le dire plutôt que d'afficher une page vide :

     voisinage  [{type,start,end,width,layer,net,copper_thickness}]
                le cuivre qui passe à portée de la sélection, au même format
                que la géométrie. L'AGRESSEUR N'EST JAMAIS DANS LA SÉLECTION,
                et l'autre moitié d'une paire différentielle non plus. Un
                tronçon dont le net est une MASSE DE RÉFÉRENCE y devient une
                piste de garde — dans la section, à zéro volt, sans port
     paires     [[netP, netN], ...]   les paires déclarées par l'outil, quand
                il en tient. À défaut, le serveur lit les suffixes

   Et pour l'analyse « Chute DC », deux méthodes FACULTATIVES — un outil qui
   ne les déclare pas voit l'onglet dire pourquoi il ne calcule pas :

     cuivreDC()   -> {polygones, vias, sources, references, pas}
                     ou {erreur, conseil}    le problème résistif, en mm
     peindreDC(r)                        peint la carte de potentiel

   Et pour l'analyse « Crosstalk », UNE méthode FACULTATIVE — un outil qui ne
   la déclare pas voit l'onglet dire ce qui lui manque, plutôt qu'une page
   vide :

     problemeCrosstalk(opts) -> {doc, objets, portee, notes}
                     ou {erreur, conseil}
                     Le document « cao-crosstalk-1 ». Il porte la géométrie et
                     le voisinage comme celui de la simulation, mais AVEC LES
                     COUCHES ADJACENTES — deux pistes superposées couplent, et
                     les écarter d'office ferait lire un couplage nul là où il
                     est maximal — et trois champs que rien d'autre ne demande :

                       couture    {positions:[{s, cote}]}   les vias de couture
                                  projetés sur l'ABSCISSE du parcours, en mm.
                                  Sans eux on ne connaît que le pire trou par
                                  tronçon, et la zone à risque est alors le
                                  tronçon entier
                       fentes     [{s, longueur, quoi}]     les discontinuités
                                  du plan de référence sous le parcours. Ne pas
                                  envoyer le champ DU TOUT quand on n'a pas su
                                  sonder : une liste vide se lit « rien à
                                  signaler », ce qui est le contraire
                       vias_masse [{x, y, a, b}]            de quoi juger les
                                  changements de couche

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

   L'ÉCHAUFFEMENT NE VIENT PLUS D'UNE CHARTE. IPC-2221 ne connaît que la
   section du conducteur : elle ignore le stratifié et les plans, c'est-à-dire
   les deux seuls chemins par lesquels la chaleur part vraiment, et elle rend
   une couche interne 4,83 fois plus chaude qu'une externe — ce que la campagne
   IPC-2152 a mesuré faux. Le solveur résout donc l'ÉTALEMENT dans la carte,
   et il lui faut pour cela trois cotes que l'empilage porte des deux côtés :
   la conductivité du laminé, l'épaisseur de stratifié, et le cuivre qui étale
   effectivement. C'est l'adaptateur qui les fournit (`thermique`), et le champ
   « Stratifié » du panneau qui l'emporte pour λ — aucun fichier de CAO ne le
   porte. LA CHARTE RESTE CALCULÉE ET RENDUE À CÔTÉ : quand les deux s'écartent,
   c'est que la carte évacue, et c'est ce qu'on veut savoir. Voir
   `simDCThermique` et `python/dc_solver.py`.

   L'ADAPTATEUR :

     dcBornes()        -> {source, reference}, chacune {nom, x, y, couche, net}
                          ou null. Relues à chaque affichage : une pastille
                          effacée doit disparaître du panneau.
     dcChoisir(role)   -> arme la désignation ; le clic suivant sur la carte
                          choisit la pastille et rappelle simDCBorneChoisie()
     dcOublier(role)   -> efface une borne, ou les deux si role est absent
     cuivreDC(opts)    -> {polygones, vias, sources, references, net, bornes,
                          thermique?, notes?} ou {erreur, conseil}
     dcCoucheProposee()-> le rang de cuivre que CET outil propose de peindre :
                          sa couche active, ou celle de la charge. Ce n'est
                          qu'une proposition — la fiche peut en choisir une
                          autre, voir `simDCCouchePeinte`.
     dcNomCouche(rang) -> son nom, pour la liste de la fiche. Facultatif : à
                          défaut, le rang.

   avec, EN MILLIMÈTRES comme tout le reste du document d'échange :

     polygones   [{vertices:[[x,y],…], couche, net, epaisseur, trou?}]
     vias        [{x, y, couche_a, couche_b, percage, placage, hauteur, net,
                   repere}]
     sources     [{couche, net, courant, x, y | boite:[x0,y0,x1,y1]}]
     references  [{couche, net, tension, x, y | boite:[x0,y0,x1,y1]}]
     thermique   {k_stratifie (W/(m·K)), epaisseur_stratifie, cuivre_etaleur}
     notes       ce que l'outil sait du modèle et que le serveur ne peut pas
                 deviner : empilage incomplet, portées de perçage supposées

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
    '<button class="tb mini" id="simDCImportSch" '+
            'title="Importer automatiquement les sources et charges depuis les composants du schéma pour le net sélectionné">⚡ Du schéma</button>'+
    '<button class="tb mini" id="simDCRaz" '+
            'title="Oublier toutes les bornes">Effacer</button>'+
  '</div>'+
  '<div id="simDCListe"></div>'+
  /* LA RANGÉE QUI PORTE « Calculer » RESTE quand les réglages se replient :
     c'est ici que le bouton vit, au milieu de la trame, et le replier
     laisserait un panneau qu'on ne peut plus lancer. */
  /* LE STRATIFIÉ EST UNE ENTRÉE DU CALCUL, pas un réglage d'affichage : c'est
     lui qui décide de la température. Il est donc dans la même rangée que la
     trame, à côté du bouton qui lance. */
  '<div class="pnl-bar">'+
    '<span class="pnl-lbl">Stratifié</span>'+
    simChamp("simDCLambda","La conductivité thermique du stratifié, DANS LE "+
                           "PLAN — c'est elle qui décide de l'échauffement, "+
                           "parce que c'est latéralement que la chaleur s'en "+
                           "va. LAISSEZ VIDE pour 0,8 W/(m·K), le FR-4 "+
                           "courant. Un Rogers en vaut 0,3 à 0,6, un "+
                           "substrat céramique ou à âme métallique dix à "+
                           "cent fois plus — et la température s'en trouve "+
                           "divisée d'autant.")+
    '<span class="simU">W/(m·K)</span>'+
  '</div>'+
  /* LA RANGÉE QUI PORTE « Calculer » RESTE quand les réglages se replient :
     c'est ici que le bouton vit, au milieu de la trame, et le replier
     laisserait un panneau qu'on ne peut plus lancer. */
  '<div class="pnl-bar simBarFixe">'+
    '<span class="pnl-lbl">Trame</span>'+
    simChamp("simDCPas","Le côté du carreau de maillage, en millimètres — la "+
                        "finesse du calcul. LAISSEZ VIDE : elle est choisie "+
                        "pour que la forme la plus étroite du cuivre reçoive "+
                        "au moins quatre carreaux dans sa largeur, ce qui est "+
                        "ce qu'il faut pour qu'une résistance veuille dire "+
                        "quelque chose. N'y touchez que pour raffiner un "+
                        "rétrécissement, ou pour alléger un calcul trop lourd.")+
    '<span class="simU">mm</span>'+
    '<button class="tb mini on" id="simDCGo" '+
            'title="Calculer la chute de tension continue">▶ Calculer</button>'+
    /* L'EXPORT : le .csv pour joindre à un dossier, le .json pour rejouer.
       Les deux vivent sur la rangée qui RESTE quand les réglages se replient :
       on exporte le résultat qu'on regarde, pas celui d'avant. */
    '<button class="tb mini" id="simDCCsv" '+
            'title="Les tableaux du résultat, à joindre à un dossier de '+
            'fabrication ou à ouvrir dans un tableur : les bornes, les nets, '+
            'le pire point et le détail via par via, avec les réglages qui '+
            'les ont produits.">.csv</button>'+
    '<button class="tb mini" id="simDCJson" '+
            'title="Le problème ET le résultat, en un seul fichier : les '+
            'réglages, le cuivre envoyé, et ce que le solveur a rendu. Il se '+
            'rejoue et il se compare : c’est ce qu’on garde quand on change '+
            'une piste et qu’on veut savoir ce que ça a changé.">'+
            '.json</button>'+
  '</div>'+
  /* LES BUDGETS. Ils ne changent aucun calcul : ils donnent son sens au
     verdict. Sans eux, la fiche répète des chiffres sans jamais dire si la
     carte tient — et c'est pourtant la seule question qu'on lui pose. */
  '<div class="pnl-bar">'+
    '<span class="pnl-lbl">Budget</span>'+
    simChamp("simDCMaxChute","La chute admise à la charge la plus mal servie, "+
                             "en pour-cent de la tension de source. Cinq "+
                             "pour cent est l'usage sur un rail logique ; un "+
                             "régulateur à faible marge en demande moins.")+
    '<span class="simU">%</span>'+
    simChamp("simDCMaxDT","L'échauffement admis, en degrés au-dessus de "+
                          "l'ambiante. Dix degrés est l'usage. Un écart de "+
                          "température vaut autant en kelvins qu'en degrés "+
                          "Celsius : c'est le même nombre.")+
    '<span class="simU">°C</span>'+
  '</div>'+
  /* L'AMBIANTE NE CHANGE AUCUN CALCUL — l'échauffement est un ÉCART, et il ne
     dépend pas de la température de départ tant que la conductivité du cuivre
     est prise à 20 °C. Elle sert à écrire le point chaud en ABSOLU, seul
     chiffre qu'on puisse mettre en face d'un Tg ou d'une cote de boîtier. */
  '<div class="pnl-bar">'+
    '<span class="pnl-lbl">Ambiante</span>'+
    simChamp("simDCAmbiante","La température autour de la carte, en degrés "+
                             "Celsius. Elle ne change RIEN au calcul — "+
                             "l'échauffement est un écart — et sert à écrire "+
                             "le point le plus chaud en absolu : c'est lui "+
                             "qu'on compare au Tg du stratifié ou à la cote "+
                             "d'un boîtier. Dans un coffret fermé, ce n'est "+
                             "pas la température de la pièce.")+
    '<span class="simU">°C</span>'+
  '</div>'+
  '<div class="pnl-bar">'+
    '<span class="pnl-lbl">Carte</span>'+
    simCarteDCListe()+
    /* LE VOILE, AVEC SON INTERRUPTEUR. Il s'allumait dès qu'une carte
       existait et le seul moyen d'en sortir était de changer d'onglet. Ici il
       est ÉTEINT d'office : la carte de chute ne peint qu'un net sur une
       couche, et voiler la carte entière autour d'un fil enlève le contexte
       qui sert à lire le résultat. Voir `simVoileActif`. */
    simXtCase("simDCVoile","estomper le reste",
      "Estomper tout le cuivre qui n'est PAS dans ce calcul, pour que la "+
      "carte de chaleur ressorte. Éteint d'office ici : la chute ne se peint "+
      "que sur un net et sur une seule couche, et le reste de la carte — les "+
      "autres couches du même net, le connecteur, le composant alimenté — "+
      "est ce qui sert à lire le résultat.")+
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
  /* LES BUDGETS ET LE STRATIFIÉ. Les deux premiers ne relancent rien — ils ne
     changent que le verdict, donc un rendu suffit. Le troisième est une ENTRÉE
     du calcul : le changer sans relancer laisserait un λ affiché qui n'est pas
     celui du chiffre, ce qui est la pire des deux moitiés. On le dit dans la
     fiche plutôt que de relancer dans le dos de l'utilisateur. */
  const nb=(id,cle)=>{
    const e=simEl(id);
    if(!e)return;
    e.value=simNb(SIM.dcBudget[cle],0);
    e.onchange=()=>{
      const v=parseFloat(String(e.value||"").replace(",","."));
      if(v>0)SIM.dcBudget[cle]=v;
      e.value=simNb(SIM.dcBudget[cle],0);
      simRendre();
    };
  };
  const csv=simEl("simDCCsv");
  if(csv)csv.onclick=simDCExportCsv;
  const js=simEl("simDCJson");
  if(js)js.onclick=simDCExportJson;
  nb("simDCMaxChute","chute");
  nb("simDCMaxDT","dt");
  /* L'AMBIANTE PEUT ÊTRE NÉGATIVE — une carte dans un coffret extérieur —,
     donc elle ne passe pas par `nb`, qui refuse ce qui n'est pas positif. */
  const amb=simEl("simDCAmbiante");
  if(amb){
    amb.value=simNb(SIM.dcAmbiante,0);
    amb.onchange=()=>{
      const v=parseFloat(String(amb.value||"").replace(",","."));
      if(isFinite(v))SIM.dcAmbiante=v;
      amb.value=simNb(SIM.dcAmbiante,0);
      simRendre();
    };
  }
  const lam=simEl("simDCLambda");
  if(lam){
    lam.placeholder="0,8";
    lam.value=SIM.dcLambda||"";
    lam.onchange=()=>{SIM.dcLambda=lam.value||"";simRendre();};
  }
  simBrancherVoile("simDCVoile","dc");
  const as=simEl("simDCAddSrc");
  if(as)as.onclick=()=>simDCArmer("source");
  const ar=simEl("simDCAddRef");
  if(ar)ar.onclick=()=>simDCArmer("charge");
  const bis=simEl("simDCImportSch");
  if(bis){
    if(!SIM_ED||typeof SIM_ED.dcImporterSchema!=="function"){
      bis.style.display="none";
    }else{
      bis.onclick=async ()=>{
        const r=await SIM_ED.dcImporterSchema();
        if(r&&r.erreur){
          SIM.erreurDC=r.erreur;
        }else if(r&&r.message){
          if(typeof SIM_ED.astuce==="function")SIM_ED.astuce(r.message);
          SIM.erreurDC="";
        }
        simRendre();
      };
    }
  }
  const raz=simEl("simDCRaz");
  if(raz)raz.onclick=()=>{
    if(SIM_ED&&SIM_ED.dcOublier)SIM_ED.dcOublier();
    simDCOublier();
    SIM.erreurDC="";
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
/* ==========================================================================
   L'UNITÉ D'UNE BORNE, ET POURQUOI ELLE SE CHOISIT
   --------------------------------------------------------------------------
   « 0,00025 A » NE S'ÉCRIT PAS, ET NE SE RELIT PAS. Les deux champs étaient en
   volts et en ampères, fermes : un rail de 1,8 V dont on veut vérifier une
   chute de quelques millivolts se règle en volts sans dommage, mais un
   consommateur en veille tire 250 µA, et il fallait taper 0,00025 puis le
   relire à l'écran pour compter les zéros. C'est exactement la faute qui ne
   se voit pas : ni refus, ni champ vide, seulement un facteur dix.

   LA VALEUR STOCKÉE RESTE EN VOLTS ET EN AMPÈRES, toujours : c'est ce que
   `cuivreDC()` met dans le document, et le solveur ne connaît que le SI.
   L'unité ne vit que dans l'affichage — et sur la borne, pour qu'elle survive
   à un re-clic.

   EN CHANGER CONVERTIT CE QUI EST ÉCRIT, cela ne le réinterprète pas : 0,25 A
   passé en mA devient 250 mA, le même courant. C'est déjà la règle des unités
   de fréquence du panneau (`simChampUnite`), et deux règles opposées dans le
   même panneau feraient de chaque changement d'unité un pari.
   ========================================================================== */
const SIM_DC_UNITES_V=[{cle:"V", f:1}, {cle:"mV", f:1e-3}];
const SIM_DC_UNITES_A=[{cle:"A", f:1}, {cle:"mA", f:1e-3}, {cle:"µA", f:1e-6}];
function simDCUnites(b){
  return (b&&b.role==="source")?SIM_DC_UNITES_V:SIM_DC_UNITES_A;
}
function simDCUnite(b){
  const liste=simDCUnites(b);
  return liste.find(u=>u.cle===(b&&b.unite))||liste[0];
}

function simRendreBornes(){
  const el=simEl("simDCListe");
  if(!el)return;
  const bornes=(SIM_ED&&SIM_ED.dcBornes)?SIM_ED.dcBornes():[];
  if(!bornes.length){
    el.innerHTML='<p class="simNote">Aucune borne.<br>'+
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
       /* LE REPERE SE RENOMME, ET C'EST TOUT L'INTERET. « pastille 32.1 ;
          72.34 » est ce que le fichier sait dire ; ce n'est pas ce que la
          carte veut dire. Sur cinq bornes, deux couples de coordonnees ne se
          distinguent plus a l'oeil, et le tableau du resultat les reprend
          telles quelles : la charge la plus mal servie s'appelait « pastille
          32.1 ; 72.34 » au lieu de « U7 VDD ».

          C'EST UN CHAMP, PAS UNE ETIQUETTE, et le nom voyage jusqu'au
          document (`repere`) donc jusqu'au resultat et a l'export. */
       simChampTexte("simDCNom"+k,b.nom,
          "Le nom de cette borne, tel qu'il apparaitra dans le tableau du "+
          "resultat et dans l'export. Renommez-la : « U7 VDD » se lit, "+
          "« pastille 32.1 ; 72.34 » se compte. Videz le champ pour "+
          "retrouver le nom que la carte propose.",
          "net "+(b.net||"aucun")+", couche "+(b.couche+1))+
       /* LE MÊME CHAMP QUE PARTOUT AILLEURS DANS LE PANNEAU, par la même
          fonction : il portait son `<input>` à la main, donc sans la classe
          `simChamp`, donc sans la monospace ni la largeur du reste. */
       simChamp("simDCV"+k,(src
          ? "La TENSION que cette alimentation impose."
          : "Le COURANT que ce composant tire."))+
       simDCListeUnite("simDCU"+k,b)+
       '<button class="tb mini" id="simDCDel'+k+'" '+
       'title="Retirer cette borne">×</button>'+
       '</div>';
  });
  el.innerHTML=h;
  bornes.forEach((b,k)=>{
    const u=simDCUnite(b);
    /* LE NOM. Vide, on retombe sur celui que la carte propose — c'est la
       sortie de secours d'un nom qu'on a raté, et elle doit exister : sans
       elle, un champ effacé laisserait une borne sans identité dans le
       tableau et dans l'export. */
    const nm=simEl("simDCNom"+k);
    if(nm){
      nm.value=b.nom||"";
      nm.onchange=()=>{
        const v=String(nm.value||"").trim();
        if(v){b.nom=v;b.renomme=true;}
        else{b.renomme=false;}
        simRendre();
      };
    }
    const ch=simEl("simDCV"+k);
    if(ch){
      ch.value=simNbLibre(b.valeur/u.f);
      ch.onchange=()=>{
        const v=parseFloat(String(ch.value).replace(",","."));
        if(SIM_ED.dcValeur)
          SIM_ED.dcValeur(k,isFinite(v)?v*simDCUnite(b).f:0);
      };
    }
    const su=simEl("simDCU"+k);
    if(su){
      /* L'UNITÉ COURANTE POSÉE EN JS, comme la grandeur de la carte
         (`simBrancherDC`) et comme le champ juste au-dessus. L'attribut
         `selected` de la chaîne HTML suffirait dans un navigateur ; le poser
         ici est ce qui rend l'état LISIBLE — et vérifiable — depuis le
         panneau, quel que soit le DOM sous lequel il tourne. */
      su.value=u.cle;
      su.onchange=()=>{
        /* LA VALEUR PHYSIQUE NE BOUGE PAS : seule son écriture change. On
           réaffiche donc la liste plutôt que de recalculer le champ ici — un
           seul endroit sait convertir. */
        b.unite=su.value;
        simRendre();
      };
    }
    const del=simEl("simDCDel"+k);
    if(del)del.onclick=()=>{
      if(SIM_ED.dcOublier)SIM_ED.dcOublier(k);
      simDCOublier();
      SIM.erreurDC="";
      simRendre();
    };
  });
}

/* La liste d'unités d'une borne : des volts pour une source, des ampères pour
   une charge. Elle a l'allure des autres listes d'unités du panneau
   (`simChampUnite`) et le même contrat — en changer convertit ce qui est
   écrit. */
function simDCListeUnite(id,b){
  const liste=simDCUnites(b), courante=simDCUnite(b).cle;
  const quoi=(b.role==="source")?"la tension imposée":"le courant tiré";
  let h='<select class="simU simUSel" id="'+id+'" title="'+
        simEsc("Unité de "+quoi+". En changer CONVERTIT ce qui est écrit, "+
               "cela ne le réinterprète pas : 0,25 A passé en mA devient "+
               "250 mA, le même courant.")+'">';
  for(const u of liste)
    h+='<option value="'+u.cle+'"'+(u.cle===courante?" selected":"")+">"+
       u.cle+"</option>";
  return h+"</select>";
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
/* ===========================================================================
   DEUX BUDGETS, ET LE SECOND MANQUAIT — CE QUI RENDAIT LE CALCUL IMPOSSIBLE
   ---------------------------------------------------------------------------
   `mailler()` refuse SUR DEUX CRITÈRES, et cette fonction n'en connaissait
   qu'un :

     · le nombre de NŒUDS, c'est-à-dire de carreaux DE CUIVRE
       (`len(cases) > MAX_NOEUDS`, 400 000) — c'est le coût réel du calcul, et
       c'est ce que `SIM_DC_NOEUDS_CIBLE` borne avec de la marge ;
     · la taille de la GRILLE, `nx * ny * couches > MAX_NOEUDS * 4`
       (1 600 000) — un refus sec, sur la BOÎTE ENGLOBANTE de tout le cuivre
       envoyé, cuivre ou pas.

   LES DEUX QUANTITÉS N'ONT RIEN À VOIR, et c'est ce qui piégeait. Un rail
   d'alimentation sur une vraie carte couvre une grande boîte avec peu de
   cuivre : une piste fine d'un bout à l'autre, deux plages, des pastilles. La
   forme la plus étroite fait 0,3 mm, donc le pas tombait à 0,04 mm ; l'aire de
   cuivre, elle, ne fait que quelques dizaines de mm², donc le premier budget
   était tenu haut la main — 30 000 nœuds sur 250 000 — et la page laissait
   passer. La grille, elle, faisait 875 × 1177 sur 4 couches, soit
   4,1 MILLIONS de carreaux, et le serveur refusait :

       « Trame trop fine : 875 x 1177 carreaux sur 4 couche(s). »

   Un refus que l'utilisateur ne pouvait pas corriger en connaissance de cause,
   puisque le pas qui l'a produit avait été choisi par l'outil.

   LES DEUX BUDGETS S'APPLIQUENT DONC, et on retient le pas le PLUS GRAND des
   deux. La marge de 0,8 sur le plafond de grille couvre le `ceil()` et le
   « + 1 » par axe que `mailler` ajoute.
   =========================================================================== */
const SIM_DC_CARREAUX_MAX=1600000;   // MAX_NOEUDS * 4 de dc_solver.py
const SIM_DC_MARGE_GRILLE=0.8;       // le ceil() et le +1 par axe de mailler

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

  const fine=mini/SIM_DC_CARREAUX_MINI;
  const nc=Math.max(couches.size,1);
  /* Le cuivre EFFECTIF, borné par la boîte : deux quadrilatères qui se
     recouvrent ne font pas plus de cuivre que la surface qu'ils occupent. */
  const boite=Math.max((x1-x0)*(y1-y0),1e-9)*nc;
  const aire=Math.max(Math.min(aireCuivre,boite),1e-9);
  /* LE PAS QUE CHAQUE BUDGET IMPOSE. Voir le bloc au-dessus des constantes :
     le premier compte les carreaux DE CUIVRE, le second ceux de la GRILLE, et
     les deux n'ont rien à voir sur une carte réelle. */
  const parNoeuds=Math.sqrt(aire/SIM_DC_NOEUDS_CIBLE);
  const parGrille=Math.sqrt(boite/(SIM_DC_CARREAUX_MAX*SIM_DC_MARGE_GRILLE));
  const pas=Math.max(fine,parNoeuds,parGrille);
  let note="";
  if(pas>fine){
    /* QUI A ÉLARGI, ET POURQUOI. « Trame élargie » sans le motif ne se
       conteste pas : sur une grande carte peu remplie c'est la GRILLE qui
       borne, et la réponse est de restreindre la portée ; sur un plan dense
       c'est le nombre de nœuds, et la réponse est de découper le calcul. Deux
       causes, deux gestes. */
    const cause=(parGrille>=parNoeuds)
      ? "la boîte englobante du cuivre envoyé ("+simNb(x1-x0,1)+" × "+
        simNb(y1-y0,1)+" mm sur "+nc+" couche(s)) demanderait plus de "+
        "carreaux de grille que le solveur n'en accepte"
      : "le cuivre analysé demanderait plus de nœuds que le solveur n'en "+
        "accepte";
    note="Trame élargie à "+simNb(pas,3)+" mm pour tenir le calcul : "+cause+
         ". La forme la plus étroite ("+simNb(mini,3)+" mm) n'y reçoit que "+
         simNb(mini/pas,1)+" carreau(x), et les rétrécissements plus fins "+
         "qu'elle ne sont pas décrits.";
  }
  return {pas:pas, mini:mini, couches:nc, formes:pleins.length,
          fine:fine, parNoeuds:parNoeuds, parGrille:parGrille,
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
/* ==========================================================================
   L'ÉCHAUFFEMENT S'ÉCRIT EN DEGRÉS CELSIUS, ET C'EST L'UNITÉ DE LA NORME
   --------------------------------------------------------------------------
   UN ÉCART DE TEMPÉRATURE VAUT AUTANT EN KELVINS QU'EN DEGRÉS CELSIUS : les
   deux échelles ont le même pas, seule leur origine diffère. « +6 K » et
   « +6 °C » sont donc le MÊME nombre et la MÊME grandeur, et le choix entre
   les deux n'est qu'une question de lecture.

   IPC-2221 ET IPC-2152 ÉCRIVENT TOUTES DEUX LEURS CHARTES EN °C — « temperature
   rise in °C » —, et c'est en degrés Celsius que se lisent les cotes contre
   lesquelles on compare : le Tg d'un stratifié, la température maximale d'un
   boîtier, le déclassement d'un condensateur. Écrire des kelvins obligeait à
   convertir de tête un nombre qui ne change pas, ce qui est le pire des
   frottements : inutile et quand même fatigant.

   ET LE POINT CHAUD EST DONNÉ EN ABSOLU. Un écart ne se compare à rien tout
   seul : « +6 °C » ne dit pas si la piste tient. L'ambiante se saisit dans le
   panneau (20 °C d'office), et la fiche écrit la température du point le plus
   chaud à côté de son écart. C'est ce chiffre-là qu'on met en face d'un Tg.
   ========================================================================== */
const SIM_DC_GRANDEURS=[
  {cle:"echauffement", nom:"Échauffement", unite:"°C", facteur:1, dec:2,
   aide:"La montée en température au-dessus de l'ambiante, par ÉTALEMENT "+
        "dans la carte : la conduction du stratifié et des plans de cuivre, "+
        "que la campagne IPC-2152 a mesurée. C'est un chiffre : il ne dépend "+
        "pas de la finesse du maillage. C'est un ÉCART, et un écart vaut "+
        "autant en kelvins qu'en degrés Celsius — les deux normes l'écrivent "+
        "en °C."},
  {cle:"densite", nom:"Densité", unite:"A/mm²", facteur:1, dec:1,
   aide:"Le courant par unité de section. Elle montre OÙ le courant se "+
        "presse ; à un angle vif elle est singulière, donc son maximum "+
        "dépend du maillage — c'est un repère, pas un chiffre."},
  {cle:"potentiel", nom:"Potentiel", unite:"mV", facteur:1e3, dec:2,
   aide:"La tension en chaque point du cuivre. L'écart d'un bout à l'autre "+
        "est la chute."},
  /* LA CHARTE, PEINTE À CÔTÉ. Elle n'est pas là par nostalgie : c'est la
     comparaison qui apprend quelque chose. Là où les deux cartes se
     ressemblent, la carte n'évacue rien et le stratifié ne sert à rien ; là
     où elles s'écartent, c'est un plan qui travaille — et ce sont ces
     endroits-là qu'on ne peut pas deviner de la géométrie. */
  {cle:"echauffement_ipc2221", nom:"Échauffement IPC-2221", unite:"°C",
   facteur:1, dec:2,
   aide:"La même montée, lue sur la charte historique IPC-2221 : un "+
        "conducteur ISOLÉ à l'air calme, sans stratifié ni plan. Elle "+
        "ignore donc tout ce qui refroidit la carte, et rend une couche "+
        "interne 4,83 fois plus chaude qu'une externe — ce que la campagne "+
        "IPC-2152 a mesuré faux. À comparer avec l'autre, pas à lire seule."}
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

/* Reconstruire pour une autre grandeur. Le calcul n'est pas refait : les
   tableaux arrivent ensemble, changer de carte ne coûte qu'une image. */
function simDCRepeindre(quoi){
  SIM.dcQuoi=simDCGrandeur(quoi).cle;
  SIM.dcImages=(SIM.resDC&&SIM_ED&&SIM_ED.canevasHorsEcran)
    ? simDCConstruireImages(SIM.resDC,SIM_ED.canevasHorsEcran,SIM.dcQuoi)
    : null;
  if(SIM_ED&&SIM_ED.redessiner)SIM_ED.redessiner();
}

/* TOUT CE QU'UN RÉSULTAT DC TRAÎNE DERRIÈRE LUI, oublié en un seul endroit.
   Il était recopié à quatre endroits, et la copie du bouton « Effacer » avait
   déjà pris du retard sur les autres : un champ qui s'ajoute à l'état est un
   champ qu'on oublie dans trois des quatre lignes, et il survit alors à son
   résultat — une couche peinte qui n'existe plus dans le suivant, par
   exemple.

   `erreurDC` N'EN FAIT PAS PARTIE, et c'est voulu : les trois appels de
   `simDCLancer` posent un refus PUIS jettent le résultat, et l'effacer ici
   emporterait la phrase qui vient d'être écrite. C'est au bouton « Effacer »,
   qui n'a rien à dire, de la retirer aussi. */
function simDCOublier(){
  SIM.resDC=null;
  SIM.dcImages=null; SIM.dcFinesse=null; SIM.dcIndex=null; SIM.dcSonde=null;
  SIM.dcCouche=null; SIM.dcNotes=[];
}

/* ==========================================================================
   QUELLE COUCHE SE PEINT, ET QUI LE DÉCIDE
   --------------------------------------------------------------------------
   IL EN FAUT UNE, ET UNE SEULE : superposer deux potentiels les mélangerait
   sans le dire — deux nets à 3,3 V et à 1,2 V se peindraient l'un sur l'autre
   dans la même échelle de couleurs, et le résultat aurait l'air d'une carte.

   CE QUI NE MARCHAIT PAS. L'outil la choisissait seul, et il n'avait pas le
   même à dire : l'éditeur PCB peint sa couche ACTIVE, ce qui est juste puisque
   c'est celle qu'on route ; la visionneuse, qui affiche toutes les couches à
   la fois et n'en a pas d'active, prenait celle de la PREMIÈRE CHARGE POSÉE.
   Sur un rail qui traverse la carte — et c'est le cas ordinaire d'un calcul de
   chute —, on ne pouvait donc jamais voir la couche où ça chauffe : il fallait
   effacer les bornes et les reposer dans un autre ordre pour changer de
   couche, ce qui relance le calcul pour rien.

   CE QUI LA REMPLACE : l'outil PROPOSE, l'utilisateur DISPOSE. `SIM.dcCouche`
   à `null` veut dire « celle que l'outil propose » ; une valeur veut dire
   « celle-là », et elle n'est retenue que si le résultat porte effectivement
   une image pour elle — sans quoi un changement de sélection laisserait le
   panneau désigner une couche absente, donc ne rien peindre du tout.
   ========================================================================== */
function simDCCouchePeinte(defaut){
  const im=SIM.dcImages&&SIM.dcImages.images;
  if(!im)return defaut;
  if(SIM.dcCouche!=null&&im.has(SIM.dcCouche))return SIM.dcCouche;
  return defaut;
}

/* Les couches que le résultat porte, dans l'ordre de l'empilage. C'est la
   liste que le sélecteur propose : les couches du MAILLAGE et non celles de la
   carte — une couche sans cuivre du net n'a rien à montrer. */
function simDCCouchesPeintes(){
  const im=SIM.dcImages&&SIM.dcImages.images;
  return im?[...im.keys()].sort((a,b)=>a-b):[];
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

/* ==========================================================================
   LE VIA SOUS LE CURSEUR — CE QU'IL A PORTÉ
   --------------------------------------------------------------------------
   POURQUOI IL FALLAIT L'AJOUTER. La sonde lisait le CARREAU DE TRAME : la
   densité, l'échauffement ou le potentiel du cuivre à cet endroit, sur la
   couche peinte. Or au droit d'un via, ce n'est pas la question qu'on se pose.
   La question est « celui-là, il en a pris combien ? » — et la réponse était
   dans le tableau du panneau, à retrouver parmi quinze lignes nommées « T7 »,
   sans savoir laquelle est le via qu'on a sous le curseur.

   C'est précisément le chiffre qui décide d'en doubler un, et le seul qui ne
   se devine pas de la géométrie : il dépend de tout le reste du cuivre.

   ON REND TOUTES LES LIAISONS À CET ENDROIT, pas une. Un tube traversant
   1→4 est monté en CHAÎNE — 1→2, 2→3, 3→4 —, chaque intervalle avec sa propre
   hauteur donc sa propre résistance ; le tableau en montre trois lignes, et la
   sonde doit en montrer trois aussi. Elles portent le même courant l'une après
   l'autre, mais pas la même chute.

   LE DISQUE EST CELUI DU PERÇAGE, que le résultat porte désormais
   (`percage`, en millimètres). Un carreau de trame de tolérance autour :
   au zoom arrière un via de 0,3 mm fait deux pixels, et viser au pixel n'est
   pas une lecture.
   ========================================================================== */
function simDCViasEn(x,y,couche){
  const res=SIM.resDC;
  if(!res||!res.vias||!res.vias.length)return [];
  const marge=(res.pas||0.2);
  const out=[];
  for(const v of res.vias){
    /* LA COUCHE PEINTE DOIT ÊTRE DANS LA PORTÉE de la liaison : un via
       enterré 3→4 n'est pas sous le curseur quand on regarde la couche 1, et
       le rendre là ferait croire qu'on peut le toucher d'en haut. `couche` à
       -1 — aucune couche peinte — ne filtre rien. */
    if(couche>=0){
      const lo=Math.min(v.couche_a,v.couche_b), hi=Math.max(v.couche_a,v.couche_b);
      if(couche<lo||couche>hi)continue;
    }
    const r=Math.max((v.percage||0)/2,0)+marge;
    const dx=v.x-x, dy=v.y-y;
    if(dx*dx+dy*dy<=r*r)out.push(v);
  }
  /* LE PLUS CHARGÉ EN TÊTE, comme dans le tableau : c'est celui qu'on cherche,
     et c'est le seul ordre qui ne demande pas de tout relire. */
  out.sort((a,b)=>Math.abs(b.courant)-Math.abs(a.courant));
  return out;
}

/* La ligne d'un via, telle que la sonde l'écrit. Le courant en milliampères
   sous l'ampère : « 0,043 A » se lit mal, et c'est précisément dans cette
   plage que se tiennent les vias qui ne travaillent pas. */
const SIM_DC_SONDE_VIAS=3;
function simDCTexteVia(v){
  const tete=(v.repere||"via")+" "+(v.couche_a+1)+"→"+(v.couche_b+1);
  if(!v.relie)
    return tete+" hors calcul";
  const i=Math.abs(v.courant);
  return tete+"  "+((i>=1)?simNb(i,3)+" A":simNb(i*1e3,1)+" mA")+
         "  "+simNb(v.chute*1e3,3)+" mV"+
         "  "+simNb(v.resistance*1e3,3)+" mΩ"+
         /* LE PERÇAGE SUPPOSÉ EST DIT ICI AUSSI : la sonde est le seul endroit
            où l'on regarde UN via, et c'est donc là qu'il faut savoir si son
            ohm repose sur une cote ou sur une déduction. */
         (v.percage_suppose?"  (perçage supposé)":"");
}

/* Ce que la sonde affiche. Rend null quand il n'y a NI cuivre NI via ici.

   UN VIA SEUL SUFFIT À PARLER, et c'est voulu : au droit d'un via, la couche
   peinte peut n'avoir aucun cuivre du net — un anti-pad l'a évidée, ou le via
   ne débouche que plus bas. Se taire là serait se taire pile à l'endroit où
   l'on a le plus à dire. */
function simDCLireEn(x,y,couche){
  if(!SIM.resDC)return null;
  const vias=simDCViasEn(x,y,couche);
  const i=SIM.dcIndex?simDCNoeudEn(x,y,couche):-1;
  const g=simDCGrandeur(SIM.dcQuoi);
  const v=(i>=0)?(SIM.resDC[g.cle]||[])[i]:undefined;
  if(v===undefined&&!vias.length)return null;
  const lignes=[];
  if(v!==undefined)lignes.push(simNb(v*g.facteur,g.dec)+" "+g.unite);
  for(const w of vias.slice(0,SIM_DC_SONDE_VIAS))
    lignes.push(simDCTexteVia(w));
  if(vias.length>SIM_DC_SONDE_VIAS)
    lignes.push("… "+(vias.length-SIM_DC_SONDE_VIAS)+" liaison(s) de plus");
  return {
    rang:i,
    valeur:(v===undefined)?null:v,
    vias:vias,
    /* `texte` RESTE UNE SEULE LIGNE : c'est le contrat que les deux outils et
       le banc d'essai lisent depuis toujours. `lignes` est ce que l'étiquette
       dessine, et la première y est la même. */
    texte:lignes[0]||"",
    lignes:lignes,
    /* L'ÉTIQUETTE SE POSE SUR LE VIA quand il y en a un : c'est de lui qu'on
       parle, et l'accrocher au centre du carreau de trame la ferait sauter
       d'un demi-pas à côté de ce qu'on désigne. */
    x:vias.length?vias[0].x:(i>=0?SIM.resDC.noeuds[i][0]:x),
    y:vias.length?vias[0].y:(i>=0?SIM.resDC.noeuds[i][1]:y)
  };
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
  /* ON NE REDESSINE QUE SI CE QUI EST ÉCRIT CHANGE : bouger de trois pixels
     dans le même carreau ne change rien.

     LE CARREAU NE SUFFIT PLUS À LE DIRE. Deux vias voisins peuvent tomber dans
     le même carreau de trame — sur une couture, c'est le cas ordinaire —, et
     comparer les seuls rangs de nœud laissait l'étiquette du premier affichée
     au-dessus du second. On compare donc ce qui est ÉCRIT, ce qui est
     exactement la bonne question. */
  if(avant&&avant.rang===lu.rang&&
     (avant.lignes||[]).join("|")===lu.lignes.join("|"))return false;
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
  /* PLUSIEURS LIGNES QUAND IL Y A PLUSIEURS CHOSES À DIRE : la valeur du
     carreau, puis ce que chaque liaison de via a porté. Une seule ligne ne
     pouvait pas rendre « ce via-là en a pris 412 mA », qui est justement le
     chiffre qui décide d'en doubler un. */
  const lignes=(s.lignes&&s.lignes.length)?s.lignes:[s.texte];
  c.save();
  c.setTransform(dpr||1,0,0,dpr||1,0,0);
  c.font="12px ui-monospace, Menlo, Consolas, monospace";
  const ligne=15, m=6;
  let l=0;
  for(const t of lignes)l=Math.max(l,c.measureText(t).width);
  const h=Math.max(18,lignes.length*ligne+3);
  /* L'étiquette se pose EN HAUT À DROITE du curseur, et bascule quand elle
     sortirait du canevas : une bulle coupée au bord ne se lit pas. */
  let x=p.x+12, y=p.y-h-8;
  const W=(c.canvas.width||0)/(dpr||1), H=(c.canvas.height||0)/(dpr||1);
  if(W&&x+l+2*m>W)x=p.x-12-l-2*m;
  if(y<2)y=p.y+12;
  if(H&&y+h>H)y=Math.max(2,H-h-2);
  c.fillStyle="rgba(18,20,24,0.92)";
  c.strokeStyle="rgba("+simDCCouleur(0.5).join(",")+",0.9)";
  c.lineWidth=1;
  if(c.roundRect){c.beginPath();c.roundRect(x,y,l+2*m,h,4);c.fill();c.stroke();}
  else{c.fillRect(x,y,l+2*m,h);c.strokeRect(x,y,l+2*m,h);}
  c.textAlign="left"; c.textBaseline="middle";
  lignes.forEach((t,k)=>{
    /* LA PREMIÈRE LIGNE EST LA GRANDEUR PEINTE, les suivantes les vias : deux
       lectures différentes, donc deux tons. Le via en plus pâle — c'est un
       détail qu'on est venu chercher, pas la valeur de la carte. */
    c.fillStyle=(k===0)?"#e6e8ec":"#a8b0bc";
    c.fillText(t,x+m,y+(h-lignes.length*ligne)/2+k*ligne+ligne/2);
  });
  /* Un point sur le carreau lu : sans lui, on ne sait pas de QUEL carreau
     l'étiquette parle quand le curseur est entre deux. */
  c.beginPath();
  c.arc(p.x,p.y,2.5,0,2*Math.PI);
  c.fillStyle="rgba("+simDCCouleur(1).join(",")+",1)";
  c.fill();
  c.restore();
}

/* ==========================================================================
   LA LÉGENDE DE LA CARTE, ET LA COUCHE QU'ELLE MONTRE
   --------------------------------------------------------------------------
   MÊME FORME QUE CELLE DES IMPÉDANCES (`simZLegende`), et pour la même raison :
   une teinte sans son échelle ne se lit pas, et une échelle écrite en phrase
   ne se lit pas d'un coup d'œil. Trois pastilles de couleur, trois bornes, et
   la grandeur nommée devant.
   ========================================================================== */
function simDCLegende(){
  if(!SIM.dcImages)return '';
  const g=simDCGrandeur(SIM.dcImages.quoi);
  const bas=SIM.dcImages.vmin*g.facteur, haut=SIM.dcImages.vmax*g.facteur;
  const mil=(bas+haut)/2;
  const puce=(t,txt)=>'<span><i style="background:rgb('+
    simDCCouleur(t).join(",")+')"></i>'+txt+"</span>";
  return '<div class="simLegZ simLegDC">'+
    "<span><b>"+simEsc(g.nom)+"</b></span>"+
    puce(0,simNb(bas,g.dec)+" "+g.unite)+
    puce(0.5,simNb(mil,g.dec)+" "+g.unite)+
    puce(1,simNb(haut,g.dec)+" "+g.unite)+
    "</div>";
}

/* Le nom d'une couche de cuivre, tel que l'outil l'appelle. À défaut de
   `dcNomCouche` chez l'adaptateur, son rang — c'est moins parlant, mais un
   rang juste vaut mieux qu'un nom inventé. */
function simDCNomCouche(rang){
  if(SIM_ED&&typeof SIM_ED.dcNomCouche==="function"){
    const n=SIM_ED.dcNomCouche(rang);
    if(n)return String(n);
  }
  return "couche "+(rang+1);
}

/* La couche que l'outil PROPOSE : sa couche active, ou celle de la charge. */
function simDCCoucheProposee(){
  return (SIM_ED&&typeof SIM_ED.dcCoucheProposee==="function")
    ? SIM_ED.dcCoucheProposee() : -1;
}

/* CELLE QUI SE PEINT VRAIMENT, et le seul endroit qui le décide. Les deux
   canevas, les deux survols et la liste de la fiche passent par ici : sans
   cela, la sonde rendrait la valeur d'une couche que personne ne voit. */
/* CE QUE « AUTO » DEVRAIT MONTRER, ET CE QU'IL MONTRAIT.

   IL SUIVAIT LA PREMIÈRE BORNE POSÉE — `dcCoucheProposee` —, ce qui a deux
   défauts et le second coûte cher. D'abord ce n'est pas la couche qu'on veut
   voir : sur un rail à plusieurs charges, celle qu'on regarde est la plus mal
   servie, celle que le verdict nomme. Ensuite, et surtout, cette couche
   CHANGEAIT TOUTE SEULE dès qu'on réordonnait la liste des bornes — et la
   charge restée sur l'autre couche cessait d'être peinte, sans que rien ne le
   dise. Du cuivre non coloré autour d'une charge se lit « cette charge ne
   donne rien », alors que la vérité est « tu regardes une autre couche ».

   « AUTO » SUIT DONC LA CHARGE LA PLUS MAL SERVIE quand il y en a une. Le
   choix explicite de la liste l'emporte toujours ; à défaut de résultat, on
   retombe sur ce que l'outil propose. */
function simDCCoucheInteressante(){
  const charges=((SIM.resDC&&SIM.resDC.bornes)||[])
                  .filter(b=>b.role==="courant");
  if(charges.length){
    const pire=charges.reduce((a,b)=>(b.chute>a.chute?b:a));
    if(pire&&pire.couche>=0)return pire.couche;
  }
  return simDCCoucheProposee();
}

function simDCCoucheVoulue(){
  return simDCCouchePeinte(simDCCoucheInteressante());
}

/* ==========================================================================
   LE CHOIX DE LA COUCHE PEINTE, DANS LA FICHE
   --------------------------------------------------------------------------
   POURQUOI IL EST DANS LA FICHE ET NON DANS LE PANNEAU. La liste des couches
   dépend du RÉSULTAT — celles où le net porte du cuivre, et pas les autres —,
   et le corps du panneau s'écrit une fois pour toutes quand on ouvre l'onglet,
   avant tout calcul. Un sélecteur là-haut aurait été vide, ou faux.

   IL NE PARAÎT QU'À PARTIR DE DEUX COUCHES : sur un calcul mono-couche il n'y
   a rien à choisir, et une liste à un seul élément est un contrôle qui ment
   sur ce qu'il permet.
   ========================================================================== */
function simDCCoucheBar(){
  const cs=simDCCouchesPeintes();
  if(cs.length<2)return '';
  const propose=simDCCoucheInteressante();
  let h='<div class="simDCBar"><span>Couche peinte</span>'+
    '<select class="simU simUSel" id="simDCCoucheSel" title="'+
    simEsc("La carte ne peint qu'UNE couche : superposer deux potentiels les "+
           "mélangerait sans le dire. « Auto » suit ce que l'outil propose — "+
           "la couche active côté éditeur, celle de la charge côté "+
           "visionneuse.")+'">';
  h+='<option value="auto"'+(SIM.dcCouche==null?" selected":"")+">auto"+
     (cs.indexOf(propose)>=0?" — "+simEsc(simDCNomCouche(propose)):"")+
     "</option>";
  for(const c of cs)
    h+='<option value="'+c+'"'+(SIM.dcCouche===c?" selected":"")+">"+
       simEsc(simDCNomCouche(c))+"</option>";
  h+="</select>";
  /* CE QUI EST PEINT EN CE MOMENT, écrit à côté : « auto » ne dit pas de quoi
     il s'agit, et sur une carte où l'on cherche un point chaud, savoir quelle
     couche on regarde est la moitié de la lecture. */
  const vue=simDCCoucheVoulue();
  h+='<span class="simFaible">'+
     (cs.indexOf(vue)>=0
        ? simEsc(simDCNomCouche(vue))+" — "+cs.length+" couche(s) calculée(s)"
        : "aucune couche peinte")+"</span>";
  return h+"</div>";
}

/* Branché à CHAQUE rendu : la fiche est réécrite entière, donc ses
   gestionnaires partent avec l'ancien DOM. C'est le crochet `apres` du
   registre, comme pour les boutons de la fiche du crosstalk. */
function simDCBrancherFiche(){
  const sel=simEl("simDCCoucheSel");
  if(!sel)return;
  sel.onchange=()=>{
    const v=sel.value;
    SIM.dcCouche=(v==="auto")?null:parseInt(v,10);
    /* AUCUN RECALCUL : les images sont déjà là, une par couche. Changer de
       couche ne coûte qu'un redessin — et un rendu, pour que la ligne « ce qui
       est peint » suive. */
    if(SIM_ED&&SIM_ED.redessiner)SIM_ED.redessiner();
    simRendre();
  };
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
    return simProgres("Un réseau résistif sur tout le cuivre du net, puis un "+
      "gradient conjugué, puis la densité et l'échauffement.");
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

  /* LA FICHE, DANS L'ORDRE DE LA FICHE D'IMPÉDANCE, et ce n'est pas une
     coquetterie : les deux répondent à une question sur le même cuivre, et
     deux mises en page différentes obligeaient à réapprendre où regarder en
     changeant d'onglet. Le verdict d'abord — la réponse —, la ligne de
     contexte, la légende de la carte, puis les tableaux, puis les réserves.
     Voir `simFiche`. */
  const res=SIM.resDC;
  let html=simVerdictDC(res);
  html+=simMetaDC(res);
  html+=simDCLegende();
  html+=simDCCoucheBar();
  html+=simTableauBornes(res);
  html+=simTableauNetsDC(res);
  html+=simTableauPire(res);
  html+=simTableauVias(res);
  html+=simDCCuivrePris(res);
  (res.avertissements||[]).forEach(a=>{
    /* UN EMBALLEMENT THERMIQUE N'EST PAS UNE RÉSERVE, c'est un défaut : le
       modèle n'a plus de solution et le chiffre rendu est un plancher. Il
       prend donc le rouge de `simAlerte`, comme la note du plan de référence
       dans la fiche d'impédance — la seule autre qui FLATTE le résultat. */
    const grave=/EMBALLEMENT/.test(a);
    html+='<p class="simNote'+(grave?" simAlerte":"")+'">· '+simEsc(a)+'</p>';
  });
  return html;
}


/* ===========================================================================
   LE VERDICT — LA RÉPONSE À LA QUESTION POSÉE, EN UNE LIGNE

   POURQUOI IL MANQUAIT, ET CE QUE ÇA COÛTAIT. La fiche ouvrait sur le tableau
   des bornes : quatre colonnes de chiffres justes, et rien qui dise si la
   carte TIENT. Or c'est la seule question qu'on pose à ce calcul — « est-ce
   que ce rail passe ? » —, et y répondre demandait de comparer soi-même deux
   chiffres à deux budgets qu'on garde en tête. La fiche d'impédance, à côté,
   ouvre sur son verdict depuis toujours.

   DEUX BUDGETS, ET ILS NE SE COMPENSENT PAS. Une chute tenue avec une piste
   qui chauffe de quarante degrés n'est pas un bon résultat, et l'inverse non
   plus : le verdict est dehors dès que L'UN des deux sort. Les deux sont dans
   la barre du panneau, avec leurs valeurs d'usage — 5 % et 10 °C.

   LA CHUTE SE JUGE EN POUR-CENT, pas en millivolts : 100 mV sur du 1,2 V et
   sur du 24 V ne sont pas le même défaut. Sans source déclarée, le pour-cent
   n'existe pas — on le dit, et on ne juge que la température.
   ========================================================================== */
function simDCMesures(res){
  const bornes=(res&&res.bornes)||[];
  const alims=bornes.filter(b=>b.role==="tension");
  const charges=bornes.filter(b=>b.role==="courant");
  const ref=alims.length?Math.max.apply(null,alims.map(b=>b.consigne)):0;
  const pire=charges.length
    ? charges.reduce((a,b)=>(b.chute>a.chute?b:a)) : null;
  let dt=0, dtNet="", dtCharte=0;
  for(const net of Object.keys(res&&res.pire_par_net||{})){
    const p=res.pire_par_net[net];
    if(p.echauffement>dt){
      dt=p.echauffement; dtNet=net;
      dtCharte=p.echauffement_ipc2221||0;
    }
  }
  return {ref:ref, pire:pire, dt:dt, dtNet:dtNet, dtCharte:dtCharte,
          pct:(pire&&ref>0)?100*pire.chute/ref:null};
}

function simVerdictDC(res){
  const m=simDCMesures(res);
  const bud=SIM.dcBudget;
  const chuteDehors=(m.pct!=null&&m.pct>bud.chute);
  const dtDehors=(m.dt>bud.dt);
  /* LA ZONE LIMITE : à quatre-vingts pour cent d'un budget, on ne l'a pas
     dépassé et il n'y a plus de marge — c'est le moment de le savoir, pas
     après le premier prototype. Même graduation que le balayage du crosstalk,
     et même teinte ambre, qui ne désigne aucun sens. */
  const chuteLimite=(m.pct!=null&&m.pct>0.8*bud.chute);
  const dtLimite=(m.dt>0.8*bud.dt);
  const cls=(chuteDehors||dtDehors)?"dehors"
           :((chuteLimite||dtLimite)?"limite":"dedans");

  const sortis=[];
  if(chuteDehors)sortis.push("la chute");
  if(dtDehors)sortis.push("l'échauffement");
  let tete;
  if(sortis.length)
    tete="Hors budget : "+sortis.join(" et ");
  else if(cls==="limite")
    tete="Dans le budget, sans marge";
  else
    tete="Dans le budget";

  /* CE QUI EST MESURÉ, ET OÙ. Le nom de la charge et celui du net portent la
     moitié de l'information : « 132 mV » ne se corrige pas, « 132 mV à U5.1 »
     si. */
  const bouts=[];
  if(m.pire)
    bouts.push(simNb(m.pire.chute*1e3,1)+" mV à "+(m.pire.repere||"—")+
               (m.pct!=null?" ("+simNb(m.pct,2)+" % de "+
                  simNb(m.ref,2)+" V, budget "+simNb(bud.chute,0)+" %)"
                : " (aucune source déclarée : la chute ne se rapporte à rien)"));
  if(m.dt>0)
    /* L'ÉCART ET L'ABSOLU DANS LA MÊME PHRASE : « +1,6 °C » dit ce que le
       cuivre ajoute, « 21,6 °C » dit où la piste en est — et c'est le second
       qu'on met en face d'un Tg. */
    bouts.push("+"+simNb(m.dt,1)+" °C sur "+(m.dtNet||"?")+
               " → "+simNb(SIM.dcAmbiante+m.dt,1)+" °C"+
               " (budget "+simNb(bud.dt,0)+" °C"+
               (m.dtCharte>0?", IPC-2221 en annoncerait "+
                  simNb(m.dtCharte,1)+" °C":"")+")");
  return '<p class="simVerdict '+cls+'">'+simEsc(tete)+
         " <span>"+simEsc(bouts.join(" · ")||"rien à mesurer")+"</span></p>";
}

/* LA LIGNE DE CONTEXTE, comme celle de la fiche d'impédance : sur quoi le
   chiffre a été obtenu, en une rangée qu'on lit sans la lire. Elle ne remplace
   pas « Cuivre analysé », plus bas, qui dit la MÊME chose en phrases et
   ajoute la provenance de la trame — celle-ci se lit d'un coup d'œil, celle-là
   se conteste. */
function simMetaDC(res){
  const nets=Object.keys(res.chute_par_net||{});
  const cour=res.courant_par_net||{};
  let total=0;
  for(const n of Object.keys(cour))total+=Math.abs(cour[n]);
  const couches=(res.couches||[]).length;
  return '<div class="simMeta"><span>'+
    simEsc(nets.join(", ")||SIM.portee||"—")+"</span>"+
    "<span>"+couches+" couche"+(couches>1?"s":"")+"</span>"+
    "<span>"+simNb(total,3)+" A</span>"+
    "<span>"+simNb(res.pas,3)+" mm de trame</span>"+
    "<span>"+res.n_noeuds+" nœuds</span>"+
    "<span>"+res.n_vias+" trou"+(res.n_vias>1?"s":"")+"</span></div>";
}

/* LE TABLEAU PAR NET. Il était dans le corps de `simRendreDC` ; il en sort
   pour la même raison que les autres — une fonction par tableau, éprouvable
   seule. */
function simTableauNetsDC(res){
  const ch=res.chute_par_net||{};
  const noms=Object.keys(ch).sort();
  if(!noms.length)return '';
  const cour=res.courant_par_net||{};
  const refs=res.reference_nets||[];
  let html='<table class="simTab simTabDC"><tr><th>Net</th>'+
           "<th>Courant</th><th>Chute</th></tr>";
  for(const net of noms){
    /* LE SIGNE DU COURANT EST UNE CONVENTION DU SOLVEUR : une charge TIRE,
       donc son courant sort du cuivre et ressort négatif. On l'écrit en
       valeur absolue, comme le tableau des bornes — « 3 A » se lit,
       « −3 A » fait douter de la lecture. */
    const i=Math.abs(cour[net]||0);
    /* Un net de RÉFÉRENCE est tenu à sa tension : sa « chute » est celle du
       cuivre entre ses points d'ancrage, ce qui n'est pas la même grandeur
       que la chute d'un net alimenté. On le marque plutôt que de laisser
       lire les deux dans la même colonne. */
    const ref=refs.indexOf(net)>=0
      ? ' <i class="simFaible">(réf.)</i>' : '';
    html+="<tr><td>"+simEsc(net)+ref+"</td>"+
          "<td>"+(i?simNb(i,3)+" A":"—")+"</td>"+
          "<td>"+simNb(ch[net]*1e3,2)+" mV</td></tr>";
  }
  return html+"</table>";
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
  let h='';
  if(f)
    h+='<p class="simNote">· <b>Cuivre analysé</b> : '+f.formes+
       ' forme(s) sur '+f.couches+' couche(s)'+
       (f.trous?', '+f.trous+' découpe(s) retirée(s)':'')+
       ', tout le cuivre du net — pistes, pastilles et plans compris.</p>';
  /* D'OÙ VIENT LA TRAME, ET RIEN D'AUTRE. Elle annonçait « choisie pour que
     la forme la plus étroite reçoive N carreaux » MÊME QUAND un budget l'avait
     élargie : la fiche se contredisait deux lignes plus bas, où la note disait
     l'avoir élargie pour tenir le calcul. Trois cas, trois phrases. */
  let d="";
  if(f&&f.impose)d=", que vous avez imposée";
  else if(f&&f.note)d=", élargie pour tenir le calcul (voir ci-dessous)";
  else if(f)d=", choisie pour que la forme la plus étroite ("+
              simNb(f.mini,3)+" mm) reçoive "+simNb(f.mini/res.pas,1)+
              " carreaux";
  h+='<p class="simNote">· <b>Trame</b> : '+simNb(res.pas,4)+' mm'+d+
     ' — '+res.n_noeuds+' nœuds, '+res.n_aretes+' liaisons, '+res.n_vias+
     ' trou(s) métallisé(s) relié(s).</p>';
  if(f&&f.note)h+='<p class="simNote">· '+simEsc(f.note)+'</p>';
  /* SOUS QUATRE CARREAUX, UNE FORME N'EST PLUS MAILLÉE : ELLE EST
     ÉCHANTILLONNÉE. Sa résistance sort de la position de deux ou trois points,
     pas de sa géométrie — et l'écart peut atteindre des dizaines de pour cent
     sur ELLE (le reste du cuivre, plus large, reste bien résolu). La note
     d'élargissement disait « les rétrécissements plus fins qu'elle ne sont pas
     décrits », ce qui laissait croire qu'ELLE l'était. */
  if(f&&f.mini>0&&f.mini/res.pas<4)
    h+='<p class="simNote simAlerte">· La forme la plus étroite ('+
       simNb(f.mini,3)+' mm) ne reçoit que '+simNb(f.mini/res.pas,1)+
       ' carreaux : elle n\'est pas maillée, elle est ÉCHANTILLONNÉE — sa '+
       'résistance sort de la position de deux ou trois points, pas de sa '+
       'géométrie. Le cuivre plus large reste bien résolu ; c\'est sur CETTE '+
       'forme que le chiffre est douteux. Restreignez la portée du calcul pour '+
       'lui rendre de la finesse.</p>';
  /* CE QUE L'OUTIL SAIT DU MODÈLE ET QUE LE SERVEUR NE PEUT PAS DEVINER :
     l'empilage incomplet, les portées de perçage supposées, les tubes déduits
     d'une pastille. La fiche d'impédance les affiche depuis toujours
     (`SIM.notes`) ; celle-ci les laissait tomber, si bien qu'un document où
     tous les trous étaient supposés traversants ne le disait nulle part. */
  for(const n of (SIM.dcNotes||[]))
    h+='<p class="simNote">· '+simEsc(n)+'</p>';
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
  /* LA COLONNE « Perdu » PORTE LE VERDICT DE LA BORNE, et les couleurs de la
     carte : bleu quand la charge tient son budget, rouge quand elle en sort.
     C'est la même graduation que la colonne « Écart » de la fiche
     d'impédance — un lecteur qui vient d'y apprendre que le rouge est le
     dépassement ne doit pas la réapprendre ici. */
  const ref=alims.length?Math.max.apply(null,alims.map(b=>b.consigne)):0;
  const bud=SIM.dcBudget.chute;
  /* LA COUCHE DE CHAQUE BORNE, ET C'EST CE QUI MANQUAIT. La carte ne peint
     qu'UNE couche ; une charge posée ailleurs n'y apparaît pas, et son cuivre
     resté noir se lit « cette charge ne donne rien » au lieu de « elle est sur
     une autre couche ». La colonne le dit, et les bornes de la couche peinte
     se distinguent des autres. */
  const vue=simDCCoucheVoulue();
  let html='<table class="simTab simTabDC"><tr><th>Borne</th><th>Couche</th>'+
           "<th>Réglage</th><th>Tension</th><th>Perdu</th></tr>";
  const ligne=(b,src)=>{
    let perdu="—", cls="";
    if(!src){
      const pct=(ref>0)?100*b.chute/ref:null;
      perdu="−"+simNb(b.chute*1e3,2)+" mV";
      if(pct!=null){
        perdu+="<small>"+simNb(pct,2)+" %</small>";
        cls=(pct>bud)?"z0ko":((pct>0.8*bud)?"z0limite":"z0ok");
      }
    }
    /* PEINTE OU NON : une borne sur la couche qu'on regarde est en clair, les
       autres en gris. C'est la réponse d'un coup d'œil à « pourquoi ne vois-je
       rien autour de celle-là ». */
    const ici=(b.couche===vue);
    html+="<tr><td>"+simEsc(b.repere||"—")+
          ' <i class="simFaible">'+(src?"source":"charge")+"</i></td>"+
          "<td"+(ici?"":' class="simFaible"')+' title="'+
          simEsc(ici?"sur la couche peinte"
                    :"PAS sur la couche peinte : le cuivre autour de cette "+
                     "borne n'est pas coloré ici, ce qui ne veut pas dire "+
                     "qu'elle ne porte rien")+'">'+
          simEsc(simDCNomCouche(b.couche))+"</td>"+
          "<td>"+(src?simNb(b.consigne,3)+" V"
                     :simNb(Math.abs(b.consigne),3)+" A")+"</td>"+
          "<td>"+simNb(b.tension,4)+" V</td>"+
          "<td"+(cls?' class="'+cls+'"':"")+">"+perdu+"</td></tr>";
  };
  alims.forEach(b=>ligne(b,true));
  charges.forEach(b=>ligne(b,false));
  html+="</table>";
  /* CE QUE LA CARTE NE MONTRE PAS. Une borne hors de la couche peinte n'a
     aucune couleur autour d'elle, et c'est le piège : on lit un défaut là où
     il n'y a qu'un changement de point de vue. */
  const ailleurs=bornes.filter(b=>b.couche!==vue);
  if(ailleurs.length)
    html+='<p class="simNote">· '+ailleurs.length+' borne(s) ne sont PAS sur '+
      'la couche peinte ('+simEsc(simDCNomCouche(vue))+') : '+
      ailleurs.map(b=>simEsc(b.repere||"—")).join(", ")+
      ". Le cuivre autour d'elles n'est pas coloré ici — cela ne veut pas "+
      "dire qu'elles ne portent rien : changez de couche peinte pour les "+
      "voir. Les chiffres du tableau, eux, sont ceux de tout le calcul.</p>";
  if(charges.length>1){
    /* LA PIRE CHARGE, dite en une phrase — mais seulement s'il y en a
       PLUSIEURS. Avec une seule, le verdict d'en-tête l'a déjà nommée trois
       lignes plus haut, et la répéter apprend à sauter les notes. */
    const pire=charges.reduce((a,b)=>(b.chute>a.chute?b:a));
    html+='<p class="simNote">· La charge la plus mal servie est <b>'+
          simEsc(pire.repere||"—")+"</b> : il lui arrive "+
          simNb(pire.tension,4)+" V, soit "+simNb(pire.chute*1e3,2)+
          " mV de moins qu'à la source"+
          (ref?" ("+simNb(100*pire.chute/ref,2)+" %)":"")+".</p>";
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
  const bud=SIM.dcBudget.dt;
  /* LES DEUX MODÈLES CÔTE À CÔTE, et c'est le seul moyen de les lire. Le
     chiffre qui décide est l'ÉTALEMENT — celui qui tient compte du stratifié
     et des plans, ce que la campagne IPC-2152 a mesuré. La charte IPC-2221 est
     à côté, en gris : là où les deux se ressemblent, la carte n'évacue rien ;
     là où elles s'écartent, c'est un plan qui travaille. */
  let html='<table class="simTab simTabDC"><tr><th>Net</th>'+
           "<th>Échauffement</th><th>IPC-2221</th><th>Section</th>"+
           "<th>Densité de pointe</th></tr>";
  for(const net of Object.keys(pires).sort()){
    const p=pires[net];
    const ou=p.echauffement_en
      ? " en "+simNb(p.echauffement_en[0],2)+" ; "+
        simNb(p.echauffement_en[1],2)+" mm, couche "+(p.echauffement_en[2]+1)
      : "";
    const cls=(p.echauffement>bud)?"z0ko"
             :((p.echauffement>0.8*bud)?"z0limite":"z0ok");
    const charte=p.echauffement_ipc2221;
    /* L'ÉCART EN GRAND, L'ABSOLU EN PETIT DESSOUS. L'écart est ce sur quoi on
       élargit une piste ; l'absolu est ce qu'on compare au Tg du stratifié ou
       à la cote d'un boîtier. Les deux se lisent, et ni l'un ni l'autre ne
       remplace l'autre. */
    html+="<tr><td>"+simEsc(net)+"</td>"+
          '<td class="'+cls+'" title="'+
          simEsc("Le plus chaud"+ou+". Ambiante "+
                 simNb(SIM.dcAmbiante,0)+" °C.")+'">+'+
          simNb(p.echauffement,2)+" °C<small>"+
          simNb(SIM.dcAmbiante+p.echauffement,1)+" °C</small></td>"+
          '<td class="simFaible" title="'+
          simEsc("La charte historique, au MÊME point : elle ignore le "+
                 "stratifié et les plans, et rend une couche interne 4,83 "+
                 "fois plus chaude qu'une externe — ce que la campagne "+
                 "IPC-2152 a mesuré faux.")+'">'+
          (charte>0?"+"+simNb(charte,2)+" °C":"—")+"</td>"+
          "<td>"+simNb(p.largeur_chaude,2)+" mm</td>"+
          '<td title="'+simEsc("Maximum ponctuel : il dit où regarder, pas "+
            "combien. À un angle vif il croît quand on affine la trame.")+
          '">'+simNb(p.densite,1)+" A/mm²</td></tr>";
  }
  html+="</table>";
  html+=simThermiqueDC(res);
  return html;
}

/* ===========================================================================
   D'OÙ VIENT LA TEMPÉRATURE, ET SUR QUELLES COTES

   MÊME RÔLE QUE « LA SECTION RÉSOLUE » DANS LA FICHE D'IMPÉDANCE : quand un
   chiffre ne tombe pas sur la carte réelle, ce sont ses ENTRÉES qui diffèrent,
   et les faire remonter est le seul moyen de retrouver la cause sans inverser
   le résultat. Ici les entrées sont trois : la conductivité du laminé,
   l'épaisseur de stratifié, et le cuivre qui étale.

   LA PROVENANCE COMPTE AUTANT QUE LA VALEUR. « 6 K sur un λ de 0,8 déclaré »
   et « 6 K sur un λ de 0,8 supposé » ne se défendent pas pareil devant un
   fabricant, et le solveur rend justement la liste de ce qu'il a supposé.
   ========================================================================== */
function simThermiqueDC(res){
  let h='';
  const th=res.thermique;
  if(th){
    /* LES COTES D'ABORD, LA PROSE ENSUITE. C'est la page qui les écrit, et
       elle seule : le solveur les rend dans `thermique` mais s'abstient de les
       mettre dans sa phrase, sinon la même fiche afficherait « 0.80 » puis
       « 0,80 » à deux lignes d'écart.

       LE CUIVRE ÉTALEUR EST LE TERME QUI DÉCIDE, et c'est le moins évident :
       35 µm de cuivre pleine carte étalent dix fois mieux que 1,6 mm de FR-4.
       Zéro veut dire « aucun plan » — donc la carte la plus chaude que ce
       modèle sache décrire, et il faut le lire comme tel. */
    h+='<p class="simNote">· <b>Étalement</b> : '+
       simNb(th.longueur_etalement,1)+' mm de portée thermique, sur '+
       simNb(th.epaisseur_stratifie,2)+' mm de stratifié à λ = '+
       simNb(th.k_stratifie,2)+' W/(m·K) et '+
       simNb(th.cuivre_etaleur*1e3,0)+' µm de cuivre étaleur'+
       (th.cuivre_etaleur>0
          ? ''
          : ' — <b>aucun plan</b> : c\'est la carte la plus chaude que ce '+
            'modèle décrive')+
       ', échange '+simNb(th.h_surface,0)+' W/(m²·K) par face.</p>';
    if(SIM.dcLambda&&parseFloat(String(SIM.dcLambda).replace(",","."))>0){
      const saisi=parseFloat(String(SIM.dcLambda).replace(",","."));
      if(Math.abs(saisi-th.k_stratifie)>1e-9)
        h+='<p class="simNote simAlerte">· Le λ saisi ('+simNb(saisi,2)+
           ') n\'est pas celui de ce résultat ('+simNb(th.k_stratifie,2)+
           ') : relancez le calcul.</p>';
    }
  }
  if(res.modele_thermique)
    h+='<p class="simNote">· '+simEsc(res.modele_thermique)+'</p>';
  h+='<p class="simNote">· Couche(s) prise(s) pour extérieure(s) : '+
     ((res.couches_externes||[]).map(c=>c+1).join(", ")||"aucune")+
     '. Une extérieure perd en plus par sa face nue ; la charte, elle, en '+
     'fait un facteur 4,83.</p>';
  /* L'AMBIANTE, DITE UNE FOIS. Elle n'entre dans aucun calcul — l'échauffement
     est un écart —, et c'est précisément pour cela qu'il faut l'écrire : le
     chiffre absolu du tableau en dépend entièrement, et personne ne devine
     d'où il sort. */
  h+='<p class="simNote">· <b>Ambiante</b> : '+simNb(SIM.dcAmbiante,0)+
     ' °C. Elle n\'entre dans aucun calcul — l\'échauffement est un ÉCART, et '+
     'un écart vaut autant en kelvins qu\'en degrés Celsius — mais c\'est '+
     'elle qui donne la température ABSOLUE du point chaud, la seule qu\'on '+
     'puisse comparer au Tg du stratifié ou à la cote d\'un boîtier.</p>';
  return h;
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
    return '<p class="simNote">· Aucun via sur ce net : tout le courant reste '+
           'sur une seule couche.</p>';

  const relies=vias.filter(v=>v.relie);
  /* UNE MARQUE NE VAUT QUE SI ELLE SÉPARE. Quand le fichier ne déclare AUCUNE
     portée — le cas le plus courant —, un « ? » sur chacune des quinze lignes
     ne distingue plus rien : il devient du bruit qu'on apprend à ne plus voir,
     et il emporte avec lui les cas où la marque compte vraiment. On ne marque
     donc que si le tableau est MÊLÉ ; sinon, la note en dessous le dit une
     fois pour toutes. Même règle pour le perçage supposé. */
  const melangePortee=vias.some(v=>v.portee_supposee)&&
                      vias.some(v=>!v.portee_supposee);
  const melangePercage=vias.some(v=>v.percage_suppose)&&
                       vias.some(v=>!v.percage_suppose);
  let html='<table class="simTab simTabDC"><tr><th>Via</th><th>Couches</th>'+
           "<th>Courant</th><th>Chute</th><th>R</th></tr>";
  vias.slice(0,SIM_DC_VIAS_MAX).forEach(v=>{
    if(!v.relie){
      html+="<tr><td>"+simEsc(v.repere||"—")+"</td>"+
            "<td>"+(v.couche_a+1)+"→"+(v.couche_b+1)+"</td>"+
            '<td colspan="3" class="z0ko">hors calcul<small>'+
            simEsc(v.motif||"non relié")+"</small></td></tr>";
      return;
    }
    /* Le courant en MILLIAMPÈRES sous l'ampère : « 0,043 A » se lit mal, et
       c'est précisément dans cette plage que se tiennent les vias qui ne
       travaillent pas. */
    const i=Math.abs(v.courant);
    const ia=(i>=1)?simNb(i,3)+" A":simNb(i*1e3,1)+" mA";
    /* LA RÉSISTANCE D'UN PERÇAGE SUPPOSÉ EST MARQUÉE, et il fallait le faire :
       R va comme 1/A, donc un diamètre deviné à cinquante pour cent près se
       paie DOUBLE sur l'ohm. Sans marque, « 0,076 mΩ » déduit d'une pastille
       et « 0,295 mΩ » lu dans le fichier se lisaient avec le même aplomb, et
       rien dans le tableau ne disait lequel repose sur un trou inventé. */
    const sup=v.percage_suppose&&melangePercage;
    const por=v.portee_supposee&&melangePortee;
    /* DEUX HYPOTHÈSES, DEUX MARQUES, ET ELLES NE COÛTENT PAS LA MÊME CHOSE.
       Un PERÇAGE supposé fausse la résistance de la liaison — le chemin existe,
       son ohm est incertain. Une PORTÉE supposée met en cause la LIAISON
       ELLE-MÊME : si le trou est borgne, elle n'existe pas, et le courant
       qu'elle porte n'existe pas non plus. La seconde est un ordre de gravité
       au-dessus, donc elle se marque sur les COUCHES, là où on la lit. */
    html+='<tr><td title="'+simEsc("en "+simNb(v.x,3)+" ; "+simNb(v.y,3)+
          " mm"+(sup?" — perçage SUPPOSÉ, déduit de la pastille":""))+'">'+
          simEsc(v.repere||"—")+(sup?' <i class="simFaible">?</i>':"")+"</td>"+
          "<td"+(por?' class="z0limite" title="'+
            simEsc("PORTÉE SUPPOSÉE : le fichier ne déclare pas entre quelles "+
                   "couches ce perçage court, il est pris TRAVERSANT. Si le "+
                   "trou est borgne ou enterré, cette liaison N'EXISTE PAS — "+
                   "et le courant qui la traverse non plus.")+'"':"")+">"+
          (v.couche_a+1)+"→"+(v.couche_b+1)+(por?" ?":"")+"</td>"+
          "<td>"+ia+"</td>"+
          "<td>"+simNb(v.chute*1e3,3)+" mV</td>"+
          '<td'+(sup?' class="simFaible" title="'+
            simEsc("Perçage SUPPOSÉ (déduit de la pastille) : la résistance "+
                   "va comme 1/section, donc un diamètre deviné à cinquante "+
                   "pour cent près se paie double ici.")+'"':"")+">"+
          simNb(v.resistance*1e3,3)+" mΩ</td></tr>";
  });
  html+="</table>";
  if(vias.length>SIM_DC_VIAS_MAX)
    html+='<p class="simNote">· '+(vias.length-SIM_DC_VIAS_MAX)+
          " via(s) de plus, moins chargés que ceux-ci.</p>";
  /* CE QUE LES MARQUES NE DISENT PLUS PARCE QU'ELLES SERAIENT PARTOUT. */
  if(!melangePortee&&vias.length&&vias.every(v=>v.portee_supposee))
    html+='<p class="simNote">· <b>Aucune</b> de ces portées n\'est déclarée '+
          'par le fichier : elles sont TOUTES supposées traversantes, et les '+
          'lignes ne sont donc pas marquées une à une.</p>';
  if(!melangePercage&&vias.length&&vias.every(v=>v.percage_suppose))
    html+='<p class="simNote">· <b>Aucun</b> de ces perçages n\'est déclaré '+
          'par le fichier : ils sont TOUS déduits d\'une pastille, et les '+
          'résistances ci-dessus en héritent.</p>';

  html+=simDesequilibreVias(relies);
  html+=simPorteesSupposees(relies);
  html+=simCulsDeSac(res);
  return html;
}

/* ==========================================================================
   LES CULS-DE-SAC, ET LA LOI QU'ILS VÉRIFIENT
   --------------------------------------------------------------------------
   C'EST LA RÉPONSE À « POURQUOI CE VIA PORTE-T-IL DU COURANT VERS UNE PASTILLE
   OÙ JE N'AI RÉGLÉ AUCUNE CHARGE ? », et c'est une objection juste : un
   morceau de cuivre relié au reste par UN SEUL chemin, et qui ne porte ni
   source ni charge, ne peut porter AUCUN courant. Ce qui entre doit sortir, et
   il n'y a pas d'autre porte.

   Il n'y a donc que deux réponses possibles, et il fallait pouvoir dire
   laquelle :

     · le cuivre CONTINUE au-delà de cette pastille — une piste en part, ou
       elle est posée sur un plan — et le courant ne fait que passer. La
       pastille n'est pas un terminus, c'est un point de passage ;
     · le cuivre s'arrête là, et alors un courant non nul serait un BUG.

   LE SOLVEUR TRANCHE MAINTENANT LUI-MÊME (`_culs_de_sac`) : il trouve les
   morceaux sans issue et vérifie que les vias qui les alimentent portent zéro.
   Cette note le rend visible — et c'est ce qui permet de conclure sur SA
   carte : les culs-de-sac portent zéro, donc un via qui porte du courant n'en
   est pas un.
   ========================================================================== */
function simCulsDeSac(res){
  const c=res&&res.culs_de_sac;
  if(!c||!c.morceaux)return '';
  const i=c.pire_courant||0;
  /* AU-DELÀ DU BRUIT DU SOLVEUR, C'EST UN DÉFAUT — et le solveur l'a déjà mis
     dans ses avertissements, qui passent en rouge. Ici on ne répète pas : on
     ne parle que du cas normal, celui qui INSTRUIT. */
  if(i>1e-6)return '';
  /* « EXACTEMENT ZERO » SERAIT UN MENSONGE : le gradient conjugué s'arrête
     sur un résidu, pas sur un zéro. Et « moins de 0,000 µA » est pire — une
     fausse précision qui se lit quand même comme zéro. Le seuil est donc
     celui de l'ÉCRITURE : au-dessus du millième de microampère on donne le
     chiffre, en dessous on dit ce que c'est vraiment — un zéro numérique. */
  const ecrit=(i>=1e-9)?("moins de "+simNb(i*1e6,3)+" µA")
                       :"zéro à la précision du calcul";
  return '<p class="simNote">· '+c.morceaux+
    ' morceau(x) de cuivre SANS ISSUE ('+c.noeuds+
    ' nœuds) : ni source, ni charge, ni autre liaison verticale. Les vias qui '+
    'les alimentent portent '+ecrit+
    ' — vérifié, et c\'est la loi : ce qui entre dans un cul-de-sac doit en '+
    'sortir, et il n\'y a pas d\'autre porte. Un via qui porte du courant '+
    'n\'est donc PAS un cul-de-sac : le cuivre continue au-delà de sa '+
    'pastille, et le courant ne fait que passer.</p>';
}

/* ==========================================================================
   COMBIEN DE COURANT REPOSE SUR UNE PORTÉE SUPPOSÉE
   --------------------------------------------------------------------------
   C'EST LA SEULE FAÇON DONT CE CALCUL PEUT INVENTER DU COURANT, et il fallait
   pouvoir la chiffrer. Un perçage dont le fichier ne déclare pas les couches
   est pris TRAVERSANT — l'hypothèse qui ne perd aucun chemin, donc la bonne
   par défaut. Mais si le trou est en réalité borgne, la liaison verticale
   n'existe pas : le solveur y fait passer du courant, et ce courant-là n'est
   dans aucun cuivre réel.

   « 21 trous pris pour traversants » ne dit pas si ça compte. Un via supposé
   qui porte 0,01 mA ne change rien ; le même qui porte le tiers du rail change
   tout, et il faut alors aller vérifier CE trou dans le fichier de perçage.
   C'est donc une PART DU COURANT qu'on rend, pas un compte de trous.
   ========================================================================== */
function simPorteesSupposees(relies){
  let total=0, suppose=0, n=0, pire=null;
  for(const v of relies){
    const i=Math.abs(v.courant);
    total+=i;
    if(!v.portee_supposee)continue;
    suppose+=i; n++;
    if(!pire||i>Math.abs(pire.courant))pire=v;
  }
  if(!n||!(total>0))return '';
  const part=100*suppose/total;
  const ma=x=>(x>=1)?simNb(x,3)+" A":simNb(x*1e3,1)+" mA";
  /* UNE PART, ET SURTOUT PAS UNE SOMME D'AMPÈRES. `suppose` est une somme de
     VALEURS ABSOLUES sur des liaisons : le même ampère y est compté une fois
     en descendant et une fois en remontant, et une chaîne de trois liaisons le
     compte trois fois. Écrire « 5,643 A » à côté d'un rail de 2 A rouvrirait
     exactement la confusion que le reste de cette fiche sert à fermer. Le
     RAPPORT, lui, est juste : les deux sommes se comptent de la même façon,
     et le double comptage s'annule. Le seul ampère qu'on écrit est celui du
     via le plus chargé — celui-là est un vrai courant. */
  if(part<1)
    return '<p class="simNote">· '+n+' via(s) sur une portée SUPPOSÉE '+
           'traversante ne portent, ensemble, que '+simNb(part,2)+
           ' % du passage vertical : l\'hypothèse ne pèse rien sur ce '+
           'résultat.</p>';
  return '<p class="simNote simAlerte">· '+n+
    ' via(s) sont montés sur une portée SUPPOSÉE traversante, et ils portent '+
    '<b>'+simNb(part,1)+' %</b> du passage vertical'+
    (pire?" — le plus chargé est "+simEsc(pire.repere||"?")+", à "+
      ma(Math.abs(pire.courant)):"")+
    '. Le fichier ne déclare pas entre quelles couches ces perçages courent : '+
    's\'ils sont borgnes ou enterrés, ces liaisons N\'EXISTENT PAS et ce '+
    'courant passe ailleurs. C\'est la part de ce résultat qui repose sur une '+
    'hypothèse, et le seul moyen de la lever est le fichier de perçage.</p>';
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
/* CE QUI COMPTE COMME « SUR LE CHEMIN ». Un via qui porte un centième de ce
   que porte le groupe ne partage rien : il relie du cuivre qui ne demande pas
   de courant. Le seuil sert à SÉPARER DEUX PHRASES qui ne disent pas la même
   chose, pas à cacher un chiffre. */
const SIM_DC_VIA_ACTIF=0.01;      // 1 % du passage du groupe

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
    const max=Math.max.apply(null,cs);
    /* COMBIEN SONT VRAIMENT SUR LE CHEMIN. C'est la question que la phrase
       d'avant escamotait : elle divisait par le nombre de vias du COUPLE DE
       COUCHES, sans regarder si ces vias portent quelque chose. */
    const actifs=cs.filter(c=>c>=SIM_DC_ACTIF_SEUIL(tot)).length;
    const part=100*max/tot;
    if(!pire||part>pire.part)
      pire={cle:cle, part:part, n:cs.length, actifs:actifs, tot:tot};
  }
  if(!pire)return '';
  const c=pire.cle.split("-"), a=(+c[0]+1), b=(+c[1]+1);
  const ma=(pire.tot>=1)?simNb(pire.tot,3)+" A"
                        :simNb(pire.tot*1e3,1)+" mA";
  /* DEUX SITUATIONS, DEUX PHRASES. La première n'est PAS un défaut : sur un
     plan cousu, la plupart des vias d'un couple de couches ne sont sur aucun
     chemin — ils relient du cuivre qui ne demande pas de courant. Les compter
     comme des parallèles inactifs faisait annoncer « le plus chargé en prend
     100 % contre 4,8 % à parts égales », ce qui se lit comme une alarme et
     envoie corriger ce qui n'est pas en cause. */
  if(pire.actifs<=1)
    return '<p class="simNote">· Entre les couches '+a+' et '+b+', '+pire.n+
           " via(s) relient les deux, et UN SEUL porte le passage ("+ma+
           ") : les autres joignent du cuivre qui ne demande pas de courant — "+
           "des coutures, ou une plage sans consommateur au bout. Ce n'est pas "+
           "un déséquilibre, c'est un chemin unique. Doubler CE via-là est le "+
           "seul geste qui change quelque chose.</p>";
  return '<p class="simNote">· Entre les couches '+a+' et '+b+', '+pire.actifs+
         " via(s) sur "+pire.n+" portent le passage ("+ma+
         ") : le plus chargé en prend "+simNb(pire.part,1)+
         " %, contre "+simNb(100/pire.actifs,1)+
         " % s'ils travaillaient à parts égales. Les "+
         (pire.n-pire.actifs)+" autres ne sont sur aucun chemin.</p>";
}
/* Le seuil en ampères, tiré du passage du groupe. Une fonction plutôt qu'une
   multiplication en ligne : le seuil se lit une fois, et il se conteste. */
function SIM_DC_ACTIF_SEUIL(total){return SIM_DC_VIA_ACTIF*total;}

/* ==========================================================================
   CE QUE LA CARTE EMPORTE DE CHALEUR — LE BLOC `thermique` DU DOCUMENT
   --------------------------------------------------------------------------
   L'ÉCHAUFFEMENT NE SE LIT PLUS SUR UNE CHARTE. IPC-2221 ne connaît que la
   section du conducteur : elle ignore le stratifié et les plans, c'est-à-dire
   les deux seuls chemins par lesquels la chaleur part vraiment. Le solveur
   résout maintenant l'ÉTALEMENT dans la carte — ce que la campagne IPC-2152 a
   mesuré —, et il lui faut pour cela trois cotes que l'empilage porte déjà :

     · `k_stratifie`       la conductivité du laminé DANS LE PLAN, W/(m·K) ;
     · `epaisseur_stratifie`  l'épaisseur de diélectrique, en mm ;
     · `cuivre_etaleur`    l'épaisseur de cuivre qui étale EFFECTIVEMENT, en
                           mm — un plan compte pour son épaisseur, une couche
                           de signal pour sa part de remplissage.

   C'EST L'ADAPTATEUR QUI LES FOURNIT, parce que c'est lui qui a l'empilage :
   `cuivreDC()` rend un champ `thermique`. Ce qui se décide ICI est ce qui
   vient du PANNEAU — le λ saisi, qui l'emporte sur celui de l'outil — et
   rien d'autre. Absent des deux, le solveur pose ses replis ET LES DIT.

   POURQUOI LE λ SAISI L'EMPORTE : aucun fichier de CAO ne porte la
   conductivité thermique de son laminé. L'outil ne peut au mieux que la
   deviner de son nom de matériau ; l'utilisateur, lui, a la fiche du
   fabricant.
   ========================================================================== */
function simDCThermique(probleme){
  const th=Object.assign({}, (probleme&&probleme.thermique)||{});
  const saisi=parseFloat(String(SIM.dcLambda||"").replace(",","."));
  if(saisi>0)th.k_stratifie=saisi;
  /* PAS DE SÉLECTEUR DE MODÈLE, et ce n'est pas un oubli : le solveur rend les
     DEUX tableaux dans le même résultat, la fiche affiche les deux chiffres et
     la liste des cartes propose les deux peintures. Un commutateur ne ferait
     que cacher l'un des deux — c'est-à-dire retirer la comparaison, qui est
     précisément ce qui apprend quelque chose. */
  return th;
}

/* ==========================================================================
   EXPORTER LE RÉSULTAT DE LA CHUTE DC
   --------------------------------------------------------------------------
   POURQUOI IL FAUT LES DEUX, ET CE QUE CHACUN PORTE.

   LE .csv EST UNE PIÈCE. Il va dans un dossier de fabrication, dans un
   tableur, dans un courriel : quatre tableaux à plat — les bornes, les nets,
   le pire point de chacun, et le détail via par via — précédés des RÉGLAGES
   qui les ont produits. Un tableau de chiffres sans son λ, son ambiante et sa
   trame ne se vérifie pas six mois plus tard.

   LE .json SE REJOUE ET SE COMPARE. Il porte le problème ENTIER — le cuivre
   envoyé, les bornes, les cotes thermiques — et le résultat à côté. C'est ce
   qu'on garde avant de changer une piste, pour savoir ensuite ce que le
   changement a coûté ; et c'est ce qu'on joint à un rapport de bug, parce
   qu'il suffit à rejouer le calcul sans la carte.

   LES DEUX PARTENT DE `SIM.resDC`, jamais d'un recalcul : on exporte ce qui
   est AFFICHÉ. Réinterroger l'adaptateur rendrait un fichier qui ne
   correspond à aucune fiche — le défaut que `simExportJson` documente déjà de
   son côté.
   ========================================================================== */
function simDCNomFichier(ext){
  const nets=Object.keys((SIM.resDC&&SIM.resDC.chute_par_net)||{});
  const net=(nets[0]||"dc").replace(/[^A-Za-z0-9_+-]+/g,"_").slice(0,32);
  return "chute-"+net+ext;
}

/* Une cellule de .csv : le point-virgule sépare, donc il se protège. La
   VIRGULE DÉCIMALE est celle d'un tableur français — `simNb` l'écrit déjà, et
   c'est pour cela que le séparateur de colonnes est le point-virgule. */
function simCsvCell(v){
  const t=String(v==null?"":v);
  return /[";\n]/.test(t)?'"'+t.replace(/"/g,'""')+'"':t;
}
function simCsvLigne(cs){return cs.map(simCsvCell).join(";");}

function simDCCsvTexte(){
  const res=SIM.resDC;
  if(!res)return "";
  const th=res.thermique||{};
  const L=[];
  const bloc=(titre,entetes,lignes)=>{
    L.push("");
    L.push(simCsvLigne([titre]));
    L.push(simCsvLigne(entetes));
    for(const l of lignes)L.push(simCsvLigne(l));
  };
  /* LES RÉGLAGES D'ABORD : c'est l'assiette du chiffre, et sans elle le reste
     du fichier ne se vérifie pas. */
  L.push(simCsvLigne(["Chute de tension continue (IR drop)"]));
  L.push(simCsvLigne(["modèle thermique",res.modele_thermique||""]));
  L.push(simCsvLigne(["lambda stratifié (W/(m·K))",simNb(th.k_stratifie,2)]));
  L.push(simCsvLigne(["épaisseur de stratifié (mm)",
                      simNb(th.epaisseur_stratifie,3)]));
  L.push(simCsvLigne(["cuivre étaleur (mm)",simNb(th.cuivre_etaleur,4)]));
  L.push(simCsvLigne(["échange en surface (W/(m²·K))",
                      simNb(th.h_surface,1)]));
  L.push(simCsvLigne(["portée thermique (mm)",
                      simNb(th.longueur_etalement,2)]));
  L.push(simCsvLigne(["supposé faute de mieux",(th.replis||[]).join(", ")]));
  L.push(simCsvLigne(["ambiante (°C)",simNb(SIM.dcAmbiante,1)]));
  L.push(simCsvLigne(["budget de chute (%)",simNb(SIM.dcBudget.chute,1)]));
  L.push(simCsvLigne(["budget d'échauffement (°C)",simNb(SIM.dcBudget.dt,1)]));
  L.push(simCsvLigne(["trame (mm)",simNb(res.pas,4)]));
  L.push(simCsvLigne(["nœuds",res.n_noeuds]));
  L.push(simCsvLigne(["liaisons",res.n_aretes]));
  L.push(simCsvLigne(["trous métallisés reliés",res.n_vias]));
  L.push(simCsvLigne(["couches calculées",
                      (res.couches||[]).map(c=>c+1).join(" ")]));
  L.push(simCsvLigne(["couches extérieures",
                      (res.couches_externes||[]).map(c=>c+1).join(" ")]));

  bloc("Bornes",["borne","rôle","couche","réglage","unité","tension (V)",
                 "perdu (mV)"],
    (res.bornes||[]).map(b=>{
      const src=b.role==="tension";
      return [b.repere||"", src?"source":"charge", b.couche+1,
              simNb(src?b.consigne:Math.abs(b.consigne),4), src?"V":"A",
              simNb(b.tension,5), src?"":simNb(b.chute*1e3,3)];
    }));

  const ch=res.chute_par_net||{}, cour=res.courant_par_net||{};
  bloc("Nets",["net","référence","courant (A)","chute (mV)"],
    Object.keys(ch).sort().map(n=>[
      n, (res.reference_nets||[]).indexOf(n)>=0?"oui":"non",
      simNb(Math.abs(cour[n]||0),4), simNb(ch[n]*1e3,3)]));

  bloc("Pire point par net",
    ["net","échauffement (°C)","absolu (°C)","IPC-2221 (°C)","section (mm)",
     "densité de pointe (A/mm²)","x (mm)","y (mm)","couche"],
    Object.keys(res.pire_par_net||{}).sort().map(n=>{
      const p=res.pire_par_net[n], o=p.echauffement_en||[0,0,0];
      return [n, simNb(p.echauffement,3),
              simNb(SIM.dcAmbiante+p.echauffement,2),
              simNb(p.echauffement_ipc2221||0,3), simNb(p.largeur_chaude,3),
              simNb(p.densite,2), simNb(o[0],3), simNb(o[1],3), o[2]+1];
    }));

  bloc("Vias",["via","couches","courant (mA)","chute (mV)","R (mOhm)",
               "perçage (mm)","perçage supposé","x (mm)","y (mm)","état"],
    (res.vias||[]).map(v=>[
      v.repere||"", (v.couche_a+1)+" -> "+(v.couche_b+1),
      simNb(Math.abs(v.courant)*1e3,3), simNb(v.chute*1e3,4),
      simNb(v.resistance*1e3,4), simNb(v.percage||0,3),
      v.percage_suppose?"oui":"non", simNb(v.x,3), simNb(v.y,3),
      v.relie?"relié":("hors calcul : "+(v.motif||""))]));

  /* LES RÉSERVES PARTENT AVEC LES CHIFFRES. Un .csv se détache de la page où
     il a été produit ; sans elles, il ne reste qu'un tableau dont on ne sait
     plus ce qu'il suppose. */
  const notes=(SIM.dcNotes||[]).concat(res.avertissements||[]);
  if(notes.length)bloc("Réserves",["ce que le résultat suppose"],
                       notes.map(t=>[t]));
  return L.join("\r\n");
}
/* LE TEXTE ET LE TÉLÉCHARGEMENT SONT DEUX CHOSES, et c'est ce qui rend
   l'export éprouvable : `simDCCsvTexte` est PURE — elle lit l'état et rend une
   chaîne —, et c'est elle que le banc d'essai vérifie. Un export qu'on ne peut
   contrôler qu'en cliquant dans un navigateur n'est pas contrôlé. */
function simDCExportCsv(){
  const t=simDCCsvTexte();
  if(t)simTelecharger(t,simDCNomFichier("-dc.csv"),"text/csv;charset=utf-8");
}

function simDCJsonTexte(){
  const res=SIM.resDC;
  if(!res)return "";
  /* LE PROBLÈME TEL QU'IL EST PARTI, redemandé à l'adaptateur : le cuivre n'a
     pas bougé depuis le calcul, et le garder en mémoire doublerait le poids de
     l'état pour un bouton qu'on clique une fois. Si la sélection a changé
     entre-temps, l'adaptateur refuse et on n'écrit que le résultat : mieux
     vaut un fichier honnêtement incomplet qu'un problème qui ne correspond
     pas à sa réponse. */
  let probleme=null;
  try{
    const p=(SIM_ED&&SIM_ED.cuivreDC)?SIM_ED.cuivreDC():null;
    if(p&&!p.erreur)probleme=p;
  }catch(_){probleme=null;}
  const bornes=(SIM_ED&&SIM_ED.dcBornes)?SIM_ED.dcBornes():[];
  return JSON.stringify({
    format:"cao-sim-dc-export-1",
    outil:(SIM_ED&&SIM_ED.outil)||"",
    date:new Date().toISOString(),
    reglages:{
      lambda_saisi:SIM.dcLambda||null,
      ambiante:SIM.dcAmbiante,
      budget:{chute_pct:SIM.dcBudget.chute, echauffement_c:SIM.dcBudget.dt},
      trame:SIM.dcFinesse||null,
      grandeur_peinte:SIM.dcQuoi,
      couche_peinte:SIM.dcCouche
    },
    bornes:bornes.map(b=>({nom:b.nom, role:b.role, couche:b.couche,
                           net:b.net, valeur:b.valeur,
                           unite:simDCUnite(b).cle, x:b.x, y:b.y})),
    notes:(SIM.dcNotes||[]).slice(),
    probleme:probleme?{
      polygones:probleme.polygones, vias:probleme.vias,
      sources:probleme.sources, references:probleme.references,
      couches_externes:probleme.couches_externes,
      thermique:simDCThermique(probleme), pas:res.pas
    }:null,
    /* LE POTENTIEL PAR NŒUD N'Y EST PAS, et c'est délibéré : soixante mille
       nombres pèsent plus que tout le reste du fichier et ne se lisent pas.
       Ce qui se lit est déjà là — les bornes, les nets, le pire point, les
       vias — et le `probleme` suffit à refaire le calcul si on veut la carte. */
    resultat:{
      format:res.format, duree:res.duree,
      chute_par_net:res.chute_par_net, courant_par_net:res.courant_par_net,
      reference_nets:res.reference_nets, bornes:res.bornes,
      pire_par_net:res.pire_par_net, vias:res.vias,
      thermique:res.thermique, modele_thermique:res.modele_thermique,
      couches:res.couches, couches_externes:res.couches_externes,
      pas:res.pas, n_noeuds:res.n_noeuds, n_aretes:res.n_aretes,
      n_vias:res.n_vias, avertissements:res.avertissements
    }
  },null,1);
}
function simDCExportJson(){
  const t=simDCJsonTexte();
  if(t)simTelecharger(t,simDCNomFichier("-dc.json"),"application/json");
}

async function simDCLancer(){
  if(SIM.occupeDC)return;
  const btn=simEl("simDCGo");
  SIM.occupeDC=true;
  simProgresDemarrer();
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
      simDCOublier();
      return;
    }
    const probleme=SIM_ED.cuivreDC();
    if(!probleme||probleme.erreur){
      SIM.erreurDC=((probleme&&probleme.erreur)||"Rien à analyser.")+
                   (probleme&&probleme.conseil?"\n"+probleme.conseil:"");
      simDCOublier();
      return;
    }
    /* LA FINESSE : celle qu'on a écrite, sinon celle que le cuivre impose. */
    const fin=simDCFinesse(probleme.polygones);
    const saisi=parseFloat(String((simEl("simDCPas")||{}).value||"")
                             .replace(",","."));
    const pas=(saisi>0)?saisi:(fin?fin.pas:0);
    SIM.dcFinesse=fin?Object.assign({},fin,{choisi:pas,
                                            impose:(saisi>0)}):null;
    /* LES NOTES DE L'OUTIL, retenues AVANT l'aller-retour : elles décrivent le
       document envoyé, pas la réponse, et une requête qui échoue ne doit pas
       les faire disparaître de la fiche — c'est justement quand le solveur
       refuse qu'un « tous les trous sont supposés traversants » explique le
       refus. */
    SIM.dcNotes=(probleme.notes||[]).slice();
    SIM.resDC=await simDCCalculer({
      format:SIM_DC_FORMAT,
      polygones:probleme.polygones||[],
      vias:probleme.vias||[],
      sources:probleme.sources||[],
      references:probleme.references||[],
      couches_externes:probleme.couches_externes,
      thermique:simDCThermique(probleme),
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
    simDCOublier();
    SIM.erreurDC=(e&&e.message)||String(e);
  }finally{
    SIM.occupeDC=false;
    simProgresFini();
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
  /* LES LOTS : une sélection éparse, un résultat par morceau. `res`, `objets`,
     `portee`, `notes`, `couture` et `voisins` ci-dessus ne cessent pas
     d'exister pour autant — ils REFLÈTENT le lot actif (`lotActif`), et c'est
     ce qui permet à toute la fiche, aux exports et aux deux canevas de ne rien
     savoir des lots. Une sélection d'un seul morceau donne un lot, et le
     panneau se comporte exactement comme avant. Voir « LES LOTS », plus bas. */
  lots:[], lotActif:0, lotsAttendus:0,
  /* L'analyse DC a son propre etat : elle ne partage ni sa selection, ni son
     document, ni son verrou avec l'impedance. Les melanger ferait qu'un calcul
     de section en cours bloquerait un calcul de chute, et l'inverse. */
  resDC:null, occupeDC:false, erreurDC:"",
  /* Ce que le cuivre a imposé comme finesse de trame, et ce qu'il porte. */
  dcFinesse:null,
  /* CE QUE L'OUTIL SAIT DU MODÈLE et que le serveur ne peut pas deviner :
     l'empilage incomplet, les portées de perçage supposées, les tubes déduits
     d'une pastille. `cuivreDC()` les rendait déjà sous `notes` — rien ne les
     affichait, et un document dont tous les trous étaient supposés traversants
     ne le disait nulle part. C'est le pendant de `SIM.notes` pour l'impédance. */
  dcNotes:[],
  /* Les images de la carte, une par couche, construites a l'arrivee du
     resultat et non a chaque rafraichissement. `dcQuoi` dit LAQUELLE des
     grandeurs elles portent, et `dcCouche` LAQUELLE des couches se peint --
     `null` veut dire « celle que l'outil propose », voir `simDCCouchePeinte`.
     Superposer deux potentiels les melangerait sans le dire, donc il en faut
     une et une seule ; mais la CHOISIR est a l'utilisateur, pas au hasard de
     la premiere borne posee. */
  dcImages:null, dcQuoi:"echauffement", dcCouche:null,
  /* Les budgets : ce au-dela de quoi le resultat n'est plus acceptable. Ils ne
     changent aucun calcul -- ils donnent son sens au VERDICT, qui sans eux ne
     serait qu'un chiffre repete. `dt` est en DEGRES CELSIUS, comme tout ce qui
     est thermique dans ce panneau : un ecart de temperature vaut autant en
     kelvins qu'en degres Celsius, et les deux normes l'ecrivent en °C. */
  dcBudget:{chute:5, dt:10},
  /* L'ambiante, en °C. Elle ne change aucun calcul -- l'echauffement est un
     ECART -- et sert a ecrire le point chaud en ABSOLU. */
  dcAmbiante:20,
  /* DEPUIS QUAND CA TOURNE, en millisecondes. Un bouton grise ne distingue pas
     « ca travaille » de « c'est bloque » ; un compteur qui avance, si. Voir
     `simProgres`. */
  depuis:0, taille:"",
  /* LE VOILE : ce qui n'est pas dans la simulation s'estompe. Deux valeurs
     d'usine, et la raison est dans `simVoileActif` -- la carte des impedances
     peint tout le cuivre selectionne, celle de la chute DC un seul net sur une
     seule couche. Voiler la carte entiere autour d'un fil enleve le contexte
     qui sert justement a lire le resultat. */
  voile:{z:true, dc:false},
  /* La conductivite du stratifie, saisie. Vide = le repli du solveur. */
  dcLambda:"",
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
  /* LES RÉGLAGES SE REPLIENT. Sur le crosstalk ils occupent une pleine hauteur
     d'écran, et l'on passe son temps à faire défiler entre la réglette et les
     courbes qu'elle commande. Une fois l'analyse lancée on n'y touche plus :
     c'est le RÉSULTAT qu'on lit. Deux rangées ne se replient jamais — celle
     des boutons, sans quoi on ne pourrait plus relancer, et celle des
     avertissements de bande, qui dit que le calcul ne portera pas sur ce qu'on
     croit. Elles se marquent `simBarFixe` là où elles s'écrivent. L'état est
     GLOBAL au panneau et non par analyse : c'est un geste de mise en page, et
     le retrouver déplié en changeant d'onglet se lirait comme un défaut. */
  plie:false,
  /* Les fréquences vivent EN HERTZ ici et jusqu'au serveur ; `unite` ne dit
     que dans quoi on les écrit et les relit à l'écran. Séparer les deux est
     tout l'objet de la liste déroulante : saisir 868 en croyant écrire des
     mégahertz alors que le champ attendait des gigahertz donnait une bande
     ramenée de force, des pertes fausses d'un facteur trois, et rien à
     l'écran pour le voir avant le calcul. */
  saisie:{f1:1e8, f2:5e9, points:21, fc:1e9, z0:50, cible:50, tolPct:10,
          /* LE COUPLAGE A SES PROPRES REGLAGES, et aucun ne change le calcul
             de la ligne seule. `cibleDiff`/`tolDiffPct` colorent le verdict de
             Z differentielle -- 100 ohms est la cible de l'USB et de
             l'Ethernet. `tr` est le TEMPS DE MONTEE, et c'est le seul des
             quatre qui parte au serveur : sous « Crosstalk » il fixe le genou
             du front, donc le seuil de pas de couture et la lecture des
             decibels sous la bande du signal. Zero veut dire « deduis-le de
             la bande », ce que le serveur fait par la regle du genou.
             `swing`, `bruitPct` et `marge` vivent dans la rangee « Signal »
             de l'onglet Crosstalk : le premier convertit un rapport en volts,
             les deux autres prononcent le verdict. Aucun des trois ne part au
             serveur, et aucun ne relance quoi que ce soit. */
          /* `tr` est en SECONDES et `swing` en VOLTS — comme les fréquences
             vivent en hertz. `uniteTr` et `uniteV` ne disent que dans quoi on
             les écrit. Un `tr` à zéro n'est pas un front instantané : c'est
             « déduis-le de la bande », ce que le serveur fait par la règle du
             genou. */
          /* LE NET DE L'AUTRE MOITIE DE LA PAIRE, quand on ne veut pas
             de la detection automatique. Vide veut dire « trouve-la » : les
             suffixes _P/_N, ou les paires que l'editeur declare. Rempli, il
             part dans `doc.paires` et le serveur ne fait plus de difference
             entre cette paire-la et une paire declaree — c'est ce qui permet
             de nommer une paire que rien dans les noms ne trahit. */
          paireN:"",
          cibleDiff:100, tolDiffPct:10, tr:0, uniteTr:"ps",
          swing:3.3, uniteV:"V", bruitPct:5,
          /* LA MARGE DE BRUIT DU RÉCEPTEUR, en VOLTS comme `swing`. Zéro veut
             dire « pas de marge donnée », et l'on retombe alors sur le budget
             en pourcentage. Remplie, elle le REMPLACE : deux seuils
             concurrents seraient pires que pas de seuil du tout. */
          marge:0,
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
/* LES DEUX AUTRES GRANDEURS QUI SE SAISISSENT, ET LEURS UNITÉS.

   MÊME RÈGLE QUE POUR LES FRÉQUENCES, ET POUR LA MÊME RAISON : la valeur vit
   en SECONDES et en VOLTS d'un bout à l'autre — dans l'état, dans le document,
   jusqu'au solveur —, et l'unité ne dit que dans quoi on l'écrit à l'écran.
   Écrire 2 dans un champ qui attend des picosecondes en croyant écrire des
   nanosecondes est une faute qu'on ne voit pas : elle ne produit ni refus ni
   champ vide, seulement un bruit avant mille fois trop grand. Une liste ne se
   trompe pas de la même façon.

   Un front se saisit en picosecondes ou en nanosecondes selon la technologie —
   30 ps pour du SerDes, 5 ns pour du CMOS lent —, et une amplitude en volts ou
   en millivolts selon qu'on parle de LVCMOS ou de LVDS. */
const SIM_UNITES_TR=[
  {cle:"ps", f:1e-12},
  {cle:"ns", f:1e-9},
  {cle:"µs", f:1e-6}
];
const SIM_UNITES_V=[
  {cle:"mV", f:1e-3},
  {cle:"V",  f:1}
];
function simUniteTr(){
  return SIM_UNITES_TR.find(u=>u.cle===SIM.saisie.uniteTr)||SIM_UNITES_TR[0];
}
function simUniteV(){
  return SIM_UNITES_V.find(u=>u.cle===SIM.saisie.uniteV)||SIM_UNITES_V[1];
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

/* UNE COORDONNÉE N'EST PAS UN NOMBRE À LIRE, et la confondre avec un nombre à
   lire coûte le dessin entier. `simNb` écrit la virgule décimale française —
   c'est ce qu'il faut dans une fiche, et c'est exactement ce qu'un SVG ne sait
   pas lire : `x="123,45"` est un attribut invalide, que le navigateur ramène à
   zéro sans rien signaler, et `points="12,3 45,6"` se relit comme QUATRE
   nombres au lieu de deux paires — d'où un éventail de traits partant tous du
   même point, qui ressemble à un défaut de calcul et n'en est pas un.

   Toute géométrie SVG passe donc par ici, et par nulle part ailleurs. La
   courbe des paramètres S s'en tire depuis toujours parce qu'elle emploie
   `toFixed` directement ; c'est la même règle, écrite une fois. */
function simXY(v){
  return isFinite(v)?Number(v).toFixed(2):"0";
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
   UNE TENSION DANS SON ORDRE DE GRANDEUR — V, mV, µV
   --------------------------------------------------------------------------
   POURQUOI PAS L'UNITÉ CHOISIE POUR L'AMPLITUDE. Parce que ce n'est pas la
   même grandeur : l'amplitude vaut des volts, le bruit qui en sort vaut des
   millivolts ou des microvolts. Écrire un couplage de 0,4 % sur un signal de
   3,3 V dans l'unité du signal donnerait « 0,013 V », qu'on relit en comptant
   les zéros — et « 0,000 V » dès qu'on descend d'une décade. Un même tableau
   peut donc porter des volts en haut et des microvolts en bas ; c'est le
   contraire d'un défaut, puisque c'est précisément l'échelle qui est
   l'information.

   SOUS LE MICROVOLT ON ÉCRIT L'INÉGALITÉ, jamais un zéro : un bruit de
   quelques dizaines de nanovolts N'EST PAS nul, il est négligeable — et ces
   deux faits ne se corrigent pas de la même façon.
   ========================================================================== */
function simTension(v){
  const a=Math.abs(v||0);
  if(!(a>0))return "0 V";
  if(a>=1)return simNb(v,a>=10?1:2)+" V";
  if(a>=1e-3)return simNb(v*1e3,a>=1e-2?1:2)+" mV";
  if(a>=1e-6)return simNb(v*1e6,a>=1e-5?1:2)+" µV";
  return "< 1 µV";
}

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
/* LA RAMPE, POUR UNE CIBLE ET UNE TOLERANCE QUELCONQUES. Elle etait ecrite
   dans `simZCouleur` et ne savait donc lire que la cible d'impedance simple ;
   la carte de Z DIFFERENTIELLE a la meme question et une autre cible, et deux
   rampes ecrites separement auraient fini par ne plus se ressembler. */
function simCouleurBande(v,cible,tol,alpha){
  const a=(alpha==null)?1:alpha;
  if(!(v>0))return "rgba(139,145,156,"+a+")";       // pas de valeur : gris
  const t=Math.max(0.1,tol), d=v-cible;
  if(Math.abs(d)<=t)return "rgba("+SIM_Z_BLEU.join(",")+","+a+")";
  const pale=d>0?SIM_Z_ROUGE_PALE:SIM_Z_VERT_PALE;
  const plein=d>0?SIM_Z_ROUGE:SIM_Z_VERT;
  const k=Math.min(1,(Math.abs(d)-t)/t);
  const c=pale.map((p,i)=>Math.round(p+(plein[i]-p)*k));
  return "rgba("+c.join(",")+","+a+")";
}
function simZCouleur(z0,alpha){
  return simCouleurBande(z0,SIM.saisie.cible,simZTolAbs(),alpha);
}

/* LA CIBLE DIFFERENTIELLE A SA PROPRE TOLERANCE, et le meme plancher d'un
   dixieme d'ohm : une tolerance nulle peindrait toute la paire. */
function simZDiffTolAbs(){
  return Math.max(0.1,SIM.saisie.cibleDiff*SIM.saisie.tolDiffPct/100);
}
function simZDiffVerdict(z){
  const t=simZDiffTolAbs(), d=z-SIM.saisie.cibleDiff;
  return d>t?1:(d<-t?-1:0);
}
function simZDiffCouleur(z,alpha){
  return simCouleurBande(z,SIM.saisie.cibleDiff,simZDiffTolAbs(),alpha);
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
  if(!SIM.ouvert||!(a&&a.peint))return false;
  /* AVEC DES LOTS, IL SUFFIT QU'UN SEUL SOIT PEIGNABLE. Déplier la fiche d'un
     lot que le solveur a refusé ne doit pas éteindre les couleurs des trois
     autres : le reflet est nul, la carte ne l'est pas. */
  if(SIM.lots.length)return simLotsPeints().length>0;
  return !!SIM.res&&SIM.objets.length>0
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
   TROIS CARTES DE CHALEUR, UN SEUL CANEVAS
   --------------------------------------------------------------------------
   Les deux outils peignent le cuivre sélectionné en lisant `simZSegment` : un
   objet, une impédance, une couleur. Deux analyses de plus veulent peindre le
   MÊME cuivre avec une AUTRE grandeur — la Z différentielle par tronçon, et le
   bruit attribué à chaque tronçon —, et l'on ne va pas écrire trois fois le
   même parcours de canevas dans chacun des deux outils.

   `simCarteSegment(i)` rend donc, pour l'analyse affichée, ce qu'il faut pour
   peindre : l'objet, la valeur, une fonction de couleur et le texte de
   l'étiquette. Les outils ne savent plus ce qu'ils peignent, et c'est très
   bien : c'est ici que ça se décide, en un seul endroit.

   `simZSegment` reste, inchangé — le tableau des tronçons et les bancs
   d'essai lisent des impédances, pas des couleurs.
   ========================================================================== */
function simCarteQuoi(){
  const a=simAnalyse();
  return (a&&a.carte)||"";
}
/* La carte de chaleur du couplage, telle que le serveur la rend : un
   enregistrement par tronçon envoyé, `null` quand ce tronçon ne longe rien. */
function simChaleurRes(res){
  const c=res&&res.couplage&&res.couplage.chaleur;
  return Array.isArray(c)?c:null;
}
/* Y a-t-il une carte de chaleur à peindre, et de quoi la peindre ? */
function simCarteActive(){
  const quoi=simCarteQuoi();
  if(!SIM.ouvert||!quoi)return false;
  /* MÊME EXIGENCE D'APPARIEMENT QUE LES Z₀, et elle est déjà écrite : un lot
     dont le serveur n'a pas rendu autant de tronçons qu'on lui en a envoyé
     appareillerait des couleurs avec le cuivre du voisin. */
  const lots=simLotsPeints();
  if(!lots.length)return false;
  if(quoi==="z")return true;
  /* LA CARTE DE Z DIFFÉRENTIELLE EXIGE LA CHALEUR. Un serveur plus ancien
     rend un résultat complet SANS elle, et peindre du gris partout se lirait
     comme « rien ne couple » là où il faut lire « je n'en sais rien ». */
  return lots.some(l=>(simChaleurRes(l.res)||[]).length>0);
}

/* ==========================================================================
   LE VOILE : CE QUI N'EST PAS DANS LA SIMULATION S'EFFACE
   --------------------------------------------------------------------------
   CE QU'IL CORRIGE. Une carte de chaleur est posee sur le dessin ORDINAIRE de
   la carte, ou tout le cuivre est peint de la couleur de sa couche. Sur une
   carte dense, la couleur d'une couche ressemble a une couleur de chaleur :
   du rouge de couche a cote d'un troncon rouge de bruit, et l'oeil ne sait
   plus lequel des deux repond a la question posee. Pire : une piste QUI N'EST
   PAS DANS LA SIMULATION reste aussi vive que celles qui le sont, et rien ne
   dit qu'elle n'a pas ete regardee.

   ON POSE DONC UN VOILE DE LA COULEUR DU FOND, juste avant les cartes de
   chaleur : tout ce qui a ete dessine avant s'estompe, tout ce qui se peint
   apres — le cuivre simule, ses etiquettes, les chevelus — reste plein. La
   carte garde son contexte, lisible mais en retrait, et ce qui est chiffre se
   detache seul.

   IL NE VAUT QUE POUR LES CARTES DE CHALEUR, et il disparait avec elles : hors
   simulation la carte se lit comme avant, et rien n'est cache.
   ========================================================================== */
const SIM_VOILE_ALPHA=0.62;
/* ==========================================================================
   LE VOILE SE COUPE, ET IL NE VAUT PAS LA MÊME CHOSE DES DEUX CÔTÉS
   --------------------------------------------------------------------------
   CE QUI N'ALLAIT PAS, ET C'ÉTAIT UNE IMPASSE. Le voile s'allumait dès qu'une
   carte de chaleur existait, sans interrupteur : sur l'onglet Chute DC, toute
   la carte passait au sombre et le seul moyen de retrouver des couleurs
   normales était de CHANGER D'ONGLET. Un affichage dont on ne peut pas sortir
   n'est pas un affichage, c'est un piège.

   ET LES DEUX CARTES NE COUVRENT PAS LA MÊME SURFACE. La carte des impédances
   peint TOUT le cuivre sélectionné, tronçon par tronçon : ce qui reste sous le
   voile est du cuivre étranger, et l'estomper est exactement ce qu'on veut.
   La carte de chute DC, elle, ne peint qu'UN net, sur UNE couche — un fil dans
   une carte entière. Le voile y estompe donc tout le contexte qui sert à LIRE
   le résultat : les autres couches du même net, le connecteur d'arrivée, le
   composant alimenté. D'où deux valeurs d'usine différentes, et pas deux
   comportements différents : la case existe des deux côtés.
   ========================================================================== */
/* La case du voile, branchee de la meme facon des deux cotes. Rien a
   recalculer : seulement a redessiner. */
function simBrancherVoile(id,cle){
  const e=simEl(id);
  if(!e)return;
  e.checked=!!SIM.voile[cle];
  e.onchange=()=>{
    SIM.voile[cle]=!!e.checked;
    if(SIM_ED&&SIM_ED.redessiner)SIM_ED.redessiner();
  };
}
function simVoileActif(){
  if(typeof simCarteActive==="function"&&simCarteActive())
    return SIM.voile.z;
  if(typeof simDCActif==="function"&&simDCActif())
    return SIM.voile.dc;
  return false;
}

/* ==========================================================================
   LE CUIVRE VOISIN, ET CE QU'IL SUBIT
   --------------------------------------------------------------------------
   UNE RÈGLE, DEUX CUIVRES : toute piste peinte montre CE QU'ELLE SUBIT. La
   sélection porte ce qu'elle prend à ses voisines — c'est ce que le verdict
   juge — et chaque voisine porte ce que la sélection lui inflige.

   C'EST CETTE SECONDE CARTE QU'ON REGARDE EN ROUTANT. La question qu'on se
   pose en tirant une piste rapide n'est pas « que va-t-elle prendre » mais
   « QUI est-ce que je dérange, et OÙ sur sa piste ». La fiche répondait déjà
   « combien » — la colonne « émis » —, mais sur quelle piste et à quel endroit
   restait à deviner en regardant le routage.

   LA GÉOMÉTRIE VIENT DU DOCUMENT, PAS DE L'OUTIL. `voisinage` est une liste de
   tronçons en MILLIMÈTRES — deux points et une largeur —, la même que celle
   qui est partie au serveur ; les arcs y sont déjà en cordes. Les deux outils
   n'ont donc qu'à tracer des segments, chacun dans son monde à lui : c'est le
   seul dessin du panneau qui ne passe par aucun objet de l'outil.
   ========================================================================== */


/* Ce qu'il faut pour peindre le tronçon i : l'objet de l'outil, la valeur, sa
   couleur à l'opacité demandée, et le texte de l'étiquette. `null` quand il n'y
   a rien à peindre là. */
function simCarteSegment(i){
  if(!simCarteActive())return null;
  const quoi=simCarteQuoi();
  if(quoi==="z"){
    const s=simZSegment(i);
    return s?{obj:s.obj, seg:s.seg, valeur:s.z0, chaleur:null,
              couleur:a=>simZCouleur(s.z0,a),
              texte:s.z0>0?simNb(s.z0,1)+" Ω":""}:null;
  }
  const obj=SIM.objets[i];
  if(!obj)return null;
  const seg=(SIM.res.segments||[])[i]||null;
  const ch=(simChaleurRes(SIM.res)||[])[i]||null;
  if(quoi==="zdiff"){
    const z=ch&&ch.z_diff;
    return {obj:obj, seg:seg, valeur:z, chaleur:ch,
            couleur:a=>simZDiffCouleur(z,a),
            texte:(z>0)?simNb(z,1)+" Ω":""};
  }
  /* UNE CARTE QU'ON NE SAIT PAS PEINDRE NE SE PEINT PAS. Le registre est la
     seule source de `carte`, et une valeur qu'on n'aurait pas traitée ici
     donnerait du cuivre colorié au hasard plutôt qu'une absence visible. */
  return null;
}
/* CE QUI VAUT UNE ÉTIQUETTE, ET COMBIEN AU PLUS. Les impédances se répètent —
   une piste de cinquante tronçons de même largeur n'a qu'une valeur —, mais la
   Z différentielle change à chaque tronçon : cinquante cartouches posés sur
   cinquante millimètres de cuivre ne se lisent pas. On garde donc les plus
   PARLANTS, c'est-à-dire les plus éloignés de ce qu'on visait. */
const SIM_CARTE_MAX_ETIQ=8;
function simCarteRetenir(parValeur){
  const v=[...parValeur.values()];
  if(v.length<=SIM_CARTE_MAX_ETIQ)return v;
  const quoi=simCarteQuoi();
  const fort=quoi==="z" ? x=>Math.abs((x.valeur||0)-SIM.saisie.cible)
                        : x=>Math.abs((x.valeur||0)-SIM.saisie.cibleDiff);
  return v.sort((a,b)=>fort(b)-fort(a)).slice(0,SIM_CARTE_MAX_ETIQ);
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
  /* LE LOT ENTRE DANS LE NOM quand il y en a plusieurs : deux morceaux d'une
     même ligne portent souvent le même net dans le fichier, et deux
     enregistrements se seraient écrasés l'un l'autre sans qu'on le voie. */
  const lot=(SIM.lots.length>1)?"-lot"+(SIM.lotActif+1):"";
  const carte=(SIM.res&&SIM.res.carte)||
              (SIM_ED&&SIM_ED.carte?SIM_ED.carte():"")||"carte";
  const propre=s=>String(s).replace(/[^\w.-]+/g,"_").replace(/^_+|_+$/g,"");
  return (propre(carte)||"carte")+(net?"-"+propre(net):"")+lot+ext;
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

/* LE REFUS DE CASCADER, ÉCRIT À LA PLACE DE LA COURBE.

   POURQUOI IL PREND LA PLACE ET NE S'AJOUTE PAS À CÔTÉ. La version précédente
   rendait les paramètres S dans TOUS les cas, assortis d'une note disant
   qu'ils ne voulaient rien dire sur un net ramifié. C'est le pire des deux :
   la courbe s'affiche, elle a l'air d'un résultat, on l'exporte en .s2p — et
   le .s2p, lui, ne porte aucune note. Un chiffre faux qui voyage est pire
   qu'un chiffre absent.

   ON DIT AUSSI OÙ, quand le serveur le sait. « La liaison se ramifie » est un
   verdict ; « elle se ramifie en trois points, dont un en 12,40 ; 8,15 » est
   quelque chose qu'on peut aller regarder. */
function simCascadeRefusee(res){
  const d=(res.topologie&&res.topologie.derivations)||[];
  let h='<div class="simRefus"><p class="simRefusTitre">'+
        "Paramètres S non calculés</p>"+
        '<p class="simRefusQuoi">'+simEsc(res.cascade_refusee)+"</p>";
  if(d.length){
    const n=Math.min(d.length,4);
    h+='<p class="simRefusOu">'+(d.length>1?"Points de dérivation":
       "Point de dérivation")+" : ";
    const l=[];
    for(let i=0;i<n;i++)
      l.push(simNb(d[i].x,3)+" ; "+simNb(d[i].y,3)+
             " ("+d[i].branches+" branches)");
    h+=simEsc(l.join(" · "))+(d.length>n?" … et "+(d.length-n)+" autre"+
       (d.length-n>1?"s":""):"")+"</p>";
  }
  /* CE QUI RESTE VALABLE, dit tout de suite. Sans cette phrase le refus se
     lit comme « le calcul a échoué », alors que l'essentiel de la fiche —
     l'impédance de chaque tronçon, la carte de chaleur, les sections — est
     intact et ne dépend d'aucun ordre. */
  h+='<p class="simRefusReste">Les impédances par tronçon, la carte de '+
     "chaleur et les sections résolues ci-dessus ne dépendent pas de l'ordre "+
     "des tronçons : elles restent valables.</p></div>";
  return h;
}

function simCourbe(res){
  /* LE REFUS PASSE AVANT TOUT, y compris avant le test sur `freqs` : le
     serveur rend l'axe qu'il aurait balayé même quand il ne cascade pas, et
     sans ce garde-fou la fiche tracerait une courbe plate à 0 dB — la valeur
     que `simTerme` rend faute de matrice. Une courbe plate à 0 dB se lit
     comme « aucune perte, aucune réflexion » : exactement le contraire de
     « je n'ai pas calculé ». */
  if(res&&res.cascade_refusee)return simCascadeRefusee(res);
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
       : (SIM.lots.length>1
            ? "Ce lot est entièrement dans la tolérance"
            : "Toute la sélection est dans la tolérance"))+
     " <span>"+simNb(L.z0_min,1)+" – "+simNb(L.z0_max,1)+
     " Ω, moyenne pondérée "+simNb(L.z0_moyen,1)+" Ω à "+
     simFreq(res.f_centre)+"</span></p>";

  /* L'impédance de RÉFÉRENCE des ports est ici, et pas seulement dans le champ
     de saisie : c'est sur elle que la courbe S est normalisée, et une courbe
     de réflexion ne se lit pas sans savoir contre quoi elle réfléchit. */
  /* `cumuls_valides` est absent des résultats d'avant le format
     « cao-sim-em-resultat-5 » : `!==false` les tient pour valables, ce qu'ils
     étaient — la question ne se posait pas encore. */
  const cumuls=L.cumuls_valides!==false;
  h+='<div class="simMeta"><span>'+simEsc(SIM.portee||res.net||"—")+"</span>"+
     "<span>"+L.troncons+" tronçon"+(L.troncons>1?"s":"")+"</span>"+
     "<span>"+simNb(L.longueur,2)+" mm</span>"+
     /* LE RETARD ET LES PERTES SONT DES CUMULS LE LONG D'UN PARCOURS. Sur
        une sélection ramifiée ils additionnent des branches parallèles : la
        somme des longueurs d'un T n'est le trajet de personne. Le chiffre
        reste affiché — il répond à « combien de cuivre » — mais barré, et
        avec la raison au survol. Le taire ferait croire à un calcul
        incomplet ; le laisser nu le ferait lire comme un retard de liaison. */
     "<span"+(cumuls?"":' class="simDouteux" title="'+
       simEsc("Somme sur toute la sélection : sur une liaison qui n'est pas "+
              "une chaîne, ce n'est le trajet d'aucun front.")+'"')+">"+
     simRetard(L.retard)+"</span>"+
     "<span"+(cumuls?"":' class="simDouteux" title="'+
       simEsc("Somme sur toute la sélection, et non le long d'un parcours.")+
       '"')+">"+simNb(L.pertes_db,2)+" dB</span>"+
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
  h+=simFicheSchemaAdaptation(res);
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

/* Fiche d'adaptation et composants schéma pour la ligne sous Impédance */
function simFicheSchemaAdaptation(res){
  if(!(SIM_ED&&typeof SIM_ED.schemaInfosNet==="function"))return "";
  const netNom=(res&&res.net)||SIM.portee||"";
  const info=SIM_ED.schemaInfosNet(netNom);
  if(!info||(!info.composants.length&&info.rTerm==null))return "";
  
  let h='<div class="simCardSchema">';
  h+='<span class="simBadgeSchema">⚡ Schéma & Adaptation</span>';
  if(info.composants.length){
    h+='<span class="simSchemaComps">Composants : <b>'+info.composants.map(simEsc).join(" → ")+'</b></span>';
  }
  const z0=(res&&res.ligne&&res.ligne.z0_moyen)||50;
  if(info.rTerm!=null){
    const rDrv=20;
    const rs=rDrv+info.rTerm;
    const gamma=(rs-z0)/(rs+z0);
    const gAbs=Math.abs(gamma);
    const evalTxt=gAbs<=0.1?"Excellente adaptation série (|Γ| ≤ 0,10)"
                 :(gAbs<=0.25?"Bonne adaptation série (|Γ| ≤ 0,25)":"Adaptation modérée");
    h+='<div class="simSchemaRterm">'+
       'Terminaison série détectée : <b>'+simEsc(info.rTermRef||"R")+' = '+simNb(info.rTerm,1)+' Ω</b>'+
       (info.rTermComp&&info.rTermComp.mpn?' ('+simEsc(info.rTermComp.mpn)+')':'')+'. '+
       'Source équivalente R<sub>s</sub> ≈ '+simNb(rs,1)+' Ω (driver ~20 Ω + R<sub>série</sub>), '+
       'Z₀ ligne ≈ '+simNb(z0,1)+' Ω → réflexion source <b>Γ ≈ '+(gamma>=0?"+":"")+simNb(gamma,2)+'</b> ('+evalTxt+').'+
       '</div>';
  }else if(res&&res.ligne&&res.ligne.retard>300e-12){
    h+='<div class="simSchemaRterm simSchemaConseil">'+
       'Ligne longue (retard '+simRetard(res.ligne.retard)+') sans résistance série détectée : '+
       'une résistance d\'amortissement série (~'+Math.max(10,Math.round(z0-20))+' Ω) près du driver amortirait les réflexions.'+
       '</div>';
  }
  h+='</div>';
  return h;
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
     /* PLUS DE COLONNE « RETOUR » ICI. Elle répondait à une autre question que
        celle de ce tableau — qui chiffre ce que la discontinuité COÛTE À LA
        LIAISON —, et une colonne en marge ne remplace pas une fiche. Voir
        l'onglet « Current Return Path ». */
     "<th>Détail</th><th>L</th><th>C</th><th>Phase</th></tr>";

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
                 cotes:c,
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
  /* TROIS PROVENANCES, ET LA PHRASE SUIT. « La page n'envoie pas encore ces
     cotes » était vrai tant qu'il n'y avait que « page » et « repli ». Il ne
     l'est plus : la visionneuse envoie désormais la pastille que le lecteur
     IPC-2581 a fabriquée faute de padstack — « perçage + 0,3 mm » — en la
     déclarant devinée. Le doute est le même, sa cause ne l'est pas, et ce
     qu'il y a à faire non plus : un repli se corrige en enrichissant la page,
     une pastille devinée se corrige en regardant pourquoi le fichier ne
     déclare pas son padstack. */
  const supposees=vias.filter(t=>t.cotes_supposees);
  if(supposees.length){
    const c=supposees[0].cotes||{};
    const repli=[], devine=[];
    for(const [cle,nom,val] of [["percage","perçage",c.percage_mm],
                                ["pastille","pastille",c.pastille_mm]]){
      const s=simCoteSource(c,cle);
      if(s==="page")continue;
      (s==="supposee"?devine:repli).push(nom+" "+simNb(val,2)+" mm");
    }
    h+='<p class="simNote">· '+
       (supposees.length>1?supposees.length+" vias sont chiffrés":
                           "Le via est chiffré")+" avec ";
    const bouts=[];
    if(repli.length)
      bouts.push("des valeurs par défaut du solveur ("+
                 simEsc(repli.join(", "))+"), que la page n'envoie pas encore");
    if(devine.length)
      bouts.push("des cotes que le lecteur du fichier a devinées ("+
                 simEsc(devine.join(", "))+") faute de padstack déclaré — "+
                 "ce ne sont pas des cotes du fichier");
    h+=bouts.join(" et ")+
       ". La hauteur, elle, est lue dans l'empilage ("+
       simNb((supposees[0].cotes||{}).hauteur_mm,3)+
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

  /* LES NOTES DU CHEMIN DE RETOUR ONT DÉMÉNAGÉ. Elles répondaient ici à une
     question que cette fiche ne pose pas — « par où revient le courant » — au
     bas d'un tableau qui chiffre ce que la discontinuité coûte à la liaison.
     Elles sont désormais le SUJET de l'onglet « Current Return Path », où
     elles se lisent avec les vias de masse qu'elles commentent. */
  /* CE QUI RESTE ICI : les notes qui parlent du VIA — le moignon et
     l'antipad. Ce sont deux cotes, elles chargent la liaison, elles entrent
     dans la cascade, et ce sont elles qui expliquent la capacité et la phase
     du tableau ci-dessus. Les emporter aurait laissé un chiffre sans sa
     cause. Voir `simViaNotes`. */
  h+=simViaNotes(vias);

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
  if(cav.impedance_fc_ohm!=null){
    const score=(t.modelise||{}).score_reconstruction_pct;
    return '<span class="z0ko">cavité</span><br><small>'+
           simNb(cav.impedance_fc_ohm,2)+" Ω"+
           (score!=null?" · "+simNb(score,1)+"%":"")+
           "</small>";
  }
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
  const score=(t.modelise||{}).score_reconstruction_pct;
  return '<span class="z0ok">'+r.retenus+" via"+(r.retenus>1?"s":"")+
         "</span><br><small>"+simNb(proche,2)+" mm"+
         (score!=null?" · "+simNb(score,1)+"%":"")+
         "</small>";
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
  /* LE CHEVELU APPARTIENT DÉSORMAIS À « CURRENT RETURN PATH ». Il vivait sous
     l'onglet « Impédance », où il donnait à voir un défaut dont la fiche ne
     parlait pas. */
  if(typeof SIM==="undefined"||!SIM.ouvert||SIM.analyse!=="retour")return [];
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
  let idx=0;
  for(const t of trs){
    const ret=t.retour||{}, mod=t.modelise||{}, cotes=t.cotes||{};
    /* SANS POSITION, PAS DE TRAIT. Une page qui n'envoie pas le via ne peut
       pas se voir dessiner son chevelu, et l'inventer au raccord serait poser
       un point là où l'outil n'en connaît aucun. */
    if(ret.x==null||ret.y==null)continue;
    out.push({
      idx:idx++,
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
  const nus=vias.filter(t=>((t.retour||{}).source==="self"||((t.modelise||{}).inductance_source==="self"))
                           &&!(t.retour||{}).retenus
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

  /* LE BILAN DE SANTÉ DU SIGNAL ET LA DÉCOMPOSITION HARMONIQUE */
  const avecBilan=vias.filter(t=>t.bilan_sante||(t.cavite||{}).bilan_sante);
  if(avecBilan.length){
    const b=avecBilan[0].bilan_sante||(avecBilan[0].cavite||{}).bilan_sante;
    const estCavite=!!((avecBilan[0].cavite||{}).plan_haut);
    h+='<div class="simBilanBloc" style="margin-top:8px; padding:8px 12px; background:rgba(255,255,255,0.03); border-left:3px solid #49c07a; border-radius:3px;">';
    h+='<p class="simNote" style="margin:0 0 6px 0;">· <b>Bilan de santé du signal : '+simNb(b.score_reconstruction_pct,1)+
       '% de fidélité de reconstruction</b> — '+simEsc(b.verdict)+
       '<br><small>Signal f₀ = '+simFreq(b.f_fondamentale||b.f0_hz)+
       ', front t<sub>r</sub> = '+simRetard(b.temps_montee||b.temps_montee_s)+
       ' (f<sub>knee</sub> = '+simFreq(b.f_knee||b.f_knee_hz)+')</small></p>';

    if(b.harmoniques&&b.harmoniques.length){
      h+='<details class="simBilanDetails" style="margin-top:6px; cursor:pointer;">'+
         '<summary style="font-size:11px; color:#88a; outline:none; user-select:none; font-weight:bold;">'+
         '▶ Afficher la décomposition des '+b.harmoniques.length+' premières harmoniques du signal'+
         '</summary>'+
         '<table class="simTab simTabD" style="margin-top:6px; font-size:10px; width:100%;">'+
         '<tr><th>Harmonique</th><th>Fréquence</th><th>Atténuation</th><th>Déphasage</th>'+
         (estCavite
           ? '<th>Pont Découpl.</th><th>Cavité Plans</th><th>Z traversée</th>'
           : '<th>Chemin Retour</th>')+
         '</tr>';

      for(const row of b.harmoniques){
        h+='<tr>'+
           '<td>H'+row.harmonique+'</td>'+
           '<td>'+simFreq(row.freq_hz)+'</td>'+
           '<td>'+(row.attenuation_db!=null?simNb(row.attenuation_db,3)+' dB':'—')+'</td>'+
           '<td>'+(row.phase_deg!=null?simNb(row.phase_deg,1)+'°':'—')+
           (row.dispersion_deg?' <small class="simFaible">('+simNb(row.dispersion_deg,1)+'°)</small>':'')+'</td>';
        if(estCavite){
          h+='<td>'+(row.part_pont_pct!=null?simNb(row.part_pont_pct,1)+' %':'—')+'</td>'+
             '<td>'+(row.part_cavite_pct!=null?simNb(row.part_cavite_pct,1)+' %':'—')+'</td>'+
             '<td>'+(row.z_traversee_ohm!=null?simNb(row.z_traversee_ohm,2)+' Ω':'—')+'</td>';
        } else {
          h+='<td><span class="z0ok">100 % vias masse</span></td>';
        }
        h+='</tr>';
      }

      if(b.sondes_hf&&b.sondes_hf.length&&estCavite){
        h+='<tr style="background:rgba(255,255,255,0.02); font-weight:bold;"><td colspan="7">Sondes Haute Fréquence (Front de montée)</td></tr>';
        for(const shf of b.sondes_hf){
          h+='<tr class="simFaible">'+
             '<td>'+simEsc(shf.nom)+'</td>'+
             '<td>'+simFreq(shf.freq_hz)+'</td>'+
             '<td>'+(shf.attenuation_db!=null?simNb(shf.attenuation_db,3)+' dB':'—')+'</td>'+
             '<td>'+(shf.phase_deg!=null?simNb(shf.phase_deg,1)+'°':'—')+'</td>'+
             '<td>'+(shf.part_pont_pct!=null?simNb(shf.part_pont_pct,1)+' %':'—')+'</td>'+
             '<td>'+(shf.part_cavite_pct!=null?simNb(shf.part_cavite_pct,1)+' %':'—')+'</td>'+
             '<td>'+(shf.z_traversee_ohm!=null?simNb(shf.z_traversee_ohm,2)+' Ω':'—')+'</td>'+
             '</tr>';
        }
      }

      h+='</table></details>';
    }
    h+='</div>';
  }
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

  return h;
}
/* ==========================================================================
   LES NOTES QUI PARLENT DU VIA LUI-MÊME, ET NON DE SON RETOUR
   --------------------------------------------------------------------------
   POURQUOI DEUX LISTES. `simRetourNotes` les portait toutes, et elles
   seraient parties ensemble quand le chemin de retour a pris son propre
   onglet. Or elles ne parlent pas de la même chose : le MOIGNON est la part
   du perçage que le signal n'emprunte pas, et l'ANTIPAD la fenêtre découpée
   dans les plans. Ce sont deux cotes du via ; elles chargent la liaison,
   elles entrent dans la cascade, et ce sont elles qui expliquent la capacité
   et la phase du tableau des discontinuités.

   Les emporter sous « Current Return Path » aurait laissé la fiche
   d'impédance montrer une capacité sans dire d'où elle vient.
   ========================================================================== */
function simViaNotes(vias){
  if(!vias.length)return "";
  let h="";
  const moignons=vias.filter(t=>((t.moignons||{}).depart)
                                ||((t.moignons||{}).arrivee));
  const flousM=vias.filter(t=>(t.moignons||{}).connu===false);
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
/* UN CHAMP DE SAISIE DU PANNEAU, ET LE SEUL ENDROIT QUI EN FABRIQUE.

   `simChamp` PORTE SA CLASSE, et c'est ce qui manquait. La feuille de style
   nommait les sept champs de l'onglet Impédance un par un ; tous ceux ajoutés
   depuis — Crosstalk, Chute DC — sortaient de cette même fonction sans être
   dans aucune liste, donc sans style : police sans empattement au lieu de la
   monospace du panneau, et largeur élastique, donc un champ qui mange toute la
   rangée. Le panneau PI avait ainsi l'air d'un autre outil que le panneau SI.
   Une classe posée ici vaut pour tous, y compris ceux de demain. */
function simChamp(id,titre,large){
  return '<input id="'+id+'" type="text" inputmode="decimal" spellcheck="false"'+
         ' class="simChamp'+(large?" large":"")+'" title="'+simEsc(titre)+'">';
}
/* UN CHAMP DE TEXTE, et non de nombre : pas de `inputmode="decimal"`, qui
   ferait sortir un pave numerique sur une tablette pour ecrire « U7 VDD ». Il
   porte la meme classe que les autres — c'est le meme panneau — plus `simTxt`,
   qui lui donne sa largeur : un nom est plus long qu'un nombre. `sous` est
   l'infobulle de ce qui NE se renomme pas : le net et la couche. */
function simChampTexte(id,valeur,titre,sous){
  return '<input id="'+id+'" type="text" spellcheck="false"'+
         ' class="simChamp simTxt" value="'+simEsc(valeur||"")+'"'+
         ' title="'+simEsc(titre+(sous?" — "+sous:""))+'">';
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
/* `liste` par défaut est celle des fréquences : les trois champs qui
   l'utilisaient n'ont pas changé d'une ligne. Le temps de montée et
   l'amplitude passent la leur, et la mécanique — convertir, jamais
   réinterpréter — est la MÊME pour les trois, écrite une fois. */
function simChampUnite(id,quoi,liste){
  let h='<select class="simU simUSel" id="'+id+'" title="Unité de '+quoi+
        ". En changer CONVERTIT ce qui est écrit, cela ne le réinterprète "+
        'pas.">';
  for(const u of (liste||SIM_UNITES))
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
/* ==========================================================================
   CURRENT RETURN PATH — LE CHEMIN DE RETOUR DU COURANT, POUR LUI-MÊME
   --------------------------------------------------------------------------
   POURQUOI IL SORT DE L'IMPÉDANCE. Le chemin de retour vivait en pièces
   détachées sous l'onglet « Impédance » : une colonne du tableau des
   discontinuités, quelques notes en bas de fiche, et un chevelu sur la carte.
   Trois endroits, aucun qui réponde à la question qu'on se pose vraiment —
   « par où revient le courant de ce via, et est-ce que ça se ferme ». On lisait
   une impédance et on trouvait, en marge, de quoi s'inquiéter d'autre chose.

   ET CE N'EST PAS LA MÊME QUESTION. L'impédance caractéristique est une
   propriété de la SECTION DROITE : la largeur, la hauteur au plan, le
   stratifié. Le chemin de retour est une propriété de la LIAISON VERTICALE :
   quels vias de masse entourent le via de signal, à quelle distance, et si le
   plan de référence est le même des deux côtés. Une piste parfaitement à 50 Ω
   peut avoir un retour catastrophique, et c'est précisément le cas qu'on ne
   voyait pas.

   LE CALCUL EST LE MÊME, et c'est voulu. Le serveur rend les deux dans une
   seule réponse ; changer d'onglet ne relance rien. Ce qui change est ce qu'on
   montre — et le fait que la carte peigne le chevelu ici, et la carte de
   chaleur des Z0 là-bas.
   ========================================================================== */
function simCorpsRetour(){
  return ''+
  /* LA MASSE DE RÉFÉRENCE EN TÊTE, et plus qu'ailleurs : ici elle ne déplace
     pas un résultat de quelques ohms, elle décide QUELS VIAS SONT DES VIAS DE
     RETOUR. Un net oublié dans cette liste, et le chevelu est vide. */
  '<div class="pnl-bar simRefBar" id="simRefBar"></div>'+
  '<div class="pnl-bar simBarF">'+
    '<span class="pnl-lbl">Fréquence</span>'+
    simChamp("simFc","Fréquence de travail / fondamentale : elle ne change pas l’inductance "+
                     "de boucle, mais elle décide de ce qui compte comme "+
                     "long, et positionne les harmoniques basses")+
    simChampUnite("simFUnite","la fréquence de travail")+
    '<span class="simGr"><span class="pnl-lbl">t<sub>r</sub></span>'+
    simChamp("simTr","Temps de montée du signal (10-90%). Détermine le spectre HF (f_knee = 0,35 / tr) "+
                     "et l’excitation de la cavité inter-plans. Vide, il est déduit de la fréquence.")+
    simChampUnite("simTrUnite","le temps de montée",SIM_UNITES_TR)+'</span>'+
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
  '<div class="pnl-bar simFAvertBar simBarFixe"><span id="simFAvert"></span></div>'+
  '<div class="pnl-bar simBarFixe">'+
    '<button class="tb mini on" id="simGo" title="Calculer la sélection">▶ Calculer</button>'+
    '<button class="tb mini" id="simJson" title="Le problème lui-même : il se donne au solveur en ligne de commande">.json</button>'+
    '<label class="simSuivre" title="Recalculer à chaque changement de sélection"><input type="checkbox" id="simAuto"> suivre</label>'+
  '</div>';
}

function simBrancherRetour(){
  simSaisieEcrire();
  simRefEcrire();
  const pose=(id,quoi,fn)=>{const e=simEl(id);if(e)e[quoi]=fn;};
  pose("simGo","onclick",simGo);
  pose("simJson","onclick",simExportJson);
  const auto=simEl("simAuto");
  if(auto){auto.checked=SIM.suivre;
           auto.onchange=function(){SIM.suivre=this.checked;};}
  /* La fréquence change le calcul : le résultat affiché ne lui correspond
     plus, et le dire vaut mieux que de laisser croire. */
  pose("simFc","oninput",function(){
    simSaisie();
    simAjusterBandePourFc();
    simFAvertEcrire();
    if(SIM.res&&!SIM.occupe){
      SIM.res=null; SIM.objets=[];
      SIM.err="La fréquence a changé : relancez le calcul.";
      simRendre(); simRepeindre();
    }
  });
  pose("simFUnite","onchange",function(){simUniteChanger(this.value,"fc");});
  pose("simTr","oninput",function(){
    simSaisie();
    if(SIM.res&&!SIM.occupe){
      SIM.res=null; SIM.objets=[];
      SIM.err="Le temps de montée a changé : relancez le calcul.";
      simRendre(); simRepeindre();
    }
  });
  pose("simTrUnite","onchange",function(){simUniteChanger(this.value,"tr");});
  /* Les champs de bande S : début, fin, points */
  for(const id of ["simF1","simF2","simN"])
    pose(id,"oninput",function(){
      simSaisie();
      simFAvertEcrire();
      if(SIM.res&&!SIM.occupe){
        SIM.res=null; SIM.objets=[];
        SIM.err="La bande S a changé : relancez le calcul.";
        simRendre(); simRepeindre();
      }
    });
  pose("simFUniteBande1","onchange",
       function(){simUniteChanger(this.value,"bande1");});
  pose("simFUniteBande2","onchange",
       function(){simUniteChanger(this.value,"bande2");});
}

function simRendreRetour(){
  if(SIM.occupe)
    return simProgres("Les vias de la sélection, et les vias de masse qui "+
      "referment leur boucle.");
  if(SIM.err)return '<p class="simErr">'+simEsc(SIM.err)+"</p>";
  if(SIM.res)return simFicheRetour();
  return '<p class="simEtat">Sélectionnez une piste, puis calculez.<br>'+
    "<small>Cette analyse ne montre QUE le chemin de retour : les vias de la "+
    "sélection, les vias de masse qui referment leur boucle, et l’inductance "+
    "qui en résulte. Pour l’impédance de la piste elle-même, voir l’onglet "+
    "<b>Impédance</b>.</small></p>";
}

/* La fiche : un via par ligne, et ce que son retour vaut. */
function simFicheRetour(){
  const res=SIM.res, d=res.discontinuites||{};
  const seuls=d.vias_hors_chaine||[];
  const vias=(d.transitions||[]).concat(seuls);

  /* AUCUN VIA EST UNE RÉPONSE, pas une page vide. Une liaison qui reste sur
     une seule couche n’a pas de courant de retour vertical à chiffrer — et le
     dire vaut mieux que de laisser croire à un calcul qui n’a pas abouti. */
  if(!vias.length){
    let h='<p class="simVerdict dedans">Aucun via dans la sélection'+
          ' <span>'+simEsc(SIM.portee||res.net||"—")+"</span></p>";
    h+='<p class="simNote">· La sélection ne change pas de couche : le '+
       "courant revient par le plan de référence, sous la piste, et il n’y a "+
       "pas de liaison verticale à chiffrer. Le chemin de retour ne devient "+
       "une question qu’au moment où le signal traverse.</p>";
    return h;
  }

  /* LE VERDICT COMPTE CE QUI SE FERME, et rien d’autre. « 4 vias » ne dit pas
     si le courant revient ; « 3 sur 4 se referment » le dit. « boucle » dans
     la source veut dire qu’un retour la referme — « self », « self+cavite »
     veulent dire que non, et le chiffre est alors un PLANCHER. */
  const ferme=t=>String(((t.modelise||{}).inductance_source)||"")
                 .indexOf("boucle")>=0;
  const ouverts=vias.filter(t=>!ferme(t));
  const graves=vias.filter(t=>(t.retour||{}).reference_change
                              &&!(t.retour||{}).raccorde);
  let h='<p class="simVerdict '+
    (ouverts.length||graves.length?"dehors":"dedans")+'">'+
    (ouverts.length
      ? ouverts.length+" via"+(ouverts.length>1?"s":"")+" sur "+vias.length+
        " sans retour identifié"
      : (vias.length>1
          ? "Les "+vias.length+" vias ont un retour identifié"
          : "Le via a un retour identifié"))+
    ' <span>'+simEsc(SIM.portee||res.net||"—")+" · "+
    simFreq(res.f_centre)+
    (res.temps_montee?" · t<sub>r</sub> "+simRetard(res.temps_montee):"")+"</span></p>";

  /* LA MASSE RETENUE, écrite ici et pas seulement dans la barre de commande :
     c’est elle qui décide quels perçages comptent comme retour, et une fiche
     détachée de son panneau ne se lit pas sans elle. */
  h+='<div class="simMeta"><span>'+vias.length+" via"+
     (vias.length>1?"s":"")+"</span>"+
     "<span>masse : "+simEsc((res.reference_nets||[]).join(", ")||
                             "non déclarée")+"</span>"+
     (seuls.length?"<span>"+seuls.length+" hors parcours</span>":"")+
     "<span>"+simNb(res.duree,2)+" s</span></div>";

  h+='<table class="simTab simTabRetour"><tr><th>Via</th>'+
     "<th>Couches</th><th>Retour</th><th>L boucle</th>"+
     "<th>Vias de masse</th></tr>";

  let rang=0;
  for(const t of vias){
    const r=t.retour||{}, m=t.modelise||{};
    const hors=t.cascade===false;
    const vIdx=rang;
    rang++;
    const estActif=(typeof SIM!=="undefined"&&SIM.viaActif===vIdx);
    /* LES VIAS DE MASSE, UN PAR UN : distance, part du courant, et lesquels
       sont écartés. C’est la seule colonne qui réponde à « que faire » —
       rapprocher, ou en ajouter un. */
    const gndVias=r.vias||[];
    const gndItems=gndVias.map(function(v, idx){
      const isGndSel=(estActif&&typeof SIM!=="undefined"&&SIM.gndViaActif===idx);
      const cls=v.retenu?(v.part>=0.20?"z0ok":"simFaible"):"z0ko";
      return '<div class="simGndItem '+cls+(isGndSel?' simGndActif':'')+'" data-via-idx="'+vIdx+'" data-gnd-idx="'+idx+'" title="Cliquez pour isoler ce via de retour sur le PCB">'+
             '#'+(idx+1)+' · '+simNb(v.distance_mm,2)+" mm"+
             (v.retenu?" · <b>"+Math.round((v.part||0)*100)+" %</b>":" · <i>écarté</i>")+
             (v.raison?' <small title="'+simEsc(v.raison)+'">('+simEsc(v.raison)+')</small>':'')+
             '</div>';
    }).join("");
    const gndCol=gndVias.length>3
      ? '<div class="simGndScroll" title="Faites défiler pour voir tous les vias">'+
        gndItems+'</div>'
      : (gndItems||'<span class="simFaible">aucun</span>');

    const posTxt=r.x==null?"—":(simNb(r.x,2)+" ; "+simNb(r.y,2));

    h+='<tr data-via-idx="'+vIdx+'" class="'+(estActif?'simLigneActive':'')+'" style="cursor:pointer;'+
       (estActif?'background:rgba(73,192,122,0.18);box-shadow:inset 3px 0 0 #49c07a;':'')+'" title="Cliquez pour mettre ce via en surbrillance sur le PCB">'+
       '<td><b>#'+rang+'</b>'+(hors?'<br><small class="simFaible">hors</small>':'')+
       '<br><small class="simFaible" style="font-size:9.5px;color:var(--txt-dim);white-space:nowrap;" title="Position X ; Y">'+posTxt+'</small></td>'+
       '<td><div style="font-size:11px;font-weight:600;line-height:1.2;">'+
       simEsc(t.nom_depart||"?")+'<br><span style="color:var(--txt-dim);font-size:9.5px;font-weight:400;">→ '+simEsc(t.nom_arrivee||"?")+'</span></div></td>'+
       '<td>'+simRetourCellule(t)+'</td>'+
       '<td style="text-align:right;">'+(m.inductance_nH!=null
                ? '<b>'+simNb(m.inductance_nH,3)+' nH</b><br><small class="simFaible">'+
                  simEsc(m.inductance_source||"")+'</small>'
                : "—")+'</td>'+
       '<td>'+gndCol+'</td></tr>';
  }
  h+="</table>";

  /* LES MÊMES NOTES QU’AVANT, mais à leur place : ici elles sont le sujet, là
     elles étaient en marge d’une fiche qui parlait d’autre chose. */
  h+=simRetourNotes(vias);
  return h;
}

/* Sélectionner un via au clic dans le tableau pour le mettre en surbrillance
   sur le PCB avec son chevelu de retour. */
function simSelectionnerVia(idx){
  if(typeof SIM==="undefined")return;
  if(SIM.viaActif===idx&&SIM.gndViaActif==null){
    SIM.viaActif=null;
    SIM.gndViaActif=null;
  }else{
    SIM.viaActif=idx;
    SIM.gndViaActif=null;
    const liens=simCheveluRes();
    const g=liens.find(item=>item.idx===idx);
    if(g&&SIM_ED&&typeof SIM_ED.centrerSurVia==="function"){
      SIM_ED.centrerSurVia(g.x, g.y);
    }
  }
  simRendre();
  if(SIM_ED&&typeof SIM_ED.redessiner==="function")SIM_ED.redessiner();
}

/* Sélectionner un via de masse précis pour le surligner seul avec son rayon */
function simSelectionnerGndVia(vIdx, gIdx){
  if(typeof SIM==="undefined")return;
  if(SIM.viaActif===vIdx&&SIM.gndViaActif===gIdx){
    SIM.gndViaActif=null;
  }else{
    SIM.viaActif=vIdx;
    SIM.gndViaActif=gIdx;
    const liens=simCheveluRes();
    const g=liens.find(item=>item.idx===vIdx);
    if(g&&g.vias&&g.vias[gIdx]&&SIM_ED&&typeof SIM_ED.centrerSurVia==="function"){
      const gv=g.vias[gIdx];
      SIM_ED.centrerSurVia(gv.x, gv.y);
    }
  }
  simRendre();
  if(SIM_ED&&typeof SIM_ED.redessiner==="function")SIM_ED.redessiner();
}

function simBrancherRetourFiche(){
  const box=simEl("simSortie");
  if(!box)return;
  box.querySelectorAll("[data-via-idx]").forEach(function(tr){
    tr.onclick=function(e){
      if(e.target&&e.target.closest&&e.target.closest(".simGndItem"))return;
      if(e.target&&(e.target.tagName==="SUMMARY"||e.target.tagName==="A"||e.target.tagName==="DETAILS"))return;
      const idx=+tr.getAttribute("data-via-idx");
      simSelectionnerVia(idx);
    };
  });
  box.querySelectorAll(".simGndItem").forEach(function(item){
    item.onclick=function(e){
      e.stopPropagation();
      const vIdx=+item.getAttribute("data-via-idx");
      const gIdx=+item.getAttribute("data-gnd-idx");
      simSelectionnerGndVia(vIdx, gIdx);
    };
  });
}

/* ==========================================================================
   RAPPORT DE SANTÉ DE LA LIAISON (SYNTHÈSE GLOBALE SI / VIAS / RETOURS)
   --------------------------------------------------------------------------
   Une analyse dédiée dans la famille SI qui prend la liaison (ou le bus)
   et dresse un bilan hiérarchisé par sévérité :
     · Conforme (OK / Vert)
     · Vigilance (Avertissement / Jaune)
     · Critique (Erreur / Rouge)
   autour de 4 piliers physiques :
     1. Impédance & Continuité (Z₀, dispersion, réflexion ROS/S₁₁, coplanaire)
     2. Vias & Discontinuités (moignons quart d'onde, antipads, capacité)
     3. Chemin de retour & Plans (vias de masse, cavité, traversée, fentes)
     4. Couplage & Environnement (diaphonie, pistes proches, règle des 3W)
   Chaque anomalie comporte le chiffre mesuré et le geste correctif recommandé.
   ========================================================================== */
function simCorpsSante(){
  return ''+
  '<div class="pnl-bar simRefBar" id="simRefBar"></div>'+
  '<div class="pnl-bar simBarF">'+
    '<span class="pnl-lbl">Fréquence</span>'+
    simChamp("simFc","Fréquence de travail / fondamentale : positionne la bande utile et les harmoniques")+
    simChampUnite("simFUnite","la fréquence de travail")+
    '<span class="simGr"><span class="pnl-lbl">t<sub>r</sub></span>'+
    simChamp("simTr","Temps de montée du signal (10-90%). Détermine le spectre HF (f_knee = 0,35 / tr)")+
    simChampUnite("simTrUnite","le temps de montée",SIM_UNITES_TR)+'</span>'+
  '</div>'+
  '<div class="pnl-bar simBarF">'+
    '<span class="pnl-lbl">Bande S</span>'+
    simChamp("simF1","Début de bande")+
    simChampUnite("simFUniteBande1","le début de la bande S")+
    '<span class="simSep">→</span>'+
    simChamp("simF2","Fin de bande")+
    simChampUnite("simFUniteBande2","la fin de la bande S")+
    '<span class="simGr"><span class="pnl-lbl">Points</span>'+
    simChamp("simN","Nombre de points de la courbe S")+"</span>"+
  '</div>'+
  '<div class="pnl-bar simFAvertBar simBarFixe"><span id="simFAvert"></span></div>'+
  '<div class="pnl-bar simBarFixe">'+
    '<button class="tb mini on" id="simSanteGo" title="Calculer la sélection et dresser le bilan de santé">▶ Évaluer santé</button>'+
    '<button class="tb mini" id="simSanteExport" title="Exporter le rapport de santé de la liaison">Rapport ↗</button>'+
    '<label class="simSuivre" title="Recalculer à chaque changement de sélection"><input type="checkbox" id="simAuto"> suivre</label>'+
  '</div>';
}

function simBrancherSante(){
  simSaisieEcrire();
  simRefEcrire();
  const pose=(id,quoi,fn)=>{const e=simEl(id);if(e)e[quoi]=fn;};
  pose("simSanteGo","onclick",simGo);
  pose("simSanteExport","onclick",simSanteExporter);
  const auto=simEl("simAuto");
  if(auto){auto.checked=SIM.suivre;
           auto.onchange=function(){SIM.suivre=this.checked;};}
  pose("simFc","oninput",function(){
    simSaisie(); simAjusterBandePourFc(); simFAvertEcrire();
    if(SIM.res&&!SIM.occupe){
      SIM.res=null; SIM.objets=[];
      SIM.err="La fréquence a changé : relancez le calcul.";
      simRendre(); simRepeindre();
    }
  });
  pose("simFUnite","onchange",function(){simUniteChanger(this.value,"fc");});
  pose("simTr","oninput",function(){
    simSaisie();
    if(SIM.res&&!SIM.occupe){
      SIM.res=null; SIM.objets=[];
      SIM.err="Le temps de montée a changé : relancez le calcul.";
      simRendre(); simRepeindre();
    }
  });
  pose("simTrUnite","onchange",function(){simUniteChanger(this.value,"tr");});
  for(const id of ["simF1","simF2","simN"])
    pose(id,"oninput",function(){
      simSaisie(); simFAvertEcrire();
      if(SIM.res&&!SIM.occupe){
        SIM.res=null; SIM.objets=[];
        SIM.err="La bande S a changé : relancez le calcul.";
        simRendre(); simRepeindre();
      }
    });
  pose("simFUniteBande1","onchange",function(){simUniteChanger(this.value,"bande1");});
  pose("simFUniteBande2","onchange",function(){simUniteChanger(this.value,"bande2");});
}

function simRendreSante(){
  if(SIM.occupe)
    return simProgres("Synthèse globale des diagnostics de la liaison : impédance, vias, retour et couplage.");
  if(SIM.err)return '<p class="simErr">'+simEsc(SIM.err)+"</p>";
  if(SIM.res)return simFicheSante();
  return '<p class="simEtat">Sélectionnez une piste, puis calculez.<br>'+
    "<small>Cette analyse synthétise l'ensemble des diagnostics de Signal Integrity (SI) : "+
    "dispersion d'impédance Z₀, moignons et résonances de vias, continuité du chemin de retour vertical, "+
    "et risques de couplage / diaphonie, avec pour chaque défaut son chiffrage et le geste correctif.</small></p>";
}

function simDiagnostiquerSante(res, doc, opt){
  if(!res || !res.segments || !res.segments.length){
    return {
      score_global: 0,
      verdict: "Aucun résultat",
      statut: "neutre",
      compte: { ok: 0, alerte: 0, critique: 0, total: 0 },
      categories: []
    };
  }

  const optAjustee = opt || {};
  const zCible = Number(optAjustee.zCible || (SIM.saisie && SIM.saisie.cible) || 50);
  const fMax = Number(optAjustee.fMax || (res.points_s && res.points_s.length ? res.points_s[res.points_s.length-1].freq_hz : 3e9));
  const tr = Number(optAjustee.tr || (SIM.saisie && SIM.saisie.tr) || (0.35 / fMax));
  const fKnee = 0.35 / tr;

  const items = [];

  // --- PILIER 1 : IMPÉDANCE & CONTINUITÉ ---
  const segsValides = res.segments.filter(s => s.z0 > 0);
  if(segsValides.length){
    let zMin = Infinity, zMax = -Infinity, pireEcartPct = 0, pireZ = zCible;
    for(const s of segsValides){
      if(s.z0 < zMin) zMin = s.z0;
      if(s.z0 > zMax) zMax = s.z0;
      const ecartPct = Math.abs(s.z0 - zCible) / zCible * 100;
      if(ecartPct > pireEcartPct){
        pireEcartPct = ecartPct;
        pireZ = s.z0;
      }
    }

    if(pireEcartPct <= 10){
      items.push({
        id: "z0_cible",
        categorie: "impedance",
        nomCategorie: "Impédance & Continuité",
        titre: "Impédance caractéristique conforme",
        severite: "ok",
        chiffre: "Z₀ entre " + simNb(zMin, 1) + " et " + simNb(zMax, 1) + " Ω (cible " + simNb(zCible, 0) + " Ω, pire écart " + simNb(pireEcartPct, 1) + " %)",
        impact: "Pertes par réflexion négligeables (< 1 % de puissance réfléchie). Adaptation de ligne garantie.",
        recommandation: "Conserver la largeur actuelle des pistes."
      });
    } else if(pireEcartPct <= 20){
      const action = pireZ > zCible ? "Élargir la piste ou rapprocher le plan de masse." : "Affiner la piste ou augmenter la hauteur de diélectrique.";
      items.push({
        id: "z0_cible",
        categorie: "impedance",
        nomCategorie: "Impédance & Continuité",
        titre: "Tolérance d'impédance sous vigilance",
        severite: "alerte",
        chiffre: "Pire Z₀ = " + simNb(pireZ, 1) + " Ω (" + (pireZ > zCible ? "+" : "") + simNb(pireZ - zCible, 1) + " Ω, " + simNb(pireEcartPct, 1) + " % de déviation)",
        impact: "Désadaptation modérée causant 5 à 10 % de réflexion et de légers dépassements (overshoot).",
        recommandation: action
      });
    } else {
      const action = pireZ > zCible ? "Élargir significativement la largeur de la piste (W) ou réduire l'épaisseur du substrat (h)." : "Réduire la largeur de piste ou utiliser un diélectrique de permittivité plus basse.";
      items.push({
        id: "z0_cible",
        categorie: "impedance",
        nomCategorie: "Impédance & Continuité",
        titre: "Rupture critique d'impédance caractéristique",
        severite: "critique",
        chiffre: "Pire Z₀ = " + simNb(pireZ, 1) + " Ω (écart majeur de " + simNb(pireEcartPct, 1) + " % par rapport à " + simNb(zCible, 0) + " Ω)",
        impact: "Réflexions sévères (> 15 %), sonneries destructrices sur les fronts montants et dégradation de l'ouverture de l'œil.",
        recommandation: action
      });
    }
  }

  // Réflexions S11 et ROS (TOS)
  if(res.points_s && res.points_s.length){
    let pireS11Db = -Infinity, freqPire = 0;
    for(const pt of res.points_s){
      if(pt.s11_db != null && pt.s11_db > pireS11Db){
        pireS11Db = pt.s11_db;
        freqPire = pt.freq_hz;
      }
    }
    const gamma = Math.pow(10, pireS11Db / 20);
    const ros = gamma < 0.999 ? (1 + gamma) / (1 - gamma) : 99.9;

    if(ros <= 1.35){
      items.push({
        id: "s11_ros",
        categorie: "impedance",
        nomCategorie: "Impédance & Continuité",
        titre: "Taux d'onde stationnaire (ROS / S₁₁) excellent",
        severite: "ok",
        chiffre: "ROS max = " + simNb(ros, 2) + " (S₁₁ = " + simNb(pireS11Db, 1) + " dB à " + simFreq(freqPire) + ")",
        impact: "Excellente transmission d'énergie tout au long de la bande passante utile.",
        recommandation: "Aucune action d'adaptation nécessaire."
      });
    } else if(ros <= 1.8){
      items.push({
        id: "s11_ros",
        categorie: "impedance",
        nomCategorie: "Impédance & Continuité",
        titre: "Réflexion modérée (ROS " + simNb(ros, 2) + ")",
        severite: "alerte",
        chiffre: "ROS max = " + simNb(ros, 2) + " (S₁₁ = " + simNb(pireS11Db, 1) + " dB à " + simFreq(freqPire) + ")",
        impact: "Environ 5 à 10 % de l'amplitude du signal est renvoyée vers la source sous forme d'écho.",
        recommandation: "Ajouter une résistance d'amortissement série (22-33 Ω) côté émetteur ou ajuster les discontinuités."
      });
    } else {
      items.push({
        id: "s11_ros",
        categorie: "impedance",
        nomCategorie: "Impédance & Continuité",
        titre: "Réflexion excessive / fort désaccord d'onde",
        severite: "critique",
        chiffre: "ROS = " + simNb(ros, 2) + " (S₁₁ = " + simNb(pireS11Db, 1) + " dB à " + simFreq(freqPire) + ")",
        impact: "Pertes importantes en transmission, déformation prononcée des fronts et risque d'interférences inter-symboles.",
        recommandation: "Revoir impérativement la chaîne de transmission, éliminer les ruptures géométriques et adapter les impédances terminales."
      });
    }
  }

  // Coplanaire & dissymétrie
  const coplanaire = res.segments.filter(s => s.coplanaire && s.ecart > 0);
  if(coplanaire.length){
    const dissym = coplanaire.filter(s => s.ecart_g != null && s.ecart_d != null && Math.abs(s.ecart_g - s.ecart_d) > 0.05);
    if(dissym.length){
      const maxDiff = Math.max(...dissym.map(s => Math.abs(s.ecart_g - s.ecart_d)));
      items.push({
        id: "coplanaire_dissym",
        categorie: "impedance",
        nomCategorie: "Impédance & Continuité",
        titre: "Masse coplanaire dissymétrique",
        severite: "alerte",
        chiffre: "Dissymétrie de " + simNb(maxDiff, 3) + " mm entre le côté gauche et le côté droit",
        impact: "Décentre la nappe de courant haute fréquence et génère un léger mode commun parasite.",
        recommandation: "Régulariser l'ouverture du plan de masse coplanaire de manière équidistante des deux côtés."
      });
    } else {
      items.push({
        id: "coplanaire_ok",
        categorie: "impedance",
        nomCategorie: "Impédance & Continuité",
        titre: "Masse coplanaire équilibrée",
        severite: "ok",
        chiffre: "Écart de masse symétrique à " + simNb(coplanaire[0].ecart, 3) + " mm",
        impact: "Le blindage latéral est homogène et abaisse efficacement l'impédance de mode impair.",
        recommandation: "Maintenir la distance actuelle de dégagement du plan."
      });
    }
  }

  // --- PILIER 2 : VIAS & DISCONTINUITÉS ---
  const disc = res.discontinuites || {};
  const transitions = (disc.transitions || []).concat(disc.vias_hors_chaine || []);

  if(transitions.length === 0){
    items.push({
      id: "vias_aucun",
      categorie: "vias",
      nomCategorie: "Vias & Discontinuités",
      titre: "Liaison planaire pure (aucun via)",
      severite: "ok",
      chiffre: "0 transition de couche",
      impact: "L'absence de via évite toute discontinuité capacitive parasite et conserve le plan de référence d'un bout à l'autre.",
      recommandation: "Tracé idéal pour signaux haute vitesse ou RF."
    });
  } else {
    // Moignons (stubs)
    let moignonPire = null, moignonCritique = false;
    for(const t of transitions){
      const mo = t.moignons || {};
      const bouts = [mo.depart, mo.arrivee].filter(Boolean);
      for(const b of bouts){
        if(b.longueur_mm > 0.05){
          if(!moignonPire || b.longueur_mm > moignonPire.longueur_mm){
            moignonPire = b;
          }
          if(b.resonance_hz && b.resonance_hz <= Math.max(fMax, fKnee)){
            moignonCritique = true;
          }
        }
      }
    }

    if(!moignonPire){
      items.push({
        id: "moignon_ok",
        categorie: "vias",
        nomCategorie: "Vias & Discontinuités",
        titre: "Vias sans moignon parasite (stub)",
        severite: "ok",
        chiffre: transitions.length + " via(s) sans moignon débordant",
        impact: "Aucune résonance quart d'onde en circuit ouvert.",
        recommandation: "Parcours optimisé entre les couches de routage."
      });
    } else if(moignonCritique){
      items.push({
        id: "moignon_crit",
        categorie: "vias",
        nomCategorie: "Vias & Discontinuités",
        titre: "Moignon de via résonant dans la bande utile",
        severite: "critique",
        chiffre: "Longueur " + simNb(moignonPire.longueur_mm, 3) + " mm (" + simNb(moignonPire.capacite_fF, 0) + " fF) · Résonance à " + simNb(moignonPire.resonance_hz / 1e9, 1) + " GHz ≤ f_bande",
        impact: "À sa résonance quart d'onde, le moignon agit comme un court-circuit à la masse et anéantit la transmission du signal.",
        recommandation: "Pratiquer un contre-perçage (back-drilling), ou utiliser des vias enterrés/borgnes, ou router sur la couche externe la plus profonde."
      });
    } else {
      items.push({
        id: "moignon_alerte",
        categorie: "vias",
        nomCategorie: "Vias & Discontinuités",
        titre: "Présence d'un moignon de via non résonant",
        severite: "alerte",
        chiffre: "Longueur " + simNb(moignonPire.longueur_mm, 3) + " mm (" + simNb(moignonPire.capacite_fF, 0) + " fF) · Résonance à " + simNb(moignonPire.resonance_hz / 1e9, 1) + " GHz",
        impact: "Charge capacitive supplémentaire qui arrondit les fronts montants sans bloquer le signal.",
        recommandation: "Vérifier la marge de gigue (jitter). Envisager un contre-perçage si le débit augmente."
      });
    }

    // Antipads
    const fourchette = transitions.filter(t => (t.cotes||{}).antipad_max && (t.cotes||{}).antipad_max > (t.cotes||{}).antipad_mm);
    if(fourchette.length){
      const c = fourchette[0].cotes;
      items.push({
        id: "antipad_fourchette",
        categorie: "vias",
        nomCategorie: "Vias & Discontinuités",
        titre: "Fenêtres d'isolement (antipad) disparates",
        severite: "alerte",
        chiffre: "Antipad de " + simNb(c.antipad_mm, 2) + " à " + simNb(c.antipad_max, 2) + " mm",
        impact: "Variation de l'effet capacitif entre les différents plans traversés.",
        recommandation: "Harmoniser le diamètre de dégagement antipad sur toutes les couches internes."
      });
    }
  }

  // --- PILIER 3 : CHEMIN DE RETOUR & PLANS ---
  if(transitions.length > 0){
    const sansRetour = transitions.filter(t => {
      const r = t.retour || {};
      return (!r.retenus || r.retenus === 0) && (r.vias || []).length === 0;
    });

    if(sansRetour.length > 0){
      items.push({
        id: "retour_aucun",
        categorie: "retour",
        nomCategorie: "Chemin de retour & Plans",
        titre: "Boucle de retour ouverte (aucun via de masse)",
        severite: "critique",
        chiffre: sansRetour.length + " transition(s) de via sans aucun via de masse à portée",
        impact: "Le courant de retour haute fréquence doit trouver un chemin lointain : inductance de boucle décuplée, fort rayonnement CEM et rebonds de masse massifs.",
        recommandation: "Placer impérativement 1 ou 2 vias de masse à moins de 0,5 mm de chaque via de signal pour fermer la boucle."
      });
    } else {
      const eloignes = transitions.filter(t => {
        const r = t.retour || {};
        const vProche = (r.vias || [])[0];
        return vProche && vProche.distance_mm > 0.8;
      });

      if(eloignes.length > 0){
        const dMax = Math.max(...eloignes.map(t => (t.retour.vias[0]||{}).distance_mm || 0));
        items.push({
          id: "retour_eloigne",
          categorie: "retour",
          nomCategorie: "Chemin de retour & Plans",
          titre: "Vias de masse de retour trop distants",
          severite: "alerte",
          chiffre: "Via de retour le plus proche situé à " + simNb(dMax, 2) + " mm (> 0,8 mm)",
          impact: "Augmentation mesurable de l'inductance de boucle (L_boucle > 1,2 nH).",
          recommandation: "Rapprocher les vias de masse à moins de 0,5 mm du via de signal."
        });
      } else {
        items.push({
          id: "retour_ok",
          categorie: "retour",
          nomCategorie: "Chemin de retour & Plans",
          titre: "Chemin de retour vertical bien refermé",
          severite: "ok",
          chiffre: "Vias de masse présents à proximité immédiate (< 0,8 mm)",
          impact: "Inductance de boucle minimale, confinant le champ EM entre le via de signal et son blindage.",
          recommandation: "Conserver cette disposition de couture."
        });
      }
    }

    // Traversée de plans (cavité GND -> PWR)
    const avecCavite = transitions.filter(t => (t.cavite || {}).plan_haut);
    if(avecCavite.length > 0){
      const cav = avecCavite[0].cavite;
      if(!cav.pont_decouplage && !cav.c_pont){
        items.push({
          id: "cavite_non_decouplee",
          categorie: "retour",
          nomCategorie: "Chemin de retour & Plans",
          titre: "Changement de plan de référence sans condensateur de pontage",
          severite: "critique",
          chiffre: "Traversée entre plans (" + simEsc(cav.plan_haut) + " → " + simEsc(cav.plan_bas) + ") · Z traversée = " + simNb(cav.impedance_fc_ohm, 1) + " Ω",
          impact: "Rupture de continuité de référence : le courant de retour traverse la cavité diélectrique, injecte du bruit dans les plans d'alimentation et rayonne fortement.",
          recommandation: "Router le signal sans changer de plan de référence, ou placer un condensateur de découplage de liaison (10 nF - 100 nF) à moins de 1 mm de la transition."
        });
      } else {
        items.push({
          id: "cavite_decouplee",
          categorie: "retour",
          nomCategorie: "Chemin de retour & Plans",
          titre: "Traversée de cavité avec pont de découplage",
          severite: "ok",
          chiffre: "Pont de découplage présent à proximité · Z traversée = " + simNb(cav.impedance_fc_ohm, 2) + " Ω",
          impact: "Le condensateur assure la continuité du courant de retour alternatif entre les deux plans.",
          recommandation: "Maintenir les pistes de raccordement du condensateur très courtes."
        });
      }
    }
  }

  // Couture de masse coplanaire
  if(coplanaire.length){
    const nonCousu = coplanaire.filter(s => s.couture && s.couture.espacement_max && s.couture.seuil_lambda10 && s.couture.espacement_max > s.couture.seuil_lambda10);
    if(nonCousu.length){
      const pireEsp = Math.max(...nonCousu.map(s => s.couture.espacement_max));
      const seuil = nonCousu[0].couture.seuil_lambda10;
      items.push({
        id: "couture_lache",
        categorie: "retour",
        nomCategorie: "Chemin de retour & Plans",
        titre: "Pas de couture de masse coplanaire excessif",
        severite: "alerte",
        chiffre: "Espacement max entre vias de masse = " + simNb(pireEsp, 2) + " mm > λ/10 (" + simNb(seuil, 2) + " mm)",
        impact: "Au-delà de λ/10, le cuivre latéral cesse de se comporter comme un plan de masse idéal et peut entrer en résonance.",
        recommandation: "Ajouter des vias de couture le long de la piste avec un pas régulier inférieur à " + simNb(seuil, 1) + " mm."
      });
    }
  }

  // --- PILIER 4 : COUPLAGE & ENVIRONNEMENT ---
  const voisinage = (doc && doc.voisinage) || (SIM.doc && SIM.doc.voisinage) || [];
  if(voisinage.length > 0){
    let dMin = Infinity, pireVoisin = "";
    for(const v of voisinage){
      if(v.distance != null && v.distance < dMin){
        dMin = v.distance;
        pireVoisin = v.net || "voisine";
      }
    }
    const largMoy = segsValides.length ? (segsValides.reduce((a, b) => a + (b.w || 0.2), 0) / segsValides.length) : 0.2;
    const regle3W = 2 * largMoy;

    if(dMin < regle3W){
      items.push({
        id: "couplage_proche",
        categorie: "couplage",
        nomCategorie: "Couplage & Environnement",
        titre: "Piste voisine sous la règle des 3W",
        severite: "alerte",
        chiffre: "Écart de " + simNb(dMin, 3) + " mm avec « " + simEsc(pireVoisin) + " » (< 2W = " + simNb(regle3W, 3) + " mm)",
        impact: "Diaphonie capacitive et inductive non négligeable. Risque de faux déclenchement sur les signaux sensibles.",
        recommandation: "Écarter la piste d'au moins 3 fois sa largeur ou insérer une piste de garde reliée à la masse par des vias cousus."
      });
    } else {
      items.push({
        id: "couplage_3w_ok",
        categorie: "couplage",
        nomCategorie: "Couplage & Environnement",
        titre: "Isolement latéral conforme (Règle 3W respectée)",
        severite: "ok",
        chiffre: "Écart minimal de " + simNb(dMin, 3) + " mm ≥ 2W (" + simNb(regle3W, 3) + " mm)",
        impact: "Couplage croisé inférieur à -30 dB, garantissant un fonctionnement silencieux.",
        recommandation: "Disposition spatiale optimale."
      });
    }
  } else {
    items.push({
      id: "couplage_isole",
      categorie: "couplage",
      nomCategorie: "Couplage & Environnement",
      titre: "Aucun agresseur proche détecté",
      severite: "ok",
      chiffre: "Tracé isolé à plus de 3 mm de tout autre signal",
      impact: "Immunité totale contre la diaphonie sur la couche analysée.",
      recommandation: "Aucune précaution de blindage supplémentaire requise."
    });
  }

  // Calcul du score global
  let totalPoints = 0;
  let nbOk = 0, nbAlerte = 0, nbCritique = 0;

  for(const it of items){
    if(it.severite === "ok"){ totalPoints += 100; nbOk++; }
    else if(it.severite === "alerte"){ totalPoints += 55; nbAlerte++; }
    else if(it.severite === "critique"){ totalPoints += 10; nbCritique++; }
  }

  const scoreGlobal = items.length ? Math.round(totalPoints / items.length) : 100;
  let verdict = "Liaison saine", statut = "ok";
  if(nbCritique > 0 || scoreGlobal < 60){
    verdict = "Liaison non conforme — actions critiques requises";
    statut = "critique";
  } else if(nbAlerte > 0 || scoreGlobal < 85){
    verdict = "Liaison sous vigilance — améliorations conseillées";
    statut = "alerte";
  }

  const catKeys = ["impedance", "vias", "retour", "couplage"];
  const catNames = {
    impedance: "Impédance & Continuité",
    vias: "Vias & Discontinuités",
    retour: "Chemin de retour & Plans",
    couplage: "Couplage & Environnement"
  };

  const categories = catKeys.map(k => {
    const list = items.filter(it => it.categorie === k);
    return {
      cle: k,
      nom: catNames[k],
      items: list,
      nbOk: list.filter(i => i.severite === "ok").length,
      nbAlerte: list.filter(i => i.severite === "alerte").length,
      nbCritique: list.filter(i => i.severite === "critique").length
    };
  }).filter(c => c.items.length > 0);

  return {
    score_global: scoreGlobal,
    verdict: verdict,
    statut: statut,
    compte: { ok: nbOk, alerte: nbAlerte, critique: nbCritique, total: items.length },
    items: items,
    categories: categories
  };
}

function simFicheSante(){
  const res = SIM.res;
  if(!res) return "";
  const diag = simDiagnostiquerSante(res, SIM.doc);
  const filtre = SIM.santeFiltre || "tous";

  let h = '<div class="simSanteWrap">';

  // 1. En-tête avec score de santé et verdict
  const colScore = diag.statut === "ok" ? "#49c07a" : (diag.statut === "alerte" ? "#f59e0b" : "#ef4444");
  const bgScore = diag.statut === "ok" ? "rgba(73,192,122,0.12)" : (diag.statut === "alerte" ? "rgba(245,158,11,0.12)" : "rgba(239,68,68,0.12)");

  h += '<div class="simSanteHeader" style="background:'+bgScore+'; border-left:4px solid '+colScore+'; padding:10px 14px; border-radius:4px; margin-bottom:12px;">';
  h +=   '<div style="display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:8px;">';
  h +=     '<div>';
  h +=       '<div style="font-size:10.5px; text-transform:uppercase; letter-spacing:0.5px; color:'+colScore+'; font-weight:700;">Score global de santé</div>';
  h +=       '<div style="font-size:22px; font-weight:800; color:'+colScore+'; line-height:1.2;">'+diag.score_global+' <span style="font-size:13px; font-weight:500;">/ 100</span></div>';
  h +=       '<div style="font-size:11.5px; font-weight:600; color:var(--txt,#e6e8ec); margin-top:2px;">'+simEsc(diag.verdict)+'</div>';
  h +=     '</div>';
  h +=     '<div class="simSanteBadges" style="display:flex; gap:6px; flex-wrap:wrap;">';
  h +=       '<span class="simBadge simBadgeOk">✓ '+diag.compte.ok+' Conforme(s)</span>';
  if(diag.compte.alerte > 0)
    h +=     '<span class="simBadge simBadgeAlerte">⚠ '+diag.compte.alerte+' Vigilance</span>';
  if(diag.compte.critique > 0)
    h +=     '<span class="simBadge simBadgeCritique">✕ '+diag.compte.critique+' Critique(s)</span>';
  h +=     '</div>';
  h +=   '</div>';
  h += '</div>';

  // 2. Barre de filtres
  h += '<div class="simSanteFiltres pnl-bar">';
  h +=   '<button class="tb mini '+(filtre==="tous"?"on":"")+'" data-sante-filtre="tous">Tous ('+diag.compte.total+')</button>';
  h +=   '<button class="tb mini '+(filtre==="anomalies"?"on":"")+'" data-sante-filtre="anomalies">Anomalies ('+(diag.compte.alerte+diag.compte.critique)+')</button>';
  for(const cat of diag.categories){
    const act = filtre === cat.cle ? "on" : "";
    h += '<button class="tb mini '+act+'" data-sante-filtre="'+cat.cle+'">'+simEsc(cat.nom)+' ('+cat.items.length+')</button>';
  }
  h += '</div>';

  // 3. Cartes par catégorie
  for(const cat of diag.categories){
    if(filtre !== "tous" && filtre !== "anomalies" && filtre !== cat.cle) continue;
    let list = cat.items;
    if(filtre === "anomalies"){
      list = list.filter(i => i.severite !== "ok");
      if(!list.length) continue;
    }

    h += '<div class="simSanteCat">';
    h +=   '<div class="simSanteCatTitre">📁 ' + simEsc(cat.nom) + '</div>';

    for(const it of list){
      const borderCol = it.severite === "ok" ? "#49c07a" : (it.severite === "alerte" ? "#f59e0b" : "#ef4444");
      const icon = it.severite === "ok" ? "✓" : (it.severite === "alerte" ? "⚠" : "✕");
      const badgeTxt = it.severite === "ok" ? "CONFORME" : (it.severite === "alerte" ? "VIGILANCE" : "CRITIQUE");

      h += '<div class="simSanteCard ' + it.severite + '">';
      h +=   '<div class="simSanteCardHead">';
      h +=     '<b style="color:'+borderCol+';">'+icon+' '+simEsc(it.titre)+'</b>';
      h +=     '<span class="simSanteTag ' + it.severite + '">'+badgeTxt+'</span>';
      h +=   '</div>';

      h +=   '<div class="simSanteLigne">· <b>Mesure :</b> '+simEsc(it.chiffre)+'</div>';
      h +=   '<div class="simSanteLigne">· <b>Impact :</b> '+simEsc(it.impact)+'</div>';

      if(it.severite !== "ok"){
        h += '<div class="simSanteReco">';
        h +=   '💡 <b>Geste correctif :</b> '+simEsc(it.recommandation);
        h += '</div>';
      }
      h += '</div>';
    }
    h += '</div>';
  }

  h += '</div>';
  return h;
}

function simSanteApres(){
  const box = simEl("simSortie");
  if(!box) return;
  box.querySelectorAll("[data-sante-filtre]").forEach(function(b){
    b.onclick = function(){
      SIM.santeFiltre = this.getAttribute("data-sante-filtre");
      simRendre();
    };
  });
}

function simSanteExporter(){
  if(!SIM.res){
    SIM.err = "Rien à exporter : calculez d'abord.";
    simRendre();
    return;
  }
  const diag = simDiagnostiquerSante(SIM.res, SIM.doc);
  const date = new Date().toISOString().replace("T"," ").slice(0,19);
  let md = "# Rapport de santé de la liaison — Synthèse SI\n\n";
  md += "**Date :** " + date + "\n";
  md += "**Net / Portée :** " + (SIM.portee || (SIM.res && SIM.res.net) || "Sélection") + "\n";
  md += "**Score global :** " + diag.score_global + " / 100 — " + diag.verdict + "\n";
  md += "**Bilan :** " + diag.compte.ok + " conforme(s), " + diag.compte.alerte + " sous vigilance, " + diag.compte.critique + " critique(s)\n\n";

  for(const cat of diag.categories){
    md += "## " + cat.nom + "\n\n";
    for(const it of cat.items){
      const badge = it.severite === "ok" ? "[CONFORME]" : (it.severite === "alerte" ? "[VIGILANCE]" : "[CRITIQUE]");
      md += "### " + badge + " " + it.titre + "\n";
      md += "- **Mesure :** " + it.chiffre + "\n";
      md += "- **Impact :** " + it.impact + "\n";
      if(it.severite !== "ok"){
        md += "- **Geste correctif :** " + it.recommandation + "\n";
      }
      md += "\n";
    }
  }

  const nomFichier = simNomFichier("-rapport-sante.md");
  simTelecharger(md, nomFichier, "text/markdown;charset=utf-8");
}


/* ==========================================================================
   IMPÉDANCE DIFFÉRENTIELLE — UNE SECTION À N CONDUCTEURS, LUE EN OHMS
   --------------------------------------------------------------------------
   CE QUE C'EST. La section à deux conducteurs résolue par
   `ligne_mom.solve_multiline` : la matrice de capacité de Maxwell [C], puis
   [L] = μ₀ε₀[C₀]⁻¹. Les modes pair et impair en sortent, donc Z différentielle
   et Z commune. La question est « ma paire fait-elle 100 Ω, sur toute sa
   longueur ? », et elle se lit en ohms.

   CE N'EST PAS LA QUESTION DU COUPLAGE, et les deux ne se lisent pas dans les
   mêmes colonnes. « Qu'est-ce que ce bus inflige à sa voisine » se lit sous
   « Crosstalk », en pour-cent, en volts et avec une abscisse le long du
   parcours. Ici, un couplage n'est pas un défaut : c'est le mode impair d'une
   paire, celui que le récepteur différentiel rejette.

   OÙ EST L'AUTRE MOITIÉ DE LA PAIRE. Elle n'est pas toujours dans la
   sélection. Les deux outils envoient donc, à côté de la géométrie
   sélectionnée, le `voisinage` : les tronçons de piste qui passent à portée.
   Le serveur les apparie (`simulation_em._scenes_paralleles`) : même couche,
   parallèles à quinze degrés près, un recouvrement réel, et un écart de
   cuivre à cuivre qui reste un écart. Un outil qui n'envoie pas de voisinage
   voit l'onglet le dire, plutôt que d'afficher une page vide qui ressemble à
   « aucun problème ».

   CE QUE CES DEUX ONGLETS NE RELANCENT PAS : le calcul. C'est la même réponse
   du serveur que celle de l'onglet « Impédance » — changer d'onglet ne coûte
   rien, et les trois fiches parlent nécessairement du même cuivre.

   LE TEMPS DE MONTÉE N'EST PAS UNE FRÉQUENCE. Il ne change ni [C] ni [L] :
   il décide de la SATURATION du bruit arrière et de l'amplitude du bruit
   avant. C'est pour cela qu'il a son champ à lui, sous l'onglet qui s'en sert,
   et qu'il n'apparaît pas sous « Impédance » où il ne voudrait rien dire.
   ========================================================================== */

function simCouplage(){
  return (SIM.res&&SIM.res.couplage)||null;
}
/* Les longements chiffrés, les plus bruyants d'abord — c'est le serveur qui
   les a triés, et il ne faut pas deux ordres pour une même liste. */
function simCouplagePaires(){
  const c=simCouplage();
  return (c&&c.paires)||[];
}
/* Ce qui manque, et pourquoi. Trois silences différents, trois phrases : le
   serveur est d'une version qui ne sait pas coupler, l'outil n'envoie pas de
   voisinage, ou il n'y a réellement rien qui longe. Les confondre ferait
   chercher un défaut de dessin là où il y a un défaut de branchement. */
function simCouplageVide(quoi){
  const c=simCouplage();
  if(!c)
    return '<p class="simEtat">Ce serveur ne rend pas de couplage.<br>'+
      "<small>La réponse ne porte pas de section « couplage » : le solveur "+
      "est d'une version antérieure à celle qui résout N conducteurs. "+
      "Relancez <code>python serveur.py</code> depuis ce dépôt.</small></p>";
  if(!c.voisinage)
    return '<p class="simEtat">Aucun cuivre voisin n’a été envoyé.<br>'+
      "<small>Le couplage se calcule entre la sélection et ce qui la longe ; "+
      "l’agresseur n’est jamais dans la sélection. Cet outil n’a rien joint "+
      "au problème — ou il n’y a aucune autre piste à portée sur la "+
      "couche.</small></p>";
  return '<p class="simVerdict dedans">Rien ne longe la sélection'+
    ' <span>'+simEsc(SIM.portee||"—")+"</span></p>"+
    '<p class="simNote">· '+c.voisinage+" tronçon(s) voisin(s) ont été "+
    "examinés, et aucun ne longe la sélection assez pour "+quoi+" : ni sur la "+
    "même couche, ni parallèle, ni assez près. C’est une réponse, pas une "+
    "absence de calcul.</p>";
}

/* Les deux nets d'un longement, dans l'ordre victime → agresseur. */
function simCoupleNoms(f){
  return simEsc(f.net||"?")+" ↔ "+simEsc(f.net_voisin||"?");
}
/* La colonne « géométrie » : ce sur quoi le chiffre a été obtenu. Sans elle,
   deux lignes du tableau qui diffèrent de vingt ohms n'ont pas d'explication
   visible — et l'explication est toujours là. */
function simCoupleGeom(f){
  return simNb(f.longueur,2)+" mm<br><small>"+
    simNb(f.largeur,3)+" / "+simNb(f.largeur_voisine,3)+" mm à "+
    simNb(f.ecart,3)+" mm"+
    (Math.abs(f.ecart-f.ecart_min)>0.005
      ? " <i>(mini "+simNb(f.ecart_min,3)+")</i>":"")+
    "</small>";
}
/* LA SECTION RÉSOLUE, ÉCRITE EN CLAIR — et c'est la moitié de la réponse.

   « 6,6 % de NEXT » ne se comprend pas sans savoir SUR QUOI il a été obtenu :
   combien de conducteurs étaient dans la matrice, à quelles positions, si une
   piste de garde y était, et à quelle distance le plan coplanaire bordait le
   groupe. C'est exactement la même raison qui a fait écrire `simSection()`
   sous l'onglet Impédance — un chiffre sans ses entrées n'est pas vérifiable.

   ON MONTRE LA COUPE, à l'échelle des positions : la sélection au centre, les
   voisines de part et d'autre, les gardes marquées, et les deux écarts au
   plan. Une piste et ses deux voisines forment UNE section à trois
   conducteurs, et il faut le voir pour comprendre pourquoi le couplage n'est
   pas celui de deux paires calculées séparément. */
/* Une garde DÉDUITE n'est pas une piste que quelqu'un a routée : la première
   sort de deux écarts mesurés, la seconde est dans le fichier. Les confondre
   ferait chercher sur la carte un cuivre qui n'y est pas sous cette forme. */
function simCoupleSection(sec){
  if(!sec)return "";
  let h='<p class="simSection"><b>SECTION RÉSOLUE</b> ';
  if(sec.raison)
    return h+'<i class="simFaible">'+simEsc(sec.raison)+"</i></p>";
  const bouts=[];
  if(sec.ecart_g>0)bouts.push("plan à "+simNb(sec.ecart_g,3)+" mm");
  else bouts.push('<i class="simFaible">pas de plan à portée</i>');
  /* RANGES COMME ON LES VOIT, de gauche a droite. Le serveur les rend dans
     l'ordre ou la page les a poses -- la selection d'abord, puis les voisines
     par distance croissante -- et cet ordre-la ne se lit pas comme une coupe.
     C'est le signe de x qui fait la gauche et la droite. */
  const ordre=(sec.conducteurs||[]).slice().sort((a,b)=>a.x-b.x);
  const dedans=ordre.map(function(d){
    return (d.selection?"<b>":"")+simEsc(d.net)+(d.selection?"</b>":"")+
           /* TENUE OU FLOTTANTE : les deux se dessinent pareil dans une coupe,
              et elles ne font PAS la même chose. Une garde cousue blinde ; une
              garde qui ne l’est pas transfère, et peut faire pire que pas de
              garde du tout. La marque est en rouge parce que c’est le seul
              cuivre de cette fiche qui RASSURE à tort quand on le regarde. */
           (d.garde
              ? (d.flottant
                   ? ' <i class="z0ko" title="Ce cuivre de masse n’est pas assez'+
                     ' cousu au plan : le plus grand trou entre deux vias y'+
                     ' atteint '+simNb(d.couture||0,1)+' mm. Il n’est donc pas'+
                     ' tenu à zéro volt — il est posé FLOTTANT, et il ne blinde'+
                     ' pas : il transfère.">garde NON COUSUE'+
                     (d.couture?' ('+simNb(d.couture,1)+' mm)':"")+'</i>'
                   : (d.interposee
                      ? ' <i class="z0ok" title="Du cuivre de masse s’interpose'+
                        ' entre la sélection et sa voisine : la page a mesuré'+
                        ' les deux dégagements, et le modèle pose la bande qui'+
                        ' reste entre les deux à zéro volt.">garde déduite</i>'
                      : ' <i class="z0ok">garde</i>'))
              : "")+
           " <i>"+simNb(d.largeur,3)+" mm @ "+
           (d.x>0?"+":"")+simNb(d.x,3)+"</i>";
  });
  if(sec.ecart_d>0)bouts.push("plan à "+simNb(sec.ecart_d,3)+" mm");
  else bouts.push('<i class="simFaible">pas de plan à portée</i>');
  h+=[bouts[0]].concat(dedans,[bouts[1]]).join(" │ ");
  h+=" · "+simTopoNom({topo:sec.topo})+", h = "+simNb(sec.h,3)+" mm, ε<sub>r</sub> "+
     simNb(sec.er,2);
  h+="</p>";
  /* CE QUI N'A PAS PU ENTRER, et pourquoi. Une voisine qui disparaît sans un
     mot se lit comme un couplage nul. */
  for(const e of (sec.ecartes||[]))
    h+='<p class="simNote">· <b>'+simEsc(e.net)+"</b> n’entre pas dans la "+
       "section : "+simEsc(e.raison)+". Son couplage n’est pas chiffré.</p>";
  /* LE PLAN ABSENT EST UNE HYPOTHÈSE, pas un fait : la page sonde jusqu'à
     trois millimètres, et au-delà elle ne rend rien. Sans plan, le couplage
     rendu est un MAJORANT. */
  if(!(sec.ecart_g>0)&&!(sec.ecart_d>0))
    h+='<p class="simNote">· Aucun plan de masse coplanaire n’a été trouvé à '+
       "portée du groupe : le couplage est calculé sans lui, donc "+
       "<b>majoré</b>. Du cuivre de masse à côté le réduit — et une piste de "+
       "garde <i>entre</i> les deux le divise.</p>";
  /* LA GARDE DÉDUITE MÉRITE SA PHRASE. Elle n'est pas dans le fichier : elle
     sort de deux écarts mesurés, et elle change le résultat d'un facteur. Qui
     lit « 0,01 % » doit savoir que c'est le cuivre de masse entre les deux
     qui le vaut, et à quelle condition. */
  const deduites=(sec.conducteurs||[]).filter(d=>d.interposee);
  if(deduites.length)
    h+='<p class="simNote">· Du cuivre de <b>masse s’interpose</b> entre la '+
       "sélection et "+(deduites.length>1?"ses voisines":"sa voisine")+" : "+
       deduites.map(d=>simNb(d.largeur,3)+" mm").join(" et ")+
       " de large, posé"+(deduites.length>1?"s":"")+" dans la section à zéro "+
       "volt. C’est lui qui fait l’essentiel du blindage, et le couplage "+
       "ci-dessous en tient compte. <b>Il le suppose tenu à zéro volt sur "+
       "toute la longueur</b> — ce qu’un plan cousu de vias fait, et ce qu’une "+
       "garde sans vias ne fait pas : sans couture, elle peut résonner et le "+
       "couplage revient.</p>";
  return h;
}
/* Toutes les sections d'un résultat, celles qui portent une ligne du tableau
   d'abord. Une seule sélection ne donne qu'une section dans le cas ordinaire —
   il y en a plusieurs quand la sélection court sur plusieurs couches. */
function simCoupleSections(){
  const c=simCouplage();
  return ((c&&c.sections)||[]).map(simCoupleSection).join("");
}

/* Le pied de fiche, commun aux deux onglets : ce que le calcul suppose. Il
   vient du serveur et non de la page — c'est lui qui sait ce qu'il a résolu. */
function simCoupleHypotheses(){
  const c=simCouplage();
  let h="";
  for(const t of ((c&&c.hypotheses)||[]))
    h+='<p class="simNote">· '+simEsc(t)+"</p>";
  return h;
}

/* ==========================================================================
   CE QUI LONGE PAR-DESSUS — LE COUPLAGE ENTRE COUCHES
   --------------------------------------------------------------------------
   LE SILENCE QU'ON REMPLACE. La section droite du solveur n'a qu'UN plan de
   conducteurs : elle pose tous ses rubans à la même hauteur et ne sait pas
   décrire deux pistes superposées. Ces voisines-là étaient donc écartées côté
   serveur AVANT tout calcul, et disparaissaient sans un mot — ni ligne dans le
   tableau, ni entrée dans « n'entre pas dans la section », ni avertissement.
   Un bus routé en parallèle sur deux couches adossées affichait « aucune
   voisine ne longe » : le pire cas rendu comme le meilleur.

   ON NE LES CHIFFRE TOUJOURS PAS, et ce tableau ne prétend pas le faire : il
   n'a pas de colonne de bruit, parce qu'il n'y a pas de bruit à mettre dedans.
   Il porte la GÉOMÉTRIE, qui suffit à dire où regarder — la longueur en
   regard, le décalage de cuivre à cuivre vu de dessus, et l'épaisseur de
   diélectrique entre les deux faces. Trois nombres, et le lecteur sait s'il a
   un problème.

   LES LONGEMENTS QU'UN PLAN SÉPARE NE SONT PAS LISTÉS, ils sont COMPTÉS. Un
   plan de référence entre deux couches de signal est un écran, et c'est la
   raison d'être d'un empilage : les lister ferait une alarme sur la moitié des
   cartes quatre couches, pour un empilage qui fait exactement son travail. Les
   compter dit « on a regardé », ce qui n'est pas la même chose que se taire.
   ========================================================================== */
function simCoupleSuperposes(){
  const c=simCouplage(); if(!c)return "";
  const sup=c.superposes||[], blindes=+(c.superposes_blindes||0);
  /* RIEN AU-DESSUS : on ne dit quelque chose que si l'on a VU quelque chose.
     Un empilage qui blinde mérite sa phrase — c'est un résultat, pas une
     absence —, mais une sélection qui n'a personne au-dessus n'a rien à
     apprendre à personne. */
  if(!sup.length)
    return blindes
      ? '<p class="simNote">· '+blindes+" longement(s) ont été trouvés sur "+
        "d’AUTRES couches, tous séparés de la sélection par un <b>plan de "+
        "référence</b> : le plan est un écran, ils ne couplent pas. Rien à "+
        "chiffrer, et c’est l’empilage qui le vaut.</p>"
      : "";
  let h='<p class="simSection"><b>AU-DESSUS ET AU-DESSOUS</b> '+sup.length+
        " longement"+(sup.length>1?"s":"")+" entre couches, "+
        "<i>non chiffré"+(sup.length>1?"s":"")+"</i></p>";
  h+='<table class="simTab simTabC"><tr><th>Net</th><th>Couches</th>'+
     "<th>en regard</th><th>décalage</th><th>diélectrique</th></tr>";
  for(const s of sup)
    h+="<tr><td>"+simEsc(s.net||"?")+"</td>"+
       "<td>"+simEsc(s.nom_couche||"?")+" <i>sous</i> "+
       simEsc(s.nom_depuis||"?")+"</td>"+
       "<td>"+simNb(s.longueur,1)+" mm</td>"+
       "<td>"+(s.decalage>0?simNb(s.decalage,3)+" mm"
                          :"<b>0</b> <i>(superposées)</i>")+"</td>"+
       "<td>"+simNb(s.hauteur,3)+" mm</td></tr>";
  h+="</table>";
  h+='<p class="simNote simAlerte">· Ces pistes-là longent la sélection '+
     "<b>par-dessus ou par-dessous</b>, sans plan entre les deux couches, et "+
     "leur couplage <b>n’est pas dans les chiffres ci-dessus</b>. Deux pistes "+
     "superposées couplent souvent PLUS que les mêmes côte à côte, d’autant "+
     "plus que le diélectrique est mince : tout ce que cette fiche annonce "+
     "est donc un <b>plancher</b> tant que ces longements existent. Routez "+
     "ces deux couches en orthogonal, décalez les pistes, ou glissez un plan "+
     "entre elles.</p>";
  h+='<p class="simNote">· Le <b>décalage</b> se compte de cuivre à cuivre vu '+
     "de dessus : zéro veut dire que les deux pistes se chevauchent en "+
     "projection, ce qui est le pire cas. Le <b>diélectrique</b> est "+
     "l’épaisseur entre les deux faces en regard, lue dans l’empilage — c’est "+
     "elle qui décide, pas la distance entre les milieux des deux cuivres.</p>";
  if(blindes)
    h+='<p class="simNote">· '+blindes+" autre(s) longement(s) entre couches "+
       "ont été trouvés mais <b>séparés par un plan de référence</b> : ils ne "+
       "sont pas listés, parce que le plan les blinde.</p>";
  return h;
}

/* ==========================================================================
   LES DEUX LÉGENDES DES CARTES DE COUPLAGE
   --------------------------------------------------------------------------
   UNE CARTE DE CHALEUR SANS LÉGENDE EST UN DESSIN. Celle des impédances en a
   une depuis toujours (`simZLegende`), et pour la même raison : le vert n'y
   veut pas dire « bon », il veut dire « trop bas ». Ici il faut dire deux
   choses de plus, qu'aucune couleur ne porte — sur QUOI la couleur est
   graduée, et ce que la carte ne prétend pas être.
   ========================================================================== */

/* Ce que le serveur a peint, tous lots confondus : la liste des tronçons
   colorés. La légende en tire ses extrêmes, pour ne pas annoncer une échelle
   que le cuivre n'atteint pas. */
function simChaleurLots(){
  const out=[];
  for(const l of simLotsPeints())
    for(const c of (simChaleurRes(l.res)||[]))if(c)out.push(c);
  return out;
}

/* LA PAIRE QUE LA CARTE A PEINTE, telle que le serveur l'a retenue : le net,
   et si c'était une paire DÉCLARÉE ou seulement la voisine la plus proche. Les
   deux ne se lisent pas pareil, et la fiche doit pouvoir le dire. */
function simCarteDiffPartenaire(){
  for(const c of simChaleurLots())
    if(c.z_diff_net)
      return {net:c.z_diff_net, declare:!!c.z_diff_declare};
  return null;
}

function simCarteDiffLegende(){
  const cible=SIM.saisie.cibleDiff, t=simZDiffTolAbs();
  const par=simCarteDiffPartenaire();
  const peints=simChaleurLots().filter(c=>c.z_diff>0);
  if(!par||!peints.length)
    return '<p class="simNote">· La carte de chaleur n’a rien à peindre : '+
      "aucun tronçon de la sélection ne longe de voisine sur assez de "+
      "longueur pour qu’une section couplée s’y résolve.</p>";
  const zs=peints.map(c=>c.z_diff);
  const dehors=zs.filter(z=>simZDiffVerdict(z)!==0).length;
  return '<p class="simSection"><b>SUR LA CARTE</b> '+
    "Z<sub>diff</sub> tronçon par tronçon, avec <b>"+simEsc(par.net)+"</b>"+
    (par.declare?"":" <i>(la voisine la plus proche, pas une paire déclarée)</i>")+
    " — de "+simNb(Math.min(...zs),1)+" à "+simNb(Math.max(...zs),1)+" Ω sur "+
    peints.length+" tronçon"+(peints.length>1?"s":"")+
    (dehors?", <b>"+dehors+" hors tolérance</b>":", tous dans la tolérance")+
    "</p>"+
    '<div class="simLegZ">'+
      '<span><i style="background:'+simZDiffCouleur(cible-2*t)+'"></i>'+
        "trop faible (&lt; "+simNb(cible-t,1)+" Ω)</span>"+
      '<span><i style="background:'+simZDiffCouleur(cible)+'"></i>'+
        "dans la tolérance</span>"+
      '<span><i style="background:'+simZDiffCouleur(cible+2*t)+'"></i>'+
        "trop élevé (&gt; "+simNb(cible+t,1)+" Ω)</span>"+
      '<span><i style="background:rgba(139,145,156,1)"></i>'+
        "la paire ne longe pas ici</span>"+
    "</div>"+
    '<p class="simNote">· Chaque tronçon est repris à SON écart, dans une '+
    "section à deux conducteurs : c’est pour cela que la carte n’affiche pas "+
    "partout le chiffre du tableau, qui est obtenu sur l’écart MOYEN du "+
    "longement. Le gris n’est pas une valeur nulle, c’est l’absence de "+
    "voisine — et c’est ainsi qu’on voit où la paire se sépare.</p>";
}


/* ==========================================================================
   L'ONGLET « Z DIFFÉRENTIELLE »
   ========================================================================== */
function simCorpsDiff(){
  return ''+
  '<div class="pnl-bar simRefBar" id="simRefBar"></div>'+
  '<div class="pnl-bar">'+
    '<span class="pnl-lbl">Cible Z<sub>diff</sub></span>'+
    simChamp("simZDiffCible","Impédance différentielle visée. 100 Ω pour USB "+
                             "et Ethernet, 90 Ω pour USB 2.0, 100 ou 85 Ω "+
                             "selon les normes PCIe.")+
    '<span class="simU">Ω</span>'+
    '<span class="pnl-lbl">Tolérance</span>'+
    simChamp("simZDiffTol","En pourcentage de la cible. 10 % est l'usage.")+
    '<span class="simU">%</span>'+
  '</div>'+
  /* PAS DE FRÉQUENCE ICI, ET C'EST VOULU. La section est quasi-statique : ni
     [C], ni [L], ni les modes pair et impair ne dépendent de f₀. Le champ était
     là, il forçait un recalcul quand on y touchait, et il traînait derrière lui
     l'avertissement de bande S — « f₀ est hors de la bande 100 MHz – 5 GHz » —
     qui parle des PARAMÈTRES S, lesquels ne paraissent que sous l'onglet
     Impédance. Un avertissement sur un chiffre qui n'entre pas dans le calcul
     de la page qui l'affiche ne peut que faire douter d'un résultat juste. */
  '<div class="pnl-bar">'+
    '<span class="pnl-lbl">Paire</span>'+
    '<select class="simUSel simPaireSel" id="simPaireN" title="Quelle piste forme '+
      'la paire avec la sélection. « Détection automatique » lit les suffixes '+
      '_P/_N et les paires déclarées dans l\'éditeur ; choisir un net ici '+
      'DÉCLARE la paire, et le serveur ne fait plus de différence entre les '+
      'deux."></select>'+
  '</div>'+
  '<div class="pnl-bar simBarFixe">'+
    '<button class="tb mini on" id="simGo" title="Calculer la sélection">▶ Calculer</button>'+
    '<button class="tb mini" id="simJson" title="Le problème lui-même : il se donne au solveur en ligne de commande">.json</button>'+
    '<label class="simSuivre" title="Recalculer à chaque changement de sélection"><input type="checkbox" id="simAuto"> suivre</label>'+
  '</div>';
}

/* ==========================================================================
   CHOISIR SA PAIRE À LA MAIN
   --------------------------------------------------------------------------
   LA DÉTECTION AUTOMATIQUE NE PEUT PAS TOUT. Elle lit les suffixes — _P/_N,
   +/−, _DP/_DM — et les paires que l'éditeur déclare. Une paire qui s'appelle
   « CLK » et « CLKB », ou deux nets d'un connecteur nommés par le fabricant,
   n'y entrent pas : la fiche les rangeait alors sous « Autres longements — ce
   ne sont pas des paires », avec des impédances pourtant justes, et rien pour
   dire au panneau qu'il se trompait.

   ON DÉCLARE DONC, et par le chemin qui existe déjà : le net choisi part dans
   `doc.paires`, exactement comme ceux que l'éditeur déclare. Le serveur ne fait
   aucune différence entre les deux — c'est ce qui fait que la paire choisie ici
   devient LA paire, y compris pour la carte de chaleur.

   LES CANDIDATS SONT CE QUI LONGE, et rien d'autre : proposer un net à l'autre
   bout de la carte serait proposer une paire qui n'existe pas. Après un calcul
   ils viennent du résultat ; avant, du voisinage que l'outil sait décrire —
   sans quoi il faudrait calculer pour pouvoir demander le bon calcul.
   ========================================================================== */
function simPaireCandidats(){
  const vus=[], refs=simRefSet();
  const ajoute=n=>{n=String(n||"");
                   if(n&&!refs.has(n)&&vus.indexOf(n)<0)vus.push(n);};
  for(const f of simCouplagePaires())ajoute(f.net_voisin);
  if(!vus.length&&SIM_ED&&typeof SIM_ED.probleme==="function"){
    let d=null;
    try{const pb=SIM_ED.probleme(simSaisie()); d=pb&&pb.doc;}catch(e){}
    const soi=(d&&d.net)||"";
    for(const o of ((d&&d.voisinage)||[]))if(o.net!==soi)ajoute(o.net);
  }
  /* MEME ORDRE QUE PARTOUT AILLEURS. Un tri de chaines brut met « NET10 »
     avant « NET2 » : la liste des paires candidates se lisait donc dans un
     ordre que ni la table des nets, ni le panneau de la visionneuse, ni la
     nomenclature n'emploient — on cherchait un net à la place où les autres
     listes l'auraient mis. */
  vus.sort((a,b)=>String(a).localeCompare(String(b),"fr",{numeric:true}));
  return vus;
}
/* Le net de la sélection, quand elle n'en porte qu'un. Une sélection à cheval
   sur deux nets ne peut pas déclarer de paire : on ne saurait pas laquelle de
   ses deux moitiés est le « P ». */
function simPaireSoi(){
  return (SIM.res&&SIM.res.net)||(SIM.doc&&SIM.doc.net)||"";
}
function simPaireEcrire(){
  const el=simEl("simPaireN");
  if(!el)return;
  const liste=simPaireCandidats(), choisi=String(SIM.saisie.paireN||"");
  let h='<option value="">détection automatique</option>';
  /* LE NET CHOISI RESTE DANS LA LISTE même s'il n'est plus dans le voisinage :
     sans cela, changer de sélection effacerait silencieusement un choix
     explicite, et la fiche parlerait d'une paire que personne n'a demandée. */
  if(choisi&&liste.indexOf(choisi)<0)liste.unshift(choisi);
  for(const n of liste)
    h+='<option value="'+simEsc(n)+'">'+simEsc(n)+"</option>";
  el.innerHTML=h;
  el.value=choisi;
  el.disabled=!simPaireSoi();
  el.title=simPaireSoi()
    ? "Quelle piste forme la paire avec « "+simPaireSoi()+" »."
    : "La sélection porte plusieurs nets : on ne saurait pas laquelle de ses "+
      "moitiés est le « P ». Sélectionnez une seule piste pour déclarer sa "+
      "paire.";
}

function simBrancherDiff(){
  simSaisieEcrire();
  simRefEcrire();
  const pose=(id,quoi,fn)=>{const e=simEl(id);if(e)e[quoi]=fn;};
  pose("simGo","onclick",simGo);
  pose("simJson","onclick",simExportJson);
  const auto=simEl("simAuto");
  if(auto){auto.checked=SIM.suivre;
           auto.onchange=function(){SIM.suivre=this.checked;};}
  simBrancherVoile("simVoile","z");
  /* LA CIBLE NE CHANGE PAS LE CALCUL : elle ne fait que colorer le verdict.
     On réécrit donc la fiche sans rien relancer — c'est ce que fait déjà la
     cible d'impédance sous l'autre onglet. */
  /* LA CIBLE COLORE AUSSI LA CARTE, et pas seulement le tableau : la
     repeindre est ce qui fait qu'on voit tout de suite ce que 90 Ω changent
     là où 100 Ω passaient. */
  for(const id of ["simZDiffCible","simZDiffTol"])
    pose(id,"oninput",function(){simSaisie();simRendre();simRepeindre();});
  /* CHANGER DE PAIRE CHANGE LE PROBLÈME, pas seulement son affichage : le net
     choisi part dans le document. On relance donc, plutôt que de laisser une
     fiche qui ne répond plus à la question posée — c'est un choix délibéré,
     pas une frappe en cours. */
  pose("simPaireN","onchange",function(){
    SIM.saisie.paireN=String(this.value||"");
    if(SIM.occupe)return;
    if(SIM.res||SIM.lots.length)simGo();
  });
  simPaireEcrire();
}

function simDiffApres(){
  const btDiff=simEl("simDiffApplyTarget");
  if(btDiff)btDiff.onclick=function(){
    const z=parseFloat(this.getAttribute("data-z"));
    if(z>0){
      SIM.saisie.cibleDiff=z;
      const inp=simEl("simZDiffCible");
      if(inp)inp.value=simNbLibre(z);
      if(SIM_ED&&typeof SIM_ED.astuce==="function")
        SIM_ED.astuce("⚡ Cible d'impédance différentielle ajustée à "+z+" Ω.");
      simRendre();simRepeindre();
    }
  };
}

function simRendreDiff(){
  if(SIM.occupe)
    return simProgres("Une section à deux conducteurs par couple de pistes "+
      "qui se longent : la matrice de Maxwell, puis les modes pair et "+
      "impair.",SIM.lots.length,SIM.lotsAttendus);
  if(SIM.err)return '<p class="simErr">'+simEsc(SIM.err)+"</p>";
  if(!SIM.res)
    return '<p class="simEtat">Sélectionnez UNE des deux pistes de la paire, '+
      "puis calculez.<br><small>L’autre n’a pas à être sélectionnée : elle "+
      "est trouvée dans le voisinage, comme le serait n’importe quel cuivre "+
      "qui longe. Z différentielle et Z commune sortent de la même section à "+
      "deux conducteurs — la sélectionner en entier ne changerait "+
      "rien.</small></p>";
  return simFicheDiff();
}

function simFicheDiff(){
  const paires=simCouplagePaires();
  if(!paires.length)return simCouplageVide("qu’une section couplée ait un sens");

  /* LES PAIRES NOMMÉES D'ABORD. Deux pistes quelconques qui se longent ONT une
     impédance différentielle — c'est une propriété de la géométrie, pas une
     intention —, mais personne ne s'en sert. Celles qui portent les suffixes
     d'une paire, ou que l'éditeur a déclarées, sont la question ; les autres
     sont un renseignement, et elles se rangent après. */
  const declarees=paires.filter(f=>f.differentielle);
  const autres=paires.filter(f=>!f.differentielle);
  const cible=SIM.saisie.cibleDiff, tol=cible*SIM.saisie.tolDiffPct/100;
  const juge=f=>(f.z_diff==null)?"":
    (Math.abs(f.z_diff-cible)<=tol?"z0ok":"z0ko");

  const dehors=declarees.filter(f=>juge(f)==="z0ko").length;
  let h='<p class="simVerdict '+(declarees.length&&!dehors?"dedans":"dehors")+'">'+
    (!declarees.length
      ? "Aucune paire différentielle reconnue"
      : (dehors
          ? dehors+" paire"+(dehors>1?"s":"")+" sur "+declarees.length+
            " hors tolérance"
          : (declarees.length>1
              ? "Les "+declarees.length+" paires sont dans la tolérance"
              : "La paire est dans la tolérance")))+
    ' <span>'+simEsc(SIM.portee||"—")+" · cible "+simNb(cible,0)+" ± "+
    simNb(tol,1)+" Ω</span></p>";

  /* PAS DE FRÉQUENCE DANS LE BANDEAU : elle n'entre pas dans ce calcul, et
     l'afficher à côté d'une Z différentielle laisse croire qu'elle en dépend.
     Ce qui compte ici, c'est la paire retenue — et d'où vient ce choix. */
  const partenaire=simCarteDiffPartenaire();
  h+='<div class="simMeta"><span>'+paires.length+" longement"+
     (paires.length>1?"s":"")+"</span>"+
     "<span>masse : "+simEsc(((SIM.res.reference_nets)||[]).join(", ")||
                             "non déclarée")+"</span>"+
     "<span>paire : "+(partenaire
        ? simEsc(partenaire.net)+" <small>("+
          (partenaire.declare
            ? (SIM.saisie.paireN===partenaire.net?"choisie":"reconnue")
            : "la plus proche")+")</small>"
        : "<small>aucune</small>")+"</span></div>";

  if(SIM_ED&&typeof SIM_ED.schemaInfosDiff==="function"){
    const dInfo=SIM_ED.schemaInfosDiff(partenaire?partenaire.net:null);
    if(dInfo&&dInfo.rTerm!=null){
      h+='<p class="simNote">⚡ <b>Terminaison différentielle au schéma</b> : '+
         simEsc(dInfo.ref)+' = <b>'+simNb(dInfo.rTerm,0)+' Ω</b>'+
         (dInfo.mpn?' ('+simEsc(dInfo.mpn)+')':'')+'. '+
         '<button class="tb mini" id="simDiffApplyTarget" data-z="'+dInfo.rTerm+'" '+
         'title="Aligner la cible différentielle sur la résistance du schéma">Cibler '+
         simNb(dInfo.rTerm,0)+' Ω</button></p>';
    }
  }

  const tableau=function(liste,titre){
    if(!liste.length)return "";
    let t=titre?'<p class="simSection"><b>'+simEsc(titre)+"</b></p>":"";
    t+='<table class="simTab simTabC"><tr><th>Nets</th>'+
       "<th>Longement</th><th>Z<sub>diff</sub></th><th>Z<sub>comm</sub></th>"+
       "<th>impair / pair</th><th>ε<sub>eff</sub></th></tr>";
    for(const f of liste){
      if(f.raison){
        t+="<tr><td>"+simCoupleNoms(f)+"</td><td>"+simCoupleGeom(f)+"</td>"+
           '<td colspan="4" class="simFaible">'+simEsc(f.raison)+"</td></tr>";
        continue;
      }
      t+="<tr><td>"+simCoupleNoms(f)+
         '<br><small class="simFaible">'+simEsc(f.nom_couche||("couche "+f.couche))+
         (f.deux_cotes?" · des deux côtés":"")+"</small></td>"+
         "<td>"+simCoupleGeom(f)+"</td>"+
         '<td class="'+juge(f)+'">'+simNb(f.z_diff,2)+" Ω</td>"+
         "<td>"+simNb(f.z_commune,2)+" Ω</td>"+
         "<td>"+simNb(f.z_impair,1)+" / "+simNb(f.z_pair,1)+" Ω</td>"+
         "<td>"+simNb(f.eps_eff_impair,3)+" / "+simNb(f.eps_eff_pair,3)+
         "</td></tr>";
    }
    return t+"</table>";
  };

  h+=simCoupleSections();
  h+=simCarteDiffLegende();
  h+=tableau(declarees,declarees.length&&autres.length?"Paires reconnues":"");
  if(autres.length)
    h+=tableau(autres,"Autres longements — ce ne sont pas des paires");

  if(!declarees.length)
    h+='<p class="simNote">· Aucun des nets qui se longent ne porte les '+
       "suffixes d’une paire (<b>_P/_N</b>, <b>+/−</b>, <b>_DP/_DM</b>) et "+
       "aucune paire n’est déclarée dans l’éditeur. Les impédances ci-dessus "+
       "restent justes — deux pistes qui se longent ONT un mode impair —, "+
       "mais rien ne dit qu’elles portent un signal différentiel. "+
       "<b>Choisissez-la vous-même</b> dans la liste « Paire » en haut du "+
       "panneau : le net que vous y désignez est déclaré comme l’autre moitié, "+
       "au même titre que ceux de l’éditeur.</p>";

  /* LE MODE IMPAIR N'EST PAS LA MOITIÉ DE Z_DIFF PAR CONVENTION : la tension
     différentielle est celle qui existe ENTRE les deux conducteurs. Le dire
     évite de croire à un facteur deux d'affichage. */
  h+='<p class="simNote">· <b>Z<sub>diff</sub> = 2 Z<sub>impair</sub></b> et '+
     "<b>Z<sub>comm</sub> = Z<sub>pair</sub> / 2</b> : le facteur deux n’est "+
     "pas une convention d’affichage, c’est que la tension différentielle est "+
     "celle qui existe ENTRE les deux pistes, soit deux fois celle de chacune "+
     "au plan de symétrie.</p>";
  h+='<p class="simNote">· ε<sub>eff</sub> du mode impair est plus petit que '+
     "celui du mode pair : son champ passe entre les deux pistes, donc par "+
     "l’air. C’est ce déséquilibre qui fait exister le bruit AVANT (FEXT) — "+
     "voir l’onglet <b>Crosstalk</b> — et il n’existe pas en triplaque.</p>";
  /* TROIS CONDUCTEURS OU PLUS : Z_diff d'une paire n'a plus de sens tout seul,
     il faut dire ce qu'on a fait des autres. */
  if(((simCouplage().sections||[])[0]||{}).conducteurs &&
     simCouplage().sections.some(x=>(x.conducteurs||[]).length>2))
    h+='<p class="simNote">· La section porte plus de deux conducteurs : '+
       "chaque Z<sub>diff</sub> ci-dessus est celle de SA paire, <b>les autres "+
       "conducteurs tenus à la masse</b>. C’est une réduction exacte de la "+
       "matrice de Maxwell, mais une piste réellement terminée sur son "+
       "impédance n’est pas une piste à la masse.</p>";
  /* AVANT LES HYPOTHÈSES, PAS DEDANS : une hypothèse dit ce que le calcul
     suppose, ce bloc-ci dit ce qu'il a TROUVÉ et laissé de côté. */
  h+=simCoupleSuperposes();
  h+=simCoupleHypotheses();
  return h;
}


/* Les trois boutons du bas, communs aux onglets qui résolvent une section.
   */
function simCorpsLancer(){
  return '<div class="pnl-bar simBarFixe">'+
    '<button class="tb mini on" id="simGo" title="Calculer la sélection">▶ Calculer</button>'+
    '<button class="tb mini" id="simJson" title="Le problème lui-même : il se donne au solveur en ligne de commande">.json</button>'+
    '<label class="simSuivre" title="Recalculer à chaque changement de sélection"><input type="checkbox" id="simAuto"> suivre</label>'+
  '</div>';
}


/* Le budget en clair, dans l'unité de l'amplitude : un budget de 5 % sur un
   signal LVDS de 350 mV vaut 17 mV, et l'écrire en volts n'apprendrait rien. */
function simBruitAbsEcrire(){
  const el=simEl("simBruitAbs");
  if(!el)return;
  const s=SIM.saisie;
  /* L'UNITÉ SUIT L'ORDRE DE GRANDEUR, comme partout ailleurs : 5 % d'un LVDS
     de 350 mV valent 17,5 mV, et les écrire « 0,018 V » demanderait de
     compter les zéros pour retrouver le chiffre qu'on compare. */
  let txt="≤ "+simTension(s.swing*s.bruitPct/100);
  /* ET IL DIT QUAND IL NE DÉCIDE PLUS RIEN. Une marge remplie REMPLACE le
     pourcentage ; laisser sa valeur en clair, muette, à côté d'un champ qui ne
     juge plus ferait chercher lequel des deux a rougi. */
  if(s.marge>0&&s.swing>0)txt+=" — remplacé par la marge";
  el.textContent=txt;
}


/* ==========================================================================
   LE SEUIL QUI JUGE — POURCENTAGE OU MILLIVOLTS
   --------------------------------------------------------------------------
   UN BUDGET EN POURCENTAGE EST UNE CONVENTION ; ce qui fait qu'une carte marche
   ou non, c'est la MARGE DE BRUIT du récepteur : l'écart entre ce que le driver
   garantit (V_OL / V_OH) et ce que le récepteur exige (V_IL / V_IH). Un 3,3 V
   LVCMOS a typiquement 300 à 700 mV de marge basse ; un LVDS à 350 mV
   d'amplitude n'a pas du tout le même budget qu'un 3,3 V, alors que « 5 % »
   s'écrit pareil pour les deux.

   ON N'EN GARDE QU'UN SEUL À LA FOIS. Deux seuils concurrents affichés côte à
   côte seraient pires que pas de seuil : on ne saurait plus lequel a rougi. La
   marge, remplie, REMPLACE le pourcentage — et la fiche dit lequel des deux
   elle applique. */
function simSeuilFraction(){
  const s=SIM.saisie;
  /* La marge est en volts, comme l'amplitude. Sans amplitude, on ne peut pas
     la ramener à une fraction : on retombe alors sur le pourcentage. */
  if(s.marge>0&&s.swing>0)return s.marge/s.swing;
  return s.bruitPct/100;
}
function simSeuilNom(){
  const s=SIM.saisie;
  return (s.marge>0&&s.swing>0)
    ? "marge "+simNb(s.marge*1e3,0)+" mV"
    : "budget "+simNb(s.bruitPct,1)+" %";
}


/* ==========================================================================
   CROSSTALK — OÙ le couplage se fabrique, et non combien il vaut
   --------------------------------------------------------------------------
   POURQUOI CETTE SECTION A REMPLACÉ L'ONGLET « DIAPHONIE ». Celui-ci répondait
   à « combien ma voisine prend-elle » : il résolvait la section droite et
   rendait un coefficient — UN chiffre par longement. Quand ce chiffre est
   mauvais, il ne dit pas lequel des quarante millimètres qui longent en est
   responsable, et c'est pourtant la seule chose dont on ait besoin pour
   corriger le dessin. Sa carte de chaleur ATTRIBUAIT le bruit aux tronçons au
   prorata du couplage local ; elle ne le MESURAIT pas le long de la piste.
   Cette section-ci rend le même « combien » — en pour-cent de l'agresseur, en
   décibels et en VOLTS sur la victime — et le « où » avec. Deux onglets pour
   une seule question, répondue par deux physiques, auraient fini par donner
   deux verdicts qu'on ne saurait pas arbitrer.

   CE QUE CELLE-CI FAIT, ET C'EST UNE AUTRE PHYSIQUE. Les termes croisés de la
   matrice S d'un réseau multi-ports portent, en fréquence, tout ce que le
   couplage fait le long du parcours. Leur transformée de Fourier inverse est
   une réponse impulsionnelle, et le retard s'y convertit en POSITION dès qu'on
   connaît la vitesse de propagation :

     NEXT = S(victime_proche, agresseur_proche)      trajet aller-retour
     FEXT = S(victime_lointaine, agresseur_proche)   co-propage

   C'est la réflectométrie temporelle, appliquée aux termes CROISÉS plutôt qu'à
   la réflexion.

   LA MATRICE VIENT DU DESIGN, ET DE NULLE PART AILLEURS. Il n'y a rien à
   importer et rien à choisir : le serveur SYNTHÉTISE le réseau multi-ports à
   partir de la même section droite que l'onglet Z différentielle, mise en
   cascade le long du parcours. Le seul geste demandé est de SÉLECTIONNER L'AGRESSEUR ; le
   reste — victimes, ports, correspondance — se déduit de la géométrie.

   POURQUOI L'IMPORT D'UN .sNp A DISPARU. Il apportait une physique que la
   section droite ne sait pas décrire, mais il apportait surtout l'ORDRE DE SES
   PORTS, que rien dans le fichier ne donne : il fallait une table à composer,
   une case à cocher, et un panneau entier pour l'obtenir — faute de quoi on
   lisait le couplage d'un couple pour celui d'un autre, sans qu'aucun chiffre
   ne paraisse anormal. Les ports sont maintenant posés par le serveur : la
   table qui reste est un COMPTE RENDU, plus une saisie. Le .sNp, lui, reste en
   SORTIE — pour comparer ailleurs le réseau à ce qu'un solveur pleine onde
   rendrait de la même géométrie.

   TROIS CHOSES QUE CE PANNEAU NE FAIT JAMAIS EN SILENCE, et elles commandent
   sa disposition :

     · LES DEUX ÉTAPES ZÉRO restent DEUX TABLEAUX. La présélection géométrique
       dit ce qui longe, avec sa distance et sa longueur mesurées ; la
       confirmation par simulation dit ce qui couple, avec son niveau. Une
       piste absente du résultat est soit LOIN, soit PROCHE ET BLINDÉE, et ce
       sont deux gestes de routage opposés ;
     · LA RÉSOLUTION SPATIALE s'affiche À CÔTÉ de la carte. Deux pics plus
       proches que cette valeur sont un seul pic, quelle que soit la finesse de
       la courbe à l'écran — et le zero-padding, qui rend visiblement la courbe
       plus fine, n'y change rien. Une résolution VOULUE se saisit : le serveur
       dit alors jusqu'à quelle fréquence il faudrait monter pour l'atteindre ;
     · LE PROFIL D'ESPACEMENT SE SUPERPOSE À LA CARTE, en trait blanc par
       victime. Il vient de la GÉOMÉTRIE et non du calcul électromagnétique :
       c'est le seul témoin indépendant que la carte ait. Un pic doit tomber là
       où les deux pistes se rapprochent ; un pic là où rien ne se resserre est
       signalé — et si une zone de vigilance tombe au même endroit, ce n'est
       plus un désaccord mais son EXPLICATION.

   LE PLAN DE MASSE EST À CÔTÉ, ET JAMAIS DEDANS. Son blindage est déjà dans
   les paramètres S ; ce que le panneau superpose à la carte, ce sont des
   CAUSES possibles — un pas de couture insuffisant, une fente du plan, un
   changement de couche sans via de masse. Un pic de couplage à la même
   abscisse qu'un trou de couture n'est plus un mystère.
   ========================================================================== */

const SIM_XT_ROUTE="/api/crosstalk";
const SIM_XT_FORMAT="cao-crosstalk-1";

/* L'état de la section, séparé de celui des quatre autres analyses — comme
   celui de la chute DC, et pour la même raison : elle a son document, son
   verrou et son résultat, et un calcul de section en cours ne doit pas bloquer
   une carte de couplage. */
const SIM_XT={
  res:null, occupe:false, err:"", doc:null,
  /* Quel sens la carte peint. Les deux sont dans le MÊME résultat : en
     changer ne relance rien. */
  sens:"next",
  /* LE PROFIL D'ESPACEMENT SE MONTRE OU SE CACHE, et rien d'autre : il est
     dans le résultat, le masquer ne relance donc rien non plus. Il est VISIBLE
     par défaut — c'est le seul témoin indépendant de la carte, et le cacher
     d'office reviendrait à rendre la courbe de couplage invérifiable pour qui
     ne saurait pas qu'il existe. */
  espacement:true,
  /* LES ZONES À RISQUE SUR LE CUIVRE, allumées par défaut : c'est la réponse
     qu'on est venu chercher — quel millimètre de CETTE piste reprendre —, et
     la carte du panneau, elle, répond à « laquelle prend le plus ». Les deux
     sortent du même calcul ; les cacher d'office ferait chercher à la règle
     une abscisse qu'on peut montrer. */
  risques:true,
  /* LA CHALEUR PEINTE LE LONG DES VICTIMES, allumée par défaut : c'est elle
     qui a remplacé le ruban schématique du panneau — voir « LA FIGURE » —, et
     la cacher d'office ferait chercher une carte de chaleur qui ne serait plus
     nulle part. Elle est dans le résultat, la montrer ou la cacher ne relance
     donc rien. */
  chaleur:true,
  /* CE QUE LA FIGURE MONTRE : les deux sens, et l'unité.
     --------------------------------------------------------------------
     TROIS CASES, ET AUCUNE NE RELANCE RIEN. Les deux courbes et les deux
     unités sont dans le MÊME résultat ; ce qui se règle ici est ce qu'on
     REGARDE, jamais ce qu'on calcule.

     POURQUOI ÉTEINDRE UN SENS. Les deux graphes ont chacun leur échelle — le
     FEXT vaut souvent une fraction du NEXT —, et deux échelles l'une sous
     l'autre se comparent mal : on croit lire deux reliefs quand on lit deux
     zooms. Quand on suit UN des deux, l'autre prend la moitié de la hauteur
     pour rien, et la figure entière se resserre dès qu'il s'en va.

     POURQUOI ÉTEINDRE LES VOLTS. Le pour-cent ne dépend que du cuivre ; la
     tension le multiplie par une amplitude SAISIE. Qui compare deux dessins
     ne veut que le premier — deux chiffres par case et deux graduations par
     graphe font alors du bruit sur ce qu'il regarde. Qui prépare une revue
     de conception veut le second. La case tranche, et le calcul ne bouge
     pas d'un pour-cent.

     LES DEUX SENS PEUVENT S'ÉTEINDRE ENSEMBLE, et la figure le DIT plutôt
     que de disparaître : les cases restent au-dessus du message, et il faut
     un clic pour revenir. Refuser de décocher la dernière se lirait comme
     une case cassée. */
  courbes:{next:true, fext:true, volts:true},
  /* LES VICTIMES ÉTEINTES, PAR NET. Cinq victimes sur une même figure, c'est
     cinq pistes, dix courbes et cinq lignes de lecture : lisible tant qu'on
     les regarde toutes, illisible dès qu'on en suit UNE. Décocher n'est donc
     pas un filtre de confort, c'est ce qui permet de comparer deux victimes
     sans les confondre. C'est un geste d'AFFICHAGE — le calcul ne bouge pas,
     les tableaux plus bas gardent tout le monde — et il vaut aussi pour les
     plages peintes sur le cuivre, sans quoi la carte montrerait une victime
     que la figure vient d'éteindre. */
  caches:{},
  /* Le point que la réglette lit, en fraction du parcours. Il survit aux
     rendus — sinon il sauterait au milieu à chaque frappe dans un champ. */
  pos:0.5,
  saisie:{distance:0, longueur:0, adjacentes:true, bandeAuto:false,
          seuil:-40, z0:50,
          fenetre:"kaiser", beta:8.6, pad:4, resolution:0,
          ecartV:5, asym:6, desaccord:1.25, risque:50,
          agreger:false, vitesses:""}
};

/* Les deux sens, et ce que chacun localise vraiment. */
const SIM_XT_SENS=[
  {cle:"next", nom:"NEXT",
   titre:"Le bruit du bout PROCHE de la victime. Il remonte vers la source : "+
         "ce qui se couple à l'abscisse x y arrive au bout d'un ALLER-RETOUR, "+
         "d'où x = v·t/2. C'est le seul des deux qui localise en milieu "+
         "homogène."},
  {cle:"fext", nom:"FEXT",
   titre:"Le bruit du bout LOINTAIN. Il CO-PROPAGE avec l'agresseur : ce "+
         "qui se couple en x arrive au bout lointain à τa(x) + τv(L) − "+
         "τv(x), et à vitesses égales cette somme ne dépend plus de x — "+
         "tout arrive au MÊME instant, et il n'existe alors aucune abscisse "+
         "à rendre. La carte ne porte PAS de courbe dans ce sens-là dans ce "+
         "cas, plutôt qu'une courbe qui désignerait un millimètre au "+
         "hasard ; le niveau du FEXT, lui, reste au tableau des couples. "+
         "Elle ne se met à localiser que lorsque les deux vitesses diffèrent "+
         "assez, donc en milieu franchement inhomogène."}
];

const SIM_XT_FENETRES=[
  {cle:"kaiser", nom:"Kaiser"},
  {cle:"hann",   nom:"Hann"},
  {cle:"rect",   nom:"rectangulaire"}
];

/* Le transport. On réutilise la découverte de serveur de `simConnecter` — c'est
   le même serveur, et sonder deux fois la même machine pour deux routes qui
   vivent dans le même processus n'apprendrait rien. Une route absente répond
   503 en le disant, et c'est ce message-là qu'il faut montrer. */
async function simXtLancer(doc){
  await simConnecter();
  const rep=await fetch(SIM_BASE+SIM_XT_ROUTE,{
    method:"POST", headers:{"Content-Type":"application/json"},
    body:JSON.stringify(doc)
  });
  if(!rep.ok)throw new Error(await simErreur(rep));
  const res=await rep.json();
  if(!res||!res.etape0)throw new Error("Réponse inattendue du serveur.");
  return res;
}

/* Les réglages, tels qu'ils partent au serveur. UN SEUL ENDROIT LES TRADUIT :
   le panneau les tient dans ses unités d'affichage — le pourcentage pour
   l'écart de vitesse —, le serveur les veut dans les siennes. Deux traductions
   auraient fini par diverger, et c'est le genre d'écart qui fait qu'un seuil
   affiché à 5 % en vaut 500 côté calcul. */
function simXtReglages(){
  const s=SIM_XT.saisie;
  /* TOUT PART EN NOMBRE, ET C'EST LE POINT. Un réglage qui filerait en chaîne
     de caractères — « 0,75 » plutôt que 0.75 — serait lu comme absent côté
     Python, sans erreur ni message : le calcul tournerait sur le DÉFAUT, et le
     panneau afficherait le seuil qu'on croit avoir posé. C'est exactement le
     genre de résultat faux et propre que cette section entière existe pour
     empêcher. */
  const n=(v,defaut)=>{
    const x=parseFloat(v);
    return isFinite(x)?x:(defaut||0);
  };
  const r={
    distance_max:Math.max(0,n(s.distance)),
    longueur_min:Math.max(0,n(s.longueur)),
    couches_adjacentes:!!s.adjacentes,
    bande_auto:!!s.bandeAuto,
    seuil_db:n(s.seuil,-40),
    z0:Math.max(1,n(s.z0,50)||50),
    fenetre:s.fenetre, kaiser_beta:Math.max(0,n(s.beta,8.6)),
    zero_pad:Math.max(1,Math.round(n(s.pad,1))||1),
    /* ZÉRO N'EST PAS UNE RÉSOLUTION : c'est « je n'en demande aucune », et le
       serveur se contente alors de dire celle qu'il atteint. */
    resolution_cible:Math.max(0,n(s.resolution)),
    /* LE POURCENTAGE DEVIENT UNE FRACTION ICI, ET NULLE PART AILLEURS. Le
       panneau l'affiche en pour-cent parce que c'est ainsi qu'on le pense ; le
       serveur le veut en fraction. Deux traductions auraient fini par diverger,
       et un seuil affiché à 5 % en aurait valu 500. */
    ecart_vitesse_max:Math.max(0,n(s.ecartV,5))/100,
    asymetrie_db:Math.max(0,n(s.asym,6)),
    /* SOUS 1, LE SERVEUR REFUSE — c'est un rapport d'espacements, et il
       signalerait la moitié des pics d'office. On n'écrête pas ici : la saisie
       part telle quelle, et le refus dit pourquoi. Écrêter en silence ferait
       calculer sous une règle qu'on ne croit pas avoir posée. */
    desaccord:n(s.desaccord,1.25),
    /* LE POUR-CENT DEVIENT UNE FRACTION ICI, comme l'écart de vitesse : le
       panneau l'affiche en pour-cent du pire point, parce que c'est ainsi
       qu'on le pense ; le serveur le veut entre zéro et un. */
    risque:Math.max(0,n(s.risque,50))/100,
    agreger_agresseurs:!!s.agreger
  };
  const v=simXtVitesses();
  if(Object.keys(v).length)r.vitesses=v;
  return r;
}

/* LES VITESSES SAISIES À LA MAIN, écrites « NET=1.5e8 » et séparées par des
   virgules. C'est le repli quand l'empilage ne suffit pas — une piste dont on
   connaît la vitesse par la mesure, ou une couche dont le diélectrique n'est
   pas dans l'empilage. Ce qui n'est pas relisible est IGNORÉ et la fiche le
   dit : accepter à moitié une ligne mal écrite serait pire que de la refuser. */
function simXtVitesses(){
  const out={};
  for(const bout of String(SIM_XT.saisie.vitesses||"").split(/[,;\n]+/)){
    const m=bout.match(/^\s*([^=]+?)\s*=\s*([-\d.eE+]+)\s*$/);
    if(!m)continue;
    const v=parseFloat(m[2]);
    if(isFinite(v)&&v>0)out[m[1]]=v;
  }
  return out;
}
function simXtVitessesRefusees(){
  return String(SIM_XT.saisie.vitesses||"").split(/[,;\n]+/)
    .map(s=>s.trim()).filter(s=>s&&!/^[^=]+=\s*[-\d.eE+]+$/.test(s));
}

function simXtCase(id,texte,titre){
  return '<label class="simSuivre" title="'+simEsc(titre)+'">'+
         '<input type="checkbox" id="'+id+'"> '+simEsc(texte)+"</label>";
}

/* ==========================================================================
   LES COMMANDES
   --------------------------------------------------------------------------
   ELLES SUIVENT L'ORDRE DU CALCUL, et ce n'est pas cosmétique : les deux
   étapes zéro se règlent avant la transformée, parce qu'elles décident de CE
   QU'ON SIMULE, et la transformée ne décide que de la façon dont on le lit.
   Les mélanger ferait chercher le seuil de distance à côté du zero-padding.

   AUCUN CHAMP N'EST OBLIGATOIRE, et un champ vide n'est pas une valeur
   manquante : c'est « déduis-le ». Les deux seuils de l'étape 0a se déduisent
   de la largeur de piste et de la hauteur au plan, et la fiche écrit ensuite
   ce qui a été retenu — c'est la seule façon de régler un seuil sans avoir à
   deviner d'abord ce qu'il vaut.
   ========================================================================== */
function simCorpsCrosstalk(){
  return ''+
  '<div class="pnl-bar simRefBar" id="simRefBar"></div>'+
  /* LA BANDE EN TÊTE, ET CE SONT LES MÊMES CHAMPS QUE L'ONGLET IMPÉDANCE —
     mêmes identifiants, donc même état, et changer d'onglet ne les perd pas.
     Elle est ici parce qu'elle DÉCIDE DE LA RÉSOLUTION SPATIALE : c'est le
     seul réglage de ce panneau dont dépend ce que la carte peut distinguer, et
     le laisser sous un autre onglet reviendrait à cacher la commande dont on
     se sert le plus. Le temps de montée l'accompagne : c'est lui, avec le haut
     de bande, qui fixe le seuil de couture. */
  '<div class="pnl-bar simBarF">'+
    '<span class="pnl-lbl">Bande</span>'+
    '<span class="simSep">→</span>'+
    simChamp("simF2","Le haut de la bande analysée. La résolution spatiale "+
      "en découle directement : elle vaut à peu près la vitesse divisée par "+
      "deux fois cette fréquence, élargie par la fenêtre.")+
    simChampUnite("simFUniteBande2","la fin de la bande")+
    '<span class="simGr"><span class="pnl-lbl">Points</span>'+
    simChamp("simN","Le nombre de points de fréquence. Il fixe la FENÊTRE "+
      "TEMPORELLE — donc la longueur de piste que la carte peut couvrir — et "+
      "non la résolution, qui ne dépend que de la bande.")+"</span>"+
    '<span class="simGr"><span class="pnl-lbl">t<sub>r</sub></span>'+
    simChamp("simTr","Le front de l'agresseur. Il n'entre PAS dans le "+
      "couplage : il ne sert qu'au seuil de pas de couture, avec le haut de "+
      "bande. Vide, il est déduit de la bande.")+
    simChampUnite("simTrUnite","le temps de montée",SIM_UNITES_TR)+"</span>"+
    simXtCase("simXtBandeAuto","déduite de la carte",
      "La bande et le nombre de points se calculent depuis le DESSIN, et "+
      "s'écrivent ensuite dans les deux champs — ils restent corrigeables. "+
      "Trois mesures les fixent : le PLUS COURT LONGEMENT donne ce qu'il y a "+
      "de plus fin à montrer (trois échantillons en travers), la LONGUEUR du "+
      "parcours donne la fenêtre temporelle donc le nombre de points, et "+
      "l'ÉPAISSEUR du diélectrique pose le plafond — au-delà de λ/10 dedans, "+
      "la section droite quasi-TEM ne décrit plus la ligne, et monter encore "+
      "affine la carte en apparence et la fabrique en réalité. "+
      "ATTENTION : plus de POINTS n'affine RIEN. Les points allongent la "+
      "fenêtre (le repliement) ; c'est la BANDE, et elle seule, qui fixe la "+
      "résolution.")+
  '</div>'+
  /* LE SIGNAL, ET C'EST LA SEULE RANGÉE DE CE PANNEAU QUI NE RELANCE RIEN.
     Partout ailleurs ici, toucher un champ jette le résultat — voir
     « BRANCHEMENT ». Ces trois-là font exception, et l'exception est motivée :
     le serveur rend des RAPPORTS — « cette victime prend 0,42 % de son
     agresseur » —, et une amplitude ne fait que les convertir en volts. Aucun
     chiffre du calcul ne bouge ; seule l'unité dans laquelle on le lit change.
     Recalculer trente secondes de matrice S pour écrire 3,3 au lieu de 1,8
     serait absurde.

     ET C'EST POURTANT LA COLONNE QU'ON LIT. « 0,42 % » ne se compare à rien :
     ce qui décide qu'une carte marche ou non, c'est l'écart entre le bruit qui
     arrive sur la victime et la marge de son récepteur, et les deux sont des
     TENSIONS. Sans amplitude, la fiche entière parle en pourcentages d'une
     grandeur qu'elle ne nomme jamais. */
  '<div class="pnl-bar simBarF">'+
    '<span class="pnl-lbl">Signal</span>'+
    '<span class="simGr"><span class="pnl-lbl">amplitude</span>'+
    simChamp("simSwing","L'amplitude du front de l'AGRESSEUR — l'excursion "+
      "de sa communication, crête à crête : 3,3 V en LVCMOS, 1,8 V en "+
      "LVCMOS18, 0,35 V en LVDS. Elle ne change RIEN au calcul : le couplage "+
      "est un rapport, et c'est elle qui le convertit en volts sur les "+
      "courbes, les cases et la réglette. C'est le seul champ de ce panneau "+
      "qui ne jette pas le résultat.")+
    simChampUnite("simSwingUnite","l'amplitude",SIM_UNITES_V)+"</span>"+
    '<span class="simGr"><span class="pnl-lbl">budget</span>'+
    simChamp("simBruit","Ce qu'on s'autorise, en pourcentage de l'amplitude. "+
      "C'est VOTRE convention : le solveur ne la connaît pas, elle ne fait "+
      "que rendre le verdict. Le crosstalk se compare à elle, et à rien "+
      "d'autre — un barème maison posé au-dessus d'un calcul honnête serait "+
      "un chiffre inventé.")+
    '<span class="simU">%</span>'+
    '<span class="simU" id="simBruitAbs">—</span></span>'+
    /* LA MARGE EN MILLIVOLTS, ET C'EST ELLE QUI DÉCIDE VRAIMENT. Un budget en
       pourcentage est une convention ; ce qui fait qu'une carte marche ou non,
       c'est la marge entre ce que le driver garantit (V_OL / V_OH) et ce que
       le récepteur exige (V_IL / V_IH). Remplie, elle REMPLACE le
       pourcentage — deux seuils concurrents seraient pires que pas de seuil
       du tout, puisqu'on ne saurait plus lequel a rougi. */
    '<span class="simGr"><span class="pnl-lbl">ou marge</span>'+
    simChamp("simMarge","La marge de bruit du récepteur de la VICTIME, en "+
      "millivolts : l'écart entre ce que son driver garantit (V_OL / V_OH) et "+
      "ce qu'il exige (V_IL / V_IH). C'est le seuil qui décide réellement. "+
      "Remplie, elle REMPLACE le budget en pourcentage.")+
    '<span class="simU">mV</span></span>'+
    '<button class="tb mini" id="simXtImportSch" '+
            'title="Ajuster l\'amplitude et la marge selon les composants du schéma connectés à ce net">⚡ Du schéma</button>'+
  '</div>'+
  '<div class="pnl-bar simBarF">'+
    '<span class="pnl-lbl">Présélection</span>'+
    '<span class="simGr"><span class="pnl-lbl">distance</span>'+
    simChamp("simXtDist","La distance latérale au-delà de laquelle une piste "+
      "n'est plus candidate. VIDE = déduite : trois fois le plus grand de la "+
      "largeur de piste et de la hauteur au plan — la règle 3W vue des deux "+
      "côtés. Elle MAJORE volontairement ; c'est l'étape 0b qui tranche.")+
    '<span class="simU">mm</span></span>'+
    '<span class="simGr"><span class="pnl-lbl">longement mini</span>'+
    simChamp("simXtLong","En deçà, c'est un croisement et non un longement. "+
      "VIDE = déduit : trois fois la somme de l'écart et de la hauteur au "+
      "plan — en deçà, les deux bouts occupent tout le longement et il n'y a "+
      "plus de ligne uniforme à décrire.")+
    '<span class="simU">mm</span></span>'+
    simXtCase("simXtAdj","couches adjacentes",
      "Deux pistes SUPERPOSÉES couplent souvent PLUS que les mêmes côte à "+
      "côte. Décoché, on ne regarde que la couche de la sélection — et une "+
      "voisine d'une autre couche disparaît alors sans un mot, ce qui se lit "+
      "comme un couplage nul. Celles qu'un plan de référence sépare sont "+
      "comptées et écartées : le plan est un écran.")+
  '</div>'+
  '<div class="pnl-bar simBarF">'+
    '<span class="pnl-lbl">Confirmation</span>'+
    '<span class="simGr"><span class="pnl-lbl">seuil</span>'+
    simChamp("simXtSeuil","En deçà, la piste reste au tableau AVEC son niveau "+
      "mais n'est ni peinte ni comptée. C'est un couplage, donc une "+
      "atténuation : le seuil est négatif.")+
    '<span class="simU">dB</span></span>'+
    '<span class="simGr"><span class="pnl-lbl">Réf. ports</span>'+
    simChamp("simXtZ0","L'impédance de référence des ports du réseau "+
      "synthétisé. Elle ne change pas la physique : elle change la valeur des "+
      "paramètres S, donc le niveau lu, et c'est pourquoi elle s'affiche.")+
    '<span class="simU">Ω</span></span>'+
  '</div>'+
  '<div class="pnl-bar simBarF">'+
    '<span class="pnl-lbl">Fenêtre</span>'+
    '<select class="simU simUSel" id="simXtFen" title="'+simEsc(
      "Elle écrase le ringing de Gibbs — des lobes de part et d'autre de "+
      "chaque pic, qui se lisent comme des zones de couplage inexistantes — "+
      "au prix d'un pic plus large. Kaiser 8,6 élargit d'environ 2,9 ; "+
      "rectangulaire donne la meilleure résolution et le pire ringing.")+'">'+
    SIM_XT_FENETRES.map(f=>'<option value="'+f.cle+'">'+f.nom+"</option>")
      .join("")+"</select>"+
    '<span class="simGr"><span class="pnl-lbl">β</span>'+
    simChamp("simXtBeta","Le paramètre de la fenêtre de Kaiser. Plus il est "+
      "grand, moins il y a de lobes et plus le pic est large.")+
    '<span class="simU">·</span></span>'+
    '<span class="simGr"><span class="pnl-lbl">padding</span>'+
    simChamp("simXtPad","Le zero-padding N'AJOUTE AUCUNE RÉSOLUTION : il "+
      "interpole entre des points que la bande a déjà fixés. Il sert à poser "+
      "un pic proprement sur l'axe, pas à en distinguer deux.")+
    '<span class="simU">×</span></span>'+
    '<span class="simGr"><span class="pnl-lbl">résolution visée</span>'+
    simChamp("simXtRes","Facultatif. La finesse que vous VOULEZ sur l'axe "+
      "des positions. Si la bande ne la permet pas, la fiche dit jusqu'à "+
      "quelle fréquence il faudrait monter — ce sur quoi on peut agir, alors "+
      "que « la carte est floue » ne se corrige pas. VIDE = on ne demande "+
      "rien, et la résolution atteinte s'affiche quand même.")+
    '<span class="simU">mm</span></span>'+
  '</div>'+
  '<div class="pnl-bar simBarF">'+
    '<span class="pnl-lbl">Lecture</span>'+
    '<span class="simGr"><span class="pnl-lbl">écart vitesse</span>'+
    simChamp("simXtEcartV","Au-delà, l'axe de position du FEXT — qui emploie "+
      "la moyenne des deux vitesses — est signalé comme approché.")+
    '<span class="simU">%</span></span>'+
    '<span class="simGr"><span class="pnl-lbl">asymétrie</span>'+
    simChamp("simXtAsym","Deux victimes du même agresseur qui diffèrent de "+
      "plus que cela sont relevées. Six décibels est un facteur deux. Ce "+
      "n'est ALERTÉ que si les profils d'espacement ne l'expliquent pas : un "+
      "agresseur équidistant de ses deux voisines à tout instant est "+
      "l'exception, pas la règle.")+
    '<span class="simU">dB</span></span>'+
    '<span class="simGr"><span class="pnl-lbl">désaccord</span>'+
    simChamp("simXtDesac","Le rapport entre l'espacement mesuré AU PIC et "+
      "l'espacement médian du longement. Au-delà, le pic n'est pas justifié "+
      "par un resserrement et il est signalé. Plus bas = plus bavard ; sous "+
      "1, le serveur refuse — la moitié des pics serait signalée d'office.")+
    '<span class="simU">×</span></span>'+
    '<span class="simGr"><span class="pnl-lbl">zone à risque</span>'+
    simChamp("simXtRisque","La fraction du PIRE POINT de chaque victime "+
      "au-delà de laquelle la portion se peint sur le cuivre. 50 % vaut "+
      "−6 dB sous son pire point, ce qui sépare une crête de son pied. Plus "+
      "bas = des zones plus longues ; à 100 %, plus rien ne se peint.")+
    '<span class="simU">%</span></span>'+
    simXtCase("simXtAgreger","sommer les agresseurs",
      "PAR DÉFAUT RIEN NE S'AGRÈGE : deux victimes d'un même agresseur sont "+
      "deux nets, chacun avec son budget. Coché, PLUSIEURS AGRESSEURS "+
      "sélectionnés sont sommés EN PHASE vers chaque victime — le cas d'un "+
      "bus qui commute d'un bloc, et l'hypothèse la plus défavorable.")+
  '</div>'+
  '<div class="pnl-bar simBarF">'+
    '<span class="pnl-lbl">Vitesses</span>'+
    simChamp("simXtVit","Facultatif, pour forcer la vitesse d'une piste : "+
      "« CLK=1.5e8, DATA=1.6e8 » en m/s. Ce qui n'est pas écrit est calculé "+
      "depuis l'empilage, piste par piste — jamais supposé égal à celui de "+
      "l'agresseur.",true)+
    '<span class="simU">m/s</span>'+
  '</div>'+
  '<div class="pnl-bar simBarFixe">'+
    '<button class="tb mini on" id="simXtGo" title="Analyser la sélection">▶ Analyser</button>'+
    '<button class="tb mini" id="simXtCsv" title="La carte, position par position, avec l\'espacement mesuré — pour recouper avec le layout">.csv</button>'+
    '<button class="tb mini" id="simXtSnp" title="Le réseau multi-ports généré ici, au format Touchstone : une SORTIE, pour le comparer ailleurs">.sNp</button>'+
    '<button class="tb mini" id="simXtJson" title="Le problème lui-même, rejouable">.json</button>'+
    '<button class="tb mini" id="simXtRapport" title="Le rapport COMPLET en texte : le verdict, les réserves, les deux tableaux de l\'étape zéro, le recoupement, la validation de la matrice, le plan de référence, les ports et les hypothèses. C\'est ce que la fiche replie — elle montre le verdict et la carte, le fichier garde tout.">rapport</button>'+
  '</div>';
}

/* ==========================================================================
   BRANCHEMENT
   --------------------------------------------------------------------------
   TOUS LES RÉGLAGES DU CALCUL PARTENT AU SERVEUR : en toucher un rend le
   résultat affiché caduc, et le jeter en le disant vaut mieux que de laisser
   lire des chiffres obtenus sous d'autres règles.

   LA RANGÉE « SIGNAL » EST L'EXCEPTION, ET ELLE EST MOTIVÉE. L'amplitude, le
   budget et la marge ne décrivent pas le cuivre : ils LISENT ce que le serveur
   a rendu. Le couplage est un rapport — « 0,42 % de l'agresseur » —, et une
   amplitude ne fait que le convertir en volts ; un budget ne fait que
   prononcer. Rien du calcul n'en dépend, et jeter une matrice S pour un
   chiffre qui ne l'a pas servie serait un recalcul gratuit de trente
   secondes.
   Les autres réglages locaux sont le sens peint, le profil d'espacement, la
   chaleur et les zones — tous DÉJÀ dans le résultat, exactement comme NEXT et
   FEXT ailleurs.
   ========================================================================== */
function simBrancherCrosstalk(){
  /* LA BANDE ET LE FRONT SONT ÉCRITS PAR LE MÊME CODE QUE PARTOUT AILLEURS
     (`simSaisieEcrire`) : ce sont les mêmes champs et le même état, et deux
     écritures pour un seul état auraient fini par afficher deux valeurs
     différentes de la même fréquence selon l'onglet. */
  simSaisieEcrire();
  simXtSaisieEcrire();
  simRefEcrire();
  simBruitAbsEcrire();
  const pose=(id,quoi,fn)=>{const e=simEl(id);if(e)e[quoi]=fn;};
  pose("simXtGo","onclick",simXtGo);
  pose("simXtCsv","onclick",simXtExportCsv);
  pose("simXtSnp","onclick",simXtExportSnp);
  pose("simXtJson","onclick",simXtExportJson);
  pose("simXtRapport","onclick",simXtExportRapport);

  const jeter=function(quoi){
    simXtSaisie();
    if(SIM_XT.res&&!SIM_XT.occupe){
      SIM_XT.res=null;
      SIM_XT.err=quoi+" : relancez l'analyse.";
      simRendre();
    }
  };
  const champs={simF2:"Le haut de bande a changé",
                simN:"Le nombre de points a changé",
                simTr:"Le temps de montée a changé",
                simXtDist:"Le seuil de distance a changé",
                simXtLong:"Le longement minimal a changé",
                simXtSeuil:"Le seuil de confirmation a changé",
                simXtZ0:"L'impédance de référence a changé",
                simXtBeta:"Le β de la fenêtre a changé",
                simXtPad:"Le zero-padding a changé",
                simXtRes:"La résolution visée a changé",
                simXtEcartV:"Le seuil d'écart de vitesse a changé",
                simXtAsym:"Le seuil d'asymétrie a changé",
                simXtDesac:"Le rapport de désaccord a changé",
                simXtRisque:"Le seuil de zone à risque a changé",
                simXtVit:"Une vitesse saisie a changé"};
  for(const id of Object.keys(champs))
    pose(id,"oninput",function(){jeter(champs[id]);});
  pose("simXtFen","onchange",function(){jeter("La fenêtre a changé");});
  /* CHANGER D'UNITÉ CONVERTIT, ÇA NE RÉINTERPRÈTE PAS : la valeur physique ne
     bouge pas, donc le résultat affiché reste valable et rien ne se jette. */
  pose("simFUniteBande2","onchange",function(){
    simUniteChanger(this.value,"bande2");
  });
  pose("simTrUnite","onchange",function(){simUniteChanger(this.value,"tr");});
  /* LES TROIS CHAMPS DE SIGNAL NE JETTENT RIEN, et ce sont les seuls du
     panneau. Ils ne partent pas au serveur : l'amplitude convertit en volts
     des rapports déjà calculés, le budget et la marge prononcent le verdict.
     On réécrit la fiche, et voilà. Le budget en clair suit l'amplitude — le
     laisser en arrière afficherait « ≤ 165 mV » sous une amplitude qui n'est
     plus celle-là. */
  for(const id of ["simSwing","simBruit","simMarge"])
    pose(id,"oninput",function(){
      simSaisie(); simBruitAbsEcrire(); simRendre();
    });
  pose("simSwingUnite","onchange",function(){
    simUniteChanger(this.value,"swing");
  });
  pose("simXtImportSch","onclick",function(){
    if(SIM_ED&&typeof SIM_ED.schemaInfosCrosstalk==="function"){
      const aggrNet=(SIM_XT.doc&&SIM_XT.doc.agresseurs&&SIM_XT.doc.agresseurs[0])||
                    (SIM_XT.res&&SIM_XT.res.agresseurs&&SIM_XT.res.agresseurs[0])||null;
      const info=SIM_ED.schemaInfosCrosstalk(aggrNet);
      if(info){
        if(info.swing!=null){
          SIM.saisie.swing=info.swing;
          const swEl=simEl("simSwing");
          if(swEl)swEl.value=simNbLibre(info.swing);
        }
        if(info.marge!=null){
          SIM.saisie.marge=info.marge;
          const mgEl=simEl("simMarge");
          if(mgEl)mgEl.value=simNbLibre(info.marge);
        }
        simBruitAbsEcrire();
        if(info.driver&&typeof SIM_ED.astuce==="function"){
          SIM_ED.astuce("⚡ Schéma : agresseur "+info.driver+" ("+info.swing+" V), marge "+info.marge+" mV.");
        }
        simRendre();
      }
    }
  });
  const cases={simXtAdj:["adjacentes","La portée en couches a changé"],
               simXtBandeAuto:["bandeAuto","La déduction de la bande a changé"],
               simXtAgreger:["agreger","L'agrégation des agresseurs a changé"]};
  for(const id of Object.keys(cases))
    pose(id,"onchange",function(){
      SIM_XT.saisie[cases[id][0]]=this.checked;
      jeter(cases[id][1]);
    });
  /* PAS DE `simXtSensBrancher()` ICI : au moment où le panneau s'écrit, la
     fiche ne porte pas encore de carte, donc aucun de ces boutons n'existe.
     C'est `simRendre` qui les branche, par le crochet `apres`. */
}

/* LES DEUX SEULS RÉGLAGES QUI NE RELANCENT RIEN : le sens peint et le profil
   d'espacement. Les deux sont DÉJÀ dans le résultat — le serveur rend NEXT et
   FEXT ensemble, et le profil avec eux —, donc les montrer ou les cacher est
   un geste d'affichage et non un calcul. Tout le reste jette le résultat. */
function simXtSensBrancher(){
  for(const b of document.querySelectorAll("[data-xtsens]"))
    b.onclick=function(){
      SIM_XT.sens=this.getAttribute("data-xtsens");
      simRendre();
    };
  /* LES TROIS CASES DE LA FIGURE. Elles refont la fiche et rien d'autre : le
     canevas ne les regarde pas — ce qu'il peint dépend des boutons
     « peindre » et des cases de victimes, pas de ce qui est TRACÉ dans le
     panneau. Le redessiner pour rien se verrait sur une carte dense. */
  for(const b of document.querySelectorAll("[data-xtvoir]"))
    b.onchange=function(){
      if(!SIM_XT.courbes)SIM_XT.courbes={next:true, fext:true, volts:true};
      SIM_XT.courbes[this.getAttribute("data-xtvoir")]=this.checked;
      simRendre();
    };
  const e=simEl("simXtVoirEsp");
  if(e)e.onclick=function(){
    SIM_XT.espacement=!SIM_XT.espacement;
    simRendre();
  };
  const z=simEl("simXtVoirRisques");
  if(z)z.onclick=function(){
    SIM_XT.risques=!SIM_XT.risques;
    /* ELLE VIT SUR LA CARTE, PAS DANS LE PANNEAU : il faut repeindre le
       canevas, pas seulement refaire la fiche. */
    simRendre();
    if(SIM_ED&&typeof SIM_ED.redessiner==="function")SIM_ED.redessiner();
  };
  /* LA RÉGLETTE NE REFAIT PAS LA FICHE, et c'est tout son intérêt : elle
     déplace un trait, quelques cercles et deux lignes de texte. Un rendu
     complet par cran serait un panneau entier réécrit à chaque pixel
     parcouru — la courbe des paramètres S évite déjà exactement cela. */
  const ch=simEl("simXtVoirChaleur");
  if(ch)ch.onclick=function(){
    SIM_XT.chaleur=!SIM_XT.chaleur;
    /* ELLE VIT SUR LA CARTE, PAS DANS LE PANNEAU : il faut repeindre le
       canevas, et refaire la fiche pour que le bouton change d'état. */
    simRendre();
    if(SIM_ED&&typeof SIM_ED.redessiner==="function")SIM_ED.redessiner();
  };
  const g=simEl("simXtPos");
  if(g)g.oninput=function(){simXtCurseurPoser(+this.value);};
  /* COCHER, EN REVANCHE, REFAIT LA FICHE. Éteindre une victime change les
     voies du schéma, l'échelle des deux graphes et la lecture chiffrée : tout
     est à redessiner, et le résultat, lui, ne bouge pas. Le canevas suit —
     les plages peintes sur le cuivre sont les mêmes victimes. */
  for(const b of document.querySelectorAll("[data-xtvic]"))
    b.onchange=function(){
      const net=this.getAttribute("data-xtvic");
      if(!SIM_XT.caches)SIM_XT.caches={};
      /* ON ÉCRIT LES DEUX ÉTATS, jamais un oubli : « montrée à la main » et
         « jamais touchée » ne veulent pas dire la même chose depuis qu'une
         candidate sous le seuil s'allume ou non selon le reste de la fiche. */
      SIM_XT.caches[net]=!this.checked;
      simRendre();
      if(SIM_ED&&typeof SIM_ED.redessiner==="function")SIM_ED.redessiner();
    };
}

/* LES CHAMPS SONT LUS EN NOMBRES, PAS EN TEXTE, et l'état ne contient QUE des
   nombres. C'est la même règle que `simSaisie` : la virgule décimale est une
   affaire d'affichage, et laisser une chaîne « 0,75 » filer jusqu'au JSON
   envoyé au serveur donnerait un réglage que Python lit comme absent — sans
   erreur, sans message, avec le seuil par défaut à la place de celui qu'on
   croit avoir posé.

   UN CHAMP VIDE N'EST PAS UNE SAISIE ILLISIBLE : c'est une INTENTION, et elle
   vaut zéro pour les deux seuils de l'étape 0a — « déduis-le ». Une saisie
   illisible, elle, retombe sur la valeur précédente. */
function simXtSaisie(){
  const lu=(id,defaut,videZero)=>{
    const e=simEl(id);
    if(!e)return defaut;
    const txt=String(e.value).trim();
    if(!txt)return videZero?0:defaut;
    const v=parseFloat(txt.replace(",","."));
    return isFinite(v)?v:defaut;
  };
  const s=SIM_XT.saisie;
  s.distance=lu("simXtDist",s.distance,true);
  s.longueur=lu("simXtLong",s.longueur,true);
  s.seuil=lu("simXtSeuil",s.seuil);
  s.z0=lu("simXtZ0",s.z0);
  s.beta=lu("simXtBeta",s.beta);
  s.pad=lu("simXtPad",s.pad);
  s.resolution=lu("simXtRes",s.resolution,true);
  s.ecartV=lu("simXtEcartV",s.ecartV);
  s.asym=lu("simXtAsym",s.asym);
  s.desaccord=lu("simXtDesac",s.desaccord);
  s.risque=lu("simXtRisque",s.risque);
  const v=simEl("simXtVit");
  if(v)s.vitesses=v.value;
  const f=simEl("simXtFen");
  if(f)s.fenetre=f.value;
  return s;
}

function simXtSaisieEcrire(){
  const s=SIM_XT.saisie;
  const met=(id,v)=>{const e=simEl(id);if(e)e.value=v;};
  /* LES DEUX SEUILS DE L'ÉTAPE 0a RESTENT VIDES QUAND ILS VALENT ZÉRO : zéro
     n'est pas une distance, c'est « déduis-la ». Y écrire 0 ferait croire à un
     seuil nul, donc à une présélection qui ne retiendrait rien. */
  met("simXtDist",s.distance?simNbLibre(s.distance):"");
  met("simXtLong",s.longueur?simNbLibre(s.longueur):"");
  met("simXtSeuil",simNbLibre(s.seuil));
  met("simXtZ0",simNbLibre(s.z0));
  met("simXtBeta",simNbLibre(s.beta));
  met("simXtPad",String(Math.round(s.pad)));
  /* MÊME RÈGLE QUE LES SEUILS DE L'ÉTAPE 0a : zéro n'est pas une résolution,
     c'est « je n'en demande aucune ». L'écrire ferait croire à une exigence
     de zéro millimètre, que rien ne peut tenir. */
  met("simXtRes",s.resolution?simNbLibre(s.resolution):"");
  met("simXtEcartV",simNbLibre(s.ecartV));
  met("simXtAsym",simNbLibre(s.asym));
  met("simXtDesac",simNbLibre(s.desaccord));
  met("simXtRisque",simNbLibre(s.risque));
  met("simXtVit",s.vitesses||"");
  const f=simEl("simXtFen");
  if(f)f.value=s.fenetre;
  for(const [id,cle] of [["simXtAdj","adjacentes"],
                         ["simXtBandeAuto","bandeAuto"],
                         ["simXtAgreger","agreger"]]){
    const e=simEl(id);
    if(e)e.checked=!!s[cle];
  }
}

/* ==========================================================================
   LE PROBLÈME, ET SON ENVOI
   ========================================================================== */
/* L'outil décrit le cuivre ; ce fichier n'y touche pas. `problemeCrosstalk`
   est FACULTATIF dans l'adaptateur : un outil qui ne le déclare pas voit
   l'onglet dire pourquoi il ne calcule pas, plutôt qu'une page vide. C'est la
   même règle que `cuivreDC` pour l'analyse de chute. */
function simXtProbleme(){
  if(!SIM_ED||typeof SIM_ED.problemeCrosstalk!=="function"){
    SIM_XT.err="Cet outil ne sait pas décrire de problème de crosstalk.\n"+
      "Il lui faut, en plus de la géométrie : les positions des vias de "+
      "couture le long du parcours, les discontinuités du plan de référence, "+
      "et les vias de masse. Sans eux, les contrôles de plan de masse ne "+
      "diraient rien — et une liste vide se lit « rien à signaler ».";
    return null;
  }
  const p=SIM_ED.problemeCrosstalk(simSaisie());
  if(!p||p.erreur){
    SIM_XT.err=((p&&p.erreur)||"Rien à analyser.")+
               ((p&&p.conseil)?"\n"+p.conseil:"");
    return null;
  }
  const doc=p.doc;
  doc.format=SIM_XT_FORMAT;
  doc.source=SIM_ED.outil||"";
  doc.reference_nets=simRefListe();
  doc.reglages=simXtReglages();
  /* RIEN D'AUTRE N'ENTRE ICI, et surtout aucune matrice : le serveur refuse
     un document qui porterait un `touchstone`, des `ports` ou un
     `mapping_confirme`. Le refus est délibéré — ignorer ces champs ferait
     croire à la page que son fichier a été calculé, alors que la carte
     viendrait d'ailleurs. */
  SIM_XT.err="";
  return p;
}

/* Oublier le résultat de crosstalk, et dire s'il y en avait un.

   LES RÉGLAGES SURVIVENT, la CARTE non : elle décrit un parcours, et changer
   de sélection change le parcours. */
function simXtOublier(){
  const avait=!!SIM_XT.res;
  SIM_XT.res=null; SIM_XT.doc=null;
  return avait;
}

async function simXtGo(){
  if(SIM_XT.occupe)return;
  SIM_XT.res=null; SIM_XT.err=""; simRendre();
  const p=simXtProbleme();
  if(!p){simRendre();return;}
  SIM_XT.occupe=true; simProgresDemarrer(); simRendre();
  try{
    const res=await simXtLancer(p.doc);
    SIM_XT.res=res; SIM_XT.doc=p.doc; SIM_XT.portee=p.portee||"";
    /* LA BANDE DÉDUITE REVIENT DANS LES CHAMPS. Un réglage calculé ailleurs et
       jamais montré est un réglage qu'on ne peut pas contredire : on lirait
       « 59 GHz » sous la carte et « 5 GHz » dans le panneau, et l'on croirait
       à un bug. Écrite ici, elle se corrige à la main comme n'importe quelle
       autre — décocher la case fige simplement la dernière déduction.
       ÉCRITURE DIRECTE, SANS `oninput` : jeter le résultat qu'on vient de
       recevoir parce qu'on affiche ses propres réglages serait absurde. */
    if(res&&res.bande_deduite){
      SIM.saisie.f2=res.bande_deduite.f_max;
      SIM.saisie.points=res.bande_deduite.points;
      simSaisieEcrire();
    }
  }catch(e){
    SIM_XT.err=e.message||String(e);
  }finally{
    SIM_XT.occupe=false;
    simProgresFini();
    simRendre();
  }
}

/* ==========================================================================
   LA FICHE
   --------------------------------------------------------------------------
   L'ORDRE DE LECTURE EST CELUI DE LA CONFIANCE, et il est l'inverse de l'ordre
   du calcul. Ce qui pourrait rendre tout le reste faux vient EN PREMIER — une
   matrice non passive, une bande trop étroite, un couplage vertical que le
   réseau ne sait pas modéliser —, ensuite la carte et son recoupement avec la
   géométrie, ensuite les deux tableaux qui disent ce qui a été regardé, et les
   hypothèses en dernier. Mettre la carte en tête ferait lire de belles
   couleurs avant d'apprendre qu'elles ne veulent rien dire.
   ========================================================================== */
function simRendreCrosstalk(){
  if(SIM_XT.occupe)
    return simProgres("Présélection géométrique, profils d'espacement, puis "+
      "matrice S multi-ports synthétisée, puis transformée vers l'axe de "+
      "position.");
  if(SIM_XT.err&&!SIM_XT.res)
    return '<p class="simErr">'+simEsc(SIM_XT.err)+"</p>";
  if(!SIM_XT.res)
    return '<p class="simEtat">Sélectionnez la piste AGRESSEUR, puis '+
      "analysez.<br><small>C'est le seul geste demandé : ses victimes sont "+
      "trouvées toutes seules, les ports posés tout seuls, et la carte dit "+
      "<b>où</b>, le long du parcours, le couplage se fabrique — là où "+
      "les tableaux disent <b>combien</b> il vaut, en pour-cent comme en "+
      "volts. Le réseau multi-ports est synthétisé à partir du DESIGN : il n'y "+
      "a aucun fichier à importer.</small></p>";
  const r=SIM_XT.res;
  let h="";
  if(SIM_XT.err)h+='<p class="simErr">'+simEsc(SIM_XT.err)+"</p>";
  /* TROIS CHOSES À L'ÉCRAN, ET LE RESTE SE DÉPLIE. Le verdict, ce qui le rend
     douteux, la carte. Une fiche qui déroule tout met la matrice non passive
     et un écart de vitesse de 0,3 % sur la même ligne, et se lit alors en
     diagonale — c'est-à-dire pas du tout. Ce qui a été regardé ne DISPARAÎT
     pas pour autant : chaque bloc est là, replié, et le bouton « rapport »
     l'écrit en entier dans un fichier. */
  h+=simXtResume(r);
  h+=simXtActions(r);
  h+=simXtReserves(r);
  h+=simXtCarte(r);
  h+=simXtRepli("Le recoupement, pic par pic",simXtDesaccords(r))+
     simXtRepli("Étape 0a — ce qui longe, et ce qui a été écarté",
                simXtTableauCandidats(r))+
     simXtRepli("Étape 0b — ce qui couple, victime par victime",
                simXtTableauCouples(r))+
     simXtRepli("Tous les avertissements",simXtAvertissements(r))+
     simXtRepli("Ce que la matrice vérifie",simXtValidation(r))+
     simXtRepli("Le plan de référence",simXtMasse(r))+
     /* CES DEUX-LÀ SE REPLIENT DÉJÀ TOUT SEULS : les envelopper une seconde
        fois demanderait deux clics pour un seul contenu. */
     simXtMapping(r)+simXtHypotheses(r);
  return h;
}

/* UN BLOC REPLIÉ. Vide, il ne pose même pas son titre : un dépliant qui ne
   contient rien se déplie une fois, et l'on cesse d'ouvrir les autres. */
function simXtRepli(titre,corps){
  if(!corps)return "";
  return '<details class="simXtHyp"><summary>'+simEsc(titre)+
         "</summary>"+corps+"</details>";
}

/* ==========================================================================
   LE RÉSUMÉ, ET CE QU'IL A LE DROIT DE DIRE
   --------------------------------------------------------------------------
   LA SEULE CONVENTION EST CELLE DE L'UTILISATEUR. Un niveau de risque tiré
   d'un barème maison — « au-delà de −20 dB c'est grave » — serait un chiffre
   inventé posé au-dessus d'un calcul honnête, et c'est exactement le genre de
   verdict qu'on refuse ailleurs dans cette section. On compare donc le
   couplage au BUDGET DE BRUIT que l'utilisateur s'est donné dans la rangée
   « Signal », et la fiche dit d'où il vient. Le reste est arithmétique : un
   couplage en décibels EST un rapport, −26 dB valent 5 % de l'agresseur, et
   cela ne demande de connaître ni l'amplitude ni la technologie.

   ET IL SE DIT EN VOLTS, PARCE QUE C'EST CE QUI SE VÉRIFIE. Le pour-cent est
   la mesure ; ce qu'une revue de conception compare à une fiche technique,
   c'est une tension. L'amplitude saisie dans la rangée « Signal » convertit
   l'un en l'autre, et la MARGE en millivolts — quand elle est remplie —
   remplace le budget en pourcentage : deux seuils concurrents seraient pires
   que pas de seuil du tout, puisqu'on ne saurait plus lequel a rougi.

   LE VERDICT PORTE SES RÉSERVES. Quand un avertissement grave est levé — la
   matrice n'est pas passive, la fenêtre replie, la carte ne localise rien —,
   le niveau s'affiche « sous réserve » et les réserves sont juste dessous. Un
   niveau seul, sur un calcul dont on sait qu'il est faussé, serait le pire
   affichage de tout l'outil.
   ========================================================================== */
function simXtRatio(db){
  return Math.pow(10,db/20);
}
function simXtNiveau(r){
  const conf=(r.couples||[]).filter(c=>c.confirmee);
  if(!conf.length)
    /* DEUX SILENCES QUI NE SE RESSEMBLENT PAS. « Aucun couple confirmé » est
       un RÉSULTAT : on a simulé, tout tombe sous le seuil. Une présélection
       vide est une ABSENCE de résultat : rien n'a été simulé, et l'afficher
       comme le premier était une bonne nouvelle fabriquée par un seuil
       géométrique. */
    return {cle:r.preselection_vide?"indecis":"aucun",
            nom:r.preselection_vide?"RIEN N’A ÉTÉ SIMULÉ"
                                   :"AUCUN COUPLE CONFIRMÉ",
            pire:null, ratio:0,
            volts:0, budget:simSeuilFraction(), seuil:simSeuilNom()};
  let pire=conf[0];
  for(const c of conf)if(c.pire_db>pire.pire_db)pire=c;
  const ratio=simXtRatio(pire.pire_db);
  /* LE SEUIL VIENT D'ICI ET DE NULLE PART AILLEURS — `simSeuilFraction` : la
     marge du récepteur en millivolts quand elle est saisie, le budget en
     pourcentage sinon. Un barème maison — « au-delà de −20 dB c'est grave » —
     serait un chiffre inventé posé au-dessus d'un calcul honnête. */
  const budget=Math.max(1e-6,simSeuilFraction());
  const cle=ratio>budget?"haut":(ratio>budget/2?"surveiller":"sous");
  return {cle:cle, pire:pire, ratio:ratio, budget:budget,
          /* LE MÊME PIRE, EN VOLTS. C'est le chiffre qu'on porte en revue de
             conception : « 14 mV sur VIC_G » se compare à une fiche technique,
             « 0,42 % » ne se compare à rien. */
          volts:ratio*(SIM.saisie.swing||0), seuil:simSeuilNom(),
          nom:cle==="haut"?"AU-DESSUS DU BUDGET"
             :cle==="surveiller"?"À SURVEILLER"
             :"SOUS LE BUDGET"};
}

/* LA MÉTHODE EN UNE LIGNE, AVEC LES CHIFFRES DE CE CALCUL-CI. Pas une phrase
   de brochure : la bande, le nombre de points et la fenêtre sont ceux qui ont
   servi, et c'est ce qui permet de la relire six mois plus tard sans rouvrir
   le panneau. Quatre étapes, dans l'ordre où elles s'enchaînent — le design,
   la matrice, la transformée, la conversion en position —, parce que c'est
   dans cet ordre que se cherche l'erreur quand un chiffre surprend. */
function simXtMethode(r){
  const b=(r.validation&&r.validation.bande)||{};
  const g=r.reglages||{};
  const fen=g.fenetre==="kaiser"
    ? "Kaiser β "+simNb(g.kaiser_beta,1)
    : (g.fenetre||"rectangulaire");
  return "Méthode : le dessin des pistes → un réseau de lignes couplées mis "+
    "en cascade le long du parcours → sa matrice S multi-ports"+
    (b.f_max?" (du continu à "+simNb(b.f_max/1e9,1)+" GHz, "+b.points+
             " points)":"")+
    " → transformée de Fourier inverse ("+fen+
    ") de ses termes croisés → le retard converti en position par la vitesse "+
    "de chaque tronçon — NEXT : t = τa(x) + τv(x), soit x = v·t/2 à "+
    "vitesses égales ; FEXT : t = τa(x) + τv(L) − τv(x), une loi PLATE à "+
    "vitesses égales, qui ne donne alors aucune position.";
}

/* CE QUE LA DÉDUCTION A FAIT, EN UNE PHRASE, ET SURTOUT LAQUELLE DES TROIS
   BORNES A MORDU : c'est elle qui dit quoi changer. « Plafonnée par le
   modèle » veut dire qu'aucun réglage n'affinera davantage sans mentir ;
   « plafonnée par les points » veut dire qu'on a préféré une carte floue à une
   carte repliée. */
function simXtBandeDite(b){
  const borne={
    "résolution":"c'est la finesse voulue qui la fixe",
    "modèle":"PLAFONNÉE par la validité du modèle quasi-TEM",
    "points":"PLAFONNÉE par le nombre de points — la fenêtre passe avant la "+
             "finesse"}[b.borne]||b.borne;
  return simNb(b.f_max/1e9,2)+" GHz × "+b.points+" points ("+borne+
    ") pour distinguer "+simNb(b.cible,2)+" mm, "+b.source_cible+
    " ; résolution attendue "+simNb(b.atteinte,2)+" mm.";
}

function simXtResume(r){
  const n=simXtNiveau(r);
  const graves=r.graves||[];
  const inex=(r.desaccords||[]).filter(d=>d.verdict==="inexplique").length;
  const rouges=(r.risques||[]).filter(z=>!z.justifie).length;
  let h='<div class="simXtResume simXtN-'+n.cle+'">';
  h+='<div class="simXtVerdict">'+simEsc(n.nom)+
     (graves.length?' <span class="simXtSousRes">sous réserve</span>':"")+
     "</div>";
  if(n.pire)
    /* LE VERDICT SE DIT EN TROIS UNITÉS, ET AUCUNE N'EST DE TROP : le
       pour-cent est la mesure, les VOLTS sont ce que la broche voit, les
       décibels sont ce qui se compare au seuil de confirmation. Le seuil
       nommé à la fin dit contre quoi on a jugé — budget ou marge —, sans quoi
       « AU-DESSUS DU BUDGET » ne serait pas vérifiable. */
    h+="<p>Le pire est <b>"+simEsc(n.pire.victime)+"</b>, qui prend <b>"+
       simNb(100*n.ratio,1)+" %</b> de « "+simEsc(n.pire.agresseur)+" », soit "+
       "<b>"+simEsc(simTension(n.volts))+"</b> sur une amplitude de "+
       simEsc(simTension(SIM.saisie.swing))+" ("+
       simNb(n.pire.pire_db,1)+" dB) — contre "+simEsc(n.seuil)+", soit "+
       simEsc(simTension(n.budget*(SIM.saisie.swing||0)))+".</p>";
  /* RIEN N'A ÉTÉ SIMULÉ N'EST PAS « RIEN NE COUPLE », et c'est le pire des
     deux malentendus que cette fiche pouvait produire : la présélection
     géométrique n'a retenu AUCUNE candidate, il n'y a donc pas eu de matrice
     S, pas de carte, pas de niveau — et la page annonçait pourtant « aucun
     couple confirmé » suivi de « leurs courbes sont tracées quand même »,
     au-dessus d'une figure vide. Le tableau « ce qui longe » dit pourquoi
     chaque candidate a été écartée, et c'est là qu'il faut aller. */
  else if(r.preselection_vide){
    const cands=(((r.etape0||{}).candidats)||[]);
    h+="<p><b>Aucune candidate n’a passé la présélection géométrique</b> : il "+
       "n’y a eu ni matrice S, ni carte, ni niveau de couplage — ce résultat "+
       "ne dit RIEN sur le couplage de cette piste, ni en bien ni en mal. "+
       (cands.length
         ? cands.length+" candidate(s) ont été vues et écartées ; le tableau "+
           "<b>« ce qui longe »</b> ci-dessous donne la raison de chacune, et "+
           "c’est là qu’il faut desserrer un seuil."
         : "Aucune voisine n’a même été vue à portée : élargissez la "+
           "<b>présélection distance</b>, ou vérifiez que la masse est bien "+
           "désignée.")+"</p>";
  }
  else{
    /* « AUCUN COUPLE CONFIRMÉ » N'EST PAS « AUCUN COUPLAGE », et la nuance est
       tout ce qui sépare une bonne nouvelle d'un réglage mal posé. On NOMME
       donc la plus couplée avec son niveau, et l'on rappelle le seuil qui l'a
       écartée : les deux côte à côte disent d'un coup d'œil si l'on est à
       trois décibels du seuil ou à trente. */
    const cand=((r.couples||[]).slice()
                .sort((a,b)=>(b.pire_db||-999)-(a.pire_db||-999)))[0];
    const seuil=(r.reglages||{}).seuil_db;
    h+="<p>Aucune voisine ne dépasse le seuil de confirmation"+
       (seuil!=null&&seuil!==undefined?" de <b>"+simNb(seuil,1)+" dB</b>":"")+
       (cand?", et la plus couplée est <b>"+simEsc(cand.victime)+
        "</b> à <b>"+simNb(cand.pire_db,1)+" dB</b> ("+
        simNb(100*simXtRatio(cand.pire_db),2)+" % de l'agresseur, soit "+
        simEsc(simXtTension(simXtRatio(cand.pire_db)))+")":"")+
       ". Leurs courbes sont tracées <b>quand même</b>, ci-dessous : une "+
       "figure vide se lirait « aucun couplage », alors que le fait est "+
       "« du couplage, sous le seuil que vous avez posé ».</p>";
  }
  h+='<p class="simXtCompte">'+
     ((r.couples||[]).filter(c=>c.confirmee).length)+" victime(s) confirmée(s) "+
     "sur "+(((r.etape0||{}).candidats)||[]).length+" candidate(s) · "+
     simNb(r.longueur,2)+" mm"+
     (inex?" · <b>"+inex+" pic(s) que rien n'explique</b>":"")+
     (rouges?" · "+rouges+" plage(s) rouge(s) sur le cuivre":"")+
     (graves.length?" · <b>"+graves.length+" réserve(s)</b>":"")+
     "</p>";
  h+='<p class="simXtMethode">'+simEsc(simXtMethode(r))+"</p>";
  if(r.bande_deduite)
    h+='<p class="simXtMethode"><b>Bande déduite du dessin</b> — '+
       simEsc(simXtBandeDite(r.bande_deduite))+"</p>";
  return h+"</div>";
}

/* CE QUI CHANGE LA LECTURE, EN UNE LIGNE. Le serveur marque ces
   avertissements-là à la source, au moment où il sait pourquoi ils comptent —
   la page ne les reconnaît pas à leur texte, ce qui finirait par en laisser
   passer un —, et il en donne DEUX longueurs. Le titre s'affiche : on le lit
   en trois secondes, et c'est la seule façon qu'une réserve soit lue. Le texte
   attend, replié, et se retrouve entier dans le rapport exporté.

   UNE RÉSERVE EN SOIXANTE MOTS N'EST PAS LUE, et une réserve non lue vaut une
   réserve absente — le défaut même que toute cette section cherche à ne jamais
   produire. C'est pourquoi la version longue ne DISPARAÎT pas : elle se
   déplie. */
function simXtReserves(r){
  const g=r.graves||[];
  if(!g.length)return "";
  const titre=x=>typeof x==="string"?x:(x.titre||x.texte||"");
  const texte=x=>typeof x==="string"?x:(x.texte||x.titre||"");
  let h='<div class="simXtAvert"><b>'+g.length+" réserve"+
        (g.length>1?"s":"")+"</b> · "+
        simEsc(g.map(titre).join(" · "));
  h+='<details class="simXtPourquoi"><summary>pourquoi, et quoi en faire'+
     "</summary><ul>";
  for(const a of g)
    h+="<li><b>"+simEsc(titre(a))+"</b><br>"+simEsc(texte(a))+"</li>";
  return h+"</ul></details></div>";
}

/* ==========================================================================
   CE QU'IL Y A À FAIRE
   --------------------------------------------------------------------------
   C'EST LA SEULE PARTIE DE LA FICHE QUI SE LIT COMME UNE CONSIGNE, et elle
   n'ajoute rien au calcul : le serveur la construit en relisant ce qu'il a
   déjà mesuré, tourné du côté de la main plutôt que de l'œil. « −13,8 dB à
   12,4 mm » est exact et ne dit pas s'il faut écarter la piste, coudre le
   plan, ou ne rien faire — et c'est pourtant la seule question qu'on se pose
   devant le layout.

   ELLE VIT CÔTÉ SERVEUR ET NON ICI : le fichier exporté et cette fiche
   doivent dire la MÊME chose, et deux listes écrites à deux endroits auraient
   fini par diverger. La page ne fait que la mettre en forme.
   ========================================================================== */
function simXtActions(r){
  const a=r.actions||[];
  if(!a.length)return "";
  let h='<div class="simXtFaire"><b>À faire</b><ol>';
  for(const x of a)
    h+="<li><b>"+simEsc(x.quoi)+"</b> "+simEsc(x.cible)+" — "+
       simEsc(x.ou)+"</li>";
  h+="</ol>";
  h+='<details class="simXtPourquoi"><summary>pourquoi ces gestes-là, et '+
     "dans cet ordre</summary><ul>";
  for(const x of a)
    h+="<li><b>"+simEsc(x.quoi+" "+x.cible+" "+x.ou)+"</b><br>"+
       simEsc(x.pourquoi)+"</li>";
  h+="</ul><p>L'ordre est celui de l'EFFET, pas celui de la gravité : "+
     "écarter une piste sous un pic que le dessin n'explique pas ne changerait "+
     "rien, et ces plages-là passent donc après le plan de référence, qui en "+
     "est la cause probable.</p></details></div>";
  return h;
}

/* Ce qu'on a analysé, et d'où vient la matrice. La SOURCE reste le premier
   renseignement de la fiche, même s'il n'y en a plus qu'une : un résultat sans
   sa provenance ne se vérifie pas, et le jour où l'on se demandera d'où sortait
   ce chiffre, la ligne sera là. */
function simXtBandeau(r){
  const conf=(r.couples||[]).filter(c=>c.confirmee);
  const res=conf.length?conf[0]:null;
  let h='<div class="simXtTete">';
  h+="<b>"+simEsc(r.principal||"—")+"</b> · "+simNb(r.longueur,2)+" mm"+
     /* PAS DE TIRET À LA PLACE DE LA SOURCE. Quand rien n'a été simulé il n'y
        a pas de matrice, donc pas de provenance : écrire « — » entre deux
        séparateurs donne une case vide dont on cherche ce qu'elle aurait dû
        contenir. */
     (r.source?" · "+simEsc(r.source):"");
  h+=" · <b>"+conf.length+"</b> victime"+(conf.length>1?"s":"")+
     " confirmée"+(conf.length>1?"s":"")+" sur "+
     ((r.etape0&&r.etape0.candidats)||[]).length+" candidate(s)";
  /* LA RÉSOLUTION DU FEXT N'EXISTE QUE S'IL A UN AXE. Quand le serveur
     refuse de lui en poser un — sa loi d'arrivée est plate à vitesses
     égales —, « — mm (FEXT) » se lirait comme un chiffre manquant, alors
     que c'est la grandeur elle-même qui n'a pas de sens. */
  if(res&&res.resolution_next)
    h+=" · résolution <b>"+simNb(res.resolution_next,2)+" mm</b> (NEXT), "+
       (res.resolution_fext?simNb(res.resolution_fext,2)+" mm (FEXT)"
                           :"pas d’axe pour le FEXT");
  h+="</div>";
  /* LA RÉSOLUTION EST RÉPÉTÉE SOUS LA CARTE, plus bas. Elle est ici parce
     qu'elle qualifie tout le reste, et là-bas parce que c'est là qu'on la
     compare à ce qu'on croit voir. */
  return h;
}

function simXtAvertissements(r){
  const liste=r.avertissements||[];
  const refus=simXtVitessesRefusees();
  if(!liste.length&&!refus.length)return "";
  let h='<div class="simXtAvert"><b>À lire avant la carte</b><ul>';
  for(const a of liste)h+="<li>"+simEsc(a)+"</li>";
  if(refus.length)
    h+="<li>Vitesse(s) saisie(s) non relisible(s), donc IGNORÉE(S) : "+
       simEsc(refus.join(" ; "))+". Le format attendu est « NET=1.5e8 ».</li>";
  return h+"</ul></div>";
}

/* LE MAPPING EST UN COMPTE RENDU, ET IL PASSE EN FIN DE FICHE. Il n'y a plus
   rien à confirmer : c'est le serveur qui pose les ports à partir de la
   géométrie. Mais il reste AFFICHÉ, replié, et ce n'est pas de la décoration —
   c'est ce qui permet de vérifier que la piste qu'on appelle « la victime de
   gauche » est bien celle que le calcul appelle ainsi, et c'est aussi ce dont
   on a besoin pour relire le .sNp exporté dans un autre outil. */
function simXtMapping(r){
  const m=r.mapping;
  if(!m||!(m.ports||[]).length)return "";
  let h='<details class="simXtHyp"><summary>Les ports du réseau — '+
        (m.fichier_ports||0)+", "+simEsc(m.source||"")+"</summary><p>";
  h+=(m.ports||[]).map(p=>simEsc(p.net||"?")+" "+simEsc(p.bout||"")+
      " = port "+p.index).join(" · ");
  return h+"</p><p class=\"simNote\">Cet ordre est celui du fichier .sNp "+
     "exporté : les N bouts proches d'abord, les N bouts lointains ensuite. "+
     "C'est la seule chose qu'un Touchstone ne dit pas de lui-même, et c'est "+
     "pour cela qu'elle est écrite ici comme en tête du fichier.</p></details>";
}

/* ==========================================================================
   LA CARTE
   --------------------------------------------------------------------------
   DEUX COURBES PAR VICTIME, TOUTES SUR LE MÊME AXE. C'est ce qui permet de
   comparer deux victimes d'un coup d'œil : un pic à la même abscisse sur deux
   d'entre elles désigne un accident du plan, un pic sur une seule désigne le
   tracé de cette victime-là. Les aligner est donc la moitié de l'intérêt, et
   c'est pourquoi le serveur les rend sur un axe commun plutôt que chacune sur
   le sien. La PISTE, elle, n'est pas dans le panneau : la chaleur se peint le
   long du vrai cuivre et le point de la réglette s'y promène — voir « LA
   FIGURE », plus bas, au-dessus de `simXtCarte`.

   LES ZONES DE VIGILANCE SE SUPERPOSENT, en bandes translucides par-dessus les
   cellules. Elles ne sont PAS du couplage — elles ne sortent pas de la matrice
   S — et c'est pour cela qu'elles sont hachurées et non colorées : un pic de
   couplage à la même abscisse qu'un trou de couture n'est plus un mystère,
   mais les deux restent deux mesures différentes.

   ÉCRIT EN SVG, comme la courbe des paramètres S : il se redimensionne avec le
   panneau sans qu'on ait à écouter quoi que ce soit, et un point de courbe
   reste un point qu'on peut survoler. Les colonnes sont ramenées à
   SIM_XT_COLONNES par le MAXIMUM de chaque case — jamais par la moyenne, qui
   effacerait justement les pics qu'on est venu voir. */
const SIM_XT_COLONNES=200;      // cellules affichées ; au-delà, c'est du DOM

/* CINQ ARRÊTS, ET NON TROIS. La rampe du budget de bruit n'en a que trois —
   bleu, violet, rouge — parce qu'elle gradue TROIS états nommés : négligeable,
   la moitié du budget, le budget crevé. Celle-ci ne nomme rien : elle rend une
   quantité continue le long d'un cuivre, et trois arrêts y font des plages
   franches là où la grandeur, elle, varie doucement — on lit des marches qui
   n'existent pas. Le bas est un bleu SOMBRE et non vif : la piste où il ne se
   passe rien doit rester du cuivre qu'on reconnaît, pas un trait de couleur.

   CE N'EST PAS LA MÊME ÉCHELLE QUE LE BUDGET, et c'est voulu : ici le rouge
   est le maximum de LA CARTE, un fait de ce calcul-ci, et non un seuil que
   l'utilisateur s'est donné. Les deux ne doivent donc pas se ressembler au
   point qu'on lise l'une pour l'autre. */
const SIM_XT_RAMPE=[[ 38, 66,116],   // presque rien : bleu de nuit
                    [ 42,134,214],   // bleu
                    [ 46,196,170],   // turquoise
                    [222,198, 70],   // jaune
                    [232, 68, 58]];  // le maximum de la carte : rouge
function simXtCouleur(t){
  const r=Math.max(0,Math.min(1,t));
  const n=SIM_XT_RAMPE.length-1;
  const i=Math.min(n-1,Math.floor(r*n));
  const k=r*n-i, p=SIM_XT_RAMPE[i], q=SIM_XT_RAMPE[i+1];
  return "rgb("+p.map((x,j)=>Math.round(x+(q[j]-x)*k)).join(",")+")";
}

/* Le maximum par case : on garde le pic, jamais sa moyenne. */
function simXtReduire(valeurs,n){
  if(valeurs.length<=n)return valeurs.slice();
  const out=new Array(n).fill(0);
  for(let i=0;i<valeurs.length;i++){
    const k=Math.min(n-1,Math.floor(i*n/valeurs.length));
    if(valeurs[i]>out[k])out[k]=valeurs[i];
  }
  return out;
}

/* L'ESPACEMENT SE RÉDUIT PAR LE MINIMUM, à l'inverse du couplage qui se réduit
   par le maximum — et c'est la même règle vue des deux côtés : dans une case
   qui couvre plusieurs dixièmes de millimètre, ce qui compte est le PIRE, et
   le pire d'un espacement est le plus PETIT. Réduire par la moyenne effacerait
   le resserrement qu'on est justement venu recouper avec le pic.

   UNE CASE OÙ RIEN NE LONGE RESTE VIDE (null), et surtout pas à zéro : le
   trait doit s'INTERROMPRE là, parce qu'un pic de couplage dans un trou du
   profil est le plus fort des désaccords. */
function simXtReduireEsp(valeurs,n){
  const out=new Array(n).fill(null);
  for(let i=0;i<valeurs.length;i++){
    const v=valeurs[i];
    if(v===null||v===undefined)continue;
    const k=Math.min(n-1,Math.floor(i*n/valeurs.length));
    if(out[k]===null||v<out[k])out[k]=v;
  }
  return out;
}

/* LE TRAIT D'ESPACEMENT D'UNE VICTIME, posé sur SA courbe de NEXT.

   L'AXE EST INVERSÉ, ET C'EST DÉLIBÉRÉ : le trait MONTE quand les deux pistes
   se RAPPROCHENT. Un resserrement se lit alors au même endroit et dans le même
   sens qu'un pic de couplage, et le recoupement se fait à l'œil sans avoir à
   retourner mentalement une des deux courbes. La légende le dit, parce qu'un
   axe inversé qui ne s'annonce pas est un piège.

   L'ÉCHELLE EST CELLE DE CETTE VICTIME-LÀ, pas une échelle commune : ce qu'on
   cherche est la FORME du profil sous le pic, pas la comparaison des
   espacements de deux victimes — le tableau de l'étape 0a la donne en
   millimètres, et bien mieux qu'un trait.

   IL RESTE, MÊME DEPUIS QUE LA PISTE S'ÉCARTE AVEC L'ÉCART. Le schéma du haut
   dit l'espacement par la GÉOMÉTRIE — la victime s'éloigne quand elle
   s'éloigne —, ce qui se lit d'un coup d'œil mais ne se recoupe pas au
   millimètre avec un pic situé plus bas, dans un autre bloc. Superposé à la
   courbe elle-même, le trait répond à la question exacte : « ce pic-là
   tombe-t-il sur un resserrement ? » */
function simXtTraitEspacement(fiche,n,y,H,W,MG){
  if(!fiche||!fiche.valeurs)return "";
  const v=simXtReduireEsp(fiche.valeurs,n);
  const bas=fiche.min, haut=fiche.max;
  const HA=Math.max(6,H-6);
  const yDe=e=>{
    if(!(haut>bas))return y+3+HA/2;
    return y+3+HA*(e-bas)/(haut-bas);   // petit écart -> HAUT de la bande
  };
  let h="", morceau=[];
  const vider=()=>{
    if(morceau.length>1)
      h+='<polyline class="simXtEsp" points="'+morceau.join(" ")+'"/>';
    else if(morceau.length===1)
      h+='<circle class="simXtEspPt" cx="'+morceau[0].split(",")[0]+
         '" cy="'+morceau[0].split(",")[1]+'" r="1.6"/>';
    morceau=[];
  };
  for(let i=0;i<n;i++){
    if(v[i]===null||v[i]===undefined){vider();continue;}
    morceau.push(simXY(MG+(i+0.5)*W/n)+","+simXY(yDe(v[i])));
  }
  vider();
  return h;
}

/* ==========================================================================
   LA FIGURE : LES DEUX COURBES, ET LA RÉGLETTE QUI SORT SUR LE CUIVRE
   --------------------------------------------------------------------------
   CE QUE LA FIGURE PRÉCÉDENTE NE DISAIT PAS. Une rangée par victime, peinte du
   bleu au rouge, répond très bien à « laquelle prend le plus, et vers quel
   millimètre » — et à rien d'autre. Deux questions restaient sans réponse à
   l'écran :

     · COMBIEN, ICI ? Une carte de chaleur montre OÙ, jamais COMBIEN : on lit
       « c'est rouge », on ne lit pas « 3,0 % ». C'est la même correction que
       la sonde de la chute DC a reçue, et pour la même raison.
     · ET L'AUTRE SENS ? Le NEXT et le FEXT sont dans le MÊME résultat, et l'on
       ne pouvait en voir qu'un à la fois. Or ils ne se lisent pas au même bout
       de la victime : les mettre l'un sous l'autre, sur le même axe, est la
       seule façon de voir que le pic de l'un ne tombe pas où le pic de
       l'autre tombe.

   ET SURTOUT : LA PISTE DE LA VICTIME EST SUR LA CARTE, PAS DANS LE PANNEAU.
   Une première version dessinait un schéma — l'agresseur au milieu, ses
   victimes de part et d'autre, écartées comme l'écart mesuré. C'était joli et
   c'était un DOUBLON : la vraie piste est là, à l'écran, avec ses coudes, ses
   vias et ses voisines, et un dessin approché à côté oblige à faire la
   correspondance de tête — exactement le travail qu'on veut éviter. Le schéma
   est donc parti, et ce qu'il portait est allé sur le cuivre :

     · la CHALEUR se peint le long du cuivre de chaque victime affichée, du
       bleu au rouge, à la place du ruban schématique ;
     · le POINT BLANC de la réglette se promène sur cette piste-là, la vraie,
       en même temps qu'il se pose sur les deux courbes. C'est lui qui fait la
       correspondance « ce pic-ci, c'est CE millimètre-là de CETTE piste »,
       sans qu'on ait à la chercher à la règle.

   ON NE RECONSTRUIT RIEN PAR DÉCALAGE LATÉRAL pour cela : le point vient du
   cuivre réel, PROJETÉ sur le parcours de l'agresseur — la même mécanique que
   les zones à risque, et pour la même raison (voir « LES ZONES À RISQUE,
   POSÉES SUR LE CUIVRE »). Une victime qui longe deux fois porte deux points,
   et c'est juste : elle passe deux fois à cette abscisse-là.

   CE QUI N'A PAS CHANGÉ : les couleurs (la rampe du bruit, la même que
   partout), les hachures des zones de vigilance, les triangles du recoupement,
   la résolution annoncée sous la figure. La lecture s'est déplacée, la mesure
   est la même.
   ========================================================================== */
const SIM_XT_GRAPHE=84;    // hauteur d'un des deux graphes
const SIM_XT_ENTRE=20;     // l'air entre deux blocs, titre compris
const SIM_XT_PIED=30;      // l'axe des positions, sous le second graphe

/* L'IDENTITÉ D'UNE VICTIME NE SE PREND PAS DANS LA RAMPE DE CHALEUR. Le bleu,
   le violet et le rouge veulent dire « combien » : s'en servir pour dire
   « laquelle » ferait lire une amplitude là où il n'y a qu'un nom. Ces six
   teintes-là sont donc hors rampe — un vert, un ambre, un rose, un cyan, une
   lavande, une orange —, et le TIRETÉ double l'information pour qui ne
   distingue pas deux d'entre elles.

   PAS DE BLANC NON PLUS, et c'est un vrai défaut corrigé : le trait
   d'espacement EST blanc, comme le point de la réglette, et une victime
   blanche sur le graphe du NEXT se confondait avec le témoin géométrique posé
   au même endroit — la seule courbe de la figure qui ne soit pas du
   couplage. */
const SIM_XT_IDENT=["#5ad1a0","#f0b429","#ff8bd0","#8ee6f0","#b3a1ff","#ff9d6b"];
const SIM_XT_TIRETS=["","7 4","2 3","10 3 2 3","1 4","6 3 1 3"];

/* Le repère de la figure, gardé pour la réglette : sans lui, bouger le curseur
   demanderait de refaire tout le dessin — donc de réécrire le DOM à chaque
   pixel parcouru. C'est la même raison qui garde `SIM_REPERE` pour la courbe
   des paramètres S. */
let SIM_XT_REPERE=null;

/* UNE FICHE PAR VICTIME, SES DEUX SENS ENSEMBLE. Le serveur rend une ligne par
   (victime, sens) parce que ce sont deux transformées ; la figure, elle, se lit
   victime par victime — décocher « VIC_G » doit éteindre ses deux courbes ET
   sa piste sur le cuivre d'un seul geste. */
function simXtFiches(r){
  const c=(r&&r.carte_chaleur)||{};
  const parNet={}, ordre=[];
  for(const l of (c.lignes||[])){
    let f=parNet[l.victime];
    if(!f){
      f=parNet[l.victime]={net:l.victime, agresseur:l.agresseur||"",
                           next:null, fext:null, couple:null, esp:null};
      ordre.push(f);
    }
    f[l.sens==="fext"?"fext":"next"]=l;
  }
  const esp=c.espacements||{};
  const caches=SIM_XT.caches||{};
  ordre.forEach(function(f,k){
    f.esp=esp[f.net]||null;
    f.couple=((r&&r.couples)||[]).filter(x=>x.victime===f.net)[0]||null;
    f.cote=(f.couple&&f.couple.cote)||"";
    f.couleur=SIM_XT_IDENT[k%SIM_XT_IDENT.length];
    f.tiret=SIM_XT_TIRETS[k%SIM_XT_TIRETS.length];
    /* CONFIRMÉE OU NON, LA COURBE EXISTE. Le serveur trace désormais toutes
       les candidates : « aucun couple confirmé » avec une figure vide se lit
       « aucun couplage », alors que le fait est « du couplage, sous le seuil
       que vous avez posé ». L'étiquette est portée par la ligne elle-même —
       c'est elle qui a été tracée —, et le couple ne sert que de repli pour un
       résultat d'avant ce changement. */
    f.confirmee=(f.next&&f.next.confirmee!==undefined)?!!f.next.confirmee
               :((f.fext&&f.fext.confirmee!==undefined)?!!f.fext.confirmee
                 :!!(f.couple&&f.couple.confirmee));
  });
  /* CE QUI S'ALLUME TOUT SEUL. Une figure qui montre d'emblée neuf candidates
     dont une seule compte est illisible ; une figure VIDE parce que rien
     n'atteint le seuil est pire, puisqu'elle se lit comme une bonne nouvelle.
     La règle tranche les deux cas : les confirmées s'allument, les autres
     attendent leur case — SAUF quand aucune n'est confirmée, et alors tout
     s'allume, parce que c'est justement là qu'il faut voir ce qu'il y a.
     UNE CASE TOUCHÉE PREND LE DESSUS, dans les deux sens : `false` veut dire
     « montrée à la main », et ce n'est pas la même chose que « jamais
     décidée ». */
  const uneConf=ordre.some(f=>f.confirmee);
  for(const f of ordre){
    const dit=caches[f.net];
    f.visible=(dit===true)?false:((dit===false)?true:(f.confirmee||!uneConf));
  }
  return ordre;
}

/* UN POURCENTAGE QUI NE S'ARRONDIT PAS À ZÉRO. Deux décimales suffisaient tant
   que la figure ne montrait que des victimes confirmées ; une candidate sous le
   seuil, elle, prend couramment quelques millièmes de pour-cent, et « 0,00 % »
   se lit alors comme « rien » — ce qui est exactement le contresens que ces
   courbes-là sont venues corriger. Le nombre de décimales suit donc l'ordre de
   grandeur, et sous le dernier cran on écrit l'inégalité plutôt qu'un zéro.
   LES DÉCIBELS À CÔTÉ NE SUFFISENT PAS : ils disent le même fait dans une autre
   échelle, et c'est le pour-cent qu'on compare au budget. */
function simXtPct(v){
  const p=100*Math.max(0,v||0);
  if(!(p>0))return "0";
  if(p<0.0001)return "< 0,0001";
  return simNb(p,p>=1?2:(p>=0.1?3:4));
}

/* ==========================================================================
   LE MÊME CHIFFRE EN VOLTS, ET C'EST CELUI QU'ON COMPARE À QUELQUE CHOSE
   --------------------------------------------------------------------------
   CE QUE LE POUR-CENT NE DIT PAS. « VIC_G prend 0,42 % de CLK » est exact et
   ne décide rien : un récepteur ne connaît pas les pour-cent, il connaît la
   distance entre la tension qui lui arrive et son seuil de basculement. Le
   même 0,42 % vaut 14 mV sur un LVCMOS 3,3 V — invisible devant 700 mV de
   marge — et 1,5 mV sur un LVDS 350 mV, où la marge est de 50 : sans volts, la
   fiche ne permet pas de trancher entre ces deux situations.

   LA TENSION EST UN PRODUIT, ET LE FACTEUR VIENT DU PANNEAU. Le serveur ne
   sait rien de l'amplitude et n'a pas à le savoir : il rend des rapports, et
   c'est bien l'amplitude qui les convertit. Le couplage, lui, ne bouge pas
   d'un pour-cent quand on passe de 3,3 V à 1,8 V — ce qui bouge, c'est le
   bruit en volts, et donc le verdict.

   ELLE VARIE LE LONG DE LA COURBE, comme le pour-cent : c'est la MÊME courbe
   dans une autre unité, et non une seconde mesure. Ce qui la fait bouger d'un
   millimètre à l'autre, ce sont les pistes elles-mêmes — leur écart, leur
   longement, le plan sous elles.
   ========================================================================== */
function simXtTension(fraction){
  return simTension(SIM.saisie.swing*Math.max(0,fraction||0));
}

/* LA COULEUR D'UNE VICTIME, DEPUIS N'IMPORTE OÙ. Le cuivre se peint hors de la
   fiche — au moment du redessin, pas au moment du rendu —, et il doit désigner
   la même victime de la même couleur que la case cochée. Un second tableau de
   couleurs quelque part aurait fini par diverger du premier. */
function simXtCouleurVictime(net){
  const f=simXtFiches(SIM_XT.res||{}).filter(x=>x.net===net)[0];
  return f?f.couleur:SIM_XT_IDENT[0];
}

/* EXACTEMENT n VALEURS, NI PLUS NI MOINS. Les deux courbes et le curseur
   partagent un seul index : une courbe plus courte d'un point que sa voisine
   décalerait le point lu d'un millimètre, en silence. */
function simXtEchant(valeurs,n){
  const v=simXtReduire(valeurs||[],n);
  while(v.length<n)v.push(v.length?v[v.length-1]:0);
  return v.slice(0,n);
}
function simXtEchantEsp(valeurs,n){
  const v=simXtReduireEsp(valeurs||[],n);
  while(v.length<n)v.push(null);
  return v.slice(0,n);
}

/* LES CASES À COCHER, AVEC CE QUE CHAQUE VICTIME PREND. Une case nue ferait
   cocher au hasard : le chiffre est là pour qu'on sache laquelle on éteint.
   Les deux sens sont donnés côte à côte, et le PIRE DES DEUX à côté d'eux —
   jamais leur somme. Le NEXT s'observe au bout PROCHE de la victime, le FEXT à
   son bout LOINTAIN : ils n'arrivent pas au même endroit et ne s'additionnent
   nulle part. Une case « total » les additionnerait à l'œil, et ce total
   n'existe sur aucune broche. */
function simXtCoches(fiches){
  if(!fiches.length)return "";
  const volts=v=>simXtVu("volts")
    ? ' <b class="simXtV">'+simEsc(simXtTension(v))+"</b>" : "";
  let h='<div class="simXtVicts">';
  for(const f of fiches){
    const mN=(f.next&&f.next.max)||0, mF=(f.fext&&f.fext.max)||0;
    const dbN=f.next?f.next.max_db:null, dbF=f.fext?f.fext.max_db:null;
    h+='<label class="simXtCoche'+(f.visible?"":" simXtOff")+
       (f.confirmee?"":" simXtSousSeuil")+'" title="'+
       simEsc("Allumer ou éteindre « "+f.net+" » : ses deux courbes, sa "+
              "chaleur peinte sur le cuivre, son point de réglette et ses "+
              "plages à risque. Le calcul, lui, ne bouge pas — c'est un geste "+
              "d'affichage."+
              "\nLES DEUX SENS Y RESTENT CHIFFRÉS même quand l'un des deux "+
              "n'est plus tracé : c'est ce chiffre-là qui dit s'il vaut la "+
              "peine d'être rallumé."+
              (f.confirmee?"":"\nCELLE-CI EST SOUS LE SEUIL DE CONFIRMATION : "+
               "ses courbes sont tracées, mais elle n'est comptée nulle part "+
               "et ne porte ni plage à risque ni pic recoupé — un verdict "+
               "rendu sur du bruit se peindrait à côté des vrais."))+'">'+
       '<input type="checkbox" data-xtvic="'+simEsc(f.net)+'"'+
       (f.visible?" checked":"")+">"+
       '<i style="background:'+f.couleur+'"></i>'+
       "<b>"+simEsc(f.net)+"</b>"+
       (f.confirmee?"":'<span class="simXtSeuilBout">sous le seuil</span>')+
       /* LES VOLTS À CÔTÉ DU POUR-CENT, ET NON À SA PLACE. Le pour-cent dit
          ce que le couplage vaut — il ne dépend que du cuivre —, les volts
          disent ce que le récepteur voit — ils dépendent aussi de l'amplitude
          saisie. Les deux ensemble permettent de repérer d'un coup d'œil une
          amplitude mal saisie : un couplage à 0,4 % qui annoncerait 300 mV
          voudrait dire qu'on a écrit des volts dans un champ de millivolts. */
       /* LES VOLTS SUIVENT LA CASE « mV » DE LA FIGURE : c'est le même geste
          d'affichage, et les laisser ici quand la graduation d'à côté les a
          perdus ferait douter de laquelle des deux cases commande quoi. */
       "<span>NEXT <b>"+simXtPct(mN)+" %</b>"+volts(mN)+
       (dbN!=null?" <small>"+simNb(dbN,1)+" dB</small>":"")+"</span>"+
       "<span>FEXT <b>"+simXtPct(mF)+" %</b>"+volts(mF)+
       (dbF!=null?" <small>"+simNb(dbF,1)+" dB</small>":"")+"</span>"+
       '<span class="simXtPireBout">pire bout <b>'+
       simXtPct(Math.max(mN,mF))+" %</b>"+volts(Math.max(mN,mF))+
       /* LE SEUIL, POSÉ SUR LE PIRE BOUT ET NULLE PART AILLEURS. Le NEXT
          s'observe au bout proche, le FEXT au lointain : marquer les deux
          ferait lire deux dépassements là où il n'y en a qu'un, sur deux
          broches différentes. */
       (Math.max(mN,mF)>simSeuilFraction()
         ? ' <span class="z0ko">&gt; '+simEsc(simSeuilNom())+"</span>":"")+
       "</span>"+
       "</label>";
  }
  return h+"</div>";
}

/* CE QUE LE CURSEUR LIT, EN TOUTES LETTRES. Une carte de chaleur montre OÙ,
   jamais COMBIEN ; c'est cette ligne-ci qui répond « et ICI, ça fait combien ».
   Le pourcentage est celui de l'AGRESSEUR — c'est ce que la rampe de couleurs
   mesure —, et l'écart mesuré est rappelé à côté parce que c'est lui qui
   explique le chiffre, ou ne l'explique pas. */
function simXtLectureLignes(i){
  const R=SIM_XT_REPERE;
  if(!R||!R.fiches.length)
    return '<span class="simFaible">Aucune victime affichée : cochez-en une.'+
           "</span>";
  /* LE POUR-CENT ET LES VOLTS, DANS CET ORDRE. Le premier est la mesure, le
     second est ce qu'elle coûte : c'est le second qu'on compare à la marge du
     récepteur, et c'est pour cela qu'il est en gras à côté. */
  const val=(a)=>(a&&a[i]!=null)
    ? simXtPct(a[i])+" %"+(simXtVu("volts")
        ? ' <b class="simXtV">'+simEsc(simXtTension(a[i]))+"</b>" : "")
    : "—";
  /* ON NE LIT QUE CE QUI EST TRACÉ. Un sens éteint n'a plus de courbe, plus
     de point de réglette et plus d'échelle à l'écran : le chiffrer quand
     même ferait lire une valeur qu'aucun trait ne montre.

     LE GRAPHE DES TENSIONS COMPTE COMME UN TRACÉ, et c'est ce qui rend la
     réglette utile quand on n'a coché que « mV » : les deux sens y sont, sur
     la même échelle, et la lecture les donne tous les deux. Sans cela,
     décocher NEXT et FEXT rendait la réglette muette alors que la figure,
     elle, montrait toujours une courbe. */
  const enVolts=simXtVu("volts");
  let h="";
  if(!simXtVu("next")&&!simXtVu("fext")&&!enVolts)
    h+='<div><span class="simFaible">Les trois graphes sont éteints : il n’y '+
       "a rien à lire ici. La position, elle, vaut toujours pour le point "+
       "posé sur le cuivre.</span></div>";
  for(const f of R.fiches){
    const bouts=[];
    if(simXtVu("next"))bouts.push("NEXT "+val(f.vNext));
    if(simXtVu("fext"))bouts.push("FEXT "+val(f.vFext));
    /* QUAND SEUL LE GRAPHE DES TENSIONS EST ALLUMÉ, c'est lui qui donne la
       lecture : les deux sens, dans l'unité du graphe. Une victime dont le
       serveur n'a pas rendu la ligne FEXT — son axe n'existe pas — n'affiche
       pas un « 0 mV » qui se lirait comme une mesure. */
    if(enVolts&&!simXtVu("next")&&!simXtVu("fext")){
      bouts.push("NEXT "+val(f.vNext));
      if(f.fext)bouts.push("FEXT "+val(f.vFext));
      else bouts.push('FEXT <span class="simFaible">niveau seul, sans '+
                      "position</span>");
    }
    if(!bouts.length)continue;
    h+='<div><i style="background:'+f.couleur+'"></i><b>'+simEsc(f.net)+
       "</b> — "+bouts.join(" · ")+
       (f.espV?(f.espV[i]==null
                 ? ' · <span class="simFaible">ne longe pas ici</span>'
                 : " · écart "+simNb(f.espV[i],3)+" mm")
              :"")+"</div>";
  }
  return h;
}

/* L'ABSCISSE QUE LA RÉGLETTE DÉSIGNE, en millimètres le long du parcours.
   C'est le SEUL état partagé entre la fiche et le cuivre : le panneau la lit
   pour poser ses points, le canevas la lit pour poser le sien, et il n'y a
   qu'un chiffre à tenir juste. */
function simXtPos(){
  const c=SIM_XT.res&&SIM_XT.res.carte_chaleur;
  const axe=(c&&c.axe)||[];
  const total=axe.length?axe[axe.length-1]:0;
  return total*Math.max(0,Math.min(1,SIM_XT.pos||0));
}

/* LE CURSEUR SE DÉPLACE SANS QUE LA FICHE NE SE REDESSINE. Les deux courbes et
   la lecture chiffrée partagent le même index : poser le curseur, c'est
   déplacer un trait, quelques cercles, et réécrire deux lignes de texte.
   Refaire la fiche à chaque cran coûterait un rendu complet par pixel
   parcouru — c'est exactement ce que la courbe des paramètres S évite déjà.

   LE CANEVAS, LUI, SE REDESSINE : le point blanc vit sur le cuivre, et il n'y
   a pas d'autre façon de le déplacer. On ne le fait que si le cran a
   VRAIMENT changé — un « input » arrive à chaque pixel de la poignée, et
   repeindre la carte pour un cran identique se verrait sur une carte dense. */
function simXtCurseurPoser(i){
  const R=SIM_XT_REPERE;
  if(!R)return;
  const n=R.n;
  let k=Math.round(i);
  if(!isFinite(k))k=0;
  k=Math.max(0,Math.min(n-1,k));
  const avant=SIM_XT.pos;
  SIM_XT.pos=(n>1)?k/(n-1):0;
  const x=R.xs[k];
  const trait=simEl("simXtCur");
  if(trait){
    trait.setAttribute("x1",simXY(x));
    trait.setAttribute("x2",simXY(x));
  }
  R.fiches.forEach(function(f,j){
    const pose=(prefixe,ys)=>{
      const e=simEl(prefixe+j);
      if(!e||!ys||ys[k]==null)return;
      e.setAttribute("cx",simXY(x));
      e.setAttribute("cy",simXY(ys[k]));
    };
    pose("simXtPtN-",f.yNext);
    pose("simXtPtF-",f.yFext);
    pose("simXtPtVN-",f.yVN);
    pose("simXtPtVF-",f.yVF);
  });
  const v=simEl("simXtPosVal");
  if(v)v.textContent=simNb(R.total*k/Math.max(1,n-1),2)+" mm";
  const l=simEl("simXtLect");
  if(l)l.innerHTML=simXtLectureLignes(k);
  if(avant!==SIM_XT.pos&&SIM_ED&&typeof SIM_ED.redessiner==="function")
    SIM_ED.redessiner();
}

function simXtCarte(r){
  SIM_XT_REPERE=null;
  const c=r.carte_chaleur;
  if(!c||!c.lignes||!c.lignes.length)
    /* ON N'EN ARRIVE LÀ QUE SI RIEN N'A DE GÉOMÉTRIE EXPLOITABLE — plus
       depuis qu'une candidate sous le seuil garde sa courbe. C'est donc un vrai
       « il n'y a rien à tracer », et non le silence d'un seuil trop haut. */
    return '<div class="simXtBloc"><b>Carte</b><p class="simNote">Aucune '+
      "candidate n'a de profil exploitable : il n'y a pas de courbe à "+
      "tracer. Les deux tableaux ci-dessous disent pourquoi, candidat par "+
      "candidat.</p></div>";
  /* LES LIGNES DU SENS PEINT restent la référence de la légende : c'est de
     leur résolution qu'elle parle, et elle diffère d'un sens à l'autre. */
  const lignes=c.lignes.filter(l=>l.sens===SIM_XT.sens);
  if(!lignes.length){
    /* UN SENS SANS COURBE DIT POURQUOI, ET C'EST UN REFUS MOTIVÉ. Depuis que
       le serveur renonce à poser un axe de position quand la loi d'arrivée est
       plate — le cas du FEXT à vitesses égales —, « Rien dans ce sens-là » se
       lisait comme un défaut de l'outil. La raison vient du serveur, avec les
       chiffres du calcul, et le niveau du sens reste dans les cases. */
    const pourquoi=((r.axes||{})[SIM_XT.sens]||{}).raison||"";
    return '<div class="simXtBloc"><b>Carte</b>'+simXtSensBoutons()+
      '<p class="simNote">Aucune courbe dans ce sens-là'+
      (pourquoi?" : "+simEsc(pourquoi)
              :". Le niveau, lui, reste au tableau des couples.")+"</p></div>";
  }
  const axe=c.axe||[];
  const total=axe.length?axe[axe.length-1]:0;
  const n=Math.max(2,Math.min(SIM_XT_COLONNES,axe.length));
  /* LA FIGURE SE DESSINE À LA LARGEUR DU PANNEAU, comme la courbe des
     paramètres S, et pour la même raison : un viewBox fixe étiré en plein
     écran emporte le texte avec lui — les cotes de 10 px deviennent des 30 px
     et les noms de nets barrent la figure. */
  /* LA MARGE DE DROITE S'OUVRE QUAND L'AXE DES VOLTS Y ENTRE. Le pour-cent
     reste à gauche, la tension passe à droite : un même trait se lit alors
     dans les deux unités sans qu'aucune des deux ne soit une note en bas de
     page. Empilées à gauche comme elles l'étaient, elles ne donnaient qu'UNE
     hauteur — le haut du graphe — et il fallait la réglette pour tout le
     reste. */
  const WT=simLargeurTrace(), MG=112, MD=simXtVu("volts")?62:12;
  const W=Math.max(240,WT-MG-MD);
  const pire=Math.max(1e-12,c.max||0);
  const esp=c.espacements||{};
  const desac=r.desaccords||[];

  const fiches=simXtFiches(r);
  const vus=fiches.filter(f=>f.visible);
  const xs=[];
  for(let i=0;i<n;i++)xs.push(MG+(i+0.5)*W/n);
  for(const f of vus){
    f.vNext=simXtEchant(f.next?f.next.valeurs:[],n);
    f.vFext=simXtEchant(f.fext?f.fext.valeurs:[],n);
    f.espV=f.esp?simXtEchantEsp(f.esp.valeurs,n):null;
  }

  /* LA FIGURE SE REDIMENSIONNE SUR CE QU'ELLE TRACE. Un graphe éteint ne
     laisse pas un blanc à sa place : la hauteur du SVG se recalcule, et la
     courbe qui reste occupe toute la place gagnée. Un cadre qui garderait sa
     taille se lirait comme un graphe vide, c'est-à-dire comme un couplage
     nul — le contresens exact que cette figure existe pour éviter. */
  /* UN GRAPHE SANS AUCUNE COURBE NE SE POSE PAS. Depuis que le serveur refuse
     de poser un axe de position quand la loi d'arrivée est plate — le FEXT à
     vitesses égales, c'est-à-dire le cas ordinaire —, le cadre du sens absent
     se dessinait quand même et ses courbes s'y posaient À PLAT sur l'axe. Un
     trait à zéro se lit « aucun couplage », alors que le fait est « aucune
     POSITION » : le niveau, lui, est mesuré et il est dans les cases. */
  const aLigne=(cle)=>vus.some(f=>f[cle==="fext"?"fext":"next"]);
  const traces=[];
  if(simXtVu("next")&&aLigne("next"))
    traces.push({cle:"next", titre:"NEXT — le bout proche de chaque victime"});
  if(simXtVu("fext")&&aLigne("fext"))
    traces.push({cle:"fext",
                 titre:"FEXT — le bout lointain de chaque victime"});
  /* LE GRAPHE DES TENSIONS EST UN TRACÉ, PAS UNE GRADUATION. « mV » n'écrivait
     jusqu'ici qu'un axe de plus à droite des deux autres : décocher NEXT et
     FEXT laissait donc une figure vide alors que la case des volts était
     cochée — on cherchait la courbe qu'elle promettait. Elle en dessine une
     désormais, et elle apporte ce que les deux autres refusent par
     construction : LE NEXT ET LE FEXT SUR LA MÊME ÉCHELLE. Les deux graphes
     du haut ont chacun la leur — le FEXT vaut souvent une fraction du NEXT et
     deux échelles l'une sous l'autre se comparent mal —, ce qui est juste pour
     suivre un sens et faux pour comparer les deux. Ici l'unité est celle du
     budget de bruit, la hauteur est commune, et le seuil du récepteur est un
     trait unique pour les deux. */
  if(simXtVu("volts"))
    traces.push({cle:"volts",
                 titre:"TENSION — les deux sens sur la même échelle"});
  const yGN=14, PAS=SIM_XT_GRAPHE+SIM_XT_ENTRE+8;
  const HG=yGN+traces.length*SIM_XT_GRAPHE
           +Math.max(0,traces.length-1)*(SIM_XT_ENTRE+8);
  const HT=HG+SIM_XT_PIED;

  let h='<div class="simXtBloc"><b>Carte du couplage</b>'+simXtSensBoutons()+
        simXtVoirCases()+
        simXtBoutonEspacement(esp)+simXtBoutonChaleur()+simXtBoutonRisques(r);
  /* COMMENT LA LIRE, AU-DESSUS D'ELLE ET EN UNE LIGNE. Une figure qu'on doit
     déplier pour comprendre est une figure qu'on ne lit pas : les faits qui
     suffisent — deux courbes par victime, l'axe est le parcours, la couleur
     sur le cuivre est la quantité, le point blanc fait la correspondance —
     tiennent ici, et le reste attend dans le dépliant. */
  const sousSeuil=fiches.filter(f=>!f.confirmee).length;
  /* LA PHRASE DE LECTURE SUIT CE QUI EST TRACÉ. Annoncer « deux courbes par
     victime » au-dessus d'un seul graphe ferait chercher la seconde. */
  /* LA PHRASE SUIT LES GRAPHES QUI SONT LÀ, un par un : elle comptait les
     tracés, ce qui annonçait « deux courbes par victime — le NEXT et le
     FEXT » au-dessus d'un NEXT et d'un graphe de tensions. */
  const sensVus=traces.filter(t=>t.cle!=="volts").map(t=>t.cle);
  const dits=[];
  if(sensVus.length===2)
    dits.push("le <b>NEXT</b> à son bout proche, le <b>FEXT</b> à son bout "+
              "lointain");
  else if(sensVus.length===1)
    dits.push("le <b>"+sensVus[0].toUpperCase()+"</b>, à son bout "+
              (sensVus[0]==="next"?"proche":"lointain")+
              " ; l'autre sens est éteint et se rallume d'un clic");
  if(simXtVu("volts"))
    dits.push("les <b>tensions</b> des deux sens sur une même échelle, en "+
              "millivolts — le seul graphe où ils se comparent");
  /* UN SENS COCHÉ QUE LE SERVEUR N'A PAS RENDU : la phrase le dit avec SA
     raison, sans quoi la case cochée et le graphe absent se contrediraient
     sous les yeux de qui vient de cliquer. */
  for(const cle of ["next","fext"])
    if(simXtVu(cle)&&!aLigne(cle)){
      const pq=((r.axes||{})[cle]||{}).raison||"";
      dits.push("<b>aucune courbe de "+cle.toUpperCase()+"</b>"+
                (pq?" : "+simEsc(pq):" — le serveur n'en a pas rendu"));
    }
  const dit=dits.length ? "Par victime — "+dits.join(" · ") : "";
  h+='<p class="simXtLire">'+dit+(dit?" · d":"D")+
     "e gauche à droite, "+
     "les "+simNb(total,1)+" mm du <b>parcours de l’agresseur</b> · sur la "+
     "carte, la <b>couleur</b> peinte le long de chaque victime dit combien "+
     "de couplage se fabrique à cet endroit-là (bleu&nbsp;: rien, "+
     "rouge&nbsp;: le maximum de la carte) · la <b>réglette</b> pose un point "+
     "blanc sur les courbes ET sur le cuivre de la vraie piste, au même "+
     "millimètre."+
     /* CE QUE LES CASES GRISES CONTIENNENT, dit là où on les voit. Sans cette
        phrase, une case éteinte se lit comme un oubli. */
     (sousSeuil?" · "+sousSeuil+" candidate(s) <b>sous le seuil</b> ont leur "+
      "case elles aussi : elles ne sont comptées nulle part, mais leurs "+
      "courbes existent et se rallument d'un clic.":"")+"</p>";
  h+=simXtCoches(fiches);
  /* LES DEUX SENS ÉTEINTS : ON LE DIT, ON NE DISPARAÎT PAS. Les cases sont
     juste au-dessus, le repère reste vide — la réglette et la lecture
     chiffrée n'auraient rien à interroger —, et un clic ramène la figure. */
  if(!traces.length){
    /* LA RÉGLETTE RESTE, elle : c'est elle qui promène le point blanc sur le
       cuivre, et la chaleur y est toujours peinte. La retirer avec les courbes
       laisserait sur la carte un repère qu'on ne pourrait plus déplacer. */
    const i00=Math.max(0,Math.min(n-1,Math.round((SIM_XT.pos||0)*(n-1))));
    return h+'<p class="simNote">Les trois graphes sont <b>éteints</b> : il '+
      "n’y a rien à tracer. Rallumez <b>NEXT</b>, <b>FEXT</b> ou <b>mV</b> "+
      "ci-dessus — le calcul, lui, n’a pas bougé, les chiffres restent dans "+
      "les cases ci-dessus, et la réglette continue de promener son point sur "+
      "le cuivre.</p>"+
      simXtRegle(n,total,i00,[],vus)+simXtLegende(r,lignes,pire)+"</div>";
  }
  h+='<div class="simXtCarte"><svg viewBox="0 0 '+WT+" "+simXY(HT)+
     '" preserveAspectRatio="xMidYMid meet" role="img" aria-label="'+
     simEsc(traces.map(t=>t.cle.toUpperCase()).join(" et ")+
            " de chaque victime le long du parcours")+
     '">'+simXtHachures();

  /* LES ZONES D'ABORD, ET DERRIÈRE TOUT LE RESTE. Elles ne sortent pas de la
     matrice S : hachurées et posées au fond, elles ne peuvent pas se lire
     comme du couplage, et elles ne masquent pas les courbes qui, elles, le
     mesurent. */
  /* DES HACHURES PARTOUT NE SONT PLUS DES HACHURES : quand les zones de
     vigilance couvrent la moitié du parcours, les peindre revient à hachurer
     la figure entière — la carte disparaît dessous et le motif ne désigne plus
     rien, exactement comme le verdict « expliqué par le plan » cesse alors de
     rien dire. On s'abstient, et la légende dit pourquoi. */
  const vainZ=!!(r.masse&&r.masse.vain);
  for(const z of (vainZ?[]:simXtZonesFondues(c.zones,total))){
    if(!(total>0))break;
    const x1=MG+Math.max(0,Math.min(1,z.s0/total))*W;
    const x2=MG+Math.max(0,Math.min(1,Math.max(z.s1,z.s0+total/400)/total))*W;
    h+='<rect class="simXtZone" x="'+simXY(x1)+'" y="0" width="'+
       simXY(Math.max(2,x2-x1))+'" height="'+simXY(HG)+'" fill="url(#simXtH-'+
       (SIM_XT_HACHURES.some(m=>m.cle===z.type)?z.type:"couture")+
       ')"><title>'+simEsc(z.type+" : "+(z.detail||""))+"</title></rect>";
  }

  /* ---- LES DEUX COURBES ---- */
  const graphe=(cle,titre,y0)=>{
    let g='<g class="simXtGraphe" data-sens="'+cle+'">';
    /* CE QUE CE GRAPHE-LÀ TRACE. Un seul sens pour les deux premiers ; LES
       DEUX pour celui des tensions, puisque c'est sa raison d'être. Chaque
       entrée dit où lire la valeur, où ranger les ordonnées pour la réglette,
       et comment le trait se distingue de l'autre sens. */
    const courbes=(cle==="volts")
      ? [{champ:"vNext", ys:"yVN", id:"NEXT", opacite:1, tiret:null},
         {champ:"vFext", ys:"yVF", id:"FEXT", opacite:0.6, tiret:"1 3"}]
      : [{champ:(cle==="fext")?"vFext":"vNext",
          ys:(cle==="fext")?"yFext":"yNext",
          id:cle.toUpperCase(), opacite:1, tiret:null}];
    let mx=0;
    for(const f of vus)
      for(const cb of courbes)
        for(const v of (f[cb.champ]||[]))if(v>mx)mx=v;
    if(!(mx>0))mx=pire;
    g+='<line class="simXtAxe" x1="'+simXY(MG)+'" y1="'+
       simXY(y0+SIM_XT_GRAPHE)+'" x2="'+simXY(MG+W)+'" y2="'+
       simXY(y0+SIM_XT_GRAPHE)+'"/>';
    g+='<line class="simXtGrille" x1="'+simXY(MG)+'" y1="'+
       simXY(y0+SIM_XT_GRAPHE/2)+'" x2="'+simXY(MG+W)+'" y2="'+
       simXY(y0+SIM_XT_GRAPHE/2)+'"/>';
    g+='<text class="simXtTitreG" x="'+simXY(MG+4)+'" y="'+simXY(y0-3)+'">'+
       simEsc(titre)+"</text>";
    /* UN AXE PAR UNITÉ, ET DE CHAQUE CÔTÉ DE LA COURBE. Le pour-cent de
       l'agresseur à gauche, la tension à droite : c'est le MÊME trait lu deux
       fois, et n'importe quelle hauteur se convertit d'un coup d'œil. Empilées
       à gauche, les deux ne donnaient qu'UNE valeur — le haut du graphe — et
       il fallait la réglette pour tout le reste.

       TROIS CRANS ET PAS DAVANTAGE : le haut, la moitié, zéro. Le trait de
       moitié existe déjà (`simXtGrille`), et c'est lui qu'on chiffre — poser
       une graduation là où aucun trait ne la porte obligerait à viser à l'œil.
       Chaque graphe garde SON échelle : le FEXT vaut souvent une fraction du
       NEXT, et les deux hauts n'annoncent donc pas la même tension. */
    const crans=[[0,y0+SIM_XT_GRAPHE], [0.5,y0+SIM_XT_GRAPHE/2], [1,y0+8]];
    /* SUR LE GRAPHE DES TENSIONS, LES VOLTS PASSENT A GAUCHE : c'est l'unité
       du graphe, et une unité principale ne se lit pas dans la marge. Le
       pour-cent reste à droite, où la tension se trouve sur les deux autres —
       le même trait, lu dans les deux unités, sans changer de place. */
    const voltsAG=(cle==="volts");
    for(const [t,yy] of crans)
      g+='<text class="'+(voltsAG?"simXtGradV":"simXtGrad")+'" x="'+
         simXY(MG-6)+'" y="'+simXY(yy)+'" text-anchor="end">'+
         (t?(voltsAG?simEsc(simXtTension(mx*t)):simXtPct(mx*t)+" %"):"0")+
         "</text>";
    if(simXtVu("volts"))
      for(const [t,yy] of crans)
        g+='<text class="'+(voltsAG?"simXtGrad":"simXtGradV")+'" x="'+
           simXY(MG+W+6)+'" y="'+simXY(yy)+'" text-anchor="start">'+
           (t?(voltsAG?simXtPct(mx*t)+" %":simEsc(simXtTension(mx*t)))
             :"0")+"</text>";
    /* LE SEUIL EN TRAIT, À SA HAUTEUR RÉELLE. Une courbe qui monte n'est pas
       une mauvaise nouvelle en soi : ce qui compte est de savoir si elle passe
       au-dessus de la marge du récepteur, et cela ne se lit pas en comparant
       deux nombres écrits à deux endroits. Hors échelle — le cas d'une carte
       tranquille —, on ne trace rien plutôt qu'un trait collé au titre : un
       seuil dessiné au plafond se lit comme un seuil atteint. */
    const seuilF=simSeuilFraction();
    if(seuilF>0&&seuilF<=mx){
      const ys=y0+SIM_XT_GRAPHE*(1-seuilF/mx);
      g+='<line class="simXtSeuilT" x1="'+simXY(MG)+'" y1="'+simXY(ys)+
         '" x2="'+simXY(MG+W)+'" y2="'+simXY(ys)+'"><title>'+
         simEsc(simSeuilNom()+" — "+simXtTension(seuilF)+
                " ; au-dessus, le récepteur de la victime n'a plus de marge")+
         "</title></line>";
      g+='<text class="simXtSeuilE" x="'+simXY(MG+W-2)+'" y="'+
         simXY(ys-3)+'" text-anchor="end">'+simEsc(simSeuilNom())+"</text>";
    }
    for(const f of vus)
      for(const cb of courbes){
        const source=f[cb.champ];
        /* UNE COURBE QUE LE SERVEUR N'A PAS RENDUE NE SE TRACE PAS À PLAT.
           Depuis que la ligne FEXT est refusée quand son axe n'existe pas,
           `vFext` est un tableau de zéros : le dessiner poserait un trait sur
           l'axe, ce qui se lit « aucun couplage » alors que le fait est
           « aucune POSITION » — le niveau, lui, est dans les cases. */
        if(!f[cb.champ==="vFext"?"fext":"next"])continue;
        const pts=[], ys=[];
        for(let i=0;i<n;i++){
          const yy=y0+SIM_XT_GRAPHE*
                   (1-Math.max(0,Math.min(1,((source&&source[i])||0)/mx)));
          ys.push(yy);
          pts.push(simXY(xs[i])+","+simXY(yy));
        }
        f[cb.ys]=ys;
        const tiret=(cb.tiret!==null)?cb.tiret:f.tiret;
        g+='<polyline class="simXtCourbe" points="'+pts.join(" ")+
           '" stroke="'+f.couleur+'"'+
           (tiret?' stroke-dasharray="'+tiret+'"':"")+
           (cb.opacite<1?' opacity="'+cb.opacite+'"':"")+
           "><title>"+simEsc(f.net+" · "+cb.id+
                             (cle==="volts"?" — en millivolts":""))+
           "</title></polyline>";
      }
    /* LA TENSION ÉCRITE AU PIC DE CHAQUE COURBE, sur la courbe elle-même.
       --------------------------------------------------------------------
       C'EST LA VALEUR QU'ON CHERCHE EN PREMIER, et jusqu'ici il fallait
       amener la réglette dessus pour la lire. L'axe de droite dit ce que vaut
       n'importe quelle hauteur ; celle-ci dit ce que vaut LE point qui
       compte, sans viser.

       ELLE PREND LA COULEUR DE SA VICTIME, et non l'ambre des autres volts.
       Sur un graphe à cinq courbes, savoir À QUI appartient un chiffre passe
       avant savoir de quelle famille il est : la couleur est ici la seule
       chose qui rattache l'étiquette à son trait, et une amende commune les
       rendrait toutes interchangeables.

       ET ELLES NE SE MARCHENT PAS DESSUS : deux pics proches en x ET en y
       verraient leurs étiquettes se recouvrir exactement là où l'on regarde.
       On empile alors vers le haut, cran par cran. */
    if(simXtVu("volts")){
      const poses=[];
      for(const f of vus)
      for(const cb of courbes){
        const v=f[cb.champ]||[];
        let im=0;
        for(let i=1;i<n;i++)if((v[i]||0)>(v[im]||0))im=i;
        if(!(v[im]>0))continue;
        const ysF=f[cb.ys];
        if(!ysF)continue;
        const yp=ysF[im];
        /* AU-DESSUS DU PIC, SAUF QUAND IL TOUCHE LE HAUT. La courbe la plus
           forte culmine au ras du plafond, et son étiquette irait alors se
           poser dans le titre du graphe : on la passe DESSOUS, où la place
           est libre par construction — sous un pic il n'y a que la
           descente. */
        const haut=yp-7 < y0+10;
        let yy=haut ? yp+13 : yp-7;
        /* ON ÉCARTE tant qu'une étiquette déjà posée est assez proche pour la
           recouvrir, dans le sens qui l'éloigne de la courbe. */
        for(let t=0;t<vus.length;t++){
          const gene=poses.some(p=>Math.abs(p.x-xs[im])<46
                                   &&Math.abs(p.y-yy)<10);
          if(!gene)break;
          yy+=haut?10:-10;
        }
        yy=Math.max(y0+8,Math.min(y0+SIM_XT_GRAPHE-2,yy));
        poses.push({x:xs[im], y:yy});
        /* L'ANCRAGE SUIT LE BORD : au ras de l'axe de droite, une étiquette
           centrée déborderait sur la graduation des volts. */
        const bord=xs[im]>MG+W-34 ? "end" : (xs[im]<MG+34 ? "start" : "middle");
        g+='<text class="simXtSommet" x="'+simXY(xs[im])+'" y="'+simXY(yy)+
           '" text-anchor="'+bord+'" fill="'+f.couleur+'">'+
           simEsc(simXtTension(v[im]))+"<title>"+
           simEsc(f.net+" · "+cb.id+" — le pire point de cette "+
                  "courbe : "+simXtPct(v[im])+" % de l’agresseur, soit "+
                  simXtTension(v[im])+", à "+
                  simNb(total*im/Math.max(1,n-1),2)+" mm")+
           "</title></text>";
      }
    }
    /* LE TRAIT D'ESPACEMENT SUR LA COURBE DE NEXT, et sur elle seule : c'est
       le NEXT que le serveur recoupe avec la géométrie, parce que c'est le
       seul des deux qui localise en milieu homogène. */
    if(cle==="next"&&SIM_XT.espacement)
      for(const f of vus)
        if(f.esp)g+=simXtTraitEspacement(f.esp,n,y0,SIM_XT_GRAPHE,W,MG);
    /* LES PICS QUE LA GÉOMÉTRIE N'EXPLIQUE PAS, posés sur la courbe de NEXT,
       pointe en bas, juste au-dessus du point qu'ils désignent. Ils ne sont
       relevés que là — le FEXT ne localise rien à vitesses égales, et l'y
       marquer ferait pointer un millimètre qui ne veut rien dire. */
    if(cle==="next")
      for(const f of vus)
        for(const d of desac){
          if(d.victime!==f.net||!(total>0))continue;
          const t=Math.max(0,Math.min(1,d.s/total));
          const i=Math.max(0,Math.min(n-1,Math.round(t*(n-1))));
          const x=MG+t*W, yy=(f.yNext&&f.yNext[i]!=null)?f.yNext[i]:y0;
          g+='<path class="simXtPic simXtPic-'+simEsc(d.verdict)+'" d="M'+
             simXY(x-4)+","+simXY(yy-12)+"L"+simXY(x+4)+","+simXY(yy-12)+"L"+
             simXY(x)+","+simXY(yy-4)+'Z"><title>'+
             simEsc((d.verdict==="plan"?"pic expliqué par le plan"
                     :d.verdict==="indecidable"
                       ?"INDÉCIDABLE : une zone tombe ici, mais les zones sont"
                        +" partout"
                       :"PIC NON JUSTIFIÉ")+
                    " à "+simNb(d.s,2)+" mm — "+(d.detail||""))+
             "</title></path>";
        }
    return g+"</g>";
  };
  traces.forEach(function(t,k){ h+=graphe(t.cle,t.titre,yGN+k*PAS); });

  /* ---- L'AXE : cinq graduations, et la longueur totale est écrite ---- */
  for(let k=0;k<=4;k++){
    const x=MG+k*W/4;
    h+='<line class="simXtAxe" x1="'+simXY(x)+'" y1="'+simXY(HG)+'" x2="'+
       simXY(x)+'" y2="'+simXY(HG+5)+'"/>';
    h+='<text class="simXtGrad" x="'+simXY(x)+'" y="'+simXY(HG+17)+
       '" text-anchor="'+(k===0?"start":(k===4?"end":"middle"))+'">'+
       simNb(total*k/4,1)+"</text>";
  }
  h+='<text class="simXtGrad" x="'+simXY(MG+W/2)+'" y="'+simXY(HG+29)+
     '" text-anchor="middle">position le long du parcours de l’agresseur (mm)'+
     "</text>";

  /* ---- LE CURSEUR, PAR-DESSUS TOUT ---- */
  const i0=Math.max(0,Math.min(n-1,Math.round((SIM_XT.pos||0)*(n-1))));
  h+='<line id="simXtCur" class="simXtCur" x1="'+simXY(xs[i0])+'" y1="0" x2="'+
     simXY(xs[i0])+'" y2="'+simXY(HG)+'"/>';
  vus.forEach(function(f,j){
    const pt=(id,ys)=>{
      if(!ys||ys[i0]==null)return "";
      return '<circle id="'+id+j+'" class="simXtPt" cx="'+simXY(xs[i0])+
             '" cy="'+simXY(ys[i0])+'" r="3.4"/>';
    };
    h+=pt("simXtPtN-",f.yNext)+pt("simXtPtF-",f.yFext)+
       pt("simXtPtVN-",f.yVN)+pt("simXtPtVF-",f.yVF);
  });
  h+="</svg></div>";

  h+=simXtRegle(n,total,i0,xs,vus);
  h+=simXtLegende(r,lignes,pire);
  return h+"</div>";
}

/* ==========================================================================
   LA RÉGLETTE, ET POURQUOI ELLE SURVIT À UNE FIGURE VIDE
   --------------------------------------------------------------------------
   ELLE NE COMMANDE PAS QUE LES COURBES. Elle pose aussi le POINT BLANC sur le
   cuivre de la vraie piste, et celui-là ne disparaît pas quand on éteint les
   deux sens : la chaleur et les plages restent peintes, et le point reste
   dessus. La retirer avec les courbes laisserait donc sur la carte un repère
   qu'on ne pourrait plus déplacer — une commande partie, son effet resté.

   LE REPÈRE SE POSE ICI, avant la première ligne de lecture : c'est lui que
   la lecture chiffrée interroge. `xs` est vide quand rien n'est tracé, et cela
   suffit : `simXtCurseurPoser` ne s'en sert que pour déplacer un trait et des
   cercles qui, eux, n'existent pas non plus. */
function simXtRegle(n,total,i0,xs,vus){
  SIM_XT_REPERE={n:n, total:total, xs:xs, fiches:vus};
  return '<div class="simXtRegle"><label for="simXtPos">Position</label>'+
     '<input type="range" id="simXtPos" min="0" max="'+(n-1)+
     '" step="1" value="'+i0+'" title="'+simEsc(
       "Le point lu partout à la fois : sur les courbes tracées, et sur le "+
       "cuivre de chaque victime affichée — un point blanc s'y promène, à "+
       "l'abscisse exacte du parcours. La finesse est celle de la carte, pas "+
       "celle du millimètre : la résolution spatiale annoncée plus bas dit en "+
       "deçà de quoi deux points n'en font qu'un.")+'">'+
     '<span id="simXtPosVal">'+simNb(total*i0/Math.max(1,n-1),2)+
     " mm</span></div>"+
     '<div class="simXtLect" id="simXtLect">'+simXtLectureLignes(i0)+"</div>";
}

/* LE BOUTON DE LA CHALEUR SUR LE CUIVRE. Elle est allumée par défaut : c'est
   elle qui a remplacé le ruban schématique du panneau, et la cacher d'office
   ferait chercher une carte de chaleur qui n'est nulle part. Elle s'éteint
   d'un clic, parce que sur une carte dense on veut parfois voir le cuivre nu
   sous elle. */
function simXtBoutonChaleur(){
  return '<button class="tb mini'+(SIM_XT.chaleur?" on":"")+
    '" id="simXtVoirChaleur" title="'+simEsc(
    "La carte de chaleur du couplage, peinte le long du cuivre de chaque "+
    "victime affichée, du bleu au rouge. C'est la MÊME mesure que les deux "+
    "courbes, posée là où l'on corrige : le sens peint est celui des deux "+
    "boutons de gauche.")+
    '">chaleur</button>';
}

/* LES HACHURES DES ZONES DE VIGILANCE, en motifs SVG plutôt qu'en aplats.
   C'est ce qui les empêche de se lire comme du couplage : elles ne sortent pas
   de la matrice S, et un aplat translucide par-dessus une cellule colorée
   donnerait une troisième couleur qu'on interpréterait comme une amplitude.
   Une couleur par type — la couture, la fente et la transition n'ont pas la
   même cause ni le même geste de correction. */
const SIM_XT_HACHURES=[
  {cle:"couture",     couleur:"var(--yellow)"},
  {cle:"fente",       couleur:"var(--red)"},
  {cle:"transition",  couleur:"var(--blue)"}
];
/* LES ZONES FONDUES PAR TYPE, POUR LA CARTE SEULEMENT. Le serveur les rend
   telles qu'il les a mesurées — un intervalle par trou et PAR CÔTÉ du
   parcours —, et c'est ce qu'il faut dans le tableau : deux côtés cousus
   inégalement sont deux faits distincts. Superposées à l'écran, elles ne le
   sont plus : quatorze rectangles hachurés qui se recouvrent donnent un aplat
   dont la densité ne veut plus rien dire, et la carte disparaît dessous. On
   fond donc les intervalles qui se touchent, type par type, et l'infobulle
   annonce combien de mesures chaque bande recouvre.

   TYPE PAR TYPE ET JAMAIS ENTRE TYPES : une couture et une fente ne demandent
   pas le même geste, et les fondre ferait lire « une zone » là où il y a deux
   causes. */
function simXtZonesFondues(zones,total){
  const parType={};
  for(const z of (zones||[])){
    const t=z.type||"couture";
    (parType[t]=parType[t]||[]).push(z);
  }
  const sortie=[];
  for(const t of Object.keys(parType)){
    const l=parType[t].slice().sort((a,b)=>a.s0-b.s0);
    let cour=null;
    for(const z of l){
      const s0=+z.s0, s1=Math.max(+z.s1,+z.s0);
      if(cour&&s0<=cour.s1){
        cour.s1=Math.max(cour.s1,s1); cour.n++;
        if(cour.detail!==z.detail)cour.divers=true;
      }else{
        if(cour)sortie.push(cour);
        cour={type:t,s0:s0,s1:s1,n:1,detail:z.detail||"",divers:false};
      }
    }
    if(cour)sortie.push(cour);
  }
  for(const z of sortie)
    if(z.n>1)
      z.detail=z.n+" mesures fondues ("+simNb(z.s0,2)+" → "+simNb(z.s1,2)+
        " mm) ; le tableau plus bas les donne une par une"+
        (z.divers?"":" — "+z.detail);
  return sortie.sort((a,b)=>a.s0-b.s0);
}

function simXtHachures(){
  let h="<defs>";
  for(const z of SIM_XT_HACHURES)
    h+='<pattern id="simXtH-'+z.cle+'" width="8" height="8" '+
       'patternUnits="userSpaceOnUse" patternTransform="rotate(45)">'+
       '<line x1="0" y1="0" x2="0" y2="8" stroke="'+z.couleur+
       '" stroke-width="2.5" opacity="0.55"/></pattern>';
  return h+"</defs>";
}

function simXtSensBoutons(){
  /* CE QUE LES DEUX BOUTONS COMMANDENT A CHANGÉ, ET IL FAUT LE DIRE. Ils
     choisissaient LA courbe affichée ; maintenant que les deux sont là,
     l'une sous l'autre, ils choisissent ce que la COULEUR des pistes montre —
     et, avec elle, ce que les plages peintes sur le cuivre désignent. Sans ce
     mot, on cliquerait « FEXT » en attendant que quelque chose apparaisse. */
  let h='<span class="simXtSens" title="'+simEsc(
    "Ce que la couleur des pistes peint — et ce que les plages posées sur le "+
    "cuivre désignent. C'est un choix de PEINTURE, pas d'affichage : les "+
    "cases « voir » d'à côté, elles, décident quelles courbes sont tracées. "+
    "Ni l'un ni l'autre ne relance quoi que ce soit.")+
    '"><small>peindre</small>';
  for(const s of SIM_XT_SENS)
    h+='<button class="tb mini'+(SIM_XT.sens===s.cle?" on":"")+
       '" data-xtsens="'+s.cle+'" title="'+simEsc(s.titre)+'">'+s.nom+
       "</button>";
  return h+"</span>";
}

/* ==========================================================================
   LES TROIS CASES DE LA FIGURE — CE QU'ELLE TRACE, ET DANS QUELLE UNITÉ
   --------------------------------------------------------------------------
   DES CASES ET NON DES BOUTONS, et la différence n'est pas cosmétique : les
   boutons « peindre » d'à côté sont un choix EXCLUSIF — la couleur du cuivre
   montre un sens ou l'autre, jamais les deux. Ici les trois réglages sont
   INDÉPENDANTS et cumulables, et une case dit cela d'un coup d'œil là où
   trois boutons armés se liraient comme un choix à trois branches.

   ELLES SONT COLLÉES À LA FIGURE, pas rangées dans les réglages du panneau.
   Les réglages se replient une fois l'analyse lancée ; ces trois-là se
   touchent JUSTEMENT en lisant la figure, et les mettre dans un tiroir qu'on
   vient de fermer serait la meilleure façon qu'on ne les trouve pas.
   ========================================================================== */
const SIM_XT_VOIR=[
  {cle:"next", nom:"NEXT",
   titre:"Tracer le graphe du NEXT — le bruit du bout PROCHE de chaque "+
         "victime. C'est sur lui que se posent le profil d'espacement et les "+
         "pics recoupés : l'éteindre les emporte, puisqu'ils n'ont de sens "+
         "que là."},
  {cle:"fext", nom:"FEXT",
   titre:"Tracer le graphe du FEXT — le bruit du bout LOINTAIN de chaque "+
         "victime. Il a SA propre échelle : le FEXT vaut souvent une "+
         "fraction du NEXT, et deux échelles l'une sous l'autre se comparent "+
         "mal. L'éteindre rend toute la hauteur à celui qu'on suit."},
  {cle:"volts", nom:"mV",
   titre:"Tracer le graphe des TENSIONS — les deux sens de chaque victime sur"+
         " UNE MÊME échelle, en millivolts, et le seuil du récepteur à sa "+
         "hauteur. C'est le seul des trois graphes où le NEXT et le FEXT se "+
         "comparent : les deux autres ont chacun la leur. Écrit aussi les "+
         "volts sur les cases des victimes, sur la graduation de chaque "+
         "graphe et sous la réglette. C'est le pour-cent multiplié par "+
         "l'amplitude saisie dans la rangée « Signal » ; aucun calcul ne "+
         "bouge dans un sens ni dans l'autre. Il se lit SEUL : décocher NEXT "+
         "et FEXT ne laisse plus une figure vide."}
];

function simXtVoirCases(){
  let h='<span class="simXtVoir" title="'+simEsc(
    "Ce que la FIGURE trace, et dans quelle unité. Trois réglages "+
    "indépendants, tous d'affichage : les deux courbes et les deux unités "+
    "sont déjà dans le résultat, et rien ici ne relance le calcul.")+
    '"><small>voir</small>';
  for(const v of SIM_XT_VOIR)
    h+='<label class="simXtVoirC'+(simXtVu(v.cle)?" on":"")+'" title="'+
       simEsc(v.titre)+'"><input type="checkbox" data-xtvoir="'+v.cle+'"'+
       (simXtVu(v.cle)?" checked":"")+">"+simEsc(v.nom)+"</label>";
  return h+"</span>";
}

/* UN SEUL ENDROIT LIT L'ÉTAT, et il tolère un état d'avant ces cases : un
   résultat gardé en mémoire par une version précédente n'a pas de `courbes`,
   et tout doit alors s'afficher — c'est ce que la figure faisait. */
function simXtVu(cle){
  const c=SIM_XT.courbes;
  return !c||c[cle]!==false;
}

/* LE BOUTON N'APPARAÎT QUE S'IL Y A UN PROFIL À MONTRER. Un interrupteur qui
   ne change rien à l'écran est pire qu'absent : on le bascule deux fois avant
   de comprendre qu'il n'y avait rien dessous. Quand aucune victime n'a de
   profil — elles sont toutes sur des couches adjacentes —, on le dit plutôt
   que d'offrir un bouton muet. */
function simXtBoutonEspacement(esp){
  if(!esp||!Object.keys(esp).length)return "";
  return '<button class="tb mini'+(SIM_XT.espacement?" on":"")+
    '" id="simXtVoirEsp" title="'+simEsc(
    "Le profil d'espacement, superposé en trait clair sur la ligne de chaque "+
    "victime. Il vient de la GÉOMÉTRIE et non du calcul : c'est le seul "+
    "témoin indépendant de la carte. L'axe est INVERSÉ — le trait monte quand "+
    "les deux pistes se rapprochent —, pour qu'un resserrement se lise au "+
    "même endroit et dans le même sens qu'un pic de couplage.")+
    '">écart</button>';
}

/* LE BOUTON DES ZONES SUR LE CUIVRE. Il n'apparaît que si le serveur en a
   rendu : un interrupteur qui n'allume rien se bascule deux fois avant qu'on
   comprenne qu'il n'y avait rien dessous. */
function simXtBoutonRisques(r){
  /* UN BOUTON QUI DISPARAÎT SANS RIEN DIRE EST PIRE QU'UN BOUTON ÉTEINT : on
     le cherche, on croit avoir cassé quelque chose, et l'on ne saura jamais
     que c'est le RÉSULTAT qui ne permet pas de le peindre. Quand le serveur a
     refusé de rendre des plages, il dit pourquoi, et la place du bouton porte
     ce pourquoi. */
  if(!(r.risques||[]).length){
    const ref=r.risques_refus||[];
    if(!ref.length)return "";
    return '<span class="simXtEteint" title="'+simEsc(
      "Rien à peindre sur le cuivre : "+
      ref.map(x=>"« "+x.victime+" » — "+x.raison).join("  ")+
      " Une plage peinte dirait « ce millimètre-là » sans pouvoir le "+
      "désigner ; élargissez la bande analysée et elle reviendra.")+
      '">sur le cuivre : rien à peindre</span>';
  }
  return '<button class="tb mini'+(SIM_XT.risques?" on":"")+
    '" id="simXtVoirRisques" title="'+simEsc(
    "Les portions de chaque victime où SON couplage se fabrique, peintes sur "+
    "le cuivre de la carte. Ambre : le dessin des pistes l'explique, ça se "+
    "corrige en écartant. Rouge : rien ne l'explique — l'écarter ne servirait "+
    "à rien, c'est ailleurs qu'il faut chercher.")+
    '">sur le cuivre</button>';
}

/* SOUS LA CARTE, LES TROIS CHOSES QUI DISENT CE QU'ELLE VAUT : l'échelle des
   couleurs, la RÉSOLUTION — deux pics plus proches sont un seul pic —, et la
   liste des zones superposées. Sans la deuxième, on lit la carte au dixième de
   millimètre alors qu'elle ne distingue rien sous plusieurs. */
function simXtLegende(r,lignes,pire){
  let h='<div class="simXtLeg"><span class="simXtRampe"></span>'+
        /* LE HAUT DE L'ÉCHELLE EN POUR-CENT, comme les cases et la lecture :
           « 0,00006 » demandait de compter les zéros pour retrouver le chiffre
           qui est écrit partout ailleurs. */
        "<span>0</span><span>→</span><span>"+simXtPct(pire)+" %"+
        (simXtVu("volts")?" = "+simEsc(simXtTension(pire)):"")+
        " (amplitude de la réponse impulsionnelle, rapportée à l'agresseur"+
        (simXtVu("volts")?" puis convertie par l'amplitude saisie":"")+
        ")</span></div>";
  const res=lignes.map(l=>l.resolution).filter(v=>v>0);
  /* LA RÉSOLUTION RESTE À DÉCOUVERT, et elle seule : sans elle on lit la carte
     au dixième de millimètre alors qu'elle ne distingue rien sous plusieurs.
     Tout le reste de la légende est un MODE D'EMPLOI — il s'apprend une fois,
     et le relire à chaque analyse est ce qui rend la fiche illisible. */
  if(res.length)
    h+='<p class="simNote">· <b>Résolution spatiale : '+
       simNb(Math.max(...res),2)+" mm</b> — deux zones plus proches sont une "+
       "seule tache.</p>";
  h+='<details class="simXtPourquoi"><summary>comment lire cette carte'+
     "</summary>";
  if(res.length)
    h+='<p class="simNote">· La <b>résolution</b> ne dépend que de la bande '+
       "analysée et de la fenêtre : le zero-padding interpole, il ne distingue "+
       "pas. Deux zones plus proches que "+simNb(Math.max(...res),2)+
       " mm resteront une seule tache, quelle que soit la finesse de la courbe "+
       "à l'écran.</p>";
  const cible=(r.reglages&&r.reglages.resolution_cible)||0;
  if(cible>0&&res.length)
    h+='<p class="simNote">· Résolution <b>visée</b> : '+simNb(cible,2)+
       " mm — "+(Math.max(...res)<=cible
         ? "atteinte."
         : "<b>NON atteinte</b> ; l'avertissement en tête dit jusqu'à quelle "+
           "fréquence il faudrait monter.")+"</p>";
  const esp=(r.carte_chaleur&&r.carte_chaleur.espacements)||{};
  if(Object.keys(esp).length)
    h+='<p class="simNote">· Le <b>trait clair</b>, sur la courbe de NEXT, '+
       "est le profil d'espacement, mesuré sur la GÉOMÉTRIE et non calculé : "+
       "c'est le seul témoin indépendant de cette carte. <b>Son axe est "+
       "inversé</b> — il monte quand les deux pistes se rapprochent —, de "+
       "sorte qu'un resserrement se lise au même endroit et dans le même sens "+
       "qu'un pic. Là où il s'interrompt, la victime ne longe pas : un pic "+
       "dans un trou du trait n'est pas expliqué par le dessin des "+
       "pistes.</p>";
  h+='<p class="simNote">· La <b>réglette</b> pose un trait au travers des '+
     "deux courbes et un <b>point blanc sur le cuivre</b> de chaque victime "+
     "affichée, à la même abscisse : c'est lui qui recoud « ce pic-ci » et "+
     "« ce millimètre-là de cette piste ». Une carte de chaleur dit OÙ, "+
     "jamais COMBIEN ; la lecture sous la réglette répond. Les <b>cases</b> "+
     "allument ou éteignent une victime — ses courbes, sa chaleur sur le "+
     "cuivre, son point et ses plages —, sans rien relancer : les deux sens "+
     "sont dans le même résultat, et les tableaux plus bas gardent tout le "+
     "monde.</p>";
  if(SIM_XT.chaleur)
    h+='<p class="simNote">· La <b>chaleur</b> est peinte le long du cuivre '+
       "de chaque victime, dans le sens choisi par les deux boutons du haut, "+
       "et son maximum est celui de la carte ENTIÈRE : une victime tranquille "+
       "reste bleue à côté d'une victime chargée, ce qui est tout l'objet "+
       "d'une échelle commune. Le bouton « chaleur » l'éteint quand on veut "+
       "voir le cuivre nu.</p>";
  h+='<p class="simNote">· Chaque courbe a <b>son échelle</b>, écrite à sa '+
     "gauche : le FEXT vaut souvent une fraction du NEXT, et une échelle "+
     "commune l'écraserait au ras de l'axe. Les deux ne s'additionnent pas — "+
     "le NEXT s'observe au bout <b>proche</b> de la victime, le FEXT à son "+
     "bout <b>lointain</b>, jamais au même point. Les cases <b>« voir »</b> "+
     "en tête éteignent l'un ou l'autre : la figure se resserre alors sur ce "+
     "qui reste, et rien ne se relance — le profil d'espacement et les pics "+
     "recoupés, eux, vivent sur la courbe de NEXT et s'en vont avec elle.</p>";
  /* LES VOLTS, EXPLIQUÉS UNE FOIS. Ils sont partout dans la fiche, et ce
     qu'ils supposent tient en deux phrases : une amplitude saisie à la main,
     et un rapport que le serveur a calculé. Sans cette note, on lit « 14 mV »
     comme une mesure alors que c'est un produit — et l'on ne songe pas à
     vérifier le champ qui en fournit la moitié. */
  h+='<p class="simNote">· '+(simXtVu("volts")
     ? "Les <b>volts</b> écrits à côté de chaque pour-cent sont ce couplage-là "+
       "multiplié par l'<b>amplitude de l'agresseur</b> saisie dans la rangée "+
       "« Signal » ("+simEsc(simTension(SIM.saisie.swing))+"), et la case "+
       "<b>mV</b> en tête les éteint quand on ne compare que des dessins."
     : "Les <b>volts</b> sont <b>éteints</b> (case <b>mV</b> en tête) : il ne "+
       "reste que le pour-cent, qui ne dépend que du cuivre. Les rallumer les "+
       "écrit à côté de chaque mesure, converti par l'amplitude de "+
       "l'agresseur ("+simEsc(simTension(SIM.saisie.swing))+").")+
     " Le calcul, lui, ne connaît que "+
     "des rapports : changer l'amplitude déplace toutes les tensions et ne "+
     "relance rien. Le <b>trait horizontal</b> sur chaque graphe est le seuil "+
     "qui juge — "+simEsc(simSeuilNom())+", soit "+
     simEsc(simXtTension(simSeuilFraction()))+" — et il n'est tracé que "+
     "lorsqu'il tombe dans l'échelle du graphe : au-dessus, on ne dessine "+
     "rien plutôt qu'un trait collé au plafond, qui se lirait comme un seuil "+
     "atteint.</p>";
  const zones=(r.carte_chaleur&&r.carte_chaleur.zones)||[];
  if(zones.length&&(r.masse&&r.masse.vain))
    h+='<p class="simNote">· Les '+zones.length+" zones de vigilance du plan "+
       "<b>ne sont PAS hachurées ici</b> : elles couvrent "+
       simNb(100*r.masse.couvert,0)+" % du parcours, et les peindre "+
       "reviendrait à hachurer la figure entière — un motif qui recouvre tout "+
       "ne désigne plus rien. Elles restent listées plus bas.</p>";
  else if(zones.length)
    h+='<p class="simNote">· Les <b>bandes hachurées</b> sont des zones de '+
       "vigilance du plan de référence, PAS du couplage : elles ne sortent "+
       "pas de la matrice S. Un pic à la même abscisse que l'une d'elles en a "+
       "probablement la cause. Le détail est plus bas.</p>";
  if((r.desaccords||[]).length)
    h+='<p class="simNote">· Les <b>triangles</b> marquent les pics que le '+
       "recoupement a relevés, sur la courbe de NEXT : rouge quand rien ne "+
       "les "+
       "explique, bleu quand une zone de vigilance tombe au même endroit, "+
       "gris quand une zone y tombe mais que les zones couvrent trop du "+
       "parcours pour que ce soit un renseignement.</p>";
  const zr=r.risques||[];
  if(zr.length){
    const rouges=zr.filter(z=>!z.justifie).length;
    h+='<p class="simNote">· <b>'+zr.length+" zone(s) à risque</b> sont "+
       "peintes <b>sur le cuivre de la carte</b>, portion par portion — c'est "+
       "la même mesure que cette figure, posée là où l'on corrige. Elles "+
       "sortent des plages où le couplage d'une victime dépasse "+
       simNb(100*((r.reglages||{}).risque||0.5),0)+" % de son propre pire "+
       "point. <b>Ambre</b> : le dessin des pistes l'explique, ça se corrige "+
       "en écartant. <b>Rouge</b> : un pic que le dessin des pistes n'explique "+
       "PAS y tombe — écarter ne servirait à rien, et le recoupement plus bas "+
       "dit si le plan de référence est en cause ou si la question reste "+
       "ouverte"+(rouges?" ; il y en a "+rouges:"")+".</p>";
  }
  return h+"</details>";
}

/* ==========================================================================
   LES ZONES À RISQUE, POSÉES SUR LE CUIVRE
   --------------------------------------------------------------------------
   LA CARTE DU PANNEAU RANGE LES VICTIMES EN LIGNES SUR UN AXE COMMUN, ce qui
   est exactement ce qu'il faut pour les COMPARER : un pic à la même abscisse
   sur deux lignes désigne un accident du plan, un pic sur une seule désigne le
   tracé de cette victime-là. Mais devant le dessin, la question n'est plus
   « laquelle prend le plus » — c'est « quel millimètre de CELLE-CI dois-je
   reprendre ». Une abscisse en millimètres le long d'un parcours ne répond pas
   à ça : il faut aller la chercher sur la carte, à la règle.
   Ces plages-là répondent, et c'est le même chiffre : le serveur rend, pour
   chaque victime confirmée, les portions du parcours où SON couplage se
   fabrique, et la page les reporte sur SON cuivre.

   ON NE RECONSTRUIT PAS LA POSITION DE LA VICTIME PAR DÉCALAGE LATÉRAL, et
   c'est la décision qui rend ce code fiable. On aurait pu prendre le point du
   parcours à l'abscisse s et le décaler de l'entre-axes mesuré : cela suppose
   de retrouver EXACTEMENT la convention de signe du serveur, dans deux outils,
   et un signe inversé poserait le trait sur la piste d'en face — visiblement
   juste, et faux. On fait l'inverse, qui ne suppose rien : on parcourt le
   cuivre de la victime, on PROJETTE chaque point sur le parcours de
   l'agresseur, et l'on garde ce qui tombe dans la plage. La géométrie est
   alors celle du dessin, pas celle d'une reconstruction.

   LES FORMES SONT NEUTRES, et l'algorithme vit ici une seule fois. Chaque
   outil sait fabriquer deux choses et rien de plus : le PARCOURS de
   l'agresseur — une suite de {s0, longueur, pts} en millimètres, dans l'ordre —
   et les POLYLIGNES d'un net, en millimètres aussi. Le reste — projeter,
   découper, recoller — est le même des deux côtés, et deux copies auraient
   fini par ne plus désigner le même cuivre.
   ========================================================================== */

/* Le pas d'échantillonnage du cuivre de la victime. Un quart de millimètre :
   assez fin pour qu'un bout de plage ne saute pas un coude, assez gros pour
   qu'une liaison de cent millimètres tienne en quatre cents points. */
const SIM_XT_PAS_TRAIT=0.25;

/* La projection d'un point sur le parcours : son abscisse curviligne et sa
   distance. On garde la plus PROCHE des projections — deux tronçons d'un même
   repli peuvent tous deux l'accepter, et prendre le premier venu placerait le
   point à l'autre bout du parcours. */
function simXtProjParcours(parcours,x,y){
  let best=null;
  for(const e of parcours){
    const p=e.pts;
    if(!(e.total>0)){
      /* LA LONGUEUR DE LA POLYLIGNE, calculée une fois et gardée sur l'objet :
         l'outil peut la donner s'il l'a sous la main, sinon elle se déduit. */
      let L=0;
      for(let i=0;i+3<p.length;i+=2)
        L+=Math.hypot(p[i+2]-p[i],p[i+3]-p[i+1]);
      e.total=L||e.longueur||1;
    }
    /* L'ABSCISSE DANS LE TRONÇON est comptée sur la polyligne, et ramenée à la
       longueur ENVOYÉE AU SERVEUR : les deux peuvent différer d'un cheveu
       quand un arc a été plié, et c'est la seconde qui fait foi puisque c'est
       elle qui a construit l'axe. Le cumul se porte en marchant — le
       recalculer depuis le début à chaque segment serait quadratique, et cette
       fonction tourne quelques centaines de fois par plage. */
    let avant=0;
    for(let i=0;i+3<p.length;i+=2){
      const ax=p[i], ay=p[i+1], bx=p[i+2], by=p[i+3];
      const dx=bx-ax, dy=by-ay, l2=dx*dx+dy*dy;
      const t=l2>0?Math.max(0,Math.min(1,((x-ax)*dx+(y-ay)*dy)/l2)):0;
      const px=ax+dx*t, py=ay+dy*t;
      const d=Math.hypot(x-px,y-py);
      if(!best||d<best.d){
        const surTroncon=avant+Math.hypot(px-ax,py-ay);
        const total=e.total||1;
        best={d:d, s:e.s0+Math.max(0,Math.min(1,surTroncon/total))*e.longueur};
      }
      avant+=Math.sqrt(l2);
    }
  }
  return best;
}

/* Le cuivre d'une victime qui tombe dans une plage : une ou plusieurs
   polylignes, en millimètres.

   ON DÉCOUPE EN MORCEAUX CONTIGUS, et un trou reste un trou : une victime qui
   s'écarte au milieu de la plage — elle contourne un composant — donne deux
   morceaux, pas un trait qui traverse le vide. C'est la même règle que le trou
   du profil d'espacement, et pour la même raison. */
function simXtRisqueTraits(parcours,traits,s0,s1,corridor){
  const out=[];
  if(!parcours.length)return out;
  for(const p of traits){
    if(!p||p.length<4)continue;
    let morceau=null;
    for(let i=0;i+3<p.length;i+=2){
      const ax=p[i], ay=p[i+1], bx=p[i+2], by=p[i+3];
      const l=Math.hypot(bx-ax,by-ay);
      const n=Math.max(1,Math.ceil(l/SIM_XT_PAS_TRAIT));
      for(let k=0;k<=n;k++){
        /* Le dernier point d'un segment est le premier du suivant : on le
           saute, sauf sur le tout dernier, sans quoi chaque sommet compterait
           deux fois. */
        if(k===n&&i+5<p.length)break;
        const x=ax+(bx-ax)*k/n, y=ay+(by-ay)*k/n;
        const pr=simXtProjParcours(parcours,x,y);
        const dedans=pr&&pr.s>=s0&&pr.s<=s1&&pr.d<=corridor;
        if(dedans){
          if(!morceau){morceau=[];out.push(morceau);}
          morceau.push(x,y);
        }else morceau=null;
      }
    }
  }
  return out.filter(m=>m.length>=4);
}

/* Ce que le serveur a rendu, quand l'onglet est ouvert et qu'il y a de quoi.
   Même garde que `simCheveluRes` : une surimpression qui survivrait au
   changement d'onglet désignerait du cuivre sous une fiche qui n'en parle
   pas. */
function simXtRisques(){
  if(typeof SIM==="undefined"||!SIM.ouvert||SIM.analyse!=="crosstalk")return [];
  if(!SIM_XT.risques||!SIM_XT.res)return [];
  return SIM_XT.res.risques||[];
}

/* La géométrie, calculée UNE FOIS par résultat et gardée. Elle coûte quelques
   centaines de projections ; la refaire à chaque redessin — donc à chaque
   déplacement de la souris — se verrait. */
let SIM_XT_GEOM=null, SIM_XT_GEOM_SRC=null;

function simXtRisqueGeom(){
  /* LES VICTIMES ÉTEINTES DANS LA FIGURE LE SONT AUSSI SUR LE CUIVRE. Le
     filtre est posé À LA SORTIE, et sur TOUS les chemins de sortie : la
     géométrie est gardée par résultat, et la recalculer à chaque case cochée
     coûterait quelques centaines de projections pour un geste d'affichage.
     Filtrer au seul chemin de calcul laissait le cas gardé rendre la victime
     éteinte — c'est-à-dire le cas ordinaire, celui d'un deuxième clic. */
  const sortie=()=>{
    const caches=SIM_XT.caches||{};
    return SIM_XT_GEOM.filter(z=>!caches[z.victime]);
  };
  const zones=simXtRisques();
  if(!zones.length)return [];
  if(SIM_XT_GEOM_SRC===SIM_XT.res&&SIM_XT_GEOM)return sortie();
  SIM_XT_GEOM_SRC=SIM_XT.res; SIM_XT_GEOM=[];
  /* LA GÉOMÉTRIE EST DEMANDÉE UNE FOIS ET PARTAGÉE : la chaleur peinte le long
     des victimes et le point de la réglette lisent le même cuivre, et deux
     appels auraient fait construire deux fois la même chose à l'outil. */
  const g=simXtGeomBrute();
  if(!g||!g.parcours||!g.parcours.length)return sortie();
  const corridor=simXtCorridor();
  for(const z of zones){
    const traits=(g.victimes||{})[z.victime];
    if(!traits||!traits.length)continue;
    const morceaux=simXtRisqueTraits(g.parcours,traits,z.s0,z.s1,corridor);
    if(morceaux.length)SIM_XT_GEOM.push(Object.assign({},z,{traits:morceaux}));
  }
  return sortie();
}

/* LA COULEUR DIT LE VERDICT AVANT DE DIRE LE NIVEAU, et c'est l'inverse d'une
   carte de chaleur ordinaire. Une plage que le dessin des pistes explique est
   ambre : on la corrige en écartant, et c'est un geste connu. Une plage que
   RIEN n'explique est rouge : elle ne se corrige pas en écartant, et c'est
   justement ce qu'il faut savoir avant de déplacer la piste pour rien. Le
   niveau module l'opacité, pas la teinte. */
function simXtRisqueCouleur(z){
  const a=0.35+0.55*Math.max(0,Math.min(1,z.niveau||0));
  return z.justifie?"rgba(232,164,58,"+a.toFixed(2)+")"
                   :"rgba(232,68,58,"+a.toFixed(2)+")";
}

/* ==========================================================================
   LE COUPLAGE PEINT SUR LE CUIVRE, ET LE POINT DE LA RÉGLETTE
   --------------------------------------------------------------------------
   LA FIGURE DU PANNEAU DIT « COMBIEN, À QUELLE ABSCISSE » ; le cuivre dit
   « SUR QUEL MILLIMÈTRE DE QUELLE PISTE ». Les deux sont la même mesure, et
   c'est le point blanc qui les recoud : il se pose au même instant sur les
   deux courbes et sur la vraie piste, à l'abscisse que la réglette désigne.
   Un schéma de piste dans le panneau faisait ce travail de tête ; la carte le
   fait pour de bon.

   TOUT PART DE LA MÊME PROJECTION, celle des zones à risque : on parcourt le
   cuivre de la victime, on projette chaque point sur le parcours de
   l'agresseur, et l'on garde son abscisse curviligne. On ne reconstruit RIEN
   par décalage latéral — voir « LES ZONES À RISQUE, POSÉES SUR LE CUIVRE » :
   un signe inversé poserait le trait sur la piste d'en face, visiblement juste
   et faux.

   ELLE SE CALCULE UNE FOIS PAR RÉSULTAT. Le canevas se redessine à chaque
   déplacement de souris ; refaire quelques milliers de projections à ce
   rythme-là se verrait. On garde donc, par victime, la suite des points de son
   cuivre AVEC leur abscisse — dans l'ordre du cuivre, un morceau par passage
   dans le couloir —, et le reste n'est que de la lecture.
   ========================================================================== */

/* Les nets dont on demande le cuivre à l'outil. Les DEUX usages y sont : les
   plages à risque, et la chaleur peinte le long des victimes affichées. Les
   demander séparément aurait fini par donner à l'un ce que l'autre n'a pas. */
function simXtVictimesVoulues(){
  const res=(typeof SIM_XT!=="undefined")?SIM_XT.res:null;
  const vu={}, out=[];
  const ajoute=n=>{if(n&&!vu[n]){vu[n]=true;out.push(n);}};
  /* TOUTE COURBE TRACÉE PEUT ÊTRE ALLUMÉE, donc son cuivre peut être demandé :
     une candidate sous le seuil qu'on coche doit se peindre comme les autres,
     sans quoi la case l'allumerait dans la figure et pas sur la carte. */
  for(const l of ((res&&res.carte_chaleur&&res.carte_chaleur.lignes)||[]))
    ajoute(l.victime);
  for(const c of ((res&&res.couples)||[]))if(c.confirmee)ajoute(c.victime);
  for(const v of ((res&&res.victimes)||[]))ajoute(v);
  for(const z of ((res&&res.risques)||[]))ajoute(z.victime);
  return out;
}

/* Le couloir de recherche : celui de la présélection, élargi d'une demi-largeur
   de part et d'autre. C'est la distance en deçà de laquelle le serveur a
   accepté de regarder cette victime, et il n'y a pas de raison d'en prendre
   une autre ici. */
function simXtCorridor(){
  const s=(SIM_XT.res&&SIM_XT.res.etape0&&SIM_XT.res.etape0.seuils)||{};
  return Math.max(0.2,(s.distance_max||0.5))+1.0;
}

/* La géométrie brute rendue par l'outil, gardée par résultat. Deux appelants
   la partagent — les plages et la chaleur —, et l'outil ne la construit donc
   qu'une fois. */
let SIM_XT_BRUTE=null, SIM_XT_BRUTE_SRC=null;
function simXtGeomBrute(){
  if(SIM_XT_BRUTE_SRC===SIM_XT.res&&SIM_XT_BRUTE!==null)return SIM_XT_BRUTE;
  SIM_XT_BRUTE_SRC=SIM_XT.res;
  SIM_XT_BRUTE=(SIM_ED&&typeof SIM_ED.xtGeometrie==="function")
    ? (SIM_ED.xtGeometrie()||false) : false;
  return SIM_XT_BRUTE;
}

/* LE CUIVRE DE CHAQUE VICTIME, ÉCHANTILLONNÉ ET ABSCISSÉ. Un morceau par
   passage dans le couloir, dans l'ordre du cuivre : c'est ce qui permet à la
   fois de peindre un trait continu et de retrouver un point à une abscisse
   donnée. Une victime qui contourne un composant a deux morceaux, et le trou
   entre les deux reste un trou — elle n'y longe pas, elle n'y couple pas. */
let SIM_XT_PROJ=null, SIM_XT_PROJ_SRC=null;
function simXtProjVictimes(){
  if(SIM_XT_PROJ_SRC===SIM_XT.res&&SIM_XT_PROJ)return SIM_XT_PROJ;
  SIM_XT_PROJ_SRC=SIM_XT.res; SIM_XT_PROJ={};
  const g=simXtGeomBrute();
  if(!g||!g.parcours||!g.parcours.length)return SIM_XT_PROJ;
  const corridor=simXtCorridor();
  for(const net of Object.keys(g.victimes||{})){
    const morceaux=[];
    for(const p of (g.victimes[net]||[])){
      if(!p||p.length<4)continue;
      let morceau=null;
      for(let i=0;i+3<p.length;i+=2){
        const ax=p[i], ay=p[i+1], bx=p[i+2], by=p[i+3];
        const l=Math.hypot(bx-ax,by-ay);
        const nb=Math.max(1,Math.ceil(l/SIM_XT_PAS_TRAIT));
        for(let k=0;k<=nb;k++){
          /* Le dernier point d'un segment est le premier du suivant : on le
             saute, sauf sur le tout dernier — sans quoi chaque sommet
             compterait deux fois. */
          if(k===nb&&i+5<p.length)break;
          const x=ax+(bx-ax)*k/nb, y=ay+(by-ay)*k/nb;
          const pr=simXtProjParcours(g.parcours,x,y);
          if(pr&&pr.d<=corridor){
            if(!morceau){morceau=[];morceaux.push(morceau);}
            morceau.push({s:pr.s, x:x, y:y});
          }else morceau=null;
        }
      }
    }
    SIM_XT_PROJ[net]=morceaux.filter(m=>m.length>=2);
  }
  return SIM_XT_PROJ;
}

/* Les victimes qu'on peint : celles que la fiche affiche, et rien d'autre.
   LA DÉCISION EST PRISE UNE SEULE FOIS, dans `simXtFiches` : allumer par
   défaut est une règle à trois cas — cochée, décochée, jamais touchée —, et la
   réécrire ici aurait fini par peindre sur le cuivre une victime que la figure
   n'affiche pas. */
function simXtVictimesVues(){
  const vues={};
  for(const f of simXtFiches(SIM_XT.res||{}))if(f.visible)vues[f.net]=true;
  return simXtVictimesVoulues().filter(n=>vues[n]);
}

/* Peint-on quelque chose sur le cuivre ? Même garde que `simXtRisques` : une
   surimpression qui survivrait au changement d'onglet désignerait du cuivre
   sous une fiche qui n'en parle pas. */
function simXtSurCuivre(){
  return !(typeof SIM==="undefined"||!SIM.ouvert||SIM.analyse!=="crosstalk"
           ||!SIM_XT.res||!SIM_XT.res.carte_chaleur);
}

/* La courbe d'une victime dans le sens PEINT, et sa valeur à une abscisse.
   On se cale sur le point CALCULÉ le plus proche, jamais sur une
   interpolation : la carte a une résolution, et inventer une valeur entre deux
   points la ferait lire plus fine qu'elle n'est. */
function simXtCourbeDe(net,sens){
  const c=SIM_XT.res&&SIM_XT.res.carte_chaleur;
  if(!c)return null;
  return (c.lignes||[]).filter(l=>l.victime===net&&l.sens===sens)[0]||null;
}
function simXtValeurA(ligne,total,s){
  const v=ligne&&ligne.valeurs;
  if(!v||!v.length)return 0;
  const i=Math.max(0,Math.min(v.length-1,
            Math.round((total>0?Math.max(0,Math.min(total,s))/total:0)
                       *(v.length-1))));
  return v[i]||0;
}

/* LA CHALEUR LE LONG DU CUIVRE. Un segment par pas d'échantillonnage, de la
   couleur de la valeur à cette abscisse-là : c'est la carte de chaleur du
   panneau, posée là où l'on corrige. Le maximum est celui de la CARTE ENTIÈRE
   et non celui de la victime — sans quoi la plus tranquille des victimes
   s'afficherait aussi rouge que la pire, ce qui est le contresens qu'une carte
   de chaleur ne doit pas faire.

   `conv` fait passer des millimètres à l'unité de dessin de l'outil, et `ep`
   donne l'épaisseur : le calcul est commun aux deux éditeurs, la conversion
   leur appartient. */
function simXtPeindreChaleur(c,conv,ep){
  if(!SIM_XT.chaleur||!simXtSurCuivre())return;
  const proj=simXtProjVictimes();
  const ch=SIM_XT.res.carte_chaleur;
  const axe=ch.axe||[];
  const total=axe.length?axe[axe.length-1]:0;
  const pire=Math.max(1e-12,ch.max||0);
  c.save();
  /* LES BOUTS SONT RONDS, ET C'EST CE QUI RETIRE LES MARCHES. Un segment tous
     les quarts de millimètre, coupé net, laisse une encoche à chaque coude et
     un bord d'escalier le long des obliques — le dessin paraît alors plus
     grossier que la mesure qu'il porte. Les bouts ronds se recouvrent d'une
     demi-épaisseur, soit sept centièmes de millimètre : le trait devient
     continu sans qu'aucune valeur ne déborde d'un pas d'échantillonnage. */
  c.lineCap="round";
  c.lineJoin="round";
  c.lineWidth=ep;
  for(const net of simXtVictimesVues()){
    const ligne=simXtCourbeDe(net,SIM_XT.sens);
    if(!ligne)continue;
    for(const m of (proj[net]||[])){
      for(let i=0;i+1<m.length;i++){
        const a=m[i], b=m[i+1];
        /* LE PIC ENTRE DEUX POINTS, JAMAIS LEUR MOYENNE : c'est la règle de
           toute cette section, et un pic moyenné est un pic qui disparaît. */
        c.strokeStyle=simXtCouleur(
          Math.max(simXtValeurA(ligne,total,a.s),
                   simXtValeurA(ligne,total,b.s))/pire);
        const p0=conv(a.x,a.y), p1=conv(b.x,b.y);
        c.beginPath();
        c.moveTo(p0[0],p0[1]);
        c.lineTo(p1[0],p1[1]);
        c.stroke();
      }
    }
  }
  c.restore();
}

/* LE POINT DE LA RÉGLETTE, SUR LE CUIVRE. Un par victime affichée — et DEUX si
   elle repasse deux fois à cette abscisse-là, ce qui est un fait du dessin et
   non un défaut : les deux morceaux couplent tous les deux.

   LA TOLÉRANCE EST CELLE DU PAS DE L'AXE, pas celle du pixel : la réglette
   avance par crans, et un point qui n'apparaîtrait qu'au millimètre exact
   clignoterait entre deux crans. */
function simXtCurseurPoints(){
  if(!simXtSurCuivre())return [];
  const proj=simXtProjVictimes();
  const ch=SIM_XT.res.carte_chaleur;
  const axe=ch.axe||[];
  const total=axe.length?axe[axe.length-1]:0;
  const s=simXtPos();
  const tol=Math.max(SIM_XT_PAS_TRAIT,
                     (axe.length>1?total/(axe.length-1):total)*0.75);
  const out=[];
  for(const net of simXtVictimesVues()){
    for(const m of (proj[net]||[])){
      let best=null;
      for(const p of m){
        const d=Math.abs(p.s-s);
        if(best===null||d<best.d)best={d:d, p:p};
      }
      if(best&&best.d<=tol)
        out.push({net:net, x:best.p.x, y:best.p.y,
                  couleur:simXtCouleurVictime(net)});
    }
  }
  return out;
}

/* Le point de l'AGRESSEUR à la même abscisse : c'est de SON parcours que
   l'abscisse est comptée, et sans lui on lit deux points sur des victimes sans
   savoir d'où ils se mesurent. */
function simXtCurseurAgresseur(){
  if(!simXtSurCuivre())return null;
  const g=simXtGeomBrute();
  if(!g||!g.parcours||!g.parcours.length)return null;
  const s=simXtPos();
  for(const e of g.parcours){
    const fin=e.s0+(e.longueur||0);
    if(s<e.s0-1e-9||s>fin+1e-9)continue;
    let reste=s-e.s0;
    const p=e.pts;
    for(let i=0;i+3<p.length;i+=2){
      const l=Math.hypot(p[i+2]-p[i],p[i+3]-p[i+1]);
      if(reste<=l||i+5>=p.length){
        const t=l>0?Math.max(0,Math.min(1,reste/l)):0;
        return {x:p[i]+(p[i+2]-p[i])*t, y:p[i+1]+(p[i+3]-p[i+1])*t};
      }
      reste-=l;
    }
  }
  return null;
}

/* Le dessin des points. TROIS TRAITS FINS PLUTÔT QU'UN GROS DISQUE : un cerne
   sombre qui le détache du fond, l'anneau de la victime, un cœur blanc. C'est
   un VISEUR, pas une pastille — il désigne un millimètre de piste, et une
   pastille de la taille d'un pad recouvre justement ce qu'on est venu voir.
   Son rayon est donné par l'outil EN UNITÉS DU MONDE mais calculé À TAILLE
   D'ÉCRAN : un repère qui grossit avec le zoom finit par cacher la piste sur
   laquelle il se pose, ce qui est exactement l'inverse de ce qu'on lui demande.

   CELUI DE L'AGRESSEUR EST CREUX — il dit « c'est d'ici que l'abscisse se
   compte », il ne dit pas « voilà du couplage ». */
function simXtPeindreCurseur(c,conv,r){
  if(!simXtSurCuivre())return;
  const pts=simXtCurseurPoints();
  const agr=simXtCurseurAgresseur();
  if(!pts.length&&!agr)return;
  c.save();
  c.lineJoin="round";
  c.lineCap="round";
  if(agr){
    const p=conv(agr.x,agr.y);
    /* DEUX CERCLES CONCENTRIQUES ET RIEN AU MILIEU : sur le cuivre de
       l'agresseur, qui est peint comme la piste sélectionnée, un anneau seul
       se confond avec un bord de piste. */
    c.strokeStyle="rgba(0,0,0,0.55)";
    c.lineWidth=r*0.42;
    c.beginPath(); c.arc(p[0],p[1],r*0.92,0,6.2832); c.stroke();
    c.strokeStyle="rgba(255,255,255,0.92)";
    c.lineWidth=r*0.24;
    c.beginPath(); c.arc(p[0],p[1],r*0.92,0,6.2832); c.stroke();
  }
  for(const q of pts){
    const p=conv(q.x,q.y);
    /* LE CERNE SOMBRE PASSE EN PREMIER, et il déborde : c'est lui qui rend le
       viseur lisible aussi bien sur une piste rouge vif que sur un fond noir,
       sans qu'aucune des deux couleurs utiles n'ait à être épaissie. */
    c.strokeStyle="rgba(0,0,0,0.6)";
    c.lineWidth=r*0.46;
    c.beginPath(); c.arc(p[0],p[1],r*0.80,0,6.2832); c.stroke();
    /* L'ANNEAU PORTE LA COULEUR DE LA VICTIME : trois points blancs identiques
       sur trois pistes ne disent pas lequel est lequel, et c'est justement la
       question qu'on pose en cochant les cases. */
    c.strokeStyle=q.couleur;
    c.lineWidth=r*0.30;
    c.beginPath(); c.arc(p[0],p[1],r*0.80,0,6.2832); c.stroke();
    c.beginPath();
    c.arc(p[0],p[1],r*0.42,0,6.2832);
    c.fillStyle="#fff";
    c.fill();
  }
  c.restore();
}

/* ==========================================================================
   LE RECOUPEMENT — CE QUE LES DEUX COURBES SE DISENT L'UNE À L'AUTRE
   --------------------------------------------------------------------------
   UNE COURBE DE COUPLAGE SEULE NE SE VÉRIFIE PAS : elle a des pics, ils sont
   quelque part, et rien à l'écran ne dit s'ils sont à leur place. Le profil
   d'espacement lui donne un témoin qui ne peut pas se tromper de la même
   façon — il vient de la géométrie, pas du calcul électromagnétique.

   DEUX VERDICTS, ET ILS NE DEMANDENT PAS LE MÊME GESTE. « Expliqué par le
   plan » désigne le BLINDAGE : c'est le cuivre de masse qu'il faut reprendre,
   pas l'écart entre les pistes. « Non justifié » ne désigne rien du tout — et
   c'est justement pour cela qu'il faut aller voir : ce qui reste après le
   dessin des pistes et le plan de référence, c'est un retour de courant qui
   fait le tour, une résonance, ou un artefact de la transformée.

   LE BLOC N'APPARAÎT QUE S'IL Y A QUELQUE CHOSE À DIRE. Un bloc « aucun
   désaccord » à chaque analyse finirait par ne plus se lire, et c'est
   exactement l'attention qu'on veut garder pour le jour où il y en a un. */
function simXtDesaccords(r){
  const liste=r.desaccords||[];
  if(!liste.length)return "";
  const hors=liste.filter(d=>d.verdict==="inexplique");
  const flou=liste.filter(d=>d.verdict==="indecidable");
  let h='<div class="simXtBloc"><b>Recoupement carte ↔ géométrie</b> '+
    '<span class="simNote">'+liste.length+" pic(s) relevé(s), dont "+
    hors.length+" que ni le dessin des pistes ni le plan de référence "+
    "n'expliquent"+
    (flou.length?", et "+flou.length+" dont on ne peut RIEN conclure — les "+
      "zones de vigilance couvrent trop du parcours pour qu'y tomber veuille "+
      "dire quelque chose":"")+
    ". Seule la ligne NEXT est recoupée : le FEXT ne localise "+
    "rien à vitesses égales.</span>";
  h+='<table class="simTab"><thead><tr><th>victime</th><th>position</th>'+
     "<th>écart mesuré</th><th>écart médian</th><th>verdict</th>"+
     "</tr></thead><tbody>";
  for(const d of liste)
    h+='<tr class="'+(d.verdict==="plan"?"":"simXtAlerte")+'"><td>'+
       simEsc(d.victime)+"</td><td>"+simNb(d.s,2)+" mm</td><td>"+
       (d.espacement===null||d.espacement===undefined
         ? "— (rien ne longe)" : simNb(d.espacement,3)+" mm")+
       "</td><td>"+simNb(d.median,3)+" mm</td><td>"+
       (d.verdict==="plan"
         ? "expliqué par « "+simEsc(d.zone)+" »"
         : d.verdict==="indecidable"
           ? "<b>indécidable</b> — « "+simEsc(d.zone)+" », mais partout"
           : "<b>non justifié</b>")+"</td></tr>";
  h+="</tbody></table>";
  for(const d of liste)
    h+='<p class="simNote">· '+simNb(d.s,2)+" mm sur <b>"+
       simEsc(d.victime)+"</b> : "+simEsc(d.detail||"")+
       " (recoupé à ±"+simNb(d.tolerance,2)+" mm, soit la résolution "+
       "spatiale de cette ligne).</p>";
  return h+"</div>";
}

/* ==========================================================================
   LES DEUX TABLEAUX, ET ILS RESTENT DEUX
   --------------------------------------------------------------------------
   C'est la contrainte la plus importante de cette section, et elle se voit
   ici : la présélection GÉOMÉTRIQUE et la confirmation par SIMULATION sont
   deux tableaux distincts. Fusionnés, on ne saurait plus si une piste absente
   du résultat est LOIN ou PROCHE ET BLINDÉE — et ce sont deux gestes de
   routage opposés : écarter davantage dans le premier cas, ajouter du cuivre
   de masse dans le second.
   ========================================================================== */
function simXtTableauCandidats(r){
  const liste=(r.etape0&&r.etape0.candidats)||[];
  const s=(r.etape0&&r.etape0.seuils)||{};
  let h='<div class="simXtBloc"><b>Étape 0a — ce qui longe</b> '+
    '<span class="simNote">seuil de distance '+simNb(s.distance_max,3)+
    " mm, "+simEsc(s.source||"")+" ; longement minimal "+
    simEsc(s.longueur_min_source||"")+" ; couches adjacentes "+
    (s.couches_adjacentes?"comprises":"EXCLUES")+" ; "+
    ((r.etape0&&r.etape0.regardes)||0)+" tronçons regardés.</span>";
  if(!liste.length)
    return h+'<p class="simNote">Aucun cuivre ne passe à portée de la '+
      "sélection.</p></div>";
  const esp=(r.etape0&&r.etape0.espacements)||{};
  h+='<table class="simTab"><thead><tr><th>piste</th><th>couche</th>'+
     "<th>type</th><th>côté</th><th>distance</th><th>écart médian</th>"+
     "<th>longement</th><th>retenue</th></tr></thead><tbody>";
  for(const c of liste){
    const e=esp[c.net];
    h+='<tr class="'+(c.retenu?"":"simXtHors")+'"><td>'+simEsc(c.net)+
       (c.paire?' <span class="simTag">paire</span>':"")+
       (c.role==="agresseur"?' <span class="simTag">agresseur</span>':"")+
       "</td><td>"+simEsc(c.nom_couche||("couche "+c.couche))+"</td><td>"+
       simEsc(c.type)+"</td><td>"+simEsc(c.cote||"—")+"</td><td>"+
       simNb(c.distance,3)+" mm</td><td>"+
       /* LA DISTANCE EST LE MINIMUM, L'ÉCART MÉDIAN EST CE QUE LA PISTE FAIT
          LA PLUPART DU TEMPS. Les deux ensemble disent si le longement est
          régulier ou s'il tient à un seul resserrement — et c'est ce dernier
          cas qui se corrige d'un coup de souris. */
       (e?simNb(e.median,3)+" mm <span class=\"simNote\">("+
          simNb(e.min,3)+"…"+simNb(e.max,3)+")</span>"
         :'<span class="simNote">—</span>')+
       "</td><td>"+simNb(c.longueur,2)+" mm</td><td>"+
       (c.retenu?"oui":simEsc(c.raison||"non"))+"</td></tr>";
  }
  h+="</tbody></table>";
  const sans=liste.filter(c=>c.retenu&&!esp[c.net]);
  if(sans.length)
    h+='<p class="simNote">· Pas de profil d\'espacement pour '+
       sans.map(c=>"<b>"+simEsc(c.net)+"</b>").join(", ")+" : le "+
       "recouvrement d'une couche adjacente se mesure en LONGUEUR et non en "+
       "abscisse — on ne saurait pas où le poser sur l'axe, et une position "+
       "inventée serait pire que pas de profil du tout. La distance mesurée, "+
       "elle, est dans la colonne ci-dessus.</p>";
  return h+"</div>";
}

function simXtTableauCouples(r){
  const liste=r.couples||[];
  let h='<div class="simXtBloc"><b>Étape 0b — ce qui couple</b> '+
    '<span class="simNote">seuil de confirmation '+
    simNb((r.reglages&&r.reglages.seuil_db)||-40,1)+" dB. Une piste sous le "+
    "seuil garde sa ligne AVEC son niveau : elle est écartée du verdict et de "+
    "la carte, pas du résultat.</span>";
  if(!liste.length)
    return h+'<p class="simNote">Rien n\'a été simulé — voir ci-dessus.</p>'+
      "</div>";
  /* LA COLONNE « AU GENOU » N'APPARAÎT QUE S'IL Y A UN GENOU À MONTRER : elle
     demande un temps de montée SAISI, faute de quoi le genou se déduirait de
     la bande et vaudrait la bande elle-même — une colonne qui recopie sa
     voisine. Ce qu'elle dit vaut le détour : les décibels de gauche sont le
     maximum sur TOUTE la bande analysée, et la bande analysée se règle pour la
     résolution spatiale, pas pour le signal. Un couplage annoncé à −13 dB qui
     n'existe qu'à 80 GHz sur un front de 9 ns est juste, et trompeur. */
  const genou=r.f_genou>0&&liste.some(c=>c.pire_db_genou!==undefined);
  h+='<table class="simTab"><thead><tr><th>agresseur</th><th>victime</th>'+
     "<th>NEXT</th><th>FEXT</th><th>bruit</th>"+
     (genou?"<th>pire à</th><th>≤ genou</th>":"")+
     "<th>v agresseur</th><th>v victime</th>"+
     "<th>écart</th><th>confirmée</th></tr></thead><tbody>";
  for(const c of liste){
    const seuil=(r.reglages&&r.reglages.ecart_vitesse_max)||0.05;
    const ecart=c.ecart_vitesse||0;
    /* LA COLONNE « BRUIT » EST LE PIRE DES DEUX SENS, EN VOLTS, et jamais leur
       somme : le NEXT s'observe au bout proche de la victime, le FEXT à son
       bout lointain. Additionner deux tensions qui n'arrivent pas sur la même
       broche donnerait un chiffre qui n'existe nulle part. */
    const pireV=simXtRatio(c.pire_db);
    h+='<tr class="'+(c.confirmee?"":"simXtHors")+'"><td>'+
       simEsc(c.agresseur)+"</td><td>"+simEsc(c.victime)+
       (c.paire?' <span class="simTag">paire</span>':"")+"</td><td>"+
       simNb(c.next_db,1)+" dB</td><td>"+simNb(c.fext_db,1)+" dB</td>"+
       '<td class="'+(c.confirmee&&pireV>simSeuilFraction()?"z0ko":"")+'">'+
       simEsc(simXtTension(pireV))+"</td>"+
       (genou
         ? '<td class="'+(c.f_pire>1.5*r.f_genou?"simXtAlerte":"")+'">'+
           (c.f_pire?simNb(c.f_pire/1e9,3)+" GHz":"—")+"</td><td>"+
           (c.pire_db_genou===undefined?"—":simNb(c.pire_db_genou,1)+" dB")+
           "</td>"
         : "")+
       "<td>"+
       (c.vitesse_agresseur?simNb(c.vitesse_agresseur/1e6,1)+"·10⁶":"—")+
       "</td><td>"+
       (c.vitesse_victime?simNb(c.vitesse_victime/1e6,1)+"·10⁶":"—")+
       '</td><td class="'+(ecart>seuil?"simXtAlerte":"")+'">'+
       simNb(100*ecart,1)+" %</td><td>"+
       (c.confirmee?"oui":simEsc(c.raison||"non"))+"</td></tr>";
  }
  h+="</tbody></table>";
  h+='<p class="simNote">· <b>« bruit »</b> est le pire des deux sens converti '+
     "en volts par l'amplitude saisie ("+simEsc(simTension(SIM.saisie.swing))+
     ") — pas leur somme : ils n'arrivent pas sur la même broche. C'est le "+
     "seul chiffre de ce tableau qui se compare à une fiche technique, et le "+
     "seul qui bouge quand on change l'amplitude sans toucher au cuivre.</p>";
  if(genou)
    h+='<p class="simNote">· <b>« pire à »</b> est la fréquence où le couplage '+
       "est le plus fort, et <b>« ≤ genou »</b> ce qu'il vaut en dessous de "+
       simNb(r.f_genou/1e9,3)+" GHz — le genou du front saisi (0,35 / t"+
       "<sub>r</sub>). Au-delà, votre signal ne porte rien : la carte y gagne "+
       "en résolution spatiale, les décibels n'y gagnent pas en vérité.</p>";
  /* L'ÉCART ENTRE DEUX VICTIMES SE LIT TOUJOURS, ET NE S'ALERTE QUE PARFOIS.
     Un agresseur équidistant de ses deux voisines à tout instant est
     l'exception : quand les profils d'espacement annoncent l'écart, le
     signaler ferait chercher une dissymétrie de plan qui n'existe pas. */
  for(const a of r.asymetries||[])
    h+='<p class="'+(a.explique?"simNote":"simErr")+'">· <b>'+
       (a.explique?"Écart annoncé par la géométrie":"ASYMÉTRIE non expliquée")+
       "</b> : "+simEsc(a.detail)+".</p>";
  return h+"</div>";
}

/* CE QUE LA MATRICE VÉRIFIE, ET IL FAUT LE LIRE AVANT LA CARTE. Une matrice
   non passive rend une réponse temporelle qui diverge, et cela ne se voit PAS
   sur la carte : elle reste lisse et colorée. */
function simXtValidation(r){
  const v=r.validation;
  if(!v)return "";
  const b=v.bande||{};
  const oui=x=>x?'<span class="simOk">oui</span>'
                :'<span class="simKo">NON</span>';
  let h='<div class="simXtBloc"><b>La matrice</b><table class="simTab">'+
    "<tbody>";
  h+="<tr><td>passive (σ ≤ 1)</td><td>"+oui(v.passivite&&v.passivite.ok)+
     "</td><td>σ<sub>max</sub> = "+simNb((v.passivite||{}).sigma_max,6)+
     " à "+simFreq((v.passivite||{}).f||0)+"</td></tr>";
  h+="<tr><td>réciproque (S = Sᵀ)</td><td>"+oui(v.reciprocite&&v.reciprocite.ok)+
     "</td><td>écart "+simNb((v.reciprocite||{}).ecart,6)+" à "+
     simFreq((v.reciprocite||{}).f||0)+"</td></tr>";
  h+="<tr><td>pas fréquentiel constant</td><td>"+oui(b.constant)+
     "</td><td>"+simFreq(b.pas||0)+" × "+(b.points||0)+" points, jusqu'à "+
     simFreq(b.f_max||0)+"</td></tr>";
  /* LE CONTINU N'EST PLUS UNE EXTRAPOLATION mais une CONSTRUCTION : c'est le
     serveur qui choisit où échantillonner, et il part de zéro. La ligne reste
     — un invariant qu'on ne vérifie plus est un invariant qui finit par
     tomber. */
  h+="<tr><td>continu présent</td><td>"+oui(b.f_min===0)+"</td><td>"+
     (b.f_min===0
       ? "la grille part du continu, par construction"
       : "elle démarre à "+simFreq(b.f_min||0)+" — la ligne de base de la "+
         "réponse temporelle est décalée")+"</td></tr>";
  return h+"</tbody></table></div>";
}

function simXtMasse(r){
  const m=r.masse;
  if(!m)return "";
  let h='<div class="simXtBloc"><b>Plan de référence</b> '+
    '<span class="simNote">seuil de pas de couture '+simNb(m.seuil,2)+
    " mm, tiré de "+simEsc(m.source||"")+
    /* D'OÙ SORT LE SEUIL, ET CE QUE L'AUTRE RÈGLE AURAIT DIT. C'est le haut
       de bande qui le fixe le plus souvent, et le haut de bande se règle deux
       centimètres plus haut dans le même panneau : sans cette ligne, on part
       chercher dans le cuivre la cause d'une alarme qui vient d'un champ. */
    (m.ecarte?" ("+simEsc(m.ecarte)+")":"")+
    ". Ces contrôles sont "+
    "INDÉPENDANTS du couplage : le blindage est déjà dans la matrice S, et le "+
    "compter deux fois serait le compter faux.</span>";
  if(!(m.mesure||[]).length)
    return h+'<p class="simErr">Rien n\'a pu être examiné : la page n\'envoie '+
      "ni positions de couture, ni discontinuités, ni vias de masse. "+
      "L'absence de zone sur la carte ne veut donc pas dire qu'il n'y en a "+
      "pas.</p></div>";
  h+='<p class="simNote">Examiné : '+simEsc(m.mesure.join(" ; "))+".</p>";
  if(!(m.zones||[]).length)
    return h+'<p class="simNote">Aucune zone de vigilance.</p></div>';
  /* LA PART COUVERTE, AVANT LE TABLEAU. Deux lignes identiques à l'œil sont
     les DEUX CÔTÉS du parcours, et sans la colonne « côté » elles se lisent
     comme un doublon — donc comme un bug. Et quand l'union couvre presque
     tout, la fiche doit le dire ici aussi : c'est le tableau qu'on relit pour
     savoir ce que vaut un « expliqué par le plan » écrit plus haut. */
  if(m.couvert>0)
    h+='<p class="simNote'+(m.vain?" simXtAlerte":"")+'">Union des zones : '+
       simNb(100*m.couvert,0)+" % du parcours"+
       (m.vain?" — <b>trop pour qu'une coïncidence explique quoi que ce "+
         "soit</b> : les pics qui y tombent sont dits INDÉCIDABLES, pas "+
         "« expliqués par le plan »."
              :".")+"</p>";
  h+='<table class="simTab"><thead><tr><th>type</th><th>côté</th><th>de</th>'+
     "<th>à</th><th>ce qui a été vu</th></tr></thead><tbody>";
  for(const z of m.zones)
    h+="<tr><td>"+simEsc(z.type)+"</td><td>"+simEsc(z.cote||"—")+"</td><td>"+
       simNb(z.s0,2)+" mm</td><td>"+
       simNb(z.s1,2)+" mm</td><td>"+simEsc(z.detail||"")+"</td></tr>";
  return h+"</tbody></table></div>";
}

function simXtHypotheses(r){
  if(!(r.hypotheses||[]).length)return "";
  let h='<details class="simXtHyp"><summary>Sous quelles hypothèses '+
        "</summary><ul>";
  for(const x of r.hypotheses)h+="<li>"+simEsc(x)+"</li>";
  return h+"</ul></details>";
}

/* ==========================================================================
   LES QUATRE SORTIES
   --------------------------------------------------------------------------
   LE .CSV EST LA DONNÉE BRUTE, et c'est le seul qui compte pour recouper avec
   le dessin : une colonne de positions, une colonne par (victime, sens), une
   colonne d'ESPACEMENT par victime, et une dernière qui dit à quelle zone de
   vigilance chaque position appartient. C'est ce qu'on ouvre à côté du layout
   pour aller voir le millimètre que la carte a désigné.

   L'ESPACEMENT EST DANS LE MÊME FICHIER, ET C'EST TOUT L'INTÉRÊT. Séparé, il
   faudrait le réaligner à la main sur l'axe des positions — et un désalignement
   d'une colonne ferait conclure à un désaccord qui n'existe pas. Une case vide
   n'est PAS un zéro : c'est « la victime ne longe pas ici ».

   L'EN-TÊTE PORTE LES HYPOTHÈSES. Un fichier se détache de la page qui l'a
   produit ; sans la bande, la fenêtre, la résolution et la source de la
   matrice, il ne reste que des nombres dont on ne peut plus vérifier sur quoi
   ils ont été obtenus.
   ========================================================================== */
function simXtNomFichier(ext){
  const net=(SIM_XT.res&&SIM_XT.res.principal)||"";
  const carte=(SIM_XT.res&&SIM_XT.res.carte)||
              (SIM_ED&&SIM_ED.carte?SIM_ED.carte():"")||"carte";
  const propre=s=>String(s).replace(/[^\w.-]+/g,"_").replace(/^_+|_+$/g,"");
  return (propre(carte)||"carte")+(net?"-"+propre(net):"")+ext;
}

function simXtExportCsv(){
  const r=SIM_XT.res, c=r&&r.carte_chaleur;
  if(!c||!c.lignes||!c.lignes.length){
    SIM_XT.err=r?"Rien à enregistrer : aucune candidate n'a de profil."
                :"Rien à enregistrer : analysez d'abord.";
    simRendre();return;
  }
  const n=v=>String(v).replace(".",",");
  const zoneEn=x=>(c.zones||[]).filter(z=>x>=z.s0&&x<=z.s1)
                    .map(z=>z.type).join("+");
  const l=[];
  l.push("# carte de crosstalk — "+(r.carte||"")+" — agresseur "+
         (r.principal||""));
  l.push("# source : "+(r.source||""));
  l.push("# bande : jusqu'a "+simFreq((r.validation&&r.validation.bande
          &&r.validation.bande.f_max)||0)+", "+
         ((r.validation&&r.validation.bande&&r.validation.bande.points)||0)+
         " points ; fenetre "+((r.reglages||{}).fenetre||"")+
         " ; padding x"+((r.reglages||{}).zero_pad||1));
  for(const ligne of c.lignes)
    l.push("# resolution "+ligne.victime+" "+ligne.sens+" : "+
           n(ligne.resolution)+" mm");
  l.push("# les amplitudes sont rapportees a l'amplitude de l'agresseur");
  /* LES VOLTS DANS LE FICHIER, ET L'AMPLITUDE QUI LES A FAITS EN TETE. Une
     colonne de tensions sans le facteur qui les produit n'est pas
     verifiable : six mois plus tard, on ne sait plus si « 14 mV » sortait
     d'un 3,3 V ou d'un 1,8 V, et les deux se relisent aussi bien. */
  l.push("# amplitude de l'agresseur : "+n(SIM.saisie.swing)+" V"+
         " — les colonnes *_V en sont le produit par le rapport de gauche");
  l.push("# seuil applique : "+simSeuilNom()+" = "+
         n(Number((simSeuilFraction()*SIM.saisie.swing).toPrecision(6)))+" V");
  /* LES COLONNES SOUS LE SEUIL SE DISENT ICI. Le fichier porte toutes les
     candidates, confirmees ou non — c'est ce qui permet de recouper une
     voisine ecartee de justesse —, et une colonne qui ne dit pas qu'elle est
     sous le seuil se lit comme les autres. */
  const hors=[];
  for(const ligne of c.lignes)
    if(ligne.confirmee===false&&hors.indexOf(ligne.victime)<0)
      hors.push(ligne.victime);
  if(hors.length)
    l.push("# SOUS LE SEUIL de "+n((r.reglages||{}).seuil_db)+" dB, donc"+
           " comptees nulle part : "+hors.join(", ")+
           " — leurs colonnes sont la, leur niveau aussi");
  l.push("# ecart_* = espacement mesure sur la GEOMETRIE, en mm, bord a bord ;"+
         " vide = la victime ne longe pas a cette abscisse (ce n'est pas un"+
         " zero)");
  /* LES VICTIMES QUI ONT UN PROFIL, DANS L'ORDRE DES LIGNES : le fichier doit
     se lire de gauche à droite comme la carte se lit de haut en bas. */
  const esp=c.espacements||{};
  const nets=[];
  for(const ligne of c.lignes)
    if(esp[ligne.victime]&&nets.indexOf(ligne.victime)<0)
      nets.push(ligne.victime);
  const pic=x=>(r.desaccords||[])
    .filter(d=>Math.abs(d.s-x)<=(d.tolerance||0))
    .map(d=>d.victime+":"+d.verdict).join("+");
  /* DEUX COLONNES PAR COURBE : le RAPPORT, qui ne dépend que du cuivre, et la
     TENSION, qui est ce rapport multiplié par l'amplitude saisie. On garde les
     deux — le rapport est ce qui se recoupe avec un autre solveur, la tension
     est ce qui se compare à une fiche technique —, et l'en-tête dit lequel est
     lequel. Une seule des deux obligerait à refaire à la main la
     multiplication ou la division. */
  const V=SIM.saisie.swing||0;
  l.push(["position_mm"].concat(
    c.lignes.map(x=>x.victime+"_"+x.sens),
    c.lignes.map(x=>x.victime+"_"+x.sens+"_V"),
    nets.map(net=>"ecart_"+net),
    ["zone_vigilance","pic_recoupe"]).join(";"));
  (c.axe||[]).forEach(function(x,i){
    l.push([n(x)].concat(
      c.lignes.map(ligne=>n(ligne.valeurs[i])),
      c.lignes.map(ligne=>
        n(Number((V*(ligne.valeurs[i]||0)).toPrecision(6)))),
      nets.map(function(net){
        const v=esp[net].valeurs[i];
        return (v===null||v===undefined)?"":n(v);
      }),
      [zoneEn(x),pic(x)]).join(";"));
  });
  simTelecharger("﻿"+l.join("\r\n")+"\r\n",
                 simXtNomFichier("-crosstalk.csv"),
                 "text/csv;charset=utf-8");
}

/* ==========================================================================
   LE RAPPORT COMPLET, EN TEXTE
   --------------------------------------------------------------------------
   IL EXISTE PARCE QUE LA FICHE S'EST RACCOURCIE, et il n'aurait pas de sens
   sans elle. À l'écran, on veut le verdict, ce qui le rend douteux, et la
   carte ; tout le reste est là mais replié. Ce fichier-là est l'inverse : il
   déroule tout, dans l'ordre où on le relit — et il se joint à une revue de
   conception, où l'on ne peut ni déplier ni survoler une infobulle.

   TEXTE BRUT, ET C'EST DÉLIBÉRÉ. Il se colle dans un courriel, un ticket, un
   commentaire de netlist ; il se compare d'une version à l'autre avec
   n'importe quel outil de diff, ce qu'aucun PDF ne permet. Les réglages y
   sont : un rapport qui ne dit pas sous quelles règles il a été produit n'est
   plus vérifiable dès qu'on l'a sorti de la page.

   IL SE LIT EN DEUX TEMPS, ET C'EST TOUT SON PLAN. Les quatre premières
   sections tiennent sur un écran et répondent seules aux trois questions
   qu'on se pose — y a-t-il un risque, qu'est-ce que je reprends, à quoi dois-je
   me méfier. Ce qui suit, ce sont les PIÈCES : les tableaux, la validation de
   la matrice, le plan, les ports. On n'y descend que lorsqu'on conteste un
   chiffre du haut, ou qu'on relit le dossier six mois plus tard — et c'est
   exactement pour ces deux moments-là que le fichier existe.
   ========================================================================== */
function simXtRapportTexte(r){
  const L=[];
  const t=(x)=>L.push(x);
  const trait=(c)=>t(new Array(74).join(c||"-"));
  const nb=(v,d)=>simNb(v,d);
  const n=simXtNiveau(r);

  trait("=");
  t("RAPPORT DE CROSSTALK — " + (r.carte||"carte sans nom"));
  trait("=");
  t("Agresseur analysé    : "+(r.principal||"—"));
  t("Longueur du parcours : "+nb(r.longueur,2)+" mm");
  t("Source de la matrice : "+(r.source||"—"));
  t("Produit le           : "+new Date().toLocaleString("fr-FR"));
  t("");
  t(simXtMethode(r));
  t("");
  t("Les quatre premières sections se lisent seules : le verdict, ce qu'il y a");
  t("à faire, ce qui rend le résultat douteux, et sous quels réglages il a été");
  t("produit. Le reste, ce sont les pièces — on y descend pour contester un");
  t("chiffre, ou pour relire le dossier plus tard.");
  t("");

  trait("=");
  t("LE VERDICT");
  trait("=");
  t(n.nom+((r.graves||[]).length?"  (SOUS RÉSERVE — voir ci-dessous)":""));
  if(n.pire){
    t("Le pire est « "+n.pire.victime+" », qui prend "+nb(100*n.ratio,1)+
      " % de « "+n.pire.agresseur+" » ("+nb(n.pire.pire_db,1)+" dB).");
    /* LE VERDICT EN VOLTS, ET LES DEUX CHIFFRES QUI LE FONT. Un rapport de
       conception se relit sans la page qui l'a produit : l'amplitude et le
       seuil doivent donc y être écrits, faute de quoi « 14 mV » ne se vérifie
       plus. */
    t("Soit "+simTension(n.volts)+" sur une amplitude d'agresseur de "+
      simTension(SIM.saisie.swing)+", contre "+n.seuil+" = "+
      simTension(n.budget*(SIM.saisie.swing||0))+".");
  }else
    t("Aucune voisine ne dépasse le seuil de confirmation.");
  t("");

  const faire=r.actions||[];
  trait("=");
  t("CE QU'IL Y A À FAIRE ("+faire.length+")");
  trait("=");
  if(!faire.length)
    t("Rien à reprendre en un point précis. Sur un résultat confirmé, cela"+
      " veut dire\r\nque le couplage est réparti sur tout le longement sans"+
      " point chaud : il se\r\ncorrige en écartant PARTOUT, ou en reculant la"+
      " victime.");
  faire.forEach(function(x,i){
    t((i+1)+". "+x.quoi.toUpperCase()+"  "+x.cible+"  —  "+x.ou);
    t("   "+x.pourquoi);
  });
  if(faire.length)
    t("L'ordre est celui de l'EFFET : écarter une piste sous un pic que le"+
      " dessin\r\nn'explique pas ne changerait rien.");
  t("");

  const g=r.graves||[];
  const gTitre=x=>typeof x==="string"?x:(x.titre||x.texte||"");
  const gTexte=x=>typeof x==="string"?x:(x.texte||x.titre||"");
  trait("=");
  t("CE QUI CHANGE LA LECTURE DE CE RÉSULTAT ("+g.length+")");
  trait("=");
  if(!g.length)t("Rien : aucune réserve n'a été levée.");
  for(const a of g){
    t("· "+gTitre(a));
    t("  "+gTexte(a));
  }
  t("");

  const textes=g.map(gTexte);
  const autres=(r.avertissements||[]).filter(a=>textes.indexOf(a)<0);
  if(autres.length){
    trait("=");
    t("LES AUTRES AVERTISSEMENTS ET AVIS ("+autres.length+")");
    trait("=");
    for(const a of autres)t("· "+a);
    t("");
  }

  const rg=(r.reglages||{});
  trait("=");
  t("SOUS QUELS RÉGLAGES");
  trait("=");
  t("Seuil de confirmation      : "+nb(rg.seuil_db,1)+" dB");
  /* LES DEUX RÉGLAGES QUI NE SONT PAS PARTIS AU SERVEUR, écrits avec les
     autres et non ailleurs : ils ne changent pas le calcul, mais ils changent
     le VERDICT — et un rapport qui tait le seuil sous lequel il conclut n'est
     plus vérifiable une fois sorti de la page. */
  t("Amplitude de l'agresseur   : "+simTension(SIM.saisie.swing)+
    "   (convertit les rapports en volts ; n'entre pas dans le calcul)");
  t("Seuil du verdict           : "+simSeuilNom()+" = "+
    simTension(simSeuilFraction()*(SIM.saisie.swing||0)));
  t("Impédance de référence     : "+nb(rg.z0,1)+" Ω");
  t("Fenêtre                    : "+(rg.fenetre||"—")+
    (rg.fenetre==="kaiser"?"  (β = "+nb(rg.kaiser_beta,2)+")":"")+
    "   zero-padding ×"+nb(rg.zero_padding,0));
  t("Résolution visée           : "+
    (rg.resolution_cible>0?nb(rg.resolution_cible,2)+" mm":"aucune"));
  t("Écart de vitesse toléré    : "+nb(100*(rg.ecart_vitesse_max||0),1)+" %");
  t("Seuil d'asymétrie          : "+nb(rg.asymetrie_db,1)+" dB");
  t("Rapport de désaccord       : "+nb(rg.desaccord,2)+" ×");
  t("Seuil de zone à risque     : "+nb(100*(rg.risque||0),0)+" % du pire point");
  const seuils=((r.etape0||{}).seuils)||{};
  t("Présélection, distance     : "+nb(seuils.distance_max,3)+" mm"+
    (seuils.distance_deduite?"  (déduite)":"  (saisie)"));
  t("Présélection, longement    : "+
    (seuils.longement_min>0?nb(seuils.longement_min,3)+" mm":"déduit, candidat par candidat"));
  t("");

  const v=r.validation||{};
  if(v.bande){
    trait("=");
    t("CE QUE LA MATRICE VÉRIFIE");
    trait("=");
    t("Bande        : "+nb(v.bande.pas/1e9,3)+" GHz × "+v.bande.points+
      " points, jusqu'à "+nb(v.bande.f_max/1e9,3)+" GHz");
    t("Continu      : "+(v.bande.dc?"présent, par construction":"ABSENT"));
    if(v.passivite)
      t("Passivité    : "+(v.passivite.ok?"oui":"NON")+
        "   σmax = "+nb(v.passivite.sigma_max,6)+" à "+
        nb(v.passivite.f/1e9,3)+" GHz");
    if(v.reciprocite)
      t("Réciprocité  : "+(v.reciprocite.ok?"oui":"NON")+
        "   écart "+nb(v.reciprocite.ecart,6));
    t("");
  }

  const cand=((r.etape0||{}).candidats)||[];
  if(cand.length){
    trait("=");
    t("ÉTAPE 0a — CE QUI LONGE ("+cand.length+" candidate(s))");
    trait("=");
    for(const c of cand)
      t((c.retenue?"[retenue] ":"[écartée] ")+c.net+
        "   couche "+(c.nom_couche||"—")+
        "   "+(c.type||"")+" "+(c.cote||"")+
        "   distance "+nb(c.distance,3)+" mm"+
        "   longement "+nb(c.longueur,2)+" mm"+
        (c.raison?"\n            "+c.raison:""));
    t("");
  }

  const cpl=r.couples||[];
  if(cpl.length){
    trait("=");
    t("ÉTAPE 0b — CE QUI COUPLE ("+cpl.length+" couple(s))");
    trait("=");
    for(const c of cpl){
      t((c.confirmee?"[confirmée] ":"[écartée]   ")+
        c.agresseur+" → "+c.victime+
        "   NEXT "+nb(c.next_db,1)+" dB   FEXT "+nb(c.fext_db,1)+" dB"+
        (c.pire_db!==undefined?"   pire "+nb(c.pire_db,1)+" dB ("+
         nb(100*simXtRatio(c.pire_db),2)+" % = "+
         simXtTension(simXtRatio(c.pire_db))+")":""));
      if(c.f_pire)
        t("            pire point à "+nb(c.f_pire/1e9,3)+" GHz"+
          (c.pire_db_genou!==undefined
            ? "   sous le genou : "+nb(c.pire_db_genou,1)+" dB"
            : "   (aucun point de la grille sous le genou)"));
      if(c.vitesse_agresseur)
        t("            v agresseur "+nb(c.vitesse_agresseur/1e6,1)+
          "·10⁶ m/s   v victime "+nb(c.vitesse_victime/1e6,1)+
          "·10⁶ m/s   écart "+nb(100*(c.ecart_vitesse||0),1)+" %");
      if(c.resolution_next)
        t("            résolution "+nb(c.resolution_next,2)+" mm (NEXT), "+
          (c.resolution_fext?nb(c.resolution_fext,2)+" mm (FEXT)"
                            :"pas d'axe pour le FEXT"));
      if(c.fext_localise===false&&c.fext_raison)
        t("            FEXT sans axe : "+c.fext_raison);
      if(!c.confirmee&&c.raison)t("            "+c.raison);
    }
    t("");
  }

  const d=r.desaccords||[];
  trait("=");
  t("RECOUPEMENT CARTE ↔ GÉOMÉTRIE ("+d.length+" pic(s))");
  trait("=");
  if(!d.length)
    t("Aucun pic relevé : la carte et le profil d'espacement ne se "+
      "contredisent nulle part.");
  for(const x of d)
    t("· "+x.victime+" à "+nb(x.s,2)+" mm — "+
      (x.verdict==="plan"?"expliqué par « "+x.zone+" »"
       :x.verdict==="indecidable"?"INDÉCIDABLE (« "+x.zone+" », mais les "+
                                  "zones sont partout)"
       :"NON JUSTIFIÉ")+
      "\n  "+(x.detail||"")+"  (recoupé à ±"+nb(x.tolerance,2)+" mm)");
  t("");

  const zr=r.risques||[];
  if(zr.length){
    trait("=");
    t("LES PLAGES À RISQUE, SUR LE CUIVRE ("+zr.length+")");
    trait("=");
    for(const z of zr)
      t("· "+z.victime+"   de "+nb(z.s0,2)+" à "+nb(z.s1,2)+" mm   "+
        nb(z.niveau_db,1)+" dB ("+
        simXtTension(simXtRatio(z.niveau_db))+")   "+
        (z.justifie?"le dessin des pistes l'explique (écarter)"
                   :"NON expliqué par le dessin des pistes")+
        (z.zone?"   zone « "+z.zone+" » au même endroit":""));
    t("");
  }

  const m=r.masse;
  if(m){
    trait("=");
    t("LE PLAN DE RÉFÉRENCE");
    trait("=");
    t("Seuil de pas de couture : "+nb(m.seuil,2)+" mm, tiré de "+(m.source||"—"));
    if(m.ecarte)t("                          "+m.ecarte);
    t("Examiné : "+((m.mesure||[]).join(" ; ")||
                    "RIEN — la page n'envoie aucune mesure"));
    if(m.couvert>0)
      t("Union des zones : "+nb(100*m.couvert,0)+" % du parcours"+
        (m.vain?"  — trop pour qu'une coïncidence explique quoi que ce soit":""));
    for(const z of (m.zones||[]))
      t("· "+z.type+"  "+(z.cote||"—")+"  de "+nb(z.s0,2)+" à "+nb(z.s1,2)+
        " mm : "+(z.detail||""));
    t("");
  }

  const mp=r.mapping||{};
  if((mp.ports||[]).length){
    trait("=");
    t("LES PORTS, TELS QU'ILS ONT ÉTÉ POSÉS");
    trait("=");
    for(const pt of mp.ports)
      t("· port "+pt.indice+"  "+pt.net+"  ("+pt.bout+")");
    t("");
  }

  if((r.hypotheses||[]).length){
    trait("=");
    t("SOUS QUELLES HYPOTHÈSES");
    trait("=");
    for(const x of r.hypotheses)t("· "+x);
    t("");
  }
  return L.join("\r\n")+"\r\n";
}

function simXtExportRapport(){
  const r=SIM_XT.res;
  if(!r){
    SIM_XT.err="Rien à rapporter : lancez l'analyse d'abord.";
    simRendre();
    return;
  }
  simTelecharger("\ufeff"+simXtRapportTexte(r),
                 simXtNomFichier("-crosstalk.txt"),
                 "text/plain;charset=utf-8");
}

/* LE .sNp EST UNE SORTIE, ET LA SEULE FAÇON DONT UN TOUCHSTONE TOUCHE ENCORE
   CETTE SECTION. Il porte le réseau généré ici, avec ses ports nommés en
   en-tête — ce qu'aucun Touchstone ne dit de lui-même —, pour aller le
   comparer ailleurs à ce qu'un solveur pleine onde rendrait de la même
   géométrie. L'inverse, faire dépendre la carte d'un fichier qu'on n'a pas
   produit, est justement ce qui n'existe plus. */
function simXtExportSnp(){
  const r=SIM_XT.res;
  if(!r||!r.touchstone){
    SIM_XT.err=r
      ? "Rien à enregistrer : aucun réseau n'a été synthétisé — la "+
        "présélection n'a retenu aucune victime."
      : "Rien à enregistrer : analysez d'abord.";
    simRendre();return;
  }
  const n=(r.mapping&&r.mapping.fichier_ports)||2;
  simTelecharger(r.touchstone,simXtNomFichier(".s"+n+"p"),"text/plain");
}

function simXtExportJson(){
  const doc=SIM_XT.doc||(simXtProbleme()||{}).doc;
  if(!doc){simRendre();return;}
  simTelecharger(JSON.stringify(doc,null,1),
                 simXtNomFichier("-crosstalk.json"),"application/json");
}

const SIM_FAMILLES=[
  {cle:"si", court:"SI", nom:"Intégrité du signal",
   quoi:"Ce qu'un front devient en parcourant le cuivre : impédance, retard, "+
        "pertes, réflexions.",
   /* TROIS ANALYSES LISENT LA MEME REPONSE DU SERVEUR, et c'est voulu : elles
      ne posent pas la meme question. L'impedance est une propriete de la
      SECTION DROITE, le chemin de retour une propriete de la LIAISON
      VERTICALE, la Z differentielle une propriete de DEUX sections cote a
      cote. Une piste parfaitement a 50 ohms peut avoir un retour
      catastrophique : ce sont des defauts distincts, et les empiler dans une
      fiche unique est ce qui les rendait invisibles. */
   /* « CROSSTALK » EST À PART, ET C'EST ASSUMÉ. Elle ne partage pas leur
      réponse du serveur — c'est une autre route, un autre calcul, un autre
      résultat —, et elle répond seule à la question du couplage : combien une
      voisine prend, ET où le long du parcours cela se fabrique. Elle a
      remplacé l'onglet « Diaphonie », qui ne disait que le premier des deux
      et le disait sur une section droite unique. */
   analyses:["impedance","diff","crosstalk","retour","sante"]},
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
    /* `carte` DIT CE QUE L'ONGLET PEINT, et `peint` reste ce qu'il a toujours
       été : la carte des Z₀, et elle seule. Les deux ne se confondent pas —
       deux onglets peignent maintenant autre chose sur le même cuivre, et
       `peint` à vrai leur ferait afficher des ohms sous une fiche qui parle de
       pourcentages. Voir `simCarteSegment`. */
    carte:"z",
    corps:simCorpsImpedance,
    brancher:simBrancherImpedance,
    rendre:simRendreImpedance
  },
  diff:{
    nom:"Z différentielle",
    titre:"Impédance différentielle et impédance de mode commun des paires "+
          "qui longent la sélection : modes pair et impair de la section à "+
          "deux conducteurs.",
    /* `peint` COMMANDE simZActif(), donc la carte de chaleur des IMPÉDANCES
       SIMPLES. Le mettre à vrai peindrait des Z₀ sous une fiche qui parle de
       Z différentielle — deux chiffres qui ne se comparent pas. */
    peint:false,
    /* ELLE PEINT LA SIENNE : la Z différentielle tronçon par tronçon, reprise
       à l'écart RÉEL de chaque tronçon. C'est la réponse à « ma paire est-elle
       à 100 Ω sur TOUTE sa longueur ? », à laquelle le chiffre unique du
       tableau — obtenu sur l'écart moyen — ne répondait pas. */
    carte:"zdiff",
    corps:simCorpsDiff,
    brancher:simBrancherDiff,
    rendre:simRendreDiff,
    apres:simDiffApres
  },
  crosstalk:{
    nom:"Crosstalk",
    titre:"OÙ, le long du parcours, le couplage se fabrique. Les termes "+
          "croisés d'une matrice S multi-ports — synthétisée ici À PARTIR DU "+
          "DESIGN, sans rien importer — passés en temporel par IFFT, puis "+
          "convertis en positions, et recoupés avec le profil d'espacement "+
          "mesuré sur la géométrie. Il dit COMBIEN — en pour-cent de "+
          "l'agresseur et en volts sur la victime — et OÙ sur le parcours.",
    /* `peint` COMMANDE simZActif(), donc la carte de chaleur des IMPÉDANCES.
       Cet onglet ne peint pas la CARTE de l'outil : sa carte de chaleur est
       une figure du PANNEAU — une ligne par victime, l'axe des positions en
       abscisse —, parce que la question posée est « où sur la piste » et non
       « quelle piste ». Peindre le cuivre ne dirait pas la même chose : deux
       victimes sur deux tracés différents ne se comparent qu'alignées sur un
       axe commun, et c'est justement ce que la figure fait. */
    peint:false,
    corps:simCorpsCrosstalk,
    brancher:simBrancherCrosstalk,
    rendre:simRendreCrosstalk,
    /* SON ÉTAT EST LE SIEN, donc son oubli et sa relance aussi. Voir
       `simRafraichir` : sans ces deux crochets, changer de sélection laisserait
       la carte d'une piste sous le nom d'une autre. */
    oublier:simXtOublier,
    relancer:simXtGo,
    /* SES BOUTONS SONT DANS LA FICHE (le sens peint, l'écart, le cuivre), pas
       dans le panneau : ils se rebranchent donc à chaque rendu. */
    apres:simXtSensBrancher
  },
  retour:{
    nom:"Current Return Path",
    titre:"Par où revient le courant de chaque via : les vias de masse qui "+
          "referment la boucle, leur distance, leur part, et l'inductance "+
          "qui en résulte.",
    /* `peint` COMMANDE simZActif(), donc la carte de chaleur des IMPÉDANCES.
       Cet onglet peint autre chose — le chevelu du retour, par `simCheveluRes`
       — et le mettre à vrai ferait apparaître les Z₀ sous une fiche qui n'en
       parle pas. */
    peint:false,
    corps:simCorpsRetour,
    brancher:simBrancherRetour,
    rendre:simRendreRetour,
    apres:simBrancherRetourFiche
  },
  sante:{
    nom:"Santé liaison",
    titre:"Synthèse globale des diagnostics de la liaison : impédance, discontinuités de vias, "+
          "chemin de retour, couplage, classés par sévérité avec recommandations précises.",
    peint:false,
    carte:"",
    corps:simCorpsSante,
    brancher:simBrancherSante,
    rendre:simRendreSante,
    apres:simSanteApres
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
    rendre:simRendreDC,
    /* LE SÉLECTEUR DE COUCHE VIT DANS LA FICHE, pas dans le panneau : sa liste
       dépend du résultat. Il naît et meurt donc avec chaque rendu, et sans ce
       crochet il serait là, garni du bon état, et muet au clic. */
    apres:simDCBrancherFiche
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
  /* LE REPLI DES RÉGLAGES, au bout de la rangée des analyses et non dans le
     corps de l'une d'elles : il vaut pour toutes, et un bouton posé dans un
     corps naîtrait et mourrait avec lui à chaque changement d'onglet. */
  if(simCalculable())
    h+='<button class="simOnglet mini simPlier'+(SIM.plie?" on":"")+
       '" id="simPlier" title="'+simEsc(
         "Replier les réglages pour laisser la place aux résultats. Le calcul "+
         "ne bouge pas, et la rangée des boutons reste : on relance sans "+
         "déplier.")+'">'+simXtTexteRepli()+"</button>";
  h+="</div>";
  return h;
}
function simXtTexteRepli(){
  return SIM.plie?"▸ réglages":"▾ réglages";
}

/* Replier ou déplier. UNE SEULE CLASSE, POSÉE À UN SEUL ENDROIT : c'est la
   feuille de style qui décide ensuite quelles rangées disparaissent, et les
   rangées qui restent le disent elles-mêmes (`simBarFixe`) là où elles
   s'écrivent. Choisir ici « la dernière rangée », par exemple, aurait caché le
   bouton « Calculer » de la chute DC, qui vit au milieu de ses réglages. */
function simPlierAppliquer(){
  const ctl=simEl("simCtl");
  if(ctl&&ctl.classList)ctl.classList.toggle("simPlie",!!SIM.plie);
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
  const pl=simEl("simPlier");
  if(pl)pl.onclick=function(){
    SIM.plie=!SIM.plie;
    this.classList.toggle("on",SIM.plie);
    this.textContent=simXtTexteRepli();
    simPlierAppliquer();
    /* LA FIGURE SE REDESSINE À LA LARGEUR DU PANNEAU, jamais à sa hauteur :
       replier ne change pas la largeur, donc il n'y a rien à refaire. */
  };
  simPlierAppliquer();
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
  '<div class="pnl-bar simFAvertBar simBarFixe"><span id="simFAvert"></span></div>'+
  '<div class="pnl-bar simBarFixe">'+
    '<button class="tb mini on" id="simGo" title="Calculer la sélection">▶ Calculer</button>'+
    '<button class="tb mini" id="simCsv" title="Le tableau des tronçons, à joindre à un dossier de fabrication">.csv</button>'+
    '<button class="tb mini" id="simS2p" title="Les paramètres S au format Touchstone">.s2p</button>'+
    '<button class="tb mini" id="simJson" title="Le problème lui-même : il se donne au solveur en ligne de commande">.json</button>'+
    '<label class="simSuivre" title="Recalculer à chaque changement de sélection"><input type="checkbox" id="simAuto"> suivre</label>'+
    /* LE VOILE, ET SON INTERRUPTEUR. C'est le même que celui de la chute DC,
       et il commande le même drapeau pour les deux cartes d'impédance —
       celle-ci et celle de la Z différentielle, que `simCarteActive()` traite
       ensemble. ALLUMÉ d'office ici, ÉTEINT sous Chute DC : la carte des
       impédances peint TOUT le cuivre sélectionné, donc ce qui reste sous le
       voile est du cuivre étranger et l'estomper est exactement ce qu'on veut ;
       la chute, elle, ne peint qu'un net sur une couche. Voir
       `simVoileActif`. */
    simXtCase("simVoile","estomper le reste",
      "Estomper le cuivre qui n'entre dans AUCUN calcul, pour qu'une couleur "+
      "de couche cesse de se lire comme une couleur d'impédance. Vaut aussi "+
      "pour la carte de Z différentielle.")+
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
  pose("simZDiffCible",String(s.cibleDiff).replace(".",","));
  pose("simZDiffTol",String(s.tolDiffPct).replace(".",","));
  /* UN TEMPS DE MONTEE A ZERO N'EST PAS UN TEMPS DE MONTEE : le champ reste
     VIDE, et c'est ce qui dit « deduis-le de la bande ». Y ecrire 0 laisserait
     croire a un front infiniment raide. */
  pose("simTr",s.tr>0?simNbLibre(s.tr/simUniteTr().f):"");
  pose("simSwing",simNbLibre(s.swing/simUniteV().f));
  const selTr=simEl("simTrUnite");
  if(selTr)selTr.value=simUniteTr().cle;
  const selV=simEl("simSwingUnite");
  if(selV)selV.value=simUniteV().cle;
  pose("simBruit",String(s.bruitPct).replace(".",","));
  /* LA MARGE RESTE VIDE QUAND ELLE VAUT ZÉRO : zéro n'est pas une marge, c'est
     « je n'en donne pas », et l'on juge alors au pourcentage. Y écrire 0
     ferait croire à un récepteur sans aucune marge de bruit. */
  pose("simMarge",s.marge>0?String(Math.round(s.marge*1e3)):"");
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
  s.cibleDiff=lu("simZDiffCible",s.cibleDiff,0.1);
  s.tolDiffPct=lu("simZDiffTol",s.tolDiffPct,0);
  /* LE CHAMP VIDE VAUT ZERO ICI, et c'est voulu : zero veut dire « pas de
     front donne », donc « deduis-le de la bande ». `lu` retombe sur la valeur
     precedente pour une saisie illisible ; un champ vide n'est pas illisible,
     c'est une intention. */
  const ktr=simUniteTr().f, kv=simUniteV().f;
  const tr=simEl("simTr");
  if(tr)s.tr=String(tr.value).trim()?lu("simTr",s.tr/ktr,0)*ktr:0;
  s.swing=lu("simSwing",s.swing/kv,0)*kv;
  s.bruitPct=lu("simBruit",s.bruitPct,0);
  /* MÊME RÈGLE QUE LE FRONT POUR LA MARGE : un champ vide n'est pas une
     saisie illisible, c'est une INTENTION — pas de marge donnée, on retombe
     sur le budget en pourcentage. */
  const mg=simEl("simMarge");
  if(mg)s.marge=String(mg.value).trim()?lu("simMarge",s.marge*1e3,0)/1e3:0;
  return s;
}

/* CHANGER D'UNITÉ CONVERTIT, ÇA NE RÉINTERPRÈTE PAS. 868 en MHz devient 0,868
   en GHz, jamais 868 GHz : la valeur physique ne bouge pas, seule son écriture
   change. C'est ce qui fait qu'on peut choisir son unité APRÈS avoir tapé, et
   qu'aucun résultat déjà calculé n'est invalidé au passage. */
function simUniteChanger(cle,laquelle){
  /* CHAQUE CHAMP A SA LISTE, et l'on vérifie contre LA SIENNE : poser « ns »
     sur la fréquence centrale doit être refusé comme le serait « GHz » sur le
     temps de montée. Une seule liste pour tout laisserait passer les deux. */
  const listes={tr:SIM_UNITES_TR, swing:SIM_UNITES_V};
  const liste=listes[laquelle]||SIM_UNITES;
  if(!liste.some(u=>u.cle===cle))return;
  simSaisie();                       // fige ce qui est écrit, ancienne unité
  if(laquelle==="bande1")SIM.saisie.uniteBande1=cle;
  else if(laquelle==="bande2")SIM.saisie.uniteBande2=cle;
  else if(laquelle==="bande")SIM.saisie.uniteBande=cle;
  else if(laquelle==="tr")SIM.saisie.uniteTr=cle;
  else if(laquelle==="swing")SIM.saisie.uniteV=cle;
  else                  SIM.saisie.unite=cle;
  simSaisieEcrire();                 // le réécrit dans la nouvelle
  if(laquelle==="swing"){simBruitAbsEcrire();simRendre();}
}

/* Quand l'utilisateur change la fréquence de travail f₀ (par exemple 8 MHz pour
   un SPI MOSI ou 10 kHz pour un bus de commande), si celle-ci descend sous le
   début de bande S (f1 = 100 MHz par défaut), on adapte immédiatement la bande
   pour qu'elle englobe f₀. Cela évite d'alarmer l'utilisateur avec un
   avertissement inutile, et garantit que le serveur calcule avec la bande
   englobant le signal. */
function simAjusterBandePourFc(){
  const s=SIM.saisie;
  if(!s||!(s.fc>0))return;
  let modif=false;
  if(s.f1>0&&s.fc<s.f1){
    s.f1=Math.max(1,Math.round(s.fc*0.1));
    s.uniteBande1=s.unite;
    modif=true;
  }
  if(s.f2>0&&s.fc>s.f2){
    s.f2=Math.round(s.fc*1.5);
    s.uniteBande2=s.unite;
    modif=true;
  }
  if(modif)simSaisieEcrire();
}

/* CE QUE LE SERVEUR AURAIT CORRIGÉ EN SILENCE. Si f₀ est hors de la bande S,
   le serveur l'étend automatiquement pour inclure la fréquence de travail.
   Le dire pendant la saisie informe sans inquiéter. */
function simFAvertEcrire(){
  const el=simEl("simFAvert");
  if(!el)return;
  const s=SIM.saisie;
  const f1=Math.min(s.f1,s.f2), f2=Math.max(s.f1,s.f2);
  const txt=(s.fc<f1||s.fc>f2)
    ? "f₀ "+simFreq(s.fc)+" est hors de la bande S ("+simFreq(f1)+" – "+
      simFreq(f2)+") : le serveur étendra automatiquement la bande pour inclure f₀."
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
  simBrancherLots();
  simBrancherCourbe();
  /* LES BOUTONS QUI VIVENT DANS LA FICHE, et non dans le panneau. Ceux du
     panneau sont branchés par `brancher` au moment où le panneau s'écrit ;
     ceux-ci naissent et meurent avec CHAQUE rendu, et sans ce crochet ils sont
     muets — visiblement là, armés du bon état, et sans effet au clic. C'est le
     genre de panne qui ne se voit pas en relisant : il faut cliquer. */
  if(a.apres)a.apres();
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

/* ==========================================================================
   LA PROGRESSION — CE QUI TOURNE, DEPUIS COMBIEN DE TEMPS, ET OU ÇA EN EST
   --------------------------------------------------------------------------
   CE QU'IL Y AVAIT, ET POURQUOI ÇA NE SUFFISAIT PAS. « Le solveur travaille… »,
   une fois, et plus rien. Sur un calcul de dix secondes — soixante mille nœuds,
   quatre couches — la page est identique à la seconde 1 et à la seconde 30 :
   rien ne distingue un solveur qui avance d'un solveur bloqué, et rien ne dit
   s'il faut attendre encore ou aller relancer le serveur.

   PAS DE FAUX POURCENTAGE. Le solveur ne rend rien avant d'avoir fini : une
   barre qui monterait de 0 à 90 % en devinant serait un mensonge, et le genre
   de mensonge qu'on croit. Ce qui est VRAI et qui suffit :

     · le TEMPS ÉCOULÉ, qui avance à chaque seconde — c'est lui qui prouve que
       ça tourne, et c'est lui qu'on compare à la fois précédente ;
     · la TAILLE du problème, qui dit pourquoi c'est long ;
     · les ÉTAPES en clair, pour savoir ce qui se passe ;
     · et, quand il y en a, la PROGRESSION RÉELLE : les lots d'une sélection
       éparse sont comptés un par un, et là la barre est déterminée.

   LE TERMINAL EN DIT PLUS, et le panneau le rappelle : `dc_solver` et
   `simulation_em` y écrivent une ligne par étape avec sa durée, donc c'est là
   qu'on va voir LAQUELLE coince. Un panneau ne peut pas remplacer ça — il n'a
   pas la main pendant que le serveur calcule.

   L'ANIMATION EST EN CSS, indéterminée : une bande qui glisse. Elle ne
   prétend rien mesurer, elle montre que quelque chose est en cours.
   ========================================================================== */
function simDuree(ms){
  const s=Math.max(0,Math.round(ms/1000));
  if(s<60)return s+" s";
  return Math.floor(s/60)+" min "+String(s%60).padStart(2,"0")+" s";
}

function simProgres(detail,faits,total){
  const ecoule=SIM.depuis?simDuree(Date.now()-SIM.depuis):"";
  const determine=(total>1&&faits>=0);
  const part=determine?Math.max(0,Math.min(100,100*faits/total)):0;
  let h='<div class="simProg">';
  h+='<div class="simProgBar'+(determine?"":" simProgInd")+'">'+
     '<i style="width:'+(determine?part:100)+'%"></i></div>';
  h+='<div class="simProgLigne"><span>'+
     (determine?("lot "+Math.min(faits+1,total)+" sur "+total)
               :"le solveur travaille")+"</span>"+
     (ecoule?"<span>"+simEsc(ecoule)+"</span>":"")+
     (SIM.taille?"<span>"+simEsc(SIM.taille)+"</span>":"")+
     "</div>";
  h+='<p class="simNote">· '+simEsc(detail)+"</p>";
  /* OÙ REGARDER QUAND C'EST LONG. Le terminal du serveur porte une ligne par
     étape, avec sa durée : c'est le seul endroit qui dise LAQUELLE coince. */
  h+='<p class="simNote">· Le terminal du serveur (<code>python '+
     "serveur.py</code>) écrit une ligne par étape, avec sa durée : c'est là "+
     "que se lit ce qui prend du temps.</p>";
  return h+"</div>";
}

/* LE COMPTEUR AVANCE TOUT SEUL. Sans lui, « 0 s » resterait affiché pendant
   trente secondes et ne prouverait rien. Un rendu par seconde ne coûte rien —
   la zone de sortie ne porte alors que la barre — et il s'arrête de lui-même
   dès que plus rien ne tourne, sans que personne ait à penser à l'éteindre. */
let SIM_TIC=null;
function simOccupeQuelconque(){
  return !!(SIM.occupe||SIM.occupeDC||
            (typeof SIM_XT!=="undefined"&&SIM_XT&&SIM_XT.occupe));
}
function simProgresDemarrer(taille){
  SIM.depuis=Date.now();
  SIM.taille=taille||"";
  if(SIM_TIC)return;
  if(typeof setInterval!=="function")return;
  SIM_TIC=setInterval(function(){
    if(!simOccupeQuelconque()){
      clearInterval(SIM_TIC);
      SIM_TIC=null;
      return;
    }
    simRendre();
  },1000);
}
function simProgresFini(){
  SIM.depuis=0; SIM.taille="";
  if(SIM_TIC){clearInterval(SIM_TIC);SIM_TIC=null;}
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
  if(SIM.occupe){
    /* LES LOTS SONT UNE PROGRESSION RÉELLE, et la barre est alors déterminée :
       chaque lot est un aller-retour, et on sait combien il en reste. */
    const h=simProgres("Une résolution de section par largeur et par couche, "+
      "puis les paramètres S sur la bande.",
      SIM.lots.length,SIM.lotsAttendus);
    /* Les lots déjà rendus restent affichés pendant que les suivants
       calculent : sur une ligne coupée en six, attendre six allers-retours
       devant un panneau vide n'apprend rien qu'une attente. */
    return h+simTableauLots()+(SIM.res?simFiche():"");
  }
  /* UNE ERREUR N'EMPORTE PAS LE TABLEAU DES LOTS : elle peut n'être que celle
     du lot qu'on vient de déplier, les autres restant justes. */
  if(SIM.err&&!SIM.res)
    return simTableauLots()+'<p class="simErr">'+simEsc(SIM.err)+"</p>";
  if(SIM.res)return simTableauLots()+simLotEntete()+simFiche();
  return '<p class="simEtat">Sélectionnez une piste, puis calculez.<br>'+
    "<small><b>Clic</b> : le tronçon cliqué seul. <b>Maj+clic</b> : la piste "+
    "entière. <b>Maj+clic à nouveau</b> : la piste sur toutes les couches.<br>"+
    "<b>Ctrl+clic</b> : ajouter un morceau à la sélection — chaque parcours "+
    "continu est alors calculé SÉPARÉMENT, ce qu'il faut pour vérifier une "+
    "ligne RF coupée par des composants.<br>"+
    "Le calcul a lieu sur le serveur (<code>python serveur.py</code>) : le "+
    "solveur est en Python.</small></p>";
}

/* ==========================================================================
   LES LOTS — PLUSIEURS MORCEAUX SÉLECTIONNÉS, UN RÉSULTAT CHACUN
   --------------------------------------------------------------------------
   LE CAS QUI L'A DEMANDÉ, ET IL EST ORDINAIRE EN RF. Une ligne 50 Ω coupée par
   trois condensateurs de liaison n'est pas UN net : c'est quatre nets bout à
   bout, séparés par des boîtiers. La question posée, elle, est unique — « fait-
   elle 50 Ω sur toute sa longueur ? » — et jusqu'ici il fallait la poser quatre
   fois, cliquer quatre fois, relire quatre fiches, et se souvenir des chiffres
   entre-temps. Le même besoin revient partout où le cuivre est coupé sans que
   la LIAISON le soit : un té de polarisation, un filtre, une résistance série,
   un pont de mesure.

   CE QU'UN LOT EST, ET CE QU'IL N'EST PAS. Un lot est un PARCOURS CONTINU : du
   cuivre qui se touche, sur un seul net. Deux morceaux qui ne se touchent pas
   font deux lots, et c'est le point : on ne peut pas les mettre en cascade —
   le produit de matrices ABCD suppose que la sortie de l'un soit l'entrée du
   suivant, et il y a un composant entre les deux, dont ce panneau ne sait rien.
   Les additionner rendrait un S₂₁ qui aurait l'air d'être celui de la ligne
   entière alors qu'il ignorerait les composants ; les séparer rend quatre
   résultats justes et laisse le jugement à qui sait ce que sont les boîtiers.

   POURQUOI `SIM.res` SURVIT. Tout ce qui affiche, peint et exporte lit
   `SIM.res` et `SIM.objets` depuis toujours. Plutôt que de les faire disparaître
   au profit d'une liste, le lot ACTIF s'y reflète (`simLotMirroir`) : la fiche
   complète, la courbe S, la section résolue, le .csv, le .s2p et les deux
   canevas continuent de fonctionner sans une ligne de changement, et la
   sélection d'un seul morceau — le geste de tous les jours — se comporte
   exactement comme avant. Ce qui s'ajoute est AU-DESSUS : un tableau de
   synthèse, une ligne par lot, et un clic pour déplier celui qu'on veut lire.

   LA CARTE, ELLE, MONTRE TOUT. Les couleurs de chaleur se peignent pour TOUS
   les lots (`simPourChaqueLot`), parce que la réponse à « est-ce 50 Ω partout »
   est un coup d'œil sur la carte, pas une lecture de tableau.
   ========================================================================== */

/* Un résultat porte sur UNE sélection : dès qu'elle bouge, tout part — les lots
   comme le reflet. Un seul endroit le fait, sinon un lot survit à la sélection
   qui l'a produit et la carte peint des couleurs qui ne sont plus à personne. */
function simOublierRes(){
  SIM.res=null; SIM.objets=[]; SIM.lots=[]; SIM.lotActif=0; SIM.lotsAttendus=0;
}

/* Les lots à peindre. Un résultat sans lot — il n'y en a plus, mais un banc
   d'essai peut poser `SIM.res` à la main — vaut un lot unique : le canevas n'a
   pas à connaître les deux cas. */
function simLotsPeints(){
  /* LA COHÉRENCE SE VÉRIFIE ICI, une fois pour tous ceux qui peignent : un lot
     dont le serveur n'a pas rendu autant de tronçons qu'on lui en a envoyé
     appareillerait des couleurs avec le cuivre du voisin. */
  const bon=l=>l&&l.res&&l.objets&&l.objets.length&&
               l.res.segments.length===l.objets.length;
  if(SIM.lots.length)return SIM.lots.filter(bon);
  const seul={res:SIM.res, objets:SIM.objets, rang:1};
  return bon(seul)?[seul]:[];
}
function simLotsMultiples(){return simLotsPeints().length>1;}
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

/* Peindre chaque lot à son tour. Le reflet est posé le temps de l'appel, puis
   remis en place : `simZSegment`, `simZActif` et tout ce que les canevas
   appellent lisent `SIM.res` — leur passer un lot en argument aurait demandé de
   les réécrire tous les deux, et de les tenir d'accord ensuite. */
function simPourChaqueLot(fn){
  const lots=simLotsPeints();
  const res0=SIM.res, obj0=SIM.objets, doc0=SIM.doc;
  try{
    /* LE DOCUMENT SUIT, ET IL LE FAUT : la carte des voisines lit sa géométrie
       dans `SIM.doc.voisinage`, et chaque lot a le sien. Sans ce reflet-là, le
       lot 3 peindrait ses couleurs sur le voisinage du lot 1. */
    for(const l of lots){
      SIM.res=l.res; SIM.objets=l.objets; SIM.doc=l.doc||doc0; fn(l);
    }
  }finally{SIM.res=res0; SIM.objets=obj0; SIM.doc=doc0;}
}

/* Le lot actif, reflété dans l'état que tout le reste lit. */
function simLotMirroir(i){
  const l=SIM.lots[i];
  if(!l)return false;
  SIM.lotActif=i;
  SIM.res=l.res; SIM.objets=l.objets; SIM.doc=l.doc;
  SIM.portee=l.portee||""; SIM.notes=l.notes||[];
  SIM.couture=l.couture||null; SIM.voisins=l.voisins||[];
  SIM.err=l.err||"";
  return true;
}
function simLotActiver(i){
  if(!simLotMirroir(i))return;
  simRendre(); simRepeindre();
}

/* CE QU'UN LOT VAUT, EN CHIFFRES COMPARABLES. On compte comme la fiche compte :
   en sections regroupées (`simGrouper`) et non en tronçons envoyés, sans quoi un
   arc — une vingtaine de cordes — pèserait vingt fois plus qu'une droite dans
   le décompte des sections hors tolérance. */
function simLotBilan(lot){
  if(!lot||!lot.res)return null;
  const L=lot.res.ligne||{};
  const gr=simGrouper(lot.res.segments||[]);
  const sortis=gr.filter(g=>g.seg.z0>0&&simZVerdict(g.seg.z0)!==0);
  return {longueur:L.longueur||0, z0min:L.z0_min||0, z0max:L.z0_max||0,
          z0moy:L.z0_moyen||0, sections:gr.length,
          dehors:sortis.length,
          mmDehors:sortis.reduce((a,g)=>a+g.longueur,0),
          couches:[...new Set(gr.map(g=>g.couche))]};
}

/* LE TABLEAU DE SYNTHÈSE, et c'est lui la réponse à la question posée. Une
   ligne par lot, le pire écart en évidence, et un clic pour déplier la fiche
   complète de celui qu'on veut regarder de près.

   LE VERDICT D'ENSEMBLE EST EN TÊTE parce que c'est ce qu'on est venu chercher :
   « les quatre morceaux sont dans la tolérance » se lit sans parcourir le
   tableau. Il ne dit rien de la continuité électrique entre les lots — elle
   passe par des composants, dont ce panneau ne sait rien — et le note. */
function simTableauLots(){
  const lots=SIM.lots;
  if(lots.length<2)return "";
  const bons=lots.filter(l=>{const b=simLotBilan(l);return b&&!b.dehors;}).length;
  const rates=lots.filter(l=>!l.res).length;
  let h='<div class="simLots">';
  h+='<p class="simVerdict '+((bons===lots.length&&!rates)?"dedans":"dehors")+
     '">'+lots.length+" morceaux sélectionnés"+
     (rates?", "+rates+" non calculé"+(rates>1?"s":""):"")+
     " — "+((bons===lots.length&&!rates)
        ? "tous dans la tolérance"
        : bons+" sur "+lots.length+" dans la tolérance")+
     " <span>cible "+simNb(SIM.saisie.cible,1)+" Ω ± "+
     simNb(simZTolAbs(),1)+" Ω</span></p>";
  h+='<table class="simTab simTabLots"><tr><th>Lot</th><th>Portée</th>'+
     "<th>l (mm)</th><th>Z₀ min–max</th><th>Moyenne</th><th>Hors tol.</th></tr>";
  lots.forEach(function(l,i){
    const b=simLotBilan(l);
    const actif=(i===SIM.lotActif);
    h+='<tr class="simLotL'+(actif?" on":"")+'" data-simlot="'+i+'" '+
       'title="'+simEsc("Voir la fiche complète de ce lot")+'">';
    h+='<td><i class="simPuce" style="background:'+
       (b?simZCouleur(b.z0max&&simZVerdict(b.z0max)!==0?b.z0max:b.z0moy)
          :"rgba(139,145,156,1)")+'"></i>'+(i+1)+"</td>";
    h+="<td>"+simEsc(l.titre||l.portee||l.net||"—")+"</td>";
    if(!b){
      h+='<td colspan="4" class="simLotErr">'+
         simEsc(l.err||"non calculé")+"</td></tr>";
      return;
    }
    h+="<td>"+simNb(b.longueur,2)+"</td>"+
       "<td>"+simNb(b.z0min,1)+" – "+simNb(b.z0max,1)+"</td>"+
       "<td>"+simNb(b.z0moy,1)+"</td>"+
       '<td class="'+(b.dehors?"z0haut":"z0ok")+'">'+
       (b.dehors?b.dehors+" sect., "+simNb(b.mmDehors,2)+" mm":"—")+
       "</td></tr>";
  });
  h+="</table>";
  /* CE QUE LE PANNEAU NE PEUT PAS DIRE, et il vaut mieux qu'il le dise. Entre
     deux lots il y a du cuivre qui n'est pas là — un condensateur, une
     résistance, un connecteur. Leur effet sur la ligne n'est pas dans ces
     chiffres, et aucune addition des lots ne le ferait apparaître. */
  h+='<p class="simNote">· Chaque lot est un parcours continu, calculé seul : '+
     "les paramètres S ci-dessous sont ceux du lot déplié. Ce qui relie deux "+
     "lots — un condensateur de liaison, une résistance série, un connecteur — "+
     "n'est pas dans le modèle : la mise en cascade s'arrête au bord du cuivre."+
     "</p>";
  h+="</div>";
  return h;
}

/* De quel lot la fiche qui suit parle. Sans cette ligne, un tableau de six
   lots suivi d'une fiche ne dit pas laquelle des six on lit. */
function simLotEntete(){
  if(SIM.lots.length<2)return "";
  const l=SIM.lots[SIM.lotActif];
  return '<p class="simLotTitre">Lot '+(SIM.lotActif+1)+" sur "+
    SIM.lots.length+" — "+simEsc(l.titre||l.portee||l.net||"")+
    " <small>cliquez une ligne du tableau pour en déplier un autre</small></p>";
}

function simBrancherLots(){
  const box=simEl("simSortie");
  if(!box||SIM.lots.length<2)return;
  box.querySelectorAll("[data-simlot]").forEach(function(tr){
    tr.onclick=function(){
      const i=+tr.getAttribute("data-simlot");
      if(i>=0&&i<SIM.lots.length)simLotActiver(i);
    };
  });
}

/* ==========================================================================
   Lancer
   ========================================================================== */
/* Ce que tout document envoyé porte, quel que soit l'outil et quel que soit le
   lot. Un seul endroit le pose : le .json exporté et ce qui part au serveur
   doivent être le même document. */
function simDocFinir(doc){
  doc.format=SIM_FORMAT;
  doc.source=SIM_ED?SIM_ED.outil:"";
  /* L'HYPOTHÈSE PART AVEC LE PROBLÈME. Le serveur ne s'en sert pas — les écarts
     sont déjà mesurés — mais le résultat, le .csv et l'entête Touchstone doivent
     dire ce qui a été tenu pour de la masse. Un chiffre sans son hypothèse
     n'est pas vérifiable. */
  doc.reference_nets=simRefListe();
  /* LA PAIRE CHOISIE À LA MAIN VOYAGE COMME UNE PAIRE DÉCLARÉE. C'est le même
     champ que celui où l'éditeur met les siennes, et le serveur ne les
     distingue pas : `_paire_nommee` accepte la première qui correspond. Elle
     passe en TÊTE pour que ce soit elle qui gagne si l'outil en déclarait déjà
     une autre avec le même net — un choix explicite prime sur une convention.

     ELLE PART SOUS TOUS LES ONGLETS, et pas seulement sous « Z différentielle » :
     le document envoyé doit être le même que celui qu'exporte le bouton .json,
     et le crosstalk écarte de ses victimes l'autre moitié d'une paire. */
  const nDiff=String(SIM.saisie.paireN||"");
  if(nDiff&&doc.net&&nDiff!==doc.net)
    doc.paires=[[doc.net,nDiff]].concat(doc.paires||[]);
  return doc;
}

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
  simDocFinir(p.doc);
  SIM.doc=p.doc;
  SIM.portee=p.portee||"";
  SIM.notes=p.notes||[];
  SIM.couture=p.couture||null;
  SIM.voisins=p.voisins||[];
  SIM.err="";
  return p;
}

/* LES PROBLÈMES À ENVOYER, un par lot.

   L'OUTIL DÉCIDE DU DÉCOUPAGE, PAS LE PANNEAU : lui seul sait ce qui se touche
   sur sa carte. S'il ne sait pas découper — `problemes` absent —, on retombe
   sur `probleme` et il y a un lot, ce qui est le comportement d'avant. */
function simProblemes(){
  if(SIM_ED&&typeof SIM_ED.problemes==="function"){
    const r=SIM_ED.problemes(simSaisie());
    if(!r||r.erreur){
      SIM.err=((r&&r.erreur)||"Rien à calculer.")+
              ((r&&r.conseil)?"\n"+r.conseil:"");
      return null;
    }
    const lots=(r.lots||[]).filter(p=>p&&p.doc&&p.objets&&p.objets.length);
    if(!lots.length){
      SIM.err="La sélection ne porte aucun tronçon exploitable.";
      return null;
    }
    lots.forEach(p=>simDocFinir(p.doc));
    SIM.err="";
    return lots;
  }
  const p=simProbleme();
  return p?[p]:null;
}

async function simGo(){
  if(SIM.occupe||!simCalculable())return;
  /* Le résultat précédent s'efface AVANT le calcul : garder à l'écran, et sur
     la carte, la couleur d'une autre sélection est le meilleur moyen de lire
     un chiffre pour un autre. */
  simOublierRes(); SIM.err="";
  const P=simProblemes();
  if(!P){simRendre();simRepeindre();return;}
  SIM.occupe=true; SIM.lotsAttendus=P.length;
  simProgresDemarrer(P.length>1?(P.length+" morceau(x)"):"");
  simRendre(); simRepeindre();
  try{
    /* UN LOT À LA FOIS, ET LE PANNEAU SUIT. Quatre morceaux sont quatre
       résolutions de section : les envoyer en parallèle mettrait quatre fois le
       solveur sur la même machine et ne rendrait rien plus tôt. On affiche donc
       chaque lot dès qu'il arrive — le premier se lit pendant que le dernier
       calcule. */
    for(let i=0;i<P.length;i++){
      const p=P[i];
      const lot={rang:i+1, cle:p.cle||("lot"+(i+1)), titre:p.titre||"",
                 net:(p.doc&&p.doc.net)||"", doc:p.doc, objets:p.objets,
                 portee:p.portee||"", notes:p.notes||[],
                 couture:p.couture||null, voisins:p.voisins||[],
                 res:null, err:""};
      SIM.lots.push(lot);
      try{
        const res=await simLancer(p.doc);
        if(res.segments.length!==p.objets.length)
          throw new Error("Le serveur a rendu "+res.segments.length+
                          " tronçon(s) pour "+p.objets.length+" envoyé(s).");
        /* Le nom de couche est connu de l'outil, pas du serveur : on le recopie
           ici pour que le tableau le nomme au lieu d'un indice. */
        res.segments.forEach((s,j)=>{s.nom_couche=p.objets[j].couche||"";});
        /* ET LES LONGEMENTS EN PROFITENT. Ils portent un indice de couche, pas
           un nom — le serveur n'en connaît pas —, et les deux fiches de
           couplage écriraient « couche 4 » là où le tableau des tronçons écrit
           « In2 ». Le dictionnaire vient des tronçons qu'on vient de nommer :
           un longement est toujours sur la couche d'un tronçon sélectionné. */
        const nomsCouche={};
        res.segments.forEach(s=>{if(s.nom_couche)nomsCouche[s.couche]=s.nom_couche;});
        for(const f of ((res.couplage&&res.couplage.paires)||[]))
          f.nom_couche=nomsCouche[f.couche]||"";
        lot.res=res;
      }catch(e){
        /* UN LOT QUI ÉCHOUE N'EMPORTE PAS LES AUTRES, et c'est tout l'intérêt
           de les séparer : un morceau posé sur une couche sans plan de référence
           n'a pas d'impédance, les trois autres en ont une. L'erreur reste
           attachée à SA ligne du tableau. */
        lot.err=e.message||String(e);
      }
      /* Le premier lot calculable devient le lot actif : la fiche s'ouvre sur
         quelque chose plutôt que sur une erreur, même si le lot 1 a échoué. */
      const bon=SIM.lots.findIndex(l=>l.res);
      simLotMirroir(bon>=0?bon:0);
      simRendre(); simRepeindre();
    }
    const calcules=SIM.lots.filter(l=>l.res);
    if(!calcules.length)
      throw new Error(SIM.lots.map(l=>l.err).filter(Boolean)[0]||
                      "Aucun lot n'a été calculé.");
    SIM.suivre=true;
    const el=simEl("simAuto");
    if(el&&!el.checked)el.checked=true;
    if(SIM_ED.astuce){
      if(calcules.length>1){
        const z=calcules.map(simLotBilan);
        SIM_ED.astuce("Simulation : "+calcules.length+" lots, Z₀ "+
          simNb(Math.min(...z.map(b=>b.z0min)),1)+"–"+
          simNb(Math.max(...z.map(b=>b.z0max)),1)+" Ω, "+
          z.filter(b=>!b.dehors).length+" dans la tolérance.");
      }else{
        const res=calcules[0].res;
        SIM_ED.astuce("Simulation : "+res.ligne.troncons+" tronçon(s), Z₀ "+
                      simNb(res.ligne.z0_min,1)+"–"+simNb(res.ligne.z0_max,1)+
                      " Ω à "+simFreq(res.f_centre)+".");
      }
    }
  }catch(e){
    SIM.err=e.message||String(e);
    SIM.res=null; SIM.objets=[]; SIM.lots=[];
  }finally{
    SIM.occupe=false; SIM.lotsAttendus=0; simProgresFini();
    simRendre(); simRepeindre();
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
  /* TOUS LES LOTS DANS LE MÊME FICHIER, et une colonne pour dire lequel. C'est
     la raison d'être du tableau : une ligne RF coupée par trois condensateurs
     se contrôle d'un coup d'œil sur une seule feuille, pas en rapprochant
     quatre fichiers dont rien ne dit qu'ils viennent du même calcul. Chaque lot
     garde son propre bloc de synthèse en dessous de ses tronçons — sa portée,
     sa couture, ses notes —, parce que ce sont ses chiffres et pas ceux du
     voisin. */
  const lots=SIM.lots.length
    ? SIM.lots.filter(l=>l.res)
    : [{rang:1, res:SIM.res, portee:SIM.portee, notes:SIM.notes,
        couture:SIM.couture, voisins:SIM.voisins}];
  const multi=lots.length>1;
  const pre=multi?"lot;":"";
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
  const l=[pre+"troncon;couche;longueur_mm;largeur_mm;topologie;"+
           "ecart_masse_gauche_mm;ecart_masse_droite_mm;cotes_avec_masse;"+
           "plan_reference;h_mm;er;tan_delta;cuivre_mm;couverture_mm;"+
           "z0_ohm;z0_statique_ohm;ecart_ohm;eps_eff;retard_ps;pertes_db;verdict"];
  const rang=lot=>multi?(lot.rang+";"):"";
  for(const lot of lots){
    lot.res.segments.forEach((s,i)=>{
      l.push(rang(lot)+[i+1, s.nom_couche||s.couche, n(s.longueur),
              n(s.largeur),
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
  }
  l.push("");
  l.push("cible_ohm;"+n(c)+";tolerance_pct;"+n(SIM.saisie.tolPct)+
         ";tolerance_ohm;"+n(Math.round(simZTolAbs()*10)/10));
  for(const lot of lots){
    const L=lot.res.ligne;
    if(multi)l.push("");
    if(multi)l.push("lot;"+lot.rang+";sections_hors_tolerance;"+
                    (simLotBilan(lot)||{}).dehors);
    l.push((multi?"lot;"+lot.rang+";":"")+
           "frequence_hz;"+n(lot.res.f_centre)+";z0_moyen_ohm;"+n(L.z0_moyen)+
           ";longueur_mm;"+n(L.longueur)+";pertes_db;"+n(L.pertes_db)+
           ";impedance_reference_ohm;"+
           n(lot.res.impedance_reference||SIM.saisie.z0));
    l.push((multi?"lot;"+lot.rang+";":"")+"portee;"+(lot.portee||""));
    /* SOUS QUELLE HYPOTHÈSE. Le calcul coplanaire dépend entièrement de ce qui a
       été tenu pour de la masse : deux jeux de nets donnent deux impédances sur
       le même cuivre. Sans cette ligne, le tableau n'est pas reproductible. */
    const refs=(lot.res.reference_nets||simRefListe());
    l.push((multi?"lot;"+lot.rang+";":"")+
           "masse_de_reference;"+(refs.length?refs.join(" "):"non declaree"));
    if(lot.couture)
      l.push((multi?"lot;"+lot.rang+";":"")+
             "couture_vias;"+lot.couture.n+";espacement_max_mm;"+
             n(Math.round(lot.couture.ecartMax*100)/100)+";couloir_mm;"+
             n(lot.couture.couloir));
    for(const v of (lot.voisins||[]))
      l.push((multi?"lot;"+lot.rang+";":"")+
             "cuivre_voisin_hors_masse;"+String(v.net).replace(/[;\r\n]+/g," ")+
             ";ecart_mm;"+n(v.ecart)+";longueur_mm;"+n(v.longueur));
    /* Les réserves partent AVEC les chiffres. Un .csv se détache de la page où
       il a été produit : sans elles, il ne reste qu'un tableau qui a l'air sûr.
       LES NOTES DE L'OUTIL AUSSI, et elles manquaient : « les vias ne sont pas
       modélisés », « l'épaisseur de diélectrique est supposée » ne partaient
       qu'avec le panneau, et le .csv avait donc l'air plus sûr que la page. */
    for(const a of (lot.notes||[]))
      l.push((multi?"lot;"+lot.rang+";":"")+
             "note;"+String(a).replace(/[;\r\n]+/g," "));
    for(const a of (lot.res.avertissements||[]))
      l.push((multi?"lot;"+lot.rang+";":"")+
             "avertissement;"+String(a).replace(/[;\r\n]+/g," "));
  }
  /* Le BOM UTF-8 : sans lui, Excel lit les accents de travers. */
  /* LE NOM DU FICHIER NE PORTE PAS DE NUMÉRO DE LOT ICI : il les contient
     tous. `simNomFichier` en ajoute un pour le .s2p et le .json, qui sont
     par nature ceux d'un seul lot. */
  const nom=multi
    ? simNomFichier("-impedance.csv").replace("-lot"+(SIM.lotActif+1),
                                              "-"+lots.length+"lots")
    : simNomFichier("-impedance.csv");
  simTelecharger("﻿"+l.join("\r\n")+"\r\n",
                 nom, "text/csv;charset=utf-8");
}
function simExportS2p(){
  if(!SIM.res||!SIM.res.touchstone){
    /* DEUX SILENCES QUI NE SE RESSEMBLENT PAS. « Calculez d'abord » devant un
       calcul déjà fait envoie chercher un bouton qu'on vient d'appuyer : le
       .s2p manque parce que la cascade a été refusée, et c'est cette
       phrase-là qu'il faut rendre. */
    SIM.err=(SIM.res&&SIM.res.cascade_refusee)
      ? "Pas de .s2p : "+SIM.res.cascade_refusee
      : "Rien à enregistrer : calculez d'abord.";
    simRendre();return;
  }
  simTelecharger(SIM.res.touchstone,simNomFichier(".s2p"),"text/plain");
}
function simExportJson(){
  /* CE QUI EST PARTI, ET NON CE QUI PARTIRAIT. Avec des lots, le document est
     celui du lot déplié : c'est exactement ce que le serveur a reçu pour rendre
     la fiche qu'on regarde, et le nom du fichier porte son numéro. Redécrire le
     problème ici aurait rendu un document unique couvrant TOUTE la sélection,
     que le serveur aurait vu rompu et refusé de cascader — un fichier qui ne
     correspond à aucun résultat affiché. */
  const doc=(SIM.lots.length&&SIM.doc)?SIM.doc:(simProbleme()||{}).doc;
  if(!doc){simRendre();return;}
  simTelecharger(JSON.stringify(doc,null,1),simNomFichier("-sim.json"),
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
      if(id==="simFc")simAjusterBandePourFc();
      simFAvertEcrire();
      if(SIM.res&&!SIM.occupe){
        simOublierRes();
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
  /* CHAQUE ANALYSE OUBLIE LE SIEN, ET RELANCE LE SIEN. Les quatre analyses de
     section partagent `SIM.res` ; « Crosstalk » a son propre état, sa propre
     route et son propre bouton. Sans ces deux crochets, changer de sélection
     sous l'onglet Crosstalk laissait sa carte à l'écran — donc le couplage
     d'une piste peint sous le nom d'une autre, exactement ce que l'oubli
     ci-dessus existe pour empêcher — et relançait par-dessus un calcul
     d'impédance dont personne n'avait besoin. */
  const a=simAnalyse();
  const avait=a.oublier?a.oublier():(function(){
    const eu=!!SIM.res||SIM.lots.length>0;
    simOublierRes();
    return eu;
  })();
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
  const relancer=a.relancer||simGo;
  if(SIM_MINUTEUR)clearTimeout(SIM_MINUTEUR);
  SIM_MINUTEUR=setTimeout(function(){SIM_MINUTEUR=null;relancer();},180);
}
