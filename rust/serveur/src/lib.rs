//! WEB_CAO : le serveur des pages. Le portage de web_CAO.py.
//!
//! Sert le dossier du depot en lecture seule (liste blanche), tient le disque pour les
//! pages -- profils, dossiers de projet, bibliotheque LIB --, fait tourner les calculs qu'un
//! navigateur ne peut pas executer (IPC-2581, simulations, verification de la carte) et
//! relaie la recherche de composants vers pcbparts.dev. Par defaut l'ecoute se fait sur
//! toutes les interfaces, ce qui est le but : ouvrir le schema sur un iPad du meme reseau
//! WiFi. Un autre appareil que ce poste saisit une fois le code d'appairage a 6 chiffres
//! affiche dans la console (caisse web_tools_commun : meme jeton et meme cookie que
//! WEB_SUITE et les autres outils du poste). --local coupe cet acces.

pub mod calculs;
pub mod chemins;
pub mod csv;
pub mod datasheet;
pub mod demarrage;
pub mod ecriture;
pub mod json;
pub mod lib_cao;
pub mod maj;
pub mod plateforme;
pub mod poste;
pub mod projets;
