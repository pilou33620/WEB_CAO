"use strict";
/* =============================================================================
   recherche-composants — 06-demarrage.js
   Câblage de la page : liste des outils, lancement des requêtes, historique,
   exports, adresse de la passerelle, navigation vers les deux éditeurs.
   ============================================================================= */

/* message d'état du pied de page ; workspace.js s'en sert aussi s'il existe */
function hint(t){
  const el=document.getElementById("fHint");
  if(el)el.textContent=t;
}
function q(id){return document.getElementById(id);}

let HISTORIQUE=[];          // états précédents : {outil, args, data}
let EN_COURS=false;

/* ---------- panneau « Outils » ---------- */
function construireListeOutils(filtre){
  const f=(filtre||"").trim().toLowerCase();
  const dispo=API_NOMS.length?API_NOMS:Object.keys(OUTILS);
  let h="", vus={};
  for(const fam of FAMILLES){
    const outils=fam.outils.filter(function(nom){
      if(dispo.indexOf(nom)<0)return false;
      if(!f)return true;
      const cat=OUTILS[nom]||{};
      return (nom+" "+(cat.titre||"")+" "+(cat.resume||"")).toLowerCase().indexOf(f)>=0;
    });
    if(!outils.length)continue;
    h+='<div class="fam">'+esc(fam.nom)+"</div>";
    for(const nom of outils){
      vus[nom]=1;
      h+='<button class="outil'+(nom===OUTIL_COURANT?" on":"")+'" data-outil="'+esc(nom)+'">'+
         esc((OUTILS[nom]||{}).titre||nom)+"<small>"+esc(nom)+"</small></button>";
    }
  }
  /* outils exposés par la passerelle mais absents du catalogue */
  const autres=dispo.filter(n=>!vus[n]&&FAMILLES.every(fa=>fa.outils.indexOf(n)<0));
  if(autres.length&&!f){
    h+='<div class="fam">Autres</div>';
    for(const nom of autres)
      h+='<button class="outil" data-outil="'+esc(nom)+'">'+esc(nom)+"</button>";
  }
  const liste=q("listeOutils");
  liste.innerHTML=h||'<div class="vide">Aucun outil ne correspond.</div>';
  liste.querySelectorAll(".outil").forEach(function(b){
    b.onclick=function(){
      construireFormulaire(b.dataset.outil);
      hint("Outil « "+((OUTILS[b.dataset.outil]||{}).titre||b.dataset.outil)+" » sélectionné.");
    };
  });
}

/* ---------- lancement d'une requête ---------- */
async function lancer(){
  if(EN_COURS)return;
  const err=q("formErr");
  let args;
  try{args=lireFormulaire();}
  catch(e){err.textContent=e.message;hint("Requête non envoyée.");return;}
  err.textContent="";

  EN_COURS=true;
  q("bRun").disabled=q("bRun2").disabled=true;
  hint("Interrogation de pcbparts.dev…");
  try{
    const data=await apiAppel(OUTIL_COURANT,args);
    if(RESULTAT.data!==null)
      HISTORIQUE.push({outil:RESULTAT.outil,args:RESULTAT.args,data:RESULTAT.data});
    if(HISTORIQUE.length>30)HISTORIQUE.shift();
    afficherResultat(OUTIL_COURANT,args,data);
    hint("Réponse reçue.");
  }catch(e){
    const msg=(e&&e.message)||String(e);
    err.textContent=msg;
    q("resultats").innerHTML='<div class="vide"><b>La requête a échoué.</b><br>'+
      esc(msg)+"</div>";
    hint("Échec de la requête.");
  }finally{
    EN_COURS=false;
    q("bRun").disabled=q("bRun2").disabled=false;
    majBoutons();
  }
}

