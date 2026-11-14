//! Les tampons IBIS : emetteur et recepteur non lineaires.

use std::cell::RefCell;
use std::f64::consts::PI;
use std::rc::Rc;

use em::obj;
use em::simulation_em::base::*;
use ibis::{Boitier, Couple, Liaison, LiaisonPaire, Lu, Modele, Mutuelle, PaireDiff, Tampon};

use crate::ami::ModeleRc;
use crate::briques::*;
use crate::np::*;
use crate::params::nul_ou_vide;
use crate::{ErreurOeil, Params, Res, ECHANTILLONS_UI, M2, M4, TR_SUR_SIGMA};

// ==========================================================================
// Les tampons IBIS : emetteur et recepteur non lineaires
// --------------------------------------------------------------------------
// QUAND UN FICHIER IBIS ARRIVE, la superposition ne vaut plus : un tampon
// CMOS n'a pas la meme resistance a l'etat haut et a l'etat bas, et ses
// diodes ecretent. La liaison se simule alors DANS LE TEMPS (`ibis.Liaison`) :
// le canal en ondes de puissance -- sa cascade ABCD, charge lineaire du
// recepteur comprise --, le tampon emetteur au bout gauche, les diodes du
// recepteur au bout droit, et un Newton a chaque pas.
//
// DEUX SIMULATIONS, ET LE RESTE NE CHANGE PAS :
//   · deux fronts isoles, un montant et un descendant, laisses s'etablir :
//     leur moyenne normalisee est la REPONSE A UN ECHELON dont le pire cas,
//     l'oeil statistique et l'egaliseur ont besoin (l'ecart entre les deux
//     se rend : c'est ce que la linearisation neglige) ;
//   · la sequence PRBS elle-meme, en regime etabli : c'est elle qui fait
//     l'oeil PRBS et sa densite, sans aucune linearisation.
//
// LE BOITIER (2.1.0) : R_pkg et L_pkg en serie, C_pkg a la broche, de
// chaque cote -- [Package], [Pin] par broche, diagonale d'un
// [Package Model] (voir `ibis.boitier_broche`). Il est LINEAIRE : on le fond
// dans la cascade du canal, ABCD contre ABCD, ENTRE le die (ou le tampon
// et C_comp restent au Newton) et la piste. Rien n'est ajoute au pas de
// temps -- ni inconnue, ni integration de plus --, et le boitier passe par
// le meme chemin que la piste : parametres S, fenetre, reponses
// impulsionnelles. Le prix : ses resonances au-dessus du haut de la grille
// sont lissees comme le reste (le lissage est la moitie du front du
// tampon, bien plus court que L_pkg / R0 ou R0 C_pkg pour les boitiers
// usuels). Un boitier nul ne touche pas la cascade : le resultat est celui
// d'avant, au bit pres.
//
// EN DIFFERENTIEL (2.1.0), LES DEUX BRINS. Chaque tampon attaque SON brin
// de la paire, remise par brin a partir de ses deux modes -- la cascade du
// mode impair (`abcd_dd`) et celle du mode commun, reconstruite des S_cc
// que `simulation_em` rend (voir `abcd_depuis_s`). Le brin inverse recoit
// la sequence inverse, retardee de tdelay ([Diff Pin]) ; chaque brin a son
// modele, son coin, son boitier, sa capacite d'entree. Ce qui n'est pas
// oppose part en mode commun, et se rend : `mode_commun` du resultat.
// Sans la cascade du mode commun, on retombe sur le demi-circuit du mode
// impair, le mode commun tenu a sa valeur continue, et on le dit.
// ==========================================================================

// Pas de temps d'une simulation non lineaire, au plus : au-dela, quelques
// dizaines de secondes de calcul.
pub const MAX_PAS_NL: f64 = 400000.0;
// Le lissage du canal, en fraction du front du tampon : voir `ibis`.
pub const LISSAGE_SUR_FRONT: f64 = 0.5;
// La courbe du mode commun rendue : ses premiers bits, a ce pas par UI.
pub const BITS_MODE_COMMUN: usize = 40;
pub const PAS_MODE_COMMUN: usize = 16;

/// La forme d'onde periodique d'une sequence, au pas ui / 64.
pub type Onde = Box<dyn FnMut(&[i32]) -> Res<Vec<f64>>>;

/// Les instants de l'horloge recuperee par un recepteur AMI.
#[derive(Debug, Clone, Default, PartialEq)]
pub struct Horloges {
    pub n: usize,
    pub instants: Option<Vec<f64>>,
    pub phase_ui: Option<f64>,
}

/// `nl["ami"]` : {horloges, rx, tx}.
pub struct AmiNl {
    pub horloges: Rc<RefCell<Horloges>>,
    pub rx: Option<ModeleRc>,
    pub tx: Option<ModeleRc>,
}

/// La derniere forme d'onde simulee de la paire : les quatre tensions des brins, et sa sequence.
#[derive(Debug, Clone, PartialEq)]
pub struct Dernier {
    pub brins: [Vec<f64>; 4],
    pub bits: Vec<i32>,
}

/// La liaison simulee dans le temps : ce que `oeil(non_lineaire=...)` lit.
pub struct NonLineaire {
    pub s: Vec<f64>,
    pub dt: f64,
    pub onde: Onde,
    pub t50: f64,
    pub v_haut: f64,
    pub v_bas: f64,
    pub infos: Json,
    /// le niveau etabli de la reponse a un echelon (flot AMI) ; 1 sinon
    pub x0: Option<f64>,
    pub liaison: Option<Rc<Liaison>>,
    pub liaison_paire: Option<Rc<LiaisonPaire>>,
    pub dernier: Rc<RefCell<Option<Dernier>>>,
    pub pas_bit: usize,
    pub ami: Option<AmiNl>,
}

/// Le contexte des tampons IBIS de la requete (`preparer_ibis`).
#[derive(Debug, Clone)]
pub struct Ctx {
    pub em: Option<Tampon>,
    pub m_em: Option<Modele>,
    pub em_n: Option<Tampon>,
    pub m_em_n: Option<Modele>,
    pub m_rx: Option<Modele>,
    pub rx: Option<Tampon>,
    pub rx_n: Option<Tampon>,
    pub c_rx: Option<(f64, f64)>,
    pub bt_em: (Option<Boitier>, Option<Boitier>),
    pub bt_rx: (Option<Boitier>, Option<Boitier>),
    pub decalage: f64,
    pub vdiff: Option<f64>,
    pub mut_em: Option<Mutuelle>,
    pub mut_rx: Option<Mutuelle>,
    pub cpl_em: Option<Couple>,
    pub cpl_rx: Option<Couple>,
    /// {emetteur: {...}, recepteur: {...}}
    pub infos: Json,
    pub notes: Vec<String>,
    pub boitier: bool,
    pub r_mc: f64,
    pub temporel: bool,
    pub paire: bool,
    pub tr_e: f64,
    pub tr_lissage: f64,
}

fn de_ibis(exc: ibis::ErreurIbis) -> ErreurOeil {
    ErreurOeil::new(exc.message, exc.conseil)
}

/// ([Model], Tampon) du modele `nom` (ou du premier qui convient au
/// role) d'un fichier lu.
fn _tampon(lu: &Lu, nom: &str, coin: &str, role: &str) -> Res<(Modele, Tampon)> {
    let modeles = &lu.modeles;
    if !nom.is_empty() && !modeles.contains_key(nom) {
        let mut noms: Vec<&str> = modeles.keys().map(String::as_str).collect();
        noms.sort();
        return Err(ErreurOeil::new(
            format!("IBIS de l'{} : pas de [Model] « {} » dans {}.", role, nom, if lu.fichier.is_empty() { "le fichier" } else { &lu.fichier }),
            format!("Modèles présents : {}.", noms.join(", ")),
        ));
    }
    let m = if nom.is_empty() {
        let voulu = modeles.values().find(|m| ibis::est_emetteur(m) == (role == "émetteur"));
        match voulu.or_else(|| modeles.values().next()) {
            Some(m) => m,
            None => return Err(ErreurOeil::plantage("IndexError", "list index out of range")),
        }
    } else {
        &modeles[nom]
    };
    let t = Tampon::new(m, coin).map_err(de_ibis)?;
    Ok((m.clone(), t))
}

/// Un bout de la liaison, tel que `_charger_ibis` le rend.
struct Bout {
    lu: Lu,
    m: Modele,
    t: Tampon,
    m_n: Option<Modele>,
    t_n: Option<Tampon>,
    bt: Option<Boitier>,
    bt_n: Option<Boitier>,
    broche: String,
    inverse: String,
    paire: Option<PaireDiff>,
    notes: Vec<String>,
    mut_: Option<Mutuelle>,
    cpl: Option<Couple>,
}

