"use strict";
/* ==========================================================================
   Profils utilisateur — module commun aux quatre outils
   Un profil, c'est la façon dont QUELQU'UN se sert de la suite : ses panneaux
   à gauche plutôt qu'à droite, sa grille, son chevelu, ses derniers documents.
   Rien du contenu des cartes ni des schémas — ceux-là vivent dans leurs
   fichiers, et l'onglet les transporte (commun/session.js). Ici on ne garde
   que les habitudes de travail, et on les garde PAR PERSONNE : deux
   utilisateurs sur le même poste ne se défont plus mutuellement leur
   disposition.

   Deux stockages, et ce n'est pas une hésitation :

     · profils/<nom>.json, sur le disque, écrit par serveur.py — c'est le
       profil, celui qu'on sauvegarde, qu'on copie sur un autre poste, qu'on
       lit dans un éditeur de texte. C'est ce que demandait le besoin : un
       fichier par utilisateur, portant son nom.
     · une copie dans localStorage — parce qu'un éditeur ouvert en
       double-clic (file://) ne peut RIEN écrire sur le disque, et parce que
       lire un fichier prend un aller-retour réseau alors que la disposition
       des panneaux doit être là au premier repaint, sans clignotement.

   La copie locale est donc le chemin rapide, le fichier est la référence. Au
   démarrage on part de la copie, puis on va voir le fichier : s'il est plus
   récent (profil modifié sur un autre navigateur du même poste, ou copie
   locale vide sur un navigateur neuf), il gagne et les abonnés réappliquent.
   Toute écriture met à jour la copie tout de suite et le fichier peu après.

   Un outil ne connaît de tout cela que quatre fonctions :

     profLire("espace:pcb.espace-travail.v1")        // ce qui était rangé là
     profEcrire("reglages:pcb", {grille:0.1})        // ranger
     profNoterDocument("pcb", "carte.json")          // derniers documents
     profSurChangement(fn)                           // le profil a changé

   Les sections sont nommées « famille:outil » par convention : le module ne
   les interprète jamais, il les transporte. C'est le lecteur de chaque
   section qui vérifie ce qu'il relit — un profil peut avoir été écrit par une
   version antérieure, recopié à la main, ou tronqué.
   ========================================================================== */

const PROF_FORMAT   = "cao-profil-1";
const PROF_CLE      = "cao.profils.v1.";
const PROF_CLE_QUI  = PROF_CLE + "actuel";      // nom de l'utilisateur courant
const PROF_CLE_LISTE= PROF_CLE + "liste";       // noms connus, même hors ligne
const PROF_CLE_P    = PROF_CLE + "p.";          // + nom -> copie locale du profil
const PROF_PREMIER  = "Pilou";                  // premier utilisateur, à l'installation
const PROF_NOM_MAX  = 40;                       // un nom de fichier reste un nom de fichier
const PROF_MAX      = 512 * 1024;               // garde-fou de quota (localStorage)
const PROF_RECENTS  = 8;                        // longueur des « derniers documents »
const PROF_DELAI    = 700;                      // ms avant l'écriture du fichier

let PROF_NOM   = "";        // utilisateur courant
let PROF_DATA  = null;      // son profil, en mémoire
let PROF_LISTE = [];        // noms connus (copies locales + fichiers du serveur)
let PROF_ABO   = [];        // abonnés au changement de profil
let PROF_ABO_L = [];        // abonnés au changement de la liste des utilisateurs
let PROF_TIMER = 0;         // écriture différée du fichier
let PROF_DISPO;             // undefined = localStorage pas encore testé
let PROF_SERVEUR = null;    // null = pas encore su, true/false = serveur joignable

/* ==========================================================================
   Copie locale
   ========================================================================== */
/* Mode privé, contexte restreint, stockage coupé par une stratégie : rien de
   tout cela ne doit empêcher un éditeur de s'ouvrir. On teste une fois, et
   sans stockage le profil vit en mémoire pour la durée de la page. */
