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
   deux-points ou parenthèse. Elle range la liste ; le code stable (`drcKind`),
   lui, sert aux exclusions. */
function drcCategorie(e){
  return (String(e.msg).split(/[:(0-9]/)[0].replace(/\s+(sur|de|du|des|à|entre)\s*$/i,"").trim())||"Divers";
}
/* ---------- code stable et exclusions ----------
   Chaque écart reçoit un code (`kind`) : celui que pose le contrôle, sinon
   celui que la table tire du début de son message (premier motif qui va).
   Le code, l'endroit et la couche font la clé d'une exclusion : gardée dans
   la carte avec sa raison, elle retire l'écart de la liste, des marqueurs et
   des comptes. Le défaut déplacé, la clé change et il revient, comme chez KiCad. */
const DRC_CODES=[
  [/^Isolation /,"isolation"],[/^Pastilles trop proches/,"isolation-pastilles"],[/^Pastilles superposées/,"court-circuit"],
  [/^Micro-vias ni empilés/,"micro-via-decale"],[/^Micro-vias empilés/,"micro-via-empile"],
  [/^(Trou NPTH|Via|Piste|Pastille) .*hors du contour/,"bord"],
  [/^(Cuivre|Pastille .*) trop proche du trou|^Trou NPTH/,"trou"],
  [/^Fente/,"fente"],[/^Piste de .* sous /,"largeur"],[/^Piste sans net/,"sans-net"],
  [/^Décrochement/,"echarde"],[/^Segment à/,"angle-libre"],[/^Angle aigu/,"angle-aigu"],
  [/^Liaison thermique/,"thermique"],[/^Sérigraphie sur le cuivre/,"serigraphie-cuivre"],
  [/^Zone de cuivre sans net/,"zone-sans-net"],[/^Zone débordant/,"zone-bord"],[/^Zone .* îlots/,"zone-ilots"],[/^Îlot de cuivre/,"ilot-mort"],
  [/^Composants qui se chevauchent/,"chevauchement"],[/^Rapport d'aspect|perçage\(s\) de/,"rapport-aspect"],
  [/^Via L\d/,"via-pressage"],[/^Contre-perçage/,"contre-percage"],[/ annoncée « /,"role-couche"],[/^Liaison non routée/,"non-routee"]
];
function drcSlug(t){
  return String(t).normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,40)||"divers";
}
function drcKind(e){
  if(e.kind)return e.kind;
  const m=String(e.msg||"");
  for(const [rx,k] of DRC_CODES)if(rx.test(m))return k;
  return "autre-"+drcSlug(drcCategorie(e));
}
function drcCle(e){
  return drcKind(e)+"@"+r2(+e.x||0)+","+r2(+e.y||0)+"@"+(Number.isInteger(e.l)?e.l:"");
}
const DRC_CLE_RX=/^[a-z0-9-]{1,48}@-?\d+(\.\d+)?,-?\d+(\.\d+)?@\d{0,2}$/;
/* lecture d'un fichier : des clés bien formées, une raison courte, bornées */
function drcExclusNorm(a){
  if(!Array.isArray(a))return [];
  const vu=new Set(), out=[];
  for(const x of a.slice(0,2000)){
    if(!x||typeof x!=="object"||typeof x.cle!=="string"||!DRC_CLE_RX.test(x.cle)||vu.has(x.cle))continue;
    vu.add(x.cle);
    out.push({cle:x.cle,msg:String(x.msg==null?"":x.msg).slice(0,300),note:String(x.note==null?"":x.note).slice(0,300)});
  }
  return out;
}
/* ---------- gravité par contrôle ----------
   Comme les « severities » de KiCad : un code peut passer en erreur, en
   remarque, ou être ignoré ; gardé dans la carte (`S.drcGravites`, code →
   gravité). Un code absent garde la gravité que le contrôle lui donne. */
const DRC_GRAVITES={erreur:"Erreur",remarque:"Remarque",ignore:"Ignoré"};
function drcGravitesNorm(o){
  const r={};
  if(!o||typeof o!=="object"||Array.isArray(o))return r;
  for(const [k,v] of Object.entries(o).slice(0,200))
    if(/^[a-z0-9-]{1,48}$/.test(k)&&Object.prototype.hasOwnProperty.call(DRC_GRAVITES,v))r[k]=v;
  return r;
}
function drcGravite(kind){
  const g=S.drcGravites||{};
  return Object.prototype.hasOwnProperty.call(g,kind)?g[kind]:"";
}
/* appelé par runDrc : pose les codes et les gravités choisies, écarte les
   ignorés et les exclus (gardés à part pour la fenêtre) */
function drcTrier(out){
  const ex=new Map((S.drcExclus||[]).map(x=>[x.cle,x]));
  const garde=[], exclus=[], vus=new Map();
  let ignores=0;
  for(const e of out){
    e.kind=drcKind(e);
    if(!vus.has(e.kind))vus.set(e.kind,{n:0,msg:e.msg,info:!!e.info});
    vus.get(e.kind).n++;
    const g=drcGravite(e.kind);
    if(g==="ignore"){ignores++;continue;}
    if(g==="erreur")delete e.info;else if(g==="remarque")e.info=true;
    const x=ex.get(drcCle(e));
    if(x){e.exclu=x.note||"";exclus.push(e);}else garde.push(e);
  }
  S.drcExclues=exclus;S.drcVus=vus;S.drcIgnores=ignores;
  return garde;
}
/* La fenêtre des gravités : les codes du dernier contrôle et ceux déjà réglés. */
function drcGravitesCodes(){
  const m=new Map(S.drcVus||[]);
  for(const k of Object.keys(S.drcGravites||{}))if(!m.has(k))m.set(k,{n:0,msg:"",info:false});
  return [...m].sort((a,b)=>a[0].localeCompare(b[0]));
}
function drcGravitesAppliquer(o){
  push();
  S.drcGravites=drcGravitesNorm(o);
  runDrc();
}
function drcGravitesOuvrir(){
  if(typeof document==="undefined")return;
  const codes=drcGravitesCodes();
  const d=document.createElement("dialog");
  d.className="ed-dlg";
  d.innerHTML='<div class="mtitle">Gravité des contrôles DRC</div>'+
    (codes.length?'':'<div class="empty">Lancez d\'abord le contrôle : les codes relevés s\'affichent ici.</div>')+
    '<div style="max-height:60vh;overflow:auto">'+codes.map(([k,v],i)=>
      '<div class="prop two" title="'+esc(v.msg||k)+'"><label>'+esc(k)+(v.n?' <span style="color:var(--txt-dim)">('+v.n+')</span>':'')+'</label>'+
      '<select data-k="'+esc(k)+'"><option value="">par défaut ('+(v.info?"remarque":"erreur")+')</option>'+
      Object.entries(DRC_GRAVITES).map(([g,n])=>'<option value="'+g+'"'+(drcGravite(k)===g?" selected":"")+'>'+n+'</option>').join("")+
      '</select></div>').join("")+'</div>'+
    '<div class="row"><button class="tb" id="dgNon">Annuler</button><button class="tb" id="dgOui">Appliquer</button></div>';
  document.body.appendChild(d);
  if(!d.querySelector("#dgNon"))return;          // DOM sans rendu (banc d'essai)
  const fermer=()=>{d.close();d.remove();};
  d.querySelector("#dgNon").onclick=fermer;
  d.addEventListener("cancel",e=>{e.preventDefault();fermer();});
  d.querySelector("#dgOui").onclick=()=>{
    const o={};
    d.querySelectorAll("select[data-k]").forEach(s=>{if(s.value)o[s.dataset.k]=s.value;});
    fermer();drcGravitesAppliquer(o);refreshPanels();draw();
  };
  d.showModal();
}
function drcExclure(e,note){
  if(!e)return false;
  const cle=drcCle(e);
  push();
  S.drcExclus=(S.drcExclus||[]).filter(x=>x.cle!==cle)
    .concat([{cle,msg:String(e.msg||"").slice(0,300),note:String(note==null?"":note).slice(0,300)}]);
  if(S.drcSel===e)S.drcSel=null;
  runDrc();
  return true;
}
function drcRetablir(cle){
  if(!(S.drcExclus||[]).some(x=>x.cle===cle))return false;
  push();
  S.drcExclus=S.drcExclus.filter(x=>x.cle!==cle);
  runDrc();
  return true;
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
      '<button class="tb mini" id="drcwGrav" title="Gravité de chaque contrôle : erreur, remarque ou ignoré (gardée dans la carte)">⚙</button>'+
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
    q("drcwGrav").onclick=drcGravitesOuvrir;
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
  const durs=S.drc.filter(e=>!e.info).length, rq=S.drc.length-durs, nx=(S.drcExclues||[]).length;
  q("drcwNb").textContent=!S.drcRun?" — non lancé":
    " — "+durs+" erreur"+(durs>1?"s":"")+(rq?", "+rq+" remarque"+(rq>1?"s":""):"")+(nx?", "+nx+" exclu"+(nx>1?"s":""):"")+(S.drcIgnores?", "+S.drcIgnores+" ignoré"+(S.drcIgnores>1?"s":""):"");
  const g=drcRangs(), tous=[].concat(...g.values());
  const i=tous.indexOf(S.drcSel);
  q("drcwPos").textContent=tous.length?(i<0?"–":(i+1))+" / "+tous.length:"0";
  const box=q("drcwList");
  if(!S.drcRun){box.innerHTML='<div class="empty">Contrôle non lancé.</div>';return;}
  const exclues=S.drcExclues||[];
  if(!tous.length&&!exclues.length){box.innerHTML='<div class="empty ok">Aucune erreur détectée.</div>';return;}
  let h=tous.length?"":'<div class="empty ok">Aucune erreur détectée hors exclusions.</div>', idx=[];
  for(const [k,es] of g){
    const ferme=!!DRCW.ferme[k];
    h+='<div class="drcw-cat" data-k="'+esc(k)+'">'+(ferme?"▸":"▾")+' '+esc(k)+' <span>'+es.length+'</span></div>';
    if(ferme)continue;
    for(const e of es.slice(0,DRCW_MAX)){
      h+='<div class="drcw-row'+(e===S.drcSel?" on":"")+(e.info?" info":"")+'" data-i="'+idx.length+'">'+
         '<button class="tb mini drcw-ex" data-x="'+idx.length+'" title="Exclure cet écart (voulu) : il quitte la liste, sa raison reste dans la carte">⊘</button>'+esc(e.msg)+
         '<span>'+fmt(ux(e.x),2)+" ; "+fmt(uy(e.y),2)+" mm"+(e.l!=null&&e.l<S.cu?" · "+cuId(e.l,S.cu):"")+
         (e.aire?" · "+fmt(e.aire,2)+" mm²":"")+'</span></div>';
      idx.push(e);
    }
    if(es.length>DRCW_MAX)h+='<div class="empty">… '+(es.length-DRCW_MAX)+' de plus, à parcourir avec ◀ ▶</div>';
  }
  if(exclues.length){
    const ferme=DRCW.ferme["\u0000exclus"]!==false;        // repliée d'office
    h+='<div class="drcw-cat" data-k="\u0000exclus">'+(ferme?"▸":"▾")+' Exclus <span>'+exclues.length+'</span></div>';
    if(!ferme)for(const e of exclues.slice(0,DRCW_MAX))
      h+='<div class="drcw-row info"><button class="tb mini drcw-ret" data-cle="'+esc(drcCle(e))+'" title="Rétablir : l\'écart revient dans la liste">↺</button>'+
         esc(e.msg)+'<span>'+(e.exclu?"raison : "+esc(e.exclu):"sans raison donnée")+'</span></div>';
  }
  box.innerHTML=h;
  box.querySelectorAll(".drcw-ex").forEach(b=>b.onclick=ev=>{
    ev.stopPropagation();
    const e=idx[+b.dataset.x], note=typeof prompt==="function"?prompt("Raison de l'exclusion (gardée dans la carte) :",""):"";
    if(note===null)return;
    drcExclure(e,note);refreshPanels();draw();
  });
  box.querySelectorAll(".drcw-ret").forEach(b=>b.onclick=ev=>{ev.stopPropagation();drcRetablir(b.dataset.cle);refreshPanels();draw();});
  box.querySelectorAll(".drcw-cat").forEach(d=>d.onclick=()=>{
    const k=d.dataset.k;
    DRCW.ferme[k]=k==="\u0000exclus"?DRCW.ferme[k]===false:!DRCW.ferme[k];
    drcFenetreMaj();
  });
  box.querySelectorAll(".drcw-row").forEach(r=>r.onclick=()=>drcAller(idx[+r.dataset.i]));
  const on=box.querySelector(".drcw-row.on");
  if(on&&on.scrollIntoView)on.scrollIntoView({block:"nearest"});
}
