"use strict";
/* =============================================================================
   recherche-composants — 03-formulaire.js
   Construit le formulaire d'un outil en croisant le catalogue français
   (02-outils.js) et le schéma d'arguments renvoyé par la passerelle. Le
   catalogue donne l'ordre et les libellés ; le schéma fait autorité sur ce qui
   existe réellement et sur les valeurs par défaut.
   ============================================================================= */

/* ---------- utilitaires d'affichage, partagés par les modules suivants ------ */
function esc(s){
  return String(s).replace(/[&<>"'`]/g,ch=>
    ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;","`":"&#96;"}[ch]));
}
function fmtEntier(n){
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g," ");
}
function fmtPrix(n){
  if(typeof n!=="number")return String(n);
  return "$"+(n<1?n.toFixed(4):n.toFixed(3));
}
function estVide(v){
  return v===null||v===undefined||v===""||(Array.isArray(v)&&!v.length);
}

let OUTIL_COURANT=null;
let AVANCES_OUVERTS=false;     // état du repli « filtres avancés »

/* Champs relégués derrière « Filtres avancés » : réglages fins, pagination,
   identifiants internes. Tout paramètre absent du catalogue les rejoint. */
const CHAMPS_AVANCES=["limit","min_stock","page","sort_by","prefer_no_fee",
  "match_all_terms","spec_filters","packages","manufacturers","library_type",
  "include_bom","include_nets","uuid","part_id","subcategory_id","category_id",
  "has_easyeda_footprint","same_package"];

/* ---------- lecture du schéma ---------- */
function schemaProps(nom){
  const s=API_SCHEMAS[nom];
  return (s&&s.inputSchema&&s.inputSchema.properties)||{};
}
function schemaRequis(nom){
  const s=API_SCHEMAS[nom];
  return (s&&s.inputSchema&&s.inputSchema.required)||[];
}
/* type d'un paramètre : le schéma décrit les optionnels en anyOf[type, null] */
function schemaType(p){
  let types=[];
  if(p.type)types=[p.type];
  else if(Array.isArray(p.anyOf))types=p.anyOf.map(x=>x.type).filter(Boolean);
  if(types.indexOf("boolean")>=0)return "case";
  if(types.indexOf("array")>=0)return "liste";
  if(types.indexOf("integer")>=0||types.indexOf("number")>=0)return "nombre";
  return "texte";
}
/* première phrase de la description du serveur, pour l'aide sous le champ */
function schemaAide(p){
  const d=(p&&p.description||"").split("\n")[0].trim();
  return d.length>120?d.slice(0,117)+"…":d;
}

/* Champs à afficher : ceux du catalogue d'abord, puis tout paramètre du
   serveur qui n'y figure pas — l'interface ne peut donc pas devenir muette
   si pcbparts.dev enrichit un outil. */
function champsDe(nom){
  const cat=OUTILS[nom]||{}, props=schemaProps(nom), requis=schemaRequis(nom);
  const connus=Object.keys(props).length>0, out=[], vus={};
  for(const c of (cat.champs||[])){
    if(connus&&!props[c.cle])continue;          // paramètre retiré côté serveur
    vus[c.cle]=1;
    const p=props[c.cle]||{};
    out.push(Object.assign({aide:schemaAide(p)},c,{
      requis:requis.indexOf(c.cle)>=0,
      defaut:p.default
    }));
  }
  for(const k in props){
    if(vus[k])continue;
    out.push({cle:k,lib:k,t:schemaType(props[k]),aide:schemaAide(props[k]),
              requis:requis.indexOf(k)>=0,defaut:props[k].default,large:false,
              avance:true});
  }
  return out;
}
function estAvance(c){
  if(c.requis)return false;             // un champ obligatoire reste visible
  return c.avance===true||CHAMPS_AVANCES.indexOf(c.cle)>=0;
}

/* ---------- construction ---------- */
function champHTML(c){
  const id="ch_"+c.cle;
  const lbl='<label for="'+id+'">'+esc(c.lib)+
            (c.requis?'<span class="req" title="obligatoire">*</span>':"")+'</label>';
  const aide=c.aide?'<span class="aide">'+esc(c.aide)+'</span>':"";
  let corps="";

  if(c.t==="case"){
    const coche=c.defaut===true?" checked":"";
    return '<div class="champ case" data-cle="'+esc(c.cle)+'" data-type="case">'+
           '<input type="checkbox" id="'+id+'"'+coche+'>'+lbl+'</div>';
  }
  if(c.t==="choix"||c.t==="trois"){
    const choix=c.t==="trois"
      ?[["","(indifférent)"],["oui","Oui"],["non","Non"]]
      :(c.choix||[["",""]]);
    let opts="";
    for(const o of choix){
      const sel=(c.defaut!==undefined&&String(c.defaut)===o[0])?" selected":"";
      opts+='<option value="'+esc(o[0])+'"'+sel+'>'+esc(o[1])+'</option>';
    }
    corps='<select id="'+id+'">'+opts+'</select>';
  }else if(c.t==="nombre"){
    const v=(typeof c.defaut==="number")?String(c.defaut):"";
    corps='<input type="number" id="'+id+'" value="'+esc(v)+'"'+
          (c.ph?' placeholder="'+esc(c.ph)+'"':"")+'>';
  }else if(c.t==="json"){
    corps='<textarea id="'+id+'" spellcheck="false"'+
          (c.ph?' placeholder="'+esc(c.ph)+'"':"")+'></textarea>';
  }else{
    const v=(typeof c.defaut==="string")?c.defaut:"";
    corps='<input type="text" id="'+id+'" value="'+esc(v)+'"'+
          (c.ph?' placeholder="'+esc(c.ph)+'"':"")+' autocomplete="off" spellcheck="false">';
  }
  return '<div class="champ'+(c.large?" large":"")+'" data-cle="'+esc(c.cle)+
         '" data-type="'+esc(c.t)+'">'+lbl+corps+aide+'</div>';
}

function construireFormulaire(nom){
  OUTIL_COURANT=nom;
  const cat=OUTILS[nom]||{}, s=API_SCHEMAS[nom]||{};
  document.getElementById("formTitre").textContent=cat.titre||nom;
  document.getElementById("formResume").textContent=
    cat.resume||(s.description||"").split("\n")[0]||"";
  document.getElementById("formErr").textContent="";
  document.getElementById("fTool").textContent=nom;

  const zone=document.getElementById("formChamps");
  const tous=champsDe(nom);
  const principaux=tous.filter(c=>!estAvance(c)), avances=tous.filter(estAvance);
  let h='<div class="champs">'+principaux.map(champHTML).join("")+"</div>";
  if(avances.length){
    h+='<div class="plus"><button type="button" class="tb mini" id="bPlus">'+
       (AVANCES_OUVERTS?"Filtres avancés ▴":"Filtres avancés ▾")+
       " ("+avances.length+")</button></div>"+
       '<div class="champs avances"'+(AVANCES_OUVERTS?"":" hidden")+'>'+
       avances.map(champHTML).join("")+"</div>";
  }
  zone.innerHTML=h;
  const plus=document.getElementById("bPlus");
  if(plus)plus.onclick=function(){
    AVANCES_OUVERTS=!AVANCES_OUVERTS;
    zone.querySelector(".champs.avances").hidden=!AVANCES_OUVERTS;
    plus.textContent=(AVANCES_OUVERTS?"Filtres avancés ▴":"Filtres avancés ▾")+
                     " ("+avances.length+")";
  };
  zone.querySelectorAll("input,textarea").forEach(function(el){
    el.addEventListener("keydown",function(ev){
      if(ev.key==="Enter"&&el.tagName!=="TEXTAREA"){ev.preventDefault();lancer();}
    });
  });

  document.querySelectorAll("#listeOutils .outil").forEach(function(b){
    b.classList.toggle("on",b.dataset.outil===nom);
  });
  const premier=zone.querySelector('input[type=text],input[type=number],textarea');
  if(premier)premier.focus();
}

/* ---------- lecture ---------- */
function lireFormulaire(){
  const args={}, manquants=[];
  const champs=document.querySelectorAll("#formChamps .champ");
  for(const div of champs){
    const cle=div.dataset.cle, type=div.dataset.type;
    const el=div.querySelector("input,select,textarea");
    if(!el)continue;
    let v=null;
    if(type==="case"){
      v=el.checked;
    }else if(type==="trois"){
      v=el.value==="oui"?true:el.value==="non"?false:null;
    }else if(type==="liste"){
      v=el.value.split(",").map(s=>s.trim()).filter(Boolean);
    }else if(type==="nombre"){
      if(el.value.trim()===""){v=null;}
      else{
        v=Number(el.value);
        if(!isFinite(v))throw new Error("« "+cle+" » n'est pas un nombre.");
      }
    }else if(type==="json"){
      const brut=el.value.trim();
      if(!brut){v=null;}
      else{
        try{v=JSON.parse(brut);}
        catch(e){throw new Error("« "+cle+" » : JSON invalide — "+e.message);}
      }
    }else{
      v=el.value.trim();
    }
    if(estVide(v)){
      if(div.querySelector(".req"))manquants.push(cle);
      continue;
    }
    args[cle]=v;
  }
  if(manquants.length)
    throw new Error("Champ obligatoire à remplir : "+manquants.join(", ")+".");
  return args;
}

/* Remplit le formulaire d'un outil avec des valeurs données (enchaînements
   depuis le panneau Détail : « alternatives », « brochage », etc.). */
function remplirFormulaire(nom,valeurs){
  construireFormulaire(nom);
  for(const cle in valeurs){
    const div=document.querySelector('#formChamps .champ[data-cle="'+cle+'"]');
    if(!div)continue;
    const el=div.querySelector("input,select,textarea");
    if(!el)continue;
    const v=valeurs[cle];
    if(div.dataset.type==="case")el.checked=!!v;
    else if(Array.isArray(v))el.value=v.join(", ");
    else if(v&&typeof v==="object")el.value=JSON.stringify(v);
    else el.value=v===null||v===undefined?"":String(v);
    /* une valeur posée dans un filtre avancé doit rester visible */
    if(div.closest(".champs.avances")&&!AVANCES_OUVERTS){
      const plus=document.getElementById("bPlus");
      if(plus)plus.click();
    }
  }
}
