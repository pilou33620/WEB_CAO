"use strict";
/* ==========================================================================
   Nom de projet, commun aux quatre outils
   --------------------------------------------------------------------------
   Une carte porte un nom — « carte PIR » — et ce nom vaut pour le schéma
   comme pour le circuit imprimé. Les deux éditeurs en dérivent le leur :

       carte PIR  →  carte PIR-SCH   (schéma)
                  →  carte PIR-PCB   (circuit imprimé)

   Pourquoi localStorage et non sessionStorage : un projet survit à la
   fermeture de l'onglet, contrairement au travail en cours que session.js met
   de côté le temps d'un aller-retour entre deux outils. On rouvre le
   navigateur le lendemain et le projet est toujours là.

   Pourquoi hors des documents : si le nom vivait dans le .json du schéma ET
   dans celui du PCB, les deux divergeraient au premier « enregistrer sous ».
   Une seule source, lue par les deux.

   Le module est autonome à dessein : il ne suppose ni profils.js ni
   session.js chargés, parce que l'ordre des balises <script> n'est pas le
   même sur la page d'accueil et dans les éditeurs.
   ========================================================================== */

/* Version dans la clé : un état écrit par un format antérieur est ignoré,
   pas relu de travers. */
const PROJ_CLE = "cao.projet.v1";
const PROJ_NOM_MAX = 60;
const PROJ_MEMOIRE = 12;        // projets récents gardés dans la liste

/* Suffixes par outil. C'est la seule table à toucher quand un outil arrive :
   la visionneuse IPC-2581 est le quatrième, et n'a demandé que cette ligne.

   Pourquoi la visionneuse y figure alors qu'elle ne modifie rien : elle
   exporte. Le modèle traduit d'une carte reçue est une pièce du projet au
   même titre que le schéma et le circuit imprimé -- c'est la carte telle que
   le fabricant l'a livrée --, et son fichier se nomme comme les autres. */
const PROJ_SUFFIXE = {schema:"-SCH", pcb:"-PCB", ipc2581:"-IPC"};

let PROJ_ETAT = null;           // {nom, liste:[{nom,t}]} — chargé à la demande
let PROJ_ABONNES = [];

/* ==========================================================================
   Stockage
   ========================================================================== */
/* Mode privé, fichier ouvert en double-clic, stratégie d'entreprise : rien de
   tout cela ne doit empêcher les outils de s'ouvrir. On teste une fois, et on
   se rabat sur une mémoire vive qui vaut le temps de la page. */
let PROJ_DISPO;                 // undefined = pas encore testé
function projStock(){
  if(PROJ_DISPO !== undefined) return PROJ_DISPO;
  PROJ_DISPO = null;
  try{
    const s = window.localStorage;
    if(!s) return PROJ_DISPO;
    s.setItem(PROJ_CLE + ".essai", "1");
    s.removeItem(PROJ_CLE + ".essai");
    PROJ_DISPO = s;
  }catch(_){ PROJ_DISPO = null; }
  return PROJ_DISPO;
}

/* ==========================================================================
   Validation
   --------------------------------------------------------------------------
   Un nom de projet devient un préfixe de nom de fichier : « carte PIR » donne
   « carte PIR-PCB.json », « carte PIR-MASTER-DRAWING.pdf ». Il n'a donc le
   droit ni de traverser un dossier, ni de désigner un fichier réservé du
   système. Les accents et les espaces, eux, sont les bienvenus : « carte
   PIR » est un nom de projet légitime.

   Mêmes règles que profNomValide() dans profils.js, réécrites ici pour que ce
   module ne dépende de rien.
   ========================================================================== */
