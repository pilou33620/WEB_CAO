//! Les reglages du document, completes par ceux du gabarit.

use dc_solver::pyth::{elements, float_py};
use em::obj;
use em::simulation_em::base::*;

use crate::briques::{couplage_ac, pf, CouplageAc};
use crate::np::argmax;
use crate::{ErreurOeil, Res};

/// Les reglages `p` de oeil.py. `json()` rend le dict, cles et ordre compris.
#[derive(Debug, Clone, PartialEq)]
pub struct Params {
    pub debit: f64,
    pub ui: f64,
    pub tr: f64,
    pub v_haut: f64,
    pub v_bas: f64,
    pub r_source: f64,
    pub r_charge: f64,
    pub c_charge: f64,
    pub mode: String,
    pub motif: String,
    pub ffe: Vec<f64>,
    pub ffe_principal: usize,
    /// le CTLE : un dict (celui du navigateur ou du gabarit, complete), ou None
    pub ctle: Option<Json>,
    pub dfe_prises: i64,
    pub dfe_max: f64,
    pub setup: f64,
    pub hold: f64,
    pub couplage_ac: Option<CouplageAc>,
    pub rj_ui: f64,
    pub dj_ui: f64,
    pub bruit_v: f64,
    pub ber_cible: f64,
    /// les agresseurs bornes : {nom, crete_v, coef, v, source...}
    pub bornes: Vec<Json>,
    pub stat: bool,
    /// le surplus d'effet de peau au premier point (`r_continu`) : 0 tant que `analyser` ne
    /// l'a pas pose
    pub exces_continu: f64,
    pub exces_continu_cc: f64,
    pub exces_brins: (f64, f64),
}

impl Params {
    /// Le dict `parametres` du resultat : sans le CTLE ni les exces, sans les reglages
    /// facultatifs quand ils n'ont pas servi.
    pub fn json(&self) -> Json {
        let mut d = obj! {
            "debit" => self.debit, "ui" => self.ui, "tr" => self.tr,
            "v_haut" => self.v_haut, "v_bas" => self.v_bas,
            "r_source" => self.r_source, "r_charge" => self.r_charge, "c_charge" => self.c_charge,
            "mode" => &self.mode, "motif" => &self.motif,
            "ffe" => self.ffe.clone(), "ffe_principal" => self.ffe_principal,
            "dfe_prises" => self.dfe_prises, "dfe_max" => self.dfe_max,
            "setup" => self.setup, "hold" => self.hold,
        };
        if let Some(ca) = &self.couplage_ac {
            poser(&mut d, "couplage_ac", ca.json());
        }
        if self.stat {
            poser(&mut d, "rj_ui", self.rj_ui);
            poser(&mut d, "dj_ui", self.dj_ui);
            poser(&mut d, "bruit_v", self.bruit_v);
            poser(&mut d, "ber_cible", self.ber_cible);
            poser(&mut d, "bornes", self.bornes.clone());
            poser(&mut d, "stat", true);
        }
        d
    }

    /// len(p["ffe"]) > 1 or p["ffe"][0] != 1.0
    pub fn a_une_ffe(&self) -> bool {
        self.ffe.len() > 1 || self.ffe[0] != 1.0
    }
}

// np.argmax(np.abs(ffe))
fn plus_fort(ffe: &[f64]) -> usize {
    argmax(&ffe.iter().map(|x| x.abs()).collect::<Vec<f64>>())
}

