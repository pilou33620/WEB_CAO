// ==========================================================================
// LA CAVITE MAILLEE -- LA FORME REELLE DU RECOUVREMENT
// --------------------------------------------------------------------------
// Le rectangle de `cavite_modale` est la boite du recouvrement : sur P01x291,
// 84 x 78 mm pour 2 477 mm2 de cuivre en regard. Ses modes sont ceux d'une
// plaque qui n'existe pas. Ici le recouvrement est maille tel quel (la page
// le balaie ligne par ligne, cellules carrees de `pas`), et chaque cellule est
// un noeud du reseau L-C de la paire de plans :
//
//   lien entre deux cellules voisines : L = mu0 h (un carre de plan)
//   cellule vers le plan d'en face     : C = eps0 er pas^2 / h
//
// On n'inverse pas ce reseau a chaque frequence : on en tire les MODES PROPRES
// (K phi = w^2 M phi, decalage-inversion de scipy) et ils alimentent la meme
// formule a ports que le rectangle -- le cos.cos analytique devient le phi
// numerique. La queue inductive se calcule EXACTEMENT sur la grille (G = K+
// moins les modes gardes), et une correction de Peaceman rend l'etalement
// d'un via plus fin qu'une cellule. Les fentes sont des cellules absentes ;
// un ilot est une autre composante connexe, et un pont pose dessus ne touche
// pas le via. Modes et factorisation se calculent une fois par cavite et se
// partagent entre tous ses vias.
//
// ponytail: maille de `pas` fixe (0,5 mm envoye) ; plans minces, rayonnement
// des bords neglige (mur magnetique), comme le modele de cavite.
//
// (En Rust : les modes propres par `creux::modes_propres`, la factorisation par le Cholesky
// creux de faer.)

use crate::cavite::{poids_modes, Cavite, PORT_MIN};
use crate::creux::{composantes, modes_propres, Facteur};
use crate::traversee::{inductance_etalement_via_via, Traversee, _traversee_modale_vec};
use crate::{arrondi, refus, Res, C_0, EPSILON_0, ETA_0, MU_0, SIGMA_CU};
use num_complex::Complex64;
use std::collections::HashMap;
use std::f64::consts::PI;
use std::hash::{Hash, Hasher};
use std::sync::{Arc, Mutex};

const _GRILLES_MAX: usize = 12;
pub const PEACEMAN: f64 = 0.1985;
// UN ILOT DU RECOUVREMENT N'EST PAS ISOLE : il porte les deux memes nets que
// la cavite principale, et un net est relie ailleurs par definition (pistes,
// autres couches -- sur P01x291 un ilot GND/VDDIO de 118 mm2 a l'est). La page
// envoie le cuivre des deux nets (`grille["reseau"]`) et le lien se resout
// dans ce reseau (`_liens_par_reseau`). A defaut, on le rattache au plus pres
// par une self de 1 nH/mm d'ecart.
// ponytail: le repli est l'ordre de grandeur d'une piste.
pub const ILOT_H_PAR_M: f64 = 1e-6;

/// Une ligne de cellules `[j, [i1, i2, ...]]` : a la rangee j, les cellules de i1 a i2 exclu,
/// puis de i3 a i4...
pub type LigneCellules = (i64, Vec<i64>);

/// Le cuivre d'un net sur une couche (`reseau["nets"][k]["couches"]`).
#[derive(Debug, Clone, PartialEq, Default)]
pub struct CoucheReseau {
    pub cu: usize,
    /// hauteur au plan en mm ; absente : 0,71
    pub h: Option<f64>,
    pub lignes: Vec<LigneCellules>,
    /// (j, i, part de la cellule couverte)
    pub fractions: Vec<(i64, i64, f64)>,
}

/// Un net du reseau : ses plans, ses pistes [cu, largeur, x1, y1, x2, y2] en mm et ses vias
/// (x, y, couches traversees).
#[derive(Debug, Clone, PartialEq, Default)]
pub struct NetReseau {
    pub plan: usize,
    pub couches: Vec<CoucheReseau>,
    pub pistes: Vec<[f64; 6]>,
    pub vias: Vec<(f64, f64, Vec<usize>)>,
}

/// `grille["reseau"]` : le cuivre des deux nets, dans la boite [i1, i2] x [j1, j2] ; `ep` les
/// epaisseurs entre couches, en mm.
#[derive(Debug, Clone, PartialEq, Default)]
pub struct Reseau {
    pub i1: i64,
    pub i2: i64,
    pub j1: i64,
    pub j2: i64,
    pub ep: Vec<f64>,
    pub nets: Vec<NetReseau>,
}

/// La grille du recouvrement que la page envoie : `pas`, `x0`, `y0` en mm.
#[derive(Debug, Clone, PartialEq, Default)]
pub struct Grille {
    pub pas: f64,
    pub x0: f64,
    pub y0: f64,
    pub lignes: Vec<LigneCellules>,
    pub reseau: Option<Reseau>,
}

fn hacher_lignes(h: &mut impl Hasher, lignes: &[LigneCellules]) {
    lignes.hash(h);
}

fn hacher_reseau(h: &mut impl Hasher, r: &Reseau) {
    (r.i1, r.i2, r.j1, r.j2).hash(h);
    r.ep.iter().for_each(|e| e.to_bits().hash(h));
    for net in &r.nets {
        net.plan.hash(h);
        for c in &net.couches {
            (c.cu, c.h.map(f64::to_bits)).hash(h);
            hacher_lignes(h, &c.lignes);
            c.fractions.iter().for_each(|&(j, i, p)| (j, i, p.to_bits()).hash(h));
        }
        net.pistes.iter().flatten().for_each(|x| x.to_bits().hash(h));
        net.vias.iter().for_each(|(x, y, cs)| (x.to_bits(), y.to_bits(), cs).hash(h));
    }
}

/// Des directions reparties sur la sphere (Fibonacci), d'angle solide egal.
pub fn _directions(n: usize) -> Vec<[f64; 3]> {
    (0..n)
        .map(|i| {
            let k = i as f64 + 0.5;
            let th = (1.0 - 2.0 * k / n as f64).acos();
            let ph = PI * (1.0 + 5f64.powf(0.5)) * k;
            [ph.cos() * th.sin(), ph.sin() * th.sin(), th.cos()]
        })
        .collect()
}

pub const PAQUET_BORD: f64 = 2e-3; // les faces de bord se regroupent par carres de 2 mm

/// Les faces de bord regroupees : le paquet de chaque face, le centre de chaque paquet et les
/// deux composantes du moment (t . pas) de chaque face.
#[derive(Debug, Clone, PartialEq, Default)]
pub struct Paquets {
    pub paquet: Vec<usize>,
    pub centre: Vec<(f64, f64)>,
    pub tx: Vec<f64>,
    pub ty: Vec<f64>,
}

/// `np.unique(cle, axis=0, return_inverse=True)` : le rang de chaque cle parmi les cles
/// distinctes triees.
fn rangs_uniques(cles: &[(i64, i64)]) -> (usize, Vec<usize>) {
    let mut tri: Vec<(i64, i64)> = cles.to_vec();
    tri.sort_unstable();
    tri.dedup();
    (tri.len(), cles.iter().map(|c| tri.binary_search(c).unwrap_or(0)).collect())
}

/// Les faces de bord regroupees par carres de PAQUET_BORD : la matrice
/// d'agregation (E x C, creuse), le centre de chaque paquet et les deux
/// composantes du moment (t . pas) de chaque face. Une face vaut un courant
/// magnetique elementaire ; un paquet de 2 mm est petit devant la longueur
/// d'onde (erreur de phase 0,03 rad a 1 GHz), et le calcul du champ lointain
/// tombe d'autant -- il coutait plus d'une seconde par via sur P01x291.
pub fn _paquets_bord(pos: &[(f64, f64)], tan: &[(f64, f64)], pas: f64) -> Paquets {
    let cle: Vec<(i64, i64)> = pos.iter().map(|&(x, y)| ((x / PAQUET_BORD).floor() as i64, (y / PAQUET_BORD).floor() as i64)).collect();
    let (nc, inv) = rangs_uniques(&cle);
    let mut compte = vec![0usize; nc];
    let mut centre = vec![(0.0, 0.0); nc];
    for (&p, &(x, y)) in inv.iter().zip(pos) {
        compte[p] += 1;
        centre[p].0 += x;
        centre[p].1 += y;
    }
    for (c, &k) in centre.iter_mut().zip(&compte) {
        c.0 /= k.max(1) as f64;
        c.1 /= k.max(1) as f64;
    }
    Paquets { paquet: inv, centre, tx: tan.iter().map(|t| t.0 * pas).collect(), ty: tan.iter().map(|t| t.1 * pas).collect() }
}

