"use strict";
/* =============================================================================
   editeur-schematique — 31-erc.js
   Contrôle électrique du schéma (ERC), sur tout le document :
     · entrée en l'air (broche d'entrée seule) ou nets fait d'entrées seules ;
     · deux sorties sur le même net ;
     · net à une seule broche, broche non connectée ;
     · alimentation non pilotée : aucune source (connecteur, pile, sortie de
       régulateur) n'y arrive, même à travers un élément série (ferrite,
       self, fusible, diode, résistance, pont, MOSFET de commutation).
   Le marqueur « non connecté » (type nc, 02-bibliotheque.js) posé sur une
   broche fait taire ce qui la concerne.

   Le type électrique d'une broche se saisit dans « Détails du composant »
   (`el.pinTypes`, colonne Type ; repris de et vers KiCad). Non saisi, il se
   déduit du symbole et du nom de la broche (VCC, GND, OUT, EN…) ; une broche
   au nom inconnu est « libre » et ne déclenche que le contrôle de connexion.
   Les conflits entre types sur un même net suivent une matrice réglable,
   gardée dans le document (`S.ercMatrice`, écarts à la matrice par défaut).
   Autres contrôles : noms rivaux sur un net, nom écrit de plusieurs façons,
   étiquette seule, fil en l'air, broche hors grille, piquage hors du bus.
   ============================================================================= */

const ERC_PASSIFS = new Set(["Passifs", "Semi-conducteurs", "Divers", "Alimentation"]);
/* éléments série que l'alimentation traverse : 2 broches, ou D/S d'un MOSFET */
const ERC_SERIE = new Set(["resistor", "inductor", "ferrite_bead", "fuse", "diode", "schottky", "strap", "button", "nmos", "pmos"]);
const ERC_RE = {
  nc: /^(NC|N\.C\.?|DNC)$/,
  free: /^NIC$/,                       // « not internally connected » : se câble librement (free de KiCad)
  pwrOut: /^(VOUT\w*|VO|VREG\w*|REGOUT|SW\d*|LX\d*)$/,
  pwrIn: /^(VCC\w*|VDD\w*|AVDD\w*|DVDD\w*|PVDD\w*|VIN\d*|PVIN\d*|VBAT\w*|VS|VSUP|V\+|VEE|VSS\w*|V-|GND\w*|AGND|DGND|PGND|EP|EPAD)$/,
  out: /^(OUT[A-D0-9]?|OUT[+-]|DOUT|DO|SDO|TXD?\d*|Q\d*|CLKOUT)$/,
  in: /^(IN[+-]?\d*|IN[A-D]|DIN|DI|SDI|RXD?\d*|EN\w*|CE|CS\d*|SS|SCK|SCLK|CLK|CLKIN|RST|RESET|MR|SHDN|ADJ|FB|SET|A[0-2]|TRIG|THR)$/
};

/* Une source d'alimentation venue d'ailleurs : connecteur, pile, source. */
function ercSource(el) {
  const def = defOf(el.type);
  return el.type === "battery" || el.type === "acsource" || def.p === "J" ||
         /^(J|CN|BT|X)\d/i.test(String(el.ref || ""));
}

/* ---------- types de broche et matrice des conflits ----------
   Les types de KiCad ; « oc » couvre collecteur et émetteur ouverts. */
