/* =============================================================================
   commun/projet-disque.js
   Ou vit un projet : un dossier, et dedans un fichier principal.

       D:\projets\carte PIR\
           projet.cao.json          <- le nom, la revision, les liens
           carte PIR-SCH.json
           carte PIR-PCB.json

   Repartition avec commun/projet.js : celui-la tient l'identite du projet (son
   nom, la liste des recents, les accesseurs synchrones dont tout le monde se
   sert) ; celui-ci tient l'acces au disque. Deux fichiers parce que ce sont
   deux metiers : le nom se lit mille fois par seconde et sans attendre, un
   fichier se lit une fois et de facon asynchrone.

   Deux voies vers le disque, parce qu'un navigateur ne peut pas ouvrir un
   chemin qu'on lui tape :
     - « serveur »  : serveur.py tient le disque (routes /api/projet*). C'est la
                      seule voie qui accepte un chemin ecrit a la main, et elle
                      marche dans tous les navigateurs.
     - « dossier »  : le selecteur de dossier du navigateur (File System Access).
                      Aucun serveur requis, mais Chrome/Edge seulement, et il
                      faut passer par la boite de dialogue. L'autorisation est
                      gardee d'une fois sur l'autre (IndexedDB).

   Rien ici ne s'execute au chargement dans un contexte sans navigateur : le
   banc d'essai evalue ce fichier comme les autres.
   ============================================================================= */
"use strict";

const PROJD_CLE = "cao.projet.dossier.v1";
const PROJD_DEST = "cao.projet.destination.v1";   // ou ranger les nouveaux projets
const PROJD_FICHIER = "projet.cao.json";
const PROJD_FORMAT = "cao-projet-1";
const PROJD_SUFFIXE = {schema:"-SCH.json", pcb:"-PCB.json"};
const PROJD_BD = "cao-projet";           // base IndexedDB du dossier retenu
const PROJD_BD_CLE = "dossier";

/* Miroir en memoire. Les accesseurs synchrones lisent ici, jamais le disque :
   c'est ce qui permet a projDoc(), fabBase() et le reste de rester synchrones
   alors que lire un fichier ne l'est pas. */
let PROJD = {mode:"", chemin:"", fichier:null, documents:null};
let PROJD_HANDLE = null;                 // FileSystemDirectoryHandle, si mode "dossier"
let PROJD_ATTENTE = null;                // dossier retrouve, mais pas encore autorise
let PROJD_SRV;                           // undefined = pas encore teste

/* ==========================================================================
   Etat, lecture synchrone
   ========================================================================== */
function projdEtat(){
  return {mode:PROJD.mode, chemin:PROJD.chemin, fichier:PROJD.fichier,
          documents:PROJD.documents};
}
/* Ce que le dossier contient deja : le schema, la carte, les deux, ou rien.
   Releve une fois a l'ouverture, parce que c'est ce qu'on veut afficher tout de
   suite (« schema present, carte absente ») sans relire le disque a chaque
   peinture. Toujours les deux outils, toujours les memes champs : l'appelant
   n'a pas a se demander si la clef existe. */
function projdDocuments(){
  const d = PROJD.documents;
  const out = {};
  for(const outil in PROJD_SUFFIXE){
    const e = d && d[outil];
    out[outil] = {fichier:(e && e.fichier) || projdNomDoc(outil),
                  present:!!(e && e.present)};
  }
  return out;
}
/* Vrai si un dossier est rattache : les editeurs y lisent et y ecrivent au
   lieu de passer par le telechargement. */
function projdLie(){ return !!PROJD.mode; }
function projdChemin(){ return PROJD.chemin || ""; }
/* La revision vient du fichier projet. C'est elle qui alimente le cartouche du
   master drawing, jusqu'ici fige a « A » faute de source. */
