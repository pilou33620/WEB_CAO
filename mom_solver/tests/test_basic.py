"""
Script de test pour valider l'installation et le fonctionnement du solveur MoM
"""

import sys
import os
import numpy as np

# Ajout du chemin parent pour importer le module mom_solver
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

try:
    from mom_solver import (
        load_json, extract_stackup, extract_polygons, build_geometry_model,
        generate_2d_mesh, extract_edges, build_rwg_basis,
        apply_dcim, fill_z_matrix, build_v_vector,
        solve_currents, compute_s_parameters, export_touchstone
    )
    print("✓ Tous les modules importés avec succès")
except ImportError as e:
    print(f"✗ Erreur d'import : {e}")
    sys.exit(1)


def test_basic_workflow():
    """Test du workflow complet avec des données minimales"""
    print("\n=== Test du workflow de base ===\n")
    
    # 1. Données de test minimales
    print("1. Création de données de test...")
    test_data = {
        'version': '1.0',
        'stackup': {
            'layers': [
                {'thickness': 0.035, 'epsilon_r': 1.0, 'tan_delta': 0.0, 'type': 'copper'},
                {'thickness': 1.6, 'epsilon_r': 4.5, 'tan_delta': 0.02, 'type': 'dielectric'},
            ]
        },
        'geometry': {
            'objects': [
                {
                    'type': 'zone',
                    'vertices': [[0, 0], [10, 0], [10, 10], [0, 10]],
                    'layer': 0,
                    'net': 'GND',
                    'role': 'plane',
                    'copper_thickness': 0.035
                }
            ]
        }
    }
    print("   ✓ Données de test créées")
    
    # 2. Extraction stackup
    print("\n2. Test extraction stackup...")
    stackup = extract_stackup(test_data)
    assert 'layers' in stackup
    assert len(stackup['layers']) == 2
    print(f"   ✓ Stackup : {len(stackup['layers'])} couches")
    
    # 3. Extraction géométrie
    print("\n3. Test extraction géométrie...")
    polygons = extract_polygons(test_data)
    assert len(polygons) == 1
    print(f"   ✓ Géométrie : {len(polygons)} polygone(s)")
    
    # 4. Construction du modèle
    print("\n4. Test construction modèle géométrique...")
    geometry = build_geometry_model(polygons, stackup)
    assert 'polygons' in geometry
    assert 'ports' in geometry
    print(f"   ✓ Modèle construit : {len(geometry['ports'])} port(s)")
    
    # 5. Maillage
    print("\n5. Test génération maillage...")
    mesh = generate_2d_mesh(geometry, mesh_size=2.0)
    assert 'vertices' in mesh
    assert 'elements' in mesh
    print(f"   ✓ Maillage : {mesh['num_vertices']} sommets, {mesh['num_elements']} triangles")
    
    # 6. Arêtes et RWG
    print("\n6. Test extraction arêtes et fonctions RWG...")
    edges = extract_edges(mesh)
    rwg_basis = build_rwg_basis(mesh, edges)
    print(f"   ✓ RWG : {len(rwg_basis)} fonctions de base")
    
    # 7. DCIM
    print("\n7. Test calcul DCIM...")
    images = apply_dcim(stackup, num_images=5)
    print(f"   ✓ DCIM : {len(images)} sources images")
    
    # 8. Matrice Z (version réduite pour test)
    if len(rwg_basis) > 0 and len(rwg_basis) <= 10:
        print("\n8. Test assemblage matrice Z...")
        freq = 1e9  # 1 GHz
        z_matrix = fill_z_matrix(rwg_basis, freq, images, stackup, 
                                 mesh['vertices'], mesh['elements'])
        assert z_matrix.shape == (len(rwg_basis), len(rwg_basis))
        print(f"   ✓ Matrice Z : {z_matrix.shape[0]}x{z_matrix.shape[1]}")
        
        # 9. Vecteur V
        print("\n9. Test construction vecteur excitation...")
        v_vector = build_v_vector(rwg_basis, geometry['ports'], freq)
        assert len(v_vector) == len(rwg_basis)
        print(f"   ✓ Vecteur V : {len(v_vector)} éléments")
        
        # 10. Résolution
        print("\n10. Test résolution système...")
        currents = solve_currents(z_matrix, v_vector)
        assert len(currents) == len(rwg_basis)
        print(f"   ✓ Courants : {len(currents)} coefficients")
        
        # 11. Paramètres S
        print("\n11. Test calcul paramètres S...")
        s_matrix = compute_s_parameters(currents, geometry['ports'], freq, z_matrix)
        print(f"   ✓ Paramètres S : {s_matrix.shape[0]}x{s_matrix.shape[1]}")
        print(f"      S11 = {s_matrix[0, 0]:.4f}")
        
    else:
        print(f"\n8-11. Skippé (maillage trop fin : {len(rwg_basis)} fonctions)")
    
    print("\n=== Tous les tests réussis ✓ ===\n")


def test_dependencies():
    """Test des dépendances externes"""
    print("\n=== Test des dépendances ===\n")
    
    deps = {
        'numpy': None,
        'scipy': None,
        'numba': None,
        'pygmsh': None,
        'meshio': None
    }
    
    for dep in deps.keys():
        try:
            module = __import__(dep)
            version = getattr(module, '__version__', 'inconnue')
            deps[dep] = version
            print(f"✓ {dep:15s} : v{version}")
        except ImportError:
            deps[dep] = None
            print(f"✗ {dep:15s} : NON INSTALLÉ")
    
    all_installed = all(v is not None for v in deps.values())
    
    if all_installed:
        print("\n✓ Toutes les dépendances sont installées")
    else:
        print("\n✗ Certaines dépendances manquent")
        print("   Exécutez : pip install -r requirements.txt")
    
    return all_installed


def test_example_file():
    """Test avec le fichier exemple"""
    print("\n=== Test avec fichier exemple ===\n")
    
    example_path = os.path.join('exports', 'example_microstrip.json')
    
    if not os.path.exists(example_path):
        print(f"✗ Fichier exemple introuvable : {example_path}")
        return False
    
    print(f"Chargement : {example_path}")
    
    try:
        data = load_json(example_path)
        print(f"✓ Fichier chargé")
        print(f"  Version : {data.get('version')}")
        print(f"  Couches : {len(data['stackup']['layers'])}")
        print(f"  Objets  : {len(data['geometry']['objects'])}")
        print(f"  Ports   : {len(data['ports'])}")
        return True
    except Exception as e:
        print(f"✗ Erreur : {e}")
        return False


if __name__ == '__main__':
    print("=" * 60)
    print("  TESTS DU SOLVEUR MoM 2.5D")
    print("=" * 60)
    
    # Test des dépendances
    deps_ok = test_dependencies()
    
    if deps_ok:
        # Test du workflow
        try:
            test_basic_workflow()
        except Exception as e:
            print(f"\n✗ Erreur dans le workflow : {e}")
            import traceback
            traceback.print_exc()
        
        # Test avec exemple
        test_example_file()
    
    print("\n" + "=" * 60)
    print("  FIN DES TESTS")
    print("=" * 60)
