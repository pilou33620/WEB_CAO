//! Le point d'entree de la route.

use std::collections::BTreeMap;
use std::time::Instant;

use em::crosstalk;
use em::obj;
use em::simulation_em as se;
use em::simulation_em::base::*;

use crate::ami::{executer_ami, preparer_ami, ChargeurAmi, Fabricant};
use crate::briques::*;
use crate::gabarits::gabarit;
use crate::nl::*;
use crate::params::_params;
use crate::trace::{oeil, Canal};
use crate::{ErreurOeil, Params, Res, C_0, FORMAT_RESULTAT, MAX_FREQS, VERSION, M2, M4};

fn _longueur_mm(doc: &Json) -> f64 {
    let mut total = 0.0;
    for o in els(&doc["geometry"]["objects"]) {
        let mut lg = _nombre(&o["length"], 0.0);
        if lg <= 0.0 {
            let pt = |cle: &str, i: usize| if o[cle].vrai() { nb(&o[cle][i]) } else { 0.0 };
            lg = py::hypot(pt("end", 0) - pt("start", 0), pt("end", 1) - pt("start", 1));
        }
        total += lg;
    }
    total
}

fn _er_max(doc: &Json) -> f64 {
    let er: Vec<f64> = els(&doc["stackup"]["layers"])
        .iter()
        .filter(|c| c["type"].as_str() != Some("copper"))
        .map(|c| _nombre(&c["epsilon_r"], 0.0))
        .filter(|e| *e > 0.0)
        .collect();
    if er.is_empty() { 4.5 } else { maxf(&er) }
}

