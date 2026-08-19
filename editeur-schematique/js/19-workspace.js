"use strict";
function $(id){return document.getElementById(id);}
function hint(t){const el=$("fHint");if(el)el.textContent=t;}
/* ==========================================================================
   Éditeur PCB — espace de travail modulaire
   Les panneaux latéraux sont détachables : on les glisse par leur en-tête
   vers un dock (gauche, droite, bas), on les fait flotter au-dessus du
   canevas, on les replie ou on les ferme. Tailles et positions sont
   conservées dans le stockage local.
   ========================================================================== */

const WS_KEY="schema.espace-travail.v1";
const WS_DOCKS=["dockL","dockR","dockB"];
const WS_MIN_DOCK=150, WS_MIN_PNL=64, WS_MIN_FW=210, WS_MIN_FH=130, WS_EDGE=74;

/* disposition d'usine */
function wsDefault(){
  return {
    docks:{dockL:212,dockR:278,dockB:200},
    order:{dockL:["palette"],dockR:["props","list"],dockB:[]},
    floats:[],hidden:[],
    panels:{
      palette:{grow:1  ,collapsed:false,x:90 ,y:150,w:250,h:600,last:"dockL"},
      props:{grow:1.2,collapsed:false,x:150,y:150,w:300,h:400,last:"dockR"},
      list :{grow:1  ,collapsed:false,x:190,y:230,w:420,h:340,last:"dockR"}
    }
  };
}
let WS=wsDefault();

/* ==========================================================================
   Stockage
   ========================================================================== */
function wsSave(){
  try{localStorage.setItem(WS_KEY,JSON.stringify(WS));}catch(e){}
}
function wsLoad(){
  let raw=null;
  try{raw=localStorage.getItem(WS_KEY);}catch(e){}
  if(!raw)return;
  let d=null;
  try{d=JSON.parse(raw);}catch(e){return;}
  if(!d||typeof d!=="object")return;
  const def=wsDefault(), out=wsDefault();
  for(const k of WS_DOCKS)
    if(d.docks&&isFinite(d.docks[k]))out.docks[k]=Math.max(WS_MIN_DOCK,+d.docks[k]);
  const known=Object.keys(def.panels), seen=new Set();
  for(const k of WS_DOCKS){
    out.order[k]=[];
    const src=(d.order&&Array.isArray(d.order[k]))?d.order[k]:[];
    for(const id of src)
      if(known.includes(id)&&!seen.has(id)){seen.add(id);out.order[k].push(id);}
  }
  out.floats=[];out.hidden=[];
  for(const id of (Array.isArray(d.floats)?d.floats:[]))
    if(known.includes(id)&&!seen.has(id)){seen.add(id);out.floats.push(id);}
  for(const id of (Array.isArray(d.hidden)?d.hidden:[]))
    if(known.includes(id)&&!seen.has(id)){seen.add(id);out.hidden.push(id);}
  /* un panneau absent du fichier retrouve sa place d'usine */
  for(const id of known)
    if(!seen.has(id))out.order[def.panels[id].last].push(id);
  for(const id of known){
    const s=(d.panels&&d.panels[id])||{}, t=out.panels[id];
    if(isFinite(s.grow)&&s.grow>0)t.grow=+s.grow;
    t.collapsed=!!s.collapsed;
    for(const pair of [["x",-100000],["y",0],["w",WS_MIN_FW],["h",WS_MIN_FH]])
      if(isFinite(s[pair[0]]))t[pair[0]]=Math.max(pair[1],+s[pair[0]]);
    if(WS_DOCKS.indexOf(s.last)>=0)t.last=s.last;
  }
  WS=out;
}

/* ==========================================================================
   Accès
   ========================================================================== */
const wsEl={};                                 /* id de panneau -> <section> */
function wsPlaceOf(id){
  for(const k of WS_DOCKS)if(WS.order[k].indexOf(id)>=0)return k;
  if(WS.floats.indexOf(id)>=0)return "float";
  return "hidden";
}
function wsPluck(id){
  for(const k of WS_DOCKS){
    const i=WS.order[k].indexOf(id);
    if(i>=0){WS.order[k].splice(i,1);WS.panels[id].last=k;}
  }
  let i=WS.floats.indexOf(id);if(i>=0)WS.floats.splice(i,1);
  i=WS.hidden.indexOf(id);if(i>=0)WS.hidden.splice(i,1);
}
/* déplace un panneau ; cible = dockL | dockR | dockB | float | hidden */
function wsMove(id,target,index){
  wsPluck(id);
  if(WS_DOCKS.indexOf(target)>=0){
    const arr=WS.order[target];
    const at=(index==null||index<0||index>arr.length)?arr.length:index;
    arr.splice(at,0,id);
  }else if(target==="float"){
    WS.floats.push(id);
  }else{
    WS.hidden.push(id);
  }
  wsApply();
}
function wsLabel(id){
  const p=wsPlaceOf(id);
  return p==="dockL"?"gauche":p==="dockR"?"droite":p==="dockB"?"bas":
         p==="float"?"flottant":"masqué";
}

