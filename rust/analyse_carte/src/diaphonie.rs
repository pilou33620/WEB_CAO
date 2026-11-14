//! La diaphonie de la carte entière : chaque couple de pistes voisines de nets différents.

use crate::base::*;
use crate::commun::*;
use crate::regles::FENTE_MAX_MM;
use crate::surfaces::Surfaces;
use std::sync::Arc;

pub const SECTIONS_MAX: usize = 3000; // résolutions MoM de la diaphonie, cache compris
// LE MAILLAGE DES SECTIONS DE LA DIAPHONIE, ALLÉGÉ : la moitié des panneaux et des points de
// quadrature de `ligne_mom`. Une carte réelle en demande plus de mille (Leko : 1 744, 8 min
// au maillage plein, 2 min 30 ici) ; l'écart sur Kb reste sous 0,5 %, loin des seuils de 3
// et 7 %. Le panneau Crosstalk garde le maillage plein sur la piste qu'on y analyse.
pub const SECTION_PANNEAUX: usize = 60;
pub const SECTION_QUADRATURE: usize = 150;

/// La portion du segment victime `v` qui fait face au segment `a`, en mm : [x1, y1, x2, y2]
/// -- c'est ce que la carte colore.
fn _portion(v: &Seg, a: &Seg) -> [f64; 4] {
    let (_, x1, y1, x2, y2, _) = *v;
    let (dx, dy) = (x2 - x1, y2 - y1);
    let l = hyp(dx, dy);
    if l <= 0.0 {
        return [x1, y1, x2, y2];
    }
    let (ux, uy) = (dx / l, dy / l);
    let t1 = (a.1 - x1) * ux + (a.2 - y1) * uy;
    let t2 = (a.3 - x1) * ux + (a.4 - y1) * uy;
    let (mut lo, mut hi) = (maxf(&[0.0, minf(&[t1, t2])]), minf(&[l, maxf(&[t1, t2])]));
    if hi <= lo {
        (lo, hi) = (0.0, l);
    }
    [x1 + ux * lo, y1 + uy * lo, x1 + ux * hi, y1 + uy * hi]
}

/// Le décalage SIGNÉ, en mm, de l'axe du tronçon `b` par rapport à l'axe de `a` : positif à
/// gauche du sens de parcours de `a`, négatif à droite, mesuré au milieu de `b`. C'est lui
/// qui pose une voisine du BON CÔTÉ dans la section, et une garde ENTRE les deux pistes
/// plutôt qu'au-delà.
fn _decalage(a: &Seg, b: &Seg) -> f64 {
    let (dx, dy) = (a.3 - a.1, a.4 - a.2);
    let l = hyp(dx, dy);
    let l = if l != 0.0 { l } else { 1e-12 };
    let (ux, uy) = (dx / l, dy / l);
    let (mx, my) = ((b.1 + b.3) / 2.0 - a.1, (b.2 + b.4) / 2.0 - a.2);
    -uy * mx + ux * my
}

/// Le plus grand trou de couture le long du tronçon `c`, en mm : l'écart entre deux vias
/// consécutifs de son net à portée de son cuivre (2 mm, le couloir de la page), bouts du
/// tronçon compris. Sans via, la longueur du tronçon : une garde que rien ne tient au plan
/// ne tient rien.
fn _trou_couture(c: &Seg, vias: &[(f64, f64)]) -> f64 {
    let (_, x1, y1, x2, y2, w) = *c;
    let (dx, dy) = (x2 - x1, y2 - y1);
    let l = hyp(dx, dy);
    if l <= 0.0 {
        return 0.0;
    }
    let (ux, uy) = (dx / l, dy / l);
    let mut pos = Vec::new();
    for &(vx, vy) in vias {
        let t = (vx - x1) * ux + (vy - y1) * uy;
        let d = (-uy * (vx - x1) + ux * (vy - y1)).abs();
        if -1e-6 <= t && t <= l + 1e-6 && d <= w / 2.0 + 2.0 {
            pos.push(minf(&[l, maxf(&[0.0, t])]));
        }
    }
    if pos.is_empty() {
        return l;
    }
    pos.sort_by(f64::total_cmp);
    let mut bornes = vec![0.0];
    bornes.extend(pos);
    bornes.push(l);
    maxf(&bornes.windows(2).map(|b| b[1] - b[0]).collect::<Vec<_>>())
}

/// Kb de deux pistes de couches voisines, sans plan entre elles, au-dessus du même plan de
/// référence : méthode des images en milieu homogène (Kf nul, Kb = K_L / 2). Hauteurs et
/// écart latéral d'axe à axe, en mm. Le repli de `deux_niveaux`, quand le budget de
/// résolutions est épuisé : fil fin de rayon w/4, un seul plan, donc prudent.
pub fn _kb_larges_faces(h_v: f64, h_a: f64, x_lat: f64, w_v: f64, w_a: f64) -> f64 {
    let lv = (2.0 * h_v / (w_v / 4.0)).ln();
    let la = (2.0 * h_a / (w_a / 4.0)).ln();
    let lm = 0.5 * ((x_lat * x_lat + (h_v + h_a) * (h_v + h_a)) / maxf(&[x_lat * x_lat + (h_v - h_a) * (h_v - h_a), 1e-12])).ln();
    if !(lv > 0.0 && la > 0.0) {
        return 0.0;
    }
    maxf(&[0.0, minf(&[1.0, lm / (lv * la).sqrt()])]) / 2.0
}

/// Ce qui est posé dans la section avec le couple : (x signé, largeur, garde, flottant, net).
type Extra = (f64, f64, bool, bool, String);

/// Un longement d'un couple sur la même couche, avant résolution.
struct Morceau {
    l: f64,
    s: f64,
    w_v: f64,
    w_a: f64,
    pt: (f64, f64),
    portion: [f64; 4],
    ex: Vec<Extra>,
    portion_a: [f64; 4],
}

/// Un longement chiffré : (L, écart, Kb, Kf, Td, point, quoi, portion victime, alpha, extras,
/// portion agresseur, w_v, w_a).
struct Val {
    l: f64,
    ecart: f64,
    kb: f64,
    kf: f64,
    td: f64,
    pt: (f64, f64),
    quoi: Option<String>,
    portion: [f64; 4],
    alpha: f64,
    ex: Vec<Extra>,
    portion_a: [f64; 4],
    w_v: f64,
    w_a: f64,
}

enum Cache {
    Rien,
    Kb(f64),
    Section(f64, f64, f64, f64),
}

/// sorted({...}) d'un ensemble de noms.
fn ensemble<'a>(it: impl Iterator<Item = &'a String>) -> Vec<String> {
    it.cloned().collect::<BTreeSet<_>>().into_iter().collect()
}

/// Deux nets, sans ordre (le `frozenset` de Python).
fn duo(a: &str, b: &str) -> (String, String) {
    if a <= b { (a.to_string(), b.to_string()) } else { (b.to_string(), a.to_string()) }
}

