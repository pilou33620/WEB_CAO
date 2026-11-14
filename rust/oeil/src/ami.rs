//! Les fichiers .ami, et l'execution des modeles AMI.

use std::cell::RefCell;
use std::f64::consts::PI;
use std::rc::Rc;

use em::obj;
use em::simulation_em::base::*;
use ibis::{Ami, ErreurIbis};

use crate::briques::*;
use crate::nl::{AmiNl, Ctx, Horloges, NonLineaire, Onde};
use crate::np::*;
use crate::trace::Canal;
use crate::{ErreurOeil, Params, Res, ECHANTILLONS_UI, TR_SUR_SIGMA};

/// L'interface de `ibis.ModeleAmi`, que le banc remplace par un modele ecrit a la main.
pub trait ModeleAmiT {
    fn getwave_existe(&self) -> bool;
    /// AMI_Init : (ok, impulsion rendue, parametres_out, message).
    fn init(&mut self, impulsion: &[f64], dt: f64, bit_time: f64, parametres_in: &str) -> (bool, Vec<f64>, String, String);
    /// AMI_GetWave sur un bloc : (ok, onde rendue, instants d'horloge, parametres_out) ; Err :
    /// l'exception que Python aurait levee, « Type : message ».
    fn getwave(&mut self, onde: &[f64], echantillons_par_bit: i64) -> Result<(bool, Vec<f64>, Vec<f64>, String), String>;
    fn fermer(&mut self);
}

impl ModeleAmiT for ibis::ModeleAmi {
    fn getwave_existe(&self) -> bool {
        self.getwave_existe
    }
    fn init(&mut self, impulsion: &[f64], dt: f64, bit_time: f64, parametres_in: &str) -> (bool, Vec<f64>, String, String) {
        ibis::ModeleAmi::init(self, impulsion, dt, bit_time, parametres_in)
    }
    fn getwave(&mut self, onde: &[f64], echantillons_par_bit: i64) -> Result<(bool, Vec<f64>, Vec<f64>, String), String> {
        ibis::ModeleAmi::getwave(self, onde, echantillons_par_bit).map_err(|e| format!("ErreurIbis : {}", e.message))
    }
    fn fermer(&mut self) {
        ibis::ModeleAmi::fermer(self)
    }
}

/// Un modele charge, partage entre le flot et celui qui le ferme.
pub type ModeleRc = Rc<RefCell<Box<dyn ModeleAmiT>>>;

/// D'ou viennent les modeles AMI : `ibis.chemin_bibliotheque_ami` et `ibis.ModeleAmi`.
pub trait ChargeurAmi {
    fn chemin(&self, brut: &str, racines: &[&str]) -> Result<String, ErreurIbis>;
    fn charger(&self, chemin: &str) -> Result<Box<dyn ModeleAmiT>, ErreurIbis>;
}

/// La bibliotheque du fabricant, sous un dossier autorise.
pub struct Fabricant;

impl ChargeurAmi for Fabricant {
    fn chemin(&self, brut: &str, racines: &[&str]) -> Result<String, ErreurIbis> {
        ibis::chemin_bibliotheque_ami(brut, racines)
    }
    fn charger(&self, chemin: &str) -> Result<Box<dyn ModeleAmiT>, ErreurIbis> {
        Ok(Box::new(ibis::ModeleAmi::new(chemin)?))
    }
}

/// Une bibliotheque a executer : son chemin, et les surcharges de parametres.
#[derive(Debug, Clone, PartialEq)]
pub struct Biblio {
    pub chemin: String,
    pub surcharges: Objet,
}

/// Ce que `preparer_ami` rend : le dict `ami` du resultat (`json`), et ce que Python y cachait
/// sous `_lus` et `_biblios`. Indices : 0 l'emetteur, 1 le recepteur.
pub struct AmiPrep {
    /// {emetteur, recepteur, renvois, propositions, applique, execution, note}
    pub json: Json,
    pub lus: [Option<Ami>; 2],
    pub biblios: [Option<Biblio>; 2],
    /// `ami["execution"]`, que le flot complete encore pendant l'oeil
    pub execution: Rc<RefCell<Json>>,
}

const BOUTS: [&str; 2] = ["emetteur", "recepteur"];
const CHAMPS: [&str; 2] = ["ibis_emetteur", "ibis_recepteur"];

