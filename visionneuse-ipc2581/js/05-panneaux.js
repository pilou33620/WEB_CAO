"use strict";
/* =============================================================================
   visionneuse IPC-2581 — 05-panneaux.js
   Les cinq panneaux : couches, carte, nets, composants, sélection. Ils lisent
   l'état (V) et n'écrivent que par les trois fonctions de sélection de
   04-interaction.js — de sorte qu'un clic dans une liste et un clic sur le
   canevas mènent exactement au même endroit.
   ============================================================================= */

/* Les longues listes sont coupées : au-delà, on ne lit plus, on cherche — et
   le champ de filtre est juste au-dessus. */
const PNL_MAX=400;

function $(id){ return document.getElementById(id); }

/* ==========================================================================
   Couches
   ========================================================================== */
function pnlCouches(){
  const box=$("listeCouches");
  if(!V.modele){box.innerHTML="";return;}
  const ligne=function(c){
    return '<button class="cch '+(c.visible?"on":"off")+'" data-couche="'+c.i+'">'
      +'<span class="pastille" style="background:'+c.couleur+'"></span>'
      +'<span class="nom" title="'+mdlEsc(c.nom)+' — '+mdlEsc(c.genre)+'">'
      +mdlEsc(c.nom)+'</span>'
      +'<span class="cpt">'+mdlEntier(c.cpt)+'</span></button>';
  };
  const cu=V.couches.filter(c=>c.cuivre).sort((a,b)=>a.seq-b.seq);
  const tech=V.couches.filter(c=>!c.cuivre);
  let h="";
  if(cu.length)h+='<div class="grp">Cuivre</div>'+cu.map(ligne).join("");
  if(tech.length)h+='<div class="grp">Techniques</div>'+tech.map(ligne).join("");
  if(!h)h='<div class="rien">Ce fichier ne déclare aucune couche.</div>';
  box.innerHTML=h;
  box.querySelectorAll("[data-couche]").forEach(function(b){
    b.onclick=function(){
      const c=V.couches[+b.dataset.couche];
      if(!c)return;
      c.visible=!c.visible;
      prefEcrire(); pnlCouches(); dessiner();
    };
  });
}
/* Les natures d'objet, et le nom sous lequel on les reconnaît. L'ordre est
   celui du dessin : du fond vers le dessus. */
const ELEMENTS=[
  ["contour","Contour","Le profil de la carte et son substrat"],
  ["plans","Plans","Les zones de cuivre remplies"],
  ["pistes","Pistes","Les pistes et les arcs"],
  ["pads","Pastilles","Les pastilles des composants et les vias"],
  ["trous","Perçages","Les trous, métallisés ou non"],
  ["textes","Textes","Les textes du fichier (sérigraphie, repères)"],
  ["composants","Boîtiers","Le cadre de chaque composant"],
  ["refs","Repères","Le repère écrit dans le cadre du composant"]
];
function pnlElements(){
  const box=$("barElements");
  if(!box)return;
  box.innerHTML=ELEMENTS.map(function(e){
    return '<button class="tb mini'+(V.aff[e[0]]?" on":"")+'" data-aff="'+e[0]
      +'" title="'+mdlEsc(e[2])+'">'+e[1]+"</button>";
  }).join("");
  box.querySelectorAll("[data-aff]").forEach(function(b){
    b.onclick=function(){ basculer(b.dataset.aff,BOUTON_AFF[b.dataset.aff]); };
  });
}
/* Trois de ces réglages ont aussi leur bouton dans l'entête, avec un raccourci
   clavier : c'est le même état, il faut donc que le même geste rafraîchisse
   les deux. */
const BOUTON_AFF={refs:"bRefs",trous:"bTrous",plans:"bPlans"};

function pnlCouchesToutes(valeur,cuivreSeul){
  for(const c of V.couches)
    c.visible=cuivreSeul?c.cuivre:valeur;
  prefEcrire(); pnlCouches(); dessiner();
}

/* ==========================================================================
   La carte
   ========================================================================== */
