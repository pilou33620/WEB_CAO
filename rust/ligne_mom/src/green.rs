// ==========================================================================
// Les trois fonctions de Green, dérivées exactement
// --------------------------------------------------------------------------
// On résout Laplace dans le domaine spectral (transformée de Fourier selon x),
// avec les conditions aux limites de la géométrie. Le résultat est fermé : ce
// sont les fonctions ci-dessous, et elles remplacent à elles seules tout le
// maillage du substrat et des plans.
// ==========================================================================

use crate::{refus, Res, EPSILON_0};

/// Microruban NU : substrat d'épaisseur h sur un plan, ruban à l'interface.
///
///     φ₁ = A sinh(βy)                 0 < y < h   (nul au plan de masse)
///     φ₂ = A sinh(βh) e^(-β(y-h))     y > h
///     saut de Dₙ en y = h  ->  A = σ / (ε₀ β [sinh(βh) + εr cosh(βh)])
///
/// d'où G = tanh(βh) / (ε₀ β [tanh(βh) + εr]).
///
/// Elle est FINIE en β=0 (h/(ε₀εr)) : c'est le plan de masse qui borne le
/// problème. Un fil en l'air, lui, y diverge — et c'est toute la différence.
///
/// C'est le cas `couverture = 0` de `green_spectral_micro_couvert`, gardé à
/// part parce que c'est le cas courant — une piste de couche extérieure — et
/// parce qu'il sert d'étalon de réduction à la forme générale.
pub fn green_spectral_micro(beta: f64, h: f64, epsilon_r: f64) -> f64 {
    let bh = (beta * h).clamp(0.0, 700.0);
    let th = bh.tanh();
    th / (EPSILON_0 * beta * (th + epsilon_r))
}

/// Microruban COUVERT : ruban en y=h, stratifié de 0 à h+c, air au-dessus.
///
/// C'EST LE CAS D'UNE PISTE INTERNE qui n'a de plan que d'un côté — un
/// six couches où la couche 3 regarde le plan 2 et n'a rien sous elle. Le
/// modèle nu la traiterait comme si elle affleurait, avec de l'air par-dessus.
/// Il y a du stratifié : ε_eff est plus haute, Z₀ plus basse, et l'écart passe
/// la dizaine de pour cent — il ne s'agit pas d'un raffinement.
///
/// Trois régions, même εr de 0 à H = h + c, air ensuite :
///
///     φ₁ = A sinh(βy)                            0 < y < h
///     φ₂ = P [cosh(β(H-y)) + sinh(β(H-y))/εr]    h < y < H
///     φ₃ = P e^(-β(y-H))                         y > H
///
/// La forme de φ₂ tombe directement de la continuité de φ et de Dₙ en y=H.
/// Le saut de Dₙ en y=h ferme le système, et tout se simplifie :
///
///     G = -expm1(-2βh) (p + m e^(-2βc))
///         ----------------------------------------
///         2 ε₀ εr β (p + m e^(-2β(h+c)))
///
/// avec p = 1 + 1/εr et m = 1 - 1/εr.
///
/// Écrite ainsi elle ne déborde jamais — tous les exponentielles ont un
/// argument négatif — et `expm1` tient la précision en β → 0, où le numérateur
/// et le dénominateur s'annulent tous les deux (G → h/(ε₀εr), comme le
/// microruban nu : c'est le même plan de masse qui borne le problème).
///
/// Les deux réductions, qui sont les deux cas connus :
///   · c = 0    -> exactement `green_spectral_micro` ;
///   · c -> ∞   -> (1 - e^(-2βh)) / (2 ε₀ εr β), c'est-à-dire le ruban et son
///                 image dans le plan, noyés dans un milieu εr homogène.
///
/// ATTENTION À L'ASYMPTOTE, parce qu'elle commande l'extraction : dès que
/// c > 0, G ~ 1/(2 ε₀ εr β) en β grand — le ruban a du diélectrique des DEUX
/// côtés. Le microruban nu, lui, tend vers 1/(ε₀ β (1+εr)). Le milieu moyen à
/// extraire n'est donc pas le même, et `solve_line` en tient compte.
pub fn green_spectral_micro_couvert(beta: f64, h: f64, couverture: f64, epsilon_r: f64) -> f64 {
    let p = 1.0 + 1.0 / epsilon_r;
    let m = 1.0 - 1.0 / epsilon_r;
    let a = (2.0 * beta * h).clamp(0.0, 700.0);
    let b = (2.0 * beta * couverture).clamp(0.0, 700.0);
    let num = -(-a).exp_m1() * (p + m * (-b).exp());
    let den = 2.0 * EPSILON_0 * epsilon_r * beta * (p + m * (-(a + b)).exp());
    num / den
}

