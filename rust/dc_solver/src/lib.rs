//! Chute de tension continue dans le cuivre -- IR drop : le portage de python/dc_solver.py (2.3.0).
//!
//! CE N'EST PAS DE L'ELECTROMAGNETISME. Pas de frequence, pas de champ : un
//! probleme resistif reel sur les formes de cuivre, a matrice symetrique definie
//! positive. Un gradient conjugue et rien de plus.
//!
//!     let barreau = loads(r#"[{"vertices": [[0, 0], [10e-3, 0], [10e-3, 1e-3], [0, 1e-3]],
//!                              "couche": 0, "net": "VCC", "epaisseur": 35e-6}]"#)?;
//!     let sources = loads(r#"[{"x": 0.2e-3, "y": 0.5e-3, "couche": 0, "net": "VCC", "courant": 1.0, "rayon": 0.2e-3}]"#)?;
//!     let references = loads(r#"[{"x": 9.8e-3, "y": 0.5e-3, "couche": 0, "net": "VCC", "rayon": 0.2e-3}]"#)?;
//!     let r = resoudre_dc(&barreau, &Entrees { sources: Some(&sources), references: Some(&references),
//!                                              pas: Some(0.1e-3), ..Entrees::default() }, None)?;
//!     r["chute_par_net"]["VCC"]        // 0.0047 V
//!
//! TOUTES LES LONGUEURS SONT EN METRES ici, comme dans ligne_mom. C'est
//! `resoudre_document` qui convertit depuis les millimetres du document
//! d'echange, et c'est le seul endroit ou la conversion a lieu.
//!
//! Les documents et les resultats sont des valeurs JSON (`Json`, de la caisse ipc2581 : les
//! dict de Python, ordre des cles compris) : ce sont elles qui arrivent des pages et y
//! repartent, et `dumps` les ecrit comme json.dumps. Ce que scipy faisait est dans `creuse`
//! (matrice CSR, gradient conjugue, plus proche voisin) et `bessel` (K0, K1).

mod bessel;
mod creuse;
pub mod pyth;

pub use bessel::{k0e, k1e};
pub use ipc2581::py::{dumps, Json, Objet};
pub use pyth::loads;

use creuse::{gradient_conjugue, Csr, PlusProche};
use ipc2581::py;
use pyth::{elements, float_py, fmt_g, int_py, len_py, max_py, min_py, objet, str_py, ErreurPy, Py};
use std::collections::BTreeSet;
use std::f64::consts::PI;
use std::fmt;
use std::time::Instant;

pub const RESISTIVITE_CUIVRE: f64 = 1.724e-8; // ohm.m a 20 degres, cuivre recuit (IPC)
pub const EPAISSEUR_DEFAUT: f64 = 35e-6; // une once de cuivre
pub const PLACAGE_DEFAUT: f64 = 25e-6; // placage de trou metallise courant

// Le maillage est le seul reglage qui coute : le nombre de noeuds va comme
// 1/pas^2. Ces bornes sont la pour qu'une trame demandee trop fine ne parte pas
// en memoire sans le dire -- c'est un refus explicite, pas un ecretage muet.
pub const MAX_NOEUDS: usize = 400000;
pub const FORMAT: &str = "cao-sim-dc-1";
pub const FORMAT_RESULTAT: &str = "cao-sim-dc-resultat-1";
pub const VERSION: &str = "2.3.0";
pub const VERSION_MOTEURS: [(&str, &str); 1] = [("dc_solver", VERSION)];

/// Un dict de Python, cle par cle dans l'ordre.
macro_rules! objet {
    ($($cle:expr => $valeur:expr),* $(,)?) => {{
        #[allow(unused_mut)]
        let mut o = Objet::new();
        $( o.insert($cle.to_string(), Json::from($valeur)); )*
        Json::Objet(o)
    }};
}

fn liste_f(v: &[f64]) -> Json {
    Json::Liste(v.iter().map(|x| Json::Flottant(*x)).collect())
}

fn liste_t<T: AsRef<str>>(v: &[T]) -> Json {
    Json::Liste(v.iter().map(|x| Json::Texte(x.as_ref().to_string())).collect())
}

fn moteurs() -> Json {
    Json::Objet(VERSION_MOTEURS.iter().map(|(k, v)| (k.to_string(), Json::from(*v))).collect())
}

/// Un refus qui dit ce qu'il faut changer, comme ErreurSimulation.
#[derive(Debug, Clone, PartialEq)]
pub struct ErreurDC {
    pub message: String,
    pub conseil: String,
}

impl ErreurDC {
    pub fn new(message: impl Into<String>, conseil: &str) -> Self {
        ErreurDC { message: message.into(), conseil: conseil.to_string() }
    }
}

impl fmt::Display for ErreurDC {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        f.write_str(&self.message)
    }
}

impl std::error::Error for ErreurDC {}

/// Un champ d'un autre type que prevu : le refus que `resoudre_document` en fait.
/// shortcut: hors de la lecture du document (resoudre_dc appele directement, `couches_externes`),
/// Python laissait sortir le TypeError nu (une erreur 500) ; ici c'est le meme refus partout.
impl From<ErreurPy> for ErreurDC {
    fn from(exc: ErreurPy) -> Self {
        ErreurDC::new(format!("Document illisible : {}", exc.0),
                      "Les sommets sont des couples de nombres, les autres champs des nombres.")
    }
}

/// Ce que le serveur sait calculer : la page le demande avant de lancer.
pub fn etat() -> Json {
    objet! {
        "dispo" => true, "format" => FORMAT, "resultat" => FORMAT_RESULTAT,
        "version" => VERSION,
        "moteurs" => moteurs(),
        "methode" => "réseau résistif surfacique, gradient conjugué",
        "modeles_thermiques" => liste_t(&MODELES_THERMIQUES),
        "max_noeuds" => MAX_NOEUDS,
    }
}

// --------------------------------------------------------------------------
// Les `.get` du document, comme Python les enchainait
// --------------------------------------------------------------------------

/// `o.get(a, o.get(b, defaut)) or defaut` : la valeur, si elle est vraie.
fn vraie<'a>(o: &'a Objet, a: &str, b: &str) -> Option<&'a Json> {
    o.get(a).or_else(|| o.get(b)).filter(|v| v.vrai())
}

/// `o.get(a) or o.get(b)`
fn ou<'a>(o: &'a Objet, a: &str, b: &str) -> Option<&'a Json> {
    o.get(a).filter(|v| v.vrai()).or_else(|| o.get(b))
}

/// `float(o.get(a, o.get(b, defaut)) or defaut)`
fn flottant(o: &Objet, a: &str, b: &str, defaut: f64) -> Py<f64> {
    vraie(o, a, b).map_or(Ok(defaut), float_py)
}

/// `int(o.get(a, o.get(b, 0)) or 0)`
fn entier(o: &Objet, a: &str, b: &str) -> Py<i64> {
    vraie(o, a, b).map_or(Ok(0), int_py)
}

/// `str(o.get(a) or o.get(b) or defaut)`
fn texte(o: &Objet, a: &str, b: &str, defaut: &str) -> String {
    ou(o, a, b).filter(|v| v.vrai()).map_or(defaut.to_string(), str_py)
}

/// `bool(o.get(cle))`
fn drapeau(o: &Objet, cle: &str) -> bool {
    o.get(cle).is_some_and(Json::vrai)
}

/// `x is not None`
fn present<'a>(o: &'a Objet, cle: &str) -> Option<&'a Json> {
    o.get(cle).filter(|v| !matches!(v, Json::Nul))
}

/// `liste or []`, puis l'iteration.
fn elements_ou_rien(v: Option<&Json>) -> Py<Vec<Json>> {
    match v.filter(|v| v.vrai()) {
        Some(v) => Ok(elements(v)?.into_owned()),
        None => Ok(Vec::new()),
    }
}

// ==========================================================================
// La geometrie
// ==========================================================================

/// Le point est-il dans le polygone ? Lancer de rayon, pair/impair.
pub fn dans_polygone(x: f64, y: f64, sommets: &[(f64, f64)]) -> bool {
    let mut dedans = false;
    let n = sommets.len();
    let mut j = n.wrapping_sub(1);
    for i in 0..n {
        let (xi, yi) = sommets[i];
        let (xj, yj) = sommets[j];
        if (yi > y) != (yj > y) {
            let t = if yj != yi { (y - yi) / (yj - yi) } else { 0.0 };
            if x < xi + t * (xj - xi) {
                dedans = !dedans;
            }
        }
        j = i;
    }
    dedans
}

/// Les cases (ix, iy) de la fenetre dont le centre est dans le polygone,
/// ix puis iy croissants. Le test est vectorise sur la fenetre --
/// meme parite, meme formule que `_dans_polygone` : un plan de 1000 sommets
/// au pas de 0,5 mm prenait 22 s en Python pur.
pub fn cases_dedans(sommets: &[(f64, f64)], x0: f64, y0: f64, pas: f64, i0: i64, i1: i64, j0: i64, j1: i64) -> Vec<(i64, i64)> {
    let mut out = Vec::new();
    for ix in i0..=i1 {
        let x = x0 + ix as f64 * pas;
        for iy in j0..=j1 {
            if dedans(x, y0 + iy as f64 * pas, sommets) {
                out.push((ix, iy));
            }
        }
    }
    out
}

/// Le point est-il dans le polygone ? La formule que numpy appliquait a toute la fenetre.
fn dedans(x: f64, y: f64, sommets: &[(f64, f64)]) -> bool {
    let mut dedans = false;
    let n = sommets.len();
    let mut j = n.wrapping_sub(1);
    for i in 0..n {
        let (xi, yi) = sommets[i];
        let (xj, yj) = sommets[j];
        if yj != yi {
            dedans ^= ((yi > y) != (yj > y)) & (x < xi + ((y - yi) / (yj - yi)) * (xj - xi));
        }
        j = i;
    }
    dedans
}

/// (min x, max x, min y, max y) d'une suite de sommets, comme min() et max() de Python.
fn etendue(sommets: &[(f64, f64)]) -> (f64, f64, f64, f64) {
    let (mut xa, mut xb, mut ya, mut yb) = (sommets[0].0, sommets[0].0, sommets[0].1, sommets[0].1);
    for &(x, y) in &sommets[1..] {
        (xa, xb, ya, yb) = (min_py(xa, x), max_py(xb, x), min_py(ya, y), max_py(yb, y));
    }
    (xa, xb, ya, yb)
}

fn boite(polygones: &[Polygone]) -> (f64, f64, f64, f64) {
    let tous: Vec<(f64, f64)> = polygones.iter().flat_map(|p| p.sommets.iter().copied()).collect();
    let (xa, xb, ya, yb) = etendue(&tous);
    (xa, ya, xb, yb)
}

/// Un polygone du document, dans la forme interne, en metres.
#[derive(Debug, Clone, PartialEq)]
pub struct Polygone {
    pub sommets: Vec<(f64, f64)>,
    pub couche: i64,
    pub net: String,
    pub epaisseur: f64,
    pub trou: bool,
}

/// Les polygones du document -> la forme interne, en metres.
pub fn normaliser(polygones: &Json) -> Py<Vec<Polygone>> {
    let mut out = Vec::new();
    for p in elements_ou_rien(Some(polygones))? {
        let p = objet(&p)?;
        let mut sommets = Vec::new();
        for v in elements_ou_rien(ou(p, "vertices", "sommets"))? {
            if let Json::Liste(v) = &v {
                if v.len() >= 2 {
                    sommets.push((float_py(&v[0])?, float_py(&v[1])?));
                }
            }
        }
        if sommets.len() < 3 {
            continue; // un polygone a moins de trois sommets ne porte pas de courant
        }
        out.push(Polygone {
            sommets,
            couche: entier(p, "couche", "layer")?,
            net: texte(p, "net", "net", "?"),
            epaisseur: flottant(p, "epaisseur", "thickness", EPAISSEUR_DEFAUT)?,
            // UN TROU EST DU CUIVRE EN MOINS. Une decoupe de plan, un
            // anti-pad : la forme est donnee comme les autres, mais elle RETIRE
            // les carreaux au lieu de les poser. Sans cela un plan evide se
            // calculerait plein, et la chute ressortirait trop faible -- du
            // mauvais cote, celui qui rassure.
            trou: drapeau(p, "trou") || drapeau(p, "hole"),
        });
    }
    Ok(out)
}

pub const SONDES_BORD: usize = 8; // par demi-pas, le long de la face d'une arete de bord

/// Une arete de bord : son rang, sa couche, son net, le milieu de sa face, son axe, et de quel
/// cote aucune arete parallele ne suit (libre -, libre +).
struct Bord {
    arete: usize,
    couche: i64,
    net: u32,
    x: f64,
    y: f64,
    axe: usize,
    libres: [bool; 2],
}

/// UNE ARETE DE BORD NE PORTE QUE LE CUIVRE QUI LA BORDE. Tout ou rien, un
/// carreau valait un pas de large quel que soit le cuivre reel : le bord en
/// escalier d'une piste oblique etranglait le courant (+10 a +19 % de chute a
/// cinq carreaux en travers), et une piste DROITE de 1 mm au pas de 0,4 en
/// valait 1,2 (-17 %). La face d'une arete est le segment d'un pas qui la
/// coupe en son milieu ; on y sonde le cuivre du net, et la conductance est
/// ponderee par la part couverte. Du cote ou aucune arete parallele ne suit,
/// la face est prolongee d'un demi-pas : ce cuivre-la n'a pas d'autre arete
/// pour le porter. Rend {rang de l'arete: part}.
/// shortcut: seul le cuivre du MEME net est sonde ; un autre net pose
/// par-dessus un bord n'en retire rien. A reprendre si des nets se
/// chevauchent sur une meme couche.
/// Ici : la part de chaque arete de `bords`, dans leur ordre.
fn parts_des_bords(bords: &[Bord], polygones: &[Polygone], net_de: &[u32], pas: f64) -> Vec<f64> {
    let k = SONDES_BORD;
    let t: Vec<f64> = (0..6 * k).map(|m| ((m as f64 + 0.5) / (2 * k) as f64 - 1.5) * pas).collect(); // -1,5 a +1,5 pas
    let sonde = |b: &Bord, m: usize| (b.x + t[m] * b.axe as f64, b.y + t[m] * (1 - b.axe) as f64);
    let mut cuivre = vec![0u64; bords.len()]; // un bit par sonde
    // Le cuivre d'abord, les trous ensuite -- comme la trame.
    for rang in cuivre_puis_trous(polygones) {
        let p = &polygones[rang];
        let (sx0, sx1, sy0, sy1) = etendue(&p.sommets);
        let tout_net = p.trou && p.net == "?";
        for (b, c) in bords.iter().zip(cuivre.iter_mut()) {
            if b.couche != p.couche || (!tout_net && b.net != net_de[rang]) {
                continue;
            }
            let ((xa, ya), (xb, yb)) = (sonde(b, 0), sonde(b, 6 * k - 1));
            if !(xb >= sx0 && xa <= sx1 && yb >= sy0 && ya <= sy1) {
                continue;
            }
            let mut touche = 0u64;
            for m in 0..6 * k {
                let (x, y) = sonde(b, m);
                if dedans(x, y, &p.sommets) {
                    touche |= 1 << m;
                }
            }
            *c = if p.trou { *c & !touche } else { *c | touche };
        }
    }
    let moyenne = |c: u64, de: usize| ((c >> de) & ((1u64 << (2 * k)) - 1)).count_ones() as f64 / (2 * k) as f64;
    bords
        .iter()
        .zip(&cuivre)
        .map(|(b, c)| {
            moyenne(*c, 2 * k) + (b.libres[0] as u8 as f64) * moyenne(*c, 0) + (b.libres[1] as u8 as f64) * moyenne(*c, 4 * k)
        })
        .collect()
}

/// `sorted(polygones, key=trou)` : les rangs du cuivre, puis ceux des trous.
fn cuivre_puis_trous(polygones: &[Polygone]) -> impl Iterator<Item = usize> + '_ {
    let rangs = |trou: bool| (0..polygones.len()).filter(move |k| polygones[*k].trou == trou);
    rangs(false).chain(rangs(true))
}

const VIDE: u32 = u32::MAX;

