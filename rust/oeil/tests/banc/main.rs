//! Banc d'essai du diagramme de l'oeil (python/oeil.py).
//!
//!     cargo test -p oeil
//!
//! Des etalons que ce code ne fabrique pas lui-meme :
//!
//!   · une ligne adaptee sans pertes laisse passer un oeil PARFAIT : la moitie
//!     de l'excursion a vide (pont diviseur Rs / RL), une UI de large, et le
//!     retard de la ligne ;
//!   · une ligne ouverte au bout, attaquee par 30 ohms : le diagramme en treillis
//!     (Bewley) donne le curseur principal 2 Z0 / (Z0 + Rs) et l'interference
//!     entre bits sum (Gs GL)^m -- l'oeil pire cas en sort A LA MAIN ;
//!   · le pire cas (PDA) n'est jamais plus ouvert que l'oeil PRBS ;
//!   · un CTLE, une pre-accentuation, un DFE OUVRENT un oeil ferme par les pertes ;
//!   · la marge d'un gabarit est exactement son facteur d'agrandissement ;
//!   · `simulation_em.simuler` rend la meme cascade sur une grille imposee que
//!     sur la sienne.
//!
//! Style des autres bancs du depot : pas de harnais, un decompte, un code de retour.
//!
//! Le portage de python/test/banc-oeil.py : memes cas, memes titres, memes etalons, memes
//! tolerances. Trois cas visaient ibis seul et sont dans rust/ibis/src/essais.rs (« la lecture
//! ibis », « le boitier et les broches se lisent », « la chaine de parametres ami s'ecrit et se
//! relit ») ; des autres, les assertions qui ne visaient qu'ibis y sont aussi, et le reste est
//! ici. S'y ajoute la part oeil de python/test/banc-entrees-malformees.py (`malformees`).

#![allow(clippy::excessive_precision, clippy::approx_constant, non_snake_case, clippy::too_many_arguments)]

mod a;
mod b;
mod c;
mod d;
pub mod faux;

pub use em::obj;
pub use em::simulation_em::base::*;
pub use oeil::np::*;
pub use oeil::*;
pub use std::f64::consts::PI;
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
            KO.fetch_add(1, Ordering::Relaxed);
            let message = e.downcast_ref::<String>().cloned().or_else(|| e.downcast_ref::<&str>().map(|s| s.to_string())).unwrap_or_default();
            println!("  KO  {titre}\n        {message}");
        }
    }
}

pub fn proche(vu: f64, attendu: f64, tol: f64, quoi: &str) {
    let ecart = (vu - attendu).abs() / attendu.abs().max(1e-30);
    assert!(ecart < tol, "{quoi} : {vu} contre {attendu}, soit {:.3} % (tolere {:.3} %)", 100.0 * ecart, 100.0 * tol);
}

// ==========================================================================
// Ce que Python ecrivait d'un trait sur ses dict et ses tableaux
// ==========================================================================

/// Un document ou un morceau de document, ecrit en JSON.
pub fn j(texte: &str) -> Json {
    loads(texte).unwrap_or_else(|e| panic!("JSON du banc : {e} dans {texte}"))
}

/// La valeur d'un nombre du resultat (panique si ce n'en est pas un, comme `v > 0` sur None).
pub fn n(v: &Json) -> f64 {
    v.as_f64().unwrap_or_else(|| panic!("un nombre etait attendu, pas {}", dumps(v)))
}

/// r["mesures"][cle]
pub fn mes(r: &Json, cle: &str) -> f64 {
    n(&r["mesures"][cle])
}

/// `dict(d, **ajouts)`
pub fn avec(d: &Json, ajouts: Json) -> Json {
    let mut d = d.clone();
    maj(&mut d, ajouts);
    d
}

/// Les avertissements du resultat.
pub fn avertis(r: &Json) -> Vec<String> {
    els(&r["avertissements"]).iter().map(str_py).collect()
}

/// any(mot in a for a in liste)
pub fn dit(liste: &[String], mot: &str) -> bool {
    liste.iter().any(|a| a.contains(mot))
}