const ERC_TYPES = [
  ["in", "Entrée"], ["out", "Sortie"], ["bidir", "Bidirectionnelle"], ["tri", "Trois états"],
  ["passive", "Passive"], ["oc", "Collecteur ouvert"], ["pwr_in", "Entrée d'alim."],
  ["pwr_out", "Sortie d'alim."], ["unspec", "Non spécifiée"], ["free", "Libre"], ["nc", "Non connectée"]
];
const ERC_IDX = Object.fromEntries(ERC_TYPES.map(([t], i) => [t, i]));
const ERC_NOM = Object.fromEntries(ERC_TYPES);
// propre à la table : « constructor » ou « __proto__ » venus d'un fichier ne passent pas
function ercTypeOk(t) { return typeof t === "string" && Object.prototype.hasOwnProperty.call(ERC_IDX, t); }
/* Matrice par défaut de KiCad (erc_settings.cpp) ; une paire absente est permise. */
const ERC_DEFAUT = {
  "in|unspec": "avert", "in|nc": "erreur",
  "out|out": "erreur", "out|tri": "avert", "out|oc": "erreur", "out|pwr_out": "erreur", "out|unspec": "avert", "out|nc": "erreur",
  "bidir|pwr_out": "avert", "bidir|unspec": "avert", "bidir|nc": "erreur",
  "tri|oc": "avert", "tri|pwr_in": "avert", "tri|pwr_out": "erreur", "tri|unspec": "avert", "tri|nc": "erreur",
  "passive|unspec": "avert", "passive|nc": "erreur",
  "oc|pwr_out": "erreur", "oc|unspec": "avert", "oc|nc": "erreur",
  "pwr_in|unspec": "avert", "pwr_in|nc": "erreur",
  "pwr_out|pwr_out": "erreur", "pwr_out|unspec": "avert", "pwr_out|nc": "erreur",
  "unspec|unspec": "avert", "unspec|nc": "erreur", "nc|nc": "erreur"
};
const ERC_NIVEAUX = ["ok", "avert", "erreur"];
function ercCle(a, b) { return ERC_IDX[a] <= ERC_IDX[b] ? a + "|" + b : b + "|" + a; }
function ercNiveau(a, b) {
  const k = ercCle(a, b), m = S.ercMatrice || {};
  return Object.prototype.hasOwnProperty.call(m, k) ? m[k] : (ERC_DEFAUT[k] || "ok");
}
/* Lecture d'un fichier : seules les paires connues et les trois niveaux, et
   seulement ce qui s'écarte du défaut. */
function ercMatriceNorm(o) {
  const r = {};
  if (!o || typeof o !== "object") return r;
  for (const [a] of ERC_TYPES) for (const [b] of ERC_TYPES) {
    const k = ercCle(a, b);
    if (Object.prototype.hasOwnProperty.call(o, k) && ERC_NIVEAUX.includes(o[k]) && o[k] !== (ERC_DEFAUT[k] || "ok")) r[k] = o[k];
  }
  return r;
}
/* Type saisi d'une broche, ou "" s'il est deviné. */
function ercTypeSaisi(el, i) {
  const t = el && Array.isArray(el.pinTypes) ? el.pinTypes[i] : "";
  return ercTypeOk(t) ? t : "";
}
/* in, out, bidir, tri, passive, oc, pwr_in, pwr_out, unspec, free ou nc. */
function ercTypeBroche(el, i) {
  return ercTypeSaisi(el, i) || ercTypeDevine(el, i);
}
function ercTypeDevine(el, i) {
  /* pile et source : « passive » (catégorie Alimentation), sinon deux piles en
     série donnaient « Deux sorties » ; elles restent des sources par ercSource */
  const def = defOf(el.type);
  if (ERC_PASSIFS.has(def.cat) || ercSource(el)) return "passive";
  const brut = String(typeof brNomBroche === "function" ? brNomBroche(el, i) : ((el.pinNames || [])[i] || "")).trim();
  // ~RST, /CS, !EN, nCS : la barre d'actif bas ne change pas le sens
  const nom = brut.replace(/^[~\/!]+/, "").replace(/^n(?=[A-Z])/, "").toUpperCase();
  if (!nom) return "free";
  if (ERC_RE.nc.test(nom)) return "nc";
  if (ERC_RE.free.test(nom)) return "free";
  if (nom.includes("/")) return "bidir";              // broche multifonction
  if (el.type === "regulator") return nom === "IN" ? "pwr_in" : /^OUT\d*$/.test(nom) ? "pwr_out" : ERC_RE.pwrIn.test(nom) ? "pwr_in" : "free";
  if (ERC_RE.pwrOut.test(nom)) return "pwr_out";
  if (ERC_RE.pwrIn.test(nom)) return "pwr_in";
  if (ERC_RE.out.test(nom)) return "out";
  if (ERC_RE.in.test(nom)) return "in";
  return "free";                                     // nom inconnu : rien à opposer
}

