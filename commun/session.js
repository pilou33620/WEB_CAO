"use strict";
/* ==========================================================================
   Session de travail — module commun aux quatre outils
   Le schéma, le PCB, la recherche de composants et la visionneuse IPC-2581
   sont quatre pages HTML distinctes : passer de l'une à l'autre, c'est
   quitter la page. Sans filet,
   tout ce qui n'était pas enregistré sur disque disparaissait — aller vérifier
   une valeur sur le schéma coûtait le routage en cours.

   Ce module met le travail de côté avant de partir et le reprend en arrivant.
   Le stockage est `sessionStorage`, et ce choix est la définition même du
   besoin : il est propre à l'onglet, il survit à la navigation ET au
   rechargement, il disparaît à la fermeture de l'onglet. Deux onglets ouverts
   sur la même carte ne se marchent donc pas dessus, et rien ne traîne après
   coup — contrairement à `localStorage`, où l'éditeur schématique garde par
   ailleurs sa sauvegarde de secours (qui, elle, doit survivre à un plantage).

   Ce fichier ne connaît rien des documents qu'il transporte : chaque outil
   déclare comment se photographier, et comment se relire.

     // au démarrage de l'éditeur, une fois l'interface en place
     const repris = sessBrancher("pcb", () => ({doc:docObj(), sale:S.dirty}));
     if (repris) { loadDoc(repris.etat.doc, true); S.dirty = repris.etat.sale; }

   Trois points d'écriture, pour ne rien perdre quel que soit le geste :
   le clic sur un bouton de navigation, `pagehide` (fermeture, rechargement,
   flèche « précédent ») et le passage en arrière-plan de l'onglet.
   ========================================================================== */

/* Version dans la clé : un état écrit par une version antérieure du format
   n'est pas relu de travers, il est simplement ignoré. */
const SESS_CLE = "cao.session.v1.";
/* Garde-fou de quota : sessionStorage plafonne autour de 5 Mo par origine, et
   les quatre outils se le partagent. Au-delà, on préfère renoncer proprement
   (et le dire) plutôt que de faire échouer l'écriture au dernier moment. */
const SESS_MAX = 3 * 1024 * 1024;

/* Les quatre outils et la page d'accueil, avec leur chemin depuis le dossier
   d'un outil. Chemins RELATIFS à dessein : « /editeur-pcb/ » ne marche qu'avec
   un serveur, et pas en double-clic sur le fichier (file://). */
const SESS_OUTILS = {
  schema:     {titre:"Éditeur schématique",     page:"editeur-schematique/editeur-schematique.html"},
  pcb:        {titre:"Éditeur PCB",             page:"editeur-pcb/editeur-pcb.html"},
  composants: {titre:"Recherche de composants", page:"recherche-composants/recherche-composants.html"},
  ipc2581:    {titre:"Visionneuse IPC-2581",     page:"visionneuse-ipc2581/visionneuse-ipc2581.html"},
  accueil:    {titre:"Accueil",                 page:"index.html"}
};

let SESS_OUTIL = null;      // nom de l'outil hôte, une fois branché
let SESS_CAPTURE = null;    // fonction fournissant l'état à conserver
let SESS_SONDE = null;      // fonction (cible) -> {quoi,valeur}|null, pour le cross-probing
let SESS_QUITTE = false;    // vrai pendant une sortie vers un autre outil
let SESS_DISPO;             // undefined = pas encore testé

/* ==========================================================================
   Stockage
   ========================================================================== */
/* Mode privé, contexte restreint, stockage désactivé par une stratégie : rien
   de tout cela ne doit empêcher l'éditeur de s'ouvrir. On teste une fois. */
function sessStock(){
  if(SESS_DISPO !== undefined) return SESS_DISPO;
  SESS_DISPO = null;
  try{
    const s = window.sessionStorage;
    if(!s) return SESS_DISPO;
    s.setItem(SESS_CLE + "essai", "1");
    s.removeItem(SESS_CLE + "essai");
    SESS_DISPO = s;
  }catch(_){ SESS_DISPO = null; }
  return SESS_DISPO;
}
function sessEcrire(outil, etat){
  const s = sessStock();
  if(!s || !outil) return false;
  let txt;
  try{ txt = JSON.stringify({v:1, t:Date.now(), etat:etat}); }
  catch(_){ return false; }              // structure circulaire : on renonce
  if(!txt || txt.length > SESS_MAX) return false;
  try{ s.setItem(SESS_CLE + outil, txt); return true; }
  catch(_){
    /* quota dépassé : l'ancien état est devenu faux, mieux vaut plus rien
       qu'un document périmé qui écraserait le travail au retour */
    try{ s.removeItem(SESS_CLE + outil); }catch(__){}
    return false;
  }
}
/* Poids d'un état une fois sérialisé, ou l'infini s'il ne se sérialise pas.
   sessTient() répond à la seule question qui compte pour un outil capable de
   se contenter de moins : ça passe, ou il faut alléger ? */
