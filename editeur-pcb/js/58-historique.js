"use strict";
/* ==========================================================================
   Historique visuel : la frise des étapes, en bas du canevas
   --------------------------------------------------------------------------
   Les étapes sont celles de Ctrl+Z (`S.undo`, l'état courant, `S.redo`) : rien
   de plus n'est enregistré. Chaque étape se nomme d'après ce qui a changé entre
   deux instantanés (`histoNommer`) : composants ajoutés, tournés, retournés,
   déplacés, pistes posées ou retirées par net, vias, zones, découpes, contour.
   Les tracés successifs d'un même net font une seule icône : un routage ne
   noie pas la frise. Un toucher sur une icône rend la carte telle qu'elle était
   après cette étape ; le curseur jaune se glisse pour remonter le temps.
   ========================================================================== */
const HISTO_CLE="cao.pcb.historique";
var HISTO_OUVERT=(()=>{try{return localStorage.getItem(HISTO_CLE)!=="0";}catch(_){return true;}})();
var _histoT=null, _histoEtapes=[];   // var : touch() appelle histoPlanifier avant le chargement de ce fichier
var _histoResume=new Map();     // instantané → résumé, purgé à chaque rendu
var _histoReperes=new Map(), _histoSt=[], _histoCour=null;   // repères : empreinte d'un état → nom ; les états de la frise
/* Empreinte d'un état (FNV-1a, espaces finaux ignorés : un lot de Claude en ajoute une). */
function histoHash(t){
  let e=t.length;
  while(e&&t.charCodeAt(e-1)===32)e--;
  let h=0x811c9dc5;
  for(let i=0;i<e;i++){h^=t.charCodeAt(i);h=Math.imul(h,16777619);}
  return (h>>>0).toString(36)+":"+e;
}