/// Microruban SOUS MASQUE : trois régions, εr différent au-dessus.
///
/// CAS D'UNE PISTE EXTÉRIEURE VERNIÉE. Le masque de soudure (vernis) a une
/// permittivité ~3,8, et son épaisseur (20-30 µm) n'est pas négligeable devant
/// la hauteur au plan (200-400 µm) à l'échelle du champ. Il remplit l'écart
/// coplanaire — là où le champ est le plus dense — et fait baisser Z₀ de 2-3 %.
///
/// Trois régions :
///     - substrat εr₁ de 0 à h
///     - masque εr₂ de h à h+c
///     - air au-dessus de h+c
///
/// La dérivation suit la même marche que `green_spectral_micro_couvert` :
/// continuité de φ et de Dₙ à chaque interface, résolution du système 3×3.
///
/// Formules (docs/HISTORIQUE_DEVELOPPEMENT.md, § 1 du lot 2) :
///     G = K / (ε₀ β (M + εr₁ K coth(βh)))
///     K = ch(βc) + sh(βc)/εr₂
///     M = εr₂ sh(βc) + ch(βc)
///
/// Réductions exactes :
///     · c = 0        -> microruban nu (K=1, M=εr₂, G = 1/(ε₀ β (1+εr₁)))
///     · εr₂ = εr₁    -> microruban couvert (K = exp(βc), M = εr₁ exp(βc),
///                       G = 1/(ε₀ β (εr₁+1)) = microruban nu ?)
///
/// L'asymptote en β grand : G ~ 1/(2 ε₀ εr₁ β) quand le champ est piégé dans
/// le diélectrique des deux côtés. Le milieu moyen à extraire est εr₁ (substrat),
/// pas une moyenne avec le masque.
pub fn green_spectral_micro_masque(beta: f64, h: f64, masque_epaisseur: f64, epsilon_r: f64, epsilon_masque: f64) -> f64 {
    let c = masque_epaisseur;
    let er_m = epsilon_masque;
    let er_s = epsilon_r;

    if c <= 0.0 {
        // Pas de masque : microruban nu
        return green_spectral_micro(beta, h, er_s);
    }

    let bc = (beta * c).clamp(0.0, 700.0);
    let bh = (beta * h).clamp(0.0, 700.0);

    let ch_bc = bc.cosh();
    let sh_bc = bc.sinh();
    let th_h = bh.tanh().max(1e-30);

    // K = ch + sh/εr_m, M = εr_m sh + ch
    let k = ch_bc + sh_bc / er_m;
    let m = er_m * sh_bc + ch_bc;

    // G = K / (ε₀ β (M + εr₁ K coth(βh)))
    let mut denominateur = EPSILON_0 * beta * (m + er_s * k / th_h);

    // Protection contre la division par zéro
    if denominateur.abs() < 1e-30 {
        denominateur = 1e-30;
    }

    k / denominateur
}

/// Triplaque : ruban en y₀, entre deux plans en y=0 et y=b.
///
///     G = sinh(βy₀) sinh(β(b-y₀)) / (ε₀ εr β sinh(βb))
///
/// Le milieu est homogène ici — le ruban est noyé —, d'où le εr au
/// dénominateur plutôt qu'un jeu d'interfaces. En β grand elle tend vers
/// 1/(2 ε₀ εr β), la même singularité que le microruban avec ε = ε₀εr.
pub fn green_spectral_strip(beta: f64, y0: f64, b: f64, epsilon_r: f64) -> f64 {
    let b1 = beta * y0;
    let b2 = beta * (b - y0);
    // sinh(b1) sinh(b2) / sinh(b1+b2), ÉCRIT SANS AUCUNE EXPONENTIELLE
    // CROISSANTE. Avec sinh(a) = e^a (1 - e^-2a) / 2, les e^(b1+b2) du
    // numérateur et du dénominateur s'annulent EXACTEMENT :
    //     rapport = (1 - e^-2b1)(1 - e^-2b2) / (2 (1 - e^-2(b1+b2)))
    // Tous les termes sont dans [0, 1] : rien ne peut déborder, à aucun β, et
    // `expm1` garde la précision quand l'argument est petit. L'ancienne
    // écriture calculait sinh(b1) sinh(b2) PARTOUT puis remplaçait par 1/2 au-
    // delà de βb = 350 -- mais `np.where` évalue ses deux branches, et le
    // produit débordait en inf avant d'être jeté, avec un RuntimeWarning à
    // chaque section triplaque.
    let rapport = (-2.0 * b1).exp_m1() * (-2.0 * b2).exp_m1() / (-2.0 * (-2.0 * (b1 + b2)).exp_m1());
    rapport / (EPSILON_0 * epsilon_r * beta)
}