function profStock(){
  if(PROF_DISPO !== undefined) return PROF_DISPO;
  PROF_DISPO = null;
  try{
    const s = window.localStorage;
    if(!s) return PROF_DISPO;
    s.setItem(PROF_CLE + "essai", "1");
    s.removeItem(PROF_CLE + "essai");
    PROF_DISPO = s;
  }catch(_){ PROF_DISPO = null; }
  return PROF_DISPO;
}
function profBrut(cle){
  const s = profStock();
  if(!s) return null;
  try{ return s.getItem(cle); }catch(_){ return null; }
}
function profPoser(cle, txt){
  const s = profStock();
  if(!s) return false;
  try{ s.setItem(cle, txt); return true; }catch(_){ return false; }
}
function profRetirer(cle){
  const s = profStock();
  if(!s) return;
  try{ s.removeItem(cle); }catch(_){}
}

/* ==========================================================================
   Noms d'utilisateur
   ========================================================================== */
/* Un nom d'utilisateur devient un nom de fichier : il n'a donc le droit ni de
   traverser un dossier, ni de désigner un fichier réservé du système. On ne
   corrige pas en silence un nom douteux à moitié — on renvoie "" et l'appelant
   le dit. Les accents, eux, sont les bienvenus : « Aurélie » est un prénom. */
