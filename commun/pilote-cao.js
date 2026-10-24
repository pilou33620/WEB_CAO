/* Branchement du canal de pilotage (commun/pilote.js, copie de web_suite) dans les
   pages de WEB_CAO : la page se déclare, avec le projet ouvert et le canevas que
   l'utilisateur voit. Les commandes propres à une page s'ajoutent ici.
   Banc : node commun/test/banc-pilote-cao.js */

/* cao_calcul : analyse -> [famille du panneau, lanceur]. Les lanceurs sont async et leur
   promesse se résout à la fin du calcul ; une erreur est rangée dans l'état, et le
   rapport la dit (web_suite, SPEC-mcp-canal-pilote.md, question tranchée 1). */
const PILOTE_CALCULS = {
  impedance: ["si", "simGo"], diff: ["si", "simGo"], retour: ["si", "simGo"],
  crosstalk: ["si", "simXtGo"], oeil: ["si", "simOeilGo"], bus: ["si", "simBusCalculer"],
  dc: ["pi", "simDCLancer"], pdn: ["pi", "simCalculerPDN"],
  s21: ["rf", "simRfGo"], verif: ["carte", "simCarteGo"],
};

async function piloteCaoCalcul(args) {
  const analyse = args.analyse;
  const quoi = PILOTE_CALCULS[analyse];
  if (!quoi) throw new Error("Analyse « " + analyse + " » inconnue : " + Object.keys(PILOTE_CALCULS).join(", ") + ".");
  const lancer = globalThis[quoi[1]];
  if (typeof lancer !== "function" || typeof simAllerFamille !== "function")
    throw new Error("Analyse « " + analyse + " » indisponible dans cette page.");
  if (SIM.occupe) throw new Error("Un calcul est déjà en cours dans cette page : réessaie quand il sera fini.");
  simAllerFamille(quoi[0]);
  simAllerAnalyse(analyse);
  // simGo s'arrête en silence quand simProblemes() ne trouve rien (pas de cuivre sélectionné) :
  // le dire, avec la raison que la page a rangée, plutôt que rendre un rapport « Pas de résultat »
  if (quoi[1] === "simGo" && !(simCalculable() && simProblemes()))
    throw new Error(SIM.err || "Rien à calculer : sélectionne d'abord une piste ou un net dans l'éditeur.");
  await lancer();
  // le bus range son refus dans SIM_BUS.erreur, que le rapport ne reprend pas ; sans net, il ne dit rien
  if (analyse === "bus" && !SIM_BUS.result)
    throw new Error(SIM_BUS.erreur || "Rien à calculer : désigne d'abord l'horloge et les données du bus (onglet Bus synchrone).");
  return { analyse, rapport: simRapMarkdown(simRapCollecter()) };
}

/* cao_valeur_composant (schéma) : la recherche et le rafraîchissement de l'ancienne action
   schema_values de l'assistant IA (retiré), en une étape d'historique. Le repère
   est cherché AVANT push() : un repère inconnu ne laisse pas d'étape vide à défaire. */
function piloteTrouverComp(ref) {
  const cible = String(ref || "").trim().toUpperCase();
  const meme = c => (c.ref || "").trim().toUpperCase() === cible;
  let c = S.comps.find(meme);
  for (const p of S.pages || []) { if (c) break; if (Array.isArray(p.comps)) c = p.comps.find(meme); }
  if (!c) throw new Error("Repère « " + ref + " » introuvable dans le schéma.");
  return c;
}

const PILOTE_VALEUR = {
  ecriture: true, historique: true,      // une étape dans l'historique de l'éditeur : Ctrl+Z la défait
  proposer: a => {
    const c = piloteTrouverComp(a.ref);
    return { titre: c.ref + " : valeur", avant: c.value || "", apres: String(a.valeur).trim() };
  },
  appliquer: a => {
    const c = piloteTrouverComp(a.ref);
    const v = String(a.valeur).trim();
    ECRITURE_CAO.pousser();
    const def = typeof defOf === "function" ? defOf(c.type) : null;
    if (def && typeof def.pins === "function" && typeof reshapeComp === "function") reshapeComp(c, () => { c.value = v; });
    else c.value = v;
    if (typeof buildList === "function") buildList();
    if (typeof refreshPanels === "function") refreshPanels();
    if (typeof draw === "function") draw();
  },
};

