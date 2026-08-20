"use strict";
/* =============================================================================
   recherche-composants — 01-api.js
   Dialogue avec serveur-composants.py, qui relaie vers pcbparts.dev. La page
   ne parle jamais directement au serveur MCP : sans passerelle locale, ni le
   CORS ni le protocole ne le permettraient.

   L'adresse de la passerelle est cherchée dans cet ordre :
     1. celle mémorisée par l'utilisateur (bouton « Serveur… ») ;
     2. l'origine qui sert la page (cas normal : tout tourne sur le 8420) ;
     3. le même hôte sur le port 8420 (page servie par serveur.py, port 8000) ;
     4. http://127.0.0.1:8420 (page ouverte en file://).
   ============================================================================= */

const API_CLE="recherche.api.v1";      // clé de stockage local
const API_PORT=8420;

let API_BASE=null;                     // racine retenue, "" = même origine
let API_SCHEMAS={};                    // nom d'outil -> inputSchema du serveur
let API_NOMS=[];                       // outils autorisés par la passerelle

function apiMemorisee(){
  try{return localStorage.getItem(API_CLE)||"";}catch(e){return "";}
}
function apiMemoriser(base){
  try{
    if(base)localStorage.setItem(API_CLE,base);
    else localStorage.removeItem(API_CLE);
  }catch(e){}
}

/* racines à essayer, sans doublon */
function apiCandidats(){
  const out=[], ajoute=function(v){if(v!==null&&out.indexOf(v)<0)out.push(v);};
  const memo=apiMemorisee();
  if(memo)ajoute(memo.replace(/\/+$/,""));
  if(location.protocol==="http:"||location.protocol==="https:"){
    ajoute("");                                        // même origine
    ajoute(location.protocol+"//"+location.hostname+":"+API_PORT);
  }
  ajoute("http://127.0.0.1:"+API_PORT);
  return out;
}

/* message d'erreur lisible : FastAPI répond {"detail": "..."} */
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