function sessPoids(etat){
  let t;
  try{ t = JSON.stringify({v:1, t:0, etat:etat}); }catch(_){ return Infinity; }
  return t ? t.length : Infinity;
}
function sessTient(etat){ return sessPoids(etat) <= SESS_MAX; }

/* Renvoie {t, etat} ou null. Rien de ce qui est relu n'est cru sur parole :
   c'est l'appelant qui normalise le document, exactement comme à l'import. */
function sessLire(outil){
  const s = sessStock();
  if(!s || !outil) return null;
  let raw = null;
  try{ raw = s.getItem(SESS_CLE + outil); }catch(_){ return null; }
  if(!raw) return null;
  let o = null;
  try{ o = JSON.parse(raw); }catch(_){ sessEffacer(outil); return null; }
  if(!o || typeof o !== "object" || o.v !== 1 ||
     !o.etat || typeof o.etat !== "object"){ sessEffacer(outil); return null; }
  return {t: (+o.t || 0), etat: o.etat};
}
function sessEffacer(outil){
  const s = sessStock();
  if(!s || !outil) return;
  try{ s.removeItem(SESS_CLE + outil); }catch(_){}
}

/* ==========================================================================
   Cross-probing : « va voir CE composant, CE net, sur l'autre outil »
   --------------------------------------------------------------------------
   Un canal distinct du document transporté ci-dessus : celui-ci ne vit qu'une
   navigation, jamais relu au retour ni au rechargement. sessAller() l'écrit
   juste avant de partir, quand l'outil d'origine a déclaré un `sonde` à
   sessBrancher() et que ce sonde répond quelque chose pour la destination ;
   l'outil d'arrivée le consomme lui-même une fois son document en place, avec
   sessCiblePrendre() — ce fichier ne sait pas ce qu'est une « référence » ou
   un « net », il ne fait que porter la valeur d'un outil à l'autre.
   ========================================================================== */
const SESS_CLE_CIBLE = SESS_CLE + "cible";

function sessCibleEcrire(cible, quoi, valeur){
  const s = sessStock();
  if(!s || !cible || !quoi || !valeur) return;
  try{
    s.setItem(SESS_CLE_CIBLE,
      JSON.stringify({v:1, outil:cible, quoi:quoi, valeur:String(valeur)}));
  }catch(_){}
}
/* Rend {quoi, valeur} pour CET outil, ou null — et ne rend qu'une fois : une
   cible consommée ne doit pas ressurgir à un rechargement de page, ni à un
   aller-retour ultérieur qui ne l'a pas redemandée. `outil` doit correspondre
   à la destination déclarée par sessCibleEcrire() : une cible écrite pour le
   PCB ne doit pas être reprise par la visionneuse si elle démarre la première. */
/* Consommer une cible APRES que la page a fini de se mettre en place.

   Pourquoi pas tout de suite : commun/workspace.js est charge EN DERNIER dans
   les deux editeurs, et il se termine par resize() puis fit() -- un cadrage
   sur le document entier. Appelee au fil du script, la cible etait bien
   trouvee et selectionnee, puis fit() effacait aussitot le cadrage fait sur
   elle : sur une carte un peu grande, la selection devenait un point invisible
   et le saut paraissait n'avoir rien fait. L'evenement « load » passe
   forcement apres le dernier script de la page. */
function sessCibleAuChargement(fn){
  if(typeof fn !== "function") return;
  let pret = false;
  try{ pret = (document.readyState === "complete"); }catch(_){}
  if(pret){ fn(); return; }
  try{ window.addEventListener("load", function(){ fn(); }, {once:true}); }
  catch(_){ fn(); }
}
function sessCiblePrendre(outil){
  const s = sessStock();
  if(!s || !outil) return null;
  let raw = null;
  try{ raw = s.getItem(SESS_CLE_CIBLE); }catch(_){ return null; }
  if(!raw) return null;
  try{ s.removeItem(SESS_CLE_CIBLE); }catch(_){}   // consommée, quel que soit le résultat
  let o = null;
  try{ o = JSON.parse(raw); }catch(_){ return null; }
  if(!o || o.v !== 1 || o.outil !== outil || !o.quoi || !o.valeur) return null;
  return {quoi: o.quoi, valeur: o.valeur};
}