/* Ce qu'il faut d'un instantané pour nommer une étape : petit, gardé en cache. */
function histoResume(txt){
  let r=_histoResume.get(txt);
  if(r)return r;
  let d={};
  try{d=JSON.parse(txt)||{};}catch(_){}
  const fps=new Map(), tr=new Map(), vi=new Map(), zo=new Map(), cu=new Map(), autres=new Map();
  for(const f of d.fps||[])fps.set(f.id,{ref:f.ref||"?",x:f.x,y:f.y,rot:f.rot||0,side:f.side?1:0,j:JSON.stringify(f)});
  const compter=(M,k,net)=>{const o=M.get(k);if(o)o.n++;else M.set(k,{n:1,net:net||""});};
  // la géométrie d'abord, le net (texte libre) en dernier : l'aperçu relit la clé
  for(const t of d.tracks||[])compter(tr,[t.l,t.x1,t.y1,t.x2,t.y2,t.w,t.net].join("|"),t.net);
  for(const v of d.vias||[])compter(vi,[v.x,v.y,v.a,v.b,v.net].join("|"),v.net);
  for(const z of d.zones||[])zo.set(z.id,{l:z.l,net:z.net||"",j:JSON.stringify(z)});
  for(const c of d.cuts||[])cu.set(c.id,{l:c.l,j:JSON.stringify(c)});
  for(const k of ["drawings","holes"])autres.set(k,JSON.stringify(d[k]||[]));
  r={fps,tr,vi,zo,cu,autres,board:JSON.stringify(d.board||null),cuL:(d.cuL||[]).map(L=>L&&L.name||""),h:histoHash(txt)};
  _histoResume.set(txt,r);
  return r;
}
/* Par net, ce que B a de plus que A (multiensembles de pistes ou de vias). */
function histoEnPlus(A,B){
  const out=new Map();
  for(const [k,o] of B){const m=o.n-((A.get(k)||{}).n||0);if(m>0)out.set(o.net,(out.get(o.net)||0)+m);}
  return out;
}
const HISTO_COUL={route:"#e8443a",fp:"#3fa0ea",via:"#f2c230",zone:"#3fa0ea",cut:"#c9ced6",der:"#e8443a",autre:"#c9ced6"};
function histoNommer(a,b){
  const nomL=l=>b.cuL[l]||a.cuL[l]||"L"+(l+1);
  const refs=L=>L.length>3?L.length+" composants":L.join(", ");
  const pl=(n,mot)=>n+" "+mot+(n>1?"s":"");
  const aj=[],re=[],rot=[],face=[],dep=[],mod=[];
  for(const [id,f] of b.fps){
    const o=a.fps.get(id);
    if(!o){aj.push(f.ref);continue;}
    if(o.j===f.j)continue;
    if(o.side!==f.side)face.push(f.ref);
    else if(o.rot!==f.rot)rot.push(f.ref);
    else if(o.x!==f.x||o.y!==f.y)dep.push(f.ref);
    else mod.push(f.ref);
  }
  for(const [id,o] of a.fps)if(!b.fps.has(id))re.push(o.ref);
  if(re.length)return {ico:"🗑",lib:"Supprimer",det:refs(re),cat:"der"};
  if(aj.length)return {ico:"▦",lib:aj.length>1?"Composants placés":"Composant placé",det:refs(aj),cat:"fp"};
  if(face.length)return {ico:"⇋",lib:"Retourner",det:refs(face),cat:"fp"};
  if(rot.length)return {ico:"⟳",lib:"Pivoter",det:refs(rot),cat:"fp"};
  if(dep.length)return {ico:"✥",lib:"Déplacer",det:refs(dep),cat:"fp"};
  if(mod.length)return {ico:"✎",lib:"Modifier",det:refs(mod),cat:"fp"};
  const pA=histoEnPlus(a.tr,b.tr), pR=histoEnPlus(b.tr,a.tr);
  const nA=[...pA.values()].reduce((s,n)=>s+n,0), nR=[...pR.values()].reduce((s,n)=>s+n,0);
  if(nA||nR){
    // le net qui gagne le plus de pistes : celui qu'on route (la poussée retire et repose les voisins)
    let net=null, gain=0;
    for(const [k,n] of pA){const g=n-(pR.get(k)||0);if(g>gain){gain=g;net=k;}}
    if(net!=null)return {ico:"╱",lib:"Routage",det:(net||"sans net")+" · "+pl(gain,"piste"),cat:"route",net:net||"",n:gain};
    if(nR>nA){
      const nets=[...pR.keys()];
      return {ico:"✂",lib:"Dérouter",det:(nets.length===1?(nets[0]||"sans net")+" · ":"")+pl(nR-nA,"piste"),cat:"der"};
    }
    return {ico:"╱",lib:"Pistes modifiées",det:pl(Math.max(nA,1),"piste"),cat:"route"};
  }
  const vA=histoEnPlus(a.vi,b.vi), vR=histoEnPlus(b.vi,a.vi);
  if(vA.size&&!vR.size){const nets=[...vA.keys()];return {ico:"◉",lib:"Via",det:nets.length===1?nets[0]||"sans net":pl([...vA.values()].reduce((s,n)=>s+n,0),"via"),cat:"via"};}
  if(vR.size&&!vA.size)return {ico:"◉",lib:"Supprimer via",det:pl([...vR.values()].reduce((s,n)=>s+n,0),"via"),cat:"der"};
  if(vA.size)return {ico:"◉",lib:"Vias déplacés",det:"",cat:"via"};
  for(const [id,z] of b.zo){
    const o=a.zo.get(id);
    if(!o)return {ico:"▭",lib:"Zone",det:(z.net||"sans net")+" · "+nomL(z.l),cat:"zone"};
    if(o.j!==z.j)return {ico:"▭",lib:"Zone modifiée",det:(z.net||"sans net")+" · "+nomL(z.l),cat:"zone"};
  }
  for(const [id,z] of a.zo)if(!b.zo.has(id))return {ico:"▭",lib:"Supprimer zone",det:(z.net||"sans net")+" · "+nomL(z.l),cat:"der"};
  for(const [id,c] of b.cu){
    const o=a.cu.get(id);
    if(!o||o.j!==c.j)return {ico:"✂",lib:o?"Découpe modifiée":"Découpe",det:nomL(c.l),cat:"cut"};
  }
  for(const [id,c] of a.cu)if(!b.cu.has(id))return {ico:"✂",lib:"Supprimer découpe",det:nomL(c.l),cat:"der"};
  if(a.board!==b.board)return {ico:"⬚",lib:"Contour de carte",det:"",cat:"cut"};
  if(a.autres.get("drawings")!==b.autres.get("drawings"))return {ico:"✎",lib:"Dessin",det:"",cat:"autre"};
  if(a.autres.get("holes")!==b.autres.get("holes"))return {ico:"○",lib:"Trou",det:"",cat:"autre"};
  return {ico:"•",lib:"Réglage",det:"règles, couches ou propriétés",cat:"autre"};
}
/* Les étapes à montrer, de la plus ancienne à la plus récente. `fin` : l'état
   (indice dans la suite undo · courant · redo) que rend un toucher sur l'icône. */