/// Les fichiers .ami de la requete, lus et montres, et ce qu'ils
/// proposent pour l'egaliseur de reference -- applique si `ami_regler`.
/// Rend None s'il n'y a ni .ami ni [Algorithmic Model].
pub fn preparer_ami(o: &Json, p: &mut Params, ctx: Option<&mut Ctx>) -> Res<Option<AmiPrep>> {
    let mut lus: [Option<Ami>; 2] = [None, None];
    for (k, champ) in CHAMPS.iter().enumerate() {
        let a = &o[*champ]["ami"];
        if a.as_objet().is_some() && a["texte"].vrai() {
            let fichier = if a["fichier"].vrai() { str_py(&a["fichier"]) } else { String::new() };
            lus[k] = Some(ibis::lire_ami(&str_py(&a["texte"]), &fichier).map_err(|exc| {
                ErreurOeil::new(format!("AMI de l'{} : {}", if k == 0 { "émetteur" } else { "récepteur" }, exc.message), exc.conseil)
            })?);
        }
    }
    let mut renvois = Vec::new();
    for (bout, m) in [("émetteur", ctx.as_ref().and_then(|c| c.m_em.as_ref())), ("récepteur", ctx.as_ref().and_then(|c| c.m_rx.as_ref()))] {
        let Some(m) = m else { continue };
        for x in m.ami.iter().flatten() {
            let mut d = x.json();
            poser(&mut d, "bout", bout);
            poser(&mut d, "modele", &m.nom);
            renvois.push(d);
        }
    }
    let a_lus = lus.iter().any(Option::is_some);
    if !a_lus && renvois.is_empty() {
        return Ok(None);
    }
    let prop = ibis::proposer_egaliseur(lus[0].as_ref(), lus[1].as_ref(), p.debit).map_err(ErreurOeil::ibis)?;
    let mut applique: Vec<&str> = Vec::new();
    if o["ami_regler"].vrai() && a_lus {
        if let Some(ffe) = prop.ffe.as_ref().filter(|f| !f.is_empty()) {
            let Some(principal) = prop.ffe_principal else { return Err(ErreurOeil::plantage("KeyError", "'ffe_principal'")) };
            (p.ffe, p.ffe_principal) = (ffe.clone(), principal);
            applique.push("FFE");
        }
        if let Some(n) = prop.dfe_prises.filter(|n| *n != 0) {
            p.dfe_prises = n;
            if let Some(mx) = prop.dfe_max.filter(|m| *m != 0.0) {
                p.dfe_max = mx;
            }
            applique.push("DFE");
        }
        if prop.ctle.is_some() {
            p.ctle = Some(prop.json()["ctle"].clone());
            applique.push("CTLE");
        }
        // La gigue et le bruit du modele, seulement s'ils n'ont pas ete
        // saisis : la saisie l'emporte.
        if let Some(rj) = prop.rj.filter(|x| *x != 0.0 && p.rj_ui == 0.0) {
            p.rj_ui = rj / p.ui;
            applique.push("RJ");
        }
        if let Some(dj) = prop.dj.filter(|x| *x != 0.0 && p.dj_ui == 0.0 && *x < p.ui) {
            p.dj_ui = dj / p.ui;
            applique.push("DJ");
        }
        if let Some(b) = prop.bruit_v.filter(|x| *x != 0.0 && p.bruit_v == 0.0) {
            p.bruit_v = b;
            applique.push("bruit");
        }
        if applique.iter().any(|x| matches!(*x, "RJ" | "DJ" | "bruit")) {
            p.stat = true;
        }
        if let (Some(s), Some(ctx)) = (prop.sensibilite.filter(|x| *x != 0.0), ctx) {
            if ctx.vdiff.is_none() && p.mode == "diff" {
                ctx.vdiff = Some(s);
                applique.push("sensibilité");
            }
        }
    }

    let resume = |a: Option<&Ami>| -> Json {
        let Some(a) = a else { return Json::Nul };
        obj! {"fichier" => &a.fichier, "modele" => &a.modele,
              "description" => &a.description, "tronque" => a.tronque,
              "parametres" => a.parametres.iter().map(|x| {
                  let j = x.json();
                  let mut d = Objet::new();
                  for k in ["chemin", "groupe", "usage", "type", "forme", "valeur", "plage", "liste", "description"] {
                      d.insert(k.to_string(), j[k].clone());
                  }
                  Json::Objet(d)
              }).collect::<Vec<Json>>()}
    };
    // LES BIBLIOTHEQUES A EXECUTER (2.3.0) : le chemin que l'utilisateur
    // designe, et ses surcharges de parametres ; `executer_ami` fera le
    // reste, apres la cascade. Rien de designe : rien n'est execute.
    let mut biblios: [Option<Biblio>; 2] = [None, None];
    for (k, champ) in CHAMPS.iter().enumerate() {
        let a = &o[*champ]["ami"];
        if a.as_objet().is_none() {
            continue;
        }
        let chemin = py::strip(&str_ou_vide(&a["bibliotheque"])).to_string();
        if !chemin.is_empty() {
            biblios[k] = Some(Biblio { chemin, surcharges: a["parametres"].as_objet().cloned().unwrap_or_default() });
        }
    }
    let execute = biblios.iter().any(Option::is_some);
    let json = obj! {
        "emetteur" => resume(lus[0].as_ref()),
        "recepteur" => resume(lus[1].as_ref()),
        "renvois" => renvois, "propositions" => prop.json(), "applique" => applique,
        "execution" => Json::Nul,
        "note" => if execute {
            "Le modèle AMI (bibliothèque du fabricant) est \
             EXÉCUTÉ par ctypes : AMI_Init de l'émetteur sur la \
             réponse impulsionnelle du canal, puis AMI_Init et \
             AMI_GetWave du récepteur, par blocs ; les paramètres \
             In/InOut viennent du .ami, surchargeables. \
             Si l'AMI_GetWave du récepteur rend ses instants \
             d'horloge, ils fixent l'échantillonnage (phase moyenne, \
             chaque bit lu à son instant) ; sinon l'instant reste \
             celui de l'œil (milieu du pire cas)."
        } else {
            "Le modèle AMI lui-même (bibliothèque du fabricant) \
             n'est PAS exécuté : seul son fichier .ami est lu. \
             L'égaliseur de l'œil reste celui de référence (CTLE, \
             FFE, DFE linéaires), réglé — si demandé — d'après les \
             paramètres lisibles ; l'adaptation et la récupération \
             d'horloge du modèle ne sont pas reproduites. \
             Désignez la bibliothèque (.so/.dll, dans la LIB ou \
             le projet) pour l'exécuter."
        }};
    Ok(Some(AmiPrep { json, lus, biblios, execution: Rc::new(RefCell::new(Json::Nul)) }))
}

