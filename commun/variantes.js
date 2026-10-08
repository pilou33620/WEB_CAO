"use strict";
/* ==========================================================================
   WEB_CAO -- Variantes de montage (BOM), communes au schéma et au PCB
   --------------------------------------------------------------------------
   Une même carte se monte de plusieurs façons : une version « Lite » sans le
   module radio, une version « Pro » sans le connecteur de debug… Le cuivre ne
   change pas, seule la liste des composants posés change.

   LE SCHÉMA FAIT FOI. Il range dans son document :
     variantes : { liste: [{id, nom}], active: id | "" }
   et chaque composant la liste des variantes où il N'EST PAS monté :
     nonMonte : [id, …]           (absent = monté partout)
   La variante "" est la carte complète : tout est monté. L'appartenance est
   portée par le composant, et non par une liste de repères : renuméroter les
   repères ne perd donc rien.

   Le PCB en reçoit une copie (S.variantes, fp.nonMonte) à la synchronisation
   avec le schéma, pour ses bom.csv et positions.csv.

   Rien ici ne touche au DOM : le banc d'essai l'éprouve tel quel.
   ========================================================================== */

const VAR_MAX = 20;                 // variantes par document
const VAR_NOM_MAX = 40;

/* Modèle vide : aucune variante, carte complète. */
function varVide(){ return {liste: [], active: ""}; }

/* Normalise le modèle lu dans un fichier : identifiants uniques et courts,
   noms bornés, variante active existante. Neutre sur ce que l'éditeur écrit. */
function varNorm(v){
  const out = varVide();
  const src = (v && typeof v === "object") ? v : {};
  const vus = new Set();
  for(const e of (Array.isArray(src.liste) ? src.liste : [])){
    if(!e || typeof e !== "object") continue;
    const id = String(e.id == null ? "" : e.id).trim().slice(0, 16);
    if(!id || vus.has(id)) continue;
    const nom = String(e.nom == null ? "" : e.nom).trim().slice(0, VAR_NOM_MAX) || id;
    vus.add(id);
    out.liste.push({id: id, nom: nom});
    if(out.liste.length >= VAR_MAX) break;
  }
  const a = String(src.active == null ? "" : src.active);
  out.active = vus.has(a) ? a : "";
  return out;
}

/* La liste « non monté » d'un composant, réduite aux variantes connues (un
   identifiant absent de `modele` est écarté ; sans modèle, tout est gardé). */
function varNormNonMonte(liste, modele){
  if(!Array.isArray(liste)) return [];
  const ok = modele ? new Set(modele.liste.map(function(e){ return e.id; })) : null;
  const vus = new Set(), out = [];
  for(const x of liste){
    const id = String(x == null ? "" : x).trim().slice(0, 16);
    if(!id || vus.has(id) || (ok && !ok.has(id))) continue;
    vus.add(id); out.push(id);
  }
  return out;
}

/* Vrai si le composant est posé dans la variante `id` ("" : carte complète). */
function varEstMonte(comp, id){
  if(!id || !comp || !Array.isArray(comp.nonMonte)) return true;
  return comp.nonMonte.indexOf(id) < 0;
}

/* Pose ou retire le composant de la variante `id`. Rend vrai si cela change. */
function varDefinirMonte(comp, id, monte){
  if(!comp || !id) return false;
  const l = Array.isArray(comp.nonMonte) ? comp.nonMonte.slice() : [];
  const i = l.indexOf(id);
  if(monte && i >= 0) l.splice(i, 1);
  else if(!monte && i < 0) l.push(id);
  else return false;
  if(l.length) comp.nonMonte = l; else delete comp.nonMonte;
  return true;
}

function varTrouver(modele, id){
  if(!modele || !id) return null;
  for(const e of modele.liste) if(e.id === id) return e;
  return null;
}
/* Nom affichable d'une variante ; "" donne la carte complète. */
function varNom(modele, id){
  const e = varTrouver(modele, id);
  return e ? e.nom : "Carte complète (tout monté)";
}

/* Identifiant libre : v1, v2… jamais réutilisé tant que le document le porte. */
function varNouvelId(modele){
  const pris = new Set(modele.liste.map(function(e){ return e.id; }));
  let n = modele.liste.length + 1;
  while(pris.has("v" + n)) n++;
  return "v" + n;
}

/* Ajoute une variante, rend son identifiant (ou "" si la limite est atteinte).
   `copieDe` : une variante existante dont reprendre les non-montés -- c'est le
   geste courant, « Pro » = « Lite » moins deux composants. */
function varAjouter(modele, nom, composants, copieDe){
  if(modele.liste.length >= VAR_MAX) return "";
  const id = varNouvelId(modele);
  nom = String(nom == null ? "" : nom).trim().slice(0, VAR_NOM_MAX) || ("Variante " + id.slice(1));
  modele.liste.push({id: id, nom: nom});
  if(copieDe && varTrouver(modele, copieDe))
    for(const c of (composants || []))
      if(!varEstMonte(c, copieDe)) varDefinirMonte(c, id, false);
  return id;
}

/* Retire une variante et tout ce que les composants en disaient. */
function varSupprimer(modele, id, composants){
  const i = modele.liste.findIndex(function(e){ return e.id === id; });
  if(i < 0) return false;
  modele.liste.splice(i, 1);
  if(modele.active === id) modele.active = "";
  for(const c of (composants || [])) varDefinirMonte(c, id, true);
  return true;
}

function varRenommer(modele, id, nom){
  const e = varTrouver(modele, id);
  nom = String(nom == null ? "" : nom).trim().slice(0, VAR_NOM_MAX);
  if(!e || !nom) return false;
  e.nom = nom;
  return true;
}

/* Fragment de nom de fichier : « Version Lite » -> « Version-Lite ». */
function varSlug(modele, id){
  const e = varTrouver(modele, id);
  if(!e) return "";
  const s = e.nom.normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
  return s || e.id;
}

/* Les repères non montés d'une variante, triés comme une nomenclature. */
function varReperesNonMontes(composants, id){
  if(!id) return [];
  const out = [];
  for(const c of (composants || [])) if(c && c.ref && !varEstMonte(c, id)) out.push(String(c.ref));
  return out.sort(function(a, b){ return a.localeCompare(b, "fr", {numeric: true}); });
}