/// La trame : ce que rend `mailler`.
pub struct Maillage {
    /// (x, y, couche) de chaque noeud, dans l'ordre (couche, ix, iy)
    pub coords: Vec<(f64, f64, i64)>,
    /// le net de chaque noeud : un rang dans `noms`
    pub nets: Vec<u32>,
    pub noms: Vec<String>,
    /// (a, b, conductance) : voisin de droite et voisin du dessus, chaque paire une fois
    pub aretes: Vec<(u32, u32, f64)>,
    pub epaisseurs: Vec<f64>,
    /// (couche, ix, iy) de chaque noeud
    pub cellules: Vec<(i64, i64, i64)>,
    pub couvertures: Vec<f64>,
    /// la part de cuivre de l'arete qui part de chaque noeud vers +x, et vers +y (1 hors bord)
    pub parts: Vec<[f64; 2]>,
    pub pas: f64,
    pub origine: (f64, f64),
    pub taille: (i64, i64),
    pub couches: Vec<i64>,
    /// `index` de Python, a plat : le rang du noeud de chaque case de la trame, ou VIDE
    index: Vec<u32>,
    /// la case de chaque noeud dans `index`
    cases: Vec<usize>,
}

impl Maillage {
    /// `index.get((couche, ix, iy))`
    pub fn noeud(&self, couche: i64, ix: i64, iy: i64) -> Option<usize> {
        let c = self.couches.binary_search(&couche).ok()?;
        self.noeud_de(c, ix, iy)
    }

    fn noeud_de(&self, c: usize, ix: i64, iy: i64) -> Option<usize> {
        let (nx, ny) = self.taille;
        if ix < 0 || iy < 0 || ix >= nx || iy >= ny {
            return None;
        }
        let r = self.index[(c * nx as usize + ix as usize) * ny as usize + iy as usize];
        (r != VIDE).then_some(r as usize)
    }

    /// Le noeud voisin de k, a (dx, dy) cases, sur la meme couche.
    fn voisin(&self, k: usize, dx: i64, dy: i64) -> Option<usize> {
        let (_, ix, iy) = self.cellules[k];
        let (nx, ny) = self.taille;
        if ix + dx < 0 || iy + dy < 0 || ix + dx >= nx || iy + dy >= ny {
            return None;
        }
        let r = self.index[(self.cases[k] as i64 + dx * ny + dy) as usize];
        (r != VIDE).then_some(r as usize)
    }

    /// Le voisin, s'il est du meme net.
    fn voisin_du_net(&self, k: usize, dx: i64, dy: i64) -> Option<usize> {
        self.voisin(k, dx, dy).filter(|v| self.nets[*v] == self.nets[k])
    }

    /// Le nom du net du noeud k.
    pub fn net(&self, k: usize) -> &str {
        &self.noms[self.nets[k] as usize]
    }
}

/// Trame le cuivre, couche par couche, et rend les noeuds et les aretes.
///
/// UNE CELLULE PAR CARREAU DE CUIVRE, prise a son centre. La conductance
/// entre deux cellules voisines d'une trame CARREE vaut sigma*t*(a/a) =
/// sigma*t : elle ne depend pas du pas, et c'est ce qui fait qu'un barreau
/// tombe sur rho*L/(W*t) sans qu'on ait rien a ajuster. Au BORD du cuivre,
/// l'arete ne porte que la part de cuivre de sa face (`_parts_des_bords`).
/// Raffiner la trame ne change donc que les constrictions -- c'est-a-dire ce
/// que la trame decrit mal, et rien d'autre.
///
/// Deux cellules ne sont reliees que si elles portent LE MEME NET : deux
/// cuivres qui se croisent sur une meme couche sans se toucher ne conduisent
/// pas l'un dans l'autre, et le lancer de rayon seul ne le saurait pas.
pub fn mailler(polygones: &[Polygone], pas: f64) -> Result<Maillage, ErreurDC> {
    if polygones.is_empty() {
        return Err(ErreurDC::new("Aucun cuivre à analyser.", "Sélectionnez du cuivre sur la carte."));
    }
    if !(pas > 0.0) {
        return Err(ErreurDC::new("Pas de maillage nul ou négatif.", ""));
    }

    let (x0, y0, x1, y1) = boite(polygones);
    let nx = (((x1 - x0) / pas).ceil() as i64).saturating_add(1);
    let ny = (((y1 - y0) / pas).ceil() as i64).saturating_add(1);
    let mut couches: Vec<i64> = polygones.iter().map(|p| p.couche).collect();
    couches.sort_unstable();
    couches.dedup();
    if nx as i128 * ny as i128 * couches.len() as i128 > (MAX_NOEUDS * 4) as i128 {
        // LE PAS QUI TIENDRAIT, DIT EN CHIFFRES. « Augmentez le pas » laisse
        // tatonner : la grille va comme 1/pas^2, donc doubler le pas divise le
        // compte par quatre, et il n'y a aucune raison de faire chercher a la
        // main un nombre qu'on sait poser. On l'arrondit vers le HAUT au
        // micron : arrondi vers le bas, le pas propose serait refuse a son
        // tour, ce qui est le pire des conseils.
        let tient = ((x1 - x0) * (y1 - y0) * couches.len() as f64 / (MAX_NOEUDS * 4) as f64).sqrt();
        let tient = (tient * 1e6).ceil() / 1e6;
        return Err(ErreurDC::new(
            format!("Trame trop fine : {} x {} carreaux sur {} couche(s).", nx, ny, couches.len()),
            &format!(
                "Le cuivre envoyé occupe une boîte de {:.1} x {:.1} mm : à ce pas, la grille compte plus de carreaux que le \
                 solveur n'en accepte, même là où il n'y a pas de cuivre. Un pas d'au moins {:.3} mm tient — ou restreignez \
                 la portée du calcul, ce qui rétrécit la boîte et rend la finesse au cuivre qui reste.",
                (x1 - x0) * 1e3,
                (y1 - y0) * 1e3,
                tient * 1e3
            ),
        ));
    }
    let (nxu, nyu) = (nx as usize, ny as usize);

    let mut noms: Vec<String> = Vec::new();
    let net_de: Vec<u32> = polygones
        .iter()
        .map(|p| match noms.iter().position(|n| *n == p.net) {
            Some(k) => k as u32,
            None => {
                noms.push(p.net.clone());
                noms.len() as u32 - 1
            }
        })
        .collect();

    // `cases` : (couche, ix, iy) -> (net, epaisseur). Le DERNIER polygone
    // gagne, comme le cuivre pose par-dessus sur la carte.
    // Ici `posees` garde (case, net, epaisseur) dans l'ordre de pose -- celui d'un dict de
    // Python, que les aretes suivent plus bas --, et `grille` dit le rang de chaque case.
    let mut grille = vec![VIDE; nxu * nyu * couches.len()];
    let mut posees: Vec<(usize, u32, f64)> = Vec::new();
    let mut carreaux = vec![0usize; polygones.len()];
    // LE CUIVRE D'ABORD, LES TROUS ENSUITE : une decoupe posee avant le plan
    // qu'elle evide ne retirerait rien. L'ordre est donc impose ici, et non
    // laisse a celui qui remplit le document.
    for rang in cuivre_puis_trous(polygones) {
        let p = &polygones[rang];
        let c = couches.binary_search(&p.couche).unwrap_or(0);
        let (sx0, sx1, sy0, sy1) = etendue(&p.sommets);
        let i0 = 0i64.max((((sx0 - x0) / pas) as i64).saturating_sub(1));
        let i1 = (nx - 1).min((((sx1 - x0) / pas) as i64).saturating_add(1));
        let j0 = 0i64.max((((sy0 - y0) / pas) as i64).saturating_sub(1));
        let j1 = (ny - 1).min((((sy1 - y0) / pas) as i64).saturating_add(1));
        for (ix, iy) in cases_dedans(&p.sommets, x0, y0, pas, i0, i1, j0, j1) {
            let cle = (c * nxu + ix as usize) * nyu + iy as usize;
            let deja = grille[cle];
            if p.trou {
                // Un trou qui porte un net n'evide que ce net : le
                // degagement d'un plan ne mange pas la pastille qu'il entoure.
                if deja != VIDE && (p.net == "?" || posees[deja as usize].1 == net_de[rang]) {
                    posees[deja as usize].0 = usize::MAX;
                    grille[cle] = VIDE;
                }
            } else {
                if deja == VIDE {
                    grille[cle] = posees.len() as u32;
                    posees.push((cle, net_de[rang], p.epaisseur));
                } else {
                    posees[deja as usize] = (cle, net_de[rang], p.epaisseur);
                }
                carreaux[rang] += 1;
            }
        }
    }
    posees.retain(|p| p.0 != usize::MAX);

    if posees.is_empty() {
        return Err(ErreurDC::new(
            "La trame ne rencontre aucun cuivre.",
            "Le pas de maillage est plus grand que les formes analysées : diminuez-le.",
        ));
    }

    // UNE FORME QUI TIENT EN TROIS CARREAUX N'EST PAS MAILLEE, elle est
    // echantillonnee : sa resistance sort de la position de trois points, pas
    // de sa geometrie. On compte, et si AUCUNE forme n'est resolue, on refuse
    // -- rendre un chiffre serait rendre un chiffre faux. Si seulement
    // certaines le sont, elles ressortent en avertissement plus bas.
    let plus_grande = polygones.iter().zip(&carreaux).filter(|(p, _)| !p.trou).map(|(_, c)| *c).max();
    if let Some(plus_grande) = plus_grande.filter(|c| *c < 4) {
        return Err(ErreurDC::new(
            format!("Trame trop grossière : la plus grande forme ne reçoit que {} carreau(x).", plus_grande),
            "Diminuez le pas de maillage : il faut au moins quelques carreaux dans la largeur d'une piste pour que sa \
             résistance veuille dire quelque chose.",
        ));
    }
    if posees.len() > MAX_NOEUDS {
        // Le nombre de noeuds va comme 1/pas^2 : le pas qui tient se pose.
        let tient = (pas * (posees.len() as f64 / MAX_NOEUDS as f64).sqrt() * 1e6).ceil() / 1e6;
        return Err(ErreurDC::new(
            format!("Maillage trop lourd : {} noeuds, maximum {}.", posees.len(), MAX_NOEUDS),
            &format!("Un pas d'au moins {:.3} mm tient — ou restreignez la sélection.", tient * 1e3),
        ));
    }

    let n = posees.len();
    for (r, p) in posees.iter().enumerate() {
        grille[p.0] = r as u32;
    }
    let mut m = Maillage {
        coords: Vec::with_capacity(n),
        nets: Vec::with_capacity(n),
        noms,
        aretes: Vec::new(),
        epaisseurs: Vec::with_capacity(n),
        cellules: Vec::with_capacity(n),
        couvertures: Vec::new(),
        parts: vec![[1.0; 2]; n],
        pas,
        origine: (x0, y0),
        taille: (nx, ny),
        couches,
        index: vec![VIDE; grille.len()],
        cases: Vec::with_capacity(n),
    };
    // `sorted(cases)` : la trame parcourue dans l'ordre (couche, ix, iy).
    for (cle, r) in grille.iter().enumerate() {
        if *r == VIDE {
            continue;
        }
        let (c, ix, iy) = (cle / (nxu * nyu), (cle / nyu) % nxu, cle % nyu);
        let (_, net, ep) = posees[*r as usize];
        m.index[cle] = m.coords.len() as u32;
        m.coords.push((x0 + ix as f64 * pas, y0 + iy as f64 * pas, m.couches[c]));
        m.nets.push(net);
        // L'EPAISSEUR PAR NOEUD sert a la DENSITE DE COURANT : un ampere dans
        // 35 um de cuivre n'est pas un ampere dans 70. Et `cellules` garde
        // l'adresse (couche, ix, iy) de chaque noeud, sans quoi retrouver ses
        // voisins demanderait de refaire l'arithmetique de la trame a l'envers.
        m.epaisseurs.push(ep);
        m.cellules.push((m.couches[c], ix as i64, iy as i64));
        m.cases.push(cle);
    }

    // Les aretes de la trame : voisin de droite et voisin du dessus, ce qui
    // donne chaque paire UNE fois.
    let mut aretes: Vec<(u32, u32, f64, usize)> = Vec::new();
    let mut bords: Vec<Bord> = Vec::new();
    for &(cle, _, _) in &posees {
        let a = m.index[cle] as usize;
        let (couche, _, _) = m.cellules[a];
        let (net, ep) = (m.nets[a], m.epaisseurs[a]);
        for axe in 0..2usize {
            let (dx, dy) = (1 - axe as i64, axe as i64);
            let Some(b) = m.voisin_du_net(a, dx, dy) else { continue };
            let autre = m.epaisseurs[b];
            // Une arete entre deux epaisseurs differentes est la mise en serie
            // de deux demi-carreaux : la conductance harmonique le dit.
            let e = if ep + autre != 0.0 { 2.0 * ep * autre / (ep + autre) } else { 0.0 };
            // L'arete est AU BORD du cuivre si l'arete parallele d'a cote
            // manque, d'un cote ou de l'autre.
            let libres = [-1i64, 1].map(|s| {
                !(m.voisin_du_net(a, s * dy, s * dx).is_some() && m.voisin(b, s * dy, s * dx).is_some_and(|v| m.nets[v] == net))
            });
            if libres[0] || libres[1] {
                let (_, ix, iy) = m.cellules[a];
                bords.push(Bord {
                    arete: aretes.len(),
                    couche,
                    net,
                    x: x0 + (ix as f64 + 0.5 * (1 - axe) as f64) * pas,
                    y: y0 + (iy as f64 + 0.5 * axe as f64) * pas,
                    axe,
                    libres,
                });
            }
            aretes.push((a as u32, b as u32, e / RESISTIVITE_CUIVRE, axe));
        }
    }
    let parts = parts_des_bords(&bords, polygones, &net_de, pas);
    // LA PART DE CUIVRE D'UN CARREAU : ses aretes selon x disent son etendue
    // en y, et l'inverse ; le produit est sa surface. Une borne y repartit son
    // courant, sans quoi le demi-carreau d'un bord en recevrait autant qu'un
    // plein et la densite y ferait un pic qui n'existe pas.
    let mut f = vec![1.0; aretes.len()];
    for (b, part) in bords.iter().zip(&parts) {
        f[b.arete] = *part;
    }
    let mut couvertures = vec![1.0; n];
    for axe in 0..2 {
        let mut compte = vec![0u32; n];
        let mut somme = vec![0.0; n];
        for bout in 0..2 {
            for (a, f) in aretes.iter().zip(&f).filter(|(a, _)| a.3 == axe) {
                let i = if bout == 0 { a.0 } else { a.1 } as usize;
                compte[i] += 1;
                somme[i] += f;
            }
        }
        for i in 0..n {
            couvertures[i] *= if compte[i] > 0 { somme[i] / compte[i] as f64 } else { 1.0 };
        }
    }
    m.couvertures = couvertures;
    // Par paire de noeuds : `_densite_et_echauffement` relit la meme part.
    for (b, part) in bords.iter().zip(&parts) {
        m.parts[aretes[b.arete].0 as usize][b.axe] = *part;
    }
    m.aretes = aretes.iter().zip(&f).filter(|(_, f)| **f > 0.0).map(|(a, f)| (a.0, a.1, a.2 * f)).collect();
    Ok(m)
}

/// Un plot -- pastille, plage, broche --, lu une fois.
struct Plot {
    x: f64,
    y: f64,
    couche: i64,
    net: Option<String>,
    boite: Option<[f64; 4]>,
    rayon: f64,
}

impl Plot {
    fn lire(point: &Json) -> Py<Plot> {
        let point = objet(point)?;
        let couche = entier(point, "couche", "layer")?;
        let net = match point.get("net") {
            None | Some(Json::Nul) => None,
            Some(Json::Texte(t)) if t.is_empty() || t == "?" => None,
            Some(v) => Some(str_py(v)),
        };
        let boite = match ou(point, "boite", "box").filter(|b| b.vrai()) {
            Some(b) if len_py(b)? >= 4 => {
                let b = elements(b)?;
                Some([float_py(&b[0])?, float_py(&b[1])?, float_py(&b[2])?, float_py(&b[3])?])
            }
            _ => None,
        };
        let (x, y) = match boite {
            // UNE BOITE PORTE SON PROPRE CENTRE. Sans cela, un plot decrit par un
            // rectangle et rien d'autre se replierait, quand la boite ne coiffe
            // aucun noeud, sur le noeud le plus proche de l'ORIGINE -- c'est-a-dire
            // a l'autre bout de la carte, en silence.
            Some(b) if !point.contains_key("x") => ((b[0] + b[2]) / 2.0, (b[1] + b[3]) / 2.0),
            _ => (point.get("x").map_or(Ok(0.0), float_py)?, point.get("y").map_or(Ok(0.0), float_py)?),
        };
        Ok(Plot { x, y, couche, net, boite, rayon: flottant(point, "rayon", "radius", 0.0)? })
    }
}

