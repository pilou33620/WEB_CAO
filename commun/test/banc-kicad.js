"use strict";
/* =============================================================================
   commun/test/banc-kicad.js
   Banc du socle KiCad (commun/kicad.js) : lecture d'archive bornée, écriture
   des expressions S, identifiants stables, puis import → export → import d'un
   projet de bout en bout (démos KiCad si un dossier est donné ou présent).
   node commun/test/banc-kicad.js [dossier-des-démos]   → n'imprime qu'un bilan
   ============================================================================= */
const fs = require("fs");
const os = require("os");
const path = require("path");
const vm = require("vm");
const zlib = require("zlib");
const { execFileSync } = require("child_process");

const RACINE = path.join(__dirname, "..", "..");
let total = 0;
function verifier(cond, message) {
  total++;
  if (!cond) { console.error("ÉCHEC : " + message); process.exit(1); }
}
const bac = { console, TextEncoder, TextDecoder, Blob, DecompressionStream };
vm.createContext(bac);
for (const f of ["commun/zip.js", "commun/composants-lib.js", "commun/kicad.js", "commun/kicad-pcb.js", "commun/kicad-sch.js"])
  vm.runInContext(fs.readFileSync(path.join(RACINE, f), "utf8"), bac, { filename: f });
const K = vm.runInContext("KICAD", bac);
const zipOctets = vm.runInContext("zipOctets", bac);

/* archive à la main : une entrée dégonflée (méthode 8) dont la taille annoncée peut mentir */
function zipDeflate(nom, contenu, tailleAnnoncee) {
  const n = Buffer.from(nom), d = zlib.deflateRawSync(contenu), crc = vm.runInContext("crc32", bac)(contenu);
  const t = tailleAnnoncee == null ? contenu.length : tailleAnnoncee;
  const loc = Buffer.alloc(30); loc.writeUInt32LE(0x04034b50, 0); loc.writeUInt16LE(20, 4); loc.writeUInt16LE(8, 8);
  loc.writeUInt32LE(crc, 14); loc.writeUInt32LE(d.length, 18); loc.writeUInt32LE(t, 22); loc.writeUInt16LE(n.length, 26);
  const cen = Buffer.alloc(46); cen.writeUInt32LE(0x02014b50, 0); cen.writeUInt16LE(20, 4); cen.writeUInt16LE(20, 6);
  cen.writeUInt16LE(8, 10); cen.writeUInt32LE(crc, 16); cen.writeUInt32LE(d.length, 20); cen.writeUInt32LE(t, 24);
  cen.writeUInt16LE(n.length, 28);
  const corps = Buffer.concat([loc, n, d]);
  const fin = Buffer.alloc(22); fin.writeUInt32LE(0x06054b50, 0); fin.writeUInt16LE(1, 8); fin.writeUInt16LE(1, 10);
  fin.writeUInt32LE(46 + n.length, 12); fin.writeUInt32LE(corps.length, 16);
  return Buffer.concat([corps, cen, n, fin]);
}
/* Ce que KiCad relie dans l'export : le (path) de chaque empreinte désigne un symbole du
   schéma (sans l'uuid de la racine), et chaque broche de ce symbole a sa pastille. */
function liaisons(ex, d) {
  const E = (l, n) => l.filter(e => Array.isArray(e) && e[0] === n), E1 = (l, n) => E(l, n)[0];
  const symboles = new Map();                     // chemin → numéros de broches de son unité
  for (const f of ex.fichiers) if (f.name.endsWith(".kicad_sch")) {
    const a = K.lire(f.text, "kicad_sch");
    const libs = new Map(E(E1(a, "lib_symbols") || [], "symbol").map(s => [s[1], s]));
    for (const s of E(a, "symbol")) {
      const lib = libs.get((E1(s, "lib_name") || E1(s, "lib_id"))[1]), unite = +(E1(s, "unit") || [0, 1])[1];
      if (!lib || E1(lib, "power")) continue;
      const pins = E(lib, "symbol").filter(u => /_(\d+)_\d+$/.test(u[1]) && [0, unite].includes(+u[1].match(/_(\d+)_\d+$/)[1]))
        .flatMap(u => E(u, "pin").map(p => E1(p, "number")[1]));
      for (const pth of E(E1(E1(s, "instances"), "project"), "path")) {
        const ch = "/" + pth[1].split("/").slice(2).concat(E1(s, "uuid")[1]).join("/");
        symboles.set(ch, (symboles.get(ch) || []).concat(pins));
      }
    }
  }
  const pcb = K.lire(ex.fichiers.find(f => f.name.endsWith(".kicad_pcb")).text, "kicad_pcb");
  for (const fp of E(pcb, "footprint")) {
    const pth = E1(fp, "path");
    if (!pth) continue;
    const pins = symboles.get(pth[1]), ref = (E(fp, "property").find(p => p[1] === "Reference") || [])[2];
    verifier(pins, d + " : l'empreinte " + ref + " désigne un symbole du schéma (" + pth[1] + ")");
    const pads = new Set(E(fp, "pad").map(p => p[1]));
    const seules = pins.filter(n => !pads.has(n));
    verifier(!seules.length, d + " : " + ref + ", broches sans pastille du même nom : " + seules.slice(0, 5).join(" "));
  }
}
const refuse = async (f, motif) => { try { await f(); return false; } catch (e) { return motif.test(e.message); } };

