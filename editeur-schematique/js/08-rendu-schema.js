/* =============================================================================
   editeur-schematique — 08-rendu-schema.js
   Rendu : jonctions, halo, étiquettes, symboles, boucle draw()
   ============================================================================= */
"use strict";
function drawJunctions(c){
  c.fillStyle=C_RED;
  for(const p of junctions()){c.beginPath();c.arc(p[0],p[1],5,0,Math.PI*2);c.fill();}
}
/* Halo sur le net survolé : on lit d'un coup d'œil jusqu'où va un fil. */
function drawNetGlow(c){
  const n=S.hoverNet;
  if(!n||!n.wires.length)return;
  if(nets().byWire.get(n.wires[0])!==n){S.hoverNet=null;return;} // net recalculé entre-temps
  c.save();
  c.strokeStyle=netColor(n);c.globalAlpha=.28;c.lineWidth=11;c.lineCap="round";
  c.beginPath();
  for(const w of n.wires){c.moveTo(w.x1,w.y1);c.lineTo(w.x2,w.y2);}
  c.stroke();
  c.globalAlpha=.85;
  for(const nd of n.nodes){c.beginPath();c.arc(nd.x,nd.y,4.5,0,Math.PI*2);
    c.fillStyle=netColor(n);c.fill();}
  c.restore();
}
/* Étiquettes de net posées sur les fils.
   S.netLabels : 0 = aucune · 1 = nets nommés seulement · 2 = tous */
function drawNetLabels(c,force){
  if(!S.netLabels)return;
  if(!force && S.scale<.45)return;
  const N=nets();
  c.save();
  c.lineWidth=1.2;
  for(const n of N.list){
    if(S.netLabels===1 && !n.named)continue;
    const a=n.anchor;
    if(!a)continue;
    const col=netColor(n);
    const t=(n.global?"⇄ ":"")+n.name+(n.conflict?" ⚠":"");
    const w=textW(t,10.5,true)+13, h=17;
    const x = a.vert ? a.x+12 : a.x-w/2;
    const y = a.vert ? a.y-h/2 : a.y-h-7;
    c.strokeStyle=n.conflict?C_RED:col;
    RR(c,x,y,w,h,4,"#16181c");
    TXT(c,t,x+w/2,y+h/2+.5,10.5,n.conflict?C_RED:col);
  }
  c.restore();
}
function drawComp(c,el,ghost){
  const def=defOf(el.type);
  c.save();
  if(ghost)c.globalAlpha=.45;
  c.translate(el.x,el.y);
  if(!def.flat){
    c.rotate(((el.rot%360)+360)%360*Math.PI/180);
    if(el.mir)c.scale(-1,1);
  }
  c.strokeStyle=C_COMP;c.lineWidth=3;c.lineCap="round";c.lineJoin="round";
  _symT=def.flat?null:{rot:el.rot|0,mir:!!el.mir};
  try{def.d(c,el);}finally{_symT=null;}
  c.restore();
  // pastilles de broches — dans un save/restore pour hériter de l'opacité du fantôme
  c.save();
  if(ghost)c.globalAlpha=.45;
  c.fillStyle="#8fd0ff";
  for(const p of allPins(el)){c.beginPath();c.arc(p.x,p.y,2.6,0,Math.PI*2);c.fill();}
  c.restore();
  // textes (jamais pivotés, pour rester lisibles)
  const rot=orient(el).rot;                  // normalisé : -90 ou 450 restent gérés
  const vert = rot===90||rot===270;
  const off = (typeof def.tOff==="function"?def.tOff(el):def.tOff)||34;
  c.save();if(ghost)c.globalAlpha=.45;
  if(def.refIn && el.ref) TXT(c,el.ref,el.x,el.y+1,12.5,C_TXT);
  if(def.valIn && el.value) TXT(c,el.value,el.x,el.y+1,12.5,C_TXT);
  // refIn / valIn : déjà tracé dans le symbole ci-dessus
  // valSelf       : le symbole imprime lui-même sa valeur (CI, étiquette de net…)
  // noRef / noVal : pas d'étiquette du tout
  const showRef = el.ref && !def.refIn && !def.noRef;
  let showVal = el.value && !def.valIn && !def.valSelf && !def.noVal;
  if(el.type==="vcc"){                       // la tension se lit au-dessus du rail
    if(showVal){
      const t=locToWorld(el,0,-30);
      TXT(c,el.value,t.x,t.y,13,C_TXT);
    }
    showVal=false;
  }
  // une seule étiquette de valeur, à un seul endroit : sous le symbole (ou à sa
  // droite s'il est pivoté), recentrée quand aucune référence ne l'accompagne
  if(vert){
    if(showRef) TXT(c,el.ref,el.x+off,el.y-9,12.5,C_TXT,"left");
    if(showVal) TXT(c,el.value,el.x+off,showRef?el.y+9:el.y,12,"#cfd4db","left");
  }else{
    if(showRef) TXT(c,el.ref,el.x,el.y-off,12.5,C_TXT);
    if(showVal) TXT(c,el.value,el.x,el.y+off,12,"#cfd4db");
  }
  c.restore();
}
function drawSel(c){
  // fils : halo sous le tracé + poignées carrées aux extrémités
  if(S.selW.size){
    c.save();
    c.strokeStyle=C_SEL;c.globalAlpha=.3;c.lineWidth=10;c.lineCap="round";
    c.beginPath();
    for(const w of S.wires){
      if(!S.selW.has(w))continue;
      c.moveTo(w.x1,w.y1);c.lineTo(w.x2,w.y2);
    }
    c.stroke();
    c.restore();
    const h=HANDLE/S.scale;                 // taille constante à l'écran
    c.fillStyle=C_SEL;
    for(const w of S.wires){
      if(!S.selW.has(w))continue;
      c.fillRect(w.x1-h,w.y1-h,h*2,h*2);
      c.fillRect(w.x2-h,w.y2-h,h*2,h*2);
    }
  }
  // composants : cadre pointillé
  c.strokeStyle=C_SEL;c.lineWidth=1.2;c.setLineDash([5,4]);
  for(const el of S.comps){
    if(!S.sel.has(el.id))continue;
    const b=bbox(el);
    c.strokeRect(b.x1,b.y1,b.x2-b.x1,b.y2-b.y1);
  }
  c.setLineDash([]);
}
/* Tracé en L entre deux points. horizFirst choisit le sens du coude ; routeL
   garde le choix historique (on part du plus grand déplacement). */
