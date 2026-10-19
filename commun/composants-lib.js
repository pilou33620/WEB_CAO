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
                          "pads", "body", "holes", "description"];
  const NOM_EMPREINTE = /^[A-Za-z0-9_.+-]{1,60}$/;
  const CONTROLE = /[\x00-\x1f\x7f]/;
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
    if (Array.isArray(def.holes))
      def.holes.forEach((h, i) => {
        if (!h || !fini(h.x) || !fini(h.y) || !fini(h.d) || h.d < 0.4 || h.d > 30 || Math.abs(h.x) > COORD || Math.abs(h.y) > COORD)
          erreurs.push("trou " + (i + 1) + " : x, y à ±" + COORD + " mm et diamètre « d » de 0,4 à 30 mm");
      });
    else if (def.holes != null) erreurs.push("« holes » : liste de trous {x, y, d}");

    const b = def.body;
    if (b == null) remarques.push("pas de corps (« body ») : le PCB n'en dessinera pas");
    else if (![b.x1, b.y1, b.x2, b.y2].every(fini) || b.x2 - b.x1 < 0.1 || b.y2 - b.y1 < 0.1 ||
             [b.x1, b.y1, b.x2, b.y2].some(v => Math.abs(v) > COORD))
      erreurs.push("« body » : {x1, y1, x2, y2} en mm, x1 < x2 et y1 < y2");
    else if (!erreurs.length) {
      const hors = pads.filter(q => !(q.drill > 0) &&
        (q.x - q.w / 2 < b.x1 - 1e-6 || q.x + q.w / 2 > b.x2 + 1e-6 || q.y - q.h / 2 < b.y1 - 1e-6 || q.y + q.h / 2 > b.y2 + 1e-6));
      if (hors.length)
        remarques.push(hors.length + " pastille(s) CMS hors du corps (normal pour des pattes en aile de mouette ; à vérifier sinon)");
    }
    return { erreurs, remarques };
  }

  /* ---------- brochage ---------- */
  /* Le brochage d'une référence (commun/brochage.js) face à l'empreinte et au symbole :
     chaque patte existe dans l'empreinte, chaque broche existe dans le symbole. */
  function verifierBrochage(texte, empreinte, type) {
    const erreurs = [], remarques = [];
    const sym = typeof type === "string" && Object.prototype.hasOwnProperty.call(SYMBOLES, type) ? SYMBOLES[type] : undefined;
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

  /* ---------- ligne de catalogue ---------- */
  const OBLIGATOIRES = ["Part Name", "Reference designator Prefix", "Number Of pins",
                        "Empreinte PCB", "Empreinte Schématique"];
  const nomDeChemin = v => String(v).trim().replace(/^.*[\\/]/, "").replace(/\.json$/i, "");

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
    let type = "";
    if (sortie["Empreinte Schématique"]) {
      type = nomDeChemin(sortie["Empreinte Schématique"]).toLowerCase();
      if (!Object.prototype.hasOwnProperty.call(SYMBOLES, type))
        erreurs.push("symbole intégré inconnu : « " + type + " » (" + Object.keys(SYMBOLES).join(", ") + ")");
      else sortie["Empreinte Schématique"] = "lib/symbole/" + type + ".json";
    }
    if (sortie["Brochage"] && type) {
      const br = verifierBrochage(sortie["Brochage"], fpDef, type);
      erreurs.push(...br.erreurs.filter(e => !/^symbole intégré inconnu/.test(e)));
      remarques.push(...br.remarques);
    }
    return { erreurs, remarques, ligne: sortie };
  }

  return { STYLES, FORMES, SYMBOLES, verifierEmpreinte, verifierBrochage, verifierLigne };
})();