// ==========================================================================
// L'EXECUTION DES MODELES AMI (2.3.0)
// --------------------------------------------------------------------------
// LE FLOT DE LA NORME (IBIS 7.x, section 10.4, « reference flows »), tel
// qu'il est reproduit ici :
//
//   1. la REPONSE IMPULSIONNELLE DU CANAL ANALOGIQUE : celle que l'oeil a
//      deja -- la reponse a un echelon du transfert generateur -> broche
//      (tampons IBIS lineaires, boitiers, condensateurs de liaison compris ;
//      avec des tampons IBIS simules dans le temps, la reponse moyenne des
//      deux fronts), au pas de l'oeil (UI / 64, pour que bit_time /
//      sample_interval soit entier), derivee et mise en volts par seconde
//      pour une excursion pleine de l'emetteur ;
//   2. AMI_Init DE L'EMETTEUR : la pre-accentuation du modele s'applique a
//      cette impulsion s'il a Init_Returns_Impulse (sinon elle reste telle
//      quelle, et c'est dit : l'AMI_GetWave de l'emetteur n'est pas
//      reproduit, la FFE de reference saisie l'est a sa place) ;
//   3. le CANAL : la forme d'onde PRBS au recepteur est la superposition de
//      cette impulsion equalisee -- la liaison est lineaire a cet endroit,
//      c'est l'hypothese du flot AMI lui-meme ;
//   4. AMI_Init DU RECEPTEUR sur l'impulsion de l'etape 2 : l'impulsion
//      rendue (Init_Returns_Impulse) fait la reponse a un bit du PIRE CAS et
//      de l'oeil statistique ; puis, s'il a GetWave_Exists, AMI_GetWave par
//      blocs sur la forme d'onde de l'etape 3 -- apres Ignore_Bits de mise
//      en route, une periode entiere du motif est gardee : c'est l'oeil
//      PRBS. Sans GetWave, l'oeil PRBS est la superposition de l'impulsion
//      rendue par Init. Comme le veut la norme, quand les deux existent,
//      l'impulsion d'Init du recepteur ne sert PAS a la forme d'onde.
//   5. AMI_Close des deux.
//
// Le CTLE, le DFE et la FFE de reference de l'oeil s'effacent devant le
// modele qui s'execute (l'emetteur efface la FFE, le recepteur le CTLE et
// le DFE) ; un bout qui ne s'execute pas les garde. Les instants d'horloge
// que le recepteur rend FIXENT l'echantillonnage depuis la 2.4.0 (voir
// « L'HORLOGE RECUPEREE » dans `oeil`) ; sans eux, l'instant reste le milieu
// du pire cas. Tout echec -- fichier absent, autre
// architecture, Init qui rend 0 -- est un AVERTISSEMENT et un repli sur
// l'egaliseur de reference, jamais une exception.
// ==========================================================================

// Les blocs passes a AMI_GetWave : en bits (fois 64 echantillons).
pub const BITS_PAR_BLOC_AMI: usize = 256;
// Plafond du nombre de periodes de mise en route (Ignore_Bits deraisonnable).
pub const MAX_PERIODES_AMI: usize = 64;

