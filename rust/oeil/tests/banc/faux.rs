//! Un modele AMI ECRIT A LA MAIN, a l'interface de `ibis.ModeleAmi` :
//! ce que fait python/test/ami_test/ami_ffe.c -- une FFE a deux
//! coefficients, dans AMI_Init et AMI_GetWave --, plus deux choses que la
//! bibliotheque compilee n'essaie pas sur un poste sans compilateur :
//!   (gw_seul 1)   AMI_Init rend l'impulsion telle quelle, la FFE n'est
//!                 que dans GetWave (un emetteur « GetWave seul ») ;
//!   (horloge x)   GetWave rend un instant d'horloge par bit, tel que
//!                 l'echantillon (instant + bit / 2) tombe a x UI du debut
//!                 de chaque bit ;
//!   (gigue g)     ces instants alternent de +-g UI.
//! Il permet d'essayer le flot de l'oeil (`executer_ami`) partout.

use em::simulation_em::base::fmt_g;
use oeil::{ChargeurAmi, ModeleAmiT};

#[derive(Default)]
pub struct FauxAmi {
    c0: f64,
    c1: f64,
    gw_seul: bool,
    horloge: f64,
    gigue: f64,
    n: usize,
    ui: f64,
    memoire: Vec<f64>,
    k: usize, // echantillons deja vus
}

// re.search(r"\(nom ([-+0-9.eE]+)\)", txt)
fn val(txt: &str, nom: &str, defaut: f64) -> f64 {
    let cle = format!("({nom} ");
    let mut reste = txt;
    while let Some(i) = reste.find(&cle) {
        let suite = &reste[i + cle.len()..];
        let fin = suite.find(|c: char| !(c.is_ascii_digit() || "-+.eE".contains(c))).unwrap_or(suite.len());
        if fin > 0 && suite[fin..].starts_with(')') {
            return suite[..fin].parse().unwrap_or(defaut);
        }
        reste = suite;
    }
    defaut
}

impl ModeleAmiT for FauxAmi {
    fn getwave_existe(&self) -> bool {
        true
    }

    fn init(&mut self, impulsion: &[f64], dt: f64, bit_time: f64, parametres_in: &str) -> (bool, Vec<f64>, String, String) {
        let t = parametres_in;
        if val(t, "echec", 0.0) > 0.5 {
            return (false, impulsion.to_vec(), String::new(), "echec demande".into());
        }
        (self.c0, self.c1) = (val(t, "c0", 1.0), val(t, "c1", 0.0));
        self.gw_seul = val(t, "gw_seul", 0.0) > 0.5;
        self.horloge = val(t, "horloge", -1.0);
        self.gigue = val(t, "gigue", 0.0);
        self.n = 1.max((bit_time / dt).round_ties_even() as usize);
        self.ui = bit_time;
        self.memoire = vec![0.0; self.n];
        self.k = 0;
        let mut x = impulsion.to_vec();
        if !self.gw_seul {
            let n = self.n;
            x = (0..x.len()).map(|i| self.c0 * impulsion[i] + self.c1 * if i < n { 0.0 } else { impulsion[i - n] }).collect();
        }
        (true, x, format!("(faux (c0 {}) (c1 {}))", fmt_g(self.c0, 6), fmt_g(self.c1, 6)), "faux".into())
    }

    fn getwave(&mut self, onde: &[f64], spb: i64) -> Result<(bool, Vec<f64>, Vec<f64>, String), String> {
        let n = self.n;
        let tout: Vec<f64> = self.memoire.iter().chain(onde.iter()).copied().collect();
        let y: Vec<f64> = (0..onde.len()).map(|i| self.c0 * onde[i] + self.c1 * tout[i]).collect();
        self.memoire = tout[tout.len() - n..].to_vec();
        let mut h = Vec::new();
        if self.horloge >= 0.0 {
            let spb = spb as usize;
            let b0 = self.k.div_ceil(spb);
            let b1 = (self.k + onde.len()) / spb;
            for b in b0..b1 {
                let g = if b % 2 != 0 { self.gigue } else { -self.gigue };
                h.push((b as f64 + self.horloge + g - 0.5) * self.ui);
            }
        }
        self.k += onde.len();
        h.retain(|v| *v >= 0.0);
        Ok((true, y, h, String::new()))
    }

    fn fermer(&mut self) {}
}

/// `_FauxAmi` a la place de la bibliotheque compilee.
pub struct Faux;

impl ChargeurAmi for Faux {
    fn chemin(&self, brut: &str, _racines: &[&str]) -> Result<String, ibis::ErreurIbis> {
        Ok(format!("/faux/{brut}"))
    }
    fn charger(&self, _chemin: &str) -> Result<Box<dyn ModeleAmiT>, ibis::ErreurIbis> {
        Ok(Box::new(FauxAmi::default()))
    }
}
