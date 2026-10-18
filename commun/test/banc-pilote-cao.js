/* =============================================================================
   commun/test/banc-pilote-cao.js
   Les commandes du canal de pilotage propres à WEB_CAO (commun/pilote-cao.js),
   sous Node : un faux Pilote note ce que la page déclare, et de fausses
   fonctions de simulation notent les appels. Le panneau, le relais et les cartes
   sont éprouvés par le banc de pilote.js dans web_suite (lanceur/banc_pilote.js).
     node commun/test/banc-pilote-cao.js
   ============================================================================= */
"use strict";
const fs = require("fs"), path = require("path"), vm = require("vm");
const CODE = fs.readFileSync(path.join(__dirname, "..", "pilote-cao.js"), "utf8");

function page(nom, sim) {
  const appels = [];
  const declare = { commandes: {}, capture: null, page: null };
  const note = n => (...a) => { appels.push([n].concat(a)); };
  const lanceur = n => async () => { appels.push([n]); };
  const ctx = vm.createContext(Object.assign({
    Pilote: {
      declarer(o) { declare.page = o.page; declare.projet = o.projet; return this; },
      capture(fn) { declare.capture = fn; return this; },
      commande(n, def) { declare.commandes[n] = def; return this; },
    },
    document: { getElementById: id => ({ id }) },
    projNom: () => "carte PIR",
    SIM: { occupe: false, analyse: "" },
    simAllerFamille: note("simAllerFamille"), simAllerAnalyse: note("simAllerAnalyse"),
    simCalculable: () => true, simProblemes: () => [{ doc: {} }],
    simGo: lanceur("simGo"), simXtGo: lanceur("simXtGo"), simOeilGo: lanceur("simOeilGo"),
    simDCLancer: lanceur("simDCLancer"), simCalculerPDN: () => { appels.push(["simCalculerPDN"]); },
    simRfGo: lanceur("simRfGo"), simCarteGo: lanceur("simCarteGo"),
    simRapCollecter: () => ({ analyse: ctx.SIM.analyse }),
    simRapMarkdown: d => "# Rapport " + d.analyse,
  }, sim || {}));
  vm.runInContext(CODE + "\npiloteCao(" + JSON.stringify(nom) + ");", ctx);
  return { declare, appels, ctx };
}

let ok = 0, ko = 0;
async function T(nom, fn) {
  try { await fn(); console.log("  ok  " + nom); ok++; }
  catch (e) { console.log("  KO  " + nom + " → " + e.message); ko++; }
}
function egal(a, b, quoi) {
  const ja = JSON.stringify(a), jb = JSON.stringify(b);
  if (ja !== jb) throw new Error((quoi || "") + " : attendu " + jb + ", lu " + ja);
}
async function refuse(promesse, motif) {
  try { await promesse; } catch (e) { if (!motif.test(e.message)) throw new Error("message inattendu : " + e.message); return; }
  throw new Error("aurait dû être refusé");
}

(async () => {
  await T("chaque page se déclare, avec son projet et son canevas", () => {
    for (const [p, toile] of [["pcb", "board"], ["schema", "sheet"], ["visionneuse-ipc", "carte"]]) {
      const { declare } = page(p);
      egal([declare.page, declare.projet(), declare.capture().id], [p, "carte PIR", toile], p);
    }
    egal(page("gestion-lib").declare.capture, null, "gestion-lib sans canevas");
  });

  await T("cao_calcul déclaré dans le PCB et la visionneuse seulement", () => {
    egal(["pcb", "visionneuse-ipc", "schema", "gestion-lib"].map(p => !!page(p).declare.commandes.cao_calcul),
         [true, true, false, false]);
    egal(!!page("pcb").declare.commandes.cao_calcul.ecriture, false, "un calcul n'écrit pas : pas de carte");
  });

  await T("chaque analyse : famille, analyse, lanceur attendu, puis rapport", async () => {
    const attendu = { impedance: ["si", "simGo"], diff: ["si", "simGo"], retour: ["si", "simGo"],
                      crosstalk: ["si", "simXtGo"], oeil: ["si", "simOeilGo"], dc: ["pi", "simDCLancer"],
                      pdn: ["pi", "simCalculerPDN"], s21: ["rf", "simRfGo"], verif: ["carte", "simCarteGo"] };
    for (const [analyse, [famille, lanceur]] of Object.entries(attendu)) {
      const p = page("pcb");
      p.ctx.simAllerAnalyse = (a) => { p.appels.push(["simAllerAnalyse", a]); p.ctx.SIM.analyse = a; };
      const rendu = await p.declare.commandes.cao_calcul.executer({ analyse });
      egal(p.appels, [["simAllerFamille", famille], ["simAllerAnalyse", analyse], [lanceur]], analyse);
      egal(rendu, { analyse, rapport: "# Rapport " + analyse }, analyse);
    }
  });

  await T("refus lisibles : analyse inconnue, calcul en cours, rien de sélectionné, lanceur absent", async () => {
    await refuse(page("pcb").declare.commandes.cao_calcul.executer({ analyse: "tout" }), /inconnue/);
    const occupe = page("pcb", { SIM: { occupe: true } });
    await refuse(occupe.declare.commandes.cao_calcul.executer({ analyse: "dc" }), /en cours/);
    egal(occupe.appels, [], "rien lancé pendant un calcul");
    // simCalculable dit seulement si l'analyse se calcule ; c'est simProblemes qui voit la sélection
    const vide = page("pcb", { simProblemes: () => null });
    await refuse(vide.declare.commandes.cao_calcul.executer({ analyse: "impedance" }), /sélection/);
    egal(vide.appels.filter(a => a[0] === "simGo"), [], "simGo pas appelé sans sélection");
    const dite = page("pcb", { simProblemes: () => null, SIM: { occupe: false, err: "Net GND : pas de plan de référence." } });
    await refuse(dite.declare.commandes.cao_calcul.executer({ analyse: "diff" }), /plan de référence/);
    const sansRf = page("visionneuse-ipc", { simRfGo: undefined });
    await refuse(sansRf.declare.commandes.cao_calcul.executer({ analyse: "s21" }), /indisponible/);
  });

  console.log("\n" + ok + " essais réussis, " + ko + " en échec.");
  process.exit(ko ? 1 : 0);
})();
