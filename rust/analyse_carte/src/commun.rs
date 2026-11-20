//! LES RÈGLES ÉLECTRIQUES : une cadence et un front par classe, et ce que les règles
//! partagent (la classe d'un net, les rangs des couches, les tronçons).
//!
//! Un net n'a pas le front qu'on veut : il a celui de la techno qui le pilote (sa CLASSE : un
//! GPIO de microcontrôleur monte en quelques ns même à 100 kHz), borné par la période de sa
//! CADENCE MAXIMALE (à 100 MHz, pas plus de 10 % de 10 ns). Le front effectif est donc
//! min(t_r, 0,1 / cadence), et ce qu'il excite va jusqu'au genou 0,35 / t_r. C'est à ce genou
//! que les règles jugent : une colonne par constat.

use crate::base::*;
use regex::Regex;
use std::sync::LazyLock;

// La cadence maximale de chaque classe, en Hz : une horloge à 50 MHz, un bus rapide à
// 100 MHz, un I2C ou un SPI sous 10 MHz, un hacheur à 2 MHz. Toutes restent sous 0,1 / t_r
// du front par défaut : à défauts égaux, c'est le front de la classe qui juge.
pub const CADENCES: [(&str, f64); 6] =
    [("Horloge", 5e7), ("Rapide", 1e8), ("RF", 1e9), ("Analogique", 1e6), ("Lent", 1e7), ("Découpage", 2e6)];
pub const Z0: f64 = 50.0; // impédance de ligne supposée pour juger une réflexion
// LA DIAPHONIE, NIVEAU 2 : un front GLOBAL pour toute la carte (1 ns) et les seuils DRC,
// les mêmes que l'analyse d'une piste sélectionnée.
pub const XT_TR: f64 = 1e-9;
pub const XT_ORANGE: f64 = xt::SEUIL_ORANGE;
pub const XT_ROUGE: f64 = xt::SEUIL_ROUGE;
pub const PAIRES_MAX: usize = 3000; // paires rendues au tableau « toute la carte »
// Réflexion d'un via : |Γ| au-delà duquel on alerte, puis on condamne.
pub const GAMMA_VIGILANCE: f64 = 0.05;
pub const GAMMA_CRITIQUE: f64 = 0.10;
pub const C0: f64 = 299792458.0;
pub const ZDIFF: f64 = 100.0;
pub const CLASSES_Z: [&str; 3] = ["Horloge", "Rapide", "RF"];
pub const RAPIDES: [&str; 4] = ["Horloge", "Rapide", "RF", "Découpage"];
// UNE ANTENNE EST FAITE POUR RAYONNER : sur une réserve de plan, près du bord, ouverte au
// bout. Seules les règles de fabrication la jugent ; les règles électriques la laissent.
pub const ANTENNE: &str = "Antenne";
pub const CASE_MM: f64 = 2.0; // maille de la grille de voisinage
pub const EPS_MM: f64 = 1e-3; // deux bouts à moins d'un micron sont le même point

// `$` de Python accepte un saut de ligne final
static SANS_NET: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"^(?i)(|non[-_ ]?net|no[-_ ]?net|\(sans net\))\n?$").unwrap());

/// `_SANS_NET.match(n)`
pub fn sans_net(n: &str) -> bool {
    SANS_NET.is_match(n)
}

/// Le document, et ce que `_classe` y relisait à chaque appel.
pub struct Doc<'a> {
    pub d: &'a Json,
    bruyants: HashSet<String>,
    refs: HashSet<String>,
}

impl<'a> Doc<'a> {
    pub fn new(d: &'a Json) -> R<Self> {
        let noms = |v: &Json| -> R<HashSet<String>> {
            if !v.vrai() {
                return Ok(HashSet::new());
            }
            Ok(dc_solver::pyth::elements(v)?.iter().filter_map(|x| x.as_str().map(str::to_string)).collect())
        };
        let natures = &d["natures"];
        if natures.vrai() {
            dict(natures)?;
        }
        Ok(Doc { d, bruyants: noms(&d["bruyants"])?, refs: noms(&d["reference_nets"])? })
    }

