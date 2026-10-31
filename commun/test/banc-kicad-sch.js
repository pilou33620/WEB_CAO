"use strict";
/* =============================================================================
   commun/test/banc-kicad-sch.js
   Banc de commun/kicad-sch.js (schéma KiCad ⇄ schemedit-2).

       node commun/test/banc-kicad-sch.js [dossierDemos]

   1. petits schémas écrits ici, aux valeurs attendues calculées à la main ;
   2. chaque projet du dossier (par défaut ~/kicad-essais/src/demos) : lecture,
      puis la partition des broches {repère:numéro} en nets, calculée sur le
      document par un vérificateur à la manière de l'éditeur, comparée à celle
      que KiCad donnerait, calculée directement sur les arbres KiCad par un
      vérificateur indépendant ; puis écriture → relecture, même partition ; et,
      si dist/schema.js existe, le vrai chargeur de l'éditeur (loadDoc) : rien
      ne bouge, mêmes nets ;
   3. si kicad-cli est là : sa netlist de l'original contre celle de l'export.
   N'imprime qu'un bilan court.
   ============================================================================= */
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const os = require("os");
const { execFileSync } = require("child_process");

const RACINE = path.join(__dirname, "..", "..");
const lireF = f => fs.readFileSync(path.join(RACINE, f), "utf8");

/* mode enfant : l'ECO du vrai éditeur PCB (dist/pcb.js), dans son propre processus — ses
   globales et celles de l'éditeur de schéma portent les mêmes noms */
if (process.argv[2] === "--eco") {
  require(path.join(RACINE, "commun", "test", "dom-stub.js")).install({ canvasId: "board",
    panels: { stack: "Empilage", rules: "Règles de tracé", props: "Propriétés", list: "Nets & composants",
              stackup: "Empilage physique", dpair: "Paires différentielles", sim: "Simulation EM" } });
  global.BroadcastChannel = function () { this.postMessage = () => {}; this.close = () => {}; };
  const log = console.log;
  console.log = console.warn = () => {};
  (0, eval)(lireF("editeur-pcb/dist/pcb.js").replace(/^"use strict";/, "") +
    "\nglobalThis.__PCB={loadDoc,pcbObtenirDonneesSchema,pcbDetecterDisparitesEco};");
  const out = [];
  for (const { nom, pcb, schema, netlist } of JSON.parse(fs.readFileSync(process.argv[3], "utf8"))) {
    global.__PCB.loadDoc(pcb);
    const r = global.__PCB.pcbDetecterDisparitesEco(global.__PCB.pcbObtenirDonneesSchema(Object.assign({}, schema, { netlist })));
    const n = k => (r[k] || []).length;
    out.push({ nom, total: r.total, detail: ["ajouts", "renommages", "boitiers", "valeurs", "nets", "suppressions", "contraintes"].filter(n).map(k => k + " " + n(k)).join(", "),
               ex: r.items.slice(0, 3).map(i => i.type + " " + (i.ref || "") + (i.pin ? "." + i.pin : "") + " " +
                 [i.oldNet, i.newNet, i.oldPkg, i.newPkg, i.oldValue, i.newValue].filter(v => v !== undefined).join(" → ")) });
  }
  log(JSON.stringify(out));
  process.exit(0);
}
const bac = { console, TextEncoder, TextDecoder, Blob, DecompressionStream };
vm.createContext(bac);

/* ---------- l'éditeur, s'il est construit : son chargeur et ses nets ---------- */
const BUNDLE = path.join(RACINE, "editeur-schematique", "dist", "schema.js");
let ED = null;
if (fs.existsSync(BUNDLE)) {
  try {
    require(path.join(RACINE, "commun", "test", "dom-stub.js")).install({
      panels: { palette: "Bibliothèque", props: "Propriétés", list: "Nomenclature & Nets" }, canvasId: "sheet" });
    global.BroadcastChannel = function () { this.postMessage = () => {}; this.close = () => {}; };
    const log = console.log, warn = console.warn;
    console.log = console.warn = () => {};
    (0, eval)(fs.readFileSync(BUNDLE, "utf8").replace(/^"use strict";/, "") +
      "\nglobalThis.__ED={loadDoc,docNets,S,textW,allPins,storeCurrent,netlistText};");
    console.log = log; console.warn = warn;
    ED = global.__ED;
    bac.textW = ED.textW;          // même largeur de texte que l'éditeur : mêmes broches de CI
  } catch (e) { console.log("éditeur (dist/schema.js) non chargé : " + e.message); ED = null; }
}
for (const f of ["commun/zip.js", "commun/composants-lib.js", "commun/kicad.js", "commun/kicad-pcb.js", "commun/kicad-sch.js"])
  vm.runInContext(lireF(f), bac, { filename: f });
const KICAD = vm.runInContext("KICAD", bac), KS = vm.runInContext("KICAD_SCH", bac);
const copie = o => JSON.parse(JSON.stringify(o));

let ko = 0;
function verifier(cond, message) { if (!cond) throw new Error(message); }
function essai(nom, fn) {
  try { const r = fn(); console.log("  ok  " + nom + (r ? " — " + r : "")); }
  catch (e) { ko++; console.log("  KO  " + nom + " → " + e.message); }
}

