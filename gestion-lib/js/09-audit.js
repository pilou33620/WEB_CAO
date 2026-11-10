"use strict";
/* =============================================================================
   Gestion LIB — 09-audit.js
   Audit de cohérence du catalogue : chaque référence passe par
   COMPOSANTS_LIB.auditerReference (commun/composants-lib.js) avec son
   empreinte et son symbole lus dans la LIB. Ce qui en sort : références sans
   empreinte, sans symbole, sans modèle ou sans datasheet, fichiers cités mais
   absents, nombre de broches du symbole face au nombre de pastilles, brochage
   qui cite une patte absente. Rien n'est écrit ; un clic ouvre la référence.
   ============================================================================= */

const AUDIT_LIB = { resultats: [], erreursSeules: false };

/* Lit les fichiers cités (une fois chacun, obtenirFichierLib garde un cache) et
   rend [{ comp, erreurs, remarques }] pour les références qui ont quelque chose à dire. */
async function auditerCatalogue(avancement) {
  const CL = COMPOSANTS_LIB, F = LIB_STATE.fichiers || {};
  const pcbConnues = F.pcb || [], schConnues = F.schematique || [];
  const present = (liste, nom) => liste.find(f => CL.nomDeChemin(f).toLowerCase() === nom.toLowerCase());
  const colSch = LIB_STATE.colonnes.includes("Empreinte Schématique") ? "Empreinte Schématique" : "Empreinte Schematique";
  const out = [], liste = LIB_STATE.composants;
  for (let i = 0; i < liste.length; i++) {
    const comp = liste[i];
    const nomPcb = CL.nomDeChemin(comp["Empreinte PCB"]), nomSym = CL.nomDeChemin(comp[colSch]);
    const fPcb = nomPcb && present(pcbConnues, nomPcb);
    const fSym = nomSym && !Object.prototype.hasOwnProperty.call(CL.SYMBOLES, nomSym.toLowerCase()) && present(schConnues, nomSym);
    const empreinte = fPcb ? await obtenirFichierLib("pcb", fPcb) : null;
    const symbole = fSym ? await obtenirFichierLib("schematique", fSym) : null;
    const r = CL.auditerReference(comp, { empreinte, symbole, pcbConnues, schConnues });
    if (r.erreurs.length || r.remarques.length) out.push({ comp, erreurs: r.erreurs, remarques: r.remarques });
    if (avancement && i % 25 === 0) avancement(i, liste.length);
  }
  return out;
}

function auditConstruire() {
  let m = document.getElementById("modalAuditLib");
  if (m) return m;
  m = document.createElement("div");
  m.className = "modal-overlay"; m.id = "modalAuditLib"; m.hidden = true; m.style.display = "none";
  m.innerHTML =
    '<div class="modal-box" style="width:min(860px,95vw);max-height:86vh;display:flex;flex-direction:column">' +
      '<div class="modal-head"><h3>Audit de cohérence du catalogue</h3>' +
        '<button class="tb mini" type="button" id="auditFermer">✕</button></div>' +
      '<div class="modal-body" style="overflow:auto;flex:1">' +
        '<div style="display:flex;gap:10px;align-items:center;margin-bottom:8px">' +
          '<span id="auditResume" style="flex:1"></span>' +
          '<label><input type="checkbox" id="auditErreursSeules"> Erreurs seulement</label>' +
          '<button class="tb mini" type="button" id="auditRelancer">⟳ Relancer</button>' +
        '</div>' +
        '<div id="auditListe"></div>' +
      '</div>' +
    '</div>';
  document.body.appendChild(m);
  m.addEventListener("click", e => {
    if (e.target === m) { auditFermer(); return; }
    const li = e.target.closest && e.target.closest("[data-audit]");
    if (li) { auditFermer(); selectionnerComposant(+li.dataset.audit); }
  });
  document.getElementById("auditFermer").onclick = auditFermer;
  document.getElementById("auditRelancer").onclick = auditOuvrir;
  document.getElementById("auditErreursSeules").onchange = e => { AUDIT_LIB.erreursSeules = e.target.checked; auditRendre(); };
  return m;
}
function auditRendre() {
  const res = AUDIT_LIB.resultats, total = LIB_STATE.composants.length;
  const nE = res.filter(r => r.erreurs.length).length;
  document.getElementById("auditResume").textContent = res.length
    ? total + " références : " + nE + " avec erreur(s), " + (res.length - nE) + " avec remarque(s) seulement. Un clic ouvre la référence."
    : total + " références, aucune remarque.";
  const vues = AUDIT_LIB.erreursSeules ? res.filter(r => r.erreurs.length) : res;
  document.getElementById("auditListe").innerHTML = vues.map(r =>
    '<div data-audit="' + r.comp._id + '" style="cursor:pointer;padding:6px 4px;border-bottom:1px solid var(--border)">' +
      '<b>' + esc(r.comp["Part Name"] || "(sans nom)") + '</b>' +
      r.erreurs.map(e => '<div style="color:#ef4444">⛔ ' + esc(e) + '</div>').join("") +
      r.remarques.map(e => '<div style="color:var(--txt-dim)">ℹ️ ' + esc(e) + '</div>').join("") +
    '</div>').join("");
}
async function auditOuvrir() {
  const m = auditConstruire();
  m.hidden = false; m.style.display = "flex";
  const resume = document.getElementById("auditResume");
  document.getElementById("auditListe").innerHTML = "";
  resume.textContent = "Lecture des empreintes et des symboles…";
  AUDIT_LIB.resultats = await auditerCatalogue((i, n) => { resume.textContent = "Lecture… " + i + " / " + n; });
  auditRendre();
}
function auditFermer() {
  const m = document.getElementById("modalAuditLib");
  if (m) { m.hidden = true; m.style.display = "none"; }
}
