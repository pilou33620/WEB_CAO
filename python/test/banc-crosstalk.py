#!/usr/bin/python3
# -*- coding: utf-8 -*-
"""Banc d'essai de l'analyse de crosstalk (python/crosstalk.py).

    python python/test/banc-crosstalk.py

CE QUE CE BANC DOIT ATTRAPER, ET QUI NE SE VOIT PAS AUTREMENT. Un tableau de
pourcentages et une carte coloree restent credibles QUELLE QUE SOIT l'erreur
qu'on y glisse : un facteur deux sur T_d, une mutuelle de mauvais signe, un
front pris dans la mauvaise unite. Les cas ci-dessous le verifient contre des
etalons independants du code teste :

  · LES FORMULES DU NIVEAU 2, a la main : NEXT sature et non sature, FEXT,
    k_total, et les seuils vert / orange / rouge ;
  · LA TRIPLAQUE EXACTE (Cohn) : Kb, k_total, un FEXT nul en milieu homogene,
    et T_d au retard exact ;
  · LA POSITION : une victime qui ne longe que sur une portion connue doit
    faire monter la carte locale a l'abscisse ou cette portion commence ;
  · LE PROFIL D'ESPACEMENT, qui vient de la GEOMETRIE et non du calcul
    electromagnetique ;
  · LES LIGNES COUPLEES EN CASCADE (`chaine_mtl`), que `rf_reseau` prend pour
    reference : une ligne adaptee ne reflechit rien, deux moities cascadees
    redonnent la ligne entiere.

Le style est celui des autres bancs du depot (python/test/banc-ligne-mom.py) :
pas de pytest, un decompte a la fin, un code de retour.
"""

import math
import os
import sys

import numpy as np

RACINE = os.path.dirname(os.path.dirname(os.path.dirname(
    os.path.abspath(__file__))))
sys.path.insert(0, os.path.join(RACINE, "python"))

import crosstalk as ct                                            # noqa: E402
import ligne_mom as tl                                            # noqa: E402

ok = ko = 0


def T(titre, fonction):
    global ok, ko
    try:
        fonction()
    except AssertionError as exc:
        ko += 1
        print("  KO  %s\n        %s" % (titre, exc))
    except Exception as exc:                           # noqa: BLE001
        ko += 1
        print("  KO  %s\n        %s : %s" % (titre, type(exc).__name__, exc))
    else:
        ok += 1
        print("  ok  %s" % titre)


# ==========================================================================
# La carte d'essai : elle est ici, rien a telecharger
# ==========================================================================

STACK = {"layers": [
    {"type": "copper", "name": "Top", "thickness": 0.035, "role": "signal"},
    {"type": "dielectric", "name": "FR-4", "thickness": 0.2,
     "epsilon_r": 4.3, "tan_delta": 0.02},
    {"type": "copper", "name": "GND", "thickness": 0.035, "role": "plane",
     "net": "GND"},
    {"type": "dielectric", "name": "coeur", "thickness": 1.0,
     "epsilon_r": 4.3, "tan_delta": 0.02},
    {"type": "copper", "name": "Bottom", "thickness": 0.035, "role": "signal"},
]}


def pis(x1, y1, x2, y2, net, couche=0, w=0.25, couture=0.4):
    """Un troncon droit, au format « cao-crosstalk-1 »."""
    return {"type": "track", "start": [x1, y1], "end": [x2, y2],
            "length": round(math.hypot(x2 - x1, y2 - y1), 6), "width": w,
            "layer": couche, "net": net, "copper_thickness": 0.035,
            "gap_left": 0.5, "gap_right": 0.5,
            "couture_left": couture, "couture_right": couture}


def doc_essai(voisinage, **reglages):
    """Un agresseur droit de 40 mm, et ce qu'on veut autour."""
    return {
        "format": "cao-crosstalk-1", "carte": "banc", "agresseurs": ["CLK"],
        "stackup": STACK,
        "geometry": {"objects": [pis(0, 0, 40, 0, "CLK")]},
        "voisinage": list(voisinage),
        "reference_nets": ["GND"],
        # LE FRONT DE L'ANALYSE : 100 ps, saisi. `t_r=0` le fait deduire de
        # la classe (`natures`), ou du front de reference de 1 ns.
        "reglages": dict({"t_r": 100e-12}, **reglages),
    }


def ligne_de(res, net, sens):
    for l in (res.get("carte_chaleur") or {}).get("lignes") or []:
        if l["victime"] == net and l["sens"] == sens:
            return l
    return None


def pic(res, net, sens):
    """L'abscisse du maximum d'une ligne de la carte, en millimetres."""
    l = ligne_de(res, net, sens)
    assert l is not None, "pas de ligne %s / %s dans la carte" % (net, sens)
    axe = res["carte_chaleur"]["axe"]
    i = max(range(len(l["valeurs"])), key=lambda k: l["valeurs"][k])
    return axe[i], l["valeurs"][i]


print("=" * 62)
print("  BANC D'ESSAI  --  python/crosstalk.py")
print("=" * 62)


# ==========================================================================
print("\nLe reseau multi-ports, contre ce que la theorie impose")
# ==========================================================================

def une_ligne_adaptee_ne_reflechit_rien():
    """S11 = 0 et S21 = exp(-j.beta.L), a la precision machine.

    C'EST L'ETALON LE PLUS SEVERE DE TOUT LE FICHIER, et il ne coute rien : sur
    une ligne dont l'impedance caracteristique vaut l'impedance de reference,
    la matrice S est connue EXACTEMENT. Toute erreur de signe, de convention de
    courant ou d'ordre de bloc dans la conversion chaine -> S s'y voit
    immediatement -- alors qu'elle passerait inapercue sur une ligne desadaptee,
    ou tout chiffre est plausible.
    """
    z0, eps = 50.0, 4.0
    v = ct.C_0 / math.sqrt(eps)
    l_mat = np.array([[z0 / v]])
    c_mat = np.array([[1.0 / (z0 * v)]])
    longueur = 0.05
    f = np.linspace(0, 10e9, 11)
    w = 2 * math.pi * f
    s = ct.s_depuis_chaine(ct.chaine_mtl(l_mat, c_mat, longueur, w), z0)
    assert np.abs(s[:, 0, 0]).max() < 1e-12, \
        "S11 = %.3g au lieu de zero" % np.abs(s[:, 0, 0]).max()
    attendu = np.exp(-1j * w * longueur / v)
    assert np.abs(s[:, 1, 0] - attendu).max() < 1e-12, \
        "S21 s'ecarte de %.3g" % np.abs(s[:, 1, 0] - attendu).max()


T("une ligne adaptee ne reflechit rien, et retarde exactement",
  une_ligne_adaptee_ne_reflechit_rien)


def le_continu_est_un_fil():
    """A w = 0 le reseau est un jeu de fils, et la matrice le dit.

    LE POINT k = 0 EST CELUI QUE LA GRILLE HARMONIQUE EXIGE, et c'est aussi
    celui ou une ecriture naive divise par zero : Z^-1 = (jwL)^-1 diverge. La
    forme employee (W = L^-1 T sqrt(lambda), sans w) le rend calculable, et
    c'est ce que ce cas verifie -- sur DEUX conducteurs couples, pour que le
    couplage soit bien nul au continu et non simplement petit.
    """
    geo = {"kind": "micro", "h": 0.2e-3, "epsilon_r": 4.3, "t": 0.035e-3,
           "conducteurs": [{"w": 0.25e-3, "x": 0.0},
                           {"w": 0.25e-3, "x": 0.45e-3}]}
    r = tl.solve_multiline(geo)
    l_mat, c_mat = np.array(r["l"]), np.array(r["c"])
    s = ct.s_depuis_chaine(ct.chaine_mtl(l_mat, c_mat, 0.05, np.array([0.0])),
                           50.0)[0]
    attendu = np.array([[0, 0, 1, 0], [0, 0, 0, 1],
                        [1, 0, 0, 0], [0, 1, 0, 0]], dtype=float)
    assert np.abs(np.abs(s) - attendu).max() < 1e-9, \
        "le continu ne rend pas un jeu de fils :\n%s" % np.round(np.abs(s), 6)


T("au continu, le reseau est un jeu de fils", le_continu_est_un_fil)


def la_cascade_ne_change_rien():
    """Une ligne coupee en deux redonne la ligne entiere.

    TOUTE LA CARTE REPOSE SUR CE DECOUPAGE. Le parcours est coupe a chaque
    bout de longement, et les matrices de chaine sont multipliees ; si ce
    produit n'etait pas exact, la carte porterait des marches aux frontieres de
    blocs -- qui se liraient comme des zones de couplage.
    """
    geo = {"kind": "micro", "h": 0.2e-3, "epsilon_r": 4.3, "t": 0.035e-3,
           "conducteurs": [{"w": 0.25e-3, "x": 0.0},
                           {"w": 0.25e-3, "x": 0.45e-3}]}
    r = tl.solve_multiline(geo)
    l_mat, c_mat = np.array(r["l"]), np.array(r["c"])
    f = np.linspace(0, 20e9, 21)
    w = 2 * math.pi * f
    entier = ct.s_depuis_chaine(ct.chaine_mtl(l_mat, c_mat, 0.05, w), 50.0)
    a = ct.chaine_mtl(l_mat, c_mat, 0.02, w)
    b = ct.chaine_mtl(l_mat, c_mat, 0.03, w)
    coupe = ct.s_depuis_chaine(np.matmul(b, a), 50.0)
    ecart = np.abs(entier - coupe).max()
    assert ecart < 1e-12, "la cascade s'ecarte de %.3g" % ecart


T("deux moities cascadees redonnent la ligne entiere",
  la_cascade_ne_change_rien)






# ==========================================================================
print("\nL'axe de position : le seul cas qui verifie la carte elle-meme")
# ==========================================================================

def le_pic_de_next_tombe_ou_le_longement_commence():
    """Une victime qui ne longe que de 25 a 40 mm : la carte monte a 25 mm.

    C'EST LE CAS QUI JUSTIFIE TOUTE LA SECTION. Le NEXT remonte vers le bout
    proche de la victime : ce qui se couple a l'abscisse x y arrive au bout
    d'un aller-retour, et c'est cette conversion-la que la carte fait. Un
    facteur deux oublie sur l'axe -- l'erreur la plus facile a commettre et la
    plus difficile a voir -- ferait monter la carte a 12,5 mm, ce qui reste une
    carte parfaitement lisible.

    LA CARTE EST Kb(x), LA REPONSE A UN ECHELON : elle est haute sur TOUT le
    longement et basse avant. On verifie donc ou elle MONTE -- le premier point
    a mi-hauteur -- et qu'elle reste basse en amont. (La version precedente
    tracait la reponse impulsionnelle, qui ne marque que les bords ; ce test
    en cherchait alors le pic.)

    LA TOLERANCE EST LA RESOLUTION ANNONCEE, et non un nombre choisi : la carte
    ne peut pas placer un bord plus finement que la bande ne le permet.
    """
    for debut in (0.0, 12.0, 25.0):
        res = ct.analyser(doc_essai([pis(debut, 0.45, 40, 0.45, "VIC")]))
        ligne = ligne_de(res, "VIC", "next")
        axe = res["carte_chaleur"]["axe"]
        vals = ligne["valeurs"]
        tol = ligne["resolution"]
        haut = max(vals)
        assert haut > 0, "aucun couplage a %g mm" % debut
        monte = next(x for x, v in zip(axe, vals) if v >= 0.5 * haut)
        assert abs(monte - debut) <= tol,             ("longement de %g a 40 mm : la carte monte a %.2f mm, tolerance"
             " %.2f mm" % (debut, monte, tol))
        amont = [v for x, v in zip(axe, vals) if x < debut - 1.5 * tol]
        assert not amont or max(amont) < 0.2 * haut,             ("longement de %g a 40 mm : %.3f en amont pour %.3f au plus haut"
             % (debut, max(amont), haut))


T("la carte de NEXT monte la ou le longement commence",
  le_pic_de_next_tombe_ou_le_longement_commence)


def la_carte_est_muette_la_ou_rien_ne_longe():
    """Avant le debut du longement, la carte doit etre PLATE.

    Une carte qui etale du couplage la ou il n'y a pas de voisine designerait
    un millimetre a corriger qui n'a rien a se reprocher -- et c'est exactement
    ce que produirait un axe de position faux, ou une fenetre oubliee.
    """
    res = ct.analyser(doc_essai([pis(25, 0.45, 40, 0.45, "VIC")]))
    ligne = ligne_de(res, "VIC", "next")
    axe = res["carte_chaleur"]["axe"]
    tol = ligne["resolution"]
    avant = [v for x, v in zip(axe, ligne["valeurs"]) if x < 25.0 - 2 * tol]
    apres = [v for x, v in zip(axe, ligne["valeurs"]) if x >= 25.0]
    assert avant and apres, "l'axe ne couvre pas les deux zones"
    assert max(avant) < 0.25 * max(apres), \
        ("la carte porte %.4f avant le longement pour %.4f dedans"
         % (max(avant), max(apres)))


