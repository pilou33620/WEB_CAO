"""
Module de maillage triangulaire et génération des fonctions de base RWG
Utilise pygmsh pour créer un maillage adapté aux éléments finis
"""

import numpy as np
import logging
from typing import Dict, List, Tuple, Optional
from dataclasses import dataclass

logger = logging.getLogger(__name__)

from green_layered import indices_plans_masse      # noqa: E402


@dataclass
class Edge:
    """Représente une arête entre deux triangles"""
    vertices: Tuple[int, int]  # Indices des sommets
    tri_plus: int  # Triangle T+
    tri_minus: int  # Triangle T-
    length: float  # Longueur de l'arête
    center: np.ndarray  # Centre de l'arête
    
    
@dataclass
class RWGBasis:
    """Fonction de base RWG (Rao-Wilton-Glisson)"""
    edge_index: int
    tri_plus: int  # Triangle T+
    tri_minus: int  # Triangle T-
    vertex_plus: int  # Sommet libre dans T+
    vertex_minus: int  # Sommet libre dans T-
    edge_length: float
    area_plus: float  # Aire de T+
    area_minus: float  # Aire de T-
    edge_vertices: Tuple[int, int]  # Sommets de l'arête commune


def generate_2d_mesh(geometry: Dict, mesh_size: Optional[float] = None) -> Dict:
    """
    Génère le maillage triangulaire surfacique
    
    Args:
        geometry: Modèle géométrique du PCB
        mesh_size: Taille caractéristique des éléments (None = auto)
        
    Returns:
        Structure de maillage avec vertices, elements, etc.
    """
    logger.info("Génération du maillage triangulaire")
    
    # Détermination automatique de la taille de maille
    if mesh_size is None:
        bbox = geometry['bbox']
        dimension = max(bbox['x_max'] - bbox['x_min'], 
                       bbox['y_max'] - bbox['y_min'])
        mesh_size = dimension / 50  # ~50 éléments par dimension
        logger.debug(f"  Taille de maille automatique : {mesh_size*1000:.3f} mm")
    
    # CE QUE LE MAILLAGE NE DOIT PAS CONTENIR, ET POURQUOI. Un plan de masse
    # que la fonction de Green stratifiee traite ANALYTIQUEMENT -- c'est-a-dire
    # comme le court-circuit ou bute la cascade de lignes de transmission -- ne
    # doit pas etre maille en plus : son courant serait compte DEUX FOIS. Le
    # maillage precedent prenait tous les polygones, plans compris.
    #
    # La regle vient de `green_layered.indices_plans_masse`, et pas d'ici :
    # deux endroits qui en decident separement finiront par ne plus etre
    # d'accord, et une matrice d'impedance fausse ne se voit pas.
    #
    # RESERVE A ECRIRE DANS LE CODE : le plan ainsi ecarte est suppose INFINI
    # et parfait. C'est l'hypothese ordinaire du 2,5D, et elle cesse d'etre
    # bonne quand le plan est etroit devant la hauteur, ou fendu sous la piste.
    stackup = geometry.get('stackup') or {}
    plans_analytiques = set(indices_plans_masse(stackup)) if stackup else set()

    # LE Z DE CHAQUE COUCHE, ET NON ZERO POUR TOUTES. `mesh_polygon` pose ses
    # sommets a z = 0 ; le maillage precedent gardait ce zero, si bien qu'une
    # piste et son plan de masse se retrouvaient CONFONDUS dans l'espace. La
    # distance entre deux points de couches differentes valait alors leur seule
    # distance horizontale.
    z_couches = {i: c.get('z_top', 0.0)
                 for i, c in enumerate(stackup.get('layers', []))}

    # Maillage de chaque polygone
    all_vertices = []
    all_elements = []
    all_layer_ids = []
    vertex_offset = 0
    ecartes = 0

    for poly_idx, polygon in enumerate(geometry['polygons']):
        vertices = polygon['vertices']
        layer = polygon['layer']

        if layer in plans_analytiques:
            ecartes += 1
            logger.debug(f"  Polygone {poly_idx} (couche {layer}) ecarte : "
                         "la fonction de Green le compte deja")
            continue

        # Maillage du polygone
        poly_mesh = mesh_polygon(vertices, mesh_size)

        sommets = np.asarray(poly_mesh['vertices'], dtype=float).copy()
        if sommets.shape[1] < 3:
            sommets = np.hstack([sommets,
                                 np.zeros((len(sommets), 3 - sommets.shape[1]))])
        sommets[:, 2] = z_couches.get(layer, 0.0)

        # Ajout au maillage global avec offset
        all_vertices.append(sommets)
        elements_with_offset = poly_mesh['elements'] + vertex_offset
        all_elements.append(elements_with_offset)
        all_layer_ids.extend([layer] * len(poly_mesh['elements']))

        vertex_offset += len(sommets)

        logger.debug(f"  Polygone {poly_idx} : {len(poly_mesh['elements'])} triangles")

    if ecartes:
        logger.info(f"  {ecartes} plan(s) de masse non maille(s) : comptes "
                    "analytiquement par la fonction de Green")

    if not all_vertices:
        raise ValueError(
            "generate_2d_mesh : rien a mailler. Tous les polygones sont sur "
            "des couches que la fonction de Green traite en plan de masse. "
            "Un solveur 2,5D a besoin d'au moins un conducteur de signal."
        )

    # Assemblage final
    vertices = np.vstack(all_vertices)
    elements = np.vstack(all_elements)
    layer_ids = np.array(all_layer_ids)
    
    mesh = {
        'vertices': vertices,  # Nx3 array (x, y, z)
        'elements': elements,  # Mx3 array (indices des sommets)
        'layer_ids': layer_ids,  # Layer pour chaque élément
        'num_vertices': len(vertices),
        'num_elements': len(elements),
        'mesh_size': mesh_size
    }
    
    logger.info(f"  Maillage total : {mesh['num_vertices']} sommets, "
                f"{mesh['num_elements']} triangles")
    
    return mesh


