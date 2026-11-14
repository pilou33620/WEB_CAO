// ==========================================================================
// De l'empilage a plat a la section droite
// --------------------------------------------------------------------------
// L'empilage arrive comme une liste de couches alternant conducteur et
// dielectrique. Pour une piste posee sur le conducteur d'indice L, la section
// droite se lit en remontant et en descendant jusqu'au premier conducteur qui
// porte le role « plane » : c'est le plan de reference, et le dielectrique
// traverse en chemin donne la hauteur et la permittivite.
//
// C'est la meme lecture que `dpStripGeom()` cote editeur PCB et `ltGeom()` cote
// visionneuse. Elle est refaite ici parce que le serveur ne peut pas appeler du
// JavaScript -- mais elle doit rendre la MEME chose, sans quoi la fiche de la
// page et la simulation ne parleraient pas de la meme piste.
// ==========================================================================

use super::base::*;
use ligne_mom as tl;
use std::collections::BTreeSet;

fn cuivre(c: &Json) -> bool {
    c["type"].as_str() == Some("copper")
}

/// Le dielectrique entre les conducteurs d'indices a et b (a < b).
///
/// Rend (epaisseur totale, permittivite moyenne ponderee, tan delta moyen).
/// Les conducteurs traverses au passage ne comptent pas : c'est le
/// dielectrique qui fait la distance electrique.
pub fn _entre(couches: &[Json], a: i64, b: i64) -> (f64, f64, f64) {
    let (mut t, mut s_er, mut s_df) = (0.0, 0.0, 0.0);
    for i in a.min(b) + 1..a.max(b) {
        let c = &couches[i as usize];
        if cuivre(c) {
            continue;
        }
        let e = nb(&c["thickness"]);
        if e <= 0.0 {
            continue;
        }
        t += e;
        s_er += e * _nombre(&c["epsilon_r"], 4.3);
        s_df += e * _nombre(&c["tan_delta"], 0.02);
    }
    if t <= 0.0 {
        return (0.0, 4.3, 0.02);
    }
    (t, s_er / t, s_df / t)
}

/// L'epaisseur de CUIVRE strictement entre les conducteurs a et b.
///
/// `_entre` ne compte que le dielectrique -- c'est lui qui fait la distance
/// electrique. Mais l'ecart PHYSIQUE entre deux plans, lui, comprend aussi les
/// conducteurs traverses : sur un six couches, deux couches de signal de 35 um
/// entre les deux plans, ce sont 70 um qui manquaient a « b ».
pub fn _cuivre_entre(couches: &[Json], a: i64, b: i64) -> f64 {
    py::sum((a.min(b) + 1..a.max(b)).filter(|&i| cuivre(&couches[i as usize])).map(|i| nb(&couches[i as usize]["thickness"])))
}

/// Le dielectrique qui COUVRE la piste, du cote oppose au plan.
///
/// C'est ce qui separe un microruban NU -- couche exterieure, de l'air
/// au-dessus -- d'une piste INTERNE, qui a du stratifie des deux cotes. Le
/// solveur en a besoin : sans lui il calcule une couche interne comme si elle
/// affleurait, et il sort une dizaine de pour cent trop haut.
///
/// On accumule tout le dielectrique jusqu'a la face exterieure de l'empilage,
/// en enjambant les conducteurs rencontres -- meme convention que `_entre`.
/// Une piste de couche exterieure ne trouve rien : la couverture est nulle,
/// et c'est exactement le cas nu.
pub fn _couverture(couches: &[Json], indice: i64, vers_le_bas: bool) -> f64 {
    let pas = if vers_le_bas { 1 } else { -1 };
    let mut total = 0.0;
    let mut i = indice + pas;
    while 0 <= i && i < couches.len() as i64 {
        let c = &couches[i as usize];
        if !cuivre(c) {
            let e = nb(&c["thickness"]);
            if e > 0.0 {
                total += e;
            }
        }
        i += pas;
    }
    total
}