T("la carte reste plate la ou rien ne longe",
  la_carte_est_muette_la_ou_rien_ne_longe)











# ==========================================================================
print("\nLes deux etapes zero, et elles restent deux")
# ==========================================================================

def la_preselection_mesure_ce_qu_elle_ecarte():
    """Une piste trop loin ou trop courte est ECARTEE AVEC SON CHIFFRE.

    UNE LISTE OU NE FIGURE QUE CE QUI EST RETENU NE SE DISTINGUE PAS D'UNE
    CARTE OU IL N'Y A RIEN. C'est le defaut que cette etape existe pour eviter :
    l'utilisateur doit pouvoir voir que le seuil qu'il a choisi ecarte une
    piste a 0,80 mm, et le corriger s'il le juge utile.
    """
    res = ct.analyser(doc_essai([
        pis(0, 0.45, 40, 0.45, "PROCHE"),          # retenue
        pis(0, 1.10, 40, 1.10, "AU_DELA"),         # vue, au-dela du seuil
        pis(10, 0.45, 10.3, 0.45, "CROISEMENT"),   # trop courte
    ]))
    par_net = {c["net"]: c for c in res["etape0"]["candidats"]}
    assert set(par_net) >= {"PROCHE", "AU_DELA", "CROISEMENT"}, \
        "des candidats manquent : %s" % sorted(par_net)
    assert par_net["PROCHE"]["retenu"], "la voisine a 0,2 mm doit etre retenue"
    for net in ("AU_DELA", "CROISEMENT"):
        c = par_net[net]
        assert not c["retenu"], "« %s » ne devrait pas etre retenue" % net
        assert c["raison"], "« %s » est ecartee sans raison" % net
        assert c["distance"] > 0 and c["longueur"] > 0, \
            "« %s » est ecartee sans chiffre : %s" % (net, c)
    assert "seuil" in par_net["AU_DELA"]["raison"], \
        "la raison doit nommer le seuil : %s" % par_net["AU_DELA"]["raison"]


T("l'etape 0a ecarte avec la distance et la longueur mesurees",
  la_preselection_mesure_ce_qu_elle_ecarte)


def la_confirmation_ecarte_avec_le_niveau():
    """Une piste presente en 0a et sous le seuil en 0b garde son niveau.

    « GEOMETRIQUEMENT PROCHE MAIS ELECTRIQUEMENT DECOUPLEE » est une reponse,
    et pas un silence : c'est ce qui distingue une piste blindee d'une piste
    absente, et les deux appellent des gestes de routage opposes.
    """
    res = ct.analyser(doc_essai([pis(0, 0.45, 40, 0.45, "SERREE"),
                                 pis(0, 1.00, 40, 1.00, "LACHE")],
                                distance_max=2.0, seuil_db=-24.0))
    retenus = sorted(res["etape0"]["retenus"])
    assert retenus == ["LACHE", "SERREE"], \
        "l'etape 0a doit retenir les deux : %s" % retenus
    par_net = dict((c["victime"], c) for c in res["couples"])
    assert par_net["SERREE"]["confirmee"], \
        "SERREE est a %.1f dB" % par_net["SERREE"]["pire_db"]
    lache = par_net["LACHE"]
    assert not lache["confirmee"], \
        "LACHE est a %.1f dB, elle doit tomber sous -24 dB" % lache["pire_db"]
    assert lache["next_db"] > -60 and lache["raison"], \
        "le niveau et la raison doivent rester lisibles : %s" % lache
    assert lache["distance"] > 0 and lache["longement"] > 0, \
        "la geometrie de 0a doit survivre a l'ecart de 0b : %s" % lache
    # ELLE A SA COURBE, ET ELLE EST ETIQUETEE. Une carte vide ne dit pas
    # pourquoi elle est vide : « rien a peindre » se lit comme « aucun
    # couplage », alors que le fait est « du couplage, sous le seuil que vous
    # avez pose ». La courbe est donc rendue, marquee non confirmee.
    tracees = set(l["victime"] for l in res["carte_chaleur"]["lignes"])
    assert tracees == {"SERREE", "LACHE"}, \
        "les deux courbes doivent etre tracees : %s" % tracees
    etiquette = dict((l["victime"], l["confirmee"])
                     for l in res["carte_chaleur"]["lignes"])
    assert etiquette == {"SERREE": True, "LACHE": False}, \
        "chaque courbe dit si elle est confirmee : %s" % etiquette
    # MAIS ELLE NE PORTE AUCUN VERDICT : ni victime comptee, ni plage peinte
    # sur le cuivre, ni pic « non justifie ». Un verdict rendu sur du bruit se
    # peindrait a cote des vrais, et rien a l'ecran ne les distinguerait.
    assert res["victimes"] == ["SERREE"], \
        "seule une confirmee est une victime : %s" % res["victimes"]
    for cle in ("risques",):
        fautifs = [z for z in (res.get(cle) or []) if z["victime"] == "LACHE"]
        assert not fautifs, \
            "une non confirmee ne porte pas de %s : %s" % (cle, fautifs)


T("l'etape 0b ecarte avec le niveau de couplage, pas en silence",
  la_confirmation_ecarte_avec_le_niveau)


def deux_victimes_de_part_et_d_autre_ne_se_melangent_pas():
    """Un agresseur au centre, une victime de chaque cote : DEUX lignes.

    C'EST LE CAS QUE LE CAHIER DES CHARGES NOMME. Les deux couplages se
    calculent separement et ne s'agregent PAS -- une victime additionne ses
    agresseurs, un agresseur n'additionne pas ses victimes --, et l'ecart entre
    les deux est justement ce qui apprend quelque chose.
    """
    res = ct.analyser(doc_essai([pis(0, 0.45, 40, 0.45, "GAUCHE"),
                                 pis(0, -0.60, 40, -0.60, "DROITE")]))
    nets = [c["victime"] for c in res["couples"]]
    assert sorted(nets) == ["DROITE", "GAUCHE"], \
        "il faut une ligne par victime : %s" % nets
    cotes = dict((c["victime"], c["cote"]) for c in res["couples"])
    assert cotes["GAUCHE"] != cotes["DROITE"], \
        "les deux victimes sont du meme cote : %s" % cotes
    # LA PLUS PROCHE PREND LE PLUS : c'est la seule chose que la physique
    # impose ici, et elle suffit a verifier que les deux ne sont pas melangees.
    par_net = dict((c["victime"], c) for c in res["couples"])
    assert par_net["GAUCHE"]["pire_db"] > par_net["DROITE"]["pire_db"], \
        ("la victime a 0,20 mm doit prendre plus que celle a 0,35 mm :"
         " %.2f contre %.2f dB" % (par_net["GAUCHE"]["pire_db"],
                                   par_net["DROITE"]["pire_db"]))


T("deux victimes encadrant l'agresseur donnent deux lignes distinctes",
  deux_victimes_de_part_et_d_autre_ne_se_melangent_pas)

# ==========================================================================
print("\nLa source est le design, et elle est la seule")
# ==========================================================================

def une_matrice_venue_de_l_exterieur_est_refusee():
    """Un document qui porte encore un .sNp est REFUSE, jamais ignore.

    L'IGNORER SERAIT LE PIRE DES DEUX. La page croirait avoir fait calculer
    son fichier ; elle lirait une carte obtenue sur autre chose, sans qu'aucun
    chiffre ne paraisse anormal. Le refus doit donc nommer les champs en
    cause -- c'est la seule facon pour l'appelant de savoir quoi retirer.
    """
    for champ, valeur in (("touchstone", "# HZ S RI R 50"),
                          ("mapping_confirme", True)):
        doc = doc_essai([pis(0, 0.45, 40, 0.45, "VIC")])
        doc[champ] = valeur
        try:
            ct.analyser(doc)
        except ct.ErreurCrosstalk as exc:
            assert champ in exc.message, \
                "le refus ne nomme pas « %s » : %r" % (champ, exc.message)
            assert exc.conseil, "le refus ne dit pas quoi faire"
        else:
            raise AssertionError("« %s » n'a pas ete refuse" % champ)

    # ET « PORTS » NE SE REFUSE PAS SUR SON NOM, mais sur ce qu'il NOMME. Le
    # document de simulation partage sa base avec celui-ci et porte deja un
    # « ports » a lui -- les impedances de reference des deux bouts. Refuser
    # sur le seul nom du champ refuserait tout document venu de l'editeur, ce
    # qui est exactement l'inverse du but : le panneau n'afficherait plus
    # jamais de carte, et le message parlerait d'un fichier que personne n'a
    # importe.
    doc = doc_essai([pis(0, 0.45, 40, 0.45, "VIC")])
    doc["ports"] = [{"id": 1, "impedance": 50.0}, {"id": 2, "impedance": 50.0}]
    res = ct.analyser(doc)
    assert res["couples"], \
        "les impédances de référence du document de simulation ne sont PAS" \
        " une table de correspondance : elles ne doivent rien refuser"


T("une matrice S venue de l'exterieur est refusee, jamais avalee",
  une_matrice_venue_de_l_exterieur_est_refusee)
















# ==========================================================================
print("\nLe profil d'espacement, et son recoupement avec la carte")
# ==========================================================================

def le_profil_d_espacement_suit_le_trace():
    """L'ecart en fonction de l'abscisse, sur le MEME axe que la carte.

    UNE DISTANCE UNIQUE NE DECRIT PAS UN LONGEMENT : une voisine qui contourne
    un composant s'ecarte puis revient. Ce cas la fait s'approcher a mi-course
    -- le profil doit rendre les DEUX valeurs, chacune a son abscisse, et
    l'axe doit etre celui de la carte, sans quoi les deux courbes ne se
    superposeraient pas.
    """
    res = ct.analyser(doc_essai([pis(0, 0.90, 20, 0.90, "VIC"),
                                 pis(20, 0.45, 40, 0.45, "VIC")]))
    fiche = res["etape0"]["espacements"]["VIC"]
    axe = res["carte_chaleur"]["axe"]
    assert len(fiche["valeurs"]) == len(axe), \
        "%d valeurs pour %d colonnes" % (len(fiche["valeurs"]), len(axe))
    assert res["carte_chaleur"]["espacements"]["VIC"] == fiche, \
        "la carte ne porte pas le meme profil que l'etape 0a"

    def a(s):
        i = min(range(len(axe)), key=lambda k: abs(axe[k] - s))
        return fiche["valeurs"][i]

    # Ecart bord a bord : 0,90 - 0,25 = 0,65 mm, puis 0,45 - 0,25 = 0,20 mm.
    assert abs(a(5.0) - 0.65) < 0.01, "a 5 mm : %s" % a(5.0)
    assert abs(a(30.0) - 0.20) < 0.01, "a 30 mm : %s" % a(30.0)
    assert abs(fiche["min"] - 0.20) < 0.01, fiche
    assert abs(fiche["max"] - 0.65) < 0.01, fiche
    assert fiche["couverture"] > 0.99, \
        "la voisine longe partout : %s" % fiche["couverture"]
    # ET LA OU RIEN NE LONGE, IL N'Y A PAS D'ESPACEMENT -- surtout pas zero,
    # qui se lirait comme un contact.
    court = ct.analyser(doc_essai([pis(20, 0.45, 40, 0.45, "VIC")]))
    valeurs = court["etape0"]["espacements"]["VIC"]["valeurs"]
    axe = court["carte_chaleur"]["axe"]
    debut = [v for x, v in zip(axe, valeurs) if x < 15.0]
    assert debut and all(v is None for v in debut), \
        "le profil doit etre vide la ou rien ne longe : %s" % debut[:5]


T("le profil d'espacement suit le trace, sur l'axe de la carte",
  le_profil_d_espacement_suit_le_trace)










