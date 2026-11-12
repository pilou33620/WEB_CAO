/* ==========================================================================
   48-vias.js — les vias posés en série, à la manière d'Altium
   --------------------------------------------------------------------------
   - COUTURE : un réseau de vias du net d'une zone, au pas X / Y, en retrait du
     bord, partout où la place est libre ;
   - CLÔTURE : une rangée de vias de part et d'autre des pistes sélectionnées
     (blindage d'une ligne RF, d'une horloge) ;
   - FANOUT : chaque pastille CMS des composants sélectionnés reçoit son via,
     au bout d'une piste courte — entre quatre billes pour un BGA, vers
     l'extérieur du boîtier sinon.
   Chaque via passe les mêmes contrôles que la touche V (`viaIsole`, `viaTrou`,
   `viaPaire`), anti-collision coupée ou non : un via refusé n'est pas posé.
   Les vias de couture et de clôture portent `couture` : on les retire d'un
   coup.
   ========================================================================== */

/* Un essai de via : rendu posé s'il ne gêne rien. Le monde du routeur est
   complété sur place plutôt que reconstruit à chaque via (`pnsCache`). */
function viaEssai(x,y,net,o){
  const v=mkVia(x,y,net,o&&o.a,o&&o.b);
  if(o&&o.d){v.d=o.d;v.drill=Math.min(o.drill||v.drill,o.d-0.1);}
  if(!inBoard(v.x,v.y,S.rule.edge+v.d/2))return null;
  if(viaIsole(v)||viaPaire(v)||viaTrou(v))return null;
  if(o&&o.couture)v.couture=true;
  const N=pnsWorld();                // le monde d'avant le via : on l'y ajoute une seule fois
  S.vias.push(v);
  N.add(pnsItemVia(v));
  if(pnsCache&&pnsCache.node===N)pnsCache.st=pnsStamp();
  return v;
}
/* le net de masse le plus probable : celui d'un plan, sinon le premier net d'alimentation nommé GND */
function netMasseDefaut(){
  const L=S.cuL.find(L=>L&&L.plane&&L.net&&/gnd|masse|0v/i.test(L.net));
  if(L)return L.net;
  const n=netTable().find(x=>/^(gnd|agnd|dgnd|pgnd|masse|0v)$/i.test(x.name));
  return n?n.name:"";
}

/* ---------- couture d'une zone ---------- */
/* `o` : {pas, pasY, retrait}. La grille part de l'origine : deux zones
   voisines se cousent en quinconce régulière. Rend le nombre de vias posés. */
function coutureZone(z,o){
  if(!z||z.pts.length<3)return 0;
  if(!z.net){hint("Une zone sans net ne se coud pas : donnez-lui d'abord un net (Propriétés).");return 0;}
  const px_=Math.max(0.3,+o.pas||2), py_=Math.max(0.3,+o.pasY||px_), ret=Math.max(0,+o.retrait||0);
  const d=classOf(z.net).via, b=polyBBox(z.pts);
  if(((b.x2-b.x1)/px_)*((b.y2-b.y1)/py_)>200000){hint("Pas trop fin pour cette zone : plus de 200 000 essais.");return 0;}
  let n=0;
  for(let x=Math.ceil(b.x1/px_)*px_;x<=b.x2;x+=px_)
    for(let y=Math.ceil(b.y1/py_)*py_;y<=b.y2;y+=py_){
      if(zoneAt(z.l,x,y)!==z||polyEdgeDist(x,y,z.pts)<ret+d/2)continue;
      if(S.cuts.some(c=>c.l===z.l&&c.pts.length>2&&inPoly(x,y,c.pts)))continue;
      if(viaEssai(x,y,z.net,{couture:true}))n++;
    }
  return n;
}

/* ---------- clôture le long des pistes ---------- */
/* `o` : {net, pas, ecart (0 = au plus près permis), cotes:2|1}. Les points
   suivent la piste (arc compris) à l'écart voulu de son axe. */
