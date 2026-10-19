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
     - rafraichir() : redessine la page ;
     - drc : au PCB, le DRC tourne avant et après, et son bilan s'ajoute au texte « après »
       de la carte, que pilote.js renvoie à Claude.
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
        const avant = def.drc ? erreursDrc() : null;
        push();
        def.muter(args);
        def.rafraichir();
        if (def.drc && prop) prop.apres += "\n" + bilanDrc(avant, erreursDrc());
      },
    };
  }

  /* ---------- DRC avant → après (PCB) ---------- */
  const DRC_MAX = 80;
  const cleDrc = d => d.msg + "|" + Math.round(d.x * 100) + "|" + Math.round(d.y * 100);
  function erreursDrc() { return runDrc().filter(d => !d.info); }
  function bilanDrc(avant, apres) {
    const vues = new Set(avant.map(cleDrc));
    const neuves = apres.filter(d => !vues.has(cleDrc(d)));
    const pl = n => n + " erreur" + (n > 1 ? "s" : "");
    const lignes = ["DRC : " + pl(avant.length) + " avant → " + apres.length + " après."];
    if (neuves.length) lignes.push("Nouvelles erreurs (" + neuves.length + ") :");
    for (const d of neuves.slice(0, DRC_MAX)) lignes.push("- " + d.msg + " (x " + ux(d.x) + " y " + uy(d.y) + " mm)");
    if (neuves.length > DRC_MAX) lignes.push("... (" + (neuves.length - DRC_MAX) + " de plus : cao_drc les liste)");
    return lignes.join("\n");
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

  /* ---------- composants du PCB ----------
     Position dans le repère de l'utilisateur (ux/uy, wxu/wyu), comme le panneau. Face,
     position et rotation passent par transformFps : le cuivre accroché suit, selon la
     préférence de l'utilisateur (S.moveEtch). */
  const FACES = { dessus: 0, dessous: 1 };
  const CHAMPS_PCB = ["ref", "valeur", "boitier", "face", "x", "y", "rotation"];
  const POSE = ["face", "x", "y", "rotation"];
  const cleRef = r => String(r || "").trim().toUpperCase();
  const empreinte = ref => typeof ref === "string" ? S.fps.find(f => cleRef(f.ref) === cleRef(ref)) : null;
  const angle = v => ((v % 360) + 360) % 360;

  function verifierPcb(args) {
    const lignes = [], refus = [];
    const pris = new Set(S.fps.map(f => cleRef(f.ref)).filter(Boolean)), vus = new Set();
    for (const e of args.lot) {
      const fp = e && empreinte(e.ref);
      if (!fp) { refus.push("repère « " + (e && e.ref) + " » introuvable (voir cao_pcb_lire composants)"); continue; }
      if (vus.has(fp)) { refus.push(fp.ref + " : deux fois dans le lot"); continue; }
      vus.add(fp);
      const ch = e.champs;
      if (!ch || typeof ch !== "object" || Array.isArray(ch) || !Object.keys(ch).length) { refus.push(fp.ref + " : « champs » vide"); continue; }
      for (const k of Object.keys(ch)) {
        if (!CHAMPS_PCB.includes(k)) { refus.push(fp.ref + " : champ « " + k + " » inconnu (" + CHAMPS_PCB.join(", ") + ")"); continue; }
        const quoi = fp.ref + "." + k, v = ch[k];
        if (k === "ref") {
          if (typeof v !== "string" || !REF.test(v)) { refus.push(quoi + " : lettre puis lettres, chiffres ou _, 20 au plus"); continue; }
          if (cleRef(v) !== cleRef(fp.ref) && pris.has(cleRef(v))) { refus.push(quoi + " : « " + v + " » est déjà pris"); continue; }
          pris.delete(cleRef(fp.ref)); pris.add(cleRef(v));
          if (v !== fp.ref) lignes.push({ quoi, avant: fp.ref, apres: v });
        } else if (k === "valeur") {
          if (texte(v, quoi, refus) !== null && v !== (fp.value || "")) lignes.push({ quoi, avant: fp.value || "", apres: v });
        } else if (k === "boitier") {
          if (texte(v, quoi, refus) === null) continue;
          // la page ignore en silence un boîtier hors table ; ici, c'est un refus
          const g = v.trim() ? pkgGeom(v.trim(), fpWiredPins(fp)) : null;
          if (!g || (fpFree(fp) && !g.pads)) { refus.push(quoi + " : « " + v + " » inconnu des empreintes (bibliothèque ou table de boîtiers)"); continue; }
          if (v.trim() !== (fp.pkg || "")) lignes.push({ quoi, avant: fp.pkg || "", apres: v.trim() });
        } else if (k === "face") {
          if (!Object.prototype.hasOwnProperty.call(FACES, v)) { refus.push(quoi + " : dessus ou dessous"); continue; }
          const avant = fp.side ? "dessous" : "dessus";
          if (v !== avant) lignes.push({ quoi, avant, apres: v });
        } else {
          if (typeof v !== "number" || !Number.isFinite(v) || (k !== "rotation" && Math.abs(v) > 1000)) {
            refus.push(quoi + (k === "rotation" ? " : nombre de degrés" : " : nombre de mm, à ±1000")); continue;
          }
          const avant = k === "x" ? ux(fp.x) : k === "y" ? uy(fp.y) : angle(fp.rot || 0);
          const apres = k === "rotation" ? angle(v) : r3(v);
          if (apres !== avant) lignes.push({ quoi, avant, apres });
        }
      }
    }
    return { lignes, refus };
  }

  function muterPcb(args) {
    const cibles = args.lot.map(e => [empreinte(e.ref), e.champs]);
    for (const [fp, ch] of cibles) {
      if ("ref" in ch) fp.ref = ch.ref;
      if ("valeur" in ch) fp.value = ch.valeur;
      if ("boitier" in ch) { fp.pkg = ch.boitier.trim(); applyPkgGeom(fp); }
      if (POSE.some(k => k in ch)) transformFps([fp.id], () => {
        if ("face" in ch) fp.side = FACES[ch.face];
        if ("x" in ch) fp.x = wxu(ch.x);
        if ("y" in ch) fp.y = wyu(ch.y);
        if ("rotation" in ch) fp.rot = angle(ch.rotation);
      });
    }
  }

  function rafraichirPcb() { touch(); refreshPanels(); draw(); }

  const COMPOSANTS_PCB = lot({ titre: "Composants du PCB", verifier: verifierPcb, muter: muterPcb, rafraichir: rafraichirPcb, drc: true });

  return { lot, composantsSch: COMPOSANTS_SCH, composantsPcb: COMPOSANTS_PCB, LOT_MAX };
})();
