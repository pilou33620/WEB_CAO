"use strict";
/* =============================================================================
   Lecture du catalogue LIB_composants.csv, partagée par l'éditeur schématique
   (js/18-csv.js) et la Gestion LIB (js/01-donnees.js) : séparateur « ; »,
   guillemets doublés, champ sur plusieurs lignes, BOM d'Excel.
   ============================================================================= */

/* Où chercher le fichier quand l'API /api/lib/composants ne répond pas
   (page servie en statique), dans cet ordre. */
const CSV_LIB_REPLIS = [
  "../LIB/LIB_composants.csv",
  "../../LIB/LIB_composants.csv",
  "/LIB/LIB_composants.csv",
  "../LIB_composants.csv",
  "../../LIB_composants.csv",
  "/LIB_composants.csv"
];

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

// Lignes logiques du CSV : un champ entre guillemets peut contenir un saut de
// ligne (telechargerCsv en écrit), et le BOM d'un fichier enregistré par Excel
// collait au premier en-tête (« \uFEFFPart Name » introuvable).
function csvLignes(text) {
  text = String(text || "").replace(/^\uFEFF/, "");
  const out = [];
  let cur = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') q = !q;
    if (!q && (c === "\n" || c === "\r")) {
      if (c === "\r" && text[i + 1] === "\n") i++;
      out.push(cur); cur = "";
      continue;
    }
    cur += c;
  }
  out.push(cur);
  return out;
}