function majBoutons(){
  q("bBack").disabled=!HISTORIQUE.length;
}
function revenir(){
  const e=HISTORIQUE.pop();
  if(!e)return;
  remplirFormulaire(e.outil,e.args);
  afficherResultat(e.outil,e.args,e.data);
  majBoutons();
  hint("Retour au résultat précédent.");
}

/* ---------- adresse de la passerelle ---------- */
function majEtatApi(ok,texte){
  const el=q("fApi");
  el.className="push "+(ok?"ok":"ko");
  el.textContent="serveur : "+texte;
}
function fenetreServeur(){
  let m=q("mdServeur");
  if(!m){
    m=document.createElement("div");
    m.id="mdServeur";m.className="modal";m.hidden=true;
    m.innerHTML=
      '<div class="modal-box">'+
        '<div class="modal-head">Adresse de la passerelle</div>'+
        '<div class="modal-corps">'+
          "<p>La recherche passe par un serveur local, qui relaie les requêtes "+
          "vers pcbparts.dev. <code>serveur.py</code> le fait lui-même : laissez "+
          "le champ vide pour la détection automatique, ou indiquez l'adresse "+
          "d'un autre serveur.</p>"+
          '<p><code>python serveur.py</code></p>'+
          '<div class="champ"><label for="mdBase">Racine</label>'+
          '<input type="text" id="mdBase" placeholder="laisser vide = détection automatique" spellcheck="false"></div>'+
        "</div>"+
        '<div class="modal-pied">'+
          '<button class="tb" id="mdAnnule">Annuler</button>'+
          '<button class="tb on" id="mdOk">Se connecter</button>'+
        "</div>"+
      "</div>";
    document.body.appendChild(m);
    m.querySelector("#mdAnnule").onclick=function(){m.hidden=true;};
    m.querySelector("#mdOk").onclick=async function(){
      const v=m.querySelector("#mdBase").value.trim().replace(/\/+$/,"");
      apiMemoriser(v);
      API_BASE=null;
      m.hidden=true;
      await connecter();
    };
    m.addEventListener("keydown",function(ev){
      if(ev.key==="Escape")m.hidden=true;
      if(ev.key==="Enter")m.querySelector("#mdOk").click();
    });
  }
  m.querySelector("#mdBase").value=apiMemorisee();
  m.hidden=false;
  m.querySelector("#mdBase").focus();
}

/* ---------- connexion ---------- */
async function connecter(){
  hint("Recherche de la passerelle…");
  try{
    const base=await apiConnecter();
    majEtatApi(true,(base||location.origin)+" · "+API_NOMS.length+" outils");
    construireListeOutils(q("filtreOutils").value);
    construireFormulaire(OUTILS[OUTIL_DEFAUT]?OUTIL_DEFAUT:API_NOMS[0]);
    hint("Prêt. Saisissez une requête puis Entrée.");
    return true;
  }catch(e){
    majEtatApi(false,"injoignable");
    construireListeOutils("");
    construireFormulaire(OUTIL_DEFAUT);     // le formulaire reste utilisable
    q("formResume").textContent=
      "La passerelle ne répond pas : les recherches sont impossibles tant qu'elle "+
      "n'est pas démarrée.";
    q("resultats").innerHTML=
      '<div class="vide"><b>Passerelle introuvable.</b><br>'+
      "Cette page a besoin d'un serveur local pour relayer les requêtes vers "+
      "pcbparts.dev (le navigateur ne peut pas l'appeler directement). "+
      "<b>serveur.py</b> s'en charge, sans dépendance à installer.<br><br>"+
      "Dans le dossier du dépôt :<br>"+
      "<code>python serveur.py</code><br><br>"+
      "puis ouvrez la page depuis l'adresse affichée au démarrage. Si le serveur "+
      "tourne ailleurs, indiquez son adresse avec le bouton « Serveur… ».<br><br>"+
      '<span class="err">'+esc((e&&e.message)||String(e))+"</span></div>";
    hint("Passerelle introuvable.");
    return false;
  }
}

