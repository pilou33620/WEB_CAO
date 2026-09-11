"use strict";
/* =============================================================================
   Gestion LIB — 06-ia-lib.js
   Mode Assistant IA pour la bibliothèque CAO (Empreintes, Symboles, Catalogue)
   Support des modèles Google AI Studio (Gemini 2.5 Flash, Pro, Gemma 4)
   ============================================================================= */

const IA_LIB = {
  ouvert: false,
  cleApi: "",
  modele: "gemini-2.5-flash",
  onglet: "chat", // "chat" | "pcb" | "sch" | "cat"
  historique: [],
  enAttente: false
};

/**
 * Initialisation de l'assistant IA
 */
async function initIaLib() {
  // 1. Tenter de charger la clé locale depuis le serveur
  try {
    const res = await apiGet("/api/ia/cle");
    if (res && res.dispo && res.cle) {
      IA_LIB.cleApi = res.cle;
      majPilluleCle();
    }
  } catch (_) {
    // Si route non dispo, repli sur sessionStorage
    const stocke = sessionStorage.getItem("cao_ia_cle");
    if (stocke) {
      IA_LIB.cleApi = stocke;
      majPilluleCle();
    }
  }

  // Écouteur sur le sélecteur de modèle
  const selMod = document.getElementById("iaModelSelect");
  if (selMod) {
    selMod.value = IA_LIB.modele;
    selMod.addEventListener("change", () => {
      IA_LIB.modele = selMod.value;
    });
  }

  // Message d'accueil par défaut si historique vide
  if (IA_LIB.historique.length === 0) {
    IA_LIB.historique.push({
      role: "assistant",
      texte: "Bonjour ! Je suis votre **Assistant IA spécialisé en bibliothèques CAO**. Je peux :\n\n" +
             "• **📐 Générer ou corriger des empreintes PCB** (QFN, BGA, CMS, SOIC, pastilles thermiques conformes IPC-7351).\n" +
             "• **⚡ Créer ou corriger des symboles schématiques** (brochage CI, passifs, connecteurs, disposition logique).\n" +
             "• **📋 Auditer et enrichir votre catalogue CSV** (compléter descriptions, MPN, boîtiers, associations).\n\n" +
             "Sélectionnez un raccourci ci-dessous ou décrivez votre besoin technique !"
    });
    rendreMessagesIa();
  }
}

function iaLibBasculer() {
  if (IA_LIB.ouvert) iaLibFermer();
  else iaLibOuvrir();
}

function iaLibOuvrir() {
  const panel = document.getElementById("panelIaLib");
  if (panel) {
    panel.classList.add("open");
    IA_LIB.ouvert = true;
    const btn = document.getElementById("bModeIaLib");
    if (btn) btn.classList.add("on");
    majPilluleCle();
    setTimeout(() => {
      const inp = document.getElementById("iaPromptInput");
      if (inp) inp.focus();
    }, 150);
  }
}

function iaLibFermer() {
  const panel = document.getElementById("panelIaLib");
  if (panel) {
    panel.classList.remove("open");
    IA_LIB.ouvert = false;
    const btn = document.getElementById("bModeIaLib");
    if (btn) btn.classList.remove("on");
  }
}

function majPilluleCle() {
  const pill = document.getElementById("iaKeyPill");
  if (!pill) return;
  if (IA_LIB.cleApi) {
    pill.className = "ia-key-pill";
    pill.textContent = "✓ Clé active";
    pill.title = "Clé Google AI Studio configurée. Cliquez pour modifier.";
  } else {
    pill.className = "ia-key-pill missing";
    pill.textContent = "🔑 Saisir clé";
    pill.title = "Cliquez pour renseigner votre clé d'API Google AI Studio";
  }
}

function demanderCleApi() {
  const saisie = prompt(
    "Veuillez saisir votre clé d'API Google AI Studio (Gemini / Gemma) :\n(Elle sera conservée uniquement pour cette session de navigation)",
    IA_LIB.cleApi || ""
  );
  if (saisie !== null) {
    IA_LIB.cleApi = saisie.trim();
    if (IA_LIB.cleApi) {
      sessionStorage.setItem("cao_ia_cle", IA_LIB.cleApi);
      afficherToast("Clé API Google AI Studio enregistrée pour cette session", "success");
    } else {
      sessionStorage.removeItem("cao_ia_cle");
      afficherToast("Clé API effacée", "info");
    }
    majPilluleCle();
  }
}

