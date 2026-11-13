// ==========================================================================
// LE MILIEU, CHOISI UNE FOIS POUR TOUTES
// --------------------------------------------------------------------------
// `solve_line` et `solve_multiline` resolvent la MEME section : meme empilage,
// meme fonction de Green, meme milieu moyen, memes echelles de quadrature. Seul
// le nombre de conducteurs change. Ce choix-la est donc ecrit ICI et nulle part
// ailleurs -- la 2.2.0 a corrige trois copies divergentes des formules de
// discontinuite, et il n'y a aucune raison de recommencer avec le milieu.
// ==========================================================================

use crate::green::*;
use crate::matrice::capacitance_coplanaire;
use crate::pertes::_elargissement_triplaque;
use crate::{refus, Res, C_0, EPSILON_0, N_PANNEAUX, N_QUADRATURE};
use serde::Serialize;

/// `kind` de la section. Tout ce qui n'est ni « strip » ni « sans_plan » est un microruban,
/// comme en Python.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize)]
pub enum Kind {
    #[default]
    #[serde(rename = "micro")]
    Micro,
    #[serde(rename = "strip")]
    Strip,
    #[serde(rename = "sans_plan")]
    SansPlan,
}

impl Kind {
    pub fn lire(texte: &str) -> Kind {
        match texte {
            "strip" => Kind::Strip,
            "sans_plan" => Kind::SansPlan,
            _ => Kind::Micro,
        }
    }

    pub fn nom(self) -> &'static str {
        match self {
            Kind::Micro => "micro",
            Kind::Strip => "strip",
            Kind::SansPlan => "sans_plan",
        }
    }
}

/// Le masque de soudure : `{"epaisseur", "epsilon_r"}`.
#[derive(Debug, Clone, Copy, PartialEq, Serialize)]
pub struct Masque {
    pub epaisseur: f64,
    pub epsilon_r: f64,
}

impl Default for Masque {
    fn default() -> Self {
        Masque { epaisseur: 0.0, epsilon_r: 3.8 }
    }
}

/// `strates` : les dielectriques couche par couche, (er, epaisseur en metres), de la face du
/// cuivre vers l'exterieur.
#[derive(Debug, Clone, PartialEq, Default)]
pub struct Strates {
    pub dessous: Vec<(f64, f64)>,
    pub dessus: Vec<(f64, f64)>,
    pub plan_dessus: bool,
}

/// Un conducteur de `geometry["conducteurs"]` : sa largeur `w` et, au choix, son centre `x` ou
/// son ecart `s` au precedent. `t` absent : l'epaisseur de la section.
#[derive(Debug, Clone, PartialEq, Default)]
pub struct Conducteur {
    pub w: f64,
    pub x: Option<f64>,
    pub s: f64,
    pub t: Option<f64>,
    pub masse: bool,
    pub flottant: bool,
}

/// Le dict `geometry` de `solve_line` et `solve_multiline`, en METRES. Une cle absente du dict
/// est un champ laisse a sa valeur par defaut (er 4,3 ; le reste nul ou absent).
#[derive(Debug, Clone, PartialEq)]
pub struct Geometrie {
    pub kind: Kind,
    pub w: f64,
    pub t: f64,
    pub h: f64,
    pub couverture: f64,
    pub masque: Option<Masque>,
    pub b: f64,
    /// absent : b / 2
    pub y0: Option<f64>,
    pub epsilon_r: f64,
    /// vaut les deux cotes quand ni `ecart_g` ni `ecart_d` n'est donne
    pub ecart: f64,
    pub ecart_g: Option<f64>,
    pub ecart_d: Option<f64>,
    pub strates: Option<Strates>,
    pub conducteurs: Vec<Conducteur>,
}

impl Default for Geometrie {
    fn default() -> Self {
        Geometrie {
            kind: Kind::Micro,
            w: 0.0,
            t: 0.0,
            h: 0.0,
            couverture: 0.0,
            masque: None,
            b: 0.0,
            y0: None,
            epsilon_r: 4.3,
            ecart: 0.0,
            ecart_g: None,
            ecart_d: None,
            strates: None,
            conducteurs: Vec::new(),
        }
    }
}

