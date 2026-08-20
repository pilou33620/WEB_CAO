"use strict";
/* ==========================================================================
   Éditeur PCB — rendu
   Canevas, empilage, remplissage des zones mis en cache, calques techniques.
   ========================================================================== */

/* ==========================================================================
   Rendu
   ========================================================================== */
const cv=$("board"), ctx=cv.getContext("2d");
function resize(){
  const r=cv.parentElement.getBoundingClientRect(), dpr=window.devicePixelRatio||1;
  cv.width=Math.round(r.width*dpr);cv.height=Math.round(r.height*dpr);
  cv.style.width=r.width+"px";cv.style.height=r.height+"px";
  draw();
}
/* Pas réellement affiché : trop serrée à l'écran, la grille devient un aplat.
   On n'en trace alors qu'une case sur deux, sur quatre… et c'est cette case-là,
   celle que l'œil voit, que le pied de page annonce. */
function gridShownStep(){
  let w=S.grid>0?S.grid:0.5;
  for(let i=0;i<20&&w*S.scale<7;i++)w*=2;
  return w;
}
/* Ce que l'œil voit d'abord — la case tracée — puis, quand le zoom a forcé à
   n'en tracer qu'une sur deux, le pas d'accrochage réel. */
function gridLabel(){
  const w=gridShownStep();
  return "1 carré = "+String(r3(w)).replace(".",",")+" mm"+
         (w!==S.grid?" · pas "+String(r3(S.grid)).replace(".",",")+" mm":"");
}
function updateGridInfo(){
  const b=$("fGrid");
  if(!b)return;
  const w=gridShownStep();
  b.textContent=gridLabel();
  b.parentElement.title="Accrochage : "+String(r3(S.grid)).replace(".",",")+" mm"+
    (w!==S.grid?"\nÀ ce niveau de zoom, une case affichée en vaut plusieurs.":"");
  const sel=$("selGrid");
  if(sel&&parseFloat(sel.value)!==S.grid)sel.value=String(S.grid);
  const rg=$("rGrid");
  if(rg&&parseFloat(rg.value)!==S.grid)rg.value=String(S.grid);
}
function drawGrid(c,w,h){
  if(!S.showGrid)return;
  const step=gridShownStep()*S.scale;
  if(step<7)return;
  // la grille part de l'origine utilisateur, pas du zéro absolu
  const o=w2s(S.origin.x,S.origin.y);
  const x0=((o.x%step)+step)%step, y0=((o.y%step)+step)%step;
  c.lineWidth=1;c.strokeStyle=C_GRID;c.beginPath();
  for(let x=x0;x<w;x+=step){c.moveTo(Math.round(x)+.5,0);c.lineTo(Math.round(x)+.5,h);}
  for(let y=y0;y<h;y+=step){c.moveTo(0,Math.round(y)+.5);c.lineTo(w,Math.round(y)+.5);}
  c.stroke();
  const big=step*5;
  const bx=((o.x%big)+big)%big, by=((o.y%big)+big)%big;
  c.strokeStyle=C_GRIDMAJ;c.beginPath();
  for(let x=bx;x<w;x+=big){c.moveTo(Math.round(x)+.5,0);c.lineTo(Math.round(x)+.5,h);}
  for(let y=by;y<big+h;y+=big){c.moveTo(0,Math.round(y)+.5);c.lineTo(w,Math.round(y)+.5);}
  c.stroke();
}
/* ordre de peinture : de la couche la plus lointaine à la plus proche, la
   couche active toujours en dernier pour rester lisible */
function layerOrder(){
  const a=[];
  if(S.flip)for(let i=0;i<S.cu;i++)a.push(i);
  else for(let i=S.cu-1;i>=0;i--)a.push(i);
  const r=a.filter(i=>i!==S.active);
  r.push(S.active);
  return r;
}
function layerAlpha(i){
  if(!S.cuL[i]||!S.cuL[i].vis)return 0;
  if(i===S.active||S.contrast===0)return 1;
  return S.contrast===1?0.34:0;
}
function netAlpha(net){
  if(!S.hlNet)return 1;
  return net===S.hlNet?1:0.28;
}
/* net que l'on suit du regard : celui du tracé en cours, sinon celui choisi
   dans la liste */
function focusNet(){return (S.route&&S.route.net)||S.hlNet||null;}