function pnlInfos(){
  const box=$("infos");
  if(!V.modele){
    box.innerHTML='<div class="rien">Aucune carte ouverte.</div>';
    return;
  }
  const m=V.modele, s=m.stats, b=V.bbox;
  const l=function(a,v){return "<tr><td>"+a+"</td><td>"+v+"</td></tr>";};
  let h='<div class="fiche"><h3>Fichier</h3><table>'
    +l("Nom",'<span class="val">'+mdlEsc(V.fichier)+"</span>")
    +l("Unités",m.unites||"—")
    +l("Dimensions",mdlNb(b.x2-b.x1)+" × "+mdlNb(b.y2-b.y1)+" "+V.unite)
    +l("Épaisseur",m.epaisseur?mdlMes(m.epaisseur):"—")
    +l("Origine",mdlNb(b.x1)+" ; "+mdlNb(b.y1))
    +"</table>";

  h+="<h3>Contenu</h3><table>"
    +l("Composants",mdlEntier(s.composants))
    +l("Nets",mdlEntier(s.nets))
    +l("Pistes",mdlEntier(s.pistes)+(s.arcs?" + "+mdlEntier(s.arcs)+" arc(s)":""))
    +l("Longueur de cuivre",mdlMes(s.longueur_cuivre,1))
    +l("Plans de cuivre",mdlEntier(s.plans))
    +l("Pastilles",mdlEntier(V.couches.reduce((n,c)=>n+c.pads.length,0)))
    +l("Perçages",mdlEntier(s.percages)+" ("+mdlEntier(s.percages_metallises)+" métallisés)")
    +l("Textes",mdlEntier(s.textes))
    +"</table>";

  if(m.empilage.length){
    h+="<h3>Empilage</h3>";
    const ep=m.empilage.map(e=>e.ep||0);
    const maxi=Math.max.apply(null,ep.concat([0.001]));
    h+='<div class="pile">';
    for(const e of m.empilage){
      const c=V.couches[mdlCoucheDe(e.nom)];
      const haut=Math.max(4,Math.round(4+16*(e.ep||0)/maxi));
      const det=[e.ep?mdlMes(e.ep):"",e.mat,e.dk?"Dk "+e.dk:"",e.df?"Df "+e.df:""]
                  .filter(Boolean).join(" · ");
      h+='<div class="lit"><span class="bande" style="height:'+haut+'px;background:'
        +((c&&c.couleur)||"#4a4f57")+'"></span>'
        +"<b>"+mdlEsc(e.nom)+"</b> <span>"+mdlEsc(det)+"</span></div>";
    }
    h+="</div>";
  }
  h+=pnlEmpilageForm();
  h+="</div>";
  box.innerHTML=h;
  pnlEmpilageCabler(box);
}

/* ==========================================================================
   L'empilage que le calcul utilise, et qu'on peut compléter
   Un fichier IPC-2581 renseigne rarement tout : la permittivité vit dans une
   <Spec> que tous les outils n'écrivent pas, et certains empilages ne listent
   que leurs conducteurs. Plutôt que de supposer en silence, on montre ce qui
   manque là où ça se corrige, et une valeur saisie vaut aussitôt pour toutes
   les pistes de la couche.
   ========================================================================== */
/* Le champ d'une valeur : ce qu'il vaut, d'où ça vient, et ce qui serait pris
   s'il restait vide. */
