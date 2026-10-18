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

function piloteCao(page) {
  if (typeof Pilote === "undefined") return;
  const TOILES = { schema: "sheet", pcb: "board", "visionneuse-ipc": "carte" };
  Pilote.declarer({ page, projet: () => (typeof projNom === "function" ? projNom() : "") });
  if (TOILES[page]) Pilote.capture(() => document.getElementById(TOILES[page]));
  if (page === "pcb" || page === "visionneuse-ipc") Pilote.commande("cao_calcul", { executer: piloteCaoCalcul });
}
