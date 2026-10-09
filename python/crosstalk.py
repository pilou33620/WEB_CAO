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
#   point et le couplage sous le GENOU du front. CE GENOU DOIT VENIR DU SIGNAL :
#   du temps de montee saisi, ou a defaut de l'amplitude, qui designe une
#   famille logique et son front typique (`FRONTS_FAMILLE`) -- et la fiche dit
#   alors partout qu'il est SUPPOSE. Deduit de la BANDE, il vaudrait la bande
#   et ne comparerait rien ; sans signal decrit, il n'y a donc pas de genou et
#   pas de comparaison. Le meme temps de montee sert au seuil de couture : deux
#   chiffres compares dans une meme fiche sortent d'une meme hypothese. Le
#   continu est exclu de cette lecture : le couplage y vaut zero par
#   construction, et sur une grille de 5 GHz de pas c'est le seul point sous
#   un genou a 39 MHz --
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
#
# Version: 3.2.0
# Date: 2026-09-17
# Explication: UN NET EST UN CONDUCTEUR -- et il en faisait deux. Revue du
#   fichier entier ; sept defauts, dont un seul rendait un resultat faux et
#   credible, et c'est celui-la qui donne son titre a la version.
#
#   (1) LE MEME NET SUR DEUX COUCHES POSAIT DEUX CONDUCTEURS. La preselection
#   range par (net, couche) -- il le faut, une voisine qui longe a plat puis
#   repasse SOUS l'agresseur est deux situations de dessin --, mais tout ce qui
#   suit indexe par NET : `par_net` dans `_matrices_bloc`, `_profils`,
#   `profils_espacement`, `_fiche_candidat`, les lignes de la carte, les noms
#   de ports. Le dictionnaire ecrasait donc le doublon, et les rangees de [C]
#   et [L] du longement LATERAL partaient au conducteur VERTICAL : mesure sur
#   un cas a deux candidats homonymes, la victime qui couple a 0,15 mm
#   ressortait a -300 dB et « non confirmee », pendant que l'autre ligne --
#   celle que l'avertissement annonce comme « non modelisee, elle ressortira au
#   plancher » -- portait les -10,6 dB. `_fiche_candidat` rendant par-dessus le
#   marche la PREMIERE fiche du nom, les deux lignes s'affichaient avec la meme
#   distance et la meme couche, dont une au moins etait fausse ; et le doublon
#   mangeait une des cinq places de `MAX_VICTIMES`. Un net est un NOEUD
#   ELECTRIQUE : `_fusionner_nets` n'en pose plus qu'un jeu de ports, le
#   tableau garde ses lignes par couche, et la fiche chiffree porte l'UNION des
#   longements.
#
#   (2) UN PLATEAU COMPTAIT POUR PLUSIEURS PICS. `_pics` comparait au dernier
#   pic RETENU ; les points ecartes ne s'y inscrivant pas, une crete plate
#   rendait un point sur DEUX. `PICS_MAX` se remplissait de la meme crete.
#
#   (3) LA TOLERANCE DE RECIPROCITE NE SUIVAIT PAS LA CASCADE. L'ecart
#   d'arrondi vaut 1,6.10^-14 sur quarante blocs et 2,0.10^-4 sur quatre
#   cents : a un facteur cinq d'un seuil FIXE de 1e-3. Le controle aurait fini
#   par denoncer l'arithmetique en croyant denoncer le reseau, et sur les
#   parcours les plus longs. Il suit maintenant la racine du nombre de blocs,
#   et la tolerance employee est RENDUE -- un seuil qu'on ne peut pas relire ne
#   se verifie pas.
#
#   (4) L'ORDRE DU PARCOURS N'ETAIT PAS VERIFIE. `s` se cumule bout a bout dans
#   l'ordre ou la page envoie les objets, et rien ne controlait que le bout
#   d'un troncon TOUCHE le debut du suivant. Une liste mal ordonnee donnait un
#   axe de position faux sans rien lever : la carte restait lisse et les pics
#   tombaient a des millimetres qui existent. C'etait le dernier controle
#   manquant du fichier. Un troncon RETOURNE est dit a part : les bouts se
#   touchent, l'abscisse reste juste, c'est le signe du cote qui s'inverse.
#
#   (5) LA HAUTEUR AU PLAN NE REGARDAIT QUE LE PREMIER TRONCON. Un agresseur
#   qui change de couche -- ce que `_tan_delta` prend deja en compte pour les
#   pertes -- posait le seuil de distance, et surtout l'alerte « aucun plan de
#   reference », sur une couche que la moitie du parcours ne voit jamais. Les
#   deux usages ne veulent d'ailleurs pas la meme borne : le seuil de DISTANCE
#   doit majorer, la LONGUEUR MINIMALE de longement doit ecarter le moins
#   possible. Les couches sans plan sont desormais NOMMEES.
#
#   (6) L'ARRONDI DE BANDE ALLAIT TOUJOURS VERS LE HAUT, y compris sur une
#   bande PLAFONNEE par la validite quasi-TEM : on franchissait de cent
#   megahertz la seule limite que cette borne existe pour tenir. Et la branche
#   plafonnee par le nombre de POINTS recalculait `f_max` apres l'arrondi, donc
#   rendait la seule bande non ronde des trois, dans le champ qu'on relit.
#
#   (7) LE HAUT DE BANDE PERDAIT SA PHASE EN RECTANGULAIRE SANS PADDING.
#   `irfft` jette la partie imaginaire du dernier point sans le dire ; la
#   troncature est maintenant ECRITE, et le seul reglage qui la subisse le dit.
#
#   ET LA CASCADE VA SIX FOIS PLUS VITE, sans qu'un chiffre bouge : `chaine_mtl`
#   appelait `np.block` UNE FOIS PAR FREQUENCE ET PAR BLOC -- cent soixante
#   mille fois sur un parcours au plafond, et la moitie du temps de l'analyse.
#   Les quatre quadrants se remplissent par diffusion et `np.matmul` enchaine
#   toute la bande : 7,7 s -> 1,3 s au plafond, resultats identiques au bit.
# Fonctions ajoutees : _fusionner_nets, _verifier_ordre, _arrondir_bande
#   (+ SAUT_PARCOURS, PAS_BANDE). Fonctions modifiees : chaine_mtl
#   (vectorisee), valider_matrice (+ `blocs`, + tolerance rendue), _pics,
#   vers_temporel (Nyquist ecrit), _parcours (+ `notes`), bande_deduite
#   (arrondi), candidats_geometriques (hauteur sur toutes les couches),
#   _fiche_candidat, _lire_couples (+ `retenus`), analyser.
#
# Version: 3.3.0
# Date: 2026-09-22
# Explication: LA GEOMETRIE DU PLAN ENTRE DANS [C] ET [L], ET PLUS SEULEMENT
#   L'EMPILAGE. C'est le faux le plus couteux que ce module ait porte, et il ne
#   se voyait sur AUCUNE carte.
#
#   L'empilage est GLOBAL : il declare qu'une couche est un plan de reference,
#   jamais qu'elle porte du cuivre a tel endroit. La presence du cuivre, elle,
#   est LOCALE -- une decoupe, une fente, un plan qui ne descend pas sous la
#   paire. `section_de_couche` ne lisant que l'empilage, deux longements de
#   meme dessin dont l'un survole une decoupe se resolvaient BIT POUR BIT
#   pareil. Sur une carte d'essai portant expres les deux configurations cote a
#   cote -- une paire sans plan dessous, la meme avec --, les deux NEXT
#   sortaient identiques au centieme de dB, et rien ne s'en etonnait.
#
#   LE RENSEIGNEMENT ETAIT POURTANT DEJA DANS LE DOCUMENT. `fentes` dit depuis
#   la 3.0.0 sur quelle portion du parcours quel plan n'a pas de cuivre de
#   retour -- mais il ne servait qu'aux AVERTISSEMENTS, jamais au calcul. Il
#   porte desormais aussi `plans`, les noms de couche en clair (la page les
#   ecrivait dans une phrase, ce qui obligeait a analyser du francais pour
#   savoir de quel plan on parle), et ces couches-la sont RETIREES de l'empilage
#   sur les blocs concernes : la section y retombe sur le plan suivant -- plus
#   loin, donc plus couple --, ou sur AUCUN, et le bloc est alors declare non
#   calculable plutot que calcule sur une reference imaginaire. Les bornes de
#   fente sont des frontieres de bloc, comme les gardes : un bloc est
#   entierement sous plan, ou entierement sur la decoupe.
#
#   UNE PAGE QUI N'ENVOIE PAS `plans` NE CHANGE PAS DE COMPORTEMENT : la fente
#   reste un avertissement, comme avant. Le correctif n'arrive qu'avec le
#   renseignement.
# Fonctions modifiees : decouper (+ `fentes`), _ligne_seule, _tan_delta,
#   _matrices_bloc, reseau_synthetise (+ `plans_nus` / `fentes`, dans les clefs
#   de cache), analyser (passe `doc["fentes"]`).
#
# Version: 3.4.0
# Date: 2026-09-22
# Explication: LA CONSIGNE TAISAIT LE GESTE LE PLUS RENTABLE, ET ELLE COUPAIT
#   SA PROPRE LISTE SANS LE DIRE. Deux defauts de la meme famille : `actions`
#   ne rend que ce qu'on lui donne, et on ne lui donnait pas tout.
#
#   (1) LE CUIVRE DE MASSE ROUTE ET NON COUSU NE PRODUISAIT AUCUN GESTE. Depuis
#   la 3.1.0, `blindage` porte les pistes de garde posees dans les sections, la
#   longueur sur laquelle chacune FLOTTE faute de vias, et les bords de plan
#   arrose qui ont perdu leur masse. Ces deux mesures levaient un
#   AVERTISSEMENT -- donc une phrase a lire, au milieu des autres -- et
#   n'entraient dans la liste des gestes par aucun chemin. C'etait le seul
#   renseignement du fichier qui designe un conducteur DEJA DESSINE et qu'il
#   suffit de percer, et c'est aussi le seul dont on connaisse le sens de
#   l'effet a coup sur : une garde cousue est tenue a 0 V et fait tomber le
#   NEXT ; la meme garde sans vias est posee FLOTTANTE, elle ne blinde pas,
#   elle TRANSFERE, et le couplage peut en devenir PIRE qu'en l'absence de tout
#   cuivre. Ces deux gestes passent donc AVANT les zones de vigilance du plan,
#   qui designent un endroit douteux et non une correction certaine.
#
#   (2) `ACTIONS_MAX` COUPAIT EN SILENCE. Six gestes tiennent comme une
#   consigne ; au-dela on relit un inventaire et l'on n'en fait aucun -- la
#   borne est juste. Mais `gestes[:ACTIONS_MAX]` retirait le reste sans laisser
#   de trace : un dessin a huit gestes en montrait six, et les deux autres
#   n'existaient NULLE PART, ni a l'ecran ni dans le rapport exporte, qui est
#   pourtant le fichier qu'on emporte devant le layout. La coupe se dit
#   desormais par `omises`, avec le compte et la nature de ce qui a saute --
#   meme parti pris que le `refus` de `zones_risque`.
#
#   UNE PAGE QUI N'ENVOIE PAS `blindage` NE CHANGE PAS DE COMPORTEMENT : les
#   deux nouveaux parametres sont facultatifs, et la liste rendue sans eux est
#   celle d'avant, geste pour geste.
# Fonctions modifiees : actions (signature : + `blindage`, + `omises` ; deux
#   familles de gestes en plus, coupe annoncee), _lire_couples (passe
#   `base["blindage"]`, pose `actions_omises`), analyser (branche vide :
#   `actions_omises`).
# Version: 3.5.0
# Date: 2026-09-23
# Explication: LE TITRE RENDAIT UN VERDICT EN MILLIVOLTS SUR DES DECIBELS QUE
#   LA FICHE DECLARAIT ILLISIBLES DEUX LIGNES PLUS BAS. C'est le defaut que
#   tout ce fichier cherche a ne pas produire : un chiffre juste, propre, et
#   qui ne parle pas de la carte qu'on regarde.
#
#   LE CAS EST STRUCTUREL, PAS ACCIDENTEL. La bande se regle pour la
#   RESOLUTION SPATIALE -- c'est legitime, elle seule la fixe --, et un dessin
#   fin la pousse tres haut : 44,70 GHz pour distinguer 1,22 mm. Le SIGNAL,
#   lui, reste ou il est : un front de 10 ns a son genou a 35 MHz. Quand le
#   rapport des deux depasse ce que `POINTS_DEDUITS_MAX` peut couvrir, la
#   grille n'a plus UN SEUL point sous le genou ; `_db_sous` refuse alors de
#   repondre -- a raison --, `pire_db_genou` est absent, et la page retombait
#   EN SILENCE sur `pire_db`, c'est-a-dire sur le maximum pris sur toute la
#   bande analysee. Elle en tirait un pourcentage, des volts, et un
#   « AU-DESSUS DU BUDGET » -- au moment meme ou `_avertir` levait une reserve
#   disant qu'aucun point de la grille n'etait sous le genou.
#
#   LE COUPLAGE CROIT AVEC LA FREQUENCE tant que la liaison est courte devant
#   la longueur d'onde. Lire le maximum sur 0-44,70 GHz revient donc a lire le
#   HAUT de bande, et l'annoncer en millivolts sur la broche revient a prêter
#   au signal une energie a dix octaves de la ou il en a.
#
#   `hors_bande_signal` MARQUE LE COUPLE A LA SOURCE, au moment ou l'on sait
#   pourquoi cela compte. La page cesse alors de comparer a un budget et
#   etiquette le niveau « bande analysee » au lieu de « signal » ; le niveau,
#   lui, reste affiche -- l'effacer laisserait croire qu'il n'y a pas de
#   couplage, ce qui serait le second malentendu apres le premier.
# Fonctions modifiees : _lire_couples (pose `hors_bande_signal` a faux),
#   _avertir (le leve avec la reserve « hors de la bande du signal »).
#
# Version: 3.6.0
# Date: 2026-09-23
# Explication: LE MODE SIMPLE CLASSAIT PAR LE PLAFOND, ET LE PLAFOND IGNORE LA
#   LONGUEUR. Kb est le NEXT SATURE ; il n'est atteint que si le longement
#   depasse v.t_r/2 -- 85 mm de microruban sous 1 ns --, et presque aucun ne
#   le fait. En dessous, le NEXT vaut Kb.2T_d/t_r. Trois millimetres serres
#   passaient donc devant trente-six millimetres moderes qui, sous un front
#   de 1 ns, prennent 3,6 fois plus -- et la fiche ecrivait que ce classement
#   etait « vrai pour n'importe quel front ».
#
#   Kb.2T_d SE CALCULE COMME Kf.T_d, bloc par bloc sur le profil de retard,
#   et ne demande toujours aucun signal. Il classe desormais ; le rang par Kb
#   reste rendu (`rang_kb`) pour les fronts plus rapides que la saturation,
#   et `t_sature_ps` donne ce front-la pour chaque couple. Contre le mode
#   precis, min(Kb, Kb.2T_d/t_r) retrouve la crete a 6 % pres de 100 ps a
#   3 ns.
# Fonctions modifiees : _lire_couples_simple (+ kb_2td_ps, t_sature_ps,
#   rang_kb ; tri par kb_2td_ps).
#
# Version: 4.0.0
# Date: 2026-10-09
# Explication: NIVEAU 2, LE SCAN NORMALISE -- ET IL N'Y A PLUS QU'UN MODE.
#   L'analyse electrique (matrice S synthetisee, IFFT, bande, fenetre,
#   zero-padding, passe temporelle, Touchstone, volts, budget, marge) est
#   RETIREE. Ce qui reste est l'analyse geometrique, completee pour rendre
#   le pic de bruit relatif que la victime subit, sans tension ni protocole :
#     - un echelon d'agresseur UNITAIRE (100 %), des lignes ADAPTEES ;
#     - un front t_r PAR ANALYSE : saisi, ou deduit de la CLASSE du net
#       agresseur (memes fronts que la verification de carte) ;
#     - k_total = 1/2 (Cm/C11 + Lm/L11), Kb = k_total / 2,
#       Kf = 1/2 (Lm/L11 - Cm/C11), T_d du longement bloc par bloc ;
#     - NEXT = Kb si 2 T_d >= t_r (sature), Kb.2T_d/t_r sinon ;
#       FEXT = |Kf| . T_d / t_r ; les deux en % et en dB ;
#     - un statut par metrique -- vert, orange, rouge, seuils 3 % et 7 %
#       par defaut, reglables -- et celui de la paire, le pire des deux.
#   LES PISTES EMPILEES SONT CALCULEES : deux rubans de couches voisines sans
#   plan entre eux passent par `ligne_mom.section_deux_niveaux`, comme dans
#   la verification de carte (milieu homogene : Kf nul), et se placent sur
#   la carte locale par la projection de la victime sur l'agresseur.
#   LA CARTE LOCALE RESTE, en NEXT % : Kb(x) . min(1, 2T_d/t_r), c'est-a-dire
#   le NEXT qu'aurait la paire si tout son longement couplait comme a cet
#   endroit. Son maximum est le NEXT de la paire quand le couplage est
#   uniforme.
# Fonctions ajoutees : niveau2, statut, front_de_classe, _superposees.
# Fonctions retirees : tout le chemin frequentiel -- valider_matrice,
#   verifier_bande, bande_deduite, fenetre, vers_temporel, carte_du_couple,
#   crete_temporelle, desaccords, _asymetries, touchstone_np, _lire_couples
#   (precis), _avertir, mapping_propose, et leurs constantes. `chaine_mtl`,
#   `_modes_mtl` et `s_depuis_chaine` restent : rf_reseau et son banc s'en
#   servent comme reference de lignes couplees.
# ==========================================
"""Crosstalk Niveau 2 : le pic de bruit relatif, paire par paire.

    >>> import crosstalk
    >>> crosstalk.etat()["dispo"]
    True

LA QUESTION. Quel pic de bruit, en pour-cent de l'amplitude de l'agresseur,
une piste victime subit-elle -- sans connaitre ni la tension reelle du signal
ni le protocole ? Le resultat se lit en % et en dB de l'agresseur.

LES HYPOTHESES DE DEPART.
  * Tension normalisee : l'agresseur fait un echelon UNITAIRE (1 V, 100 %).
  * Temps de montee de reference t_r : SAISI pour l'analyse, ou deduit de la
    classe du net agresseur (Horloge 2 ns, Rapide 1 ns, RF 100 ps, ... -- les
    memes fronts que la verification de carte, reglables la-bas).
  * Lignes adaptees a leurs deux bouts sur leur Z0 : on evalue le couplage
    direct, sans allers-retours de reflexions.

LES GRANDEURS D'ENTREE, issues du solveur 2D MoM (`ligne_mom`) sur la coupe
tiree du design (IPC-2581 ou editeur PCB) :
  * [C] et [L] par bloc : C11 (diagonale de Maxwell, capacite totale), L11,
    et les mutuelles Cm, Lm ;
  * la vitesse v = c0 / racine(eps_eff), eps_eff = C11 / C11(vide) -- egale a
    1 / racine(L11 . C11) pour une ligne seule, et sans le biais que ce
    produit de deux diagonales prend des qu'il y a couplage ;
  * T_d, le temps de propagation le long du couplage : la somme, bloc par
    bloc, des retards de la victime la ou elle longe. Un longement dont
    l'ecart varie est donc compte morceau par morceau.

LES FORMULES.
  k_total = 1/2 (Cm/C11 + Lm/L11)       couplage geometrique pur
  Kb      = k_total / 2                 NEXT sature
  Kf      = 1/2 (Lm/L11 - Cm/C11)       nul en stripline homogene
  NEXT    = Kb_max                       si 2 T_d >= t_r  (sature)
          = Sum(Kb . 2 dT) / t_r         sinon            (non sature)
  FEXT    = |Sum(Kf . dT)| / t_r
Avec un couplage uniforme, Sum(Kb . 2 dT) = Kb . 2 T_d et l'on retrouve
exactement les deux cas classiques ; avec un couplage qui varie, la somme
pondere chaque morceau par son propre Kb, et la saturation se lit sur le
plus fort.

CE QUI SORT, PAR PAIRE (agresseur, victime) : k_total, NEXT et FEXT en % et
en dB, T_d, saturation, et un STATUT DRC par metrique -- vert sous le seuil
orange (3 %), orange jusqu'au seuil rouge (7 %), rouge au-dela, les deux
reglables -- plus le statut de la paire, le pire des deux. A cote, la CARTE
LOCALE : ou, le long de l'agresseur, le NEXT se fabrique.

LES DEUX ETAPES ZERO RESTENT DEUX.

  (a) LA PRESELECTION GEOMETRIQUE ne demande que l'AGRESSEUR et cherche seule
      ce qui longe -- meme couche, et couches adjacentes : deux pistes
      superposees couplent souvent PLUS que les memes cote a cote. Chaque
      candidat porte sa distance et sa longueur de parallelisme MESUREES le
      long du cuivre, et son profil d'espacement.
  (b) LA CONFIRMATION ne retient comme VICTIME que ce dont le pire des deux
      niveaux depasse un seuil (-40 dB par defaut). Les ecartees restent au
      tableau, avec leur niveau.

Fusionnees, elles ne permettraient plus de distinguer une piste LOIN d'une
piste PROCHE ET BLINDEE -- deux situations de dessin opposees.

LE PLAN DE MASSE n'est pas modelise a part : son blindage est deja dans [C] et
[L], chaque section etant resolue avec son plan de reference et le cuivre de
masse a portee. On controle en parallele le pas de couture, les fentes et les
changements de couche sans via de masse : des CAUSES, posees a cote de la
carte.

LA CARTE ENTIERE, avec un t_r GLOBAL, est le travail de `analyse_carte` (regle
« diaphonie ») : memes formules, memes seuils, toutes les paires voisines.

--------------------------------------------------------------------------
LE DOCUMENT D'ENTREE, format « cao-crosstalk-1 », en MILLIMETRES :

    format      "cao-crosstalk-1"
    carte       nom du document
    agresseurs  [net, ...] -- les nets SELECTIONNES. Celui qui porte le plus
                de cuivre donne l'axe de position
    natures     {net: classe}              la classe des nets (t_r deduit)
    stackup     {"layers": [...]}          comme « cao-sim-em-3 »
    geometry    {"objects": [...]}         les troncons de l'agresseur, DANS
                                           L'ORDRE DU PARCOURS
    voisinage   [...]                      le cuivre qui passe a portee
    reference_nets  les nets tenus pour de la masse
    paires      [[netP, netN], ...]        les paires declarees
    reglages    voir DEFAUTS, plus bas -- dont t_r (s, 0 = deduit),
                tr_classes {classe: s}, seuil_orange, seuil_rouge (fractions)
    couture     {"positions": [{"s": mm le long du parcours, "cote": +-1}]}
    fentes      [{"s": mm, "longueur": mm, "plans": [nom de couche, ...],
                  "quoi": texte}]
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
VERSION = "4.0.0"
VERSION_MOTEURS = {
    "crosstalk": VERSION,
    "simulation_em": getattr(se, "VERSION", "4.2.0") if se is not None else "indisponible",
    "ligne_mom": getattr(tl, "VERSION", "2.5.0") if tl is not None else "indisponible",
}

C_0 = 299792458.0

# -- les garde-fous ---------------------------------------------------------
# Une section par bloc, N conducteurs par section : cinq victimes restent
# immediates, cinquante ne se liraient plus de toute facon.
MAX_VICTIMES = 5
MAX_AGRESSEURS = 3
MAX_BLOCS = 400
MAX_PORTS = 64
MAX_CORPS = 4 * 1024 * 1024

# LE MULTIPLE QUI DONNE LE SEUIL DE DISTANCE PAR DEFAUT. Trois largeurs de
# piste est la regle 3W, celle que tout le monde dessine ; trois hauteurs de
# dielectrique est la meme idee vue de l'autre cote -- c'est la hauteur au plan
# qui fixe l'etendue du champ, et une piste fine sur un stratifie epais couple
# bien au-dela de trois fois sa largeur. On prend le PLUS GRAND des deux : le
# seuil doit MAJORER, et c'est la confirmation qui fait le tri.
DISTANCE_AUTO = 3.0

# -- NIVEAU 2 ---------------------------------------------------------------
# Le front de reference quand rien d'autre ne le donne : 1 ns, la majorite
# des fronts rapides du numerique moderne.
TR_DEFAUT = 1e-9
# LES FRONTS PAR CLASSE DE NET, les memes que `analyse_carte.TR_CLASSES` --
# la page envoie ceux du panneau de verification quand on les a regles.
TR_CLASSES = {"Horloge": 2e-9, "Rapide": 1e-9, "RF": 1e-10,
              "Analogique": 1e-7, "Lent": 1e-8, "Découpage": 5e-9}
# LES SEUILS DRC, en fraction de l'agresseur : vert dessous, rouge au-dela.
SEUIL_ORANGE = 0.03
SEUIL_ROUGE = 0.07

DEFAUTS = {
    # -- etape 0a : la preselection geometrique
    "distance_max": 0.0,        # mm ; 0 = deduit de la largeur et de la hauteur
    "longueur_min": 0.0,        # mm ; 0 = deduit de l'ecart et de la hauteur
    "couches_adjacentes": True,
    # -- etape 0b : la confirmation
    "seuil_db": -40.0,
    # -- le niveau 2
    "t_r": 0.0,                 # s ; 0 = deduit de la classe de l'agresseur
    "tr_classes": {},           # {classe: s} -- les fronts du panneau carte
    "seuil_orange": SEUIL_ORANGE,
    "seuil_rouge": SEUIL_ROUGE,
    # -- la lecture
    "risque": 0.5,              # fraction du pire point d'une victime au-dela
                                # de laquelle la plage se peint sur le cuivre
}


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
                "version": VERSION,
                "moteurs": VERSION_MOTEURS,
                "detail": "Analyse de crosstalk indisponible : %s"
                          % ERREUR_SOLVEUR,
                "conseil": "Elle a besoin de numpy : « pip install numpy »."}
    return {"dispo": True, "format": FORMAT, "resultat": FORMAT_RESULTAT,
            "version": VERSION,
            "moteurs": VERSION_MOTEURS,
            "max": MAX_CORPS,
            "source": "le design seul (IPC-2581 ou editeur PCB)",
            "methode": "niveau 2 : [C] et [L] par bloc (MoM 2D) -> k_total,"
                       " NEXT et FEXT normalises a un echelon unitaire sous"
                       " un front t_r, lignes adaptees",
            "defauts": dict(DEFAUTS),
            "tr_classes": dict(TR_CLASSES),
            "limites": {"victimes": MAX_VICTIMES,
                        "agresseurs": MAX_AGRESSEURS,
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
# LES LIGNES COUPLEES EN CASCADE -- une bibliotheque, plus un chemin de calcul
# --------------------------------------------------------------------------
# LE NIVEAU 2 NE S'EN SERT PAS : il lit [C] et [L] bloc par bloc et n'a besoin
# d'aucune frequence. Ces trois fonctions restent parce que `rf_reseau` et son
# banc y prennent leur reference de lignes couplees.
#
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
    try:
        lh = np.linalg.cholesky(l_mat)
    except np.linalg.LinAlgError:
        raise ErreurCrosstalk(
            "Section non physique : matrice d'inductance non définie positive.",
            "La géométrie de la section est incohérente.")
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
    try:
        w_mat = np.linalg.solve(l_mat, t_mat * racines[None, :])
    except np.linalg.LinAlgError:
        raise ErreurCrosstalk(
            "Section non physique : matrice d'inductance singulière.",
            "La géométrie de la section est incohérente.")
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
    t_c, w_c = t_mat.astype(complex), w_mat.astype(complex)
    q = np.empty((2 * n, 2 * n), dtype=complex)
    q[:n, :n] = t_c
    q[:n, n:] = t_c
    q[n:, :n] = w_c
    q[n:, n:] = -w_c
    try:
        q_inv = np.linalg.inv(q)
    except np.linalg.LinAlgError:
        raise ErreurCrosstalk(
            "Réseau non physique : matrice modale singulière.",
            "Vérifiez l'espacement entre conducteurs.")

    # TOUTE LA BANDE D'UN SEUL PRODUIT. `e` et `ei` ne ponderent que les
    # COLONNES de T et de W : les quatre quadrants de P se remplissent donc par
    # diffusion, et `np.matmul` enchaine les K produits en une fois. Le calcul
    # est le MEME a l'ordre des operations pres ; ce qui disparait est la
    # boucle Python qui appelait `np.block` UNE FOIS PAR FREQUENCE ET PAR BLOC
    # -- cent soixante mille fois sur un parcours au plafond, et la moitie du
    # temps de l'analyse y passait. Une fonction qui coute cher se fait
    # appeler moins souvent ; ici elle ne coutait cher que de la facon dont
    # elle etait ecrite.
    omegas = np.asarray(omegas, dtype=float).ravel()
    gamma = 1j * omegas[:, None] * racines[None, :]
    e = np.exp(-gamma * longueur)
    ei = np.exp(gamma * longueur)
    p = np.empty((omegas.size, 2 * n, 2 * n), dtype=complex)
    p[:, :n, :n] = t_c[None, :, :] * e[:, None, :]
    p[:, :n, n:] = t_c[None, :, :] * ei[:, None, :]
    p[:, n:, :n] = w_c[None, :, :] * e[:, None, :]
    p[:, n:, n:] = -w_c[None, :, :] * ei[:, None, :]
    return p @ q_inv


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
    try:
        return -np.linalg.solve(gauche, droite)
    except np.linalg.LinAlgError:
        raise ErreurCrosstalk(
            "Réseau singulier : impossible de calculer les paramètres S.",
            "Vérifiez l'adaptation d'impédance de référence.")


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


# Au-dela de ce saut entre le bout d'un troncon et le plus proche bout du
# suivant, les deux ne se touchent pas : la liste n'est pas dans l'ordre du
# parcours. Un vingtieme de millimetre est en deca de toute tolerance de
# fabrication, et bien au-dela de l'arrondi d'un export.
SAUT_PARCOURS = 0.05            # mm


def _verifier_ordre(sortie, notes):
    """L'abscisse curviligne SUPPOSE que les troncons se suivent. On verifie.

    C'EST LE SEUL CONTROLE QUI MANQUAIT, et il porte sur ce dont tout le reste
    depend : `s` se cumule bout a bout dans l'ordre ou la page envoie les
    objets, et rien ne verifiait que le bout d'un troncon TOUCHE le debut du
    suivant. Une liste mal ordonnee -- un tri par couche, un filtre applique
    apres coup, deux nets concatenes -- donne alors un axe de position FAUX
    sans que rien ne leve : la carte reste lisse, les pics tombent a des
    millimetres qui existent, et aucun chiffre ne parait anormal. C'est
    exactement la classe d'erreur que ce module existe pour empecher, et
    c'etait la derniere a passer.

    UN TRONCON RETOURNE EST DIT A PART, parce que ce n'est pas le meme defaut
    ni le meme geste. Les deux bouts se touchent bien -- l'abscisse reste
    juste --, mais la projection laterale se fait sur une corde parcourue a
    l'envers : le SIGNE du cote s'inverse, et la voisine de gauche se pose a
    droite dans la section. Le couplage garde son niveau, la coupe non.
    """
    sauts, retournes = [], []
    for a, b in zip(sortie, sortie[1:]):
        (xa, ya), (ua, va), la = a["axe"]
        (xb, yb), (ub, vb), lb = b["axe"]
        fin = (xa + ua * la, ya + va * la)
        d_debut = math.hypot(fin[0] - xb, fin[1] - yb)
        d_fin = math.hypot(fin[0] - (xb + ub * lb), fin[1] - (yb + vb * lb))
        if min(d_debut, d_fin) > SAUT_PARCOURS:
            sauts.append((a["s1"], min(d_debut, d_fin)))
        elif d_fin < d_debut:
            retournes.append(a["s1"])
    if sauts:
        notes.append(
            "LE CUIVRE ENVOYÉ N'EST PAS CONTIGU : %d rupture(s) entre deux"
            " tronçons consécutifs (%s). L'abscisse curviligne se cumule dans"
            " l'ORDRE de la liste reçue, et c'est elle qui porte l'axe de la"
            " carte : si les tronçons ne se suivent pas, chaque millimètre"
            " annoncé après la première rupture désigne un autre endroit du"
            " tracé. Rien d'autre ne le signale — la carte reste lisse et les"
            " pics tombent à des abscisses qui existent. Vérifiez que la"
            " sélection est une liaison d'un seul tenant, et qu'elle est"
            " envoyée dans l'ordre du parcours."
            % (len(sauts), " ; ".join("%.2f mm de saut à %.2f mm" % (d, s)
                                      for s, d in sauts[:4])))
    if retournes:
        notes.append(
            "%d tronçon(s) sont parcourus À L'ENVERS (à %s). Les deux bouts se"
            " touchent, donc l'abscisse reste juste ; c'est le SIGNE du côté"
            " qui s'inverse sur ces tronçons-là, et une voisine de gauche s'y"
            " pose à droite dans la section droite. Le niveau de couplage n'en"
            " dépend pas, la dissymétrie gauche/droite de la coupe, si."
            % (len(retournes),
               ", ".join("%.2f mm" % s for s in retournes[:4])))


def _parcours(objets, notes=None):
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
    if notes is not None and len(sortie) > 1:
        _verifier_ordre(sortie, notes)
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


def _projection_sur(axe, autre):
    """(d0, d1) : la portion de l'axe `axe` -- (origine, direction, longueur)
    -- que le troncon `autre` recouvre vu de dessus, en mm depuis l'origine.
    Rend (0, longueur) si `autre` n'a pas d'axe exploitable."""
    (ax, ay), (ux, uy), la = axe
    b = se._axe(autre)
    if b is None:
        return 0.0, la
    (bx, by), (vx, vy), lb = b
    t1 = (bx - ax) * ux + (by - ay) * uy
    t2 = (bx + vx * lb - ax) * ux + (by + vy * lb - ay) * uy
    d0, d1 = max(0.0, min(t1, t2)), min(la, max(t1, t2))
    return (d0, d1) if d1 > d0 else (0.0, la)


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
    largeur_ref = max(p["largeur"] for p in parcours)
    # LA HAUTEUR AU PLAN SE PREND SUR TOUTES LES COUCHES DU PARCOURS, et non
    # sur la seule premiere. Un agresseur qui change de couche change de
    # stratifie -- `_tan_delta` le fait deja pour les pertes --, et lire la
    # hauteur du premier troncon posait le seuil de distance, et surtout
    # l'alerte « aucun plan de reference », sur une couche que la moitie du
    # parcours ne voit jamais.
    #
    # LES DEUX USAGES NE VEULENT PAS LA MEME BORNE, et c'est ce qui rend un
    # `max` global faux. Le seuil de DISTANCE doit MAJORER -- plus la hauteur
    # est grande, plus le champ porte loin, et c'est l'etape 0b qui tranche --,
    # donc il prend la plus grande. La LONGUEUR MINIMALE de longement, elle,
    # ECARTE : la prendre grande rejetterait des longements reels en
    # « frolement », et elle prend donc la plus petite. Une couche SANS plan
    # l'emporte sur tout : elle met les deux a zero -- le seuil s'ouvre au
    # maximum du voisinage, le minimum de longement tombe a trois ecarts -- et
    # elle se fait NOMMER, parce que c'est elle qu'il faut corriger.
    hauteurs = {}
    for p in parcours:
        if p["couche"] not in hauteurs:
            hauteurs[p["couche"]] = se._hauteur_de_couche(
                couches, p["couche"], largeur_ref, p["epaisseur"])
    sans_plan = sorted(c for c, h in hauteurs.items() if not (h > 0))
    hauteur = 0.0 if sans_plan else max(hauteurs.values())
    hauteur_mini = 0.0 if sans_plan else min(hauteurs.values())
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
                    # LES SUPERPOSITIONS SANS PLAN ENTRE LES DEUX COUCHES,
                    # avec ce qu'il faut pour les RESOUDRE : la longueur en
                    # regard, le decalage d'axe a axe, les deux couches et
                    # les deux largeurs. Voir `_superposees`.
                    "superpositions": [],
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
                    # OU, LE LONG DU PARCOURS : la victime projetee sur
                    # l'axe de ce troncon de l'agresseur, ramenee a
                    # l'abscisse du cuivre comme les intervalles lateraux.
                    d0, d1 = _projection_sur(axe, autre)
                    c["superpositions"].append({
                        "longueur": round(recouvrement, 4),
                        "decalage": round(decalage, 4),
                        "couche_agresseur": seg["couche"],
                        "largeur_agresseur": seg["largeur"],
                        "couche_victime": couche_a, "largeur_victime": w_a,
                        "s0": round(seg["s0"] + d0 * seg["echelle"], 4),
                        "s1": round(seg["s0"] + d1 * seg["echelle"], 4)})
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
                else se.LONGEMENT_TRANSVERSE_MIN * (c["distance"]
                                                    + hauteur_mini))
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
              "hauteur_min": round(hauteur_mini, 4),
              # LES COUCHES DU PARCOURS QUI N'ONT PAS DE PLAN, NOMMEES. C'est
              # le renseignement qui manquait : « hauteur = 0 » ne dit pas
              # laquelle des trois couches parcourues est en cause.
              "couches_sans_plan": [se._nom_de_couche(couches, c)
                                    or ("couche %d" % c) for c in sans_plan],
              "couches_parcourues": len(hauteurs),
              "longueur_min_source": "saisi" if saisi_l > 0 else
              "déduit (%g × (écart + %.3f mm de hauteur au plan))"
              % (se.LONGEMENT_TRANSVERSE_MIN, hauteur_mini),
              "couches_adjacentes": adjacentes}
    return candidats, seuils


# ==========================================================================
# ETAPE 0a, SUITE -- UN NET EST UN CONDUCTEUR, MEME QUAND IL LONGE SUR DEUX
# COUCHES
# --------------------------------------------------------------------------
# LA PRESELECTION RANGE PAR (NET, COUCHE), LE RESEAU PAR NET. Chacun a raison
# de son cote, et c'est leur rencontre qui produisait le pire resultat que ce
# module puisse rendre.
#
# LE TABLEAU doit distinguer les couches : une voisine qui longe a plat sur
# Top puis repasse SOUS l'agresseur sur In1 est DEUX situations de dessin,
# mesurees a deux distances, et les fondre effacerait justement ce qu'on veut
# lire. LE RESEAU, lui, n'a pas ce choix : un net est un NOEUD ELECTRIQUE. Lui
# donner deux paires de ports revient a poser deux conducteurs distincts la ou
# il n'y a qu'un fil -- ce qui est faux en soi --, et toute la chaine en aval
# indexe par le NOM du net : `par_net` dans `_matrices_bloc`, `_profils`,
# `profils_espacement`, `_fiche_candidat`, les lignes de la carte, les noms de
# ports, les cases a cocher de la page.
#
# CE QUE CELA DONNAIT, MESURE SUR UN CAS A DEUX CANDIDATS HOMONYMES. Le
# dictionnaire `par_net` ecrasait le doublon ; les rangees de [C] et [L] du
# longement LATERAL etaient attribuees au conducteur VERTICAL ; la victime qui
# couple reellement a 0,15 mm ressortait a -300 dB et « non confirmee », tandis
# que l'autre ligne -- celle que l'avertissement annonce comme « non modelisee,
# elle ressortira au plancher » -- portait les -10,6 dB. Deux chiffres
# parfaitement credibles, sur le mauvais cuivre, dans les deux sens, et
# `_fiche_candidat` rendant la PREMIERE fiche du nom, les deux lignes
# s'affichaient avec la meme distance et la meme couche -- dont une au moins
# etait fausse. Le doublon mangeait en plus une des cinq places de `MAX_VICTIMES`.
#
# ON FUSIONNE DONC PAR NET AVANT DE CONSTRUIRE LE RESEAU, et le tableau garde
# ses lignes par couche. La fiche fusionnee porte l'UNION des intervalles --
# c'est elle qui decoupe la cascade, donc le couplage se fabrique bien aux deux
# endroits --, et les deux natures restent comptees a part : l'avertissement
# « longe aussi tant de millimetres en superposition, non modelisee » tombe
# desormais sur la ligne qui porte le chiffre, au lieu d'un doublon muet.
# ==========================================================================


def _fusionner_nets(candidats, notes, garde=False):
    """Un candidat par NET, l'union de ce que chaque couche a mesure.

    Rend la liste fusionnee, triee par distance. Chaque fiche porte
    `_sources`, les candidats d'origine : le plafond `MAX_VICTIMES` doit
    pouvoir les ecarter DANS LE TABLEAU, qui est la seule chose qu'on lit.
    Cette clef ne sort jamais du module -- rien de ce qui est serialise ne la
    traverse.
    """
    par_net = {}
    for c in candidats:
        par_net.setdefault(c["net"], []).append(c)
    sortie, fusionnes = [], []
    for net, groupe in par_net.items():
        if len(groupe) == 1:
            c = dict(groupe[0])
            c["_sources"] = list(groupe)
            c["couches"] = [c.get("nom_couche") or ("couche %d" % c["couche"])]
            sortie.append(c)
            continue
        # LA COUCHE QUI COMPTE EST CELLE QUE LA SECTION RESOUT : celle du plus
        # long longement LATERAL. Sans elle, le conducteur serait pose en ligne
        # seule avec la largeur et l'epaisseur d'une portion que le solveur ne
        # voit jamais. A defaut de lateral, la plus proche.
        principal = max(groupe, key=lambda c: (_nb(c.get("longueur_laterale")),
                                               -_nb(c.get("distance"))))
        c = dict(principal)
        c["_sources"] = list(groupe)
        lat = sum(_nb(s.get("longueur_laterale")) for s in groupe)
        vert = sum(_nb(s.get("longueur_verticale")) for s in groupe)
        d_lat = [s["distance_laterale"] for s in groupe
                 if s.get("distance_laterale") is not None]
        d_vert = [s["distance_verticale"] for s in groupe
                  if s.get("distance_verticale") is not None]
        c["intervalles"] = [it for s in groupe
                            for it in (s.get("intervalles") or ())]
        c["superpositions"] = [sp for s in groupe
                               for sp in (s.get("superpositions") or ())]
        c["longueur_laterale"] = round(lat, 3)
        c["longueur_verticale"] = round(vert, 3)
        c["distance_laterale"] = min(d_lat) if d_lat else None
        c["distance_verticale"] = min(d_vert) if d_vert else None
        c["type"] = "latéral" if lat > 0 else "vertical"
        # LA LONGUEUR RENDUE EST CELLE DU LONGEMENT QUI COMPTE, comme pour un
        # candidat simple : le lateral des qu'il existe, sans quoi
        # `bande_deduite` prendrait pour « plus court longement » une portion
        # que le reseau ne couple pas.
        c["longueur"] = round(lat if lat > 0 else vert, 3)
        c["distance"] = (c["distance_laterale"] if lat > 0
                         else (c["distance_verticale"] or 0.0))
        c["troncons"] = sum(int(s.get("troncons") or 0) for s in groupe)
        c["blinde"] = bool(lat <= 0 and all(s.get("blinde") for s in groupe))
        c["blinde_verticalement"] = bool(
            vert > 0 and all(s.get("blinde_verticalement") for s in groupe
                             if _nb(s.get("longueur_verticale")) > 0))
        cotes = sorted(set(x for s in groupe for x in (s.get("cotes") or ())))
        c["cotes"] = cotes
        c["deux_cotes"] = len(cotes) > 1
        c["cote"] = ("les deux" if c["deux_cotes"]
                     else ("gauche" if (cotes and cotes[0] > 0) else "droite")
                     if cotes else "")
        if c["intervalles"]:
            poids = sum(i["s1"] - i["s0"] for i in c["intervalles"]) or 1.0
            c["gap_face"] = sum(i["gap_face"] * (i["s1"] - i["s0"])
                                for i in c["intervalles"]) / poids
            c["couture"] = max(i["couture"] for i in c["intervalles"])
        c["longueur_min"] = min(_nb(s.get("longueur_min")) for s in groupe)
        c["couches"] = [s.get("nom_couche") or ("couche %d" % s["couche"])
                        for s in groupe]
        c["retenu"] = True
        c["raison"] = ""
        sortie.append(c)
        fusionnes.append("« %s » (%s)" % (net, ", ".join(c["couches"])))
    sortie.sort(key=lambda c: _nb(c.get("distance")))
    if fusionnes:
        # UNE GARDE N'EST PAS UN CONDUCTEUR DU RESEAU -- elle n'a pas de port --,
        # et lui appliquer la phrase des victimes ferait chercher une paire de
        # ports qui n'existe pas. Le geste est le meme, la raison non.
        notes.append(
            ("Une garde longe sur plusieurs couches, et reste UN seul cuivre :"
             " %s. Les lignes du tableau restent séparées par couche ; la"
             " section droite, elle, ne la pose qu'une fois par côté — une"
             " garde comptée deux fois blinderait sur le papier ce qu'un seul"
             " cuivre tient."
             if garde else
             "Une victime longe sur plusieurs couches, et n'est qu'UN"
             " conducteur : %s. Les lignes du tableau « ce qui longe » restent"
             " SÉPARÉES par couche — ce sont deux situations de dessin,"
             " mesurées à deux distances —, mais le calcul ne pose qu'un seul"
             " conducteur par net : deux conducteurs sur le même nœud"
             " électrique, et le couplage de l'un des deux longements se"
             " lirait sur l'autre. La fiche chiffrée porte l'UNION des"
             " longements, à plat et superposés.")
            % " ; ".join(fusionnes))
    return sortie


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


def decouper(parcours, retenus, notes, fentes=()):
    """Les bornes des blocs, en millimetres le long du parcours.

    LES FENTES SONT DES FRONTIERES, au meme titre qu'un debut de longement ou
    de garde : un bloc doit etre ENTIEREMENT sous plan ou ENTIEREMENT sur la
    decoupe, sans quoi il faudrait choisir laquelle des deux sections lui
    donner -- et l'un des deux choix est faux sur toute la longueur du bloc.
    """
    if not parcours:
        return []
    fin = parcours[-1]["s1"]
    bornes = {0.0, fin}
    for seg in parcours:
        bornes.add(seg["s0"])
        bornes.add(seg["s1"])
    for c in retenus:
        for i in c.get("intervalles") or ():
            bornes.add(i["s0"])
            bornes.add(i["s1"])
    for f in (fentes or ()):
        s0 = _nb(f.get("s"))
        s1 = s0 + _nb(f.get("longueur"), 0.0)
        if 0.0 < s0 < fin:
            bornes.add(s0)
        if 0.0 < s1 < fin:
            bornes.add(s1)
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


def _ligne_seule(couches, couche, largeur, epaisseur, cache, plans_nus=()):
    """(C, L, eps_eff) d'un conducteur qui ne longe rien dans ce bloc.

    SANS MASSE COPLANAIRE : le conducteur est ici hors de tout groupe, et
    l'ecart au plan lateral que la page a mesure valait pour la SELECTION, pas
    pour lui. On le pose donc en ligne nue, ce qui majore legerement son Z0 --
    et cela ne touche que son RETARD PROPRE, pas le couplage, qui est nul dans
    ce bloc par construction.
    """
    nus = tuple(sorted(plans_nus or ()))
    cle = ("seule", couche, round(largeur, 6), round(epaisseur, 6), nus)
    if cle in cache:
        return cache[cle]
    geo, info = se.section_de_couche(couches, couche, largeur, epaisseur,
                                     0.0, None, nus)
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


def _matrices_bloc(couches, seg, presents, conducteurs, refs, couture_max,
                   cache, ecartes, gardes=(), plans_nus=()):
    """[C] et [L] globales d'un bloc (F/m, H/m), plus eps_eff par conducteur.

    `conducteurs` est la liste GLOBALE, dans l'ordre des ports du reseau :
    l'agresseur de reference d'abord, puis les candidats retenus. `presents`
    dit lesquels longent l'agresseur sur ce bloc, avec leur position laterale
    LOCALE -- c'est elle, et non la moyenne du longement, qui est resolue ici.

    `plans_nus` NOMME LES PLANS QUI N'ONT PAS DE CUIVRE SOUS CE BLOC-LA. Ils
    sont dans l'empilage, mais pas ici -- une decoupe, une fente, un plan qui
    s'arrete avant. Sans eux, la section de ce bloc etait celle de l'empilage
    DECLARE, et un longement survolant une decoupe rendait exactement le meme
    couplage qu'un longement sur plan plein : deux configurations d'essai qui
    ne different que par le cuivre du plan sortaient au bit pres identiques.
    C'est le seul endroit ou la geometrie LOCALE du plan entre dans [C] et [L],
    et elle doit y entrer avant la clef de cache -- sinon le premier bloc
    resolu repondrait pour tous les autres.

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
        nus = tuple(sorted(plans_nus or ()))
        hauteur = se._hauteur_de_couche(couches, seg["couche"], seg["largeur"],
                                        seg["epaisseur"], nus)
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
               round(scene["couture_g"], 3), round(scene["couture_d"], 3),
               nus)
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
                                              e_g, e_d, nus)
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
            couches, cond["couche"], cond["largeur"], cond["epaisseur"], cache,
            plans_nus)
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