(async () => {
  /* ---------- archive ---------- */
  const z1 = zipOctets([{ name: "p/a.kicad_pro", text: "{}" }, { name: "../evil.kicad_sch", text: "(x)" },
                        { name: "/abs.kicad_pcb", text: "(x)" }, { name: "p/b.txt", text: "non" }]);
  const m1 = await K.lireZip(z1, c => /\.kicad_/.test(c));
  verifier(m1.size === 1 && m1.has("p/a.kicad_pro"), "archive : « .. » et chemins absolus écartés, filtre appliqué");
  const gros = Buffer.alloc(1 << 20, 65);
  const m2 = await K.lireZip(zipDeflate("x.kicad_pcb", gros));
  verifier(m2.get("x.kicad_pcb").length === gros.length, "archive : entrée dégonflée relue");
  verifier(await refuse(() => K.lireZip(zipDeflate("x.kicad_pcb", gros, 1000)), /taille annoncée/), "archive : bombe arrêtée à la taille annoncée");
  verifier(await refuse(() => K.lireZip(Buffer.from("pas un zip")), /pas une archive/), "archive : fichier quelconque refusé");

  /* ---------- écriture et identifiants ---------- */
  const t = K.ecrireS(["a", K.q('x "y"\\\nz'), 1.23456789, -0, 1e-9, ["b", 2]]);
  const relu = K.lire(t, "essai");
  verifier(relu[1] === 'x "y"\\\nz' && relu[2] === "1.234568" && relu[3] === "0" && relu[4] === "0" && relu[5][1] === "2",
           "expressions S : guillemets, échappements et nombres relus à l'identique");
  verifier(K.uuid("a") === K.uuid("a") && K.uuid("a") !== K.uuid("b") && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(K.uuid("a")),
           "identifiants stables au format UUID v4");

  /* ---------- bout en bout sur les démos KiCad ---------- */
  const demos = process.argv[2] || path.join(os.homedir(), "kicad-essais/src/demos");
  const kicadCli = (() => { try { execFileSync("which", ["kicad-cli"], { stdio: "ignore" }); return true; } catch (_) { return false; } })();
  const lignes = [];
  if (fs.existsSync(demos)) {
    for (const d of fs.readdirSync(demos).sort()) {
      const dossier = path.join(demos, d);
      if (!fs.statSync(dossier).isDirectory()) continue;
      // tout le dossier, sous-dossiers compris (feuilles rangées dans sch/), comme « Archiver le projet »
      const fichiers = fs.readdirSync(dossier, { recursive: true }).map(String).filter(f => /\.kicad_(pro|sch|pcb)$/.test(f));
      if (!fichiers.some(f => !f.includes(path.sep) && f.endsWith(".kicad_pro"))) continue;
      if (fichiers.some(f => fs.statSync(path.join(dossier, f)).size > 64 * 1024 * 1024)) { lignes.push(d + " : fichier de plus de 64 Mo, sauté"); continue; }
      const zip = zipOctets(fichiers.map(f => ({ name: d + "/" + f, data: fs.readFileSync(path.join(dossier, f)) })));
      const imp = await K.importer(zip);
      const ex = K.exporter({ nom: imp.nom, schema: imp.schema && JSON.parse(JSON.stringify(imp.schema)), pcb: imp.pcb && JSON.parse(JSON.stringify(imp.pcb)) });
      const imp2 = await K.importer(zipOctets(ex.fichiers));
      const nbFp = x => x.pcb ? x.pcb.fps.length : 0;
      // les composants repérés : un titre de bloc de feuille revient en texte, sans rien perdre
      const nbComp = x => x.schema ? x.schema.pages.reduce((n, p) => n + p.comps.filter(c => c.ref).length, 0) : 0;
      verifier(nbFp(imp) === nbFp(imp2) && nbComp(imp) === nbComp(imp2), d + " : aller-retour, mêmes empreintes et symboles");
      if (imp.pcb && imp.schema) liaisons(ex, d);
      if (kicadCli) {
        const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "kicad-"));
        for (const f of ex.fichiers) { fs.mkdirSync(path.dirname(path.join(tmp, f.name)), { recursive: true }); fs.writeFileSync(path.join(tmp, f.name), f.text); }
        const base = path.join(tmp, ex.nom, ex.nom);
        try {
          if (imp.pcb) execFileSync("kicad-cli", ["pcb", "drc", "-o", path.join(tmp, "drc.json"), "--format", "json", base + ".kicad_pcb"], { stdio: "ignore" });
          if (imp.schema) execFileSync("kicad-cli", ["sch", "erc", "-o", path.join(tmp, "erc.json"), "--format", "json", base + ".kicad_sch"], { stdio: "ignore" });
        } catch (e) { verifier(false, d + " : KiCad refuse l'export (" + e.message.split("\n")[0] + ")"); }
        fs.rmSync(tmp, { recursive: true, force: true });
      }
      lignes.push(d + " : " + nbFp(imp) + " empreintes, " + nbComp(imp) + " symboles, " + imp.rapport.length + "+" + ex.rapport.length + " écarts");
    }
  }
  console.log(lignes.join("\n") + (lignes.length ? "\n" : "") + (kicadCli ? "" : "kicad-cli absent : relecture par KiCad sautée\n") +
              "OK — " + total + " contrôles");
})().catch(e => { console.error("ÉCHEC : " + (e.stack || e)); process.exit(1); });