// str(d.get(cle) or "")
fn texte_ou(d: &Json, cle: &str, defaut: &str) -> String {
    if d[cle].vrai() { str_py(&d[cle]) } else { defaut.to_string() }
}

/// Un bout de la liaison, d'un champ `ibis_emetteur` ou `ibis_recepteur`
/// {texte, fichier, modele, coin, broche, modele_n, coin_n} :
/// {lu, m, t, m_n, t_n, bt, bt_n, broche, inverse, paire, notes}.
///
/// LA BROCHE choisit le modele ([Pin], ou le premier d'un
/// [Model Selector]) et le boitier. EN DIFFERENTIEL, la broche designe une
/// paire de [Diff Pin], et le brin inverse prend le modele et le boitier
/// de SA broche ; sans broche, la premiere paire dont le modele est celui
/// choisi est prise d'office, et sans [Diff Pin] les deux brins prennent
/// le meme modele et le boitier moyen.
fn _charger_ibis(d: &Json, role: &str, diff: bool, boitier: bool, voisins: bool, r_voisin: f64) -> Res<Bout> {
    let erreur = |exc: ibis::ErreurIbis| ErreurOeil::new(format!("IBIS de l'{} : {}", role, exc.message), exc.conseil);
    let lu = ibis::lire(&texte_ou(d, "texte", ""), &texte_ou(d, "fichier", ""), true).map_err(erreur)?;
    let coin = texte_ou(d, "coin", "typ").to_lowercase();
    let coin_n = texte_ou(d, "coin_n", &coin).to_lowercase();
    let mut nom = texte_ou(d, "modele", "");
    let mut nom_n = texte_ou(d, "modele_n", "");
    let mut broche = texte_ou(d, "broche", "");
    let mut inverse = String::new();
    let mut paire: Option<PaireDiff> = None;
    let mut notes: Vec<String> = Vec::new();

    if diff {
        if !broche.is_empty() {
            paire = ibis::paire_diff(&lu, &broche);
            if paire.is_none() {
                let liste = lu.paires_diff.iter().map(|x| format!("{}/{}", x.broche, x.inverse)).collect::<Vec<_>>().join(", ");
                return Err(ErreurOeil::new(
                    format!("IBIS de l'{role} : la broche {broche} n'est dans aucune [Diff Pin]."),
                    if !liste.is_empty() {
                        format!("Paires du fichier : {liste}.")
                    } else {
                        "Le fichier n'a pas de [Diff Pin] : laissez la broche vide, les deux brins prendront le même modèle.".to_string()
                    },
                ));
            }
        } else {
            for x in &lu.paires_diff {
                let Ok((nm, _)) = ibis::modele_broche(&lu, &x.broche, &nom) else { continue };
                if nom.is_empty() || nm == nom {
                    paire = Some(PaireDiff { note: Some("paire prise d'office".into()), ..x.clone() });
                    break;
                }
            }
        }
        if let Some(p) = &paire {
            (broche, inverse) = (p.broche.clone(), p.inverse.clone());
            if let Some(n) = p.note.as_ref().filter(|n| !n.is_empty()) {
                notes.push(format!("{role} : {broche}/{inverse}, {n}."));
            }
        }
    }
    if !broche.is_empty() {
        let (n, note) = ibis::modele_broche(&lu, &broche, &nom).map_err(erreur)?;
        nom = n;
        if !note.is_empty() {
            notes.push(format!("{role}, broche {broche} : {note}."));
        }
    }
    if !inverse.is_empty() {
        let voulu = if nom_n.is_empty() { nom.clone() } else { nom_n.clone() };
        nom_n = ibis::modele_broche(&lu, &inverse, &voulu).map_err(erreur)?.0;
    }
    let (m, t) = _tampon(&lu, &nom, &coin, role)?;
    let (mut m_n, mut t_n) = (None, None);
    if diff {
        let (a, b) = _tampon(&lu, if nom_n.is_empty() { &m.nom } else { &nom_n }, &coin_n, role)?;
        (m_n, t_n) = (Some(a), Some(b));
    }
    let (mut bt, mut bt_n, mut mut_, mut cpl) = (None, None, None, None);
    if boitier {
        // LES MUTUELLES DE LA PAIRE (2.2.0) : entre la broche et son
        // inverse, elles se comptent ; les autres se disent.
        if diff && !broche.is_empty() && !inverse.is_empty() {
            mut_ = ibis::mutuelle_paire(&lu, &broche, &inverse);
        }
        let b = ibis::boitier_broche(&lu, &broche, &coin, if mut_.is_some() { Some(inverse.as_str()) } else { None });
        notes.extend(b.notes.iter().cloned());
        bt = Some(b);
        if diff {
            let b = ibis::boitier_broche(&lu, &inverse, &coin_n, if mut_.is_some() { Some(broche.as_str()) } else { None });
            notes.extend(b.notes.iter().cloned());
            bt_n = Some(b);
        }
        if let Some(mu) = &mut_ {
            notes.push(format!(
                "{} : mutuelles du {} entre {} et {} comptées (L_m {} nH, C_m {} pF ; k_L {}, k_C {}).",
                role, mu.source, broche, inverse, fmt_g(mu.l * 1e9, 3), fmt_g(mu.c * 1e12, 3), pf(mu.k_l, 2), pf(mu.k_c, 2)));
        }
        if ibis::boitier_nul(bt.as_ref()) {
            bt = None;
        }
        if ibis::boitier_nul(bt_n.as_ref()) {
            bt_n = None;
        }
        // LES MUTUELLES HORS DE LA PAIRE (2.4.0, `ibis.voisins_boitier`) :
        // les voisines du [Package Model], au repos, fermees aux deux bouts
        // et eliminees. Elles remplacent la note « ignorées ».
        if !broche.is_empty() && voisins {
            let victimes: Vec<&str> = if diff && !inverse.is_empty() { vec![&broche, &inverse] } else { vec![&broche] };
            cpl = ibis::voisins_boitier(&lu, &victimes);
            if let Some(c) = cpl.as_mut() {
                c.r_voisin = r_voisin;
                notes.retain(|x| !x.starts_with("Mutuelles du [Package Model]"));
                let courts: Vec<&str> = c.voisines.iter().filter(|x| c.genres.get(*x).map(String::as_str) == Some("court")).map(String::as_str).collect();
                notes.push(format!(
                    "{} : mutuelles du [Package Model] {} vers {} broche(s) voisine(s) comptées ({}{} ; couplage le plus fort k = \
                     {}), voisines au repos fermées sur {} Ω aux deux bouts{}.",
                    role, c.nom, c.voisines.len(),
                    c.voisines.iter().take(6).cloned().collect::<Vec<_>>().join(", "),
                    if c.voisines.len() > 6 { ", …" } else { "" },
                    pf(c.k_max, 2), pf(r_voisin, 0),
                    if courts.is_empty() {
                        String::new()
                    } else {
                        format!(", alimentations et masses ({}) en court-circuit", courts.iter().take(4).copied().collect::<Vec<_>>().join(", "))
                    }));
            }
        }
    }
    Ok(Bout { lu, m, t, m_n, t_n, bt, bt_n, broche, inverse, paire, notes, mut_, cpl })
}

fn _infos_boitier(bt: Option<&Boitier>) -> Json {
    let Some(bt) = bt else { return Json::Nul };
    let mut sortie = obj! {"r" => bt.r, "l" => bt.l, "c" => bt.c, "source" => &bt.source};
    if let Some(s) = bt.sections.as_ref().filter(|s| !s.is_empty()) {
        poser(&mut sortie, "sections", s.len());
    }
    sortie
}

fn _infos_mutuelle(m: &Mutuelle) -> Json {
    obj! {"r" => m.r, "l" => m.l, "c" => m.c, "k_l" => m.k_l, "k_c" => m.k_c, "source" => &m.source}
}

// o.get(cle, True) not in (False, 0, "0", "false", "non")
fn pas_refuse(o: &Json, cle: &str) -> bool {
    match o.get(cle) {
        None => true,
        Some(Json::Bool(b)) => *b,
        Some(Json::Entier(i)) => *i != 0,
        Some(Json::Flottant(f)) => *f != 0.0,
        Some(Json::Texte(t)) => !matches!(t.as_str(), "0" | "false" | "non"),
        Some(_) => true,
    }
}