function pnlChamp(quoi,cle,valeur,src,defaut){
  const vide=!src;
  /* Un champ texte, et non « number » : la virgule est la décimale d'ici, et
     un champ numérique la refuse dès que le navigateur n'est pas en français.
     La lecture, elle, accepte les deux. */
  return '<input type="text" inputmode="decimal" spellcheck="false"'
    +' class="ltv'+(vide?" manque":(src==="saisi"?" saisi":""))+'"'
    +' data-lt="'+quoi+'" data-cle="'+mdlEsc(cle)+'"'
    +(vide?'' : ' value="'+mdlNb(valeur,4)+'"')
    +' placeholder="'+mdlNb(defaut,4)+'"'
    +' title="'+(vide?"Absent du fichier : "+mdlNb(defaut,4)+" est pris par défaut."
                    :(src==="saisi"?"Valeur saisie ici. Videz le champ pour "
                      +"revenir à celle du fichier.":"Valeur lue dans le fichier."))
    +'">';
}
function pnlEmpilageForm(){
  if(!LT.pret)
    return "<h3>Empilage du calcul</h3>"
      +'<div class="note">Ce fichier ne décrit aucune couche de cuivre dans '
      +"son empilage : il n'y a pas de ligne de transmission à calculer.</div>";
  const man=ltManques();
  let h="<h3>Empilage du calcul</h3>"
    +'<table class="pileForm">';
  for(let i=0;i<LT.cu.length;i++){
    const e=LT.cu[i], c=V.couches[e.couche];
    h+='<tr class="cu"><td class="g">'
      +'<span class="pastille" style="background:'+((c&&c.couleur)||"#4a4f57")+'"></span>'
      +mdlEsc(e.nom)+(e.plan?' <em>plan</em>':"")+"</td>"
      +'<td>'+pnlChamp("cu",e.nom,e.ep,e.epSrc,LT_EP_CU)+" mm</td></tr>";
    const g=LT.gap[i];
    if(g)
      h+='<tr class="gap"><td class="g">↕ diélectrique</td><td>'
        +pnlChamp("gap_t",g.cle,g.t,g.tSrc,0.1)+" mm &nbsp; εr "
        +pnlChamp("gap_er",g.cle,g.er,g.erSrc,LT_ER)+"</td></tr>";
  }
  h+="</table>";
  if(man.total||man.aucunPlan){
    const dit=[];
    if(man.epaisseur.length)dit.push(man.epaisseur.length
      +" épaisseur(s) de diélectrique absente(s)");
    if(man.er.length)dit.push(man.er.length+" permittivité(s) absente(s)");
    if(man.ep.length)dit.push(man.ep.length+" épaisseur(s) de cuivre absente(s)");
    if(man.aucunPlan)dit.push("aucun plan de référence reconnu");
    h+='<div class="note attention">Le fichier ne dit pas tout : '
      +mdlEsc(dit.join(", "))+".<br>Les cases jaunes prennent la valeur grisée "
      +"tant qu'elles restent vides. Ce que vous y écrivez sert au calcul "
      +"d'impédance et vous suit d'une ouverture à l'autre.</div>";
  }
  if(pnlSurcharges())
    h+='<div class="note"><span class="lien" id="ltRaz">Oublier les valeurs '
      +"que j'ai saisies</span> et revenir à ce que dit le fichier.</div>";
  return h;
}
function pnlSurcharges(){
  let n=0;
  for(const q of ["cu","gap_t","gap_er"])
    n+=Object.keys((V.sur&&V.sur[q])||{}).length;
  return n;
}
function pnlEmpilageCabler(box){
  box.querySelectorAll("input[data-lt]").forEach(function(inp){
    inp.onchange=function(){
      /* Un champ vidé n'est pas un zéro : c'est le retour à ce que dit le
         fichier, ou au défaut s'il ne dit rien. */
      const v=parseFloat(String(inp.value).replace(",","."));
      ltSurcharger(inp.dataset.lt,inp.dataset.cle,
                   (isFinite(v)&&v>0)?v:null);
    };
  });
  const raz=$("ltRaz");
  if(raz)raz.onclick=function(){
    V.sur={cu:{},gap_t:{},gap_er:{}};
    ltPreparer(); prefEcrire(); pnlInfos(); pnlDetail(); dessiner();
    hint("Empilage revenu à ce que dit le fichier.");
  };
}
function ltSurcharger(quoi,cle,valeur){
  if(!V.sur[quoi])V.sur[quoi]={};
  if(valeur==null)delete V.sur[quoi][cle];
  else V.sur[quoi][cle]=valeur;
  /* L'empilage change, donc l'impédance de toutes les pistes : on refait la
     table et on rafraîchit la fiche ouverte. */
  ltPreparer(); prefEcrire(); pnlInfos(); pnlDetail(); dessiner();
}

/* ==========================================================================
   Nets
   ========================================================================== */
function pnlNets(){
  const box=$("listeNets");
  if(!V.modele){box.innerHTML="";return;}
  const f=($("filtreNets").value||"").trim().toLowerCase();
  const liste=V.parNet
    .filter(n=>n.nom&&(!f||n.nom.toLowerCase().indexOf(f)>=0))
    .sort(function(a,b){return a.nom.localeCompare(b.nom,"fr",{numeric:true});});
  if(!liste.length){
    box.innerHTML='<div class="rien">'+(f?"Aucun net ne correspond.":"Aucun net.")+"</div>";
    return;
  }
  const vus=liste.slice(0,PNL_MAX);
  box.innerHTML=vus.map(function(n){
    return '<button class="ligne'+(V.net===n.i?" on":"")+'" data-net="'+n.i+'">'
      +"<b>"+mdlEsc(n.nom)+"</b>"
      +'<span class="cpt">'+n.pistes.length+" p · "+mdlNb(n.longueur,1)+" "+V.unite
      +(n.trous.length?" · "+n.trous.length+" ⌀":"")+"</span></button>";
  }).join("")
  +(liste.length>vus.length
     ? '<div class="rien">… et '+mdlEntier(liste.length-vus.length)
       +" autres : affinez le filtre.</div>" : "");
  box.querySelectorAll("[data-net]").forEach(function(b){
    b.onclick=function(){ choisirNet(+b.dataset.net); };
  });
}

/* ==========================================================================
   Composants
   ========================================================================== */