def mesh_polygon(vertices: np.ndarray, mesh_size: float) -> Dict:
    """
    Maille un polygone 2D avec Triangle/pygmsh
    
    Args:
        vertices: Sommets du polygone (Nx2)
        mesh_size: Taille caractéristique
        
    Returns:
        Dictionnaire avec vertices (Nx3) et elements (Mx3)
    """
    try:
        import pygmsh
        import meshio
        
        # Création de la géométrie avec pygmsh
        with pygmsh.geo.Geometry() as geom:
            # Points du polygone
            points = [geom.add_point([v[0], v[1], 0.0], mesh_size=mesh_size) 
                     for v in vertices]
            
            # Lignes du contour
            lines = [geom.add_line(points[i], points[(i+1) % len(points)]) 
                    for i in range(len(points))]
            
            # Boucle fermée
            loop = geom.add_curve_loop(lines)
            
            # Surface
            surface = geom.add_plane_surface(loop)
            
            # Génération du maillage
            mesh_data = geom.generate_mesh()
        
        # Extraction des données
        points = mesh_data.points
        cells = mesh_data.cells_dict.get('triangle', np.array([]))
        
        if len(cells) == 0:
            # Fallback : triangulation simple
            logger.warning("pygmsh a échoué, utilisation de la triangulation simple")
            return simple_triangulation(vertices, mesh_size)
        
        return {
            'vertices': points,
            'elements': cells
        }
        
    except ImportError:
        logger.warning("pygmsh non disponible, utilisation de la triangulation simple")
        # CORRECTION: mesh_size était omis, le repli ignorait donc la
        # densité de maillage demandée.
        return simple_triangulation(vertices, mesh_size)
    except Exception as e:
        logger.warning(f"Erreur avec pygmsh : {e}, fallback sur triangulation simple")
        return simple_triangulation(vertices, mesh_size)