/// Le contexte des tampons IBIS de la requete, ou None s'il n'y en a pas.
///
/// Modifie `p` : la capacite du recepteur devient son C_comp, et un
/// emetteur IBIS n'a ni pre-accentuation ni front gaussien -- ses niveaux
/// et son front sont les siens. En differentiel, un `decalage_n` saisi
/// suffit a simuler les deux brins, meme sans fichier.
pub fn preparer_ibis(o: &Json, p: &mut Params) -> Res<Option<Ctx>> {
    let bout = |cle: &str| Some(&o[cle]).filter(|d| d.as_objet().is_some() && d["texte"].vrai());
    let em_d = bout("ibis_emetteur");
    let rx_d = bout("ibis_recepteur");
    let diff = p.mode == "diff";
    let dec_saisi = diff && !nul_ou_vide(&o["decalage_n"]);
    let dec = if dec_saisi { _nombre(&o["decalage_n"], 0.0) } else { 0.0 };
    if !(em_d.is_some() || rx_d.is_some() || dec != 0.0) {
        return Ok(None);
    }
    if dec.abs() >= p.ui {
        return Err(ErreurOeil::new(
            format!("Décalage du brin inverse de {} ps : au moins une UI.", fmt_g(dec * 1e12, 3)),
            "Il se saisit en secondes, plus petit qu'un bit.",
        ));
    }
    let avec_bt = pas_refuse(o, "boitier");
    let avec_v = pas_refuse(o, "boitier_voisins");
    let mut r_voisin = _nombre(&o["r_voisin"], 50.0);
    if !(r_voisin > 0.0) {
        r_voisin = 50.0;
    }
    let mut ctx = Ctx {
        em: None, m_em: None, em_n: None, m_em_n: None,
        m_rx: None, rx: None, rx_n: None, c_rx: None,
        bt_em: (None, None), bt_rx: (None, None), decalage: 0.0, vdiff: None,
        mut_em: None, mut_rx: None, cpl_em: None, cpl_rx: None,
        infos: obj! {}, notes: Vec::new(), boitier: avec_bt,
        r_mc: maxf(&[0.0, _nombre(&o["r_charge_mc"], 0.0)]),
        temporel: false, paire: false, tr_e: 0.0, tr_lissage: 0.0,
    };
    let dt0 = p.ui / ECHANTILLONS_UI as f64 / 8.0;
    if let Some(em_d) = em_d {
        let b = _charger_ibis(em_d, "émetteur", diff, avec_bt, avec_v, r_voisin)?;
        let (m, t) = (&b.m, &b.t);
        for mm in [Some(m), b.m_n.as_ref()].into_iter().flatten() {
            if !ibis::est_emetteur(mm) {
                return Err(ErreurOeil::new(
                    format!("Le [Model] « {} » est de type {} : ce n'est pas un émetteur.", mm.nom, if mm.type_.is_empty() { "inconnu" } else { &mm.type_ }),
                    "Choisissez un modèle Output, I/O ou 3-state.",
                ));
            }
        }
        let cmd = ibis::commandes(m, t, dt0).map_err(de_ibis)?;
        if let (true, Some(m_n), Some(t_n)) = (diff, &b.m_n, &b.t_n) {
            ibis::commandes(m_n, t_n, dt0).map_err(de_ibis)?;
        }
        ctx.notes.extend(b.notes.iter().cloned());
        if let Some(pr) = &b.paire {
            ctx.decalage = pr.tdelay[ibis::coin(&t.coin).unwrap_or(0)];
        }
        let tr_e = ibis::duree_front(&cmd.montant, dt0);
        let lu = &b.lu;
        let mut infos = obj! {
            "fichier" => &lu.fichier, "composant" => &lu.composant,
            "modele" => &m.nom, "type" => &m.type_, "coin" => &t.coin,
            "c_comp" => t.c_comp, "commande" => &cmd.source,
            "front_10_90" => tr_e,
            "niveau_haut_vide" => t.niveau(1.0, 0.0, None, 0.0),
            "niveau_bas_vide" => t.niveau(0.0, 1.0, None, 0.0),
            "broche" => &b.broche, "boitier" => _infos_boitier(b.bt.as_ref()),
            "ignores" => lu.ignores.clone()};
        if let (true, Some(m_n), Some(t_n)) = (diff, &b.m_n, &b.t_n) {
            maj(&mut infos, obj! {
                "inverse" => &b.inverse, "modele_n" => &m_n.nom,
                "coin_n" => &t_n.coin,
                "boitier_n" => _infos_boitier(b.bt_n.as_ref()),
                "tdelay" => b.paire.as_ref().map(|_| ctx.decalage)});
            if let Some(mu) = &b.mut_ {
                poser(&mut infos, "mutuelle", _infos_mutuelle(mu));
            }
        }
        poser(&mut ctx.infos, "emetteur", infos);
        p.tr = tr_e;
        (p.ffe, p.ffe_principal) = (vec![1.0], 0);
        (ctx.em, ctx.m_em, ctx.em_n, ctx.m_em_n) = (Some(b.t), Some(b.m), b.t_n, b.m_n);
        (ctx.bt_em, ctx.mut_em, ctx.cpl_em) = ((b.bt, b.bt_n), b.mut_, b.cpl);
    }
    if let Some(rx_d) = rx_d {
        let b = _charger_ibis(rx_d, "récepteur", diff, avec_bt, avec_v, r_voisin)?;
        let (m, t, t_n) = (&b.m, &b.t, &b.t_n);
        // LA CAPACITE D'ENTREE PART DANS LE CANAL, lineaire ; seules les
        // diodes et les terminaisons restent au Newton. En differentiel,
        // deux broches en serie.
        if let (true, Some(t_n)) = (diff, t_n) {
            let cs = t.c_comp + t_n.c_comp;
            p.c_charge = if cs > 0.0 { t.c_comp * t_n.c_comp / cs } else { 0.0 };
            ctx.c_rx = Some((t.c_comp, t_n.c_comp));
        } else {
            p.c_charge = t.c_comp;
        }
        let garde = |tt: &Tampon| tt.a_des_diodes() || tt.g_gnd != 0.0 || tt.g_pow != 0.0;
        ctx.rx = Some(t.clone()).filter(garde);
        ctx.rx_n = t_n.clone().filter(garde);
        ctx.notes.extend(b.notes.iter().cloned());
        if let Some(v) = b.paire.as_ref().and_then(|pr| pr.vdiff).filter(|v| *v != 0.0) {
            ctx.vdiff = Some(v.abs());
        }
        let lu = &b.lu;
        let mut infos = obj! {
            "fichier" => &lu.fichier, "composant" => &lu.composant,
            "modele" => &m.nom, "type" => &m.type_, "coin" => &t.coin,
            "c_comp" => t.c_comp, "diodes" => t.a_des_diodes(),
            "vinl" => t.vinl, "vinh" => t.vinh, "broche" => &b.broche,
            "boitier" => _infos_boitier(b.bt.as_ref()), "ignores" => lu.ignores.clone()};
        if let (true, Some(m_n), Some(t_n)) = (diff, &b.m_n, t_n) {
            maj(&mut infos, obj! {
                "inverse" => &b.inverse, "modele_n" => &m_n.nom,
                "coin_n" => &t_n.coin, "c_comp_n" => t_n.c_comp,
                "boitier_n" => _infos_boitier(b.bt_n.as_ref()),
                "vdiff" => ctx.vdiff});
            if let Some(mu) = &b.mut_ {
                poser(&mut infos, "mutuelle", _infos_mutuelle(mu));
            }
        }
        poser(&mut ctx.infos, "recepteur", infos);
        ctx.m_rx = Some(b.m);
        (ctx.bt_rx, ctx.mut_rx, ctx.cpl_rx) = ((b.bt, b.bt_n), b.mut_, b.cpl);
    }
    if dec_saisi {
        ctx.decalage = dec;
    }
    ctx.temporel = ctx.em.is_some() || ctx.rx.is_some() || ctx.rx_n.is_some() || (diff && ctx.decalage != 0.0);
    ctx.paire = diff && ctx.temporel;
    ctx.tr_e = p.tr;
    ctx.tr_lissage = LISSAGE_SUR_FRONT * p.tr;
    Ok(Some(ctx))
}

// ctx["m_em"] is not ctx["m_em_n"] : deux [Model] du meme fichier sont le meme s'ils ont le meme nom
fn meme_modele(ctx: &Ctx) -> bool {
    match (&ctx.m_em, &ctx.m_em_n) {
        (Some(a), Some(b)) => a.nom == b.nom,
        (None, None) => true,
        _ => false,
    }
}

