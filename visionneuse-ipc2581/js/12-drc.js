"use strict";
/* =============================================================================
   visionneuse IPC-2581 — 12-drc.js
   LE DRC DE L'ÉDITEUR PCB, SUR LA CARTE OUVERTE ICI.
   On ne recopie pas les règles : la carte est traduite en document pcbedit-1,
   l'éditeur PCB est ouvert dans une iframe cachée (?drc-externe, voir
   editeur-pcb/js/45-drc-gestion.js) et c'est SON runDrc() qui juge — isolations,
   bord de carte, angles aigus, perçages, îlots, liaisons non routées…
   Les règles sont celles d'usine de l'éditeur (classe « Défaut », profil
   JLCPCB) : un fichier IPC-2581 ne porte pas les classes de net d'un projet.

   Repères : IPC-2581 compte Y vers le haut, l'éditeur Y vers le bas. On passe
   de l'un à l'autre par y → −y ; une rotation trigonométrique devient alors
   horaire à l'écran, ce que l'éditeur appelle positif.
   ============================================================================= */

const DRC={liste:[],choisi:-1,infos:true,attente:null,id:0};

/* La carte de la visionneuse en document pcbedit-1 (unités : mm, Y vers le bas). */
function drcDocPcb(){
  const m=V.modele, k=mdlK(), X=x=>x*k, Y=y=>-y*k;
  const netNom=i=>(i>=0&&i<m.nets.length)?String(m.nets[i]||""):"";
  // rang de cuivre (0 = dessus) de chaque couche de la visionneuse
  const cuivres=V.couches.filter(c=>c.cuivre).sort((a,b)=>a.seq-b.seq).slice(0,32);
  const rang=new Map(cuivres.map((c,i)=>[c.i,i]));
  const cu=Math.max(1,cuivres.length), bas=cu-1;
  const pts=p=>{const o=[];for(let i=0;i+1<p.length;i+=2)o.push({x:X(p[i]),y:Y(p[i+1])});return o;};

  const tracks=[];
  for(const t of m.pistes){
    const l=rang.get(t.c); if(l==null||!t.p)continue;
    for(let i=0;i+3<t.p.length;i+=2)
      tracks.push({l,net:netNom(t.n),w:X(t.w||0.1),
                   x1:X(t.p[i]),y1:Y(t.p[i+1]),x2:X(t.p[i+2]),y2:Y(t.p[i+3])});
  }
  for(const a of m.arcs){
    const l=rang.get(a.c); if(l==null||!a.s||!a.e||!a.m)continue;
    const g=mdlArc(a), sw=mdlArcAngle(g);
    // h : sens horaire, que y → −y garde à l'écran ; l'éditeur le dit positif
    tracks.push({l,net:netNom(a.n),w:X(a.w||0.1),ca:a.h?sw:-sw,
                 x1:X(a.s[0]),y1:Y(a.s[1]),x2:X(a.e[0]),y2:Y(a.e[1])});
  }

  const zones=[];
  for(const g of m.plans){
    const l=rang.get(g.c); if(l==null)continue;
    for(const ct of (g.g||[]))
      if(ct&&ct.o&&ct.o.length>=6)
        zones.push({l,net:netNom(g.n),pts:pts(ct.o),fichier:true,trous:(ct.t||[]).map(pts)});
  }

  /* Les pastilles : la visionneuse en pose une par couche ; on les regroupe
     par pastille du fichier, et le perçage au même point en fait une
     traversante — ou un via quand aucun composant ne la porte. */
  const parPad=new Map();
  for(const c of cuivres)for(const q of c.pads){
    /* Une pastille LIBRE percée peut être écrite une fois par couche (c'est ce que fait
       l'export de l'éditeur) : c'est le même via, pas quatre vias empilés au même point. */
    const t=q.hote?null:V.parXY.get(mdlCleXY(q.x,q.y));
    const cle=t&&!/NON/i.test(t.p||"")&&t.d>0?t:q.pad;
    let e=parPad.get(cle);
    if(!e)parPad.set(cle,e={q,couches:[]});
    e.couches.push(rang.get(c.i));
  }
  const percesUtilises=new Set(), vias=[], fps=new Map();
  const fpDe=(ref,side)=>{
    const cle=ref+"|"+side;
    let f=fps.get(cle);
    if(!f){
      const comp=ref?V.parRef.get(ref):null;
      fps.set(cle,f={ref:ref||("TP"+(fps.size+1)),value:comp&&comp.val||"",pkg:comp&&comp.pkg||"",
                     x:0,y:0,rot:0,side,pads:[],nets:{},silk:false,mark:false});
    }
    return f;
  };
  for(const {q,couches} of parPad.values()){
    const t=V.parXY.get(mdlCleXY(q.x,q.y));
    const perce=t&&!/NON/i.test(t.p||"")&&t.d>0?t:null;
    if(perce)percesUtilises.add(perce);
    const forme=drcForme(q,k);
    const net=netNom(q.pad.n==null?-1:q.pad.n);
    if(perce&&!q.hote){
      vias.push({x:X(q.x),y:Y(q.y),d:Math.max(forme.w,forme.h,perce.d*k+0.1),drill:perce.d*k,
                 a:Math.min(...couches),b:Math.max(...couches),net});
      continue;
    }
    // une CMS sur une couche interne n'a pas d'équivalent dans l'éditeur
    const side=perce?(q.hote&&q.hote.m?1:0):(couches.includes(0)?0:couches.includes(bas)?1:-1);
    if(side<0)continue;
    const f=fpDe(q.hote?q.hote.ref:"",side), s=side?-1:1;   // dessous : l'éditeur fait miroir en X
    const n=f.pads.length+1;
    if(n>4096)continue;
    const o=Object.assign({},forme,{n,x:s*X(q.x),y:Y(q.y),rot:s*forme.rot,drill:perce?perce.d*k:0,
                                    nom:String(q.pad.pin==null?"":q.pad.pin).slice(0,16)});
    if(o.pts&&side)o.pts=o.pts.map(p=>({x:-p.x,y:p.y}));
    if(perce&&perce.l>perce.d)o.slot=perce.l*k;
    f.pads.push(o);
    if(net)f.nets[n]=net;
  }
  const holes=[];
  for(const t of m.percages){
    if(percesUtilises.has(t)||!(t.d>0))continue;
    if(/NON/i.test(t.p||""))holes.push({x:X(t.x),y:Y(t.y),d:t.d*k});
    else{
      // trou métallisé sans pastille dans le fichier : un via à sa pastille de padstack
      const ps=m.padstacks&&m.padstacks[t.ps];
      vias.push({x:X(t.x),y:Y(t.y),d:ps&&ps.pad>0?ps.pad*k:t.d*k+0.3,drill:t.d*k,a:0,b:bas,
                 net:netNom(t.n==null?-1:t.n)});
    }
  }

  /* Le contour : celui du fichier, sinon la boîte de la carte. */
  const b=V.bbox, board={x:X(b.x1),y:Y(b.y2),w:X(b.x2-b.x1),h:X(b.y2-b.y1)};
  if(m.contour&&m.contour.o&&m.contour.o.length>=6){
    board.pts=pts(m.contour.o);
    const cut=(m.contour.t||[]).filter(t=>t&&t.length>=6).map(pts);
    if(cut.length)board.cutouts=cut;
  }
  return {format:"pcbedit-1",cu,board,
          fps:[...fps.values()].map((f,i)=>Object.assign(f,{id:i+1})),
          tracks,vias,zones,holes};
}

