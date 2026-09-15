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

  // Rendu visuel distinct des piquages de bus (pastille cyan à centre blanc)
  if(typeof schTousLesPiquages === "function"){
    const piqs = schTousLesPiquages(S.wires);
    for(const pq of piqs){
      c.save();
      c.fillStyle = typeof C_BUS !== "undefined" ? C_BUS : "#00c4df";
      c.beginPath(); c.arc(pq.x, pq.y, 5.5, 0, Math.PI * 2); c.fill();
      c.fillStyle = "#ffffff";
      c.beginPath(); c.arc(pq.x, pq.y, 2.2, 0, Math.PI * 2); c.fill();
      c.restore();
    }
  }
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
    const n=b.net, col=n.conflict?C_RED:((b.wire&&b.wire.bus)?C_BUS:netColor(n));
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
  const ps=allPins(el);
  for(const p of ps){c.beginPath();c.arc(p.x,p.y,2.6,0,Math.PI*2);c.fill();}
  if(el.type!=="ic" && Array.isArray(el.pinNames)){
    ps.forEach((p,i)=>{
      const nm=el.pinNames[i];
      if(!nm)return;
      const dx=p.x-el.x, dy=p.y-el.y;
      let align="center", tx=p.x, ty=p.y;
      if(Math.abs(dx)>=Math.abs(dy)){
        align=dx>0?"right":"left";
        tx+=dx>0?-6:6;
        ty-=8;
      }else{
        align="center";
        ty+=dy>0?-9:12;
      }
      TXT(c,nm,tx,ty,8.5,"#93c5fd",align);
    });
  }
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
function drawDrawings(c){
  if(!S.drawings||!S.drawings.length)return;
  for(const d of S.drawings){
    c.save();
    c.strokeStyle=d.color||"#6b7280";
    c.lineWidth=d.width||2;
    c.lineCap="round";
    if(d.style==="dashed") c.setLineDash([8,6]);
    else if(d.style==="dotted") c.setLineDash([2,4]);
    else c.setLineDash([]);
    if(d.shape==="rect"){
      const rx=Math.min(d.x1,d.x2), ry=Math.min(d.y1,d.y2);
      const rw=Math.abs(d.x2-d.x1), rh=Math.abs(d.y2-d.y1);
      if(d.isZone || d.category || (d.style==="dashed" && d.label)){
        c.fillStyle = (d.color||"#6b7280") + "12";
        c.fillRect(rx,ry,rw,rh);
      }
      c.strokeRect(rx,ry,rw,rh);
      c.setLineDash([]);
      if(d.label){
        if(d.isZone || d.category){
          const tag = (d.category ? "["+d.category.toUpperCase()+"] " : "") + d.label;
          c.font="600 11px system-ui, -apple-system, sans-serif";
          const tw=c.measureText(tag).width;
          const pw=Math.min(tw+14, Math.max(rw-10, 40));
          c.fillStyle=d.color||"#f59e0b";
          c.fillRect(rx,ry,pw,20);
          c.fillStyle="#111827";
          c.fillText(tag,rx+7,ry+14);
        }else{
          TXT(c,d.label,rx+10,ry+14,11.5,d.color||"#6b7280","left");
        }
      }
    }else{
      c.beginPath();
      c.moveTo(d.x1,d.y1);
      c.lineTo(d.x2,d.y2);
      c.stroke();
      c.setLineDash([]);
      if(d.label){
        const mx=(d.x1+d.x2)/2, my=(d.y1+d.y2)/2;
        let rot=Math.atan2(d.y2-d.y1,d.x2-d.x1);
        if(rot>Math.PI/2||rot<-Math.PI/2) rot+=Math.PI;
        c.save();
        c.translate(mx,my);
        c.rotate(rot);
        TXT(c,d.label,0,-8,11.5,d.color||"#6b7280","center");
        c.restore();
      }
    }
    c.restore();
  }
}
/* ---------- Rendu des blocs hiérarchiques et synoptique d'interconnexions sur la feuille racine (page 0) ---------- */
function drawRoundRectPath(c, x, y, w, h, r){
  if(typeof c.roundRect === "function"){
    c.beginPath(); c.roundRect(x, y, w, h, r);
  } else {
    c.beginPath();
    c.moveTo(x + r, y);
    c.lineTo(x + w - r, y);
    c.arcTo(x + w, y, x + w, y + r, r);
    c.lineTo(x + w, y + h - r);
    c.arcTo(x + w, y + h, x + w - r, y + h, r);
    c.lineTo(x + r, y + h);
    c.arcTo(x, y + h, x, y + h - r, r);
    c.lineTo(x, y + r);
    c.arcTo(x, y, x + r, y, r);
    c.closePath();
  }
}