function projdRevision(){
  const r = PROJD.fichier && PROJD.fichier.revision;
  return (typeof r === "string" && r.trim()) ? r.trim() : "A";
}
function projdAuteur(){
  const a = PROJD.fichier && PROJD.fichier.auteur;
  return (typeof a === "string" && a.trim()) ? a.trim() : "";
}
/* Le nom de fichier d'un document, tel que declare par le fichier projet, ou
   deduit du nom du projet a defaut. */
function projdNomDoc(outil){ return projdNomDocDe(PROJD.fichier, outil); }
/* Meme deduction, sur un fichier projet quelconque : on en a besoin avant
   l'adoption, pour savoir quoi chercher dans le dossier qu'on vient d'ouvrir. */
function projdNomDocDe(fichier, outil){
  const suf = PROJD_SUFFIXE[outil];
  if(!suf) return "";
  const f = fichier && fichier.fichiers;
  const declare = f && typeof f[outil] === "string" ? f[outil].trim() : "";
  if(declare && declare.indexOf("/") < 0 && declare.indexOf("\\") < 0)
    return declare;
  const nom = (fichier && fichier.nom) || projNom();
  return nom ? nom + suf : "";
}
/* Un fichier projet neuf. Le nom est la seule chose qu'on exige. */
function projdNeuf(nom){
  const t = new Date().toISOString();
  return {format:PROJD_FORMAT, nom:nom, revision:"A", auteur:"",
          cree:t, modifie:t,
          fichiers:{schema:nom+PROJD_SUFFIXE.schema, pcb:nom+PROJD_SUFFIXE.pcb},
          notes:""};
}

/* ==========================================================================
   Voie serveur
   ========================================================================== */
function projdApi(methode, route, params, corps){
  let url = route;
  if(params){
    const q = [];
    for(const k in params)
      if(params[k] !== undefined && params[k] !== "")
        q.push(encodeURIComponent(k)+"="+encodeURIComponent(params[k]));
    if(q.length) url += "?"+q.join("&");
  }
  const opt = {method:methode, headers:{}};
  if(corps !== undefined){
    opt.headers["Content-Type"] = "application/json";
    opt.body = JSON.stringify(corps);
  }
  return fetch(url, opt).then(function(rep){
    return rep.text().then(function(txt){
      let obj = {};
      try{ obj = txt ? JSON.parse(txt) : {}; }catch(_){}
      if(!rep.ok){
        /* Le serveur explique ses refus (hors racine, ecoute reseau, format) :
           on fait remonter son message plutot qu'un « erreur 403 » muet. */
        const e = new Error(obj.detail || ("Erreur "+rep.status));
        e.code = rep.status;
        throw e;
      }
      return obj;
    });
  });
}
/* Le serveur est-il la, et la route ouverte ? Teste une fois, retenu ensuite.
   Un 403 compte comme « pas disponible » : la route existe mais refuse (ecoute
   reseau), et il n'y a rien a en tirer. */
function projdServeurDispo(){
  if(PROJD_SRV !== undefined) return Promise.resolve(PROJD_SRV);
  if(typeof fetch !== "function"){ PROJD_SRV = false; return Promise.resolve(false); }
  return projdApi("GET","/api/projets").then(function(){
    PROJD_SRV = true; return true;
  }).catch(function(){ PROJD_SRV = false; return false; });
}
function projdListerServeur(){
  return projdApi("GET","/api/projets").then(function(r){
    return {racines:r.racines||[], projets:r.projets||[]};
  });
}
/* La destination retenue pour le prochain projet : une racine declaree, et un
   sous-dossier facultatif ("clients/acme"). Gardee d'une fois sur l'autre,
   parce qu'on range en general plusieurs projets au meme endroit. */
function projdDestination(){
  try{
    const d = JSON.parse(localStorage.getItem(PROJD_DEST)||"null");
    if(d && typeof d === "object")
      return {racine:d.racine||"", sous:d.sous||""};
  }catch(_){}
  return {racine:"", sous:""};
}
function projdDestinationPoser(racine, sous){
  try{
    localStorage.setItem(PROJD_DEST, JSON.stringify({racine:racine||"", sous:sous||""}));
  }catch(_){}
}