/// Ce qui distingue les deux brins d'une paire, en clair.
pub fn asymetries(ctx: Option<&Ctx>) -> Vec<String> {
    let mut out = Vec::new();
    let Some(ctx) = ctx else { return out };
    if ctx.decalage != 0.0 {
        out.push(format!("brin inverse décalé de {} ps", fmt_g(ctx.decalage * 1e12, 3)));
    }
    if let (Some(a), Some(b)) = (&ctx.em, &ctx.em_n) {
        if !meme_modele(ctx) {
            out.push(format!("émetteur : modèles {} / {}", ctx.m_em.as_ref().map_or("", |m| &m.nom), ctx.m_em_n.as_ref().map_or("", |m| &m.nom)));
        } else if a.coin != b.coin {
            out.push(format!("émetteur : coins {} / {}", a.coin, b.coin));
        }
    }
    if ctx.rx.is_none() != ctx.rx_n.is_none() {
        out.push("récepteur : diodes sur un seul brin".into());
    }
    if let Some((cp, cn)) = ctx.c_rx.filter(|c| (c.0 - c.1).abs() > 1e-18) {
        out.push(format!("récepteur : C_comp {} / {} pF", fmt_g(cp * 1e12, 3), fmt_g(cn * 1e12, 3)));
    }
    for (bout, (a, b)) in [("émetteur", &ctx.bt_em), ("récepteur", &ctx.bt_rx)] {
        let differents = match (a, b) {
            (Some(a), Some(b)) => [(a.r, b.r), (a.l, b.l), (a.c, b.c)].iter().any(|(x, y)| (x - y).abs() > 1e-6 * maxf(&[x.abs(), y.abs(), 1e-30])),
            (None, None) => false,
            _ => true,
        };
        if differents {
            out.push(format!("{bout} : boîtiers différents"));
        }
    }
    out
}

fn pile2(m: Option<Vec<M2>>) -> Res<Vec<M2>> {
    m.ok_or_else(|| ErreurOeil::plantage("AttributeError", "'NoneType' object has no attribute 'copy'"))
}

/// La cascade (N, 2, 2) entre die et die : boitier de l'emetteur IBIS
/// devant, boitier du recepteur IBIS derriere. En differentiel (cascade
/// du mode impair), le boitier de chaque brin est pose a l'identique sur
/// les deux -- la MOYENNE des deux broches, serie doublee et derivation
/// divisee par deux. Rend (abcds, note).
///
/// LES MUTUELLES DE LA PAIRE (2.2.0, `ibis.mutuelle_paire`) entrent dans
/// cette moyenne comme elles entrent dans le mode impair : L - L_m et
/// R - R_m en serie, C + C_m a la broche. UN BOITIER PAR SECTIONS est sa
/// cascade de lignes (`ibis.abcd_sections`) : les memes sections sur les
/// deux brins se posent en mode impair telles quelles ([A, 2B ; C/2, D]),
/// des sections differentes retombent sur la moyenne de leurs totaux --
/// la cascade a quatre acces, elle, les pose brin par brin.
pub fn appliquer_boitiers(ctx: Option<&Ctx>, freqs: &[f64], abcds: &[M2], mode: &str) -> Res<(Vec<M2>, String)> {
    let Some(ctx) = ctx else { return Ok((abcds.to_vec(), String::new())) };
    let mut m = abcds.to_vec();
    let (mut touche, mut mutuelle, mut voisins) = (false, false, false);
    let mut moyenne = "";
    for ((a, b), sens, actif, mut_, cpl) in [
        (&ctx.bt_em, "emission", ctx.em.is_some(), &ctx.mut_em, &ctx.cpl_em),
        (&ctx.bt_rx, "reception", true, &ctx.mut_rx, &ctx.cpl_rx),
    ] {
        if !actif || (a.is_none() && b.is_none()) {
            continue;
        }
        let mb: Option<Vec<M2>>;
        if let Some(cpl) = cpl.as_ref().filter(|c| (mode == "diff") == (c.victimes == 2)) {
            // LE BOITIER COUPLE A SES VOISINES (2.4.0) : en simple tel quel,
            // en differentiel par son mode impair
            let mc = ibis::abcd_boitier_couple(freqs, cpl, sens, cpl.r_voisin).map_err(ErreurOeil::ibis)?;
            mb = Some(if mode == "diff" { ibis::mode_impair_couple(&ibis::en_m4(&mc)) } else { ibis::en_m2(&mc) });
            voisins = true;
            mutuelle = mutuelle || mode == "diff";
        } else if mode == "diff" {
            let sections = |x: &Option<Boitier>| x.as_ref().and_then(|x| x.sections.clone()).filter(|s| !s.is_empty());
            let (sa, sb) = (sections(a), sections(b));
            if sa.is_some() && sa == sb {
                let mut m1 = pile2(ibis::abcd_boitier(freqs, a.as_ref(), sens))?;
                for x in m1.iter_mut() {
                    x[0][1] *= 2.0;
                    x[1][0] /= 2.0;
                }
                mb = Some(m1);
            } else {
                if sa.is_some() || sb.is_some() {
                    moyenne = " — boîtiers par sections différents sur les deux brins : la moyenne de leurs totaux";
                }
                mutuelle = mutuelle || mut_.is_some();
                let rlc = |x: &Option<Boitier>| x.as_ref().map_or((0.0, 0.0, 0.0), |x| (x.r, x.l, x.c));
                let mu = mut_.as_ref().map_or((0.0, 0.0, 0.0), |x| (x.r, x.l, x.c));
                let (pa, pb) = (rlc(a), rlc(b));
                let moy = (0.5 * (pa.0 + pb.0), 0.5 * (pa.1 + pb.1), 0.5 * (pa.2 + pb.2));
                let bt = Boitier::rlc(2.0 * (moy.0 - mu.0), 2.0 * (moy.1 - mu.1), (moy.2 + mu.2) / 2.0);
                mb = ibis::abcd_boitier(freqs, Some(&bt), sens);
            }
        } else {
            mb = ibis::abcd_boitier(freqs, a.as_ref(), sens);
        }
        let Some(mb) = mb else { continue };
        m = if sens == "emission" { mul_n(&mb, &m) } else { mul_n(&m, &mb) };
        touche = true;
    }
    if !touche {
        return Ok((abcds.to_vec(), String::new()));
    }
    Ok((m, format!(
        "boîtiers comptés (R/L_pkg en série, C_pkg à la broche{}{}){}",
        if mutuelle { ", mutuelles de la paire comprises" } else { "" },
        if voisins { ", mutuelles vers les broches voisines comprises" } else { "" },
        moyenne)))
}

/// (N, 2, 2) ABCD des S 2-ports a plat [[re, im] x 4] (S11, S12, S21,
/// S22) sur z_ref : la cascade du mode commun que `simulation_em` rend
/// sous forme de S_cc. Exacte, tant que S21 n'est pas nul.
pub fn abcd_depuis_s(s_plats: &Json, z_ref: f64) -> Option<Vec<M2>> {
    let s: Vec<[Complex64; 4]> =
        els(s_plats).iter().map(|m| std::array::from_fn(|k| Complex64::new(nb(&m[k][0]), nb(&m[k][1])))).collect();
    if s.iter().any(|x| x[2].norm() < 1e-300) {
        return None;
    }
    let z = z_ref;
    Some(
        s.iter()
            .map(|x| {
                let (s11, s12, s21, s22) = (x[0], x[1], x[2], x[3]);
                [[((UN + s11) * (UN - s22) + s12 * s21) / (s21 * 2.0), ((UN + s11) * (UN + s22) - s12 * s21) * z / (s21 * 2.0)],
                 [((UN - s11) * (UN - s22) - s12 * s21) / (s21 * 2.0 * z), ((UN - s11) * (UN + s22) + s12 * s21) / (s21 * 2.0)]]
            })
            .collect(),
    )
}

/// La tension de mode commun d'une paire de tampons en opposition : le
/// point fixe de la moyenne des deux niveaux, chacun charge par R/2 vers
/// elle.
fn _mode_commun(em: &Tampon, r_demi: Option<f64>, v0: f64) -> f64 {
    let mut vcm = v0;
    for _ in 0..40 {
        let hi = em.niveau(1.0, 0.0, r_demi, vcm);
        let lo = em.niveau(0.0, 1.0, r_demi, vcm);
        let nouv = 0.5 * (hi + lo);
        if (nouv - vcm).abs() < 1e-9 {
            break;
        }
        vcm = nouv;
    }
    vcm
}

/// (dt, k) : le pas de la simulation, un k-ieme du pas de l'oeil.
fn _pas(freqs: &[f64], ui: f64) -> (f64, usize) {
    let dt_e = ui / ECHANTILLONS_UI as f64;
    let k = (dt_e * 2.2 * freqs[freqs.len() - 1]).ceil().clamp(1.0, 16.0) as usize;
    (dt_e / k as f64, k)
}

/// `courir(bits)` : la tension vue par le recepteur, au pas dt, et les quatre tensions des
/// brins (ou None).
type Courir = Rc<dyn Fn(&[i32]) -> (Vec<f64>, Option<[Vec<f64>; 4]>)>;

/// Ce que `_fronts_et_onde` rend : {s, v_haut, v_bas, asym, onde, dernier}.
struct Fronts {
    s: Vec<f64>,
    v_haut: f64,
    v_bas: f64,
    asym: f64,
    onde: Onde,
    dernier: Rc<RefCell<Option<Dernier>>>,
}