/// Ce que `_milieu` rend. `flancs` est absent en triplaque et sans plan ; `b_eq` porte
/// l'elargissement propre au milieu (`elargir`, la triplaque) quand il y en a un.
pub struct Milieu {
    pub kind: Kind,
    pub distance: f64,
    pub eps_moyen: f64,
    pub eps_vide: f64,
    pub g_diel: Green,
    pub g_vide: Green,
    pub echelles: Vec<f64>,
    pub couvert: bool,
    pub masque: Option<Masque>,
    pub flancs: Option<f64>,
    pub b_eq: Option<f64>,
}

/// Le milieu d'une section dont les dielectriques different : voir
/// `green_spectral_multicouche`. `strates` = {dessous, dessus, plan_dessus},
/// epaisseurs en metres, de la face du cuivre vers l'exterieur.
pub fn _milieu_strates(geometry: &Geometrie, strates: &Strates) -> Res<Milieu> {
    let lire = |couches: &[(f64, f64)]| -> Res<Vec<(f64, f64)>> {
        let out: Vec<(f64, f64)> = couches.iter().copied().filter(|&(_, ep)| ep > 0.0).collect();
        if out.iter().any(|&(er, _)| !(er >= 1.0)) {
            return refus("strates : permittivite inferieure a 1");
        }
        Ok(out)
    };
    let (bas, haut) = (lire(&strates.dessous)?, lire(&strates.dessus)?);
    let plan_dessus = strates.plan_dessus;
    if bas.is_empty() || (plan_dessus && haut.is_empty()) {
        return refus("strates : pas de dielectrique jusqu'au plan");
    }
    let t = geometry.t;
    let d_bas: f64 = bas.iter().fold(0.0, |s, &(_, ep)| s + ep);
    let d_haut: f64 = haut.iter().fold(0.0, |s, &(_, ep)| s + ep);
    let vide = |couches: &[(f64, f64)]| -> Vec<(f64, f64)> { couches.iter().map(|&(_, ep)| (1.0, ep)).collect() };
    let mut echelles: Vec<f64> = bas.iter().chain(&haut).map(|&(_, ep)| ep).collect();
    echelles.push(d_bas);
    if !haut.is_empty() {
        echelles.push(d_haut);
    }
    echelles.sort_by(f64::total_cmp);
    echelles.dedup();
    let er_haut = haut.first().map_or(1.0, |c| c.0);
    let (bas_v, haut_v) = (vide(&bas), vide(&haut));
    let (bas_d, haut_d) = (bas.clone(), haut.clone());
    let mut m = Milieu {
        kind: if plan_dessus { Kind::Strip } else { Kind::Micro },
        distance: if plan_dessus { d_bas.min(d_haut) } else { d_bas },
        // L'asymptote de la Green : la moyenne des deux dielectriques qui
        // TOUCHENT le ruban, comme pour le vernis.
        eps_moyen: EPSILON_0 * (bas[0].0 + er_haut) / 2.0,
        eps_vide: EPSILON_0,
        g_diel: Green::spectral(move |be| green_spectral_multicouche(be, &bas_d, &haut_d, plan_dessus)),
        g_vide: Green::spectral(move |be| green_spectral_multicouche(be, &bas_v, &haut_v, plan_dessus)),
        echelles,
        couvert: !haut.is_empty() && !plan_dessus,
        masque: None,
        flancs: None,
        b_eq: None,
    };
    if !plan_dessus {
        m.flancs = Some(_part_des_flancs(bas[0].0, t, d_haut, er_haut));
    } else {
        // Le meme elargissement que la triplaque homogene : Wheeler 1978 sur
        // l'ecart equivalent 2 min(y0, b - y0), cuivre compris.
        m.b_eq = Some(2.0 * d_bas.min(d_haut) + t);
    }
    if let (Some(masque), false) = (geometry.masque, plan_dessus) {
        m.masque = Some(masque);
    }
    Ok(m)
}

