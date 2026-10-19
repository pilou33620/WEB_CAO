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
  // des noms venus du projet ou de Claude servent de clés d'objet : jamais ceux-là
  const CLE_INTERDITE = new Set(["__proto__", "constructor", "prototype"]);

  function texte(v, nom, refus) {
    if (typeof v !== "string" || !TEXTE.test(v)) { refus.push(nom + " : texte d'une ligne, 200 caractères au plus"); return null; }
    return v;
  }
  const montrer = v => v === undefined || v === null || v === "" ? "—" : typeof v === "object" ? JSON.stringify(v) : String(v);

  /* Une commande d'écriture du canal, faite d'un lot. `def` :
     - titre : le titre de la carte ; max : le plafond du lot (LOT_MAX par défaut) ;
     - verifier(args) → {lignes:[{quoi, avant, apres}], refus:[]} sans rien toucher ;
     - muter(args) : applique, sans push() ; peut rendre {jeton, notes} (notes ajoutées au
       texte « après », jeton gardé par pilote.js pour annuler) ;
     - rafraichir() : redessine la page ;
     - drc : au PCB, le DRC tourne avant et après, et son bilan s'ajoute au texte « après »
       de la carte, que pilote.js renvoie à Claude ;
     - annuler(args, jeton) et etat() : pour ce qui n'est pas dans l'historique de l'éditeur
       (la simulation) ; sinon, un seul push() et Ctrl+Z défait le lot.
     La carte garde ses lignes : au clic, si la vérification ne redonne pas les mêmes (le
     document a bougé sous la carte), rien n'est appliqué. */
  function lot(def) {
    const verifier = args => {
      const liste = args && args.lot;
      if (!Array.isArray(liste) || !liste.length) throw new Error("« lot » : une liste d'au moins un élément.");
      const max = def.max || LOT_MAX;
      if (liste.length > max) throw new Error("Lot trop long : " + liste.length + " éléments, " + max + " au plus par carte.");
      const v = def.verifier(args);
      if (v.refus.length) throw new Error("Rien n'est changé : " + v.refus.join(" ; ") + ".");
      if (!v.lignes.length) throw new Error("Rien à changer : tout est déjà à ces valeurs.");
      return v;
    };
    const cmd = {
      ecriture: true,
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
        if (!def.annuler) push();
        let r;
        try { r = def.muter(args) || {}; }
        catch (e) {
          // un lot à moitié appliqué serait pire qu'un refus : retour à l'instantané qu'on vient de pousser
          if (!def.annuler) undo();
          def.rafraichir();
          throw new Error("Échec en appliquant, rien n'est changé : " + ((e && e.message) || e));
        }
        def.rafraichir();
        let drc = [];
        if (def.drc) { try { drc = [bilanDrc(avant, erreursDrc())]; } catch (e) { drc = ["DRC indisponible après l'écriture : " + ((e && e.message) || e)]; } }
        const notes = (r.notes || []).concat(drc);
        if (prop && notes.length) prop.apres += "\n" + notes.join("\n");
        return r.jeton;
      },
    };
    if (def.annuler) Object.assign(cmd, { annuler: def.annuler, etat: def.etat });
    else cmd.historique = true;
    return cmd;
  }

  /* ---------- DRC avant → après (PCB) ---------- */
  const DRC_MAX = 80;
  function erreursDrc() { return runDrc().filter(d => !d.info); }
  // par message, avec leur nombre : une erreur qui a seulement bougé avec sa pastille n'est pas neuve
  function bilanDrc(avant, apres) {
    const restant = new Map();
    for (const d of avant) restant.set(d.msg, (restant.get(d.msg) || 0) + 1);
    const neuves = apres.filter(d => { const n = restant.get(d.msg) || 0; restant.set(d.msg, n - 1); return n <= 0; });
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
      const c = e && typeof e.ref === "string" && cle(e.ref) ? tous.find(x => cle(x.ref) === cle(e.ref)) : null;
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
            if (!/^[^\x00-\x1f]{1,60}$/.test(s) || CLE_INTERDITE.has(s)) { refus.push(quoi + " : clé « " + s + " » invalide"); continue; }
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
      // la valeur d'un CI (texte du corps) élargit son symbole et déplace ses broches : les fils suivent (reshapeComp)
      const def = typeof defOf === "function" ? defOf(c.type) : null;
      if ("valeur" in ch && def && typeof def.pins === "function" && typeof reshapeComp === "function") {
        // reshapeComp fait suivre S.wires, les fils de la feuille affichée : ceux de la feuille du CI ici
        const page = S.comps.includes(c) ? null : S.pages.find(p => (p.comps || []).includes(c));
        if (!page) reshapeComp(c, poser);
        else { const affiches = S.wires; S.wires = page.wires || []; try { reshapeComp(c, poser); } finally { S.wires = affiches; } }
      } else poser();
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
  const empreinte = ref => typeof ref === "string" && cleRef(ref) ? S.fps.find(f => cleRef(f.ref) === cleRef(ref)) : null;
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
          // comme l'import de la netlist (fpReposerBoitier) : l'empreinte de la LIB, sinon la table ;
          // le panneau, lui, garderait en silence l'ancienne forme pour un boîtier inconnu
          const nom = v.trim();
          if (!nom || !(fpLibPourBoitier(nom) || pkgGeom(nom, fpWiredPins(fp)))) {
            refus.push(quoi + " : « " + v + " » inconnu des empreintes (LIB ou table de boîtiers)"); continue;
          }
          if (fpFree(fp) && !fp.lib) { refus.push(quoi + " : empreinte dessinée à la main, qu'un boîtier ne refait pas : change-la dans l'éditeur"); continue; }
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
      if ("boitier" in ch) {
        fp.pkg = ch.boitier.trim();
        fpReshape(fp, () => fpReposerBoitier(fp, fp.pkg, fpWiredPins(fp)));   // les pistes suivent les pastilles
      }
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

  /* ---------- pistes ----------
     {net, largeur, couche?} : les pistes du net (d'une couche) ; {net, realigner: true} :
     pistes et vias du net remis sur leur classe, comme applyClasses() pour ce seul net. */
  const coucheIndex = nom => {
    const i = [...Array(S.cu).keys()].find(k => LECTURE_CAO.aides.nomCouchePcb(k).toLowerCase() === String(nom).toLowerCase());
    return i === undefined ? -1 : i;
  };
  const largeurs = ts => [...new Set(ts.map(t => r3(t.w)))].sort((a, b) => a - b).join(" / ");
  function hors(net) {
    return { pistes: S.tracks.filter(t => t.net === net && Math.abs(t.w - classWidth(t.net, t.l)) > 1e-6),
             vias: S.vias.filter(v => v.net === net && (Math.abs(v.d - classOf(net).via) > 1e-6 || Math.abs(v.drill - percageVia(classOf(net))) > 1e-6)) };
  }
  const percageVia = cl => Math.min(cl.drill, cl.via - 0.1);     // comme applyClasses
  function pistesDe(e) {
    const l = e.couche == null ? null : coucheIndex(e.couche);
    return S.tracks.filter(t => t.net === e.net && (l === null || t.l === l));
  }

  function verifierPistes(args) {
    const lignes = [], refus = [], vus = new Set();
    for (const e of args.lot) {
      if (!e || typeof e.net !== "string" || !e.net) { refus.push("« net » manquant"); continue; }
      const cle = e.net + "|" + (e.couche == null ? "*" : String(e.couche).toLowerCase());
      if (vus.has(cle)) { refus.push(e.net + " : deux fois dans le lot"); continue; }
      vus.add(cle);
      if (!S.tracks.some(t => t.net === e.net)) { refus.push("net « " + e.net + " » : aucune piste (voir cao_pcb_lire nets)"); continue; }
      if (e.realigner === true) {
        if (e.largeur != null || e.couche != null) { refus.push(e.net + " : « realigner » se donne seul"); continue; }
        const h = hors(e.net);
        if (h.pistes.length || h.vias.length)
          lignes.push({ quoi: "net " + e.net + " (classe " + classOf(e.net).name + ")",
                        avant: h.pistes.length + " piste(s) et " + h.vias.length + " via(s) hors classe",
                        apres: "réalignés sur la classe" });
        continue;
      }
      if (e.couche != null && coucheIndex(e.couche) < 0) {
        refus.push(e.net + " : couche « " + e.couche + " » inconnue (" + [...Array(S.cu).keys()].map(LECTURE_CAO.aides.nomCouchePcb).join(", ") + ")"); continue;
      }
      if (typeof e.largeur !== "number" || !(e.largeur >= 0.05 && e.largeur <= 10)) { refus.push(e.net + " : largeur de 0,05 à 10 mm"); continue; }
      const ts = pistesDe(e);
      if (!ts.length) { refus.push(e.net + " : aucune piste sur " + e.couche); continue; }
      if (ts.some(t => Math.abs(t.w - e.largeur) > 1e-6))
        lignes.push({ quoi: "net " + e.net + (e.couche != null ? " sur " + LECTURE_CAO.aides.nomCouchePcb(coucheIndex(e.couche)) : "") +
                            " (" + ts.length + " piste(s)), largeur",
                      avant: largeurs(ts), apres: r3(e.largeur) });
    }
    return { lignes, refus };
  }

  function muterPistes(args) {
    for (const e of args.lot) {
      if (e.realigner) {
        const h = hors(e.net), cl = classOf(e.net);
        for (const t of h.pistes) t.w = classWidth(t.net, t.l);
        for (const v of h.vias) { v.d = cl.via; v.drill = percageVia(cl); }
      } else for (const t of pistesDe(e)) t.w = r3(e.largeur);
    }
  }

  function rafraichirRegles() { touch(); zoneCache.clear(); refreshPanels(); draw(); reSync(); }   // reSync : rien si la fenêtre Règles est fermée

  const PISTES = lot({ titre: "Largeur des pistes", verifier: verifierPistes, muter: muterPistes, rafraichir: rafraichirRegles, drc: true });

  /* ---------- classes de nets ----------
     Un lot d'actions jouées dans l'ordre sur une copie (classes et rattachements) : on peut
     créer une classe puis y rattacher des nets dans la même carte. La copie validée
     remplace S.classes et S.netClass d'un coup. */
  const CHAMPS_CLASSE = { largeur: ["w", 0.05, 10], isolation: ["clr", 0.05, 5], via: ["via", 0.2, 6], percage: ["drill", 0.05, 6] };
  const decrire = c => "largeur " + c.w + ", isolation " + c.clr + ", via " + c.via + ", perçage " + c.drill +
                       (c.wL ? ", par couche " + Object.keys(c.wL).map(l => LECTURE_CAO.aides.nomCouchePcb(+l) + " " + c.wL[l]).join(" ") : "");

  function jouerClasses(args) {
    const classes = S.classes.map(c => Object.assign({}, c, c.wL ? { wL: Object.assign({}, c.wL) } : {}));
    const netClass = Object.assign({}, S.netClass);
    const lignes = [], refus = [];
    const trouver = nom => classes.findIndex(c => c.name.toLowerCase() === String(nom).toLowerCase());
    const nets = new Set(netTable().map(n => n.name));
    for (const e of args.lot) {
      const a = e && e.action;
      if (a === "affecter") {
        if (typeof e.net !== "string" || !nets.has(e.net) || CLE_INTERDITE.has(e.net)) { refus.push("net « " + (e && e.net) + " » inconnu (voir cao_pcb_lire nets)"); continue; }
        const i = trouver(e.classe);
        if (i < 0) { refus.push(e.net + " : classe « " + e.classe + " » inconnue"); continue; }
        const avant = netClass[e.net] && trouver(netClass[e.net]) >= 0 ? classes[trouver(netClass[e.net])].name : classes[0].name;
        if (i === 0) delete netClass[e.net]; else netClass[e.net] = classes[i].name;   // comme setNetClass
        if (avant !== classes[i].name) lignes.push({ quoi: "net " + e.net + ", classe", avant, apres: classes[i].name });
        continue;
      }
      if (!["creer", "modifier", "supprimer"].includes(a)) { refus.push("action « " + a + " » inconnue (creer, modifier, supprimer, affecter)"); continue; }
      if (typeof e.nom !== "string" || !/^[^\x00-\x1f]{1,40}$/.test(e.nom.trim())) { refus.push("nom de classe : 1 à 40 caractères"); continue; }
      const i = trouver(e.nom.trim());
      if (a === "supprimer") {
        if (i < 0) { refus.push("classe « " + e.nom + " » inconnue"); continue; }
        if (i === 0) { refus.push("« " + classes[0].name + " » est la classe par défaut : elle ne se supprime pas"); continue; }
        lignes.push({ quoi: "classe " + classes[i].name, avant: decrire(classes[i]), apres: null });
        classes.splice(i, 1);
        continue;
      }
      if (a === "creer" && i >= 0) { refus.push("classe « " + e.nom + " » : existe déjà"); continue; }
      if (a === "modifier" && i < 0) { refus.push("classe « " + e.nom + " » inconnue"); continue; }
      // une copie : la classe de travail ne change qu'une fois la candidate validée
      const cand = Object.assign({}, a === "creer" ? classes[0] : classes[i], a === "creer" ? { name: e.nom.trim() } : {});
      if (a === "creer") delete cand.wL; else if (cand.wL) cand.wL = Object.assign({}, cand.wL);
      const quoi = "classe " + cand.name;
      let ok = true;
      for (const [k, [cle, mini, maxi]] of Object.entries(CHAMPS_CLASSE)) {
        if (e[k] === undefined) continue;
        if (typeof e[k] !== "number" || !(e[k] >= mini && e[k] <= maxi)) { refus.push(quoi + "." + k + " : de " + mini + " à " + maxi + " mm"); ok = false; continue; }
        cand[cle] = e[k];
      }
      if (e.largeur_couches !== undefined) {
        const wl = e.largeur_couches;
        if (!wl || typeof wl !== "object" || Array.isArray(wl)) { refus.push(quoi + ".largeur_couches : {couche: largeur}"); ok = false; }
        else {
          cand.wL = Object.assign({}, cand.wL);
          for (const [nom, v] of Object.entries(wl)) {
            const l = coucheIndex(nom);
            if (l < 0) { refus.push(quoi + " : couche « " + nom + " » inconnue"); ok = false; continue; }
            if (v === null) { delete cand.wL[l]; continue; }
            if (typeof v !== "number" || !(v >= 0.05 && v <= 10)) { refus.push(quoi + " : largeur sur " + nom + " de 0,05 à 10 mm"); ok = false; continue; }
            cand.wL[l] = v;
          }
          if (!Object.keys(cand.wL).length) delete cand.wL;
        }
      }
      if (!ok) continue;
      if (!(cand.drill <= r3(cand.via - 0.05))) { refus.push(quoi + " : perçage " + cand.drill + " trop grand pour une via de " + cand.via); continue; }
      // la page bornerait en silence : une valeur qu'elle changerait est refusée ici
      const norme = normClass(cand, 0);
      if (decrire(norme) !== decrire(cand) || norme.name !== cand.name) { refus.push(quoi + " : valeurs refusées par la page (" + decrire(norme) + ")"); continue; }
      if (a === "creer") { classes.push(norme); lignes.push({ quoi, avant: null, apres: decrire(norme) }); }
      else if (decrire(norme) !== decrire(classes[i])) { lignes.push({ quoi, avant: decrire(classes[i]), apres: decrire(norme) }); classes[i] = norme; }
    }
    // aucun net ne doit finir rattaché à une classe absente (supprimée, ou recréée avec une autre casse) ;
    // un rattachement déjà orphelin avant le lot n'est pas le fait de cette carte
    const noms = new Set(classes.map(c => c.name));
    const dejaOrphelin = (net, nom) => S.netClass[net] === nom && !S.classes.some(c => c.name === nom);
    for (const [net, nom] of Object.entries(netClass))
      if (!noms.has(nom) && !dejaOrphelin(net, nom))
        refus.push("classe « " + nom + " » supprimée alors que le net " + net + " y est encore rattaché");
    return { lignes, refus, classes, netClass };
  }

  const CLASSES = lot({
    titre: "Classes de nets (le routage posé ne bouge pas : cao_pistes_ecrire realigner)",
    verifier: jouerClasses,
    muter: args => { const j = jouerClasses(args); S.classes = j.classes; S.netClass = j.netClass; },
    rafraichir: rafraichirRegles, drc: true,
  });

  /* ---------- paires différentielles et contraintes de net ----------
     {action:"paire", nom, …} crée ou modifie une règle de paire (S.dpRules) ;
     {action:"net", net, …} pose les contraintes d'un net (S.contraintes.nets) ; null efface
     une clé. Les contraintes saisies au schéma (S.contraintes.schema) ne sont pas touchées. */
  const CHAMPS_PAIRE = { largeur_min: "minW", largeur_pref: "prefW", largeur_max: "maxW", ecart_min: "minGap",
                         ecart_pref: "prefGap", ecart_max: "maxGap", decouple_max: "maxUncoupled" };
  const CHAMPS_NET = { z: "z", z_tol: "zTol", l_min: "lMin", l_max: "lMax", vias_max: "viasMax" };
  const nomsCouches = ls => ls.map(l => LECTURE_CAO.aides.nomCouchePcb(l)).join(" ");

  function jouerContraintes(args) {
    const regles = S.dpRules.map(r => Object.assign({}, r));
    const cnets = Object.assign({}, S.contraintes.nets);
    const lignes = [], refus = [];
    const nets = new Set(netTable().map(n => n.name)), paires = new Set(S.dpPairs.map(p => p.name));
    for (const e of args.lot) {
      const a = e && e.action;
      if (a === "paire") {
        if (typeof e.nom !== "string" || !/^[^\x00-\x1f]{1,40}$/.test(e.nom.trim())) { refus.push("nom de règle de paire : 1 à 40 caractères"); continue; }
        let i = regles.findIndex(r => r.name.toLowerCase() === e.nom.trim().toLowerCase());
        const cand = Object.assign({}, i >= 0 ? regles[i] : DP_FALLBACK, i >= 0 ? {} : { name: e.nom.trim(), layers: {}, scope: "" });
        const quoi = "paire " + cand.name;
        let ok = true;
        for (const [k, cle] of Object.entries(CHAMPS_PAIRE)) {
          if (e[k] === undefined) continue;
          const maxi = k === "decouple_max" ? 1e4 : 100, mini = k === "decouple_max" ? 0 : 0.01;
          if (typeof e[k] !== "number" || !(e[k] >= mini && e[k] <= maxi)) { refus.push(quoi + "." + k + " : de " + mini + " à " + maxi + " mm"); ok = false; continue; }
          cand[cle] = e[k];
        }
        if (e.portee !== undefined) {
          if (e.portee !== "" && !paires.has(e.portee)) { refus.push(quoi + " : paire « " + e.portee + " » inconnue (vide : toutes les paires)"); ok = false; }
          else cand.scope = e.portee;
        }
        if (e.impedance !== undefined) {
          if (e.impedance !== "" && !dpProfile(e.impedance)) { refus.push(quoi + " : impédance « " + e.impedance + " » inconnue (" + DP_PROFILES.map(p => p.id).join(", ") + ")"); ok = false; }
          else { cand.imp = e.impedance; cand.useImp = e.impedance !== ""; }
        }
        if (!ok) continue;
        if (!(cand.minW <= cand.prefW && cand.prefW <= cand.maxW && cand.minGap <= cand.prefGap && cand.prefGap <= cand.maxGap)) {
          refus.push(quoi + " : il faut min ≤ préférée ≤ max, pour la largeur et pour l'écart"); continue;
        }
        const norme = normDpRule(cand, 0, S.cu);
        const vue = r => Object.keys(CHAMPS_PAIRE).map(k => k + " " + r[CHAMPS_PAIRE[k]]).join(", ") + ", portée " + (r.scope || "toutes") + ", impédance " + (r.useImp ? r.imp : "—");
        if (vue(norme) !== vue(cand)) { refus.push(quoi + " : valeurs refusées par la page (" + vue(norme) + ")"); continue; }
        if (i < 0) { regles.push(Object.assign(norme, { nouvelle: true })); lignes.push({ quoi, avant: null, apres: vue(norme) }); }
        else if (vue(norme) !== vue(regles[i])) { lignes.push({ quoi, avant: vue(regles[i]), apres: vue(norme) }); regles[i] = Object.assign(norme, { uid: regles[i].uid, nouvelle: regles[i].nouvelle }); }
        continue;
      }
      if (a !== "net") { refus.push("action « " + a + " » inconnue (paire, net)"); continue; }
      if (typeof e.net !== "string" || !nets.has(e.net) || CLE_INTERDITE.has(e.net)) { refus.push("net « " + (e && e.net) + " » inconnu (voir cao_pcb_lire nets)"); continue; }
      const cand = Object.assign({}, cnets[e.net]), quoi = "contraintes " + e.net;
      let ok = true;
      for (const [k, cle] of Object.entries(CHAMPS_NET)) {
        if (e[k] === undefined) continue;
        if (e[k] === null) { delete cand[cle]; continue; }
        if (typeof e[k] !== "number" || !Number.isFinite(e[k])) { refus.push(quoi + "." + k + " : un nombre, ou null pour l'effacer"); ok = false; continue; }
        cand[cle] = e[k];
      }
      if (e.couches !== undefined) {
        if (e.couches === null) delete cand.couches;
        else if (!Array.isArray(e.couches) || !e.couches.length) { refus.push(quoi + ".couches : une liste de noms de couches"); ok = false; }
        else {
          const ls = e.couches.map(coucheIndex);
          if (ls.some(l => l < 0)) { refus.push(quoi + " : couche inconnue dans " + e.couches.join(", ")); ok = false; }
          else cand.couches = [...new Set(ls)].sort((x, y) => x - y);
        }
      }
      if (!ok) continue;
      if (cand.lMin != null && cand.lMax != null && cand.lMin > cand.lMax) { refus.push(quoi + " : l_min plus grand que l_max"); continue; }
      const norme = cmNormRegle(cand) || {};
      const vue = r => Object.keys(CHAMPS_NET).filter(k => r[CHAMPS_NET[k]] != null).map(k => k + " " + r[CHAMPS_NET[k]])
                       .concat(r.couches ? ["couches " + nomsCouches(r.couches)] : []).join(", ") || "aucune";
      if (vue(norme) !== vue(cand)) { refus.push(quoi + " : valeurs refusées par la page (gardées : " + vue(norme) + ")"); continue; }
      const avant = vue(cnets[e.net] || {});
      if (Object.keys(norme).length) cnets[e.net] = norme; else delete cnets[e.net];
      if (vue(norme) !== avant) lignes.push({ quoi, avant, apres: vue(norme) });
    }
    return { lignes, refus, regles, cnets };
  }

  const CONTRAINTES = lot({
    titre: "Paires différentielles et contraintes de net",
    verifier: jouerContraintes,
    muter: args => {
      const j = jouerContraintes(args);
      // une règle neuve reçoit son identifiant ici seulement : il est tiré au hasard
      S.dpRules = j.regles.map(r => { if (!r.nouvelle) return r; const n = Object.assign({}, r, { uid: dpUid() }); delete n.nouvelle; return n; });
      S.contraintes = Object.assign({}, S.contraintes, { nets: j.cnets });
    },
    rafraichir: rafraichirRegles, drc: true,
  });

  /* ---------- paramètres de simulation ----------
     Le catalogue de la page (simDsGroupes : unité, bornes, choix) contrôle chaque valeur ;
     l'unité donnée doit être celle du catalogue, sans conversion. simDsAppliquer écrit et
     garde ses effets (recalcul PDN, résultats SI périmés, assistant ΔI) ; annuler rejoue
     les valeurs d'avant par le même chemin. Hors de l'historique de l'éditeur. */
  function simPrete() {
    if (typeof simDsGroupes !== "function" || typeof SIM === "undefined")
      throw new Error("Les simulations ne sont pas chargées dans cette page.");
  }
  const avecUnite = (v, u) => v === null || v === undefined ? null : u ? v + " " + u : v;

  function verifierSim(args) {
    simPrete();
    const lignes = [], refus = [], vus = new Set(), aEcrire = [];
    for (const e of args.lot) {
      const g = e && typeof e.groupe === "string" ? simDsGroupe(e.groupe) : null;
      if (!g) { refus.push("groupe « " + (e && e.groupe) + " » inconnu (" + simDsGroupes().map(x => x.cle).join(", ") + ")"); continue; }
      const ch = typeof e.cle === "string" ? simDsChamp(g, e.cle) : null;
      if (!ch) { refus.push(g.cle + " : paramètre « " + e.cle + " » inconnu (" + g.champs.map(c => c.cle).join(", ") + ")"); continue; }
      const quoi = g.cle + "." + ch.cle + " (" + ch.lib + ")";
      if (vus.has(quoi)) { refus.push(quoi + " : deux fois dans le lot"); continue; }
      vus.add(quoi);
      if ((e.unite || "") !== (ch.unite || "")) { refus.push(quoi + " : unité « " + (e.unite || "") + " », le catalogue attend « " + (ch.unite || "") + " »"); continue; }
      const l = simDsPreparer({ valeurs: [{ sim: g.cle, cle: ch.cle, valeur: e.valeur }] }).lignes[0];
      if (!l.ok) { if (l.motif !== "déjà à cette valeur") refus.push(quoi + " : " + l.motif); continue; }
      if (l.actuel === l.nouveau) continue;                     // simDsPreparer ne le voit que pour les nombres
      lignes.push({ quoi, avant: avecUnite(l.actuel, ch.unite), apres: avecUnite(l.nouveau, ch.unite) });
      aEcrire.push({ sim: g.cle, cle: ch.cle, valeur: l.nouveau, avant: l.actuel });
    }
    return { lignes, refus, aEcrire };
  }

  function ecrireSim(valeurs) {
    const prep = simDsPreparer({ valeurs });
    const r = simDsAppliquer(prep, prep.lignes.filter(l => l.ok).map(l => l.id));
    const rates = prep.lignes.filter(l => /^échec/.test(l.motif || ""));
    if (rates.length) throw new Error(rates.map(l => l.sim + "." + l.cle + " : " + l.motif).join(" ; "));
    return r.messages || [];
  }
  /* Ce qu'une écriture du catalogue change EN PLUS de ses valeurs : la fiche de la charge
     (gardée dans le profil, pour tous les projets), l'assistant ΔI (profil aussi), ΔI et
     son mode, le front repris par le crosstalk. La carte le garde ; Annuler le remet. */
  function cotesSim() {
    const P = typeof SIM_PDN !== "undefined" ? SIM_PDN : {};
    return JSON.parse(JSON.stringify({
      fiche: P.fiche || null, assistant: !!P.assistantActif, manuel: !!P.deltaIManuel, deltaIA: P.deltaIA,
      evenements: P.evenements || null, xtTr: typeof SIM_XT !== "undefined" ? SIM_XT.saisie.tr : null,
      profilFiches: typeof profLire === "function" ? profLire("pdnFiches") || null : null }));
  }
  /* Annuler remet la valeur d'avant telle quelle, même hors des bornes du catalogue (0 = « non
     renseigné ») : les lignes sont faites ici, sans simDsPreparer, pour le même chemin d'écriture. */
  function remettreSim(jeton) {
    const lignes = jeton.valeurs.map((x, id) => ({ id, ok: true, genre: "champ", sim: x.sim, cle: x.cle, nouveau: x.valeur,
                                                  ana: (simDsGroupe(x.sim) || {}).ana || "" }));
    simDsAppliquer({ lignes, source: "annulation" }, lignes.map(l => l.id));
    const c = jeton.cotes;
    if (typeof SIM_PDN === "undefined") return;
    if (!!SIM_PDN.assistantActif !== c.assistant) simPDNBasculerAssistant(c.assistant);   // remet aussi le profil
    Object.assign(SIM_PDN, { deltaIManuel: c.manuel, deltaIA: c.deltaIA, evenements: c.evenements });
    if (jeton.fiche) {
      // la fiche d'avant (null si l'écriture l'a créée) et la section du profil telle qu'elle était
      SIM_PDN.fiche = c.fiche;
      if (typeof profEcrire === "function") profEcrire("pdnFiches", c.profilFiches || {});
    }
    if (c.xtTr !== null && typeof SIM_XT !== "undefined") SIM_XT.saisie.tr = c.xtTr;
    SIM_PDN.result = null;
    simCalculerPDN();
  }

  const SIMULATION = lot({
    titre: "Paramètres de simulation",
    verifier: verifierSim,
    muter: args => {
      const a = verifierSim(args).aEcrire, vides = a.filter(x => x.avant === null);
      const jeton = { valeurs: a.filter(x => x.avant !== null).map(x => ({ sim: x.sim, cle: x.cle, valeur: x.avant })),
                      cotes: cotesSim(), fiche: a.some(x => x.sim === "pdn_fiche") };
      let notes;
      // pas d'instantané d'éditeur à défaire ici : un échec en route remet tout à la main
      try { notes = ecrireSim(a.map(x => ({ sim: x.sim, cle: x.cle, valeur: x.valeur }))); }
      catch (e) { remettreSim(jeton); throw e; }
      if (vides.length) notes.push("Sans valeur d'avant, Annuler ne remettra pas : " + vides.map(x => x.sim + "." + x.cle).join(", ") + ".");
      if (a.some(x => x.sim === "pdn_fiche"))
        notes.push("La fiche de la charge est gardée dans ton profil (tous les projets qui ont ce composant) ; Annuler l'y remet.");
      return { jeton, notes };
    },
    rafraichir: () => {},
    // annuler n'a lieu que si aucun paramètre n'a rebougé depuis (pilote.js compare etat())
    etat: () => {
      const c = cotesSim();
      return [simDsGroupes().map(g => g.champs.map(ch => simDsLire(ch))), c.assistant, c.manuel, c.xtTr, c.fiche && c.fiche.suppose];
    },
    annuler: (args, jeton) => { simPrete(); remettreSim(jeton); },
  });

  return { lot, composantsSch: COMPOSANTS_SCH, composantsPcb: COMPOSANTS_PCB, pistes: PISTES, classes: CLASSES,
           contraintes: CONTRAINTES, simulation: SIMULATION, LOT_MAX };
})();
