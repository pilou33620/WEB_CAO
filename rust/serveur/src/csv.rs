//! Le module csv de Python, pour le catalogue : séparateur « ; », guillemets au besoin,
//! un champ entre guillemets peut courir sur plusieurs lignes.

/// Les lignes physiques du texte, chacune avec sa fin (« \n » seul les sépare).
pub fn physiques(texte: &str) -> Vec<&str> {
    texte.split_inclusive('\n').collect()
}

/// Une ligne CSV : ses cellules, sa première ligne physique, et celle d'après la dernière.
pub type Ligne = (Vec<String>, usize, usize);

/// csv.reader(lignes, delimiter=';') : toutes les lignes, vides comprises.
pub fn lire(physiques: &[&str]) -> Vec<Ligne> {
    #[derive(PartialEq)]
    enum Etat {
        Debut,
        DebutChamp,
        Champ,
        Cite,
        GuillemetDansCite,
        FinLigne,
    }
    let mut lignes = Vec::new();
    let (mut etat, mut debut) = (Etat::Debut, 0);
    let (mut cellules, mut champ): (Vec<String>, String) = (Vec::new(), String::new());
    for (i, physique) in physiques.iter().enumerate() {
        // « \0 » : la fin de la ligne physique, comme dans le lecteur de Python
        for c in physique.chars().chain(std::iter::once('\0')) {
            let saut = c == '\n' || c == '\r' || c == '\0';
            let suite = |fin: bool| if fin { Etat::Debut } else { Etat::FinLigne };
            etat = match etat {
                Etat::Debut if saut => suite(c == '\0'),
                Etat::Debut | Etat::DebutChamp => match c {
                    _ if saut => {
                        cellules.push(std::mem::take(&mut champ));
                        suite(c == '\0')
                    }
                    '"' => Etat::Cite,
                    ';' => {
                        cellules.push(std::mem::take(&mut champ));
                        Etat::DebutChamp
                    }
                    c => {
                        champ.push(c);
                        Etat::Champ
                    }
                },
                Etat::Champ | Etat::GuillemetDansCite => match c {
                    _ if saut => {
                        cellules.push(std::mem::take(&mut champ));
                        suite(c == '\0')
                    }
                    ';' => {
                        cellules.push(std::mem::take(&mut champ));
                        Etat::DebutChamp
                    }
                    '"' if etat == Etat::GuillemetDansCite => {
                        champ.push('"');
                        Etat::Cite
                    }
                    c => {
                        champ.push(c);
                        Etat::Champ
                    }
                },
                Etat::Cite => match c {
                    '\0' => Etat::Cite,
                    '"' => Etat::GuillemetDansCite,
                    c => {
                        champ.push(c);
                        Etat::Cite
                    }
                },
                // shortcut: un « \r » seul au milieu d'une ligne la termine ; Python levait une erreur (500)
                Etat::FinLigne => match c {
                    '\0' => Etat::Debut,
                    _ if saut => Etat::FinLigne,
                    c => {
                        champ.push(c);
                        Etat::Champ
                    }
                },
            };
        }
        if etat == Etat::Debut {
            lignes.push((std::mem::take(&mut cellules), debut, i + 1));
            debut = i + 1;
        }
    }
    if etat != Etat::Debut {
        // le texte finit au milieu d'un champ entre guillemets
        cellules.push(champ);
        lignes.push((cellules, debut, physiques.len()));
    }
    lignes
}

/// csv.writer(delimiter=';', quoting=QUOTE_MINIMAL, lineterminator=fin).writerow(cellules).
pub fn ecrire(cellules: &[String], fin: &str) -> String {
    let mut s = String::new();
    for (i, c) in cellules.iter().enumerate() {
        if i > 0 {
            s.push(';');
        }
        if c.contains([';', '"', '\r', '\n']) || (c.is_empty() && cellules.len() == 1) {
            s.push('"');
            s.push_str(&c.replace('"', "\"\""));
            s.push('"');
        } else {
            s.push_str(c);
        }
    }
    s + fin
}

#[cfg(test)]
mod essais {
    use super::*;

    fn cellules(texte: &str) -> Vec<Vec<String>> {
        lire(&physiques(texte)).into_iter().map(|l| l.0).collect()
    }

    #[test]
    fn comme_le_module_csv() {
        assert_eq!(cellules("a;b\r\n\r\nc;\"d;\"\"e\"\"\r\nf\";g\r\n"), [vec!["a", "b"], vec![], vec!["c", "d;\"e\"\r\nf", "g"]]);
        // l'ancien enregistrement, en \r\r\n ; une fin de texte sans saut ; un guillemet au milieu d'un champ
        assert_eq!(cellules("a;b\r\r\nc;"), [vec!["a", "b"], vec!["c", ""]]);
        assert_eq!(cellules("a\"b;\"c\"d\n"), [vec!["a\"b", "cd"]]);
        assert_eq!(cellules("x;\"ouvert\nsans fin"), [vec!["x", "ouvert\nsans fin"]]);
        let l = lire(&physiques("t\n\"a\nb\";c\nd\n"));
        assert_eq!((l[1].1, l[1].2, l[2].1), (1, 3, 3));
        let ligne: Vec<String> = ["a;b", "c\"d", "e\nf", "g", ""].map(String::from).to_vec();
        assert_eq!(ecrire(&ligne, "\r\n"), "\"a;b\";\"c\"\"d\";\"e\nf\";g;\r\n");
        assert_eq!(ecrire(&[String::new()], "\n"), "\"\"\n");
        assert_eq!(cellules(&ecrire(&ligne, "\r\n")), [ligne]);
    }
}