/// Ce que la section impose au solveur, avant tout conducteur.
///
/// Rend {kind, distance, eps_moyen, eps_vide, g_diel, g_vide, echelles,
/// couvert, masque, elargir} -- `distance` est la hauteur au plan qui sert de
/// longueur de reference (la plus courte des deux pour une triplaque),
/// `masque` porte le vernis retenu ou None, `elargir(w, t)` la largeur du
/// ruban mince qui remplace un ruban de cuivre epais.
pub fn _milieu(geometry: &Geometrie) -> Res<Milieu> {
    let kind = geometry.kind;
    let epsilon_r = geometry.epsilon_r;

    // DES DIELECTRIQUES DIFFERENTS (2.10.0) : l'appelant les donne couche par
    // couche (`strates`), et c'est la Green multicouche. Sans cette cle --
    // tout empilage homogene --, rien ne change.
    if let (Some(strates), Kind::Micro | Kind::Strip) = (&geometry.strates, kind) {
        return _milieu_strates(geometry, strates);
    }

    if kind == Kind::Strip {
        let mut b = geometry.b;
        let mut y0 = geometry.y0.unwrap_or(b / 2.0);
        let t = geometry.t;
        if !(b > 0.0) || !(0.0 < y0 && y0 < b) {
            return refus("triplaque : ecart entre plans invalide");
        }
        // LE CUIVRE EPAIS D'UNE TRIPLAQUE MANGE L'ECART ENTRE PLANS : le ruban
        // mince equivalent vit dans b - t, a y0 - t/2 du plan bas, elargi du
        // dW de Wheeler 1978 (celui de `_z_air_triplaque`). L'elargissement
        // du microruban, pose sur un ruban mince dans b entier, oubliait
        // l'ecart reduit : 41,7 ohms au lieu de 35,7 sur 0,10 / 0,20 mm.
        // Le dW de Wheeler est celui d'un ruban CENTRE : decentre, ce sont les
        // flancs face au plan le plus proche qui comptent, et l'on prend
        // l'ecart equivalent 2 min(y0, b - y0) -- b lui-meme quand il est
        // centre. shortcut: pas de reference publiee hors du centre ; a
        // recaler sur un solveur a cuivre epais si une triplaque decentree
        // doit tenir mieux que quelques pour cent.
        let b_eq = 2.0 * y0.min(b - y0);
        if t > 0.0 {
            if !(t / 2.0 < y0 && y0 < b - t / 2.0) {
                return refus("triplaque : le cuivre touche un plan");
            }
            (b, y0) = (b - t, y0 - t / 2.0);
        }
        return Ok(Milieu {
            kind: Kind::Strip,
            b_eq: Some(b_eq),
            distance: y0.min(b - y0),
            eps_moyen: EPSILON_0 * epsilon_r,
            eps_vide: EPSILON_0,
            g_diel: Green::spectral(move |be| green_spectral_strip(be, y0, b, epsilon_r)),
            g_vide: Green::spectral(move |be| green_spectral_strip(be, y0, b, 1.0)),
            echelles: vec![y0, b - y0],
            couvert: false,
            masque: None,
            flancs: None,
        });
    }

    if kind == Kind::SansPlan {
        // PAS DE PLAN : le stratifie d'epaisseur h, de l'air dessus et
        // dessous, et la masse coplanaire pour seul retour. Ni couverture ni
        // vernis : la Green en images ne connait qu'une plaque.
        // shortcut: le cuivre epais y garde UNE largeur (pas de cle
        // « flancs ») et l'elargissement du microruban, faute d'etalon a
        // cuivre epais sans plan ; eps_eff y est sans doute trop haute comme
        // elle l'etait avec plan (constat 30). A reprendre avec lui.
        let h = geometry.h;
        if !(h > 0.0) {
            return refus("sans plan : epaisseur de stratifie nulle");
        }
        return Ok(Milieu {
            kind: Kind::SansPlan,
            distance: h,
            eps_moyen: EPSILON_0 * (1.0 + epsilon_r) / 2.0,
            eps_vide: EPSILON_0,
            g_diel: Green::SansPlan(NoyauSansPlan::new(h, epsilon_r)?),
            g_vide: Green::SansPlan(NoyauSansPlan::new(h, 1.0)?),
            echelles: vec![h],
            couvert: false,
            masque: None,
            flancs: None,
            b_eq: None,
        });
    }

    let h = geometry.h;
    if !(h > 0.0) {
        return refus("microruban : hauteur au plan nulle");
    }
    let t = geometry.t;
    // Une couverture qui ne pese rien devant l'epaisseur du cuivre n'est pas
    // une couverture : on la laisse tomber plutot que de faire porter la
    // quadrature sur une longueur qui n'existe pas.
    let mut c_diel = geometry.couverture;
    if c_diel < t.max(1e-9) {
        c_diel = 0.0;
    }
    let couvert = c_diel > 0.0;

    // LOT 2 : masque de soudure sur piste exterieure. Le masque a son propre
    // epsilon_r (vernis ~3,8) et son epaisseur (20-30 um) : une Green a trois
    // regions.
    // UN MASQUE ABSENT S'ECRIT DE DEUX FACONS, et la docstring de solve_line
    // annonce les deux : la clef manquante, ou « 0 » pour une couche interne
    // qui n'a pas de vernis. La seconde tombait sur un AttributeError brut --
    // le zero passait la garde `is not None` puis se voyait demander .get.
    // C'est le meme accueil que `couverture` juste au-dessus, qui accepte le
    // zero et l'absence sans distinguer.
    let masque_info = geometry.masque;
    let mut masque_epaisseur = 0.0;
    let mut masque_epsilon = 3.8;
    if let Some(info) = masque_info {
        masque_epaisseur = info.epaisseur;
        masque_epsilon = info.epsilon_r;
        // Un masque plus mince que le nanometre n'est pas un masque : on le
        // laisse tomber et la piste retombe sur le cas nu ou couvert.
        if masque_epaisseur < 1e-9 {
            masque_epaisseur = 0.0;
        }
    }

    let mut commun = Milieu {
        kind: Kind::Micro,
        distance: h,
        eps_vide: EPSILON_0,
        couvert,
        masque: None,
        eps_moyen: 0.0,
        g_diel: Green::spectral(|_| 0.0),
        g_vide: Green::spectral(|_| 0.0),
        echelles: Vec::new(),
        flancs: None,
        b_eq: None,
    };
    if masque_epaisseur > 0.0 {
        // LE MILIEU MOYEN EST L'ASYMPTOTE DE LA GREEN, pas le substrat.
        // Quand beta -> l'infini : coth(beta h) -> 1, K -> (1+1/er2)e^{beta c}/2
        // et M -> (er2+1)e^{beta c}/2, donc G -> 1/(eps0 beta (er1+er2)). Le
        // milieu moyen est donc eps0 (er1+er2)/2 -- la moyenne des deux
        // dielectriques qui bordent le ruban, exactement comme le microruban nu
        // donne eps0 (1+er)/2 avec l'air pour second milieu. Poser le substrat
        // seul decalait l'extraction de la partie singuliere.
        commun.eps_moyen = EPSILON_0 * (epsilon_r + masque_epsilon) / 2.0;
        commun.g_diel = Green::spectral(move |be| green_spectral_micro_masque(be, h, masque_epaisseur, epsilon_r, masque_epsilon));
        // LE VIDE, C'EST TOUT LE DIELECTRIQUE RETIRE -- le masque compris.
        // Le laisser a son er dans la reference gonflait C0, et eps_eff
        // BAISSAIT quand on vernissait la piste : l'inverse de la physique.
        commun.g_vide = Green::spectral(move |be| green_spectral_micro_masque(be, h, masque_epaisseur, 1.0, 1.0));
        commun.echelles = vec![h, masque_epaisseur];
        commun.masque = masque_info;
    } else if couvert {
        // Ruban couvert : du dielectrique des deux cotes, donc le milieu moyen
        // est le stratifie tout entier -- c'est l'asymptote de la fonction de
        // Green qui le dit, et c'est ce qui change tout par rapport au cas nu.
        commun.eps_moyen = EPSILON_0 * epsilon_r;
        commun.g_diel = Green::spectral(move |be| green_spectral_micro_couvert(be, h, c_diel, epsilon_r));
        commun.g_vide = Green::spectral(move |be| green_spectral_micro_couvert(be, h, c_diel, 1.0));
        commun.echelles = vec![h, c_diel];
    } else {
        // Le milieu moyen d'un microruban nu : moitie air, moitie stratifie.
        // C'est ce que dit l'asymptote, pas une convention.
        commun.eps_moyen = EPSILON_0 * (1.0 + epsilon_r) / 2.0;
        commun.g_diel = Green::spectral(move |be| green_spectral_micro(be, h, epsilon_r));
        commun.g_vide = Green::spectral(move |be| green_spectral_micro(be, h, 1.0));
        commun.echelles = vec![h];
    }
    commun.flancs = Some(if masque_epaisseur > 0.0 {
        _part_des_flancs(epsilon_r, t, masque_epaisseur, masque_epsilon)
    } else {
        _part_des_flancs(epsilon_r, t, c_diel, epsilon_r)
    });
    Ok(commun)
}

