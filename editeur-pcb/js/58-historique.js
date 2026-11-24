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

/* Ce qu'il faut d'un instantané pour nommer une étape : petit, gardé en cache. */
function histoResume(txt){
  let r=_histoResume.get(txt);
  if(r)return r;
  let d={};
  try{d=JSON.parse(txt)||{};}catch(_){}
  const fps=new Map(), tr=new Map(), vi=new Map(), zo=new Map(), cu=new Map(), autres=new Map();
  for(const f of d.fps||[])fps.set(f.id,{ref:f.ref||"?",x:f.x,y:f.y,rot:f.rot||0,side:f.side?1:0,j:JSON.stringify(f)});
  const compter=(M,k,net)=>{const o=M.get(k);if(o)o.n++;else M.set(k,{n:1,net:net||""});};
  for(const t of d.tracks||[])compter(tr,[t.l,t.net,t.x1,t.y1,t.x2,t.y2,t.w].join("|"),t.net);
  for(const v of d.vias||[])compter(vi,[v.x,v.y,v.a,v.b,v.net].join("|"),v.net);
  for(const z of d.zones||[])zo.set(z.id,{l:z.l,net:z.net||"",j:JSON.stringify(z)});
  for(const c of d.cuts||[])cu.set(c.id,{l:c.l,j:JSON.stringify(c)});
  for(const k of ["drawings","holes"])autres.set(k,JSON.stringify(d[k]||[]));
  r={fps,tr,vi,zo,cu,autres,board:JSON.stringify(d.board||null),cuL:(d.cuL||[]).map(L=>L&&L.name||"")};
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
  const E=[];
  for(let i=1;i<st.length;i++){
    if(st[i].trimEnd()===st[i-1].trimEnd())continue;      // étape vide (bouton qui n'a rien changé)
    const n=histoNommer(histoResume(st[i-1]),histoResume(st[i])), p=E[E.length-1];
    // tracés d'affilée sur le même net : une icône, sans enjamber l'état courant
    if(p&&n.cat==="route"&&p.cat==="route"&&n.net!=null&&n.net===p.net&&(p.fin<=pos)===(i<=pos)){
      p.n+=n.n;p.fin=i;p.det=(n.net||"sans net")+" · "+p.n+" piste"+(p.n>1?"s":"");continue;
    }
    // le même geste répété sur le même objet (Pivoter U1 quatre fois) : une icône « ×4 »
    if(p&&n.lib===p.lib&&n.det===p.det0&&(p.fin<=pos)===(i<=pos)){
      p.fois=(p.fois||1)+1;p.fin=i;p.det=p.det0+" ×"+p.fois;continue;
    }
    E.push(Object.assign(n,{fin:i,det0:n.det}));
  }
  return {E,pos};
}
/* Rend la carte telle qu'après l'étape d'indice `k` (0 : avant la première). */
function histoAller(k){
  // un tracé en cours est abandonné : le toucher vise une étape, pas un sommet
  if(S.route)cancelRoute();
  if(S.dp)dpCancel();
  S.zoneDraft=S.cutDraft=S.edgeDraft=S.aplatDraft=S.dessinDraft=S.bus=null;
  const pos=S.undo.length;
  if(k<pos){
    while(S.undo.length>k){const n=S.undo.length;undo();if(S.undo.length>=n)break;}
  }else if(k>pos){
    const veut=S.redo.length-(k-pos);
    while(S.redo.length>Math.max(veut,0)){const n=S.redo.length;redo();if(S.redo.length>=n)break;}
  }
  refreshPanels();draw();histoRendre();
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
  if(ici<0)h+='<div class="histo-cur" id="histoCur" title="Glisser pour remonter le temps"></div>';
  E.forEach((e,i)=>{
    const t=e.lib+(e.det?" · "+e.det:"");
    h+='<button type="button" class="histo-e'+(i>ici?" fut":"")+(i===ici?" sel":"")+'" data-i="'+i+'" style="color:'+HISTO_COUL[e.cat]+
       '" title="'+histoEchap(t)+'" aria-label="'+histoEchap(t)+'">'+e.ico+'</button>';
    if(i===ici)h+='<div class="histo-cur" id="histoCur" title="Glisser pour remonter le temps"></div>';
  });
  if(!E.length)h='<span class="histo-vide">Aucune étape pour l\'instant : chaque action viendra s\'inscrire ici.</span>';
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
    if(h==="prec")undo();else if(h==="suiv")redo();
    else if(h==="debut")histoAller(0);
    else histoAller(S.undo.length+S.redo.length);
    refreshPanels();draw();histoRendre();
  };
  let tient=null;                           // le curseur jaune, en cours de glissement
  P.addEventListener("pointerover",e=>{const b=e.target.closest(".histo-e");if(b&&!tient&&e.pointerType!=="touch")histoBulle(b);});
  P.addEventListener("pointerout",e=>{if(e.target.closest(".histo-e")&&!tient)bulle.hidden=true;});
  P.addEventListener("click",e=>{
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
    if(i>=0)histoBulle(bs[i]);else{bulle.hidden=true;}
  });
  const lacher=()=>{
    if(!tient)return;
    const i=tient.i;tient=null;bulle.hidden=true;
    if(i==null)return;
    histoAller(i<0?0:_histoEtapes[i].fin);
  };
  P.addEventListener("pointerup",lacher);
  P.addEventListener("pointercancel",lacher);
  histoRendre();
}
if(typeof document!=="undefined"&&document.getElementById("histoBar"))histoInit();
