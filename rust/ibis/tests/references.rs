//! La comparaison a l'octet, figee : ibis_json sur les fichiers de essais/ doit rendre les
//! lignes que le jumeau Python (essais/ibis_json.py, sur python/ibis.py) a ecrites dans
//! essais/ibis_json.txt -- lectures simple et complete, boitiers, paires, voisins, tampons,
//! .ami, propositions d'egaliseur, chaines de parametres, refus et plantages compris.

#[test]
fn ibis_json_rend_les_octets_du_python() {
    let dossier = format!("{}/essais", env!("CARGO_MANIFEST_DIR"));
    let mut fichiers: Vec<String> = std::fs::read_dir(&dossier)
        .unwrap()
        .map(|e| e.unwrap().path().to_string_lossy().into_owned())
        .filter(|p| p.ends_with(".ibs") || p.ends_with(".ami"))
        .collect();
    fichiers.sort();
    let sortie = std::process::Command::new(env!("CARGO_BIN_EXE_ibis_json")).args(&fichiers).output().unwrap();
    assert!(sortie.status.success());
    let vu = String::from_utf8(sortie.stdout).unwrap();
    let attendu = std::fs::read_to_string(format!("{dossier}/ibis_json.txt")).unwrap();
    assert_eq!(vu.lines().count(), fichiers.len());
    for (v, a) in vu.lines().zip(attendu.lines()) {
        let nom = a.split('\t').next().unwrap();
        let i = v.bytes().zip(a.bytes()).position(|(x, y)| x != y).unwrap_or(v.len().min(a.len()));
        assert!(v == a, "{nom} : ecart a l'octet {i}");
    }
    assert_eq!(vu.lines().count(), attendu.lines().count());
}