/* ---------- union-find ---------- */
function UF() {
  const p = new Map();
  const f = k => { if (!p.has(k)) p.set(k, k); let r = k; while (p.get(r) !== r) r = p.get(r); while (p.get(k) !== r) { const n = p.get(k); p.set(k, r); k = n; } return r; };
  return { f, u: (a, b) => { a = f(a); b = f(b); if (a !== b) p.set(a, b); } };
}
/* nœuds « N:repère:patte » → partition canonique (texte) */
function partition(uf, noeuds) {
  const g = new Map();
  for (const n of noeuds) { const r = uf.f(n); if (!g.has(r)) g.set(r, []); g.get(r).push(n.slice(2)); }
  return [...g.values()].map(l => l.sort().join(" ")).sort();
}
function comparer(a, b, quoi) {
  const grp = l => { const m = new Map(); for (const g of l) for (const n of g.split(" ")) m.set(n, g); return m; };
  const ga = grp(a), gb = grp(b);
  for (const n of new Set([...ga.keys(), ...gb.keys()]))
    if (ga.get(n) !== gb.get(n)) throw new Error(quoi + " : " + n + " dans [" + String(ga.get(n)).slice(0, 80) + "] contre [" + String(gb.get(n)).slice(0, 80) + "]");
}

/* ---------- vérificateur « éditeur » : sur le document, sans rien normaliser ---------- */
const BROCHES = {   // ceux dont le banc a besoin, recopiés de 02-bibliotheque.js
  vcc: [[0, 20]], gnd: [[0, -20]], port: [[20, 0]], gport: [[20, 0]], annot_volt: [[0, 20]], annot_text: [], annot_note: [], annot_curr: [],
  resistor: [[-40, 0], [40, 0]], capacitor: [[-40, 0], [40, 0]], opamp: [[-40, -20], [-40, 20], [60, 0], [0, -40], [0, 40]]
};
const SANS_REP = new Set(["vcc", "gnd", "port", "gport", "annot_volt", "annot_text", "annot_note", "annot_curr"]);
const NOM = { gnd: [1, "GND"], vcc: [1, "VCC"], gport: [1, "NET"], port: [0, "NET"] };
const CS = { 0: [1, 0], 90: [0, 1], 180: [-1, 0], 270: [0, -1] };
function brochesComp(c, doc) {
  const s = doc.symboles && doc.symboles[c.type];
  const loc = s ? s.pins.slice().sort((a, b) => a.n - b.n).map(p => [p.x, p.y]) : BROCHES[c.type];
  if (!loc) throw new Error("type inconnu du banc : " + c.type);
  const sc = CS[c.rot || 0];
  return loc.map(([x, y]) => { if (c.mir) x = -x; return [c.x + x * sc[0] - y * sc[1], c.y + x * sc[1] + y * sc[0]]; });
}
function dedans(p, w) {
  if ((p[0] === w.x1 && p[1] === w.y1) || (p[0] === w.x2 && p[1] === w.y2)) return false;
  const dx = w.x2 - w.x1, dy = w.y2 - w.y1;
  if ((p[0] - w.x1) * dy - (p[1] - w.y1) * dx !== 0) return false;
  const t = (p[0] - w.x1) * dx + (p[1] - w.y1) * dy;
  return t > 0 && t < dx * dx + dy * dy;
}
/* commeChargeur : la table broche → patte telle que normComp la garde (1024 broches, numéros [A-Za-z0-9]) */
function partitionDoc(doc, commeChargeur) {
  const uf = UF(), noeuds = new Set();
  doc.pages.forEach((p, ip) => {
    if (p.isHierarchy) return;
    const K = (x, y) => ip + ":" + x + "," + y, fils = p.wires.filter(w => !w.bus);
    for (const w of fils) uf.u(K(w.x1, w.y1), K(w.x2, w.y2));
    for (const w of fils) for (const e of [[w.x1, w.y1], [w.x2, w.y2]])
      for (const v of fils) if (dedans(e, v)) uf.u(K(e[0], e[1]), K(v.x1, v.y1));
    for (const c of p.comps) brochesComp(c, doc).forEach((b, i) => {
      const k = K(b[0], b[1]);
      uf.f(k);
      for (const v of fils) if (dedans(b, v)) uf.u(k, K(v.x1, v.y1));
      const nm = NOM[c.type];
      if (nm) {
        const n = (String(c.value || "").trim() || nm[1]).toUpperCase();
        uf.u(k, ip + "|" + n);
        if (nm[0]) uf.u(ip + "|" + n, "G|" + n);
      } else if (!SANS_REP.has(c.type)) {
        const pm = Array.isArray(c.pinMap) && (!commeChargeur || (c.pinMap.length <= 1024 && c.pinMap.some(v => /^[A-Za-z0-9]{1,8}(\/[A-Za-z0-9]{1,8}){0,7}$/.test(v)))) ? c.pinMap : null;
        const pads = pm && pm[i] && (!commeChargeur || /^[A-Za-z0-9]{1,8}(\/[A-Za-z0-9]{1,8}){0,7}$/.test(pm[i])) ? String(pm[i]).split("/") : [String(i + 1)];
        for (const pad of pads) { const n = "N:" + (c.ref || "?") + ":" + pad; noeuds.add(n); uf.u(k, n); }
      }
    });
    for (const w of fils) if (w.net && !/^N\$\d+$/i.test(w.net)) uf.u(K(w.x1, w.y1), ip + "|" + String(w.net).trim().toUpperCase());
  });
  return partition(uf, noeuds);
}

