//! L'exécutable de comparaison avec les modules Python : chaque ligne de l'entrée standard est
//! « fonction <tabulation> [arguments en JSON] », chaque ligne rendue est le résultat écrit
//! comme `json.dumps(..., ensure_ascii=False)`, ou « ERREUR: message » si la fonction refuse.
//! Un script Python qui lit les mêmes lignes et appelle les modules d'origine doit rendre la
//! même sortie, à l'octet.

use motifs::appel::appeler;
use motifs::py::{dumps, loads};
use std::io::{BufRead, Write};

fn main() {
    let mut sortie = std::io::stdout().lock();
    for ligne in std::io::stdin().lock().lines().map_while(Result::ok) {
        let (fonction, args) = ligne.split_once('\t').unwrap_or((&ligne, "[]"));
        let rendu = match loads(args).and_then(|a| appeler(fonction, &a)) {
            Ok(v) => dumps(&v),
            Err(e) => format!("ERREUR: {e}"),
        };
        let _ = writeln!(sortie, "{rendu}");
    }
}
