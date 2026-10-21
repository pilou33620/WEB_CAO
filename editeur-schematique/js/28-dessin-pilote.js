/* ==========================================================================
   Dessin du schéma par Claude (web_suite, module dessin-schema)
   --------------------------------------------------------------------------
   Une carte du canal de pilotage porte une liste ordonnée d'opérations :
   poser, déplacer, tourner, miroir, supprimer… Le lot est d'abord JOUÉ sur le
   document puis défait (serialize / restore) : la carte montre ce qui sera fait,
   et rien ne reste. Au clic, le même jeu redonne les mêmes lignes, puis
   s'applique en une étape d'historique (socle ECRITURE_CAO.lot,
   commun/ecriture-cao.js). Spec : web_suite/lanceur/docs/SPEC-mcp-dessin-schema.md.
   ========================================================================== */
"use strict";

const DESSIN_MAX = 40;                       // opérations par carte
const DESSIN_MM = G;                         // px par mm
const DESSIN_ANGLES = [0, 90, 180, 270];
const DESSIN_REF = /^[A-Za-z][A-Za-z0-9_]{0,19}$/;
// noms servant de clés d'objet ailleurs dans la page (classes, contraintes, surcharges) ; « ␞ » sépare les clés de contraintes
const DESSIN_RESERVES = new Set(["__proto__", "constructor", "prototype"]);
const dessinNomValide = (t, re) => typeof t === "string" && re.test(t) && !DESSIN_RESERVES.has(t.trim().toLowerCase()) && !t.includes("\u241E");

const dessinMm = px => Math.round(px / DESSIN_MM * 1000) / 1000;
const dessinCle = r => String(r || "").trim().toUpperCase();

/* Un refus d'opération : le lot s'arrête là, les suivantes dépendent souvent d'elle. */
function dessinRefus(n, op, texte) { const e = new Error((n + 1) + ". " + op + " : " + texte); e.dessin = true; return e; }

function dessinNombre(v, n, op, nom, maxi) {
  if (typeof v !== "number" || !Number.isFinite(v) || Math.abs(v) > maxi) throw dessinRefus(n, op, "« " + nom + " » : nombre, à ±" + maxi);
  return v;
}

/* Le composant d'un repère, sur la feuille affichée seulement : les opérations dessinent là. */
function dessinComp(ref, n, op) {
  const c = typeof ref === "string" && dessinCle(ref) ? S.comps.find(x => dessinCle(x.ref) === dessinCle(ref)) : null;
  if (c) return c;
  const ailleurs = typeof ref === "string" && dessinCle(ref) &&
    S.pages.findIndex((p, i) => i !== S.page && (p.comps || []).some(x => dessinCle(x.ref) === dessinCle(ref)));
  throw dessinRefus(n, op, "repère « " + ref + " » " + (ailleurs >= 0 ? "sur la feuille f" + (ailleurs + 1) + ", pas sur la feuille affichée" :
                                                        "introuvable (voir cao_schema_lire composants)"));
}

// la boîte de clic de la page (petite marge) : sans marge, une résistance n'a pas de hauteur
function dessinChevauche(el, boites) {
  const a = hitBox(el);
  const liste = boites || S.comps.filter(o => o !== el).map(o => ({ o, b: hitBox(o) }));
  const t = liste.find(({ b }) => a.x1 < b.x2 && b.x1 < a.x2 && a.y1 < b.y2 && b.y1 < a.y2);
  return t ? t.o : null;
}

/* Une place libre sur la grille : à droite du dernier posé (ou du composant le plus à droite),
   puis rangée par rangée vers le bas, par pas de 5 mm. */
function dessinPlaceLibre(el, depuis) {
  let x0 = 0, y0 = 0;
  if (depuis) { x0 = depuis.x + 5 * DESSIN_MM; y0 = depuis.y; }
  else if (S.comps.length > 1) {
    const autres = S.comps.filter(o => o !== el);
    x0 = Math.max(...autres.map(o => hitBox(o).x2)) + 5 * DESSIN_MM;
    y0 = Math.min(...autres.map(o => o.y));
  }
  const boites = S.comps.filter(o => o !== el).map(o => ({ o, b: hitBox(o) }));   // une fois, pas à chaque case
  for (let r = 0; r < 40; r++)
    for (let c = 0; c < 40; c++) {
      el.x = snap(x0 + c * 5 * DESSIN_MM); el.y = snap(y0 + r * 5 * DESSIN_MM);
      if (!dessinChevauche(el, boites)) return true;
    }
  return false;
}

/* tourner / miroir sans push : comme transformSel, l'historique étant au lot */
function dessinTransformer(el, fn) {
  const contacts = pinContacts([el]), avant = allPins(el);
  fn(el);
  followWires(pinMoves(avant, allPins(el)), new Set([el]));
  reconnectContacts(contacts);
  touchWires();
}

