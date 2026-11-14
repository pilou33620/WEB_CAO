//! Le couplage entre les pistes du reseau.

use crate::alg::*;
use crate::surfaces::{Cache, _ligne};
use crate::{se, tl, ErreurRF, Res};
use em::simulation_em::base::*;
use std::collections::HashMap;
use std::f64::consts::PI;

// ==========================================================================
// Le couplage entre les pistes du reseau
// --------------------------------------------------------------------------
// DES PISTES DU RESEAU QUI SE LONGENT NE SONT PAS DES LIGNES SEPAREES, mais
// UNE ligne a N conducteurs. On les trouve sur la geometrie -- meme couche,
// paralleles a 15 degres pres, a moins de trois hauteurs au plan de cuivre a
// cuivre (la regle des 3H) --, on les range en GROUPES (les composantes
// connexes de ce voisinage : trois pistes cote a cote en font un), on decoupe
// chaque groupe en intervalles le long de son axe, et chaque intervalle ou
// plusieurs conducteurs sont presents devient une ligne couplee a 2N ports :
// [L] et [C] par `ligne_mom.solve_multiline`, les pertes du cuivre (effet de
// peau, `line_losses`) et du dielectrique, et la matrice de chaine par la
// decomposition propre des equations des telegraphistes.
//
// LES BORDS DE CHAQUE MORCEAU COUPLE PORTENT UN RACCORD d'un micron, copie de
// son bout : il repart avec la chaine voisine dans `simulation_em.simuler`, et
// le coude ou le via qui est la y est compte par le modele de toujours.
// ==========================================================================

pub const COUPLAGE_HAUTEURS: f64 = 3.0;
pub const RACCORD: f64 = 1e-3; // mm : le raccord qui porte coude et via

pub fn _bouts(o: &Json) -> ((f64, f64), (f64, f64)) {
    let bout = |cle: &str| if o[cle].vrai() { (nb(&o[cle][0]), nb(&o[cle][1])) } else { (0.0, 0.0) };
    (bout("start"), bout("end"))
}

/// Un arc part en corde avec sa longueur de cuivre : on ne le couple pas.
/// Les pages envoient les arcs en facettes, donc droites a leur echelle.
pub fn _droit(o: &Json) -> bool {
    let ((ax, ay), (bx, by)) = _bouts(o);
    let corde = py::hypot(bx - ax, by - ay);
    let lg = match o.get("length") {
        Some(v) => _nombre(v, corde),
        None => corde,
    };
    let lg = if lg != 0.0 { lg } else { corde };
    corde > 1e-6 && (lg - corde).abs() <= 0.02 * corde
}

pub fn _h_mm(couches: &[Json], o: &Json, cache: &mut Cache) -> f64 {
    _ligne(couches, ent(&o["layer"], 0), nb(&o["width"]), _nombre(&o["copper_thickness"], 0.035), cache).map_or(0.0, |li| 1e3 * li.h)
}

/// Un `set` d'entiers de CPython, pour l'ORDRE dans lequel il se parcourt : la table a
/// adressage ouvert (9 sondes lineaires, puis la perturbation), agrandie aux memes seuils.
/// Le parcours des voisins fixe l'ordre des membres d'un groupe, donc les paires dont
/// l'ecart est compare : un ordre croissant ne rendrait pas toujours la meme decoupe.
#[derive(Debug, Clone)]
struct EnsemblePy {
    table: Vec<Option<usize>>,
    pleins: usize,
}

impl EnsemblePy {
    fn new() -> Self {
        EnsemblePy { table: vec![None; 8], pleins: 0 }
    }

    fn place(table: &[Option<usize>], cle: usize) -> Option<usize> {
        let masque = table.len() - 1;
        let (mut i, mut perturb) = (cle & masque, cle);
        loop {
            let sondes = if i + 9 <= masque { 9 } else { 0 };
            for k in i..=i + sondes {
                match table[k] {
                    None => return Some(k),
                    Some(v) if v == cle => return None,
                    _ => {}
                }
            }
            perturb >>= 5;
            i = (i * 5 + 1 + perturb) & masque;
        }
    }