function cloturePistes(tracks,o){
  const net=o.net||netMasseDefaut();
  if(!net){hint("Clôture : choisissez le net des vias (la masse en général).");return 0;}
  const pas=Math.max(0.3,+o.pas||1.5), d=classOf(net).via;
  let n=0;
  for(const t of tracks){
    if(t.net===net)continue;
    const e=(+o.ecart>0)?+o.ecart:t.w/2+clrK(net,t.net,"cu","via")+d/2+0.01;
    const A=arcOf(t), L=trkLen(t), k=Math.max(1,Math.round(L/pas));
    for(let j=0;j<=k;j++){
      const f=j/k;
      let x,y,nx,ny;
      if(A){const a=A.a1+A.ca*f;x=A.cx+A.r*Math.cos(a);y=A.cy+A.r*Math.sin(a);nx=Math.cos(a);ny=Math.sin(a);}
      else{x=t.x1+(t.x2-t.x1)*f;y=t.y1+(t.y2-t.y1)*f;const l=Math.hypot(t.x2-t.x1,t.y2-t.y1)||1;nx=-(t.y2-t.y1)/l;ny=(t.x2-t.x1)/l;}
      for(const s of (o.cotes===1?[1]:[1,-1]))
        if(viaEssai(x+s*nx*e,y+s*ny*e,net,{couture:true}))n++;
    }
  }
  return n;
}

/* ---------- fanout ---------- */
/* Les places essayées pour le via d'une pastille, la meilleure d'abord :
   entre quatre billes (BGA, grille au pas du boîtier), puis vers l'extérieur
   du boîtier, puis les huit directions. */
function fanoutPlaces(fp,q,d,clr){
  const out=[], dx=q.x-fp.x, dy=q.y-fp.y, n=Math.hypot(dx,dy)||1;
  const ext={x:dx/n,y:dy/n};
  const p=fp.pitch||1;
  for(const [sx,sy] of [[1,1],[1,-1],[-1,1],[-1,-1]].sort((a,b)=>(b[0]*ext.x+b[1]*ext.y)-(a[0]*ext.x+a[1]*ext.y)))
    out.push({x:q.x+sx*p/2,y:q.y+sy*p/2});
  const r=Math.max(q.w,q.h)/2+clr+d/2;
  for(const k of [1,1.5,2.2])out.push({x:q.x+ext.x*r*k,y:q.y+ext.y*r*k});
  for(let a=0;a<8;a++){const t=a*Math.PI/4;for(const k of [1,1.6])out.push({x:q.x+Math.cos(t)*r*k,y:q.y+Math.sin(t)*r*k});}
  return out;
}
/* Rend {vias, refus} : le nombre de pastilles sorties, et celles restées sans place. */
function fanoutFps(fps){
  let nv=0, refus=0;
  for(const fp of fps){
    const l=fp.side?S.cu-1:0;
    for(const q of padsWorld(fp)){
      if(q.drill>0||!q.net||!padCuLayers(fp,q).includes(l))continue;
      // déjà sortie : une piste ou un via la touche
      if(S.tracks.some(t=>t.l===l&&t.net===q.net&&(padHolds(fp,q,l,t.x1,t.y1)||padHolds(fp,q,l,t.x2,t.y2))))continue;
      if(S.vias.some(v=>v.net===q.net&&padDist(v.x,v.y,q)<=0))continue;
      const w=defaultWidth(q.net,l), cl=classOf(q.net), clr=clrK(q.net,"","cu","via");
      let ok=false;
      for(const P of fanoutPlaces(fp,q,cl.via,clr)){
        const x=r3(P.x), y=r3(P.y);
        if(padDist(x,y,q)<=0)continue;                     // via-in-pad : pas sans le demander
        const s={x1:q.x,y1:q.y,x2:x,y2:y};
        if(pnsWorld().segBad(s,l,q.net,w,new Set()))continue;
        const v=viaEssai(x,y,q.net);
        if(!v)continue;
        const t={l,net:q.net,w,x1:r3(q.x),y1:r3(q.y),x2:x,y2:y};
        const N=pnsWorld();
        S.tracks.push(t);
        for(const it of pnsItemsTrack(t))N.add(it);
        if(pnsCache&&pnsCache.node===N)pnsCache.st=pnsStamp();
        nv++;ok=true;break;
      }
      if(!ok)refus++;
    }
  }
  return {vias:nv,refus};
}

