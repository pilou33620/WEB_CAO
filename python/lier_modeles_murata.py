# -*- coding: utf-8 -*-
"""Relie les composants Murata du catalogue a leurs vrais modeles SPICE.

Le catalogue (LIB/LIB_composants.csv) sort de l'extraction avec un modele
generique dans la colonne « Modele Simulation » : capacitor.sub pour tout
condensateur, inductor.sub pour toute self. Ces deux fichiers ne sont qu'un
C ou un L ideal -- utilisables pour un point de polarisation, inutiles des
qu'on regarde une resonance ou une impedance en frequence.

Murata publie, lui, un modele par reference : un reseau RLC a une quinzaine
de noeuds qui reproduit la vraie courbe jusqu'a plusieurs GHz. Les packs
telecharges se deposent tels quels dans lib_simulation/<pack>/. Ce script
fait le lien : pour chaque reference Murata du catalogue -- la reference
principale, puis les secondes sources -- il cherche le .mod correspondant, le
recopie a plat dans lib_simulation/ sous le nom de la reference, et remplace
le modele generique dans le CSV. Les packs se suppriment ensuite : seuls les
.sub a plat servent, et le calcul PDN en tire lui-meme C/ESR/ESL et L/DCR
(web_CAO.py, /api/lib/parasites) -- aucune table a regenerer.

La LIB est celle de l'outil (web_CAO.dossier_lib_defaut : WEB_SUITE/PROJETS/
LIB_CAO), ou celle que designe la variable WEB_CAO_LIB.

A plat, et pas en place : la route /api/lib/fichier refuse tout nom qui
contient un separateur de dossier (web_CAO.py, chemin_lib_fichier). Un modele
laisse au fond de « CAPA GCM/gcm-n-v68/... » serait donc illisible depuis le
navigateur. L'extension devient .sub, comme les modeles deja presents -- le
contenu, lui, est recopie mot pour mot, en-tete et copyright Murata compris.

    python python/lier_modeles_murata.py             # rapport seul
    python python/lier_modeles_murata.py --appliquer # ecrit les .sub et le CSV
"""

import argparse
import csv
import io
import os
import re
import shutil
import sys
import zipfile

RACINE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, RACINE)
import web_CAO  # noqa: E402

LIB = os.environ.get("WEB_CAO_LIB") or web_CAO.dossier_lib_defaut()
SIM = os.path.join(LIB, "lib_simulation")
CSV_CATALOGUE = os.path.join(LIB, "LIB_composants.csv")
COL_MODELE = "Modèle Simulation"
# La reference principale d'abord, puis les secondes sources : un composant
# d'un autre fabricant dont la 2e source est une Murata prend son modele.
COLS_REFERENCE = ("Part Number", "2nd source P/N", "3nd source P/N", "4nd source P/N")
COL_NOM = "Part Name"
COL_VALEUR = "Value"

# Les familles Murata dont un pack peut etre depose. Les MLCC partagent le
# meme codage de reference (voir cle_sans_tolerance), ce qui permet les
# rapprochements par valeur ; les autres ne se relient qu'a l'identique.
MLCC = ("GCM", "GRM", "GJM", "GCQ", "GRT", "GCJ")
FAMILLES = MLCC + ("LQW", "LQG", "LQP", "LQM", "BLM")

# Les modeles generiques que ce script a le droit de remplacer. Tout autre
# contenu deja present dans la colonne est un choix fait par quelqu'un : on
# ne l'ecrase pas sans le dire.
GENERIQUES = ("capacitor.sub", "inductor.sub", "")


# -- index des modeles fabricant --------------------------------------------