    fn add(&mut self, cle: usize) {
        let Some(k) = Self::place(&self.table, cle) else { return };
        self.table[k] = Some(cle);
        self.pleins += 1;
        let masque = self.table.len() - 1;
        if self.pleins * 5 < masque * 3 {
            return;
        }
        let voulu = if self.pleins > 50000 { self.pleins * 2 } else { self.pleins * 4 };
        let mut taille = 8;
        while taille <= voulu {
            taille <<= 1;
        }
        let mut table = vec![None; taille];
        for v in self.table.iter().flatten() {
            if let Some(k) = Self::place(&table, *v) {
                table[k] = Some(*v);
            }
        }
        self.table = table;
    }

    fn iter(&self) -> impl Iterator<Item = usize> + '_ {
        self.table.iter().flatten().copied()
    }
}

/// Un membre d'une section couplee : son troncon (branche, rang), sa place laterale (mm) et
/// son sens de parcours le long de l'axe du groupe.
#[derive(Debug, Clone, PartialEq)]
pub struct Membre {
    pub obj: (usize, usize),
    pub lat: f64,
    pub sens: bool,
}

#[derive(Debug, Clone, PartialEq)]
pub struct Section {
    pub membres: Vec<Membre>,
    pub t1: f64,
    pub t2: f64,
}

/// Les coupes d'un troncon : (debut, fin) en fraction de sa longueur, et (section, rang)
/// quand le morceau est couple.
pub type Coupes = HashMap<(usize, usize), Vec<(f64, f64, Option<(usize, usize)>)>>;

// sorted(set(...)) : le premier des egaux est garde, puis le tri
fn tries_uniques(v: Vec<f64>) -> Vec<f64> {
    let mut out: Vec<f64> = Vec::new();
    for x in v {
        if !out.contains(&x) {
            out.push(x);
        }
    }
    out.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
    out
}