/// La part de l'elargissement qui vaut pour le calcul AVEC dielectrique.
///
/// LES FLANCS D'UNE PISTE EXTERIEURE SONT DANS L'AIR. Le ruban mince elargi
/// qui remplace le cuivre epais n'a donc pas la meme largeur avec et sans
/// dielectrique : Hammerstad et Jensen (« Accurate Models for Microstrip
/// Computer-Aided Design », IEEE MTT-S Digest 1980, eq. 6-7) elargissent de
/// du1 dans l'air et de
///
///     dur = du1 (1 + 1/cosh racine(er - 1)) / 2
///
/// avec le dielectrique, puis  Z0 = Z01(ur) / racine(eps(ur))  et
/// eps_eff = eps(ur) [Z01(u1) / Z01(ur)]^2. La meme largeur des deux cotes
/// -- ce que le module faisait -- mettait les flancs dans le stratifie :
/// eps_eff MONTAIT avec l'epaisseur au lieu de baisser, +5 % a 35 um sur
/// 0,3 / 0,2 mm, +17 % a 210 um, soit +2,5 a +8 % de retard (constat 30).
///
/// `dessus`, `epsilon_dessus` : l'epaisseur et la permittivite du
/// dielectrique AU-DESSUS du ruban (vernis ou couverture). Sans lui les
/// flancs sont dans l'air et c'est la formule ; epais devant le cuivre, ils
/// y sont noyes et c'est la meme formule avec le contraste er / er_dessus
/// -- 1 exactement sous une couverture du meme stratifie, ce que le module
/// a toujours fait.
/// shortcut: entre les deux, interpolation en dessus / (dessus + t), sans
/// source publiee -- verifiee sur differences finies pour un vernis conforme
/// de 25 um a er 3,8 et une couverture de 0,2-0,3 mm seulement (banc :
/// eps_eff a 1 %) ; a reprendre par un solveur a cuivre epais si un autre
/// vernis doit tenir mieux.
pub fn _part_des_flancs(epsilon_r: f64, epaisseur: f64, dessus: f64, epsilon_dessus: f64) -> f64 {
    let part = |contraste: f64| 0.5 * (1.0 + 1.0 / (contraste - 1.0).max(0.0).sqrt().cosh());
    let nu = part(epsilon_r);
    if !(dessus > 0.0 && epaisseur > 0.0) {
        return nu;
    }
    let noye = part(epsilon_r / epsilon_dessus.max(1.0));
    nu + (noye - nu) * dessus / (dessus + epaisseur)
}