/* ---------- commandes ---------- */
function coutureCommande(o){
  const zs=[...S.sel.zones].filter(z=>!z.larme);
  if(!zs.length){hint("Couture : sélectionnez d'abord la ou les zones à coudre (un clic dans leur cuivre, Ctrl+clic).");return 0;}
  push();
  let n=0;
  for(const z of zs)n+=coutureZone(z,o);
  touch();refreshPanels();draw();
  hint(n+" via(s) de couture posé(s) — les places trop proches d'un autre cuivre ont été sautées. Ctrl+Z les retire.");
  return n;
}
function clotureCommande(o){
  const ts=[...S.sel.tracks];
  if(!ts.length){hint("Clôture : sélectionnez d'abord les pistes à blinder (Maj+clic prend la piste entière).");return 0;}
  push();
  const n=cloturePistes(ts,o);
  touch();refreshPanels();draw();
  hint(n+" via(s) de clôture posé(s) le long de "+ts.length+" segment(s). Ctrl+Z les retire.");
  return n;
}
function fanoutCommande(){
  const fps=[...S.sel.fps].map(fpById).filter(Boolean);
  if(!fps.length){hint("Fanout : sélectionnez d'abord les composants (BGA, QFN, QFP…).");return null;}
  push();
  const r=fanoutFps(fps);
  touch();refreshPanels();draw();
  hint(r.vias+" pastille(s) sorties par un via"+(r.refus?" · "+r.refus+" sans place libre (à sortir à la main)":"")+". Ctrl+Z annule.");
  return r;
}
function coutureRetirer(){
  const n=S.vias.filter(v=>v.couture&&!v.locked).length;   // le verrouillé reste
  if(!n){hint("Aucun via de couture ni de clôture sur la carte.");return 0;}
  push();
  S.vias=S.vias.filter(v=>!v.couture||v.locked);
  for(const v of [...S.sel.vias])if(v.couture&&!v.locked)S.sel.vias.delete(v);
  touch();refreshPanels();draw();
  hint(n+" via(s) de couture et de clôture retirés.");
  return n;
}
/* une petite boîte de réglages : [{id,label,val,type,options}] → valeurs ; `oui` : le bouton (Poser) */
function vDialogue(titre,champs,ok,oui){
  const d=document.createElement("dialog");
  d.className="ed-dlg";
  d.innerHTML='<div class="mtitle">'+esc(titre)+'</div>'+champs.map(c=>
    '<div class="prop"><label>'+esc(c.label)+'</label>'+(c.options
      ?'<select id="vd_'+c.id+'">'+c.options.map(o=>'<option'+(o===c.val?" selected":"")+'>'+esc(o)+'</option>').join("")+'</select>'
      :'<input id="vd_'+c.id+'" type="number" step="0.1" value="'+esc(String(c.val))+'">')+'</div>').join("")+
    '<div class="row"><button class="tb" id="vdNon">Annuler</button><button class="tb" id="vdOui">Poser</button></div>';
  document.body.appendChild(d);
  const fermer=()=>{d.close();d.remove();};
  d.querySelector("#vdNon").onclick=fermer;
  d.addEventListener("cancel",e=>{e.preventDefault();fermer();});
  d.querySelector("#vdOui").onclick=()=>{
    const v={};
    for(const c of champs){const e=d.querySelector("#vd_"+c.id);v[c.id]=c.options?e.value:(parseFloat(String(e.value).replace(",","."))||0);}
    fermer();ok(v);
  };
  d.showModal();
}

(function(){
  const on=(id,f)=>{const b=$(id);if(b)b.onclick=f;};
  on("bCouture",()=>{
    if(![...S.sel.zones].some(z=>!z.larme)){coutureCommande({});return;}
    vDialogue("Vias de couture",[{id:"pas",label:"Pas X (mm)",val:2},{id:"pasY",label:"Pas Y (mm)",val:2},
      {id:"retrait",label:"Retrait du bord de la zone (mm)",val:0.5}],coutureCommande);
  });
  on("bCloture",()=>{
    if(!S.sel.tracks.size){clotureCommande({});return;}
    const nets=netTable().map(n=>n.name), m=netMasseDefaut();
    vDialogue("Clôture de vias",[{id:"net",label:"Net des vias",val:m,options:m&&nets.includes(m)?nets:[m].concat(nets).filter(Boolean)},
      {id:"pas",label:"Pas le long de la piste (mm)",val:1.5},{id:"ecart",label:"Écart à l'axe (mm, 0 = au plus près)",val:0},
      {id:"cotes",label:"Côtés",val:"les deux",options:["les deux","un seul"]}],
      v=>clotureCommande({net:v.net,pas:v.pas,ecart:v.ecart,cotes:v.cotes==="un seul"?1:2}));
  });
  on("bFanout",fanoutCommande);
  on("bCoutureRetirer",coutureRetirer);
})();
