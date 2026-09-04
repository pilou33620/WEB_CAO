#!/usr/bin/python3
# -*- coding: utf-8 -*-
# ==========================================
# VERSIONING
# Version: 1.0.0
# Date: 2026-09-01
# Explication: premiere version. La section « Crosstalk » du panneau SI :
#   OU, le long d'une piste, le couplage se fabrique.
#
#   CE QUE L'ONGLET DIAPHONIE NE DIT PAS. Il resout la section droite et rend
#   un coefficient par longement -- un chiffre. Quand ce chiffre est mauvais,
#   il ne dit pas lequel des quarante millimetres qui longent en est
#   responsable, et c'est pourtant la seule chose dont on ait besoin pour
#   corriger le dessin.
#
#   LA REPONSE TIENT EN UNE TRANSFORMEE. Les termes croises de la matrice S
#   d'un reseau multi-ports portent, en frequence, tout ce que le couplage fait
#   le long du parcours ; leur transformee de Fourier inverse est une reponse
#   impulsionnelle, et le retard s'y convertit en position des qu'on connait la
#   vitesse de propagation. C'est le principe de la reflectometrie temporelle,
#   applique aux termes CROISES plutot qu'a la reflexion.
#
#   DEUX SOURCES POUR LA MATRICE, ET LE MEME CHEMIN ENSUITE : un fichier
#   Touchstone importe (solveur pleine onde, ou VNA), ou le reseau de lignes
#   couplees qu'on synthetise ici en mettant la section droite en cascade le
#   long du parcours. Le second permet a l'outil de repondre sans rien
#   importer, et donne a la carte sa structure spatiale.
#
#   DEUX ETAPES ZERO, ET ELLES RESTENT DEUX. La preselection GEOMETRIQUE ne
#   demande que l'agresseur et cherche seule ce qui longe ; la confirmation par
#   SIMULATION ecarte ce qui ne couple pas, avec son niveau. Fusionnees, elles
#   ne permettraient plus de distinguer une piste LOIN d'une piste PROCHE ET
#   BLINDEE -- deux situations de dessin opposees.
# Fonctions ajoutees/modifiees : tout le fichier.
#
# Version: 2.0.0
# Date: 2026-09-01
# Explication: LA SOURCE DEVIENT UNIQUE -- le design, et rien d'autre.
#   L'import d'un fichier de parametres S disparait : la matrice se GENERE
#   ici, a partir de l'IPC-2581 ou de l'editeur, et le seul geste demande a
#   l'utilisateur reste la designation de l'agresseur.
#
#   POURQUOI CE RETRAIT. Un fichier importe apportait une physique qu'on ne
#   sait pas calculer -- pertes conductrices, coudes, vias --, mais il
#   apportait aussi la seule chose qui ne pardonne pas : l'ORDRE DE SES PORTS,
#   que rien dans le fichier ne donne. Il fallait donc une table de
#   correspondance, une confirmation, et un ecran entier pour l'obtenir. Ce
#   detour n'existe plus, et avec lui disparait la seule facon de lire le NEXT
#   d'un couple pour celui d'un autre sans qu'aucun chiffre ne paraisse
#   anormal. Les ports sont desormais poses ICI, a partir de la geometrie :
#   ils sont CONNUS, jamais devines.
#
#   CE QUE LA CARTE GAGNE EN ECHANGE : le PROFIL D'ESPACEMENT. Puisque la
#   geometrie est la source, on connait la distance agresseur/victime EN
#   FONCTION DE L'ABSCISSE -- pas une distance moyenne, une courbe. Elle se
#   superpose a la courbe de couplage, et c'est leur DESACCORD qui devient
#   l'anomalie a signaler : un pic de couplage la ou rien ne se resserre n'est
#   pas explique par le dessin des pistes, et il faut alors le chercher dans
#   le plan de reference -- trou de couture, fente, changement de couche.
#
#   CE QUI CESSE D'ETRE UNE ANOMALIE : l'ecart entre deux victimes
#   symetriques. Deux cotes qui ne prennent pas la meme chose n'ont rien
#   d'anormal si l'agresseur n'est pas equidistant des deux a tout instant --
#   et c'est le profil d'espacement, maintenant qu'on l'a, qui le dit. L'ecart
#   reste affiche ; il n'est ALERTE que lorsque l'espacement ne l'explique pas.
# Fonctions ajoutees/modifiees : lire_touchstone, mapping_lu, _mapping_naif,
#   _tokens_touchstone, _deduire_ports, _options_touchstone, grille_uniforme,
#   _interpoler, _extrapoler_dc (SUPPRIMEES) ; profil_espacement,
#   profils_espacement, desaccords, _pics, _zone_a, verifier_bande,
#   bande_pour_resolution (nouvelles) ; etat, analyser, _lire_couples,
#   _avertir, _asymetries, _hypotheses, _doc_valide, _reglages, _profils,
#   touchstone_np, _journaliser (modifiees).
#
# Version: 2.1.0
# Date: 2026-09-02
# Explication: CE QUE LA FICHE REFUSE DESORMAIS DE CONCLURE. Une carte lue sur
#   une vraie carte a montre trois verdicts qui se rendaient tout seuls -- le
#   pire defaut possible ici, puisqu'un verdict acquis d'avance ressemble en
#   tout point a un verdict gagne.
#
#   (1) « EXPLIQUE PAR LE PLAN » NE VAUT QUE SI LA COINCIDENCE POUVAIT NE PAS
#   AVOIR LIEU. Le seuil de pas de couture se deduit du HAUT DE BANDE ; on
#   monte le haut de bande pour affiner la carte -- la resolution spatiale ne
#   depend que de lui --, le seuil tombe au dixieme de millimetre, et le
#   parcours entier devient zone de vigilance. Chaque pic y tombe alors, et la
#   fiche annoncait « le plan l'explique » pour tous. On mesure donc l'UNION
#   des zones (`_couvert`, et c'est bien une union : les deux cotes du parcours
#   sont regardes separement, les sommer annoncerait plus de cent pour cent),
#   et au-dela de la moitie du parcours le verdict devient « indecidable ».
#
#   (2) LES DECIBELS DISENT DE QUELLE BANDE ILS PARLENT. Le niveau de l'etape
#   0b est un maximum sur TOUTE la bande analysee, et cette bande se regle pour
#   la resolution spatiale, pas pour le signal : -13 dB a 80 GHz sur un front
#   de 9 ns est exact et trompeur. La fiche rend donc la frequence du pire
#   point et le couplage sous le GENOU du front -- quand il est saisi, faute de
#   quoi le genou vaudrait la bande et ne comparerait rien. Le continu est
#   exclu de cette lecture : le couplage y vaut zero par construction, et sur
#   une grille de 5 GHz de pas c'est le seul point sous un genou a 39 MHz --
#   « -300 dB » aurait ete la lecture du zero de la grille, pas une mesure.
#
#   (3) LE SEUIL DE COUTURE DIT DE QUELLE REGLE IL SORT, et ce que l'autre
#   aurait donne quand les deux different. Quatorze alarmes qui apparaissent
#   sans que le cuivre ait bouge viennent d'un champ du panneau.
#
#   UNE PLAGE A RISQUE NE DIT PLUS LE CONTRAIRE DE LA FICHE. `zones_risque`
#   ne peignait en rouge que les pics « inexpliques » : une plage contenant un
#   pic explique par le plan se peignait donc en ambre -- « ca se corrige en
#   ecartant » -- trois lignes sous une phrase disant l'inverse. Tout ce que
#   `desaccords` rend est, par construction, un pic que le DESSIN DES PISTES
#   n'explique pas.
#
#   ENFIN, « aucune piste ne passe la preselection » se lisait « tu n'as rien
#   selectionne » : le message nomme l'agresseur analyse, sa longueur et le
#   nombre de candidates.
# Fonctions ajoutees/modifiees : _couvert, _verdict, _f_du_pire, _db_sous
#   (nouvelles) ; _seuil_couture, controle_masse, desaccords, zones_risque,
#   _lire_couples, _avertir, analyser, positions (modifiees).
#
# Version: 2.2.0
# Date: 2026-09-02
# Explication: LA FICHE SE LIT, OU ELLE NE SERT A RIEN. Tout ce qui avait ete
#   regarde s'ecrivait, au meme rang et a la meme longueur : la matrice non
#   passive et l'ecart de vitesse de 0,3 % faisaient deux paragraphes de
#   soixante mots l'un comme l'autre. On lit cela en diagonale, c'est-a-dire
#   pas du tout -- et un avertissement non lu vaut un avertissement absent,
#   ce qui est le defaut que toute cette section cherche a ne jamais produire.
#
#   DEUX LONGUEURS POUR CHAQUE RESERVE. `_grave` prend maintenant un TITRE en
#   plus du texte : le titre dit le FAIT et tient sur une ligne (« la carte ne
#   localise rien : 11,8 mm de resolution pour 40 mm de liaison »), le texte
#   dit pourquoi cela compte et quoi en faire. La page affiche le premier et
#   replie le second ; le rapport exporte garde les deux. Rien ne disparait,
#   tout se hierarchise.
#
#   CE QU'IL Y A A FAIRE (`actions`). C'est la seule partie de la fiche qui se
#   lise comme une consigne, et elle n'ajoute aucun calcul : chaque ligne
#   relit une mesure deja faite, tournee du cote de la main plutot que de
#   l'oeil. « -13,8 dB a 12,4 mm » est exact et ne dit pas s'il faut ecarter la
#   piste, coudre le plan, ou ne rien faire. L'ORDRE EST CELUI DE L'EFFET et
#   non de la gravite : ecarter une piste sous un pic que le dessin n'explique
#   pas ne changerait rien, ces plages-la passent donc APRES le plan de
#   reference, qui en est la cause probable. Elle vit ICI et non dans la page :
#   le fichier exporte et la fiche doivent dire la meme chose, et deux listes
#   ecrites a deux endroits auraient fini par diverger.
#
#   UNE LISTE VIDE EST UNE REPONSE : sur un resultat confirme, elle veut dire
#   que le couplage est reparti sur tout le longement sans point chaud -- il se
#   corrige en ecartant PARTOUT, pas en reprenant un millimetre.
# Fonctions ajoutees/modifiees : actions, ACTIONS_MAX (nouvelles) ; _grave
#   (signature : + titre), _avertir, _lire_couples, analyser (modifiees).
#
# Version: 2.3.0
# Date: 2026-09-02
# Explication: LA BANDE SE DEDUIT DU DESSIN, et cette version separe deux
#   grandeurs qu'on confond systematiquement -- une relecture exterieure du
#   simulateur vient de le faire, en concluant qu'« un pas frequentiel plus fin
#   ameliorerait la resolution le long du parcours ». Il ne l'ameliore pas d'un
#   cheveu.
#
#   LE HAUT DE BANDE FIXE LA RESOLUTION : deux couplages separes de moins de
#   W.v/(4.f_max) -- pour le NEXT, W etant l'elargissement de la fenetre --
#   sont une seule tache. LE PAS FREQUENTIEL FIXE LA FENETRE T = 1/df, donc la
#   longueur au-dela de laquelle ce qui se couple REVIENT SE POSER au debut de
#   la carte par repliement. Ajouter des points a f_max constant allonge la
#   fenetre et ne touche pas la resolution. L'erreur coute dans les deux sens :
#   on ajoute des points en esperant un pic plus fin, et l'on garde une bande
#   trop etroite pour le voir. Le banc la fige desormais -- doubler la bande
#   divise la resolution par deux, doubler les points ne la change pas.
#
#   TROIS MESURES DU DESSIN SUFFISENT A POSER LES DEUX. Le PLUS COURT
#   LONGEMENT donne ce qu'il y a de plus fin a montrer (trois echantillons en
#   travers, sans quoi ce n'est plus un motif mais une tache) ; la LONGUEUR du
#   parcours donne l'aller-retour, donc la fenetre minimale, donc les points ;
#   l'EPAISSEUR du dielectrique pose le plafond -- au-dela de lambda/10 dedans,
#   la section droite quasi-TEM ne decrit plus la ligne, et monter encore
#   affine la carte EN APPARENCE tout en la fabriquant.
#
#   LA BORNE QUI A MORDU SE NOMME, parce que c'est elle qui dit quoi changer.
#   « Plafonnee par le modele » veut dire qu'aucun reglage n'affinera davantage
#   sans mentir ; « plafonnee par les points » veut dire qu'on a garde la
#   fenetre et baisse la bande -- une carte floue est honnete, une carte
#   repliee fabrique des pics qui n'existent pas.
#
#   RIEN N'EST DEVINE EN SILENCE : la deduction se DEMANDE (`bande_auto`), ses
#   deux nombres se reecrivent dans les champs du panneau, et la phrase qui les
#   explique est dans la fiche comme dans le rapport exporte.
# Fonctions ajoutees/modifiees : bande_deduite, _detail_bande (nouvelles) ;
#   _reglages, analyser (modifiees) ; DEFAUTS (+ bande_auto).
#
# Version: 3.0.0
# Date: 2026-09-02
# Explication: UN ZERO QU'ON N'A PAS MESURE RESSEMBLE A UN ZERO. Une relecture
#   exterieure et une carte d'essai reelle ont trouve la meme chose par deux
#   chemins : cette section pouvait annoncer « aucune voisine ne depasse le
#   seuil » sur un dessin ou le couplage est maximal. C'est le defaut que tout
#   le fichier existe pour empecher, et il y en avait QUATRE mecanismes
#   distincts -- tous silencieux, tous plausibles a l'ecran.
#
#   (1) LE LONGEMENT LATERAL LU COMME UNE SUPERPOSITION BLINDEE. Les candidats
#   etaient indexes par (net, couche) et leur `type`, leur `distance` et leur
#   `blinde` etaient figes a la PREMIERE rencontre. Il suffisait que
#   l'AGRESSEUR commence sur une autre couche pour qu'une voisine qui longe
#   franchement a plat sur la seconde moitie du parcours soit vue « verticale,
#   separee par un plan de reference », donc ecartee -- avec un motif FAUX.
#   Les deux natures de rencontre sont desormais comptees a part (`lat` et
#   `vert`), et le LATERAL L'EMPORTE des qu'il existe : deux pistes de la meme
#   couche ne peuvent pas etre separees par un plan. La portion superposee est
#   mesuree a cote, jamais fondue dans la premiere, et son couplage non
#   modelise est dit -- note quand un plan la blinde, reserve quand rien ne la
#   blinde.
#
#   (2) LA SECTION QU'ON NE SAIT PAS RESOUDRE RENDAIT UN COUPLAGE NUL. Quand
#   `section_de_couche` ne rend rien -- pas de plan de reference sous la piste
#   --, chaque conducteur retombe sur sa ligne isolee, [C] et [L] restent
#   DIAGONALES, et le terme croise vaut EXACTEMENT zero. Le calcul aboutissait,
#   la carte se dessinait, et cette branche etait la seule du module a renoncer
#   sans un mot. `_matrices_bloc` rend maintenant quels conducteurs ont
#   VRAIMENT ete couples, la longueur non couplee est comptee, et elle leve une
#   reserve : un plancher n'est pas une mesure.
#
#   (3) LE SEUIL DE DISTANCE SE RETRECISSAIT LA OU LE CHAMP S'ETEND. Sans plan,
#   `_hauteur_de_couche` rend zero, et « 3 x max(largeur, hauteur) » tombait a
#   trois largeurs de piste -- le seuil le PLUS severe de tous, applique
#   exactement la ou le couplage porte le plus loin faute de plan pour le
#   borner. Il s'ouvre desormais a toute la portee du voisinage, et le dit.
#
#   (4) LA FENTE DU PLAN SOUS LE LONGEMENT NE CHANGEAIT RIEN AU CHIFFRE. La
#   section droite quasi-TEM SUPPOSE un plan de retour continu sous les deux
#   pistes ; la ou il est perce, le retour fait un detour et le couplage reel
#   depasse ce calcul. Une fente sondee qui tombe SUR un longement retenu leve
#   donc une reserve -- et une fente ailleurs n'en leve pas, sans quoi l'alerte
#   serait permanente et cesserait d'etre lue.
#
#   L'AXE DU FEXT NE FAISAIT PAS CE QUE LA FICHE ANNONCAIT. La loi d'arrivee du
#   bruit avant est t(x) = tau_a(x) + tau_v(L) - tau_v(x), parce qu'il
#   CO-PROPAGE ; le code inversait la MOYENNE des deux retards. Deux
#   consequences : t = 0 se trouvait envoye sur x = 0 alors qu'aucune energie ne
#   peut arriver avant tau_v(L) -- toute la premiere moitie de l'axe etait
#   inatteignable --, et le pic tombait TOUJOURS a la meme abscisse. La fiche
#   disait vrai en avertissant « elle ne localise pas », et faux en ajoutant
#   « elle se met a localiser quand les vitesses different » : avec cet axe,
#   jamais. La loi est desormais ecrite une fois (`profil_du_sens`), et quand
#   elle est PLATE -- le cas ordinaire -- la carte ne porte PAS de ligne FEXT
#   plutot qu'une courbe qui designerait un millimetre au hasard. Le NIVEAU du
#   FEXT, lui, ne depend d'aucun axe et reste rendu.
#
#   LE CHAMP « VITESSES » CASSAIT EXACTEMENT DANS LE CAS OU IL SERT. Une
#   vitesse saisie donne un profil a deux points, la cascade en donne un par
#   bloc ; `profil_commun` les additionnait terme a terme et levait
#   « operands could not be broadcast together » -- 500 cote serveur -- pour
#   tout longement partiel. Les deux retards sont maintenant projetes sur
#   l'union des abscisses, ou l'interpolation d'un tau affine par morceaux est
#   exacte.
#
#   ET TROIS CHIFFRES QUI MENTAIENT SANS CONSEQUENCE VISIBLE : tan delta
#   n'entrait pas dans l'impedance caracteristique (`w_mat` ne portait pas le
#   facteur, si bien qu'une ligne adaptee rendait S11 = 0 a la precision
#   machine, et le Touchstone exporte -- ce qu'on compare a un solveur pleine
#   onde -- annoncait une ligne sans aucun retour) ; il etait lu sur la couche
#   du PREMIER troncon pour tout le parcours ; et la mise en page du Touchstone
#   comptait des paires pour des nombres, ce qui ecrivait deux rangees de
#   matrice par ligne au-dela de deux ports. `points` s'ecretait en silence
#   alors qu'il divise la FENETRE temporelle. `_zone_a` tolerait un demi-
#   millimetre en dur la ou tout le reste tolere la resolution.
#
#   ENFIN, « RIEN N'A ETE SIMULE » N'EST PLUS « RIEN NE COUPLE ». Une
#   presélection vide et un calcul complet dont tout tombe sous le seuil
#   rendaient le MEME verdict, suivi de « leurs courbes sont tracees quand
#   meme » au-dessus d'une figure vide. Le resultat porte desormais
#   `preselection_vide`, et la page en fait un verdict distinct.
# Fonctions ajoutees/modifiees : profil_du_sens, _tan_delta,
#   _fentes_sur_longement, _duree (nouvelles) ; profil_commun (signature :
#   deux profils), positions (signature : plus de `sens`), resolution
#   (signature : plus de `sens`, conversion par la pente), carte_du_couple
#   (signature, + pire brut), chaine_mtl, _seuil_distance,
#   candidats_geometriques, _matrices_bloc (+ `couples` rendu),
#   reseau_synthetise, _zone_a (signature : + tolerance), zones_risque,
#   desaccords, analyser, _lire_couples, _avertir, _hypotheses, touchstone_np
#   (modifiees) ; TS_PAR_LIGNE (nouvelle constante).
#
# Version: 3.1.0
# Date: 2026-09-03
# Explication: LE CUIVRE DE MASSE ENTRE DANS LA COUPE -- ET SEULEMENT S'IL EST
#   COUSU. Deux defauts de la meme famille : la section resolue ne contenait
#   pas le cuivre de masse que quelqu'un avait ROUTE, et elle contenait un plan
#   arrose PARFAIT que personne n'avait cousu.
#
#   (1) LA PISTE DE GARDE ETAIT JETEE A L'ETAPE 0a. Un candidat portant un net
#   de reference sortait avec le motif « c'est une garde, pas une victime » --
#   ce qui est vrai de son PORT et faux de son CUIVRE. La coupe envoyee au
#   solveur ne la voyait donc pas : tracer une garde entre l'agresseur et sa
#   victime, avec ou sans vias, ne changeait pas un decibel, et le NEXT annonce
#   etait celui d'un routage qu'on n'avait pas fait. Ces pistes sont
#   maintenant POSEES dans la section de chaque bloc qu'elles longent, sans
#   port et sans ligne dans la fiche des couples -- et c'est
#   `simulation_em._poser_section` qui tranche, avec le meme critere que
#   partout : cousue, la garde est tenue a 0 V et le couplage TOMBE ; sans
#   vias, elle est posee FLOTTANTE et le couplage REMONTE au-dessus de ce qu'il
#   vaut sans aucune garde, parce qu'un tel cuivre transfere. Mesure sur 40 mm,
#   victime a 0,65 mm de l'agresseur : sans garde -25,8 dB · garde cousue
#   -32,7 dB · garde sans vias -25,3 dB.
#
#   (2) LE PLAN ARROSE EXTERIEUR ETAIT TOUJOURS PARFAIT. Voir la 4.1.0 de
#   `simulation_em` : l'ecart au plan lateral se posait sans jamais regarder
#   ses vias. Le bord mal cousu perd desormais son effet coplanaire au lieu de
#   blinder gratuitement, et la carte le dit AVEC le chiffre plutot qu'a cote.
#
#   RIEN DE TOUT CELA N'EST MUET : `blindage` porte les gardes posees, la
#   longueur sur laquelle chacune FLOTTE, et les bords qui ont perdu leur
#   masse ; deux avertissements les nomment, et les hypotheses disent la regle.
# Fonctions modifiees : candidats_geometriques (+ `garde` / `garde_active`,
#   couture des gardes), _matrices_bloc (+ `gardes`, + bords rendus),
#   reseau_synthetise (+ `gardes`, + infos gardes / bords), analyser
#   (presélection des gardes, `blindage`, deux avertissements), _hypotheses.
# ==========================================
"""Crosstalk : ou le couplage se fabrique LE LONG des pistes, et non en moyenne.

    >>> import crosstalk
    >>> crosstalk.etat()["dispo"]
    True

CE QUE CETTE SECTION AJOUTE A L'ONGLET « DIAPHONIE », ET POURQUOI C'EN EST UNE
AUTRE. L'onglet Diaphonie repond a « combien ma voisine prend-elle » : il
resout la SECTION DROITE, en tire [C] et [L], et rend un coefficient. C'est un
chiffre par longement. Il ne dit pas OU, sur les quarante millimetres qui
longent, le couplage se fabrique -- et c'est justement la question qu'on se
pose quand le chiffre est mauvais et qu'il faut corriger le dessin.

La reponse tient en une transformee. Les termes croises de la matrice S d'un
reseau multi-ports -- S(victime, agresseur) -- portent, en frequence, tout ce
que le couplage fait le long du parcours. Leur transformee de Fourier inverse
est une REPONSE IMPULSIONNELLE : un couplage qui se produit a la distance x du
port se lit a un retard t, et t se convertit en x des qu'on connait la vitesse
de propagation. C'est le principe de la reflectometrie temporelle, applique aux
termes CROISES plutot qu'a la reflexion.

    NEXT = S(victime_proche, agresseur_proche)     CONTRE-PROPAGE
    FEXT = S(victime_lointaine, agresseur_proche)  CO-PROPAGE

D'OU VIENT LA MATRICE S. D'UN SEUL ENDROIT, ET IL N'Y A RIEN A IMPORTER : du
DESIGN. Le fichier IPC-2581, ou l'editeur PCB integre, portent deja tout ce
qu'il faut -- le trace des pistes, l'empilage et ses dielectriques, les plans
de reference, les vias --, et c'est de la que le RESEAU MULTI-PORTS se
synthetise : la meme section droite que l'onglet Diaphonie, mise en cascade le
long du parcours. Chaque bloc de la cascade est une portion du parcours ou
l'ensemble des voisines et leurs ecarts ne changent pas, et c'est ce decoupage
qui donne a la carte sa STRUCTURE SPATIALE.

AUCUN FICHIER DE PARAMETRES S N'EST ACCEPTE EN ENTREE, et ce retrait est
delibere. Un .sNp importe apportait une physique qu'on ne sait pas calculer --
pertes conductrices, coudes, transitions de via --, mais il apportait aussi la
seule chose qui ne pardonne pas : l'ORDRE DE SES PORTS. Rien dans un .s6p ne
dit que le port 3 est le bout proche de la victime de gauche ; il fallait donc
une table de correspondance, une confirmation, et un ecran entier pour
l'obtenir -- faute de quoi on lisait le NEXT d'un couple pour celui d'un autre,
sans qu'aucun chiffre ne paraisse anormal. Les ports sont maintenant poses ICI,
a partir de la geometrie : ils sont CONNUS, et le mapping ne se devine plus.

LA MATRICE SORT QUAND MEME EN TOUCHSTONE, et ce n'est pas une contradiction :
c'est une SORTIE. Le meme reseau, ouvert dans un autre outil, doit se comparer
a ce qu'un solveur pleine onde rendrait de la meme geometrie -- c'est ce qui
rend le resultat verifiable ailleurs. Ce qui est interdit est l'inverse : faire
DEPENDRE la carte d'un fichier qu'on n'a pas produit.

LES DEUX ETAPES ZERO, ET ELLES RESTENT DEUX.

  (a) LA PRESELECTION GEOMETRIQUE ne demande a l'utilisateur que l'AGRESSEUR.
      Elle cherche seule ce qui longe : meme couche, et couches adjacentes --
      deux pistes superposees couplent souvent PLUS que les memes cote a cote.
      Elle rend une liste de CANDIDATS avec, pour chacun, sa distance et sa
      longueur de parallelisme MESUREES -- le long du CUIVRE, courbes
      comprises, et non a vol d'oiseau. Elle est obligatoire, et sa raison
      d'etre est de borner le nombre de ports du reseau : simuler toute la
      carte n'est pas une option.

      Elle rend aussi, pour chaque candidat, son PROFIL D'ESPACEMENT : la
      distance a l'agresseur EN FONCTION DE L'ABSCISSE, et non une distance
      moyenne. Une piste qui contourne un composant s'ecarte puis revient, et
      c'est ce resserrement-la qu'il faudra retrouver sous le pic de couplage.

  (b) LA CONFIRMATION PAR SIMULATION lit NEXT et FEXT de chaque candidat et ne
      retient comme VICTIME que ceux qui depassent un seuil (-40 dB par
      defaut, reglable). Une piste geometriquement proche mais electriquement
      decouplee -- un plan interpose, une orientation defavorable -- est
      ECARTEE ICI, et le resultat le DIT : les ecartes sont rendus avec leur
      niveau, pas filtres en silence.

    LES DEUX RESTENT SEPAREES, et c'est la contrainte la plus importante de
    cette section. Fusionnees, elles donneraient une decision opaque : on ne
    saurait plus si une piste absente du resultat est LOIN, ou PROCHE ET
    BLINDEE -- et ce sont deux situations de dessin opposees.

LE PLAN DE MASSE N'EST PAS MODELISE A PART, ET C'EST DELIBERE. Le blindage
d'un plan continu et de ses vias de couture est deja DANS la matrice S : la
section droite de chaque bloc est resolue AVEC son plan de reference et avec
les ecarts au cuivre de masse que la page envoie. Le modeliser une seconde
fois le compterait deux fois. Ce qu'on fait a la place, EN PARALLELE du
couplage et jamais a sa place :

  · on mesure le PAS DE COUTURE le long du parcours de l'agresseur et on le
    compare a un seuil tire de la bande analysee. Un pas insuffisant est
    signale AVANT de regarder le couplage -- c'est une cause, pas un symptome ;
  · on releve les DISCONTINUITES du plan de reference que la page a su voir
    (fentes, coupures) et les CHANGEMENTS DE COUCHE sans via de masse a
    portee. Ces deux-la produisent un pic de couplage LOCALISE, meme quand le
    plan est visible ailleurs sur le trace.

Les deux se superposent a la carte : un pic de couplage a la meme abscisse
qu'un trou de couture n'est plus un mystere, c'en est l'explication.

CE QUE LA CARTE ET LE PROFIL D'ESPACEMENT SE DISENT L'UN A L'AUTRE. La courbe
de couplage seule ne se verifie pas : elle est plausible quoi qu'il arrive.
Superposee au profil d'espacement, elle se recoupe -- un pic doit tomber la ou
les deux pistes se rapprochent, et c'est le DESACCORD qui est le signal :

  · un pic de couplage la ou l'espacement ne se resserre PAS n'est pas
    explique par le dessin des pistes. Il faut alors le chercher ailleurs, et
    la zone de vigilance du plan de reference qui tombe a la meme abscisse le
    donne le plus souvent ;
  · a l'inverse, un ecart de niveau entre DEUX victimes symetriques n'est PAS
    une anomalie en soi. Si l'agresseur n'est pas equidistant des deux a tout
    instant -- et il l'est rarement --, l'ecart est simplement ce que la
    geometrie annonce. On l'affiche ; on ne l'alerte que lorsque les profils
    d'espacement sont comparables et que les couplages, eux, ne le sont pas.

CE QUI NE SE DEVINE JAMAIS EN SILENCE, et c'est la regle de tout ce fichier :
les seuils de la preselection (ils s'affichent et se reglent), le seuil de
confirmation, la bande simulee et la resolution spatiale qu'elle permet
reellement, la vitesse de propagation de chaque piste (calculee ou saisie,
jamais supposee egale d'une piste a l'autre). Un mauvais resultat silencieux
est le pire cas pour un outil de ce genre : la carte reste jolie et le chiffre
est faux.

--------------------------------------------------------------------------
LE DOCUMENT D'ENTREE, format « cao-crosstalk-1 », en MILLIMETRES comme tout ce
qui circule entre les outils du depot :

    format      "cao-crosstalk-1"
    carte       nom du document
    agresseurs  [net, ...] -- les nets SELECTIONNES. Celui qui porte le plus
                de cuivre donne l'axe de position
    stackup     {"layers": [...]}          comme « cao-sim-em-3 »
    geometry    {"objects": [...]}         les troncons de l'agresseur, DANS
                                           L'ORDRE DU PARCOURS
    voisinage   [...]                      le cuivre qui passe a portee
    reference_nets  les nets tenus pour de la masse
    paires      [[netP, netN], ...]        les paires declarees
    analyse     {f_debut, f_fin, points, temps_montee}     (Hz, s)
    reglages    voir DEFAUTS, plus bas
    couture     {"positions": [{"s": mm le long du parcours, "cote": +-1}]}
    fentes      [{"s": mm, "longueur": mm, "quoi": texte}]
    vias_masse  [{x, y, a, b}]             les vias de masse a portee

LE RESULTAT, format « cao-crosstalk-resultat-1 » : voir `analyser`.
"""