/// L'épaisseur du cuivre, ramenée à une largeur.
///
/// La méthode traite un ruban d'épaisseur nulle. Un ruban épais porte plus de
/// charge sur ses flancs : il se comporte comme un ruban mince un peu plus
/// large. C'est l'élargissement DANS L'AIR de Hammerstad-Jensen 1980, celui
/// de `_z_air_microruban` :
///
///     dw = (t/pi) ln(1 + 4e h / (t coth^2 racine(6,517 w/h)))
///
/// Sur du 35 µm sous 0,2 mm de diélectrique il vaut une dizaine de pour cent
/// de largeur, soit quelques pour cent d'impédance — pas de quoi l'ignorer.
/// Avant le constat 30 c'était la forme de Wheeler pour ruban large,
/// (t/pi)(1 + ln(2h/t)), plus courte de (t/pi) ln 2 : la capacité dans l'air
/// en sortait 1,5 % trop basse, ce que les flancs comptés dans le stratifié
/// compensaient sur Z0 -- et pas sur eps_eff. Avec le diélectrique, la part
/// à retenir est `_part_des_flancs`.
pub fn _largeur_effective(largeur: f64, epaisseur: f64, distance_plan: f64) -> f64 {
    if !(epaisseur > 0.0) || !(distance_plan > 0.0) || !(largeur > 0.0) {
        return largeur;
    }
    let cth = 1.0 / (6.517 * largeur / distance_plan).sqrt().tanh();
    largeur
        + (epaisseur / std::f64::consts::PI)
            * (1.0 + 4.0 * std::f64::consts::E * distance_plan / (epaisseur * cth * cth)).ln()
}