/* ---------- Envoi de prompt à l'IA ---------- */
async function envoyerPromptIa(textePrompt = null) {
  if (IA_LIB.enAttente) return;

  const inp = document.getElementById("iaPromptInput");
  const texte = (textePrompt !== null ? textePrompt : (inp ? inp.value : "")).trim();
  if (!texte) return;

  if (!IA_LIB.cleApi) {
    demanderCleApi();
    if (!IA_LIB.cleApi) return;
  }

  if (inp && textePrompt === null) inp.value = "";

  // Ajouter message utilisateur
  IA_LIB.historique.push({ role: "user", texte });
  IA_LIB.enAttente = true;
  rendreMessagesIa();

  // Contexte actuel de la librairie
  const compActif = LIB_STATE.selection;
  let ctxLib = `STATISTIQUES DE LA BIBLIOTHÈQUE :\n- Composants catalogue : ${LIB_STATE.composants.length}\n` +
               `- Empreintes PCB existantes : ${LIB_STATE.fichiers.pcb.length}\n` +
               `- Symboles schématiques existants : ${LIB_STATE.fichiers.schematique.length}\n`;

  if (compActif) {
    ctxLib += `\nCOMPOSANT SÉLECTIONNÉ DANS L'INSPECTEUR :\n` +
              `- Part Name: ${compActif["Part Name"] || ""}\n` +
              `- Préfixe: ${compActif["Reference designator Prefix"] || ""}\n` +
              `- Boîtier: ${compActif["Package type"] || ""}\n` +
              `- Valeur: ${compActif["Value"] || ""}\n` +
              `- Description: ${compActif["Description"] || ""}\n` +
              `- Fabricant: ${compActif["Manufacturer"] || ""}\n` +
              `- Empreinte PCB associée: ${compActif["Empreinte PCB"] || "Aucune"}\n` +
              `- Empreinte Schéma associée: ${compActif["Empreinte Schématique"] || compActif["Empreinte Schematique"] || "Aucune"}\n`;
  }

  const promptSysteme = `Tu es l'expert d'élite en bibliothèques de composants électroniques et CAO Web (normes IPC-7351B pour les empreintes PCB, IEC 60617 / IEEE 315 pour les symboles schématiques, catalogue de pièces électroniques).
DIRECTIVES STRICTES :
1. Réponds toujours en français, avec concision, rigueur et professionnalisme.
2. Lorsque l'utilisateur demande de générer ou corriger une empreinte PCB, fournis TOUJOURS un bloc balisé \`\`\`action:pcb contenant le JSON conforme au format "pcbfp-1" :
\`\`\`action:pcb
{
  "format": "pcbfp-1",
  "name": "NOM_BOITIER",
  "pkg": "TYPE_BOITIER",
  "pins": 8,
  "style": "smd",
  "pitch": 1.27,
  "pads": [
    {"n": 1, "x": -2.7, "y": 1.905, "w": 1.5, "h": 0.6, "shape": "rect", "drill": 0, "rot": 0}
  ],
  "body": {"x1": -2.0, "y1": -2.5, "x2": 2.0, "y2": 2.5},
  "description": "Description concise de l'empreinte"
}
\`\`\`

3. Lorsque l'utilisateur demande de générer ou corriger un symbole schématique, fournis TOUJOURS un bloc balisé \`\`\`action:sch contenant le JSON conforme au format "schsym-1" :
\`\`\`action:sch
{
  "format": "schsym-1",
  "id": "id_symbole",
  "name": "Nom du composant",
  "category": "Intégrés",
  "prefix": "U",
  "defaultValue": "LM358",
  "defaultPkg": "SOIC-8",
  "pinCount": 8,
  "pins": [
    {"n": 1, "x": -40, "y": -20},
    {"n": 2, "x": -40, "y": 0}
  ],
  "ext": [-40, -30, 40, 30],
  "primitives": [
    {"op": "rect", "x": -25, "y": -30, "w": 50, "h": 60, "r": 3, "fill": true}
  ]
}
\`\`\`

4. Lorsque l'utilisateur demande de créer ou enrichir un composant du catalogue CSV, fournis un bloc balisé \`\`\`action:comp :
\`\`\`action:comp
{
  "Part Name": "NOM_PIECE",
  "Reference designator Prefix": "U",
  "Package type": "SOIC-8",
  "Value": "100k",
  "Description": "Description technique complète",
  "Manufacturer": "Fabricant",
  "Empreinte PCB": "SOIC-8.json",
  "Empreinte Schématique": "opamp.json"
}
\`\`\`

5. Sois direct, pas de blabla inutile, explique brièvement les choix de dimensions en millimètres (pitch, pads).`;

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(IA_LIB.modele)}:generateContent?key=${encodeURIComponent(IA_LIB.cleApi)}`;

    const contents = [
      {
        role: "user",
        parts: [{ text: promptSysteme + "\n\n" + ctxLib + "\n\nDemande utilisateur :\n" + texte }]
      }
    ];

    const bodyPayload = {
      contents,
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 4096
      }
    };

    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(bodyPayload)
    });

    if (!resp.ok) {
      let errTxt = "Erreur HTTP " + resp.status;
      try {
        const j = await resp.json();
        if (j.error && j.error.message) errTxt = j.error.message;
      } catch (_) {}
      throw new Error(errTxt);
    }

    const donnees = await resp.json();
    let reponse = "";
    if (donnees.candidates && donnees.candidates[0] && donnees.candidates[0].content && donnees.candidates[0].content.parts) {
      reponse = donnees.candidates[0].content.parts.map(p => p.text || "").join("");
    }

    if (!reponse) reponse = "(Aucune réponse textuelle reçue du modèle)";

    IA_LIB.historique.push({ role: "assistant", texte: reponse });
  } catch (err) {
    IA_LIB.historique.push({
      role: "assistant",
      texte: `⚠️ **Erreur lors de l'appel IA** : ${err.message}\n\n*Vérifiez votre clé API Google AI Studio ou choisissez un autre modèle.*`
    });
  } finally {
    IA_LIB.enAttente = false;
    rendreMessagesIa();
  }
}

