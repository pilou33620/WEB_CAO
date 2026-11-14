"use strict";
/* =============================================================================
   commun/echappe.js
   Échappement HTML d'un texte avant innerHTML ou un attribut entre guillemets,
   pour toutes les pages de WEB_CAO. Chargé en premier par chacune d'elles.
   null et undefined donnent une chaîne vide ; un nombre s'écrit (0 compris).
   Aussi ENTETE_WEB : l'en-tête maison que web_cao exige sur tout POST/PUT/DELETE
   (une autre page ne peut pas l'ajouter sans pré-vol CORS) ; commun/pilote.js le lit.
   ============================================================================= */
/* Deux noms pour le même en-tête : un relais peut retirer celui qui porte un « _ »
   (nginx par défaut) ; web_cao accepte l'un ou l'autre. */
const ENTETE_WEB={"X-WEB_CAO":"1","X-Web-Cao":"1"};
/* Sous un relais (launcher : la page est à /o/web_cao/…), un fetch("/api/x") perd le
   préfixe de l'outil : le relais devait deviner l'outil visé d'après le Referer ou un
   cookie. La racine de l'outil se lit dans l'adresse de ce script ; toute adresse
   absolue du site la reprend. Servie en direct, la racine est vide : rien ne change.
   Monofichier (dist/*.html) : ce script est en ligne, sans adresse ; la racine se lit
   alors dans l'adresse de la page. RACINE_OUTIL sert aussi aux liens (window.open, href). */
const RACINE_OUTIL=(function(){
  let racine="";
  try{
    const src=document.currentScript&&document.currentScript.src;
    racine=src?new URL(src).pathname.replace(/\/commun\/echappe\.js$/,"")
      :/^http/.test(location.protocol)?location.pathname.replace(
        /\/(?:(?:editeur-pcb|editeur-schematique|gestion-lib|visionneuse-ipc2581|recherche-composants)\/.*|[^\/]*)$/,""):"";
  }catch(_){}
  if(racine.endsWith(".js"))racine="";
  if(!racine||typeof window.fetch!=="function")return racine;
  const f=window.fetch.bind(window);
  window.fetch=(u,o)=>f(typeof u==="string"&&u[0]==="/"&&u[1]!=="/"&&!u.startsWith(racine+"/")?racine+u:u,o);
  return racine;
})();
const ESC_HTML={"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;","`":"&#96;"};
function esc(s){
  return s==null?"":String(s).replace(/[&<>"'`]/g,ch=>ESC_HTML[ch]);
}

/* Échap ferme la fenêtre modale du dessus, sur toutes les pages : beaucoup n'avaient
   aucun écouteur, d'autres l'avaient sur la fenêtre alors que le focus restait sur le
   bouton qui l'avait ouverte — et Échap désélectionnait derrière. En capture, pour
   passer avant les raccourcis de l'éditeur. On clique son propre bouton de fermeture :
   ce que la fenêtre fait en se fermant (rendre une esquisse, oublier un brouillon) reste
   à elle. Sans bouton reconnu, on ne touche à rien. */
const ECHAP_FENETRES=".modal,.modal-overlay,.jlc-modal-overlay";
const ECHAP_FERMER='[data-a="fermer"],[data-a="annuler"],[id$="Close"],[id$="Fermer"],[title^="Fermer"],[aria-label^="Fermer"]';
function echapFenetreDuDessus(){
  const vues=[...document.querySelectorAll(ECHAP_FENETRES)].filter(m=>!m.hidden&&m.getClientRects().length);
  return vues[vues.length-1]||null;
}
function echapBoutonFermer(m){
  const b=m.querySelector(ECHAP_FERMER);
  if(b)return b;
  return [...m.querySelectorAll("button")].find(x=>/^\s*(✕|×|Fermer|Annuler|Passer)\s*$/.test(x.textContent))||null;
}
if(typeof document!=="undefined"&&document.addEventListener)document.addEventListener("keydown",function(e){
  if(e.key!=="Escape"||e.defaultPrevented)return;
  try{
    const m=echapFenetreDuDessus(), b=m&&echapBoutonFermer(m);
    if(!b)return;
    e.preventDefault();e.stopPropagation();
    b.click();
  }catch(_){}
},true);