/* « R1.2 » ou « U1.OUT » : numéro de patte (comme les lectures de registre-cao), sinon nom. */
function dessinBroche(txt, n, op) {
  const m = typeof txt === "string" && txt.match(/^\s*([^.\s]+)\.(.+?)\s*$/);
  if (!m) throw dessinRefus(n, op, "broche « " + txt + " » : REPÈRE.broche (numéro ou nom)");
  const el = dessinComp(m[1], n, op), voulu = dessinCle(m[2]);
  const toutes = pinsOf(el).map((_, i) => i);
  let idx = toutes.filter(i => brPattes(el, i).some(pad => dessinCle(pad) === voulu));
  if (!idx.length) idx = toutes.filter(i => dessinCle(brNomBroche(el, i)) === voulu);
  if (!idx.length) throw dessinRefus(n, op, el.ref + " n'a pas de broche « " + m[2] + " » (voir cao_schema_lire composant)");
  if (idx.length > 1) throw dessinRefus(n, op, el.ref + "." + m[2] + " : plusieurs broches portent ce nom, donne le numéro");
  return { el, i: idx[0], pos: pinPos(el, idx[0]), cle: el.id + "." + (idx[0] + 1), nom: el.ref + "." + m[2] };
}

/* ---------- pas de connexion par accident ----------
   La connectivité de la page relie tout point posé sur un fil. Avant et après une
   opération, on relève broche → net sur la feuille ; seule la fusion demandée est admise. */
function dessinNets() {                       // clé de broche → {k : n° du net, noms : ses noms}
  const g = new Map();
  nets().list.forEach((net, k) => {
    const noms = (net.names || []).map(dessinCle);
    for (const nd of net.nodes) g.set(nd.id + "." + nd.pin, { k, noms });
  });
  return g;
}
function dessinBrochesFeuille() {
  const out = [];
  for (const el of S.comps) if (!defOf(el.type).noRef) pinsOf(el).forEach((_, i) => out.push({ cle: el.id + "." + (i + 1), nom: el.ref + "." + brPatte(el, i) }));
  return out;
}
/* Rend "" si la feuille relie exactement ce qu'il faut, sinon ce qui cloche. `fusions` :
   paires de clés de broches qu'on voulait relier ; `nomme` : [clé, nom] d'une étiquette posée.
   Les noms comptent aussi : une broche ne prend pas, en passant, le nom d'une étiquette ou
   d'une alimentation touchée par accident (qui la relierait aux autres feuilles). */
function dessinEcart(avant, fusions, nomme) {
  const broches = dessinBrochesFeuille(), apres = dessinNets();
  const pere = new Map(broches.map(b => [b.cle, b.cle]));
  const racine = k => { while (pere.get(k) !== k) k = pere.get(k); return k; };
  const unir = (a, b) => { if (pere.has(a) && pere.has(b)) pere.set(racine(a), racine(b)); };
  const parNet = new Map();
  for (const b of broches) if (avant.has(b.cle)) {
    const k = avant.get(b.cle).k;
    if (parNet.has(k)) unir(b.cle, parNet.get(k)); else parNet.set(k, b.cle);
  }
  for (const [a, b] of fusions) unir(a, b);
  const nomsPermis = new Map();                           // racine → noms admis après
  const permettre = (cle, noms) => { const r = racine(cle); nomsPermis.set(r, new Set([...(nomsPermis.get(r) || []), ...noms])); };
  for (const b of broches) permettre(b.cle, avant.has(b.cle) ? avant.get(b.cle).noms : []);
  if (nomme) permettre(nomme[0], [dessinCle(nomme[1])]);
  const nom = new Map(broches.map(b => [b.cle, b.nom]));
  const vus = new Map();                                  // net d'après → racine attendue
  for (const b of broches) {
    const net = apres.has(b.cle) ? "n" + apres.get(b.cle).k : "seule" + b.cle, r = racine(b.cle);
    const intrus = apres.has(b.cle) ? apres.get(b.cle).noms.find(x => !nomsPermis.get(r).has(x)) : null;
    if (intrus) return "donnerait à " + b.nom + " le nom de net « " + intrus + " »";
    if (!vus.has(net)) { vus.set(net, { r, cle: b.cle }); continue; }
    if (vus.get(net).r !== r) return "relierait aussi " + nom.get(vus.get(net).cle) + " et " + b.nom + ", qui ne devaient pas l'être";
  }
  const attendu = new Map();                              // racine attendue → net d'après
  for (const b of broches) {
    const net = apres.has(b.cle) ? "n" + apres.get(b.cle).k : "seule" + b.cle, r = racine(b.cle);
    if (attendu.has(r) && attendu.get(r).net !== net) return nom.get(attendu.get(r).cle) + " et " + b.nom + " ne sont pas reliées";
    if (!attendu.has(r)) attendu.set(r, { net, cle: b.cle });
  }
  return "";
}
/* Deux noms sur un même net (SDA et SCL réunis) : une erreur de câblage, jamais voulue ici. */
function dessinSansConflit(b, n, op) {
  const g = dessinNets();
  if (!g.has(b.cle)) return;
  const noms = [...new Set(g.get(b.cle).noms)];
  if (noms.length > 1) throw dessinRefus(n, op, b.nom + " : réunirait les nets " + noms.join(" et "));
}
function dessinNetDe(b) { const g = dessinNets(); return g.has(b.cle) ? nets().list[g.get(b.cle).k].name : "aucun net"; }

