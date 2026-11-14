//! Les angles des pistes :
//!   aigu         deux branches à moins de 90° : le fond du V retient le bain de gravure
//!                (acid trap) ;
//!   angle_droit  un coude à 90° (vigilance : les fabricants le tiennent) ;
//!   jonction     trois branches ou plus sur un même point, ou un bout de piste posé au
//!                milieu d'une autre (T) ;
//!   hors_45      des segments hors des huit directions, une ligne par piste.
//! Un point posé dans une pastille ou un via n'est pas jugé : la piste y entre et en repart,
//! et le cuivre de la pastille recouvre l'angle.

use crate::base::*;
use crate::commun::{_cases, CASE_MM, EPS_MM};

pub const TOL_DEG: f64 = 1.0; // un 90° dessiné sur des coordonnées arrondies au µm s'en écarte de quelques dixièmes
pub const _ORDRE: [&str; 3] = ["critique", "vigilance", "info"];

pub fn severite(regle: &str) -> &'static str {
    match regle {
        "aigu" => "critique",
        "hors_45" => "info",
        _ => "vigilance", // angle_droit, jonction
    }
}

fn _constat(regle: &str, x: Json, y: Json, c: &Json, n: &Json, msg: String, deg: Option<f64>) -> Json {
    obj! {"regle" => regle, "severite" => severite(regle), "x" => x, "y" => y, "c" => c, "n" => n, "deg" => deg, "msg" => msg}
}

/// Le rang d'une sévérité dans le tri des constats ; ValueError de Python hors de la liste.
pub fn rang_severite(k: &Json) -> usize {
    _ORDRE.iter().position(|s| *s == txt(k, "severite")).unwrap_or(_ORDRE.len())
}

/// Un nœud : sa position (en nombre, et telle que le document l'écrit), sa couche, son net.
pub struct Noeud<T> {
    pub x: f64,
    pub y: f64,
    pub jx: Json,
    pub jy: Json,
    pub c: Json,
    pub n: Json,
    pub attaches: Vec<T>,
}

pub type Noeuds<T> = IndexMap<(String, String, i64, i64), Noeud<T>>;

/// Le rang du nœud du net n, couche c, posé à moins d'eps de (x, y), créé au besoin.
/// L'arrondi seul couperait en deux un point à cheval sur une limite : on cherche d'abord
/// dans les cases voisines.
pub fn _accrocher<T>(noeuds: &mut Noeuds<T>, c: &Json, n: &Json, x: (f64, &Json), y: (f64, &Json), eps: f64) -> usize {
    let (ix, iy) = (round0(x.0 / eps), round0(y.0 / eps));
    let (kc, kn) = (cle(c), cle(n));
    for a in [0, -1, 1] {
        for b in [0, -1, 1] {
            if let Some((i, _, nd)) = noeuds.get_full(&(kc.clone(), kn.clone(), ix + a, iy + b)) {
                if hyp(nd.x - x.0, nd.y - y.0) <= eps {
                    return i;
                }
            }
        }
    }
    noeuds.insert_full((kc, kn, ix, iy), Noeud { x: x.0, y: y.0, jx: x.1.clone(), jy: y.1.clone(), c: c.clone(), n: n.clone(), attaches: Vec::new() }).0
}