/// Les sections couplees : [{membres: [(b, k, lat)], t1, t2, axe}], et
/// pour chaque troncon concerne ses coupes et le role de chaque morceau.
pub fn groupes_couples(couches: &[Json], branches: &[Json], cache: &mut Cache) -> (Vec<Section>, Coupes) {
    let mut objs: Vec<(usize, usize, &Json)> = Vec::new();
    for (b, br) in branches.iter().enumerate() {
        for (k, o) in els(&br["objets"]).iter().enumerate() {
            if _droit(o) {
                objs.push((b, k, o));
            }
        }
    }
    let mut geo = Vec::new();
    for (_, _, o) in &objs {
        let ((ax, ay), (bx, by)) = _bouts(o);
        let lg = py::hypot(bx - ax, by - ay);
        geo.push(((ax, ay), ((bx - ax) / lg, (by - ay) / lg), lg));
    }
    let sin_max = se::ANGLE_PARALLELE.to_radians().sin();
    let mut voisins: Vec<EnsemblePy> = vec![EnsemblePy::new(); objs.len()];
    for i in 0..objs.len() {
        let (b, k, o) = objs[i];
        let (a_, u, lg) = geo[i];
        let h = _h_mm(couches, o, cache);
        if h == 0.0 {
            continue;
        }
        for j in i + 1..objs.len() {
            let (b2, k2, o2) = objs[j];
            if (b2 == b && k2.abs_diff(k) <= 1) || ent(&o2["layer"], 0) != ent(&o["layer"], 0) {
                continue;
            }
            let (c_, v, lg2) = geo[j];
            if (u.0 * v.1 - u.1 * v.0).abs() > sin_max {
                continue;
            }
            let (dx, dy) = (c_.0 + v.0 * lg2, c_.1 + v.1 * lg2);
            let lat = 0.5 * (((c_.0 - a_.0) * -u.1 + (c_.1 - a_.1) * u.0) + ((dx - a_.0) * -u.1 + (dy - a_.1) * u.0));
            let ecart = lat.abs() - 0.5 * (nb(&o["width"]) + nb(&o2["width"]));
            if ecart <= 0.01 || ecart > COUPLAGE_HAUTEURS * h {
                continue;
            }
            let pc = (c_.0 - a_.0) * u.0 + (c_.1 - a_.1) * u.1;
            let pd = (dx - a_.0) * u.0 + (dy - a_.1) * u.1;
            if minf(&[lg, maxf(&[pc, pd])]) - maxf(&[0.0, minf(&[pc, pd])]) < se::RECOUVREMENT_MIN {
                continue;
            }
            voisins[i].add(j);
            voisins[j].add(i);
        }
    }
    // Les groupes : composantes connexes du voisinage.
    let mut vus = vec![false; objs.len()];
    let mut sections: Vec<Section> = Vec::new();
    let mut coupes: Coupes = HashMap::new();
    let cle = |i: usize| (objs[i].0, objs[i].1);
    for i0 in 0..objs.len() {
        if vus[i0] || voisins[i0].pleins == 0 {
            continue;
        }
        let (mut pile, mut groupe) = (vec![i0], Vec::new());
        vus[i0] = true;
        while let Some(i) = pile.pop() {
            groupe.push(i);
            for j in voisins[i].iter() {
                if !vus[j] {
                    vus[j] = true;
                    pile.push(j);
                }
            }
        }
        let (a_, u, _) = geo[groupe[0]];
        let n_ = (-u.1, u.0);
        let mut proj: HashMap<usize, (f64, f64, f64, f64)> = HashMap::new();
        for &i in &groupe {
            let (s, d, lg) = geo[i];
            let e = (s.0 + d.0 * lg, s.1 + d.1 * lg);
            let ta = (s.0 - a_.0) * u.0 + (s.1 - a_.1) * u.1;
            let tb = (e.0 - a_.0) * u.0 + (e.1 - a_.1) * u.1;
            let la = (s.0 - a_.0) * n_.0 + (s.1 - a_.1) * n_.1;
            let lb = (e.0 - a_.0) * n_.0 + (e.1 - a_.1) * n_.1;
            proj.insert(i, (ta, tb, la, lb));
        }
        let ts = tries_uniques(groupe.iter().flat_map(|i| [round(proj[i].0, 6), round(proj[i].1, 6)]).collect());
        // DEUX PISTES PRESQUE PARALLELES N'ONT PAS UN ECART, elles en ont un
        // par abscisse. On recoupe chaque intervalle tant que l'ecart de deux
        // membres presents y varie de plus de 5 % (ou de 10 microns) : chaque
        // morceau est alors une section droite a son propre ecart.
        let mut fins = Vec::new();
        for (&t1, &t2) in ts.iter().zip(ts.iter().skip(1)) {
            let lat = |i: usize, t: f64| {
                let p = proj[&i];
                p.2 + (p.3 - p.2) * (t - p.0) / (if p.1 - p.0 != 0.0 { p.1 - p.0 } else { 1e-300 })
            };
            let pres: Vec<usize> = groupe.iter().copied().filter(|i| {
                let p = proj[i];
                minf(&[p.0, p.1]) <= t1 + 1e-6 && maxf(&[p.0, p.1]) >= t2 - 1e-6
            }).collect();
            let mut decoupe = 1i64;
            for (&a_i, &b_i) in pres.iter().zip(pres.iter().skip(1)) {
                let e1 = (lat(b_i, t1) - lat(a_i, t1)).abs();
                let e2 = (lat(b_i, t2) - lat(a_i, t2)).abs();
                let tol = maxf(&[0.01, 0.05 * minf(&[e1, e2])]);
                decoupe = decoupe.max(((e2 - e1).abs() / tol).ceil() as i64);
            }
            let decoupe = decoupe.min(40);
            fins.extend((0..decoupe).map(|q| round(t1 + (t2 - t1) * q as f64 / decoupe as f64, 6)));
        }
        fins.extend(ts.last());
        let ts = tries_uniques(fins);
        for (&t1, &t2) in ts.iter().zip(ts.iter().skip(1)) {
            if t2 - t1 < 1e-4 {
                continue;
            }
            let tm = 0.5 * (t1 + t2);
            let mut present = Vec::new();
            for &i in &groupe {
                let (ta, tb, la, lb) = proj[&i];
                if minf(&[ta, tb]) <= t1 + 1e-6 && maxf(&[ta, tb]) >= t2 - 1e-6 {
                    let lat = la + (lb - la) * (tm - ta) / (if tb - ta != 0.0 { tb - ta } else { 1e-300 });
                    present.push((lat, i));
                }
            }
            present.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
            // Des amas, coupes la ou deux voisins s'ecartent de plus de 3H.
            let mut amas: Vec<Vec<(f64, usize)>> = Vec::new();
            let mut cour: Vec<(f64, usize)> = present.iter().take(1).copied().collect();
            for (&(l0, i0_), &(l1, i1)) in present.iter().zip(present.iter().skip(1)) {
                let w0 = nb(&objs[i0_].2["width"]);
                let w1_ = nb(&objs[i1].2["width"]);
                let h = _h_mm(couches, objs[i1].2, cache);
                if (l1 - l0) - 0.5 * (w0 + w1_) > COUPLAGE_HAUTEURS * h {
                    amas.push(std::mem::take(&mut cour));
                }
                cour.push((l1, i1));
            }
            amas.push(cour);
            for am in &amas {
                for morceau in am.chunks(tl::MAX_CONDUCTEURS) {
                    if morceau.len() < 2 {
                        continue;
                    }
                    let sid = sections.len();
                    sections.push(Section { membres: Vec::new(), t1, t2 });
                    for (rang, &(lat, i)) in morceau.iter().enumerate() {
                        let (ta, tb, _, _) = proj[&i];
                        let f1 = (t1 - ta) / (tb - ta);
                        let f2 = (t2 - ta) / (tb - ta);
                        let sens = tb > ta;
                        sections[sid].membres.push(Membre { obj: cle(i), lat, sens });
                        coupes.entry(cle(i)).or_default().push((minf(&[f1, f2]), maxf(&[f1, f2]), Some((sid, rang))));
                    }
                }
            }
        }
        // Les autres intervalles de chaque membre sont de simples morceaux :
        // on coupe aussi a leurs bornes, pour que tout tombe juste.
        for &i in &groupe {
            let (ta, tb, _, _) = proj[&i];
            let lst = coupes.entry(cle(i)).or_default();
            for &t in &ts {
                let f = (t - ta) / (tb - ta);
                if 1e-9 < f && f < 1.0 - 1e-9 {
                    lst.push((f, f, None));
                }
            }
        }
    }
    (sections, coupes)
}