def les_plages_a_risque_tombent_sur_le_longement():
    """Les portions a peindre sur le cuivre, et elles doivent tomber JUSTE.

    C'EST LA SORTIE QUI SE POSE SUR LE DESSIN, donc celle dont une erreur coute
    le plus : une plage peinte au mauvais millimetre est visiblement precise et
    entierement fausse, et rien a l'ecran ne la contredit. Le cas est construit
    pour qu'on sache ou elle doit tomber : la victime ne longe QUE de 12 a
    28 mm, avec un ecart constant -- le couplage s'y fabrique PARTOUT, et la
    plage a ecarter est le longement entier.

    CE N'ETAIT PAS LE CAS. La carte tracait la reponse IMPULSIONNELLE, qui ne
    marque que les deux transitions -- la derivee du couplage le long du
    parcours --, et ce test attendait alors deux plages, centrees sur 12 et
    28 mm : « ecarter de 9,5 a 14,2 mm », puis de 25,5 a 30,2 mm, pour un
    couplage qui se fabrique de 12 a 28.
    """
    res = ct.analyser(doc_essai([pis(12, 0.45, 28, 0.45, "VIC")]))
    plages = res["risques"]
    assert plages, "aucune plage rendue sur un longement franc"
    assert all(p["victime"] == "VIC" for p in plages), plages
    # UNE PLAGE, QUI COUVRE LE LONGEMENT. On tolere la resolution spatiale sur
    # chaque bord : la bande ne distingue pas mieux.
    res_next = ligne_de(res, "VIC", "next")["resolution"]
    assert len(plages) == 1,         "une seule plage attendue, %d : %s" % (len(plages), plages)
    assert abs(plages[0]["s0"] - 12.0) <= res_next, (plages[0], res_next)
    assert abs(plages[0]["s1"] - 28.0) <= res_next, (plages[0], res_next)
    for p in plages:
        assert 0.0 <= p["s0"] < p["s1"] <= res["longueur"] + 1e-6, p
        assert 0 < p["niveau"] <= 1.0, p
        assert p["justifie"] is True, \
            "un longement franc n'a pas de plage inexpliquee : %s" % p

    # LE SEUIL SE REGLE, ET IL AGIT DANS LE BON SENS : plus bas, des plages
    # plus longues. Une victime qui s'ecarte a mi-chemin couple moins sur sa
    # seconde moitie : a 50 % du pire point, seule la premiere est peinte ;
    # a 20 %, les deux. Un reglage qui n'agirait pas serait pire qu'absent.
    marche = [pis(12, 0.45, 20, 0.45, "VIC"), pis(20, 0.75, 28, 0.75, "VIC")]
    etendue = lambda ps: sum(p["s1"] - p["s0"] for p in ps)
    serre = ct.analyser(doc_essai(marche))["risques"]
    large = ct.analyser(doc_essai(marche, risque=0.2))["risques"]
    assert etendue(large) > etendue(serre), \
        "un seuil plus bas doit peindre plus : %.2f contre %.2f mm" \
        % (etendue(large), etendue(serre))
    # ET IL EST BORNE : hors de ]0 ; 1[, il ne decoupe rien et on le refuse.
    for mauvais in (0.0, 1.0, -0.2, 1.5):
        try:
            ct.analyser(doc_essai([pis(12, 0.45, 28, 0.45, "VIC")],
                                  risque=mauvais))
        except ct.ErreurCrosstalk as exc:
            assert "risque" in exc.message.lower(), exc.message
        else:
            raise AssertionError("un seuil de %g a ete accepte" % mauvais)


T("les plages a risque couvrent le longement, pas ses seules transitions",
  les_plages_a_risque_tombent_sur_le_longement)

# ==========================================================================
print("\nCe qu'on refuse de deviner en silence")
# ==========================================================================









def le_plan_de_masse_est_controle_a_part_et_localise():
    """Trous de couture, fentes et transitions ressortent AVEC leur abscisse.

    ILS NE SE MELANGENT PAS AU COUPLAGE, et c'est le point : le blindage est
    deja dans la matrice S. Ce que ces controles ajoutent est une CAUSE
    possible, superposable a la carte -- un pic a la meme abscisse qu'un trou
    de couture n'est plus un mystere.
    """
    doc = doc_essai([pis(0, 0.45, 40, 0.45, "VIC")])
    doc["couture"] = {"positions": [{"s": 2.0, "cote": 1},
                                    {"s": 4.0, "cote": 1},
                                    {"s": 2.0, "cote": -1},
                                    {"s": 4.0, "cote": -1}]}
    doc["fentes"] = [{"s": 18.0, "longueur": 1.5, "quoi": "fente du plan"}]
    res = ct.analyser(doc)
    masse = res["masse"]
    assert masse["seuil"] > 0 and masse["source"], masse
    types = dict((z["type"], z) for z in masse["zones"])
    assert "fente" in types, "la fente n'est pas remontee : %s" % masse["zones"]
    assert types["fente"]["s0"] == 18.0, types["fente"]
    couture = [z for z in masse["zones"] if z["type"] == "couture"]
    assert couture, "aucun trou de couture entre 4 mm et 40 mm ?"
    assert max(z["pas"] for z in couture) > 30.0, couture
    # LA CARTE PORTE LES MEMES ZONES : c'est ce qui permet de superposer.
    assert res["carte_chaleur"]["zones"] == masse["zones"]
    dit = [a for a in res["avertissements"] if "COUTURE" in a]
    assert dit, "le trou de couture n'est pas annonce"
    # ET SANS DONNEES, ON DIT QU'ON N'A RIEN REGARDE -- une liste vide se lit
    # « rien a signaler », ce qui est exactement le contraire.
    aveugle = doc_essai([pis(0, 0.45, 40, 0.45, "V2")])
    aveugle["geometry"]["objects"] = [pis(0, 0, 40, 0, "CLK", couture=0.0)]
    nu = ct.analyser(aveugle)
    assert not nu["masse"]["mesure"], nu["masse"]
    dit = [a for a in nu["avertissements"] if "PAS été examiné" in a]
    assert dit, "l'absence d'examen n'est pas dite : %s" % nu["avertissements"]


T("le plan de masse est controle a part, et les zones sont localisees",
  le_plan_de_masse_est_controle_a_part_et_localise)










def le_seuil_de_couture_dit_de_quelle_regle_il_sort():
    """Le seuil de couture suit le FRONT de l'analyse, et le dit.

    LAMBDA/10 AU GENOU : un front de 9 ns tolere des centimetres, un front de
    50 ps quelques millimetres. Sans front, c'est celui de reference (1 ns)
    qui juge, et la source le nomme.
    """
    seuil, source, ecarte = ct._seuil_couture({"temps_montee": 9e-9})
    assert "front" in source, source
    assert seuil > 100.0, "un front de 9 ns tolere des centimetres : %s" % seuil
    assert ecarte == "", "il n'y a plus de seconde regle : %r" % ecarte
    seuil2, source2, _e2 = ct._seuil_couture({"temps_montee": 50e-12})
    assert "front" in source2 and seuil2 < 5.0, (seuil2, source2)
    seuil3, source3, _e3 = ct._seuil_couture({})
    assert "1 ns" in source3, source3
    assert abs(seuil3 - ct._seuil_couture({"temps_montee": 1e-9})[0]) < 1e-9


T("le seuil de couture dit de quelle regle il sort, et ce que l'autre disait",
  le_seuil_de_couture_dit_de_quelle_regle_il_sort)


def une_preselection_vide_ne_se_lit_pas_comme_une_selection_vide():
    """« Aucune piste ne passe » se lisait « tu n'as rien selectionne ».

    Le message parlait des VICTIMES et l'utilisateur le lisait de son
    AGRESSEUR -- qu'il venait de designer, et qui figure bien dans la fiche
    avec sa longueur et ses candidats. Il nomme donc maintenant la selection
    et compte ce qu'elle a fait examiner.
    """
    res = ct.analyser(doc_essai([pis(0, 8.0, 40, 8.0, "LOIN")],
                                distance_max=0.2))
    assert res["couples"] == [] and res["victimes"] == []
    msg = [x for x in res["avertissements"] if "présélection" in x]
    assert msg, res["avertissements"]
    texte = msg[0]
    assert "CLK" in texte, "l'agresseur analyse doit etre nomme : %s" % texte
    assert "candidate" in texte, texte
    assert "ce qui longe" in texte, \
        "le message doit renvoyer au tableau qui dit pourquoi : %s" % texte


T("une preselection vide ne se lit pas comme une selection vide",
  une_preselection_vide_ne_se_lit_pas_comme_une_selection_vide)



















def une_plage_qui_ne_localise_rien_ne_se_peint_pas():
    """Un trait ambre sur toute la piste est pire que pas de trait.

    LA PLAGE PEINTE SUR LE CUIVRE DIT « CE MILLIMETRE-LA ». Quand la
    resolution depasse le quart du parcours, la carte ne distingue plus
    qu'une poignee de zones et la plage couvre le trace entier -- en ayant
    l'air de designer un endroit. On va alors chercher sur le cuivre un
    millimetre que le calcul n'a jamais su nommer.
    """
    axe = np.linspace(0.0, 40.0, 81)
    valeurs = list(np.exp(-((axe - 20.0) ** 2) / 4.0))
    fine = [{"victime": "V", "agresseur": "A", "sens": "next",
             "valeurs": valeurs, "max": max(valeurs), "resolution": 2.0}]
    grosse = [dict(fine[0], resolution=15.0)]
    assert ct.zones_risque(fine, axe, [], [], 0.5), \
        "a 2 mm de resolution sur 40 mm, la plage designe quelque chose"
    assert ct.zones_risque(grosse, axe, [], [], 0.5) == [], \
        "a 15 mm de resolution sur 40 mm, elle ne designe plus rien"
    # ET LE REFUS SE DIT. Sans lui, le bouton « sur le cuivre »
    # disparait de la fiche et l'on cherche ce qu'on a casse : une
    # commande absente est un bug aux yeux de celui qui s'en servait la
    # veille.
    refus = []
    ct.zones_risque(grosse, axe, [], [], 0.5, refus)
    assert len(refus) == 1 and refus[0]["victime"] == "V", refus
    assert "15" in refus[0]["raison"] and "40" in refus[0]["raison"], \
        refus
    muet = []
    ct.zones_risque(fine, axe, [], [], 0.5, muet)
    assert muet == [], "on ne refuse rien quand on rend quelque chose"
    # LE SEUIL EST CELUI QUE LA FICHE EMPLOIE DEJA POUR ALERTER -- le quart du
    # parcours --, et non un second seuil qui aurait derive du premier.
    juste = [dict(fine[0], resolution=9.9)]
    assert ct.zones_risque(juste, axe, [], [], 0.5), juste


T("une plage qui ne localise rien ne se peint pas sur le cuivre",
  une_plage_qui_ne_localise_rien_ne_se_peint_pas)


def la_fiche_dit_ce_qu_il_y_a_a_faire():
    """Une liste de gestes, dans l'ordre de l'effet -- et jamais inventee.

    « -13,8 dB a 12,4 mm » est exact et ne dit pas s'il faut ecarter la piste,
    coudre le plan, ou ne rien faire. Chaque geste est une relecture de ce qui
    a deja ete mesure : aucun calcul de plus, aucune regle de l'art posee en
    douce.
    """
    risques = [{"victime": "V", "agresseur": "A", "s0": 10.0, "s1": 14.0,
                "niveau": 1.0, "niveau_db": -14.0, "justifie": True,
                "zone": ""},
               {"victime": "W", "agresseur": "A", "s0": 30.0, "s1": 33.0,
                "niveau": 0.8, "niveau_db": -22.0, "justifie": False,
                "zone": "couture"}]
    masse = {"seuil": 0.5, "couvert": 0.2, "vain": False,
             "zones": [{"type": "couture", "s0": 5.0, "s1": 9.0, "pas": 4.0},
                       {"type": "fente", "s0": 20.0, "s1": 20.5},
                       {"type": "transition", "s0": 25.0, "s1": 25.0}]}
    faire = ct.actions(risques, masse, [], [], 0.5)
    quoi = [a["quoi"] for a in faire]

    # L'ORDRE EST CELUI DE L'EFFET. Ecarter une piste sous un pic que le
    # dessin n'explique pas ne changerait rien : « aller voir » passe donc
    # APRES le plan, qui en est la cause probable.
    assert quoi[0] == "écarter", quoi
    assert quoi.index("coudre le plan") < quoi.index("aller voir"), quoi
    assert "reprendre le plan" in quoi and "poser un via de masse" in quoi, quoi
    ecarter = faire[0]
    assert ecarter["cible"] == "V" and "10" in ecarter["ou"], ecarter
    assert "resserrement" in ecarter["pourquoi"], ecarter
    # LES TEXTES RENDUS PORTENT LEURS ACCENTS : ils s'affichent tels quels.
    assert "réel" in ecarter["pourquoi"], ecarter
    voir = [a for a in faire if a["quoi"] == "aller voir"][0]
    assert "écarter ne servira à rien" in voir["pourquoi"], voir

    # LE CUIVRE DE MASSE DEJA ROUTE ET NON COUSU DONNE UN GESTE, ET IL PASSE
    # AVANT LES ZONES DU PLAN. C'est le seul geste de la liste dont on
    # connaisse le sens de l'effet a coup sur : une garde flottante ne blinde
    # pas, elle TRANSFERE. Ces deux mesures levaient un avertissement -- donc
    # une phrase a lire -- et ne produisaient aucun geste.
    blindage = {"gardes": [{"net": "GND_GUARD", "longueur": 30.0,
                            "longueur_flottante": 12.0, "couture": 4.8},
                           {"net": "GND_OK", "longueur": 8.0,
                            "longueur_flottante": 0.0, "couture": 0.9}],
                "bords_non_cousus": [{"cote": "gauche", "longueur": 15.0,
                                      "couture": 6.2}]}
    avec = ct.actions(risques, masse, [], [], 0.5, blindage)
    quoi2 = [a["quoi"] for a in avec]
    assert "coudre la garde" in quoi2, quoi2
    assert "coudre le plan arrosé" in quoi2, quoi2
    assert quoi2.index("coudre la garde") < quoi2.index("coudre le plan"), quoi2
    garde = [a for a in avec if a["quoi"] == "coudre la garde"][0]
    # LA GARDE COUSUE N'EN PRODUIT PAS : un geste sur un cuivre deja correct
    # ferait percer pour rien, et decredibiliserait les autres lignes.
    assert garde["cible"] == "GND_GUARD", garde
    assert len([a for a in avec if a["quoi"] == "coudre la garde"]) == 1, avec
    assert "12.00 mm" in garde["ou"] and "30.00 mm" in garde["ou"], garde
    assert "TRANSFÈRE" in garde["pourquoi"], garde
    assert "4.80 mm" in garde["pourquoi"], garde
    bord = [a for a in avec if a["quoi"] == "coudre le plan arrosé"][0]
    assert "gauche" in bord["cible"] and "6.20 mm" in bord["pourquoi"], bord
    # SANS RENSEIGNEMENT DE BLINDAGE, RIEN NE CHANGE : une page qui n'envoie
    # pas la mesure garde exactement le comportement d'avant.
    assert [a["quoi"] for a in ct.actions(risques, masse, [], [], 0.5)] == quoi

    # LA LISTE EST BORNEE : au-dela, on la lit comme un audit et l'on n'en
    # fait aucun.
    beaucoup = [dict(risques[0], s0=float(i), s1=float(i) + 1.0)
                for i in range(20)]
    assert len(ct.actions(beaucoup, masse, [], [], 0.5)) <= ct.ACTIONS_MAX
    # ET LA COUPE SE DIT. Elle coupait EN SILENCE : un dessin a huit gestes en
    # montrait six, et les deux autres n'existaient nulle part -- ni a l'ecran,
    # ni dans le rapport exporte, qui est le fichier qu'on emporte.
    omises = []
    coupe = ct.actions(beaucoup, masse, [], [], 0.5, None, omises)
    assert len(coupe) == ct.ACTIONS_MAX, len(coupe)
    assert len(omises) == 1, omises
    assert omises[0]["nombre"] == 20 + 3 - ct.ACTIONS_MAX, omises
    assert omises[0]["natures"], omises
    assert str(omises[0]["nombre"]) in omises[0]["detail"], omises
    # UNE LISTE QUI TIENT N'INVENTE PAS D'OMISSION.
    courte = []
    ct.actions(risques, masse, [], [], 0.5, None, courte)
    assert courte == [], courte

    # RIEN A FAIRE EST UNE REPONSE, et elle se distingue d'un calcul absent.
    assert ct.actions([], {"zones": []}, [], [], 0.5) == []

    # ET LA FICHE LA PORTE, tiree du meme calcul que la carte.
    res = ct.analyser(doc_essai([pis(0, 0.3, 40, 0.3, "VIC")],
                                distance_max=1.0))
    assert isinstance(res["actions"], list), res.keys()
    vide = ct.analyser(doc_essai([pis(0, 8.0, 40, 8.0, "LOIN")],
                                 distance_max=0.2))
    assert vide["actions"] == []