# ==========================================================================
# LE COUPLAGE QUI NE DEMANDE AUCUN SIGNAL
# --------------------------------------------------------------------------
# DEUX COEFFICIENTS SORTENT DE [C] ET [L] SEULES, et ils ne dependent ni du
# front, ni de l'amplitude, ni de la bande analysee :
#
#     Kb = 1/4 (Cm/C0 + Lm/L0)      sans dimension
#     Kf = 1/2 (Lm/L0 - Cm/C0)      sans dimension, a multiplier par T_d/t_r
#
# CE QUE Kb EST EXACTEMENT : le NEXT SATURE -- la fraction de l'amplitude que
# le couplage arriere atteint des que le longement depasse v*t_r/2. Sous la
# saturation, le NEXT vaut Kb * 2*T_d/t_r : c'est `niveau2` qui tranche.
#
# LE FEXT VARIE COMME 1/t_r : Kf * T_d est une DUREE que la geometrie fixe
# entierement, et le front la convertit en niveau.
#
# EN MILIEU HOMOGENE, Kf S'ANNULE. Une triplaque a Lm/L0 = Cm/C0 exactement :
# pas de FEXT en interne. Le solveur le retrouve seul -- -7e-6 sur une
# triplaque a 0,6 mm d'ecart, contre +0,021 pour le meme dessin en microruban
# --, et c'est le meilleur controle qu'on ait de ces deux lignes de calcul.
#
# LA CONVENTION DE [C] EST CELLE DE MAXWELL, et elle se verifie a l'oeil : les
# termes hors diagonale sont NEGATIFS. La mutuelle vaut donc -c[i][j].
#
# ET C0 EST LA DIAGONALE DE MAXWELL, c[i][i] -- la capacite « chargee », celle
# de la ligne quand toutes les autres sont a la masse. Ce n'est PAS la
# capacite ligne-a-masse (diagonale moins les mutuelles), qu'une premiere
# version employait en croyant corriger une sous-estimation. Le controle est
# sans appel et ne demande aucune reference exterieure : en milieu HOMOGENE,
# [L] = mu*eps*[C]^-1, d'ou Lm/L0 = Cm/c[i][i] EXACTEMENT, et Kf = 0 a tout
# ecart. Avec la capacite ligne-a-masse, Kf derivait jusqu'a -0,10 en
# triplaque a 0,05 mm d'ecart -- un FEXT fabrique par la formule --, et Kb
# etait surestime d'autant plus que le couplage etait serre. Le controle a
# 0,6 mm d'ecart ne le voyait pas : a si faible couplage, les deux
# definitions se confondent.
# ==========================================================================


