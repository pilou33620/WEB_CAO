"use strict";
/* =============================================================================
   commun/brochage.js
   Colonne « Brochage » de LIB_composants.csv : pour une référence, quelle
   broche du symbole va sur quelle patte de l'empreinte.

   Pourquoi le brochage est porté par la référence et pas par le symbole : un
   même symbole « AOP » sert au MCP6001 en SOT-23-5 (OUT 1, V− 2, IN+ 3, IN− 4,
   V+ 5) et au LM358 en SOIC-8 (OUT 1, IN− 2, IN+ 3, V− 4, V+ 8). Le symbole ne
   connaît que ses broches ; c'est la datasheet de la référence qui dit où
   elles tombent. Sans cette table, la n-ième broche du symbole allait sur la
   pastille n — et sur un LM358, V+ arrivait sur la masse.

   Syntaxe, sans point-virgule (c'est le séparateur du CSV) :

     OUT=1,IN-=2,IN+=3,V-=4,V+=8                une seule partie
     A:OUT=1,IN-=2,IN+=3|B:OUT=7,IN-=6,IN+=5|*:V-=4,V+=8
                                                plusieurs parties (AOP double) ;
                                                « * » vaut pour toutes
     ...,NC=5/6/7                               pattes laissées libres exprès
     IN=3,OUT=2/4,GND=1                         une broche sur plusieurs pattes
                                                (languette d'un SOT-223, masses
                                                multiples d'un QFN)

   À gauche du « = », le nom de la broche du symbole (IN-, V+, B, C, E, G…) ou
   son numéro dans le symbole ; à droite, le numéro (ou le nom, « A1 ») de la
   patte de l'empreinte. Les noms se comparent sans casse ni espaces, et le
   signe moins typographique (−) vaut le tiret.

   Ce fichier ne touche à rien : il lit un texte et rend une structure. Le
   schéma (editeur-schematique/js/25-brochage.js) l'applique aux composants ;
   Gestion LIB s'en sert pour vérifier la saisie.
   ============================================================================= */

/* Nom de broche comparable : « in − » et « IN- » sont la même broche. */
function brochageNom(s) {
  return String(s == null ? "" : s)
    .replace(/[−–—]/g, "-")
    .replace(/\s+/g, "")
    .toUpperCase();
}

const BROCHAGE_PATTE = /^[A-Za-z0-9]{1,8}$/;
/* une ou plusieurs pattes, « 2 » ou « 2/4 » : huit au plus pour une broche */
const BROCHAGE_PATTES = /^[A-Za-z0-9]{1,8}(\/[A-Za-z0-9]{1,8}){0,7}$/;
/* « 2 / 4 » → ["2","4"] ; vide → [] */
function brochageListe(v) {
  return String(v == null ? "" : v).split("/").map(x => x.trim()).filter(Boolean);
}
const BROCHAGE_PARTIE = /^[A-Za-z0-9]{1,4}$/;

/* Lecture d'un brochage. Rend null pour un texte vide (ou « xx », « - »,
   valeurs de remplissage du catalogue), sinon
     { parties: [{ nom, broches: {NOM: patte}, nc: [patte] }],
       erreurs: [texte] }
   Une partie au nom vide est la partie unique d'un composant simple. Les
   entrées de « * » rejoignent chaque partie, qui peut les redéfinir. */