T("la fiche dit ce qu'il y a a faire, dans l'ordre de l'effet",
  la_fiche_dit_ce_qu_il_y_a_a_faire)






def les_hypotheses_sont_toujours_rendues_et_se_referment():
    """La liste des hypotheses existe meme quand rien n'a ete calcule.

    Un resultat sans ses hypotheses n'est pas verifiable, et le bloc de
    cloture -- ce que le calcul NE COUVRE PAS, avec le SENS de chaque manque --
    doit fermer la liste : une cloture au milieu ne cloture rien.
    """
    for res in (ct.analyser(doc_essai([])),
                ct.analyser(doc_essai([pis(0, 0.45, 40, 0.45, "VIC")]))):
        h = res["hypotheses"]
        assert h, "aucune hypothese rendue"
        cloture = [x for x in h if "NE COUVRE PAS" in x]
        assert len(cloture) == 1, "il faut UNE cloture, pas %d" % len(cloture)
        assert h[-1] is cloture[0], "la cloture doit fermer la liste"
        assert "plancher" in cloture[0].lower(), cloture[0]
    vide = ct.analyser(doc_essai([]))
    assert vide["couples"] == [] and vide["carte_chaleur"] is None
    # LA REPONSE GARDE SA FORME MEME VIDE : une clef absente fait chercher une
    # version, une liste vide dit « rien a signaler ».
    for clef in ("victimes", "risques", "couples"):
        assert vide.get(clef) == [], \
            "« %s » doit être une liste vide, pas absente : %r" \
            % (clef, vide.get(clef))
    dit = [a for a in vide["avertissements"] if "présélection" in a]
    assert dit, "un voisinage vide doit le dire : %s" % vide["avertissements"]


T("les hypotheses sont rendues, et le bloc de cloture ferme la liste",
  les_hypotheses_sont_toujours_rendues_et_se_referment)


# ==========================================================================
print("\nCe qui a ete trouve faux, et qui ne doit plus le redevenir")
# ==========================================================================





def un_longement_lateral_reel_n_est_plus_ecarte_comme_blinde():
    """L'agresseur change de couche, la victime longe A PLAT : elle est RETENUE.

    C'EST LE FAUX NEGATIF LE PLUS COUTEUX DE TOUTE LA SECTION, et il se rendait
    en silence. Les candidats etaient indexes par (net, couche) et leur `type`,
    leur `distance` et leur `blinde` etaient figes a la PREMIERE rencontre : il
    suffisait que l'agresseur ait commence sur une AUTRE couche pour que la
    voisine soit vue « verticale, separee par un plan », donc ecartee -- alors
    qu'elle longe franchement a plat sur la seconde moitie du parcours. Une
    piste a 0,2 mm sur 20 mm ressortait « aucune candidate ne passe la
    preselection », et la fiche annoncait « aucun couple confirme ».
    """
    doc = {
        "format": "cao-crosstalk-1", "carte": "banc", "agresseurs": ["CLK"],
        "stackup": STACK,
        # 20 mm sur Top, puis 20 mm sur Bottom.
        "geometry": {"objects": [pis(0, 0, 20, 0, "CLK", 0),
                                 pis(20, 0, 40, 0, "CLK", 4)]},
        # La victime est sur Bottom du bout en bout : vue par-dessous (avec un
        # plan entre les deux) sur la premiere moitie, A COTE sur la seconde.
        "voisinage": [pis(0, 0.45, 40, 0.45, "VIC", 4)],
        "reference_nets": ["GND"],
        "reglages": {"t_r": 100e-12},
    }
    res = ct.analyser(doc)
    assert res["etape0"]["retenus"] == ["VIC"], \
        "un longement lateral reel doit etre retenu : %s" \
        % [(c["net"], c["type"], c["raison"])
           for c in res["etape0"]["candidats"]]
    c = [x for x in res["etape0"]["candidats"] if x["net"] == "VIC"][0]
    assert c["type"] == "latéral", c["type"]
    assert not c["blinde"], "deux pistes de la meme couche ne sont pas separees"
    # LES DEUX NATURES SONT MESUREES A PART, et la longueur laterale est celle
    # du longement a plat -- 20 mm, pas la somme des deux.
    assert abs(c["longueur_laterale"] - 20.0) < 1.0, c["longueur_laterale"]
    assert abs(c["longueur_verticale"] - 20.0) < 1.0, c["longueur_verticale"]
    assert c["blinde_verticalement"], "un plan separe bien Top de Bottom"
    # ET LE COUPLAGE EST MASSIF : c'est ce que l'ancien code rendait « nul ».
    couple = res["couples"][0]
    assert couple["confirmee"] and couple["next_db"] > -30.0, couple["next_db"]
    # LA PORTION SUPERPOSEE NON COUPLEE EST DITE, jamais comptee zero en
    # silence -- ici elle est blindee, donc une note et non une reserve.
    assert [n for n in res["avertissements"] if "de deux façons" in n], \
        res["avertissements"]


T("un longement lateral reel n'est plus ecarte comme blinde",
  un_longement_lateral_reel_n_est_plus_ecarte_comme_blinde)


def le_couplage_non_calcule_ne_se_lit_plus_comme_un_couplage_nul():
    """Pas de plan de reference : le zero rendu est une ABSENCE de mesure.

    C'EST LE FAUX NEGATIF LE PLUS GRAVE que ce module puisse produire. Quand la
    section droite n'est pas resoluble -- pas de plan sous la piste --, chaque
    conducteur retombe sur sa ligne isolee, [C] et [L] restent DIAGONALES, et
    le terme croise vaut exactement zero. Le calcul aboutit, la carte se
    dessine, la fiche annonce « aucune voisine ne depasse le seuil », et rien
    ne distingue « elles ne couplent pas » de « on n'a pas su calculer ». Or
    c'est justement le cas ou le couplage reel EXPLOSE, faute de chemin de
    retour court.
    """
    sans_plan = {"layers": [
        {"type": "copper", "name": "Top", "thickness": 0.035,
         "role": "signal"},
        {"type": "dielectric", "name": "FR-4", "thickness": 0.2,
         "epsilon_r": 4.3, "tan_delta": 0.02},
        {"type": "copper", "name": "L2", "thickness": 0.035,
         "role": "signal"},
    ]}
    doc = doc_essai([pis(0, 0.45, 40, 0.45, "VIC")])
    doc["stackup"] = sans_plan
    res = ct.analyser(doc)
    assert res["etape0"]["retenus"] == ["VIC"], res["etape0"]["retenus"]
    assert not res["couples"][0]["confirmee"], \
        "sans plan, le terme croise tombe au plancher -- c'est le fait"
    titres = " | ".join(g["titre"] for g in res["graves"])
    assert "NON CALCULÉ" in titres, \
        "un couplage non calcule doit lever une reserve GRAVE : %s" % titres
    dit = [a for a in res["avertissements"] if "NON CALCULÉ" in a]
    assert dit and "plancher" in dit[0].lower(), dit
    assert [a for a in res["avertissements"]
            if "Section droite non résoluble" in a], res["avertissements"]


T("le couplage non calcule ne se lit plus comme un couplage nul",
  le_couplage_non_calcule_ne_se_lit_plus_comme_un_couplage_nul)


def sans_plan_le_seuil_de_distance_s_ouvre_au_lieu_de_se_fermer():
    """Pas de plan : le seuil auto ne tombe pas a trois largeurs de piste.

    LE PIEGE EST DANS LA DEDUCTION ELLE-MEME. `_hauteur_de_couche` rend ZERO
    quand la couche n'a pas de plan de reference, et « 3 x max(largeur,
    hauteur) » tombait alors a 3 x 0,25 = 0,75 mm : le seuil le PLUS SEVERE de
    tous, applique exactement la ou le champ porte le plus loin faute de plan
    pour le borner. Une voisine a 1 mm -- celle qui pose probleme sur une
    carte sans plan -- ressortait « au-dela du seuil de 0,750 mm : vue mais
    non simulee ».
    """
    sans_plan = {"layers": [
        {"type": "copper", "name": "Top", "thickness": 0.035,
         "role": "signal"},
        {"type": "dielectric", "name": "FR-4", "thickness": 0.2,
         "epsilon_r": 4.3, "tan_delta": 0.02},
        {"type": "copper", "name": "L2", "thickness": 0.035,
         "role": "signal"},
    ]}
    # Une voisine a 1 mm de l'axe, soit 0,75 mm de bord a bord.
    doc = doc_essai([pis(0, 1.0, 40, 1.0, "VIC")])
    doc["stackup"] = sans_plan
    res = ct.analyser(doc)
    seuils = res["etape0"]["seuils"]
    assert seuils["hauteur"] == 0.0, seuils
    assert seuils["distance_max"] >= 3.0 - 1e-9, \
        "sans plan, le seuil doit s'OUVRIR : %s" % seuils
    assert "maximum du voisinage" in seuils["source"], seuils["source"]
    assert res["etape0"]["retenus"] == ["VIC"], \
        [(c["net"], c["raison"]) for c in res["etape0"]["candidats"]]
    # ET LE FAIT SE DIT UNE FOIS, EN RESERVE : tout le calcul en depend.
    titres = " | ".join(g["titre"] for g in res["graves"])
    assert "aucun plan de référence" in titres, titres

    # AVEC UN PLAN, LA DEDUCTION NE BOUGE PAS D'UN POUCE.
    avec = ct.analyser(doc_essai([pis(0, 1.0, 40, 1.0, "VIC")]))
    assert avec["etape0"]["seuils"]["hauteur"] > 0
    assert "déduit (3 ×" in avec["etape0"]["seuils"]["source"], \
        avec["etape0"]["seuils"]["source"]


T("sans plan, le seuil de distance s'ouvre au lieu de se fermer",
  sans_plan_le_seuil_de_distance_s_ouvre_au_lieu_de_se_fermer)