    /// La classe d'un net : un nœud de découpage d'abord, une masse de référence ensuite,
    /// sinon ce que la page a classé, Lent à défaut.
    pub fn classe(&self, net: &str) -> String {
        if self.bruyants.contains(net) {
            return "Découpage".into();
        }
        if self.refs.contains(net) {
            return "Masse".into();
        }
        let v = &self.d["natures"][net];
        if v.vrai() { str_py(v) } else { "Lent".into() }
    }

    /// Un net qui porte un signal : ni masse, ni alimentation, ni nœud de découpage (qui
    /// agresse, mais ne se juge pas comme une ligne).
    pub fn signal(&self, n: &str) -> bool {
        !n.is_empty() && !sans_net(n) && !["Masse", "Alimentation", "Découpage", ANTENNE].contains(&self.classe(n).as_str())
    }

    /// `doc.get(cle) or ()`, en liste.
    pub fn liste(&self, cle: &str) -> &'a [Json] {
        els(&self.d[cle])
    }
}

/// Le front d'un net : celui de sa techno, borné par 10 % de la période de sa cadence.
pub fn tr_effectif(tr_classe: f64, cadence: f64) -> f64 {
    dc_solver::pyth::min_py(tr_classe, 0.1 / cadence)
}

pub fn _pire<'b>(verdicts: impl IntoIterator<Item = &'b str>) -> &'static str {
    let v: Vec<&str> = verdicts.into_iter().collect();
    if v.contains(&"critique") {
        "critique"
    } else if v.contains(&"vigilance") {
        "vigilance"
    } else {
        "ok"
    }
}

/// Les verdicts des colonnes d'un constat.
pub fn verdicts(freqs: &[Json]) -> Vec<&str> {
    freqs.iter().map(|f| txt(f, "verdict")).collect()
}

/// Un réglage {classe ou net: valeur}. Une autre forme vient d'un client forgé : refusée
/// par un message, pas par une erreur 500.
fn _table<'b>(r: &'b Json, cle: &str) -> R<Vec<(&'b String, &'b Json)>> {
    let d = &r[cle];
    if !d.vrai() {
        return Ok(Vec::new());
    }
    match d.as_objet() {
        Some(o) => Ok(o.iter().collect()),
        None => Err(Exc::Analyse(format!("Réglage « {cle} » mal formé : un objet {{nom: valeur}} est attendu."))),
    }
}

/// Une valeur saisie utilisable : > 0 et FINIE (« inf » jugerait en NaN).
fn _positif(v: &Json) -> R<bool> {
    if !v.vrai() {
        return Ok(false);
    }
    let x = fl(v)?;
    Ok(0.0 < x && x < f64::INFINITY)
}