/// Ce que les deux simulations rendent, quelle que soit la liaison :
/// {s, v_haut, v_bas, asym, onde, dernier}.
///
/// `courir(bits)` rend (v, quatre) : la tension vue par le recepteur, au
/// pas dt, et les quatre tensions des brins (ou None). `facteur` : le cout
/// d'un pas, en pas de ligne seule, pour le plafond.
#[allow(clippy::too_many_arguments)]
fn _fronts_et_onde(courir: Courir, l: usize, dt: f64, k: usize, n_cmd: usize, ui: f64, facteur: f64, seulement_onde: bool) -> Res<Fronts> {
    let spu = ECHANTILLONS_UI;
    let pas_bit = k * spu;
    let mut n_long = (l as f64 * dt / ui).ceil() as usize + 4;
    n_long = n_long.max((n_cmd as f64 * dt / ui).ceil() as usize + 4);
    let dernier: Rc<RefCell<Option<Dernier>>> = Rc::new(RefCell::new(None));

    let (courir_o, dernier_o) = (courir.clone(), dernier.clone());
    let onde: Onde = Box::new(move |bits: &[i32]| {
        let per = bits.len();
        if per == 0 {
            return Err(ErreurOeil::plantage("ZeroDivisionError", "float division by zero"));
        }
        let reps_ = (n_long as f64 / per as f64).ceil() as usize + 1;
        if ((reps_ + 1) * per * pas_bit) as f64 * facteur > MAX_PAS_NL {
            return Err(ErreurOeil::new(
                format!("Simulation IBIS trop longue pour ce motif ({per} bits, {pas_bit} pas par bit)."),
                "Prenez PRBS7, ou un débit plus faible.",
            ));
        }
        let longs: Vec<i32> = (0..reps_ + 1).flat_map(|_| bits.iter().copied()).collect();
        let (vv, quatre) = courir_o(&longs);
        let debut = reps_ * per * pas_bit;
        let coupe = |v: &[f64]| -> Vec<f64> { v[debut.min(v.len())..].iter().step_by(k).take(per * spu).copied().collect() };
        if let Some(q) = &quatre {
            *dernier_o.borrow_mut() = Some(Dernier { brins: [coupe(&q[0]), coupe(&q[1]), coupe(&q[2]), coupe(&q[3])], bits: bits.to_vec() });
        }
        Ok(coupe(&vv))
    });

    if seulement_onde {
        return Ok(Fronts { s: Vec::new(), v_haut: 0.0, v_bas: 0.0, asym: 0.0, onde, dernier });
    }
    if ((2 + 2 * n_long) * pas_bit) as f64 * facteur > MAX_PAS_NL {
        return Err(ErreurOeil::new(
            format!("Simulation IBIS trop longue : la réponse dure {n_long} bits à {pas_bit} pas par bit."),
            "Réduisez la longueur de la liaison ou le débit, ou retirez le modèle IBIS.",
        ));
    }
    let mut bits = vec![0, 0];
    bits.extend(std::iter::repeat(1).take(n_long));
    bits.extend(std::iter::repeat(0).take(n_long));
    let (v, _) = courir(&bits);
    let (i_r, i_f) = (2 * pas_bit, (2 + n_long) * pas_bit);
    let (v_bas, v_haut) = (v[i_r - 1], v[i_f - 1]);
    if !(v_haut - v_bas > 1e-6) {
        return Err(ErreurOeil::new(
            format!("Le tampon IBIS ne bascule pas : niveaux {} V et {} V au récepteur.", fmt_g(v_bas, 3), fmt_g(v_haut, 3)),
            "Vérifiez le modèle choisi (un Input ne pilote rien) et le coin.",
        ));
    }
    let s_r: Vec<f64> = v[i_r..i_f].iter().map(|x| (x - v_bas) / (v_haut - v_bas)).collect();
    let s_d: Vec<f64> = v[i_f..(i_f + n_long * pas_bit).min(v.len())].iter().map(|x| (v_haut - x) / (v_haut - v_bas)).collect();
    let n = s_r.len().min(s_d.len());
    let s: Vec<f64> = (0..n).map(|i| 0.5 * (s_r[i] + s_d[i])).collect();
    let asym = maxi((0..n).map(|i| (s_r[i] - s_d[i]).abs()));
    Ok(Fronts { s, v_haut, v_bas, asym, onde, dernier })
}

fn rep_imp(freqs: &[f64], s_f: &[Complex64], s_dc: f64, dt: f64, tr_lissage: f64) -> Res<Vec<f64>> {
    Ok(ibis::reponses_impulsionnelles(freqs, s_f, s_dc, dt, None, tr_lissage).map_err(ErreurOeil::ibis)?.0)
}

/// La liaison simulee dans le temps : ce que `oeil(non_lineaire=...)` lit.
///
/// Rend {s, dt, onde, t50, v_haut, v_bas, infos} : la reponse moyenne a un
/// echelon (normalisee de 0 a 1, au pas dt), une fonction qui rend la forme
/// d'onde periodique d'une sequence (au pas ui/64), l'instant de mi-front
/// du tampon, et les niveaux etablis a la broche du recepteur.
///
/// En differentiel, c'est le DEMI-CIRCUIT du mode impair (deux tampons
/// exactement opposes, mode commun fixe) : `simuler_paire` fait mieux des
/// que la cascade du mode commun est connue.
pub fn simuler_non_lineaire(ctx: &Ctx, freqs: &[f64], abcds: &[M2], p: &Params, r0: f64) -> Res<NonLineaire> {
    let ui = p.ui;
    let (dt, k) = _pas(freqs, ui);
    let diff = p.mode == "diff";
    let mut abcd = abcds.to_vec();
    let (mut r_l, mut c_l, mut r0) = (p.r_charge, p.c_charge, r0);
    if diff {
        // Le demi-circuit du mode impair : V/2, meme courant.
        for m in abcd.iter_mut() {
            m[0][1] /= 2.0;
            m[1][0] *= 2.0;
        }
        r_l /= 2.0;
        c_l *= 2.0;
        r0 /= 2.0;
    }
    let g_l = if 0.0 < r_l && r_l < 1e9 { 1.0 / r_l } else { 0.0 };
    // en differentiel, le demi-circuit porte la moitie de l'exces
    let mut r_ligne = r_continu(&abcd, p.exces_continu / if diff { 2.0 } else { 1.0 });
    if let (Some(ca), true) = (&p.couplage_ac, freqs.len() > 1) {
        // Le continu des condensateurs de liaison (voir l'en-tete) : le
        // canal est en ondes sur r0, la boucle se ferme sur 2 r0 ; en
        // differentiel le demi-circuit voit le condensateur d'UN brin.
        r_ligne += resistance_continu_ac(ca.c, 2.0 * r0 + r_ligne, 1.0 / (freqs[1] - freqs[0]));
    }
    let ch: Vec<M2> = abcd
        .iter()
        .zip(freqs)
        .map(|(m, f)| {
            let y_l = Complex64::new(g_l, 2.0 * PI * f * c_l);
            [[m[0][0] + m[0][1] * y_l, m[0][1]], [m[1][0] + m[1][1] * y_l, m[1][1]]]
        })
        .collect();
    let s_f = ibis::s_depuis_abcd(&ch, r0);
    let dc: [M2; 1] = [[[re(1.0 + r_ligne * g_l), re(r_ligne)], [re(g_l), UN]]];
    let s_dc = ibis::s_depuis_abcd(&dc, r0);
    let mut reps: Vec<Vec<f64>> = Vec::new();
    for i in 0..4 {
        reps.push(rep_imp(freqs, &s_f[i], s_dc[i][0].re, dt, ctx.tr_lissage)?);
    }
    let l = ibis::tronquer(&reps, 1e-7);
    for h in reps.iter_mut() {
        h.truncate(l.max(2));
    }
    let reps: [Vec<f64>; 4] = reps.try_into().expect("quatre reponses");

    let (em, cmd, t50);
    if let (Some(e), Some(m_em)) = (&ctx.em, &ctx.m_em) {
        cmd = ibis::commandes(m_em, e, dt).map_err(ErreurOeil::ibis)?;
        t50 = ibis::instant_mi_front(&cmd.montant, dt);
        em = e.clone();
    } else {
        // Seul le recepteur est IBIS : l'emetteur reste celui de Thevenin,
        // passe au pas de temps (demi-emetteur en differentiel).
        let (mut vh, mut vb, mut rs) = (p.v_haut, p.v_bas, p.r_source);
        if diff {
            (vh, vb, rs) = (vh / 2.0, vb / 2.0, rs / 2.0);
        }
        (em, cmd) = ibis::tampon_lineaire(rs, vh, vb, p.tr, dt, 0.0).map_err(ErreurOeil::ibis)?;
        t50 = 4.0 * p.tr / TR_SUR_SIGMA;
    }
    let mut v_ref = 0.0;
    if diff {
        if ctx.em.is_some() {
            v_ref = _mode_commun(&em, Some(r_l).filter(|r| *r > 0.0), 0.5 * (em.v_pu + em.v_pd));
        } else if let Some(rx) = &ctx.rx {
            v_ref = 0.5 * (rx.v_pc + rx.v_gc);
        }
    }
    let n_cmd = cmd.montant.0.len();
    let lia = Rc::new(Liaison::new(reps, r0, dt, em, cmd, ctx.rx.clone(), v_ref));
    let pas_bit = k * ECHANTILLONS_UI;

    let lia_c = lia.clone();
    let courir: Courir = Rc::new(move |bits: &[i32]| {
        let (_, mut v2) = lia_c.simuler(bits, pas_bit, ui);
        if diff {
            let inverses: Vec<i32> = bits.iter().map(|b| 1 - b).collect();
            let (_, v2n) = lia_c.simuler(&inverses, pas_bit, ui);
            for (a, b) in v2.iter_mut().zip(&v2n) {
                *a -= b;
            }
        }
        (v2, None)
    });

    let fo = _fronts_et_onde(courir, l, dt, k, n_cmd, ui, if diff { 2.0 } else { 1.0 }, false)?;
    let mut infos = ctx.infos.clone();
    maj(&mut infos, obj! {"pas_s" => dt, "pas_par_ui" => pas_bit, "r0" => r0,
                          "lissage_s" => ctx.tr_lissage, "longueur_reponse" => l,
                          "asymetrie" => fo.asym, "v_haut" => fo.v_haut,
                          "v_bas" => fo.v_bas,
                          "mode_commun" => if diff { Some(v_ref) } else { None }});
    Ok(NonLineaire {
        s: fo.s, dt, onde: fo.onde, t50, v_haut: fo.v_haut, v_bas: fo.v_bas, infos, x0: None,
        liaison: Some(lia), liaison_paire: None, dernier: fo.dernier, pas_bit, ami: None,
    })
}

