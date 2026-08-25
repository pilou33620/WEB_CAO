/* =============================================================================
   editeur-schematique — 09-interaction.js
   Interaction souris / pointeur (pose, fils, glisser, zoom)
   ============================================================================= */
"use strict";
/* ==========================================================================
   Interaction souris
   ========================================================================== */
function mpos(e){
  const r=cv.getBoundingClientRect();
  return s2w(e.clientX-r.left, e.clientY-r.top);
}
function nearestPin(wx,wy,tol){
  let best=null,bd=tol*tol;
  for(const el of S.comps){
    allPins(el).forEach(p=>{
      const d=(p.x-wx)**2+(p.y-wy)**2;
      if(d<bd){bd=d;best={x:p.x,y:p.y,el};}
    });
  }
  return best;
}
function hitComp(wx,wy){
  for(let i=S.comps.length-1;i>=0;i--){
    const b=hitBox(S.comps[i]);
    if(wx>=b.x1&&wx<=b.x2&&wy>=b.y1&&wy<=b.y2)return S.comps[i];
  }
  return null;
}
/* Libellés : ils passent devant les symboles et les fils. Un repère posé sur
   un fil voisin doit rester attrapable, et c'est le texte affiché — compTexts,
   décalage compris — qui sert de cible, pas sa position théorique. */
function hitText(wx,wy){
  for(let i=S.comps.length-1;i>=0;i--){
    const el=S.comps[i];
    for(const t of compTexts(el)){
      const b=textBox(t);
      if(wx>=b.x1&&wx<=b.x2&&wy>=b.y1&&wy<=b.y2)return {el,kind:t.kind};
    }
  }
  return null;
}
function hitNetLabel(wx,wy){
  if(!S.netLabels||S.scale<.45)return null;
  for(const b of netLabelBoxes())
    if(wx>=b.x&&wx<=b.x+b.w&&wy>=b.y&&wy<=b.y+b.h)return b;
  return null;
}
function hitWire(wx,wy){
  const tol=6/S.scale;
  for(let i=S.wires.length-1;i>=0;i--){
    const w=S.wires[i];
    const dx=w.x2-w.x1, dy=w.y2-w.y1, len2=dx*dx+dy*dy||1;
    let t=((wx-w.x1)*dx+(wy-w.y1)*dy)/len2;t=Math.max(0,Math.min(1,t));
    const px=w.x1+t*dx, py=w.y1+t*dy;
    if((px-wx)**2+(py-wy)**2<tol*tol)return i;
  }
  return -1;
}

/* Pointer Events : une seule implémentation pour souris, stylet et tactile.
   La capture garantit que le glissement continue même hors du canvas. */
const PTR=new Map();
let pinch=null;

/* Points d'ancrage d'un déplacement : broches des composants concernés et
   extrémités des fils sélectionnés. Toute extrémité de fil posée sur l'un de
   ces points suit le mouvement, ce qui préserve le câblage — un fil voisin
   s'étire au lieu de se décrocher. */
function isProbe(el){return !!defOf(el.type).probe;}
function anchorKeys(els,wires){
  const a=new Set();
  // une sonde de mesure n'est pas électrique : la déplacer ne doit pas
  // arracher l'extrémité du fil qu'elle mesure
  for(const el of els){
    if(isProbe(el))continue;
    for(const q of allPins(el)) a.add(key(q.x,q.y));
  }
  for(const w of wires){a.add(key(w.x1,w.y1));a.add(key(w.x2,w.y2));}
  return a;
}
/* Réciproque : les sondes accrochées à un point qui bouge suivent le mouvement,
   sinon déplacer une résistance laisserait sa mesure orpheline à côté. Une sonde
   posée en plein milieu d'un fil suit ce fil s'il se déplace en entier. */
function probeFollowers(anchors,moving){
  if(!anchors)return [];
  const out=[];
  for(const el of S.comps){
    if(!isProbe(el)||(moving&&moving.has(el)))continue;
    const ps=allPins(el);
    if(!ps.length)continue;
    const p=ps[0];
    let hit=anchors.has(key(p.x,p.y));
    if(!hit)for(const w of S.wires){
      if(!anchors.has(key(w.x1,w.y1))||!anchors.has(key(w.x2,w.y2)))continue;
      if(insideSeg(p,w)){hit=true;break;}
    }
    if(hit)out.push({el,x0:el.x,y0:el.y});
  }
  return out;
}
function applyProbes(probes,dx,dy){
  for(const pr of probes){pr.el.x=pr.x0+dx;pr.el.y=pr.y0+dy;}
}
const PROBE_SNAP=3*G;              // portée d'accrochage d'une sonde, en px monde
function clamp(v,a,b){return Math.min(Math.max(v,Math.min(a,b)),Math.max(a,b));}
/* Point d'un fil le plus proche d'une position, recalé sur la grille sans
   quitter le segment : c'est ce qui permet de faire coulisser une sonde le
   long de son net au lieu de la décrocher. */