/// Les reglages du document, completes par ceux du gabarit.
pub fn _params(o: &Json, g: Option<&Json>) -> Res<Params> {
    let nul = Json::Nul;
    let g = g.unwrap_or(&nul);
    let em = &g["emetteur"];
    let rc = &g["recepteur"];
    let mut debit = _nombre(&o["debit"], 0.0);
    if debit == 0.0 {
        debit = _nombre(&g["debit"], 0.0);
    }
    if !(debit > 0.0) {
        return Err(ErreurOeil::new("Débit absent ou nul.", "Saisissez le débit de la liaison, en bit/s."));
    }
    if debit > 64e9 {
        return Err(ErreurOeil::new(
            format!("Débit de {} Gb/s : au-delà de ce que le modèle de ligne tient.", fmt_g(debit / 1e9, 3)),
            "Le calcul de section est quasi-statique.",
        ));
    }
    let ui = 1.0 / debit;

    let vide = |v: &Json| nul_ou_vide(v);
    let val = |cle: &str, defaut: f64, source: &Json| -> f64 {
        let v = &o[cle];
        if vide(v) {
            return match source.get(cle) {
                Some(s) => _nombre(s, defaut),
                None => defaut,
            };
        }
        _nombre(v, defaut)
    };

    let mut tr = val("tr", 0.3 * ui, em);
    if !(tr > 0.0) {
        tr = 0.3 * ui;
    }
    let v_haut = val("v_haut", 1.0, em);
    let v_bas = val("v_bas", 0.0, em);
    let r_source = maxf(&[0.1, val("r_source", 50.0, em)]);
    let r_charge = maxf(&[0.0, val("r_charge", 50.0, rc)]);
    let c_charge = maxf(&[0.0, val("c_charge", 0.0, rc)]);
    let mode = if ou(&o["mode"], &g["mode"]).as_str() == Some("diff") { "diff" } else { "simple" }.to_string();
    let motif = if o["motif"].vrai() { str_py(&o["motif"]) } else { "prbs7".into() }.to_lowercase();
    if v_haut <= v_bas {
        return Err(ErreurOeil::new("Le niveau haut de l'émetteur n'est pas au-dessus du niveau bas.", ""));
    }
    let un = Json::Liste(vec![Json::Flottant(1.0)]);
    let (ffe, mut principal) = if vide(&o["ffe"]) {
        (if em["ffe"].vrai() { &em["ffe"] } else { &un }, em.get("ffe_principal").cloned().unwrap_or(Json::Entier(0)))
    } else {
        (&o["ffe"], o["ffe_principal"].clone())
    };
    let illisible = || {
        ErreurOeil::new("Coefficients de pré-accentuation illisibles.", "Écrivez-les séparés par des espaces, ex. « 0.83 -0.17 ».")
    };
    let ffe: Vec<f64> = elements(ffe).map_err(|_| illisible())?.iter().map(float_py).collect::<Result<_, _>>().map_err(|_| illisible())?;
    if ffe.is_empty() || ffe.len() > 8 || !ffe.iter().any(|x| x.abs() > 0.0) {
        return Err(ErreurOeil::new("Pré-accentuation : entre 1 et 8 coefficients, pas tous nuls.", ""));
    }
    if vide(&principal) {
        principal = Json::Entier(plus_fort(&ffe) as i64);
    }
    // int(_nombre(principal, 0)) : la troncature
    let mut principal = _nombre(&principal, 0.0).trunc();
    if !(0.0 <= principal && principal < ffe.len() as f64) {
        principal = plus_fort(&ffe) as f64;
    }
    let ffe_principal = principal as usize;

    let vide_o = Json::Objet(Objet::new());
    let eg = if o.get("egaliseur").map_or(true, Json::vrai) && g["egaliseur"].vrai() { &g["egaliseur"] } else { &vide_o };
    let ctl = if o["ctle"].vrai() { &o["ctle"] } else { &eg["ctle"] };
    let mut ctle = None;
    if !matches!(ctl, Json::Nul) {
        // il vient du navigateur : un objet, des poles et un zero positifs,
        // sinon KeyError / division par zero plus bas (500 au lieu d'un refus)
        if ctl.as_objet().is_none() {
            return Err(ErreurOeil::new(
                "Réglage « ctle » illisible : objet attendu.",
                "Donnez fp1, fp2 et fz en Hz (ou forme pcie3 avec adc_db).",
            ));
        }
        let mut ctl = ctl.clone();
        let cles: &[&str] = if ctl["forme"].as_str() == Some("pcie3") { &["fp1", "fp2"] } else { &["fp1", "fp2", "fz"] };
        for cle in cles {
            let v = _nombre(&ctl[*cle], 0.0);
            poser(&mut ctl, cle, v);
            if !(v > 0.0) {
                return Err(ErreurOeil::new(
                    format!("CTLE : « {cle} » absent, nul ou négatif."),
                    "Une fréquence en Hz, strictement positive.",
                ));
            }
        }
        // adc_db : un gain, ou la liste des gains a essayer (_candidats_ctle)
        let gains = match ctl.get("adc_db") {
            Some(Json::Liste(l)) => Json::Liste(l.iter().map(|x| Json::Flottant(_nombre(x, 0.0))).collect()),
            Some(x) => Json::Flottant(_nombre(x, 0.0)),
            None => Json::Flottant(0.0),
        };
        poser(&mut ctl, "adc_db", gains);
        if let Some(a) = ctl.get("adc") {
            let a = _nombre(a, 1.0);
            poser(&mut ctl, "adc", a);
        }
        ctle = Some(ctl);
    }
    let dfe = &eg["dfe"];
    // int(_nombre(o.get("dfe_prises"), dfe.get("prises", 0)))
    let dfe_prises = (_nombre(&o["dfe_prises"], dfe.get("prises").map_or(0.0, nb)).trunc() as i64).clamp(0, 8);
    let dfe_max = _nombre(&o["dfe_max"], dfe.get("max_v").map_or(0.05, nb));
    let setup = _nombre(&o["setup"], numd(g, "setup", 0.0));
    let hold = _nombre(&o["hold"], numd(g, "hold", 0.0));
    // -- les condensateurs de liaison (2.3.0) : FACULTATIFS ----------------
    // Absents, rien n'est pose dans la cascade et le continu est celui
    // d'avant : l'oeil est celui de la 2.2.0 au bit pres.
    let ca = couplage_ac(&o["couplage_ac"], &mode, r_source, r_charge)?;

    // -- la gigue, le bruit, la diaphonie : TOUT EST FACULTATIF ----------
    // Sans aucun de ces champs, l'oeil est celui d'avant, a l'octet pres :
    // rien n'est calcule et rien n'est ajoute au resultat.
    let rj = if !vide(&o["rj"]) { _nombre(&o["rj"], 0.0) / ui } else { _nombre(&o["rj_ui"], 0.0) };
    let dj = if !vide(&o["dj"]) { _nombre(&o["dj"], 0.0) / ui } else { _nombre(&o["dj_ui"], 0.0) };
    if rj < 0.0 || dj < 0.0 || _nombre(&o["bruit_v"], 0.0) < 0.0 {
        return Err(ErreurOeil::new(
            "Gigue ou bruit négatif.",
            "La gigue aléatoire est un écart-type, la gigue déterministe une excursion crête à crête : deux \
             grandeurs positives.",
        ));
    }
    if dj >= 1.0 {
        return Err(ErreurOeil::new(
            format!("Gigue déterministe de {} UI : l'œil est fermé avant tout calcul.", pf(dj, 2)),
            "Elle se saisit crête à crête, en secondes.",
        ));
    }
    let bruit_v = maxf(&[0.0, _nombre(&o["bruit_v"], 0.0)]);
    let mut ber = _nombre(&o["ber_cible"], 0.0);
    if ber == 0.0 {
        ber = _nombre(&g["ber"], 0.0);
    }
    if ber == 0.0 {
        ber = 1e-12;
    }
    if !(1e-30 <= ber && ber <= 1e-2) {
        return Err(ErreurOeil::new("Taux d'erreur visé hors de 10⁻³⁰ … 10⁻².", ""));
    }
    let mut bornes = Vec::new();
    for (i, a) in els(&o["agresseurs"]).iter().enumerate() {
        if a.as_objet().is_none() {
            continue;
        }
        let mut crete = _nombre(&a["crete_v"], 0.0);
        let coef = _nombre(&a["coef"], 0.0);
        let v = _nombre(&a["v"], 0.0);
        if crete == 0.0 && coef != 0.0 && v != 0.0 {
            crete = coef.abs() * v.abs();
        }
        if crete > 0.0 {
            let ou_nul = |x: f64| if x.abs() != 0.0 { Json::Flottant(x.abs()) } else { Json::Nul };
            bornes.push(obj! {"nom" => if a["nom"].vrai() { str_py(&a["nom"]) } else { format!("agresseur {}", i + 1) },
                              "crete_v" => crete.abs(), "coef" => ou_nul(coef),
                              "v" => ou_nul(v), "source" => "saisi"});
        }
    }
    let stat = o["statistique"].vrai() || rj > 0.0 || dj > 0.0 || bruit_v > 0.0 || !bornes.is_empty() || o["agresseurs_auto"].vrai();
    Ok(Params {
        debit, ui, tr, v_haut, v_bas, r_source, r_charge, c_charge, mode, motif, ffe, ffe_principal, ctle,
        dfe_prises, dfe_max, setup, hold, couplage_ac: ca, rj_ui: rj, dj_ui: dj, bruit_v, ber_cible: ber, bornes, stat,
        exces_continu: 0.0, exces_continu_cc: 0.0, exces_brins: (0.0, 0.0),
    })
}

/// `v is None or v == ""`
pub(crate) fn nul_ou_vide(v: &Json) -> bool {
    matches!(v, Json::Nul) || v.as_str() == Some("")
}
