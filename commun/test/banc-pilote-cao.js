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
// lecture-cao.js et ecriture-cao.js d'abord, comme dans les pages : les commandes s'en servent
// et, pour Gestion LIB, ses commandes (08-pilote-lib.js) et leur code métier
const CODE = ["lecture-cao.js", "ecriture-cao.js", "composants-lib.js", "../gestion-lib/js/08-pilote-lib.js", "pilote-cao.js"]
  .map(f => fs.readFileSync(path.join(__dirname, "..", f), "utf8")).join("\n");

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
    simBusCalculer: () => { appels.push(["simBusCalculer"]); ctx.SIM_BUS.result = ctx.SIM_BUS.donne; },
    SIM_BUS: { result: null, erreur: "", donne: { allPass: true } },
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
    for (const [p, toile] of [["pcb", "board"], ["schema", "sheet"], ["visionneuse-ipc", "carte"], ["gestion-lib", "canvasPcbInsp"]]) {
      const { declare } = page(p);
      egal([declare.page, declare.projet(), declare.capture().id], [p, "carte PIR", toile], p);
    }
  });

  await T("Gestion LIB : quatre calculs et deux cartes (création, liaison), jamais directes", () => {
    const LIB = ["lib_empreinte_generer", "lib_empreinte_verifier", "lib_kicad_convertir", "lib_brochage_verifier", "lib_composant_creer",
                 "lib_simulation_lier"];
    for (const p of ["pcb", "schema", "visionneuse-ipc", "gestion-lib"]) {
      const c = page(p).declare.commandes;
      egal(LIB.map(n => !!c[n]), LIB.map(() => p === "gestion-lib"), p);
    }
    const c = page("gestion-lib").declare.commandes;
    egal(LIB.map(n => !!c[n].ecriture), [false, false, false, false, true, true], "seules la création et la liaison écrivent");
    for (const n of ["lib_composant_creer", "lib_simulation_lier"]) {
      const d = c[n];
      egal([d.clic, typeof d.irreversible, !!d.annuler, !!d.historique], [true, "string", false, false],
           n + " : toujours au clic, irréversible");
    }
  });

  await T("cao_calcul déclaré dans le PCB et la visionneuse seulement", () => {
    egal(["pcb", "visionneuse-ipc", "schema", "gestion-lib"].map(p => !!page(p).declare.commandes.cao_calcul),
         [true, true, false, false]);
    egal(!!page("pcb").declare.commandes.cao_calcul.ecriture, false, "un calcul n'écrit pas : pas de carte");
  });

  await T("chaque analyse : famille, analyse, lanceur attendu, puis rapport", async () => {
    const attendu = { impedance: ["si", "simGo"], diff: ["si", "simGo"], retour: ["si", "simGo"],
                      crosstalk: ["si", "simXtGo"], oeil: ["si", "simOeilGo"], bus: ["si", "simBusCalculer"], dc: ["pi", "simDCLancer"],
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
    const busVide = page("pcb", { SIM_BUS: { result: null, erreur: "", donne: null } });
    await refuse(busVide.declare.commandes.cao_calcul.executer({ analyse: "bus" }), /horloge et les données/);
    const busDit = page("pcb", { SIM_BUS: { result: null, erreur: "Cet outil ne fournit pas de calcul physique de bus.", donne: null } });
    await refuse(busDit.declare.commandes.cao_calcul.executer({ analyse: "bus" }), /calcul physique/);
    const sansRf = page("visionneuse-ipc", { simRfGo: undefined });
    await refuse(sansRf.declare.commandes.cao_calcul.executer({ analyse: "s21" }), /indisponible/);
  });

  await T("commandes de lecture : chacune dans sa page, aucune n'écrit", () => {
    const lire = ["cao_schema_lire", "cao_pcb_lire", "cao_ipc_lire", "cao_sim_lire"];
    const vues = {};
    for (const p of ["schema", "pcb", "visionneuse-ipc", "gestion-lib"]) {
      const c = page(p).declare.commandes;
      vues[p] = lire.filter(n => c[n]);
      for (const n of vues[p]) egal(!!c[n].ecriture, false, n + " ne doit pas écrire");
    }
    egal(vues, { schema: ["cao_schema_lire"], pcb: ["cao_pcb_lire", "cao_sim_lire"],
                 "visionneuse-ipc": ["cao_ipc_lire", "cao_sim_lire"], "gestion-lib": [] });
  });

  /* un V minimal, à la main : la visionneuse n'a pas de banc qui construit V depuis un fichier */
  const V = {
    unite: "mm", net: -1,
    modele: { empilage: [{ nom: "TOP", type: "CONDUCTOR", ep: 0.035, mat: "cuivre" }],
              composants: [{ ref: "U1", val: "MCU", pkg: "QFN-32", c: 0, x: 1, y: 2, r: 90,
                             pins: [{ num: "1", n: 0 }, { num: "2" }] }],
              nets: ["GND"] },
    couches: [{ nom: "TOP" }],
    parNet: [{ i: 0, nom: "GND", classe: "Défaut", longueur: 12.3456, couches: new Set([0]),
               pistes: [1, 2], arcs: [], plans: [], pads: [1], trous: [] }],
  };

  await T("cao_ipc_lire : les lectures de la visionneuse, refus lisibles", async () => {
    const c = page("visionneuse-ipc", { V }).declare.commandes.cao_ipc_lire;
    egal(await c.executer({ quoi: "composant", ref: "u1" }),
         "U1 = MCU (QFN-32), couche TOP, x 1 y 2, rotation 90°.\nBroches (2) :\n- 1 → GND\n- 2 → non connectée");
    egal(await c.executer({ quoi: "nets", filtre: "gn" }), "- GND [Défaut] : 12.346 mm de pistes, 1 couche(s)");
    await refuse(c.executer({ quoi: "drc" }), /« quoi » inconnu.*empilage, composants, composant, nets, net/);
    for (const quoi of ["__proto__", "constructor", "toString"])     // noms hérités de Object.prototype
      await refuse(c.executer({ quoi }), /« quoi » inconnu/);
    await refuse(page("visionneuse-ipc", { V: { modele: null } }).declare.commandes.cao_ipc_lire.executer({ quoi: "nets" }),
                 /Aucun fichier IPC-2581 ouvert/);
  });

  await T("cao_sim_lire : afficher passe le panneau sur l'analyse, sinon rien ne bouge", async () => {
    const sim = {
      SIM_RAP_ETAT: { pdn: () => ({ res: null }), crosstalk: () => ({ res: null }) },
      SIM_ANALYSES: { pdn: { nom: "Z(ω) PDN" }, crosstalk: { nom: "Crosstalk" } },
      SIM_FAMILLES: [{ cle: "si", analyses: ["crosstalk"] }, { cle: "pi", analyses: ["dc", "pdn"] }],
      SIM: { occupe: false, analyse: "crosstalk" },
    };
    const p = page("pcb", sim), c = p.declare.commandes.cao_sim_lire;
    egal(await c.executer({ quoi: "simulation", analyse: "pdn" }), "La simulation « Z(ω) PDN » n'a pas de résultat.");
    egal(p.appels, [], "sans afficher, le panneau ne bouge pas");
    await c.executer({ quoi: "simulation", analyse: "pdn", afficher: true });
    egal(p.appels, [["simAllerFamille", "pi"], ["simAllerAnalyse", "pdn"]]);
    await refuse(c.executer({ quoi: "simulation", analyse: "rien", afficher: true }), /Analyse « rien » inconnue/);
    await refuse(c.executer({ quoi: "simulation", analyse: "constructor", afficher: true }), /Analyse « constructor » inconnue/);
    egal(await c.executer({ quoi: "simulation", analyse: "valueOf" }).then(t => /inconnue/.test(t)), true);
    await refuse(page("pcb").declare.commandes.cao_sim_lire.executer({ quoi: "simulations" }), /simulations ne sont pas chargées/);
  });

  await T("cao_vue dans la visionneuse : cadrer, surligner, couches ; refus avant tout changement", async () => {
    const v = JSON.parse(JSON.stringify({ ...V, parNet: [] })); v.parNet = V.parNet;
    v.parRef = new Map([["U1", {}]]); v.couches = [{ nom: "TOP", visible: true }, { nom: "BOTTOM", visible: true }];
    const p = page("visionneuse-ipc", { V: v });
    for (const n of ["choisirComp", "choisirNet", "fit", "dessiner", "pnlCouches", "prefEcrire"])
      p.ctx[n] = (...a) => p.appels.push([n].concat(a));
    const vue = p.declare.commandes.cao_vue;
    await refuse(vue.executer({ cadrer: "U1", couches: ["NULLE"] }), /Couche « NULLE » inconnue.*TOP, BOTTOM/);
    await refuse(vue.executer({ cadrer: "U9" }), /« U9 » : ni repère ni net/);
    await refuse(vue.executer({ feuille: 2 }), /feuille.*schéma/);
    await refuse(vue.executer({}), /Rien à faire/);
    egal(p.appels, [], "un refus ne touche à rien");
    const longue = page("visionneuse-ipc", { V: { ...v, couches: Array.from({ length: 300 }, (_, i) => ({ nom: "L" + i })) } });
    const e = await longue.declare.commandes.cao_vue.executer({ couches: ["NULLE"] }).catch(e => e.message);
    egal([/L39,/.test(e), /L40,/.test(e), /260 couches de plus/.test(e)], [true, false, true], "liste des couches bornée");
    const t = await vue.executer({ cadrer: "u1", surligner: "gnd", couches: ["top"] });
    egal(p.appels, [["pnlCouches"], ["dessiner"], ["choisirComp", "U1", true], ["choisirNet", 0, false]]);
    egal(v.couches.map(c => c.visible), [true, false], "seules les couches demandées restent visibles");
    if (!/U1/.test(t) || !/GND/.test(t)) throw new Error(t);
    egal(!!vue.ecriture, false, "la vue n'écrit pas");
    v.comp = "U1"; p.appels.length = 0;
    await vue.executer({ surligner: "U1" });
    egal(p.appels, [], "surligner le composant déjà choisi ne le désélectionne pas");
    await refuse(page("visionneuse-ipc", { V: { modele: null } }).declare.commandes.cao_vue.executer({ ajuster: true }), /Aucun fichier IPC-2581/);
  });

  await T("cao_vue et cao_drc : déclarés dans les bonnes pages", () => {
    egal(["schema", "pcb", "visionneuse-ipc", "gestion-lib"].map(p => [!!page(p).declare.commandes.cao_vue, !!page(p).declare.commandes.cao_drc]),
         [[true, false], [true, true], [true, false], [false, false]]);
  });

  await T("écritures en lot (ecriture-cao) : déclarées dans les bonnes pages, annulables", () => {
    const ecrire = ["cao_composants_ecrire", "cao_pistes_ecrire", "cao_classes_ecrire", "cao_contraintes_ecrire", "cao_sim_ecrire",
                    "cao_contour_ecrire", "cao_decoupes_ecrire", "cao_interdits_ecrire", "cao_zones_ecrire", "cao_serigraphie_ecrire", "cao_pastille_regler"];
    const vues = {};
    for (const p of ["schema", "pcb", "visionneuse-ipc", "gestion-lib"]) {
      const c = page(p).declare.commandes;
      vues[p] = ecrire.filter(n => c[n]);
      for (const n of vues[p]) egal(!!(c[n].ecriture && (c[n].historique || c[n].annuler)), true, n + " : écriture annulable");
    }
    egal(vues, { schema: ["cao_composants_ecrire"], pcb: ecrire, "visionneuse-ipc": ["cao_sim_ecrire"], "gestion-lib": [] });
  });

  await T("Pilote.aide : commandes de la page, description et arguments tirés du MCP (pilote-aide.json)", async () => {
    let lu = null;
    const { ctx, declare } = page("pcb", { fetch: async u => { lu = u; return { json: async () => JSON.parse(fs.readFileSync(path.join(__dirname, "..", "pilote-aide.json"), "utf8")) }; } });
    ctx.Pilote.commandes = declare.commandes;          // pilote.js les range là
    const liste = await ctx.Pilote.aide();
    egal(lu, "../commun/pilote-aide.json", "fichier lu");
    egal(/- cao_contour_ecrire : Contour de la carte/.test(liste) && /Par l'API seulement \(MCP\) : .*cao_projets/.test(liste), true, "liste : " + liste.slice(0, 300));
    const un = await ctx.Pilote.aide("cao_schema_dessiner");
    egal(/pas déclarée dans cette page/.test(un) && /"operations"/.test(un), true, "schéma au PCB : " + un.slice(0, 200));
    egal(/pas une commande connue/.test(await ctx.Pilote.aide("cao_inventee")), true, "inconnue");
  });

  console.log("\n" + ok + " essais réussis, " + ko + " en échec.");
  process.exit(ko ? 1 : 0);
})();
