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
    """Une victime qui ne longe que de 25 a 40 mm y met son pic, et pas ailleurs.

    C'EST LE CAS QUI JUSTIFIE TOUTE LA SECTION. Le NEXT remonte vers le bout
    proche de la victime : ce qui se couple a l'abscisse x y arrive au bout
    d'un aller-retour, et c'est cette conversion-la que la carte fait. Un
    facteur deux oublie sur l'axe -- l'erreur la plus facile a commettre et la
    plus difficile a voir -- mettrait le pic a 12,5 mm, ce qui reste une carte
    parfaitement lisible.

    LA TOLERANCE EST LA RESOLUTION ANNONCEE, et non un nombre choisi : la carte
    ne peut pas placer un pic plus finement que la bande ne le permet, et
    exiger mieux serait exiger ce que la physique ne donne pas.
    """
    for debut in (0.0, 12.0, 25.0):
        res = ct.analyser(doc_essai([pis(debut, 0.45, 40, 0.45, "VIC")]))
        x, valeur = pic(res, "VIC", "next")
        tol = ligne_de(res, "VIC", "next")["resolution"]
        assert valeur > 0, "aucun couplage a %g mm" % debut
        assert abs(x - debut) <= tol, \
            ("longement de %g a 40 mm : pic a %.2f mm, tolerance %.2f mm"
             % (debut, x, tol))