/* ==========================================================================
   Voie selecteur de dossier (File System Access)
   ========================================================================== */
function projdSelecteurDispo(){
  try{ return typeof window.showDirectoryPicker === "function"; }
  catch(_){ return false; }
}
/* Le handle de dossier survit au rechargement, mais seul IndexedDB sait le
   garder : ce n'est pas une valeur qu'on peut mettre en JSON. */
function projdBd(){
  return new Promise(function(res, rej){
    let d;
    try{ d = indexedDB.open(PROJD_BD, 1); }catch(e){ rej(e); return; }
    d.onupgradeneeded = function(){ d.result.createObjectStore("h"); };
    d.onsuccess = function(){ res(d.result); };
    d.onerror = function(){ rej(d.error); };
  });
}
function projdHandleGarder(h){
  return projdBd().then(function(bd){
    return new Promise(function(res, rej){
      const t = bd.transaction("h","readwrite");
      t.objectStore("h").put(h, PROJD_BD_CLE);
      t.oncomplete = function(){ res(true); };
      t.onerror = function(){ rej(t.error); };
    });
  }).catch(function(){ return false; });
}
function projdHandleRelire(){
  return projdBd().then(function(bd){
    return new Promise(function(res){
      const t = bd.transaction("h","readonly");
      const q = t.objectStore("h").get(PROJD_BD_CLE);
      q.onsuccess = function(){ res(q.result||null); };
      q.onerror = function(){ res(null); };
    });
  }).catch(function(){ return null; });
}
/* L'autorisation d'ecrire n'est pas acquise pour toujours : au retour sur la
   page, elle se redemande. Sans geste de l'utilisateur, la demande echoue --
   d'ou `interroger` : au demarrage on se contente de constater. */
function projdHandleAutorise(h, interroger){
  const opt = {mode:"readwrite"};
  return Promise.resolve()
    .then(function(){ return h.queryPermission(opt); })
    .then(function(etat){
      if(etat === "granted") return true;
      if(!interroger) return false;
      return h.requestPermission(opt).then(function(e){ return e === "granted"; });
    })
    .catch(function(){ return false; });
}
function projdLireFichierHandle(h, nom){
  return h.getFileHandle(nom).then(function(fh){
    return fh.getFile();
  }).then(function(f){
    return f.text();
  }).then(function(txt){
    try{ return JSON.parse(txt); }
    catch(_){ throw new Error(nom+" : ce n'est pas du JSON"); }
  });
}
function projdEcrireFichierHandle(h, nom, obj){
  return h.getFileHandle(nom,{create:true}).then(function(fh){
    return fh.createWritable();
  }).then(function(w){
    return w.write(JSON.stringify(obj,null,1)).then(function(){ return w.close(); });
  }).then(function(){ return true; });
}
function projdFichierLa(h, nom){
  if(!nom) return Promise.resolve(false);
  return h.getFileHandle(nom).then(function(){ return true; })
                             .catch(function(){ return false; });
}
/* Les noms de fichiers du dossier. Sert au repli ci-dessous, et seulement a
   cela : lister coute un aller-retour, on ne le fait pas pour rien. */
async function projdNomsDossier(h){
  const noms = [];
  try{ for await (const nom of h.keys()) noms.push(nom); }catch(_){}
  return noms;
}
/* Qu'y a-t-il dans ce dossier ? Le nom declare par le fichier projet d'abord,
   puis, s'il ne designe rien, le premier fichier qui porte le suffixe de
   l'outil : un dossier prepare a la main, ou dont on a renomme le projet,
   reste ainsi ouvrable au lieu de paraitre vide. */
async function projdSonderDossier(h, fichier){
  const docs = {};
  let noms = null;
  for(const outil in PROJD_SUFFIXE){
    const attendu = projdNomDocDe(fichier, outil);
    let trouve = (await projdFichierLa(h, attendu)) ? attendu : "";
    if(!trouve){
      if(!noms) noms = await projdNomsDossier(h);
      const suf = PROJD_SUFFIXE[outil].toLowerCase();
      trouve = noms.find(function(n){ return n.toLowerCase().endsWith(suf); }) || "";
    }
    docs[outil] = {fichier:trouve || attendu, present:!!trouve};
  }
  return docs;
}

