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
