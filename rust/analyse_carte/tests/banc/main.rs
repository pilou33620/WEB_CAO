//! Banc d'essai d'analyse_carte : les angles des pistes, puis les règles électriques sur des
//! cartes de laboratoire.
//!
//!     cargo test -p analyse_carte
//!
//! Le portage de python/test/banc-analyse-carte.py en entier : mêmes cas, mêmes étalons,
//! mêmes tolérances (`angles`, `retours`, `diaphonie`, `regles`). Style des autres bancs du
//! dépôt : pas de harnais, un décompte, un code de retour.
//!
//! S'y ajoutent (`restes`) ce que les autres bancs attendaient d'analyse_carte : la
//! comparaison au fil fin du cas « deux niveaux » de banc-crosstalk (`_kb_larges_faces`), et
//! la part analyse_carte de banc-entrees-malformees.py.

#![allow(non_snake_case)]

mod angles;
mod diaphonie;
mod regles;
mod restes;
pub mod retours;

pub use analyse_carte::base::*;
pub use analyse_carte::{analyser_document, ErreurAnalyse};
use std::sync::atomic::{AtomicUsize, Ordering};

static OK: AtomicUsize = AtomicUsize::new(0);
static KO: AtomicUsize = AtomicUsize::new(0);

/// Un cas : `fonction` passe, ou panique avec ce qui cloche (l'`assert` du Python).
pub fn T(titre: &str, fonction: impl FnOnce()) {
    match std::panic::catch_unwind(std::panic::AssertUnwindSafe(fonction)) {
        Ok(()) => {
            OK.fetch_add(1, Ordering::Relaxed);
            println!("  ok  {titre}");
        }
        Err(e) => {
            let message = e.downcast_ref::<String>().cloned().or_else(|| e.downcast_ref::<&str>().map(|s| s.to_string())).unwrap_or_default();
            KO.fetch_add(1, Ordering::Relaxed);
            println!("  KO  {titre}\n        {message}");
        }
    }
}

/// Un document ou un morceau de document, écrit en JSON.
pub fn j(texte: &str) -> Json {
    loads(texte).unwrap_or_else(|e| panic!("JSON du banc : {e} dans {texte}"))
}

/// La valeur d'un nombre du résultat (panique si ce n'en est pas un).
pub fn n(v: &Json) -> f64 {
    v.as_f64().unwrap_or_else(|| panic!("un nombre était attendu, pas {}", dumps(v)))
}

/// Un nombre comme Python l'écrivait dans le banc : 10 est un entier, 0.5 un flottant.
fn nbj(x: f64) -> Json {
    if x.fract() == 0.0 { Json::Entier(x as i64) } else { Json::Flottant(x) }
}

/// `dict(d, cle=valeur, ...)`
pub fn avec(d: &Json, ajouts: Json) -> Json {
    let mut d = d.clone();
    maj(&mut d, ajouts);
    d
}

/// piste(*pts, n="S", c=0, w=0.2)
pub fn piste(pts: &[(f64, f64)]) -> Json {
    piste_(pts, "S", 0, 0.2)
}

pub fn piste_(pts: &[(f64, f64)], net: &str, c: i64, w: f64) -> Json {
    obj! {"c" => c, "n" => net, "w" => w, "p" => pts.iter().flat_map(|p| [nbj(p.0), nbj(p.1)]).collect::<Vec<Json>>()}
}

/// Les règles des constats, triées.
pub fn regles_de(res: &[Json]) -> Vec<String> {
    let mut r: Vec<String> = res.iter().map(|k| txt(k, "regle").to_string()).collect();
    r.sort();
    r
}

/// `angles(pistes, arcs, pastilles, unite_mm)`
pub fn ang(pistes: Vec<Json>, arcs: Vec<Json>, pastilles: Vec<Json>, unite: f64) -> Vec<Json> {
    analyse_carte::angles(&pistes, &arcs, &pastilles, unite, analyse_carte::TOL_DEG).unwrap_or_else(|e| panic!("{e:?}"))
}

pub fn ang1(pistes: Vec<Json>) -> Vec<Json> {
    ang(pistes, vec![], vec![], 1.0)
}

// ==========================================================================
// Les règles électriques, sur un empilage quatre couches de laboratoire :
// Top / L2 (plan GND) / L3 (plan GND ou 3V3) / Bot. Rangs 0, 2, 4, 6.
// ==========================================================================
pub fn cuivre(nom: &str, role: &str, net: Option<&str>) -> Json {
    let mut c = obj! {"type" => "copper", "name" => nom, "thickness" => 0.035, "role" => role};
    if let Some(net) = net {
        poser(&mut c, "net", net);
    }
    c
}

pub fn empilage(net_l3: &str) -> Json {
    let di = |nom: &str, ep: f64| obj! {"type" => "dielectric", "name" => nom, "thickness" => ep, "epsilon_r" => 4.3, "tan_delta" => 0.02};
    obj! {"layers" => vec![cuivre("Top", "signal", None), di("d1", 0.2), cuivre("L2", "plane", Some("GND")), di("d2", 1.0),
                           cuivre("L3", "plane", Some(net_l3)), di("d3", 0.2), cuivre("Bot", "signal", None)]}
}