/// np.linspace(a, b, n)
pub fn linspace(a: f64, b: f64, n: usize) -> Vec<f64> {
    let pas = (b - a) / (n - 1) as f64;
    (0..n).map(|i| if i == n - 1 { b } else { a + pas * i as f64 }).collect()
}

/// Ce que le banc attendait sans erreur.
pub fn ok<T>(r: Res<T>) -> T {
    r.unwrap_or_else(|e| panic!("ErreurOeil : {} ({})", e.message, e.conseil))
}

/// Les quatre reglages d'un canal ideal : debit, retard, front, pertes.
#[derive(Clone, Copy)]
pub struct C {
    pub debit: f64,
    pub retard: f64,
    pub tr: f64,
    pub pertes: f64,
}

impl Default for C {
    fn default() -> C {
        C { debit: 1e9, retard: 1e-9, tr: 50e-12, pertes: 0.0 }
    }
}

/// Le canal a pertes des essais d'egaliseur : 5 Gb/s, front de 40 ps.
pub fn c5(pertes: f64) -> C {
    C { debit: 5e9, tr: 40e-12, pertes, ..C::default() }
}

/// L'oeil d'une ligne uniforme de 50 ohms, sans geometrie.
pub fn _canal(rs: f64, rl: f64, c: C, reg: Json, gab: Option<&Json>) -> Json {
    let o = avec(&obj! {"debit" => c.debit, "tr" => c.tr, "v_haut" => 1.0, "v_bas" => 0.0,
                        "r_source" => rs, "r_charge" => rl, "c_charge" => 0.0}, reg);
    let p = ok(_params(&o, None));
    let (df, np_, _, _) = grille(c.debit, c.tr, c.retard, 0.0);
    let f = frequences(df, np_);
    ok(oeil(&f, Canal::Abcd(&ligne_ideale(&f, 50.0, c.retard, c.pertes)), &p, gab, None, None, None, None))
}

// -- l'empilage et la geometrie des essais complets ---------------------------
pub fn _cu(nom: &str, role: &str) -> Json {
    obj! {"name" => nom, "type" => "copper", "thickness" => 0.035, "role" => role}
}

pub fn _di(nom: &str, ep: f64, er: f64) -> Json {
    obj! {"name" => nom, "type" => "dielectric", "thickness" => ep,
          "epsilon_r" => er, "tan_delta" => 0.02}
}

pub fn QUATRE() -> Vec<Json> {
    vec![_cu("TOP", "signal"), _di("PP", 0.200, 4.20), _cu("GND", "plane"),
         _di("CORE", 0.800, 4.50), _cu("PWR", "plane"),
         _di("PP2", 0.200, 4.20), _cu("BOT", "signal")]
}

pub fn _piste(x1: f64, y1: f64, x2: f64, y2: f64, net: &str, largeur: f64) -> Json {
    obj! {"type" => "track", "start" => vec![x1, y1], "end" => vec![x2, y2],
          "width" => largeur, "layer" => 0i64, "net" => net,
          "copper_thickness" => 0.035}
}

pub fn _doc(objets: Vec<Json>, oeil_: Json, voisinage: Vec<Json>, paires: &[(&str, &str)]) -> Json {
    let mut d = obj! {"format" => "cao-sim-em-3", "net" => &objets[0]["net"],
                      "stackup" => obj! {"layers" => QUATRE()}, "geometry" => obj! {"objects" => objets},
                      "analyse" => obj! {"f_debut" => 1e7, "f_fin" => 1e10, "f_centre" => 1e9,
                                         "points" => 11i64},
                      "oeil" => oeil_};
    if !voisinage.is_empty() {
        poser(&mut d, "voisinage", voisinage);
    }
    if !paires.is_empty() {
        poser(&mut d, "paires", paires.iter().map(|(a, b)| vec![*a, *b].j()).collect::<Vec<Json>>());
    }
    d
}

/// d["stackup"]["layers"] = pile
pub fn avec_pile(mut d: Json, pile: Vec<Json>) -> Json {
    poser(dans(&mut d, "stackup"), "layers", pile);
    d
}

/// Le document d'une paire USB_DP / USB_DN de `longueur` mm.
pub fn _paire(longueur: f64, oeil_: Json) -> Json {
    _doc(vec![_piste(0.0, 0.0, longueur, 0.0, "USB_DP", 0.2)], oeil_,
         vec![_piste(0.0, 0.35, longueur, 0.35, "USB_DN", 0.2)], &[("USB_DP", "USB_DN")])
}