T("le pic de NEXT tombe la ou le longement commence",
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
    que toute la liaison » -- c'est le contresens exact, et il tombait sur la
    ligne FEXT a chaque fois qu'on lisait une liaison courte sur une bande
    etroite. Pire : zero etant faux au sens booleen, ces lignes-la sortaient
    des avertissements de resolution, qui n'avaient donc jamais l'occasion de
    les signaler. Une valeur fausse ET muette est le cumul des deux defauts que
    ce module existe pour empecher.
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
    assert fext and abs(fext[0]["resolution"] - longueur) < 1e-6, \
        "hors d'atteinte, la resolution vaut la liaison entiere : %s" \
        % [l["resolution"] for l in fext]
    # ET ELLE ATTEINT ENFIN L'AVERTISSEMENT : c'est tout l'objet du correctif.
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
    pour qu'on sache ou elles doivent tomber : la victime ne longe QUE de 12 a
    28 mm, et le NEXT d'un longement borne culmine a ses DEUX transitions --
    c'est la ou le couplage par unite de longueur change, et nulle part
    ailleurs.
    """
    res = ct.analyser(doc_essai([pis(12, 0.45, 28, 0.45, "VIC")]))
    plages = res["risques"]
    assert plages, "aucune plage rendue sur un longement franc"
    assert all(p["victime"] == "VIC" for p in plages), plages
    # LES DEUX TRANSITIONS, ET DANS L'ORDRE. On tolere la resolution spatiale :
    # une plage est large de ce que la bande permet de distinguer, pas plus.
    res_next = ligne_de(res, "VIC", "next")["resolution"]
    centres = sorted(0.5 * (p["s0"] + p["s1"]) for p in plages)
    assert len(centres) == 2, \
        "deux transitions attendues, %d plage(s) : %s" % (len(centres),
                                                          centres)
    for attendu, obtenu in zip((12.0, 28.0), centres):
        assert abs(obtenu - attendu) <= res_next, \
            "plage centree en %.2f mm au lieu de %.2f (resolution %.2f)" \
            % (obtenu, attendu, res_next)
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


T("les plages a risque tombent sur les transitions du longement",
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
    """Deux regles, la plus severe gagne -- et l'autre s'ecrit quand meme.

    LE HAUT DE BANDE EST UN REGLAGE, et c'est lui qui fixe le seuil des que la
    bande monte : un front de 9 ns tolere des centimetres la ou 100 GHz exige
    un dixieme de millimetre. Quatorze alarmes de couture apparaissent alors
    sans que le cuivre ait bouge, et sans cette ligne on va les chercher dans
    le dessin au lieu du champ « bande ».
    """
    lent = {"temps_montee": 9e-9, "f_fin": 100e9}
    seuil, source, ecarte = ct._seuil_couture(lent)
    assert seuil < 0.2, "a 100 GHz, lambda/10 gagne : %s" % seuil
    assert "λ/10" in source, source
    assert "front" in ecarte and "mm" in ecarte, \
        "la regle ecartee doit etre chiffree : %r" % ecarte

    # ET DANS L'AUTRE SENS : une bande raisonnable rend la main au front.
    seuil2, source2, ecarte2 = ct._seuil_couture({"temps_montee": 50e-12,
                                                  "f_fin": 5e9})
    assert seuil2 < seuil * 100 and "front" in source2, (seuil2, source2)
    assert "λ/10" in ecarte2, ecarte2
    # SANS BANDE, UNE SEULE REGLE S'APPLIQUE : on n'ecrit alors rien de plus.
    # Une parenthese « l'autre regle donnerait » sur une regle qui n'a pas
    # tourne serait une valeur inventee.
    seuil3, source3, ecarte3 = ct._seuil_couture({"temps_montee": 0.0,
                                                  "f_fin": 0.0})
    assert seuil3 > 0 and "repli" in source3, (seuil3, source3)
    assert ecarte3 == "", "une seule regle : rien a comparer (%r)" % ecarte3

    # ET QUAND LES DEUX REGLES TOMBENT SUR LE MEME MILLIMETRE, ON SE TAIT. Un
    # temps de montee deduit vaut 0,35/f_max, et les deux regles coincident
    # alors par construction : « l'autre regle donnerait 0.75 mm » a cote d'un
    # seuil de 0,75 mm ne renseigne pas, il fait relire deux fois.
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
    dit = [x for x in res["avertissements"] if "genou du front" in x]
    assert dit, "l'ecart entre la bande et le signal doit se dire : %s" \
        % res["avertissements"]
    assert "RÉSOLUTION SPATIALE" in dit[0], \
        "le message ne doit pas faire croire que monter la bande est une" \
        " erreur : %s" % dit[0]

    # LA GRILLE NE DESCEND PAS SOUS LE GENOU, ET C'EST LE CAS ORDINAIRE quand
    # on monte la bande : a 100 GHz sur 201 points, le pas vaut 0,5 GHz et le
    # genou 39 MHz -- SEUL LE CONTINU est en dessous, ou le couplage vaut zero
    # par construction. Repondre « -300 dB » serait lire le zero de la grille
    # et l'annoncer comme une mesure.
    assert "pire_db_genou" not in c, \
        "aucun point utile sous le genou : la fiche ne doit pas chiffrer"
    assert "ne peut même pas dire" in dit[0], dit[0]

    # AVEC DES POINTS SOUS LE GENOU, LE CHIFFRE EXISTE ET IL EST BORNE.
    fin = doc_essai(voisine, distance_max=1.0)
    fin["analyse"] = {"f_debut": 0.0, "f_fin": 100e9, "points": 201,
                      "temps_montee": 500e-12}
    autre = ct.analyser(fin)
    c2 = [x for x in autre["couples"] if x["victime"] == "VIC"][0]
    assert "pire_db_genou" in c2, c2
    assert c2["pire_db_genou"] <= c2["pire_db"] + 1e-9, \
        "le pire sous le genou ne peut pas depasser le pire sur la bande"

    # ET SUR UN FRONT COHERENT AVEC LA BANDE, RIEN NE SE DIT. Une mise en garde
    # qui s'affiche a chaque analyse cesse d'etre lue.
    net = ct.analyser(doc_essai(voisine, distance_max=1.0))
    assert not [x for x in net["avertissements"] if "genou du front" in x], \
        net["avertissements"]

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

    # LA LISTE EST BORNEE : au-dela, on la lit comme un audit et l'on n'en
    # fait aucun.
    beaucoup = [dict(risques[0], s0=float(i), s1=float(i) + 1.0)
                for i in range(20)]
    assert len(ct.actions(beaucoup, masse, [], [], 0.5)) <= ct.ACTIONS_MAX

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


print("\n" + "-" * 62)
print("  %d cas, %s" % (ok + ko, "tous passes" if not ko
                        else "%d en echec" % ko))
sys.exit(1 if ko else 0)
