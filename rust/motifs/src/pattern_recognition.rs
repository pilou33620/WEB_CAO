//! Module de reconnaissance de motifs de circuits (Pattern Recognition) pour WEB_CAO.
//! Le portage en Rust de python/pattern_recognition.py.
//!
//! Reconnaît :
//! 1. Régulateurs de tension linéaires (LDO, 78xx, LM317...) et à découpage (Buck/Boost + L).
//! 2. Bus numériques (I2C avec résistances de pull-up, SPI, UART).
//! 3. Oscillateurs (Quartz + 2 condensateurs de charge à la masse).
//! 4. Filtres (RC passe-bas, filtres actifs).
//! 5. Amplificateurs (AOP, amplis audio, transistors polarisés).
//! 6. Inférence de courants typiques pour le solveur DC (point 4 de docs/HISTORIQUE_DEVELOPPEMENT.md).
//!
//! Les documents sont ceux que le pont HTTP recevait : `components` est un objet repère ->
//! composant, `nets` un objet nom -> liste de broches. Une erreur (`Err`) porte le message de
//! l'exception que Python levait (ValueError, TypeError, AttributeError : le pont en faisait
//! un refus 422).

use crate::py::{self, elements, get, get_opt, nom_type, objet, ou, sans_attribut, textes, Json, Objet};
use regex::Regex;
use std::borrow::Cow;
use std::collections::{HashMap, HashSet};
use std::sync::LazyLock;

macro_rules! rx {
    ($nom:ident, $motif:expr) => {
        static $nom: LazyLock<Regex> = LazyLock::new(|| Regex::new($motif).unwrap());
    };
}

// Expressions régulières pour les composants clés
rx!(RE_REG_78XX, r"(?i)(?:LM|MC|L)?78(?:05|08|09|12|15|24|33|L05|L12)\b");
rx!(RE_REG_79XX, r"(?i)(?:LM|MC|L)?79(?:05|12|15)\b");
rx!(RE_REG_LDO, r"(?i)(?:AMS1117|LM1117|LD1117|LP2985|MCP1700|TLV700|MIC5205|LP5907|TPS7\d{4})");
rx!(RE_REG_ADJ, r"(?i)(?:LM317|LM337|LM1086|LT1085)");

rx!(RE_SWITCHER, r"(?i)(?:LM2596|LM2576|TPS54\d{3}|MP1584|MP2307|XL4015|MC34063|MT3608)");

rx!(RE_OPAMP, r"(?i)(?:TL07[124]|TL08[124]|NE5532|LM358|LM324|OP07|MCP600[124]|OPA\d{3}|AD8\d{3})");
rx!(RE_AUDIO_AMP, r"(?i)(?:LM386|TDA2822|TDA7297|PAM8403|TPA3116)");

rx!(RE_POWER_NET, r"(?i)VCC|VDD|VBAT|3V3|3\.3V|5V|12V|\bPWR\b|AVCC|DVCC|\+V");
// « 0V » seul, pas le 0V de 10V / 20V : ces rails ne sont pas des masses
// (`regex` n'a pas d'assertions : le voisinage du 0V est regardé à la main dans `est_masse`)
rx!(RE_GROUND_NET, r"(?i)GND|VSS");
rx!(RE_0V, r"(?i)0V");
rx!(RE_I2C, r"(?i)I2C");
rx!(RE_SDA_SCL, r"(?i)SDA|SCL");
rx!(RE_LETTRE, r"(?i)^[A-Z]");
rx!(RE_CHIFFRE, r"^\d");
// Passifs dont la valeur peut porter une fréquence (ferrite 600R@100MHz...)
rx!(RE_REF_PASSIF, r"(?i)^(?:R|C|L|FB|D|TP)\d");
// X1 est d'abord un connecteur : seul un X qui porte une fréquence passe pour un quartz
rx!(RE_REF_QUARTZ, r"(?i)^(?:Y|XTAL|XY)\d");

rx!(RE_TENSION_LDO, r"[-_ ](1\.8|2\.5|3\.3|5\.0|5|12|15)\b");
rx!(RE_TENSION_78XX, r"7([89])L?(\d{2})");
rx!(RE_NET_ENTREE_LDO, r"(?i)IN|VCC|VBAT|RAW|VIN|12V|24V");
rx!(RE_NET_SORTIE_LDO, r"(?i)OUT|VOUT|3V3|3\.3V|5V|1V8|2V5");
rx!(RE_NET_ENTREE_HACHEUR, r"(?i)IN|VIN|VCC|VBAT|RAW");
rx!(RE_NET_SORTIE_HACHEUR, r"(?i)OUT|VOUT|3V3|5V|FB");
rx!(RE_INDUCTANCE, r"(?i)^L\d");
rx!(RE_CAPA, r"(?i)^C\d");
rx!(RE_REF_ANTENNE, r"^(?:ANT|AE)\d");

// Les mots de `re` et ceux de `regex` ne sont pas tout à fait les mêmes : pour Python, \w est
// une lettre, un nombre quelconque (« ² » compris) ou « _ » ; pour `regex`, les marques
// combinantes et les autres ponctuations de liaison en sont aussi, les nombres hors chiffres non.
rx!(RE_MOT_PYTHON_SEUL, r"\p{No}");
rx!(RE_MOT_REGEX_SEUL, r"[\w--[\p{L}\p{N}_]]");

/// Le texte tel que `re` de Python le voit, pour un motif de `regex` : avec re.IGNORECASE,
/// « ı » et « İ » valent « i » (lettre d'un motif ou d'une classe [A-Z]), ce que le pliage de
/// casse de `regex` ne fait pas ; et les caractères sur lesquels \b ne tombe pas au même
/// endroit sont remplacés par un caractère qu'aucun motif ne cite, mot ou non comme en Python.
fn plie(t: &str) -> Cow<'_, str> {
    if t.is_ascii() {
        return Cow::Borrowed(t);
    }
    let t = t.replace(['ı', 'İ'], "i");
    let t = RE_MOT_PYTHON_SEUL.replace_all(&t, "ƻ");
    Cow::Owned(RE_MOT_REGEX_SEUL.replace_all(&t, "\u{1}").into_owned())
}