/* ==========================================================================
   Cross-probing entre deux onglets ouverts cote a cote
   --------------------------------------------------------------------------
   Le canal ci-dessus passe par sessionStorage : il suit UNE navigation, dans
   UN onglet. Deux onglets cote a cote -- l'un sur le schema, l'autre sur le
   PCB -- ne le partagent donc pas, et c'est voulu : sessionStorage est propre
   a l'onglet, c'est ce qui evite que deux cartes ouvertes en parallele se
   melangent.

   Celui-ci repond a l'autre besoin : montrer, dans l'onglet d'a cote, ce qui
   est selectionne ici. BroadcastChannel porte le message entre deux pages de
   meme origine, sans serveur ni stockage.

   SUR DEMANDE, et non en suivi permanent : l'onglet voisin ne saute que
   lorsqu'on le lui demande. Un suivi automatique le ferait bouger a chaque
   clic, et il deviendrait impossible d'y travailler.

   Deux limites, dites plutot que subies :
     - un navigateur sans BroadcastChannel ne partage rien (sessCanalDispo) ;
     - en double-clic sur les fichiers (file://), deux onglets n'ont pas la
       meme origine au sens du navigateur : le message ne passe pas. Il faut
       alors servir le depot (python serveur.py), comme pour la recherche de
       composants.
   ========================================================================== */
const SESS_CANAL = "cao.probe.v1";
const SESS_ACK_MS = 400;      // au-dela, personne n'ecoute a cote

let SESS_BC;                  // undefined = pas encore tente, null = indisponible
let SESS_BC_ACK = null;       // fonction attendant l'accuse de reception

function sessCanal(){
  if(SESS_BC !== undefined) return SESS_BC;
  SESS_BC = null;
  try{
    if(typeof BroadcastChannel === "function")
      SESS_BC = new BroadcastChannel(SESS_CANAL);
  }catch(_){ SESS_BC = null; }
  return SESS_BC;
}
function sessCanalDispo(){ return !!sessCanal(); }

/* CET onglet ecoute pour `outil`. `fn(quoi, valeur)` doit renvoyer vrai si la
   cible a ete trouvee et montree : l'onglet qui a demande l'apprend en retour
   et peut le dire, au lieu de laisser croire que c'est parti dans le vide.

   Pas de window.focus() ici : l'interet du geste est de regarder l'autre
   fenetre deja visible, pas de la faire passer devant -- et la plupart des
   navigateurs refusent de toute facon de donner le focus a une page qui le
   reclame seule. */
function sessEcouterProbe(outil, fn){
  const bc = sessCanal();
  if(!bc || !outil || typeof fn !== "function") return false;
  bc.onmessage = function(ev){
    const m = ev && ev.data;
    if(!m || m.v !== 1) return;
    if(m.type === "vu"){
      if(SESS_BC_ACK) SESS_BC_ACK(m);
      return;
    }
    if(m.type !== "montre" || m.outil !== outil) return;
    let trouve = false;
    try{ trouve = !!fn(m.quoi, m.valeur); }catch(_){ trouve = false; }
    try{ bc.postMessage({v:1, type:"vu", outil:outil, ok:trouve}); }catch(_){}
  };
  return true;
}

/* Demande a l'onglet voisin de montrer `valeur`. `retour(etat)` recoit :
     "vu"           l'autre onglet l'a trouve et s'est place dessus
     "absent"       il ecoute, mais ce repere n'est pas dans son document
     "personne"     aucun onglet ouvert sur cet outil
     "indisponible" ce navigateur ne sait pas partager entre onglets
   BroadcastChannel ne dit jamais s'il a ete entendu : seule l'absence de
   reponse au bout d'un court delai le dit. */
function sessMontrerAilleurs(cible, quoi, valeur, retour){
  const bc = sessCanal();
  const dire = function(etat){ if(typeof retour === "function") retour(etat); };
  if(!bc || !cible || !quoi || !valeur){ dire("indisponible"); return false; }
  let repondu = false;
  const fini = function(etat){
    if(repondu) return;
    repondu = true; SESS_BC_ACK = null; dire(etat);
  };
  SESS_BC_ACK = function(m){
    if(!m || m.outil !== cible) return;
    fini(m.ok ? "vu" : "absent");
  };
  try{
    bc.postMessage({v:1, type:"montre", outil:cible,
                    quoi:quoi, valeur:String(valeur)});
  }catch(_){ fini("indisponible"); return false; }
  try{ setTimeout(function(){ fini("personne"); }, SESS_ACK_MS); }
  catch(_){ fini("personne"); }
  return true;
}