function nearestOnWires(x,y,wires){
  let best=null;
  for(const w of wires){
    const dx=w.x2-w.x1, dy=w.y2-w.y1, l2=dx*dx+dy*dy||1;
    let t=((x-w.x1)*dx+(y-w.y1)*dy)/l2;
    t=Math.max(0,Math.min(1,t));
    let px=w.x1+t*dx, py=w.y1+t*dy;
    if(dy===0){px=clamp(snap(px),w.x1,w.x2);py=w.y1;}          // fil horizontal
    else if(dx===0){py=clamp(snap(py),w.y1,w.y2);px=w.x1;}     // fil vertical
    const d=Math.hypot(px-x,py-y);
    if(!best||d<best.dist)best={x:px,y:py,dist:d,w};
  }
  return best;
}
// une sonde est « flat » : sa broche est un simple décalage local
function probePin(el){const p=pinsOf(el)[0]||[0,0];return {x:el.x+p[0],y:el.y+p[1]};}
function setProbePin(el,x,y){
  const p=pinsOf(el)[0]||[0,0];
  el.x=x-p[0];el.y=y-p[1];
}
/* Rallonge posée pendant le glissement : le fil s'étire depuis le point mesuré
   jusqu'à la sonde. Les segments sont de vrais fils, recréés à chaque mouvement
   parce qu'un coude peut apparaître ou disparaître. */
function clearStub(pr){
  if(!pr||!pr.stub)return;
  for(const w of pr.stub){const i=S.wires.indexOf(w);if(i>=0)S.wires.splice(i,1);}
  pr.stub=null;touchWires();
}
function setStub(pr,segs){
  clearStub(pr);
  if(!segs||!segs.length)return;
  pr.stub=segs;
  S.wires.push(...segs);
  touchWires();
}
/* Choisit le coude qui ne touche aucun autre net ; si les deux sont dangereux,
   aucune rallonge n'est posée — la sonde reste alors visiblement en l'air. */
function planStub(from,to,net){
  const h=Math.abs(to.x-from.x)>=Math.abs(to.y-from.y);
  for(const first of [h,!h]){
    const segs=routeAxis(from,to,first);
    if(segs.length&&stubClean(segs,net))return segs;
  }
  return null;
}
// point appartenant au segment, extrémités comprises
function pointOnSeg(p,w){
  const dx=w.x2-w.x1, dy=w.y2-w.y1;
  if((p.x-w.x1)*dy-(p.y-w.y1)*dx!==0)return false;
  const t=(p.x-w.x1)*dx+(p.y-w.y1)*dy;
  return t>=0 && t<=dx*dx+dy*dy;
}
/* Une rallonge ne doit jamais souder deux nets. Les croisements francs sont sans
   effet (pas de jonction sans extrémité commune) ; le danger vient des points de
   contact : extrémité d'un fil étranger posée sur la rallonge, extrémité de la
   rallonge tombant sur un fil étranger, ou broche traversée. */
function stubClean(segs,net){
  const own=new Set(net.wires), ownPts=new Set();
  for(const w of net.wires){ownPts.add(key(w.x1,w.y1));ownPts.add(key(w.x2,w.y2));}
  const foreign=[];
  for(const w of S.wires){
    if(own.has(w))continue;
    for(const e of [[w.x1,w.y1],[w.x2,w.y2]])
      if(!ownPts.has(key(e[0],e[1])))foreign.push({x:e[0],y:e[1]});
  }
  for(const el of S.comps){
    if(isProbe(el))continue;
    for(const q of allPins(el)) if(!ownPts.has(key(q.x,q.y)))foreign.push(q);
  }
  for(const sg of segs) for(const f of foreign) if(pointOnSeg(f,sg))return false;
  const tips=[];
  for(const sg of segs)tips.push({x:sg.x1,y:sg.y1},{x:sg.x2,y:sg.y2});
  for(const w of S.wires){
    if(own.has(w))continue;
    for(const t of tips) if(pointOnSeg(t,w))return false;
  }
  return true;
}
/* Glissement d'une sonde seule : elle reste accrochée à son net.
   · à portée d'un fil du net → elle coulisse dessus ;
   · au-delà → le net s'allonge d'une rallonge orthogonale jusqu'à elle ;
   · si elle était en l'air, elle s'accroche au premier fil rencontré. */