/// rx.search(texte) d'un motif compilé avec re.IGNORECASE
pub(crate) fn cherche(rx: &Regex, texte: &str) -> bool {
    rx.is_match(&plie(texte))
}

/// Les occurrences de `rx` qui ne suivent pas un caractère `avant` et ne précèdent pas un
/// caractère `apres` : (?<!avant)rx(?!apres).
fn cherche_isole(rx: &Regex, texte: &str, avant: impl Fn(&str) -> bool, apres: impl Fn(&str) -> bool) -> bool {
    let t = plie(texte);
    rx.find_iter(&t).any(|m| {
        let precedent = t[..m.start()].char_indices().next_back().map(|(i, _)| &t[i..m.start()]);
        !precedent.is_some_and(&avant) && !apres(&t[m.end()..])
    })
}

/// _RE_GROUND_NET.search(nom) : GND|VSS|(?<![\d.])0V(?!\d)
pub(crate) fn est_masse(nom: &str) -> bool {
    cherche(&RE_GROUND_NET, nom)
        || cherche_isole(&RE_0V, nom, |c| c == "." || RE_CHIFFRE.is_match(c), |suite| RE_CHIFFRE.is_match(suite))
}

/// _RE_I2C_NET.search(nom) : I2C|(?<![A-Z])(?:SDA|SCL)(?![A-Z])
fn est_i2c(nom: &str) -> bool {
    cherche(&RE_I2C, nom) || cherche_isole(&RE_SDA_SCL, nom, |c| RE_LETTRE.is_match(c), |suite| RE_LETTRE.is_match(suite))
}

/// Noms des nets de masse présents dans le schéma.
pub fn nets_masse(nets: &Objet) -> Vec<String> {
    nets.keys().filter(|n| est_masse(n)).cloned().collect()
}

fn relie(pins: &Json, ref_: &str) -> Result<bool, String> {
    for p in elements(pins)? {
        if get(p, "ref")?.as_str() == Some(ref_) || get(p, "component")?.as_str() == Some(ref_) {
            return Ok(true);
        }
    }
    Ok(false)
}

/// p.get("ref") or p.get("component") or "" : le repère au bout d'une broche. Un repère qui
/// n'est pas un texte faisait lever la méthode de str appelée ensuite (`usage`).
fn repere<'a>(p: &'a Json, usage: &str) -> Result<&'a str, String> {
    let r = ou(p, "ref", "component")?;
    match r {
        Json::Texte(t) => Ok(t),
        _ if usage == "re" => Err(format!("expected string or bytes-like object, got '{}'", nom_type(r))),
        _ => Err(sans_attribut(r, usage)),
    }
}

/// str(comp.get("val") or comp.get("value") or "")
fn valeur(comp: &Json) -> Result<String, String> {
    Ok(py::str(ou(comp, "val", "value")?))
}

/// str(comp.get("type") or "")
fn type_de(comp: &Json) -> Result<String, String> {
    let t = get(comp, "type")?;
    Ok(if t.vrai() { py::str(t) } else { String::new() })
}

/// Les nets auxquels le composant est relié, dans l'ordre du schéma.
fn nets_de<'a>(nets: &'a Objet, ref_: &str) -> Result<Vec<&'a str>, String> {
    let mut l = Vec::new();
    for (n_name, pins) in nets {
        if relie(pins, ref_)? {
            l.push(n_name.as_str());
        }
    }
    Ok(l)
}

fn ajoute<'a>(liste: &mut Vec<&'a str>, x: &'a str) {
    if !liste.contains(&x) {
        liste.push(x);
    }
}

/// Convertit une chaîne (ex: '4.7k', '100R', '10k', '330') en Ohms.
pub fn valeur_en_ohms(val_str: &str) -> Option<f64> {
    if val_str.is_empty() {
        return None;
    }
    let mut s = py::strip(val_str).to_uppercase().replace("OHM", "").replace('Ω', "").replace('R', ".");
    let mut mult = 1.0;
    if s.contains('K') {
        mult = 1e3;
        s = s.replace('K', ".");
    } else if s.contains('M') {
        mult = 1e6;
        s = s.replace('M', ".");
    }
    if s.ends_with('.') {
        s.pop();
    }
    Some(py::float(&s)? * mult)
}

/// Déduit la tension de sortie d'après la valeur (ex: AMS1117-3.3 -> 3.3).
///
/// Ne lit que la VALEUR, jamais le repère : U5 ou U12 ne sont pas des tensions.
fn extraire_tension_ldo(val_str: &str) -> Option<f64> {
    py::float(RE_TENSION_LDO.captures(&plie(val_str))?.get(1)?.as_str())
}

/// Tension d'un 78xx / 79xx d'après ses deux derniers chiffres (7809 -> 9, 7912 -> -12).
fn tension_78xx(val_str: &str) -> Option<f64> {
    let maj = val_str.to_uppercase();
    let m = RE_TENSION_78XX.captures(&maj)?;
    let code = py::float(&m[2])?; // int() : deux chiffres, d'une écriture quelconque
    let v = if code == 33.0 { 3.3 } else { code };
    Some(if &m[1] == "9" { -v } else { v })
}

fn nombre(v: Option<f64>) -> Json {
    v.map_or(Json::Nul, Json::Flottant)
}