/// Ruban entre DEUX EMPILEMENTS de dielectriques differents (2.10.0).
///
/// `dessous` et `dessus` : [(er, epaisseur en m), ...] du ruban vers
/// l'exterieur. `dessous` finit sur un plan ; `dessus` finit sur un plan
/// (`plan_dessus`, la triplaque) ou dans l'air (microruban nu, couvert,
/// verni) -- vide, c'est l'air tout de suite.
///
/// C'est Laplace spectral, exact comme les autres : dans chaque couche phi
/// est en sh / ch(beta y), et le rapport D_n / (eps0 beta phi) -- une
/// admittance normalisee Y -- se transporte de l'exterieur vers le ruban
/// comme une impedance le long d'une ligne :
///
///     sur un plan        Y = er coth(beta e)
///     vers l'air         Y = er (1 + er th) / (er + th)      th = th(beta e)
///     couche suivante    Y = er (Y_ext + er th) / (er + Y_ext th)
///
/// et le saut de D_n au ruban donne G = 1 / (eps0 beta (Y_dessous + Y_dessus)).
/// Une seule couche de chaque cote redonne `green_spectral_micro`,
/// `_couvert`, `_masque` et `_strip` -- le banc le verifie.
///
/// POURQUOI ELLE EXISTE : deux dielectriques differents etaient ramenes a UN
/// er, moyenne a l'epaisseur. Or le champ est du cote du plan PROCHE, donc
/// du dielectrique mince : un prepreg de 0,1 mm a er 3,6 sous une ame de
/// 1,0 mm a 4,6 sortait eps_eff = 4,51 pour 3,92, Z0 a -6,7 %.
///
/// Les couches sont des couples (er, epaisseur).
pub fn green_spectral_multicouche(beta: f64, dessous: &[(f64, f64)], dessus: &[(f64, f64)], plan_dessus: bool) -> f64 {
    let admittance = |couches: &[(f64, f64)], plan: bool| -> f64 {
        if couches.is_empty() {
            return 1.0; // l'air, tout de suite
        }
        let mut y: Option<f64> = None;
        for &(er, ep) in couches.iter().rev() {
            let th = (beta * ep).clamp(0.0, 350.0).tanh();
            y = Some(match y {
                None if plan => er / th.max(1e-300),
                None => er * (1.0 + er * th) / (er + th),
                Some(y) => er * (y + er * th) / (er + y * th),
            });
        }
        y.unwrap_or(1.0)
    };

    1.0 / (EPSILON_0 * beta * (admittance(dessous, true) + admittance(dessus, plan_dessus)))
}

// ==========================================================================
// SANS PLAN : le stratifie seul, de l'air des deux cotes
// --------------------------------------------------------------------------
// UNE CARTE DEUX COUCHES SANS PLAN n'est pas une carte sans reference : le
// retour passe par le cuivre de masse ARROSE SUR LA MEME COUCHE, de part et
// d'autre des pistes -- c'est une ligne coplanaire sans plan dessous. Il n'y a
// alors rien sous le stratifie, et la fonction de Green est celle d'une charge
// posee sur une plaque de dielectrique d'epaisseur h, dans l'air :
//
//     G(beta) = 1 / (eps0 beta [1 + er (1 + er.t)/(er + t)])     t = th(beta h)
//
// ELLE SE DEVELOPPE EN IMAGES, ET LA SERIE EST EXACTE. Avec e = exp(-2 beta h)
// et K = (er - 1)/(er + 1), le crochet se reecrit
//
//     G = [1 + sum_n (1+K).K^(2n-1).e^n] / (eps0 (er+1) beta)
//
// et chaque e^n / beta a une transformee spatiale connue : une ligne de charge
// image a 2nh SOUS la face, de meme signe, de poids (1+K).K^(2n-1). Le noyau
// spatial est donc une somme de logarithmes, et chaque panneau s'integre EN
// FORME FERMEE -- ni quadrature spectrale, ni terme extrait : la matrice est
// exacte a la troncature de la serie pres, qui decroit en K^2n.
//
// LA CHARGE TOTALE EST NULLE, ET C'EST CE QUI DEFINIT LA REFERENCE. Sans plan,
// le potentiel d'une charge de ligne croit comme ln(r) jusqu'a l'infini : il
// n'a de sens que si la section entiere est NEUTRE -- tout ce que porte le
// signal revient par la masse. On ajoute donc une inconnue, le potentiel V0
// de l'infini, et une equation, la somme des charges nulle. C'est ce qui rend
// la masse coplanaire OBLIGATOIRE : sans elle, rien ne porte le retour et la
// matrice de capacite n'a pas de reference -- `capacitance_matrice` refuse.
// ==========================================================================

