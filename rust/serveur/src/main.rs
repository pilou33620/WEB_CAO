//! web_cao : le serveur de WEB_CAO (voir `web_cao::demarrage`).

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    std::process::exit(web_cao::demarrage::lancer(&args));
}