/* ---------- session d'onglet ----------
   La recherche n'a pas de document à perdre, mais elle a un contexte : l'outil
   choisi, la requête saisie, le résultat reçu. Repartir de zéro après un
   aller-retour vers le schéma reviendrait à ressaisir la recherche et à
   redemander à pcbparts.dev ce qu'on avait déjà. Tout cela tient dans la
   session de l'onglet (commun/session.js). */
function etatComposants(){
  if(!OUTIL_COURANT)return null;
  let args;
  /* le formulaire est photographié tel qu'il est, même incomplet : c'est une
     saisie en cours, pas une requête à valider */
  try{args=lireFormulaire();}catch(_){args=(RESULTAT&&RESULTAT.args)||{};}
  const base={outil:OUTIL_COURANT,args:args,filtre:q("filtreOutils").value||""};
  const complet=Object.assign({},base,{
    resOutil:RESULTAT.outil,resArgs:RESULTAT.args,data:RESULTAT.data,
    index:RESULTAT.index,historique:HISTORIQUE.slice(-5)
  });
  /* une réponse volumineuse ne doit pas emporter le reste : à défaut du
     résultat, on garde au moins la requête en cours */
  return sessTient(complet)?complet:base;
}
/* Reprise. Appelée seulement quand la passerelle répond : sans elle, la page
   affiche son diagnostic, et le recouvrir d'anciens résultats laisserait
   croire que la recherche fonctionne. */
function sessionComposants(repris){
  if(!repris)return false;
  const e=repris.etat;
  const outil=e.outil;
  if(!outil||(!OUTILS[outil]&&API_NOMS.indexOf(outil)<0))return false;
  try{
    if(e.filtre){q("filtreOutils").value=e.filtre;construireListeOutils(e.filtre);}
    remplirFormulaire(outil,e.args||{});
    if(Array.isArray(e.historique))HISTORIQUE=e.historique;
    if(e.data!==undefined&&e.data!==null){
      afficherResultat(e.resOutil||outil,e.resArgs||e.args||{},e.data);
      const i=Number(e.index);
      if(Number.isFinite(i)&&i>=0)choisirLigne(i,true);
      hint("Recherche reprise : le dernier résultat est retrouvé, sans nouvelle requête.");
    }else{
      hint("Recherche reprise : formulaire tel que vous l'aviez laissé.");
    }
  }catch(_){
    sessEffacer("composants");
    return false;
  }
  majBoutons();
  return true;
}

/* ---------- démarrage ---------- */
(function demarrer(){
  /* les boutons de navigation sont câblés par commun/session.js
     (data-cao-nav), qui met le contexte de côté avant de changer de page */
  const repris=sessBrancher("composants",etatComposants);

  q("bRun").onclick=q("bRun2").onclick=function(){lancer();};
  q("bReset").onclick=q("bReset2").onclick=function(){
    construireFormulaire(OUTIL_COURANT);
    hint("Formulaire réinitialisé.");
  };
  q("bBack").onclick=revenir;
  q("bCsv").onclick=exportCsv;
  q("bJson").onclick=exportJson;
  q("bApi").onclick=fenetreServeur;
  q("bCopyJson").onclick=function(){
    const t=JSON.stringify(RESULTAT.data,null,1);
    if(navigator.clipboard&&navigator.clipboard.writeText)
      navigator.clipboard.writeText(t).then(function(){hint("JSON copié.");},
                                            function(){hint("Copie refusée par le navigateur.");});
  };
  q("filtreOutils").oninput=function(){construireListeOutils(this.value);};

  document.addEventListener("keydown",function(ev){
    if(ev.key==="F5"||ev.target.closest("input,textarea,select"))return;
    if(ev.key==="/"){ev.preventDefault();q("filtreOutils").focus();}
  });

  brancherActions();
  majBoutons();
  connecter().then(function(ok){ if(ok)sessionComposants(repris); });
})();
