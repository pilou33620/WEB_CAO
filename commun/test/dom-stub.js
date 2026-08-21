/* =============================================================================
   commun/test/dom-stub.js
   DOM minimal partagé par les bancs d'essai des deux éditeurs.

   Ce n'est pas un navigateur : c'est juste assez d'arbre, de sélecteurs et
   d'écouteurs pour que le code de l'éditeur — y compris l'espace de travail,
   qui déplace vraiment ses panneaux d'un dock à l'autre — s'exécute sous Node.

   Ce qui est réellement simulé :
     · un arbre parent/enfants, avec appendChild / remove / contains ;
     · classList, dataset, style, innerHTML (texte brut, non analysé) ;
     · querySelector(All) et closest sur un sous-ensemble de sélecteurs CSS
       (tag, .classe, #id, [attr], [attr="val"], :scope, descendant et « > ») ;
     · localStorage et sessionStorage en mémoire : la persistance de la
       disposition d'un côté, le travail mis de côté en changeant d'outil de
       l'autre (commun/session.js) ;
     · un objet location, que session.js interroge pour savoir s'il tourne
       dans la version un seul fichier ;
     · les écouteurs de document / window / canevas, déclenchables à la main.

   Usage :
     const dom = require("../../commun/test/dom-stub.js").install({
       panels: {props:"Propriétés", list:"Nomenclature"},   // data-pnl -> titre
       canvasId: "board"                                    // canevas principal
     });
   ============================================================================= */
"use strict";

function noop(){}

/* ---------- contexte 2D factice ---------- */
/* getImageData n'est volontairement PAS fourni : le code de l'éditeur l'appelle
   dans un try/catch et retombe sur son mode dégradé quand la lecture de pixels
   est impossible. C'est le comportement attendu sans le module « canvas ». */
function ctxStub(){
  const c={};
  ["beginPath","moveTo","lineTo","arc","arcTo","closePath","fill","stroke","fillRect",
   "strokeRect","save","restore","translate","rotate","scale","setTransform","setLineDash",
   "drawImage","fillText","clearRect","measureText","quadraticCurveTo","createLinearGradient",
   "rect","ellipse","clip","bezierCurveTo","strokeText","createPattern","transform",
   "roundRect"]
   .forEach(k=>c[k]=noop);
  /* Largeur de texte approchée, à partir de la taille lue dans c.font : les
     symboles se dimensionnent d'après elle (un CI s'élargit pour contenir sa
     valeur), une constante rendrait ces essais aveugles. 0,55 em par caractère
     est l'ordre de grandeur d'une sans-serif ; on ne cherche pas le pixel, mais
     qu'un texte long soit plus large qu'un texte court. */
  c.font="";
  c.measureText=t=>{
    const m=/(\d+(?:\.\d+)?)px/.exec(String(c.font||""));
    const size=m?parseFloat(m[1]):12;
    return {width:String(t).length*size*0.55};
  };
  c.canvas={width:800,height:600};
  return c;
}

/* ==========================================================================
   Sélecteurs — sous-ensemble suffisant pour le code des éditeurs
   ========================================================================== */