/// Les noeuds que touche un plot -- pastille, plage, broche.
///
/// TROIS FILTRES, et le troisieme est celui qui manquait :
///
///   · la COUCHE, toujours ;
///   · la FORME : une `boite` (x0, y0, x1, y1) quand le plot est rectangulaire
///     -- une pastille l'est presque toujours --, sinon un disque de `rayon` ;
///   · le NET, quand le point en declare un. Sans lui, une reference de masse
///     posee au milieu d'une carte attrape le cuivre du net voisin qui passe
///     dans le meme disque, et le fixe a zero volt : le net d'a cote se
///     retrouve alors sans chute, ce qui se lit comme un bon resultat.
///
/// Rien dans la forme : le noeud le plus proche, du bon net et de la bonne
/// couche. Un point d'injection tombe souvent a cote de la trame d'un carreau
/// ou deux, et refuser pour cela serait pedant.
///
/// `portee` BORNE CE REPLI, et il faut la donner pour un VIA. Une borne
/// d'injection qu'on rabat de deux carreaux reste la borne qu'on visait ; un
/// via rabattu de soixante-dix millimetres est un chemin vertical INVENTE,
/// entre deux morceaux de cuivre qui ne se touchent pas. Au-dela de `portee`,
/// on ne rend rien -- et l'appelant a alors de quoi le dire.
fn noeuds_du_plot(maillage: &Maillage, plot: &Plot, defaut_rayon: Option<f64>, portee: Option<f64>) -> Vec<usize> {
    let coords = &maillage.coords;
    let (x, y) = (plot.x, plot.y);
    let Ok(c) = maillage.couches.binary_search(&plot.couche) else { return Vec::new() };
    // Un net que la trame ne connait pas ne touche aucun noeud.
    let net = plot.net.as_ref().map(|nom| maillage.noms.iter().position(|n| n == nom).map_or(VIDE, |k| k as u32));
    let pas = maillage.pas;
    let (ox, oy) = maillage.origine;
    let (nx, ny) = maillage.taille;

    // Les noeuds eligibles des seules cases de la trame qui couvrent
    // [xa, xb] x [ya, yb], par l'index. Parcourir TOUS les noeuds a chaque
    // plot coutait 0,3 s par appel a 200 000 noeuds, deux appels par via :
    // cinq minutes pour 500 vias.
    let fenetre = |xa: f64, ya: f64, xb: f64, yb: f64| -> Vec<usize> {
        let i0 = 0i64.max((((xa - ox) / pas).floor() as i64).saturating_sub(1));
        let i1 = (nx - 1).min((((xb - ox) / pas).ceil() as i64).saturating_add(1));
        let j0 = 0i64.max((((ya - oy) / pas).floor() as i64).saturating_sub(1));
        let j1 = (ny - 1).min((((yb - oy) / pas).ceil() as i64).saturating_add(1));
        let mut out = Vec::new();
        for ix in i0..=i1 {
            for iy in j0..=j1 {
                if let Some(i) = maillage.noeud_de(c, ix, iy) {
                    if net.is_none_or(|n| maillage.nets[i] == n) {
                        out.push(i);
                    }
                }
            }
        }
        out // deja dans l'ordre des rangs : (ix, iy) croissants sur une seule couche
    };
    let d2 = |i: usize| (coords[i].0 - x) * (coords[i].0 - x) + (coords[i].1 - y) * (coords[i].1 - y);

    if let Some(b) = plot.boite {
        let (x0, x1) = (min_py(b[0], b[2]), max_py(b[0], b[2]));
        let (y0, y1) = (min_py(b[1], b[3]), max_py(b[1], b[3]));
        let mut out = fenetre(x0, y0, x1, y1);
        out.retain(|&i| x0 <= coords[i].0 && coords[i].0 <= x1 && y0 <= coords[i].1 && coords[i].1 <= y1);
        if !out.is_empty() {
            return out;
        }
    } else {
        let mut r = plot.rayon;
        if r <= 0.0 {
            r = defaut_rayon.unwrap_or(0.0);
        }
        if r <= 0.0 {
            r = maillage.pas * 0.75; // le carreau le plus proche, et lui seul
        }
        let r2 = r * r;
        let mut out = fenetre(x - r, y - r, x + r, y + r);
        out.retain(|&i| d2(i) <= r2);
        if !out.is_empty() {
            return out;
        }
    }

    let pool = match portee {
        Some(g) => fenetre(x - g, y - g, x + g, y + g),
        None => (0..coords.len()).filter(|&i| coords[i].2 == plot.couche && net.is_none_or(|n| maillage.nets[i] == n)).collect(),
    };
    // a distance egale, le plus petit indice : le choix d'avant, quel que soit
    // l'ordre de la fenetre
    let mut mieux: Option<(usize, f64)> = None;
    for i in pool {
        let d = d2(i);
        if mieux.is_none_or(|(_, m)| d < m) {
            mieux = Some((i, d));
        }
    }
    match (mieux, portee) {
        (None, _) => Vec::new(),
        (Some((_, d)), Some(g)) if d > g * g => Vec::new(),
        (Some((i, _)), _) => vec![i],
    }
}


// ==========================================================================
// LA DENSITE DE COURANT, ET CE QU'ELLE ECHAUFFE
// --------------------------------------------------------------------------
// LA CHUTE NE DIT PAS TOUT. Une piste peut tenir sa chute et fondre quand
// meme : c'est la SECTION qui chauffe, pas la longueur. Un retrecissement de
// deux millimetres ne pese presque rien sur la tension et beaucoup sur la
// temperature -- et c'est exactement le defaut qu'aucun controle geometrique
// ne voit, parce que la piste y respecte sa largeur minimale.
//
// CE QU'ON CALCULE, ET COMMENT.
//
//   LA DENSITE. Le solveur connait deja le courant de chaque arete de la
//   trame : I = g (Va - Vb). Cette arete traverse une face de section
//   t * pas, donc J = I / (t * pas). Au centre d'un carreau, on reconstruit le
//   vecteur en moyennant la face qui entre et celle qui sort, dans chaque
//   direction -- c'est la reconstruction centree ordinaire, et au bout d'une
//   piste elle rend bien la moitie : rien ne sort par la face qui n'existe pas.
//
//   L'ECHAUFFEMENT. DEUX MODELES, RENDUS TOUS LES DEUX, et il faut savoir
//   lequel on lit.
//
//   (a) LA CHARTE IPC-2221, historique :
//
//       I = k * dT^0.44 * A^0.725        A en mils carres, I en amperes
//       k = 0,048 en couche EXTERIEURE, 0,024 en couche INTERNE
//
//   qu'on inverse en dT = (I / (k A^0.725))^(1/0,44). Elle demande la SECTION
//   du conducteur, pas seulement la densite : on mesure donc la largeur locale
//   du cuivre sur la trame, perpendiculairement au courant.
//
//   (b) L'ETALEMENT DANS LE STRATIFIE, qui est ce qu'IPC-2152 a mesure et que
//   la charte ignore. C'est ce modele-ci qui decide, et c'est celui que
//   `modele_thermique` nomme dans le resultat.
//
// POURQUOI LA CHARTE NE SUFFIT PAS, ET CE QUE 2152 A CHANGE.
//
//   IPC-2221 est une CHARTE EMPIRIQUE, relevee sur un conducteur ISOLE, a
//   l'air calme, sans cuivre voisin ni composant chaud. Elle ne connait NI le
//   stratifie, NI les plans qui evacuent -- c'est-a-dire ni l'un ni l'autre des
//   deux chemins par lesquels la chaleur part vraiment sur une carte moderne.
//   Ses deux consequences se posent a la main :
//
//     · une couche INTERNE y sort 4,83 fois plus chaude qu'une externe
//       (2^(1/0,44)). C'est le resultat que la campagne IPC-2152 a RENVERSE :
//       une piste noyee dans le stratifie est mieux refroidie, pas moins, parce
//       que le lamine conduit mieux que l'air calme ;
//     · un PLAN DE CUIVRE a cote de la piste ne change rien a son chiffre.
//       Or 35 um de cuivre pleine carte etalent dix fois mieux que 1,6 mm de
//       FR-4 : c'est le facteur le plus lourd de tout le probleme, et il est
//       absent de la charte.
//
// LE MODELE D'ETALEMENT, POSE EN ENTIER.
//
//   Un conducteur qui porte I dissipe, par metre de longueur,
//
//       p' = I^2 * rho / A              [W/m]
//
//   et cette chaleur ne peut sortir que par la SURFACE de la carte. Elle y
//   arrive en s'etalant lateralement : la carte est une AILETTE plane, de
//   conductance de nappe
//
//       Ks = k_stratifie * h_lamine + k_cuivre * t_etaleur     [W/K]
//
//   -- le lamine et, en parallele, l'epaisseur de cuivre qui etale reellement
//   (un plan compte pour son epaisseur, une couche de signal pour sa part de
//   remplissage : c'est l'appelant qui la mesure, il a l'empilage) --, qui perd
//   vers l'ambiante par h sur chacune de ses DEUX faces. L'ailette semi-infinie
//   alimentee sur son bord a pour conductance lineique sqrt(Ks * 2h) ; il y en a
//   une de chaque cote du conducteur, donc
//
//       g_etalement = 2 * sqrt(Ks * 2h)                       [W/(K.m)]
//
//   auquel s'ajoute, pour une couche EXTERIEURE seulement, ce que le conducteur
//   perd directement par sa propre face nue, h * W. D'ou
//
//       dT = p' / g            g = g_etalement (+ h*W si externe)
//
//   LA LONGUEUR D'ETALEMENT sqrt(Ks / 2h) dit sur combien de millimetres la
//   carte emporte la chaleur : 7 mm sur du FR-4 nu, 24 mm des qu'un plan est la.
//   Elle est rendue dans `thermique`, parce que c'est elle qui explique le
//   chiffre -- et parce qu'un conducteur plus large qu'elle n'est plus une
//   piste : il est sa propre ailette, et le modele le surestime alors.
//
//   LE CUIVRE SE DEGRADE EN CHAUFFANT : rho monte de 0,393 % par kelvin, donc
//   p' aussi. dT = u (1 + alpha dT) se resout en dT = u / (1 - alpha u), et
//   cette boucle est ce qui fait fondre une piste juste au-dela d'un seuil. Au
//   dela de BOUCLE_MAX on ne rend plus un chiffre : on le borne et on le DIT.
//
// CE QUE CE CHIFFRE N'EST TOUJOURS PAS.
//
//   · Ce n'est pas une simulation thermique : la carte est prise pour une
//     ailette plane uniforme, sans composant chaud, sans autre piste qui
//     dissipe a cote, et h y est constant -- donc sans convection forcee et
//     sans la montee du rayonnement quand la carte chauffe (ce dernier point
//     penche du cote prudent).
//   · h et la conductivite du lamine sont des ORDRES DE GRANDEUR. Vingt pour
//     cent d'incertitude est la nature de la chose, pas un defaut de ce code.
//   · LES DEUX CHIFFRES SONT RENDUS. Quand ils s'ecartent beaucoup, c'est que
//     la carte evacue -- ou n'evacue pas -- et c'est justement ce qu'on veut
//     savoir. Le panneau les affiche cote a cote.
// ==========================================================================

pub const IPC2221_K_EXT: f64 = 0.048; // couche exterieure, a l'air libre
pub const IPC2221_K_INT: f64 = 0.024; // couche interne, noyee dans le stratifie
pub const MILS2_PAR_MM2: f64 = 1.0 / (0.0254 * 0.0254); // 1 mm2 = 1550,0031 mils2
pub const LARGEUR_MAX_CARREAUX: i64 = 400; // au-dela, c'est un plan, pas une piste

// LE MODELE D'ETALEMENT. Ces quatre nombres sont ceux qu'on peut contester, et
// c'est pour cela qu'ils sont nommes et rendus dans le resultat.
pub const CONDUCTIVITE_CUIVRE_TH: f64 = 390.0; // W/(m.K)
// W/(m.K) : FR-4 DANS LE PLAN. Le travers vaut trois fois moins (0,25-0,3), mais c'est bien
// lateralement que la chaleur s'en va -- l'epaisseur ne fait que 1,6 mm.
pub const K_STRATIFIE_DEFAUT: f64 = 0.8;
// W/(m2.K) par face : environ 7 de convection naturelle et 5 de rayonnement
// (4*eps*sigma*T^3 = 5,1 a 20 degres, eps = 0,9).
pub const H_SURFACE_DEFAUT: f64 = 12.0;
pub const EPAISSEUR_STRATIFIE_DEFAUT: f64 = 1.6e-3; // m, une carte ordinaire
pub const ALPHA_CUIVRE: f64 = 3.93e-3; // 1/K, coefficient de resistivite du cuivre
pub const BOUCLE_MAX: f64 = 0.8; // au-dela, c'est un emballement : on borne
pub const MODELES_THERMIQUES: [&str; 2] = ["etalement", "ipc2221"];
pub const MODELE_THERMIQUE_DEFAUT: &str = "etalement";

/// Les entrees du modele d'etalement, completees : ce que rend `thermique`.
#[derive(Debug, Clone, PartialEq)]
pub struct Thermique {
    pub modele: String,
    pub k_stratifie: f64,
    pub epaisseur_stratifie: f64,
    pub h_surface: f64,
    pub cuivre_etaleur: f64,
    pub nappe: f64,              // W/K
    pub g_etalement: f64,        // W/(K.m)
    pub longueur_etalement: f64, // m
    pub replis: Vec<String>,
}

/// Les entrees du modele d'etalement, completees de leurs replis.
///
/// RIEN N'EST DEVINE EN SILENCE : chaque repli est nomme dans `replis`, et le
/// resultat l'emporte. « 6 K » sur une conductivite supposee et « 6 K » sur
/// une conductivite declaree ne se lisent pas pareil, et seul le second se
/// defend devant un fabricant.
///
/// Longueurs en METRES ici, comme partout dans ce module.
pub fn thermique(brut: Option<&Json>) -> Py<Thermique> {
    let vide = Objet::new();
    let brut = match brut.filter(|b| b.vrai()) {
        None => &vide,
        Some(Json::Objet(o)) => o,
        Some(_) => return Err(ErreurPy("dictionary update sequence element #0 has length 1; 2 is required".into())),
    };
    let mut replis: Vec<String> = Vec::new();

    let mut lire = |cle: &str, defaut: f64, nom: &str| -> f64 {
        match brut.get(cle).and_then(|v| float_py(v).ok()).filter(|v| *v > 0.0) {
            Some(v) => v,
            None => {
                replis.push(nom.to_string());
                defaut
            }
        }
    };

    let mut modele = texte(brut, "modele", "modele", MODELE_THERMIQUE_DEFAUT);
    if !MODELES_THERMIQUES.contains(&modele.as_str()) {
        modele = MODELE_THERMIQUE_DEFAUT.to_string();
    }
    let k_stratifie = lire("k_stratifie", K_STRATIFIE_DEFAUT, "conductivité du stratifié");
    let epaisseur_stratifie = lire("epaisseur_stratifie", EPAISSEUR_STRATIFIE_DEFAUT, "épaisseur de stratifié");
    let h_surface = lire("h_surface", H_SURFACE_DEFAUT, "échange en surface");
    // LE CUIVRE QUI ETALE : zero par defaut, et c'est voulu. Un repli
    // optimiste inventerait un plan de masse la ou personne n'en a declare,
    // et rendrait une temperature plus basse que la verite -- l'erreur du
    // cote qui rassure. Zero rend la carte nue, donc plus chaude.
    let cuivre_etaleur = max_py(flottant(brut, "cuivre_etaleur", "cuivre_etaleur", 0.0)?, 0.0);
    if !drapeau(brut, "cuivre_etaleur") {
        replis.push("cuivre étaleur (pris nul : aucun plan déclaré)".to_string());
    }
    let ks = k_stratifie * epaisseur_stratifie + CONDUCTIVITE_CUIVRE_TH * cuivre_etaleur;
    let h2 = 2.0 * h_surface;
    Ok(Thermique {
        modele,
        k_stratifie,
        epaisseur_stratifie,
        h_surface,
        cuivre_etaleur,
        nappe: ks,
        g_etalement: 2.0 * (max_py(ks, 0.0) * h2).sqrt(),
        longueur_etalement: if h2 > 0.0 { (ks / h2).sqrt() } else { 0.0 },
        replis,
    })
}

