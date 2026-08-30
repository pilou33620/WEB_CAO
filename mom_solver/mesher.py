"""
Module de maillage triangulaire et génération des fonctions de base RWG
Utilise pygmsh pour créer un maillage adapté aux éléments finis
"""

import numpy as np
import logging
from typing import Dict, List, Tuple, Optional
from dataclasses import dataclass

logger = logging.getLogger(__name__)

# Import RELATIF d'abord, A PLAT ensuite. Les bancs de mom_solver/tests
# mettent mom_solver/ dans sys.path et importent a plat ; le paquet, lui,
# s'importe en relatif. Sans ce couple, l'un des deux chemins casse -- et
# c'etait `import mom_solver` qui cassait.
try:
    from .green_layered import indices_plans_masse, profil_spectral
except ImportError:                                    # noqa: BLE001
    from green_layered import (indices_plans_masse,    # noqa: E402
                               profil_spectral)


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


# ==========================================================================
# LE VIA DE PORT : UN PUITS PERCE DANS LA PISTE
# --------------------------------------------------------------------------
# CE QU'UN PORT DE MICRORUBAN DOIT FAIRE, ET QUE LA FENTE NE FAISAIT PAS. Le
# generateur est branche entre la PISTE et le PLAN DE MASSE : il injecte un
# courant VERTICAL, qui monte le via, part le long de la ligne, et revient par
# le plan. La fente serie, elle, coupait la piste en deux et mettait le
# generateur ENTRE les deux moities -- deux troncons ouverts en serie, donc
# deux impedances enormes, donc pas de courant. Le banc le mesurait sans
# ambiguite : |S21| = 0,0065 sur une ligne de L/lambda_g = 0,07, et |S11| = 1.
#
# LA CONSTRUCTION, ET POURQUOI ELLE NE DEMANDE AUCUNE FONCTION DE BASE NOUVELLE
# AU SOMMET. On PERCE le maillage -- on retire un triangle -- et on descend un
# fut sur le contour du trou. Chaque arete du trou porte alors exactement deux
# triangles : celui de la piste qui reste, et celui de la paroi. C'est une
# arete interne ordinaire, et `build_rwg_basis` y pose une RWG ordinaire, qui
# fait passer le courant de la piste a la paroi sans qu'on ait rien a lui dire.
#
# ON EVITE AINSI LA JONCTION EN T, qui aurait ete l'autre facon de faire :
# souder le fut SOUS la piste sans la percer donne une arete a TROIS triangles,
# que la formulation RWG ne sait pas traiter sans fonctions de jonction. Percer
# coute un triangle de piste et rend le probleme ordinaire.
#
# LE BAS EST UNE DEMI-RWG, ET C'EST LA QU'EST LA PHYSIQUE. Les aretes du bas du
# fut ne bordent qu'un seul triangle : le maillage s'y arrete, parce que le
# plan de masse n'est pas maille -- la fonction de Green le compte
# analytiquement. Une demi-RWG y est EXACTE, et non un pis-aller : l'image d'un
# courant vertical dans un conducteur parfait est un courant vertical de MEME
# signe, donc la demi-fonction et son image forment une RWG complete a cheval
# sur le plan, et la charge de la moitie manquante est exactement celle que la
# fonction de Green stratifiee produit toute seule. C'est `NoyauxVerticaux` qui
# le verifie, a 3.10^-16 contre la forme fermee.
#
# ET LE PORT EST UNE VRAIE COUPE. La tension se pose sur ces demi-aretes,
# c'est-a-dire sur la fente infinitesimale entre le bas du fut et le plan. Tout
# chemin de courant entre la piste et le plan la traverse, puisque le via est
# le SEUL conducteur qui les relie : rien ne la contourne, ce qui etait tout le
# probleme de la fente serie.
#
# LA HAUTEUR DU FUT EST LA HAUTEUR ELECTRIQUE, pas la hauteur geometrique. Le
# modele 2,5D suppose le cuivre infiniment mince ; la pile electrique va donc
# du plan des pistes a l'epaisseur de dielectrique en dessous, et non au sommet
# du cuivre du plan de masse. Sur du FR-4 de 0,37 mm avec 35 um de cuivre les
# deux different de 9 %, et un fut bati sur la mauvaise s'en trouve faux
# d'autant. `hauteur_electrique` la lit dans l'empilage, et c'est elle qu'il
# faut passer.
# ==========================================================================

