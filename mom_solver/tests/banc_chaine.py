#!/usr/bin/python3
# -*- coding: utf-8 -*-
"""Banc d'essai de la chaine entiere : du JSON aux parametres S.

    python mom_solver/tests/banc_chaine.py

CE QU'IL REMPLACE, ET POURQUOI. `test_basic.py` verifiait des imports et des
dimensions de matrices -- jamais une valeur. Il appelait `compute_s_parameters`
sans son argument `port_map`, donc il ne pouvait meme plus s'executer ; et
c'est lui qui a laisse un noyau faux passer tous les essais du depot pendant
des mois. Un essai qui ne mesure rien ne protege de rien.

CE BANC MESURE, et ce qu'il mesure ne demande pas de connaitre la bonne
reponse : ce sont des proprietes que la physique impose a toute matrice S,
quelle que soit la geometrie.

  1. LE MAILLAGE. Le plan de masse ne doit PAS y etre -- la fonction de Green
     le compte analytiquement, le mailler le compterait deux fois --, et le
     cuivre de signal doit etre a l'altitude de SA couche, pas a zero.

  2. LA RECIPROCITE. Un milieu sans ferrite a S12 = S21. Ici elle est en
     partie imposee (la matrice Y est symetrisee), et ce que l'essai verifie
     est qu'elle survit a la conversion vers S.

  3. LA PASSIVITE. Une structure sans generateur ne peut pas rendre plus de
     puissance qu'elle n'en recoit : les valeurs singulieres de S sont au plus
     1. C'EST LE CONTROLE LE PLUS SEVERE DE TOUTE LA CHAINE, parce qu'il tombe
     des qu'un signe, un facteur ou une unite est faux quelque part -- et il
     ne demande aucun etalon.

  4. CE QUE LE MODELE DE PORT NE SAIT PAS FAIRE, mesure et borne. Le port est
     une fente EN SERIE dans la piste, faute de courant vertical vers le plan
     de masse : il ne couple au mode guide que si la ligne est longue devant la
     longueur d'onde. L'essai le montre en balayant la frequence sur une meme
     geometrie -- parce qu'un |S21| proche de zero ressemble a un resultat.

  5. LE FICHIER TOUCHSTONE, relu et compte.

Pas de framework, un decompte a la fin, un code de retour.
"""

import os
import sys
import tempfile

import numpy as np

_ICI = os.path.dirname(os.path.abspath(__file__))
_PAQUET = os.path.dirname(_ICI)
if _PAQUET not in sys.path:
    sys.path.insert(0, _PAQUET)

from pcb_parser import (extract_stackup, extract_polygons,      # noqa: E402
                        build_geometry_model)
from mesher import (generate_2d_mesh, extract_edges,              # noqa: E402
                    build_rwg_basis, compute_triangle_area,
                    hauteur_electrique, maillage_avec_ports_verticaux)
from green_layered import indices_plans_masse, noyaux_green      # noqa: E402
from mom_engine import fill_z_matrix, localiser_ports            # noqa: E402
from solver_extract import compute_s_parameters, export_touchstone  # noqa: E402

OK = 0
KO = 0


def essai(nom):
    def deco(fn):
        global OK, KO
        try:
            fn()
            print("  ok  " + nom)
            OK += 1
        except Exception as exc:                # noqa: BLE001
            print("  KO  " + nom + " -> " + str(exc))
            KO += 1
        return fn
    return deco


# --------------------------------------------------------------------------
# La carte d'essai : un microruban de 6 mm sur 0,37 mm de FR-4
# --------------------------------------------------------------------------
LONGUEUR = 6.0
LARGEUR = 1.05
H_SUB = 0.370

CARTE = {
    'version': '1.0',
    'stackup': {'layers': [
        {'thickness': 0.035, 'epsilon_r': 1.0, 'tan_delta': 0.0,
         'type': 'copper', 'role': 'plane', 'name': 'GND'},
        {'thickness': H_SUB, 'epsilon_r': 4.37, 'tan_delta': 0.022,
         'type': 'dielectric', 'name': 'FR4'},
        {'thickness': 0.035, 'epsilon_r': 1.0, 'tan_delta': 0.0,
         'type': 'copper', 'role': 'signal', 'name': 'TOP'},
    ]},
    'geometry': {'objects': [
        {'type': 'zone', 'layer': 0, 'net': 'GND', 'role': 'plane',
         'vertices': [[-2, -3], [LONGUEUR + 2, -3],
                      [LONGUEUR + 2, 3], [-2, 3]]},
        {'type': 'zone', 'layer': 2, 'net': 'SIG', 'role': 'signal',
         'vertices': [[0, -LARGEUR / 2], [LONGUEUR, -LARGEUR / 2],
                      [LONGUEUR, LARGEUR / 2], [0, LARGEUR / 2]]},
    ]},
}

