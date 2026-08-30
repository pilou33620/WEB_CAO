"""
Package d'initialisation du solveur MoM
"""

__version__ = '1.2.0'
__author__ = 'MoM Solver Team'

# Import des modules principaux pour faciliter l'accès
from .pcb_parser import load_json, extract_stackup, extract_polygons, build_geometry_model
from .mesher import (generate_2d_mesh, extract_edges, build_rwg_basis,
                     hauteur_electrique, percer_via_port, demi_rwg_du_bas,
                     maillage_avec_ports_verticaux)
from .green_layered import (ajuster_noyau, apply_dcim, noyaux_green,
                            ajuster_noyau_3_niveaux, _chemins_3_niveaux,
                            profil_spectral,
                            profil_spectral_multiple, profil_croise,
                            noyaux_croises, noyaux_multicouches,
                            NoyauxParCouche, noyaux_verticaux,
                            green_spectral_zz)
from .mom_engine import (build_v_vector, fill_z_matrix, localiser_ports,
                         vecteur_de_coupe, courant_de_coupe)
from .solver_extract import (solve_currents, compute_s_parameters,
                             export_touchstone,
                             deembarquement_deux_longueurs)

__all__ = [
    'load_json',
    'extract_stackup',
    'extract_polygons',
    'build_geometry_model',
    'generate_2d_mesh',
    'extract_edges',
    'build_rwg_basis',
    'apply_dcim',
    'ajuster_noyau',
    'ajuster_noyau_3_niveaux',
    '_chemins_3_niveaux',
    'profil_spectral',
    'profil_spectral_multiple',
    'profil_croise',
    'noyaux_croises',
    'noyaux_multicouches',
    'NoyauxParCouche',
    'noyaux_green',
    'fill_z_matrix',
    'build_v_vector',
    'localiser_ports',
    'solve_currents',
    'compute_s_parameters',
    'export_touchstone',
    'deembarquement_deux_longueurs',
    'vecteur_de_coupe',
    'courant_de_coupe',
    'hauteur_electrique',
    'percer_via_port',
    'demi_rwg_du_bas',
    'maillage_avec_ports_verticaux',
    'noyaux_verticaux',
    'green_spectral_zz',
]