/// Détecte les régulateurs linéaires et les alimentations à découpage.
pub fn identifier_alimentations(components: &Objet, nets: &Objet) -> Result<Vec<Json>, String> {
    let mut resultats = Vec::new();

    // 1. Régulateurs linéaires
    for (ref_, comp) in components {
        let brut = valeur(comp)?;
        let val = py::strip(&brut);
        let nom = format!("{ref_} {val}").to_uppercase();

        // `x or défaut` : une tension lue nulle laisse aussi la place au défaut
        let ou_defaut = |v: Option<f64>, defaut: f64| Some(v.filter(|v| *v != 0.0).unwrap_or(defaut));
        let (type_reg, v_out) = if cherche(&RE_REG_78XX, &nom) {
            ("linear_fixed_positive", ou_defaut(tension_78xx(val), 5.0))
        } else if cherche(&RE_REG_79XX, &nom) {
            ("linear_fixed_negative", ou_defaut(tension_78xx(val), -5.0))
        } else if cherche(&RE_REG_LDO, &nom) {
            ("ldo", ou_defaut(extraire_tension_ldo(val), 3.3))
        } else if cherche(&RE_REG_ADJ, &nom) {
            ("linear_adjustable", None)
        } else {
            continue;
        };

        // Cherche les condensateurs et passifs voisins sur les mêmes nets
        let comp_nets = nets_de(nets, ref_)?;

        let mut cin_list: Vec<&str> = Vec::new();
        let mut cout_list: Vec<&str> = Vec::new();
        let mut associes: Vec<&str> = Vec::new();

        for n_name in &comp_nets {
            let is_in_net = cherche(&RE_NET_ENTREE_LDO, n_name);
            let is_out_net = cherche(&RE_NET_SORTIE_LDO, n_name);
            for p in elements(&nets[*n_name])? {
                let c_ref = repere(p, "startswith")?;
                if !c_ref.is_empty() && c_ref != ref_ {
                    if c_ref.starts_with('C') {
                        ajoute(&mut associes, c_ref);
                        if is_in_net && !is_out_net && !cin_list.contains(&c_ref) {
                            cin_list.push(c_ref);
                        } else if is_out_net && !cout_list.contains(&c_ref) {
                            cout_list.push(c_ref);
                        } else if cin_list.contains(&c_ref) || cout_list.contains(&c_ref) {
                            // Revu sur un net neutre (la masse) : déjà rangé
                        } else if cin_list.is_empty() {
                            cin_list.push(c_ref);
                        } else if !cout_list.contains(&c_ref) {
                            cout_list.push(c_ref);
                        }
                    } else if c_ref.starts_with('R') && !associes.contains(&c_ref) {
                        associes.push(c_ref);
                    }
                }
            }
        }

        let passives: Vec<&str> = associes.iter().filter(|c| !cin_list.contains(c) && !cout_list.contains(c)).copied().collect();
        let mut composants = vec![ref_.as_str()];
        composants.extend(&associes);
        resultats.push(objet([
            ("id", format!("alim_{}", ref_.to_lowercase()).into()),
            ("type", "power_supply".into()),
            ("subtype", type_reg.into()),
            ("label", format!("Alimentation {}", if val.is_empty() { ref_ } else { val }).into()),
            ("main_component", ref_.as_str().into()),
            ("value", val.into()),
            ("output_voltage", nombre(v_out)),
            ("components", textes(&composants)),
            (
                "role_map",
                objet([
                    ("ic", ref_.as_str().into()),
                    ("cin", textes(&cin_list)),
                    ("cout", textes(&cout_list)),
                    ("passives", textes(&passives)),
                ]),
            ),
            ("layout_template", "ldo_inline".into()),
            ("nets", textes(&comp_nets)),
            ("suggested_netclass", "Alimentation".into()),
            ("sim_recommendation", "DC_DROP".into()),
        ]));
    }

    // 2. Hacheurs / Switching regulators (présence d'un contrôleur + inductance L sur le même net)
    for (ref_, comp) in components {
        let brut = valeur(comp)?;
        let val = py::strip(&brut);
        let nom = format!("{ref_} {val}").to_uppercase();

        if !cherche(&RE_SWITCHER, &nom) {
            continue;
        }
        // Cherche l'inductance connectée et les diodes / capas
        let mut comp_nets: Vec<&str> = Vec::new();
        let mut inductors: Vec<&str> = Vec::new();
        let mut diodes: Vec<&str> = Vec::new();
        let mut cin_list: Vec<&str> = Vec::new();
        let mut cout_list: Vec<&str> = Vec::new();
        let mut feedback_res: Vec<&str> = Vec::new();

        for (n_name, pins) in nets {
            if !relie(pins, ref_)? {
                continue;
            }
            comp_nets.push(n_name);
            let is_in_net = cherche(&RE_NET_ENTREE_HACHEUR, n_name);
            let is_out_net = cherche(&RE_NET_SORTIE_HACHEUR, n_name);

            for p in elements(pins)? {
                let c_ref = repere(p, "re")?;
                // L suivi d'un chiffre : LED1 n'est pas une inductance
                if cherche(&RE_INDUCTANCE, c_ref) && !inductors.contains(&c_ref) {
                    inductors.push(c_ref);
                } else if c_ref.starts_with('D') && !diodes.contains(&c_ref) {
                    diodes.push(c_ref);
                } else if c_ref.starts_with('C') {
                    if is_in_net && !cin_list.contains(&c_ref) {
                        cin_list.push(c_ref);
                    } else if is_out_net && !cout_list.contains(&c_ref) {
                        cout_list.push(c_ref);
                    }
                } else if c_ref.starts_with('R') && !feedback_res.contains(&c_ref) {
                    feedback_res.push(c_ref);
                }
            }
        }

        // Cherche aussi sur les nets de l'inductance pour trouver cout
        for ind_ref in &inductors {
            for (n_name, pins) in nets {
                if relie(pins, ind_ref)? {
                    ajoute(&mut comp_nets, n_name);
                    for p in elements(pins)? {
                        let c_ref = repere(p, "startswith")?;
                        if c_ref.starts_with('C') && !cin_list.contains(&c_ref) && !cout_list.contains(&c_ref) {
                            cout_list.push(c_ref);
                        }
                    }
                }
            }
        }

        // Nœud de commutation : le net qui relie le contrôleur à l'inductance
        // sans condensateur vers la masse. VIN d'un boost (ou VOUT d'un buck
        // qui le mesure) touche aussi les deux, mais porte son découplage ;
        // le condensateur de bootstrap (BOOT-SW) ne va pas à la masse.
        let refs_du_net = |n: &str| -> Result<HashSet<&str>, String> {
            // (les nets du contrôleur et de l'inductance : leurs repères sont déjà passés ci-dessus)
            elements(&nets[n])?.iter().map(|p| repere(p, "re")).collect()
        };
        let mut capas_masse: HashSet<&str> = HashSet::new();
        for n in nets.keys().filter(|n| est_masse(n)) {
            // un repère qui n'est pas un texte : refusé par l'ensemble s'il n'est pas hachable,
            // sinon par re.match une fois l'ensemble du net construit
            let mut pas_un_texte = None;
            for p in elements(&nets[n.as_str()])? {
                match ou(p, "ref", "component")? {
                    Json::Texte(r) => {
                        if cherche(&RE_CAPA, r) {
                            capas_masse.insert(r);
                        }
                    }
                    r @ (Json::Liste(_) | Json::Objet(_)) => return Err(format!("unhashable type: '{}'", nom_type(r))),
                    r => pas_un_texte = pas_un_texte.or(Some(r)),
                }
            }
            if let Some(r) = pas_un_texte {
                return Err(format!("expected string or bytes-like object, got '{}'", nom_type(r)));
            }
        }
        let mut sw_nets: Vec<&str> = Vec::new();
        for n in &comp_nets {
            let refs = refs_du_net(n)?;
            if refs.contains(ref_.as_str()) && inductors.iter().any(|l| refs.contains(l)) && !refs.iter().any(|r| capas_masse.contains(r)) {
                sw_nets.push(n);
            }
        }

        // Déduplication
        let mut unique_comps: Vec<&str> = Vec::new();
        for c in std::iter::once(ref_.as_str()).chain(inductors.iter().chain(&diodes).chain(&cin_list).chain(&cout_list).chain(&feedback_res).copied()) {
            if !c.is_empty() {
                ajoute(&mut unique_comps, c);
            }
        }

        resultats.push(objet([
            ("id", format!("buck_{}", ref_.to_lowercase()).into()),
            ("type", "power_supply".into()),
            ("subtype", "switching_regulator".into()),
            ("label", format!("Hacheur {}", if val.is_empty() { ref_ } else { val }).into()),
            ("main_component", ref_.as_str().into()),
            ("value", val.into()),
            ("components", textes(&unique_comps)),
            (
                "role_map",
                objet([
                    ("ic", ref_.as_str().into()),
                    ("sw_inductor", inductors.first().map_or(Json::Nul, |l| (*l).into())),
                    ("inductors", textes(&inductors)),
                    ("diodes", textes(&diodes)),
                    ("cin", textes(&cin_list)),
                    ("cout", textes(&cout_list)),
                    ("feedback", textes(&feedback_res)),
                ]),
            ),
            ("layout_template", "buck_compact".into()),
            ("nets", textes(&comp_nets)),
            // Classés Alimentation (largeur de piste), mais agresseurs :
            // fronts de quelques ns sur toute la tension d'entrée
            ("noisy_nets", textes(&sw_nets)),
            ("suggested_netclass", "Alimentation".into()),
            ("sim_recommendation", "DC_DROP_AND_EM".into()),
        ]));
    }

    Ok(resultats)
}