def une_fente_sous_le_longement_leve_une_reserve():
    """Le modele suppose un plan continu ; la fente dit qu'il n'y en a pas.

    LA SECTION DROITE QUASI-TEM N'EXISTE QUE SI LE RETOUR PASSE JUSTE DESSOUS.
    Une fente sondee par la page sous un longement retenu rend le chiffre
    OPTIMISTE -- l'inductance mutuelle monte, le couplage reel avec elle --, et
    « sous le seuil » n'y est plus un verdict. Une fente AILLEURS, en revanche,
    ne dit rien de la carte de couplage : elle n'invalide que ce qu'elle
    touche, et confondre les deux ferait une alerte permanente.
    """
    dedans = doc_essai([pis(10, 0.45, 30, 0.45, "VIC")])
    dedans["fentes"] = [{"s": 12.0, "longueur": 6.0,
                         "quoi": "pas de cuivre de masse sous le parcours"}]
    res = ct.analyser(dedans)
    titres = " | ".join(g["titre"] for g in res["graves"])
    assert "plan de référence absent sous" in titres, titres

    ailleurs = doc_essai([pis(10, 0.45, 30, 0.45, "VIC")])
    ailleurs["fentes"] = [{"s": 33.0, "longueur": 4.0,
                           "quoi": "pas de cuivre de masse sous le parcours"}]
    res2 = ct.analyser(ailleurs)
    titres2 = " | ".join(g["titre"] for g in res2["graves"])
    assert "plan de référence absent sous" not in titres2, titres2


T("une fente sous le longement leve une reserve, ailleurs non",
  une_fente_sous_le_longement_leve_une_reserve)






def tan_delta_porte_aussi_sur_l_impedance_caracteristique():
    """[C](1 - j tan d) : lambda ET W portent la racine du facteur.

    L'ETALON EST ANALYTIQUE ET IL NE PARTAGE AUCUNE LIGNE DE CODE avec le
    module : Zc = sqrt(L / (C(1 - j tan d))), gamma = j w sqrt(LC(1 - j tan d)),
    puis S11 d'une ligne chargee par sa reference. La version precedente ne
    multipliait que `racines` : l'impedance caracteristique restait celle du
    sans-perte, une ligne « adaptee » rendait S11 = 0 a la precision machine,
    et le Touchstone exporte -- ce qu'on compare justement a un solveur pleine
    onde -- annoncait une ligne sans aucun retour.
    """
    import cmath
    eps, z0, td, f, d = 4.3, 50.0, 0.02, 5e9, 0.040
    racine = math.sqrt(eps)
    c = racine / (ct.C_0 * z0)
    l = z0 * racine / ct.C_0
    w = 2 * math.pi * f
    s = ct.s_depuis_chaine(
        ct.chaine_mtl(np.array([[l]]), np.array([[c]]), d, [w], td), z0)[0]

    zc = cmath.sqrt(l / (c * complex(1.0, -td)))
    gamma = 1j * w * cmath.sqrt(l * c * complex(1.0, -td))
    th = cmath.tanh(gamma * d)
    zin = zc * (z0 + zc * th) / (zc + z0 * th)
    s11 = (zin - z0) / (zin + z0)
    assert abs(s[0, 0] - s11) < 1e-9, \
        "S11 avec pertes : %s contre %s (analytique)" % (s[0, 0], s11)
    # ET IL N'EST PLUS NUL : c'est le retour qui manquait au fichier exporte.
    assert ct._db(s[0, 0]) > -60.0, ct._db(s[0, 0])
    # SANS PERTES, RIEN NE CHANGE : la ligne adaptee ne reflechit rien.
    sans = ct.s_depuis_chaine(
        ct.chaine_mtl(np.array([[l]]), np.array([[c]]), d, [w], 0.0), z0)[0]
    assert abs(sans[0, 0]) < 1e-12, sans[0, 0]


T("tan delta porte aussi sur l'impedance caracteristique",
  tan_delta_porte_aussi_sur_l_impedance_caracteristique)










def une_preselection_vide_ne_se_lit_pas_comme_un_verdict():
    """Rien n'a ete simule n'est pas « rien ne couple ».

    LA PAGE RENDAIT LE MEME VERDICT dans les deux cas -- « AUCUN COUPLE
    CONFIRME », suivi de « leurs courbes sont tracees quand meme » -- pour une
    presélection vide et pour un calcul complet dont tout tombe sous le seuil.
    Le premier est une absence de mesure, le second en est une ; la clef le
    dit, et le titre de la fiche en depend.
    """
    vide = ct.analyser(doc_essai([]))
    assert vide["preselection_vide"] is True
    loin = ct.analyser(doc_essai([pis(0, 0.45, 40, 0.45, "VIC")],
                                 seuil_db=0.0))
    assert loin["preselection_vide"] is False
    assert loin["couples"] and not loin["couples"][0]["confirmee"]


T("une preselection vide ne se lit pas comme un verdict",
  une_preselection_vide_ne_se_lit_pas_comme_un_verdict)


def une_garde_routee_entre_dans_la_section():
    """La piste de masse tracee entre l'agresseur et sa victime COMPTE.

    ELLE ETAIT JETEE A L'ETAPE 0a, avec le motif « c'est une garde, pas une
    victime » -- ce qui est vrai de son PORT et faux de son CUIVRE. La coupe
    resolue ne la contenait pas : le NEXT annonce etait celui d'un routage
    qu'on n'avait pas fait, et poser une garde ne changeait pas un decibel.

    LES DEUX SENS SONT VERIFIES, et c'est le point. Cousue, elle est tenue a
    zero volt et le couplage TOMBE ; sans vias, elle est posee FLOTTANTE et le
    couplage ne tombe plus -- il remonte au-dessus de ce qu'il vaut sans
    aucune garde, parce qu'un tel cuivre ne blinde pas, il transfere. Un banc
    qui ne verifierait que le premier sens laisserait passer une garde posee a
    zero volt quoi qu'il arrive, qui rassurerait toujours.
    """
    loin = [pis(0, 0.9, 40, 0.9, "VIC")]
    garde = [pis(0, 0.45, 40, 0.45, "GND"), pis(0, 0.9, 40, 0.9, "VIC")]
    nue = [pis(0, 0.45, 40, 0.45, "GND", couture=30.0),
           pis(0, 0.9, 40, 0.9, "VIC")]
    sans = ct.analyser(doc_essai(loin))["couples"][0]["next_db"]
    avec = ct.analyser(doc_essai(garde))
    sans_vias = ct.analyser(doc_essai(nue))["couples"][0]["next_db"]
    assert avec["couples"][0]["next_db"] < sans - 3.0, \
        "une garde cousue doit faire tomber le NEXT : %.2f -> %.2f dB" \
        % (sans, avec["couples"][0]["next_db"])
    assert sans_vias > avec["couples"][0]["next_db"] + 3.0, \
        "une garde non cousue ne doit pas blinder : %.2f dB contre %.2f" \
        % (sans_vias, avec["couples"][0]["next_db"])
    assert sans_vias >= sans - 0.1, \
        "un cuivre flottant TRANSFERE : %.2f dB contre %.2f sans garde" \
        % (sans_vias, sans)

    # ET ELLE N'EST PAS UNE VICTIME POUR AUTANT : pas de port, pas de courbe.
    assert avec["etape0"]["gardes"] == ["GND"], avec["etape0"]["gardes"]
    assert "GND" not in avec["etape0"]["retenus"], avec["etape0"]["retenus"]
    assert "GND" not in [c["victime"] for c in avec["couples"]], \
        "une garde n'a pas de bruit a elle"
    pose = avec["blindage"]["gardes"][0]
    assert abs(pose["longueur"] - 40.0) < 0.1, pose
    assert pose["longueur_flottante"] == 0.0, pose
    flotte = ct.analyser(doc_essai(nue))["blindage"]["gardes"][0]
    assert abs(flotte["longueur_flottante"] - 40.0) < 0.1, flotte


T("une garde routee entre dans la section, cousue ou non",
  une_garde_routee_entre_dans_la_section)


def un_plan_de_bord_non_cousu_cesse_de_blinder():
    """Le plan arrose qui borde le groupe n'est a zero volt que s'il est cousu.

    IL Y ETAIT TOUJOURS, ET PARFAITEMENT. Le solveur posait l'ecart au plan
    lateral quel que soit le nombre de vias de ce plan : un plan sans une seule
    couture sur trente millimetres blindait dans le calcul exactement comme un
    plan cousu au pas du millimetre. Le defaut sortait en TEXTE, et les
    decibels ne bougeaient pas -- ce qui est la pire des deux facons de le
    dire, puisque c'est le chiffre qu'on lit.

    L'ecart de ce cote-la est donc mis a ZERO -- « pas de masse coplanaire
    ici » pour `ligne_mom` --, et le couplage rendu remonte.
    """
    def borde(couture):
        """L'agresseur, avec un plan arrose SERRE et cousu comme on veut."""
        doc = doc_essai([pis(0, 0.9, 40, 0.9, "VIC")])
        for o in doc["geometry"]["objects"]:
            o["gap_left"] = o["gap_right"] = 0.15
            o["couture_left"] = o["couture_right"] = couture
        return doc

    cousu = ct.analyser(borde(0.4))
    nu = ct.analyser(borde(30.0))
    assert nu["couples"][0]["next_db"] > cousu["couples"][0]["next_db"] + 0.3, \
        "un plan non cousu doit faire REMONTER le couplage : %.2f contre %.2f" \
        % (nu["couples"][0]["next_db"], cousu["couples"][0]["next_db"])
    assert not cousu["blindage"]["bords_non_cousus"], \
        cousu["blindage"]["bords_non_cousus"]
    bords = nu["blindage"]["bords_non_cousus"]
    assert bords and bords[0]["couture"] == 30.0, bords
    assert any("PLAN ARROSÉ NON COUSU" in a for a in nu["avertissements"]), \
        nu["avertissements"]
    # UN BORD DONT L'ECART ETAIT DEJA NUL NE PERD RIEN, et ne se compte donc
    # pas : le groupe s'etend au-dela du cuivre que la sonde a trouve de ce
    # cote-la, et l'annoncer ferait compter un defaut sans effet.
    assert len(bords) == 1, bords


T("un plan de bord non cousu cesse de blinder, et le dit",
  un_plan_de_bord_non_cousu_cesse_de_blinder)


def un_net_sur_deux_couches_est_un_seul_conducteur():
    """Un net est un NOEUD ELECTRIQUE : il n'a qu'une paire de ports.

    LE CAS EST ORDINAIRE SUR UNE VRAIE CARTE : une voisine longe a plat, puis
    repasse SOUS l'agresseur sur la couche d'en dessous. La preselection range
    par (net, couche) -- il le faut, ce sont deux situations de dessin -- et le
    reseau, lui, indexait par NET. Le dictionnaire `par_net` de `_matrices_bloc`
    ecrasait donc le doublon, et les rangees de [C] et [L] du longement LATERAL
    partaient au conducteur VERTICAL : la victime qui couple a 0,15 mm sortait
    a -300 dB et « non confirmee », pendant que l'autre ligne -- celle que
    l'avertissement annonce comme « non modelisee, elle ressortira au
    plancher » -- portait les -10,6 dB.

    RIEN NE LEVAIT, ET LES DEUX CHIFFRES ETAIENT CREDIBLES. `_fiche_candidat`
    rendant par-dessus le marche la PREMIERE fiche du nom, les deux lignes
    s'affichaient avec la meme distance et la meme couche, dont une au moins
    etait fausse. C'est le resultat faux et silencieux que tout ce module est
    ecrit pour ne pas produire, et il ne demandait qu'un net sur deux couches.
    """
    stack = {"layers": [
        {"type": "copper", "name": "Top", "thickness": 0.035,
         "role": "signal"},
        {"type": "dielectric", "name": "haut", "thickness": 0.2,
         "epsilon_r": 4.3, "tan_delta": 0.02},
        {"type": "copper", "name": "In1", "thickness": 0.035,
         "role": "signal"},
        {"type": "dielectric", "name": "bas", "thickness": 0.2,
         "epsilon_r": 4.3, "tan_delta": 0.02},
        {"type": "copper", "name": "GND", "thickness": 0.035,
         "role": "plane", "net": "GND"},
    ]}
    doc = doc_essai([pis(0, 0.4, 40, 0.4, "DATA"),
                     pis(0, 0.0, 40, 0.0, "DATA", couche=2)])
    doc["stackup"] = stack
    res = ct.analyser(doc)

    # LE TABLEAU GARDE SES DEUX LIGNES : fondre les couches effacerait
    # justement ce qu'on veut lire.
    fiches = [c for c in res["etape0"]["candidats"] if c["net"] == "DATA"]
    assert len(fiches) == 2, fiches
    assert sorted(c["type"] for c in fiches) == ["latéral", "vertical"], fiches

    # LE CALCUL, LUI, N'EN POSE QU'UN CONDUCTEUR.
    assert res["etape0"]["retenus"] == ["DATA"], res["etape0"]["retenus"]
    couples = [c for c in res["couples"] if c["victime"] == "DATA"]
    assert len(couples) == 1, couples

    # ET LA FICHE EST CELLE DU LONGEMENT QUE LA SECTION RESOUT, pas celle du
    # premier candidat venu : c'est la que l'erreur se lisait.
    c = couples[0]
    assert c["type"] == "latéral", c
    assert abs(c["distance"] - 0.15) < 1e-6, c
    assert c["nom_couche"] == "Top", c
    assert c["confirmee"] and c["next_db"] > -60.0, c

    # LA PORTION SUPERPOSEE EST RESOLUE ET COMPTEE, sur la meme ligne -- pas
    # comme un couplage nul, et pas sur une ligne fantome.
    assert c["superposee"] and abs(c["longueur_superposee"] - 40.0) < 1.0, c
    assert any("SUPERPOSÉES" in a for a in res["avertissements"]), \
        res["avertissements"]
    assert any("qu'UN conducteur" in a for a in res["avertissements"]), \
        "la fusion par net doit se dire"


