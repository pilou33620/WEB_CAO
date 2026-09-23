#!/usr/bin/python3
# -*- coding: utf-8 -*-
"""Banc d'essai de l'analyse de crosstalk (python/crosstalk.py).

    python python/test/banc-crosstalk.py

CE QUE CE BANC DOIT ATTRAPER, ET QUI NE SE VOIT PAS AUTREMENT. Toute la chaine
-- matrice S, fenetre, IFFT, axe de position -- rend une carte lisse et coloree
QUELLE QUE SOIT l'erreur qu'on y glisse. Un mapping de ports decale, un ordre
de matrice transpose, un facteur deux sur l'axe du NEXT : rien de tout cela ne
leve, rien ne parait anormal, et la carte reste parfaitement credible. C'est le
pire cas d'un outil de mesure, et c'est exactement ce que les cas ci-dessous
verifient.

CINQ ETALONS, TOUS INDEPENDANTS DU CODE TESTE :

  · LA LIGNE SEULE. Une ligne adaptee a son impedance de reference doit rendre
    S11 = 0 et S21 = exp(-j.beta.L), exactement. C'est la matrice de chaine et
    sa conversion en S qui sont verifiees la, sans aucun couplage ;
  · LA MISE EN CASCADE. Une ligne coupee en deux moities puis recomposee doit
    rendre la matrice de la ligne entiere -- a la precision machine. C'est ce
    qui garantit que le decoupage en blocs, sur lequel repose toute la carte,
    n'ajoute ni ne retranche rien ;
  · LA POSITION. Une victime qui ne longe l'agresseur QUE sur une portion
    connue doit produire son pic de NEXT a l'abscisse ou cette portion
    commence. C'est le seul cas qui verifie l'axe lui-meme, et il est
    construit pour cela : on deplace la portion et le pic doit suivre ;
  · LE TOUCHSTONE RELU PAR UN LECTEUR ECRIT ICI. Le .sNp n'est plus une
    entree -- il ne reste qu'en SORTIE --, mais un fichier de sortie faux
    ferait conclure a un desaccord avec le solveur pleine onde qui n'existerait
    que dans le redacteur. Le lecteur du banc ne partage aucune ligne de code
    avec l'ecrivain, donc aucune erreur commune : il relit le terme croise et
    le recoupe avec le NEXT affiche, ce qui verifie d'un coup l'ordre des
    rangees et la table des ports ;
  · LE PROFIL D'ESPACEMENT, qui vient de la GEOMETRIE et non du calcul
    electromagnetique. C'est le seul temoin independant que la carte ait :
    deux courbes qui ne peuvent pas se tromper de la meme facon. Le banc
    verifie que le recoupement signale un pic que rien ne resserre, et surtout
    qu'il ne signale RIEN sur un longement franc -- une alerte qui se declenche
    a tort fait ignorer toutes les autres.

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
        "analyse": {"f_debut": 0.0, "f_fin": 20e9, "points": 201,
                    "temps_montee": 100e-12},
        "reglages": reglages,
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


def le_reseau_reste_passif_et_reciproque():
    """Un cuivre passif ne rend pas plus qu'il ne recoit, et est symetrique.

    C'est la propriete que `valider_matrice` cherche dans les fichiers
    importes ; la verifier sur le reseau QU'ON SYNTHETISE est ce qui rend le
    controle credible -- un controle qui echouerait sur notre propre reseau ne
    serait pas un controle.
    """
    res = ct.analyser(doc_essai([pis(0, 0.45, 40, 0.45, "VIC")]))
    v = res["validation"]
    assert v["passivite"]["ok"], \
        "sigma_max = %.9f" % v["passivite"]["sigma_max"]
    assert v["reciprocite"]["ok"], \
        "ecart de reciprocite = %.3g" % v["reciprocite"]["ecart"]


T("le reseau synthetise est passif et reciproque",
  le_reseau_reste_passif_et_reciproque)


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


def la_resolution_suit_la_bande_et_la_fenetre():
    """Deux fois plus de bande, deux fois moins de flou -- et Kaiser elargit.

    LA RESOLUTION EST AFFICHEE A COTE DU RESULTAT, donc elle doit etre juste :
    c'est elle qui dit si deux pics sont deux pics ou un seul. Elle ne depend
    QUE de la bande et de la fenetre, et surtout PAS du zero-padding, qui
    interpole sans rien distinguer de plus -- ce dernier point est le plus
    facile a confondre, parce que le padding rend visiblement la courbe plus
    fine.
    """
    voisinage = [pis(0, 0.45, 40, 0.45, "VIC")]

    def res_de(f_fin, **r):
        d = doc_essai(voisinage, **r)
        d["analyse"]["f_fin"] = f_fin
        return ligne_de(ct.analyser(d), "VIC", "next")["resolution"]

    large = res_de(20e9)
    etroite = res_de(10e9)
    assert abs(etroite / large - 2.0) < 0.05, \
        "moitie de bande : %.3f mm contre %.3f mm" % (etroite, large)
    rect = res_de(20e9, fenetre="rect")
    assert large > 2.5 * rect, \
        "Kaiser 8,6 doit elargir : %.3f mm contre %.3f mm" % (large, rect)
    padde = res_de(20e9, zero_pad=8)
    assert abs(padde - large) < 1e-9, \
        "le zero-padding ne doit RIEN changer a la resolution : %.4f contre" \
        " %.4f" % (padde, large)


T("la resolution suit la bande et la fenetre, jamais le padding",
  la_resolution_suit_la_bande_et_la_fenetre)


def une_resolution_hors_d_atteinte_vaut_la_longueur_et_jamais_zero():
    """Quand la bande ne permet meme pas la liaison entiere, on le DIT.

    ZERO SE LIRAIT « INFINIMENT FINE » alors que la verite est « plus grossiere
    que toute la liaison » -- c'est le contresens exact. Pire : zero etant faux
    au sens booleen, ces lignes-la sortaient des avertissements de resolution,
    qui n'avaient donc jamais l'occasion de les signaler. Une valeur fausse ET
    muette est le cumul des deux defauts que ce module existe pour empecher.

    LA LIGNE FEXT, ELLE, N'EST PLUS TRACEE DU TOUT ici, et c'est le correctif
    de l'axe co-propage : a vitesses egales sa loi d'arrivee est PLATE, il
    n'existe aucune abscisse a rendre, et une resolution « egale a la liaison
    entiere » etait la facon polie de dessiner quand meme une courbe qui ne
    designait rien. Le refus se DIT, avec sa raison.
    """
    doc = doc_essai([pis(0, 0.45, 40, 0.45, "VIC")])
    doc["analyse"]["f_fin"] = 5e9          # large fenetre, liaison courte
    res = ct.analyser(doc)
    longueur = res["longueur"]
    for ligne in res["carte_chaleur"]["lignes"]:
        assert ligne["resolution"] > 0, \
            "%s / %s rend une resolution nulle" % (ligne["victime"],
                                                   ligne["sens"])
        assert ligne["resolution"] <= longueur + 1e-6, \
            "une resolution ne depasse pas la liaison : %.3f > %.3f" \
            % (ligne["resolution"], longueur)
    fext = [l for l in res["carte_chaleur"]["lignes"] if l["sens"] == "fext"]
    assert not fext, \
        "a vitesses egales, aucune ligne FEXT ne doit etre tracee : %s" \
        % [l["resolution"] for l in fext]
    assert res["axes"]["fext"]["lignes"] == 0
    assert res["axes"]["fext"]["raison"], \
        "un sens sans axe doit dire pourquoi : %s" % res["axes"]
    assert [a for a in res["avertissements"] if "PAS DE LIGNE FEXT" in a], \
        "le refus doit etre dit : %s" % res["avertissements"]
    # ET CELLE DU NEXT ATTEINT ENFIN L'AVERTISSEMENT : c'est l'objet du
    # correctif precedent, et il tient.
    dit = [a for a in res["avertissements"] if "RÉSOLUTION SPATIALE" in a]
    assert dit, "une carte qui ne distingue rien doit le dire : %s" \
        % res["avertissements"]


T("une resolution hors d'atteinte vaut la longueur, jamais zero",
  une_resolution_hors_d_atteinte_vaut_la_longueur_et_jamais_zero)



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
                                distance_max=2.0, seuil_db=-7.0))
    retenus = sorted(res["etape0"]["retenus"])
    assert retenus == ["LACHE", "SERREE"], \
        "l'etape 0a doit retenir les deux : %s" % retenus
    par_net = dict((c["victime"], c) for c in res["couples"])
    assert par_net["SERREE"]["confirmee"], \
        "SERREE est a %.1f dB" % par_net["SERREE"]["pire_db"]
    lache = par_net["LACHE"]
    assert not lache["confirmee"], \
        "LACHE est a %.1f dB, elle doit tomber sous -7 dB" % lache["pire_db"]
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
    for cle in ("risques", "desaccords"):
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
    assert res["reglages"]["agreger_agresseurs"] is False, \
        "l'agregation ne doit pas etre active par defaut"


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
                          ("ports", [{"nom": "VIC_proche", "index": 1,
                                      "net": "VIC", "bout": "proche"}]),
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


def les_ports_sont_poses_ici_donc_connus():
    """Le mapping n'est plus une saisie : c'est un compte rendu.

    C'EST LE BENEFICE CONCRET DE LA SOURCE UNIQUE. Rien dans un .sNp importe
    ne disait quel port etait le bout proche de quelle piste ; ici, c'est nous
    qui les posons. Le mapping doit donc sortir CONFIRME d'office, complet --
    deux bouts par conducteur -- et dans l'ordre des conducteurs du reseau.
    """
    res = ct.analyser(doc_essai([pis(0, 0.45, 40, 0.45, "VIC")]))
    m = res["mapping"]
    assert m["confirme"] is True, "un mapping pose ici ne s'attend pas"
    assert m["fichier_ports"] == 4, m
    noms = [p["nom"] for p in m["ports"]]
    assert noms == ["CLK_proche", "CLK_lointain", "VIC_proche",
                    "VIC_lointain"], noms
    # LA TABLE SE LIT PAR PISTE -- ses deux bouts a la suite --, mais l'INDEX
    # est celui de la MATRICE, ou les N bouts proches precedent les N bouts
    # lointains. Les deux ordres different, et c'est exactement le genre de
    # decalage qui echangerait NEXT et FEXT sans rien lever.
    assert [p["index"] for p in m["ports"]] == [1, 3, 2, 4], m["ports"]
    assert [p["bout"] for p in m["ports"]] == ["proche", "lointain",
                                               "proche", "lointain"], m["ports"]
    roles = dict((p["net"], p["role"]) for p in m["ports"])
    assert roles == {"CLK": "agresseur", "VIC": "victime"}, roles


T("les ports sont poses ici, donc connus, et le mapping est un compte rendu",
  les_ports_sont_poses_ici_donc_connus)


def nombres_snp(texte):
    """Un lecteur .sNp minimal, ecrit ICI : c'est l'etalon du redacteur.

    Il est volontairement bete -- il ramasse les nombres et ignore tout le
    reste. C'est ce qui en fait un temoin : il ne partage aucune ligne de code
    avec `touchstone_np`, donc aucune erreur commune.
    """
    vals = []
    for ligne in texte.splitlines():
        ligne = ligne.split("!")[0].strip()
        if not ligne or ligne.startswith("#"):
            continue
        vals.extend(float(x) for x in ligne.split())
    return vals


def le_touchstone_reste_une_sortie_et_elle_est_fidele():
    """Le .sNp exporte porte EXACTEMENT la matrice qu'on a lue.

    IL N'EST PLUS UNE ENTREE, mais il reste ce qui rend le resultat
    verifiable ailleurs -- et un fichier de sortie faux est aussi couteux
    qu'une entree fausse : il ferait conclure a un desaccord avec le solveur
    pleine onde qui n'existerait que dans le redacteur. On le relit donc avec
    un lecteur ecrit ici, et l'on recoupe le terme croise avec le NEXT
    affiche.
    """
    res = ct.analyser(doc_essai([pis(0, 0.45, 40, 0.45, "VIC")]))
    vals = nombres_snp(res["touchstone"])
    n = res["mapping"]["fichier_ports"]
    par_freq = 1 + 2 * n * n
    assert len(vals) % par_freq == 0, \
        "%d nombres pour %d ports : ce n'est pas un multiple de %d" \
        % (len(vals), n, par_freq)
    points = len(vals) // par_freq
    assert points == res["validation"]["bande"]["points"], \
        "%d enregistrements pour %d points de bande" \
        % (points, res["validation"]["bande"]["points"])
    tableau = np.array(vals).reshape(points, par_freq)
    freqs = tableau[:, 0]
    assert freqs[0] == 0.0, "le fichier ne part pas du continu : %g" % freqs[0]
    plat = tableau[:, 1:].reshape(points, n, n, 2)
    s = plat[..., 0] + 1j * plat[..., 1]
    # LE TERME CROISE RELU DOIT REDONNER LE NEXT AFFICHE. C'est ce qui
    # verifie du meme coup l'ordre des rangees et la table des ports : une
    # transposition echangerait NEXT et FEXT, deux chiffres plausibles l'un a
    # la place de l'autre.
    ports = dict((p["nom"], p["index"] - 1) for p in res["mapping"]["ports"])
    croise = s[:, ports["VIC_proche"], ports["CLK_proche"]]
    next_db = max(ct._db(x) for x in croise)
    couple = res["couples"][0]
    assert abs(next_db - couple["next_db"]) < 0.01, \
        "NEXT relu %.3f dB, affiche %.3f dB" % (next_db, couple["next_db"])
    verdict = ct.valider_matrice(freqs, s)
    assert verdict["passivite"]["ok"], verdict["passivite"]
    assert verdict["reciprocite"]["ok"], verdict["reciprocite"]


T("le Touchstone exporte reste une sortie, et il est fidele",
  le_touchstone_reste_une_sortie_et_elle_est_fidele)


def le_couplage_vertical_est_annonce_comme_non_modelise():
    """Une voisine de couche adjacente ne doit pas ressortir « decouplee ».

    C'EST LE MENSONGE LE PLUS COUTEUX QUE CETTE SECTION PUISSE FAIRE. Le
    solveur de section range ses conducteurs COTE A COTE et ne sait pas les
    EMPILER : une piste superposee traverse le reseau comme une ligne isolee
    et ressort au plancher. Or deux pistes superposees couplent souvent PLUS
    que les memes cote a cote -- lire « -300 dB » la ou le couplage est
    maximal est exactement le resultat faux et silencieux qu'on refuse.
    """
    empile = {"layers": [
        {"type": "copper", "name": "Top", "thickness": 0.035,
         "role": "signal"},
        {"type": "dielectric", "name": "prepreg", "thickness": 0.1,
         "epsilon_r": 4.3, "tan_delta": 0.02},
        {"type": "copper", "name": "In1", "thickness": 0.035,
         "role": "signal"},
        {"type": "dielectric", "name": "coeur", "thickness": 0.2,
         "epsilon_r": 4.3, "tan_delta": 0.02},
        {"type": "copper", "name": "GND", "thickness": 0.035,
         "role": "plane", "net": "GND"},
    ]}
    doc = doc_essai([pis(0, 0.0, 40, 0.0, "DESSOUS", couche=2)])
    doc["stackup"] = empile
    res = ct.analyser(doc)
    fiche = [c for c in res["etape0"]["candidats"] if c["net"] == "DESSOUS"]
    assert fiche and fiche[0]["retenu"], \
        "une voisine superposee doit rester CANDIDATE : %s" % fiche
    assert fiche[0]["type"] == "vertical", fiche[0]
    dit = [a for a in res["avertissements"] if "VERTICAL" in a]
    assert dit, "le couplage vertical non modelise n'est pas annonce : %s" \
        % res["avertissements"]
    assert "plancher" in dit[0], dit[0]
    # ET IL N'A PAS DE PROFIL D'ESPACEMENT : on ne sait pas OU poser un
    # recouvrement mesure en longueur, et une position inventee serait pire
    # que pas de profil du tout.
    assert "DESSOUS" not in res["etape0"]["espacements"], \
        "un profil a ete fabrique pour un recouvrement vertical"
    dit = [a for a in res["avertissements"]
           if "profil d'espacement" in a]
    assert dit, "l'absence de profil n'est pas dite : %s" \
        % res["avertissements"]


T("le couplage vertical est annonce non modelise, jamais rendu decouple",
  le_couplage_vertical_est_annonce_comme_non_modelise)


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


def un_pic_sans_resserrement_est_signale_et_jamais_l_inverse():
    """Le recoupement des deux courbes : c'est lui qui rend la carte lisible.

    LA REGLE EST PRUDENTE PAR CONSTRUCTION, et ce cas verifie les deux cotes
    de cette prudence. Un pic la ou l'espacement vaut son medians ne se
    signale PAS -- il est a sa place ; un pic la ou l'espacement est large et
    plat se signale ; et si une zone de vigilance tombe au meme endroit, ce
    n'est plus un desaccord mais une EXPLICATION, ce qui n'est pas la meme
    chose a lire.
    """
    axe = [float(i) for i in range(41)]
    # Espacement serre partout, sauf de 25 a 35 mm ou il triple.
    espacement = [0.2 if not (25 <= s <= 35) else 0.6 for s in axe]
    espacements = {"VIC": {"valeurs": espacement, "median": 0.2,
                           "min": 0.2, "max": 0.6, "couverture": 1.0}}

    def carte(pics):
        valeurs = [0.01] * len(axe)
        for s in pics:
            valeurs[int(s)] = 1.0
        return [{"victime": "VIC", "agresseur": "CLK", "sens": "next",
                 "valeurs": valeurs, "resolution": 1.0}]

    # (1) UN PIC AU RESSERREMENT NE SE SIGNALE PAS.
    assert ct.desaccords(carte([10.0]), espacements, axe, [], 1.25) == [], \
        "un pic a l'espacement median a ete signale"
    # (2) UN PIC LA OU L'ESPACEMENT EST LARGE ET PLAT SE SIGNALE.
    sortie = ct.desaccords(carte([30.0]), espacements, axe, [], 1.25)
    assert len(sortie) == 1, sortie
    assert sortie[0]["s"] == 30.0 and sortie[0]["verdict"] == "inexplique", \
        sortie[0]
    assert abs(sortie[0]["rapport"] - 3.0) < 0.01, sortie[0]
    # (3) UNE ZONE DE VIGILANCE AU MEME ENDROIT EN FAIT UNE EXPLICATION.
    zones = [{"type": "fente", "s0": 29.0, "s1": 31.0, "detail": ""}]
    sortie = ct.desaccords(carte([30.0]), espacements, axe, zones, 1.25)
    assert sortie[0]["verdict"] == "plan" and sortie[0]["zone"] == "fente", \
        sortie[0]
    # (4) LE FEXT N'EST PAS RECOUPE : il ne localise rien a vitesses egales,
    # et lui appliquer la regle produirait un desaccord a chaque fois.
    fext = carte([30.0])
    fext[0]["sens"] = "fext"
    assert ct.desaccords(fext, espacements, axe, [], 1.25) == [], \
        "le FEXT ne doit pas etre recoupe"
    # (5) ET LE SEUIL SE REGLE : a 4, un rapport de 3 ne se signale plus.
    assert ct.desaccords(carte([30.0]), espacements, axe, [], 4.0) == [], \
        "le rapport de desaccord n'est pas respecte"


T("un pic sans resserrement est signale, et jamais l'inverse",
  un_pic_sans_resserrement_est_signale_et_jamais_l_inverse)


def le_recoupement_tourne_sur_une_vraie_carte():
    """Sur une liaison ordinaire, le recoupement ne crie pas au loup.

    UNE ALERTE QUI SE DECLENCHE A TORT FAIT IGNORER TOUTES LES AUTRES, et
    c'est le risque propre a ce controle. Sur un longement franc, dont chaque
    pic tombe la ou la voisine arrive, il ne doit rien signaler -- et le
    resultat doit quand meme porter la liste, vide, plutot que rien.
    """
    res = ct.analyser(doc_essai([pis(10, 0.45, 40, 0.45, "VIC")]))
    assert "desaccords" in res, "la liste doit exister meme vide"
    inexpliques = [d for d in res["desaccords"]
                   if d["verdict"] == "inexplique"]
    assert not inexpliques, \
        "un longement franc ne doit rien signaler : %s" % inexpliques
    dit = [a for a in res["avertissements"] if "NON JUSTIFIÉ" in a]
    assert not dit, dit


T("le recoupement ne crie pas au loup sur une liaison ordinaire",
  le_recoupement_tourne_sur_une_vraie_carte)


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
    # plus longues. Un reglage qui n'agirait pas serait pire qu'absent.
    large = ct.analyser(doc_essai([pis(12, 0.45, 28, 0.45, "VIC")],
                                  risque=0.2))["risques"]
    etendue = lambda ps: sum(p["s1"] - p["s0"] for p in ps)
    assert etendue(large) > etendue(plages), \
        "un seuil plus bas doit peindre plus : %.2f contre %.2f mm" \
        % (etendue(large), etendue(plages))
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

def la_bande_part_du_continu_et_la_resolution_visee_se_dit():
    """La grille est harmonique depuis zero, et ce qu'elle permet est annonce.

    LE CONTINU N'EST PLUS UNE EXTRAPOLATION : c'est nous qui choisissons ou
    echantillonner, donc la grille part de zero par construction. Ce qui reste
    a verifier est double -- qu'elle en parte VRAIMENT (sans le point k = 0, la
    ligne de base de la reponse temporelle est decalee et personne ne le voit),
    et que la resolution VOULUE, quand elle est saisie, soit comparee a celle
    qu'on atteint, en hertz plutot qu'en « elargissez la bande ».
    """
    res = ct.analyser(doc_essai([pis(0, 0.45, 40, 0.45, "VIC")]))
    bande = res["validation"]["bande"]
    assert bande["f_min"] == 0.0, "la bande ne part pas du continu : %s" % bande
    assert bande["constant"] and not bande["extrapole"], bande
    assert bande["points"] == 201, bande

    # UNE GRILLE QUI NE PART PAS DU CONTINU EST REFUSEE, et le refus dit que
    # le defaut est INTERNE : personne d'autre ne fabrique cette grille.
    try:
        ct.verifier_bande(np.linspace(1e9, 20e9, 20))
    except ct.ErreurCrosstalk as exc:
        assert "continu" in exc.message, exc.message
    else:
        raise AssertionError("une grille sans continu a ete acceptee")
    try:
        ct.verifier_bande(np.array([0.0, 1e9, 3e9, 6e9, 10e9,
                                    15e9, 21e9, 28e9]))
    except ct.ErreurCrosstalk as exc:
        assert "constant" in exc.message, exc.message
    else:
        raise AssertionError("une grille a pas variable a ete acceptee")

    # LA RESOLUTION VISEE : hors d'atteinte, on dit de combien et jusqu'ou.
    atteinte = max(l["resolution"] for l in res["carte_chaleur"]["lignes"])
    serre = ct.analyser(doc_essai([pis(0, 0.45, 40, 0.45, "VIC")],
                                  resolution_cible=atteinte / 4.0))
    dit = [a for a in serre["avertissements"] if "RÉSOLUTION VISÉE" in a]
    assert dit, "la resolution visee manquee n'est pas dite : %s" \
        % serre["avertissements"]
    requis = ct.bande_pour_resolution(20e9, atteinte, atteinte / 4.0)
    assert abs(requis - 80e9) < 1e6, "%.4g Hz au lieu de 80 GHz" % requis
    assert "80" in dit[0], "le haut de bande requis n'est pas chiffre : %s" \
        % dit[0]
    # ATTEINTE, elle se dit aussi : un silence se lirait « pas regarde ».
    large = ct.analyser(doc_essai([pis(0, 0.45, 40, 0.45, "VIC")],
                                  resolution_cible=atteinte * 4.0))
    dit = [a for a in large["avertissements"] if "Résolution visée" in a]
    assert dit and "atteinte" in dit[0], large["avertissements"]


T("la bande part du continu, et la resolution visee est chiffree",
  la_bande_part_du_continu_et_la_resolution_visee_se_dit)


def une_matrice_non_passive_est_denoncee():
    """Une matrice ou sigma_max depasse 1 est signalee, pas avalee.

    UNE MATRICE NON PASSIVE REND UNE CARTE PARFAITEMENT LISSE, et c'est tout
    le probleme : la reponse temporelle diverge sans que rien ne le montre.
    Le controle porte sur les valeurs singulieres, qui sont la seule chose qui
    le voie -- et il vaut MAINTENANT pour notre propre calcul, puisque c'est
    lui qui fabrique la matrice : personne d'autre ne le fera.
    """
    doc = doc_essai([pis(0, 0.45, 40, 0.45, "VIC")])
    parcours = ct._parcours(doc["geometry"]["objects"])
    candidats, _seuils = ct.candidats_geometriques(
        parcours, doc["voisinage"], STACK["layers"], ct.DEFAUTS, {"GND"},
        {"CLK"}, [])
    retenus = [c for c in candidats if c["retenu"]]
    f, s, _z, _infos = ct.reseau_synthetise(
        STACK["layers"], parcours, retenus, {"GND"}, doc["analyse"],
        ct.DEFAUTS, [])
    verdict = ct.valider_matrice(f, s)
    assert verdict["passivite"]["ok"], "notre propre reseau doit etre passif"
    verdict = ct.valider_matrice(f, s * 1.2)
    assert not verdict["passivite"]["ok"], "une matrice x1,2 doit etre refusee"
    assert verdict["passivite"]["sigma_max"] > 1.1, verdict["passivite"]
    casse = s.copy()
    casse[:, 1, 0] *= 3.0
    verdict = ct.valider_matrice(f, casse)
    assert not verdict["reciprocite"]["ok"], "S != S^T doit etre vu"


T("une matrice non passive ou non reciproque est denoncee",
  une_matrice_non_passive_est_denoncee)


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


def l_asymetrie_n_est_alertee_que_si_l_espacement_ne_l_explique_pas():
    """Deux victimes qui ne prennent pas la meme chose : cela DEPEND.

    C'EST LE CAS DU CAHIER DES CHARGES -- agresseur au centre, une victime de
    chaque cote --, et c'est aussi celui ou la version precedente criait a
    tort. Un agresseur n'est presque jamais equidistant de ses deux voisines a
    TOUT INSTANT : l'ecart de couplage est alors exactement ce que la
    geometrie annonce, et le signaler ferait chercher une dissymetrie de plan
    qui n'existe pas. On compare donc l'ecart de couplage a l'ecart
    d'ESPACEMENT, et l'alerte est reservee au cas ou la geometrie ne
    l'explique pas.
    """
    # (1) DEUX ESPACEMENTS TRES DIFFERENTS : l'ecart est ANNONCE, pas alerte.
    res = ct.analyser(doc_essai([pis(0, 0.45, 40, 0.45, "GAUCHE"),
                                 pis(0, -1.60, 40, -1.60, "DROITE")],
                                distance_max=2.0, asymetrie_db=3.0))
    assert len(res["couples"]) == 2, res["couples"]
    assert res["asymetries"], "l'ecart n'est pas releve du tout"
    a = res["asymetries"][0]
    assert a["haute"] == "GAUCHE" and a["basse"] == "DROITE", a
    assert a["ecart_db"] >= 3.0, a
    assert a["explique"], "l'espacement explique cet ecart : %s" % a["detail"]
    crie = [x for x in res["avertissements"] if x.startswith("ASYMÉTRIE")]
    assert not crie, "un ecart annonce par la geometrie ne s'alerte pas : %s" \
        % crie
    dit = [x for x in res["avertissements"] if "ANNONCÉ PAR LA" in x]
    assert dit, "l'ecart doit quand meme se lire : %s" % res["avertissements"]

    # (2) DEUX ESPACEMENTS COMPARABLES ET DEUX COUPLAGES QUI NE LE SONT PAS :
    # la geometrie n'explique rien, et c'est alors une anomalie. On la fabrique
    # ici -- aucune section droite ne la produirait, et c'est justement ce qui
    # en fait un cas d'essai.
    couples = [{"agresseur": "CLK", "victime": "GAUCHE", "role": "victime",
                "paire": False, "confirmee": True, "pire_db": -30.0},
               {"agresseur": "CLK", "victime": "DROITE", "role": "victime",
                "paire": False, "confirmee": True, "pire_db": -45.0}]
    memes = {"GAUCHE": {"median": 0.20}, "DROITE": {"median": 0.21}}
    sortie = ct._asymetries(couples, 6.0, memes)
    assert sortie and not sortie[0]["explique"], sortie
    # ET LE SENS COMPTE : la plus ELOIGNEE qui prend le plus n'est jamais
    # explique par l'espacement, quel que soit l'ecart entre les profils.
    inverse = {"GAUCHE": {"median": 1.60}, "DROITE": {"median": 0.20}}
    sortie = ct._asymetries(couples, 6.0, inverse)
    assert sortie and not sortie[0]["explique"], sortie


T("l'asymetrie n'est alertee que si l'espacement ne l'explique pas",
  l_asymetrie_n_est_alertee_que_si_l_espacement_ne_l_explique_pas)


def une_coincidence_certaine_d_avance_n_explique_rien():
    """Quand les zones de vigilance couvrent tout, « le plan l'explique » ment.

    C'EST LE CAS LE PLUS SOURNOIS DE TOUTE LA SECTION, et il se produit sans
    qu'on ait rien fait de mal : le seuil de couture se deduit du HAUT DE
    BANDE, on monte le haut de bande pour affiner la carte, le seuil tombe a
    un dixieme de millimetre, et le parcours entier devient une zone de
    vigilance. Chaque pic tombe alors dans une zone -- forcement --, et la
    fiche annonce « explique par le plan » pour tous. Le verdict s'est rendu
    tout seul : c'est un resultat faux, et il est silencieux.

    ON MESURE DONC L'UNION, et au-dela de la moitie du parcours le verdict
    devient « indecidable ». Ce qui reste vrai est dit -- le dessin des pistes
    n'explique pas ce pic --, ce qui n'est pas etabli est dit aussi.
    """
    # (1) L'UNION, ET NON LA SOMME. Les deux cotes du parcours sont regardes
    # separement : leurs intervalles se recouvrent, et les additionner
    # annoncerait couramment plus de cent pour cent.
    deux_cotes = [{"s0": 0.0, "s1": 6.0, "cote": "gauche"},
                  {"s0": 0.0, "s1": 6.0, "cote": "droite"}]
    assert abs(ct._couvert(deux_cotes, 10.0) - 0.6) < 1e-9, \
        "l'union de deux cotes identiques vaut un seul intervalle"
    disjoints = [{"s0": 0.0, "s1": 2.0}, {"s0": 8.0, "s1": 12.0}]
    assert abs(ct._couvert(disjoints, 10.0) - 0.4) < 1e-9, \
        "ce qui deborde du parcours ne compte pas au-dela de sa longueur"
    assert ct._couvert([], 10.0) == 0.0 and ct._couvert(deux_cotes, 0.0) == 0.0

    # (2) LE VERDICT SUIT. Meme pic, memes zones : seul le drapeau change.
    axe = np.linspace(0.0, 10.0, 41)
    valeurs = list(np.exp(-((axe - 5.0) ** 2) / 0.5))
    ligne = [{"victime": "V", "agresseur": "A", "sens": "next",
              "valeurs": valeurs, "max": max(valeurs), "resolution": 0.3}]
    esp = {"V": {"valeurs": [0.8] * axe.size, "median": 0.3,
                 "min": 0.8, "max": 0.8, "couverture": 1.0}}
    zones = [{"type": "couture", "s0": 4.0, "s1": 6.0, "detail": "trou"}]
    net = ct.desaccords(ligne, esp, axe, zones, 1.25, vain=False)
    assert net and net[0]["verdict"] == "plan", net
    flou = ct.desaccords(ligne, esp, axe, zones, 1.25, vain=True)
    assert flou and flou[0]["verdict"] == "indecidable", flou
    assert flou[0]["zone"] == "couture", \
        "la zone reste nommee : c'est la CONCLUSION qu'on retire, pas le fait"

    # (3) ET SANS ZONE DU TOUT, le drapeau ne change rien : un pic que rien
    # n'explique reste inexplique.
    assert ct.desaccords(ligne, esp, axe, [], 1.25,
                         vain=True)[0]["verdict"] == "inexplique"

    # (4) LA PLAGE PEINTE SUR LE CUIVRE NE DIT PLUS LE CONTRAIRE DE LA FICHE.
    # Un pic explique par le plan n'est pas un pic explique par l'ecart : le
    # peindre en ambre -- « ca se corrige en ecartant » -- contredirait la
    # phrase que la fiche ecrit sur le meme pic trois lignes plus haut.
    for verdict, plages in ((net, "plan"), (flou, "indecidable")):
        risques = ct.zones_risque(ligne, axe, verdict, zones, 0.5)
        assert risques, "une plage est attendue autour du pic (%s)" % plages
        assert not risques[0]["justifie"], \
            "un pic que le DESSIN n'explique pas ne se peint pas « corrigez" \
            " l'ecart » (%s)" % plages
    # Sans aucun pic releve, la plage redevient ordinaire.
    assert ct.zones_risque(ligne, axe, [], zones, 0.5)[0]["justifie"]


T("une coincidence certaine d'avance n'explique rien, et le dit",
  une_coincidence_certaine_d_avance_n_explique_rien)


def le_seuil_de_couture_dit_de_quelle_regle_il_sort():
    """Le signal d'abord, la bande en repli -- et l'autre regle s'ecrit.

    LE HAUT DE BANDE EST UN REGLAGE, monte pour affiner la carte. Il fixait
    le seuil des que la bande montait -- 100 GHz exige un dixieme de
    millimetre, la ou un front de 9 ns tolere des centimetres --, et chaque
    trou entre deux vias devenait une alarme sans que le cuivre ait bouge.
    Le modele, lui, jugeait deja une garde flottante sur le seul front : la
    fiche demandait de coudre ce que la matrice S tenait pour cousu.
    """
    # UN FRONT DECRIT : sa regle tranche, meme quand la bande est haute.
    lent = {"temps_montee": 9e-9, "f_fin": 100e9}
    seuil, source, ecarte = ct._seuil_couture(lent)
    assert "front" in source, source
    assert seuil > 100.0, "un front de 9 ns tolere des centimetres : %s" % seuil
    # LA REGLE DE LA BANDE S'ECRIT QUAND MEME, chiffree, avec sa raison.
    assert "λ/10" in ecarte and "mm" in ecarte and "carte" in ecarte, ecarte

    # UN FRONT RAPIDE ET UNE BANDE RAISONNABLE : toujours le front.
    seuil2, source2, _e2 = ct._seuil_couture({"temps_montee": 50e-12,
                                              "f_fin": 5e9})
    assert "front" in source2 and seuil2 < 5.0, (seuil2, source2)

    # RIEN NE DECRIT LE SIGNAL : la bande est le seul repere, elle tranche.
    seuil4, source4, _e4 = ct._seuil_couture({"f_fin": 100e9})
    assert "λ/10" in source4 or seuil4 < 0.5, (seuil4, source4)

    # SANS BANDE, UNE SEULE REGLE S'APPLIQUE : on n'ecrit alors rien de plus.
    # Une parenthese « l'autre regle donnerait » sur une regle qui n'a pas
    # tourne serait une valeur inventee.
    seuil3, source3, ecarte3 = ct._seuil_couture({"temps_montee": 0.0,
                                                  "f_fin": 0.0})
    assert seuil3 > 0 and "repli" in source3, (seuil3, source3)
    assert ecarte3 == "", "une seule regle : rien a comparer (%r)" % ecarte3

    # ET QUAND LES DEUX REGLES TOMBENT SUR LE MEME MILLIMETRE, ON SE TAIT.
    assert ct._seuil_couture({"f_fin": 20e9})[2] == "",         "deux regles qui disent la meme chose ne s'ecrivent pas deux fois"


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


def les_decibels_disent_de_quelle_bande_ils_parlent():
    """Le pire couplage est un maximum SUR LA BANDE ANALYSEE. Laquelle ?

    LA BANDE EST UN REGLAGE, et un reglage qu'on a de bonnes raisons de monter
    haut : la resolution spatiale de la carte ne depend que d'elle. Le signal,
    lui, ne monte pas avec. Un front de 9 ns ne porte rien au-dela de 39 MHz,
    et annoncer « -13 dB » pour un couplage qui n'existe qu'a 80 GHz est un
    chiffre exact et trompeur -- le pire genre. La fiche dit donc OU se trouve
    ce pire point, et ce que le couplage vaut sous le genou du front.

    ELLE NE CORRIGE RIEN ET NE REFUSE RIEN : monter la bande reste legitime, et
    c'est meme la seule facon d'affiner la carte. C'est la LECTURE des
    decibels qui change, pas le calcul.
    """
    voisine = [pis(0, 0.3, 40, 0.3, "VIC")]
    # Un front lent et une bande tres haute : le cas de figure exact.
    lent = doc_essai(voisine, distance_max=1.0)
    lent["analyse"] = {"f_debut": 0.0, "f_fin": 100e9, "points": 201,
                       "temps_montee": 9e-9}
    res = ct.analyser(lent)
    assert res["f_genou"] > 0, "le genou du front saisi doit etre rendu"
    assert abs(res["f_genou"] - 0.35 / 9e-9) < 1.0, res["f_genou"]
    c = [x for x in res["couples"] if x["victime"] == "VIC"][0]
    assert c["f_pire"] > 1.5 * res["f_genou"], \
        "sur un front lent, le pire point est haut : %s" % c["f_pire"]
    # LE NIVEAU RETENU EST LA CRETE TEMPORELLE : le front lui-meme envoye
    # dans le reseau. Elle parle du signal par construction -- ou que soit le
    # pire point de la bande --, et la reserve « hors de la bande du signal »
    # n'a donc plus lieu d'etre pour ce couple.
    assert res.get("bande_signal"), "la passe temporelle doit se dire"
    assert "Passe temporelle" in res["bande_signal"]["detail"],         res["bande_signal"]
    assert c.get("crete") is not None, c
    assert c["crete_db"] < c["pire_db"] - 10.0,         "sur un front lent, la crete doit etre tres inferieure au maximum"         " pris sur toute la bande : %s" % c
    assert not [x for x in res["avertissements"]
                if "genou du front" in x and "« VIC »" in x],         res["avertissements"]
    assert c["hors_bande_signal"] is False, c

    # LE MODULE DE S AU GENOU RESTE RENDU, a titre de repere -- et il MAJORE
    # la crete : c'est tout le motif de la passe temporelle.
    assert "pire_db_genou" in c, c
    assert c["crete_db"] < c["pire_db_genou"], c

    fin = doc_essai(voisine, distance_max=1.0)
    fin["analyse"] = {"f_debut": 0.0, "f_fin": 100e9, "points": 201,
                      "temps_montee": 500e-12}
    autre = ct.analyser(fin)
    c2 = [x for x in autre["couples"] if x["victime"] == "VIC"][0]
    assert "pire_db_genou" in c2, c2
    assert c2["pire_db_genou"] <= c2["pire_db"] + 1e-9,         "le pire sous le genou ne peut pas depasser le pire sur la bande"
    assert c2.get("crete") is not None and c2["crete_db"] <= c2["pire_db"], c2

    net = ct.analyser(doc_essai(voisine, distance_max=1.0))
    assert not [x for x in net["avertissements"] if "genou du front" in x], \
        net["avertissements"]
    # LE DRAPEAU EXISTE PARTOUT ET VAUT FAUX ICI. Un champ absent finirait
    # par se lire comme un champ a faux, et une fiche saine doit dire « non »
    # tout aussi explicitement qu'une fiche douteuse dit « oui ».
    for x in net["couples"]:
        assert x["hors_bande_signal"] is False, x

    # SANS TEMPS DE MONTEE SAISI, PAS DE COMPARAISON : le genou se deduirait
    # de la bande et vaudrait la bande -- une colonne qui recopie sa voisine.
    muet = doc_essai(voisine, distance_max=1.0)
    muet["analyse"] = {"f_debut": 0.0, "f_fin": 100e9, "points": 201}
    sortie = ct.analyser(muet)
    assert sortie["f_genou"] == 0.0, sortie["f_genou"]
    assert not [x for x in sortie["avertissements"] if "genou du front" in x]


T("les decibels disent de quelle bande ils parlent",
  les_decibels_disent_de_quelle_bande_ils_parlent)


def une_bande_trop_basse_ne_se_lit_pas_comme_un_silence():
    """« Aucun couple confirme » a 100 MHz n'est pas une bonne nouvelle.

    LE COUPLAGE CROIT AVEC LA FREQUENCE tant que la liaison est courte devant
    la longueur d'onde -- SIX DECIBELS PAR OCTAVE, ce que ce cas verifie de
    bout en bout. Analyser jusqu'a 10 MHz une liaison de 40 mm, c'est la
    regarder a un millieme de longueur d'onde : le maximum sur cette bande
    tombe des dizaines de dB sous ce que la MEME geometrie donne au genou d'un
    front de 25 ps, et le verdict devient « rien a signaler » PAR
    CONSTRUCTION. C'est le pire silence de tout l'outil -- juste, propre, et
    obtenu par un reglage que rien n'affiche.

    DEUX CHOSES SONT DONC EXIGEES ICI : que la fiche le DISE, et qu'elle
    montre quand meme les courbes. Une figure vide se lit « aucun couplage »,
    alors que le fait est « du couplage, sous le seuil que vous avez pose ».
    """
    voisine = [pis(0, 0.3, 40, 0.3, "VIC")]
    bas = doc_essai(voisine, distance_max=1.0, seuil_db=-40.0)
    bas["analyse"] = {"f_debut": 0.0, "f_fin": 10e6, "points": 17,
                      "temps_montee": 25e-12}
    res = ct.analyser(bas)
    c = [x for x in res["couples"] if x["victime"] == "VIC"][0]
    assert not c["confirmee"], \
        "a 100 MHz, cette voisine doit tomber sous -40 dB : %.1f dB" \
        % c["pire_db"]
    # (1) LA COURBE EST LA QUAND MEME, et elle se sait non confirmee.
    l = ligne_de(res, "VIC", "next")
    assert l is not None, "la courbe doit etre tracee meme sous le seuil"
    assert l["confirmee"] is False, l
    assert res["victimes"] == [], \
        "une non confirmee n'est pas une victime : %s" % res["victimes"]
    # (2) ET LA FICHE DIT QUE C'EST LE REGLAGE QUI A RENDU CE VERDICT.
    dit = [x for x in res["avertissements"] if "BANDE ANALYSÉE" in x]
    assert dit, "la bande trop basse doit se dire : %s" % res["avertissements"]
    assert "10 MHz" in dit[0], "la bande se lit dans son ordre de grandeur," \
        " pas en « 0.01 GHz » : %s" % dit[0]
    assert "14 GHz" in dit[0], "le genou du front doit etre chiffre : %s" \
        % dit[0]
    assert [g for g in res["graves"] if "en dessous du front" in g["titre"]], \
        "elle invalide le verdict : elle est grave, et le resume doit la voir"
    # (3) LA MEME CARTE, LA MEME GEOMETRIE, AVEC UNE BANDE QUI VA JUSQU'AU
    # SIGNAL : le couplage apparait. C'est ce qui prouve que le silence
    # d'au-dessus venait du reglage et non du dessin.
    haut = doc_essai(voisine, distance_max=1.0, seuil_db=-40.0)
    haut["analyse"] = {"f_debut": 0.0, "f_fin": 20e9, "points": 201,
                       "temps_montee": 25e-12}
    autre = ct.analyser(haut)
    c2 = [x for x in autre["couples"] if x["victime"] == "VIC"][0]
    assert c2["pire_db"] > c["pire_db"] + 20.0, \
        "le couplage doit monter avec la bande : %.1f dB puis %.1f dB" \
        % (c["pire_db"], c2["pire_db"])
    assert c2["confirmee"], "et la meme voisine se confirme alors"
    assert not [x for x in autre["avertissements"] if "BANDE ANALYSÉE" in x], \
        "une mise en garde qui s'affiche toujours cesse d'etre lue"


T("une bande trop basse ne se lit pas comme un silence",
  une_bande_trop_basse_ne_se_lit_pas_comme_un_silence)


def la_bande_se_deduit_du_dessin():
    """Deux grandeurs independantes, et on les confond tout le temps.

    LE HAUT DE BANDE FIXE LA RESOLUTION ; LE PAS FREQUENTIEL FIXE LA FENETRE.
    Ajouter des points a bande constante allonge la fenetre -- donc recule le
    repliement -- et ne change PAS la resolution d'un cheveu. C'est l'erreur la
    plus courante sur cette figure, et ce cas la fige : il verifie que les deux
    reponses varient chacune avec SA grandeur, et qu'aucune ne varie avec
    l'autre.

    LA DEDUCTION PART DE CE QU'ON MESURE SUR LE DESSIN : le plus court
    longement (ce qu'il y a de plus fin a montrer), la longueur du parcours
    (la fenetre), l'epaisseur du dielectrique (le plafond du modele).
    """
    # (1) LES DEUX GRANDEURS SONT INDEPENDANTES. Meme carte, meme fenetre :
    # doubler la bande divise la resolution par deux ; doubler les points ne
    # la touche pas.
    voisine = [pis(0, 0.3, 40, 0.3, "VIC")]
    def res_de(f_fin, points):
        d = doc_essai(voisine, distance_max=1.0)
        d["analyse"] = {"f_debut": 0.0, "f_fin": f_fin, "points": points,
                        "temps_montee": 100e-12}
        r = ct.analyser(d)
        return [c for c in r["couples"] if c["victime"] == "VIC"][0][
            "resolution_next"]

    base = res_de(10e9, 51)
    double_bande = res_de(20e9, 51)
    double_points = res_de(10e9, 101)
    assert abs(double_bande - base / 2.0) < 0.05 * base, \
        "la resolution est inversement proportionnelle a la BANDE : %s vs %s" \
        % (double_bande, base)
    assert abs(double_points - base) < 1e-6, \
        "ajouter des points n'affine RIEN : %s vs %s" % (double_points, base)

    # (2) LA DEDUCTION SUIT LA GEOMETRIE. Un longement deux fois plus court
    # demande une bande deux fois plus haute ; un parcours deux fois plus long
    # demande deux fois plus de points, a bande egale.
    def deduit(longueur_agresseur, longement):
        d = doc_essai([pis(0, 0.3, longement, 0.3, "VIC")],
                      distance_max=1.0, bande_auto=True)
        d["geometry"]["objects"] = [pis(0, 0, longueur_agresseur, 0, "CLK")]
        return ct.analyser(d)["bande_deduite"]

    court = deduit(60.0, 6.0)
    long_ = deduit(60.0, 12.0)
    assert court["f_max"] > 1.8 * long_["f_max"], \
        "un longement deux fois plus court demande une bande deux fois plus" \
        " haute : %s vs %s" % (court["f_max"], long_["f_max"])
    assert abs(court["cible"] - 2.0) < 0.01, court
    assert "plus court longement" in court["source_cible"], court

    # (3) LA FENETRE CONTIENT L'ALLER-RETOUR, et c'est ce qui fixe les points.
    for b, L in ((deduit(30.0, 6.0), 30.0), (deduit(120.0, 6.0), 120.0)):
        aller_retour = 2.0 * L * 1e-3 / b["vitesse"]
        fenetre = (b["points"] - 1) / b["f_max"]
        assert fenetre >= aller_retour, \
            "la fenetre (%.4g ns) doit contenir l'aller-retour (%.4g ns)" \
            % (1e9 * fenetre, 1e9 * aller_retour)
    assert deduit(120.0, 6.0)["points"] > deduit(30.0, 6.0)["points"], \
        "un parcours plus long demande plus de points, a finesse egale"

    # (4) LE PLAFOND DU MODELE MORD, ET IL SE DIT. Une resolution visee absurde
    # ne doit pas produire une bande ou la section droite ne decrit plus rien :
    # une carte affinee au-dela de la validite du modele est fabriquee.
    fin = doc_essai(voisine, distance_max=1.0, bande_auto=True,
                    resolution_cible=0.05)
    b = ct.analyser(fin)["bande_deduite"]
    assert b["borne"] == "modèle", b["borne"]
    assert b["f_max"] <= b["f_tem"] * 1.001, b
    assert b["atteinte"] > b["cible"], \
        "quand le plafond mord, la resolution ATTEINTE est moins bonne que" \
        " la visee, et c'est ce qu'il faut annoncer"
    assert "quasi-TEM" in b["detail"], b["detail"]

    # (5) SANS LA CASE, RIEN NE BOUGE : la deduction est une DEMANDE.
    muet = ct.analyser(doc_essai(voisine, distance_max=1.0))
    assert muet["bande_deduite"] is None, muet["bande_deduite"]


T("la bande se deduit du dessin, et les deux grandeurs restent distinctes",
  la_bande_se_deduit_du_dessin)



def ce_qui_change_la_lecture_est_marque_a_la_source():
    """Tous les avertissements ne pesent pas le meme poids, et la page ne peut
    pas le deviner.

    LA FICHE MONTRE LE VERDICT ET LA CARTE ; le reste se replie. C'est
    exactement la ou un avertissement peut disparaitre sans bruit -- et une
    matrice non passive ne doit JAMAIS se replier a cote d'un ecart de vitesse
    de 0,3 %. Le tri se fait donc ICI, au moment ou l'on sait pourquoi un
    message compte : la page le lit dans `graves`, elle ne le reconnait pas a
    son texte, ce qui aurait fini par en manquer un.
    """
    # Une bande etroite : la resolution ne localise rien, et c'est grave.
    doc = doc_essai([pis(0, 0.3, 40, 0.3, "VIC")], distance_max=1.0)
    doc["analyse"] = {"f_debut": 0.0, "f_fin": 2e9, "points": 21,
                      "temps_montee": 100e-12}
    res = ct.analyser(doc)
    graves = res["graves"]
    assert graves, "une resolution qui ne localise rien doit etre une reserve"
    for g in graves:
        assert g["texte"] in res["avertissements"], \
            "une reserve est AUSSI un avertissement : la liste complete reste" \
            " la liste complete (%r)" % g
        # LE TITRE TIENT SUR UNE LIGNE, et c'est toute sa raison d'etre : une
        # reserve qui ne s'affiche qu'en soixante mots n'est pas lue, et une
        # reserve non lue vaut une reserve absente.
        assert 0 < len(g["titre"]) <= 90, \
            "un titre de reserve doit tenir sur une ligne : %r" % g["titre"]
        assert len(g["titre"]) < len(g["texte"]), g
    assert any("RÉSOLUTION SPATIALE" in g["texte"] for g in graves), graves
    assert any("localise rien" in g["titre"] for g in graves), \
        "le titre dit le FAIT, pas le pourquoi : %s" % [g["titre"]
                                                        for g in graves]
    # Et tout n'est pas grave : la mise en garde du FEXT se dit a chaque
    # analyse, elle ne remet pas le resultat en cause.
    textes = [g["texte"] for g in graves]
    ordinaires = [a for a in res["avertissements"] if a not in textes]
    assert any("FEXT" in a for a in ordinaires), \
        "un avis qui se repete a chaque analyse n'est pas une reserve"

    # LA CLEF EXISTE MEME QUAND LA REPONSE EST VIDE : une clef absente et une
    # liste vide ne se lisent pas de la meme facon cote page.
    vide = ct.analyser(doc_essai([pis(0, 8.0, 40, 8.0, "LOIN")],
                                 distance_max=0.2))
    assert isinstance(vide["graves"], list)


T("ce qui change la lecture est marque a la source, pas devine au texte",
  ce_qui_change_la_lecture_est_marque_a_la_source)


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
    for clef in ("victimes", "desaccords", "asymetries", "couples"):
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

def une_vitesse_saisie_ne_fait_plus_tomber_le_serveur():
    """Une seule vitesse saisie + un longement partiel : le cas qui rendait 500.

    LE CHAMP CASSAIT EXACTEMENT DANS LE CAS OU IL SERT. Une vitesse saisie
    donne un profil a DEUX points (0 et L) ; la cascade en donne un par borne
    de bloc, donc N. `profil_commun` additionnait les deux termes a terme, ce
    qui levait « operands could not be broadcast together » des que le
    parcours comptait plus d'un bloc -- c'est-a-dire pour tout longement
    partiel, le cas normal. Les deux sens de saisie sont verifies : c'est
    l'agresseur ou la victime qui peut porter la saisie.
    """
    for vitesses in ({"CLK": 1.5e8}, {"VIC": 1.5e8},
                     {"CLK": 1.5e8, "VIC": 1.4e8}, {}):
        for longement in ((0, 40), (10, 30), (25, 40)):
            doc = doc_essai([pis(longement[0], 0.45, longement[1], 0.45,
                                 "VIC")], vitesses=vitesses)
            res = ct.analyser(doc)
            assert res["carte_chaleur"] is not None, \
                "vitesses=%s longement=%s : aucune carte" % (vitesses,
                                                             longement)
            couple = res["couples"][0]
            assert couple["next_localise"], \
                "le NEXT localise toujours : %s / %s" % (vitesses, longement)
    # ET LA VITESSE SAISIE EST BIEN CELLE QUI SERT.
    res = ct.analyser(doc_essai([pis(0, 0.45, 40, 0.45, "VIC")],
                                vitesses={"VIC": 1.0e8}))
    assert abs(res["couples"][0]["vitesse_victime"] - 1.0e8) < 1.0, \
        res["couples"][0]["vitesse_victime"]
    assert "saisie" in res["couples"][0]["source_vitesse"]


T("une vitesse saisie sur un seul net ne fait plus tomber le serveur",
  une_vitesse_saisie_ne_fait_plus_tomber_le_serveur)


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
        "analyse": {"f_debut": 0.0, "f_fin": 20e9, "points": 201,
                    "temps_montee": 100e-12},
        "reglages": {},
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
    assert couple["confirmee"] and couple["next_db"] > -20.0, couple["next_db"]
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


def l_axe_du_fext_suit_le_longement_quand_il_localise():
    """FEXT : pas d'axe a vitesses egales, un axe JUSTE quand elles diffèrent.

    LA LOI D'ARRIVEE DU FEXT EST t(x) = tau_a(x) + tau_v(L) - tau_v(x), parce
    que le bruit avant CO-PROPAGE avec l'agresseur. La version precedente
    inversait la MOYENNE des deux retards : t = 0 s'y trouvait envoye sur
    x = 0 alors qu'aucune energie ne peut arriver avant min(tau_a(L),
    tau_v(L)), et le pic tombait TOUJOURS a la meme abscisse -- on deplacait le
    longement de 0 a 25 mm et le pic ne bougeait pas d'un dixieme. C'est le
    seul cas du banc qui verifie l'axe du second sens, et il est construit pour
    cela : deux vitesses franchement differentes, un longement qu'on deplace.
    """
    # A vitesses egales (le cas du dessin ordinaire), il n'y a PAS d'axe.
    egal = ct.analyser(doc_essai([pis(0, 0.45, 40, 0.45, "VIC")]))
    assert egal["couples"][0]["fext_localise"] is False
    assert not ligne_de(egal, "VIC", "fext")
    # LE NIVEAU, LUI, EST TOUJOURS RENDU : c'est un budget de bruit, il ne
    # depend d'aucun axe.
    assert egal["couples"][0]["fext_db"] > -300.0

    # Vitesses franchement differentes : l'axe existe, et il est rendu.
    doc = doc_essai([pis(0, 0.45, 40, 0.45, "VIC")],
                    vitesses={"CLK": 1.9e8, "VIC": 1.0e8})
    res = ct.analyser(doc)
    assert res["couples"][0]["fext_localise"], \
        "un ecart de vitesse de cette taille doit donner un axe : %s" \
        % res["couples"][0].get("fext_raison")
    assert ligne_de(res, "VIC", "fext"), "l'axe existe, la ligne doit suivre"

    # ---- L'AXE LUI-MEME, CONTRE LA LOI ECRITE A LA MAIN ----------------
    # L'ETALON EST ARITHMETIQUE ET NE PASSE PAR AUCUN SOLVEUR : c'est la seule
    # facon de verifier la loi d'arrivee elle-meme. Une comparaison de bout en
    # bout ne le permet pas -- une vitesse SAISIE remplace l'axe sans changer
    # la matrice S, donc sans deplacer l'energie.
    s = np.array([0.0, 10.0, 20.0, 30.0, 40.0])       # mm
    v_a, v_v = 1.8e8, 1.2e8                            # m/s
    t_a, t_v = s * 1e-3 / v_a, s * 1e-3 / v_v
    for sens, loi in (("next", lambda x: x * 1e-3 / v_a + x * 1e-3 / v_v),
                      ("fext", lambda x: x * 1e-3 / v_a
                       + (40.0 - x) * 1e-3 / v_v)):
        prof = ct.profil_du_sens((s, t_a, t_v), sens)
        assert prof is not None, "%s doit avoir un axe" % sens
        for x in (0.0, 7.5, 20.0, 33.0, 40.0):
            rendu = float(ct.positions(np.array([loi(x)]),
                                       prof[0], prof[1])[0])
            assert abs(rendu - x) < 1e-6, \
                "%s : l'instant de x = %.1f mm redonne %.4f mm" \
                % (sens, x, rendu)
    # RIEN N'ARRIVE AVANT LA PREMIERE ARRIVEE, et la premiere arrivee du FEXT
    # n'est PAS zero : c'est tau_v(L). L'ancien axe y envoyait x = 0, ce qui
    # peuplait d'energie une moitie d'axe ou rien ne peut arriver.
    prof = ct.profil_du_sens((s, t_a, t_v), "fext")
    tot = 40.0e-3
    assert abs(min(prof[1]) - tot / v_a) < 1e-15, min(prof[1])
    assert math.isnan(float(ct.positions(np.array([0.0]),
                                         prof[0], prof[1])[0])), \
        "t = 0 n'a pas d'abscisse sur l'axe du FEXT"
    # A VITESSES EGALES, LA LOI EST PLATE : il n'y a pas d'axe, et le NEXT en
    # a toujours un.
    assert ct.profil_du_sens((s, t_v, t_v), "fext") is None
    assert ct.profil_du_sens((s, t_v, t_v), "next") is not None
    # ET LE NEXT REDONNE x = v.t/2 a vitesses egales -- la convention attendue.
    p = ct.profil_du_sens((s, t_v, t_v), "next")
    assert abs(float(ct.positions(np.array([2 * 20.0e-3 / v_v]),
                                  p[0], p[1])[0]) - 20.0) < 1e-9


T("l'axe du FEXT suit le longement, ou n'existe pas",
  l_axe_du_fext_suit_le_longement_quand_il_localise)


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


def le_touchstone_ecrit_une_rangee_par_ligne():
    """Une ligne de fichier = une rangee de matrice, quatre paires au plus.

    `par_rangee = 2 * n` comptait des NOMBRES la ou la liste porte des PAIRES :
    pour quatre ports, le fichier ecrivait deux rangees de matrice par ligne
    alors que la docstring en annonce une. Les lecteurs tolerants -- dont celui
    de ce banc, qui aplatit tout -- ne le voyaient pas ; un lecteur strict, qui
    compte une rangee par ligne, lisait la matrice par morceaux decales.
    """
    freqs = [1e9, 2e9]
    for n in (2, 4, 6):
        mats = [np.arange(n * n).reshape(n, n) + 1j * k for k in (0, 1)]
        texte = ct.touchstone_np(freqs, mats)
        corps = [l for l in texte.splitlines()
                 if l and not l.startswith(("!", "#"))]
        if n == 2:
            assert len(corps) == 2, corps
            continue
        # Une ligne par rangee, sauf quand la rangee depasse quatre paires.
        par_freq = n * max(1, -(-n // ct.TS_PAR_LIGNE))
        assert len(corps) == par_freq * len(freqs), \
            "%d ports : %d lignes pour %d attendues" \
            % (n, len(corps), par_freq * len(freqs))
        for ligne in corps:
            paires = len(ligne.split()) - (1 if ligne[0] not in " \t" else 0)
            assert paires % 2 == 0 and paires // 2 <= ct.TS_PAR_LIGNE, \
                "%d ports : « %s » porte %d nombres" % (n, ligne, paires)


T("le Touchstone ecrit une rangee par ligne, quatre paires au plus",
  le_touchstone_ecrit_une_rangee_par_ligne)


def le_nombre_de_points_ecrete_se_dit():
    """1000 points demandes, 401 rendus : la fenetre est divisee, on le DIT.

    `MAX_BLOCS` et `MAX_VICTIMES` disent tous deux ce qu'ils ont coupe ;
    celui-ci ne disait rien, alors qu'il divise la FENETRE TEMPORELLE par deux
    et demi -- et ce qui deborde de la fenetre ne disparait pas, il revient se
    poser au debut de la carte par repliement.
    """
    doc = doc_essai([pis(0, 0.45, 40, 0.45, "VIC")])
    doc["analyse"]["points"] = 1000
    res = ct.analyser(doc)
    assert res["validation"]["bande"]["points"] == ct.MAX_POINTS
    dit = [a for a in res["avertissements"]
           if "points au lieu des" in a and "FENÊTRE" in a]
    assert dit, "un ecretage muet fabrique des pics : %s" \
        % res["avertissements"]
    # ET IL SE TAIT QUAND IL N'A RIEN COUPE.
    doc["analyse"]["points"] = 201
    res2 = ct.analyser(doc)
    assert not [a for a in res2["avertissements"] if "points au lieu des" in a]


T("le nombre de points ecrete se dit, comme les autres bornes",
  le_nombre_de_points_ecrete_se_dit)


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
    assert "GND" not in [p["net"] for p in avec["mapping"]["ports"]], \
        "une garde n'a pas de port"
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
    assert nu["couples"][0]["next_db"] > cousu["couples"][0]["next_db"] + 1.0, \
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

    # LE RESEAU, LUI, N'EN POSE QU'UN JEU DE PORTS.
    assert res["etape0"]["retenus"] == ["DATA"], res["etape0"]["retenus"]
    noms = [p["nom"] for p in res["mapping"]["ports"]]
    assert len(noms) == 4 and len(set(noms)) == 4, noms
    couples = [c for c in res["couples"] if c["victime"] == "DATA"]
    assert len(couples) == 1, couples

    # ET LA FICHE EST CELLE DU LONGEMENT QUE LA SECTION RESOUT, pas celle du
    # premier candidat venu : c'est la que l'erreur se lisait.
    c = couples[0]
    assert c["type"] == "latéral", c
    assert abs(c["distance"] - 0.15) < 1e-6, c
    assert c["nom_couche"] == "Top", c
    assert c["confirmee"] and c["next_db"] > -60.0, c

    # LA PORTION SUPERPOSEE EST DITE, et comme un PLANCHER -- pas comme un
    # couplage nul, et pas sur une ligne fantome qui porterait le chiffre.
    assert any("SUPERPOSÉE" in g["texte"] for g in res["graves"]), res["graves"]
    assert not any("vertical non modélisé" in g["titre"]
                   for g in res["graves"]), res["graves"]
    assert any("qu'UN conducteur" in a for a in res["avertissements"]), \
        "la fusion par net doit se dire"


T("un net qui longe sur deux couches reste UN conducteur",
  un_net_sur_deux_couches_est_un_seul_conducteur)


def un_plateau_ne_compte_que_pour_un_pic():
    """Une crete plate est UN pic, et elle en rendait un point sur deux.

    La garde comparait a `trouves[-1]` -- le dernier pic RETENU -- alors que
    les points ecartes ne s'y inscrivent pas : la contiguite se perdait des le
    deuxieme, et un plateau de cinq cases ressortait en trois pics distincts.
    `PICS_MAX` se remplissait de la meme crete, et `desaccords` rendait trois
    fois le meme verdict a trois abscisses qui n'en font qu'une.
    """
    plat = [0.0, 0.1, 1.0, 1.0, 1.0, 1.0, 1.0, 0.1, 0.0]
    assert ct._pics(plat) == [2], ct._pics(plat)
    # DEUX PLATEAUX SEPARES RESTENT DEUX PICS : la regle ne doit pas fondre ce
    # qu'un creux separe.
    deux = [0.0, 1.0, 1.0, 1.0, 0.1, 1.0, 1.0, 0.0]
    assert ct._pics(deux) == [1, 5], ct._pics(deux)
    assert ct._pics([0.0, 0.2, 1.0, 0.3, 0.0]) == [2]


T("un plateau ne compte que pour un pic", un_plateau_ne_compte_que_pour_un_pic)


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


def la_bande_plafonnee_par_le_modele_y_reste():
    """Arrondir une bande PLAFONNEE la faisait sortir de sa propre borne.

    L'arrondi au dixieme de gigahertz allait VERS LE HAUT dans tous les cas --
    « ce qui ne peut qu'ameliorer la resolution ». C'est vrai quand c'est la
    resolution qui borne ; quand c'est la validite quasi-TEM, cela franchit de
    cent megahertz la seule limite que cette borne existe pour tenir. Et la
    branche plafonnee par le NOMBRE DE POINTS recalculait `f_max` APRES
    l'arrondi : elle rendait donc la seule bande non ronde des trois, dans le
    champ meme qu'on relit et qu'on corrige.
    """
    assert abs(ct._arrondir_bande(44.6441e9, True) - 44.7e9) < 1.0
    assert abs(ct._arrondir_bande(44.6441e9, False) - 44.6e9) < 1.0

    def couches_de(hauteur):
        return [{"type": "copper", "name": "Top", "thickness": 0.035,
                 "role": "signal"},
                {"type": "dielectric", "name": "d", "thickness": hauteur,
                 "epsilon_r": 4.3, "tan_delta": 0.02},
                {"type": "copper", "name": "GND", "thickness": 0.035,
                 "role": "plane", "net": "GND"}]

    def bande(hauteur, longueur):
        parcours = ct._parcours([pis(0, 0, longueur, 0, "CLK")])
        return ct.bande_deduite(parcours, [{"longueur": 10.0}],
                                couches_de(hauteur), dict(ct.DEFAUTS), {})

    def ronde(f):
        """Au dixième de gigahertz près : c'est un champ qu'on relit."""
        return abs(f / 1e8 - round(f / 1e8)) < 1e-6

    # UN STRATIFIE EPAIS : c'est le modele qui borne, et la bande doit RESTER
    # dessous.
    b = bande(1.5, 40.0)
    assert b["borne"] == "modèle", b["borne"]
    assert b["f_max"] <= b["f_tem"], (b["f_max"], b["f_tem"])
    assert ronde(b["f_max"]), b["f_max"]
    # UN PARCOURS TRES LONG : c'est le nombre de points qui borne, et la
    # fenetre temporelle doit continuer de couvrir l'aller-retour.
    b = bande(0.2, 1500.0)
    assert b["borne"] == "points", b["borne"]
    assert b["points"] <= ct.POINTS_DEDUITS_MAX, b["points"]
    assert ronde(b["f_max"]), b["f_max"]
    assert 1.0 / b["pas"] >= 2.0 * 1500.0 * 1e-3 / b["vitesse"], b


T("une bande plafonnée reste ronde, et dans sa borne",
  la_bande_plafonnee_par_le_modele_y_reste)


def la_tolerance_de_reciprocite_suit_la_cascade():
    """Un seuil FIXE finissait par dénoncer l'arithmétique, pas le réseau.

    Chaque bloc ajoute un produit de matrices, donc une erreur d'arrondi qui
    s'accumule en marche aleatoire : sur le meme reseau, l'ecart releve vaut
    1,6.10^-14 sur quarante blocs et 2,0.10^-4 sur quatre cents -- a un
    facteur cinq d'un seuil fixe de 1e-3. Le controle aurait donc fini par se
    declencher sur les parcours les plus longs, ceux ou l'on a le plus besoin
    d'y croire.

    ET UN VRAI DEFAUT RESTE DENONCE : une tolerance qui s'ouvre sans borne ne
    controle plus rien, ce qui serait pire que le seuil qu'on remplace.
    """
    freqs = np.array([0.0, 1e9])
    s = np.zeros((2, 2, 2), dtype=complex)
    s[:, 0, 1] = s[:, 1, 0] = 0.5
    un = ct.valider_matrice(freqs, s, 1)
    quatre_cents = ct.valider_matrice(freqs, s, 400)
    assert un["reciprocite"]["ok"] and quatre_cents["reciprocite"]["ok"]
    rapport = (quatre_cents["reciprocite"]["tolerance"]
               / un["reciprocite"]["tolerance"])
    assert abs(rapport - 20.0) < 1e-6, rapport      # racine de 400
    # LE SEUIL RENDU EST CELUI QUI A SERVI : un seuil qu'on ne peut pas relire
    # ne se verifie pas.
    assert quatre_cents["reciprocite"]["blocs"] == 400, quatre_cents
    s[:, 0, 1] = 0.9
    casse = ct.valider_matrice(freqs, s, 400)
    assert not casse["reciprocite"]["ok"], casse


T("la tolérance de réciprocité suit la longueur de la cascade",
  la_tolerance_de_reciprocite_suit_la_cascade)


def un_front_suppose_ne_se_presente_pas_comme_annonce():
    """Le genou deduit de l'amplitude est une SUPPOSITION, et la fiche le dit.

    UNE ALARME QUI DEMANDE DE CHANGER UN REGLAGE doit dire d'ou sort le chiffre
    qui la declenche. Le genou peut venir du temps de montee SAISI, ou -- a
    defaut -- de l'amplitude, qui designe une famille logique et son front
    typique. Dans le second cas, aller chercher dans le cuivre la cause d'une
    alarme qui vient d'une valeur par defaut est une perte de temps pure.

    ET UN SEUL TEMPS DE MONTEE POUR TOUTE LA FICHE : le seuil de couture se
    lisait du tr deduit de la BANDE pendant que le genou se lisait de
    l'amplitude -- deux chiffres compares dans une meme fiche, sortis de deux
    hypotheses differentes.
    """
    voisine = [pis(0, 0.3, 40, 0.3, "VIC")]

    # 3,3 V SANS TEMPS DE MONTEE : la famille donne 1 ns, le genou 350 MHz.
    suppose = doc_essai(voisine, distance_max=1.0)
    suppose["analyse"] = {"f_debut": 0.0, "f_fin": 100e9, "points": 201,
                          "amplitude_v": 3.3}
    res = ct.analyser(suppose)
    assert abs(res["f_genou"] - 0.35 / 1.0e-9) < 1.0, res["f_genou"]
    assert res["f_genou_source"].startswith("supposé"), res["f_genou_source"]
    assert "3.3 V" in res["f_genou_source"], res["f_genou_source"]
    assert abs(res["f_genou_tr"] - 1.0e-9) < 1e-15, res["f_genou_tr"]

    # LE MOT « ANNONCE » NE DOIT PLUS APPARAITRE, et « suppose » doit.
    # LA CRETE EST CALCULEE SOUS CE FRONT-LA, et la passe temporelle dit
    # qu'il est suppose -- c'est elle, desormais, qui fait le verdict.
    assert res["bande_signal"]["source"].startswith("supposé"),         res["bande_signal"]
    assert "supposé" in res["bande_signal"]["detail"], res["bande_signal"]

    # ET L'HYPOTHESE EST RENDUE AVEC LES AUTRES, pas seulement dans l'alarme :
    # le bloc de cloture est ce qu'on relit, l'alarme est ce qu'on survole.
    hyp = [h for h in res["hypotheses"] if "TEMPS DE MONTÉE N" in h]
    assert len(hyp) == 1, res["hypotheses"]
    assert "SUPPOSITION DE CET OUTIL" in hyp[0], hyp[0]

    # LES TROIS FAMILLES SE DISTINGUENT, et le seuil est bien un « au moins ».
    for volts, tr_attendu in ((3.3, 1.0e-9), (2.5, 1.0e-9),
                              (1.8, 0.5e-9), (1.2, 0.5e-9),
                              (0.8, 0.2e-9)):
        d = doc_essai(voisine, distance_max=1.0)
        d["analyse"] = {"f_debut": 0.0, "f_fin": 100e9, "points": 201,
                        "amplitude_v": volts}
        r = ct.analyser(d)
        assert abs(r["f_genou"] - 0.35 / tr_attendu) < 1.0, (volts, r["f_genou"])

    # LE TEMPS DE MONTEE SAISI GAGNE SUR L'AMPLITUDE, et redevient « annonce ».
    saisi = doc_essai(voisine, distance_max=1.0)
    saisi["analyse"] = {"f_debut": 0.0, "f_fin": 100e9, "points": 201,
                        "temps_montee": 9e-9, "amplitude_v": 3.3}
    r = ct.analyser(saisi)
    assert abs(r["f_genou"] - 0.35 / 9e-9) < 1.0, r["f_genou"]
    assert r["f_genou_source"] == "saisi", r["f_genou_source"]
    assert r["bande_signal"]["source"] == "saisi", r["bande_signal"]

    # SANS RIEN QUI DECRIVE LE SIGNAL, PAS DE GENOU -- et l'absence est DITE.
    muet = doc_essai(voisine, distance_max=1.0)
    muet["analyse"] = {"f_debut": 0.0, "f_fin": 100e9, "points": 201}
    m = ct.analyser(muet)
    assert m["f_genou"] == 0.0, m["f_genou"]
    assert m["f_genou_source"] == "", m["f_genou_source"]
    assert not [x for x in m["avertissements"] if "genou du front" in x]
    # SANS FRONT, PAS DE PASSE TEMPORELLE : il n'y a rien a envoyer.
    assert "bande_signal" not in m, m.get("bande_signal")
    assert [h for h in m["hypotheses"] if "AUCUN TEMPS DE MONTÉE" in h], \
        m["hypotheses"]

    # UN SEUL TEMPS DE MONTEE DANS LA FICHE : le seuil de couture tire son
    # front de la MEME source que le genou.
    analyse = {"f_debut": 0.0, "f_fin": 100e9, "points": 201,
               "amplitude_v": 3.3}
    t_r, source, du_signal = ct._tr_signal(analyse)
    assert (t_r, du_signal) == (1.0e-9, True), (t_r, du_signal)
    _valeur, quoi, _ecarte = ct._seuil_couture(analyse)
    if quoi.startswith("front"):
        assert source in quoi, (quoi, source)
    # Sans signal decrit, il retombe sur la bande -- et le genou reste muet.
    t_r2, _s2, du_signal2 = ct._tr_signal({"f_fin": 100e9})
    assert not du_signal2 and abs(t_r2 - 0.35 / 100e9) < 1e-18, (t_r2, du_signal2)
    assert ct._genou_du_front({"f_fin": 100e9})[0] == 0.0


T("un front supposé ne se présente pas comme un front annoncé",
  un_front_suppose_ne_se_presente_pas_comme_annonce)


def la_grille_deduite_echantillonne_aussi_le_signal():
    """Le pas ne sert pas qu'a eviter le repliement : il doit atteindre le genou.

    LE CAS REEL QUI L'A FAIT ECRIRE. Un front de 555 ps (genou 630 MHz) analyse
    jusqu'a 44,7 GHz : l'anti-repliement se contente de 17 points, soit un pas
    de 2,8 GHz, et le PREMIER point utile tombe quatre fois au-dessus du genou.
    La fiche annoncait alors « 23 % du budget » -- un maximum pris sur toute la
    bande -- en disant a cote qu'elle ne pouvait pas dire ce que le couplage
    vaut la ou le signal porte. Le chiffre qui decide du verdict manquait.

    DESCENDRE LE PAS NE PEUT PAS REPLIER : une fenetre plus longue est toujours
    plus sure. Et cela ne coute rien, la cascade etant vectorisee sur la
    frequence. La contrainte porte sur le PAS, jamais sur la BANDE.
    """
    parcours = ct._parcours([pis(0, 0, 18.06, 0, "CLK")])
    couches = STACK["layers"]

    def bande(f_genou):
        return ct.bande_deduite(parcours, [{"longueur": 6.0}], couches,
                                dict(ct.DEFAUTS), {}, f_genou)

    # SANS SIGNAL DECRIT, RIEN NE BOUGE : la deduction est celle d'avant.
    muet = bande(0.0)
    assert muet["source_points"] == "fenêtre temporelle", muet["source_points"]
    assert muet["sous_genou"] == 0, muet

    # AVEC LE FRONT DE LA CAPTURE, LE GENOU PREND LA MAIN sur le nombre de
    # points -- et sur LUI SEUL : la bande, elle, ne bouge pas d'un hertz.
    genou = 0.35 / 555e-12
    avec = bande(genou)
    assert avec["f_max"] == muet["f_max"], \
        "le genou borne le PAS, pas la BANDE : %s vs %s" \
        % (avec["f_max"], muet["f_max"])
    assert avec["points"] > muet["points"], (avec["points"], muet["points"])
    assert avec["source_points"] == "genou du front", avec["source_points"]
    assert avec["sous_genou"] >= 3, avec
    assert avec["pas"] * 3 <= genou * 1.001, (avec["pas"], genou)

    # ET L'ANTI-REPLIEMENT TIENT TOUJOURS : c'est la contrainte qu'on n'a pas
    # le droit de relacher, et un pas plus fin ne peut que l'ameliorer.
    aller_retour = 2.0 * 18.06e-3 / avec["vitesse"]
    assert (avec["points"] - 1) / avec["f_max"] >= aller_retour, avec

    # LA PHRASE LE DIT, et nomme la borne qui a mordu sur les points.
    assert "sous le genou du front" in avec["detail"], avec["detail"]
    assert "fixé le nombre de points" in avec["detail"], avec["detail"]

    # AU PLAFOND, ON NE FAIT PAS SEMBLANT. Un front tres lent demanderait des
    # milliers de points ; on s'arrete a POINTS_DEDUITS_MAX et l'on DIT que la
    # lecture du signal n'a pas eu lieu -- au lieu de la laisser croire.
    lent = bande(0.35 / 9e-9)
    assert lent["points"] == ct.POINTS_DEDUITS_MAX, lent["points"]
    assert lent["sous_genou"] == 0, lent
    assert "ATTENTION" in lent["detail"], lent["detail"]

    # DE BOUT EN BOUT : le chiffre qui manquait est la.
    def fiche(tr):
        d = doc_essai([pis(0, 0.3, 18.06, 0.3, "VIC")],
                      distance_max=1.0, bande_auto=True)
        d["geometry"]["objects"] = [pis(0, 0, 18.06, 0, "CLK")]
        d["analyse"] = {"f_debut": 0.0, "f_fin": 44.7e9, "points": 17,
                        "temps_montee": tr}
        return ct.analyser(d)

    r = fiche(555e-12)
    c = [x for x in r["couples"] if x["victime"] == "VIC"][0]
    assert c.get("pire_db_genou") is not None, \
        "le couplage sous le genou doit etre chiffre : %s" % c
    assert c["pire_db_genou"] <= c["pire_db"] + 1e-9, c
    assert r["bande_deduite"]["sous_genou"] >= 3, r["bande_deduite"]


T("la grille déduite échantillonne aussi le signal, pas seulement le dessin",
  la_grille_deduite_echantillonne_aussi_le_signal)


def le_bloc_analyse_complet_de_la_page_passe_entier():
    """Ce que la PAGE envoie, et non ce que le banc trouvait pratique d'envoyer.

    CE CAS EXISTE PARCE QU'UN BUG EST PASSE. `doc_essai` n'a jamais mis
    `f_centre` dans le bloc `analyse` ; la page, elle, l'y met toujours. Une
    alerte gardee par « fc > 0 » n'etait donc JAMAIS evaluee au banc -- ni sa
    condition, ni les noms qu'elle lit --, et cinquante cas verts ont laissé
    passer un « name 't_r' is not defined » que le premier clic a trouve.

    LA LECON EST DANS LE COURT-CIRCUIT : `fc > 0 and t_r > 0` ne leve rien
    quand `fc` vaut zero. Un banc qui n'envoie pas un champ ne teste pas « le
    cas ou il est absent », il ne teste RIEN de ce qui en depend.
    """
    voisine = [pis(0, 0.3, 40, 0.3, "VIC")]

    def page(**analyse):
        """Le bloc `analyse` tel que le panneau le remplit, au complet."""
        d = doc_essai(voisine, distance_max=1.0)
        d["analyse"] = dict({"f_debut": 0.0, "f_fin": 20e9, "points": 201,
                             "f_centre": 1e8, "temps_montee": 0.0,
                             "amplitude_v": 0.0}, **analyse)
        return ct.analyser(d)

    # (1) LE CAS QUI PLANTAIT : un front lent, et la frequence de travail
    # presente. Il ne doit rien lever, et l'alerte doit sortir.
    r = page(temps_montee=8e-9)
    dit = [x for x in r["avertissements"] if "demi-période" in x]
    assert dit, "un front de 8 ns sur un signal a 100 MHz doit etre releve"
    # ELLE DIT D'OU SORT LE FRONT, comme les deux autres alertes qui le lisent.
    assert "saisi" in dit[0], dit[0]
    assert "8 ns" in dit[0], dit[0]

    # (2) UN FRONT RAPIDE NE DECLENCHE RIEN.
    assert not [x for x in page(temps_montee=100e-12)["avertissements"]
                if "demi-période" in x]

    # (3) ET SURTOUT : UN FRONT DEDUIT DE LA BANDE NE DECLENCHE RIEN NON PLUS.
    # Sans tr ni amplitude, le repli vaut 0,35/f_fin ; baisser la bande pour
    # degrossir aurait alors fabrique l'alerte sans que le dessin ait bouge.
    # C'est un REGLAGE qu'on aurait pris pour un fait du signal.
    lente = page(f_fin=20e6, points=21, f_centre=1e6)
    assert not [x for x in lente["avertissements"] if "demi-période" in x], \
        "un front deduit de la bande ne decrit pas le signal : %s" \
        % [x for x in lente["avertissements"] if "demi-période" in x]

    # (4) L'AMPLITUDE SEULE SUFFIT A LE DECRIRE, elle : 3,3 V vaut 1 ns de
    # front suppose, et a 1 GHz la demi-periode ne vaut que 0,5 ns. L'alerte
    # sort donc, et elle dit que le front est SUPPOSE -- une alerte qui demande
    # de ralentir un signal a cause d'un front devine doit le dire.
    suppose = page(f_centre=1e9, amplitude_v=3.3)
    d2 = [x for x in suppose["avertissements"] if "demi-période" in x]
    assert d2 and "supposé" in d2[0], d2

    # (5) LE BLOC COMPLET PASSE ENTIER, quelles que soient les combinaisons :
    # aucune ne doit lever. C'est la garde qui manquait.
    for a in ({}, {"temps_montee": 1e-9}, {"amplitude_v": 1.8},
              {"temps_montee": 1e-9, "amplitude_v": 3.3},
              {"f_centre": 0.0}, {"f_fondamentale": 5e7, "f_centre": 0.0}):
        page(**a)


T("le bloc « analyse » complet de la page passe entier",
  le_bloc_analyse_complet_de_la_page_passe_entier)


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


def le_mode_simple_repond_ou_sans_rien_savoir_du_signal():
    """Ni front, ni amplitude, ni bande -- et pourtant une carte qui designe.

    C'EST LA QUESTION « OU », ET ELLE N'A PAS BESOIN DU SIGNAL. Kb est le NEXT
    SATURE : une fraction de l'amplitude de l'agresseur que la geometrie fixe
    entierement. Le classement de deux zones par leur Kb est donc vrai pour
    n'importe quel front -- c'est ce qui rend ce mode legitime sans la moindre
    donnee electrique.

    ET IL NE PEUT PAS TOMBER DANS LE PIEGE DE L'AUTRE : sans transformee, il
    n'y a ni fenetre, ni repliement, ni bande a arbitrer entre la resolution
    spatiale et le front. L'abscisse sort du DECOUPAGE, qui est de la
    geometrie.
    """
    # UNE VOISINE QUI SE RAPPROCHE AU MILIEU, ET S'ELOIGNE ENSUITE.
    vois = [pis(0, 0.95, 12, 0.95, "VIC"),
            pis(12, 0.35, 22, 0.35, "VIC"),
            pis(22, 0.95, 40, 0.95, "VIC")]
    doc = doc_essai(vois, distance_max=1.5)
    doc["mode"] = "simple"
    # AUCUNE DONNEE ELECTRIQUE : c'est tout l'enjeu. Pas de temps de montee,
    # pas d'amplitude, pas de bande.
    doc["analyse"] = {}
    res = ct.analyser(doc)
    assert res["mode"] == "simple", res["mode"]

    # RIEN DE CE QUI DEMANDE UNE MATRICE S N'EST RENDU, et c'est une garantie
    # plutot qu'un manque : une fiche qui porterait une bande deduite sans
    # avoir fait de transformee ferait croire a un reglage qui n'a pas servi.
    assert res["bande_deduite"] is None, res["bande_deduite"]
    assert "touchstone" not in res
    assert "validation" not in res

    c = res["couples"][0]
    assert c["victime"] == "VIC"
    assert c["rang"] == 1
    # LE NIVEAU N'EST PAS RENDU EN DECIBELS CONTRE UN BUDGET : il n'y a pas de
    # budget sans amplitude. Ce qui est rendu est la BORNE et le CLASSEMENT.
    assert "pire_db" not in c
    assert c["kb_max"] > 0, c
    assert 0.0 < c["kb_max"] < 1.0, "Kb est une fraction, jamais un pourcentage"
    assert abs(c["kb_max_pc"] - 100.0 * c["kb_max"]) < 1e-3

    # LA CARTE DESIGNE LA SECTION SERREE, ET ELLE SEULE.
    ligne = [x for x in res["carte_chaleur"]["lignes"]
             if x["sens"] == "next"][0]
    axe = res["carte_chaleur"]["axe"]
    vals = ligne["valeurs"]
    dedans = [v for x, v in zip(axe, vals) if 13.0 <= x <= 21.0]
    dehors = [v for x, v in zip(axe, vals) if x <= 10.0 or x >= 24.0]
    assert min(dedans) > 3.0 * max(dehors), (max(dehors), min(dedans))

    # ET LA PLAGE A RISQUE TOMBE SUR LE BON MILLIMETRE. C'est le resultat que
    # l'utilisateur regarde ; tout le reste n'est que ce qui l'appuie.
    zones = res["risques"]
    assert len(zones) == 1, zones
    assert abs(zones[0]["s0"] - 12.0) < 1.5, zones[0]
    assert abs(zones[0]["s1"] - 22.0) < 1.5, zones[0]

    # LA RESOLUTION EST CELLE DE L'AXE, PAS CELLE DU DECOUPAGE. Rendre la
    # longueur du plus long bloc ferait refuser toute plage par `zones_risque`,
    # qui la compare au quart du parcours -- alors qu'un bloc uniforme de
    # 18 mm n'est pas un flou de 18 mm, c'est une section uniforme.
    assert c["resolution_next"] < 1.0, c["resolution_next"]
    assert c["bloc_max"] > 5.0, c["bloc_max"]

    # CE QUE CE MODE NE SAIT PAS FAIRE, IL LE DIT LUI-MEME.
    dit = [x for x in res["avertissements"] if "ANALYSE GÉOMÉTRIQUE" in x]
    assert dit, res["avertissements"]
    assert "BORNES" in dit[0] and "SATUR" in dit[0], dit[0]
    assert "millivolts" in dit[0], dit[0]

    # LE FEXT SE REND EN DUREE, JAMAIS EN NIVEAU : il varie comme 1/t_r, donc
    # aucune borne finie ne s'en deduit sans front.
    assert c["kf_td_ps"] >= 0.0
    assert "kf_db" not in c

    # LE MEME DESSIN EN MODE PRECIS RESTE LE MODE PRECIS : les deux ne se
    # marchent pas dessus, et un document sans `mode` continue de valoir
    # « precis » -- c'est celui qui refuse le plus de choses.
    net = ct.analyser(doc_essai(vois, distance_max=1.5))
    assert net["mode"] == "precis", net["mode"]
    assert net["couples"] and "pire_db" in net["couples"][0]


T("le mode simple repond OU sans rien savoir du signal",
  le_mode_simple_repond_ou_sans_rien_savoir_du_signal)


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
    doc["mode"] = "simple"
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
    tout["mode"] = "simple"
    nul = ct.analyser(tout)["couples"][0]
    assert nul["non_calcule"] is True, nul
    assert nul["kb_max"] == 0.0 and nul["confirmee"] is False, nul
    assert "pas un couplage nul" in nul["raison"], nul

    # ET UN DESSIN SAIN NE LEVE RIEN : une reserve qui s'affiche a chaque
    # analyse cesse d'etre lue, et emporte les vraies avec elle.
    sain = doc_essai([pis(0, 0.95, 40, 0.95, "VIC")], distance_max=1.5)
    sain["mode"] = "simple"
    bon = ct.analyser(sain)
    assert bon["couples"][0]["mesure_partielle"] is False, bon["couples"][0]
    assert not [x for x in bon["avertissements"] if "NON RÉSOLUE" in x]


T("le mode simple ne prend pas un zero non calcule pour un decouplage",
  le_mode_simple_ne_prend_pas_un_zero_non_calcule_pour_un_decouplage)


def le_mode_simple_trie_par_le_plafond_et_ne_trace_pas_kf_en_niveau():
    """Le seuil s'applique a Kb, et |Kf| ne se trace pas en « % ».

    Kb EST LE PLAFOND DU NEXT : une voisine dont le Kb est sous le seuil de
    confirmation y reste pour TOUT front. C'est la seule conclusion definitive
    de ce mode, et elle doit trier -- sans quoi une voisine a 0,6 % recevait
    sa plage « a ecarter » au meme rang qu'une a 16 %.

    Kf N'EST PAS UNE FRACTION DE L'AMPLITUDE : le FEXT vaut Kf*T_d/t_r. Une
    courbe de |Kf| sur l'echelle « % de l'agresseur » affichait 3,9 % la ou un
    front de 10 ns donne quelques milliemes.
    """
    vois = [pis(0, 0.95, 12, 0.95, "VIC"),
            pis(12, 0.35, 22, 0.35, "VIC"),
            pis(22, 0.95, 40, 0.95, "VIC"),
            pis(0, -1.3, 40, -1.3, "LOIN")]
    doc = doc_essai(vois, distance_max=1.5)
    doc["mode"] = "simple"
    doc["analyse"] = {}
    res = ct.analyser(doc)
    par = dict((c["victime"], c) for c in res["couples"])
    assert set(par) == {"VIC", "LOIN"}, list(par)

    # LOIN EST SOUS LE SEUIL DE -40 dB, ET LE DIT AVEC LE MOT QUI COMPTE.
    assert par["VIC"]["confirmee"] is True, par["VIC"]
    assert par["LOIN"]["confirmee"] is False, par["LOIN"]
    assert "quel que soit le front" in par["LOIN"]["raison"], par["LOIN"]
    assert res["victimes"] == ["VIC"], res["victimes"]
    # ELLE RESTE CLASSEE -- ecartee du verdict, pas du resultat.
    assert par["LOIN"]["rang"] == 2 and par["LOIN"]["kb_max"] > 0

    # AUCUNE PLAGE NI AUCUN GESTE POUR ELLE.
    assert all(z["victime"] == "VIC" for z in res["risques"]), res["risques"]
    # PAS DE RECOUPEMENT : Kb sort de la section, le comparer a l'espacement
    # comparerait la geometrie a elle-meme. Toute plage est donc « expliquee »,
    # et aucune ne part en « aller voir -- ecarter ne servira a rien ».
    assert res["desaccords"] == [], res["desaccords"]
    assert all(z["justifie"] for z in res["risques"]), res["risques"]
    assert all(a["cible"] != "LOIN" for a in res["actions"]), res["actions"]
    # ET LE GESTE QUI RESTE PARLE DE BORNE, PAS DE NIVEAU.
    ecarter = [a for a in res["actions"] if a["quoi"] == "écarter"]
    assert ecarter and "borne" in ecarter[0]["pourquoi"], res["actions"]
    assert "dB" not in ecarter[0]["pourquoi"], ecarter[0]

    # UNE SEULE COURBE PAR VICTIME, CELLE DE Kb ; le FEXT dit pourquoi.
    sens = set(x["sens"] for x in res["carte_chaleur"]["lignes"])
    assert sens == {"next"}, sens
    assert res["axes"]["fext"]["lignes"] == 0
    assert "t_r" in res["axes"]["fext"]["raison"], res["axes"]
    # Kf RESTE AU TABLEAU, sous la forme que la geometrie fixe : une duree.
    assert par["VIC"]["kf_td_ps"] > 0, par["VIC"]

    # Kf*T_d EST UNE INTEGRALE SUR LE LONGEMENT, pas Kf maximal fois le
    # retard de tout le parcours. Une voisine a la meme distance qui ne longe
    # que le quart du parcours en prend le quart.
    def kf_td(vois):
        d = doc_essai(vois, distance_max=1.5)
        d["mode"] = "simple"
        return ct.analyser(d)["couples"][0]["kf_td_ps"]
    entier = kf_td([pis(0, 0.95, 40, 0.95, "VIC")])
    quart = kf_td([pis(15, 0.95, 25, 0.95, "VIC")])
    assert entier > 0, entier
    assert abs(quart / entier - 0.25) < 0.05, (entier, quart)

    # UN SEUIL PLUS BAS REPECHE LOIN : le tri suit bien le reglage.
    doc["reglages"]["seuil_db"] = -60.0
    bas = ct.analyser(doc)
    assert all(c["confirmee"] for c in bas["couples"]), bas["couples"]


T("le mode simple trie par le plafond et ne trace pas Kf en niveau",
  le_mode_simple_trie_par_le_plafond_et_ne_trace_pas_kf_en_niveau)


def un_couplage_non_calcule_ne_sort_pas_a_moins_300_db():
    """Les deux modes disent « non calcule » au lieu d'un plancher.

    EN MODE PRECIS, une voisine sans section resolue sortait a -300 dB,
    « couplage a -300.0 dB, sous le seuil » -- rangee avec celles qu'on ecarte
    parce qu'elles sont LOIN. Sur une vraie carte, c'etait celle a 0,2 mm sur
    18 mm, la ou le plan manque.

    ET « NON MESURE » N'EST PAS « ABSENT » : une voisine qui ne longe qu'une
    partie du parcours n'est pas « section non resolue » sur le reste. Le
    drapeau de bloc confondait les deux, et toute voisine courte etait dite
    partiellement calculee.
    """
    # 0,01 mm DE JOUR : aucune section resolue, sur toute la longueur.
    muet = [pis(0, 0.26, 40, 0.26, "VIC")]
    # UNE VOISINE SAINE QUI NE LONGE QUE DE 20 A 30 mm.
    court = [pis(20, 0.6, 30, 0.6, "VIC")]
    for mode in ("precis", "simple"):
        d = doc_essai(muet, distance_max=1.5)
        d["mode"] = mode
        c = ct.analyser(d)["couples"][0]
        assert c["non_calcule"] is True, (mode, c)
        assert c["confirmee"] is False, (mode, c)
        assert "NON CALCUL" in c["raison"], (mode, c["raison"])
        assert "sous le seuil" not in c["raison"], (mode, c["raison"])
        assert c["longueur_non_calculee"] > 35.0, (mode, c)

        d = doc_essai(court, distance_max=1.5)
        d["mode"] = mode
        c = ct.analyser(d)["couples"][0]
        assert c["non_calcule"] is False, (mode, c)
        assert c["mesure_partielle"] is False, (mode, c)
        assert c["longueur_non_calculee"] == 0.0, (mode, c)
        assert c["confirmee"] is True, (mode, c)


T("un couplage non calcule ne sort pas a -300 dB",
  un_couplage_non_calcule_ne_sort_pas_a_moins_300_db)


def la_crete_temporelle_retrouve_les_limites_du_manuel():
    """Le mode precis rend le PIC de la forme d'onde, et ce pic est connu.

    LE MODULE DE S AU GENOU MAJORAIT LE PIC d'environ 2,2 : les millivolts
    etaient ceux d'un calcul prudent, affiches comme ceux de la broche. La
    crete sort desormais du front lui-meme envoye dans le reseau, et elle doit
    retrouver les deux limites que tout manuel donne -- avec les coefficients
    que le MODE SIMPLE calcule, par un tout autre chemin :

      front rapide, longement long  -> NEXT = Kb (saturation) ;
      front lent                    -> NEXT = Kb * 2 T_d / t_r,
                                       FEXT = Kf * T_d / t_r.

    LES PORTS SONT FERMES SUR L'IMPEDANCE DE LA LIGNE. Le FEXT est une
    DIFFERENCE de deux termes presque egaux, dont les poids suivent les
    terminaisons : sur 50 ohms, cette ligne de 59 ohms en prend 1,4 fois plus
    que la formule -- c'est de la physique, pas une erreur, et c'est pourquoi
    la formule ne se verifie qu'adaptee.
    """
    geo = {"kind": "micro", "t": 35e-6, "epsilon_r": 4.3, "h": 0.2e-3,
           "conducteurs": [{"w": 0.25e-3, "x": 0.0},
                           {"w": 0.25e-3, "x": 0.6e-3}]}
    sec = tl.solve_multiline(geo)
    z_ligne = math.sqrt(sec["l"][0][0] / sec["c"][0][0])
    vois = [pis(0, 0.6, 40, 0.6, "VIC")]
    d = doc_essai(vois, distance_max=1.5)
    d["mode"] = "simple"
    s = ct.analyser(d)["couples"][0]
    kb, kf_td, td = s["kb_max"], 1e-12 * s["kf_td_ps"], s["td_s"]
    pente = 1.0225   # pente maximale d'un front gaussien, en 1/t_r

    def crete(t_r):
        d = doc_essai(vois, distance_max=1.5, z0=round(z_ligne, 2))
        d["analyse"]["temps_montee"] = t_r
        return ct.analyser(d)["couples"][0]

    rapide = crete(20e-12)          # 2 T_d = 490 ps >> t_r
    assert 0.9 < rapide["crete_next"] / kb < 1.2, (rapide["crete_next"], kb)

    lent = crete(5e-9)              # 2 T_d << t_r
    att_n = kb * 2.0 * td / 5e-9 * pente
    att_f = kf_td / 5e-9 * pente
    assert 0.85 < lent["crete_next"] / att_n < 1.15, (lent["crete_next"], att_n)
    assert 0.8 < lent["crete_fext"] / att_f < 1.15, (lent["crete_fext"], att_f)

    # ET LE NIVEAU RETENU EST BIEN SOUS LE MODULE DE S AU GENOU, qui le
    # majore : c'est tout le motif du changement.
    assert lent["crete_db"] < lent["pire_db_genou"] - 3.0, lent


T("la crete temporelle retrouve les limites du manuel",
  la_crete_temporelle_retrouve_les_limites_du_manuel)


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


def les_deux_analyses_designent_la_meme_zone():
    """Une section serree de 12 a 22 mm : une plage, au meme endroit, deux fois.

    LES DEUX CARTES SORTENT DE DEUX CALCULS INDEPENDANTS -- Kb bloc par bloc
    d'un cote, une matrice S cascadee puis ramenee au temps de l'autre --, et
    elles doivent se superposer : meme plage, meme hauteur. C'est ce cas qui a
    montre que la carte electrique tracait la reponse IMPULSIONNELLE : elle y
    marquait deux taches, 9,5-14,2 et 19,1-23,7 mm, autour des BORDS de la
    section, avec un creux au milieu -- la ou le couplage est le plus fort.
    """
    vois = [pis(0, 0.95, 12, 0.95, "VIC"), pis(12, 0.35, 22, 0.35, "VIC"),
            pis(22, 0.95, 40, 0.95, "VIC")]
    precis = ct.analyser(doc_essai(vois, distance_max=1.5))
    d = doc_essai(vois, distance_max=1.5)
    d["mode"] = "simple"
    geo = ct.analyser(d)

    res_next = ligne_de(precis, "VIC", "next")["resolution"]
    plages = precis["risques"]
    assert len(plages) == 1, plages
    assert abs(plages[0]["s0"] - 12.0) <= res_next, (plages[0], res_next)
    assert abs(plages[0]["s1"] - 22.0) <= res_next, (plages[0], res_next)

    # LA HAUTEUR DU PLATEAU EST Kb : la reponse a un echelon ideal SATURE, et
    # la bande de la carte est assez haute pour que la section de 10 mm
    # sature -- la ou la geometrie seule donne la meme borne.
    haut = max(ligne_de(precis, "VIC", "next")["valeurs"])
    kb = geo["couples"][0]["kb_max"]
    assert abs(haut / kb - 1.0) < 0.1, (haut, kb)


T("les deux analyses designent la meme zone, a la meme hauteur",
  les_deux_analyses_designent_la_meme_zone)


# ==========================================================================
print("\nLes deux modes, de bout en bout, contre une solution EXACTE")
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


def doc_triplaque(w, s, mode, t_r=None, z0=None):
    """Deux pistes paralleles de 40 mm sur In1, sans masse coplanaire.

    CUIVRE D'UN MICRON : la reference est a ruban mince, et 35 um sur 0,5 mm
    de dielectrique deplacent deja Kb de quelques pour cent.
    """
    def piste(y, net):
        p = pis(0, y, 40, y, net, couche=2, w=w)
        p.update(copper_thickness=0.001, gap_left=0.0, gap_right=0.0)
        return p
    reglages = {"distance_max": 2.0}
    if z0:
        reglages["z0"] = z0
    doc = {"format": "cao-crosstalk-1", "carte": "banc",
           "agresseurs": ["CLK"], "stackup": STRIP,
           "geometry": {"objects": [piste(0.0, "CLK")]},
           "voisinage": [piste(w + s, "VIC")],
           "reference_nets": ["GND"], "reglages": reglages, "mode": mode,
           "analyse": {}}
    if t_r:
        doc["analyse"] = {"f_debut": 0.0, "f_fin": 20e9, "points": 201,
                          "temps_montee": t_r}
    return doc


def le_mode_simple_retrouve_la_triplaque_exacte():
    """Kb, Kf.T_d et T_d du mode SIMPLE, contre Cohn -- trois ecarts."""
    td_exact = 40e-3 * math.sqrt(4.3) / tl.C_0
    for w, s in ((0.15, 0.1), (0.15, 0.3), (0.25, 0.5)):
        c = ct.analyser(doc_triplaque(w, s, "simple"))["couples"][0]
        ref = kb_cohn(w, s, 0.5)
        # 1 A 1,3 % MESURES, du serre au lache. La tolerance couvre le cuivre
        # d'un micron et la section posee par la page ; une permutation de
        # ports ou une mutuelle de mauvais signe la depasse de tres loin.
        assert abs(c["kb_max"] / ref - 1.0) < 0.03, (w, s, c["kb_max"], ref)
        assert abs(c["kf_td_ps"]) < 1e-3, ("Kf.T_d nul en triplaque", w, s,
                                           c["kf_td_ps"])
        assert abs(c["td_s"] / td_exact - 1.0) < 1e-4, (
            "T_d de %.1f ps au lieu de %.1f -- a %.2f mm d'ecart"
            % (1e12 * c["td_s"], 1e12 * td_exact, s))


T("le mode simple retrouve la triplaque exacte : Kb, Kf, T_d",
  le_mode_simple_retrouve_la_triplaque_exacte)


def le_mode_precis_retrouve_la_triplaque_exacte():
    """La crete de NEXT saturee du mode PRECIS, contre le meme Kb exact.

    FRONT DE 20 ps sur 2 T_d = 553 ps : le NEXT sature, et sa crete vaut Kb.
    Ports fermes sur l'impedance de la ligne, comme dans le cas « limites du
    manuel » -- c'est la condition de la formule. 2,4 % mesures.
    """
    w, s = 0.15, 0.1
    z = tl.solve_line({"kind": "strip", "t": 1e-6, "epsilon_r": 4.3,
                       "b": 0.5e-3, "y0": 0.25e-3, "w": w * 1e-3})["z0"]
    c = ct.analyser(doc_triplaque(w, s, "precis", 20e-12,
                                  round(z, 2)))["couples"][0]
    ref = kb_cohn(w, s, 0.5)
    assert abs(c["crete_next"] / ref - 1.0) < 0.05, (c["crete_next"], ref)
    # PAS DE FEXT EN MILIEU HOMOGENE : ce qui reste vient des terminaisons,
    # fermees sur la ligne SEULE et non sur ses deux modes.
    assert c["crete_fext"] < 0.1 * c["crete_next"], c


T("le mode precis retrouve la triplaque exacte : crete de NEXT",
  le_mode_precis_retrouve_la_triplaque_exacte)


def le_mode_simple_classe_par_la_longueur_et_pas_par_le_plafond():
    """3 mm serres contre 36 mm moderes : qui prend le plus depend du front.

    Kb SEUL CLASSAIT LE COURT EN TETE (14 % contre 4,4 %), et la fiche disait
    ce classement « vrai pour n'importe quel front ». Sous 1 ns, le LONG prend
    pourtant 3,6 fois plus : aucun des deux longements n'y sature, et sous la
    saturation le NEXT vaut Kb.2T_d/t_r -- il porte la LONGUEUR.

    C'EST LE MODE PRECIS QUI ARBITRE, pas une formule : il envoie le front
    dans le reseau et lit la crete. Le mode simple doit alors
      · classer comme lui sous un front lent (`rang`, par Kb.2T_d) ;
      · classer comme lui sous un front plus rapide que la saturation du
        court (`rang_kb`, par Kb) ;
      · et retrouver sa crete par min(Kb, Kb.2T_d/t_r), sans aucun signal.
    """
    vois = [pis(20, 0.35, 23, 0.35, "COURT"),     # bord a bord 0,10 mm
            pis(2, -0.60, 38, -0.60, "LONG")]     # bord a bord 0,35 mm
    d = doc_essai(vois, distance_max=1.5)
    d["mode"] = "simple"
    d["analyse"] = {}
    simple = dict((c["victime"], c) for c in ct.analyser(d)["couples"])
    court, long_ = simple["COURT"], simple["LONG"]

    # LES DEUX RANGS, ET LEUR DESACCORD : c'est tout le cas.
    assert long_["rang"] == 1 and court["rang"] == 2, (long_, court)
    assert court["rang_kb"] == 1 and long_["rang_kb"] == 2, (long_, court)
    assert court["kb_max"] > 3 * long_["kb_max"], (court, long_)
    assert long_["kb_2td_ps"] > 3 * court["kb_2td_ps"], (court, long_)
    # LE FRONT DE SATURATION EST Kb.2T_d / Kb, et le court sature bien avant.
    for c in (court, long_):
        assert abs(c["t_sature_ps"] - c["kb_2td_ps"] / c["kb_max"]) < 0.01, c
    assert court["t_sature_ps"] < 60 < 300 < long_["t_sature_ps"], (court,
                                                                   long_)

    pente = 1.0225   # pente maximale d'un front gaussien, en 1/t_r

    def estime(c, t_r):
        return min(c["kb_max"], 1e-12 * c["kb_2td_ps"] * pente / t_r)

    for t_r, premier in ((1e-9, "LONG"), (30e-12, "COURT")):
        d = doc_essai(vois, distance_max=1.5)
        d["analyse"]["temps_montee"] = t_r
        precis = dict((c["victime"], c["crete_next"])
                      for c in ct.analyser(d)["couples"])
        # LE MODE PRECIS DESIGNE LE MEME PREMIER que le rang qui s'applique.
        assert max(precis, key=precis.get) == premier, (t_r, precis)
        for net, c in simple.items():
            e = estime(c, t_r)
            # 6 % PRES MESURES, SAUF PRES DE LA SATURATION ou l'estimation
            # MAJORE (0,14 contre 0,11 a 30 ps sur le court) : elle ne doit
            # jamais minorer de plus que les terminaisons ne l'expliquent.
            assert precis[net] < 1.1 * e, (t_r, net, precis[net], e)
            if t_r > 3 * c["t_sature_ps"] * 1e-12:
                assert precis[net] > 0.9 * e, (t_r, net, precis[net], e)


T("le mode simple classe par la longueur, et pas par le plafond",
  le_mode_simple_classe_par_la_longueur_et_pas_par_le_plafond)


print("\n" + "-" * 62)
print("  %d cas, %s" % (ok + ko, "tous passes" if not ko
                        else "%d en echec" % ko))
sys.exit(1 if ko else 0)