/* Lectures (commun/lecture-cao.js) : le registre de la page, choisi par « quoi », rendu
   en texte. Rien n'est écrit, donc pas de carte ; la trace vient de pilote.js. */
const PILOTE_LIRE = { schema: ["schema"], pcb: ["pcb", "sim"], "visionneuse-ipc": ["ipc", "sim"] };

function piloteLire(famille, args) {
  if (famille === "ipc" && !(typeof V !== "undefined" && V && V.modele))
    throw new Error("Aucun fichier IPC-2581 ouvert dans la visionneuse.");
  if (famille === "sim" && !LECTURE_CAO.aides.simRapportsDispo())
    throw new Error("Les simulations ne sont pas chargées dans cette page.");
  const outils = LECTURE_CAO[famille], o = Object.hasOwn(outils, args.quoi) && outils[args.quoi];
  if (!o) throw new Error("« quoi » inconnu ici : " + Object.keys(outils).join(", ") + ".");
  if (famille === "sim" && args.afficher) {
    if (!args.analyse) throw new Error("« afficher » : précise « analyse » (voir la lecture « simulations »).");
    piloteAfficherAnalyse(args.analyse);
  }
  return [].concat(o.fn(args)).join("\n");
}

/* Le rapport complet n'existe que pour l'analyse affichée : y passer, comme un clic sur l'onglet. */
function piloteAfficherAnalyse(k) {
  const fam = typeof SIM_FAMILLES !== "undefined" && SIM_FAMILLES.find(f => f.analyses.includes(k));
  if (!fam || !Object.hasOwn(SIM_RAP_ETAT, k)) throw new Error("Analyse « " + k + " » inconnue. Analyses : " + Object.keys(SIM_RAP_ETAT).join(", ") + ".");
  simAllerFamille(fam.cle);
  simAllerAnalyse(k);
}

/* cao_vue : la vue seulement, ni le projet ni l'historique. Tout est vérifié avant le
   premier changement : un repère ou une couche inconnus laissent la vue telle quelle.
   Pas de phare animé (18-reperage.js) : la capture qui suit le montrerait à moitié. */
function piloteCible(page, v) {
  if (page === "schema") return schCibleTrouver(v);
  if (page === "pcb") return pcbCibleTrouver(v);
  const q = String(v).toLowerCase();
  const ref = [...V.parRef.keys()].find(r => r.toLowerCase() === q);
  // choisirComp sans centrer désélectionne le composant déjà choisi : ne pas le rappeler
  if (ref) return { cle: ref, aller: garder => { if (!(garder && V.comp === ref)) choisirComp(ref, !garder); } };
  const i = V.parNet.findIndex(n => String(n.nom).toLowerCase() === q);
  if (i >= 0) return { cle: V.parNet[i].nom, net: true, aller: () => { if (V.net !== i) choisirNet(i, false); } };
  return null;
}

function piloteCouches(page, noms) {
  if (page === "schema") throw new Error("« couches » : seulement au PCB et dans la visionneuse.");
  const toutes = page === "pcb" ? S.cuL.slice(0, S.cu).map((c, i) => ({ c, nom: LECTURE_CAO.aides.nomCouchePcb(i) }))
                                : V.couches.map(c => ({ c, nom: c.nom }));
  const voulues = new Set();
  for (const n of noms) {
    const t = toutes.find(x => String(x.nom).toLowerCase() === String(n).toLowerCase());
    if (!t) throw new Error("Couche « " + n + " » inconnue. Couches : " + LECTURE_CAO.aides.borner(toutes.map(x => x.nom), 40, "couches").join(", ") + ".");
    voulues.add(t.c);
  }
  return () => {
    for (const { c } of toutes) c[page === "pcb" ? "vis" : "visible"] = voulues.has(c);
    // la visionneuse n'enregistre pas ce choix dans ses préférences (prefEcrire) : il vient de Claude
    // pas de touch() : S.ver est la révision de la carte, la changer périmerait les simulations
    if (page === "pcb") { buildLayers(); buildTabs(); draw(); } else { pnlCouches(); dessiner(); }
  };
}