T("un net qui longe sur deux couches reste UN conducteur",
  un_net_sur_deux_couches_est_un_seul_conducteur)






def un_cuivre_non_contigu_le_dit():
    """L'abscisse curviligne SUPPOSE que les troncons se suivent.

    `s` se cumule bout a bout dans l'ordre ou la page envoie les objets, et
    rien ne verifiait que le bout d'un troncon touche le debut du suivant. Une
    liste mal ordonnee donne alors un axe de position FAUX sans que rien ne
    leve : la carte reste lisse, les pics tombent a des millimetres qui
    existent, et aucun chiffre ne parait anormal.

    LE FAUX POSITIF EST LE VRAI RISQUE ICI : une alerte qui se declenche sur
    une liaison ordinaire ferait ignorer toutes les autres. Le premier cas est
    donc un parcours normal, et il doit rester MUET.
    """
    def ordre(objets):
        doc = doc_essai([pis(0, 0.4, 40, 0.4, "VIC")])
        doc["geometry"]["objects"] = objets
        return [a for a in ct.analyser(doc)["avertissements"]
                if "CONTIGU" in a or "L'ENVERS" in a]

    assert not ordre([pis(0, 0, 20, 0, "CLK"), pis(20, 0, 40, 0, "CLK")]), \
        "un parcours contigu ne doit rien dire"
    casse = ordre([pis(20, 0, 40, 0, "CLK"), pis(0, 0, 20, 0, "CLK")])
    assert casse and "N'EST PAS CONTIGU" in casse[0], casse
    # UN TRONCON RETOURNE EST UN AUTRE DEFAUT : les bouts se touchent, donc
    # l'abscisse reste juste ; c'est le SIGNE du cote qui s'inverse.
    envers = ordre([pis(0, 0, 20, 0, "CLK"), pis(40, 0, 20, 0, "CLK")])
    assert envers and "L'ENVERS" in envers[0], envers


T("un cuivre envoyé dans le désordre le dit", un_cuivre_non_contigu_le_dit)






















def une_fente_change_le_couplage_et_ne_le_laisse_pas_identique():
    """La GEOMETRIE du plan entre dans [C] et [L], pas seulement l'empilage.

    C'EST LE FAUX LE PLUS COUTEUX QUE CE MODULE AIT PORTE, et il ne se voyait
    sur aucune carte : l'empilage est GLOBAL -- il declare qu'une couche est un
    plan --, alors que la presence de cuivre est LOCALE. Deux longements de
    meme dessin, l'un sur plan plein et l'autre survolant une decoupe, se
    resolvaient BIT POUR BIT pareil. Sur une carte d'essai portant expres les
    deux configurations cote a cote, les deux NEXT sortaient au centieme de dB
    identiques, et rien dans le resultat ne s'en etonnait.

    TROIS CHOSES SE VERIFIENT ICI, et elles sont independantes :
      · la fente CHANGE le resultat -- sans quoi le champ ne sert a rien ;
      · quand un SECOND plan existe derriere, le bloc retombe dessus : plus
        loin, donc plus couple, et non pas « non calculable » ;
      · quand il n'y en a pas d'autre, le bloc est declare NON CALCULE et le
        dit dans les defauts graves -- le plancher ne doit jamais se lire
        comme un decouplage.
    """
    # Un empilage a DEUX plans sous la piste : le proche a 0,2 mm, le lointain
    # a 1,2 mm. Une fente dans le proche doit faire descendre la reference.
    deux = {"layers": [
        {"type": "copper", "name": "Top", "thickness": 0.035,
         "role": "signal"},
        {"type": "dielectric", "name": "prepreg", "thickness": 0.2,
         "epsilon_r": 4.3, "tan_delta": 0.02},
        {"type": "copper", "name": "GND1", "thickness": 0.035,
         "role": "plane", "net": "GND"},
        {"type": "dielectric", "name": "coeur", "thickness": 1.0,
         "epsilon_r": 4.3, "tan_delta": 0.02},
        {"type": "copper", "name": "GND2", "thickness": 0.035,
         "role": "plane", "net": "GND"},
    ]}

    def lancer(stack, fentes):
        d = doc_essai([pis(0, 0.5, 40, 0.5, "VICT")])
        d["stackup"] = stack
        if fentes is not None:
            d["fentes"] = fentes
        return ct.analyser(d)

    def next_db(res):
        for c in res["couples"]:
            if c["victime"] == "VICT":
                return c["next_db"]
        raise AssertionError("pas de couple VICT dans le resultat")

    fente = [{"s": 0.0, "longueur": 40.0, "plans": ["GND1"],
              "quoi": "le plan GND1 n'a pas de cuivre de retour"}]

    # (1) DEUX PLANS : la fente fait descendre la reference d'un etage.
    plein = next_db(lancer(deux, []))
    perce = next_db(lancer(deux, fente))
    assert abs(plein - perce) > 0.5, (
        "une fente sur le plan proche ne change RIEN au couplage : %.2f dB"
        " contre %.2f dB. C'est exactement le defaut que ce cas garde."
        % (plein, perce))
    # Plus loin du plan, c'est plus couple : le signe n'est pas libre.
    assert perce > plein, (
        "la reference descendue d'un etage doit COUPLER PLUS : %.2f dB au lieu"
        " de %.2f dB" % (perce, plein))

    # (2) UN SEUL PLAN, PERCE : il ne reste aucune reference. Le bloc n'est pas
    # calculable, et cela se dit -- ce n'est pas un couplage nul.
    nu = lancer(STACK, [{"s": 0.0, "longueur": 40.0, "plans": ["GND"],
                         "quoi": "le plan GND n'a pas de cuivre de retour"}])
    assert next_db(nu) < -100.0, (
        "sans aucune reference, le couplage ne peut pas etre calcule : %.2f dB"
        % next_db(nu))
    titres = " ".join(g["titre"] for g in (nu.get("graves") or []))
    assert "NON CALCUL" in titres.upper(), (
        "le plancher sort sans etre annonce comme non calcule : %s" % titres)

    # (3) UNE FENTE SANS NOM DE PLAN NE FAIT RIEN. Les pages anterieures au
    # champ `plans` n'envoient que la prose ; elles doivent continuer de rendre
    # ce qu'elles rendaient, et non un plancher surgi de nulle part.
    muette = next_db(lancer(STACK, [{"s": 0.0, "longueur": 40.0,
                                     "quoi": "fente sans nom de plan"}]))
    temoin = next_db(lancer(STACK, []))
    assert abs(muette - temoin) < 1e-9, (
        "une fente sans champ `plans` a change le calcul : %.4f contre %.4f"
        % (muette, temoin))


T("une fente sous le longement change le couplage, et le dit quand elle"
  " l'empeche",
  une_fente_change_le_couplage_et_ne_le_laisse_pas_identique)


def les_deux_coefficients_ne_dependent_que_de_la_geometrie():
    """Kb et Kf sortent de [C] et [L] seules -- et le milieu homogene le prouve.

    LE CONTROLE EST CELUI DU MANUEL : en triplaque, le dielectrique remplit
    tout l'espace, Lm/L0 vaut Cm/C0 exactement, et le FEXT s'annule. En
    microruban, une partie du champ passe par l'air, les deux rapports
    divergent, et le FEXT existe. Si ces deux lignes de calcul se trompaient de
    convention -- la mutuelle de Maxwell est NEGATIVE hors diagonale --, ce
    controle-la tomberait le premier.
    """
    def paire(kind, ecart, **plus):
        geo = dict({"t": 35e-6, "epsilon_r": 4.3}, **plus)
        geo["kind"] = kind
        geo["conducteurs"] = [{"w": 0.2e-3, "x": -(0.2e-3 + ecart) / 2.0},
                              {"w": 0.2e-3, "x": (0.2e-3 + ecart) / 2.0}]
        r = tl.solve_multiline(geo)
        return ct.coefficients_couple(r["c"], r["l"], 0, 1)

    kb_m, kf_m = paire("micro", 0.3e-3, h=0.2e-3)
    kb_s, kf_s = paire("strip", 0.3e-3, b=0.4e-3, y0=0.2e-3)
    assert kb_m > 0 and kb_s > 0, (kb_m, kb_s)
    # LE FEXT DU MICRORUBAN EXISTE, celui de la triplaque est nul. On ne compare
    # pas a zero exactement : le cuivre a une epaisseur, elle perturbe un peu
    # l'homogeneite, et c'est physique. Deux ordres de grandeur suffisent a dire
    # que les deux cas ne sont pas le meme.
    assert abs(kf_s) < 0.05 * abs(kf_m), (kf_m, kf_s)
    assert kf_m > 0.01, kf_m

    # ET A ECART SERRE, OU LES DEFINITIONS SE SEPARENT. En milieu homogene,
    # [L] = mu*eps*[C]^-1 impose Lm/L0 = Cm/c[i][i] EXACTEMENT, donc Kf = 0 a
    # tout ecart. A 0,3 mm le couplage est trop faible pour trancher : une
    # premiere version prenait pour C0 la capacite ligne-a-masse, passait
    # ce controle-la, et rendait Kf = -0,026 a 0,1 mm -- un FEXT invente, et
    # un Kb surestime d'autant.
    for ecart in (0.1e-3, 0.05e-3):
        kb_t, kf_t = paire("strip", ecart, b=0.4e-3, y0=0.2e-3)
        assert kb_t > 0.05, (ecart, kb_t)
        assert abs(kf_t) < 1e-4, ("Kf doit etre nul en triplaque", ecart, kf_t)

    # PLUS SERRE, PLUS COUPLE. Une monotonie, c'est peu -- et c'est ce qui
    # attrape une inversion de signe ou un indice permute.
    serre = paire("micro", 0.15e-3, h=0.2e-3)[0]
    large = paire("micro", 1.2e-3, h=0.2e-3)[0]
    assert serre > 3 * large, (serre, large)

    # UNE MATRICE DIAGONALE -- section non resolue -- REND ZERO, et ce zero est
    # celui de l'appelant a distinguer : voir `mesure` sur chaque bloc.
    diag_c = [[1e-10, 0.0], [0.0, 1e-10]]
    diag_l = [[4e-7, 0.0], [0.0, 4e-7]]
    assert ct.coefficients_couple(diag_c, diag_l, 0, 1) == (0.0, 0.0)
    # ET UNE MATRICE VIDE DE SENS NE LEVE PAS : elle rend zero, parce qu'un
    # solveur en echec ne doit pas faire tomber toute la fiche.
    assert ct.coefficients_couple([[0.0, 0.0], [0.0, 0.0]],
                                  [[0.0, 0.0], [0.0, 0.0]], 0, 1) == (0.0, 0.0)


T("les deux coefficients ne dependent que de la geometrie",
  les_deux_coefficients_ne_dependent_que_de_la_geometrie)


def le_niveau_2_repond_sans_tension_ni_protocole():
    """Ni tension, ni protocole, ni classe : le front de reference, et un
    tuple de diagnostic complet par paire.

    LE RESULTAT EST UNE FRACTION DE L'AGRESSEUR : un echelon unitaire, des
    lignes adaptees. Sans front saisi ni classe connue, c'est 1 ns qui juge,
    et la fiche le dit.
    """
    vois = [pis(0, 0.95, 12, 0.95, "VIC"),
            pis(12, 0.35, 22, 0.35, "VIC"),
            pis(22, 0.95, 40, 0.95, "VIC")]
    res = ct.analyser(doc_essai(vois, distance_max=1.5, t_r=0))
    assert res["t_r"] == 1e-9 and "1 ns" in res["source_tr"], \
        (res["t_r"], res["source_tr"])
    assert "touchstone" not in res and "mode" not in res
    c = res["couples"][0]
    for cle in ("k_total", "next", "next_pc", "next_db", "fext", "fext_pc",
                "fext_db", "statut_next", "statut_fext", "statut", "td_s",
                "sature"):
        assert cle in c, "le tuple de diagnostic n'a pas « %s »" % cle
    assert abs(c["k_total"] - 2.0 * c["kb_max"]) < 1e-6, c
    assert abs(c["next_pc"] - 100.0 * c["next"]) < 1e-2, c
    assert c["statut"] in ("vert", "orange", "rouge"), c["statut"]
    assert c["next"] <= c["kb_max"] + 1e-9, "le NEXT ne depasse pas Kb"

    # LA CARTE DESIGNE LA SECTION SERREE, ET ELLE SEULE.
    ligne = [x for x in res["carte_chaleur"]["lignes"]
             if x["sens"] == "next"][0]
    axe = res["carte_chaleur"]["axe"]
    vals = ligne["valeurs"]
    dedans = [v for x, v in zip(axe, vals) if 13.0 <= x <= 21.0]
    dehors = [v for x, v in zip(axe, vals) if x <= 10.0 or x >= 24.0]
    assert min(dedans) > 3.0 * max(dehors), (max(dehors), min(dedans))
    zones = res["risques"]
    assert len(zones) == 1, zones
    assert abs(zones[0]["s0"] - 12.0) < 1.5, zones[0]
    assert abs(zones[0]["s1"] - 22.0) < 1.5, zones[0]
    assert c["resolution_next"] < 1.0, c["resolution_next"]
    # LE FEXT N'A PAS DE COURBE : il co-propage. Son niveau est au tableau.
    assert res["axes"]["fext"]["lignes"] == 0 and \
        res["axes"]["fext"]["raison"], res["axes"]