/// La montee en temperature par etalement dans la carte, en kelvins.
///
/// Rend (dT, emballement). `emballement` dit que la boucle resistivite ->
/// puissance -> temperature a ete BORNEE : le chiffre rendu est alors un
/// plancher, et la piste est a refaire, pas a lire.
fn echauffement_etalement(courant: f64, section_m2: f64, largeur_m: f64, externe: bool, th: &Thermique, rho: f64) -> (f64, bool) {
    let i = courant.abs();
    let a = section_m2;
    if !(i > 0.0 && a > 0.0) {
        return (0.0, false);
    }
    let mut g = th.g_etalement;
    if externe {
        g += th.h_surface * max_py(largeur_m, 0.0);
    }
    if !(g > 0.0) {
        return (0.0, false);
    }
    let u = i * i * rho / (a * g); // K, cuivre a 20 degres
    let boucle = ALPHA_CUIVRE * u;
    if boucle >= BOUCLE_MAX {
        return (u / (1.0 - BOUCLE_MAX), true);
    }
    (u / (1.0 - boucle), false)
}

/// CE QUE LE CHIFFRE EST, EN UNE PHRASE QUE LE RESULTAT PORTE LUI-MEME.
///
/// Un utilisateur qui lit « 6 K » sans savoir d'ou ca vient ne peut pas juger
/// si le chiffre le concerne. Les deux modeles ne se lisent pas pareil, et
/// c'est ce que cette phrase dit -- avec les cotes sur lesquelles le modele
/// d'etalement a effectivement travaille, parce que ce sont elles qu'on
/// conteste.
fn phrase_thermique(th: &Thermique) -> String {
    if th.modele == "ipc2221" {
        return "IPC-2221 (charte historique, conducteur isolé à l'air calme, sans stratifié ni plan). IPC-2152 a mesuré le \
                contraire de ce qu'elle suppose sur les couches internes : le modèle d'étalement, rendu à côté, en tient \
                compte."
            .to_string();
    }
    // PAS DE CHIFFRE DANS CETTE PHRASE, ET C'EST DELIBERE. Les cotes sont dans
    // `thermique`, et c'est la PAGE qui les ecrit : elle seule connait la
    // virgule decimale francaise et les unites du panneau. Les poser ici les
    // ferait paraitre deux fois -- une fois en « 0.80 », une fois en « 0,80 »
    // -- dans la meme fiche, ce qui est exactement ce qui s'est produit.
    let mut phrase = "Étalement dans la carte : la conduction du stratifié et des plans, que la campagne IPC-2152 a mesurée \
                      et qu'IPC-2221 ignore. Ce n'est pas une simulation thermique — la carte est prise pour une ailette \
                      plane uniforme, à échange constant, sans composant chaud ni piste voisine qui dissipe ; ±20 % est la \
                      nature de la chose."
        .to_string();
    if !th.replis.is_empty() {
        phrase += &format!(
            " Supposé faute de mieux : {}. IPC-2221 est rendue à côté, et reste plus prudente sauf sur carte nue.",
            th.replis.join(", ")
        );
    } else {
        phrase += " IPC-2221 est rendue à côté : elle ne connaît aucune de ces cotes.";
    }
    phrase
}

/// La montee en temperature d'un conducteur, en kelvins. Voir plus haut.
///
/// `section_mm2` est la section de CUIVRE (largeur x epaisseur). Rend 0 pour
/// un courant ou une section nuls -- pas une exception : un carreau sans
/// courant est le cas ordinaire, pas une anomalie.
fn echauffement_ipc2221(courant: f64, section_mm2: f64, externe: bool) -> f64 {
    let i = courant.abs();
    let a = section_mm2;
    if !(i > 0.0 && a > 0.0) {
        return 0.0;
    }
    let k = if externe { IPC2221_K_EXT } else { IPC2221_K_INT };
    let mils2 = a * MILS2_PAR_MM2;
    let denom = k * mils2.powf(0.725);
    if denom <= 0.0 {
        return 0.0;
    }
    (i / denom).powf(1.0 / 0.44)
}

/// Ce que rend `densite_et_echauffement` : quatre listes alignees sur les noeuds, et le nombre
/// de conducteurs ou la boucle thermique a du etre bornee.
struct Echauffements {
    densites: Vec<f64>,
    largeurs: Vec<f64>,
    etalement: Vec<f64>,
    charte: Vec<f64>,
    emballes: usize,
}

/// Par noeud : la densite de courant (A/mm2), la largeur locale du cuivre
/// (mm) et la montee en temperature (K) SELON LES DEUX MODELES.
///
/// Rend (densites, largeurs, etalement, ipc2221, emballements) -- quatre
/// listes alignees sur les noeuds du maillage, et le nombre de conducteurs ou
/// la boucle thermique a du etre bornee.
///
/// DEUX PASSES, ET LA SECONDE EST CE QUI REND LE CHIFFRE UTILISABLE.
///
/// La premiere calcule la densite EN CHAQUE POINT. C'est ce qu'il faut pour la
/// carte de chaleur -- on veut voir ou le courant se presse.
///
/// La seconde calcule la temperature, et elle ne peut pas se contenter du
/// point : les DEUX modeles demandent le courant TOTAL d'un conducteur et sa
/// SECTION. On mesure donc, perpendiculairement au courant, l'etendue du
/// cuivre, et on INTEGRE la densite sur cette traversee. Le courant ainsi
/// obtenu est celui qui passe vraiment, et il converge.
///
/// POURQUOI CETTE DISTINCTION N'EST PAS UN RAFFINEMENT. A l'entree d'un
/// retrecissement, l'angle rentrant rend la densite SINGULIERE : le pic croit
/// sans borne quand on raffine la trame -- mesure sur une piste de 2 mm
/// etranglee a 1 mm, 93,7 A/mm2 au pas de 0,2, 104,4 a 0,1, 129,3 a 0,05. Un
/// maximum ponctuel n'est donc PAS un chiffre d'ingenieur : il dit ou regarder,
/// pas combien. La moyenne sur la section, elle, est un flux a travers une
/// coupe, et elle ne bouge plus.
fn densite_et_echauffement(maillage: &Maillage, potentiel: &[f64], rho: f64, externes: &BTreeSet<i64>, th: &Thermique) -> Echauffements {
    let cellules = &maillage.cellules;
    let eps = &maillage.epaisseurs;
    let pas = maillage.pas;
    let n = cellules.len();
    let mut densites = vec![0.0; n];
    let mut largeurs = vec![0.0; n];
    let mut etal = vec![0.0; n]; // le modele d'etalement
    let mut charte = vec![0.0; n]; // IPC-2221, a cote
    let mut emballes = 0;

    // Celle que `mailler` a posee : moyenne harmonique des epaisseurs, et la part de cuivre
    // d'une arete de bord. `j` est le voisin de `i` vers +x (axe 0) ou +y (axe 1).
    let conductance = |i: usize, j: usize, axe: usize| -> f64 {
        let (a, b) = (eps[i], eps[j]);
        if a + b <= 0.0 {
            return 0.0;
        }
        (2.0 * a * b / (a + b)) / rho * maillage.parts[i][axe]
    };

    // -- PREMIERE PASSE : la densite en chaque point ------------------------
    let mut courants = vec![(0.0, 0.0); n]; // (ix, iy) traversant le carreau, A
    for i in 0..n {
        let t = eps[i];
        let face = t * pas; // la section que traverse une arete
        if face <= 0.0 {
            continue;
        }
        let mut composante = [0.0; 2];
        let mut faces = [0.0; 2];
        for axe in 0..2usize {
            let (dx, dy) = (1 - axe as i64, axe as i64);
            let avant = maillage.voisin_du_net(i, -dx, -dy);
            let apres = maillage.voisin_du_net(i, dx, dy);
            // LA FACE D'UN CARREAU DE BORD est celle que `mailler` a ponderee :
            // divise par la face pleine, le carreau qui porte un pas et demi
            // de cuivre affichait une fois et demie la densite.
            let g: Vec<f64> = [avant.map(|u| conductance(u, i, axe)), apres.map(|v| conductance(i, v, axe))]
                .into_iter()
                .flatten()
                .filter(|c| *c != 0.0)
                .collect();
            faces[axe] = if g.is_empty() { face } else { rho * pas * py::sum(g.iter().copied()) / g.len() as f64 };
            // Le courant qui ENTRE par la face amont, celui qui SORT par
            // l'aval. Une face absente ne laisse rien passer.
            let entre = avant.map_or(0.0, |u| conductance(u, i, axe) * (potentiel[u] - potentiel[i]));
            let sort = apres.map_or(0.0, |v| conductance(i, v, axe) * (potentiel[i] - potentiel[v]));
            composante[axe] = (entre + sort) / 2.0;
        }
        courants[i] = (composante[0], composante[1]);
        let (jx, jy) = (composante[0] / faces[0], composante[1] / faces[1]); // A/m2
        densites[i] = py::hypot(jx, jy) * 1e-6; // A/mm2
    }

    // -- SECONDE PASSE : LES COUPES ------------------------------------------
    // ON NE MESURE PLUS UNE LARGEUR AUTOUR D'UN POINT, ON COMPTE UN FLUX A
    // TRAVERS UNE COUPE. C'est la grandeur que les deux modeles attendent -- le
    // courant TOTAL d'un conducteur et sa SECTION -- et elle se lit exactement
    // sur la trame : chaque colonne de carreaux est une coupe, et la somme des
    // aretes qui la franchissent est le courant qui passe.
    //
    // POURQUOI PAS LE BALAYAGE LOCAL, qui etait ecrit ici avant. Il marchait
    // perpendiculairement a l'AXE DOMINANT du courant. Dans un angle rentrant
    // le courant est diagonal : le balayage traversait alors la marche au lieu
    // du conducteur, voyait une section trop courte et rendait une temperature
    // trop haute -- 21,9 K la ou le col de 1 mm en vaut 16,7, soit trente pour
    // cent de trop, sur une geometrie ou la reponse se pose a la main. Une
    // coupe ne se laisse pas tromper par la direction : elle compte ce qui
    // passe.
    //
    // UN CONDUCTEUR PAR SUITE CONTIGUE. Une colonne peut traverser plusieurs
    // cuivres sans rapport ; on ne somme donc que des carreaux VOISINS et DE
    // MEME NET, et chaque suite est un conducteur distinct.
    // `axe` = 0 : coupes verticales (le courant passe selon x).
    for axe in 0..2usize {
        let mut vus = vec![false; n];
        for k in 0..n {
            if vus[k] {
                continue;
            }
            // La suite contigue a laquelle ce carreau appartient, le long de
            // l'axe PERPENDICULAIRE au courant.
            let pas_perp = if axe == 0 { (0, 1) } else { (1, 0) };
            let mut suite = vec![k];
            for sens in [1i64, -1] {
                let mut m = 1;
                while m <= LARGEUR_MAX_CARREAUX {
                    let Some(v) = maillage.voisin_du_net(k, pas_perp.0 * sens * m, pas_perp.1 * sens * m) else { break };
                    suite.push(v);
                    m += 1;
                }
            }
            for v in &suite {
                vus[*v] = true;
            }
            // Le courant qui FRANCHIT la coupe : les aretes qui partent de
            // chaque carreau de la suite vers la colonne suivante.
            let pas_flux = if axe == 0 { (1, 0) } else { (0, 1) };
            let mut total = 0.0;
            let mut section = 0.0;
            let mut franchie = 0.0; // la section que les aretes franchissent, m2
            for &v in &suite {
                if let Some(apres) = maillage.voisin_du_net(v, pas_flux.0, pas_flux.1) {
                    total += conductance(v, apres, axe) * (potentiel[v] - potentiel[apres]);
                    franchie += conductance(v, apres, axe) * rho * pas;
                }
                section += eps[v] * pas; // m2
            }
            if section <= 0.0 {
                continue;
            }
            let mut largeur = suite.len() as f64 * pas; // m
            // LA COUPE SUIT LA TRAME, PAS LE CONDUCTEUR. Sur une piste a
            // l'angle a, elle traverse W / cos a de cuivre pour le meme
            // courant : la section sortait trop grande et la temperature trop
            // basse (-30 % a 45 degres). cos a = la part du courant moyen de
            // la suite qui franchit la coupe ; section et largeur sont
            // ramenees a la perpendiculaire du courant.
            let sx = py::sum(suite.iter().map(|v| courants[*v].0));
            let sy = py::sum(suite.iter().map(|v| courants[*v].1));
            let norme = py::hypot(sx, sy);
            let mut cos_a = if norme > 0.0 { (if axe == 0 { sx } else { sy }).abs() / norme } else { 1.0 };
            // UNE COUPE RASANTE NE MESURE RIEN : le courant la longe, son flux
            // net est un reste et cos a tombe vers zero -- la section avec
            // lui, et un disque de 10 mm entre deux bornes rendait des dizaines
            // de millions de kelvins. L'autre axe coupe ce conducteur-la.
            if cos_a < 0.5 {
                continue;
            }
            cos_a = min_py(1.0, cos_a);
            // UN CARREAU DE BORD N'EST PAS PLEIN : la section est celle que
            // `mailler` a ponderee, sans quoi une piste de 1 mm au pas de 0,4
            // chauffait comme une de 0,8 ou de 1,2 selon ou tombait la trame.
            // Seulement sur la coupe qui barre le courant : une coupe rasante
            // perd aux deux bouts les aretes que l'escalier n'a pas.
            if franchie > 0.0 && cos_a > 0.71 {
                largeur *= franchie / section;
                section = franchie;
            }
            section *= cos_a;
            largeur *= cos_a;
            let externe = externes.contains(&cellules[suite[0]].0);
            let ipc = echauffement_ipc2221(total, section * 1e6, externe);
            let (dt, emballe) = echauffement_etalement(total, section, largeur, externe, th, rho);
            if emballe {
                emballes += 1;
            }
            // LE MODELE DEMANDE EST CELUI QUI DECIDE : c'est lui qui designe le
            // pire conducteur d'un carreau, et lui dont la largeur est retenue.
            // Sans quoi, sous « ipc2221 », la carte peindrait la temperature
            // d'un conducteur et le tableau la largeur d'un autre.
            let juge = if th.modele == "ipc2221" { ipc } else { dt };
            for &v in &suite {
                if juge > (if th.modele == "ipc2221" { charte[v] } else { etal[v] }) {
                    etal[v] = dt;
                    charte[v] = ipc;
                    largeurs[v] = largeur * 1e3;
                }
            }
        }
    }
    Echauffements { densites, largeurs, etalement: etal, charte, emballes }
}

/// La resistance d'un via : un anneau de cuivre plaque, en serie.
///
///     R = rho * h / A     A = pi ((d/2 + p)^2 - (d/2)^2)
///
/// `h` est la hauteur traversee, `d` le percage, `p` le placage. CONVENTION :
/// `d` est le diametre FINI du trou (celui des pages, de KiCad, de
/// l'IPC-2581), le cuivre est donc autour ; pour un diametre de foret, le
/// placage irait vers l'interieur et R vaudrait ~15 % de plus. Une valeur
/// donnee dans le document l'emporte : un fabricant qui mesure ses trous a
/// raison contre n'importe quelle formule.
fn resistance_via(via: &Objet) -> Py<f64> {
    if let Some(r) = present(via, "resistance") {
        return Ok(max_py(float_py(r)?, 0.0));
    }
    let d = flottant(via, "percage", "drill", 0.3e-3)?;
    let p = flottant(via, "placage", "plating", PLACAGE_DEFAUT)?;
    let h = flottant(via, "hauteur", "height", 1.6e-3)?;
    let aire = PI * ((d / 2.0 + p) * (d / 2.0 + p) - (d / 2.0) * (d / 2.0));
    if aire <= 0.0 {
        return Ok(0.0);
    }
    Ok(RESISTIVITE_CUIVRE * h / aire)
}

// ==========================================================================
// Le calcul
// ==========================================================================

/// CG avec preconditionneur de Jacobi : scipy.sparse.linalg.cg(matrice, second, rtol=1e-12,
/// atol=atol, maxiter=20000, M=Jacobi), repris dans `creuse`.
fn resoudre_systeme(matrice: &Csr, second: &[f64], atol: f64) -> Result<Vec<f64>, ErreurDC> {
    gradient_conjugue(matrice, second, 1e-12, atol, 20000).map_err(|info| {
        ErreurDC::new(
            format!("Le gradient conjugué n'a pas convergé (code {}).", info),
            "Le réseau est probablement mal conditionné : vérifiez que le cuivre analysé est d'un seul tenant et qu'il \
             porte une référence.",
        )
    })
}