function probeDragMove(p){
  const d=S.drag, pr=d.probe, el=pr.el;
  const tx=pr.px0+(p.x-d.sx), ty=pr.py0+(p.y-d.sy);
  if((tx!==pr.px0||ty!==pr.py0)&&!d.moved){d.moved=true;d.before=serialize();}
  const pool=pr.net?pr.net.wires:S.wires;
  const near=pool.length?nearestOnWires(tx,ty,pool):null;
  if(near&&near.dist<=PROBE_SNAP){
    clearStub(pr);
    setProbePin(el,near.x,near.y);
  }else{
    setProbePin(el,snap(tx),snap(ty));
    // la rallonge part du point du net le plus proche, pas du point d'accroche
    // d'origine : sinon elle se superposerait aux fils déjà en place
    if(pr.net)setStub(pr,planStub(near||pr.from,probePin(el),pr.net));
  }
  if(pr.net)S.hoverNet=pr.net;         // halo : on voit le net auquel elle tient
}
function endsAt(anchors){
  const out=[];
  for(const w of S.wires){
    if(anchors.has(key(w.x1,w.y1)))out.push({w,e:1,x0:w.x1,y0:w.y1});
    if(anchors.has(key(w.x2,w.y2)))out.push({w,e:2,x0:w.x2,y0:w.y2});
  }
  return out;
}
function applyEnds(ends,dx,dy){
  for(const a of ends){
    if(a.e===1){a.w.x1=a.x0+dx;a.w.y1=a.y0+dy;}
    else{a.w.x2=a.x0+dx;a.w.y2=a.y0+dy;}
  }
  if(ends.length)touchWires();
}
function moveSelBy(dx,dy){
  const els=selEls(), wires=selWires();
  if(!els.length&&!wires.length)return;
  const anchors=anchorKeys(els,wires);
  const ends=endsAt(anchors);
  const probes=probeFollowers(anchors,new Set(els));
  const contacts=pinContacts(els);
  for(const el of els){el.x+=dx;el.y+=dy;}
  applyProbes(probes,dx,dy);
  applyEnds(ends,dx,dy);
  reconnectContacts(contacts);   // une flèche suffit à décoller deux broches
  draw();
}
/* Prépare un glissement.
   handle non nul = une seule extrémité de fil est saisie : le segment s'étire.
   detach     = les voisins raccordés restent en place au lieu de suivre. */
function beginDrag(p,handle,detach){
  const els=handle?[]:selEls();
  const wires=handle?[]:selWires();
  let ends, anchors=null;
  if(handle){
    const k=handle.e===1?key(handle.w.x1,handle.w.y1):key(handle.w.x2,handle.w.y2);
    if(detach){
      ends=[{w:handle.w,e:handle.e,
             x0:handle.e===1?handle.w.x1:handle.w.x2,
             y0:handle.e===1?handle.w.y1:handle.w.y2}];
    }else{
      anchors=new Set([k]);
      ends=endsAt(anchors);
    }
  }else if(detach){
    ends=[];
    for(const w of wires)ends.push({w,e:1,x0:w.x1,y0:w.y1},{w,e:2,x0:w.x2,y0:w.y2});
  }else{
    anchors=anchorKeys(els,wires);
    ends=endsAt(anchors);
  }
  S.drag={sx:p.x,sy:p.y,moved:false,before:null,handle:!!handle,
          items:els.map(c=>({el:c,x0:c.x,y0:c.y})),
          probes:probeFollowers(anchors,new Set(els)),   // vide si Ctrl+glisser
          probe:null,
          contacts:pinContacts(els),   // broches collées à un symbole qui reste
          ends};
  // sonde seule, sans Ctrl : glissement accroché (coulisse ou étire le fil)
  if(!handle&&!detach&&!wires.length&&els.length===1&&isProbe(els[0])){
    const el=els[0], pin=probePin(el);
    S.drag.probe={el,px0:pin.x,py0:pin.y,from:{x:pin.x,y:pin.y},
                  net:netAtLive(pin.x,pin.y),stub:null};
  }
}
function finishDrag(){
  if(!S.drag)return;
  if(S.drag.moved){
    push(S.drag.before);                 // instantané pris au premier déplacement réel
    // deux broches qui se séparent gardent leur liaison : un fil la matérialise
    reconnectContacts(S.drag.contacts);
    resolveSplits();                     // découpe seulement au dépôt, pas pendant le glissement
  }
  S.drag=null;refreshPanels();draw();
}
function finishMarquee(){
  if(!S.marquee)return;
  const m=S.marquee, x1=Math.min(m.x1,m.x2),x2=Math.max(m.x1,m.x2),
        y1=Math.min(m.y1,m.y2),y2=Math.max(m.y1,m.y2);
  if(Math.abs(x2-x1)>4||Math.abs(y2-y1)>4){
    for(const el of S.comps){
      const b=bbox(el);
      if(b.x1>=x1&&b.x2<=x2&&b.y1>=y1&&b.y2<=y2)S.sel.add(el.id);
    }
    for(const w of S.wires){                 // fils entièrement contenus
      if(Math.min(w.x1,w.x2)>=x1&&Math.max(w.x1,w.x2)<=x2&&
         Math.min(w.y1,w.y2)>=y1&&Math.max(w.y1,w.y2)<=y2)S.selW.add(w);
    }
  }
  S.marquee=null;refreshPanels();draw();
}