/// LES BORDS D'UNE PAIRE DE PLANS RAYONNENT comme des fentes : la tension
/// V entre les plans y est un courant magnetique K = V (en volts) le long du
/// bord. On somme leur champ lointain de facon COHERENTE (phases comprises)
/// sur 194 directions, par paquets de faces (`_paquets_bord`) :
///
///     L(r) = somme_paquets M e^(j k r.r'),  E = k |L_perp| / (4 pi r)
///     P = k^2 / (32 pi^2 eta0) integrale |L_perp|^2 dOmega
///
/// Rend (P en W, E maximal a 1 m en V/m) pour chaque frequence de `freqs` et
/// chaque ligne de tensions de face `v` (F, E) -- valeurs crete.
pub fn _rayonnement_bords(freqs: &[f64], paquets: &Paquets, v: &[Vec<Complex64>]) -> (Vec<f64>, Vec<f64>) {
    let zero = Complex64::new(0.0, 0.0);
    let nc = paquets.centre.len();
    let d = _directions(194);
    let proj: Vec<Vec<f64>> = d.iter().map(|d| paquets.centre.iter().map(|c| d[0] * c.0 + d[1] * c.1).collect()).collect();
    let (mut p_out, mut e_out) = (vec![0.0; freqs.len()], vec![0.0; freqs.len()]);
    for (i, &f) in freqs.iter().enumerate() {
        let (mut mx, mut my) = (vec![zero; nc], vec![zero; nc]);
        for (e, &c) in paquets.paquet.iter().enumerate() {
            mx[c] += v[i][e] * paquets.tx[e];
            my[c] += v[i][e] * paquets.ty[e];
        }
        let k0 = 2.0 * PI * f / C_0;
        let (mut somme, mut max) = (0.0, 0.0f64);
        for (d, proj) in d.iter().zip(&proj) {
            let (mut lx, mut ly) = (zero, zero);
            for c in 0..nc {
                let ph = Complex64::new(0.0, k0 * proj[c]).exp();
                lx += ph * mx[c];
                ly += ph * my[c];
            }
            let rl = d[0] * lx + d[1] * ly;
            let lt2 = (lx.norm_sqr() + ly.norm_sqr() - rl.norm_sqr()).max(0.0);
            somme += lt2;
            max = max.max(lt2);
        }
        p_out[i] = k0 * k0 / (32.0 * PI * PI * ETA_0) * (somme / d.len() as f64) * 4.0 * PI;
        e_out[i] = k0 * max.sqrt() / (4.0 * PI);
    }
    (p_out, e_out)
}

/// Self lineique d'une piste au-dessus de son plan, H/mm (Hammerstad dans
/// l'air, comme `simPDNInductanceLineique` de la page).
pub fn _l_lineique(w_mm: f64, h_mm: f64) -> f64 {
    let (w, h) = (w_mm.max(0.01), h_mm.max(0.01));
    let u = w / h;
    let z = if u <= 1.0 { 60.0 * (8.0 / u + u / 4.0).ln() } else { 120.0 * PI / (u + 1.393 + 0.667 * (u + 1.444).ln()) };
    z / C_0 * 1e-3
}

/// (i, j) de toutes les cellules d'une liste de lignes [[j, [i1, i2, ...]]].
pub fn _cellules_lignes(lignes: &[LigneCellules]) -> (Vec<i64>, Vec<i64>) {
    let (mut ii, mut jj) = (Vec::new(), Vec::new());
    for (j, sp) in lignes {
        for p in sp.chunks_exact(2) {
            for i in p[0]..p[1] {
                ii.push(i);
                jj.push(*j);
            }
        }
    }
    (ii, jj)
}

pub const PEEC_SEUIL: f64 = 0.01; // segments qui portent au moins 1 % du courant
pub const PEEC_MAX: usize = 1500; // au plus, par ilot (les plus charges)
pub const PEEC_ILOT_MIN: usize = 40; // cellules : en dessous, un ilot ne merite pas le calcul
pub const EP_CUIVRE_M: f64 = 35e-6;

/// Un barreau PEEC : (direction 0/1/2, centre, longueur, largeur, courant signe).
pub type Segment = (usize, [f64; 3], f64, f64, f64);

/// LA SELF DE BOUCLE PAR PEEC : `segs` = (dir 0/1/2, centre (3,), longueur,
/// largeur, courant signe) en metres et amperes pour un courant de boucle
/// unite. Selfs partielles et mutuelles de barreaux paralleles (Neumann pour
/// deux filaments de meme longueur, decales le long de leur axe ; la
/// distance moyenne geometrique 0,2235 (w + t) d'un barreau rectangulaire
/// pour sa self et ses voisins colles) :
///
///     M = mu0/4pi [F(s + l) + F(s - l) - 2 F(s)],  F(x) = x asinh(x/d) - sqrt(x^2 + d^2)
///     L = somme_ij I_i I_j M_ij   (directions identiques seulement)
///
/// L'aller et le retour, de signes opposes, se compensent la ou ils se
/// longent : c'est la mutuelle que la somme des deux selfs ignorait.
pub fn _peec_boucle(segs: &[Segment]) -> f64 {
    let mut total = 0.0;
    for ax in 0..3 {
        let s_ax: Vec<&Segment> = segs.iter().filter(|s| s.0 == ax).collect();
        let perp: Vec<usize> = (0..3).filter(|&k| k != ax).collect();
        for a in &s_ax {
            let mut ligne = 0.0;
            for b in &s_ax {
                let s = a.1[ax] - b.1[ax];
                let dist = (a.1[perp[0]] - b.1[perp[0]]).hypot(a.1[perp[1]] - b.1[perp[1]]);
                let gmd = 0.2235 * ((a.3 + b.3) / 2.0 + EP_CUIVRE_M);
                let d = dist.max(gmd);
                let ll = (a.2 + b.2) / 2.0;
                let f = |x: f64| x * (x / d).asinh() - (x * x + d * d).sqrt();
                let m = MU_0 / (4.0 * PI) * (f(s + ll) + f(s - ll) - 2.0 * f(s));
                ligne += m * b.4;
            }
            total += a.4 * ligne;
        }
    }
    total.max(0.0)
}

/// Le plus proche de `cibles` pour chaque requete : (distance, rang). A egalite, le premier
/// -- la ou cKDTree rendait celui que son arbre rencontrait.
fn plus_proches(cibles: &[(f64, f64)], requetes: &[(f64, f64)]) -> Vec<(f64, usize)> {
    requetes
        .iter()
        .map(|q| {
            let (mut d2, mut k) = (f64::INFINITY, 0);
            for (i, c) in cibles.iter().enumerate() {
                let d = (q.0 - c.0) * (q.0 - c.0) + (q.1 - c.1) * (q.1 - c.1);
                if d < d2 {
                    (d2, k) = (d, i);
                }
            }
            (d2.sqrt(), k)
        })
        .collect()
}

/// Le premier indice du minimum (`np.argmin`).
fn argmin(v: impl Iterator<Item = f64>) -> usize {
    let (mut k, mut m) = (0, f64::INFINITY);
    for (i, x) in v.enumerate() {
        if x < m {
            (k, m) = (i, x);
        }
    }
    k
}

/// Le lien d'un ilot a la cavite principale, tel que `_liens_par_reseau` le rend.
#[derive(Debug, Clone, PartialEq)]
pub struct LienIlot {
    /// (noeud ilot, noeud cavite, self H)
    pub liens: Vec<(usize, usize, f64)>,
    pub l: f64,
    pub l_somme: f64,
    pub l_min: f64,
    pub peec: Option<f64>,
}