def point_in_polygon(point: np.ndarray, polygon: np.ndarray) -> bool:
    """
    Teste l'appartenance d'un point à un polygone (algorithme de parité)

    Lance un rayon horizontal depuis le point et compte les intersections
    avec les arêtes : un nombre impair signifie que le point est intérieur.

    Args:
        point: Point 2D à tester
        polygon: Sommets du polygone (Nx2), contour fermé implicitement

    Returns:
        True si le point est à l'intérieur
    """
    x, y = point[0], point[1]
    n = len(polygon)
    inside = False

    j = n - 1
    for i in range(n):
        xi, yi = polygon[i][0], polygon[i][1]
        xj, yj = polygon[j][0], polygon[j][1]

        # L'arête traverse-t-elle la ligne horizontale y ?
        if (yi > y) != (yj > y):
            # Abscisse de l'intersection
            x_cross = xi + (y - yi) / (yj - yi) * (xj - xi)
            if x < x_cross:
                inside = not inside
        j = i

    return inside


def simple_triangulation(vertices: np.ndarray, mesh_size: float = None) -> Dict:
    """
    Triangulation de repli (sans pygmsh) avec respect de la taille de maille

    CORRECTION: l'ancienne version appelait Delaunay directement sur les seuls
    sommets du contour et ignorait `mesh_size`. Pour une piste rectangulaire
    elle renvoyait donc 4 sommets / 2 triangles quelle que soit la valeur de
    --mesh_size, soit 1 seule fonction RWG : le solveur ne pouvait produire
    aucun résultat exploitable.

    On sème maintenant des points intérieurs sur une grille au pas mesh_size,
    plus des points de subdivision le long du contour.

    CORRECTION: ajout du filtrage de parité sur les barycentres. Delaunay
    maille l'enveloppe convexe ; sans ce filtre, un polygone non convexe (L,
    U, plan évidé) reçoit des triangles hors cuivre. Ce filtrage était décrit
    comme déjà présent dans la revue, mais il était en réalité absent.

    Args:
        vertices: Sommets du polygone (Nx2)
        mesh_size: Taille caractéristique visée (None = contour seul)

    Returns:
        Dictionnaire avec vertices (Nx3) et elements (Mx3)
    """
    from scipy.spatial import Delaunay

    poly = np.asarray(vertices, dtype=float)[:, :2]

    points = [poly]

    if mesh_size is not None and mesh_size > 0:
        # 1. Subdivision du contour : garantit des arêtes de bord assez fines
        contour_pts = []
        n_v = len(poly)
        for i in range(n_v):
            p1 = poly[i]
            p2 = poly[(i + 1) % n_v]
            seg_len = np.linalg.norm(p2 - p1)
            n_sub = int(np.floor(seg_len / mesh_size))
            for s in range(1, n_sub + 1):
                t = s / (n_sub + 1)
                contour_pts.append(p1 + t * (p2 - p1))

        if contour_pts:
            points.append(np.array(contour_pts))

        # 2. Grille de points intérieurs
        x_min, y_min = poly.min(axis=0)
        x_max, y_max = poly.max(axis=0)

        nx = max(1, int(np.ceil((x_max - x_min) / mesh_size)))
        ny = max(1, int(np.ceil((y_max - y_min) / mesh_size)))

        xs = np.linspace(x_min, x_max, nx + 1)
        ys = np.linspace(y_min, y_max, ny + 1)

        interior = []
        for x in xs:
            for y in ys:
                p = np.array([x, y])
                if point_in_polygon(p, poly):
                    interior.append(p)

        if interior:
            points.append(np.array(interior))

    all_points = np.vstack(points)

    # Déduplication (des points de grille peuvent coïncider avec le contour)
    all_points = np.unique(np.round(all_points, 12), axis=0)

    if len(all_points) < 3:
        raise ValueError(
            f"simple_triangulation: {len(all_points)} points, "
            "insuffisant pour trianguler"
        )

    tri = Delaunay(all_points)

    # Filtrage de parité : on ne garde que les triangles dont le barycentre
    # est dans le polygone (élimine le débord d'enveloppe convexe)
    kept = []
    for simplex in tri.simplices:
        centroid = all_points[simplex].mean(axis=0)
        if point_in_polygon(centroid, poly):
            kept.append(simplex)

    if not kept:
        logger.warning(
            "Filtrage de parité a éliminé tous les triangles, "
            "conservation de la triangulation brute"
        )
        kept = tri.simplices
    else:
        kept = np.array(kept)

    vertices_3d = np.column_stack([all_points, np.zeros(len(all_points))])

    return {
        'vertices': vertices_3d,
        'elements': np.asarray(kept)
    }