pub fn _reglages(doc: &Doc) -> R<Json> {
    let vide = obj! {};
    let r = if doc.d["reglages"].vrai() { dict(&doc.d["reglages"])? } else { &vide };
    // UNE INTERFACE N'ENTRE DANS LES RÉGLAGES QUE SI UN NET LA PORTE : le rapport les
    // recopie, et une carte sans interface doit rendre celui d'avant à l'identique, quoi
    // que la page envoie.
    // (Python parcourait un `set`, dans un ordre qui changeait d'un lancement à l'autre :
    // ici, celui de la table des interfaces.)
    let classes: HashSet<String> = doc.d["natures"].as_objet().map(|o| o.keys().map(|n| doc.classe(n)).collect()).unwrap_or_default();
    let utilisees: Vec<&xt::Interface> = xt::INTERFACES.iter().filter(|i| classes.contains(i.classe)).collect();
    let garde = |k: &str| xt::interface_de(k).is_none() || utilisees.iter().any(|i| i.classe == k);
    let mut tr = Objet::new();
    for (k, v) in xt::TR_CLASSES {
        tr.insert(k.to_string(), v.j());
    }
    for i in &utilisees {
        tr.insert(i.classe.to_string(), i.tr.j());
    }
    for (k, v) in _table(r, "tr")? {
        if _positif(v)? && garde(k) {
            tr.insert(k.clone(), fl(v)?.j());
        }
    }
    let mut cadences = Objet::new();
    for (k, v) in CADENCES {
        cadences.insert(k.to_string(), v.j());
    }
    for i in &utilisees {
        cadences.insert(i.classe.to_string(), i.cadence.j());
    }
    for (k, v) in _table(r, "cadences")? {
        // 0 ou vide : le défaut
        if _positif(v)? && garde(k) {
            cadences.insert(k.clone(), fl(v)?.j());
        }
    }
    // UNE PORTEUSE RF : les nets RF se jugent à leur porteuse, pas au genou d'un front.
    // Elle devient le front RF (0,35 / f), sans borne de période.
    let porteuse = fl_ou(&r["porteuse_rf"], 0.0)?;
    if porteuse > 0.0 {
        tr.insert("RF".into(), (0.35 / porteuse).j());
    }
    let mut out = obj! {
        "tr" => Json::Objet(tr), "cadences" => Json::Objet(cadences),
        "porteuse_rf" => if porteuse > 0.0 { Some(porteuse) } else { None },
        "z0" => fl_ou(&r["z0"], Z0)?,
        "xt_tr" => fl_ou(&r["xt_tr"], XT_TR)?,
        "xt_orange" => fl_ou(&r["xt_orange"], XT_ORANGE)?,
        "xt_rouge" => fl_ou(&r["xt_rouge"], XT_ROUGE)?,
        // PERTES R et G au genou du front (crosstalk.alpha_genou), et la façon de sommer
        // les agresseurs d'une victime : « pire » (arithmétique, en phase) ou « rss »
        // (quadratique).
        "xt_pertes" => r["xt_pertes"].vrai(),
        "xt_somme" => (if r["xt_somme"].vrai() { str_py(&r["xt_somme"]) } else { "pire".into() }).to_lowercase(),
        "zdiff" => fl_ou(&r["zdiff"], ZDIFF)?};
    if !(num(&out, "xt_tr") > 0.0) {
        return Err(Exc::Analyse("Le front global de la diaphonie doit être positif.".into()));
    }
    if !["pire", "rss"].contains(&txt(&out, "xt_somme")) {
        return Err(Exc::Analyse("Somme des agresseurs inconnue : « pire » ou « rss ».".into()));
    }
    let (o, ro) = (num(&out, "xt_orange"), num(&out, "xt_rouge"));
    if !(0.0 < o && o <= ro && ro < 1.0) {
        return Err(Exc::Analyse("Seuils de diaphonie incohérents : il faut 0 < orange ≤ rouge < 100 %.".into()));
    }
    // PAR CLASSE ET PAR NET, ce qui passe devant les réglages de carte. Une carte LoRa + NFC
    // porte deux radios : 868 MHz sur l'une, 13,56 MHz sur l'autre, et juger le NFC à
    // 868 MHz le condamne à tort. De même une vidéo à 75 Ω et une RF à 50 Ω sur la même
    // carte. Clés absentes du rapport quand rien n'est donné.
    for cle in ["z0_classes", "porteuses"] {
        let mut d = Objet::new();
        for (k, v) in _table(r, cle)? {
            // porteuses : par NET
            if _positif(v)? && (cle == "porteuses" || garde(k)) {
                d.insert(k.clone(), fl(v)?.j());
            }
        }
        if !d.is_empty() {
            poser(&mut out, cle, Json::Objet(d));
        }
    }
    // LA Z_DIFF D'UNE INTERFACE, celle de sa norme : USB à 90 Ω et Ethernet à 100 Ω sur la
    // même carte. Le panneau passe devant, comme z0_classes.
    let mut zd = Objet::new();
    for i in &utilisees {
        zd.insert(i.classe.to_string(), i.zdiff.j());
    }
    for (k, v) in _table(r, "zdiff_classes")? {
        if _positif(v)? && garde(k) {
            zd.insert(k.clone(), fl(v)?.j());
        }
    }
    if !zd.is_empty() {
        poser(&mut out, "zdiff_classes", Json::Objet(zd));
    }
    Ok(out)
}

/// L'impédance visée pour un net de cette classe : la sienne si le panneau la donne, Z₀ de
/// la carte sinon.
pub fn _z0(reg: &Json, classe: &str) -> f64 {
    reg["z0_classes"].get(classe).and_then(Json::as_f64).unwrap_or_else(|| num(reg, "z0"))
}

/// La classe tient-elle une impédance ? Horloge, Rapide, RF d'office, et toute classe à
/// laquelle le panneau donne une cible. Une interface n'en tient que si on lui en donne une :
/// sa norme ne fixe que la Z_diff.
pub fn _tient_z(reg: &Json, classe: &str) -> bool {
    contient(&reg["z0_classes"], classe) || CLASSES_Z.contains(&classe)
}