/* ---------- Rendu des messages et cartes interactives ---------- */
function rendreMessagesIa() {
  const cont = document.getElementById("iaChatMessages");
  if (!cont) return;

  cont.innerHTML = "";

  IA_LIB.historique.forEach((msg, idx) => {
    const el = document.createElement("div");
    el.className = `ia-msg ${msg.role}`;

    if (msg.role === "user") {
      el.textContent = msg.texte;
    } else {
      // Rendu avec détection des blocs d'action
      el.innerHTML = formaterMessageIa(msg.texte, idx);
    }
    cont.appendChild(el);
  });

  // Si en attente
  if (IA_LIB.enAttente) {
    const att = document.createElement("div");
    att.className = "ia-msg assistant";
    att.innerHTML = "<em>✨ L'IA analyse votre demande et génère la solution...</em>";
    cont.appendChild(att);
  }

  cont.scrollTop = cont.scrollHeight;

  // Initialiser les mini-canvas d'action après injection dans le DOM
  initialiserMiniCanvasActions();
}

function formaterMessageIa(texte, msgIdx) {
  if (!texte) return "";

  // 1. Extraire les blocs d'action ```action:pcb, ```action:sch, ```action:comp
  const actionsPcb = [];
  const actionsSch = [];
  const actionsComp = [];

  let formatted = texte;

  // PCB Footprint
  formatted = formatted.replace(/```action:pcb\n([\s\S]*?)```/g, (_, code) => {
    const actIdx = actionsPcb.length;
    actionsPcb.push({ code: code.trim(), msgIdx, actIdx });
    return `%%%ACTION_PCB_${msgIdx}_${actIdx}%%%`;
  });

  // Schematic Symbol
  formatted = formatted.replace(/```action:sch\n([\s\S]*?)```/g, (_, code) => {
    const actIdx = actionsSch.length;
    actionsSch.push({ code: code.trim(), msgIdx, actIdx });
    return `%%%ACTION_SCH_${msgIdx}_${actIdx}%%%`;
  });

  // Component Catalog
  formatted = formatted.replace(/```action:comp\n([\s\S]*?)```/g, (_, code) => {
    const actIdx = actionsComp.length;
    actionsComp.push({ code: code.trim(), msgIdx, actIdx });
    return `%%%ACTION_COMP_${msgIdx}_${actIdx}%%%`;
  });

  // Code Markdown standard
  formatted = formatted.replace(/```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g, (_, lang, code) => {
    return `<pre><code>${escapeHtml(code.trim())}</code></pre>`;
  });

  // Markdown simple (titres, puces, gras)
  formatted = formatted
    .replace(/^### (.*$)/gim, "<b>$1</b>")
    .replace(/^## (.*$)/gim, "<b style='color:var(--yellow);'>$1</b>")
    .replace(/^\* (.*$)/gim, "• $1<br>")
    .replace(/\*\*(.*?)\*\*/g, "<b>$1</b>")
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\n\n/g, "<br><br>");

  // Réinsérer les cartes d'action avec mini canvas
  actionsPcb.forEach(act => {
    const placeholder = `%%%ACTION_PCB_${act.msgIdx}_${act.actIdx}%%%`;
    let parsedData = null;
    try { parsedData = JSON.parse(act.code); } catch (_) {}
    const cardId = `ia_canvas_pcb_${act.msgIdx}_${act.actIdx}`;
    const dataB64 = btoa(unescape(encodeURIComponent(act.code)));
    const nomSugg = (parsedData && parsedData.name) ? `${parsedData.name}.json` : "empreinte_ia.json";

    const htmlCard = `
      <div class="ia-action-card">
        <div class="ia-action-head">
          <span>📐 Empreinte PCB générée : ${escapeHtml(nomSugg)}</span>
          <span style="font-family:var(--mono); font-size:10px; color:var(--txt-dim);">${parsedData ? (parsedData.pins || (parsedData.pads ? parsedData.pads.length : 0)) : 0} pastilles</span>
        </div>
        <div class="ia-mini-canvas-wrap">
          <canvas id="${cardId}"></canvas>
        </div>
        <div class="ia-action-btns">
          <button class="tb mini" onclick="iaOuvrirDansEditeurPcb('${dataB64}', '${escapeHtml(nomSugg)}')">👁 Ouvrir dans l'éditeur</button>
          <button class="tb mini success" onclick="iaEnregistrerDirectPcb('${dataB64}', '${escapeHtml(nomSugg)}')">💾 Enregistrer dans la LIB</button>
        </div>
      </div>
    `;
    formatted = formatted.replace(placeholder, htmlCard);
  });

  actionsSch.forEach(act => {
    const placeholder = `%%%ACTION_SCH_${act.msgIdx}_${act.actIdx}%%%`;
    let parsedData = null;
    try { parsedData = JSON.parse(act.code); } catch (_) {}
    const cardId = `ia_canvas_sch_${act.msgIdx}_${act.actIdx}`;
    const dataB64 = btoa(unescape(encodeURIComponent(act.code)));
    const nomSugg = (parsedData && parsedData.id) ? `${parsedData.id}.json` : "symbole_ia.json";

    const htmlCard = `
      <div class="ia-action-card">
        <div class="ia-action-head">
          <span>⚡ Symbole Schématique généré : ${escapeHtml(nomSugg)}</span>
          <span style="font-family:var(--mono); font-size:10px; color:var(--txt-dim);">${parsedData ? (parsedData.pinCount || (parsedData.pins ? parsedData.pins.length : 0)) : 0} broches</span>
        </div>
        <div class="ia-mini-canvas-wrap">
          <canvas id="${cardId}"></canvas>
        </div>
        <div class="ia-action-btns">
          <button class="tb mini" onclick="iaOuvrirDansEditeurSch('${dataB64}', '${escapeHtml(nomSugg)}')">👁 Ouvrir dans l'éditeur</button>
          <button class="tb mini success" onclick="iaEnregistrerDirectSch('${dataB64}', '${escapeHtml(nomSugg)}')">💾 Enregistrer dans la LIB</button>
        </div>
      </div>
    `;
    formatted = formatted.replace(placeholder, htmlCard);
  });

  actionsComp.forEach(act => {
    const placeholder = `%%%ACTION_COMP_${act.msgIdx}_${act.actIdx}%%%`;
    const dataB64 = btoa(unescape(encodeURIComponent(act.code)));
    let parsedData = null;
    try { parsedData = JSON.parse(act.code); } catch (_) {}

    const htmlCard = `
      <div class="ia-action-card">
        <div class="ia-action-head">
          <span>📋 Fiche Composant Proposée</span>
          <span style="color:var(--green); font-size:11px;">Catalogue CSV</span>
        </div>
        <pre style="margin:0; font-size:11px; max-height:100px;">${escapeHtml(act.code)}</pre>
        <div class="ia-action-btns">
          <button class="tb mini primary" onclick="iaAppliquerAuCatalogue('${dataB64}')">⚡ Appliquer au catalogue</button>
        </div>
      </div>
    `;
    formatted = formatted.replace(placeholder, htmlCard);
  });

  return formatted;
}

function initialiserMiniCanvasActions() {
  document.querySelectorAll(".ia-mini-canvas-wrap canvas").forEach(cv => {
    const id = cv.id;
    if (id.startsWith("ia_canvas_pcb_")) {
      const parentCard = cv.closest(".ia-action-card");
      if (!parentCard) return;
      const btnOuvrir = parentCard.querySelector("button");
      if (btnOuvrir) {
        const m = btnOuvrir.getAttribute("onclick").match(/iaOuvrirDansEditeurPcb\('([^']+)'/);
        if (m && m[1]) {
          try {
            const rawJson = decodeURIComponent(escape(atob(m[1])));
            const data = JSON.parse(rawJson);
            const r = new PcbRenderer(cv);
            r.setFootprint(data);
          } catch (_) {}
        }
      }
    } else if (id.startsWith("ia_canvas_sch_")) {
      const parentCard = cv.closest(".ia-action-card");
      if (!parentCard) return;
      const btnOuvrir = parentCard.querySelector("button");
      if (btnOuvrir) {
        const m = btnOuvrir.getAttribute("onclick").match(/iaOuvrirDansEditeurSch\('([^']+)'/);
        if (m && m[1]) {
          try {
            const rawJson = decodeURIComponent(escape(atob(m[1])));
            const data = JSON.parse(rawJson);
            const r = new SymboleRenderer(cv);
            r.setSymbol(data);
          } catch (_) {}
        }
      }
    }
  });
}

/* ---------- Actions interactives déclenchées par l'IA ---------- */
function iaOuvrirDansEditeurPcb(dataB64, nomSugg) {
  try {
    const rawJson = decodeURIComponent(escape(atob(dataB64)));
    const data = JSON.parse(rawJson);
    if (typeof ouvrirEditeurPcb === "function") {
      ouvrirEditeurPcb(nomSugg, data);
    }
  } catch (e) {
    alert("Erreur lors de l'ouverture dans l'éditeur : " + e.message);
  }
}

async function iaEnregistrerDirectPcb(dataB64, nomSugg) {
  try {
    const rawJson = decodeURIComponent(escape(atob(dataB64)));
    const data = JSON.parse(rawJson);
    afficherToast(`Enregistrement de ${nomSugg}...`, "info");
    await sauvegarderFichierLib("pcb", nomSugg, data);
    afficherToast(`${nomSugg} enregistré avec succès dans LIB/lib_empreinte_pcb/`, "success");
    if (typeof rafraichirGaleriePcb === "function") rafraichirGaleriePcb();
    if (typeof rafraichirStats === "function") rafraichirStats();
  } catch (e) {
    alert("Erreur enregistrement empreinte : " + e.message);
  }
}

function iaOuvrirDansEditeurSch(dataB64, nomSugg) {
  try {
    const rawJson = decodeURIComponent(escape(atob(dataB64)));
    const data = JSON.parse(rawJson);
    if (typeof ouvrirEditeurSch === "function") {
      ouvrirEditeurSch(nomSugg, data);
    }
  } catch (e) {
    alert("Erreur lors de l'ouverture dans l'éditeur : " + e.message);
  }
}

async function iaEnregistrerDirectSch(dataB64, nomSugg) {
  try {
    const rawJson = decodeURIComponent(escape(atob(dataB64)));
    const data = JSON.parse(rawJson);
    afficherToast(`Enregistrement de ${nomSugg}...`, "info");
    await sauvegarderFichierLib("schematique", nomSugg, data);
    afficherToast(`${nomSugg} enregistré avec succès dans LIB/lib_empreinte_schematique/`, "success");
    if (typeof rafraichirGalerieSch === "function") rafraichirGalerieSch();
    if (typeof rafraichirStats === "function") rafraichirStats();
  } catch (e) {
    alert("Erreur enregistrement symbole : " + e.message);
  }
}

function iaAppliquerAuCatalogue(dataB64) {
  try {
    const rawJson = decodeURIComponent(escape(atob(dataB64)));
    const patch = JSON.parse(rawJson);

    if (LIB_STATE.selection) {
      // Mettre à jour le composant sélectionné
      const comp = LIB_STATE.selection;
      let modifs = 0;
      Object.keys(patch).forEach(k => {
        if (comp[k] !== patch[k]) {
          comp[k] = patch[k];
          modifs++;
        }
      });
      if (modifs > 0) {
        LIB_STATE.sale = true;
        afficherToast(`Composant ${comp["Part Name"]} mis à jour (${modifs} champs modifiés)`, "success");
        if (typeof rafraichirTout === "function") rafraichirTout();
        if (typeof selectionnerComposant === "function") selectionnerComposant(comp._id);
      } else {
        afficherToast("Aucune modification nécessaire", "info");
      }
    } else {
      // Ajouter comme nouveau composant
      const newComp = { _id: LIB_STATE.composants.length, ...patch };
      LIB_STATE.composants.unshift(newComp);
      LIB_STATE.sale = true;
      afficherToast(`Composant ${newComp["Part Name"] || ""} ajouté au catalogue`, "success");
      if (typeof rafraichirTout === "function") rafraichirTout();
      if (typeof selectionnerComposant === "function") selectionnerComposant(newComp._id);
    }
  } catch (e) {
    alert("Erreur lors de l'application au catalogue : " + e.message);
  }
}

/* ---------- Raccourcis de requêtes IA ---------- */
function iaActionRapide(action) {
  if (action === "pcb_qfn") {
    envoyerPromptIa("Génère une empreinte PCB pour un boîtier QFN-16 de taille 3x3 mm avec un pitch de 0.5 mm et un pad thermique central de 1.6x1.6 mm.");
  } else if (action === "pcb_corriger") {
    const nomPcb = (LIB_STATE.selection && LIB_STATE.selection["Empreinte PCB"]) ? LIB_STATE.selection["Empreinte PCB"] : "0603.json";
    envoyerPromptIa(`Analyse et optimise l'empreinte PCB "${nomPcb}". Vérifie les tolérances de soudure IPC et propose une version ajustée.`);
  } else if (action === "sch_ldo") {
    envoyerPromptIa("Génère un symbole schématique complet pour un régulateur de tension LDO 5 broches (VIN, GND, VOUT, EN, BYP).");
  } else if (action === "sch_corriger") {
    const nomSch = (LIB_STATE.selection && (LIB_STATE.selection["Empreinte Schématique"] || LIB_STATE.selection["Empreinte Schematique"])) ? (LIB_STATE.selection["Empreinte Schématique"] || LIB_STATE.selection["Empreinte Schematique"]) : "resistor.json";
    envoyerPromptIa(`Vérifie et améliore le symbole schématique "${nomSch}" en conformité avec la norme IEC 60617.`);
  } else if (action === "cat_completer") {
    if (!LIB_STATE.selection) {
      afficherToast("Veuillez d'abord sélectionner un composant dans la table", "warn");
      return;
    }
    const c = LIB_STATE.selection;
    envoyerPromptIa(`Complète les métadonnées manquantes pour le composant "${c["Part Name"]}" (description, fabricant, référence fabricant MPN, boîtier et associations d'empreintes recommandées).`);
  } else if (action === "cat_auditer") {
    envoyerPromptIa("Audite la cohérence des composants du catalogue. Identifie les discordances courantes entre boîtier et empreinte PCB (ex: boîtier 0603 avec empreinte 0805 ou SOIC) et liste tes recommandations.");
  }
}

// Initialisation globale au chargement
window.addEventListener("DOMContentLoaded", initIaLib);

// Export global
window.iaLibOuvrir = iaLibOuvrir;
window.iaLibFermer = iaLibFermer;
window.iaLibBasculer = iaLibBasculer;
window.demanderCleApi = demanderCleApi;
window.envoyerPromptIa = envoyerPromptIa;
window.iaActionRapide = iaActionRapide;
window.iaOuvrirDansEditeurPcb = iaOuvrirDansEditeurPcb;
window.iaEnregistrerDirectPcb = iaEnregistrerDirectPcb;
window.iaOuvrirDansEditeurSch = iaOuvrirDansEditeurSch;
window.iaEnregistrerDirectSch = iaEnregistrerDirectSch;
window.iaAppliquerAuCatalogue = iaAppliquerAuCatalogue;