FREQ = 2e9
MAILLE = 0.36e-3


def chaine():
    """Tout le pipeline, une fois, et ce qu'il produit."""
    stackup = extract_stackup(CARTE)
    geometrie = build_geometry_model(extract_polygons(CARTE), stackup)
    mesh = generate_2d_mesh(geometrie, MAILLE)
    rwg = build_rwg_basis(mesh, extract_edges(mesh))
    ports = geometrie['ports']
    coupes = localiser_ports(ports, rwg, mesh['vertices'], mesh['elements'],
                             mesh.get('mesh_size'))
    noyaux = noyaux_green(stackup, FREQ, num_images=8)
    z = fill_z_matrix(rwg, FREQ, noyaux, mesh['vertices'], mesh['elements'])
    s = compute_s_parameters(z, rwg, ports, FREQ, coupes)
    return {'stackup': stackup, 'geometrie': geometrie, 'mesh': mesh,
            'rwg': rwg, 'ports': ports, 'coupes': coupes, 'z': z, 's': s}


print("  (assemblage en cours...)")
ETAT = chaine()


@essai("le plan de masse n'est pas maille, et le signal est a son altitude")
def _():
    """LE DEFAUT QUE CET ESSAI EXISTE POUR ATTRAPER. `mesh_polygon` pose tous
    ses sommets a z = 0, et le mailleur gardait ce zero : une piste et son plan
    de masse se retrouvaient CONFONDUS dans l'espace, et la distance entre deux
    points de couches differentes valait leur seule distance horizontale. En
    plus de quoi le plan etait maille, alors que la fonction de Green le compte
    deja -- son courant etait donc compte deux fois.
    """
    stackup = ETAT['stackup']
    mesh = ETAT['mesh']

    plans = set(indices_plans_masse(stackup))
    if not plans:
        raise AssertionError("aucun plan de masse reconnu dans l'empilage")
    if plans & set(np.unique(mesh['layer_ids'])):
        raise AssertionError("le plan de masse est maille : couches %s"
                             % sorted(plans & set(np.unique(mesh['layer_ids']))))

    z_attendu = stackup['layers'][2]['z_top']
    z_vus = np.unique(mesh['vertices'][:, 2])
    if len(z_vus) != 1 or abs(z_vus[0] - z_attendu) > 1e-12:
        raise AssertionError("altitudes %s au lieu de %g m"
                             % (z_vus * 1e6, z_attendu))
    print("        (%d triangles, %d RWG, tous a z = %.0f um)"
          % (mesh['num_elements'], len(ETAT['rwg']), z_attendu * 1e6))


@essai("chaque port est une COUPE du conducteur, et les coupes sont disjointes")
def _():
    """CE QU'UNE COUPE DOIT ETRE. Elle separe les triangles en deux paquets, et
    ses aretes sont exactement la frontiere entre les deux : aucun courant ne
    passe d'un cote a l'autre sans en traverser une. Une coupe d'UNE SEULE
    arete sur une piste large est donc, par definition, contournable -- et
    c'etait le defaut d'avant.

    On verifie aussi que les coupes sont DISJOINTES : deux ports qui partagent
    une arete ne sont pas deux ports.
    """
    coupes = ETAT['coupes']
    if len(coupes) < 2:
        raise AssertionError("%d port(s) seulement" % len(coupes))

    vus = set()
    for k, c in enumerate(coupes):
        if not c:
            raise AssertionError("port %d sans coupe" % k)
        if len(c) < 2:
            raise AssertionError("la coupe du port %d n'a que %d arete(s) : "
                                 "elle est contournable" % (k, len(c)))
        indices = {n for n, _ in c}
        if indices & vus:
            raise AssertionError("les ports partagent %d arete(s)"
                                 % len(indices & vus))
        vus |= indices
    print("        (coupes de %s aretes)" % [len(c) for c in coupes])


@essai("la matrice S est finie et reciproque")
def _():
    s = ETAT['s']
    if not np.all(np.isfinite(s)):
        raise AssertionError("la matrice S contient des valeurs non finies")
    dissymetrie = np.max(np.abs(s - s.T))
    if dissymetrie > 1e-10:
        raise AssertionError("|S - S^T| = %.3e" % dissymetrie)