function pnlComps(){
  const box=$("listeComps");
  if(!V.modele){box.innerHTML="";return;}
  const f=($("filtreComps").value||"").trim().toLowerCase();
  const liste=V.modele.composants.filter(function(c){
    if(!f)return true;
    return (c.ref+" "+c.val+" "+c.pkg).toLowerCase().indexOf(f)>=0;
  }).sort(function(a,b){return a.ref.localeCompare(b.ref,"fr",{numeric:true});});
  if(!liste.length){
    box.innerHTML='<div class="rien">'
      +(f?"Aucun composant ne correspond.":"Aucun composant.")+"</div>";
    return;
  }
  const vus=liste.slice(0,PNL_MAX);
  box.innerHTML=vus.map(function(c){
    const cu=V.couches[c.c];
    return '<button class="ligne'+(V.comp===c.ref?" on":"")+'" data-ref="'
      +mdlEsc(c.ref)+'">'
      +"<b>"+mdlEsc(c.ref)+"</b>"
      +(c.val?"<em>"+mdlEsc(c.val)+"</em>":"")
      +'<span class="cpt">'+mdlEsc(c.pkg||"")
      +(cu&&cu.dessous?" · dessous":"")+"</span></button>";
  }).join("")
  +(liste.length>vus.length
     ? '<div class="rien">… et '+mdlEntier(liste.length-vus.length)
       +" autres : affinez le filtre.</div>" : "");
  box.querySelectorAll("[data-ref]").forEach(function(b){
    b.onclick=function(){ choisirComp(b.dataset.ref,true); };
  });
}

/* ==========================================================================
   Sélection
   ========================================================================== */