def hauteur_electrique(stackup, z_piste=None):
    """L'epaisseur de dielectrique entre le plan des pistes et le plan de masse.

    C'est la hauteur que le fut d'un via de port doit avoir dans le maillage,
    pour que la geometrie que le moteur integre et la pile que la fonction de
    Green cascade soient la meme chose.
    """
    profil = profil_spectral(stackup, z_piste)
    bas, masse_bas = profil[0], profil[2]
    if not masse_bas:
        raise ValueError(
            "hauteur_electrique : la pile sous la piste ne bute sur aucun plan "
            "de masse. Un via de port relie la piste au plan ; sans plan il "
            "n'y a pas de port.")
    return float(sum(e for e, _ in bas if e > 0))


def _triangle_le_plus_proche(mesh, position_xy, z_cible=None):
    """L'indice du triangle dont le centre de gravite est le plus proche."""
    vertices = mesh['vertices']
    elements = np.asarray(mesh['elements'])
    centres = vertices[elements].mean(axis=1)

    d2 = ((centres[:, 0] - position_xy[0]) ** 2
          + (centres[:, 1] - position_xy[1]) ** 2)
    if z_cible is not None:
        # On ne perce que la couche visee : sur un maillage a plusieurs
        # couches, le triangle le plus proche en x, y peut etre sur l'autre.
        loin = np.abs(centres[:, 2] - z_cible) > 1e-9
        d2 = np.where(loin, np.inf, d2)
    if not np.any(np.isfinite(d2)):
        raise ValueError("percer_via_port : aucun triangle sur la couche visee")
    return int(np.argmin(d2))


def percer_via_port(mesh, position_xy, hauteur, z_cible=None):
    """Perce le maillage a l'endroit dit, et y descend un fut de via.

    Args:
        mesh: le maillage, tel que `generate_2d_mesh` le rend
        position_xy: (x, y) du via, en metres
        hauteur: la hauteur ELECTRIQUE du fut -- voir `hauteur_electrique`
        z_cible: l'altitude de la couche a percer ; deduite du triangle le plus
                 proche quand elle manque

    Returns:
        (mesh, aretes_du_bas) ou `aretes_du_bas` est la liste des couples
        (sommet_a, sommet_b, indice_du_triangle) sur lesquels il faudra poser
        les demi-RWG du port.

    LE VIA A LA TAILLE D'UN TRIANGLE DU MAILLAGE, et c'est assume. Un vrai via
    de 0,3 mm dans une piste maillee au dixieme de millimetre demanderait un
    maillage local, donc un mailleur qui sache raffiner ; ici la taille du
    port suit celle de la maille. C'est sans consequence sur le resultat
    DE-EMBARQUE -- le de-embarquement retire le port, quelle que soit sa
    taille --, et c'en a une sur le resultat brut, qu'on ne publie donc pas.
    """
    vertices = np.asarray(mesh['vertices'], dtype=float)
    elements = np.asarray(mesh['elements'], dtype=int)
    layer_ids = np.asarray(mesh.get('layer_ids',
                                    np.zeros(len(elements), dtype=int)))

    i_perce = _triangle_le_plus_proche(mesh, position_xy, z_cible)
    trou = elements[i_perce].copy()
    couche = int(layer_ids[i_perce])
    z_haut = float(vertices[trou].mean(axis=0)[2])

    # Les trois sommets du bas, a la verticale de ceux du trou.
    n_v = len(vertices)
    bas = np.arange(n_v, n_v + 3)
    nouveaux = vertices[trou].copy()
    nouveaux[:, 2] = z_haut - hauteur
    vertices = np.vstack([vertices, nouveaux])

    # Le triangle perce sort ; les indices d'apres reculent d'un cran, et les
    # aretes du bas devront pointer sur les indices d'APRES la renumerotation.
    garde = np.array([i for i in range(len(elements)) if i != i_perce],
                     dtype=int)
    elements = elements[garde]
    layer_ids = layer_ids[garde]

    # Les trois parois, deux triangles chacune.
    parois = []
    aretes_bas = []
    for k in range(3):
        p_a, p_b = int(trou[k]), int(trou[(k + 1) % 3])
        q_a, q_b = int(bas[k]), int(bas[(k + 1) % 3])
        parois.append((p_a, p_b, q_b))
        parois.append((p_a, q_b, q_a))
        # L'arete du bas appartient au SECOND triangle de la paroi.
        aretes_bas.append((q_a, q_b, len(elements) + len(parois) - 1))

    elements = np.vstack([elements, np.asarray(parois, dtype=int)])
    layer_ids = np.concatenate([layer_ids,
                                np.full(len(parois), couche, dtype=int)])

    maille = dict(mesh)
    maille['vertices'] = vertices
    maille['elements'] = elements
    maille['layer_ids'] = layer_ids
    maille['num_vertices'] = len(vertices)
    maille['num_elements'] = len(elements)
    return maille, aretes_bas


