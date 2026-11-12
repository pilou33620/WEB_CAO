"use strict";
/* =============================================================================
   commun/regles-controle.js — le contrôle des règles de conception (docs/regles/),
   commun aux deux éditeurs, comme le bouton Règles de WEB_3D : bouton Règles du ruban
   (fenêtre ci-dessous), console de la page (reglesTexte(schReglesControler()),
   reglesTexte(pcbReglesControler())) ou outil MCP cao_regles.
   Chaque éditeur vérifie sur son document les règles qu'un programme peut juger
   (schReglesControler, pcbReglesControler) et rend
     { ok, controles:[{ regle, nom, ok, ecarts:[texte] }] }.
   Le contrôle ne change rien au document. Le reste des règles se relit à la main.
   ============================================================================= */

const REGLES_PAGE = "../docs/regles/regles.html";
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

/* La fenêtre : `controler` est relancé par ⟳. */
function reglesFenetre(titre, controler) {
  const echap = t => String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  let d = document.getElementById("reglesCtl");
  if (!d) {
    d = document.createElement("div");
    d.id = "reglesCtl"; d.className = "modal"; d.hidden = true;
    d.setAttribute("role", "dialog"); d.setAttribute("aria-modal", "true"); d.setAttribute("aria-labelledby", "reglesCtlTitre");
    d.innerHTML =
      '<div class="modal-box" style="width:min(760px,94vw);height:auto;max-height:84vh">' +
        '<header class="modal-head">' +
          '<span class="modal-title" id="reglesCtlTitre"></span>' +
          '<a class="pnl-btn" href="' + REGLES_PAGE + '" target="_blank" rel="noopener" title="Les règles, chacune avec son pourquoi" style="text-decoration:none">📏</a>' +
          '<button class="pnl-btn" id="reglesCtlRelancer" title="Relancer le contrôle" type="button">⟳</button>' +
          '<button class="pnl-btn" id="reglesCtlFermer" title="Fermer" type="button">✕</button>' +
        '</header>' +
        '<div id="reglesCtlResume" style="padding:8px 14px;color:var(--txt-dim)"></div>' +
        '<div id="reglesCtlListe" style="overflow:auto;padding:0 14px 12px;flex:1"></div>' +
      '</div>';
    document.body.appendChild(d);
    const fermer = () => { d.hidden = true; };
    document.getElementById("reglesCtlFermer").onclick = fermer;
    d.addEventListener("click", e => { if (e.target === d) fermer(); });
    d.addEventListener("keydown", e => { if (e.key === "Escape") fermer(); });
  }
  const afficher = () => {
    const r = controler(), ko = r.controles.filter(c => !c.ok).length;
    document.getElementById("reglesCtlTitre").textContent = titre;
    document.getElementById("reglesCtlResume").textContent = ko
      ? ko + " règle(s) sur " + r.controles.length + " en écart. Seules les règles qu'un programme peut juger sont contrôlées : le reste se relit sur la page Règles (📏)."
      : "Les " + r.controles.length + " règles vérifiables sont respectées. Le reste se relit sur la page Règles (📏).";
    document.getElementById("reglesCtlListe").innerHTML = r.controles.map(c =>
      '<div style="padding:6px 0;border-bottom:1px solid var(--border)">' +
        '<span style="color:' + (c.ok ? "#3fb950" : "#f59e0b") + '">' + (c.ok ? "✓" : "✗") + '</span> ' +
        '<b>' + echap(c.regle) + '</b> — ' + echap(c.nom) + (c.ok ? "" : ' <span style="color:var(--txt-dim)">(' + c.ecarts.length + ')</span>') +
        (c.ok ? "" : '<ul style="margin:4px 0 0 18px;padding:0">' +
          c.ecarts.slice(0, REGLES_MAX_ECARTS).map(e => "<li>" + echap(e) + "</li>").join("") +
          (c.ecarts.length > REGLES_MAX_ECARTS ? "<li>… et " + (c.ecarts.length - REGLES_MAX_ECARTS) + " de plus</li>" : "") + "</ul>") +
      '</div>').join("");
    return r;
  };
  document.getElementById("reglesCtlRelancer").onclick = afficher;
  const r = afficher();
  d.hidden = false;
  return r;
}