/* ---------- vérificateur « KiCad » : directement sur les arbres, transformée de KiCad ---------- */
const enf = (l, n) => (l || []).filter(e => Array.isArray(e) && e[0] === n);
const un = (l, n) => (l || []).find(e => Array.isArray(e) && e[0] === n);
const v1 = (l, n, d) => { const e = un(l, n); return e && e.length > 1 ? e[1] : d; };
const pr = (n, k) => { const e = enf(n, "property").find(x => x[1] === k); return e ? String(e[2]) : ""; };
/* SCH_SYMBOL::SetOrientation : départ (1,0,0,-1), puis rotations, puis miroir ; T ← temp·T */
function matrice(A, miroir) {
  let m = [1, 0, 0, -1];
  const app = t => { m = [t[0] * m[0] + t[1] * m[2], t[0] * m[1] + t[1] * m[3], t[2] * m[0] + t[3] * m[2], t[2] * m[1] + t[3] * m[3]]; };
  const a = ((Math.round(+A / 90) % 4) + 4) % 4;
  if (a === 3) app([0, -1, 1, 0]); else for (let i = 0; i < a; i++) app([0, 1, -1, 0]);
  if (miroir === "x") app([1, 0, 0, -1]);
  if (miroir === "y") app([-1, 0, 0, 1]);
  return m;
}
/* membres d'un bus selon KiCad : vecteur apparié par indice, groupe par nom de membre, alias développés */
let ALIAS = new Map();
function membresBus(nom, prof = 0) {
  const v = /^(.*)\[(\d+)\.\.(\d+)\]$/.exec(nom), out = [];
  if (v) { for (let i = Math.min(+v[2], +v[3]); i <= Math.max(+v[2], +v[3]); i++) out.push(["#" + i, v[1] + i]); return out; }
  const g = /^(.*?)\{(.*)\}$/.exec(nom);
  const l = g && !g[1].endsWith("~") ? g[2].split(/[\s,]+/).filter(Boolean) : ALIAS.get(nom);
  if (!l || prof > 4) return out;
  for (const m of l) {
    const p = g && g[1] ? g[1] + "." : "";
    if (ALIAS.has(m)) membresBus(m, prof + 1).forEach(([k, n]) => out.push([k, p + n]));
    else if (/\[\d+\.\.\d+\]$/.test(m)) membresBus(m, prof + 1).forEach(([k, n]) => out.push([m + k, p + n]));
    else out.push([m, p + m]);
  }
  return out;
}
const ech = s => String(s).replace(/\{slash\}/g, "/");      // « {slash} » : le « / » échappé d'un nom de net
function partitionKicad(fichiers, racine, diag = {}) {
  ALIAS = new Map();
  for (const a of fichiers.values()) for (const b of enf(a, "bus_alias")) ALIAS.set(String(b[1]), (un(b, "members") || []).slice(1).map(String));
  const uf = UF(), noeuds = new Set(), dossier = racine.replace(/[^/]*$/, "");
  diag.broches = 0; diag.posees = 0; diag.tSansJonction = 0;
  const a0 = fichiers.get(racine);
  let n = 0;
  function feuille(a, chem, prof) {
    if (++n > 200 || prof > 50) return;
    const libs = new Map(enf(un(a, "lib_symbols"), "symbol").map(s => [s[1], s]));
    const K = (x, y) => chem + "@" + Math.round(+x * 1e4) + "," + Math.round(+y * 1e4);
    const segs = [];
    for (const w of enf(a, "wire")) {
      const pts = enf(un(w, "pts"), "xy");
      for (let i = 1; i < pts.length; i++) { const s = [+pts[i - 1][1], +pts[i - 1][2], +pts[i][1], +pts[i][2]]; segs.push(s); uf.u(K(s[0], s[1]), K(s[2], s[3])); }
    }
    const sur = (x, y, s, bords) => {
      const dx = s[2] - s[0], dy = s[3] - s[1];
      if (Math.abs((x - s[0]) * dy - (y - s[1]) * dx) > 1e-6) return false;
      const t = (x - s[0]) * dx + (y - s[1]) * dy, L = dx * dx + dy * dy;
      return bords ? t >= -1e-9 && t <= L + 1e-9 : t > 1e-9 && t < L - 1e-9;
    };
    const relier = (x, y) => { for (const s of segs) if (sur(x, y, s, true)) uf.u(K(x, y), K(s[0], s[1])); };
    const jonctions = new Set();
    for (const j of enf(a, "junction")) { const p = un(j, "at"); jonctions.add(K(p[1], p[2])); relier(+p[1], +p[2]); }
    // extrémité de fil au milieu d'un autre : KiCad coupe le fil à cet endroit (BreakSegments)
    for (const s of segs) for (const [x, y] of [[s[0], s[1]], [s[2], s[3]]]) for (const t of segs)
      if (sur(x, y, t, false)) { uf.u(K(x, y), K(t[0], t[1])); if (!jonctions.has(K(x, y))) diag.tSansJonction++; }
    const points = new Set([...jonctions]);
    for (const s of segs) { points.add(K(s[0], s[1])); points.add(K(s[2], s[3])); }
    // bus : pilote du sous-graphe (globale > locale > hiérarchique > broche de feuille), ponts vers les autres feuilles
    const bsegs = [];
    for (const w of enf(a, "bus")) { const pts = enf(un(w, "pts"), "xy"); for (let i = 1; i < pts.length; i++) bsegs.push([+pts[i - 1][1], +pts[i - 1][2], +pts[i][1], +pts[i][2]]); }
    const gb = bsegs.map((_, i) => i), rb = i => { while (gb[i] !== i) i = gb[i]; return i; };
    bsegs.forEach((s, i) => bsegs.forEach((t, j) => { if (j > i && (sur(s[0], s[1], t, true) || sur(s[2], s[3], t, true) || sur(t[0], t[1], s, true) || sur(t[2], t[3], s, true))) gb[rb(i)] = rb(j); }));
    const gBus = new Map();
    const noterBus = (x, y, nom, rang, pont) => {
      if (segs.some(s => sur(x, y, s, true))) return;
      const i = bsegs.findIndex(s => sur(x, y, s, true));
      if (i < 0) return;
      const r = rb(i), g = gBus.get(r) || { pilote: "", rang: -1, ponts: [] };
      gBus.set(r, g);
      if (rang > g.rang) { g.rang = rang; g.pilote = String(nom); }
      if (pont) g.ponts.push(pont);
    };
    for (const t of ["label", "global_label", "hierarchical_label"]) for (const e of enf(a, t)) {
      const p = un(e, "at"), k = K(p[1], p[2]);
      noterBus(+p[1], +p[2], e[1], { label: 2, global_label: 3, hierarchical_label: 1 }[t], t === "label" ? null : t === "global_label" ? "G|" + e[1] : chem + "|H|" + e[1]);
      relier(+p[1], +p[2]); points.add(k);
      // KiCad fusionne les nets de même nom complet : étiquette locale et hiérarchique d'une feuille donnent « /feuille/NOM »
      uf.u(k, t === "global_label" ? "G|" + ech(e[1]) : chem + "|L|" + ech(e[1]));
    }
    for (const e of enf(a, "no_connect")) { const p = un(e, "at"); points.add(K(p[1], p[2])); }
    const filles = [];
    for (const sh of enf(a, "sheet")) {
      const fille = chem + "/" + v1(sh, "uuid");
      for (const p of enf(sh, "pin")) {
        const q = un(p, "at");
        relier(+q[1], +q[2]); points.add(K(q[1], q[2])); uf.u(K(q[1], q[2]), fille + "|L|" + ech(p[1]));
        noterBus(+q[1], +q[2], p[1], 0, fille + "|H|" + p[1]);
      }
      filles.push([sh, fille]);
    }
    for (const g of gBus.values()) for (const pont of g.ponts) for (const [k, net] of membresBus(g.pilote)) uf.u(chem + "|L|" + net, "B|" + pont + "#" + k);
    const brochesPosees = [];
    for (const s of enf(a, "symbol")) {
      const lib = libs.get(v1(s, "lib_name", v1(s, "lib_id")));
      if (!lib) continue;
      let ref = pr(s, "Reference"), unit = +v1(s, "unit", 1);
      for (const pj of enf(un(s, "instances"), "project")) for (const p of enf(pj, "path"))
        if (p[1] === chem) { ref = String(v1(p, "reference", ref)); unit = +v1(p, "unit", unit); }
      const style = +v1(s, "body_style", v1(s, "convert", 1)), at = un(s, "at"), m = matrice(at[3] || 0, v1(s, "mirror"));
      const power = !!un(lib, "power");
      for (const sub of enf(lib, "symbol")) {
        const mt = /_(\d+)_(\d+)$/.exec(sub[1]);
        if (!mt || (+mt[1] && +mt[1] !== unit) || (+mt[2] && +mt[2] !== style)) continue;
        for (const pin of enf(sub, "pin")) {
          const q = un(pin, "at"), x = +at[1] + m[0] * q[1] + m[1] * q[2], y = +at[2] + m[2] * q[1] + m[3] * q[2], k = K(x, y);
          uf.f(k);
          const cachee = pin.includes("hide") || v1(pin, "hide") === "yes";
          if (power) { if (pin[1] === "power_in") uf.u(k, "G|" + pr(s, "Value")); }
          else {
            if (cachee && pin[1] === "power_in") uf.u(k, "G|" + v1(pin, "name"));
            if (!ref.startsWith("#")) { const nd = "N:" + ref + ":" + v1(pin, "number"); noeuds.add(nd); uf.u(k, nd); }
            brochesPosees.push(k);
          }
        }
      }
    }
    const comptes = new Map();
    for (const k of brochesPosees) comptes.set(k, (comptes.get(k) || 0) + 1);
    for (const k of brochesPosees) { diag.broches++; if (points.has(k) || comptes.get(k) > 1) diag.posees++; }
    for (const [sh, fille] of filles) {
      const f = pr(sh, "Sheetfile"), segs2 = [];
      for (const s of (dossier + f).split("/")) { if (s === "..") segs2.pop(); else if (s && s !== ".") segs2.push(s); }
      const af = fichiers.get(segs2.join("/"));
      if (af) feuille(af, fille, prof + 1);
    }
  }
  feuille(a0, "/" + v1(a0, "uuid"), 0);
  return partition(uf, noeuds);
}