/* Fils de la feuille copiés (resolveSplits coupe des fils existants) et remis en place,
   dans le même tableau : la feuille garde sa référence. */
const dessinFils = () => S.wires.map(w => Object.assign({}, w));
function dessinRemettreFils(copie) { S.wires.splice(0, S.wires.length, ...copie.map(w => Object.assign({}, w))); touchWires(); }

/* L'étiquette posée et son fil (de la broche au bout) ne passent sur aucun fil ni composant :
   on sonde des points, tous les 5 px, en laissant de côté les abords de la broche. */
function dessinPlaceEtiquette(el, pin, bout) {
  const surFil = p => S.wires.some(w => {
    const lx = w.x2 - w.x1, ly = w.y2 - w.y1, l2 = lx * lx + ly * ly;
    const t = l2 ? Math.max(0, Math.min(1, ((p.x - w.x1) * lx + (p.y - w.y1) * ly) / l2)) : 0;
    return Math.hypot(w.x1 + t * lx - p.x, w.y1 + t * ly - p.y) < 3;
  });
  const dans = (r, p) => p.x > r.x1 && p.x < r.x2 && p.y > r.y1 && p.y < r.y2;
  const boites = S.comps.filter(c => c !== el).map(hitBox);
  const pts = [], h = hitBox(el);
  for (let x = h.x1; x <= h.x2; x += 5) for (let y = h.y1; y <= h.y2; y += 5) pts.push({ x, y });
  for (let k = 0; k <= 8; k++) pts.push({ x: pin.x + (bout.x - pin.x) * k / 8, y: pin.y + (bout.y - pin.y) * k / 8 });
  return !pts.some(p => Math.hypot(p.x - pin.x, p.y - pin.y) > 12 &&
                        (surFil(p) || boites.some(b => dans(b, p))));
}

const dessinOuEst = el => "x " + dessinMm(el.x) + " y " + dessinMm(el.y) + " mm, " + (el.rot || 0) + "°" + (el.mir ? ", miroir" : "");