/* Une forme de pastille de la visionneuse en pastille de l'éditeur (centrée). */
function drcForme(q,k){
  const f=V.modele.formes[q.forme], u=V.modele.formesuser[q.forme];
  const rot=-(q.rot||0);                       // trigo, Y en haut → horaire, Y en bas
  const d=(q.d||0.1)*k;
  const rond={shape:"circ",w:d,h:d,rot:0};
  const poly=p=>{
    // le polygone passe au monde (miroir, rotation) puis en Y vers le bas : plus d'angle à porter
    const a=(q.rot||0)*Math.PI/180, c=Math.cos(a), s=Math.sin(a), o=[];
    for(let i=0;i+1<p.length;i+=2){
      const x=(q.mir?-p[i]:p[i])*k, y=p[i+1]*k;
      o.push({x:x*c-y*s,y:-(x*s+y*c)});
    }
    if(o.length<3)return rond;
    let ax=0,ay=0;for(const v of o){ax=Math.max(ax,Math.abs(v.x));ay=Math.max(ay,Math.abs(v.y));}
    return {shape:"poly",pts:o,w:2*ax,h:2*ay,rot:0};
  };
  if(f)switch(f.t){
    case "CIRCLE": return {shape:"circ",w:(f.d||0)*k||d,h:(f.d||0)*k||d,rot:0};
    case "RECTCENTER": return {shape:"sharp",w:f.w*k,h:f.h*k,rot};
    case "OVAL": return {shape:"oval",w:f.w*k,h:f.h*k,rot};
    case "RECTROUND": return {shape:"rect",w:f.w*k,h:f.h*k,rot};
    case "RECTCHAM": return {shape:"chamfer",w:f.w*k,h:f.h*k,chamfer:(f.ch||0)*k,chamferCorners:"all",rot};
    case "POLYGON": return poly(f.p||[]);
  }
  // forme utilisateur : son premier contour plein ; shortcut: les trous et contours suivants sont ignorés
  if(u&&u.plans&&u.plans[0]&&u.plans[0].o)return poly(u.plans[0].o);
  return rond;
}

