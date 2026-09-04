"use strict";
/* ==========================================================================
   WEB_CAO -- Module du Mode Tactile (commun aux éditeurs et à la visionneuse)
   Gère l'activation globale, la persistance, l'adaptation CSS et la barre
   d'actions rapides flottante (HUD tactile).
   ========================================================================== */

const TACTILE_CLE = "cao.modeTactile";

/**
 * Renvoie vrai si le mode tactile est actif.
 */
function tactileEstActif(){
  try{
    const v = window.localStorage ? window.localStorage.getItem(TACTILE_CLE) : null;
    return v === "1";
  }catch(_){
    return false;
  }
}

/**
 * Active ou désactive le mode tactile.
 */
function tactileDefinir(actif){
  const on = !!actif;
  try{
    if(window.localStorage){
      window.localStorage.setItem(TACTILE_CLE, on ? "1" : "0");
    }
  }catch(_){}

  // Synchronisation avec le profil utilisateur s'il est chargé
  if(typeof profEcrire === "function"){
    try{ profEcrire("reglages:tactile", {actif: on}); }catch(_){}
  }

  // Application de la classe sur le body
  if(document.body){
    document.body.classList.toggle("mode-tactile", on);
  }

  // Mise à jour de l'indicateur d'entête si présent
  const btn = document.getElementById("bTactileToggle");
  if(btn){
    btn.classList.toggle("on", on);
    btn.title = on ? "Mode tactile actif (cliquer pour désactiver)"
                   : "Mode tactile inactif (cliquer pour activer)";
  }

  // Affichage ou masquage du HUD
  const hud = document.getElementById("tactileHud");
  if(hud){
    hud.style.display = on ? "flex" : "none";
  }

  // Émission d'un événement global pour les canevas et modules d'interaction
  if(typeof window !== "undefined" && typeof window.dispatchEvent === "function"){
    try{
      const evt = typeof CustomEvent === "function"
        ? new CustomEvent("cao-tactile-change", {detail: {actif: on}})
        : {type: "cao-tactile-change", detail: {actif: on}};
      window.dispatchEvent(evt);
    }catch(_){}
  }
}

/**
 * Émet une frappe de touche clavier synthétique pour déclencher les actions
 * existantes sans modifier le code métier.
 */
function tactileSimulerTouche(key, code, opts){
  opts = opts || {};
  if(typeof document === "undefined") return;
  const target = document.activeElement && document.activeElement !== document.body
               ? document.activeElement
               : (document.getElementById("board") || document.getElementById("schCv") || document);
  if(!target || typeof target.dispatchEvent !== "function") return;
  try{
    const evInit = {
      key: key,
      code: code || key,
      bubbles: true,
      cancelable: true,
      ctrlKey: !!opts.ctrlKey,
      shiftKey: !!opts.shiftKey,
      altKey: !!opts.altKey
    };
    const evDown = typeof KeyboardEvent === "function" ? new KeyboardEvent("keydown", evInit) : {type: "keydown", ...evInit};
    const evUp = typeof KeyboardEvent === "function" ? new KeyboardEvent("keyup", evInit) : {type: "keyup", ...evInit};
    target.dispatchEvent(evDown);
    target.dispatchEvent(evUp);
  }catch(_){}
}

/**
 * Initialise le mode tactile sur la page courante.
 * @param {Object} opts - { outil: "pcb"|"schema"|"ipc"|"accueil", hud: boolean }
 */
function tactileInitialiser(opts){
  opts = opts || {};
  const actif = tactileEstActif();

  if(document.body){
    document.body.classList.toggle("mode-tactile", actif);
  }

  // Synchroniser le bouton de bascule s'il est déjà dans l'entête
  const bToggle = document.getElementById("bTactileToggle");
  if(bToggle){
    bToggle.classList.toggle("on", actif);
    bToggle.onclick = function(){
      tactileDefinir(!tactileEstActif());
    };
  }

  if(opts.hud && opts.outil && opts.outil !== "accueil"){
    tactileCreerHud(opts.outil);
  }
}

/**
 * Construit et injecte la barre d'actions rapides flottante (HUD) sous le pouce.
 */
