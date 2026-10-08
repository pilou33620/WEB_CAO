"use strict";
/* =============================================================================
   editeur-schematique — 25-brochage.js
   Brochage par référence : broche du symbole → patte de l'empreinte.

   Le symbole générique (AOP, transistor, régulateur…) ne dit que ses broches.
   La référence choisie dans la LIB porte, colonne « Brochage », la patte de
   l'empreinte où chacune tombe (commun/brochage.js pour la syntaxe). Le choix
   de la référence recopie cette table sur le composant (`el.pinMap`, une patte
   par broche) : le schéma reste complet si la LIB change, et la fenêtre
   « Détails du composant » la retouche à la main.

   Ce que portent les composants :
     el.brochage    le texte de la colonne, tel que la LIB l'a donné
     el.part        la partie (A, B…) d'un composant à plusieurs parties
     el.pinMap      [patte de la broche 1, patte de la broche 2, …]
     el.pinMapMain  vrai si la table a été retouchée à la main

   Sans table, la broche n va sur la patte n, comme avant. C'est exact pour un
   CI dont on a saisi le brochage dans l'ordre des pattes, et faux pour un
   symbole générique dès que son ordre n'est pas celui du boîtier : c'est ce
   que brControles() signale.
   ============================================================================= */

/* ---------- broches et pattes ---------- */

/* Nom d'une broche : celui saisi sur le composant, sinon celui du symbole. */
function brNomBroche(el, i) {
  const nm = el && Array.isArray(el.pinNames) ? el.pinNames[i] : "";
  if (nm) return String(nm);
  const def = defOf(el.type);
  return (def.pn && def.pn[i]) || "";
}
/* Patte de l'empreinte où va la broche i. Un nombre reste un nombre — la
   netlist écrit « U1.8 » comme avant —, un nom (« A1 ») reste un nom. */
function brPatte(el, i) {
  const p = el && Array.isArray(el.pinMap) ? String(el.pinMap[i] == null ? "" : el.pinMap[i]).trim() : "";
  if (!p) return i + 1;
  return /^\d+$/.test(p) ? +p : p;
}
function brAUneTable(el) {
  return !!(el && Array.isArray(el.pinMap) && el.pinMap.some(p => String(p == null ? "" : p).trim()));
}
function brLu(el) {
  return (el && el.brochage && typeof brochageLire === "function") ? brochageLire(el.brochage) : null;
}
/* Repère affiché : U3 et sa partie, « U3A ». La netlist et la nomenclature,
   elles, ne connaissent que U3 : un boîtier, une empreinte. */
function brRepere(el) {
  return (el.ref || "") + (el.part && brochageParties(brLu(el)).length ? el.part : "");
}

/* ---------- la référence de la LIB ---------- */

function brColonne(item) {
  if (!item) return "";
  const v = item["Brochage"] != null ? item["Brochage"] : item["brochage"];
  return String(v == null ? "" : v).trim();
}
/* La table du composant, recalculée depuis son brochage et sa partie. Une
   broche que le brochage ne nomme pas garde une case vide : brControles() le
   dit, et la netlist retombe sur son numéro. */
function brAppliquer(el) {
  const lu = brLu(el);
  if (!lu) { delete el.pinMap; delete el.pinMapMain; return false; }
  const parties = brochageParties(lu);
  if (!parties.length) delete el.part;
  else if (!parties.includes(el.part)) el.part = parties[0];
  const partie = brochagePartie(lu, el.part);
  const n = pinsOf(el).length;
  const map = [];
  for (let i = 0; i < n; i++) {
    const nom = brochageNom(brNomBroche(el, i));
    let p = nom ? partie.broches[nom] : null;
    if (p == null) p = partie.broches[String(i + 1)];
    map.push(p == null ? "" : String(p));
  }
  el.pinMap = map;
  delete el.pinMapMain;
  if (typeof touchWires === "function") touchWires();
  return true;
}
/* Recopie le brochage d'une ligne de la LIB sur le composant.
   `nouvelleRef` : la référence vient d'être choisie. Une table retouchée à la
   main pour l'ancienne n'a alors plus de sens et s'en va. À la mise à jour
   depuis la LIB, au contraire, une table manuelle reste — seule celle qui
   venait de la LIB suit la LIB. */