/* Feuilles du schéma où se trouve une cible : celle du repère, ou celles des broches du net. */
function schFeuillesDe(t) {
  const q = String(t.cle).trim().toUpperCase();
  if (t.type === "composant")
    return [S.pages.findIndex((p, i) => (i === S.page ? S.comps : p.comps || []).some(c => (c.ref || "").trim().toUpperCase() === q))];
  const g = docNets().groups.find(x => x.name === t.cle);
  return g ? [...new Set(g.members.map(m => m.page))] : [];
}

/* Aller à une cible. Surligner un net ne touche pas à la sélection : sélectionner tout son
   routage (selectNetRouting, selectNet) le livrerait à la touche Suppr de l'utilisateur. */
function piloteAller(page, t, garder, feuille) {
  if (page === "visionneuse-ipc") return t.aller(garder);
  const net = /^net/.test(t.type);
  if (page === "schema" && net) {
    if (S.page !== feuille) gotoPage(feuille);         // aller() irait à la feuille du premier membre
    const n = nets().list.find(x => x.name === t.cle);
    if (garder) { S.hoverNet = n || null; return draw(); }
    selectNet(n);
    const b = rpNetBox(n);
    if (b) rpCadrer(b);
    return draw();
  }
  if (garder && net) { S.hlNet = t.cle; return draw(); }
  const vue = [S.scale, S.ox, S.oy];
  t.aller();
  if (garder) { [S.scale, S.ox, S.oy] = vue; draw(); }   // surligner sans bouger la vue
}

async function piloteVue(page, a) {
  if (page === "visionneuse-ipc" && !(typeof V !== "undefined" && V && V.modele))
    throw new Error("Aucun fichier IPC-2581 ouvert dans la visionneuse.");
  const faire = [], dit = [];
  let feuille = page === "schema" ? S.page : null;     // la feuille affichée après chaque étape
  if (a.feuille != null) {
    if (page !== "schema") throw new Error("« feuille » : seulement au schéma.");
    if (!Number.isInteger(a.feuille) || !S.pages[a.feuille - 1])
      throw new Error("Feuille " + a.feuille + " inconnue : 1 à " + S.pages.length + ".");
    feuille = a.feuille - 1;
    faire.push(() => gotoPage(feuille)); dit.push("feuille f" + a.feuille);
  }
  if (a.couches) {
    if (!Array.isArray(a.couches)) throw new Error("« couches » : une liste de noms de couches.");
    faire.push(piloteCouches(page, a.couches)); dit.push("couches visibles : " + a.couches.join(", "));
  }
  if (a.ajuster) { faire.push(() => fit()); dit.push("vue ajustée à tout le document"); }
  for (const [cle, garder] of [["cadrer", false], ["surligner", true]]) {
    if (a[cle] == null) continue;
    const t = piloteCible(page, a[cle]);
    if (!t) throw new Error("« " + a[cle] + " » : ni repère ni net de cette page (voir les lectures « composants » et « nets »).");
    if (page === "schema") {
      const fs = schFeuillesDe(t);
      if (!fs.includes(feuille)) {
        // surligner garde la vue, et « feuille » est explicite : ni l'un ni l'autre ne change de feuille en douce
        if (garder || a.feuille != null)
          throw new Error("« " + t.cle + " » est sur " + fs.map(i => "f" + (i + 1)).join(", ") + ", pas sur f" + (feuille + 1) +
                          (garder ? " : donne « feuille », ou utilise « cadrer »." : " : change « feuille »."));
        feuille = fs[0];
      }
    }
    const f = feuille;
    faire.push(() => piloteAller(page, t, garder, f));
    dit.push((garder ? "surligné " : "cadré sur ") + t.cle + (page === "schema" && !garder ? " (f" + (f + 1) + ")" : "") +
             (t.net && !garder ? " (la visionneuse surligne un net sans le cadrer)" : ""));
  }
  if (!faire.length) throw new Error("Rien à faire : cadrer, surligner, feuille, couches ou ajuster.");
  faire.forEach(f => f());
  return "Vue : " + dit.join(" ; ") + ".";
}