/// (N, 4, 4) : les boitiers des deux broches (bt_p, bt_n), poses chacun
/// sur son brin -- et couples par les mutuelles de la paire s'il y en a
/// (`ibis.abcd_boitier_paire`), ou, avec des voisines couplees (`cpl`,
/// 2.4.0), le boitier couple a elles (`ibis.abcd_boitier_couple`) --
/// symetrise pour la reference symetrique : la moyenne de lui et de son
/// image, brins echanges.
fn _boitiers_brin(
    freqs: &[f64], bt: (Option<&Boitier>, Option<&Boitier>), mut_: Option<&Mutuelle>, sens: &str, cpl: Option<&Couple>, symetrique: bool,
) -> Res<Vec<M4>> {
    if let Some(cpl) = cpl.filter(|c| c.victimes == 2) {
        let mut m = ibis::en_m4(&ibis::abcd_boitier_couple(freqs, cpl, sens, cpl.r_voisin).map_err(ErreurOeil::ibis)?);
        if symetrique {
            let pm = [1, 0, 3, 2];
            for x in m.iter_mut() {
                let y = *x;
                for i in 0..4 {
                    for j in 0..4 {
                        x[i][j] = (y[i][j] + y[pm[i]][pm[j]]) * 0.5;
                    }
                }
            }
        }
        return Ok(m);
    }
    if mut_.is_some() {
        return Ok(ibis::abcd_boitier_paire(freqs, bt.0, bt.1, mut_, sens));
    }
    let (a, b) = (ibis::abcd_boitier(freqs, bt.0, sens), ibis::abcd_boitier(freqs, bt.1, sens));
    Ok(ibis::abcd_par_brin(a.as_deref(), b.as_deref(), freqs.len()))
}

/// La paire par brin (N, 4, 4) au continu, (1, 4, 4) : la resistance
/// serie de chaque brin, la partie reelle de B au premier point moins
/// `exces` (P, N), le surplus d'effet de peau du brin (`p["exces_brins"]`,
/// voir `r_continu`). Au continu, deux brins sur une masse ideale n'ont pas
/// de resistance mutuelle : le terme croise de Re(B), effet de peau des
/// modes, tombe.
fn _continu_brins(m: &[M4], exces: (f64, f64)) -> Vec<M4> {
    let mut m0 = [[ZERO; 4]; 4];
    for (i, l) in m0.iter_mut().enumerate() {
        l[i] = UN;
    }
    for (k, e) in [(0, exces.0), (1, exces.1)] {
        m0[k][2 + k] = re(maxf(&[0.0, m[0][k][2 + k].re - e]));
    }
    vec![m0]
}

/// Les condensateurs de liaison AU CONTINU de la paire par brin (1, 4, 4),
/// EN PLACE : la resistance `resistance_continu_ac` de la boucle de
/// decharge -- les deux brins en serie (C/2), fermes sur `r_bouts` (la
/// somme des resistances des deux bouts, R_s + R_L, ou 2 R0 pour un canal
/// en ondes) -- partagee entre les deux brins. Rien sans condensateur.
fn _continu_couplage_ac(m0: &mut [M4], ca: Option<&CouplageAc>, freqs: &[f64], r_bouts: f64) {
    let Some(ca) = ca.filter(|_| freqs.len() >= 2) else { return };
    let r_tot = (m0[0][0][2].re + m0[0][1][3].re) + r_bouts;
    let r_x = resistance_continu_ac(ca.c / 2.0, r_tot, 1.0 / (freqs[1] - freqs[0])) / 2.0;
    m0[0][0][2] += r_x;
    m0[0][1][3] += r_x;
}

/// LA CHARGE PAR BRIN (N, 2, 2) en admittance : la resistance
/// differentielle entre les deux brins, l'impedance de mode commun (prise
/// mediane) s'il y en a une, la capacite d'entree de chaque broche vers la
/// masse.
fn _charge_brins(ctx: Option<&Ctx>, p: &Params, w: &[f64], symetrique: bool) -> Vec<M2> {
    let r_l = p.r_charge;
    let yd = if 0.0 < r_l && r_l < 1e9 { 1.0 / r_l } else { 0.0 };
    let r_mc = ctx.map_or(0.0, |c| c.r_mc);
    let yc = if r_mc > 0.0 { 1.0 / r_mc } else { 0.0 };
    let (cp, mut cn) = ctx.and_then(|c| c.c_rx).unwrap_or((2.0 * p.c_charge, 2.0 * p.c_charge));
    if symetrique {
        cn = cp;
    }
    w.iter()
        .map(|w| {
            let croise = re(yc / 4.0 - yd);
            [[Complex64::new(yc / 4.0 + yd, w * cp), croise], [croise, Complex64::new(yc / 4.0 + yd, w * cn)]]
        })
        .collect()
}

/// Les boitiers des deux bouts, brin par brin, autour de la paire
/// (N, 4, 4) et de son continu (1, 4, 4) : (m, m0, compte). Celui de
/// l'emetteur ne se pose qu'avec un emetteur IBIS ; `avant_reception`
/// (N, 4, 4) s'insere juste avant celui du recepteur.
fn _poser_boitiers_brins(
    ctx: &Ctx, freqs: &[f64], m: Vec<M4>, m0: Vec<M4>, symetrique: bool, avant_reception: Option<&[M4]>,
) -> Res<(Vec<M4>, Vec<M4>, bool)> {
    let zero = [0.0];
    let (mut m, mut m0) = (m, m0);
    let paire = |bt: &'_ (Option<Boitier>, Option<Boitier>)| -> (Option<Boitier>, Option<Boitier>) {
        if symetrique { (bt.0.clone(), bt.0.clone()) } else { bt.clone() }
    };
    let (bt_e, bt_r) = (paire(&ctx.bt_em), paire(&ctx.bt_rx));
    let (mut_e, mut_r) = (ctx.mut_em.as_ref(), ctx.mut_rx.as_ref());
    let (cpl_e, cpl_r) = (ctx.cpl_em.as_ref(), ctx.cpl_rx.as_ref());
    let mut compte = false;
    if ctx.em.is_some() && (bt_e.0.is_some() || bt_e.1.is_some() || mut_e.is_some() || cpl_e.is_some()) {
        let bt = (bt_e.0.as_ref(), bt_e.1.as_ref());
        m = mul_n(&_boitiers_brin(freqs, bt, mut_e, "emission", cpl_e, symetrique)?, &m);
        m0 = mul_n(&_boitiers_brin(&zero, bt, mut_e, "emission", cpl_e, symetrique)?, &m0);
        compte = true;
    }
    if let Some(av) = avant_reception {
        m = mul_n(&m, av);
    }
    if bt_r.0.is_some() || bt_r.1.is_some() || mut_r.is_some() || cpl_r.is_some() {
        let bt = (bt_r.0.as_ref(), bt_r.1.as_ref());
        m = mul_n(&m, &_boitiers_brin(freqs, bt, mut_r, "reception", cpl_r, symetrique)?);
        m0 = mul_n(&m0, &_boitiers_brin(&zero, bt, mut_r, "reception", cpl_r, symetrique)?);
        compte = true;
    }
    Ok((m, m0, compte))
}