/// La reponse a un echelon du canal analogique, au pas UI / 64 et sur la
/// demi-fenetre : (dt_e, s). Normalisee a un echelon unite de l'emetteur
/// (le continu sans condensateur vaut h0). Les condensateurs de liaison
/// comme dans `oeil` : `lent`, ou la case `h0_bin`.
fn _echelon_canal(
    freqs: &[f64], canal: Canal, h0: Option<f64>, h0_bin: Option<f64>, p: &Params, nl: Option<&NonLineaire>, lent: Option<Lent>,
) -> Res<(f64, Vec<f64>)> {
    let ui = p.ui;
    let dt_e = ui / ECHANTILLONS_UI as f64;
    let (s_src, dt, t_h);
    let mut h0 = h0;
    if let Some(nl) = nl {
        (s_src, dt) = (nl.s.clone(), nl.dt);
        t_h = s_src.len() as f64 * dt;
    } else {
        if freqs.len() < 2 {
            return Err(ErreurOeil::plantage("IndexError", "index 1 is out of bounds"));
        }
        let (mut h0_bin, mut lent) = (h0_bin, lent);
        let h: Vec<Complex64> = match canal {
            Canal::Abcd(arr) => {
                let (h, h0_) = transfert(arr, freqs, p.r_source, p.r_charge, p.c_charge, p.exces_continu);
                h0 = Some(h0_);
                if p.couplage_ac.is_some() && h0_bin.is_none() && lent.is_none() {
                    (h0_bin, lent) = _continu_ac_simple(p.couplage_ac.as_ref(), arr, freqs, p);
                }
                h
            }
            Canal::H(h) => h.to_vec(),
        };
        let Some(h0_bin) = h0_bin.or(h0) else { return Err(ErreurOeil::plantage("TypeError", "h0 absent")) };
        let df = freqs[1] - freqs[0];
        t_h = 0.5 / df;
        let n_min = (1.0 / df / minf(&[dt_e, p.tr / 8.0])).ceil() as usize;
        (dt, s_src) = match lent {
            Some(l) => reponse_indicielle_ac(freqs, &h, l.h0, p.tr, n_min, l.tau),
            None => reponse_indicielle(freqs, &h, h0_bin, p.tr, n_min),
        };
    }
    let n_e = (t_h / dt_e) as usize;
    let t_e: Vec<f64> = (0..n_e).map(|i| i as f64 * dt_e).collect();
    let xp: Vec<f64> = (0..s_src.len()).map(|i| i as f64 * dt).collect();
    let s = interp(&t_e, &xp, &s_src, 0.0, s_src.last().copied().unwrap_or(0.0));
    Ok((dt_e, s))
}

/// La reponse a un echelon avec la FFE de reference : sum c_j s(t - j UI).
fn _decaler_ffe(s: &[f64], ffe: &[f64], spu: usize) -> Vec<f64> {
    let mut out = vec![0.0; s.len()];
    for (j, cj) in ffe.iter().enumerate() {
        if j * spu < s.len() {
            for i in j * spu..s.len() {
                out[i] += cj * s[i - j * spu];
            }
        }
    }
    out
}

/// La reponse a un bit d'une reponse a un echelon, TENUE UNE UI DE PLUS,
/// comme dans `oeil`. Coupee a la longueur de l'echelon, elle s'arretait sur
/// s(fin) - s(fin - UI) au lieu de redescendre a zero : sur une ligne a
/// pertes, dont la queue traine, la forme d'onde du flot AMI s'ecartait de
/// 2,8e-6 de celle de l'oeil pour un modele qui ne fait rien.
pub fn _un_bit(s: &[f64], spu: usize) -> Vec<f64> {
    let n = s.len();
    let fin = s.last().copied().unwrap_or(0.0);
    (0..n + spu).map(|i| (if i < n { s[i] } else { fin }) - (if i < spu { 0.0 } else { s[i - spu] })).collect()
}

/// La forme d'onde periodique d'une sequence par superposition de la
/// reponse a un bit `p_bit` (au pas UI / spu) : ce que fait `oeil` en
/// lineaire, repete autant de fois que la reponse deborde la periode.
/// (Rend la premiere periode.)
fn _onde_lineaire(bits: &[i32], p_bit: &[f64], spu: usize, amp: f64, v_c: f64) -> Vec<f64> {
    let per = bits.len();
    let rep = 1.max((p_bit.len() as f64 / (per * spu) as f64).ceil() as usize);
    let ns = rep * per * spu;
    let mut imp = vec![0.0; ns];
    for k in 0..rep * per {
        imp[k * spu] = 2.0 * bits[k % per] as f64 - 1.0;
    }
    let mut pp = vec![0.0; ns];
    let n = p_bit.len().min(ns);
    pp[..n].copy_from_slice(&p_bit[..n]);
    let x: Vec<Complex64> = rfft(&imp).iter().zip(rfft(&pp)).map(|(a, b)| a * b).collect();
    irfft(&x, ns)[..per * spu].iter().map(|v| v_c + amp * v).collect()
}

fn fini(v: &[f64]) -> bool {
    v.iter().all(|x| x.is_finite())
}