struct ParNet {
    l: f64,
    segs: Vec<Segment>,
    sortie: Vec<f64>,
    arrivee: Vec<f64>,
    xn: Arc<Vec<f64>>,
    yn: Arc<Vec<f64>>,
    cu_n: Arc<Vec<usize>>,
    plan: usize,
}

/// LE VRAI LIEN DE CHAQUE ILOT, par le cuivre des deux nets sur toutes les
/// couches. Chaque net est un reseau de cellules (meme pas, meme origine que
/// la grille) : un carre de plan vaut mu0 h, une piste L'(w, h) par pas, un
/// percage 0,76 nH/mm d'epaisseur traversee. On met la cavite principale a la
/// masse, on injecte un courant unite reparti sur chaque ilot : le reseau
/// rend le potentiel de l'ilot (sa self, chemins PARALLELES compris) et le
/// courant de chaque lien.
///
/// TROIS CHOSES DE PLUS QU'UNE SOMME DE DEUX SELFS :
///   · LA MUTUELLE. L'aller (un net) et le retour (l'autre) se longent ; leurs
///     courants, lien par lien, passent en barreaux PEEC (`_peec_boucle`) et
///     la self de boucle les compte de signes opposes. On garde la plus
///     petite des deux estimations (PEEC ou somme), toutes deux majorantes ;
///   · LES POINTS D'ENTREE. Le courant ne quitte pas l'ilot partout : on lit
///     ou il en sort et ou il rejoint la cavite, et l'ilot s'y relie (jusqu'a
///     quatre liens en parallele, chacun sa part) -- l'ilot n'est plus un
///     point equipotentiel pour la cavite ;
///   · LES BORNES. Entre le couplage parfait, (sqrt L_A - sqrt L_B)^2, et
///     aucun couplage, L_A + L_B : la fourchette de `traversee_fourchette`.
///
/// Rend {composante: {"liens": [(noeud ilot, noeud cavite, self H)], "L",
/// "L_somme", "L_min", "peec"}} pour les ilots que les DEUX nets rejoignent ;
/// les autres retombent sur l'estimation. Mis en cache.
/// ponytail: les courants de chaque net viennent de SA resolution (sans la
/// mutuelle) -- la PEEC les prend tels quels au lieu de resoudre le systeme
/// couple ; un ilot de moins de 40 cellules garde la somme.
///
/// (Sans le cache du Python : `_grille_preparee`, seule a l'appeler, garde deja le sien.)
#[allow(clippy::too_many_arguments)]
pub fn _liens_par_reseau(reseau: &Reseau, pas: f64, x0: f64, y0: f64, ii: &[i64], jj: &[i64], comp: &[usize], principal: usize) -> HashMap<usize, LienIlot> {
    let vide = HashMap::new();
    let (i1, i2, j1, j2) = (reseau.i1, reseau.i2, reseau.j1, reseau.j2);
    let (w_, h_) = (i2 - i1 + 1, j2 - j1 + 1);
    if w_ <= 0 || h_ <= 0 {
        return vide;
    }
    let ep = &reseau.ep;
    // profondeur des couches
    let mut zc = vec![0.0];
    let mut cumul = 0.0;
    for e in ep {
        cumul += e;
        zc.push(cumul * 1e-3);
    }
    let pas_mm = pas * 1e3;
    let dedans_g: Vec<bool> = ii.iter().zip(jj).map(|(&i, &j)| i >= i1 && i <= i2 && j >= j1 && j <= j2).collect();
    let grille_idx: HashMap<(i64, i64), usize> = ii.iter().zip(jj).enumerate().map(|(k, (&a, &b))| ((a, b), k)).collect();
    let n_comp = comp.iter().copied().max().map_or(0, |m| m + 1);
    let mut taille_c = vec![0usize; n_comp];
    comp.iter().for_each(|&c| taille_c[c] += 1);
    let mut par_net: Vec<HashMap<usize, ParNet>> = Vec::new(); // (L moyen par ilot, segments par ilot, sorties ilot, entrees cavite)
    let cellule = |x: f64, origine: f64| ((x - origine * 1e3) / pas_mm).floor() as i64;
    for net in &reseau.nets {
        let plan = net.plan;
        let nc = 1 + net
            .couches
            .iter()
            .map(|c| c.cu)
            .chain(net.pistes.iter().map(|t| t[0] as usize))
            .chain(net.vias.iter().flat_map(|v| v.2.iter().copied()))
            .fold(plan, usize::max);
        let mut hcu = vec![0.71; nc];
        for c in &net.couches {
            hcu[c.cu] = c.h.filter(|&h| h != 0.0).unwrap_or(0.71);
        }
        // TOUTES LES CELLULES D'UN COUP : plans, pistes, pastilles -- (cu, i, j, largeur)
        let mut cel: Vec<(usize, i64, i64, f64)> = Vec::new();
        let mut partielles: Vec<(usize, i64, i64, f64)> = Vec::new();
        for c in &net.couches {
            let (ci, cj) = _cellules_lignes(&c.lignes);
            cel.extend(ci.iter().zip(&cj).map(|(&i, &j)| (c.cu, i, j, pas_mm)));
            // une cellule couverte en partie (un voile entre deux antipads)
            // garde la largeur de cuivre qu'elle porte
            for &(j, i, part) in &c.fractions {
                partielles.push((c.cu, i, j, part.max(0.02) * pas_mm));
            }
        }
        let mut coins = Vec::new();
        for p in &net.pistes {
            let n_s = (((p[4] - p[2]).hypot(p[5] - p[3]) / (pas_mm / 2.0)).ceil() as usize).max(1);
            let mut precedent: Option<(i64, i64)> = None;
            for k in 0..=n_s {
                let t = k as f64 / n_s as f64;
                let pi_ = cellule(p[2] + (p[4] - p[2]) * t, x0);
                let pj_ = cellule(p[3] + (p[5] - p[3]) * t, y0);
                cel.push((p[0] as usize, pi_, pj_, p[1]));
                // UNE PISTE EN BIAIS passe d'une cellule a sa diagonale : le reseau
                // ne relie que les quatre voisines, on pose la cellule du coin
                if let Some((qi, qj)) = precedent {
                    if pi_ != qi && pj_ != qj {
                        coins.push((p[0] as usize, pi_, qj, p[1]));
                    }
                }
                precedent = Some((pi_, pj_));
            }
        }
        cel.extend(coins);
        let vias: Vec<(f64, f64, Vec<usize>)> = net
            .vias
            .iter()
            .map(|(x, y, cs)| {
                let mut cs = cs.clone();
                cs.sort_unstable();
                cs.dedup();
                (*x, *y, cs)
            })
            .collect();
        for (x, y, cs) in &vias {
            let (i, j) = (cellule(*x, x0), cellule(*y, y0));
            cel.extend(cs.iter().map(|&c| (c, i, j, pas_mm)));
        }
        if cel.is_empty() {
            return vide;
        }
        let lineaire = |cu: usize, i: i64, j: i64| ((cu as i64 * h_ + (j - j1)) * w_ + (i - i1)) as usize;
        let dans = |cu: usize, i: i64, j: i64| i >= i1 && i <= i2 && j >= j1 && j <= j2 && cu < nc;
        let mut lin: Vec<(usize, f64)> = cel.iter().filter(|c| dans(c.0, c.1, c.2)).map(|c| (lineaire(c.0, c.1, c.2), c.3)).collect();
        lin.sort_by(|a, b| a.0.cmp(&b.0).then(a.1.total_cmp(&b.1)));
        let mut uniq: Vec<usize> = Vec::new();
        let mut larg: Vec<f64> = Vec::new();
        for (l, w) in lin {
            if uniq.last() == Some(&l) {
                *larg.last_mut().unwrap_or(&mut 0.0) = w; // triees : la derniere est la plus large
            } else {
                uniq.push(l);
                larg.push(w);
            }
        }
        // une piste qui la traverse peut l'elargir ; sinon sa part fait foi
        let avant = larg.clone();
        for &(cu, i, j, part) in &partielles {
            // (hors de la boite, le rang n'est celui d'aucune cellule)
            if !(i >= i1 && i <= i2 && j >= j1 && j <= j2) {
                continue;
            }
            if let Ok(pos) = uniq.binary_search(&lineaire(cu, i, j)) {
                larg[pos] = if avant[pos] > pas_mm - 1e-9 { part } else { avant[pos].max(part) };
            }
        }
        let n = uniq.len();
        let plan_cellules = (w_ * h_) as usize;
        let mut carte = vec![usize::MAX; nc * plan_cellules];
        uniq.iter().enumerate().for_each(|(k, &u)| carte[u] = k);
        let cu_n: Vec<usize> = uniq.iter().map(|u| u / plan_cellules).collect();
        let reste: Vec<usize> = uniq.iter().map(|u| u % plan_cellules).collect();
        let wu = w_ as usize;
        let xn: Vec<f64> = reste.iter().map(|r| x0 + ((r % wu) as f64 + i1 as f64 + 0.5) * pas).collect();
        let yn: Vec<f64> = reste.iter().map(|r| y0 + ((r / wu) as f64 + j1 as f64 + 0.5) * pas).collect();
        let zn: Vec<f64> = cu_n.iter().map(|&c| zc[c.min(zc.len() - 1)]).collect();
        // les liens : (a, b, self, direction)
        let (mut a_l, mut b_l, mut l_l, mut d_l) = (Vec::new(), Vec::new(), Vec::new(), Vec::new());
        for (ax, (di, dj)) in [(1usize, 0usize), (0, 1)].into_iter().enumerate() {
            for u in 0..n {
                if !(reste[u] % wu + di < wu && reste[u] / wu + dj < h_ as usize) {
                    continue;
                }
                let v = carte[uniq[u] + di + dj * wu];
                if v == usize::MAX {
                    continue;
                }
                let w = larg[u].min(larg[v]);
                let hh = hcu[cu_n[u]];
                // un carre de plan : mu0 h ; un voile ou une bande de largeur w au
                // moins egale a h : mu0 h pas / w ; plus etroit, la self d'une
                // piste (le champ deborde)
                let plein = w >= pas_mm - 1e-9;
                let l = if plein {
                    MU_0 * hh * 1e-3 * 1.0
                } else if w >= hh {
                    MU_0 * hh * 1e-3 * (pas_mm / w.max(1e-6))
                } else {
                    _l_lineique(w, hh) * pas_mm
                };
                a_l.push(u);
                b_l.push(v);
                l_l.push(l);
                d_l.push(ax);
            }
        }
        for (x, y, cs) in &vias {
            let (i, j) = (cellule(*x, x0), cellule(*y, y0));
            if !(i1 <= i && i <= i2 && j1 <= j && j <= j2) {
                continue;
            }
            for p in cs.windows(2) {
                let (ca, cb) = (p[0], p[1]);
                let (u, v) = (carte[lineaire(ca, i, j)], carte[lineaire(cb, i, j)]);
                if u == usize::MAX || v == usize::MAX {
                    continue;
                }
                let e = if cb <= ep.len() { ep[ca..cb].iter().fold(0.0, |s, e| s + e) } else { 0.2 };
                a_l.push(u);
                b_l.push(v);
                l_l.push(0.76e-9 * e.max(0.01));
                d_l.push(2);
            }
        }
        let y_l: Vec<f64> = l_l.iter().map(|l: &f64| 1.0 / l.max(1e-15)).collect();
        if a_l.is_empty() {
            return vide;
        }
        let liens: Vec<(usize, usize)> = a_l.iter().copied().zip(b_l.iter().copied()).collect();

        let cel_plan = |m: usize| carte[lineaire(plan, ii[m], jj[m])];
        let mut est_masse = vec![false; n];
        let mut une_masse = false;
        for m in (0..ii.len()).filter(|&m| dedans_g[m] && comp[m] == principal) {
            let k = cel_plan(m);
            if k != usize::MAX {
                est_masse[k] = true;
                une_masse = true;
            }
        }
        if !une_masse {
            return vide;
        }
        let (n_lab, lab) = composantes(n, &liens);
        let mut lab_masse = vec![false; n_lab];
        (0..n).filter(|&k| est_masse[k]).for_each(|k| lab_masse[lab[k]] = true);
        let libre: Vec<bool> = (0..n).map(|k| lab_masse[lab[k]] && !est_masse[k]).collect();
        let mut seconds = Vec::new();
        let mut quels: Vec<(usize, Vec<usize>)> = Vec::new();
        for c in (0..n_comp).filter(|&c| c != principal && taille_c[c] > 0) {
            let k: Vec<usize> = (0..ii.len()).filter(|&m| dedans_g[m] && comp[m] == c).map(cel_plan).filter(|&k| k != usize::MAX && libre[k]).collect();
            if k.is_empty() {
                continue;
            }
            let mut b = vec![0.0; n];
            k.iter().for_each(|&q| b[q] = 1.0 / k.len() as f64);
            seconds.push(b);
            quels.push((c, k));
        }
        if seconds.is_empty() || !libre.iter().any(|&l| l) {
            return vide;
        }
        let Some(lu) = Facteur::new(n, &liens, &y_l, |k| libre[k]) else {
            return vide;
        };
        let x = lu.resoudre(&seconds);
        // la position et la largeur de chaque lien, pour la PEEC
        let nl = liens.len();
        let cen: Vec<[f64; 3]> = (0..nl).map(|g| [(xn[a_l[g]] + xn[b_l[g]]) / 2.0, (yn[a_l[g]] + yn[b_l[g]]) / 2.0, (zn[a_l[g]] + zn[b_l[g]]) / 2.0]).collect();
        let lon: Vec<f64> = (0..nl).map(|g| if d_l[g] == 2 { (zn[b_l[g]] - zn[a_l[g]]).abs() } else { pas }).collect();
        let lw: Vec<f64> = (0..nl).map(|g| if d_l[g] == 2 { 0.3e-3 } else { larg[a_l[g]].min(larg[b_l[g]]) * 1e-3 }).collect();
        let signe = |v: f64| if v > 0.0 { 1.0 } else if v < 0.0 { -1.0 } else { 0.0 };
        let sens: Vec<f64> = (0..nl).map(|g| if d_l[g] == 2 { signe(zn[b_l[g]] - zn[a_l[g]]) } else { 1.0 }).collect();
        let (xn, yn, cu_n) = (Arc::new(xn), Arc::new(yn), Arc::new(cu_n));
        let mut res_net = HashMap::new();
        for ((c, k_isl), phi) in quels.iter().zip(&x) {
            let flux: Vec<f64> = (0..nl).map(|g| (phi[a_l[g]] - phi[b_l[g]]) * y_l[g]).collect(); // de a vers b
            let i_lien: Vec<f64> = flux.iter().zip(&sens).map(|(f, s)| f * s).collect(); // le long de l'axe
            let l = k_isl.iter().map(|&q| phi[q]).sum::<f64>() / k_isl.len() as f64;
            let mut segs = Vec::new();
            if taille_c[*c] >= PEEC_ILOT_MIN {
                let im_max = i_lien.iter().fold(0.0f64, |m, i| m.max(i.abs()));
                let mut garde: Vec<usize> = if im_max > 0.0 { (0..nl).filter(|&g| i_lien[g].abs() >= PEEC_SEUIL * im_max).collect() } else { Vec::new() };
                if garde.len() > PEEC_MAX {
                    garde.sort_by(|&a, &b| i_lien[b].abs().total_cmp(&i_lien[a].abs()));
                    garde.truncate(PEEC_MAX);
                }
                segs = garde.iter().map(|&g| (d_l[g], cen[g], lon[g], lw[g], i_lien[g])).collect();
            }
            // ou le courant quitte l'ilot, ou il rejoint la cavite (meme couche)
            let mut dans_ilot = vec![false; n];
            k_isl.iter().for_each(|&q| dans_ilot[q] = true);
            let (mut sortie, mut arrivee) = (vec![0.0; n], vec![0.0; n]);
            for g in 0..nl {
                let (a, b) = (a_l[g], b_l[g]);
                if dans_ilot[a] && !dans_ilot[b] {
                    sortie[a] += flux[g].max(0.0);
                }
                if dans_ilot[b] && !dans_ilot[a] {
                    sortie[b] += (-flux[g]).max(0.0);
                }
                if est_masse[b] && !est_masse[a] {
                    arrivee[b] += flux[g].max(0.0);
                }
                if est_masse[a] && !est_masse[b] {
                    arrivee[a] += (-flux[g]).max(0.0);
                }
            }
            res_net.insert(*c, ParNet { l, segs, sortie, arrivee, xn: xn.clone(), yn: yn.clone(), cu_n: cu_n.clone(), plan });
        }
        par_net.push(res_net);
    }

    let nets = par_net.len();
    let principaux: Vec<usize> = (0..comp.len()).filter(|&m| comp[m] == principal).collect();
    let pts: Vec<(f64, f64)> = ii.iter().zip(jj).map(|(&i, &j)| (i as f64, j as f64)).collect();
    let pts_principaux: Vec<(f64, f64)> = principaux.iter().map(|&m| pts[m]).collect();

    // Les noeuds d'un reseau ramenes aux cellules de la grille, par paquets
    // de 2 mm : [(noeud grille, part)], les plus charges d'abord, 4 au plus.
    let vers_grille = |poids: &[f64], r: &ParNet, defaut: &dyn Fn(usize) -> bool| -> Vec<(usize, f64)> {
        let sel: Vec<usize> = (0..poids.len()).filter(|&k| poids[k] > 0.0 && r.cu_n[k] == r.plan).collect();
        if sel.is_empty() {
            return Vec::new();
        }
        let cle_p: Vec<(i64, i64)> = sel.iter().map(|&k| ((r.xn[k] / 2e-3).floor() as i64, (r.yn[k] / 2e-3).floor() as i64)).collect();
        let (np_, inv) = rangs_uniques(&cle_p);
        let mut tot = vec![0.0; np_];
        sel.iter().zip(&inv).for_each(|(&k, &p)| tot[p] += poids[k]);
        let somme: f64 = tot.iter().sum();
        let mut ordre: Vec<usize> = (0..np_).collect();
        ordre.sort_by(|&a, &b| tot[b].total_cmp(&tot[a]));
        let mut out = Vec::new();
        for &p in ordre.iter().take(4) {
            if tot[p] < 0.1 * somme {
                break;
            }
            let mut best = usize::MAX;
            for (q, &k) in sel.iter().enumerate() {
                if inv[q] == p && (best == usize::MAX || poids[k] > poids[best]) {
                    best = k;
                }
            }
            let gi = ((r.xn[best] - x0) / pas).floor() as i64;
            let gj = ((r.yn[best] - y0) / pas).floor() as i64;
            if let Some(&g) = grille_idx.get(&(gi, gj)) {
                if defaut(g) {
                    out.push((g, tot[p] / somme));
                }
            }
        }
        let s: f64 = out.iter().map(|o| o.1).sum();
        if s > 0.0 {
            out.iter().map(|&(g, w)| (g, w / s)).collect()
        } else {
            Vec::new()
        }
    };

    let mut out = HashMap::new();
    let Some(premier) = par_net.first() else {
        return out;
    };
    for &c in premier.keys() {
        if !par_net.iter().all(|r| r.contains_key(&c)) {
            continue;
        }
        let ls: Vec<f64> = par_net.iter().map(|r| r[&c].l).collect();
        let l_somme: f64 = ls.iter().fold(0.0, |s, l| s + l);
        let (l_max, l_plus_petit) = (ls.iter().copied().fold(f64::MIN, f64::max), ls.iter().copied().fold(f64::MAX, f64::min));
        let l_min = if nets == 2 { (l_max.sqrt() - l_plus_petit.sqrt()) * (l_max.sqrt() - l_plus_petit.sqrt()) } else { l_somme };
        let mut segs: Vec<Segment> = Vec::new();
        for (q, r) in par_net.iter().enumerate() {
            let signe = if q == 0 { 1.0 } else { -1.0 }; // l'aller, puis le retour
            segs.extend(r[&c].segs.iter().map(|s| (s.0, s.1, s.2, s.3, signe * s.4)));
        }
        let l_peec = if segs.is_empty() { None } else { Some(_peec_boucle(&segs)) };
        let l = match l_peec {
            Some(p) if p != 0.0 => p.min(l_somme),
            _ => l_somme,
        };
        // les points d'entree, lus sur le net qui pese le plus
        let mut q_dom = 0;
        for q in 1..nets {
            if ls[q] > ls[q_dom] {
                q_dom = q;
            }
        }
        let dom = &par_net[q_dom][&c];
        let mut sorties = vers_grille(&dom.sortie, dom, &|g| comp[g] == c);
        let mut arrivees = vers_grille(&dom.arrivee, dom, &|g| comp[g] == principal);
        if sorties.is_empty() || arrivees.is_empty() {
            let m: Vec<usize> = (0..comp.len()).filter(|&k| comp[k] == c).collect();
            let proches = plus_proches(&pts_principaux, &m.iter().map(|&k| pts[k]).collect::<Vec<_>>());
            let r_ = argmin(proches.iter().map(|p| p.0));
            sorties = vec![(m[r_], 1.0)];
            arrivees = vec![(principaux[proches[r_].1], 1.0)];
        }
        let cible = arrivees[0].0;
        out.insert(c, LienIlot { liens: sorties.iter().map(|&(g, w)| (g, cible, l / w)).collect(), l, l_somme, l_min: l_min.min(l), peec: l_peec });
    }
    out
}

