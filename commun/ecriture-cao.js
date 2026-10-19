/* ==========================================================================
   Écritures de Claude dans les pages WEB_CAO (web_suite, module ecriture-cao)
   --------------------------------------------------------------------------
   Une carte du canal de pilotage porte un LOT : tout est vérifié avant la
   carte, revérifié au clic, puis appliqué en une seule étape d'historique.
   Un seul refus et rien n'est changé. Spec :
   web_suite/lanceur/docs/SPEC-mcp-ecriture-cao.md. Les commandes sont
   déclarées par commun/pilote-cao.js.
   ========================================================================== */
"use strict";

const ECRITURE_CAO = (function () {
  const LOT_MAX = 50;                                   // éléments par carte
  const TEXTE = /^[^\x00-\x1f\x7f]{0,200}$/;

  function texte(v, nom, refus) {
    if (typeof v !== "string" || !TEXTE.test(v)) { refus.push(nom + " : texte d'une ligne, 200 caractères au plus"); return null; }
    return v;
  }
  const montrer = v => v === undefined || v === null || v === "" ? "—" : typeof v === "object" ? JSON.stringify(v) : String(v);

  /* Une commande d'écriture du canal, faite d'un lot. `def` :
     - titre : le titre de la carte ;
     - verifier(args) → {lignes:[{quoi, avant, apres}], refus:[]} sans rien toucher ;
     - muter(args) : applique, sans push() ;
     - rafraichir() : redessine la page.
     La carte garde ses lignes : au clic, si la vérification ne redonne pas les mêmes (le
     document a bougé sous la carte), rien n'est appliqué. */
  function lot(def) {
    const verifier = args => {
      const liste = args && args.lot;
      if (!Array.isArray(liste) || !liste.length) throw new Error("« lot » : une liste d'au moins un élément.");
      if (liste.length > LOT_MAX) throw new Error("Lot trop long : " + liste.length + " éléments, " + LOT_MAX + " au plus par carte.");
      const v = def.verifier(args);
      if (v.refus.length) throw new Error("Rien n'est changé : " + v.refus.join(" ; ") + ".");
      if (!v.lignes.length) throw new Error("Rien à changer : tout est déjà à ces valeurs.");
      return v;
    };
    return {
      ecriture: true, historique: true,
      proposer: args => {
        const v = verifier(args);
        return { titre: def.titre + " (" + v.lignes.length + " changement" + (v.lignes.length > 1 ? "s" : "") + ")",
                 avant: v.lignes.map(l => l.quoi + " : " + montrer(l.avant)).join("\n"),
                 apres: v.lignes.map(l => l.quoi + " : " + montrer(l.apres)).join("\n"),
                 lignes: JSON.stringify(v.lignes) };
      },
      appliquer: (args, prop) => {
        const v = verifier(args);
        if (prop && prop.lignes !== undefined && JSON.stringify(v.lignes) !== prop.lignes)
          throw new Error("Le document a changé depuis la carte : rien n'est appliqué, à reproposer.");
        push();
        def.muter(args);
        def.rafraichir();
      },
    };
  }

  /* ---------- composants du schéma ----------
     Un repère est unique dans tout le document : la feuille affichée vit dans S.comps,
     les autres dans S.pages[i].comps. */
  function compsSch() {
    const out = [...S.comps];
    (S.pages || []).forEach((p, i) => { if (i !== S.page) out.push(...(p.comps || [])); });
    return out;
  }
  const REF = /^[A-Za-z][A-Za-z0-9_]{0,19}$/;
  const CHAMPS_SCH = ["ref", "valeur", "boitier", "fabricant", "mpn", "specs", "non_monte"];
  const PROP_SCH = { valeur: "value", boitier: "pkg", fabricant: "manufacturer", mpn: "mpn" };

  function verifierSch(args) {
    const lignes = [], refus = [], tous = compsSch();
    const cle = r => String(r || "").trim().toUpperCase();
    const pris = new Set(tous.map(c => cle(c.ref)).filter(Boolean)), vus = new Set();
    for (const e of args.lot) {
      const c = e && typeof e.ref === "string" ? tous.find(x => cle(x.ref) === cle(e.ref)) : null;
      if (!c) { refus.push("repère « " + (e && e.ref) + " » introuvable (voir cao_schema_lire composants)"); continue; }
      if (vus.has(c)) { refus.push(c.ref + " : deux fois dans le lot"); continue; }
      vus.add(c);
      const ch = e.champs;
      if (!ch || typeof ch !== "object" || Array.isArray(ch) || !Object.keys(ch).length) { refus.push(c.ref + " : « champs » vide"); continue; }
      for (const k of Object.keys(ch)) {
        if (!CHAMPS_SCH.includes(k)) { refus.push(c.ref + " : champ « " + k + " » inconnu (" + CHAMPS_SCH.join(", ") + ")"); continue; }
        const quoi = c.ref + "." + k, v = ch[k];
        if (k === "ref") {
          if (typeof v !== "string" || !REF.test(v)) { refus.push(quoi + " : lettre puis lettres, chiffres ou _, 20 au plus"); continue; }
          if (cle(v) !== cle(c.ref) && pris.has(cle(v))) { refus.push(quoi + " : « " + v + " » est déjà pris"); continue; }
          pris.delete(cle(c.ref)); pris.add(cle(v));
          if (v !== c.ref) lignes.push({ quoi, avant: c.ref, apres: v });
        } else if (k === "non_monte") {
          if (typeof v !== "boolean") { refus.push(quoi + " : true ou false"); continue; }
          if (v !== !!c.nonMonte) lignes.push({ quoi, avant: !!c.nonMonte, apres: v });
        } else if (k === "specs") {
          // une clé à null l'efface ; les autres clés de c.specs restent
          if (!v || typeof v !== "object" || Array.isArray(v) || Object.keys(v).length > 30) { refus.push(quoi + " : objet de 30 clés au plus"); continue; }
          for (const s of Object.keys(v)) {
            if (!/^[^\x00-\x1f]{1,60}$/.test(s)) { refus.push(quoi + " : clé « " + s + " » invalide"); continue; }
            if (v[s] !== null && texte(v[s], quoi + "." + s, refus) === null) continue;
            const avant = c.specs && Object.prototype.hasOwnProperty.call(c.specs, s) ? c.specs[s] : null;
            if (avant !== v[s]) lignes.push({ quoi: quoi + "." + s, avant, apres: v[s] });
          }
        } else {
          if (texte(v, quoi, refus) === null) continue;
          const avant = c[PROP_SCH[k]] || "";
          if (avant !== v) lignes.push({ quoi, avant, apres: v });
        }
      }
    }
    return { lignes, refus };
  }

  function muterSch(args) {
    const tous = compsSch(), cle = r => String(r || "").trim().toUpperCase();
    // tous les repères d'abord cherchés : un renommage dans le lot ne doit pas égarer la suite
    const cibles = args.lot.map(e => [tous.find(x => cle(x.ref) === cle(e.ref)), e.champs]);
    for (const [c, ch] of cibles) {
      const poser = () => {
        for (const [k, p] of Object.entries(PROP_SCH)) if (k in ch) c[p] = ch[k];
      };
      // la valeur d'un CI redessine ses broches : les fils suivent (reshapeComp)
      const def = typeof defOf === "function" ? defOf(c.type) : null;
      if ("valeur" in ch && def && typeof def.pins === "function" && typeof reshapeComp === "function") reshapeComp(c, poser);
      else poser();
      if ("ref" in ch) c.ref = ch.ref;
      if ("non_monte" in ch) { if (ch.non_monte) c.nonMonte = true; else delete c.nonMonte; }
      if (ch.specs) {
        c.specs = Object.assign({}, c.specs);
        for (const [s, v] of Object.entries(ch.specs)) { if (v === null) delete c.specs[s]; else c.specs[s] = v; }
      }
    }
  }

  function rafraichirSch() {
    if (typeof buildList === "function") buildList();
    if (typeof refreshPanels === "function") refreshPanels();
    if (typeof draw === "function") draw();
  }

  const COMPOSANTS_SCH = lot({ titre: "Composants du schéma", verifier: verifierSch, muter: muterSch, rafraichir: rafraichirSch });

  return { lot, composantsSch: COMPOSANTS_SCH, LOT_MAX };
})();
