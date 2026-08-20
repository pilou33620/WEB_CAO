"use strict";
/* =============================================================================
   recherche-composants — 04-resultats.js
   Mise en page de la réponse d'un outil. Trois cas :
     - une liste d'objets  -> tableau cliquable (le cas courant) ;
     - un objet unique     -> fiche détaillée (jlc_get_part, board_get…) ;
     - un texte long       -> bloc préformaté (règles de conception, KiCad).
   Le JSON complet reste consultable dans le panneau « Réponse brute ».
   ============================================================================= */

let RESULTAT={outil:"",args:{},data:null,lignes:[],colonnes:[],index:-1};

/* ---------- repérage de la liste à afficher ---------- */
function trouverTableau(data){
  if(Array.isArray(data))return {cle:"",lignes:data};
  if(!data||typeof data!=="object")return null;
  const objets=function(v,mini){
    return Array.isArray(v)&&v.length>=mini&&
           v.every(x=>x&&typeof x==="object"&&!Array.isArray(x));
  };
  for(const cle of CLES_TABLEAU)if(objets(data[cle],1))return {cle:cle,lignes:data[cle]};
  /* clé inconnue : on exige au moins deux éléments, pour ne pas prendre un
     accessoire (les paliers de prix d'une fiche, par exemple) pour la réponse */
  for(const cle in data)if(objets(data[cle],2))return {cle:cle,lignes:data[cle]};
  return null;
}

/* colonnes : celles du catalogue si elles existent, sinon les clés scalaires */
function colonnesDe(nom,lignes){
  const cat=OUTILS[nom]||{}, presentes={};
  for(const l of lignes.slice(0,20))for(const k in l)presentes[k]=1;
  if(cat.colonnes){
    const gardees=cat.colonnes.filter(k=>presentes[k]);
    if(gardees.length)return gardees;
  }
  const out=[];
  for(const k in presentes){
    const v=lignes[0][k];
    if(v&&typeof v==="object"&&!Array.isArray(v))continue;   // sous-objet : au détail
    out.push(k);
    if(out.length>=8)break;
  }
  return out;
}

/* ---------- mise en forme d'une valeur ---------- */
function valeurTexte(v){
  if(v===null||v===undefined||v==="")return "—";
  if(typeof v==="boolean")return v?"oui":"non";
  if(Array.isArray(v))return v.length?v.join(", "):"—";
  if(typeof v==="object")return JSON.stringify(v);
  return String(v);
}
function celluleHTML(cle,v){
  const def=COLONNES[cle]||{};
  let classe=def.classe||"", texte;
  if(def.fmt==="tag"&&typeof v==="string"){
    return '<td><span class="tag '+esc(v)+'">'+esc(v)+'</span></td>';
  }
  if(def.fmt==="oui"){
    return '<td class="'+(v?"":"dim")+'">'+(v?"✓":"—")+'</td>';
  }
  if(def.fmt==="entier"&&typeof v==="number")texte=fmtEntier(v);
  else if(def.fmt==="prix"&&typeof v==="number")texte=fmtPrix(v);
  else texte=valeurTexte(v);
  if(!classe&&typeof v==="number")classe="num";
  return '<td'+(classe?' class="'+classe+'"':"")+' title="'+esc(texte)+'">'+
         esc(texte)+'</td>';
}

/* ---------- bandeau de résumé ---------- */
function resumeHTML(data,lignes){
  const bouts=[];
  if(data&&typeof data==="object"&&!Array.isArray(data)){
    if(typeof data.total==="number")
      bouts.push("Total <b>"+fmtEntier(data.total)+"</b>");
    for(const cle of ["query","topic","slug"])
      if(typeof data[cle]==="string"&&data[cle])
        bouts.push(esc(cle)+" <b>"+esc(data[cle])+"</b>");
  }
  bouts.push("Affichés <b>"+lignes.length+"</b>");
  bouts.push("Clic sur une ligne pour le détail");
  return '<div class="resume">'+bouts.join("<span>·</span>")+"</div>";
}

/* ---------- textes longs (règles de conception, exports KiCad) ---------- */
function blocsTexte(data){
  if(!data||typeof data!=="object"||Array.isArray(data))return "";
  let h="";
  for(const cle in data){
    const v=data[cle];
    if(typeof v==="string"&&v.length>320)
      h+='<div class="det-sect">'+esc((COLONNES[cle]||{}).lib||cle)+
         '</div><pre class="doc">'+esc(v)+"</pre>";
  }
  return h;
}