/// La grille preparee : ce qui ne depend ni des ports ni de l'echelle des ilots.
struct Preparee {
    pas: f64,
    ii: Vec<i64>,
    jj: Vec<i64>,
    comp_orig: Vec<usize>,
    taille_orig: Vec<usize>,
    h: f64,
    er: f64,
    f_max: f64,
    lien: Vec<(usize, usize)>,
    l_ilots: Vec<f64>,
    ilots: usize,
    liens_page: usize,
    bornes: HashMap<usize, (f64, f64, f64, bool)>,
    x0: f64,
    y0: f64,
    f_noeud: Vec<usize>,
    f_pos: Vec<(f64, f64)>,
    f_tan: Vec<(f64, f64)>,
    /// les liens du maillage, avant ceux des ilots
    lattice: usize,
    par_comp: Mutex<HashMap<u64, Arc<Composante>>>,
    convergence: Mutex<Option<Option<f64>>>,
}

type CleGrille = (u64, u64, u64, u64);
static _GRILLES: Mutex<Vec<(CleGrille, Arc<Preparee>)>> = Mutex::new(Vec::new());

fn _grille_preparee(grille: &Grille, h: f64, epsilon_r: f64, tan_d: f64, f_max: f64) -> Res<Arc<Preparee>> {
    let mut hacheur = std::collections::hash_map::DefaultHasher::new();
    hacher_lignes(&mut hacheur, &grille.lignes);
    if let Some(r) = &grille.reseau {
        hacher_reseau(&mut hacheur, r);
    }
    (grille.pas.to_bits(), grille.x0.to_bits(), grille.y0.to_bits()).hash(&mut hacheur);
    let cle = (hacheur.finish(), arrondi(h, 9).to_bits(), arrondi(epsilon_r, 6).to_bits(), arrondi(tan_d, 6).to_bits());
    if let Some((_, p)) = _GRILLES.lock().unwrap_or_else(|e| e.into_inner()).iter().find(|(k, _)| *k == cle) {
        return Ok(p.clone());
    }
    let pas = grille.pas * 1e-3;
    let (ii, jj) = _cellules_lignes(&grille.lignes);
    let n = ii.len();
    if n == 0 {
        return refus("grille vide");
    }
    // (une cellule envoyee deux fois : la derniere porte les liens, comme le dict du Python)
    let mut index: HashMap<(i64, i64), usize> = HashMap::new();
    let mut cles: Vec<(i64, i64)> = Vec::new();
    for k in 0..n {
        if index.insert((ii[k], jj[k]), k).is_none() {
            cles.push((ii[k], jj[k]));
        }
    }
    let mut lien: Vec<(usize, usize)> = Vec::new();
    for (di, dj) in [(1, 0), (0, 1)] {
        for &(a, b) in &cles {
            if let Some(&v) = index.get(&(a + di, b + dj)) {
                lien.push((index[&(a, b)], v));
            }
        }
    }
    let x0 = grille.x0 * 1e-3;
    let y0 = grille.y0 * 1e-3;

    // LES BORDS EXTERIEURS : une face de cellule qui donne sur le vide relie a
    // l'exterieur. Les trous enclos (antipads, degagements) ne rayonnent pas
    // et ne debordent guere : ils sont exclus.
    let (i0, j0) = (ii.iter().copied().min().unwrap_or(0), jj.iter().copied().min().unwrap_or(0));
    let ni = (ii.iter().copied().max().unwrap_or(0) - i0 + 3) as usize;
    let nj = (jj.iter().copied().max().unwrap_or(0) - j0 + 3) as usize;
    let case = |i: i64, j: i64| (i - i0 + 1) as usize * nj + (j - j0 + 1) as usize;
    let mut masque = vec![false; ni * nj];
    (0..n).for_each(|k| masque[case(ii[k], jj[k])] = true);
    // le vide exterieur : ce que l'on atteint depuis le bord sans traverser le cuivre
    let mut ext = vec![false; ni * nj];
    let mut pile = vec![0usize];
    ext[0] = true;
    while let Some(p) = pile.pop() {
        let (a, b) = (p / nj, p % nj);
        let mut voisin = |a: usize, b: usize| {
            let q = a * nj + b;
            if !masque[q] && !ext[q] {
                ext[q] = true;
                pile.push(q);
            }
        };
        if a > 0 {
            voisin(a - 1, b);
        }
        if a + 1 < ni {
            voisin(a + 1, b);
        }
        if b > 0 {
            voisin(a, b - 1);
        }
        if b + 1 < nj {
            voisin(a, b + 1);
        }
    }
    let (mut f_noeud, mut f_pos, mut f_tan) = (Vec::new(), Vec::new(), Vec::new());
    for (di, dj) in [(1i64, 0i64), (-1, 0), (0, 1), (0, -1)] {
        for k in 0..n {
            if ext[case(ii[k] + di, jj[k] + dj)] {
                f_noeud.push(k);
                f_pos.push((x0 + (ii[k] as f64 + 0.5 + di as f64 / 2.0) * pas, y0 + (jj[k] as f64 + 0.5 + dj as f64 / 2.0) * pas));
                f_tan.push((-dj as f64, di as f64));
            }
        }
    }

    let (ncomp, comp) = composantes(n, &lien);
    let mut taille0 = vec![0usize; ncomp];
    comp.iter().for_each(|&c| taille0[c] += 1);
    let mut l_ilots = Vec::new();
    let mut liens_page = 0;
    let mut bornes = HashMap::new();
    let n_maillage = lien.len(); // les liens du maillage, avant ceux des ilots
    if ncomp > 1 {
        let pts: Vec<(f64, f64)> = (0..n).map(|k| (ii[k] as f64 * pas, jj[k] as f64 * pas)).collect();
        // (tri stable : a tailles egales, l'ordre des etiquettes)
        let mut ordre: Vec<usize> = (0..ncomp).collect();
        ordre.sort_by(|&a, &b| taille0[b].cmp(&taille0[a]));
        let principal = ordre[0];
        // le vrai lien de chaque ilot, par le cuivre des nets (la page en
        // envoie le reseau) ; a defaut, l'estimation a 1 nH/mm
        let donnes = match &grille.reseau {
            Some(reseau) => _liens_par_reseau(reseau, pas, x0, y0, &ii, &jj, &comp, principal),
            None => HashMap::new(),
        };
        let mut relie: Vec<usize> = (0..n).filter(|&k| comp[k] == principal).collect();
        for &c in &ordre[1..] {
            let membres: Vec<usize> = (0..n).filter(|&k| comp[k] == c).collect();
            if let Some(d) = donnes.get(&c) {
                // le vrai lien : aux points ou le courant quitte l'ilot, chacun
                // sa part, et ses bornes (couplage parfait / sans couplage)
                for &(a, b, l_e) in &d.liens {
                    lien.push((a, b));
                    l_ilots.push(l_e);
                }
                bornes.insert(c, (d.l_min / d.l, d.l_somme / d.l, d.l, d.peec.is_some()));
                liens_page += 1;
            } else {
                let proches = plus_proches(&relie.iter().map(|&k| pts[k]).collect::<Vec<_>>(), &membres.iter().map(|&k| pts[k]).collect::<Vec<_>>());
                let m = argmin(proches.iter().map(|p| p.0));
                lien.push((membres[m], relie[proches[m].1]));
                l_ilots.push(ILOT_H_PAR_M * proches[m].0);
            }
            relie.extend(membres);
        }
    }
    let prep = Arc::new(Preparee {
        pas,
        ii,
        jj,
        comp_orig: comp,
        taille_orig: taille0,
        h,
        er: epsilon_r,
        f_max,
        lien,
        l_ilots,
        ilots: ncomp - 1,
        liens_page,
        bornes,
        x0,
        y0,
        f_noeud,
        f_pos,
        f_tan,
        lattice: n_maillage,
        par_comp: Mutex::new(HashMap::new()),
        convergence: Mutex::new(None),
    });
    let mut grilles = _GRILLES.lock().unwrap_or_else(|e| e.into_inner());
    if grilles.len() >= _GRILLES_MAX {
        grilles.remove(0);
    }
    grilles.push((cle, prep.clone()));
    Ok(prep)
}