fn quart(m: &M4, r: usize, c: usize) -> M2 {
    std::array::from_fn(|i| std::array::from_fn(|j| m[2 * r + i][2 * c + j]))
}

/// La case du continu de l'IFFT d'une paire par brin, et son pole lent : ce que
/// `transfert_paire` range dans `continu`.
#[derive(Debug, Clone, Copy, Default, PartialEq)]
pub struct Continu {
    pub bin: f64,
    pub lent: Option<Lent>,
}

/// V_diff a la charge / V du generateur differentiel, a travers la paire
/// PAR BRIN (N, 4, 4) : (h, h0, note). C'est `transfert` pour une paire
/// dissymetrique, dont le mode impair ne reste pas impair.
///
/// Le generateur de Thevenin se partage en deux : +V/2 et -V/2, R_s/2 de
/// chaque cote ; la charge est celle de `_charge_brins`. Avec les blocs
/// [[A, B], [C, D]] et Y la charge, V1 = (A + B Y) V2, I1 = (C + D Y) V2 :
///     (A + B Y + Z_s (C + D Y)) V2 = E,  H = V2p - V2n.
/// Les boitiers IBIS s'y posent brin par brin, mutuelles de la paire
/// comprises. Pour une paire symetrique, c'est `transfert` sur le mode
/// impair, exactement.
///
/// `continu` : un dictionnaire, s'il est donne, recoit `bin` -- la case du
/// continu de l'IFFT -- et, quand la paire porte des condensateurs de
/// liaison qu'une terminaison decharge, `lent` {h0, tau} : leur pole lent,
/// la boucle R_s + R_L et les deux brins en serie (C/2), que
/// `reponse_indicielle_ac` compte exactement. Sans terminaison, rien ne
/// decharge : la case est le pont diviseur C_x / (C_x + C_L), comme en
/// simple.
pub fn transfert_paire(
    ctx: Option<&Ctx>, freqs: &[f64], m_brins: &[M4], p: &Params, continu: Option<&mut Continu>,
) -> Res<(Vec<Complex64>, f64, String)> {
    let mut m = m_brins.to_vec();
    if m.is_empty() {
        return Err(ErreurOeil::plantage("IndexError", "index 0 is out of bounds"));
    }
    let mut m0 = _continu_brins(&m, p.exces_brins);
    let mut compte = false;
    if let Some(ctx) = ctx {
        (m, m0, compte) = _poser_boitiers_brins(ctx, freqs, m, m0, false, None)?;
    }
    let zs = 0.5 * p.r_source;
    let singuliere = || ErreurOeil::plantage("LinAlgError", "Singular matrix");
    let h_de = |mm: &[M4], w: &[f64]| -> Res<Vec<Complex64>> {
        let y = _charge_brins(ctx, p, w, false);
        mm.iter()
            .zip(&y)
            .map(|(mm, y)| {
                let (a, b, c, d) = (quart(mm, 0, 0), quart(mm, 0, 1), quart(mm, 1, 0), quart(mm, 1, 1));
                let (by, dy) = (mul(&b, y), mul(&d, y));
                let k: M2 = std::array::from_fn(|i| std::array::from_fn(|j| a[i][j] + by[i][j] + (c[i][j] + dy[i][j]) * zs));
                // np.linalg.solve(k, e), e = (0,5 ; -0,5) : pivot partiel, comme LAPACK
                let e = [re(0.5), re(-0.5)];
                let cabs1 = |z: Complex64| z.re.abs() + z.im.abs();
                let (i0, i1) = if cabs1(k[1][0]) > cabs1(k[0][0]) { (1, 0) } else { (0, 1) };
                if cabs1(k[i0][0]) == 0.0 {
                    return Err(singuliere());
                }
                let l = k[i1][0] * (UN / k[i0][0]);
                let u11 = k[i1][1] - l * k[i0][1];
                if cabs1(u11) == 0.0 {
                    return Err(singuliere());
                }
                let x1 = (e[i1] - l * e[i0]) / u11;
                let x0 = (e[i0] - k[i0][1] * x1) / k[i0][0];
                Ok(x0 - x1)
            })
            .collect()
    };
    let w: Vec<f64> = freqs.iter().map(|f| 2.0 * PI * f).collect();
    let h = h_de(&m, &w)?;
    let h0 = h_de(&m0, &[0.0])?[0].re;
    if let Some(continu) = continu {
        continu.bin = h0;
        if let Some(ca) = &p.couplage_ac {
            if 0.0 < p.r_charge && p.r_charge < 1e9 {
                let r_tot = (m0[0][0][2].re + m0[0][1][3].re) + p.r_source + p.r_charge;
                continu.lent = Some(Lent { h0, tau: 0.5 * ca.c * r_tot });
            } else if p.c_charge > 0.0 {
                continu.bin = h0 * ca.c_x / (ca.c_x + p.c_charge);
            }
        }
    }
    Ok((h, h0, if compte { "boîtiers comptés brin par brin" } else { "" }.to_string()))
}

/// La surlongueur d'un brin : {retard, z0, mm}.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Surlongueur {
    pub retard: f64,
    pub z0: f64,
    pub mm: f64,
}

/// Les 4 x 4 reponses impulsionnelles de la paire PAR BRIN, boitiers,
/// surlongueur et charge comprises, et leur longueur utile.
///
/// `m_brins` (N, 4, 4) : la paire par brin de la cascade a quatre acces de
/// `simulation_em` -- dissymetries et surlongueur comprises ; sinon, la
/// paire symetrique remise par brin depuis ses deux modes.
#[allow(clippy::too_many_arguments)]
fn _canal_paire(
    ctx: &Ctx, freqs: &[f64], abcd_dd: &[M2], abcd_cc: &[M2], p: &Params, r0: f64, dt: f64, symetrique: bool,
    surlongueur: Option<Surlongueur>, m_brins: Option<&[M4]>,
) -> Res<([[Vec<f64>; 4]; 4], usize)> {
    let n = freqs.len();
    let zero = [0.0];
    let (m, m0);
    let mut surlongueur = surlongueur;
    if let Some(mb) = m_brins.filter(|_| !symetrique) {
        if mb.is_empty() {
            return Err(ErreurOeil::plantage("IndexError", "index 0 is out of bounds"));
        }
        m = mb.to_vec();
        m0 = _continu_brins(&m, p.exces_brins);
        surlongueur = None;
    } else {
        m = ibis::abcd_brins(abcd_dd, abcd_cc);
        let fil = |r: f64| -> [M2; 1] { [[[UN, re(r)], [ZERO, UN]]] };
        m0 = ibis::abcd_brins(&fil(r_continu(abcd_dd, p.exces_continu)), &fil(r_continu(abcd_cc, p.exces_continu_cc)));
    }
    let mut lg = None;
    if let Some(sl) = surlongueur.filter(|_| !symetrique) {
        // La surlongueur d'un brin : une ligne seule, sur le brin n.
        lg = Some(ibis::abcd_par_brin(None, Some(&ligne_ideale(freqs, sl.z0, sl.retard, 0.0)), n));
    }
    let (m, mut m0, _) = _poser_boitiers_brins(ctx, freqs, m, m0, symetrique, lg.as_deref())?;
    // Le continu des condensateurs de liaison, le canal etant en ondes sur
    // R0 par brin : la boucle se ferme sur 2 R0.
    _continu_couplage_ac(&mut m0, p.couplage_ac.as_ref(), freqs, 2.0 * r0);
    let w: Vec<f64> = freqs.iter().map(|f| 2.0 * PI * f).collect();
    let s = ibis::s_depuis_abcd_4(&ibis::charger_brins(&m, &_charge_brins(Some(ctx), p, &w, symetrique)), r0).map_err(ErreurOeil::ibis)?;
    let s0 = ibis::s_depuis_abcd_4(&ibis::charger_brins(&m0, &_charge_brins(Some(ctx), p, &zero, symetrique)), r0).map_err(ErreurOeil::ibis)?;
    let mut reps: Vec<Vec<f64>> = Vec::with_capacity(16);
    for i in 0..4 {
        for j in 0..4 {
            let s_f: Vec<Complex64> = s.iter().map(|x| x[i][j]).collect();
            reps.push(rep_imp(freqs, &s_f, s0[0][i][j].re, dt, ctx.tr_lissage)?);
        }
    }
    let l = ibis::tronquer(&reps, 1e-7);
    let mut it = reps.into_iter().map(|mut h| {
        h.truncate(l.max(2));
        h
    });
    let reps: [[Vec<f64>; 4]; 4] = std::array::from_fn(|_| std::array::from_fn(|_| it.next().expect("seize reponses")));
    Ok((reps, l))
}

