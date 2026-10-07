"use strict";
/* ==========================================================================
   WEB_CAO -- Module du Mode Tactile (commun aux éditeurs et à la visionneuse)
   Gère l'activation globale, la persistance, l'adaptation CSS, le stylet et
   la roulette de commandes : un appui long sur la feuille l'ouvre sous la
   pointe, avec les commandes de ce qui est touché (composant, fil ou piste,
   vide, tracé en cours). Elle remplace l'ancienne barre d'actions du bas.
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
  // la roulette disparaît avec le mode, et « Multi » ne doit pas rester pris
  if(!on){ tactileMultiDefinir(false); tactileRouletteFermer(); }

  // Mise à jour de l'indicateur d'entête si présent
  const btn = document.getElementById("bTactileToggle");
  if(btn){
    btn.classList.toggle("on", on);
    btn.title = on ? "Mode tactile actif (cliquer pour désactiver)"
                   : "Mode tactile inactif (cliquer pour activer)";
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

/* Sélection multiple au doigt. Un écran tactile n'a ni Maj ni Ctrl : la
   commande « Multi » de la roulette en tient lieu. Tant qu'elle est enclenchée,
   chaque toucher ajoute l'élément à la sélection ou l'en retire, et glisser sur
   le vide trace un lasso au lieu de déplacer la vue (deux doigts la déplacent
   toujours). Une pastille en haut de l'écran le rappelle et la relâche. Elle
   n'est pas mémorisée : on la rallume quand on en a besoin, comme on presse Maj. */
let TACTILE_MULTI = false;

/**
 * Renvoie vrai si la sélection multiple tactile est enclenchée.
 */
function tactileMultiActif(){
  return TACTILE_MULTI && tactileEstActif();
}

/**
 * Enclenche ou relâche la sélection multiple tactile.
 */
function tactileMultiDefinir(actif){
  TACTILE_MULTI = !!actif;
  const p = document.getElementById("tactileMultiPuce");
  if(p) p.hidden = !TACTILE_MULTI;
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
               : (document.getElementById("board") || document.getElementById("sheet") || document.getElementById("carte") || document.getElementById("schCv") || document);
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
 * @param {Object} opts - { outil: "pcb"|"schema"|"ipc"|"accueil", roulette: boolean }
 *   (`hud`, l'ancien nom de l'option, est toujours compris)
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

  if((opts.roulette || opts.hud) && opts.outil && opts.outil !== "accueil"){
    tactileRouletteBrancher(opts.outil);
  }
}

/* ==========================================================================
   Roulette de commandes
   --------------------------------------------------------------------------
   Ouverture : appui long du stylet (ou du doigt, réglable) n'importe où sur
   la feuille, ou bouton latéral d'un stylet qui en a un. La souris garde son
   clic droit. Sans lever, on glisse jusqu'à une commande et on lève pour la
   lancer ; lever sur place laisse la roulette ouverte, à toucher ensuite.
   Ce qui est sous la pointe choisit la roulette : chaque éditeur le dit par
   sa fonction schRouletteCible / pcbRouletteCible, qui renvoie
     { ctx: "comp"|"fil"|"vide", titre, actions: {nom: fonction} }
   ou { occupe: true } pendant un tracé : la roulette « tracé » s'ouvre alors,
   avec Terminer (le double-clic de l'éditeur), Échap, Via…
   Une entrée de roulette est une commande ou un groupe { g, ico, items } qui
   s'ouvre en éventail de pastilles. Le tout se règle par le secteur ＋ et se
   garde dans le profil (ou le navigateur s'il n'y a pas de profil).
   ========================================================================== */

/* Icônes au trait, 24×24, embarquées : WEB_CAO tourne aussi hors ligne. */
const TR_ICONES = {
  sauver:"M5 3h11l3 3v15H5z M8 3v6h8V3 M8 21v-7h8v7",
  annuler:"M9 14L4 9l5-5 M4 9h10a6 6 0 0 1 0 12h-3",
  retablir:"M15 14l5-5-5-5 M20 9H10a6 6 0 0 0 0 12h3",
  rot:"M20 12a8 8 0 1 1-2.34-5.66 M20 4v5h-5",
  miroir:"M12 3v18 M9 7L3 17h6z M15 7l6 10h-6z",
  face:"M4 7h16v10H4z M8 3l-4 4 4 4 M16 13l4 4-4 4",
  multi:"M4 4h3 M10 4h4 M17 4h3v3 M20 10v4 M20 17v3h-3 M14 20h-4 M7 20H4v-3 M4 14v-4 M4 7V4",
  echap:"M6 6l12 12 M18 6L6 18",
  suppr:"M4 7h16 M9 7V4h6v3 M6 7l1 14h10l1-14 M10 11v6 M14 11v6",
  fil:"M4 18h6V6h10 M4 18m-1.6 0a1.6 1.6 0 1 0 3.2 0a1.6 1.6 0 1 0-3.2 0 M20 6m-1.6 0a1.6 1.6 0 1 0 3.2 0a1.6 1.6 0 1 0-3.2 0",
  bus:"M3 8h18 M3 12h18 M3 16h18",
  trait:"M4 20L20 4",
  zone:"M4 4h16v16H4z M4 10l6-6 M4 16L16 4 M8 20L20 8 M14 20l6-6",
  tag:"M3 12V4h8l10 10-7 7z M7.5 7.5h.01",
  cadre:"M4 9V4h5 M15 4h5v5 M20 15v5h-5 M9 20H4v-5",
  copier:"M9 9h11v11H9z M15 9V4H4v11h5",
  couper:"M6 6m-3 0a3 3 0 1 0 6 0a3 3 0 1 0-6 0 M6 18m-3 0a3 3 0 1 0 6 0a3 3 0 1 0-6 0 M8.5 7.5L20 18 M8.5 16.5L20 6",
  coller:"M9 3h6v3H9z M7 4H5v17h14V4h-2",
  dupliquer:"M9 9h11v11H9z M4 15V4h11 M14.5 12v5 M12 14.5h5",
  props:"M4 6h9 M17 6h3 M4 12h3 M11 12h9 M4 18h11 M19 18h1 M15 6m-2 0a2 2 0 1 0 4 0a2 2 0 1 0-4 0 M9 12m-2 0a2 2 0 1 0 4 0a2 2 0 1 0-4 0 M17 18m-2 0a2 2 0 1 0 4 0a2 2 0 1 0-4 0",
  netEntier:"M3 12h6 M9 12l4-6h8 M9 12l4 6h8 M9 12h12",
  via:"M12 12m-8 0a8 8 0 1 0 16 0a8 8 0 1 0-16 0 M12 12m-3 0a3 3 0 1 0 6 0a3 3 0 1 0-6 0",
  piste:"M3 17l6-6h6l6-6",
  paire:"M3 9l5-5h13 M3 20l5-5h13",
  dererouter:"M3 17l6-6h2 M15 11l6-6 M10 7l4 8",
  zoomPlus:"M11 11m-7 0a7 7 0 1 0 14 0a7 7 0 1 0-14 0 M21 21l-5-5 M11 8v6 M8 11h6",
  zoomMoins:"M11 11m-7 0a7 7 0 1 0 14 0a7 7 0 1 0-14 0 M21 21l-5-5 M8 11h6",
  chercher:"M10 10m-6 0a6 6 0 1 0 12 0a6 6 0 1 0-12 0 M20 20l-5.5-5.5",
  grille:"M4 4h16v16H4z M4 10h16 M4 15h16 M10 4v16 M15 4v16",
  mesure:"M3 17L17 3l4 4L7 21z M7 13l2 2 M10 10l2 2 M13 7l2 2",
  biblio:"M4 4h4v16H4z M10 4h4v16h-4z M16 5l3.5-1 3 15.5-3.5 1z",
  montrer:"M14 4h6v6 M20 4l-9 9 M18 14v6H4V6h6",
  toutSel:"M4 4h16v16H4z M8 12l3 3 5-6",
  dessous:"M12 3v12 M7 10l5 5 5-5 M4 20h16",
  chevelu:"M5 6m-2 0a2 2 0 1 0 4 0a2 2 0 1 0-4 0 M19 18m-2 0a2 2 0 1 0 4 0a2 2 0 1 0-4 0 M7 7l10 10",
  edition:"M4 20h4L19 9l-4-4L4 16z M13 7l4 4",
  historique:"M12 12m-9 0a9 9 0 1 0 18 0a9 9 0 1 0-18 0 M12 7v5l3 2",
  selection:"M5 3l14 7-6 2-2 6z",
  vue:"M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z M12 12m-3 0a3 3 0 1 0 6 0a3 3 0 1 0-6 0",
  outils:"M14 6a4 4 0 0 0-5 5L3 17l4 4 6-6a4 4 0 0 0 5-5l-3 3-3-1-1-3z",
  groupe:"M4 4h7v7H4z M13 4h7v7h-7z M4 13h7v7H4z M13 13h7v7h-7z",
  plus:"M12 5v14 M5 12h14",
  terminer:"M4 12l5 5L20 6",
};