/* ==========================================================================
   Rendu de la disposition
   ========================================================================== */
let wsRaf=0;
function wsCanvasSync(){
  if(wsRaf)return;
  wsRaf=requestAnimationFrame(function(){wsRaf=0;if(typeof resize==="function")resize();});
}
function wsApply(save){
  const store=$("pnlStore"), fl=$("floatLayer");
  /* --- docks --- */
  for(const k of WS_DOCKS){
    const dk=$(k), ids=WS.order[k];
    /* on vide le dock sans détruire les panneaux */
    for(const ch of Array.prototype.slice.call(dk.children)){
      if(ch.classList.contains("psplit"))ch.remove();
      else store.appendChild(ch);
    }
    dk.classList.toggle("empty",!ids.length);
    if(k==="dockB")dk.style.height=WS.docks[k]+"px";
    else dk.style.width=WS.docks[k]+"px";
    ids.forEach(function(id,i){
      const el=wsEl[id];
      if(i){
        const sp=document.createElement("div");
        sp.className="psplit";sp.dataset.dock=k;sp.dataset.i=String(i-1);
        sp.addEventListener("pointerdown",wsSplitDown);
        dk.appendChild(sp);
      }
      el.classList.remove("floating");
      el.style.left=el.style.top=el.style.width=el.style.height="";
      el.style.zIndex="";
      el.style.flexGrow=String(WS.panels[id].grow);
      wsHandles(el,false);
      dk.appendChild(el);
    });
  }
  /* --- panneaux flottants --- */
  WS.floats.forEach(function(id,i){
    const el=wsEl[id], p=WS.panels[id];
    el.classList.add("floating");
    el.style.flexGrow="";
    p.x=Math.min(Math.max(0,p.x),Math.max(0,innerWidth-120));
    p.y=Math.min(Math.max(0,p.y),Math.max(0,innerHeight-40));
    el.style.left=Math.round(p.x)+"px";el.style.top=Math.round(p.y)+"px";
    el.style.width=Math.round(p.w)+"px";
    el.style.height=p.collapsed?"":Math.round(p.h)+"px";
    el.style.zIndex=String(10+i);
    wsHandles(el,true);
    fl.appendChild(el);
  });
  /* --- panneaux masqués --- */
  for(const id of WS.hidden){
    const el=wsEl[id];
    el.classList.remove("floating");
    el.style.left=el.style.top=el.style.width=el.style.height="";
    el.style.zIndex="";
    wsHandles(el,false);
    store.appendChild(el);
  }
  /* --- replié + poignées de dock --- */
  for(const id in WS.panels)
    wsEl[id].classList.toggle("collapsed",!!WS.panels[id].collapsed);
  document.querySelectorAll(".gut[data-dock]").forEach(function(g){
    g.classList.toggle("off",!WS.order[g.dataset.dock].length);
  });
  if(save!==false)wsSave();
  wsMenuSync();
  wsCanvasSync();
}
/* poignées de redimensionnement des fenêtres flottantes */
function wsHandles(el,on){
  const has=!!el.querySelector(":scope > .fres");
  if(on&&!has){
    for(const d of ["n","s","e","w","ne","nw","se","sw"]){
      const h=document.createElement("div");
      h.className="fres "+d;h.dataset.dir=d;
      h.addEventListener("pointerdown",wsFloatResizeDown);
      el.appendChild(h);
    }
  }else if(!on&&has){
    el.querySelectorAll(":scope > .fres").forEach(function(h){h.remove();});
  }
}

/* ==========================================================================
   Glisser-déposer d'un panneau
   ========================================================================== */
