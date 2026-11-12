"use strict";
/* =============================================================================
   Éditeur PCB — 53-regles-controle.js
   Contrôle des règles de la carte (docs/regles/01-conception.md, 03-routage.md)
   qu'un programme peut juger et que le DRC ne voit pas : cartouche (C46),
   empilage symétrique (C7), repères de pose (C30), sérigraphie lisible (C36),
   anneaux des vias et des traversants (R16), points de test (C39) ; puis le DRC
   lui-même (R1). Fenêtre et résultat : commun/regles-controle.js.
   ============================================================================= */

// shortcut: un seul anneau minimal (conception, classes 2 et 3), sans classe IPC saisie ; à lier à une classe du document si elle apparaît
const REGLES_ANNEAU_MIN = 0.05;        // mm
const REGLES_SILK_H = 0.8, REGLES_SILK_TRAIT = 0.15;   // mm (C36)
const reglesMm = x => String(+(+x).toFixed(3)).replace(".", ",") + " mm";

function pcbReglesEmpilage() {
  const st = S.stack, e = [];
  if (!st) return e;
  const sym = (tab, quoi) => {
    for (let i = 0, j = tab.length - 1; i < j; i++, j--)
      if (Math.abs((tab[i].t || 0) - (tab[j].t || 0)) > 1e-4)
        e.push(quoi + " " + (i + 1) + " (" + reglesMm(tab[i].t) + ") et " + (j + 1) + " (" + reglesMm(tab[j].t) + ") : épaisseurs différentes de part et d'autre du milieu.");
  };
  sym(st.cu || [], "Cuivres");
  sym(st.di || [], "Diélectriques");
  return e;
}

function pcbReglesFiducials() {
  const fid = fp => /^FID/i.test(fp.ref || "") || /fiduc/i.test((fp.pkg || "") + " " + (fp.value || ""));
  const e = [];
  for (const side of [0, 1]) {
    if (!S.fps.some(fp => (fp.side ? 1 : 0) === side && !fid(fp))) continue;     // face non peuplée
    const n = S.fps.filter(fp => (fp.side ? 1 : 0) === side && fid(fp)).length;
    if (n < 3) e.push("Face " + (side ? "dessous" : "dessus") + " peuplée : " + n + " repère(s) de pose (FID…), 3 attendus.");
  }
  return e;
}

function pcbReglesSerigraphie() {
  const e = [], silk = l => l === "silkT" || l === "silkB";
  const juger = (qui, h, w) => {
    if (h < REGLES_SILK_H - 1e-6) e.push(qui + " : texte de " + reglesMm(h) + " de haut (≥ " + reglesMm(REGLES_SILK_H) + ").");
    else if (w < REGLES_SILK_TRAIT - 1e-6) e.push(qui + " : trait de " + reglesMm(w) + " (≥ " + reglesMm(REGLES_SILK_TRAIT) + ").");
  };
  for (const fp of S.fps) {
    const r = fpTextPos(fp).ref;
    if (r.imprime) juger("Repère " + fp.ref, r.size, r.w);
    for (const d of fpDessinsMonde(fp)) if (d.shape === "text" && silk(d.layer)) juger("Texte « " + d.text + " » de " + fp.ref, d.size || 0, d.width || 0);
  }
  for (const d of S.drawings) if (d.shape === "text" && silk(d.layer)) juger("Texte « " + d.text + " »", d.size || 0, d.width || 0);
  return e;
}

function pcbReglesAnneaux() {
  const e = [], vias = new Map();
  for (const v of S.vias) {
    const a = (v.d - v.drill) / 2;
    if (a < REGLES_ANNEAU_MIN - 1e-9) {
      const k = reglesMm(v.d) + " percé " + reglesMm(v.drill);
      vias.set(k, (vias.get(k) || 0) + 1);
    }
  }
  for (const [k, n] of vias) e.push(n + " via(s) Ø " + k + " : anneau sous " + reglesMm(REGLES_ANNEAU_MIN) + ".");
  for (const fp of S.fps) {
    const bad = padsWorld(fp).filter(q => q.drill > 0 && (Math.min(q.w, q.h) - q.drill) / 2 < REGLES_ANNEAU_MIN - 1e-9);
    if (bad.length) e.push(fp.ref + " : " + bad.length + " pastille(s) traversante(s) à l'anneau sous " + reglesMm(REGLES_ANNEAU_MIN) + " (ex. " + reglesMm(bad[0].w) + " percée " + reglesMm(bad[0].drill) + ").");
  }
  return e;
}

function pcbReglesPointsTest() {
  const tp = fp => /^TP/i.test(fp.ref || ""), compte = new Map(), testes = new Set();
  for (const fp of S.fps) for (const q of padsWorld(fp)) {
    if (!q.net) continue;
    if (tp(fp)) testes.add(q.net);
    else compte.set(q.net, (compte.get(q.net) || 0) + 1);
  }
  const sans = [...compte].filter(([n, c]) => c >= 2 && !testes.has(n)).map(([n]) => n).sort();
  if (!sans.length) return [];
  return [sans.length + " net(s) sans point de test (TP…) : " + reglesListe(sans) + "."];
}

function pcbReglesControler() {
  const drc = runDrc().filter(x => !x.info).map(x => x.msg);
  return reglesResultat([
    ["C46", "Cartouche renseigné", reglesCartouche(S.cartoucheInfo)],
    ["C7", "Empilage symétrique", pcbReglesEmpilage()],
    ["C30", "Repères de pose : 3 par face peuplée", pcbReglesFiducials()],
    ["C36", "Sérigraphie lisible (≥ 0,8 mm, trait ≥ 0,15 mm)", pcbReglesSerigraphie()],
    ["R16", "Anneau des vias et des traversants (≥ 0,05 mm)", pcbReglesAnneaux()],
    ["C39", "Un point de test par net", pcbReglesPointsTest()],
    ["R1", "DRC sans erreur", drc]
  ]);
}

function pcbReglesOuvrir() {
  const r = reglesFenetre("Contrôle des règles de la carte", pcbReglesControler);
  draw();                                   // le DRC relancé : ses marques à jour
  return r;
}