/// Détecte les bus I2C, SPI et liaisons série UART.
pub fn identifier_bus_numeriques(components: &Objet, nets: &Objet) -> Result<Vec<Json>, String> {
    let mut resultats = Vec::new();

    // 1. Bus I2C : repérage par noms de nets ou résistances de pull-up vers VCC
    // SCL mais pas SCLK : l'horloge SPI n'est pas un bus I2C
    let i2c_nets: Vec<&str> = nets.keys().map(String::as_str).filter(|n| est_i2c(n)).collect();
    let mut pullup_resistors: Vec<&str> = Vec::new();

    // Vérification des pull-up : résistance dont une patte est sur le net et l'autre sur VCC
    for r_ref in components.keys().filter(|r| r.starts_with('R')) {
        let r_nets = nets_de(nets, r_ref)?;

        // Si l'une des pattes va sur une alim et l'autre sur une ligne signal
        if let [a, b] = r_nets[..] {
            if cherche(&RE_POWER_NET, a) && !est_masse(b) {
                if i2c_nets.contains(&b) {
                    pullup_resistors.push(r_ref);
                }
            } else if cherche(&RE_POWER_NET, b) && !est_masse(a) && i2c_nets.contains(&a) {
                pullup_resistors.push(r_ref);
            }
        }
    }

    if !i2c_nets.is_empty() {
        // Python rendait list(set(...)) : les mêmes éléments, dans un ordre qui changeait d'un
        // lancement à l'autre (hachage des str). Ici : l'ordre du schéma.
        resultats.push(objet([
            ("id", "bus_i2c".into()),
            ("type", "digital_bus".into()),
            ("subtype", "i2c".into()),
            ("label", "Bus I2C".into()),
            ("nets", textes(&i2c_nets)),
            ("components", textes(&pullup_resistors)),
            ("suggested_netclass", "Lent".into()),
            ("sim_recommendation", "CROSSTALK".into()),
        ]));
    }

    // 2. Bus SPI
    let spi_nets: Vec<&str> = nets
        .keys()
        .filter(|n| {
            let nu = n.to_uppercase();
            ["MOSI", "MISO", "SCK", "SCLK", "SPI"].iter().any(|term| nu.contains(term))
        })
        .map(String::as_str)
        .collect();

    if spi_nets.len() >= 2 {
        resultats.push(objet([
            ("id", "bus_spi".into()),
            ("type", "digital_bus".into()),
            ("subtype", "spi".into()),
            ("label", "Bus SPI".into()),
            ("nets", textes(&spi_nets)),
            ("components", Json::Liste(vec![])),
            ("suggested_netclass", "Rapide".into()),
            ("sim_recommendation", "CROSSTALK".into()),
        ]));
    }

    // 3. UART
    let uart_nets: Vec<&str> = nets
        .keys()
        .filter(|n| {
            let nu = n.to_uppercase();
            nu.contains("TX") || nu.contains("RX") || nu.contains("UART")
        })
        .map(String::as_str)
        .collect();

    if uart_nets.len() >= 2 {
        resultats.push(objet([
            ("id", "bus_uart".into()),
            ("type", "digital_bus".into()),
            ("subtype", "uart".into()),
            ("label", "Liaison UART (TX/RX)".into()),
            ("nets", textes(&uart_nets)),
            ("components", Json::Liste(vec![])),
            ("suggested_netclass", "Lent".into()),
            ("sim_recommendation", Json::Nul),
        ]));
    }

    Ok(resultats)
}

