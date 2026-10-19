/* =============================================================================
   commun/lecture-cao.js
   Les lectures des pages WEB_CAO : éditeur PCB (S), visionneuse IPC-2581 (V),
   simulations (SIM). Chaque outil rend des lignes de texte, faites pour être
   lues par un modèle : le canal de pilotage (commun/pilote-cao.js, outils MCP de
   web_suite) les sert à Claude. Elles viennent de l'ancien assistant IA intégré,
   retiré depuis. Chargé avant le canal.
   Les fonctions lisent S, V et SIM au moment de l'appel, sans rien modifier.
   ============================================================================= */
"use strict";

/* Dans une IIFE : contient, borner, mm… sont des noms trop courants pour être
   posés en globaux à côté des scripts des pages. Seul LECTURE_CAO sort. */
const LECTURE_CAO = (function() {
  // ponytail: filtre = sous-chaîne sans casse, pas de regex ; suffit pour « USB », « U1 », « 0402 »
  function contient(filtre, ...champs) {
    if (!filtre) return true;
    const f = String(filtre).toLowerCase();
    return champs.some(c => String(c == null ? "" : c).toLowerCase().includes(f));
  }

  function borner(lignes, max, quoi) {
    return lignes.length <= max ? lignes
      : lignes.slice(0, max).concat("... (" + (lignes.length - max) + " " + quoi + " de plus : précise le filtre)");
  }

  const mm = x => Math.round(x * 1000) / 1000;

  /* ---------- Éditeur PCB (S, 01-core.js) ---------- */
  const nomCouchePcb = i => ((S.cuL && S.cuL[i]) || {}).name || ("couche " + i);

  const OUTILS_PCB = {
    empilage: {
      desc: "couches cuivre et diélectriques du dessus vers le dessous (épaisseur, εr, tan δ, plans), finition",
      fn: () => {
        const L = ["Empilage : " + S.cu + " couche(s) cuivre, " + stackTotal() + " mm au total" +
                   (S.stack && S.stack.finish ? (", finition " + S.stack.finish) : "") + " :"];
        for (let i = 0; i < S.cu; i++) {
          const c = (S.cuL && S.cuL[i]) || {};
          L.push("- " + nomCouchePcb(i) + " : cuivre " + Math.round(cuT(i) * 1000) + " µm" + (c.plane ? (", plan" + (c.net ? (" " + c.net) : "")) : ""));
          if (i < S.cu - 1) {
            const d = diAt(i);
            L.push("- " + d.k + " " + d.mat + " : " + d.t + " mm, εr " + d.er + ", tan δ " + d.df);
          }
        }
        return L;
      }
    },
    classes: {
      desc: "classes de nets et leurs règles, règles de conception de la carte, paires différentielles",
      fn: () => {
        const L = ["Classes de nets :"].concat(S.classes.map(c =>
          "- " + c.name + " : piste " + c.w + " mm, isolement " + c.clr + " mm, via " + c.via + " / perçage " + c.drill + " mm"));
        const R = S.rule || {};
        L.push("Règles : bord de carte " + R.edge + " mm, perçage mini " + R.hole + " mm, masque " + R.mask + " mm, angle " + R.corner + ", profil fabricant " + R.mfgProfile + ".");
        if ((S.dpPairs || []).length) L.push("Paires différentielles : " + S.dpPairs.map(p => p.name + " (" + p.p + " / " + p.n + ")").join(", ") + ".");
        return L;
      }
    },
    composants: {
      args: '"filtre":"U"',
      desc: "liste des composants (repère, valeur, boîtier, face, position) ; filtre facultatif sur repère, valeur ou boîtier",
      fn: a => {
        const L = S.fps.filter(f => contient(a.filtre, f.ref, f.value, f.pkg)).map(f =>
          "- " + f.ref + (f.value ? (" = " + f.value) : "") + (f.pkg ? (" (" + f.pkg + ")") : "") +
          ", " + (f.side ? "dessous" : "dessus") + ", x " + mm(f.x) + " y " + mm(f.y) + " mm, rotation " + (f.rot || 0) + "°");
        return L.length ? borner(L, 150, "composants") : ["Aucun composant ne correspond."];
      }
    },
    composant: {
      args: '"ref":"U1"',
      desc: "un composant : valeur, boîtier, position, et le net de chaque broche",
      fn: a => {
        const f = S.fps.find(x => String(x.ref).toLowerCase() === String(a.ref || "").toLowerCase());
        if (!f) return ["Composant « " + a.ref + " » introuvable : demande la liste avec l'outil « composants »."];
        const L = [f.ref + (f.value ? (" = " + f.value) : "") + (f.pkg ? (" (" + f.pkg + ")") : "") + ", face " + (f.side ? "dessous" : "dessus") +
                   ", x " + mm(f.x) + " y " + mm(f.y) + " mm, rotation " + (f.rot || 0) + "°."];
        const pads = padsOf(f);
        L.push("Broches (" + pads.length + ") :");
        return L.concat(borner(pads.map(q => "- " + q.n + " → " + (q.net || "non connectée")), 200, "broches"));
      }
    },
    nets: {
      args: '"filtre":"USB","a_router":true',
      desc: "liste des nets (classe, nombre de broches, état du routage) ; filtre et a_router facultatifs",
      fn: a => {
        const cx = conn();
        const L = [];
        for (const n of netTable()) {
          const info = cx.nets.get(n.name);
          const miss = info ? info.miss : 0;
          if (!contient(a.filtre, n.name) || (a.a_router && !miss)) continue;
          L.push("- " + n.name + " [" + classOf(n.name).name + "] : " + n.nodes.length + " broches, " + (miss ? (miss + " liaison(s) à router") : "routé"));
        }
        return L.length ? borner(L, 150, "nets") : ["Aucun net ne correspond."];
      }
    },
    net: {
      args: '"nom":"USB_DP"',
      desc: "un net : classe et règles, broches reliées, longueur et largeurs de piste par couche, vias, zones, paire",
      fn: a => {
        const nom = String(a.nom || "").toLowerCase();
        const row = netTable().find(n => String(n.name).toLowerCase() === nom);
        if (!row) return ["Net « " + a.nom + " » introuvable : demande la liste avec l'outil « nets »."];
        const cl = classOf(row.name), info = conn().nets.get(row.name);
        const L = ["Net " + row.name + ", classe " + cl.name + " : piste " + cl.w + " mm, isolement " + cl.clr + " mm, via " + cl.via + " / " + cl.drill + " mm.",
                   "État : " + (info && info.miss ? (info.miss + " liaison(s) à router") : "routé") + ".",
                   "Broches (" + row.nodes.length + ") : " + row.nodes.slice(0, 200).map(n => n.ref + "." + n.pin).join(", ") + (row.nodes.length > 200 ? " …" : "")];
        const parCouche = new Map();
        for (const t of S.tracks) {
          if (t.net !== row.name) continue;
          const e = parCouche.get(t.l) || { mm: 0, n: 0, w: new Set() };
          e.mm += Math.hypot(t.x2 - t.x1, t.y2 - t.y1); e.n++; e.w.add(t.w);
          parCouche.set(t.l, e);
        }
        let total = 0;
        for (const [l, e] of parCouche) {
          total += e.mm;
          L.push("Pistes sur " + nomCouchePcb(l) + " : " + mm(e.mm) + " mm en " + e.n + " segment(s), largeur(s) " + [...e.w].join(" / ") + " mm.");
        }
        L.push("Longueur de piste totale : " + mm(total) + " mm. Vias : " + S.vias.filter(v => v.net === row.name).length + ".");
        const zones = S.zones.filter(z => z.net === row.name).map(z => nomCouchePcb(z.l));
        if (zones.length) L.push("Zones de cuivre sur : " + zones.join(", ") + ".");
        const paires = (S.dpPairs || []).filter(p => p.p === row.name || p.n === row.name);
        if (paires.length) L.push("Paire différentielle : " + paires.map(p => p.name + " (" + p.p + " / " + p.n + ")").join(", ") + ".");
        return L;
      }
    },
    drc: {
      desc: "les erreurs puis les remarques du dernier DRC, avec leur position",
      fn: () => {
        if (!S.drcRun) return ["Le DRC n'a pas encore été lancé : propose à l'utilisateur de le lancer."];
        const tri = S.drc.filter(d => !d.info).concat(S.drc.filter(d => d.info));
        return tri.length ? borner(tri.map(d => "- " + (d.info ? "[remarque] " : "[erreur] ") + d.msg + " (x " + mm(d.x) + ", y " + mm(d.y) + ")"), 80, "lignes")
                          : ["DRC propre : aucune erreur."];
      }
    },
    /* Pour router (web_suite, module routage) : les liaisons qui restent et ce qu'il y a dans une
       fenêtre de la carte. Positions en mm, dans le même repère que les autres lectures. */
    liaisons: {
      args: '"filtre":"GND"',
      desc: "liaisons qui restent à router : net, classe, de REF.pastille à REF.pastille avec positions et couches ; filtre facultatif sur le net",
      fn: a => {
        const c = conn(true), parPos = new Map(c.padNodes.map(q => [q.q.x + "," + q.q.y + "," + q.q.net, q]));
        const bout = (x, y, net) => {
          const p = parPos.get(x + "," + y + "," + net);
          return p ? p.fp.ref + "." + p.q.n + " (x " + mm(x) + " y " + mm(y) + ", " + p.layers.map(nomCouchePcb).join("/") + ")"
                   : "(x " + mm(x) + " y " + mm(y) + ")";
        };
        const L = c.rats.filter(r => contient(a.filtre, r.net)).map(r =>
          "- " + r.net + " [" + classOf(r.net).name + "] : " + bout(r.x1, r.y1, r.net) + " → " + bout(r.x2, r.y2, r.net) +
          ", " + mm(Math.hypot(r.x2 - r.x1, r.y2 - r.y1)) + " mm à vol d'oiseau");
        return L.length ? borner(L, 150, "liaisons") : [a.filtre ? "Aucune liaison à router sur ce filtre." : "Tout est routé."];
      }
    },
    zone: {
      args: '"x1":10,"y1":10,"x2":30,"y2":25',
      desc: "ce qu'il y a dans une fenêtre de la carte (mm) : pastilles, pistes, vias, zones de cuivre, contour (pistes et zones par leur boîte englobante : approximatif)",
      fn: a => {
        const v = ["x1", "y1", "x2", "y2"].map(k => +a[k]);
        if (!v.every(Number.isFinite)) return ["Donne la fenêtre en mm : x1, y1, x2, y2."];
        const X1 = Math.min(v[0], v[2]), X2 = Math.max(v[0], v[2]), Y1 = Math.min(v[1], v[3]), Y2 = Math.max(v[1], v[3]);
        if (X2 - X1 <= 0 || Y2 - Y1 <= 0) return ["Fenêtre vide : x1 ≠ x2 et y1 ≠ y2."];
        const dans = (x, y) => x >= X1 && x <= X2 && y >= Y1 && y <= Y2;
        const boite = (ax, ay, bx, by) => Math.max(ax, bx) >= X1 && Math.min(ax, bx) <= X2 && Math.max(ay, by) >= Y1 && Math.min(ay, by) <= Y2;
        const L = [];
        for (const f of S.fps) for (const q of padsWorld(f)) if (dans(q.x, q.y))
          L.push("- pastille " + f.ref + "." + q.n + " [" + (q.net || "sans net") + "] x " + mm(q.x) + " y " + mm(q.y) + ", " +
                 mm(q.w) + " × " + mm(q.h) + " mm" + (q.drill ? ", perçage " + mm(q.drill) : "") + ", " + padCuLayers(f, q).map(nomCouchePcb).join("/"));
        for (const t of S.tracks) if (boite(t.x1, t.y1, t.x2, t.y2))
          L.push("- piste [" + (t.net || "sans net") + "] " + nomCouchePcb(t.l) + " : x " + mm(t.x1) + " y " + mm(t.y1) + " → x " + mm(t.x2) + " y " + mm(t.y2) + ", largeur " + mm(t.w));
        for (const w of S.vias) if (dans(w.x, w.y))
          L.push("- via [" + (w.net || "sans net") + "] x " + mm(w.x) + " y " + mm(w.y) + ", ø " + mm(w.d) + " / " + mm(w.drill) + ", " + nomCouchePcb(w.a) + " à " + nomCouchePcb(w.b));
        for (const z of S.zones || []) {
          // une boucle, pas Math.min(...xs) : une zone importée peut avoir des centaines de milliers de points
          let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
          for (const q of z.pts || []) { x1 = Math.min(x1, q.x); y1 = Math.min(y1, q.y); x2 = Math.max(x2, q.x); y2 = Math.max(y2, q.y); }
          if (x1 !== Infinity && boite(x1, y1, x2, y2))
            L.push("- zone de cuivre [" + (z.net || "sans net") + "] " + nomCouchePcb(z.l));
        }
        const b = S.board || {}, coins = b.pts && b.pts.length ? b.pts
          : [{ x: b.x, y: b.y }, { x: b.x + b.w, y: b.y }, { x: b.x + b.w, y: b.y + b.h }, { x: b.x, y: b.y + b.h }];
        if (coins.some((q, k) => { const r = coins[(k + 1) % coins.length]; return boite(q.x, q.y, r.x, r.y); }))
          L.push("- le contour de la carte passe dans la fenêtre");
        return L.length ? borner(L, 200, "objets") : ["Rien dans cette fenêtre."];
      }
    }
  };

  /* ---------- Visionneuse IPC-2581 (V, 02-modele.js) ---------- */
  const nomNetIpc = i => (V.parNet[i] || {}).nom || "sans net";

  const OUTILS_IPC = {
    empilage: {
      desc: "couches physiques dans l'ordre du fichier (nature, épaisseur, matière, εr, tan δ)",
      fn: () => {
        const e = V.modele.empilage || [], u = V.unite || "mm";
        return e.length ? e.map(x => "- " + x.nom + " : " + (x.type || "?") + (x.ep ? (", " + x.ep + " " + u) : "") + (x.mat ? (", " + x.mat) : "") +
                                     (x.dk ? (", εr " + x.dk) : "") + (x.df ? (", tan δ " + x.df) : ""))
                        : ["Le fichier ne déclare pas d'empilage."];
      }
    },
    composants: {
      args: '"filtre":"U"',
      desc: "liste des composants (repère, valeur, boîtier, référence, couche) ; filtre facultatif",
      fn: a => {
        const L = (V.modele.composants || []).filter(c => contient(a.filtre, c.ref, c.val, c.pkg, c.part)).map(c =>
          "- " + c.ref + (c.val ? (" = " + c.val) : "") + (c.pkg ? (" (" + c.pkg + ")") : "") + (c.part ? (", " + c.part) : "") +
          ", " + ((V.couches[c.c] || {}).nom || "?"));
        return L.length ? borner(L, 150, "composants") : ["Aucun composant ne correspond."];
      }
    },
    composant: {
      args: '"ref":"U1"',
      desc: "un composant : valeur, boîtier, référence, position, et le net de chaque broche",
      fn: a => {
        const c = (V.modele.composants || []).find(x => String(x.ref).toLowerCase() === String(a.ref || "").toLowerCase());
        if (!c) return ["Composant « " + a.ref + " » introuvable : demande la liste avec l'outil « composants »."];
        const L = [c.ref + (c.val ? (" = " + c.val) : "") + (c.pkg ? (" (" + c.pkg + ")") : "") + (c.part ? (", " + c.part) : "") + (c.type ? (", type " + c.type) : "") +
                   ", couche " + ((V.couches[c.c] || {}).nom || "?") + ", x " + c.x + " y " + c.y + ", rotation " + c.r + "°."];
        const b = c.pins || [];
        L.push("Broches (" + b.length + ") :");
        return L.concat(borner(b.map(p => "- " + p.num + " → " + (p.n != null ? nomNetIpc(p.n) : "non connectée")), 200, "broches"));
      }
    },
    nets: {
      args: '"filtre":"USB"',
      desc: "liste des nets (classe, longueur de piste, nombre de couches) ; filtre facultatif",
      fn: a => {
        const u = V.unite || "mm";
        const L = V.parNet.filter(n => n.nom && contient(a.filtre, n.nom)).map(n =>
          "- " + n.nom + " [" + n.classe + "] : " + (n.longueur > 0 ? (mm(n.longueur) + " " + u + " de pistes") : "sans piste") + ", " + n.couches.size + " couche(s)");
        return L.length ? borner(L, 150, "nets") : ["Aucun net ne correspond."];
      }
    },
    net: {
      args: '"nom":"USB_DP"',
      desc: "un net : classe, longueur, couches, nombre de pistes, plans, pastilles et perçages, broches reliées",
      fn: a => {
        const nom = String(a.nom || "").toLowerCase();
        const n = V.parNet.find(x => String(x.nom).toLowerCase() === nom);
        if (!n) return ["Net « " + a.nom + " » introuvable : demande la liste avec l'outil « nets »."];
        const broches = [];
        for (const c of V.modele.composants || [])
          for (const p of c.pins || []) if (p.n === n.i) broches.push(c.ref + "." + p.num);
        return ["Net " + n.nom + ", classe " + n.classe + (n.tensionNominale != null ? (", " + n.tensionNominale + " V") : "") + ".",
                "Longueur de piste : " + mm(n.longueur) + " " + (V.unite || "mm") + ", sur " + [...n.couches].map(i => (V.couches[i] || {}).nom).join(", ") + ".",
                "Objets : " + n.pistes.length + " pistes, " + n.arcs.length + " arcs, " + n.plans.length + " plans, " + n.pads.length + " pastilles, " + n.trous.length + " perçages.",
                "Broches (" + broches.length + ") : " + broches.slice(0, 200).join(", ") + (broches.length > 200 ? " …" : "")];
      }
    }
  };

  /* ---------- Simulations (commun/simulation-rapport.js) ----------
     Le rapport complet n'existe que pour l'analyse AFFICHÉE : sa fiche est
     dans la page. Les autres ne rendent que leurs chiffres clés et leur JSON. */
  const SIM_PARTIES = {
    methode: /^Ce que calcule/, chiffres: /^Chiffres clés/, diagnostics: /^Diagnostics/,
    piste: /^La piste/, bornes: /^Bornes/, reglages: /^Réglages/,
    resultats: /^Résultats détaillés/, texte: /^Rapport texte/, json: /^Données brutes/
  };

  function simRapportsDispo() { return typeof SIM_RAP_ETAT !== "undefined" && typeof SIM !== "undefined"; }

  function simEtat(k) {
    try { return SIM_RAP_ETAT[k](); } catch (e) { return {}; }
  }
  function simNom(k) { return (typeof SIM_ANALYSES !== "undefined" && SIM_ANALYSES[k] && SIM_ANALYSES[k].nom) || k; }
  function simKpis(k, res) {
    try { return (SIM_RAP_KPI[k] ? SIM_RAP_KPI[k](res) : []).map(x => x.lbl + " : " + x.val); } catch (e) { return []; }
  }
  function simAvecResultat() {
    if (!simRapportsDispo()) return [];
    return Object.keys(SIM_RAP_ETAT).filter(k => simEtat(k).res).map(k => simNom(k) + " (« " + k + " »)");
  }

  const OUTILS_SIM = {
    /* ce qui peut se régler et dans quelle unité : sans lui, un courant lu en mA finit dans un
       champ en ampères (commun/simulation-datasheet.js) */
    catalogue: {
      desc: "le catalogue des paramètres de simulation réglables : groupe.clé, unité ou choix, valeur actuelle, où la lire dans une datasheet",
      fn: () => typeof simDsCatalogue === "function" ? simDsCatalogue().split("\n")
                                                     : ["Le catalogue des paramètres de simulation n'est pas chargé dans cette page."]
    },
    simulations: {
      desc: "les analyses de simulation, celles qui ont un résultat et leurs chiffres clés",
      fn: () => Object.keys(SIM_RAP_ETAT).map(k => {
        const res = simEtat(k).res;
        return "- " + k + " (" + simNom(k) + ")" + (k === SIM.analyse ? " [affichée]" : "") + " : " +
               (res ? ("résultat disponible. " + simKpis(k, res).slice(0, 4).join(" ; ")) : "pas de résultat");
      })
    },
    simulation: {
      args: '"analyse":"crosstalk","partie":"chiffres"',
      desc: "une partie du rapport d'une simulation. « partie » vaut : chiffres, diagnostics, methode, piste, bornes, reglages, resultats, texte ou json (données brutes, volumineuses : en dernier recours). Commence par chiffres et diagnostics",
      fn: a => {
        const k = a.analyse || SIM.analyse;
        if (!Object.hasOwn(SIM_RAP_ETAT, k)) return ["Analyse « " + k + " » inconnue. Analyses : " + Object.keys(SIM_RAP_ETAT).join(", ") + "."];
        const partie = a.partie || "chiffres";
        if (k === SIM.analyse && typeof simRapCollecter === "function") {
          const sections = simRapMarkdown(simRapCollecter()).split(/\n(?=## )/);
          const motif = SIM_PARTIES[partie];
          const s = motif && sections.find(x => motif.test(x.replace(/^## \d+\. /, "")));
          return [s || ("La partie « " + partie + " » n'existe pas dans ce rapport. Parties : " + Object.keys(SIM_PARTIES).join(", ") + ".")];
        }
        const res = simEtat(k).res;
        if (!res) return ["La simulation « " + simNom(k) + " » n'a pas de résultat."];
        if (partie === "json") return ["```json", simRapJson(res), "```"];
        if (partie === "methode" && SIM_RAP_GUIDE[k]) return [SIM_RAP_GUIDE[k].methode, "Critères : " + SIM_RAP_GUIDE[k].criteres, "Limites : " + SIM_RAP_GUIDE[k].limites];
        const L = simKpis(k, res).map(x => "- " + x);
        L.push("(« " + simNom(k) + " » n'est pas l'analyse affichée : seuls ses chiffres clés, sa méthode et son JSON sont lisibles. " +
               "Pour le reste, demande à l'utilisateur de l'afficher dans le panneau Simulation.)");
        return L;
      }
    }
  };

  /* ---------- Éditeur schématique (S, 04-etat.js) ----------
     Le document a plusieurs feuilles : un repère est unique dans le document,
     pas dans la feuille, et un net global court sur plusieurs feuilles
     (docNets). Les symboles sans repère (alimentations, étiquettes) ne sont
     pas des composants. Les coordonnées sont en pixels : 20 px = 1 mm. */
  const schMm = px => mm(px / 20);
  const schFeuille = i => "f" + (i + 1);
  function schComposants() {
    const L = [];
    (S.pages || []).forEach((p, i) => {
      for (const c of (i === S.page ? S.comps : p.comps) || [])
        if (!defOf(c.type).noRef) L.push({ c, page: i });
    });
    return L;
  }
  function schTrouver(ref) {
    const cible = String(ref || "").trim().toUpperCase();
    return schComposants().find(x => (x.c.ref || "").trim().toUpperCase() === cible) || null;
  }
  const schReel = g => g.members.some(m => isRealNet(m.net));
  const schLigneComp = ({ c, page }) => c.ref + (c.value ? (" = " + c.value) : "") + (c.pkg ? (" (" + c.pkg + ")") : "") +
    (c.mpn ? (", " + c.mpn) : "") + ", " + schFeuille(page) + ", x " + schMm(c.x) + " y " + schMm(c.y) + " mm, rotation " + (c.rot || 0) + "°";

  const OUTILS_SCH = {
    feuilles: {
      desc: "les feuilles du document (nom, nombre de composants, feuille affichée)",
      fn: () => {
        const tous = schComposants();
        return ["Document : " + (S.pages || []).length + " feuille(s), " + tous.length + " composant(s) :"].concat((S.pages || []).map((p, i) =>
          "- " + schFeuille(i) + " « " + p.name + " » : " + tous.filter(x => x.page === i).length + " composant(s)" +
          (i === S.page ? " [affichée]" : "") + (p.isHierarchy ? " [hiérarchie]" : "")));
      }
    },
    composants: {
      args: '"filtre":"R"',
      desc: "liste des composants de toutes les feuilles (repère, valeur, boîtier, référence fabricant, feuille, position) ; filtre facultatif",
      fn: a => {
        const L = schComposants().filter(x => contient(a.filtre, x.c.ref, x.c.value, x.c.pkg, x.c.mpn, x.c.type)).map(x => "- " + schLigneComp(x));
        return L.length ? borner(L, 150, "composants") : ["Aucun composant ne correspond."];
      }
    },
    composant: {
      args: '"ref":"U1"',
      desc: "un composant : valeur, boîtier, feuille, position, et le net de chaque broche (patte de l'empreinte, nom de broche)",
      fn: a => {
        const x = schTrouver(a.ref);
        if (!x) return ["Composant « " + a.ref + " » introuvable : demande la liste avec l'outil « composants »."];
        /* Une broche en l'air n'est dans aucun net du document : on part des
           broches du composant, puis on cherche leur net. */
        const net = new Map();
        for (const g of docNets().groups)
          for (const n of g.nodes)
            if (n.page === x.page && n.id === x.c.id && schReel(g)) net.set(n.pin + "/" + n.pad, g.name);
        const lignes = [];
        allPins(x.c).forEach((_, i) => {
          const nomB = brNomBroche(x.c, i);
          for (const pad of brPattes(x.c, i))
            lignes.push("- " + pad + (nomB ? (" (" + nomB + ")") : "") + " → " + (net.get((i + 1) + "/" + pad) || "non connectée"));
        });
        const L = [schLigneComp(x) + (x.c.type ? (", symbole " + x.c.type) : "") + "."];
        L.push("Broches (" + lignes.length + ") :");
        return L.concat(borner(lignes, 200, "broches"));
      }
    },
    nets: {
      args: '"filtre":"USB"',
      desc: "liste des nets du document (global ou local, nombre de broches, feuilles) ; filtre facultatif",
      fn: a => {
        const L = docNets().groups.filter(g => schReel(g) && contient(a.filtre, g.name)).map(g =>
          "- " + g.name + (g.global ? " [global]" : "") + " : " + g.nodes.length + " broches, " + g.pages.map(schFeuille).join(", ") +
          (g.conflict ? ", conflit de noms" : ""));
        return L.length ? borner(L, 150, "nets") : ["Aucun net ne correspond."];
      }
    },
    net: {
      args: '"nom":"GND","feuille":2',
      desc: "un net : global ou local, feuilles, broches reliées (REPÈRE.patte) ; « feuille » (numéro) départage deux nets locaux de même nom",
      fn: a => {
        const nom = String(a.nom || "").toLowerCase();
        let gs = docNets().groups.filter(g => schReel(g) && String(g.name).toLowerCase() === nom);
        if (a.feuille != null) gs = gs.filter(g => g.pages.includes(Number(a.feuille) - 1));
        if (!gs.length) return ["Net « " + a.nom + " » introuvable : demande la liste avec l'outil « nets »."];
        if (gs.length > 1) return ["Net « " + a.nom + " » : plusieurs feuilles en ont un, distincts (" + gs.map(g => g.pages.map(schFeuille).join("+")).join(", ") +
                                   ") : précise « feuille »."];
        const g = gs[0], broches = g.nodes.map(n => n.ref + "." + n.pad);
        return ["Net " + g.name + ", " + (g.global ? "global" : "local") + ", sur " + g.pages.map(schFeuille).join(", ") + "." + (g.conflict ? " Conflit de noms." : ""),
                "Broches (" + broches.length + ") : " + broches.slice(0, 200).join(", ") + (broches.length > 200 ? " …" : "")];
      }
    }
  };

  return {
    pcb: OUTILS_PCB, ipc: OUTILS_IPC, sim: OUTILS_SIM, schema: OUTILS_SCH,
    aides: { borner, nomCouchePcb, simRapportsDispo, simAvecResultat }
  };
})();