const PROJ_RESERVES = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;
function projNomValide(brut){
  let n = String(brut == null ? "" : brut);
  n = n.replace(/[\u0000-\u001f\u007f]/g, "");     // caractères de contrôle
  n = n.replace(/\s+/g, " ").trim();
  if(!n || n.length > PROJ_NOM_MAX) return "";
  if(/[\\/:*?"<>|]/.test(n)) return "";            // séparateurs et joker
  if(/^\.+$/.test(n)) return "";                   // « . », « .. »
  if(n.charAt(0) === "." || /[. ]$/.test(n)) return "";
  if(PROJ_RESERVES.test(n)) return "";
  return n;
}
function projMemeNom(a, b){
  return String(a).toLowerCase() === String(b).toLowerCase();
}

/* ==========================================================================
   Lecture et écriture de l'état
   ========================================================================== */
function projNeuf(){ return {nom:"", liste:[]}; }
/* Rien de ce qui est relu n'est cru sur parole : le nom repasse par la
   validation, et une entrée de liste douteuse est écartée plutôt que corrigée
   à moitié. */
function projNormaliser(o){
  const p = projNeuf();
  if(!o || typeof o !== "object") return p;
  p.nom = projNomValide(o.nom);
  if(Array.isArray(o.liste))
    for(const e of o.liste){
      if(!e || typeof e !== "object") continue;
      const v = projNomValide(e.nom);
      if(!v || p.liste.some(x => projMemeNom(x.nom, v))) continue;
      p.liste.push({nom:v, t:(+e.t || 0)});
      if(p.liste.length >= PROJ_MEMOIRE) break;
    }
  return p;
}
function projCharger(){
  if(PROJ_ETAT) return PROJ_ETAT;
  const s = projStock();
  let brut = null;
  if(s){
    try{ brut = JSON.parse(s.getItem(PROJ_CLE) || "null"); }
    catch(_){ brut = null; }
  }
  PROJ_ETAT = projNormaliser(brut);
  return PROJ_ETAT;
}
function projEnregistrer(){
  const s = projStock();
  if(!s || !PROJ_ETAT) return false;
  try{ s.setItem(PROJ_CLE, JSON.stringify(PROJ_ETAT)); return true; }
  catch(_){ return false; }
}

/* ==========================================================================
   API
   ========================================================================== */
/* Le nom du projet courant, ou "" si aucun n'est ouvert. Les appelants
   doivent traiter ce cas : on ne renvoie pas un nom inventé. */
function projNom(){ return projCharger().nom; }

/* Ouvre un projet, existant ou nouveau — c'est le même geste, seule la
   présence dans la liste fait la différence. Renvoie le nom retenu, ou ""
   si le nom est refusé. */
function projOuvrir(brut){
  const v = projNomValide(brut);
  if(!v) return "";
  const p = projCharger();
  p.nom = v;
  p.liste = p.liste.filter(e => !projMemeNom(e.nom, v));
  p.liste.unshift({nom:v, t:Date.now()});
  if(p.liste.length > PROJ_MEMOIRE) p.liste.length = PROJ_MEMOIRE;
  projEnregistrer();
  projSignaler();
  return v;
}
/* Referme sans rien oublier : le projet reste dans la liste, il n'est
   simplement plus celui sur lequel on travaille. */
function projFermer(){
  const p = projCharger();
  p.nom = "";
  projEnregistrer();
  projSignaler();
}
/* Retire un projet de la mémoire. Les fichiers, eux, sont sur le disque : ils
   ne sont pas touchés. */
function projOublier(brut){
  const v = projNomValide(brut);
  if(!v) return false;
  const p = projCharger();
  const avant = p.liste.length;
  p.liste = p.liste.filter(e => !projMemeNom(e.nom, v));
  if(projMemeNom(p.nom, v)) p.nom = "";
  projEnregistrer();
  projSignaler();
  return p.liste.length !== avant;
}
/* Les projets connus, le plus récent d'abord. Copie, jamais la liste rangée. */
function projListe(){
  return projCharger().liste.map(e => ({nom:e.nom, t:e.t}));
}

/* Le nom du document d'un outil : « carte PIR » + « pcb » → « carte PIR-PCB ».
   Sans projet ouvert, on renvoie le repli fourni par l'appelant — chaque
   outil sait ce qu'il affichait avant qu'un projet existe. */
function projDoc(outil, repli){
  const n = projNom();
  const suf = PROJ_SUFFIXE[outil];
  if(!n || !suf) return repli == null ? "" : String(repli);
  return n + suf;
}
/* Base d'un nom de fichier d'export pour un outil donné. Même chose que
   projDoc(), nommé pour l'usage : c'est ce qui préfixe « .json », « .zip »,
   « -MASTER-DRAWING.pdf ». */
function projBase(outil, repli){ return projDoc(outil, repli); }

/* ==========================================================================
   Abonnements
   --------------------------------------------------------------------------
   Un outil affiche le nom du projet dans son entête ; il doit le voir changer
   sans recharger la page. Et si deux onglets sont ouverts, celui qui n'a pas
   fait le changement doit suivre : d'où l'écoute de « storage ».
   ========================================================================== */
function projSurChangement(fn){
  if(typeof fn === "function") PROJ_ABONNES.push(fn);
}
function projSignaler(){
  const n = projNom();
  for(const fn of PROJ_ABONNES){
    try{ fn(n); }catch(_){}
  }
}
try{
  window.addEventListener("storage", function(e){
    if(e && e.key === PROJ_CLE){
      PROJ_ETAT = null;              // relu au prochain accès
      projSignaler();
    }
  });
}catch(_){}

/* ==========================================================================
   Affichage dans l'entête
   --------------------------------------------------------------------------
   Un outil déclare la place du nom dans son HTML :
       <span data-cao-projet="pcb"></span>
   L'attribut nomme l'outil, donc le suffixe affiché : « carte PIR-PCB ».
   Une seule implémentation sert les deux éditeurs, et le nom suit tout seul
   l'ouverture d'un projet dans un autre onglet.
   Sans projet, la place est masquée plutôt que remplie d'un nom d'emprunt :
   afficher « carte » ferait croire à un projet nommé ainsi.
   ========================================================================== */
function projPeindre(){
  let els;
  try{ els = document.querySelectorAll("[data-cao-projet]"); }catch(_){ return; }
  for(const el of els){
    const nom = projDoc(el.getAttribute("data-cao-projet") || "", "");
    el.textContent = nom;
    el.hidden = !nom;
    el.title = nom
      ? "Projet « " + projNom() + " » : les fichiers exportés portent ce nom"
      : "Aucun projet ouvert";
  }
}
try{
  projSurChangement(projPeindre);
  if(document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", projPeindre);
  else projPeindre();
}catch(_){}