/// Le morceau [a, b] (mm depuis le debut) d'un troncon droit.
pub fn _morceau(o: &Json, a: f64, b: f64) -> Json {
    let ((ax, ay), (bx, by)) = _bouts(o);
    let lg = py::hypot(bx - ax, by - ay);
    let mut m = o.clone();
    poser(&mut m, "start", vec![ax + (bx - ax) * a / lg, ay + (by - ay) * a / lg]);
    poser(&mut m, "end", vec![ax + (bx - ax) * b / lg, ay + (by - ay) * b / lg]);
    poser(&mut m, "length", b - a);
    if a > 1e-9 {
        oter(&mut m, "via"); // le via est au debut du troncon d'origine
    }
    m
}

/// Un element de la suite d'une branche.
#[derive(Debug, Clone, PartialEq)]
pub enum Element {
    Chaine(Vec<Json>),
    /// (section, rang, morceau)
    Couple(usize, usize, Json),
}

/// Chaque branche -> une suite d'elements : ("chaine", [objets]) ou
/// ("couple", section, rang, morceau), raccords de bord compris.
pub fn _decouper(branches: &[Json], coupes: &Coupes) -> Vec<Vec<Element>> {
    let cle9 = |f: f64| (round(f, 9) + 0.0).to_bits();
    let mut suites = Vec::new();
    for (b, br) in branches.iter().enumerate() {
        let (mut suite, mut chaine): (Vec<Element>, Vec<Json>) = (Vec::new(), Vec::new());
        for (k, o) in els(&br["objets"]).iter().enumerate() {
            let Some(cs) = coupes.get(&(b, k)).filter(|cs| !cs.is_empty()) else {
                chaine.push(o.clone());
                continue;
            };
            let ((ax, ay), (bx, by)) = _bouts(o);
            let lg = py::hypot(bx - ax, by - ay);
            let mut fr = vec![0.0, 1.0];
            fr.extend(cs.iter().map(|c| c.0));
            fr.extend(cs.iter().map(|c| c.1));
            let fr = tries_uniques(fr);
            let role: HashMap<(u64, u64), (usize, usize)> = cs.iter().filter_map(|c| c.2.map(|r| ((cle9(c.0), cle9(c.1)), r))).collect();
            for (&f1, &f2) in fr.iter().zip(fr.iter().skip(1)) {
                if (f2 - f1) * lg < 1e-4 {
                    continue;
                }
                let p = _morceau(o, f1 * lg, f2 * lg);
                match role.get(&(cle9(f1), cle9(f2))) {
                    None => chaine.push(p),
                    Some(r) => {
                        if !chaine.is_empty() {
                            suite.push(Element::Chaine(std::mem::take(&mut chaine)));
                        }
                        suite.push(Element::Couple(r.0, r.1, p));
                    }
                }
            }
        }
        if !chaine.is_empty() {
            suite.push(Element::Chaine(chaine));
        }
        // LES RACCORDS : un micron de chaque morceau couple, rendu a la chaine
        // voisine, pour que le coude ou le via du bord y soit compte.
        let tete = |p: &Json| {
            let mut m = _morceau(p, 0.0, minf(&[RACCORD, num(p, "length") / 4.0]));
            poser(&mut m, "raccord", true);
            m
        };
        let queue = |p: &Json| {
            let mut m = _morceau(p, num(p, "length") - minf(&[RACCORD, num(p, "length") / 4.0]), num(p, "length"));
            poser(&mut m, "raccord", true);
            m
        };
        let mut fin: Vec<Element> = Vec::new();
        for mut el in suite {
            // ce que `prec` valait avant qu'on ajoute quoi que ce soit
            let prec_couple: Option<Json> = match fin.last() {
                Some(Element::Couple(_, _, p)) => Some(p.clone()),
                _ => None,
            };
            let avait_prec = !fin.is_empty();
            if let (Element::Couple(_, _, p), true) = (&el, avait_prec) {
                match (fin.last_mut(), &prec_couple) {
                    (Some(Element::Chaine(objets)), _) => objets.push(tete(p)),
                    (_, Some(pp)) => fin.push(Element::Chaine(vec![queue(pp), tete(p)])),
                    _ => {}
                }
            }
            if let (Element::Chaine(objets), Some(pp)) = (&mut el, &prec_couple) {
                objets.insert(0, queue(pp));
            }
            fin.push(el);
        }
        suites.push(fin);
    }
    suites
}