def coefficients_couple(c_mat, l_mat, i, j):
    """(Kb, Kf) du couple (i, j), tires de [C] et [L] et de rien d'autre.

    REND (0, 0) QUAND LA SECTION N'A PAS ETE RESOLUE -- les matrices sont
    alors diagonales --, et ce zero-la n'est pas une mesure de decouplage. Le
    distinguer est le travail de l'appelant : `mesure`, sur chaque bloc, et
    `non_couples` sur l'ensemble, portent precisement cette difference.
    """
    c_mat = np.asarray(c_mat, dtype=float)
    l_mat = np.asarray(l_mat, dtype=float)
    l0, lm = float(l_mat[i, i]), float(l_mat[i, j])
    # C0 EST LA DIAGONALE DE MAXWELL -- voir plus haut, et le banc qui le
    # verifie en triplaque a ecart serre.
    cm = -float(c_mat[i, j])
    c0 = float(c_mat[i, i])
    if not (l0 > 0) or not (c0 > 0):
        return 0.0, 0.0
    rl, rc = lm / l0, cm / c0
    return 0.25 * (rc + rl), 0.5 * (rl - rc)


# ==========================================================================
# LE NIVEAU 2 : LE PIC DE BRUIT RELATIF, SANS TENSION NI PROTOCOLE
# --------------------------------------------------------------------------
# Un echelon d'agresseur UNITAIRE, un front t_r, des lignes ADAPTEES : le
# NEXT et le FEXT sortent alors en fraction de l'agresseur, et rien d'autre
# n'est a connaitre. Ce sont les formules des lignes faiblement couplees --
# les memes que `analyse_carte.diaphonie` pour la carte entiere, et c'est
# voulu : deux outils qui jugent le meme longement doivent rendre le meme
# chiffre.
#
# LE COUPLAGE PEUT VARIER LE LONG DU LONGEMENT, et la somme le suit : chaque
# morceau (bloc de section constante, ou superposition) apporte son Kb.dT et
# son Kf.dT. Avec un couplage uniforme, Sum(Kb.2dT) = Kb.2T_d et l'on
# retrouve exactement les deux cas du NEXT :
#     2 T_d >= t_r  ->  NEXT = Kb              (sature)
#     2 T_d <  t_r  ->  NEXT = Kb . 2T_d / t_r  (non sature)
# Avec un couplage qui varie, la saturation se lit sur le plus fort des Kb :
# aucun morceau ne peut renvoyer plus que son propre plafond.
# ==========================================================================


