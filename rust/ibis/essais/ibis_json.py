# Jumeau Python de src/bin/ibis_json.rs (memes lignes, depuis python/ibis.py) : il a ecrit ibis_json.txt,
#     python3 rust/ibis/essais/ibis_json.py $(ls rust/ibis/essais/*.ibs rust/ibis/essais/*.ami | LC_ALL=C sort) > rust/ibis/essais/ibis_json.txt
# et sert a la comparaison a l'octet sur d'autres fichiers.
import json, os, sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "..", "python"))
import ibis

def refus(e):
    if isinstance(e, ibis.ErreurIbis):
        return {"erreur": e.message, "conseil": e.conseil}
    return {"plantage": type(e).__name__.replace("_ArrayMemoryError", "MemoryError")}

def ou(f, g=lambda x: x):
    try:
        return g(f())
    except Exception as e:
        return refus(e)

def mut(d):
    return {k: [[a, b, v] for (a, b), v in m.items()] for k, m in d.items()}

def j_lu(lu):
    lu = dict(lu)
    if "modeles_boitier" in lu:
        lu["modeles_boitier"] = {k: dict(m, mutuelles=mut(m["mutuelles"])) for k, m in lu["modeles_boitier"].items()}
    return lu

def ibs(texte, nom):
    o = {"simple": ou(lambda: ibis.lire(texte, nom), j_lu)}
    try:
        lu = ibis.lire(texte, nom, complet=True)
    except Exception as e:
        o["complet"] = refus(e)
        return o
    o["complet"] = j_lu(lu)
    o["resume"] = ibis.resume(lu)
    o["moyen"] = ibis.boitier_broche(lu, "", "typ")
    br = {}
    for b in lu["ordre_broches"]:
        x = {"modele": ou(lambda: ibis.modele_broche(lu, b), list)}
        p = ibis.paire_diff(lu, b)
        inv = p["inverse"] if p else None
        x["paire"] = p
        for coin in ("typ", "min", "max"):
            x[coin] = ibis.boitier_broche(lu, b, coin, inv)
        vic = [b]
        if inv is not None:
            x["mutuelle"] = ibis.mutuelle_paire(lu, b, inv)
            vic.append(inv)
        c = ibis.voisins_boitier(lu, vic)
        x["voisins"] = None if c is None else dict(c, mutuelles=mut(c["mutuelles"]))
        br[b] = x
    o["broches"] = br
    tp = {}
    for n, m in lu["modeles"].items():
        x = {"emetteur": ibis.est_emetteur(m)}
        for coin in ("typ", "min", "max"):
            def f():
                t = ibis.Tampon(m, coin)
                return {"v": [t.v_pu, t.v_pd, t.v_pc, t.v_gc], "c_comp": t.c_comp, "g": [t.g_gnd, t.g_pow],
                        "vin": [t.vinl, t.vinh], "diodes": t.a_des_diodes(), "haut": t.niveau(1.0, 0.0),
                        "bas": t.niveau(0.0, 1.0, 50.0, 0.5),
                        "i": [list(t.i_total(v, 0.7, 0.2)) for v in (-1.0, 0.3, 1.7, 4.0)]}
            x[coin] = ou(f)
        tp[n] = x
    o["tampons"] = tp
    return o

def ami(texte, nom):
    o = {"out": ibis.lire_parametres_ami(texte)}
    try:
        a = ibis.lire_ami(texte, nom)
    except Exception as e:
        o["ami"] = refus(e)
        return o
    o["ami"] = a
    o["prop_tx"] = ou(lambda: ibis.proposer_egaliseur(a, None, 10e9))
    o["prop_rx"] = ou(lambda: ibis.proposer_egaliseur(None, a, 10e9))
    o["prop"] = ou(lambda: ibis.proposer_egaliseur(a, a, 1e9))
    o["in"] = ou(lambda: ibis.parametres_ami_in(a), list)
    sur = {}
    if a["parametres"]:
        sur[a["parametres"][-1]["nom"]] = -0.2
        sur["/%s/" % a["parametres"][0]["chemin"]] = 3
    sur["zz"] = 1
    sur["c0"] = True
    sur["c1"] = 'a "b"'
    o["in2"] = ou(lambda: ibis.parametres_ami_in(a, sur, "racine"), list)
    o["reserves"] = {k: ibis.reserve_ami(a, k) for k in a["reserves"]}
    return o

out = open(sys.stdout.fileno(), "w", encoding="utf-8", newline="\n")
for chemin in sys.argv[1:]:
    texte = open(chemin, "rb").read().decode("utf-8", "replace")
    nom = os.path.basename(chemin)
    j = ami(texte, nom) if nom.lower().endswith(".ami") else ibs(texte, nom)
    out.write("%s\t%s\n" % (nom, json.dumps(j, ensure_ascii=False)))
