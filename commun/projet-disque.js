/* =============================================================================
   commun/projet-disque.js
   Ou vit un projet : un dossier, et dedans un fichier principal.

       D:\projets\carte PIR\
           projet.cao.json          <- le nom, la revision, les liens
           carte PIR-SCH.json
           carte PIR-PCB.json
           carte PIR-IPC.json       <- la carte du fabricant, telle que lue

   Repartition avec commun/projet.js : celui-la tient l'identite du projet (son
   nom, la liste des recents, les accesseurs synchrones dont tout le monde se
   sert) ; celui-ci tient l'acces au disque. Deux fichiers parce que ce sont
   deux metiers : le nom se lit mille fois par seconde et sans attendre, un
   fichier se lit une fois et de facon asynchrone.

   Deux voies vers le disque, parce qu'un navigateur ne peut pas ouvrir un
   chemin qu'on lui tape :
     - « serveur »  : web_CAO.py tient le disque (routes /api/projet*). C'est la
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
/* Un document par outil. La visionneuse IPC-2581 y a sa place bien qu'elle
   ne modifie rien : ce qu'elle range la est le modele traduit d'une carte
   recue, et c'est une piece du projet -- la carte telle que le fabricant l'a
   livree, a cote du schema et du circuit imprime. Absent, il n'a rien de
   fautif : projdDocuments() dit « present » ou « absent », sans exiger. */