function histoEtapes(){
  const st=S.undo.concat([serialize()],S.redo.slice().reverse()), pos=S.undo.length;
  const garde=new Set(st);
  for(const k of [..._histoResume.keys()])if(!garde.has(k))_histoResume.delete(k);
  _histoSt=st;
  const hs=st.map(t=>histoResume(t).h), vivants=new Set(hs);
  /* Le repère posé sur l'état courant suit l'instantané que l'action suivante fige : entre
     les deux, la couche active ou l'affichage ont pu changer sans rien changer à la carte. */
  const C=_histoCour;
  if(C&&_histoReperes.has(C.h)&&!vivants.has(C.h)&&C.p<pos&&!_histoReperes.has(hs[C.p])){
    _histoReperes.set(hs[C.p],_histoReperes.get(C.h));_histoReperes.delete(C.h);
  }
  _histoCour={h:hs[pos],p:pos};
  for(const k of [..._histoReperes.keys()])if(!vivants.has(k))_histoReperes.delete(k);   // état sorti de l'historique
  const E=[];
  for(let i=1;i<st.length;i++){
    if(st[i].trimEnd()===st[i-1].trimEnd())continue;      // étape vide (bouton qui n'a rien changé)
    const n=histoNommer(histoResume(st[i-1]),histoResume(st[i])), p=E[E.length-1];
    // tracés d'affilée sur le même net : une icône, sans enjamber l'état courant
    const joint=p&&(p.fin<=pos)===(i<=pos)&&!_histoReperes.has(hs[p.fin]);   // ni l'état courant ni un repère au milieu
    if(joint&&n.cat==="route"&&p.cat==="route"&&n.net!=null&&n.net===p.net){
      p.n+=n.n;p.fin=i;p.det=(n.net||"sans net")+" · "+p.n+" piste"+(p.n>1?"s":"");continue;
    }
    // le même geste répété sur le même objet (Pivoter U1 quatre fois) : une icône « ×4 »
    if(joint&&n.lib===p.lib&&n.det===p.det0){
      p.fois=(p.fois||1)+1;p.fin=i;p.det=p.det0+" ×"+p.fois;continue;
    }
    E.push(Object.assign(n,{deb:i,fin:i,det0:n.det}));
  }
  return {E,pos,hs};
}
/* Rend la carte telle qu'après l'étape d'indice `k` (0 : avant la première). */
function histoAller(k){
  // un tracé en cours est abandonné : le toucher vise une étape, pas un sommet
  if(S.route)cancelRoute();
  if(S.dp)dpCancel();
  S.zoneDraft=S.cutDraft=S.edgeDraft=S.aplatDraft=S.dessinDraft=S.bus=null;
  S.histoApercu=null;
  const pos=S.undo.length;
  if(k<pos){
    while(S.undo.length>k){const n=S.undo.length;undo();if(S.undo.length>=n)break;}
  }else if(k>pos){
    const veut=S.redo.length-(k-pos);
    while(S.redo.length>Math.max(veut,0)){const n=S.redo.length;redo();if(S.redo.length>=n)break;}
  }
  refreshPanels();draw();histoRendre();
}
/* Repère nommé sur l'état courant ; un nom vide l'efface. */
function histoMarquer(nom){
  const h=histoHash(serialize());
  nom=String(nom||"").trim().slice(0,40);
  if(nom)_histoReperes.set(h,nom);else _histoReperes.delete(h);
  _histoCour={h,p:S.undo.length};
  return h;
}
/* Ce qu'une étape a changé, pour le montrer sur la carte sans y revenir :
   pistes, vias, composants, zones et découpes, ajoutés (en jaune) ou retirés (en rouge). */