/* Le contrôle : une liste de { niveau: "erreur"|"avert", code, msg, page, x, y, id }. */
function ercVerifier() {
  const D = docNets(), res = [];
  const elDe = new Map();
  S.pages.forEach((p, i) => {
    for (const el of (i === S.page ? S.comps : (p.comps || []))) elDe.set(i + ":" + el.id, el);
  });
  const nomB = (el, i) => {
    const n = typeof brNomBroche === "function" ? brNomBroche(el, i) : "";
    return (el.ref || "?") + "." + (i + 1) + (n ? " (" + n + ")" : "");
  };
  /* un nœud par broche : une broche sur deux pattes donne deux nœuds */
  const broches = nodes => {
    const vu = new Map();
    for (const nd of nodes) {
      const k = nd.page + ":" + nd.id + ":" + nd.pin;
      if (vu.has(k)) continue;
      const el = elDe.get(nd.page + ":" + nd.id);
      if (el) vu.set(k, { nd, el, i: nd.pin - 1, t: ercTypeBroche(el, nd.pin - 1) });
    }
    return [...vu.values()];
  };
  const dire = (niveau, code, msg, b) => res.push({ niveau, code, msg, page: b.page, x: b.x, y: b.y, id: b.id || null });

  const relies = new Set();              // ref.patte présente dans un net
  for (const g of D.groups) for (const nd of g.nodes) relies.add(nd.ref + "." + nlPad(nd));

  /* 1. broches seules et marqueurs isolés (points qui ne forment pas de net) */
  for (const sh of D.sheets) for (const n of sh.nets.loose) {
    const bs = broches(n.nodes.map(nd => Object.assign({ page: sh.page }, nd)));
    if (!bs.length) {
      if (n.nc && n.pts.length) dire("avert", "nc-isole", "Marqueur « non connecté » posé sur aucune broche", { page: sh.page, x: n.pts[0].x, y: n.pts[0].y });
      continue;
    }
    if (n.nc) continue;
    for (const b of bs) {
      if (b.t === "nc" || defOf(b.el.type).p === "MECA") continue;
      /* patte commune d'un boîtier en plusieurs parties (V+ d'un AOP double) :
         câblée sur une autre partie, elle est reliée, comme dans la netlist */
      if (b.el.ref && relies.has(b.el.ref + "." + nlPad(b.nd))) continue;
      const pos = { page: sh.page, x: b.nd.x, y: b.nd.y, id: b.el.id };
      if (b.t === "in" || b.t === "pwr_in") dire("erreur", "entree-en-l-air", "Entrée en l'air : " + nomB(b.el, b.i), pos);
      else dire("avert", "non-connectee", "Broche non connectée : " + nomB(b.el, b.i), pos);
    }
  }

  /* 2. nets du document */
  const gDe = new Map();                 // page:id:broche → index du net
  const infos = D.groups.map((g, gi) => {
    const bs = broches(g.nodes);
    for (const b of bs) gDe.set(b.nd.page + ":" + b.el.id + ":" + b.nd.pin, gi);
    const powers = [], nc = g.members.some(m => m.net.nc), bus = g.members.some(m => m.net.isBus);
    for (const m of g.members) powers.push(...m.net.powers);
    const m0 = g.members[0], a = m0 && (m0.net.anchor || m0.net.min);
    const pos = { page: m0 ? m0.page : 0, x: a ? a.x : 0, y: a ? a.y : 0 };
    return { g, bs, powers, nc, bus, pos };
  });
  for (const f of infos) {
    if (f.bus) continue;
    const nom = "« " + f.g.name + " »";
    if (f.nc) {
      if (f.bs.length > 1) dire("avert", "nc-relie", "Marqueur « non connecté » sur le net " + nom + ", relié à " + f.bs.length + " broches", f.pos);
      continue;
    }
    if (f.bs.length === 1 && f.bs[0].t !== "nc")
      dire("avert", "une-broche", "Net " + nom + " à une seule broche : " + nomB(f.bs[0].el, f.bs[0].i), f.pos);
    /* conflits de types, selon la matrice : une ligne par paire de types ;
       les sorties entre elles gardent leur message « Deux sorties » */
    /* une broche devinée « nc » d'après son nom (NC relié à la masse, courant dans les
       fiches) ne crie pas : seul un type saisi « non connectée » entre dans la matrice */
    const parT = new Map();
    for (const b of f.bs) {
      const t = b.t === "nc" && !ercTypeSaisi(b.el, b.i) ? "free" : b.t;
      if (!parT.has(t)) parT.set(t, []); parT.get(t).push(b);
    }
    const ts = [...parT.keys()].sort((a, b) => ERC_IDX[a] - ERC_IDX[b]);
    const liste = bs => bs.slice(0, 4).map(b => nomB(b.el, b.i)).join(", ") + (bs.length > 4 ? "…" : "");
    let nivSorties = "ok";
    for (let x = 0; x < ts.length; x++) for (let y = x; y < ts.length; y++) {
      const a = ts[x], b = ts[y];
      if (a === b && parT.get(a).length < 2) continue;
      const niv = ercNiveau(a, b);
      if (niv === "ok") continue;
      if ((a === "out" || a === "pwr_out") && (b === "out" || b === "pwr_out")) {
        if (niv === "erreur" || nivSorties === "ok") nivSorties = niv;
        continue;
      }
      dire(niv, "conflit-broches", "Conflit de broches sur le net " + nom + " : " + ERC_NOM[a] + " (" + liste(parT.get(a)) + ")" +
        (a === b ? " deux fois" : " ↔ " + ERC_NOM[b] + " (" + liste(parT.get(b)) + ")"), f.pos);
    }
    if (nivSorties !== "ok") {
      const sorties = f.bs.filter(b => b.t === "out" || b.t === "pwr_out");
      dire(nivSorties, "deux-sorties", "Deux sorties sur le net " + nom + " : " + sorties.map(b => nomB(b.el, b.i)).join(", "), f.pos);
    }
    if (f.bs.length >= 2 && !f.powers.length && f.bs.every(b => b.t === "in"))
      dire("erreur", "entrees-seules", "Net " + nom + " sans source : que des entrées (" + f.bs.map(b => nomB(b.el, b.i)).join(", ") + ")", f.pos);
  }

  /* 3. alimentations : une source doit arriver, au besoin à travers un élément série */
  const par = infos.map((_, i) => i);
  const racine = i => { while (par[i] !== i) i = par[i] = par[par[i]]; return i; };
  S.pages.forEach((p, pi) => {
    for (const el of (pi === S.page ? S.comps : (p.comps || []))) {
      if (!ERC_SERIE.has(el.type)) continue;
      const n = pinsOf(el).length;
      let a = 0, b = 1;
      if (el.type === "nmos" || el.type === "pmos") {
        const noms = [0, 1, 2].map(i => String(brNomBroche(el, i)).toUpperCase());
        a = noms.indexOf("D"); b = noms.indexOf("S");
      } else if (n !== 2) continue;
      if (a < 0 || b < 0) continue;
      const ga = gDe.get(pi + ":" + el.id + ":" + (a + 1)), gb = gDe.get(pi + ":" + el.id + ":" + (b + 1));
      if (ga != null && gb != null) par[racine(ga)] = racine(gb);
    }
  });
  const alimente = new Set();
  infos.forEach((f, i) => {
    if (f.bs.some(b => b.t === "pwr_out" || ercSource(b.el))) alimente.add(racine(i));
  });
  infos.forEach((f, i) => {
    if (f.bus || f.nc) return;
    const alim = f.powers.some(e => e.type === "vcc" || e.type === "gnd") || f.bs.some(b => b.t === "pwr_in");
    if (alim && !alimente.has(racine(i)))
      dire("erreur", "alim-non-pilotee", "Alimentation « " + f.g.name + " » non pilotée : aucun connecteur, pile ni sortie de régulateur n'y arrive", f.pos);
  });

  ercNoms(D, dire);
  ercDessin(dire);

  res.sort((a, b) => (a.niveau === b.niveau ? 0 : a.niveau === "erreur" ? -1 : 1) || a.page - b.page);
  return res;
}