/// La premiere resonance d'un maillage nu (sans debordement), pour juger
/// la convergence. Hz, ou None.
pub fn _premier_mode(ii: &[i64], jj: &[i64], pas: f64, h: f64, er: f64) -> Option<f64> {
    let index: HashMap<(i64, i64), usize> = ii.iter().zip(jj).enumerate().map(|(k, (&a, &b))| ((a, b), k)).collect();
    let mut lk = Vec::new();
    for (di, dj) in [(1, 0), (0, 1)] {
        for k in 0..ii.len() {
            if let Some(&v) = index.get(&(ii[k] + di, jj[k] + dj)) {
                lk.push((index[&(ii[k], jj[k])], v));
            }
        }
    }
    let n = index.len();
    if n < 8 || lk.is_empty() {
        return None;
    }
    let (ncomp, comp) = composantes(ii.len(), &lk);
    let mut taille = vec![0usize; ncomp];
    comp.iter().for_each(|&c| taille[c] += 1);
    let gros = (0..ncomp).fold(0, |g, c| if taille[c] > taille[g] { c } else { g });
    let mut loc = vec![usize::MAX; ii.len()];
    let mut m = 0;
    for k in 0..ii.len() {
        if comp[k] == gros {
            loc[k] = m;
            m += 1;
        }
    }
    let lk: Vec<(usize, usize)> = lk.iter().filter(|l| comp[l.0] == gros).map(|l| (loc[l.0], loc[l.1])).collect();
    if m < 4 {
        return None;
    }
    let w = vec![1.0 / (MU_0 * h); lk.len()];
    let (lam, _) = modes_propres(m, &lk, &w, &vec![EPSILON_0 * er * pas * pas / h; m], 2)?;
    let max = lam.iter().copied().fold(1.0, f64::max);
    lam.iter().find(|&&l| l > 1e-6 * max).map(|l| l.sqrt() / (2.0 * PI))
}

