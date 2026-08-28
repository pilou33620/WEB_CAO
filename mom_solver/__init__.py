"""
Package d'initialisation du solveur MoM
"""

__version__ = '1.0.0'
__author__ = 'MoM Solver Team'

# Import des modules principaux pour faciliter l'accès
from .pcb_parser import load_json, extract_stackup, extract_polygons, build_geometry_model
from .mesher import generate_2d_mesh, extract_edges, build_rwg_basis
from .green_layered import apply_dcim, green_2d_layered
from .mom_engine import fill_z_matrix, build_v_vector
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
    'green_2d_layered',
    'fill_z_matrix',
    'build_v_vector',
    'solve_currents',
    'compute_s_parameters',
    'export_touchstone'
]