/* Joue une opération ; rend la ligne de la carte. `ctx.dernier` : le dernier posé. */
const DESSIN_OPS = {
  poser(o, n, ctx) {
    if ((o.type === undefined) === (o.catalogue === undefined)) throw dessinRefus(n, "poser", "donne « type » (symbole intégré) ou « catalogue » (Part Name), un seul");
    let type = o.type, ligne = null;
    if (o.catalogue !== undefined) {
      const lib = typeof window !== "undefined" ? window.CSV_LIB : null;
      if (!Array.isArray(lib)) throw dessinRefus(n, "poser", "le catalogue n'est pas encore chargé dans la page");
      ligne = typeof o.catalogue === "string" && dessinCle(o.catalogue) ? lib.find(r => dessinCle(r["Part Name"]) === dessinCle(o.catalogue)) : null;
      if (!ligne) throw dessinRefus(n, "poser", "« " + o.catalogue + " » absent du catalogue (voir lib_composants)");
      type = schTypeDuCatalogue(ligne);
    }
    const def = typeof type === "string" && (LIB[type] || ligne) ? defOf(type) : null;
    if (!def || (def === DEF_UNKNOWN && !ligne)) throw dessinRefus(n, "poser", "type « " + o.type + " » inconnu (types intégrés : resistor, capacitor, ic, opamp, regulator…)");
    // une étiquette ou une alimentation nomme un net : seulement par etiqueter, qui vérifie où elle tombe
    if (["port", "gport", "vcc", "gnd"].includes(type)) throw dessinRefus(n, "poser", "un « " + type + " » se pose avec etiqueter (broche, net, genre)");
    if (o.ref !== undefined) {
      if (def.noRef && !ligne) throw dessinRefus(n, "poser", "un « " + o.type + " » n'a pas de repère");
      if (!dessinNomValide(o.ref, DESSIN_REF)) throw dessinRefus(n, "poser", "repère : lettre puis lettres, chiffres ou _, 20 au plus (pas un nom réservé)");
      if ([...usedRefs()].some(r => dessinCle(r) === dessinCle(o.ref))) throw dessinRefus(n, "poser", "repère « " + o.ref + " » déjà pris");
    }
    if (o.valeur !== undefined && (typeof o.valeur !== "string" || !/^[^\x00-\x1f\x7f]{1,200}$/.test(o.valeur)))
      throw dessinRefus(n, "poser", "« valeur » : texte d'une ligne, 200 caractères au plus");
    if (o.rotation !== undefined && !DESSIN_ANGLES.includes(o.rotation)) throw dessinRefus(n, "poser", "« rotation » : 0, 90, 180 ou 270");
    if ((o.x === undefined) !== (o.y === undefined)) throw dessinRefus(n, "poser", "donne x et y, ou aucun des deux (place libre)");
    const el = addComp(type, 0, 0);
    if (ligne) schPoserDepuisCatalogue(el, ligne);           // comme la pose à la souris depuis l'explorateur
    if (o.ref !== undefined) el.ref = o.ref;
    else if (el.ref && !dessinNomValide(el.ref, DESSIN_REF)) throw dessinRefus(n, "poser", "le repère tiré du catalogue (« " + el.ref + " ») n'est pas valide : donne « ref »");
    if (o.valeur !== undefined) el.value = o.valeur;
    el.rot = o.rotation || 0;
    el.mir = o.miroir === true;
    if (o.x !== undefined) {
      el.x = snap(dessinNombre(o.x, n, "poser", "x", 1000) * DESSIN_MM);
      el.y = snap(dessinNombre(o.y, n, "poser", "y", 1000) * DESSIN_MM);
      const autre = dessinChevauche(el);
      if (autre) throw dessinRefus(n, "poser", "chevauche " + (autre.ref || autre.type) + " ; sans x ni y, la page cherche une place libre");
    } else if (!dessinPlaceLibre(el, ctx.dernier && S.comps.includes(ctx.dernier) ? ctx.dernier : null)) throw dessinRefus(n, "poser", "aucune place libre trouvée : donne x et y");
    touchWires();
    ctx.dernier = el;
    // le symbole du catalogue, s'il n'est pas celui que la page a pris : elle n'en connaît pas de tel
    const symCat = ligne ? String(ligne["Empreinte Schématique"] || ligne["Empreinte Schematique"] || "").toLowerCase()
      .replace(/^.*[\\/]/, "").replace(/\.json$/i, "").trim() : "";
    const origine = ligne ? "catalogue " + ligne["Part Name"] +
      (symCat && symCat !== type ? " (symbole « " + symCat + " » inconnu de la page : " + type + " générique)" : "") + ", " : "";
    return { quoi: (n + 1) + ". poser " + (el.ref || el.type), avant: null,
             apres: origine + el.type + (el.value ? " " + el.value : "") + (el.pkg ? " (" + el.pkg + ")" : "") + ", " + dessinOuEst(el) };
  },

  deplacer(o, n) {
    const el = dessinComp(o.ref, n, "deplacer");
    const abs = o.x !== undefined || o.y !== undefined, rel = o.dx !== undefined || o.dy !== undefined;
    if (abs === rel) throw dessinRefus(n, "deplacer", "donne x et y (position), ou dx et dy (décalage)");
    const avant = dessinOuEst(el);
    const cx = abs ? snap(dessinNombre(o.x, n, "deplacer", "x", 1000) * DESSIN_MM) : el.x + snap(dessinNombre(o.dx, n, "deplacer", "dx", 1000) * DESSIN_MM);
    const cy = abs ? snap(dessinNombre(o.y, n, "deplacer", "y", 1000) * DESSIN_MM) : el.y + snap(dessinNombre(o.dy, n, "deplacer", "dy", 1000) * DESSIN_MM);
    const x0 = el.x, y0 = el.y;
    el.x = cx; el.y = cy;
    const autre = dessinChevauche(el);
    el.x = x0; el.y = y0;
    if (autre) throw dessinRefus(n, "deplacer", "chevaucherait " + (autre.ref || autre.type));
    // moveSelBy fait suivre les fils comme une flèche du clavier ; il agit sur la sélection
    clearSel(); S.sel.add(el.id);
    moveSelBy(cx - x0, cy - y0);
    clearSel();
    touchWires();
    return { quoi: (n + 1) + ". deplacer " + el.ref, avant, apres: dessinOuEst(el) };
  },

  tourner(o, n) {
    const el = dessinComp(o.ref, n, "tourner");
    if (![90, 180, 270].includes(o.angle)) throw dessinRefus(n, "tourner", "« angle » : 90, 180 ou 270");
    const avant = dessinOuEst(el);
    dessinTransformer(el, e => { e.rot = (((e.rot | 0) + o.angle) % 360 + 360) % 360; });
    return { quoi: (n + 1) + ". tourner " + el.ref, avant, apres: dessinOuEst(el) };
  },

  miroir(o, n) {
    const el = dessinComp(o.ref, n, "miroir");
    const avant = dessinOuEst(el);
    dessinTransformer(el, e => { e.mir = !e.mir; });
    return { quoi: (n + 1) + ". miroir " + el.ref, avant, apres: dessinOuEst(el) };
  },

  relier(o, n) {
    const a = dessinBroche(o.de, n, "relier"), b = dessinBroche(o.a, n, "relier");
    if (a.cle === b.cle) throw dessinRefus(n, "relier", "une broche avec elle-même");
    const avant = dessinNets(), copie = dessinFils();
    if (avant.has(a.cle) && avant.has(b.cle) && avant.get(a.cle).k === avant.get(b.cle).k)
      throw dessinRefus(n, "relier", a.nom + " et " + b.nom + " sont déjà reliées");
    let ecart = "";
    // les deux L possibles : par l'horizontale d'abord, puis par la verticale
    for (const horiz of [Math.abs(b.pos.x - a.pos.x) >= Math.abs(b.pos.y - a.pos.y), Math.abs(b.pos.x - a.pos.x) < Math.abs(b.pos.y - a.pos.y)]) {
      for (const sg of routeAxis(a.pos, b.pos, horiz)) if (sg.x1 !== sg.x2 || sg.y1 !== sg.y2) S.wires.push(sg);
      touchWires(); resolveSplits(); touchWires();
      ecart = dessinEcart(avant, [[a.cle, b.cle]]);
      if (!ecart) break;
      dessinRemettreFils(copie);
    }
    if (ecart) throw dessinRefus(n, "relier", a.nom + " → " + b.nom + " : le fil " + ecart + " ; essaie une étiquette (etiqueter)");
    dessinSansConflit(a, n, "relier");
    return { quoi: (n + 1) + ". relier " + a.nom + " — " + b.nom, avant: null, apres: "net " + dessinNetDe(a) };
  },

  /* Une étiquette au bout d'un fil de 2 mm qui part vers l'extérieur du composant, tournée
     pour que sa broche touche le fil et que son corps s'éloigne. */
  etiqueter(o, n) {
    const GENRES = { local: "port", global: "gport", vcc: "vcc", gnd: "gnd" };
    const type = Object.prototype.hasOwnProperty.call(GENRES, o.genre) ? GENRES[o.genre] : null;
    if (!type) throw dessinRefus(n, "etiqueter", "« genre » : local, global, vcc ou gnd");
    const net = o.net === undefined && o.genre === "gnd" ? "GND" : o.net;
    if (!dessinNomValide(net, /^[^\x00-\x1f\x7f\s][^\x00-\x1f\x7f]{0,39}$/))
      throw dessinRefus(n, "etiqueter", "« net » : nom de 1 à 40 caractères, sans espace au début");
    const b = dessinBroche(o.broche, n, "etiqueter");
    const dx = b.pos.x - b.el.x, dy = b.pos.y - b.el.y;
    const dehors = Math.abs(dx) >= Math.abs(dy) ? { x: dx < 0 ? -1 : 1, y: 0 } : { x: 0, y: dy < 0 ? -1 : 1 };
    const avant = dessinNets();
    // les broches déjà sur un net de ce nom, sur cette feuille : l'étiquette doit les rejoindre
    const memes = [];
    nets().list.forEach(nt => { if ((nt.names || []).some(x => dessinCle(x) === dessinCle(net)) || dessinCle(nt.name) === dessinCle(net))
      for (const nd of nt.nodes) memes.push(nd.id + "." + nd.pin); });
    const el = addComp(type, 0, 0);
    el.value = net;
    // VCC vers le haut, GND vers le bas, un port vers l'extérieur ; puis les autres côtés, le premier
    // où ni le fil ni l'étiquette ne passent sur un fil ou un composant (sinon : vers l'extérieur)
    const HAUT = { x: 0, y: -1 }, BAS = { x: 0, y: 1 };
    const prefere = type === "vcc" ? [HAUT, dehors] : type === "gnd" ? [BAS, dehors] : [dehors];
    const essais = prefere.concat([{ x: dehors.y, y: dehors.x }, { x: -dehors.y, y: -dehors.x }, HAUT, BAS, { x: -dehors.x, y: -dehors.y }]);
    const placer = dir => {
      const bout = { x: snap(b.pos.x + dir.x * 2 * DESSIN_MM), y: snap(b.pos.y + dir.y * 2 * DESSIN_MM) };
      for (const r of DESSIN_ANGLES) {               // l'orientation dont le corps part dans la direction du fil
        el.rot = r; el.x = 0; el.y = 0;
        const q = pinPos(el, 0);
        if (Math.sign(-q.x) === dir.x && Math.sign(-q.y) === dir.y) break;
      }
      const q = pinPos(el, 0);
      el.x = bout.x - q.x; el.y = bout.y - q.y;
      return bout;
    };
    const dir = essais.find(d => dessinPlaceEtiquette(el, b.pos, placer(d))) || dehors;
    const bout = placer(dir);
    if (bout.x !== b.pos.x || bout.y !== b.pos.y) S.wires.push({ x1: b.pos.x, y1: b.pos.y, x2: bout.x, y2: bout.y });
    touchWires(); resolveSplits(); touchWires();
    const ecart = dessinEcart(avant, memes.map(m => [b.cle, m]), [b.cle, net]);
    if (ecart) throw dessinRefus(n, "etiqueter", b.nom + " : l'étiquette " + ecart);
    dessinSansConflit(b, n, "etiqueter");
    return { quoi: (n + 1) + ". etiqueter " + b.nom, avant: null,
             apres: { port: "étiquette locale", gport: "étiquette globale", vcc: "alimentation", gnd: "masse" }[type] + " " + net };
  },

  supprimer_fil(o, n) {
    const a = dessinBroche(o.de, n, "supprimer_fil"), b = dessinBroche(o.a, n, "supprimer_fil");
    const k = p => p.x + "," + p.y;
    // le fil direct : de point en point, sans passer par une jonction ni par une autre broche
    const autresBroches = new Set();
    for (const el of S.comps) allPins(el).forEach(p => autresBroches.add(k(p)));
    autresBroches.delete(k(a.pos)); autresBroches.delete(k(b.pos));
    const deg = new Map();
    for (const w of S.wires) for (const p of [k({ x: w.x1, y: w.y1 }), k({ x: w.x2, y: w.y2 })]) deg.set(p, (deg.get(p) || 0) + 1);
    // chaque fil qui part de a est essayé : de point en point, sans jonction ni autre broche
    const bouts = w => [k({ x: w.x1, y: w.y1 }), k({ x: w.x2, y: w.y2 })];
    const marcher = (ici, vus) => {
      if (ici === k(b.pos)) return [];
      if (ici !== k(a.pos) && (deg.get(ici) > 2 || autresBroches.has(ici))) return null;
      for (const w of S.wires) {
        if (vus.has(w) || !bouts(w).includes(ici)) continue;
        const suite = marcher(bouts(w)[0] === ici ? bouts(w)[1] : bouts(w)[0], new Set([...vus, w]));
        if (suite) return [w, ...suite];
      }
      return null;
    };
    const chemin = marcher(k(a.pos), new Set()) || [];
    // une broche posée au milieu d'un segment du chemin en serait détachée sans le dire
    const surSegment = (w, p) => (w.x1 === w.x2 ? p.x === w.x1 && p.y > Math.min(w.y1, w.y2) && p.y < Math.max(w.y1, w.y2)
                                                : w.y1 === w.y2 && p.y === w.y1 && p.x > Math.min(w.x1, w.x2) && p.x < Math.max(w.x1, w.x2));
    const touchee = [...autresBroches].map(t => ({ x: +t.split(",")[0], y: +t.split(",")[1] })).find(p => chemin.some(w => surSegment(w, p)));
    if (touchee) throw dessinRefus(n, "supprimer_fil", "le fil passe par une autre broche (x " + dessinMm(touchee.x) + " y " + dessinMm(touchee.y) + " mm) : il la détacherait");
    if (!chemin.length) throw dessinRefus(n, "supprimer_fil", "pas de fil direct entre " + a.nom + " et " + b.nom + " (sans jonction ni autre broche)");
    const net = dessinNetDe(a), avant = dessinNets();
    for (const w of chemin) S.wires.splice(S.wires.indexOf(w), 1);
    touchWires();
    const ecart = dessinEcart(avant, []);
    // retirer un fil ne peut que séparer : on vérifie seulement qu'aucune fusion n'apparaît
    if (/^relierait/.test(ecart)) throw dessinRefus(n, "supprimer_fil", ecart);
    return { quoi: (n + 1) + ". supprimer_fil " + a.nom + " — " + b.nom, avant: "net " + net,
             apres: a.nom + " sur " + dessinNetDe(a) + ", " + b.nom + " sur " + dessinNetDe(b) };
  },

  /* {creer: nom} : une feuille neuve, où vont les opérations suivantes ; {renommer: n°, nom}. */
  feuille(o, n) {
    const nom = o.nom !== undefined ? o.nom : o.creer;
    if (typeof nom !== "string" || !/^[^\x00-\x1f\x7f]{1,60}$/.test(nom.trim())) throw dessinRefus(n, "feuille", "nom de feuille : 1 à 60 caractères");
    if (o.creer !== undefined && o.nom !== undefined) throw dessinRefus(n, "feuille", "« creer » porte le nom : pas de « nom » avec lui");
    if (o.creer !== undefined && o.renommer === undefined) {
      storeCurrent();
      S.pages.push(newPage(nom.trim()));
      gotoPage(S.pages.length - 1);
      return { quoi: (n + 1) + ". feuille f" + S.pages.length, avant: null, apres: "créée « " + nom.trim() + " »" };
    }
    if (o.renommer !== undefined && o.creer === undefined) {
      if (!Number.isInteger(o.renommer) || !S.pages[o.renommer - 1]) throw dessinRefus(n, "feuille", "feuille " + o.renommer + " inconnue : 1 à " + S.pages.length);
      const p = S.pages[o.renommer - 1], avant = p.name;
      p.name = nom.trim();
      return { quoi: (n + 1) + ". feuille f" + o.renommer, avant: "« " + avant + " »", apres: "« " + p.name + " »" };
    }
    throw dessinRefus(n, "feuille", "donne « creer » (nom), ou « renommer » (n°) et « nom »");
  },

  /* Repères refaits par préfixe dans tout le document : feuille par feuille, puis de haut en
     bas et de gauche à droite. Le PCB garde les anciens jusqu'à sa resynchronisation. */
  renumeroter(o, n) {
    storeCurrent();
    // les parties d'un même boîtier (U3A, U3B : même repère, el.part) gardent un seul repère
    const parPrefixe = new Map(), nouveau = new Map(), lignes = [], anciens = new Set();
    const tous = [];
    S.pages.forEach((p, i) => {
      tous.push(...(i === S.page ? S.comps : p.comps || []).filter(c => c.ref && !defOf(c.type).noRef)
        .sort((a, b) => (a.y - b.y) || (a.x - b.x)));
    });
    for (const c of tous) anciens.add(dessinCle(c.ref));
    for (const c of tous) {
      const vieux = dessinCle(c.ref);
      if (!nouveau.has(vieux)) {
        const pre = (String(c.ref).match(/^[A-Za-z_]+/) || [defOf(c.type).p || "X"])[0];
        const k = (parPrefixe.get(pre.toUpperCase()) || 0) + 1;     // « r5 » et « R3 » : un seul compteur
        parPrefixe.set(pre.toUpperCase(), k);
        nouveau.set(vieux, pre + k);
        if (dessinCle(pre + k) !== vieux) lignes.push({ quoi: (n + 1) + ". renumeroter " + c.ref, avant: c.ref, apres: pre + k });
      }
      c.ref = nouveau.get(vieux);
    }
    if (!lignes.length) throw dessinRefus(n, "renumeroter", "les repères sont déjà dans l'ordre");
    // un repère repris par un autre composant : au PCB, l'empreinte déjà placée recevrait ses nets
    const repris = lignes.filter(l => anciens.has(dessinCle(l.apres))).map(l => l.apres);
    lignes.push({ quoi: (n + 1) + ". PCB", avant: null, apres: "garde les anciens repères jusqu'à sa resynchronisation" +
      (repris.length ? " ; attention, " + repris.join(", ") + " y désignent alors d'autres composants : leurs pistes resteraient sur les anciennes empreintes" : "") });
    return lignes;
  },

  /* {x1, y1, x2, y2 (mm), titre?, zone?} : un cadre de la feuille. zone : une zone fonctionnelle,
     qui devient une room au PCB ; sinon un simple cadre de note (isZone false), qui n'en devient pas une.
     Le texte libre, lui, se pose : poser {type: annot_text ou annot_note, valeur}. */
  cadre(o, n) {
    const v = ["x1", "y1", "x2", "y2"].map(k => dessinNombre(o[k], n, "cadre", k, 1000));
    if (Math.abs(v[2] - v[0]) < 2 || Math.abs(v[3] - v[1]) < 2) throw dessinRefus(n, "cadre", "2 mm de côté au moins");
    if (o.titre !== undefined && (typeof o.titre !== "string" || !/^[^\x00-\x1f\x7f]{1,60}$/.test(o.titre)))
      throw dessinRefus(n, "cadre", "« titre » : texte d'une ligne, 60 caractères au plus");
    if (o.zone !== undefined && typeof o.zone !== "boolean") throw dessinRefus(n, "cadre", "« zone » : true ou false");
    const zone = o.zone === true, [x1, y1, x2, y2] = v.map(x => snap(x * DESSIN_MM));
    if (!S.drawings) S.drawings = [];
    S.drawings.push({ id: S.uid++, shape: "rect", type: "rect", x1, y1, x2, y2, style: "dashed", width: 2,
                      color: zone ? "#f59e0b" : "#2f86cc", label: o.titre || (zone ? "ZONE" : ""), isZone: zone });
    return { quoi: (n + 1) + ". cadre" + (o.titre ? " « " + o.titre + " »" : ""), avant: null,
             apres: "de (" + dessinMm(Math.min(x1, x2)) + ", " + dessinMm(Math.min(y1, y2)) + ") à (" + dessinMm(Math.max(x1, x2)) + ", " +
                    dessinMm(Math.max(y1, y2)) + ") mm" + (zone ? ", zone fonctionnelle (une room au PCB)" : ", cadre de note") };
  },

  supprimer(o, n) {
    const el = dessinComp(o.ref, n, "supprimer");
    const avant = el.type + (el.value ? " " + el.value : "") + ", " + dessinOuEst(el);
    deleteComps([el.id]);
    touchWires();
    return { quoi: (n + 1) + ". supprimer " + el.ref, avant, apres: null };
  },
};