pub fn _refus(doc: &Json, quoi: &str) -> ErreurOeil {
    match analyser(doc, None, None) {
        Err(exc) if !exc.interne => exc,
        Err(exc) => panic!("refus attendu : {quoi}, et non {}", exc.message),
        Ok(_) => panic!("refus attendu : {quoi}"),
    }
}

/// oeil.analyser(doc)
pub fn an(doc: &Json) -> Json {
    ok(analyser(doc, None, None))
}

/// Un tampon IBIS DONT ON CONNAIT LA REPONSE : courbes V-I droites (une
/// resistance r vers Vcc, une vers la masse) et formes d'onde gaussiennes
/// sous 50 ohms -- c'est un generateur de Thevenin, front gaussien compris.
#[derive(Clone)]
pub struct Lin {
    pub r: f64,
    pub vcc: f64,
    pub sigma: f64,
    pub c_comp: f64,
    pub clamps: bool,
    pub rf: f64,
    pub nom: &'static str,
}

impl Default for Lin {
    fn default() -> Lin {
        Lin { r: 30.0, vcc: 1.0, sigma: 40e-12, c_comp: 0.0, clamps: false, rf: 50.0, nom: "LIN" }
    }
}

pub fn _ibis_lineaire(l: &Lin) -> String {
    let g = |x: f64| fmt_g(x, 6);
    let (r, vcc, sigma, rf) = (l.r, l.vcc, l.sigma, l.rf);
    let mut lignes: Vec<String> = vec!["[IBIS Ver] 4.2".into(), "[File Name] essai.ibs".into(),
                                       "[Component] ESSAI".into(), format!("[Model] {}", l.nom), "Model_type I/O".into(),
                                       format!("C_comp {0}p {0}p {0}p", g(l.c_comp * 1e12)),
                                       format!("[Voltage Range] {0} {0} {0}", g(vcc)), "[Pulldown]".into()];
    for v in linspace(-vcc, 2.0 * vcc, 7) {
        lignes.push(format!("{} {} NA NA", g(v), g(v / r)));
    }
    lignes.push("[Pullup]".into());
    for v in linspace(-vcc, 2.0 * vcc, 7) {
        lignes.push(format!("{} {} NA NA", g(v), g(-v / r)));
    }
    if l.clamps {
        // diodes franches : 0 jusqu'a 0,5 V de depassement, 1 ohm au-dela
        lignes.push("[GND Clamp]".into());
        for v in [-5.0, -0.5, 0.0, vcc] {
            lignes.push(format!("{} {}", g(v), g(minf(&[0.0, (v + 0.5) / 1.0]))));
        }
        lignes.push("[POWER Clamp]".into());
        for v in [-5.0, -0.5, 0.0, vcc] {
            lignes.push(format!("{} {}", g(v), g(maxf(&[0.0, -(v + 0.5) / 1.0]))));
        }
    }
    for (mot, haut) in [("Rising", true), ("Falling", false)] {
        lignes.push(format!("[{mot} Waveform]"));
        lignes.push(format!("R_fixture = {}", g(rf)));
        lignes.push("V_fixture = 0".into());
        for t in linspace(0.0, 10.0 * sigma, 201) {
            let ph = 0.5 * erfc_py(-(t - 4.0 * sigma) / (sigma * 2f64.sqrt()));
            let ku = if haut { ph } else { 1.0 - ph };
            lignes.push(format!("{}p {} NA NA", g(t * 1e12), fmt_g(vcc * ku * rf / (r + rf), 9)));
        }
    }
    lignes.push("[End]".into());
    lignes.join("\n")
}