import math
import os
import sys

_ICI = os.path.dirname(os.path.abspath(__file__))
if _ICI not in sys.path:
    sys.path.insert(0, _ICI)

# MEME IMPORT A L'ESSAI QUE `simulation_em`, et pour la meme raison : numpy
# peut manquer, et « le solveur ne marche pas » n'a jamais aide personne a
# l'installer. On importe `simulation_em` avec, parce que toute la geometrie
# -- l'appariement, la section droite, la pose des conducteurs -- est chez lui
# et doit le rester : deux implementations de la meme regle auraient derive, et
# l'onglet Diaphonie et l'onglet Crosstalk auraient cesse de designer le meme
# cuivre.
try:
    import numpy as np
    import ligne_mom as tl
    import simulation_em as se
    ERREUR_SOLVEUR = None
except Exception as _exc:                              # noqa: BLE001
    np = None
    tl = None
    se = None
    ERREUR_SOLVEUR = _exc

FORMAT = "cao-crosstalk-1"
FORMAT_RESULTAT = "cao-crosstalk-resultat-1"

C_0 = 299792458.0

# -- les garde-fous ---------------------------------------------------------
# Le cout est en N^3 par bloc et par frequence : N est le nombre de
# conducteurs, et il y a deux fois plus de ports. Cinq victimes font un reseau
# a douze ports, ce qui reste immediat ; cinquante en feraient un a cent deux,
# ce qui ne se lit plus de toute facon.
MAX_VICTIMES = 5
MAX_AGRESSEURS = 3
MAX_BLOCS = 400
MAX_POINTS = 401
MAX_PORTS = 64
MAX_CORPS = 4 * 1024 * 1024

# LE MULTIPLE QUI DONNE LE SEUIL DE DISTANCE PAR DEFAUT. Trois largeurs de
# piste est la regle 3W, celle que tout le monde dessine ; trois hauteurs de
# dielectrique est la meme idee vue de l'autre cote -- c'est la hauteur au plan
# qui fixe l'etendue du champ, et une piste fine sur un stratifie epais couple
# bien au-dela de trois fois sa largeur. On prend le PLUS GRAND des deux : le
# seuil doit MAJORER, et c'est la confirmation par simulation qui fait le tri.
DISTANCE_AUTO = 3.0

# Sous ce nombre de points de frequence, la transformee ne decrit plus une
# position : la resolution spatiale vaut la longueur entiere.
POINTS_MIN = 8

# Le nombre de paires (reel, imaginaire) par ligne d'un fichier Touchstone.
# QUATRE EST LA NORME : au-dela, un lecteur strict compte une rangee de
# matrice par ligne et lit la matrice par morceaux decales.
TS_PAR_LIGNE = 4

DEFAUTS = {
    # -- etape 0a : la preselection geometrique
    "distance_max": 0.0,        # mm ; 0 = deduit de la largeur et de la hauteur
    "longueur_min": 0.0,        # mm ; 0 = deduit de l'ecart et de la hauteur
    "couches_adjacentes": True,
    # -- etape 0b : la confirmation par simulation
    "seuil_db": -40.0,
    # -- la transformee
    "fenetre": "kaiser",
    "kaiser_beta": 8.6,
    "zero_pad": 4,
    "bande_auto": False,        # la bande se deduit de la carte
    "resolution_cible": 0.0,    # mm ; 0 = on ne demande rien, on constate
    # -- la lecture
    "z0": 50.0,
    "ecart_vitesse_max": 0.05,  # 5 % ; au-dela, la mise en cascade suppose
                                # des fronts alignes qu'ils ne sont plus
    "asymetrie_db": 6.0,        # un facteur deux entre deux victimes se dit
    "desaccord": 1.25,          # espacement au pic / espacement median :
                                # au-dela, le pic n'est pas justifie
    "risque": 0.5,              # fraction du pire point d'une victime au-dela
                                # de laquelle la plage se peint sur le cuivre
    "agreger_agresseurs": False,
    "vitesses": {},             # {net: m/s} -- la saisie manuelle
}

FENETRES = ("kaiser", "hann", "rect")


class ErreurCrosstalk(Exception):
    """Refus explicite, avec de quoi corriger le tir.

    Meme forme que `simulation_em.ErreurSimulation` : le motif, et ce qu'il
    faut changer. Les pages affichent les deux, separes d'une ligne vide.
    """

    def __init__(self, message, conseil=""):
        Exception.__init__(self, message)
        self.message = message
        self.conseil = conseil


def etat():
    """Ce que le serveur sait faire ; la page le demande avant de lancer."""
    if ERREUR_SOLVEUR is not None:
        return {"dispo": False,
                "detail": "Analyse de crosstalk indisponible : %s"
                          % ERREUR_SOLVEUR,
                "conseil": "Elle a besoin de numpy : « pip install numpy »."}
    return {"dispo": True, "format": FORMAT, "resultat": FORMAT_RESULTAT,
            "max": MAX_CORPS,
            "source": "le design seul (IPC-2581 ou editeur PCB) : aucun"
                      " fichier de parametres S n'est accepte en entree",
            "methode": "reseau de lignes couplees synthetise depuis la"
                       " geometrie et mis en cascade le long du parcours ->"
                       " matrice S multi-ports -> IFFT -> axe de position",
            "fenetres": list(FENETRES),
            "defauts": dict((k, v) for k, v in DEFAUTS.items()
                            if k != "vitesses"),
            "limites": {"victimes": MAX_VICTIMES,
                        "agresseurs": MAX_AGRESSEURS,
                        "ports": MAX_PORTS, "points": MAX_POINTS,
                        "blocs": MAX_BLOCS}}


def _nb(valeur, defaut=0.0):
    """Un nombre, ou le defaut. Meme repli que `simulation_em._nombre`."""
    try:
        v = float(valeur)
    except (TypeError, ValueError):
        return defaut
    return v if math.isfinite(v) else defaut


def _db(x):
    """Un module en decibels, avec un plancher qui ne soit pas moins l'infini.

    -300 dB est le plancher qu'emploie deja le panneau (`SIM_PLANCHER`) : un
    zero exact -- et il y en a, sur une victime que rien ne couple dans le
    modele -- afficherait « -inf » au milieu d'une colonne de nombres.
    """
    m = abs(complex(x))
    return -300.0 if m <= 1e-15 else max(-300.0, 20.0 * math.log10(m))


# ==========================================================================
# CE QUE LA MATRICE DOIT VERIFIER AVANT QU'ON LA REGARDE
# --------------------------------------------------------------------------
# UN RESULTAT FAUX ET PROPRE EST LE PIRE CAS. La chaine qui suit -- fenetre,
# IFFT, axe de position -- ne leve jamais : elle rend une carte lisse et
# colorée quelle que soit la matrice qu'on lui donne. Une matrice non passive
# -- un reseau qui rend plus de puissance qu'il n'en recoit, ce qu'aucun
# cuivre ne fait -- produit une reponse impulsionnelle qui diverge, et cela ne
# se voit PAS sur la carte : cela se voit sur des valeurs singulieres.
#
# LES DEUX CONTROLES SONT INDEPENDANTS ET DISENT DEUX CHOSES DIFFERENTES :
#
#   · la PASSIVITE (sigma_max <= 1) tombe quand une section a ete resolue de
#     travers -- une matrice [C] ou [L] mal conditionnee, un conducteur pose
#     hors du dielectrique -- ou quand la mise en cascade a derive ;
#   · la RECIPROCITE (S = S^T) tombe quand le reseau porte un materiau
#     gyrotrope -- il n'y en a pas sur un PCB -- ou, bien plus souvent, quand
#     un bloc n'a pas les memes conducteurs a l'aller et au retour, c'est-a-
#     dire quand le decoupage ou l'ordre des ports a bouge en route.
#
# C'EST UN CONTROLE DE NOTRE PROPRE CALCUL, maintenant que la matrice se
# genere ici, et c'est ce qui le rend PLUS utile et non moins : personne
# d'autre ne le fera. On AVERTIT, on ne refuse pas -- un reseau legerement non
# passif reste lisible, et refuser tout net priverait l'utilisateur du seul
# outil qui lui aurait montre le probleme.
# ==========================================================================

# La tolerance de passivite. 1e-6 est le bruit de calcul ; au-dela, c'est le
# reseau qui le dit, pas l'arithmetique.
TOL_PASSIVITE = 1e-6
TOL_RECIPROCITE = 1e-3


def valider_matrice(freqs, s):
    """Passivite et reciprocite, frequence par frequence.

    Rend {passivite:{ok, sigma_max, f}, reciprocite:{ok, ecart, f}} -- avec
    LA FREQUENCE ou le pire se produit, parce que « le fichier n'est pas
    passif » sans dire ou n'aide personne a savoir si c'est le haut de bande
    (extrapolation) ou le bas (calibrage).
    """
    sigmas = np.linalg.svd(s, compute_uv=False)
    pire = sigmas.max(axis=1)
    i_p = int(np.argmax(pire))
    ecart = np.abs(s - np.transpose(s, (0, 2, 1))).max(axis=(1, 2))
    echelle = max(float(np.abs(s).max()), 1e-12)
    i_r = int(np.argmax(ecart))
    return {
        "passivite": {"ok": bool(pire[i_p] <= 1.0 + TOL_PASSIVITE),
                      "sigma_max": float(pire[i_p]),
                      "f": float(freqs[i_p])},
        "reciprocite": {"ok": bool(ecart[i_r] / echelle <= TOL_RECIPROCITE),
                        "ecart": float(ecart[i_r] / echelle),
                        "f": float(freqs[i_r])},
    }


# ==========================================================================
# LA BANDE : ELLE PART DU CONTINU, ET C'EST GRATUIT PUISQU'ON LA CHOISIT
# --------------------------------------------------------------------------
# L'IFFT DEMANDE UNE GRILLE HARMONIQUE : f_k = k.df, k de 0 a K. Un fichier de
# VNA commence a 10 MHz et n'a pas de point k = 0 ; il fallait alors extrapoler
# vers le continu, et l'extrapolation est une approximation qu'on prend faute
# de mieux. ON N'EN A PLUS BESOIN : c'est nous qui synthetisons le reseau, donc
# nous qui choisissons ou l'echantillonner, et la grille part de zero par
# CONSTRUCTION. Ce qui reste ici n'est donc pas un rattrapage, c'est un
# CONTROLE de notre propre grille -- si elle cessait d'etre harmonique, la
# carte se decalerait sans rien lever.
#
# LES DEUX BOUTS DE LA BANDE NE DISENT PAS LA MEME CHOSE, et il faut les lire
# separement :
#
#   · LE BAS fixe la FENETRE TEMPORELLE, T = 1/df : ce qui met plus longtemps
#     que T a revenir se replie au debut de la carte. Un pas trop grand -- trop
#     peu de points -- replie donc le bout lointain sur le bout proche ;
#   · LE HAUT fixe la RESOLUTION SPATIALE : deux zones de couplage plus
#     proches que v/(2.f_max), elargi par la fenetre, sont une seule tache.
#
# C'est pour cela que la resolution VOULUE se saisit : de la se deduit le haut
# de bande qu'il faudrait, et l'ecart entre les deux se dit au lieu de se
# decouvrir sur une carte qu'on croyait fine.
# ==========================================================================

TOL_PAS = 1e-6          # relatif ; au-dela, le pas n'est plus constant


def verifier_bande(freqs):
    """La grille du reseau synthetise -> les infos que la fiche affiche.

    Rend {pas, constant, f_min, f_max, points} et LEVE si la grille n'est pas
    harmonique depuis le continu. Ce cas ne peut venir que d'un defaut de ce
    module -- personne d'autre ne fabrique cette grille --, et le taire
    decalerait tout l'axe de position sans qu'aucun chiffre ne paraisse
    anormal.
    """
    freqs = np.asarray(freqs, dtype=float)
    if freqs.size < POINTS_MIN:
        raise ErreurCrosstalk(
            "Bande de %d point(s) de fréquence, minimum %d."
            % (freqs.size, POINTS_MIN),
            "Augmentez le nombre de points de l'analyse.")
    pas_tous = np.diff(freqs)
    pas = float(np.median(pas_tous))
    if not (pas > 0) or np.max(np.abs(pas_tous - pas)) > TOL_PAS * pas:
        raise ErreurCrosstalk(
            "La grille fréquentielle synthétisée n'est pas à pas constant.",
            "C'est un défaut interne : signalez-le plutôt que de lire la"
            " carte, dont l'axe de position serait faux.")
    if abs(float(freqs[0])) > TOL_PAS * pas:
        raise ErreurCrosstalk(
            "La grille fréquentielle ne part pas du continu (f₀ = %.6g Hz)."
            % freqs[0],
            "C'est un défaut interne : sans le point k = 0, la réponse"
            " temporelle a une ligne de base décalée.")
    return {"pas": pas, "constant": True, "f_min": float(freqs[0]),
            "f_max": float(freqs[-1]), "points": int(freqs.size),
            "ajoutes": 0, "extrapole": False}


def bande_pour_resolution(f_max, atteinte, cible):
    """Le haut de bande qu'il faudrait pour tenir `cible`, en Hz.

    La resolution est INVERSEMENT proportionnelle au haut de bande, tout le
    reste egal -- fenetre, vitesses, sens de lecture. On n'a donc pas besoin
    de refaire le calcul : le rapport suffit, et il se dit a l'utilisateur en
    hertz plutot qu'en « élargissez la bande ».
    """
    if not (f_max > 0 and atteinte > 0 and cible > 0):
        return 0.0
    return f_max * atteinte / cible


# ==========================================================================
# LA BANDE SE DEDUIT DE LA CARTE
# --------------------------------------------------------------------------
# DEUX GRANDEURS INDEPENDANTES, ET ON LES CONFOND TOUT LE TEMPS.
#
#   Le HAUT DE BANDE f_max fixe la RESOLUTION : deux couplages separes de
#   moins de W.v/(4.f_max) -- pour le NEXT, ou W est l'elargissement de la
#   fenetre -- sont une seule tache. Rien d'autre ne la fixe : ni le nombre de
#   points, ni le zero-padding, qui interpole sans distinguer.
#
#   Le PAS FREQUENTIEL df fixe la FENETRE TEMPORELLE T = 1/df, donc la
#   longueur au-dela de laquelle ce qui se couple REVIENT SE POSER au debut de
#   la carte par repliement. Rien d'autre ne la fixe.
#
# Ajouter des points a f_max constant allonge donc la fenetre et ne change PAS
# la resolution d'un cheveu. C'est l'erreur la plus courante sur cette figure,
# et elle coute cher dans les deux sens : on ajoute des points en esperant un
# pic plus fin, et l'on garde une bande trop etroite pour le voir.
#
# D'OU CETTE DEDUCTION. Les deux grandeurs se calculent a partir de choses
# qu'on MESURE deja sur le dessin :
#
#   - la LONGUEUR du parcours et la vitesse donnent l'aller-retour, donc la
#     fenetre minimale, donc df, donc le nombre de points ;
#   - le PLUS COURT LONGEMENT donne ce qu'il y a de plus fin a montrer : une
#     portion plus courte que la resolution ne se verra pas comme un motif.
#     Trois echantillons en travers, et c'en est un ;
#   - l'EMPILAGE pose le plafond, et c'est la limite la plus importante des
#     trois : au-dela de lambda/10 dans le dielectrique, la section droite
#     quasi-TEM ne decrit plus la ligne. Monter la bande au-dela affine la
#     carte en apparence et la fabrique en realite.
#
# RIEN N'EST DEVINE EN SILENCE : la bande deduite s'ecrit dans les champs, avec
# la raison, et se corrige a la main.
# ==========================================================================

# Combien d'echantillons il faut EN TRAVERS du plus court longement pour qu'il
# se lise comme un motif et non comme une tache.
ECHANTILLONS_MOTIF = 3.0
# La resolution visee ne descend pas sous ce plancher : plus fin ne se
# demande plus au calcul mais a la loupe, et coute une bande absurde.
RESOLUTION_PLANCHER = 0.20      # mm
# La fenetre temporelle couvre l'aller-retour AVEC de la marge : la queue de la
# reponse impulsionnelle ne s'arrete pas net a l'instant du dernier couplage.
MARGE_FENETRE = 1.5
# Les bornes du nombre de points. En dessous, la transformee n'a plus assez de
# grain ; au-dessus, on resout la section une fois de trop pour un gain nul.
# NOM DISTINCT DE `POINTS_MIN`, qui est le refus du solveur : ce sont deux
# regles differentes -- l'une dit ce qu'on ACCEPTE de calculer, l'autre ce
# qu'on PROPOSE. Les confondre ferait deriver l'une avec l'autre.
POINTS_DEDUITS_MIN, POINTS_DEDUITS_MAX = 17, 401
# La fraction de longueur d'onde DANS LE DIELECTRIQUE au-dela de laquelle la
# section droite quasi-TEM cesse de decrire la ligne. Un dixieme est la regle
# courante, la meme que pour une cage de vias.
TEM_FRACTION = 10.0


def bande_deduite(parcours, retenus, couches, reglages, cache):
    """Le haut de bande et le nombre de points que CETTE carte demande.

    Rend un dictionnaire, ou None si le parcours ne permet rien d'en tirer.
    Les trois bornes -- resolution voulue, validite du modele, nombre de
    points -- sont chacune nommee, parce que savoir LAQUELLE a mordu est ce
    qui dit quoi changer.
    """
    if not parcours:
        return None
    longueur = float(parcours[-1]["s1"])
    if not (longueur > 0):
        return None

    # -- la vitesse, d'une seule section resolue (et mise en cache)
    seg = parcours[0]
    _c, _l, eps, _r = _ligne_seule(couches, seg["couche"], seg["largeur"],
                                   seg["epaisseur"], cache)
    if eps > 0:
        vitesse, source_v = C_0 / math.sqrt(eps), "section résolue"
    else:
        vitesse, source_v = se.VITESSE_TYPIQUE, "valeur typique (section non résoluble)"
        eps = (C_0 / se.VITESSE_TYPIQUE) ** 2

    # -- ce qu'il y a de plus fin a montrer
    longements = [_nb(c.get("longueur"), 0.0) for c in (retenus or [])]
    longements = [x for x in longements if x > 0]
    plus_court = min(longements) if longements else longueur / 8.0
    saisie = _nb(reglages.get("resolution_cible"), 0.0)
    if saisie > 0:
        cible, source_c = saisie, "résolution visée, saisie"
    else:
        cible = plus_court / ECHANTILLONS_MOTIF
        cible = max(RESOLUTION_PLANCHER, min(cible, longueur / 4.0))
        source_c = ("le tiers du plus court longement (%.2f mm)" % plus_court
                    if longements else
                    "le huitième du parcours, faute de longement mesuré")

    # -- la bande qu'il faudrait, celle que le modele autorise
    largeur = _largeur_fenetre(reglages.get("fenetre"),
                               _nb(reglages.get("kaiser_beta"), 8.6))
    f_res = largeur * vitesse / (4.0 * cible * 1e-3)
    hauteur = se._hauteur_de_couche(couches, seg["couche"], seg["largeur"],
                                    seg["epaisseur"])
    f_tem = (C_0 / (TEM_FRACTION * hauteur * 1e-3 * math.sqrt(eps))
             if hauteur > 0 else 0.0)
    if f_tem > 0 and f_tem < f_res:
        f_max, borne = f_tem, "modèle"
    else:
        f_max, borne = f_res, "résolution"

    # UNE BANDE RONDE. Elle s'ecrit dans un champ qu'on relit et qu'on
    # corrige : « 44,64 GHz » se lit, « 44,6441337594 GHz » fait croire a une
    # precision que rien ne porte. On arrondit VERS LE HAUT -- au dizieme de
    # gigahertz --, ce qui ne peut qu'ameliorer la resolution.
    f_max = math.ceil(f_max / 1e8) * 1e8

    # -- le pas, donc les points : la fenetre doit contenir l'aller-retour
    fenetre_s = MARGE_FENETRE * 2.0 * longueur * 1e-3 / vitesse
    pas = 1.0 / fenetre_s
    points = int(math.ceil(f_max / pas)) + 1
    if points > POINTS_DEDUITS_MAX:
        # ON GARDE LA FENETRE ET L'ON BAISSE LA BANDE, jamais l'inverse. Une
        # carte floue est honnete ; une carte repliee fabrique des pics qui
        # n'existent pas, et rien a l'ecran ne les distingue des vrais.
        points, borne = POINTS_DEDUITS_MAX, "points"
        f_max = pas * (POINTS_DEDUITS_MAX - 1)
    points = max(POINTS_DEDUITS_MIN, points)
    pas = f_max / (points - 1)

    atteinte = 1e3 * largeur * vitesse / (4.0 * f_max)
    return {"f_max": f_max, "points": points, "pas": pas,
            "cible": round(cible, 3), "atteinte": round(atteinte, 3),
            "vitesse": round(vitesse, 1), "source_vitesse": source_v,
            "source_cible": source_c, "plus_court": round(plus_court, 3),
            "f_tem": f_tem, "hauteur": round(hauteur, 4),
            "fenetre_s": fenetre_s, "borne": borne,
            "detail": _detail_bande(f_max, points, cible, atteinte, borne,
                                    f_tem, hauteur, source_c, longueur,
                                    vitesse)}


def _detail_bande(f_max, points, cible, atteinte, borne, f_tem, hauteur,
                  source_c, longueur, vitesse):
    """La phrase qui dit ce qui a ete deduit, et QUI a mordu."""
    quoi = ("%.4g GHz × %d points (pas de %.4g GHz)"
            % (f_max / 1e9, points, f_max / max(1, points - 1) / 1e9))
    pourquoi = {
        "résolution": "pour distinguer %.2f mm — %s." % (cible, source_c),
        "modèle": "PLAFONNÉE par la validité du modèle : au-delà de %.4g GHz,"
                  " λ/%g dans un diélectrique de %.3f mm est plus petit que"
                  " l'épaisseur elle-même, et la section droite quasi-TEM ne"
                  " décrit plus la ligne. On visait %.2f mm (%s), on obtient"
                  " %.2f mm — et c'est une vraie résolution, pas une résolution"
                  " affichée."
                  % (f_tem / 1e9, TEM_FRACTION, hauteur, cible, source_c,
                     atteinte),
        "points": "PLAFONNÉE par le nombre de points : la fenêtre temporelle"
                  " passe avant la finesse. Une carte floue est honnête, une"
                  " carte repliée fabrique des pics qui n'existent pas.",
    }[borne]
    return ("Bande déduite de la carte : %s, %s La fenêtre couvre %.3g ns,"
            " soit %.1f fois l'aller-retour sur %.2f mm à %.4g·10⁶ m/s."
            % (quoi, pourquoi, 1e9 * (points - 1) / f_max,
               MARGE_FENETRE, longueur, vitesse / 1e6))


# ==========================================================================
# DE LA FREQUENCE AU TEMPS, PUIS DU TEMPS A LA POSITION
# --------------------------------------------------------------------------
# LE COMPROMIS EST ENTIER DANS LA FENETRE, et il n'a pas de bonne reponse par
# defaut -- il en a une par usage. Une bande tronquee net (fenetre
# rectangulaire) rend la MEILLEURE resolution spatiale et un ringing de Gibbs
# qui fabrique des lobes de part et d'autre de chaque pic : sur une carte de
# couplage, ces lobes se lisent comme des zones de couplage qui n'existent
# pas. Une fenetre de Kaiser les ecrase -- 8,6 donne environ -65 dB de lobes
# secondaires -- au prix d'un pic environ deux fois plus large.
#
# LE DEFAUT EST DONC KAISER, parce que la question posee ici est « OU cela
# couple-t-il », et qu'un faux pic a cote du vrai est plus couteux qu'un vrai
# pic un peu large. Le beta se regle, et les deux autres fenetres sont
# offertes ; la fiche annonce a chaque fois lequel des deux on a paye.
#
# LE ZERO-PADDING N'AJOUTE AUCUNE RESOLUTION, et c'est dit a l'utilisateur
# plutot que suggere par une courbe soudain plus fine : il interpole entre des
# points deja determines par la bande. Il sert a placer un pic proprement sur
# l'axe, pas a en distinguer deux.
# ==========================================================================


def fenetre(nom, n, beta=8.6):
    """La demi-fenetre du spectre : 1 au continu, 0 en haut de bande.

    `n` est le nombre de points de frequence, continu compris. On prend la
    MOITIE DROITE d'une fenetre symetrique de largeur 2n-1 : le spectre
    unilateral commence au continu, ou la ponderation doit valoir un.
    """
    nom = str(nom or "kaiser").lower()
    if nom not in FENETRES:
        raise ErreurCrosstalk(
            "Fenêtre « %s » inconnue." % nom,
            "Les fenêtres disponibles sont : %s." % ", ".join(FENETRES))
    if n < 1:
        raise ErreurCrosstalk("Spectre vide : rien à fenêtrer.")
    if nom == "rect":
        return np.ones(n)
    pleine = (np.kaiser(2 * n - 1, max(0.0, float(beta))) if nom == "kaiser"
              else np.hanning(2 * n - 1))
    return pleine[n - 1:]


def vers_temporel(spectre, pas_f, nom_fenetre="kaiser", beta=8.6, zero_pad=1):
    """Un spectre unilateral -> (temps, reponse impulsionnelle reelle).

    LE SPECTRE EST RECONSTRUIT A SYMETRIE HERMITIENNE avant la transformee,
    et c'est `np.fft.irfft` qui le fait : c'est la seule facon d'obtenir un
    signal de sortie REEL. Une IFFT complexe rendrait une amplitude dont la
    partie imaginaire n'a aucun sens physique, et dont le module masquerait le
    signe du couplage -- or le signe du FEXT, negatif en microruban, est
    justement ce qui distingue les deux mecanismes.
    """
    spectre = np.asarray(spectre, dtype=complex)
    k = spectre.size
    if k < POINTS_MIN:
        raise ErreurCrosstalk(
            "Bande trop courte : %d points de fréquence, minimum %d."
            % (k, POINTS_MIN),
            "Augmentez le nombre de points, ou la largeur de bande.")
    spectre = spectre * fenetre(nom_fenetre, k, beta)
    pad = max(1, int(zero_pad))
    k_pad = (k - 1) * pad + 1
    if k_pad > 1 << 20:
        raise ErreurCrosstalk("Zero-padding démesuré : %d points." % k_pad)
    plein = np.zeros(k_pad, dtype=complex)
    plein[:k] = spectre
    # LE CONTINU ET LE HAUT DE BANDE SONT REELS dans un spectre hermitien de
    # longueur paire. Le second est deja mis a zero par la fenetre (sauf en
    # rectangulaire) ; le premier est impose ici, sans quoi `irfft` le
    # tronquerait en silence.
    plein[0] = plein[0].real
    n_temps = 2 * (k_pad - 1)
    # LE FACTEUR `pad` N'EST PAS UN REGLAGE : c'est ce qui fait que le
    # zero-padding INTERPOLE au lieu de diviser l'amplitude. `irfft` normalise
    # par la longueur de sortie ; celle-ci est `pad` fois plus grande alors que
    # le contenu spectral, lui, n'a pas bouge. Sans ce facteur, augmenter le
    # padding ferait BAISSER le couplage affiche, ce qui n'a aucun sens.
    h = np.fft.irfft(plein, n=n_temps) * pad
    dt = 1.0 / (n_temps * pas_f)
    return np.arange(n_temps) * dt, h


# ==========================================================================
# LE RESEAU MULTI-PORTS, SYNTHETISE LE LONG DU PARCOURS
# --------------------------------------------------------------------------
# UNE LIGNE MULTICONDUCTEUR UNIFORME SE MET SOUS FORME DE MATRICE DE CHAINE en
# tension-courant, et c'est cette forme-la qu'il faut ici -- pas la matrice S
# de chaque morceau. Deux morceaux de la ligne n'ont pas les memes conducteurs
# couples (une voisine commence, une autre s'arrete) ; leurs matrices modales
# n'ont donc rien de commun. Leurs matrices de CHAINE, elles, sont ecrites
# dans la meme base physique -- les N tensions et les N courants des memes N
# conducteurs -- et se multiplient sans autre precaution. C'est la seule
# facon d'assembler un parcours dont la section change.
#
#     dV/dz = -Z I ,  dI/dz = -Y V ,  Z = jwL , Y = jwC
#     V(z) = T (E a + E^-1 b) ,  E = exp(-G z) ,  G = diag(gamma_i)
#     I(z) = W (E a - E^-1 b) ,  W = Z^-1 T G = L^-1 T diag(sqrt(lambda_i))
#
# W NE DEPEND PAS DE LA FREQUENCE, et ce n'est pas un detail d'optimisation :
# le 1/jw de Z^-1 s'annule exactement contre le jw de G. C'est ce qui rend le
# CONTINU calculable -- a w = 0 la matrice de chaine vaut l'identite, le
# reseau est un jeu de fils, et la matrice S vaut ce qu'elle doit valoir. Une
# ecriture qui divise par w y aurait rendu des infinis, et le point k = 0 est
# precisement celui que la grille harmonique exige.
#
# LES MODES SORTENT D'UN PROBLEME SYMETRIQUE, pas de `eig` sur [L][C]. [L] et
# [C] sont definies positives ; avec [L] = Lh Lh^T, la matrice Lh^T [C] Lh est
# symetrique definie positive, ses valeurs propres sont reelles positives par
# construction et `eigh` les rend triees. T = Lh U redonne les vecteurs
# propres de [L][C]. Passer par `eig` rendrait des valeurs propres complexes a
# 1e-16 pres sur une geometrie symetrique -- et une racine carree de complexe
# la ou il faut un retard reel.
# ==========================================================================


def _modes_mtl(l_mat, c_mat):
    """([L],[C]) -> (T, W, sqrt(lambda)) -- la base modale de la section.

    `lambda_i` est le carre de l'inverse de la vitesse du mode i : le retard du
    mode sur une longueur d est d . sqrt(lambda_i).
    """
    lh = np.linalg.cholesky(l_mat)
    sym = lh.T @ c_mat @ lh
    valeurs, vecteurs = np.linalg.eigh((sym + sym.T) / 2.0)
    if np.any(valeurs <= 0):
        raise ErreurCrosstalk(
            "Section non physique : un mode de propagation a une vitesse"
            " imaginaire.",
            "La géométrie de la section est incohérente — deux conducteurs"
            " qui se touchent, ou une permittivité nulle.")
    racines = np.sqrt(valeurs)
    t_mat = lh @ vecteurs
    w_mat = np.linalg.solve(l_mat, t_mat * racines[None, :])
    return t_mat, w_mat, racines