@essai("la matrice S est PASSIVE : aucune valeur singuliere au-dessus de 1")
def _():
    """LE CONTROLE LE PLUS SEVERE DE LA CHAINE, ET IL NE DEMANDE AUCUN ETALON.

    Une structure faite de cuivre et de dielectrique ne contient pas de
    generateur : la puissance qui sort ne peut pas depasser celle qui entre,
    pour AUCUNE combinaison d'ondes incidentes. Cela s'ecrit : la plus grande
    valeur singuliere de S vaut au plus 1.

    C'est severe parce qu'un seul signe faux, un facteur mu_0 oublie, une
    permittivite lue dans la mauvaise unite, une singularite mal integree --
    n'importe quoi qui casse la structure de la matrice d'impedance -- se
    traduit par un gain. Un solveur qui rend |S21| = 1,4 n'a pas « un petit
    ecart » : il est faux.

    LA TOLERANCE EST CELLE DU MAILLAGE, pas du principe. Une discretisation
    finie peut deborder de peu ; on accorde un pour cent, ce qui laisse voir
    tout ce qui compte.
    """
    s = ETAT['s']
    sigma = np.linalg.svd(s, compute_uv=False)
    if sigma.max() > 1.01:
        raise AssertionError("valeur singuliere maximale %.4f > 1 : la "
                             "structure rend plus qu'elle ne recoit"
                             % sigma.max())
    puissance = np.abs(s[0, 0]) ** 2 + np.abs(s[1, 0]) ** 2
    print("        (sigma_max = %.4f ; |S11|^2 + |S21|^2 = %.4f ; "
          "|S11| = %.4f, |S21| = %.4f)"
          % (sigma.max(), puissance, abs(s[0, 0]), abs(s[1, 0])))


@essai("le port en fente SERIE ne peut pas exciter une ligne courte -- mesure")
def _():
    """LA LIMITE QUI RESTE, ET ELLE EST STRUCTURELLE. A ecrire noir sur blanc,
    parce qu'un |S21| proche de zero ressemble a un resultat.

    CE QUI A ETE REPARE. Le port etait UNE arete : une tension posee sur une
    seule arete interne d'un ruban continu est contournee par le metal d'a
    cote. Mesure : |Y21/Y11| = 1,5 . 10^-5. Le port est maintenant une COUPE
    complete -- longueur totale des aretes egale a la largeur de la piste --,
    et le meme rapport vaut 5,0 . 10^-2. Trois ordres de grandeur.

    CE QUI RESTE, ET POURQUOI. Une coupe est une fente EN SERIE dans la piste.
    Un port de microruban, lui, est une tension entre la piste et le PLAN DE
    MASSE ; il demande donc un courant VERTICAL pour joindre les deux, c'est-a-
    dire un via -- et ce moteur n'a qu'un seul plan de courant (limite connue
    n° 3 de A-FAIRE). Entre les deux fentes, la piste est un conducteur
    FLOTTANT : a courant continu rien ne peut circuler, et le generateur ne
    voit que la capacite du troncon qu'il isole. On mesure ici Z_in de l'ordre
    de 14 - j766 ohms, ce qui est bien une capacite de quelques centiemes de
    picofarad, pas une ligne de 50 ohms.

    UNE FENTE SERIE FINIT PAR COUPLER AU MODE GUIDE, mais seulement quand la
    ligne est longue devant la longueur d'onde -- et c'est ce que l'essai
    mesure, sur la MEME geometrie a trois frequences :

        L/lambda_g = 0,07  ->  |S21| = 0,007
        L/lambda_g = 0,37  ->  |S21| = 0,106
        L/lambda_g = 0,75  ->  |S21| = 0,204

    LA CROISSANCE EST LA SIGNATURE : si l'ecart venait de la fonction de Green
    ou de la quadrature, il n'aurait aucune raison de suivre L/lambda. C'est
    aussi pourquoi `banc_moteur.py` mesure la permittivite effective sur
    l'ONDE STATIONNAIRE au milieu d'une ligne de une virgule cinq longueur
    d'onde, et non sur des parametres S : la, le couplage est etabli et le
    modele de port ne compte plus.

    A FAIRE, dans cet ordre : (1) des courants verticaux, donc un via de port ;
    (2) le de-embarquement par la methode des deux longueurs.
    """
    from green_layered import C_0
    from mesher import generate_2d_mesh

    mesures = []
    for freq in (FREQ, 10e9, 20e9):
        if freq == FREQ:
            s = ETAT['s']
        else:
            noyaux = noyaux_green(ETAT['stackup'], freq, num_images=8)
            z = fill_z_matrix(ETAT['rwg'], freq, noyaux,
                              ETAT['mesh']['vertices'], ETAT['mesh']['elements'])
            s = compute_s_parameters(z, ETAT['rwg'], ETAT['ports'], freq,
                                     ETAT['coupes'])
        lam_g = C_0 / (freq * np.sqrt(3.5))
        mesures.append((LONGUEUR * 1e-3 / lam_g, abs(s[1, 0])))

    # LE COUPLAGE CROIT AVEC LA LONGUEUR ELECTRIQUE, et c'est ce qui identifie
    # la cause. Si cet essai tombe, ce n'est plus le modele de port.
    for (l1, s1), (l2, s2) in zip(mesures[:-1], mesures[1:]):
        if not (s2 > s1):
            raise AssertionError("|S21| ne croit pas avec L/lambda : %s"
                                 % (mesures,))
    # ET IL RESTE FAIBLE la ou la ligne est courte : c'est la limite mesuree.
    if mesures[0][1] > 0.05:
        raise AssertionError("|S21| = %.4f a %.2f lambda : le port serie "
                             "coupleait donc, et cet essai ne dit plus ce "
                             "qu'il dit" % (mesures[0][1], mesures[0][0]))
    print("        (" + ", ".join("L/lambda_g = %.2f : |S21| = %.4f" % m
                                  for m in mesures) + ")")
    print("        (le port est une fente SERIE : il faudrait un courant "
          "VERTICAL vers le plan de masse)")