pub const CMOS33: &str = "[IBIS Ver] 5.0
[Comment Char] #_char
[Component] CMOS33
[Package]
R_pkg 0.2 0.1 0.3
# un commentaire, | n'en est plus un
[Model] OUT33
Model_type I/O
C_comp 3.0pF 2.5pF 3.5pF
Vinl = 0.8V
Vinh = 2.0V
[Voltage Range] 3.3V 3.0V 3.6V
[Pulldown]
-3.3 -60mA -50mA -70mA
0.0 0 0 0
0.3 15mA 12mA 18mA
1.0 40mA 32mA 48mA
3.3 52mA 42mA 62mA
6.6 54mA NA 64mA
[Pullup]
-3.3 60mA 50mA 70mA
0.0 0 0 0
0.3 -12mA -10mA -15mA
1.0 -32mA -26mA -39mA
3.3 -42mA -34mA -50mA
6.6 -44mA -36mA -52mA
[GND Clamp]
-3.3 -300mA -250mA -350mA
-1.0 -50mA -40mA -60mA
-0.7 -5mA -4mA -6mA
-0.3 0 0 0
0 0 0 0
[POWER Clamp]
-3.3 300mA 250mA 350mA
-1.0 50mA 40mA 60mA
-0.7 5mA 4mA 6mA
-0.3 0 0 0
0 0 0 0
[Ramp]
dV/dt_r 1.6/0.6n 1.4/0.8n 1.8/0.45n
dV/dt_f 1.6/0.5n 1.4/0.7n 1.8/0.4n
R_load = 50
[Model] IN33
Model_type Input
C_comp 4pF NA NA
[GND Clamp]
-3.3 -300mA NA NA
-1.0 -50mA NA NA
-0.7 -5mA NA NA
-0.3 0 NA NA
0 0 NA NA
[End]
";

/// L'oeil d'une ligne ideale avec les tampons IBIS de `o`.
pub fn _oeil_ibis(o: &Json, retard: f64, pertes: f64, z0: f64, gab: Option<&Json>) -> (Json, Option<NonLineaire>) {
    let mut p = ok(_params(o, gab));
    let ctx = ok(preparer_ibis(o, &mut p));
    let temporel = ctx.as_ref().is_some_and(|c| c.temporel);
    let tr_g = match &ctx {
        Some(c) if temporel => c.tr_lissage,
        _ => p.tr,
    };
    let (df, np_, _, _) = grille(p.debit, tr_g, retard, 4.0 * p.tr);
    let f = frequences(df, np_);
    let abcd = ligne_ideale(&f, z0, retard, pertes);
    let mut nl = None;
    if let (true, Some(c)) = (temporel, &ctx) {
        let x = ok(simuler_non_lineaire(c, &f, &abcd, &p, z0));
        (p.v_haut, p.v_bas) = (x.v_haut, x.v_bas);
        nl = Some(x);
    }
    (ok(oeil(&f, Canal::Abcd(&abcd), &p, gab, None, nl.as_mut(), None, None)), nl)
}

/// Ce que `_ibis_boitier` ajoute a `_ibis_lineaire` (r = 50 ohms : adapte a la ligne).
#[derive(Clone)]
pub struct Bt {
    pub entete: String,
    pub lin: Lin,
    pub type_: &'static str,
    pub suite: String,
}

impl Default for Bt {
    fn default() -> Bt {
        Bt { entete: String::new(), lin: Lin { r: 50.0, ..Lin::default() }, type_: "I/O", suite: String::new() }
    }
}

/// `_ibis_boitier(entete, sigma=sigma)`
pub fn bt(entete: &str, sigma: f64) -> Bt {
    Bt { entete: entete.to_string(), lin: Lin { r: 50.0, sigma, ..Lin::default() }, ..Bt::default() }
}

/// `_ibis_lineaire` (r = 50 ohms : adapte a la ligne) avec, entre
/// [Component] et [Model], les lignes de boitier et de broches `entete`,
/// et apres le modele les lignes `suite`.
pub fn _ibis_boitier(b: &Bt) -> String {
    let txt = _ibis_lineaire(&b.lin);
    let txt = txt.replace("[Component] ESSAI\n", &format!("[Component] ESSAI\n{}", b.entete));
    let txt = txt.replace("Model_type I/O", &format!("Model_type {}", b.type_));
    txt.replace("[End]", &format!("{}[End]", b.suite))
}

