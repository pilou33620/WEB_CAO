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
