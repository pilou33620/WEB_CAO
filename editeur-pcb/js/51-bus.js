/* ==========================================================================
   51-bus.js — router plusieurs pistes à la fois (le « multi-routing » d'Altium)
   --------------------------------------------------------------------------
   En mode Bus : on clique les pastilles de départ une à une (un second clic
   en retire une), puis, dans le vide, les sommets du trajet ; Entrée pose.
   Chaque pastille reçoit sa piste, parallèle au trajet tracé, au pas de la
   plus large piste plus l'isolement le plus grand des nets du bus. L'ordre des
   pistes suit celui des pastilles le long du premier tronçon : elles ne se
   croisent pas en partant.
   Les pistes posées passent par le même contrôle que le tracé (`segBad`) :
   un segment en faute est signalé, pas refusé — Ctrl+Z retire tout le bus.
   ========================================================================== */
S.bus=null;                   // {pads:[{fp,q}], pts:[{x,y}], cur}

function busPastille(x,y){
  for(let i=S.fps.length-1;i>=0;i--){
    const fp=S.fps[i];
    for(const q of padsWorld(fp))
      if(q.net&&padDist(x,y,q)<=px(3)&&padCuLayers(fp,q).includes(S.active))return {fp,q};
  }
  return null;
}
/* Le pas du bus et l'écart de chaque piste à l'axe, dans l'ordre des pastilles
   projetées sur la normale du premier tronçon. */
function busPlan(B){
  const P=B.pts;
  if(B.pads.length<1||P.length<2)return null;
  const l=S.active, nets=B.pads.map(o=>o.q.net);
  const w=Math.max(...nets.map(n=>defaultWidth(n,l)));
  let clr=0;
  for(const a of nets)for(const b of nets)if(a!==b)clr=Math.max(clr,clrK(a,b,"trk","trk"));
  if(!clr)clr=Math.max(...nets.map(n=>classOf(n).clr));
  const pas=r3(w+clr);
  const dx=P[1].x-P[0].x, dy=P[1].y-P[0].y, L=Math.hypot(dx,dy)||1, nx=-dy/L, ny=dx/L;
  const ordre=B.pads.slice().sort((a,b)=>((a.q.x-P[0].x)*nx+(a.q.y-P[0].y)*ny)-((b.q.x-P[0].x)*nx+(b.q.y-P[0].y)*ny));
  const n=ordre.length;
  return {pas,ordre:ordre.map((o,i)=>({...o,d:(i-(n-1)/2)*pas}))};
}
/* La polyligne P décalée de d (à gauche de son sens), coins en onglet. */
function polyDecalee(P,d){
  const N=[];
  for(let k=0;k+1<P.length;k++){
    const dx=P[k+1].x-P[k].x, dy=P[k+1].y-P[k].y, L=Math.hypot(dx,dy)||1;
    N.push({x:-dy/L,y:dx/L});
  }
  return P.map((p,k)=>{
    if(k===0)return {x:p.x+N[0].x*d,y:p.y+N[0].y*d};
    if(k===P.length-1)return {x:p.x+N[k-1].x*d,y:p.y+N[k-1].y*d};
    const a=N[k-1], b=N[k], c=1+a.x*b.x+a.y*b.y;
    if(c<1e-6)return {x:p.x+a.x*d,y:p.y+a.y*d};      // demi-tour : pas d'onglet possible
    return {x:p.x+(a.x+b.x)*d/c,y:p.y+(a.y+b.y)*d/c};
  });
}
/* Pose le bus : rend {pistes, fautes}. */
function busPoser(B){
  const plan=busPlan(B);
  if(!plan){hint("Bus : cliquez au moins une pastille, puis deux points du trajet.");return null;}
  const l=S.active;
  push();clearSel();
  let fautes=0;
  const posees=[];
  for(const o of plan.ordre){
    const Q=polyDecalee(B.pts,o.d), w=defaultWidth(o.q.net,l);
    const chaine=[{x:o.q.x,y:o.q.y}].concat(Q);
    for(let k=0;k+1<chaine.length;k++){
      const a=chaine[k], b=chaine[k+1];
      if(dist(a.x,a.y,b.x,b.y)<1e-4)continue;
      const t={l,net:o.q.net,w,x1:r3(a.x),y1:r3(a.y),x2:r3(b.x),y2:r3(b.y)};
      posees.push(t);
    }
  }
  for(const t of posees){S.tracks.push(t);S.sel.tracks.add(t);}
  touch();
  for(const t of posees)if(pnsWorld().segBad(t,t.l,t.net,t.w,new Set([t])))fautes++;
  refreshPanels();draw();
  hint(plan.ordre.length+" piste(s) posée(s) en bus au pas de "+fmt(plan.pas,3)+" mm"+
       (fautes?" · "+fautes+" segment(s) sous l'isolement : le DRC les montrera":"")+" — Ctrl+Z retire le bus.");
  return {pistes:posees,fautes};
}