/* cao_drc : le bouton DRC de la page (onglet DRC ouvert, compte rendu), puis la même
   lecture que cao_pcb_lire « drc ». Le résultat n'entre pas dans l'historique. */
async function piloteDrc() {
  document.getElementById("bDrc").onclick();
  return [].concat(LECTURE_CAO.pcb.drc.fn({})).join("\n");
}

/* cao_interface_lire / cao_interface : l'interface de la page telle que l'utilisateur la voit, pour ce
   qu'aucune autre commande ne fait (menus, boutons, réglages, gestes sur le canevas). Les contrôles
   visibles sont numérotés (data-pilote). Le panneau « Claude » n'en fait jamais partie : Claude
   n'appuie pas sur ses propres cartes ni sur l'interrupteur. */
const PILOTE_CONTROLES = "button, a[href], input, select, textarea, summary, [contenteditable=true], [onclick], " +
                         "[role=button], [role=tab], [role=menuitem], [role=checkbox], [role=option], [role=switch]";

function piloteDansPanneau(e) { return !!(e && e.closest && e.closest("aside.pilote")); }

function piloteLibelle(e) {
  // un champ n'a pas de texte à lui (celui d'un select, ce sont ses choix) : son <label>, ou celui qui le précède
  const champ = /^(INPUT|SELECT|TEXTAREA)$/.test(e.tagName);
  const avant = e.previousElementSibling;
  let t = e.getAttribute("aria-label") || (champ ? (e.labels && e.labels[0] && e.labels[0].textContent) ||
          (avant && avant.tagName === "LABEL" && avant.textContent) || e.placeholder || e.name : e.innerText) || "";
  if (e.title && e.title !== t) t = t ? t + " — " + e.title : e.title;   // l'infobulle des boutons à icône
  return String(t).replace(/\s+/g, " ").trim().slice(0, 100);
}

function piloteEtatUi(e) {
  const t = (e.type || "").toLowerCase(), d = [];
  if (t === "checkbox" || t === "radio") d.push(e.checked ? "coché" : "décoché");
  else if (e.tagName === "SELECT")
    d.push("= « " + (e.selectedOptions[0] ? e.selectedOptions[0].text.trim() : "") + " » parmi : " +
           [...e.options].slice(0, 40).map(o => o.text.trim()).join(" | ") + (e.options.length > 40 ? " | …" : ""));
  else if (/^(INPUT|TEXTAREA)$/.test(e.tagName) && !/^(button|submit|reset|file)$/.test(t))
    d.push("= « " + String(e.value).slice(0, 80) + " »");
  if (e.disabled) d.push("désactivé");
  if (e.getAttribute("aria-selected") === "true" || e.getAttribute("aria-pressed") === "true" || e.classList.contains("active"))
    d.push("actif");
  return d.join(", ");
}

function piloteInterfaceLire(page, a) {
  const filtre = String(a.filtre || "").toLowerCase();
  document.querySelectorAll("[data-pilote]").forEach(e => e.removeAttribute("data-pilote"));
  const L = [];
  let n = 0;
  for (const e of document.querySelectorAll(PILOTE_CONTROLES)) {
    if (piloteDansPanneau(e) || e.type === "hidden" || !e.getClientRects().length || getComputedStyle(e).visibility === "hidden")
      continue;
    e.dataset.pilote = ++n;        // numéroté même hors filtre : un numéro ne dépend pas du filtre
    const lib = piloteLibelle(e), etat = piloteEtatUi(e);
    if (filtre && !(lib + " " + etat + " " + e.id).toLowerCase().includes(filtre)) continue;
    L.push("[" + n + "] " + e.tagName.toLowerCase() + (e.type && e.tagName === "INPUT" ? "/" + e.type : "") +
           (e.id ? " #" + e.id : "") + " « " + lib + " »" + (etat ? " (" + etat + ")" : ""));
  }
  const t = piloteToile(page);
  const r = t && t.getBoundingClientRect();
  if (r && r.width) {
    const k = piloteEchelle(t);
    L.unshift("Canevas (gestes « souris ») : " + Math.round(t.width * k) + " × " + Math.round(t.height * k) +
              " px, les coordonnées de pilote_capture.");
  }
  return (L.length ? L : ["Aucun contrôle visible" + (filtre ? " pour « " + filtre + " »." : ".")]).join("\n");
}