/// Un via monte dans le reseau : les paires de noeuds qu'il relie et la conductance de chacune.
struct ViaMonte<'a> {
    via: &'a Objet,
    x: f64,
    y: f64,
    couche_a: i64,
    couche_b: i64,
    resistance: f64,
    g: f64,
    liens: Vec<(usize, usize)>,
}

/// Ce que rend `culs_de_sac`.
struct Culs {
    morceaux: usize,
    noeuds: usize,
    pire_courant: f64,
    pire_via: String,
}

/// LES MORCEAUX DE CUIVRE SANS ISSUE, ET CE QU'ILS PORTENT.
///
/// LA LOI, ET ELLE NE SE DISCUTE PAS. Un morceau de cuivre relie au reste du
/// reseau par UN SEUL chemin, et qui ne porte NI source NI charge, ne peut
/// porter aucun courant : ce qui entre doit sortir, et il n'y a pas d'autre
/// porte. C'est la loi des noeuds, appliquee non pas a un noeud mais a une
/// region entiere.
///
/// POURQUOI ON LA VERIFIE AU LIEU DE LA SUPPOSER. C'est exactement la question
/// qu'on pose devant la fiche : « ce via remonte a une pastille ou je n'ai
/// regle aucune charge, pourquoi porte-t-il du courant ? ». Il n'y a que deux
/// reponses possibles, et il faut pouvoir dire LAQUELLE :
///
///   · le cuivre CONTINUE au-dela de cette pastille -- une piste en part, ou
///     elle est posee sur un plan -- et le courant ne fait que passer. La
///     pastille n'est pas un terminus, c'est un point de passage ;
///   · le cuivre s'arrete la, et alors un courant non nul serait un BUG :
///     le reseau porterait un chemin qui n'existe pas.
///
/// COMMENT. Les composantes connexes du cuivre se calculent sur les seules
/// aretes DANS LE PLAN (`maillage["aretes"]`), sans les liaisons verticales :
/// une composante est donc un morceau de cuivre d'une couche. On compte, pour
/// chacune, les bornes qu'elle porte et les VIAS DISTINCTS qui la touchent.
/// Zero borne et un seul via : c'est un cul-de-sac, et le via qui l'alimente
/// doit porter zero.
///
/// Le cout est un parcours en largeur, negligeable devant le gradient
/// conjugue -- et il achete une verification de la solution par une loi qui
/// n'est pas celle qu'on a resolue.
fn culs_de_sac(maillage: &Maillage, vias_montes: &[ViaMonte], fixes: &[Option<f64>], injecte: &[f64], potentiel: &[f64]) -> Culs {
    let n = maillage.coords.len();
    let mut voisins: Vec<Vec<u32>> = vec![Vec::new(); n];
    for &(a, b, _g) in &maillage.aretes {
        voisins[a as usize].push(b);
        voisins[b as usize].push(a);
    }

    let mut comp = vec![usize::MAX; n];
    let mut nb = 0;
    for depart in 0..n {
        if comp[depart] != usize::MAX {
            continue;
        }
        comp[depart] = nb;
        let mut pile = vec![depart];
        while let Some(i) = pile.pop() {
            for &j in &voisins[i] {
                if comp[j as usize] == usize::MAX {
                    comp[j as usize] = nb;
                    pile.push(j as usize);
                }
            }
        }
        nb += 1;
    }

    // Ce que chaque composante porte : des bornes, et des vias distincts.
    let mut bornes = vec![false; nb];
    for i in 0..n {
        if fixes[i].is_some() || injecte[i] != 0.0 {
            bornes[comp[i]] = true;
        }
    }
    let mut vias_de: Vec<Vec<usize>> = vec![Vec::new(); nb];
    for (k, m) in vias_montes.iter().enumerate() {
        for &(ia, ib) in &m.liens {
            for c in [comp[ia], comp[ib]] {
                if vias_de[c].last() != Some(&k) {
                    vias_de[c].push(k);
                }
            }
        }
    }

    let mut tailles = vec![0usize; nb];
    for i in 0..n {
        tailles[comp[i]] += 1;
    }

    // LE COURANT DE CHAQUE VIA, une fois : il sert deux fois plus bas.
    let courant: Vec<f64> = vias_montes.iter().map(|m| courant_du_via(m, potentiel).abs()).collect();

    let mut culs = Culs { morceaux: 0, noeuds: 0, pire_courant: 0.0, pire_via: String::new() };
    for c in 0..nb {
        if bornes[c] || vias_de[c].len() != 1 {
            continue;
        }
        culs.morceaux += 1;
        culs.noeuds += tailles[c];
        let k = vias_de[c][0];
        if courant[k] > culs.pire_courant {
            culs.pire_courant = courant[k];
            culs.pire_via = texte(vias_montes[k].via, "repere", "repere", "?");
        }
    }
    culs
}

/// La somme, sur les paires qu'il relie, de g (V_a - V_b).
fn courant_du_via(m: &ViaMonte, potentiel: &[f64]) -> f64 {
    let mut i_via = 0.0;
    for &(ia, ib) in &m.liens {
        i_via += m.g * (potentiel[ia] - potentiel[ib]);
    }
    i_via
}

/// Les arguments nommes de `resoudre_dc`, avec leurs valeurs par defaut de Python.
///
/// `sources`    [{x, y, couche, net, courant, rayon}] -- courant INJECTE, en A
/// `references` [{x, y, couche, net, tension, rayon}] -- Dirichlet, en V
/// `vias`       [{x, y, couche_a, couche_b, percage, placage, hauteur}]
/// `liaisons`   [{a: plot, b: plot, resistance, repere}] -- un composant EN
///              SERIE entre deux nets (ferrite, fusible, shunt) : une
///              resistance localisee entre les noeuds de ses deux pastilles
/// `externes`   les couches a l'air libre ; par defaut la premiere et la derniere presentes
/// `pas`        cote du carreau, en metres ; par defaut un centieme de la
///              plus grande dimension du cuivre analyse
/// `thermique`  {modele, k_stratifie, epaisseur_stratifie, cuivre_etaleur,
///              h_surface} -- en METRES et en W/(m.K) ; voir `thermique`
#[derive(Clone, Copy)]
pub struct Entrees<'a> {
    pub sources: Option<&'a Json>,
    pub references: Option<&'a Json>,
    pub vias: Option<&'a Json>,
    pub externes: Option<&'a Json>,
    pub pas: Option<f64>,
    pub rho: f64,
    pub thermique: Option<&'a Json>,
    pub liaisons: Option<&'a Json>,
}

impl Default for Entrees<'_> {
    fn default() -> Self {
        Entrees { sources: None, references: None, vias: None, externes: None, pas: None, rho: RESISTIVITE_CUIVRE, thermique: None, liaisons: None }
    }
}

/// `journal` : la fonction d'ecriture (celle de stderr, par exemple), ou None.
pub type Journal<'a> = Option<&'a mut dyn FnMut(&str)>;

/// Une borne et ses noeuds.
struct Borne {
    repere: String,
    composant: String,
    role: &'static str,
    couche: i64,
    consigne: f64,
    noeuds: Vec<usize>,
}