// FLANCS EN REGARD : LA LIMITE DE L'ELARGISSEMENT. Un ruban mince elargi rend
// la charge qu'un flanc envoie au plan ; il ne rend pas le condensateur que
// deux flancs de cuivre font face a face, dans l'air, a travers un ecart.
// Contre differences finies 2D (banc, « cuivre epais »), des que l'ecart passe
// sous six epaisseurs : Z0 d'une coplanaire +3 a +7 %, Z differentielle +1 a
// +4 %, Z commune -1 a -2,5 % ; eps_eff tient, a 2 % (paire) et 5 %
// (coplanaire). Sous vernis l'ecart etait deja la (+4 a +7 % en coplanaire,
// +2 a +3 % en differentiel) ; sur piste nue, les flancs comptes dans le
// stratifie le masquaient sur Z0 -- et le payaient sur eps_eff, +12 a +19 %.
// shortcut: ni terme de flanc ni cuivre epais dans la matrice -- les formules
// publiees (Jansen 1978, coplanaire de Gupta) ne tiennent pas mieux ici ; a
// remplacer par des panneaux sur les flancs (une Green hors de l'interface)
// si ces ecarts doivent tenir a 1 %. D'ici la, `flancs_en_regard` le signale.
pub const FLANCS_EN_REGARD: f64 = 6.0;

/// Vrai si du cuivre epais fait face a du cuivre a moins de
/// FLANCS_EN_REGARD epaisseurs, sur un microruban (`ecarts` de cuivre a
/// cuivre, en metres ; nul ou absent : rien de ce cote).
///
/// `flancs` : la cle « flancs » du milieu (absente en triplaque et sans plan).
pub fn _flancs_en_regard(flancs: Option<f64>, epaisseur: f64, ecarts: &[f64]) -> bool {
    flancs.is_some() && epaisseur > 0.0 && ecarts.iter().any(|&e| 0.0 < e && e < FLANCS_EN_REGARD * epaisseur)
}

/// L'elargissement du milieu `m` : le sien (triplaque), sinon celui du
/// microruban dans l'air.
pub fn _elargir(m: &Milieu, w: f64, ep: f64) -> f64 {
    match m.b_eq {
        Some(b_eq) => w + _elargissement_triplaque(w, ep, b_eq),
        None => _largeur_effective(w, ep, m.distance),
    }
}

/// L'elargissement du cuivre epais, offert a qui pose une section.
///
/// C'EST LA MEME FONCTION QUE `_largeur_effective`, et elle est publique parce
/// qu'un appelant qui POSE des conducteurs doit pouvoir savoir, AVANT de les
/// poser, de combien le cuivre epais va les elargir. Sans cela il les pose a
/// un ecart nu qui parait suffisant, et c'est `_conducteurs_places` qui refuse
/// la section entiere -- un refus qu'il ne pouvait pas prevoir.
///
/// `ecart_plans` non nul (l'ecart b d'une triplaque) donne l'elargissement
/// de la triplaque, celui que `_milieu` applique : sur l'ecart equivalent
/// 2 x `distance_plan`, la hauteur au plan le plus proche.
pub fn largeur_effective(largeur: f64, epaisseur: f64, distance_plan: f64, ecart_plans: f64) -> f64 {
    if ecart_plans > 0.0 {
        return largeur + _elargissement_triplaque(largeur, epaisseur, ecart_plans.min(2.0 * distance_plan));
    }
    _largeur_effective(largeur, epaisseur, distance_plan)
}

