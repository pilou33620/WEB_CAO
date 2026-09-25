/* =============================================================================
   commun/menus.js
   Barre de menus des deux éditeurs. Les entrées sont les boutons d'origine :
   leurs handlers restent ceux des éditeurs, ce fichier ne fait qu'ouvrir et
   fermer les menus.

     · un clic sur une entrée ferme le menu APRÈS son handler : les petits
       menus d'options (zone cuivre, sérigraphie, trait, espace de travail…)
       se placent donc encore sous l'entrée visible ;
     · les entrées [data-bascule] (Grille, Chevelu, Vue…) et le pas de grille
       laissent le menu ouvert : on voit la valeur changer ;
     · l'étiquette « OUTIL » recopie le mode actif du menu Placer ;
     · un compteur [data-mnu-badge] visible, ou une entrée en alerte
       (classe *-warn), remonte en pastille sur le titre de son menu.
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

  document.addEventListener("pointerdown",function(e){
    if(ouvert&&!ouvert.contains(e.target))fermer();
  },true);
  document.addEventListener("keydown",function(e){
    if(e.key==="Escape"&&ouvert){fermer();e.stopPropagation();}
  },true);
  window.addEventListener("resize",fermer);

  if(typeof MutationObserver!=="function")return;

  /* ---- étiquette de l'outil actif ---- */
  const chip=document.getElementById("mnuChip");
  const placer=document.querySelector('.mnu[data-mnu="placer"]');
  if(chip&&placer){
    const modes=Array.prototype.slice.call(placer.querySelectorAll('.mnu-pop button[id^="m"]'));
    const majChip=function(){
      const b=modes.find(function(x){return x.classList.contains("on");});
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
      if(ouvert===placer)fermer();else ouvrir(placer);
    });
    new MutationObserver(majChip).observe(placer.querySelector(".mnu-pop"),
      {subtree:true,attributes:true,attributeFilter:["class"]});
    majChip();
  }

  /* ---- pastilles sur les titres ---- */
  menus.forEach(function(m){
    const t=m.querySelector(".mnu-t"), pop=m.querySelector(".mnu-pop");
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