/* ==========================================================================
   Ouvrir, creer, detacher
   --------------------------------------------------------------------------
   Dans tous les cas, c'est le fichier projet qui donne le nom : on le lit, puis
   on le passe a projOuvrir() pour que projDoc() et tout ce qui en depend
   continuent de repondre sans attendre.
   ========================================================================== */
function projdAdopter(mode, chemin, fichier, documents){
  PROJD = {mode:mode, chemin:chemin||"", fichier:fichier||null,
           documents:documents||null};
  const nom = fichier && fichier.nom;
  if(nom) projOuvrir(nom);            // projSignaler() suit : l'entete se met a jour
  try{
    localStorage.setItem(PROJD_CLE, JSON.stringify({mode:mode, chemin:PROJD.chemin}));
  }catch(_){}
  try{ projSignaler(); }catch(_){}
  return projdEtat();
}
/* Ouvre un dossier deja rempli, par le serveur. `ou` est un nom de projet ou un
   chemin complet ; le serveur tranche, et refuse ce qui sort de sa racine. */
function projdOuvrirServeur(ou, racine){
  return projdApi("GET","/api/projet",{chemin:ou, racine:racine||""})
    .then(function(r){
      /* Le serveur dit du meme coup ce que le dossier contient : inutile de le
         lui redemander document par document pour l'afficher. */
      return projdAdopter("serveur", r.dossier||ou, r.projet, r.documents);
    });
}
/* Cree le dossier et son fichier projet. Le nom du projet fait le nom du
   dossier : un dossier « carte PIR » qui contiendrait un projet appele
   autrement serait un piege a relire plus tard.
   `dest` dit ou le ranger : {racine, sous}. La racine doit etre declaree au
   demarrage du serveur ; le sous-dossier, lui, est libre ("clients/acme").
   Sans destination, c'est la premiere racine, a la racine. */
function projdCreerServeur(nom, dest){
  const v = projNomValide(nom);
  if(!v) return Promise.reject(new Error("Nom de projet invalide"));
  const d = dest || projdDestination();
  const sous = String((d && d.sous) || "").replace(/[\\/]+$/,"").replace(/^[\\/]+/,"");
  const chemin = sous ? sous + "/" + v : v;
  const f = projdNeuf(v);
  return projdApi("PUT","/api/projet",
                  {chemin:chemin, racine:(d && d.racine) || ""}, f)
    .then(function(r){
      projdDestinationPoser((d && d.racine) || "", sous);
      /* Un projet qui vient de naitre n'a ni schema ni carte : on le dit, plutot
         que de laisser croire a un releve manquant. */
      const vide = {schema:{fichier:projdNomDocDe(f,"schema"), present:false},
                    pcb:{fichier:projdNomDocDe(f,"pcb"), present:false}};
      const etat = projdAdopter("serveur", r.dossier||chemin, f, vide);
      etat.neuf = true;
      return etat;
    });
}
/* Voie selecteur : on demande le dossier, puis on lit son fichier projet. S'il
   n'en a pas et que `creer` est vrai, on l'ecrit -- c'est ainsi qu'on prend un
   dossier vide pour un projet neuf. */
function projdChoisirDossier(creer){
  if(!projdSelecteurDispo())
    return Promise.reject(new Error("Ce navigateur n'a pas de selecteur de"
      + " dossier. Lancez serveur.py --local, ou utilisez Chrome ou Edge."));
  /* `id` fait revenir la boite de dialogue la ou on l'a laissee la derniere
     fois : on range en general ses projets au meme endroit. */
  return window.showDirectoryPicker({mode:"readwrite", id:"cao-projet"})
    .then(function(h){
      return projdAdopterHandle(h, creer === undefined ? true : creer);
    });
}
/* Un dossier retenu devient le projet courant. Le fichier projet fait foi ;
   s'il manque et qu'on a le droit de creer, on l'ecrit -- c'est ainsi qu'un
   dossier vide, ou un dossier qu'on vient de faire dans la boite de dialogue,
   devient un projet neuf. L'etat renvoye porte `neuf` : l'appelant a le droit
   de dire lequel des deux gestes vient d'avoir lieu. */