T("le niveau 2 repond sans tension ni protocole",
  le_niveau_2_repond_sans_tension_ni_protocole)


def le_mode_simple_ne_prend_pas_un_zero_non_calcule_pour_un_decouplage():
    """Une section non resolue rend Kb = 0, et ce zero n'est pas une mesure.

    C'EST LE FAUX NEGATIF LE PLUS GRAVE QUE CE MODE PUISSE PRODUIRE, et il
    serait parfaitement muet : la carte se dessine, la zone reste bleue, et
    l'on conclut « ca ne couple pas ici » la ou l'on n'a pas su calculer. Or
    c'est precisement la ou le plan de reference manque que le couplage reel
    est le plus fort, faute de chemin de retour court.
    """
    # 0,01 mm DE JOUR AU MILIEU : la section n'y est pas resoluble, et le
    # solveur le refuse -- a raison. (Un cuivre qui CHEVAUCHE, comme ce cas
    # l'employait d'abord, est ecarte des la preselection : il ne longe pas,
    # et le test ne passait que parce que « absente » se lisait « non
    # mesuree ».)
    vois = [pis(0, 0.95, 12, 0.95, "VIC"),
            pis(12, 0.26, 22, 0.26, "VIC"),
            pis(22, 0.95, 40, 0.95, "VIC")]
    doc = doc_essai(vois, distance_max=1.5)
    res = ct.analyser(doc)
    c = res["couples"][0]
    assert c["mesure_partielle"] is True, c
    titres = [g["titre"] for g in res["graves"]]
    assert any("n'y sont pas des mesures" in t for t in titres), titres
    dit = [x for x in res["avertissements"] if "NON RÉSOLUE" in x]
    assert dit, res["avertissements"]
    assert "absence de mesure" in dit[0], dit[0]

    # EN PARTIE SEULEMENT : ce n'est pas « non calcule », il y a un Kb.
    assert c["non_calcule"] is False and c["kb_max"] > 0, c

    # SUR TOUT LE LONGEMENT, AUCUN CHIFFRE -- et la fiche doit le dire par
    # couple, pas seulement dans une reserve : sans quoi la page la classait
    # hors du classement, ce qui se lisait « elle ne couple pas ».
    # 0,01 mm DE JOUR : le solveur ne resout pas la section, sur toute la
    # longueur. (Un cuivre qui CHEVAUCHE, lui, est ecarte des la
    # preselection -- ce n'est pas une voisine.)
    tout = doc_essai([pis(0, 0.26, 40, 0.26, "VIC")], distance_max=1.5)
    nul = ct.analyser(tout)["couples"][0]
    assert nul["non_calcule"] is True, nul
    assert nul["kb_max"] == 0.0 and nul["confirmee"] is False, nul
    assert "pas un couplage nul" in nul["raison"], nul

    # ET UN DESSIN SAIN NE LEVE RIEN : une reserve qui s'affiche a chaque
    # analyse cesse d'etre lue, et emporte les vraies avec elle.
    sain = doc_essai([pis(0, 0.95, 40, 0.95, "VIC")], distance_max=1.5)
    bon = ct.analyser(sain)
    assert bon["couples"][0]["mesure_partielle"] is False, bon["couples"][0]
    assert not [x for x in bon["avertissements"] if "NON RÉSOLUE" in x]


T("le niveau 2 ne prend pas un zero non calcule pour un decouplage",
  le_mode_simple_ne_prend_pas_un_zero_non_calcule_pour_un_decouplage)














def la_coupe_des_gestes_garde_chaque_nature():
    """Sept « ecarter » ne font pas disparaitre « coudre le plan ».

    LA COUPE A SIX GESTES gardait les six premiers, et sur une vraie carte les
    six etaient des « ecarter » : le seul geste sur le plan de masse passait
    dans « 2 gestes de plus ». Un geste d'une autre nature apprend plus que le
    septieme du meme genre.
    """
    risques = [{"victime": "V%d" % k, "agresseur": "A", "s0": float(k),
                "s1": float(k) + 1.0, "niveau": 1.0, "niveau_db": -10.0 - k,
                "justifie": True, "zone": ""} for k in range(7)]
    masse = {"zones": [{"type": "couture", "s0": 2.0, "s1": 14.0,
                        "pas": 12.0}], "seuil": 4.0, "vain": False}
    omises = []
    g = ct.actions(risques, masse, [], [], 0.5, None, omises)
    assert len(g) == ct.ACTIONS_MAX, g
    assert any(x["quoi"] == "coudre le plan" for x in g), \
        [x["quoi"] for x in g]
    # L'ORDRE RESTE CELUI DE L'EFFET : les « ecarter » d'abord.
    assert g[0]["quoi"] == "écarter" and g[-1]["quoi"] == "coudre le plan", \
        [x["quoi"] for x in g]
    # ET CE QUI EST COUPE SE DIT, AVEC SA NATURE.
    assert omises and omises[0]["nombre"] == 2, omises
    assert omises[0]["natures"] == ["écarter"], omises


T("la coupe des gestes garde chaque nature",
  la_coupe_des_gestes_garde_chaque_nature)






# ==========================================================================
print("\nLe niveau 2 : les formules, les statuts, le front")
# ==========================================================================

def les_formules_du_niveau_2():
    """NEXT sature et non sature, FEXT, k_total, statuts -- a la main.

    UN LONGEMENT UNIFORME : Kb = 5 %, Kf = 2 %, T_d = 100 ps.
      t_r = 1 ns   : 2 T_d = 200 ps < t_r -> NEXT = Kb.2T_d/t_r = 1 %
                     FEXT = |Kf|.T_d/t_r = 0,2 %
      t_r = 100 ps : 2 T_d >= t_r          -> NEXT = Kb = 5 % (sature)
                     FEXT = 2 %
    """
    lent = ct.niveau2([(0.05, 0.02, 100e-12)], 1e-9)
    assert not lent["sature"], lent
    assert abs(lent["next"] - 0.01) < 1e-9, lent
    assert abs(lent["fext"] - 0.002) < 1e-9, lent
    assert abs(lent["k_total"] - 0.10) < 1e-9, lent
    assert abs(lent["next_db"] + 40.0) < 1e-6, lent
    assert lent["statut"] == "vert", lent
    vif = ct.niveau2([(0.05, 0.02, 100e-12)], 100e-12)
    assert vif["sature"] and abs(vif["next"] - 0.05) < 1e-9, vif
    assert abs(vif["fext"] - 0.02) < 1e-9, vif
    assert vif["statut_next"] == "orange" and vif["statut_fext"] == "vert"
    assert vif["statut"] == "orange", vif
    # LE MEME LONGEMENT COUPE EN DEUX MORCEAUX REND LE MEME CHIFFRE.
    deux = ct.niveau2([(0.05, 0.02, 40e-12), (0.05, 0.02, 60e-12)], 1e-9)
    assert abs(deux["next"] - lent["next"]) < 1e-12, (deux, lent)
    # UN COUPLAGE NON UNIFORME : chaque morceau compte pour son Kb, et la
    # saturation se lit sur le plus fort.
    mix = ct.niveau2([(0.10, 0.0, 50e-12), (0.01, 0.0, 50e-12)], 1e-9)
    assert abs(mix["next"] - (0.10 * 100e-12 + 0.01 * 100e-12) / 1e-9) < 1e-12
    assert ct.niveau2([(0.10, 0.0, 1e-9)], 100e-12)["next"] == 0.10
    # LES SEUILS : vert < 3 %, orange de 3 a 7 %, rouge > 7 %, reglables.
    assert ct.statut(0.029) == "vert" and ct.statut(0.03) == "orange"
    assert ct.statut(0.07) == "orange" and ct.statut(0.0701) == "rouge"
    assert ct.statut(0.05, 0.01, 0.04) == "rouge"
    assert ct.pire_statut(["vert", "rouge", "orange"]) == "rouge"
    assert ct.pire_statut([]) == "vert"


T("les formules du niveau 2, saturees ou non, et les statuts",
  les_formules_du_niveau_2)


def le_front_se_deduit_de_la_classe_ou_se_saisit():
    """Saisi, il fait foi ; vide, il sort de la classe de l'agresseur."""
    vois = [pis(0, 0.45, 40, 0.45, "VIC")]
    doc = doc_essai(vois, t_r=0)
    doc["natures"] = {"CLK": "Horloge"}
    res = ct.analyser(doc)
    assert res["t_r"] == 2e-9 and "Horloge" in res["source_tr"], \
        (res["t_r"], res["source_tr"])
    # LES FRONTS DU PANNEAU DE VERIFICATION PASSENT DEVANT.
    doc = doc_essai(vois, t_r=0, tr_classes={"Horloge": 500e-12})
    doc["natures"] = {"CLK": "Horloge"}
    assert ct.analyser(doc)["t_r"] == 500e-12
    # SAISI, IL FAIT FOI, CLASSE OU PAS.
    doc = doc_essai(vois, t_r=300e-12)
    doc["natures"] = {"CLK": "Lent"}
    res = ct.analyser(doc)
    assert res["t_r"] == 300e-12 and res["source_tr"] == "saisi", res
    # UN FRONT PLUS LENT DONNE MOINS DE BRUIT, jamais plus.
    rapide = ct.analyser(doc_essai(vois, t_r=50e-12))["couples"][0]
    lent = ct.analyser(doc_essai(vois, t_r=5e-9))["couples"][0]
    assert lent["next"] < rapide["next"] and lent["fext"] < rapide["fext"]
    assert rapide["sature"] and not lent["sature"], (rapide, lent)
    # UN FRONT NEGATIF EST REFUSE.
    try:
        ct.analyser(doc_essai(vois, t_r=-1e-9))
    except ct.ErreurCrosstalk:
        pass
    else:
        raise AssertionError("un front negatif a ete accepte")


T("le front se deduit de la classe du net, ou se saisit",
  le_front_se_deduit_de_la_classe_ou_se_saisit)


def les_seuils_drc_se_reglent_et_le_statut_suit():
    """Des seuils plus severes font rougir ce qui etait vert."""
    vois = [pis(0, 0.45, 40, 0.45, "VIC")]
    base = ct.analyser(doc_essai(vois))["couples"][0]
    niveau = max(base["next"], base["fext"])
    severe = ct.analyser(doc_essai(vois, seuil_orange=niveau / 4,
                                   seuil_rouge=niveau / 2))
    assert severe["couples"][0]["statut"] == "rouge", severe["couples"][0]
    assert severe["statut"] == "rouge", severe["statut"]
    laxiste = ct.analyser(doc_essai(vois, seuil_orange=0.9, seuil_rouge=0.95))
    assert laxiste["couples"][0]["statut"] == "vert"
    assert laxiste["seuils"] == {"orange": 0.9, "rouge": 0.95,
                                 "confirmation_db": -40.0}, laxiste["seuils"]
    for o, r in ((0.07, 0.03), (0.0, 0.05), (0.03, 1.2)):
        try:
            ct.analyser(doc_essai(vois, seuil_orange=o, seuil_rouge=r))
        except ct.ErreurCrosstalk as exc:
            assert "DRC" in exc.message, exc.message
        else:
            raise AssertionError("seuils %g / %g acceptes" % (o, r))


T("les seuils DRC se reglent, et le statut suit",
  les_seuils_drc_se_reglent_et_le_statut_suit)