/* ---------- zones de cuivre ----------
   Le remplissage d'une couche (toutes ses zones) est calculé une fois dans un
   canevas hors écran : le recalculer à chaque image coûterait bien trop cher.
   Le cache est invalidé par le compteur de version, et régénéré quand le zoom
   a suffisamment changé pour que la finesse ne suive plus. */
const zoneCache=new Map();
function zoneCanvas(i){
  const zs=S.zones.filter(z=>z.l===i&&z.pts.length>=3);
  if(!zs.length)return null;
  const res=clamp(S.scale*2,3,20);
  const old=zoneCache.get(i);
  if(old&&old.ver===S.ver&&Math.abs(Math.log(old.res/res))<0.45)return old;

  let x1=1e9,y1=1e9,x2=-1e9,y2=-1e9;
  for(const z of zs){
    const b=polyBBox(z.pts);
    x1=Math.min(x1,b.x1);y1=Math.min(y1,b.y1);
    x2=Math.max(x2,b.x2);y2=Math.max(y2,b.y2);
  }
  const pad=1;
  x1-=pad;y1-=pad;x2+=pad;y2+=pad;
  const W=Math.max(1,Math.ceil((x2-x1)*res)), H=Math.max(1,Math.ceil((y2-y1)*res));
  if(W*H>36e6)return null;                     // garde-fou mémoire
  const o=document.createElement("canvas");o.width=W;o.height=H;
  const c=o.getContext("2d");
  c.setTransform(res,0,0,res,-x1*res,-y1*res);
  const col=layerColor(i);
  c.fillStyle=col;
  for(const z of zs){
    c.beginPath();
    c.moveTo(z.pts[0].x,z.pts[0].y);
    for(let k=1;k<z.pts.length;k++)c.lineTo(z.pts[k].x,z.pts[k].y);
    c.closePath();c.fill();
  }
  /* le cuivre s'arrête à la marge de bord, quoi qu'ait tracé la main */
  clipToBoard(c,x1,y1,x2,y2);

  /* dégagements : tout ce qui n'appartient pas à la zone qui le recouvre */
  const clr=classOf(zs[0].net||"").clr, thermals=[];
  const sameNet=(x,y,net)=>{
    const z=zoneAt(i,x,y);
    return !!(z&&net&&z.net===net);
  };
  const zoneNetAt=(l,x,y)=>{const z=zoneAt(l,x,y);return z?z.net:"";};
  c.strokeStyle="#000";c.fillStyle="#000";c.lineCap="round";c.lineJoin="round";
  for(const ct of S.cuts){
    if(ct.l!==i||ct.pts.length<2)continue;
    c.beginPath();
    c.moveTo(ct.pts[0].x,ct.pts[0].y);
    for(let k=1;k<ct.pts.length;k++)c.lineTo(ct.pts[k].x,ct.pts[k].y);
    c.closePath();c.fill();
  }
  for(const t of S.tracks){
    if(t.l!==i)continue;
    if(sameNet((t.x1+t.x2)/2,(t.y1+t.y2)/2,t.net))continue;
    c.lineWidth=t.w+2*clrPair(zoneNetAt(i,(t.x1+t.x2)/2,(t.y1+t.y2)/2),t.net);
    c.beginPath();c.moveTo(t.x1,t.y1);c.lineTo(t.x2,t.y2);c.stroke();
  }
  for(const v of S.vias){
    if(i<v.a||i>v.b)continue;
    const same=sameNet(v.x,v.y,v.net);
    c.beginPath();
    c.arc(v.x,v.y,same?v.drill/2:v.d/2+clrPair(zoneNetAt(i,v.x,v.y),v.net),0,Math.PI*2);
    c.fill();
  }
  for(const fp of S.fps)
    for(const q of padsWorld(fp)){
      if(!padLayers(fp,q).includes(i))continue;
      const same=sameNet(q.x,q.y,q.net);
      padFill(c,q,same?clr:clrPair(zoneNetAt(i,q.x,q.y),q.net));
      if(same)thermals.push(q);
      else if(q.drill>0){c.beginPath();c.arc(q.x,q.y,q.drill/2+clr,0,Math.PI*2);c.fill();}
    }
  /* liaisons thermiques : quatre bras, sinon la pastille chaufferait toute la
     zone au moment du brasage */
  c.globalCompositeOperation="source-over";
  c.fillStyle=col;
  const tw=S.rule.thermal;
  for(const q of thermals){
    const len=Math.max(q.w,q.h)/2+clr+0.2;
    c.save();c.translate(q.x,q.y);c.rotate(q.rot);
    c.fillRect(-len,-tw/2,len*2,tw);
    c.fillRect(-tw/2,-len,tw,len*2);
    c.restore();
    if(q.drill>0){
      c.save();c.globalCompositeOperation="destination-out";
      c.beginPath();c.arc(q.x,q.y,q.drill/2,0,Math.PI*2);c.fill();c.restore();
    }
  }
  const rec={ver:S.ver,res,cvs:o,x:x1,y:y1,w:W/res,h:H/res};
  zoneCache.set(i,rec);
  return rec;
}
function padFill(c,q,grow,color){
  c.save();c.translate(q.x,q.y);c.rotate(q.rot);
  const g=grow||0;
  c.beginPath();
  if(q.shape==="circ")c.arc(0,0,Math.max(q.w,q.h)/2+g,0,Math.PI*2);
  else{
    const w=q.w+2*g, h=q.h+2*g, r=Math.min(w,h)*0.22;
    c.moveTo(-w/2+r,-h/2);
    c.arcTo(w/2,-h/2,w/2,h/2,r);c.arcTo(w/2,h/2,-w/2,h/2,r);
    c.arcTo(-w/2,h/2,-w/2,-h/2,r);c.arcTo(-w/2,-h/2,w/2,-h/2,r);
    c.closePath();
  }
  if(color)c.fillStyle=color;
  c.fill();
  c.restore();
}
function polyPath(c,pts){
  if(!pts||pts.length<2)return;
  c.moveTo(pts[0].x,pts[0].y);
  for(let i=1;i<pts.length;i++)c.lineTo(pts[i].x,pts[i].y);
  c.closePath();
}
/* Rogne ce qui a été peint au contour de carte, marge de bord comprise : on
   efface l'extérieur du polygone, puis on mange une bande au trait le long du
   bord. Le même traitement sert au rendu et à l'analyse des îlots. */
