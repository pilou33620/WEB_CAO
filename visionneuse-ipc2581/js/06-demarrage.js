"use strict";
/* =============================================================================
   visionneuse IPC-2581 — 06-demarrage.js
   Ouvrir un fichier, câbler les boutons, retrouver ses réglages, et remettre
   la carte en place au retour d'un autre outil.

   Trois façons d'ouvrir, et une seule route derrière : le bouton, le
   glisser-déposer, et la reprise de session. C'est charger() qui les rejoint.
   ============================================================================= */

/* ==========================================================================
   Réglages de l'utilisateur
   Ils appartiennent à la personne, pas au navigateur : commun/profils.js les
   range dans profils/<nom>.json dès qu'un serveur est là. Ce qu'on garde, ce
   sont des préférences d'affichage — jamais la carte elle-même.
   ========================================================================== */
const PREF="ipc2581";

function prefEcrire(){
  if(typeof profEcrire!=="function")return;
  const cachees=[];
  for(const c of V.couches)if(!c.visible)cachees.push(c.nom);
  profEcrire(PREF,{aff:V.aff,flip:V.vue.flip,cachees:cachees,sur:V.sur});
}
function prefLire(){
  if(typeof profLire!=="function")return null;
  const p=profLire(PREF);
  return (p&&typeof p==="object")?p:null;
}
/* Les réglages s'appliquent à la carte qui vient d'arriver : les couches se
   désignent par leur nom, le seul repère qui survive d'un fichier à l'autre. */
function prefAppliquer(){
  const p=prefLire();
  if(!p)return;
  if(p.aff)for(const k in V.aff)if(k in p.aff)V.aff[k]=!!p.aff[k];
  V.vue.flip=!!p.flip;
  if(Array.isArray(p.cachees)){
    const cachees=new Set(p.cachees);
    for(const c of V.couches)if(cachees.has(c.nom))c.visible=false;
  }
  boutonsEtat();
}
/* Les valeurs d'empilage saisies faute de les trouver dans le fichier. Elles
   se relisent AVANT que le modèle ne soit dressé — c'est ltPreparer() qui s'en
   sert —, d'où un chargement à part de celui des réglages d'affichage. */
function prefSurcharges(){
  V.sur={cu:{},gap_t:{},gap_er:{}};
  const p=prefLire();
  if(!p||!p.sur||typeof p.sur!=="object")return;
  for(const quoi of ["cu","gap_t","gap_er"]){
    const t=p.sur[quoi];
    if(!t||typeof t!=="object")continue;
    for(const cle in t){
      const v=+t[cle];
      if(isFinite(v)&&v>0)V.sur[quoi][cle]=v;
    }
  }
}
function boutonsEtat(){
  const bt=function(id,on){
    const b=document.getElementById(id);
    if(b)b.classList.toggle("on",!!on);
  };
  bt("bRefs",V.aff.refs); bt("bTrous",V.aff.trous); bt("bPlans",V.aff.plans);
  bt("bFlip",V.vue.flip);
  const t=document.getElementById("bFlipTxt");
  if(t)t.textContent=V.vue.flip?"Dessus":"Dessous";
}

/* ==========================================================================
   Ouverture
   ========================================================================== */
function attente(on,titre,detail){
  const el=document.getElementById("attente");
  if(!el)return;
  el.hidden=!on;
  if(titre)document.getElementById("attenteTitre").textContent=titre;
  document.getElementById("attenteDetail").textContent=detail||"";
}
function erreur(msg){
  const el=document.getElementById("depotErr");
  if(el)el.textContent=msg||"";
  if(!msg)return;
  /* L'écran d'accueil s'efface dès qu'une carte est ouverte : le message
     n'aurait alors personne pour le lire. Il passe par le pied de page, où la
     première ligne suffit à dire ce qui a manqué. */
  hint(V.modele?("Échec : "+String(msg).split(/\r?\n/)[0]):"Échec de l'ouverture.");
}