function pnlDetail(){
  const box=$("detail");
  if(!V.modele){
    box.innerHTML='<div class="rien">Aucune carte ouverte.</div>';
    return;
  }
  const l=function(a,v){return "<tr><td>"+a+"</td><td>"+v+"</td></tr>";};
  let h="";

  const comp=V.comp?V.parRef.get(V.comp):null;
  if(comp){
    const cu=V.couches[comp.c];
    h+='<div class="fiche"><h3>Composant</h3><table>'
      +l("Repère",'<span class="val">'+mdlEsc(comp.ref)+"</span>")
      +l("Valeur",mdlEsc(comp.val||"—"))
      +(comp.tol?l("Tolérance",mdlEsc(comp.tol)):"")
      +l("Boîtier",mdlEsc(comp.pkg||"—"))
      +l("Montage",mdlEsc(comp.mnt||"—"))
      +l("Face",cu?mdlEsc(cu.nom)+(cu.dessous?" (dessous)":""):"—")
      +l("Position",mdlNb(comp.x)+" ; "+mdlNb(comp.y)+" "+V.unite)
      +l("Rotation",mdlNb(comp.r,1)+"°"+(comp.m?" · miroir":""))
      +l("Broches",(comp.pins?comp.pins.length:0)+" ("
        +(comp.pads?comp.pads.length:0)+" pastilles)")
      +"</table>";
    /* Les broches et leur net : c'est la question qu'on pose à un boîtier
       neuf fois sur dix — « la 3, elle va où ? ».

       La source, c'est comp.pins (num, x, y, et n s'il y a un net) : le net
       vient des <LogicalNet> du fichier, la seule source fiable -- les <Pad>
       internes à un <Pin> (comp.pads) sont quasiment toujours absents d'un
       export réel. On ne s'y rabat que si comp.pins n'a rien à dire, pour
       le cas rare d'un fichier qui les porte sans porter de LogicalNet. */
    const broches=(comp.pins&&comp.pins.length)?comp.pins
      :(comp.pads||[]).map(function(p){return {num:p.pin,n:p.n};});
    if(broches.length){
      h+="<h3>Broches</h3><table>";
      for(const p of broches.slice(0,80)){
        const rang=(p.n==null?-1:p.n);
        const nom=rang<0?"—":mdlNetNom(rang);
        h+='<tr><td class="g">'+mdlEsc(p.num||"?")+'</td><td>'
          +'<span class="lien" data-vnet="'+rang+'">'
          +mdlEsc(nom)+"</span></td></tr>";
      }
      if(broches.length>80)
        h+='<tr><td colspan="2">… et '+(broches.length-80)+" autres</td></tr>";
      h+="</table>";
    }
    h+="</div>";
  }

  const s=V.survol;
  if(V.net>=0){
    const n=V.parNet[V.net];
    const couches=[...n.couches].map(mdlCoucheNom).filter(Boolean).join(", ");
    h+='<div class="fiche"><h3>Net</h3><table>'
      +l("Nom",'<span class="val">'+mdlEsc(n.nom)+"</span>")
      +l("Longueur",mdlMes(n.longueur,2))
      +l("Pistes",n.pistes.length+(n.arcs.length?" + "+n.arcs.length+" arc(s)":""))
      +l("Pastilles",n.pads.length)
      +l("Perçages",n.trous.length)
      +l("Plans",n.plans.length)
      +l("Couches",mdlEsc(couches||"—"))
      +l("Montré",mdlEsc(pnlPortee()))
      +"</table>"
      /* Les chiffres du net entier ne s'affichent que quand c'est le net
         entier qu'on regarde : Maj+clic, ou un choix dans la liste. Sur un
         clic simple, la question portait sur un bout de piste, et c'est la
         fiche « Piste » qui y répond. */
      +(pnlNetEntier()?pnlLigneNet(V.net):"")
      +"</div>";
  }
  if(s&&s.type==="percage"){
    const t=s.trou, ps=V.modele.padstacks[t.ps];
    h+='<div class="fiche"><h3>Perçage</h3><table>'
      +l("Diamètre",'<span class="val">'+mdlMes(t.d)+"</span>")
      +l("Métallisation",/NON/i.test(t.p||"")?"non métallisé":"métallisé")
      +(t.a?l("Anneau",mdlMes(t.a)):"")
      +(ps&&ps.pad?l("Pastille",mdlMes(ps.pad)):"")
      +l("Définition",mdlEsc(t.ps||"—"))
      +l("Position",mdlNb(t.x)+" ; "+mdlNb(t.y)+" "+V.unite)
      +"</table></div>";
  }
  if(s&&s.type==="pad"){
    const ps=V.modele.padstacks[s.ps];
    h+='<div class="fiche"><h3>Pastille</h3><table>'
      +l("Broche",mdlEsc(s.pin||"—"))
      +l("Couche",mdlEsc(mdlCoucheNom(s.couche)))
      +(ps&&ps.trou?l("Trou",mdlMes(ps.trou)):"")
      +(ps&&ps.pad?l("Diamètre",mdlMes(ps.pad)):"")
      +l("Définition",mdlEsc(s.ps||"—"))
      +l("Position",mdlNb(s.x)+" ; "+mdlNb(s.y)+" "+V.unite)
      +"</table></div>";
  }
  if(s&&s.type==="piste"){
    h+='<div class="fiche"><h3>Piste</h3><table>'
      +l("Largeur",'<span class="val">'+mdlMes(s.piste.w)+"</span>")
      +l("Longueur",mdlMes(mdlLongueur(s.piste.p),2))
      +l("Segments",Math.max(0,s.piste.p.length/2-1))
      +l("Couche",mdlEsc(mdlCoucheNom(s.couche)))
      +"</table>"
      /* Le clic seul interroge ce bout de piste, et le calcul est ici. Avec
         Maj, c'est le net entier qu'on a demandé : les chiffres sont alors
         plus haut, dans sa fiche, et les répéter ici pour un seul tronçon
         ferait deux réponses à une seule question. */
      +(pnlNetEntier()?"":pnlLigne(s.piste,s.couche))
      +"</div>";
  }

  if(s&&s.type==="plan"){
    const g=s.plan;
    let dec=0;
    for(const ct of g.g)dec+=(ct.t?ct.t.length:0);
    h+='<div class="fiche"><h3>Plan</h3><table>'
      +l("Net",'<span class="val">'
        +mdlEsc(s.net>=0?mdlNetNom(s.net):"aucun")+"</span>")
      +l("Couche",mdlEsc(mdlCoucheNom(s.couche)))
      /* L'aire dit ce que le fichier ne dit pas : un plan de référence couvre
         la carte, un îlot de cuivre ne couvre que lui-même. */
      +l("Aire",mdlNb(mdlAirePlan(g),2)+" "+V.unite+"²")
      +l("Contours",g.g.length+(dec?" · "+dec+" découpe"+(dec>1?"s":""):""))
      +"</table></div>";
  }

  if(!h)h='<div class="rien">Cliquez une piste, un plan, une pastille ou un '
    +"boîtier ; Maj+clic suit le net au-delà de la couche cliquée. Les listes "
    +"mènent au même endroit.</div>";
  box.innerHTML=h;
  box.querySelectorAll("[data-vnet]").forEach(function(b){
    b.onclick=function(){
      const i=+b.dataset.vnet;
      if(i>=0)choisirNet(i);
    };
  });
}

/* Est-ce le net entier qu'on regarde ? C'est ce que Maj+clic demande, et ce
   que choisir dans la liste des nets demande aussi. La réponse commande le
   dessin comme la fiche : mêmes états, même question. */