def extract_edges(mesh: Dict) -> List[Edge]:
    """
    Identifie les arêtes internes communes entre triangles adjacents
    
    Args:
        mesh: Structure de maillage
        
    Returns:
        Liste des arêtes internes
    """
    logger.debug("Extraction des arêtes internes")
    
    vertices = mesh['vertices']
    elements = mesh['elements']
    
    # Dictionnaire pour stocker les arêtes : (v1, v2) -> [triangles]
    edge_map = {}
    
    for tri_idx, triangle in enumerate(elements):
        # Les 3 arêtes du triangle
        edges_in_tri = [
            (min(triangle[0], triangle[1]), max(triangle[0], triangle[1])),
            (min(triangle[1], triangle[2]), max(triangle[1], triangle[2])),
            (min(triangle[2], triangle[0]), max(triangle[2], triangle[0]))
        ]
        
        for edge in edges_in_tri:
            if edge not in edge_map:
                edge_map[edge] = []
            edge_map[edge].append(tri_idx)
    
    # Sélection des arêtes internes (partagées par exactement 2 triangles)
    internal_edges = []
    
    for edge_verts, tri_list in edge_map.items():
        if len(tri_list) == 2:
            v1, v2 = edge_verts
            pos1 = vertices[v1]
            pos2 = vertices[v2]
            
            edge_length = np.linalg.norm(pos2 - pos1)
            edge_center = (pos1 + pos2) / 2
            
            edge = Edge(
                vertices=edge_verts,
                tri_plus=tri_list[0],
                tri_minus=tri_list[1],
                length=edge_length,
                center=edge_center
            )
            
            internal_edges.append(edge)
    
    logger.debug(f"  {len(internal_edges)} arêtes internes identifiées")
    
    return internal_edges


def build_rwg_basis(mesh: Dict, edges: List[Edge]) -> List[RWGBasis]:
    """
    Instancie les fonctions de base RWG sur les arêtes
    
    Args:
        mesh: Structure de maillage
        edges: Liste des arêtes internes
        
    Returns:
        Liste des fonctions de base RWG
    """
    logger.debug("Construction des fonctions de base RWG")
    
    vertices = mesh['vertices']
    elements = mesh['elements']
    
    rwg_basis = []
    
    for edge_idx, edge in enumerate(edges):
        tri_plus = elements[edge.tri_plus]
        tri_minus = elements[edge.tri_minus]
        
        # Sommet libre dans T+ (celui qui n'est pas sur l'arête commune)
        vertex_plus = None
        for v in tri_plus:
            if v not in edge.vertices:
                vertex_plus = v
                break
        
        # Sommet libre dans T-
        vertex_minus = None
        for v in tri_minus:
            if v not in edge.vertices:
                vertex_minus = v
                break
        
        if vertex_plus is None or vertex_minus is None:
            logger.warning(f"Sommet libre introuvable pour l'arête {edge_idx}")
            continue
        
        # Calcul des aires
        area_plus = compute_triangle_area(vertices[tri_plus])
        area_minus = compute_triangle_area(vertices[tri_minus])
        
        # Création de la fonction RWG
        rwg = RWGBasis(
            edge_index=edge_idx,
            tri_plus=edge.tri_plus,
            tri_minus=edge.tri_minus,
            vertex_plus=vertex_plus,
            vertex_minus=vertex_minus,
            edge_length=edge.length,
            area_plus=area_plus,
            area_minus=area_minus,
            edge_vertices=edge.vertices
        )
        
        rwg_basis.append(rwg)
    
    logger.debug(f"  {len(rwg_basis)} fonctions RWG créées")
    
    return rwg_basis


