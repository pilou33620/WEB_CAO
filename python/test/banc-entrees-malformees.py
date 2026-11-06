#!/usr/bin/python3
# -*- coding: utf-8 -*-
"""Les points d'entree des solveurs recoivent un document du navigateur : un champ d'un
autre type que prevu doit sortir par l'erreur du module (422 lisible), jamais par un
KeyError, ZeroDivisionError ou AttributeError (500 « Erreur interne »).

    python python/test/banc-entrees-malformees.py
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

CAS, ECHECS = [], []


def refus(module, fonction, erreur, docs, **kw):
    """Chaque document doit lever `erreur`, et rien d'autre."""
    m = __import__(module)
    for doc in docs:
        CAS.append((module, doc))
        try:
            getattr(m, fonction)(doc, **kw)
        except getattr(m, erreur) if isinstance(erreur, str) else erreur:
            continue
        except Exception as exc:                              # noqa: BLE001
            ECHECS.append("%s.%s(%r) : %s au lieu de %s" % (module, fonction, doc, type(exc).__name__, erreur))
        else:
            ECHECS.append("%s.%s(%r) : accepte" % (module, fonction, doc))


refus("oeil", "analyser", "ErreurOeil",
      [{"oeil": {"debit": 1e9, "ctle": c}} for c in ({"adc_db": 3}, {"fp1": 0, "fz": 0}, "pcie3",
                                                      {"fp1": "abc"}, {"forme": "pcie3", "fp1": 1e9})])
refus("dc_solver", "resoudre_document", "ErreurDC",
      [{"polygones": "x"}, {"polygones": [None]}, {"polygones": [{"vertices": [[0, 0], [1, 0], [1, 1]], "epaisseur": "x"}]},
       {"polygones": [{"vertices": [[0, 0], [1, 0], [1, 1]]}], "pas": "x"},
       {"polygones": [{"vertices": [[0, 0], [1, 0], [1, 1]]}], "pas": [1]},
       {"polygones": [{"vertices": [[0, 0], [1, 0], [1, 1]]}], "pas": 1e-310},
       {"polygones": [{"vertices": [[0, 0], [1, 0], [1, 1]]}], "sources": [{"x": "a"}]}])
refus("pcb_scoring", "evaluer_placement_pcb", ValueError, [{"footprints": "x"}, {"footprints": [None]}])
refus("pattern_recognition", "analyser_motifs_schema", ValueError,
      [{"components": "x"}, {"components": [None]}, {"nets": [None]}, {"nets": [{"name": 1}]},
       {"components": {"U1": "x"}}])
for module, fonction, erreur in (("simulation_em", "simuler", "ErreurSimulation"),
                                 ("crosstalk", "analyser", "ErreurCrosstalk"),
                                 ("rf_reseau", "analyser", "ErreurRF"),
                                 ("analyse_carte", "analyser_document", "ErreurAnalyse")):
    refus(module, fonction, erreur, ["x", [], {"format": 1}, {"pistes": "x"}, {"empilage": "x"}])

if ECHECS:
    print("%d cas, %d ECHEC(S)" % (len(CAS), len(ECHECS)))
    for e in ECHECS:
        print("  - " + e)
    sys.exit(1)
print("OK : %d documents malformes refuses proprement" % len(CAS))
