//! Cas 52 de python/test/banc-serveur-routes.py : un appareil non appaire qui envoie un
//! jeton, un code ou un cookie non ASCII recoit une reponse, pas une connexion coupee.
//!
//! Seul dans son exécutable d'essai : « ce poste est un autre appareil » se règle par
//! l'environnement (WEB_TOOLS_BANC_DISTANT, lu une fois par la caisse commune), et le jeton
//! d'appairage s'écrit dans un dossier personnel d'essai.
#[path = "../bancs/commun.rs"]
mod commun;

use commun::*;
use web_cao::poste::Poste;

#[test]
fn appareil_non_appaire() {
    let d = dossier_neuf("webcao-appairage");
    std::env::set_var("HOME", &d);
    std::env::set_var("USERPROFILE", &d);
    std::env::set_var("WEB_TOOLS_BANC_DISTANT", "1");
    let mut poste = Poste::new(&racine(), false); // ecoute reseau : la garde exige le code
    poste.lib_defaut = Some(lib_copie(&d).0);
    poste.lib_impose = true;
    let s = lancer(poste);
    s.poste.garde.code.as_ref().unwrap().preparer();
    let code = |methode: &str, chemin: &str, entetes: &[(&str, &str)], corps: &[u8]| brute(s.port, methode, chemin, entetes, corps).code;
    assert!([303, 403].contains(&code("GET", "/?jeton=%C3%A9", &[], b"")));
    assert!([303, 403].contains(&code("GET", "/", &[("Cookie", "websuite_jeton=\u{e9}")], b"")));
    let saisi = "{\"code\": \"\u{663}\u{663}\u{663}\u{663}\u{663}\u{663}\"}";
    assert_eq!(code("POST", "/api/appairer", &[("X-Appairage", "1"), ("Content-Type", "application/json")], saisi.as_bytes()), 403);
    // sans code, aucune route : ni lecture, ni ecriture, ni fichier de la bibliotheque
    for (methode, chemin) in [("GET", "/api/lib/fichiers"), ("GET", "/LIB/lib_empreinte_pcb/0603.json"), ("POST", "/api/lib/fichier"), ("GET", "/api/projets")] {
        assert_eq!(code(methode, chemin, &[("X-WEB_CAO", "1")], b""), 403, "{methode} {chemin}");
    }
    // la page d'accueil renvoie vers celle du code ; le jeton du poste ouvre la porte
    let r = brute(s.port, "GET", "/", &[], b"");
    assert_eq!((r.code, r.entete("Location")), (303, Some("/appairage")));
    let jeton = s.poste.garde.jeton.clone().unwrap();
    let r = brute(s.port, "GET", "/api/lib/fichiers", &[("Cookie", &format!("websuite_jeton={jeton}"))], b"");
    assert_eq!(r.code, 200, "{}", r.texte());
    // ... mais l'ecoute reseau garde la bibliotheque en lecture seule et les projets fermes
    let r = brute(s.port, "GET", "/api/projets", &[("Cookie", &format!("websuite_jeton={jeton}"))], b"");
    assert_eq!(r.code, 403);
}
