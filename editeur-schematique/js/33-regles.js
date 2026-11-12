"use strict";
/* =============================================================================
   editeur-schematique — 33-regles.js
   Contrôle des règles du schéma (docs/regles/02-schema.md) qu'un programme peut
   juger sur le document : cartouche (S3), repères normalisés (S6), uniques et
   numérotés (S7), paires nommées (S13), référence fabricant (S27), empreinte
   liée (S29), ERC (S34). Fenêtre et résultat : commun/regles-controle.js.
   ============================================================================= */

/* S6 : préfixes admis en plus de celui de la bibliothèque (usages courants). */
const SCH_REGLES_PREFIXES = { J: ["P", "CN", "X"], SW: ["S"], FB: ["L", "E"], D: ["LED"], Y: ["X", "XTAL"], U: ["IC"], RV: ["R", "VR"], BT: ["B"] };

function schReglesControler() {
  const tous = [];
  S.pages.forEach((p, i) => { for (const el of (i === S.page ? S.comps : (p.comps || []))) tous.push(el); });
  // les composants qui portent un repère et partent sur la carte
  const comps = tous.filter(el => { const d = defOf(el.type); return !d.noRef && d.p !== "MECA"; });

  const prefixes = [], numeros = [], vus = new Map();
  for (const el of comps) {
    const ref = String(el.ref || "").trim(), attendu = defOf(el.type).p;
    if (!/^[A-Z]+[0-9]+[A-Z]?$/i.test(ref)) { numeros.push("« " + (ref || "sans repère") + " » (" + defOf(el.type).n + ") : repère sans numéro."); continue; }
    const k = ref.toUpperCase() + (el.part || "");
    vus.set(k, (vus.get(k) || 0) + 1);
    const pre = ref.match(/^[A-Z]+/i)[0].toUpperCase();
    if (/^[A-Z]+$/.test(attendu || "") && pre !== attendu && !(SCH_REGLES_PREFIXES[attendu] || []).includes(pre))
      prefixes.push(ref + " (" + defOf(el.type).n + ") : préfixe attendu « " + attendu + " ».");
  }
  for (const [k, n] of vus) if (n > 1) numeros.push(k + " : repère porté par " + n + " composants.");

  // S13 : une paire _P / _N, + / -, se nomme des deux côtés
  const nets = new Set(docNets().groups.map(g => String(g.name || "")));
  const paires = [];
  for (const n of nets) {
    const m = n.match(/^(.+)(_P|\+|-)$/);
    if (!m) continue;
    const autre = m[1] + ({ "_P": "_N", "+": "-", "-": "+" })[m[2]];
    if (!nets.has(autre)) paires.push("« " + n + " » sans « " + autre + " ».");
  }

  const achat = comps.filter(el => defOf(el.type).p !== "TP" && !(el.mpn || el.csvMpn)).map(el => el.ref || "?");
  const fp = comps.filter(el => !(el.pkg || el.fpPcb)).map(el => el.ref || "?");
  const erc = ercVerifier().filter(r => r.niveau === "erreur").map(r => r.msg + " (f" + (r.page + 1) + ")");

  return reglesResultat([
    ["S3", "Cartouche renseigné", reglesCartouche(S.cartoucheInfo)],
    ["S6", "Repères normalisés", prefixes],
    ["S7", "Repères uniques et numérotés", numeros],
    ["S13", "Paires nommées des deux côtés", paires],
    ["S27", "Référence fabricant sur chaque composant", achat.length ? [achat.length + " sans référence fabricant : " + reglesListe(achat) + "."] : []],
    ["S29", "Empreinte liée", fp.length ? [fp.length + " sans empreinte : " + reglesListe(fp) + "."] : []],
    ["S34", "ERC sans erreur", erc]
  ]);
}

function schReglesOuvrir() { return reglesFenetre("Contrôle des règles du schéma", schReglesControler); }