def chaine_mtl(l_mat, c_mat, longueur, omegas, tan_delta=0.0):
    """La matrice de chaine 2N x 2N d'un troncon uniforme, une par pulsation.

    `longueur` est en METRES, `omegas` en rad/s. `tan_delta` entre dans [C] par
    une permittivite complexe : c'est la seule perte que ce reseau porte, et
    elle est exacte dans cette ecriture -- lambda est simplement multiplie par
    (1 - j tan d), T et W ne bougent pas. La perte CONDUCTRICE, elle, n'y est
    pas : elle rendrait W dependant de la frequence, et elle est dite dans les
    hypotheses plutot que devinee.
    """
    n = l_mat.shape[0]
    t_mat, w_mat, racines = _modes_mtl(l_mat, c_mat)
    if tan_delta > 0:
        # LES DEUX PORTENT LE FACTEUR, ET C'EST LA SEULE ECRITURE JUSTE.
        # [C] devient [C](1 - j tan d) : lambda est multiplie par ce facteur,
        # donc `racines` = sqrt(lambda) ET `w_mat` = L^-1 T sqrt(lambda) le
        # sont par sa RACINE -- w_mat en porte une, exactement comme racines.
        # Ne l'appliquer qu'aux racines laissait l'IMPEDANCE CARACTERISTIQUE a
        # sa valeur sans perte : une ligne « adaptee » rendait alors S11 = 0 a
        # la precision machine au lieu des -42 dB de retour qu'une ligne a
        # pertes dielectriques presente sur une reference reelle. Les decibels
        # de couplage n'en bougeaient guere -- le facteur est une similitude
        # commune a tous les blocs, il ne survit qu'a la conversion aux ports
        # --, mais le Touchstone exporte est justement ce qu'on compare a un
        # solveur pleine onde, et c'est la que le retour manquant se voit.
        facteur = np.sqrt(complex(1.0, -float(tan_delta)))
        racines = racines * facteur
        w_mat = w_mat.astype(complex) * facteur
    q = np.block([[t_mat.astype(complex), t_mat.astype(complex)],
                  [w_mat, -w_mat]]).astype(complex)
    q_inv = np.linalg.inv(q)
    t_c, w_c = t_mat.astype(complex), w_mat.astype(complex)

    phi = np.empty((len(omegas), 2 * n, 2 * n), dtype=complex)
    for k, w in enumerate(omegas):
        gamma = 1j * w * racines
        e = np.exp(-gamma * longueur)
        ei = np.exp(gamma * longueur)
        p = np.block([[t_c * e[None, :], t_c * ei[None, :]],
                      [w_c * e[None, :], -w_c * ei[None, :]]])
        phi[k] = p @ q_inv
    return phi


def s_depuis_chaine(phi, z0):
    """La matrice de chaine -> la matrice S du reseau a 2N ports.

    Les N premiers ports sont les bouts PROCHES (z = 0), les N suivants les
    bouts LOINTAINS (z = L), et les courants sont comptes ENTRANTS aux deux
    bouts -- c'est la convention des parametres S, et c'est elle qui donne au
    terme S(victime_proche, agresseur_proche) le sens de « NEXT ».

    ON NE PASSE PAS PAR [Y]. La conversion chaine -> Y demande l'inverse du
    bloc B, qui s'annule au continu (une ligne de longueur nulle est un
    court-circuit) et a chaque demi-onde. Les ondes, elles, se posent
    directement : V = sqrt(z0)(a+b), I = (a-b)/sqrt(z0), et les deux equations
    de la chaine deviennent un systeme lineaire en (a, b) qui n'a de singularite
    nulle part.
    """
    k, deux_n, _ = phi.shape
    n = deux_n // 2
    a_b = phi[:, :n, :n]
    b_b = phi[:, :n, n:]
    c_b = phi[:, n:, :n]
    d_b = phi[:, n:, n:]
    ident = np.broadcast_to(np.eye(n, dtype=complex), (k, n, n))
    zero = np.zeros((k, n, n), dtype=complex)
    m_v = np.block([[-a_b, ident], [c_b, zero]])
    m_i = np.block([[-b_b, zero], [d_b, ident]])
    gauche = z0 * m_v - m_i
    droite = z0 * m_v + m_i
    return -np.linalg.solve(gauche, droite)


# ==========================================================================
# ETAPE 0a -- LA PRESELECTION GEOMETRIQUE
# --------------------------------------------------------------------------
# ON NE DEMANDE QUE L'AGRESSEUR, et c'est le seul geste que l'utilisateur ait
# a faire. Les victimes se cherchent ici, sur la geometrie, et cette etape est
# OBLIGATOIRE : sans elle, il faudrait mettre toute la carte dans le reseau
# multi-ports, et un reseau a deux cents ports ne se resout pas plus qu'il ne
# se lit.
#
# TROIS REGLES, ET ELLES SE REGLENT :
#   · une DISTANCE LATERALE maximale. Le defaut est trois fois le plus grand
#     de la largeur de piste et de la hauteur au plan -- la regle 3W vue des
#     deux cotes. Il MAJORE volontairement : c'est l'etape 0b qui tranche ;
#   · une LONGUEUR DE PARALLELISME minimale, pour ecarter les croisements et
#     les frolements. Le defaut est celui que l'onglet Diaphonie emploie deja
#     (`LONGEMENT_TRANSVERSE_MIN`) : trois fois la somme de l'ecart et de la
#     hauteur au plan, en deca de quoi une section droite ne decrit plus rien ;
#   · les COUCHES ADJACENTES comptent. Deux pistes superposees couplent
#     souvent PLUS que les memes cote a cote, et les ecarter d'office --
#     ce que fait l'appariement de l'onglet Diaphonie, faute de solveur a
#     conducteurs empiles -- ferait lire un couplage nul la ou il est maximal.
#     Elles sont donc CANDIDATES ; ce que le reseau synthetise sait ou ne sait
#     pas en faire est dit a l'etape 0b, pas ici.
# ==========================================================================


def _parcours(objets):
    """Les troncons de l'agresseur, avec leur abscisse curviligne cumulee.

    L'ABSCISSE EST CELLE DU CUIVRE, et non celle de la corde. Les projections
    (`_longement_intervalle`) se font sur la CORDE de chaque troncon -- c'est
    exact pour une droite, et c'est l'approximation que fait deja tout le
    reste du module pour un arc. On rapporte donc chaque abscisse projetee au
    rapport longueur du cuivre / longueur de la corde : la carte se lit alors
    en millimetres de piste, qui est ce qu'on mesure sur le dessin.
    """
    sortie = []
    s = 0.0
    for i, obj in enumerate(objets):
        axe = se._axe(obj)
        if axe is None:
            continue
        corde = axe[2]
        cuivre = _nb(obj.get("length"), 0.0) or corde
        if not (corde > 0):
            continue
        sortie.append({"i": i, "obj": obj, "axe": axe, "corde": corde,
                       "longueur": cuivre, "s0": s, "s1": s + cuivre,
                       "echelle": cuivre / corde,
                       "couche": int(_nb(obj.get("layer"), 0)),
                       "largeur": _nb(obj.get("width")),
                       "epaisseur": _nb(obj.get("copper_thickness"), 0.035)})
        s += cuivre
    return sortie


def _seuil_distance(reglages, largeur, hauteur):
    """Le seuil de distance laterale, saisi ou deduit. En millimetres.

    SANS HAUTEUR AU PLAN, LE SEUIL NE SE RETRECIT PAS -- IL S'OUVRE. C'est le
    piege exact de cette deduction : `_hauteur_de_couche` rend ZERO quand la
    couche n'a pas de plan de reference, et `3 x max(largeur, 0)` tombait
    alors a trois largeurs de piste -- 0,75 mm pour une piste de 0,25 --,
    c'est-a-dire au plus SEVERE des seuils possibles, la ou le couplage porte
    le plus LOIN. Un cuivre sans plan sous lui n'a pas de hauteur de reference
    qui borne l'etendue de son champ : les voisines a un millimetre, qui sont
    justement celles qui posent probleme, se faisaient ecarter « au-dela du
    seuil » sur une carte ou elles couplent des dizaines de decibels de plus
    qu'ailleurs. On prend donc toute la portee que la page a fournie, et on le
    DIT -- c'est un seuil qu'on ouvre faute de savoir le poser, pas un seuil
    qu'on a mesure.
    """
    saisi = _nb(reglages.get("distance_max"), 0.0)
    if saisi > 0:
        return saisi, "saisi"
    if not (hauteur > 0):
        return se.ECART_COUPLAGE_MAX, (
            "porté au maximum du voisinage (%g mm) : cette couche n'a PAS de"
            " plan de référence, la hauteur au plan vaut donc zéro et le"
            " %g × max(largeur, hauteur) habituel serait tombé à %.3f mm — le"
            " seuil le plus sévère là où le couplage porte le plus loin"
            % (se.ECART_COUPLAGE_MAX, DISTANCE_AUTO,
               DISTANCE_AUTO * largeur))
    auto = DISTANCE_AUTO * max(largeur, hauteur)
    # LE VOISINAGE ENVOYE PAR LA PAGE EST DEJA BORNE (ECART_COUPLAGE_MAX) :
    # annoncer un seuil plus large que ce qu'on a recu ferait croire qu'on a
    # regarde plus loin qu'on ne l'a fait.
    auto = min(auto, se.ECART_COUPLAGE_MAX)
    return auto, "déduit (%g × max(largeur %.3f mm, hauteur %.3f mm))" % (
        DISTANCE_AUTO, largeur, hauteur)


def candidats_geometriques(parcours, voisinage, couches, reglages, refs,
                           nets_agresseurs, paires):
    """Etape 0a. Rend (candidats, seuils).

    Chaque candidat porte ce qui a ete MESURE -- distance minimale, longueur de
    parallelisme, cote, couche -- et les INTERVALLES du parcours sur lesquels
    il longe. Ce sont eux qui decoupent la cascade plus loin : sans les bornes,
    la carte n'aurait pas d'axe.
    """
    if not parcours:
        return [], {}
    couche_ref = parcours[0]["couche"]
    largeur_ref = max(p["largeur"] for p in parcours)
    hauteur = se._hauteur_de_couche(couches, couche_ref, largeur_ref,
                                    parcours[0]["epaisseur"])
    distance_max, source_d = _seuil_distance(reglages, largeur_ref, hauteur)
    saisi_l = _nb(reglages.get("longueur_min"), 0.0)
    adjacentes = bool(reglages.get("couches_adjacentes", True))
    # ON REGARDE DEUX FOIS PLUS LOIN QUE LE SEUIL, ET ON LE DIT. Le seuil borne
    # ce qu'on SIMULE ; une piste juste au-dela doit quand meme APPARAITRE,
    # avec sa distance, sinon l'utilisateur ne peut pas savoir si le seuil
    # qu'il a choisi est le bon. Une liste ou rien ne figure au-dela du seuil
    # ne se distingue pas d'une carte ou il n'y a rien.
    portee = 2.0 * distance_max

    trouves = {}
    for seg in parcours:
        axe = seg["axe"]
        boite = se._boite(axe, portee + seg["largeur"] / 2.0)
        for j, autre in enumerate(voisinage):
            net_a = str(autre.get("net") or "")
            if not net_a or net_a == str(seg["obj"].get("net") or ""):
                continue
            w_a = _nb(autre.get("width"))
            if not (w_a > 0):
                continue
            couche_a = int(_nb(autre.get("layer"), -1))
            vertical = couche_a != seg["couche"]
            if vertical and not adjacentes:
                continue
            if vertical:
                sup = se._superposition(autre, seg["obj"], se._axe(autre))
                if sup is None:
                    continue
                # LE PLAN QUI SEPARE EST UN ECRAN, et c'est la raison d'etre de
                # l'empilage : deux pistes que separe un plan de reference ne
                # se voient pas. On les compte pour pouvoir dire « on a
                # regarde », et on ne les propose pas comme victimes.
                blinde = bool(se._plan_entre(couches, seg["couche"], couche_a))
                recouvrement, decalage = sup
                ecart = max(0.0, decalage - (seg["largeur"] + w_a) / 2.0)
                if ecart > portee:
                    continue
                d0 = d1 = None
                cote = 0
            else:
                inter = se._longement_intervalle(seg["obj"], autre, axe, boite)
                if inter is None:
                    continue
                blinde = False
                d0, d1, entre_axes, cote, _sens = inter
                ecart = entre_axes - (seg["largeur"] + w_a) / 2.0
                if not (0 < ecart <= portee):
                    continue
                recouvrement = d1 - d0

            cle = (net_a, couche_a)
            c = trouves.get(cle)
            if c is None:
                c = trouves[cle] = {
                    "net": net_a, "couche": couche_a,
                    "nom_couche": se._nom_de_couche(couches, couche_a),
                    "largeur": w_a, "cotes": set(), "intervalles": [],
                    "epaisseur": _nb(autre.get("copper_thickness"), 0.035),
                    "gap_face": 0.0, "couture": 0.0,
                    # DEUX NATURES DE RENCONTRE, COMPTEES A PART -- et c'est
                    # tout l'objet de cette structure. Un seul jeu de champs,
                    # fige a la PREMIERE rencontre, faisait lire une voisine
                    # qui longe FRANCHEMENT a cote comme une voisine
                    # superposee : il suffisait que l'agresseur ait commence
                    # sur une autre couche. Elle sortait alors « vertical,
                    # 0,000 mm », et surtout « blindée : un plan de référence
                    # sépare les deux couches » -- un longement lateral reel
                    # ECARTE AVEC UN MOTIF FAUX, ce qui est exactement la
                    # classe d'erreur que cette etape existe pour empecher.
                    "lat": {"longueur": 0.0, "distance": None, "troncons": 0},
                    "vert": {"longueur": 0.0, "distance": None,
                             "troncons": 0, "blinde": True},
                    "role": ("agresseur" if net_a in nets_agresseurs
                             else "victime"),
                    # UN NET DE REFERENCE N'EST PAS UNE VICTIME, MAIS IL EST
                    # DANS LA SECTION. C'est une piste de GARDE : elle n'a pas
                    # de port et n'entre pas dans le tableau des victimes, et
                    # elle prend pourtant du champ aux deux -- c'est meme
                    # exactement ce qu'on lui demande en la routant.
                    "garde": net_a in refs,
                    "paire": any(se._paire_nommee(net_a, str(p["obj"].get("net")
                                                            or ""), paires)
                                 for p in parcours)}
            genre = c["vert"] if vertical else c["lat"]
            genre["longueur"] += recouvrement
            genre["troncons"] += 1
            genre["distance"] = (ecart if genre["distance"] is None
                                 else min(genre["distance"], ecart))
            if vertical:
                # UN SEUL PASSAGE NON BLINDE SUFFIT A NE PLUS L'ETRE : le
                # blindage est une propriete de CHAQUE superposition, pas une
                # etiquette du couple.
                if not blinde:
                    c["vert"]["blinde"] = False
            if not vertical:
                c["cotes"].add(cote)
                # LA COUTURE D'UNE GARDE EST LA SIENNE, et cousue d'UN SEUL
                # cote suffit a la tenir a zero volt : on garde donc le MEILLEUR
                # des deux, comme `_scenes_paralleles` le fait deja de son cote.
                # Pour une voisine de signal, la couture ne decrit que le cuivre
                # qui la borde, et c'est le PIRE trou qui compte.
                cg_a, cd_a = se._couture(autre)
                couture_a = (min(cg_a, cd_a)
                             if (net_a in refs and cg_a > 0 and cd_a > 0)
                             else max(cg_a, cd_a))
                # L'ENTRE-AXES EST SIGNE : negatif a gauche du sens de marche,
                # positif a droite, comme dans `_scenes_paralleles`. C'est lui
                # qui pose la voisine du BON COTE dans la section.
                c["intervalles"].append({
                    "s0": seg["s0"] + d0 * seg["echelle"],
                    "s1": seg["s0"] + d1 * seg["echelle"],
                    "x": (-cote) * entre_axes, "ecart": ecart,
                    "i": seg["i"], "couche": couche_a, "largeur": w_a,
                    "gap_face": se._ecart_face(autre, cote, _sens),
                    "couture": couture_a})

    candidats = []
    for c in trouves.values():
        lat, vert = c.pop("lat"), c.pop("vert")
        # LE LATERAL L'EMPORTE DES QU'IL EXISTE, et la raison est physique :
        # deux pistes sur la MEME couche ne peuvent pas etre separees par un
        # plan de reference, et c'est la seule rencontre que la section droite
        # sache resoudre. Une voisine vue d'abord par-dessous, puis a cote,
        # est une voisine A COTE.
        if lat["troncons"]:
            c["type"] = "latéral"
            c["distance"] = lat["distance"]
            c["longueur"] = lat["longueur"]
            c["blinde"] = False
        else:
            c["type"] = "vertical"
            c["distance"] = vert["distance"] or 0.0
            c["longueur"] = vert["longueur"]
            c["blinde"] = bool(vert["blinde"])
        c["troncons"] = lat["troncons"] + vert["troncons"]
        # CE QUE L'AUTRE NATURE A MESURE N'EST PAS PERDU -- il est rendu a
        # cote. Une voisine qui longe 20 mm a plat PUIS 20 mm superposee est
        # deux situations de dessin, et la fiche doit porter les deux : le
        # reseau, lui, ne couplera que la premiere.
        c["longueur_laterale"] = round(lat["longueur"], 3)
        c["longueur_verticale"] = round(vert["longueur"], 3)
        c["distance_laterale"] = (round(lat["distance"], 4)
                                  if lat["distance"] is not None else None)
        c["distance_verticale"] = (round(vert["distance"], 4)
                                   if vert["distance"] is not None else None)
        c["blinde_verticalement"] = bool(vert["troncons"] and vert["blinde"])
        c["cotes"] = sorted(c.pop("cotes"))
        c["deux_cotes"] = len(c["cotes"]) > 1
        c["cote"] = ("les deux" if c["deux_cotes"]
                     else ("gauche" if (c["cotes"] and c["cotes"][0] > 0)
                           else "droite") if c["cotes"] else "")
        if c["intervalles"]:
            poids = sum(i["s1"] - i["s0"] for i in c["intervalles"]) or 1.0
            c["gap_face"] = sum(i["gap_face"] * (i["s1"] - i["s0"])
                                for i in c["intervalles"]) / poids
            c["couture"] = max(i["couture"] for i in c["intervalles"])
        mini = (saisi_l if saisi_l > 0
                else se.LONGEMENT_TRANSVERSE_MIN * (c["distance"] + hauteur))
        c["longueur_min"] = round(mini, 3)
        c["retenu"] = True
        c["raison"] = ""
        # UNE GARDE ROUTEE ENTRE DANS LA SECTION, ET ELLE N'Y ENTRAIT PAS.
        # Jusqu'ici un net de reference etait ECARTE ici meme, et il l'etait
        # deux fois : pas de port -- ce qui est juste, une garde n'a pas de
        # bruit a elle --, mais pas de CUIVRE non plus, ce qui est faux. La
        # coupe resolue par le solveur ne voyait donc pas la piste de garde que
        # quelqu'un avait tracee entre l'agresseur et sa victime : le NEXT
        # annonce etait celui d'un routage qu'on n'avait pas fait. Elle est
        # maintenant POSEE -- tenue a zero volt si ses vias sont assez serres,
        # FLOTTANTE sinon, et c'est `simulation_em._poser_section` qui tranche
        # avec le meme critere que partout ailleurs (lambda/10 au genou).
        c["garde_active"] = False
        if c["net"] in refs:
            c["retenu"] = False
            c["garde_active"] = bool(c["type"] == "latéral"
                                     and c["intervalles"]
                                     and c["distance"] <= distance_max)
            c["raison"] = (
                "net de référence : garde POSÉE dans la section (elle prend"
                " du champ), sans port — ce n'est pas une victime"
                if c["garde_active"] else
                "net de référence : c'est une garde, pas une victime"
                + ("" if c["type"] == "latéral" else
                   " — et sur une autre couche, la section droite ne sait pas"
                   " la poser")
                + ("" if c["distance"] <= distance_max else
                   " — et à %.3f mm, au-delà du seuil de %.3f mm"
                   % (c["distance"], distance_max)))
        elif c["distance"] > distance_max:
            c["retenu"] = False
            c["raison"] = ("à %.3f mm, au-delà du seuil de %.3f mm : vue mais"
                           " non simulée" % (c["distance"], distance_max))
        elif c["blinde"]:
            c["retenu"] = False
            c["raison"] = "un plan de référence sépare les deux couches"
        elif c["longueur"] < mini:
            c["retenu"] = False
            c["raison"] = ("longement de %.2f mm, sous le minimum de %.2f mm"
                           " (croisement ou frôlement)"
                           % (c["longueur"], mini))
        c["longueur"] = round(c["longueur"], 3)
        c["distance"] = round(c["distance"], 4)
        candidats.append(c)

    # LE PLUS PROCHE D'ABORD : c'est lui qui compte, et c'est lui qu'on garde
    # quand le reseau est plein.
    candidats.sort(key=lambda c: (not c["retenu"], c["distance"]))
    seuils = {"distance_max": round(distance_max, 4), "source": source_d,
              "hauteur": round(hauteur, 4),
              "longueur_min_source": "saisi" if saisi_l > 0 else
              "déduit (%g × (écart + hauteur))" % se.LONGEMENT_TRANSVERSE_MIN,
              "couches_adjacentes": adjacentes}
    return candidats, seuils


# ==========================================================================
# ETAPE 0a, SUITE -- LE PROFIL D'ESPACEMENT, ET POURQUOI IL VAUT MIEUX
# QU'UNE DISTANCE
# --------------------------------------------------------------------------
# UNE DISTANCE UNIQUE NE DECRIT PAS UN LONGEMENT. Deux pistes qui longent sur
# quarante millimetres ne restent pas a la meme distance : l'une contourne un
# composant, l'autre suit un coude, et l'ecart passe de 0,15 a 0,6 mm et
# revient. La distance MINIMALE dit ce qui est le pire ; elle ne dit pas OU.
#
# LE PROFIL EST DONC UNE FONCTION DE L'ABSCISSE, echantillonnee sur le MEME
# axe que la carte de couplage -- et c'est tout l'interet : les deux courbes
# se superposent, et chaque pic de couplage se recoupe avec le resserrement
# qui devrait l'expliquer. Sans cette superposition, une courbe de couplage
# est invérifiable : elle est plausible quoi qu'il arrive.
#
# CE QU'IL VAUT, ET IL FAUT LE DIRE. Le profil est CONSTANT PAR MORCEAUX --
# un morceau par troncon d'agresseur et par voisine --, parce que l'ecart est
# mesure une fois par couple de troncons, au milieu de leur projection commune
# (`_longement_intervalle`). Sur un arc decoupe en un seul troncon, le profil
# rend donc l'ecart MOYEN de l'arc et non son minimum local. C'est la finesse
# du dessin qui fixe celle du profil, et l'abscisse, elle, suit le CUIVRE :
# les arcs sont rapportes a leur longueur developpee, pas a leur corde.
#
# LA OU LA VOISINE NE LONGE PAS, IL N'Y A PAS D'ESPACEMENT -- et surtout pas
# zero, qui se lirait comme un contact. On rend None, la carte laisse un trou,
# et c'est exactement ce qu'il faut voir : un pic de couplage dans un trou du
# profil ne vient pas du dessin des pistes.
# ==========================================================================


def profil_espacement(candidat, axe):
    """L'ecart agresseur <-> candidat le long de l'axe, en mm (None = absent).

    Quand deux longements se recouvrent -- une voisine qui passe des deux
    cotes --, on garde le PLUS PETIT : c'est celui qui couple.
    """
    valeurs = []
    intervalles = candidat.get("intervalles") or ()
    for s in axe:
        meilleur = None
        for it in intervalles:
            if it["s0"] - TOL_BORNE <= s <= it["s1"] + TOL_BORNE:
                meilleur = (it["ecart"] if meilleur is None
                            else min(meilleur, it["ecart"]))
        valeurs.append(None if meilleur is None else round(meilleur, 4))
    return valeurs