/* Commandes. `k` est le raccourci rejoué (par défaut `touche`), `bouton` un
   bouton de l'éditeur à préférer, `fn` une fonction propre, `action` une
   fonction fournie par l'éditeur pour la chose touchée (la commande n'apparaît
   que si l'éditeur la fournit). */
const TR_COMMUNES = {
  sauver:   {ico:"sauver",   nom:"Enregistrer", touche:"Ctrl+S", fn:trSauver},
  annuler:  {ico:"annuler",  nom:"Annuler",     touche:"Ctrl+Z", bouton:"bUndo"},
  retablir: {ico:"retablir", nom:"Rétablir",    touche:"Ctrl+Y", bouton:"bRedo"},
  copier:   {ico:"copier",   nom:"Copier",      touche:"Ctrl+C"},
  couper:   {ico:"couper",   nom:"Couper",      touche:"Ctrl+X"},
  coller:   {ico:"coller",   nom:"Coller",      touche:"Ctrl+V"},
  suppr:    {ico:"suppr",    nom:"Supprimer",   touche:"Suppr", k:"Delete", bouton:"bDel", danger:true},
  echap:    {ico:"echap",    nom:"Échap",       touche:"Échap", fn:trEchap},
  multi:    {ico:"multi",    nom:"Multi",       touche:"sélection multiple", fn:()=>tactileMultiDefinir(!TACTILE_MULTI)},
  toutSel:  {ico:"toutSel",  nom:"Tout",        touche:"Ctrl+A"},
  chercher: {ico:"chercher", nom:"Chercher",    touche:"Ctrl+F"},
  cadrer:   {ico:"cadre",    nom:"Recadrer",    touche:"", bouton:"bFit", fn:trCadrer},
  grille:   {ico:"grille",   nom:"Grille",      touche:"G"},
  mesure:   {ico:"mesure",   nom:"Mesure",      touche:"K"},
  biblio:   {ico:"biblio",   nom:"Bibliothèque",touche:"A"},
  montrer:  {ico:"montrer",  nom:"Montrer ailleurs", touche:"L"},
  rot:      {ico:"rot",      nom:"Pivoter",     touche:"R", bouton:"bRot"},
  netEntier:{ico:"netEntier",nom:"Net entier",  touche:"", action:"netEntier"},
  terminer: {ico:"terminer", nom:"Terminer",    touche:"double-clic", action:"terminer"},
};
const TR_OUTILS = {
  schema: {
    nomVide: "Feuille",
    cmds: {
      props:    {ico:"props",    nom:"Propriétés", touche:"double-clic", action:"props"},
      miroir:   {ico:"miroir",   nom:"Miroir",     touche:"M", bouton:"bMir"},
      dupliquer:{ico:"dupliquer",nom:"Dupliquer",  touche:"D"},
      fil:      {ico:"fil",      nom:"Fil",        touche:"W"},
      bus:      {ico:"bus",      nom:"Bus",        touche:"B"},
      trait:    {ico:"trait",    nom:"Trait",      touche:"T"},
      zone:     {ico:"zone",     nom:"Zone",       touche:"Z"},
      etiquettes:{ico:"tag",     nom:"Noms de nets",touche:"N"},
    },
    defaut: {
      comp: ["props","rot","miroir","suppr",
             {g:"Édition", ico:"edition", items:["copier","couper","coller","dupliquer"]},
             {g:"Historique", ico:"historique", items:["annuler","retablir"]},
             {g:"Sélection", ico:"selection", items:["multi","echap","montrer"]}],
      fil:  ["netEntier","fil","suppr",
             {g:"Édition", ico:"edition", items:["copier","couper","coller"]},
             {g:"Historique", ico:"historique", items:["annuler","retablir"]},
             "etiquettes","echap"],
      vide: ["sauver","fil","coller",
             {g:"Dessiner", ico:"outils", items:["biblio","bus","trait","zone","mesure"]},
             {g:"Vue", ico:"vue", items:["cadrer","grille","chercher","etiquettes"]},
             {g:"Historique", ico:"historique", items:["annuler","retablir"]},
             {g:"Sélection", ico:"selection", items:["multi","toutSel","echap"]}],
      trace:["terminer","echap","annuler","grille"],
    },
  },
  pcb: {
    nomVide: "Carte",
    cmds: {
      face:      {ico:"face",      nom:"Retourner",   touche:"F", bouton:"bFlip"},
      via:       {ico:"via",       nom:"Via",         touche:"V"},
      piste:     {ico:"piste",     nom:"Piste",       touche:"T"},
      paire:     {ico:"paire",     nom:"Paire diff.", touche:"P"},
      zone:      {ico:"zone",      nom:"Zone",        touche:"Z"},
      dererouter:{ico:"dererouter",nom:"Dérouter",    touche:"U", danger:true},
      chevelu:   {ico:"chevelu",   nom:"Chevelu",     touche:"N"},
      dessous:   {ico:"dessous",   nom:"Vue dessous", touche:"Y"},
    },
    defaut: {
      comp: ["rot","face","suppr",
             {g:"Édition", ico:"edition", items:["copier","couper","coller"]},
             {g:"Historique", ico:"historique", items:["annuler","retablir"]},
             {g:"Sélection", ico:"selection", items:["multi","echap","montrer"]}],
      fil:  ["netEntier","via","piste","dererouter","suppr",
             {g:"Historique", ico:"historique", items:["annuler","retablir"]},
             "echap"],
      vide: ["sauver","piste","via","coller",
             {g:"Outils", ico:"outils", items:["paire","zone","mesure","biblio"]},
             {g:"Vue", ico:"vue", items:["cadrer","grille","chevelu","dessous","chercher"]},
             {g:"Historique", ico:"historique", items:["annuler","retablir"]},
             {g:"Sélection", ico:"selection", items:["multi","toutSel","echap"]}],
      trace:["terminer","via","echap","annuler","grille"],
    },
  },
  ipc: {
    nomVide: "Carte",
    contextes: ["vide"],
    cmds: {
      zoomPlus: {ico:"zoomPlus", nom:"Zoom +", touche:"", fn:()=>trZoom(1.2)},
      zoomMoins:{ico:"zoomMoins",nom:"Zoom −", touche:"", fn:()=>trZoom(1/1.2)},
      dessous:  {ico:"dessous",  nom:"Dessous", touche:"B", bouton:"bFlip"},
    },
    defaut: { vide: ["cadrer","zoomPlus","zoomMoins","dessous"] },
  },
};
const TR_CTX_NOM = {comp:"composant", fil:"fil / piste", vide:"vide", trace:"tracé"};
const TR_MAX = 8, TR_MAX_GRP = 6;
const TR_R_BOUTON = 50, TR_R_INT = 60, TR_R_EXT = 146, TR_R_ICO = 104, TR_R_FAN = TR_R_EXT + 34;
/* Appui long : la pointe reste posée TR_APPUI_MS sans bouger de plus que
   `drag` px. Un peu avant les 550 ms de l'appui long propre aux éditeurs,
   que l'ouverture de la roulette annule. */
