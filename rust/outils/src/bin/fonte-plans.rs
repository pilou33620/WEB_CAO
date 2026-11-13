//!     fonte-plans [Regular.ttf Bold.ttf]   -> editeur-pcb/js/fontes/plans-sans.js
//!
//! Voir outils::fonte_plans.

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    outils::fonte_plans::main(&outils::racine().join("editeur-pcb"), &args);
}