function clipToBoard(c,x1,y1,x2,y2){
  const P=boardPoly(), m=S.rule.edge;
  c.globalCompositeOperation="destination-out";
  c.beginPath();
  c.rect(x1-1,y1-1,(x2-x1)+2,(y2-y1)+2);
  polyPath(c,P);
  c.fill("evenodd");
  if(m>0){
    c.beginPath();polyPath(c,P);
    c.lineWidth=2*m;c.lineJoin="round";c.lineCap="round";
    c.strokeStyle="#000";c.stroke();
  }
}
function drawBoard(c){
  const P=boardPoly();
  c.fillStyle=C_SUB;
  c.beginPath();polyPath(c,P);c.fill();
  if(S.show.edge){
    c.strokeStyle=S.sel.edge?C_SEL:C_EDGE;
    c.lineWidth=px(S.sel.edge?2:1.6);
    c.beginPath();polyPath(c,P);c.stroke();
    c.strokeStyle="rgba(230,232,236,.20)";c.lineWidth=px(1);
    c.setLineDash([px(5),px(4)]);
    c.beginPath();polyPath(c,P);c.stroke();      // rappel visuel de la marge
    c.setLineDash([]);
    if(S.sel.edge){
      c.fillStyle=C_SEL;
      for(const p of P){c.beginPath();c.arc(p.x,p.y,px(3.5),0,Math.PI*2);c.fill();}
    }
  }
}
function drawOrigin(c){
  const o=S.origin, r=px(9);
  c.strokeStyle="#f2c744";c.lineWidth=px(1.4);
  c.beginPath();c.arc(o.x,o.y,r*0.55,0,Math.PI*2);c.stroke();
  c.beginPath();
  c.moveTo(o.x-r,o.y);c.lineTo(o.x+r,o.y);
  c.moveTo(o.x,o.y-r);c.lineTo(o.x,o.y+r);
  c.stroke();
  if(S.scale>3)TXT(c,"0,0",o.x+px(20),o.y-px(10),px(11),"#f2c744");
}
function drawEdgeDraft(c){
  const Z=S.edgeDraft;
  if(!Z||!Z.pts.length)return;
  const pts=Z.pts.concat(Z.cur?[Z.cur]:[]);
  c.strokeStyle=C_EDGE;c.lineWidth=px(1.8);c.setLineDash([px(7),px(4)]);
  c.beginPath();
  c.moveTo(pts[0].x,pts[0].y);
  for(let k=1;k<pts.length;k++)c.lineTo(pts[k].x,pts[k].y);
  c.stroke();c.setLineDash([]);
  if(pts.length>2){
    c.globalAlpha=0.12;c.fillStyle=C_EDGE;
    c.beginPath();
    c.moveTo(pts[0].x,pts[0].y);
    for(let k=1;k<pts.length;k++)c.lineTo(pts[k].x,pts[k].y);
    c.closePath();c.fill();c.globalAlpha=1;
  }
  c.fillStyle=C_EDGE;
  for(const p of Z.pts){c.beginPath();c.arc(p.x,p.y,px(2.6),0,Math.PI*2);c.fill();}
  c.strokeStyle=C_SEL;c.lineWidth=px(1.6);
  c.beginPath();c.arc(Z.pts[0].x,Z.pts[0].y,px(6),0,Math.PI*2);c.stroke();
}
function drawTracks(c,i,a){
  c.lineCap="round";c.lineJoin="round";
  const col=layerColor(i);
  for(const t of S.tracks){
    if(t.l!==i)continue;
    c.globalAlpha=a*netAlpha(t.net);
    c.strokeStyle=col;c.lineWidth=t.w;
    c.beginPath();c.moveTo(t.x1,t.y1);c.lineTo(t.x2,t.y2);c.stroke();
    if(S.sel.tracks.has(t)){
      c.globalAlpha=a;c.strokeStyle=C_SEL;c.lineWidth=Math.max(t.w*0.35,px(1.5));
      c.beginPath();c.moveTo(t.x1,t.y1);c.lineTo(t.x2,t.y2);c.stroke();
    }
  }
  c.globalAlpha=1;
}
function drawSmdPads(c,i,a){
  const col=layerColor(i);
  for(const fp of S.fps){
    for(const q of padsWorld(fp)){
      if(q.drill>0)continue;
      if(padLayers(fp,q)[0]!==i)continue;
      c.globalAlpha=a*netAlpha(q.net);
      padFill(c,q,0,col);
    }
  }
  c.globalAlpha=1;
}
function drawThruPads(c){
  for(const fp of S.fps)
    for(const q of padsWorld(fp)){
      if(!(q.drill>0))continue;
      c.globalAlpha=netAlpha(q.net);
      padFill(c,q,0,C_THRU);
      c.fillStyle=C_DRILL;
      c.beginPath();c.arc(q.x,q.y,q.drill/2,0,Math.PI*2);c.fill();
    }
  c.globalAlpha=1;
}
function drawVias(c){
  for(const v of S.vias){
    c.globalAlpha=netAlpha(v.net);
    const thru=(v.a===0&&v.b===S.cu-1);
    c.fillStyle=thru?C_THRU:layerColor(v.a);
    c.beginPath();c.arc(v.x,v.y,v.d/2,0,Math.PI*2);c.fill();
    if(!thru){                     // via borgne : anneau bicolore, de a vers b
      c.strokeStyle=layerColor(v.b);c.lineWidth=v.d*0.22;
      c.beginPath();c.arc(v.x,v.y,v.d/2-v.d*0.11,0,Math.PI*2);c.stroke();
    }
    c.fillStyle=C_DRILL;
    c.beginPath();c.arc(v.x,v.y,v.drill/2,0,Math.PI*2);c.fill();
    if(S.sel.vias.has(v)){
      c.strokeStyle=C_SEL;c.lineWidth=px(1.6);
      c.beginPath();c.arc(v.x,v.y,v.d/2+px(2),0,Math.PI*2);c.stroke();
    }
  }
  c.globalAlpha=1;
}
function drawSilk(c){
  for(const fp of S.fps){
    const top=!fp.side;
    if(top&&!S.show.silkT)continue;
    if(!top&&!S.show.silkB)continue;
    const T=fpXform(fp), b=bodyOf(fp);
    const pts=[T(b.x1,b.y1),T(b.x2,b.y1),T(b.x2,b.y2),T(b.x1,b.y2)];
    const sel=S.sel.fps.has(fp.id);
    c.globalAlpha=S.hlNet?0.55:1;
    c.strokeStyle=sel?C_SEL:(top?C_SILK_T:C_SILK_B);
    c.lineWidth=px(1.2);
    c.beginPath();
    c.moveTo(pts[0].x,pts[0].y);
    for(let i=1;i<4;i++)c.lineTo(pts[i].x,pts[i].y);
    c.closePath();c.stroke();
    if(sel){
      c.fillStyle="rgba(138,240,255,.10)";c.fill();
    }
    // repère de broche 1
    const ps=padsWorld(fp);
    if(ps.length){
      const p1=ps[0];
      c.fillStyle=sel?C_SEL:(top?C_SILK_T:C_SILK_B);
      c.beginPath();c.arc(p1.x,p1.y,Math.max(p1.w,p1.h)/2+px(2.2),0,Math.PI*2);
      c.globalAlpha=(S.hlNet?0.5:0.85);c.fill();c.globalAlpha=S.hlNet?0.55:1;
    }
    // repère + valeur
    const tp = fpTextPos(fp);
    TXT(c,fp.ref,tp.ref.x,tp.ref.y,tp.ref.size,
        sel?C_SEL:(top?C_SILK_T:C_SILK_B));
    if(S.scale>6&&fp.value)
      TXT(c,fp.value,tp.val.x,tp.val.y,tp.val.size,"#9aa3b0");
  }
  c.globalAlpha=1;
}
function TXT(c,t,x,y,size,col){
  c.save();
  c.translate(x,y);
  if(S.flip)c.scale(-1,1);
  c.fillStyle=col||"#fff";
  c.font="bold "+size+'px "Segoe UI",system-ui,sans-serif';
  c.textAlign="center";c.textBaseline="middle";
  c.fillText(String(t),0,0);
  c.restore();
}
/* Toutes les pastilles du net suivi reçoivent un halo : pendant un routage,
   savoir d'un coup d'œil où sont les points à relier change tout. */