async function charger(fichier){
  if(!fichier)return;
  erreur("");
  /* Le fichier est envoyé au serveur et parsé là-bas : quelques secondes sur
     une carte de fabrication, et un écran muet passerait pour un plantage. */
  attente(true,"Lecture de "+fichier.name+"…",
          /\.json$/i.test(fichier.name)
            ? "relecture d'un modèle déjà traduit"
            : "le parseur Python travaille sur le serveur");
  hint("Lecture de "+fichier.name+"…");
  try{
    const modele=await apiCharger(fichier);
    poser(modele,fichier.name);
    let dit="« "+V.fichier+" » ouvert : "+mdlEntier(modele.stats.composants)
      +" composant(s), "+mdlEntier(modele.stats.pistes)+" piste(s).";
    /* Ce qui manque à l'empilage se dit ici, à l'ouverture : c'est le moment
       où l'on peut encore le compléter avant de lire une impédance en croyant
       qu'elle vient du fichier. Le panneau « La carte » porte les cases. */
    const man=ltManques();
    if(man.total||man.aucunPlan)
      dit+=" Empilage incomplet ("+(man.total||"aucun plan de référence")
        +(man.total?" valeur(s) absente(s)":"")
        +") : complétez-le dans « La carte » pour l'impédance.";
    hint(dit);
    if(typeof profNoterDocument==="function")profNoterDocument(PREF,fichier.name);
  }catch(e){
    erreur(e.message||String(e));
    document.getElementById("accueil").hidden=!!V.modele;
  }finally{
    attente(false);
  }
}

/* Ce que fait un modèle une fois arrivé : il devient la carte affichée. Le
   même chemin sert à l'ouverture d'un fichier et à la reprise de session. */
function poser(modele,nom,vue){
  /* Les valeurs d'empilage saisies d'abord : mdlCharger() dresse l'empilage de
     calcul en s'en servant. */
  prefSurcharges();
  mdlCharger(modele,nom);
  prefAppliquer();
  pnlTout();
  document.getElementById("accueil").hidden=true;
  if(vue&&vue.scale>0){ V.vue.scale=vue.scale; V.vue.ox=vue.ox; V.vue.oy=vue.oy;
                        V.vue.flip=!!vue.flip; boutonsEtat(); dessiner(); }
  else fit();
}

/* ==========================================================================
   Exports
   ========================================================================== */
function telecharger(blob,nom){
  const url=URL.createObjectURL(blob);
  const a=document.createElement("a");
  a.href=url; a.download=nom;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(function(){URL.revokeObjectURL(url);},4000);
}
function nomBase(){
  return (V.fichier||"carte").replace(/\.[^.]+$/,"")||"carte";
}
/* Le modèle traduit, tel qu'il est arrivé du serveur. Les champs calculés à
   l'affichage (boîtes de composants, boîtes de pistes) sont retirés : ils se
   recalculent en une passe, et les garder doublerait le fichier. */
function exportJson(){
  if(!V.modele)return;
  const texte=JSON.stringify(V.modele,function(cle,valeur){
    return (cle==="boite"||cle==="_b")?undefined:valeur;
  });
  telecharger(new Blob([texte],{type:"application/json"}),nomBase()+".json");
  hint("Modèle exporté : il se rouvre ici sans serveur.");
}
function exportPng(){
  if(!V.modele)return;
  const k=2, W=cv.clientWidth, H=cv.clientHeight;
  const o=document.createElement("canvas");
  o.width=Math.round(W*k); o.height=Math.round(H*k);
  peindre(o.getContext("2d"),k,o.width,o.height);
  o.toBlob(function(b){
    if(b)telecharger(b,nomBase()+".png");
    hint("Image exportée.");
  },"image/png");
}

/* ==========================================================================
   Câblage
   ========================================================================== */