function pnlNetEntier(){
  return V.net>=0&&V.mev.couche<0&&!V.mev.quoi&&!V.mev.seul;
}

/* Ce que la mise en évidence montre en ce moment. Sans cette ligne, un net qui
   ne s'allume que sur une couche ressemble à un défaut d'affichage plutôt qu'à
   la réponse à la question qu'on a posée — et rien ne dit que Maj élargit. */
function pnlPortee(){
  const p=V.mev;
  if(p.seul)return "ce perçage seul — Maj+clic : tous ceux du net";
  if(p.quoi==="trous")return "les perçages du net, sur toutes les couches";
  if(p.couche>=0)
    return mdlCoucheNom(p.couche)+" seule — Maj+clic : toutes les couches";
  return "toutes les couches";
}

/* ==========================================================================
   Ligne de transmission
   Ce que l'éditeur PCB montre d'une piste sélectionnée, montré ici de la même
   façon et avec les mêmes formules (voir 02-modele.js). Une différence de
   fond, et elle se lit dans la fiche : ici tout vient du fichier, et une cote
   absente est dite absente plutôt que devinée en silence.
   ========================================================================== */
const LT_TOPO={micro:"Microruban",strip:"Triplaque"};
/* Secondes, farads, henrys → l'unité dans laquelle on en parle. Une piste de
   carte se compte en picosecondes et en picofarads ; les valeurs mille fois
   plus grandes existent quand même, sur une longue liaison. */
function ltT(t){
  const ps=t*1e12;
  return ps>=1000?mdlNb(ps/1000,3)+" ns":mdlNb(ps,1)+" ps";
}
function ltC(c){
  const p=c*1e12;
  return p>=1000?mdlNb(p/1000,3)+" nF":mdlNb(p,3)+" pF";
}
function ltL(x){
  const n=x*1e9;
  return n>=1000?mdlNb(n/1000,3)+" µH":mdlNb(n,3)+" nH";
}
/* Les longueurs de la ligne sont en millimètres quelle que soit l'unité du
   fichier : les formules le sont, et un µH ne se compte pas en pouces. */
function ltMm(v,dec){ return mdlNb(v,dec==null?3:dec)+" mm"; }

/* Ce qui a manqué pour calculer, dit une fois et clairement : une impédance
   calculée sur un εr supposé n'est pas la même chose qu'une impédance
   calculée. Une piste et un net entier butent sur les mêmes absences, et il
   n'y a pas deux façons de les nommer — `g` est la géométrie de la piste
   regardée, nulle quand c'est un net qu'on résume. */
function pnlLigneManques(sup,g){
  const m=[];
  if(sup.plan)m.push("aucun plan de référence dans l'empilage — "
    +"l'impédance n'a pas de sens tant qu'un plan ne répond pas à la piste");
  if(sup.er)m.push("le fichier ne donne pas de permittivité : "
    +mdlNb(LT_ER,1)+" retenu, valeur courante d'un FR-4");
  /* Un empilage qui ne liste que ses conducteurs ne dit rien de ce qui les
     sépare : sans hauteur de diélectrique, il n'y a pas d'impédance à
     calculer, et un zéro serait un mensonge. */
  if(g&&!(g.h>0)&&!sup.plan)
    m.push("l'empilage ne donne aucune épaisseur de diélectrique entre cette "
      +"couche et son plan : Z₀ ne peut pas être calculée");
  if(sup.ep)m.push("épaisseur de cuivre absente de l'empilage : "
    +mdlNb(LT_EP_CU,3)+" mm retenu");
  if(sup.larg)m.push(g?"cette piste n'a pas de largeur dans le fichier"
                      :"des pistes de ce net n'ont pas de largeur dans le fichier");
  return m;
}

