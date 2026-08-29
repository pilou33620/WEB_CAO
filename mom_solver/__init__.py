"""
Package d'initialisation du solveur MoM
"""

__version__ = '1.2.0'
__author__ = 'MoM Solver Team'

# Import des modules principaux pour faciliter l'accès
from .pcb_parser import load_json, extract_stackup, extract_polygons, build_geometry_model
from .mesher import generate_2d_mesh, extract_edges, build_rwg_basis
from .green_layered import (ajuster_noyau, apply_dcim, noyaux_green,
                            ajuster_noyau_3_niveaux, _chemins_3_niveaux,
                            profil_spectral,
                            profil_spectral_multiple, profils_noyaux_multiples)
from .mom_engine import (build_v_vector, fill_z_matrix,
                         localiser_ports,
                         excitation_via_port, courant_total_via,
                         _creer_via_port)
from .solver_extract import solve_currents, compute_s_parameters, export_touchstone

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
    'profils_noyaux_multiples',
    'noyaux_green',
    'fill_z_matrix',
    'build_v_vector',
    'localiser_ports',
    'excitation_via_port',
    'courant_total_via',
    '_creer_via_port',
    'solve_currents',
    'compute_s_parameters',
    'export_touchstone'
]