def deballer_packs(verbeux=True):
    """Deballe les .zip des packs qui ne l'ont pas encore ete ou partiellement.

    Murata livre un zip par serie ; certains ont ete ouverts a la main, pas
    tous. On deballe a cote du zip, dans un dossier du meme nom, et on complete
    ceux dont l'extraction etait partielle.
    """
    ouverts = []
    if not os.path.isdir(SIM):
        return ouverts
    for dossier, _sous, fichiers in os.walk(SIM):
        for f in fichiers:
            if not f.lower().endswith(".zip"):
                continue
            chemin = os.path.join(dossier, f)
            cible = chemin[:-4]
            doit_extraire = False
            if not os.path.isdir(cible):
                doit_extraire = True
            else:
                try:
                    with zipfile.ZipFile(chemin) as z:
                        n_zip = len([x for x in z.namelist() if x.lower().endswith(".mod")])
                    n_cible = sum(len([x for x in fs if x.lower().endswith(".mod")])
                                  for _, _, fs in os.walk(cible))
                    if n_cible < n_zip:
                        doit_extraire = True
                except Exception:
                    pass
            if doit_extraire:
                with zipfile.ZipFile(chemin) as z:
                    z.extractall(cible)
                ouverts.append(os.path.relpath(cible, RACINE))
                if verbeux:
                    print("  deballe : %s" % os.path.relpath(cible, SIM))
    return ouverts


def indexer_modeles():
    """Tous les .mod des packs, indexes par reference fabricant (majuscules)."""
    index = {}
    for dossier, _sous, fichiers in os.walk(SIM):
        for f in fichiers:
            if f.lower().endswith(".mod"):
                index[os.path.splitext(f)[0].upper()] = os.path.join(dossier, f)
    return index


# -- correspondance reference catalogue -> modele ---------------------------

ARBITRAGES = {
    # Références GCM C0G 0402 50V sans modèle GCM : le GRM de même boîtier,
    # même valeur et même tension (le réseau RLC ne dépend pas de la
    # qualification auto) plutôt qu'un GCM d'un autre boîtier.
    "GCM1555C1HR70WA16D": "GRM1555C1HR70WA01",   # 0.7 pF
    "GCM1555C1H2R1BA16D": "GRM1555C1H2R1BA01",   # 2.1 pF
    "GCM1555C1H2R4BA16D": "GRM1555C1H2R4BA01",   # 2.4 pF
    "GCM1555C1H3R6BA16D": "GRM1555C1H3R6BA01",   # 3.6 pF
    "GCM1555C1H7R5DA16D": "GRM1555C1H7R5DA01",   # 7.5 pF
    # Aucune valeur exacte publiée : la plus proche
    "GCM1555G1H8R7CA16J": "GCM1555C1H8R2DA16",   # 8.7 pF -> 8.2 pF GCM C0G
    "GCM1555C1H131JA16D": "GCM1555C1H121JA16",   # 130 pF -> 120 pF GCM C0G
    # Inductances : la LQW15 (0402) de même valeur
    "LQW03AW9N1J00D": "LQW15AN9N1H00",            # 9.1 nH
    "LQW04AN2N6C00D": "LQW15AN2N6C00",            # 2.6 nH
}


def variantes(reference):
    """La reference, puis la meme amputee de son suffixe de conditionnement.

    Une reference de catalogue porte souvent un code d'emballage que le modele
    n'a pas : GCM1555C1H150JA16D (bande) contre GCM1555C1H150JA16 (modele),
    LQW15AN10NG00D contre LQW15AN10NG00. Le caractere '#' final (revision
    interne) part d'abord. On raccourcit d'au plus trois caracteres : au-dela
    on ne rogne plus un emballage, on change de composant.
    """
    ref = reference.rstrip("#")
    return [ref] + [ref[:-n] for n in (1, 2, 3) if len(ref) > n]


def cle_sans_tolerance(reference):
    """Cle d'une reference MLCC ou la tolerance est mise de cote, ou None.

    Une reference Murata de condensateur fait 17 caracteres :
    GCM | 15 | 5 | 5C | 1H | 1R5 | B | A16, soit serie, dimensions, epaisseur,
    dielectrique, tension, capacite, tolerance, code individuel. Seul le 14e
    caractere (la tolerance) distingue GCM1555C1H121FA16 de ...JA16 : meme
    capacite nominale, meme dielectrique, meme tension, donc meme reseau RLC.
    Murata ne publie qu'une des deux ; la faire servir pour l'autre est un
    rapprochement legitime, mais il est signale comme tel dans le rapport.
    """
    if len(reference) != 17 or not reference.startswith(MLCC):
        return None
    return reference[:13] + reference[14:]


