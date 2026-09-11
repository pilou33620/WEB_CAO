"""
Solveur MoM 2.5D pour l'éditeur PCB
Point d'entrée principal pour l'analyse électromagnétique
"""

import argparse
import sys

import numpy as np
import logging
import json
from pathlib import Path

# ==========================================================================
# LE CLI ET LA ROUTE PARTAGENT LA MEME ORCHESTRATION
# --------------------------------------------------------------------------
# CE QUE CELA CORRIGE, ET C'EST GROS. Il y avait DEUX pipelines sur ce meme
# solveur : celui-ci, et `python/simulation_25d.py` derriere
# /api/simulation-25d. Ils ne faisaient pas la meme chose sur le meme
# fichier :
#
#   ce module (avant)              simulation_25d.py
#   ---------------------------    -------------------------------
#   ports par `detect_ports`       bornes de la chaine, avant fusion
#   une hauteur de fut pour tous   une par port
#   pas de renversement d'empilage renverse quand les plans sont au-dessus
#   pas de fusion des troncons     unary_union par (couche, net)
#   pas de vias internes           futs verticaux mailles
#   Touchstone en GHz              Touchstone en Hz
#
# Autrement dit : le meme .json rendait deux resultats differents selon qu'on
# passait par la page ou par la ligne de commande -- alors que requirements.txt
# recommande justement le CLI comme voie hors ligne. C'est exactement le defaut
# que l'en-tete 4.0.0 de `simulation_em` interdit par son nom : « deux verdicts
# concurrents sur le meme cuivre, et rien pour les arbitrer ».
#
# LE MODE `--port via` DELEGUE DONC A `simuler_25d`, sans rien recopier. Le
# mode `--port fente` garde le pipeline direct ci-dessous : ce n'est pas une
# seconde version du meme calcul, c'est un AUTRE MODELE DE PORT, que le banc
# `banc_chaine` emploie comme temoin -- il mesure que la fente ne transmet pas
# une ligne courte la ou le via transmet, sur le meme maillage.
#
# LE SENS DE LA DEPENDANCE EST VOULU : c'est ce script de ligne de commande qui
# va chercher le connecteur, et jamais le paquet `mom_solver` qui dependrait de
# `python/`. Le paquet reste utilisable seul.
# ==========================================================================
_RACINE = Path(__file__).resolve().parent.parent
# LES DEUX CHEMINS, ET LE SECOND N'EST PAS FACULTATIF. `python/` porte le
# connecteur ; la RACINE porte le paquet `mom_solver` lui-meme, dont le
# connecteur a besoin. Lance en script (`python mom_solver/main.py`), seul le
# dossier `mom_solver/` est sur sys.path : `import mom_solver` echouait alors,
# et le refus qui en sortait -- « No module named 'mom_solver' » -- accusait le
# solveur d'etre absent depuis l'interieur du solveur.
for _p in (str(_RACINE), str(_RACINE / "python")):
    if _p not in sys.path:
        sys.path.insert(0, _p)
try:
    import simulation_25d
    ERREUR_CONNECTEUR = None
except Exception as _exc:                              # noqa: BLE001
    simulation_25d = None
    ERREUR_CONNECTEUR = _exc

try:
    from .pcb_parser import load_json, extract_stackup, extract_polygons, build_geometry_model
    from .mesher import (generate_2d_mesh, extract_edges, build_rwg_basis,
                         hauteur_electrique, maillage_avec_ports_verticaux)
    from .green_layered import noyaux_green, noyaux_multicouches
    from .mom_engine import fill_z_matrix, build_v_vector, localiser_ports
    from .solver_extract import (solve_currents, compute_s_parameters,
                                 export_touchstone)