function brDepuisLib(el, item, nouvelleRef) {
  if (!el) return false;
  const txt = brColonne(item);
  if (txt && brochageLire(txt)) {
    el.brochage = txt.slice(0, 600);
    return brAppliquer(el);
  }
  if (el.brochage || nouvelleRef) {
    delete el.brochage; delete el.part; delete el.pinMap; delete el.pinMapMain;
    if (typeof touchWires === "function") touchWires();
  }
  return false;
}
/* Changer de partie : la table suit (U3A → U3B : OUT passe de 1 à 7). */
function brChoisirPartie(el, partie) {
  const parties = brochageParties(brLu(el));
  if (!parties.includes(partie)) return false;
  el.part = partie;
  brAppliquer(el);
  return true;
}
/* Saisie à la main d'une patte (fenêtre « Détails du composant »). */
function brSaisirPatte(el, i, valeur) {
  const n = pinsOf(el).length;
  if (i < 0 || i >= n) return false;
  const v = String(valeur == null ? "" : valeur).trim().slice(0, 8);
  if (v && !BROCHAGE_PATTE.test(v)) return false;
  const map = Array.isArray(el.pinMap) ? el.pinMap.slice(0, n) : [];
  while (map.length < n) map.push("");
  map[i] = v;
  if (map.some(x => x)) { el.pinMap = map; el.pinMapMain = true; }
  else { delete el.pinMap; delete el.pinMapMain; }
  if (typeof touchWires === "function") touchWires();
  return true;
}

/* Fichier du symbole d'une ligne de la LIB, réduit à son nom : « opamp ». */
function brSymboleDe(item) {
  const s = item ? (item["Empreinte Schématique"] || item["Empreinte Schematique"] || "") : "";
  return String(s).replace(/^.*[\\\/]/, "").replace(/\.json$/i, "").trim().toLowerCase();
}
/* Les références de la LIB qui utilisent le symbole de ce composant : celles
   qu'on propose quand on pose un AOP, un transistor, un régulateur… Celles
   qui portent un brochage passent devant. */
function brCandidats(el) {
  const lib = (typeof window !== "undefined" && Array.isArray(window.CSV_LIB)) ? window.CSV_LIB : [];
  if (!el || !lib.length) return [];
  const sym = String(el.type || "").toLowerCase();
  const out = lib.filter(it => brSymboleDe(it) === sym);
  return out.sort((a, b) => (brColonne(b) ? 1 : 0) - (brColonne(a) ? 1 : 0) ||
    String(a["Part Name"] || "").localeCompare(String(b["Part Name"] || ""), "fr", { numeric: true }));
}
/* Le badge « Référence à choisir » : un symbole générique qui a des
   références dans la LIB et à qui on n'en a pas encore donné. */
function brReferenceAChoisir(el) {
  if (!el || el.csvPartName) return 0;
  const def = defOf(el.type);
  if (def.noRef || typeof def.pins === "function") return 0;
  return brCandidats(el).length;
}

/* ---------- nombre de pattes d'un boîtier ---------- */

/* Pattes du boîtier d'après son nom : « SOIC-8 » → 8, « SOT-23-5 » → 5,
   « SOT-223-4 » → 4. Un nom qui ne dit pas son brochage (« 0603 », « SMA »,
   « SOT-23 » seul, « SC-70 ») rend 0 : on ne sait pas, on ne juge pas. */
function brPattesBoitier(pkg) {
  const nom = String(pkg || "").replace(/^.*[\\\/]/, "").replace(/\.json$/i, "").trim();
  const b = (typeof pkgBaseOf === "function") ? pkgBaseOf(nom) : null;
  if (b && b.pins) return b.pins;
  const m = nom.match(/^(?:SOIC|SOP|SSOP|TSSOP|MSOP|DFN|QFN|WSON|DIP|LQFP|TQFP)-?(\d{1,3})$/i) ||
            nom.match(/^(?:SOT|TSOT|SC)-?\d{2,3}-(\d{1,2})$/i);
  return m ? +m[1] : 0;
}