def statut(valeur, orange=SEUIL_ORANGE, rouge=SEUIL_ROUGE):
    """« vert » sous le seuil orange, « rouge » au-dela du rouge, « orange »
    entre les deux -- les deux seuils en fraction de l'agresseur."""
    if valeur > rouge:
        return "rouge"
    if valeur >= orange:
        return "orange"
    return "vert"


ORDRE_STATUT = {"vert": 0, "orange": 1, "rouge": 2}


def pire_statut(statuts):
    """Le plus grave d'une liste de statuts ; « vert » pour une liste vide."""
    return max(statuts or ["vert"], key=lambda s: ORDRE_STATUT.get(s, 0))


def niveau2(morceaux, t_r, orange=SEUIL_ORANGE, rouge=SEUIL_ROUGE):
    """Le diagnostic d'une paire, a partir de ses morceaux couples.

    `morceaux` : [(Kb, Kf, dT)] -- les deux coefficients de chaque portion
    couplee et le retard de la victime sur cette portion, en secondes.
    `t_r` : le front, en secondes. Rend le tuple de diagnostic sous forme de
    dictionnaire : k_total, NEXT et FEXT (fraction, % et dB), T_d, la
    saturation et les trois statuts.
    """
    t_r = float(t_r) if t_r and t_r > 0 else TR_DEFAUT
    kb_max = max([float(m[0]) for m in morceaux] or [0.0])
    kf_max = max([abs(float(m[1])) for m in morceaux] or [0.0])
    s_kb = sum(float(m[0]) * float(m[2]) for m in morceaux)
    s_kf = sum(float(m[1]) * float(m[2]) for m in morceaux)
    td = sum(float(m[2]) for m in morceaux)
    non_sature = 2.0 * s_kb / t_r
    sature = bool(kb_max > 0 and non_sature >= kb_max)
    nxt = kb_max if sature else non_sature
    fxt = abs(s_kf) / t_r
    s_n, s_f = statut(nxt, orange, rouge), statut(fxt, orange, rouge)
    return {
        # LE COUPLAGE GEOMETRIQUE PUR, au morceau le plus serre :
        # 1/2 (Cm/C11 + Lm/L11), soit deux fois le Kb.
        "k_total": round(2.0 * kb_max, 6),
        "kb": round(kb_max, 6), "kf": round(kf_max, 6),
        "td_s": td, "td_ps": round(1e12 * td, 3),
        # LE FRONT AU-DESSOUS DUQUEL LE NEXT SATURE : 2 T_d pour un couplage
        # uniforme, moins quand il culmine sur une partie du longement.
        "t_sature_ps": round(1e12 * 2.0 * s_kb / kb_max, 3) if kb_max > 0
        else 0.0,
        "t_r": t_r, "sature": sature,
        "next": round(nxt, 6), "next_pc": round(100.0 * nxt, 3),
        "next_db": round(_db(nxt), 2),
        "fext": round(fxt, 6), "fext_pc": round(100.0 * fxt, 3),
        "fext_db": round(_db(fxt), 2),
        "statut_next": s_n, "statut_fext": s_f,
        "statut": pire_statut([s_n, s_f])}