function brochageLire(texte) {
  const brut = String(texte == null ? "" : texte).trim();
  if (!brut || /^(xx|-+|none|n\/?a)$/i.test(brut)) return null;
  const erreurs = [];
  const nommees = [];
  const commun = { broches: {}, nc: [] };
  for (const morceau of brut.split("|")) {
    const m = morceau.trim();
    if (!m) continue;
    let nom = "", corps = m;
    const deux = m.indexOf(":");
    if (deux >= 0) {
      nom = m.slice(0, deux).trim().toUpperCase();
      corps = m.slice(deux + 1);
      if (nom !== "*" && !BROCHAGE_PARTIE.test(nom)) {
        erreurs.push("nom de partie illisible : « " + m.slice(0, deux).trim() + " »");
        continue;
      }
    }
    let cible;
    if (nom === "*") cible = commun;
    else {
      cible = nommees.find(p => p.nom === nom);
      if (!cible) { cible = { nom: nom, broches: {}, nc: [] }; nommees.push(cible); }
    }
    for (const e of corps.split(",")) {
      const t = e.trim();
      if (!t) continue;
      const eg = t.indexOf("=");
      if (eg < 0) { erreurs.push("« " + t + " » : il manque « = patte »"); continue; }
      const broche = brochageNom(t.slice(0, eg));
      const droite = t.slice(eg + 1).trim();
      if (!broche) { erreurs.push("« " + t + " » : nom de broche vide"); continue; }
      if (broche === "NC") {
        for (const p of droite.split("/").map(x => x.trim()).filter(Boolean)) {
          if (!BROCHAGE_PATTE.test(p)) erreurs.push("patte « " + p + " » illisible (NC)");
          else if (!cible.nc.includes(p)) cible.nc.push(p);
        }
        continue;
      }
      const liste = [...new Set(brochageListe(droite))];
      const illisible = liste.find(p => !BROCHAGE_PATTE.test(p));
      if (!liste.length || illisible != null || liste.length > 8) {
        erreurs.push("« " + t + " » : patte « " + (illisible != null ? illisible : droite) + " » illisible");
        continue;
      }
      const pattes = liste.join("/");
      const deja = cible.broches[broche];
      if (deja != null && deja !== pattes)
        erreurs.push("broche " + broche + (cible.nom && cible.nom !== "*" ? " (partie " + cible.nom + ")" : "") +
          " donnée deux fois : patte " + deja + " puis " + pattes);
      cible.broches[broche] = pattes;
    }
  }
  const parties = nommees.length ? nommees : [{ nom: "", broches: {}, nc: [] }];
  for (const p of parties) {
    for (const k of Object.keys(commun.broches))
      if (p.broches[k] == null) p.broches[k] = commun.broches[k];
    for (const n of commun.nc) if (!p.nc.includes(n)) p.nc.push(n);
  }
  if (parties.every(p => !Object.keys(p.broches).length))
    erreurs.push("aucune broche « NOM=patte » dans « " + brut + " »");
  /* une patte prise par deux broches différentes d'une même partie : deux
     signaux soudés ensemble au PCB. Entre parties, c'est le partage normal
     des alimentations — le contrôle du schéma juge alors les nets. */
  for (const p of parties) {
    const vu = {};
    for (const [b, v] of Object.entries(p.broches))
      for (const n of brochageListe(v)) {
        if (vu[n] && vu[n] !== b)
          erreurs.push("patte " + n + " donnée à " + vu[n] + " et à " + b +
            (p.nom ? " (partie " + p.nom + ")" : ""));
        vu[n] = b;
      }
  }
  return { parties: parties, erreurs: erreurs };
}

/* La partie demandée, ou la première ; null sans brochage. */
function brochagePartie(lu, nom) {
  if (!lu || !lu.parties || !lu.parties.length) return null;
  const n = String(nom == null ? "" : nom).trim().toUpperCase();
  return lu.parties.find(p => p.nom === n) || lu.parties[0];
}

/* Noms des parties d'un composant à plusieurs parties ([] pour une seule). */
function brochageParties(lu) {
  if (!lu || !lu.parties || lu.parties.length < 2) return [];
  return lu.parties.map(p => p.nom);
}

/* Toutes les pattes que le brochage désigne, NC compris, triées. */
function brochagePattes(lu) {
  const s = new Set();
  if (lu && lu.parties)
    for (const p of lu.parties) {
      for (const v of Object.values(p.broches)) for (const n of brochageListe(v)) s.add(n);
      for (const n of p.nc) s.add(n);
    }
  return [...s].sort((a, b) => String(a).localeCompare(String(b), "fr", { numeric: true }));
}

/* Texte court pour un aperçu : « OUT→1 IN-→2 … ». */
function brochageResume(partie) {
  if (!partie) return "";
  return Object.entries(partie.broches).map(([b, n]) => b + "→" + n).join("  ") +
    (partie.nc.length ? "  NC→" + partie.nc.join("/") : "");
}