(function(){
  const champ=document.getElementById("fichier");
  const ouvrir=function(){ champ.click(); };
  document.getElementById("bOuvrir").onclick=ouvrir;
  document.getElementById("bOuvrir2").onclick=ouvrir;
  /* La zone de dépôt entière ouvre le sélecteur : elle dit « cliquez pour le
     choisir », et viser le bouton n'est pas ce qu'on lit. */
  document.getElementById("depot").onclick=function(e){
    if(e.target.tagName!=="BUTTON")ouvrir();
  };
  champ.addEventListener("change",function(){
    if(champ.files&&champ.files[0])charger(champ.files[0]);
    champ.value="";                       // rouvrir le même fichier reste possible
  });

  /* Glisser-déposer sur toute la page : viser une zone de dépôt qu'on ne voit
     plus une fois la carte ouverte n'aurait pas de sens. */
  const depot=document.getElementById("depot");
  const survol=function(on){ if(depot)depot.classList.toggle("survol",on); };
  document.addEventListener("dragover",function(e){
    e.preventDefault(); e.dataTransfer.dropEffect="copy"; survol(true);
  });
  document.addEventListener("dragleave",function(e){
    if(e.relatedTarget===null)survol(false);
  });
  document.addEventListener("drop",function(e){
    e.preventDefault(); survol(false);
    const f=e.dataTransfer&&e.dataTransfer.files&&e.dataTransfer.files[0];
    if(f)charger(f);
  });

  document.getElementById("bJson").onclick=exportJson;
  document.getElementById("bPng").onclick=exportPng;
  document.getElementById("bFit").onclick=fit;
  document.getElementById("bFlip").onclick=basculerFace;
  document.getElementById("bRefs").onclick=function(){basculer("refs","bRefs");};
  document.getElementById("bTrous").onclick=function(){basculer("trous","bTrous");};
  document.getElementById("bPlans").onclick=function(){basculer("plans","bPlans");};

  document.getElementById("bCchTout").onclick=function(){pnlCouchesToutes(true);};
  document.getElementById("bCchRien").onclick=function(){pnlCouchesToutes(false);};
  document.getElementById("bCchCuivre").onclick=function(){pnlCouchesToutes(false,true);};
  document.getElementById("filtreNets").addEventListener("input",pnlNets);
  document.getElementById("filtreComps").addEventListener("input",pnlComps);
  document.getElementById("bNetRien").onclick=choisirRien;

  window.addEventListener("resize",resize);
})();

/* ==========================================================================
   Démarrage
   ========================================================================== */
(function(){
  boutonsEtat();
  pnlTout();
  resize();

  /* Le travail suit d'un outil à l'autre (commun/session.js). Une carte
     traduite pèse parfois plus que ne tient sessionStorage : on ne met de côté
     que ce qui passe, et on le dit plutôt que de faire semblant. */
  const repris=(typeof sessBrancher==="function")?sessBrancher(PREF,function(){
    if(!V.modele)return null;
    const etat={modele:V.modele,fichier:V.fichier,
                vue:{scale:V.vue.scale,ox:V.vue.ox,oy:V.vue.oy,flip:V.vue.flip}};
    return (typeof sessTient!=="function"||sessTient(etat))?etat:null;
  }):null;

  if(repris&&repris.etat&&repris.etat.modele){
    try{
      poser(repris.etat.modele,repris.etat.fichier,repris.etat.vue);
      hint("Carte reprise : « "+V.fichier+" ».");
    }catch(e){
      hint("La carte mise de côté n'a pas pu être relue : "+e.message);
    }
  }else{
    hint("Ouvrez un fichier IPC-2581 pour commencer.");
    /* Sonder le serveur tout de suite : mieux vaut apprendre qu'il manque
       avant d'avoir choisi un fichier de quarante mégaoctets. */
    if(typeof apiConnecter==="function")
      apiConnecter().catch(function(e){ erreur(e.message); });
  }

  /* Changer d'utilisateur change les réglages d'affichage, pas la carte. */
  if(typeof profSurChangement==="function")
    profSurChangement(function(){
      if(!V.modele)return;
      for(const c of V.couches)c.visible=true;
      prefAppliquer(); pnlCouches(); dessiner();
    });
})();