/* ---------- outils ---------- */
const lireTextes = textes => new Map(Object.entries(textes).map(([n, t]) => [n, KICAD.lire(t, "kicad_sch")]));
function allerRetour(doc, partDoc) {
  const rap = KICAD.rapport();
  const ex = KS.ecrire(copie(doc), "essai", "essai_lib", rap, null);
  const m = lireTextes(Object.fromEntries(ex.fichiers.map(f => [f.nom, f.texte])));
  comparer(partitionKicad(m, "essai.kicad_sch"), partDoc, "export vu par KiCad");
  const re = KS.lire(m, "essai.kicad_sch", KICAD.rapport());
  comparer(partitionDoc(re.doc), partDoc, "export relu");
  KICAD.lire(ex.bibliotheque, "kicad_sym");
  return ex;
}
/* le vrai chargeur : rien ne bouge, mêmes nets que le vérificateur */
function chargeur(doc, partDoc) {
  if (!ED) return "";
  ED.loadDoc(copie(doc));
  ED.storeCurrent();
  const S = ED.S;
  doc.pages.forEach((p, i) => p.comps.forEach((c, j) => {
    const d = S.pages[i].comps[j];
    if (!d || d.type !== c.type || d.x !== c.x || d.y !== c.y) throw new Error("chargeur : " + (c.ref || c.type) + " a bougé ou disparu (page " + i + ")");
  }));
  const uf = UF(), noeuds = new Set();
  S.pages.forEach(p => p.comps.forEach(c => {
    if (!SANS_REP.has(c.type)) brochesComp(c, doc).forEach((_, i) => {
      for (const pad of Array.isArray(c.pinMap) && c.pinMap[i] ? c.pinMap[i].split("/") : [String(i + 1)]) noeuds.add("N:" + c.ref + ":" + pad);
    });
  }));
  for (const g of ED.docNets().groups) { const ns = g.nodes.map(n => "N:" + n.ref + ":" + n.pad); ns.forEach(n => { noeuds.add(n); uf.u(n, ns[0]); }); }
  comparer(partition(uf, noeuds), partitionDoc(doc, true), "chargeur de l'éditeur");
  return ", chargeur ok";
}

