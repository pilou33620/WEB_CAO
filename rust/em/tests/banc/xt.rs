//! Ce que python/test/banc-crosstalk.py pose en tete : la carte d'essai et ses raccourcis.

use crate::*;
pub use em::crosstalk as ct;
pub use em::simulation_em::base::Complex64;

// ==========================================================================
// La carte d'essai : elle est ici, rien a telecharger
// ==========================================================================

pub fn STACK() -> Json {
    j(r#"{"layers": [
        {"type": "copper", "name": "Top", "thickness": 0.035, "role": "signal"},
        {"type": "dielectric", "name": "FR-4", "thickness": 0.2,
         "epsilon_r": 4.3, "tan_delta": 0.02},
        {"type": "copper", "name": "GND", "thickness": 0.035, "role": "plane",
         "net": "GND"},
        {"type": "dielectric", "name": "coeur", "thickness": 1.0,
         "epsilon_r": 4.3, "tan_delta": 0.02},
        {"type": "copper", "name": "Bottom", "thickness": 0.035, "role": "signal"}
    ]}"#)
}

/// Un troncon droit, au format « cao-crosstalk-1 ».
pub fn pis_o(x1: f64, y1: f64, x2: f64, y2: f64, net: &str, couche: i64, w: f64, couture: f64) -> Json {
    obj! {"type" => "track", "start" => vec![x1, y1], "end" => vec![x2, y2],
          "length" => round(py::hypot(x2 - x1, y2 - y1), 6), "width" => w,
          "layer" => couche, "net" => net, "copper_thickness" => 0.035,
          "gap_left" => 0.5, "gap_right" => 0.5,
          "couture_left" => couture, "couture_right" => couture}
}

/// `pis(x1, y1, x2, y2, net)` : couche 0, largeur 0,25, couture 0,4.
pub fn pis(x1: f64, y1: f64, x2: f64, y2: f64, net: &str) -> Json {
    pis_o(x1, y1, x2, y2, net, 0, 0.25, 0.4)
}

/// `pis(x1, y1, x2, y2, net, couche)`
pub fn pis_c(x1: f64, y1: f64, x2: f64, y2: f64, net: &str, couche: i64) -> Json {
    pis_o(x1, y1, x2, y2, net, couche, 0.25, 0.4)
}

/// Un agresseur droit de 40 mm, et ce qu'on veut autour.
pub fn doc_essai(voisinage: Vec<Json>, reglages: &[(&str, Json)]) -> Json {
    // LE FRONT DE L'ANALYSE : 100 ps, saisi. `t_r=0` le fait deduire de
    // la classe (`natures`), ou du front de reference de 1 ns.
    let mut r = obj! {"t_r" => 100e-12};
    for (k, v) in reglages {
        poser(&mut r, k, v);
    }
    obj! {
        "format" => "cao-crosstalk-1", "carte" => "banc", "agresseurs" => vec!["CLK"],
        "stackup" => STACK(),
        "geometry" => obj! {"objects" => vec![pis(0.0, 0.0, 40.0, 0.0, "CLK")]},
        "voisinage" => voisinage,
        "reference_nets" => vec!["GND"],
        "reglages" => r,
    }
}

pub fn ligne_de(res: &Json, net: &str, sens: &str) -> Option<Json> {
    els(&res["carte_chaleur"]["lignes"]).iter().find(|l| t(&l["victime"]) == net && t(&l["sens"]) == sens).cloned()
}

/// `ct.analyser(doc)` : le resultat, ou la panique que l'exception aurait ete.
pub fn an(doc: &Json) -> Json {
    ct::analyser(doc, None).unwrap_or_else(|e| panic!("ErreurCrosstalk : {}", e.message))
}

/// La fiche de l'etape 0a d'un net (la derniere du nom, comme le dict du Python).
pub fn candidat(res: &Json, net: &str) -> Option<Json> {
    els(&res["etape0"]["candidats"]).iter().rfind(|c| t(&c["net"]) == net).cloned()
}

/// Le couple d'une victime.
pub fn couple(res: &Json, net: &str) -> Option<Json> {
    els(&res["couples"]).iter().rfind(|c| t(&c["victime"]) == net).cloned()
}

/// Une liste de nombres du resultat.
pub fn nums(v: &Json) -> Vec<f64> {
    els(v).iter().map(n).collect()
}

/// `dict(d, cle=valeur)`
pub fn avec_cles(d: &Json, ajouts: &[(&str, Json)]) -> Json {
    avec(d, ajouts)
}

/// `np.linspace(a, b, n)`
pub fn linspace(a: f64, b: f64, n: usize) -> Vec<f64> {
    let pas = (b - a) / (n - 1) as f64;
    let mut v: Vec<f64> = (0..n).map(|i| a + i as f64 * pas).collect();
    v[n - 1] = b;
    v
}

/// `np.matmul(a, b)`
pub fn matmul(a: &ct::MatC, b: &ct::MatC) -> ct::MatC {
    let n = a.len();
    (0..n).map(|i| (0..n).map(|k| (0..n).map(|m| a[i][m] * b[m][k]).sum()).collect()).collect()
}

/// Les titres des defauts graves, mis bout a bout.
pub fn titres(res: &Json) -> String {
    els(&res["graves"]).iter().map(|g| t(&g["titre"])).collect::<Vec<_>>().join(" | ")
}

