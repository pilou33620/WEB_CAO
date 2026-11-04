"use strict";
/* =============================================================================
   Gestion LIB — 08-pilote-lib.js
   Commandes du canal de pilotage (MCP de web_suite, module « composants ») :
   Claude prépare un composant, la page le contrôle. Rien n'est écrit dans la
   LIB : l'écriture se fait à l'interface.

     lib_empreinte_generer   famille + cotes de la datasheet → pcbfp-1 (IPC-7351B)
     lib_empreinte_verifier  contrôle d'un pcbfp-1
     lib_kicad_convertir     kicad_mod → pcbfp-1
     lib_brochage_verifier   brochage face à l'empreinte et au symbole

   Le code métier est dans commun/composants-lib.js.
   ============================================================================= */

function libPiloteCommandes() {
  const CL = COMPOSANTS_LIB;
  const objet = (v, nom) => {
    if (!v || typeof v !== "object" || Array.isArray(v)) throw new Error("« " + nom + " » : un objet attendu");
    return v;
  };
  const nomEmpreinte = CL.nomDeChemin;     // « lib/empreinte/X.json » → « X »

  /* une empreinte donnée par son nom dans la LIB, ou un pcbfp-1 */
  async function empreinteDe(v) {
    if (typeof v !== "string") return objet(v, "empreinte");
    const def = await obtenirFichierLib("pcb", nomEmpreinte(v) + ".json");
    if (!def) throw new Error("empreinte « " + nomEmpreinte(v) + " » introuvable dans la LIB");
    return def;
  }

  return {
    lib_empreinte_generer: { executer: async a => CL.genererEmpreinte(a.famille, objet(a.parametres || {}, "parametres")) },
    lib_empreinte_verifier: { executer: async a => {
      const e = objet(a.empreinte, "empreinte");
      return CL.verifierEmpreinte(e, a.nom != null ? String(a.nom) : (typeof e.name === "string" ? e.name + ".json" : null));
    } },
    lib_kicad_convertir: { executer: async a => CL.convertirKicad(a.texte) },
    lib_brochage_verifier: { executer: async a => CL.verifierBrochage(a.brochage, await empreinteDe(a.empreinte), a.symbole) }
  };
}