/// Les dielectriques rencontres de la piste vers `jusqu_a` (un indice de
/// plan, ou -1 / len(couches) pour la face de la carte) : [[er, epaisseur en
/// METRES], ...], les voisins de meme er fondus.
///
/// `avec_cuivre` : le cuivre des couches de signal traversees compte dans
/// l'epaisseur du dielectrique qui le precede (la resine le noie) -- c'est
/// la convention de l'ecart « b » d'une triplaque (`_cuivre_entre`) ; la
/// hauteur d'un microruban, elle, ne le compte pas (`_entre`).
pub fn _strates(couches: &[Json], indice: i64, jusqu_a: i64, avec_cuivre: bool) -> Vec<(f64, f64)> {
    let pas = if jusqu_a > indice { 1 } else { -1 };
    let mut out: Vec<(f64, f64)> = Vec::new();
    let mut i = indice + pas;
    while i != jusqu_a {
        let c = &couches[i as usize];
        i += pas;
        let e = nb(&c["thickness"]);
        if e <= 0.0 {
            continue;
        }
        if cuivre(c) {
            if avec_cuivre {
                if let Some(d) = out.last_mut() {
                    d.1 += e * 1e-3;
                }
            }
            continue;
        }
        let er = _nombre(&c["epsilon_r"], 4.3);
        match out.last_mut() {
            Some(d) if (d.0 - er).abs() < 1e-9 => d.1 += e * 1e-3,
            _ => out.push((er, e * 1e-3)),
        }
    }
    out
}

/// Vrai quand ces couches n'ont pas toutes la meme permittivite.
pub fn _heterogene(listes: &[&[(f64, f64)]]) -> bool {
    let ers: Vec<f64> = listes.iter().flat_map(|l| l.iter().map(|s| s.0)).collect();
    !ers.is_empty() && maxf(&ers) - minf(&ers) > 1e-9
}

fn strates_json(s: &[(f64, f64)]) -> Json {
    Json::Liste(s.iter().map(|&(er, ep)| vec![er, ep].j()).collect())
}