/// Une matrice, ou une LISTE par frequence quand la section est dispersive.
#[derive(Debug, Clone, Copy)]
pub enum ParFrequence<'a, T> {
    Une(&'a T),
    Liste(&'a [T]),
}

impl<'a, T> ParFrequence<'a, T> {
    pub fn a(&self, k: usize) -> &'a T {
        match self {
            ParFrequence::Une(m) => m,
            ParFrequence::Liste(l) => &l[k],
        }
    }
}

/// `l_m` et `c_m` sont une matrice, ou une LISTE par frequence quand la
/// section est dispersive ; `tan_delta` un nombre, ou une liste par
/// frequence quand le dielectrique est causal.
pub fn phi_mtl(l_m: ParFrequence<MatR>, c_m: ParFrequence<MatR>, r_par_f: &[Vec<f64>], tan_delta: ParFrequence<f64>, longueur_m: f64,
               freqs: &[f64]) -> Res<Vec<MatC>> {
    freqs.iter().enumerate().map(|(k, &f)| _phi_un(l_m.a(k), c_m.a(k), &r_par_f[k], *tan_delta.a(k), longueur_m, f)).collect()
}

/// La matrice de chaine 2N x 2N [V(L), I(L)] = Phi [V(0), I(0)] d'un
/// troncon a N conducteurs, pertes comprises, par frequence.
///
/// dV/dz = -Z I, dI/dz = -Y V, Z = R + jwL, Y = jwC (1 - j tan d) : Phi est
/// l'exponentielle de [[0, -Z], [-Y, 0]] L, prise par ses valeurs propres.
pub fn _phi_un(l_m: &MatR, c_m: &MatR, r: &[f64], tan_delta: f64, longueur_m: f64, f: f64) -> Res<MatC> {
    let n = l_m.len();
    let w = 2.0 * PI * f;
    let mut m = zeros(2 * n, 2 * n);
    for i in 0..n {
        for j in 0..n {
            let z = Complex64::new(if i == j { r[i] } else { 0.0 }, w * l_m[i][j]);
            let y = Complex64::new(0.0, w * c_m[i][j]) * Complex64::new(1.0, -tan_delta);
            m[i][n + j] = -z * longueur_m;
            m[n + i][j] = -y * longueur_m;
        }
    }
    _expm(&m)
}

