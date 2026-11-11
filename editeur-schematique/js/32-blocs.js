"use strict";
/* =============================================================================
   editeur-schematique — 32-blocs.js
   Blocs réutilisables : une sélection (étage LDO, pont USB…) enregistrée sous
   un nom, puis reposée dans n'importe quel schéma, d'un projet à l'autre.
   Le contenu est celui du presse-papier (clipContent, 10-actions.js) et se
   pose par pasteClip : repères refaits, composants et fils normalisés.
   Les blocs vivent dans ce navigateur (localStorage, comme le presse-papier) ;
   « Exporter » / « Importer » les font passer sur un autre poste.
   ============================================================================= */

const BLOCS_KEY = "schemedit.blocs";
const BLOCS_MAX_OCTETS = 4e6;          // fichier importé : au-delà, refusé

function blocsLire() {
  try {
    const l = JSON.parse(localStorage.getItem(BLOCS_KEY) || "[]");
    return Array.isArray(l) ? l.filter(blocValide) : [];
  } catch (_) { return []; }
}
function blocsEcrire(l) {
  try { localStorage.setItem(BLOCS_KEY, JSON.stringify(l)); return true; }
  catch (_) { return false; }            // quota plein, mode privé
}
function blocValide(b) {
  const c = b && b.contenu;
  return !!(b && typeof b.nom === "string" && b.nom.trim() && c && typeof c === "object" &&
    [c.comps, c.wires, c.drawings].some(Array.isArray));
}
/* La sélection courante devient le bloc `nom` (un bloc du même nom est remplacé). */
function blocEnregistrer(nom) {
  nom = String(nom || "").trim().slice(0, 60);
  if (!nom) return { ok: false, msg: "Donnez un nom au bloc." };
  const contenu = clipContent();
  if (!contenu) return { ok: false, msg: "Sélectionnez d'abord des composants et des fils." };
  const l = blocsLire().filter(b => b.nom.toLowerCase() !== nom.toLowerCase());
  l.push({ nom, date: new Date().toISOString().slice(0, 10), contenu });
  l.sort((a, b) => triFr(a.nom, b.nom));
  if (!blocsEcrire(l)) return { ok: false, msg: "Le navigateur refuse d'enregistrer (stockage plein ou mode privé)." };
  return { ok: true, msg: "Bloc « " + nom + " » enregistré : " + contenu.comps.length + " composant(s), " + contenu.wires.length + " fil(s)." };
}
/* Pose le bloc au centre de la vue. */
function blocPoser(nom) {
  const b = blocsLire().find(x => x.nom === nom);
  if (!b) return false;
  const W = cv.clientWidth || 800, H = cv.clientHeight || 600;
  S.mouse = { x: (W / 2 - S.ox) / S.scale, y: (H / 2 - S.oy) / S.scale };
  /* un fil nommé garde son nom au collage (même nom = même net) : posé deux fois, le bloc
     reliait ses « FB » entre eux. Un nom déjà pris sur le schéma reçoit un suffixe. */
  const pris = new Set();
  S.pages.forEach((p, i) => { for (const w of (i === S.page ? S.wires : p.wires || [])) if (w.net) pris.add(w.net); });
  const neuf = new Map();
  const libre = n => { if (!neuf.has(n)) { let k = 2; while (pris.has(n + "_" + k)) k++; neuf.set(n, n + "_" + k); pris.add(n + "_" + k); } return neuf.get(n); };
  const contenu = Object.assign({}, b.contenu, { wires: (b.contenu.wires || []).map(w => w.net && pris.has(w.net) ? Object.assign({}, w, { net: libre(w.net) }) : w) });
  pasteClip(contenu);
  return true;
}
function blocSupprimer(nom) { blocsEcrire(blocsLire().filter(b => b.nom !== nom)); }
/* Fusionne les blocs d'un fichier : un nom déjà pris est remplacé. */
function blocsImporterTexte(txt) {
  if (String(txt).length > BLOCS_MAX_OCTETS) return { ok: false, msg: "Fichier trop gros." };
  let l;
  try { l = JSON.parse(txt); } catch (_) { return { ok: false, msg: "Fichier illisible (JSON attendu)." }; }
  if (l && !Array.isArray(l) && Array.isArray(l.blocs)) l = l.blocs;
  if (!Array.isArray(l)) return { ok: false, msg: "Aucun bloc dans ce fichier." };
  const neufs = l.filter(blocValide).map(b => ({ nom: b.nom.trim().slice(0, 60), date: String(b.date || "").slice(0, 10), contenu: b.contenu }));
  if (!neufs.length) return { ok: false, msg: "Aucun bloc valable dans ce fichier." };
  const noms = new Set(neufs.map(b => b.nom.toLowerCase()));
  const tout = blocsLire().filter(b => !noms.has(b.nom.toLowerCase())).concat(neufs).sort((a, b) => triFr(a.nom, b.nom));
  if (!blocsEcrire(tout)) return { ok: false, msg: "Le navigateur refuse d'enregistrer (stockage plein ou mode privé)." };
  return { ok: true, msg: neufs.length + " bloc(s) importé(s)." };
}