/// Chaque couple de pistes voisines de nets différents : combien la victime reçoit de
/// l'agresseur, à la cadence de l'agresseur.
///
/// LES FENTES DU PLAN FRANCHIES PAR LES DEUX (avec `surf`, l'image du cuivre des plans) : là
/// où l'agresseur et la victime passent ensemble au-dessus d'un vide de leur plan de
/// référence, et qu'aucun autre plan ne ferme le retour dessous, le détour commun du courant
/// de retour ajoute le terme d'impédance commune d'Ott (`crosstalk.impedance_commune_fente`)
/// -- le même que « Analyser la piste ». Un plan qui reste dessous (fente sur un seul plan)
/// ne l'applique pas : c'est noté, pas chiffré.
///
/// SUR LA MÊME COUCHE, LA SECTION EST RÉSOLUE, PAS ESTIMÉE : Kb et Kf sortent des matrices
/// [L] et [C] de la section à deux conducteurs, par la méthode des moments (ligne_mom, via
/// `section_de_couche` et `crosstalk.coefficients_couple`), à l'écart réel de chaque
/// longement -- arcs compris, en cordes de 5°. Le niveau est celui du NIVEAU 2 -- un échelon
/// unitaire, des lignes adaptées, `crosstalk.niveau2` :
///     k_total = ½ (Cm/C11 + Lm/L11) ;
///     NEXT = Kb si 2 T_d ≥ t_r, Σ Kb·2Td / t_r sinon ;
///     FEXT = |Σ Kf·Td| / t_r, plafonné à 50 % (`fext_sature`).
/// t_r est le front GLOBAL de la carte (1 ns par défaut, réglable), et chaque niveau se juge
/// aux seuils vert / orange / rouge (3 % et 7 %).
///
/// ENTRE DEUX COUCHES VOISINES sans plan entre elles (larges faces), deux pistes qui se
/// superposent se couplent par leur largeur : Kb RÉSOLU aussi, rubans à leurs deux hauteurs
/// entre les plans qui encadrent la paire (`ligne_mom.section_deux_niveaux`, milieu
/// homogène : Kf nul), même modèle de niveau. Au-delà du budget, la méthode des images
/// (`_kb_larges_faces`).
///
/// LA SOMME DES AGRESSEURS : plusieurs voisins d'une même victime peuvent basculer ensemble.
/// Leurs niveaux s'ajoutent au pire (en phase) ; une ligne de plus quand la somme franchit
/// un seuil qu'aucun ne franchit seul.
///
/// Hors jeu : la masse et les antennes (ni victimes ni agresseurs), les alimentations (sauf
/// un nœud de découpage, qui agresse), et les deux moitiés d'une paire différentielle entre
/// elles, couplées exprès.
pub fn diaphonie(doc: &Doc, couches: &[Json], reg: &Json, unite: f64, notes: &mut Vec<String>, troncons: &[Troncon], surf: Option<&Surfaces>) -> R<(Vec<Json>, Json)> {
    let rang = _rangs(couches);
    let mut par: IndexMap<usize, Vec<Seg>> = IndexMap::new();
    for t in troncons {
        if let Some(&i) = rang.get(&cle(&t.c)) {
            if t.w > 0.0 {
                par.entry(i).or_default().push(seg(t));
            }
        }
    }
    let mut paires: HashSet<(String, String)> = HashSet::new();
    for pr in doc.liste("paires") {
        if dc_solver::pyth::len_py(pr)? == 2 {
            paires.insert(duo(&str_py(&pr[0]), &str_py(&pr[1])));
        }
    }

    // un noeud de decoupage agresse, mais n'est jamais victime
    let joue = |n: &str, agresse: bool| {
        let c = doc.classe(n);
        !n.is_empty() && !sans_net(n) && !["Masse", ANTENNE, "Alimentation"].contains(&c.as_str()) && (agresse || c != "Découpage")
    };

    let mut cache: HashMap<Vec<u64>, Cache> = HashMap::new();
    let mut couples: IndexMap<(String, String, usize), Vec<Morceau>> = IndexMap::new();
    let mut larges: IndexMap<(String, String, String), Vec<Val>> = IndexMap::new();
    let mut couche_larges: HashMap<(String, String, String), usize> = HashMap::new();
    let mut bilan = obj! {"couples" => 0usize, "sections" => 0usize, "couples_larges_faces" => 0usize, "fentes_communes" => 0usize};
    let mut sans_plan: Vec<String> = Vec::new();
    let mut hauteurs: HashMap<usize, f64> = HashMap::new();
    // LES COUPLES ECARTES A MOINS DE 1,5 x LE SEUIL, par (nets, couche) : le plus proche de
    // leurs longements. Ils ne sont pas chiffres, et le rapport le DIT -- un couple dessine
    // a S = 3,5 W qui disparait du tableau se lit « rien ne couple », ce qui est faux.
    let mut ecartes_proches: IndexMap<((String, String), usize), Json> = IndexMap::new();
    // LES VIAS DE CHAQUE NET, EN MM : c'est avec eux qu'une piste de garde est jugee COUSUE
    // (posee a zero volt) ou FLOTTANTE (posee isolee, elle transfere) -- le meme critere
    // lambda/10 au genou que l'analyse de piste.
    let mut vias_net: HashMap<String, Vec<(f64, f64)>> = HashMap::new();
    for t in doc.liste("percages") {
        let t = dict(t)?;
        // un percage sans position lisible est passe (KeyError, TypeError, ValueError)
        if let (Some(Ok(x)), Some(Ok(y))) = (t.get("x").map(float_py), t.get("y").map(float_py)) {
            vias_net.entry(str_ou_vide(&t["n"])).or_default().push((x * unite, y * unite));
        }
    }
    let t_r = num(reg, "xt_tr");
    let couture_max = se::_couture_max(t_r);
    // UN DOCUMENT SANS AUCUN PERCAGE N'A PAS MESURE LA COUTURE : la garde y est supposee
    // TENUE, comme `crosstalk` le fait d'une couture qui vaut 0. La declarer flottante faute
    // de vias, c'etait juger sur une absence de donnee -- et les deux analyses rendaient deux
    // chiffres pour la meme garde. C'est dit dans les notes. Un document qui porte des
    // percages, mais aucun sur la garde, la laisse flottante : la, c'est mesure.
    let couture_lue = doc.d["percages"].vrai();
    let mut gardes_supposees: BTreeSet<String> = BTreeSet::new();

    for (&i, segs) in &par {
        let h = se::_hauteur_de_couche(couches, i as i64, segs[0].5, ep_cuivre(couches, i)?, &[], false, false);
        if !(h > 0.0) {
            sans_plan.push(str_py(&couches[i]["name"]));
            continue;
        }
        // LE SEUIL DE PRÉSÉLECTION : cinq hauteurs au plan, ou la règle des 3W de l'analyse
        // de piste (3 × max(W, H)) quand elle porte plus loin -- les deux outils doivent voir
        // les mêmes couples --, l'ÉGALITÉ retenue et 2 % au-dessus aussi
        // (crosstalk.TOLERANCE_SEUIL). La grille regarde jusqu'à 1,5 × le seuil : les couples
        // écartés de peu sont NOMMÉS dans le bilan, avec leur écart.
        hauteurs.insert(i, h);
        let w_max = maxf(&segs.iter().map(|s| s.5).collect::<Vec<_>>());
        let seuil = maxf(&[5.0 * h, xt::DISTANCE_AUTO * maxf(&[w_max, h])]);
        let smax = seuil * (1.0 + xt::TOLERANCE_SEUIL) + 1e-9;
        let portee = xt::PRESELECTION_PROCHE * seuil;
        let case = maxf(&[1.0, 2.0 * portee]);
        let mut grille: IndexMap<(i64, i64), Vec<usize>> = IndexMap::new();
        for (k, sg) in segs.iter().enumerate() {
            for c in _cases(case, sg.1, sg.2, sg.3, sg.4, portee + sg.5)? {
                grille.entry(c).or_default().push(k);
            }
        }

        // Les conducteurs INTERCALES OU VOISINS d'un couple (segs[ka], segs[kb]) sur la meme
        // couche, poses dans la section du couple.
        //
        // C'EST LE MEME CHEMIN QUE L'ANALYSE DE PISTE. `crosstalk._matrices_bloc` pose dans
        // UNE section tout ce qui longe l'agresseur : les victimes, et les pistes de garde.
        // On ramasse donc tout troncon d'un AUTRE net qui longe le couple sur au moins la
        // moitie de son longement, dans la fenetre laterale du seuil de part et d'autre : une
        // garde (classe Masse ou net de reference) est posee a zero volt si elle est cousue
        // au pas lambda/10 du front global, FLOTTANTE sinon ; une voisine de signal est posee
        // avec son propre port.
        //
        // Rend une liste de (x signe depuis l'axe de segs[ka], largeur, garde, flottant,
        // net), la plus proche d'abord, quatre au plus.
        let mut intercales = |ka: usize, kb: usize| -> R<Vec<Extra>> {
            let (a, b) = (&segs[ka], &segs[kb]);
            let ref_ = if long_seg(a) >= long_seg(b) { a } else { b };
            let Some(lg_ab) = _longement(ref_, if std::ptr::eq(ref_, a) { b } else { a }) else { return Ok(Vec::new()) };
            let x_b = _decalage(a, b);
            let (lo, hi) = (minf(&[0.0, x_b]), maxf(&[0.0, x_b]));
            let mut cand = EnsembleEntiers::default();
            for sg in [a, b] {
                for c in _cases(case, sg.1, sg.2, sg.3, sg.4, smax + sg.5)? {
                    cand.etendre(grille.get(&c).into_iter().flatten().copied());
                }
            }
            let mut out: Vec<Extra> = Vec::new();
            for k in cand.dans_l_ordre() {
                if k == ka || k == kb {
                    continue;
                }
                let c = &segs[k];
                if c.0 == a.0 || c.0 == b.0 || c.0.is_empty() {
                    continue;
                }
                let Some(lg_c) = face(ref_, c) else { continue };
                if lg_c.0 < 0.5 * lg_ab.0 {
                    continue;
                }
                let x_c = _decalage(a, c);
                if !(lo - smax <= x_c && x_c <= hi + smax) {
                    continue;
                }
                // UN CONDUCTEUR QUI CHEVAUCHE L'UN DES DEUX N'EST PAS POSABLE : cuivre en
                // double, ou dessin incoherent. On passe.
                if x_c.abs() <= (a.5 + c.5) / 2.0 + 1e-6 || (x_c - x_b).abs() <= (b.5 + c.5) / 2.0 + 1e-6 {
                    continue;
                }
                let garde = doc.classe(&c.0) == "Masse";
                let mut flottant = false;
                if garde && !couture_lue {
                    gardes_supposees.insert(c.0.clone());
                } else if garde {
                    let trou = _trou_couture(c, vias_net.get(&c.0).map_or(&[][..], |v| v));
                    flottant = couture_max > 0.0 && trou > couture_max;
                }
                out.push((x_c, c.5, garde, flottant, c.0.clone()));
            }
            out.sort_by(|e, f| e.0.abs().total_cmp(&f.0.abs()));
            // LE MEME PLAFOND QUE LE SOLVEUR, moins les deux pistes du couple.
            out.truncate(4.min(tl::MAX_CONDUCTEURS - 2));
            Ok(out)
        };

        let mut vus: HashSet<(usize, usize)> = HashSet::new();
        for cellule in grille.values() {
            for u in 0..cellule.len() {
                for w_ in u + 1..cellule.len() {
                    let (ka, kb) = tri2(cellule[u], cellule[w_]);
                    if !vus.insert((ka, kb)) {
                        continue;
                    }
                    let (a, b) = (&segs[ka], &segs[kb]);
                    if a.0 == b.0 || paires.contains(&duo(&a.0, &b.0)) {
                        continue;
                    }
                    let Some(lg) = face(a, b) else { continue };
                    if lg.0 < 0.05 || !(lg.1 > 0.0) {
                        continue;
                    }
                    let sens: Vec<(&Seg, &Seg)> = [(a, b), (b, a)].into_iter().filter(|(v, g)| joue(&v.0, false) && joue(&g.0, true)).collect();
                    if sens.is_empty() {
                        continue;
                    }
                    if lg.1 > smax {
                        if lg.1 < portee {
                            let cle_e = (duo(&a.0, &b.0), i);
                            if ecartes_proches.get(&cle_e).is_none_or(|e| lg.1 < num(e, "ecart")) {
                                let d = duo(&a.0, &b.0);
                                ecartes_proches.insert(cle_e, obj! {
                                    "nets" => vec![d.0, d.1], "couche" => str_py(&couches[i]["name"]),
                                    "ecart" => round(lg.1, 4), "seuil" => round(seuil, 4), "longueur" => round(lg.0, 3),
                                    "x" => lg.2.0 / unite, "y" => lg.2.1 / unite});
                            }
                        }
                        continue;
                    }
                    // CE QUI LONGE LE COUPLE ENTRE DANS SA SECTION -- gardes et voisines --,
                    // repéré depuis l'axe de `a` puis ramené au repère de la section : la
                    // victime en x = 0, l'agresseur en x = −d (c'est la convention de
                    // `section`).
                    let extras = intercales(ka, kb)?;
                    let x_b = _decalage(a, b);
                    for (v_, g_) in sens {
                        let (x_g, dx) = if std::ptr::eq(v_, a) { (x_b, 0.0) } else { (-x_b, -x_b) };
                        let sg_ = if x_g > 0.0 { -1.0 } else { 1.0 };
                        let ex: Vec<Extra> = extras.iter().map(|(x, w, garde, flottant, net)| (round(sg_ * (x + dx), 4), round(*w, 4), *garde, *flottant, net.clone())).collect();
                        // LA PORTION DE L'AGRESSEUR EN REGARD part aussi : c'est le long
                        // d'elle qu'on cherche les fentes du plan que les deux franchissent.
                        couples.entry((v_.0.clone(), g_.0.clone(), i)).or_default().push(Morceau {
                            l: lg.0, s: lg.1, w_v: v_.5, w_a: g_.5, pt: lg.2, portion: _portion(v_, g_), ex, portion_a: _portion(g_, v_) });
                    }
                }
            }
        }
    }

    // LARGES FACES : deux couches de cuivre consécutives, ni l'une ni l'autre plan, jugées
    // au-dessus du plan de référence le plus proche des deux.
    let mut cu: Vec<usize> = rang.values().copied().collect();
    cu.sort_unstable();
    let pertes = reg["xt_pertes"].vrai();
    for ij in cu.windows(2) {
        let (i, j) = (ij[0], ij[1]);
        let role = |k: usize| couches[k]["role"].as_str() == Some("plane");
        let (Some(par_i), Some(par_j)) = (par.get(&i), par.get(&j)) else { continue };
        if role(i) || role(j) {
            continue;
        }
        let refs: BTreeSet<usize> = _plans_voisins(couches, i).into_iter().chain(_plans_voisins(couches, j)).collect();
        if refs.is_empty() {
            continue;
        }
        // LES PLANS QUI ENCADRENT LA PAIRE : celui du dessous sert d'origine des hauteurs,
        // celui du dessus (s'il existe) ferme le domaine.
        let dessous: Vec<usize> = refs.iter().copied().filter(|q| *q > j).collect();
        let p = if dessous.is_empty() { *refs.iter().max().unwrap() } else { *dessous.iter().min().unwrap() };
        let dessus: Vec<usize> = if dessous.is_empty() { vec![] } else { refs.iter().copied().filter(|q| *q < i).collect() };
        let b_mm = match dessus.iter().max() {
            Some(d) => Some(_ep(couches, *d, p)?),
            None => None,
        };
        // hauteur de l'axe de chaque piste au-dessus du plan p, en mm
        let h_i = _ep(couches, i, p)? + ep_cuivre(couches, i)? / 2.0;
        let h_j = _ep(couches, j, p)? + ep_cuivre(couches, j)? / 2.0;
        let smax = 3.0 * maxf(&[h_i, h_j]);
        let (lo, hi) = (i.min(j).min(p), i.max(j).max(p));
        let er_ij = _er_entre(couches, lo, hi)?;
        let v = C0 / er_ij.sqrt();
        // LES PERTES d'une paire superposée : milieu homogène, eps_eff = eps_r ; Z0 n'est
        // pas résolu ici, on prend celui de la carte.
        let mut tands = Vec::new();
        for c in &couches[lo..=hi] {
            if c["type"].as_str() == Some("dielectric") {
                tands.push(fl_ou(&c["tan_delta"], 0.0)?);
            }
        }
        let tand_ij = if tands.is_empty() { 0.0 } else { maxf(&tands) };
        let mut grille: HashMap<(i64, i64), Vec<usize>> = HashMap::new();
        for (k, sg) in par_j.iter().enumerate() {
            for c in _cases(CASE_MM, sg.1, sg.2, sg.3, sg.4, smax + sg.5)? {
                grille.entry(c).or_default().push(k);
            }
        }
        let nom = format!("{} ↔ {}", str_py(&couches[i]["name"]), str_py(&couches[j]["name"]));
        for a in par_i {
            let mut cand = EnsembleEntiers::default();
            for c in _cases(CASE_MM, a.1, a.2, a.3, a.4, smax + a.5)? {
                cand.etendre(grille.get(&c).into_iter().flatten().copied());
            }
            for k in cand.dans_l_ordre() {
                let b = &par_j[k];
                if a.0 == b.0 || paires.contains(&duo(&a.0, &b.0)) {
                    continue;
                }
                let Some(lg) = face(a, b) else { continue };
                if lg.0 < 0.05 {
                    continue;
                }
                let x_lat = maxf(&[lg.1 + (a.5 + b.5) / 2.0, 0.0]); // d'axe à axe
                if x_lat > smax {
                    continue;
                }
                for (v_, g_, hv, ha) in [(a, b, h_i, h_j), (b, a, h_j, h_i)] {
                    if !(joue(&v_.0, false) && joue(&g_.0, true)) {
                        continue;
                    }
                    // Kb de la victime, rubans à leurs hauteurs (mm) ; None hors budget.
                    let cle_c = vec![2, bits(round(hv, 4)), bits(round(ha, 4)), bits(round(x_lat, 2)), bits(round(v_.5, 3)), bits(round(g_.5, 3)),
                                     b_mm.map_or(u64::MAX, |b| bits(if b != 0.0 { round(b, 4) } else { b }))];
                    if !cache.contains_key(&cle_c) && cache.len() < SECTIONS_MAX {
                        // milieu homogène : Kf est nul, seul Kb compte
                        cache.insert(cle_c.clone(), xt::kb_superposees(hv, ha, x_lat, v_.5, g_.5, b_mm).map_or(Cache::Rien, Cache::Kb));
                    }
                    let (kb, quoi) = match cache.get(&cle_c) {
                        Some(Cache::Kb(kb)) => (*kb, format!("MoM, {}", if b_mm.is_some_and(|b| b != 0.0) { "deux plans" } else { "un plan" })),
                        _ => (_kb_larges_faces(hv, ha, x_lat, v_.5, g_.5), "images, un plan".to_string()),
                    };
                    let alpha = if pertes { xt::alpha_genou(num(reg, "z0"), er_ij, v_.5, er_ij, tand_ij, t_r, None)? } else { 0.0 };
                    // LA PORTION DE L'AGRESSEUR EN REGARD, ET SA COUCHE : une fente du plan
                    // sous les deux se cherche le long d'elle, comme pour un couple à plat.
                    let cle_l = (v_.0.clone(), g_.0.clone(), nom.clone());
                    larges.entry(cle_l.clone()).or_default().push(Val {
                        l: lg.0, ecart: x_lat, kb, kf: 0.0, td: lg.0 * 1e-3 / v, pt: lg.2, quoi: Some(quoi), portion: _portion(v_, g_),
                        alpha, ex: Vec::new(), portion_a: _portion(g_, v_), w_v: v_.5, w_a: g_.5 });
                    couche_larges.insert(cle_l, if std::ptr::eq(g_, b) { j } else { i });
                }
            }
        }
    }
    if !sans_plan.is_empty() {
        let noms: BTreeSet<&String> = sans_plan.iter().collect();
        notes.push(format!("Diaphonie non calculée sur {} : pas de plan de référence dans l'empilage.",
                           noms.into_iter().cloned().collect::<Vec<_>>().join(", ")));
    }

    // (Kb, Kf, v, alpha) de la section : la victime en x = 0, l'agresseur en x = −d, et les
    // `extras` posés avec eux, une garde cousue à zéro volt (`masse`), une garde non cousue
    // isolée (`flottant`), une voisine de signal avec son port. Le net ne fait pas partie de
    // la clef : deux gardes homonymes ou non se résolvent pareil.
    let mut section = |i: usize, w_v: f64, w_a: f64, s: f64, extras: &[Extra]| -> R<Option<(f64, f64, f64, f64)>> {
        let mut cle_c = vec![1, i as u64, bits(round(w_v, 3)), bits(round(w_a, 3)), bits(round(s, 2))];
        for e in extras {
            cle_c.extend([bits(e.0), bits(e.1), e.2 as u64, e.3 as u64]);
        }
        if !cache.contains_key(&cle_c) {
            if cache.len() >= SECTIONS_MAX {
                return Ok(None);
            }
            let mut val = Cache::Rien;
            let (geo, inf) = se::section_de_couche(couches, i as i64, w_v, ep_cuivre(couches, i)?, 0.0, Some(0.0), &[], false);
            if let Some(mut geo) = geo {
                let mut conducteurs = vec![obj! {"w" => w_v * 1e-3, "x" => 0.0, "masse" => false},
                                           obj! {"w" => w_a * 1e-3, "x" => -((w_v + w_a) / 2.0 + s) * 1e-3, "masse" => false}];
                conducteurs.extend(extras.iter().map(|e| obj! {"w" => e.1 * 1e-3, "x" => e.0 * 1e-3, "masse" => e.2 && !e.3, "flottant" => e.3}));
                poser(&mut geo, "conducteurs", conducteurs);
                // une section impossible reste sans valeur (le `except Exception: pass`)
                let resolue = || -> Option<(f64, f64, f64, f64)> {
                    let r = tl::solve_multiline_avec(&se::geometrie(&geo), SECTION_PANNEAUX, SECTION_QUADRATURE).ok()?;
                    let rg = |e: usize| r.ordre.iter().position(|x| *x == e);
                    let (r0, r1) = (rg(0)?, rg(1)?);
                    let (kb, kf) = xt::coefficients_couple(&r.c, &r.l, r0, r1);
                    let eps = maxf(&[r.lignes[r0].eps_eff, 1.0]);
                    let v = C0 / eps.sqrt();
                    let alpha = if pertes {
                        xt::alpha_genou(r.lignes[r0].z0, eps, w_v, fl_ou(&inf["er"], eps).ok()?, fl_ou(&inf["tan_delta"], 0.0).ok()?, t_r, None).ok()?
                    } else {
                        0.0
                    };
                    Some((kb, kf, v, alpha))
                };
                if let Some((kb, kf, v, alpha)) = resolue() {
                    val = Cache::Section(kb, kf, v, alpha);
                }
            }
            cache.insert(cle_c.clone(), val);
        }
        Ok(match cache.get(&cle_c) {
            Some(Cache::Section(kb, kf, v, alpha)) => Some((*kb, *kf, *v, *alpha)),
            _ => None,
        })
    };

    // LE NIVEAU 2 : un échelon unitaire sous le front GLOBAL de la carte, des lignes
    // adaptées. Les formules sont celles de `crosstalk.niveau2`, que l'analyse d'une piste
    // sélectionnée emploie aussi : deux outils qui jugent le même longement rendent le même
    // chiffre.
    let (orange, rouge) = (num(reg, "xt_orange"), num(reg, "xt_rouge"));
    let sev_de = |statut: &str| match statut {
        "rouge" => "critique",
        "orange" => "vigilance",
        _ => "ok",
    };
    let rang_sev = |s: &str| match s {
        "critique" => 2,
        "vigilance" => 1,
        _ => 0,
    };
    let mut perdus = 0usize;

    // (morceaux, att_fext) pour `crosstalk.niveau2`. Avec pertes, la position de chaque
    // morceau le long de la liaison n'est pas connue ici : le longement est supposé partir du
    // driver — le plus pessimiste des placements, celui où les pertes retirent le moins.
    let morceaux_n2 = |vals: &[Val]| -> (Vec<xt::Morceau>, f64) {
        if !pertes {
            return (vals.iter().map(|x| (x.kb, x.kf, x.td, 1.0)).collect(), 1.0);
        }
        let (mut out, mut x_mm, mut a_tot) = (Vec::new(), 0.0, 0.0);
        for x in vals {
            let mi = (x_mm + x.l / 2.0) * 1e-3;
            out.push((x.kb, x.kf, x.td, (-2.0 * x.alpha * mi).exp()));
            x_mm += x.l;
            a_tot += x.alpha * x.l * 1e-3;
        }
        (out, (-a_tot).exp())
    };

    // La colonne unique du constat : le front global, et le pire des deux.
    let colonne = |n2: &Json| -> Vec<Json> {
        vec![obj! {"f" => 0.35 / t_r, "tr" => t_r, "f_eval" => 0.35 / t_r,
                   "valeur" => round(maxf(&[num(n2, "next"), num(n2, "fext")]), 5),
                   "verdict" => sev_de(txt(n2, "statut")),
                   "next" => &n2["next"], "fext" => &n2["fext"],
                   "statut_next" => &n2["statut_next"], "statut_fext" => &n2["statut_fext"]}]
    };

    // (victime, agresseur, couche) -> (longements chiffrés, larges faces ?)
    let mut tous: IndexMap<(String, String, String), (Vec<Val>, bool)> = IndexMap::new();
    let mut couche_de: HashMap<(String, String, String), usize> = HashMap::new();
    for ((nv, na, i), morceaux) in couples {
        let mut vals = Vec::new();
        for m in morceaux {
            let Some(sec) = section(i, m.w_v, m.w_a, m.s, &m.ex)? else {
                perdus += 1;
                continue;
            };
            vals.push(Val { l: m.l, ecart: m.s, kb: sec.0, kf: sec.1, td: m.l * 1e-3 / sec.2, pt: m.pt, quoi: None, portion: m.portion,
                            alpha: sec.3, ex: m.ex, portion_a: m.portion_a, w_v: m.w_v, w_a: m.w_a });
        }
        if !vals.is_empty() {
            let cle_t = (nv, na, str_py(&couches[i]["name"]));
            tous.insert(cle_t.clone(), (vals, false));
            couche_de.insert(cle_t, i);
        }
    }
    for (cle_t, vals) in larges {
        couche_de.insert(cle_t.clone(), couche_larges[&cle_t]);
        tous.insert(cle_t, (vals, true));
    }

    // LES FENTES DU PLAN FRANCHIES PAR LES DEUX PISTES D'UN COUPLE. Même lecture du cuivre
    // que la règle « fente » (l'image des plans pas à pas, les détours d1 et d2 le long de la
    // normale, 30 mm au plus), mais ici on ne cherche que sous la portion de l'agresseur EN
    // REGARD de la victime : une fente ailleurs est l'affaire de la règle « fente », pas du
    // couplage.
    let plans_tous: Vec<usize> = match surf {
        Some(s) => (0..couches.len()).filter(|k| couches[*k]["type"].as_str() == Some("copper") && couches[*k]["role"].as_str() == Some("plane")
                                             && s.image(&couches[*k]["name"]).is_some()).collect(),
        None => Vec::new(),
    };
    let mut fentes_partielles: Vec<(String, String, String, String)> = Vec::new();
    // L'OPTION B (`crosstalk.peec_fente`) : le courant de retour RÉSOLU sur l'image des plans
    // autour du franchissement, plan intact dessous et vias de masse compris. Quelques
    // secondes par fente : au-delà du budget, le modèle d'Ott d'avant, et c'est noté.
    let mut peec_cache: Vec<((f64, f64, (String, String)), (Option<xt::Peec>, (String, String)))> = Vec::new();
    // (lu à l'appel, comme le `xt.PEEC_FENTES_MAX` de Python : le banc le règle)
    let mut peec_budget = xt::peec_fentes_max();
    let mut fentes_ott_budget = 0usize;
    let masses: HashSet<String> = doc.liste("reference_nets").iter().map(str_py).collect();
    let mut vias_masse: Vec<(f64, f64, f64)> = Vec::new();
    for t in doc.liste("percages") {
        let n = str_ou_vide(&t["n"]);
        if !n.is_empty() && (masses.contains(&n) || doc.classe(&n) == "Masse") {
            let d = if t["d"].vrai() { float_py(&t["d"]) } else { Ok(0.3) };
            if let (Some(Ok(x)), Some(Ok(y)), Ok(d)) = (t.get("x").map(float_py), t.get("y").map(float_py), d) {
                vias_masse.push((x * unite, y * unite, d * unite));
            }
        }
    }
    let mut par_net: HashMap<String, Vec<xt::Trc>> = HashMap::new();
    for t in troncons {
        if let Some(&i) = rang.get(&cle(&t.c)) {
            if t.w > 0.0 {
                par_net.entry(t.n.clone()).or_default().push((t.x1, t.y1, t.x2, t.y2, t.w, i as i64));
            }
        }
    }

    // Le PEEC du franchissement : rend le résultat de `crosstalk.peec_fente` vu de
    // l'agresseur na (victime nv), ou None.
    //
    // UNE RÉSOLUTION PAR COUPLE ET PAR FENTE, pas par sens : la mutuelle est réciproque, et
    // la self du détour de chacun sort de la même factorisation. Le sens inverse franchit la
    // même fente à l'entraxe près -- on la reconnaît à 3 mm.
    let mut resoudre_fente = |notes: &mut Vec<String>, surf: &Surfaces, i: usize, xm: f64, ym: f64, ux: f64, uy: f64, d1: f64, d2: f64, na: &str, nv: &str| -> Option<xt::Peec> {
        let vue = |r: &Option<xt::Peec>, ordre: &(String, String)| -> Option<xt::Peec> {
            let r = r.as_ref()?;
            if ordre.0 == na && ordre.1 == nv {
                return Some(r.clone());
            }
            let mut v = r.clone();
            v.ld = r.selfs.get(1).copied().flatten().unwrap_or(0.0);
            v.m = vec![r.mutuelles.first().and_then(|l| l.get(1)).copied().flatten()];
            Some(v)
        };
        for ((x0, y0, paire), (r, ordre)) in &peec_cache {
            if *paire == duo(na, nv) && hyp(xm - x0, ym - y0) < 3.0 {
                return vue(r, ordre);
            }
        }
        peec_cache.push(((xm, ym, duo(na, nv)), (None, (na.to_string(), nv.to_string()))));
        if peec_budget == 0 {
            fentes_ott_budget += 1;
            return None;
        }
        peec_budget -= 1;
        let v_max = minf(&[FENTE_MAX_MM, maxf(&[d1, d2])]) + 5.0;
        // LES PLANS DE CHAQUE CÔTÉ DE LA COUCHE, du plus proche au plus lointain, jusqu'au
        // premier qui a du cuivre au franchissement (celui qui ferme encore le retour) ; deux
        // au plus de chaque côté.
        let mut noms: Vec<&Json> = Vec::new();
        let dessus: Vec<usize> = plans_tous.iter().rev().copied().filter(|q| *q < i).collect();
        let dessous: Vec<usize> = plans_tous.iter().copied().filter(|q| *q > i).collect();
        for cote in [dessus, dessous] {
            for q in cote.into_iter().take(2) {
                let nm = &couches[q]["name"];
                noms.push(nm);
                if surf.lire(nm, xm, ym) != 0 {
                    break;
                }
            }
        }
        if noms.is_empty() {
            return None;
        }
        let plans: Vec<(String, xt::Dedans)> = noms.iter().filter_map(|nm| {
            let img = surf.image(nm)?.clone();
            let (x0, y0, pas, w, h) = (surf.x0, surf.y0, surf.pas, surf.w, surf.h);
            let dedans: xt::Dedans = Arc::new(move |u: f64, v: f64| {
                let (x, y) = (xm + u * ux - v * uy, ym + u * uy + v * ux);
                let (j, i) = (((x - x0) / pas).floor(), ((y - y0) / pas).floor());
                i >= 0.0 && i < h as f64 && j >= 0.0 && j < w as f64 && img[i as usize * w + j as usize] != 0
            });
            Some((str_py(nm), dedans))
        }).collect();
        let mut vias = Vec::new();
        for &(vx, vy, d) in &vias_masse {
            let u = (vx - xm) * ux + (vy - ym) * uy;
            let v = -(vx - xm) * uy + (vy - ym) * ux;
            if u.abs() <= v_max && v.abs() <= v_max {
                vias.push((u, v, d, None));
            }
        }
        let vide = Vec::new();
        let (scene, retenues, _) = xt::scene_plans(xm, ym, ux, uy, v_max, v_max, plans, &vias, couches, par_net.get(na).unwrap_or(&vide),
                                                   &[(nv.to_string(), par_net.get(nv).cloned().unwrap_or_default())]);
        if let Some(scene) = scene.filter(|_| retenues.iter().any(|n| n == nv)) {
            match xt::peec_fente(&scene, 0.35 / t_r) {
                Ok(r) => peec_cache.last_mut().unwrap().1.0 = r,
                Err(exc) => notes.push(format!("Diaphonie : fente sous {nv} ← {na} non résolue ({exc}) ; modèle d'Ott.")),
            }
        }
        peec_cache.last().unwrap().1.0.clone()
    };

    // Les termes d'impédance commune des fentes que l'agresseur (couche i) et la victime
    // franchissent ensemble : le retour RÉSOLU (PEEC) tant que le budget le permet, le
    // modèle d'Ott sinon -- et rien quand un plan ferme encore le retour dessous (noté dans
    // `fentes_partielles`) ou que la victime est sur une autre couche (`large`), deux cas que
    // seul le PEEC sait chiffrer.
    let mut termes_fente = |notes: &mut Vec<String>, i: usize, nv: &str, na: &str, vals: &[Val], large: bool| -> Vec<Json> {
        let Some(surf) = surf else { return Vec::new() };
        let refs: Vec<usize> = _plans_voisins(couches, i).into_iter().filter(|p| surf.image(&couches[*p]["name"]).is_some()).collect();
        if refs.is_empty() {
            return Vec::new();
        }
        let pas = surf.pas;
        let marche: Vec<f64> = (1..=(FENTE_MAX_MM / pas) as usize).map(|k| k as f64 * pas).collect();
        let mut out = Vec::new();
        let mut vus: HashSet<(usize, i64, i64)> = HashSet::new();
        for x in vals {
            let [ax1, ay1, ax2, ay2] = x.portion_a;
            let (w_v, w_a) = (x.w_v, x.w_a);
            let l = hyp(ax2 - ax1, ay2 - ay1);
            if l < pas {
                continue;
            }
            let (ux, uy) = ((ax2 - ax1) / l, (ay2 - ay1) / l);
            let m = ((l / pas) as usize).max(1);
            let s_: Vec<f64> = (0..m).map(|k| (k as f64 + 0.5) / m as f64 * l).collect();
            let (px, py): (Vec<f64>, Vec<f64>) = s_.iter().map(|s| (ax1 + ux * s, ay1 + uy * s)).unzip();
            // DE QUEL CÔTÉ PASSE LA VICTIME : +1 à gauche du sens de marche de l'agresseur
            // (le côté de d1), −1 à droite (d2) -- la même convention que `crosstalk` et que
            // la couture de la page.
            let (vx, vy) = (0.5 * (x.portion[0] + x.portion[2]), 0.5 * (x.portion[1] + x.portion[3]));
            let cote = if (-uy) * (vx - ax1) + ux * (vy - ay1) >= 0.0 { 1 } else { -1 };
            let entraxe = x.ecart + if large { 0.0 } else { (w_a + w_v) / 2.0 };
            for &p in &refs {
                let nomp = &couches[p]["name"];
                let img = surf.image(nomp).unwrap();
                let vide: Vec<bool> = (0..m).map(|k| surf.lire_img(img, px[k], py[k]) == 0).collect();
                let mut a = 0;
                while a < m {
                    if !vide[a] {
                        a += 1;
                        continue;
                    }
                    let mut b = a;
                    while b < m && vide[b] {
                        b += 1;
                    }
                    let (debut, fin) = (a, b);
                    a = b;
                    let k = (debut + fin - 1) / 2;
                    let (xm, ym) = (px[k], py[k]);
                    if !vus.insert((p, round0(xm), round0(ym))) {
                        continue;
                    }
                    let mut ds = [0.0; 2];
                    for (q, sg) in [1.0, -1.0].into_iter().enumerate() {
                        ds[q] = marche.iter().find(|t| surf.lire_img(img, xm - sg * uy * **t, ym + sg * ux * **t) != 0).copied().unwrap_or(FENTE_MAX_MM);
                    }
                    let [d1, d2] = ds;
                    // UN TROU PLUS PETIT QUE DEUX LARGEURS DE PISTE -- un antipad -- ne
                    // détourne rien qui compte (même règle que le RF).
                    if maxf(&[d1, d2]) < 2.0 * maxf(&[w_a, w_v]) {
                        continue;
                    }
                    // UN AUTRE PLAN INTACT SOUS LA FENTE FERME LE RETOUR : le courant change
                    // de plan au lieu de contourner (cas 4b du banc). Le modèle d'Ott ne vaut
                    // pas ; le PEEC, si.
                    let intacts: Vec<String> = plans_tous.iter().filter(|q| **q != p && surf.lire(&couches[**q]["name"], xm, ym) != 0)
                        .map(|q| str_py(&couches[*q]["name"])).collect();
                    // LA FENTE DOIT ALLER JUSQU'À LA VICTIME, de son côté.
                    let d_cote = if cote > 0 { d1 } else { d2 };
                    let atteint = !(entraxe > d_cote && d_cote < FENTE_MAX_MM);
                    let z0 = _z0(reg, &doc.classe(na));
                    let ott = |resonance: bool| xt::impedance_commune_fente(d1, d2, w_a, entraxe, t_r, z0, hauteurs.get(&i).copied().unwrap_or(0.0),
                                                                           Some(w_v), xt::eps_autour_plan(couches, p as i64), resonance,
                                                                           minf(&[d1, d2]) >= FENTE_MAX_MM);
                    // (b - a) était un entier numpy : son arrondi est celui de numpy
                    let lieu = obj! {"x" => xm / unite, "y" => ym / unite, "plan" => str_py(nomp),
                                     "largeur_fente" => rnp((fin - debut) as f64 * l / m as f64, 3),
                                     "victime" => nv, "d1" => d1, "d2" => d2, "entraxe" => round(entraxe, 4)};
                    let r = resoudre_fente(notes, surf, i, xm, ym, ux, uy, d1, d2, na, nv);
                    if let Some(r) = r.filter(|r| r.m[0].is_some()) {
                        let a_ = if atteint && intacts.is_empty() && !large { Some(ott(true)) } else { None };
                        let b_ = a_.as_ref().map(|_| ott(false));
                        let facteur = match (&a_, &b_) {
                            (Some(a_), Some(b_)) if num(b_, "ld_nh") > 0.0 => num(a_, "ld_nh") / num(b_, "ld_nh"),
                            _ => 1.0,
                        };
                        let mut t = xt::terme_peec(&r, 0, t_r, z0, a_.as_ref(), facteur);
                        maj(&mut t, lieu);
                        poser(&mut t, "retour", intacts);
                        out.push(t);
                        continue;
                    }
                    if !intacts.is_empty() && !large {
                        fentes_partielles.push((nv.to_string(), na.to_string(), str_py(nomp), intacts[0].clone()));
                        continue;
                    }
                    if !intacts.is_empty() || large || !atteint {
                        continue;
                    }
                    let mut t = ott(true);
                    maj(&mut t, lieu);
                    poser(&mut t, "modele", "A");
                    out.push(t);
                }
            }
        }
        out
    };

    // UN COUPLE, UNE LIGNE : A ← B et B ← A sont le même longement. On garde le sens le plus
    // grave et l'on dit que l'autre est signalé aussi.
    let mut garde: IndexMap<((String, String), String), Json> = IndexMap::new();
    let mut par_victime: IndexMap<String, Vec<(String, Json, (f64, f64), String)>> = IndexMap::new();
    let mut paires_vues: IndexMap<((String, String), String), Json> = IndexMap::new();
    let poids = |q: &Json| (rang_sev(txt(q, "severite")), maxf(&els(&q["frequences"]).iter().map(|f| num(f, "valeur")).collect::<Vec<_>>()));
    for ((nv, na, c), (vals, large)) in &tous {
        let large = *large;
        let compteur = if large { "couples_larges_faces" } else { "couples" };
        let nb_c = bilan[compteur].as_i64().unwrap_or(0) + 1;
        poser(&mut bilan, compteur, nb_c);
        let (m_n2, att_f) = morceaux_n2(vals);
        let mut n2 = xt::niveau2(&m_n2, t_r, orange, rouge, att_f);
        let termes = termes_fente(notes, couche_de[&(nv.clone(), na.clone(), c.clone())], nv, na, vals, large);
        if !termes.is_empty() {
            n2 = xt::ajouter_fentes_niveau2(&n2, &termes, orange, rouge);
            let nb_f = bilan["fentes_communes"].as_i64().unwrap_or(0) + 1;
            poser(&mut bilan, "fentes_communes", nb_f);
        }
        let freqs = colonne(&n2);
        let long_ = premier_max(vals, |x| x.l).unwrap();
        par_victime.entry(nv.clone()).or_default().push((na.clone(), n2.clone(), long_.pt, c.clone()));
        let sev = sev_de(txt(&n2, "statut"));
        // CE QUI A ÉTÉ POSÉ DANS LA SECTION AVEC LE COUPLE : les gardes (et celles qui
        // flottent), les voisines de signal. Sans cette ligne, la chute -- ou la MONTÉE -- de
        // couplage qu'elles provoquent serait un chiffre sans cause.
        let extras = || vals.iter().flat_map(|x| x.ex.iter());
        let gardes_c = ensemble(extras().filter(|e| e.2).map(|e| &e.4));
        let flottantes = ensemble(extras().filter(|e| e.2 && e.3).map(|e| &e.4));
        let voisines = ensemble(extras().filter(|e| !e.2).map(|e| &e.4));
        let mut dans_section = String::new();
        if !gardes_c.is_empty() {
            let etat_g = if flottantes.is_empty() {
                " (cousue, à 0 V)".to_string()
            } else {
                format!(" (FLOTTANTE{}, non cousue au pas de {couture_max:.1} mm : elle transfère)", if flottantes.len() > 1 { "S" } else { "" })
            };
            dans_section += &format!(" ; garde{} « {} » dans la section{etat_g}", s_si(gardes_c.len()), gardes_c.join(" », « "));
        }
        if !voisines.is_empty() {
            dans_section += &format!(" ; voisine{} « {} » posée{} avec le couple", s_si(voisines.len()), voisines.join(" », « "), s_si(voisines.len()));
        }
        let longueur = py::sum(vals.iter().map(|x| x.l));
        let ecart = minf(&vals.iter().map(|x| x.ecart).collect::<Vec<_>>());
        // LE TUPLE DE DIAGNOSTIC DE LA PAIRE, vert compris : c'est le tableau « toute la
        // carte » du panneau Crosstalk.
        let mut paire = obj! {
            "victime" => nv, "agresseur" => na, "couche" => c, "superposee" => large,
            "gardes" => gardes_c.clone(), "gardes_flottantes" => flottantes.clone(), "voisines" => voisines.clone(),
            "longueur" => round(longueur, 3), "ecart" => round(ecart, 4),
            "x" => long_.pt.0 / unite, "y" => long_.pt.1 / unite,
            "k_total" => &n2["k_total"], "next" => &n2["next"], "next_db" => &n2["next_db"], "fext" => &n2["fext"],
            "fext_db" => &n2["fext_db"], "sature" => &n2["sature"],
            "fext_sature" => n2.get("fext_sature").cloned().unwrap_or(Json::Bool(false)),
            "td_ps" => &n2["td_ps"], "statut_next" => &n2["statut_next"], "statut_fext" => &n2["statut_fext"], "statut" => &n2["statut"],
            // LES PORTIONS DE LA VICTIME QUI FONT FACE À L'AGRESSEUR, dans les unités de
            // l'outil : c'est ce que la carte colore, au statut de la paire.
            "traits" => vals.iter().take(200).map(|x| x.portion.iter().map(|c_| round(c_ / unite, 4)).collect::<Vec<f64>>()).collect::<Vec<_>>()};
        if !termes.is_empty() {
            // LE TERME DE FENTE À PART, et le chiffre des lignes seules : la fiche doit
            // pouvoir dire d'où vient le niveau.
            for k in ["fente", "lignes", "next_fourchette", "fext_fourchette"] {
                poser(&mut paire, k, &n2[k]);
            }
        }
        let cle_p = (duo(nv, na), c.clone());
        let niveau = |p: &Json| maxf(&[num(p, "next"), num(p, "fext")]);
        if paires_vues.get(&cle_p).is_none_or(|avant| niveau(&paire) > niveau(avant)) {
            paires_vues.insert(cle_p.clone(), paire);
        }
        if sev == "ok" {
            continue;
        }
        let mut chiffres = format!("k_total {:.1} %, NEXT {:.2} % ({}), FEXT {:.2} % ({})", 100.0 * num(&n2, "k_total"), 100.0 * num(&n2, "next"),
                                   txt(&n2, "statut_next"), 100.0 * num(&n2, "fext"), txt(&n2, "statut_fext"));
        if !termes.is_empty() {
            let t0 = premier_max(&termes, |t| num(t, "next")).unwrap();
            let fente = &n2["fente"];
            let modele = if t0["modele"].as_str() == Some("B") {
                format!("retour résolu sur l'image des plans{}",
                        if t0["retour"].vrai() { format!(", qui passe aussi par {}", els(&t0["retour"]).iter().map(str_py).collect::<Vec<_>>().join(" / ")) } else { String::new() })
            } else {
                "Ott".to_string()
            };
            chiffres += &format!(" ; dont fente du plan {} franchie par les deux : +{:.2} % en NEXT comme en FEXT par impédance commune \
                                  ({modele}, fourchette {:.2} à {:.2} %, détours {:.1} / {:.1} mm, lignes seules NEXT {:.2} % FEXT {:.2} %){}",
                                 str_py(&t0["plan"]), 100.0 * num(fente, "next"),
                                 100.0 * nb(&fente["next_fourchette"][0]), 100.0 * nb(&fente["next_fourchette"][1]),
                                 num(t0, "d1"), num(t0, "d2"), 100.0 * num(&n2["lignes"], "next"), 100.0 * num(&n2["lignes"], "fext"),
                                 if fente["resonance_sensible"].vrai() { " — la résonance de la fente a pesé" } else { "" });
        }
        let msg = if large {
            let quoi: BTreeSet<&str> = vals.iter().filter_map(|x| x.quoi.as_deref()).collect();
            format!("Depuis {na}, couche voisine : {longueur:.1} mm superposés, décalage mini {ecart:.3} mm d'axe à axe, {chiffres} ({})",
                    quoi.into_iter().collect::<Vec<_>>().join(" ; "))
        } else {
            format!("Depuis {na} : {longueur:.1} mm en regard, écart mini {ecart:.3} mm, {chiffres}{dans_section}")
        };
        let mut k = obj! {"regle" => "diaphonie", "severite" => sev, "frequences" => freqs,
                          "x" => long_.pt.0 / unite, "y" => long_.pt.1 / unite, "c" => c, "n" => nv, "msg" => msg};
        if let Some(autre) = garde.get(&cle_p) {
            let (mut pire, mieux) = if poids(&k) > poids(autre) { (k, autre.clone()) } else { (autre.clone(), k) };
            let msg = format!("{} ; et réciproquement ({} ← {}, {})", txt(&pire, "msg"), txt(&mieux, "n"), txt(&pire, "n"), txt(&mieux, "severite"));
            poser(&mut pire, "msg", msg);
            k = pire;
        }
        garde.insert(cle_p, k);
    }
    let mut out: Vec<Json> = garde.into_values().collect();
    if fentes_ott_budget > 0 {
        poser(&mut bilan, "fentes_ott_budget", fentes_ott_budget);
    }
    let niveau = |p: &Json| maxf(&[num(p, "next"), num(p, "fext")]);
    let mut tableau: Vec<&Json> = paires_vues.values().collect();
    tableau.sort_by(|a, b| niveau(b).total_cmp(&niveau(a)));
    poser(&mut bilan, "paires", tableau.iter().take(PAIRES_MAX).map(|p| (*p).clone()).collect::<Vec<Json>>());
    poser(&mut bilan, "paires_total", paires_vues.len());
    poser(&mut bilan, "t_r", t_r);
    poser(&mut bilan, "seuils", obj! {"orange" => orange, "rouge" => rouge});
    // LES COUPLES ÉCARTÉS DE PEU PAR LA PRÉSÉLECTION, NOMMÉS : « rien au tableau » ne doit
    // pas se lire « rien ne couple ». La tolérance et la portée sont celles de l'analyse de
    // piste.
    let mut ecartes: Vec<&Json> = ecartes_proches.values().collect();
    ecartes.sort_by(|a, b| num(a, "ecart").total_cmp(&num(b, "ecart")));
    poser(&mut bilan, "ecartes_proches", ecartes.iter().take(PAIRES_MAX).map(|e| (*e).clone()).collect::<Vec<Json>>());
    poser(&mut bilan, "tolerance_seuil", xt::TOLERANCE_SEUIL);
    poser(&mut bilan, "gardes_posees", ensemble(paires_vues.values().flat_map(|p| els(&p["gardes"]).iter().filter_map(|g| match g {
        Json::Texte(t) => Some(t),
        _ => None,
    }))));
    if !ecartes.is_empty() {
        let tete: Vec<String> = ecartes.iter().take(4).map(|e| {
            format!("{} ↔ {} à S = {:.3} mm (seuil {:.3} mm, {})", str_py(&e["nets"][0]), str_py(&e["nets"][1]), num(e, "ecart"), num(e, "seuil"), txt(e, "couche"))
        }).collect();
        notes.push(format!(
            "Diaphonie : {} couple(s) écarté(s) par la présélection à moins de {} × le seuil (3 × max(W, H) ou 5 H), donc NON chiffré(s) — ce n'est \
             pas un couplage nul : {}{}. L'analyse de la piste (onglet Crosstalk, « distance max ») les chiffre.",
            ecartes.len(), fmt_g(xt::PRESELECTION_PROCHE, 6), tete.join(", "), if ecartes.len() > tete.len() { "…" } else { "" }));
    }

    // LA SOMME DES AGRESSEURS D'UNE VICTIME : ce qu'aucun ne fait seul. NEXT et FEXT se
    // somment chacun de leur côté — arithmétiquement (« pire », en phase) ou quadratiquement
    // (« rss », des agresseurs indépendants) — et se jugent aux mêmes seuils.
    let mode = txt(reg, "xt_somme");
    let mut sommes = Vec::new();
    for (nv, lst) in &par_victime {
        if lst.len() < 2 {
            continue;
        }
        let s_next = xt::somme_agresseurs(&lst.iter().map(|x| num(&x.1, "next")).collect::<Vec<_>>(), mode);
        let s_fext = xt::somme_agresseurs(&lst.iter().map(|x| num(&x.1, "fext")).collect::<Vec<_>>(), mode);
        let (s_n, s_f) = (xt::statut(s_next, orange, rouge), xt::statut(s_fext, orange, rouge));
        let somme = obj! {"next" => round(s_next, 6), "fext" => round(s_fext, 6), "statut_next" => s_n, "statut_fext" => s_f,
                          "statut" => xt::pire_statut(&[s_n, s_f])};
        let mut s = somme.clone();
        maj(&mut s, obj! {"victime" => nv, "mode" => mode, "agresseurs" => ensemble(lst.iter().map(|x| &x.0))});
        sommes.push(s);
        let seul = lst.iter().map(|x| rang_sev(sev_de(txt(&x.1, "statut")))).max().unwrap_or(0);
        let sev = sev_de(txt(&somme, "statut"));
        if rang_sev(sev) <= seul {
            continue;
        }
        let niveau = |x: &(String, Json, (f64, f64), String)| maxf(&[num(&x.1, "next"), num(&x.1, "fext")]);
        let mut top: Vec<&(String, Json, (f64, f64), String)> = lst.iter().collect();
        top.sort_by(|a, b| niveau(b).total_cmp(&niveau(a)));
        let (_, _, pt, c) = top[0];
        out.push(obj! {"regle" => "diaphonie", "severite" => sev, "frequences" => colonne(&somme),
                       "x" => pt.0 / unite, "y" => pt.1 / unite, "c" => c, "n" => nv,
                       "msg" => format!("Somme {} de {} agresseurs ({}{}) : NEXT {:.2} %, FEXT {:.2} % — aucun ne dépasse seul, ensemble ils \
                                         franchissent le seuil",
                                        if mode == "rss" { "quadratique" } else { "en phase" }, lst.len(),
                                        top.iter().take(4).map(|x| format!("{} {:.1} %", x.0, 100.0 * niveau(x))).collect::<Vec<_>>().join(", "),
                                        if top.len() > 4 { "…" } else { "" }, 100.0 * s_next, 100.0 * s_fext)});
    }
    sommes.sort_by(|a, b| niveau(b).total_cmp(&niveau(a)));
    poser(&mut bilan, "sommes", sommes);
    if fentes_ott_budget > 0 {
        notes.push(format!("Diaphonie : {fentes_ott_budget} franchissement(s) de fente au-delà des {} que l'on résout (PEEC, quelques secondes \
                            chacun) : modèle d'Ott pour ceux-là, ou rien si un plan reste dessous.", xt::peec_fentes_max()));
    }
    if !gardes_supposees.is_empty() {
        let g: Vec<String> = gardes_supposees.iter().cloned().collect();
        let s = s_si(g.len());
        notes.push(format!("Diaphonie : garde{s} {} supposée{s} cousue{s} — le document ne porte aucun perçage, la couture n'est pas mesurée \
                            (même règle que « Analyser la piste »).", g.iter().map(|x| format!("« {x} »")).collect::<Vec<_>>().join(", ")));
        poser(&mut bilan, "gardes_couture_supposee", g);
    }
    poser(&mut bilan, "somme_mode", mode);
    poser(&mut bilan, "pertes", pertes);
    poser(&mut bilan, "sections", cache.values().filter(|c| match c {
        Cache::Rien => false,
        Cache::Kb(kb) => *kb != 0.0,
        Cache::Section(..) => true,
    }).count());
    if perdus > 0 {
        notes.push(format!("{perdus} longement(s) sans section résolue (plafond de {SECTIONS_MAX} résolutions ou section impossible) : non comptés."));
    }
    if !fentes_partielles.is_empty() {
        let vus_p: BTreeSet<&(String, String, String, String)> = fentes_partielles.iter().collect();
        let plans: BTreeSet<&String> = vus_p.iter().map(|p| &p.2).collect();
        notes.push(format!("Diaphonie : fente du plan {} sous {} longement(s) ({}{}) SANS terme d'impédance commune : un autre plan reste \
                            dessous et porte le retour ; c'est la section sur le plan déclaré qui est rendue. C'est le cas 4b du banc de \
                            mesure, à départager par la mesure.",
                           plans.into_iter().cloned().collect::<Vec<_>>().join(", "), vus_p.len(),
                           vus_p.iter().take(4).map(|p| format!("{} ← {} ({} intact)", p.0, p.1, p.3)).collect::<Vec<_>>().join(", "),
                           if vus_p.len() > 4 { "…" } else { "" }));
    }
    Ok((out, bilan))
}