/* Comps et fils d'une feuille, la feuille ouverte comprise. */
function ercFeuille(pi) {
  const p = S.pages[pi];
  return { comps: pi === S.page ? S.comps : (p.comps || []), wires: pi === S.page ? S.wires : (p.wires || []) };
}

/* 4. noms de nets : rivaux sur un même net, écrits de plusieurs façons,
   étiquettes qui ne rejoignent rien */
function ercNoms(D, dire) {
  for (const g of D.groups) {
    if (g.members.some(m => m.net.isBus)) continue;
    const noms = [];
    for (const m of g.members) for (const n of m.net.names) if (!noms.some(x => x.toUpperCase() === n.toUpperCase())) noms.push(n);
    if (noms.length < 2) continue;
    const m0 = g.members[0], a = m0.net.anchor || m0.net.min;
    dire("avert", "noms-rivaux", "Net à plusieurs noms : " + noms.join(" / ") + " ; la netlist garde « " + g.name + " »",
         { page: m0.page, x: a ? a.x : 0, y: a ? a.y : 0 });
  }
  /* toutes les revendications de nom : étiquettes, alimentations, fils nommés */
  const graphies = new Map(), parPage = new Map(), globaux = new Map(), etiquettes = [];
  const noter = (nom, page, x, y, global) => {
    const k = nom.toUpperCase();
    /* un nom local ne rejoint que sa feuille : la casse se compare par feuille, et
       entre feuilles seulement pour les noms globaux */
    for (const kg of global ? ["G|" + k, page + "|" + k] : [page + "|" + k]) {
      if (!graphies.has(kg)) graphies.set(kg, { vu: new Set(), pos: { page, x, y } });
      graphies.get(kg).vu.add(nom);
    }
    const kp = page + "|" + k;
    parPage.set(kp, (parPage.get(kp) || 0) + 1);
    if (global) globaux.set(k, (globaux.get(k) || 0) + 1);
  };
  S.pages.forEach((p, pi) => {
    if (p.isHierarchy) return;
    const f = ercFeuille(pi);
    for (const el of f.comps) {
      const src = NAME_SRC[el.type];
      if (!src) continue;
      const nom = String(el.value || "").trim() || src.def, pin = allPins(el)[0] || el;
      noter(nom, pi, pin.x, pin.y, !!src.global);
      if (el.type === "port" || el.type === "gport") etiquettes.push({ el, nom, page: pi, x: pin.x, y: pin.y });
    }
    for (const w of f.wires) {
      const nom = String(w.net || "").trim();
      if (nom && !NET_AUTO.test(nom) && !w.bus) noter(nom, pi, (w.x1 + w.x2) / 2, (w.y1 + w.y2) / 2, false);
    }
  });
  const dits = new Set();
  for (const g of graphies.values())
    if (g.vu.size > 1 && !dits.has([...g.vu].sort().join("|")) && dits.add([...g.vu].sort().join("|"))) dire("avert", "casse", "Nom de net écrit de plusieurs façons : " + [...g.vu].join(" / ") + " (un seul net)", g.pos);
  for (const e of etiquettes) {
    const k = e.nom.toUpperCase(), ici = parPage.get(e.page + "|" + k) || 0;
    const seule = e.el.type === "gport" ? (globaux.get(k) || 0) <= 1 && ici <= 1 : ici <= 1;
    /* seule par son nom ET sur un net d'une broche au plus : elle devait en
       rejoindre une autre (nom mal tapé, étiquette oubliée ailleurs) */
    const sh = D.sheets.find(x => x.page === e.page), n = sh && sh.nets.byPoint.get(key(e.x, e.y));
    if (seule && (!n || n.nodes.length <= 1))
      dire("avert", "etiquette-seule", (e.el.type === "gport" ? "Étiquette globale « " : "Étiquette « ") + e.nom + " » seule : elle ne rejoint aucun autre point " +
           (e.el.type === "gport" ? "du document" : "de la feuille"), { page: e.page, x: e.x, y: e.y, id: e.el.id });
  }
}