/// Détecte les quartz / résonateurs avec leurs deux condensateurs de charge.
pub fn identifier_oscillateurs(components: &Objet, nets: &Objet) -> Result<Vec<Json>, String> {
    let mut resultats = Vec::new();
    let masses = nets_masse(nets);

    for (ref_, comp) in components {
        let val = valeur(comp)?.to_uppercase();
        let type_c = type_de(comp)?.to_lowercase();

        let freq_dans_valeur = (val.contains("MHZ") || val.contains("KHZ")) && !cherche(&RE_REF_PASSIF, ref_);
        let is_crystal = cherche(&RE_REF_QUARTZ, ref_) || freq_dans_valeur || type_c.contains("crystal");
        if !is_crystal {
            continue;
        }

        // Trouve les deux nets du quartz
        let q_nets = nets_de(nets, ref_)?;

        let mut caps: Vec<&str> = Vec::new();
        for n_name in &q_nets {
            for p in elements(&nets[*n_name])? {
                let c_ref = repere(p, "startswith")?;
                if c_ref.starts_with('C') {
                    // Vérifie si l'autre côté va à la masse
                    for gnd_name in &masses {
                        if relie(&nets[gnd_name.as_str()], c_ref)? {
                            ajoute(&mut caps, c_ref);
                        }
                    }
                }
            }
        }

        let mut composants = vec![ref_.as_str()];
        composants.extend(&caps);
        let capa = |i: usize| caps.get(i).map_or(Json::Nul, |c| (*c).into());
        resultats.push(objet([
            ("id", format!("osc_{}", ref_.to_lowercase()).into()),
            ("type", "oscillator".into()),
            ("subtype", "crystal".into()),
            ("label", format!("Oscillateur {}", if val.is_empty() { ref_ } else { &val }).into()),
            ("main_component", ref_.as_str().into()),
            ("value", val.as_str().into()),
            ("components", textes(&composants)),
            (
                "role_map",
                objet([("crystal", ref_.as_str().into()), ("c_load_1", capa(0)), ("c_load_2", capa(1)), ("c_loads", textes(&caps))]),
            ),
            ("layout_template", "crystal_symmetric".into()),
            ("nets", textes(&q_nets)),
            ("suggested_netclass", "Horloge".into()),
            ("sim_recommendation", "CROSSTALK_AND_LENGTH".into()),
        ]));
    }

    Ok(resultats)
}

/// Détecte les filtres RC passe-bas (R série + C à la masse).
pub fn identifier_filtres(components: &Objet, nets: &Objet) -> Result<Vec<Json>, String> {
    let mut resultats = Vec::new();
    let masses = nets_masse(nets);

    for r_ref in components.keys().filter(|r| r.starts_with('R')) {
        let r_nets = nets_de(nets, r_ref)?;

        if r_nets.len() != 2 {
            continue;
        }

        for n_name in r_nets {
            if cherche(&RE_POWER_NET, n_name) || est_masse(n_name) {
                continue;
            }
            for p in elements(&nets[n_name])? {
                let c_ref = repere(p, "startswith")?;
                if c_ref.starts_with('C') {
                    // Capa reliée à GND ?
                    let mut has_gnd = false;
                    for gnd_net in &masses {
                        if relie(&nets[gnd_net.as_str()], c_ref)? {
                            has_gnd = true;
                            break;
                        }
                    }
                    if has_gnd {
                        resultats.push(objet([
                            ("id", format!("flt_{}_{}", r_ref.to_lowercase(), c_ref.to_lowercase()).into()),
                            ("type", "filter".into()),
                            ("subtype", "rc_lowpass".into()),
                            ("label", format!("Filtre RC ({r_ref}+{c_ref})").into()),
                            ("components", textes(&[r_ref.as_str(), c_ref])),
                            ("role_map", objet([("r_series", r_ref.as_str().into()), ("c_shunt", c_ref.into())])),
                            ("layout_template", "filter_inline".into()),
                            ("nets", textes(&[n_name])),
                            ("suggested_netclass", "Analogique".into()),
                            ("sim_recommendation", Json::Nul),
                        ]));
                    }
                }
            }
        }
    }

    Ok(resultats)
}

/// Classes de nets. Quand plusieurs indices se contredisent sur un net, la
/// première de cette liste l'emporte ; Masse et Alimentation par le nom priment
/// sur tout. Un net sans indice n'a pas de classe (= classe par défaut, lente).
/// « Lent! » est un indice sûr de lenteur (SMB_CLK, ENET_LED) : il passe avant
/// Horloge et Rapide, que le reste du nom suggère à tort ; il sort en « Lent ».
pub const PRIORITE_CLASSES: [&str; 7] = ["Alimentation", "RF", "Lent!", "Horloge", "Rapide", "Analogique", "Lent"];

// Indices lus dans les jetons d'un nom de net ou de broche (USB_DP -> USB, DP)
static REGLES_JETON: LazyLock<[(&str, Regex); 5]> = LazyLock::new(|| {
    let entier = |motif: &str| Regex::new(&format!(r"\A(?:{motif})\z")).unwrap(); // rx.fullmatch
    [
        ("RF", entier(r"RF(?:IN|OUT|IO|\d)?|ANT(?:ENNA)?\d*|LNA\w*")),
        ("Lent!", entier(r"(?:SMB|I2C|LED|RESET|IRQ)\w*|SCL|SDA|MDIO|MDC|N?RST\w*|INTN?")),
        ("Horloge", entier(r"\w*CLK\w*|XTAL\w*|X(?:IN|OUT)|OSC\w*|MCO\d*")),
        ("Rapide", entier(r"(?:USB|ETH|ENET|[RS]?G?MII|HDMI|LVDS|DDR|QSPI|SDIO|MIPI|PCIE|SATA)\w*|D[PM+-]")),
        ("Analogique", entier(r"(?:AIN|ADC|DAC|VREF|SENSE|AUDIO|MIC)\w*|AN\d+")),
    ]
});
// Connecteurs et composants qui imposent une ligne RF
rx!(RE_COMP_RF, r"(?i)\bSMA\b|U\.FL|IPEX|MHF|ANTEN|BALUN");
// Suffixes de paire différentielle : les DEUX noms doivent exister (RESET_N seul
// est un signal actif bas, pas une paire). Base vide admise pour DP/DM seulement :
// les broches « + » / « - » d'un condensateur polarisé ne sont pas une paire.
const SUFFIXES_PAIRE: [(&str, &str); 3] = [("P", "N"), ("+", "-"), ("DP", "DM")];

