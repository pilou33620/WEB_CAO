/* ==========================================================================
   Éditeur schématique — 29-symboles-lib.js
   Les symboles de la LIB (fichiers schsym-1 de lib_empreinte_schematique)
   --------------------------------------------------------------------------
   Le schéma ne dessinait que ses symboles intégrés (02-bibliotheque.js) : un
   composant du catalogue dont l'« Empreinte Schématique » désignait un autre
   fichier (créé par la Gestion LIB, l'import JLCPCB ou Claude) tombait sur le
   CI générique. Ces fichiers deviennent maintenant des symboles de la page :

     · au chargement du catalogue, chaque symbole cité qui n'est pas intégré est
       lu dans la LIB et ajouté à LIB sous son nom : schTypeDuCatalogue le
       trouve alors comme un intégré, à l'explorateur comme pour Claude ;
     · un symbole POSÉ est recopié dans le document (S.symboles) : le schéma
       s'ouvre et se dessine pareil sur un poste dont la LIB ne l'a pas.

   Un intégré garde la priorité : un fichier de même nom ne le remplace pas.
   Broches numérotées de 1 à N sans trou, dans l'ordre de la netlist.
   ========================================================================== */
"use strict";

const SYM_LIB_OPS = new Set(["line", "rect", "arc", "circle", "poly", "text", "arrow"]);
const SYM_LIB_NOM = /^[A-Za-z0-9_.+-]{1,60}$/;
const SYM_LIB_MAX = { broches: 1024, primitives: 5000, coord: 4000 };
// symboles lus dans la LIB ou un document, par nom (les intégrés n'y sont jamais)
const SYM_LIB_LUS = new Map();

/* Contrôle un schsym-1 et rend {def, erreurs} : def est le symbole au format de LIB. Rien
   n'est exécuté du fichier : seules des primitives connues, aux nombres finis, sont dessinées. */
function schSymboleLire(sym) {
  const erreurs = [];
  const fini = v => typeof v === "number" && Number.isFinite(v) && Math.abs(v) <= SYM_LIB_MAX.coord;
  if (!sym || typeof sym !== "object" || Array.isArray(sym)) return { def: null, erreurs: ["le symbole doit être un objet schsym-1"] };
  if (sym.format !== "schsym-1") erreurs.push("format : « schsym-1 » attendu");
  if (typeof sym.id !== "string" || !SYM_LIB_NOM.test(sym.id)) erreurs.push("id : nom du fichier, [A-Za-z0-9_.+-], 60 caractères au plus");
  const pins = Array.isArray(sym.pins) ? sym.pins : [];
  if (!pins.length || pins.length > SYM_LIB_MAX.broches) erreurs.push("pins : de 1 à " + SYM_LIB_MAX.broches + " broches {n, x, y}");
  const parN = new Map();
  for (const p of pins) {
    if (!p || !Number.isInteger(p.n) || p.n < 1 || !fini(p.x) || !fini(p.y)) { erreurs.push("broche illisible : " + JSON.stringify(p).slice(0, 60)); continue; }
    if (parN.has(p.n)) erreurs.push("broche " + p.n + " en double");
    parN.set(p.n, p);
  }
  for (let n = 1; n <= parN.size; n++) if (!parN.has(n)) { erreurs.push("broches numérotées de 1 à " + parN.size + " sans trou : la " + n + " manque"); break; }
  const prims = Array.isArray(sym.primitives) ? sym.primitives : [];
  if (prims.length > SYM_LIB_MAX.primitives) erreurs.push("primitives : " + SYM_LIB_MAX.primitives + " au plus");
  for (const q of prims) {
    if (!q || !SYM_LIB_OPS.has(q.op)) { erreurs.push("primitive inconnue : " + String(q && q.op).slice(0, 20) + " (" + [...SYM_LIB_OPS].join(", ") + ")"); break; }
    const nombres = { line: ["x1", "y1", "x2", "y2"], rect: ["x", "y", "w", "h"], arc: ["cx", "cy", "r", "start", "end"],
                      circle: ["x", "y", "r"], text: ["x", "y"], arrow: ["x", "y"], poly: [] }[q.op];
    if (nombres.some(k => !fini(q[k]))) { erreurs.push(q.op + " : coordonnées numériques finies"); break; }
    if (q.op === "poly" && !(Array.isArray(q.pts) && q.pts.length >= 2 && q.pts.length <= 500 && q.pts.every(p => Array.isArray(p) && fini(p[0]) && fini(p[1])))) {
      erreurs.push("poly : de 2 à 500 points [x, y]"); break;
    }
    if (q.op === "text" && typeof (q.text != null ? q.text : q.txt) !== "string") { erreurs.push("text : un texte"); break; }
  }
  if (erreurs.length) return { def: null, erreurs };

  const ordre = [...parN.keys()].sort((a, b) => a - b).map(n => parN.get(n));
  const noms = ordre.map(p => typeof p.name === "string" ? p.name : typeof p.nom === "string" ? p.nom : "");
  let ext = Array.isArray(sym.ext) && sym.ext.length === 4 && sym.ext.every(fini) ? sym.ext.slice() : null;
  if (!ext) {
    const xs = ordre.map(p => p.x), ys = ordre.map(p => p.y);
    ext = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
  }
  const texte = v => String(v == null ? "" : v).replace(/[\x00-\x1f\x7f]/g, "").slice(0, 80);
  const prefixe = typeof sym.prefix === "string" && /^[A-Za-z]{1,4}$/.test(sym.prefix) ? sym.prefix.toUpperCase() : "U";
  const def = {
    n: texte(sym.name) || sym.id, cat: "LIB", p: prefixe, v: texte(sym.defaultValue) || sym.id, lib: true,
    pins: ordre.map(p => [p.x, p.y]), ext,
    d(c) {
      for (const q of prims) {
        c.save();
        if (fini(q.width) && q.width > 0) c.lineWidth = Math.min(q.width, 20);
        if (q.op === "line") L(c, q.x1, q.y1, q.x2, q.y2);
        else if (q.op === "rect") RR(c, q.x, q.y, q.w, q.h, fini(q.r) ? Math.max(0, q.r) : 0, q.fill ? C_FILL : null);
        else if (q.op === "circle") CIR(c, q.x, q.y, Math.abs(q.r), q.fill ? C_FILL : null);
        else if (q.op === "arc") { c.beginPath(); c.arc(q.cx, q.cy, Math.abs(q.r), q.start, q.end); c.stroke(); }
        else if (q.op === "poly") P(c, q.pts, q.fill ? C_FILL : null);
        else if (q.op === "arrow") ARR(c, q.x, q.y, fini(q.angle) ? q.angle : 0, fini(q.size) ? q.size : 9);
        else if (q.op === "text") TXT(c, texte(q.text != null ? q.text : q.txt), q.x, q.y, fini(q.size) ? q.size : 10, C_TXT, q.align);
        c.restore();
      }
    }
  };
  if (noms.some(Boolean)) def.pn = noms;
  if (typeof sym.defaultPkg === "string" && sym.defaultPkg) def.pkg = texte(sym.defaultPkg);
  return { def, erreurs };
}