/// L'ecart a la masse coplanaire que le calcul retient, `marge` deduite.
///
/// UN ECART SERRE RESTE UNE MASSE, BORNEE AU SEUIL (2.11.0). Jusque-la un
/// ecart qui passait sous le seuil -- l'epaisseur du cuivre, une fois
/// l'elargissement de Wheeler deduit -- valait zero, « pas de masse de ce
/// cote » : la piste la plus serree devenait un microruban nu, l'impedance
/// la plus HAUTE, alors que la limite physique est une impedance qui BAISSE.
/// Sur 0,3 mm / 35 um / h 1,6 mm : 48,65 ohms a 66,7 um d'ecart, 125,55 a
/// 64,7 um (volumes finis a 60 um : 46,9). Zero ou absent veut toujours dire
/// « pas de masse de ce cote ».
/// shortcut: sous le seuil l'ecart est FIGE a l'epaisseur, Z0 ne baisse plus
/// (+1 a +8 % contre volumes finis) ; a remplacer par un terme de flanc en
/// eps0 t / ecart si ces ecarts doivent tenir mieux.
pub fn _ecart_retenu(valeur: f64, marge: f64, seuil: f64) -> f64 {
    let v = valeur;
    if !(v > 0.0) {
        return 0.0;
    }
    (v - marge).max(seuil)
}

/// Ce que `solve_line` rend : Z₀ en ohms, C et C₀ en F/m.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct Ligne {
    pub z0: f64,
    pub eps_eff: f64,
    pub c: f64,
    pub c0: f64,
    pub couvert: bool,
    pub coplanaire: bool,
    pub ecart: f64,
    pub ecart_g: f64,
    pub ecart_d: f64,
    pub cotes: usize,
    // Du cuivre epais face a la masse coplanaire, de pres : Z0 sort trop
    // haute. Voir FLANCS_EN_REGARD.
    pub flancs_en_regard: bool,
    // LOT 2 : signaler le masque
    #[serde(skip_serializing_if = "Option::is_none")]
    pub masque: Option<Masque>,
}

/// Les deux ecarts a la masse coplanaire tels que la geometrie les donne : « ecart » vaut LES
/// DEUX COTES quand ni l'un ni l'autre n'est donne ; un seul donne, l'autre vaut zero.
pub(crate) fn ecarts_donnes(geometry: &Geometrie) -> (f64, f64) {
    match (geometry.ecart_g, geometry.ecart_d) {
        (None, None) => (geometry.ecart, geometry.ecart),
        (g, d) => (g.unwrap_or(0.0), d.unwrap_or(0.0)),
    }
}

/// `solve_line(geometry)` avec les 120 panneaux et les 300 points de quadrature par defaut.
pub fn solve_line(geometry: &Geometrie) -> Res<Ligne> {
    solve_line_avec(geometry, N_PANNEAUX, N_QUADRATURE)
}