/* ---------- contrôle du brochage ----------
   Ce que le PCB ne peut pas voir : il reçoit des numéros de pattes et les
   relie, qu'ils soient justes ou non. Trois familles :
     · symbole générique posé sur un boîtier plus grand, sans table : ses
       broches tombent sur les premières pattes, au hasard du boîtier ;
     · une alimentation qui finit sur la masse (ou l'inverse) ;
     · un composant à plusieurs parties : partie posée deux fois, partie
       absente, patte partagée prise par deux nets. */
const BR_POS = /^(V\+|VCC|VDD|VS\+|VCC\d|VDD\d|AVDD|DVDD|VBAT|VIN)$/;
const BR_MASSE_BROCHE = /^(GND|AGND|DGND|PGND|VSS|AVSS|DVSS)$/;
const BR_NEG = /^(V-|VEE|VS-)$/;
function brNetMasse(nom) {
  return /^(GND|AGND|DGND|PGND|GNDA|GNDD|VSS|0V|MASSE|GND_\w+)$/i.test(String(nom || ""));
}
/* Rail positif : « +5V », « 3V3 », « 12V », « VCC », « VDD_3V3 »… */
function brNetPositif(nom) {
  const s = String(nom || "").trim().toUpperCase();
  if (!s || s.startsWith("-")) return false;
  return /^\+?\d+([.,]\d+)?V\d*$/.test(s) || /^\+?\d+V\d+$/.test(s) ||
         /^(VCC|VDD|VBAT|VBUS|VIN|V\+|AVDD|DVDD)(\b|_|$)/.test(s);
}
function brNetNegatif(nom) {
  return /^-\d+([.,]\d+)?V\d*$|^(VEE|VSS-|V-)$/i.test(String(nom || "").trim());
}

/* Tous les composants du document, avec leur feuille. */
function brComposants() {
  if (typeof storeCurrent === "function") storeCurrent();
  const out = [];
  S.pages.forEach((p, i) => {
    const src = (i === S.page) ? S.comps : (p.comps || []);
    for (const el of src) if (!defOf(el.type).noRef) out.push({ el: el, page: i });
  });
  return out;
}
/* Net de chaque broche, par composant : id → [nom de net | null]. */
function brNetsParBroche() {
  const D = docNets();
  const m = new Map();
  for (const g of D.groups) {
    if (g.isBus) continue;
    for (const nd of g.nodes) {
      const k = nd.page + ":" + nd.id;
      if (!m.has(k)) m.set(k, []);
      m.get(k)[nd.pin - 1] = g.name;
    }
  }
  return m;
}