function histoChangements(a,b){
  const R={aj:[],re:[],vAj:[],vRe:[],fps:[],fpsRe:[],polys:[],polysRe:[]};
  const seg=k=>{const v=k.split("|").map(Number);return {l:v[0],x1:v[1],y1:v[2],x2:v[3],y2:v[4],w:v[5]};};
  const via=k=>{const v=k.split("|").map(Number);return {x:v[0],y:v[1]};};
  const plus=(A,B,f,out)=>{for(const [k,o] of B){const m=o.n-((A.get(k)||{}).n||0);if(m>0)out.push(f(k));}};
  plus(a.tr,b.tr,seg,R.aj);plus(b.tr,a.tr,seg,R.re);
  plus(a.vi,b.vi,via,R.vAj);plus(b.vi,a.vi,via,R.vRe);
  const lire=j=>{try{return JSON.parse(j);}catch(_){return null;}};
  for(const [id,f] of b.fps){const o=a.fps.get(id);if(!o||o.j!==f.j){const x=lire(f.j);if(x)R.fps.push(x);}}
  for(const [id,o] of a.fps)if(!b.fps.has(id)){const x=lire(o.j);if(x)R.fpsRe.push(x);}
  for(const [M,N] of [[a.zo,b.zo],[a.cu,b.cu]]){
    for(const [id,z] of N){const o=M.get(id);if(!o||o.j!==z.j){const x=lire(z.j);if(x&&x.pts)R.polys.push(x.pts);}}
    for(const [id,o] of M)if(!N.has(id)){const x=lire(o.j);if(x&&x.pts)R.polysRe.push(x.pts);}
  }
  return R;
}
function histoApercu(i){
  const e=i==null?null:_histoEtapes[i];
  const avant=S.histoApercu;
  S.histoApercu=e&&_histoSt[e.deb-1]!=null&&_histoSt[e.fin]!=null
    ? histoChangements(histoResume(_histoSt[e.deb-1]),histoResume(_histoSt[e.fin])):null;
  if(avant||S.histoApercu)draw();
}
/* Boîte des changements montrés : hors de la vue, la bulle le dit. */
function histoApercuBoite(R){
  let x1=1e9,y1=1e9,x2=-1e9,y2=-1e9;
  const pt=(x,y)=>{if(!Number.isFinite(x)||!Number.isFinite(y))return;x1=Math.min(x1,x);y1=Math.min(y1,y);x2=Math.max(x2,x);y2=Math.max(y2,y);};
  for(const t of R.aj.concat(R.re)){pt(t.x1,t.y1);pt(t.x2,t.y2);}
  for(const v of R.vAj.concat(R.vRe))pt(v.x,v.y);
  for(const f of R.fps.concat(R.fpsRe))pt(f.x,f.y);
  for(const P of R.polys.concat(R.polysRe))for(const q of P)pt(q.x,q.y);
  return x1<=x2?{x1,y1,x2,y2}:null;
}
function histoHorsVue(){
  const R=S.histoApercu, v=typeof VUE_MONDE!=="undefined"?VUE_MONDE:null;
  const b=R&&histoApercuBoite(R);
  return !!(b&&v&&(b.x2<v.x1||b.x1>v.x2||b.y2<v.y1||b.y1>v.y2));
}
/* Appelé par draw() (03-render.js), dans le repère de la carte. */
function histoApercuDessiner(c){
  const R=S.histoApercu;
  if(!R)return;
  c.save();
  c.lineCap="round";c.lineJoin="round";c.shadowBlur=10;
  const trait=(L,col,tirets)=>{
    c.strokeStyle=col;c.shadowColor=col;c.setLineDash(tirets?[px(5),px(4)]:[]);
    for(const t of L){c.lineWidth=Math.max(t.w||0,px(3));c.beginPath();c.moveTo(t.x1,t.y1);c.lineTo(t.x2,t.y2);c.stroke();}
  };
  const poly=(L,col,tirets)=>{
    c.strokeStyle=col;c.shadowColor=col;c.lineWidth=px(2);c.setLineDash(tirets?[px(5),px(4)]:[]);
    for(const P of L){if(!P.length)continue;c.beginPath();c.moveTo(P[0].x,P[0].y);for(const q of P)c.lineTo(q.x,q.y);c.closePath();c.stroke();}
  };
  const boite=(L,col,tirets)=>{
    c.strokeStyle=col;c.shadowColor=col;c.lineWidth=px(2);c.setLineDash(tirets?[px(5),px(4)]:[]);
    for(const f of L){
      let b=null;
      try{b=fpBBox(f);}catch(_){}
      c.beginPath();
      if(b&&Number.isFinite(b.x1))c.rect(b.x1-0.3,b.y1-0.3,b.x2-b.x1+0.6,b.y2-b.y1+0.6);
      else c.arc(f.x,f.y,px(12),0,Math.PI*2);
      c.stroke();
    }
  };
  const rond=(L,col)=>{c.strokeStyle=col;c.shadowColor=col;c.lineWidth=px(2.5);c.setLineDash([]);
    for(const v of L){c.beginPath();c.arc(v.x,v.y,Math.max(0.4,px(6)),0,Math.PI*2);c.stroke();}};
  const J="#f2c230", ROUGE="#ff6b5e";
  poly(R.polysRe,ROUGE,true);trait(R.re,ROUGE,true);boite(R.fpsRe,ROUGE,true);rond(R.vRe,ROUGE);
  poly(R.polys,J);trait(R.aj,J);boite(R.fps,J);rond(R.vAj,J);
  c.restore();
}
function histoPlanifier(){
  if(!HISTO_OUVERT)return;
  clearTimeout(_histoT);
  _histoT=setTimeout(()=>{
    // en plein geste, on attend qu'il se pose : l'instantané courant coûte sur une grosse carte
    if((typeof drag!=="undefined"&&drag)||S.route||S.dp){histoPlanifier();return;}
    histoRendre();
  },250);
}
function histoEchap(s){return String(s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));}
function histoRendre(){
  const bar=$("histoBar");
  if(!bar)return;
  bar.hidden=!HISTO_OUVERT;
  $("canvasWrap").classList.toggle("histo-on",HISTO_OUVERT);
  const bt=$("bHisto");
  if(bt)bt.classList.toggle("on",HISTO_OUVERT);
  if(!HISTO_OUVERT){$("histoBulle").hidden=true;return;}
  const {E,pos}=histoEtapes();
  _histoEtapes=E;
  let ici=-1;
  E.forEach((e,i)=>{if(e.fin<=pos)ici=i;});
  let h="";
  const drapeau=k=>{const n=_histoReperes.get(_histoSt[k]!=null?histoResume(_histoSt[k]).h:"");
    return n?'<button type="button" class="histo-rep" data-k="'+k+'" title="Repère : '+histoEchap(n)+'">⚑<span>'+histoEchap(n)+'</span></button>':"";};
  h+=drapeau(0);
  if(ici<0)h+='<div class="histo-cur" id="histoCur" title="Glisser pour remonter le temps"></div>';
  E.forEach((e,i)=>{
    const t=e.lib+(e.det?" · "+e.det:"");
    h+='<button type="button" class="histo-e'+(i>ici?" fut":"")+(i===ici?" sel":"")+'" data-i="'+i+'" style="color:'+HISTO_COUL[e.cat]+
       '" title="'+histoEchap(t)+'" aria-label="'+histoEchap(t)+'">'+e.ico+'</button>'+drapeau(e.fin);
    if(i===ici)h+='<div class="histo-cur" id="histoCur" title="Glisser pour remonter le temps"></div>';
  });
  if(!E.length&&!_histoReperes.size)h='<span class="histo-vide">Aucune étape pour l\'instant : chaque action viendra s\'inscrire ici.</span>';
  const P=$("histoPistes");
  P.innerHTML=h;
  $("histoN").textContent=(ici+1)+" / "+E.length;
  const q=bar.querySelectorAll(".histo-ctl button");
  q[0].disabled=q[1].disabled=!S.undo.length;q[2].disabled=q[3].disabled=!S.redo.length;
  const c=$("histoCur");
  if(c){const cx=c.offsetLeft-P.offsetLeft;if(cx<P.scrollLeft+40||cx>P.scrollLeft+P.clientWidth-40)P.scrollLeft=cx-P.clientWidth*0.7;}
}
function histoBulle(el,txt){
  const b=$("histoBulle"), W=$("canvasWrap").getBoundingClientRect(), r=el.getBoundingClientRect();
  b.textContent="";
  const e=_histoEtapes[+el.dataset.i];
  if(e){const s=document.createElement("b");s.textContent=e.lib;b.appendChild(s);if(e.det){const d=document.createElement("i");d.textContent=" "+e.det;b.appendChild(d);}}
  else b.textContent=txt||"";
  if(e&&histoHorsVue()){const d=document.createElement("i");d.textContent=" · hors de la vue";b.appendChild(d);}
  b.hidden=false;
  b.style.left=Math.max(4,Math.min(r.left-W.left-8,W.width-b.offsetWidth-4))+"px";
  b.style.top=(r.top-W.top-b.offsetHeight-8)+"px";
}
function histoInit(){
  const bar=$("histoBar"), P=$("histoPistes"), bulle=$("histoBulle");
  // sans vrai DOM (banc d'essai), la frise reste fermée : ni rendu, ni minuterie
  if(!bar||!P||!bulle||!bar.querySelector||!bar.querySelector(".histo-ctl")){HISTO_OUVERT=false;return;}
  $("bHisto").onclick=()=>{
    HISTO_OUVERT=!HISTO_OUVERT;
    try{localStorage.setItem(HISTO_CLE,HISTO_OUVERT?"1":"0");}catch(_){}
    histoRendre();
  };
  bar.querySelector(".histo-ctl").onclick=e=>{
    const b=e.target.closest("button[data-h]");if(!b)return;
    const h=b.dataset.h;
    if(h==="repere"){
      const cle=histoHash(serialize()), ancien=_histoReperes.get(cle);
      const nom=window.prompt(ancien?"Renommer le repère (vide pour l'effacer) :":"Nom du repère sur l'état actuel :",ancien||"Repère "+(_histoReperes.size+1));
      if(nom!=null)histoMarquer(nom);
      histoRendre();return;
    }
    if(h==="prec")undo();else if(h==="suiv")redo();
    else if(h==="debut")histoAller(0);
    else histoAller(S.undo.length+S.redo.length);
    refreshPanels();draw();histoRendre();
  };
  let tient=null;                           // le curseur jaune, en cours de glissement
  // survol (souris) ou appui long (doigt) : ce que l'étape a changé, en surbrillance sur la carte
  P.addEventListener("pointerover",e=>{const b=e.target.closest(".histo-e");if(b&&!tient&&e.pointerType!=="touch"){histoApercu(+b.dataset.i);histoBulle(b);}});
  P.addEventListener("pointerout",e=>{if(e.target.closest(".histo-e")&&!tient&&e.pointerType!=="touch"){bulle.hidden=true;histoApercu(null);}});
  let appui=null;
  P.addEventListener("pointerdown",e=>{
    const b=e.target.closest(".histo-e");
    if(!b||e.pointerType!=="touch")return;
    appui={x:e.clientX,y:e.clientY,long:false,t:setTimeout(()=>{appui.long=true;histoApercu(+b.dataset.i);histoBulle(b);},400)};
  });
  P.addEventListener("pointermove",e=>{if(appui&&!appui.long&&Math.hypot(e.clientX-appui.x,e.clientY-appui.y)>8){clearTimeout(appui.t);appui=null;}});
  const finAppui=()=>{if(!appui)return;clearTimeout(appui.t);if(appui.long){bulle.hidden=true;histoApercu(null);}};
  P.addEventListener("pointerup",finAppui);
  P.addEventListener("pointercancel",()=>{finAppui();appui=null;});
  P.addEventListener("click",e=>{
    if(appui&&appui.long){appui=null;return;}      // un appui long montre, il ne ramène pas
    appui=null;
    const r=e.target.closest(".histo-rep");
    if(r){histoAller(+r.dataset.k);return;}
    const b=e.target.closest(".histo-e");if(!b)return;
    const E=_histoEtapes[+b.dataset.i];if(!E)return;
    histoAller(E.fin);
    const s=P.querySelector('.histo-e[data-i="'+b.dataset.i+'"]');
    if(s){histoBulle(s);clearTimeout(histoBulle.t);histoBulle.t=setTimeout(()=>{bulle.hidden=true;},1600);}
  });
  // le curseur se glisse : on montre l'étape visée, la carte suit au relâchement
  P.addEventListener("pointerdown",e=>{
    if(!e.target.closest("#histoCur"))return;
    e.preventDefault();tient={i:null};
    try{e.target.setPointerCapture(e.pointerId);}catch(_){}
  });
  P.addEventListener("pointermove",e=>{
    if(!tient)return;
    const bs=[...P.querySelectorAll(".histo-e")];
    let i=-1;
    for(const b of bs){const r=b.getBoundingClientRect();if(e.clientX>r.left+r.width/2)i=+b.dataset.i;}
    tient.i=i;
    const c=$("histoCur");
    if(i<0)P.insertBefore(c,bs[0]||null);else bs[i].after(c);
    bs.forEach(b=>b.classList.toggle("fut",+b.dataset.i>i));
    histoApercu(i>=0?i:null);
    if(i>=0)histoBulle(bs[i]);else{bulle.hidden=true;}
  });
  const lacher=()=>{
    if(!tient)return;
    const i=tient.i;tient=null;bulle.hidden=true;S.histoApercu=null;
    if(i==null)return;
    histoAller(i<0?0:_histoEtapes[i].fin);
  };
  P.addEventListener("pointerup",lacher);
  P.addEventListener("pointercancel",lacher);
  histoRendre();
}
if(typeof document!=="undefined"&&document.getElementById("histoBar"))histoInit();