/// Le potentiel dans le cuivre, et la chute par net.
///
/// `polygones`  [{vertices, couche, net, epaisseur}] -- en METRES ; le reste est dans `Entrees`.
///
/// LE JOURNAL DIT OU ON EN EST, PAS SEULEMENT CE QU'ON A TROUVE. Un calcul de
/// soixante mille noeuds prend une dizaine de secondes, et pendant ce temps la
/// page n'a qu'un bouton grise : rien ne distingue « ca travaille » de « c'est
/// bloque ». Une ligne par ETAPE, avec sa taille et sa duree, rend la
/// difference visible dans le terminal -- et, quand ca coince, dit LAQUELLE
/// des etapes coince. Meme convention que `simulation_em.simuler`.
///
/// Rend {potentiel, chute_par_net, courant_par_net, noeuds, aretes, pas,
/// reference_nets, avertissements}.
pub fn resoudre_dc(polygones: &Json, entrees: &Entrees, mut journal: Journal) -> Result<Json, ErreurDC> {
    let polys = normaliser(polygones)?;
    if polys.is_empty() {
        return Err(ErreurDC::new("Aucun polygone de cuivre exploitable.", "Un polygone demande au moins trois sommets."));
    }
    let sources = elements_ou_rien(entrees.sources)?;
    let references = elements_ou_rien(entrees.references)?;
    let vias = elements_ou_rien(entrees.vias)?;
    let liaisons = elements_ou_rien(entrees.liaisons)?;
    let rho = entrees.rho;

    if references.is_empty() {
        return Err(ErreurDC::new(
            "Aucune référence de tension : le problème est flottant.",
            "Une chute de tension se mesure ENTRE deux points. Déclarez au moins un point de référence — la broche de masse \
             du régulateur, en général.",
        ));
    }

    let debut = Instant::now();
    let mut etape = debut;

    // Une etape, avec le temps qu'elle a pris. Le temps CUMULE ne dit pas
    // laquelle coince ; le temps de l'etape, oui.
    let mut dire = |journal: &mut Journal, texte: String| {
        if let Some(journal) = journal {
            let maintenant = Instant::now();
            journal(&format!("  dc : {} ({:.2} s)\n", texte, (maintenant - etape).as_secs_f64()));
            etape = maintenant;
        }
    };

    let pas = match entrees.pas {
        Some(pas) => pas,
        None => {
            let (x0, y0, x1, y1) = boite(&polys);
            max_py(x1 - x0, y1 - y0) / 100.0
        }
    };
    if let Some(journal) = &mut journal {
        journal(&format!(
            "  dc : {} forme(s), {} via(s), {} borne(s), pas {:.4} mm\n",
            polys.len(),
            vias.len(),
            sources.len() + references.len(),
            pas * 1e3
        ));
    }
    let maillage = mailler(&polys, pas)?;
    let n = maillage.coords.len();
    let nets = &maillage.nets;
    dire(&mut journal, format!("maillage : {} noeuds sur {} couche(s), {} liaisons de trame", n, maillage.couches.len(), maillage.aretes.len()));

    // -- la matrice de conductance -----------------------------------------
    let mut hors: Vec<(u32, u32, f64)> = Vec::with_capacity(2 * maillage.aretes.len());
    let mut diagonale = vec![0.0; n];
    let mut aretes_posees: Vec<(u32, u32)> = Vec::with_capacity(maillage.aretes.len());

    let mut relier = |a: usize, b: usize, g: f64| {
        if g <= 0.0 || a == b {
            return;
        }
        hors.push((a as u32, b as u32, -g));
        hors.push((b as u32, a as u32, -g));
        diagonale[a] += g;
        diagonale[b] += g;
        aretes_posees.push((a as u32, b as u32));
    };

    for &(a, b, g) in &maillage.aretes {
        relier(a as usize, b as usize, g * (RESISTIVITE_CUIVRE / rho));
    }

    let mut avertissements: Vec<String> = Vec::new();
    let mut vias_relies = 0usize;
    // CE QU'ON GARDE DE CHAQUE VIA, et pourquoi. Un via relie deja la trame ;
    // ce qui manquait, c'est de pouvoir DIRE apres coup ce qui l'a traverse.
    // On note donc les paires de noeuds qu'il a reliees et la conductance de
    // chacune : le courant s'en deduit exactement une fois le potentiel connu,
    // sans refaire le moindre calcul de geometrie.
    let mut vias_montes: Vec<ViaMonte> = Vec::new();
    let mut vias_ignores: Vec<(&Objet, f64, f64, i64, i64, String)> = Vec::new();
    for v in &vias {
        let v = objet(v)?;
        let ca = entier(v, "couche_a", "layer_a")?;
        let cb = entier(v, "couche_b", "layer_b")?;
        let x = v.get("x").map_or(Ok(0.0), float_py)?;
        let y = v.get("y").map_or(Ok(0.0), float_py)?;
        if ca == cb {
            vias_ignores.push((v, x, y, ca, cb, "ses deux couches sont la même".to_string()));
            continue;
        }
        let rayon = flottant(v, "percage", "drill", 0.3e-3)? / 2.0;
        // LA PORTEE DU VIA. Un via s'accroche au cuivre QU'IL TRAVERSE, pas au
        // cuivre le plus proche : sans borne, un via pose loin de tout se
        // rabattait sur le carreau le plus proche et fabriquait une liaison
        // verticale entre deux morceaux qui ne se touchent pas. Un carreau de
        // tolerance au-dela de la pastille suffit -- c'est la trame qui est
        // grossiere, pas le via qui est ailleurs.
        let portee = rayon + maillage.pas;
        let net = match v.get("net") {
            None | Some(Json::Nul) => None,
            Some(Json::Texte(t)) if t.is_empty() || t == "?" => None,
            Some(n) => Some(str_py(n)),
        };
        let mut plot = Plot { x, y, couche: ca, net, boite: None, rayon: 0.0 };
        let na = noeuds_du_plot(&maillage, &plot, Some(rayon), Some(portee));
        plot.couche = cb;
        let nb = noeuds_du_plot(&maillage, &plot, Some(rayon), Some(portee));
        if na.is_empty() || nb.is_empty() {
            // UN VIA QUI NE TROUVE PAS SON CUIVRE N'EST PAS UN DETAIL : c'est
            // le chemin vertical qui manque, et le resultat sera celui d'une
            // carte ou ce via n'existe pas. On le dit au lieu de l'oublier.
            let manque = format!("la couche {}", if na.is_empty() { ca } else { cb });
            vias_ignores.push((v, x, y, ca, cb, format!("aucun cuivre du net sous le via sur {}", manque)));
            continue;
        }
        let r = resistance_via(v)?;
        if r <= 0.0 {
            vias_ignores.push((v, x, y, ca, cb, "sa résistance est nulle".to_string()));
            continue;
        }
        // Le via debouche sur PLUSIEURS carreaux de chaque cote : sa
        // conductance se repartit entre les paires, sinon un via fin devient un
        // point d'ancrage qui court-circuite la trame.
        let paires = na.len().max(nb.len());
        let g = 1.0 / (r * paires as f64);
        let mut liens = Vec::with_capacity(paires);
        for k in 0..paires {
            let (ia, ib) = (na[k % na.len()], nb[k % nb.len()]);
            relier(ia, ib, g);
            liens.push((ia, ib));
        }
        vias_relies += 1;
        vias_montes.push(ViaMonte { via: v, x, y, couche_a: ca, couche_b: cb, resistance: r, g, liens });
    }

    // -- LES COMPOSANTS EN SERIE ---------------------------------------------
    // Meme montage qu'un via : la resistance se repartit entre les paires de
    // noeuds des deux pastilles, et les liens sont gardes pour rendre le
    // courant apres coup. Une pastille hors du cuivre est un refus : sans elle,
    // le net d'aval n'est plus alimente et le calcul tomberait sur un ilot
    // flottant, avec un message qui ne nommerait pas la cause.
    struct LiaisonMontee {
        repere: String,
        resistance: f64,
        g: f64,
        liens: Vec<(usize, usize)>,
    }
    let mut liaisons_montees: Vec<LiaisonMontee> = Vec::new();
    let rien = Json::Objet(Objet::new());
    for li in &liaisons {
        let li = objet(li)?;
        let bout = |cle: &str| -> Py<Vec<usize>> {
            Ok(noeuds_du_plot(&maillage, &Plot::lire(li.get(cle).filter(|v| v.vrai()).unwrap_or(&rien))?, None, None))
        };
        let (na, nb) = (bout("a")?, bout("b")?);
        let repere = texte(li, "repere", "repere", "?");
        if na.is_empty() || nb.is_empty() {
            return Err(ErreurDC::new(
                format!("Le composant en série {} ne touche pas le cuivre de ses deux nets.", repere),
                "Vérifiez que ses deux pastilles sont routées.",
            ));
        }
        let r = max_py(flottant(li, "resistance", "resistance", 0.0)?, 1e-6);
        let paires = na.len().max(nb.len());
        let g = 1.0 / (r * paires as f64);
        let mut liens = Vec::with_capacity(paires);
        for k in 0..paires {
            let (ia, ib) = (na[k % na.len()], nb[k % nb.len()]);
            relier(ia, ib, g);
            liens.push((ia, ib));
        }
        liaisons_montees.push(LiaisonMontee { repere, resistance: r, g, liens });
    }

    // -- les references (Dirichlet) et les sources (Neumann) ----------------
    let mut fixes: Vec<Option<f64>> = vec![None; n];
    let mut refs_nets: BTreeSet<&str> = BTreeSet::new();
    let mut tension_net: Vec<Option<f64>> = vec![None; maillage.noms.len()];
    // CHAQUE BORNE GARDE SES NOEUDS. Sans cela on ne saurait pas dire, apres
    // coup, QUELLE TENSION ARRIVE a un consommateur donne -- et c'est
    // exactement la question qu'on pose a ce calcul : « j'ai 3,3 V au
    // regulateur, combien en reste-t-il la-bas ? ». La chute par net n'y
    // repond pas des qu'il y a plus d'un consommateur.
    let mut points: Vec<Borne> = Vec::new();
    for reference in &references {
        let o = objet(reference)?;
        let couche = entier(o, "couche", "layer")?;
        let noeuds = noeuds_du_plot(&maillage, &Plot::lire(reference)?, None, None);
        if noeuds.is_empty() {
            avertissements.push(format!("Une référence tombe hors du cuivre de la couche {} : elle est ignorée.", couche));
            continue;
        }
        let tension = flottant(o, "tension", "voltage", 0.0)?;
        for &i in &noeuds {
            fixes[i] = Some(tension);
            refs_nets.insert(maillage.net(i));
            tension_net[nets[i] as usize].get_or_insert(tension);
        }
        points.push(Borne {
            repere: texte(o, "repere", "repere", ""),
            composant: texte(o, "composant", "composant", ""),
            role: "tension",
            couche,
            consigne: tension,
            noeuds,
        });
    }

    if fixes.iter().all(Option::is_none) {
        return Err(ErreurDC::new(
            "Aucune référence ne tombe sur le cuivre analysé.",
            "Vérifiez les coordonnées des points de référence, ou élargissez la sélection de cuivre.",
        ));
    }

    let mut injecte = vec![0.0; n];
    let mut courant_par_net: Vec<(u32, f64)> = Vec::new(); // un dict : dans l'ordre de premiere pose
    for src in &sources {
        let o = objet(src)?;
        let courant = flottant(o, "courant", "current", 0.0)?;
        if courant == 0.0 {
            continue;
        }
        let couche = entier(o, "couche", "layer")?;
        let noeuds = noeuds_du_plot(&maillage, &Plot::lire(src)?, None, None);
        if noeuds.is_empty() {
            avertissements.push(format!("Une injection tombe hors du cuivre de la couche {} : elle est ignorée.", couche));
            continue;
        }
        // AU PRORATA DU CUIVRE de chaque carreau (voir `mailler`).
        let mut couv: Vec<f64> = noeuds.iter().map(|i| maillage.couvertures[*i]).collect();
        if !(py::sum(couv.iter().copied()) > 0.0) {
            couv = vec![1.0; noeuds.len()];
        }
        let total = py::sum(couv.iter().copied());
        for (&i, c) in noeuds.iter().zip(&couv) {
            injecte[i] += courant * c / total;
            match courant_par_net.iter_mut().find(|(net, _)| *net == nets[i]) {
                Some((_, somme)) => *somme += courant * c / total,
                None => courant_par_net.push((nets[i], 0.0 + courant * c / total)),
            }
        }
        points.push(Borne {
            repere: texte(o, "repere", "repere", ""),
            composant: texte(o, "composant", "composant", ""),
            role: "courant",
            couche,
            consigne: courant,
            noeuds,
        });
    }

    if !injecte.iter().any(|v| *v != 0.0) {
        avertissements.push(
            "Aucun courant injecté : le potentiel est celui des références, et la chute est nulle partout. C'est un \
             résultat juste, et il ne dit rien."
                .to_string(),
        );
    }

    let laplacien = Csr::laplacien(n, &hors, &diagonale);
    drop(hors);

    // LES INCONNUES DE DIRICHLET SORTENT DU SYSTEME. Les ecraser ligne par
    // ligne -- ce que faisait la 1.0.0 -- rend la matrice non symetrique, et un
    // gradient conjugue sur une matrice non symetrique ne converge pas vers la
    // solution : il converge vers autre chose, sans le dire.
    // TOUT NOEUD LIBRE DOIT VOIR UNE REFERENCE. Un ilot de cuivre qui n'en
    // atteint aucune -- une couche sans via, un morceau detache par une
    // decoupe -- rend la sous-matrice SINGULIERE. Le gradient conjugue ne le
    // signale pas : il s'arrete sur un residu petit et rend un potentiel de
    // plusieurs milliards de volts, ce qui est exactement le genre de chiffre
    // qu'un panneau affiche sans broncher. On le cherche donc AVANT, par un
    // simple parcours en largeur depuis les references.
    let mut voisins: Vec<Vec<u32>> = vec![Vec::new(); n];
    for &(a, b) in &aretes_posees {
        voisins[a as usize].push(b);
        voisins[b as usize].push(a);
    }
    let mut vus = vec![false; n];
    let mut pile: Vec<usize> = (0..n).filter(|i| fixes[*i].is_some()).collect();
    for &i in &pile {
        vus[i] = true;
    }
    while let Some(i) = pile.pop() {
        for &j in &voisins[i] {
            if !vus[j as usize] {
                vus[j as usize] = true;
                pile.push(j as usize);
            }
        }
    }
    let mut orphelins: Vec<usize> = (0..n).filter(|i| !vus[*i]).collect();
    let nets_de = |noeuds: &[usize]| -> Vec<&str> {
        let noms: BTreeSet<&str> = noeuds.iter().map(|i| maillage.net(*i)).collect();
        noms.into_iter().take(4).collect()
    };
    // UN ILOT QUI NE PORTE AUCUN COURANT n'a pas de potentiel defini, mais il
    // n'en a pas besoin : rien n'y circule. On le tient a la consigne de son
    // net, et on le dit. Seul un ilot qui porte une charge est un refus.
    if !orphelins.is_empty() && !orphelins.iter().any(|i| injecte[*i] != 0.0) {
        for &i in &orphelins {
            fixes[i] = Some(tension_net[nets[i] as usize].unwrap_or(0.0));
        }
        avertissements.push(format!(
            "{} nœud(s) de cuivre isolé(s) ({}) : ni référence ni courant, ils sont tenus à la consigne de leur net et ne \
             portent rien. Ce sont des îlots que rien de relié au net ne raccorde — souvent des vias de couture sans net, \
             écartés.",
            orphelins.len(),
            nets_de(&orphelins).join(", ")
        ));
        orphelins.clear();
    }
    if !orphelins.is_empty() {
        // LES BORNES POSEES SUR LE CUIVRE DETACHE : c'est par elles qu'on
        // retrouve l'ilot sur la carte, un compte de noeuds ne se cherche pas.
        let detachees: Vec<&str> = points
            .iter()
            .filter(|p| !p.repere.is_empty() && p.noeuds.iter().any(|i| !vus[*i]))
            .map(|p| p.repere.as_str())
            .collect();
        let bornes = if detachees.is_empty() {
            String::new()
        } else {
            format!(
                " Bornes sur ce cuivre : {}{}.",
                detachees.iter().take(6).copied().collect::<Vec<_>>().join(", "),
                if detachees.len() > 6 { format!(", et {} autre(s)", detachees.len() - 6) } else { String::new() }
            )
        };
        return Err(ErreurDC::new(
            format!("{} nœud(s) de cuivre n'atteignent aucune référence : {}.{}", orphelins.len(), nets_de(&orphelins).join(", "), bornes),
            "Ce cuivre est électriquement flottant — une couche sans via qui la relie, ou un morceau détaché par une \
             découpe. Ajoutez une référence sur cet îlot, un via qui le raccorde, ou retirez-le de la sélection.",
        ));
    }

    let libres: Vec<usize> = (0..n).filter(|i| fixes[*i].is_none()).collect();
    let mut potentiel: Vec<f64> = fixes.iter().map(|v| v.unwrap_or(0.0)).collect();
    if !libres.is_empty() {
        let v_fixe = potentiel.clone();
        // second = injecte[libres] - laplacien[libres, :].dot(v_fixe) ; reduit = laplacien[libres, :][:, libres]
        let mut rang_libre = vec![VIDE; n];
        for (r, &i) in libres.iter().enumerate() {
            rang_libre[i] = r as u32;
        }
        let mut reduit = Csr { debuts: Vec::with_capacity(libres.len() + 1), colonnes: Vec::new(), valeurs: Vec::new() };
        reduit.debuts.push(0);
        let mut second = Vec::with_capacity(libres.len());
        for &i in &libres {
            let (cols, vals) = laplacien.ligne(i);
            let mut produit = 0.0;
            for (c, v) in cols.iter().zip(vals) {
                produit += v * v_fixe[*c as usize];
                if rang_libre[*c as usize] != VIDE {
                    reduit.colonnes.push(rang_libre[*c as usize]);
                    reduit.valeurs.push(*v);
                }
            }
            reduit.debuts.push(reduit.colonnes.len());
            second.push(injecte[i] - produit);
        }
        let imposees = n - libres.len();
        dire(&mut journal, format!("systeme monte : {} inconnues, {} imposees", libres.len(), imposees));
        // Un ilot de cuivre sans reference et sans via reste flottant : sa
        // sous-matrice est singuliere. On le dit plutot que de laisser le CG
        // divaguer.
        let mut echelle = 0.0;
        for v in &second {
            if v.abs() > echelle || v.is_nan() {
                echelle = v.abs();
            }
        }
        let x = resoudre_systeme(&reduit, &second, max_py(echelle * 1e-14, 1e-18))?;
        for (&i, v) in libres.iter().zip(&x) {
            potentiel[i] = *v;
        }
        dire(&mut journal, "gradient conjugue : converge".to_string());
    }

    // -- LE DETAIL VIA PAR VIA ----------------------------------------------
    // Le courant qui traverse le via est la somme, sur les paires qu'il relie,
    // de g (V_a - V_b). Comme les `paires` liens sont en PARALLELE et portent
    // chacun 1/(r*paires), l'ensemble a bien la resistance r du via : la chute
    // vaut donc I*r exactement, et la puissance r*I^2. Le signe suit le sens
    // couche_a -> couche_b ; on rend aussi sa valeur absolue, qui est celle
    // qu'on lit dans un tableau.
    // LE PERCAGE VOYAGE AVEC LE RESULTAT, et ce n'est pas decoratif : la page
    // s'en sert pour savoir OU un via commence et ou il finit a l'ecran -- c'est
    // le rayon du disque sous lequel la sonde doit rendre les valeurs de CE
    // via. Sans lui, la page devrait retrouver le via dans sa propre geometrie
    // et esperer que les deux listes soient encore dans le meme ordre.
    let percage_de = |v: &Objet| flottant(v, "percage", "drill", 0.3e-3);

    let mut detail_vias: Vec<(f64, f64, f64, Json)> = Vec::new(); // (courant, x, y, la ligne)
    for m in &vias_montes {
        let i_via = courant_du_via(m, &potentiel);
        let r = m.resistance;
        detail_vias.push((i_via, m.x, m.y, objet! {
            "x" => m.x, "y" => m.y,
            "couche_a" => m.couche_a, "couche_b" => m.couche_b,
            "net" => texte(m.via, "net", "net", "?"),
            "repere" => texte(m.via, "repere", "repere", ""),
            "percage" => percage_de(m.via)?,
            // le placage avec le percage : la page en tire la tenue du tube
            "placage" => flottant(m.via, "placage", "plating", PLACAGE_DEFAUT)?,
            // UN PERCAGE SUPPOSE N'EST PAS UNE COTE, et la resistance qui en
            // decoule non plus : R va comme 1/A, donc un diametre devine a
            // cinquante pour cent pres se paie double sur l'ohm. Le drapeau
            // voyage avec le via pour que le tableau MARQUE ces lignes --
            // sinon 0,076 mOhm et 0,295 mOhm se lisent avec le meme aplomb,
            // et rien ne dit que le premier repose sur un trou devine.
            "percage_suppose" => drapeau(m.via, "percage_suppose"),
            // LA PORTEE SUPPOSEE EST LE SEUL CAS OU LE RESEAU PEUT PORTER UN
            // CHEMIN QUI N'EXISTE PAS. Un percage dont le fichier ne declare
            // pas les couches est pris traversant : si le trou est borgne,
            // cette liaison est INVENTEE, et le courant qu'elle porte l'est
            // aussi. Le drapeau part avec le via pour que la page puisse dire
            // QUELLE part du resultat repose sur cette hypothese.
            "portee_supposee" => drapeau(m.via, "portee_supposee"),
            "resistance" => r,
            "courant" => i_via,
            "chute" => i_via.abs() * r,
            "puissance" => r * i_via * i_via,
            "relie" => true,
        }));
    }
    for (v, x, y, ca, cb, motif) in &vias_ignores {
        detail_vias.push((0.0, *x, *y, objet! {
            "x" => *x, "y" => *y, "couche_a" => *ca, "couche_b" => *cb,
            "net" => texte(v, "net", "net", "?"),
            "repere" => texte(v, "repere", "repere", ""),
            "percage" => percage_de(v)?,
            "percage_suppose" => drapeau(v, "percage_suppose"),
            "portee_supposee" => drapeau(v, "portee_supposee"),
            "resistance" => 0.0, "courant" => 0.0, "chute" => 0.0, "puissance" => 0.0,
            "relie" => false, "motif" => motif.as_str(),
        }));
    }
    // Le plus charge en tete : c'est celui qu'on cherche, et le seul ordre qui
    // ne demande pas de relire tout le tableau.
    detail_vias.sort_by(|a, b| {
        (-a.0.abs(), a.1, a.2).partial_cmp(&(-b.0.abs(), b.1, b.2)).unwrap_or(std::cmp::Ordering::Equal)
    });
    if !vias_ignores.is_empty() {
        avertissements.push(format!(
            "{} via(s) n'ont pas été montés dans le réseau : le chemin vertical qu'ils portent n'est PAS dans ce résultat.",
            vias_ignores.len()
        ));
    }

    // -- LA DENSITE ET L'ECHAUFFEMENT ---------------------------------------
    // QUELLES COUCHES SONT A L'AIR LIBRE. Une couche exterieure perd de la
    // chaleur par sa propre face nue, l'interne non : les deux modeles s'en
    // servent, et pas dans la meme mesure. IPC-2221 double le coefficient d'une
    // externe (0,048 contre 0,024), ce qui rend une interne 4,83 fois plus
    // chaude -- la seule facon d'ecarter deux couches autant est de supposer que
    // le stratifie n'evacue rien. Le modele d'etalement, lui, n'ajoute que
    // h*W : les deux couches en ressortent voisines, ce qui est ce que la
    // campagne IPC-2152 a mesure. C'est l'appelant qui tranche -- il a
    // l'empilage --, par `externes`.
    //
    // A DEFAUT, la premiere et la derniere couche PRESENTES. C'est vrai d'une
    // carte entiere ; ce ne l'est pas d'une selection qui ne porterait que des
    // couches internes, et le resultat emporte donc `couches_externes` pour
    // qu'on puisse lire ce qui a ete suppose.
    let ext: BTreeSet<i64> = match entrees.externes.filter(|e| !matches!(e, Json::Nul)) {
        None => [maillage.couches.first(), maillage.couches.last()].into_iter().flatten().copied().collect(),
        Some(externes) => elements(externes)?.iter().map(int_py).collect::<Py<_>>()?,
    };
    let th = thermique(entrees.thermique)?;
    let Echauffements { densites, largeurs, etalement, charte, emballes } = densite_et_echauffement(&maillage, &potentiel, rho, &ext, &th);
    // -- LE CONTROLE DES CULS-DE-SAC ---------------------------------------
    // Voir `_culs_de_sac` : un morceau de cuivre sans issue ne peut porter
    // aucun courant. Ce n'est pas la loi qu'on a resolue -- on a resolu un
    // systeme lineaire --, donc la verifier apprend quelque chose.
    let culs = culs_de_sac(&maillage, &vias_montes, &fixes, &injecte, &potentiel);
    dire(&mut journal, format!("culs-de-sac : {} morceau(x) sans issue, le pire via y porte {} A", culs.morceaux, fmt_g(culs.pire_courant, 3)));
    // LE SEUIL EST CELUI DU SOLVEUR, PAS UN CONFORT. Le gradient conjugue
    // s'arrete sur un residu relatif de 1e-12 ; un microampere sur un rail
    // d'un ampere est mille fois au-dessus de ce bruit. Au-dela, ce n'est pas
    // de l'arrondi : c'est un chemin qui n'existe pas.
    if culs.pire_courant > 1e-6 {
        avertissements.push(format!(
            "INCOHERENCE : le via {} alimente un morceau de cuivre SANS ISSUE — ni source, ni charge, ni autre liaison \
             verticale — et y porte pourtant {} A. Un cul-de-sac ne peut rien consommer : ce courant n'existe pas, et ce \
             resultat porte un chemin qui n'est pas sur la carte. C'est un defaut du calcul, pas de la carte.",
            culs.pire_via,
            fmt_g(culs.pire_courant, 4)
        ));
    }
    dire(&mut journal, format!("densite et echauffement : modele '{}', {} couche(s) exterieure(s)", th.modele, ext.len()));
    let montees = if th.modele == "ipc2221" { &charte } else { &etalement };
    if emballes > 0 {
        avertissements.push(format!(
            "{} conducteur(s) en EMBALLEMENT THERMIQUE : la résistivité du cuivre monte plus vite que la carte n'évacue, et \
             la température rendue pour eux est un PLANCHER, pas une valeur. Élargissez ce cuivre — le modèle n'a plus de \
             solution stable.",
            emballes
        ));
    }

    // -- ce qu'on en dit ----------------------------------------------------
    // Par net, dans l'ordre des noms : l'etendue du potentiel, et le pire point (plus bas).
    let nb_nets = maillage.noms.len();
    let mut etendues: Vec<Option<(f64, f64)>> = vec![None; nb_nets]; // (min, max)
    let mut pires_rangs: Vec<Option<(usize, usize)>> = vec![None; nb_nets]; // (kd, kt)
    for k in 0..n {
        let net = nets[k] as usize;
        let v = potentiel[k];
        etendues[net] = Some(match etendues[net] {
            None => (v, v),
            Some((a, b)) => (if v < a { v } else { a }, if v > b { v } else { b }),
        });
        pires_rangs[net] = Some(match pires_rangs[net] {
            None => (k, k),
            Some((kd, kt)) => (if densites[k] > densites[kd] { k } else { kd }, if montees[k] > montees[kt] { k } else { kt }),
        });
    }
    let mut noms_tries: Vec<usize> = (0..nb_nets).filter(|k| etendues[*k].is_some()).collect();
    noms_tries.sort_by(|a, b| maillage.noms[*a].cmp(&maillage.noms[*b]));
    let mut chute_par_net = Objet::new();
    let mut chute_max: Option<f64> = None;
    for &k in &noms_tries {
        let (a, b) = etendues[k].unwrap_or((0.0, 0.0));
        chute_par_net.insert(maillage.noms[k].clone(), Json::Flottant(b - a));
        chute_max = Some(chute_max.map_or(b - a, |m| max_py(m, b - a)));
    }

    // CE QUI ARRIVE A CHAQUE BORNE. Le potentiel moyen sur ses noeuds -- une
    // pastille en couvre plusieurs, et ils ne sont pas tous au meme potentiel
    // exactement. L'ECART A LA CONSIGNE est ce qu'on lit : pour un
    // consommateur, c'est ce que le cuivre lui a coute.
    // LA CONSIGNE DE SON PROPRE NET : la masse se mesure a ses 0 V, pas aux
    // 3,3 V du rail calcule avec elle. Un net sans reference (l'aval d'une
    // ferrite) se rapporte a la plus haute du calcul, celle qui l'alimente.
    let mut reference_haute: Option<f64> = None;
    let mut consigne_du_net: Vec<Option<f64>> = vec![None; nb_nets];
    for p in points.iter().filter(|p| p.role == "tension") {
        reference_haute = Some(reference_haute.map_or(p.consigne, |m| max_py(m, p.consigne)));
        let net = nets[p.noeuds[0]] as usize;
        consigne_du_net[net] = Some(max_py(consigne_du_net[net].unwrap_or(p.consigne), p.consigne));
    }
    let reference_haute = reference_haute.unwrap_or(0.0);
    let mut bornes = Vec::new();
    for pt in &points {
        let v = py::sum(pt.noeuds.iter().map(|i| potentiel[*i])) / pt.noeuds.len() as f64;
        let net = nets[pt.noeuds[0]] as usize;
        bornes.push(objet! {
            "repere" => pt.repere.as_str(),
            "composant" => pt.composant.as_str(),
            "net" => maillage.noms[net].as_str(),
            "role" => pt.role,
            "couche" => pt.couche,
            "consigne" => pt.consigne,
            "tension" => v,
            "chute" => consigne_du_net[net].unwrap_or(reference_haute) - v,
        });
    }

    let mut detail_liaisons = Vec::new();
    for m in &liaisons_montees {
        let i_li = py::sum(m.liens.iter().map(|(ia, ib)| m.g * (potentiel[*ia] - potentiel[*ib])));
        detail_liaisons.push(objet! {
            "repere" => m.repere.as_str(),
            "resistance" => m.resistance,
            "courant" => i_li,
            "chute" => i_li.abs() * m.resistance,
        });
    }

    // Le pire point de chaque net, et OU il est : c'est ce qu'on lit d'abord,
    // et le chercher soi-meme dans dix mille nombres n'est pas une lecture.
    let mut pires = Objet::new();
    let mut pire: Option<f64> = None;
    let lieu = |k: usize| Json::Liste(vec![maillage.coords[k].0.into(), maillage.coords[k].1.into(), maillage.coords[k].2.into()]);
    for &net in &noms_tries {
        let Some((kd, kt)) = pires_rangs[net] else { continue };
        pire = Some(pire.map_or(montees[kt], |m| max_py(m, montees[kt])));
        pires.insert(maillage.noms[net].clone(), objet! {
            "densite" => densites[kd],
            "densite_en" => lieu(kd),
            "largeur" => largeurs[kd],
            "echauffement" => montees[kt],
            "echauffement_en" => lieu(kt),
            "largeur_chaude" => largeurs[kt],
            // LES DEUX MODELES AU MEME POINT, et non chacun a son maximum : ce
            // qu'on veut lire est de combien ils s'ecartent SUR LE MEME
            // conducteur. Deux maximums pris a deux endroits ne se comparent
            // pas, et l'ecart qu'ils afficheraient serait celui de la
            // geometrie, pas celui des modeles.
            "echauffement_etalement" => etalement[kt],
            "echauffement_ipc2221" => charte[kt],
            "modele_principal" => "etalement",
            "reference_normative" => "ipc2221",
            "ecart_modeles_degres" => py::round((etalement[kt] - charte[kt]).abs(), 2),
        });
    }

    if let Some(journal) = &mut journal {
        // SANS ACCENT NI TYPOGRAPHIE DANS LE JOURNAL, et ce n'est pas de la
        // negligence : `sys.stderr` d'une console Windows peut etre en cp437,
        // ou l'em-dash et le degre n'existent pas -- l'ecriture leverait un
        // UnicodeEncodeError, et la requete entiere echouerait A CAUSE D'UNE
        // LIGNE DE JOURNAL. Un log ne doit jamais pouvoir casser le calcul
        // qu'il decrit.
        journal(&format!(
            "  dc : termine : {} noeuds, {} via(s) relies, chute max {:.2} mV, {:.2} degres, {:.2} s au total\n",
            n,
            vias_relies,
            1e3 * chute_max.unwrap_or(0.0),
            pire.unwrap_or(0.0),
            debut.elapsed().as_secs_f64()
        ));
    }
    Ok(objet! {
        "format" => FORMAT_RESULTAT,
        "version" => VERSION,
        "moteurs" => moteurs(),
        "duree" => debut.elapsed().as_secs_f64(),
        "potentiel" => liste_f(&potentiel),
        "densite" => liste_f(&densites),
        "largeur_locale" => liste_f(&largeurs),
        "echauffement" => liste_f(montees),
        // LES DEUX TABLEAUX PARTENT, TOUJOURS. Changer de modele ne doit pas
        // coûter un aller-retour au serveur : c'est la meme resolution
        // electrique, et seule la lecture thermique differe.
        "echauffement_etalement" => liste_f(&etalement),
        "echauffement_ipc2221" => liste_f(&charte),
        "pire_par_net" => Json::Objet(pires),
        "bornes" => Json::Liste(bornes),
        "couches_externes" => Json::Liste(ext.iter().map(|c| Json::Entier(*c)).collect()),
        // LES CULS-DE-SAC, ET CE QU'ILS PORTENT. C'est la reponse a « pourquoi
        // ce via remonte-t-il du courant a une pastille ou je n'ai regle aucune
        // charge ? » : la page peut desormais montrer que les morceaux SANS
        // ISSUE portent zero, donc que ceux qui portent du courant ne sont pas
        // des culs-de-sac -- le cuivre continue au-dela.
        "culs_de_sac" => objet! {
            "morceaux" => culs.morceaux, "noeuds" => culs.noeuds,
            "pire_courant" => culs.pire_courant, "pire_via" => culs.pire_via.as_str(),
        },
        "thermique" => objet! {
            "modele" => th.modele.as_str(),
            "modele_principal" => "etalement",
            "reference_normative" => "ipc2221",
            "k_stratifie" => th.k_stratifie,
            "epaisseur_stratifie" => th.epaisseur_stratifie,
            "cuivre_etaleur" => th.cuivre_etaleur,
            "h_surface" => th.h_surface,
            "nappe" => th.nappe,
            "g_etalement" => th.g_etalement,
            "longueur_etalement" => th.longueur_etalement,
            "replis" => liste_t(&th.replis),
        },
        "modele_thermique" => phrase_thermique(&th),
        "noeuds" => Json::Liste(maillage.coords.iter().map(|c| Json::Liste(vec![c.0.into(), c.1.into(), c.2.into()])).collect()),
        "nets" => Json::Liste((0..n).map(|k| Json::from(maillage.net(k))).collect()),
        "chute_par_net" => Json::Objet(chute_par_net),
        "courant_par_net" => Json::Objet(courant_par_net.iter().map(|(net, i)| (maillage.noms[*net as usize].clone(), Json::Flottant(*i))).collect()),
        "reference_nets" => Json::Liste(refs_nets.iter().map(|n| Json::from(*n)).collect()),
        "pas" => maillage.pas,
        "couches" => Json::Liste(maillage.couches.iter().map(|c| Json::Entier(*c)).collect()),
        "n_noeuds" => n,
        "n_aretes" => maillage.aretes.len(),
        "n_vias" => vias_relies,
        "vias" => Json::Liste(detail_vias.into_iter().map(|d| d.3).collect()),
        "liaisons" => Json::Liste(detail_liaisons),
        "avertissements" => liste_t(&avertissements),
    })
}