/// La section droite d'une piste, en METRES, pour `solve_line`.
///
/// `plans_ignores` PORTE LES PLANS QUI N'EN SONT PAS ICI. L'empilage est
/// GLOBAL : il dit qu'une couche est un plan de reference, jamais qu'elle
/// porte du cuivre a tel endroit. Une decoupe, une fente, un plan qui ne
/// descend pas sous la paire -- tout cela est LOCAL, et l'appelant est le seul
/// a le savoir. Il nomme alors les plans absents, et la recherche du plan le
/// plus proche passe au suivant, exactement comme si la couche etait du
/// signal a cet endroit-la. Sans ce parametre, deux troncons identiques dont
/// l'un est reference et l'autre non se resolvent BIT POUR BIT pareil : une
/// piste survolant une decoupe rendait le meme Z0, le meme retard et le meme
/// couplage qu'une piste sur plan plein, et rien ne le disait.
///
/// `ecart_g_mm` et `ecart_d_mm` sont les distances de cuivre a cuivre entre la
/// piste et le plan de masse qui la borde SUR SA PROPRE COUCHE, un par cote --
/// zero quand il n'y en a pas de ce cote-la. Sur une carte arrosee, et une
/// carte RF l'est toujours, c'est ce qui separe un microruban d'une ligne
/// coplanaire, et vingt pour cent d'impedance.
///
/// LES DEUX COTES SONT INDEPENDANTS. `ecart_d_mm` a None veut dire « le meme
/// des deux cotes » : c'est le cas symetrique, et c'est ce que voulait dire
/// l'unique `ecart_mm` d'avant la 2.3.0. Un cote a zero et l'autre non, c'est
/// la piste qui longe une decoupe -- et la prendre pour symetrique fait tomber
/// Z0 deux fois trop.
///
/// `sans_plan` OUVRE LE CAS DE LA CARTE SANS PLAN. Faute de plan en face, la
/// piste d'une couche EXTERIEURE se resout alors en ligne coplanaire sans plan
/// dessous (`kind` « sans_plan » de `ligne_mom`) : le stratifie entier, de
/// l'air des deux cotes, et la masse arrosee de la meme couche pour retour.
/// C'est a l'appelant de fournir ce retour -- les ecarts, ou des pistes de
/// garde --, et c'est le solveur qui refuse s'il n'y en a aucun. Facultatif et
/// faux par defaut : les autres onglets gardent leur refus.
///
/// Rend (geometrie, description) ou (None, raison) quand il n'y a pas de ligne
/// a calculer -- pas de plan de reference, couche inconnue.
#[allow(clippy::too_many_arguments)]
pub fn section_de_couche(
    couches: &[Json], indice: i64, largeur_mm: f64, epaisseur_mm: f64, ecart_g_mm: f64, ecart_d_mm: Option<f64>,
    plans_ignores: &[String], sans_plan: bool,
) -> (Option<Json>, Json) {
    let fin = |x: f64| if x.is_finite() { x } else { 0.0 };
    let ecart_d_mm = ecart_d_mm.unwrap_or(ecart_g_mm);
    let e_g = fin(ecart_g_mm).max(0.0);
    let e_d = fin(ecart_d_mm).max(0.0);
    let n = couches.len() as i64;
    if indice < 0 || indice >= n {
        return (None, "couche hors de l'empilage".j());
    }
    if !cuivre(&couches[indice as usize]) {
        return (None, "cette couche n'est pas du cuivre".j());
    }

    let nus: BTreeSet<&str> = plans_ignores.iter().map(|s| s.as_str()).filter(|s| !s.is_empty()).collect();
    let _est_plan = |c: &Json| cuivre(c) && c["role"].as_str() == Some("plane") && !nus.contains(txt(c, "name"));

    let (mut haut, mut bas) = (-1i64, -1i64);
    for k in (0..indice).rev() {
        if _est_plan(&couches[k as usize]) {
            haut = k;
            break;
        }
    }
    for k in indice + 1..n {
        if _est_plan(&couches[k as usize]) {
            bas = k;
            break;
        }
    }

    let w = largeur_mm * 1e-3;
    let t = epaisseur_mm * 1e-3;
    if !(w > 0.0) {
        return (None, "largeur de piste nulle".j());
    }
    let nom = |k: i64| ou(&couches[k as usize]["name"], &Json::Nul).clone();
    let nom_ou_vide = |k: i64| couches[k as usize].get("name").cloned().unwrap_or_else(|| "".j());
    let _ = nom;

    if haut >= 0 && bas >= 0 {
        // Triplaque. La position exacte du ruban entre les deux plans compte :
        // un empilage 4 couches courant est franchement dissymetrique -- ame
        // epaisse d'un cote, prepreg mince de l'autre -- et c'est justement ce
        // que la formule IPC ne sait pas prendre, elle qui suppose le ruban
        // centre. Ici il est ou il est.
        let (t_haut, er_h, df_h) = _entre(couches, haut, indice);
        let (t_bas, er_b, df_b) = _entre(couches, indice, bas);
        // L'ecart entre plans, c'est du dielectrique ET du cuivre : celui de la
        // piste, et celui de toutes les couches traversees au passage.
        let cu_haut = _cuivre_entre(couches, haut, indice);
        let cu_bas = _cuivre_entre(couches, indice, bas);
        let b = (t_haut + t_bas + cu_haut + cu_bas + epaisseur_mm) * 1e-3;
        let y0 = (t_bas + cu_bas) * 1e-3 + t / 2.0;
        let total = t_haut + t_bas;
        let er = if total > 0.0 { (er_h * t_haut + er_b * t_bas) / total } else { 4.3 };
        let df = if total > 0.0 { (df_h * t_haut + df_b * t_bas) / total } else { 0.02 };
        if !(b > 0.0) || !(0.0 < y0 && y0 < b) {
            return (None, "empilage incoherent entre les deux plans".j());
        }
        let mut geo_strip = obj! {"kind" => "strip", "w" => w, "t" => t, "b" => b, "y0" => y0,
                                  "epsilon_r" => er, "tan_delta" => df,
                                  "ecart_g" => e_g * 1e-3, "ecart_d" => e_d * 1e-3};
        // DEUX DIELECTRIQUES DIFFERENTS NE SE MOYENNENT PAS (5.6.0) : le champ
        // est du cote du plan proche. Ils partent couche par couche et
        // `ligne_mom` les resout (`green_spectral_multicouche`). Homogene,
        // rien ne part et le calcul est celui d'avant au bit pres.
        // shortcut: `er` et tan delta restent la moyenne a l'epaisseur pour
        // les pertes et la fiche ; a ponderer par l'energie si alpha_d doit
        // tenir mieux que quelques pour cent sur un empilage tres contraste.
        let s_bas = _strates(couches, indice, bas, true);
        let s_haut = _strates(couches, indice, haut, true);
        if _heterogene(&[&s_bas, &s_haut]) {
            poser(&mut geo_strip, "strates", obj! {"dessous" => strates_json(&s_bas), "dessus" => strates_json(&s_haut),
                                                   "plan_dessus" => true});
        }
        return (Some(geo_strip),
                obj! {"topo" => "strip", "ref" => 2i64, "h" => y0.min(b - y0), "b" => b,
                      "er" => er, "tan_delta" => df,
                      "ecart_g" => e_g, "ecart_d" => e_d,
                      "plan_haut" => nom_ou_vide(haut),
                      "plan_bas" => nom_ou_vide(bas),
                      "dissym" => (t_haut - t_bas).abs() / maxf(&[t_haut, t_bas, 1e-9])});
    }

    let proche = if haut >= 0 { haut } else { bas };
    if proche < 0 && sans_plan {
        return _section_sans_plan(couches, indice, w, t, e_g, e_d, &nus);
    }
    if proche < 0 {
        if !nus.is_empty() {
            return (None, format!("aucun plan de reference EN FACE DE CE TRONCON : le\
                                   \x20ou les plans de l'empilage ({}) n'ont pas de\
                                   \x20cuivre de retour ici, et il n'y en a pas d'autre\
                                   \x20derriere. Sans conducteur de reference il n'y a\
                                   \x20pas de ligne quasi-TEM, donc rien a calculer",
                                  nus.iter().copied().collect::<Vec<_>>().join(", ")).j());
        }
        return (None, "aucun plan de reference dans l'empilage : sans plan en\
                       \x20face de la piste, il n'y a pas de ligne".j());
    }
    let (h_mm, er, df) = _entre(couches, proche, indice);
    if !(h_mm > 0.0) {
        return (None, "hauteur au plan de reference nulle".j());
    }
    // Ce qu'il y a DE L'AUTRE COTE de la piste, a l'oppose du plan. Rien pour
    // une couche exterieure -- de l'air, et c'est le microruban nu. Du
    // stratifie pour une couche interne, et alors ce n'est plus le meme calcul.
    let mut couv_mm = _couverture(couches, indice, haut >= 0);
    // Le melange d'epsilon est plus bas : il depend de la presence d'un masque,
    // qui n'est detecte qu'apres.

    // LOT 2 : le masque de soudure.
    // Une couche exterieure est couverte de vernis. Le masque est modélisé
    // par une Green à 3 régions (substrat + masque + air).
    // On le détecte : couche exterieure = la premiere ou la derniere couche
    // de cuivre de signal, sans cuivre au-dessus (ni dielectrique ni cuivre).
    let mut masque_info: Option<(f64, f64)> = None;
    let mut est_exterieur = false;
    if haut >= 0 && bas < 0 {
        est_exterieur = true;
        masque_info = _masque_exterieur(couches, indice, true);
    } else if haut < 0 && bas >= 0 {
        est_exterieur = true;
        masque_info = _masque_exterieur(couches, indice, false);
    }
    // un masque d'epaisseur et d'epsilon nuls est un dict PLEIN en Python : il reste vrai

    // La permittivite du modele couvert : le stratifie de la piste au plan ET
    // au-dessus, pondere par les deux epaisseurs. C'est le cas de la piste
    // ENTERREE, celle qui porte du stratifie par-dessus.
    //
    // UNE PISTE EXTERIEURE VERNIE N'EST PAS CE CAS. Le vernis qui la couvre est
    // deja porte par `masque_info`, que `solve_line` rend par la Green a trois
    // regions -- substrat, masque, air. Le melanger AUSSI dans l'epsilon du
    // substrat, c'est compter la meme resine DEUX FOIS, et du mauvais cote : la
    // moyenne fait BAISSER l'epsilon du stratifie, comme si le vernis etait
    // ENTRE la piste et le plan alors qu'il est au-dessus.
    //
    // MESURE. Un empilage qui DECLARE son masque de 25 um voyait er tomber de
    // 4,3 a 4,2444, Z0 monter de 0,56 % et eps_eff baisser de 1,12 % par rapport
    // au MEME empilage qui ne le declare pas et recoit le masque par defaut.
    // Declarer le masque rendait donc le resultat faux, et le taire le rendait
    // juste : exactement l'inverse de ce qu'on attend d'un empilage renseigne.
    let mut er_couv = er;
    if couv_mm > 0.0 && masque_info.is_none() {
        let er_haut = _entre_exterieur(couches, indice, haut >= 0);
        er_couv = (er * h_mm + er_haut * couv_mm) / (h_mm + couv_mm);
    }

    // Couverture et masque nomment la MEME resine quand les deux sont la.
    // `solve_line` ignore deja `couverture` des qu'un masque est pose ; on la
    // met a zero pour que ni la geometrie ni la fiche ne la comptent en double.
    if masque_info.is_some() {
        couv_mm = 0.0;
    }

    let mut geo_micro = obj! {"kind" => "micro", "w" => w, "t" => t, "h" => h_mm * 1e-3,
                              "couverture" => couv_mm * 1e-3, "epsilon_r" => er_couv,
                              "tan_delta" => df,
                              "ecart_g" => e_g * 1e-3, "ecart_d" => e_d * 1e-3};
    if let Some((ep, erm)) = masque_info {
        poser(&mut geo_micro, "masque", obj! {"epaisseur" => ep, "epsilon_r" => erm});
    }
    // DES DIELECTRIQUES DIFFERENTS, couche par couche (5.6.0) -- voir la
    // triplaque plus haut. Le vernis est la couche du dessus quand il y en a
    // un ; sinon, ce qui couvre la piste jusqu'a la face.
    let s_bas = _strates(couches, indice, proche, false);
    let s_haut = if let Some((ep, erm)) = masque_info {
        vec![(erm, ep)]
    } else {
        let mut s = _strates(couches, indice, if haut >= 0 { n } else { -1 }, false);
        if py::sum(s.iter().map(|x| x.1)) < t.max(1e-9) {
            s = Vec::new(); // comme `couverture` dans ligne_mom
        }
        s
    };
    if _heterogene(&[&s_bas]) || (masque_info.is_none() && _heterogene(&[&s_bas, &s_haut])) {
        poser(&mut geo_micro, "strates", obj! {"dessous" => strates_json(&s_bas), "dessus" => strates_json(&s_haut),
                                               "plan_dessus" => false});
    }

    let mut info_micro = obj! {"topo" => "micro", "ref" => 1i64, "h" => h_mm * 1e-3, "b" => 0.0,
                               "er" => er_couv, "tan_delta" => df, "couverture" => couv_mm * 1e-3,
                               "ecart_g" => e_g, "ecart_d" => e_d,
                               "plan_haut" => if haut >= 0 { nom_ou_vide(proche) } else { "".j() },
                               "plan_bas" => if bas >= 0 { nom_ou_vide(proche) } else { "".j() },
                               "dissym" => 0.0, "exterieur" => est_exterieur};
    if let Some((ep, erm)) = masque_info {
        poser(&mut info_micro, "masque", obj! {"epaisseur" => ep * 1e3, "epsilon_r" => erm});
    }

    (Some(geo_micro), info_micro)
}

