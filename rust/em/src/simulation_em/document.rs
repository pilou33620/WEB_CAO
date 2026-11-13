// ==========================================================================
// Lecture du document
// ==========================================================================

use super::base::*;
use super::{ErreurSimulation, MAX_OBJETS, MAX_POINTS};

/// Verifie le document et rend (couches, objets, analyse).
pub fn doc_valide(doc: &Json) -> Result<(Vec<Json>, Vec<Json>, Json), ErreurSimulation> {
    if doc.as_objet().is_none() {
        return Err(ErreurSimulation::new("Le document envoyé n'est pas un objet JSON.", ""));
    }
    let formats_acceptes = ["cao-sim-em-1", "cao-sim-em-2", "cao-sim-em-3"];
    if !doc["format"].as_str().is_some_and(|f| formats_acceptes.contains(&f)) {
        return Err(ErreurSimulation::new(
            format!("Format inattendu : « {} » au lieu de « {} ».",
                    if doc["format"].vrai() { str_py(&doc["format"]) } else { "absent".into() },
                    formats_acceptes.join(" ou ")),
            ""));
    }

    if doc["stackup"].vrai() && doc["stackup"].as_objet().is_none() {
        return Err(ErreurSimulation::new("« stackup » doit être un objet.", ""));
    }
    let couches = els(&doc["stackup"]["layers"]).to_vec();
    if couches.is_empty() {
        return Err(ErreurSimulation::new(
            "Empilage vide : le solveur a besoin d'au moins un conducteur et\
             \x20un diélectrique.",
            "Complétez l'empilage dans la page avant de lancer le calcul."));
    }

    let objets = els(&doc["geometry"]["objects"]).to_vec();
    if objets.is_empty() {
        return Err(ErreurSimulation::new(
            "Aucun cuivre à analyser.",
            "Sélectionnez une piste sur la carte."));
    }
    if objets.len() > MAX_OBJETS {
        return Err(ErreurSimulation::new(
            format!("Trop de tronçons : {}, maximum {}.", objets.len(), MAX_OBJETS),
            "Restreignez la sélection."));
    }

    let a = &doc["analyse"];
    let (mut f1, mut f2) = (nb(&a["f_debut"]), nb(&a["f_fin"]));
    let mut points = nb(&a["points"]) as i64;
    if !(f1 > 0.0 && f2 > 0.0) {
        return Err(ErreurSimulation::new("Bande de fréquence absente ou nulle.", ""));
    }
    // Ce qui a ete ramene de force part avec le resultat : une valeur corrigee
    // en silence se lit comme une valeur acceptee, et l'utilisateur repart en
    // croyant avoir demande autre chose que ce qu'il a obtenu.
    let mut ajuste: Vec<String> = Vec::new();
    if f2 < f1 {
        std::mem::swap(&mut f1, &mut f2);
        ajuste.push("La bande était donnée à l'envers : elle a été remise\
                     \x20dans l'ordre.".into());
    }
    let demande = points;
    points = (if points != 0 { points } else { 1 }).min(MAX_POINTS as i64).max(1);
    if demande > MAX_POINTS as i64 {
        ajuste.push(format!("Bande S ramenée de {} à {} points, qui est le maximum.", demande, MAX_POINTS));
    }

    // La frequence centrale : celle a laquelle les impedances sont donnees et
    // la carte de chaleur peinte. Absente, on prend le milieu geometrique de la
    // bande -- une bande RF se lit en decades, pas en hertz.
    let mut fc = nb(&a["f_centre"]);
    if !(fc > 0.0) {
        fc = (f1 * f2).sqrt();
    }
    if !(f1 <= fc && fc <= f2) {
        if fc < f1 {
            f1 = fc;
            ajuste.push(format!("Début de bande S ajusté à {} GHz pour inclure la fréquence de travail.", fmt_g(f1 / 1e9, 4)));
        }
        if fc > f2 {
            f2 = fc;
            ajuste.push(format!("Fin de bande S ajustée à {} GHz pour inclure la fréquence de travail.", fmt_g(f2 / 1e9, 4)));
        }
    }

    // LE TEMPS DE MONTEE, s'il est saisi. Il ne touche a rien de la ligne --
    // ni impedance, ni cascade -- et ne sert qu'au couplage : c'est lui qui
    // decide si le NEXT sature et ce que vaut le FEXT. Absent, `_temps_montee`
    // le deduit du haut de la bande.
    let mut t_r = _nombre(&a["temps_montee"], 0.0);
    if t_r < 0.0 {
        t_r = 0.0;
        ajuste.push("Temps de montée négatif : ignoré, il est déduit de la\
                     \x20bande.".into());
    } else if fc > 0.0 && t_r > (0.5 / fc) {
        ajuste.push("Attention : le temps de montée (tr) dépasse une demi-période du signal.".into());
    }

    Ok((couches, objets, obj! {"f_debut" => f1, "f_fin" => f2, "points" => points,
                               "f_centre" => fc, "temps_montee" => t_r,
                               "ajuste" => ajuste}))
}
