/* =============================================================================
   commun/menus.js
   Ruban et menus des deux éditeurs. Les entrées sont les boutons d'origine :
   leurs handlers restent ceux des éditeurs, ce fichier ne fait qu'ouvrir et
   fermer les menus, et choisir l'onglet du ruban.

     · un clic sur une entrée ferme le menu APRÈS son handler : les petits
       menus d'options (zone cuivre, sérigraphie, trait, espace de travail…)
       se placent donc encore sous l'entrée visible ;
     · les entrées [data-bascule] (Grille, Chevelu, Vue…) et le pas de grille
       laissent le menu ouvert : on voit la valeur changer ;
     · l'étiquette « OUTIL » recopie le mode actif, et un clic montre son bouton ;
     · un compteur [data-mnu-badge] visible, ou une entrée en alerte
       (classe *-warn), remonte en pastille sur le titre de son menu ou onglet ;
     · le ruban se replie sur ses onglets (d'usine sur téléphone) : un onglet
       pose alors sa bande par-dessus le canevas, le temps d'une commande.
   ============================================================================= */
(function mnuInit(){
  if(typeof document==="undefined"||!document.querySelectorAll)return;
  const menus=Array.prototype.slice.call(document.querySelectorAll(".mnu"));
  if(!menus.length)return;
  let ouvert=null;

  function fermer(){
    if(ouvert)ouvert.classList.remove("open");
    ouvert=null;
  }
  function ouvrir(m){
    if(ouvert===m)return;
    fermer();
    m.classList.add("open");ouvert=m;
    // Affichage, Outils… à droite de la barre : le menu reste dans l'écran
    // (téléphone : telephone.css le place déjà en position fixe)
    const pop=m.querySelector(".mnu-pop");
    if(!pop||document.body.classList.contains("tel"))return;
    if(m.classList.contains("rg")){   // groupe du ruban : liste fixe, sous son titre
      const q=m.querySelector(".mnu-t").getBoundingClientRect(), W=document.documentElement.clientWidth;
      pop.style.left=Math.max(6,Math.min(q.left,W-pop.getBoundingClientRect().width-6))+"px";
      pop.style.top=q.bottom+3+"px";
      return;
    }
    pop.style.left="";
    const r=pop.getBoundingClientRect(), trop=r.right-(document.documentElement.clientWidth-6);
    if(trop>0)pop.style.left=-Math.min(trop,r.left-6)+"px";
  }

  menus.forEach(function(m){
    const t=m.querySelector(".mnu-t"), pop=m.querySelector(".mnu-pop");
    if(!t||!pop)return;
    t.addEventListener("click",function(e){
      e.stopPropagation();
      if(ouvert===m)fermer();else ouvrir(m);
    });
    // menus ouverts : survoler un autre titre bascule dessus
    t.addEventListener("mouseenter",function(){if(ouvert&&ouvert!==m)ouvrir(m);});
    // phase de capture : plusieurs handlers d'outils font stopPropagation()
    pop.addEventListener("click",function(e){
      const b=e.target.closest?e.target.closest("button"):null;
      if(!b||b.hasAttribute("data-bascule"))return;
      setTimeout(function(){if(ouvert===m)fermer();},0);
    },true);
  });

  /* ---- onglets du ruban ---- */
  const ongs=Array.prototype.slice.call(document.querySelectorAll(".ong"));
  let deroule=null;
  function ongFermer(){
    if(deroule)deroule.classList.remove("deroule");
    deroule=null;
  }
  function ongChoisir(o){
    ongs.forEach(function(x){x.classList.toggle("actif",x===o);});
    if(!document.body.classList.contains("ruban-replie")||deroule===o)return;
    ongFermer();
    o.classList.add("deroule");deroule=o;
  }
  ongs.forEach(function(o){
    o.querySelector(".mnu-t").addEventListener("click",function(e){
      e.stopPropagation();
      fermer();
      if(deroule===o)ongFermer();else ongChoisir(o);
    });
    // replié : une commande lancée referme la bande, après son handler comme les menus
    o.querySelector(".band").addEventListener("click",function(e){
      const b=e.target.closest?e.target.closest("button"):null;
      if(!b||b.hasAttribute("data-bascule")||b.classList.contains("mnu-t"))return;
      setTimeout(function(){if(deroule===o)ongFermer();},0);
    },true);
  });
  const pli=document.getElementById("rubanPli");
  function ongPlier(replie,memoriser){
    document.body.classList.toggle("ruban-replie",replie);
    pli.textContent=replie?"▾":"▴";
    pli.title=replie?"Déplier le ruban":"Replier le ruban : plus de place pour le canevas";
    pli.setAttribute("aria-expanded",String(!replie));
    ongFermer();
    if(memoriser)try{localStorage.setItem("cao.ruban.replie",replie?"1":"0");}catch(_){}
    // le canevas suit la place que le ruban lui laisse (même porte que telephone.js)
    requestAnimationFrame(function(){dispatchEvent(new Event("resize"));});
  }
  if(pli){
    let lu=null;
    try{lu=localStorage.getItem("cao.ruban.replie");}catch(_){}
    ongPlier(lu===null?matchMedia("(max-width:600px),(max-height:500px)").matches:lu==="1",false);
    pli.addEventListener("click",function(e){
      e.stopPropagation();
      ongPlier(!document.body.classList.contains("ruban-replie"),true);
    });
  }
  /* Montre une commande, où qu'elle soit rangée : son onglet, sa liste. Rien
     (null) : tout refermer. Pour l'étiquette OUTIL et le tutoriel. */
  window.menusMontrer=function(el){
    fermer();
    const o=el&&el.closest(".ong"), m=el&&el.closest(".mnu");
    if(deroule!==o)ongFermer();
    if(o)ongChoisir(o);
    if(m)ouvrir(m);
  };
  /* icône seule ou raccourci masqué : l'infobulle garde le nom et la touche */
  document.querySelectorAll(".band button.tb,.barre-rapide>button.tb,.vue-bar>button.tb").forEach(function(b){
    const c=b.cloneNode(true), k=b.querySelector("kbd");
    c.querySelectorAll("kbd,.car,[data-mnu-badge]").forEach(function(x){x.remove();});
    if(!b.title)b.title=c.textContent.trim();
    if(k&&!b.title.includes(k.textContent))b.title+=" ("+k.textContent+")";
  });
  document.querySelectorAll("[data-proxy]").forEach(function(b){
    b.addEventListener("click",function(){document.getElementById(b.dataset.proxy).click();});
  });

  document.addEventListener("pointerdown",function(e){
    if(ouvert&&!ouvert.contains(e.target)&&!e.target.closest(".pilote"))fermer();  /* carte de Claude : le geste suivant vise ce menu */
    if(deroule&&!deroule.contains(e.target)&&!e.target.closest(".pilote"))ongFermer();
  },true);
  document.addEventListener("keydown",function(e){
    if(e.key==="Escape"&&(ouvert||deroule)){fermer();ongFermer();e.stopPropagation();}
  },true);
  window.addEventListener("resize",function(){fermer();ongFermer();});

  if(typeof MutationObserver!=="function")return;

  /* ---- étiquette de l'outil actif ---- */
  const chip=document.getElementById("mnuChip");
  const ruban=document.querySelector(".menubar");
  if(chip&&ruban){
    const modes=Array.prototype.slice.call(ruban.querySelectorAll('button[id^="m"]'));
    const actif=function(){return modes.find(function(x){return x.classList.contains("on");});};
    const majChip=function(){
      const b=actif();
      let html="—";
      if(b){
        const c=b.cloneNode(true);
        c.querySelectorAll(".car").forEach(function(x){x.remove();});
        html=(b.dataset.ic?b.dataset.ic+" ":"")+c.innerHTML.trim();
      }
      chip.innerHTML="<small>OUTIL</small> "+html;
    };
    chip.addEventListener("click",function(e){
      e.stopPropagation();
      window.menusMontrer(actif()||null);
    });
    modes.forEach(function(b){new MutationObserver(majChip).observe(b,{attributes:true,attributeFilter:["class"]});});
    majChip();
  }

  /* ---- cube de vue : le bouton « Vue » (touche Y) reste seul maître ---- */
  const cube=document.getElementById("vueCube"), bVue=document.getElementById("bView");
  if(cube&&bVue){
    cube.addEventListener("click",function(){bVue.click();});
    const majCube=function(){
      const dessous=/dessous/i.test(bVue.textContent);
      cube.classList.toggle("dessous",dessous);
      cube.querySelector("text").textContent=dessous?"DESSOUS":"DESSUS";
    };
    new MutationObserver(majCube).observe(bVue,{subtree:true,childList:true,characterData:true});
    majCube();
  }

  /* ---- pastilles sur les titres : menus et onglets, pas les listes d'un groupe ---- */
  menus.filter(function(m){return !m.classList.contains("rg");}).concat(ongs).forEach(function(m){
    const t=m.querySelector(".mnu-t"), pop=m.querySelector(".band")||m.querySelector(".mnu-pop");
    if(!t||!pop)return;
    const dot=document.createElement("span");
    dot.className="mnu-dot";dot.hidden=true;
    t.insertBefore(dot,t.querySelector(".car"));
    const maj=function(){
      let n=0, alerte=false;
      pop.querySelectorAll("[data-mnu-badge]").forEach(function(x){
        const v=parseInt(x.textContent,10);
        if(x.style.display!=="none"&&v>0)n+=v;
      });
      pop.querySelectorAll('[class*="-warn"]').forEach(function(){alerte=true;});
      dot.textContent=n?String(n):"!";
      dot.hidden=!(n||alerte);
    };
    new MutationObserver(maj).observe(pop,
      {subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:["class","style"]});
    maj();
  });
})();
