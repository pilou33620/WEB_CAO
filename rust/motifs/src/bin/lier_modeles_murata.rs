//! lier_modeles_murata             # rapport seul
//! lier_modeles_murata --appliquer # ecrit les .sub et le CSV

use motifs::lier_modeles_murata::{principal, Lieux};

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let code = match principal(&args, &Lieux::du_systeme(), &mut std::io::stdout().lock()) {
        Ok(code) => code,
        Err(e) => {
            eprintln!("lier_modeles_murata : {e}");
            1
        }
    };
    std::process::exit(code);
}