const PROF_RESERVES = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;
function profNomValide(brut){
  let n = String(brut == null ? "" : brut);
  n = n.replace(/[\u0000-\u001f\u007f]/g, "");     // caractères de contrôle
  n = n.replace(/\s+/g, " ").trim();
  if(!n || n.length > PROF_NOM_MAX) return "";
  if(/[\\/:*?"<>|]/.test(n)) return "";            // séparateurs et joker
  if(/^\.+$/.test(n)) return "";                   // « . », « .. »
  if(n.charAt(0) === "." || /[. ]$/.test(n)) return "";
  if(PROF_RESERVES.test(n)) return "";
  return n;
}
function profMemeNom(a, b){
  return String(a).toLowerCase() === String(b).toLowerCase();
}

/* ==========================================================================
   Structure d'un profil
   ========================================================================== */
function profNeuf(nom){
  return {format:PROF_FORMAT, nom:String(nom || ""), t:0, sections:{}};
}
/* Rien de ce qui est relu n'est cru sur parole : le format doit correspondre,
   et une section qui n'est pas un objet est écartée. Ce qu'il y a DEDANS, en
   revanche, c'est au lecteur de la section de le vérifier — workspace.js
   reconstruit sa disposition champ par champ, et les réglages passent par
   leur propre normalisation. */
function profNormaliser(o, nom){
  if(!o || typeof o !== "object" || o.format !== PROF_FORMAT) return null;
  const p = profNeuf(nom || o.nom);
  p.t = (+o.t || 0);
  if(o.sections && typeof o.sections === "object")
    for(const k in o.sections){
      const v = o.sections[k];
      if(v && typeof v === "object") p.sections[k] = v;
    }
  return p;
}
/* Une copie, jamais l'objet rangé : un appelant qui modifie ce qu'il a lu ne
   doit pas modifier le profil sans le dire. */
function profCopie(v){
  if(v == null) return null;
  try{ return JSON.parse(JSON.stringify(v)); }catch(_){ return null; }
}

/* ==========================================================================
   Liste des utilisateurs
   ========================================================================== */
function profListeLire(){
  const raw = profBrut(PROF_CLE_LISTE);
  let arr = null;
  if(raw){ try{ arr = JSON.parse(raw); }catch(_){ arr = null; } }
  const out = [];
  if(Array.isArray(arr))
    for(const n of arr){
      const v = profNomValide(n);
      if(v && !out.some(x => profMemeNom(x, v))) out.push(v);
    }
  return out;
}
function profListeEcrire(){
  profPoser(PROF_CLE_LISTE, JSON.stringify(PROF_LISTE));
}
function profListeAjouter(nom){
  const v = profNomValide(nom);
  if(!v) return "";
  if(!PROF_LISTE.some(x => profMemeNom(x, v))){
    PROF_LISTE.push(v);
    PROF_LISTE.sort((a, b) => a.localeCompare(b, "fr"));
    profListeEcrire();
    profSignalerListe();
  }
  return v;
}
function profListe(){ return PROF_LISTE.slice(); }
function profNom(){ return PROF_NOM; }
/* De quoi renseigner l'utilisateur sans qu'il ait à deviner : qui il est, et
   si ses préférences vont bien dans un fichier ou seulement dans ce
   navigateur. `serveur` vaut null tant que la question n'a pas été tranchée. */
function profEtat(){
  return {nom:PROF_NOM, serveur:PROF_SERVEUR, enLigne:profEnLigne(),
          fichier:"profils/" + PROF_NOM + ".json"};
}

/* ==========================================================================
   Lecture et écriture des sections
   ========================================================================== */
function profLire(section){
  if(!PROF_DATA || !section) return null;
  return profCopie(PROF_DATA.sections[section]);
}
function profEcrire(section, valeur){
  if(!PROF_DATA || !section) return false;
  if(valeur == null){
    if(!(section in PROF_DATA.sections)) return true;
    delete PROF_DATA.sections[section];
  }else{
    const c = profCopie(valeur);
    if(c == null) return false;               // structure circulaire : on renonce
    PROF_DATA.sections[section] = c;
  }
  PROF_DATA.t = Date.now();
  const ok = profEnregistrerLocal();
  profPousser();
  return ok;
}
function profOublier(section){ return profEcrire(section, null); }

function profEnregistrerLocal(){
  if(!PROF_DATA || !PROF_NOM) return false;
  let txt;
  try{ txt = JSON.stringify(PROF_DATA); }catch(_){ return false; }
  if(!txt || txt.length > PROF_MAX) return false;
  return profPoser(PROF_CLE_P + PROF_NOM.toLowerCase(), txt);
}
function profCopieLocale(nom){
  const raw = profBrut(PROF_CLE_P + String(nom).toLowerCase());
  if(!raw) return null;
  let o = null;
  try{ o = JSON.parse(raw); }catch(_){ return null; }
  return profNormaliser(o, nom);
}

/* ==========================================================================
   Derniers documents
   Le navigateur ne rouvre pas un fichier à partir de son nom : ce que garde
   le profil, c'est une mémoire, pas un raccourci. Elle sert à retrouver sur
   quoi on travaillait, pas à y revenir d'un clic — d'où le nom et la date,
   et rien d'autre.
   ========================================================================== */
function profRecents(outil){
  const v = profLire("recents:" + outil);
  const out = [];
  if(Array.isArray(v))
    for(const e of v){
      if(!e || typeof e !== "object") continue;
      const nom = String(e.nom || "").slice(0, 120);
      if(!nom) continue;
      out.push({nom:nom, t:(+e.t || 0)});
    }
  return out.slice(0, PROF_RECENTS);
}
function profNoterDocument(outil, nom){
  const propre = String(nom || "").replace(/[\u0000-\u001f\u007f]/g, "")
                                  .trim().slice(0, 120);
  if(!outil || !propre) return false;
  const liste = profRecents(outil).filter(e => e.nom !== propre);
  liste.unshift({nom:propre, t:Date.now()});
  return profEcrire("recents:" + outil, liste.slice(0, PROF_RECENTS));
}

/* ==========================================================================
   Changement d'utilisateur
   ========================================================================== */
function profSurChangement(fn){
  if(typeof fn === "function") PROF_ABO.push(fn);
}
/* Deux avis distincts, parce que ce ne sont pas les mêmes lecteurs : le
   contenu du profil courant a changé (les panneaux se replacent), ou bien la
   liste des utilisateurs s'est allongée — un fichier trouvé sur le serveur,
   par exemple — et seule une page qui l'affiche a de quoi faire. */
function profSurListe(fn){
  if(typeof fn === "function") PROF_ABO_L.push(fn);
}
function profSignalerListe(){
  for(const fn of PROF_ABO_L.slice()){
    try{ fn(profListe()); }catch(_){}
  }
}
/* Un abonné qui lève ne doit pas empêcher les suivants de se remettre à jour :
   la disposition des panneaux et les réglages de la barre d'outils sont
   indépendants, et l'un cassé ne justifie pas l'autre figé. */
function profSignaler(){
  for(const fn of PROF_ABO.slice()){
    try{ fn(PROF_NOM, PROF_DATA); }catch(_){}
  }
}
/* Adopte un profil déjà normalisé comme profil courant. */
function profAdopter(nom, data){
  PROF_NOM = nom;
  PROF_DATA = data || profNeuf(nom);
  PROF_DATA.nom = nom;
  profPoser(PROF_CLE_QUI, nom);
  profListeAjouter(nom);
  profEnregistrerLocal();
}
function profChoisir(brut){
  let nom = profNomValide(brut);
  if(!nom) return false;
  /* « pilou » désigne Pilou : un nom déjà connu impose son orthographe, sinon
     le même utilisateur finirait avec deux fichiers sur un système qui, lui,
     distingue la casse. */
  nom = PROF_LISTE.find(x => profMemeNom(x, nom)) || nom;
  if(PROF_NOM && profMemeNom(nom, PROF_NOM)) return true;
  profVider();                                   // le profil quitté part au propre
  profAdopter(nom, profCopieLocale(nom) || profNeuf(nom));
  profSignaler();
  profBarre();
  profSynchroniser();                            // le fichier de l'arrivant a le dernier mot
  return true;
}
function profCreer(brut){
  const nom = profNomValide(brut);
  if(!nom) return false;
  if(PROF_LISTE.some(x => profMemeNom(x, nom))) return profChoisir(nom);
  profListeAjouter(nom);
  return profChoisir(nom);
}
/* Supprimer un utilisateur efface ses préférences, pas son travail : les
   cartes et les schémas sont des fichiers à part, que ceci ne touche pas.
   Le dernier utilisateur ne se supprime pas — il faut bien quelqu'un. */
function profSupprimer(brut){
  const nom = profNomValide(brut);
  if(!nom || PROF_LISTE.length < 2) return false;
  const i = PROF_LISTE.findIndex(x => profMemeNom(x, nom));
  if(i < 0) return false;
  PROF_LISTE.splice(i, 1);
  profListeEcrire();
  profSignalerListe();
  profRetirer(PROF_CLE_P + nom.toLowerCase());
  profServeurSupprimer(nom);
  if(profMemeNom(nom, PROF_NOM)){
    PROF_NOM = "";
    profChoisir(PROF_LISTE[0]);
  }else{
    profBarre();
  }
  return true;
}

/* ==========================================================================
   Fichier profils/<nom>.json — par serveur.py
   ========================================================================== */
function profEnLigne(){
  try{
    return location.protocol === "http:" || location.protocol === "https:";
  }catch(_){ return false; }
}
/* Le serveur qui sert la page est le seul interrogé : c'est lui qui a le
   dépôt sous la main, et le dossier profils/ est à côté de index.html. Les
   routes sont donc absolues depuis la racine servie. En file:// il n'y a
   personne à qui parler, et la copie locale suffit. */
async function profJson(url, opts){
  if(!profEnLigne() || typeof fetch !== "function") return null;
  let rep;
  try{ rep = await fetch(url, opts || {}); }
  catch(_){ PROF_SERVEUR = false; return null; }
  if(!rep || !rep.ok){
    /* 404 sur un profil, c'est une réponse, pas une panne : le serveur est
       là, le fichier n'existe pas encore. */
    if(rep && rep.status) PROF_SERVEUR = true;
    return null;
  }
  PROF_SERVEUR = true;
  let txt = "";
  try{ txt = await rep.text(); }catch(_){ return null; }
  if(!txt) return null;
  try{ return JSON.parse(txt); }catch(_){ return null; }
}
async function profServeurListe(){
  const j = await profJson("/api/profils", {headers:{Accept:"application/json"}});
  const out = [];
  if(j && Array.isArray(j.profils))
    for(const e of j.profils){
      const v = profNomValide(e && e.nom);
      if(v) out.push(v);
    }
  return out;
}
async function profServeurLire(nom){
  const j = await profJson("/api/profil?nom=" + encodeURIComponent(nom),
                           {headers:{Accept:"application/json"}});
  return profNormaliser(j, nom);
}
async function profServeurEcrire(){
  if(!PROF_DATA || !PROF_NOM || !profEnLigne()) return false;
  let corps;
  try{ corps = JSON.stringify(PROF_DATA); }catch(_){ return false; }
  const j = await profJson("/api/profil?nom=" + encodeURIComponent(PROF_NOM), {
    method:"PUT",
    headers:{"Content-Type":"application/json"},
    body:corps,
    /* keepalive : l'écriture part même si la page s'en va dans la seconde —
       c'est exactement le cas du bouton « Éditeur PCB », qui quitte la page
       aussitôt après avoir replacé un panneau. */
    keepalive:true
  });
  return !!j;
}
function profServeurSupprimer(nom){
  if(!profEnLigne()) return;
  profJson("/api/profil?nom=" + encodeURIComponent(nom), {method:"DELETE"});
}
/* Écriture différée : déplacer un panneau, c'est des dizaines de wsSave()
   pendant le glissé. Le fichier n'a pas besoin de suivre le curseur. */
function profPousser(){
  if(!profEnLigne()) return;
  if(PROF_TIMER) clearTimeout(PROF_TIMER);
  PROF_TIMER = setTimeout(function(){
    PROF_TIMER = 0;
    profServeurEcrire();
  }, PROF_DELAI);
}
/* Vidage immédiat : au départ de la page, et quand on change d'utilisateur. */
function profVider(){
  if(!PROF_TIMER) return;
  clearTimeout(PROF_TIMER);
  PROF_TIMER = 0;
  profServeurEcrire();
}
/* Le fichier a le dernier mot quand il est plus récent que la copie locale.
   Plus récent, pas différent : sans horodatage à comparer, on ne saurait pas
   lequel des deux est le brouillon de l'autre. */
async function profSynchroniser(){
  const neuf = await profRelever();
  /* Dans tous les cas, la question « ce profil est-il un fichier, ou
     seulement une copie dans ce navigateur ? » vient d'être tranchée : les
     pages qui l'affichent — l'accueil, le menu du bouton — ont de quoi se
     remettre à jour, même quand rien d'autre n'a bougé. */
  profSignalerListe();
  profBarre();
  return neuf;
}
async function profRelever(){
  if(!profEnLigne()){ PROF_SERVEUR = false; return false; }
  const nom = PROF_NOM;
  const noms = await profServeurListe();
  for(const n of noms) profListeAjouter(n);
  const dist = await profServeurLire(nom);
  if(nom !== PROF_NOM) return false;             // l'utilisateur a changé entre-temps
  if(!dist){
    /* Le serveur répond mais n'a pas ce profil : on lui donne le nôtre, le
       fichier existera dès la première visite. */
    if(PROF_SERVEUR) profServeurEcrire();
    return false;
  }
  if(dist.t <= (PROF_DATA ? PROF_DATA.t : 0)){
    if(PROF_DATA && PROF_DATA.t > dist.t) profServeurEcrire();
    return false;
  }
  PROF_DATA = dist;
  profEnregistrerLocal();
  profSignaler();
  return true;
}

/* ==========================================================================
   Bouton d'utilisateur des outils (data-cao-profil)
   La liste complète, sa création et sa suppression vivent sur la page
   d'accueil : c'est là qu'on choisit qui travaille. Les éditeurs n'ont besoin
   que de le montrer et de permettre d'en changer sans repasser par l'accueil.
   ========================================================================== */
function profEsc(s){
  return String(s).replace(/[&<>"'`]/g, ch =>
    ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;","`":"&#96;"}[ch]));
}
function profMenuFermer(){
  const m = document.getElementById("profMenu");
  if(m) m.classList.remove("on");
  document.querySelectorAll("[data-cao-profil]").forEach(function(b){
    b.classList.remove("on");
  });
}
function profMenuConstruire(){
  let m = document.getElementById("profMenu");
  if(!m){
    m = document.createElement("div");
    m.id = "profMenu";
    document.body.appendChild(m);
  }
  let h = '<div class="mtitle">Utilisateur</div>';
  for(const n of PROF_LISTE)
    h += '<button class="mi" data-prof="' + profEsc(n) + '">' +
         '<span class="ck">' + (profMemeNom(n, PROF_NOM) ? "✓" : "") + '</span>' +
         profEsc(n) + '</button>';
  h += '<div class="msep"></div>' +
       '<button class="mi" data-cmd="neuf">' +
       '<span class="ck">+</span>Nouvel utilisateur…</button>' +
       '<div class="mnote">' +
       (PROF_SERVEUR === false
         ? "Préférences gardées dans ce navigateur : sans " +
           "<code>serveur.py</code>, aucun fichier ne peut être écrit."
         : "Préférences enregistrées dans " + profEsc(profEtat().fichier) + ".") +
       '</div>';
  m.innerHTML = h;
  m.querySelectorAll("[data-prof]").forEach(function(b){
    b.onclick = function(){ profMenuFermer(); profChoisir(b.dataset.prof); };
  });
  m.querySelectorAll("[data-cmd]").forEach(function(b){
    b.onclick = function(){
      profMenuFermer();
      const n = prompt("Nom du nouvel utilisateur :", "");
      if(n === null) return;
      if(!profCreer(n))
        alert("Nom refusé : ce nom devient un nom de fichier.\n\n" +
              "Évitez \\ / : * ? \" < > | et le point en début ou en fin.");
    };
  });
  return m;
}
function profMenuOuvrir(bouton){
  const m = profMenuConstruire();
  m.classList.add("on");
  let r = {left:8, bottom:8};
  try{ r = bouton.getBoundingClientRect(); }catch(_){}
  const w = m.offsetWidth || 220, hg = m.offsetHeight || 200;
  m.style.left = Math.max(6, Math.min(innerWidth - w - 6, r.left)) + "px";
  m.style.top  = Math.max(6, Math.min(innerHeight - hg - 6, r.bottom + 5)) + "px";
  bouton.classList.add("on");
}
/* Câble tous les boutons portant data-cao-profil et y écrit le nom courant. */
function profBarre(){
  let btns = [];
  try{ btns = document.querySelectorAll("[data-cao-profil]"); }catch(_){ return 0; }
  let n = 0;
  for(const b of btns){
    b.textContent = "👤 " + (PROF_NOM || "—");
    b.title = "Utilisateur : " + (PROF_NOM || "—") +
              " — panneaux, réglages et derniers documents lui appartiennent";
    b.onclick = function(e){
      if(e && e.stopPropagation) e.stopPropagation();
      const m = document.getElementById("profMenu");
      if(m && m.classList.contains("on")) profMenuFermer();
      else profMenuOuvrir(b);
    };
    n++;
  }
  const m = document.getElementById("profMenu");
  if(m && m.classList.contains("on")) profMenuConstruire().classList.add("on");
  return n;
}

/* ==========================================================================
   Démarrage
   Synchrone d'abord : au moment où workspace.js demande sa disposition, le
   profil doit déjà être là. Le fichier, lui, arrive après — et s'il apporte
   du neuf, les abonnés réappliquent.
   ========================================================================== */
(function profInit(){
  PROF_LISTE = profListeLire();
  let nom = profNomValide(profBrut(PROF_CLE_QUI));
  if(!nom) nom = PROF_LISTE[0] || PROF_PREMIER;
  profAdopter(nom, profCopieLocale(nom) || profNeuf(nom));

  try{
    document.addEventListener("pointerdown", function(e){
      const m = document.getElementById("profMenu");
      if(m && m.classList.contains("on") && !m.contains(e.target) &&
         !(e.target.closest && e.target.closest("[data-cao-profil]")))
        profMenuFermer();
    });
    document.addEventListener("keydown", function(e){
      if(e.key !== "Escape") return;
      const m = document.getElementById("profMenu");
      if(m && m.classList.contains("on")){ profMenuFermer(); e.stopPropagation(); }
    }, true);
  }catch(_){}
  /* pagehide plutôt que beforeunload : il part aussi sur mobile et lors d'un
     retour arrière, et l'écriture différée ne doit pas mourir avec la page. */
  try{ window.addEventListener("pagehide", profVider); }catch(_){}

  profBarre();
  profSynchroniser();
})();