/// Les agresseurs bornes tires du couplage de `simulation_em`.
///
/// LE MEME CHIFFRE QUE L'ONGLET CROSSTALK. Chaque longement de la fiche de
/// couplage porte les modes pair et impair de la paire (victime, voisine) ;
/// on en tire Kb et Kf -- les memes que `crosstalk.coefficients_couple` --,
/// et le niveau 2 de `crosstalk.niveau2` rend le NEXT et le FEXT en
/// fraction de l'agresseur, sature ou non selon le front. Les morceaux d'une
/// meme voisine s'ajoutent, comme la-bas.
///
/// LE SENS. Une voisine qui emet dans le MEME sens que la victime lui
/// envoie son FEXT au recepteur ; en sens OPPOSE, c'est son NEXT. Sans le
/// savoir, on prend le plus grand des deux.
///
/// En differentiel, la partenaire n'est pas un agresseur, et le bruit pris
/// par UNE piste majore celui de la paire : l'autre piste en prend presque
/// autant, du meme signe, et le recepteur differentiel le retranche.
/// Rend (agresseurs, notes).
pub fn agresseurs_du_couplage(couplage: &Json, p: &Params, o: &Json, partenaire: Option<&str>, excursion: Option<f64>) -> (Vec<Json>, Vec<String>) {
    let mut notes = Vec::new();
    let sens = if o["agresseurs_sens"].vrai() { str_py(&o["agresseurs_sens"]) } else { "inconnu".to_string() };
    let ou_ = |a: f64, b: f64| if a != 0.0 { a } else { b };
    let tr_a = ou_(_nombre(&o["agresseurs_tr"], 0.0), p.tr);
    let mut v_a = ou_(_nombre(&o["agresseurs_v"], 0.0), excursion.unwrap_or(0.0));
    if !(v_a > 0.0) {
        // L'EXCURSION DE LA VICTIME A SA CHARGE, faute de mieux : une voisine
        // de la meme famille logique bascule autant qu'elle.
        let k = if 0.0 < p.r_charge && p.r_charge < 1e9 { p.r_charge / (p.r_charge + p.r_source) } else { 1.0 };
        v_a = (p.v_haut - p.v_bas) * k;
    }
    let mut morceaux: BTreeMap<String, Vec<crosstalk::Morceau>> = BTreeMap::new();
    for f in els(&couplage["paires"]) {
        let voisin = str_ou_vide(&f["net_voisin"]);
        if voisin.is_empty() || partenaire.is_some_and(|x| !x.is_empty() && voisin == x) {
            continue;
        }
        // float(f["z_impair"])... : KeyError, TypeError et ValueError passent au longement suivant
        let fl = |cle: &str| f.get(cle).and_then(|v| dc_solver::pyth::float_py(v).ok());
        let (Some(zo), Some(ze), Some(eo), Some(ee)) = (fl("z_impair"), fl("z_pair"), fl("eps_eff_impair"), fl("eps_eff_pair")) else { continue };
        let lg = if f["longueur"].vrai() {
            match dc_solver::pyth::float_py(&f["longueur"]) {
                Ok(x) => x,
                Err(_) => continue,
            }
        } else {
            0.0
        };
        if !(zo > 0.0 && ze > 0.0 && eo > 0.0 && ee > 0.0 && lg > 0.0) {
            continue;
        }
        let (c_o, c_e) = (eo.sqrt() / (C_0 * zo), ee.sqrt() / (C_0 * ze));
        let (l_o, l_e) = (zo * eo.sqrt() / C_0, ze * ee.sqrt() / C_0);
        let k_c = (c_o - c_e) / (c_o + c_e);
        let k_l = (l_e - l_o) / (l_e + l_o);
        let td = lg * 1e-3 * (0.5 * (eo + ee)).sqrt() / C_0;
        morceaux.entry(voisin).or_default().push((0.25 * (k_c + k_l), 0.5 * (k_l - k_c), td, 1.0));
    }
    let mut sortie = Vec::new();
    for (voisin, m) in &morceaux {
        let n2 = crosstalk::niveau2(m, tr_a, crosstalk::SEUIL_ORANGE, crosstalk::SEUIL_ROUGE, 1.0);
        let (nxt, fxt) = (nb(&n2["next"]).abs(), nb(&n2["fext"]).abs());
        let coef = match sens.as_str() {
            "meme" => fxt,
            "oppose" => nxt,
            _ => maxf(&[nxt, fxt]),
        };
        if coef <= 0.0 {
            continue;
        }
        sortie.push(obj! {"nom" => voisin, "coef" => coef, "v" => v_a,
                          "crete_v" => coef * v_a, "next" => nxt, "fext" => fxt,
                          "sens" => &sens, "source" => "couplage"});
    }
    if !sortie.is_empty() {
        notes.push(format!(
            "Diaphonie : {} voisine(s) reprise(s) du couplage (NEXT/FEXT du niveau 2 de l'onglet Crosstalk, front {} ps, \
             excursion {} V {}){}.",
            sortie.len(), fmt_g(tr_a * 1e12, 3), fmt_g(v_a, 3),
            if _nombre(&o["agresseurs_v"], 0.0) > 0.0 { "saisie" } else { "supposée égale à celle de la victime" },
            if partenaire.is_some_and(|x| !x.is_empty()) { " ; en différentiel, le bruit d'une piste majore celui de la paire" } else { "" }));
    } else {
        notes.push("Diaphonie demandée, mais aucune voisine ne longe la sélection sur la même couche : rien n'est ajouté.".into());
    }
    (sortie, notes)
}

// float(x or defaut)
fn fl_ou(x: &Json, defaut: f64) -> f64 {
    if x.vrai() { nb(x) } else { defaut }
}

/// La resistance de reference des ondes : Z0 de la ligne (Z differentielle
/// en differentiel, le demi-circuit la divise). Elle ne change pas le
/// resultat, seulement la longueur des reponses impulsionnelles.
fn _r_reference(res: &Json, p: &Params) -> f64 {
    if p.mode == "diff" {
        for f in els(&res["couplage"]["paires"]) {
            if f["differentielle"].vrai() && f["z_diff"].vrai() {
                return nb(&f["z_diff"]);
            }
        }
        return fl_ou(&res["s_diff"]["z_ref_diff"], 100.0);
    }
    fl_ou(&res["ligne"]["z0_moyen"], 50.0)
}