cv.addEventListener("pointerdown",e=>{
  PTR.set(e.pointerId,{x:e.clientX,y:e.clientY});
  if(e.pointerType!=="mouse")e.preventDefault();

  // deux doigts : pincement pour zoomer et déplacer la vue
  if(PTR.size===2){
    finishDrag();finishMarquee();S.pan=null;
    const [a,b]=[...PTR.values()];
    pinch={d:Math.max(1,Math.hypot(a.x-b.x,a.y-b.y)),
           mx:(a.x+b.x)/2,my:(a.y+b.y)/2,scale:S.scale,ox:S.ox,oy:S.oy};
    return;
  }
  if(PTR.size>2)return;
  try{cv.setPointerCapture(e.pointerId);}catch(_){}

  const p=mpos(e);
  /* Alt sert à deux choses qui ne se marchent pas dessus : sur le vide, il
     déplace la vue comme le bouton du milieu ; sur un élément, il détache le
     câblage pendant le glissement. Ctrl est désormais pris par la sélection
     multiple, il fallait bien loger le détachement quelque part. */
  const onSomething = e.altKey && S.mode==="select" && !!(
    hitText(p.x,p.y)||hitNetLabel(p.x,p.y)||hitComp(p.x,p.y)||hitWire(p.x,p.y)>=0);
  if(e.button===1||(e.button===0&&e.altKey&&!onSomething)){
    S.pan={x:e.clientX,y:e.clientY,ox:S.ox,oy:S.oy};e.preventDefault();return;
  }
  if(e.button===2)return;

  // pose de composant
  if(S.place){
    push();
    const el=addComp(S.place,p.x,p.y);
    el.rot=S.placeRot||0;
    if(!e.shiftKey){S.place=null;setPalette(null);}
    clearSel();S.sel.add(el.id);
    refreshPanels();draw();return;
  }
  // Ctrl et Maj font la même chose : ajouter à la sélection (ou en retirer)
  const addSel=e.shiftKey||e.ctrlKey||e.metaKey;
  if(S.mode==="mesure"){rpMesClic(p.x,p.y);draw();return;}
  if(S.mode==="wire"){
    const pin=nearestPin(p.x,p.y,(e.pointerType==="mouse"?12:20)/S.scale);
    const pt=pin?{x:pin.x,y:pin.y}:{x:snap(p.x),y:snap(p.y)};
    if(!S.wireStart){S.wireStart=pt;}
    else{
      const segs=routeL(S.wireStart,pt);
      if(segs.length){push();S.wires.push(...segs);touchWires();resolveSplits();}
      S.wireStart=pin?null:pt;   // arrivée sur une broche = fin de fil
    }
    refreshPanels();draw();return;
  }
  if(S.mode==="erase"){
    const el=hitComp(p.x,p.y);
    if(el){push();deleteComps([el.id]);refreshPanels();draw();return;}
    const wi=hitWire(p.x,p.y);
    if(wi>=0){push();S.selW.delete(S.wires[wi]);S.wires.splice(wi,1);touchWires();refreshPanels();draw();}
    return;
  }
  // libellé de composant : il se saisit avant le symbole
  const ht=hitText(p.x,p.y);
  if(ht){
    if(!addSel&&!S.sel.has(ht.el.id)){clearSel();S.sel.add(ht.el.id);}
    const cur=textOff(ht.el,ht.kind)||[0,0];
    S.drag={sx:p.x,sy:p.y,moved:false,before:null,handle:false,items:[],
            probes:[],probe:null,ends:[],contacts:[],
            text:{el:ht.el,kind:ht.kind,x0:cur[0],y0:cur[1]}};
    document.getElementById("fHint").textContent=
      "Glisser le texte le déplace · double-clic pour le remettre à sa place.";
    refreshPanels();draw();return;
  }
  // étiquette de net : elle se déplace de la même façon, et le clic sélectionne
  // le net pour que le panneau propose de la masquer
  const hn=hitNetLabel(p.x,p.y);
  if(hn){
    const cur=(hn.wire&&hn.wire.lblOff)||[0,0];
    if(!addSel)selectNet(hn.net);
    S.drag={sx:p.x,sy:p.y,moved:false,before:null,handle:false,items:[],
            probes:[],probe:null,ends:[],contacts:[],
            netLbl:{wires:hn.net.wires.slice(),x0:cur[0],y0:cur[1]}};
    document.getElementById("fHint").textContent=
      "Glisser l'étiquette la déplace · double-clic pour la remettre en place · "+
      "le panneau des propriétés permet de la masquer.";
    draw();return;
  }
  // sélection : composant d'abord, puis fil
  const el=hitComp(p.x,p.y);
  if(el){
    if(addSel){
      // Ctrl (ou Maj) + clic : on ajoute, ou on retire. Retirer ne doit pas
      // enchaîner sur un glissement, sinon le geste déplacerait le reste
      if(S.sel.has(el.id)){S.sel.delete(el.id);refreshPanels();draw();return;}
      S.sel.add(el.id);
    }
    else if(!S.sel.has(el.id)){clearSel();S.sel.add(el.id);}
    beginDrag(p,null,e.altKey);
    refreshPanels();draw();return;
  }
  const wi=hitWire(p.x,p.y);
  if(wi>=0){
    const w=S.wires[wi];
    if(addSel){
      if(S.selW.has(w)){S.selW.delete(w);refreshPanels();draw();return;}
      S.selW.add(w);
    }
    else if(!S.selW.has(w)){clearSel();S.selW.add(w);}
    // extrémité saisie : on étire le segment au lieu de le translater
    let handle=null;
    if(!addSel&&S.selW.has(w)){
      const tol=(e.pointerType==="mouse"?9:18)/S.scale;
      if(Math.hypot(p.x-w.x1,p.y-w.y1)<=tol)handle={w,e:1};
      else if(Math.hypot(p.x-w.x2,p.y-w.y2)<=tol)handle={w,e:2};
    }
    beginDrag(p,handle,e.altKey);
    refreshPanels();draw();return;
  }
  if(e.pointerType!=="mouse"){
    // au doigt, glisser sur le vide déplace la vue : plus naturel qu'un lasso
    S.pan={x:e.clientX,y:e.clientY,ox:S.ox,oy:S.oy};
    if(!addSel)clearSel();
  }else{
    if(!addSel)clearSel();          // Ctrl ou Maj : le lasso s'ajoute à l'existant
    S.marquee={x1:p.x,y1:p.y,x2:p.x,y2:p.y};
  }
  refreshPanels();draw();
});