/* ======================================================================
   1. petits schémas
   ====================================================================== */
console.log("— schémas d'essai —");
const eff = '(effects (font (size 1.27 1.27)))';
const LIB_R = `(symbol "Device:R" (property "Reference" "R" (at 0 0 0)${eff}) (property "Value" "R" (at 0 0 0)${eff})
  (symbol "R_0_1" (rectangle (start -1.016 -2.54) (end 1.016 2.54) (stroke (width 0.254)) (fill (type none))))
  (symbol "R_1_1" (pin passive line (at 0 3.81 270) (length 1.27) (name "~" ${eff}) (number "1" ${eff}))
                  (pin passive line (at 0 -3.81 90) (length 1.27) (name "~" ${eff}) (number "2" ${eff}))))`;
const LIB_GND = `(symbol "power:GND" (power) (property "Reference" "#PWR" (at 0 0 0)${eff}) (property "Value" "GND" (at 0 0 0)${eff})
  (symbol "GND_0_1" (polyline (pts (xy 0 0) (xy 0 -1.27)) (stroke (width 0)) (fill (type none))))
  (symbol "GND_1_1" (pin power_in line (at 0 0 270) (length 0) (hide yes) (name "GND" ${eff}) (number "1" ${eff}))))`;
const inst = (chem, ref) => `(instances (project "t" (path "${chem}" (reference "${ref}") (unit 1))))`;
const fil = (a, b, c, d) => `(wire (pts (xy ${a} ${b}) (xy ${c} ${d})))`;
const RU = "00000000-0000-0000-0000-000000000001";

essai("symbole tourné de 90° et en miroir X, hors grille : broches au bout des fils", () => {
  // R1 en (102.87, 50.8), 90° + miroir x : broche 1 en (99.06, 50.8), broche 2 en (106.68, 50.8)
  const t = `(kicad_sch (version 20250114) (uuid "${RU}") (paper "A4") (lib_symbols ${LIB_R} ${LIB_GND})
    (symbol (lib_id "Device:R") (at 102.87 50.8 90) (mirror x) (unit 1) (uuid "u-r1") (property "Reference" "R1" (at 0 0 0)) (property "Value" "10k" (at 0 0 0)) ${inst("/" + RU, "R1")})
    (symbol (lib_id "power:GND") (at 93.98 55.88 0) (unit 1) (uuid "u-g") (property "Reference" "#PWR1" (at 0 0 0)) (property "Value" "GND" (at 0 0 0)) ${inst("/" + RU, "#PWR1")})
    ${fil(93.98, 50.8, 99.06, 50.8)} ${fil(93.98, 50.8, 93.98, 55.88)} ${fil(106.68, 50.8, 111.76, 50.8)} ${fil(100.33, 40.64, 100.33, 35.56)}
    (label "A" (at 111.76 50.8 0) ${eff})
    (global_label "VBUS" (shape input) (at 100.33 40.64 0) ${eff})
    (no_connect (at 1 1)))`;
  const rap = KICAD.rapport(), { doc, symboles } = KS.lire(lireTextes({ "t.kicad_sch": t }), "t.kicad_sch", rap);
  const p = doc.pages[1], r1 = p.comps.find(c => c.ref === "R1");
  verifier(doc.pages.length === 2 && doc.pages[0].isHierarchy, "une page Hiérarchie puis la feuille");
  verifier(r1.x === 820 && r1.y === 400 && r1.rot === 270 && r1.mir === true, "R1 en (820,400), rot 270, miroir : " + JSON.stringify([r1.x, r1.y, r1.rot, r1.mir]));
  const b = brochesComp(r1, doc);
  verifier(JSON.stringify(b) === "[[780,400],[840,400]]", "broches de R1 en (780,400) et (840,400) : " + JSON.stringify(b));
  verifier(p.wires.some(w => w.x2 === 780 && w.y2 === 400) && p.wires.some(w => w.x1 === 840 && w.y1 === 400), "les fils y aboutissent");
  verifier(symboles.length === 1 && symboles[0].id === "R_d0_-10", "variante décalée du symbole : " + symboles.map(s => s.id));
  const g = p.comps.find(c => c.type === "gnd");
  verifier(g && g.x === 740 && g.y === 460 && g.rot === 0 && g.value === "GND", "GND : broche en (740,440) : " + JSON.stringify(g));
  const a = p.comps.find(c => c.type === "port");
  verifier(a && a.x === 900 && a.y === 400 && a.rot === 180 && a.value === "A", "étiquette A, broche en (880,400) : " + JSON.stringify(a));
  const vb = p.comps.find(c => c.type === "gport");
  const pv = brochesComp(vb, doc)[0];
  verifier(vb.value === "VBUS" && pv[0] % 20 === 0 && pv[1] % 20 === 0 && p.wires.some(w => w.x1 === pv[0] && w.y1 === pv[1] && w.x2 === 790 && w.y2 === 320),
           "VBUS hors grille : étiquette sur la grille et petit fil jusqu'à (790,320)");
  verifier(rap.liste().some(m => /no_connect/.test(m)), "non-connexion signalée au rapport");
  const part = partitionDoc(doc);
  comparer(part, ["R1:1", "R1:2"], "partition");
  comparer(partitionKicad(lireTextes({ "t.kicad_sch": t }), "t.kicad_sch"), part, "vérificateur KiCad");
  allerRetour(doc, part);
  return chargeur(doc, part).slice(2) || "chargeur non construit";
});