except ImportError:                                    # noqa: BLE001
    from pcb_parser import load_json, extract_stackup, extract_polygons, build_geometry_model
    from mesher import (generate_2d_mesh, extract_edges, build_rwg_basis,
                        hauteur_electrique, maillage_avec_ports_verticaux)
    from green_layered import noyaux_green, noyaux_multicouches
    from mom_engine import fill_z_matrix, build_v_vector, localiser_ports
    from solver_extract import (solve_currents, compute_s_parameters,
                                export_touchstone)


def setup_logging(verbose: bool = False):
    """
    Configure le système de logging

    CORRECTION: sur une console Windows en cp1252, les caractères non-ASCII
    des messages (✓, é, ...) faisaient lever UnicodeEncodeError à chaque
    log, noyant la sortie sous des traces d'erreurs du module logging.
    On force l'UTF-8 sur le fichier et on reconfigure le flux console.
    """
    level = logging.DEBUG if verbose else logging.INFO

    file_handler = logging.FileHandler('mom_solver.log', encoding='utf-8')

    stream_handler = logging.StreamHandler(sys.stdout)
    # Python >= 3.7 : bascule le flux en UTF-8 avec repli sur '?' si la
    # console ne peut pas représenter un caractère.
    try:
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    except (AttributeError, ValueError):
        pass

    logging.basicConfig(
        level=level,
        format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
        handlers=[file_handler, stream_handler]
    )


def parse_arguments():
    """Parse les arguments de ligne de commande"""
    parser = argparse.ArgumentParser(
        description='Solveur MoM 2.5D pour PCB multicouches'
    )
    
    parser.add_argument(
        '--input',
        type=str,
        required=True,
        help='Chemin vers le fichier JSON d\'entrée (exporté depuis l\'éditeur)'
    )
    
    parser.add_argument(
        '--freq_start',
        type=float,
        required=True,
        help='Fréquence de départ en Hz (ex: 1e9 pour 1 GHz)'
    )
    
    parser.add_argument(
        '--freq_stop',
        type=float,
        required=True,
        help='Fréquence de fin en Hz (ex: 10e9 pour 10 GHz)'
    )
    
    parser.add_argument(
        '--freq_points',
        type=int,
        default=50,
        help='Nombre de points de fréquence (défaut: 50)'
    )
    
    parser.add_argument(
        '--mesh_size',
        type=float,
        default=None,
        help='Taille de maille en mm (défaut: auto, ~1/50 de la plus grande dimension)'
    )
    
    parser.add_argument(
        '--output',
        type=str,
        default=None,
        help='Chemin de sortie pour les fichiers de résultats'
    )
    
    # LE PORT PAR DEFAUT EST LE VIA, ET C'EST UN CHANGEMENT DE FOND. La fente
    # serie coupe la piste et met le generateur entre ses deux moities : c'est
    # un port valide pour un dipole, et le mauvais modele pour une ligne. Sur
    # une ligne courte elle rend |S21| = 0,0065 quand le via rend 0,96, sur
    # exactement le meme maillage. On garde la fente parce que le banc s'en
    # sert comme temoin, et parce qu'un port au MILIEU d'une structure -- une
    # coupure de piste, un composant serie -- est bien une fente.
    parser.add_argument(
        '--port',
        choices=('via', 'fente'),
        default='via',
        help="Modele de port : « via » (defaut) relie la piste au plan de "
             "masse et injecte un courant vertical ; « fente » coupe la piste "
             "et excite en serie."
    )

    parser.add_argument(
        '--export_currents',
        action='store_true',
        help='Exporter la cartographie des courants surfaciques'
    )
    
    parser.add_argument(
        '--verbose',
        action='store_true',
        help='Mode verbeux pour le débogage'
    )
    
    return parser.parse_args()