/// L'oeil d'une ligne ideale sans pertes, boitiers IBIS comptes.
pub fn _oeil_boitier(o: &Json, retard: f64, z0: f64) -> (Json, NonLineaire, Ctx) {
    let mut p = ok(_params(o, None));
    let ctx = ok(preparer_ibis(o, &mut p)).expect("un contexte IBIS");
    let (df, np_, _, _) = grille(p.debit, ctx.tr_lissage, retard, 4.0 * p.tr);
    let f = frequences(df, np_);
    let (abcd, _) = ok(appliquer_boitiers(Some(&ctx), &f, &ligne_ideale(&f, z0, retard, 0.0), "simple"));
    let mut nl = ok(simuler_non_lineaire(&ctx, &f, &abcd, &p, z0));
    (p.v_haut, p.v_bas) = (nl.v_haut, nl.v_bas);
    let r = ok(oeil(&f, Canal::Abcd(&abcd), &p, None, None, Some(&mut nl), None, None));
    (r, nl, ctx)
}

/// Le temps de montee 10-90 % d'une reponse normalisee, interpole.
pub fn _dix_quatre_vingt_dix(s: &[f64], dt: f64) -> f64 {
    let instant = |x: f64| {
        let i = s.iter().position(|v| *v >= x).unwrap_or(0);
        (i as f64 - 1.0 + (x - s[i - 1]) / (s[i] - s[i - 1])) * dt
    };
    instant(0.9) - instant(0.1)
}

/// La reponse a un echelon d'un front gaussien (sigma) suivi d'un
/// premier ordre (tau) : la loi exponentielle-gaussienne.
pub fn _ex_gauss(t: &[f64], sigma: f64, tau: f64) -> Vec<f64> {
    t.iter()
        .map(|t| {
            let phi = 0.5 * erfc_py(-t / (sigma * 2f64.sqrt()));
            let arg = -t / (sigma * 2f64.sqrt()) + sigma / (tau * 2f64.sqrt());
            let queue = (-t / tau + 0.5 * (sigma / tau).powi(2)).exp() * 0.5 * erfc_py(arg);
            phi - queue
        })
        .collect()
}

/// np.arange(a, b, pas)
pub fn arange(a: f64, b: f64, pas: f64) -> Vec<f64> {
    let nn = ((b - a) / pas).ceil() as usize;
    (0..nn).map(|i| a + i as f64 * pas).collect()
}

pub const BOITIER: &str = "[Package]
R_pkg 0.2 0.1 0.3
L_pkg 8nH 6nH 10nH
C_pkg 1pF 0.8pF 1.2pF
[Pin] signal_name model_name R_pin L_pin C_pin
A1 DP LIN 0.05 2nH 0.4pF
A2 DN LIN NA NA 0.6pF
A3 VCC POWER
A4 SEL SELECT
B1 DQ LIN
[Diff Pin] inv_pin vdiff tdelay_typ tdelay_min tdelay_max
A1 A2 0.1V 40ps 30ps 50ps
[Model Selector] SELECT
LIN tampon lineaire
LIN2 l'autre
[Package Model] PKG_ESSAI
";

/// La paire de deux lignes ideales sans couplage (Z0 = 50 ohms), ses
/// deux brins simules : (nl, ctx, p).
pub fn _paire_ideale(o: &Json) -> (NonLineaire, Ctx, Params) {
    let (retard, zd, zc) = (0.3e-9, 100.0, 25.0);
    let mut p = ok(_params(o, None));
    let ctx = ok(preparer_ibis(o, &mut p)).expect("un contexte IBIS");
    let (df, np_, _, _) = grille(p.debit, ctx.tr_lissage, retard, 4.0 * p.tr);
    let f = frequences(df, np_);
    let nl = ok(simuler_paire(&ctx, &f, &ligne_ideale(&f, zd, retard, 0.0), &ligne_ideale(&f, zc, retard, 0.0), &p, zd, None, false, false, None));
    (nl, ctx, p)
}

pub fn _croisement(v: &[f64], dt: f64, niveau: f64, montant: bool, apres: usize) -> f64 {
    let i = apres + v[apres..].iter().position(|x| if montant { *x >= niveau } else { *x <= niveau }).unwrap_or(0);
    (i as f64 - 1.0 + (niveau - v[i - 1]) / (v[i] - v[i - 1])) * dt
}