/// La section d'une piste EXTERIEURE qu'aucun plan ne reference.
///
/// LE STRATIFIE ENTIER FAIT LA PLAQUE : tout le dielectrique entre la piste
/// et l'autre face, moyenne a l'epaisseur, les couches de cuivre traversees
/// comptant pour rien -- ce sont des couches de signal, ou des plans absents
/// sous ce troncon. Le vernis du cote de la piste n'est pas modelise : la
/// Green en images ne connait qu'une plaque dans l'air, et la description le
/// dit.
///
/// UNE COUCHE INTERNE SANS PLAN EST REFUSEE : du stratifie des deux cotes,
/// ce n'est plus une plaque dans l'air, et la poser comme telle donnerait un
/// eps_eff faux sans que rien ne le montre.
fn _section_sans_plan(couches: &[Json], indice: i64, w: f64, t: f64, e_g: f64, e_d: f64, nus: &BTreeSet<&str>) -> (Option<Json>, Json) {
    let cu: Vec<i64> = (0..couches.len()).filter(|&i| cuivre(&couches[i])).map(|i| i as i64).collect();
    let tranche = if indice == cu[0] {
        indice + 1..couches.len() as i64
    } else if indice == cu[cu.len() - 1] {
        0..indice
    } else {
        return (None, "couche interne sans plan de reference : du stratifie\
                       \x20des deux cotes, ce que la ligne sans plan ne modelise\
                       \x20pas".j());
    };
    let (mut h, mut s_er, mut s_df) = (0.0, 0.0, 0.0);
    for i in tranche {
        let c = &couches[i as usize];
        if c["type"].as_str() != Some("dielectric") {
            continue;
        }
        let e = nb(&c["thickness"]);
        // Le vernis de L'AUTRE face fait partie de la plaque ; celui de la
        // face de la piste est de l'autre cote et n'est pas dans `tranche`.
        if e <= 0.0 {
            continue;
        }
        h += e;
        s_er += e * _nombre(&c["epsilon_r"], 4.3);
        s_df += e * _nombre(&c["tan_delta"], 0.02);
    }
    if !(h > 0.0) {
        return (None, "carte sans plan et sans stratifie : pas de section".j());
    }
    let (er, df) = (s_er / h, s_df / h);
    let geo = obj! {"kind" => "sans_plan", "w" => w, "t" => t, "h" => h * 1e-3,
                    "epsilon_r" => er, "tan_delta" => df,
                    "ecart_g" => e_g * 1e-3, "ecart_d" => e_d * 1e-3};
    let info = obj! {"topo" => "sans_plan", "ref" => 0i64, "h" => h * 1e-3, "b" => 0.0,
                     "er" => er, "tan_delta" => df, "couverture" => 0.0,
                     "ecart_g" => e_g, "ecart_d" => e_d, "plan_haut" => "", "plan_bas" => "",
                     "dissym" => 0.0, "exterieur" => true, "vernis_ignore" => true,
                     "plans_absents" => nus.iter().copied().collect::<Vec<_>>()};
    (Some(geo), info)
}

