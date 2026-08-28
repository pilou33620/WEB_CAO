"""
Module de parsing des données PCB exportées depuis l'éditeur JavaScript
Traduit le JSON en structures géométriques exploitables par le solveur
"""

import json
import numpy as np
import logging
from typing import Dict, List, Tuple, Any

logger = logging.getLogger(__name__)


def load_json(filepath: str) -> Dict:
    """
    Charge et parse le fichier JSON d'échange
    
    Args:
        filepath: Chemin vers le fichier JSON exporté depuis l'éditeur
        
    Returns:
        Dictionnaire contenant toutes les données du PCB
    """
    logger.debug(f"Chargement du fichier : {filepath}")
    
    with open(filepath, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    # Validation de la structure minimale
    required_keys = ['stackup', 'geometry', 'version']
    for key in required_keys:
        if key not in data:
            raise ValueError(f"Clé manquante dans le JSON : {key}")
    
    logger.debug(f"Version du format : {data.get('version', 'inconnue')}")
    
    return data


def extract_stackup(data: Dict) -> Dict:
    """
    Extrait le profil diélectrique du PCB (stackup)
    
    Args:
        data: Données JSON complètes
        
    Returns:
        Dictionnaire décrivant l'empilement des couches avec :
        - layers: liste des couches (épaisseur, εr, tanδ)
        - total_height: hauteur totale du PCB
    """
    logger.debug("Extraction du stackup")
    
    stackup_data = data['stackup']
    layers = []
    z_position = 0.0
    
    for i, layer in enumerate(stackup_data.get('layers', [])):
        thickness = layer.get('thickness', 0.0)  # en mm
        epsilon_r = layer.get('epsilon_r', 1.0)
        tan_delta = layer.get('tan_delta', 0.0)
        layer_type = layer.get('type', 'dielectric')  # 'dielectric' ou 'copper'
        
        layer_info = {
            'index': i,
            'type': layer_type,
            'thickness': thickness * 1e-3,  # conversion mm -> m
            'epsilon_r': epsilon_r,
            'tan_delta': tan_delta,
            'z_bottom': z_position * 1e-3,
            'z_top': (z_position + thickness) * 1e-3
        }
        
        layers.append(layer_info)
        z_position += thickness
        
        logger.debug(f"  Couche {i} ({layer_type}): h={thickness}mm, εr={epsilon_r}")
    
    stackup = {
        'layers': layers,
        'total_height': z_position * 1e-3,  # en mètres
        'num_layers': len(layers)
    }
    
    return stackup


def _propagate_port_metadata(obj: Dict, polygon: Dict) -> None:
    """
    Recopie les annotations de port du JSON vers le polygone

    CORRECTION: extract_polygons ne conservait aucune de ces clés, donc
    detect_ports ne trouvait jamais 'port_id' et créait systématiquement des
    ports par défaut aux coins des polygones, quelle que soit l'annotation
    fournie par l'éditeur.

    Args:
        obj: Objet JSON source
        polygon: Polygone de destination (modifié sur place)
    """
    for key in ('port_id', 'port_impedance', 'port_type', 'port_position'):
        if key in obj:
            polygon[key] = obj[key]


def extract_polygons(data: Dict) -> List[Dict]:
    """
    Récupère les coordonnées spatiales des zones de cuivre
    
    Args:
        data: Données JSON complètes
        
    Returns:
        Liste de polygones avec leurs propriétés
    """
    logger.debug("Extraction des polygones")
    
    geometry_data = data['geometry']
    polygons = []
    
    for obj in geometry_data.get('objects', []):
        obj_type = obj.get('type')
        
        if obj_type == 'zone':
            # Zone de cuivre (plan de masse, polygone de routage)
            vertices = np.array(obj.get('vertices', []))  # [[x1,y1], [x2,y2], ...]
            
            polygon = {
                'type': 'zone',
                'vertices': vertices * 1e-3,  # conversion mm -> m
                'layer': obj.get('layer', 0),
                'net': obj.get('net', None),
                'role': obj.get('role', 'signal'),  # 'signal', 'plane', 'ground'
                'copper_thickness': obj.get('copper_thickness', 35e-6)  # 35µm par défaut
            }

            # CORRECTION: les annotations de port étaient perdues ici, si bien
            # que detect_ports ne les voyait jamais et retombait toujours sur
            # les ports par défaut.
            _propagate_port_metadata(obj, polygon)

            polygons.append(polygon)
            
        elif obj_type == 'track':
            # Piste (segment)
            start = np.array(obj.get('start', [0, 0])) * 1e-3
            end = np.array(obj.get('end', [0, 0])) * 1e-3
            width = obj.get('width', 0.2) * 1e-3  # largeur en m
            
            # Conversion piste -> rectangle
            dx = end[0] - start[0]
            dy = end[1] - start[1]
            length = np.sqrt(dx**2 + dy**2)
            
            if length > 0:
                # Vecteur perpendiculaire
                nx = -dy / length
                ny = dx / length
                
                # 4 sommets du rectangle
                vertices = np.array([
                    start + width/2 * np.array([nx, ny]),
                    start - width/2 * np.array([nx, ny]),
                    end - width/2 * np.array([nx, ny]),
                    end + width/2 * np.array([nx, ny])
                ])
                
                polygon = {
                    'type': 'track',
                    'vertices': vertices,
                    'layer': obj.get('layer', 0),
                    'net': obj.get('net', None),
                    'role': 'signal',
                    'copper_thickness': obj.get('copper_thickness', 35e-6),
                    'width': width,
                    # Extrémités réelles de la piste : servent à positionner
                    # les ports au bon endroit (et non sur un coin du rectangle)
                    'start': start,
                    'end': end
                }

                # CORRECTION: préservation des annotations de port
                _propagate_port_metadata(obj, polygon)

                polygons.append(polygon)
    
    logger.debug(f"  {len(polygons)} polygones extraits")
    
    return polygons


def build_geometry_model(polygons: List[Dict], stackup: Dict) -> Dict:
    """
    Construit un modèle géométrique unifié pour le mailleur
    
    Args:
        polygons: Liste des polygones de cuivre
        stackup: Stackup du PCB
        
    Returns:
        Modèle géométrique complet avec métadonnées
    """
    logger.debug("Construction du modèle géométrique")
    
    # Identification des plans de masse
    ground_planes = [p for p in polygons if p['role'] in ['ground', 'plane']]
    signal_objects = [p for p in polygons if p['role'] == 'signal']
    
    # Détection automatique des ports (gaps dans les pistes)
    ports = detect_ports(signal_objects)
    
    # Calcul du bounding box global
    all_vertices = np.vstack([p['vertices'] for p in polygons])
    bbox = {
        'x_min': np.min(all_vertices[:, 0]),
        'x_max': np.max(all_vertices[:, 0]),
        'y_min': np.min(all_vertices[:, 1]),
        'y_max': np.max(all_vertices[:, 1])
    }
    
    geometry = {
        'polygons': polygons,
        'ground_planes': ground_planes,
        'signal_objects': signal_objects,
        'ports': ports,
        'bbox': bbox,
        'stackup': stackup
    }
    
    logger.debug(f"  Plans de masse : {len(ground_planes)}")
    logger.debug(f"  Objets signal : {len(signal_objects)}")
    logger.debug(f"  Ports détectés : {len(ports)}")
    
    return geometry


def detect_ports(signal_objects: List[Dict]) -> List[Dict]:
    """
    Détecte les ports d'excitation (gaps, transitions)
    
    Args:
        signal_objects: Liste des objets de signal
        
    Returns:
        Liste des ports avec leurs propriétés
    """
    ports = []

    # Recherche d'annotations de ports dans les métadonnées
    for i, obj in enumerate(signal_objects):
        if 'port_id' in obj:
            port_pos = _resolve_port_position(obj)

            if port_pos is None:
                logger.warning(
                    f"Port {obj.get('port_id')} : position indéterminable, ignoré"
                )
                continue

            ports.append({
                'id': obj.get('port_id', i),
                'position': port_pos,
                'layer': obj['layer'],
                'net': obj['net'],
                'impedance': obj.get('port_impedance', 50.0),
                'type': obj.get('port_type', 'gap')
            })

    # Si aucun port n'est explicitement défini, créer des ports par défaut
    if len(ports) == 0 and len(signal_objects) > 0:
        logger.warning("Aucun port explicite détecté, création de ports par défaut")

        obj = signal_objects[0]

        # CORRECTION: on utilise les extrémités de l'axe de la piste.
        # L'ancien code prenait vertices[0] et vertices[-1], qui sont des
        # coins du rectangle décalés d'une demi-largeur de piste, et non les
        # extrémités réelles de la ligne.
        if 'start' in obj and 'end' in obj:
            p1 = np.asarray(obj['start'], dtype=float)
            p2 = np.asarray(obj['end'], dtype=float)
        else:
            # Repli pour une zone : extrémités du plus grand axe du bbox
            verts = np.asarray(obj['vertices'], dtype=float)
            centroid = verts.mean(axis=0)
            spread = verts.max(axis=0) - verts.min(axis=0)
            axis = int(np.argmax(spread))

            p1 = centroid.copy()
            p2 = centroid.copy()
            p1[axis] = verts.min(axis=0)[axis]
            p2[axis] = verts.max(axis=0)[axis]

        for idx, pos in enumerate((p1, p2), start=1):
            ports.append({
                'id': idx,
                'position': pos,
                'layer': obj['layer'],
                'net': obj['net'],
                'impedance': 50.0,
                'type': 'gap'
            })

    return ports


def _resolve_port_position(obj: Dict) -> np.ndarray:
    """
    Détermine la position géométrique d'un port annoté

    Ordre de priorité :
      1. 'port_position' explicite (mm -> m)
      2. extrémité 'start' de la piste (axe réel, pas un coin)
      3. milieu de la première arête du polygone

    Args:
        obj: Polygone porteur de l'annotation de port

    Returns:
        Position 2D en mètres, ou None si indéterminable
    """
    if 'port_position' in obj:
        return np.asarray(obj['port_position'], dtype=float) * 1e-3

    if 'start' in obj:
        return np.asarray(obj['start'], dtype=float)

    vertices = np.asarray(obj.get('vertices', []), dtype=float)
    if len(vertices) >= 2:
        return (vertices[0] + vertices[1]) / 2

    return None


def identify_nets(polygons: List[Dict]) -> Dict[str, List[int]]:
    """
    Regroupe les polygones par net
    
    Args:
        polygons: Liste des polygones
        
    Returns:
        Dictionnaire {nom_net: [indices de polygones]}
    """
    nets = {}
    
    for i, poly in enumerate(polygons):
        net_name = poly.get('net', 'unnamed')
        if net_name not in nets:
            nets[net_name] = []
        nets[net_name].append(i)
    
    return nets


def get_layer_z_position(layer_index: int, stackup: Dict) -> float:
    """
    Retourne la position Z (altitude) d'une couche de cuivre
    
    Args:
        layer_index: Indice de la couche
        stackup: Structure du stackup
        
    Returns:
        Position Z en mètres
    """
    layers = stackup['layers']
    
    if layer_index < 0 or layer_index >= len(layers):
        raise ValueError(f"Indice de couche invalide : {layer_index}")
    
    # Position au milieu de la couche de cuivre
    layer = layers[layer_index]
    z_position = (layer['z_bottom'] + layer['z_top']) / 2
    
    return z_position