/// La porteuse d'un net : la sienne (`porteuses`), celle des nets RF sinon, aucune pour les
/// autres classes.
pub fn _porteuse(reg: &Json, classe: &str, net: Option<&str>) -> Option<f64> {
    let p = net.and_then(|n| reg["porteuses"].get(n)).and_then(Json::as_f64).filter(|p| *p != 0.0);
    p.or_else(|| if classe == "RF" { reg["porteuse_rf"].as_f64().filter(|p| *p != 0.0) } else { None })
}

/// Ce que `juge(f_eval, tr)` rend : la valeur, le verdict, et des champs de plus (un objet,
/// ou Nul).
pub type Jugement = (f64, &'static str, Json);

/// [{f, tr, f_eval, valeur, verdict, ...}] pour un net de `classe` (une classe sans front,
/// masse ou alimentation, se juge comme Lent). `net` : sa porteuse propre, s'il en a une,
/// passe devant celle de sa classe. UNE SEULE COLONNE, à la cadence de la classe (ou à la
/// porteuse) ; la liste reste une liste, que chaque règle et le rapport parcourent déjà.
pub fn _par_frequence(reg: &Json, classe: &str, net: Option<&str>, juge: impl FnOnce(f64, f64) -> R<Jugement>) -> R<Vec<Json>> {
    let c = if contient(&reg["tr"], classe) { classe } else { "Lent" };
    let porteuse = _porteuse(reg, c, net);
    let cad = |k: &str| reg["cadences"].get(k).and_then(Json::as_f64).filter(|x| *x != 0.0);
    let f = porteuse.or_else(|| cad(c)).unwrap_or_else(|| num(&reg["cadences"], "Lent"));
    let tr = match porteuse {
        Some(p) => 0.35 / p,
        None => tr_effectif(num(&reg["tr"], c), f),
    };
    let (valeur, verdict, extra) = juge(0.35 / tr, tr)?;
    let mut col = obj! {"f" => f, "tr" => tr, "f_eval" => 0.35 / tr, "valeur" => round(valeur, 5), "verdict" => verdict};
    if let Some(p) = porteuse {
        poser(&mut col, "porteuse", p);
    }
    maj(&mut col, extra);
    Ok(vec![col])
}

/// (net, classe) au front le plus raide -- sa porteuse s'il en a une ; (None, "Lent") sans net.
pub fn _plus_vite(reg: &Json, doc: &Doc, nets: &[String]) -> (Option<String>, String) {
    let tr = |n: &String| {
        let c = doc.classe(n);
        match _porteuse(reg, &c, Some(n)) {
            Some(p) => 0.35 / p,
            None => reg["tr"].get(&c).and_then(Json::as_f64).unwrap_or_else(|| num(&reg["tr"], "Lent")),
        }
    };
    match premier_min(nets, tr) {
        Some(n) => (Some(n.clone()), doc.classe(n)),
        None => (None, "Lent".into()),
    }
}

/// La permittivité moyenne des diélectriques entre deux couches, 4,3 à défaut.
pub fn _er_entre(couches: &[Json], a: usize, b: usize) -> R<f64> {
    let (lo, hi) = tri2(a, b);
    let mut ers = Vec::new();
    for c in couches.iter().take(hi + 1).skip(lo) {
        if c["type"].as_str() == Some("dielectric") {
            let e = fl_ou(&c["epsilon_r"], 0.0)?;
            if e > 0.0 {
                ers.push(e);
            }
        }
    }
    Ok(if ers.is_empty() { 4.3 } else { py::sum(ers.iter().copied()) / ers.len() as f64 })
}

pub fn _gamma(g: f64) -> &'static str {
    if g > GAMMA_CRITIQUE {
        "critique"
    } else if g > GAMMA_VIGILANCE {
        "vigilance"
    } else {
        "ok"
    }
}

/// Une longueur rapportée à sa limite : au-delà, vigilance ; au-delà du double, critique
/// (λ/20 puis λ/10, λ/40 puis λ/20).
pub fn _ratio(r: f64) -> &'static str {
    if r > 2.0 {
        "critique"
    } else if r > 1.0 {
        "vigilance"
    } else {
        "ok"
    }
}