# ==========================================================================
# LE PORT VERTICAL SUR LE MAILLAGE REEL
# --------------------------------------------------------------------------
# POURQUOI CET ESSAI EST ICI ET PAS DANS `banc_moteur`. Celui-la fabrique ses
# maillages en grille reguliere -- c'est voulu, il mesure le moteur, pas le
# mailleur. Le percage d'un via, lui, touche a la topologie : il retire un
# triangle, en ajoute six, et compte sur le fait que chaque arete du trou
# retrouve exactement deux triangles. Sur une grille, c'est evident. Sur la
# triangulation que `generate_2d_mesh` produit vraiment, ca ne l'est pas, et
# c'est ici qu'on le verifie.
# ==========================================================================

def chaine_via():
    """Le meme pipeline, avec des ports VERTICAUX au lieu des fentes."""
    stackup = extract_stackup(CARTE)
    geometrie = build_geometry_model(extract_polygons(CARTE), stackup)
    mesh = generate_2d_mesh(geometrie, MAILLE)
    ports = geometrie['ports']

    z_piste = None
    for couche in stackup['layers']:
        if couche.get('type') == 'copper' \
                and str(couche.get('role', '')) != 'plane':
            z_piste = couche.get('z_top')

    hauteur = hauteur_electrique(stackup)
    positions = [tuple(np.asarray(p['position'], dtype=float).ravel()[:2])
                 for p in ports]
    mesh, rwg, coupes = maillage_avec_ports_verticaux(
        mesh, positions, hauteur, z_cible=z_piste)

    noyaux = noyaux_green(stackup, FREQ, num_images=8, avec_vertical=True)
    z = fill_z_matrix(rwg, FREQ, noyaux, mesh['vertices'], mesh['elements'],
                      layer_ids=mesh.get('layer_ids'))
    s = compute_s_parameters(z, rwg, ports, FREQ, coupes)
    return {'mesh': mesh, 'rwg': rwg, 'coupes': coupes, 'z': z, 's': s,
            'hauteur': hauteur}


print("  (assemblage du port vertical...)")
ETAT_VIA = chaine_via()