/* 5. dessin : fil en l'air, broche hors grille, piquage hors du bus */
function ercDessin(dire) {
  // la grille des broches (G) : un pas d'accrochage plus large n'en fait pas des broches « hors grille »
  const g = Math.min(S.grid || G, G), horsGrille = v => Math.abs(v / g - Math.round(v / g)) > 1e-3;
  S.pages.forEach((p, pi) => {
    if (p.isHierarchy) return;
    const f = ercFeuille(pi), bouts = new Map(), broches = new Set(), pts = [];
    for (const w of f.wires) if (!w.bus) for (const k of [key(w.x1, w.y1), key(w.x2, w.y2)]) bouts.set(k, (bouts.get(k) || 0) + 1);
    for (const el of f.comps) {
      const def = defOf(el.type);
      allPins(el).forEach((q, i) => {
        broches.add(key(q.x, q.y)); pts.push(q);
        if (!def.noRef && (horsGrille(q.x) || horsGrille(q.y)))
          dire("avert", "hors-grille", "Broche hors grille : " + (el.ref || "?") + "." + (i + 1) + " ; un fil posé à la grille ne l'atteint pas", { page: pi, x: q.x, y: q.y, id: el.id });
      });
    }
    for (const w of f.wires) {
      if (w.bus) continue;
      // un fil qui traverse une broche la relie (07-connectivite.js) : son bout qui dépasse n'est pas en l'air
      if (pts.some(q => insideSeg(q, w))) continue;
      for (const [x, y] of [[w.x1, w.y1], [w.x2, w.y2]]) {
        const k = key(x, y);
        if (bouts.get(k) > 1 || broches.has(k) || String(w.net || "").trim()) continue;   // un fil nommé vaut étiquette
        if (f.wires.some(o => o !== w && !o.bus && insideSeg({ x, y }, o))) continue;
        if (schBusDuPoint(x, y, f.wires, 2)) continue;
        dire("avert", "fil-en-l-air", "Fil en l'air : une extrémité ne touche rien", { page: pi, x, y });
      }
    }
    for (const q of schTousLesPiquages(f.wires)) {
      const nom = String(q.wire.net || "").trim(), membres = schDevelopperSignauxBus(q.busName);
      if (!nom || membres.length < 2 || membres.some(m => m.toUpperCase() === nom.toUpperCase())) continue;
      dire("avert", "piquage-hors-bus", "Piquage « " + nom + " » absent du bus « " + q.busName + " » (" + membres.slice(0, 6).join(", ") + (membres.length > 6 ? "…" : "") + ")",
           { page: pi, x: q.x, y: q.y });
    }
  });
}

