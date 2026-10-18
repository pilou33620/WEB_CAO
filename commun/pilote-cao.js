/* Branchement du canal de pilotage (commun/pilote.js, copie de web_suite) dans les
   pages de WEB_CAO : la page se déclare, avec le projet ouvert et le canevas que
   l'utilisateur voit. Les commandes propres à une page s'ajoutent ici. */
function piloteCao(page) {
  if (typeof Pilote === "undefined") return;
  const TOILES = { schema: "sheet", pcb: "board", "visionneuse-ipc": "carte" };
  Pilote.declarer({ page, projet: () => (typeof projNom === "function" ? projNom() : "") });
  if (TOILES[page]) Pilote.capture(() => document.getElementById(TOILES[page]));
}