/// Le noyau d'une plaque de dielectrique sans plan, en images.
///
/// Ce n'est pas une fonction de beta comme les autres noyaux : `_matrice` le
/// reconnait et lui demande directement la matrice des potentiels, qu'il
/// sait ecrire en forme fermee.
#[derive(Debug, Clone, PartialEq)]
pub struct NoyauSansPlan {
    pub h: f64,
    pub epsilon_r: f64,
    /// (profondeur 2nh, poids) de chaque image
    pub images: Vec<(f64, f64)>,
}

impl NoyauSansPlan {
    // La serie s'arrete quand le poids de l'image passe sous ce seuil : a
    // er = 10, K^2 = 0,67 et il faut une soixantaine d'images ; a er = 4,3,
    // une trentaine.
    pub const SEUIL_IMAGES: f64 = 1e-12;

    pub fn new(h: f64, epsilon_r: f64) -> Res<Self> {
        if !(h > 0.0) {
            return refus("sans plan : epaisseur de stratifie nulle");
        }
        let k = (epsilon_r - 1.0) / (epsilon_r + 1.0);
        let mut poids = Vec::new();
        let mut n = 1;
        while k > 0.0 && n < 2000 {
            let c = (1.0 + k) * k.powf((2 * n - 1) as f64);
            if c < Self::SEUIL_IMAGES {
                break;
            }
            poids.push((2.0 * n as f64 * h, c));
            n += 1;
        }
        Ok(NoyauSansPlan { h, epsilon_r, images: poids })
    }

    /// A[m,k] = potentiel au centre de m sous une densite unite sur k.
    pub fn matrice(&self, centres: &[f64], largeurs: &[f64]) -> faer::Mat<f64> {
        let p_log = |u: f64| {
            let au = u.abs();
            if au < 1e-300 {
                0.0
            } else {
                u - u * au.ln()
            }
        };
        // ∫ -ln(u²+a²)/2 du, le signe de la source : l'image est de MEME
        // signe que la charge, a l'inverse de celle d'un plan de masse.
        let p_image = |u: f64, a: f64| -(0.5 * u * (u * u + a * a).ln() - u + a * (u / a).atan());
        let facteur = std::f64::consts::PI * EPSILON_0 * (self.epsilon_r + 1.0);
        faer::Mat::from_fn(centres.len(), centres.len(), |m, k| {
            let d = centres[m] - centres[k];
            let lo = d - largeurs[k] / 2.0;
            let hi = d + largeurs[k] / 2.0;
            let mut total = p_log(hi) - p_log(lo);
            for &(a, c) in &self.images {
                total += c * (p_image(hi, a) - p_image(lo, a));
            }
            total / facteur
        })
    }
}

/// Le noyau que `_matrice` recoit : une fonction de beta (Laplace spectral), ou la plaque sans
/// plan, qui sait ecrire sa matrice en forme fermee. En Python, un appelable ou un
/// `NoyauSansPlan`, que `_sans_plan` distinguait par `isinstance`.
pub enum Green {
    Spectral(Box<dyn Fn(f64) -> f64 + Send + Sync>),
    SansPlan(NoyauSansPlan),
}

impl Green {
    pub fn spectral(f: impl Fn(f64) -> f64 + Send + Sync + 'static) -> Self {
        Green::Spectral(Box::new(f))
    }

    pub(crate) fn sans_plan(&self) -> bool {
        matches!(self, Green::SansPlan(_))
    }
}