cv.addEventListener("pointermove",e=>{
  if(PTR.has(e.pointerId))PTR.set(e.pointerId,{x:e.clientX,y:e.clientY});

  if(pinch&&PTR.size>=2){
    const [a,b]=[...PTR.values()];
    const d=Math.max(1,Math.hypot(a.x-b.x,a.y-b.y));
    const r=cv.getBoundingClientRect();
    const k=Math.max(.25,Math.min(4,pinch.scale*d/pinch.d))/pinch.scale;
    const mx=pinch.mx-r.left, my=pinch.my-r.top;
    S.scale=pinch.scale*k;
    S.ox=mx-(mx-pinch.ox)*k+((a.x+b.x)/2-pinch.mx);
    S.oy=my-(my-pinch.oy)*k+((a.y+b.y)/2-pinch.my);
    draw();return;
  }

  const p=mpos(e);S.mouse=p;
  // coordonnées en pas de grille ; une décimale dès que l'accrochage est plus
  // fin qu'un pas, sinon l'affichage arrondirait ce que la souris vient de poser
  const dec=(S.grid||G)<G?1:0;
  document.getElementById("fX").textContent=(p.x/G).toFixed(dec);
  document.getElementById("fY").textContent=(p.y/G).toFixed(dec);
  if(S.pan){
    S.ox=S.pan.ox+(e.clientX-S.pan.x);S.oy=S.pan.oy+(e.clientY-S.pan.y);draw();return;
  }
  if(S.drag){
    const dx=snap(p.x-S.drag.sx), dy=snap(p.y-S.drag.sy);
    if((dx||dy)&&!S.drag.moved){
      S.drag.moved=true;
      S.drag.before=serialize();   // l'état est encore intact à cet instant
    }
    if(S.drag.text){
      const t=S.drag.text;
      setTextOff(t.el,t.kind,t.x0+dx,t.y0+dy);
      draw();return;
    }
    if(S.drag.netLbl){
      const n=S.drag.netLbl;
      for(const w of n.wires){
        if(!(n.x0+dx)&&!(n.y0+dy))delete w.lblOff;
        else w.lblOff=[n.x0+dx,n.y0+dy];
      }
      draw();return;
    }
    if(S.drag.probe){probeDragMove(p);draw();return;}
    for(const it of S.drag.items){it.el.x=it.x0+dx;it.el.y=it.y0+dy;}
    applyProbes(S.drag.probes,dx,dy);
    applyEnds(S.drag.ends,dx,dy);  // aucune copie profonde : les extrémités
    draw();return;                 // concernées sont repérées une fois au départ
  }
  if(S.mode==="mesure"){if(rpMesBouge(p.x,p.y))draw();return;}
  if(S.marquee){S.marquee.x2=p.x;S.marquee.y2=p.y;draw();return;}
  // net survolé : halo sur tout le net et rappel dans la barre d'état
  const wi=hitWire(p.x,p.y);
  let hn=null;
  if(wi>=0)hn=nets().byWire.get(S.wires[wi])||null;
  else{
    const pin=nearestPin(p.x,p.y,10/S.scale);
    if(pin)hn=netAt(pin.x,pin.y);
  }
  const hoverChanged=(hn!==S.hoverNet);
  if(hoverChanged){
    S.hoverNet=hn;
    document.getElementById("fNet").textContent = hn
      ? hn.name+" · "+hn.nodes.length+(hn.nodes.length>1?" nœuds":" nœud")
      : "—";
  }
  if(S.mode==="select"){
    // indice de survol : le curseur annonce ce qui est saisissable — libellés
    // compris, sans quoi personne ne devinerait qu'ils se déplacent
    cv.style.cursor=(hitText(p.x,p.y)||hitNetLabel(p.x,p.y)||hitComp(p.x,p.y)||wi>=0)
      ? "move" : "crosshair";
  }
  S.hoverPin = (S.mode==="wire")?nearestPin(p.x,p.y,12/S.scale):null;
  if(S.mode==="wire"||S.place||hoverChanged)draw();
});

