//! Les bancs d'essai du serveur, portés de python/test/ : un seul exécutable d'essai (chacun
//! lie tous les solveurs, et pèse lourd).
//!
//!     cargo test -p web_cao --test bancs
//!
//!   serveur_routes  : banc-serveur-routes.py (routes, sécurités) et la part serveur de banc-entrees-malformees.py
//!   lib_routes      : banc-lib-routes.py (bibliothèque LIB), sur la LIB de lib_essai.py
//!   github_relai    : banc-github-relai.py (Enregistrer + GitHub)
//!   projets_reseau  : banc-projets-reseau.py (--projets-reseau), et les cas qui lancent l'exécutable
//!
//! banc-maj-github.py et banc-detection-plateforme.py sont dans les essais de src/
//! (maj.rs, plateforme.rs, demarrage.rs) ; le cas de l'appareil non appairé, qui règle
//! l'environnement du processus, a son exécutable : tests/banc_appairage.
mod commun;
mod github_relai;
mod lib_routes;
mod projets_reseau;
mod serveur_routes;
