/* ==========================================================================
   Socle des cartes en lot de Claude dans les pages WEB_CAO
   --------------------------------------------------------------------------
   Une carte du canal de pilotage porte un LOT : tout est vérifié avant la
   carte, revérifié au clic, puis appliqué en une seule étape d'historique.
   Un seul refus et rien n'est changé. Sert au dessin du schéma
   (editeur-schematique/js/28-dessin-pilote.js) ; le routage
   (editeur-pcb/js/37-routage-pilote.js) en reprend pousser et le bilan du DRC.
   ========================================================================== */
"use strict";

const ECRITURE_CAO = (function () {
  const LOT_MAX = 50;                                   // éléments par carte
  const montrer = v => v === undefined || v === null || v === "" ? "—" : typeof v === "object" ? JSON.stringify(v) : String(v);

  /* Une commande d'écriture du canal, faite d'un lot. `def` :
     - titre : le titre de la carte ; max : le plafond du lot (LOT_MAX par défaut) ;
     - verifier(args) → {lignes:[{quoi, avant, apres}], refus:[]} sans rien toucher ;
     - muter(args) : applique, sans push() ;
     - rafraichir() : redessine la page.
     La carte garde ses lignes : au clic, si la vérification ne redonne pas les mêmes (le
     document a bougé sous la carte), rien n'est appliqué. */
  function lot(def) {
    const verifier = args => {
      const liste = args && args.lot;
      if (!Array.isArray(liste) || !liste.length) throw new Error("« lot » : une liste d'au moins un élément.");
      const max = def.max || LOT_MAX;
      if (liste.length > max) throw new Error("Lot trop long : " + liste.length + " éléments, " + max + " au plus par carte.");
      const v = def.verifier(args);
      if (v.refus.length) throw new Error("Rien n'est changé : " + v.refus.join(" ; ") + ".");
      if (!v.lignes.length) throw new Error("Rien à changer : tout est déjà à ces valeurs.");
      return v;
    };
    return {
      ecriture: true,
      historique: true,                                 // une étape dans l'historique de l'éditeur : Ctrl+Z la défait
      proposer: args => {
        const v = verifier(args);
        return { titre: def.titre + " (" + v.lignes.length + " changement" + (v.lignes.length > 1 ? "s" : "") + ")",
                 avant: v.lignes.map(l => l.quoi + " : " + montrer(l.avant)).join("\n"),
                 apres: v.lignes.map(l => l.quoi + " : " + montrer(l.apres)).join("\n"),
                 lignes: JSON.stringify(v.lignes) };
      },
      appliquer: (args, prop) => {
        const v = verifier(args);
        if (prop && prop.lignes !== undefined && JSON.stringify(v.lignes) !== prop.lignes)
          throw new Error("Le document a changé depuis la carte : rien n'est appliqué, à reproposer.");
        const redo = Array.isArray(S.redo) ? S.redo.slice() : null;   // push() vide la pile de rétablissement
        pousser();
        try { def.muter(args); }
        catch (e) {
          // un lot à moitié appliqué serait pire qu'un refus : retour à l'instantané qu'on vient de pousser,
          // et la pile de rétablissement d'avant (undo y mettrait l'état à moitié fait)
          undo();
          if (redo) S.redo.splice(0, S.redo.length, ...redo);
          def.rafraichir();
          throw new Error("Échec en appliquant, rien n'est changé : " + ((e && e.message) || e));
        }
        def.rafraichir();
      },
    };
  }

  /* L'étape d'historique d'un lot de Claude : l'instantané porte une espace finale (JSON.parse
     l'ignore), à laquelle les éditeurs reconnaissent les lots qu'ils peuvent fondre entre eux
     quand la pile est pleine (histBorner), plutôt que de chasser les étapes de l'utilisateur. */
  function pousser() {
    if (typeof pushSnap === "function") pushSnap(serialize() + " ");   // PCB
    else push(serialize() + " ");                                       // schéma
  }

  /* ---------- DRC avant → après (PCB) ---------- */
  const DRC_MAX = 80;
  function erreursDrc() { return runDrc().filter(d => !d.info); }
  // par message, avec leur nombre : une erreur qui a seulement bougé avec sa pastille n'est pas neuve
  function bilanDrc(avant, apres) {
    const restant = new Map();
    for (const d of avant) restant.set(d.msg, (restant.get(d.msg) || 0) + 1);
    const neuves = apres.filter(d => { const n = restant.get(d.msg) || 0; restant.set(d.msg, n - 1); return n <= 0; });
    const pl = n => n + " erreur" + (n > 1 ? "s" : "");
    const lignes = ["DRC : " + pl(avant.length) + " avant → " + apres.length + " après."];
    if (neuves.length) lignes.push("Nouvelles erreurs (" + neuves.length + ") :");
    for (const d of neuves.slice(0, DRC_MAX)) lignes.push("- " + d.msg + " (x " + r3(d.x) + " y " + r3(d.y) + " mm)");
    if (neuves.length > DRC_MAX) lignes.push("... (" + (neuves.length - DRC_MAX) + " de plus : cao_drc les liste)");
    return lignes.join("\n");
  }

  return { lot, pousser, drc: { erreurs: erreursDrc, bilan: bilanDrc } };   // drc : repris par le routage (37-routage-pilote.js)
})();