def compute_triangle_area(vertices: np.ndarray) -> float:
    """
    Calcule l'aire d'un triangle
    
    Args:
        vertices: 3x3 array des coordonnées des sommets
        
    Returns:
        Aire du triangle
    """
    v0, v1, v2 = vertices
    cross = np.cross(v1 - v0, v2 - v0)
    area = 0.5 * np.linalg.norm(cross)
    return area


def evaluate_rwg(rwg: RWGBasis, position: np.ndarray, vertices: np.ndarray, 
                 elements: np.ndarray) -> np.ndarray:
    """
    Évalue une fonction de base RWG en un point
    
    Args:
        rwg: Fonction de base RWG
        position: Point d'évaluation (x, y, z)
        vertices: Sommets du maillage
        elements: Éléments du maillage
        
    Returns:
        Vecteur de la fonction RWG en ce point
    """
    # Déterminer dans quel triangle se trouve le point
    tri_plus_verts = vertices[elements[rwg.tri_plus]]
    tri_minus_verts = vertices[elements[rwg.tri_minus]]
    
    in_tri_plus = point_in_triangle(position, tri_plus_verts)
    in_tri_minus = point_in_triangle(position, tri_minus_verts)
    
    if in_tri_plus:
        # Dans T+ : f = l_n / (2*A+) * (r - r+)
        vertex_pos = vertices[rwg.vertex_plus]
        vector = rwg.edge_length / (2 * rwg.area_plus) * (position - vertex_pos)
        return vector
        
    elif in_tri_minus:
        # Dans T- : f = l_n / (2*A-) * (r- - r)
        vertex_pos = vertices[rwg.vertex_minus]
        vector = rwg.edge_length / (2 * rwg.area_minus) * (vertex_pos - position)
        return vector
        
    else:
        # En dehors : fonction nulle
        return np.zeros(3)


def point_in_triangle(point: np.ndarray, triangle: np.ndarray) -> bool:
    """
    Teste si un point est dans un triangle (coordonnées barycentriques)
    
    Args:
        point: Coordonnées du point (3D)
        triangle: 3x3 array des sommets du triangle
        
    Returns:
        True si le point est dans le triangle
    """
    v0, v1, v2 = triangle
    
    # Coordonnées barycentriques
    v0v1 = v1 - v0
    v0v2 = v2 - v0
    v0p = point - v0
    
    dot00 = np.dot(v0v1, v0v1)
    dot01 = np.dot(v0v1, v0v2)
    dot02 = np.dot(v0v1, v0p)
    dot11 = np.dot(v0v2, v0v2)
    dot12 = np.dot(v0v2, v0p)
    
    inv_denom = 1 / (dot00 * dot11 - dot01 * dot01)
    u = (dot11 * dot02 - dot01 * dot12) * inv_denom
    v = (dot00 * dot12 - dot01 * dot02) * inv_denom
    
    return (u >= 0) and (v >= 0) and (u + v <= 1)


def get_rwg_center(rwg: RWGBasis, vertices: np.ndarray, edges: List[Edge]) -> np.ndarray:
    """
    Retourne le centre de l'arête associée à une fonction RWG
    
    Args:
        rwg: Fonction de base RWG
        vertices: Sommets du maillage
        edges: Liste des arêtes
        
    Returns:
        Position du centre de l'arête
    """
    edge = edges[rwg.edge_index]
    return edge.center