function brControles() {
  const out = [];
  const tous = brComposants();
  const netsDe = brNetsParBroche();
  const dire = (x, niveau, texte) => out.push({ id: x.el.id, page: x.page, ref: brRepere(x.el) || "?", niveau: niveau, texte: texte });

  for (const x of tous) {
    const el = x.el, def = defOf(el.type);
    const n = pinsOf(el).length;
    if (!n) continue;
    const table = brAUneTable(el);
    const nets = netsDe.get(x.page + ":" + el.id) || [];

    /* 1. symbole générique sur un boîtier qui a plus de pattes que lui */
    const nPkg = brPattesBoitier(el.pkg);
    if (!table && def.pn && nPkg > n)
      dire(x, "erreur", "symbole à " + n + " broches sur un boîtier " + el.pkg + " à " + nPkg +
        " pattes, sans brochage : les broches 1 à " + n + " tombent sur les pattes 1 à " + n +
        ". Choisir la référence dans la LIB, ou renseigner les pattes (Détails du composant).");

    /* 2. broche que le brochage de la LIB ne nomme pas */
    if (el.brochage && Array.isArray(el.pinMap) && !el.pinMapMain)
      for (let i = 0; i < n; i++)
        if (!String(el.pinMap[i] || "").trim())
          dire(x, "erreur", "broche " + (brNomBroche(el, i) || (i + 1)) +
            " absente du brochage de " + (el.csvPartName || "la référence") + ".");

    /* 3. alimentation sur la masse, masse sur une alimentation */
    for (let i = 0; i < n; i++) {
      const nom = brochageNom(brNomBroche(el, i)), net = nets[i];
      if (!nom || !net) continue;
      if (BR_POS.test(nom) && brNetMasse(net))
        dire(x, "erreur", "broche d'alimentation " + nom + " (patte " + brPatte(el, i) + ") reliée à la masse " + net + ".");
      else if (BR_MASSE_BROCHE.test(nom) && (brNetPositif(net) || brNetNegatif(net)))
        dire(x, "erreur", "broche de masse " + nom + " (patte " + brPatte(el, i) + ") reliée à l'alimentation " + net + ".");
      else if (BR_NEG.test(nom) && brNetPositif(net))
        dire(x, "erreur", "broche " + nom + " (patte " + brPatte(el, i) + ") reliée au rail positif " + net + ".");
    }
  }

  /* 4. boîtiers : pattes partagées et parties */
  const boites = new Map();
  for (const x of tous) {
    if (!x.el.ref) continue;
    if (!boites.has(x.el.ref)) boites.set(x.el.ref, []);
    boites.get(x.el.ref).push(x);
  }
  for (const [ref, membres] of boites) {
    /* même patte, deux nets : un court-circuit au PCB */
    const patteNet = new Map();
    for (const x of membres) {
      const nets = netsDe.get(x.page + ":" + x.el.id) || [];
      const n = pinsOf(x.el).length;
      for (let i = 0; i < n; i++) {
        const net = nets[i];
        if (!net) continue;
        const p = String(brPatte(x.el, i));
        if (!patteNet.has(p)) patteNet.set(p, new Map());
        patteNet.get(p).set(net, x);
      }
    }
    for (const [p, parNet] of patteNet)
      if (parNet.size > 1)
        dire([...parNet.values()][0], "erreur", "patte " + ref + "." + p + " reliée à " +
          [...parNet.keys()].join(" et à ") + " : deux nets sur une même patte.");

    if (membres.length < 2 && !brochageParties(brLu(membres[0].el)).length) continue;
    const lu = brLu(membres[0].el);
    const parties = brochageParties(lu);
    if (membres.length > 1) {
      const refsLib = new Set(membres.map(x => x.el.csvPartName || ""));
      if (!parties.length || refsLib.size > 1) {
        for (const x of membres.slice(1))
          dire(x, "erreur", "repère " + ref + " déjà pris" +
            (parties.length ? " par une autre référence (" + [...refsLib].filter(Boolean).join(", ") + ")" : "") + ".");
        continue;
      }
      const vues = new Map();
      for (const x of membres) {
        const pt = x.el.part || parties[0];
        if (vues.has(pt)) dire(x, "erreur", "partie " + ref + pt + " posée deux fois.");
        else vues.set(pt, x);
      }
    }
    if (parties.length) {
      const posees = new Set(membres.map(x => x.el.part || parties[0]));
      const manque = parties.filter(pt => !posees.has(pt));
      if (manque.length)
        dire(membres[0], "alerte", (manque.length > 1 ? "parties " : "partie ") +
          manque.map(pt => ref + pt).join(", ") + " non posée" + (manque.length > 1 ? "s" : "") +
          " : ses entrées restent en l'air au PCB. La poser et la câbler selon la datasheet " +
          "(suiveur à la masse, par exemple).");
    }
  }
  return out;
}
/* Les contrôles d'un composant, pour l'inspecteur. */
function brControlesDe(el) {
  if (!el) return [];
  return brControles().filter(c => c.id === el.id && c.page === S.page);
}

/* ---------- parties : poser la suivante ----------
   Un LM358 a deux AOP : U3A est posé, « Ajouter U3B » pose le second à côté,
   même référence, même boîtier, partie suivante encore libre. */
function brPartieLibre(el) {
  const parties = brochageParties(brLu(el));
  if (!parties.length || !el.ref) return null;
  const prises = new Set(brComposants().filter(x => x.el.ref === el.ref).map(x => x.el.part || parties[0]));
  return parties.find(pt => !prises.has(pt)) || null;
}
function brAjouterPartie(el) {
  const pt = brPartieLibre(el);
  if (!pt) return null;
  push();
  const copie = JSON.parse(JSON.stringify(el));
  delete copie.refOff; delete copie.valOff;
  const nv = normComp(copie, S.comps.length);
  if (!nv) return null;
  nv.id = S.uid++;
  nv.x = snap(el.x + 120); nv.y = el.y;
  nv.part = pt;
  brAppliquer(nv);
  S.comps.push(nv);
  touchWires();
  return nv;
}