function tactileCreerHud(outil){
  let hud = document.getElementById("tactileHud");
  if(hud) return hud;

  hud = document.createElement("div");
  hud.id = "tactileHud";
  hud.style.display = tactileEstActif() ? "flex" : "none";

  let html = '';

  // Bouton replier / déplier
  html += '<button class="hud-btn hud-toggle" id="hudReplier" title="Masquer / Afficher les boutons tactiles"><span class="hud-icon">⋯</span></button>';

  if(outil === "pcb"){
    html += '<button class="hud-btn" id="hudUndo" title="Annuler (Ctrl+Z)"><span class="hud-icon">↺</span><span class="hud-lbl">Annul</span></button>';
    html += '<button class="hud-btn" id="hudRedo" title="Rétablir (Ctrl+Y)"><span class="hud-icon">↻</span><span class="hud-lbl">Rétab</span></button>';
    html += '<div class="hud-sep"></div>';
    html += '<button class="hud-btn" id="hudRot" title="Pivoter le composant (R)"><span class="hud-icon">⟳</span><span class="hud-lbl">Rot R</span></button>';
    html += '<button class="hud-btn" id="hudFlip" title="Retourner face (F)"><span class="hud-icon">⇄</span><span class="hud-lbl">Face F</span></button>';
    html += '<button class="hud-btn" id="hudVia" title="Insérer un via (V)"><span class="hud-icon">◎</span><span class="hud-lbl">Via V</span></button>';
    html += '<div class="hud-sep"></div>';
    html += '<button class="hud-btn" id="hudEsc" title="Terminer ou annuler le tracé (Échap)"><span class="hud-icon">✕</span><span class="hud-lbl">Échap</span></button>';
    html += '<button class="hud-btn hud-danger" id="hudDel" title="Supprimer la sélection (Suppr)"><span class="hud-icon">🗑</span><span class="hud-lbl">Suppr</span></button>';
  } else if(outil === "schema"){
    html += '<button class="hud-btn" id="hudUndo" title="Annuler (Ctrl+Z)"><span class="hud-icon">↺</span><span class="hud-lbl">Annul</span></button>';
    html += '<button class="hud-btn" id="hudRedo" title="Rétablir (Ctrl+Y)"><span class="hud-icon">↻</span><span class="hud-lbl">Rétab</span></button>';
    html += '<div class="hud-sep"></div>';
    html += '<button class="hud-btn" id="hudRot" title="Pivoter le symbole (R)"><span class="hud-icon">⟳</span><span class="hud-lbl">Rot R</span></button>';
    html += '<button class="hud-btn" id="hudMiroir" title="Miroir horizontal (M)"><span class="hud-icon">⇄</span><span class="hud-lbl">Miroir</span></button>';
    html += '<div class="hud-sep"></div>';
    html += '<button class="hud-btn" id="hudEsc" title="Désélectionner / Quitter (Échap)"><span class="hud-icon">✕</span><span class="hud-lbl">Échap</span></button>';
    html += '<button class="hud-btn hud-danger" id="hudDel" title="Supprimer la sélection (Suppr)"><span class="hud-icon">🗑</span><span class="hud-lbl">Suppr</span></button>';
  } else if(outil === "ipc"){
    html += '<button class="hud-btn" id="hudFit" title="Recadrer la vue"><span class="hud-icon">⛶</span><span class="hud-lbl">Cadre</span></button>';
    html += '<button class="hud-btn" id="hudZoomIn" title="Zoom avant"><span class="hud-icon">+</span><span class="hud-lbl">Zoom</span></button>';
    html += '<button class="hud-btn" id="hudZoomOut" title="Zoom arrière"><span class="hud-icon">−</span><span class="hud-lbl">Zoom</span></button>';
  }

  hud.innerHTML = html;
  document.body.appendChild(hud);

  // Câblage des boutons
  const btnReplier = hud.querySelector("#hudReplier");
  if(btnReplier){
    btnReplier.onclick = function(e){
      e.stopPropagation();
      hud.classList.toggle("replie");
      btnReplier.querySelector(".hud-icon").textContent = hud.classList.contains("replie") ? "📱" : "⋯";
    };
  }

  // PCB actions
  const bUndo = hud.querySelector("#hudUndo");
  if(bUndo){
    bUndo.onclick = function(e){
      e.preventDefault();
      const el = document.getElementById("bUndo");
      if(el) el.click();
      else tactileSimulerTouche("z", "KeyZ", {ctrlKey: true});
    };
  }

  const bRedo = hud.querySelector("#hudRedo");
  if(bRedo){
    bRedo.onclick = function(e){
      e.preventDefault();
      const el = document.getElementById("bRedo");
      if(el) el.click();
      else tactileSimulerTouche("y", "KeyY", {ctrlKey: true});
    };
  }

  const bRot = hud.querySelector("#hudRot");
  if(bRot){
    bRot.onclick = function(e){
      e.preventDefault();
      const el = document.getElementById("bRot");
      if(el) el.click();
      else tactileSimulerTouche("r", "KeyR");
    };
  }

  const bFlip = hud.querySelector("#hudFlip");
  if(bFlip){
    bFlip.onclick = function(e){
      e.preventDefault();
      const el = document.getElementById("bFlip");
      if(el) el.click();
      else tactileSimulerTouche("f", "KeyF");
    };
  }

  const bVia = hud.querySelector("#hudVia");
  if(bVia){
    bVia.onclick = function(e){
      e.preventDefault();
      const el = document.getElementById("mVia");
      if(el) el.click();
      else tactileSimulerTouche("v", "KeyV");
    };
  }

  const bMiroir = hud.querySelector("#hudMiroir");
  if(bMiroir){
    bMiroir.onclick = function(e){
      e.preventDefault();
      tactileSimulerTouche("m", "KeyM");
    };
  }

  const bEsc = hud.querySelector("#hudEsc");
  if(bEsc){
    bEsc.onclick = function(e){
      e.preventDefault();
      const el = document.getElementById("mSelect");
      if(el) el.click();
      tactileSimulerTouche("Escape", "Escape");
    };
  }

  const bDel = hud.querySelector("#hudDel");
  if(bDel){
    bDel.onclick = function(e){
      e.preventDefault();
      const el = document.getElementById("bDel");
      if(el) el.click();
      else tactileSimulerTouche("Delete", "Delete");
    };
  }

  // IPC actions
  const bFit = hud.querySelector("#hudFit");
  if(bFit){
    bFit.onclick = function(e){
      e.preventDefault();
      const el = document.getElementById("bFit") || document.getElementById("btnFit");
      if(el) el.click();
      else if(typeof zoomAjuster === "function") zoomAjuster();
    };
  }
  const bZoomIn = hud.querySelector("#hudZoomIn");
  if(bZoomIn){
    bZoomIn.onclick = function(e){
      e.preventDefault();
      if(typeof zoomer === "function") zoomer(1.2);
    };
  }
  const bZoomOut = hud.querySelector("#hudZoomOut");
  if(bZoomOut){
    bZoomOut.onclick = function(e){
      e.preventDefault();
      if(typeof zoomer === "function") zoomer(1 / 1.2);
    };
  }

  // Déplacement tactile fluide du HUD (glisser-déposer pour ne pas encombrer)
  let glisseHud = null;
  hud.addEventListener("pointerdown", function(e){
    if(e.target.closest("button:not(.hud-toggle)")) return;
    glisseHud = {
      startX: e.clientX,
      startY: e.clientY,
      hudLeft: hud.getBoundingClientRect().left,
      hudTop: hud.getBoundingClientRect().top
    };
    hud.setPointerCapture(e.pointerId);
  });

  hud.addEventListener("pointermove", function(e){
    if(!glisseHud) return;
    const dx = e.clientX - glisseHud.startX;
    const dy = e.clientY - glisseHud.startY;
    hud.style.left = Math.max(20, Math.min(window.innerWidth - 60, glisseHud.hudLeft + dx + hud.offsetWidth / 2)) + "px";
    hud.style.bottom = Math.max(10, Math.min(window.innerHeight - 60, window.innerHeight - (glisseHud.hudTop + dy + hud.offsetHeight))) + "px";
  });

  const finGlisse = function(){ glisseHud = null; };
  hud.addEventListener("pointerup", finGlisse);
  hud.addEventListener("pointercancel", finGlisse);

  return hud;
}
