"use strict";
/* =============================================================================
   commun/regles-controle.js — le contrôle des règles de conception (docs/regles/),
   commun aux deux éditeurs. Il sert à Claude in Chrome, sans bouton : depuis la
   console de la page, reglesTexte(schReglesControler()) ou reglesTexte(pcbReglesControler()).
   Chaque éditeur vérifie sur son document les règles qu'un programme peut juger
   (schReglesControler, pcbReglesControler) et rend
     { ok, controles:[{ regle, nom, ok, ecarts:[texte] }] }.
   Le contrôle ne change rien au document. Le reste des règles se relit à la main.
   ============================================================================= */

const REGLES_MAX_ECARTS = 40;            // par règle : au-delà, on compte sans lister

/* [[repère, nom, écarts], …] → le résultat. */
function reglesResultat(lignes) {
  const controles = lignes.map(([regle, nom, ecarts]) => ({ regle, nom, ok: !ecarts.length, ecarts }));
  return { ok: controles.every(c => c.ok), controles };
}

/* C46 / S3 : le cartouche dit quoi, qui et quand (commun/cartouche.js). */
function reglesCartouche(info) {
  const i = typeof cartoucheInfoNorm === "function" ? cartoucheInfoNorm(info) : (info || {}), e = [];
  const projet = typeof projNom === "function" ? projNom() : "";
  if (!i.titre && !projet) e.push("Cartouche : titre absent (ni titre saisi, ni projet ouvert).");
  if (!i.dessine) e.push("Cartouche : « Dessiné par » vide.");
  if (!i.dateDessin) e.push("Cartouche : date de dessin vide.");
  return e;
}

/* « 3 de plus » plutôt que mille lignes. */
function reglesListe(noms, max) {
  const m = max || 12;
  return noms.length <= m ? noms.join(", ") : noms.slice(0, m).join(", ") + " … (+" + (noms.length - m) + ")";
}

/* Le résultat en texte : console, compte rendu. */
function reglesTexte(r) {
  const L = [r.ok ? "Règles vérifiables : toutes respectées." : "Règles vérifiables : des écarts."];
  for (const c of r.controles) {
    L.push((c.ok ? "✓ " : "✗ ") + c.regle + " — " + c.nom + (c.ok ? "" : " (" + c.ecarts.length + ")"));
    for (const e of c.ecarts.slice(0, REGLES_MAX_ECARTS)) L.push("    · " + e);
    if (c.ecarts.length > REGLES_MAX_ECARTS) L.push("    · … et " + (c.ecarts.length - REGLES_MAX_ECARTS) + " de plus");
  }
  return L.join("\n");
}