/* ---------- fenêtre ---------- */
function blocsConstruire() {
  let d = document.getElementById("blocsEd");
  if (d) return d;
  d = document.createElement("div");
  d.id = "blocsEd"; d.className = "modal"; d.hidden = true;
  d.setAttribute("role", "dialog"); d.setAttribute("aria-modal", "true"); d.setAttribute("aria-labelledby", "blocsTitre");
  d.innerHTML =
    '<div class="modal-box" style="width:min(560px,94vw);max-height:84vh">' +
      '<header class="modal-head">' +
        '<span class="modal-title" id="blocsTitre">Blocs réutilisables</span>' +
        '<button class="pnl-btn" id="blocsFermer" title="Fermer" type="button">✕</button>' +
      '</header>' +
      '<form id="blocsForm" style="display:flex;gap:6px;padding:10px 14px">' +
        '<input id="blocsNom" maxlength="60" placeholder="Nom du bloc (ex. LDO 3V3)" style="flex:1">' +
        '<button class="tb on" type="submit">＋ Enregistrer la sélection</button>' +
      '</form>' +
      '<div id="blocsMsg" style="padding:0 14px;color:var(--txt-dim)"></div>' +
      '<div id="blocsListe" style="overflow:auto;padding:6px 14px;flex:1"></div>' +
      '<div style="display:flex;gap:6px;padding:8px 14px 12px">' +
        '<button class="tb" id="blocsExporter" type="button">⇩ Exporter .json</button>' +
        '<button class="tb" id="blocsImporter" type="button">⇧ Importer .json</button>' +
        '<input type="file" id="blocsFichier" accept=".json,application/json" hidden>' +
      '</div>' +
    '</div>';
  document.body.appendChild(d);
  const msg = t => { document.getElementById("blocsMsg").textContent = t; };
  document.getElementById("blocsFermer").onclick = blocsFermer;
  document.getElementById("blocsForm").onsubmit = e => {
    e.preventDefault();
    const r = blocEnregistrer(document.getElementById("blocsNom").value);
    blocsRendre(); msg(r.msg);
  };
  document.getElementById("blocsExporter").onclick = () => {
    const l = blocsLire();
    if (!l.length) { msg("Aucun bloc à exporter."); return; }
    dl(new Blob([JSON.stringify({ format: "schblocs-1", blocs: l }, null, 1)], { type: "application/json" }), "blocs-schema.json");
  };
  const fic = document.getElementById("blocsFichier");
  document.getElementById("blocsImporter").onclick = () => fic.click();
  fic.onchange = () => {
    const f = fic.files && fic.files[0];
    fic.value = "";
    if (!f) return;
    if (f.size > BLOCS_MAX_OCTETS) { msg("Fichier trop gros."); return; }
    f.text().then(t => { const r = blocsImporterTexte(t); blocsRendre(); msg(r.msg); });
  };
  d.addEventListener("click", e => {
    if (e.target === d) { blocsFermer(); return; }
    const b = e.target.closest && e.target.closest("[data-bloc]");
    if (!b) return;
    const nom = blocsLire()[+b.dataset.i];
    if (!nom) return;
    if (b.dataset.bloc === "poser") { blocsFermer(); blocPoser(nom.nom); }
    else if (confirm("Supprimer le bloc « " + nom.nom + " » ?")) { blocSupprimer(nom.nom); blocsRendre(); }
  });
  d.addEventListener("keydown", e => { if (e.key === "Escape") blocsFermer(); });
  return d;
}
function blocsRendre() {
  const d = blocsConstruire(), l = blocsLire();
  document.getElementById("blocsListe").innerHTML = l.length ? l.map((b, i) =>
    '<div style="display:flex;align-items:center;gap:6px;padding:4px 0;border-bottom:1px solid var(--border)">' +
      '<span style="flex:1">' + esc(b.nom) + ' <span style="color:var(--txt-dim)">· ' +
        (b.contenu.comps || []).length + ' comp. · ' + esc(b.date || "") + '</span></span>' +
      '<button class="tb" type="button" data-bloc="poser" data-i="' + i + '">Poser</button>' +
      '<button class="pnl-btn" type="button" data-bloc="suppr" data-i="' + i + '" title="Supprimer">🗑</button>' +
    '</div>').join("")
    : '<p style="color:var(--txt-dim)">Aucun bloc. Sélectionnez un étage sur la feuille, nommez-le, puis « Enregistrer la sélection ».</p>';
}
function blocsOuvrir() {
  const d = blocsConstruire();
  document.getElementById("blocsMsg").textContent = "Rangés dans ce navigateur, pour tous les projets. Exporter pour un autre poste.";
  blocsRendre();
  d.hidden = false;
  document.getElementById("blocsNom").focus();
}
function blocsFermer() {
  const d = document.getElementById("blocsEd");
  if (d) d.hidden = true;
}