/// Résout la section et rend l'impédance quasi-statique de la ligne.
///
/// `geometry` décrit la section, en MÈTRES :
///     kind        "micro" ou "strip"
///     w           largeur du ruban
///     t           épaisseur du cuivre
///     h           microruban : hauteur au plan de référence
///     couverture  microruban : diélectrique AU-DESSUS du ruban. Zéro pour une
///                 piste de couche extérieure, qui n'a que de l'air ; non nul
///                 pour une piste interne qui n'a de plan que d'un côté, et
///                 c'est là que ça compte
///     masque      microruban : masque de soudure AU-DESSUS du cuivre. Deux cas :
///                 - couche extérieure avec masque : epsilon_r et épaisseur du vernis
///                 - couche intérieure : 0 (pas de masque)
///     b           triplaque : écart entre les deux plans
///     y0          triplaque : hauteur du ruban au-dessus du plan bas
///     epsilon_r   permittivité du diélectrique
///
/// Rend {z0, eps_eff, c, c0, couvert, masque, ecart_g, ecart_d, cotes,
/// flancs_en_regard} — Z₀ en ohms, C et C₀ en F/m.
pub fn solve_line_avec(geometry: &Geometrie, n: usize, n_quadrature: usize) -> Res<Ligne> {
    let m = _milieu(geometry)?;
    let t = geometry.t;
    let couvert = m.couvert;
    let distance = m.distance;
    let (eps_moyen, eps_vide) = (m.eps_moyen, m.eps_vide);
    let w_nue = geometry.w;
    let w = _elargir(&m, w_nue, t);

    if !(w > 0.0) {
        return refus("largeur de ruban nulle");
    }

    // LE CUIVRE DE MASSE SUR LA MÊME COUCHE, s'il y en a, ET CÔTÉ PAR CÔTÉ.
    // L'écart est mesuré de cuivre à cuivre ; c'est la largeur EFFECTIVE du
    // ruban qui borde le calcul, donc chaque écart se réduit d'autant que le
    // cuivre épais a élargi le ruban. Sous une épaisseur de cuivre, l'écart
    // est BORNÉ à cette épaisseur (`_ecart_retenu`, 2.11.0) : la masse reste
    // là, elle ne disparaît plus.
    //
    // « ecart » reste accepté et vaut LES DEUX CÔTÉS : c'est ce que veulent dire
    // les cas du banc d'essai écrits avant la 1.3.0, et une géométrie
    // symétrique n'a aucune raison de s'écrire deux fois.
    let (ecart_g, ecart_d) = ecarts_donnes(geometry);
    let seuil = t.max(1e-9);
    let en_regard = _flancs_en_regard(m.flancs, t, &[ecart_g, ecart_d]);

    let capacite = |largeur: f64, green: &Green, eps: f64| {
        let marge = (largeur - w_nue) / 2.0;
        capacitance_coplanaire(
            largeur, _ecart_retenu(ecart_g, marge, seuil), _ecart_retenu(ecart_d, marge, seuil), green, distance, eps, n,
            n_quadrature, &m.echelles, None, None,
        )
    };

    // DEUX LARGEURS, PAS UNE (constat 30, `_part_des_flancs`) : w dans l'air
    // pour C0, w_d avec le diélectrique, et Hammerstad-Jensen 1980 écrit en
    // capacités -- C = C(w_d) C0(w_d) / C0(w). Un calcul de plus quand le
    // cuivre est épais et les flancs dans l'air ; aucun sinon (triplaque,
    // cuivre mince), où w_d = w et C = C(w) comme avant.
    let c0 = capacite(w, &m.g_vide, eps_vide)?;
    let w_d = w_nue + m.flancs.unwrap_or(1.0) * (w - w_nue);
    let mut c = capacite(w_d, &m.g_diel, eps_moyen)?;
    if w_d < w {
        c *= capacite(w_d, &m.g_vide, eps_vide)? / c0;
    }
    if !(c > 0.0 && c0 > 0.0) {
        return refus("capacité non physique : géométrie incohérente");
    }
    // Les ecarts RENDUS sont ceux du ruban le plus large, celui de l'air.
    let ecart_g = _ecart_retenu(ecart_g, (w - w_nue) / 2.0, seuil);
    let ecart_d = _ecart_retenu(ecart_d, (w - w_nue) / 2.0, seuil);

    // « ecart » en sortie est le côté LE PLUS SERRÉ de ceux qui portent de la
    // masse : c'est celui qui commande, et c'est ce que le champ « Écart » du
    // tableau des tronçons a toujours montré. `cotes` dit combien de côtés en
    // portent — un seul, et le calcul n'est plus celui d'une coplanaire
    // ordinaire, ce qui vaut d'être écrit quelque part.
    let positifs: Vec<f64> = [ecart_g, ecart_d].into_iter().filter(|&e| e > 0.0).collect();
    Ok(Ligne {
        z0: 1.0 / (C_0 * (c * c0).sqrt()),
        eps_eff: c / c0,
        c,
        c0,
        couvert,
        coplanaire: !positifs.is_empty(),
        ecart: if positifs.is_empty() { 0.0 } else { positifs.iter().copied().fold(f64::INFINITY, f64::min) },
        ecart_g,
        ecart_d,
        cotes: positifs.len(),
        flancs_en_regard: en_regard,
        masque: m.masque,
    })
}