/// [L](f) et [C](f) d'un microruban couple : Getsinger MODE PAR MODE.
///
/// La base modale symetrique (`crosstalk._modes_mtl`) diagonalise les deux
/// matrices ensemble : T^-1 L T^-T = I, T^T C T = diag(lambda), et
/// eps_mode = c0^2 lambda. Chaque mode recoit l'eps_eff(f) et le Z(f) de
/// Getsinger -- exactement ce que `simuler` applique a une ligne seule --, sa
/// self et sa capacite modales sont remises a l'echelle en consequence :
/// L x C suit eps(f), racine(L / C) suit Z(f).
pub fn dispersion_modale(l_m: &MatR, c_m: &MatR, er: f64, h_m: f64, freqs: &[f64]) -> Res<(Vec<MatR>, Vec<MatR>)> {
    let (t_m, _w, racines) = em::crosstalk::_modes_mtl(l_m, c_m)?;
    let n = racines.len();
    let lam: Vec<f64> = racines.iter().map(|r| r * r).collect();
    let eps: Vec<f64> = lam.iter().map(|l| (tl::C_0 * tl::C_0) * l).collect();
    // t_i . M . t_i
    let forme = |m: &MatR, i: usize| -> f64 { (0..n).map(|a| t_m[a][i] * (0..n).map(|b| m[a][b] * t_m[b][i]).sum::<f64>()).sum() };
    let zmod: Vec<f64> = (0..n).map(|i| (forme(l_m, i) / forme(c_m, i)).sqrt()).collect();
    let ti = inverse_r(&t_m).ok_or_else(|| ErreurRF::interne("LinAlgError : Singular matrix"))?;
    let (mut ls, mut cs) = (Vec::new(), Vec::new());
    for &f in freqs {
        let (mut a_, mut b_) = (Vec::new(), Vec::new());
        for i in 0..n {
            let (eps_f, z_f) = tl::dispersion_getsinger(zmod[i], eps[i], er, h_m, f);
            let r = eps_f / eps[i];
            let q = z_f / zmod[i];
            a_.push(q * r.sqrt());
            b_.push(r.sqrt() / q);
        }
        // T diag(a) T^T et T^-T diag(lambda b) T^-1
        ls.push((0..n).map(|i| (0..n).map(|j| (0..n).map(|k| t_m[i][k] * a_[k] * t_m[j][k]).sum()).collect()).collect());
        cs.push((0..n).map(|i| (0..n).map(|j| (0..n).map(|k| ti[k][i] * (lam[k] * b_[k]) * ti[k][j]).sum()).collect()).collect());
    }
    Ok((ls, cs))
}