function projdAdopterHandle(h, creer){
  let neuf = false;
  return projdHandleAutorise(h,true).then(function(ok){
    if(!ok) throw new Error("Acces au dossier refuse");
    return projdLireFichierHandle(h,PROJD_FICHIER).catch(function(e){
      return projdVeutCreer(creer,h).then(function(oui){
        if(!oui) throw new Error("Ce dossier n'a pas de "+PROJD_FICHIER
          + " : ce n'est pas un projet. (" + e.message + ")");
        neuf = true;
        const nom = projNomValide(h.name) || "projet";
        const f = projdNeuf(nom);
        return projdEcrireFichierHandle(h,PROJD_FICHIER,f).then(function(){ return f; });
      });
    });
  }).then(function(f){
    PROJD_HANDLE = h;
    PROJD_ATTENTE = null;
    projdHandleGarder(h);
    return projdSonderDossier(h,f).then(function(docs){
      const etat = projdAdopter("dossier", h.name, f, docs);
      etat.neuf = neuf;
      return etat;
    });
  });
}
/* Faire d'un dossier un projet, c'est y ecrire. Un dossier vide -- celui qu'on
   vient de creer dans la boite de dialogue -- ne merite pas qu'on demande ;
   un dossier deja rempli, si : on peut s'etre trompe de dossier. D'ou `creer`
   qui accepte une fonction, appelee avec ce qu'on sait du dossier, et a qui il
   revient de poser la question. Le module, lui, n'affiche rien.
   `true` cree sans demander, `false` refuse : c'est ce qu'il faut pour rouvrir
   un projet dont on exige qu'il existe deja. */
function projdVeutCreer(creer, h){
  if(typeof creer !== "function") return Promise.resolve(!!creer);
  return projdNomsDossier(h).then(function(noms){
    return !!creer({nom:h.name, noms:noms, vide:noms.length === 0});
  });
}
/* Le dossier de la derniere fois est retrouve, mais le navigateur veut qu'on
   redemande l'autorisation, et une demande sans geste de l'utilisateur echoue.
   D'ou ces deux-la : l'accueil constate (projdAReconnecter) et propose un
   bouton qui, lui, est bien un geste (projdReconnecter). */
function projdAReconnecter(){
  return PROJD_ATTENTE ? (PROJD_ATTENTE.name || "le dossier") : "";
}
function projdReconnecter(){
  if(!PROJD_ATTENTE)
    return Promise.reject(new Error("Aucun dossier a rouvrir"));
  return projdAdopterHandle(PROJD_ATTENTE, false);
}

/* ==========================================================================
   Documents
   ========================================================================== */