/* ---------- fenêtre ---------- */
let ERC_DERNIER = [];
function ercConstruire() {
  let d = document.getElementById("ercEd");
  if (d) return d;
  d = document.createElement("div");
  d.id = "ercEd"; d.className = "modal"; d.hidden = true;
  d.setAttribute("role", "dialog"); d.setAttribute("aria-modal", "true"); d.setAttribute("aria-labelledby", "ercTitre");
  d.innerHTML =
    '<div class="modal-box" style="width:min(720px,94vw);max-height:84vh">' +
      '<header class="modal-head">' +
        '<span class="modal-title" id="ercTitre">Contrôle électrique (ERC)</span>' +
        '<button class="pnl-btn" id="ercMatBtn" title="Matrice des conflits entre types de broches" type="button">▦</button>' +
        '<button class="pnl-btn" id="ercRelancer" title="Relancer le contrôle" type="button">⟳</button>' +
        '<button class="pnl-btn" id="ercFermer" title="Fermer" type="button">✕</button>' +
      '</header>' +
      '<div id="ercMatrice" hidden style="padding:8px 14px;overflow:auto"></div>' +
      '<div id="ercResume" style="padding:8px 14px;color:var(--txt-dim)"></div>' +
      '<div id="ercListe" style="overflow:auto;padding:0 14px 12px;flex:1"></div>' +
    '</div>';
  document.body.appendChild(d);
  document.getElementById("ercFermer").onclick = ercFermer;
  document.getElementById("ercRelancer").onclick = ercOuvrir;
  document.getElementById("ercMatBtn").onclick = () => {
    const m = document.getElementById("ercMatrice");
    m.hidden = !m.hidden;
    if (!m.hidden) m.innerHTML = ercMatriceHtml();
  };
  d.addEventListener("click", e => {
    if (e.target === d) { ercFermer(); return; }
    const cel = e.target.closest && e.target.closest("[data-erck]");
    if (cel) { ercMatriceBasculer(cel.dataset.erck); return; }
    if (e.target.id === "ercMatDefaut") { push(); S.ercMatrice = {}; ercOuvrir(); return; }
    const li = e.target.closest && e.target.closest("[data-erc]");
    if (li) ercAller(ERC_DERNIER[+li.dataset.erc]);
  });
  d.addEventListener("keydown", e => { if (e.key === "Escape") ercFermer(); });
  return d;
}
function ercOuvrir() {
  const d = ercConstruire();
  ERC_DERNIER = ercVerifier();
  const nE = ERC_DERNIER.filter(r => r.niveau === "erreur").length, nA = ERC_DERNIER.length - nE;
  document.getElementById("ercResume").textContent = ERC_DERNIER.length
    ? nE + " erreur(s), " + nA + " avertissement(s). Un clic montre l'endroit. Une broche laissée libre exprès : posez-y le marqueur « Non connecté » (Divers)."
    : "Aucun défaut : toutes les broches sont reliées, chaque net a sa source.";
  document.getElementById("ercListe").innerHTML = ERC_DERNIER.map((r, i) =>
    '<div data-erc="' + i + '" style="cursor:pointer;padding:5px 0;border-bottom:1px solid var(--border)">' +
      '<span style="color:' + (r.niveau === "erreur" ? "#e8443a" : "#f59e0b") + '">' + (r.niveau === "erreur" ? "⛔" : "⚠️") + '</span> ' +
      esc(r.msg) + ' <span style="color:var(--txt-dim)">· f' + (r.page + 1) + '</span></div>').join("");
  const mat = document.getElementById("ercMatrice");
  if (mat && !mat.hidden) mat.innerHTML = ercMatriceHtml();
  d.hidden = false;
}
/* La matrice : un triangle, une case par paire de types ; un clic passe de
   permis à avertissement, à erreur, puis revient. */