def resoudre(reference, index, index_tolerance, index_13=None, index_val_diel=None):
    """(nom du modele, qualite) pour une reference, ou (None, None).

    Qualite : 'exact', 'emballage', 'tolerance', 'variante_code', 'meme_boitier',
    'compatible_boitier', 'arbitrage'.
    """
    # 0. Table d'arbitrage explicite
    for essai in variantes(reference):
        if essai in ARBITRAGES and ARBITRAGES[essai] in index:
            return ARBITRAGES[essai], "arbitrage"

    # 1. Correspondance exacte ou emballage
    for rang, essai in enumerate(variantes(reference)):
        if essai in index:
            return essai, ("exact" if rang == 0 else "emballage")

    # 2. Tolérance équivalente
    for essai in variantes(reference):
        cle = cle_sans_tolerance(essai)
        proches = index_tolerance.get(cle) if cle else None
        if proches:
            return sorted(proches)[0], "tolerance"

    # 3. Même base de 13 caractères (diélectrique, tension, valeur identiques, code usine/emballage différent)
    if index_13:
        for essai in variantes(reference):
            if len(essai) >= 13 and essai.startswith(MLCC):
                proches = index_13.get(essai[:13])
                if proches:
                    return sorted(proches)[0], "variante_code"

    # 4. Même boîtier, même diélectrique, même valeur, toutes familles MLCC
    #    confondues -- puis, en dernier recours, un autre boîtier. Parmi les
    #    candidats : même tension, puis même tolérance, puis même famille.
    if index_val_diel:
        for essai in variantes(reference):
            m = RE_MLCC.match(essai)
            if not m:
                continue
            fam, taille, diel, val_code = m.group(1), m.group(2), m.group(3), m.group(5)
            for cle, qualite in (((taille, diel, val_code), "meme_boitier"),
                                 (("ANY", diel, val_code), "compatible_boitier")):
                proches = index_val_diel.get(cle)
                if proches:
                    return min(proches, key=lambda c: (c[8:10] != essai[8:10],
                                                       c[13:14] != essai[13:14],
                                                       c[:3] != fam, c)), qualite

    return None, None


# serie, dimensions (3), epaisseur, dielectrique (2), tension (2), valeur (3)
RE_MLCC = re.compile(r"^(%s)([0-9A-Z]{2})[0-9A-Z]([A-Z0-9]{2})([0-9A-Z]{2})([0-9R]{3})" % "|".join(MLCC))


# -- controle de coherence --------------------------------------------------

_MULTIPLES = {"P": 1e-12, "N": 1e-9, "U": 1e-6, "M": 1e-3}


def valeur_declaree(texte):
    """« 1.5pF », « 10nH » -> valeur en farads ou henrys, ou None."""
    m = re.match(r"^\s*([0-9]*\.?[0-9]+)\s*([PNUM]?)[FH]\s*$", (texte or "").upper())
    if not m:
        return None
    return float(m.group(1)) * _MULTIPLES.get(m.group(2), 1.0)


