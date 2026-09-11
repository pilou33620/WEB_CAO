"use strict";
/* =============================================================================
   extraire_bibliotheques.js
   Génère l'arborescence LIB/ avec :
     - lib_empreinte_pcb/ : fichiers individuels JSON pcbfp-1 pour chaque empreinte
     - lib_empreinte_schematique/ : fichiers individuels JSON schsym-1 pour chaque symbole
     - lib_simulation/ : modèles de simulation SPICE (.sub)
     - LIB_composants.csv : CSV existant enrichi avec les 3 nouvelles colonnes
   ============================================================================= */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const LIB_DIR = path.join(ROOT, 'LIB');
const PCB_DIR = path.join(LIB_DIR, 'lib_empreinte_pcb');
const SCH_DIR = path.join(LIB_DIR, 'lib_empreinte_schematique');
const SIM_DIR = path.join(LIB_DIR, 'lib_simulation');

// 1. Création des répertoires
[LIB_DIR, PCB_DIR, SCH_DIR, SIM_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

console.log("Dossiers créés dans", LIB_DIR);

/* ==========================================================================
   A. Extraction et calcul des empreintes PCB
   ========================================================================== */

// Fonctions géométriques issues de editeur-pcb/js/01-core.js
function r3(v) { return Math.round(v * 1000) / 1000; }
function r4(v) { return Math.round(v * 10000) / 10000; }

function padHalf(q) {
  const a = ((q.rot || 0) * Math.PI) / 180;
  const ca = Math.abs(Math.cos(a)), sa = Math.abs(Math.sin(a));
  return { x: (q.w * ca + q.h * sa) / 2, y: (q.w * sa + q.h * ca) / 2 };
}

function calculatePads(fp) {
  const out = [];
  const n = fp.pins;
  const p = fp.pitch;
  const sp = fp.span;

  if (fp.pads && fp.pads.length) {
    return fp.pads.map(q => ({
      n: q.n, x: r4(q.x), y: r4(q.y), w: r4(q.w), h: r4(q.h),
      shape: q.shape || "rect", drill: q.drill || 0, rot: q.rot || 0
    }));
  }

  if (fp.style === "chip") {
    const w = Math.max(0.4, sp * 0.55), h = Math.max(0.45, sp * 0.62);
    for (let i = 0; i < n; i++) {
      out.push({
        n: i + 1,
        x: r4((i - (n - 1) / 2) * sp),
        y: 0,
        w: r4(w),
        h: r4(h),
        shape: "rect",
        drill: 0,
        rot: 0
      });
    }
  } else if (fp.style === "row") {
    for (let i = 0; i < n; i++) {
      out.push({
        n: i + 1,
        x: r4((i - (n - 1) / 2) * p),
        y: 0,
        w: r4(p * 0.68),
        h: r4(p * 0.68),
        shape: i === 0 ? "rect" : "circ",
        drill: r4(Math.min(1.0, p * 0.34)),
        rot: 0
      });
    }
  } else if (fp.style === "quad") {
    const b = Math.floor(n / 4), rr = n % 4;
    const per = [b + (rr > 0 ? 1 : 0), b + (rr > 1 ? 1 : 0), b + (rr > 2 ? 1 : 0), b];
    const lg = Math.max(0.6, p * 1.8), br = Math.max(0.22, p * 0.55);
    let k = 1;
    for (let s = 0; s < 4; s++) {
      for (let i = 0; i < per[s]; i++) {
        const t = (i - (per[s] - 1) / 2) * p;
        if (s === 0)      out.push({ n: k++, x: r4(-sp / 2), y: r4(t),     w: r4(lg), h: r4(br), shape: "rect", drill: 0, rot: 0 });
        else if (s === 1) out.push({ n: k++, x: r4(t),      y: r4(sp / 2),  w: r4(br), h: r4(lg), shape: "rect", drill: 0, rot: 0 });
        else if (s === 2) out.push({ n: k++, x: r4(sp / 2),  y: r4(-t),    w: r4(lg), h: r4(br), shape: "rect", drill: 0, rot: 0 });
        else              out.push({ n: k++, x: r4(-t),     y: r4(-sp / 2), w: r4(br), h: r4(lg), shape: "rect", drill: 0, rot: 0 });
      }
    }
  } else if (fp.style === "bga") {
    const cols = Math.max(1, Math.ceil(Math.sqrt(n))), rows = Math.ceil(n / cols);
    const d = Math.max(0.2, p * 0.5);
    for (let i = 0; i < n; i++) {
      out.push({
        n: i + 1,
        x: r4(((i % cols) - (cols - 1) / 2) * p),
        y: r4((Math.floor(i / cols) - (rows - 1) / 2) * p),
        w: r4(d),
        h: r4(d),
        shape: "circ",
        drill: 0,
        rot: 0
      });
    }
  } else {
    // 2 rangées : sop ou dip
    const h = Math.ceil(n / 2), rg = n - h, smd = fp.style === "sop";
    const pw = smd ? Math.max(0.9, sp * 0.30) : p * 0.68;
    const ph = smd ? p * 0.55 : p * 0.68;
    for (let i = 0; i < h; i++) {
      out.push({
        n: i + 1,
        x: r4(-sp / 2),
        y: r4((i - (h - 1) / 2) * p),
        w: r4(pw),
        h: r4(ph),
        shape: (smd || i === 0) ? "rect" : "circ",
        drill: smd ? 0 : r4(Math.min(1.0, p * 0.34)),
        rot: 0
      });
    }
    for (let i = h; i < n; i++) {
      const k = n - 1 - i;
      out.push({
        n: i + 1,
        x: r4(sp / 2),
        y: r4((k - (rg - 1) / 2) * p),
        w: r4(pw),
        h: r4(ph),
        shape: smd ? "rect" : "circ",
        drill: smd ? 0 : r4(Math.min(1.0, p * 0.34)),
        rot: 0
      });
    }
  }
  return out;
}

function calculateBody(fp, pads) {
  if (fp.body && fp.body.x1 !== undefined) {
    return {
      x1: r4(Math.min(fp.body.x1, fp.body.x2)),
      y1: r4(Math.min(fp.body.y1, fp.body.y2)),
      x2: r4(Math.max(fp.body.x1, fp.body.x2)),
      y2: r4(Math.max(fp.body.y1, fp.body.y2))
    };
  }
  let x1 = 1e9, y1 = 1e9, x2 = -1e9, y2 = -1e9;
  for (const q of pads) {
    const hf = padHalf(q);
    x1 = Math.min(x1, q.x - hf.x);
    x2 = Math.max(x2, q.x + hf.x);
    y1 = Math.min(y1, q.y - hf.y);
    y2 = Math.max(y2, q.y + hf.y);
  }
  if (x1 > x2) return { x1: -1, y1: -1, x2: 1, y2: 1 };
  if (fp.style === "dip" || fp.style === "sop") {
    const in1 = fp.span / 2 - (fp.style === "dip" ? 1.3 : 0.9);
    return { x1: r4(-in1), y1: r4(y1 - 0.4), x2: r4(in1), y2: r4(y2 + 0.4) };
  }
  return { x1: r4(x1 - 0.25), y1: r4(y1 - 0.35), x2: r4(x2 + 0.25), y2: r4(y2 + 0.35) };
}

// Catalogue des empreintes à générer
const PCB_FOOTPRINTS = [
  // Passifs CMS
  { name: "01005", style: "chip", pins: 2, pitch: 0.35, span: 0.35, desc: "CMS 01005 (0.4 x 0.2 mm) très haute densité" },
  { name: "0201",  style: "chip", pins: 2, pitch: 0.55, span: 0.55, desc: "CMS 0201 (0.6 x 0.3 mm)" },
  { name: "0402",  style: "chip", pins: 2, pitch: 0.95, span: 0.95, desc: "CMS 0402 (1.0 x 0.5 mm)" },
  { name: "0603",  style: "chip", pins: 2, pitch: 1.5,  span: 1.5,  desc: "CMS 0603 (1.6 x 0.8 mm) standard prototypage" },
  { name: "0805",  style: "chip", pins: 2, pitch: 1.9,  span: 1.9,  desc: "CMS 0805 (2.0 x 1.25 mm)" },
  { name: "1206",  style: "chip", pins: 2, pitch: 3.1,  span: 3.1,  desc: "CMS 1206 (3.2 x 1.6 mm)" },
  { name: "1210",  style: "chip", pins: 2, pitch: 3.1,  span: 3.1,  desc: "CMS 1210 (3.2 x 2.5 mm)" },
  { name: "1812",  style: "chip", pins: 2, pitch: 4.5,  span: 4.5,  desc: "CMS 1812 (4.5 x 3.2 mm)" },
  { name: "2512",  style: "chip", pins: 2, pitch: 6.2,  span: 6.2,  desc: "CMS 2512 (6.3 x 3.2 mm) shunt de puissance" },

  // Diodes CMS
  { name: "SMA",      style: "chip", pins: 2, pitch: 5.0, span: 5.0, desc: "Diode DO-214AC (SMA)" },
  { name: "SMB",      style: "chip", pins: 2, pitch: 5.2, span: 5.2, desc: "Diode DO-214AA (SMB)" },
  { name: "SMC",      style: "chip", pins: 2, pitch: 7.0, span: 7.0, desc: "Diode DO-214AB (SMC)" },
  { name: "MELF",     style: "chip", pins: 2, pitch: 5.0, span: 5.0, desc: "Diode cylindrique MELF (DO-213AB)" },
  { name: "MiniMELF", style: "chip", pins: 2, pitch: 3.2, span: 3.2, desc: "Diode cylindrique MiniMELF (SOD-80)" },
  { name: "SOD-123",  style: "chip", pins: 2, pitch: 3.6, span: 3.6, desc: "Diode CMS compacte SOD-123" },
  { name: "SOD-323",  style: "chip", pins: 2, pitch: 2.4, span: 2.4, desc: "Diode CMS SOD-323 2 broches" },
  { name: "SOD-523",  style: "chip", pins: 2, pitch: 1.6, span: 1.6, desc: "Diode CMS ultra-compacte SOD-523" },

  // Petits boîtiers CMS
  { name: "SOT-23",   style: "sop", pins: 3, pitch: 0.95, span: 2.6, desc: "Boîtier CMS transistor SOT-23 (TO-236)" },
  { name: "SOT-23-5", style: "sop", pins: 5, pitch: 0.95, span: 2.8, desc: "Boîtier CMS SOT-23-5 (TSOP-5)" },
  { name: "SOT-23-6", style: "sop", pins: 6, pitch: 0.95, span: 2.6, desc: "Boîtier CMS SOT-23-6 (TSOP-6)" },
  { name: "SOT-89",   style: "sop", pins: 3, pitch: 1.5,  span: 3.0, desc: "Boîtier CMS SOT-89 3 broches" },
  { name: "SOT-223",  style: "sop", pins: 4, pitch: 2.3,  span: 6.3, desc: "Boîtier CMS régulateur SOT-223 4 broches" },
  { name: "SC-70",    style: "sop", pins: 3, pitch: 0.65, span: 2.1, desc: "Boîtier ultra-compact SC-70-3 (SOT-323)" },
  { name: "SC-70-6",  style: "sop", pins: 6, pitch: 0.65, span: 2.1, desc: "Boîtier ultra-compact SC-70-6" },

  // Puissance
  { name: "TO-252",   style: "sop", pins: 3, pitch: 2.3,  span: 6.5,  desc: "Boîtier puissance CMS TO-252 (DPAK)" },
  { name: "TO-263",   style: "sop", pins: 3, pitch: 2.54, span: 8.6,  desc: "Boîtier puissance CMS TO-263 (D2PAK)" },
  { name: "TO-92",    style: "row", pins: 3, pitch: 2.54, span: 2.54, desc: "Transistor traversant TO-92" },
  { name: "TO-220",   style: "row", pins: 3, pitch: 2.54, span: 2.54, desc: "Boîtier puissance traversant TO-220" },
  { name: "TO-247",   style: "row", pins: 3, pitch: 5.45, span: 5.45, desc: "Boîtier puissance traversant TO-247" },

  // SOIC
  { name: "SOIC-8",   style: "sop", pins: 8,  pitch: 1.27, span: 5.4, desc: "CI SOIC-8 pas 1.27 mm" },
  { name: "SOIC-14",  style: "sop", pins: 14, pitch: 1.27, span: 5.4, desc: "CI SOIC-14 pas 1.27 mm" },
  { name: "SOIC-16",  style: "sop", pins: 16, pitch: 1.27, span: 5.4, desc: "CI SOIC-16 pas 1.27 mm" },
  { name: "SOIC-20",  style: "sop", pins: 20, pitch: 1.27, span: 9.4, desc: "CI SOIC-20 large pas 1.27 mm" },
  { name: "SOIC-24",  style: "sop", pins: 24, pitch: 1.27, span: 9.4, desc: "CI SOIC-24 large pas 1.27 mm" },
  { name: "SOIC-28",  style: "sop", pins: 28, pitch: 1.27, span: 9.4, desc: "CI SOIC-28 large pas 1.27 mm" },

  // SSOP / TSSOP / MSOP / DFN
  { name: "SSOP-14",  style: "sop", pins: 14, pitch: 0.65, span: 5.7, desc: "CI SSOP-14 pas fin 0.65 mm" },
  { name: "SSOP-16",  style: "sop", pins: 16, pitch: 0.65, span: 5.7, desc: "CI SSOP-16 pas fin 0.65 mm" },
  { name: "SSOP-20",  style: "sop", pins: 20, pitch: 0.65, span: 5.7, desc: "CI SSOP-20 pas fin 0.65 mm" },
  { name: "SSOP-28",  style: "sop", pins: 28, pitch: 0.65, span: 5.7, desc: "CI SSOP-28 pas fin 0.65 mm" },
  { name: "TSSOP-8",  style: "sop", pins: 8,  pitch: 0.65, span: 5.9, desc: "CI TSSOP-8 pas fin 0.65 mm" },
  { name: "TSSOP-14", style: "sop", pins: 14, pitch: 0.65, span: 5.9, desc: "CI TSSOP-14 pas fin 0.65 mm" },
  { name: "TSSOP-16", style: "sop", pins: 16, pitch: 0.65, span: 5.9, desc: "CI TSSOP-16 pas fin 0.65 mm" },
  { name: "TSSOP-20", style: "sop", pins: 20, pitch: 0.65, span: 5.9, desc: "CI TSSOP-20 pas fin 0.65 mm" },
  { name: "TSSOP-24", style: "sop", pins: 24, pitch: 0.65, span: 5.9, desc: "CI TSSOP-24 pas fin 0.65 mm" },
  { name: "TSSOP-28", style: "sop", pins: 28, pitch: 0.65, span: 5.9, desc: "CI TSSOP-28 pas fin 0.65 mm" },
  { name: "MSOP-8",   style: "sop", pins: 8,  pitch: 0.65, span: 4.4, desc: "CI MSOP-8 ultra-compact" },
  { name: "MSOP-10",  style: "sop", pins: 10, pitch: 0.50, span: 4.4, desc: "CI MSOP-10 ultra-compact" },
  { name: "DFN-8",    style: "sop", pins: 8,  pitch: 0.50, span: 2.6, desc: "CI DFN-8 sans pattes" },
  { name: "DFN-10",   style: "sop", pins: 10, pitch: 0.50, span: 2.6, desc: "CI DFN-10 sans pattes" },
  { name: "WSON-8",   style: "sop", pins: 8,  pitch: 0.50, span: 2.6, desc: "CI WSON-8 sans pattes" },

  // DIP traversant
  { name: "DIP-4",    style: "dip", pins: 4,  pitch: 2.54, span: 7.62, desc: "CI traversant DIP-4 (optocoupleur)" },
  { name: "DIP-6",    style: "dip", pins: 6,  pitch: 2.54, span: 7.62, desc: "CI traversant DIP-6" },
  { name: "DIP-8",    style: "dip", pins: 8,  pitch: 2.54, span: 7.62, desc: "CI traversant DIP-8 (NE555, AOP...)" },
  { name: "DIP-14",   style: "dip", pins: 14, pitch: 2.54, span: 7.62, desc: "CI traversant DIP-14" },
  { name: "DIP-16",   style: "dip", pins: 16, pitch: 2.54, span: 7.62, desc: "CI traversant DIP-16" },
  { name: "DIP-18",   style: "dip", pins: 18, pitch: 2.54, span: 7.62, desc: "CI traversant DIP-18" },
  { name: "DIP-20",   style: "dip", pins: 20, pitch: 2.54, span: 7.62, desc: "CI traversant DIP-20" },
  { name: "DIP-24",   style: "dip", pins: 24, pitch: 2.54, span: 7.62, desc: "CI traversant DIP-24" },
  { name: "DIP-28",   style: "dip", pins: 28, pitch: 2.54, span: 7.62, desc: "CI traversant DIP-28 (ATmega328...)" },
  { name: "DIP-32",   style: "dip", pins: 32, pitch: 2.54, span: 15.24, desc: "CI traversant DIP-32 large" },
  { name: "DIP-40",   style: "dip", pins: 40, pitch: 2.54, span: 15.24, desc: "CI traversant DIP-40 large (microcontrôleur)" },

  // QFN / QFP / TQFP / LQFP (4 côtés)
  { name: "QFN-16",   style: "quad", pins: 16, pitch: 0.50, span: 4.0,  desc: "CI 4 côtés QFN-16 sans pattes 3x3mm" },
  { name: "QFN-20",   style: "quad", pins: 20, pitch: 0.50, span: 4.5,  desc: "CI 4 côtés QFN-20 sans pattes" },
  { name: "QFN-24",   style: "quad", pins: 24, pitch: 0.50, span: 5.0,  desc: "CI 4 côtés QFN-24 4x4mm" },
  { name: "QFN-28",   style: "quad", pins: 28, pitch: 0.50, span: 5.5,  desc: "CI 4 côtés QFN-28" },
  { name: "QFN-32",   style: "quad", pins: 32, pitch: 0.50, span: 6.0,  desc: "CI 4 côtés QFN-32 5x5mm" },
  { name: "QFN-40",   style: "quad", pins: 40, pitch: 0.40, span: 6.5,  desc: "CI 4 côtés QFN-40" },
  { name: "QFN-48",   style: "quad", pins: 48, pitch: 0.40, span: 7.5,  desc: "CI 4 côtés QFN-48 7x7mm" },
  { name: "QFN-64",   style: "quad", pins: 64, pitch: 0.40, span: 9.5,  desc: "CI 4 côtés QFN-64 9x9mm" },
  { name: "TQFP-32",  style: "quad", pins: 32, pitch: 0.80, span: 9.0,  desc: "CI 4 côtés TQFP-32 7x7mm à pattes" },
  { name: "TQFP-44",  style: "quad", pins: 44, pitch: 0.80, span: 12.0, desc: "CI 4 côtés TQFP-44 10x10mm à pattes" },
  { name: "LQFP-48",  style: "quad", pins: 48, pitch: 0.50, span: 9.0,  desc: "CI 4 côtés LQFP-48 7x7mm à pattes (STM32...)" },
  { name: "LQFP-64",  style: "quad", pins: 64, pitch: 0.50, span: 12.0, desc: "CI 4 côtés LQFP-64 10x10mm à pattes" },
  { name: "LQFP-100", style: "quad", pins: 100, pitch: 0.50, span: 16.0, desc: "CI 4 côtés LQFP-100 14x14mm à pattes" },

  // BGA
  { name: "BGA-16",   style: "bga", pins: 16, pitch: 0.80, span: 3.2, desc: "Grille de billes BGA 4x4 pas 0.8 mm" },
  { name: "BGA-64",   style: "bga", pins: 64, pitch: 0.80, span: 6.4, desc: "Grille de billes BGA 8x8 pas 0.8 mm" },
  { name: "BGA-100",  style: "bga", pins: 100, pitch: 0.80, span: 8.0, desc: "Grille de billes BGA 10x10 pas 0.8 mm" },
  { name: "BGA-256",  style: "bga", pins: 256, pitch: 0.80, span: 12.8, desc: "Grille de billes BGA 16x16 pas 0.8 mm" },

  // Barrettes 2.54 mm
  { name: "HEADER-2.54-1x2", style: "row", pins: 2, pitch: 2.54, span: 2.54, desc: "Barrette 1 rangée 2 broches pas 2.54 mm" },
  { name: "HEADER-2.54-1x3", style: "row", pins: 3, pitch: 2.54, span: 2.54, desc: "Barrette 1 rangée 3 broches pas 2.54 mm" },
  { name: "HEADER-2.54-1x4", style: "row", pins: 4, pitch: 2.54, span: 2.54, desc: "Barrette 1 rangée 4 broches pas 2.54 mm" },
  { name: "HEADER-2.54-1x6", style: "row", pins: 6, pitch: 2.54, span: 2.54, desc: "Barrette 1 rangée 6 broches pas 2.54 mm" },
  { name: "HEADER-2.54-1x8", style: "row", pins: 8, pitch: 2.54, span: 2.54, desc: "Barrette 1 rangée 8 broches pas 2.54 mm" },
  { name: "HEADER-2.54-2x5", style: "dip", pins: 10, pitch: 2.54, span: 2.54, desc: "Barrette 2 rangées 2x5 broches pas 2.54 mm" },

  // Barrettes 1.27 mm
  { name: "HEADER-1.27-1x2", style: "row", pins: 2, pitch: 1.27, span: 1.27, desc: "Barrette 1 rangée 2 broches pas 1.27 mm" },
  { name: "HEADER-1.27-1x3", style: "row", pins: 3, pitch: 1.27, span: 1.27, desc: "Barrette 1 rangée 3 broches pas 1.27 mm" },
  { name: "HEADER-1.27-1x4", style: "row", pins: 1.27, pitch: 1.27, span: 1.27, desc: "Barrette 1 rangée 4 broches pas 1.27 mm" },
  { name: "HEADER-1.27-1x6", style: "row", pins: 6, pitch: 1.27, span: 1.27, desc: "Barrette 1 rangée 6 broches pas 1.27 mm" },
  { name: "HEADER-1.27-1x8", style: "row", pins: 8, pitch: 1.27, span: 1.27, desc: "Barrette 1 rangée 8 broches pas 1.27 mm" },
  { name: "HEADER-1.27-2x5", style: "dip", pins: 10, pitch: 1.27, span: 1.27, desc: "Barrette 2 rangées 2x5 broches pas 1.27 mm" },

  // Points de test & perçages
  {
    name: "Trou-metalise-1.2mm",
    style: "row", pins: 1, pitch: 2.54, span: 2.54, desc: "Trou métallisé diamètre 1.2 mm pastille 2.54 x 1.6 mm",
    pads: [{ n: 1, x: 0, y: 0, w: 2.54, h: 1.6, shape: "oval", drill: 1.2 }]
  },
  {
    name: "TP-PTH",
    style: "row", pins: 1, pitch: 2.54, span: 2.54, desc: "Point de test traversant percé",
    pads: [{ n: 1, x: 0, y: 0, w: 2.0, h: 2.0, shape: "circ", drill: 1.0 }]
  },
  {
    name: "TP-SMD",
    style: "chip", pins: 1, pitch: 1.5, span: 1.5, desc: "Point de test CMS circulaire",
    pads: [{ n: 1, x: 0, y: 0, w: 1.5, h: 1.5, shape: "circ", drill: 0 }]
  },

  // Connecteurs USB
  {
    name: "USB-C-6P",
    style: "row", pins: 5, pitch: 0.5, span: 3.0, desc: "USB Type-C alimentation (VBUS, GND, CC1, CC2, Blindage)",
    pads: [
      { n: 1, x: -1.25, y: -1.5, w: 0.6, h: 1.2, shape: "rect", drill: 0 },
      { n: 1, x: 1.25,  y: -1.5, w: 0.6, h: 1.2, shape: "rect", drill: 0 },
      { n: 2, x: -2.75, y: -1.5, w: 0.8, h: 1.2, shape: "rect", drill: 0 },
      { n: 2, x: 2.75,  y: -1.5, w: 0.8, h: 1.2, shape: "rect", drill: 0 },
      { n: 3, x: -0.5,  y: -1.5, w: 0.4, h: 1.2, shape: "rect", drill: 0 },
      { n: 4, x: 0.5,   y: -1.5, w: 0.4, h: 1.2, shape: "rect", drill: 0 },
      { n: 5, x: -4.3,  y: -1.0, w: 1.6, h: 2.0, shape: "oval", drill: 0.9 },
      { n: 5, x: 4.3,   y: -1.0, w: 1.6, h: 2.0, shape: "oval", drill: 0.9 },
      { n: 5, x: -4.3,  y: 3.2,  w: 1.6, h: 2.0, shape: "oval", drill: 0.9 },
      { n: 5, x: 4.3,   y: 3.2,  w: 1.6, h: 2.0, shape: "oval", drill: 0.9 }
    ],
    body: { x1: -4.5, y1: -2.5, x2: 4.5, y2: 4.5 }
  },
  {
    name: "USB-C-16P",
    style: "row", pins: 8, pitch: 0.5, span: 3.0, desc: "USB Type-C 16 broches (USB 2.0 + alim)",
    pads: [
      { n: 2, x: -2.75, y: -1.5, w: 0.6,  h: 1.2, shape: "rect", drill: 0 },
      { n: 7, x: -2.25, y: -1.5, w: 0.35, h: 1.2, shape: "rect", drill: 0 },
      { n: 1, x: -1.75, y: -1.5, w: 0.5,  h: 1.2, shape: "rect", drill: 0 },
      { n: 5, x: -1.25, y: -1.5, w: 0.35, h: 1.2, shape: "rect", drill: 0 },
      { n: 4, x: -0.75, y: -1.5, w: 0.35, h: 1.2, shape: "rect", drill: 0 },
      { n: 3, x: -0.25, y: -1.5, w: 0.35, h: 1.2, shape: "rect", drill: 0 },
      { n: 4, x: 0.25,  y: -1.5, w: 0.35, h: 1.2, shape: "rect", drill: 0 },
      { n: 3, x: 0.75,  y: -1.5, w: 0.35, h: 1.2, shape: "rect", drill: 0 },
      { n: 6, x: 1.25,  y: -1.5, w: 0.35, h: 1.2, shape: "rect", drill: 0 },
      { n: 1, x: 1.75,  y: -1.5, w: 0.5,  h: 1.2, shape: "rect", drill: 0 },
      { n: 7, x: 2.25,  y: -1.5, w: 0.35, h: 1.2, shape: "rect", drill: 0 },
      { n: 2, x: 2.75,  y: -1.5, w: 0.6,  h: 1.2, shape: "rect", drill: 0 },
      { n: 8, x: -4.3,  y: -1.0, w: 1.6,  h: 2.0, shape: "oval", drill: 0.9 },
      { n: 8, x: 4.3,   y: -1.0, w: 1.6,  h: 2.0, shape: "oval", drill: 0.9 },
      { n: 8, x: -4.3,  y: 3.2,  w: 1.6,  h: 2.0, shape: "oval", drill: 0.9 },
      { n: 8, x: 4.3,   y: 3.2,  w: 1.6,  h: 2.0, shape: "oval", drill: 0.9 }
    ],
    body: { x1: -4.5, y1: -2.5, x2: 4.5, y2: 4.5 }
  },
  {
    name: "MICRO-USB-B",
    style: "row", pins: 6, pitch: 0.65, span: 2.6, desc: "Connecteur Micro-USB Type-B 5 broches + blindage",
    pads: [
      { n: 1, x: -1.3,  y: -1.5, w: 0.4, h: 1.35, shape: "rect", drill: 0 },
      { n: 2, x: -0.65, y: -1.5, w: 0.4, h: 1.35, shape: "rect", drill: 0 },
      { n: 3, x: 0,     y: -1.5, w: 0.4, h: 1.35, shape: "rect", drill: 0 },
      { n: 4, x: 0.65,  y: -1.5, w: 0.4, h: 1.35, shape: "rect", drill: 0 },
      { n: 5, x: 1.3,   y: -1.5, w: 0.4, h: 1.35, shape: "rect", drill: 0 },
      { n: 6, x: -3.5,  y: -1.0, w: 1.6, h: 1.8,  shape: "oval", drill: 0.9 },
      { n: 6, x: 3.5,   y: -1.0, w: 1.6, h: 1.8,  shape: "oval", drill: 0.9 },
      { n: 6, x: -3.5,  y: 2.5,  w: 1.6, h: 1.8,  shape: "oval", drill: 0.9 },
      { n: 6, x: 3.5,   y: 2.5,  w: 1.6, h: 1.8,  shape: "oval", drill: 0.9 }
    ],
    body: { x1: -3.8, y1: -2.5, x2: 3.8, y2: 3.5 }
  }
];

let pcbCount = 0;
for (const item of PCB_FOOTPRINTS) {
  const pads = calculatePads(item);
  const body = calculateBody(item, pads);
  const def = {
    format: "pcbfp-1",
    name: item.name,
    pkg: item.name,
    pins: item.pins,
    style: item.style,
    pitch: r3(item.pitch),
    span: r3(item.span),
    pads: pads,
    body: body,
    description: item.desc || ""
  };
  const filename = `${item.name}.json`;
  fs.writeFileSync(path.join(PCB_DIR, filename), JSON.stringify(def, null, 2), "utf8");
  pcbCount++;
}
console.log(`[PCB] ${pcbCount} empreintes générées dans ${PCB_DIR}`);


/* ==========================================================================
   B. Extraction et sérialisation des symboles schématiques
   ========================================================================== */

const SCH_SYMBOLS = [
  // Passifs
  {
    id: "resistor", name: "Résistance", cat: "Passifs", prefix: "R", defaultValue: "10k", defaultPkg: "0603",
    pins: [[-40, 0], [40, 0]], ext: [-40, -10, 40, 10],
    primitives: [
      { op: "line", x1: -40, y1: 0, x2: -20, y2: 0 },
      { op: "line", x1: 20, y1: 0, x2: 40, y2: 0 },
      { op: "rect", x: -20, y: -10, w: 40, h: 20, r: 4, fill: true }
    ]
  },
  {
    id: "potentiometer", name: "Potentiomètre", cat: "Passifs", prefix: "RV", defaultValue: "10k", defaultPkg: "0603",
    pins: [[-40, 0], [40, 0], [0, -40]], ext: [-40, -40, 40, 10],
    primitives: [
      { op: "line", x1: -40, y1: 0, x2: -20, y2: 0 },
      { op: "line", x1: 20, y1: 0, x2: 40, y2: 0 },
      { op: "rect", x: -20, y: -10, w: 40, h: 20, r: 4, fill: true },
      { op: "line", x1: 0, y1: -40, x2: 0, y2: -20 },
      { op: "arrow", x: 0, y: -15, angle: Math.PI / 2, size: 10 }
    ]
  },
  {
    id: "capacitor", name: "Condensateur", cat: "Passifs", prefix: "C", defaultValue: "100n", defaultPkg: "0603",
    pins: [[-40, 0], [40, 0]], ext: [-40, -15, 40, 15],
    primitives: [
      { op: "line", x1: -40, y1: 0, x2: -5, y2: 0 },
      { op: "line", x1: 5, y1: 0, x2: 40, y2: 0 },
      { op: "line", x1: -5, y1: -15, x2: -5, y2: 15, width: 4.5 },
      { op: "line", x1: 5, y1: -15, x2: 5, y2: 15, width: 4.5 }
    ]
  },
  {
    id: "cap_pol", name: "Chimique / Polarisé", cat: "Passifs", prefix: "C", defaultValue: "470µ", defaultPkg: "0805",
    pins: [[-40, 0], [40, 0]], ext: [-40, -20, 40, 20],
    primitives: [
      { op: "line", x1: -40, y1: 0, x2: -5, y2: 0 },
      { op: "line", x1: 5, y1: 0, x2: 40, y2: 0 },
      { op: "line", x1: -5, y1: -15, x2: -5, y2: 15, width: 4.5 },
      { op: "arc", cx: 25, cy: 0, r: 20, start: Math.PI * 0.72, end: Math.PI * 1.28 },
      { op: "text", text: "+", x: -20, y: -20, size: 14 }
    ]
  },
  {
    id: "inductor", name: "Bobine / Inductance", cat: "Passifs", prefix: "L", defaultValue: "10µH", defaultPkg: "0805",
    pins: [[-40, 0], [40, 0]], ext: [-40, -10, 40, 10],
    primitives: [
      { op: "line", x1: -40, y1: 0, x2: -30, y2: 0 },
      { op: "arc", cx: -20, cy: 0, r: 10, start: Math.PI, end: 0 },
      { op: "arc", cx: 0, cy: 0, r: 10, start: Math.PI, end: 0 },
      { op: "arc", cx: 20, cy: 0, r: 10, start: Math.PI, end: 0 },
      { op: "line", x1: 30, y1: 0, x2: 40, y2: 0 }
    ]
  },
  {
    id: "transformer", name: "Transformateur", cat: "Passifs", prefix: "T", defaultValue: "1:1", defaultPkg: "SOIC-8",
    pins: [[-40, -20], [-40, 20], [40, -20], [40, 20]], ext: [-40, -30, 40, 30],
    primitives: [
      { op: "line", x1: -40, y1: -20, x2: -20, y2: -20 },
      { op: "line", x1: -40, y1: 20, x2: -20, y2: 20 },
      { op: "line", x1: 40, y1: -20, x2: 20, y2: -20 },
      { op: "line", x1: 40, y1: 20, x2: 20, y2: 20 },
      { op: "arc", cx: -20, cy: -10, r: 5, start: -Math.PI / 2, end: Math.PI / 2 },
      { op: "arc", cx: -20, cy: 0, r: 5, start: -Math.PI / 2, end: Math.PI / 2 },
      { op: "arc", cx: -20, cy: 10, r: 5, start: -Math.PI / 2, end: Math.PI / 2 },
      { op: "arc", cx: 20, cy: -10, r: 5, start: Math.PI / 2, end: -Math.PI / 2 },
      { op: "arc", cx: 20, cy: 0, r: 5, start: Math.PI / 2, end: -Math.PI / 2 },
      { op: "arc", cx: 20, cy: 10, r: 5, start: Math.PI / 2, end: -Math.PI / 2 },
      { op: "line", x1: -5, y1: -25, x2: -5, y2: 25 },
      { op: "line", x1: 5, y1: -25, x2: 5, y2: 25 }
    ]
  },
  {
    id: "crystal", name: "Quartz", cat: "Passifs", prefix: "Y", defaultValue: "8MHz", defaultPkg: "0805",
    pins: [[-40, 0], [40, 0]], ext: [-40, -15, 40, 15],
    primitives: [
      { op: "line", x1: -40, y1: 0, x2: -10, y2: 0 },
      { op: "line", x1: 10, y1: 0, x2: 40, y2: 0 },
      { op: "line", x1: -10, y1: -15, x2: -10, y2: 15 },
      { op: "line", x1: 10, y1: -15, x2: 10, y2: 15 },
      { op: "rect", x: -5, y: -15, w: 10, h: 30, r: 2, fill: true }
    ]
  },
  {
    id: "fuse", name: "Fusible", cat: "Passifs", prefix: "F", defaultValue: "1A", defaultPkg: "0603",
    pins: [[-40, 0], [40, 0]], ext: [-40, -10, 40, 10],
    primitives: [
      { op: "line", x1: -40, y1: 0, x2: -25, y2: 0 },
      { op: "line", x1: 25, y1: 0, x2: 40, y2: 0 },
      { op: "rect", x: -25, y: -10, w: 50, h: 20, r: 3, fill: false },
      { op: "line", x1: -25, y1: 0, x2: 25, y2: 0 }
    ]
  },
  {
    id: "ferrite_bead", name: "Perle de ferrite", cat: "Passifs", prefix: "FB", defaultValue: "120R", defaultPkg: "0805",
    pins: [[-40, 0], [40, 0]], ext: [-40, -10, 40, 10],
    primitives: [
      { op: "line", x1: -40, y1: 0, x2: -18, y2: 0 },
      { op: "line", x1: 18, y1: 0, x2: 40, y2: 0 },
      { op: "rect", x: -18, y: -9, w: 36, h: 18, r: 4, fill: true },
      { op: "line", x1: -14, y1: 0, x2: 14, y2: 0, width: 4.5 }
    ]
  },

  // Semi-conducteurs
  {
    id: "diode", name: "Diode", cat: "Semi-conducteurs", prefix: "D", defaultValue: "1N4148", defaultPkg: "SOD-123",
    pins: [[-40, 0], [40, 0]], ext: [-40, -15, 40, 15],
    primitives: [
      { op: "line", x1: -40, y1: 0, x2: -10, y2: 0 },
      { op: "poly", pts: [[-10, -15], [-10, 15], [10, 0]], fill: true },
      { op: "line", x1: 10, y1: -15, x2: 10, y2: 15, width: 4.5 },
      { op: "line", x1: 10, y1: 0, x2: 40, y2: 0 }
    ]
  },
  {
    id: "led", name: "LED", cat: "Semi-conducteurs", prefix: "D", defaultValue: "LED", defaultPkg: "0805",
    pins: [[-40, 0], [40, 0]], ext: [-40, -35, 40, 15],
    primitives: [
      { op: "line", x1: -40, y1: 0, x2: -10, y2: 0 },
      { op: "poly", pts: [[-10, -15], [-10, 15], [10, 0]], fill: true },
      { op: "line", x1: 10, y1: -15, x2: 10, y2: 15, width: 4.5 },
      { op: "line", x1: 10, y1: 0, x2: 40, y2: 0 },
      { op: "line", x1: -5, y1: -20, x2: 5, y2: -30 },
      { op: "arrow", x: 7, y: -32, angle: -Math.PI / 4, size: 8 },
      { op: "line", x1: 5, y1: -20, x2: 15, y2: -30 },
      { op: "arrow", x: 17, y: -32, angle: -Math.PI / 4, size: 8 }
    ]
  },
  {
    id: "zener", name: "Diode Zener", cat: "Semi-conducteurs", prefix: "D", defaultValue: "5V1", defaultPkg: "SOD-323",
    pins: [[-40, 0], [40, 0]], ext: [-40, -20, 40, 20],
    primitives: [
      { op: "line", x1: -40, y1: 0, x2: -10, y2: 0 },
      { op: "poly", pts: [[-10, -15], [-10, 15], [10, 0]], fill: true },
      { op: "line", x1: 10, y1: -15, x2: 10, y2: 15, width: 4.5 },
      { op: "line", x1: 10, y1: -15, x2: 5, y2: -20 },
      { op: "line", x1: 10, y1: 15, x2: 15, y2: 20 },
      { op: "line", x1: 10, y1: 0, x2: 40, y2: 0 }
    ]
  },
  {
    id: "schottky", name: "Diode Schottky", cat: "Semi-conducteurs", prefix: "D", defaultValue: "SS34", defaultPkg: "SMA",
    pins: [[-40, 0], [40, 0]], ext: [-40, -15, 40, 15],
    primitives: [
      { op: "line", x1: -40, y1: 0, x2: -10, y2: 0 },
      { op: "poly", pts: [[-10, -15], [-10, 15], [10, 0]], fill: true },
      { op: "line", x1: 10, y1: -15, x2: 10, y2: 15, width: 4.5 },
      { op: "line", x1: 10, y1: -15, x2: 5, y2: -15 },
      { op: "line", x1: 5, y1: -15, x2: 5, y2: -10 },
      { op: "line", x1: 10, y1: 15, x2: 15, y2: 15 },
      { op: "line", x1: 15, y1: 15, x2: 15, y2: 10 },
      { op: "line", x1: 10, y1: 0, x2: 40, y2: 0 }
    ]
  },
  {
    id: "npn", name: "Transistor NPN", cat: "Semi-conducteurs", prefix: "Q", defaultValue: "MMBT5551", defaultPkg: "SOT-23",
    pins: [[-40, 0], [20, -40], [20, 40]], ext: [-40, -40, 20, 40],
    primitives: [
      { op: "line", x1: -40, y1: 0, x2: -5, y2: 0 },
      { op: "line", x1: -5, y1: -25, x2: -5, y2: 25, width: 4.5 },
      { op: "line", x1: -5, y1: -15, x2: 20, y2: -30 },
      { op: "line", x1: 20, y1: -30, x2: 20, y2: -40 },
      { op: "line", x1: -5, y1: 15, x2: 20, y2: 30 },
      { op: "line", x1: 20, y1: 30, x2: 20, y2: 40 },
      { op: "arrow", x: 15, y: 27, angle: Math.atan2(30 - 15, 20 + 5), size: 10 }
    ]
  },
  {
    id: "pnp", name: "Transistor PNP", cat: "Semi-conducteurs", prefix: "Q", defaultValue: "MMBT5401", defaultPkg: "SOT-23",
    pins: [[-40, 0], [20, -40], [20, 40]], ext: [-40, -40, 20, 40],
    primitives: [
      { op: "line", x1: -40, y1: 0, x2: -5, y2: 0 },
      { op: "line", x1: -5, y1: -25, x2: -5, y2: 25, width: 4.5 },
      { op: "line", x1: -5, y1: -15, x2: 20, y2: -30 },
      { op: "line", x1: 20, y1: -30, x2: 20, y2: -40 },
      { op: "line", x1: -5, y1: 15, x2: 20, y2: 30 },
      { op: "line", x1: 20, y1: 30, x2: 20, y2: 40 },
      { op: "arrow", x: 0, y: 18, angle: Math.atan2(-30 + 15, -20 - 5), size: 10 }
    ]
  },
  {
    id: "nmos", name: "MOSFET N-CH", cat: "Semi-conducteurs", prefix: "Q", defaultValue: "AO3400", defaultPkg: "SOT-23",
    pins: [[-40, 0], [20, -40], [20, 40]], ext: [-40, -40, 20, 40],
    primitives: [
      { op: "line", x1: -40, y1: 0, x2: -15, y2: 0 },
      { op: "line", x1: -15, y1: -25, x2: -15, y2: 25 },
      { op: "line", x1: -5, y1: -25, x2: -5, y2: -10 },
      { op: "line", x1: -5, y1: -5, x2: -5, y2: 5 },
      { op: "line", x1: -5, y1: 10, x2: -5, y2: 25 },
      { op: "line", x1: -5, y1: -20, x2: 20, y2: -20 },
      { op: "line", x1: 20, y1: -20, x2: 20, y2: -40 },
      { op: "line", x1: -5, y1: 20, x2: 20, y2: 20 },
      { op: "line", x1: 20, y1: 20, x2: 20, y2: 40 },
      { op: "line", x1: -5, y1: 0, x2: 20, y2: 0 },
      { op: "arrow", x: 0, y: 0, angle: Math.PI, size: 10 }
    ]
  },
  {
    id: "pmos", name: "MOSFET P-CH", cat: "Semi-conducteurs", prefix: "Q", defaultValue: "AO3400", defaultPkg: "SOT-23",
    pins: [[-40, 0], [20, -40], [20, 40]], ext: [-40, -40, 20, 40],
    primitives: [
      { op: "line", x1: -40, y1: 0, x2: -15, y2: 0 },
      { op: "line", x1: -15, y1: -25, x2: -15, y2: 25 },
      { op: "line", x1: -5, y1: -25, x2: -5, y2: -10 },
      { op: "line", x1: -5, y1: -5, x2: -5, y2: 5 },
      { op: "line", x1: -5, y1: 10, x2: -5, y2: 25 },
      { op: "line", x1: -5, y1: -20, x2: 20, y2: -20 },
      { op: "line", x1: 20, y1: -20, x2: 20, y2: -40 },
      { op: "line", x1: -5, y1: 20, x2: 20, y2: 20 },
      { op: "line", x1: 20, y1: 20, x2: 20, y2: 40 },
      { op: "line", x1: -5, y1: 0, x2: 20, y2: 0 },
      { op: "arrow", x: 15, y: 0, angle: 0, size: 10 }
    ]
  },
  {
    id: "tvs_diode", name: "Diode TVS", cat: "Semi-conducteurs", prefix: "D", defaultValue: "TVS", defaultPkg: "SOD-323",
    pins: [[-40, 0], [40, 0]], ext: [-40, -15, 40, 15],
    primitives: [
      { op: "line", x1: -40, y1: 0, x2: -15, y2: 0 },
      { op: "line", x1: 15, y1: 0, x2: 40, y2: 0 },
      { op: "poly", pts: [[-15, -10], [-15, 10], [-2, 0]], fill: true },
      { op: "poly", pts: [[15, -10], [15, 10], [2, 0]], fill: true },
      { op: "line", x1: 0, y1: -12, x2: 0, y2: 12, width: 4.5 }
    ]
  },

  // Intégrés
  {
    id: "opamp", name: "Amplificateur Opérationnel", cat: "Intégrés", prefix: "U", defaultValue: "LM358", defaultPkg: "SOIC-8",
    pins: [[-40, -20], [-40, 20], [60, 0], [0, -40], [0, 40]], ext: [-40, -40, 60, 40],
    primitives: [
      { op: "line", x1: -40, y1: -20, x2: -20, y2: -20 },
      { op: "line", x1: -40, y1: 20, x2: -20, y2: 20 },
      { op: "line", x1: 40, y1: 0, x2: 60, y2: 0 },
      { op: "line", x1: 0, y1: -40, x2: 0, y2: -27 },
      { op: "line", x1: 0, y1: 40, x2: 0, y2: 27 },
      { op: "poly", pts: [[-20, -40], [-20, 40], [40, 0]], fill: "rgba(47,134,204,.35)" },
      { op: "text", text: "−", x: -10, y: -20, size: 15 },
      { op: "text", text: "+", x: -10, y: 20, size: 14 },
      { op: "text", text: "V+", x: 10, y: -32, size: 8.5 },
      { op: "text", text: "V−", x: 10, y: 32, size: 8.5 }
    ]
  },
  {
    id: "ic", name: "Circuit Intégré (Générique)", cat: "Intégrés", prefix: "U", defaultValue: "NE555", defaultPkg: "SOIC-8",
    pins: [[-40, -30], [-40, -10], [-40, 10], [-40, 30], [40, 30], [40, 10], [40, -10], [40, -30]],
    ext: [-40, -45, 40, 45],
    primitives: [
      { op: "rect", x: -25, y: -40, w: 50, h: 80, r: 4, fill: true },
      { op: "arc", cx: 0, cy: -40, r: 8, start: 0, end: Math.PI },
      { op: "line", x1: -40, y1: -30, x2: -25, y2: -30 },
      { op: "line", x1: -40, y1: -10, x2: -25, y2: -10 },
      { op: "line", x1: -40, y1: 10, x2: -25, y2: 10 },
      { op: "line", x1: -40, y1: 30, x2: -25, y2: 30 },
      { op: "line", x1: 25, y1: -30, x2: 40, y2: -30 },
      { op: "line", x1: 25, y1: -10, x2: 40, y2: -10 },
      { op: "line", x1: 25, y1: 10, x2: 40, y2: 10 },
      { op: "line", x1: 25, y1: 30, x2: 40, y2: 30 },
      { op: "text", text: "CI", x: 0, y: 0, size: 12 }
    ]
  },
  {
    id: "regulator", name: "Régulateur de tension", cat: "Intégrés", prefix: "U", defaultValue: "AMS1117", defaultPkg: "SOT-223",
    pins: [[-60, 0], [60, 0], [0, 60]], ext: [-60, -25, 60, 60],
    primitives: [
      { op: "rect", x: -40, y: -25, w: 80, h: 50, r: 4, fill: true },
      { op: "line", x1: -60, y1: 0, x2: -40, y2: 0 },
      { op: "line", x1: 40, y1: 0, x2: 60, y2: 0 },
      { op: "line", x1: 0, y1: 25, x2: 0, y2: 60 },
      { op: "text", text: "REG", x: 0, y: 0, size: 12 }
    ]
  },

  // Alimentation & Raccordement
  {
    id: "vcc", name: "Alimentation (VCC)", cat: "Alimentation", prefix: "#", defaultValue: "3.3V", defaultPkg: "",
    pins: [[0, 20]], ext: [-20, -10, 20, 20],
    primitives: [
      { op: "line", x1: 0, y1: 20, x2: 0, y2: -10 },
      { op: "line", x1: -20, y1: -10, x2: 20, y2: -10, width: 4.5 }
    ]
  },
  {
    id: "gnd", name: "Masse (GND)", cat: "Alimentation", prefix: "#", defaultValue: "GND", defaultPkg: "",
    pins: [[0, -20]], ext: [-20, -20, 20, 10],
    primitives: [
      { op: "line", x1: 0, y1: -20, x2: 0, y2: 0 },
      { op: "line", x1: -20, y1: 0, x2: 20, y2: 0, width: 4.5 },
      { op: "line", x1: -10, y1: 5, x2: 10, y2: 5 },
      { op: "line", x1: -5, y1: 10, x2: 5, y2: 10 }
    ]
  },
  {
    id: "battery", name: "Pile / Batterie", cat: "Alimentation", prefix: "BT", defaultValue: "3V", defaultPkg: "",
    pins: [[0, -40], [0, 40]], ext: [-20, -40, 20, 40],
    primitives: [
      { op: "line", x1: 0, y1: -40, x2: 0, y2: -15 },
      { op: "line", x1: 0, y1: 15, x2: 0, y2: 40 },
      { op: "line", x1: -20, y1: -15, x2: 20, y2: -15, width: 4.5 },
      { op: "line", x1: -10, y1: -5, x2: 10, y2: -5 },
      { op: "line", x1: -20, y1: 5, x2: 20, y2: 5 },
      { op: "line", x1: -10, y1: 15, x2: 10, y2: 15 }
    ]
  },

  // Divers & Connectique
  {
    id: "switch", name: "Interrupteur", cat: "Divers", prefix: "SW", defaultValue: "SPST", defaultPkg: "0603",
    pins: [[-40, 0], [40, 0]], ext: [-40, -25, 40, 15],
    primitives: [
      { op: "line", x1: -40, y1: 0, x2: -20, y2: 0 },
      { op: "line", x1: 20, y1: 0, x2: 40, y2: 0 },
      { op: "circle", x: -20, y: 0, r: 5, fill: true },
      { op: "circle", x: 20, y: 0, r: 5, fill: true },
      { op: "line", x1: -15, y1: -5, x2: 20, y2: -20 }
    ]
  },
  {
    id: "button", name: "Bouton Poussoir", cat: "Divers", prefix: "SW", defaultValue: "PUSH", defaultPkg: "0603",
    pins: [[-40, 0], [40, 0]], ext: [-40, -30, 40, 10],
    primitives: [
      { op: "line", x1: -40, y1: 0, x2: -20, y2: 0 },
      { op: "line", x1: -20, y1: 0, x2: -20, y2: -10 },
      { op: "line", x1: 40, y1: 0, x2: 20, y2: 0 },
      { op: "line", x1: 20, y1: 0, x2: 20, y2: -10 },
      { op: "line", x1: -25, y1: -15, x2: 25, y2: -15 },
      { op: "line", x1: 0, y1: -15, x2: 0, y2: -25 },
      { op: "line", x1: -10, y1: -25, x2: 10, y2: -25 }
    ]
  },
  {
    id: "relay", name: "Relais", cat: "Divers", prefix: "K", defaultValue: "5V", defaultPkg: "DIP-8",
    pins: [[-60, -20], [-60, 20], [60, -40], [60, 0], [60, 40]], ext: [-60, -50, 60, 50],
    primitives: [
      { op: "rect", x: -40, y: -50, w: 80, h: 100, r: 4, fill: true },
      { op: "line", x1: -60, y1: -20, x2: -40, y2: -20 },
      { op: "line", x1: -60, y1: 20, x2: -40, y2: 20 },
      { op: "line", x1: 60, y1: -40, x2: 40, y2: -40 },
      { op: "line", x1: 60, y1: 0, x2: 40, y2: 0 },
      { op: "line", x1: 60, y1: 40, x2: 40, y2: 40 },
      { op: "text", text: "RELAIS", x: 0, y: 0, size: 10 }
    ]
  },
  {
    id: "header", name: "Connecteur 2 broches", cat: "Divers", prefix: "J", defaultValue: "CONN", defaultPkg: "HEADER-2.54-1x2",
    pins: [[-40, -20], [-40, 20]], ext: [-40, -35, 20, 35],
    primitives: [
      { op: "line", x1: -40, y1: -20, x2: -15, y2: -20 },
      { op: "line", x1: -40, y1: 20, x2: -15, y2: 20 },
      { op: "rect", x: -15, y: -35, w: 30, h: 70, r: 3, fill: true }
    ]
  },
  {
    id: "header_1x3", name: "Barrette 1x3", cat: "Divers", prefix: "J", defaultValue: "CONN3", defaultPkg: "HEADER-2.54-1x3",
    pins: [[-40, -20], [-40, 0], [-40, 20]], ext: [-40, -35, 20, 35],
    primitives: [
      { op: "line", x1: -40, y1: -20, x2: -15, y2: -20 },
      { op: "line", x1: -40, y1: 0, x2: -15, y2: 0 },
      { op: "line", x1: -40, y1: 20, x2: -15, y2: 20 },
      { op: "rect", x: -15, y: -35, w: 30, h: 70, r: 3, fill: true }
    ]
  },
  {
    id: "header_1x4", name: "Barrette 1x4", cat: "Divers", prefix: "J", defaultValue: "CONN4", defaultPkg: "HEADER-2.54-1x4",
    pins: [[-40, -40], [-40, -20], [-40, 0], [-40, 20]], ext: [-40, -55, 20, 35],
    primitives: [
      { op: "line", x1: -40, y1: -40, x2: -15, y2: -40 },
      { op: "line", x1: -40, y1: -20, x2: -15, y2: -20 },
      { op: "line", x1: -40, y1: 0, x2: -15, y2: 0 },
      { op: "line", x1: -40, y1: 20, x2: -15, y2: 20 },
      { op: "rect", x: -15, y: -50, w: 30, h: 80, r: 3, fill: true }
    ]
  },
  {
    id: "header_1x6", name: "Barrette 1x6", cat: "Divers", prefix: "J", defaultValue: "CONN6", defaultPkg: "HEADER-2.54-1x6",
    pins: [[-40, -60], [-40, -40], [-40, -20], [-40, 0], [-40, 20], [-40, 40]], ext: [-40, -75, 20, 55],
    primitives: [
      { op: "rect", x: -15, y: -70, w: 30, h: 120, r: 3, fill: true }
    ]
  },
  {
    id: "header_2x5", name: "Barrette 2x5", cat: "Divers", prefix: "J", defaultValue: "CONN2x5", defaultPkg: "HEADER-2.54-2x5",
    pins: [[-40, -40], [-40, -20], [-40, 0], [-40, 20], [-40, 40], [40, -40], [40, -20], [40, 0], [40, 20], [40, 40]],
    ext: [-40, -55, 40, 55],
    primitives: [
      { op: "rect", x: -20, y: -50, w: 40, h: 100, r: 3, fill: true }
    ]
  },
  {
    id: "usb_c", name: "Connecteur USB Type-C", cat: "Divers", prefix: "J", defaultValue: "USB-C", defaultPkg: "USB-C-16P",
    pins: [[-40, -60], [-40, -40], [-40, -20], [-40, 0], [-40, 20], [-40, 40], [-40, 60], [-40, 80]],
    ext: [-40, -75, 35, 95],
    primitives: [
      { op: "rect", x: -20, y: -70, w: 50, h: 160, r: 6, fill: true },
      { op: "text", text: "USB-C", x: 8, y: -55, size: 9 }
    ]
  },
  {
    id: "testpoint", name: "Point de Test", cat: "Divers", prefix: "TP", defaultValue: "TP", defaultPkg: "TP-SMD",
    pins: [[0, 20]], ext: [-10, -5, 10, 20],
    primitives: [
      { op: "line", x1: 0, y1: 20, x2: 0, y2: 5 },
      { op: "circle", x: 0, y: 0, r: 5, fill: true }
    ]
  },
  {
    id: "testpoint_pth", name: "Point de Test Percé", cat: "Divers", prefix: "TP", defaultValue: "TP", defaultPkg: "Trou-metalise-1.2mm",
    pins: [[0, 20]], ext: [-10, -7, 10, 20],
    primitives: [
      { op: "line", x1: 0, y1: 20, x2: 0, y2: 7 },
      { op: "circle", x: 0, y: 0, r: 7, fill: true },
      { op: "circle", x: 0, y: 0, r: 3, fill: "hole" }
    ]
  },
  {
    id: "hole", name: "Trou mécanique", cat: "Divers", prefix: "MECA", defaultValue: "M3", defaultPkg: "",
    pins: [[0, 20]], ext: [-15, -15, 15, 20],
    primitives: [
      { op: "circle", x: 0, y: 0, r: 10, fill: false },
      { op: "line", x1: 0, y1: 10, x2: 0, y2: 20 }
    ]
  },
  {
    id: "antenna", name: "Antenne", cat: "Divers", prefix: "E", defaultValue: "ANT", defaultPkg: "SMA",
    pins: [[0, 40]], ext: [-25, -30, 25, 40],
    primitives: [
      { op: "line", x1: 0, y1: 40, x2: 0, y2: -10 },
      { op: "line", x1: 0, y1: -10, x2: -20, y2: -30 },
      { op: "line", x1: 0, y1: -10, x2: 20, y2: -30 }
    ]
  },
  {
    id: "buzzer", name: "Buzzer", cat: "Divers", prefix: "BZ", defaultValue: "5V", defaultPkg: "0805",
    pins: [[-40, 0], [40, 0]], ext: [-40, -20, 40, 20],
    primitives: [
      { op: "line", x1: -40, y1: 0, x2: -20, y2: 0 },
      { op: "line", x1: 40, y1: 0, x2: 20, y2: 0 },
      { op: "circle", x: 0, y: 0, r: 20, fill: true }
    ]
  },
  {
    id: "motor", name: "Moteur DC", cat: "Divers", prefix: "M", defaultValue: "DC", defaultPkg: "",
    pins: [[0, -40], [0, 40]], ext: [-20, -40, 20, 40],
    primitives: [
      { op: "line", x1: 0, y1: -40, x2: 0, y2: -20 },
      { op: "line", x1: 0, y1: 20, x2: 0, y2: 40 },
      { op: "circle", x: 0, y: 0, r: 20, fill: true },
      { op: "text", text: "M", x: 0, y: 0, size: 14 }
    ]
  }
];

let schCount = 0;
for (const sym of SCH_SYMBOLS) {
  const def = {
    format: "schsym-1",
    id: sym.id,
    name: sym.name,
    category: sym.cat,
    prefix: sym.prefix,
    defaultValue: sym.defaultValue || "",
    defaultPkg: sym.defaultPkg || "",
    pinCount: sym.pins.length,
    pins: sym.pins.map((p, i) => ({ n: i + 1, x: p[0], y: p[1] })),
    ext: sym.ext,
    primitives: sym.primitives
  };
  const filename = `${sym.id}.json`;
  fs.writeFileSync(path.join(SCH_DIR, filename), JSON.stringify(def, null, 2), "utf8");
  schCount++;
}
console.log(`[Schématique] ${schCount} symboles générés dans ${SCH_DIR}`);


/* ==========================================================================
   C. Création des modèles de simulation de base
   ========================================================================== */

const SIM_MODELS = [
  {
    name: "resistor.sub",
    content: `* Modele SPICE Resistance avec inductance parasite (ESL)
.subckt RESISTOR 1 2 PARAMS: R=10k Lpar=0.5nH
R1 1 3 {R}
L1 3 2 {Lpar}
.ends RESISTOR
`
  },
  {
    name: "capacitor.sub",
    content: `* Modele SPICE Condensateur reel avec ESR et ESL
.subckt CAPACITOR 1 2 PARAMS: C=100n ESR=0.05 ESL=1nH
C1 1 3 {C}
R_esr 3 4 {ESR}
L_esl 4 2 {ESL}
.ends CAPACITOR
`
  },
  {
    name: "inductor.sub",
    content: `* Modele SPICE Inductance avec resistance serie (DCR) et capacite parasite
.subckt INDUCTOR 1 2 PARAMS: L=10u DCR=0.1 Cpar=2pF
L1 1 3 {L}
R_dcr 3 2 {DCR}
C_par 1 2 {Cpar}
.ends INDUCTOR
`
  },
  {
    name: "diode.sub",
    content: `* Modele SPICE Diode standard 1N4148
.model 1N4148 D (Is=2.52n Rs=0.568 N=1.752 Cjo=4p M=0.333 Vj=0.75 Bv=100 Ibv=100u Tt=6n)
.subckt DIODE_STD 1 2
D1 1 2 1N4148
.ends DIODE_STD
`
  },
  {
    name: "bjt_npn.sub",
    content: `* Modele SPICE Transistor NPN petit signal (2N3904)
.model Q2N3904 NPN (Is=1E-14 Vaf=100 Bf=300 Ikf=0.4 Xtb=1.5 Br=4 Cjc=4p Cje=8p Rb=10 Rc=1)
.subckt BJT_NPN 1 2 3
* 1=Collecteur, 2=Base, 3=Emetteur
Q1 1 2 3 Q2N3904
.ends BJT_NPN
`
  },
  {
    name: "bjt_pnp.sub",
    content: `* Modele SPICE Transistor PNP petit signal (2N3906)
.model Q2N3906 PNP (Is=1.4E-14 Vaf=100 Bf=180 Ikf=0.4 Xtb=1.5 Br=3 Cjc=4.5p Cje=10p Rb=10 Rc=1)
.subckt BJT_PNP 1 2 3
* 1=Collecteur, 2=Base, 3=Emetteur
Q1 1 2 3 Q2N3906
.ends BJT_PNP
`
  },
  {
    name: "mosfet_n.sub",
    content: `* Modele SPICE MOSFET Canal N
.model NMOS_STD NMOS (Level=1 Vto=1.5 Kp=20u Gamma=0.37 Phi=0.65 Lambda=0.02)
.subckt NMOS_3PIN 1 2 3
* 1=Drain, 2=Grille, 3=Source
M1 1 2 3 3 NMOS_STD W=100u L=1u
.ends NMOS_3PIN
`
  },
  {
    name: "opamp_ideal.sub",
    content: `* Modele SPICE AOP Ideal avec gain fini et poles
.subckt OPAMP_IDEAL 1 2 3 4 5
* 1:In+  2:In-  3:VCC  4:VEE  5:Out
E1 6 0 1 2 100000
R1 6 7 1k
C1 7 0 1.59u
E2 5 0 7 0 1
.ends OPAMP_IDEAL
`
  },
  {
    name: "README.md",
    content: `# Bibliothèque de modèles de simulation (SPICE)
Ce dossier contient les modèles et sous-circuits SPICE (.sub, .cir, .sp) associés aux composants du catalogue CAO Web.
Chaque modèle peut être référencé dans la colonne « Modèle Simulation » de LIB_composants.csv.
`
  }
];

for (const m of SIM_MODELS) {
  fs.writeFileSync(path.join(SIM_DIR, m.name), m.content, "utf8");
}
console.log(`[Simulation] ${SIM_MODELS.length} modèles générés dans ${SIM_DIR}`);


/* ==========================================================================
   D. Lecture du CSV existant, ajout des 3 colonnes et auto-association
   ========================================================================== */

function parseCSVLine(text) {
  const result = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (inQuotes) {
      if (char === '"') {
        if (i + 1 < text.length && text[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ';') {
        result.push(cur);
        cur = "";
      } else {
        cur += char;
      }
    }
  }
  result.push(cur);
  return result;
}

function escapeCSVField(str) {
  if (str === null || str === undefined) return "";
  const s = String(str);
  if (s.includes(';') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

const rawCsvPath = path.join(ROOT, 'LIB_composants.csv');
let csvContent = "";
if (fs.existsSync(rawCsvPath)) {
  csvContent = fs.readFileSync(rawCsvPath, 'latin1'); // Le CSV original est en latin1
} else {
  console.error("Fichier LIB_composants.csv introuvable !");
  process.exit(1);
}

const lines = csvContent.split(/\r?\n/).filter(l => l.trim().length > 0);
if (lines.length < 2) {
  console.error("CSV vide ou incomplet !");
  process.exit(1);
}

const headerCols = parseCSVLine(lines[0]).map(h => h.trim());
console.log("En-tête actuel :", headerCols.length, "colonnes");

// Vérifier si les colonnes existent déjà
let idxPcb = headerCols.indexOf("Empreinte PCB");
let idxSch = headerCols.indexOf("Empreinte Schématique");
if (idxSch === -1) idxSch = headerCols.indexOf("Empreinte Schematique");
let idxSim = headerCols.indexOf("Modèle Simulation");
if (idxSim === -1) idxSim = headerCols.indexOf("Modele Simulation");

const hasNewCols = (idxPcb !== -1 && idxSch !== -1 && idxSim !== -1);

if (!hasNewCols) {
  headerCols.push("Empreinte PCB", "Empreinte Schématique", "Modèle Simulation");
  idxPcb = headerCols.length - 3;
  idxSch = headerCols.length - 2;
  idxSim = headerCols.length - 1;
}

const pcbFiles = fs.readdirSync(PCB_DIR).filter(f => f.endsWith(".json"));
const schFiles = fs.readdirSync(SCH_DIR).filter(f => f.endsWith(".json"));
const simFiles = fs.readdirSync(SIM_DIR).filter(f => f.endsWith(".sub"));

// Dictionnaire de correspondances
function devinerEmpreintePCB(pkgRaw, prefixRaw, descRaw) {
  const pkg = (pkgRaw || "").trim().toUpperCase();
  const desc = (descRaw || "").trim().toUpperCase();
  const prefix = (prefixRaw || "").trim().toUpperCase();

  // Test exact direct avec extension
  for (const f of pcbFiles) {
    const base = f.replace(/\.json$/i, "").toUpperCase();
    if (pkg === base) return f;
  }

  // Normalisation
  const clean = pkg.replace(/[^A-Z0-9]/g, "");
  if (!clean && prefix === "R") return "0603.json";
  if (!clean && prefix === "C") return "0603.json";

  if (clean.includes("0603")) return "0603.json";
  if (clean.includes("0805")) return "0805.json";
  if (clean.includes("0402")) return "0402.json";
  if (clean.includes("0201")) return "0201.json";
  if (clean.includes("1206")) return "1206.json";
  if (clean.includes("1210")) return "1210.json";
  if (clean.includes("1812")) return "1812.json";
  if (clean.includes("2512")) return "2512.json";

  if (clean.includes("SOD123") || clean.includes("SOD-123")) return "SOD-123.json";
  if (clean.includes("SOD323") || clean.includes("SOD-323")) return "SOD-323.json";
  if (clean.includes("SOD523") || clean.includes("SOD-523")) return "SOD-523.json";

  if (clean.includes("SOT236") || clean.includes("SOT-23-6") || clean.includes("TSOP6") || clean.includes("TSOP-6")) return "SOT-23-6.json";
  if (clean.includes("SOT235") || clean.includes("SOT-23-5") || clean.includes("SOT3235L")) return "SOT-23-5.json";
  if (clean.includes("SOT23") || clean.includes("SOT-23")) return "SOT-23.json";
  if (clean.includes("SOT89")) return "SOT-89.json";
  if (clean.includes("SOT223")) return "SOT-223.json";
  if (clean.includes("SC70")) return "SC-70.json";

  if (clean.includes("TO252") || clean.includes("DPAK")) return "TO-252.json";
  if (clean.includes("TO263") || clean.includes("D2PAK")) return "TO-263.json";
  if (clean.includes("TO92")) return "TO-92.json";
  if (clean.includes("TO220")) return "TO-220.json";
  if (clean.includes("TO247")) return "TO-247.json";

  if (clean.includes("SOIC8") || clean.includes("SO8") || clean.includes("SOP8")) return "SOIC-8.json";
  if (clean.includes("SOIC14") || clean.includes("SOP14")) return "SOIC-14.json";
  if (clean.includes("SOIC16") || clean.includes("SOP16")) return "SOIC-16.json";
  if (clean.includes("SOIC20") || clean.includes("SOP20")) return "SOIC-20.json";
  if (clean.includes("SOIC24") || clean.includes("SOP24")) return "SOIC-24.json";
  if (clean.includes("SOIC28") || clean.includes("SOP28")) return "SOIC-28.json";

  if (clean.includes("TSSOP8")) return "TSSOP-8.json";
  if (clean.includes("TSSOP14")) return "TSSOP-14.json";
  if (clean.includes("TSSOP16")) return "TSSOP-16.json";
  if (clean.includes("TSSOP20")) return "TSSOP-20.json";
  if (clean.includes("TSSOP24")) return "TSSOP-24.json";
  if (clean.includes("TSSOP28")) return "TSSOP-28.json";
  if (clean.includes("MSOP8")) return "MSOP-8.json";
  if (clean.includes("MSOP10")) return "MSOP-10.json";

  if (clean.includes("DIP8")) return "DIP-8.json";
  if (clean.includes("DIP14")) return "DIP-14.json";
  if (clean.includes("DIP16")) return "DIP-16.json";
  if (clean.includes("DIP28")) return "DIP-28.json";
  if (clean.includes("DIP40")) return "DIP-40.json";

  if (clean.includes("QFN24") || clean.includes("QFN-24")) return "QFN-24.json";
  if (clean.includes("QFN16") || clean.includes("QFN-16")) return "QFN-16.json";
  if (clean.includes("QFN32") || clean.includes("QFN-32")) return "QFN-32.json";
  if (clean.includes("QFN48") || clean.includes("QFN-48")) return "QFN-48.json";
  if (clean.includes("LQFP48") || clean.includes("LFQFP48")) return "LQFP-48.json";
  if (clean.includes("LQFP64")) return "LQFP-64.json";
  if (clean.includes("TQFP32")) return "TQFP-32.json";
  if (clean.includes("TQFP44")) return "TQFP-44.json";

  if (clean.includes("SMA")) return "SMA.json";
  if (clean.includes("SMB")) return "SMB.json";
  if (clean.includes("SMC")) return "SMC.json";

  if (clean.includes("USBC")) return "USB-C-16P.json";
  if (clean.includes("HEADER") || clean.includes("BARRETTE")) return "HEADER-2.54-1x2.json";

  return "";
}

function devinerSymboleSchematique(prefixRaw, descRaw, valRaw) {
  const p = (prefixRaw || "").trim().toUpperCase();
  const desc = (descRaw || "").trim().toUpperCase();

  if (p === "R") return "resistor.json";
  if (p === "RV") return "potentiometer.json";
  if (p === "C") {
    if (desc.includes("ELECTRO") || desc.includes("CHIMIQUE") || desc.includes("POLARIS") || desc.includes("TANTAL")) {
      return "cap_pol.json";
    }
    return "capacitor.json";
  }
  if (p === "L") {
    if (desc.includes("FERRITE") || desc.includes("BEAD")) return "ferrite_bead.json";
    return "inductor.json";
  }
  if (p === "FB") return "ferrite_bead.json";
  if (p === "D" || p === "LED" || p === "ESD") {
    if (desc.includes("LED") || p === "LED") return "led.json";
    if (desc.includes("ZENER")) return "zener.json";
    if (desc.includes("SCHOTTKY")) return "schottky.json";
    if (desc.includes("TVS") || desc.includes("ESD")) return "tvs_diode.json";
    return "diode.json";
  }
  if (p === "Q") {
    if (desc.includes("MOSFET") || desc.includes("NMOS") || desc.includes("N-CHANNEL")) return "nmos.json";
    if (desc.includes("PMOS") || desc.includes("P-CHANNEL")) return "pmos.json";
    if (desc.includes("PNP")) return "pnp.json";
    return "npn.json";
  }
  if (p === "U" || p === "IC") {
    if (desc.includes("AMPLI") || desc.includes("OPAMP") || desc.includes("AOP")) return "opamp.json";
    if (desc.includes("REGULAT") || desc.includes("LDO")) return "regulator.json";
    return "ic.json";
  }
  if (p === "SW") {
    if (desc.includes("PUSH") || desc.includes("POUSSOIR") || desc.includes("TACT")) return "button.json";
    return "switch.json";
  }
  if (p === "K" || desc.includes("RELAIS") || desc.includes("RELAY")) return "relay.json";
  if (p === "J" || p === "JP" || p === "CONN" || p === "HRS") {
    if (desc.includes("USB-C") || desc.includes("TYPE-C")) return "usb_c.json";
    return "header.json";
  }
  if (p === "TP" || p === "PTST") return "testpoint.json";
  if (p === "F") return "fuse.json";
  if (p === "Y") return "crystal.json";
  if (p === "BT" || p === "BATT" || p === "HLC") return "battery.json";
  if (p === "MECA" || p === "LOC") return "hole.json";
  if (p === "E" || p === "A" || p === "ANT") return "antenna.json";
  if (p === "BZ") return "buzzer.json";
  if (p === "M") return desc.includes("MOTEUR") ? "motor.json" : "hole.json";

  return "ic.json";
}

function devinerModeleSimulation(schSym) {
  if (!schSym) return "";
  const base = schSym.replace(/\.json$/i, "");
  if (base === "resistor" || base === "potentiometer") return "resistor.sub";
  if (base === "capacitor" || base === "cap_pol") return "capacitor.sub";
  if (base === "inductor" || base === "ferrite_bead") return "inductor.sub";
  if (base === "diode" || base === "led" || base === "zener" || base === "schottky" || base === "tvs_diode") return "diode.sub";
  if (base === "npn") return "bjt_npn.sub";
  if (base === "pnp") return "bjt_pnp.sub";
  if (base === "nmos") return "mosfet_n.sub";
  if (base === "pmos") return "mosfet_p.sub";
  if (base === "opamp") return "opamp_ideal.sub";
  return "";
}

const newRows = [];
let autoPcbCount = 0;
let autoSchCount = 0;
let autoSimCount = 0;

for (let i = 1; i < lines.length; i++) {
  const row = parseCSVLine(lines[i]);
  // Étendre la ligne si besoin
  while (row.length < headerCols.length) {
    row.push("");
  }

  const prefix = row[4] || "";
  const desc = row[2] || "";
  const val = row[8] || "";
  const pkg = row[31] || "";

  // Auto-association si la cellule est vide
  if (!row[idxPcb]) {
    const pcbGuess = devinerEmpreintePCB(pkg, prefix, desc);
    if (pcbGuess) {
      row[idxPcb] = pcbGuess;
      autoPcbCount++;
    }
  }
  if (!row[idxSch]) {
    const schGuess = devinerSymboleSchematique(prefix, desc, val);
    if (schGuess) {
      row[idxSch] = schGuess;
      autoSchCount++;
    }
  }
  if (!row[idxSim]) {
    const simGuess = devinerModeleSimulation(row[idxSch]);
    if (simGuess) {
      row[idxSim] = simGuess;
      autoSimCount++;
    }
  }

  newRows.push(row);
}

// Réassemblage du CSV avec encodage UTF-8 propre
const csvOutputLines = [
  headerCols.map(escapeCSVField).join(";")
];

for (const r of newRows) {
  csvOutputLines.push(r.map(escapeCSVField).join(";"));
}

const finalCsvContent = csvOutputLines.join("\r\n");

// Sauvegarde dans LIB/LIB_composants.csv (fichier canonique)
const targetLibCsv = path.join(LIB_DIR, "LIB_composants.csv");
fs.writeFileSync(targetLibCsv, finalCsvContent, "utf8");

// Mise à jour de la racine également pour compatibilité transparente (si non verrouillé par Excel)
try {
  fs.writeFileSync(rawCsvPath, finalCsvContent, "utf8");
} catch (err) {
  console.warn(`[Avertissement] Le fichier racine ${rawCsvPath} n'a pas pu être écrasé (probablement ouvert dans Excel ou un éditeur). Le fichier canonique dans LIB/ a bien été mis à jour.`);
}

console.log(`[CSV] Traitement terminé avec succès :`);
console.log(`  - Total composants : ${newRows.length}`);
console.log(`  - Empreintes PCB associées : ${autoPcbCount}`);
console.log(`  - Symboles schématiques associés : ${autoSchCount}`);
console.log(`  - Modèles simulation associés : ${autoSimCount}`);
console.log(`  - Fichiers écrits : ${targetLibCsv} et ${rawCsvPath}`);