/// Modes, capacite et factorisation de la cavite, une fois.
struct Composante {
    c_tot: f64,
    c_vec: Vec<f64>,
    phi0: f64,
    lam: Vec<f64>,
    /// un vecteur par mode
    vec: Vec<Vec<f64>>,
    lu: Option<Facteur>,
    colonnes: Mutex<HashMap<usize, Arc<Vec<f64>>>>,
    n: usize,
    inv_q_rad: Vec<f64>,
    f_loc: Vec<usize>,
    f_pos: Vec<(f64, f64)>,
    paquets: Paquets,
    convergence: Option<f64>,
}

/// Modes, capacite et factorisation d'une composante connexe, une fois.
///
/// LES BORDS DEBORDENT ET RAYONNENT. Chaque face exterieure ajoute la
/// capacite de debordement d'un bord de patch (allongement 0,412 h (er+0,3)
/// /(er-0,258), Hammerstad, large devant h) ; et chaque mode perd par ses
/// bords la puissance que `_rayonnement_bords` calcule sur sa forme propre,
/// soit 1/Q_rad = P / (w W). Les pics qui sortaient a plusieurs centaines
/// d'ohms n'avaient que les pertes du dielectrique et du cuivre.
///
/// (Les ilots sont relies a la cavite principale par leurs liens : il n'y a qu'UNE
/// composante, celle de tous les noeuds -- `prep["comp"]` ne valait que des zeros.)
fn _composante(prep: &Preparee, echelle_ilots: f64) -> Res<Arc<Composante>> {
    let cle_c = arrondi(echelle_ilots, 6).to_bits();
    if let Some(c) = prep.par_comp.lock().unwrap_or_else(|e| e.into_inner()).get(&cle_c) {
        return Ok(c.clone());
    }
    let n = prep.ii.len();
    let (h, pas, er) = (prep.h, prep.pas, prep.er);
    let c_cel = EPSILON_0 * er * pas * pas / h;
    // les liens du maillage, puis ceux des ilots (leur self a l'echelle)
    let mut poids = vec![1.0 / (MU_0 * h); prep.lattice];
    poids.extend(prep.l_ilots.iter().map(|l| 1.0 / (MU_0 * h + echelle_ilots * l)));
    let c_face = EPSILON_0 * er * 0.412 * (er + 0.3) / (er - 0.258) * pas;
    let f_loc = prep.f_noeud.clone();
    let (f_pos, f_tan) = (prep.f_pos.clone(), &prep.f_tan);
    let paquets = _paquets_bord(&f_pos, f_tan, pas);
    let mut faces = vec![0usize; n];
    f_loc.iter().for_each(|&k| faces[k] += 1);
    let c_vec: Vec<f64> = faces.iter().map(|&k| c_cel + c_face * k as f64).collect();
    let c_tot: f64 = c_vec.iter().sum();
    let phi0 = 1.0 / c_tot.sqrt();
    // LES MODES de la bande : Weyl en donne le nombre, plus une marge
    let aire = n as f64 * pas * pas;
    let k = (n.saturating_sub(2) as f64).min(1.5 * aire * PI * prep.f_max * prep.f_max * er / (C_0 * C_0) + 24.0) as usize;
    let (mut lam, mut vec) = (Vec::new(), Vec::new());
    if k >= 2 {
        // le mode statique a part : les k - 1 suivants
        let Some((l, v)) = modes_propres(n, &prep.lien, &poids, &c_vec, k - 1) else {
            return refus("cavite maillee : les modes propres n'ont pas converge");
        };
        let max = l.iter().copied().fold(1.0, f64::max);
        for (l, v) in l.into_iter().zip(v) {
            if l > 1e-6 * max && l.sqrt() / (2.0 * PI) <= prep.f_max {
                lam.push(l);
                vec.push(v);
            }
        }
    }
    let f_mn: Vec<f64> = lam.iter().map(|l| l.sqrt() / (2.0 * PI)).collect();
    let mut inv_q_rad = vec![0.0; lam.len()];
    if !lam.is_empty() && !f_loc.is_empty() {
        for m in 0..lam.len() {
            let v: Vec<Complex64> = f_loc.iter().map(|&k| Complex64::new(vec[m][k], 0.0)).collect();
            let (p, _) = _rayonnement_bords(&[f_mn[m]], &paquets, &[v]);
            inv_q_rad[m] = p[0] / (2.0 * PI * f_mn[m] * 0.5);
        }
    }
    // LA CONVERGENCE : la meme cavite au pas double (cellules 2 x 2 gardees a
    // moitie pleines). L'erreur du pas fin vaut le tiers de l'ecart (ordre 2).
    // Une fois par composante : elle ne depend pas de l'echelle des ilots.
    let conv = *prep.convergence.lock().unwrap_or_else(|e| e.into_inner()).get_or_insert_with(|| {
        let mut gros: HashMap<(i64, i64), usize> = HashMap::new();
        (0..n).for_each(|k| *gros.entry((prep.ii[k].div_euclid(2), prep.jj[k].div_euclid(2))).or_insert(0) += 1);
        let mut gros: Vec<(i64, i64)> = gros.into_iter().filter(|g| g.1 >= 2).map(|g| g.0).collect();
        gros.sort_unstable();
        let f_fin = _premier_mode(&prep.ii, &prep.jj, pas, h, er).filter(|&f| f != 0.0)?;
        let (gi, gj): (Vec<i64>, Vec<i64>) = gros.into_iter().unzip();
        let f_gros = _premier_mode(&gi, &gj, 2.0 * pas, h, er).filter(|&f| f != 0.0)?;
        Some((f_gros - f_fin).abs() / f_fin / 3.0)
    });
    // la queue : K mis a la masse a un noeud, factorise une fois
    let lu = if n > 1 { Facteur::new(n, &prep.lien, &poids, |i| i != 0) } else { None };
    if n > 1 && lu.is_none() {
        return refus("cavite maillee : reseau singulier");
    }
    let out = Arc::new(Composante { c_tot, c_vec, phi0, lam, vec, lu, colonnes: Mutex::new(HashMap::new()), n, inv_q_rad, f_loc, f_pos, paquets, convergence: conv });
    prep.par_comp.lock().unwrap_or_else(|e| e.into_inner()).insert(cle_c, out.clone());
    Ok(out)
}