def valeur_reference(reference):
    """La valeur codee dans la reference Murata, en F ou H, ou None.

    Condensateur : trois caracteres en position 11-13, en picofarads, soit
    deux chiffres et un exposant (105 = 10x10^5 pF = 1 uF), soit un 'R' qui
    tient lieu de virgule (1R5 = 1,5 pF). Self LQW : meme principe apres le
    prefixe de serie, mais en nanohenrys et avec 'N' comme virgule
    (1N5 = 1,5 nH, 10N = 10 nH).
    """
    ref = reference.rstrip("#")
    if ref.startswith(MLCC) and len(ref) >= 13:
        code, echelle = ref[10:13], 1e-12
    elif ref.startswith("LQW") and len(ref) >= 11:
        code, echelle = ref[7:11].rstrip("ABCDFGHJKM")[:3], 1e-9
    else:
        return None
    if len(code) != 3:
        return None
    if "R" in code or "N" in code:
        entier, _, decimale = code.replace("N", "R").partition("R")
        try:
            return float("%s.%s" % (entier or "0", decimale or "0")) * echelle
        except ValueError:
            return None
    if not code.isdigit():
        return None
    return float(code[:2]) * (10 ** int(code[2])) * echelle


def valeurs_discordantes(reference, valeur):
    """Vrai si la valeur du catalogue et celle codee dans la reference different."""
    a, b = valeur_declaree(valeur), valeur_reference(reference)
    if a is None or b is None:
        return False
    return abs(a - b) > 0.01 * max(a, b)


# -- catalogue --------------------------------------------------------------

def lire_catalogue():
    """(lignes brutes avec leurs fins de ligne, en-tete analyse).

    Le CSV est relu tel quel et reecrit ligne a ligne : seul le dernier champ
    des lignes concernees change. Le repasser par csv.writer reguillemetterait
    des colonnes intactes et ferait un diff illisible.
    """
    with io.open(CSV_CATALOGUE, "r", encoding="utf-8", newline="") as f:
        brut = f.read()
    lignes = brut.splitlines(True)
    entete = next(csv.reader([lignes[0]], delimiter=";"))
    return lignes, entete


def remplacer_dernier_champ(ligne, valeur):
    """Remplace ce qui suit le dernier ';' en gardant la fin de ligne."""
    corps = ligne.rstrip("\r\n")
    fin = ligne[len(corps):]
    return corps[:corps.rindex(";") + 1] + valeur + fin


# -- traitement -------------------------------------------------------------