def _via_par_le_connecteur(args, data, input_path, logger):
    """Le calcul de la route, lance depuis la ligne de commande.

    RIEN N'EST RECOPIE ICI : on complete le document avec la bande demandee
    et on appelle `simulation_25d.simuler_25d`, celui-la meme que sert
    /api/simulation-25d. Les deux voies rendent donc, sur le meme fichier,
    exactement le meme Touchstone et les memes chiffres.
    """
    if simulation_25d is None:
        raise RuntimeError(
            "Le connecteur python/simulation_25d.py est introuvable : %s. "
            "Le mode « --port fente » ne l'exige pas." % ERREUR_CONNECTEUR)

    doc = dict(data)
    # LA BANDE VIENT DE LA LIGNE DE COMMANDE et remplace celle du fichier :
    # c'est ce que l'utilisateur vient de taper qui gagne.
    doc['analyse'] = {
        'f_debut': args.freq_start,
        'f_fin': args.freq_stop,
        'points': args.freq_points,
    }
    if not doc.get('format'):
        # Un fichier exporte par la page porte « format » ; un fichier ecrit a
        # la main peut ne porter que « version ». On complete, et on le dit.
        doc['format'] = simulation_25d.FORMAT
        logger.info("  Le fichier ne porte pas de « format » : lu comme « %s »."
                    % simulation_25d.FORMAT)

    logger.info("Résolution par l'orchestration de /api/simulation-25d")
    try:
        res = simulation_25d.simuler_25d(
            doc, journal=lambda t: logger.info("  " + t.rstrip("\n")),
            mesh_size_mm=args.mesh_size)
    except simulation_25d.ErreurSimulation25D as exc:
        logger.error("Refus du solveur : %s", exc.message)
        if exc.conseil:
            logger.error("  %s", exc.conseil)
        return 2

    if args.output:
        output_base = Path(args.output)
    else:
        output_base = Path('exports') / input_path.stem
    output_base.parent.mkdir(parents=True, exist_ok=True)

    n_ports = res.get('ports', 2)
    chemin_ts = str(output_base.with_suffix('.s%dp' % n_ports))
    with open(chemin_ts, 'w', encoding='utf-8') as f:
        f.write(res['touchstone'])
    logger.info("  ✓ Paramètres S : %s", chemin_ts)

    chemin_json = str(output_base.with_suffix('.resultat.json'))
    sans_maillage = {k: v for k, v in res.items() if k != 'maillage'}
    with open(chemin_json, 'w', encoding='utf-8') as f:
        json.dump(sans_maillage, f, indent=2, ensure_ascii=False)
    logger.info("  ✓ Résultat complet : %s", chemin_json)

    if args.export_currents:
        chemin_c = str(output_base.with_suffix('.currents.json'))
        with open(chemin_c, 'w', encoding='utf-8') as f:
            json.dump(res['maillage'], f, indent=2)
        logger.info("  ✓ Maillage et courants : %s", chemin_c)

    L = res['ligne']
    logger.info("  Z0 = %.2f ohm, eps_eff = %.4f, S11 = %.2f dB, S21 = %.2f dB",
                L['z0_moyen'], L['eps_eff'], L['s11_db'], L['s21_db'])
    for a in res.get('avertissements', []):
        logger.info("  · %s", a)

    logger.info("=" * 60)
    logger.info("Simulation terminée avec succès")
    logger.info("=" * 60)
    return 0