const wsDrag={id:null,on:false,x0:0,y0:0,dx:0,dy:0,target:null,index:-1};
function wsHeadDown(e){
  if(e.button!==0)return;
  if(e.target.closest("button,select,input,label,textarea"))return;
  const el=e.currentTarget.closest(".pnl"), id=el.dataset.pnl;
  wsDrag.id=id;wsDrag.on=false;wsDrag.x0=e.clientX;wsDrag.y0=e.clientY;
  wsDrag.target=null;wsDrag.index=-1;
  const r=el.getBoundingClientRect();
  wsDrag.dx=e.clientX-r.left;wsDrag.dy=e.clientY-r.top;
  if(wsPlaceOf(id)==="float")wsRaise(id);
  window.addEventListener("pointermove",wsHeadMove);
  window.addEventListener("pointerup",wsHeadUp,{once:true});
}
function wsHeadMove(e){
  const id=wsDrag.id;if(!id)return;
  if(!wsDrag.on){
    if(Math.abs(e.clientX-wsDrag.x0)+Math.abs(e.clientY-wsDrag.y0)<5)return;
    wsDrag.on=true;
    document.body.classList.add("ws-drag");
    wsEl[id].classList.add("dragging");
    if(wsPlaceOf(id)!=="float"){
      const g=$("dragGhost");
      g.textContent=wsEl[id].dataset.title;g.classList.add("on");
      wsEl[id].classList.add("drop-src");
    }
  }
  if(wsPlaceOf(id)==="float"){
    const p=WS.panels[id];
    p.x=e.clientX-wsDrag.dx;p.y=e.clientY-wsDrag.dy;
    wsEl[id].style.left=Math.round(p.x)+"px";
    wsEl[id].style.top=Math.round(p.y)+"px";
  }else{
    const g=$("dragGhost");
    g.style.left=(e.clientX+14)+"px";g.style.top=(e.clientY+12)+"px";
  }
  const hit=wsHit(e.clientX,e.clientY);
  wsDrag.target=hit.target;wsDrag.index=hit.index;
  wsShowZone(hit);
}
function wsHeadUp(e){
  window.removeEventListener("pointermove",wsHeadMove);
  const id=wsDrag.id;wsDrag.id=null;
  $("dragGhost").classList.remove("on");
  $("dropZone").classList.remove("on","line");
  document.body.classList.remove("ws-drag");
  if(!id)return;
  wsEl[id].classList.remove("dragging","drop-src");
  if(!wsDrag.on){wsApply();return;}
  wsDrag.on=false;
  const t=wsDrag.target;
  if(t==="float"){
    if(wsPlaceOf(id)==="float"){wsSave();wsApply();}
    else{
      const p=WS.panels[id], el=wsEl[id], r=el.getBoundingClientRect();
      p.w=Math.max(WS_MIN_FW,Math.round(r.width));
      p.h=Math.max(WS_MIN_FH,Math.round(r.height));
      p.x=e.clientX-Math.min(wsDrag.dx,p.w-40);p.y=e.clientY-wsDrag.dy;
      wsMove(id,"float");
      hint("Panneau « "+el.dataset.title+" » détaché : glissez-le vers un bord pour le rattacher.");
    }
  }else if(WS_DOCKS.indexOf(t)>=0){
    wsMove(id,t,wsDrag.index);
    hint("Panneau « "+wsEl[id].dataset.title+" » placé à "+wsLabel(id)+".");
  }else{
    wsApply();
  }
}
/* zone visée par le curseur */
function wsHit(x,y){
  const ws=$("ws").getBoundingClientRect();
  if(x<ws.left-40||x>ws.right+40||y<ws.top-40||y>ws.bottom+40)return {target:"float"};
  /* dock déjà occupé sous le curseur */
  for(const k of WS_DOCKS){
    if(!WS.order[k].length)continue;
    const r=$(k).getBoundingClientRect();
    if(x>=r.left-3&&x<=r.right+3&&y>=r.top-3&&y<=r.bottom+3)
      return {target:k,index:wsIndexIn(k,x,y)};
  }
  /* bandes de bord : le dock vide se recrée */
  if(y>ws.bottom-WS_EDGE&&!WS.order.dockB.length)return {target:"dockB",index:0};
  if(x<ws.left+WS_EDGE&&!WS.order.dockL.length)return {target:"dockL",index:0};
  if(x>ws.right-WS_EDGE&&!WS.order.dockR.length)return {target:"dockR",index:0};
  return {target:"float"};
}
function wsIndexIn(dock,x,y){
  const ids=WS.order[dock], horiz=dock==="dockB";
  let i=0;
  for(const pid of ids){
    const r=wsEl[pid].getBoundingClientRect();
    const mid=horiz?(r.left+r.width/2):(r.top+r.height/2);
    if((horiz?x:y)>mid)i++;else break;
  }
  return i;
}
/* aperçu de la cible */
function wsShowZone(hit){
  const z=$("dropZone");
  if(!hit||hit.target==="float"){z.classList.remove("on","line");return;}
  const dock=hit.target, ws=$("ws").getBoundingClientRect();
  if(WS.order[dock].length){
    const r=$(dock).getBoundingClientRect();
    const ids=WS.order[dock], horiz=dock==="dockB", i=Math.min(hit.index,ids.length);
    let pos;
    if(i>=ids.length){
      const q=wsEl[ids[ids.length-1]].getBoundingClientRect();
      pos=horiz?q.right:q.bottom;
    }else{
      const q=wsEl[ids[i]].getBoundingClientRect();
      pos=horiz?q.left:q.top;
    }
    z.classList.add("on","line");
    if(horiz){
      z.style.left=(pos-2)+"px";z.style.top=r.top+"px";
      z.style.width="4px";z.style.height=r.height+"px";
    }else{
      z.style.left=r.left+"px";z.style.top=(pos-2)+"px";
      z.style.width=r.width+"px";z.style.height="4px";
    }
    return;
  }
  /* dock vide : on montre la bande qu'il occuperait */
  const sz=WS.docks[dock];
  let r;
  if(dock==="dockL")r={left:ws.left,top:ws.top,width:sz,height:ws.height};
  else if(dock==="dockR")r={left:ws.right-sz,top:ws.top,width:sz,height:ws.height};
  else{
    const c=$("ctr").getBoundingClientRect();
    r={left:c.left,top:ws.bottom-sz,width:c.width,height:sz};
  }
  z.classList.add("on");z.classList.remove("line");
  z.style.left=r.left+"px";z.style.top=r.top+"px";
  z.style.width=r.width+"px";z.style.height=r.height+"px";
}
function wsRaise(id){
  const i=WS.floats.indexOf(id);
  if(i<0||i===WS.floats.length-1)return;
  WS.floats.splice(i,1);WS.floats.push(id);
  WS.floats.forEach(function(pid,j){wsEl[pid].style.zIndex=String(10+j);});
  wsSave();
}