/// Constats d'angles et de jonctions, du plus grave au moins grave.
pub fn angles(pistes: &[Json], arcs: &[Json], pastilles: &[Json], unite_mm: f64, tol_deg: f64) -> R<Vec<Json>> {
    let eps = EPS_MM / unite_mm;
    let case = CASE_MM / unite_mm;
    let tol = tol_deg.to_radians();
    // (c, n, ix, iy) -> [x, y, [(direction, longueur, demi-largeur)]]
    let mut noeuds: Noeuds<(f64, f64, f64)> = IndexMap::new();
    // (c, n, i, j) -> segments qui la touchent
    let mut grille: HashMap<(String, String, i64, i64), Vec<(f64, f64, f64, f64, f64)>> = HashMap::new();
    let mut constats = Vec::new();

    for p in pistes {
        let p = dict(p)?;
        let (c, n) = (&p["c"], &p["n"]);
        hachable(c)?;
        hachable(n)?;
        let pts = els(&p["p"]);
        let hw = moitie(&p["w"])?;
        let (mut hors, mut premier) = (0usize, None);
        let mut k = 0;
        while k + 3 < pts.len() {
            moins(&pts[k + 2], &pts[k])?;
            moins(&pts[k + 3], &pts[k + 1])?;
            let (x1, y1, x2, y2) = (nombre(&pts[k])?, nombre(&pts[k + 1])?, nombre(&pts[k + 2])?, nombre(&pts[k + 3])?);
            let (dx, dy) = (x2 - x1, y2 - y1);
            let l = hyp(dx, dy);
            if l < eps {
                k += 2;
                continue;
            }
            let i = _accrocher(&mut noeuds, c, n, (x1, &pts[k]), (y1, &pts[k + 1]), eps);
            noeuds[i].attaches.push((dy.atan2(dx), l, hw));
            let i = _accrocher(&mut noeuds, c, n, (x2, &pts[k + 2]), (y2, &pts[k + 3]), eps);
            noeuds[i].attaches.push(((-dy).atan2(-dx), l, hw));
            for (i, j) in _cases(case, x1, y1, x2, y2, hw)? {
                grille.entry((cle(c), cle(n), i, j)).or_default().push((x1, y1, x2, y2, hw));
            }
            let a = pymod(dy.atan2(dx), PI / 4.0);
            if minf(&[a, PI / 4.0 - a]) > tol {
                hors += 1;
                premier = premier.or(Some(((x1 + x2) / 2.0, (y1 + y2) / 2.0)));
            }
            k += 2;
        }
        if let Some((x, y)) = premier {
            constats.push(_constat("hors_45", x.j(), y.j(), c, n, format!("{hors} segment{} hors des huit directions", s_si(hors)), None));
        }
    }

    // Un arc part de ses bouts selon sa tangente : un congé bien posé prolonge la piste
    // (180°), un arc qui arrive de biais fait un vrai coude.
    for a in arcs {
        let a = dict(a)?;
        let xy = |cle: &str| -> R<(&Json, &Json)> {
            let (x, y) = deux(req(a, cle)?)?;
            Ok((x, y))
        };
        let ((jsx, jsy), (jex, jey), (jmx, jmy)) = (xy("s")?, xy("e")?, xy("m")?);
        let (corde, hw) = (hyp(moins(jex, jsx)?, moins(jey, jsy)?), moitie(&a["w"])?);
        let ((sx, sy), (ex, ey)) = ((nombre(jsx)?, nombre(jsy)?), (nombre(jex)?, nombre(jey)?));
        if corde < eps {
            continue; // cercle entier : pas de bout
        }
        moins(jsy, jmy)?;
        moins(jsx, jmx)?;
        let (mx, my) = (nombre(jmx)?, nombre(jmy)?);
        hachable(&a["c"])?;
        hachable(&a["n"])?;
        let sens = if a["h"].vrai() { -1.0 } else { 1.0 }; // tangente = rayon tourné d'un quart de tour
        let i = _accrocher(&mut noeuds, &a["c"], &a["n"], (sx, jsx), (sy, jsy), eps);
        noeuds[i].attaches.push(((sens * (sx - mx)).atan2(-sens * (sy - my)), corde, hw));
        let i = _accrocher(&mut noeuds, &a["c"], &a["n"], (ex, jex), (ey, jey), eps);
        noeuds[i].attaches.push(((-sens * (ex - mx)).atan2(sens * (ey - my)), corde, hw));
    }

    let mut couvert: HashMap<(i64, i64), Vec<(f64, f64, f64, &Json)>> = HashMap::new();
    for t in pastilles {
        let t = dict(t)?;
        // max(r, eps) : « eps > r » ne se compare pas à un texte
        let r = maxf(&[nombre_ou0(&t["r"]).map_err(|_| {
            Exc::MalForme(format!("'>' not supported between instances of 'float' and '{}'", dc_solver::pyth::type_py(&t["r"])))
        })?, eps]);
        let (x, y) = (coordonnee(req(t, "x")?)?, coordonnee(req(t, "y")?)?);
        for ij in _cases(case, x, y, x, y, r)? {
            couvert.entry(ij).or_default().push((x, y, r, &t["c"]));
        }
    }

    for nd in noeuds.values() {
        let (x, y, c, n) = (nd.x, nd.y, &nd.c, &nd.n);
        let (i, j) = ((x / case).floor() as i64, (y / case).floor() as i64);
        if couvert.get(&(i, j)).is_some_and(|l| l.iter().any(|(tx, ty, r, tc)| hyp(x - tx, y - ty) <= *r && (nul(tc) || cle(tc) == cle(c)))) {
            continue;
        }
        // Un bout posé au milieu d'une autre piste : le T. Les deux moitiés de la piste
        // touchée deviennent deux branches du point.
        let mut dirs = nd.attaches.clone();
        for &(x1, y1, x2, y2, hw) in grille.get(&(cle(c), cle(n), i, j)).map_or(&[][..], |v| v) {
            let (dx, dy) = (x2 - x1, y2 - y1);
            let l = hyp(dx, dy);
            let s = ((x - x1) * dx + (y - y1) * dy) / l;
            let marge = maxf(&[hw, eps]);
            if marge < s && s < l - marge && ((x - x1) * dy - (y - y1) * dx).abs() / l <= marge {
                dirs.push((dy.atan2(dx), l - s, hw));
                dirs.push(((-dy).atan2(-dx), s, hw));
            }
        }
        // Deux branches dans la même direction se recouvrent (piste doublée) : c'est du
        // cuivre en double, pas un angle. On garde la plus longue.
        let mut tries: Vec<(f64, f64, f64)> = dirs.iter().map(|(d, l, hw)| (pymod(*d, 2.0 * PI), *l, *hw)).collect();
        tries.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
        let mut uniques: Vec<(f64, f64, f64)> = Vec::new();
        for b in tries {
            match uniques.last_mut() {
                Some(u) if b.0 - u.0 <= tol => {
                    if b.1 > u.1 {
                        *u = b;
                    }
                }
                _ => uniques.push(b),
            }
        }
        if uniques.len() > 1 && uniques[0].0 + 2.0 * PI - uniques[uniques.len() - 1].0 <= tol {
            let dernier = uniques.pop().unwrap();
            if dernier.1 > uniques[0].1 {
                uniques[0] = dernier;
            }
        }
        // Le coin intérieur d'un V ne s'ouvre qu'au-delà de (w/2)/tan(θ/2) le long de chaque
        // branche : plus court, il est noyé dans le cuivre (un micro-zigzag d'export de
        // quelques µm dans une piste de 0,2 mm).
        // shortcut: longueur du SEGMENT, pas de la branche entière ; une jambe coupée en
        // segments colinéaires plus courts que ce seuil passerait.
        let mut ouverts = Vec::new();
        for k in 0..uniques.len() {
            let (a, b) = (uniques[k], uniques[(k + 1) % uniques.len()]);
            let ecart = pymod(b.0 - a.0, 2.0 * PI);
            if 0.0 < ecart && ecart < PI && minf(&[a.1, b.1]) > maxf(&[a.2, b.2]) / (ecart / 2.0).tan() {
                ouverts.push(ecart.to_degrees());
            }
        }
        let (jx, jy) = (nd.jx.clone(), nd.jy.clone());
        if uniques.iter().filter(|(_, l, hw)| l > hw).count() >= 3 {
            let nb = uniques.len();
            constats.push(_constat("jonction", jx.clone(), jy.clone(), c, n,
                                   if nb == 3 { "Jonction en T".to_string() } else { format!("Jonction à {nb} branches") }, None));
        }
        let plus_petit = if ouverts.is_empty() { 180.0 } else { minf(&ouverts) };
        if plus_petit < 90.0 - tol_deg {
            constats.push(_constat("aigu", jx, jy, c, n, format!("Angle aigu de {plus_petit:.0}° : le fond du V retient le bain de gravure"),
                                   Some(round(plus_petit, 1))));
        } else if uniques.len() == 2 && plus_petit <= 90.0 + tol_deg {
            constats.push(_constat("angle_droit", jx, jy, c, n, "Angle droit".into(), Some(90.0)));
        }
    }

    constats.sort_by_key(rang_severite);
    Ok(constats)
}