/// La paire simulee dans le temps, brin par brin : ce que
/// `oeil(non_lineaire=...)` lit, plus les tensions des deux brins.
///
/// `r0_diff` : la reference differentielle (R0 = r0_diff / 2 par brin).
/// `symetrique` : la MEME paire, mais les deux brins pareils (ceux du brin
/// p, sans decalage ni surlongueur) -- la reference a laquelle on compare
/// la vraie. `surlongueur` {retard, z0} : un brin plus long que l'autre.
/// `m_brins` : la paire dissymetrique par brin (cascade a quatre acces) ;
/// la reference symetrique reste alors celle de `abcd_dd` et `abcd_cc`.
#[allow(clippy::too_many_arguments)]
pub fn simuler_paire(
    ctx: &Ctx, freqs: &[f64], abcd_dd: &[M2], abcd_cc: &[M2], p: &Params, r0_diff: f64, surlongueur: Option<Surlongueur>,
    symetrique: bool, seulement_onde: bool, m_brins: Option<&[M4]>,
) -> Res<NonLineaire> {
    let ui = p.ui;
    let (dt, k) = _pas(freqs, ui);
    let r0 = r0_diff / 2.0;
    let (reps, l) = _canal_paire(ctx, freqs, abcd_dd, abcd_cc, p, r0, dt, symetrique, surlongueur, m_brins)?;
    let (em, em_n, cmd, cmd_n);
    let mut t50;
    if let (Some(e), Some(m_em)) = (&ctx.em, &ctx.m_em) {
        cmd = ibis::commandes(m_em, e, dt).map_err(ErreurOeil::ibis)?;
        em = e.clone();
        match (&ctx.em_n, &ctx.m_em_n) {
            (Some(e_n), Some(m_n)) if !(symetrique || (meme_modele(ctx) && e_n.coin == e.coin)) => {
                cmd_n = ibis::commandes(m_n, e_n, dt).map_err(ErreurOeil::ibis)?;
                em_n = e_n.clone();
            }
            _ => (em_n, cmd_n) = (em.clone(), cmd.clone()),
        }
        t50 = ibis::instant_mi_front(&cmd.montant, dt);
    } else {
        // L'emetteur de Thevenin, partage en deux brins : la moitie de la
        // tension a vide et de la resistance de chaque cote.
        (em, cmd) = ibis::tampon_lineaire(p.r_source / 2.0, p.v_haut / 2.0, p.v_bas / 2.0, p.tr, dt, 0.0).map_err(ErreurOeil::ibis)?;
        (em_n, cmd_n) = (em.clone(), cmd.clone());
        t50 = 4.0 * p.tr / TR_SUR_SIGMA;
    }
    let dec = if symetrique { 0.0 } else { ctx.decalage };
    let rx = [ctx.rx.clone(), if symetrique { ctx.rx.clone() } else { ctx.rx_n.clone() }];
    let n_cmd = cmd.montant.0.len().max(cmd_n.montant.0.len());
    let lia = Rc::new(
        LiaisonPaire::new(reps, r0, dt, [em, em_n], [cmd, cmd_n], rx, if dec >= 0.0 { [0.0, dec] } else { [-dec, 0.0] })
            .map_err(ErreurOeil::ibis)?,
    );
    let pas_bit = k * ECHANTILLONS_UI;
    // Le croisement differentiel tombe au milieu des deux fronts.
    t50 += 0.5 * dec.abs();

    let lia_c = lia.clone();
    let courir: Courir = Rc::new(move |bits: &[i32]| {
        let v = lia_c.simuler(bits, pas_bit, ui);
        (v[2].iter().zip(&v[3]).map(|(a, b)| a - b).collect(), Some(v))
    });
    let fo = _fronts_et_onde(courir, l, dt, k, n_cmd, ui, 2.0, seulement_onde)?;
    let mut infos = ctx.infos.clone();
    if !seulement_onde {
        maj(&mut infos, obj! {"pas_s" => dt, "pas_par_ui" => pas_bit, "r0" => r0,
                              "lissage_s" => ctx.tr_lissage, "longueur_reponse" => l,
                              "asymetrie" => fo.asym, "v_haut" => fo.v_haut,
                              "v_bas" => fo.v_bas, "deux_brins" => true,
                              "decalage_s" => dec,
                              "r_charge_mc" => Some(ctx.r_mc).filter(|r| *r != 0.0)});
    }
    Ok(NonLineaire {
        s: fo.s, dt, onde: fo.onde, t50, v_haut: fo.v_haut, v_bas: fo.v_bas, infos, x0: None,
        liaison: None, liaison_paire: Some(lia), dernier: fo.dernier, pas_bit, ami: None,
    })
}

/// La hauteur d'oeil d'une forme d'onde periodique BRUTE (sans
/// egaliseur), a la meilleure phase -- latence comprise : min des 1 moins
/// max des 0. C'est la mesure commune de la paire reelle et de sa
/// reference symetrique.
///
/// LA LATENCE, en bits, se lit a l'intercorrelation de la forme d'onde
/// (moyennee sur l'UI) avec la sequence ; on cherche ensuite la phase sur
/// ce rang et ses deux voisins -- sans tableau de per x per x spu.
pub fn hauteur_onde(y: &[f64], bits: &[i32], spu: usize) -> Res<f64> {
    let per = bits.len();
    if y.len() < per * spu || per == 0 {
        return Err(ErreurOeil::plantage("ValueError", "cannot reshape array"));
    }
    let moy: Vec<f64> = (0..per).map(|i| moyenne(&y[i * spu..(i + 1) * spu])).collect();
    let a: Vec<f64> = bits.iter().map(|b| if *b != 0 { 1.0 } else { -1.0 }).collect();
    let x: Vec<Complex64> = rfft(&moy).iter().zip(rfft(&a)).map(|(u, v)| u * v.conj()).collect();
    let c = irfft(&x, per);
    let k0 = argmax(&c) as i64;
    let mut meilleur = f64::NEG_INFINITY;
    for k in [k0 - 1, k0, k0 + 1] {
        let mut h_max = f64::NEG_INFINITY;
        for j in 0..spu {
            let (mut mn, mut mx) = (f64::INFINITY, f64::NEG_INFINITY);
            for i in 0..per {
                let v = y[modulo(i as i64 + k, per as i64) * spu + j];
                if bits[i] != 0 {
                    mn = mn.min(v);
                } else {
                    mx = mx.max(v);
                }
            }
            h_max = h_max.max(mn - mx);
        }
        meilleur = maxf(&[meilleur, h_max]);
    }
    Ok(meilleur)
}

/// Le mode commun de la paire, d'apres la derniere forme d'onde PRBS
/// simulee : {continu, crete_crete, crete, rms, conversion_db, emetteur,
/// courbe, hauteur_brute, hauteur_symetrique}.
pub fn mode_commun(nl: &NonLineaire, nl_ref: Option<&mut NonLineaire>) -> Res<Option<Json>> {
    let d = nl.dernier.borrow();
    let Some(d) = d.as_ref() else { return Ok(None) };
    let v = &d.brins;
    let n = v[2].len();
    let vc: Vec<f64> = (0..n).map(|i| 0.5 * (v[2][i] + v[3][i])).collect();
    let vd: Vec<f64> = (0..n).map(|i| v[2][i] - v[3][i]).collect();
    let ve: Vec<f64> = (0..n).map(|i| 0.5 * (v[0][i] + v[1][i])).collect();
    let etendue = |x: &[f64]| maxi(x.iter().copied()) - mini(x.iter().copied());
    let moy = moyenne(&vc);
    let cc = etendue(&vc);
    let dpp = etendue(&vd);
    let spu = ECHANTILLONS_UI;
    let pas = spu / PAS_MODE_COMMUN;
    let nb_ = d.bits.len().min(BITS_MODE_COMMUN);
    let courbe = |x: &[f64]| -> Vec<f64> { x[..(nb_ * spu).min(x.len())].iter().step_by(pas).map(|x| round(*x, 6)).collect() };
    let mut sortie = obj! {
        "continu" => moy, "crete_crete" => cc,
        "crete" => maxi(vc.iter().map(|x| (x - moy).abs())),
        "rms" => ecart_type(&vc),
        "conversion_db" => if cc > 0.0 && dpp > 0.0 { Some(20.0 * (cc / dpp).log10()) } else { None },
        "emetteur" => obj! {"continu" => moyenne(&ve),
                            "crete_crete" => etendue(&ve)},
        "courbe" => obj! {"dt_ui" => 1.0 / PAS_MODE_COMMUN as f64,
                          "v" => courbe(&vc),
                          "v_diff" => courbe(&vd)},
        "hauteur_brute" => hauteur_onde(&vd, &d.bits, spu)?,
    };
    if let Some(r) = nl_ref {
        let y = (r.onde)(&d.bits)?;
        poser(&mut sortie, "hauteur_symetrique", hauteur_onde(&y, &d.bits, spu)?);
    }
    Ok(Some(sortie))
}