const PILOTE_TOILES = { schema: "sheet", pcb: "board", "visionneuse-ipc": "carte", "gestion-lib": "canvasPcbInsp" };
function piloteToile(page) { return PILOTE_TOILES[page] ? document.getElementById(PILOTE_TOILES[page]) : null; }
// pilote.js réduit la capture à 1600 px de côté (LARGEUR_MAX) : les mêmes coordonnées que l'image
function piloteEchelle(t) { return Math.min(1, 1600 / t.width, 1600 / t.height); }

function piloteCibleUi(c) {
  const s = String(c == null ? "" : c).trim();
  let e = null;
  try { e = /^\d+$/.test(s) ? document.querySelector('[data-pilote="' + s + '"]') : s && document.querySelector(s); }
  catch (_) { throw new Error("« cible » : un numéro rendu par cao_interface_lire, ou un sélecteur CSS (#bDrc)."); }
  if (!e) throw new Error("Cible « " + s + " » introuvable : relis l'interface (cao_interface_lire), elle a pu changer.");
  if (piloteDansPanneau(e)) throw new Error("Le panneau « Claude » est réservé à l'utilisateur.");
  if (e.disabled) throw new Error("« " + piloteLibelle(e) + " » est désactivé.");
  return e;
}

/* « Ctrl+Shift+Z », « Delete », « Escape », « r »… : la touche en dernier, au nom du DOM (KeyboardEvent.key). */
function piloteTouches(texte) {
  const m = /^(.*?)\+?([^+]+|\+)$/.exec(String(texte || "").trim());
  if (!m) throw new Error("Touche vide : « Ctrl+Z », « Delete », « Escape », « r »…");
  const mods = { ctrlKey: false, shiftKey: false, altKey: false, metaKey: false };
  for (const p of m[1].split("+").filter(Boolean)) {
    const cle = { ctrl: "ctrlKey", control: "ctrlKey", shift: "shiftKey", maj: "shiftKey", alt: "altKey", meta: "metaKey", cmd: "metaKey" }[p.toLowerCase()];
    if (!cle) throw new Error("Modificateur « " + p + " » inconnu : Ctrl, Shift, Alt, Meta.");
    mods[cle] = true;
  }
  let key = m[2];
  if (key.length === 1) key = mods.shiftKey ? key.toUpperCase() : key.toLowerCase();
  const code = /^[a-z]$/i.test(key) ? "Key" + key.toUpperCase() : /^\d$/.test(key) ? "Digit" + key : key;
  return Object.assign({ key, code }, mods);
}

function piloteSouris(e, type, x, y, o) {
  const Ev = type.startsWith("pointer") ? PointerEvent : type === "wheel" ? WheelEvent : MouseEvent;
  return e.dispatchEvent(new Ev(type, Object.assign({ bubbles: true, cancelable: true, composed: true, view: window,
    clientX: x, clientY: y, button: 0, buttons: 0, pointerId: 1, pointerType: "mouse", isPrimary: true }, o)));
}

/* Un clic comme le navigateur le fait : pointer puis souris (sauf pointerdown empêché), puis click. */
function piloteClic(e, x, y, o, detail) {
  const bas = Object.assign({}, o, { buttons: o.button === 2 ? 2 : 1, detail });
  const compat = piloteSouris(e, "pointerdown", x, y, bas);
  if (compat) piloteSouris(e, "mousedown", x, y, bas);
  piloteSouris(e, "pointerup", x, y, Object.assign({}, o, { detail }));
  if (compat) piloteSouris(e, "mouseup", x, y, Object.assign({}, o, { detail }));
  piloteSouris(e, o.button === 2 ? "contextmenu" : "click", x, y, Object.assign({}, o, { detail }));
}