function projdDocLire(outil){
  /* Le nom releve a l'ouverture passe devant le nom deduit : c'est celui d'un
     fichier dont on sait qu'il existe. */
  const vu = PROJD.documents && PROJD.documents[outil];
  const nom = (vu && vu.present && vu.fichier) || projdNomDoc(outil);
  if(!projdLie() || !nom) return Promise.resolve(null);
  if(PROJD.mode === "serveur")
    return projdApi("GET","/api/projet/doc",{chemin:PROJD.chemin, doc:outil})
      .then(function(r){ return r.document||null; })
      .catch(function(e){ if(e.code === 404) return null; throw e; });
  if(!PROJD_HANDLE) return Promise.resolve(null);
  return projdLireFichierHandle(PROJD_HANDLE,nom).catch(function(){ return null; });
}
function projdDocEcrire(outil, obj){
  const nom = projdNomDoc(outil);
  if(!projdLie() || !nom)
    return Promise.reject(new Error("Aucun dossier de projet rattache"));
  /* Ce qui vient d'etre ecrit est desormais la : le releve doit le dire, sinon
     l'accueil continuerait d'annoncer un dossier sans schema. */
  function note(f){
    if(!PROJD.documents) PROJD.documents = {};
    PROJD.documents[outil] = {fichier:f||nom, present:true};
    try{ projSignaler(); }catch(_){}
    return f||nom;
  }
  if(PROJD.mode === "serveur")
    return projdApi("PUT","/api/projet/doc",{chemin:PROJD.chemin, doc:outil}, obj)
      .then(function(r){ return note(r.fichier); });
  if(!PROJD_HANDLE) return Promise.reject(new Error("Dossier plus accessible"));
  return projdHandleAutorise(PROJD_HANDLE,true).then(function(ok){
    if(!ok) throw new Error("Acces au dossier refuse");
    return projdEcrireFichierHandle(PROJD_HANDLE,nom,obj).then(function(){ return note(nom); });
  });
}
/* Reecrit le fichier projet (revision, auteur, notes, date de modification). */
function projdMajFichier(champs){
  if(!projdLie()) return Promise.reject(new Error("Aucun dossier de projet"));
  const f = Object.assign({}, PROJD.fichier||projdNeuf(projNom()), champs||{});
  f.format = PROJD_FORMAT;
  f.modifie = new Date().toISOString();
  const suite = (PROJD.mode === "serveur")
    ? projdApi("PUT","/api/projet",{chemin:PROJD.chemin},f)
    : projdEcrireFichierHandle(PROJD_HANDLE,PROJD_FICHIER,f);
  return suite.then(function(){
    PROJD.fichier = f;
    try{ projSignaler(); }catch(_){}
    return f;
  });
}
/* Detache sans rien effacer sur le disque : les fichiers restent, c'est le lien
   qui se defait. */
function projdDetacher(){
  PROJD = {mode:"", chemin:"", fichier:null, documents:null};
  PROJD_HANDLE = null;
  PROJD_ATTENTE = null;
  try{ localStorage.removeItem(PROJD_CLE); }catch(_){}
  try{ projSignaler(); }catch(_){}
}

/* ==========================================================================
   Reprise au chargement
   --------------------------------------------------------------------------
   On retrouve le dossier de la derniere fois. En mode « dossier », si
   l'autorisation n'est plus acquise, on ne la redemande pas ici : une demande
   sans geste de l'utilisateur echoue de toute facon. L'accueil affichera alors
   le dossier comme a reconnecter.
   ========================================================================== */
function projdReprendre(){
  let garde = null;
  try{ garde = JSON.parse(localStorage.getItem(PROJD_CLE)||"null"); }catch(_){}
  if(!garde || !garde.mode) return Promise.resolve(null);
  if(garde.mode === "serveur")
    return projdOuvrirServeur(garde.chemin).catch(function(){ return null; });
  return projdHandleRelire().then(function(h){
    if(!h) return null;
    return projdHandleAutorise(h,false).then(function(ok){
      if(!ok){
        /* Le dossier est retrouve mais l'autorisation s'est perdue : on le met
           de cote plutot que de l'oublier, et l'accueil proposera de le rouvrir
           d'un clic -- un clic, c'est ce qui manquait. */
        PROJD_ATTENTE = h;
        try{ projSignaler(); }catch(_){}
        return null;
      }
      PROJD_HANDLE = h;
      return projdLireFichierHandle(h,PROJD_FICHIER).then(function(f){
        return projdSonderDossier(h,f).then(function(docs){
          return projdAdopter("dossier", h.name, f, docs);
        });
      }).catch(function(){ return null; });
    });
  }).catch(function(){ return null; });
}
try{
  if(typeof window !== "undefined" && typeof document !== "undefined"){
    if(document.readyState === "loading")
      document.addEventListener("DOMContentLoaded", function(){ projdReprendre(); });
    else projdReprendre();
  }
}catch(_){}