essai("hiérarchie à deux niveaux, feuille posée deux fois, étiquettes hiérarchiques", () => {
  const F1 = "00000000-0000-0000-0000-0000000000a1", F2 = "00000000-0000-0000-0000-0000000000a2";
  const feuilleSub = (u, x, nom) => `(sheet (at ${x} 25.4) (size 25.4 25.4) (uuid "${u}") (property "Sheetname" "${nom}" (at 0 0 0)) (property "Sheetfile" "sous/sub.kicad_sch" (at 0 0 0))
      (pin "IN" input (at ${x} 30.48 180) ${eff}))`;
  const racine = `(kicad_sch (version 20250114) (uuid "${RU}") (paper "A4") (lib_symbols ${LIB_R})
    (symbol (lib_id "Device:R") (at 25.4 30.48 90) (unit 1) (uuid "u-r1") (property "Reference" "R1" (at 0 0 0)) (property "Value" "1k" (at 0 0 0)) ${inst("/" + RU, "R1")})
    ${fil(29.21, 30.48, 50.8, 30.48)} ${fil(29.21, 30.48, 29.21, 40.64)} ${fil(29.21, 40.64, 101.6, 40.64)} ${fil(101.6, 40.64, 101.6, 30.48)}
    (junction (at 29.21 30.48))
    (label "X" (at 21.59 30.48 180) ${eff})
    ${feuilleSub(F1, 50.8, "A")} ${feuilleSub(F2, 101.6, "B")})`;
  const sub = `(kicad_sch (version 20250114) (uuid "00000000-0000-0000-0000-0000000000b0") (paper "A4") (lib_symbols ${LIB_R})
    (symbol (lib_id "Device:R") (at 50.8 50.8 0) (unit 1) (uuid "u-r2") (property "Reference" "R?" (at 0 0 0)) (property "Value" "2k" (at 0 0 0))
      (instances (project "t" (path "/${RU}/${F1}" (reference "R2") (unit 1)) (path "/${RU}/${F2}" (reference "R3") (unit 1)))))
    ${fil(50.8, 46.99, 50.8, 43.18)} (hierarchical_label "IN" (shape input) (at 50.8 43.18 90) ${eff})
    (label "X" (at 50.8 54.61 0) ${eff}))`;
  const textes = { "proj/t.kicad_sch": racine, "proj/sous/sub.kicad_sch": sub };
  const rap = KICAD.rapport(), { doc } = KS.lire(lireTextes(textes), "proj/t.kicad_sch", rap);
  verifier(doc.pages.length === 4, "racine + deux instances : " + doc.pages.map(p => p.name).join(", "));
  const refs = doc.pages.slice(2).map(p => p.comps.find(c => c.ref).ref).join(",");
  verifier(refs === "R2,R3", "repères pris des instances : " + refs);
  verifier(doc.pages[2].comps.some(c => c.type === "gport" && c.value === "/A/IN"), "étiquette hiérarchique → globale préfixée /A/IN");
  const part = partitionDoc(doc);
  // R1:2, R2:1 et R3:1 reliés par IN ; les X locaux ne traversent pas les feuilles
  comparer(part, ["R1:1", "R1:2 R2:1 R3:1", "R2:2", "R3:2"], "partition");
  comparer(partitionKicad(lireTextes(textes), "proj/t.kicad_sch"), part, "vérificateur KiCad");
  allerRetour(doc, part);
  return chargeur(doc, part).slice(2) || "chargeur non construit";
});

