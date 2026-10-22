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
     lib_simulation_lier     carte : modèle .sNp ou SPICE rangé dans lib_simulation
                             (si_absent) puis ajouté à la case « Modèle Simulation »
                             d'une référence ; toujours au clic
     lib_composant_modifier  carte : cases d'une référence existante remplacées
                             (ligne relue, refus si elle a changé), empreinte neuve
                             éventuelle sous un nom neuf ; toujours au clic

   Le code métier est dans commun/composants-lib.js ; les quatre premières
   commandes ne font que calculer.
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
    if (!neuve && lib.empreintes.includes(vise) && !existante)
      erreurs.push("l'empreinte « " + vise + " » est dans la LIB mais illisible : le brochage ne peut pas être vérifié");
    // une empreinte déjà là est montrée telle quelle : ses défauts en remarque, sans la refuser
    if (existante) remarques.push(...CL.verifierEmpreinte(existante, vise + ".json").erreurs.map(e => "empreinte existante : " + e));
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

  async function retirer(fichier, type = "pcb") {
    const r = await fetch("/api/lib/fichier?type=" + type + "&nom=" + encodeURIComponent(fichier), { method: "DELETE" });
    if (!r.ok) throw new Error("erreur " + r.status);
    LIB_STATE.cacheFichiers.delete(type + ":" + fichier);
    if (Array.isArray(LIB_STATE.fichiers[type])) LIB_STATE.fichiers[type] = LIB_STATE.fichiers[type].filter(f => f !== fichier);
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
        // toute la ligne écrite est montrée, pas seulement le résumé : on clique sur ce qu'on a vu
        details: Object.entries(L).filter(([, v]) => v !== "").map(([k, v]) => k + " = " + v).join(" · ") +
                 (p.remarques.length ? " — Remarques : " + p.remarques.join(" ; ") : "")
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
        // pas d'empreinte orpheline : celle-ci vient d'être créée par cette carte (si_absent), on la
        // retire, mais seulement sur un vrai refus du serveur ; une réponse perdue a pu écrire la ligne
        let retiree = "";
        if (fichier && !(e.status >= 400 && e.status < 500))
          retiree = " ; réponse incertaine : empreinte " + fichier + " gardée, vérifie le catalogue avant de réessayer";
        else if (fichier) {
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
      // tout est écrit : un raté de l'affichage ne doit pas faire croire à un échec (et à un nouvel essai)
      try {
        libSuiteNoter("catalogue");
        if (typeof sessDiffuserLibModif === "function") sessDiffuserLibModif({ genre: "catalogue", action: "sauvegarde" });
        if (typeof rafraichirTout === "function") rafraichirTout();
        oublier();
      } catch (e) { console.warn(e); }
      return { empreinte: fichier ? "lib_empreinte_pcb/" + fichier : null, ligne: L["Part Name"] };
    },
    refuser: () => oublier()
  };

  /* ---------- lib_simulation_lier : « 📎 Lier un fichier » de la fiche, par Claude ----------
     Même préparation que la fiche (04-ui.js) : un Touchstone reçoit la patte de chaque port et
     la masse (CL.brancherTouchstone), un modèle SPICE se range tel quel. Jamais d'écrasement : un
     fichier de même nom n'est repris que s'il a exactement le même contenu. */
  const SPICE = /\.(sub|cir|lib|mod|sp|spi|spice)$/i;
  const COL_SIM = ["Modèle Simulation", "Modele Simulation"];
  const lfs = t => String(t).replace(/\r\n?/g, "\n");
  async function fichierSim(nom) {
    try {
      const d = await apiGet("/api/lib/fichier?type=simulation&nom=" + encodeURIComponent(nom));
      return d.contenu !== undefined ? d.contenu : JSON.stringify(d.data);
    } catch (e) {
      if (e.status === 404) return null;
      throw e;
    }
  }
  async function preparerSim(args) {
    const ref = String(args.reference || "").trim();
    const nom = String(args.fichier || "").replace(/^.*[\\\/]/, "").replace(/[^A-Za-z0-9_.+-]/g, "_");
    const texte = typeof args.texte === "string" ? args.texte : "";
    const erreurs = [];
    const cat = await apiGet("/api/lib/composants");
    const comp = (cat.composants || []).find(c => String(c["Part Name"] || "").trim().toUpperCase() === ref.toUpperCase());
    if (!comp) throw new Error("« " + ref + " » n'est pas au catalogue de la LIB");
    const n = CL.portsTouchstone(nom);
    if (!n && !SPICE.test(nom)) throw new Error("« " + nom + " » : un Touchstone (.s1p à .s9p) ou un modèle SPICE (.sub, .cir, .lib, .mod, .sp)");
    if (!texte.trim()) throw new Error("« texte » vide : le contenu du fichier");
    const pins = parseInt(comp["Number Of pins"], 10);
    let pret = texte, branchement = "";
    if (n) {
      const r = CL.brancherTouchstone(texte, nom, { broches: Array.isArray(args.ports) ? args.ports.map(String) : [],
        masse: args.masse == null ? "" : String(args.masse), brochage: comp["Brochage"], pins: Number.isInteger(pins) ? pins : 0 });
      erreurs.push(...r.erreurs);
      if (r.texte) {
        pret = r.texte;
        branchement = "ports → pattes " + r.broches.join(", ") + (r.masse ? ", masse " + r.masse : ", masse de la carte");
      }
    } else if (args.ports != null || args.masse != null) erreurs.push("ports et masse : pour un Touchstone seulement");
    const col = COL_SIM.find(c => c in comp) || COL_SIM[0];
    const liste = String(comp[col] || "").split("|").map(x => x.trim()).filter(x => x && x !== "-" && x.toLowerCase() !== "xx");
    const lie = liste.some(x => x.replace(/^.*[\\\/]/, "") === nom);
    const existant = await fichierSim(nom);
    const reprise = existant != null && lfs(existant) === lfs(pret);
    if (existant != null && !reprise)
      erreurs.push("« " + nom + " » est déjà dans la LIB avec un autre contenu (jamais d'écrasement) : choisis un autre nom");
    else if (reprise && lie) erreurs.push("« " + nom + " » est déjà lié à " + comp["Part Name"]);
    return { erreurs, comp, nom, texte: pret, n, branchement, reprise, liste, col };
  }

  const lierSim = {
    ecriture: true,
    clic: true,       // la LIB est partagée par tous les projets, comme lib_composant_creer
    irreversible: "Écrit dans la LIB partagée (pas d'annulation par la carte) : pour défaire, délie le modèle " +
                  "dans la fiche de la référence (Gestion LIB) et retire le fichier de lib_simulation.",
    async proposer(args) {
      const p = await preparerSim(args);
      if (p.erreurs.length) throw new Error("Liaison refusée : " + p.erreurs.join(" ; "));
      const debut = lfs(p.texte).split("\n").slice(0, 8).join(" ⏎ ");
      return {
        titre: "Lier « " + p.nom + " » à « " + p.comp["Part Name"] + " »",
        avant: p.col + " : " + (p.liste.join(" | ") || "aucun modèle"),
        apres: (p.reprise ? "fichier déjà dans lib_simulation (même contenu), " : "fichier rangé dans lib_simulation, ") +
               (p.n ? p.n + " port" + (p.n > 1 ? "s" : "") + " (" + p.branchement + ")" : "modèle SPICE") +
               " ; " + p.col + " : " + p.liste.concat("lib/simulation/" + p.nom).join(" | "),
        details: "Début du fichier : " + debut.slice(0, 600)
      };
    },
    async appliquer(args) {
      const p = await preparerSim(args);
      if (p.erreurs.length) throw new Error("Refusé au clic (la LIB a changé depuis la carte ?) : " + p.erreurs.join(" ; "));
      if (!p.reprise) {
        try { await sauvegarderFichierLib("simulation", p.nom, p.texte, { si_absent: true }); }
        catch (e) { throw new Error("Fichier non écrit : " + e.message); }
      }
      let rep;
      try {
        rep = await apiPost("/api/lib/composants", { lier_simulation: { part: p.comp["Part Name"], modele: "lib/simulation/" + p.nom } });
      } catch (e) {
        // même règle que la création : on ne retire que le fichier écrit par cette carte, et sur un vrai refus
        let retire = "";
        if (!p.reprise && !(e.status >= 400 && e.status < 500))
          retire = " ; réponse incertaine : " + p.nom + " gardé dans la LIB, vérifie la fiche avant de réessayer";
        else if (!p.reprise) {
          try { await retirer(p.nom, "simulation"); retire = " ; " + p.nom + " retiré de la LIB"; }
          catch (e2) { retire = " ; " + p.nom + " NON retiré (" + e2.message + ") : à retirer à la main"; }
        }
        throw new Error("Liaison refusée par le serveur : " + e.message + retire);
      }
      // le miroir de la page suit : sinon un « Enregistrer » du catalogue effacerait la liaison
      try {
        const col = COL_SIM.find(c => LIB_STATE.colonnes.includes(c)) || COL_SIM[0];
        if (!LIB_STATE.colonnes.includes(col)) LIB_STATE.colonnes.push(col);
        const nomRef = String(p.comp["Part Name"]).trim().toUpperCase();
        const ligne = LIB_STATE.composants.find(c => String(c["Part Name"] || "").trim().toUpperCase() === nomRef);
        if (ligne) ligne[col] = rep.modeles.join(" | ");
        if (Array.isArray(LIB_STATE.fichiers.simulation) && !LIB_STATE.fichiers.simulation.includes(p.nom))
          LIB_STATE.fichiers.simulation.push(p.nom);
        LIB_STATE.cacheFichiers.delete("simulation:" + p.nom);
        libSuiteNoter("catalogue");
        if (typeof sessDiffuserLibModif === "function") sessDiffuserLibModif({ genre: "catalogue", action: "sauvegarde" });
        if (typeof rafraichirTout === "function") rafraichirTout();
        if (ligne && LIB_STATE.selection && LIB_STATE.selection._id === ligne._id && typeof inspSimAfficher === "function")
          inspSimAfficher(ligne);
      } catch (e) { console.warn(e); }
      return { modele: "lib_simulation/" + p.nom, reference: p.comp["Part Name"], modeles: rep.modeles };
    }
  };

  /* ---------- lib_composant_modifier : corriger une référence du catalogue ----------
     Les champs donnés remplacent ceux de la ligne, les autres restent ; la Part Name ne change
     pas (elle désigne la ligne). Ce qui était lu part avec la demande : le serveur refuse si la
     ligne a changé entre la carte et le clic. Une empreinte donnée est créée sous un nom neuf
     (si_absent), jamais par-dessus l'ancienne. Seules les fautes NOUVELLES refusent : celles
     que la ligne avait déjà sont montrées en remarque. */
  async function preparerModif(args) {
    const ref = String(args.reference || "").trim();
    const champs = objet(args.champs || {}, "champs");
    const neuve = args.empreinte == null ? null : objet(args.empreinte, "empreinte");
    const [cat, fichiers] = await Promise.all([apiGet("/api/lib/composants"), apiGet("/api/lib/fichiers")]);
    const cle = n => String(n || "").trim().toUpperCase();
    const vues = (cat.composants || []).filter(c => cle(c["Part Name"]) === cle(ref));
    if (!vues.length) throw new Error("« " + ref + " » n'est pas au catalogue de la LIB");
    if (vues.length > 1) throw new Error("« " + ref + " » est " + vues.length + " fois au catalogue : à corriger dans Gestion LIB");
    const comp = vues[0], erreurs = [], remarques = [];
    if (Object.keys(champs).some(k => cle(k) === "PART NAME"))
      erreurs.push("« Part Name » ne se modifie pas : elle désigne la ligne (crée une nouvelle référence)");
    const voulu = Object.assign({}, champs);
    const empreintes = (fichiers.pcb || []).map(nomEmpreinte);
    if (neuve) {
      const v = CL.verifierEmpreinte(neuve, typeof neuve.name === "string" ? neuve.name + ".json" : null);
      erreurs.push(...v.erreurs.map(e => "empreinte : " + e));
      remarques.push(...v.remarques.map(e => "empreinte : " + e));
      if (empreintes.some(n => n.toLowerCase() === String(neuve.name).toLowerCase()))
        erreurs.push("l'empreinte « " + neuve.name + " » est déjà dans la LIB (jamais d'écrasement) : donne-lui un nom neuf");
      if (voulu["Empreinte PCB"] == null) voulu["Empreinte PCB"] = neuve.name;
      else if (nomEmpreinte(voulu["Empreinte PCB"]) !== neuve.name)
        erreurs.push("« Empreinte PCB » doit désigner l'empreinte créée (" + neuve.name + ")");
    }
    // la ligne vue par le contrôle : les colonnes qu'il connaît, avant et après la modification
    const colonnes = COLONNES_CATALOGUE_39.concat("Brochage");
    const ancienne = {};
    for (const c of colonnes) if (comp[c] != null && comp[c] !== "") ancienne[c] = comp[c];
    const autres = (cat.composants || []).filter(c => c !== comp).map(c => c["Part Name"] || "");
    const defDe = async v => { const n = nomEmpreinte(v || ""); return empreintes.includes(n) ? await obtenirFichierLib("pcb", n + ".json") : null; };
    const fusion = Object.assign({}, ancienne, voulu);
    const vAvant = CL.verifierLigne(ancienne, { partNames: autres, empreintes, empreinteDef: await defDe(ancienne["Empreinte PCB"]) });
    const vApres = CL.verifierLigne(fusion, { partNames: autres, empreintes, nouvelle: neuve,
                                             empreinteDef: neuve ? null : await defDe(fusion["Empreinte PCB"]) });
    for (const e of vApres.erreurs) (vAvant.erreurs.includes(e) ? remarques : erreurs).push(vAvant.erreurs.includes(e) ? "déjà avant : " + e : e);
    remarques.push(...vApres.remarques.filter(r => !vAvant.remarques.includes(r)));
    // les cases qui changent vraiment, écrites comme le contrôle les rend (chemins lib/…, espaces ôtés)
    const changements = {};
    for (const k of Object.keys(voulu)) {
      const apres = vApres.ligne && k in vApres.ligne ? vApres.ligne[k] : String(voulu[k]).trim();
      if (apres !== String(comp[k] == null ? "" : comp[k]).trim()) changements[k] = apres;
    }
    if (!Object.keys(changements).length && !erreurs.length) erreurs.push("rien ne change : les valeurs données sont déjà celles de la ligne");
    return { erreurs, remarques, comp, changements, neuve,
             apercu: neuve || (changements["Empreinte PCB"] ? await defDe(changements["Empreinte PCB"]) : null) };
  }

  const modifier = {
    ecriture: true,
    clic: true,       // la LIB est partagée par tous les projets : jamais sans le clic, même interrupteur allumé
    irreversible: "Écrit dans la LIB partagée (pas d'annulation par la carte) : l'ancienne valeur de chaque case " +
                  "est sur la carte, pour la remettre dans Gestion LIB.",
    async proposer(args) {
      const p = await preparerModif(args);
      if (p.erreurs.length) throw new Error("Modification refusée : " + p.erreurs.join(" ; "));
      if (p.apercu) montrer(p.apercu, nomEmpreinte(p.changements["Empreinte PCB"]));
      const cases = Object.entries(p.changements);
      return {
        titre: "Modifier « " + p.comp["Part Name"] + " » dans la LIB",
        avant: cases.map(([k]) => k + " = " + (String(p.comp[k] == null ? "" : p.comp[k]).trim() || "(vide)")).join(" · "),
        apres: cases.map(([k, v]) => k + " = " + (v || "(vide)")).join(" · ") +
               (p.neuve ? " ; empreinte neuve " + p.neuve.name + " (" + p.neuve.pads.length + " pastilles)" : ""),
        details: p.remarques.length ? "Remarques : " + p.remarques.join(" ; ") : ""
      };
    },
    async appliquer(args) {
      const p = await preparerModif(args);
      if (p.erreurs.length) throw new Error("Refusé au clic (la LIB a changé depuis la carte ?) : " + p.erreurs.join(" ; "));
      let fichier = null;
      if (p.neuve) {
        fichier = p.neuve.name + ".json";
        try { await sauvegarderFichierLib("pcb", fichier, p.neuve, { si_absent: true }); }
        catch (e) { throw new Error("Empreinte non écrite : " + e.message); }
      }
      const avant = {};
      for (const k of Object.keys(p.changements)) avant[k] = p.comp[k] == null ? "" : String(p.comp[k]);
      let rep;
      try {
        rep = await apiPost("/api/lib/composants", { modifier: { part: p.comp["Part Name"], champs: p.changements, avant } });
      } catch (e) {
        // même règle que la création : on ne retire que l'empreinte écrite par cette carte, sur un vrai refus
        let retiree = "";
        if (fichier && !(e.status >= 400 && e.status < 500))
          retiree = " ; réponse incertaine : empreinte " + fichier + " gardée, vérifie la ligne avant de réessayer";
        else if (fichier) {
          try { await retirer(fichier); retiree = " ; empreinte " + fichier + " retirée"; }
          catch (e2) { retiree = " ; empreinte " + fichier + " NON retirée (" + e2.message + ") : à retirer à la main"; }
        }
        throw new Error("Modification refusée par le serveur : " + e.message + retiree);
      }
      // le miroir de la page suit : sinon un « Enregistrer » du catalogue remettrait les anciennes valeurs
      try {
        const nomRef = String(p.comp["Part Name"]).trim().toUpperCase();
        const ligne = LIB_STATE.composants.find(c => String(c["Part Name"] || "").trim().toUpperCase() === nomRef);
        if (ligne) Object.assign(ligne, rep.champs);
        if (fichier && Array.isArray(LIB_STATE.fichiers.pcb) && !LIB_STATE.fichiers.pcb.includes(fichier))
          LIB_STATE.fichiers.pcb.push(fichier);
        libSuiteNoter("catalogue");
        if (typeof sessDiffuserLibModif === "function") sessDiffuserLibModif({ genre: "catalogue", action: "sauvegarde" });
        if (typeof rafraichirTout === "function") rafraichirTout();
        oublier();
      } catch (e) { console.warn(e); }
      return { reference: p.comp["Part Name"], champs: rep.champs, empreinte: fichier ? "lib_empreinte_pcb/" + fichier : null };
    },
    refuser: () => oublier()
  };

  return {
    lib_composant_modifier: modifier,
    lib_simulation_lier: lierSim,
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
