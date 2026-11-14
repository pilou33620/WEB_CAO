//! Un fichier .ibs ou .ami -> le JSON de tout ce que le module en extrait, une ligne par fichier
//! (« nom <tab> JSON »). C'est l'outil de la comparaison a l'octet contre python/ibis.py : le
//! script Python jumeau ecrit les memes lignes.
//!
//!     ibis_json fichier.ibs fichier.ami ...
//!
//! Un refus s'ecrit {"erreur", "conseil"} ; la ou Python plantait (une exception qui n'est pas
//! ErreurIbis), {"plantage": le nom de l'exception}.

use std::io::Write;

use ibis::{dumps, ErreurIbis, Json, Objet};

fn objet<const N: usize>(cles: [(&str, Json); N]) -> Json {
    Json::Objet(cles.into_iter().map(|(k, v)| (k.to_string(), v)).collect())
}

fn refus(e: &ErreurIbis) -> Json {
    match e.message.strip_prefix("Lecture IBIS interrompue (").and_then(|m| m.split_once(')')) {
        Some((genre, _)) => objet([("plantage", genre.into())]),
        None => objet([("erreur", e.message.as_str().into()), ("conseil", e.conseil.as_str().into())]),
    }
}

fn ou<T>(r: Result<T, ErreurIbis>, f: impl Fn(&T) -> Json) -> Json {
    match &r {
        Ok(v) => f(v),
        Err(e) => refus(e),
    }
}

fn ibs(texte: &str, nom: &str) -> Json {
    let mut o = Objet::new();
    o.insert("simple".into(), ou(ibis::lire(texte, nom, false), ibis::Lu::json));
    let lu = match ibis::lire(texte, nom, true) {
        Ok(lu) => lu,
        Err(e) => {
            o.insert("complet".into(), refus(&e));
            return Json::Objet(o);
        }
    };
    o.insert("complet".into(), lu.json());
    o.insert("resume".into(), ibis::resume(&lu));
    o.insert("moyen".into(), ibis::boitier_broche(&lu, "", "typ", None).json());
    let mut broches = Objet::new();
    for b in &lu.ordre_broches {
        let mut x = Objet::new();
        x.insert(
            "modele".into(),
            ou(ibis::modele_broche(&lu, b, ""), |(n, note)| Json::Liste(vec![n.as_str().into(), note.as_str().into()])),
        );
        let paire = ibis::paire_diff(&lu, b);
        let inverse = paire.as_ref().map(|p| p.inverse.clone());
        x.insert("paire".into(), paire.as_ref().map_or(Json::Nul, ibis::PaireDiff::json));
        for coin in ["typ", "min", "max"] {
            x.insert(coin.into(), ibis::boitier_broche(&lu, b, coin, inverse.as_deref()).json());
        }
        let mut victimes = vec![b.as_str()];
        if let Some(i) = &inverse {
            x.insert("mutuelle".into(), ibis::mutuelle_paire(&lu, b, i).map_or(Json::Nul, |m| m.json()));
            victimes.push(i);
        }
        x.insert("voisins".into(), ibis::voisins_boitier(&lu, &victimes).map_or(Json::Nul, |c| c.json()));
        broches.insert(b.clone(), Json::Objet(x));
    }
    o.insert("broches".into(), Json::Objet(broches));
    let mut tampons = Objet::new();
    for (nom, m) in &lu.modeles {
        let mut x = Objet::new();
        x.insert("emetteur".into(), ibis::est_emetteur(m).into());
        for coin in ["typ", "min", "max"] {
            let j = ou(ibis::Tampon::new(m, coin), |t| {
                let paire = |(a, b): (f64, f64)| Json::Liste(vec![a.into(), b.into()]);
                objet([
                    ("v", Json::Liste(vec![t.v_pu.into(), t.v_pd.into(), t.v_pc.into(), t.v_gc.into()])),
                    ("c_comp", t.c_comp.into()),
                    ("g", paire((t.g_gnd, t.g_pow))),
                    ("vin", Json::Liste(vec![t.vinl.map_or(Json::Nul, Json::Flottant), t.vinh.map_or(Json::Nul, Json::Flottant)])),
                    ("diodes", t.a_des_diodes().into()),
                    ("haut", t.niveau(1.0, 0.0, None, 0.0).into()),
                    ("bas", t.niveau(0.0, 1.0, Some(50.0), 0.5).into()),
                    ("i", Json::Liste([-1.0, 0.3, 1.7, 4.0].iter().map(|v| paire(t.i_total(*v, 0.7, 0.2))).collect())),
                ])
            });
            x.insert(coin.into(), j);
        }
        tampons.insert(nom.clone(), Json::Objet(x));
    }
    o.insert("tampons".into(), Json::Objet(tampons));
    Json::Objet(o)
}

fn ami(texte: &str, nom: &str) -> Json {
    let mut o = Objet::new();
    o.insert("out".into(), Json::Objet(ibis::lire_parametres_ami(texte)));
    let a = match ibis::lire_ami(texte, nom) {
        Ok(a) => a,
        Err(e) => {
            o.insert("ami".into(), refus(&e));
            return Json::Objet(o);
        }
    };
    o.insert("ami".into(), a.json());
    o.insert("prop_tx".into(), ou(ibis::proposer_egaliseur(Some(&a), None, 10e9), ibis::Proposition::json));
    o.insert("prop_rx".into(), ou(ibis::proposer_egaliseur(None, Some(&a), 10e9), ibis::Proposition::json));
    o.insert("prop".into(), ou(ibis::proposer_egaliseur(Some(&a), Some(&a), 1e9), ibis::Proposition::json));
    let rendu = |r: &(String, Vec<String>, Vec<String>)| {
        let liste = |v: &[String]| Json::Liste(v.iter().map(|x| x.as_str().into()).collect());
        Json::Liste(vec![r.0.as_str().into(), liste(&r.1), liste(&r.2)])
    };
    o.insert("in".into(), ou(ibis::parametres_ami_in(Some(&a), None, None), rendu));
    let mut sur = Objet::new();
    if let Some(p) = a.parametres.last() {
        sur.insert(p.nom.clone(), Json::Flottant(-0.2));
    }
    if let Some(p) = a.parametres.first() {
        sur.insert(format!("/{}/", p.chemin), Json::Entier(3));
    }
    sur.insert("zz".into(), Json::Entier(1));
    sur.insert("c0".into(), Json::Bool(true));
    sur.insert("c1".into(), "a \"b\"".into());
    o.insert("in2".into(), ou(ibis::parametres_ami_in(Some(&a), Some(&sur), Some("racine")), rendu));
    let reserves = a.reserves.keys().map(|k| (k.clone(), ibis::reserve_ami(Some(&a), k, Json::Nul)));
    o.insert("reserves".into(), Json::Objet(reserves.collect()));
    Json::Objet(o)
}

fn main() {
    let sortie = std::io::stdout();
    let mut sortie = std::io::BufWriter::new(sortie.lock());
    for chemin in std::env::args().skip(1) {
        let octets = match std::fs::read(&chemin) {
            Ok(o) => o,
            Err(e) => {
                eprintln!("{chemin} : {e}");
                std::process::exit(1);
            }
        };
        let texte = String::from_utf8_lossy(&octets);
        let nom = chemin.rsplit('/').next().unwrap_or(&chemin);
        let j = if nom.to_lowercase().ends_with(".ami") { ami(&texte, nom) } else { ibs(&texte, nom) };
        if writeln!(sortie, "{}\t{}", nom, dumps(&j)).is_err() {
            break;
        }
    }
}