/// exp(A) par Pade (6, 6) avec mise a l'echelle et elevations au carre.
///
/// PAS PAR LES VALEURS PROPRES : en triplaque, milieu homogene, tous les
/// modes vont a la meme vitesse et la base propre devient mal conditionnee.
pub fn _expm(a: &MatC) -> Res<MatC> {
    let n = a.len();
    let norme = (0..n).map(|j| (0..n).map(|i| a[i][j].norm()).sum::<f64>()).fold(0.0, f64::max);
    let s = if norme > 0.5 { ((norme / 0.5).log2().ceil() as i32).max(0) } else { 0 };
    let a: MatC = a.iter().map(|l| l.iter().map(|v| v / 2f64.powi(s)).collect()).collect();
    let co = [1.0, 0.5, 5.0 / 44.0, 1.0 / 66.0, 1.0 / 792.0, 1.0 / 15840.0, 1.0 / 665280.0];
    let id = ident(n);
    let mut x = a.clone();
    let mut numer = plus(&id, c(co[1]), &a);
    let mut den = plus(&id, c(-co[1]), &a);
    for k in 2..7 {
        x = mul(&a, &x);
        numer = plus(&numer, c(co[k]), &x);
        den = plus(&den, c(if k % 2 == 0 { co[k] } else { -co[k] }), &x);
    }
    let mut e = resoudre(&den, &numer).ok_or_else(|| ErreurRF::interne("LinAlgError : Singular matrix"))?;
    for _ in 0..s {
        e = mul(&e, &e);
    }
    Ok(e)
}

/// La fiche d'une section couplee.
#[derive(Debug, Clone, PartialEq)]
pub struct FicheSection {
    pub kb: f64,
    pub z0: Vec<f64>,
}

