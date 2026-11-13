//!     build-manuel   -> docs/manuel/manuel.html et docs/regles/regles.html
//!
//! Voir outils::manuel.

fn main() {
    std::process::exit(outils::manuel::main(&outils::racine()));
}