function endPointer(e){
  PTR.delete(e.pointerId);
  if(pinch&&PTR.size<2)pinch=null;
  if(PTR.size>0)return;
  if(S.pan){S.pan=null;return;}
  finishDrag();
  finishMarquee();
}
window.addEventListener("pointerup",endPointer);
window.addEventListener("pointercancel",endPointer);

cv.addEventListener("contextmenu",e=>{
  e.preventDefault();
  if(S.wireStart){S.wireStart=null;draw();}
  else if(S.place){S.place=null;setPalette(null);draw();}
});
cv.addEventListener("dblclick",e=>{
  if(S.wireStart){S.wireStart=null;draw();return;}
  const p=mpos(e);
  const ht=hitText(p.x,p.y);
  if(ht&&textOff(ht.el,ht.kind)){
    push();setTextOff(ht.el,ht.kind,0,0);draw();return;
  }
  const hn=hitNetLabel(p.x,p.y);
  if(hn&&hn.moved){
    push();
    for(const w of hn.net.wires)delete w.lblOff;
    draw();
  }
});
cv.addEventListener("auxclick",e=>{if(e.button===1)e.preventDefault();});
cv.addEventListener("wheel",e=>{
  e.preventDefault();
  const r=cv.getBoundingClientRect(), mx=e.clientX-r.left, my=e.clientY-r.top;
  const before=s2w(mx,my);
  const f=e.deltaY<0?1.12:1/1.12;
  S.scale=Math.max(.25,Math.min(4,S.scale*f));
  const after=s2w(mx,my);
  S.ox+=(after.x-before.x)*S.scale;S.oy+=(after.y-before.y)*S.scale;
  draw();
},{passive:false});