def principal():
    parseur = argparse.ArgumentParser(description="Relie les composants Murata "
                                                  "du catalogue a leurs modeles SPICE.")
    parseur.add_argument("--appliquer", action="store_true",
                         help="ecrit les .sub et met a jour le CSV (sinon : rapport seul)")
    args = parseur.parse_args()

    if not os.path.isfile(CSV_CATALOGUE):
        print("Catalogue introuvable : %s" % CSV_CATALOGUE)
        return 1

    print("Packs fabricant :")
    deballer_packs()
    index = indexer_modeles()
    index_tolerance = {}
    for ref in index:
        cle = cle_sans_tolerance(ref)
        if cle:
            index_tolerance.setdefault(cle, []).append(ref)

    index_13 = {}
    for ref in index:
        if len(ref) >= 13 and ref.startswith(MLCC):
            index_13.setdefault(ref[:13], []).append(ref)

    index_val_diel = {}
    for ref in index:
        m = RE_MLCC.match(ref)
        if m:
            taille, diel, val_code = m.group(2), m.group(3), m.group(5)
            index_val_diel.setdefault((taille, diel, val_code), []).append(ref)
            index_val_diel.setdefault(("ANY", diel, val_code), []).append(ref)

    print("  %d modeles .mod indexes dans %s"
          % (len(index), os.path.relpath(SIM, RACINE)))

    lignes, entete = lire_catalogue()
    i_refs = [entete.index(c) for c in COLS_REFERENCE if c in entete]
    i_mod = entete.index(COL_MODELE)
    i_nom = entete.index(COL_NOM)
    i_val = entete.index(COL_VALEUR)
    if i_mod != len(entete) - 1:
        print("La colonne « %s » n'est plus la derniere du CSV : "
              "la reecriture ligne a ligne ne tient plus." % COL_MODELE)
        return 1

    lies, deja, conserves, absents, doutes = [], [], [], [], []
    a_copier = {}

    for n in range(1, len(lignes)):
        champs = next(csv.reader([lignes[n]], delimiter=";"))
        if len(champs) <= i_mod:
            continue
        murata = [r for r in ((champs[i] or "").strip().upper() for i in i_refs if i < len(champs))
                  if r.startswith(FAMILLES)]
        if not murata:
            continue
        nom = champs[i_nom]
        # le catalogue ecrit « lib/simulation/X.sub » : on compare le nom seul
        actuel = os.path.basename((champs[i_mod] or "").strip().replace("\\", "/"))
        reference, modele, qualite = murata[0], None, None
        for r in murata:
            modele, qualite = resoudre(r, index, index_tolerance, index_13, index_val_diel)
            if modele:
                reference = r
                break

        if valeurs_discordantes(reference, champs[i_val]):
            # la reference ou la valeur est fausse : relier propagerait l'erreur
            doutes.append((nom, reference, champs[i_val]))
            continue

        if modele is None:
            absents.append((nom, reference))
            continue
        fichier = modele + ".sub"
        if actuel == fichier:
            deja.append((nom, reference))
            continue
        if actuel not in GENERIQUES:
            conserves.append((nom, reference, actuel, fichier))
            continue
        a_copier[fichier] = index[modele]
        lignes[n] = remplacer_dernier_champ(lignes[n], "lib/simulation/" + fichier)
        lies.append((nom, reference, fichier, qualite))

    def bloc(titre, elements):
        print("\n%s (%d)" % (titre, len(elements)))
        for e in elements:
            print("  " + e)

    for qualite, titre in (("exact", "reference exacte"),
                           ("emballage", "suffixe d'emballage ignore"),
                           ("tolerance", "equivalent de tolerance (a verifier)"),
                           ("variante_code", "variante de code usine/emballage"),
                           ("meme_boitier", "meme boitier, valeur et dielectrique (a verifier)"),
                           ("compatible_boitier", "autre boitier, meme valeur (a verifier)"),
                           ("arbitrage", "arbitrage de valeur / serie")):
        bloc("Modeles fabricant relies -- " + titre,
             ["%-22s -> %-25s %s" % (r, f, nom)
              for nom, r, f, k in lies if k == qualite])
    if deja:
        bloc("Deja relies, inchanges", ["%-22s %s" % (r, nom) for nom, r in deja])
    if conserves:
        bloc("Modele non generique deja en place -- conserve",
             ["%-22s garde %s (candidat : %s)" % (r, a, f)
              for _n, r, a, f in conserves])
    bloc("Sans modele dans les packs presents",
         ["%-22s %s" % (r, nom) for nom, r in absents])
    if doutes:
        bloc("Valeur du catalogue en desaccord avec la reference (a corriger a la main)",
             ["%-22s catalogue %-10s reference %s"
              % (r, v, _lisible(valeur_reference(r), r)) for _n, r, v in doutes])

    print("\n%d references Murata : %d reliees, %d deja a jour, %d conservees, "
          "%d sans modele."
          % (len(lies) + len(deja) + len(conserves) + len(absents),
             len(lies), len(deja), len(conserves), len(absents)))

    if not args.appliquer:
        print("\nRapport seul. Relancer avec --appliquer pour ecrire.")
        return 0

    for fichier, source in sorted(a_copier.items()):
        shutil.copyfile(source, os.path.join(SIM, fichier))
    with io.open(CSV_CATALOGUE, "w", encoding="utf-8", newline="") as f:
        f.write("".join(lignes))
    print("\n%d modeles copies dans %s, catalogue mis a jour."
          % (len(a_copier), os.path.relpath(SIM, RACINE)))
    return 0


def _lisible(valeur, reference):
    """Une valeur en F ou H rendue en pF ou nH, pour le rapport."""
    if valeur is None:
        return "?"
    if reference.startswith("LQW"):
        return "%g nH" % (valeur * 1e9)
    return "%g pF" % (valeur * 1e12)


if __name__ == "__main__":
    sys.exit(principal())
