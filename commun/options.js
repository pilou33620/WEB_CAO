/* =============================================================================
   commun/options.js
   Fenêtre d'options des deux éditeurs : une sélection pose ses propriétés dans
   une fenêtre flottante, au-dessus du canevas. C'est le #props du panneau
   Propriétés qui s'y déplace, handlers compris ; il y revient à la fermeture.

     · les champs s'appliquent en direct, chacun avec son étape Ctrl+Z, comme au
       panneau ; OK garde tout, Annuler défait ce qui a changé depuis l'ouverture ;
     · une fenêtre fermée ne revient qu'avec une autre sélection ;
     · sur téléphone, les propriétés restent dans le tiroir.
   ============================================================================= */
(function optInit(){
  if(typeof document==="undefined"||typeof MutationObserver!=="function")return;
  const box=document.getElementById("props"), wrap=document.getElementById("canvasWrap");
  if(!box||!wrap||typeof selCount!=="function"||typeof undo!=="function")return;

  const fen=document.createElement("div");
  fen.className="opt-fen";fen.hidden=true;
  fen.innerHTML='<div class="opt-tete"><span>PROPRIÉTÉS</span><button type="button" data-opt="ok" title="Fermer">✕</button></div>'+
    '<div class="pnl-body"></div>'+
    '<div class="opt-pied"><button type="button" class="tb" data-opt="annuler" title="Défait ce qui a changé depuis l\'ouverture de la fenêtre">Annuler</button>'+
    '<button type="button" class="tb pri" data-opt="ok">OK</button></div>';
  wrap.appendChild(fen);
  const corps=fen.querySelector(".pnl-body"), titre=fen.querySelector(".opt-tete span");
  // tient la place de #props dans le panneau, et dit où il est
  const renvoi=document.createElement("div");
  renvoi.className="empty";
  renvoi.textContent="Dans la fenêtre d'options, au-dessus du canevas. OK ou ✕ le ramène ici.";

  let vue=null, repere=null;   // sélection en cours (signature), haut de la pile à son ouverture
  const pile=()=>S.undo||S.hist;

  /* La sélection vit dans des Set d'id ou d'objets, selon l'éditeur et le type */
  const ids=new WeakMap();let n=0;
  function ident(v){
    if(v===null||typeof v!=="object")return String(v);
    if(!ids.has(v))ids.set(v,++n);
    return ids.get(v);
  }
  function signature(){
    const out=[];
    const voir=x=>{
      if(x==null)return;
      if(typeof x.forEach==="function")x.forEach(v=>out.push(ident(v)));
      else if(typeof x==="object")Object.values(x).forEach(voir);
      else out.push(String(x));
    };
    voir(S.sel);voir(S.selW);voir(S.selD);
    return out.join(",");
  }
  function montrer(){
    const c=selCount();
    titre.textContent=c>1?"PROPRIÉTÉS · "+c+" éléments":"PROPRIÉTÉS";
    if(fen.hidden){
      box.replaceWith(renvoi);
      corps.appendChild(box);
      fen.hidden=false;
    }
  }
  function cacher(){
    if(fen.hidden)return;
    renvoi.replaceWith(box);
    fen.hidden=true;
  }
  function maj(){
    if(document.body.classList.contains("tel")||!selCount()){vue=null;cacher();return;}
    const s=signature();
    if(s===vue)return;
    vue=s;
    const p=pile();
    repere=p.length?p[p.length-1]:null;
    montrer();
  }
  function annuler(){
    const p=pile(), i=repere===null?-1:p.lastIndexOf(repere);
    for(let k=p.length-1-i;k>0&&p.length;k--)undo();
    vue=signature();     // la sélection rendue par l'annulation n'est pas une nouvelle sélection
    cacher();
  }
  fen.addEventListener("click",e=>{
    const a=e.target.closest("[data-opt]");
    if(!a)return;
    if(a.dataset.opt==="annuler")annuler();else cacher();
  });

  /* la fenêtre se déplace par sa tête, sans sortir du canevas */
  const tete=fen.querySelector(".opt-tete");
  tete.addEventListener("pointerdown",e=>{
    if(e.target.closest("button"))return;
    const r=fen.getBoundingClientRect(), w=wrap.getBoundingClientRect(), dx=e.clientX-r.left, dy=e.clientY-r.top;
    tete.setPointerCapture(e.pointerId);
    const bouger=m=>{
      fen.style.right="auto";
      fen.style.left=Math.max(0,Math.min(w.width-r.width,m.clientX-w.left-dx))+"px";
      fen.style.top=Math.max(0,Math.min(w.height-30,m.clientY-w.top-dy))+"px";
    };
    const finir=()=>{tete.removeEventListener("pointermove",bouger);tete.removeEventListener("pointerup",finir);};
    tete.addEventListener("pointermove",bouger);
    tete.addEventListener("pointerup",finir);
  });

  new MutationObserver(maj).observe(box,{childList:true});
})();