/// 2 T_d / t_r face au front : 10 % vigilance, 20 % critique.
pub fn _dixieme(r: f64) -> &'static str {
    if r > 0.2 {
        "critique"
    } else if r > 0.1 {
        "vigilance"
    } else {
        "ok"
    }
}

/// {nom de couche de cuivre: rang}
pub fn _rangs(couches: &[Json]) -> HashMap<String, usize> {
    couches.iter().enumerate().filter(|(_, c)| c["type"].as_str() == Some("copper")).map(|(i, c)| (cle(&c["name"]), i)).collect()
}

/// Ce qui sépare deux couches (diélectrique et cuivre traversé), en mm.
pub fn _ep(couches: &[Json], a: usize, b: usize) -> R<f64> {
    let (lo, hi) = tri2(a, b);
    let mut v = Vec::new();
    for c in couches.iter().take(hi).skip(lo + 1) {
        v.push(fl_ou(&c["thickness"], 0.0)?);
    }
    Ok(py::sum(v))
}

/// float(couches[i].get("thickness") or 0.035)
pub fn ep_cuivre(couches: &[Json], i: usize) -> R<f64> {
    fl_ou(&couches[i]["thickness"], 0.035)
}

/// Les plans de référence d'une couche : le plus proche au-dessus, le plus proche
/// au-dessous -- même lecture que `section_de_couche`.
pub fn _plans_voisins(couches: &[Json], i: usize) -> Vec<usize> {
    let plan = |j: &usize| couches[*j]["type"].as_str() == Some("copper") && couches[*j]["role"].as_str() == Some("plane");
    let haut = (0..i).rev().find(plan);
    let bas = (i + 1..couches.len()).find(plan);
    haut.into_iter().chain(bas).collect()
}

/// Un tronçon de piste, en mm : (net, couche, x1, y1, x2, y2, w). La couche reste la clé
/// opaque du document.
#[derive(Debug, Clone)]
pub struct Troncon {
    pub n: String,
    pub c: Json,
    pub x1: f64,
    pub y1: f64,
    pub x2: f64,
    pub y2: f64,
    pub w: f64,
}

impl Troncon {
    pub fn longueur(&self) -> f64 {
        hyp(self.x2 - self.x1, self.y2 - self.y1)
    }
}

/// Un tronçon sur sa couche : (net, x1, y1, x2, y2, w).
pub type Seg = (String, f64, f64, f64, f64, f64);

pub fn seg(t: &Troncon) -> Seg {
    (t.n.clone(), t.x1, t.y1, t.x2, t.y2, t.w)
}

pub fn long_seg(s: &Seg) -> f64 {
    hyp(s.3 - s.1, s.4 - s.2)
}

/// Pistes et arcs en segments droits, en mm. Un arc part en cordes de 5° au plus.
pub fn _troncons(doc: &Doc, unite: f64) -> R<Vec<Troncon>> {
    let mut out = Vec::new();
    for p in doc.liste("pistes") {
        let p = dict(p)?;
        hachable(&p["c"])?;
        let mut pts = Vec::new();
        for v in els(&p["p"]) {
            pts.push(fl(v)? * unite);
        }
        let (w, n) = (fl_ou(&p["w"], 0.0)? * unite, str_ou_vide(&p["n"]));
        let mut k = 0;
        while k + 3 < pts.len() {
            if hyp(pts[k + 2] - pts[k], pts[k + 3] - pts[k + 1]) > 1e-6 {
                out.push(Troncon { n: n.clone(), c: p["c"].clone(), x1: pts[k], y1: pts[k + 1], x2: pts[k + 2], y2: pts[k + 3], w });
            }
            k += 2;
        }
    }
    for a in doc.liste("arcs") {
        let a = dict(a)?;
        hachable(&a["c"])?;
        let (s, e, m) = (point(req(a, "s")?, unite)?, point(req(a, "e")?, unite)?, point(req(a, "m")?, unite)?);
        let ((sx, sy), (ex, ey), (mx, my)) = (s, e, m);
        let r = hyp(sx - mx, sy - my);
        if r <= 1e-6 {
            continue;
        }
        let d0 = (sy - my).atan2(sx - mx);
        let mut balaye = (ey - my).atan2(ex - mx) - d0;
        if a["h"].vrai() {
            while balaye >= 0.0 {
                balaye -= 2.0 * PI;
            }
        } else {
            while balaye <= 0.0 {
                balaye += 2.0 * PI;
            }
        }
        let m = ((balaye.abs() / 5f64.to_radians()).ceil() as usize).max(1);
        let mut pts: Vec<(f64, f64)> =
            (0..=m).map(|k| (mx + r * (d0 + balaye * k as f64 / m as f64).cos(), my + r * (d0 + balaye * k as f64 / m as f64).sin())).collect();
        pts[0] = (sx, sy);
        pts[m] = (ex, ey);
        let (w, n) = (fl_ou(&a["w"], 0.0)? * unite, str_ou_vide(&a["n"]));
        for q in pts.windows(2) {
            if hyp(q[1].0 - q[0].0, q[1].1 - q[0].1) > 1e-6 {
                out.push(Troncon { n: n.clone(), c: a["c"].clone(), x1: q[0].0, y1: q[0].1, x2: q[1].0, y2: q[1].1, w });
            }
        }
    }
    Ok(out)
}