/// LA SENSIBILITE DU RECEPTEUR DIFFERENTIEL -- vdiff de [Diff Pin], ou
/// Rx_Receiver_Sensitivity d'un .ami -- contre l'oeil : il faut |V| >= vdiff
/// a l'echantillonnage, soit une demi-hauteur au moins egale.
pub fn _seuil_vdiff(r: &mut Json, ctx: Option<&Ctx>) {
    let Some(v) = ctx.and_then(|c| c.vdiff).filter(|v| *v != 0.0) else { return };
    if r["mode"].as_str() != Some("diff") {
        return;
    }
    let (h_prbs, h_pire) = (nb(&r["mesures"]["hauteur_prbs"]), nb(&r["mesures"]["hauteur_pire"]));
    let (m_prbs, m_pire) = (0.5 * h_prbs - v, 0.5 * h_pire - v);
    let m = dans(r, "mesures");
    poser(m, "vdiff", v);
    poser(m, "marge_vdiff_prbs", m_prbs);
    poser(m, "marge_vdiff_pire", m_pire);
    if m_pire < 0.0 {
        ajouter(dans(r, "avertissements"), format!(
            "Seuil du récepteur ±{} mV : l'œil pire cas {}.",
            fmt_g(v * 1e3, 3), if m_prbs < 0.0 { "n'y arrive pas" } else { "n'y arrive pas, l'œil PRBS si" }));
    }
}

/// Document de simulation + reglages de l'oeil -> l'oeil. Leve ErreurOeil.
///
/// `racines_ami` : les dossiers sous lesquels une bibliotheque AMI designee
/// par la requete peut etre chargee (la LIB, les racines de projets) ;
/// aucun, et rien ne s'execute.
pub fn analyser(doc: &Json, journal: Option<&mut dyn FnMut(&str)>, racines_ami: Option<&[&str]>) -> Res<Json> {
    analyser_avec(doc, journal, racines_ami, &Fabricant)
}