/* ---------- inspecteur ----------
   Le bloc « Brochage » du panneau Propriétés : d'où vient la table, la
   partie, broche → patte, et ce que le contrôle trouve à redire. */
function brPanneauHtml(el) {
  const def = defOf(el.type);
  if (def.noRef) return "";
  const n = pinsOf(el).length;
  if (!n) return "";
  const alertes = brControlesDe(el);
  const table = brAUneTable(el);
  const aChoisir = brReferenceAChoisir(el);
  if (!def.pn && !el.brochage && !table && !alertes.length && !aChoisir) return "";
  const e = (typeof esc === "function") ? esc : (s => String(s));
  const parties = brochageParties(brLu(el));
  const source = el.pinMapMain ? "retouché à la main"
    : el.brochage ? "LIB — " + (el.csvPartName || "référence")
    : table ? "saisi à la main"
    : "par défaut : broche n → patte n";
  let h = '<div class="br-bloc">';
  if (aChoisir)
    h += '<button class="tb br-choisir" id="pBrChoisir" title="Choisir la référence réelle dans la LIB : ' +
      'elle apporte boîtier et brochage">⚠ Référence à choisir (' + aChoisir + ')</button>';
  h += '<label>Brochage <span class="br-src">' + e(source) + '</span></label>';
  if (parties.length) {
    h += '<div class="row br-parties"><span>Partie</span><select id="pBrPartie">' +
      parties.map(pt => '<option value="' + e(pt) + '"' + (pt === el.part ? " selected" : "") + '>' +
        e((el.ref || "?") + pt) + '</option>').join("") + '</select>';
    const libre = brPartieLibre(el);
    if (libre) h += '<button class="tb mini" id="pBrAjout">+ ' + e((el.ref || "?") + libre) + '</button>';
    h += '</div>';
  }
  h += '<div class="br-table">';
  for (let i = 0; i < n; i++) {
    const nom = brNomBroche(el, i) || String(i + 1);
    const vide = el.brochage && Array.isArray(el.pinMap) && !String(el.pinMap[i] || "").trim();
    h += '<span class="br-nom">' + e(nom) + '</span><span class="br-patte' + (vide ? " br-vide" : "") + '">' +
      (vide ? "?" : e(brPatte(el, i))) + '</span>';
  }
  h += '</div>';
  for (const a of alertes)
    h += '<div class="br-alerte br-niv-' + a.niveau + '">' + (a.niveau === "erreur" ? "⛔ " : "⚠ ") + e(a.texte) + '</div>';
  h += '<div class="row"><button class="tb mini" id="pBrEdit">✎ Modifier les pattes…</button></div>';
  return h + '</div>';
}
function brPanneauBrancher(el) {
  const bc = document.getElementById("pBrChoisir");
  if (bc) bc.onclick = () => {
    const s = document.getElementById("pCsvSearch"), l = document.getElementById("pCsvList");
    if (l) { l.scrollIntoView({ block: "nearest" }); }
    if (s) { s.focus(); if (typeof s.select === "function") s.select(); }
  };
  const sp = document.getElementById("pBrPartie");
  if (sp) sp.onchange = () => { push(); brChoisirPartie(el, sp.value); refreshPanels(); draw(); };
  const ba = document.getElementById("pBrAjout");
  if (ba) ba.onclick = () => {
    const nv = brAjouterPartie(el);
    if (!nv) return;
    clearSel(); S.sel.add(nv.id);
    refreshPanels(); draw();
    const h = document.getElementById("fHint");
    if (h) h.textContent = "Partie " + brRepere(nv) + " posée à côté de " + brRepere(el) + " : même boîtier, mêmes alimentations.";
  };
  const be = document.getElementById("pBrEdit");
  if (be) be.onclick = () => { if (typeof ceOpen === "function") ceOpen(el); };
}