/* ==========================================================================
   Redimensionnement
   ========================================================================== */
/* largeur (gauche/droite) ou hauteur (bas) d'un dock */
function wsGutDown(e){
  if(e.button!==0)return;
  const g=e.currentTarget, dock=g.dataset.dock;
  if(!WS.order[dock].length)return;
  const vert=dock!=="dockB", start=vert?e.clientX:e.clientY, base=WS.docks[dock];
  const sign=dock==="dockL"?1:-1;
  const ws=$("ws").getBoundingClientRect();
  const max=vert?Math.max(WS_MIN_DOCK,ws.width-320):Math.max(WS_MIN_DOCK,ws.height-200);
  g.classList.add("act");
  document.body.classList.add(vert?"ws-resize-v":"ws-resize-h");
  const mv=function(ev){
    const d=((vert?ev.clientX:ev.clientY)-start)*sign;
    WS.docks[dock]=Math.min(max,Math.max(WS_MIN_DOCK,Math.round(base+d)));
    const dk=$(dock);
    if(vert)dk.style.width=WS.docks[dock]+"px";else dk.style.height=WS.docks[dock]+"px";
    wsCanvasSync();
  };
  const up=function(){
    window.removeEventListener("pointermove",mv);
    g.classList.remove("act");
    document.body.classList.remove("ws-resize-v","ws-resize-h");
    wsSave();wsCanvasSync();
  };
  window.addEventListener("pointermove",mv);
  window.addEventListener("pointerup",up,{once:true});
  e.preventDefault();
}
/* partage entre deux panneaux d'un même dock */
function wsSplitDown(e){
  if(e.button!==0)return;
  const sp=e.currentTarget, dock=sp.dataset.dock, i=+sp.dataset.i;
  const ids=WS.order[dock];
  let a=-1,b=-1;
  for(let k=i;k>=0;k--)if(!WS.panels[ids[k]].collapsed){a=k;break;}
  for(let k=i+1;k<ids.length;k++)if(!WS.panels[ids[k]].collapsed){b=k;break;}
  if(a<0||b<0)return;
  const ida=ids[a], idb=ids[b], horiz=dock==="dockB";
  const ra=wsEl[ida].getBoundingClientRect(), rb=wsEl[idb].getBoundingClientRect();
  const sa=horiz?ra.width:ra.height, sb=horiz?rb.width:rb.height;
  const tot=sa+sb, gtot=WS.panels[ida].grow+WS.panels[idb].grow;
  if(tot<=WS_MIN_PNL*2)return;
  const start=horiz?e.clientX:e.clientY;
  sp.classList.add("act");
  document.body.classList.add(horiz?"ws-resize-v":"ws-resize-h");
  const mv=function(ev){
    const d=(horiz?ev.clientX:ev.clientY)-start;
    const na=Math.min(tot-WS_MIN_PNL,Math.max(WS_MIN_PNL,sa+d));
    WS.panels[ida].grow=gtot*na/tot;
    WS.panels[idb].grow=gtot-WS.panels[ida].grow;
    wsEl[ida].style.flexGrow=String(WS.panels[ida].grow);
    wsEl[idb].style.flexGrow=String(WS.panels[idb].grow);
  };
  const up=function(){
    window.removeEventListener("pointermove",mv);
    sp.classList.remove("act");
    document.body.classList.remove("ws-resize-v","ws-resize-h");
    wsSave();
  };
  window.addEventListener("pointermove",mv);
  window.addEventListener("pointerup",up,{once:true});
  e.preventDefault();
}
/* fenêtre flottante : huit poignées */
function wsFloatResizeDown(e){
  if(e.button!==0)return;
  const h=e.currentTarget, dir=h.dataset.dir, el=h.closest(".pnl"), id=el.dataset.pnl;
  const p=WS.panels[id], b={x:p.x,y:p.y,w:p.w,h:p.h};
  const sx=e.clientX, sy=e.clientY;
  wsRaise(id);
  const mv=function(ev){
    const dx=ev.clientX-sx, dy=ev.clientY-sy;
    if(dir.indexOf("e")>=0)p.w=Math.max(WS_MIN_FW,b.w+dx);
    if(dir.indexOf("s")>=0)p.h=Math.max(WS_MIN_FH,b.h+dy);
    if(dir.indexOf("w")>=0){
      const w=Math.max(WS_MIN_FW,b.w-dx);
      p.x=b.x+(b.w-w);p.w=w;
    }
    if(dir.indexOf("n")>=0){
      const hh=Math.max(WS_MIN_FH,b.h-dy);
      p.y=b.y+(b.h-hh);p.h=hh;
    }
    el.style.left=Math.round(p.x)+"px";el.style.top=Math.round(p.y)+"px";
    el.style.width=Math.round(p.w)+"px";el.style.height=Math.round(p.h)+"px";
  };
  const up=function(){window.removeEventListener("pointermove",mv);wsSave();};
  window.addEventListener("pointermove",mv);
  window.addEventListener("pointerup",up,{once:true});
  e.preventDefault();e.stopPropagation();
}

