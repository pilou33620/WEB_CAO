/* Branchement du canal de pilotage (commun/pilote.js, copie de web_suite) dans les
   pages de WEB_CAO : la page se déclare, avec le projet ouvert et le canevas que
   l'utilisateur voit. Les commandes propres à une page s'ajoutent ici.
   Banc : node commun/test/banc-pilote-cao.js */

/* cao_calcul : analyse -> [famille du panneau, lanceur]. Les lanceurs sont async et leur
   promesse se résout à la fin du calcul ; une erreur est rangée dans l'état, et le
   rapport la dit (web_suite, SPEC-mcp-canal-pilote.md, question tranchée 1). */
const PILOTE_CALCULS = {
  impedance: ["si", "simGo"], diff: ["si", "simGo"], retour: ["si", "simGo"],
  crosstalk: ["si", "simXtGo"], oeil: ["si", "simOeilGo"],
  dc: ["pi", "simDCLancer"], pdn: ["pi", "simCalculerPDN"],
  s21: ["rf", "simRfGo"], verif: ["carte", "simCarteGo"],
};

async function piloteCaoCalcul(args) {
  const analyse = args.analyse;
  const quoi = PILOTE_CALCULS[analyse];
  if (!quoi) throw new Error("Analyse « " + analyse + " » inconnue : " + Object.keys(PILOTE_CALCULS).join(", ") + ".");
  const lancer = globalThis[quoi[1]];
  if (typeof lancer !== "function" || typeof simAllerFamille !== "function")
    throw new Error("Analyse « " + analyse + " » indisponible dans cette page.");
  if (SIM.occupe) throw new Error("Un calcul est déjà en cours dans cette page : réessaie quand il sera fini.");
  simAllerFamille(quoi[0]);
  simAllerAnalyse(analyse);
  // simGo s'arrête en silence quand simProblemes() ne trouve rien (pas de cuivre sélectionné) :
  // le dire, avec la raison que la page a rangée, plutôt que rendre un rapport « Pas de résultat »
  if (quoi[1] === "simGo" && !(simCalculable() && simProblemes()))
    throw new Error(SIM.err || "Rien à calculer : sélectionne d'abord une piste ou un net dans l'éditeur.");
  await lancer();
  return { analyse, rapport: simRapMarkdown(simRapCollecter()) };
}

/* cao_valeur_composant (schéma) : la recherche et le rafraîchissement de l'action
   schema_values de l'assistant (ia-assistant.js), en une étape d'historique. Le repère
   est cherché AVANT push() : un repère inconnu ne laisse pas d'étape vide à défaire. */
function piloteTrouverComp(ref) {
  const cible = String(ref || "").trim().toUpperCase();
  const meme = c => (c.ref || "").trim().toUpperCase() === cible;
  let c = S.comps.find(meme);
  for (const p of S.pages || []) { if (c) break; if (Array.isArray(p.comps)) c = p.comps.find(meme); }
  if (!c) throw new Error("Repère « " + ref + " » introuvable dans le schéma.");
  return c;
}

const PILOTE_VALEUR = {
  ecriture: true, historique: true,      // une étape dans l'historique de l'éditeur : Ctrl+Z la défait
  proposer: a => {
    const c = piloteTrouverComp(a.ref);
    return { titre: c.ref + " : valeur", avant: c.value || "", apres: String(a.valeur).trim() };
  },
  appliquer: a => {
    const c = piloteTrouverComp(a.ref);
    const v = String(a.valeur).trim();
    push();
    const def = typeof defOf === "function" ? defOf(c.type) : null;
    if (def && typeof def.pins === "function" && typeof reshapeComp === "function") reshapeComp(c, () => { c.value = v; });
    else c.value = v;
    if (typeof buildList === "function") buildList();
    if (typeof refreshPanels === "function") refreshPanels();
    if (typeof draw === "function") draw();
  },
};

/* Lectures (commun/lecture-cao.js) : le registre de la page, choisi par « quoi », rendu
   en texte. Rien n'est écrit, donc pas de carte ; la trace vient de pilote.js. */
const PILOTE_LIRE = { schema: ["schema"], pcb: ["pcb", "sim"], "visionneuse-ipc": ["ipc", "sim"] };

function piloteLire(famille, args) {
  if (famille === "ipc" && !(typeof V !== "undefined" && V && V.modele))
    throw new Error("Aucun fichier IPC-2581 ouvert dans la visionneuse.");
  if (famille === "sim" && !LECTURE_CAO.aides.simRapportsDispo())
    throw new Error("Les simulations ne sont pas chargées dans cette page.");
  const outils = LECTURE_CAO[famille], o = outils[args.quoi];
  if (!o) throw new Error("« quoi » inconnu ici : " + Object.keys(outils).join(", ") + ".");
  if (famille === "sim" && args.afficher && args.analyse) piloteAfficherAnalyse(args.analyse);
  return [].concat(o.fn(args)).join("\n");
}

/* Le rapport complet n'existe que pour l'analyse affichée : y passer, comme un clic sur l'onglet. */
function piloteAfficherAnalyse(k) {
  const fam = SIM_FAMILLES.find(f => f.analyses.includes(k));
  if (!fam || !SIM_RAP_ETAT[k]) throw new Error("Analyse « " + k + " » inconnue. Analyses : " + Object.keys(SIM_RAP_ETAT).join(", ") + ".");
  simAllerFamille(fam.cle);
  simAllerAnalyse(k);
}