/* ---------- affichage principal ---------- */
function afficherResultat(nom,args,data){
  RESULTAT={outil:nom,args:args||{},data:data,lignes:[],colonnes:[],index:-1};
  const zone=document.getElementById("resultats");
  document.getElementById("brut").innerHTML=
    "<pre>"+esc(JSON.stringify(data,null,1))+"</pre>";

  if(data&&typeof data==="object"&&typeof data._message==="string"){
    zone.innerHTML='<div class="vide"><b>Le serveur a répondu par un message :</b><br>'+
                   esc(data._message)+"</div>";
    document.getElementById("fCount").textContent="0";
    return;
  }

  /* enregistrement unique annoncé par le catalogue : fiche, pas tableau */
  const fiche=(OUTILS[nom]||{}).fiche&&data&&typeof data==="object"&&!Array.isArray(data);

  const tbl=fiche?null:trouverTableau(data);
  if(tbl&&tbl.lignes.length){
    const cols=colonnesDe(nom,tbl.lignes);
    RESULTAT.lignes=tbl.lignes;RESULTAT.colonnes=cols;
    let h=resumeHTML(data,tbl.lignes)+'<table class="res"><thead><tr>';
    for(const c of cols)h+="<th>"+esc((COLONNES[c]||{}).lib||c)+"</th>";
    h+="</tr></thead><tbody>";
    tbl.lignes.forEach(function(l,i){
      h+='<tr data-i="'+i+'">';
      for(const c of cols)h+=celluleHTML(c,l[c]);
      h+="</tr>";
    });
    h+="</tbody></table>"+blocsTexte(data);
    zone.innerHTML=h;
    zone.querySelectorAll("tbody tr").forEach(function(tr){
      tr.onclick=function(){choisirLigne(Number(tr.dataset.i));};
    });
    document.getElementById("fCount").textContent=String(tbl.lignes.length);
    choisirLigne(0,true);
    return;
  }

  if(data&&typeof data==="object"&&Object.keys(data).length){
    RESULTAT.lignes=[data];
    zone.innerHTML='<div class="fiche">'+ficheHTML(data)+"</div>";
    afficherDetail(data);
    document.getElementById("fCount").textContent="1";
    return;
  }

  zone.innerHTML='<div class="vide">Aucun résultat. Élargissez la recherche : '+
                 "moins de filtres, un stock minimum plus bas, ou un autre boîtier.</div>";
  document.getElementById("fCount").textContent="0";
}

function choisirLigne(i,discret){
  const zone=document.getElementById("resultats");
  zone.querySelectorAll("tbody tr").forEach(function(tr){
    tr.classList.toggle("on",Number(tr.dataset.i)===i);
  });
  RESULTAT.index=i;
  const l=RESULTAT.lignes[i];
  if(l)afficherDetail(l);
  if(!discret&&l&&l.lcsc)hint("Composant "+l.lcsc+" sélectionné.");
}

/* ---------- exports ---------- */
function telecharger(nomFichier,texte,mime){
  const blob=new Blob([texte],{type:mime+";charset=utf-8"});
  const a=document.createElement("a");
  a.href=URL.createObjectURL(blob);
  a.download=nomFichier;
  document.body.appendChild(a);a.click();a.remove();
  setTimeout(function(){URL.revokeObjectURL(a.href);},1000);
}
function horodatage(){
  const d=new Date(), p=n=>String(n).padStart(2,"0");
  return d.getFullYear()+p(d.getMonth()+1)+p(d.getDate())+"-"+p(d.getHours())+p(d.getMinutes());
}
/* CSV à séparateur point-virgule, comme LIB_composants.csv */
function exportCsv(){
  if(!RESULTAT.lignes.length){hint("Rien à exporter.");return;}
  const cols=RESULTAT.colonnes.length?RESULTAT.colonnes:Object.keys(RESULTAT.lignes[0]);
  const cell=function(v){
    const t=valeurTexte(v).replace(/"/g,'""');
    return /[";\r\n]/.test(t)?'"'+t+'"':t;
  };
  const lignes=[cols.map(c=>cell((COLONNES[c]||{}).lib||c)).join(";")];
  for(const l of RESULTAT.lignes)lignes.push(cols.map(c=>cell(l[c])).join(";"));
  telecharger(RESULTAT.outil+"-"+horodatage()+".csv","﻿"+lignes.join("\r\n"),"text/csv");
  hint(RESULTAT.lignes.length+" ligne(s) exportée(s) en CSV.");
}
function exportJson(){
  if(RESULTAT.data===null){hint("Rien à exporter.");return;}
  telecharger(RESULTAT.outil+"-"+horodatage()+".json",
              JSON.stringify(RESULTAT.data,null,2),"application/json");
  hint("Réponse complète exportée en JSON.");
}