/// Un empilage de laboratoire : ("Top", "signal", None), ("L2", "plane", Some("GND"))…
pub fn empilage_de(roles: &[(&str, &str, Option<&str>)], di: &[f64]) -> Json {
    let mut out = Vec::new();
    for (k, r) in roles.iter().enumerate() {
        if k > 0 {
            out.push(obj! {"type" => "dielectric", "name" => format!("d{k}"), "epsilon_r" => 4.3, "tan_delta" => 0.02,
                           "thickness" => if di.len() > 1 { di[k - 1] } else { di[0] }});
        }
        out.push(cuivre(r.0, r.1, r.2));
    }
    obj! {"layers" => out}
}

/// Le document de `analyser(**k)` : l'empilage de laboratoire, et les champs donnés
/// (`net_l3` : le net du plan L3).
pub fn document(mut champs: Json) -> Json {
    let l3 = oter(&mut champs, "net_l3");
    let mut doc = obj! {"format" => "cao-analyse-carte-1", "unite_mm" => 1i64, "pistes" => Vec::<Json>::new(),
                        "stackup" => empilage(l3.as_str().unwrap_or("GND"))};
    maj(&mut doc, champs);
    doc
}

pub fn analyser_r(champs: Json) -> Result<Json, ErreurAnalyse> {
    analyser_document(&document(champs))
}

pub fn analyser(champs: Json) -> Json {
    analyser_r(champs).unwrap_or_else(|e| panic!("{e:?}"))
}

/// `analyser_document(doc)`, sans refus attendu.
pub fn doc_ok(doc: &Json) -> Json {
    analyser_document(doc).unwrap_or_else(|e| panic!("{e:?}"))
}

pub fn via(net: &str, extra: Json) -> Json {
    let mut v = obj! {"x" => 10.0, "y" => 10.0, "layer_from" => 0i64, "layer_to" => 6i64, "net" => net, "drill_diameter" => 0.3,
                      "retours" => Vec::<Json>::new(), "retours_rayon_mm" => 5.0};
    maj(&mut v, extra);
    v
}

pub fn masse(x: f64) -> Json {
    obj! {"x" => x, "y" => 10.0, "layer_from" => 0i64, "layer_to" => 6i64, "net" => "GND", "drill_diameter" => 0.3}
}

/// Les constats d'une règle.
pub fn de(res: &Json, regle: &str) -> Vec<Json> {
    els(&res["constats"]).iter().filter(|k| txt(k, "regle") == regle).cloned().collect()
}

/// droite(n, y, x1=0.0, x2=100.0, c="Top", w=0.2)
pub fn droite(net: &str, y: f64) -> Json {
    droite_(net, y, 0.0, 100.0, "Top", 0.2)
}

pub fn droite_(net: &str, y: f64, x1: f64, x2: f64, c: &str, w: f64) -> Json {
    obj! {"c" => c, "n" => net, "w" => w, "p" => vec![x1, y, x2, y]}
}

pub fn carre(x1: f64, y1: f64, x2: f64, y2: f64) -> Json {
    vec![x1, y1, x2, y1, x2, y2, x1, y2].j()
}

pub fn rond(x: f64, y: f64, r: f64) -> Json {
    (0..16).flat_map(|k| [x + r * (2.0 * PI * k as f64 / 16.0).cos(), y + r * (2.0 * PI * k as f64 / 16.0).sin()]).collect::<Vec<f64>>().j()
}

pub fn verdicts(k: &Json) -> Vec<String> {
    els(&k["frequences"]).iter().map(|f| txt(f, "verdict").to_string()).collect()
}

/// max(f["valeur"] for f in k["frequences"])
pub fn valeur_max(k: &Json) -> f64 {
    maxf(&els(&k["frequences"]).iter().map(|f| n(&f["valeur"])).collect::<Vec<_>>())
}

pub fn msg(k: &Json) -> &str {
    txt(k, "msg")
}

/// Le nombre qui suit `avant` dans un message, jusqu'à `apres`.
pub fn nombre_apres(m: &str, avant: &str, apres: &str) -> f64 {
    let reste = m.split(avant).nth(1).unwrap_or_else(|| panic!("« {avant} » absent de : {m}"));
    reste.split(apres).next().unwrap().parse().unwrap_or_else(|_| panic!("pas un nombre après « {avant} » : {m}"))
}

pub fn notes(res: &Json) -> Vec<&str> {
    els(&res["notes"]).iter().filter_map(Json::as_str).collect()
}

fn main() {
    // un cas en échec panique : son message est dans le décompte, pas besoin de la trace
    std::panic::set_hook(Box::new(|_| {}));
    angles::banc();
    retours::banc();
    diaphonie::banc();
    regles::banc();
    restes::banc();
    let (ok, ko) = (OK.load(Ordering::Relaxed), KO.load(Ordering::Relaxed));
    println!("\n{}", "-".repeat(62));
    println!("  {} cas, {}", ok + ko, if ko == 0 { "tous passés".to_string() } else { format!("{ko} en échec") });
    std::process::exit(if ko == 0 { 0 } else { 1 });
}
