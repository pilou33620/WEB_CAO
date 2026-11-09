"use strict";
/* ==========================================================================
   Gestion du DRC — une fenêtre flottante, à côté de la carte, qui range les
   écarts trouvés par `runDrc` par catégorie, les parcourt un à un (précédent /
   suivant) et amène chacun sous les yeux.
   ========================================================================== */

/* ---------- la fenêtre ---------- */
const DRCW_MAX=300;                 // lignes peintes par catégorie (le reste se parcourt au ◀ ▶)
const DRCW={info:false, ferme:{}};
/* La catégorie d'un écart : le début de son message, avant le premier nombre,
   deux-points ou parenthèse. shortcut: tiré du texte ; donner un champ `kind`
   à chaque entrée de runDrc si des catégories se mélangent. */
function drcCategorie(e){
  return (String(e.msg).split(/[:(0-9]/)[0].replace(/\s+(sur|de|du|des|à|entre)\s*$/i,"").trim())||"Divers";
}
/* les écarts visibles, rangés par catégorie (ordre d'apparition) */
function drcRangs(){
  const g=new Map();
  for(const e of S.drc){
    if(e.info&&!DRCW.info)continue;
    const k=drcCategorie(e);
    if(!g.has(k))g.set(k,[]);
    g.get(k).push(e);
  }
  return g;
}
function drcAller(e){
  if(!e)return;
  S.drcSel=e;
  if(e.via&&S.vias.indexOf(e.via)>=0){clearSel();S.sel.vias.add(e.via);buildProps();}
  else if(e.layer!=null)routeToLayer(e.layer);
  if(S.scale<12)S.scale=12;          // assez près pour voir l'écart, pas plus
  center(e.x,e.y);
  drcFenetreMaj();
}
function drcPas(sens){
  const tous=[].concat(...drcRangs().values());
  if(!tous.length)return;
  const i=tous.indexOf(S.drcSel);
  drcAller(tous[i<0?(sens>0?0:tous.length-1):(i+sens+tous.length)%tous.length]);
}
function drcFenetre(){
  if(typeof document==="undefined")return;
  let w=document.getElementById("drcWin");
  if(!w||!w.querySelector||!w.querySelector("#drcwList")){
    w=document.createElement("div");
    w.id="drcWin";w.className="drcw";
    w.innerHTML='<div class="drcw-head"><b>Contrôle DRC</b><span id="drcwNb"></span>'+
      '<button class="tb mini" id="drcwRun" title="Relancer le contrôle">↻ Relancer</button>'+
      '<button class="tb mini" id="drcwX" title="Fermer">✕</button></div>'+
      '<div class="drcw-bar"><button class="tb mini" id="drcwPrev" title="Écart précédent">◀</button>'+
      '<span id="drcwPos"></span><button class="tb mini" id="drcwNext" title="Écart suivant">▶</button>'+
      '<label title="Montrer aussi les remarques (sans marqueur rouge)"><input type="checkbox" id="drcwInfo"> remarques</label></div>'+
      '<div class="drcw-list" id="drcwList"></div>';
    document.body.appendChild(w);
    const q=id=>w.querySelector("#"+id);
    if(!q("drcwX"))return;              // DOM sans rendu (banc d'essai)
    q("drcwX").onclick=()=>{w.remove();S.drcSel=null;draw();};
    q("drcwRun").onclick=()=>{runDrc();refreshPanels();draw();};
    q("drcwPrev").onclick=()=>drcPas(-1);
    q("drcwNext").onclick=()=>drcPas(1);
    q("drcwInfo").onchange=ev=>{DRCW.info=ev.target.checked;drcFenetreMaj();};
    /* la fenêtre se déplace par sa barre de titre */
    const head=w.querySelector(".drcw-head");
    head.onmousedown=ev=>{
      if(ev.target.tagName==="BUTTON")return;
      const r=w.getBoundingClientRect(), ox=ev.clientX-r.left, oy=ev.clientY-r.top;
      const mv=e=>{w.style.left=Math.max(0,e.clientX-ox)+"px";w.style.top=Math.max(0,e.clientY-oy)+"px";w.style.right="auto";};
      const up=()=>{document.removeEventListener("mousemove",mv);document.removeEventListener("mouseup",up);};
      document.addEventListener("mousemove",mv);document.addEventListener("mouseup",up);
      ev.preventDefault();
    };
  }
  drcFenetreMaj();
}
function drcFenetreMaj(){
  if(typeof document==="undefined")return;
  const w=document.getElementById("drcWin");
  const q=id=>w&&w.querySelector?w.querySelector("#"+id):null;
  if(!q("drcwList"))return;          // fenêtre fermée
  const durs=S.drc.filter(e=>!e.info).length, rq=S.drc.length-durs;
  q("drcwNb").textContent=!S.drcRun?" — non lancé":
    " — "+durs+" erreur"+(durs>1?"s":"")+(rq?", "+rq+" remarque"+(rq>1?"s":""):"");
  const g=drcRangs(), tous=[].concat(...g.values());
  const i=tous.indexOf(S.drcSel);
  q("drcwPos").textContent=tous.length?(i<0?"–":(i+1))+" / "+tous.length:"0";
  const box=q("drcwList");
  if(!S.drcRun){box.innerHTML='<div class="empty">Contrôle non lancé.</div>';return;}
  if(!tous.length){box.innerHTML='<div class="empty ok">Aucune erreur détectée.</div>';return;}
  let h="", idx=[];
  for(const [k,es] of g){
    const ferme=!!DRCW.ferme[k];
    h+='<div class="drcw-cat" data-k="'+esc(k)+'">'+(ferme?"▸":"▾")+' '+esc(k)+' <span>'+es.length+'</span></div>';
    if(ferme)continue;
    for(const e of es.slice(0,DRCW_MAX)){
      h+='<div class="drcw-row'+(e===S.drcSel?" on":"")+(e.info?" info":"")+'" data-i="'+idx.length+'">'+esc(e.msg)+
         '<span>'+fmt(ux(e.x),2)+" ; "+fmt(uy(e.y),2)+" mm"+(e.l!=null&&e.l<S.cu?" · "+cuId(e.l,S.cu):"")+
         (e.aire?" · "+fmt(e.aire,2)+" mm²":"")+'</span></div>';
      idx.push(e);
    }
    if(es.length>DRCW_MAX)h+='<div class="empty">… '+(es.length-DRCW_MAX)+' de plus, à parcourir avec ◀ ▶</div>';
  }
  box.innerHTML=h;
  box.querySelectorAll(".drcw-cat").forEach(d=>d.onclick=()=>{DRCW.ferme[d.dataset.k]=!DRCW.ferme[d.dataset.k];drcFenetreMaj();});
  box.querySelectorAll(".drcw-row").forEach(r=>r.onclick=()=>drcAller(idx[+r.dataset.i]));
  const on=box.querySelector(".drcw-row.on");
  if(on&&on.scrollIntoView)on.scrollIntoView({block:"nearest"});
}
