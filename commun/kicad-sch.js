"use strict";
/* =============================================================================
   commun/kicad-sch.js
   Schéma KiCad 9/10 (.kicad_sch, hiérarchie comprise) ⇄ document « schemedit-2 ».

   Repère : 2,54 mm = 20 unités du schéma (SCH_U de 05-feuilles.js), Y vers le bas
   des deux côtés ; le corps d'un symbole de bibliothèque KiCad, lui, a Y vers le
   haut. La connectivité de l'éditeur repose sur l'égalité exacte des points : à
   la lecture, l'origine d'un symbole est ramenée sur la grille de 20 (normComp
   l'y accroche) et le reste du décalage part dans une variante du symbole, de
   sorte que chaque broche tombe là où KiCad la met.

   Ce fichier tourne sur l'accueil, sans le code de l'éditeur : les quelques
   tables et calculs de géométrie qu'il lui faut (broches des symboles intégrés,
   pinPos, brochage d'un CI) sont recopiés ici. Les arbres lus viennent de
   l'extérieur : rien n'est exécuté, profondeur et nombre de feuilles bornés.
   Banc : commun/test/banc-kicad-sch.js.
   ============================================================================= */

const KICAD_SCH = (() => {
  const { enfant, enfants, nb, val, xy, q, ecrireS, uuid, Refus, VERSION_SCH } = KICAD;
  const K = 20 / 2.54;                                   // unités du schéma par mm
  const r4 = v => Math.round(v * 1e4) / 1e4 || 0;        // comme snap() : des égalités exactes
  const px = v => r4(nb(v) * K);
  const sg = v => Math.round(v / 20) * 20 || 0;
  const PAGES_MAX = 200, PROF_MAX = 50;
  const NOM_SYM = /[^A-Za-z0-9_.+-]/g;
  const PATTE = /^[A-Za-z0-9]{1,8}$/;                    // BROCHAGE_PATTE de commun/brochage.js
  const NET_AUTO = /^N\$\d+$/i;
  const MASSE = /GND|^VSS|^0V$|EARTH|CHASSIS|MASSE/i;    // nets de masse : symbole gnd, le reste vcc

  /* ---------- géométrie de l'éditeur (pinPos, 04-etat.js) ---------- */
  const CS = { 0: [1, 0], 90: [0, 1], 180: [-1, 0], 270: [0, -1] };
  function monde(c, x, y) {
    if (c.mir) x = -x;
    const s = CS[c.rot];
    return [c.x + x * s[0] - y * s[1], c.y + x * s[1] + y * s[0]];
  }
  function versLocal(rot, mir, x, y) {
    const s = CS[rot], lx = x * s[0] + y * s[1], ly = -x * s[1] + y * s[0];
    return [r4(mir ? -lx : lx), r4(ly)];
  }
  /* KiCad applique au corps (Y en haut) : retournement Y, rotation anti-horaire A,
     puis miroir ; l'éditeur : miroir X puis rotation horaire. D'où : */
  function orientation(A, miroir) {
    A = ((Math.round(nb(A) / 90) * 90) % 360 + 360) % 360;
    if (miroir === "y") return { rot: A, mir: true };
    if (miroir === "x") return { rot: (A + 180) % 360, mir: true };
    return { rot: (360 - A) % 360, mir: false };
  }
  const versKicad = c => c.mir ? { A: c.rot, miroir: "y" } : { A: (360 - c.rot) % 360, miroir: "" };

  /* ---------- symboles intégrés (02-bibliotheque.js) ----------
     broches dans l'ordre de la netlist, puis un tracé KiCad simple en coordonnées
     locales de l'éditeur : l trait, r rectangle, c cercle, a arc (degrés, sens du
     canevas), p polygone, t texte ; « f » : rempli. Sans tracé : boîte et pattes. */
  const PASSIF = "-40,0 40,0", DIODE = "l-40 0 -10 0|pf-10 -15 -10 15 10 0|l10 -15 10 15|l10 0 40 0";
  const TRANSISTOR = "l-40 0 -5 0|l-5 -25 -5 25|l-5 -15 20 -30|l20 -30 20 -40|l-5 15 20 30|l20 30 20 40";
  const MOS = "l-40 0 -15 0|l-15 -25 -15 25|l-5 -25 -5 -10|l-5 -5 -5 5|l-5 10 -5 25|l-5 -20 20 -20|l20 -20 20 -40|l-5 20 20 20|l20 20 20 40|l-5 0 20 0";
  const col = (x, a, b) => { const r = []; for (let y = a; y <= b; y += 20) r.push(x + "," + y); return r.join(" "); };
  const INTEGRES = {
    resistor: [PASSIF, "l-40 0 -20 0|l20 0 40 0|r-20 -10 40 20"],
    potentiometer: [PASSIF + " 0,-40", "l-40 0 -20 0|l20 0 40 0|r-20 -10 40 20|l0 -40 0 -15|pf-4 -22 0 -15 4 -22"],
    capacitor: [PASSIF, "l-40 0 -5 0|l5 0 40 0|l-5 -15 -5 15|l5 -15 5 15"],
    cap_pol: [PASSIF, "l-40 0 -5 0|l5 0 40 0|l-5 -15 -5 15|a25 0 20 129.6 230.4|t-20 -20 14 +"],
    inductor: [PASSIF, "a-30 0 10 180 360|a-10 0 10 180 360|a10 0 10 180 360|a30 0 10 180 360"],
    transformer: ["-40,-20 -40,20 40,-20 40,20", "l-40 -20 -20 -20|l-40 20 -20 20|l40 -20 20 -20|l40 20 20 20|l-5 -25 -5 25|l5 -25 5 25|a-20 -10 5 -90 90|a-20 0 5 -90 90|a-20 10 5 -90 90|a20 -10 5 90 270|a20 0 5 90 270|a20 10 5 90 270"],
    crystal: [PASSIF, "l-40 0 -10 0|l10 0 40 0|l-10 -15 -10 15|l10 -15 10 15|r-5 -15 10 30"],
    fuse: [PASSIF, "l-40 0 -25 0|l25 0 40 0|r-25 -10 50 20|l-25 0 25 0"],
    varistor: [PASSIF, "l-40 0 -20 0|l20 0 40 0|r-20 -10 40 20|l-25 15 15 -15|l15 -15 25 -15"],
    filter: [PASSIF + " 0,40", "r-25 -20 50 40|l-40 0 -25 0|l40 0 25 0|l0 40 0 20"],
    ferrite_bead: [PASSIF, "l-40 0 -18 0|l18 0 40 0|rf-18 -9 36 18"],
    diode: [PASSIF, DIODE, "A K"],
    led: [PASSIF, DIODE + "|l-5 -20 5 -30|l5 -20 15 -30", "A K"],
    zener: [PASSIF, DIODE + "|l10 -15 5 -20|l10 15 15 20", "A K"],
    schottky: [PASSIF, DIODE + "|l10 -15 5 -15|l5 -15 5 -10|l10 15 15 15|l15 15 15 10", "A K"],
    npn: ["-40,0 20,-40 20,40", TRANSISTOR, "B C E"],
    pnp: ["-40,0 20,-40 20,40", TRANSISTOR, "B C E"],
    nmos: ["-40,0 20,-40 20,40", MOS, "G D S"],
    pmos: ["-40,0 20,-40 20,40", MOS, "G S D"],
    tvs_diode: [PASSIF, "l-40 0 -15 0|l15 0 40 0|pf-15 -10 -15 10 -2 0|pf15 -10 15 10 2 0|l0 -12 0 12", "A K"],
    esd_array: ["-40,-20 -40,0 -40,20 40,20 40,0 40,-20"],
    esd_rail4: ["-40,-20 -40,20 40,-20 40,20 0,-60 0,60", null, "IO1 IO2 IO3 IO4 VCC GND"],
    esd_rail2: ["-40,0 40,0 0,-60 0,60", null, "IO1 IO2 VCC GND"],
    mos_np: ["-80,0 -20,40 -20,-40 20,0 80,-40 80,40", null, "G1 S1 D1 G2 S2 D2"],
    opamp: ["-40,-20 -40,20 60,0 0,-40 0,40", "l-40 -20 -20 -20|l-40 20 -20 20|l40 0 60 0|l0 -40 0 -27|l0 40 0 27|p-20 -40 -20 40 40 0 -20 -40|t-10 -20 15 -|t-10 20 14 +", "IN- IN+ OUT V+ V-"],
    ic: [""],
    regulator: ["-60,0 60,0 0,60", "r-40 -25 80 50|l-60 0 -40 0|l40 0 60 0|l0 25 0 60", "IN OUT GND"],
    vcc: ["0,20"], gnd: ["0,-20"], port: ["20,0"], gport: ["20,0"],
    battery: ["0,-40 0,40", "l0 -40 0 -15|l0 15 0 40|l-20 -15 20 -15|l-10 -5 10 -5|l-20 5 20 5|l-10 15 10 15"],
    acsource: ["0,-40 0,40", "l0 -40 0 -20|l0 20 0 40|c0 0 20"],
    switch: [PASSIF, "l-40 0 -20 0|l20 0 40 0|c-20 0 5|c20 0 5|l-15 -5 20 -20"],
    button: [PASSIF, "l-40 0 -20 0|l-20 0 -20 -10|l40 0 20 0|l20 0 20 -10|l-25 -15 25 -15|l0 -15 0 -25|l-10 -25 10 -25"],
    relay: ["-60,-20 -60,20 60,-40 60,0 60,40"],
    motor: ["0,-40 0,40", "l0 -40 0 -20|l0 20 0 40|c0 0 20|t0 1 15 M"],
    buzzer: [PASSIF, "l-40 0 -20 0|l40 0 20 0|c0 0 20"],
    lamp: [PASSIF, "l-40 0 -20 0|l40 0 20 0|c0 0 20|l-15 -15 15 15|l-15 15 15 -15"],
    antenna: ["0,40", "l0 40 0 -10|l0 -10 -20 -30|l0 -10 20 -30"],
    header: [col(-40, -20, 20).replace(" -40,0", "")], header_1x3: [col(-40, -20, 20)], header_1x4: [col(-40, -40, 20)],
    header_1x6: [col(-40, -60, 40)], header_1x8: [col(-40, -80, 60)], header_2x5: [col(-40, -40, 40) + " " + col(40, -40, 40)],
    usb_c_pwr: [col(-40, -40, 40)], usb_c: [col(-40, -60, 80)], usb_micro: [col(-40, -40, 60)],
    testpoint: ["0,20", "l0 20 0 5|cf0 0 5"], testpoint_pth: ["0,20", "l0 20 0 7|cf0 0 7"],
    hole: ["0,20", "c0 0 10|l0 15 0 20"], fiducial: ["", "cf0 0 5|c0 0 20"],
    strap: ["-20,0 20,0", "l-20 0 -10 0|l20 0 10 0|a-10 0 10 90 270|a10 0 10 -90 90"],
    annot_volt: ["0,20"], annot_curr: [""], annot_text: [""], annot_note: [""]
  };
  const SANS_REPERE = new Set(["vcc", "gnd", "port", "gport", "annot_volt", "annot_curr", "annot_text", "annot_note"]);
  const ANNOT = new Set(["annot_volt", "annot_curr", "annot_text", "annot_note"]);
  const points = s => s ? s.trim().split(/\s+/).map(p => p.split(",").map(Number)) : [];
  function trace(s) {
    return s.split("|").map(t => {
      const o = t[0], f = t[1] === "f", r = t.slice(f ? 2 : 1).trim().split(/\s+/), v = r.map(Number);
      if (o === "l") return { op: "line", x1: v[0], y1: v[1], x2: v[2], y2: v[3] };
      if (o === "r") return { op: "rect", x: v[0], y: v[1], w: v[2], h: v[3], fill: f };
      if (o === "c") return { op: "circle", x: v[0], y: v[1], r: v[2], fill: f };
      if (o === "a") return { op: "arc", cx: v[0], cy: v[1], r: v[2], start: v[3] * Math.PI / 180, end: v[4] * Math.PI / 180 };
      if (o === "t") return { op: "text", x: v[0], y: v[1], size: v[2], text: r[3] };
      const pts = [];
      for (let i = 0; i + 1 < v.length; i += 2) pts.push([v[i], v[i + 1]]);
      return { op: "poly", pts, fill: f };
    });
  }

  /* ---------- brochage d'un CI (icGeom / icPins de 04-etat.js, recopiés) ---------- */
  const icStep = v => Math.round(v / 20) * 20, icCeil = v => Math.ceil(v / 20) * 20;
  function largeur(t, size, bold) {
    if (typeof textW === "function") return textW(t, size, bold);           // dans l'éditeur
    if (largeur.ctx === undefined)
      try { largeur.ctx = document.createElement("canvas").getContext("2d"); } catch (_) { largeur.ctx = null; }
    if (!largeur.ctx) return String(t).length * size * 0.6;                 // shortcut: hors navigateur, largeur approchée
    largeur.ctx.font = (bold ? "bold " : "") + (size || 12) + 'px "Segoe UI",system-ui,sans-serif';
    return largeur.ctx.measureText(String(t)).width;
  }
  function icCount(el) {
    if (Number.isFinite(el.npins)) return Math.max(1, Math.min(64, Math.round(el.npins)));
    if (Array.isArray(el.pinPos) && el.pinPos.length) return Math.max(1, Math.min(64, el.pinPos.length));
    return 8;
  }
  function icFree(el) {
    const p = el.pinPos;
    return Array.isArray(p) && p.length === icCount(el) &&
      p.every(v => Array.isArray(v) && Number.isFinite(+v[0]) && Number.isFinite(+v[1])) ? p : null;
  }
  const icShapeOf = el => el.icShape === "libre" ? (icFree(el) ? "libre" : "dip") : el.icShape === "quad" ? "quad" : "dip";
  const icPinLabel = (el, i, side) => {
    const nm = el.pinNames && el.pinNames[i];
    return nm && (side === "L" || side === "R") ? (i + 1) + " " + nm : String(i + 1);
  };
  function icTextHalf(el, n, shape) {
    let left = [], right = [];
    if (shape === "quad") {
      const b = Math.floor(n / 4), r = n % 4, cL = b + (r > 0 ? 1 : 0), cB = b + (r > 1 ? 1 : 0), cR = b + (r > 2 ? 1 : 0);
      for (let i = 0; i < cL; i++) left.push(i);
      for (let i = 0; i < cR; i++) right.push(cL + cB + i);
    } else {
      const half = Math.ceil(n / 2);
      for (let i = 0; i < half; i++) left.push(i);
      for (let i = half; i < n; i++) right.push(i);
    }
    const w = (list, side) => list.reduce((m, i) => el.pinNames && el.pinNames[i] ? Math.max(m, largeur(icPinLabel(el, i, side), 9.5, true)) : m, 0);
    return icCeil((w(left, "L") + w(right, "R") + largeur(String(el.value || "CI"), 13, true) + 28) / 2);
  }
  function icAutoBody(pins) {
    let x1 = 1e9, y1 = 1e9, x2 = -1e9, y2 = -1e9;
    if (pins.length) for (const p of pins) { x1 = Math.min(x1, p[0]); y1 = Math.min(y1, p[1]); x2 = Math.max(x2, p[0]); y2 = Math.max(y2, p[1]); }
    else { x1 = -40; y1 = -40; x2 = 40; y2 = 40; }
    let bx1 = icStep(x1 + 20), bx2 = icStep(x2 - 20), by1 = icStep(y1 + 20), by2 = icStep(y2 - 20);
    if (bx2 - bx1 < 40) { const cx = icStep((x1 + x2) / 2); bx1 = cx - 20; bx2 = cx + 20; }
    if (by2 - by1 < 40) { const cy = icStep((y1 + y2) / 2); by1 = cy - 20; by2 = cy + 20; }
    return { x1: bx1, y1: by1, x2: bx2, y2: by2 };
  }
  function icGeom(el) {
    const n = icCount(el), shape = icShapeOf(el), a = [];
    if (shape === "libre") {
      const free = icFree(el).map(p => [icStep(+p[0]), icStep(+p[1])]), b = el.icBody;
      let body = null;
      if (b && ["x1", "y1", "x2", "y2"].every(k => Number.isFinite(+b[k]))) {
        body = { x1: icStep(Math.min(+b.x1, +b.x2)), y1: icStep(Math.min(+b.y1, +b.y2)), x2: icStep(Math.max(+b.x1, +b.x2)), y2: icStep(Math.max(+b.y1, +b.y2)) };
        if (body.x2 - body.x1 < 40) body.x2 = body.x1 + 40;
        if (body.y2 - body.y1 < 40) body.y2 = body.y1 + 40;
      }
      return { pins: free, body: body || icAutoBody(free) };
    }
    if (shape === "quad") {
      const n4 = Math.max(4, n), b = Math.floor(n4 / 4), r = n4 % 4;
      const cnt = [b + (r > 0 ? 1 : 0), b + (r > 1 ? 1 : 0), b + (r > 2 ? 1 : 0), b], m = Math.max(...cnt, 1);
      const min = Math.max(60, Math.ceil((Math.ceil((m - 1) / 2) * 20 + 40) / 20) * 20, icTextHalf(el, n4, "quad"));
      const hs = Math.max(min, icStep(+el.icHs || 0)), d = hs + 20, off = k => -Math.floor((k - 1) / 2) * 20;
      const [cL, cB, cR, cT] = cnt;
      let s = off(cL); for (let i = 0; i < cL; i++) a.push([-d, s + i * 20]);
      s = off(cB); for (let i = 0; i < cB; i++) a.push([s + i * 20, d]);
      s = off(cR); for (let i = 0; i < cR; i++) a.push([d, s + (cR - 1 - i) * 20]);
      s = off(cT); for (let i = 0; i < cT; i++) a.push([s + (cT - 1 - i) * 20, -d]);
      return { pins: a, body: { x1: -hs, y1: -hs, x2: hs, y2: hs } };
    }
    const half = Math.ceil(n / 2), r = n - half, y0 = -Math.floor((half - 1) / 2) * 20, top = y0 - 20, h = (half - 1) * 20 + 40;
    const hw = Math.max(Math.max(40, icTextHalf(el, n, "dip")), icStep(+el.icW || 0)), x = hw + 20;
    for (let i = 0; i < half; i++) a.push([-x, y0 + i * 20]);
    for (let j = 0; j < r; j++) a.push([x, y0 + (r - 1 - j) * 20]);
    return { pins: a, body: { x1: -hw, y1: top, x2: hw, y2: top + h } };
  }
  /* boîte et pattes : le tracé du CI, et celui des intégrés sans tracé propre */
  function boite(pins, body) {
    const g = [{ op: "rect", x: body.x1, y: body.y1, w: body.x2 - body.x1, h: body.y2 - body.y1, fill: true }];
    for (const [x, y] of pins) {
      const side = x <= body.x1 ? "L" : x >= body.x2 ? "R" : y <= body.y1 ? "T" : y >= body.y2 ? "B" : "";
      const b = side === "L" ? [body.x1, y] : side === "R" ? [body.x2, y] : side === "T" ? [x, body.y1] : side === "B" ? [x, body.y2] : null;
      if (b && (b[0] !== x || b[1] !== y)) g.push({ op: "line", x1: x, y1: y, x2: b[0], y2: b[1] });
    }
    return g;
  }

  /* Broches (locales), noms et tracé d'un composant du document ; null si son type est inconnu. */
  function defComp(c, embarques) {
    const t = INTEGRES[c.type];
    if (t) {
      let pins, g;
      if (c.type === "ic") { const ig = icGeom(c); pins = ig.pins; g = boite(pins, ig.body); }
      else {
        pins = Array.isArray(c.pinPos) && c.pinPos.length && c.pinPos.every(p => Array.isArray(p) && p.every(Number.isFinite)) ? c.pinPos : points(t[0]);
        g = t[1] ? trace(t[1]) : boite(pins, icAutoBody(pins));
      }
      const pn = t[2] ? t[2].split(" ") : [];
      return { pins, g, noms: pins.map((_, i) => (c.pinNames && c.pinNames[i]) || pn[i] || "") };
    }
    const s = embarques && embarques[c.type];
    if (!s || !Array.isArray(s.pins) || !s.pins.length) return null;
    const ordre = s.pins.filter(p => p && Number.isInteger(p.n)).sort((a, b) => a.n - b.n);
    return { pins: ordre.map(p => [+p.x, +p.y]), g: Array.isArray(s.primitives) ? s.primitives : [],
             noms: ordre.map(p => typeof p.name === "string" ? p.name : "") };
  }

  /* ======================================================================
     LECTURE : arbres .kicad_sch → document schemedit-2
     ====================================================================== */
  const prop = (n, k) => { const p = enfants(n, "property").find(e => e[1] === k); return p && p[2] != null ? String(p[2]) : ""; };
  const cache = (n, nom) => n.includes(nom) || val(n, nom) === "yes";          // « hide » nu (KiCad 6-8) ou (hide yes)
  // « VPP{slash}MCLR » et « VPP/MCLR » : le même net pour KiCad (EscapeString des noms de nets)
  const ECHAPS = { slash: "/", backslash: "\\", dblquote: '"', colon: ":", lt: "<", gt: ">", bar: "|", tab: "\t", return: "\n" };
  const sansEchap = s => String(s == null ? "" : s).replace(/\{(slash|backslash|dblquote|colon|lt|gt|bar|tab|return)\}/g, (_, k) => ECHAPS[k]);
  const PROPS = [["mpn", "MPN"], ["manufacturer", "Manufacturer"], ["lcsc", "LCSC"]];
  const CARTOUCHE = [["dessine", "Dessiné"], ["verifie", "Vérifié"], ["schNo", "Schéma n°"], ["pcbNo", "PCB n°"]];

  function surSegment(p, w) {             // p sur le segment, extrémités comprises
    const dx = w.x2 - w.x1, dy = w.y2 - w.y1;
    if ((p[0] - w.x1) * dy - (p[1] - w.y1) * dx !== 0) return false;
    const t = (p[0] - w.x1) * dx + (p[1] - w.y1) * dy;
    return t >= 0 && t <= dx * dx + dy * dy;
  }
  const extremite = (p, w) => (p[0] === w.x1 && p[1] === w.y1) || (p[0] === w.x2 && p[1] === w.y2);
  function couper(fils, p) {               // coupe en p les fils qui le traversent
    for (let i = fils.length - 1; i >= 0; i--) {
      const w = fils[i];
      if (extremite(p, w) || !surSegment(p, w)) continue;
      const b = Object.assign({}, w, { x1: p[0], y1: p[1] });
      w.x2 = p[0]; w.y2 = p[1];
      fils.push(b);
    }
  }
  /* centre et angles (sens du canevas) de l'arc passant par trois points, Y en bas */
  function arc3(a, m, b) {
    const d = 2 * (a[0] * (m[1] - b[1]) + m[0] * (b[1] - a[1]) + b[0] * (a[1] - m[1]));
    if (Math.abs(d) < 1e-9) return null;
    const s = p => p[0] * p[0] + p[1] * p[1];
    const cx = (s(a) * (m[1] - b[1]) + s(m) * (b[1] - a[1]) + s(b) * (a[1] - m[1])) / d;
    const cy = (s(a) * (b[0] - m[0]) + s(m) * (a[0] - b[0]) + s(b) * (m[0] - a[0])) / d;
    const ang = p => Math.atan2(p[1] - cy, p[0] - cx), T = 2 * Math.PI, n = v => ((v % T) + T) % T;
    const as = ang(a), am = ang(m), ae = ang(b);
    const [start, end] = n(am - as) < n(ae - as) ? [as, ae] : [ae, as];
    return { op: "arc", cx: r4(cx), cy: r4(cy), r: r4(Math.hypot(a[0] - cx, a[1] - cy)), start, end };
  }

  function lire(fichiers, racine, rap) {
    const arbre0 = fichiers.get(racine);
    if (!Array.isArray(arbre0) || arbre0[0] !== "kicad_sch") throw new Refus("« " + racine + " » n'est pas un schéma KiCad");
    const dossier = racine.replace(/[^/]*$/, "");
    const uRacine = String(val(arbre0, "uuid", ""));
    const inst6 = new Map(enfants(enfant(arbre0, "symbol_instances"), "path").map(p => [p[1], p]));   // KiCad 6
    const symboles = {}, idsSym = new Map(), nomsPages = new Set();
    const pages = [{ name: "Hiérarchie", isHierarchy: true, comps: [], wires: [], drawings: [], uid: 1, scale: 1, ox: 0, oy: 0 }];
    let nbFeuilles = 0;

    const alias = new Map();
    for (const a of fichiers.values()) for (const b of Array.isArray(a) ? enfants(a, "bus_alias") : [])
      alias.set(String(b[1]), (enfant(b, "members") || []).slice(1).map(String));
    /* membres d'un bus : [clé d'appariement, nom du net] — D[0..7], PFX{A B[0..3]}, {ALIAS} */
    function membres(nom, prof = 0) {
      const v = /^(.*)\[(\d+)\.\.(\d+)\]$/.exec(nom), out = [];
      if (v) {
        for (let i = Math.min(+v[2], +v[3]); i <= Math.max(+v[2], +v[3]) && out.length < 1024; i++) out.push(["#" + i, v[1] + i]);
        return out;
      }
      const g = /^(.*?)\{(.*)\}$/.exec(nom);
      const liste = g && !g[1].endsWith("~") ? g[2].split(/[\s,]+/).filter(Boolean) : alias.get(nom);
      if (!liste || prof > 4) return out;
      const pfx = g && g[1] ? g[1] + "." : "";
      for (const m of liste) {
        if (alias.has(m)) { for (const [k, n] of membres(m, prof + 1)) out.push([k, pfx + n]); continue; }
        const sous = /\[\d+\.\.\d+\]$/.test(m) ? membres(m, prof + 1) : null;
        if (sous) for (const [k, n] of sous) out.push([m + k, pfx + n]);
        else out.push([m, pfx + m]);
      }
      return out.slice(0, 1024);
    }

    function chemin(base, nom) {           // relatif au dossier du schéma racine, sans quitter l'archive
      const segs = [];
      for (const s of (base + String(nom).replace(/\\/g, "/")).split("/")) {
        if (s === "..") segs.pop(); else if (s && s !== ".") segs.push(s);
      }
      return segs.join("/");
    }

    /* un symbole de bibliothèque (unité u, style b, décalé de d) → schsym-1 du document */
    function symboleDe(lib, libs, u, b, d) {
      const libId = lib[1], cle = libId + "|" + u + "|" + b + "|" + d;
      if (idsSym.has(cle)) return idsSym.get(cle);
      let subs = enfants(lib, "symbol");
      const ext = val(lib, "extends");
      if (ext && libs.has(ext)) subs = subs.concat(enfants(libs.get(ext), "symbol"));
      const parts = subs.map(s => { const m = /_(\d+)_(\d+)$/.exec(String(s[1])); return m ? { u: +m[1], s: +m[2], n: s } : null; }).filter(Boolean);
      const nbU = Math.max(1, ...parts.map(p => p.u));
      const miens = parts.filter(p => (p.u === 0 || p.u === u) && (p.s === 0 || p.s === b));
      const L = (x, y) => [r4(px(x) + d[0]), r4(-px(y) + d[1])];
      const nomsCaches = cache(enfant(lib, "pin_names") || [], "hide");
      const decal = nb(val(enfant(lib, "pin_names") || [], "offset", 0.508), 0.508);
      const pins = [], prims = [];
      for (const { n } of miens) for (const e of n) {
        if (!Array.isArray(e)) continue;
        if (e[0] === "pin") {
          const [x, y, a] = xy(e), lg = nb(val(e, "length", 0)), num = String(val(e, "number", "") || "");
          const nom = String(val(e, "name", "") || ""), cachee = cache(e, "hide");
          const p = L(x, y), rad = a * Math.PI / 180, bout = L(x + lg * Math.cos(rad), y + lg * Math.sin(rad));
          pins.push({ x: p[0], y: p[1], num, nom: nom === "~" ? "" : nom, type: e[1], cachee });
          if (cachee) continue;
          if (lg) prims.push({ op: "line", x1: p[0], y1: p[1], x2: bout[0], y2: bout[1] });
          if (!nomsCaches && nom && nom !== "~" && lg) {
            const dx = Math.sign(r4(bout[0] - p[0])), dy = Math.sign(r4(bout[1] - p[1])), o = px(decal);
            prims.push({ op: "text", x: r4(bout[0] + dx * o), y: r4(bout[1] + dy * (o + 6)), text: nom.replace(/~\{([^}]*)\}/g, "$1"), size: 8,
                         align: dx > 0 ? "left" : dx < 0 ? "right" : undefined });
          }
        } else if (e[0] === "rectangle") {
          const a = L(...xy(e, "start")), z = L(...xy(e, "end"));
          prims.push({ op: "rect", x: Math.min(a[0], z[0]), y: Math.min(a[1], z[1]), w: Math.abs(z[0] - a[0]), h: Math.abs(z[1] - a[1]), fill: plein(e) });
        } else if (e[0] === "circle") {
          const c = L(...xy(e, "center"));
          prims.push({ op: "circle", x: c[0], y: c[1], r: px(val(e, "radius", 0)), fill: plein(e) });
        } else if (e[0] === "arc") {
          const a = arc3(L(...xy(e, "start")), L(...xy(e, "mid")), L(...xy(e, "end")));
          if (a) prims.push(a);
        } else if (e[0] === "polyline" || e[0] === "bezier") {
          const pts = enfants(enfant(e, "pts"), "xy").slice(0, 500).map(p => L(p[1], p[2]));
          if (pts.length === 2) prims.push({ op: "line", x1: pts[0][0], y1: pts[0][1], x2: pts[1][0], y2: pts[1][1] });
          else if (pts.length > 2) prims.push({ op: "poly", pts, fill: plein(e) });
        } else if (e[0] === "text" && e[1]) {
          const [x, y] = xy(e), p = L(x, y), f = enfant(enfant(enfant(e, "effects"), "font"), "size");
          prims.push({ op: "text", x: p[0], y: p[1], text: String(e[1]).slice(0, 80), size: f ? Math.min(40, px(f[1])) : 10 });
        }
      }
      // ordre de la netlist : numéros 1..N tels quels, sinon table broche → patte
      pins.sort((p, q2) => p.num.localeCompare(q2.num, "en", { numeric: true }));
      const suivis = pins.every((p, i) => p.num === String(i + 1));
      let base = String(libId).replace(/^.*:/, "").replace(NOM_SYM, "_").slice(0, 40) || "kicad";
      if (INTEGRES[base]) base += "_kicad";
      if (nbU > 1) base += "_" + lettre(u);
      if (b > 1) base += "_s" + b;
      if (d[0] || d[1]) base += "_d" + d[0] + "_" + d[1];
      let id = base.slice(0, 60);
      for (let k = 2; symboles[id]; k++) id = (base.slice(0, 54) + "_" + k);
      const fini = v => Math.abs(v) <= 4000;
      const res = { id, nbU, pins, pinMap: suivis ? null : pins.map(p => p.num), ok: false };
      idsSym.set(cle, res);
      if (!pins.length || enfant(lib, "power") || prop(lib, "Reference").startsWith("#")) return res;
      if (pins.length > 1024 || !pins.every(p => fini(p.x) && fini(p.y))) { rap.ecart("symbole trop grand pour l'éditeur, écarté : " + libId); return res; }
      const pr = prims.filter(p => [p.x, p.y, p.x1, p.y1, p.x2, p.y2, p.cx, p.cy, p.r, p.w, p.h].every(v => v === undefined || (Number.isFinite(v) && fini(v))) &&
                                   (!p.pts || p.pts.every(q2 => fini(q2[0]) && fini(q2[1]))));
      if (pr.length > 5000) rap.ecart("dessin de symbole tronqué à 5000 éléments : " + libId);
      const xs = pins.map(p => p.x), ys = pins.map(p => p.y);
      for (const p of pr) for (const [x, y] of p.pts || [[p.x1, p.y1], [p.x2, p.y2], [p.x, p.y], [p.cx, p.cy]])
        if (x !== undefined) { xs.push(x + (p.w || 0) + (p.r || 0), x - (p.r || 0)); ys.push(y + (p.h || 0) + (p.r || 0), y - (p.r || 0)); }
      const prefixe = prop(lib, "Reference").replace(/[^A-Za-z]/g, "");
      symboles[id] = {
        format: "schsym-1", id, name: String(libId).slice(0, 80), category: "KiCad",
        ...(/^[A-Za-z]{1,4}$/.test(prefixe) ? { prefix: prefixe } : {}),
        defaultValue: prop(lib, "Value").slice(0, 80), defaultPkg: prop(lib, "Footprint").slice(0, 200),
        pins: pins.map((p, i) => ({ n: i + 1, x: p.x, y: p.y, ...(p.nom ? { name: p.nom.slice(0, 32) } : {}) })),
        ext: [Math.max(-4000, Math.min(...xs)), Math.max(-4000, Math.min(...ys)), Math.min(4000, Math.max(...xs)), Math.min(4000, Math.max(...ys))].map(r4),
        primitives: pr.slice(0, 5000)
      };
      res.ok = true;
      if (res.pinMap && !res.pinMap.every(n => PATTE.test(n)))
        rap.ecart("numéros de broches que le brochage de l'éditeur ne garde pas (hors [A-Za-z0-9]{1,8}) : " + libId);
      return res;
    }
    const plein = e => { const t = val(enfant(e, "fill") || [], "type", "none"); return t !== "none"; };
    const lettre = u => u <= 26 ? String.fromCharCode(64 + u) : String(u);

    function feuille(arbre, chem, nomChem, nom) {
      const libs = new Map(enfants(enfant(arbre, "lib_symbols"), "symbol").map(s => [s[1], s]));
      const comps = [], fils = [], dessins = [], broches = new Map();      // point → broche exacte
      const cle = p => Math.round(p[0] * 100) + "," + Math.round(p[1] * 100);
      const soude = p => broches.get(cle(p)) || p;
      let id = 0;
      for (const t of ["wire", "bus"]) for (const w of enfants(arbre, t)) {
        const pts = enfants(enfant(w, "pts"), "xy");
        for (let i = 1; i < pts.length; i++) {
          const f = { x1: px(pts[i - 1][1]), y1: px(pts[i - 1][2]), x2: px(pts[i][1]), y2: px(pts[i][2]) };
          if (f.x1 === f.x2 && f.y1 === f.y2) continue;
          if (t === "bus") f.bus = true;
          fils.push(f);
        }
      }
      const entrees = enfants(arbre, "bus_entry").map(e => {   // tronçon de bus : deux entrées au même point ne se relient pas
        const [x, y] = xy(e), s = xy(e, "size");
        return { x1: px(x), y1: px(y), x2: px(x + s[0]), y2: px(y + s[1]), bus: true };
      });
      const alims = [];                                 // [type, point, rot, mir, nom]
      /* ---- symboles ---- */
      for (const s of enfants(arbre, "symbol")) {
        const libId = val(s, "lib_id"), lib = libs.get(val(s, "lib_name", libId));      // lib_name : copie locale modifiée
        if (!lib) { rap.ecart("symbole absent de lib_symbols, écarté : " + libId); continue; }
        let inst = null;
        for (const pr of enfants(enfant(s, "instances"), "project"))
          for (const p of enfants(pr, "path")) if (p[1] === chem) inst = p;
        inst = inst || inst6.get(chem.slice(uRacine.length + 1) + "/" + val(s, "uuid"));
        const u = Math.max(1, Math.round(nb(val(inst || s, "unit", val(s, "unit", 1)), 1)));
        const b = Math.max(1, Math.round(nb(val(s, "body_style", val(s, "convert", 1)), 1)));
        const [X, Y, A] = xy(s), o = orientation(A, val(s, "mirror"));
        if (nb(A) % 90) rap.ecart("symbole tourné hors des quarts de tour, arrondi : " + libId);
        const W = [px(X), px(Y)], O = { x: sg(W[0]), y: sg(W[1]), rot: o.rot, mir: o.mir };
        const sym = symboleDe(lib, libs, u, b, versLocal(o.rot, o.mir, r4(W[0] - O.x), r4(W[1] - O.y)));
        const ref = String(inst ? val(inst, "reference", prop(s, "Reference")) : prop(s, "Reference"));
        const valeur = prop(s, "Value");
        const pinsMonde = sym.pins.map(p => monde(O, p.x, p.y));
        // symbole d'alimentation, ou virtuel (#PWR, #FLG d'avant le drapeau « power ») : un nom de net, pas un composant
        if (enfant(lib, "power") || ref.startsWith("#")) {
          const k = sym.pins.findIndex(p => p.type === "power_in");
          if (k < 0) { rap.ecart("drapeaux PWR_FLAG et symboles d'alimentation sans broche d'entrée : ignorés"); continue; }
          const local = (enfant(lib, "power") || []).includes("local"), nom = enfant(lib, "power") ? valeur || sym.pins[k].nom : sym.pins[k].nom;
          alims.push([local ? "port" : MASSE.test(nom) ? "gnd" : "vcc", pinsMonde[k], O.rot, O.mir, nom, true]);
          continue;
        }
        if (!sym.ok) { if (!sym.pins.length) rap.ecart("symbole sans broche (logo, trou…) : écarté"); continue; }
        const c = { id: ++id, type: sym.id, x: O.x, y: O.y, rot: O.rot, mir: O.mir, ref: ref.slice(0, 32), value: valeur.slice(0, 240) };
        const fp = prop(s, "Footprint");
        // sans le surnom de bibliothèque, comme la carte (KICAD_PCB) : le boîtier relie les deux éditeurs
        if (fp) c.pkg = fp.replace(/^.*:/, "").slice(0, 120);
        if (sym.nbU > 1) c.part = lettre(u);
        if (sym.pinMap) c.pinMap = sym.pinMap.slice();
        for (const [k, nomK] of PROPS) { const v = prop(s, nomK); if (v) c[k] = v.slice(0, 100); }
        const ds = prop(s, "Datasheet");
        if (/^https?:\/\//i.test(ds)) c.datasheet_url = ds.slice(0, 500);
        const desc = prop(s, "Description");
        if (desc) c.desc = desc.slice(0, 500);
        if (val(s, "dnp") === "yes") rap.ecart("marque « ne pas monter » (DNP) non reprise");
        comps.push(c);
        sym.pins.forEach((p, i) => {
          broches.set(cle(pinsMonde[i]), pinsMonde[i]);
          // broche d'alimentation invisible : KiCad la relie au net global de son nom
          if (p.cachee && p.type === "power_in" && p.nom) alims.push([MASSE.test(p.nom) ? "gnd" : "vcc", pinsMonde[i], 0, false, p.nom, false]);
        });
      }
      for (const a of alims) if (a[5]) broches.set(cle(a[1]), a[1]);
      // les broches calculées font foi : les fils lus s'y soudent au centième d'unité près
      for (const f of fils) { [f.x1, f.y1] = soude([f.x1, f.y1]); [f.x2, f.y2] = soude([f.x2, f.y2]); }
      /* ---- jonctions : un fil traversé devient deux tronçons ---- */
      for (const j of enfants(arbre, "junction")) couper(fils, soude([px(xy(j)[0]), px(xy(j)[1])]));
      const normaux = () => fils.filter(f => !f.bus);
      const nf = normaux();
      for (const c of comps) {
        for (const p of symboles[c.type].pins) {
          const m = monde(c, p.x, p.y);
          if (nf.some(f => !extremite(m, f) && surSegment(m, f)))
            rap.ecart("broche posée au milieu d'un fil sans jonction : KiCad ne la relie pas, l'éditeur si");
        }
      }
      /* ---- étiquettes, alimentations, broches de feuilles : intégrés posés sur la grille ---- */
      const occupe = p => broches.has(cle(p)) || fils.some(f => surSegment(p, f));
      const pointsFils = () => fils.flatMap(f => [[f.x1, f.y1], [f.x2, f.y2]]);
      /* broche de l'intégré sur la grille de 20 : en P s'il y tombe, sinon sur un fil qui passe par P,
         sinon sur un point libre voisin relié à P par un petit fil qui ne touche rien d'autre */
      function poser(type, P, rot, mir, valeur) {
        const pin = points(INTEGRES[type][0])[0], v = monde({ x: 0, y: 0, rot, mir }, pin[0], pin[1]);
        const parP = fils.filter(f => !f.bus && surSegment(P, f)), cands = [];
        for (let i = -2; i <= 3; i++) for (let j = -2; j <= 3; j++) cands.push([Math.floor(P[0] / 20 + i - 1) * 20 + 20 || 0, Math.floor(P[1] / 20 + j - 1) * 20 + 20 || 0]);
        cands.sort((a, z) => Math.hypot(a[0] - P[0], a[1] - P[1]) - Math.hypot(z[0] - P[0], z[1] - P[1]));
        const pts = pointsFils().concat([...broches.values()]);
        let stub = true;
        let Q = cands.find(c => {
          if (c[0] === P[0] && c[1] === P[1]) return !(stub = false);
          if (parP.some(f => surSegment(c, f)) && !broches.has(cle(c)) && !fils.some(f => !parP.includes(f) && surSegment(c, f))) return !(stub = false);
          return !occupe(c) && !pts.some(t => { const s = { x1: P[0], y1: P[1], x2: c[0], y2: c[1] }; return !extremite(t, s) && surSegment(t, s); });
        });
        if (!Q) { Q = cands[0]; rap.ecart("étiquette ou alimentation hors grille sans point libre autour : rattachée au plus près, à vérifier"); }
        comps.push({ id: ++id, type, x: r4(Q[0] - v[0]), y: r4(Q[1] - v[1]), rot, mir, ref: "", value: String(valeur).slice(0, 240) });
        if (stub && (Q[0] !== P[0] || Q[1] !== P[1])) fils.push({ x1: Q[0], y1: Q[1], x2: P[0], y2: P[1] });
        broches.set(cle(Q), Q);
        return Q;
      }
      for (const a of alims) poser(a[0], a[1], a[2], a[3], a[4]);
      const rotEtiq = A => ((540 - Math.round(nb(A) / 90) * 90) % 360 + 360) % 360;
      const surBus = [];                                 // [point, nom, rang du pilote, pont entre feuilles]
      const busEn = P => !normaux().some(f => surSegment(P, f)) && !broches.has(cle(P)) && fils.some(f => f.bus && surSegment(P, f));
      for (const t of ["label", "global_label", "hierarchical_label"]) for (const e of enfants(arbre, t)) {
        const nomE = sansEchap(e[1]), [x, y, A] = xy(e), P = soude([px(x), px(y)]);
        if (!nomE) continue;
        if (busEn(P)) {
          if (nomE.length > 32) rap.ecart("nom de bus de plus de 32 caractères tronqué à l'affichage");
          for (const f of fils) if (f.bus && surSegment(P, f)) f.net = nomE.slice(0, 32);
          // priorité des pilotes de KiCad : globale > locale > hiérarchique > broche de feuille
          surBus.push([P, nomE, t === "global_label" ? 3 : t === "label" ? 2 : 1, t === "global_label" ? "@" + nomE : t === "hierarchical_label" ? nomChem + nomE : null]);
        } else if (t === "hierarchical_label") {
          const r = rotEtiq(A), Q = poser("gport", P, r, false, nomChem + nomE);
          // KiCad nomme pareil (« /feuille/NOM ») l'étiquette hiérarchique et l'étiquette locale de même nom : un seul net
          if (enfants(arbre, "label").some(l => sansEchap(l[1]) === nomE)) {
            const v = monde({ x: 0, y: 0, rot: (r + 180) % 360, mir: false }, 20, 0);
            comps.push({ id: ++id, type: "port", x: r4(Q[0] - v[0]), y: r4(Q[1] - v[1]), rot: (r + 180) % 360, mir: false, ref: "", value: nomE.slice(0, 240) });
          }
        } else poser(t === "label" ? "port" : "gport", P, rotEtiq(A), false, nomE);
      }
      /* ---- feuilles filles : cadre, et une étiquette globale par broche ---- */
      const filles = [];
      for (const sh of enfants(arbre, "sheet")) {
        const [x, y] = xy(sh), [w, h] = xy(sh, "size"), sn = prop(sh, "Sheetname") || prop(sh, "Sheet name") || "feuille";
        dessins.push({ id: ++id, shape: "rect", x1: px(x), y1: px(y), x2: px(x + w), y2: px(y + h), style: "solid", width: 2, color: "#6b7280", label: sn.slice(0, 120) });
        for (const p of enfants(sh, "pin")) {
          const [a, b, A] = xy(p), P = soude([px(a), px(b)]), nomG = nomChem + sn + "/" + sansEchap(p[1]);
          if (busEn(P)) surBus.push([P, sansEchap(p[1]), 0, nomG]);
          else poser("gport", P, ((360 - Math.round(nb(A) / 90) * 90) % 360 + 360) % 360, false, nomG);
        }
        filles.push([sh, sn]);
      }
      /* ---- bus : chaque membre passe d'une feuille à l'autre par une paire d'étiquettes, locale
         (le nom du membre sur la feuille) et globale (le pont), posée à droite de la feuille ;
         KiCad apparie les membres d'un vecteur par leur indice, ceux d'un groupe par leur nom ---- */
      const bus = fils.filter(f => f.bus), gr = bus.map((_, i) => i);
      const rac = i => { while (gr[i] !== i) i = gr[i] = gr[gr[i]]; return i; };
      const bouts = f => [[f.x1, f.y1], [f.x2, f.y2]];
      bus.forEach((f, i) => { for (let j = i + 1; j < bus.length; j++) if (bouts(f).some(p => surSegment(p, bus[j])) || bouts(bus[j]).some(p => surSegment(p, f))) gr[rac(i)] = rac(j); });
      const groupes = new Map();
      for (const [P, nomE, rang, pont] of surBus) {
        const r = rac(bus.findIndex(f => surSegment(P, f)));
        if (!groupes.has(r)) groupes.set(r, { pilote: "", rang: -1, ponts: new Set() });
        const g = groupes.get(r);
        if (rang > g.rang) { g.rang = rang; g.pilote = nomE; }
        if (pont) g.ponts.add(pont);
      }
      const xs = fils.flatMap(f => [f.x1, f.x2]).concat(comps.map(c => c.x)), ys = fils.flatMap(f => [f.y1, f.y2]).concat(comps.map(c => c.y));
      const xP = sg(Math.max(0, ...xs)) + 400;
      let yP = sg(Math.min(0, ...ys));
      for (const g of groupes.values()) {
        const ms = membres(g.pilote);
        if (g.ponts.size && !ms.length) rap.ecart("bus sans membres connus (alias absent ?), non relié : " + g.pilote.slice(0, 40));
        for (const pont of g.ponts) for (const [k, net] of ms) {
          comps.push({ id: ++id, type: "port", x: xP - 20, y: yP, rot: 0, mir: false, ref: "", value: net.slice(0, 240) },
                     { id: ++id, type: "gport", x: xP + 20, y: yP, rot: 180, mir: false, ref: "", value: (pont + "#" + k).slice(0, 240) });
          yP += 40;
        }
        if (g.ponts.size && ms.length) rap.ecart("membres de bus reliés d'une feuille à l'autre par des paires d'étiquettes posées à droite de la feuille");
      }
      fils.push(...entrees);
      /* ---- textes et dessins ---- */
      for (const e of enfants(arbre, "text").concat(enfants(arbre, "text_box"))) {
        const [x, y] = xy(e), [w, h] = e[0] === "text_box" ? xy(e, "size") : [0, 0];
        comps.push({ id: ++id, type: e[0] === "text" ? "annot_text" : "annot_note", x: sg(px(x + w / 2)), y: sg(px(y + h / 2)), rot: 0, mir: false, ref: "",
                     value: String(e[1] || "").replace(/\r?\n/g, "|").slice(0, 240) });
      }
      const style = e => { const t = val(enfant(e, "stroke") || [], "type", ""); return /dash/.test(t) ? "dashed" : t === "dot" ? "dotted" : "solid"; };
      for (const e of enfants(arbre, "polyline")) {
        const pts = enfants(enfant(e, "pts"), "xy").slice(0, 500);
        for (let i = 1; i < pts.length; i++)
          dessins.push({ id: ++id, shape: "line", x1: px(pts[i - 1][1]), y1: px(pts[i - 1][2]), x2: px(pts[i][1]), y2: px(pts[i][2]), style: style(e), width: 2, color: "#6b7280", label: "" });
      }
      for (const e of enfants(arbre, "rectangle")) {
        const [a, b] = xy(e, "start"), [c, d] = xy(e, "end");
        dessins.push({ id: ++id, shape: "rect", x1: px(a), y1: px(b), x2: px(c), y2: px(d), style: style(e), width: 2, color: "#6b7280", label: "" });
      }
      if (enfants(arbre, "no_connect").length) rap.ecart("drapeaux de non-connexion (no_connect) non repris");
      const CONNUS = new Set(["version", "generator", "generator_version", "uuid", "paper", "title_block", "lib_symbols", "junction", "no_connect",
        "wire", "bus", "bus_entry", "label", "global_label", "hierarchical_label", "symbol", "sheet", "sheet_instances", "symbol_instances",
        "embedded_fonts", "embedded_files", "text", "text_box", "polyline", "rectangle"]);
      for (const e of arbre) if (Array.isArray(e) && !CONNUS.has(e[0])) rap.ecart("élément KiCad non repris : " + String(e[0]).slice(0, 30));
      // racine qui ne fait que porter des feuilles : pas de page
      if (comps.some(c => !ANNOT.has(c.type)) || fils.length) {
        let n = String(nom).slice(0, 56) || "Feuille";
        for (let k = 2; nomsPages.has(n); k++) n = String(nom).slice(0, 50) + " (" + k + ")";
        nomsPages.add(n);
        const papier = String(val(arbre, "paper", ""));
        pages.push({ name: n, isHierarchy: false, comps, wires: fils, drawings: dessins, uid: id + 1, scale: 1, ox: 0, oy: 0,
                     ...(papier === "A4" || papier === "A3" ? { format: papier, pageX: 0, pageY: 0 } : {}) });
      }
      return filles;
    }

    function visite(arbre, chem, nomChem, nom, prof) {
      if (++nbFeuilles > PAGES_MAX) { rap.ecart("plus de " + PAGES_MAX + " feuilles : la suite n'est pas reprise"); return; }
      for (const [sh, sn] of feuille(arbre, chem, nomChem, nom)) {
        const f = prop(sh, "Sheetfile") || prop(sh, "Sheet file"), a = fichiers.get(chemin(dossier, f));
        if (!Array.isArray(a) || a[0] !== "kicad_sch") { rap.ecart("feuille absente de l'archive : " + String(f).slice(0, 80)); continue; }
        if (prof >= PROF_MAX) { rap.ecart("hiérarchie de plus de " + PROF_MAX + " niveaux (feuille qui s'inclut elle-même ?) : coupée"); continue; }
        visite(a, chem + "/" + val(sh, "uuid", ""), nomChem + sn + "/", sn, prof + 1);
      }
    }
    visite(arbre0, "/" + uRacine, "/", racine.replace(/^.*\//, "").replace(/\.kicad_sch$/i, ""), 0);

    const tb = enfant(arbre0, "title_block") || [], cartouche = {};
    if (val(tb, "title")) cartouche.titre = String(val(tb, "title")).slice(0, 120);
    if (val(tb, "date")) cartouche.dateDessin = String(val(tb, "date")).slice(0, 120);
    for (const cm of enfants(tb, "comment")) for (const [k, l] of CARTOUCHE)
      if (String(cm[2] || "").startsWith(l + " : ")) cartouche[k] = String(cm[2]).slice(l.length + 3, l.length + 123);
    const doc = { format: "schemedit-2", pages, page: pages.length > 1 ? 1 : 0, netClasses: {}, variantes: { liste: [], active: "" },
                  symboles, cartouche, contraintes: { nets: {}, groupes: [] }, netlist: null };
    return { doc, symboles: Object.values(symboles) };
  }

  /* ======================================================================
     ÉCRITURE : document schemedit-2 → projet KiCad (racine + une feuille par page)
     ====================================================================== */
  const mm = v => v / K;
  const police = (cachee, justif) => ["effects", ["font", ["size", 1.27, 1.27]], ...(justif ? [["justify", ...justif]] : []), ...(cachee ? [["hide", "yes"]] : [])];
  const trait = (t = "default") => ["stroke", ["width", 0], ["type", t]];
  const remplir = f => ["fill", ["type", f ? "background" : "none"]];
  const PAPIERS = [["A4", 297, 210], ["A3", 420, 297], ["A2", 594, 420], ["A1", 841, 594], ["A0", 1189, 841]];
  const nomFichier = s => String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9_.-]+/g, "_").replace(/^[_.]+|_+$/g, "").slice(0, 60);

  /* tracé du document (Y en bas) → graphismes d'un symbole KiCad (Y en haut) */
  function graphisme(g) {
    const P = (x, y) => ["xy", mm(x), -mm(y)];
    if (g.op === "line") return ["polyline", ["pts", P(g.x1, g.y1), P(g.x2, g.y2)], trait(), remplir(false)];
    if (g.op === "rect") return ["rectangle", ["start", mm(g.x), -mm(g.y)], ["end", mm(g.x + g.w), -mm(g.y + g.h)], trait(), remplir(g.fill)];
    if (g.op === "circle") return ["circle", ["center", mm(g.x), -mm(g.y)], ["radius", mm(Math.abs(g.r))], trait(), remplir(g.fill)];
    if (g.op === "poly" && Array.isArray(g.pts) && g.pts.length >= 2)
      return ["polyline", ["pts", ...g.pts.concat(g.fill ? [g.pts[0]] : []).map(p => P(p[0], p[1]))], trait(), remplir(g.fill)];
    if (g.op === "text") return ["text", q(g.text != null ? g.text : g.txt || ""), ["at", mm(g.x), -mm(g.y), 0], ["effects", ["font", ["size", mm(g.size || 10), mm(g.size || 10)]]]];
    if (g.op === "arc") {
      let a = g.start, b = g.end;
      while (b <= a) b += 2 * Math.PI;
      if (b - a >= 2 * Math.PI - 1e-9) return graphisme({ op: "circle", x: g.cx, y: g.cy, r: g.r });
      const pt = t => [g.cx + Math.abs(g.r) * Math.cos(t), g.cy + Math.abs(g.r) * Math.sin(t)];
      const [s, m, e] = [pt(a), pt((a + b) / 2), pt(b)];
      return ["arc", ["start", mm(s[0]), -mm(s[1])], ["mid", mm(m[0]), -mm(m[1])], ["end", mm(e[0]), -mm(e[1])], trait(), remplir(false)];
    }
    return null;
  }
  /* une unité : broches (le trait de patte qui part d'une broche devient sa longueur) et tracé */
  function unite(def, numeros, typeBroche) {
    const g = def.g.slice(), pins = [];
    def.pins.forEach(([x, y], i) => {
      let lg = 0, A = 0;
      const k = g.findIndex(t => t && t.op === "line" && (t.x1 === t.x2 || t.y1 === t.y2) &&
                                 ((t.x1 === x && t.y1 === y) || (t.x2 === x && t.y2 === y)));
      if (k >= 0) {
        const t = g[k], [bx, by] = t.x1 === x && t.y1 === y ? [t.x2, t.y2] : [t.x1, t.y1];
        lg = Math.hypot(bx - x, by - y);
        A = bx > x ? 0 : bx < x ? 180 : by < y ? 90 : 270;
        g[k] = null;
      }
      for (const n of numeros[i])
        pins.push(["pin", typeBroche, "line", ["at", mm(x), -mm(y), A], ["length", mm(lg)],
                   ["name", q(def.noms[i] || "~"), police()], ["number", q(n), police()]]);
    });
    return g.filter(Boolean).map(graphisme).filter(Boolean).concat(pins);
  }
  function symboleKicad(nom, unites, opts) {
    const montrerNoms = unites.some(u => u.some(e => e[0] === "pin" && enfant(e, "name")[1].q !== "~"));
    return ["symbol", q(nom), ...(opts.power ? [["power"]] : []),
      ...(opts.power || unites.reduce((n, u) => n + u.filter(e => e[0] === "pin").length, 0) <= 2 ? [["pin_numbers", ["hide", "yes"]]] : []),
      ["pin_names", ["offset", opts.power ? 0 : 1.016], ...(montrerNoms && !opts.power ? [] : [["hide", "yes"]])],
      ["exclude_from_sim", "no"], ["in_bom", opts.power ? "no" : "yes"], ["on_board", opts.power ? "no" : "yes"],
      ["property", q("Reference"), q(opts.ref), ["at", 0, 2.54, 0], police(opts.power)],
      ["property", q("Value"), q(opts.valeur), ["at", 0, -2.54, 0], police()],
      ["property", q("Footprint"), q(""), ["at", 0, 0, 0], police(true)],
      ["property", q("Datasheet"), q(""), ["at", 0, 0, 0], police(true)],
      ["property", q("Description"), q(""), ["at", 0, 0, 0], police(true)],
      ...unites.map((u, k) => ["symbol", q(nom + "_" + (k + 1) + "_1"), ...u]),
      ["embedded_fonts", "no"]];
  }
  const ALIM = {
    vcc: "l0 20 0 -10|l-20 -10 20 -10",
    gnd: "l0 -20 0 0|l-20 0 20 0|l-10 5 10 5|l-5 10 5 10"
  };

  function ecrire(doc, nomProjet, nomLib, rap, librairie) {
    const embarques = doc && doc.symboles && typeof doc.symboles === "object" ? doc.symboles : {};
    const pages = (doc && Array.isArray(doc.pages) ? doc.pages : []).filter(p => p && typeof p === "object" && !p.isHierarchy).slice(0, PAGES_MAX);
    if (!pages.length) throw new Refus("le schéma n'a aucune feuille à exporter");
    const uRacine = uuid("racine:" + nomProjet);
    const libs = new Map(), nomsLib = new Set(), chemins = new Map();
    const feuillesU = new Set(), nomsFichiers = new Set([(nomProjet + ".kicad_sch").toLowerCase()]), nomsFeuilles = new Set();

    /* symbole de bibliothèque : un par contenu distinct, nommé d'après son type */
    function symLib(base, unites, opts) {
      const cle = JSON.stringify([unites, opts]);
      for (const [n, l] of libs) if (l.cle === cle) return n;
      base = String(base).replace(NOM_SYM, "_").slice(0, 50) || "sym";
      let n = base;
      for (let k = 2; nomsLib.has(n); k++) n = base + "_" + k;
      nomsLib.add(n);
      libs.set(n, { cle, arbre: symboleKicad(n, unites, opts) });
      return n;
    }
    const numeros = (c, def) => def.pins.map((_, i) => {
      const l = String(Array.isArray(c.pinMap) && c.pinMap[i] != null ? c.pinMap[i] : "").split("/").map(s => s.trim()).filter(Boolean);
      return l.length ? l : [String(i + 1)];
    });
    /* composants à plusieurs parties : une unité par lettre, toutes pages confondues */
    const parties = new Map();
    for (const p of pages) for (const c of p.comps || []) {
      if (!c || !c.ref || !c.part || SANS_REPERE.has(c.type)) continue;
      const def = defComp(c, embarques);
      if (!def) continue;
      if (!parties.has(c.ref)) parties.set(c.ref, new Map());
      const m = parties.get(c.ref);
      if (m.has(c.part)) rap.ecart("partie de composant posée deux fois : " + c.ref + c.part);
      else m.set(c.part, unite(def, numeros(c, def), "passive"));
    }
    const libParties = new Map(), uniteDe = new Map();
    for (const [ref, m] of parties) {
      const ls = [...m.keys()], lettres = ls.every(l => /^[A-Z]$/.test(l));
      ls.sort();
      const n = lettres ? Math.max(...ls.map(l => l.charCodeAt(0) - 64)) : ls.length, us = [];
      for (let k = 0; k < n; k++) us.push([]);
      ls.forEach((l, i) => { const k = lettres ? l.charCodeAt(0) - 65 : i; us[k] = m.get(l); uniteDe.set(ref + "\u0000" + l, k + 1); });
      const c0 = pages.flatMap(p => p.comps || []).find(c => c && c.ref === ref && c.part);
      libParties.set(ref, symLib(c0.type, us, { ref: prefixe(c0), valeur: c0.type }));
    }
    function prefixe(c) {
      const s = embarques[c.type];
      const p = s && /^[A-Za-z]{1,4}$/.test(s.prefix || "") ? s.prefix : String(c.ref || "").replace(/[^A-Za-z].*$/, "");
      return p || "U";
    }

    const fichiers = [], feuillesRacine = [];
    pages.forEach((p, ip) => {
      let cleF = "feuille:" + p.uid;
      if (feuillesU.has(cleF)) cleF += ":" + ip;          // deux pages au même compteur : uuid distinct
      feuillesU.add(cleF);
      const uF = uuid(cleF), base = cleF.slice(8), chemin = "/" + uRacine + "/" + uF;
      const comps = (Array.isArray(p.comps) ? p.comps : []).filter(c => c && typeof c === "object" && [c.x, c.y].every(Number.isFinite))
        .map(c => Object.assign({}, c, { rot: CS[c.rot] ? c.rot : 0, mir: !!c.mir }));
      const fils = (Array.isArray(p.wires) ? p.wires : []).filter(w => w && [w.x1, w.y1, w.x2, w.y2].every(Number.isFinite) && (w.x1 !== w.x2 || w.y1 !== w.y2))
        .map(w => ({ x1: w.x1, y1: w.y1, x2: w.x2, y2: w.y2, bus: !!w.bus, net: String(w.net || "").trim() }));
      const dessins = (Array.isArray(p.drawings) ? p.drawings : []).filter(d => d && [d.x1, d.y1, d.x2, d.y2].every(Number.isFinite));
      /* broches de chaque composant, dans le monde */
      const poses = [];
      for (const c of comps) {
        const def = defComp(c, embarques);
        if (!def) { rap.ecart("type de composant inconnu, non exporté : " + String(c.type).slice(0, 40)); continue; }
        poses.push({ c, def, pins: def.pins.map(([x, y]) => monde(c, x, y)) });
      }
      /* cadre : la page de l'éditeur si elle en a une, sinon le dessin centré, au pas de 2,54 mm */
      const xs = [], ys = [];
      for (const { c, pins } of poses) for (const q2 of pins.concat([[c.x, c.y]])) { xs.push(q2[0] - 60, q2[0] + 60); ys.push(q2[1] - 60, q2[1] + 60); }
      for (const f of fils.concat(dessins)) { xs.push(f.x1, f.x2); ys.push(f.y1, f.y2); }
      if (!xs.length) { xs.push(0); ys.push(0); }
      const bx = [Math.min(...xs), Math.max(...xs)], by = [Math.min(...ys), Math.max(...ys)];
      const w = mm(bx[1] - bx[0]) + 50, h = mm(by[1] - by[0]) + 50;
      let pap = PAPIERS.find(([n, pw, ph]) => pw >= w && ph >= h) || PAPIERS[PAPIERS.length - 1];
      let T;
      const pf = PAPIERS.find(x => x[0] === p.format);
      if (pf && Number.isFinite(+p.pageX) && Number.isFinite(+p.pageY) && pf[1] >= mm(bx[1] - +p.pageX) && pf[2] >= mm(by[1] - +p.pageY) && bx[0] >= +p.pageX && by[0] >= +p.pageY) {
        pap = pf; T = [-sg(+p.pageX), -sg(+p.pageY)];
      } else T = [sg(pap[1] * K / 2 - (bx[0] + bx[1]) / 2), sg(pap[2] * K / 2 - (by[0] + by[1]) / 2)];
      if (mm(bx[1] - bx[0]) > 1189) rap.ecart("feuille plus grande qu'un A0 : elle déborde du cadre");
      const X = v => mm(v + T[0]), Y = v => mm(v + T[1]);
      const at = (pt, A) => ["at", X(pt[0]), Y(pt[1]), A];
      const corps = [], uuidDe = t => ["uuid", q(uuid(base + ":" + t))];
      let nPwr = 0;
      const libsPage = new Set();
      /* fils : KiCad ne relie ni une broche ni une extrémité posée au milieu d'un fil */
      /* étiquette qui ne touche aucun fil (paire locale + globale d'un pont de bus) : un bout de fil
         la porte, KiCad ne reliant pas sûrement deux étiquettes posées au même point */
      for (const { c, pins } of poses) {
        if ((c.type !== "port" && c.type !== "gport") || fils.some(f => !f.bus && surSegment(pins[0], f))) continue;
        const o = monde(c, 0, 0), d = [Math.sign(pins[0][0] - o[0]), Math.sign(pins[0][1] - o[1])];
        fils.push({ x1: pins[0][0], y1: pins[0][1], x2: pins[0][0] + 10 * d[0], y2: pins[0][1] + 10 * d[1], bus: false, net: "" });
      }
      const pointsPins = poses.flatMap(x => x.pins);
      const normaux = fils.filter(f => !f.bus);
      const coupes = pointsPins.concat(normaux.flatMap(f => [[f.x1, f.y1], [f.x2, f.y2]]));
      const morceaux = fils.map(f => Object.assign({}, f));
      for (const pt of coupes) {
        for (let i = morceaux.length - 1; i >= 0; i--) {
          const m = morceaux[i];
          if (m.bus || extremite(pt, m) || !surSegment(pt, m)) continue;
          morceaux.push(Object.assign({}, m, { x1: pt[0], y1: pt[1] }));
          m.x2 = pt[0]; m.y2 = pt[1];
        }
      }
      const compte = new Map(), k2 = pt => pt[0] + "," + pt[1];
      for (const m of morceaux) if (!m.bus) for (const pt of [[m.x1, m.y1], [m.x2, m.y2]]) compte.set(k2(pt), (compte.get(k2(pt)) || 0) + 1);
      for (const pt of pointsPins) if (compte.has(k2(pt))) compte.set(k2(pt), compte.get(k2(pt)) + 1);
      for (const [k, n] of compte) if (n >= 3) {
        const [x, y] = k.split(",").map(Number);
        corps.push(["junction", at([x, y]).slice(0, 3), ["diameter", 0], ["color", 0, 0, 0, 0], uuidDe("j:" + k)]);
      }
      morceaux.forEach((m, i) => corps.push([m.bus ? "bus" : "wire", ["pts", ["xy", X(m.x1), Y(m.y1)], ["xy", X(m.x2), Y(m.y2)]], trait(), uuidDe("f:" + i)]));
      fils.forEach((f, i) => {
        if (!f.net || NET_AUTO.test(f.net)) return;
        corps.push(["label", q(f.net), at([f.x1, f.y1], f.y1 === f.y2 ? 0 : 90), ["fields_autoplaced", "yes"], police(false, ["left", "bottom"]), uuidDe("l:" + i)]);
      });
      /* composants */
      for (const { c, def, pins } of poses) {
        const kc = versKicad(c), v = String(c.value == null ? "" : c.value);
        if (c.type === "port" || c.type === "gport") {
          const A = (540 - c.rot) % 360, j = A === 0 || A === 90 ? ["left"] : ["right"];
          corps.push(c.type === "port"
            ? ["label", q(v || "NET"), at(pins[0], A), ["fields_autoplaced", "yes"], police(false, j.concat("bottom")), uuidDe("c:" + c.id)]
            : ["global_label", q(v || "NET"), ["shape", "bidirectional"], at(pins[0], A), ["fields_autoplaced", "yes"], police(false, j), uuidDe("c:" + c.id),
               ["property", q("Intersheetrefs"), q("${INTERSHEET_REFS}"), at(pins[0], 0), police(true)]]);
          continue;
        }
        if (ANNOT.has(c.type)) {
          if (v) corps.push(["text", q(v.replace(/\|/g, "\n")), ["exclude_from_sim", "no"], at([c.x, c.y], 0), police(), uuidDe("c:" + c.id)]);
          continue;
        }
        let nomS, unitN = 1, ref = String(c.ref || ""), valeur = v, pos = [c.x, c.y], power = false;
        if (c.type === "vcc" || c.type === "gnd") {
          power = true;
          valeur = v.trim() || (c.type === "gnd" ? "GND" : "VCC");
          const pin = INTEGRES[c.type][0].split(",").map(Number);
          const g = trace(ALIM[c.type]).map(t => Object.assign({}, t, { y1: t.y1 - pin[1], y2: t.y2 - pin[1] }));
          nomS = symLib(valeur, [[...g.map(graphisme), ["pin", "power_in", "line", ["at", 0, 0, c.type === "gnd" ? 270 : 90], ["length", 0], ["hide", "yes"],
            ["name", q(valeur), police()], ["number", q("1"), police()]]]], { power: true, ref: "#PWR", valeur });
          pos = pins[0];
          ref = "#PWR" + ((ip + 1) * 1000 + ++nPwr);
        } else if (c.part && libParties.has(c.ref) && uniteDe.has(c.ref + "\u0000" + c.part)) {
          nomS = libParties.get(c.ref);
          unitN = uniteDe.get(c.ref + "\u0000" + c.part);
        } else {
          nomS = symLib(c.type, [unite(def, numeros(c, def), "passive")], { ref: prefixe(c), valeur: c.type });
        }
        libsPage.add(nomS);
        const uS = uuid("symbole:" + base + ":" + c.id);
        if (!power && ref && !chemins.has(ref)) chemins.set(ref, "/" + uF + "/" + uS);   // la carte omet la racine
        const fp = power ? "" : librairie ? (librairie.get(ref) || "") : String(c.pkg || "");
        const ys2 = pins.map(q2 => q2[1]).concat([c.y]), haut = Math.min(...ys2) - 20, bas = Math.max(...ys2) + 20;
        const props = [["Reference", ref, [c.x, haut], power], ["Value", valeur, [c.x, bas], false], ["Footprint", fp, [c.x, c.y], true],
                       ["Datasheet", String(c.datasheet_url || ""), [c.x, c.y], true], ["Description", String(c.desc || ""), [c.x, c.y], true]]
          .concat(PROPS.filter(([k]) => c[k]).map(([k, n]) => [n, String(c[k]), [c.x, c.y], true]));
        const nums = power ? [["1"]] : numeros(c, def);
        corps.push(["symbol", ["lib_id", q(nomLib + ":" + nomS)], at(pos, kc.A), ...(kc.miroir ? [["mirror", kc.miroir]] : []), ["unit", unitN],
          ["exclude_from_sim", "no"], ["in_bom", power ? "no" : "yes"], ["on_board", power ? "no" : "yes"], ["dnp", "no"], ["uuid", q(uS)],
          ...props.map(([k, t, pt, cachee]) => ["property", q(k), q(t), at(pt, 0), police(cachee)]),
          ...[...new Set(nums.flat())].map(n => ["pin", q(n), ["uuid", q(uuid("broche:" + base + ":" + c.id + ":" + n))]]),
          ["instances", ["project", q(nomProjet), ["path", q(chemin), ["reference", q(ref)], ["unit", unitN]]]]]);
      }
      /* dessins */
      dessins.forEach((d, i) => {
        const st = d.style === "dashed" ? "dash" : d.style === "dotted" ? "dot" : "solid";
        corps.push(d.shape === "rect"
          ? ["rectangle", ["start", X(d.x1), Y(d.y1)], ["end", X(d.x2), Y(d.y2)], trait(st), remplir(false), uuidDe("d:" + i)]
          : ["polyline", ["pts", ["xy", X(d.x1), Y(d.y1)], ["xy", X(d.x2), Y(d.y2)]], trait(st), uuidDe("d:" + i)]);
        if (d.label) corps.push(["text", q(String(d.label)), ["exclude_from_sim", "no"], ["at", X(Math.min(d.x1, d.x2)), Y(Math.min(d.y1, d.y2)) - 1.27, 0], police(false, ["left", "bottom"]), uuidDe("dt:" + i)]);
      });
      let nomF = String(p.name || "Feuille").slice(0, 60) || "Feuille";
      for (let k = 2; nomsFeuilles.has(nomF); k++) nomF = String(p.name || "Feuille").slice(0, 54) + " (" + k + ")";
      nomsFeuilles.add(nomF);
      let fic = (nomFichier(nomF) || "feuille") + ".kicad_sch";
      // sans égard à la casse : Windows et macOS confondraient « Power » et « power »
      for (let k = 2; nomsFichiers.has(fic.toLowerCase()); k++) fic = (nomFichier(nomF) || "feuille") + "_" + k + ".kicad_sch";
      nomsFichiers.add(fic.toLowerCase());
      const libsArbre = [...libsPage].map(n => { const a = libs.get(n).arbre.slice(); a[1] = q(nomLib + ":" + n); return a; });
      fichiers.push({ nom: fic, texte: ecrireS(entete(uuid("fichier:" + base), pap[0], libsArbre, corps)) + "\n" });
      feuillesRacine.push({ uF, nomF, fic, page: ip + 2 });
    });

    /* racine : un cadre par page, sans broche (les noms globaux relient les pages) */
    const parLigne = 4, lignes = Math.ceil(feuillesRacine.length / parLigne);
    const papR = PAPIERS.find(([n, pw, ph]) => pw >= 25.4 + parLigne * 76.2 && ph >= 25.4 + lignes * 38.1 + 25) || PAPIERS[PAPIERS.length - 1];
    const feuilles = feuillesRacine.map((f, i) => {
      const x = 25.4 + (i % parLigne) * 76.2, y = 25.4 + Math.floor(i / parLigne) * 38.1;
      return ["sheet", ["at", x, y], ["size", 50.8, 25.4], ["exclude_from_sim", "no"], ["in_bom", "yes"], ["on_board", "yes"], ["dnp", "no"],
        ["fields_autoplaced", "yes"], trait("solid"), ["fill", ["color", 0, 0, 0, 0]], ["uuid", q(f.uF)],
        ["property", q("Sheetname"), q(f.nomF), ["at", x, y - 0.7116, 0], police(false, ["left", "bottom"])],
        ["property", q("Sheetfile"), q(f.fic), ["at", x, y + 26.0216, 0], police(false, ["left", "top"])],
        ["instances", ["project", q(nomProjet), ["path", q("/" + uRacine), ["page", q(String(f.page))]]]]];
    });
    const racine = entete(uRacine, papR[0], [], feuilles.concat([["sheet_instances", ["path", q("/"), ["page", q("1")]]]]));
    const ci = doc.cartouche && typeof doc.cartouche === "object" ? doc.cartouche : {};
    const tb = ["title_block", ...(ci.titre ? [["title", q(ci.titre)]] : []), ...(ci.dateDessin ? [["date", q(ci.dateDessin)]] : []),
      ...CARTOUCHE.filter(([k]) => ci[k]).map(([k, l], i) => ["comment", i + 1, q(l + " : " + ci[k])])];
    if (tb.length > 1) racine.splice(6, 0, tb);
    // la racine porte le nom exact du .kicad_pro (déjà sans caractère interdit) : KiCad les apparie ainsi
    fichiers.unshift({ nom: nomProjet + ".kicad_sch", texte: ecrireS(racine) + "\n" });
    const bibliotheque = ecrireS(["kicad_symbol_lib", ["version", 20241209], ["generator", q("web_cao")], ["generator_version", q("1.0")],
      ...[...libs.values()].map(l => l.arbre)]) + "\n";
    return { fichiers, bibliotheque, chemins };
  }
  function entete(u, papier, libsArbre, corps) {
    return ["kicad_sch", ["version", VERSION_SCH], ["generator", q("web_cao")], ["generator_version", q("1.0")], ["uuid", q(u)], ["paper", q(papier)],
      ["lib_symbols", ...libsArbre], ...corps, ["embedded_fonts", "no"]];
  }

  /* ======================================================================
     HARMONISATION : la carte importée prend les noms de nets que le schéma annoncera
     (docNets puis netlistText de l'éditeur) ; sinon l'ECO du PCB verrait chaque patte
     changer de net (« /feuille/NOM », « Net-(R1-Pad1) » contre « NOM », « N$3 »).
     ====================================================================== */
  const NOMME = { gnd: [3, "GND", true], vcc: [3, "VCC", true], gport: [3, "NET", true], port: [2, "NET", false] };
  const PATTES = /^[A-Za-z0-9]{1,8}(\/[A-Za-z0-9]{1,8}){0,7}$/;            // BROCHAGE_PATTES
  const dedans = (p, w) => !extremite(p, w) && surSegment(p, w);
  /* pattes d'une broche telles que normComp puis brPattes les donnent */
  function pattes(c, i) {
    const pm = Array.isArray(c.pinMap) && c.pinMap.length <= 1024 ? c.pinMap.map(v => { const t = String(v == null ? "" : v).split("/").map(x => x.trim()).filter(Boolean).join("/"); return PATTES.test(t) ? t : ""; }) : null;
    const l = pm && pm.some(Boolean) && pm[i] ? pm[i].split("/") : [String(i + 1)];
    return l.map(t => /^\d+$/.test(t) ? String(+t) : t);
  }
  /* nets d'une page comme computeNets (07-connectivite.js) : nom gagnant, noms globaux, pattes, ordre de la liste */
  function netsPage(p, embarques) {
    const fils = (p.wires || []).filter(w => w && !w.bus), par = new Map(), K = (x, y) => x + "," + y;
    const f = k => { if (!par.has(k)) par.set(k, k); let r = k; while (par.get(r) !== r) r = par.get(r); par.set(k, r); return r; };
    const u = (a, b) => { a = f(a); b = f(b); if (a !== b) par.set(a, b); };
    for (const w of fils) u(K(w.x1, w.y1), K(w.x2, w.y2));
    for (const w of fils) for (const e of [[w.x1, w.y1], [w.x2, w.y2]]) for (const v of fils) if (dedans(e, v)) u(K(e[0], e[1]), K(v.x1, v.y1));
    const broches = [], revend = [];
    for (const c0 of p.comps || []) {
      const c = Object.assign({}, c0, { rot: CS[c0.rot] ? c0.rot : 0 }), def = defComp(c, embarques);
      if (!def) continue;
      def.pins.forEach(([x, y], i) => {
        const m = monde(c, x, y), k = K(m[0], m[1]);
        f(k);
        for (const v of fils) if (dedans(m, v)) u(k, K(v.x1, v.y1));
        broches.push({ c, i, k, m });
        const nm = NOMME[c.type];
        if (nm) revend.push({ k, nom: String(c.value == null ? "" : c.value).slice(0, 240).trim() || nm[1], prio: nm[0], glob: nm[2] });
      });
    }
    for (const w of fils) {
      const n = String(w.net == null ? "" : w.net).trim().slice(0, 32).trim();
      if (n && !NET_AUTO.test(n)) revend.push({ k: K(w.x1, w.y1), nom: n, prio: 1, glob: false });
    }
    const premier = new Map(), noms = new Set();
    for (const r of revend) { const kk = r.nom.toUpperCase(); noms.add(kk); if (premier.has(kk)) u(r.k, premier.get(kk)); else premier.set(kk, r.k); }
    const nets = new Map();
    const net = k => { const r = f(k); if (!nets.has(r)) nets.set(r, { pts: [], fils: [], noeuds: [], alims: 0, nom: "", prio: 0, glob: false, globaux: [] }); return nets.get(r); };
    for (const w of fils) { const n = net(K(w.x1, w.y1)); n.fils.push(w); n.pts.push([w.x1, w.y1], [w.x2, w.y2]); }
    for (const b of broches) {
      const n = net(b.k);
      n.pts.push(b.m);
      if (NOMME[b.c.type]) n.alims++;
      else if (!SANS_REPERE.has(b.c.type)) for (const pad of pattes(b.c, b.i)) n.noeuds.push((b.c.ref || "?") + "." + pad);
    }
    for (const r of revend) {
      const n = net(r.k);
      if (r.glob && !n.globaux.includes(r.nom.toUpperCase())) n.globaux.push(r.nom.toUpperCase());
      if (r.prio > n.prio) { n.prio = r.prio; n.nom = r.nom; n.glob = r.glob; }
    }
    const min = n => n.pts.reduce((a, q2) => q2[1] < a[1] || (q2[1] === a[1] && q2[0] < a[0]) ? q2 : a, [1e9, 1e9]);
    const liste = [...nets.values()].filter(n => n.fils.length || n.noeuds.length + n.alims >= 2);
    liste.forEach(n => { n.min = min(n); });
    liste.sort((a, z) => (a.min[1] - z.min[1]) || (a.min[0] - z.min[0]));
    return { liste, noms, broches, fils: (p.wires || []).filter(Boolean) };
  }
  /* docNets puis netlistText : nom écrit dans la netlist pour chaque patte reliée */
  function nomsNetlist(pages, embarques) {
    const groupes = [], parNom = new Map(), relies = new Set();
    pages.forEach((p, ip) => {
      for (const n of netsPage(p, embarques).liste) {
        n.noeuds.forEach(nd => relies.add(nd));
        const gks = n.globaux;
        let g = null;
        for (const k of gks) {
          const h = parNom.get(k);
          if (!h || h === g) continue;
          if (!g) { g = h; continue; }
          g.noeuds.push(...h.noeuds);
          for (const pg of h.pages) if (!g.pages.includes(pg)) g.pages.push(pg);
          groupes.splice(groupes.indexOf(h), 1);
          for (const [kk, vv] of parNom) if (vv === h) parNom.set(kk, g);
        }
        if (!g) { g = { nom: n.nom, glob: gks.length > 0, pages: [], noeuds: [] }; groupes.push(g); }
        for (const k of gks) parNom.set(k, g);
        if (!g.pages.includes(ip)) g.pages.push(ip);
        g.noeuds.push(...n.noeuds);
      }
    });
    const nl = n => String(n).replace(/"/g, "_"), occ = new Map();
    for (const g of groupes) if (g.nom) occ.set(nl(g.nom), (occ.get(nl(g.nom)) || 0) + 1);
    const parNoeud = new Map(), doubles = new Set();
    for (const g of groupes) {
      if (!g.nom) continue;                                 // N$… : nom automatique, non prévisible ici
      const E = (g.glob || occ.get(nl(g.nom)) < 2 ? nl(g.nom) : nl(g.nom) + "_f" + (g.pages[0] + 1)).trim();
      for (const nd of new Set(g.noeuds)) { if (parNoeud.has(nd) && parNoeud.get(nd) !== E) doubles.add(nd); parNoeud.set(nd, E); }
    }
    for (const nd of doubles) parNoeud.delete(nd);
    return { parNoeud, relies, doubles };
  }

  function harmoniser(sch, pcb, rap) {
    const emb = sch.symboles || {}, pages = Array.isArray(sch.pages) ? sch.pages : [];
    const fps = new Map((pcb.fps || []).map(f => [f.ref, f]));
    const netPcb = nd => { const i = nd.lastIndexOf("."), f = fps.get(nd.slice(0, i)); return f ? String((f.nets || {})[nd.slice(i + 1)] || "") : undefined; };
    /* 1. un net du schéma sans nom prend celui de la carte (sur un fil ; sans fil, sur un bout de fil ajouté) */
    for (const p of pages) {
      const { liste, noms, broches, fils } = netsPage(p, emb);
      for (const n of liste) {
        if (n.prio || !n.noeuds.length) continue;
        const ps = new Set(n.noeuds.map(netPcb).filter(Boolean));
        if (ps.size !== 1) { if (ps.size > 1) rap.ecart("net du schéma relié à plusieurs nets de la carte (connectivité différente) : à vérifier"); continue; }
        const P = [...ps][0];
        let nom = P.slice(0, 32).trim();
        for (let k = 2; !nom || noms.has(nom.toUpperCase()) || NET_AUTO.test(nom); k++) nom = P.slice(0, 28).trim() + "_" + k;
        noms.add(nom.toUpperCase());
        if (n.fils.length) { n.fils[0].net = nom; continue; }
        const m = n.pts[0], pts = broches.map(b => b.m).concat(fils.flatMap(w => [[w.x1, w.y1], [w.x2, w.y2]]));
        const Q = [[10, 0], [-10, 0], [0, 10], [0, -10], [20, 0], [-20, 0], [0, 20], [0, -20]].map(d => [m[0] + d[0], m[1] + d[1]]).find(q2 => {
          const s = { x1: m[0], y1: m[1], x2: q2[0], y2: q2[1] };
          return !pts.some(t => (t[0] === q2[0] && t[1] === q2[1]) || dedans(t, s)) && !fils.some(w => surSegment(q2, w));
        });
        if (!Q) { rap.ecart("pattes reliées sans fil et sans place pour un bout de fil : nom de net non aligné"); continue; }
        p.wires.push({ x1: m[0], y1: m[1], x2: Q[0], y2: Q[1], net: nom });
        fils.push(p.wires[p.wires.length - 1]);
        rap.ecart("pattes reliées sans fil : un bout de fil porte le nom du net de la carte");
      }
    }
    /* 2. le nom que la netlist du schéma donnera à chaque patte, et le net de la carte en face */
    const { parNoeud, relies, doubles } = nomsNetlist(pages, emb);
    if (doubles.size) rap.ecart("patte dans deux nets du schéma : laissée telle quelle");
    const eDeP = new Map(), pDeE = new Map(), ajoute = (m, k, v) => { if (!m.has(k)) m.set(k, new Set()); m.get(k).add(v); };
    for (const [nd, E] of parNoeud) { const P = netPcb(nd); if (P !== undefined) { ajoute(eDeP, P, E); ajoute(pDeE, E, P); } }
    if (eDeP.has("")) rap.ecart("patte reliée au schéma mais libre sur la carte : à vérifier");
    const renommer = new Map();
    for (const [P, es] of eDeP) {
      if (!P) continue;
      const E = [...es][0];
      if (es.size > 1 || pDeE.get(E).size > 1) { rap.ecart("net de la carte et nets du schéma qui ne se recouvrent pas (connectivité différente) : à vérifier"); continue; }
      if (E.length > 64) { rap.ecart("nom de net du schéma de plus de 64 caractères : la carte ne peut pas le porter"); continue; }
      if (P !== E) renommer.set(P, E);
    }
    /* patte libre au schéma : son net « unconnected-… » de la carte s'efface, s'il n'est ni routé ni partagé */
    const tous = [].concat(pcb.tracks || [], pcb.vias || [], pcb.zones || []);
    const routes = new Set(tous.map(o => o && o.net).filter(Boolean)), vides = new Set();
    const refsSch = new Set(pages.flatMap(p => (p.comps || []).filter(c => c && c.ref && !SANS_REPERE.has(c.type)).map(c => c.ref)));
    for (const f of pcb.fps || []) if (refsSch.has(f.ref)) for (const [k, P] of Object.entries(f.nets || {})) {
      if (!P || relies.has(f.ref + "." + k) || eDeP.has(P)) continue;
      if (routes.has(P)) rap.ecart("net routé sur la carte mais sans patte reliée au schéma : gardé");
      else vides.add(P);
    }
    /* un nouveau nom déjà porté par un autre net de la carte les fusionnerait : on s'abstient */
    const noms = new Set((pcb.fps || []).flatMap(f => Object.values(f.nets || {})).concat([...routes]));
    for (let change = true; change;) {
      change = false;
      const gardes = new Set([...noms].filter(n => !renommer.has(n) && !vides.has(n)));
      for (const [P, E] of renommer) if (gardes.has(E)) { renommer.delete(P); change = true; rap.ecart("nom de net du schéma déjà pris par un autre net de la carte : non aligné"); }
    }
    const rn = n => renommer.has(n) ? renommer.get(n) : n;
    for (const f of pcb.fps || []) for (const k of Object.keys(f.nets || {})) { if (vides.has(f.nets[k])) delete f.nets[k]; else f.nets[k] = rn(f.nets[k]); }
    for (const o of tous.concat(pcb.cuL || [])) if (o && o.net) o.net = rn(o.net);
    for (const t of ["netClass", "netClassAuto"]) if (pcb[t] && typeof pcb[t] === "object") pcb[t] = Object.fromEntries(Object.entries(pcb[t]).map(([k, v]) => [rn(k), v]));
    for (const d of Array.isArray(pcb.dpPairs) ? pcb.dpPairs : []) for (const k of ["p", "n"]) if (d && d[k]) d[k] = rn(d[k]);
    return { renommes: renommer.size, effaces: vides.size };
  }

  return { lire, ecrire, harmoniser };
})();