/* ==========================================================================
   Branchement d'un outil
   ========================================================================== */
/* `capture` doit renvoyer un objet sérialisable, ou rien s'il n'y a rien à
   conserver. Renvoie l'état trouvé pour cet outil dans l'onglet, ou null. */
/* `sonde`, s'il est fourni, répond à « si je pars vers TEL outil maintenant,
   que doit-il regarder ? » -- {quoi:"ref"|"net", valeur} ou rien. C'est ce qui
   fait qu'un clic sur « Éditeur PCB » depuis un composant sélectionné au
   schéma amène directement dessus, sans bouton ni geste supplémentaire :
   quand rien n'est sélectionné, sonde() ne répond rien et la navigation reste
   celle d'avant. */
function sessBrancher(outil, capture, sonde){
  SESS_OUTIL = outil;
  SESS_CAPTURE = (typeof capture === "function") ? capture : null;
  SESS_SONDE = (typeof sonde === "function") ? sonde : null;
  /* pagehide plutôt que beforeunload : il part aussi quand la page est mise en
     cache par la navigation arrière, et il n'est pas escamoté sur mobile. */
  try{ window.addEventListener("pagehide", sessEnregistrer); }catch(_){}
  try{
    document.addEventListener("visibilitychange", function(){
      if(document.visibilityState === "hidden") sessEnregistrer();
    });
  }catch(_){}
  return sessLire(outil);
}
/* Écriture immédiate. Renvoie vrai quand il n'y a rien à perdre : soit le
   travail est en sûreté, soit il n'y avait rien à mettre de côté (une page
   qui n'a pas fini de démarrer, par exemple). Faux uniquement quand quelque
   chose était en jeu et n'a pas pu être conservé — c'est ce que regardent les
   gardes de sortie des éditeurs pour se taire ou non. */
function sessEnregistrer(){
  if(!SESS_OUTIL || !SESS_CAPTURE) return true;
  let etat = null;
  try{ etat = SESS_CAPTURE(); }
  catch(_){ return false; }              // un état incomplet ne vaut rien
  if(!etat) return true;                 // rien à conserver : rien de perdu
  return sessEcrire(SESS_OUTIL, etat);
}
/* Vrai pendant une sortie vers un autre outil de la suite : le travail est en
   session, la question « voulez-vous vraiment quitter ? » n'a plus lieu d'être.
   Elle reste posée pour une vraie fermeture d'onglet, elle, définitive. */
function sessQuitte(){ return SESS_QUITTE; }

/* ==========================================================================
   Navigation entre les outils
   ========================================================================== */
/* Version un seul fichier (dist/) : les autres outils ne sont pas à côté, et
   un lien relatif tomberait dans le vide. La barre s'efface. */
function sessAutonome(){
  try{ return /(^|\/)dist\//.test(location.pathname); }catch(_){ return false; }
}
function sessUrl(cible){
  const o = SESS_OUTILS[cible];
  return o ? "../" + o.page : null;
}
function sessAller(cible){
  const url = sessUrl(cible);
  if(!url) return;
  /* La cible du cross-probing s'écrit AVANT sessEnregistrer() : les deux
     canaux sont indépendants, et l'ordre n'a pas d'effet l'un sur l'autre --
     mais un échec de la sonde (elle est exécutée dans le try) ne doit jamais
     empêcher le départ. */
  if(SESS_SONDE){
    try{
      const s = SESS_SONDE(cible);
      if(s && s.quoi && s.valeur) sessCibleEcrire(cible, s.quoi, s.valeur);
    }catch(_){}
  }
  if(!sessEnregistrer() &&
     !confirm("Le travail en cours n'a pas pu être mis de côté " +
              "(stockage de session plein ou indisponible).\n\n" +
              "Enregistrez-le sur disque d'abord. Changer d'outil quand même ?"))
    return;
  SESS_QUITTE = true;
  location.href = url;
}
/* Câble tous les boutons portant data-cao-nav="schema|pcb|composants|accueil".
   Les pages n'ont ainsi aucune adresse en dur, et un seul endroit décide de la
   mise de côté avant le départ. */
function sessBarre(){
  let btns = [];
  try{ btns = document.querySelectorAll("[data-cao-nav]"); }catch(_){ return 0; }
  const seul = sessAutonome();
  let n = 0;
  for(const b of btns){
    const cible = b.getAttribute("data-cao-nav");
    if(!SESS_OUTILS[cible]){ b.hidden = true; continue; }
    if(seul){ b.hidden = true; continue; }
    b.onclick = function(){ sessAller(cible); };
    n++;
  }
  return n;
}
sessBarre();