function piloteGeste(page, a) {
  const g = a.geste;
  if (g === "cliquer" || g === "saisir") {
    const e = piloteCibleUi(a.cible), lib = "« " + piloteLibelle(e) + " »";
    if (g === "cliquer") return { titre: "Interface : cliquer " + lib, faire: () => {
      const r = e.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
      if (typeof e.focus === "function") e.focus();
      piloteClic(e, x, y, { button: 0 }, 1);
      return "Cliqué " + lib + ".";
    } };
    if (a.valeur == null) throw new Error("« saisir » : donne « valeur ».");
    const t = (e.type || "").toLowerCase(), v = a.valeur;
    if (t === "checkbox" || t === "radio") {
      const voulu = v === true || /^(true|1|oui|coché)$/i.test(String(v));
      return { titre: "Interface : " + lib, avant: e.checked ? "coché" : "décoché", apres: voulu ? "coché" : "décoché",
               faire: () => { if (e.checked !== voulu) e.click(); return lib + (e.checked ? " coché." : " décoché."); } };
    }
    if (e.tagName === "SELECT") {
      const q = String(v).trim().toLowerCase();
      const o = [...e.options].find(x => x.value.toLowerCase() === q) || [...e.options].find(x => x.text.trim().toLowerCase() === q);
      if (!o) throw new Error(lib + " : « " + v + " » n'est pas un choix (" + [...e.options].map(x => x.text.trim()).join(" | ") + ").");
      return { titre: "Interface : " + lib, avant: e.selectedOptions[0] ? e.selectedOptions[0].text.trim() : "", apres: o.text.trim(),
               faire: () => { e.value = o.value; piloteChange(e); return lib + " = « " + o.text.trim() + " »."; } };
    }
    if (!/^(INPUT|TEXTAREA)$/.test(e.tagName) && !e.isContentEditable) throw new Error(lib + " n'est pas un champ à remplir.");
    const avant = e.isContentEditable ? e.innerText : e.value;
    return { titre: "Interface : " + lib, avant, apres: String(v), faire: () => {
      if (typeof e.focus === "function") e.focus();
      if (e.isContentEditable) e.textContent = String(v);
      // le setter natif : une valeur posée par e.value = … échappe aux composants qui le surchargent
      else Object.getOwnPropertyDescriptor(Object.getPrototypeOf(e), "value").set.call(e, String(v));
      piloteChange(e);
      return lib + " = « " + String(v).slice(0, 80) + " ».";
    } };
  }
  if (g === "touche") {
    const k = piloteTouches(a.touche);
    const nom = String(a.touche).trim();
    return { titre: "Interface : touche " + nom, faire: () => {
      let e = a.cible != null ? piloteCibleUi(a.cible) : document.activeElement;
      if (!e || e === document.documentElement || piloteDansPanneau(e)) e = document.body;   // pas le bouton « Appliquer » de la carte
      const o = Object.assign({ bubbles: true, cancelable: true, composed: true, view: window }, k);
      e.dispatchEvent(new KeyboardEvent("keydown", o));
      e.dispatchEvent(new KeyboardEvent("keyup", o));
      return "Touche " + nom + ".";
    } };
  }
  if (g === "souris") {
    const t = piloteToile(page);
    if (!t) throw new Error("Pas de canevas dans cette page : « cliquer » un contrôle de cao_interface_lire.");
    const k = piloteEchelle(t);
    const point = (x, y) => {
      if (typeof x !== "number" || typeof y !== "number") throw new Error("« souris » : x et y, en pixels de la capture.");
      const r = t.getBoundingClientRect();
      return [r.left + x / k * r.width / t.width, r.top + y / k * r.height / t.height];
    };
    const [x, y] = point(a.x, a.y);
    const fin = a.x2 != null || a.y2 != null ? point(a.x2, a.y2) : null;
    const mods = a.modificateurs ? piloteTouches(a.modificateurs + "+x") : {};
    delete mods.key; delete mods.code;
    const quoi = a.molette ? "molette " + a.molette : fin ? "glisser jusqu'à (" + a.x2 + ", " + a.y2 + ")" :
                 (a.double ? "double-clic" : a.droit ? "clic droit" : "clic");
    return { titre: "Interface : " + quoi + " sur le canevas en (" + a.x + ", " + a.y + ")" +
                    (a.modificateurs ? " avec " + a.modificateurs : ""), faire: () => {
      const e = document.elementFromPoint(x, y);
      if (!e) throw new Error("Ce point du canevas est hors de l'écran : cao_vue pour cadrer, puis une nouvelle capture.");
      if (piloteDansPanneau(e)) throw new Error("Le panneau « Claude » couvre ce point : demande à l'utilisateur de le replier.");
      const o = Object.assign({ button: a.droit ? 2 : 0 }, mods);
      piloteSouris(e, "pointermove", x, y, o);
      piloteSouris(e, "mousemove", x, y, o);
      if (a.molette) piloteSouris(e, "wheel", x, y, Object.assign({ deltaY: a.molette, deltaMode: 0 }, o));
      else if (fin) {
        const bas = Object.assign({}, o, { buttons: 1 });
        piloteSouris(e, "pointerdown", x, y, bas);
        piloteSouris(e, "mousedown", x, y, bas);
        for (let i = 1; i <= 8; i++) {
          const xi = x + (fin[0] - x) * i / 8, yi = y + (fin[1] - y) * i / 8;
          piloteSouris(e, "pointermove", xi, yi, bas);
          piloteSouris(e, "mousemove", xi, yi, bas);
        }
        piloteSouris(e, "pointerup", fin[0], fin[1], o);
        piloteSouris(e, "mouseup", fin[0], fin[1], o);
      } else {
        piloteClic(e, x, y, o, 1);
        if (a.double) { piloteClic(e, x, y, o, 2); piloteSouris(e, "dblclick", x, y, Object.assign({ detail: 2 }, o)); }
      }
      return quoi[0].toUpperCase() + quoi.slice(1) + " fait sur le canevas.";
    } };
  }
  throw new Error("« geste » : cliquer, saisir, touche ou souris.");
}