/// Le vernis qui couvre une piste exterieure, ou None s'il n'y en a pas :
/// (epaisseur en metres, epsilon_r).
///
/// On marche vers la FACE de la carte en partant de la piste, et ce qu'on
/// rencontre decide :
///
///   - un conducteur          -> la piste n'est pas a la face : pas de vernis,
///                               et c'est la couverture qui parlera ;
///   - un dielectrique nomme  -> c'est le masque declare : on prend SON
///     « mask »                  epaisseur et SON epsilon ;
///   - un dielectrique autre  -> du stratifie. La piste est ENTERREE sous du
///                               prepreg, pas vernie : pas de vernis, et la
///                               aussi c'est la couverture qui parlera ;
///   - plus rien              -> la piste est nue a la face, et une piste nue
///                               a la face porte du vernis : 25 um a er 3,8,
///                               le repli d'usage.
///
/// CE QUI ETAIT ECRIT ICI AVANT posait la question du MAUVAIS COTE : le test
/// regardait `couches[indice - 1]` -- la couche du cote du PLAN -- pour decider
/// ce qu'il y avait du cote de la FACE, et il y cherchait du cuivre la ou c'est
/// du dielectrique qui compte. Consequence mesuree : une piste couverte de
/// 0,1 mm de prepreg recevait quand meme un vernis de 25 um par defaut, et son
/// prepreg partait a la poubelle.
pub fn _masque_exterieur(couches: &[Json], indice: i64, vers_le_bas: bool) -> Option<(f64, f64)> {
    let pas = if vers_le_bas { 1 } else { -1 };
    let mut i = indice + pas;
    while 0 <= i && i < couches.len() as i64 {
        let c = &couches[i as usize];
        if cuivre(c) {
            return None;
        }
        if c["type"].as_str() == Some("dielectric") {
            let e = nb(&c["thickness"]);
            if e <= 0.0 {
                i += pas;
                continue;
            }
            if txt(c, "name").to_lowercase().contains("mask") {
                return Some((e * 1e-3, _nombre(&c["epsilon_r"], 3.8)));
            }
            return None; // du stratifie : piste enterree, pas vernie
        }
        i += pas;
    }
    Some((0.025 * 1e-3, 3.8))
}