fn jetons(nom: &str) -> Vec<String> {
    let maj = nom.to_uppercase();
    maj.split(|c: char| !(c.is_ascii_uppercase() || c.is_ascii_digit() || c == '+' || c == '-')).filter(|t| !t.is_empty()).map(str::to_string).collect()
}

/// str(p.get("name") or "")
fn nom_broche(p: &Json) -> Result<String, String> {
    let n = get(p, "name")?;
    Ok(if n.vrai() { py::str(n) } else { String::new() })
}

/// Paires différentielles, par nom de net ou par nom de broche d'un même composant.
fn paires_diff(nets: &Objet) -> Result<Vec<Json>, String> {
    let mut par_nom = Objet::new();
    for n in nets.keys() {
        par_nom.insert(n.to_uppercase(), n.as_str().into());
    }
    let mut par_broche = Objet::new(); // ref -> nom de broche -> net
    for (n, pins) in nets {
        for p in elements(pins)? {
            let nom = nom_broche(p)?.to_uppercase();
            if !nom.is_empty() && !nom.contains('/') {
                // shortcut: un repère qui n'est pas un texte (clé de dict admise par Python) est refusé
                let ref_ = repere(p, "upper")?;
                if let Json::Objet(table) = par_broche.entry(ref_.to_string()).or_insert_with(|| Json::Objet(Objet::new())) {
                    table.insert(nom, n.as_str().into());
                }
            }
        }
    }

    let mut paires = Vec::new();
    let mut vus: HashSet<String> = HashSet::new();

    let mut chercher = |nom: &str, table: &Objet| {
        for (pos, neg) in SUFFIXES_PAIRE {
            let Some(base) = nom.strip_suffix(pos) else { continue };
            if !base.is_empty() || pos == "DP" {
                if let Some(b) = table.get(&format!("{base}{neg}")) {
                    let a = &table[nom];
                    let (ta, tb) = (a.as_str().unwrap_or(""), b.as_str().unwrap_or(""));
                    if ta != tb && !vus.contains(ta) && !vus.contains(tb) {
                        vus.insert(ta.to_string());
                        vus.insert(tb.to_string());
                        paires.push(Json::Liste(vec![a.clone(), b.clone()]));
                    }
                    return;
                }
            }
        }
    };

    for nom in par_nom.keys() {
        chercher(nom, &par_nom);
    }
    for table in par_broche.values().filter_map(Json::as_objet) {
        for nom in table.keys() {
            chercher(nom, table);
        }
    }
    Ok(paires)
}

/// Propose une classe par net et dit pourquoi : (classes, raisons, paires).
///
/// Indices, du plus sûr au moins sûr : nom de masse / d'alimentation, motifs
/// reconnus (quartz, régulateur, bus...), composants reliés (AOP, connecteur
/// RF), noms des broches, nom du net, puis paire différentielle.
/// Les broches multifonctions (PA5/SPI1_SCK/ADC5) sont ignorées : elles ne
/// disent pas laquelle des fonctions est utilisée.
pub fn classer_nets(components: &Objet, nets: &Objet, motifs: &[Json]) -> Result<(Objet, Objet, Vec<Json>), String> {
    // net -> (classe, raison), dans l'ordre des propositions ; `hors_nets` : les nets que seuls
    // des motifs citent, dans l'ordre où ils sont apparus
    let mut candidats: HashMap<String, Vec<(String, String)>> = HashMap::new();
    let mut hors_nets: Vec<String> = Vec::new();

    let mut proposer = |net: &str, classe: &str, raison: String| {
        if !candidats.contains_key(net) && !nets.contains_key(net) {
            hors_nets.push(net.to_string());
        }
        let l = candidats.entry(net.to_string()).or_default();
        if !l.iter().any(|(c, _)| c == classe) {
            l.push((classe.to_string(), raison));
        }
    };

    for pat in motifs {
        // shortcut: une classe ou un net de motif qui ne serait pas un texte est ignoré (les
        // motifs viennent des détecteurs ci-dessus, qui n'écrivent que des textes)
        let Some(c) = get(pat, "suggested_netclass")?.as_str().filter(|c| !c.is_empty()) else { continue };
        let Some(Json::Liste(l)) = get_opt(pat, "nets")? else { continue };
        let label = get(pat, "label")?;
        let raison = format!("Motif : {}", py::str(if label.vrai() { label } else { get(pat, "type")? }));
        for n in l.iter().filter_map(Json::as_str) {
            proposer(n, c, raison.clone());
        }
    }

    for (net, pins) in nets {
        let mut noms = vec![("net".to_string(), net.clone())];
        for p in elements(pins)? {
            let r = ou(p, "ref", "component")?;
            let nom_b = nom_broche(p)?;
            let nommee = !nom_b.is_empty() && !nom_b.contains('/');
            // ce que Python levait pour un repère qui n'est pas un texte : à « ref + "." »,
            // à components.get(ref), puis à ref.upper()
            let ref_ = match r {
                Json::Texte(t) => t.as_str(),
                Json::Liste(_) if nommee => return Err("can only concatenate list (not \"str\") to list".into()),
                _ if nommee => return Err(format!("unsupported operand type(s) for +: '{}' and 'str'", nom_type(r))),
                Json::Liste(_) | Json::Objet(_) => return Err(format!("unhashable type: '{}'", nom_type(r))),
                _ => return Err(sans_attribut(r, "upper")),
            };
            if nommee {
                noms.push((format!("{ref_}.{nom_b}"), nom_b));
            }
            let (val, typ) = match components.get(ref_).filter(|c| c.vrai()) {
                Some(comp) => (valeur(comp)?, type_de(comp)?),
                None => (String::new(), String::new()),
            };
            if cherche(&RE_OPAMP, &val) || cherche(&RE_AUDIO_AMP, &val) {
                proposer(net, "Analogique", format!("Relié à {ref_} ({val})"));
            }
            if cherche(&RE_COMP_RF, &format!("{val} {typ}")) || RE_REF_ANTENNE.is_match(&ref_.to_uppercase()) {
                let quoi = [val.as_str(), typ.as_str(), "antenne"].into_iter().find(|t| !t.is_empty()).unwrap_or("");
                proposer(net, "RF", format!("Relié à {ref_} ({quoi})"));
            }
        }
        for (origine, nom) in &noms {
            for tok in jetons(nom) {
                for (classe, rx) in REGLES_JETON.iter() {
                    if rx.is_match(&tok) {
                        let quoi = if origine == "net" { "Nom du net".to_string() } else { format!("Broche {origine}") };
                        proposer(net, classe, format!("{quoi} « {nom} »"));
                    }
                }
            }
        }
    }

    let paires = paires_diff(nets)?;
    let en_paire: HashSet<&str> = paires.iter().filter_map(Json::as_liste).flatten().filter_map(Json::as_str).collect();

    let mut classes = Objet::new();
    let mut raisons = Objet::new();
    for net in nets.keys().chain(&hors_nets) {
        let (classe, raison) = if est_masse(net) {
            ("Masse", format!("Nom de masse « {net} »"))
        } else if cherche(&RE_POWER_NET, net) {
            ("Alimentation", format!("Nom d'alimentation « {net} »"))
        } else {
            let propose = candidats.get(net).and_then(|l| PRIORITE_CLASSES.iter().find_map(|c| l.iter().find(|(k, _)| k == c)));
            let mut classe = propose.map(|(c, _)| c.as_str());
            let mut raison = propose.map(|(_, r)| r.clone());
            if en_paire.contains(net.as_str()) && matches!(classe, None | Some("Lent")) {
                classe = Some("Rapide");
                raison = Some("Paire différentielle".to_string());
            } else if classe == Some("Lent!") {
                classe = Some("Lent");
            }
            let Some(classe) = classe else { continue };
            (classe, raison.unwrap_or_default())
        };
        classes.insert(net.clone(), classe.into());
        raisons.insert(net.clone(), raison.into());
    }
    Ok((classes, raisons, paires))
}