function piloteChange(e) {
  e.dispatchEvent(new Event("input", { bubbles: true }));
  e.dispatchEvent(new Event("change", { bubbles: true }));
}

/* Une écriture comme les autres : la carte attend le clic, sauf interrupteur allumé. Le geste est
   recalculé au clic (le contrôle a pu bouger depuis la carte). */
function piloteInterface(page) {
  return {
    ecriture: true,
    irreversible: "Un geste dans l'interface, comme le tien : la carte ne l'annule pas (Ctrl+Z dans l'éditeur, " +
                  "si le geste y fait une étape).",
    proposer: a => { const p = piloteGeste(page, a); return { titre: p.titre, avant: p.avant, apres: p.apres }; },
    appliquer: async a => {
      const dit = piloteGeste(page, a).faire();
      await new Promise(r => requestAnimationFrame(() => setTimeout(r, 50)));   // laisser la page se redessiner
      return dit;
    },
  };
}

/* L'aide des commandes, pour qui pilote la page depuis sa console : Pilote.aide() liste celles de
   la page, Pilote.aide("cao_schema_dessiner") donne la description et le schéma des arguments.
   commun/pilote-aide.json est tiré des définitions du MCP (web_suite/lanceur/aide_pilote.py). */
function piloteAideTexte(cat, nom, declarees) {
  const O = (cat && cat.outils) || {};
  if (nom == null) {
    const L = ["Commandes de cette page (Pilote.aide(\"nom\") pour le détail) :"];
    for (const n of [...declarees].sort()) L.push("- " + n + (O[n] ? " : " + O[n].description.split(". ")[0] + "." : ""));
    const api = Object.keys(O).filter(n => !declarees.includes(n)).sort();
    if (api.length) L.push("Par l'API seulement (MCP) : " + api.join(", ") + ".");
    return L.join("\n");
  }
  const o = Object.prototype.hasOwnProperty.call(O, nom) ? O[nom] : null;
  if (!o) return "« " + nom + " » : pas une commande connue (Pilote.aide() les liste).";
  return nom + (declarees.includes(nom) ? "" : " (pas déclarée dans cette page)") + "\n\n" + o.description +
         "\n\nArguments :\n" + JSON.stringify(o.arguments, null, 2);
}