/// G e_j = (K+ sur le complement du mode statique) e_j, mis en cache.
fn _colonne_g(cp: &Composante, j: usize) -> Arc<Vec<f64>> {
    if let Some(x) = cp.colonnes.lock().unwrap_or_else(|e| e.into_inner()).get(&j) {
        return x.clone();
    }
    let mut b: Vec<f64> = cp.c_vec.iter().map(|c| -cp.phi0 * c * cp.phi0).collect();
    b[j] += 1.0;
    let mut x = match &cp.lu {
        Some(lu) => lu.resoudre(&[b]).remove(0),
        None => vec![0.0; cp.n],
    };
    let p: f64 = cp.c_vec.iter().zip(&x).map(|(c, x)| cp.phi0 * (c * x)).sum();
    x.iter_mut().for_each(|x| *x -= cp.phi0 * p);
    let x = Arc::new(x);
    cp.colonnes.lock().unwrap_or_else(|e| e.into_inner()).insert(j, x.clone());
    x
}

/// Ce qu'il faut pour lire les tensions de bord de la cavite maillee (`cav["bord"]`) :
/// `kappa` (modes x faces), `queue` (faces x ports), la position de chaque face.
#[derive(Debug, Clone, Default)]
pub struct Bord {
    pub kappa: Vec<Vec<f64>>,
    pub queue: Vec<Vec<f64>>,
    pub pos: Vec<(f64, f64)>,
    pub paquets: Paquets,
    pub dedans: Vec<f64>,
}