function pnlLigne(piste,coucheIdx){
  const e=ltPiste(piste,coucheIdx);
  const c=V.couches[coucheIdx];
  if(!e){
    /* Pas de ligne à calculer : la couche n'est pas du cuivre de l'empilage,
       ou le fichier n'a pas d'empilage du tout. Le dire est plus utile qu'un
       tableau de tirets. */
    const pourquoi=!V.modele.empilage.length
      ? "ce fichier ne décrit pas d'empilage"
      : (c&&!c.cuivre) ? "cette couche n'est pas du cuivre"
      : "cette couche n'est pas dans l'empilage";
    return "<h3>Ligne de transmission</h3>"
      +'<div class="note">Rien à calculer : '+mdlEsc(pourquoi)+".</div>";
  }
  const g=e.g, sup=e.suppose;
  const marque=function(t,quand){ return quand?" "+t:""; };
  let t="<h3>Ligne de transmission</h3><table>"
    +l3("Topologie",g.ref===0?"— aucun plan —":(LT_TOPO[g.kind]||"—"))
    +(g.ref===2
       ? l3("Plans de référence",pnlPlan(g.kHaut)+" / "+pnlPlan(g.kBas))
       : g.ref===1
         ? l3("Plan de référence",pnlPlan(g.kHaut>=0?g.kHaut:g.kBas))
         : "")
    +(g.kind==="strip"
       ? l3("Écart entre plans",ltMm(g.b))+l3("Au plan le plus proche",ltMm(g.h))
       : l3("Hauteur au plan",g.h>0?ltMm(g.h):"—"))
    +l3("Épaisseur cuivre",ltMm(g.t)+marque("(supposée)",sup.ep))
    +l3("εr stratifié",mdlNb(g.er,2)+marque("(supposée)",sup.er))
    +l3("εr effective",mdlNb(e.eeff,2))
    +l3("Impédance Z₀",e.z0>0
         ?'<span class="val">'+mdlNb(e.z0,1)+" Ω</span>":"—")
    +l3("Retard t_pd",ltT(e.tpd))
    +l3("Retard par mm",e.psmm?mdlNb(e.psmm,3)+" ps/mm":"—")
    /* Les deux se déduisent de Z₀ : sans elle, il n'y a pas de valeur à
       montrer, et « 0 pF » se lirait comme une mesure. */
    +l3("Capacité",e.z0>0?ltC(e.c):"—")
    +l3("Inductance",e.z0>0?ltL(e.ind):"—")
    +"</table>";

  const manques=pnlLigneManques(sup,g);
  if(manques.length)
    t+='<div class="note attention">'+manques.map(mdlEsc).join("<br>")
      +"<br>Ces valeurs se complètent à la main dans le panneau « La carte », "
      +"sous « Empilage du calcul ».</div>";

  /* Ce qui n'est pas une donnée manquante mais une limite de la formule : rien
     à saisir ici, seulement à savoir. D'où un bloc à part — le pointer vers la
     saisie donnerait un travail impossible.
     Une triplaque nettement décentrée sort trop haut, la formule supposant la
     piste à mi-hauteur. C'est le cas de presque tout empilage 4 couches : âme
     épaisse d'un côté, préimprégné mince de l'autre. */
  if(g.kind==="strip"&&g.dissym>0.4)
    t+='<div class="note attention">'+mdlEsc("Triplaque dissymétrique ("
      + ltMm(g.h) + " d'un plan, " + ltMm(g.b-g.h-g.t) + " de l'autre) : la "
      + "formule suppose la piste centrée entre les deux, Z₀ sort au-dessus de "
      + "la réalité.")+"</div>";
  t+='<div class="note">Hammerstad pour εr effective, Wheeler pour le '
    +"microruban, IPC-2141A pour la triplaque — les mêmes que l'éditeur PCB : "
    +"±5 % au mieux. De quoi juger un tracé, pas de quoi signer une commande.</div>";
  return t;
}
/* « une piste », « deux pistes » — l'accord est la moitié de ce qui rend un
   tableau lisible. */
function pnlPistes(n){ return n+(n>1?" pistes":" piste"); }

/* Le net entier comme ligne — ce que Maj+clic demande. La question n'est plus
   « que vaut ce bout de piste » mais « que vaut ce signal d'un bout à
   l'autre », et la réponse n'a pas la même forme : ce qui se répartit
   s'additionne, l'impédance non. */