function piloteCao(page) {
  if (typeof Pilote === "undefined") return;
  Pilote.declarer({ page, projet: () => (typeof projNom === "function" ? projNom() : "") });
  let catalogue = null;
  Pilote.aide = async nom => {
    if (!catalogue) catalogue = await fetch("../commun/pilote-aide.json").then(r => r.json());
    return piloteAideTexte(catalogue, nom, Object.keys(Pilote.commandes || {}));
  };
  if (PILOTE_TOILES[page]) Pilote.capture(() => piloteToile(page));
  Pilote.commande("cao_interface_lire", { executer: async a => piloteInterfaceLire(page, a) });
  Pilote.commande("cao_interface", piloteInterface(page));
  if (page === "pcb" || page === "visionneuse-ipc") {
    Pilote.commande("cao_calcul", { executer: piloteCaoCalcul });
    Pilote.commande("cao_sim_ecrire", ECRITURE_CAO.simulation);
  }
  if (page === "schema") Pilote.commande("cao_valeur_composant", PILOTE_VALEUR);
  if (page === "schema") Pilote.commande("cao_composants_ecrire", ECRITURE_CAO.composantsSch);
  if (page === "schema") Pilote.commande("cao_classes_ecrire", ECRITURE_CAO.classesSch);
  if (page === "schema") Pilote.commande("cao_contraintes_ecrire", ECRITURE_CAO.contraintesSch);
  if (page === "schema" && typeof dessinPiloteCommande === "function") Pilote.commande("cao_schema_dessiner", dessinPiloteCommande());
  if (page === "pcb") {
    Pilote.commande("cao_composants_ecrire", ECRITURE_CAO.composantsPcb);
    Pilote.commande("cao_pistes_ecrire", ECRITURE_CAO.pistes);
    Pilote.commande("cao_classes_ecrire", ECRITURE_CAO.classes);
    Pilote.commande("cao_contraintes_ecrire", ECRITURE_CAO.contraintes);
    Pilote.commande("cao_contour_ecrire", ECRITURE_CAO.contour);
    Pilote.commande("cao_decoupes_ecrire", ECRITURE_CAO.decoupes);
    Pilote.commande("cao_interdits_ecrire", ECRITURE_CAO.interdits);
    if (typeof pcbThermiqueEstimer === "function")
      Pilote.commande("cao_thermique", { executer: async () => thermiqueTexte(await pcbThermiqueEstimer()) });
    Pilote.commande("cao_zones_ecrire", ECRITURE_CAO.zones);
    Pilote.commande("cao_serigraphie_ecrire", ECRITURE_CAO.serigraphie);
    Pilote.commande("cao_pastille_regler", ECRITURE_CAO.pastilles);
    if (typeof routagePiloteCommandes === "function")
      for (const [nom, def] of Object.entries(routagePiloteCommandes())) Pilote.commande(nom, def);
  }
  for (const f of PILOTE_LIRE[page] || []) Pilote.commande("cao_" + f + "_lire", { executer: async a => piloteLire(f, a) });
  if (PILOTE_LIRE[page]) Pilote.commande("cao_vue", { executer: a => piloteVue(page, a) });
  if (page === "pcb") Pilote.commande("cao_drc", { executer: piloteDrc });
  if (page === "gestion-lib" && typeof libPiloteCommandes === "function")
    for (const [nom, def] of Object.entries(libPiloteCommandes())) Pilote.commande(nom, def);
}
