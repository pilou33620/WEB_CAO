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
const DESSIN_MM = 20;                        // px par mm (G)
const DESSIN_ANGLES = [0, 90, 180, 270];
const DESSIN_REF = /^[A-Za-z][A-Za-z0-9_]{0,19}$/;

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
function dessinChevauche(el) {
  const a = hitBox(el);
  return S.comps.find(o => o !== el && (() => { const b = hitBox(o); return a.x1 < b.x2 && b.x1 < a.x2 && a.y1 < b.y2 && b.y1 < a.y2; })());
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
  for (let r = 0; r < 40; r++)
    for (let c = 0; c < 40; c++) {
      el.x = snap(x0 + c * 5 * DESSIN_MM); el.y = snap(y0 + r * 5 * DESSIN_MM);
      if (!dessinChevauche(el)) return true;
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
    if (!def || (def === DEF_UNKNOWN && !ligne)) throw dessinRefus(n, "poser", "type « " + o.type + " » inconnu (types intégrés : resistor, capacitor, ic, opamp, gnd, vcc, port…)");
    if (o.ref !== undefined) {
      if (def.noRef && !ligne) throw dessinRefus(n, "poser", "un « " + o.type + " » n'a pas de repère");
      if (typeof o.ref !== "string" || !DESSIN_REF.test(o.ref)) throw dessinRefus(n, "poser", "repère : lettre puis lettres, chiffres ou _, 20 au plus");
      if ([...usedRefs()].some(r => dessinCle(r) === dessinCle(o.ref))) throw dessinRefus(n, "poser", "repère « " + o.ref + " » déjà pris");
    }
    if (o.valeur !== undefined && (typeof o.valeur !== "string" || !/^[^\x00-\x1f\x7f]{1,200}$/.test(o.valeur)))
      throw dessinRefus(n, "poser", "« valeur » : texte d'une ligne, 200 caractères au plus");
    if (o.rotation !== undefined && !DESSIN_ANGLES.includes(o.rotation)) throw dessinRefus(n, "poser", "« rotation » : 0, 90, 180 ou 270");
    if ((o.x === undefined) !== (o.y === undefined)) throw dessinRefus(n, "poser", "donne x et y, ou aucun des deux (place libre)");
    const el = addComp(type, 0, 0);
    if (ligne) schPoserDepuisCatalogue(el, ligne);           // comme la pose à la souris depuis l'explorateur
    if (o.ref !== undefined) el.ref = o.ref;
    if (o.valeur !== undefined) el.value = o.valeur;
    el.rot = o.rotation || 0;
    el.mir = o.miroir === true;
    if (o.x !== undefined) {
      el.x = snap(dessinNombre(o.x, n, "poser", "x", 1000) * DESSIN_MM);
      el.y = snap(dessinNombre(o.y, n, "poser", "y", 1000) * DESSIN_MM);
      const autre = dessinChevauche(el);
      if (autre) throw dessinRefus(n, "poser", "chevauche " + (autre.ref || autre.type) + " ; sans x ni y, la page cherche une place libre");
    } else if (!dessinPlaceLibre(el, ctx.dernier)) throw dessinRefus(n, "poser", "aucune place libre trouvée : donne x et y");
    touchWires();
    ctx.dernier = el;
    const origine = ligne ? "catalogue " + ligne["Part Name"] + (def === DEF_UNKNOWN ? " (symbole générique : la page ne connaît pas le sien)" : "") + ", " : "";
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
    lignes.push(f(o, n, ctx));
  });
  return lignes;
}

/* Joue le lot, relève ses lignes, puis remet le document tel qu'il était : feuilles,
   drapeau « modifié », historique, sélection et vue. */
function dessinSimuler(args) {
  const garde = { doc: serialize(), dirty: S.dirty, hist: S.hist.slice(), redo: S.redo.slice(),
                  sel: [...S.sel], selW: S.wires.map((w, i) => S.selW.has(w) ? i : -1).filter(i => i >= 0),
                  vue: [S.scale, S.ox, S.oy] };
  try {
    return { lignes: dessinJouer(args.lot), refus: [] };
  } catch (e) {
    if (!e.dessin) throw e;
    return { lignes: [], refus: [e.message] };
  } finally {
    restore(garde.doc);
    S.dirty = garde.dirty; S.hist = garde.hist; S.redo = garde.redo;
    clearSel();
    garde.sel.forEach(id => S.sel.add(id));
    garde.selW.forEach(i => S.wires[i] && S.selW.add(S.wires[i]));
    [S.scale, S.ox, S.oy] = garde.vue;
    draw();
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
