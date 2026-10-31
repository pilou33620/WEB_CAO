"use strict";
/* =============================================================================
   commun/kicad-pcb.js
   Carte KiCad 9/10 (.kicad_pcb, arbre lu par KICAD.lire) ⇄ document pcbedit-1
   de l'éditeur PCB. Tourne sur l'accueil, sans les fichiers de l'éditeur : les
   quelques calculs de géométrie utiles sont refaits ici.

   Repères. Les deux outils comptent en mm, Y vers le bas ; KiCad tourne dans le
   sens trigonométrique à l'écran, l'éditeur dans le sens horaire. Une empreinte
   retournée est rangée par KiCad en miroir vertical dans son propre repère (et
   ses pastilles en angle absolu) ; l'éditeur garde le repère vu de dessus et
   fait miroir en X puis tourne (fpXform, 01-core.js). D'où, pour une empreinte
   à (X, Y, A) et une pastille locale (px, py) d'angle absolu P :
     dessus   rot = −A        pastille (px,  py)  angle propre A − P
     dessous  rot = 180 − A   pastille (px, −py)  angle propre P − A
   Le banc commun/test/banc-kicad-pcb.js le vérifie pastille par pastille.

   Le texte vient de l'extérieur : c'est une donnée, jamais exécutée ; les
   nombres sont bornés, les boucles aussi. Ce qui ne passe pas (ou passe
   approché) est dit une fois par genre dans le rapport (rap.ecart).
   ============================================================================= */