/* cao_vue : la vue seulement, ni le projet ni l'historique. Tout est vérifié avant le
   premier changement : un repère ou une couche inconnus laissent la vue telle quelle.
   Pas de phare animé (18-reperage.js) : la capture qui suit le montrerait à moitié. */
function piloteCible(page, v) {
  const q = String(v).toLowerCase();
  if (page === "schema") return schCibleTrouver(v);
  if (page === "pcb") return pcbCibleTrouver(v);
  const ref = [...V.parRef.keys()].find(r => r.toLowerCase() === q);
  // choisirComp sans centrer désélectionne le composant déjà choisi : ne pas le rappeler
  if (ref) return { cle: ref, aller: garder => { if (!(garder && V.comp === ref)) choisirComp(ref, !garder); } };
  const i = V.parNet.findIndex(n => String(n.nom).toLowerCase() === q);
  if (i >= 0) return { cle: V.parNet[i].nom, net: true, aller: () => { if (V.net !== i) choisirNet(i, false); } };
  return null;
}

function piloteCouches(page, noms) {
  if (page === "schema") throw new Error("« couches » : seulement au PCB et dans la visionneuse.");
  const toutes = page === "pcb" ? S.cuL.slice(0, S.cu).map((c, i) => ({ c, nom: LECTURE_CAO.aides.nomCouchePcb(i) }))
                                : V.couches.map(c => ({ c, nom: c.nom }));
  const voulues = new Set();
  for (const n of noms) {
    const t = toutes.find(x => String(x.nom).toLowerCase() === String(n).toLowerCase());
    if (!t) throw new Error("Couche « " + n + " » inconnue. Couches : " + toutes.map(x => x.nom).join(", ") + ".");
    voulues.add(t.c);
  }
  return () => {
    for (const { c } of toutes) c[page === "pcb" ? "vis" : "visible"] = voulues.has(c);
    // la visionneuse n'enregistre pas ce choix dans ses préférences (prefEcrire) : il vient de Claude
    if (page === "pcb") { touch(); buildLayers(); buildTabs(); draw(); } else { pnlCouches(); dessiner(); }
  };
}

async function piloteVue(page, a) {
  if (page === "visionneuse-ipc" && !(typeof V !== "undefined" && V && V.modele))
    throw new Error("Aucun fichier IPC-2581 ouvert dans la visionneuse.");
  const faire = [], dit = [];
  if (a.feuille != null) {
    if (page !== "schema") throw new Error("« feuille » : seulement au schéma.");
    const i = a.feuille - 1;
    if (!S.pages[i]) throw new Error("Feuille " + a.feuille + " inconnue : 1 à " + S.pages.length + ".");
    faire.push(() => gotoPage(i)); dit.push("feuille f" + a.feuille);
  }
  if (a.couches) { faire.push(piloteCouches(page, a.couches)); dit.push("couches visibles : " + a.couches.join(", ")); }
  if (a.ajuster) { faire.push(() => fit()); dit.push("vue ajustée à tout le document"); }
  for (const [cle, garder] of [["cadrer", false], ["surligner", true]]) {
    if (a[cle] == null) continue;
    const t = piloteCible(page, a[cle]);
    if (!t) throw new Error("« " + a[cle] + " » : ni repère ni net de cette page (voir les lectures « composants » et « nets »).");
    faire.push(() => {
      const vue = page === "visionneuse-ipc" ? null : [S.scale, S.ox, S.oy];
      if (page === "visionneuse-ipc") t.aller(garder); else t.aller();
      if (garder && vue) { [S.scale, S.ox, S.oy] = vue; draw(); }      // surligner sans bouger la vue
    });
    dit.push((garder ? "surligné " : "cadré sur ") + t.cle + (t.net && !garder ? " (la visionneuse surligne un net sans le cadrer)" : ""));
  }
  if (!faire.length) throw new Error("Rien à faire : cadrer, surligner, feuille, couches ou ajuster.");
  faire.forEach(f => f());
  return "Vue : " + dit.join(" ; ") + ".";
}

/* cao_drc : le bouton DRC de la page (onglet DRC ouvert, compte rendu), puis la même
   lecture que cao_pcb_lire « drc ». Le résultat n'entre pas dans l'historique. */
async function piloteDrc() {
  document.getElementById("bDrc").onclick();
  return [].concat(LECTURE_CAO.pcb.drc.fn({})).join("\n");
}

function piloteCao(page) {
  if (typeof Pilote === "undefined") return;
  const TOILES = { schema: "sheet", pcb: "board", "visionneuse-ipc": "carte" };
  Pilote.declarer({ page, projet: () => (typeof projNom === "function" ? projNom() : "") });
  if (TOILES[page]) Pilote.capture(() => document.getElementById(TOILES[page]));
  if (page === "pcb" || page === "visionneuse-ipc") Pilote.commande("cao_calcul", { executer: piloteCaoCalcul });
  if (page === "schema") Pilote.commande("cao_valeur_composant", PILOTE_VALEUR);
  for (const f of PILOTE_LIRE[page] || []) Pilote.commande("cao_" + f + "_lire", { executer: async a => piloteLire(f, a) });
  if (PILOTE_LIRE[page]) Pilote.commande("cao_vue", { executer: a => piloteVue(page, a) });
  if (page === "pcb") Pilote.commande("cao_drc", { executer: piloteDrc });
}