function routeAxis(a,b,horizFirst){
  const segs=[];
  if(a.x===b.x&&a.y===b.y)return segs;
  if(horizFirst){
    if(b.x!==a.x)segs.push({x1:a.x,y1:a.y,x2:b.x,y2:a.y});
    if(b.y!==a.y)segs.push({x1:b.x,y1:a.y,x2:b.x,y2:b.y});
  }else{
    if(b.y!==a.y)segs.push({x1:a.x,y1:a.y,x2:a.x,y2:b.y});
    if(b.x!==a.x)segs.push({x1:a.x,y1:b.y,x2:b.x,y2:b.y});
  }
  return segs;
}
function routeL(a,b){return routeAxis(a,b,Math.abs(b.x-a.x)>=Math.abs(b.y-a.y));}
function draw(){
  const dpr=window.devicePixelRatio||1, w=cv.width, h=cv.height;
  ctx.setTransform(1,0,0,1,0,0);
  ctx.fillStyle=C_BG;ctx.fillRect(0,0,w,h);
  ctx.save();ctx.scale(dpr,dpr);
  drawGrid(ctx,w/dpr,h/dpr);
  ctx.restore();

  ctx.setTransform(dpr*S.scale,0,0,dpr*S.scale,dpr*S.ox,dpr*S.oy);
  drawNetGlow(ctx);
  drawWires(ctx);
  drawJunctions(ctx);
  for(const el of S.comps) drawComp(ctx,el,false);
  drawNetLabels(ctx);
  drawSel(ctx);

  // aperçu de pose
  if(S.place){
    drawComp(ctx,{id:-1,type:S.place,x:snap(S.mouse.x),y:snap(S.mouse.y),rot:S.placeRot||0,
                  mir:false,ref:"",value:defOf(S.place).v},true);
  }
  // aperçu de fil
  if(S.wireStart){
    const b={x:snap(S.mouse.x),y:snap(S.mouse.y)};
    ctx.strokeStyle=C_WIRE;ctx.globalAlpha=.75;ctx.lineWidth=3.4;ctx.setLineDash([7,5]);
    ctx.beginPath();
    for(const s of routeL(S.wireStart,b)){ctx.moveTo(s.x1,s.y1);ctx.lineTo(s.x2,s.y2);}
    ctx.stroke();ctx.setLineDash([]);ctx.globalAlpha=1;
    ctx.fillStyle=C_RED;ctx.beginPath();ctx.arc(S.wireStart.x,S.wireStart.y,4.5,0,Math.PI*2);ctx.fill();
  }
  // broche survolée
  if(S.hoverPin){
    ctx.strokeStyle=C_SEL;ctx.lineWidth=2;
    ctx.beginPath();ctx.arc(S.hoverPin.x,S.hoverPin.y,7,0,Math.PI*2);ctx.stroke();
  }
  // rectangle de sélection
  if(S.marquee){
    const m=S.marquee;
    ctx.strokeStyle=C_SEL;ctx.lineWidth=1;ctx.setLineDash([4,3]);
    ctx.strokeRect(Math.min(m.x1,m.x2),Math.min(m.y1,m.y2),Math.abs(m.x2-m.x1),Math.abs(m.y2-m.y1));
    ctx.setLineDash([]);
  }
  ctx.setTransform(1,0,0,1,0,0);
  document.getElementById("fZoom").textContent=Math.round(S.scale*100)+"%";
  document.getElementById("fN").textContent=S.comps.length;
  document.getElementById("fW").textContent=S.wires.length;
  document.getElementById("fNets").textContent=nets().list.length;
}