/* Joue tout le lot sur le document vivant. Le premier refus arrête le jeu. */
function dessinJouer(ops) {
  const lignes = [], ctx = { dernier: null };
  ops.forEach((o, n) => {
    const f = o && typeof o.op === "string" && Object.prototype.hasOwnProperty.call(DESSIN_OPS, o.op) ? DESSIN_OPS[o.op] : null;
    if (!f) throw dessinRefus(n, String(o && o.op), "opération inconnue (" + Object.keys(DESSIN_OPS).join(", ") + ")");
    if (o.feuille !== undefined) {                       // l'opération vise une feuille : on y passe
      if (!Number.isInteger(o.feuille) || !S.pages[o.feuille - 1]) throw dessinRefus(n, o.op, "feuille " + o.feuille + " inconnue : 1 à " + S.pages.length);
      if (o.feuille - 1 !== S.page) gotoPage(o.feuille - 1);
    }
    // ce qui bouge des broches passe la même garde que relier : un composant posé sur un fil le rejoindrait
    const garde = ["poser", "deplacer", "tourner", "miroir"].includes(o.op) ? dessinNets() : null;
    lignes.push(...[].concat(f(o, n, ctx)));
    const ecart = garde ? dessinEcart(garde, []) : "";
    if (ecart) throw dessinRefus(n, o.op, "toucherait un fil ou une broche : " + ecart);
  });
  return lignes;
}