/// L'abscisse du maximum d'une ligne de la carte, en millimetres.
pub fn pic(res: &Json, net: &str, sens: &str) -> (f64, f64) {
    let l = ligne_de(res, net, sens).unwrap_or_else(|| panic!("pas de ligne {net} / {sens} dans la carte"));
    let (axe, vals) = (nums(&res["carte_chaleur"]["axe"]), nums(&l["valeurs"]));
    let mut i = 0;
    for k in 1..vals.len() {
        if vals[k] > vals[i] {
            i = k;
        }
    }
    (axe[i], vals[i])
}

/// Une fente telle que la page l'envoie depuis la 4.5.0 : avec ses
/// detours, sa largeur et les plans qui ferment encore le retour.
pub fn fente_mesuree(s: f64, longueur: f64, plans: &[&str], d1: f64, d2: f64, retour: &[&str], borne: bool) -> Json {
    obj! {"s" => s, "longueur" => longueur, "plans" => plans.to_vec(),
          "quoi" => "le plan n'a pas de cuivre de retour sous le parcours",
          "d1" => d1, "d2" => d2, "largeur" => longueur, "borne" => borne,
          "retour" => retour.to_vec()}
}

/// `np.arange(debut, fin, pas)`
pub fn arange(debut: f64, fin: f64, pas: f64) -> Vec<f64> {
    let n = ((fin - debut) / pas).ceil().max(0.0) as usize;
    let delta = (debut + pas) - debut;
    (0..n).map(|i| debut + i as f64 * delta).collect()
}

/// « Du cuivre ici ? » d'un plan du banc.
pub type Cuivre<'a> = &'a (dyn Fn(f64, f64) -> bool + Sync);

/// L'image que la page envoie depuis la 4.6.0 (`maillage`) : pour chaque
/// plan, des lignes a v constant portant les bords de leurs plages de cuivre
/// en u -- ici sondees a 10 um, la page les coupe aux aretes exactes.
pub fn image_plans(cx: f64, cy: f64, u_max: f64, v_max: f64, pas: f64, plans: &[(&str, Cuivre)], vias: &Json) -> Json {
    let us = arange(-u_max, u_max + 1e-9, 0.01);
    let vs = arange(-v_max + pas / 2.0, v_max, pas);
    let mut out = Vec::new();
    for (nom, cuivre) in plans {
        let mut lignes = Vec::new();
        for &v in &vs {
            let d: Vec<bool> = us.iter().map(|&u| cuivre(u, v)).collect();
            let mut bords = if d[0] { vec![round(us[0], 3)] } else { Vec::new() };
            for i in 0..d.len() - 1 {
                if d[i + 1] != d[i] {
                    bords.push(round(0.5 * (us[i] + us[i + 1]), 3));
                }
            }
            if d[d.len() - 1] {
                bords.push(round(us[us.len() - 1], 3));
            }
            lignes.push(bords);
        }
        out.push(obj! {"nom" => *nom, "lignes" => lignes});
    }
    obj! {"x" => cx, "y" => cy, "ux" => 1.0, "uy" => 0.0, "U" => u_max, "V" => v_max,
          "v0" => vs[0], "pas" => pas, "plans" => out, "vias" => if vias.vrai() { vias.clone() } else { Vec::<Json>::new().j() }}
}

/// Du cuivre partout, sauf la fente du cas 4 : 2 mm le long de la piste,
/// +-10 mm en travers.
pub fn fente_droite(u: f64, v: f64) -> bool {
    !(u.abs() < 2.0 / 2.0 && v.abs() < 10.0)
}

pub fn PLEIN(_u: f64, _v: f64) -> bool {
    true
}

pub fn DEUX_PLANS() -> Json {
    j(r#"{"layers": [
        {"type": "copper", "name": "Top", "thickness": 0.035, "role": "signal"},
        {"type": "dielectric", "name": "prepreg", "thickness": 0.2,
         "epsilon_r": 4.3, "tan_delta": 0.02},
        {"type": "copper", "name": "GND1", "thickness": 0.035,
         "role": "plane", "net": "GND"},
        {"type": "dielectric", "name": "coeur", "thickness": 1.0,
         "epsilon_r": 4.3, "tan_delta": 0.02},
        {"type": "copper", "name": "GND2", "thickness": 0.035,
         "role": "plane", "net": "GND"}
    ]}"#)
}

/// La fente du cas 4 sous l'agresseur a 20 mm, avec son image.
pub fn fente_imagee(plans: &[(&str, Cuivre)], retour: &[&str], vias: &Json, coupes: &[&str]) -> Json {
    let mut f = fente_mesuree(19.0, 2.0, coupes, 10.0, 10.0, retour, false);
    poser(&mut f, "maillage", image_plans(20.0, 0.0, 15.0, 15.0, 0.1, plans, vias));
    f
}

/// Le couple d'une victime et son premier terme de fente (Nul s'il n'y en a pas).
pub fn le_terme(res: &Json, net: &str) -> (Json, Json) {
    let c = els(&res["couples"]).iter().find(|x| t(&x["victime"]) == net).cloned().unwrap_or_else(|| panic!("pas de couple {net}"));
    let terme = c["fente"]["detail"][0].clone();
    (c, terme)
}

/// `d["stackup"] = ...`, `d["fentes"] = ...` : le document, une clef changee.
pub fn doc_avec(mut d: Json, cle: &str, valeur: impl EnJson) -> Json {
    poser(&mut d, cle, valeur);
    d
}

/// Les ecarts a la masse de chaque objet de la selection, mis a `ecart`.
pub fn ecarts_selection(d: &mut Json, ecart: f64) {
    if let Json::Liste(objets) = dans(dans(d, "geometry"), "objects") {
        for o in objets {
            poser(o, "gap_left", ecart);
            poser(o, "gap_right", ecart);
        }
    }
}
