//! Les fonctions des trois modules appelées par leur nom Python, arguments et résultat en JSON :
//! ce que lisent l'exécutable de comparaison (comparer_motifs) et les essais de non-régression.

use crate::lier_modeles_murata as murata;
use crate::pattern_recognition as motifs_schema;
use crate::pcb_scoring as scoring;
use crate::py::{textes, Json, Objet};

/// La fonction `fonction` appelée avec la liste d'arguments `a`.
pub fn appeler(fonction: &str, a: &Json) -> Result<Json, String> {
    let vide = Objet::new();
    let objet = |i: usize| a[i].as_objet().unwrap_or(&vide);
    let liste = |i: usize| a[i].as_liste().map_or(&[][..], Vec::as_slice);
    let texte = |i: usize| a[i].as_str().unwrap_or("");
    let nombre = |v: Option<f64>| v.map_or(Json::Nul, Json::Flottant);
    Ok(match fonction {
        "analyser_motifs_schema" => motifs_schema::analyser_motifs_schema(&a[0])?,
        "motifs_ipc2581" => crate::motifs_ipc2581(&a[0]).unwrap_or(Json::Nul),
        "identifier_alimentations" => Json::Liste(motifs_schema::identifier_alimentations(objet(0), objet(1))?),
        "identifier_bus_numeriques" => Json::Liste(motifs_schema::identifier_bus_numeriques(objet(0), objet(1))?),
        "identifier_oscillateurs" => Json::Liste(motifs_schema::identifier_oscillateurs(objet(0), objet(1))?),
        "identifier_filtres" => Json::Liste(motifs_schema::identifier_filtres(objet(0), objet(1))?),
        "estimer_courants_dc" => Json::Liste(motifs_schema::estimer_courants_dc(liste(0), objet(1), a[2].as_objet())?),
        "classer_nets" => {
            let (classes, raisons, paires) = motifs_schema::classer_nets(objet(0), objet(1), liste(2))?;
            Json::Liste(vec![Json::Objet(classes), Json::Objet(raisons), Json::Liste(paires)])
        }
        "_valeur_en_ohms" => nombre(motifs_schema::valeur_en_ohms(texte(0))),
        "_nets_masse" => textes(&motifs_schema::nets_masse(objet(0))),
        "evaluer_placement_pcb" => scoring::evaluer_placement_pcb(&a[0])?,
        "calculer_hpwl" => {
            let (total, par_net) = scoring::calculer_hpwl(liste(0))?;
            Json::Liste(vec![total.into(), Json::Objet(par_net)])
        }
        "top_contributeurs_hpwl" => Json::Liste(scoring::top_contributeurs_hpwl(liste(0), a[1].as_i64().unwrap_or(5) as usize)?),
        "analyser_congestion" => scoring::analyser_congestion(liste(0), a.at(1), a[2].as_f64().unwrap_or(5.0))?,
        "analyser_decouplage" => scoring::analyser_decouplage(liste(0), a[1].as_f64().unwrap_or(3.5))?,
        "ordonnancer_placement" => scoring::ordonnancer_placement(liste(0))?,
        "variantes" => textes(&murata::variantes(texte(0))),
        "cle_sans_tolerance" => murata::cle_sans_tolerance(texte(0)).map_or(Json::Nul, Json::Texte),
        "valeur_declaree" => nombre(murata::valeur_declaree(texte(0))),
        "valeur_reference" => nombre(murata::valeur_reference(texte(0))),
        "valeurs_discordantes" => murata::valeurs_discordantes(texte(0), texte(1)).into(),
        "champs_csv" => textes(&murata::champs_csv(texte(0))),
        "lignes" => textes(&murata::lignes_avec_fins(texte(0))),
        "format_g" => murata::format_g(a[0].as_f64().unwrap_or(0.0)).into(),
        // resoudre(référence, [noms des modèles présents])
        "resoudre" => {
            let noms = liste(1).iter().filter_map(Json::as_str).map(|n| (n.to_string(), Default::default())).collect();
            match murata::resoudre(texte(0), &murata::Index::de(noms)) {
                Some((modele, qualite)) => Json::Liste(vec![modele.into(), qualite.into()]),
                None => Json::Liste(vec![Json::Nul, Json::Nul]),
            }
        }
        // ipc2581(chemin, nom, tout_garder) : le modèle du lecteur IPC-2581, natures des nets comprises
        "ipc2581" => {
            let octets = std::fs::read(texte(0)).map_err(|e| e.to_string())?;
            ipc2581::ipc2581_en_dict_avec(&octets, texte(1), a[2].vrai(), Some(&crate::motifs_ipc2581)).map_err(|e| match e {
                ipc2581::Erreur::Parse(e) => e.to_string(),
                ipc2581::Erreur::Interne(e) => format!("EXCEPTION: {e}"),
            })?
        }
        _ => return Err(format!("fonction inconnue : {fonction}")),
    })
}
