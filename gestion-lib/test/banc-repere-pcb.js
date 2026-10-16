// Verifie que la Gestion LIB dessine et genere les empreintes dans le repere
// de l'editeur PCB et de la LIB : vue de dessus, y vers le bas, broche 1 en
// haut a gauche. En y vers le haut, une empreinte de la LIB s'affichait en
// miroir et une empreinte generee ici arrivait en miroir sur la carte.
const fs = require("fs"), vm = require("vm"), path = require("path"), assert = require("assert");
const R = path.join(__dirname, "..", "js");

// 1. Moteur de rendu : y monde croissant = vers le bas de l'ecran, aller-retour exact
const appels = [];
const ctx = new Proxy({}, { get: (_, k) => k === "translate" ? (x, y) => appels.push([x, y]) : () => {} });
const canvas = { clientWidth: 300, clientHeight: 200, width: 0, height: 0, getContext: () => ctx,
  addEventListener: () => {}, getBoundingClientRect: () => ({ left: 0, top: 0 }) };
const c = { window: { devicePixelRatio: 1 }, Math };
vm.createContext(c);
vm.runInContext(fs.readFileSync(path.join(R, "02-rendu-pcb.js"), "utf8"), c);
const r = new c.window.PcbRenderer(canvas);
r.zoom = 10; r.panX = 150; r.panY = 100;
assert.ok(r.worldToScreen(0, 1).y > r.worldToScreen(0, 0).y, "y monde positif doit descendre a l'ecran");
const s = r.worldToScreen(-2.7, -1.905), w = r.screenToWorld(s.x, s.y);
assert.ok(Math.abs(w.x + 2.7) < 1e-9 && Math.abs(w.y + 1.905) < 1e-9, "aller-retour ecran/monde");
r.fp = { pads: [{ n: 1, x: -2.7, y: -1.905, w: 1.5, h: 0.6, shape: "rect", drill: 0 }] };
appels.length = 0; r._drawPads(ctx);
assert.ok(appels[0][1] < 0, "la broche 1 (y = -1,905) doit etre dessinee au-dessus de l'axe");

// 2. Generateurs : broche 1 en haut a gauche, rangee droite remontant depuis le bas
const src = fs.readFileSync(path.join(R, "05-editeur-lib.js"), "utf8");
for (const nom of ["editeurGenererSoic", "editeurGenererDip"]) {
  const g = { EDITEUR_LIB: { data: {} }, document: { getElementById: () => null } };
  for (const f of ["editeurHistoriquePush", "editeurAjusterCorpsAuto", "remplirFormulaireEditeur", "basculerSousOngletEditeur"]) g[f] = () => {};
  vm.createContext(g);
  vm.runInContext(src.match(new RegExp("function " + nom + "\\(\\)[\\s\\S]*?\\n}\\n"))[0] + "\n" + nom + "();", g);
  const p = g.EDITEUR_LIB.data.pads, n = p.length, b = k => p.find(q => q.n === k);
  assert.ok(b(1).x < 0 && b(1).y < 0, nom + " : broche 1 en haut a gauche");
  assert.ok(b(n / 2).y > 0 && b(n / 2 + 1).x > 0 && b(n / 2 + 1).y > 0 && b(n).y < 0,
    nom + " : sens antihoraire vu de dessus");
}
// 3. Trous NPTH : dessinés dans le même repère, posés au clic par l'outil Trou
const arcs = [];
const ctx2 = new Proxy({}, { get: (_, k) => k === "arc" ? (x, y, rr) => arcs.push([x, y, rr]) : () => {}, set: () => true });
r.fp = { pads: [], holes: [{ x: 1, y: -2, d: 1.2 }] };
r._drawHoles(ctx2);
assert.ok(arcs.some(a => a[0] > 0 && a[1] < 0 && Math.abs(a[2] - 0.6 * r.zoom) < 1e-9), "trou en (1 ; -2) : a droite, au-dessus de l'axe");
const g = { EDITEUR_LIB: { actif: true, type: "pcb", outilActif: "trou", grilleMm: 0.05, data: { pads: [], holes: [{ x: 0, y: 0, d: 2.5 }] },
  renderer: { screenToWorld: () => ({ x: 1.03, y: -2.01 }), render: () => {} } } };
for (const f of ["editeurHistoriquePush", "remplirElementsEditeur"]) g[f] = () => {};
vm.createContext(g);
for (const nom of ["editeurSnap", "editeurPointerDown"])
  vm.runInContext(src.match(new RegExp("function " + nom + "\\([^)]*\\)[\\s\\S]*?\\n}\\n"))[0], g);
assert.ok(g.editeurPointerDown({ button: 0, clientX: 0, clientY: 0 }), "le clic de l'outil Trou est pris");
const t = g.EDITEUR_LIB.data.holes[1];
assert.ok(t && Math.abs(t.x - 1.05) < 1e-9 && Math.abs(t.y + 2) < 1e-9 && t.d === 2.5, "trou pose sur la grille, au diametre du precedent : " + JSON.stringify(t));
// 4. Un champ numerique ne recoit jamais une valeur du fichier telle quelle : un
// JSON (ou une reponse de l'assistant) qui porterait '"><img onerror=...>' dans x
// en ferait du HTML. Forcee en nombre (+) ou passee par n() de l'editeur.
const bruts = src.split("\n").filter(l => /type="number"/.test(l) && /value="\$\{(?!\+|n\()/.test(l));
assert.ok(!bruts.length, "valeur injectee brute dans un champ numerique :\n" + bruts.join("\n"));
console.log("ok repere y vers le bas");