def une_piste_seulement_superposee_a_son_chiffre():
    """Une victime SOUS l'agresseur, sans plan entre les deux : chiffree.

    ELLE RESSORTAIT « NON CALCULEE » : le solveur de section range ses
    conducteurs cote a cote. Elle passe maintenant par le solveur a deux
    niveaux -- milieu homogene, donc Kf nul et FEXT nul.
    """
    stack = {"layers": [
        {"type": "copper", "name": "Top", "thickness": 0.035,
         "role": "signal"},
        {"type": "dielectric", "name": "haut", "thickness": 0.2,
         "epsilon_r": 4.3},
        {"type": "copper", "name": "In1", "thickness": 0.035,
         "role": "signal"},
        {"type": "dielectric", "name": "bas", "thickness": 0.2,
         "epsilon_r": 4.3},
        {"type": "copper", "name": "GND", "thickness": 0.035,
         "role": "plane", "net": "GND"},
    ]}
    doc = doc_essai([pis(0, 0.0, 40, 0.0, "DATA", couche=2)])
    doc["stackup"] = stack
    res = ct.analyser(doc)
    c = res["couples"][0]
    assert c["victime"] == "DATA" and c["superposee"], c
    assert not c["non_calcule"], c
    assert c["k_total"] > 0.05 and c["next"] > 0, c
    assert c["fext"] == 0.0, c
    assert abs(c["longueur_superposee"] - 40.0) < 0.5, c
    # LE MEME SOLVEUR QUE LA VERIFICATION DE CARTE : memes hauteurs.
    geo = ct.geometrie_superposee(stack["layers"], 0, 2)
    assert geo is not None and geo[2] is None, geo
    assert abs(geo[0] - (0.2 + 0.035 + 0.2 + 0.0175)) < 1e-9, geo
    # ET ELLE SE PLACE SUR LA CARTE LOCALE, A SON ABSCISSE : une victime qui
    # ne passe sous l'agresseur que de 10 a 25 mm y monte la, et nulle part
    # ailleurs.
    doc = doc_essai([pis(10, 0.0, 25, 0.0, "DATA", couche=2)])
    doc["stackup"] = stack
    res = ct.analyser(doc)
    ligne = ligne_de(res, "DATA", "next")
    axe = res["carte_chaleur"]["axe"]
    dedans = [v for x, v in zip(axe, ligne["valeurs"]) if 11.0 <= x <= 24.0]
    dehors = [v for x, v in zip(axe, ligne["valeurs"]) if x <= 9.0 or x >= 26.0]
    assert dedans and min(dedans) > 0, "la superposition doit etre tracee"
    assert max(dehors) == 0.0, "rien hors de la superposition : %g" % max(dehors)
    z = res["risques"]
    assert z and abs(z[0]["s0"] - 10.0) < 1.0 and abs(z[0]["s1"] - 25.0) < 1.0, z
    # ET SEPAREE PAR UN PLAN, ELLE EST ECARTEE COMME AVANT.
    doc = doc_essai([pis(0, 0.0, 40, 0.0, "DATA", couche=4)])
    res = ct.analyser(doc)
    assert not res["etape0"]["retenus"], res["etape0"]


T("une piste seulement superposee a son chiffre",
  une_piste_seulement_superposee_a_son_chiffre)


def le_classement_suit_le_statut_puis_le_niveau():
    """La victime la plus bruitee passe en tete, et le rang le dit."""
    res = ct.analyser(doc_essai([pis(0, 0.45, 40, 0.45, "PRES"),
                                 pis(0, -0.80, 40, -0.80, "LOIN")],
                                distance_max=2.0))
    rangs = [(c["rang"], c["victime"]) for c in res["couples"]]
    assert rangs[0] == (1, "PRES"), rangs
    assert res["statut"] == ct.pire_statut(
        [c["statut"] for c in res["couples"] if c["confirmee"]])


def les_pertes_ne_font_que_retirer_du_bruit():
    """R et G au genou : moins de bruit, jamais plus -- et peu a 1 ns."""
    def doc(t_r, pertes):
        d = doc_essai([], t_r=t_r, pertes=pertes)
        d["geometry"]["objects"] = [pis(0, 0, 150, 0, "CLK")]
        d["voisinage"] = [pis(0, 0.45, 150, 0.45, "VIC")]
        return ct.analyser(d)["couples"][0]
    for t_r, borne in ((1e-9, 0.90), (100e-12, 0.60)):
        sans, avec = doc(t_r, False), doc(t_r, True)
        assert avec["next"] < sans["next"] and avec["fext"] < sans["fext"], \
            (t_r, sans, avec)
        assert avec["next"] > borne * sans["next"], (t_r, sans["next"],
                                                     avec["next"])
        assert avec["pertes"] and not sans["pertes"]
    a = ct.alpha_genou(50.0, 3.3, 0.2, 4.3, 0.02, 1e-9)
    assert 0.1 < a < 1.0, "alpha a 350 MHz, 0,2 mm FR-4 : %g Np/m" % a
    assert ct.alpha_genou(50.0, 3.3, 0.2, 4.3, 0.02, 100e-12) > a


T("les pertes R et G ne font que retirer du bruit",
  les_pertes_ne_font_que_retirer_du_bruit)


def plusieurs_agresseurs_se_somment_vers_une_victime():
    """Deux agresseurs selectionnes : pire cas arithmetique, ou quadratique."""
    assert abs(ct.somme_agresseurs([0.03, 0.04], "rss") - 0.05) < 1e-12
    assert abs(ct.somme_agresseurs([0.03, 0.04], "pire") - 0.07) < 1e-12
    res = {}
    for mode in ("pire", "rss"):
        d = doc_essai([pis(0, 0.45, 40, 0.45, "VIC"),
                       pis(0, 0.9, 40, 0.9, "AG2")], somme=mode)
        d["agresseurs"] = ["CLK", "AG2"]
        c = [x for x in ct.analyser(d)["couples"] if x["victime"] == "VIC"][0]
        assert c.get("somme") and c["somme"]["mode"] == mode, c
        assert [x["agresseur"] for x in c["somme"]["agresseurs"]] == \
            ["CLK", "AG2"], c["somme"]
        res[mode] = c["somme"]["next"]
    assert res["rss"] < res["pire"], res
    try:
        ct.analyser(doc_essai([pis(0, 0.45, 40, 0.45, "VIC")], somme="max"))
    except ct.ErreurCrosstalk:
        pass
    else:
        raise AssertionError("une somme inconnue a ete acceptee")


T("plusieurs agresseurs se somment vers une victime, en phase ou en RSS",
  plusieurs_agresseurs_se_somment_vers_une_victime)


T("le classement suit le statut, puis le niveau",
  le_classement_suit_le_statut_puis_le_niveau)


# ==========================================================================
print("\nLe niveau 2, de bout en bout, contre une solution EXACTE")
# --------------------------------------------------------------------------
# LES CAS PRECEDENTS VERIFIENT QUE LES DEUX MODES S'ACCORDENT ENTRE EUX. Ils
# ne disent pas s'ils ont raison ensemble : une erreur commune -- dans la
# section, le placement des rubans, l'ordre des ports -- passerait les deux.
#
# LA TRIPLAQUE A UNE SOLUTION EXACTE (Cohn, ruban mince), et elle fixe trois
# chiffres sans rien emprunter au code teste :
#   · Kb = (Ze - Zo) / 2(Ze + Zo), exactement, en milieu homogene ;
#   · Kf = 0 : une seule vitesse, donc pas de FEXT ;
#   · T_d = L.sqrt(er)/c, quel que soit l'ecart a la voisine.
# Le troisieme a trouve un defaut : le eps_eff par conducteur de
# `solve_multiline` grossissait avec le couplage, et T_d sortait a 284 ps au
# lieu de 276,7 sur 40 mm a 0,1 mm d'ecart -- l'axe de la carte avec lui.
# ==========================================================================

STRIP = {"layers": [
    {"type": "copper", "name": "GND1", "thickness": 0.035, "role": "plane",
     "net": "GND"},
    {"type": "dielectric", "name": "p1", "thickness": 0.25, "epsilon_r": 4.3,
     "tan_delta": 0.0},
    {"type": "copper", "name": "In1", "thickness": 0.001, "role": "signal"},
    {"type": "dielectric", "name": "p2", "thickness": 0.25, "epsilon_r": 4.3,
     "tan_delta": 0.0},
    {"type": "copper", "name": "GND2", "thickness": 0.035, "role": "plane",
     "net": "GND"},
]}


def kb_cohn(w, s, b):
    """Kb exact d'une paire triplaque centree, ruban mince (Cohn, 1955)."""
    from scipy.special import ellipk

    def z(k):
        return ellipk(1.0 - k * k) / ellipk(k * k)
    t1 = math.tanh(math.pi * w / (2 * b))
    t2 = math.tanh(math.pi * (w + s) / (2 * b))
    ze, zo = z(t1 * t2), z(t1 / t2)
    return (ze - zo) / (ze + zo) / 2.0


def doc_triplaque(w, s, t_r=None):
    """Deux pistes paralleles de 40 mm sur In1, sans masse coplanaire.

    CUIVRE D'UN MICRON : la reference est a ruban mince, et 35 um sur 0,5 mm
    de dielectrique deplacent deja Kb de quelques pour cent.
    """
    def piste(y, net):
        p = pis(0, y, 40, y, net, couche=2, w=w)
        p.update(copper_thickness=0.001, gap_left=0.0, gap_right=0.0)
        return p
    reglages = {"distance_max": 2.0, "t_r": t_r or 0}
    doc = {"format": "cao-crosstalk-1", "carte": "banc",
           "agresseurs": ["CLK"], "stackup": STRIP,
           "geometry": {"objects": [piste(0.0, "CLK")]},
           "voisinage": [piste(w + s, "VIC")],
           "reference_nets": ["GND"], "reglages": reglages}
    return doc


def le_mode_simple_retrouve_la_triplaque_exacte():
    """Kb, Kf.T_d et T_d du mode SIMPLE, contre Cohn -- trois ecarts."""
    td_exact = 40e-3 * math.sqrt(4.3) / tl.C_0
    for w, s in ((0.15, 0.1), (0.15, 0.3), (0.25, 0.5)):
        c = ct.analyser(doc_triplaque(w, s, t_r=1e-9))["couples"][0]
        ref = kb_cohn(w, s, 0.5)
        # 1 A 1,3 % MESURES, du serre au lache. La tolerance couvre le cuivre
        # d'un micron et la section posee par la page ; une permutation de
        # ports ou une mutuelle de mauvais signe la depasse de tres loin.
        assert abs(c["kb_max"] / ref - 1.0) < 0.03, (w, s, c["kb_max"], ref)
        assert abs(c["k_total"] / (2.0 * ref) - 1.0) < 0.03, (w, s, c)
        assert c["fext"] < 1e-5, ("FEXT nul en triplaque", w, s, c["fext"])
        assert abs(c["td_s"] / td_exact - 1.0) < 1e-4, (
            "T_d de %.1f ps au lieu de %.1f -- a %.2f mm d'ecart"
            % (1e12 * c["td_s"], 1e12 * td_exact, s))


T("le niveau 2 retrouve la triplaque exacte : k_total, FEXT nul, T_d",
  le_mode_simple_retrouve_la_triplaque_exacte)










def deux_niveaux_tient_cohn_et_rejoint_le_fil_fin():
    """`section_deux_niveaux` (larges faces) : Cohn, exact, en triplaque, un
    ruban puis une paire ; et, rubans etroits et loin l'un de l'autre, la
    methode des images a fil fin qu'il remplace."""
    from scipy.special import ellipk
    c0 = 299792458.0
    K = lambda k: ellipk(k * k) / ellipk(1 - k * k)
    w, s, b = 0.15e-3, 0.15e-3, 0.5e-3
    r = tl.section_deux_niveaux([{"x": 0.0, "y": b / 2, "w": w}], b=b, epsilon_r=4.3)
    z = math.sqrt(4.3) / (c0 * r["c"][0, 0])
    z_cohn = 30 * math.pi / math.sqrt(4.3) * K(1 / math.cosh(math.pi * w / (2 * b)))
    assert abs(z / z_cohn - 1) < 2e-3, (z, z_cohn)
    r = tl.section_deux_niveaux([{"x": 0.0, "y": b / 2, "w": w},
                                 {"x": w + s, "y": b / 2, "w": w}], b=b)
    c = r["c"]
    ke = math.tanh(math.pi * w / (2 * b)) * math.tanh(math.pi * (w + s) / (2 * b))
    ko = math.tanh(math.pi * w / (2 * b)) / math.tanh(math.pi * (w + s) / (2 * b))
    for z, k in ((1 / (c0 * (c[0, 0] + c[0, 1])), ke), (1 / (c0 * (c[0, 0] - c[0, 1])), ko)):
        z_cohn = 30 * math.pi / K(k)
        assert abs(z / z_cohn - 1) < 2e-3, (z, z_cohn)
    # le fil fin : 20 um de large, 2 mm d'ecart lateral, un plan
    sys.path.insert(0, os.path.join(RACINE, "python"))
    import analyse_carte as ac
    r = tl.section_deux_niveaux([{"x": 0.0, "y": 0.2e-3, "w": 20e-6},
                                 {"x": 2e-3, "y": 0.4e-3, "w": 20e-6}])
    kb = ct.coefficients_couple(r["c"], r["l"], 0, 1)[0]
    ki = ac._kb_larges_faces(0.2, 0.4, 2.0, 0.02, 0.02)
    assert abs(kb / ki - 1) < 0.05, (kb, ki)
    assert abs(r["c"][0, 1] - r["c"][1, 0]) < 1e-9 * abs(r["c"][0, 1]), r["c"]


T("deux niveaux : Cohn en triplaque, le fil fin a distance",
  deux_niveaux_tient_cohn_et_rejoint_le_fil_fin)


print("\n" + "-" * 62)
print("  %d cas, %s" % (ok + ko, "tous passes" if not ko
                        else "%d en echec" % ko))
sys.exit(1 if ko else 0)