def main():
    """Fonction principale : orchestration du pipeline de simulation"""
    
    # Parse les arguments
    args = parse_arguments()
    
    # Configure le logging
    setup_logging(args.verbose)
    logger = logging.getLogger(__name__)
    
    logger.info("=" * 60)
    logger.info("Solveur MoM 2.5D - Démarrage")
    logger.info("=" * 60)
    
    try:
        # Étape 1 : Chargement et parsing du PCB
        logger.info("Étape 1/6 : Chargement du fichier PCB")
        input_path = Path(args.input)
        if not input_path.exists():
            raise FileNotFoundError(f"Fichier d'entrée introuvable : {args.input}")

        data = load_json(str(input_path))
        logger.info(f"  ✓ Fichier chargé : {input_path.name}")

        # LE PORT VIA -- LE DEFAUT -- PASSE PAR L'ORCHESTRATION DE LA ROUTE.
        # Voir le grand commentaire en tête de ce fichier.
        if args.port == 'via':
            return _via_par_le_connecteur(args, data, input_path, logger)

        logger.warning(
            "  --port fente : pipeline direct, DIFFERENT de celui de la route"
            " /api/simulation-25d. C'est un autre modele de port (excitation"
            " en serie), utile comme temoin ; les chiffres ne sont pas"
            " comparables a ceux de la page.")

        # Étape 2 : Extraction de la géométrie
        logger.info("Étape 2/6 : Extraction de la géométrie")
        stackup = extract_stackup(data)
        polygons = extract_polygons(data)
        geometry = build_geometry_model(polygons, stackup)
        
        logger.info(f"  ✓ Stackup : {len(stackup['layers'])} couches")
        logger.info(f"  ✓ Polygones : {len(polygons)} objets")
        
        # Étape 3 : Génération du maillage
        logger.info("Étape 3/6 : Génération du maillage")

        # CORRECTION: incohérence d'unités. L'aide CLI annonce des mm, mais la
        # géométrie et la taille de maille par défaut sont en mètres. Une
        # valeur de 0.75 était donc interprétée comme 0.75 m (750 mm), soit
        # bien plus que le circuit : aucune subdivision n'avait lieu.
        mesh_size_m = args.mesh_size * 1e-3 if args.mesh_size is not None else None
        if args.mesh_size is not None:
            logger.info(f"  Taille de maille : {args.mesh_size} mm")

        mesh = generate_2d_mesh(geometry, mesh_size_m)
        logger.info(f"  ✓ Éléments : {mesh['num_elements']} triangles")

        # Étape 4 : les ports, et le maillage qu'ils demandent
        #
        # UN PORT EST UNE COUPE DU CONDUCTEUR, et non une arête : une tension
        # posée sur une seule arête interne est contournée par le métal d'à
        # côté, et le solveur rendait |S21| = 0. Voir le commentaire de
        # `mom_engine.localiser_ports`.
        #
        # ET UNE COUPE DANS LE PLAN DU CUIVRE NE SUFFIT PAS POUR UNE LIGNE.
        # Elle met le générateur entre les deux moitiés de la piste, donc en
        # série avec deux tronçons ouverts : |S21| = 0,0065 mesuré sur une
        # ligne courte. Le port « via » perce le maillage, descend un fût
        # jusqu'au plan de masse, et pose le générateur sur la fente du bas --
        # un shunt piste/plan, qui est ce qu'un port de microruban est. Le
        # même cas rend alors |S21| = 0,96.
        logger.info("Étape 4/6 : Ports et fonctions de base")
        ports = geometry['ports']
        port_vertical = (args.port == 'via')

        if port_vertical:
            hauteur = hauteur_electrique(stackup)
            positions = [tuple(np.asarray(p['position'], dtype=float).ravel()[:2])
                         for p in ports]
            z_piste = None
            for couche in stackup.get('layers', []):
                if couche.get('type') == 'copper'                         and str(couche.get('role', '')) != 'plane':
                    z_piste = couche.get('z_top')
            mesh, rwg_basis, coupes = maillage_avec_ports_verticaux(
                mesh, positions, hauteur, z_cible=z_piste)
            logger.info("  ✓ %d port(s) via, fût de %.4f mm, coupes de %s "
                        "demi-arêtes"
                        % (len(coupes), hauteur * 1e3, [len(c) for c in coupes]))
        else:
            edges = extract_edges(mesh)
            rwg_basis = build_rwg_basis(mesh, edges)
            coupes = localiser_ports(ports, rwg_basis, mesh['vertices'],
                                     mesh['elements'], mesh.get('mesh_size'))
            muets = [ports[i].get('id', i)
                     for i, c in enumerate(coupes) if not c]
            if muets:
                raise RuntimeError(
                    f"Ports non localisés sur le maillage : {muets}. "
                    "Affinez le maillage (--mesh_size), vérifiez les positions "
                    "de ports, ou donnez-leur une direction explicite."
                )
            logger.info("  ✓ %d ports en fente, coupes de %s arêtes"
                        % (len(coupes), [len(c) for c in coupes]))

        logger.info(f"  ✓ Fonctions RWG : {len(rwg_basis)}")

        # Étape 5 : Assemblage et résolution pour chaque fréquence
        logger.info("Étape 5/6 : Assemblage de la matrice d'impédance et résolution")

        # Génération de la grille de fréquences
        freq_array = np.linspace(args.freq_start, args.freq_stop, args.freq_points)

        s_params = []
        current_maps = []

        for i, freq in enumerate(freq_array):
            logger.info(f"  Fréquence {i+1}/{args.freq_points} : {freq/1e9:.2f} GHz")

            # LES DEUX FONCTIONS DE GREEN, refaites à chaque point de la
            # bande : les images en dépendent. Deux et non une -- le potentiel
            # vecteur suit la ligne TE, le potentiel scalaire la différence des
            # deux lignes ; voir l'en-tête de `mom_engine`.
            # UN NOYAU PAR COUCHE DE SIGNAL, plus un noyau croise par paire.
            # `noyaux_multicouches` rend un jeu a un seul element quand il n'y
            # a qu'une couche -- le cas courant --, et le moteur ne distingue
            # pas les deux : c'est `pour(couche_m, couche_n)` qui tranche.
            noyaux = noyaux_multicouches(stackup, freq,
                                         avec_vertical=port_vertical)

            z_matrix = fill_z_matrix(
                rwg_basis, freq, noyaux,
                vertices=mesh['vertices'], elements=mesh['elements'],
                layer_ids=mesh.get('layer_ids')
            )

            # Extraction des paramètres S par excitation successive des ports
            # (la résolution multi-RHS est faite en interne, factorisation LU
            #  réutilisée pour tous les ports)
            s_matrix = compute_s_parameters(
                z_matrix, rwg_basis, ports, freq, coupes
            )
            s_params.append(s_matrix)

            if args.export_currents:
                # Cartographie pour l'excitation du port 1
                v_vector = build_v_vector(
                    rwg_basis, ports, freq, coupes=coupes, excited_port=0
                )
                currents = solve_currents(z_matrix, v_vector)
                current_maps.append({
                    'frequency': freq,
                    'currents_real': currents.real.tolist(),
                    'currents_imag': currents.imag.tolist()
                })

        logger.info("  ✓ Résolution terminée pour toutes les fréquences")
        
        # Étape 6 : Export des résultats
        logger.info("Étape 6/6 : Export des résultats")
        
        # Détermination du nom de fichier de sortie
        if args.output:
            output_base = Path(args.output)
        else:
            output_base = Path('exports') / input_path.stem
        
        output_base.parent.mkdir(parents=True, exist_ok=True)
        
        # Export Touchstone (l'extension est ajustée au nombre de ports)
        touchstone_path = str(output_base.with_suffix(f'.s{len(ports)}p'))
        export_touchstone(s_params, freq_array, ports, touchstone_path)
        logger.info(f"  ✓ Paramètres S : {touchstone_path}")
        
        # Export cartographie des courants (optionnel)
        if args.export_currents:
            currents_path = str(output_base.with_suffix('.currents.json'))
            with open(currents_path, 'w') as f:
                json.dump({
                    'mesh': {
                        'vertices': mesh['vertices'].tolist(),
                        'elements': mesh['elements'].tolist()
                    },
                    'current_maps': current_maps
                }, f, indent=2)
            logger.info(f"  ✓ Cartographie courants : {currents_path}")
        
        logger.info("=" * 60)
        logger.info("Simulation terminée avec succès")
        logger.info("=" * 60)
        
        return 0
        
    except Exception as e:
        logger.error(f"Erreur fatale : {e}", exc_info=args.verbose)
        return 1


if __name__ == '__main__':
    sys.exit(main())