// ==========================================================================
// L'ECHAUFFEMENT D'UN COMPOSANT QUI DISSIPE (estimation, pas une simulation)
//
//   Un composant dissipe P dans le cuivre relie a ses pastilles : un ilot de
//   surface A (pastilles, pistes, plan du net). Deux etapes en serie :
//
//   1. L'ETALEMENT DANS L'ILOT, des pastilles (disque de rayon r0, leur surface)
//      jusqu'au disque equivalent de l'ilot (rayon a = sqrt(A/pi)) : conduction
//      radiale dans la nappe de l'ilot, Ks_i = k_cu*t_cu + Ks (stratifie et
//      plans declares, ceux du modele d'etalement des pistes),
//
//          R_etal = ln(a / r0) / (2 pi Ks_i)                         [K/W]
//
//   2. LA SORTIE DE L'ILOT : ses deux faces (2 h A), et l'AILETTE de la carte
//      autour de lui, de nappe Ks et de longueur L = sqrt(Ks / 2h), alimentee
//      sur le bord d'un disque de rayon a (Bessel modifiees, x = a / L) :
//
//          G = 2 h A + 2 pi Ks x K1(x) / K0(x)                        [W/K]
//
//   LA CARTE EST FINIE : l'ailette ne peut pas evacuer plus que les deux faces
//   de la carte hors de l'ilot, 2 h (A_carte - A) -- sans cette borne, un plan
//   pleine carte sur un disque de 26 mm sortait sa chaleur par une carte
//   imaginaire, et dT etait quatre fois trop bas. A est borne a A_carte.
//
//   dT = P (R_etal + 1 / G). Memes constantes que `_thermique` (k du
//   stratifie, h par face) et memes replis, annonces. Le cuivre etaleur
//   declare (les plans) est dans la nappe de l'AILETTE, pas une seconde fois
//   dans celle de l'ilot : l'ilot compte son propre cuivre.
//
//   CE QUE CE CHIFFRE N'EST PAS. L'ilot est pris rond et isotherme sur son
//   bord, la carte uniforme, sans autre composant qui chauffe a cote, sans le
//   boitier qui rayonne lui-meme (prudent), sans convection forcee. C'est un
//   ordre de grandeur, a +-30 % : de quoi savoir si un plot thermique sur
//   26 mm de disque tient 1 W, pas de quoi signer un dossier thermique.
// ==========================================================================
pub const THERMIQUE_COMPOSANTS_MAX: usize = 2000;

/// L'echauffement estime de chaque composant qui dissipe. Le document est en
/// MILLIMETRES (surfaces en mm2, epaisseurs du bloc thermique en mm, cuivre de
/// l'ilot en um), comme celui de resoudre_document ; rend des kelvins.
///
/// {"thermique": {...}, "composants": [{"ref", "puissance_w", "surface_mm2",
///  "source_mm2", "cuivre_um"}]}
pub fn echauffement_composants(doc: &Json) -> Result<Json, ErreurDC> {
    let doc = objet(doc)?;
    let mut brut = Objet::new();
    // des bornes, pas des valeurs : une conductivite de 1e-300 divisait par zero (erreur 500),
    // l'infini rendait un dT NaN que le navigateur ne relit pas
    const BORNES: [(&str, f64, f64, f64); 4] = [
        ("k_stratifie", 0.01, 500.0, 1.0),
        ("h_surface", 1.0, 1000.0, 1.0),
        ("epaisseur_stratifie", 0.05, 20.0, 1e-3),
        ("cuivre_etaleur", 0.0, 5.0, 1e-3),
    ];
    if let Some(Json::Objet(th_doc)) = doc.get("thermique") {
        for (cle, mini, maxi, echelle) in BORNES {
            let Some(v) = present(th_doc, cle) else { continue };
            let v = float_py(v).map_err(|_| ErreurDC::new(format!("Bloc thermique : « {} » doit être un nombre.", cle), ""))?;
            if !(mini <= v && v <= maxi) {
                return Err(ErreurDC::new(
                    format!("Bloc thermique : « {} » = {} hors de {} à {}.", cle, fmt_g(v, 6), fmt_g(mini, 6), fmt_g(maxi, 6)),
                    "",
                ));
            }
            brut.insert(cle.to_string(), Json::Flottant(v * echelle));
        }
    }
    let th = thermique(Some(&Json::Objet(brut)))?;
    let comps = match doc.get("composants") {
        Some(Json::Liste(l)) if !l.is_empty() => l,
        _ => {
            return Err(ErreurDC::new(
                "Aucun composant qui dissipe.",
                "Donnez une puissance dissipée (W) à au moins un composant.",
            ))
        }
    };
    if comps.len() > THERMIQUE_COMPOSANTS_MAX {
        return Err(ErreurDC::new(format!("Trop de composants : {}, {} au plus.", comps.len(), THERMIQUE_COMPOSANTS_MAX), ""));
    }
    let (ks, h2) = (th.nappe, 2.0 * th.h_surface);
    let ks_lam = th.k_stratifie * th.epaisseur_stratifie;
    let longueur = (ks / h2).sqrt();
    let carte = doc.get("carte_mm2").and_then(|v| float_py(v).ok()).map(|v| v * 1e-6);
    if carte.is_some_and(|c| !(1e-6 <= c && c <= 1.0)) {
        return Err(ErreurDC::new("« carte_mm2 » hors de 1 mm² à 1 m².", ""));
    }
    let mut sortie = Vec::new();
    for c in comps {
        let repere = || c.as_objet().map_or_else(|| str_py(c), |o| o.get("ref").map_or("None".to_string(), str_py));
        let lire = |cle: &str, mini: f64, maxi: f64| -> Result<f64, ErreurDC> {
            let v = c
                .as_objet()
                .and_then(|o| float_py(o.get(cle).unwrap_or(&Json::Nul)).ok())
                .ok_or_else(|| ErreurDC::new(format!("« {} » : un nombre attendu ({}).", cle, repere()), ""))?;
            if !(mini <= v && v <= maxi) || v.is_nan() {
                return Err(ErreurDC::new(
                    format!("« {} » de {} hors bornes : {} ({} à {}).", cle, repere(), fmt_g(v, 6), fmt_g(mini, 6), fmt_g(maxi, 6)),
                    "",
                ));
            }
            Ok(v)
        };
        let p = lire("puissance_w", 0.0, 100.0)?;
        let mut a_m2 = lire("surface_mm2", 1e-3, 1e6)? * 1e-6;
        if let Some(carte) = carte {
            a_m2 = min_py(a_m2, carte);
        }
        let s_m2 = min_py(lire("source_mm2", 1e-4, 1e6)? * 1e-6, a_m2);
        let t_cu = lire("cuivre_um", 1.0, 2000.0)? * 1e-6;
        let (a, r0) = ((a_m2 / PI).sqrt(), (s_m2 / PI).sqrt());
        let ks_i = CONDUCTIVITE_CUIVRE_TH * t_cu + ks_lam;
        let r_etal = if a > r0 { (a / r0).ln() / (2.0 * PI * ks_i) } else { 0.0 };
        let x = a / longueur;
        let mut ailette = 2.0 * PI * ks * x * k1e(x) / k0e(x); // K1/K0, mise a l'echelle : stable
        if let Some(carte) = carte {
            ailette = min_py(ailette, h2 * max_py(carte - a_m2, 0.0));
        }
        let g = h2 * a_m2 + ailette;
        let r_tot = r_etal + 1.0 / g;
        let nom: String = c.as_objet().and_then(|o| o.get("ref")).map_or("?".to_string(), str_py).chars().take(40).collect();
        sortie.push(objet! {
            "ref" => nom, "puissance_w" => p, "surface_mm2" => a_m2 * 1e6,
            "dT" => p * r_tot, "r_th" => r_tot, "r_etalement" => r_etal, "r_sortie" => 1.0 / g,
        });
    }
    let mut modele = "Estimation : étalement radial dans l'îlot de cuivre relié aux pastilles, puis sortie par ses deux faces et \
                      par l'ailette de la carte (modèle d'étalement, Bessel K0/K1), bornée par les faces de la carte hors de \
                      l'îlot. Îlot pris rond, carte uniforme, sans voisin qui chauffe ni convection forcée : un ordre de \
                      grandeur, ±30 %."
        .to_string();
    if !th.replis.is_empty() {
        modele += &format!(" Supposé faute de mieux : {}.", th.replis.join(", "));
    }
    Ok(objet! {
        "composants" => Json::Liste(sortie),
        "thermique" => objet! {
            "k_stratifie" => th.k_stratifie, "h_surface" => th.h_surface,
            "epaisseur_stratifie_mm" => th.epaisseur_stratifie * 1e3,
            "cuivre_etaleur_um" => th.cuivre_etaleur * 1e6,
            "longueur_etalement_mm" => longueur * 1e3, "replis" => liste_t(&th.replis),
        },
        "modele" => modele,
    })
}

