/* =============================================================================
   editeur-schematique — 08-rendu-schema.js
   Rendu : jonctions, halo, étiquettes, symboles, boucle draw()
   ============================================================================= */
"use strict";
/* Deux broches posées l'une sur l'autre sont électriquement reliées — deux
   composants mis bout à bout n'ont pas besoin d'un fil entre eux. Encore
   faut-il le voir : ces contacts reçoivent le même point de jonction que les
   fils. Le calcul est refait à chaque image, sans cache : pendant un
   glissement, les broches bougent sans que les fils changent. */
function pinContactPoints(){
  const seen=new Map(), out=[];
  for(const el of S.comps){
    if(isProbe(el))continue;
    for(const q of allPins(el)){
      const k=key(q.x,q.y), prev=seen.get(k);
      if(prev===undefined){seen.set(k,el);continue;}
      if(prev===el||prev===null)continue;     // deux broches d'un même symbole
      seen.set(k,null);                       // déjà signalé
      out.push(q);
    }
  }
  return out;
}
function drawJunctions(c){
  c.fillStyle=C_RED;
  for(const p of junctions()){c.beginPath();c.arc(p[0],p[1],5,0,Math.PI*2);c.fill();}
  for(const q of pinContactPoints()){c.beginPath();c.arc(q.x,q.y,5,0,Math.PI*2);c.fill();}
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
   S.netLabels : 0 = aucune · 1 = nets nommés seulement · 2 = tous
   Deux réglages s'y ajoutent, propres à un net et rangés sur ses fils :
   w.lblHide masque l'étiquette, w.lblOff la décale. Ils sont écrits sur tous
   les fils du net, parce que le fil qui porte l'étiquette — le plus long —
   peut changer au gré des scissions. */
function netLabelAt(n){
  if(!n||!n.anchor)return null;
  if(S.netLabels===1 && !n.named)return null;
  const wire=n.anchorWire||null;
  if(wire&&wire.lblHide)return null;
  const a=n.anchor, off=(wire&&wire.lblOff)||[0,0];
  const t=(n.global?"⇄ ":"")+n.name+(n.conflict?" ⚠":"");
  const w=textW(t,10.5,true)+13, h=17;
  return {net:n,wire,t,w,h,
          x:(a.vert?a.x+12:a.x-w/2)+off[0],
          y:(a.vert?a.y-h/2:a.y-h-7)+off[1],
          ax:a.x,ay:a.y,moved:!!(off[0]||off[1])};
}
function netLabelBoxes(){
  if(!S.netLabels)return [];
  const out=[];
  for(const n of nets().list){
    const b=netLabelAt(n);
    if(b)out.push(b);
  }
  return out;
}
function drawNetLabels(c,force){
  if(!S.netLabels)return;
  if(!force && S.scale<.45)return;
  c.save();
  c.lineWidth=1.2;
  for(const b of netLabelBoxes()){
    const n=b.net, col=n.conflict?C_RED:netColor(n);
    // étiquette déplacée : un trait de rappel vers le fil, pour ne pas
    // l'attribuer au segment voisin
    if(b.moved){
      c.save();
      c.strokeStyle=col;c.globalAlpha=.5;c.setLineDash([4,3]);
      c.beginPath();c.moveTo(b.ax,b.ay);c.lineTo(b.x+b.w/2,b.y+b.h/2);c.stroke();
      c.restore();
    }
    c.strokeStyle=col;
    RR(c,b.x,b.y,b.w,b.h,4,"#16181c");
    TXT(c,b.t,b.x+b.w/2,b.y+b.h/2+.5,10.5,col);
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
  c.save();if(ghost)c.globalAlpha=.45;
  if(def.refIn && el.ref) TXT(c,el.ref,el.x,el.y+1,12.5,C_TXT);
  if(def.valIn && el.value) TXT(c,el.value,el.x,el.y+1,12.5,C_TXT);
  for(const t of compTexts(el)) TXT(c,t.text,t.x,t.y,t.size,t.col,t.align);
  c.restore();
}
/* Libellés extérieurs d'un composant — repère et valeur — avec leur position.
   Une seule source pour le tracé, la saisie à la souris et le fil de rappel :
   sinon on attraperait un texte à côté de l'endroit où il s'affiche.
   el.refOff / el.valOff : déplacement libre posé par l'utilisateur, en monde.
   refIn / valIn : le symbole imprime lui-même le texte en son centre, il n'est
   pas déplaçable — le déplacer reviendrait à défaire le dessin du symbole. */
function compTexts(el){
  const def=defOf(el.type), out=[];
  const rot=orient(el).rot;                  // normalisé : -90 ou 450 restent gérés
  const vert = rot===90||rot===270;
  const off = (typeof def.tOff==="function"?def.tOff(el):def.tOff)||34;
  const showRef = el.ref && !def.refIn && !def.noRef;
  let showVal = el.value && !def.valIn && !def.valSelf && !def.noVal;
  if(el.type==="vcc"){                       // la tension se lit au-dessus du rail
    if(showVal){
      const t=locToWorld(el,0,-30);
      out.push({kind:"val",text:el.value,x:t.x,y:t.y,size:13,col:C_TXT,align:"center"});
    }
    showVal=false;
  }
  // une seule étiquette de valeur, à un seul endroit : sous le symbole (ou à sa
  // droite s'il est pivoté), recentrée quand aucune référence ne l'accompagne
  if(vert){
    if(showRef)out.push({kind:"ref",text:el.ref,x:el.x+off,y:el.y-9,size:12.5,col:C_TXT,align:"left"});
    if(showVal)out.push({kind:"val",text:el.value,x:el.x+off,y:showRef?el.y+9:el.y,size:12,col:"#cfd4db",align:"left"});
  }else{
    if(showRef)out.push({kind:"ref",text:el.ref,x:el.x,y:el.y-off,size:12.5,col:C_TXT,align:"center"});
    if(showVal)out.push({kind:"val",text:el.value,x:el.x,y:el.y+off,size:12,col:"#cfd4db",align:"center"});
  }
  for(const t of out){
    const d=textOff(el,t.kind);
    if(d){t.x+=d[0];t.y+=d[1];t.moved=true;}
    t.el=el;
    t.w=textW(t.text,t.size,true);
    t.h=t.size+7;
  }
  return out;
}
function textOff(el,kind){
  const d=(kind==="ref")?el.refOff:el.valOff;
  return (Array.isArray(d)&&(d[0]||d[1]))?d:null;
}
function setTextOff(el,kind,dx,dy){
  const k=(kind==="ref")?"refOff":"valOff";
  if(!dx&&!dy)delete el[k];else el[k]=[dx,dy];
}
// boîte d'accrochage d'un libellé, un peu plus large que le texte
function textBox(t){
  const x=(t.align==="left")?t.x-5:(t.align==="right"?t.x-t.w-5:t.x-t.w/2-5);
  return {x1:x,y1:t.y-t.h/2,x2:x+t.w+10,y2:t.y+t.h/2};
}
/* Fil de rappel entre un libellé déplacé et son composant : c'est lui qui dit à
   qui appartient le texte quand deux symboles se touchent presque. Tracé
   pendant le déplacement, et sur la sélection en cours. */
function drawTextLinks(c){
  const shown=[];
  const d=S.drag&&S.drag.text;
  if(d)shown.push({el:d.el,kind:d.kind});
  for(const el of S.comps){
    if(!S.sel.has(el.id))continue;
    if(el.refOff)shown.push({el,kind:"ref"});
    if(el.valOff)shown.push({el,kind:"val"});
  }
  if(!shown.length)return;
  c.save();
  c.strokeStyle=C_SEL;c.globalAlpha=.55;c.lineWidth=1.2/S.scale;
  c.setLineDash([4/S.scale,3/S.scale]);
  for(const it of shown){
    const t=compTexts(it.el).find(x=>x.kind===it.kind);
    if(!t)continue;
    c.beginPath();c.moveTo(it.el.x,it.el.y);c.lineTo(t.x,t.y);c.stroke();
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
  drawTextLinks(ctx);
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
  updateGridInfo();
  document.getElementById("fN").textContent=S.comps.length;
  document.getElementById("fW").textContent=S.wires.length;
  document.getElementById("fNets").textContent=nets().list.length;
}
