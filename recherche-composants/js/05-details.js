"use strict";
/* =============================================================================
   recherche-composants — 05-details.js
   Fiche d'un résultat : identité, actions d'enchaînement (équivalences,
   brochage, modèle CAO, recoupement distributeur), caractéristiques.

   Tout ce qui vient du serveur est échappé avant affichage, et seuls les liens
   en http(s) sont rendus cliquables : la réponse d'un service distant n'a pas à
   pouvoir injecter du balisage dans la page.
   ============================================================================= */

const CLES_IDENTITE=["model","name","mfr_part_number","mpn","part_number",
                     "product_number","slug","lcsc","title"];
const CLES_LIENS={
  datasheet:"Fiche technique",
  datasheet_url:"Fiche technique",
  lcsc_url:"Page LCSC",
  source_url:"Dépôt source",
  image_url:"Image",
  product_url:"Page produit",
  url:"Lien"
};

function urlSure(v){
  return typeof v==="string"&&/^https?:\/\//i.test(v);
}
function titreDe(o){
  for(const k of CLES_IDENTITE)if(typeof o[k]==="string"&&o[k])return o[k];
  return "Détail";
}
function bouton(libelle,outil,args,titre){
  return '<button class="tb mini" data-act-outil="'+esc(outil)+
         '" data-act-args="'+esc(JSON.stringify(args))+'"'+
         (titre?' title="'+esc(titre)+'"':"")+">"+esc(libelle)+"</button>";
}

/* ---------- actions proposées selon les champs présents ---------- */
function actionsHTML(o){
  const b=[], ref=o.model||o.mfr_part_number||o.mpn||o.part_number||o.product_number;
  if(o.lcsc){
    b.push('<button class="tb mini" data-act-copie="'+esc(o.lcsc)+
           '" title="Copier le code LCSC">Copier '+esc(o.lcsc)+"</button>");
    b.push(bouton("Fiche complète","jlc_get_part",{lcsc:o.lcsc}));
    b.push(bouton("Équivalences","jlc_find_alternatives",{lcsc:o.lcsc}));
    b.push(bouton("Brochage","jlc_get_pinout",{lcsc:o.lcsc}));
  }
  if(ref){
    b.push(bouton("Modèle CAO","cse_search",{query:ref}));
    b.push(bouton("Symbole KiCad","cse_get_kicad",{query:ref}));
    b.push(bouton("Mouser","mouser_get_part",{part_number:ref},"Quota journalier"));
    b.push(bouton("DigiKey","digikey_get_part",{product_number:ref},"Quota journalier"));
    b.push(bouton("Cartes utilisant ce circuit","board_search",{component:ref}));
  }
  if(o.slug)b.push(bouton("Contenu de la carte","board_get",{slug:o.slug}));
  if(o.cse_part_id)b.push(bouton("Symbole KiCad","cse_get_kicad",{part_id:o.cse_part_id}));
  if(o.id&&o.subcategory_count)
    b.push(bouton("Sous-catégories","jlc_search_help",{category:String(o.name||o.id)}));
  for(const cle in CLES_LIENS){
    if(urlSure(o[cle]))
      b.push('<a class="tb mini" href="'+esc(o[cle])+'" target="_blank" rel="noopener">'+
             esc(CLES_LIENS[cle])+" ↗</a>");
  }
  return b.length?'<div class="det-actions">'+b.join("")+"</div>":"";
}

/* ---------- tableaux clé / valeur ---------- */
function lignesDet(obj){
  let h="";
  for(const k in obj){
    const v=obj[k];
    if(v===null||v===undefined||v==="")continue;
    let aff;
    if(urlSure(v))aff='<a href="'+esc(v)+'" target="_blank" rel="noopener">'+esc(v)+"</a>";
    else if(typeof v==="number"&&/price/.test(k))aff=esc(fmtPrix(v));
    else if(typeof v==="number"&&/stock|count|qty/.test(k))aff=esc(fmtEntier(v));
    else aff=esc(valeurTexte(v));
    h+='<tr><td class="k">'+esc((COLONNES[k]||{}).lib||k)+'</td><td class="v">'+aff+"</td></tr>";
  }
  return h?'<table class="det">'+h+"</table>":"";
}

function ficheHTML(o){
  if(!o||typeof o!=="object")return '<div class="vide">'+esc(valeurTexte(o))+"</div>";
  const sous=[o.manufacturer,o.package,o.lcsc,o.org_display].filter(Boolean).join(" · ");
  let h='<div class="det-titre">'+esc(titreDe(o))+"</div>";
  if(sous)h+='<div class="det-sous">'+esc(sous)+"</div>";
  h+=actionsHTML(o);

  const simples={}, tables={}, textes={};
  for(const k in o){
    const v=o[k];
    if(typeof v==="string"&&v.length>320){textes[k]=v;continue;}
    if(v&&typeof v==="object"&&!Array.isArray(v)){tables[k]=v;continue;}
    if(Array.isArray(v)&&v.length&&typeof v[0]==="object"){tables[k]=v;continue;}
    simples[k]=v;
  }
  h+=lignesDet(simples);

  for(const k in tables){
    const v=tables[k];
    h+='<div class="det-sect">'+esc((COLONNES[k]||{}).lib||k)+"</div>";
    if(Array.isArray(v)){
      /* liste d'objets : on aligne les clés du premier élément */
      const cols=Object.keys(v[0]).slice(0,3);
      let t="";
      for(const l of v.slice(0,60)){
        t+='<tr><td class="k">'+esc(valeurTexte(l[cols[0]]))+'</td><td class="v">'+
           esc(cols.slice(1).map(c=>valeurTexte(l[c])).join(" · "))+"</td></tr>";
      }
      h+='<table class="det">'+t+"</table>";
      if(v.length>60)h+='<div class="det-sous">… '+(v.length-60)+" autres, voir la réponse brute</div>";
    }else{
      h+=lignesDet(v);
    }
  }
  for(const k in textes)
    h+='<div class="det-sect">'+esc((COLONNES[k]||{}).lib||k)+
       '</div><pre class="doc">'+esc(textes[k])+"</pre>";
  return h;
}

function afficherDetail(o){
  document.getElementById("details").innerHTML=ficheHTML(o);
}

/* Un clic sur un bouton d'enchaînement remplit le formulaire de l'outil visé
   et lance la requête : l'utilisateur voit ce qui a été demandé. */
function brancherActions(){
  document.addEventListener("click",function(ev){
    const copie=ev.target.closest("[data-act-copie]");
    if(copie){
      const t=copie.dataset.actCopie;
      if(navigator.clipboard&&navigator.clipboard.writeText)
        navigator.clipboard.writeText(t).then(function(){hint(t+" copié.");},
                                              function(){hint("Copie refusée par le navigateur.");});
      else hint("Copie indisponible : "+t);
      return;
    }
    const b=ev.target.closest("[data-act-outil]");
    if(!b)return;
    let args={};
    try{args=JSON.parse(b.dataset.actArgs||"{}");}catch(e){}
    remplirFormulaire(b.dataset.actOutil,args);
    lancer();
  });
}