const TR_SEUILS = {pen:{drag:10}, touch:{drag:14}};
const TR_APPUI_MS = 450, TR_PAUME_MS = 400, TR_GLISSE_PX = 24;

const TR = {
  outil: null, cv: null, cfg: null,
  roue: null, el: null, perso: null, persoCtx: "comp",
  ptr: new Map(), appui: null, tenu: null, styletPose: false, dernierStylet: 0,
  rejetes: new Set(), ouverteA: 0, roulettePtr: null,
};

function trCmd(id){
  const o = TR_OUTILS[TR.outil];
  return (o && o.cmds[id]) || TR_COMMUNES[id] || (TR.cfg && TR.cfg.perso[id]) || null;
}
function trCatalogue(){
  const o = TR_OUTILS[TR.outil];
  return Object.keys(TR_COMMUNES).concat(Object.keys(o ? o.cmds : {}))
    .filter(id=>!(TR.outil==="ipc" && TR_COMMUNES[id] && id!=="cadrer"))
    .concat(Object.keys(TR.cfg.perso));
}
function trContextes(){ const o = TR_OUTILS[TR.outil]; return (o && o.contextes) || ["comp","fil","vide","trace"]; }
function trEchappe(s){ return String(s).replace(/[&<>"]/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[ch])); }
function trSvg(nom, taille){
  return '<svg viewBox="0 0 24 24" width="'+(taille||20)+'" height="'+(taille||20)+'" aria-hidden="true"><path d="'+(TR_ICONES[nom]||TR_ICONES.groupe)+'"/></svg>';
}
function trIco(c, taille){ return TR_ICONES[c.ico] ? trSvg(c.ico, taille) : '<span class="tr-gl">'+trEchappe(c.ico)+'</span>'; }

/* ---------- Réglages : défauts de l'outil, profil, sinon navigateur ---------- */
function trDefaut(){
  const o = TR_OUTILS[TR.outil];
  return {roues: JSON.parse(JSON.stringify(o.defaut)), perso:{}, doigt:true, paume:true, noms:false};
}
function trCharger(){
  const base = trDefaut();
  let lu = null;
  if(typeof profLire === "function"){ try{ lu = profLire("reglages:roulette:"+TR.outil); }catch(_){} }
  if(!lu){ try{ lu = JSON.parse(window.localStorage.getItem("cao.roulette."+TR.outil) || "null"); }catch(_){} }
  if(lu && lu.roues){
    for(const c of Object.keys(base.roues)) if(Array.isArray(lu.roues[c])) base.roues[c] = lu.roues[c];
    for(const k of ["perso","doigt","paume","noms"]) if(k in lu) base[k] = lu[k];
  }
  return base;
}
function trEnregistrer(){
  try{ window.localStorage.setItem("cao.roulette."+TR.outil, JSON.stringify(TR.cfg)); }catch(_){}
  if(typeof profEcrire === "function"){ try{ profEcrire("reglages:roulette:"+TR.outil, TR.cfg); }catch(_){} }
}

/* ---------- Branchement sur la page ---------- */
function tactileRouletteBrancher(outil){
  if(!TR_OUTILS[outil] || TR.outil) return;
  TR.outil = outil;
  TR.cfg = trCharger();
  TR.cv = (typeof cv !== "undefined" && cv && cv.getContext) ? cv
        : (document.getElementById("board") || document.getElementById("sheet") || document.getElementById("carte"));
  if(!TR.cv || typeof window.addEventListener !== "function") return;
  // pastille « Multi » : rappelle la sélection multiple et la relâche d'un toucher
  if(!document.getElementById("tactileMultiPuce")){
    const p = document.createElement("button");
    p.id = "tactileMultiPuce"; p.type = "button"; p.hidden = true;
    p.title = "Sélection multiple enclenchée : toucher pour la relâcher";
    p.innerHTML = trSvg("multi",16)+"<span>Sélection multiple</span><b>✕</b>";
    p.onclick = ()=>tactileMultiDefinir(false);
    document.body.appendChild(p);
  }
  window.addEventListener("pointerdown", trPointerDown, true);
  window.addEventListener("pointermove", trPointerMove, true);
  window.addEventListener("pointerup", trPointerFin, true);
  window.addEventListener("pointercancel", trPointerFin, true);
  // l'appui long natif (iPad) ou celui de l'éditeur ne doit pas ouvrir un menu par-dessus
  window.addEventListener("contextmenu", e=>{
    if(TR.roue || TR.appui || Date.now()-TR.ouverteA < 1000){ e.stopImmediatePropagation(); e.preventDefault(); }
  }, true);
  window.addEventListener("keydown", e=>{
    if(TR.roue && e.key==="Escape"){ e.preventDefault(); e.stopPropagation(); tactileRouletteFermer(); }
    else if(TR.perso && !TR.perso.hidden && e.key==="Escape"){ e.preventDefault(); e.stopPropagation(); trPersoFermer(); }
  }, true);
  window.addEventListener("resize", ()=>tactileRouletteFermer());
}

function trSurFeuille(e){ return !!TR.cv && e.target === TR.cv; }

/* Rejet de la paume : tant que le stylet est posé, et un court instant après,
   un doigt sur la feuille est ignoré. Si la paume était là avant le stylet, ses
   points sont annulés auprès de l'éditeur, sinon il croirait à un pincement. */
function trRejeter(e){ TR.rejetes.add(e.pointerId); e.stopImmediatePropagation(); if(e.cancelable) e.preventDefault(); }
function trPointerDown(e){
  if(!tactileEstActif()) return;
  if(TR.roue && !(TR.el && TR.el.contains(e.target))){
    tactileRouletteFermer();
    if(trSurFeuille(e)){ e.stopImmediatePropagation(); if(e.cancelable) e.preventDefault(); TR.rejetes.add(e.pointerId); }
    return;
  }
  if(!trSurFeuille(e)) return;
  if(e.pointerType==="pen"){
    TR.styletPose = true; TR.dernierStylet = Date.now();
    if(TR.cfg.paume){
      for(const [id,p] of TR.ptr){
        if(p.type!=="touch") continue;
        TR.ptr.delete(id); TR.rejetes.add(id);
        if(TR.appui && TR.appui.id===id) trAppuiAnnuler();
        try{ TR.cv.dispatchEvent(new PointerEvent("pointercancel",{pointerId:id, pointerType:"touch", bubbles:true, clientX:p.x, clientY:p.y})); }catch(_){}
      }
    }
    // bouton latéral d'un stylet (Surface, Wacom…) : la roulette tout de suite
    if(e.buttons & 2){ trRejeter(e); trOuvrirSur(e.clientX, e.clientY); return; }
  }else if(e.pointerType==="touch" && TR.cfg.paume && (TR.styletPose || Date.now()-TR.dernierStylet < TR_PAUME_MS)){
    trRejeter(e); return;
  }
  if(e.pointerType!=="pen" && e.pointerType!=="touch") return;
  TR.ptr.set(e.pointerId, {x:e.clientX, y:e.clientY, x0:e.clientX, y0:e.clientY, type:e.pointerType});
  trAppuiAnnuler();
  // un seul point posé : l'appui long peut commencer ; deux, c'est un pincement
  if(TR.ptr.size===1 && (e.pointerType==="pen" || TR.cfg.doigt)) trAppuiDebut(e);
}
function trPointerMove(e){
  if(TR.rejetes.has(e.pointerId)){ e.stopImmediatePropagation(); return; }
  // pointe restée posée après l'ouverture : elle glisse sur la roulette
  if(TR.tenu && TR.tenu.id===e.pointerId){
    e.stopImmediatePropagation();
    if(Math.hypot(e.clientX-TR.tenu.x0, e.clientY-TR.tenu.y0) >= TR_GLISSE_PX) TR.tenu.glisse = true;
    trSurvol(e.clientX, e.clientY);
    return;
  }
  const p = TR.ptr.get(e.pointerId);
  if(!p) return;
  p.x = e.clientX; p.y = e.clientY;
  if(TR.appui && TR.appui.id===e.pointerId &&
     Math.hypot(p.x-p.x0, p.y-p.y0) >= (TR_SEUILS[p.type]||TR_SEUILS.touch).drag) trAppuiAnnuler();
}
function trPointerFin(e){
  if(e.pointerType==="pen"){ TR.styletPose = false; TR.dernierStylet = Date.now(); }
  if(TR.rejetes.has(e.pointerId)){
    // le pointercancel que nous envoyons nous-mêmes doit atteindre l'éditeur
    if(e.isTrusted){ TR.rejetes.delete(e.pointerId); e.stopImmediatePropagation(); }
    return;
  }
  if(TR.tenu && TR.tenu.id===e.pointerId){
    e.stopImmediatePropagation();
    const glisse = TR.tenu.glisse;
    TR.tenu = null;
    // lever après avoir glissé choisit ; lever sur place laisse la roulette ouverte
    if(glisse && e.type==="pointerup") trChoisir(e.clientX, e.clientY, true);
    return;
  }
  if(TR.appui && TR.appui.id===e.pointerId) trAppuiAnnuler();
  TR.ptr.delete(e.pointerId);
}

/* Appui long : un anneau se remplit sous la pointe, puis la roulette s'ouvre.
   Le geste en cours est retiré à l'éditeur (pointercancel), qui lâche ce qu'il
   avait pris : glissement, déplacement de la vue, son propre appui long. */
function trAppuiDebut(e){
  const x = e.clientX, y = e.clientY, id = e.pointerId;
  const anneau = document.createElement("div");
  anneau.className = "tr-appui";
  anneau.style.left = x+"px"; anneau.style.top = y+"px";
  anneau.style.animationDuration = (TR_APPUI_MS-120)+"ms";
  document.body.appendChild(anneau);
  TR.appui = {id, anneau, minuterie: setTimeout(()=>trAppuiFin(id), TR_APPUI_MS)};
}
function trAppuiAnnuler(){
  if(!TR.appui) return;
  clearTimeout(TR.appui.minuterie);
  if(TR.appui.anneau.parentNode) TR.appui.anneau.parentNode.removeChild(TR.appui.anneau);
  TR.appui = null;
}
function trAppuiFin(id){
  const p = TR.ptr.get(id);
  trAppuiAnnuler();
  if(!p || !tactileEstActif()) return;
  const x = p.x, y = p.y;
  TR.ptr.delete(id);
  try{ TR.cv.dispatchEvent(new PointerEvent("pointercancel",{pointerId:id, pointerType:p.type, bubbles:true, clientX:x, clientY:y})); }catch(_){}
  if(navigator.vibrate){ try{ navigator.vibrate(12); }catch(_){} }
  trOuvrir(x, y, trCible(x, y));
  TR.tenu = {id, x0:x, y0:y, glisse:false};
}
function trCible(x, y){
  const f = {schema:"schRouletteCible", pcb:"pcbRouletteCible"}[TR.outil];
  let c = null;
  try{ if(f && typeof globalThis[f] === "function") c = globalThis[f](x, y); }catch(err){ if(typeof console !== "undefined") console.error("roulette :", err); }
  if(c && c.occupe){
    // tracé en cours : « Terminer » rejoue le double-clic qui le clôt dans l'éditeur
    return {ctx:"trace", titre:"Tracé", actions:{terminer:()=>{
      try{ TR.cv.dispatchEvent(new MouseEvent("dblclick",{bubbles:true, cancelable:true, clientX:x, clientY:y})); }catch(_){}
    }}};
  }
  return c || {ctx:"vide", titre:TR_OUTILS[TR.outil].nomVide};
}
function trOuvrirSur(x, y){ trOuvrir(x, y, trCible(x, y)); }

/* ---------- Dessin de la roulette ---------- */
function trPol(r, a){ return [r*Math.sin(a), -r*Math.cos(a)]; }
function trF(v){ return v.toFixed(1); }
function trArc(a0, a1, ri, re){
  const g = a1-a0 > Math.PI ? 1 : 0, [x0,y0] = trPol(re,a0), [x1,y1] = trPol(re,a1), [x2,y2] = trPol(ri,a1), [x3,y3] = trPol(ri,a0);
  return "M"+trF(x0)+" "+trF(y0)+"A"+re+" "+re+" 0 "+g+" 1 "+trF(x1)+" "+trF(y1)+"L"+trF(x2)+" "+trF(y2)+"A"+ri+" "+ri+" 0 "+g+" 0 "+trF(x3)+" "+trF(y3)+"Z";
}
function trInfo(en){
  if(en.t==="+") return {ico:"plus", nom:"Personnaliser"};
  if(en.t==="grp") return {ico:en.g.ico, nom:en.g.g};
  return trCmd(en.id);
}
/* Une commande qui attend une fonction de l'éditeur n'apparaît que s'il la fournit. */
function trDispo(id, cible){
  const c = trCmd(id);
  return !!c && (!c.action || !!(cible.actions && cible.actions[c.action]));
}
function trEntrees(cible){
  const liste = TR.cfg.roues[cible.ctx] || TR.cfg.roues.vide || [];
  return liste.filter(e=>typeof e==="string" ? trDispo(e, cible) : e && Array.isArray(e.items))
    .slice(0, TR_MAX)
    .map(e=>typeof e==="string" ? {t:"cmd", id:e} : {t:"grp", g:e})
    .concat([{t:"+"}]);
}

function trOuvrir(x, y, cible){
  tactileRouletteFermer();
  if(!TR.el){
    TR.el = document.createElement("div");
    TR.el.id = "trRoue";
    TR.el.addEventListener("pointerdown", trRouePointerDown);
    TR.el.addEventListener("pointermove", trRouePointerMove);
    TR.el.addEventListener("pointerup", trRouePointerUp);
    TR.el.addEventListener("pointercancel", ()=>{ TR.roulettePtr = null; });
    TR.el.addEventListener("contextmenu", e=>e.preventDefault());
    document.body.appendChild(TR.el);
  }
  const entrees = trEntrees(cible), n = entrees.length, pas = 2*Math.PI/n;
  const m = TR_R_EXT + 14;
  x = Math.min(window.innerWidth-m, Math.max(m, x));
  y = Math.min(window.innerHeight-m, Math.max(m, y));
  TR.roue = {cible, entrees, cx:x, cy:y, chaud:-1, grp:-1, past:null};
  TR.ouverteA = Date.now();
  const noms = !!TR.cfg.noms;

  let h = '<svg class="tr-svg" width="2" height="2"><defs>'+
    '<pattern id="trHachure" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">'+
      '<rect width="7" height="7" fill="#353941"/><line x1="0" y1="0" x2="0" y2="7" stroke="#474c56" stroke-width="2.5"/></pattern>'+
    '<radialGradient id="trBouton" cx="40%" cy="32%" r="75%"><stop offset="0" stop-color="#ffffff"/><stop offset=".65" stop-color="#e3e5e9"/><stop offset="1" stop-color="#b7bbc3"/></radialGradient>'+
    '<linearGradient id="trBord" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f1f2f4"/><stop offset="1" stop-color="#9ea3ac"/></linearGradient>'+
    '<filter id="trFlou" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="5"/></filter>'+
    '</defs><circle class="tr-guide" r="'+(TR_R_FAN-6)+'"/><path class="tr-lien" d=""/>'+
    '<g class="tr-anneau"><g class="tr-ombre"><circle class="tr-disque" r="'+TR_R_EXT+'"/></g>';
  entrees.forEach((en, i)=>{
    const inf = trInfo(en), a = i*pas, [ix,iy] = trPol(TR_R_ICO, a), gy = iy - (noms ? 7 : 0);
    const danger = en.t==="cmd" && inf.danger, actif = en.t==="cmd" && en.id==="multi" && TACTILE_MULTI;
    h += '<g class="tr-seg'+(danger?" danger":"")+(actif?" actif":"")+'" data-i="'+i+'">'+
         '<path class="tr-coin" d="'+trArc(a-pas/2+.012, a+pas/2-.012, TR_R_INT+2, TR_R_EXT-2)+'"/>'+
         '<circle class="tr-bulle" cx="'+trF(ix)+'" cy="'+trF(gy)+'" r="22"/>';
    if(TR_ICONES[inf.ico]) h += '<g class="tr-ico" transform="translate('+trF(ix-12)+' '+trF(gy-12)+')"><path d="'+TR_ICONES[inf.ico]+'"/></g>';
    else h += '<g class="tr-ico"><text x="'+trF(ix)+'" y="'+trF(gy)+'">'+trEchappe(inf.ico)+'</text></g>';
    if(noms) h += '<text class="tr-nomseg" x="'+trF(ix)+'" y="'+trF(iy+18)+'">'+trEchappe(inf.nom)+'</text>';
    if(en.t==="grp"){ const [mx,my] = trPol(TR_R_EXT-11, a); h += '<circle class="tr-marque" cx="'+trF(mx)+'" cy="'+trF(my)+'" r="3"/>'; }
    h += '</g>';
  });
  h += '<circle class="tr-creux" r="'+TR_R_INT+'"/><circle class="tr-lueur" r="'+(TR_R_BOUTON+1)+'" filter="url(#trFlou)"/>'+
       '<circle class="tr-bord" r="'+TR_R_BOUTON+'"/><g class="tr-stries">';
  for(let k=0; k<72; k++){
    const a = k*Math.PI/36, [x0,y0] = trPol(TR_R_BOUTON-1,a), [x1,y1] = trPol(TR_R_BOUTON-5,a);
    h += '<line x1="'+trF(x0)+'" y1="'+trF(y0)+'" x2="'+trF(x1)+'" y2="'+trF(y1)+'"/>';
  }
  h += '</g><circle class="tr-face" r="'+(TR_R_BOUTON-7)+'"/><text class="tr-t1" y="-7"></text><text class="tr-t2" y="11"></text>'+
       '</g></svg><div class="tr-eventail"></div>';
  TR.el.innerHTML = h;
  TR.el.style.left = x+"px"; TR.el.style.top = y+"px";
  TR.el.className = "ouvert ctx-"+cible.ctx;
  trMajBouton();
}
function tactileRouletteFermer(){
  TR.roue = null; TR.roulettePtr = null; TR.tenu = null;
  if(TR.el){ TR.el.className = ""; TR.el.innerHTML = ""; }
}
function tactileRouletteOuverte(){ return !!TR.roue; }
function trMajBouton(){
  const r = TR.roue; if(!r || !TR.el) return;
  let nom = TR_CTX_NOM[r.cible.ctx];
  if(r.past) nom = trCmd(r.past).nom;
  else if(r.chaud >= 0) nom = trInfo(r.entrees[r.chaud]).nom;
  else if(r.chaud === -2) nom = "fermer";
  TR.el.querySelector(".tr-t1").textContent = String(r.cible.titre || "").slice(0, 10);
  TR.el.querySelector(".tr-t2").textContent = nom;
}
function trIndexSous(x, y){
  const r = TR.roue, dx = x-r.cx, dy = y-r.cy, d = Math.hypot(dx, dy);
  if(d < TR_R_INT) return -2;
  if(d > TR_R_EXT+10) return -1;
  const pas = 2*Math.PI/r.entrees.length;
  let a = Math.atan2(dx, -dy);
  a = ((a+pas/2) % (2*Math.PI) + 2*Math.PI) % (2*Math.PI);
  return Math.floor(a/pas);
}
function trPastilleSous(x, y){
  const el = document.elementFromPoint ? document.elementFromPoint(x, y) : null;
  return el && el.closest ? el.closest(".tr-pastille") : null;
}
function trMarquerSeg(i){
  TR.roue.chaud = i;
  TR.el.querySelectorAll(".tr-seg").forEach(g=>{
    const k = +g.dataset.i;
    g.classList.toggle("chaud", k===i);
    g.classList.toggle("ouvert", k===TR.roue.grp);
  });
}
function trMarquerPastille(id){
  TR.roue.past = id;
  TR.el.querySelectorAll(".tr-pastille").forEach(p=>p.classList.toggle("chaud", !!id && p.dataset.id===id));
  trLien();
}
function trSurvol(x, y){
  if(!TR.roue) return;
  const p = trPastilleSous(x, y);
  if(p && p.dataset.id){ trMarquerPastille(p.dataset.id); trMarquerSeg(-1); trMajBouton(); return; }
  if(TR.roue.past) trMarquerPastille(null);
  const i = trIndexSous(x, y);
  if(i >= 0){
    const en = TR.roue.entrees[i];
    if(en.t==="grp"){ if(TR.roue.grp !== i) trEventail(i); }
    else if(TR.roue.grp >= 0) trEventailFermer();
  }
  trMarquerSeg(i); trMajBouton();
}

/* Éventail : les pastilles se posent sur un cercle autour de la roue, du côté
   du groupe, et restent horizontales pour se lire d'un coup d'œil. */
function trEventail(i){
  const r = TR.roue;
  r.grp = i; r.past = null;
  const ev = TR.el.querySelector(".tr-eventail");
  const items = r.entrees[i].g.items.filter(id=>trDispo(id, r.cible));
  ev.innerHTML = items.length ? items.map(id=>{ const c = trCmd(id);
      return '<button type="button" class="tr-pastille'+(c.danger?" danger":"")+'" data-id="'+trEchappe(id)+'">'+trIco(c,20)+
             '<span>'+trEchappe(c.nom)+'</span>'+(c.touche ? '<kbd>'+trEchappe(c.touche)+'</kbd>' : '')+'</button>'; }).join("")
    : '<button type="button" class="tr-pastille" data-id=""><span>Groupe vide : ajouter des commandes avec ＋</span></button>';
  TR.el.classList.add("eventail");
  const els = Array.from(ev.children), n = els.length, H = 44, G = 8, mid = (n-1)/2;
  const a = i*2*Math.PI/r.entrees.length, s = Math.sin(a), c = -Math.cos(a);
  const pos = els.map((el, k)=>{
    const w = el.offsetWidth;
    if(Math.abs(s) > 0.35){
      const yy = TR_R_FAN*c + (k-mid)*(H+G), dx = Math.sqrt(Math.max(0, TR_R_FAN*TR_R_FAN - yy*yy));
      return {el, x: s>0 ? Math.max(dx,24) : -Math.max(dx,24)-w, y: yy-H/2, w};
    }
    const yy = c<0 ? -TR_R_FAN-H-k*(H+G) : TR_R_FAN+k*(H+G);
    return {el, x: TR_R_FAN*s - w/2, y: yy, w};
  });
  // l'éventail reste dans l'écran : on le décale d'un bloc
  let dx = 0, dy = 0;
  const minX = Math.min(...pos.map(p=>r.cx+p.x)), maxX = Math.max(...pos.map(p=>r.cx+p.x+p.w));
  const minY = Math.min(...pos.map(p=>r.cy+p.y)), maxY = Math.max(...pos.map(p=>r.cy+p.y+H));
  if(minX < 8) dx = 8-minX; else if(maxX > window.innerWidth-8) dx = window.innerWidth-8-maxX;
  if(minY < 8) dy = 8-minY; else if(maxY > window.innerHeight-8) dy = window.innerHeight-8-maxY;
  pos.forEach((p, k)=>{ p.el.style.left = (p.x+dx)+"px"; p.el.style.top = (p.y+dy)+"px"; p.el.style.animationDelay = (k*25)+"ms"; });
  trMarquerSeg(r.chaud);
  trLien();
}
function trEventailFermer(){
  TR.roue.grp = -1; TR.roue.past = null;
  TR.el.querySelector(".tr-eventail").innerHTML = "";
  TR.el.classList.remove("eventail");
  trLien();
}
function trLien(){
  const l = TR.el && TR.el.querySelector(".tr-lien"); if(!l || !TR.roue) return;
  const r = TR.roue;
  const cible = r.grp < 0 ? null : (TR.el.querySelector(".tr-pastille.chaud") || TR.el.querySelector(".tr-pastille"));
  if(!cible){ l.setAttribute("d", ""); return; }
  const a = r.grp*2*Math.PI/r.entrees.length, [x0,y0] = trPol(TR_R_EXT,a), [x1,y1] = trPol(TR_R_EXT+14,a);
  const x = parseFloat(cible.style.left), y = parseFloat(cible.style.top), w = cible.offsetWidth;
  let bx, by;   // point de la pastille tourné vers la roue
  if(Math.abs(Math.sin(a)) > 0.35){ bx = x+w/2 < 0 ? x+w : x; by = y+22; }
  else { bx = x+w/2; by = y+22 < 0 ? y+44 : y; }
  l.setAttribute("d", "M"+trF(x0)+" "+trF(y0)+"L"+trF(x1)+" "+trF(y1)+"L"+trF(bx)+" "+trF(by));
}

/* Toucher une icône, ou glisser de la roulette à une pastille puis lever. */
function trRouePointerDown(e){
  e.preventDefault(); e.stopPropagation();
  TR.roulettePtr = e.pointerId;
  try{ TR.el.setPointerCapture(e.pointerId); }catch(_){}
  trSurvol(e.clientX, e.clientY);
}
function trRouePointerMove(e){
  if(TR.roulettePtr===e.pointerId || e.buttons===0) trSurvol(e.clientX, e.clientY);
}
function trRouePointerUp(e){
  e.stopPropagation();
  if(TR.roulettePtr !== e.pointerId || !TR.roue) return;
  TR.roulettePtr = null;
  trChoisir(e.clientX, e.clientY, false);
}
/* Lever la pointe en (x, y) : une pastille ou une commande se lance, un groupe
   s'ouvre, le bouton central ferme. `glisse` : la pointe arrive de l'appui long
   sans avoir été levée ; le centre vaut alors renoncement. */
function trChoisir(x, y, glisse){
  const r = TR.roue; if(!r) return;
  const p = trPastilleSous(x, y);
  if(p){
    const id = p.dataset.id, ctx = r.cible.ctx;
    tactileRouletteFermer();
    if(id) trExecuter(id, r.cible); else trPersoOuvrir(ctx);
    return;
  }
  const i = trIndexSous(x, y);
  if(i === -2){ tactileRouletteFermer(); return; }
  if(i < 0) return;
  const en = r.entrees[i];
  if(en.t==="grp"){ if(r.grp !== i) trEventail(i); trMarquerSeg(i); trMajBouton(); return; }
  tactileRouletteFermer();
  if(en.t==="+") trPersoOuvrir(r.cible.ctx); else trExecuter(en.id, r.cible);
}

/* ---------- Exécution ---------- */
const TR_ALIAS = {suppr:"Delete", del:"Delete", delete:"Delete", "échap":"Escape", echap:"Escape", esc:"Escape", escape:"Escape",
  "entrée":"Enter", entree:"Enter", enter:"Enter", espace:" ", space:" ", tab:"Tab", haut:"ArrowUp", bas:"ArrowDown",
  gauche:"ArrowLeft", droite:"ArrowRight", pageup:"PageUp", pagedown:"PageDown"};
function trToucheParse(txt){
  const o = {key:"", code:"", ctrlKey:false, shiftKey:false, altKey:false};
  for(const brut of String(txt||"").split("+")){
    const p = brut.trim(), l = p.toLowerCase();
    if(!p) continue;
    if(l==="ctrl"||l==="cmd"||l==="control"||l==="⌘") o.ctrlKey = true;
    else if(l==="shift"||l==="maj") o.shiftKey = true;
    else if(l==="alt"||l==="option") o.altKey = true;
    else o.key = TR_ALIAS[l] || (p.length===1 ? p.toLowerCase() : p);
  }
  if(/^[a-z]$/.test(o.key)) o.code = "Key"+o.key.toUpperCase();
  else if(/^[0-9]$/.test(o.key)) o.code = "Digit"+o.key;
  else o.code = o.key;
  return o;
}
function trExecuter(id, cible){
  const c = trCmd(id); if(!c) return;
  try{
    if(c.action){ const f = cible && cible.actions && cible.actions[c.action]; if(f) f(); return; }
    if(c.bouton){ const b = document.getElementById(c.bouton); if(b && !b.disabled){ b.click(); return; } }
    if(c.fn){ c.fn(); return; }
    const t = trToucheParse(c.k || c.touche);
    if(t.key) tactileSimulerTouche(t.key, t.code, t);
  }catch(err){ if(typeof console !== "undefined") console.error("roulette :", id, err); }
}
/* Enregistrer : « Enregistrer + GitHub » quand l'éditeur l'affiche (outil
   lancé par WEB_SUITE, projet du serveur ouvert), l'enregistrement simple sinon. */
function trSauver(){
  const git = document.getElementById("bSaveGit");
  const el = (git && git.style.display !== "none") ? git : document.getElementById("bSave");
  if(el) el.click();
  else tactileSimulerTouche("s", "KeyS", {ctrlKey: true});
}
function trEchap(){
  const el = document.getElementById("mSelect");
  if(el) el.click();
  tactileSimulerTouche("Escape", "Escape");
}
function trCadrer(){
  if(typeof fit === "function") fit();
  else if(typeof zoomAjuster === "function") zoomAjuster();
}
function trZoom(k){
  if(typeof zoomer !== "function" || !TR.cv) return;
  zoomer(k, (TR.cv.clientWidth||0)/2, (TR.cv.clientHeight||0)/2);
}
function trAvis(txt){
  let t = document.getElementById("trAvis");
  if(!t){ t = document.createElement("div"); t.id = "trAvis"; document.body.appendChild(t); }
  t.textContent = txt; t.classList.add("on");
  clearTimeout(trAvis.minuterie);
  trAvis.minuterie = setTimeout(()=>t.classList.remove("on"), 2200);
}

/* ---------- Personnalisation (secteur ＋) ---------- */
function trR(){ return TR.cfg.roues[TR.persoCtx]; }
function trPersoConstruire(){
  const d = document.createElement("div");
  d.id = "trPerso"; d.hidden = true;
  d.setAttribute("role", "dialog"); d.setAttribute("aria-modal", "true"); d.setAttribute("aria-labelledby", "trPersoTitre");
  const ctxs = trContextes();
  d.innerHTML =
    '<div class="tr-boite">'+
      '<h2><span id="trPersoTitre">Roulette de commandes</span><button type="button" class="tr-fermer" aria-label="Fermer">✕</button></h2>'+
      '<section'+(ctxs.length<2?' hidden':'')+'><h3>Roulette affichée par un appui long sur…</h3><div class="tr-onglets" role="tablist">'+
        ctxs.map(c=>'<button type="button" role="tab" data-ctx="'+c+'">'+({comp:"un composant", fil:"un fil / une piste", vide:"le vide", trace:"un tracé en cours"}[c])+'</button>').join("")+
      '</div></section>'+
      '<section><h3>Contenu, sens horaire en partant du haut</h3><div class="tr-liste"></div>'+
        '<p class="tr-note">Huit éléments au plus dans la roulette, six commandes au plus par groupe.</p></section>'+
      '<section><h3>Ajouter</h3>'+
        '<div class="tr-rang"><label for="trDest">dans</label><select id="trDest"></select></div>'+
        '<div class="tr-catalogue"></div>'+
        '<div class="tr-rang"><input id="trGNom" maxlength="14" placeholder="Nom du nouveau groupe"><button type="button" class="tr-gajout">Créer le groupe</button></div>'+
      '</section>'+
      '<section><h3>Ma propre commande (raccourci clavier)</h3>'+
        '<form class="tr-form"><label>Icône<input id="trCIco" maxlength="2" placeholder="⌁" required></label>'+
        '<label>Nom<input id="trCNom" maxlength="14" placeholder="Bus" required></label>'+
        '<label>Raccourci<input id="trCTouche" placeholder="B ou Ctrl+Shift+N" required></label>'+
        '<button class="prim" type="submit">Ajouter</button></form>'+
        '<p class="tr-note">Elle va dans la destination choisie plus haut ; la roulette rejoue ce raccourci dans l\'éditeur.</p></section>'+
      '<section class="tr-opts"><h3>Gestes</h3>'+
        '<label><input type="checkbox" data-opt="doigt"> L\'appui long au doigt ouvre aussi la roulette</label>'+
        '<label><input type="checkbox" data-opt="paume"> Ignorer la paume et les doigts quand le stylet est posé</label>'+
        '<label><input type="checkbox" data-opt="noms"> Afficher les noms sous les icônes</label>'+
        '<div class="tr-rang"><button type="button" class="tr-raz">Revenir aux roulettes d\'origine</button></div>'+
      '</section>'+
    '</div>';
  document.body.appendChild(d);
  const q = s=>d.querySelector(s);
  q(".tr-fermer").onclick = trPersoFermer;
  d.addEventListener("pointerdown", e=>{ if(e.target===d) trPersoFermer(); });
  q(".tr-onglets").addEventListener("click", e=>{
    const b = e.target.closest("button[data-ctx]"); if(!b) return;
    TR.persoCtx = b.dataset.ctx; q("#trDest").value = "roue"; trPersoRendre();
  });
  q(".tr-liste").addEventListener("click", e=>{
    const b = e.target.closest("button[data-a]"); if(!b) return;
    const ch = b.dataset.ch.split(".").map(Number);
    const tab = ch.length===2 ? trR()[ch[0]].items : trR(), i = ch[ch.length-1];
    if(b.dataset.a==="haut" && i>0) [tab[i-1],tab[i]] = [tab[i],tab[i-1]];
    if(b.dataset.a==="bas" && i<tab.length-1) [tab[i+1],tab[i]] = [tab[i],tab[i+1]];
    if(b.dataset.a==="ret"){ tab.splice(i,1); if(ch.length===1) q("#trDest").value = "roue"; }
    trEnregistrer(); trPersoRendre();
  });
  q("#trDest").addEventListener("change", trPersoRendre);
  q(".tr-catalogue").addEventListener("click", e=>{
    const b = e.target.closest("button[data-ajout]"); if(!b) return;
    const dest = trDest();
    if(trPleine(dest)){ trAvis(dest===trR() ? TR_MAX+" éléments au plus dans la roulette" : TR_MAX_GRP+" commandes au plus par groupe"); return; }
    dest.push(b.dataset.ajout); trEnregistrer(); trPersoRendre();
  });
  q(".tr-gajout").onclick = ()=>{
    const nom = q("#trGNom").value.trim(); if(!nom) return;
    if(trPleine(trR())){ trAvis(TR_MAX+" éléments au plus dans la roulette"); return; }
    trR().push({g:nom, ico:"groupe", items:[]});
    q("#trGNom").value = "";
    trEnregistrer(); trPersoRendre();
    q("#trDest").value = String(trR().length-1); trPersoRendre();
  };
  q(".tr-form").addEventListener("submit", e=>{
    e.preventDefault();
    const ico = q("#trCIco").value.trim(), nom = q("#trCNom").value.trim(), touche = q("#trCTouche").value.trim();
    if(!ico || !nom || !trToucheParse(touche).key){ trAvis("Raccourci non reconnu : par exemple « B » ou « Ctrl+Shift+N »"); return; }
    const id = "p_"+Date.now().toString(36);
    TR.cfg.perso[id] = {ico, nom, touche};
    const dest = trDest();
    if(!trPleine(dest)) dest.push(id); else trAvis("Commande créée ; la destination est pleine, elle attend dans la liste d'ajout");
    trEnregistrer(); e.target.reset(); trPersoRendre();
  });
  d.querySelectorAll("input[data-opt]").forEach(inp=>inp.addEventListener("change", ()=>{ TR.cfg[inp.dataset.opt] = inp.checked; trEnregistrer(); }));
  q(".tr-raz").onclick = ()=>{ const p = TR.cfg.perso; TR.cfg = trDefaut(); TR.cfg.perso = p; trEnregistrer(); q("#trDest").value = "roue"; trPersoRendre(); };
  return d;
}
function trDest(){
  const v = TR.perso.querySelector("#trDest").value;
  const g = v && v!=="roue" ? trR()[+v] : null;
  return g && g.items ? g.items : trR();
}
function trPleine(dest){ return dest===trR() ? dest.length >= TR_MAX : dest.length >= TR_MAX_GRP; }
function trBoutons(ch){
  return '<span class="tr-acts"><button type="button" data-a="haut" data-ch="'+ch+'" aria-label="Monter">↑</button>'+
         '<button type="button" data-a="bas" data-ch="'+ch+'" aria-label="Descendre">↓</button>'+
         '<button type="button" data-a="ret" data-ch="'+ch+'" aria-label="Retirer">✕</button></span>';
}
function trLigne(id, ch, sous){
  const c = trCmd(id); if(!c) return "";
  return '<div class="tr-ligne'+(sous?" sous":"")+'"><span class="tr-i">'+trIco(c,20)+'</span><span class="tr-n">'+trEchappe(c.nom)+
         '<small>'+trEchappe(c.touche || (c.action ? "selon ce qui est touché" : ""))+(TR.cfg.perso[id]?" · perso":"")+'</small></span>'+trBoutons(ch)+'</div>';
}
function trPersoRendre(){
  const d = TR.perso, q = s=>d.querySelector(s);
  d.querySelectorAll(".tr-onglets button").forEach(b=>b.setAttribute("aria-selected", String(b.dataset.ctx===TR.persoCtx)));
  let h = "";
  trR().forEach((e, i)=>{
    if(typeof e==="string") h += trLigne(e, String(i), false);
    else{
      h += '<div class="tr-ligne grp"><span class="tr-i">'+trSvg(e.ico,20)+'</span><span class="tr-n">Groupe '+trEchappe(e.g)+
           '<small>'+e.items.length+' commande(s), s\'ouvre en éventail</small></span>'+trBoutons(String(i))+'</div>';
      e.items.forEach((id, j)=>{ h += trLigne(id, i+"."+j, true); });
    }
  });
  q(".tr-liste").innerHTML = h;
  const sd = q("#trDest"), avant = sd.value;
  sd.innerHTML = '<option value="roue">la roulette</option>' +
    trR().map((e, i)=>typeof e==="string" ? "" : '<option value="'+i+'">le groupe '+trEchappe(e.g)+'</option>').join("");
  sd.value = Array.from(sd.options).some(o=>o.value===avant) ? avant : "roue";
  const dest = trDest();
  const dispo = trCatalogue().filter(id=>!dest.includes(id));
  q(".tr-catalogue").innerHTML = dispo.length
    ? dispo.map(id=>'<button type="button" data-ajout="'+trEchappe(id)+'">'+trIco(trCmd(id),16)+trEchappe(trCmd(id).nom)+'</button>').join("")
    : '<span class="tr-note">Tout y est déjà.</span>';
  d.querySelectorAll("input[data-opt]").forEach(inp=>{ inp.checked = !!TR.cfg[inp.dataset.opt]; });
}
function trPersoOuvrir(ctx){
  if(!TR.perso) TR.perso = trPersoConstruire();
  const ctxs = trContextes();
  TR.persoCtx = ctxs.includes(ctx) ? ctx : ctxs[0];
  TR.perso.querySelector("#trDest").value = "roue";
  trPersoRendre();
  TR.perso.hidden = false;
}
function trPersoFermer(){ if(TR.perso) TR.perso.hidden = true; }