/// Les modeles AMI designes, executes (voir l'en-tete) : rend ce que
/// `oeil(non_lineaire=...)` lit -- ou `nl` inchange si rien n'a pu
/// s'executer -- et remplit `ami["execution"]`. Les echecs vont dans
/// `notes`.
#[allow(clippy::too_many_arguments)]
pub fn executer_ami(
    ami: &mut AmiPrep, p: &mut Params, freqs: &[f64], canal: Canal, h0: Option<f64>, h0_bin: Option<f64>, nl: Option<NonLineaire>,
    racines: &[&str], notes: &mut Vec<String>, lent: Option<Lent>, chargeur: &dyn ChargeurAmi,
) -> Res<Option<NonLineaire>> {
    if ami.biblios.iter().all(Option::is_none) {
        return Ok(nl);
    }
    let (ui, spu) = (p.ui, ECHANTILLONS_UI);
    let fiche = ami.execution.clone();
    *fiche.borrow_mut() = obj! {};
    let poser_f = |bout: &str, cle: &str, v: Json| {
        if let Some(f) = dans_opt(&mut fiche.borrow_mut(), bout) {
            poser(f, cle, v);
        }
    };
    let mut modeles: [Option<Box<dyn ModeleAmiT>>; 2] = [None, None];
    let mut chemins: [String; 2] = Default::default();
    let qui_de = |k: usize| if k == 0 { "de l'émetteur" } else { "du récepteur" };
    for k in 0..2 {
        let Some(b) = &ami.biblios[k] else { continue };
        let bout = BOUTS[k];
        poser(&mut fiche.borrow_mut(), bout, obj! {
            "bibliotheque" => &b.chemin, "chargee" => false, "init" => Json::Nul,
            "init_returns_impulse" => Json::Nul, "getwave" => Json::Nul,
            "parametres_in" => "", "parametres_out" => obj! {}, "message" => "",
            "surcharges_ignorees" => Vec::<String>::new(), "horloges" => Json::Nul, "note" => ""});
        let qui = qui_de(k);
        let essai = (|| -> Result<(Box<dyn ModeleAmiT>, String), ErreurIbis> {
            if ami.lus[k].is_none() {
                return Err(ErreurIbis::new(
                    format!("le fichier .ami {qui} n'est pas chargé : sans lui, pas de paramètres à passer au modèle."), ""));
            }
            let chemin = chargeur.chemin(&b.chemin, racines)?;
            Ok((chargeur.charger(&chemin)?, chemin))
        })();
        match essai {
            Ok((m, chemin)) => {
                poser_f(bout, "chargee", true.j());
                poser_f(bout, "getwave", m.getwave_existe().j());
                modeles[k] = Some(m);
                chemins[k] = chemin;
            }
            Err(exc) => {
                poser_f(bout, "note", exc.message.as_str().j());
                notes.push(format!("Modèle AMI {} non exécuté ({}) : repli sur l'égaliseur de référence.", qui, exc.message));
            }
        }
    }
    if modeles.iter().all(Option::is_none) {
        return Ok(nl);
    }

    let amp = (p.v_haut - p.v_bas) / 2.0;
    let v_mil = (p.v_haut + p.v_bas) / 2.0;
    let (dt_e, s_canal) = _echelon_canal(freqs, canal, h0, h0_bin, p, nl.as_ref(), lent)?;
    let x0 = match &nl {
        Some(nl) => nl.x0.unwrap_or(1.0),
        None => h0.unwrap_or_else(|| s_canal.last().copied().unwrap_or(0.0)),
    };
    let s_brut = s_canal.clone();
    let mut s_canal = s_canal;
    let mut ffe_appliquee = false;
    if modeles[0].is_none() && p.a_une_ffe() {
        // La FFE de reference de l'emetteur, posee ici puisque l'oeil ne la
        // posera plus (la reponse qu'on lui rend l'inclut).
        s_canal = _decaler_ffe(&s_canal, &p.ffe, spu);
        ffe_appliquee = true;
    }
    let swing = 2.0 * amp;
    // np.diff(np.concatenate([[0.0], s_canal])) * swing / dt_e
    let impulsion: Vec<f64> = (0..s_canal.len()).map(|i| (s_canal[i] - if i > 0 { s_canal[i - 1] } else { 0.0 }) * swing / dt_e).collect();
    let mut executes: Vec<&str> = Vec::new();

    let lancer = |k: usize, imp: &[f64], modeles: &mut [Option<Box<dyn ModeleAmiT>>; 2], executes: &mut Vec<&str>, notes: &mut Vec<String>| -> Res<Vec<f64>> {
        let bout = BOUTS[k];
        let a = ami.lus[k].as_ref();
        let surcharges = ami.biblios[k].as_ref().map(|b| &b.surcharges);
        let (texte, _appl, ign) = ibis::parametres_ami_in(a, surcharges, None).map_err(ErreurOeil::ibis)?;
        poser_f(bout, "parametres_in", texte.as_str().j());
        poser_f(bout, "surcharges_ignorees", ign.j());
        let iri = ibis::reserve_ami(a, "Init_Returns_Impulse", Json::Bool(true)).vrai();
        poser_f(bout, "init_returns_impulse", iri.j());
        let Some(m) = modeles[k].as_mut() else { return Ok(imp.to_vec()) };
        let (ok, rendu, p_out, msg) = m.init(imp, dt_e, ui, &texte);
        poser_f(bout, "init", ok.j());
        poser_f(bout, "message", msg.as_str().j());
        poser_f(bout, "parametres_out", Json::Objet(ibis::lire_parametres_ami(&p_out)));
        if !ok {
            notes.push(format!(
                "AMI_Init du modèle {} a échoué{} : repli sur l'égaliseur de référence.",
                qui_de(k), if msg.is_empty() { String::new() } else { format!(" (« {msg} »)") }));
            m.fermer();
            modeles[k] = None;
            return Ok(imp.to_vec());
        }
        executes.push(bout);
        if !iri {
            poser_f(bout, "note", "Init_Returns_Impulse False : l'impulsion n'est pas modifiée par AMI_Init.".j());
            return Ok(imp.to_vec());
        }
        if !fini(&rendu) {
            notes.push(format!("Le modèle de l'{bout} a rendu une impulsion non finie : ignorée."));
            return Ok(imp.to_vec());
        }
        Ok(rendu)
    };

    let mut imp_tx = impulsion.clone();
    let mut tx: Option<ModeleRc> = None;
    if modeles[0].is_some() {
        imp_tx = lancer(0, &impulsion, &mut modeles, &mut executes, notes)?;
        if let Some(mut m) = modeles[0].take() {
            if p.a_une_ffe() {
                notes.push("Émetteur AMI exécuté : la FFE de référence saisie est ignorée, le modèle fait la sienne.".into());
            }
            // L'AMI_GETWAVE DE L'EMETTEUR (2.4.0) : il fait la forme d'onde
            // du flot temporel (voir plus bas) ; sans lui, l'emetteur est
            // pris lineaire sur son impulsion.
            let tx_gw = m.getwave_existe() && ibis::reserve_ami(ami.lus[0].as_ref(), "GetWave_Exists", Json::Bool(true)).vrai();
            poser_f("emetteur", "getwave", tx_gw.j());
            if !tx_gw {
                if !fiche.borrow()["emetteur"]["init_returns_impulse"].vrai() {
                    notes.push("Émetteur AMI sans Init_Returns_Impulse ni AMI_GetWave : il est pris linéaire sur l'impulsion du canal.".into());
                }
                m.fermer();
            } else {
                tx = Some(Rc::new(RefCell::new(m)));
            }
        }
    }
    let mut imp_rx = imp_tx.clone();
    let mut rx: Option<ModeleRc> = None;
    if modeles[1].is_some() {
        imp_rx = lancer(1, &imp_tx, &mut modeles, &mut executes, notes)?;
        rx = modeles[1].take().map(|m| Rc::new(RefCell::new(m)));
    }
    if executes.is_empty() {
        return Ok(nl);
    }

    // -- ce que l'oeil lit ----------------------------------------------
    let s_stat: Vec<f64> = cumsum(&imp_rx).iter().map(|x| x * dt_e / swing).collect();
    let s_tx: Vec<f64> = cumsum(&imp_tx).iter().map(|x| x * dt_e / swing).collect();
    let x0_ami = moyenne(&s_stat[s_stat.len().saturating_sub(1.max(spu))..]);
    let p_tx = _un_bit(&s_tx, spu);
    let p_rx = _un_bit(&s_stat, spu);
    // Le niveau moyen : celui du canal pour la forme d'onde qui ENTRE dans
    // le modele du recepteur, celui que le modele rend pour l'oeil.
    let (v_in, v_c) = (v_mil * x0, v_mil * x0_ami);
    let horloges = Rc::new(RefCell::new(Horloges::default()));
    let getwave = rx.as_ref().is_some_and(|r| r.borrow().getwave_existe())
        && ibis::reserve_ami(ami.lus[1].as_ref(), "GetWave_Exists", Json::Bool(true)).vrai();
    if rx.is_some() {
        poser_f("recepteur", "getwave", getwave.j());
    }
    let ignore_de = |k: usize, actif: bool| -> usize {
        if !actif {
            return 0;
        }
        _nombre(&ibis::reserve_ami(ami.lus[k].as_ref(), "Ignore_Bits", Json::Entier(0)), 0.0).max(0.0) as usize
    };
    let ignore = ignore_de(1, rx.is_some());
    let ignore_tx = ignore_de(0, tx.is_some());
    let p_brut = _un_bit(&s_brut, spu);
    // LE RECEPTEUR SANS GETWAVE, DERRIERE UN EMETTEUR A GETWAVE : son
    // egaliseur seul, sur le canal BRUT -- une seconde instance, initialisee
    // sur l'impulsion du canal sans l'emetteur (c'est elle que la forme
    // d'onde de l'emetteur traverse). A defaut, celle du flot statistique.
    let mut imp_rx_brut = imp_rx.clone();
    if tx.is_some() && rx.is_some() && !getwave {
        let essai = (|| -> Result<Vec<f64>, String> {
            let mut rx2 = chargeur.charger(&chemins[1]).map_err(|e| e.message)?;
            let pin = fiche.borrow()["recepteur"]["parametres_in"].as_str().unwrap_or("").to_string();
            let (ok2, rendu2, _, msg2) = rx2.init(&impulsion, dt_e, ui, &pin);
            rx2.fermer();
            if ok2 && fini(&rendu2) && fiche.borrow()["recepteur"]["init_returns_impulse"].vrai() {
                Ok(rendu2)
            } else {
                Err(if msg2.is_empty() { "AMI_Init a rendu 0".to_string() } else { msg2 })
            }
        })();
        match essai {
            Ok(r) => imp_rx_brut = r,
            Err(exc) => notes.push(format!(
                "Seconde initialisation du récepteur AMI sur le canal brut impossible ({exc}) : l'égaliseur de \
                 l'émetteur y est compté deux fois.")),
        }
    }
    let a_nl_ibis = nl.is_some();

    // La forme d'onde periodique `w` passee par la reponse `g` (au pas
    // dt_e) : la reponse repliee sur la periode, en convolution
    // circulaire -- le regime etabli.
    let circulaire = move |w: &[f64], g: &[f64]| -> Vec<f64> {
        let n = w.len();
        let mut gp = vec![0.0; n];
        for (i, v) in g.iter().enumerate() {
            gp[i % n] += v;
        }
        let x: Vec<Complex64> = rfft(w).iter().zip(rfft(&gp)).map(|(a, b)| a * b).collect();
        irfft(&x, n).iter().map(|v| v * dt_e).collect()
    };

    // AMI_GetWave de `m` sur le flot `x`, par blocs : (sortie,
    // instants d'horloge depuis le debut du flot).
    let fiche_f = fiche.clone();
    let flot = move |m: &ModeleRc, x: &[f64], qui: &str| -> Res<(Vec<f64>, Vec<f64>)> {
        let bloc = BITS_PAR_BLOC_AMI * spu;
        let mut sortie = vec![0.0; x.len()];
        let mut hor = Vec::new();
        let nom = if qui == "emetteur" { "de l'émetteur" } else { "du récepteur" };
        let mut i = 0;
        while i < x.len() {
            let fin = (i + bloc).min(x.len());
            let (ok, w, h, p_out) = m.borrow_mut().getwave(&x[i..fin], spu as i64).map_err(|exc| {
                let (genre, detail) = exc.split_once(" : ").unwrap_or(("Exception", &exc));
                ErreurOeil::new(format!("AMI_GetWave {nom} a levé {genre} : {detail}"), "Vérifiez la bibliothèque et ses paramètres.")
            })?;
            if !ok {
                return Err(ErreurOeil::new(format!("AMI_GetWave {nom} a rendu 0 (échec) sur un bloc."), "Vérifiez les paramètres du modèle."));
            }
            let n = w.len().min(sortie.len() - i);
            sortie[i..i + n].copy_from_slice(&w[..n]);
            hor.extend(h);
            if !p_out.is_empty() {
                if let Some(f) = dans_opt(&mut fiche_f.borrow_mut(), qui) {
                    maj(dans(f, "parametres_out"), Json::Objet(ibis::lire_parametres_ami(&p_out)));
                }
            }
            i += bloc;
        }
        Ok((sortie, hor))
    };

    let mut nl = nl;
    let (infos_nl, t50_nl) = (nl.as_ref().map(|n| n.infos.clone()), nl.as_ref().map(|n| n.t50));
    let mut onde_ibis: Option<Onde> = nl.as_mut().map(|n| std::mem::replace(&mut n.onde, Box::new(|_| Ok(Vec::new()))));
    let (tx_o, rx_o, horloges_o) = (tx.clone(), rx.clone(), horloges.clone());
    // LE FLOT TEMPOREL, une periode du motif `bits` en regime etabli :
    //   1. a la broche du recepteur : l'emetteur -- son AMI_GetWave sur la
    //      stimulation (+-0,5 par bit) passe par le canal brut, ou son
    //      impulsion (AMI_Init, ou la FFE de reference) en superposition ;
    //   2. avec des tampons IBIS simules dans le temps (`nl`), la forme
    //      d'onde NON LINEAIRE de la broche, et l'egalisation de
    //      l'emetteur ajoutee par le canal linearise : la norme suppose
    //      le canal analogique lineaire, et ce qui ne l'est pas -- les
    //      tampons -- reste dans la forme d'onde, intact ;
    //   3. le recepteur : son AMI_GetWave sur cette forme d'onde, par
    //      blocs, apres Ignore_Bits -- et les instants de son horloge
    //      recuperee ; sans GetWave, son impulsion (AMI_Init).
    let onde: Onde = Box::new(move |bits: &[i32]| {
        let per = bits.len();
        let n_l = per * spu;
        let n_per = MAX_PERIODES_AMI.min((ignore.max(ignore_tx) as f64 / per as f64).ceil() as usize + 2);
        let fin = |v: &[f64]| v[v.len().saturating_sub(n_l)..].to_vec();
        let plusieurs = |v: &[f64]| -> Vec<f64> { (0..n_per).flat_map(|_| v.iter().copied()).collect() };
        let mut w: Option<Vec<f64>> = None;
        let mut pin: Vec<f64>;
        if let Some(tx) = &tx_o {
            let stim: Vec<f64> = bits.iter().flat_map(|b| std::iter::repeat(*b as f64 - 0.5).take(spu)).collect();
            let ww = fin(&flot(tx, &plusieurs(&stim), "emetteur")?.0);
            pin = circulaire(&ww, &impulsion).iter().map(|v| v_in + v).collect();
            w = Some(ww);
        } else {
            pin = _onde_lineaire(bits, &p_tx, spu, amp, v_in);
        }
        // ce que les tampons font de plus que le canal lineaire
        let mut corr: Option<Vec<f64>> = None;
        if let Some(onde_ibis) = onde_ibis.as_mut() {
            let plat = _onde_lineaire(bits, &p_brut, spu, amp, v_in);
            let brute = onde_ibis(bits)?;
            if brute.len() < n_l {
                return Err(ErreurOeil::plantage("ValueError", "operands could not be broadcast together"));
            }
            let c: Vec<f64> = (0..n_l).map(|i| brute[i] - plat[i]).collect();
            for (a, b) in pin.iter_mut().zip(&c) {
                *a += b;
            }
            corr = Some(c);
        }
        let Some(rx) = &rx_o else { return Ok(pin) };
        if !getwave {
            let mut out = match &w {
                Some(w) => circulaire(w, &imp_rx_brut).iter().map(|v| v_c + v).collect(),
                None => _onde_lineaire(bits, &p_rx, spu, amp, v_c),
            };
            if let Some(c) = &corr {
                for (a, b) in out.iter_mut().zip(c) {
                    *a += b;
                }
            }
            return Ok(out);
        }
        let (sortie, hor) = flot(rx, &plusieurs(&pin), "recepteur")?;
        let mut hz = horloges_o.borrow_mut();
        hz.n = hor.len();
        if !hor.is_empty() {
            // L'ECHANTILLONNAGE DE L'HORLOGE RECUPEREE (IBIS, BIRD 214) :
            // chaque instant + bit_time / 2, compte depuis le debut du flot.
            // Ceux de la periode gardee, en echantillons depuis son debut :
            // l'oeil les impose (`oeil`, « L'HORLOGE RECUPEREE »).
            let debut = ((n_per - 1) * per) as f64 * ui;
            hz.instants = Some(hor.iter().map(|t| t + 0.5 * ui - debut).filter(|t| *t >= 0.0 && *t < per as f64 * ui).map(|t| t / dt_e).collect());
            let mut moy = ZERO;
            for t in &hor {
                moy += Complex64::new(0.0, 2.0 * PI * t / ui).exp();
            }
            moy /= hor.len() as f64;
            hz.phase_ui = Some(fmod_py(moy.arg() / (2.0 * PI), 1.0));
        }
        Ok(fin(&sortie))
    });

    let mut infos = infos_nl.unwrap_or_else(|| obj! {});
    let asym = infos.get("asymetrie").cloned().unwrap_or(Json::Flottant(0.0));
    maj(&mut infos, obj! {"asymetrie" => asym, "ami" => true, "ami_executes" => executes.clone()});
    let a_tx = tx.is_some();
    let ami_nl = AmiNl { horloges, rx, tx };
    let t50 = t50_nl.unwrap_or(4.0 * p.tr / TR_SUR_SIGMA);
    let sortie = match nl {
        Some(n) => NonLineaire { s: s_stat, dt: dt_e, x0: Some(x0_ami), onde, t50, v_haut: p.v_haut, v_bas: p.v_bas, infos, ami: Some(ami_nl), ..n },
        None => NonLineaire {
            s: s_stat, dt: dt_e, x0: Some(x0_ami), onde, t50, v_haut: p.v_haut, v_bas: p.v_bas, infos, ami: Some(ami_nl),
            liaison: None, liaison_paire: None, dernier: Rc::new(RefCell::new(None)), pas_bit: 0,
        },
    };
    // L'egaliseur de reference s'efface devant le modele qui s'execute.
    if executes.contains(&"emetteur") || ffe_appliquee {
        (p.ffe, p.ffe_principal) = (vec![1.0], 0);
    }
    if executes.contains(&"recepteur") {
        if p.ctle.as_ref().is_some_and(Json::vrai) || p.dfe_prises != 0 {
            notes.push("Récepteur AMI exécuté : le CTLE et le DFE de référence sont retirés, le modèle égalise lui-même.".into());
        }
        (p.ctle, p.dfe_prises) = (None, 0);
    }
    let mut flots: Vec<String> = Vec::new();
    if a_tx {
        flots.push("AMI_GetWave de l'émetteur sur la stimulation, puis le canal brut".into());
    }
    if getwave {
        flots.push(format!("AMI_GetWave du récepteur par blocs de {BITS_PAR_BLOC_AMI} bits"));
    }
    if a_nl_ibis {
        flots.push("sur la forme d'onde des tampons IBIS simulés dans le temps, l'égalisation ajoutée par le canal linéarisé".into());
    }
    notes.push(format!(
        "Modèle(s) AMI exécuté(s) : {} — {}.",
        executes.iter().map(|x| if *x == "emetteur" { "émetteur" } else { "récepteur" }).collect::<Vec<_>>().join(" et "),
        if flots.is_empty() { "AMI_Init seul (impulsion)".to_string() } else { format!("AMI_Init, puis {}", flots.join(" ; ")) }));
    Ok(Some(sortie))
}