@essai("le percage d'un via tient sur le maillage REEL, pas seulement sur une grille")
def _():
    """LA TOPOLOGIE, VERIFIEE POUR ELLE-MEME.

    Percer, c'est retirer un triangle et souder six parois sur le contour du
    trou. Trois choses doivent en sortir, et si l'une manque le maillage est
    silencieusement faux :

      · CHAQUE ARETE DU TROU retrouve exactement deux triangles -- celui de la
        piste qui reste, et celui de la paroi --, donc une RWG ordinaire. Une
        arete a trois triangles serait une jonction en T, que la formulation
        RWG ne sait pas traiter ;
      · LES ARETES DU BAS n'en ont qu'un, et ce sont elles qui portent les
        demi-RWG du port. Il doit y en avoir exactement trois par via ;
      · AUCUN TRIANGLE DEGENERE. Un fut d'aire nulle donnerait une division par
        zero dans les moments.
    """
    mesh = ETAT_VIA['mesh']
    elements = np.asarray(mesh['elements'])
    vertices = np.asarray(mesh['vertices'])

    compte = {}
    for tri in elements:
        for a, b in ((tri[0], tri[1]), (tri[1], tri[2]), (tri[2], tri[0])):
            cle = (min(a, b), max(a, b))
            compte[cle] = compte.get(cle, 0) + 1

    triples = [c for c, n in compte.items() if n > 2]
    if triples:
        raise AssertionError("%d arete(s) a plus de deux triangles : jonction "
                             "en T non traitee" % len(triples))

    demi = [r for r in ETAT_VIA['rwg'] if r.area_minus == 0.0]
    attendu = 3 * len(ETAT_VIA['coupes'])
    if len(demi) != attendu:
        raise AssertionError("%d demi-RWG au lieu de %d (3 par via)"
                             % (len(demi), attendu))

    aires = np.array([compute_triangle_area(vertices[t]) for t in elements])
    if np.min(aires) <= 0:
        raise AssertionError("un triangle d'aire nulle est apparu au percage")

    verticaux = [t for t in elements if np.ptp(vertices[t][:, 2]) > 1e-9]
    print("        (%d triangles dont %d de fut ; %d RWG dont %d demi ; "
          "fut de %.4f mm)"
          % (len(elements), len(verticaux), len(ETAT_VIA['rwg']), len(demi),
             ETAT_VIA['hauteur'] * 1e3))


@essai("sur la MEME carte, le via transmet et la fente ne transmet pas")
def _():
    """LA COMPARAISON DE BOUT EN BOUT, sur la carte du banc et son vrai
    maillage. Le meme JSON, le meme empilage, la meme frequence : seul le
    modele de port change.

    ET LA PASSIVITE AVEC, parce qu'un port mal pose peut rendre |S21| > 1 aussi
    facilement que |S21| = 0. Le FR-4 de cette carte a un tan delta de 0,022 :
    la somme des carres doit rester sous un, et nettement.
    """
    s_fente = ETAT['s']
    s_via = ETAT_VIA['s']

    somme = abs(s_via[0, 0]) ** 2 + abs(s_via[1, 0]) ** 2
    print("        (fente  : |S11| = %.4f, |S21| = %.4f)"
          % (abs(s_fente[0, 0]), abs(s_fente[1, 0])))
    print("        (via    : |S11| = %.4f, |S21| = %.4f, somme = %.4f)"
          % (abs(s_via[0, 0]), abs(s_via[1, 0]), somme))

    if abs(s_via[1, 0]) <= 5.0 * abs(s_fente[1, 0]):
        raise AssertionError(
            "le via ne transmet pas nettement mieux que la fente "
            "(%.4f contre %.4f)" % (abs(s_via[1, 0]), abs(s_fente[1, 0])))
    if abs(s_via[1, 0]) < 0.5:
        raise AssertionError("|S21| = %.4f avec le port via"
                             % abs(s_via[1, 0]))
    if somme > 1.02:
        raise AssertionError("structure ACTIVE : |S11|^2 + |S21|^2 = %.4f"
                             % somme)


@essai("le fichier Touchstone se relit et porte le bon nombre de colonnes")
def _():
    s = ETAT['s']
    freqs = np.array([FREQ])
    with tempfile.TemporaryDirectory() as dossier:
        chemin = os.path.join(dossier, 'essai.s2p')
        export_touchstone([s], freqs, ETAT['ports'], chemin)
        if not os.path.exists(chemin):
            raise AssertionError("aucun fichier ecrit")
        lignes = [l.strip() for l in open(chemin, encoding='utf-8')
                  if l.strip() and not l.startswith(('!', '#'))]
        if len(lignes) != 1:
            raise AssertionError("%d ligne(s) de donnees pour 1 frequence"
                                 % len(lignes))
        champs = lignes[0].split()
        # 1 frequence + 2 reels par parametre S, soit 1 + 2*4 = 9
        if len(champs) != 9:
            raise AssertionError("%d colonnes au lieu de 9 : %s"
                                 % (len(champs), champs))


if __name__ == "__main__":
    print("\n%d essais reussis, %d en echec." % (OK, KO))
    sys.exit(1 if KO else 0)