essai("export d'un document de l'éditeur : intégrés, parties, alimentations, étiquettes", () => {
  const C = (id, type, x, y, rot, o) => Object.assign({ id, type, x, y, rot, mir: false, ref: "", value: "" }, o);
  const doc = { format: "schemedit-2", page: 1, symboles: {}, cartouche: { titre: "Essai", dessine: "RB" },
    pages: [{ name: "Hiérarchie", isHierarchy: true, comps: [], wires: [], drawings: [] },
      { name: "Feuille 1", uid: 20, comps: [
        C(1, "resistor", 200, 200, 90, { ref: "R1", value: "10k" }), C(2, "capacitor", 300, 200, 0, { ref: "C1", value: "100n" }),
        C(3, "vcc", 200, 140, 0, { value: "+5V" }), C(4, "gnd", 200, 280, 0, { value: "GND" }),
        C(5, "port", 400, 200, 0, { value: "SIG" }), C(6, "gport", 400, 300, 180, { value: "OUT" }),
        C(7, "opamp", 600, 200, 0, { ref: "U1", part: "A", pinMap: ["2", "3", "1", "8", "4"] }),
        C(8, "opamp", 600, 400, 0, { ref: "U1", part: "B", pinMap: ["6", "5", "7", "8", "4"] }),
        C(9, "annot_text", 100, 100, 0, { value: "Note|ligne 2" })],
      wires: [{ x1: 200, y1: 240, x2: 260, y2: 240 }, { x1: 260, y1: 240, x2: 260, y2: 200 }, { x1: 340, y1: 200, x2: 420, y2: 200 },
              { x1: 380, y1: 200, x2: 380, y2: 300 }, { x1: 380, y1: 300, x2: 420, y2: 300, net: "N7" },
              { x1: 560, y1: 180, x2: 500, y2: 180, net: "INV" }, { x1: 560, y1: 380, x2: 500, y2: 380, net: "INV" },
              { x1: 600, y1: 160, x2: 600, y2: 120 }, { x1: 600, y1: 360, x2: 600, y2: 320 }],
      drawings: [{ id: 30, shape: "rect", x1: 80, y1: 80, x2: 700, y2: 460, style: "dashed", label: "Étage" }] },
      { name: "Feuille 2", uid: 20, comps: [C(1, "gport", 200, 200, 0, { value: "OUT" }), C(2, "resistor", 260, 200, 0, { ref: "R2" }),
                                             C(3, "vcc", 600, 120, 0, { value: "+5V" })],
        wires: [{ x1: 300, y1: 200, x2: 600, y2: 200 }, { x1: 600, y1: 200, x2: 600, y2: 140 }], drawings: [] }]};
  const part = partitionDoc(doc);
  comparer(part, ["C1:1 R1:2", "C1:2 R2:1", "R1:1 R2:2", "U1:1", "U1:2 U1:6", "U1:3", "U1:4", "U1:5", "U1:7", "U1:8"], "partition du document");
  const ex = allerRetour(doc, part);
  verifier(ex.fichiers.length === 3 && ex.fichiers[0].nom === "essai.kicad_sch", "racine + une feuille par page : " + ex.fichiers.map(f => f.nom).join(", "));
  const racineT = ex.fichiers[0].texte, f1 = ex.fichiers[1].texte;
  verifier(racineT.includes('(uuid "' + KICAD.uuid("feuille:20") + '")') && racineT.includes('(uuid "' + KICAD.uuid("feuille:20:1") + '")'),
           "uuid de feuille : feuille:<uid>, distinct si deux pages ont le même compteur");
  verifier(f1.includes('(uuid "' + KICAD.uuid("symbole:20:1") + '")') && ex.chemins.get("R1") === "/" + KICAD.uuid("feuille:20") + "/" + KICAD.uuid("symbole:20:1"),   // la carte omet la racine
           "uuid de symbole et chemin pour le PCB");
  verifier(/\(power\)/.test(f1) && /global_label "OUT"/.test(f1) && /label "SIG"/.test(f1) && /\(junction/.test(f1) && /title_block/.test(racineT), "alimentation, étiquettes, jonction, cartouche");
  verifier(/\(symbol "opamp"[\s\S]*\(symbol "opamp_2_1"/.test(ex.bibliotheque), "AOP double : un symbole à deux unités dans la bibliothèque");
  return chargeur(doc, part).slice(2) || "chargeur non construit";
});

/* ======================================================================
   2. projets de démonstration
   ====================================================================== */
const DEMOS = process.argv[2] || path.join(os.homedir(), "kicad-essais", "src", "demos");
let cli = null;
try { execFileSync("kicad-cli", ["version"], { stdio: "pipe" }); cli = "kicad-cli"; } catch (_) {}
function projets(d, prof = 0) {
  const out = [];
  if (prof > 4) return out;
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) out.push(...projets(p, prof + 1));
    else if (e.name.endsWith(".kicad_pro") && fs.existsSync(p.replace(/\.kicad_pro$/, ".kicad_sch"))) out.push(p);
  }
  return out;
}
function schemasSous(d, base = d, out = new Map(), prof = 0) {
  if (prof > 4) return out;
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) schemasSous(p, base, out, prof + 1);
    else if (e.name.endsWith(".kicad_sch")) out.set(path.relative(base, p).split(path.sep).join("/"), KICAD.lire(fs.readFileSync(p, "utf8"), "kicad_sch"));
  }
  return out;
}
function netlistCli(racine) {
  const sortie = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "kcli-")), "n.net");
  execFileSync(cli, ["sch", "export", "netlist", "--format", "kicadsexpr", "-o", sortie, racine], { stdio: "pipe" });
  const a = KICAD.lire(fs.readFileSync(sortie, "utf8"), "net"), uf = UF(), noeuds = new Set();
  for (const n of enf(un(a, "nets"), "net")) {
    const ns = enf(n, "node").map(x => "N:" + v1(x, "ref") + ":" + v1(x, "pin")).filter(x => !x.startsWith("N:#"));
    ns.forEach(x => { noeuds.add(x); uf.u(x, ns[0]); });
  }
  return partition(uf, noeuds);
}
if (fs.existsSync(DEMOS)) {
  console.log("— démos KiCad (" + DEMOS + ") —");
  for (const pro of projets(DEMOS)) {
    const dir = path.dirname(pro), racine = path.basename(pro).replace(/\.kicad_pro$/, ".kicad_sch");
    essai(path.relative(DEMOS, pro).replace(/\.kicad_pro$/, ""), () => {
      const fichiers = schemasSous(dir), rap = KICAD.rapport(), diag = {};
      const { doc } = KS.lire(fichiers, racine, rap);
      const pk = partitionKicad(fichiers, racine, diag), pd = partitionDoc(doc);
      comparer(pd, pk, "lecture");
      const ex = allerRetour(doc, pd);
      let fin = chargeur(doc, pd);
      if (cli) {
        const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "kexp-"));
        for (const f of ex.fichiers) fs.writeFileSync(path.join(tmp, f.nom), f.texte);
        comparer(netlistCli(path.join(tmp, "essai.kicad_sch")), netlistCli(path.join(dir, racine)), "kicad-cli export/original");
        comparer(netlistCli(path.join(dir, racine)), pk, "kicad-cli/vérificateur");
        fin += ", kicad-cli ok";
      }
      const nets = pk.filter(g => g.includes(" ")).length;
      return (doc.pages.length - 1) + " p., " + doc.pages.reduce((n, p) => n + p.comps.filter(c => c.ref).length, 0) + " comp., " + nets + " nets, aller-retour ok" + fin +
        ", broches posées " + diag.posees + "/" + diag.broches + (diag.tSansJonction ? ", T sans jonction " + diag.tSansJonction : "") +
        (rap.liste().length ? " | écarts : " + rap.liste().length : "");
    });
  }
} else console.log("dossier de démos absent : " + DEMOS);

