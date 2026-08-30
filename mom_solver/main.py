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

from pcb_parser import load_json, extract_stackup, extract_polygons, build_geometry_model
try:
    from .mesher import (generate_2d_mesh, extract_edges, build_rwg_basis,
                         hauteur_electrique, maillage_avec_ports_verticaux)
    from .green_layered import noyaux_green, noyaux_multicouches
    from .mom_engine import fill_z_matrix, build_v_vector, localiser_ports
    from .solver_extract import (solve_currents, compute_s_parameters,
                                 export_touchstone)
except ImportError:                                    # noqa: BLE001
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