/* ==========================================================================
   Actions d'en-tête
   ========================================================================== */
function wsToggleCollapse(id){
  WS.panels[id].collapsed=!WS.panels[id].collapsed;
  wsApply();
}
function wsToggleFloat(id){
  if(wsPlaceOf(id)==="float"){
    const t=WS_DOCKS.indexOf(WS.panels[id].last)>=0?WS.panels[id].last:"dockR";
    wsMove(id,t);
    hint("Panneau « "+wsEl[id].dataset.title+" » rattaché à "+wsLabel(id)+".");
  }else{
    const r=wsEl[id].getBoundingClientRect(), p=WS.panels[id];
    if(r.width>40){
      p.w=Math.max(WS_MIN_FW,Math.round(r.width));
      p.h=Math.max(WS_MIN_FH,Math.round(r.height));
      p.x=Math.round(r.left+26);p.y=Math.round(r.top+26);
    }
    wsMove(id,"float");
    hint("Panneau « "+wsEl[id].dataset.title+" » détaché.");
  }
}
function wsClose(id){
  wsMove(id,"hidden");
  hint("Panneau « "+wsEl[id].dataset.title+" » fermé — le menu « Espace de travail » le rouvre.");
}
function wsShow(id){
  const t=WS_DOCKS.indexOf(WS.panels[id].last)>=0?WS.panels[id].last:"dockR";
  wsMove(id,t);
}

/* ==========================================================================
   Menu « espace de travail »
   ========================================================================== */
