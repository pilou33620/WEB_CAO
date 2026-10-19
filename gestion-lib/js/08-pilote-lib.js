"use strict";
/* =============================================================================
   Gestion LIB — 08-pilote-lib.js
   Commandes du canal de pilotage (MCP de web_suite, module « composants ») :
   Claude prépare un composant, la page le contrôle et le montre, et rien n'est
   écrit dans la LIB sans le clic de l'utilisateur.

     lib_empreinte_generer   famille + cotes de la datasheet → pcbfp-1 (IPC-7351B)
     lib_empreinte_verifier  contrôle d'un pcbfp-1
     lib_kicad_convertir     kicad_mod → pcbfp-1
     lib_brochage_verifier   brochage face à l'empreinte et au symbole
     lib_composant_creer     carte : empreinte neuve (si_absent) puis ligne de
                             catalogue (ajoutée, jamais réécrite) ; toujours au clic

   Le code métier est dans commun/composants-lib.js ; les quatre premières
   commandes ne font que calculer.
   ============================================================================= */

function libPiloteCommandes() {
  const CL = COMPOSANTS_LIB;
  const objet = (v, nom) => {
    if (!v || typeof v !== "object" || Array.isArray(v)) throw new Error("« " + nom + " » : un objet attendu");
    return v;
  };
  const nomEmpreinte = v => String(v == null ? "" : v).trim().replace(/^.*[\\/]/, "").replace(/\.json$/i, "");

  /* une empreinte donnée par son nom dans la LIB, ou un pcbfp-1 */
  async function empreinteDe(v) {
    if (typeof v !== "string") return objet(v, "empreinte");
    const def = await obtenirFichierLib("pcb", nomEmpreinte(v) + ".json");
    if (!def) throw new Error("empreinte « " + nomEmpreinte(v) + " » introuvable dans la LIB");
    return def;
  }

  /* La LIB relue sur le serveur, pas le miroir de la page : un autre onglet a pu y écrire. */
  async function etatLib() {
    const [cat, fichiers] = await Promise.all([apiGet("/api/lib/composants"), apiGet("/api/lib/fichiers")]);
    return { partNames: (cat.composants || []).map(c => c["Part Name"] || ""),
             empreintes: (fichiers.pcb || []).map(nomEmpreinte) };
  }

  /* Tous les contrôles de la carte ; refaits au clic, la LIB ayant pu changer entre-temps. */
  async function preparer(args) {
    const ligne = objet(args.ligne, "ligne");
    const neuve = args.empreinte == null ? null : objet(args.empreinte, "empreinte");
    const lib = await etatLib();
    const erreurs = [], remarques = [];
    const vise = nomEmpreinte(ligne["Empreinte PCB"]);
    if (neuve) {
      const v = CL.verifierEmpreinte(neuve, typeof neuve.name === "string" ? neuve.name + ".json" : null);
      erreurs.push(...v.erreurs.map(e => "empreinte : " + e));
      remarques.push(...v.remarques.map(e => "empreinte : " + e));
      // casse ignorée : « sot-23-5 » à côté de « SOT-23-5 » serait un doublon pour le PCB
      if (lib.empreintes.some(n => n.toLowerCase() === String(neuve.name).toLowerCase()))
        erreurs.push("l'empreinte « " + neuve.name + " » est déjà dans la LIB (jamais d'écrasement) : " +
                     "désigne-la dans la ligne sans la redonner, ou choisis un autre nom");
      if (vise !== neuve.name) erreurs.push("« Empreinte PCB » de la ligne doit désigner l'empreinte créée (" + neuve.name + ")");
    }
    const existante = !neuve && lib.empreintes.includes(vise) ? await obtenirFichierLib("pcb", vise + ".json") : null;
    const v = CL.verifierLigne(ligne, { partNames: lib.partNames, empreintes: lib.empreintes, nouvelle: neuve, empreinteDef: existante });
    erreurs.push(...v.erreurs);
    remarques.push(...v.remarques);
    return { erreurs, remarques, ligne: v.ligne, neuve, apercu: neuve || existante };
  }

  /* L'aperçu de l'empreinte dans l'inspecteur, le temps de la carte. */
  function montrer(def, nom) {
    if (typeof basculerOnglet === "function" && typeof currentTab !== "undefined" && currentTab !== "composants")
      basculerOnglet("composants");
    const titre = document.getElementById("inspPcbName");
    if (titre) titre.textContent = "Aperçu (carte de Claude) : " + nom;
    if (typeof pcbRendererMain !== "undefined" && pcbRendererMain) pcbRendererMain.setFootprint(def || null);
  }
  function oublier() {
    if (LIB_STATE.selection && typeof selectionnerComposant === "function") selectionnerComposant(LIB_STATE.selection._id);
    else montrer(null, "—");
  }

  async function retirer(fichier) {
    const r = await fetch("/api/lib/fichier?type=pcb&nom=" + encodeURIComponent(fichier), { method: "DELETE" });
    if (!r.ok) throw new Error("erreur " + r.status);
    LIB_STATE.cacheFichiers.delete("pcb:" + fichier);
    if (Array.isArray(LIB_STATE.fichiers.pcb)) LIB_STATE.fichiers.pcb = LIB_STATE.fichiers.pcb.filter(f => f !== fichier);
  }

  const creer = {
    ecriture: true,
    clic: true,       // la LIB est partagée par tous les projets : jamais sans le clic, même interrupteur allumé
    irreversible: "Écrit dans la LIB partagée (pas d'annulation par la carte) : pour défaire, retire la ligne " +
                  "et l'empreinte dans Gestion LIB.",
    async proposer(args) {
      const p = await preparer(args);
      if (p.erreurs.length) throw new Error("Composant refusé : " + p.erreurs.join(" ; "));
      const L = p.ligne;
      montrer(p.apercu, nomEmpreinte(L["Empreinte PCB"]));
      return {
        titre: "Créer « " + L["Part Name"] + " » dans la LIB",
        apres: (p.neuve ? "empreinte neuve " + p.neuve.name + " (" + p.neuve.pads.length + " pastilles)"
                        : "empreinte existante " + nomEmpreinte(L["Empreinte PCB"])) +
               " + ligne " + L["Part Name"] + " (" + L["Reference designator Prefix"] + ", " + L["Number Of pins"] +
               " broches, symbole " + nomEmpreinte(L["Empreinte Schématique"]) +
               (L["Brochage"] ? ", brochage " + L["Brochage"] : "") + ")",
        details: p.remarques.length ? "Remarques : " + p.remarques.join(" ; ") : undefined
      };
    },
    async appliquer(args) {
      const p = await preparer(args);
      if (p.erreurs.length) throw new Error("Refusé au clic (la LIB a changé depuis la carte ?) : " + p.erreurs.join(" ; "));
      const L = p.ligne;
      let fichier = null;
      if (p.neuve) {
        fichier = p.neuve.name + ".json";
        try { await sauvegarderFichierLib("pcb", fichier, p.neuve, { si_absent: true }); }
        catch (e) { throw new Error("Empreinte non écrite : " + e.message); }
      }
      const ajout = {};
      for (const [k, v] of Object.entries(L)) if (v !== "") ajout[k] = v;
      try {
        await apiPost("/api/lib/composants", { ajouter: ajout });
      } catch (e) {
        // pas d'empreinte orpheline : celle-ci vient d'être créée par cette carte (si_absent), on la retire
        let retiree = "";
        if (fichier) {
          try { await retirer(fichier); retiree = " ; empreinte " + fichier + " retirée"; }
          catch (e2) { retiree = " ; empreinte " + fichier + " NON retirée (" + e2.message + ") : à retirer à la main"; }
        }
        throw new Error("Ligne refusée par le serveur : " + e.message + retiree);
      }
      /* le miroir de la page suit : sinon un « Enregistrer » du catalogue (qui réécrit tout)
         effacerait la ligne ajoutée */
      if (L["Brochage"] && !LIB_STATE.colonnes.includes("Brochage")) LIB_STATE.colonnes.push("Brochage");
      const id = LIB_STATE.composants.reduce((m, c) => Math.max(m, c._id), -1) + 1;
      LIB_STATE.composants.push(Object.assign({}, L, { _id: id }));
      libSuiteNoter("catalogue");
      if (typeof sessDiffuserLibModif === "function") sessDiffuserLibModif({ genre: "catalogue", action: "sauvegarde" });
      if (typeof rafraichirTout === "function") rafraichirTout();
      oublier();
      return { empreinte: fichier ? "lib_empreinte_pcb/" + fichier : null, ligne: L["Part Name"] };
    },
    refuser: () => oublier()
  };

  return {
    lib_empreinte_generer: { executer: async a => CL.genererEmpreinte(a.famille, objet(a.parametres || {}, "parametres")) },
    lib_empreinte_verifier: { executer: async a => {
      const e = objet(a.empreinte, "empreinte");
      return CL.verifierEmpreinte(e, a.nom != null ? String(a.nom) : (typeof e.name === "string" ? e.name + ".json" : null));
    } },
    lib_kicad_convertir: { executer: async a => CL.convertirKicad(a.texte) },
    lib_brochage_verifier: { executer: async a => CL.verifierBrochage(a.brochage, await empreinteDe(a.empreinte), a.symbole) },
    lib_composant_creer: creer
  };
}