def front_de_classe(classe, tr_classes=None):
    """(t_r, source) du front d'un net de cette classe.

    Les fronts du panneau de verification passent devant ceux d'origine ;
    une classe sans front -- masse, alimentation, inconnue -- se juge comme
    « Lent », comme dans `analyse_carte`.
    """
    fronts = dict(TR_CLASSES)
    fronts.update(tr_classes or {})
    c = str(classe or "")
    if c not in fronts:
        c = "Lent"
    t_r = _nb(fronts.get(c), 0.0)
    if not (t_r > 0):
        return TR_DEFAUT, "front de référence (1 ns)"
    return t_r, "déduit de la classe « %s »" % c


def geometrie_superposee(couches, i, j):
    """Ce qu'il faut pour resoudre deux couches de cuivre SUPERPOSEES.

    Rend (h_i, h_j, b_mm, eps_r) -- les hauteurs de l'axe de chaque couche
    au-dessus du plan de reference du dessous, l'ecart entre les deux plans
    qui encadrent la paire (None s'il n'y en a qu'un), et la permittivite
    moyenne entre eux --, ou None quand aucun plan ne les reference. MEME
    LECTURE QUE `analyse_carte.diaphonie` (larges faces).
    """
    i, j = sorted((int(i), int(j)))
    cu = [k for k, c in enumerate(couches) if c.get("type") == "copper"]
    if i not in cu or j not in cu:
        return None

    def voisins(k):
        r = cu.index(k)
        haut = next((q for q in reversed(cu[:r])
                     if couches[q].get("role") == "plane"), None)
        bas = next((q for q in cu[r + 1:]
                    if couches[q].get("role") == "plane"), None)
        return [q for q in (haut, bas) if q is not None]

    def ep(a, b):
        lo, hi = sorted((a, b))
        return sum(_nb(c.get("thickness"), 0.0) for c in couches[lo + 1:hi])

    refs = set(voisins(i)) | set(voisins(j))
    if not refs:
        return None
    dessous = [q for q in refs if q > j]
    p = min(dessous) if dessous else max(refs)
    dessus = [q for q in refs if q < i] if dessous else []
    b_mm = ep(max(dessus), p) if dessus else None
    h_i = ep(i, p) + _nb(couches[i].get("thickness"), 0.035) / 2.0
    h_j = ep(j, p) + _nb(couches[j].get("thickness"), 0.035) / 2.0
    lo, hi = min(i, j, p), max(i, j, p)
    ers = [_nb(c.get("epsilon_r"), 0.0) for c in couches[lo:hi + 1]
           if c.get("type") == "dielectric" and _nb(c.get("epsilon_r"), 0.0) > 0]
    return h_i, h_j, b_mm, (sum(ers) / len(ers) if ers else 4.3)


def kb_superposees(h_v, h_a, x_lat, w_v, w_a, b_mm=None):
    """Kb de deux rubans a leurs hauteurs (mm), decales de x_lat d'axe a axe.

    `ligne_mom.section_deux_niveaux`, milieu homogene : Kf y est nul, seul Kb
    compte. Leve si la geometrie sort du domaine du solveur.
    """
    r = tl.section_deux_niveaux(
        [{"x": 0.0, "y": h_v * 1e-3, "w": w_v * 1e-3},
         {"x": x_lat * 1e-3, "y": h_a * 1e-3, "w": w_a * 1e-3}],
        b=b_mm * 1e-3 if b_mm else None)
    return coefficients_couple(r["c"], r["l"], 0, 1)[0]


def _superposees(couches, fiche, cache, notes):
    """Les morceaux couples d'une victime SUPERPOSEE a l'agresseur.

    Rend [(Kb, 0, dT, longueur_mm, s0, s1)] -- un par superposition sans plan
    entre les deux couches, avec sa plage le long du parcours --, ou une liste
    vide. Une superposition que le solveur
    refuse est dite dans les notes plutot que comptee nulle.
    """
    out = []
    for sp in fiche.get("superpositions") or ():
        # LA COUCHE ET LA LARGEUR DE LA SUPERPOSITION, pas celles de la fiche :
        # une fiche fusionnee porte la couche de son longement A PLAT.
        couche_v = int(sp.get("couche_victime", fiche["couche"]))
        w_v = _nb(sp.get("largeur_victime"), fiche["largeur"])
        geo = geometrie_superposee(couches, sp["couche_agresseur"], couche_v)
        if geo is None:
            continue
        h_lo, h_hi, b_mm, er = geo
        haut_agr = int(sp["couche_agresseur"]) < couche_v
        h_a, h_v = (h_lo, h_hi) if haut_agr else (h_hi, h_lo)
        cle = (round(h_v, 4), round(h_a, 4), round(sp["decalage"], 3),
               round(w_v, 3), round(sp["largeur_agresseur"], 3),
               b_mm and round(b_mm, 4))
        if cle not in cache:
            try:
                cache[cle] = kb_superposees(h_v, h_a, sp["decalage"], w_v,
                                            sp["largeur_agresseur"], b_mm)
            except Exception as exc:                   # noqa: BLE001
                cache[cle] = None
                notes.append("« %s » : superposition non résolue (%s)."
                             % (fiche["net"], exc))
        kb = cache[cle]
        if kb is None:
            continue
        longueur = _nb(sp.get("longueur"), 0.0)
        out.append((kb, 0.0, longueur * 1e-3 * math.sqrt(er) / C_0, longueur,
                    _nb(sp.get("s0"), 0.0), _nb(sp.get("s1"), 0.0)))
    return out


def sections_couplees(couches, parcours, retenus, refs, t_r, notes,
                      gardes=(), fentes=()):
    """[C] et [L] bloc par bloc le long du parcours, et ce qu'on en tire.

    Rend `infos` -- avec les BLOCS (bornes, Kb et Kf de chaque voisine contre
    l'agresseur) et le PROFIL DE RETARD de chaque conducteur, le retard cumule
    en fonction de l'abscisse : c'est lui qui donne T_d, bloc par bloc, quand
    la piste change de largeur, d'ecart ou de couche en cours de route.

    `t_r` ne sert qu'a decider si une garde ou un plan arrose est TENU : le
    plus grand trou de couture tolere est lambda/10 au genou du front.

    `fentes` EST LA GEOMETRIE DU PLAN, celle que l'empilage ne porte pas. Chaque
    entree dit sur quelle portion du parcours quel plan n'a pas de cuivre de
    retour ; les blocs concernes se resolvent alors SANS ce plan-la, et
    retombent sur le suivant de l'empilage -- ou sur rien, et ce bloc est
    declare non calculable plutot que calcule sur une reference imaginaire.

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
    if n > MAX_PORTS // 2:
        raise ErreurCrosstalk(
            "%d conducteurs : le maximum est %d." % (n, MAX_PORTS // 2))

    # LES BORNES DE BLOC SUIVENT AUSSI LES GARDES : une piste de masse qui
    # commence a mi-bloc y serait sinon posee sur toute sa longueur, et le
    # blindage qu'elle apporte s'etalerait la ou elle n'est pas.
    bornes = decouper(parcours, list(retenus) + list(gardes), notes, fentes)
    # LES FENTES, RAMENEES A CE QU'IL FAUT POUR UN BLOC : un intervalle et les
    # noms des plans qui y manquent. La prose de `quoi` reste a la fiche ; ici
    # on ne lit que des noms de couche, parce qu'un nom de couche est ce que
    # `section_de_couche` compare.
    zones_nues = []
    for f in (fentes or ()):
        noms = [str(x) for x in (f.get("plans") or ()) if x]
        if not noms:
            continue
        s0 = _nb(f.get("s"))
        zones_nues.append((s0, s0 + _nb(f.get("longueur"), 0.0), noms))
    nus_vus = set()
    couture_max = se._couture_max(t_r)
    cache, ecartes = {}, {}
    # LE PROFIL DE RETARD, un point par borne de bloc : c'est l'axe de position
    # de la carte, et il se construit ici parce que c'est ici qu'on connait la
    # permittivite effective de chaque conducteur bloc par bloc.
    abscisses = [0.0]
    retards = [[0.0] for _ in range(n)]
    blocs, muets = [], []
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
        plans_nus = set()
        for z0, z1, noms in zones_nues:
            if z0 - TOL_BORNE <= milieu <= z1 + TOL_BORNE:
                plans_nus.update(noms)
        nus_vus.update(plans_nus)
        c_g, l_g, eps, couples_bloc, bords_bloc = _matrices_bloc(
            couches, seg, presents, conducteurs, refs, couture_max, cache,
            ecartes, gardes_bloc, plans_nus)
        for bd in bords_bloc:
            etat = etats_bords.setdefault(
                bd["cote"], {"cote": bd["cote"], "longueur": 0.0,
                             "couture": 0.0})
            etat["longueur"] += b - a
            etat["couture"] = max(etat["couture"], _nb(bd.get("couture"), 0.0))
        longueur = (b - a) * 1e-3
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
        # LES DEUX COEFFICIENTS DU BLOC, victime par victime contre
        # l'agresseur. Ils ne coutent RIEN -- [C] et [L] sont deja la -- et ils
        # ne dependent d'aucun reglage de bande : c'est ce qui permet au mode
        # simple de repondre sans qu'on lui donne un signal, et c'est aussi ce
        # qui fait que les deux modes ne peuvent pas se contredire sur le
        # dessin. `mesure` distingue le zero CALCULE du zero faute de section
        # resolue -- la meme distinction que `non_couples`, portee au bloc.
        #
        # `presente` EST L'AUTRE MOITIE DE CETTE DISTINCTION. Une voisine qui
        # ne longe pas ce bloc n'y est pas couplee non plus, et c'est un zero
        # LEGITIME -- elle est loin. Sans ce drapeau, « non mesure » valait
        # sur tout bloc ou elle n'etait pas, et chaque voisine qui ne longe
        # qu'une partie du parcours etait dite « section non resolue ».
        coef = {}
        nets_presents = set(p["net"] for p in presents)
        for g in range(1, n):
            kb, kf = coefficients_couple(c_g, l_g, 0, g)
            coef[conducteurs[g]["net"]] = {
                "kb": round(kb, 6), "kf": round(kf, 6),
                "presente": conducteurs[g]["net"] in nets_presents,
                "mesure": bool(0 in couples_bloc and g in couples_bloc)}
        blocs.append({"s0": round(a, 4), "s1": round(b, 4),
                      "voisines": [p["net"] for p in presents],
                      "couplage": coef,
                      "gardes": [g["net"] for g in gardes_bloc] if presents
                      else []})

    if nus_vus:
        notes.append(
            "Plan de référence écarté LOCALEMENT sur au moins un bloc : %s"
            " n'a pas de cuivre de retour sous cette portion du parcours, et"
            " la section y a donc été résolue sans lui. C'est la géométrie du"
            " plan qui entre ici dans [C] et [L], pas seulement l'empilage :"
            " deux portions de même dessin mais dont l'une survole une"
            " découpe ne rendent plus le même couplage."
            % ", ".join("« %s »" % n for n in sorted(nus_vus)))
    for net, raison in ecartes.items():
        if net == "_section":
            notes.append("Section droite non résoluble sur au moins un bloc :"
                         " %s." % raison)
            continue
        notes.append("« %s » : %s." % (net, raison))
    infos = {"conducteurs": conducteurs, "blocs": blocs,
             "abscisses": abscisses, "retards": retards,
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
    return infos


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


def _tr_signal(analyse):
    """Le temps de montee de l'analyse, en secondes, et d'ou il sort.

    IL EST TOUJOURS CONNU EN NIVEAU 2 : saisi, deduit de la classe du net
    agresseur, ou -- faute de tout -- le front de reference de 1 ns. C'est le
    MEME front pour le NEXT, le FEXT et le seuil de couture : une fiche qui
    compare deux chiffres sortis de deux hypotheses ne compare rien.
    """
    t_r = _nb((analyse or {}).get("temps_montee"), 0.0)
    if t_r > 0:
        return t_r, str((analyse or {}).get("source_tr") or "saisi")
    return TR_DEFAUT, "front de référence (1 ns)"


def _seuil_couture(analyse):
    """Le plus grand trou de couture acceptable, en mm, et d'ou il sort.

    LAMBDA/10 AU GENOU DU FRONT (`se._couture_max`) : un cuivre qui resonne
    a 44 GHz ne gene pas un front d'une nanoseconde, qui n'y porte rien. Rend
    (seuil, source, regle ecartee) ; la troisieme reste vide -- il n'y a plus
    de bande d'analyse a confronter au front.
    """
    t_r, source = _tr_signal(analyse)
    par_front = se._couture_max(t_r)
    if not (par_front > 0):
        return 0.0, "aucune règle applicable", ""
    return par_front, "front (%s)" % source, ""


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

# Au-dela de ce nombre, une liste de gestes cesse d'etre une liste de gestes :
# on la lit comme un rapport d'audit et l'on n'en fait aucun.
ACTIONS_MAX = 6


def actions(risques, masse, desac, couples, seuil_risque, blindage=None,
            omises=None, borne=False):
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

    LE CUIVRE DE MASSE QU'ON A ROUTE ET QU'ON N'A PAS COUSU DONNE UN GESTE, et
    c'est le plus rentable de la liste. `blindage` porte ce que la coupe a
    reellement pose : les pistes de garde, la longueur sur laquelle chacune
    FLOTTE faute de vias, et les bords de plan arrose qui ont perdu leur masse.
    Ces deux mesures levaient un avertissement -- donc une phrase a lire -- et
    ne produisaient AUCUN geste, alors qu'elles sont les seules du fichier a
    designer un cuivre qui existe deja et qu'il suffit de percer. Une garde
    flottante ne blinde pas : elle TRANSFERE, et le couplage peut en devenir
    pire qu'en l'absence de tout cuivre -- l'ecarter de la liste des gestes
    revenait a taire la correction la moins chere du lot.

    ET LA TRONCATURE SE DIT. `ACTIONS_MAX` coupe la liste pour qu'elle reste
    une consigne et non un inventaire ; elle la coupait EN SILENCE, si bien
    qu'un dessin a huit gestes en montrait six et que les deux autres
    n'existaient nulle part. `omises`, quand on le passe, recoit le compte et
    la nature de ce qui a ete retire -- meme parti pris que le `refus` de
    `zones_risque` : une commande qui disparait sans un mot est un bug aux yeux
    de celui qui s'en servait la veille.
    """
    gestes = []
    zones = (masse or {}).get("zones") or []
    vain = bool((masse or {}).get("vain"))

    # (1) CE QUE LE DESSIN EXPLIQUE : le geste le plus direct qui soit.
    # L'EFFET D'UNE PLAGE EST SON NIVEAU FOIS SA LONGUEUR : sous la
    # saturation, le NEXT qu'elle fabrique vaut Kb*2*T_d/t_r, et T_d est
    # proportionnel a la longueur. Trier par la seule crete placait une
    # tranche de 0,35 mm devant la section de 3,4 mm de la meme voisine -- et
    # la coupe a six gestes emportait alors la section, qui etait le geste.
    def _effet(z):
        crete = 10.0 ** (_nb(z.get("niveau_db"), -300.0) / 20.0)
        return -crete * max(_nb(z.get("s1")) - _nb(z.get("s0")), 0.0)
    amber = sorted([z for z in (risques or []) if z.get("justifie")],
                   key=_effet if borne else
                   (lambda z: -_nb(z.get("niveau_db"), -300.0)))
    for z in amber:
        # LE CHIFFRE EST LE NEXT LOCAL, en % de l'agresseur.
        gestes.append({
            "quoi": "écarter", "cible": z["victime"],
            "ou": "de %.2f à %.2f mm" % (z["s0"], z["s1"]),
            "pourquoi": ("le NEXT local y atteint %.2f %% de l'agresseur"
                         " et le profil d'espacement l'explique : c'est un"
                         " resserrement réel." % (100.0 * 10.0 ** (
                             _nb(z.get("niveau_db"), -300.0) / 20.0))
                         if borne else
                         "le couplage y atteint %.1f dB et le profil"
                         " d'espacement l'explique : c'est un resserrement"
                         " réel." % _nb(z.get("niveau_db"), 0.0))})

    # (2) LE CUIVRE DE MASSE DEJA ROUTE, ET QU'IL SUFFIT DE PERCER. Il passe
    # AVANT les zones de vigilance du plan : celles-ci designent un endroit ou
    # le plan est douteux, celui-ci designe un conducteur qu'on a dessine expres
    # pour blinder et qui, faute de vias, fait l'inverse. C'est le seul geste de
    # la liste dont on connaisse le sens de l'effet a coup sur.
    for g in (blindage or {}).get("gardes") or []:
        if not _nb(g.get("longueur_flottante")) > 0:
            continue
        gestes.append({
            "quoi": "coudre la garde", "cible": g.get("net", "?"),
            "ou": "sur %.2f mm des %.2f mm qu'elle longe"
                  % (_nb(g.get("longueur_flottante")), _nb(g.get("longueur"))),
            "pourquoi": "son plus grand trou de couture vaut %.2f mm, au-delà"
                        " de ce que le front autorise : cette garde est posée"
                        " FLOTTANTE dans la coupe. Un tel cuivre ne blinde pas,"
                        " il TRANSFÈRE — le couplage peut y être PIRE qu'en"
                        " l'absence de toute garde. La percer est la correction"
                        " la moins chère de cette liste."
                        % _nb(g.get("couture"))})
    for b0 in (blindage or {}).get("bords_non_cousus") or []:
        gestes.append({
            "quoi": "coudre le plan arrosé", "cible": "bord %s"
                    % b0.get("cote", "?"),
            "ou": "sur %.2f mm" % _nb(b0.get("longueur")),
            "pourquoi": "le plus grand trou entre deux vias y vaut %.2f mm :"
                        " l'effet coplanaire de ce côté a été ANNULÉ dans les"
                        " sections concernées plutôt que de faire cadeau d'une"
                        " masse idéale. Le couplage rendu est celui d'un bord"
                        " SANS masse à portée."
                        % _nb(b0.get("couture"))})

    # (3) LE PLAN DE REFERENCE, quand il est mis en cause.
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

    # (4) CE QUE RIEN N'EXPLIQUE : un endroit a REGARDER, pas un geste. On le
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

    # LA COUPE SE DIT. Six gestes tiennent comme une consigne ; au-dela on
    # relit un inventaire et l'on n'en fait aucun. Mais couper sans le dire
    # laissait deux gestes mesures n'exister nulle part -- ni a l'ecran, ni
    # dans le rapport exporte, qui est pourtant le fichier qu'on emporte.
    # UNE NATURE DE GESTE NE DISPARAIT PAS DERRIERE UNE AUTRE. Couper aux six
    # premiers laissait six « ecarter » et emportait « coudre le plan » : or
    # un geste d'une autre nature apprend plus que le septieme du meme genre.
    # On garde donc le premier de chaque nature, puis on complete dans
    # l'ordre -- l'ordre d'affichage restant celui de l'effet.
    if len(gestes) > ACTIONS_MAX:
        garder, natures = [], set()
        for k, g in enumerate(gestes):
            if g["quoi"] not in natures and len(garder) < ACTIONS_MAX:
                natures.add(g["quoi"])
                garder.append(k)
        for k in range(len(gestes)):
            if len(garder) >= ACTIONS_MAX:
                break
            if k not in garder:
                garder.append(k)
        garder = sorted(garder)
        restant = [g for k, g in enumerate(gestes) if k not in garder]
        gestes = [gestes[k] for k in garder] + restant
    if omises is not None and len(gestes) > ACTIONS_MAX:
        restant = gestes[ACTIONS_MAX:]
        quoi = []
        for g in restant:
            if g["quoi"] not in quoi:
                quoi.append(g["quoi"])
        omises.append({"nombre": len(restant), "natures": quoi,
                       "detail": "%d geste(s) de plus ne sont pas listés"
                                 " ici — %s. Le fichier .csv et le rapport"
                                 " portent les mesures dont ils sortent."
                                 % (len(restant), ", ".join(quoi))})
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


