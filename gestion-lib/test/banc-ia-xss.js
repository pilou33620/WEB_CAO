// Verifie que formaterMessageIa (gestion-lib) n'injecte plus de HTML du modele.
const fs = require("fs"), vm = require("vm"), path = require("path");
const R = path.join(__dirname, "..", "..");
const src = fs.readFileSync(path.join(R, "gestion-lib/js/04-ui.js"), "utf8").match(/function escapeHtml[\s\S]*?\n}/)[0] +
  fs.readFileSync(path.join(R, "gestion-lib/js/06-ia-lib.js"), "utf8").match(/function formaterMessageIa[\s\S]*?\n}\r?\n/)[0];
const c = { btoa: s => Buffer.from(s, "binary").toString("base64") };
vm.createContext(c); vm.runInContext(src, c);
const texte = "<img src=x onerror=alert(1)> **gras**\n```action:pcb\n" +
  JSON.stringify({ name: "a');alert(1);//", pins: "<b>x</b>" }) + "\n```";
const h = c.formaterMessageIa(texte, 0);
require("assert").ok(!h.includes("<img"), "img injecte");
require("assert").ok(!h.includes("<b>x</b>"), "pins injecte");
require("assert").ok(h.includes("<b>gras</b>"), "markdown perdu");
// l'attribut onclick, une fois decode par le navigateur, doit etre du JS sur
const attr = h.match(/onclick="(iaOuvrirDansEditeurPcb\([^"]*\))"/)[1]
  .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&");
let appel = null;
vm.runInNewContext(attr, { iaOuvrirDansEditeurPcb: (b, n) => { appel = n; }, alert: () => { throw new Error("XSS"); } });
require("assert").ok(appel === "a');alert(1);//.json", "nom altere : " + appel);
console.log("ok", appel);
