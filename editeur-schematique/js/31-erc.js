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

   Le type électrique d'une broche n'est écrit nulle part : il se déduit du
   symbole et du nom de la broche (VCC, GND, OUT, EN…). Une broche au nom
   inconnu est « bidir » et ne déclenche que le contrôle de connexion.
   shortcut: types de broche devinés par leur nom, pas saisis ; ajouter une
   colonne « type » au brochage si les faux positifs gênent.
   ============================================================================= */

const ERC_PASSIFS = new Set(["Passifs", "Semi-conducteurs", "Divers", "Alimentation"]);
/* éléments série que l'alimentation traverse : 2 broches, ou D/S d'un MOSFET */
const ERC_SERIE = new Set(["resistor", "inductor", "ferrite_bead", "fuse", "diode", "schottky", "strap", "button", "nmos", "pmos"]);
const ERC_RE = {
  nc: /^(NC|N\.C\.?|DNC|NIC)$/,
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

/* in, out, bidir, pwr_in, pwr_out, passive ou nc. */
function ercTypeBroche(el, i) {
  /* pile et source : « passive » (catégorie Alimentation), sinon deux piles en
     série donnaient « Deux sorties » ; elles restent des sources par ercSource */
  const def = defOf(el.type);
  if (ERC_PASSIFS.has(def.cat) || ercSource(el)) return "passive";
  const brut = String(typeof brNomBroche === "function" ? brNomBroche(el, i) : ((el.pinNames || [])[i] || "")).trim();
  // ~RST, /CS, !EN, nCS : la barre d'actif bas ne change pas le sens
  const nom = brut.replace(/^[~\/!]+/, "").replace(/^n(?=[A-Z])/, "").toUpperCase();
  if (!nom) return "bidir";
  if (ERC_RE.nc.test(nom)) return "nc";
  if (nom.includes("/")) return "bidir";              // broche multifonction
  if (el.type === "regulator") return nom === "IN" ? "pwr_in" : /^OUT\d*$/.test(nom) ? "pwr_out" : ERC_RE.pwrIn.test(nom) ? "pwr_in" : "bidir";
  if (ERC_RE.pwrOut.test(nom)) return "pwr_out";
  if (ERC_RE.pwrIn.test(nom)) return "pwr_in";
  if (ERC_RE.out.test(nom)) return "out";
  if (ERC_RE.in.test(nom)) return "in";
  return "bidir";
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
    const sorties = f.bs.filter(b => b.t === "out" || b.t === "pwr_out");
    if (sorties.length >= 2)
      dire("erreur", "deux-sorties", "Deux sorties sur le net " + nom + " : " + sorties.map(b => nomB(b.el, b.i)).join(", "), f.pos);
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

  res.sort((a, b) => (a.niveau === b.niveau ? 0 : a.niveau === "erreur" ? -1 : 1) || a.page - b.page);
  return res;
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
        '<button class="pnl-btn" id="ercRelancer" title="Relancer le contrôle" type="button">⟳</button>' +
        '<button class="pnl-btn" id="ercFermer" title="Fermer" type="button">✕</button>' +
      '</header>' +
      '<div id="ercResume" style="padding:8px 14px;color:var(--txt-dim)"></div>' +
      '<div id="ercListe" style="overflow:auto;padding:0 14px 12px;flex:1"></div>' +
    '</div>';
  document.body.appendChild(d);
  document.getElementById("ercFermer").onclick = ercFermer;
  document.getElementById("ercRelancer").onclick = ercOuvrir;
  d.addEventListener("click", e => {
    if (e.target === d) { ercFermer(); return; }
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
  d.hidden = false;
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