/* Joue le lot sur un CLONE des feuilles, relève ses lignes, puis remet les objets d'origine
   eux-mêmes : pas de restore() (qui recopierait tout, relancerait l'analyse des motifs et
   laisserait orphelins les objets tenus par une fenêtre ouverte). Historique, drapeau,
   sélection, vue et geste en cours (pose, fil, glissé) reviennent tels quels. */
function dessinSimuler(args) {
  storeCurrent();
  const garde = { pages: S.pages, page: S.page, comps: S.comps, wires: S.wires, drawings: S.drawings, uid: S.uid,
                  dirty: S.dirty, hist: S.hist, redo: S.redo, vue: [S.scale, S.ox, S.oy],
                  sel: new Set(S.sel), selW: new Set(S.selW), selD: S.selD ? new Set(S.selD) : null, selBlock: S.selBlock,
                  geste: { place: S.place, placeLibItem: S.placeLibItem, wireStart: S.wireStart, drawStart: S.drawStart,
                           drag: S.drag, marquee: S.marquee } };
  S.pages = JSON.parse(JSON.stringify(S.pages));
  const p = S.pages[S.page];
  S.comps = p.comps; S.wires = p.wires; S.drawings = p.drawings || []; S.uid = p.uid || 1;
  S.hist = S.hist.slice(); S.redo = S.redo.slice();
  touchWires();
  try {
    return { lignes: dessinJouer(args.lot), refus: [] };
  } catch (e) {
    if (!e.dessin) throw e;
    return { lignes: [], refus: [e.message] };
  } finally {
    Object.assign(S, { pages: garde.pages, page: garde.page, comps: garde.comps, wires: garde.wires, drawings: garde.drawings,
                       uid: garde.uid, dirty: garde.dirty, hist: garde.hist, redo: garde.redo, sel: garde.sel, selW: garde.selW,
                       selBlock: garde.selBlock }, garde.geste);
    if (garde.selD) S.selD = garde.selD;
    [S.scale, S.ox, S.oy] = garde.vue;
    touchWires();
    setPalette(garde.geste.place || null);
    buildTabs(); refreshPanels(); draw();
  }
}

/* La commande du canal, faite au premier appel : ECRITURE_CAO est chargé après ce fichier. */
function dessinPiloteCommande() {
  return ECRITURE_CAO.lot({
    titre: "Dessin du schéma",
    max: DESSIN_MAX,
    verifier: dessinSimuler,
    muter: args => { dessinJouer(args.lot); },
    rafraichir: () => { buildTabs(); buildList(); refreshPanels(); draw(); },
  });
}