const KICAD_PCB = (() => {
  const { enfant, enfants, nb, val, xy, q, ecrireS, uuid, Refus, VERSION_PCB } = KICAD;
  const COORD = 1e5, FLECHE = 0.005, TOUR = 2 * Math.PI, NET_MAX = 64;
  const r4 = v => Math.round(v * 1e4) / 1e4;
  const borne = (v, min, max, d = 0) => Math.min(max, Math.max(min, nb(v, d)));
  const co = v => borne(v, -COORD, COORD);
  const deg = a => { const r = Math.round((((a % 360) + 360) % 360) * 1000) / 1000; return r >= 360 ? 0 : r; };
  const STYLES_PADS = { chip: 1, row: 1, dip: 1, sop: 1, quad: 1, bga: 1 };

  /* rotation KiCad : degrés, sens trigonométrique à l'écran (Y vers le bas) */
  function rk(x, y, a) {
    if (!a) return [x, y];
    const r = a * Math.PI / 180, c = Math.cos(r), s = Math.sin(r);
    return [x * c + y * s, -x * s + y * c];
  }
  /* arc par trois points : centre, rayon, angle de départ, balayage signé
     (positif = sens horaire à l'écran, comme t.ca de l'éditeur) */
  function arc3(s, m, e) {
    const bx = m[0] - s[0], by = m[1] - s[1], cx = e[0] - s[0], cy = e[1] - s[1];
    const d = 2 * (bx * cy - by * cx);
    if (Math.abs(d) < 1e-12) return null;
    const b2 = bx * bx + by * by, c2 = cx * cx + cy * cy;
    const ox = s[0] + (cy * b2 - by * c2) / d, oy = s[1] + (bx * c2 - cx * b2) / d;
    const t0 = Math.atan2(s[1] - oy, s[0] - ox), n = v => ((v % TOUR) + TOUR) % TOUR;
    let sw = n(Math.atan2(e[1] - oy, e[0] - ox) - t0);
    if (n(Math.atan2(m[1] - oy, m[0] - ox) - t0) > sw) sw -= TOUR;   // le milieu est de l'autre côté
    return { ox, oy, r: Math.hypot(s[0] - ox, s[1] - oy), t0, sw };
  }
  /* cordes d'un arc, flèche ≤ FLECHE ; bouts exacts si donnés */
  function cordes(A, s, e) {
    const pas = A.r > FLECHE ? 2 * Math.acos(1 - FLECHE / A.r) : Math.PI / 2;
    const n = Math.min(720, Math.max(1, Math.ceil(Math.abs(A.sw) / pas)));
    const out = [];
    for (let i = 0; i <= n; i++) {
      const t = A.t0 + A.sw * i / n;
      out.push([A.ox + A.r * Math.cos(t), A.oy + A.r * Math.sin(t)]);
    }
    if (s) out[0] = s;
    if (e) out[n] = e;
    return out;
  }
  const cercle = (ox, oy, r) => cordes({ ox, oy, r, t0: 0, sw: TOUR }).slice(0, -1);
  const aire = P => { let a = 0; for (let i = 0, j = P.length - 1; i < P.length; j = i++) a += P[j][0] * P[i][1] - P[i][0] * P[j][1]; return a / 2; };
  function dedans(x, y, P) {
    let c = false;
    for (let i = 0, j = P.length - 1; i < P.length; j = i++)
      if ((P[i][1] > y) !== (P[j][1] > y) && x < (P[j][0] - P[i][0]) * (y - P[i][1]) / (P[j][1] - P[i][1]) + P[i][0]) c = !c;
    return c;
  }
  const pt = (l, nom) => { const e = enfant(l, nom); return [co(e && e[1]), co(e && e[2])]; };
  const largeur = l => borne(val(enfant(l, "stroke"), "width", val(l, "width", 0.12)), 0, 10, 0.12);
  const plein = l => ["yes", "solid"].includes(val(l, "fill"));
  const cache = l => val(l, "hide") === "yes" || l.slice(3).includes("hide") ||
    val(enfant(l, "effects"), "hide") === "yes" || (enfant(l, "effects") || []).includes("hide");

  /* sommets d'une liste (pts (xy …) (arc …)), passés par T */
  function sommets(l, T) {
    const out = [];
    for (const p of (enfant(l, "pts") || []).slice(1)) {
      if (!Array.isArray(p)) continue;
      if (p[0] === "xy") out.push(T(co(p[1]), co(p[2])));
      else if (p[0] === "arc") {
        const s = pt(p, "start"), m = pt(p, "mid"), e = pt(p, "end"), A = arc3(s, m, e);
        for (const c of (A ? cordes(A, s, e) : [s, e]).slice(out.length ? 1 : 0)) out.push(T(c[0], c[1]));
      }
      if (out.length > 500000) break;
    }
    return out;
  }
  /* tracé gr_* / fp_* → { pts, ferme, plein, w } dans le repère que donne T */
  function trace(e, T) {
    const g = e[0].replace(/^(gr|fp)_/, ""), w = largeur(e);
    if (g === "line") return { pts: [pt(e, "start"), pt(e, "end")].map(p => T(...p)), ferme: false, w };
    if (g === "arc") {
      const s = pt(e, "start"), m = pt(e, "mid"), f = pt(e, "end"), A = arc3(s, m, f);
      return { pts: (A ? cordes(A, s, f) : [s, f]).map(p => T(...p)), ferme: false, w };
    }
    if (g === "circle") {
      const c = pt(e, "center"), f = pt(e, "end");
      return { pts: cercle(c[0], c[1], Math.hypot(f[0] - c[0], f[1] - c[1])).map(p => T(...p)), ferme: true, plein: plein(e), w };
    }
    if (g === "rect") {
      const [x1, y1] = pt(e, "start"), [x2, y2] = pt(e, "end");
      return { pts: [[x1, y1], [x2, y1], [x2, y2], [x1, y2]].map(p => T(...p)), ferme: true, plein: plein(e), w };
    }
    if (g === "poly") return { pts: sommets(e, T), ferme: true, plein: plein(e), w };
    if (g === "curve") {                     // Bézier cubique : seize cordes
      const P = sommets(e, (x, y) => [x, y]);
      if (P.length !== 4) return null;
      const out = [];
      for (let i = 0; i <= 16; i++) {
        const t = i / 16, u = 1 - t, k = [u * u * u, 3 * u * u * t, 3 * u * t * t, t * t * t];
        out.push(T(k.reduce((a, c, j) => a + c * P[j][0], 0), k.reduce((a, c, j) => a + c * P[j][1], 0)));
      }
      return { pts: out, ferme: false, w };
    }
    return null;
  }

  /* ---------- contour : segments Edge.Cuts enchaînés en polygones ---------- */
  function contours(morceaux, fermes, rap) {
    const TOL = 0.01, g = new Map(), pris = new Uint8Array(morceaux.length);
    const cle = (x, y) => Math.floor(x / TOL) + ":" + Math.floor(y / TOL);
    morceaux.forEach((M, i) => [0, 1].forEach(b => {
      const p = b ? M[M.length - 1] : M[0], k = cle(p[0], p[1]);
      (g.get(k) || g.set(k, []).get(k)).push([i, b]);
    }));
    const suivant = p => {
      const gx = Math.floor(p[0] / TOL), gy = Math.floor(p[1] / TOL);
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++)
        for (const [i, b] of g.get((gx + dx) + ":" + (gy + dy)) || []) {
          if (pris[i]) continue;
          const M = morceaux[i], r = b ? M[M.length - 1] : M[0];
          if (Math.hypot(r[0] - p[0], r[1] - p[1]) <= TOL) return [i, b];
        }
      return null;
    };
    const polys = fermes.slice();
    let ouverts = 0;
    for (let i = 0; i < morceaux.length; i++) {
      if (pris[i]) continue;
      pris[i] = 1;
      let ch = morceaux[i].slice();
      const boucle = (fin) => {
        for (let s; (s = suivant(ch[ch.length - 1]));) {
          pris[s[0]] = 1;
          const M = s[1] ? morceaux[s[0]].slice().reverse() : morceaux[s[0]];
          for (let k = 1; k < M.length; k++) ch.push(M[k]);
          if (Math.hypot(ch[0][0] - ch[ch.length - 1][0], ch[0][1] - ch[ch.length - 1][1]) <= TOL) return true;
        }
        return fin;
      };
      let ferme = boucle(false);
      if (!ferme) { ch.reverse(); ferme = boucle(false); }
      if (ferme) ch.pop(); else ouverts++;
      if (ch.length >= 3) polys.push(ch);
    }
    if (ouverts) rap.ecart("contour Edge.Cuts ouvert : refermé au plus court");
    const P = polys.filter(p => p.length >= 3 && Math.abs(aire(p)) > 1e-6);
    if (!P.length) return null;
    P.sort((a, b) => Math.abs(aire(b)) - Math.abs(aire(a)));
    const ext = P[0], dec = [];
    for (const p of P.slice(1)) {
      if (dedans(p[0][0], p[0][1], ext)) dec.push(p);
      else rap.ecart("plusieurs contours disjoints (flan) : seul le plus grand est gardé");
    }
    return { ext, dec };
  }

  /* ---------- correspondances ---------- */
  const COULEURS = { Green: "vert", Red: "rouge", Blue: "bleu", Black: "noir", White: "blanc", Yellow: "jaune", Purple: "violet" };
  const FINITIONS = { "ENIG": "ENIG (or chimique)", "ENEPIG": "ENIG (or chimique)", "HAL SnPb": "HASL étain-plomb",
    "HAL lead-free": "HASL sans plomb", "OSP": "OSP", "HT_OSP": "OSP", "Immersion silver": "Argent chimique",
    "Hard gold": "Or dur (contacts)" };
  const nomPropre = s => { const n = String(s).replace(/[^A-Za-z0-9_.+-]/g, "_").slice(0, 60); return !n || /^\.+$/.test(n) ? "KICAD" : n; };
  /* motif KiCad à jokers (* et ?) : parcours glouton, O(n·m) au pire, pas d'expression régulière à retours arrière */
  function joker(p, s) {
    let i = 0, j = 0, etoile = -1, k = 0;
    while (i < s.length) {
      if (j < p.length && (p[j] === "?" || p[j] === s[i])) { i++; j++; }
      else if (j < p.length && p[j] === "*") { etoile = j++; k = i; }
      else if (etoile >= 0) { j = etoile + 1; i = ++k; }
      else return false;
    }
    while (p[j] === "*") j++;
    return j === p.length;
  }
  const mini = a => a.reduce((m, v) => v < m ? v : m, Infinity), maxi = a => a.reduce((m, v) => v > m ? v : m, -Infinity);

  /* =========================================================================
     LECTURE : arbre .kicad_pcb (+ .kicad_pro) → { doc, empreintes }
     ========================================================================= */
  function lire(arbre, pro, rap) {
    rap = rap || KICAD.rapport();
    if (!Array.isArray(arbre) || arbre[0] !== "kicad_pcb") throw new Refus("ce fichier n'est pas une carte KiCad (.kicad_pcb)");
    if (nb(val(arbre, "version"), 0) < 20211014)
      throw new Refus("carte KiCad antérieure à la version 6 : ouvre-la et enregistre-la avec KiCad 9 avant l'import");

    /* couches de cuivre : F.Cu, In1.Cu…, B.Cu → 0, 1…, cu − 1 */
    const cuNoms = (enfant(arbre, "layers") || []).filter(Array.isArray).map(l => String(l[1])).filter(n => /^(F|B|In\d+)\.Cu$/.test(n));
    const inner = cuNoms.filter(n => n.startsWith("In")).map(n => parseInt(n.slice(2), 10)).sort((a, b) => a - b);
    const cu = Math.min(32, Math.max(2, inner.length + 2));
    if (inner.length + 2 > 32) rap.ecart("plus de 32 couches de cuivre : les couches en trop sont écartées");
    const rangIn = new Map(inner.map((k, i) => [k, i + 1]));
    const couche = n => n === "F.Cu" ? 0 : n === "B.Cu" ? cu - 1 :
      (/^In\d+\.Cu$/.test(n) && rangIn.has(parseInt(n.slice(2), 10)) && rangIn.get(parseInt(n.slice(2), 10)) < cu - 1) ? rangIn.get(parseInt(n.slice(2), 10)) : -1;
    const couches = noms => {
      const out = new Set();
      for (const n of noms.map(String)) {
        if (n === "*.Cu") for (let i = 0; i < cu; i++) out.add(i);
        else if (n === "F&B.Cu") { out.add(0); out.add(cu - 1); }
        else if (couche(n) >= 0) out.add(couche(n));
      }
      return [...out].sort((a, b) => a - b);
    };

    /* nets : KiCad 9 (net 3 "GND") et table en tête ; KiCad 10 (net "GND") */
    const table = new Map();
    for (const n of enfants(arbre, "net")) if (n.length >= 3) table.set(String(n[1]), String(n[2]));
    let coupes = 0;
    const propre = s => { const t = String(s).trim(); if (t.length > NET_MAX) coupes++; return t.slice(0, NET_MAX).trim(); };
    const netDe = l => {
      const e = enfant(l, "net");
      if (!e || e.length < 2) return "";
      if (e.length >= 3) return propre(e[2]);
      const v = String(e[1]);
      return table.has(v) ? propre(table.get(v)) : /^\d+$/.test(v) ? "" : propre(v);
    };

    let id = 1;
    const fps = [], tracks = [], vias = [], zones = [], cuts = [], holes = [], drawings = [], defs = new Map(), retires = [];
    const bords = [], bordsFermes = [];
    const regle = {};

    const dessin = (t, couche) => {
      if (!t || t.pts.length < 2) return;
      const layer = couche === "B.SilkS" ? "silkB" : "silkT";
      if (t.ferme && t.plein && t.pts.length >= 3) {
        drawings.push({ id: id++, shape: "poly", type: "poly", layer, pts: t.pts.map(p => ({ x: r4(p[0]), y: r4(p[1]) })) });
        return;
      }
      const P = t.ferme ? t.pts.concat([t.pts[0]]) : t.pts;
      for (let i = 1; i < P.length; i++)
        if (Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]) > 1e-6)
          drawings.push({ id: id++, shape: "line", type: "line", layer, x1: r4(P[i - 1][0]), y1: r4(P[i - 1][1]),
                          x2: r4(P[i][0]), y2: r4(P[i][1]), width: r4(Math.max(0.05, t.w)) });
    };
    const texte = (txt, x, y, a, l, couche) => {
      const f = enfant(enfant(l, "effects"), "font"), s = enfant(f, "size");
      const j = enfant(enfant(l, "effects"), "justify");
      if (j && (j.includes("left") || j.includes("right"))) rap.ecart("texte : justification à gauche ou à droite reprise centrée");
      drawings.push({ id: id++, shape: "text", type: "text", layer: couche === "B.SilkS" ? "silkB" : "silkT",
                      text: String(txt).slice(0, 200), x1: r4(x), y1: r4(y), x2: r4(x), y2: r4(y),
                      size: r4(borne(s && s[1], 0.5, 25, 1)), height: r4(borne(s && s[1], 0.5, 25, 1)),
                      rot: deg(-a), width: r4(borne(val(f, "thickness"), 0.05, 5, 0.15)) });
    };
    /* un tracé selon sa couche : contour, sérigraphie, ou écarté avec son motif */
    const ranger = (e, T, coucheNom) => {
      const n = String(coucheNom || "");
      if (n === "Edge.Cuts") {
        const t = trace(e, T);
        if (t && t.pts.length >= 2) (t.ferme ? bordsFermes : bords).push(t.pts);
      } else if (n === "F.SilkS" || n === "B.SilkS") {
        if (/_text_box$|_textbox$/.test(e[0])) rap.ecart("boîte de texte de sérigraphie : non reprise");
        else dessin(trace(e, T), n);
      } else if (/\.Cu$/.test(n)) rap.ecart("dessin sur une couche de cuivre (hors piste et zone) : non repris");
      else if (/Mask$|Paste$/.test(n)) rap.ecart("dessin sur le masque ou la pâte : non repris");
      else if (n !== "Margin") rap.ecart("dessins des couches Fab, Courtyard et User : non repris (l'éditeur n'a pas ces couches)");
    };

    /* zones : cuivre, zone interdite (découpe de cuivre) ou goutte écartée */
    const lireZone = z => {
      const attr = enfant(z, "attr");
      if (attr && enfant(attr, "teardrop")) { rap.ecart("goutte (teardrop) : non reprise"); return; }
      const ls = couches(enfant(z, "layers") ? enfant(z, "layers").slice(1) : [val(z, "layer", "")]);
      const polys = enfants(z, "polygon").map(p => sommets(p, (x, y) => [x, y])).filter(p => p.length >= 3);
      if (!ls.length || !polys.length) { rap.ecart("zone sans couche de cuivre ni contour : non reprise"); return; }
      if (polys.length > 1) rap.ecart("zone en plusieurs contours : chacun devient une zone");
      const pts = p => p.map(c => ({ x: r4(c[0]), y: r4(c[1]) }));
      const ko = enfant(z, "keepout");
      if (ko) {
        const non = k => val(ko, k) === "not_allowed";
        if (!non("tracks") && !non("copperpour")) { rap.ecart("zone interdite aux vias, pastilles ou composants seulement : non reprise"); return; }
        if (!(non("tracks") && non("copperpour")) || non("vias") || non("pads") || non("footprints"))
          rap.ecart("zone interdite reprise comme découpe de cuivre (pistes et coulée interdites, le reste permis)");
        for (const l of ls) for (const p of polys) cuts.push({ id: id++, l, pts: pts(p) });
        return;
      }
      const net = enfant(z, "net_name") ? propre(val(z, "net_name", "")) : netDe(z);
      const cp = enfant(z, "connect_pads"), mode = cp && typeof cp[1] === "string" ? cp[1] : "";
      const connexion = mode === "yes" ? "directe" : mode === "no" ? "aucune" : null;
      if (mode === "thru_hole_only") rap.ecart("zone reliée aux seules pastilles traversantes : reprise avec bras thermiques partout");
      if (nb(val(z, "priority"), 0) > 0) rap.ecart("priorité de zone : non reprise (l'éditeur remplit dans l'ordre)");
      const fill = enfant(z, "fill");
      if (val(fill, "mode") === "hatch") rap.ecart("zone hachurée : reprise pleine");
      if (regle.thermal == null && enfant(fill, "thermal_bridge_width")) regle.thermal = borne(val(fill, "thermal_bridge_width"), 0, 100, 0.5);
      if (regle.cuMin == null && enfant(z, "min_thickness")) regle.cuMin = borne(val(z, "min_thickness"), 0, 5, 0.2);
      for (const l of ls) for (const p of polys) {
        const o = { id: id++, l, net, pts: pts(p) };
        if (connexion) o.connexion = connexion;
        zones.push(o);
      }
    };

    /* ---------- empreintes ---------- */
    for (const f of enfants(arbre, "footprint")) {
      const brut = String(f[1] == null ? "" : f[1]), nomK = brut.replace(/^.*:/, "");
      const [X, Y, A] = xy(f).map((v, i) => i < 2 ? co(v) : nb(v));
      const bas = val(f, "layer") === "B.Cu";
      const monde = (x, y) => { const [u, v] = rk(x, y, A); return [X + u, Y + v]; };
      const vu = (x, y) => bas ? [x, -y] : [x, y];             // repère du fichier → vu de dessus
      const prop = (k, d) => {
        const p = enfants(f, "property").find(e => e[1] === k) || enfants(f, "fp_text").find(e => e[1] === k.toLowerCase());
        return p ? String(p[2] == null ? "" : p[2]) : d;
      };
      const ref = prop("Reference", "").slice(0, 32), value = prop("Value", "").slice(0, 240);
      if (enfant(f, "attr") && enfant(f, "attr").includes("dnp")) rap.ecart("composant non monté (DNP) : marque non reprise");

      /* pastilles */
      const lus = [], trousL = [], noms = new Map();
      const cote = bas ? "B.Cu" : "F.Cu", autre = bas ? "F.Cu" : "B.Cu";
      for (const p of enfants(f, "pad")) {
        const num = String(p[1] == null ? "" : p[1]), genre = String(p[2]), forme = String(p[3]);
        const at = enfant(p, "at"), px = co(at && at[1]), py = co(at && at[2]), P = nb(at && at[3]);
        const s = enfant(p, "size"), w = borne(s && s[1], 0, 200), h = borne(s && s[2], 0, 200, w);
        const [x, y] = vu(px, py), rot = bas ? deg(P - A) : deg(A - P);
        const dr = enfant(p, "drill"), dv = (dr || []).slice(1).filter(t => typeof t === "string" && /^-?[\d.]+$/.test(t)).map(Number);
        const dx = borne(dv[0], 0, 200), dy = dv.length > 1 ? borne(dv[1], 0, 200) : dx;
        if (enfant(dr, "offset") && (nb(enfant(dr, "offset")[1]) || nb(enfant(dr, "offset")[2])))
          rap.ecart("perçage décalé dans sa pastille : décalage non repris");
        const ls = (enfant(p, "layers") || []).slice(1).map(String);
        if (genre === "np_thru_hole") {
          const t = { x: r4(x), y: r4(y), d: r4(Math.min(dx, dy) || Math.min(w, h)) };
          if (Math.max(dx, dy) > t.d + 1e-6) { t.w = r4(Math.max(dx, dy)); t.rot = deg(rot + (dy > dx ? 90 : 0)); }
          trousL.push({ t, monde: monde(px, py), rotMonde: deg(-P - (dy > dx ? 90 : 0)) });
          continue;
        }
        const traversant = genre === "thru_hole";
        if (traversant && !(Math.min(dx, dy) > 0)) { rap.ecart("pastille traversante sans perçage : écartée"); continue; }
        if (!traversant) {
          if (!ls.some(c => c === cote || c === "*.Cu")) {
            if (!ls.includes(autre)) { rap.ecart("pastille sans cuivre (ouverture de masque, pâte seule) : écartée"); continue; }
            rap.ecart("pastille CMS sur l'autre face que son composant (doigts de connecteur de bord) : posée sur la face du composant, à vérifier");
          }
          if (genre === "connect") rap.ecart("pastille de contact (connect) : reprise comme CMS");
        }
        const o = { num, x: r4(x), y: r4(y), w: r4(Math.max(0.05, w)), h: r4(Math.max(0.05, h)), shape: "rect", drill: traversant ? r4(Math.min(dx, dy)) : 0, rot, net: netDe(p) };
        if (traversant && Math.max(dx, dy) > Math.min(dx, dy) + 1e-6) {
          o.slot = r4(Math.max(dx, dy));
          if ((dx > dy) !== (w >= h)) rap.ecart("perçage oblong en travers de sa pastille : repris dans le sens de la pastille");
        }
        if (forme === "rect") o.shape = "sharp";
        else if (forme === "circle") { o.shape = "circ"; o.h = o.w; }
        else if (forme === "oval") o.shape = "oval";
        else if (forme === "trapezoid") { o.shape = "sharp"; rap.ecart("pastille trapézoïdale : reprise rectangulaire"); }
        else if (forme === "roundrect") {
          const ch = (enfant(p, "chamfer") || []).slice(1), cr = nb(val(p, "chamfer_ratio"), 0);
          if (cr > 0 && ch.length) {
            let [hg, hd, bg, bd] = ["top_left", "top_right", "bottom_left", "bottom_right"].map(k => ch.includes(k));
            if (bas) [hg, hd, bg, bd] = [bg, bd, hg, hd];
            o.shape = "chamfer";
            o.chamfer = r4(cr * Math.min(w, h));
            o.chamferCorners = hg && hd && bg && bd ? "all" : [hg, hd, bd, bg];
            if (nb(val(p, "roundrect_rratio"), 0) > 0.01) rap.ecart("pastille chanfreinée et arrondie : arrondi non repris");
          } else if (nb(val(p, "roundrect_rratio"), 0.25) < 0.05) o.shape = "sharp";
        } else if (forme === "custom") {
          /* le plus grand polygone devient la pastille ; ses traits deviennent des pistes */
          const cand = [], [cx, cy] = monde(px, py);
          for (const c of (enfant(p, "primitives") || []).slice(1)) {
            if (!Array.isArray(c)) continue;
            if (/^gr_(poly|rect)$/.test(c[0]) || (c[0] === "gr_circle" && plein(c))) cand.push(trace(c, (u, v) => [u, v]).pts);
            else if (/^gr_(line|arc|curve)$/.test(c[0])) {
              const t = trace(c, (u, v) => { const [a, b] = rk(u, v, P); return [cx + a, cy + b]; });
              const l = traversant ? 0 : bas ? cu - 1 : 0;
              for (let i = 1; t && i < t.pts.length; i++)
                tracks.push({ l, net: o.net, w: r4(Math.max(0.01, largeur(c))), x1: r4(t.pts[i - 1][0]), y1: r4(t.pts[i - 1][1]), x2: r4(t.pts[i][0]), y2: r4(t.pts[i][1]) });
              rap.ecart("pastille personnalisée : ses traits deviennent des pistes");
            } else rap.ecart("pastille personnalisée : primitive « " + String(c[0]).slice(0, 20) + " » non reprise");
          }
          const P3 = cand.filter(c => c.length >= 3).sort((a, b) => Math.abs(aire(b)) - Math.abs(aire(a)));
          const rond = val(enfant(p, "options"), "anchor") !== "rect", ancre = rond ? Math.PI * w * w / 4 : w * h;
          if (P3.length > 1 || (P3.length && ancre > Math.abs(aire(P3[0]))))
            rap.ecart("pastille personnalisée : seul son plus grand morceau (ancre ou polygone) est repris");
          if (P3.length && Math.abs(aire(P3[0])) >= ancre) {
            o.shape = "poly";
            o.pts = P3[0].map(([u, v]) => ({ x: r4(u), y: r4(bas ? -v : v) }));
            o.w = r4(Math.max(0.05, 2 * maxi(o.pts.map(c => Math.abs(c.x)))));
            o.h = r4(Math.max(0.05, 2 * maxi(o.pts.map(c => Math.abs(c.y)))));
          } else if (rond) { o.shape = "circ"; o.h = o.w; } else o.shape = "sharp";
        } else rap.ecart("forme de pastille inconnue : reprise en rectangle arrondi");
        const mm = enfant(p, "solder_mask_margin"), pm = enfant(p, "solder_paste_margin") || enfant(f, "solder_paste_margin");
        if (mm) o.mask = r4(borne(mm[1], -5, 5));
        if (pm) o.paste = r4(borne(pm[1], -5, 5));
        if (enfant(p, "solder_paste_margin_ratio") || enfant(f, "solder_paste_margin_ratio")) rap.ecart("retrait de pâte en proportion : non repris");
        if (!ls.some(c => /Mask$/.test(c))) o.noMask = true;
        if (!traversant && !ls.some(c => /Paste$/.test(c))) o.noPaste = true;
        const zc = val(p, "zone_connect");
        if (zc === "0") o.connexion = "aucune"; else if (zc === "2") o.connexion = "directe";
        lus.push(o);
      }
      /* numéros : les entiers restent, les noms (« A1 », « EP », « ») suivent le plus grand */
      const entier = s => /^\d+$/.test(s) && +s >= 1 && +s <= 4096;
      const max = lus.reduce((m, o) => entier(o.num) ? Math.max(m, +o.num) : m, 0);
      const pads = [], nets = {};
      for (const o of lus) {
        let n;
        if (entier(o.num)) n = +o.num;
        else { if (!noms.has(o.num)) noms.set(o.num, max + noms.size + 1); n = noms.get(o.num); }
        if (n > 4096) { rap.ecart("empreinte de plus de 4096 pastilles : les dernières sont écartées"); continue; }
        const { num, net, ...pad } = o;
        pad.n = n;
        if (!entier(num) && num) pad.nom = num.slice(0, 16);
        if (net) { if (nets[n] && nets[n] !== net) rap.ecart("pastilles de même numéro sur deux nets : le premier est gardé"); else nets[n] = net; }
        pads.push(pad);
      }

      /* tracés : sérigraphie et contour au monde ; Fab (sinon Courtyard) donne le corps */
      const corps = { F: [], C: [] };
      for (const e of f) {
        if (!Array.isArray(e) || !/^fp_(line|arc|circle|rect|poly|curve|text_box)$/.test(e[0])) continue;
        const L = String(val(e, "layer", ""));
        if (/\.(Fab|CrtYd)$/.test(L)) {
          const t = trace(e, vu);
          if (t) (L.endsWith("Fab") ? corps.F : corps.C).push(...t.pts);
        }
        if (e[0] !== "fp_text_box" || /SilkS$/.test(L)) ranger(e, monde, L);
      }
      for (const e of enfants(f, "property").concat(enfants(f, "fp_text"))) {
        const L = String(val(e, "layer", ""));
        if (!/SilkS$/.test(L) || cache(e)) continue;
        const k = e[0] === "fp_text" ? e[1] : e[1] === "Reference" ? "reference" : e[1] === "Value" ? "value" : "";
        const t = k === "reference" ? ref : k === "value" ? value : String(e[2] == null ? "" : e[2])
          .replace(/\$\{REFERENCE\}/g, ref).replace(/\$\{VALUE\}/g, value);
        const a = enfant(e, "at");
        if (!t) continue;
        texte(t, ...monde(co(a && a[1]), co(a && a[2])), nb(a && a[3]), e, L);
      }
      for (const z of enfants(f, "zone")) lireZone(z);

      if (!pads.length) {
        for (const t of trousL) {
          const o = { id: id++, x: r4(t.monde[0]), y: r4(t.monde[1]), d: t.t.d };
          if (t.t.w) { o.w = t.t.w; o.rot = t.rotMonde; }
          holes.push(o);
        }
        rap.ecart("empreinte sans pastille de cuivre (trou de fixation, logo) : trous et dessins gardés sur la carte, composant retiré");
        if (ref) retires.push(ref);
        continue;
      }
      const src = corps.F.length ? corps.F : corps.C;
      let body;
      if (src.length) {
        const xs = src.map(p => p[0]), ys = src.map(p => p[1]);
        body = { x1: r4(mini(xs)), y1: r4(mini(ys)), x2: r4(maxi(xs)), y2: r4(maxi(ys)) };
      } else {
        body = { x1: r4(mini(pads.map(q => q.x - q.w / 2))), y1: r4(mini(pads.map(q => q.y - q.h / 2))),
                 x2: r4(maxi(pads.map(q => q.x + q.w / 2))), y2: r4(maxi(pads.map(q => q.y + q.h / 2))) };
      }
      if (body.x2 - body.x1 < 0.1) body.x2 = r4(body.x1 + 0.1);
      if (body.y2 - body.y1 < 0.1) body.y2 = r4(body.y1 + 0.1);
      const distincts = new Set(pads.map(q => q.n)).size;
      const xs = new Set(pads.map(q => q.x)).size, ys = new Set(pads.map(q => q.y)).size;
      const style = pads.every(q => q.drill > 0) ? (xs === 1 || ys === 1 ? "row" : "dip")
        : distincts <= 2 ? "chip" : (xs <= 2 || ys <= 2) ? "sop" : pads.length >= xs * ys * 0.8 ? "bga" : "quad";
      const pins = maxi(pads.map(q => q.n));
      const fp = { id: id++, ref, value, pkg: nomK.slice(0, 120), pins, style, x: X, y: Y,
                   rot: bas ? deg(180 - A) : deg(-A), side: bas ? 1 : 0, nets, pads, body, silk: false };
      if (trousL.length) fp.holes = trousL.map(t => t.t);
      fps.push(fp);

      /* empreinte de LIB : la première pose de chaque nom KiCad */
      if (nomK && !defs.has(nomK)) {
        const name = nomPropre(nomK);
        const def = { format: "pcbfp-1", name, pkg: nomK.slice(0, 80), pins: distincts, style,
                      pads: pads.map(q => JSON.parse(JSON.stringify(q))), body };
        if (fp.holes && fp.holes.every(t => t.d >= 0.4 && t.d <= 30)) def.holes = fp.holes.map(t => ({ x: t.x, y: t.y, d: t.d }));
        const descr = val(f, "descr");
        if (typeof descr === "string" && descr) def.description = Array.from(descr.replace(/[\x00-\x08\x0b-\x1f\x7f]/g, " ")).slice(0, 2000).join("");
        defs.set(nomK, def);
      }
    }

    /* ---------- pistes, vias, zones, dessins de carte ---------- */
    const noCu = new Set();
    for (const e of arbre) {
      if (!Array.isArray(e)) continue;
      const k = e[0];
      if (k === "segment" || k === "arc") {
        const l = couche(String(val(e, "layer", "")));
        if (l < 0) { noCu.add(1); continue; }
        const s = pt(e, "start"), f = pt(e, "end");
        if (s[0] === f[0] && s[1] === f[1]) continue;              // segment nul : l'éditeur l'écarterait
        const t = { l, net: netDe(e), w: r4(borne(val(e, "width"), 0.01, 100, 0.25)), x1: s[0], y1: s[1], x2: f[0], y2: f[1] };
        if (k === "arc") {
          const A = arc3(s, pt(e, "mid"), f);
          if (A && Math.abs(A.sw) > 1e-4) t.ca = r4(Math.max(-(TOUR - 1e-3), Math.min(TOUR - 1e-3, A.sw)));
        }
        tracks.push(t);
      } else if (k === "via") {
        const ls = couches((enfant(e, "layers") || []).slice(1));
        if (e.includes("micro")) rap.ecart("microvia : reprise comme via borgne");
        if (enfant(e, "padstack")) rap.ecart("via à diamètres par couche : le diamètre principal est gardé");
        const [x, y] = pt(e, "at"), d = borne(val(e, "size"), 0.1, 20, 0.6);
        vias.push({ id: id++, x, y, d: r4(d), drill: r4(borne(val(e, "drill"), 0.05, Math.max(0.05, d - 0.05), 0.3)),
                    a: ls.length ? ls[0] : 0, b: ls.length > 1 ? ls[ls.length - 1] : cu - 1, net: netDe(e) });
      } else if (k === "zone") lireZone(e);
      else if (/^gr_(line|arc|circle|rect|poly|curve|text_box)$/.test(k)) ranger(e, (x, y) => [x, y], val(e, "layer", ""));
      else if (k === "gr_text") {
        const L = String(val(e, "layer", ""));
        if (/SilkS$/.test(L)) { const a = enfant(e, "at"); texte(e[1] == null ? "" : e[1], co(a && a[1]), co(a && a[2]), nb(a && a[3]), e, L); }
        else if (/\.Cu$/.test(L)) rap.ecart("texte sur une couche de cuivre : non repris");
        else rap.ecart("textes des couches Fab, Courtyard et User : non repris");
      } else if (k === "dimension") rap.ecart("cote (dimension) : non reprise");
      else if (k === "target") rap.ecart("mire (target) : non reprise");
      else if (k === "image") rap.ecart("image de référence : non reprise");
      else if (k === "table") rap.ecart("tableau : non repris");
    }
    if (noCu.size) rap.ecart("piste sur une couche de cuivre inconnue : écartée");
    if (coupes) rap.ecart("nom de net de plus de " + NET_MAX + " caractères : raccourci");

    /* ---------- contour ---------- */
    const board = {};
    const C = contours(bords, bordsFermes, rap);
    let ext = C && C.ext;
    if (!ext) {
      rap.ecart("pas de contour Edge.Cuts : contour rectangulaire autour des éléments");
      const P = fps.map(f => [f.x, f.y]).concat(tracks.flatMap(t => [[t.x1, t.y1], [t.x2, t.y2]]), vias.map(v => [v.x, v.y]));
      const xs = P.length ? P.map(p => p[0]) : [0, 100], ys = P.length ? P.map(p => p[1]) : [0, 80];
      const [x1, y1, x2, y2] = [mini(xs) - 2, mini(ys) - 2, maxi(xs) + 2, maxi(ys) + 2];
      ext = [[x1, y1], [x2, y1], [x2, y2], [x1, y2]];
    }
    const xs = ext.map(p => p[0]), ys = ext.map(p => p[1]);
    Object.assign(board, { x: r4(mini(xs)), y: r4(mini(ys)), w: r4(Math.max(1, maxi(xs) - mini(xs))),
                           h: r4(Math.max(1, maxi(ys) - mini(ys))), pts: ext.map(p => ({ x: r4(p[0]), y: r4(p[1]) })) });
    if (C && C.dec.length) board.cutouts = C.dec.slice(0, 500).map(p => p.map(c => ({ x: r4(c[0]), y: r4(c[1]) })));

    /* ---------- empilage et règles ---------- */
    const setup = enfant(arbre, "setup"), su = enfant(setup, "stackup");
    const stack = { target: borne(val(enfant(arbre, "general"), "thickness", 1.6), 0.05, 50, 1.6) };
    if (su) {
      const cuT = [], di = [];
      let attente = null;
      for (const L of enfants(su, "layer")) {
        const type = String(val(L, "type", "")), nom = String(L[1]);
        const ep = enfants(L, "thickness").reduce((a, t) => a + nb(t[1]), 0);
        if (type === "copper") { cuT.push({ t: borne(ep, 0.001, 2, 0.035) }); if (attente) { di.push(attente); attente = null; } }
        else if (/^dielectric/.test(nom) || /^(core|prepreg)$/i.test(type)) {
          if (attente) attente.t += ep;
          else attente = { k: /prepreg/i.test(type) ? "prepreg" : "core", t: ep, er: borne(val(L, "epsilon_r"), 1, 30, 4.5),
                           df: borne(val(L, "loss_tangent"), 0, 1, 0.02), mat: String(val(L, "material", "FR-4")).slice(0, 40) };
          if (cuT.length === 0) attente = null;
        } else if (nom === "F.Mask") {
          if (ep > 0) stack.maskT = borne(ep, 0, 1, 0.025);
          if (enfant(L, "epsilon_r")) stack.maskEr = borne(val(L, "epsilon_r"), 1, 20, 3.8);
          const c = String(val(L, "color", ""));
          if (COULEURS[c]) stack.maskColor = COULEURS[c]; else if (c && c !== "Not specified") rap.ecart("couleur de vernis non standard : vert gardé");
        } else if (nom === "F.SilkS") {
          const c = String(val(L, "color", ""));
          if (["blanc", "noir", "jaune"].includes(COULEURS[c])) stack.silkColor = COULEURS[c];
          else if (c && c !== "Not specified") rap.ecart("couleur de sérigraphie non standard : blanc gardé");
        }
      }
      for (const t of di) t.t = borne(t.t, 0.005, 20, 0.1);
      if (cuT.length === cu && di.length === cu - 1) { stack.cu = cuT; stack.di = di; }
      else rap.ecart("empilage KiCad incomplet : épaisseurs de cuivre et de diélectrique d'usine");
      const fin = String(val(su, "copper_finish", "None"));
      if (FINITIONS[fin]) stack.finish = FINITIONS[fin];
      else if (!["None", "User defined", ""].includes(fin)) rap.ecart("finition « " + fin.slice(0, 30) + " » inconnue de l'éditeur : ENIG gardée");
    }
    const rule = {};
    if (enfant(setup, "pad_to_mask_clearance")) rule.mask = borne(val(setup, "pad_to_mask_clearance"), -100, 100, 0.05);
    if (enfant(setup, "pad_to_paste_clearance")) rule.paste = borne(val(setup, "pad_to_paste_clearance"), -100, 100, 0);
    if (regle.thermal != null) rule.thermal = regle.thermal;
    if (regle.cuMin != null) rule.cuMin = regle.cuMin;
    const aux = enfant(setup, "aux_axis_origin");
    const pp = enfant(setup, "pcbplotparams");

    /* ---------- classes de nets (.kicad_pro) ---------- */
    const num = x => x != null && x !== "" && Number.isFinite(+x) ? +x : null;
    let classes = [{ name: "Default", w: 0.2, clr: 0.2, via: 0.6, drill: 0.3 }];
    const netClass = {};
    const ds = pro && pro.board && pro.board.design_settings, rules = ds && ds.rules;
    if (rules && typeof rules === "object") {
      if (num(rules.min_copper_edge_clearance) != null) rule.edge = borne(rules.min_copper_edge_clearance, 0, 100);
      if (num(rules.min_hole_to_hole) != null) rule.hole = borne(rules.min_hole_to_hole, 0, 100);
    }
    const ns = pro && pro.net_settings;
    if (ns && typeof ns === "object") {
      const liste = (Array.isArray(ns.classes) ? ns.classes : []).filter(c => c && typeof c === "object" && typeof c.name === "string").slice(0, 200);
      const def = liste.find(c => c.name === "Default") || {};
      const v = (c, k, d) => num(c[k]) != null ? +c[k] : num(def[k]) != null ? +def[k] : d;
      classes = [def].concat(liste.filter(c => c !== def)).map(c => ({
        name: c === def ? "Default" : String(c.name).slice(0, 40), w: v(c, "track_width", 0.2), clr: v(c, "clearance", 0.2),
        via: v(c, "via_diameter", 0.6), drill: v(c, "via_drill", 0.3) }));
      const connus = new Set(classes.slice(1).map(c => c.name));
      const tousNets = new Set([...table.values()].map(propre).concat(fps.flatMap(f => Object.values(f.nets)),
        tracks.map(t => t.net), vias.map(v => v.net), zones.map(z => z.net)).filter(Boolean));
      const motifs = (Array.isArray(ns.netclass_patterns) ? ns.netclass_patterns : []).slice(0, 2000);
      for (const m of motifs) {
        if (!m || typeof m.pattern !== "string" || m.pattern.length > 200 || !connus.has(m.netclass)) continue;
        if (!/[*?]/.test(m.pattern)) { const n = propre(m.pattern); if (tousNets.has(n) && !netClass[n]) netClass[n] = m.netclass; continue; }
        if (/^\/.*\/$/.test(m.pattern)) { rap.ecart("motif de classe de net en expression régulière : non repris"); continue; }
        for (const n of tousNets) if (!netClass[n] && joker(m.pattern, n)) netClass[n] = m.netclass;
      }
      const ass = ns.netclass_assignments;
      if (ass && typeof ass === "object")
        for (const [n, c] of Object.entries(ass).slice(0, 100000)) {
          const nom = Array.isArray(c) ? c.find(x => connus.has(x)) : c;
          if (connus.has(nom)) netClass[propre(n)] = nom;
        }
    }

    const doc = { format: "pcbedit-1", cu, cuL: [], stack, board, rule, classes, netClass,
                  origin: aux ? { x: r4(co(aux[1])), y: r4(co(aux[2])) } : { x: 0, y: 0 },
                  fabOrigin: !!(aux && val(pp, "useauxorigin") === "yes"),
                  fps, tracks, vias, zones, cuts, holes, drawings, active: 0, nextId: id };
    const empreintes = [];
    for (const def of defs.values()) {
      const r = COMPOSANTS_LIB.verifierEmpreinte(def, def.name + ".json");
      if (r.erreurs.length) rap.ecart("empreinte refusée par le contrôle de la LIB (pastilles qui se recouvrent, numérotation à trous…) : non proposée à l'ajout");
      else empreintes.push(def);
    }
    return { doc, empreintes, retires };
  }

  /* =========================================================================
     ÉCRITURE : document pcbedit-1 → .kicad_pcb, empreintes .kicad_mod, .kicad_pro partiel
     ========================================================================= */
  const COUCHES_UTILISATEUR = [[9, "F.Adhes", "F.Adhesive"], [11, "B.Adhes", "B.Adhesive"], [13, "F.Paste"], [15, "B.Paste"],
    [5, "F.SilkS", "F.Silkscreen"], [7, "B.SilkS", "B.Silkscreen"], [1, "F.Mask"], [3, "B.Mask"], [17, "Dwgs.User", "User.Drawings"],
    [19, "Cmts.User", "User.Comments"], [21, "Eco1.User", "User.Eco1"], [23, "Eco2.User", "User.Eco2"], [25, "Edge.Cuts"],
    [27, "Margin"], [31, "F.CrtYd", "F.Courtyard"], [29, "B.CrtYd", "B.Courtyard"], [35, "F.Fab"], [33, "B.Fab"]];
  const COULEURS_K = Object.fromEntries(Object.entries(COULEURS).map(([k, v]) => [v, k]));
  const FINITIONS_K = { "ENIG (or chimique)": "ENIG", "HASL étain-plomb": "HAL SnPb", "HASL sans plomb": "HAL lead-free",
    "OSP": "OSP", "Argent chimique": "Immersion silver", "Or dur (contacts)": "Hard gold" };
  const police = (s, w, miroir) => ["effects", ["font", ["size", s, s], ["thickness", w]]].concat(miroir ? [["justify", "mirror"]] : []);
  const trait = w => ["stroke", ["width", w], ["type", "solid"]];

  /* pastilles calculées d'une empreinte sans dessin (padsOf, 01-core.js)
     shortcut: copie de la partie paramétrique de padsOf ; à resynchroniser si l'éditeur change ses gabarits */
  function padsCalcules(fp) {
    const out = [], n = Math.max(1, Math.min(4096, Math.round(nb(fp.pins, 2)))), p = nb(fp.pitch, 1.27), sp = nb(fp.span, 5.2);
    if (fp.style === "chip") {
      const w = sp >= 3 ? 1.2 : Math.max(0.4, sp * 0.55), h = Math.max(0.45, sp * 0.62);
      for (let i = 0; i < n; i++) out.push({ n: i + 1, x: (i - (n - 1) / 2) * sp, y: 0, w, h, shape: "rect", drill: 0 });
    } else if (fp.style === "row") {
      for (let i = 0; i < n; i++)
        out.push({ n: i + 1, x: (i - (n - 1) / 2) * p, y: 0, w: p * 0.68, h: p * 0.68, shape: i === 0 ? "rect" : "circ", drill: Math.min(1.0, p * 0.34) });
    } else if (fp.style === "quad") {
      const b = Math.floor(n / 4), rr = n % 4, per = [b + (rr > 0 ? 1 : 0), b + (rr > 1 ? 1 : 0), b + (rr > 2 ? 1 : 0), b];
      const lg = Math.max(0.6, p * 1.8), br = Math.max(0.22, p * 0.55);
      let k = 1;
      for (let s = 0; s < 4; s++) for (let i = 0; i < per[s]; i++) {
        const t = (i - (per[s] - 1) / 2) * p;
        if (s === 0) out.push({ n: k++, x: -sp / 2, y: t, w: lg, h: br, shape: "rect", drill: 0 });
        else if (s === 1) out.push({ n: k++, x: t, y: sp / 2, w: br, h: lg, shape: "rect", drill: 0 });
        else if (s === 2) out.push({ n: k++, x: sp / 2, y: -t, w: lg, h: br, shape: "rect", drill: 0 });
        else out.push({ n: k++, x: -t, y: -sp / 2, w: br, h: lg, shape: "rect", drill: 0 });
      }
    } else if (fp.style === "bga") {
      const cols = Math.max(1, Math.ceil(Math.sqrt(n))), rows = Math.ceil(n / cols), d = Math.max(0.2, p * 0.5);
      for (let i = 0; i < n; i++)
        out.push({ n: i + 1, x: ((i % cols) - (cols - 1) / 2) * p, y: (Math.floor(i / cols) - (rows - 1) / 2) * p, w: d, h: d, shape: "circ", drill: 0 });
    } else {
      const h = Math.ceil(n / 2), rg = n - h, smd = fp.style === "sop";
      const pw = smd ? Math.max(0.9, sp * 0.30) : p * 0.68, ph = smd ? p * 0.55 : p * 0.68;
      for (let i = 0; i < h; i++)
        out.push({ n: i + 1, x: -sp / 2, y: (i - (h - 1) / 2) * p, w: pw, h: ph, shape: (smd || i === 0) ? "rect" : "circ", drill: smd ? 0 : Math.min(1.0, p * 0.34) });
      for (let i = h; i < n; i++)
        out.push({ n: i + 1, x: sp / 2, y: (n - 1 - i - (rg - 1) / 2) * p, w: pw, h: ph, shape: smd ? "rect" : "circ", drill: smd ? 0 : Math.min(1.0, p * 0.34) });
    }
    return out;
  }
  const padsDe = fp => Array.isArray(fp.pads) && fp.pads.length ? fp.pads : STYLES_PADS[fp.style] ? padsCalcules(fp) : [];

  function ecrire(doc, nomLib, rap, chemins) {
    rap = rap || KICAD.rapport();
    const d = doc && typeof doc === "object" ? doc : {};
    const lib = String(nomLib || "web_cao").replace(/[:"\\/\s]/g, "_") || "web_cao";
    const cu = Math.max(1, Math.min(32, Math.round(nb(d.cu, 2))));
    if (cu === 1) rap.ecart("carte simple face : écrite en deux couches, B.Cu vide");
    if (Array.isArray(d.interdits) && d.interdits.length)
      rap.ecart("zones de hauteur limitée (interdits mécaniques) : non exportées, KiCad n'a pas d'équivalent");
    const nomCu = i => i === 0 ? "F.Cu" : i === cu - 1 ? "B.Cu" : "In" + i + ".Cu";
    const arr = v => Array.isArray(v) ? v : [];
    const fpsD = arr(d.fps), tracksD = arr(d.tracks), viasD = arr(d.vias), zonesD = arr(d.zones);
    const rule = d.rule || {}, classes = arr(d.classes).length ? d.classes : [{ name: "Default", w: 0.25, clr: 0.2, via: 0.6, drill: 0.3 }];
    const netClass = d.netClass && typeof d.netClass === "object" ? d.netClass : {};
    const clrDe = net => { const c = classes.find(c => c.name === netClass[net]) || classes[0]; return nb(c.clr, 0.2); };

    /* table des nets */
    const tous = new Set();
    for (const f of fpsD) for (const n of Object.values(f.nets || {})) if (n) tous.add(String(n));
    for (const o of tracksD.concat(viasD, zonesD)) if (o && o.net) tous.add(String(o.net));
    const code = new Map([...tous].sort().map((n, i) => [n, i + 1]));
    const netK = n => n && code.has(n) ? ["net", code.get(n)] : ["net", 0];

    /* empreinte : arbre commun à la carte et à la bibliothèque */
    function arbreFp(fp, libId, o) {
      const bas = o.bas, A = o.A, Lc = bas ? "B." : "F.";
      const fl = (x, y) => bas ? [x, -y] : [x, y];                     // vu de dessus → repère du fichier
      const angle = r => bas ? deg(nb(r) + A) : deg(A - nb(r));          // angle propre → angle absolu KiCad
      const at = (x, y, a) => a ? ["at", x, y, a] : ["at", x, y];
      const pads = padsDe(fp), b = fp.body;
      const bx = b ? b : pads.length ? { x1: mini(pads.map(q => q.x - q.w / 2)), y1: mini(pads.map(q => q.y - q.h / 2)),
                                          x2: maxi(pads.map(q => q.x + q.w / 2)), y2: maxi(pads.map(q => q.y + q.h / 2)) }
                                      : { x1: -0.5, y1: -0.5, x2: 0.5, y2: 0.5 };
      const g = o.graine, u = k => ["uuid", q(uuid(g + ":" + k))];
      const champ = (nom, v, y, L, cacher) => ["property", q(nom), q(v), at(...fl(0, y), A), ["layer", q(Lc + L)]]
        .concat(cacher ? [["hide", "yes"]] : [], [u(nom), police(L === "SilkS" ? (nb(fp.refSize) || 1) : 1, L === "SilkS" ? (nb(fp.refWidth) || 0.15) : 0.15, bas)]);
      const out = ["footprint", q(libId)].concat(o.entete || [], [["layer", q(Lc + "Cu")]], o.mod ? [] : [u("fp"), at(nb(fp.x), nb(fp.y), A)]);
      out.push(champ("Reference", o.ref, bx.y1 - 1, "SilkS", o.cacherRef), champ("Value", o.value, bx.y2 + 1, "Fab", false));
      if (o.chemin) out.push(["path", q(o.chemin)]);
      const attr = ["attr", pads.length && pads.every(q => q.drill > 0) ? "through_hole" : pads.length ? "smd" : "board_only"];
      if (!pads.length) attr.push("exclude_from_pos_files", "exclude_from_bom");
      out.push(attr);
      if (b) out.push(["fp_rect", ["start", ...fl(b.x1, b.y1)], ["end", ...fl(b.x2, b.y2)], trait(0.1), ["fill", "no"], ["layer", q(Lc + "Fab")], u("corps")]);
      pads.forEach((p, i) => {
        const th = nb(p.drill) > 0, w = nb(p.w, 1), h = nb(p.h, 1);
        const forme = { sharp: "rect", oval: "oval", circ: Math.abs(w - h) < 1e-6 ? "circle" : "oval", chamfer: "roundrect", poly: "custom" }[p.shape] || "roundrect";
        const pad = ["pad", q(p.nom || String(p.n)), th ? "thru_hole" : "smd", forme, at(...fl(nb(p.x), nb(p.y)), angle(p.rot)),
                     forme === "custom" ? ["size", Math.min(w, h, 0.1), Math.min(w, h, 0.1)] : ["size", w, h]];
        if (th) pad.push(p.slot > p.drill ? ["drill", "oval", ...(w >= h ? [p.slot, p.drill] : [p.drill, p.slot])] : ["drill", p.drill]);
        pad.push(["layers", ...(th ? ["*.Cu"].concat(p.noMask ? [] : ["*.Mask"])
                                   : [Lc + "Cu"].concat(p.noMask ? [] : [Lc + "Mask"], p.noPaste ? [] : [Lc + "Paste"])).map(q)]);
        if (forme === "roundrect") pad.push(["roundrect_rratio", p.shape === "chamfer" ? 0 : 0.22]);
        if (p.shape === "chamfer") {
          const cc = p.chamferCorners, c4 = cc === "pin1" ? [true, false, false, false] : Array.isArray(cc) ? cc.map(Boolean) : [true, true, true, true];
          let [hg, hd, bd, bg] = c4;
          if (bas) [hg, hd, bd, bg] = [bg, bd, hd, hg];
          pad.push(["chamfer_ratio", Math.min(0.5, nb(p.chamfer, Math.min(w, h) * 0.25) / Math.min(w, h))],
                   ["chamfer", ...[[hg, "top_left"], [hd, "top_right"], [bg, "bottom_left"], [bd, "bottom_right"]].filter(c => c[0]).map(c => c[1])]);
        }
        const net = o.nets && o.nets[p.n];
        if (net && code.has(net)) pad.push(["net", code.get(net), q(net)]);
        if (p.mask != null) pad.push(["solder_mask_margin", nb(p.mask)]);
        if (p.paste != null) pad.push(["solder_paste_margin", nb(p.paste)]);
        if (p.connexion) pad.push(["zone_connect", { aucune: 0, thermique: 1, directe: 2 }[p.connexion] || 1]);
        if (forme === "custom")
          pad.push(["options", ["clearance", "outline"], ["anchor", "circle"]],
                   ["primitives", ["gr_poly", ["pts", ...arr(p.pts).map(c => ["xy", nb(c.x), bas ? -nb(c.y) : nb(c.y)])], ["width", 0], ["fill", "yes"]]]);
        pad.push(u("pad" + i));
        out.push(pad);
      });
      arr(fp.holes).forEach((t, i) => {
        const dd = nb(t.d, 3.2), ob = nb(t.w) > dd;
        out.push(["pad", q(""), "np_thru_hole", ob ? "oval" : "circle", at(...fl(nb(t.x), nb(t.y)), angle(t.rot)),
                  ["size", ob ? nb(t.w) : dd, dd], ob ? ["drill", "oval", nb(t.w), dd] : ["drill", dd], ["layers", q("*.Cu"), q("*.Mask")], u("trou" + i)]);
      });
      out.push(["embedded_fonts", "no"]);
      return out;
    }

    /* bibliothèque : une définition par géométrie distincte, suffixée si le nom est pris */
    const parSig = new Map(), prisNoms = new Set(), empreintes = [], librairie = new Map();
    const definir = (fp, base) => {
      const sig = JSON.stringify([padsDe(fp).map(p => [p.n, p.nom, p.x, p.y, p.w, p.h, p.shape, p.drill, p.slot, p.rot, p.pts, p.chamfer, p.chamferCorners, p.noMask, p.noPaste, p.mask, p.paste]),
                                  fp.holes || null, fp.body || null]);
      if (parSig.has(sig)) return parSig.get(sig);
      const b = nomPropre(base || "EMPREINTE");
      // sans égard à la casse : « SOT23 » et « sot23 » feraient un seul fichier sous Windows et macOS
      let nom = b;
      for (let k = 2; prisNoms.has(nom.toLowerCase()); k++) nom = b + "_" + k;
      prisNoms.add(nom.toLowerCase());
      parSig.set(sig, nom);
      empreintes.push({ nom, texte: ecrireS(arbreFp(fp, nom, { bas: false, A: 0, mod: true, ref: "REF**", value: nom, graine: "mod:" + nom,
        entete: [["version", VERSION_PCB], ["generator", q("web_cao")], ["generator_version", q("9.0")]] })) + "\n" });
      return nom;
    };

    const items = [];
    let silkAuto = 0;
    fpsD.forEach((fp, i) => {
      if (!fp || typeof fp !== "object") return;
      const nom = definir(fp, fp.pkg), libId = lib + ":" + nom, bas = !!fp.side;
      if (fp.ref) librairie.set(String(fp.ref), libId);
      if (fp.silk !== false) silkAuto++;
      items.push(arbreFp(fp, libId, { bas, A: deg(bas ? 180 - nb(fp.rot) : -nb(fp.rot)), ref: String(fp.ref || ""), value: String(fp.value || ""),
        nets: fp.nets || {}, chemin: chemins && chemins.get ? chemins.get(fp.ref) : null, cacherRef: fp.silk === false || !!fp.refHide,
        graine: "fp:" + i + ":" + fp.ref }));
    });
    if (silkAuto) rap.ecart("sérigraphie automatique des composants : non exportée (repère seul, corps en F.Fab)");
    /* trous de carte : KiCad n'en a pas hors empreinte, chacun devient un trou de fixation */
    arr(d.holes).forEach((h, i) => {
      const t = { pads: [], holes: [{ x: 0, y: 0, d: nb(h.d, 3.2), w: h.w, rot: 0 }], x: nb(h.x), y: nb(h.y) };
      const nom = definir(t, "TROU_" + String(r4(nb(h.d, 3.2))).replace(".", "_") + (nb(h.w) > nb(h.d) ? "_" + String(r4(nb(h.w))).replace(".", "_") : ""));
      items.push(arbreFp(t, lib + ":" + nom, { bas: false, A: deg(-nb(h.rot)), ref: "TROU" + (i + 1), value: nom, cacherRef: true, graine: "trou:" + i }));
    });

    /* contour : un polygone Edge.Cuts par contour */
    const b = d.board || {};
    const ext = Array.isArray(b.pts) && b.pts.length >= 3 ? b.pts
      : [{ x: nb(b.x), y: nb(b.y) }, { x: nb(b.x) + nb(b.w, 100), y: nb(b.y) }, { x: nb(b.x) + nb(b.w, 100), y: nb(b.y) + nb(b.h, 80) }, { x: nb(b.x), y: nb(b.y) + nb(b.h, 80) }];
    const gpoly = (P, L, w, rempli, g) => ["gr_poly", ["pts", ...P.map(c => ["xy", nb(c.x), nb(c.y)])], trait(w), ["fill", rempli ? "yes" : "no"], ["layer", q(L)], ["uuid", q(uuid(g))]];
    items.push(gpoly(ext, "Edge.Cuts", 0.05, false, "bord"));
    arr(b.cutouts).forEach((P, i) => { if (arr(P).length >= 3) items.push(gpoly(P, "Edge.Cuts", 0.05, false, "decoupe:" + i)); });

    /* sérigraphie de carte */
    let troues = 0;
    arr(d.drawings).forEach((g, i) => {
      if (!g || typeof g !== "object") return;
      const L = g.layer === "silkB" ? "B.SilkS" : "F.SilkS", u = ["uuid", q(uuid("dessin:" + i))];
      if (g.shape === "poly" && arr(g.pts).length >= 3) { if (arr(g.trous).length) troues++; items.push(gpoly(g.pts, L, 0, true, "dessin:" + i)); }
      else if (g.shape === "text")
        items.push(["gr_text", q(g.text || ""), ["at", nb(g.x1), nb(g.y1), deg(-nb(g.rot))], ["layer", q(L)], u, police(nb(g.size, 1.5), nb(g.width, 0.15), L === "B.SilkS")]);
      else if (g.shape === "rect")
        items.push(["gr_rect", ["start", nb(g.x1), nb(g.y1)], ["end", nb(g.x2), nb(g.y2)], trait(nb(g.width, 0.15)), ["fill", "no"], ["layer", q(L)], u]);
      else items.push(["gr_line", ["start", nb(g.x1), nb(g.y1)], ["end", nb(g.x2), nb(g.y2)], trait(nb(g.width, 0.15)), ["layer", q(L)], u]);
    });
    if (troues) rap.ecart("aplat de sérigraphie troué : écrit sans ses trous (KiCad n'en a pas)");

    /* pistes, vias */
    tracksD.forEach((t, i) => {
      if (!t) return;
      const fin = [["width", nb(t.w, 0.25)], ["layer", q(nomCu(Math.max(0, Math.min(cu - 1, Math.round(nb(t.l))))))], netK(t.net), ["uuid", q(uuid("piste:" + i))]];
      const ca = nb(t.ca), dx = nb(t.x2) - nb(t.x1), dy = nb(t.y2) - nb(t.y1), dl = Math.hypot(dx, dy);
      if (Math.abs(ca) > 1e-4 && dl > 1e-9) {
        // centre déduit de la corde et de l'angle balayé (arcOf, 01-core.js)
        const h = ca / 2, k = (dl / 2) / Math.tan(h), cx = (nb(t.x1) + nb(t.x2)) / 2 - (dy / dl) * k, cy = (nb(t.y1) + nb(t.y2)) / 2 + (dx / dl) * k;
        const r = Math.abs(dl / (2 * Math.sin(h))), a = Math.atan2(nb(t.y1) - cy, nb(t.x1) - cx) + h;
        items.push(["arc", ["start", nb(t.x1), nb(t.y1)], ["mid", cx + r * Math.cos(a), cy + r * Math.sin(a)], ["end", nb(t.x2), nb(t.y2)], ...fin]);
      } else items.push(["segment", ["start", nb(t.x1), nb(t.y1)], ["end", nb(t.x2), nb(t.y2)], ...fin]);
    });
    viasD.forEach((v, i) => {
      if (!v) return;
      const a = Math.max(0, Math.min(cu - 1, Math.round(nb(v.a)))), z = Math.max(0, Math.min(cu - 1, Math.round(nb(v.b, cu - 1))));
      items.push(["via"].concat(a > 0 || z < cu - 1 ? ["blind"] : [], [["at", nb(v.x), nb(v.y)], ["size", nb(v.d, 0.6)], ["drill", nb(v.drill, 0.3)],
        ["layers", q(nomCu(Math.min(a, z))), q(nomCu(Math.max(a, z)))], netK(v.net), ["uuid", q(uuid("via:" + i))]]));
    });

    /* zones : contour seul, sans remplissage (KiCad remplit avec B) ; découpes en zones interdites */
    const pts = P => ["polygon", ["pts", ...arr(P).map(c => ["xy", nb(c.x), nb(c.y)])]];
    let cmsDirecte = 0;
    zonesD.forEach((z, i) => {
      if (!z || arr(z.pts).length < 3) return;
      const net = z.net ? String(z.net) : "", clr = clrDe(net);
      if (z.connexion === "cms-directe") cmsDirecte++;
      items.push(["zone", netK(net), ["net_name", q(net)], ["layer", q(nomCu(Math.max(0, Math.min(cu - 1, Math.round(nb(z.l))))))], ["uuid", q(uuid("zone:" + i))],
        ["hatch", "edge", 0.5], ["connect_pads"].concat(z.connexion === "directe" ? ["yes"] : z.connexion === "aucune" ? ["no"] : [], [["clearance", clr]]),
        ["min_thickness", nb(rule.cuMin, 0.2)], ["filled_areas_thickness", "no"],
        ["fill", ["thermal_gap", clr], ["thermal_bridge_width", nb(rule.thermal, 0.5)]], pts(z.pts)]);
    });
    if (cmsDirecte) rap.ecart("zone « directe pour les CMS » : écrite avec bras thermiques partout (KiCad n'a pas ce mode)");
    arr(d.cuts).forEach((c, i) => {
      if (!c || arr(c.pts).length < 3) return;
      items.push(["zone", ["net", 0], ["net_name", q("")], ["layer", q(nomCu(Math.max(0, Math.min(cu - 1, Math.round(nb(c.l))))))], ["uuid", q(uuid("decoupe-cuivre:" + i))],
        ["hatch", "edge", 0.5], ["connect_pads", ["clearance", 0]], ["min_thickness", 0.25], ["filled_areas_thickness", "no"],
        ["keepout", ["tracks", "not_allowed"], ["vias", "allowed"], ["pads", "allowed"], ["copperpour", "not_allowed"], ["footprints", "allowed"]],
        ["fill", ["thermal_gap", 0.5], ["thermal_bridge_width", 0.5]], pts(c.pts)]);
    });

    /* en-tête : couches, empilage, réglages */
    const st = d.stack || {}, sc = arr(st.cu), sd = arr(st.di);
    const nCu = Math.max(2, cu), nomS = i => i === 0 ? "F.Cu" : i === nCu - 1 ? "B.Cu" : "In" + i + ".Cu";
    const couleur = c => { if (c && !COULEURS_K[c]) rap.ecart("couleur « " + String(c).slice(0, 20) + " » sans équivalent KiCad : jaune écrit"); return COULEURS_K[c] || "Yellow"; };
    const masque = COULEURS_K[st.maskColor || "vert"] || couleur(st.maskColor), serigraphie = COULEURS_K[st.silkColor || "blanc"] || "White";
    const empil = ["stackup",
      ["layer", q("F.SilkS"), ["type", q("Top Silk Screen")], ["color", q(serigraphie)]], ["layer", q("F.Paste"), ["type", q("Top Solder Paste")]],
      ["layer", q("F.Mask"), ["type", q("Top Solder Mask")], ["color", q(masque)], ["thickness", nb(st.maskT, 0.01)]]];
    for (let i = 0; i < nCu; i++) {
      empil.push(["layer", q(nomS(i)), ["type", q("copper")], ["thickness", nb((sc[Math.min(i, sc.length - 1)] || {}).t, 0.035)]]);
      if (i < nCu - 1) {
        const di = sd[i] || sd[sd.length - 1] || {};
        empil.push(["layer", q("dielectric " + (i + 1)), ["type", q(di.k === "prepreg" ? "prepreg" : "core")], ["thickness", nb(di.t, 1.51)],
                    ["material", q(di.mat || "FR4")], ["epsilon_r", nb(di.er, 4.5)], ["loss_tangent", nb(di.df, 0.02)]]);
      }
    }
    empil.push(["layer", q("B.Mask"), ["type", q("Bottom Solder Mask")], ["color", q(masque)], ["thickness", nb(st.maskT, 0.01)]],
               ["layer", q("B.Paste"), ["type", q("Bottom Solder Paste")]], ["layer", q("B.SilkS"), ["type", q("Bottom Silk Screen")], ["color", q(serigraphie)]],
               ["copper_finish", q(FINITIONS_K[st.finish] || "None")], ["dielectric_constraints", "no"]);
    const setup = ["setup", empil, ["pad_to_mask_clearance", nb(rule.mask, 0.05)]];
    if (nb(rule.paste)) setup.push(["pad_to_paste_clearance", nb(rule.paste)]);
    setup.push(["allow_soldermask_bridges_in_footprints", "no"]);
    if (rule.viaFinish == null || rule.viaFinish === "tented") setup.push(["tenting", "front", "back"]);
    if (d.origin && (nb(d.origin.x) || nb(d.origin.y))) setup.push(["aux_axis_origin", nb(d.origin.x), nb(d.origin.y)]);
    const couchesK = ["layers", [0, q("F.Cu"), "signal"]];
    for (let i = 1; i < nCu - 1; i++) couchesK.push([2 + 2 * i, q(nomS(i)), "signal"]);
    couchesK.push([2, q("B.Cu"), "signal"], ...COUCHES_UTILISATEUR.map(([k, n, u]) => [k, q(n), "user"].concat(u ? [q(u)] : [])));
    const racine = ["kicad_pcb", ["version", VERSION_PCB], ["generator", q("web_cao")], ["generator_version", q("9.0")],
      ["general", ["thickness", nb(st.target, 1.6)], ["legacy_teardrops", "no"]], ["paper", q("A4")], couchesK, setup,
      ["net", 0, q("")], ...[...code].map(([n, k]) => ["net", k, q(n)]), ...items, ["embedded_fonts", "no"]];

    /* .kicad_pro partiel : règles et classes, aux noms de KiCad 9 */
    const minDe = (l, d0) => l.length ? mini(l) : d0;
    const vivants = classes.filter(c => c && typeof c === "object");
    const rules = {
      min_copper_edge_clearance: nb(rule.edge, 0.4), min_hole_to_hole: nb(rule.hole, 0.25),
      min_clearance: minDe(vivants.map(c => nb(c.clr, 0.2)), 0.2),
      min_track_width: minDe(vivants.map(c => nb(c.w, 0.25)).concat(tracksD.map(t => nb(t && t.w, 0.25))), 0.2),
      min_via_diameter: minDe(vivants.map(c => nb(c.via, 0.6)).concat(viasD.map(v => nb(v && v.d, 0.6))), 0.5),
      min_through_hole_diameter: minDe(vivants.map(c => nb(c.drill, 0.3)).concat(viasD.map(v => nb(v && v.drill, 0.3))), 0.3)
    };
    const kClasses = vivants.map((c, i) => ({ bus_width: 12, clearance: nb(c.clr, 0.2), diff_pair_gap: 0.25, diff_pair_via_gap: 0.25,
      diff_pair_width: 0.2, line_style: 0, microvia_diameter: 0.3, microvia_drill: 0.1, name: i ? String(c.name) : "Default",
      pcb_color: "rgba(0, 0, 0, 0.000)", priority: i ? i - 1 : 2147483647, schematic_color: "rgba(0, 0, 0, 0.000)",
      track_width: nb(c.w, 0.25), via_diameter: nb(c.via, 0.6), via_drill: nb(c.drill, 0.3), wire_width: 6 }));
    const autres = new Set(kClasses.slice(1).map(c => c.name)), assign = {};
    for (const [n, c] of Object.entries(netClass)) if (autres.has(c)) assign[n] = [c];
    const pro = { board: { design_settings: { rules } },
                  net_settings: { classes: kClasses, netclass_assignments: assign,
                                  // un rattachement par motif exact survit à une mise à jour depuis le schéma
                                  netclass_patterns: Object.entries(assign).map(([n, c]) => ({ netclass: c[0], pattern: n })) } };
    return { texte: ecrireS(racine) + "\n", empreintes, pro, librairie };
  }

  return { lire, ecrire };
})();