function wsMenuBuild(){
  let m=$("wsMenu");
  if(!m){m=document.createElement("div");m.id="wsMenu";document.body.appendChild(m);}
  let h='<div class="mtitle">Panneaux</div>';
  for(const id in WS.panels){
    const el=wsEl[id], vis=wsPlaceOf(id)!=="hidden";
    h+='<button class="mi'+(vis?"":" off")+'" data-tgl="'+id+'">'+
       '<span class="ck">'+(vis?"✓":"")+'</span>'+esc(el.dataset.title)+
       '<span class="st">'+wsLabel(id)+'</span></button>';
  }
  h+='<div class="msep"></div>'+
     '<button class="mi" data-cmd="all"><span class="ck"></span>Tout afficher</button>'+
     '<button class="mi" data-cmd="cols"><span class="ck"></span>Disposition en colonnes</button>'+
     '<button class="mi" data-cmd="reset"><span class="ck"></span>Réinitialiser la disposition</button>';
  m.innerHTML=h;
  m.querySelectorAll("[data-tgl]").forEach(function(b){
    b.onclick=function(){
      const id=b.dataset.tgl;
      if(wsPlaceOf(id)==="hidden")wsShow(id);else wsClose(id);
      wsMenuBuild().classList.add("on");
    };
  });
  m.querySelectorAll("[data-cmd]").forEach(function(b){
    b.onclick=function(){
      const c=b.dataset.cmd;
      if(c==="all"){
        for(const id of WS.hidden.slice())wsShow(id);
      }else if(c==="cols"){
        const d=wsDefault();
        WS.order=d.order;WS.floats=[];WS.hidden=[];WS.docks=d.docks;
        for(const id in WS.panels){
          WS.panels[id].collapsed=false;
          WS.panels[id].grow=d.panels[id].grow;
        }
        wsApply();hint("Disposition remise en colonnes.");
      }else if(c==="reset"){
        WS=wsDefault();wsApply();hint("Espace de travail réinitialisé.");
      }
      wsMenuClose();
    };
  });
  return m;
}
function wsMenuSync(){
  const m=$("wsMenu");
  if(m&&m.classList.contains("on"))wsMenuBuild().classList.add("on");
}
function wsMenuClose(){
  const m=$("wsMenu");if(m)m.classList.remove("on");
  $("bWs").classList.remove("on");
}
function wsMenuOpen(){
  const m=wsMenuBuild(), b=$("bWs"), r=b.getBoundingClientRect();
  m.classList.add("on");
  const w=m.offsetWidth||220, hg=m.offsetHeight||200;
  m.style.left=Math.max(6,Math.min(innerWidth-w-6,r.left))+"px";
  m.style.top=Math.max(6,Math.min(innerHeight-hg-6,r.bottom+5))+"px";
  b.classList.add("on");
}

/* ==========================================================================
   Démarrage
   ========================================================================== */
(function wsInit(){
  document.querySelectorAll("#pnlStore .pnl, .dock .pnl").forEach(function(el){
    const id=el.dataset.pnl;
    wsEl[id]=el;
    const head=el.querySelector(".pnl-head");
    head.addEventListener("pointerdown",wsHeadDown);
    head.addEventListener("dblclick",function(ev){
      if(ev.target.closest("button,select,input,label"))return;
      wsToggleCollapse(id);
    });
    el.querySelectorAll(".pnl-btn").forEach(function(b){
      b.onclick=function(ev){
        ev.stopPropagation();
        const a=b.dataset.act;
        if(a==="collapse")wsToggleCollapse(id);
        else if(a==="float")wsToggleFloat(id);
        else if(a==="close")wsClose(id);
      };
    });
    el.addEventListener("pointerdown",function(){
      if(wsPlaceOf(id)==="float")wsRaise(id);
    },true);
  });
  document.querySelectorAll(".gut[data-dock]").forEach(function(g){
    g.addEventListener("pointerdown",wsGutDown);
  });

  $("bWs").onclick=function(e){
    e.stopPropagation();
    const m=$("wsMenu");
    if(m&&m.classList.contains("on"))wsMenuClose();else wsMenuOpen();
  };
  document.addEventListener("pointerdown",function(e){
    const m=$("wsMenu");
    if(m&&m.classList.contains("on")&&!m.contains(e.target)&&e.target!==$("bWs"))
      wsMenuClose();
  });
  document.addEventListener("keydown",function(e){
    if(e.key!=="Escape")return;
    const m=$("wsMenu");
    if(m&&m.classList.contains("on")){wsMenuClose();e.stopPropagation();}
  },true);
  window.addEventListener("resize",function(){if(WS.floats.length)wsApply(false);});

  wsLoad();
  wsApply(false);
  if(typeof resize==="function")resize();
  if(typeof fit==="function")fit();
})();