/// La permittivite moyenne du dielectrique qui couvre la piste.
pub fn _entre_exterieur(couches: &[Json], indice: i64, vers_le_bas: bool) -> f64 {
    let pas = if vers_le_bas { 1 } else { -1 };
    let (mut t, mut s) = (0.0, 0.0);
    let mut i = indice + pas;
    while 0 <= i && i < couches.len() as i64 {
        let c = &couches[i as usize];
        if !cuivre(c) {
            let e = nb(&c["thickness"]);
            if e > 0.0 {
                t += e;
                s += e * _nombre(&c["epsilon_r"], 4.3);
            }
        }
        i += pas;
    }
    if t > 0.0 { s / t } else { 4.3 }
}

/// Le dict de section tel que `solve_line` et `solve_multiline` le lisaient, en structure.
pub fn geometrie(geo: &Json) -> tl::Geometrie {
    let f = |v: &Json, d: f64| v.as_f64().unwrap_or(d);
    let paires = |v: &Json| els(v).iter().map(|c| (f(&c[0], 0.0), f(&c[1], 0.0))).collect::<Vec<_>>();
    tl::Geometrie {
        kind: tl::Kind::lire(geo["kind"].as_str().unwrap_or("micro")),
        w: f(&geo["w"], 0.0),
        t: f(&geo["t"], 0.0),
        h: f(&geo["h"], 0.0),
        couverture: f(&geo["couverture"], 0.0),
        masque: geo.get("masque").filter(|m| m.vrai()).map(|m| tl::Masque { epaisseur: f(&m["epaisseur"], 0.0), epsilon_r: f(&m["epsilon_r"], 3.8) }),
        b: f(&geo["b"], 0.0),
        y0: geo["y0"].as_f64(),
        epsilon_r: f(&geo["epsilon_r"], 4.3),
        ecart: f(&geo["ecart"], 0.0),
        ecart_g: geo["ecart_g"].as_f64(),
        ecart_d: geo["ecart_d"].as_f64(),
        strates: geo.get("strates").filter(|s| s.vrai()).map(|s| tl::Strates {
            dessous: paires(&s["dessous"]),
            dessus: paires(&s["dessus"]),
            plan_dessus: s["plan_dessus"].vrai(),
        }),
        conducteurs: els(&geo["conducteurs"])
            .iter()
            .map(|c| tl::Conducteur {
                w: f(&c["w"], 0.0),
                x: c["x"].as_f64(),
                s: f(&c["s"], 0.0),
                t: c["t"].as_f64(),
                masse: c["masse"].vrai(),
                flottant: c["flottant"].vrai(),
            })
            .collect(),
    }
}
