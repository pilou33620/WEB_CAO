"""
Package d'initialisation du solveur MoM
"""

__version__ = '1.0.0'
__author__ = 'MoM Solver Team'

# Import des modules principaux pour faciliter l'accès
from .pcb_parser import load_json, extract_stackup, extract_polygons, build_geometry_model
from .mesher import generate_2d_mesh, extract_edges, build_rwg_basis
from .green_layered import ajuster_noyau, apply_dcim, noyaux_green
from .mom_engine import (build_v_vector, fill_z_matrix,
                         localiser_ports)
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
    'noyaux_green',
    'fill_z_matrix',
    'build_v_vector',
    'localiser_ports',
    'solve_currents',
    'compute_s_parameters',
    'export_touchstone'
]
