"use strict";
/* =============================================================================
   commun/kicad.js
   Projet KiCad 9/10 complet ⇄ projet WEB_CAO, en archive .zip, depuis l'accueil.

   Ici : le socle (lecture de l'archive, écriture des expressions S, rapport
   d'écarts, identifiants stables) et l'assemblage du projet (.kicad_pro, tables
   de bibliothèques). Les conversions vivent dans commun/kicad-pcb.js (KICAD_PCB)
   et commun/kicad-sch.js (KICAD_SCH) ; l'arbre lu vient du lecteur borné de
   commun/composants-lib.js (COMPOSANTS_LIB.lireS).

   L'archive vient de l'extérieur : c'est une donnée. Noms d'entrées bornés (pas
   de « .. », pas de chemin absolu), nombre d'entrées, taille de chaque fichier et
   total décompressé plafonnés, rien n'est écrit sur le disque d'après ces noms.
   Rien ici ne touche au DOM ; le banc commun/test/banc-kicad.js l'éprouve sous Node.
   ============================================================================= */

const KICAD = (() => {
  const { lireS, Refus } = COMPOSANTS_LIB;
  const ZIP_ENTREES_MAX = 5000;
  const FICHIER_MAX = 64 * 1024 * 1024;
  const TOTAL_MAX = 256 * 1024 * 1024;
  const NOEUDS_MAX = 20000000;
  const VERSION_PCB = 20241229, VERSION_SCH = 20250114;      // KiCad 9 : KiCad 10 les ouvre

  /* ---------- rapport d'écarts : chaque écart une fois, avec son compte ---------- */
  function rapport() {
    const m = new Map();
    return {
      ecart(texte) { m.set(texte, (m.get(texte) || 0) + 1); },
      liste() { return [...m].map(([t, n]) => n > 1 ? t + " (×" + n + ")" : t); }
    };
  }

  /* ---------- lecture d'un arbre ---------- */
  const enfant = (l, nom) => l && l.find(e => Array.isArray(e) && e[0] === nom);
  const enfants = (l, nom) => (l || []).filter(e => Array.isArray(e) && e[0] === nom);
  const nb = (v, defaut = 0) => { const x = Number(v); return Number.isFinite(x) ? x : defaut; };
  // (at x y [angle]) → [x, y, angle] ; valeur d'un fils (nom v) → v
  const val = (l, nom, defaut) => { const e = enfant(l, nom); return e && e.length > 1 ? e[1] : defaut; };
  const xy = (l, nom = "at") => { const e = enfant(l, nom); return e ? [nb(e[1]), nb(e[2]), nb(e[3])] : [0, 0, 0]; };
  // KiCad 9.0.0 écrivait « (curved_edges no)filter_ratio 0.9) » dans les réglages des teardrops : KiCad le relit, nous aussi
  const lire = (texte, quoi) => lireS(String(texte).replace(/^\ufeff/, "").replace(/(\(curved_edges \w+\))filter_ratio /g, "$1(filter_ratio "),
                                      quoi, NOEUDS_MAX);

  /* ---------- écriture ----------
     Un arbre : tableau ; une chaîne nue est un mot-clé, q("…") une chaîne entre
     guillemets (KiCad distingue « smd » de "smd"), un nombre s'écrit en mm. */
  const q = s => ({ q: String(s == null ? "" : s) });
  function nombre(v) {
    const r = Math.round(v * 1e6) / 1e6;
    if (!Number.isFinite(r) || r === 0) return "0";
    const s = String(r);
    return s.includes("e") ? r.toFixed(6).replace(/\.?0+$/, "") : s;
  }
  const guillemets = s => '"' + s.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n") + '"';
  function ecrireS(arbre, retrait = "") {
    const mot = e => typeof e === "number" ? nombre(e) : typeof e === "string" ? e : guillemets(e.q);
    if (!arbre.some(Array.isArray)) return "(" + arbre.map(mot).join(" ") + ")";
    // les feuilles en tête restent sur la ligne, chaque sous-liste prend la sienne (comme KiCad)
    const r2 = retrait + "\t";
    return "(" + arbre.map((e, i) => Array.isArray(e) ? "\n" + r2 + ecrireS(e, r2) : (i ? " " : "") + mot(e)).join("")
      + "\n" + retrait + ")";
  }

  /* ---------- identifiants stables : le même projet donne la même archive ---------- */
  const enc = new TextEncoder();
  function uuid(texte) {
    const h = [0, 1, 2, 3].map(k => crc32(enc.encode(k + ":" + texte)).toString(16).padStart(8, "0")).join("");
    return h.slice(0, 8) + "-" + h.slice(8, 12) + "-4" + h.slice(13, 16) + "-" +
           "89ab"[parseInt(h[16], 16) & 3] + h.slice(17, 20) + "-" + h.slice(20, 32);
  }

  /* ---------- archive ZIP : lecture (l'écriture est commun/zip.js) ---------- */
  function cheminSur(nom) {
    const p = nom.replace(/\\/g, "/");
    if (p.startsWith("/") || /^[A-Za-z]:/.test(p)) return null;
    const segs = p.split("/").filter(Boolean);
    return segs.length && !segs.some(s => s === "." || s === ".." || /[\x00-\x1f]/.test(s)) ? segs.join("/") : null;
  }
  async function inflate(data, taille) {
    const flux = new Blob([data]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
    const lecteur = flux.getReader(), morceaux = [];
    let n = 0;
    for (;;) {
      const { done, value } = await lecteur.read();
      if (done) break;
      n += value.length;
      // une bombe de décompression s'arrête dès qu'elle dépasse la taille annoncée
      if (n > taille) { lecteur.cancel(); throw new Refus("archive : une entrée dépasse la taille annoncée"); }
      morceaux.push(value);
    }
    const out = new Uint8Array(n);
    let o = 0;
    for (const m of morceaux) { out.set(m, o); o += m.length; }
    return out;
  }
  /* octets → Map(chemin → octets) des seules entrées que garder(chemin) retient */
  async function lireZip(octets, garder = () => true) {
    const u8 = octets instanceof Uint8Array ? octets : new Uint8Array(octets);
    const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    let fin = -1;
    for (let i = u8.length - 22; i >= Math.max(0, u8.length - 65557); i--)
      if (dv.getUint32(i, true) === 0x06054b50) { fin = i; break; }
    if (fin < 0) throw new Refus("ce fichier n'est pas une archive .zip");
    const nbE = dv.getUint16(fin + 10, true);
    let p = dv.getUint32(fin + 16, true);
    if (nbE === 0xffff || p === 0xffffffff) throw new Refus("archive ZIP64 non prise en charge : refais l'archive avec KiCad (Archiver le projet)");
    if (nbE > ZIP_ENTREES_MAX) throw new Refus("archive de plus de " + ZIP_ENTREES_MAX + " fichiers : refusée");
    const out = new Map();
    let total = 0;
    for (let k = 0; k < nbE; k++) {
      if (p + 46 > u8.length || dv.getUint32(p, true) !== 0x02014b50) throw new Refus("archive .zip abîmée");
      const drap = dv.getUint16(p + 8, true), methode = dv.getUint16(p + 10, true);
      const tComp = dv.getUint32(p + 20, true), taille = dv.getUint32(p + 24, true);
      const lNom = dv.getUint16(p + 28, true), lExtra = dv.getUint16(p + 30, true), lCom = dv.getUint16(p + 32, true);
      const local = dv.getUint32(p + 42, true);
      const brut = u8.subarray(p + 46, p + 46 + lNom);
      const nom = (drap & 0x800) ? new TextDecoder().decode(brut) : String.fromCharCode(...brut);
      p += 46 + lNom + lExtra + lCom;
      const chemin = cheminSur(nom);
      if (!chemin || nom.endsWith("/") || !garder(chemin)) continue;
      if (drap & 1) throw new Refus("archive chiffrée : refusée");
      if (taille > FICHIER_MAX) throw new Refus("« " + chemin + " » dépasse 64 Mo : refusé");
      if ((total += taille) > TOTAL_MAX) throw new Refus("archive de plus de 256 Mo une fois décompressée : refusée");
      if (local + 30 > u8.length || dv.getUint32(local, true) !== 0x04034b50) throw new Refus("archive .zip abîmée");
      const debut = local + 30 + dv.getUint16(local + 26, true) + dv.getUint16(local + 28, true);
      const data = u8.subarray(debut, debut + tComp);
      if (data.length !== tComp) throw new Refus("archive .zip tronquée");
      let contenu;
      if (methode === 0) contenu = data.slice();
      else if (methode === 8) contenu = await inflate(data, taille);
      else throw new Refus("« " + chemin + " » : compression " + methode + " non prise en charge");
      if (contenu.length !== taille) throw new Refus("« " + chemin + " » : taille différente de celle annoncée");
      out.set(chemin, contenu);
    }
    return out;
  }

  /* ---------- import : archive → { nom, schema, pcb, symboles, empreintes, rapport } ---------- */
  const texteDe = u8 => new TextDecoder().decode(u8);
  const sansExt = c => c.replace(/\.kicad_\w+$/i, "");
  function versionLue(arbre, mini, quoi, rap) {
    const v = nb(val(arbre, "version"), 0);
    if (v && v < mini) rap.ecart(quoi + " d'une version de KiCad antérieure à la 9 : lu au mieux (réenregistre-le dans KiCad 9 pour plus de fidélité)");
  }
  async function importer(octets) {
    // ni sauvegardes de KiCad, ni fichiers fantômes du Finder (__MACOSX/, ._nom)
    const zip = await lireZip(octets, c => /\.kicad_(pro|sch|pcb)$/i.test(c) && !/(^|\/)([^/]*-backups\/|__MACOSX\/|\._)/i.test(c));
    const prof = c => c.split("/").length;
    const premier = re => [...zip.keys()].filter(c => re.test(c)).sort((a, b) => prof(a) - prof(b) || a.localeCompare(b))[0];
    // le .kicad_pro le moins profond désigne le projet ; sans lui, la carte puis le schéma
    const base = sansExt(premier(/\.kicad_pro$/i) || premier(/\.kicad_pcb$/i) || premier(/\.kicad_sch$/i) || "");
    if (!base) throw new Refus("ni .kicad_pro, ni .kicad_pcb, ni .kicad_sch dans l'archive");
    const rap = rapport();
    let pro = null;
    if (zip.has(base + ".kicad_pro")) {
      try { pro = JSON.parse(texteDe(zip.get(base + ".kicad_pro"))); } catch (_) { rap.ecart(".kicad_pro illisible : règles et classes de réseaux par défaut"); }
      if (!pro || typeof pro !== "object" || Array.isArray(pro)) pro = null;
    }
    let pcb = null, schema = null;
    if (zip.has(base + ".kicad_pcb")) {
      const arbre = lire(texteDe(zip.get(base + ".kicad_pcb")), "kicad_pcb");
      if (arbre[0] !== "kicad_pcb") throw new Refus(base + ".kicad_pcb n'est pas une carte KiCad");
      versionLue(arbre, 20240108, "La carte", rap);
      pcb = KICAD_PCB.lire(arbre, pro, rap);
    }
    if (zip.has(base + ".kicad_sch")) {
      // les feuilles se cherchent dans le dossier du projet, jamais ailleurs
      const dossier = base.includes("/") ? base.slice(0, base.lastIndexOf("/") + 1) : "";
      /* une feuille ne se lit que si la hiérarchie y mène : un .kicad_sch abandonné dans le
         dossier n'arrête rien. La racine illisible refuse ; une sous-feuille illisible manque. */
      const lues = new Map();
      const feuilles = { get(c) {
        if (lues.has(c)) return lues.get(c);
        let arbre;
        if (zip.has(c) && c.startsWith(dossier)) {
          try {
            arbre = lire(texteDe(zip.get(c)), "kicad_sch");
            if (arbre[0] !== "kicad_sch") throw new Refus(c + " n'est pas un schéma KiCad");
            versionLue(arbre, 20231120, "Le schéma « " + c.slice(dossier.length) + " »", rap);
          } catch (e) {
            if (!(e instanceof Refus) || c === base + ".kicad_sch") throw e;
            rap.ecart(e.message);
            arbre = undefined;
          }
        }
        lues.set(c, arbre);
        return arbre;
      },
      // les alias de bus se cherchent dans toutes les feuilles du dossier
      *values() { for (const c of zip.keys()) if (/\.kicad_sch$/i.test(c) && c.startsWith(dossier)) yield this.get(c); } };
      schema = KICAD_SCH.lire(feuilles, base + ".kicad_sch", rap);
    }
    if (schema && pcb) {
      // une empreinte sans cuivre devient de simples trous sur la carte : son symbole suit, sinon l'ECO voudrait la rajouter
      const retires = new Set(pcb.retires);
      for (const p of schema.doc.pages) {
        const n = p.comps.length;
        p.comps = p.comps.filter(c => !(c.ref && retires.has(c.ref)));
        if (p.comps.length < n) rap.ecart("symbole d'une empreinte sans cuivre (trou de fixation) : retiré du schéma aussi");
      }
      relierBroches(schema.doc, pcb.doc, rap);
      KICAD_SCH.harmoniser(schema.doc, pcb.doc, rap);
    }
    else if (schema) rap.ecart("pas de .kicad_pcb : le schéma seul est importé");
    else rap.ecart("pas de .kicad_sch : la carte seule est importée");
    return { nom: base.split("/").pop(), schema: schema && schema.doc, pcb: pcb && pcb.doc,
             symboles: schema ? schema.symboles : [], empreintes: pcb ? pcb.empreintes : [], rapport: rap.liste() };
  }
  /* Les broches KiCad nommées (A3, EP) sont renumérotées par la lecture de la carte
     (le nom reste dans pad.nom) : le schéma suit, sinon ses pattes ne trouvent pas leur pastille. */
  function relierBroches(sch, pcb, rap) {
    const parRef = new Map(pcb.fps.map(f => [f.ref, f]));
    for (const p of sch.pages || []) for (const c of p.comps || []) {
      if (!Array.isArray(c.pinMap) || c.pinMap.every(v => /^\d+(\/\d+)*$/.test(v))) continue;
      const fp = parRef.get(c.ref);
      const num = new Map(((fp && fp.pads) || []).map(q => [q.nom != null ? String(q.nom) : String(q.n), String(q.n)]));
      c.pinMap = c.pinMap.map(v => String(v).split("/").map(t => /^\d+$/.test(t) ? t : num.get(t) || t).join("/"));
      if (c.pinMap.some(v => !/^\d+(\/\d+)*$/.test(v)))
        rap.ecart("broche nommée sans pastille correspondante sur la carte : " + c.ref + " reste à vérifier");
    }
  }

  /* L'inverse de relierBroches : la carte écrit une pastille nommée sous son nom (A1, EP),
     la broche du schéma doit porter le même, sinon KiCad ne les relie pas. Sur une copie. */
  function brochesNommees(sch, pcb, rap) {
    const parRef = new Map((pcb.fps || []).map(f => [f.ref, f]));
    const copie = JSON.parse(JSON.stringify(sch));
    for (const p of copie.pages || []) for (const c of p.comps || []) {
      const fp = parRef.get(c.ref);
      const noms = new Map(((fp && fp.pads) || []).filter(q => q.nom != null && String(q.nom) !== String(q.n))
                                                 .map(q => [String(q.n), String(q.nom)]));
      if (!noms.size) continue;
      const sym = copie.symboles && copie.symboles[c.type];
      const pm = Array.isArray(c.pinMap) ? c.pinMap : sym && Array.isArray(sym.pins) ? sym.pins.map(q => String(q.n)) : null;
      if (!pm) { rap.ecart("pastilles nommées sur un symbole intégré : numéros de broches à vérifier dans KiCad (" + c.ref + ")"); continue; }
      c.pinMap = pm.map(v => String(v).split("/").map(t => noms.get(t.trim()) || t).join("/"));
    }
    return copie;
  }

  /* ---------- export : projet WEB_CAO → fichiers du dossier KiCad ---------- */
  const fusion = (a, b) => {
    for (const k of Object.keys(b || {}))
      a[k] = b[k] && typeof b[k] === "object" && !Array.isArray(b[k]) && a[k] && typeof a[k] === "object" ? fusion(a[k], b[k]) : b[k];
    return a;
  };
  const table = (genre, nomLib, uri) => genre + "\n  (version 7)\n  (lib (name " + guillemets(nomLib) +
    ")(type \"KiCad\")(uri " + guillemets("${KIPRJMOD}/" + uri) + ")(options \"\")(descr \"\"))\n)\n";
  function exporter({ nom, schema, pcb }) {
    if (!schema && !pcb) throw new Refus("projet sans schéma ni carte : rien à exporter");
    const nomF = String(nom || "projet").replace(/[\\/:*?"<>|\x00-\x1f]+/g, "_").trim() || "projet";
    const nomLib = nomF.replace(/[^A-Za-z0-9_.-]+/g, "_");
    const rap = rapport();
    const fichiers = [];
    /* le schéma donne le chemin de chaque symbole (qui relie l'empreinte au schéma), la carte
       le nom de chaque empreinte (champ Footprint) : un premier passage du schéma, à blanc */
    const chemins = schema ? KICAD_SCH.ecrire(schema, nomF, nomLib, rapport(), null).chemins : null;
    const pcbE = pcb ? KICAD_PCB.ecrire(pcb, nomLib, rap, chemins) : null;
    if (pcbE) {
      fichiers.push({ name: nomF + ".kicad_pcb", text: pcbE.texte });
      for (const e of pcbE.empreintes) fichiers.push({ name: nomLib + ".pretty/" + e.nom + ".kicad_mod", text: e.texte });
      fichiers.push({ name: "fp-lib-table", text: table("(fp_lib_table", nomLib, nomLib + ".pretty") });
    }
    if (schema) {
      const schE = KICAD_SCH.ecrire(pcb ? brochesNommees(schema, pcb, rap) : schema, nomF, nomLib, rap, pcbE && pcbE.librairie);
      for (const f of schE.fichiers) fichiers.push({ name: f.nom, text: f.texte });
      fichiers.push({ name: nomLib + ".kicad_sym", text: schE.bibliotheque });
      fichiers.push({ name: "sym-lib-table", text: table("(sym_lib_table", nomLib, nomLib + ".kicad_sym") });
    }
    // KiCad complète de ses valeurs par défaut tout ce que le .kicad_pro ne dit pas
    const pro = fusion({
      meta: { filename: nomF + ".kicad_pro", version: 3 },
      boards: [], text_variables: {}
    }, pcbE && pcbE.pro);
    fichiers.push({ name: nomF + ".kicad_pro", text: JSON.stringify(pro, null, 2) + "\n" });
    return { fichiers: fichiers.map(f => ({ name: nomF + "/" + f.name, text: f.text })), nom: nomF, rapport: rap.liste() };
  }

  return { VERSION_PCB, VERSION_SCH, Refus, rapport, enfant, enfants, nb, val, xy, lire, q, ecrireS, nombre, uuid, lireZip, cheminSur,
           importer, exporter };
})();