function drawSheetBlocks(c){
  if(S.page !== 0) return;
  const blocks = typeof sheetBlocks === "function" ? sheetBlocks() : [];
  if(!blocks.length){
    c.save();
    c.strokeStyle = "#00c4df"; c.globalAlpha = 0.55; c.lineWidth = 1.5; c.setLineDash([6, 4]);
    c.strokeRect(60, 60, 420, 120);
    c.setLineDash([]);
    TXT(c, "⬡ Feuille hiérarchique racine", 270, 100, 13, "#ffffff", "center");
    TXT(c, "Aucune sous-feuille. Cliquez sur « + Feuille » pour commencer le schéma.", 270, 130, 10, "#8b919c", "center");
    c.restore();
    return;
  }

  c.save();

  // 1. TRACÉ DES INTERCONNEXIONS ET BUS TRAVERSANTS INTER-BLOCS
  const inters = typeof sheetInterconnections === "function" ? sheetInterconnections() : [];
  for(const link of inters){
    const isHover = (S.hoverSheetPort && S.hoverSheetPort.name === link.name);
    const pins = link.pins;
    if(!pins || pins.length < 2) continue;

    c.save();
    if(link.isBus){
      c.strokeStyle = isHover ? "#ffffff" : C_BUS;
      c.lineWidth = isHover ? 5.5 : 4.0;
      c.lineCap = "round";
      c.lineJoin = "round";
    } else if(link.isPower){
      const isGnd = link.name.toUpperCase().includes("GND");
      c.strokeStyle = isHover ? "#ffffff" : (isGnd ? "#22c55e" : "#ef4444");
      c.lineWidth = isHover ? 3.0 : 2.0;
    } else {
      c.strokeStyle = isHover ? "#ffffff" : "#60a5fa";
      c.lineWidth = isHover ? 3.0 : 1.8;
    }

    // Calcul de l'axe de tronc commun (Manhattan corridor)
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    pins.forEach(p => {
      minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
    });

    // Tronc vertical ou horizontal entre les blocs
    let trunkX = (minX + maxX) / 2;
    if(Math.abs(maxX - minX) < 60) trunkX = maxX + 40;

    c.beginPath();
    // Tracé du tronc
    c.moveTo(trunkX, minY);
    c.lineTo(trunkX, maxY);
    c.stroke();

    // Raccordement (taps) de chaque broche au tronc
    pins.forEach(p => {
      c.beginPath();
      const stubX = p.side === "left" ? (p.x - 16) : (p.x + 16);
      c.moveTo(p.x, p.y);
      c.lineTo(stubX, p.y);
      c.lineTo(trunkX, p.y);
      c.stroke();

      // Puce de jonction sur le tronc
      c.save();
      c.fillStyle = isHover ? "#ffffff" : (link.isBus ? C_BUS : (link.isPower ? (link.name.toUpperCase().includes("GND") ? "#22c55e" : "#ef4444") : "#60a5fa"));
      c.beginPath();
      c.arc(trunkX, p.y, link.isBus ? 4.5 : 3.2, 0, Math.PI * 2);
      c.fill();
      c.restore();
    });

    // Badge d'étiquette centrale sur le tronc de bus / signal
    const badgeY = (minY + maxY) / 2;
    const badgeText = (link.isBus ? "≡ " : "") + link.name;
    const badgeW = Math.max(40, badgeText.length * 6.5 + 14);
    const badgeH = link.isBus ? 18 : 16;

    c.save();
    c.fillStyle = link.isBus ? "#09242b" : "#111827";
    c.strokeStyle = isHover ? "#ffffff" : (link.isBus ? C_BUS : (link.isPower ? (link.name.toUpperCase().includes("GND") ? "#22c55e" : "#ef4444") : "#60a5fa"));
    c.lineWidth = link.isBus ? 1.5 : 1.0;
    drawRoundRectPath(c, trunkX - badgeW/2, badgeY - badgeH/2, badgeW, badgeH, 4);
    c.fill();
    c.stroke();

    TXT(c, badgeText, trunkX, badgeY + (link.isBus ? 4.0 : 3.5), link.isBus ? 9.5 : 8.5,
        isHover ? "#ffffff" : (link.isBus ? "#8af0ff" : (link.isPower ? "#fcd34d" : "#bfdbfe")), "center");
    c.restore();

    c.restore();
  }

  // 2. DESSIN DES CARTES DE BLOCS HIÉRARCHIQUES
  for(const b of blocks){
    const isSel = (S.selBlock === b.sheetIndex);
    const isHoverBlock = (S.hoverSheetBlock === b.sheetIndex);

    c.save();
    // Halo de sélection
    if(isSel){
      c.save();
      c.strokeStyle = C_SEL; c.globalAlpha = 0.35; c.lineWidth = 10;
      drawRoundRectPath(c, b.x - 2, b.y - 2, b.w + 4, b.h + 4, 8);
      c.stroke();
      c.restore();
    }

    // Fond du cartouche
    c.fillStyle = "#141820";
    drawRoundRectPath(c, b.x, b.y, b.w, b.h, 6);
    c.fill();

    // Bordure
    c.strokeStyle = isSel ? C_SEL : (isHoverBlock ? "#00c4df" : "#2a3648");
    c.lineWidth = isSel ? 2.5 : 1.8;
    drawRoundRectPath(c, b.x, b.y, b.w, b.h, 6);
    c.stroke();

    // En-tête de la sous-feuille
    c.save();
    c.fillStyle = isSel ? "#1b2836" : "#111f2c";
    c.beginPath();
    c.moveTo(b.x + 6, b.y);
    c.lineTo(b.x + b.w - 6, b.y);
    c.arcTo(b.x + b.w, b.y, b.x + b.w, b.y + 6, 6);
    c.lineTo(b.x + b.w, b.y + 30);
    c.lineTo(b.x, b.y + 30);
    c.lineTo(b.x, b.y + 6);
    c.arcTo(b.x, b.y, b.x + 6, b.y, 6);
    c.closePath();
    c.fill();
    c.strokeStyle = isSel ? C_SEL : "#00c4df";
    c.lineWidth = 1;
    c.beginPath(); c.moveTo(b.x, b.y + 30); c.lineTo(b.x + b.w, b.y + 30); c.stroke();
    c.restore();

    // Titre et statistiques
    const title = "⊞ Feuille " + b.sheetIndex + " : " + (b.name.replace(/^Feuille\s*\d+\s*:\s*/i, ""));
    TXT(c, title, b.x + 12, b.y + 16, 11, "#ffffff", "left");
    TXT(c, b.nComps + " composant(s) · " + b.nWires + " fil(s)", b.x + b.w - 12, b.y + 16, 9.5, "#94a3b8", "right");

    // Dessin des Sheet Pins (broches de ports) sur les côtés gauche et droit
    const dessinerPin = (pin) => {
      const px = pin.x, py = pin.y;
      const isBus = pin.isBus;
      const isPower = pin.isPower;
      const isHoverPin = (S.hoverSheetPort && S.hoverSheetPort.name === pin.name);

      c.save();
      // Connecteur sur le bord
      if(isBus){
        c.strokeStyle = isHoverPin ? "#ffffff" : C_BUS;
        c.lineWidth = 2.4;
        c.beginPath();
        if(pin.side === "left"){
          c.moveTo(px - 6, py - 4.5);
          c.lineTo(px, py);
          c.lineTo(px - 6, py + 4.5);
        } else {
          c.moveTo(px, py - 4.5);
          c.lineTo(px + 6, py);
          c.lineTo(px, py + 4.5);
        }
        c.stroke();
      } else {
        c.fillStyle = isHoverPin ? "#ffffff" : (isPower ? (pin.name.toUpperCase().includes("GND") ? "#22c55e" : "#ef4444") : "#38bdf8");
        c.beginPath();
        c.rect(pin.side === "left" ? (px - 4) : (px), py - 3, 4, 6);
        c.fill();
      }

      // Étiquette du port
      const colTxt = isHoverPin ? "#ffffff" : (isBus ? "#00e5ff" : (isPower ? (pin.name.toUpperCase().includes("GND") ? "#4ade80" : "#f87171") : "#cbd5e1"));
      const align = pin.side === "left" ? "left" : "right";
      const tx = pin.side === "left" ? (px + 10) : (px - 10);
      TXT(c, (isBus ? "≡ " : "") + pin.name, tx, py + 3.5, 9.5, colTxt, align);
      c.restore();
    };

    (b.leftPins || []).forEach(dessinerPin);
    (b.rightPins || []).forEach(dessinerPin);

    // Si aucun port déclaré
    if((!b.leftPins || !b.leftPins.length) && (!b.rightPins || !b.rightPins.length)){
      TXT(c, "Aucun port ou bus déclaré dans cette feuille", b.x + b.w/2, b.y + 65, 9.5, "#64748b", "center");
    }

    // Bouton de navigation
    c.fillStyle = "rgba(0, 196, 223, 0.12)";
    drawRoundRectPath(c, b.x + 12, b.y + b.h - 26, b.w - 24, 20, 4);
    c.fill();
    c.strokeStyle = "rgba(0, 196, 223, 0.35)";
    c.lineWidth = 1;
    drawRoundRectPath(c, b.x + 12, b.y + b.h - 26, b.w - 24, 20, 4);
    c.stroke();
    TXT(c, "Double-clic pour ouvrir la feuille ➔", b.x + b.w/2, b.y + b.h - 13, 9.5, "#8af0ff", "center");

    c.restore();
  }

  c.restore();
}
function drawSel(c){
  // traits graphiques : halo sous le tracé + poignées carrées aux extrémités
  if(S.selD&&S.selD.size){
    c.save();
    c.strokeStyle=C_SEL;c.globalAlpha=.3;c.lineWidth=10;c.lineCap="round";
    c.beginPath();
    for(const d of S.drawings||[]){
      if(!S.selD.has(d.id)&&!S.selD.has(d))continue;
      if(d.shape==="rect"){
        const rx=Math.min(d.x1,d.x2), ry=Math.min(d.y1,d.y2);
        const rw=Math.abs(d.x2-d.x1), rh=Math.abs(d.y2-d.y1);
        c.strokeRect(rx,ry,rw,rh);
      }else{
        c.moveTo(d.x1,d.y1);c.lineTo(d.x2,d.y2);
      }
    }
    c.stroke();
    c.restore();
    const h=HANDLE/S.scale;
    c.fillStyle=C_SEL;
    for(const d of S.drawings||[]){
      if(!S.selD.has(d.id)&&!S.selD.has(d))continue;
      if(d.shape==="rect"){
        c.fillRect(d.x1-h,d.y1-h,h*2,h*2);
        c.fillRect(d.x2-h,d.y1-h,h*2,h*2);
        c.fillRect(d.x2-h,d.y2-h,h*2,h*2);
        c.fillRect(d.x1-h,d.y2-h,h*2,h*2);
      }else{
        c.fillRect(d.x1-h,d.y1-h,h*2,h*2);
        c.fillRect(d.x2-h,d.y2-h,h*2,h*2);
      }
    }
  }
  // fils : halo sous le tracé + poignées carrées aux extrémités
  if(S.selW.size){
    c.save();
    c.strokeStyle=C_SEL;c.globalAlpha=.3;c.lineCap="round";
    for(const w of S.wires){
      if(!S.selW.has(w))continue;
      c.lineWidth=w.bus?15:10;
      c.beginPath();
      c.moveTo(w.x1,w.y1);c.lineTo(w.x2,w.y2);
      c.stroke();
    }
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
  drawDrawings(ctx);
  drawSheetBlocks(ctx);
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
  // aperçu de fil ou bus
  if(S.wireStart){
    const b={x:snap(S.mouse.x),y:snap(S.mouse.y)};
    const isBus=(S.mode==="bus");
    ctx.strokeStyle=isBus?C_BUS:C_WIRE;ctx.globalAlpha=.75;
    ctx.lineWidth=isBus?BUS_WIDTH:3.4;ctx.setLineDash([7,5]);
    ctx.beginPath();
    for(const s of routeL(S.wireStart,b)){ctx.moveTo(s.x1,s.y1);ctx.lineTo(s.x2,s.y2);}
    ctx.stroke();ctx.setLineDash([]);ctx.globalAlpha=1;
    ctx.fillStyle=C_RED;ctx.beginPath();ctx.arc(S.wireStart.x,S.wireStart.y,isBus?6:4.5,0,Math.PI*2);ctx.fill();
  }
  // aperçu de trait / rectangle
  if(S.drawStart){
    const b={x:snap(S.mouse.x),y:snap(S.mouse.y)};
    ctx.strokeStyle="#9aa3b0";ctx.globalAlpha=.85;ctx.lineWidth=2;ctx.setLineDash([8,6]);
    if(S.drawShape==="rect"){
      const rx=Math.min(S.drawStart.x,b.x), ry=Math.min(S.drawStart.y,b.y);
      const rw=Math.abs(b.x-S.drawStart.x), rh=Math.abs(b.y-S.drawStart.y);
      ctx.strokeRect(rx,ry,rw,rh);
      ctx.setLineDash([]);ctx.globalAlpha=1;
      ctx.fillStyle="#9aa3b0";
      ctx.fillRect(S.drawStart.x-3,S.drawStart.y-3,6,6);
      ctx.fillRect(b.x-3,b.y-3,6,6);
    }else{
      ctx.beginPath();
      ctx.moveTo(S.drawStart.x,S.drawStart.y);
      ctx.lineTo(b.x,b.y);
      ctx.stroke();
      ctx.setLineDash([]);ctx.globalAlpha=1;
      ctx.fillStyle="#9aa3b0";
      ctx.beginPath();ctx.arc(S.drawStart.x,S.drawStart.y,4,0,Math.PI*2);ctx.fill();
      ctx.beginPath();ctx.arc(b.x,b.y,4,0,Math.PI*2);ctx.fill();
    }
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
  /* La cote de mesure passe en dernier : c'est une annotation de travail, elle
     doit rester lisible par-dessus le câblage le plus dense. Elle ne va pas
     dans le .png — `exportPng` redessine la feuille elle-même, sans elle. */
  if(typeof rpMesTrace==="function")rpMesTrace(ctx,dpr);
  ctx.setTransform(1,0,0,1,0,0);
  document.getElementById("fZoom").textContent=Math.round(S.scale*100)+"%";
  updateGridInfo();
  document.getElementById("fN").textContent=S.comps.length;
  document.getElementById("fW").textContent=S.wires.length;
  document.getElementById("fNets").textContent=nets().list.length;
}