/* ---------- le pont vers l'éditeur ---------- */
function drcLancer(){
  if(!V.modele){hint("Ouvrez d'abord une carte.");return;}
  if(DRC.attente){hint("Contrôle déjà en cours…");return;}
  let doc;
  try{doc=drcDocPcb();}catch(e){hint("Carte intraduisible pour le DRC : "+(e&&e.message||e));return;}
  drcAfficher("Contrôle en cours (éditeur PCB chargé en arrière-plan)…");
  const fr=document.createElement("iframe");
  fr.setAttribute("aria-hidden","true");fr.tabIndex=-1;
  fr.style.cssText="position:fixed;left:-10000px;top:0;width:1200px;height:800px;border:0;visibility:hidden";
  const id=++DRC.id;
  const fini=(msg)=>{
    clearTimeout(DRC.attente&&DRC.attente.t);
    window.removeEventListener("message",ecoute);
    DRC.attente=null;fr.remove();
    if(msg)drcAfficher(msg);
  };
  const ecoute=ev=>{
    const d=ev.data;
    if(ev.source!==fr.contentWindow||!d)return;
    if(d.type==="drc-externe-pret"){fr.contentWindow.postMessage({type:"drc-externe",id,doc},"*");return;}
    if(d.type!=="drc-externe-resultat"||d.id!==id)return;
    if(d.echec){fini("Le DRC de l'éditeur a échoué : "+d.echec);return;}
    DRC.liste=Array.isArray(d.erreurs)?d.erreurs:[];DRC.choisi=-1;
    fini();drcAfficher();redessiner();
  };
  window.addEventListener("message",ecoute);
  DRC.attente={t:setTimeout(()=>fini("L'éditeur PCB n'a pas répondu (page ouverte hors de la suite, ou carte trop lourde)."),120000)};
  fr.src="../editeur-pcb/editeur-pcb.html?drc-externe";
  document.body.appendChild(fr);
}

/* ---------- la fenêtre des écarts ---------- */
function drcAfficher(etat){
  let box=document.getElementById("drcFen");
  if(!box){
    box=document.createElement("div");
    box.id="drcFen";box.className="modal-box drc-fen";
    document.body.appendChild(box);
  }
  box.hidden=false;
  const L=DRC.liste, nErr=L.filter(e=>!e.info).length, nInf=L.length-nErr;
  let h='<header class="modal-head"><div><h3>DRC — règles de l\'éditeur PCB</h3><small>'+
    (etat?esc(etat):nErr+" erreur(s), "+nInf+" remarque(s)")+'</small></div>'+
    '<div><button class="tb mini" id="drcRelancer" title="Relancer le contrôle">↻</button> '+
    '<button class="pnl-btn" id="drcFermer" title="Fermer">✕</button></div></header>';
  if(!etat){
    h+='<label class="drc-infos"><input type="checkbox" id="drcInfos"'+(DRC.infos?" checked":"")+'> montrer les remarques</label><div class="drc-liste">';
    const cats=new Map();
    L.forEach((e,i)=>{if(e.info&&!DRC.infos)return;const c=cats.get(e.cat)||[];c.push(i);cats.set(e.cat,c);});
    if(!cats.size)h+='<div class="drc-vide">Aucun écart'+(nInf&&!DRC.infos?" (hors remarques)":"")+'.</div>';
    for(const [cat,ix] of cats){
      h+='<div class="drc-cat">'+esc(cat)+' <span>'+ix.length+'</span></div>';
      for(const i of ix.slice(0,300))
        h+='<div class="drc-row'+(L[i].info?" info":"")+(i===DRC.choisi?" on":"")+'" data-i="'+i+'">'+esc(L[i].msg)+'</div>';
    }
    h+='</div>';
  }
  box.innerHTML=h;
  box.querySelector("#drcFermer").onclick=()=>{box.hidden=true;DRC.choisi=-1;redessiner();};
  box.querySelector("#drcRelancer").onclick=drcLancer;
  const cb=box.querySelector("#drcInfos");
  if(cb)cb.onchange=()=>{DRC.infos=cb.checked;drcAfficher();redessiner();};
  box.querySelectorAll(".drc-row").forEach(r=>r.onclick=()=>{
    DRC.choisi=+r.dataset.i;
    const e=DRC.liste[DRC.choisi];
    centrerSur(e.x/mdlK(),-e.y/mdlK(),Math.max(V.vue.scale,20));
    drcAfficher();
  });
}

/* Les marques sur la carte, tant que la fenêtre est ouverte (appelé par peindre). */
function drcTrace(c,dpr){
  const box=document.getElementById("drcFen");
  if(!box||box.hidden||!DRC.liste.length)return;
  c.setTransform(dpr,0,0,dpr,0,0);
  const k=mdlK();
  DRC.liste.forEach((e,i)=>{
    if(e.info&&!DRC.infos&&i!==DRC.choisi)return;
    const p=w2s(e.x/k,-e.y/k), r=i===DRC.choisi?10:5;
    c.strokeStyle=e.info?"#f2c744":"#ff4d4d";c.lineWidth=i===DRC.choisi?2.5:1.5;
    c.beginPath();c.moveTo(p.x-r,p.y-r);c.lineTo(p.x+r,p.y+r);c.moveTo(p.x+r,p.y-r);c.lineTo(p.x-r,p.y+r);c.stroke();
    if(i===DRC.choisi){c.beginPath();c.arc(p.x,p.y,r+6,0,2*Math.PI);c.stroke();}
  });
}

if(typeof document!=="undefined"){
  const b=document.getElementById("bDrc");
  if(b)b.onclick=drcLancer;
}
