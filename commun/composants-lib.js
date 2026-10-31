"use strict";
/* =============================================================================
   commun/composants-lib.js
   Création de composants dans la LIB (module « composants » du MCP web_suite,
   lanceur/docs/SPEC-mcp-composants.md) : contrôles d'une empreinte pcbfp-1,
   d'une ligne de catalogue et d'un brochage.

   Rien ici ne touche au DOM ni au serveur : on lit des objets, on rend
   { erreurs, remarques }. Une erreur refuse ; une remarque se montre et laisse
   passer. Gestion LIB s'en sert (commandes du canal-pilote, carte de
   création) ; le banc gestion-lib/test/banc-composants.js l'éprouve sous Node.

   Les contrôles d'empreinte suivent la lecture du PCB (normFpDef,
   editeur-pcb/js/08-empreinte.js) : ce que la lecture corrigerait en silence
   (numéro de pastille non entier, perçage rogné, forme inconnue devenue
   rectangle) est refusé ici, pour que le PCB pose ce que la carte a montré.
   ============================================================================= */

const COMPOSANTS_LIB = (() => {
  /* styles et formes que le PCB connaît (STYLES et PAD_SHAPES, editeur-pcb/js/01-core.js) */
  const STYLES = ["chip", "row", "dip", "sop", "quad", "bga"];
  const FORMES = ["rect", "sharp", "oval", "circ", "chamfer", "poly"];
  const CLES_EMPREINTE = ["format", "name", "pkg", "pins", "style", "pitch", "span",
                          "pads", "body", "holes", "lines", "description"];
  const NOM_EMPREINTE = /^[A-Za-z0-9_.+-]{1,60}$/;
  const CONTROLE = /[\x00-\x1f\x7f]/;
  /* une cellule du catalogue ne doit ni passer pour une formule à l'ouverture dans un tableur
     (« =HYPERLINK(… », « @SUM », « +cmd|… » ; « -40 » et « +/-20% » restent permis), ni cacher
     des caractères invisibles qui feraient un sosie d'une référence existante */
  const FORMULE = /^\s*([=@]|[+-]\s*[A-Za-z(])/;
  const INVISIBLE = /[\u0080-\u009f\u00a0\u00ad\u200b-\u200f\u2028-\u202e\u2060-\u206f\ufeff]/;
  const COORD = 100, COURONNE = 0.1, PASTILLE_MIN = 0.05;

  /* Symboles intégrés du schéma (clés de LIB, editeur-schematique/js/02-bibliotheque.js) :
     les noms de broches quand le symbole en a (pn), sinon le nombre de broches. « ic » a
     autant de broches que l'on veut. Le banc vérifie que cette table suit le schéma. */
  const SYMBOLES = {
    resistor: 2, potentiometer: 3, capacitor: 2, cap_pol: 2, inductor: 2, transformer: 4,
    crystal: 2, fuse: 2, varistor: 2, filter: 3, ferrite_bead: 2,
    diode: ["A", "K"], led: ["A", "K"], zener: ["A", "K"], schottky: ["A", "K"],
    npn: ["B", "C", "E"], pnp: ["B", "C", "E"], nmos: ["G", "D", "S"], pmos: ["G", "S", "D"],
    tvs_diode: ["A", "K"], esd_array: 6, esd_rail4: ["IO1", "IO2", "IO3", "IO4", "VCC", "GND"],
    esd_rail2: ["IO1", "IO2", "VCC", "GND"], mos_np: ["G1", "S1", "D1", "G2", "S2", "D2"],
    opamp: ["IN-", "IN+", "OUT", "V+", "V-"], ic: Infinity, regulator: ["IN", "OUT", "GND"],
    vcc: 1, gnd: 1, port: 1, gport: 1, battery: 2, acsource: 2, switch: 2, button: 2,
    relay: 5, motor: 2, buzzer: 2, lamp: 2, antenna: 1, header: 2, header_1x3: 3,
    header_1x4: 4, header_1x6: 6, header_1x8: 8, header_2x5: 10, usb_c_pwr: 5, usb_c: 8,
    usb_micro: 6, testpoint: 1, testpoint_pth: 1, hole: 1, fiducial: 0, strap: 2,
    annot_volt: 1, annot_curr: 0, annot_text: 0, annot_note: 0
  };

  const fini = v => typeof v === "number" && Number.isFinite(v);
  const r2 = v => Math.round(v * 100) / 100;

  /* ---------- empreinte pcbfp-1 ---------- */
  function verifierEmpreinte(def, nomFichier) {
    const erreurs = [], remarques = [];
    if (!def || typeof def !== "object" || Array.isArray(def))
      return { erreurs: ["l'empreinte doit être un objet pcbfp-1"], remarques };
    if (def.format !== "pcbfp-1") erreurs.push("« format » doit valoir « pcbfp-1 »");
    const inconnues = Object.keys(def).filter(k => !CLES_EMPREINTE.includes(k));
    if (inconnues.length) erreurs.push("clé(s) inconnue(s) : " + inconnues.join(", "));
    const nom = def.name;
    if (typeof nom !== "string" || !NOM_EMPREINTE.test(nom) || /^\.+$/.test(nom))
      erreurs.push("« name » : 1 à 60 caractères parmi A-Z a-z 0-9 _ . + -");
    else if (nomFichier != null && String(nomFichier) !== nom + ".json")
      erreurs.push("« name » (" + nom + ") ≠ nom du fichier (" + nomFichier + ")");
    if (def.pkg != null && (typeof def.pkg !== "string" || def.pkg.length > 80 || CONTROLE.test(def.pkg)))
      erreurs.push("« pkg » : texte d'une ligne, 80 caractères au plus");
    /* les descriptions livrées vont jusqu'à quelques centaines de caractères, sur plusieurs lignes */
    if (def.description != null && (typeof def.description !== "string" || def.description.length > 2000 ||
        /[\x00-\x08\x0b-\x1f\x7f]/.test(def.description)))
      erreurs.push("« description » : texte de 2000 caractères au plus");
    if (!STYLES.includes(def.style))
      erreurs.push("« style » inconnu du PCB (" + def.style + ") : " + STYLES.join(", "));
    /* avec des pastilles dessinées, pitch et span ne servent pas à la forme (le PCB les borne) */
    for (const k of ["pitch", "span"])
      if (def[k] != null && !(fini(def[k]) && def[k] >= 0 && def[k] <= 1000))
        erreurs.push("« " + k + " » : de 0 à 1000 mm");

    const pads = def.pads;
    if (!Array.isArray(pads) || !pads.length) {
      erreurs.push("« pads » : au moins une pastille");
      return { erreurs, remarques };
    }
    if (pads.length > 4096) erreurs.push("4096 pastilles au plus");
    const numeros = new Map();
    pads.slice(0, 4096).forEach((q, i) => {
      const ici = "pastille " + (q && q.n != null ? q.n : "#" + (i + 1));
      if (!q || typeof q !== "object") { erreurs.push(ici + " : objet attendu"); return; }
      if (!Number.isInteger(q.n) || q.n < 1 || q.n > 4096) erreurs.push(ici + " : « n » entier de 1 à 4096");
      else numeros.set(q.n, (numeros.get(q.n) || 0) + 1);
      if (!fini(q.x) || !fini(q.y) || Math.abs(q.x) > COORD || Math.abs(q.y) > COORD)
        erreurs.push(ici + " : x et y en mm, à ±" + COORD + " mm");
      if (!fini(q.w) || !fini(q.h) || q.w < PASTILLE_MIN || q.h < PASTILLE_MIN || q.w > 200 || q.h > 200) {
        erreurs.push(ici + " : largeur et hauteur de " + PASTILLE_MIN + " à 200 mm");
        return;
      }
      if (!FORMES.includes(q.shape)) erreurs.push(ici + " : forme inconnue (" + q.shape + ") : " + FORMES.join(", "));
      if (q.shape === "poly" && !(Array.isArray(q.pts) && q.pts.length >= 3 &&
          q.pts.every(p => Array.isArray(p) ? fini(p[0]) && fini(p[1]) : p && fini(p.x) && fini(p.y))))
        erreurs.push(ici + " : un polygone demande « pts », 3 points au moins");
      if (q.rot != null && !fini(q.rot)) erreurs.push(ici + " : « rot » en degrés");
      const d = q.drill == null ? 0 : q.drill;
      if (!fini(d) || d < 0) erreurs.push(ici + " : « drill » en mm, 0 pour une pastille CMS");
      else if (d > 0) {
        const m = Math.min(q.w, q.h);
        if (d >= m) erreurs.push(ici + " : perçage (" + d + ") plus grand que la pastille (" + m + ")");
        else if ((m - d) / 2 < COURONNE - 1e-9)
          erreurs.push(ici + " : couronne de " + r2((m - d) / 2) + " mm, " + COURONNE + " mm au moins");
      }
    });
    if (numeros.size) {
      if (!numeros.has(1)) erreurs.push("pas de pastille 1");
      const max = Math.max(...numeros.keys());
      if (max !== numeros.size)
        erreurs.push("numérotation à trous (" + numeros.size + " numéros, le plus grand " + max + ") : le PCB compterait " + max + " broches");
      if (def.pins !== numeros.size)
        erreurs.push("« pins » (" + def.pins + ") ≠ nombre de numéros de pastille (" + numeros.size + ")");
      const doubles = [...numeros].filter(([, c]) => c > 1).map(([n]) => n);
      if (doubles.length)
        remarques.push("numéro(s) en double : " + doubles.join(", ") + " (pastille fractionnée, pastille thermique : à vérifier)");
    }
    if (!erreurs.length) {
      const touchent = chevauchements(pads);
      if (touchent.length)
        erreurs.push("pastilles qui se recouvrent (court-circuit) : " + touchent.slice(0, 6).join(", ") +
                     (touchent.length > 6 ? "…" : ""));
    }
    if (Array.isArray(def.holes))
      def.holes.forEach((h, i) => {
        if (!h || !fini(h.x) || !fini(h.y) || !fini(h.d) || h.d < 0.4 || h.d > 30 || Math.abs(h.x) > COORD || Math.abs(h.y) > COORD)
          erreurs.push("trou " + (i + 1) + " : x, y à ±" + COORD + " mm et diamètre « d » de 0,4 à 30 mm");
      });
    else if (def.holes != null) erreurs.push("« holes » : liste de trous {x, y, d}");
    /* traits de sérigraphie écrits par l'éditeur de Gestion LIB ; l'éditeur PCB (normFpDef) ne les lit pas */
    if (Array.isArray(def.lines)) {
      def.lines.forEach((l, i) => {
        if (!l || !["x1", "y1", "x2", "y2"].every(k => fini(l[k]) && Math.abs(l[k]) <= COORD) || (l.width != null && !(fini(l.width) && l.width >= 0 && l.width <= 5)))
          erreurs.push("trait " + (i + 1) + " : x1, y1, x2, y2 à ±" + COORD + " mm et largeur « width » de 0 à 5 mm");
      });
      if (def.lines.length) remarques.push("traits de sérigraphie (« lines ») : visibles dans Gestion LIB seulement, l'éditeur PCB ne les lit pas");
    } else if (def.lines != null) erreurs.push("« lines » : liste de traits {x1, y1, x2, y2, width}");

    const b = def.body;
    if (b == null) remarques.push("pas de corps (« body ») : le PCB n'en dessinera pas");
    else if (![b.x1, b.y1, b.x2, b.y2].every(fini) || b.x2 - b.x1 < 0.1 || b.y2 - b.y1 < 0.1 ||
             [b.x1, b.y1, b.x2, b.y2].some(v => Math.abs(v) > COORD))
      erreurs.push("« body » : {x1, y1, x2, y2} en mm, x1 < x2 et y1 < y2");
    else if (!erreurs.length) {
      const hors = pads.filter(q => !(q.drill > 0) &&
        (q.x - q.w / 2 < b.x1 - 1e-6 || q.x + q.w / 2 > b.x2 + 1e-6 || q.y - q.h / 2 < b.y1 - 1e-6 || q.y + q.h / 2 > b.y2 + 1e-6));
      if (hors.length)
        remarques.push(hors.length + " pastille(s) CMS dépassent du corps (normal pour des pattes ou des terminaisons ; à vérifier sinon)");
    }
    return { erreurs, remarques };
  }

  /* Paires de pastilles de numéros différents dont les rectangles se recouvrent (un même numéro,
     c'est une pastille fractionnée : permis). Une pastille tournée d'un angle quelconque compte
     pour son cercle englobant. Balayage selon x : pas de comparaison de tout avec tout. */
  function chevauchements(pads) {
    const boites = pads.map(q => {
      const r = ((q.rot || 0) % 180 + 180) % 180;
      const [w, h] = r === 0 ? [q.w, q.h] : r === 90 ? [q.h, q.w] : [Math.hypot(q.w, q.h), Math.hypot(q.w, q.h)];
      return { n: q.n, x1: q.x - w / 2, x2: q.x + w / 2, y1: q.y - h / 2, y2: q.y + h / 2 };
    }).sort((a, b) => a.x1 - b.x1);
    const out = [], EPS = 1e-6;
    for (let i = 0; i < boites.length && out.length < 50; i++)
      for (let j = i + 1; j < boites.length && boites[j].x1 < boites[i].x2 - EPS; j++) {
        const a = boites[i], b = boites[j];
        if (a.n !== b.n && b.y1 < a.y2 - EPS && a.y1 < b.y2 - EPS) out.push(a.n + "/" + b.n);
      }
    return out;
  }

  /* ---------- brochage ---------- */
  /* Le brochage d'une référence (commun/brochage.js) face à l'empreinte et au symbole :
     chaque patte existe dans l'empreinte, chaque broche existe dans le symbole. */
  /* Un symbole de la LIB (schsym-1) vu comme un intégré : ses noms de broches s'ils sont tous
     donnés, sinon son nombre de broches. */
  const brochesSymbole = def => {
    const pins = Array.isArray(def && def.pins) ? def.pins.slice().sort((a, b) => a.n - b.n) : [];
    const noms = pins.map(p => typeof p.name === "string" ? p.name : typeof p.nom === "string" ? p.nom : "");
    return noms.length && noms.every(Boolean) ? noms : pins.length;
  };
  function verifierBrochage(texte, empreinte, type, symboleDef) {
    const erreurs = [], remarques = [];
    const sym = typeof type === "string" && Object.prototype.hasOwnProperty.call(SYMBOLES, type) ? SYMBOLES[type]
              : symboleDef ? brochesSymbole(symboleDef) : undefined;
    if (sym === undefined) erreurs.push("symbole intégré inconnu : « " + type + " »");
    if (texte != null && (typeof texte !== "string" || texte.length > 500 || CONTROLE.test(texte) || texte.includes(";")))
      return { erreurs: erreurs.concat("brochage : texte d'une ligne, sans « ; », 500 caractères au plus"), remarques };
    const lu = brochageLire(texte);
    if (!lu) {
      if (Array.isArray(sym)) remarques.push("pas de brochage : la broche n du symbole ira sur la patte n");
      return { erreurs, remarques };
    }
    erreurs.push(...lu.erreurs);
    const pads = empreinte && Array.isArray(empreinte.pads) ? empreinte.pads : [];
    const pattes = new Set();
    for (const q of pads) {
      if (q && q.n != null) pattes.add(String(q.n));
      if (q && q.nom) pattes.add(String(q.nom));
    }
    const vues = brochagePattes(lu);
    if (pads.length) {
      const absentes = vues.filter(p => !pattes.has(p));
      if (absentes.length) erreurs.push("patte(s) absente(s) de l'empreinte : " + absentes.join(", "));
      const libres = [...new Set(pads.map(q => String(q.n)))].filter(n => !vues.includes(n));
      if (libres.length) remarques.push("pastille(s) sans broche ni NC : " + libres.join(", "));
    }
    if (sym !== undefined && sym !== Infinity)
      for (const p of lu.parties) {
        const ici = p.nom ? " (partie " + p.nom + ")" : "";
        const noms = Array.isArray(sym) ? sym.map(brochageNom) : [];
        const nb = Array.isArray(sym) ? sym.length : sym;
        for (const br of Object.keys(p.broches)) {
          const num = /^\d+$/.test(br) ? +br : 0;
          if (!noms.includes(br) && !(num >= 1 && num <= nb))
            erreurs.push("broche « " + br + " »" + ici + " inconnue du symbole " + type +
              (noms.length ? " (" + noms.join(", ") + ")" : " (broches 1 à " + nb + ")"));
        }
        if (noms.length) {
          const manquent = noms.filter((n, i) => p.broches[n] == null && p.broches[String(i + 1)] == null);
          if (manquent.length) remarques.push("broche(s) du symbole sans patte" + ici + " : " + manquent.join(", "));
        }
      }
    return { erreurs, remarques };
  }

  /* ---------- symbole schsym-1 ----------
     Les règles du schéma qui le dessinera (editeur-schematique/js/29-symboles-lib.js) : broches
     numérotées de 1 à N sans trou, coordonnées finies, primitives connues. */
  const OPS_SYMBOLE = { line: ["x1", "y1", "x2", "y2"], rect: ["x", "y", "w", "h"], arc: ["cx", "cy", "r", "start", "end"],
                        circle: ["x", "y", "r"], text: ["x", "y"], arrow: ["x", "y"], poly: [] };
  function verifierSymbole(sym, nomFichier) {
    const erreurs = [], remarques = [];
    const coord = v => fini(v) && Math.abs(v) <= 4000;
    if (!sym || typeof sym !== "object" || Array.isArray(sym)) return { erreurs: ["le symbole doit être un objet schsym-1"], remarques };
    if (sym.format !== "schsym-1") erreurs.push("« format » doit valoir « schsym-1 »");
    if (typeof sym.id !== "string" || !NOM_EMPREINTE.test(sym.id)) erreurs.push("« id » : le nom du fichier, [A-Za-z0-9_.+-]");
    else if (nomFichier && sym.id + ".json" !== nomFichier) erreurs.push("« id » doit être le nom du fichier (" + nomFichier + ")");
    if (typeof sym.id === "string" && Object.prototype.hasOwnProperty.call(SYMBOLES, sym.id.toLowerCase()))
      erreurs.push("« " + sym.id + " » est un symbole intégré : un fichier de ce nom ne le remplacerait pas");
    const pins = Array.isArray(sym.pins) ? sym.pins : [];
    if (!pins.length || pins.length > 1024) erreurs.push("« pins » : de 1 à 1024 broches {n, x, y, name?}");
    const vus = new Set();
    for (const p of pins) {
      if (!p || !Number.isInteger(p.n) || p.n < 1 || !coord(p.x) || !coord(p.y)) { erreurs.push("broche illisible : " + JSON.stringify(p).slice(0, 60)); continue; }
      if (vus.has(p.n)) erreurs.push("broche " + p.n + " en double");
      vus.add(p.n);
      if ((p.x % 20 || p.y % 20) && remarques.length < 5) remarques.push("broche " + p.n + " hors du pas de 1 mm (20) : moins facile à câbler");
    }
    for (let n = 1; n <= vus.size; n++) if (!vus.has(n)) { erreurs.push("broches numérotées de 1 à " + vus.size + " sans trou : la " + n + " manque"); break; }
    const prims = Array.isArray(sym.primitives) ? sym.primitives : [];
    if (prims.length > 5000) erreurs.push("« primitives » : 5000 au plus");
    for (const q of prims) {
      const cles = q && Object.prototype.hasOwnProperty.call(OPS_SYMBOLE, q.op) ? OPS_SYMBOLE[q.op] : null;
      if (!cles) { erreurs.push("primitive inconnue : « " + String(q && q.op).slice(0, 20) + " » (" + Object.keys(OPS_SYMBOLE).join(", ") + ")"); break; }
      if (cles.some(k => !coord(q[k]))) { erreurs.push(q.op + " : coordonnées numériques finies"); break; }
      if (q.op === "poly" && !(Array.isArray(q.pts) && q.pts.length >= 2 && q.pts.length <= 500 && q.pts.every(p => Array.isArray(p) && coord(p[0]) && coord(p[1])))) {
        erreurs.push("poly : de 2 à 500 points [x, y]"); break;
      }
      if (q.op === "text" && typeof (q.text != null ? q.text : q.txt) !== "string") { erreurs.push("text : un texte"); break; }
    }
    if (sym.prefix != null && !(typeof sym.prefix === "string" && /^[A-Za-z]{1,4}$/.test(sym.prefix))) erreurs.push("« prefix » : 1 à 4 lettres");
    if (!prims.length) remarques.push("aucune primitive : le symbole n'aura que ses broches");
    return { erreurs, remarques };
  }

  /* ---------- ligne de catalogue ---------- */
  const OBLIGATOIRES = ["Part Name", "Reference designator Prefix", "Number Of pins",
                        "Empreinte PCB", "Empreinte Schématique"];
  const nomDeChemin = v => String(v == null ? "" : v).trim().replace(/^.*[\\/]/, "").replace(/\.json$/i, "");

  /* contexte : { partNames: [...], empreintes: [noms sans .json], nouvelle: def pcbfp-1 créée
     par la même carte (ou null), empreinteDef: def de l'empreinte visée si elle existe }.
     Rend aussi la ligne complète (39 colonnes + Brochage), chemins au format du catalogue. */
  function verifierLigne(ligne, contexte) {
    const erreurs = [], remarques = [];
    const colonnes = COLONNES_CATALOGUE_39.concat("Brochage");
    const ctx = contexte || {};
    if (!ligne || typeof ligne !== "object" || Array.isArray(ligne))
      return { erreurs: ["la ligne doit être un objet colonne → valeur"], remarques, ligne: null };
    const inconnues = Object.keys(ligne).filter(k => !colonnes.includes(k));
    if (inconnues.length) erreurs.push("colonne(s) inconnue(s) du catalogue : " + inconnues.join(", "));
    const sortie = {};
    for (const c of colonnes) {
      let v = ligne[c] == null ? "" : ligne[c];
      if (typeof v === "number" && Number.isFinite(v)) v = String(v);
      if (typeof v !== "string") { erreurs.push("« " + c + " » : texte attendu"); v = ""; }
      else if (CONTROLE.test(v) || v.length > 500) erreurs.push("« " + c + " » : une ligne, 500 caractères au plus");
      else if (FORMULE.test(v)) erreurs.push("« " + c + " » : commence comme une formule de tableur (=, @, +lettre, -lettre)");
      else if (INVISIBLE.test(v)) erreurs.push("« " + c + " » : caractère invisible ou de contrôle Unicode");
      sortie[c] = v.trim();
    }
    for (const c of OBLIGATOIRES) if (!sortie[c]) erreurs.push("colonne obligatoire vide ou manquante : « " + c + " »");

    const part = sortie["Part Name"];
    if (part) {
      if (part.length > 80) erreurs.push("« Part Name » : 80 caractères au plus");
      const pris = new Set((ctx.partNames || []).map(n => String(n).trim().toUpperCase()));
      if (pris.has(part.toUpperCase())) erreurs.push("« " + part + " » est déjà au catalogue (jamais d'écrasement)");
    }
    const pref = sortie["Reference designator Prefix"];
    if (pref && !/^[A-Za-z]{1,4}$/.test(pref)) erreurs.push("préfixe de repère : 1 à 4 lettres (R, C, U, J…)");
    const nb = sortie["Number Of pins"];
    if (nb && !(/^\d+$/.test(nb) && +nb >= 1 && +nb <= 4096)) erreurs.push("« Number Of pins » : entier de 1 à 4096");

    let fpDef = null;
    if (sortie["Empreinte PCB"]) {
      const fp = nomDeChemin(sortie["Empreinte PCB"]);
      const nouvelle = ctx.nouvelle && ctx.nouvelle.name === fp ? ctx.nouvelle : null;
      if (!NOM_EMPREINTE.test(fp)) erreurs.push("« Empreinte PCB » : nom d'empreinte illisible");
      else if (!nouvelle && !(ctx.empreintes || []).includes(fp))
        erreurs.push("empreinte « " + fp + " » absente de la LIB (ni existante, ni créée par cette carte)");
      sortie["Empreinte PCB"] = "lib/empreinte/" + fp + ".json";
      fpDef = nouvelle || ctx.empreinteDef || null;
      if (fpDef && nb && /^\d+$/.test(nb) && +nb !== fpDef.pins)
        remarques.push("« Number Of pins » (" + nb + ") ≠ pastilles de l'empreinte (" + fpDef.pins + ")");
    }
    let type = "", symDef = null;
    if (sortie["Empreinte Schématique"]) {
      const nom = nomDeChemin(sortie["Empreinte Schématique"]);
      const neuf = ctx.nouveauSymbole && ctx.nouveauSymbole.id === nom ? ctx.nouveauSymbole : null;
      type = nom.toLowerCase();
      if (Object.prototype.hasOwnProperty.call(SYMBOLES, type)) sortie["Empreinte Schématique"] = "lib/symbole/" + type + ".json";
      else if (neuf || (ctx.symboles || []).includes(nom)) {
        // un symbole de la LIB (schsym-1), dessiné par le schéma (29-symboles-lib.js) : son nom garde sa casse
        type = nom;
        symDef = neuf || (ctx.symboleDefs && ctx.symboleDefs[nom]) || null;
        sortie["Empreinte Schématique"] = "lib/symbole/" + nom + ".json";
      } else
        erreurs.push("symbole inconnu : « " + nom + " » (intégré : " + Object.keys(SYMBOLES).join(", ") +
                     " ; ou un symbole de la LIB, ou créé par cette carte)");
    }
    if (sortie["Brochage"] && type && (Object.prototype.hasOwnProperty.call(SYMBOLES, type) || symDef)) {
      const br = verifierBrochage(sortie["Brochage"], fpDef, type, symDef);
      erreurs.push(...br.erreurs.filter(e => !/^symbole intégré inconnu/.test(e)));
      remarques.push(...br.remarques);
    }
    return { erreurs, remarques, ligne: sortie };
  }

  /* ---------- générateurs IPC-7351B ----------
     Pastille CMS (IPC-7351B, § 3.1) à partir des cotes min/max de la datasheet :
       Z = Lmin + 2·Jt + √(CL² + F² + P²)          bord extérieur à bord extérieur
       G = Smax − 2·Jh − √(CS² + F² + P²)          bord intérieur à bord intérieur
       X = Wmin + 2·Js + √(CW² + F² + P²)          largeur de la pastille
     avec S = L − 2·T (écart entre terminaisons), CS = √(CL² + 2·CT²) et Smax ramené
     à la tolérance quadratique (Smax − ((Smax − Smin) − CS) / 2), comme le fait la norme.
     F = 0,10 (fabrication), P = 0,05 (placement). Pas d'arrondi au 0,05 de la norme :
     les cotes sont rendues au millième. */
  const F_FAB = 0.10, P_POSE = 0.05;
  /* Jt (pointe), Jh (talon), Js (côté), par densité : M (large), N (nominale), L (serrée) */
  const SOUDURE = {
    /* puces : les valeurs IPC-7351B relayées par le générateur d'empreintes de KiCad
       (kilibs/config/ipc_configs/ipc7351B_2terminal.yaml) ; la norme elle-même n'a pas été lue.
       Le talon de −0,05 était celui de l'IPC-7351 A. */
    // tableau 3-5 : puces rectangulaires de 1608 (0603) et plus
    puce:      { Jt: { M: 0.55, N: 0.35, L: 0.15 }, Jh: { M: 0, N: 0, L: 0 }, Js: { M: 0.05, N: 0, L: -0.05 } },
    // tableau 3-6 : puces plus petites que 1608
    pucePetite:{ Jt: { M: 0.30, N: 0.20, L: 0.10 }, Jh: { M: 0, N: 0, L: 0 }, Js: { M: 0.05, N: 0, L: -0.05 } },
    // tableau 3-2 : pattes en aile de mouette, pas > 0,625 mm (SOIC, SOT, TSSOP 0,65)
    aile:      { Jt: { M: 0.55, N: 0.35, L: 0.15 }, Jh: { M: 0.45, N: 0.35, L: 0.25 }, Js: { M: 0.05, N: 0.03, L: 0.01 } },
    // même tableau, pas ≤ 0,625 mm
    aileFine:  { Jt: { M: 0.55, N: 0.35, L: 0.15 }, Jh: { M: 0.45, N: 0.35, L: 0.25 }, Js: { M: 0.01, N: -0.02, L: -0.04 } },
    // QFN, DFN (sans pattes) : talon nul, côté rentrant
    sansPatte: { Jt: { M: 0.40, N: 0.30, L: 0.20 }, Jh: { M: 0, N: 0, L: 0 }, Js: { M: -0.04, N: -0.04, L: -0.04 } }
  };
  /* traversant (IPC-2222 / IPC-7251, simplifié) : trou = patte + jeu, pastille = trou + 2·couronne */
  const TROU = { jeu: { M: 0.25, N: 0.20, L: 0.15 }, couronne: { M: 0.45, N: 0.35, L: 0.25 } };

  /* cotes de puces courantes (datasheets de résistances CMS), en mm [min, max] */
  const PUCES = {
    "0201": { L: [0.57, 0.63], W: [0.27, 0.33], T: [0.10, 0.20] },
    "0402": { L: [0.95, 1.05], W: [0.45, 0.55], T: [0.15, 0.35] },
    "0603": { L: [1.50, 1.70], W: [0.70, 0.90], T: [0.15, 0.45] },
    "0805": { L: [1.80, 2.20], W: [1.05, 1.45], T: [0.25, 0.65] },
    "1206": { L: [3.00, 3.40], W: [1.40, 1.80], T: [0.25, 0.75] },
    "1210": { L: [3.00, 3.40], W: [2.30, 2.70], T: [0.25, 0.75] },
    "2010": { L: [4.80, 5.20], W: [2.30, 2.70], T: [0.35, 0.85] },
    "2512": { L: [6.10, 6.50], W: [3.00, 3.40], T: [0.35, 0.85] }
  };
  /* boîtiers à pattes en aile de mouette : cotes JEDEC par défaut (à vérifier sur la datasheet).
     L : pointe à pointe des pattes, T : pied, W : largeur de patte, corps [x, y] nominal. */
  const AILES = {
    "SOT-23-3": { broches: 3, pas: 0.95, L: [2.10, 2.64], T: [0.30, 0.60], W: [0.30, 0.50], corps: [1.3, 2.9] },
    "SOT-23-5": { broches: 5, pas: 0.95, L: [2.60, 3.00], T: [0.30, 0.60], W: [0.30, 0.50], corps: [1.6, 2.9] },
    "SOT-23-6": { broches: 6, pas: 0.95, L: [2.60, 3.00], T: [0.30, 0.60], W: [0.30, 0.50], corps: [1.6, 2.9] },
    "SOT-223":  { broches: 4, pas: 2.30, L: [6.70, 7.30], T: [0.75, 1.10], W: [0.66, 0.84], languette: [2.90, 3.15], corps: [3.5, 6.5] },
    SOIC:  { pas: 1.27, L: [5.80, 6.20], T: [0.40, 1.27], W: [0.31, 0.51], largeurCorps: 3.9 },
    TSSOP: { pas: 0.65, L: [6.20, 6.60], T: [0.45, 0.75], W: [0.19, 0.30], largeurCorps: 4.4 },
    MSOP:  { pas: 0.65, L: [4.75, 5.05], T: [0.40, 0.70], W: [0.22, 0.38], largeurCorps: 3.0 }
  };
  const r3 = v => Math.round(v * 1000) / 1000;
  const r4 = v => Math.round(v * 10000) / 10000;       // la précision du PCB (normFpDef) : KiCad écrit 1,1375

  class Refus extends Error {}
  /* une cote [min, max] (ou un nombre : min = max), en mm, bornée */
  function cote(v, nom, max) {
    const t = typeof v === "number" ? [v, v] : v;
    if (!Array.isArray(t) || t.length !== 2 || !t.every(fini) || t[0] <= 0 || t[1] < t[0] || t[1] > (max || 100))
      throw new Refus("« " + nom + " » : [min, max] en mm, 0 < min ≤ max ≤ " + (max || 100));
    return t;
  }
  function nombre(v, nom, min, max, entier) {
    if (!fini(v) || v < min || v > max || (entier && !Number.isInteger(v)))
      throw new Refus("« " + nom + " » : " + (entier ? "entier" : "nombre") + " de " + min + " à " + max);
    return v;
  }
  /* Z, G, X et la pastille qui en sort (longueur, centre), ou un refus si les cotes se contredisent */
  function pastilleIpc(L, T, W, J, densite) {
    const CL = L[1] - L[0], CT = T[1] - T[0], CW = W[1] - W[0];
    const Smin = L[0] - 2 * T[1], Smax = L[1] - 2 * T[0];
    if (Smin <= 0) throw new Refus("pieds plus longs que la moitié de l'empattement (L − 2·T ≤ 0) : cotes à revoir");
    const CS = Math.sqrt(CL * CL + 2 * CT * CT);
    const SmaxQ = Smax - ((Smax - Smin) - CS) / 2;
    const Z = L[0] + 2 * J.Jt[densite] + Math.hypot(CL, F_FAB, P_POSE);
    const G = SmaxQ - 2 * J.Jh[densite] - Math.hypot(CS, F_FAB, P_POSE);
    const X = W[0] + 2 * J.Js[densite] + Math.hypot(CW, F_FAB, P_POSE);
    if (G <= 0.1) throw new Refus("les pastilles se touchent au milieu (G = " + r3(G) + " mm) : cotes à revoir");
    return { Z: r3(Z), G: r3(G), X: r3(X), longueur: (Z - G) / 2, centre: (Z + G) / 4, largeur: X };
  }
  const plaque = (n, x, y, w, h) => ({ n, x: r3(x), y: r3(y), w: r3(w), h: r3(h), shape: "rect", drill: 0, rot: 0 });
  const trou = (n, x, y, d, D) => ({ n, x: r3(x), y: r3(y), w: r3(D), h: r3(D), shape: n === 1 ? "rect" : "circ", drill: r3(d), rot: 0 });
  const rangee = (k, nb, pas) => (k - (nb - 1) / 2) * pas;     // position de la k-ième d'une rangée centrée
  function corpsDe(x, y) { return { x1: r3(-x / 2), y1: r3(-y / 2), x2: r3(x / 2), y2: r3(y / 2) }; }
  function verifierPas(largeur, pas) {
    if (largeur > pas - 0.1) throw new Refus("pastilles de " + r3(largeur) + " mm au pas de " + pas + " mm : moins de 0,1 mm entre elles");
  }

  /* deux rangées gauche/droite, numérotées dans le sens inverse des aiguilles d'une montre :
     1 en haut à gauche, la dernière en haut à droite (y vers le bas, comme le PCB) */
  function deuxRangees(nbG, nbD, pas, p, pads, premier) {
    let n = premier || 1;
    for (let k = 0; k < nbG; k++) pads.push(plaque(n++, -p.centre, rangee(k, nbG, pas), p.longueur, p.largeur));
    for (let k = nbD - 1; k >= 0; k--) pads.push(plaque(n++, p.centre, rangee(k, nbD, pas), p.longueur, p.largeur));
  }

  const FAMILLES = {
    chip(a, d, rq) {
      let c;
      if (a.code != null) {
        c = PUCES[String(a.code)];
        if (!c) throw new Refus("« code » inconnu (" + a.code + ") : " + Object.keys(PUCES).join(", ") + ", ou donne longueur, largeur, terminaison");
        if (a.longueur == null) rq.push("cotes courantes d'une " + a.code + " : vérifie-les sur la datasheet");
      }
      const L = cote(a.longueur != null ? a.longueur : c && c.L, "longueur", 20);
      const W = cote(a.largeur != null ? a.largeur : c && c.W, "largeur", 20);
      const T = cote(a.terminaison != null ? a.terminaison : c && c.T, "terminaison", 10);
      const p = pastilleIpc(L, T, W, (L[0] + L[1]) / 2 < 1.6 ? SOUDURE.pucePetite : SOUDURE.puce, d);
      return { nom: a.code ? String(a.code) : "CHIP-" + r3((L[0] + L[1]) / 2) + "x" + r3((W[0] + W[1]) / 2),
               style: "chip", pins: 2, pitch: r3(2 * p.centre), span: r3(2 * p.centre), cotes: p,
               pads: [plaque(1, -p.centre, 0, p.longueur, p.largeur), plaque(2, p.centre, 0, p.longueur, p.largeur)],
               body: corpsDe(L[1], W[1]) };
    },
    sot(a, d, rq) {
      const v = AILES[a.variante];
      if (!v || !/^SOT/.test(a.variante)) throw new Refus("« variante » : SOT-23-3, SOT-23-5, SOT-23-6 ou SOT-223");
      if (a.empattement == null) rq.push("cotes JEDEC du " + a.variante + " par défaut : vérifie-les sur la datasheet");
      const L = cote(a.empattement != null ? a.empattement : v.L, "empattement", 20);
      const T = cote(a.pied != null ? a.pied : v.T, "pied", 10);
      const W = cote(a.largeur != null ? a.largeur : v.W, "largeur", 10);
      const pas = a.pas != null ? nombre(a.pas, "pas", 0.3, 5) : v.pas;
      const p = pastilleIpc(L, T, W, pas > 0.625 ? SOUDURE.aile : SOUDURE.aileFine, d);
      verifierPas(p.largeur, pas);
      const pads = [];
      if (a.variante === "SOT-23-3") {
        pads.push(plaque(1, -p.centre, -pas, p.longueur, p.largeur), plaque(2, -p.centre, pas, p.longueur, p.largeur),
                  plaque(3, p.centre, 0, p.longueur, p.largeur));
      } else if (a.variante === "SOT-23-5") {
        deuxRangees(3, 2, pas, p, pads);
        pads[3].y = r3(pas); pads[4].y = r3(-pas);            // 4 en bas à droite, 5 en haut : le milieu est libre
      } else if (a.variante === "SOT-223") {
        deuxRangees(3, 0, pas, p, pads);
        const lg = cote(a.languette != null ? a.languette : v.languette, "languette", 10);
        const t = pastilleIpc(L, T, lg, SOUDURE.aile, d);
        pads.push(plaque(4, t.centre, 0, t.longueur, t.largeur));
      } else deuxRangees(3, 3, pas, p, pads);
      const corps = Array.isArray(a.corps) ? a.corps : v.corps;
      return { nom: a.variante, style: "sop", pins: pads.length, pitch: pas, span: r3(2 * p.centre), cotes: p,
               pads, body: corpsDe(corps[0], corps[1]) };
    },
    /* SOIC, TSSOP, MSOP : deux rangées en aile de mouette */
    aile(a, d, rq, famille) {
      const v = AILES[famille.toUpperCase()];
      const n = nombre(a.broches, "broches", 4, 200, true);
      if (n % 2) throw new Refus("« broches » : un nombre pair pour deux rangées");
      const pas = a.pas != null ? nombre(a.pas, "pas", 0.3, 5) : v.pas;
      if (a.empattement == null) rq.push("cotes JEDEC " + famille.toUpperCase() + " par défaut : vérifie-les sur la datasheet");
      const L = cote(a.empattement != null ? a.empattement : v.L, "empattement", 40);
      const T = cote(a.pied != null ? a.pied : v.T, "pied", 10);
      const W = cote(a.largeur != null ? a.largeur : v.W, "largeur", 10);
      let corps = a.corps;
      if (corps == null) {
        corps = [v.largeurCorps, r3((n / 2 - 1) * pas + 1.1)];
        rq.push("corps estimé " + corps[0] + " × " + corps[1] + " mm : donne « corps » de la datasheet");
      } else if (!Array.isArray(corps) || corps.length !== 2 || !corps.every(x => fini(x) && x > 0 && x <= 100))
        throw new Refus("« corps » : [largeur, longueur] en mm");
      if (corps[0] >= L[0]) throw new Refus("corps (" + corps[0] + " mm) plus large que l'empattement (" + L[0] + " mm)");
      const p = pastilleIpc(L, T, W, pas > 0.625 ? SOUDURE.aile : SOUDURE.aileFine, d);
      verifierPas(p.largeur, pas);
      const pads = [];
      deuxRangees(n / 2, n / 2, pas, p, pads);
      return { nom: famille.toUpperCase() + "-" + n, style: "sop", pins: n, pitch: pas, span: r3(2 * p.centre),
               cotes: p, pads, body: corpsDe(corps[0], corps[1]) };
    },
    /* QFN (quatre côtés) et DFN (deux côtés), pastille thermique facultative */
    sansPatte(a, d, rq, famille) {
      const qfn = famille === "qfn";
      const n = nombre(a.broches, "broches", qfn ? 8 : 2, 200, true);
      if (n % (qfn ? 4 : 2)) throw new Refus("« broches » : un multiple de " + (qfn ? 4 : 2));
      const pas = nombre(a.pas, "pas", 0.3, 2);
      const Lc = cote(a.corps, "corps", 20);
      const T = cote(a.pied, "pied", 5), W = cote(a.largeur, "largeur", 5);
      const lon = a.longueur != null ? cote(a.longueur, "longueur", 20) : Lc;
      const p = pastilleIpc(Lc, T, W, SOUDURE.sansPatte, d);              // côtés gauche et droit : cote X du corps
      const pY = qfn ? pastilleIpc(lon, T, W, SOUDURE.sansPatte, d) : p;   // haut et bas : cote Y (corps rectangulaire)
      verifierPas(p.largeur, pas);
      const parCote = qfn ? n / 4 : n / 2, pads = [];
      const demi = (parCote - 1) * pas / 2 + p.largeur / 2;                // demi-étendue d'une rangée
      // une rangée de QFN ne doit pas toucher celle du côté voisin (angles : court-circuit) ;
      // celle d'un DFN doit tenir sur la longueur du corps
      if (qfn ? demi > Math.min(p.centre - p.longueur / 2, pY.centre - pY.longueur / 2) - 0.1 : 2 * demi > lon[0] + 0.2)
        throw new Refus(parCote + " pastilles au pas de " + pas + " mm ne tiennent pas sur un côté" +
                        (qfn ? " sans toucher celles du côté voisin" : " de " + lon[0] + " mm"));
      if (qfn) {
        let k = 1;
        for (let i = 0; i < parCote; i++) pads.push(plaque(k++, -p.centre, rangee(i, parCote, pas), p.longueur, p.largeur));
        for (let i = 0; i < parCote; i++) pads.push(plaque(k++, rangee(i, parCote, pas), pY.centre, p.largeur, pY.longueur));
        for (let i = parCote - 1; i >= 0; i--) pads.push(plaque(k++, p.centre, rangee(i, parCote, pas), p.longueur, p.largeur));
        for (let i = parCote - 1; i >= 0; i--) pads.push(plaque(k++, rangee(i, parCote, pas), -pY.centre, p.largeur, pY.longueur));
      } else deuxRangees(parCote, parCote, pas, p, pads);
      let nom = famille.toUpperCase() + "-" + n;
      if (a.thermique != null) {
        const t = a.thermique;
        if (!Array.isArray(t) || t.length !== 2 || !t.every(x => fini(x) && x > 0))
          throw new Refus("« thermique » : [largeur, hauteur] de la pastille thermique en mm");
        // 0,15 mm de vernis entre elle et les pastilles, sur chaque axe
        if (t[0] / 2 > p.centre - p.longueur / 2 - 0.15 ||
            t[1] / 2 > (qfn ? pY.centre - pY.longueur / 2 - 0.15 : lon[0] / 2))
          throw new Refus("pastille thermique trop grande : moins de 0,15 mm des pastilles, ou hors du corps");
        pads.push(Object.assign(plaque(n + 1, 0, 0, t[0], t[1]), { nom: "EP" }));
        nom += "-EP";
      }
      return { nom: nom + "-" + r3((Lc[0] + Lc[1]) / 2) + "x" + r3((lon[0] + lon[1]) / 2),
               style: qfn ? "quad" : "sop", pins: pads.length, pitch: pas, span: r3(2 * p.centre), cotes: p, pads,
               body: corpsDe((Lc[0] + Lc[1]) / 2, (lon[0] + lon[1]) / 2) };
    },
    dip(a, d, rq) {
      const n = nombre(a.broches, "broches", 4, 64, true);
      if (n % 2) throw new Refus("« broches » : un nombre pair");
      const pas = a.pas != null ? nombre(a.pas, "pas", 1, 5) : 2.54;
      const ecart = a.rangee != null ? nombre(a.rangee, "rangee", 2, 30) : 7.62;
      const t = traversant(a.diametre != null ? a.diametre : 0.6, d, pas, ecart);
      const pads = [], nb = n / 2;
      for (let k = 0; k < nb; k++) pads.push(trou(k + 1, -ecart / 2, rangee(k, nb, pas), t.trou, t.pastille));
      for (let k = nb - 1; k >= 0; k--) pads.push(trou(n - k, ecart / 2, rangee(k, nb, pas), t.trou, t.pastille));
      const corps = Array.isArray(a.corps) ? a.corps : [ecart - 1.3, nb * pas + 0.1];
      return { nom: "DIP-" + n + (ecart !== 7.62 ? "-W" + ecart : ""), style: "dip", pins: n, pitch: pas, span: ecart,
               pads, body: corpsDe(corps[0], corps[1]) };
    },
    /* barrette 1×N (le long de x) ou 2×N (1 et 2 face à face, puis 3 et 4… comme les connecteurs IDC) */
    barrette(a, d, rq) {
      const rangs = a.rangees == null ? 1 : a.rangees;
      if (rangs !== 1 && rangs !== 2) throw new Refus("« rangees » : 1 ou 2");
      const nb = nombre(a.broches, "broches", 1, 100, true);
      const pas = a.pas != null ? nombre(a.pas, "pas", 1, 5) : 2.54;
      const t = traversant(a.diametre != null ? a.diametre : 0.64 * Math.SQRT2, d, pas, pas);
      const pads = [];
      for (let k = 0; k < nb; k++)
        for (let r = 0; r < rangs; r++)
          pads.push(trou(k * rangs + r + 1, rangee(k, nb, pas), rangs === 1 ? 0 : (r - 0.5) * pas, t.trou, t.pastille));
      return { nom: "HEADER-" + pas.toFixed(2) + "-" + rangs + "x" + nb, style: rangs === 1 ? "row" : "dip",
               pins: nb * rangs, pitch: pas, span: pas, pads,
               body: corpsDe(nb * pas, rangs * pas) };
    }
  };
  function traversant(diametre, d, pas, ecart) {
    const dia = nombre(diametre, "diametre", 0.2, 3);
    const t = Math.ceil((dia + TROU.jeu[d]) / 0.05 - 1e-9) * 0.05;       // trou au 0,05 supérieur
    const D = t + 2 * TROU.couronne[d];
    if (D > Math.min(pas, ecart) - 0.2) throw new Refus("pastilles de " + r3(D) + " mm au pas de " + pas + " mm : moins de 0,2 mm entre elles");
    return { trou: r3(t), pastille: r3(D) };
  }

  /* Les champs de chaque famille, pour le formulaire de Gestion LIB : [clé, libellé, genre, choix].
     genre : « cote » (un nombre, ou min et max), « paire » (deux nombres), « nombre »,
     « entier », « texte » ou « choix ». Vides, les cotes JEDEC par défaut s'appliquent. */
  const AILE = [["broches", "Broches", "entier"], ["pas", "Pas", "nombre"],
                ["empattement", "Empattement (bout à bout des pattes)", "cote"], ["pied", "Pied (longueur soudée)", "cote"],
                ["largeur", "Largeur de patte", "cote"], ["corps", "Corps largeur × longueur", "paire"]];
  const SANS_PATTE = [["broches", "Broches", "entier"], ["pas", "Pas", "nombre"], ["corps", "Corps (côté)", "cote"],
                      ["longueur", "Longueur du corps, s'il n'est pas carré", "cote"], ["pied", "Longueur de plot", "cote"],
                      ["largeur", "Largeur de plot", "cote"], ["thermique", "Pastille thermique largeur × hauteur", "paire"]];
  const CHAMPS = {
    chip: [["code", "Code", "choix", Object.keys(PUCES)], ["longueur", "Longueur", "cote"],
           ["largeur", "Largeur", "cote"], ["terminaison", "Terminaison", "cote"]],
    sot: [["variante", "Variante", "choix", ["SOT-23-3", "SOT-23-5", "SOT-23-6", "SOT-223"]],
          ["empattement", "Empattement", "cote"], ["pied", "Pied", "cote"], ["largeur", "Largeur de patte", "cote"],
          ["pas", "Pas", "nombre"], ["languette", "Languette (SOT-223)", "cote"], ["corps", "Corps largeur × longueur", "paire"]],
    soic: AILE, tssop: AILE, msop: AILE, qfn: SANS_PATTE, dfn: SANS_PATTE,
    dip: [["broches", "Broches", "entier"], ["pas", "Pas", "nombre"], ["rangee", "Écart des rangées", "nombre"],
          ["diametre", "Ø de la patte", "nombre"], ["corps", "Corps largeur × longueur", "paire"]],
    barrette: [["rangees", "Rangées (1 ou 2)", "entier"], ["broches", "Broches", "entier"],
               ["pas", "Pas", "nombre"], ["diametre", "Ø de la patte (carrée : sa diagonale, 0,64 → 0,91)", "nombre"]]
  };
  /* Les textes saisis → les paramètres de genererEmpreinte. Un nombre s'écrit avec un point ou
     une virgule ; deux nombres se séparent par une espace, « / », « x », « × » ou « ; ». */
  function lireParametres(famille, textes) {
    const champs = CHAMPS[String(famille || "").toLowerCase()];
    if (!champs) return { parametres: {}, erreurs: ["famille inconnue : " + Object.keys(CHAMPS).join(", ")] };
    const parametres = {}, erreurs = [], t = textes || {};
    for (const [cle, lib, genre, liste] of champs) {
      const s = String(t[cle] == null ? "" : t[cle]).trim();
      if (!s) continue;
      if (genre === "texte" || genre === "choix") {
        if (genre === "choix" && !liste.includes(s)) erreurs.push(lib + " : " + liste.join(", "));
        else parametres[cle] = s;
        continue;
      }
      const v = s.split(/\s*[\s\/x×;]\s*/i).map(x => x.replace(",", "."));
      const n = v.map(x => /^\d+(\.\d+)?$|^\.\d+$/.test(x) ? +x : NaN);
      const deux = genre === "cote" || genre === "paire";
      if (n.some(x => !Number.isFinite(x)) || n.length > (deux ? 2 : 1) || (genre === "paire" && n.length !== 2) ||
          (genre === "entier" && !Number.isInteger(n[0])))
        erreurs.push(lib + " : " + (genre === "paire" ? "deux nombres (mm)" : genre === "cote" ? "un nombre, ou min et max (mm)" :
                                    genre === "entier" ? "un nombre entier" : "un nombre (mm)"));
      else parametres[cle] = n.length === 2 ? n : n[0];
    }
    return { parametres, erreurs };
  }

  /* famille + paramètres de la datasheet → { empreinte, erreurs, remarques, cotes } : rien n'est écrit */
  function genererEmpreinte(famille, params) {
    const a = params && typeof params === "object" && !Array.isArray(params) ? params : {};
    const remarques = [];
    const f = String(famille || "").toLowerCase();
    const d = a.densite == null ? "N" : a.densite;
    try {
      if (!["M", "N", "L"].includes(d)) throw new Refus("« densite » : M (large), N (nominale) ou L (serrée)");
      let r;
      if (f === "chip") r = FAMILLES.chip(a, d, remarques);
      else if (f === "sot") r = FAMILLES.sot(a, d, remarques);
      else if (f === "soic" || f === "tssop" || f === "msop") r = FAMILLES.aile(a, d, remarques, f);
      else if (f === "qfn" || f === "dfn") r = FAMILLES.sansPatte(a, d, remarques, f);
      else if (f === "dip") r = FAMILLES.dip(a, d, remarques);
      else if (f === "barrette") r = FAMILLES.barrette(a, d, remarques);
      else throw new Refus("famille inconnue : chip, sot, soic, tssop, msop, qfn, dfn, dip, barrette");
      const nom = a.nom != null ? a.nom : r.nom + (d !== "N" ? "-" + d : "");
      const empreinte = { format: "pcbfp-1", name: nom, pkg: r.nom, pins: r.pins, style: r.style,
                          pitch: r.pitch, span: r.span, pads: r.pads, body: r.body,
                          description: "Généré (IPC-7351B, densité " + d + ") : " + r.nom };
      const v = verifierEmpreinte(empreinte, typeof nom === "string" ? nom + ".json" : null);
      return { empreinte, erreurs: v.erreurs, remarques: remarques.concat(v.remarques),
               cotes: r.cotes ? { Z: r.cotes.Z, G: r.cotes.G, X: r.cotes.X } : null };
    } catch (e) {
      if (!(e instanceof Refus)) throw e;
      return { empreinte: null, erreurs: [e.message], remarques, cotes: null };
    }
  }

  /* ---------- un Touchstone à lier à une référence ----------
     Un fichier .sNp a N ports ; la puce, souvent plus de pattes (masse, commandes). Pour chaque
     port, la patte de l'empreinte : son numéro, ou le nom de sa broche dans le brochage (« J1 »),
     et la patte de masse si les ports s'y rapportent. Rend le texte prêt à ranger dans la LIB,
     avec les lignes que lit la simulation RF (simRfBrochesSnp, commun/simulation-em.js) :
       ! broches : 5 3 1
       ! masse : 2
     Rien n'est écrit ici. */
  const LIGNE_BRANCHEMENT = /^[ \t]*![ \t]*(broches|masse)[ \t]*:[ \t]*(.*)$/i;
  function portsTouchstone(nomFichier) {
    const m = /\.s(\d)p$/i.exec(String(nomFichier || ""));
    return m ? +m[1] : 0;
  }
  /* le branchement déjà écrit dans un fichier, ou null */
  function lireBranchement(texte) {
    let broches = null, masse = null;
    for (const l of String(texte || "").split(/\r?\n/)) {
      const m = LIGNE_BRANCHEMENT.exec(l);
      if (!m) continue;
      if (m[1].toLowerCase() === "broches") broches = m[2].trim().split(/[\s,;]+/).filter(Boolean);
      else masse = m[2].trim() || null;
    }
    return broches ? { broches, masse } : null;
  }
  function brancherTouchstone(texte, nomFichier, saisie) {
    const n = portsTouchstone(nomFichier), s = saisie || {}, erreurs = [];
    if (!n) return { texte: null, erreurs: ["pas un Touchstone (.s1p à .s9p)"] };
    if (!/^[ \t]*#/m.test(String(texte || "")))
      return { texte: null, erreurs: ["pas de ligne d'options « # » : ce n'est pas un Touchstone lisible"] };
    const lu = s.brochage && typeof brochageLire === "function" ? brochageLire(s.brochage) : null;
    const broches = lu && !lu.erreurs.length ? lu.parties[0].broches : {};
    const pins = Number.isInteger(s.pins) && s.pins > 0 ? s.pins : 0;
    /* « 5 », ou « J1 » lu dans le brochage ; une broche sur plusieurs pattes ne désigne pas un port */
    const patte = (v, quoi) => {
      const t = String(v == null ? "" : v).trim();
      if (!t) { erreurs.push(quoi + " : patte manquante"); return null; }
      let p = /^\d+$/.test(t) ? String(+t) : null;
      if (p == null) {
        const b = broches[typeof brochageNom === "function" ? brochageNom(t) : t.toUpperCase()];
        if (b == null) { erreurs.push(quoi + " : « " + t + " » n'est ni un numéro de patte ni une broche du brochage"); return null; }
        if (b.includes("/")) { erreurs.push(quoi + " : la broche " + t + " va sur plusieurs pattes (" + b + "), donne la patte"); return null; }
        p = b;
      }
      if (pins && (+p < 1 || +p > pins)) { erreurs.push(quoi + " : patte " + p + " hors de 1 à " + pins); return null; }
      return p;
    };
    const ports = Array.isArray(s.broches) ? s.broches : [];
    if (ports.length !== n) erreurs.push(n + " port(s) dans le fichier, " + ports.length + " patte(s) données");
    const liste = ports.map((v, k) => patte(v, "port " + (k + 1)));
    const masse = s.masse != null && String(s.masse).trim() ? patte(s.masse, "masse") : null;
    const vus = liste.filter(Boolean).concat(masse ? [masse] : []);
    const doubles = vus.filter((p, i) => vus.indexOf(p) !== i);
    if (doubles.length) erreurs.push("patte " + [...new Set(doubles)].join(", ") + " donnée deux fois");
    if (erreurs.length) return { texte: null, erreurs };
    const corps = String(texte).split(/\r?\n/).filter(l => !LIGNE_BRANCHEMENT.test(l)).join("\n");
    return { texte: "! broches : " + liste.join(" ") + "\n" + (masse ? "! masse : " + masse + "\n" : "") + corps,
             broches: liste, masse, erreurs };
  }

  /* ---------- conversion KiCad (kicad_mod → pcbfp-1) ----------
     Le texte vient d'Internet (pcbparts, cse_get_kicad) : c'est une donnée, lue par un
     lecteur d'expressions S borné (taille, profondeur, nombre de nœuds), jamais exécutée.
     Repris : les pastilles (pad), les trous non métallisés et le contour de fabrication
     (F.Fab) qui devient le corps. Le reste est compté dans les remarques. */
  const KICAD_MAX = 200 * 1024;
  /* quoi : le genre de fichier pour les messages ; maxNoeuds : un projet entier (kicad_pcb,
     kicad_sch, commun/kicad.js) en compte bien plus qu'une empreinte */
  function lireS(texte, quoi = "kicad_mod", maxNoeuds = 200000) {
    let i = 0, noeuds = 0;
    const n = texte.length;
    function blanc() { while (i < n && /\s/.test(texte[i])) i++; }
    function liste(prof) {
      if (prof > 40) throw new Refus(quoi + " illisible : imbrication trop profonde");
      i++;                                                   // « ( »
      const out = [];
      for (;;) {
        blanc();
        if (i >= n) throw new Refus(quoi + " illisible : parenthèse non fermée");
        const c = texte[i];
        if (++noeuds > maxNoeuds) throw new Refus(quoi + " illisible : trop d'éléments");
        if (c === ")") { i++; return out; }
        if (c === "(") out.push(liste(prof + 1));
        else if (c === '"') {
          let v = "";
          i++;
          while (i < n && texte[i] !== '"') {
            if (texte[i] === "\\" && i + 1 < n) { i++; if (texte[i] === "n") { v += "\n"; i++; continue; } }
            v += texte[i++];
          }
          if (i >= n) throw new Refus(quoi + " illisible : guillemet non fermé");
          i++;
          out.push(v);
        } else {
          const d = i;
          while (i < n && !/[\s()"]/.test(texte[i])) i++;
          out.push(texte.slice(d, i));
        }
      }
    }
    blanc();
    if (texte[i] !== "(") throw new Refus(quoi === "kicad_mod" ? "kicad_mod illisible : il doit commencer par « (footprint » ou « (module »"
                                                               : quoi + " illisible : il doit commencer par « ( »");
    const racine = liste(0);
    blanc();
    if (i < n) throw new Refus(quoi + " illisible : texte après la dernière parenthèse");
    return racine;
  }
  const enfant = (l, nom) => l.find(e => Array.isArray(e) && e[0] === nom);
  const enfants = (l, nom) => l.filter(e => Array.isArray(e) && e[0] === nom);
  function nombres(l, nb, quoi) {
    const v = (l || []).slice(1, 1 + nb).map(Number);
    if (v.length < nb || !v.every(Number.isFinite)) throw new Refus("kicad_mod : " + quoi + " illisible");
    return v;
  }
  const FORMES_KICAD = { rect: "sharp", roundrect: "rect", circle: "circ", oval: "oval" };
  /* ce que la conversion lit (ou n'a pas à reprendre : net, identifiants) dans une pastille */
  const SOUS_PASTILLE = ["at", "size", "drill", "layers", "roundrect_rratio", "chamfer_ratio", "chamfer",
                         "net", "uuid", "tstamp"];

  function convertirKicad(texte) {
    const remarques = [];
    try {
      if (typeof texte !== "string" || !texte.trim()) throw new Refus("kicad_mod : texte vide");
      // un kicad_mod est de l'ASCII : un caractère, un octet (le MCP borne aussi les octets)
      if (texte.length > KICAD_MAX) throw new Refus("kicad_mod de plus de 200 Ko : refusé");
      const r = lireS(texte);
      if (r[0] !== "footprint" && r[0] !== "module") throw new Refus("kicad_mod illisible : ni « footprint » ni « module »");
      const brut = typeof r[1] === "string" ? r[1].replace(/^.*:/, "") : "";
      let nom = brut.replace(/[^A-Za-z0-9_.+-]/g, "_").slice(0, 60);
      if (!nom || /^\.+$/.test(nom)) nom = "KICAD";
      if (nom !== brut) remarques.push("nom « " + brut.slice(0, 80) + " » ramené à « " + nom + " »");
      const descr = enfant(r, "descr");
      const ignores = {};
      const ignorer = quoi => { ignores[quoi] = (ignores[quoi] || 0) + 1; };
      const pads = [], holes = [], numeros = new Map(), fab = [];
      let lettres = 0;
      for (const e of r.slice(2)) {
        if (!Array.isArray(e)) continue;
        const k = e[0];
        if (k === "pad") {
          const num = String(e[1] == null ? "" : e[1]), genre = e[2], forme = e[3];
          const [x, y, angle] = (() => { const a = enfant(e, "at"); const v = nombres(a, 2, "position de pastille"); return [v[0], v[1], Number(a[3]) || 0]; })();
          let [w, h] = nombres(enfant(e, "size"), 2, "taille de pastille « " + num + " »");
          const dr = enfant(e, "drill");
          let drill = 0, slot = 0;
          if (dr) {
            const v = dr.slice(1).filter(t => typeof t === "string" && /^-?[\d.]+$/.test(t)).map(Number);
            drill = v.length > 1 ? Math.min(v[0], v[1]) : v[0] || 0;
            if (v.length > 1 && v[0] !== v[1]) slot = Math.max(v[0], v[1]);
            if (enfant(dr, "offset")) remarques.push("pastille « " + num + " » : décalage du perçage ignoré");
          }
          for (const sous of e.slice(4))
            if (Array.isArray(sous) && !SOUS_PASTILLE.includes(sous[0])) ignorer("« " + sous[0] + " » de pastille");
          if (genre === "np_thru_hole") {
            if (slot) remarques.push("trou non métallisé oblong en (" + x + ", " + y + ") repris rond de " + drill + " mm");
            holes.push({ x: r4(x), y: r4(y), d: r4(drill || Math.min(w, h)) });
            continue;
          }
          if (genre === "thru_hole" && !(drill > 0)) throw new Refus("pastille traversante « " + num + " » sans perçage : kicad_mod illisible");
          const couches = (enfant(e, "layers") || []).slice(1);
          if (!couches.some(c => /^(\*|F|B)\.Cu$/.test(c))) {
            remarques.push("pastille « " + num + " » sans cuivre (" + couches.join(" ") + ") : écartée");
            continue;
          }
          if (forme === "custom") throw new Refus("pastille personnalisée (custom) « " + num + " » : non convertible, dessine-la en pcbfp-1");
          if (!FORMES_KICAD[forme]) throw new Refus("forme de pastille inconnue « " + forme + " » (pastille « " + num + " »)");
          if (!num) { remarques.push("pastille sans numéro en (" + x + ", " + y + ") : ignorée (patte mécanique)"); continue; }
          if (genre === "connect") remarques.push("pastille « " + num + " » de contact (connect) : reprise comme CMS");
          if ((genre === "smd" || genre === "connect") && couches.some(c => /^B\.Cu$/.test(c)) && !couches.some(c => /^F\.Cu$/.test(c)))
            remarques.push("pastille « " + num + " » côté cuivre bas : posée côté haut");
          if (enfant(e, "chamfer_ratio")) remarques.push("pastille « " + num + " » : chanfrein KiCad repris en coins adoucis");
          let rot = ((angle % 360) + 360) % 360;
          if (rot === 90 || rot === 270) { [w, h] = [h, w]; rot = 0; }
          else if (rot === 180) rot = 0;
          else if (rot) remarques.push("pastille « " + num + " » tournée de " + rot + "° : sens à vérifier");
          let n;
          if (/^\d+$/.test(num)) n = +num;
          else { if (!numeros.has(num)) numeros.set(num, ++lettres); n = -numeros.get(num); }   // renuméroté plus bas
          const q = { n, x: r4(x), y: r4(y), w: r4(w), h: r4(h), shape: FORMES_KICAD[forme], drill: r4(drill), rot: r4(rot) };
          if (slot) q.slot = r4(slot);
          if (n < 0) q.nom = num.slice(0, 8);
          pads.push(q);
        } else if (/^fp_(line|rect|poly|circle|arc)$/.test(k) || /^gr_/.test(k)) {
          const couche = (enfant(e, "layer") || [])[1];
          if (couche === "F.Fab" && /circle$/.test(k)) {
            // un cercle : son centre et un point du bord ; le corps prend tout le disque
            const [cx, cy] = nombres(enfant(e, "center"), 2, "cercle"), [ex, ey] = nombres(enfant(e, "end"), 2, "cercle");
            const rayon = Math.hypot(ex - cx, ey - cy);
            fab.push([cx - rayon, cy - rayon], [cx + rayon, cy + rayon]);
          } else if (couche === "F.Fab" && k !== "fp_arc") {
            for (const s of ["start", "end", "center"]) { const a = enfant(e, s); if (a) fab.push(nombres(a, 2, "contour")); }
            const pts = enfant(e, "pts");
            if (pts) for (const xy of enfants(pts, "xy")) fab.push(nombres(xy, 2, "contour"));
          } else ignorer(k === "fp_arc" ? "arc(s)" : "tracé(s) " + (couche || "?"));
        } else if (k === "fp_text" || k === "property" || k === "fp_text_box") ignorer("texte(s)");
        else if (k === "model") ignorer("modèle(s) 3D");
        else if (!["layer", "descr", "tags", "attr", "version", "generator", "generator_version", "tedit", "uuid", "tstamp", "at", "path", "embedded_fonts"].includes(k))
          ignorer("« " + k + " »");
      }
      /* noms de pattes (« A1 », « EP ») : numéros à la suite des pattes numérotées */
      const maxNum = pads.reduce((m, q) => q.n > 0 ? Math.max(m, q.n) : m, 0);
      for (const q of pads) if (q.n < 0) q.n = maxNum - q.n;
      if (lettres) remarques.push(lettres + " nom(s) de patte non numériques renumérotés à partir de " + (maxNum + 1) + " (nom gardé)");
      const ign = Object.entries(ignores).map(([k, v]) => v + " " + k);
      if (ign.length) remarques.push("non repris : " + ign.join(", "));
      if (!pads.length) throw new Refus("kicad_mod sans pastille");
      const distincts = new Set(pads.map(q => q.n)).size;
      const xs = new Set(pads.map(q => q.x)).size, ys = new Set(pads.map(q => q.y)).size;
      const traversant = pads.every(q => q.drill > 0);
      const style = traversant ? (xs === 1 || ys === 1 ? "row" : "dip")
        : distincts <= 2 ? "chip" : (xs <= 2 || ys <= 2) ? "sop" : pads.length >= xs * ys * 0.8 ? "bga" : "quad";
      const empreinte = { format: "pcbfp-1", name: nom, pkg: nom, pins: distincts, style, pads };
      if (holes.length) empreinte.holes = holes;
      if (fab.length) {
        const fx = fab.map(v => v[0]), fy = fab.map(v => v[1]);
        empreinte.body = { x1: r4(Math.min(...fx)), y1: r4(Math.min(...fy)), x2: r4(Math.max(...fx)), y2: r4(Math.max(...fy)) };
      }
      if (descr && typeof descr[1] === "string")
        // coupée par caractères entiers : une paire de substitution tranchée ferait échouer l'écriture
        empreinte.description = Array.from(descr[1].replace(/[\x00-\x08\x0b-\x1f\x7f]/g, " ")).slice(0, 2000).join("");
      const v = verifierEmpreinte(empreinte, nom + ".json");
      return { empreinte, erreurs: v.erreurs, remarques: remarques.concat(v.remarques) };
    } catch (e) {
      if (!(e instanceof Refus)) throw e;
      return { empreinte: null, erreurs: [e.message], remarques };
    }
  }

  return { SYMBOLES, CHAMPS, nomDeChemin, verifierEmpreinte, verifierBrochage, verifierSymbole, verifierLigne, genererEmpreinte,
           lireParametres, convertirKicad, lireS, Refus, portsTouchstone, lireBranchement, brancherTouchstone };
})();