fn est_led(ref_: &str, comp: &Json) -> Result<bool, String> {
    let val = valeur(comp)?.to_uppercase();
    let type_c = type_de(comp)?.to_lowercase();
    Ok(type_c.contains("led") || ref_.to_uppercase().starts_with("LED") || val.contains("LED"))
}

/// Estime les courants DC consommés pour alimenter le solveur DC (docs/HISTORIQUE_DEVELOPPEMENT.md).
///
/// Avec `nets`, une résistance n'est comptée comme limitation de LED que si
/// elle partage un net avec une LED : un filtre RC de 1 kΩ n'en est pas une.
/// Sans `nets`, l'heuristique d'origine (toute R de 100 Ω à 4,7 kΩ) s'applique.
pub fn estimer_courants_dc(patterns: &[Json], components: &Objet, nets: Option<&Objet>) -> Result<Vec<Json>, String> {
    let mut courants: Vec<Json> = Vec::new();
    let mut refs_led: HashSet<&str> = HashSet::new();
    for (r, c) in components {
        if est_led(r, c)? {
            refs_led.insert(r);
        }
    }

    // 1. Courants déduits des régulateurs
    for pat in patterns {
        if get(pat, "type")?.as_str() == Some("power_supply") {
            let v_out = get(pat, "output_voltage")?;
            let ref_ = get_opt(pat, "main_component")?.cloned().unwrap_or("".into());
            // Consommation de repos estimée
            let i_quiescent_ma = if get(pat, "subtype")?.as_str() == Some("ldo") { 10.0 } else { 25.0 };
            let nets_pat = get(pat, "nets")?;
            courants.push(objet([
                ("source", ref_.clone()),
                ("composant", ref_),
                ("net", if nets_pat.vrai() { nets_pat[0].clone() } else { "VCC".into() }),
                ("courant_ma", i_quiescent_ma.into()),
                ("role", "source".into()),
                ("type", "repos_regulateur".into()),
                ("tension_v", v_out.clone()),
            ]));
        }
    }

    // 2. Détection de LEDs avec résistance de limitation
    for (r_ref, r_comp) in components {
        if !r_ref.starts_with('R') {
            continue;
        }
        let val = valeur(r_comp)?;
        let ohms = valeur_en_ohms(&val);
        if let Some(nets) = nets {
            let mut voisine_led = false;
            for pins in nets.values() {
                if relie(pins, r_ref)? {
                    for p in elements(pins)? {
                        let r = get(p, "ref")?;
                        let voisin = if r.vrai() { r } else { get(p, "component")? };
                        if matches!(voisin, Json::Liste(_) | Json::Objet(_)) {
                            return Err(format!("unhashable type: '{}'", nom_type(voisin)));
                        }
                        voisine_led |= voisin.as_str().is_some_and(|v| refs_led.contains(v));
                    }
                }
            }
            if !voisine_led {
                continue;
            }
        }
        if let Some(ohms) = ohms.filter(|o| (100.0..=4700.0).contains(o)) {
            // Courant LED typique pour V_rail = 3.3V ou 5V
            let i_led_ma = py::round(((3.3 - 2.0) / ohms) * 1000.0, 1);
            if i_led_ma > 0.5 {
                courants.push(objet([
                    ("source", r_ref.as_str().into()),
                    ("composant", r_ref.as_str().into()),
                    ("net", "LED".into()),
                    ("courant_ma", i_led_ma.into()),
                    ("role", "charge".into()),
                    ("type", "consommation_led".into()),
                ]));
            }
        }
    }

    // 3. Consommation estimée pour les circuits intégrés et microcontrôleurs
    for (ref_, comp) in components {
        let type_c = type_de(comp)?.to_lowercase();
        let val = valeur(comp)?.to_uppercase();
        if ref_.starts_with('U') || type_c == "ic" || ["MCU", "STM32", "ESP", "ATMEGA", "PIC"].iter().any(|k| val.contains(k)) {
            if courants.iter().any(|c| c["composant"].as_str() == Some(ref_)) {
                continue;
            }
            let i_ic = if ["STM32", "MCU", "ESP", "ATMEGA", "PIC", "CORTEX"].iter().any(|k| val.contains(k)) { 50.0 } else { 30.0 };
            courants.push(objet([
                ("source", ref_.as_str().into()),
                ("composant", ref_.as_str().into()),
                ("net", "VDD".into()),
                ("courant_ma", i_ic.into()),
                ("role", "charge".into()),
                ("type", "consommation_ic".into()),
            ]));
        }
    }

    Ok(courants)
}