/* ======================================================================
   4. importer le projet entier, puis l'ECO du PCB entre schéma et carte importés :
   la netlist du vrai éditeur de schéma, la comparaison du vrai éditeur PCB
   ====================================================================== */
/* écarts des démos qui ne tiennent pas aux nets : projet KiCad où schéma et carte divergent
   (empreintes « board_only », valeur changée d'un côté), ou trou de fixation au symbole muni d'une
   broche dont l'empreinte sans cuivre est retirée par la lecture de la carte */
const CONNUS = { "custom_pads_test/custom_pads_test": "suppressions 1", "multichannel/multichannel_mixer": "valeurs 1",
                 "tiny_tapeout/tinytapeout-demo": "suppressions 152" };
(async () => {
  const lots = [];
  if (ED && fs.existsSync(DEMOS) && fs.existsSync(path.join(RACINE, "editeur-pcb", "dist", "pcb.js"))) {
    console.log("— ECO après import (" + "éditeurs réels) —");
    for (const pro of projets(DEMOS)) {
      if (!fs.existsSync(pro.replace(/\.kicad_pro$/, ".kicad_pcb"))) continue;
      const dir = path.dirname(pro), nom = path.relative(DEMOS, pro).replace(/\.kicad_pro$/, ""), fichiers = [];
      (function tous(d, prof) {
        for (const e of fs.readdirSync(d, { withFileTypes: true })) {
          const p = path.join(d, e.name);
          if (e.isDirectory() && prof < 4 && !/-backups$/.test(e.name)) tous(p, prof + 1);
          else if (/\.kicad_(pro|sch|pcb)$/.test(e.name)) fichiers.push({ name: "p/" + path.relative(dir, p).split(path.sep).join("/"), text: fs.readFileSync(p, "utf8") });
        }
      })(dir, 0);
      try {
        const imp = await KICAD.importer(vm.runInContext("zipOctets", bac)(fichiers));
        ED.loadDoc(copie(imp.schema));
        lots.push({ nom, pcb: imp.pcb, schema: imp.schema, netlist: ED.netlistText("banc") });
      } catch (e) {
        if (/dépasse 64 Mo/.test(e.message)) console.log("  ok  " + nom + " — carte de plus de 64 Mo, refusée par l'import : ECO sauté");
        else { ko++; console.log("  KO  " + nom + " → import : " + e.message); }
      }
    }
    const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "eco-")), "lots.json");
    fs.writeFileSync(f, JSON.stringify(lots));
    for (const r of JSON.parse(execFileSync(process.execPath, [__filename, "--eco", f], { maxBuffer: 1 << 26 }).toString())) {
      if (!r.total) { console.log("  ok  " + r.nom + " — aucune disparité"); continue; }
      if (CONNUS[r.nom] === r.detail) { console.log("  ok  " + r.nom + " — " + r.detail + " : écart connu, hors des nets"); continue; }
      ko++;
      console.log("  KO  " + r.nom + " → " + r.total + " disparités (" + r.detail + ") ex. " + r.ex.join(" | "));
    }
  } else console.log("éditeurs non construits (dist/schema.js, dist/pcb.js) : ECO non éprouvé");
  if (!cli) console.log("kicad-cli absent : contrôle sauté");
  if (!ED) console.log("éditeur non construit (editeur-schematique/dist/schema.js) : chargeur non éprouvé");
  console.log(ko ? ko + " essai(s) en échec" : "tout est bon");
  process.exit(ko ? 1 : 0);
})();