/// Le 2N-ports d'une section couplee, bornes [proches..., lointaines...]
/// dans l'ordre lateral, et sa fiche.
///
/// `opts` (`simulation_em.options_modele`) : avec le dielectrique causal,
/// [C](f) suit er(f) a remplissage constant -- C0 + (C - C0)(er(f) - 1)/
/// (er - 1), la meme approximation que la ligne seule -- et tan delta(f) la
/// fiche prolongee. Les pertes du cuivre prennent la topologie et la
/// rugosite de la couche, pas la hauteur : la section est couplee.
pub fn y_section(couches: &[Json], section: &Section, objs: &[Json], freqs: &[f64], _cache: &mut Cache, opts: Option<&se::OptionsModele>)
                 -> Res<Option<(Vec<MatC>, FicheSection)>> {
    let membres = &section.membres;
    let o0 = &objs[0];
    let couche = ent(&o0["layer"], 0);
    let ep = _nombre(&o0["copper_thickness"], 0.035);
    // LA MASSE COPLANAIRE AUTOUR DU GROUPE, cote par cote. Gauche et droite
    // d'un troncon se lisent dans son sens de parcours ; l'axe lateral du
    // groupe est a gauche de son axe : un membre parcouru a l'envers les
    // echange.
    let cote = |m: &Membre, o: &Json, gauche: bool| {
        let e = se::_ecarts(o);
        if gauche == m.sens { e.0 } else { e.1 }
    };
    let e_bas = cote(&membres[0], &objs[0], false);
    let e_haut = cote(&membres[membres.len() - 1], &objs[objs.len() - 1], true);
    let (geo, info) = se::section_de_couche(couches, couche, nb(&o0["width"]), ep, e_bas, Some(e_haut), &[], false);
    let Some(mut geo) = geo else {
        return Ok(None);
    };
    poser(&mut geo, "conducteurs", membres.iter().zip(objs).map(|(m, o)| obj! {"w" => nb(&o["width"]) * 1e-3, "x" => m.lat * 1e-3}).collect::<Vec<Json>>());
    let r = tl::solve_multiline(&se::geometrie(&geo))?;
    let n = membres.len();
    let ordre: Vec<usize> = (0..n).map(|q| r.ordre.iter().position(|x| *x == q).ok_or_else(|| ErreurRF::interne("ValueError : conducteur absent de l'ordre")))
        .collect::<Res<_>>()?;
    let range = |m: &MatR| -> MatR { ordre.iter().map(|&i| ordre.iter().map(|&j| m[i][j]).collect()).collect() };
    let (l_m, c_m) = (range(&r.l), range(&r.c));
    let lignes: Vec<&tl::LigneCouplee> = ordre.iter().map(|&q| &r.lignes[q]).collect();
    let tan_d = _nombre(&info["tan_delta"], 0.0);
    let kw = se::kw_reunis(se::_geometrie_pertes(&info, false, true), se::_rugosite_section(couches, couche, &info));
    let options = se::options_pertes(&kw, ep * 1e-3);
    let mut r_f = Vec::new();
    for &f in freqs {
        let mut ligne = Vec::new();
        for (li, o) in lignes.iter().zip(objs) {
            ligne.push(2.0 * tl::line_losses(li.z0, li.eps_eff, nb(&o["width"]) * 1e-3, num(&info, "er"), 0.0, f, &options)?.0 * li.z0);
        }
        r_f.push(ligne);
    }
    let lg = (section.t2 - section.t1) * 1e-3;
    // LA DISPERSION DU MICRORUBAN, comme sur les branches ; la triplaque,
    // noyee dans un milieu homogene, n'en a pas.
    let disp = if info["topo"].as_str() == Some("micro") { Some(dispersion_modale(&l_m, &c_m, num(&info, "er"), num(&info, "h"), freqs)?) } else { None };
    let l_f = disp.as_ref().map_or(ParFrequence::Une(&l_m), |d| ParFrequence::Liste(&d.0));
    let mut c_f = disp.as_ref().map_or(ParFrequence::Une(&c_m), |d| ParFrequence::Liste(&d.1));
    // LE DIELECTRIQUE CAUSAL : la part dielectrique de [C] suit er(f), et
    // tan delta(f) la fiche. Rien ne bouge sans l'option.
    let er = _nombre(&info["er"], 1.0);
    let (mut cs, mut tds): (Vec<MatR>, Vec<f64>) = (Vec::new(), Vec::new());
    let mut tan = ParFrequence::Une(&tan_d);
    if opts.is_some_and(|o| o.causal) && er > 1.0 && tan_d > 0.0 {
        let c0_m = range(&r.c0);
        for (k, &f) in freqs.iter().enumerate() {
            let (er_f, td_f) = se::_dielectrique(er, tan_d, f, opts)?;
            let c_k = c_f.a(k);
            cs.push((0..n).map(|i| (0..n).map(|j| c0_m[i][j] + (c_k[i][j] - c0_m[i][j]) * ((er_f - 1.0) / (er - 1.0))).collect()).collect());
            tds.push(td_f);
        }
        c_f = ParFrequence::Liste(&cs);
        tan = ParFrequence::Liste(&tds);
    }
    let mut ys = Vec::new();
    for p in phi_mtl(l_f, c_f, &r_f, tan, lg, freqs)? {
        let bloc = |i0: usize, j0: usize| -> MatC { (0..n).map(|i| (0..n).map(|j| p[i0 + i][j0 + j]).collect()).collect() };
        let (a_, b_, c_, d_) = (bloc(0, 0), bloc(0, n), bloc(n, 0), bloc(n, n));
        let bi = inverse(&b_).ok_or_else(|| ErreurRF::interne("LinAlgError : Singular matrix"))?;
        let bia = mul(&bi, &a_);
        let dbi = mul(&d_, &bi);
        let bas_gauche = plus(&mul(&dbi, &a_), c(-1.0), &c_);
        let mut y = zeros(2 * n, 2 * n);
        for i in 0..n {
            for j in 0..n {
                y[i][j] = -bia[i][j];
                y[i][n + j] = bi[i][j];
                y[n + i][j] = bas_gauche[i][j];
                y[n + i][n + j] = -dbi[i][j];
            }
        }
        ys.push(y);
    }
    let mut kb = 0.0;
    for i in 0..n {
        for j in i + 1..n {
            let kc = -c_m[i][j] / (c_m[i][i] * c_m[j][j]).sqrt();
            let kl = l_m[i][j] / (l_m[i][i] * l_m[j][j]).sqrt();
            kb = dc_solver::pyth::max_py(kb, 0.25 * (kl + kc));
        }
    }
    Ok(Some((ys, FicheSection { kb, z0: lignes.iter().map(|li| li.z0).collect() })))
}