function drawNetPads(c){
  const n=focusNet();
  if(!n)return;
  const col=netColor(n);
  for(const fp of S.fps)
    for(const q of padsWorld(fp)){
      if(q.net!==n)continue;
      const r=Math.max(q.w,q.h)/2+px(3.5);
      c.globalAlpha=0.22;c.fillStyle=col;
      c.beginPath();c.arc(q.x,q.y,r,0,Math.PI*2);c.fill();
      c.globalAlpha=1;c.strokeStyle=col;c.lineWidth=px(1.8);
      c.beginPath();c.arc(q.x,q.y,r,0,Math.PI*2);c.stroke();
    }
  c.globalAlpha=1;
}
function drawRats(c){
  if(!S.show.rats)return;
  const R=conn().rats, fn=focusNet();
  c.lineWidth=px(1);
  c.setLineDash([px(4),px(3)]);
  for(const r of R){
    const hl=fn&&r.net===fn;
    c.globalAlpha=fn?(hl?1:(S.hlNet?0.12:0.45)):0.75;
    c.strokeStyle=hl?netColor(r.net):C_RATS;
    if(hl)c.lineWidth=px(1.6);else c.lineWidth=px(1);
    c.beginPath();c.moveTo(r.x1,r.y1);c.lineTo(r.x2,r.y2);c.stroke();
  }
  c.setLineDash([]);c.globalAlpha=1;
}
function drawDrc(c){
  if(!S.show.drc||!S.drc.length)return;
  for(const e of S.drc){
    if(e.info)continue;
    c.strokeStyle=C_ERR;c.lineWidth=px(1.6);
    c.beginPath();c.arc(e.x,e.y,px(9),0,Math.PI*2);c.stroke();
    c.beginPath();
    c.moveTo(e.x-px(6),e.y-px(6));c.lineTo(e.x+px(6),e.y+px(6));
    c.moveTo(e.x+px(6),e.y-px(6));c.lineTo(e.x-px(6),e.y+px(6));
    c.stroke();
  }
}
function drawZones(c,i,a){
  for(const z of S.zones){
    if(z.l!==i||z.pts.length<2)continue;
    const sel=S.sel.zones.has(z);
    c.globalAlpha=a*(sel?1:0.5);
    c.strokeStyle=sel?C_SEL:layerColor(i);
    c.lineWidth=px(sel?1.6:1);
    c.setLineDash(sel?[]:[px(5),px(4)]);
    c.beginPath();
    c.moveTo(z.pts[0].x,z.pts[0].y);
    for(let k=1;k<z.pts.length;k++)c.lineTo(z.pts[k].x,z.pts[k].y);
    c.closePath();c.stroke();
    c.setLineDash([]);
    if(sel){
      c.fillStyle=C_SEL;
      for(const p of z.pts){
        c.beginPath();c.arc(p.x,p.y,px(3.5),0,Math.PI*2);c.fill();
      }
    }
  }
  for(const ct of S.cuts){
    if(ct.l!==i||ct.pts.length<2)continue;
    c.globalAlpha=a*0.6;
    c.strokeStyle="#000"; // Noir / Trou
    c.lineWidth=px(1);
    c.setLineDash([px(3),px(3)]);
    c.beginPath();
    c.moveTo(ct.pts[0].x,ct.pts[0].y);
    for(let k=1;k<ct.pts.length;k++)c.lineTo(ct.pts[k].x,ct.pts[k].y);
    c.closePath();c.stroke();
    c.setLineDash([]);
  }
  c.globalAlpha=1;
}
function drawZoneDraft(c){
  const Z=S.zoneDraft;
  if(!Z||!Z.pts.length)return;
  const col=layerColor(Z.l);
  const pts=Z.pts.concat(Z.cur?[Z.cur]:[]);
  c.strokeStyle=col;c.lineWidth=px(1.6);c.setLineDash([px(6),px(4)]);
  c.beginPath();
  c.moveTo(pts[0].x,pts[0].y);
  for(let k=1;k<pts.length;k++)c.lineTo(pts[k].x,pts[k].y);
  if(pts.length>2){
    c.globalAlpha=0.45;c.lineTo(pts[0].x,pts[0].y);
  }
  c.stroke();c.globalAlpha=1;c.setLineDash([]);
  if(pts.length>2){
    c.globalAlpha=0.16;c.fillStyle=col;
    c.beginPath();
    c.moveTo(pts[0].x,pts[0].y);
    for(let k=1;k<pts.length;k++)c.lineTo(pts[k].x,pts[k].y);
    c.closePath();c.fill();c.globalAlpha=1;
  }
  c.fillStyle=col;
  for(const p of Z.pts){c.beginPath();c.arc(p.x,p.y,px(2.6),0,Math.PI*2);c.fill();}
  // le premier point est la cible de fermeture : on le montre comme tel
  c.strokeStyle=C_SEL;c.lineWidth=px(1.6);
  c.beginPath();c.arc(Z.pts[0].x,Z.pts[0].y,px(6),0,Math.PI*2);c.stroke();
}
function drawCutDraft(c){
  const C=S.cutDraft;
  if(!C||!C.pts.length)return;
  const pts=C.pts.concat(C.cur?[C.cur]:[]);
  c.strokeStyle="#000";c.lineWidth=px(1.6);c.setLineDash([px(6),px(4)]);
  c.beginPath();
  c.moveTo(pts[0].x,pts[0].y);
  for(let k=1;k<pts.length;k++)c.lineTo(pts[k].x,pts[k].y);
  if(pts.length>2){c.globalAlpha=0.45;c.lineTo(pts[0].x,pts[0].y);}
  c.stroke();c.globalAlpha=1;c.setLineDash([]);
  c.fillStyle="#000";
  for(const p of C.pts){c.beginPath();c.arc(p.x,p.y,px(2.6),0,Math.PI*2);c.fill();}
  c.strokeStyle=C_SEL;c.lineWidth=px(1.6);
  c.beginPath();c.arc(C.pts[0].x,C.pts[0].y,px(6),0,Math.PI*2);c.stroke();
}
function drawRoute(c){
  const R=S.route;
  if(!R)return;
  const col=layerColor(R.layer);
  c.lineCap="round";c.lineJoin="round";
  c.globalAlpha=0.85;c.strokeStyle=col;c.lineWidth=R.w;
  for(const s of R.done){
    c.beginPath();c.moveTo(s.x1,s.y1);c.lineTo(s.x2,s.y2);c.stroke();
  }
  c.setLineDash([px(6),px(4)]);
  if(R.bad)c.strokeStyle=C_ERR;       // l'aperçu passe au rouge s'il ne respecte pas l'isolation
  for(const s of R.preview){
    c.beginPath();c.moveTo(s.x1,s.y1);c.lineTo(s.x2,s.y2);c.stroke();
  }
  c.setLineDash([]);
  c.globalAlpha=1;
  c.fillStyle=C_SEL;
  c.beginPath();c.arc(R.pt.x,R.pt.y,px(3),0,Math.PI*2);c.fill();
  if(R.end&&R.pushed){                // repoussé : on montre où le point a été ramené
    c.strokeStyle=C_ERR;c.lineWidth=px(1.4);
    c.beginPath();c.arc(R.end.x,R.end.y,px(7),0,Math.PI*2);c.stroke();
  }
}
function drawTextLink(c){
  if(!S.hlText)return;
  const fp=S.hlText.fpText;
  if(!fp)return;
  const tp=fpTextPos(fp);
  const tx=S.hlText.kind==="ref"?tp.ref.x:tp.val.x;
  const ty=S.hlText.kind==="ref"?tp.ref.y:tp.val.y;
  c.strokeStyle=C_SEL;
  c.lineWidth=px(1);
  c.setLineDash([px(2),px(2)]);
  c.beginPath();
  c.moveTo(fp.x,fp.y);
  c.lineTo(tx,ty);
  c.stroke();
  c.setLineDash([]);
}
function drawHover(c){
  if(S.mode==="select"||!S.hover)return;
  const h=S.hover;
  c.strokeStyle=C_SEL;c.lineWidth=px(1.6);
  c.beginPath();c.arc(h.x,h.y,px(7),0,Math.PI*2);c.stroke();
}
function paint(c,dpr,w,h,noGrid){
  c.setTransform(1,0,0,1,0,0);
  c.fillStyle=C_BG;c.fillRect(0,0,w,h);
  if(!noGrid){c.save();c.scale(dpr,dpr);drawGrid(c,w/dpr,h/dpr);c.restore();}

  setWorld(c,dpr);
  drawBoard(c);

  for(const i of layerOrder()){
    const a=layerAlpha(i);
    if(a<=0)continue;
    if(S.show.plane){
      const o=zoneCanvas(i);
      if(o){
        const zn=S.zones.find(z=>z.l===i&&z.net);
        c.globalAlpha=a*(S.hlNet&&(!zn||zn.net!==S.hlNet)?0.2:0.85);
        c.drawImage(o.cvs,o.x,o.y,o.w,o.h);
        c.globalAlpha=1;
      }
      drawZones(c,i,a);
    }
    drawTracks(c,i,a);
    drawSmdPads(c,i,a);
  }
  drawVias(c);
  drawThruPads(c);
  drawNetPads(c);
  drawRats(c);
  drawSilk(c);
  drawTech(c);
  drawRoute(c);
  drawZoneDraft(c);
  drawCutDraft(c);
  drawEdgeDraft(c);
  drawOrigin(c);
  drawTextLink(c);
  drawHover(c);
  drawDrc(c);
  if(S.marquee){
    const m=S.marquee;
    c.strokeStyle=C_SEL;c.lineWidth=px(1);c.setLineDash([px(4),px(3)]);
    c.strokeRect(Math.min(m.x1,m.x2),Math.min(m.y1,m.y2),
      Math.abs(m.x2-m.x1),Math.abs(m.y2-m.y1));
    c.setLineDash([]);
  }
  c.setTransform(1,0,0,1,0,0);
}
function draw(){
  const dpr=window.devicePixelRatio||1;
  paint(ctx,dpr,cv.width,cv.height,false);
  $("fZoom").textContent=Math.round(S.scale*20)+"%";
  updateGridInfo();
  $("fN").textContent=S.fps.length;
  $("fT").textContent=S.tracks.length;
  $("fV").textContent=S.vias.length;
  const cc=conn();
  $("fU").textContent=(cc.approx?"~":"")+cc.unrouted;
  $("fLayer").textContent=cuId(S.active,S.cu);
}
function fit(){
  const b=S.board;
  let x1=b.x,y1=b.y,x2=b.x+b.w,y2=b.y+b.h;
  for(const fp of S.fps){
    const q=fpBBox(fp);
    x1=Math.min(x1,q.x1);y1=Math.min(y1,q.y1);x2=Math.max(x2,q.x2);y2=Math.max(y2,q.y2);
  }
  const pad=8, W=cv.clientWidth, H=cv.clientHeight;
  S.scale=clamp(Math.min(W/(x2-x1+pad*2),H/(y2-y1+pad*2)),0.5,60);
  const cx=(x1+x2)/2, cy=(y1+y2)/2;
  S.ox=W/2-mirX(cx)*S.scale;
  S.oy=H/2-cy*S.scale;
  draw();
}
