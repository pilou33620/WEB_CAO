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
        // push() vide la pile de rétablissement ; la visionneuse (simulation seule) n'a pas de S
        const redo = !def.annuler && typeof S !== "undefined" && Array.isArray(S.redo) ? S.redo.slice() : null;
        if (!def.annuler) pousser();
        let r;
        try { r = def.muter(args) || {}; }
        catch (e) {
          // un lot à moitié appliqué serait pire qu'un refus : retour à l'instantané qu'on vient de pousser,
          // et la pile de rétablissement d'avant (undo y mettrait l'état à moitié fait)
          if (!def.annuler) { undo(); if (redo) S.redo.splice(0, S.redo.length, ...redo); }
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

  /* L'étape d'historique d'un lot de Claude : l'instantané porte une espace finale (JSON.parse
     l'ignore), à laquelle les éditeurs reconnaissent les lots qu'ils peuvent fondre entre eux
     quand la pile est pleine (histBorner), plutôt que de chasser les étapes de l'utilisateur. */
  function pousser() {
    if (typeof pushSnap === "function") pushSnap(serialize() + " ");   // PCB
    else push(serialize() + " ");                                       // schéma
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
    for (const d of neuves.slice(0, DRC_MAX)) lignes.push("- " + d.msg + " (x " + r3(d.x) + " y " + r3(d.y) + " mm)");
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
     Position dans le repère des lectures (cao_pcb_lire, liaisons, zone, routage) : c'est le seul
     que Claude voit, quelle que soit l'origine choisie dans le panneau. Face,
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
          const avant = k === "x" ? r3(fp.x) : k === "y" ? r3(fp.y) : angle(fp.rot || 0);
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
        if ("x" in ch) fp.x = r3(ch.x);
        if ("y" in ch) fp.y = r3(ch.y);
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

  /* Condensateurs et bornes DC ne sont pas des champs du catalogue : chacun vise des objets de la
     carte par « cible » ({refs | mpn | valeur, boitier?} ou {composant}). simDsPreparer les
     contrôle comme une proposition de datasheet ; `act` est l'entrée qu'il attend. */
  const HORS_CATALOGUE = {
    condensateurs: { cles: { esr_mohm: "mΩ", esl_nh: "nH", cap_nf: "nF" }, cible: "{refs: [repères]}, {mpn} ou {valeur, boitier?}" },
    bornes_dc: { cles: { courant_ma: "mA", tension_v: "V" }, cible: "{composant: repère}" },
  };
  function verifierHorsCatalogue(e, h, refus, vus, lignes, aEcrire) {
    const unite = h.cles[e.cle];
    if (!unite) return refus.push(e.groupe + " : paramètre « " + e.cle + " » inconnu (" + Object.keys(h.cles).join(", ") + ")");
    const c = e.cible;
    if (!c || typeof c !== "object" || Array.isArray(c)) return refus.push(e.groupe + "." + e.cle + " : « cible » attendue, " + h.cible);
    const quoi = e.groupe + "." + e.cle + " (" + (c.composant || (Array.isArray(c.refs) && c.refs.join(", ")) || c.mpn || c.valeur || "?") + ")";
    if (vus.has(quoi)) return refus.push(quoi + " : deux fois dans le lot");
    vus.add(quoi);
    if ((e.unite || "") !== unite) return refus.push(quoi + " : unité « " + (e.unite || "") + " », attendue « " + unite + " »");
    const act = e.groupe === "condensateurs" ? Object.assign({}, c, { [e.cle]: e.valeur }) : { composant: c.composant, [e.cle]: e.valeur };
    const l = simDsPreparer({ [e.groupe]: [act] }).lignes[0];
    if (!l || !l.ok) return refus.push(quoi + " : " + (l ? l.motif : "rien de visé"));
    if (l.actuel === l.nouveau) return;
    lignes.push({ quoi: quoi + " " + l.lib, avant: avecUnite(l.actuel, unite), apres: avecUnite(l.nouveau, unite) });
    aEcrire.push({ sim: e.groupe, act });
  }

  function verifierSim(args) {
    simPrete();
    const lignes = [], refus = [], vus = new Set(), aEcrire = [];
    for (const e of args.lot) {
      const h = e && Object.hasOwn(HORS_CATALOGUE, e.groupe) && HORS_CATALOGUE[e.groupe];
      if (h) { verifierHorsCatalogue(e, h, refus, vus, lignes, aEcrire); continue; }
      const g = e && typeof e.groupe === "string" ? simDsGroupe(e.groupe) : null;
      if (!g) { refus.push("groupe « " + (e && e.groupe) + " » inconnu (" + simDsGroupes().map(x => x.cle).concat(Object.keys(HORS_CATALOGUE)).join(", ") + ")"); continue; }
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

  function ecrireSim(a) {
    const prep = simDsPreparer({ valeurs: a.filter(x => !x.act).map(x => ({ sim: x.sim, cle: x.cle, valeur: x.valeur })),
                                 condensateurs: a.filter(x => x.sim === "condensateurs").map(x => x.act),
                                 bornes_dc: a.filter(x => x.sim === "bornes_dc").map(x => x.act) });
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
  /* Les parasites et les bornes, objet par objet (gardés par référence : Annuler n'a lieu que si
     etat() n'a pas bougé, donc ni nouvelle détection ni borne retirée entre-temps). */
  const PROPS_CAPA = ["esr", "esl", "cap", "prov", "f0"], PROPS_BORNE = ["valeur", "provenance", "unite"];
  const photo = (objs, props) => objs.map(o => ({ o, v: props.map(k => o[k]) }));
  function objetsSim() {
    return { capas: photo(SIM_PDN.condensateurs || [], PROPS_CAPA), bornes: photo(simDsBornes(), PROPS_BORNE),
             profilCapas: typeof profLire === "function" ? JSON.stringify(profLire("dsCapas") || {}) : null };
  }
  function remettreObjets(p) {
    for (const x of p.capas) PROPS_CAPA.forEach((k, i) => { x.o[k] = x.v[i]; });
    for (const x of p.bornes) PROPS_BORNE.forEach((k, i) => { x.o[k] = x.v[i]; });
    if (p.profilCapas !== null) profEcrire("dsCapas", JSON.parse(p.profilCapas));
  }
  /* Annuler remet la valeur d'avant telle quelle, même hors des bornes du catalogue (0 = « non
     renseigné ») : les lignes sont faites ici, sans simDsPreparer, pour le même chemin d'écriture. */
  function remettreSim(jeton) {
    if (jeton.objets) remettreObjets(jeton.objets);
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
      const a = verifierSim(args).aEcrire, vides = a.filter(x => !x.act && x.avant === null);
      const jeton = { valeurs: a.filter(x => !x.act && x.avant !== null).map(x => ({ sim: x.sim, cle: x.cle, valeur: x.avant })),
                      cotes: cotesSim(), fiche: a.some(x => x.sim === "pdn_fiche"), objets: a.some(x => x.act) ? objetsSim() : null };
      let notes;
      // pas d'instantané d'éditeur à défaire ici : un échec en route remet tout à la main
      try { notes = ecrireSim(a); }
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
      const o = objetsSim();
      return [simDsGroupes().map(g => g.champs.map(ch => simDsLire(ch))), c.assistant, c.manuel, c.xtTr, c.fiche && c.fiche.suppose,
              o.capas.map(x => x.v), o.bornes.map(x => x.v)];
    },
    annuler: (args, jeton) => { simPrete(); remettreSim(jeton); },
  });

  /* ---------- géométrie de la carte (contour, zones, sérigraphie, pastilles) ----------
     Positions en mm, dans le repère des lectures, comme les composants. Rien n'est écrit
     dans S hors de muter : chaque lot est une étape d'historique, Ctrl+Z le défait. */
  const COORD_MAX = 1000;
  const nombre = (v, min, max) => typeof v === "number" && Number.isFinite(v) && v >= min && v <= max;
  const coord = v => nombre(v, -COORD_MAX, COORD_MAX);
  /* Un polygone : 3 à 1000 sommets {x, y}, une surface, des côtés qui ne se coupent pas. */
  function polygone(P, quoi, refus) {
    if (!Array.isArray(P) || P.length < 3 || P.length > 1000 || !P.every(p => p && coord(p.x) && coord(p.y))) {
      refus.push(quoi + " : « points », 3 à 1000 sommets {x, y} en mm (±" + COORD_MAX + ")"); return null;
    }
    const Q = P.map(p => ({ x: r3(p.x), y: r3(p.y) }));
    if (Math.abs(signedArea(Q)) < 0.01) { refus.push(quoi + " : polygone sans surface"); return null; }
    const n = Q.length, cote = i => ({ x1: Q[i].x, y1: Q[i].y, x2: Q[(i + 1) % n].x, y2: Q[(i + 1) % n].y });
    for (let i = 0; i < n; i++)
      for (let j = i + 2; j < n; j++) {
        if (i === 0 && j === n - 1) continue;              // côtés voisins par le premier sommet
        if (segCross(cote(i), cote(j))) { refus.push(quoi + " : les côtés " + (i + 1) + " et " + (j + 1) + " se coupent"); return null; }
      }
    return Q;
  }
  const rectPts = (x, y, w, h) => [{ x: r3(x), y: r3(y) }, { x: r3(x + w), y: r3(y) }, { x: r3(x + w), y: r3(y + h) }, { x: r3(x), y: r3(y + h) }];
  /* Une forme {forme: rectangle {x, y, largeur, hauteur} | disque {x, y, rayon} (x, y : centre)
     | polygone {points}} → ses sommets, ou null avec le refus. */
  function forme(e, quoi, refus, tailleMin) {
    if (e.forme === "rectangle") {
      if (!coord(e.x) || !coord(e.y) || !nombre(e.largeur, tailleMin, 2 * COORD_MAX) || !nombre(e.hauteur, tailleMin, 2 * COORD_MAX)) {
        refus.push(quoi + " : rectangle {x, y (coin), largeur, hauteur} en mm, côtés de " + tailleMin + " mm au moins"); return null;
      }
      return { pts: rectPts(e.x, e.y, e.largeur, e.hauteur), dit: "rectangle " + r3(e.largeur) + " × " + r3(e.hauteur) + " mm en (" + r3(e.x) + ", " + r3(e.y) + ")" };
    }
    if (e.forme === "disque") {
      if (!coord(e.x) || !coord(e.y) || !nombre(e.rayon, tailleMin / 2, COORD_MAX)) {
        refus.push(quoi + " : disque {x, y (centre), rayon} en mm, rayon de " + tailleMin / 2 + " mm au moins"); return null;
      }
      return { pts: boardDisquePts(e.x, e.y, e.rayon), disque: true, dit: "disque Ø " + r3(2 * e.rayon) + " mm centré en (" + r3(e.x) + ", " + r3(e.y) + ")" };
    }
    if (e.forme === "polygone") {
      const P = polygone(e.points, quoi, refus);
      return P && { pts: P, dit: "polygone de " + P.length + " sommets" };
    }
    refus.push(quoi + " : « forme » rectangle, disque ou polygone"); return null;
  }
  function decrireContour() {
    const b = S.board;
    if (!(b.pts && b.pts.length >= 3)) return "rectangle " + r3(b.w) + " × " + r3(b.h) + " mm en (" + r3(b.x) + ", " + r3(b.y) + ")";
    const segs = typeof dxfSegments === "function" ? dxfSegments(b.pts) : [];
    const rond = segs.length === 2 && segs.every(x => x.t === "a");
    return (rond ? "disque Ø " + r3(2 * segs[0].r) + " mm" : "polygone de " + b.pts.length + " sommets") + ", " + r3(b.w) + " × " + r3(b.h) + " mm";
  }

  /* cao_contour_ecrire : le contour extérieur, un seul élément. Les découpes restent. */
  function verifierContour(args) {
    const lignes = [], refus = [];
    if (args.lot.length !== 1) return { lignes, refus: ["un seul contour par carte : un lot d'un élément"] };
    const f = forme(args.lot[0] || {}, "contour", refus, 5);
    if (f) lignes.push({ quoi: "contour de carte", avant: decrireContour(), apres: f.dit });
    return { lignes, refus };
  }
  function muterContour(args) {
    const e = args.lot[0], f = forme(e, "contour", [], 5);
    // les empreintes qui attendaient à côté de l'ancien contour viennent à côté du nouveau
    const ranges = contourChanger(() => {
      if (e.forme === "rectangle") Object.assign(S.board, { pts: null, x: r3(e.x), y: r3(e.y), w: r3(e.largeur), h: r3(e.hauteur) });
      else S.board.pts = f.pts;
      boardChanged();
    });
    const notes = ranges ? [ranges + " empreinte(s) en attente rangée(s) à côté du nouveau contour."] : [];
    const dehors = S.fps.filter(fp => !inBoard(fp.x, fp.y, 0)).map(fp => fp.ref);
    if (dehors.length) notes.push("Hors du nouveau contour : " + dehors.slice(0, 30).join(", ") + (dehors.length > 30 ? "…" : "") + ".");
    return { notes };
  }
  const CONTOUR = lot({ titre: "Contour de carte", max: 1, verifier: verifierContour, muter: muterContour, rafraichir: rafraichirRegles, drc: true });

  /* cao_decoupes_ecrire : les fenêtres fraisées dans la carte (S.board.cutouts), dans l'ordre :
     creer {forme…} (dans le contour, comme au tracé : closeDecoupe), supprimer {numero} (1 = la
     première, cao_pcb_lire carte). Les numéros sont ceux d'avant le lot. */
  const decrireDecoupe = P => { const b = polyBBox(P); return P.length + " sommets de (" + r3(b.x1) + ", " + r3(b.y1) + ") à (" + r3(b.x2) + ", " + r3(b.y2) + ")"; };
  function planDecoupes(args, refus) {
    const avant = boardCutouts(), suppr = new Set(), neuves = [];
    args.lot.forEach((e, k) => {
      const quoi = "découpe, élément " + (k + 1);
      if (!e || typeof e !== "object") { refus.push(quoi + " : un objet"); return; }
      if (e.action === "supprimer") {
        if (!Number.isInteger(e.numero) || !avant[e.numero - 1]) { refus.push(quoi + " : « numero » de 1 à " + avant.length + " (cao_pcb_lire carte)"); return; }
        if (suppr.has(e.numero)) { refus.push(quoi + " : découpe " + e.numero + " deux fois"); return; }
        suppr.add(e.numero); return;
      }
      if (e.action !== "creer") { refus.push(quoi + " : « action » creer ou supprimer"); return; }
      const f = forme(e, quoi, refus, 0.5);
      if (!f) return;
      const B = boardPoly();
      if (f.pts.some(p => !inPoly(p.x, p.y, B) && polyEdgeDist(p.x, p.y, B) > 1e-3)) { refus.push(quoi + " : elle sort du contour de carte"); return; }
      neuves.push(f);
    });
    return { avant, suppr, neuves };
  }
  function verifierDecoupes(args) {
    const refus = [], p = planDecoupes(args, refus), lignes = [];
    for (const n of [...p.suppr].sort((a, b) => a - b)) lignes.push({ quoi: "découpe " + n, avant: decrireDecoupe(p.avant[n - 1]), apres: "supprimée" });
    p.neuves.forEach((f, k) => lignes.push({ quoi: "découpe nouvelle " + (k + 1), avant: "", apres: f.dit }));
    return { lignes, refus };
  }
  function muterDecoupes(args) {
    const p = planDecoupes(args, []);
    S.board.cutouts = p.avant.filter((_, i) => !p.suppr.has(i + 1)).concat(p.neuves.map(f => f.pts));
    if (!S.board.cutouts.length) delete S.board.cutouts;
    boardChanged();
  }
  const DECOUPES = lot({ titre: "Découpes de carte", verifier: verifierDecoupes, muter: muterDecoupes, rafraichir: rafraichirRegles, drc: true });

  /* cao_zones_ecrire : créer, modifier, supprimer des zones de cuivre, dans l'ordre du lot.
     forme « carte » : la carte entière (le remplissage s'arrête à la marge de bord). */
  const LIAISONS = { thermique: "bras thermiques", directe: "directe", "cms-directe": "directe pour les CMS", aucune: "aucune" };
  const decrireZone = z => {
    const b = polyBBox(z.pts);
    return "net " + (z.net || "(aucun)") + " sur " + LECTURE_CAO.aides.nomCouchePcb(z.l) + ", " + z.pts.length +
           " sommets de (" + r3(b.x1) + ", " + r3(b.y1) + ") à (" + r3(b.x2) + ", " + r3(b.y2) + "), liaison " + LIAISONS[z.connexion || "thermique"];
  };
  // ce qui change vraiment une zone : la description n'y suffit pas (même emprise, autre forme)
  const etatZone = z => JSON.stringify([z.l, z.net || "", z.pts, z.connexion || "thermique"]);
  function planZones(args, refus) {
    const zones = S.zones.map(z => Object.assign({}, z)), plan = [], nets = new Set(netTable().map(n => n.name));
    let neuf = 0;
    args.lot.forEach((e, k) => {
      const quoi = "zone, élément " + (k + 1);
      if (!e || typeof e !== "object") { refus.push(quoi + " : un objet"); return; }
      const z0 = e.action === "creer" ? { id: "nouvelle " + (++neuf), l: 0, net: "", pts: null }
                                      : zones.find(z => z.id === e.id);
      if (!["creer", "modifier", "supprimer"].includes(e.action)) { refus.push(quoi + " : « action » creer, modifier ou supprimer"); return; }
      if (!z0) { refus.push(quoi + " : zone « " + e.id + " » introuvable (voir cao_pcb_lire zones)"); return; }
      if (e.action === "supprimer") { zones.splice(zones.indexOf(z0), 1); plan.push({ e, z: z0, avant: decrireZone(z0), apres: "supprimée" }); return; }
      const z = Object.assign({}, z0), avant = z0.pts ? decrireZone(z0) : "";
      if (e.couche != null) { const l = coucheIndex(e.couche); if (l < 0) { refus.push(quoi + " : couche « " + e.couche + " » inconnue"); return; } z.l = l; }
      if (e.net != null) { if (typeof e.net !== "string" || (e.net && !nets.has(e.net))) { refus.push(quoi + " : net « " + e.net + " » inconnu (voir cao_pcb_lire nets ; vide = cuivre isolé)"); return; } z.net = e.net; }
      if (e.liaison != null) { if (!LIAISONS[e.liaison]) { refus.push(quoi + " : « liaison » thermique, directe, cms-directe ou aucune"); return; } z.connexion = e.liaison; }
      if (e.forme != null) {
        if (e.forme === "carte") z.pts = boardZonePts();
        else { const f = forme(e, quoi, refus, 0.1); if (!f) return; z.pts = f.pts; }
      }
      if (!z.pts) { refus.push(quoi + " : « forme » carte, rectangle, disque ou polygone"); return; }
      if (e.action === "creer" && e.couche == null) { refus.push(quoi + " : « couche » manquante"); return; }
      if (e.action === "creer") zones.push(z); else zones[zones.indexOf(z0)] = z;
      plan.push({ e, z, z0, avant, apres: decrireZone(z) });
    });
    return plan;
  }
  function verifierZones(args) {
    const refus = [], plan = planZones(args, refus);
    return { refus, lignes: plan.filter(p => p.e.action !== "modifier" || etatZone(p.z0) !== etatZone(p.z))
                                .map(p => ({ quoi: "zone " + p.z.id, avant: p.avant, apres: p.apres })) };
  }
  function muterZones(args) {
    const plan = planZones(args, []), cree = new Map();
    for (const { e, z } of plan) {
      const vraie = typeof z.id === "number" ? S.zones.find(o => o.id === z.id) : null;
      if (e.action === "supprimer") { detachAuto(vraie); S.zones = S.zones.filter(o => o !== vraie); continue; }
      if (e.action === "creer") {
        const n = { id: S.nextId++, l: z.l, net: z.net || "", pts: z.pts };
        if (z.connexion && z.connexion !== "thermique") n.connexion = z.connexion;
        S.zones.push(n); cree.set(z.id, n.id); continue;
      }
      if (e.forme != null || e.couche != null) detachAuto(vraie);      // un plan de couche déformé devient une zone libre
      vraie.l = z.l; vraie.net = z.net; vraie.pts = z.pts;
      if (vraie.auto && S.cuL[vraie.l]) S.cuL[vraie.l].net = vraie.net;
      if (z.connexion && z.connexion !== "thermique") vraie.connexion = z.connexion; else delete vraie.connexion;
    }
    clearSel();
    return { notes: cree.size ? ["Zones créées : " + [...cree.values()].join(", ") + " (leurs id)."] : [] };
  }
  function rafraichirZones() { touch(); zoneCache.clear(); buildLayers(); buildTabs(); refreshPanels(); draw(); }
  const ZONES = lot({ titre: "Zones de cuivre", verifier: verifierZones, muter: muterZones, rafraichir: rafraichirZones, drc: true });

  /* cao_serigraphie_ecrire : textes, traits, rectangles (S.drawings, couches silkT / silkB),
     décalage du repère d'un composant, sérigraphie automatique, suppression d'un dessin. */
  const COUCHES_SILK = { dessus: "silkT", dessous: "silkB" };
  function planSilk(args, refus) {
    const plan = [], vus = new Set();
    args.lot.forEach((e, k) => {
      const quoi = "sérigraphie, élément " + (k + 1);
      if (!e || typeof e !== "object") { refus.push(quoi + " : un objet"); return; }
      if (e.action === "repere" || e.action === "auto") {
        const fp = empreinte(e.ref);
        if (!fp) { refus.push(quoi + " : repère « " + e.ref + " » introuvable"); return; }
        if (vus.has(fp.ref + e.action)) { refus.push(quoi + " : " + fp.ref + " deux fois"); return; }
        vus.add(fp.ref + e.action);
        if (e.action === "auto") {
          if (typeof e.actif !== "boolean") { refus.push(quoi + " : « actif » true ou false"); return; }
          if (e.actif !== (fp.silk !== false)) plan.push({ e, fp, quoi: fp.ref + " sérigraphie automatique", avant: fp.silk !== false, apres: e.actif });
          return;
        }
        if (!nombre(e.dx, -50, 50) || !nombre(e.dy, -50, 50)) { refus.push(quoi + " : « dx », « dy » en mm (±50), décalage depuis la place d'office"); return; }
        const av = r3(fp.refOffX || 0) + ", " + r3(fp.refOffY || 0), ap = r3(e.dx) + ", " + r3(e.dy);
        if (av !== ap) plan.push({ e, fp, quoi: fp.ref + " décalage du repère", avant: av, apres: ap });
        return;
      }
      if (e.action === "supprimer") {
        const d = (S.drawings || []).find(x => x.id === e.id);
        if (!d) { refus.push(quoi + " : dessin « " + e.id + " » introuvable (voir cao_pcb_lire serigraphie)"); return; }
        plan.push({ e, d, quoi: "dessin " + d.id, avant: d.shape + (d.text ? " « " + d.text + " »" : ""), apres: "supprimé" });
        return;
      }
      if (!["texte", "trait", "rectangle"].includes(e.action)) { refus.push(quoi + " : « action » texte, trait, rectangle, repere, auto ou supprimer"); return; }
      if (!COUCHES_SILK[e.face]) { refus.push(quoi + " : « face » dessus ou dessous"); return; }
      if (e.largeur != null && !nombre(e.largeur, 0.05, 5)) { refus.push(quoi + " : « largeur » du trait de 0,05 à 5 mm"); return; }
      let brut;
      if (e.action === "texte") {
        if (texte(e.texte, quoi + " texte", refus) === null) return;
        if (!e.texte.trim()) { refus.push(quoi + " : « texte » vide"); return; }
        if (!coord(e.x) || !coord(e.y)) { refus.push(quoi + " : « x », « y » en mm (centre du texte)"); return; }
        if (e.hauteur != null && !nombre(e.hauteur, 0.5, 25)) { refus.push(quoi + " : « hauteur » de 0,5 à 25 mm"); return; }
        if (e.rotation != null && !nombre(e.rotation, -360, 360)) { refus.push(quoi + " : « rotation » en degrés"); return; }
        brut = { shape: "text", text: e.texte, x1: e.x, y1: e.y, size: e.hauteur || 1, rot: e.rotation || 0 };
      } else {
        if (![e.x1, e.y1, e.x2, e.y2].every(coord)) { refus.push(quoi + " : « x1 », « y1 », « x2 », « y2 » en mm"); return; }
        if (Math.hypot(e.x2 - e.x1, e.y2 - e.y1) < 0.01 || (e.action === "rectangle" && (Math.abs(e.x2 - e.x1) < 0.01 || Math.abs(e.y2 - e.y1) < 0.01))) {
          refus.push(quoi + " : trop petit"); return;
        }
        brut = { shape: e.action === "trait" ? "line" : "rect", x1: e.x1, y1: e.y1, x2: e.x2, y2: e.y2 };
      }
      const d = normDrawingPcb(Object.assign(brut, { layer: COUCHES_SILK[e.face], width: e.largeur || 0.15 }), 0);
      plan.push({ e, d, quoi: e.action + " (" + e.face + ")", avant: "", apres: e.action === "texte" ? "« " + d.text + " » en (" + r3(d.x1) + ", " + r3(d.y1) + "), " + d.size + " mm"
                                                                                     : "(" + r3(d.x1) + ", " + r3(d.y1) + ") → (" + r3(d.x2) + ", " + r3(d.y2) + ")" });
    });
    return plan;
  }
  function verifierSilk(args) {
    const refus = [], plan = planSilk(args, refus);
    return { refus, lignes: plan.map(p => ({ quoi: p.quoi, avant: p.avant, apres: p.apres })) };
  }
  function muterSilk(args) {
    const ids = [];
    if (!Array.isArray(S.drawings)) S.drawings = [];
    for (const p of planSilk(args, [])) {
      const e = p.e;
      if (e.action === "auto") { if (e.actif) delete p.fp.silk; else p.fp.silk = false; }
      else if (e.action === "repere") {
        for (const [k, v] of [["refOffX", e.dx], ["refOffY", e.dy]]) { if (r3(v)) p.fp[k] = r3(v); else delete p.fp[k]; }
      } else if (e.action === "supprimer") S.drawings = S.drawings.filter(x => x !== p.d);
      else { p.d.id = S.nextId++; S.drawings.push(p.d); ids.push(p.d.id); }
    }
    return { notes: ids.length ? ["Dessins posés : " + ids.join(", ") + " (leurs id)."] : [] };
  }
  const SERIGRAPHIE = lot({ titre: "Sérigraphie", verifier: verifierSilk, muter: muterSilk, rafraichir: rafraichirPcb });

  /* cao_pastille_regler : liaison à la zone, bras thermiques, masque et pâte d'une pastille
     « REF.n » (toutes celles de ce numéro). null rend la règle de la carte. Une empreinte
     calculée est figée en pastilles explicites (fpFreeze), comme au panneau. */
  const REGLAGES = {
    liaison: { cle: "connexion", ok: v => ["zone", "thermique", "directe", "aucune"].includes(v), attendu: "zone, thermique, directe ou aucune", val: v => v === "zone" ? null : v },
    bras_largeur: { cle: "thermalWidth", ok: v => nombre(v, 0.05, 10), attendu: "de 0,05 à 10 mm" },
    bras_nombre: { cle: "thermalSpokes", ok: v => Number.isInteger(v) && v >= 1 && v <= 8, attendu: "entier de 1 à 8" },
    bras_angle: { cle: "thermalAngle", ok: v => nombre(v, -360, 360), attendu: "degrés", val: v => padRot(v) },
    masque: { cle: "mask", ok: v => nombre(v, -5, 5), attendu: "ouverture du masque en mm, de -5 à 5" },
    pate: { cle: "paste", ok: v => nombre(v, -5, 5), attendu: "retrait de la pâte en mm, de -5 à 5" },
  };
  function cibles(nom) {
    const m = typeof nom === "string" && nom.match(/^\s*([^.\s]+)\.(\S+)\s*$/), fp = m && empreinte(m[1]);
    if (!fp) return null;
    const idx = padsOf(fp).map((q, i) => String(q.n).toUpperCase() === m[2].toUpperCase() || String(q.nom || "").toUpperCase() === m[2].toUpperCase() ? i : -1).filter(i => i >= 0);
    return idx.length ? { fp, idx, nom: fp.ref + "." + m[2] } : null;
  }
  function verifierPastilles(args) {
    const lignes = [], refus = [], vus = new Set();
    for (const e of args.lot) {
      const c = e && cibles(e.pastille);
      if (!c) { refus.push("pastille « " + (e && e.pastille) + " » introuvable : « REF.numéro » (voir cao_pcb_lire composant)"); continue; }
      if (vus.has(c.nom)) { refus.push(c.nom + " : deux fois dans le lot"); continue; }
      vus.add(c.nom);
      const cles = Object.keys(e).filter(k => k !== "pastille");
      if (!cles.length) { refus.push(c.nom + " : rien à régler (" + Object.keys(REGLAGES).join(", ") + ")"); continue; }
      const q = padsOf(c.fp)[c.idx[0]];
      for (const k of cles) {
        const R = REGLAGES[k];
        if (!R) { refus.push(c.nom + " : « " + k + " » inconnu (" + Object.keys(REGLAGES).join(", ") + ")"); continue; }
        if (e[k] !== null && !R.ok(e[k])) { refus.push(c.nom + "." + k + " : " + R.attendu + ", ou null"); continue; }
        const apres = e[k] === null ? null : (R.val ? R.val(e[k]) : e[k]), avant = q[R.cle] == null ? null : q[R.cle];
        if (avant !== apres) lignes.push({ quoi: c.nom + " " + k, avant: avant == null ? "règle de la carte" : avant, apres: apres == null ? "règle de la carte" : apres });
      }
    }
    return { lignes, refus };
  }
  function muterPastilles(args) {
    for (const e of args.lot) {
      const c = cibles(e.pastille);
      fpFreeze(c.fp);
      for (const i of c.idx)
        for (const [k, R] of Object.entries(REGLAGES)) {
          if (!(k in e)) continue;
          const v = e[k] === null ? null : (R.val ? R.val(e[k]) : e[k]);
          if (v === null) delete c.fp.pads[i][R.cle]; else fpSetPad(c.fp, i, R.cle, v);
        }
    }
  }
  const PASTILLES = lot({ titre: "Réglages de pastilles", verifier: verifierPastilles, muter: muterPastilles, rafraichir: rafraichirZones, drc: true });

  return { lot, composantsSch: COMPOSANTS_SCH, composantsPcb: COMPOSANTS_PCB, pistes: PISTES, classes: CLASSES,
           contraintes: CONTRAINTES, simulation: SIMULATION, contour: CONTOUR, decoupes: DECOUPES, zones: ZONES, serigraphie: SERIGRAPHIE,
           pastilles: PASTILLES, LOT_MAX, pousser,
           drc: { erreurs: erreursDrc, bilan: bilanDrc } };        // repris par le routage (37-routage-pilote.js)
})();