/// Le document d'echange (en MILLIMETRES) -> le resultat (en volts).
///
/// C'est le seul endroit ou la conversion mm -> m a lieu, comme
/// `simulation_em.simuler` est le seul a la faire pour les sections.
pub fn resoudre_document(doc: &Json, journal: Journal) -> Result<Json, ErreurDC> {
    let Json::Objet(d) = doc else {
        return Err(ErreurDC::new("Le document envoyé n'est pas un objet JSON.", ""));
    };
    if let Some(format) = present(d, "format").filter(|f| f.as_str() != Some(FORMAT)) {
        return Err(ErreurDC::new(format!("Format inattendu : « {} » au lieu de « {} ».", str_py(format), FORMAT), ""));
    }

    let lu = lire_document_dc(d)?;
    let mm = 1e-3;
    let mut resultat = resoudre_dc(
        &lu.polys,
        &Entrees {
            sources: Some(&lu.sources),
            references: Some(&lu.references),
            vias: Some(&lu.vias),
            liaisons: Some(&lu.liaisons),
            externes: d.get("couches_externes"),
            pas: lu.pas,
            thermique: lu.thermique.as_ref(),
            rho: RESISTIVITE_CUIVRE,
        },
        journal,
    )?;
    let Json::Objet(r) = &mut resultat else { return Ok(resultat) };
    let par_mm = |v: &mut Json| {
        if let Json::Flottant(f) = v {
            *f /= mm;
        }
    };
    // Ce qui repart est en millimetres, comme ce qui est arrive. Les VOLTS,
    // les AMPERES et les OHMS ne se convertissent pas : seules les longueurs.
    if let Some(Json::Liste(noeuds)) = r.get_mut("noeuds") {
        for nd in noeuds {
            if let Json::Liste(nd) = nd {
                nd.iter_mut().take(2).for_each(par_mm);
            }
        }
    }
    r.get_mut("pas").map(par_mm);
    if let Some(Json::Liste(vias)) = r.get_mut("vias") {
        for d in vias {
            if let Json::Objet(d) = d {
                // Le PERCAGE est une longueur, il repart donc en millimetres comme la
                // position. La RESISTANCE est en ohms et ne se convertit pas.
                for cle in ["x", "y", "percage", "placage"] {
                    d.get_mut(cle).map(par_mm);
                }
            }
        }
    }
    // La DENSITE est deja en A/mm2 et l'ECHAUFFEMENT en kelvins : ni l'une ni
    // l'autre ne se convertit. Seules les POSITIONS du pire point le font.
    if let Some(Json::Objet(pires)) = r.get_mut("pire_par_net") {
        for d in pires.values_mut() {
            let Json::Objet(d) = d else { continue };
            for cle in ["densite_en", "echauffement_en"] {
                if let Some(Json::Liste(p)) = d.get_mut(cle) {
                    p.iter_mut().take(2).for_each(par_mm);
                }
            }
        }
    }
    // LES COTES THERMIQUES REPARTENT EN MILLIMETRES, comme elles sont arrivees.
    // Le panneau les affiche pour qu'on les conteste : les lui rendre en metres
    // ferait ecrire « 0,0016 mm de stratifié ».
    if let Some(Json::Objet(th)) = r.get_mut("thermique") {
        for cle in ["epaisseur_stratifie", "cuivre_etaleur", "longueur_etalement"] {
            th.get_mut(cle).map(par_mm);
        }
    }
    Ok(resultat)
}

/// Ce que rend `lire_document_dc` : les arguments de resoudre_dc.
struct Lu {
    polys: Json,
    sources: Json,
    references: Json,
    vias: Json,
    liaisons: Json,
    thermique: Option<Json>,
    pas: Option<f64>,
}

/// Les champs du document (en millimetres) -> ceux de resoudre_dc (en metres).
///
/// Un champ qui n'a pas le type attendu sort en ErreurDC « Document illisible », avec le texte
/// de l'exception que Python levait (TypeError / ValueError / AttributeError).
fn lire_document_dc(doc: &Objet) -> Result<Lu, ErreurDC> {
    let mm = 1e-3;

    let mut polys = Vec::new();
    for p in elements_ou_rien(ou(doc, "polygones", "polygons"))? {
        let p = objet(&p)?;
        let mut sommets = Vec::new();
        for v in elements_ou_rien(ou(p, "vertices", "sommets"))? {
            if let Json::Liste(v) = &v {
                if v.len() >= 2 {
                    sommets.push(Json::Liste(vec![(float_py(&v[0])? * mm).into(), (float_py(&v[1])? * mm).into()]));
                }
            }
        }
        polys.push(objet! {
            "vertices" => Json::Liste(sommets),
            "couche" => entier(p, "couche", "layer")?,
            "net" => texte(p, "net", "net", "?"),
            "epaisseur" => flottant(p, "epaisseur", "thickness", 0.035)? * mm,
            // Le drapeau de decoupe voyage avec la forme. Perdu ici, un plan
            // evide se calculait PLEIN et rendait une chute trop faible : une
            // erreur du cote qui rassure, celui qu'on ne va pas verifier.
            "trou" => drapeau(p, "trou") || drapeau(p, "hole"),
        });
    }

    let point = |s: &Json| -> Py<Json> {
        let s = objet(s)?;
        let mut p = objet! {
            "couche" => entier(s, "couche", "layer")?,
            "net" => texte(s, "net", "net", "?"),
            "courant" => flottant(s, "courant", "current", 0.0)?,
            "tension" => flottant(s, "tension", "voltage", 0.0)?,
            "rayon" => flottant(s, "rayon", "radius", 0.0)? * mm,
            // LE REPERE VOYAGE : c'est lui qui permet au panneau de dire
            // « il reste 3,29 V a U5.1 » plutot que « a une borne ». Perdu
            // ici, le resultat rendait des lignes anonymes.
            "repere" => texte(s, "repere", "ref", ""),
            // le composant qui porte la borne : la page apparie ainsi la
            // broche d'alimentation et la broche de masse d'un meme boitier
            "composant" => texte(s, "composant", "composant", ""),
        };
        let Json::Objet(o) = &mut p else { return Ok(p) };
        // `x` N'EST RECOPIE QUE S'IL EST DONNE : poser un zero par defaut
        // ferait taire le centre de la boite, et un plot rectangulaire se
        // replierait sur le noeud le plus proche de l'origine.
        for cle in ["x", "y"] {
            if let Some(v) = present(s, cle) {
                o.insert(cle.to_string(), Json::Flottant(float_py(v)? * mm));
            }
        }
        if let Some(boite) = ou(s, "boite", "box").filter(|b| b.vrai()) {
            if len_py(boite)? >= 4 {
                let cotes = elements(boite)?.iter().take(4).map(|b| Ok(Json::Flottant(float_py(b)? * mm))).collect::<Py<_>>()?;
                o.insert("boite".to_string(), Json::Liste(cotes));
            }
        }
        Ok(p)
    };
    let points = |cle: &str| -> Py<Json> { Ok(Json::Liste(elements_ou_rien(doc.get(cle))?.iter().map(&point).collect::<Py<_>>()?)) };

    let rien = Json::Objet(Objet::new());
    let mut liaisons = Vec::new();
    for li in elements_ou_rien(doc.get("liaisons"))? {
        let li = objet(&li)?;
        let bout = |cle: &str| point(li.get(cle).filter(|v| v.vrai()).unwrap_or(&rien));
        liaisons.push(objet! {
            "a" => bout("a")?, "b" => bout("b")?,
            "resistance" => flottant(li, "resistance", "resistance", 0.0)?,
            "repere" => texte(li, "repere", "repere", ""),
        });
    }

    let mut vias = Vec::new();
    for v in elements_ou_rien(doc.get("vias"))? {
        let v = objet(&v)?;
        // LE NET DU VIA N'EST PAS DECORATIF : `_noeuds_du_point` s'en sert pour
        // ne raccorder le via qu'au cuivre de SON net. Le perdre ici laissait le
        // via s'accrocher au premier carreau venu, celui d'un autre net compris
        // -- un court-circuit que rien n'aurait signale. `repere` sert au
        // tableau du panneau, et `resistance` est la mesure du fabricant, qui
        // l'emporte sur la formule.
        let mut via = objet! {
            "x" => v.get("x").map_or(Ok(0.0), float_py)? * mm,
            "y" => v.get("y").map_or(Ok(0.0), float_py)? * mm,
            "couche_a" => entier(v, "couche_a", "layer_a")?,
            "couche_b" => entier(v, "couche_b", "layer_b")?,
            "percage" => flottant(v, "percage", "drill", 0.3)? * mm,
            "placage" => flottant(v, "placage", "plating", 0.025)? * mm,
            "hauteur" => flottant(v, "hauteur", "height", 1.6)? * mm,
            "net" => present(v, "net").map_or(Json::Nul, |n| Json::Texte(str_py(n))),
            "repere" => texte(v, "repere", "ref", ""),
            // Deux drapeaux, pas des longueurs : ils ne se convertissent pas.
            "percage_suppose" => drapeau(v, "percage_suppose"),
            "portee_supposee" => drapeau(v, "portee_supposee"),
        };
        // Une resistance mesuree est deja en OHMS : elle ne se convertit pas.
        if let (Some(r), Json::Objet(via)) = (present(v, "resistance"), &mut via) {
            via.insert("resistance".to_string(), Json::Flottant(float_py(r)?));
        }
        vias.push(via);
    }

    // LE BLOC THERMIQUE ARRIVE EN MILLIMETRES comme le reste, et il n'y a que
    // DEUX longueurs dedans : l'epaisseur de stratifie et le cuivre etaleur.
    // La conductivite est en W/(m.K) et l'echange en W/(m2.K) -- ce sont des
    // grandeurs du SI, elles ne se convertissent pas. Les melanger ici serait
    // diviser une conductivite par mille en silence, ce qui rendrait une carte
    // qui n'evacue rien.
    let mut thermique = None;
    if let Some(Json::Objet(th_doc)) = ou(doc, "thermique", "thermal").filter(|t| t.vrai()) {
        let mut th = Objet::new();
        th.insert("modele".to_string(), ou(th_doc, "modele", "model").cloned().unwrap_or(Json::Nul));
        for cle in ["k_stratifie", "h_surface"] {
            if let Some(v) = present(th_doc, cle) {
                th.insert(cle.to_string(), Json::Flottant(float_py(v)?));
            }
        }
        for cle in ["epaisseur_stratifie", "cuivre_etaleur"] {
            if let Some(v) = present(th_doc, cle) {
                th.insert(cle.to_string(), Json::Flottant(float_py(v)? * mm));
            }
        }
        thermique = Some(Json::Objet(th));
    }

    let pas = match doc.get("pas").or_else(|| doc.get("pitch")).filter(|p| p.vrai()) {
        Some(p) => Some(float_py(p)? * mm),
        None => None,
    };
    if let Some(pas) = pas.filter(|p| *p < 1e-6) {
        // 1e-310 mm passait « pas > 0 » puis debordait int(ceil(l / pas))
        return Err(ErreurDC::new(format!("Pas de maillage de {} mm : trop fin.", fmt_g(pas / mm, 6)), "Un micromètre au moins."));
    }
    Ok(Lu { polys: Json::Liste(polys), sources: points("sources")?, references: points("references")?, vias: Json::Liste(vias), liaisons: Json::Liste(liaisons), thermique, pas })
}

/// Le potentiel sur une grille reguliere, pour la peindre.
///
/// Interpolation AU PLUS PROCHE : le potentiel n'est defini que sur le
/// cuivre, et lisser par-dessus le vide inventerait une chute la ou il n'y a
/// pas de conducteur.
pub fn carte_chaleur(resultat: &Json, resolution: usize, couche: Option<i64>) -> Result<Json, ErreurDC> {
    let couche_json = couche.map_or(Json::Nul, Json::Entier);
    let vide = || objet! { "x" => Json::Liste(vec![]), "y" => Json::Liste(vec![]), "V" => Json::Liste(vec![]), "couche" => couche_json.clone() };
    let noeuds = match resultat.get("noeuds") {
        Some(Json::Liste(l)) if !l.is_empty() => l,
        _ => return Ok(vide()),
    };
    let potentiel = resultat["potentiel"].as_liste().map(Vec::as_slice).unwrap_or(&[]);
    let mut pts: Vec<(f64, f64)> = Vec::new();
    let mut v: Vec<f64> = Vec::new();
    for (i, nd) in noeuds.iter().enumerate() {
        if let Some(couche) = couche {
            if int_py(&nd[2])? != couche {
                continue;
            }
        }
        pts.push((float_py(&nd[0])?, float_py(&nd[1])?));
        v.push(float_py(potentiel.get(i).unwrap_or(&Json::Nul))?);
    }
    if pts.is_empty() {
        return Ok(vide());
    }

    let (x_min, x_max, y_min, y_max) = etendue(&pts);
    // np.linspace(a, b, n) : a + k * pas, et b exactement au bout.
    let linspace = |a: f64, b: f64| -> Vec<f64> {
        let div = resolution.saturating_sub(1).max(1) as f64;
        let pas = (b - a) / div;
        (0..resolution)
            .map(|k| if k + 1 == resolution && resolution > 1 { b } else if pas == 0.0 { (k as f64 / div) * (b - a) + a } else { k as f64 * pas + a })
            .collect()
    };
    let x = linspace(x_min, x_max);
    let y = linspace(y_min, y_max);

    let interp = PlusProche::new(&pts);
    let grille: Vec<Json> = y.iter().map(|gy| Json::Liste(x.iter().map(|gx| Json::Flottant(v[interp.rang(*gx, *gy)])).collect())).collect();
    Ok(objet! { "x" => liste_f(&x), "y" => liste_f(&y), "V" => Json::Liste(grille), "couche" => couche_json })
}