const COMPOUND_RE=/([.#]?[\w-]+)|\[([\w-]+)(?:=\"?([^\]\"]*)\"?)?\]/g;

/* « div.cls#id[attr=val] » -> prédicat */
function parseCompound(txt){
  if(txt===":scope")return {scope:true};
  const c={tag:null,ids:[],classes:[],attrs:[]};
  COMPOUND_RE.lastIndex=0;
  let m;
  while((m=COMPOUND_RE.exec(txt))){
    if(m[1]){
      if(m[1][0]===".")c.classes.push(m[1].slice(1));
      else if(m[1][0]==="#")c.ids.push(m[1].slice(1));
      else c.tag=m[1].toUpperCase();
    }else{
      c.attrs.push({name:m[2],val:m[3]===undefined?null:m[3]});
    }
  }
  return c;
}
/* renvoie la suite des compounds du plus profond au plus haut, chacun portant
   le combinateur qui le relie au compound précédent (donc plus profond) */
function parseSelector(sel){
  const toks=sel.trim().replace(/\s*>\s*/g," > ").split(/\s+/).filter(Boolean);
  const seq=[];
  let comb=" ";
  for(const t of toks){
    if(t===">"){comb=">";continue;}
    seq.push({c:parseCompound(t),comb:comb});
    comb=" ";
  }
  return seq.reverse();
}
const _selCache=new Map();
function parseList(sel){
  const k=String(sel);
  if(!_selCache.has(k))_selCache.set(k,k.split(",").map(parseSelector));
  return _selCache.get(k);
}

function matchCompound(c,node,scope){
  if(!node||node.nodeType!==1)return false;
  if(c.scope)return node===scope;
  if(c.tag&&node.tagName!==c.tag)return false;
  for(const id of c.ids)if(node.id!==id)return false;
  for(const k of c.classes)if(!node.classList.contains(k))return false;
  for(const a of c.attrs){
    const v=node.getAttribute(a.name);
    if(v==null)return false;
    if(a.val!=null&&String(v)!==a.val)return false;
  }
  return true;
}
function matchSeq(seq,node,scope){
  if(!seq.length||!matchCompound(seq[0].c,node,scope))return false;
  let cur=node;
  for(let i=1;i<seq.length;i++){
    const comb=seq[i-1].comb;          // relie seq[i] (au-dessus) à seq[i-1]
    cur=cur.parentNode;
    if(comb===">"){
      if(!matchCompound(seq[i].c,cur,scope))return false;
    }else{
      while(cur&&!matchCompound(seq[i].c,cur,scope))cur=cur.parentNode;
      if(!cur)return false;
    }
  }
  return true;
}
function matches(sel,node,scope){
  return parseList(sel).some(seq=>matchSeq(seq,node,scope));
}

function dashToCamel(s){return s.replace(/-([a-z])/g,(m,c)=>c.toUpperCase());}

/* ==========================================================================
   Installation
   ========================================================================== */
function install(opts){
  opts=opts||{};
  let realCanvas=null;
  try{realCanvas=require("canvas");}catch(e){}

  const listeners={doc:{},cv:{},win:{}};
  const byId=new Map();
  /* l'élément qui a le focus, ou null pour le corps de page */
  let focused=null;

  function descendants(root){
    const out=[];
    (function walk(n){for(const c of n.children){out.push(c);walk(c);}})(root);
    return out;
  }

  function el(tag,id){
    const e={
      nodeType:1,
      tagName:String(tag||"div").toUpperCase(),
      id:id||"",
      _html:"",_attrs:{},_cls:new Set(),
      textContent:"",value:"",checked:false,files:[],dataset:{},
      children:[],parentNode:null,
      style:{},width:800,height:600,
      clientWidth:800,clientHeight:600,offsetWidth:220,offsetHeight:200,
      options:[],selectedIndex:-1,disabled:false
    };
    e.classList={
      add:function(){for(const k of arguments)if(k)e._cls.add(k);},
      remove:function(){for(const k of arguments)e._cls.delete(k);},
      toggle:(k,on)=>{
        const v=(on===undefined)?!e._cls.has(k):!!on;
        if(v)e._cls.add(k);else e._cls.delete(k);
        return v;
      },
      contains:k=>e._cls.has(k)
    };
    e.setAttribute=(k,v)=>{
      e._attrs[k]=String(v);
      if(k==="id")e.id=String(v);
      else if(k==="class")e._cls=new Set(String(v).split(/\s+/).filter(Boolean));
      else if(k.indexOf("data-")===0)e.dataset[dashToCamel(k.slice(5))]=String(v);
    };
    e.getAttribute=k=>{
      if(k==="id")return e.id||null;
      if(k==="class"){const s=[...e._cls].join(" ");return s||null;}
      if(k.indexOf("data-")===0){
        const v=e.dataset[dashToCamel(k.slice(5))];
        if(v!==undefined)return String(v);
      }
      return e._attrs[k]===undefined?null:e._attrs[k];
    };
    e.appendChild=c=>{
      if(!c||c.nodeType!==1)return c;
      if(c.parentNode)c.parentNode.removeChild(c);
      c.parentNode=e;e.children.push(c);
      return c;
    };
    e.removeChild=c=>{
      const i=e.children.indexOf(c);
      if(i>=0){e.children.splice(i,1);c.parentNode=null;}
      return c;
    };
    e.remove=()=>{if(e.parentNode)e.parentNode.removeChild(e);};
    e.contains=n=>{for(let p=n;p;p=p.parentNode)if(p===e)return true;return false;};
    e.querySelectorAll=sel=>descendants(e).filter(n=>matches(sel,n,e));
    e.querySelector=sel=>e.querySelectorAll(sel)[0]||null;
    e.closest=sel=>{
      for(let p=e;p;p=p.parentNode)if(p.nodeType===1&&matches(sel,p,e))return p;
      return null;
    };
    e.matches=sel=>matches(sel,e,e);
    e.addEventListener=noop;e.removeEventListener=noop;
    /* Le focus est modélisé : les raccourcis d'une seule touche se taisent
       lorsqu'un champ l'a, et un clic sur le plan de travail doit le rendre.
       Sans cela l'essai ne verrait pas la différence. */
    e.focus=()=>{focused=e;};
    e.blur=()=>{if(focused===e)focused=null;};
    e.select=noop;e.click=noop;
    /* <dialog> : ouvert/fermé sans rien afficher — le banc d'essai déclenche
       lui-même le bouton voulu (voir dom.dialog()) */
    e.open=false;
    e.showModal=()=>{e.open=true;};
    e.show=()=>{e.open=true;};
    e.close=()=>{e.open=false;};
    e.setPointerCapture=noop;e.releasePointerCapture=noop;
    e.getContext=()=>ctxStub();
    e.getBoundingClientRect=()=>({left:0,top:0,right:800,bottom:600,width:800,height:600});
    e.toBlob=cb=>cb({});
    e.parentElement={getBoundingClientRect:()=>({width:800,height:600})};
    /* className et classList vues sur le même jeu de classes */
    Object.defineProperty(e,"className",{
      get(){return [...e._cls].join(" ");},
      set(v){e._cls=new Set(String(v).split(/\s+/).filter(Boolean));}
    });
    /* innerHTML garde le texte injecté sans l'analyser : les essais vérifient
       ce que le code produit, pas l'arbre qu'un navigateur en tirerait */
    Object.defineProperty(e,"innerHTML",{
      get(){return e._html;},
      set(v){
        e._html=String(v);
        for(const c of e.children)c.parentNode=null;
        e.children=[];
      }
    });
    return e;
  }

  /* ---------- arbre : ce que la page fournit à l'espace de travail ---------- */
  function mk(tag,id,cls,data){
    const e=el(tag,id);
    if(id)byId.set(id,e);
    if(cls)cls.split(" ").forEach(k=>e.classList.add(k));
    if(data)for(const k in data)e.dataset[k]=data[k];
    return e;
  }
  const body=mk("body","");
  const ws=mk("section","ws");
  const ctr=mk("div","ctr");
  const docks={dockL:mk("aside","dockL","dock"),
               dockR:mk("aside","dockR","dock"),
               dockB:mk("aside","dockB","dock")};
  const store=mk("div","pnlStore");
  const floatLayer=mk("div","floatLayer");
  body.appendChild(ws);
  ws.appendChild(docks.dockL);ws.appendChild(ctr);ws.appendChild(docks.dockR);
  ws.appendChild(docks.dockB);
  body.appendChild(store);body.appendChild(floatLayer);
  body.appendChild(mk("div","dragGhost"));
  body.appendChild(mk("div","dropZone"));
  for(const k in docks)ws.appendChild(mk("div","gut-"+k,"gut",{dock:k}));

  /* les panneaux vivent d'abord dans le magasin ; wsApply() les répartit */
  const panels={};
  for(const id in (opts.panels||{})){
    const p=mk("section","pnl-"+id,"pnl",{pnl:id,title:opts.panels[id]});
    p.appendChild(mk("div","","pnl-head"));
    store.appendChild(p);
    panels[id]=p;
  }

  /* ---------- document / window ---------- */
  const doc={
    nodeType:9,
    body:body,
    documentElement:body,
    get activeElement(){return focused||body;},
    visibilityState:"visible",
    getElementById(id){
      if(!byId.has(id))byId.set(id,el("div",id));
      return byId.get(id);
    },
    createElement(t){
      if(t==="canvas"&&realCanvas){
        /* canevas logiciel : la rasterisation des îlots est testée pour de vrai */
        const cv=realCanvas.createCanvas(1,1);
        cv.toBlob=cb=>cb({});
        return cv;
      }
      const e=el(t,"");
      if(t==="canvas"){e.width=1;e.height=1;}
      return e;
    },
    createTextNode(t){const e=el("span","");e.textContent=String(t);return e;},
    querySelectorAll(sel){return descendants(body).filter(n=>matches(sel,n,body));},
    querySelector(sel){return doc.querySelectorAll(sel)[0]||null;},
    addEventListener(t,f){(listeners.doc[t]=listeners.doc[t]||[]).push(f);},
    removeEventListener(t,f){
      const a=listeners.doc[t]||[], i=a.indexOf(f);
      if(i>=0)a.splice(i,1);
    }
  };
  const win={
    devicePixelRatio:1,innerWidth:1280,innerHeight:800,
    addEventListener(t,f){(listeners.win[t]=listeners.win[t]||[]).push(f);},
    removeEventListener(t,f){
      const a=listeners.win[t]||[], i=a.indexOf(f);
      if(i>=0)a.splice(i,1);
    }
  };

  /* ---------- stockages en mémoire ---------- */
  /* Deux stockages distincts, comme dans un navigateur : localStorage pour ce
     qui survit à la fermeture (disposition des panneaux, bibliothèque
     d'empreintes), sessionStorage pour ce qui ne vit que le temps de l'onglet
     (le travail mis de côté en changeant d'outil, commun/session.js). */
  function memStorage(){
    const mem=new Map();
    return {
      getItem:k=>mem.has(String(k))?mem.get(String(k)):null,
      setItem:(k,v)=>{mem.set(String(k),String(v));},
      removeItem:k=>{mem.delete(String(k));},
      clear:()=>mem.clear(),
      _map:mem
    };
  }
  const storage=memStorage();
  const session=memStorage();

  /* ---------- globales ---------- */
  global.document=doc;
  global.window=win;
  global.innerWidth=win.innerWidth;
  global.innerHeight=win.innerHeight;
  global.localStorage=storage;
  global.sessionStorage=session;
  /* window.sessionStorage : c'est par là que passe commun/session.js, qui teste
     d'abord si le stockage répond avant de s'en servir */
  win.localStorage=storage;
  win.sessionStorage=session;
  /* une adresse plausible : session.js y lit s'il tourne dans la version un
     seul fichier (dist/), auquel cas il efface sa barre de navigation */
  const loc={protocol:"http:",host:"localhost:8000",pathname:"/editeur/page.html",
             href:"http://localhost:8000/editeur/page.html"};
  global.location=loc;win.location=loc;
  /* navigator est en lecture seule sur les Node récents : on ne le remplace pas,
     on ajoute seulement ce qui manque */
  if(!global.navigator)global.navigator={userAgent:"node"};
  if(!global.navigator.clipboard){
    try{global.navigator.clipboard={writeText:()=>Promise.resolve()};}catch(e){}
  }
  global.alert=m=>console.log("[alert]",m);
  global.confirm=()=>true;
  global.prompt=()=>null;
  global.URL={createObjectURL:()=>"blob:x",revokeObjectURL:noop};
  global.Blob=function(){};
  global.FileReader=function(){this.readAsText=()=>{};this.readAsDataURL=()=>{};};
  global.Image=function(){};
  /* fetch : sert le contenu déclaré dans opts.files (chemin -> texte) et
     répond 404 pour le reste — un éditeur ouvert hors ligne voit la même chose. */
  const served=opts.files||{};
  global.fetch=url=>{
    const key=String(url);
    const hit=Object.prototype.hasOwnProperty.call(served,key)?served[key]:null;
    return Promise.resolve(hit==null
      ? {ok:false,status:404,text:()=>Promise.resolve("")}
      : {ok:true,status:200,text:()=>Promise.resolve(hit)});
  };
  global.requestAnimationFrame=f=>{f(0);return 1;};
  global.cancelAnimationFrame=noop;
  global.matchMedia=()=>({matches:false,addEventListener:noop});

  /* le canevas principal enregistre ses écouteurs pour qu'on les déclenche */
  let canvas=null;
  if(opts.canvasId){
    canvas=doc.getElementById(opts.canvasId);
    canvas.addEventListener=(t,f)=>{(listeners.cv[t]=listeners.cv[t]||[]).push(f);};
  }

  /* ---------- déclencheurs ---------- */
  function fireOn(bag,t,ev){
    (bag[t]||[]).slice().forEach(f=>f(Object.assign({
      button:0,clientX:0,clientY:0,pointerId:1,shiftKey:false,altKey:false,
      ctrlKey:false,metaKey:false,preventDefault:noop,stopPropagation:noop,
      target:body,currentTarget:body
    },ev)));
  }

  const api={
    ctxStub:ctxStub,realCanvas:realCanvas,listeners:listeners,el:el,matches:matches,
    document:doc,window:win,body:body,ws:ws,ctr:ctr,docks:docks,
    store:store,floatLayer:floatLayer,panels:panels,storage:storage,
    session:session,location:loc,canvas:canvas,
    fire:(t,ev)=>fireOn(listeners.cv,t,ev),
    fireDoc:(t,ev)=>fireOn(listeners.doc,t,ev),
    fireWin:(t,ev)=>fireOn(listeners.win,t,ev),
    key:(k,mod)=>fireOn(listeners.doc,"keydown",
      Object.assign({key:k,target:{tagName:"BODY"}},mod||{})),
    /* identifiants des panneaux d'un dock, dans l'ordre d'affichage */
    dockIds:name=>docks[name].children
      .filter(c=>c.classList.contains("pnl")).map(c=>c.dataset.pnl),
    /* la dernière boîte <dialog> encore ouverte dans le corps du document */
    dialog:()=>body.children.filter(c=>c.tagName==="DIALOG"&&c.open).pop()||null
  };
  return api;
}

module.exports={install:install,ctxStub:ctxStub,matches:matches};