/// `analyser`, les modeles AMI venant de `chargeur` (le banc y met un faux).
pub fn analyser_avec(doc: &Json, journal: Option<&mut dyn FnMut(&str)>, racines_ami: Option<&[&str]>, chargeur: &dyn ChargeurAmi) -> Res<Json> {
    if doc.as_objet().is_none() {
        return Err(ErreurOeil::new("Le document envoyé n'est pas un objet JSON.", ""));
    }
    let vide = obj! {};
    let o = if doc["oeil"].vrai() { &doc["oeil"] } else { &vide };
    if o.as_objet().is_none() {
        return Err(ErreurOeil::new("Réglages de l'œil illisibles.", ""));
    }
    let debut = Instant::now();
    let gid = if o["gabarit"].vrai() { str_py(&o["gabarit"]) } else { String::new() };
    let gab = gabarit(&gid);
    if !gid.is_empty() && gab.is_none() {
        return Err(ErreurOeil::new(format!("Gabarit « {gid} » inconnu."), "Rechargez la page : la liste vient du serveur."));
    }
    let mut p = _params(o, gab)?;
    let mut ctx = preparer_ibis(o, &mut p)?;
    // L'AMI apres l'IBIS : il peut regler l'egaliseur que l'IBIS a remis a
    // zero, et AVANT la grille, qui depend du CTLE.
    let mut ami = preparer_ami(o, &mut p, ctx.as_mut())?;
    let ctx = ctx;
    let temporel = ctx.as_ref().is_some_and(|c| c.temporel);
    if temporel && p.motif == "prbs15" {
        return Err(ErreurOeil::new(
            "PRBS15 et modèle IBIS : 32 767 bits à simuler pas à pas, c'est trop long.",
            "Prenez PRBS7 ou PRBS9 : le pire cas et l'œil statistique couvrent les longues suites.",
        ));
    }

    let mut tau = 0.0;
    if let Some(ctl) = p.ctle.as_ref().filter(|c| c.vrai()) {
        let fp1 = nb(&ctl["fp1"]);
        let f_bas = minf(&[if ctl["fz"].vrai() { nb(&ctl["fz"]) } else { fp1 }, fp1]);
        tau = 8.0 / (2.0 * std::f64::consts::PI * f_bas);
    }
    tau += 10.0 * (p.r_source + 100.0) * p.c_charge;
    // LES CONDENSATEURS DE LIAISON : la fenetre doit couvrir leur decharge
    // (trois tau de part et d'autre, six en tout) pour que le continu de
    // l'IFFT soit vrai sans artifice ; au-dela du plafond de la grille, le
    // continu est corrige (`resistance_continu_ac`) et le resultat le dit.
    let ca = p.couplage_ac.clone();
    if let Some(t) = ca.as_ref().and_then(CouplageAc::tau_vrai) {
        tau += 3.0 * t;
    }
    let retard_est = _longueur_mm(doc) * 1e-3 * _er_max(doc).sqrt() / C_0;
    // AVEC UN TAMPON IBIS, le haut de la grille suit le LISSAGE du canal --
    // la moitie du front du tampon --, pas le front lui-meme : voir `ibis`.
    let tr_grille = match &ctx {
        Some(c) if temporel => c.tr_lissage,
        _ => p.tr,
    };
    if temporel {
        tau += 4.0 * p.tr;
    }
    let (df, n, fenetre, pleine) = grille(p.debit, tr_grille, retard_est, tau);
    let freqs = frequences(df, n);

    let mut d2 = doc.clone();
    let mut a = if d2["analyse"].vrai() { d2["analyse"].clone() } else { obj! {} };
    if a.as_objet().is_none() {
        return Err(ErreurOeil::plantage("ValueError", "dictionary update sequence element"));
    }
    let fc = minf(&[maxf(&[p.debit / 2.0, freqs[0]]), freqs[n - 1]]);
    maj(&mut a, obj! {"f_debut" => freqs[0], "f_fin" => freqs[n - 1],
                      "points" => 2i64, "f_centre" => fc});
    if !a["temps_montee"].vrai() {
        poser(&mut a, "temps_montee", p.tr);
    }
    poser(&mut d2, "analyse", a);
    // PAS DE « mode_diff » FORCE : sans seconde piste, la cascade
    // differentielle inventerait une paire decouplee a 2 Z0. L'oeil exige la
    // vraie, trouvee par le couplage ou declaree dans `paires`.
    oter(&mut d2, "mode_diff");
    let res = se::simuler(&mut d2, None, true, Some(&freqs)).map_err(|exc| ErreurOeil { message: exc.message, conseil: exc.conseil, interne: exc.interne })?;
    let rj = &res.json;
    if rj["cascade_refusee"].vrai() {
        return Err(ErreurOeil::new(
            str_py(&rj["cascade_refusee"]),
            "L'œil demande une liaison d'un bout à l'autre : sélectionnez un seul parcours, sans dérivation.",
        ));
    }
    let mut av: Vec<String> = Vec::new();
    let mut m_brins: Option<Vec<M4>> = None;
    let sd = &rj["s_diff"];
    let diff = p.mode == "diff";
    let mut abcds: Vec<M2>;
    if diff {
        abcds = res.abcd_dd.clone();
        if abcds.is_empty() || !sd["partenaire"].vrai() {
            return Err(ErreurOeil::new(
                "Aucune paire différentielle trouvée pour la sélection.",
                "Sélectionnez les deux pistes de la paire, ou nommez la Piste 2.",
            ));
        }
        let (nv, nc) = (ent(ou(&sd["vias"], &Json::Entier(0)), 0), ent(ou(&sd["coudes"], &Json::Entier(0)), 0));
        if sd["quatre_acces"].vrai() && !res.abcd_brins.is_empty() {
            // LA PAIRE DISSYMETRIQUE, BRIN PAR BRIN (2.2.0) : la cascade a
            // quatre acces de `simulation_em`, conversions de mode comprises.
            m_brins = Some(res.abcd_brins.clone());
            let dis: Vec<String> = if sd["dissymetries"].vrai() { els(&sd["dissymetries"]).iter().map(str_py).collect() } else { vec!["forcée".into()] };
            av.push(format!(
                "Différentiel : paire dissymétrique ({}) — cascade à quatre accès, brin par brin : chaque brin a sa \
                 section, ses vias et ses coudes, et l'œil lit la tension différentielle au récepteur, conversions de \
                 mode comprises.",
                dis.join("; ")));
        } else {
            av.push(format!(
                "Différentiel : la cascade du mode impair porte les tronçons de la paire{}.",
                if nv != 0 || nc != 0 {
                    format!(", ses {nv} via(s) et {nc} coude(s), posés à l'identique sur les deux brins, mutuelle des fûts comprise")
                } else {
                    " ; elle n'a ni via ni coude".to_string()
                }));
        }
    } else {
        abcds = res.abcd.clone();
        if abcds.is_empty() {
            return Err(ErreurOeil::new("La liaison n'a pas pu être mise en cascade.", ""));
        }
    }
    if !pleine {
        av.push(format!(
            "Grille de fréquences plafonnée à {} points : la fenêtre de calcul est raccourcie à {} ns.",
            MAX_FREQS, fmt_g(fenetre * 1e9, 3)));
    }
    // -- les deux brins de la paire, ou le canal seul avec ses boitiers --
    let (mut abcd_cc, mut surlong): (Option<Vec<M2>>, Option<Surlongueur>) = (None, None);
    let dl = fl_ou(&sd["delta_l_mm"], 0.0);
    let eps_seg = || {
        let seg0 = if rj["segments"].vrai() { rj["segments"][0].clone() } else { obj! {} };
        match seg0.get("eps_eff") {
            Some(e) => fl_ou(e, 4.0),
            None => 4.0,
        }
    };
    if m_brins.is_some() && dl > 0.0 && sd["brin_long"].vrai() {
        let eps = eps_seg();
        av.push(format!(
            "Les deux brins diffèrent de {} mm : le brin {} est le plus long, et sa surlongueur ({} ps) est posée sur lui, \
             côté récepteur, dans la cascade à quatre accès.",
            fmt_g(dl, 3), str_py(&sd["brin_long"]), fmt_g(dl * 1e-3 * maxf(&[eps, 1.0]).sqrt() / C_0 * 1e12, 3)));
    }
    if ctx.as_ref().is_some_and(|c| c.paire) {
        if m_brins.is_some() && !res.abcd_cc.is_empty() {
            // La reference symetrique : la paire symetrisee, ses deux modes.
            abcd_cc = Some(res.abcd_cc.clone());
        } else if sd["s_cc"].vrai() && els(&sd["s_cc"]).len() == freqs.len() {
            let z = if sd["z_ref_comm"].vrai() { nb(&sd["z_ref_comm"]) } else { 0.25 * fl_ou(&sd["z_ref_diff"], 100.0) };
            abcd_cc = abcd_depuis_s(&sd["s_cc"], z);
        }
        if abcd_cc.is_some() && dl > 0.0 && m_brins.is_none() {
            let eps = eps_seg();
            let sl = Surlongueur { retard: dl * 1e-3 * maxf(&[eps, 1.0]).sqrt() / C_0, z0: fl_ou(&rj["ligne"]["z0_moyen"], 50.0), mm: dl };
            av.push(format!(
                "Les deux brins diffèrent de {} mm : la surlongueur ({} ps) est posée sur le brin inverse, comme une \
                 ligne seule — la cascade de la paire ne dit pas lequel est le plus long.",
                fmt_g(dl, 3), fmt_g(sl.retard * 1e12, 3)));
            surlong = Some(sl);
        }
        if abcd_cc.is_none() {
            av.push("Cascade du mode commun indisponible : la paire est simulée en demi-circuit du mode impair, le mode \
                     commun tenu fixe — décalage et dissymétries des deux brins ne sont pas suivis.".into());
        }
    }
    // -- le continu vrai de la ligne (`r_continu`) --------------------------
    // Le surplus d'effet de peau que la ligne porte deja au premier point,
    // par mode : le differentiel voit deux brins en serie, le commun deux en
    // parallele ; la paire par brin, celui de chaque brin (`_continu_brins`).
    if let (Some(mb), false) = (&m_brins, nul(&sd["r_continu_brins"])) {
        let r = &sd["r_continu_brins"];
        p.exces_brins = (mb[0][0][2].re - nb(&r[0]), mb[0][1][3].re - nb(&r[1]));
    }
    if m_brins.is_none() && !nul(&rj["r_continu"]) {
        let r_dc = nb(&rj["r_continu"]);
        let k_dc = if diff { 2.0 } else { 1.0 };
        p.exces_continu = r_continu(&abcds, 0.0) - k_dc * r_dc;
        if let Some(cc) = &abcd_cc {
            p.exces_continu_cc = r_continu(cc, 0.0) - 0.5 * r_dc;
        }
    }
    // -- les condensateurs de liaison, dans les cascades du canal ---------
    // Entre le boitier et la piste : devant le canal (position emetteur) ou
    // derriere (recepteur), avant que les boitiers IBIS ne les encadrent.
    let mut info_ac = None;
    if let Some(ca) = &ca {
        (abcds, abcd_cc, m_brins) = poser_couplage_ac(Some(ca), &freqs, &abcds, abcd_cc.as_deref(), m_brins.as_deref(), &p.mode);
        info_ac = Some(_fiche_couplage_ac(ca, &p, fenetre, &mut av));
    }
    let mut note_bt = String::new();
    let (mut h_canal, mut h0_canal, mut h0_bin, mut lent): (Option<Vec<Complex64>>, Option<f64>, Option<f64>, Option<Lent>) = (None, None, None, None);
    let mut_ = ctx.as_ref().is_some_and(|c| c.mut_em.is_some() || c.mut_rx.is_some());
    if let (Some(mb), false) = (&m_brins, temporel && abcd_cc.is_some()) {
        // LA PAIRE DISSYMETRIQUE EN LINEAIRE : le transfert differentiel
        // de la paire par brin, boitiers poses brin par brin.
        let mut bins = Continu::default();
        let (h, h0, note) = transfert_paire(ctx.as_ref(), &freqs, mb, &p, Some(&mut bins))?;
        (h_canal, h0_canal, note_bt) = (Some(h), Some(h0), note);
        h0_bin = if ca.is_some() { Some(bins.bin) } else { None };
        lent = bins.lent;
        if !note_bt.is_empty() && mut_ {
            note_bt += ", mutuelles de la paire comprises";
        }
    } else if abcd_cc.is_none() {
        (abcds, note_bt) = appliquer_boitiers(ctx.as_ref(), &freqs, &abcds, &p.mode)?;
        if !note_bt.is_empty() && diff && !asymetries(ctx.as_ref()).is_empty() {
            note_bt += " — la moyenne des deux broches, sur les deux brins";
        }
    } else if let Some(c) = ctx.as_ref().filter(|c| c.bt_em.0.is_some() || c.bt_em.1.is_some() || c.bt_rx.0.is_some() || c.bt_rx.1.is_some() || mut_) {
        let _ = c;
        note_bt = format!("boîtiers comptés, broche par broche{}", if mut_ { ", mutuelles de la paire comprises" } else { "" });
    }
    if let Some(c) = &ctx {
        av.extend(c.notes.iter().cloned());
    }
    let mut nl: Option<NonLineaire> = None;
    let mut nl_ref: Option<NonLineaire> = None;
    if let (true, Some(c)) = (temporel, &ctx) {
        if let Some(cc) = &abcd_cc {
            let n = simuler_paire(c, &freqs, &abcds, cc, &p, _r_reference(rj, &p), surlong, false, false, m_brins.as_deref())?;
            (p.v_haut, p.v_bas) = (n.v_haut, n.v_bas);
            nl = Some(n);
            if !asymetries(Some(c)).is_empty() || surlong.is_some() || m_brins.is_some() {
                nl_ref = Some(simuler_paire(c, &freqs, &abcds, cc, &p, _r_reference(rj, &p), None, true, true, None)?);
            }
        } else {
            let n = simuler_non_lineaire(c, &freqs, &abcds, &p, _r_reference(rj, &p))?;
            (p.v_haut, p.v_bas) = (n.v_haut, n.v_bas);
            nl = Some(n);
        }
    }
    let asym_nl = nl.as_ref().map(|n| nb(&n.infos["asymetrie"]));
    if let Some(a) = asym_nl.filter(|a| *a > 0.05) {
        av.push(format!(
            "Les fronts montant et descendant du tampon diffèrent de {} % : le pire cas et l'œil statistique \
             prennent leur moyenne, l'œil PRBS les suit tels quels.",
            pf(100.0 * a, 0)));
    }
    if o["agresseurs_auto"].vrai() {
        let part = if diff && !nul(&sd["partenaire"]) { Some(str_py(&sd["partenaire"])) } else { None };
        let (trouves, notes) = agresseurs_du_couplage(&rj["couplage"], &p, o, part.as_deref(), nl.as_ref().map(|n| n.v_haut - n.v_bas));
        p.bornes.extend(trouves);
        av.extend(notes);
    }
    let canal = match &h_canal {
        Some(h) => Canal::H(h),
        None => Canal::Abcd(&abcds),
    };
    // LES MODELES AMI, s'il y en a a executer : apres la cascade et les
    // tampons, avant l'oeil, qui lit alors leur reponse (voir `executer_ami`).
    if let Some(a) = ami.as_mut().filter(|a| a.biblios.iter().any(Option::is_some)) {
        nl = executer_ami(a, &mut p, &freqs, canal, h0_canal, h0_bin, nl, racines_ami.unwrap_or(&[]), &mut av, lent, chargeur)?;
    }
    let r = oeil(&freqs, canal, &p, gab, h0_canal, nl.as_mut(), h0_bin, lent);
    for m in nl.as_ref().and_then(|n| n.ami.as_ref()).iter().flat_map(|a| [&a.rx, &a.tx]).flatten() {
        m.borrow_mut().fermer();
    }
    let mut r = r?;
    let mut manque = Vec::new();
    if p.rj_ui == 0.0 && p.dj_ui == 0.0 && p.bruit_v == 0.0 {
        manque.push("sans gigue aléatoire ni bruit");
    }
    if p.bornes.is_empty() {
        manque.push("sans diaphonie des voisines");
    }
    let mut quoi;
    if let Some(c) = &ctx {
        let mut bouts = Vec::new();
        bouts.push(if c.em.is_some() { "émetteur IBIS".to_string() } else { "émetteur linéaire (Thévenin)".to_string() });
        if c.infos["recepteur"]["modele"].vrai() {
            bouts.push(format!("récepteur IBIS (C_comp{})", if c.rx.is_some() { " et diodes" } else { "" }));
        } else {
            bouts.push("récepteur linéaire".into());
        }
        quoi = bouts.join(" et ");
        if let (true, Some(n)) = (temporel, &nl) {
            quoi += &format!(
                ", simulés dans le temps (pas {} ps, canal lissé par un front de {} ps{})",
                fmt_g(n.dt * 1e12, 3), fmt_g(c.tr_lissage * 1e12, 3),
                if abcd_cc.is_some() { " ; les deux brins de la paire" } else { "" });
        }
        quoi += &format!(" ; {}", if !note_bt.is_empty() {
            note_bt.as_str()
        } else if !c.boitier {
            "boîtier non compté (demandé)"
        } else {
            "sans boîtier dans les fichiers"
        });
        poser(&mut r, "ibis", match &nl {
            Some(n) => n.infos.clone(),
            None => c.infos.clone(),
        });
        if let (true, Some(n)) = (abcd_cc.is_some(), &nl) {
            if let Some(mut mc) = mode_commun(n, nl_ref.as_mut())? {
                let mut asy = asymetries(Some(c));
                if let Some(sl) = surlong {
                    asy.push(format!("surlongueur de {} mm", fmt_g(sl.mm, 3)));
                }
                if m_brins.is_some() {
                    asy.extend(els(&sd["dissymetries"]).iter().map(|x| format!("paire : {}", str_py(x))));
                }
                let a = nb(&n.infos["asymetrie"]);
                if a > 0.01 {
                    asy.push(format!(
                        "fronts montant et descendant du tampon différents ({} %) : le mode commun en vient même entre deux \
                         brins identiques",
                        pf(100.0 * a, 0)));
                }
                poser(&mut mc, "asymetries", asy);
                poser(&mut r, "mode_commun", mc);
            }
        }
        _seuil_vdiff(&mut r, Some(c));
    } else {
        quoi = "Émetteur et récepteur linéaires (pas de modèle IBIS)".to_string();
    }
    if let Some(a) = ami {
        let mut aj = a.json;
        poser(&mut aj, "execution", a.execution.borrow().clone());
        let ex = aj["execution"].clone();
        let mut ok_: Option<Vec<String>> = None;
        if let Some(an) = nl.as_ref().and_then(|n| n.ami.as_ref()) {
            // les instants eux-memes restent ici : un tableau par bit
            let hz = an.horloges.borrow();
            let mut h = obj! {"n" => hz.n};
            if let Some(ph) = hz.phase_ui {
                poser(&mut h, "phase_ui", ph);
            }
            if r["horloge_ami"].vrai() {
                maj(&mut h, r["horloge_ami"].clone());
            }
            poser(&mut aj, "horloges", h);
            let l: Vec<String> = ex.as_objet().map_or(Vec::new(), |e| e.iter().filter(|(_, f)| f["init"].vrai()).map(|(b, _)| b.clone()).collect());
            poser(&mut aj, "execution_ok", l.clone());
            ok_ = Some(l);
        }
        if aj["renvois"].vrai() && !(aj["emetteur"].vrai() || aj["recepteur"].vrai()) {
            av.push(format!(
                "Le modèle déclare un [Algorithmic Model] ({}) : chargez son fichier .ami pour le lire. La bibliothèque \
                 elle-même n'est pas exécutée.",
                els(&aj["renvois"]).iter().map(|x| format!("{}, {}", str_py(&x["fichier_ami"]), str_py(&x["bibliotheque"]))).collect::<Vec<_>>().join(", ")));
        } else if aj["applique"].vrai() {
            av.push(format!(
                "Égaliseur de référence réglé d'après le .ami : {}.{}",
                els(&aj["applique"]).iter().map(str_py).collect::<Vec<_>>().join(", "),
                if ok_.is_some_and(|l| !l.is_empty()) { "" } else { " Le modèle AMI n'est pas exécuté." }));
        }
        poser(&mut r, "ami", aj);
    }
    let quoi_maj: String = {
        let mut c = quoi.chars();
        match c.next() {
            Some(premier) => premier.to_uppercase().collect::<String>() + c.as_str(),
            None => String::new(),
        }
    };
    av.extend(els(&r["avertissements"]).iter().map(str_py));
    av.push(format!(
        "{}, {}, {} : l'œil est celui que la piste{} laisse passer.",
        quoi_maj,
        if manque.is_empty() { "gigue et diaphonie comprises".to_string() } else { manque.join(", ") },
        match &ca {
            Some(ca) => format!("condensateurs de liaison de {} par brin côté {} compris", _farads(ca.c), if ca.position == "emetteur" { "émetteur" } else { "récepteur" }),
            None => "et sans condensateurs de liaison".to_string(),
        },
        if ca.is_some() { "" } else { " seule" }));
    poser(&mut r, "avertissements", av);
    if let Some(i) = info_ac {
        poser(&mut r, "couplage_ac", i);
    }
    let ou_vide = |v: &Json| if v.vrai() { v.clone() } else { "".j() };
    let duree = round(debut.elapsed().as_secs_f64(), 3);
    maj(&mut r, obj! {
        "format" => FORMAT_RESULTAT, "version" => VERSION,
        "net" => ou_vide(&doc["net"]), "carte" => ou_vide(&doc["carte"]),
        "partenaire" => if diff { sd["partenaire"].clone() } else { Json::Nul },
        "ligne" => &rj["ligne"],
        "avertissements_ligne" => if rj["avertissements"].vrai() { rj["avertissements"].clone() } else { Vec::<String>::new().j() },
        "parametres" => p.json(),
        "duree" => duree,
    });
    if m_brins.is_some() {
        // CE QUI DISTINGUE LES DEUX BRINS, quand la cascade a quatre acces a
        // servi -- rien de plus sinon : la reponse d'une paire symetrique
        // reste celle d'avant.
        poser(&mut r, "paire_brins", obj! {"dissymetries" => if sd["dissymetries"].vrai() { sd["dissymetries"].clone() } else { Vec::<String>::new().j() },
                                           "brin_long" => &sd["brin_long"],
                                           "delta_l_mm" => dl,
                                           "vias" => &sd["vias_brins"]});
    }
    if let Some(journal) = journal {
        let mes = &r["mesures"];
        journal(&format!(
            "  oeil « {} » : {} Gb/s, hauteur {} mV (pire {} mV), {} points, {} s\n",
            if r["net"].vrai() { str_py(&r["net"]) } else { "(sans nom)".to_string() },
            fmt_g(p.debit / 1e9, 4), pf(nb(&mes["hauteur_prbs"]) * 1e3, 1), pf(nb(&mes["hauteur_pire"]) * 1e3, 1), n, pf(duree, 1)));
    }
    Ok(r)
}