/// La cavite MAILLEE : meme dict que `cavite_modale`, ports [(x, y, w)] en
/// metres dans le repere de la carte. `echelle_ilots` multiplie la self des
/// liens entre ilots (la fourchette de `traversee_fourchette`).
///
/// Les defauts du Python : `f_max` = FREQ_MAX_MODES, `echelle_ilots` = 1.
pub fn cavite_grille(grille: &Grille, h: f64, epsilon_r: f64, tan_d: f64, ports: &[(f64, f64, f64)], f_max: f64, echelle_ilots: f64) -> Res<Cavite> {
    let prep = _grille_preparee(grille, h, epsilon_r.max(1.0), tan_d, f_max)?;
    let pas = prep.pas;
    let n = prep.ii.len();
    let cx: Vec<f64> = prep.ii.iter().map(|&i| prep.x0 + (i as f64 + 0.5) * pas).collect();
    let cy: Vec<f64> = prep.jj.iter().map(|&j| prep.y0 + (j as f64 + 0.5) * pas).collect();
    // LE PORT TOUCHE LE PLUS GROS CUIVRE A 1,5 MM, pas le noeud le plus
    // proche : un cou de cuivre plus etroit que la maille disparait au
    // maillage, et le via, au centre de son antipad, tombait sur une miette de
    // 41 cellules (P01x291, 2,8 kohm au lieu de 20 ohm).
    let taille = &prep.taille_orig;
    let co = &prep.comp_orig;
    let taille_max = taille.iter().copied().max().unwrap_or(0);

    // PLUS LOIN, RIEN EN REGARD : les deux plans sont la, mais pas l'un sur
    // l'autre (P01x291, D5 : GND d'un cote du via, VDDIO de l'autre). Le
    // retour rejoint la cavite en s'etalant sur l'ecart : on s'y accroche et
    // cet etalement s'ajoute en serie (`ecart`).
    let mut ecart = vec![0.0; ports.len()];

    let mut noeud = Vec::with_capacity(ports.len());
    for (i, &(x, y, _)) in ports.iter().enumerate() {
        let d2: Vec<f64> = (0..n).map(|k| (cx[k] - x) * (cx[k] - x) + (cy[k] - y) * (cy[k] - y)).collect();
        let rayon = 1.5e-3f64.max(2.0 * pas);
        let pres: Vec<usize> = (0..n).filter(|&k| d2[k] <= rayon * rayon).collect();
        if pres.is_empty() {
            let gros: Vec<usize> = (0..n).filter(|&k| taille[co[k]] == taille_max).collect();
            let k = gros[argmin(gros.iter().map(|&k| d2[k]))];
            ecart[i] = d2[k].sqrt();
            noeud.push(k);
            continue;
        }
        let plus_gros = pres.iter().map(|&k| taille[co[k]]).max().unwrap_or(0);
        let gros: Vec<usize> = pres.into_iter().filter(|&k| taille[co[k]] == plus_gros).collect();
        noeud.push(gros[argmin(gros.iter().map(|&k| d2[k]))]);
    }
    let Some(&noeud0) = noeud.first() else {
        return refus("cavite maillee : aucun port");
    };
    let cp = _composante(&prep, echelle_ilots)?;
    let loc = &noeud;
    let p_ = ports.len();
    let nm = cp.lam.len();
    let rc = cp.c_tot.sqrt();
    let mut kappa = vec![vec![0.0; p_]; nm];
    let mut lq = vec![vec![0.0; p_]; p_];
    let mut queue_bord = vec![vec![0.0; p_]; cp.f_loc.len()];
    for i in 0..p_ {
        for m in 0..nm {
            kappa[m][i] = cp.vec[m][loc[i]] * rc;
        }
        let g = _colonne_g(&cp, loc[i]);
        for (e, &k) in cp.f_loc.iter().enumerate() {
            queue_bord[e][i] = g[k];
        }
        for jx in 0..p_ {
            lq[i][jx] = g[loc[jx]];
        }
    }
    // la queue = G moins les modes gardes en dynamique
    for m in 0..nm {
        let v: Vec<f64> = loc.iter().map(|&l| cp.vec[m][l]).collect();
        for i in 0..p_ {
            for j in 0..p_ {
                lq[i][j] -= v[i] / cp.lam[m] * v[j];
            }
        }
        for (e, &k) in cp.f_loc.iter().enumerate() {
            let ve = cp.vec[m][k] / cp.lam[m];
            for j in 0..p_ {
                queue_bord[e][j] -= ve * v[j];
            }
        }
    }
    // PEACEMAN : un noeud de la grille vaut un contact de rayon 0,1985 pas ; un
    // via plus fin s'etale en plus de mu0 h / 2pi ln(r_eq / r), une pastille
    // plus large en moins (borne pour garder une self propre positive)
    for (i, &(_, _, wp)) in ports.iter().enumerate() {
        let r = wp.max(PORT_MIN) / 2.0;
        let d = MU_0 * h / (2.0 * PI) * (PEACEMAN * pas / r).ln();
        lq[i][i] = (lq[i][i] + d).max(0.1 * lq[i][i]);
        lq[i][i] += if ecart[i] != 0.0 { inductance_etalement_via_via(h, ecart[i], 2.0 * r) } else { 0.0 };
    }
    let f_mn: Vec<f64> = cp.lam.iter().map(|l| l.sqrt() / (2.0 * PI)).collect();
    let q_max = cp.inv_q_rad.iter().copied().fold(0.0, f64::max);
    let premier_gros = (0..taille.len()).fold(0, |g, c| if taille[c] > taille[g] { c } else { g });
    Ok(Cavite {
        c: cp.c_tot,
        tan_d,
        kappa,
        poids: vec![1.0; nm],
        w_mn: f_mn.iter().map(|f| 2.0 * PI * f).collect(),
        inv_q: (0..nm).map(|m| tan_d + 1.0 / (PI * f_mn[m].max(1.0) * MU_0 * SIGMA_CU).sqrt() / h + cp.inv_q_rad[m]).collect(),
        l_queue: lq,
        statique: vec![vec![1.0; p_]; p_],
        f_premier: f_mn.iter().copied().reduce(f64::min),
        noeuds: cp.n,
        hors: 0,
        ilots: prep.ilots,
        liens_page: prep.liens_page,
        bornes_ilot: prep.bornes.get(&co[noeud0]).copied(),
        sur_ilot: co[noeud0] != premier_gros,
        ecart_via_mm: arrondi(ecart[0] * 1e3, 2),
        convergence: cp.convergence,
        q_rad_min: (q_max > 0.0).then(|| 1.0 / q_max),
        bord: Some(Bord {
            kappa: cp.vec.iter().map(|v| cp.f_loc.iter().map(|&k| v[k] * rc).collect()).collect(),
            queue: queue_bord,
            pos: cp.f_pos.clone(),
            paquets: cp.paquets.clone(),
            dedans: vec![1.0; p_],
        }),
    })
}

/// Le champ que la cavite rayonne par ses bords pour un courant de retour
/// UNITE (1 A crete) dans le via, les ponts termines : E maximal a 1 m en V/m
/// et puissance en W, a chaque frequence. Les tensions de bord se lisent sur
/// le meme reseau a ports que la traversee.
pub fn rayonnement_cavite(freqs: &[f64], param: &Traversee) -> (Vec<f64>, Vec<f64>) {
    let nuls = (vec![0.0; freqs.len()], vec![0.0; freqs.len()]);
    let Some(cav) = &param.modal else { return nuls };
    let Some(bd) = cav.bord.as_ref().filter(|bd| !bd.pos.is_empty()) else { return nuls };
    let (_, i_l) = _traversee_modale_vec(freqs, param);
    let ne = bd.pos.len();
    let mut v = Vec::with_capacity(freqs.len());
    for (f, i_l) in freqs.iter().zip(&i_l) {
        let mut i_ports = vec![Complex64::new(1.0, 0.0)];
        i_ports.extend(i_l);
        let w = 2.0 * PI * f.max(1e-3);
        let g = poids_modes(w, cav);
        let stat = 1.0 / (w * cav.c * Complex64::new(cav.tan_d, 1.0));
        let commun: Complex64 = i_ports.iter().zip(&bd.dedans).map(|(i, d)| stat * *d * i).sum();
        let mut ve = vec![commun; ne];
        for (m, g) in g.iter().enumerate() {
            let a: Complex64 = g * cav.kappa[m].iter().zip(&i_ports).map(|(k, i)| *k * i).sum::<Complex64>();
            for e in 0..ne {
                ve[e] += bd.kappa[m][e] * a;
            }
        }
        for e in 0..ne {
            let q: Complex64 = bd.queue[e].iter().zip(&i_ports).map(|(q, i)| *q * i).sum();
            ve[e] += Complex64::new(0.0, w) * q;
        }
        v.push(ve);
    }
    let (p, e) = _rayonnement_bords(freqs, &bd.paquets, &v);
    (e, p)
}