def profils_espacement(candidats, axe, notes):
    """{net: fiche} pour tous les candidats qui en ont un.

    La fiche porte les valeurs, la COUVERTURE (la fraction du parcours ou la
    voisine longe) et les statistiques dont le recoupement a besoin. Un
    candidat de couche adjacente n'en a PAS : la superposition se mesure en
    longueur, jamais en abscisse -- on ne saurait pas OU la poser, et une
    position inventee serait pire que pas de profil du tout.
    """
    sortie = {}
    sans = []
    for c in candidats:
        if not (c.get("intervalles") or ()):
            if c.get("retenu"):
                sans.append(c["net"])
            continue
        valeurs = profil_espacement(c, axe)
        vus = [v for v in valeurs if v is not None]
        if not vus:
            continue
        vus_tries = sorted(vus)
        sortie[c["net"]] = {
            "valeurs": valeurs,
            "couverture": round(len(vus) / float(max(1, len(axe))), 4),
            "min": round(vus_tries[0], 4),
            "max": round(vus_tries[-1], 4),
            "median": round(vus_tries[len(vus_tries) // 2], 4)}
    if sans:
        notes.append("Pas de profil d'espacement pour %s : %s sur une couche"
                     " adjacente, dont le recouvrement se mesure en longueur"
                     " et non en abscisse. La distance mesurée reste au"
                     " tableau ; c'est la COURBE qui manque, et avec elle le"
                     " recoupement entre le pic de couplage et le"
                     " resserrement qui l'expliquerait."
                     % (", ".join("« %s »" % n for n in sans),
                        "elle est" if len(sans) == 1 else "elles sont"))
    return sortie


# ==========================================================================
# LE DECOUPAGE EN BLOCS, ET CE QU'UN BLOC CONTIENT
# --------------------------------------------------------------------------
# UN BLOC EST UNE PORTION DU PARCOURS OU RIEN NE CHANGE : le meme troncon
# d'agresseur, le meme ensemble de voisines, les memes ecarts. Les bornes sont
# donc la reunion des bouts de troncons et des bouts de longements -- une
# voisine qui commence au tiers du parcours y ouvre un bloc, et c'est
# exactement ce qui donne a la carte sa structure : le couplage se fabrique la
# ou la voisine est la, et nulle part ailleurs.
#
# TOUTES LES VOISINES SONT DES CONDUCTEURS DU RESEAU, MEME ABSENTES DU BLOC.
# Une victime a DEUX ports -- proche et lointain -- et ils existent sur toute
# la longueur : sur les blocs ou elle ne longe pas, elle est une ligne
# ISOLEE, avec sa propre capacite et sa propre inductance et aucun terme
# mutuel. C'est ce qui fait que sa reponse impulsionnelle porte le bon retard
# de bout en bout, et non seulement celui de la portion couplee.
# ==========================================================================

TOL_BORNE = 1e-4        # mm ; deux bornes plus proches que cela sont la meme


def decouper(parcours, retenus, notes):
    """Les bornes des blocs, en millimetres le long du parcours."""
    if not parcours:
        return []
    bornes = {0.0, parcours[-1]["s1"]}
    for seg in parcours:
        bornes.add(seg["s0"])
        bornes.add(seg["s1"])
    for c in retenus:
        for i in c.get("intervalles") or ():
            bornes.add(i["s0"])
            bornes.add(i["s1"])
    triees = sorted(bornes)
    propres = [triees[0]]
    for b in triees[1:]:
        if b - propres[-1] > TOL_BORNE:
            propres.append(b)
    if len(propres) - 1 > MAX_BLOCS:
        pas = int(math.ceil((len(propres) - 1) / float(MAX_BLOCS)))
        gardees = propres[::pas]
        if gardees[-1] != propres[-1]:
            gardees.append(propres[-1])
        notes.append("Parcours découpé en %d blocs au lieu de %d : le maximum"
                     " est %d. Les frontières les plus fines ont été fondues,"
                     " ce qui ÉTALE le couplage sur les blocs voisins."
                     % (len(gardees) - 1, len(propres) - 1, MAX_BLOCS))
        propres = gardees
    return propres


def _ligne_seule(couches, couche, largeur, epaisseur, cache):
    """(C, L, eps_eff) d'un conducteur qui ne longe rien dans ce bloc.

    SANS MASSE COPLANAIRE : le conducteur est ici hors de tout groupe, et
    l'ecart au plan lateral que la page a mesure valait pour la SELECTION, pas
    pour lui. On le pose donc en ligne nue, ce qui majore legerement son Z0 --
    et cela ne touche que son RETARD PROPRE, pas le couplage, qui est nul dans
    ce bloc par construction.
    """
    cle = ("seule", couche, round(largeur, 6), round(epaisseur, 6))
    if cle in cache:
        return cache[cle]
    geo, info = se.section_de_couche(couches, couche, largeur, epaisseur)
    if geo is None:
        cache[cle] = (None, None, 0.0, info)
        return cache[cle]
    try:
        r = tl.solve_line(geo)
    except Exception as exc:                           # noqa: BLE001
        cache[cle] = (None, None, 0.0, str(exc))
        return cache[cle]
    z0, eps = float(r["z0"]), float(r["eps_eff"])
    racine = math.sqrt(eps)
    cache[cle] = (racine / (C_0 * z0), z0 * racine / C_0, eps, "")
    return cache[cle]


def _tan_delta(couches, couche, largeur, epaisseur, cache):
    """La tangente de pertes du dielectrique de CETTE couche-la.

    ELLE SE LIT PAR BLOC, ET NON UNE FOIS POUR TOUTES. Un parcours qui change
    de couche change de stratifie : la prendre sur le premier troncon --
    ce que faisait la version precedente -- appliquait les pertes d'un
    microruban en surface a une triplaque en coeur de carte, ou l'inverse.
    L'erreur est petite en decibels et parfaitement muette.
    """
    cle = ("tand", couche, round(largeur, 6), round(epaisseur, 6))
    if cle in cache:
        return cache[cle]
    _geo, info = se.section_de_couche(couches, couche, largeur, epaisseur)
    cache[cle] = (_nb(info.get("tan_delta"), 0.0)
                  if isinstance(info, dict) else 0.0)
    return cache[cle]


def _matrices_bloc(couches, seg, presents, conducteurs, refs, couture_max,
                   cache, ecartes, gardes=()):
    """[C] et [L] globales d'un bloc (F/m, H/m), plus eps_eff par conducteur.

    `conducteurs` est la liste GLOBALE, dans l'ordre des ports du reseau :
    l'agresseur de reference d'abord, puis les candidats retenus. `presents`
    dit lesquels longent l'agresseur sur ce bloc, avec leur position laterale
    LOCALE -- c'est elle, et non la moyenne du longement, qui est resolue ici.

    `gardes` PORTE LES PISTES DE MASSE ROUTEES qui longent sur ce bloc-la.
    Elles entrent dans la MEME section, au meme titre que les victimes, mais
    sans port : elles n'ont pas de bruit a elles, et le tableau des victimes
    n'en parle pas. Ce qu'elles changent est le champ, et c'est tout ce qu'on
    leur demande -- tenue a zero volt, une garde cousue fait tomber le NEXT et
    le FEXT ; mal cousue, elle est posee FLOTTANTE et le NEXT REMONTE, parce
    qu'un tel cuivre ne blinde pas, il transfere. Voir `_poser_section`, qui
    tranche entre les deux avec le meme seuil que partout ailleurs.

    REND AUSSI QUELS CONDUCTEURS ONT VRAIMENT ETE COUPLES. C'est le
    renseignement qui manquait le plus : quand la section n'est pas resoluble
    -- pas de plan de reference sur cette couche, solveur en echec --, chaque
    conducteur retombe sur sa ligne isolee, [C] et [L] restent DIAGONALES, et
    le couplage du bloc vaut exactement ZERO. Le calcul aboutit, la carte se
    dessine, et elle annonce « aucun couplage » la ou l'on ne sait pas
    calculer. C'est le faux negatif le plus grave que ce module puisse
    produire, et il etait muet.
    """
    n = len(conducteurs)
    c_g = np.zeros((n, n))
    l_g = np.zeros((n, n))
    eps = [0.0] * n
    couples = set()
    # LES BORDS QUI ONT PERDU LEUR MASSE COPLANAIRE faute de vias : c'est le
    # cinquieme rendu, et il existe pour la meme raison que `couples` -- un
    # calcul qui durcit ses hypotheses en silence n'est pas verifiable.
    bords = []

    if presents:
        scene = {"net": conducteurs[0]["net"], "largeur": seg["largeur"],
                 "epaisseur": seg["epaisseur"],
                 "gap_g": _nb(seg["obj"].get("gap_left"),
                              _nb(seg["obj"].get("gap"), 0.0)),
                 "gap_d": _nb(seg["obj"].get("gap_right"),
                              _nb(seg["obj"].get("gap"), 0.0)),
                 "net_masse": (sorted(refs)[0] if len(refs) == 1 else "masse"),
                 "couture_g": _nb(seg["obj"].get("couture_left"), 0.0),
                 "couture_d": _nb(seg["obj"].get("couture_right"), 0.0),
                 # LE PLUS PROCHE D'ABORD, GARDES COMPRISES. `_poser_section`
                 # pose dans l'ordre qu'on lui donne et compte sur cet ordre :
                 # c'est lui qui decide quelle voisine perd sa place quand la
                 # section est pleine, et c'est lui qui fait qu'une garde deja
                 # posee entre deux pistes n'y est pas doublee d'une masse
                 # interposee imaginaire.
                 "voisins": sorted(
                     [{"net": p["net"], "x": p["x"],
                       "largeur": p["largeur"], "ecart": p["ecart"],
                       "ecart_min": p["ecart"], "longueur": 1.0,
                       "troncons": 1, "cote": "gauche" if p["x"] < 0
                       else "droite", "deux_cotes": False,
                       "garde": bool(p.get("garde")),
                       "gap_face": p.get("gap_face", 0.0),
                       "couture": p.get("couture", 0.0)}
                      for p in list(presents) + list(gardes)],
                     key=lambda v: abs(v["x"]))}
        hauteur = se._hauteur_de_couche(couches, seg["couche"], seg["largeur"],
                                        seg["epaisseur"])
        poses, hors = se._poser_section(scene, hauteur, couture_max)
        for e in hors:
            ecartes.setdefault(e["net"], e["raison"])
        # LA COUTURE DU BORD EST DANS LA CLEF depuis qu'elle decide de l'effet
        # coplanaire exterieur : deux blocs de meme dessin, l'un bordé d'un plan
        # cousu et l'autre non, ne se resolvent plus pareil.
        cle = (seg["couche"], round(seg["epaisseur"], 6),
               tuple((round(p["x"], 5), round(p["w"], 5), bool(p.get("garde")),
                      bool(p.get("flottant"))) for p in poses),
               round(scene["gap_g"], 5), round(scene["gap_d"], 5),
               round(scene["couture_g"], 3), round(scene["couture_d"], 3))
        # LES BORDS PERDUS SE RELEVENT MEME QUAND LE CACHE REPOND. Le calcul
        # est un min et un max sur les rubans poses : il ne coute rien, et le
        # taire sur les blocs deja en cache ferait dependre l'avertissement de
        # l'ordre des blocs.
        e_g, e_d = se._ecarts_masse_du_groupe(poses, scene, couture_max)
        for nom in se._cotes_non_cousus(poses, scene, couture_max):
            bords.append({"cote": nom,
                          "couture": scene["couture_g"] if nom == "gauche"
                          else scene["couture_d"]})
        r = cache.get(cle)
        if r is None:
            geo, _info = se.section_de_couche(couches, seg["couche"],
                                              seg["largeur"], seg["epaisseur"],
                                              e_g, e_d)
            if geo is None:
                # ET ON LE DIT. Cette branche etait la seule du module a
                # renoncer SANS UN MOT : le bloc repartait en lignes isolees,
                # son couplage valait zero, et rien dans le resultat ne
                # distinguait « elles ne couplent pas » de « on n'a pas su
                # calculer ».
                r = cache[cle] = None
                ecartes.setdefault(
                    "_section",
                    "aucune section droite calculable sur « %s » (%s)"
                    % (se._nom_de_couche(couches, seg["couche"]) or
                       ("couche %d" % seg["couche"]),
                       _info if isinstance(_info, str) and _info
                       else "pas de plan de référence exploitable"))
            else:
                geo = dict(geo)
                geo["conducteurs"] = [
                    {"w": p["w"] * 1e-3, "x": p["x"] * 1e-3,
                     "masse": p["garde"] and not p.get("flottant"),
                     "flottant": bool(p.get("flottant"))} for p in poses]
                try:
                    r = cache[cle] = tl.solve_multiline(geo)
                except Exception as exc:               # noqa: BLE001
                    r = cache[cle] = None
                    ecartes.setdefault("_section", str(exc))
        if r is not None:
            # DE L'ORDRE D'ENTREE A L'ORDRE DES PORTS. `solve_multiline` range
            # ses rubans de gauche a droite et rend `ordre` pour retrouver
            # l'entree ; sans cette table, une voisine de gauche lirait la
            # ligne de [C] d'une voisine de droite -- en silence, et avec un
            # chiffre parfaitement credible.
            rang_port = dict((rang, i) for i, rang in enumerate(r["ordre"]))
            c_loc = np.asarray(r["c"], dtype=float)
            l_loc = np.asarray(r["l"], dtype=float)
            par_net = dict((c["net"], g) for g, c in enumerate(conducteurs))
            lien = {}
            for rang, pose in enumerate(poses):
                if rang not in rang_port:
                    continue                    # une garde n'a pas de port
                g = 0 if pose.get("selection") else par_net.get(pose["net"], -1)
                if g >= 0:
                    lien[g] = rang_port[rang]
            for g1, p1 in lien.items():
                eps[g1] = float(r["lignes"][p1]["eps_eff"])
                couples.add(g1)
                for g2, p2 in lien.items():
                    c_g[g1, g2] = c_loc[p1, p2]
                    l_g[g1, g2] = l_loc[p1, p2]

    for g, cond in enumerate(conducteurs):
        if g in couples:
            continue
        c_ii, l_ii, eps_ii, raison = _ligne_seule(
            couches, cond["couche"], cond["largeur"], cond["epaisseur"], cache)
        if c_ii is None:
            # UN CONDUCTEUR QU'ON NE SAIT PAS POSER SEUL -- une couche sans
            # plan de reference -- ne peut pas etre un fil : on lui donne la
            # ligne de 50 ohms a la vitesse typique, et on le DIT.
            ecartes.setdefault(cond["net"], "section isolée non calculable : "
                               + str(raison))
            eps_ii = (C_0 / se.VITESSE_TYPIQUE) ** 2
            racine = math.sqrt(eps_ii)
            c_ii, l_ii = racine / (C_0 * 50.0), 50.0 * racine / C_0
        c_g[g, g] = c_ii
        l_g[g, g] = l_ii
        eps[g] = eps_ii
    return c_g, l_g, eps, couples, bords


def reseau_synthetise(couches, parcours, retenus, refs, analyse, reglages,
                      notes, gardes=()):
    """Le reseau multi-ports, mis en cascade le long du parcours.

    Rend (freqs, S, z0, infos) -- avec, dans `infos`, le PROFIL DE RETARD de
    chaque conducteur : le retard cumule en fonction de l'abscisse. C'est lui
    qui remplace la « vitesse de propagation » d'un modele uniforme, et c'est
    ce qui permet a l'axe de position de rester juste quand la piste change de
    largeur, d'ecart ou de couche en cours de route.

    `gardes` EST DU CUIVRE, PAS UN PORT. Ce sont les pistes de masse routees
    que l'etape 0a a repérées le long du parcours : elles n'ajoutent aucun
    conducteur au reseau -- pas de port, pas de ligne dans la fiche -- et
    entrent pourtant dans la section de chaque bloc qu'elles longent. Le
    decoupage en blocs les prend donc en compte, sans quoi une garde qui
    commence au milieu d'un bloc y serait etalee sur toute sa longueur.
    """
    conducteurs = [{"net": str(parcours[0]["obj"].get("net") or ""),
                    "couche": parcours[0]["couche"],
                    "largeur": parcours[0]["largeur"],
                    "epaisseur": parcours[0]["epaisseur"],
                    "role": "agresseur", "vertical": False}]
    for c in retenus:
        conducteurs.append({"net": c["net"], "couche": c["couche"],
                            "largeur": c["largeur"],
                            "epaisseur": c["epaisseur"],
                            "role": c["role"],
                            "vertical": c["type"] == "vertical"})
    n = len(conducteurs)
    if 2 * n > MAX_PORTS:
        raise ErreurCrosstalk(
            "Réseau à %d ports : le maximum est %d." % (2 * n, MAX_PORTS))

    # LE NOMBRE DE POINTS SE DIT QUAND IL EST RAMENE, comme `MAX_BLOCS` et
    # `MAX_VICTIMES` le font. Il ne touche pas la resolution spatiale -- elle
    # ne depend que du haut de bande --, mais il fixe la FENETRE TEMPORELLE
    # T = 1/df : passer de 1000 points a 401 la divise par deux et demi, et ce
    # qui deborde ne disparait pas, il revient se poser au debut de la carte
    # par repliement. Un ecretage muet fabriquait donc des pics.
    demandes = int(_nb(analyse.get("points"), 201))
    points = max(POINTS_MIN, min(demandes, MAX_POINTS))
    if points != demandes and demandes > 0:
        notes.append(
            "Bande échantillonnée sur %d points au lieu des %d demandés : le"
            " maximum est %d et le minimum %d. La RÉSOLUTION SPATIALE n'en"
            " dépend pas — elle ne suit que le haut de bande —, mais la"
            " FENÊTRE TEMPORELLE vaut 1/pas, donc %s au lieu de %s : ce qui se"
            " couple au-delà revient se poser au début de la carte par"
            " repliement, et l'avertissement de fenêtre le dira si le cas se"
            " présente."
            % (points, demandes, MAX_POINTS, POINTS_MIN,
               _duree((points - 1) / max(_nb(analyse.get("f_fin"), 0.0), 1.0)),
               _duree((demandes - 1) / max(_nb(analyse.get("f_fin"), 0.0),
                                           1.0))))
    f_fin = _nb(analyse.get("f_fin"), 0.0)
    if not (f_fin > 0):
        raise ErreurCrosstalk("Haut de bande absent ou nul.")
    # LA GRILLE PART DU CONTINU, ET C'EST GRATUIT ICI : on synthetise, donc on
    # choisit ou l'on echantillonne. Un reseau calcule a partir de f1 > 0
    # obligerait a extrapoler vers le continu ce qu'on sait calculer
    # exactement -- et l'extrapolation est une approximation qu'on ne prend
    # que lorsqu'un fichier importe ne laisse pas le choix.
    pas = f_fin / (points - 1)
    freqs = pas * np.arange(points)
    omegas = 2.0 * math.pi * freqs

    # LES BORNES DE BLOC SUIVENT AUSSI LES GARDES : une piste de masse qui
    # commence a mi-bloc y serait sinon posee sur toute sa longueur, et le
    # blindage qu'elle apporte s'etalerait la ou elle n'est pas.
    bornes = decouper(parcours, list(retenus) + list(gardes), notes)
    couture_max = se._couture_max(_nb(analyse.get("temps_montee"), 0.0))
    cache, ecartes = {}, {}
    phi = np.broadcast_to(np.eye(2 * n, dtype=complex),
                          (points, 2 * n, 2 * n)).copy()
    # LE PROFIL DE RETARD, un point par borne de bloc : c'est l'axe de position
    # de la carte, et il se construit ici parce que c'est ici qu'on connait la
    # permittivite effective de chaque conducteur bloc par bloc.
    abscisses = [0.0]
    retards = [[0.0] for _ in range(n)]
    blocs, muets, tan_deltas = [], [], set()
    etats_gardes, etats_bords = {}, {}
    for a, b in zip(bornes, bornes[1:]):
        milieu = 0.5 * (a + b)
        seg = None
        for s in parcours:
            if s["s0"] - TOL_BORNE <= milieu <= s["s1"] + TOL_BORNE:
                seg = s
                break
        if seg is None:
            continue
        presents = []
        for c in retenus:
            for it in (c.get("intervalles") or ()):
                if it["s0"] - TOL_BORNE <= milieu <= it["s1"] + TOL_BORNE:
                    presents.append({"net": c["net"], "x": it["x"],
                                     "largeur": it["largeur"],
                                     "ecart": it["ecart"],
                                     "gap_face": it["gap_face"],
                                     "couture": it["couture"]})
                    break
        # LES GARDES NE S'ARRETENT PAS A LA PREMIERE TROUVEE, et c'est la
        # difference avec une victime. Le net de masse est le MEME des deux
        # cotes de la piste -- c'est un seul net sur toute la carte --, si bien
        # qu'une garde a gauche et une garde a droite sont un seul candidat
        # avec deux jeux d'intervalles. S'arreter au premier n'en poserait
        # qu'une, et la coupe serait dissymetrique sans que rien ne le dise.
        # On garde donc, PAR COTE, la plus proche.
        gardes_bloc = {}
        for c in gardes:
            for it in (c.get("intervalles") or ()):
                if not (it["s0"] - TOL_BORNE <= milieu <= it["s1"] + TOL_BORNE):
                    continue
                cle_g = (c["net"], 1 if it["x"] > 0 else -1)
                deja = gardes_bloc.get(cle_g)
                if deja is None or abs(it["x"]) < abs(deja["x"]):
                    gardes_bloc[cle_g] = {"net": c["net"], "x": it["x"],
                                          "largeur": it["largeur"],
                                          "ecart": it["ecart"],
                                          "gap_face": it["gap_face"],
                                          "couture": it["couture"],
                                          "garde": True}
        gardes_bloc = sorted(gardes_bloc.values(), key=lambda g: abs(g["x"]))
        c_g, l_g, eps, couples_bloc, bords_bloc = _matrices_bloc(
            couches, seg, presents, conducteurs, refs, couture_max, cache,
            ecartes, gardes_bloc)
        for bd in bords_bloc:
            etat = etats_bords.setdefault(
                bd["cote"], {"cote": bd["cote"], "longueur": 0.0,
                             "couture": 0.0})
            etat["longueur"] += b - a
            etat["couture"] = max(etat["couture"], _nb(bd.get("couture"), 0.0))
        longueur = (b - a) * 1e-3
        # LES PERTES SONT CELLES DU BLOC, pas celles du premier troncon : un
        # parcours qui change de couche change de stratifie.
        td = _tan_delta(couches, seg["couche"], seg["largeur"],
                        seg["epaisseur"], cache)
        tan_deltas.add(round(td, 6))
        phi = np.matmul(chaine_mtl(l_g, c_g, longueur, omegas, td), phi)
        # UN BLOC QUI PORTE DES VOISINES ET N'EN COUPLE AUCUNE : la section n'a
        # pas ete resolue, [C] et [L] y sont diagonales, et le couplage de ce
        # bloc vaut zero par defaut de calcul -- pas par mesure. On garde la
        # longueur et les nets ; c'est `analyser` qui en fait une reserve.
        if presents and len(couples_bloc) < 2:
            muets.append((a, b, sorted(set(p["net"] for p in presents))))
        # LES GARDES, ET SUR QUELLE LONGUEUR CHACUNE TIENT. Une garde n'a pas
        # de ligne dans la fiche des couples -- elle n'a pas de port --, mais
        # taire son existence rendrait le resultat inexplicable : c'est elle
        # qui fait tomber le couplage la ou elle est cousue, et qui le fait
        # MONTER la ou elle ne l'est pas. Le meme critere que `_poser_section`,
        # lu ici pour pouvoir le dire.
        if presents:
            for g in gardes_bloc:
                etat = etats_gardes.setdefault(
                    g["net"], {"net": g["net"], "longueur": 0.0,
                               "longueur_flottante": 0.0, "couture": 0.0})
                etat["longueur"] += b - a
                etat["couture"] = max(etat["couture"],
                                      _nb(g.get("couture"), 0.0))
                if couture_max > 0 and _nb(g.get("couture"), 0.0) > couture_max:
                    etat["longueur_flottante"] += b - a
        abscisses.append(b)
        for g in range(n):
            retards[g].append(retards[g][-1]
                              + longueur * math.sqrt(max(eps[g], 1.0)) / C_0)
        blocs.append({"s0": round(a, 4), "s1": round(b, 4),
                      "voisines": [p["net"] for p in presents],
                      "gardes": [g["net"] for g in gardes_bloc] if presents
                      else []})

    z0 = _nb(reglages.get("z0"), DEFAUTS["z0"]) or DEFAUTS["z0"]
    s_mat = s_depuis_chaine(phi, z0)
    for net, raison in ecartes.items():
        if net == "_section":
            notes.append("Section droite non résoluble sur au moins un bloc :"
                         " %s." % raison)
            continue
        notes.append("« %s » : %s." % (net, raison))
    infos = {"conducteurs": conducteurs, "blocs": blocs,
             "abscisses": abscisses, "retards": retards,
             "tan_delta": min(tan_deltas) if tan_deltas else 0.0,
             "tan_deltas": sorted(tan_deltas), "z0": z0, "pas": pas,
             "points": points, "points_demandes": demandes,
             # LES PISTES DE GARDE POSEES DANS LES SECTIONS, avec la longueur
             # sur laquelle chacune longe et celle ou elle FLOTTE faute de
             # vias. Ce ne sont pas des victimes : elles n'ont pas de port.
             "gardes": [{"net": g["net"],
                         "longueur": round(g["longueur"], 3),
                         "longueur_flottante": round(g["longueur_flottante"],
                                                     3),
                         "couture": round(g["couture"], 2)}
                        for g in sorted(etats_gardes.values(),
                                        key=lambda g: -g["longueur"])],
             # LES BORDS OU LE PLAN ARROSE NE COMPTE PLUS, faute de vias.
             "bords_non_cousus": [{"cote": b0["cote"],
                                   "longueur": round(b0["longueur"], 3),
                                   "couture": round(b0["couture"], 2)}
                                  for b0 in sorted(etats_bords.values(),
                                                   key=lambda b0: b0["cote"])],
             "couture_max": round(couture_max, 3),
             # CE QUI N'A PAS ETE COUPLE, ET SUR QUELLE LONGUEUR.
             "non_couples": [{"s0": round(a0, 3), "s1": round(b0, 3),
                              "nets": nets} for a0, b0, nets in muets],
             "longueur_non_couplee": round(
                 sum(b0 - a0 for a0, b0, _n in muets), 3),
             "raison_section": ecartes.get("_section", ""),
             "longueur": parcours[-1]["s1"]}
    return freqs, s_mat, z0, infos


# ==========================================================================
# LE PLAN DE MASSE : DEUX CONTROLES, A COTE DU COUPLAGE ET JAMAIS A SA PLACE
# --------------------------------------------------------------------------
# LE BLINDAGE EST DEJA DANS LA MATRICE S -- c'est ce que « inclure le plan et
# ses vias dans la geometrie envoyee au solveur » veut dire, et le modeliser
# ici une seconde fois le compterait deux fois. Ce qu'on ajoute est d'une autre
# nature : ce sont des controles de DESSIN, qui repondent a « pourquoi ca
# couple ici » quand la carte a montre « ca couple ici ».
#
# ILS SORTENT AVANT LE COUPLAGE dans la fiche, et c'est voulu. Un pas de
# couture insuffisant est une CAUSE ; le pic de couplage est un SYMPTOME. Les
# lire dans cet ordre est ce qui transforme une carte en decision de routage.
# ==========================================================================

# Le rayon dans lequel on cherche un via de masse au droit d'un changement de
# couche. Trois millimetres est ce qu'emploie deja le chemin de retour de
# l'editeur (`SIM_RAYON_RETOUR`) : au-dela, la boucle est si grande que le via
# ne referme plus rien.
RAYON_MASSE = 3.0
# La fraction de longueur d'onde au-dela de laquelle un trou de couture cesse
# d'etre un detail. Un dixieme est la convention du domaine.
COUTURE_LAMBDA = 10.0


def _seuil_couture(analyse):
    """Le plus grand trou de couture acceptable, en mm, et d'ou il sort.

    DEUX REGLES, ET ON GARDE LA PLUS SEVERE. Le temps de montee donne le trou
    au-dela duquel le cuivre lateral cesse d'etre tenu (`_couture_max`, deja
    employe par l'onglet Diaphonie) ; le haut de la bande ANALYSEE donne
    lambda/10, qui est la regle qu'on applique en dessinant une cage de vias.
    Les deux disent la meme chose a des echelles differentes, et prendre la
    plus severe est ce qui evite d'annoncer « cousu » un cuivre qui resonne
    dans la bande qu'on est justement en train de regarder.
    """
    t_r, source = se._temps_montee(analyse)
    par_front = se._couture_max(t_r)
    f_max = _nb(analyse.get("f_fin"), 0.0)
    par_bande = (1e3 * se.VITESSE_TYPIQUE / (f_max * COUTURE_LAMBDA)
                 if f_max > 0 else 0.0)
    candidats = [(v, q) for v, q in ((par_front, "front (%s)" % source),
                                     (par_bande, "λ/%g à %.4g GHz"
                                      % (COUTURE_LAMBDA, f_max / 1e9)))
                 if v > 0]
    if not candidats:
        return 0.0, "aucune règle applicable", ""
    valeur, quoi = min(candidats)
    # CE QUE L'AUTRE REGLE AURAIT DONNE, ecrit meme quand elle perd. La bande
    # analysee est un REGLAGE : on la monte pour affiner la carte, et le seuil
    # de couture se durcit alors sans qu'on l'ait demande -- un front de 9 ns
    # tolere des centimetres la ou 100 GHz exige un dixieme de millimetre. Sans
    # cette ligne, on cherche dans le cuivre la cause d'une alarme qui vient du
    # champ « bande ».
    # SAUF QUAND ELLE DIT LA MEME CHOSE. Un temps de montee DEDUIT de la bande
    # vaut 0,35/f_max, et les deux regles tombent alors sur le meme
    # millimetre : ecrire « l'autre regle donnerait 0.75 mm » a cote d'un seuil
    # de 0,75 mm ne renseigne pas, ca fait relire deux fois.
    ecarte = "; ".join("la règle du %s donnerait %.2f mm" % (q, v)
                       for v, q in candidats
                       if (v, q) != (valeur, quoi)
                       and abs(v - valeur) > 0.05 * max(valeur, 1e-9))
    return valeur, quoi, ecarte


def _trous_couture(positions, total, seuil):
    """Les intervalles ou aucune couture ne tient le plan, du plus grand pas.

    LES DEUX BOUTS COMPTENT, comme dans `simEspacement` cote editeur : une
    piste cousue en son milieu et nulle part ailleurs a bien deux grands
    trous, et ne mesurer qu'entre vias les cacherait tous les deux.
    """
    zones = []
    for cote in (1, -1):
        pos = sorted(_nb(p.get("s")) for p in positions
                     if int(_nb(p.get("cote"), 1)) == cote)
        bords = [0.0] + pos + [total]
        for a, b in zip(bords, bords[1:]):
            if b - a > seuil:
                zones.append({"type": "couture", "s0": round(a, 3),
                              "s1": round(b, 3), "pas": round(b - a, 3),
                              "cote": "gauche" if cote > 0 else "droite",
                              "detail": "pas de couture de %.2f mm, au-delà"
                                        " du seuil de %.2f mm"
                                        % (b - a, seuil)})
    return zones


def _couvert(zones, total):
    """La FRACTION du parcours couverte par l'union des zones de vigilance.

    ELLE DECIDE DE CE QUE VAUT UNE COINCIDENCE. Dire d'un pic qu'une zone de
    vigilance tombe au meme endroit ne veut quelque chose que si les zones ne
    sont pas partout : quand elles couvrent tout le parcours -- ce qui arrive
    des que le seuil de couture se durcit --, la coincidence est certaine
    d'avance et n'explique donc rien. On la mesure ici pour pouvoir le DIRE
    plutot que de rendre un verdict qui se serait rendu tout seul.

    L'UNION, ET NON LA SOMME : les zones se recouvrent (les deux cotes du
    parcours sont regardes separement), et sommer leurs longueurs annoncerait
    couramment plus de cent pour cent.
    """
    if not (total > 0) or not zones:
        return 0.0
    plages = sorted((max(0.0, _nb(z.get("s0"))), min(total, _nb(z.get("s1"))))
                    for z in zones)
    fusion, total_vu = [], 0.0
    for a, b in plages:
        if b <= a:
            continue
        if fusion and a <= fusion[-1][1]:
            fusion[-1] = (fusion[-1][0], max(fusion[-1][1], b))
        else:
            fusion.append((a, b))
    for a, b in fusion:
        total_vu += b - a
    return min(1.0, total_vu / total)


# Au-dela de cette part du parcours couverte, « une zone de vigilance tombe au
# meme endroit » cesse d'etre un renseignement : une abscisse tiree au hasard
# en rencontre une une fois sur deux.
COUVERT_VAIN = 0.5


def controle_masse(doc, parcours, analyse):
    """Les zones de vigilance du plan de reference, le long du parcours.

    Rend {seuil, source, zones, mesure} : `zones` porte des intervalles en
    millimetres, chacun avec son type -- « couture », « fente », « transition »
    -- et de quoi l'expliquer. `mesure` dit CE QU'ON A PU REGARDER : une page
    qui n'envoie ni positions de couture ni fentes doit voir ecrit qu'on n'a
    rien regarde, et non une liste vide qui se lit « rien a signaler ».
    """
    total = parcours[-1]["s1"] if parcours else 0.0
    seuil, source, ecarte = _seuil_couture(analyse)
    zones, mesure = [], []

    positions = ((doc.get("couture") or {}).get("positions") or []) \
        if isinstance(doc.get("couture"), dict) else []
    if positions and seuil > 0:
        mesure.append("%d via(s) de couture repérés le long du parcours"
                      % len(positions))
        zones.extend(_trous_couture(positions, total, seuil))
    elif seuil > 0:
        # LE REPLI SUR CE QUE LA PAGE ENVOIE DEJA. Chaque troncon porte ses
        # deux plus grands trous de couture (`couture_left`/`couture_right`) --
        # c'est ce que lit deja l'onglet Diaphonie. On n'a alors pas la
        # POSITION du trou, seulement le troncon qui le porte : la zone est
        # donc le troncon entier, et la fiche le dit plutot que de faire croire
        # a une localisation qu'on n'a pas.
        vus = 0
        for seg in parcours:
            trou = max(_nb(seg["obj"].get("couture_left"), 0.0),
                       _nb(seg["obj"].get("couture_right"), 0.0))
            if trou <= 0:
                continue
            vus += 1
            if trou > seuil:
                zones.append({"type": "couture", "s0": round(seg["s0"], 3),
                              "s1": round(seg["s1"], 3), "pas": round(trou, 3),
                              "cote": "", "approche": True,
                              "detail": "tronçon dont le plus grand trou de"
                                        " couture vaut %.2f mm, au-delà du"
                                        " seuil de %.2f mm — la page n'envoie"
                                        " pas la position du trou, la zone est"
                                        " donc le tronçon entier"
                                        % (trou, seuil)})
        if vus:
            mesure.append("couture lue tronçon par tronçon (pas de positions"
                          " de vias envoyées)")

    for f in (doc.get("fentes") or []):
        s0 = _nb(f.get("s"))
        zones.append({"type": "fente", "s0": round(s0, 3),
                      "s1": round(s0 + max(_nb(f.get("longueur"), 0.0),
                                           0.1), 3),
                      "detail": str(f.get("quoi") or "discontinuité du plan de"
                                    " référence détectée sous le parcours")})
    if doc.get("fentes") is not None:
        mesure.append("plan de référence sondé sous le parcours (%d"
                      " discontinuité(s))" % len(doc.get("fentes") or []))

    # LES CHANGEMENTS DE COUCHE SANS VIA DE MASSE A PORTEE. Le courant de
    # retour doit changer de plan la ou le signal change de couche ; s'il n'a
    # pas de via pour le faire, il fait le tour -- et la boucle qu'il decrit
    # rayonne exactement la ou l'on cherche l'origine d'un pic de couplage.
    vias = doc.get("vias_masse")
    if vias is not None:
        manquants = 0
        for a, b in zip(parcours, parcours[1:]):
            if a["couche"] == b["couche"]:
                continue
            bouts = se._extremites(b["obj"])
            if bouts is None:
                continue
            x, y = bouts[0]
            proche = False
            for v in vias:
                if math.hypot(_nb(v.get("x")) - x,
                              _nb(v.get("y")) - y) > RAYON_MASSE:
                    continue
                lo = min(int(_nb(v.get("a"), 0)), int(_nb(v.get("b"), 0)))
                hi = max(int(_nb(v.get("a"), 0)), int(_nb(v.get("b"), 0)))
                if lo <= min(a["couche"], b["couche"]) and \
                        hi >= max(a["couche"], b["couche"]):
                    proche = True
                    break
            if not proche:
                manquants += 1
                zones.append({"type": "transition", "s0": round(b["s0"], 3),
                              "s1": round(b["s0"], 3),
                              "detail": "changement de couche sans via de"
                                        " masse à moins de %.1f mm : le retour"
                                        " n'a pas de chemin court"
                                        % RAYON_MASSE})
        mesure.append("%d via(s) de masse examinés aux changements de couche"
                      % len(vias))

    zones.sort(key=lambda z: (z["s0"], z["s1"]))
    couvert = _couvert(zones, total)
    return {"seuil": round(seuil, 3), "source": source, "ecarte": ecarte,
            "zones": zones, "mesure": mesure, "longueur": round(total, 3),
            "couvert": round(couvert, 4), "vain": bool(couvert >= COUVERT_VAIN)}


# ==========================================================================
# DU TEMPS A LA POSITION -- ET CE QUE CET AXE VAUT VRAIMENT
# --------------------------------------------------------------------------
# LE PROFIL DE RETARD REMPLACE LA VITESSE. Un modele uniforme convertirait par
# une seule vitesse ; on garde ici tau(s), le retard cumule en fonction de
# l'abscisse, bloc par bloc. Sur une piste qui change de largeur, d'ecart ou de
# couche, la permittivite effective change avec elle, et une vitesse unique
# decalerait tout ce qui suit le changement.
#
#     NEXT   t(x) = tau_a(x) + tau_v(x)               CONTRE-PROPAGE
#     FEXT   t(x) = tau_a(x) + tau_v(L) - tau_v(x)    CO-PROPAGE
#
# A vitesses egales, la premiere redonne x = v.t/2 -- la convention attendue.
# LA SECONDE N'EST PAS UNE MOYENNE, et l'ecrire comme telle -- t = (tau_a +
# tau_v)/2, ce que faisait la version precedente -- posait un axe qui n'a
# aucun rapport avec la physique du bout lointain. Deux consequences, et la
# seconde est un contresens : t = 0 s'y trouvait envoye sur x = 0 alors
# qu'aucune energie de FEXT ne peut arriver avant min(tau_a(L), tau_v(L)) --
# toute la premiere moitie de l'axe etait physiquement inatteignable --, et le
# pic tombait TOUJOURS a la meme abscisse quel que soit l'endroit du
# longement. L'avertissement « la ligne FEXT ne localise pas » etait donc
# exact, mais la phrase qui le suivait -- « elle se met a localiser lorsque
# les deux vitesses different » -- etait fausse : avec cet axe-la, elle ne
# localisait jamais.
#
# CE QUE L'AXE DU FEXT NE PEUT PAS FAIRE, ET IL FAUT LE DIRE. Le bruit avant
# CO-PROPAGE avec l'agresseur : ce qui se couple en x descend l'agresseur
# jusqu'a x, puis suit la victime jusqu'au bout LOINTAIN. Quand les deux
# pistes ont la MEME vitesse, tau_a(x) - tau_v(x) est constant : la somme ne
# depend plus de x, tout arrive au meme instant, et aucune transformee ne peut
# separer ce qui s'est superpose. La ligne FEXT n'a alors PAS D'AXE DE
# POSITION -- et depuis cette version elle n'en fabrique plus un : la carte ne
# porte pas de ligne FEXT dans ce cas, et la fiche dit laquelle des deux
# raisons l'en empeche. Elle ne se met a localiser que lorsque les deux
# vitesses different ASSEZ pour que l'ecart de retard de bout en bout depasse
# la resolution temporelle de la fenetre -- c'est-a-dire en milieu
# franchement inhomogene, et jamais sur une triplaque.
# ==========================================================================

# Le nombre de colonnes de la carte. Assez pour lire un pic au dixieme de
# millimetre sur une liaison courante, pas assez pour transporter un tableau
# que personne ne regarde.
COLONNES = 400


def profil_commun(profil_a, profil_v):
    """Les DEUX profils de retard, ramenes sur un MEME axe d'abscisses.

    Rend (s, tau_a, tau_v), ou None quand il n'y a pas d'axe commun.

    LES DEUX SOURCES N'ONT PAS LE MEME AXE, et c'est le cas courant, pas le
    cas tordu : une vitesse SAISIE donne deux points (0 et L), la cascade en
    donne un par borne de bloc. Les additionner terme a terme -- ce que
    faisait la version precedente -- levait

        ValueError: operands could not be broadcast together

    des que l'une des deux vitesses etait saisie et que le parcours comptait
    plus d'un bloc, c'est-a-dire dans TOUT longement partiel : le champ
    « vitesses » du panneau cassait exactement dans le cas ou il sert, et le
    serveur rendait 500. On projette donc les deux retards sur l'UNION des
    abscisses : tau est croissant et affine par morceaux, l'interpolation y
    est exacte sur les points de l'autre.
    """
    s_a = np.asarray(profil_a[0], dtype=float).ravel()
    s_v = np.asarray(profil_v[0], dtype=float).ravel()
    t_a = np.asarray(profil_a[1], dtype=float).ravel()
    t_v = np.asarray(profil_v[1], dtype=float).ravel()
    if s_a.size != t_a.size or s_v.size != t_v.size:
        return None
    if s_a.size < 2 or s_v.size < 2:
        return None
    # LES BORNES COMMUNES SEULEMENT : au-dela, il faudrait extrapoler un
    # retard, et un retard extrapole poserait un pic hors du cuivre.
    s = np.unique(np.concatenate([s_a, s_v]))
    s = s[(s >= max(s_a[0], s_v[0]) - TOL_BORNE)
          & (s <= min(s_a[-1], s_v[-1]) + TOL_BORNE)]
    if s.size < 2:
        return None
    # DEUX BORNES A LA MEME ABSCISSE N'EN FONT QU'UNE : un bloc de longueur
    # nulle donnerait deux retards egaux, et `np.interp` rendrait alors
    # n'importe quoi sur l'axe inverse.
    garde = np.concatenate([[True], np.diff(s) > TOL_BORNE])
    s = s[garde]
    if s.size < 2:
        return None
    return s, np.interp(s, s_a, t_a), np.interp(s, s_v, t_v)


def profil_du_sens(commun, sens):
    """(abscisses, instants d'arrivee) pour un sens -- STRICTEMENT CROISSANT.

    C'est l'axe que `positions` inverse, et il n'y en a pas d'autre : la loi
    d'arrivee est ecrite ici une fois, pour les deux sens.

        NEXT   t(x) = tau_a(x) + tau_v(x)                CONTRE-PROPAGE
        FEXT   t(x) = tau_a(x) + tau_v(L) - tau_v(x)     CO-PROPAGE

    REND None QUAND LA LOI N'EST PAS INVERSIBLE, et c'est le cas normal du
    FEXT : a vitesses egales t ne depend plus de x, et il n'existe aucune
    abscisse a rendre. Fabriquer un axe la aurait produit une courbe qui
    designe un millimetre sans rien mesurer -- le plus credible des
    mensonges. Le NEXT, lui, est toujours inversible : les deux retards
    croissent, leur somme aussi.
    """
    s, t_a, t_v = commun
    if sens == "next":
        t = t_a + t_v
    else:
        t = t_a + (t_v[-1] - t_v)
        if t[-1] < t[0]:
            # LA VICTIME EST LA PLUS LENTE : t DECROIT avec x. L'axe existe,
            # il est simplement retourne -- ce qui se couple loin arrive tot.
            s, t = s[::-1], t[::-1]
    if not np.all(np.diff(t) > 0):
        return None
    return s, t


def positions(temps, s_profil, t_profil):
    """L'axe des temps, converti en abscisses le long du PARCOURS ANALYSE.

    C'est le parcours de l'AGRESSEUR, et l'etiquette de la carte le dit ainsi :
    c'est lui qui porte l'abscisse curviligne, la victime n'y est projetee que
    la ou elle longe. Dire « le long de la victime » enverrait chercher un
    millimetre sur un cuivre qui, a cette abscisse, peut tres bien ne pas etre
    la -- et la fiche ecrit justement « aucun longement ici » dans ce cas.

    `t_profil` porte deja la loi du sens (`profil_du_sens`) : il n'y a plus de
    facteur deux ici, et c'est voulu -- un facteur pose au moment de
    l'inversion ne peut pas etre juste pour les deux sens a la fois.

    HORS DU PROFIL, ON REND NaN, JAMAIS UNE BORNE. Un instant anterieur a la
    premiere arrivee n'a pas d'abscisse : pour le FEXT, la premiere arrivee
    vaut tau_v(L) et non zero, et l'envoyer sur x = 0 peuplait d'energie une
    moitie d'axe ou rien ne peut arriver.
    """
    return np.interp(temps, t_profil, s_profil, left=np.nan, right=np.nan)


def _largeur_fenetre(nom, beta):
    """De combien la fenetre elargit le pic, par rapport a la bande brute.

    C'est une approximation assumee -- la largeur du lobe principal d'une
    Kaiser vaut environ sqrt(1 + (beta/pi)^2) fois celle d'une rectangulaire --
    et elle sert a annoncer une resolution HONNETE. Annoncer la resolution de
    la bande brute alors qu'on a applique une Kaiser a 8,6 la surestimerait
    d'un facteur trois.
    """
    nom = str(nom or "kaiser").lower()
    if nom == "rect":
        return 1.0
    if nom == "hann":
        return 2.0
    return math.sqrt(1.0 + (max(0.0, float(beta)) / math.pi) ** 2)


def resolution(f_max, s_profil, t_profil, nom_fenetre, beta):
    """La resolution spatiale reellement atteinte, en millimetres.

    Elle ne depend QUE de la bande et de la fenetre -- pas du zero-padding,
    qui interpole sans rien distinguer de plus. C'est pour cela qu'elle
    s'affiche a cote du resultat : deux pics separes de moins que cela sont un
    seul pic, quelle que soit la finesse de la courbe a l'ecran.

    C'EST UNE LARGEUR QU'ON CONVERTIT, PAS UN INSTANT. La largeur temporelle
    du lobe se change en millimetres par la PENTE de la loi d'arrivee,
    dt / (dt/dx), et non en lisant l'abscisse de l'instant dt -- ce que faisait
    la version precedente. Les deux coincident pour le NEXT, dont la loi passe
    par l'origine ; pour le FEXT, dont la loi part de tau_v(L), la seconde
    lecture rendait un chiffre sans rapport. C'est la MEME pente qui dit que
    la ligne FEXT ne localise rien a vitesses egales : elle y est nulle, et la
    resolution vaut alors le parcours entier.

    QUAND LA BANDE NE PERMET MEME PAS LA LONGUEUR ENTIERE, ON REND LA LONGUEUR
    ENTIERE -- jamais zero. Le cas arrive vite : sur une liaison de 40 mm lue
    jusqu'a 5 GHz, la largeur d'une Kaiser depasse deja le retard de bout en
    bout. Traduire cela en 0,00 mm, comme le faisait une version anterieure,
    etait le pire des contresens : ZERO SE LIT « infiniment fine » alors que la
    verite est « plus grossiere que toute la liaison ». Et comme zero est faux
    au sens booleen, ces lignes-la sortaient EN PLUS des avertissements de
    resolution, qui n'avaient donc jamais l'occasion de les signaler.
    """
    if not (f_max > 0) or s_profil is None or len(s_profil) < 2:
        return 0.0
    dt = _largeur_fenetre(nom_fenetre, beta) / (2.0 * f_max)
    portee = abs(float(s_profil[-1]) - float(s_profil[0]))
    duree = abs(float(t_profil[-1]) - float(t_profil[0]))
    if not (duree > 0) or not (portee > 0):
        return portee
    return min(portee, dt * portee / duree)


def _reechantillonner(x, valeurs, axe):
    """|h| ramene sur l'axe commun, par le MAXIMUM de chaque case.

    PAS PAR INTERPOLATION, et c'est important : la reponse impulsionnelle est
    echantillonnee bien plus finement que l'axe des qu'on padde, et une
    interpolation lineaire tomberait entre deux echantillons -- elle
    RATERAIT les pics, qui sont la seule chose que cette carte doit montrer.
    Les cases vides -- il y en a quand le padding est faible -- sont comblees
    par interpolation, faute de mieux, et elles sont rares.
    """
    n = axe.size
    sortie = np.zeros(n)
    vus = np.zeros(n, dtype=bool)
    if x.size == 0:
        return sortie
    pas = (axe[-1] - axe[0]) / max(1, n - 1)
    if not (pas > 0):
        return sortie
    cases = np.clip(np.round((x - axe[0]) / pas).astype(int), 0, n - 1)
    np.maximum.at(sortie, cases, valeurs)
    vus[cases] = True
    if not vus.all() and vus.any():
        sortie[~vus] = np.interp(axe[~vus], axe[vus], sortie[vus])
    return sortie


def carte_du_couple(spectre, pas_f, s_profil, t_profil, axe, reglages):
    """Un terme croise -> (positions, amplitudes) sur l'axe commun.

    Rend aussi les echantillons BRUTS -- position et amplitude, avant
    reechantillonnage --, plus le PIRE NIVEAU de la reponse impulsionnelle
    entiere, celui-la mesure AVANT tout tri par abscisse : c'est le niveau du
    sens, et il ne doit pas dependre de ce que l'axe de position a su placer.
    """
    temps, h = vers_temporel(spectre, pas_f,
                             reglages.get("fenetre", "kaiser"),
                             _nb(reglages.get("kaiser_beta"), 8.6),
                             int(_nb(reglages.get("zero_pad"), 1)))
    brut = float(np.abs(h).max()) if h.size else 0.0
    x = positions(temps, s_profil, t_profil)
    bon = np.isfinite(x) & (x >= axe[0] - 1e-9) & (x <= axe[-1] + 1e-9)
    x, h = x[bon], h[bon]
    return _reechantillonner(x, np.abs(h), axe), x, h, brut


# ==========================================================================
# LE RECOUPEMENT -- CE QUE LA CARTE ET LA GEOMETRIE SE DISENT L'UNE A L'AUTRE
# --------------------------------------------------------------------------
# UNE COURBE DE COUPLAGE SEULE NE SE VERIFIE PAS. Elle a des pics, ils sont
# quelque part, et rien sur l'ecran ne dit s'ils sont a leur place. C'est le
# defaut de toute reflectometrie : la lecture est plausible quoi qu'il arrive.
#
# LE PROFIL D'ESPACEMENT LUI DONNE UN TEMOIN INDEPENDANT. Il vient de la
# GEOMETRIE et non du calcul electromagnetique ; les deux ne peuvent pas se
# tromper de la meme facon. Un pic doit tomber la ou quelque chose CHANGE
# entre les deux pistes -- un longement qui commence, un resserrement, un
# ecartement. Un pic la ou l'espacement est large et CONSTANT n'est pas
# explique par le dessin des pistes, et c'est cela qu'on signale.
#
# LA REGLE EST VOLONTAIREMENT PRUDENTE, et la raison est simple : une alerte
# qui se declenche a tort detruit la confiance dans toutes les autres. On ne
# signale donc un pic que lorsque les trois conditions sont reunies -- rien ne
# varie autour de lui, l'espacement y depasse nettement l'espacement median, et
# aucune zone de vigilance du plan de reference ne tombe a la meme abscisse.
# Quand une zone tombe la, ce n'est plus un desaccord : c'est une EXPLICATION,
# et elle est rendue comme telle.
#
# LA TOLERANCE N'EST PAS UN REGLAGE : c'est la RESOLUTION SPATIALE de la ligne
# lue. Chercher le resserrement au millimetre pres sur une carte qui ne
# distingue rien en deca de trois millimetres reprocherait a la geometrie ce
# que la bande n'a pas permis de voir.
#
# ON NE RECOUPE QUE LE NEXT. La ligne FEXT ne localise rien lorsque les deux
# vitesses sont egales -- tout ce qui se couple arrive au meme instant --, et
# lui appliquer la meme regle produirait un desaccord a chaque fois, sur une
# ligne dont on sait deja qu'elle ne designe pas une abscisse.
# ==========================================================================

# La fraction du maximum au-dela de laquelle une bosse est un pic. La moitie,
# soit -6 dB : en deca, on regarderait le pied des pics et le bruit de la
# fenetre.
PIC_FRACTION = 0.5
# Au plus, ce nombre de pics par ligne. Une ligne qui en aurait davantage n'a
# pas de pic du tout -- elle est plate ou bruitee --, et les enumerer ne
# dirait rien.
PICS_MAX = 8
# La variation relative d'espacement en deca de laquelle on tient le profil
# pour CONSTANT sur la fenetre regardee.
PLAT = 0.10


def _pics(valeurs, fraction=PIC_FRACTION, maxi=PICS_MAX):
    """Les indices des maxima locaux au-dessus de `fraction` x le maximum."""
    v = np.asarray(valeurs, dtype=float)
    if v.size < 3:
        return []
    seuil = float(v.max()) * fraction
    if not (seuil > 0):
        return []
    trouves = []
    for i in range(v.size):
        if v[i] < seuil:
            continue
        gauche = v[i - 1] if i > 0 else -np.inf
        droite = v[i + 1] if i + 1 < v.size else -np.inf
        # UN PLATEAU N'EST QU'UN PIC : le premier point d'une suite egale est
        # retenu, les suivants non, faute de quoi une crete large se compterait
        # dix fois et noierait les vraies.
        if v[i] >= gauche and v[i] >= droite and not (
                trouves and v[i] == v[trouves[-1]]
                and i - trouves[-1] == 1):
            trouves.append(i)
    trouves.sort(key=lambda i: -v[i])
    return sorted(trouves[:maxi])


def _f_du_pire(freqs, next_c, fext_c):
    """La frequence ou le couplage est le plus fort, en Hz."""
    both = np.maximum(np.abs(np.asarray(next_c)), np.abs(np.asarray(fext_c)))
    if both.size == 0:
        return 0.0
    return round(float(np.asarray(freqs)[int(np.argmax(both))]), 1)


def _db_sous(freqs, spec, f_genou):
    """Le pire couplage SOUS le genou du front, en dB -- None s'il n'y a rien.

    C'est le chiffre qui parle du signal qu'on envoie vraiment, la ou l'autre
    parle de la bande qu'on a demande a regarder.
    """
    if not (f_genou > 0):
        return None
    f = np.asarray(freqs, dtype=float)
    # LE CONTINU NE COMPTE PAS. Le couplage y vaut zero par construction -- deux
    # conducteurs isoles l'un de l'autre ne se transmettent rien a frequence
    # nulle --, et sur une grille de 5 GHz de pas avec un genou a 39 MHz, DC est
    # le SEUL point sous le genou : « sous le genou, il vaut -300 dB » serait
    # alors une lecture du zero de la grille, pas une mesure. Mieux vaut dire
    # qu'on ne sait pas.
    dedans = (f <= f_genou) & (f > 0)
    if not dedans.any():
        return None
    return max(max(_db(x) for x in np.asarray(spec["next"])[dedans]),
               max(_db(x) for x in np.asarray(spec["fext"])[dedans]))


# Au-dela de ce nombre, une liste de gestes cesse d'etre une liste de gestes :
# on la lit comme un rapport d'audit et l'on n'en fait aucun.
ACTIONS_MAX = 6


def actions(risques, masse, desac, couples, seuil_risque):
    """Les gestes a faire, dans l'ordre, ou une liste vide.

    C'EST LA SEULE PARTIE DE LA FICHE QUI SE LIT COMME UNE CONSIGNE, et elle
    n'ajoute aucun calcul : chaque ligne est une relecture de ce qui a deja ete
    mesure, tournee du cote de la main plutot que de l'oeil. Un rapport qui
    dit « -13,8 dB a 12,4 mm » est exact ; il ne dit pas s'il faut ecarter la
    piste, coudre le plan, ou ne rien faire -- et c'est pourtant la seule
    question qu'on se pose devant le layout.

    L'ORDRE EST CELUI DE L'EFFET, PAS CELUI DE LA GRAVITE. Ecarter une piste
    sous un pic que le dessin n'explique pas ne changera rien : ces plages-la
    passent donc APRES le plan de reference, qui en est la cause probable. A
    l'inverse une plage que le dessin explique se corrige tout de suite, et
    c'est le geste le plus rentable de la liste.

    RIEN A FAIRE EST UNE REPONSE. Une liste vide sur un resultat confirme veut
    dire que le couplage est reparti sur tout le longement sans point chaud :
    il se corrige en ecartant PARTOUT ou en reculant la victime, pas en
    reprenant un millimetre.
    """
    gestes = []
    zones = (masse or {}).get("zones") or []
    vain = bool((masse or {}).get("vain"))

    # (1) CE QUE LE DESSIN EXPLIQUE : le geste le plus direct qui soit.
    amber = sorted([z for z in (risques or []) if z.get("justifie")],
                   key=lambda z: -_nb(z.get("niveau_db"), -300.0))
    for z in amber:
        gestes.append({
            "quoi": "écarter", "cible": z["victime"],
            "ou": "de %.2f à %.2f mm" % (z["s0"], z["s1"]),
            "pourquoi": "le couplage y atteint %.1f dB et le profil"
                        " d'espacement l'explique : c'est un resserrement"
                        " réel." % _nb(z.get("niveau_db"), 0.0)})

    # (2) LE PLAN DE REFERENCE, quand il est mis en cause.
    couture = [z for z in zones if z["type"] == "couture"]
    if couture:
        pire = max(couture, key=lambda z: _nb(z.get("pas"), 0.0))
        gestes.append({
            "quoi": "coudre le plan", "cible": "masse",
            "ou": "de %.2f à %.2f mm (le plus grand trou)"
                  % (pire["s0"], pire["s1"]),
            "pourquoi": "%d zone(s) au-delà du seuil de %.2f mm ; le plus"
                        " grand pas vaut %.2f mm. Un cuivre de masse qui"
                        " flotte ne blinde plus, il TRANSFÈRE."
                        % (len(couture), _nb((masse or {}).get("seuil"), 0.0),
                           _nb(pire.get("pas"), 0.0))})
    for z in [x for x in zones if x["type"] == "fente"]:
        gestes.append({
            "quoi": "reprendre le plan", "cible": "masse",
            "ou": "de %.2f à %.2f mm" % (z["s0"], z["s1"]),
            "pourquoi": "discontinuité du plan sous le parcours : le retour"
                        " fait le tour, et la boucle rayonne."})
    for z in [x for x in zones if x["type"] == "transition"]:
        gestes.append({
            "quoi": "poser un via de masse", "cible": "masse",
            "ou": "à %.2f mm (changement de couche)" % z["s0"],
            "pourquoi": "le retour n'a pas de chemin court là où le signal"
                        " change de plan."})

    # (3) CE QUE RIEN N'EXPLIQUE : un endroit a REGARDER, pas un geste. On le
    # dit tel quel plutot que d'inventer une correction.
    for z in sorted([z for z in (risques or []) if not z.get("justifie")],
                    key=lambda z: -_nb(z.get("niveau_db"), -300.0)):
        gestes.append({
            "quoi": "aller voir", "cible": z["victime"],
            "ou": "de %.2f à %.2f mm" % (z["s0"], z["s1"]),
            "pourquoi": "le couplage y monte sans que les deux pistes s'y"
                        " rapprochent : écarter ne servira à rien. %s"
                        % ("Une zone de vigilance y tombe, mais elles"
                           " couvrent trop du parcours pour que ce soit un"
                           " renseignement." if vain else
                           ("Une zone « %s » y tombe." % z["zone"])
                           if z.get("zone") else
                           "Aucune zone de vigilance n'y tombe non plus.")})

    return gestes[:ACTIONS_MAX]


def _grave(avert, graves, titre, msg):
    """Un avertissement qui CHANGE LA LECTURE de la carte, pas un avis de plus.

    DEUX LONGUEURS POUR LA MEME CHOSE, ET LES DEUX SERVENT. Le TITRE tient sur
    une ligne : c'est ce qui s'affiche, et ce qu'on lit en trois secondes avant
    de decider si l'on creuse. Le TEXTE explique pourquoi cela compte et quoi
    faire ; il attend, replie, et se retrouve entier dans le rapport exporte.
    Une reserve qui ne s'affiche qu'en soixante mots n'est pas lue -- et une
    reserve non lue vaut une reserve absente, ce qui est le defaut qu'on
    cherche justement a ne jamais produire.

    LE TITRE N'EST PAS UN RESUME DU TEXTE : c'est le FAIT, sans le pourquoi.
    « la carte ne localise rien » se verifie d'un coup d'oeil ; « la resolution
    spatiale depasse le quart du parcours, donc... » demande deja de lire.
    """
    avert.append(msg)
    graves.append({"titre": titre, "texte": msg})


def _verdict(zone, vain):
    """« plan », « indecidable » ou « inexplique » -- voir `desaccords`."""
    if not zone:
        return "inexplique"
    return "indecidable" if vain else "plan"


def _zone_a(zones, s, tol):
    """La premiere zone de vigilance qui couvre l'abscisse `s`, ou None.

    LA TOLERANCE VIENT DE L'APPELANT, ET C'EST LA MEME QUE PARTOUT AILLEURS :
    la RESOLUTION de la ligne lue, ou la demi-largeur de la plage examinee.
    Un demi-millimetre en dur -- ce qu'employait la version precedente -- etait
    tantot dix fois trop fin (une carte qui ne distingue rien en deca de 5 mm y
    manquait la zone qui explique son pic) tantot trop large, et il ne suivait
    aucun reglage. Le reste du module tolere a la resolution ; celui-ci ne
    faisait pas exception, il l'ignorait.
    """
    for z in zones or ():
        if z["s0"] - tol <= s <= z["s1"] + tol:
            return z
    return None


def zones_risque(lignes, axe, desac, zones, fraction, refus=None):
    """Les plages du parcours ou le couplage de chaque victime SE FABRIQUE.

    C'EST LA CARTE, RENDUE SOUS UNE FORME QU'ON PEUT POSER SUR LE CUIVRE. La
    figure du panneau range les victimes en lignes sur un axe commun, ce qui
    est ce qu'il faut pour les COMPARER ; devant le dessin, la question n'est
    plus « laquelle prend le plus » mais « quel millimètre de CELLE-CI dois-je
    reprendre ». Une plage repond a la seconde, et c'est le meme chiffre.

    LE SEUIL EST RELATIF A LA VICTIME ELLE-MEME, et c'est deliberé. Un seuil
    absolu en decibels dirait « cette piste prend trop », ce que le tableau de
    l'etape 0b dit deja, et mieux. Ce qu'on cherche ici est OU, sur cette
    piste-la, son propre couplage se fabrique : la moitie de son maximum, soit
    -6 dB sous son pire point, est la fraction qui separe une crete d'un pied
    de crete. Elle se regle.

    ON NE LIT QUE LE NEXT, pour la meme raison que le recoupement : la ligne
    FEXT ne localise rien a vitesses egales, et peindre sur le cuivre une plage
    tiree d'une ligne qui ne designe aucune abscisse serait le plus credible
    des mensonges — un trait rouge sur une piste, a un endroit precis, qui ne
    veut rien dire.

    UN REFUS SE DIT, IL NE SE TAIT PAS. Quand une ligne ne peut pas etre
    localisee, `refus` recoit la raison : sans elle, le bouton « sur le
    cuivre » disparait de la fiche et l'on cherche ce qu'on a casse. Une
    commande absente est un bug aux yeux de celui qui s'en servait la veille.

    CHAQUE PLAGE PORTE SON VERDICT, et c'est ce qui la rend actionnable :
    `justifie` est faux quand un pic non explique tombe dedans — le dessin des
    pistes ne rend pas compte de ce couplage-la, et c'est ailleurs qu'il faut
    chercher ; `zone` nomme la zone de vigilance du plan qui tombe au meme
    endroit, quand il y en a une. Les deux se peignent differemment parce
    qu'ils ne demandent pas le meme geste.
    """
    axe = np.asarray(axe, dtype=float)
    if axe.size < 2:
        return []
    etendue = float(axe[-1] - axe[0])
    demi = 0.5 * etendue / max(1, axe.size - 1)
    sorties = []
    for ligne in lignes:
        if ligne["sens"] != "next":
            continue
        # UNE PLAGE QUI NE LOCALISE RIEN NE SE PEINT PAS. Quand la resolution
        # depasse le quart du parcours -- le seuil que la fiche emploie deja
        # pour alerter --, la carte ne distingue plus qu'une poignee de zones
        # et la plage couvrirait le trace entier EN AYANT L'AIR de designer un
        # endroit. Un trait ambre sur toute la piste est plus trompeur que pas
        # de trait du tout : on va y chercher un millimetre qui n'existe pas.
        res = _nb(ligne.get("resolution"), 0.0)
        if res > etendue / 4.0 > 0:
            if refus is not None:
                refus.append({
                    "victime": ligne["victime"],
                    "raison": "résolution de %.2f mm pour un parcours de"
                              " %.2f mm : une plage couvrirait le tracé entier"
                              " en ayant l'air de désigner un endroit."
                              % (res, etendue)})
            continue
        v = np.asarray(ligne["valeurs"], dtype=float)
        pire = float(v.max()) if v.size else 0.0
        if not (pire > 0):
            continue
        seuil = pire * fraction
        # LES PLAGES SONT LES SUITES CONTIGUES AU-DESSUS DU SEUIL. On les prend
        # de bord a bord de case -- une case est une portion de piste, pas un
        # point --, sans quoi une plage d'une seule case serait de longueur
        # nulle et ne se peindrait pas.
        debut = None
        for i in range(v.size + 1):
            haut = i < v.size and v[i] >= seuil
            if haut and debut is None:
                debut = i
            elif not haut and debut is not None:
                s0 = float(axe[debut]) - demi
                s1 = float(axe[i - 1]) + demi
                crete = float(v[debut:i].max())
                dans = [d for d in desac
                        if d["victime"] == ligne["victime"]
                        and s0 - demi <= d["s"] <= s1 + demi]
                # LA PLAGE A UNE ETENDUE : une zone qui la CHEVAUCHE l'explique,
                # et la demi-largeur de la plage est donc la tolerance
                # juste -- pas un demi-millimetre pose la.
                zone = _zone_a(zones, 0.5 * (s0 + s1),
                               max(demi, 0.5 * abs(s1 - s0))) or {}
                sorties.append({
                    "victime": ligne["victime"],
                    "agresseur": ligne["agresseur"],
                    "s0": round(max(float(axe[0]), s0), 3),
                    "s1": round(min(float(axe[-1]), s1), 3),
                    "niveau": round(crete / pire, 4),
                    "niveau_db": round(_db(crete), 2),
                    # UN PIC EXPLIQUE PAR LE PLAN N'EST PAS UN PIC EXPLIQUE
                    # PAR L'ECART. Tout ce que `desaccords` rend est, par
                    # construction, un pic que le DESSIN DES PISTES ne rend pas
                    # compte : peindre en ambre -- « ca se corrige en ecartant »
                    # -- une plage qui en contient un contredirait la phrase que
                    # la fiche ecrit trois lignes plus haut sur le meme pic.
                    "justifie": not dans,
                    "zone": zone.get("type", "")})
                debut = None
    return sorties


def desaccords(lignes, espacements, axe, zones, rapport, vain=False):
    """Les pics de couplage que la geometrie n'explique pas. Rend une liste.

    Chaque entree porte l'abscisse, le niveau relatif du pic, l'espacement
    mesure a cet endroit, l'espacement median du longement, et -- quand il y en
    a une -- la zone de vigilance qui tombe au meme endroit. Le champ `verdict`
    vaut « plan » quand une zone explique le pic, « inexplique » quand rien ne
    l'explique, et « indecidable » quand une zone tombe bien au meme endroit
    mais que les zones couvrent une telle part du parcours qu'y tomber n'etait
    pas evitable.

    LE TROISIEME VERDICT EST LE PLUS IMPORTANT DES TROIS. « Explique par le
    plan » est une conclusion, et une conclusion qui se serait rendue toute
    seule -- parce que les zones sont partout -- est exactement le resultat
    faux et silencieux qu'on cherche a ne jamais produire. `vain` vient de
    `controle_masse`, qui mesure cette part.
    """
    axe = np.asarray(axe, dtype=float)
    sorties = []
    for ligne in lignes:
        if ligne["sens"] != "next":
            continue
        fiche = espacements.get(ligne["victime"])
        if not fiche:
            continue
        valeurs = fiche["valeurs"]
        median = fiche["median"]
        if not (median > 0):
            continue
        # LA TOLERANCE EST LA RESOLUTION, avec un plancher d'une case : une
        # ligne dont la resolution est meilleure que le pas de l'axe ne peut
        # pas etre recoupee plus finement que l'axe lui-meme.
        pas = float(axe[-1] - axe[0]) / max(1, axe.size - 1)
        tol = max(_nb(ligne.get("resolution"), 0.0), pas)
        pire = max(ligne["valeurs"]) or 1.0
        for i in _pics(ligne["valeurs"]):
            s = float(axe[i])
            fenetre_i = [j for j in range(axe.size)
                         if abs(float(axe[j]) - s) <= tol]
            vus = [valeurs[j] for j in fenetre_i if valeurs[j] is not None]
            zone = _zone_a(zones, s, tol)
            entree = {"victime": ligne["victime"],
                      "agresseur": ligne["agresseur"], "sens": "next",
                      "s": round(s, 3),
                      "niveau": round(ligne["valeurs"][i] / pire, 4),
                      "niveau_db": round(_db(ligne["valeurs"][i]), 2),
                      "median": median, "tolerance": round(tol, 3)}
            if not vus:
                entree.update({
                    "espacement": None, "rapport": 0.0,
                    "verdict": _verdict(zone, vain),
                    "zone": (zone or {}).get("type", ""),
                    "detail": "aucun longement mesuré à cette abscisse : la"
                              " victime n'y côtoie pas l'agresseur"})
                sorties.append(entree)
                continue
            bas, haut = min(vus), max(vus)
            if haut > 0 and (haut - bas) / haut > PLAT:
                continue            # quelque chose varie : le pic est justifié
            if bas <= rapport * median:
                continue            # on est au resserrement, ou à sa valeur
            entree.update({
                "espacement": round(bas, 4),
                "rapport": round(bas / median, 3),
                "verdict": _verdict(zone, vain),
                "zone": (zone or {}).get("type", ""),
                "detail": "l'espacement y vaut %.3f mm, soit %.2f fois"
                          " l'espacement médian du longement (%.3f mm), et il"
                          " n'y varie pas de plus de %d %%"
                          % (bas, bas / median, median, int(100 * PLAT))})
            sorties.append(entree)
    return sorties


# ==========================================================================
# LE MAPPING DES PORTS
# --------------------------------------------------------------------------
# IL N'Y A PLUS RIEN A DEVINER, et c'est le benefice le plus concret de la
# source unique. C'est nous qui posons les conducteurs le long du parcours,
# donc nous qui savons quel port est le bout proche de quelle piste. Le
# mapping s'affiche quand meme -- l'utilisateur doit pouvoir verifier que la
# piste qu'il appelle « la victime de gauche » est bien celle que le calcul
# appelle ainsi --, mais il n'est plus une SAISIE : il est un compte rendu.
# ==========================================================================


def mapping_propose(conducteurs):
    """Le mapping du reseau synthetise : il est connu, pas devine.

    C'est nous qui avons pose les conducteurs, donc nous qui savons quel port
    est quoi. Il s'affiche quand meme -- l'utilisateur doit pouvoir verifier
    que la piste qu'il appelle « victime de gauche » est bien celle que le
    calcul appelle ainsi.
    """
    n = len(conducteurs)
    ports = []
    for i, c in enumerate(conducteurs):
        ports.append({"nom": "%s_proche" % c["net"], "index": i + 1,
                      "net": c["net"], "bout": "proche", "role": c["role"]})
        ports.append({"nom": "%s_lointain" % c["net"], "index": n + i + 1,
                      "net": c["net"], "bout": "lointain", "role": c["role"]})
    return ports


# ==========================================================================
# L'ORCHESTRATION
# ==========================================================================

def _reglages(doc):
    """Les reglages du document, completes par les defauts, et VERIFIES.

    Un reglage hors domaine n'est pas ramene en silence : il leve. Une fenetre
    inconnue ou un seuil positif en decibels sont des saisies, pas des
    approximations, et les corriger sans le dire ferait afficher un resultat
    obtenu sous d'autres regles que celles qu'on croit avoir demandees.
    """
    r = dict(DEFAUTS)
    donnes = doc.get("reglages") or {}
    if not isinstance(donnes, dict):
        raise ErreurCrosstalk("Le champ « reglages » n'est pas un objet.")
    r.update(donnes)
    if str(r.get("fenetre", "")).lower() not in FENETRES:
        raise ErreurCrosstalk(
            "Fenêtre « %s » inconnue." % r.get("fenetre"),
            "Les fenêtres disponibles sont : %s." % ", ".join(FENETRES))
    r["fenetre"] = str(r["fenetre"]).lower()
    r["zero_pad"] = max(1, min(64, int(_nb(r.get("zero_pad"), 1))))
    if _nb(r.get("seuil_db"), 0.0) > 0:
        raise ErreurCrosstalk(
            "Le seuil de confirmation vaut %g dB, donc un gain."
            % _nb(r.get("seuil_db")),
            "Un couplage est une atténuation : le seuil est négatif"
            " (-40 dB par défaut).")
    r["resolution_cible"] = max(0.0, _nb(r.get("resolution_cible"), 0.0))
    r["bande_auto"] = bool(r.get("bande_auto"))
    # LE RAPPORT DE DESACCORD EST UN RAPPORT D'ESPACEMENTS : sous 1, il
    # demanderait qu'un pic tombe SOUS l'espacement median pour etre juge
    # normal, c'est-a-dire qu'il en signalerait la moitie par construction.
    if _nb(r.get("desaccord"), 0.0) < 1.0:
        raise ErreurCrosstalk(
            "Le rapport de désaccord vaut %g, donc moins de 1."
            % _nb(r.get("desaccord")),
            "C'est le rapport entre l'espacement au pic et l'espacement"
            " médian du longement : au-dessous de 1, la moitié des pics"
            " serait signalée d'office (1,25 par défaut).")
    # LE SEUIL DE RISQUE EST UNE FRACTION D'UN MAXIMUM : hors de ]0 ; 1], il ne
    # decoupe rien. A zero, toute la piste serait « a risque » -- donc aucune
    # portion ne le serait, puisque tout se vaut ; a un, seul le point du
    # maximum exact, qui ne se peint pas.
    risque = _nb(r.get("risque"), 0.5)
    if not (0.0 < risque < 1.0):
        raise ErreurCrosstalk(
            "Le seuil de risque vaut %g : il doit être entre 0 et 1 (exclus)."
            % risque,
            "C'est la fraction du pire point d'une victime au-delà de laquelle"
            " la plage se peint sur le cuivre. À 0, toute la piste serait"
            " peinte — donc plus rien ne ressortirait ; à 1, rien ne le serait"
            " (0,5 par défaut, soit −6 dB sous le pire point).")
    r["risque"] = risque
    vitesses = r.get("vitesses") or {}
    r["vitesses"] = (dict((str(k), _nb(v, 0.0)) for k, v in vitesses.items()
                          if _nb(v, 0.0) > 0)
                     if isinstance(vitesses, dict) else {})
    return r


def _est_un_mapping(ports):
    """Cette liste de ports designe-t-elle les ports d'une matrice importee ?

    LA DIFFERENCE TIENT A CE QU'UNE ENTREE NOMME. Le document de simulation
    porte [{id, impedance}] : des impedances de reference, qui ne designent
    rien d'exterieur. Une table de correspondance, elle, porte un « net » ou un
    « bout » -- c'est-a-dire qu'elle PREND POSITION sur ce que le port 3 d'un
    fichier represente, et c'est cela, et cela seul, qui n'a plus lieu d'etre.
    """
    if not isinstance(ports, (list, tuple)):
        return False
    for p in ports:
        if isinstance(p, dict) and (p.get("net") or p.get("bout")):
            return True
    return False


def _doc_valide(doc):
    """Verifie le document et rend (couches, objets, analyse, agresseurs)."""
    if not isinstance(doc, dict):
        raise ErreurCrosstalk("Le document envoyé n'est pas un objet JSON.")
    if doc.get("format") != FORMAT:
        raise ErreurCrosstalk(
            "Format inattendu : « %s » au lieu de « %s »."
            % (doc.get("format") or "absent", FORMAT))
    # UN DOCUMENT QUI PORTE ENCORE UNE MATRICE EXTERIEURE EST REFUSE, ET NON
    # IGNORE. L'ignorer serait le pire des deux : la page croirait avoir fait
    # calculer son fichier, et lirait une carte obtenue sur autre chose.
    #
    # « ports » N'EN FAIT PAS PARTIE, ET C'EST TOUT LE PIEGE DE CE CONTROLE.
    # Le document de simulation partage sa base avec celui-ci et porte deja un
    # « ports » a lui -- [{id, impedance}], les impedances de reference des
    # deux bouts de la liaison. Refuser sur le seul NOM du champ refuserait
    # tout document venu de l'editeur, ce qui est exactement l'inverse du but.
    # Ce qu'on cherche est une TABLE DE CORRESPONDANCE : des entrees qui
    # NOMMENT un net ou un bout, c'est-a-dire une tentative de designer les
    # ports d'une matrice qu'on n'a pas produite.
    externes = [nom for nom in ("touchstone", "touchstone_ports",
                                "mapping_confirme") if doc.get(nom)]
    if _est_un_mapping(doc.get("ports")):
        externes.append("ports")
    if externes:
        raise ErreurCrosstalk(
            "Le document porte %s : cette analyse n'accepte plus de matrice"
            " S venue de l'extérieur."
            % ", ".join("« %s »" % n for n in externes),
            "La matrice se génère ici, à partir du design. Retirez ces"
            " champs : la page à jour ne les envoie plus, et une carte"
            " calculée sur un fichier importé ne se lirait pas comme celle"
            " que le design donne.")
    couches = (doc.get("stackup") or {}).get("layers") or []
    if not couches:
        raise ErreurCrosstalk(
            "Empilage vide.",
            "Complétez l'empilage dans la page avant de lancer le calcul.")
    objets = (doc.get("geometry") or {}).get("objects") or []
    if not objets:
        raise ErreurCrosstalk(
            "Aucun cuivre à analyser.",
            "Sélectionnez la piste AGRESSEUR sur la carte.")
    if len(objets) > se.MAX_OBJETS:
        raise ErreurCrosstalk(
            "Trop de tronçons : %d, maximum %d."
            % (len(objets), se.MAX_OBJETS), "Restreignez la sélection.")
    a = doc.get("analyse") or {}
    if not (_nb(a.get("f_fin")) > 0):
        raise ErreurCrosstalk(
            "Haut de bande absent ou nul.",
            "La résolution spatiale ne dépend que de la bande : sans elle,"
            " il n'y a pas de position à calculer.")
    agresseurs = [str(x) for x in (doc.get("agresseurs") or []) if str(x)]
    if not agresseurs:
        agresseurs = sorted(set(str(o.get("net") or "") for o in objets)
                            - set([""]))
    if not agresseurs:
        raise ErreurCrosstalk(
            "La sélection ne porte aucun net.",
            "Le crosstalk se lit d'un net vers un autre : la piste"
            " sélectionnée doit porter un nom de net.")
    if len(agresseurs) > MAX_AGRESSEURS:
        raise ErreurCrosstalk(
            "%d nets sélectionnés comme agresseurs, maximum %d."
            % (len(agresseurs), MAX_AGRESSEURS),
            "Restreignez la sélection à l'agresseur qui vous intéresse.")
    return couches, objets, a, agresseurs


def _profils(conducteurs, infos, parcours, couches, reglages, cache, notes):
    """Le profil de retard de chaque net : {net: (abscisses, retards)}.

    TROIS SOURCES, ET ELLES SE DISENT. Une vitesse SAISIE l'emporte sur tout
    -- c'est le sens d'une saisie ; a defaut, la cascade en donne un par bloc,
    et c'est le cas courant ; en dernier recours -- un conducteur que la
    cascade n'a pas vu passer --, on resout sa section pour en tirer sa
    permittivite effective.
    JAMAIS on ne suppose que la victime a la vitesse de l'agresseur : deux
    pistes de largeurs differentes sur le meme stratifie n'ont deja pas la
    meme, et c'est justement l'ecart de vitesse qui rend l'axe du FEXT
    lisible.
    """
    total = parcours[-1]["s1"] if parcours else 0.0
    profils = {}
    for g, cond in enumerate(conducteurs):
        net = cond["net"]
        saisie = _nb(reglages["vitesses"].get(net), 0.0)
        if saisie > 0:
            profils[net] = ([0.0, total], [0.0, total * 1e-3 / saisie],
                            "saisie (%.4g m/s)" % saisie)
            continue
        if infos and net in [c["net"] for c in infos["conducteurs"]]:
            i = [c["net"] for c in infos["conducteurs"]].index(net)
            profils[net] = (infos["abscisses"], infos["retards"][i],
                            "profil de la cascade")
            continue
        _c, _l, eps, raison = _ligne_seule(
            couches, cond.get("couche", parcours[0]["couche"]),
            cond.get("largeur", parcours[0]["largeur"]),
            cond.get("epaisseur", parcours[0]["epaisseur"]), cache)
        if eps > 0:
            v = C_0 / math.sqrt(eps)
            source = "section résolue (εeff %.3f)" % eps
        else:
            v = se.VITESSE_TYPIQUE
            source = "vitesse typique (%.3g m/s) : %s" % (v, raison or
                                                          "section inconnue")
            notes.append("La vitesse de « %s » n'a pu être ni saisie ni"
                         " calculée : elle est prise à la valeur typique"
                         " %.3g m/s. L'axe de position de cette piste vaut ce"
                         " que vaut cette hypothèse." % (net, v))
        profils[net] = ([0.0, total], [0.0, total * 1e-3 / v], source)
    return profils


def _vitesse(profil):
    """La vitesse moyenne d'un profil, en m/s -- ce que la fiche affiche."""
    s, t = profil[0], profil[1]
    longueur, retard = float(s[-1]) * 1e-3, float(t[-1])
    return longueur / retard if retard > 0 else 0.0


# De combien deux profils d'espacement doivent differer pour qu'on tienne
# l'ecart de couplage pour EXPLIQUE. Un quart, parce que le couplage varie
# grossierement comme l'inverse du carre de l'ecart : 25 % d'espacement en
# plus font deja quelques decibels en moins, et reprocher au dessin un ecart
# que la geometrie annonce serait la premiere facon de faire ignorer l'alerte.
ECART_ESPACEMENT = 0.25


def _asymetries(couples, seuil_db, espacements):
    """Deux victimes du meme agresseur qui ne prennent pas la meme chose.

    C'EST LE CAS QUE LA SECTION EXISTE POUR MONTRER : un agresseur au centre,
    du plan cousu autour, une victime de chaque cote. Les deux couplages sont
    calcules SEPAREMENT et jamais additionnes -- ils ne le sont pas ici non
    plus --, et ce qui se lit est leur ECART.

    MAIS UN ECART N'EST PAS UNE ANOMALIE, et c'est la correction la plus
    importante de cette fonction. Un agresseur n'est presque jamais equidistant
    de ses deux voisines a TOUT INSTANT : il suffit qu'il contourne un
    composant d'un cote pour que la victime de ce cote-la prenne moins. L'ecart
    de couplage est alors exactement ce que la geometrie annonce, et le
    signaler ferait chercher une dissymetrie de plan qui n'existe pas.

    ON COMPARE DONC L'ECART DE COUPLAGE A L'ECART D'ESPACEMENT. Quand les deux
    profils different nettement, l'ecart est dit EXPLIQUE et rendu comme un
    renseignement ; quand les deux voisines sont a espacement comparable et que
    les couplages, eux, ne le sont pas, c'est alors -- et alors seulement --
    une anomalie, et elle designe le plan de reference.
    """
    sorties = []
    par_agresseur = {}
    for c in couples:
        if not c["confirmee"] or c["paire"] or c["role"] != "victime":
            continue
        par_agresseur.setdefault(c["agresseur"], []).append(c)
    for agresseur, liste in par_agresseur.items():
        if len(liste) < 2:
            continue
        pire = max(liste, key=lambda c: c["pire_db"])
        moindre = min(liste, key=lambda c: c["pire_db"])
        ecart = pire["pire_db"] - moindre["pire_db"]
        if ecart < seuil_db:
            continue
        e_haute = (espacements.get(pire["victime"]) or {}).get("median")
        e_basse = (espacements.get(moindre["victime"]) or {}).get("median")
        if e_haute and e_basse:
            relatif = abs(e_haute - e_basse) / max(e_haute, e_basse)
            # LE SENS COMPTE AUTANT QUE L'AMPLITUDE : c'est la victime la plus
            # PROCHE qui doit prendre le plus. L'inverse -- la plus eloignee
            # qui prend davantage -- n'est jamais explique par l'espacement,
            # quel que soit l'ecart entre les deux profils.
            attendu = e_haute < e_basse
            explique = bool(attendu and relatif >= ECART_ESPACEMENT)
            geo = ("les espacements médians valent %.3f et %.3f mm, soit"
                   " %.0f %% d'écart" % (e_haute, e_basse, 100 * relatif))
        else:
            explique = False
            geo = "l'un des deux profils d'espacement manque"
        sorties.append({
            "agresseur": agresseur, "haute": pire["victime"],
            "basse": moindre["victime"], "ecart_db": round(ecart, 2),
            "explique": explique,
            "detail": "« %s » prend %.1f dB de plus que « %s » (%.1f contre"
                      " %.1f dB) ; %s — %s"
                      % (pire["victime"], ecart, moindre["victime"],
                         pire["pire_db"], moindre["pire_db"], geo,
                         "l'espacement l'explique" if explique
                         else "l'espacement ne l'explique PAS")})
    return sorties


def _fentes_sur_longement(masse, retenus):
    """Les fentes du plan de reference qui tombent SUR un longement retenu.

    UNE FENTE AILLEURS N'INVALIDE PAS LE COUPLAGE, et c'est pour cela qu'on ne
    prend pas la liste entiere : le modele quasi-TEM ne suppose un plan continu
    que la ou il resout une section, c'est-a-dire sur les intervalles ou une
    voisine longe. Une fente sur une portion ou rien ne longe est un probleme
    de retour de courant -- l'onglet Impedance et le controle de masse le
    disent deja --, pas un mensonge de la carte de couplage.
    """
    fentes = [z for z in (masse.get("zones") or ())
              if z.get("type") == "fente"]
    if not fentes:
        return []
    sorties = []
    for c in retenus:
        for it in (c.get("intervalles") or ()):
            for z in fentes:
                s0 = max(float(it["s0"]), float(z["s0"]))
                s1 = min(float(it["s1"]), float(z["s1"]))
                if s1 - s0 > TOL_BORNE:
                    sorties.append({"victime": c["net"], "s0": round(s0, 3),
                                    "s1": round(s1, 3),
                                    "longueur": round(s1 - s0, 3)})
    return sorties


def analyser(doc, journal=None):
    """Document « cao-crosstalk-1 » -> carte de couplage. Leve ErreurCrosstalk.

    LE RESULTAT PORTE TOUJOURS L'ETAPE 0a, meme quand rien n'est calcule
    ensuite : c'est elle qui dit ce qui a ete regarde, et une reponse qui ne la
    porterait pas laisserait croire qu'aucune piste ne longe alors qu'on n'a
    peut-etre rien pu simuler.
    """
    if ERREUR_SOLVEUR is not None:
        raise ErreurCrosstalk(
            "Analyse de crosstalk indisponible : %s" % ERREUR_SOLVEUR,
            "Elle a besoin de numpy : « pip install numpy ».")
    couches, objets, analyse, nets_agresseurs = _doc_valide(doc)
    reglages = _reglages(doc)
    refs = set(str(x) for x in (doc.get("reference_nets") or []) if str(x))
    paires = doc.get("paires") or []
    avert, notes, graves = [], [], []

    # L'AGRESSEUR DE REFERENCE EST CELUI QUI PORTE LE PLUS DE CUIVRE : c'est
    # son parcours qui donne l'axe de la carte, et le plus long est celui sur
    # lequel il y a le plus a lire. Les AUTRES nets selectionnes ne sont pas
    # perdus : ils rejoignent le voisinage, deviennent des conducteurs du
    # reseau avec leurs deux ports, et sont marques « agresseur » -- rien
    # n'est code en dur sur leur nombre.
    longueurs = {}
    for o in objets:
        longueurs[str(o.get("net") or "")] = longueurs.get(
            str(o.get("net") or ""), 0.0) + _nb(o.get("length"), 0.0)
    principal = max(nets_agresseurs, key=lambda n: longueurs.get(n, 0.0))
    objets_ref = [o for o in objets if str(o.get("net") or "") == principal]
    voisinage = list(doc.get("voisinage") or [])
    voisinage += [o for o in objets if str(o.get("net") or "") != principal]
    if len(voisinage) > se.MAX_VOISINAGE:
        voisinage = voisinage[:se.MAX_VOISINAGE]
        _grave(avert, graves,
               "voisinage tronqué : toutes les voisines n'ont pas été vues",
               "Voisinage tronqué à %d tronçons : la présélection n'a regardé"
               " que les plus proches." % se.MAX_VOISINAGE)

    parcours = _parcours(objets_ref)
    if not parcours:
        raise ErreurCrosstalk(
            "Le cuivre sélectionné ne porte pas de coordonnées exploitables.",
            "Chaque tronçon doit porter ses deux bouts.")
    longueur = parcours[-1]["s1"]

    # -- ETAPE 0a ----------------------------------------------------------
    candidats, seuils = candidats_geometriques(
        parcours, voisinage, couches, reglages, refs, set(nets_agresseurs),
        paires)
    # AUCUN PLAN DE REFERENCE SOUS L'AGRESSEUR : c'est un fait de l'EMPILAGE,
    # et il se dit avant tout le reste. Tout ce qui suit -- le seuil de
    # distance, la section droite, [C] et [L] -- suppose un plan sous la
    # piste ; sans lui, la deduction du seuil n'a pas de hauteur et le
    # solveur de section n'a pas de reference. Ce cas se lisait jusqu'ici
    # comme une carte ordinaire, avec un seuil trois fois plus severe que
    # nécessaire et un couplage qui ressortait au plancher.
    if not (_nb(seuils.get("hauteur"), 0.0) > 0):
        _grave(
            avert, graves,
            "aucun plan de référence sous « %s » dans l'empilage" % principal,
            "AUCUN PLAN DE RÉFÉRENCE SOUS « %s » : la couche « %s » n'a pas de"
            " plan dans l'empilage déclaré. Tout ce qui suit le suppose — le"
            " seuil de distance se déduit de la hauteur au plan, et [C] et [L]"
            " sortent d'une section droite qui n'existe pas sans référence."
            " Le seuil de présélection a donc été porté au maximum du"
            " voisinage plutôt que réduit à trois largeurs de piste, et le"
            " couplage, lui, ne pourra pas être calculé sur les blocs"
            " concernés : il ressortira au plancher, ce qui n'est PAS une"
            " mesure de découplage. Vérifiez l'empilage, ou le rôle des"
            " couches de plan."
            % (principal, se._nom_de_couche(couches, parcours[0]["couche"])
               or ("couche %d" % parcours[0]["couche"])))
    # LES GARDES ROUTEES, A COTE DES VICTIMES ET JAMAIS A LEUR PLACE. Elles ne
    # sont pas « retenues » -- elles n'ont pas de port, pas de courbe, pas de
    # ligne dans le tableau --, et elles entrent pourtant dans chaque section
    # qu'elles longent. Sans elles, une piste de masse tracee a la main entre
    # l'agresseur et sa victime ne servait a rien dans le calcul.
    gardes = [c for c in candidats if c.get("garde_active")]
    retenus = [c for c in candidats if c["retenu"]]
    if len(retenus) > MAX_VICTIMES:
        for c in retenus[MAX_VICTIMES:]:
            c["retenu"] = False
            c["raison"] = ("au-delà des %d pistes chiffrées : la présélection"
                           " garde les plus proches" % MAX_VICTIMES)
        retenus = retenus[:MAX_VICTIMES]
    # L'AXE DE LA CARTE SE POSE ICI, ET NON PLUS TROIS FONCTIONS PLUS LOIN :
    # le profil d'espacement doit etre echantillonne SUR LE MEME AXE que la
    # courbe de couplage, sans quoi les deux ne se superposeraient pas -- et
    # c'est leur superposition, pas chacune prise a part, qui apprend quelque
    # chose.
    axe = np.linspace(0.0, longueur,
                      min(COLONNES, max(8, int(longueur * 20))))
    espacements = profils_espacement(retenus, axe, notes)
    etape0 = {"candidats": candidats, "seuils": seuils,
              "retenus": [c["net"] for c in retenus],
              # POSEES, PAS RETENUES : le tableau des victimes n'en parle pas,
              # et la coupe, elle, les porte.
              "gardes": [c["net"] for c in gardes],
              "regardes": len(voisinage),
              "espacements": espacements}

    # LA BANDE SE DEDUIT ICI, ET AVANT TOUT LE RESTE : le seuil de pas de
    # couture en descend (lambda/10 dans la bande analysee), la fenetre
    # temporelle aussi, et la resolution annoncee sous la carte. La deduire
    # apres aurait laisse trois chiffres calcules sous l'ancienne bande.
    cache_bande = {}
    deduite = (bande_deduite(parcours, retenus, couches, reglages, cache_bande)
               if reglages.get("bande_auto") else None)
    if deduite:
        analyse["f_fin"] = deduite["f_max"]
        analyse["points"] = deduite["points"]
        analyse["f_debut"] = 0.0
        notes.append(deduite["detail"])

    masse = controle_masse(doc, parcours, analyse)
    base = {"format": FORMAT_RESULTAT, "carte": str(doc.get("carte") or ""),
            "bande_deduite": deduite,
            "agresseurs": nets_agresseurs, "principal": principal,
            "longueur": round(longueur, 3), "etape0": etape0, "masse": masse,
            # RIEN N'A ETE SIMULE N'EST PAS « RIEN NE COUPLE ». Sans cette
            # clef, la page rendait le meme verdict -- « AUCUN COUPLE
            # CONFIRME », avec la phrase « leurs courbes sont tracees quand
            # meme » -- pour une presélection vide et pour un calcul complet
            # dont tout tombe sous le seuil. Le premier cas est une absence de
            # mesure, le second en est une.
            "preselection_vide": not retenus,
            "reglages": dict((k, v) for k, v in reglages.items()
                             if k != "vitesses"),
            "avertissements": avert, "graves": graves}

    if not retenus:
        # LA REPONSE GARDE SA FORME MEME QUAND ELLE EST VIDE. Une clef absente
        # et une liste vide ne se lisent pas de la meme facon cote page : la
        # premiere fait chercher une version, la seconde dit « rien a
        # signaler », et c'est bien ce qu'on veut dire ici.
        base["couples"] = []
        base["victimes"] = []
        base["actions"] = []
        base["risques_refus"] = []
        base["desaccords"] = []
        base["risques"] = []
        base["asymetries"] = []
        base["carte_chaleur"] = None
        base["blindage"] = {"gardes": [], "bords_non_cousus": [],
                            "couture_max": se._couture_max(
                                _nb(analyse.get("temps_montee"), 0.0))}
        base["mapping"] = {"ports": [], "confirme": False, "source": "",
                           "message": ""}
        # LE MESSAGE NOMME L'AGRESSEUR, et c'est tout sauf un detail de
        # style : « aucune piste ne passe » se lit « tu n'as rien selectionne »
        # alors qu'il parle des VICTIMES. La selection, elle, a bien ete lue --
        # sa longueur et ses candidats sont dans la fiche.
        avert.append("« %s » a bien été analysée (%.2f mm, %d voisine(s)"
                     " regardée(s)), mais AUCUNE de ses %d candidate(s) ne"
                     " passe la présélection géométrique : il n'y a pas de"
                     " couple à simuler. Le tableau « ce qui longe » dit"
                     " pourquoi chacune a été écartée — c'est là qu'il faut"
                     " desserrer un seuil, pas dans la sélection."
                     % (principal, longueur, len(voisinage),
                        len(candidats)))
        base["hypotheses"] = _hypotheses(reglages, masse, seuils, None, {})
        _journaliser(journal, base)
        return base

    # -- LA MATRICE S, GENEREE ICI -----------------------------------------
    # IL N'Y A PLUS QU'UN CHEMIN, et c'est la raison d'etre de cette version :
    # le reseau se synthetise a partir du design, ses ports sont poses par
    # nous, et rien ne se devine entre les deux.
    cache = {}
    base["source"] = "réseau de lignes couplées synthétisé depuis le design"
    freqs, s_mat, z_ref, infos = reseau_synthetise(
        couches, parcours, retenus, refs, analyse, reglages, notes, gardes)
    base["z_reference"] = z_ref
    n = len(infos["conducteurs"])
    conducteurs = [{"net": c["net"], "proche": i, "lointain": n + i,
                    "role": c["role"]}
                   for i, c in enumerate(infos["conducteurs"])]
    base["mapping"] = {"ports": mapping_propose(infos["conducteurs"]),
                       "confirme": True,
                       "source": "connu : les ports sont posés ici, à partir"
                                 " de la géométrie",
                       "fichier_ports": 2 * n}
    # LE COUPLAGE NON CALCULE NE SE LIT PLUS COMME UN COUPLAGE NUL. C'est le
    # faux negatif le plus grave que cette section puisse produire : la section
    # droite n'est pas resoluble sur un bloc -- pas de plan de reference sous
    # la piste, solveur en echec --, [C] et [L] y restent DIAGONALES, le terme
    # croise vaut exactement zero, et la fiche annonce « aucune voisine ne
    # depasse le seuil » sur des blocs ou l'on n'a rien mesure. Le cas n'est
    # pas rare : c'est precisement celui d'un parcours qui passe au-dessus d'un
    # trou du plan, ou le couplage reel EXPLOSE faute de chemin de retour.
    muet = _nb(infos.get("longueur_non_couplee"), 0.0)
    if muet > 0:
        nets_muets = sorted(set(net for z in infos["non_couples"]
                                for net in z["nets"]))
        _grave(
            avert, graves,
            "couplage NON CALCULÉ sur %.2f mm (%.0f %% du longement) : ce"
            " n'est pas un couplage nul" % (muet, 100.0 * muet / longueur),
            "COUPLAGE NON CALCULÉ sur %.2f mm de parcours, soit %.0f %% de la"
            " liaison, pour %s. La section droite n'y est pas résoluble (%s) :"
            " chaque piste y traverse le réseau comme une ligne ISOLÉE, ses"
            " termes croisés valent exactement zéro, et ce zéro-là n'est pas"
            " une mesure — c'est une absence de mesure. Les niveaux rendus"
            " sont donc un PLANCHER, et un verdict « sous le seuil » ne vaut"
            " rien sur cette portion. La cause la plus fréquente est un plan"
            " de référence absent ou percé sous le parcours : c'est justement"
            " là que le couplage réel est le plus fort, faute de chemin de"
            " retour court. Les plages sont dans « ce qui longe » ; regardez"
            " aussi les zones de vigilance du plan de masse."
            % (muet, 100.0 * muet / longueur,
               ", ".join("« %s »" % net for net in nets_muets) or
               "les voisines de ces blocs",
               infos.get("raison_section") or "cause non rapportée"))
    # LES GARDES ROUTEES, DITES AVEC LE RESULTAT. Elles n'ont pas de courbe :
    # sans cette phrase, la chute -- ou la MONTEE -- de couplage qu'elles
    # provoquent serait un chiffre sans cause. Et le cas ou l'on rassure a tort
    # est celui d'une garde qu'on voit sur le dessin et qui n'a pas de vias.
    posees = infos.get("gardes") or []
    # CE QUE LE CUIVRE DE MASSE A FAIT, EN CLAIR ET EN CHIFFRES. La phrase qui
    # suit s'adresse a l'oeil ; cette clef-ci s'adresse a la page, qui doit
    # pouvoir dessiner la garde dans la coupe et la marquer tenue ou flottante.
    base["blindage"] = {
        "gardes": posees,
        "bords_non_cousus": infos.get("bords_non_cousus") or [],
        "couture_max": _nb(infos.get("couture_max"), 0.0)}
    if posees:
        flottantes = [g for g in posees if g["longueur_flottante"] > 0]
        avert.append(
            "%d piste(s) de garde routée(s) sont POSÉES dans les sections"
            " résolues : %s. Elles n'ont pas de port et n'apparaissent donc"
            " dans aucune courbe, mais elles prennent du champ aux deux — c'est"
            " ce qu'on leur demande. Une garde cousue est tenue à 0 V et fait"
            " tomber le NEXT comme le FEXT ; une garde dont le plus grand trou"
            " de couture dépasse %.1f mm est posée FLOTTANTE, et celle-là ne"
            " blinde pas : elle TRANSFÈRE, et le couplage peut en devenir PIRE"
            " qu'en l'absence de tout cuivre.%s"
            % (len(posees),
               ", ".join("« %s » sur %.1f mm" % (g["net"], g["longueur"])
                         for g in posees),
               _nb(infos.get("couture_max"), 0.0),
               (" ICI, %s : cousez-la, ou ne comptez pas dessus."
                % ", ".join("« %s » flotte sur %.1f mm (trou de %.1f mm)"
                            % (g["net"], g["longueur_flottante"], g["couture"])
                            for g in flottantes)) if flottantes else ""))
    # LE PLAN ARROSE QUI BORDE ET QUI NE TIENT PAS. Le solveur le posait a 0 V
    # parfait quel que soit son nombre de vias : le defaut ne sortait qu'en
    # texte, et les decibels, eux, ne bougeaient pas. Ils bougent maintenant --
    # et il faut le dire, sans quoi le chiffre monte sans cause visible.
    bords_nus = infos.get("bords_non_cousus") or []
    if bords_nus:
        avert.append(
            "PLAN ARROSÉ NON COUSU sur le bord %s du parcours : le plus grand"
            " trou entre deux vias y atteint %.1f mm, au-delà des %.1f mm que"
            " le front autorise. L'effet coplanaire de ce côté-là a donc été"
            " ANNULÉ dans les sections concernées (%s) plutôt que de faire"
            " cadeau d'une masse idéale à 0 V : le couplage rendu est celui"
            " d'un bord SANS masse à portée, et il est plus fort d'autant."
            " Cousez ce plan, ou ne comptez pas dessus."
            % (" et ".join(b0["cote"] for b0 in bords_nus),
               max(b0["couture"] for b0 in bords_nus),
               _nb(infos.get("couture_max"), 0.0),
               ", ".join("%.1f mm à %s" % (b0["longueur"], b0["cote"])
                         for b0 in bords_nus)))
    # LE PLAN QUI MANQUE SOUS LE LONGEMENT : la section droite quasi-TEM
    # SUPPOSE un plan de retour continu sous les deux pistes. Une fente
    # sondee par la page dit qu'il n'y en a pas -- le modele decrit alors une
    # carte qui n'est pas celle-la, et il la decrit toujours en mieux.
    fentes_sur = _fentes_sur_longement(masse, retenus)
    if fentes_sur:
        _grave(
            avert, graves,
            "plan de référence absent sous %.2f mm de longement : le couplage"
            " rendu est un plancher"
            % sum(f["longueur"] for f in fentes_sur),
            "PLAN DE RÉFÉRENCE ABSENT SOUS LE LONGEMENT, sur %s. La section"
            " droite mise en cascade SUPPOSE un plan de retour continu sous"
            " les deux pistes : c'est de lui que sortent [C] et [L], et sans"
            " conducteur de référence une inductance par unité de longueur"
            " n'est même pas définie. Là où le plan est percé ou absent, le"
            " courant de retour fait un détour dont l'aire de boucle"
            " n'apparaît nulle part dans la section, et les deux pistes se"
            " partagent ce retour : le couplage par IMPÉDANCE COMMUNE qui en"
            " résulte n'est pas un terme que ce modèle chiffre mal, c'est un"
            " terme qu'il ne contient PAS. L'écart n'est donc pas borné par ce"
            " calcul, et il n'est pas chiffré ici — le rapport de dix"
            " décibels souvent cité pour une traversée de fente est un ordre"
            " de grandeur du domaine, pas une mesure de cet outil. CE QUE LA"
            " CARTE REND EST UN PLANCHER SUR CES PLAGES, et « sous le seuil »"
            " n'y est pas un verdict. C'est le premier endroit à corriger : un"
            " plan continu sous un longement coûte moins qu'un écartement de"
            " pistes."
            % "; ".join("%.2f mm à partir de %.2f mm (« %s »)"
                        % (f["longueur"], f["s0"], f["victime"])
                        for f in fentes_sur))
    # CE QUE LE RESEAU SYNTHETISE NE SAIT PAS COUPLER, ET IL FAUT LE DIRE ICI.
    # Une voisine de couche adjacente n'a pas de longement dans le plan de la
    # section : le solveur de section range ses conducteurs COTE A COTE, jamais
    # EMPILES. Elle traverse donc le reseau comme une ligne isolee, et son
    # couplage ressort a moins l'infini. Sans cet avertissement, l'etape 0b
    # l'ecarterait « electriquement decouplee » -- ce qui est exactement le
    # contraire de ce qui se passe sous un empilage mince.
    empiles = [c["net"] for c in retenus if not (c.get("intervalles") or ())]
    if empiles:
        _grave(
            avert, graves,
            "couplage vertical non modélisé (%s)"
            % ", ".join("« %s »" % net for net in empiles),
            "COUPLAGE VERTICAL NON MODÉLISÉ pour %s : le solveur de section"
            " range ses conducteurs côte à côte et ne sait pas les EMPILER."
            " Ces pistes traversent le réseau comme des lignes isolées, et"
            " leur couplage ressortira au plancher — ce n'est PAS une mesure"
            " de découplage. Deux pistes superposées couplent souvent plus que"
            " les mêmes côte à côte : leur distance mesurée est au tableau de"
            " l'étape 0a, et c'est elle qu'il faut regarder."
            % ", ".join("« %s »" % net for net in empiles))
    # UNE VOISINE QUI LONGE DES DEUX FACONS -- a plat sur une portion,
    # superposee sur une autre, parce que l'AGRESSEUR change de couche en
    # cours de route. Le reseau ne couple que la portion LATERALE : c'est la
    # seule que la section droite sache resoudre. Sans cette phrase, la
    # portion superposee compterait zero EN SILENCE, et l'on aurait remplace
    # un faux negatif par un autre, plus discret.
    for c in retenus:
        if not (c.get("intervalles") or ()) or not c.get("longueur_verticale"):
            continue
        if c.get("blinde_verticalement"):
            notes.append(
                "« %s » longe « %s » de deux façons : %.2f mm À PLAT (c'est"
                " cette portion que le réseau couple) et %.2f mm SUPERPOSÉE,"
                " l'agresseur ayant changé de couche. La portion superposée"
                " est séparée par un plan de référence : n'y compter aucun"
                " couplage est juste, et c'est ce que fait le calcul."
                % (c["net"], principal, c.get("longueur_laterale", 0.0),
                   c.get("longueur_verticale", 0.0)))
        else:
            _grave(
                avert, graves,
                "« %s » longe aussi %.2f mm en superposition, non modélisée"
                % (c["net"], c.get("longueur_verticale", 0.0)),
                "« %s » longe « %s » de deux façons : %.2f mm À PLAT et"
                " %.2f mm SUPERPOSÉE sans plan entre les deux couches. Le"
                " réseau ne couple que la première — le solveur de section"
                " range ses conducteurs côte à côte et ne sait pas les"
                " EMPILER. Le niveau rendu pour cette victime est donc un"
                " PLANCHER : il manque tout ce que la superposition ajoute, et"
                " deux pistes superposées à %.3f mm couplent souvent plus que"
                " les mêmes côte à côte."
                % (c["net"], principal, c.get("longueur_laterale", 0.0),
                   c.get("longueur_verticale", 0.0),
                   c.get("distance_verticale") or 0.0))
    # LE RESEAU SORT EN TOUCHSTONE, et c'est une SORTIE : ce qui rend le
    # resultat verifiable ailleurs. Le meme fichier, ouvert dans un autre
    # outil, se compare a ce qu'un solveur pleine onde rendrait de la meme
    # geometrie. L'inverse -- faire dependre la carte d'un fichier qu'on n'a
    # pas produit -- est justement ce qui n'existe plus.
    base["touchstone"] = touchstone_np(
        freqs, s_mat, z_ref,
        ["Reseau synthetise par python/crosstalk.py",
         "Carte : %s" % (doc.get("carte") or "?"),
         "Agresseur : %s" % principal,
         "Conducteurs, dans l'ordre : "
         + ", ".join(c["net"] for c in infos["conducteurs"])])
    bande = verifier_bande(freqs)
    base["validation"] = valider_matrice(freqs, s_mat)
    base["validation"]["bande"] = bande
    _lire_couples(base, doc, freqs, s_mat, conducteurs, infos, parcours,
                  couches, reglages, cache, masse, seuils, avert, notes,
                  axe, espacements)
    _journaliser(journal, base)
    return base


def _fiche_candidat(candidats, net):
    """Ce que l'etape 0a a mesure pour ce net, ou des zeros assumes."""
    for c in candidats:
        if c["net"] == net:
            return c
    return {"distance": 0.0, "longueur": 0.0, "type": "", "cote": "",
            "paire": False, "role": "victime", "nom_couche": ""}


def _lire_couples(base, doc, freqs, s_mat, conducteurs, infos, parcours,
                  couches, reglages, cache, masse, seuils, avert, notes,
                  axe, espacements):
    """Etape 0b, la transformee et la carte : la seconde moitie d'`analyser`.

    RIEN NE S'AGREGE PAR DEFAUT, et c'est la regle du domaine : deux victimes
    d'un meme agresseur sont deux nets differents, chacun avec son budget, et
    les additionner ne decrirait aucune tension existant nulle part. La seule
    somme qui ait un sens est celle de plusieurs AGRESSEURS EN PHASE vers UNE
    victime -- un bus qui commute d'un bloc --, et elle ne se fait que sur
    demande explicite.
    """
    longueur = parcours[-1]["s1"]
    seuil_db = _nb(reglages.get("seuil_db"), -40.0)
    profils = _profils(conducteurs, infos, parcours, couches, reglages, cache,
                       notes)
    pas_f = float(base["validation"]["bande"]["pas"])
    f_max = float(base["validation"]["bande"]["f_max"])
    # LE GENOU DU FRONT ANNONCE, et seulement quand il est ANNONCE : deduit de
    # la bande, il vaudrait la bande elle-meme et ne comparerait rien.
    t_r, source_tr = se._temps_montee(doc.get("analyse") or {})
    f_genou = (0.35 / t_r) if (t_r > 0 and source_tr == "saisi") else 0.0
    base["f_genou"] = round(f_genou, 1)
    candidats = base["etape0"]["candidats"]

    agresseurs = [c for c in conducteurs if c["role"] == "agresseur"]
    autres = [c for c in conducteurs if c["role"] != "agresseur"]
    agreger = bool(reglages.get("agreger_agresseurs")) and len(agresseurs) > 1
    if agreger:
        notes.append("Les %d agresseurs sont SOMMÉS EN PHASE vers chaque"
                     " victime : c'est l'hypothèse la plus défavorable, et"
                     " elle a été demandée. Le détail par agresseur n'est"
                     " alors plus affiché." % len(agresseurs))

    couples, lignes = [], []
    for v in autres:
        fiche = _fiche_candidat(candidats, v["net"])
        lots = ([("somme de %d agresseurs" % len(agresseurs), agresseurs)]
                if agreger else [(a["net"], [a]) for a in agresseurs])
        for nom_a, groupe in lots:
            spec = {}
            for sens, bout in (("next", "proche"), ("fext", "lointain")):
                spec[sens] = sum(s_mat[:, v[bout], a["proche"]]
                                 for a in groupe)
            next_db = max(_db(x) for x in spec["next"])
            fext_db = max(_db(x) for x in spec["fext"])
            pire = max(next_db, fext_db)
            couple = {
                "agresseur": nom_a, "victime": v["net"],
                "role": v["role"], "paire": bool(fiche.get("paire")),
                "distance": fiche["distance"], "longement": fiche["longueur"],
                "type": fiche["type"], "cote": fiche["cote"],
                "nom_couche": fiche.get("nom_couche", ""),
                "next_db": round(next_db, 2), "fext_db": round(fext_db, 2),
                "pire_db": round(pire, 2),
                "confirmee": bool(pire >= seuil_db),
                "raison": "" if pire >= seuil_db else
                          "couplage à %.1f dB, sous le seuil de %.1f dB"
                          % (pire, seuil_db)}
            # LE PIRE POINT EST-IL DANS LE SIGNAL ? Ces decibels sont le
            # maximum sur TOUTE la bande analysee, et la bande analysee est un
            # reglage : on la monte pour affiner la carte, parce que la
            # resolution spatiale ne depend que d'elle. Rien ne dit qu'un front
            # de 9 ns porte quoi que ce soit a 100 GHz -- et un couplage
            # annonce a -13 dB qui n'existe qu'a une frequence que le signal
            # n'atteint jamais est le genre de chiffre juste et trompeur qu'on
            # ne veut pas rendre sans le dire.
            couple["f_pire"] = _f_du_pire(freqs, spec["next"], spec["fext"])
            au_genou = _db_sous(freqs, spec, f_genou)
            if au_genou is not None:
                couple["pire_db_genou"] = round(au_genou, 2)
            # LA VITESSE DE CHACUNE, ET L'ECART ENTRE LES DEUX. C'est lui qui
            # decide si l'axe du FEXT veut dire quelque chose -- et depuis
            # cette version c'est MESURE sur la loi d'arrivee, pas devine sur
            # un seuil de pourcentage.
            #
            # L'AGRESSEUR DE L'AXE EST LE PRINCIPAL, y compris en mode agrege :
            # `groupe[0]` est `conducteurs[0]`, c'est-a-dire le net qui porte
            # l'abscisse curviligne. Ce n'est pas un choix arbitraire dans une
            # liste -- c'est le seul parcours dont la carte ait un axe.
            p_a = profils.get(groupe[0]["net"])
            p_v = profils.get(v["net"])
            commun = profil_commun(p_a, p_v) if (p_a and p_v) else None
            if p_a and p_v:
                va, vv = _vitesse(p_a), _vitesse(p_v)
                moyenne = 0.5 * (va + vv)
                ecart = abs(va - vv) / moyenne if moyenne > 0 else 0.0
                couple["vitesse_agresseur"] = round(va, 1)
                couple["vitesse_victime"] = round(vv, 1)
                couple["ecart_vitesse"] = round(ecart, 4)
                couple["source_vitesse"] = "%s / %s" % (p_a[2], p_v[2])
                # LA FENETRE TEMPORELLE CONTIENT-ELLE L'ALLER-RETOUR ? T = 1/df,
                # et le NEXT du bout lointain arrive a tau_a(L) + tau_v(L). Si
                # la fenetre est plus courte, ce qui deborde ne disparait pas :
                # il REVIENT SE POSER au debut de la carte par repliement, et un
                # artefact de repliement ne se distingue pas d'un vrai pic.
                couple["fenetre_s"] = 1.0 / pas_f if pas_f > 0 else 0.0
                if commun is not None:
                    couple["aller_retour_s"] = float(commun[1][-1]
                                                     + commun[2][-1])
            # LA CARTE SE CALCULE POUR TOUTE CANDIDATE QUI A UNE GEOMETRIE,
            # confirmee ou non. Un ecran qui ne montre RIEN parce que tout est
            # sous le seuil ne dit pas pourquoi il est vide : il se lit comme
            # « aucun couplage », alors que le fait est « du couplage, mais
            # moins que ce que vous avez demande de signaler ». Les courbes
            # sont la, la confirmation les etiquette -- elle ne les efface
            # plus. Ce qui reste reserve aux confirmees est ce qui PORTE UN
            # VERDICT : le recoupement, les plages peintes sur le cuivre, la
            # liste des victimes.
            #
            # UN SENS SANS AXE NE DONNE PAS DE LIGNE, et c'est le point de
            # cette version. Le NEXT en a toujours un : la somme de deux
            # retards croissants croit, sa pente ne s'annule jamais. Le FEXT,
            # lui, n'en a que si les deux vitesses diffèrent assez pour que
            # l'ecart de retard de bout en bout depasse la largeur temporelle
            # de la fenetre -- sinon la loi est plate, l'inversion singuliere,
            # et la « courbe » qu'on tracerait serait faite d'un ou deux
            # echantillons etales sur tout le parcours. Son NIVEAU, lui, reste
            # rendu : `fext_db` ne depend d'aucun axe.
            dt_fen = (_largeur_fenetre(reglages["fenetre"],
                                       _nb(reglages.get("kaiser_beta"), 8.6))
                      / (2.0 * f_max)) if f_max > 0 else 0.0
            for sens in ("next", "fext"):
                prof = (profil_du_sens(commun, sens)
                        if commun is not None else None)
                # L'ETALEMENT DES ARRIVEES, mesure sur les retards de bout en
                # bout et non sur le profil inverse -- il vaut donc quelque
                # chose meme quand la loi n'est PAS inversible, qui est
                # justement le cas a expliquer.
                if commun is None:
                    etalement = 0.0
                else:
                    d_a = float(commun[1][-1]) - float(commun[1][0])
                    d_v = float(commun[2][-1]) - float(commun[2][0])
                    etalement = (d_a + d_v) if sens == "next" else abs(d_a
                                                                      - d_v)
                if prof is None or (sens == "fext" and etalement <= dt_fen):
                    couple[sens + "_localise"] = False
                    if commun is None:
                        couple[sens + "_raison"] = (
                            "aucun profil de retard commun : l'axe de"
                            " position ne peut pas être posé")
                    elif sens == "fext":
                        couple["fext_raison"] = (
                            "les deux vitesses sont trop proches (%.3g et"
                            " %.3g m/s, %.2f %% d'écart) : le bruit avant"
                            " co-propage avec l'agresseur, tout ce qui se"
                            " couple arrive au bout lointain dans le même"
                            " intervalle que la fenêtre ne sépare pas (%.3g ns"
                            " d'étalement pour %.3g ns de résolution). Le"
                            " NIVEAU du FEXT est mesuré ; sa POSITION n'existe"
                            " pas, et aucune courbe n'est tracée plutôt qu'une"
                            " courbe qui désignerait un millimètre au hasard."
                            % (couple.get("vitesse_agresseur", 0.0),
                               couple.get("vitesse_victime", 0.0),
                               100 * _nb(couple.get("ecart_vitesse"), 0.0),
                               1e9 * etalement, 1e9 * dt_fen))
                    continue
                s_p, t_p = prof
                couple[sens + "_localise"] = True
                valeurs, x_brut, h_brut, brut = carte_du_couple(
                    spec[sens], pas_f, s_p, t_p, axe, reglages)
                res = resolution(f_max, s_p, t_p, reglages["fenetre"],
                                 _nb(reglages.get("kaiser_beta"), 8.6))
                lignes.append({
                    "agresseur": nom_a, "victime": v["net"], "sens": sens,
                    "confirmee": couple["confirmee"],
                    "valeurs": [round(float(x), 6) for x in valeurs],
                    "max": round(float(valeurs.max()) if valeurs.size
                                 else 0.0, 6),
                    "max_db": round(_db(valeurs.max() if valeurs.size
                                        else 0.0), 2),
                    # LE PIRE DE LA REPONSE ENTIERE, avant tout tri par
                    # abscisse : quand l'axe n'a pu placer qu'une partie des
                    # echantillons, `max` le dit et celui-ci dit combien il en
                    # manque. Deux chiffres egaux veulent dire « tout est sur
                    # la carte », et c'est le cas courant.
                    "max_brut": round(brut, 6),
                    "echantillons": int(x_brut.size),
                    "resolution": round(res, 4)})
                couple["resolution_" + sens] = lignes[-1]["resolution"]
            couples.append(couple)

    # LE RECOUPEMENT SE FAIT ICI, une fois les lignes construites : c'est la
    # seule etape qui ait besoin des deux courbes a la fois. IL NE LIT QUE LES
    # CONFIRMEES, comme les plages a risque : un pic « non justifie » sur une
    # voisine a -70 dB serait un verdict rendu sur du bruit, et il se peindrait
    # sur le cuivre a cote des vrais.
    lignes_conf = [l for l in lignes if l["confirmee"]]
    base["desaccords"] = desaccords(lignes_conf, espacements, axe,
                                    masse.get("zones") or [],
                                    _nb(reglages.get("desaccord"), 1.25),
                                    bool(masse.get("vain")))
    # LES PLAGES A PEINDRE SUR LE CUIVRE, une fois le recoupement fait : c'est
    # lui qui dit lesquelles le dessin des pistes explique.
    refus_risques = []
    base["risques"] = zones_risque(lignes_conf, axe, base["desaccords"],
                                   masse.get("zones") or [],
                                   _nb(reglages.get("risque"), 0.5),
                                   refus_risques)
    base["risques_refus"] = refus_risques
    # LES GESTES, TIRES DE CE QUI PRECEDE ET DE RIEN D'AUTRE. Ils vivent ici et
    # non dans la page : le .txt exporte et la fiche doivent dire la MEME chose,
    # et deux listes ecrites a deux endroits auraient fini par diverger.
    base["actions"] = actions(base["risques"], masse, base["desaccords"],
                              couples, _nb(reglages.get("risque"), 0.5))
    _avertir(base, couples, lignes, reglages, masse, avert, notes,
             base.setdefault("graves", []), espacements)
    # L'ECHELLE DE COULEUR COUVRE CE QUI EST DESSINE, confirmee ou non :
    # « rouge = le maximum de la carte » cesserait d'etre vrai si une courbe
    # affichee depassait le maximum annonce.
    pire_global = max([l["max"] for l in lignes] or [0.0])
    base["couples"] = couples
    base["victimes"] = [c["victime"] for c in couples if c["confirmee"]]
    # CE QUE LA CARTE PORTE DANS CHAQUE SENS, ET POURQUOI ELLE NE PORTE RIEN
    # DANS L'AUTRE. Sans cette clef, la page ecrivait « Rien dans ce sens-là »
    # sur une figure vide -- ce qui se lit comme un defaut de l'outil, alors
    # que c'est un refus motive.
    base["axes"] = dict(
        (sens, {"lignes": sum(1 for l in lignes if l["sens"] == sens),
                "raison": next((c.get(sens + "_raison", "") for c in couples
                                if c.get(sens + "_localise") is False
                                and c.get(sens + "_raison")), "")})
        for sens in ("next", "fext"))
    # LA CARTE PORTE LES DEUX COURBES, sur le MEME axe. Le profil d'espacement
    # n'est pas un ornement a cote du couplage : c'est le seul temoin
    # independant que la page ait pour verifier qu'un pic est a sa place.
    base["carte_chaleur"] = (
        {"axe": [round(float(x), 4) for x in axe], "lignes": lignes,
         "max": round(pire_global, 6), "zones": masse["zones"],
         "espacements": dict((net, espacements[net])
                             for net in set(l["victime"] for l in lignes)
                             if net in espacements)} if lignes else None)
    base["avertissements"] = avert + notes
    base["hypotheses"] = _hypotheses(reglages, masse, seuils, base, profils)
    return base


def _freq(f):
    """Une frequence dans son ordre de grandeur. « 0.01 GHz » est exact et
    illisible ; c'est le genre de detail qui fait relire une fiche de
    travers."""
    if f >= 1e9:
        return "%.4g GHz" % (f / 1e9)
    if f >= 1e6:
        return "%.4g MHz" % (f / 1e6)
    return "%.4g kHz" % (f / 1e3)


def _duree(t):
    """Un temps dans son ordre de grandeur -- meme raison que `_freq`."""
    if t >= 1e-9:
        return "%.4g ns" % (t * 1e9)
    if t >= 1e-12:
        return "%.4g ps" % (t * 1e12)
    return "%.4g fs" % (t * 1e15)


def _avertir(base, couples, lignes, reglages, masse, avert, notes, graves,
             espacements):
    """Tout ce qui doit se lire A COTE du resultat, et jamais apres.

    L'ORDRE EST CELUI DE LA GRAVITE, et il n'est pas decoratif : une matrice
    non passive rend tout ce qui suit faux, un ecart de vitesse ne rend faux
    que l'axe du FEXT, et un trou de couture n'invalide rien -- il explique.
    Les melanger ferait lire le troisieme avec l'attention du premier, ou
    l'inverse.
    """
    validation = base.get("validation") or {}
    passif = validation.get("passivite") or {}
    if passif and not passif.get("ok", True):
        _grave(avert, graves,
               "matrice NON PASSIVE : la carte peut être fausse",
               "MATRICE NON PASSIVE : la plus grande valeur singulière"
                     " vaut %.6f à %.4g GHz, donc le réseau rendrait plus de"
                     " puissance qu'il n'en reçoit. Aucun cuivre ne fait cela."
                     " La réponse temporelle qui en sort DIVERGE, et la carte"
                     " reste pourtant lisse. La matrice étant générée ici, le"
                     " défaut est dans le calcul et non dans une source"
                     " extérieure : ne lisez pas la carte, signalez-le."
                     % (passif.get("sigma_max", 0.0),
                        passif.get("f", 0.0) / 1e9))
    recip = validation.get("reciprocite") or {}
    if recip and not recip.get("ok", True):
        _grave(avert, graves,
               "matrice NON RÉCIPROQUE : le calcul est suspect",
               "MATRICE NON RÉCIPROQUE : S et sa transposée diffèrent de"
                     " %.3g (relatif) à %.4g GHz. Un PCB passif est"
                     " réciproque ; un écart de cette taille signale que la"
                     " mise en cascade n'a pas vu les mêmes conducteurs à"
                     " l'aller et au retour."
                     % (recip.get("ecart", 0.0), recip.get("f", 0.0) / 1e9))

    # L'ECART DE VITESSE N'EST PLUS UNE RESERVE SUR L'AXE DU FEXT -- il en est
    # la CONDITION, et l'axe est desormais ecrit avec les deux retards separes
    # plutot qu'avec leur moyenne. Ce qu'il reste a dire est autre chose : deux
    # pistes de vitesses franchement differentes ne longent plus la meme
    # portion de front d'un bout a l'autre, et la section droite quasi-TEM,
    # elle, les traite bloc par bloc comme si elles etaient synchrones.
    seuil = _nb(reglages.get("ecart_vitesse_max"), 0.05)
    for c in couples:
        if not c.get("confirmee"):
            continue
        ecart = _nb(c.get("ecart_vitesse"), 0.0)
        if ecart > seuil:
            avert.append("« %s » : les vitesses de l'agresseur et de la"
                         " victime diffèrent de %.1f %% (%.3g et %.3g m/s),"
                         " au-delà du seuil de %.1f %%. C'est cet écart qui"
                         " donne à l'axe du FEXT sa pente — il localise%s —,"
                         " et c'est lui aussi qui fait que les deux pistes ne"
                         " voient pas le même instant du front : la section"
                         " droite les met en cascade bloc par bloc, ce qui"
                         " suppose leurs fronts alignés."
                         % (c["victime"], 100 * ecart,
                            c.get("vitesse_agresseur", 0.0),
                            c.get("vitesse_victime", 0.0), 100 * seuil,
                            (" à %.2f mm près"
                             % _nb(c.get("resolution_fext"), 0.0))
                            if c.get("fext_localise") else " donc"))

    for c in couples:
        if not c.get("confirmee"):
            continue
        fen = _nb(c.get("fenetre_s"), 0.0)
        aller = _nb(c.get("aller_retour_s"), 0.0)
        if fen > 0 and aller > fen:
            _grave(avert, graves,
                   "fenêtre trop courte pour « %s » : la carte replie sur"
                   " elle-même" % c["victime"],
                   "FENÊTRE TEMPORELLE TROP COURTE pour « %s » : elle"
                         " couvre %.3g ns et l'aller-retour en demande %.3g."
                         " Ce qui se couple au-delà de %.1f mm ne disparaît"
                         " pas — il REVIENT SE POSER au début de la carte par"
                         " repliement, et un artefact de repliement ne se"
                         " distingue pas d'un vrai pic. Augmentez le nombre de"
                         " points, ou laissez la bande se déduire."
                         % (c["victime"], fen * 1e9, aller * 1e9,
                            _nb(base.get("longueur"), 0.0) * fen / aller))

    # LA BANDE ANALYSEE ET LE SIGNAL ENVOYE SONT DEUX CHOSES. On monte la
    # premiere pour affiner la carte ; le second n'y monte pas pour autant, et
    # tout ce que la fiche annonce -- les decibels de l'etape 0b, le seuil de
    # couture, les pics -- se lit alors d'une bande ou il n'y a rien.
    f_genou = _nb(base.get("f_genou"), 0.0)
    f_max = _nb((validation.get("bande") or {}).get("f_max"), 0.0)
    if f_genou > 0:
        haut = [c for c in couples
                if c.get("confirmee") and _nb(c.get("f_pire")) > 1.5 * f_genou]
        for c in haut:
            au_genou = c.get("pire_db_genou")
            _grave(
                avert, graves,
                "« %s » : ses décibels se lisent hors de la bande du signal"
                % c["victime"],
                "« %s » : son pire couplage (%.1f dB) est à %.4g GHz, soit"
                " bien au-delà du genou du front annoncé (%.4g GHz pour %.3g"
                " ns). %s La bande analysée se règle pour la RÉSOLUTION"
                " SPATIALE — c'est légitime —, mais les décibels, eux, se"
                " lisent alors d'une bande où votre signal ne porte rien."
                % (c["victime"], c["pire_db"], c["f_pire"] / 1e9,
                   f_genou / 1e9, 1e9 * 0.35 / f_genou,
                   ("Sous le genou, il vaut %.1f dB." % au_genou)
                   if au_genou is not None else
                   "Aucun point de la grille n'est sous le genou : la fiche ne"
                   " peut même pas dire ce qu'il vaut là où le signal est."))

    # ET L'INVERSE, QUI EST LE PLUS TROMPEUR DES DEUX. Une bande qui s'ARRETE
    # BIEN AVANT le genou du front ne rend pas des decibels « prudents » : elle
    # en rend de FAUX, et faux dans le sens rassurant. Le couplage d'une paire
    # de lignes croit avec la frequence tant que la liaison est courte devant
    # la longueur d'onde -- a 100 MHz, 18 mm de piste font six millielemes de
    # longueur d'onde, et le maximum sur une telle bande vaut des dizaines de
    # dB sous ce que la MEME geometrie donne au genou d'un front de 25 ps. Le
    # verdict devient alors « aucun couple confirme » par construction, sans
    # qu'aucune ligne de la fiche ne dise que c'est le REGLAGE qui l'a rendu.
    # C'est exactement ce qu'on refuse ailleurs dans ce fichier : un chiffre
    # juste, propre, et qui ne parle pas de la carte qu'on regarde.
    if f_genou > 0 and f_max > 0 and f_max < f_genou / 2.0:
        confirmees = [c for c in couples if c.get("confirmee")]
        octaves = math.log(f_genou / f_max, 2.0)
        _grave(
            avert, graves,
            "bande analysée (%s) très en dessous du front annoncé (%s)"
            % (_freq(f_max), _freq(f_genou)),
            "LA BANDE ANALYSÉE S'ARRÊTE BIEN AVANT VOTRE SIGNAL : %s, pour un"
            " front de %.3g ns dont le genou est à %s — %.0f octaves plus"
            " haut. Le couplage CROÎT avec la fréquence tant que la liaison"
            " est courte devant la longueur d'onde, à raison d'environ 6 dB"
            " par octave : les décibels lus ici sont ceux d'un signal qui ne"
            " monterait pas plus haut que %s, et ils sont donc très inférieurs"
            " à ce que ce front-là fabriquera. %s Cochez « déduite de la"
            " carte », ou montez la bande à la main : c'est elle, et elle"
            " seule, qui fixe aussi la résolution spatiale."
            % (_freq(f_max), 1e9 * 0.35 / f_genou, _freq(f_genou), octaves,
               _freq(f_max),
               ("Aucune voisine n'est confirmée, et ce silence-là est un"
                " effet du réglage avant d'être un fait du dessin.")
               if not confirmees else
               "Les niveaux confirmés sont donc un PLANCHER, pas une mesure."))

    # LA MISE EN GARDE DU FEXT SE DIT A CHAQUE FOIS, et non seulement quand un
    # seuil est franchi : elle ne porte pas sur une valeur mais sur ce que
    # l'axe PEUT dire. Elle se lit maintenant sur ce qui a ete MESURE --
    # `fext_localise`, pose par la loi d'arrivee elle-meme -- et non sur un
    # ecart de vitesse compare a 1 %, qui etait une devinette sur le resultat
    # d'un calcul qu'on venait de faire.
    plats = [c["victime"] for c in couples if c.get("fext_localise") is False]
    if plats:
        avert.append("PAS DE LIGNE FEXT sur la carte pour %s, et c'est un"
                     " refus, pas un oubli : le bruit avant co-propage avec"
                     " l'agresseur, et à vitesses égales tout ce qui se couple"
                     " arrive au bout lointain au MÊME instant. Il n'existe"
                     " alors aucune abscisse à rendre, et une courbe tracée"
                     " quand même aurait désigné un millimètre sans rien"
                     " mesurer. Le NIVEAU du FEXT, lui, est au tableau des"
                     " couples — c'est le chiffre qui compte pour un budget de"
                     " bruit. Seule la ligne NEXT localise en milieu"
                     " homogène. %s"
                     % (("« %s »" % plats[0]) if len(plats) == 1
                        else "%d victimes" % len(plats),
                        next((c.get("fext_raison", "") for c in couples
                              if c.get("fext_localise") is False
                              and c.get("fext_raison")), "")))

    zones = masse.get("zones") or []
    couture = [z for z in zones if z["type"] == "couture"]
    fentes = [z for z in zones if z["type"] == "fente"]
    transitions = [z for z in zones if z["type"] == "transition"]
    if couture:
        avert.append("PAS DE COUTURE INSUFFISANT sur %d zone(s) : le plus"
                     " grand trou vaut %.2f mm pour un seuil de %.2f mm (%s)."
                     " Le cuivre de masse y flotte à la fréquence analysée : il"
                     " ne blinde plus, il TRANSFÈRE. À lire AVANT la carte —"
                     " c'est une cause possible des pics qu'elle montre.%s"
                     % (len(couture), max(z["pas"] for z in couture),
                        masse["seuil"], masse["source"],
                        (" D'OÙ VIENT CE SEUIL : %s — si l'écart entre les deux"
                         " règles vous surprend, c'est le haut de bande qui le"
                         " fixe, et le haut de bande est un réglage."
                         % masse["ecarte"]) if masse.get("ecarte") else ""))
    # LES ZONES PARTOUT : le dire AVANT que la fiche ne rende des verdicts qui
    # s'appuient dessus. Une coincidence certaine d'avance n'est pas une
    # explication, et c'est la carte entiere qui devient illisible avec elle.
    if masse.get("vain"):
        _grave(avert, graves,
               "zones de vigilance sur %.0f %% du parcours : y tomber"
               " n'explique rien" % (100 * _nb(masse.get("couvert"), 0.0)),
               "LES ZONES DE VIGILANCE COUVRENT %.0f %% DU PARCOURS :"
                     " « une zone tombe au même endroit que ce pic » n'apprend"
                     " donc plus rien — une abscisse tirée au hasard en"
                     " rencontrerait une aussi souvent. Les pics concernés sont"
                     " marqués INDÉCIDABLES et non « expliqués par le plan » :"
                     " la question reste ouverte. Pour la rouvrir vraiment,"
                     " resserrez la bande analysée (c'est elle qui durcit le"
                     " seuil de couture) ou cousez le plan."
                     % (100 * _nb(masse.get("couvert"), 0.0)))
    if fentes:
        avert.append("%d discontinuité(s) du plan de référence sous le"
                     " parcours. Une fente force le retour à faire le tour, et"
                     " la boucle qu'il décrit produit un pic de couplage"
                     " LOCALISÉ même là où le plan paraît continu ailleurs."
                     % len(fentes))
    if transitions:
        avert.append("%d changement(s) de couche sans via de masse à moins de"
                     " %.1f mm : le courant de retour n'y a pas de chemin"
                     " court." % (len(transitions), RAYON_MASSE))
    if not masse.get("mesure"):
        _grave(avert, graves,
               "plan de référence NON examiné : l'absence de zone ne dit rien",
               "Le plan de référence n'a PAS été examiné : la page"
                     " n'envoie ni positions de couture, ni discontinuités, ni"
                     " vias de masse. L'absence de zone de vigilance sur la"
                     " carte ne veut donc pas dire qu'il n'y en a pas.")

    # LE DESACCORD PASSE AVANT L'ASYMETRIE, et l'ordre dit lequel des deux est
    # un signal. Un pic que l'espacement n'explique pas designe un endroit du
    # dessin ; un ecart entre deux victimes ne designe rien tant qu'on n'a pas
    # regarde si la geometrie l'annoncait.
    tous = base.get("desaccords") or []
    inexpliques = [d for d in tous if d["verdict"] == "inexplique"]
    par_plan = [d for d in tous if d["verdict"] == "plan"]
    for d in inexpliques:
        avert.append("PIC NON JUSTIFIÉ à %.2f mm sur « %s » : %s. Le couplage"
                     " y monte sans que les deux pistes s'y rapprochent — et"
                     " aucune zone de vigilance du plan de référence n'y tombe"
                     " non plus. À vérifier sur le dessin avant de conclure :"
                     " c'est, dans l'ordre, un retour de courant qui fait le"
                     " tour, une résonance de cuivre mal cousu, ou un artefact"
                     " de la transformée (repliement, lobe de fenêtre)."
                     % (d["s"], d["victime"], d["detail"]))
    for d in par_plan:
        avert.append("Pic à %.2f mm sur « %s » EXPLIQUÉ PAR LE PLAN : %s, mais"
                     " une zone de vigilance « %s » tombe à la même abscisse."
                     " Le couplage ne vient donc pas du dessin des pistes —"
                     " c'est le blindage qu'il faut reprendre, pas l'écart."
                     % (d["s"], d["victime"], d["detail"], d["zone"]))
    for d in [x for x in tous if x["verdict"] == "indecidable"]:
        avert.append("Pic à %.2f mm sur « %s » INDÉCIDABLE : %s, et une zone"
                     " « %s » tombe bien à la même abscisse — mais les zones"
                     " couvrent %.0f %% du parcours, donc cette coïncidence"
                     " était acquise. Ce qui reste vrai : le dessin des pistes"
                     " n'explique pas ce pic. Ce qui n'est PAS établi : que le"
                     " plan l'explique."
                     % (d["s"], d["victime"], d["detail"], d["zone"],
                        100 * _nb(masse.get("couvert"), 0.0)))

    asym = _asymetries(couples, _nb(reglages.get("asymetrie_db"), 6.0),
                       espacements)
    base["asymetries"] = asym
    for a in asym:
        if a["explique"]:
            notes.append("Écart entre deux victimes, ANNONCÉ PAR LA"
                         " GÉOMÉTRIE : %s. Ce n'est pas une anomalie — un"
                         " agresseur équidistant de ses deux voisines à tout"
                         " instant est l'exception, pas la règle."
                         % a["detail"])
        else:
            avert.append("ASYMÉTRIE NON EXPLIQUÉE : %s. Deux voisines à"
                         " espacement comparable qui ne prennent pas la même"
                         " chose désignent une dissymétrie du PLAN — couture,"
                         " fente, retour — et non du dessin des pistes."
                         % a["detail"])

    confirmees = [c for c in couples if c["confirmee"]]
    if couples and not confirmees:
        avert.append("Aucun candidat ne dépasse le seuil de %.1f dB : les %d"
                     " piste(s) présélectionnées sont géométriquement proches"
                     " mais électriquement découplées. Le tableau donne leur"
                     " niveau — c'est une réponse, pas un silence."
                     % (_nb(reglages.get("seuil_db"), -40.0), len(couples)))
    longueur = base.get("longueur", 0.0)
    pires = [l["resolution"] for l in lignes if l.get("resolution")]
    if pires and longueur > 0 and max(pires) > longueur / 4.0:
        _grave(avert, graves,
               "la carte ne localise rien : %.2f mm de résolution pour %.2f mm"
               " de liaison" % (max(pires), longueur),
               "RÉSOLUTION SPATIALE de %.2f mm pour une liaison de"
                     " %.2f mm : la carte ne distingue que %d zone(s). La"
                     " bande analysée est trop étroite pour localiser quoi que"
                     " ce soit de fin ; élargissez-la avant de conclure."
                     % (max(pires), longueur,
                        max(1, int(longueur / max(pires)))))
    # LA RESOLUTION VOULUE, QUAND ELLE EST SAISIE. Elle transforme « la carte
    # est floue » en « il faut monter jusqu'à tant de gigahertz », qui est la
    # seule forme sur laquelle on puisse agir.
    cible = _nb(reglages.get("resolution_cible"), 0.0)
    if cible > 0 and pires and max(pires) > cible:
        requis = bande_pour_resolution(f_max, max(pires), cible)
        _grave(avert, graves,
               "résolution visée non atteinte (%.2f mm demandés)" % cible,
               "RÉSOLUTION VISÉE NON ATTEINTE : vous demandez %.2f mm,"
                     " la bande en permet %.2f mm. Il faudrait monter jusqu'à"
                     " %.4g GHz au lieu de %.4g — la résolution est"
                     " inversement proportionnelle au haut de bande, et le"
                     " zero-padding n'y change rien."
                     % (cible, max(pires), requis / 1e9, f_max / 1e9))
    elif cible > 0 and pires:
        notes.append("Résolution visée %.2f mm : atteinte (%.2f mm au pire)."
                     % (cible, max(pires)))


def _hypotheses(reglages, masse, seuils, base, profils):
    """Sous quelles hypotheses le chiffre a ete obtenu. Toujours rendues.

    LE BLOC DE CLOTURE FERME LA LISTE, comme dans `simulation_em` : les
    manques sont dits chacun a l'endroit ou il se produit, et personne ne les
    lit tous. Le dernier les RASSEMBLE et donne leur SENS -- de quel cote
    penche ce qui reste dehors --, ce qui ne se deduit d'aucun pris isolement.
    """
    source = (base or {}).get("source", "")
    h = [
        "LA PRÉSÉLECTION GÉOMÉTRIQUE (étape 0a) et la CONFIRMATION PAR"
        " SIMULATION (étape 0b) sont deux étapes distinctes, et le tableau les"
        " montre toutes les deux. Une piste absente du résultat est soit"
        " LOIN (écartée en 0a, avec sa distance), soit PROCHE ET DÉCOUPLÉE"
        " (écartée en 0b, avec son niveau) : ce sont deux situations de dessin"
        " opposées, et les fondre en une seule décision les rendrait"
        " indiscernables.",
        "Le seuil de distance de l'étape 0a vaut %.3f mm, %s ; la longueur de"
        " parallélisme minimale est %s. Les deux MAJORENT volontairement :"
        " mieux vaut simuler une piste de trop et la voir écartée à l'étape 0b"
        " avec son niveau, que de ne jamais la regarder."
        % (seuils.get("distance_max", 0.0), seuils.get("source", ""),
           seuils.get("longueur_min_source", "")),
        "Le seuil de confirmation est de %.1f dB. Une piste sous ce niveau"
        " reste au tableau, avec son couplage mesuré : elle est écartée du"
        " verdict et de la carte, pas du résultat."
        % _nb(reglages.get("seuil_db"), -40.0),
        "Les couches ADJACENTES %s dans la présélection. Deux pistes"
        " superposées couplent souvent PLUS que les mêmes côte à côte ; celles"
        " qu'un plan de référence sépare sont comptées et écartées, parce que"
        " le plan est un écran et que c'est la raison d'être de l'empilage."
        " UNE VOISINE QUI LONGE DES DEUX FAÇONS — l'agresseur change de couche"
        " en cours de route — est traitée comme LATÉRALE : deux pistes de la"
        " même couche ne peuvent pas être séparées par un plan, et c'est la"
        " seule rencontre que la section droite sache résoudre. La portion"
        " superposée est mesurée à côté, jamais fondue dans la première."
        % ("entrent" if seuils.get("couches_adjacentes") else "N'ENTRENT PAS"),
        "LE MODÈLE SUPPOSE UN PLAN DE RETOUR CONTINU sous les deux pistes, et"
        " c'est son hypothèse la plus lourde : [C] et [L] sortent d'une section"
        " droite quasi-TEM, qui n'existe que si le courant de retour a un"
        " chemin juste en dessous. Là où le plan est percé, fendu ou absent, ce"
        " calcul rend TROP PEU — le retour fait un détour, l'inductance"
        " mutuelle monte —, et le chiffre est alors un PLANCHER, jamais une"
        " mesure. Les fentes sondées sous le parcours sont dans le contrôle du"
        " plan de masse, et une fente qui tombe sur un longement lève une"
        " réserve à part.",
        "La fenêtre appliquée au spectre est « %s »%s. Elle écrase le ringing"
        " de Gibbs — des lobes de part et d'autre de chaque pic, qui se lisent"
        " comme des zones de couplage inexistantes — au prix d'un pic environ"
        " %.1f fois plus large. La résolution annoncée tient compte de cet"
        " élargissement ; le zero-padding (×%d), lui, n'ajoute AUCUNE"
        " résolution : il interpole entre des points que la bande a déjà"
        " fixés."
        % (reglages.get("fenetre"),
           (" (β = %g)" % _nb(reglages.get("kaiser_beta"), 8.6))
           if reglages.get("fenetre") == "kaiser" else "",
           _largeur_fenetre(reglages.get("fenetre"),
                            _nb(reglages.get("kaiser_beta"), 8.6)),
           int(_nb(reglages.get("zero_pad"), 1))),
        "L'axe de position vient d'un PROFIL DE RETARD et non d'une vitesse"
        " unique : le retard cumulé est repris bloc par bloc, si bien qu'un"
        " changement de largeur, d'écart ou de couche ne décale pas tout ce"
        " qui le suit. NEXT : t = τ_agresseur(x) + τ_victime(x), soit x = v·t/2"
        " à vitesses égales — il localise toujours. FEXT : le bruit avant"
        " CO-PROPAGE, t = τ_agresseur(x) + τ_victime(L) − τ_victime(x), et"
        " cette loi est PLATE à vitesses égales : tout arrive au même instant,"
        " il n'existe aucune abscisse à rendre, et la carte ne porte alors PAS"
        " de ligne FEXT plutôt qu'une ligne qui désignerait un millimètre au"
        " hasard. La vitesse de chaque piste est calculée séparément — jamais"
        " supposée égale à celle de l'agresseur.",
        "LE PROFIL D'ESPACEMENT vient de la GÉOMÉTRIE et non du calcul"
        " électromagnétique : c'est ce qui en fait un témoin indépendant, et"
        " c'est pourquoi il se superpose à la carte plutôt que de s'afficher à"
        " côté. Il est constant par morceaux — un morceau par tronçon, l'écart"
        " étant mesuré au milieu de leur projection commune —, et l'abscisse"
        " suit le CUIVRE, arcs développés compris. Un pic de couplage est"
        " signalé comme NON JUSTIFIÉ lorsque l'espacement y dépasse %.2f fois"
        " l'espacement médian du longement, qu'il n'y varie pas de plus de"
        " %d %%, et qu'aucune zone de vigilance n'y tombe. La règle est"
        " volontairement prudente : une alerte qui se déclenche à tort ferait"
        " ignorer toutes les autres."
        % (_nb(reglages.get("desaccord"), 1.25), int(100 * PLAT)),
        "Le contrôle du plan de masse est INDÉPENDANT du calcul de couplage,"
        " et il ne s'y ajoute pas : le blindage d'un plan continu et de ses"
        " vias est déjà DANS la matrice S, chaque section étant résolue avec"
        " son plan de référence et ses écarts au cuivre de masse. Le seuil de"
        " couture retenu est %.2f mm, tiré de %s%s."
        % (masse.get("seuil", 0.0), masse.get("source", ""),
           (" ; ce qui a pu être examiné : %s" % ", ".join(masse["mesure"]))
           if masse.get("mesure") else " ; RIEN n'a pu être examiné"),
        "LE CUIVRE DE MASSE N'EST DANS LA MATRICE QUE S'IL EST COUSU, et cela"
        " vaut des deux façons dont il entre. Une PISTE DE GARDE routée entre"
        " l'agresseur et sa victime est posée dans la section comme un"
        " conducteur sans port : tenue à 0 V quand ses vias sont assez serrés,"
        " FLOTTANTE au-delà — et un cuivre flottant ne blinde pas, il"
        " TRANSFÈRE. Le PLAN ARROSÉ qui borde le groupe suit la même règle :"
        " sa couture dépasse-t-elle le seuil, l'écart au plan de ce côté est"
        " mis à zéro et l'effet coplanaire annulé, plutôt que de faire cadeau"
        " d'une masse idéale à 0 V que la carte n'a pas. Une couture NON"
        " MESURÉE vaut zéro et se lit « tenu » : on suppose bon ce qu'on ne"
        " sait pas, et le calcul reste alors optimiste de ce côté-là.",
        "RIEN NE S'AGRÈGE%s. Deux victimes d'un même agresseur sont deux nets"
        " différents, chacun avec son budget : une victime ADDITIONNE ses"
        " agresseurs, un agresseur n'additionne pas ses victimes. La seule"
        " somme offerte est celle de plusieurs agresseurs EN PHASE vers une"
        " victime, et elle ne se fait que sur demande."
        % (" — et l'agrégation des agresseurs a été DEMANDÉE"
           if reglages.get("agreger_agresseurs") else ""),
    ]
    if source:
        h.append(
            "LA SOURCE EST LE DESIGN, ET ELLE EST LA SEULE : aucun fichier de"
            " paramètres S n'entre ici. Le réseau est SYNTHÉTISÉ à partir de"
            " la même section droite que l'onglet Diaphonie, mise en cascade"
            " le long du parcours ; ses ports sont posés ici, donc connus, et"
            " le mapping ne se devine plus. Chaque victime est un conducteur"
            " sur TOUTE la longueur de l'agresseur : là où elle ne longe pas,"
            " elle est une ligne isolée sans terme mutuel, ce qui lui donne le"
            " bon retard de bout en bout. Les pertes DIÉLECTRIQUES y sont"
            " (tan δ dans une permittivité complexe) ; les pertes CONDUCTRICES"
            " n'y sont pas — elles rendraient la base modale dépendante de la"
            " fréquence — pas plus que le rayonnement, les coudes, ni les"
            " transitions de via. La matrice ressort en Touchstone pour se"
            " comparer ailleurs à ce qu'un solveur pleine onde rendrait de la"
            " même géométrie : c'est une sortie, jamais une entrée.")
    if profils:
        h.append("Vitesses retenues : "
                 + " ; ".join("%s %.4g m/s (%s)"
                              % (net, _vitesse(p), p[2])
                              for net, p in sorted(profils.items())) + ".")
    h.append(
        "CE QUE CETTE CARTE NE COUVRE PAS, rassemblé — et dans quel sens :"
        " (1) la ligne FEXT n'est PAS TRACÉE quand les deux vitesses"
        " sont égales, le bruit avant co-propageant avec l'agresseur : sa loi"
        " d'arrivée est alors plate et aucune abscisse n'existe → le NIVEAU"
        " du FEXT est mesuré, sa POSITION n'est ni optimiste ni"
        " pessimiste, elle est absente ; (2) la résolution spatiale est celle de la"
        " BANDE : deux zones plus proches que la résolution annoncée sont une"
        " seule tache → OPTIMISTE sur la finesse, jamais sur le niveau ;"
        " (3) le réseau synthétisé ignore les pertes conductrices, les coudes"
        " et les vias → le couplage y est celui d'une liaison idéalisée, donc"
        " un PLANCHER ; (4) les contrôles de plan de masse ne voient que ce que"
        " la page envoie — une carte muette sur sa couture rend une carte"
        " muette sur ses trous → OPTIMISTE ; (5) le couplage VERTICAL, entre"
        " deux pistes superposées de couches voisines, n'est pas modélisé : le"
        " solveur de section range ses conducteurs côte à côte. Ces pistes"
        " ressortent au plancher, ce qui est le contraire de la réalité sous"
        " un empilage mince → OPTIMISTE, et c'est le manque le plus lourd de"
        " cette liste ; leur distance mesurée reste à l'étape 0a ;"
        " (6) LE PLAN DE RETOUR EST SUPPOSÉ CONTINU sous les deux pistes —"
        " [C] et [L] sortent d'une section droite quasi-TEM, qui n'existe que"
        " si le courant de retour passe juste en dessous. Là où le plan est"
        " percé, fendu ou absent, le retour fait un détour dont l'aire de"
        " boucle n'est nulle part dans la section, et les deux pistes se"
        " partagent ce retour : le couplage par IMPÉDANCE COMMUNE n'est pas"
        " un terme mal chiffré, c'est un terme ABSENT du modèle, et l'écart"
        " n'est donc pas borné par ce calcul → OPTIMISTE, et à égalité avec"
        " (5) pour le poids. Les"
        " fentes sondées lèvent une réserve quand elles tombent sur un"
        " longement, et un bloc dont la section n'est pas résoluble n'est"
        " plus compté comme découplé. Ce qui est"
        " affiché est donc un plancher sur une carte mal cousue, mal référencée"
        " ou densément empilée, et une lecture floue plutôt que fausse sur une"
        " bande étroite.")
    return h


def touchstone_np(freqs, matrices, impedance=50.0, entete=None):
    """Le texte d'un fichier .sNp, format « RI » (reel / imaginaire).

    C'EST UNE SORTIE, ET LA SEULE FACON DONT UN .sNp TOUCHE CETTE SECTION.
    Rien ne se relit ici : le fichier sert a porter le reseau AILLEURS, pour
    le comparer a ce qu'un solveur pleine onde rendrait de la meme geometrie.

    POURQUOI RI ET NON MA. `simulation_em.touchstone` ecrit en MA, qui se lit
    a l'oeil ; ici le fichier sert a RECOUPER, et le recoupement demande que
    rien ne soit perdu -- une phase arrondie au dix-millieme de degre l'est.
    Le format RI n'a pas ce probleme.

    L'ORDRE EST CELUI DE LA NORME : ligne par ligne, S11 S12 ... S1N, puis
    S21 ... -- sauf pour un deux-ports, ou la norme veut S11 S21 S12 S22.
    L'entete nomme les ports dans l'ordre ou ils sont poses, faute de quoi le
    fichier serait inexploitable pour qui le recoit.
    """
    n = matrices[0].shape[0]
    lignes = ["! " + str(l) for l in (entete or [])]
    lignes.append("! Ports : 1..%d = bouts proches, %d..%d = bouts lointains"
                  % (n // 2, n // 2 + 1, n))
    lignes.append("# HZ S RI R %g" % impedance)
    for f, s in zip(freqs, matrices):
        if n == 2:
            ordre = [(0, 0), (1, 0), (0, 1), (1, 1)]
        else:
            ordre = [(i, j) for i in range(n) for j in range(n)]
        vals = []
        for i, j in ordre:
            vals.append("%.9g %.9g" % (s[i, j].real, s[i, j].imag))
        # UNE LIGNE PAR RANGEE au-dela de deux ports, et QUATRE PAIRES AU PLUS
        # PAR LIGNE : c'est la mise en page de la norme, et un fichier d'une
        # seule ligne de mille nombres est illisible pour qui l'ouvre.
        #
        # LE COMPTE EST CELUI DES PAIRES, PAS DES NOMBRES. `2 * n` comptait des
        # nombres la ou `vals` porte deja des paires : pour quatre ports, le
        # fichier ecrivait DEUX rangees de matrice par ligne alors que la
        # docstring annonce une. Les lecteurs tolerants -- dont celui du banc,
        # qui aplatit tout -- ne le voyaient pas ; un lecteur strict, qui
        # compte une rangee par ligne, lisait la matrice transposee par
        # morceaux.
        if n <= 2:
            lignes.append("%.9g %s" % (f, " ".join(vals)))
        else:
            for r in range(n):
                rangee = vals[r * n:(r + 1) * n]
                tete = ("%.9g " % f) if r == 0 else "  "
                lignes.append(tete + " ".join(rangee[:TS_PAR_LIGNE]))
                for d in range(TS_PAR_LIGNE, len(rangee), TS_PAR_LIGNE):
                    lignes.append("  " + " ".join(rangee[d:d + TS_PAR_LIGNE]))
    return "\n".join(lignes) + "\n"


def _journaliser(journal, base):
    """Une ligne par analyse, comme `simulation_em.simuler`.

    ELLE COMPTE LES PICS NON JUSTIFIES, et c'est le renseignement qui manque
    le plus quand on relit un journal : une analyse dont tous les pics se
    recoupent avec la geometrie et une analyse dont aucun ne s'y recoupe ne se
    lisent pas de la meme facon, et rien d'autre dans la ligne ne les
    distingue.
    """
    if not journal:
        return
    confirmees = [c for c in base.get("couples") or [] if c["confirmee"]]
    inexpliques = [d for d in (base.get("desaccords") or [])
                   if d["verdict"] == "inexplique"]
    journal("  crosstalk « %s » : %d candidat(s), %d victime(s) confirmee(s)"
            " sur %.1f mm, %d pic(s) non justifie(s), %d avertissement(s)\n"
            % (base.get("principal", "?"),
               len(base["etape0"]["candidats"]), len(confirmees),
               base.get("longueur", 0.0), len(inexpliques),
               len(base.get("avertissements") or [])))