const ERC_SYMB = { ok: "✓", avert: "⚠", erreur: "⛔" };
function ercMatriceHtml() {
  let h = '<table style="border-collapse:collapse;font-size:11px"><tr><th></th>' +
    ERC_TYPES.map(([, n]) => '<th style="writing-mode:vertical-rl;transform:rotate(180deg);padding:2px;font-weight:500">' + esc(n) + '</th>').join("") + '</tr>';
  ERC_TYPES.forEach(([a, na], i) => {
    h += '<tr><th style="text-align:right;padding-right:6px;font-weight:500">' + esc(na) + '</th>';
    ERC_TYPES.forEach(([b], j) => {
      if (j > i) { h += '<td></td>'; return; }
      const k = ercCle(a, b), n = ercNiveau(a, b), change = Object.prototype.hasOwnProperty.call(S.ercMatrice || {}, k);
      h += '<td data-erck="' + k + '" title="' + esc(ERC_NOM[a] + " ↔ " + ERC_NOM[b]) + (change ? " (modifié)" : "") +
        '" style="cursor:pointer;text-align:center;width:22px;height:20px;border:1px solid var(--border);' +
        (change ? "outline:1px solid var(--blue);" : "") + 'color:' + (n === "erreur" ? "#e8443a" : n === "avert" ? "#f59e0b" : "var(--txt-dim)") + '">' + ERC_SYMB[n] + '</td>';
    });
    h += '</tr>';
  });
  return h + '</table><div class="row" style="margin-top:6px"><button class="tb mini" id="ercMatDefaut" type="button">Matrice par défaut</button>' +
    '<span style="color:var(--txt-dim);margin-left:8px">Gardée dans le document. Les types se saisissent dans « Détails du composant ».</span></div>';
}
function ercMatriceBasculer(k) {
  const [a, b] = String(k).split("|");
  if (!ercTypeOk(a) || !ercTypeOk(b)) return;
  push();
  const suiv = ERC_NIVEAUX[(ERC_NIVEAUX.indexOf(ercNiveau(a, b)) + 1) % 3];
  const m = Object.assign({}, S.ercMatrice || {});
  m[ercCle(a, b)] = suiv;
  S.ercMatrice = ercMatriceNorm(m);
  ercOuvrir();
}
function ercFermer() {
  const d = document.getElementById("ercEd");
  if (d) d.hidden = true;
}
function ercAller(r) {
  if (!r) return;
  gotoPage(r.page);
  clearSel();
  if (r.id != null) S.sel.add(r.id);
  rpCadrer({ x1: r.x - 60, y1: r.y - 60, x2: r.x + 60, y2: r.y + 60 });
  refreshPanels(); draw();
}