function pnlLigneNet(i){
  const t=ltNet(i);
  if(!t)return "";
  const n=V.parNet[i];

  /* Une seule impédance sur tout le net, ou plusieurs ? Un demi-ohm d'écart
     vient de l'arrondi des largeurs, pas d'un changement de ligne. */
  const varie=(t.z0max-t.z0min)>0.5;
  const z0=!(t.z0max>0) ? "—"
    : varie
      ? '<span class="val">'+mdlNb(t.z0min,1)+" à "+mdlNb(t.z0max,1)+" Ω</span>"
        +" · "+mdlNb(t.z0moy,1)+" Ω en moyenne, pondérée par la longueur"
      : '<span class="val">'+mdlNb(t.z0moy,1)+" Ω</span>";

  let h="<h3>Ligne de transmission — net entier</h3><table>"
    /* Le nombre de pistes, tout de suite : c'est la différence entre cette
       fiche et celle d'un clic simple, qui ne parle que d'une seule d'entre
       elles. Le même nombre que « Pistes » dans la fiche du net juste
       au-dessus, aux pistes hors empilage près. */
    +l3("Longueur calculée",ltMm(t.len,2)+" · "+pnlPistes(t.pistes))
    +l3("Impédance Z₀",z0)
    +l3("Retard total",ltT(t.tpd))
    +l3("Capacité totale",t.lenZ0>0?ltC(t.c):"—")
    +l3("Inductance totale",t.lenZ0>0?ltL(t.ind):"—")
    +"</table>";

  /* Le détail, dès qu'il y a plus d'un tronçon : un net à 50 Ω d'un bout à
     l'autre n'a rien à détailler, un net qui change de couche et de largeur
     ne se résume pas à une moyenne. */
  if(t.morceaux.length>1){
    h+="<h3>Par couche et largeur</h3><table>";
    for(const m of t.morceaux.slice(0,12))
      h+="<tr><td>"+mdlEsc(mdlCoucheNom(m.couche))+"</td><td>"
        +ltMm(m.len,2)+" en "+pnlPistes(m.n)+" · "+ltMm(m.w,3)
        +" · "+(m.z0>0?mdlNb(m.z0,1)+" Ω":"—")+"</td></tr>";
    if(t.morceaux.length>12)
      h+='<tr><td colspan="2">… et '+(t.morceaux.length-12)
        +" autres tronçons</td></tr>";
    h+="</table>";
  }

  const manques=pnlLigneManques(t.suppose,null);
  if(manques.length)
    h+='<div class="note attention">'+manques.map(mdlEsc).join("<br>")
      +"<br>Ces valeurs se complètent à la main dans le panneau « La carte », "
      +"sous « Empilage du calcul ».</div>";

  /* Ce que le total laisse dehors. Un chiffre dont on ignore ce qu'il ne
     contient pas vaut moins qu'un chiffre absent — mais rien ici ne se saisit,
     d'où un bloc à part : renvoyer vers l'empilage donnerait un travail
     impossible. */
  const dehors=[];
  if(t.lenHors>0)
    dehors.push(ltMm(t.lenHors,2)+" de ce net courent sur des couches hors "
      +"empilage ("+t.couchesHors.map(mdlCoucheNom).join(", ")
      +") : cette longueur n'est comptée dans aucun total");
  if(t.arcs)
    dehors.push(t.arcs+" arc(s) de ce net ne sont pas comptés : IPC-2581 les "
      +"décrit à part des pistes, et leur longueur n'entre nulle part ici");
  if(dehors.length)
    h+='<div class="note attention">'+dehors.map(mdlEsc).join("<br>")+"</div>";
  if(varie)
    h+='<div class="note">'+"Un net n'a pas une impédance : il en a une par "
      +"tronçon. Les longueurs, retards, capacités et inductances s'ajoutent ; "
      +"Z₀ ne s'ajoute pas, elle se lit tronçon par tronçon.</div>";
  h+='<div class="note">Hammerstad pour εr effective, Wheeler pour le '
    +"microruban, IPC-2141A pour la triplaque — les mêmes que l'éditeur PCB : "
    +"±5 % au mieux. De quoi juger un tracé, pas de quoi signer une commande.</div>";
  return h;
}

/* Même ligne de tableau que les fiches voisines, avec le libellé à gauche. */
function l3(a,v){ return "<tr><td>"+a+"</td><td>"+v+"</td></tr>"; }

/* Le nom d'un plan de référence, et d'où vient ce statut. Beaucoup de fichiers
   déclarent toutes leurs couches « SIGNAL » alors que trois d'entre elles
   portent un plan de masse : c'est le cuivre posé qui tranche, et le taux
   affiché permet de juger si l'on est d'accord. */
function pnlPlan(k){
  const e=LT.cu[k];
  if(!e)return "—";
  return mdlEsc(e.nom)+(e.planSrc==="cuivre"
    ? ' <span title="Couche déclarée SIGNAL par le fichier, mais couverte de '
      +'cuivre plein : c\'est ce qui en fait un plan de référence.">('
      +Math.round(e.taux*100)+" % de cuivre)</span>"
    : "");
}

/* ==========================================================================
   Pied de page et rafraîchissement d'ensemble
   ========================================================================== */
function pnlPied(){
  const s=V.modele?V.modele.stats:null;
  $("fNom").textContent=V.fichier||"—";
  $("fComps").textContent=s?mdlEntier(s.composants):"0";
  $("fNets").textContent=s?mdlEntier(s.nets):"0";
  $("fTrous").textContent=s?mdlEntier(s.percages):"0";
}
function pnlTout(){
  pnlCouches(); pnlElements(); pnlInfos(); pnlNets(); pnlComps();
  pnlDetail(); pnlPied();
}
