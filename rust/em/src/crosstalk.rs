// à porter (python/crosstalk.py)

use ipc2581::py::Json;

/// Ce qu'il faut pour resoudre deux couches de cuivre SUPERPOSEES.
///
/// Rend (h_i, h_j, b_mm, eps_r) -- les hauteurs de l'axe de chaque couche
/// au-dessus du plan de reference du dessous, l'ecart entre les deux plans
/// qui encadrent la paire (None s'il n'y en a qu'un), et la permittivite
/// moyenne entre eux --, ou None quand aucun plan ne les reference. MEME
/// LECTURE QUE `analyse_carte.diaphonie` (larges faces).
///
/// Signature posee par le portage de `simulation_em`, qui n'appelle `crosstalk` qu'ici
/// (`_brins_de_la_paire` : la partenaire d'une paire restee au-dessus ou au-dessous de la
/// piste). Les couches sont celles de `stackup.layers` ; `i` et `j` leurs indices.
pub fn geometrie_superposee(_couches: &[Json], _i: i64, _j: i64) -> Option<(f64, f64, Option<f64>, f64)> {
    todo!("à porter avec crosstalk")
}

/// (Kb, Kf) du couple (i, j), tires de [C] et [L] et de rien d'autre.
///
/// REND (0, 0) QUAND LA SECTION N'A PAS ETE RESOLUE -- les matrices sont
/// alors diagonales --, et ce zero-la n'est pas une mesure de decouplage. Le
/// distinguer est le travail de l'appelant : `mesure`, sur chaque bloc, et
/// `non_couples` sur l'ensemble, portent precisement cette difference.
///
/// Portee avec `simulation_em` parce que le banc uSimmics (tests/banc/usimmics.rs) en a
/// besoin ; le reste de crosstalk.py suit.
pub fn coefficients_couple(c_mat: &[Vec<f64>], l_mat: &[Vec<f64>], i: usize, j: usize) -> (f64, f64) {
    let (l0, lm) = (l_mat[i][i], l_mat[i][j]);
    // C0 EST LA DIAGONALE DE MAXWELL -- voir plus haut, et le banc qui le
    // verifie en triplaque a ecart serre.
    let cm = -c_mat[i][j];
    let c0 = c_mat[i][i];
    if !(l0 > 0.0) || !(c0 > 0.0) {
        return (0.0, 0.0);
    }
    let (rl, rc) = (lm / l0, cm / c0);
    (0.25 * (rc + rl), 0.5 * (rl - rc))
}