/// `(float(u) * unite, float(v) * unite) for u, v in ...` : un point [x, y] du document.
pub fn point(v: &Json, unite: f64) -> R<(f64, f64)> {
    let (x, y) = deux(v)?;
    Ok((fl(x)? * unite, fl(y)? * unite))
}

/// Les cases de la grille que touche un segment élargi de `marge`.
pub fn _cases(case: f64, x1: f64, y1: f64, x2: f64, y2: f64, marge: f64) -> R<Vec<(i64, i64)>> {
    let (i0, i1) = (((x1.min(x2) - marge) / case).floor() as i64, ((x1.max(x2) + marge) / case).floor() as i64);
    let (j0, j1) = (((y1.min(y2) - marge) / case).floor() as i64, ((y1.max(y2) + marge) / case).floor() as i64);
    // une coordonnee aberrante remplirait la grille de millions de cases (2 Go a 6 m)
    if (i1 - i0 + 1).saturating_mul(j1 - j0 + 1) > 100000 {
        return Err(Exc::Analyse("Un segment de la carte couvre plus de 600 mm : coordonnées aberrantes.".into()));
    }
    let mut out = Vec::with_capacity(((i1 - i0 + 1) * (j1 - j0 + 1)).max(0) as usize);
    for i in i0..=i1 {
        for j in j0..=j1 {
            out.push((i, j));
        }
    }
    Ok(out)
}

/// (longueur en regard, écart bord à bord, milieu) de deux segments parallèles, `a` le plus
/// long ; None s'ils ne se font pas face.
pub fn _longement(a: &Seg, b: &Seg) -> Option<(f64, f64, (f64, f64))> {
    let (_, ax1, ay1, ax2, ay2, wa) = a;
    let (_, bx1, by1, bx2, by2, wb) = b;
    let (dx, dy) = (ax2 - ax1, ay2 - ay1);
    let l = hyp(dx, dy);
    let (ux, uy) = (dx / l, dy / l);
    let (ex, ey) = (bx2 - bx1, by2 - by1);
    let lb = hyp(ex, ey);
    if (ux * ey - uy * ex).abs() / lb > ANGLE_PARALLELE.sin() {
        return None;
    }
    let t1 = (bx1 - ax1) * ux + (by1 - ay1) * uy;
    let t2 = (bx2 - ax1) * ux + (by2 - ay1) * uy;
    let (lo, hi) = (maxf(&[0.0, minf(&[t1, t2])]), minf(&[l, maxf(&[t1, t2])]));
    if hi - lo <= 0.0 {
        return None;
    }
    let m = (lo + hi) / 2.0;
    let (mx, my) = (ax1 + ux * m, ay1 + uy * m);
    let d = ((mx - bx1) * ey - (my - by1) * ex).abs() / lb;
    Some((hi - lo, d - (wa + wb) / 2.0, (mx, my)))
}

/// `_longement(a, b) if la >= lb else _longement(b, a)`
pub fn face(a: &Seg, b: &Seg) -> Option<(f64, f64, (f64, f64))> {
    if long_seg(a) >= long_seg(b) { _longement(a, b) } else { _longement(b, a) }
}

pub const ANGLE_PARALLELE: f64 = 0.17453292519943295; // math.radians(10)