# ==========================================================================
# L'ORCHESTRATION
# ==========================================================================

def _reglages(doc):
    """Les reglages du document, completes par les defauts, et VERIFIES.

    Un reglage hors domaine n'est pas ramene en silence : il leve. Un seuil
    positif en decibels ou des seuils DRC inverses sont des saisies, pas des
    approximations, et les corriger sans le dire ferait afficher un resultat
    obtenu sous d'autres regles que celles qu'on croit avoir demandees.
    """
    r = dict(DEFAUTS)
    donnes = doc.get("reglages") or {}
    if not isinstance(donnes, dict):
        raise ErreurCrosstalk("Le champ « reglages » n'est pas un objet.")
    r.update(donnes)
    if _nb(r.get("seuil_db"), 0.0) > 0:
        raise ErreurCrosstalk(
            "Le seuil de confirmation vaut %g dB, donc un gain."
            % _nb(r.get("seuil_db")),
            "Un couplage est une atténuation : le seuil est négatif"
            " (-40 dB par défaut).")
    # LE FRONT : saisi s'il est positif, deduit de la classe sinon (voir
    # `front_de_classe`). Un front negatif n'est pas un front.
    r["t_r"] = _nb(r.get("t_r"), 0.0)
    if r["t_r"] < 0:
        raise ErreurCrosstalk(
            "Le temps de montée vaut %g s." % r["t_r"],
            "Laissez le champ vide pour le déduire de la classe du net.")
    classes = r.get("tr_classes") or {}
    r["tr_classes"] = (dict((str(k), _nb(v, 0.0)) for k, v in classes.items()
                            if _nb(v, 0.0) > 0)
                       if isinstance(classes, dict) else {})
    # LES SEUILS DRC, EN FRACTIONS : orange <= rouge, tous deux dans ]0 ; 1[.
    orange = _nb(r.get("seuil_orange"), SEUIL_ORANGE)
    rouge = _nb(r.get("seuil_rouge"), SEUIL_ROUGE)
    if not (0.0 < orange <= rouge < 1.0):
        raise ErreurCrosstalk(
            "Seuils DRC incohérents : orange %g %%, rouge %g %%."
            % (100.0 * orange, 100.0 * rouge),
            "Il faut 0 < orange ≤ rouge < 100 % (3 % et 7 % par défaut).")
    r["seuil_orange"], r["seuil_rouge"] = orange, rouge
    # LE SEUIL DE RISQUE EST UNE FRACTION D'UN MAXIMUM : hors de ]0 ; 1[, il ne
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
    return r


def _doc_valide(doc):
    """Verifie le document et rend (couches, objets, analyse, agresseurs)."""
    if not isinstance(doc, dict):
        raise ErreurCrosstalk("Le document envoyé n'est pas un objet JSON.")
    if doc.get("format") != FORMAT:
        raise ErreurCrosstalk(
            "Format inattendu : « %s » au lieu de « %s »."
            % (doc.get("format") or "absent", FORMAT))
    # UN DOCUMENT QUI PORTE ENCORE UNE MATRICE EXTERIEURE EST REFUSE, ET NON
    # IGNORE : la page croirait avoir fait calculer son fichier.
    externes = [nom for nom in ("touchstone", "touchstone_ports",
                                "mapping_confirme") if doc.get(nom)]
    if externes:
        raise ErreurCrosstalk(
            "Le document porte %s : cette analyse n'accepte pas de matrice"
            " S venue de l'extérieur."
            % ", ".join("« %s »" % n for n in externes),
            "Le couplage se calcule ici, à partir du design. Retirez ces"
            " champs.")
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
    return couches, objets, agresseurs


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