/// `a or b or défaut` de deux clés d'une zone.
fn zone_ou(z: &Json, a: &str, b: &str, defaut: Json) -> Json {
    [a, b].iter().filter_map(|k| z.get(k)).find(|v| v.vrai()).cloned().unwrap_or(defaut)
}

/// c.startswith(préfixe) d'un composant de zone
fn commence(c: &Json, prefixe: &str) -> Result<bool, String> {
    c.as_str().map(|t| t.starts_with(prefixe)).ok_or_else(|| sans_attribut(c, "startswith"))
}

/// Point d'entrée principal pour analyser un schéma.
///
/// `data` : objet contenant "components", "nets" et facultativement "zones".
///
/// Rend un objet avec la liste complète des motifs, suggestions de classes, courants et zones.
pub fn analyser_motifs_schema(data: &Json) -> Result<Json, String> {
    let vide = Json::Objet(Objet::new());
    let components = get_opt(data, "components")?.unwrap_or(&vide);
    let nets = get_opt(data, "nets")?.unwrap_or(&vide);
    let components = components
        .as_objet()
        .filter(|o| o.values().all(|c| matches!(c, Json::Objet(_))))
        .ok_or("« components » : objet repère -> composant attendu")?;
    let nets = nets
        .as_objet()
        .filter(|o| o.values().all(|n| matches!(n, Json::Liste(_))))
        .ok_or("« nets » : objet nom -> liste de broches attendu")?;
    let zones_brutes = ["zones", "rooms"].iter().filter_map(|k| data.get(k)).find(|v| v.vrai());
    let alims = identifier_alimentations(components, nets)?;
    let bus = identifier_bus_numeriques(components, nets)?;
    let oscs = identifier_oscillateurs(components, nets)?;
    let filtres = identifier_filtres(components, nets)?;

    let courants = estimer_courants_dc(&alims, components, Some(nets))?;

    // (`for z in zones_brutes` : ce qui ne se parcourt pas n'était refusé qu'ici, les détecteurs passés)
    let zones_brutes: &[Json] = match zones_brutes {
        None => &[],
        Some(Json::Liste(l)) => l,
        Some(Json::Texte(_) | Json::Objet(_)) => &[], // des caractères, des clés : rien qui soit une zone
        Some(z) => return Err(format!("'{}' object is not iterable", nom_type(z))),
    };

    // Intégration des zones schématiques définies par l'utilisateur
    let mut tous_motifs = Vec::new();
    let mut zones_export = Vec::new();
    for (i, z) in zones_brutes.iter().enumerate() {
        if !matches!(z, Json::Objet(_)) {
            continue;
        }
        let z_id = zone_ou(z, "id", "id", format!("zone_{}", i + 1).into());
        let z_nom = zone_ou(z, "name", "nom", format!("Zone {}", i + 1).into());
        let z_cat = zone_ou(z, "category", "categorie", "general".into());
        let z_cat = z_cat.as_str().ok_or_else(|| sans_attribut(&z_cat, "lower"))?.to_lowercase();
        let z_col = zone_ou(z, "color", "couleur", "#3fa0ea".into());
        let z_comps = match zone_ou(z, "components", "composants", Json::Liste(vec![])) {
            Json::Liste(l) => l,
            _ => Vec::new(),
        };

        // Tente d'associer un gabarit selon la catégorie de zone
        let contient = |mots: &[&str]| mots.iter().any(|m| z_cat.contains(m));
        let template = if contient(&["alim", "power", "buck"]) {
            let mut inductance = false;
            for c in &z_comps {
                if commence(c, "L")? {
                    inductance = true;
                    break;
                }
            }
            if inductance { "buck_compact" } else { "ldo_inline" }
        } else if contient(&["mcu", "micro", "numerique"]) {
            "mcu_decoupling"
        } else if contient(&["osc", "clock", "quartz"]) {
            "crystal_symmetric"
        } else if contient(&["filt"]) {
            "filter_inline"
        } else {
            "cluster_free"
        };

        // Tente d'identifier le composant ancre dans la zone
        let mut anchor = Json::Nul;
        for c in &z_comps {
            if commence(c, "U")? || commence(c, "IC")? || commence(c, "Y")? {
                anchor = c.clone();
                break;
            }
        }
        if !anchor.vrai() {
            if let Some(c) = z_comps.first() {
                anchor = c.clone();
            }
        }

        tous_motifs.push(objet([
            ("id", z_id.clone()),
            ("type", "schematic_zone".into()),
            ("subtype", z_cat.as_str().into()),
            ("label", format!("Zone: {}", py::str(&z_nom)).into()),
            ("zone_name", z_nom.clone()),
            ("category", z_cat.as_str().into()),
            ("color", z_col.clone()),
            ("main_component", anchor.clone()),
            ("components", Json::Liste(z_comps.clone())),
            ("is_user_zone", true.into()),
            ("layout_template", template.into()),
        ]));
        zones_export.push(objet([
            ("id", z_id),
            ("nom", z_nom),
            ("categorie", z_cat.into()),
            ("couleur", z_col),
            ("composants", Json::Liste(z_comps)),
            ("ancre", anchor),
        ]));
    }

    tous_motifs.extend(alims.into_iter().chain(bus).chain(oscs).chain(filtres));

    let (classes, raisons, paires) = classer_nets(components, nets, &tous_motifs)?;
    // Un drapeau, pas une classe : le nœud SW garde sa classe (sa largeur de
    // piste) et devient en plus un agresseur pour l'analyse de la carte.
    let mut bruyants = Objet::new();
    for m in &tous_motifs {
        for n in m["noisy_nets"].as_liste().into_iter().flatten().filter_map(Json::as_str) {
            bruyants.insert(n.to_string(), format!("Nœud de commutation : {}", py::str(&m["label"])).into());
        }
    }

    Ok(objet([
        ("succes", true.into()),
        ("total_motifs", tous_motifs.len().into()),
        ("motifs", Json::Liste(tous_motifs)),
        ("zones", Json::Liste(zones_export)),
        ("classes_suggerees", Json::Objet(classes)),
        ("raisons_classes", Json::Objet(raisons)),
        ("paires_diff", Json::Liste(paires)),
        ("nets_bruyants", Json::Objet(bruyants)),
        ("courants_dc_estimes", Json::Liste(courants)),
    ]))
}