/* ---------- les gestes ---------- */
function busClic(x,y){
  if(S.mode!=="bus")return false;
  const B=S.bus||(S.bus={pads:[],pts:[],cur:null});
  if(!B.pts.length){
    const h=busPastille(x,y);
    if(h){
      const i=B.pads.findIndex(o=>o.q.x===h.q.x&&o.q.y===h.q.y&&o.fp===h.fp);
      if(i>=0)B.pads.splice(i,1);else B.pads.push(h);
      hint("Bus : "+B.pads.length+" pastille(s) — cliquez-en d'autres, puis le premier point du trajet dans le vide.");
      return true;
    }
    if(!B.pads.length){hint("Bus : commencez par cliquer les pastilles de départ (couche "+cuId(S.active,S.cu)+").");return true;}
  }
  const p={x:snapX(x),y:snapY(y)}, der=B.pts[B.pts.length-1];
  if(der&&dist(p.x,p.y,der.x,der.y)<1e-6)return true;   // tronçon nul : sa normale serait (0, 0)
  B.pts.push(p);
  hint("Bus : "+B.pts.length+" sommet(s) du trajet — Entrée pose les "+B.pads.length+" pistes, Retour arrière défait, Échap abandonne.");
  return true;
}
function busBouge(x,y){
  if(S.mode!=="bus"||!S.bus)return false;
  S.bus.cur={x:snapX(x),y:snapY(y)};
  return true;
}
function busTouche(k){
  if(S.mode!=="bus"||!S.bus)return false;
  if(k==="enter"){const B=S.bus;S.bus=null;busPoser(B);return true;}
  if(k==="escape"){S.bus=null;hint("Bus abandonné.");draw();return true;}
  if(k==="backspace"){if(S.bus.pts.length)S.bus.pts.pop();else S.bus.pads.pop();draw();return true;}
  return false;
}
function busApercu(c){
  const B=S.bus;
  if(S.mode!=="bus"||!B)return;
  c.save();c.strokeStyle=C_SEL;c.fillStyle=C_SEL;c.lineWidth=px(1.4);
  for(const o of B.pads){c.beginPath();c.arc(o.q.x,o.q.y,Math.max(o.q.w,o.q.h)/2+px(3),0,Math.PI*2);c.stroke();}
  const pts=B.pts.concat(B.cur?[B.cur]:[]);
  const plan=pts.length>=2?busPlan({pads:B.pads,pts}):null;
  c.setLineDash([px(4),px(3)]);
  if(plan)for(const o of plan.ordre){
    const Q=[{x:o.q.x,y:o.q.y}].concat(polyDecalee(pts,o.d));
    c.beginPath();c.moveTo(Q[0].x,Q[0].y);for(const q of Q)c.lineTo(q.x,q.y);c.stroke();
  }
  c.restore();
}
(function(){
  const b=$("mBus");
  if(b)b.onclick=()=>{setMode("bus");S.bus=null;
    hint("Bus : cliquez les pastilles de départ (couche "+cuId(S.active,S.cu)+"), puis les sommets du trajet ; Entrée pose.");};
})();