def demi_rwg_du_bas(mesh, aretes_bas, decalage=0):
    """Les demi-RWG du bas du fut : la fonction de base du port.

    UNE DEMI-RWG EST UNE RWGBasis DONT L'AIRE MOINS EST NULLE. Ce n'est pas un
    bricolage : `_triangles_de` saute les triangles d'aire nulle, si bien que
    la fonction ne vit que sur son T+, avec div f = l/A+ et une charge non
    compensee -- exactement ce qu'il faut, puisque c'est l'IMAGE dans le plan
    de masse qui porte la charge opposee, et que la fonction de Green
    stratifiee la produit toute seule.

    `decalage` est le nombre de RWG deja construites : les demi-RWG viennent
    apres, et leurs indices servent a designer le port.

    Rend (demi_rwg, coupe) ou `coupe` est la liste de couples (indice, signe)
    que `vecteur_de_coupe` et `courant_de_coupe` attendent. Le signe est +1
    partout : la fonction RWG pointe de son sommet libre VERS l'arete, donc un
    coefficient positif est un courant qui SORT du fut vers le plan de masse.
    """
    vertices = np.asarray(mesh['vertices'], dtype=float)
    elements = np.asarray(mesh['elements'], dtype=int)

    demi = []
    coupe = []
    for k, (v_a, v_b, i_tri) in enumerate(aretes_bas):
        triangle = elements[i_tri]
        libres = [int(v) for v in triangle if v not in (v_a, v_b)]
        if len(libres) != 1:
            raise ValueError(
                "demi_rwg_du_bas : l'arete (%d, %d) n'appartient pas au "
                "triangle %d" % (v_a, v_b, i_tri))

        longueur = float(np.linalg.norm(vertices[v_b] - vertices[v_a]))
        aire = compute_triangle_area(vertices[triangle])

        demi.append(RWGBasis(
            edge_index=-1 - k,
            tri_plus=int(i_tri),
            tri_minus=int(i_tri),        # jamais lu : son aire est nulle
            vertex_plus=libres[0],
            vertex_minus=libres[0],
            edge_length=longueur,
            area_plus=aire,
            area_minus=0.0,              # C'EST CE QUI EN FAIT UNE DEMI-RWG
            edge_vertices=(int(v_a), int(v_b)),
        ))
        coupe.append((decalage + k, +1.0))

    return demi, coupe


def maillage_avec_ports_verticaux(mesh, positions, hauteur, z_cible=None):
    """Le maillage perce de tous ses ports, ses RWG, et la coupe de chaque port.

    L'ORDRE COMPTE : on perce TOUS les trous d'abord, on construit les RWG
    ordinaires ENSUITE, et on ajoute les demi-RWG a la fin. Percer entre deux
    constructions renumeroterait les triangles sous les RWG deja faites.

    Returns:
        (mesh, rwg_basis, coupes) -- `coupes` est une liste par port, prete
        pour `build_v_vector`, `compute_s_parameters` et `courant_de_coupe`.
    """
    aretes_par_port = []
    for xy in positions:
        mesh, aretes = percer_via_port(mesh, xy, hauteur, z_cible)
        aretes_par_port.append(aretes)

    # LES TROUS DEJA PERCES DECALENT LES TRIANGLES DES PRECEDENTS. Chaque
    # percage retire un triangle, donc tous les indices au-dessus reculent
    # d'un. On corrige apres coup plutot que de percer un par un et de
    # reconstruire : c'est le meme calcul, en une passe.
    #
    # En pratique `percer_via_port` ajoute ses parois EN FIN de tableau et ne
    # retire qu'un triangle situe AVANT elles, donc les indices rendus par un
    # percage anterieur reculent d'exactement un par percage ulterieur.
    for k, aretes in enumerate(aretes_par_port):
        recul = len(aretes_par_port) - 1 - k
        if recul:
            aretes_par_port[k] = [(a, b, i - recul) for a, b, i in aretes]

    rwg_basis = build_rwg_basis(mesh, extract_edges(mesh))

    coupes = []
    for aretes in aretes_par_port:
        demi, coupe = demi_rwg_du_bas(mesh, aretes, decalage=len(rwg_basis))
        rwg_basis.extend(demi)
        coupes.append(coupe)

    logger.info("  %d port(s) vertical(aux) : %d RWG dont %d demi-RWG de port",
                len(positions), len(rwg_basis),
                sum(len(c) for c in coupes))
    return mesh, rwg_basis, coupes