pub fn SIX() -> Vec<Json> {
    vec![_cu("TOP", "signal"), _di("PP", 0.200, 4.20), _cu("GND", "plane"),
         _di("C1", 0.200, 4.50), _cu("IN1", "signal"),
         _di("C2", 2.200, 4.50), _cu("PWR", "plane"),
         _di("PP2", 0.200, 4.20), _cu("BOT", "signal")]
}

pub fn VIA_TRAVERSANT() -> Json {
    j(r#"{"drill_diameter": 0.3, "pad_diameter": 0.6, "layer_from": 0, "layer_to": 8}"#)
}

pub fn _brin(x1: f64, x2: f64, y: f64, net: &str, largeur: f64, couche: i64, via: bool) -> Json {
    let mut o = _piste(x1, y, x2, y, net, largeur);
    poser(&mut o, "layer", couche);
    if via {
        poser(&mut o, "via", VIA_TRAVERSANT());
    }
    o
}

/// `_brin(x1, x2, y, net)` : 0,2 mm sur TOP, sans via.
pub fn brin(x1: f64, x2: f64, y: f64, net: &str) -> Json {
    _brin(x1, x2, y, net, 0.2, 0, false)
}

pub fn _plats(x: &Json) -> Vec<[Complex64; 4]> {
    els(x).iter().map(|m| std::array::from_fn(|k| Complex64::new(n(&m[k][0]), n(&m[k][1])))).collect()
}

/// max |x| de S a plat
pub fn max_plats(x: &Json) -> f64 {
    maxi(_plats(x).iter().flat_map(|m| m.iter().map(|z| z.norm())))
}

/// `se.simuler(d, garder_abcd=True, freqs_imposees=f)`
pub fn simg(d: &Json, f: &[f64]) -> em::simulation_em::Resultat {
    em::simulation_em::simuler(&mut d.clone(), None, true, Some(f)).unwrap_or_else(|e| panic!("ErreurSimulation : {}", e.message))
}

/// S21 (50 ohms) d'un brin simule SEUL : le chiffre de l'estimation.
pub fn _s21_seul(objets: Vec<Json>, f: &[f64], pile: Option<Vec<Json>>) -> Vec<Complex64> {
    let mut d = _doc(objets, obj! {}, vec![], &[]);
    oter(&mut d, "oeil");
    if let Some(p) = pile {
        d = avec_pile(d, p);
    }
    _plats(&simg(&d, f).json["s"]).iter().map(|m| m[2]).collect()
}

pub const FAUX_AMI: &str = r#"(faux
  (Reserved_Parameters
    (AMI_Version (Usage Info) (Type String) (Value "7.0"))
    (Init_Returns_Impulse (Usage Info) (Type Boolean) (Value True))
    (GetWave_Exists (Usage Info) (Type Boolean) (Value True))
    (Ignore_Bits (Usage Info) (Type Integer) (Value 4)))
  (Model_Specific
    (c0 (Usage In) (Type Float) (Range 1 0 1))
    (c1 (Usage In) (Type Float) (Range 0 -1 1))
    (gw_seul (Usage In) (Type Integer) (Value 0))
    (horloge (Usage In) (Type Float) (Value -1))
    (gigue (Usage In) (Type Float) (Value 0))))"#;

pub fn _faux(par: Json) -> Json {
    obj! {"ami" => obj! {"texte" => FAUX_AMI, "fichier" => "faux.ami",
                         "bibliotheque" => "faux.so", "parametres" => par}}
}

/// `oeil.analyser(doc, racines_ami=["/faux"])`, `_FauxAmi` a la place de la bibliotheque compilee.
pub fn an_faux(doc: &Json) -> Json {
    ok(analyser_avec(doc, None, Some(&["/faux"]), &faux::Faux))
}

fn main() {
    a::banc();
    b::banc();
    c::banc();
    d::banc();
    let (ok, ko) = (OK.load(Ordering::Relaxed), KO.load(Ordering::Relaxed));
    println!("\n{}", "-".repeat(62));
    println!("  {} cas, {}", ok + ko, if ko == 0 { "tous passes".to_string() } else { format!("{ko} en echec") });
    std::process::exit(if ko == 0 { 0 } else { 1 });
}