const PROJD_SUFFIXE = {schema:"-SCH.json", pcb:"-PCB.json", ipc2581:"-IPC.json"};
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
                  present:!!(e && e.present), modifie:(e && e.modifie) || 0};
  }
  return out;
}
/* Heure (ms) de la derniere sauvegarde d'un document du projet, 0 si aucune. */
function projdDerniereSauvegarde(){
  const d = PROJD.documents || {};
  let t = 0;
  for(const outil in d) if(d[outil] && d[outil].present) t = Math.max(t, d[outil].modifie || 0);
  return t;
}
/* « aujourd'hui à 14:32 », « hier à 09:10 », « 7 oct. à 14:32 ». */
function projdQuand(t){
  if(!t) return "";
  const d = new Date(t), now = new Date();
  const hm = d.toLocaleTimeString("fr-FR", {hour:"2-digit", minute:"2-digit"});
  const jour = function(x){ return new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime(); };
  const ecart = Math.round((jour(now) - jour(d)) / 864e5);
  if(ecart === 0) return "aujourd'hui à " + hm;
  if(ecart === 1) return "hier à " + hm;
  const o = {day:"numeric", month:"short"};
  if(d.getFullYear() !== now.getFullYear()) o.year = "numeric";
  return d.toLocaleDateString("fr-FR", o) + " à " + hm;
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
/* Les noms de fichiers d'un projet neuf, deduits de la table elle-meme :
   ajouter un outil ne doit pas demander de repasser ici. */
function projdFichiersDe(nom){
  const out = {};
  for(const outil in PROJD_SUFFIXE) out[outil] = nom + PROJD_SUFFIXE[outil];
  return out;
}
/* Un fichier projet neuf. Le nom est la seule chose qu'on exige. */
function projdNeuf(nom){
  const t = new Date().toISOString();
  return {format:PROJD_FORMAT, nom:nom, revision:"A", auteur:"",
          cree:t, modifie:t,
          fichiers:projdFichiersDe(nom),
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
    let modifie = 0;
    if(trouve){
      try{ modifie = (await (await h.getFileHandle(trouve)).getFile()).lastModified || 0; }catch(_){}
    }
    docs[outil] = {fichier:trouve || attendu, present:!!trouve, modifie:modifie};
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
  if(nom){
    if(typeof projOuvrir === "function") projOuvrir(nom, chemin, mode);
    if(typeof projRenseignerChemin === "function") projRenseignerChemin(nom, chemin, mode);
  }
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
/* Relit ce que contient le dossier rattache (heures de sauvegarde comprises) :
   l'accueil le fait quand on y revient, un editeur ayant pu enregistrer entre-temps. */
function projdRafraichir(){
  if(PROJD.mode === "serveur")
    return projdApi("GET","/api/projet",{chemin:PROJD.chemin}).then(function(r){
      if(r && r.documents){ PROJD.documents = r.documents; try{ projSignaler(); }catch(_){} }
      return projdEtat();
    });
  if(PROJD.mode === "dossier" && PROJD_HANDLE)
    return projdSonderDossier(PROJD_HANDLE, PROJD.fichier).then(function(docs){
      PROJD.documents = docs; try{ projSignaler(); }catch(_){}
      return projdEtat();
    });
  return Promise.resolve(projdEtat());
}
/* Cree le dossier et son fichier projet. Le nom du projet fait le nom du
   dossier : un dossier « carte PIR » qui contiendrait un projet appele
   autrement serait un piege a relire plus tard.
   `dest` dit ou le ranger : {racine, sous, chemin}. La racine doit etre declaree au
   demarrage du serveur ; le sous-dossier, lui, est libre ("clients/acme").
   Sans destination, c'est la premiere racine, a la racine. */
function projdCreerServeur(nom, dest){
  const v = projNomValide(nom);
  if(!v) return Promise.reject(new Error("Nom de projet invalide"));
  const d = dest || projdDestination();
  let chemin = "";
  if(d && d.chemin && typeof d.chemin === "string" && d.chemin.trim()){
    chemin = d.chemin.trim();
  } else {
    const sous = String((d && d.sous) || "").replace(/[\\/]+$/,"").replace(/^[\\/]+/,"");
    chemin = sous ? sous + "/" + v : v;
  }
  const f = projdNeuf(v);
  return projdApi("PUT","/api/projet",
                  {chemin:chemin, racine:(d && d.racine) || ""}, f)
    .then(function(r){
      if(d && d.sous) projdDestinationPoser((d && d.racine) || "", d.sous);
      /* Un projet qui vient de naitre n'a ni schema ni carte : on le dit, plutot
         que de laisser croire a un releve manquant. */
      const vide = {schema:{fichier:projdNomDocDe(f,"schema"), present:false},
                    pcb:{fichier:projdNomDocDe(f,"pcb"), present:false}};
      const etat = projdAdopter("serveur", r.dossier||chemin, f, vide);
      etat.neuf = true;
      return etat;
    });
}
/* Cree un projet au sein d'un dossier parent via File System Access.
   Cree le sous-dossier nom/ et y depose projet.cao.json. */
function projdCreerDansParent(parentHandle, nom){
  const v = projNomValide(nom);
  if(!v) return Promise.reject(new Error("Nom de projet invalide"));
  if(!parentHandle || typeof parentHandle.getDirectoryHandle !== "function")
    return Promise.reject(new Error("Dossier parent invalide"));
  return projdHandleAutorise(parentHandle, true).then(function(ok){
    if(!ok) throw new Error("Acces au dossier parent refuse");
    return parentHandle.getDirectoryHandle(v, {create: true});
  }).then(function(childHandle){
    const f = projdNeuf(v);
    return projdEcrireFichierHandle(childHandle, PROJD_FICHIER, f).then(function(){
      PROJD_HANDLE = childHandle;
      PROJD_ATTENTE = null;
      projdHandleGarder(childHandle);
      return projdSonderDossier(childHandle, f).then(function(docs){
        const nomChemin = (parentHandle.name ? parentHandle.name + "/" : "") + childHandle.name;
        const etat = projdAdopter("dossier", nomChemin, f, docs);
        etat.neuf = true;
        return etat;
      });
    });
  });
}
/* Voie selecteur : on demande le dossier, puis on lit son fichier projet. S'il
   n'en a pas et que `creer` est vrai, on l'ecrit -- c'est ainsi qu'on prend un
   dossier vide pour un projet neuf. */
function projdChoisirDossier(creer, nomImpose){
  if(!projdSelecteurDispo())
    return Promise.reject(new Error("Ce navigateur n'a pas de selecteur de"
      + " dossier. Lancez web_CAO.py --local, ou utilisez Chrome ou Edge."));
  /* `id` fait revenir la boite de dialogue la ou on l'a laissee la derniere
     fois : on range en general ses projets au meme endroit. */
  return window.showDirectoryPicker({mode:"readwrite", id:"cao-projet"})
    .then(function(h){
      return projdAdopterHandle(h, creer === undefined ? true : creer, nomImpose);
    });
}
/* Un dossier retenu devient le projet courant. Le fichier projet fait foi ;
   s'il manque et qu'on a le droit de creer, on l'ecrit -- c'est ainsi qu'un
   dossier vide, ou un dossier qu'on vient de faire dans la boite de dialogue,
   devient un projet neuf. L'etat renvoye porte `neuf` : l'appelant a le droit
   de dire lequel des deux gestes vient d'avoir lieu. */
function projdAdopterHandle(h, creer, nomImpose){
  let neuf = false;
  return projdHandleAutorise(h,true).then(function(ok){
    if(!ok) throw new Error("Acces au dossier refuse");
    return projdLireFichierHandle(h,PROJD_FICHIER).catch(function(e){
      return projdVeutCreer(creer,h).then(function(oui){
        if(!oui) throw new Error("Ce dossier n'a pas de "+PROJD_FICHIER
          + " : ce n'est pas un projet. (" + e.message + ")");
        neuf = true;
        const nom = projNomValide(nomImpose) || projNomValide(h.name) || "projet";
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
  function note(f, quand){
    if(!PROJD.documents) PROJD.documents = {};
    PROJD.documents[outil] = {fichier:f||nom, present:true, modifie:quand||Date.now()};
    try{ projSignaler(); }catch(_){}
    return f||nom;
  }
  if(PROJD.mode === "serveur")
    return projdApi("PUT","/api/projet/doc",{chemin:PROJD.chemin, doc:outil}, obj)
      .then(function(r){ return note(r.fichier, r.modifie); });
  if(!PROJD_HANDLE) return Promise.reject(new Error("Dossier plus accessible"));
  return projdHandleAutorise(PROJD_HANDLE,true).then(function(ok){
    if(!ok) throw new Error("Acces au dossier refuse");
    return projdEcrireFichierHandle(PROJD_HANDLE,nom,obj).then(function(){ return note(nom); });
  });
}
/* ==========================================================================
   Enregistrer (local) et Sauvegarder le projet (GitHub) -- WEB_SUITE
   --------------------------------------------------------------------------
   Lance par WEB_SUITE, web_CAO.py relaie au lanceur l'envoi de PROJETS sur
   GitHub (commit + pull + push, routes /api/github*). Deux gestes, alors :
     - Enregistrer (Ctrl+S, menu Fichier, roulette tactile) et l'export du
       schema vers le PCB ecrivent le document dans le dossier du projet
       (PROJETS/CAO/<projet>), et c'est tout : rien ne part sur GitHub. Une
       retouche de derniere minute ne fait pas un commit ;
     - « Sauvegarder le projet » (Ctrl+Maj+S) enregistre le document ouvert de
       la meme facon, puis envoie tout le projet sur GitHub en un seul commit
       (schema, carte et LIB ecrits depuis le dernier envoi).
   Que l'on soit sur le PC du lanceur ou sur une tablette reliee a un
   Raspberry Pi, le projet n'a ainsi qu'un seul endroit : le depot des projets.
   Jamais de telechargement en mode WEB_SUITE.
   Sans lanceur (double-clic, serveur seul), rien ne change : enregistrer
   ecrit dans le projet ouvert, ou telecharge le fichier.
   ========================================================================== */
let PROJD_GH;                            // undefined = pas encore teste ; sinon {suite, disponible, detail}
let PROJD_GH_TEST = null;                // la requete en cours, partagee
function projdGithubTester(){
  if(PROJD_GH !== undefined) return Promise.resolve(PROJD_GH);
  if(PROJD_GH_TEST) return PROJD_GH_TEST;
  const non = {suite:false, disponible:false, detail:""};
  if(typeof fetch !== "function" || typeof location === "undefined"
     || !/^https?:$/.test(location.protocol)){
    PROJD_GH = non; return Promise.resolve(PROJD_GH);
  }
  PROJD_GH_TEST = projdApi("GET","/api/github").then(function(r){
    PROJD_GH = {suite:!!(r && r.suite !== false), disponible:!!(r && r.disponible),
                detail:String((r && r.detail) || "")};
    return PROJD_GH;
  }).catch(function(){ PROJD_GH = non; return PROJD_GH; });
  return PROJD_GH_TEST;
}
/* L'outil a-t-il ete lance par WEB_SUITE ? (promesse, puis lecture synchrone) */
function projdSuiteDispo(){
  return projdGithubTester().then(function(e){ return e.suite; });
}
function projdSuite(){ return !!(PROJD_GH && PROJD_GH.suite); }
function projdGithubDispo(){
  return projdGithubTester().then(function(e){ return e.disponible; });
}
function projdGithubPossible(){
  return !!(PROJD_GH && PROJD_GH.disponible) && PROJD.mode === "serveur";
}
/* Envoie PROJETS sur GitHub. Poste neuf (git sans nom ni e-mail) : on les
   demande une fois, le lanceur les range dans la config du depot PROJETS. */
function projdGithubEnvoyer(message){
  const envoi = function(){
    return projdApi("POST","/api/github/envoyer",null,{message:message||""});
  };
  return envoi().then(function(r){
    if(!r.identite) return r;
    const nom = prompt("Premier envoi depuis ce serveur.\nVotre nom pour les commits git :");
    if(!nom) return {ok:false, message:"Envoi annulé : enregistré sur le serveur seulement."};
    const email = prompt("Votre adresse e-mail (celle de votre compte GitHub) :");
    if(!email) return {ok:false, message:"Envoi annulé : enregistré sur le serveur seulement."};
    return projdApi("POST","/api/github/identite",null,{nom:nom, email:email})
      .then(function(i){ return i.ok ? envoi() : i; });
  });
}
/* Un envoi a la fois. Un enregistrement fait pendant un envoi en cours n'y
   serait pas forcement : on en relance un seul apres, qui emporte tout ce qui
   a ete ecrit entre-temps (avec le message du dernier enregistrement). */
let PROJD_ENVOI = null, PROJD_ENVOI_SUIVANT = null, PROJD_ENVOI_MSG = "";
function projdGithubEnvoyerFile(message){
  PROJD_ENVOI_MSG = message;
  if(!PROJD_ENVOI){
    const fin = function(){ PROJD_ENVOI = null; };
    PROJD_ENVOI = projdGithubEnvoyer(message).then(function(r){ fin(); return r; },
                                                   function(e){ fin(); throw e; });
    return PROJD_ENVOI;
  }
  if(!PROJD_ENVOI_SUIVANT){
    PROJD_ENVOI_SUIVANT = PROJD_ENVOI.catch(function(){}).then(function(){
      PROJD_ENVOI_SUIVANT = null;
      return projdGithubEnvoyerFile(PROJD_ENVOI_MSG);
    });
  }
  return PROJD_ENVOI_SUIVANT;
}
/* En mode WEB_SUITE, rien ne s'enregistre hors d'un projet de PROJETS. Sans
   projet du serveur ouvert, on demande ou ranger le document : un projet
   existant (on l'ouvre) ou un nouveau (on le cree dans PROJETS/CAO). Rend
   vrai si un projet du serveur est ouvert a la sortie. */
function projdProjetSuite(libelle){
  if(PROJD.mode === "serveur") return Promise.resolve(true);
  return projdListerServeur().catch(function(){ return {projets:[]}; }).then(function(r){
    const projets = (r && r.projets) || [];
    const ici = PROJD.mode ? "Le dossier ouvert n'est pas dans PROJETS (il ne serait pas envoyé sur GitHub).\n"
                           : "Aucun projet ouvert.\n";
    const liste = projets.length
      ? "\nProjets existants : " + projets.slice(0, 12).map(function(p){ return p.nom; }).join(", ") + "\n" : "";
    const brut = prompt(ici + "Lancé par WEB_SUITE, tout s'enregistre dans un projet de PROJETS, puis part sur GitHub."
      + liste + "\nNom du projet où ranger " + libelle + " (créé s'il n'existe pas) :", projNom() || "");
    if(brut === null) return false;
    const nom = projNomValide(brut);
    if(!nom){
      alert("Nom de projet refusé : évitez \\ / : * ? \" < > | et les points en début ou fin de nom (60 caractères au plus).");
      return false;
    }
    const bas = nom.toLowerCase();
    const existe = projets.find(function(p){
      return String(p.nom).toLowerCase() === bas
          || String(p.chemin).split(/[\\/]/).pop().toLowerCase() === bas;
    });
    if(existe){
      if(!confirm("Le projet « " + existe.nom + " » existe déjà.\n\nL'ouvrir et y enregistrer "
                  + libelle + " ? (celui du projet sera remplacé)")) return false;
      return projdOuvrirServeur(existe.chemin, existe.racine).then(function(){ return true; });
    }
    return projdCreerServeur(nom, {chemin:nom}).then(function(){ return true; });
  }).catch(function(e){
    projdAvis("erreur", "Rien n'est enregistré", "Projet impossible à ouvrir ou créer : " + e.message);
    return false;
  });
}
/* Enregistrer en mode WEB_SUITE : dans un projet de PROJETS, sur le disque du
   serveur, sans rien envoyer sur GitHub. `enregistrer` rend une promesse :
   vrai si le document est bien dans le dossier du projet (sinon l'editeur a
   deja dit pourquoi). `dire` affiche une ligne d'etat, `libelle` nomme le
   document (« le schéma », « la carte »). `envoi` : vrai quand
   projdEnregistrerGithub enchaine l'envoi, l'avis ne dit alors pas « pas
   encore sur GitHub ». Rend vrai si c'est enregistre. */
function projdEnregistrerLocal(enregistrer, dire, libelle, envoi){
  const quoi = libelle || "le document";
  dire = dire || function(){};
  return projdProjetSuite(quoi).then(function(ok){
    if(!ok){
      dire("Rien n'est enregistré : aucun projet choisi.");
      projdAvis("erreur", "Rien n'est enregistré",
        "Lancé par WEB_SUITE, on n'enregistre que dans un projet de PROJETS. Votre travail reste dans l'éditeur : enregistrez de nouveau en choisissant un projet.");
      return false;
    }
    return Promise.resolve(enregistrer()).then(function(dansProjet){
      if(!dansProjet) return false;          // l'editeur a deja dit pourquoi
      if(!envoi){
        const t = "Enregistré en local, pas encore sur GitHub : « Sauvegarder le projet » l'y envoie.";
        dire(t);
        projdAvis("ok", "Enregistré en local", projdQuand(Date.now())
          + " · pas encore sur GitHub : « ☁ Sauvegarder le projet » (Ctrl+Maj+S) l'y envoie");
      }
      return true;
    });
  });
}
/* Sauvegarder le projet : le document ouvert est enregistre comme ci-dessus,
   puis tout le projet part sur GitHub en un seul commit (le lanceur ajoute
   tout ce qui a change dans PROJETS, exports locaux compris). `defaut` est le
   message du commit (ou la fonction qui le donne). Rend vrai si c'est
   enregistre. */
function projdEnregistrerGithub(enregistrer, defaut, dire, libelle){
  return projdEnregistrerLocal(enregistrer, dire, libelle, true).then(function(ok){
    if(!ok) return false;
    // une fonction : le nom du projet n'est connu qu'une fois celui-ci choisi
    const message = (typeof defaut === "function" ? defaut() : defaut)
                    || ("WEB_CAO " + new Date().toLocaleString("fr-FR"));
    return projdEnvoyerSuite(message, dire, "Projet sauvegardé").then(function(){ return true; });
  });
}
/* Ce qui vient d'etre ecrit dans PROJETS (un document de projet, ou la LIB)
   part sur GitHub, et l'avis le dit. `titre` commence la phrase de l'avis
   (« Enregistré », « Bibliothèque enregistrée ») ; `accord` (« e ») accorde
   « envoyé » avec lui. Rend vrai si l'envoi a reussi ; ne rejette jamais :
   ce qui est ecrit l'est, seul l'envoi a pu echouer. */
function projdEnvoyerSuite(message, dire, titre, accord){
  const t0 = titre || "Enregistré";
  const env = "envoyé" + (accord || "");
  dire = dire || function(){};
  return projdGithubTester().then(function(etat){
    if(!etat.disponible){
      /* Lance par WEB_SUITE, mais cet appareil n'a pas le droit d'envoyer
         (jeton du lanceur absent) : c'est sur le serveur, on dit quoi faire
         pour que l'envoi passe la prochaine fois. */
      const t = etat.detail || "Envoi sur GitHub refusé à cet appareil.";
      dire(t);
      projdAvis("partiel", t0 + " sur le serveur, pas " + env + " sur GitHub", t);
      return false;
    }
    dire(t0 + ". Envoi sur GitHub…");
    projdAvis("encours", t0 + " · envoi sur GitHub…", projdQuand(Date.now()));
    return projdGithubEnvoyerFile(message).then(function(r){
      if(r.ok){
        projdNoterEnvoi();
        dire(t0 + " et " + env + " sur GitHub.");
        projdAvis("ok", t0 + " et " + env + " sur GitHub", projdQuand(Date.now()) + " · « " + message + " »");
        return true;
      }
      /* Un refus se lit en entier (il dit quoi faire) : la barre d'etat le
         couperait, surtout sur une tablette. */
      const t = r.message || "Envoi sur GitHub refusé.";
      dire(t);
      projdAvis("erreur", t0 + " sur le serveur, mais pas " + env + " sur GitHub", t);
      return false;
    }, function(e){
      const t = "Envoi sur GitHub impossible : " + e.message;
      dire(t);
      projdAvis("erreur", t0 + " sur le serveur, mais pas " + env + " sur GitHub", t);
      return false;
    });
  });
}
/* Dernier envoi reussi sur GitHub, par projet. Garde dans ce navigateur : un
   envoi fait depuis un autre appareil n'y figure pas. */
const PROJD_ENVOI_CLE = "cao.projet.envoiGithub";
function projdNoterEnvoi(){
  try{
    const m = JSON.parse(localStorage.getItem(PROJD_ENVOI_CLE) || "{}");
    m[PROJD.chemin || (typeof projNom === "function" ? projNom() : "") || "PROJETS"] = Date.now();
    localStorage.setItem(PROJD_ENVOI_CLE, JSON.stringify(m));
  }catch(_){}
}
function projdDernierEnvoi(){
  try{
    const m = JSON.parse(localStorage.getItem(PROJD_ENVOI_CLE) || "{}");
    return m[PROJD.chemin || projNom()] || 0;
  }catch(_){ return 0; }
}

/* ==========================================================================
   Avis de sauvegarde
   --------------------------------------------------------------------------
   La barre d'etat des editeurs est coupee sur une tablette : une sauvegarde
   reussie ou ratee y passait inapercue. L'avis s'affiche en haut de l'ecran.
   `etat` : "ok" (vert), "partiel" (orange : enregistre mais pas tout), "info",
   "encours", "erreur" (rouge, reste jusqu'a ce qu'on le touche).
   ========================================================================== */
function projdAvis(etat, titre, detail){
  if(typeof document === "undefined" || !document.body || !document.createElement) return;
  let a = document.getElementById("projdAvis");
  if(!a){
    a = document.createElement("div");
    a.id = "projdAvis";
    a.setAttribute("role", "status");
    a.setAttribute("aria-live", "polite");
    a.onclick = function(){ a.classList.remove("on"); };
    document.body.appendChild(a);
  }
  const ico = {ok:"✓", partiel:"!", info:"i", encours:"…", erreur:"✕"}[etat] || "i";
  a.className = "on " + (etat || "info");
  a.innerHTML = '<span class="pa-ico">' + ico + '</span><span class="pa-txt"><b></b><small></small></span>';
  a.querySelector("b").textContent = titre || "";
  a.querySelector("small").textContent = detail || "";
  clearTimeout(projdAvis.minuterie);
  if(etat !== "erreur" && etat !== "encours")
    projdAvis.minuterie = setTimeout(function(){ a.classList.remove("on"); }, etat === "partiel" ? 9000 : 5000);
}
/* Les boutons d'enregistrement. « Enregistrer » (`idSave`) reste toujours :
   lance par WEB_SUITE, il ecrit en local dans le projet, et son titre le dit.
   « Sauvegarder le projet » (`id`, qui appelle `action`) n'apparait que lance
   par WEB_SUITE : c'est lui qui envoie sur GitHub. */
function projdGithubBouton(id, action, idSave){
  const b = document.getElementById(id);
  if(!b) return;
  b.onclick = action;
  const s = idSave ? document.getElementById(idSave) : null;
  const titreSave = s ? s.title : "";
  const peindre = function(){
    const suite = projdSuite();
    b.style.display = suite ? "" : "none";
    if(s) s.title = suite
      ? "Écrit dans le dossier du projet (PROJETS), sans envoyer sur GitHub — « Sauvegarder le projet » s'en charge"
      : titreSave;
  };
  peindre();
  projdSuiteDispo().then(peindre);
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
/* Un projet sans dossier n'existe que dans la mémoire du navigateur, et
   c'est ainsi que renaissent les mauvaises versions : on le referme. Seul
   le disque fait foi. Un dossier en attente d'autorisation, lui, est bien
   un dossier : on le garde, l'accueil propose de le rouvrir. */
function projdReprendreOuFermer(){
  return projdReprendre().then(function(r){
    if(!r && !PROJD_ATTENTE && typeof projNom === "function" && projNom()
       && typeof projFermer === "function") projFermer();
    return r;
  });
}
/* La reprise, pour qui doit l'attendre : l'export du schema vers le PCB ne
   touche a la carte qu'une fois le dossier du projet rattache. */
let PROJD_REPRISE_P = null;
function projdPret(){ return PROJD_REPRISE_P || Promise.resolve(null); }
try{
  if(typeof window !== "undefined" && typeof document !== "undefined"){
    if(document.readyState === "loading")
      PROJD_REPRISE_P = new Promise(function(fin){
        document.addEventListener("DOMContentLoaded", function(){ fin(projdReprendreOuFermer()); });
      });
    else PROJD_REPRISE_P = projdReprendreOuFermer();
  }
}catch(_){}