def _avertir_masse(masse, avert, graves):
    """Ce que le controle du plan de masse a trouve, dit AVANT la carte :
    ce sont des CAUSES possibles des pics qu'elle montre."""
    zones = masse.get("zones") or []
    couture = [z for z in zones if z["type"] == "couture"]
    fentes = [z for z in zones if z["type"] == "fente"]
    transitions = [z for z in zones if z["type"] == "transition"]
    if couture:
        avert.append("PAS DE COUTURE INSUFFISANT sur %d zone(s) : le plus"
                     " grand trou vaut %.2f mm pour un seuil de %.2f mm (%s)."
                     " Le cuivre de masse y flotte au genou du front : il ne"
                     " blinde plus, il TRANSFÈRE. À lire AVANT la carte —"
                     " c'est une cause possible des pics qu'elle montre."
                     % (len(couture), max(z["pas"] for z in couture),
                        masse["seuil"], masse["source"]))
    if masse.get("vain"):
        _grave(avert, graves,
               "zones de vigilance sur %.0f %% du parcours : y tomber"
               " n'explique rien" % (100 * _nb(masse.get("couvert"), 0.0)),
               "LES ZONES DE VIGILANCE COUVRENT %.0f %% DU PARCOURS : « une"
               " zone tombe au même endroit que ce pic » n'apprend donc plus"
               " rien — une abscisse tirée au hasard en rencontrerait une"
               " aussi souvent. Cousez le plan pour rouvrir la question."
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
    couches, objets, nets_agresseurs = _doc_valide(doc)
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

    parcours = _parcours(objets_ref, notes)
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
        _sans = seuils.get("couches_sans_plan") or []
        _grave(
            avert, graves,
            "aucun plan de référence sous « %s » dans l'empilage" % principal,
            "AUCUN PLAN DE RÉFÉRENCE SOUS « %s » : %s n'a pas de"
            " plan dans l'empilage déclaré. Tout ce qui suit le suppose — le"
            " seuil de distance se déduit de la hauteur au plan, et [C] et [L]"
            " sortent d'une section droite qui n'existe pas sans référence."
            " Le seuil de présélection a donc été porté au maximum du"
            " voisinage plutôt que réduit à trois largeurs de piste, et le"
            " couplage, lui, ne pourra pas être calculé sur les blocs"
            " concernés : il ressortira au plancher, ce qui n'est PAS une"
            " mesure de découplage. Vérifiez l'empilage, ou le rôle des"
            " couches de plan."
            % (principal,
               ("la couche « %s »" % _sans[0]) if len(_sans) == 1 else
               ("les couches %s" % ", ".join("« %s »" % n for n in _sans))
               if _sans else
               ("la couche « %s »"
                % (se._nom_de_couche(couches, parcours[0]["couche"])
                   or ("couche %d" % parcours[0]["couche"])))))
    # LES GARDES ROUTEES, A COTE DES VICTIMES ET JAMAIS A LEUR PLACE. Elles ne
    # sont pas « retenues » -- elles n'ont pas de port, pas de courbe, pas de
    # ligne dans le tableau --, et elles entrent pourtant dans chaque section
    # qu'elles longent. Sans elles, une piste de masse tracee a la main entre
    # l'agresseur et sa victime ne servait a rien dans le calcul.
    # UN NET EST UN CONDUCTEUR : on fusionne AVANT le plafond, sans quoi un
    # doublon de couches mangerait une des cinq places chiffrées.
    gardes = _fusionner_nets([c for c in candidats if c.get("garde_active")],
                             notes, garde=True)
    retenus = _fusionner_nets([c for c in candidats if c["retenu"]], notes)
    if len(retenus) > MAX_VICTIMES:
        for c in retenus[MAX_VICTIMES:]:
            # LE MOTIF SE POSE SUR LES FICHES D'ORIGINE : c'est le tableau que
            # l'utilisateur lit, et la fiche fusionnée n'y figure pas.
            for src in c["_sources"]:
                src["retenu"] = False
                src["raison"] = ("au-delà des %d pistes chiffrées : la"
                                 " présélection garde les plus proches"
                                 % MAX_VICTIMES)
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

    # LE FRONT DE L'ANALYSE, ET D'OU IL SORT. Saisi, il fait foi ; vide, il se
    # deduit de la CLASSE de l'agresseur -- celle que la page connait, avec
    # les fronts du panneau de verification. C'est le meme pour le NEXT, le
    # FEXT et le seuil de couture.
    classe = str((doc.get("natures") or {}).get(principal) or "")
    if reglages["t_r"] > 0:
        t_r, source_tr = reglages["t_r"], "saisi"
    elif classe:
        t_r, source_tr = front_de_classe(classe, reglages["tr_classes"])
    else:
        t_r, source_tr = TR_DEFAUT, ("front de référence (1 ns) — la classe"
                                     " du net n'est pas connue")
    analyse = {"temps_montee": t_r, "source_tr": source_tr}

    masse = controle_masse(doc, parcours, analyse)
    base = {"format": FORMAT_RESULTAT, "carte": str(doc.get("carte") or ""),
            "version": VERSION, "moteurs": VERSION_MOTEURS,
            "methode": "niveau 2",
            "agresseurs": nets_agresseurs, "principal": principal,
            "classe": classe,
            "t_r": t_r, "source_tr": source_tr,
            "seuils": {"orange": reglages["seuil_orange"],
                       "rouge": reglages["seuil_rouge"],
                       "confirmation_db": reglages["seuil_db"]},
            "longueur": round(longueur, 3), "etape0": etape0, "masse": masse,
            # RIEN N'A ETE CALCULE N'EST PAS « RIEN NE COUPLE ». Le premier
            # cas est une absence de mesure, le second en est une.
            "preselection_vide": not retenus,
            "reglages": dict(reglages),
            "avertissements": avert, "graves": graves}

    if not retenus:
        base["couples"] = []
        base["victimes"] = []
        base["statut"] = "vert"
        base["actions"] = []
        base["actions_omises"] = None
        base["risques_refus"] = []
        base["risques"] = []
        base["carte_chaleur"] = None
        base["blindage"] = {"gardes": [], "bords_non_cousus": [],
                            "couture_max": se._couture_max(t_r)}
        # LE MESSAGE NOMME L'AGRESSEUR : « aucune piste ne passe » se lit « tu
        # n'as rien selectionne » alors qu'il parle des VICTIMES.
        avert.append("« %s » a bien été analysée (%.2f mm, %d voisine(s)"
                     " regardée(s)), mais AUCUNE de ses %d candidate(s) ne"
                     " passe la présélection géométrique : il n'y a pas de"
                     " paire à chiffrer. Le tableau « ce qui longe » dit"
                     " pourquoi chacune a été écartée — c'est là qu'il faut"
                     " desserrer un seuil, pas dans la sélection."
                     % (principal, longueur, len(voisinage),
                        len(candidats)))
        base["hypotheses"] = _hypotheses(reglages, masse, seuils, base)
        _journaliser(journal, base)
        return base

    # -- [C] ET [L], BLOC PAR BLOC -----------------------------------------
    infos = sections_couplees(couches, parcours, retenus, refs, t_r, notes,
                              gardes, doc.get("fentes") or ())
    # LE COUPLAGE NON CALCULE NE SE LIT PAS COMME UN COUPLAGE NUL. La section
    # droite n'est pas resoluble sur un bloc -- pas de plan de reference sous
    # la piste, solveur en echec --, [C] et [L] y restent DIAGONALES, le terme
    # croise vaut exactement zero, et ce zero-la n'est pas une mesure. C'est
    # precisement le cas d'un parcours qui passe au-dessus d'un trou du plan,
    # ou le couplage reel EXPLOSE faute de chemin de retour.
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
            " les coefficients y valent exactement zéro, et ce zéro-là n'est"
            " pas une mesure — c'est une absence de mesure. Les niveaux rendus"
            " sont donc un PLANCHER, et un statut vert ne vaut rien sur cette"
            " portion. La cause la plus fréquente est un plan de référence"
            " absent ou percé sous le parcours : c'est justement là que le"
            " couplage réel est le plus fort, faute de chemin de retour court."
            % (muet, 100.0 * muet / longueur,
               ", ".join("« %s »" % net for net in nets_muets) or
               "les voisines de ces blocs",
               infos.get("raison_section") or "cause non rapportée"))
    # LES GARDES ROUTEES, DITES AVEC LE RESULTAT : sans cette phrase, la chute
    # -- ou la MONTEE -- de couplage qu'elles provoquent serait un chiffre sans
    # cause.
    posees = infos.get("gardes") or []
    base["blindage"] = {
        "gardes": posees,
        "bords_non_cousus": infos.get("bords_non_cousus") or [],
        "couture_max": _nb(infos.get("couture_max"), 0.0)}
    if posees:
        flottantes = [g for g in posees if g["longueur_flottante"] > 0]
        avert.append(
            "%d piste(s) de garde routée(s) sont POSÉES dans les sections"
            " résolues : %s. Elles n'ont pas de ligne au tableau, mais elles"
            " prennent du champ aux deux — c'est ce qu'on leur demande. Une"
            " garde cousue est tenue à 0 V et fait tomber le NEXT comme le"
            " FEXT ; une garde dont le plus grand trou de couture dépasse"
            " %.1f mm est posée FLOTTANTE, et celle-là ne blinde pas : elle"
            " TRANSFÈRE, et le couplage peut en devenir PIRE qu'en l'absence"
            " de tout cuivre.%s"
            % (len(posees),
               ", ".join("« %s » sur %.1f mm" % (g["net"], g["longueur"])
                         for g in posees),
               _nb(infos.get("couture_max"), 0.0),
               (" ICI, %s : cousez-la, ou ne comptez pas dessus."
                % ", ".join("« %s » flotte sur %.1f mm (trou de %.1f mm)"
                            % (g["net"], g["longueur_flottante"], g["couture"])
                            for g in flottantes)) if flottantes else ""))
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
    # SUPPOSE un plan de retour continu sous les deux pistes.
    fentes_sur = _fentes_sur_longement(masse, retenus)
    if fentes_sur:
        _grave(
            avert, graves,
            "plan de référence absent sous %.2f mm de longement : le couplage"
            " rendu est un plancher"
            % sum(f["longueur"] for f in fentes_sur),
            "PLAN DE RÉFÉRENCE ABSENT SOUS LE LONGEMENT, sur %s. La section"
            " droite SUPPOSE un plan de retour continu sous les deux pistes :"
            " c'est de lui que sortent [C] et [L]. Là où le plan est percé ou"
            " absent, le courant de retour fait un détour, et les deux pistes"
            " se partagent ce retour : le couplage par IMPÉDANCE COMMUNE qui"
            " en résulte est un terme que ce modèle ne contient PAS. CE QUE LE"
            " TABLEAU REND EST UN PLANCHER SUR CES PLAGES, et un statut vert"
            " n'y est pas un verdict. Un plan continu sous un longement coûte"
            " moins qu'un écartement de pistes."
            % "; ".join("%.2f mm à partir de %.2f mm (« %s »)"
                        % (f["longueur"], f["s0"], f["victime"])
                        for f in fentes_sur))

    # UNE VOISINE QUI LONGE DES DEUX FACONS -- a plat sur une portion,
    # superposee sur une autre, parce que l'AGRESSEUR change de couche. La
    # portion superposee est resolue a part si rien ne la blinde ; si un plan
    # la separe, n'y compter aucun couplage est juste, et cela se dit.
    for c in retenus:
        if (c.get("intervalles") and c.get("longueur_verticale")
                and c.get("blinde_verticalement")):
            notes.append(
                "« %s » longe « %s » de deux façons : %.2f mm À PLAT (c'est"
                " cette portion qui est couplée) et %.2f mm SUPERPOSÉE,"
                " l'agresseur ayant changé de couche. La portion superposée"
                " est séparée par un plan de référence : n'y compter aucun"
                " couplage est juste."
                % (c["net"], principal, c.get("longueur_laterale", 0.0),
                   c.get("longueur_verticale", 0.0)))
    _avertir_masse(masse, avert, graves)
    _lire_couples(base, infos, retenus, couches, axe, espacements, masse,
                  reglages, t_r, notes, avert, graves)
    base["avertissements"] = avert + notes
    base["hypotheses"] = _hypotheses(reglages, masse, seuils, base)
    _journaliser(journal, base)
    return base


def _fiche_candidat(candidats, net):
    """Ce que l'etape 0a a mesure pour ce net, ou des zeros assumes.

    LES FICHES FUSIONNEES PASSENT EN PREMIER, et c'est l'appelant qui les met
    la. Chercher dans la seule liste brute rendait la PREMIERE fiche du nom :
    sur un net qui longe sur deux couches, les deux lignes du resultat
    sortaient avec la distance, la couche et le cote d'une seule d'entre
    elles -- une geometrie fausse a cote d'un chiffre juste.
    """
    for c in candidats:
        if c["net"] == net:
            return c
    return {"distance": 0.0, "longueur": 0.0, "type": "", "cote": "",
            "paire": False, "role": "victime", "nom_couche": ""}


# ==========================================================================
# LA LECTURE PAR PAIRE : LE PROFIL DE COUPLAGE LE LONG DU PARCOURS
# --------------------------------------------------------------------------
# `valeurs` est une FRACTION DE L'AMPLITUDE DE L'AGRESSEUR -- le NEXT local --,
# si bien que les plages a risque, la peinture sur le cuivre et l'axe de la
# carte se calculent par le meme code. Kb est le coefficient ARRIERE : la
# ligne s'ecrit `sens: "next"`, et `zones_risque` -- qui ne peint que le
# NEXT -- a raison de la prendre.
# ==========================================================================


def profil_geometrique(blocs, net, axe):
    """(Kb, Kf, mesure) de cette victime, echantillonnes sur l'axe de la carte.

    UN BLOC EST UNE VALEUR CONSTANTE SUR SON INTERVALLE : [C] et [L] y sont
    resolues une fois, pour toute sa longueur. L'echantillonnage est donc un
    simple « quel bloc contient cette abscisse », et surtout PAS une
    interpolation -- inventer une pente entre deux blocs ferait voir une
    variation continue la ou le modele est constant par morceaux, et cette
    pente-la se lirait comme un renseignement sur le dessin.
    """
    axe = np.asarray(axe, dtype=float)
    kb = np.zeros(axe.size)
    kf = np.zeros(axe.size)
    mesure = np.zeros(axe.size, dtype=bool)
    for k in range(axe.size):
        x = float(axe[k])
        for b in blocs:
            if not (b["s0"] - TOL_BORNE <= x <= b["s1"] + TOL_BORNE):
                continue
            c = (b.get("couplage") or {}).get(net)
            if c:
                kb[k] = _nb(c.get("kb"), 0.0)
                kf[k] = _nb(c.get("kf"), 0.0)
                mesure[k] = bool(c.get("mesure"))
            break
    return kb, kf, mesure


def couverture_calcul(blocs, retenus):
    """{net: {presente, muette, empile}} : ou chaque voisine a ete CALCULEE.

    DEUX ZEROS NE SE VALENT PAS, et les deux modes doivent les distinguer de
    la meme facon. Sur un bloc que la voisine ne longe pas, son couplage est
    nul parce qu'elle est loin -- c'est une mesure. Sur un bloc qu'elle longe
    et dont la section n'a pas ete resolue (plan de reference absent, solveur
    en echec), il est nul parce qu'on n'a rien calcule -- et c'est justement
    la ou le couplage reel est le plus fort, faute de chemin de retour court.

    `presente` et `muette` sont des longueurs en millimetres : celle que la
    voisine longe, et celle-ci privee de section. `empile` marque une voisine
    de couche adjacente : le solveur range ses conducteurs cote a cote et ne
    sait pas les empiler, elle n'a donc aucun bloc -- et aucun chiffre.
    """
    out = {}
    for b in blocs or ():
        longueur = _nb(b.get("s1")) - _nb(b.get("s0"))
        for net, c in (b.get("couplage") or {}).items():
            e = out.setdefault(net, {"presente": 0.0, "muette": 0.0,
                                     "empile": False})
            if c.get("presente"):
                e["presente"] += longueur
                if not c.get("mesure"):
                    e["muette"] += longueur
    for c in retenus or ():
        if not (c.get("intervalles") or ()):
            out.setdefault(c["net"], {"presente": 0.0, "muette": 0.0,
                                      "empile": False})["empile"] = True
    return out


def etat_calcul(couverture, net, longement):
    """Ce qu'un couple dit de son propre calcul, dans les deux modes.

    `non_calcule` : aucun millimetre du longement n'a de section resolue --
    le niveau rendu est un plancher sans valeur, pas un decouplage.
    `mesure_partielle` : une partie seulement ; le niveau est un plancher.
    """
    e = couverture.get(net) or {}
    if e.get("empile"):
        return {"non_calcule": True, "mesure_partielle": False,
                "longueur_non_calculee": round(_nb(longement, 0.0), 3)}
    presente = _nb(e.get("presente"), 0.0)
    muette = _nb(e.get("muette"), 0.0)
    non = presente > 0 and muette >= presente - TOL_BORNE
    return {"non_calcule": bool(non),
            "mesure_partielle": bool(muette > TOL_BORNE and not non),
            "longueur_non_calculee": round(muette, 3)}


def _raison_non_calcule(etat):
    """La phrase qu'un couple non calcule porte a la place de son niveau."""
    return ("couplage NON CALCULÉ — aucune section droite résolue sur son"
            " longement (plan de référence absent, ou voisine empilée que le"
            " solveur ne sait pas modéliser) : ce n'est pas un couplage nul,"
            " et c'est souvent là qu'il est le plus fort."
            if etat.get("non_calcule") else "")