/* Ajoute un symbole lu à LIB (pas un intégré). Rend son nom de type, ou "" s'il est refusé. */
function schSymboleDefinir(sym) {
  const { def } = schSymboleLire(sym);
  if (!def) return "";
  const t = sym.id;
  if (hasType(t) && !LIB[t].lib) return "";             // un intégré garde la priorité
  LIB[t] = def;
  SYM_LIB_LUS.set(t, JSON.parse(JSON.stringify(sym)));
  return t;
}

/* Un symbole de la LIB qu'on pose part avec le document. */
function schSymboleRetenir(t) {
  if (!SYM_LIB_LUS.has(t)) return;
  if (!S.symboles || typeof S.symboles !== "object") S.symboles = {};
  if (!S.symboles[t]) S.symboles[t] = SYM_LIB_LUS.get(t);
}

/* Les symboles d'un document ouvert : définis avant que ses composants ne se dessinent. */
function schSymbolesDuDocument(o) {
  const m = o && o.symboles && typeof o.symboles === "object" && !Array.isArray(o.symboles) ? o.symboles : {};
  const garde = {};
  for (const [k, sym] of Object.entries(m))
    if (sym && sym.id === k && schSymboleDefinir(sym)) garde[k] = sym;
  return garde;
}

/* Le catalogue chargé : ses symboles qui ne sont pas intégrés se lisent dans la LIB. */
async function schSymbolesPrecharger(catalogue) {
  if (!Array.isArray(catalogue) || typeof fetch !== "function") return 0;
  const noms = new Set();
  for (const r of catalogue) {
    const s = String(r["Empreinte Schématique"] || r["Empreinte Schematique"] || "").replace(/^.*[\\/]/, "").replace(/\.json$/i, "").trim();
    if (s && SYM_LIB_NOM.test(s) && !hasType(s) && !hasType(s.toLowerCase())) noms.add(s);
  }
  let n = 0;
  for (const nom of noms) {
    try {
      const r = await fetch("/api/lib/fichier?type=schematique&nom=" + encodeURIComponent(nom + ".json"));
      if (!r.ok) continue;
      const d = await r.json();
      const sym = d && (d.data !== undefined ? d.data : (typeof d.contenu === "string" ? JSON.parse(d.contenu) : null));
      if (sym && sym.id === nom && schSymboleDefinir(sym)) n++;
    } catch (_) {}
  }
  return n;
}
