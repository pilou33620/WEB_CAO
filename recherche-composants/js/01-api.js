"use strict";
/* =============================================================================
   recherche-composants — 01-api.js
   Dialogue avec le serveur local, qui relaie vers pcbparts.dev. La page ne
   parle jamais directement au serveur MCP : sans passerelle locale, ni le CORS
   ni le protocole ne le permettraient.

   La passerelle est l'origine qui sert la page (web_CAO.py relaie lui-même).
   web_CAO.py n'admet que sa propre origine : une page ouverte en file://, ou
   servie par un autre port, ne peut pas l'appeler. Si web_CAO.py a dû prendre
   un autre port (8000 peut être réservé par le système), ouvrez l'adresse
   qu'il affiche au démarrage.
   ============================================================================= */


let API_BASE=null;                     // racine retenue, "" = même origine
let API_SCHEMAS={};                    // nom d'outil -> inputSchema du serveur
let API_NOMS=[];                       // outils autorisés par la passerelle

/* racines à essayer : la même origine, rien d'autre */
function apiCandidats(){return [""];}

/* message d'erreur lisible : la passerelle répond {"detail": "..."} */
async function apiErreur(rep){
  let detail="";
  try{
    const j=await rep.json();
    detail=(j&&(j.detail||j.message))||"";
    if(typeof detail!=="string")detail=JSON.stringify(detail);
  }catch(e){}
  return "HTTP "+rep.status+(detail?" — "+detail:"");
}

/* Interroge une racine : renvoie la liste des outils, ou lève. */
async function apiListe(base){
  const rep=await fetch(base+"/api/tools",{headers:{Accept:"application/json"}});
  if(!rep.ok)throw new Error(await apiErreur(rep));
  const j=await rep.json();
  if(!j||!Array.isArray(j.tools))throw new Error("Réponse inattendue");
  return j;
}

/* Trouve la passerelle et mémorise ses schémas. Lève si aucune ne répond. */
async function apiConnecter(){
  const essais=[];
  for(const base of apiCandidats()){
    try{
      const j=await apiListe(base);
      API_BASE=base;
      API_SCHEMAS={};
      for(const t of j.tools)API_SCHEMAS[t.name]=t;
      API_NOMS=Array.isArray(j.allowed)?j.allowed:j.tools.map(t=>t.name);
      return API_BASE;
    }catch(e){
      essais.push((base||location.origin)+" : "+(e&&e.message||e));
    }
  }
  throw new Error("Aucune passerelle joignable.\n"+essais.join("\n"));
}

/* Appel d'un outil. Renvoie la charge utile déjà déballée par le serveur. */
async function apiAppel(nom,args){
  if(API_BASE===null)await apiConnecter();
  const rep=await fetch(API_BASE+"/api/tool",{
    method:"POST",
    headers:{"Content-Type":"application/json",Accept:"application/json"},
    body:JSON.stringify({name:nom,arguments:args||{}})
  });
  if(!rep.ok)throw new Error(await apiErreur(rep));
  const j=await rep.json();
  return j?j.data:null;
}