def _lire_couples(base, infos, retenus, couches, axe, espacements, masse,
                  reglages, t_r, notes, avert, graves):
    """Le niveau 2, paire par paire, et la carte locale du NEXT.

    LA RESOLUTION EST CELLE DU DECOUPAGE, et elle est honnete sans reserve :
    aucune transformee n'est en jeu. Le profil est constant par bloc et EXACT
    entre deux bornes ; la seule chose qui limite la lecture est la grille
    d'affichage.
    """
    blocs = infos.get("blocs") or []
    principal = base["principal"]
    fiches = list(retenus) + list(base["etape0"]["candidats"])
    etendue = float(axe[-1] - axe[0]) if len(axe) > 1 else 0.0
    res = etendue / max(1, len(axe) - 1)
    bloc_max = max([_nb(b["s1"]) - _nb(b["s0"]) for b in blocs] or [0.0])
    retards = infos.get("retards") or []
    seuil_conf = 10.0 ** (_nb(reglages.get("seuil_db"), -40.0) / 20.0)
    orange, rouge = reglages["seuil_orange"], reglages["seuil_rouge"]
    couverture = couverture_calcul(blocs, retenus)
    cache_sup = {}
    couples, lignes, sans_superposition = [], [], []
    for g, v in enumerate(infos["conducteurs"]):
        if g == 0:
            continue
        net = v["net"]
        fiche = _fiche_candidat(fiches, net)
        kb, kf, _mesure = profil_geometrique(blocs, net, axe)
        etat = etat_calcul(couverture, net, fiche["longueur"])
        # LES MORCEAUX COUPLES A PLAT : un par bloc que la voisine longe, avec
        # le retard de la VICTIME sur ce bloc. `retards[g]` cumule ce retard
        # bloc par bloc, dans l'ordre de `blocs`.
        ret = retards[g] if g < len(retards) else []
        morceaux, td_plat = [], 0.0
        for k, bl in enumerate(blocs):
            if k + 1 >= len(ret):
                break
            c_b = (bl.get("couplage") or {}).get(net) or {}
            if not c_b.get("presente"):
                continue
            d_t = float(ret[k + 1]) - float(ret[k])
            td_plat += d_t
            morceaux.append((_nb(c_b.get("kb"), 0.0), _nb(c_b.get("kf"), 0.0),
                             d_t))
        # LES MORCEAUX SUPERPOSES, resolus a part : le solveur de section
        # range ses conducteurs cote a cote, celui-ci les empile.
        sup = _superposees(couches, fiche, cache_sup, notes)
        morceaux += [(m[0], m[1], m[2]) for m in sup]
        long_sup = sum(m[3] for m in sup)
        if fiche.get("superpositions") and not sup:
            sans_superposition.append(net)
        if sup:
            # UNE VOISINE QUI NE FAIT QUE SE SUPERPOSER A MAINTENANT UN CHIFFRE.
            etat = dict(etat, non_calcule=False)
        n2 = niveau2(morceaux, t_r, orange, rouge)
        niveau = max(n2["next"], n2["fext"])
        # LA CARTE LOCALE, EN NEXT : Kb(x) . min(1, 2 T_d / t_r) -- le NEXT
        # qu'aurait la paire si tout son longement couplait comme a cet
        # endroit. Son maximum est le NEXT de la paire quand le couplage est
        # uniforme. LES SUPERPOSITIONS Y SONT, a leur abscisse : la victime
        # projetee sur l'agresseur, la ou elle passe dessous ou dessus.
        kb_loc = kb.copy()
        for m in sup:
            dans = (axe >= m[4] - TOL_BORNE) & (axe <= m[5] + TOL_BORNE)
            kb_loc[dans] = np.maximum(kb_loc[dans], m[0])
        td_tout = td_plat + sum(m[2] for m in sup)
        facteur = min(1.0, 2.0 * td_tout / t_r) if t_r > 0 else 1.0
        local = kb_loc * facteur
        local_max = float(local.max()) if local.size else 0.0
        couple = {
            "agresseur": principal, "victime": net, "role": v["role"],
            "paire": bool(fiche.get("paire")),
            "distance": fiche["distance"], "longement": fiche["longueur"],
            "type": fiche["type"], "cote": fiche["cote"],
            "nom_couche": fiche.get("nom_couche", ""),
            "superposee": bool(sup),
            "longueur_superposee": round(long_sup, 3),
            "mesure_partielle": etat["mesure_partielle"],
            "longueur_non_calculee": etat["longueur_non_calculee"],
            "bloc_max": round(bloc_max, 3),
            "non_calcule": etat["non_calcule"],
            # LA CONFIRMATION LIT LE PIRE DES DEUX NIVEAUX. Une section non
            # resolue reste confirmee, donc visible : ses zeros ne sont pas
            # des mesures.
            "confirmee": bool(niveau > 0 and (niveau >= seuil_conf
                                              or etat["mesure_partielle"])),
            "raison": (_raison_non_calcule(etat) if etat["non_calcule"] else
                       "" if (niveau >= seuil_conf or not niveau) else
                       "NEXT et FEXT sous le seuil de confirmation de %.1f dB."
                       % _nb(reglages.get("seuil_db"), -40.0))}
        couple.update(n2)
        couple["kb_max"] = n2["kb"]
        couple["kb_max_pc"] = round(100.0 * n2["kb"], 3)
        couple["k_total_pc"] = round(100.0 * n2["k_total"], 3)
        couple["pire_db"] = round(_db(niveau), 2)
        couples.append(couple)
        lignes.append({
            "agresseur": principal, "victime": net, "sens": "next",
            "confirmee": couple["confirmee"],
            "valeurs": [round(float(x), 6) for x in local],
            "max": round(local_max, 6),
            "max_db": round(_db(local_max), 2),
            "max_brut": round(local_max, 6),
            "echantillons": int(local.size),
            "localise": True,
            "resolution": round(res, 4)})
        couple["resolution_next"] = round(res, 4)

    # LE CLASSEMENT : le statut d'abord, puis le pire des deux niveaux.
    couples.sort(key=lambda c: (-ORDRE_STATUT.get(c["statut"], 0),
                                -max(c["next"], c["fext"])))
    for r, c in enumerate(couples):
        c["rang"] = r + 1
    base["couples"] = couples
    base["victimes"] = [c["victime"] for c in couples if c["confirmee"]]
    base["statut"] = pire_statut([c["statut"] for c in couples
                                  if c["confirmee"]])
    base["axes"] = {
        "next": {"lignes": len(lignes), "raison": ""},
        "fext": {"lignes": 0,
                 "raison": "le bruit avant CO-PROPAGE avec l'agresseur : tout"
                           " ce qui se couple le long du longement arrive au"
                           " même instant au bout lointain, et aucune abscisse"
                           " ne le localise. Son niveau, lui, est au tableau."}}

    lignes_conf = [x for x in lignes if x["confirmee"]]
    refus = []
    base["risques"] = zones_risque(lignes_conf, axe, [],
                                   masse.get("zones") or [],
                                   _nb(reglages.get("risque"), 0.5), refus)
    base["risques_refus"] = refus
    omises = []
    base["actions"] = actions(base["risques"], masse, [], couples,
                              _nb(reglages.get("risque"), 0.5),
                              base.get("blindage"), omises, borne=True)
    base["actions_omises"] = omises[0] if omises else None
    pire = max([x["max"] for x in lignes] or [0.0])
    base["carte_chaleur"] = (
        {"axe": [round(float(x), 4) for x in axe], "lignes": lignes,
         "max": round(pire, 6), "zones": masse["zones"],
         "espacements": dict((net, espacements[net])
                             for net in set(x["victime"] for x in lignes)
                             if net in espacements)} if lignes else None)

    superposees = [c for c in couples if c["superposee"]]
    if superposees:
        notes.append(
            "PISTES SUPERPOSÉES résolues à part (deux rubans à leurs hauteurs,"
            " entre les plans qui encadrent la paire, milieu homogène : Kf"
            " nul) : %s. Leur couplage entre dans le NEXT et le k_total de la"
            " paire, et sur la carte locale à l'abscisse où elles passent sous"
            " ou sur l'agresseur."
            % ", ".join("« %s » sur %.2f mm" % (c["victime"],
                                                c["longueur_superposee"])
                        for c in superposees))
    if sans_superposition:
        _grave(
            avert, graves,
            "superposition non résolue (%s)"
            % ", ".join("« %s »" % n for n in sans_superposition),
            "SUPERPOSITION NON RÉSOLUE pour %s : aucun plan de référence ne"
            " l'encadre, ou le solveur l'a refusée. Ce que la superposition"
            " ajoute manque au niveau rendu, qui est donc un PLANCHER — et"
            " deux pistes superposées couplent souvent plus que les mêmes"
            " côte à côte."
            % ", ".join("« %s »" % n for n in sans_superposition))
    if any(c["mesure_partielle"] for c in couples):
        _grave(
            avert, graves,
            "section non résolue sur une partie du longement : les zéros n'y"
            " sont pas des mesures",
            "SECTION DROITE NON RÉSOLUE sur une partie du parcours pour %s :"
            " [C] et [L] y restent diagonales, Kb y vaut exactement zéro, et"
            " ce zéro-là n'est pas une mesure de découplage — c'est une"
            " absence de mesure. Le niveau est donc tiré vers le bas"
            " précisément là où il manque du plan de référence, c'est-à-dire"
            " là où le couplage réel est le plus fort."
            % ", ".join("« %s »" % c["victime"] for c in couples
                        if c["mesure_partielle"]))
    return base


def _hypotheses(reglages, masse, seuils, base):
    """Sous quelles hypotheses le chiffre a ete obtenu. Toujours rendues.

    LE BLOC DE CLOTURE FERME LA LISTE : les manques sont dits chacun a
    l'endroit ou il se produit, et personne ne les lit tous. Le dernier les
    RASSEMBLE et donne leur SENS -- de quel cote penche ce qui reste dehors.
    """
    base = base or {}
    h = [
        "NIVEAU 2, SCAN NORMALISÉ : l'agresseur fait un échelon UNITAIRE (1 V,"
        " 100 %%), sous un front t_r = %s (%s), et les lignes sont supposées"
        " ADAPTÉES à leurs deux bouts sur leur Z0 — on évalue le couplage"
        " direct, sans allers-retours de réflexions. Tout chiffre de la fiche"
        " est donc une fraction de l'amplitude de l'agresseur, en %% ou en dB,"
        " quelle que soit sa tension réelle."
        % (_texte_duree(_nb(base.get("t_r"), TR_DEFAUT)),
           base.get("source_tr") or "front de référence"),
        "LES FORMULES : k_total = ½ (Cm/C11 + Lm/L11), Kb = k_total / 2,"
        " Kf = ½ (Lm/L11 − Cm/C11), avec C11 la diagonale de Maxwell (capacité"
        " totale) et [C], [L] résolues par la méthode des moments sur la coupe"
        " de chaque bloc. NEXT = Kb si 2·T_d ≥ t_r (saturé), Kb·2·T_d / t_r"
        " sinon ; FEXT = |Kf|·T_d / t_r. T_d est le retard de la victime le"
        " long du COUPLAGE, sommé bloc par bloc avec v = c0/√ε_eff : un"
        " longement dont l'écart varie est compté morceau par morceau, et la"
        " saturation se lit sur le plus fort des Kb.",
        "LE STATUT DRC compare chaque niveau aux seuils : vert sous %.1f %%,"
        " orange jusqu'à %.1f %%, rouge au-delà. Le NEXT et le FEXT ont"
        " chacun le leur ; celui de la paire est le pire des deux."
        % (100.0 * reglages["seuil_orange"], 100.0 * reglages["seuil_rouge"]),
        "LA PRÉSÉLECTION GÉOMÉTRIQUE (étape 0a) et la CONFIRMATION (étape 0b)"
        " sont deux étapes distinctes, et le tableau les montre toutes les"
        " deux. Une piste absente du résultat est soit LOIN (écartée en 0a,"
        " avec sa distance), soit PROCHE ET DÉCOUPLÉE (écartée en 0b, avec son"
        " niveau) : ce sont deux situations de dessin opposées.",
        "Le seuil de distance de l'étape 0a vaut %.3f mm, %s ; la longueur de"
        " parallélisme minimale est %s. Les deux MAJORENT volontairement."
        % (seuils.get("distance_max", 0.0), seuils.get("source", ""),
           seuils.get("longueur_min_source", "")),
        "Le seuil de confirmation est de %.1f dB, sur le pire du NEXT et du"
        " FEXT. Une piste sous ce niveau reste au tableau, avec son niveau :"
        " elle est écartée du verdict et de la carte, pas du résultat."
        % _nb(reglages.get("seuil_db"), -40.0),
        "Les couches ADJACENTES %s dans la présélection. Deux pistes"
        " superposées sans plan entre elles sont RÉSOLUES à part — deux"
        " rubans à leurs hauteurs entre les plans qui encadrent la paire,"
        " milieu homogène, donc Kf nul — et comptées dans le NEXT ; celles"
        " qu'un plan sépare sont écartées, le plan étant un écran."
        % ("entrent" if seuils.get("couches_adjacentes") else "N'ENTRENT PAS"),
        "LA CARTE LOCALE porte Kb(x)·min(1, 2·T_d/t_r) : le NEXT qu'aurait la"
        " paire si tout son longement couplait comme à cet endroit. Son"
        " maximum est le NEXT de la paire quand le couplage est uniforme ; elle"
        " dit OÙ le NEXT se fabrique. Le FEXT n'a pas de carte : il"
        " co-propage avec l'agresseur et tout arrive au même instant.",
        "Le contrôle du plan de masse est INDÉPENDANT du calcul de couplage :"
        " le blindage d'un plan continu et de ses vias est déjà dans [C] et"
        " [L]. Le seuil de couture retenu est %.2f mm, tiré de %s%s."
        % (masse.get("seuil", 0.0), masse.get("source", ""),
           (" ; ce qui a pu être examiné : %s" % ", ".join(masse["mesure"]))
           if masse.get("mesure") else " ; RIEN n'a pu être examiné"),
        "LE CUIVRE DE MASSE N'EST DANS LA SECTION QUE S'IL EST COUSU : une"
        " piste de garde ou un plan arrosé dont la couture dépasse le seuil"
        " est posé FLOTTANT, ou son effet coplanaire annulé, plutôt que de"
        " faire cadeau d'une masse idéale à 0 V.",
        "CE QUE CE NIVEAU NE COUVRE PAS, rassemblé — et dans quel sens :"
        " (0) une superposition est placée sur la carte locale par la"
        " projection de la victime sur l'agresseur, à la précision du"
        " tronçon ;"
        " (1) les lignes sont supposées adaptées : une ligne désadaptée"
        " renvoie une part du bruit vers l'autre bout → les deux niveaux"
        " peuvent y être dépassés ; (2) le modèle de couplage faible ignore"
        " la dispersion, les pertes, les coudes et les vias → un ordre de"
        " grandeur fidèle, pas une forme d'onde ; (3) le PLAN DE RETOUR EST"
        " SUPPOSÉ CONTINU sous les deux pistes : là où il est percé, fendu ou"
        " absent, le couplage par impédance commune est un terme ABSENT du"
        " modèle → OPTIMISTE ; (4) les contrôles de plan de masse ne voient"
        " que ce que la page envoie → OPTIMISTE sur une carte muette sur sa"
        " couture ; (5) plusieurs agresseurs d'une même victime ne sont pas"
        " additionnés ici, la vérification de carte les somme au pire en"
        " phase. Sur une carte mal cousue ou mal référencée, ce qui est"
        " affiché est donc un PLANCHER.",
    ]
    return h


def _texte_duree(t):
    """Une duree lisible : « 1 ns », « 250 ps »."""
    if t >= 1e-9:
        return "%.3g ns" % (t * 1e9)
    return "%.3g ps" % (t * 1e12)


def _journaliser(journal, base):
    """Une ligne par analyse, comme `simulation_em.simuler`."""
    if not journal:
        return
    confirmees = [c for c in base.get("couples") or [] if c["confirmee"]]
    journal("  crosstalk « %s » : %d candidat(s), %d victime(s) confirmee(s)"
            " sur %.1f mm, t_r %s, statut %s, %d avertissement(s)\n"
            % (base.get("principal", "?"),
               len(base["etape0"]["candidats"]), len(confirmees),
               base.get("longueur", 0.0),
               _texte_duree(_nb(base.get("t_r"), TR_DEFAUT)),
               base.get("statut", "vert"),
               len(base.get("avertissements") or [])))

