"use strict";
/* ==========================================================================
   Les larmes (teardrops) : un renfort de cuivre entre une piste et le via ou la
   pastille ronde où elle s'arrête. Le foret qui dévie n'y coupe plus la piste.
   --------------------------------------------------------------------------
   Comme KiCad, une larme est une zone : rendu, Gerber et IPC-2581 savent la
   sortir. Son cuivre est figé (`fichier`), et sa priorité oblige un plan d'un
   autre net à se détourer autour d'elle, isolement compris (`zoneDessus`). Elle
   ne compte ni dans les liaisons ni dans les îlots (`zoneGroups`, `zoneAt`) : ce
   qu'elle renforce est déjà relié.
   Le geste les recalcule toutes. Rien ne les suit ensuite : le DRC dit quand le
   cuivre a bougé et qu'il faut relancer le geste (`larmesPerimees`).
   shortcut: ronds seulement, ni oblong ni rectangle, et une piste droite qui
   sort du centre ; à étendre si un fabricant le réclame.
   ========================================================================== */
const LARME_PRIO=1000;
const LARME_ANGLES=[Math.PI/3,Math.PI/4,Math.PI/6];   // de la plus large à la plus étroite, tant que ça gêne
const LARME_LONG=1;                                   // longueur maximale hors du rond, en mm

/* Le contour : deux flancs creusés, du bord du rond (C, r) à la piste. `u` est
   la direction de la piste. La base est une corde : elle reste dans le cuivre. */
function larmeForme(C,r,u,w,L,angle){
  const n={x:-u.y,y:u.x}, b=r*Math.cos(angle), H=r*Math.sin(angle), T=r+L;
  if(H<=w/2*1.05)return null;
  const flanc=[];
  for(let k=0;k<=4;k++){
    const t=k/4, m=1-t;
    flanc.push({a:m*m*b+2*m*t*(r+L*0.15)+t*t*T, h:m*m*H+2*m*t*(w/2)+t*t*(w/2)});
  }
  const pt=(a,h)=>({x:r3(C.x+u.x*a+n.x*h),y:r3(C.y+u.y*a+n.y*h)});
  return flanc.map(p=>pt(p.a,p.h)).concat(flanc.slice().reverse().map(p=>pt(p.a,-p.h)));
}
/* La place est-elle libre ? Le cuivre des autres nets à son isolement, le contour
   de carte, les découpes, les zones qui ne se détoureront pas, et les larmes déjà
   retenues (`faites`) des autres nets. */
function larmeLibre(P,l,net,faites){
  if(P.some(p=>!inBoard(p.x,p.y,0)))return false;
  if(S.cuts.some(c=>c.l===l&&c.pts.length>2&&polysTouchent(P,c.pts)))return false;
  for(const z of S.zones)
    if(z.l===l&&!z.larme&&(z.net||"")!==net&&(zoneFichier(z)||zonePrio(z)>=LARME_PRIO)&&polysTouchent(P,z.pts))return false;
  const N=pnsWorld();
  for(let i=0;i<P.length;i++){
    const a=P[i], b=P[(i+1)%P.length];
    for(const o of N.colliding(pnsItemSeg(l,net,0.001,a.x,a.y,b.x,b.y,null)))if(o)return false;
  }
  const b=polyBBox(P);
  for(const f of faites){
    if(f.l!==l||f.net===net)continue;
    const g=clrK(net,f.net,"cu","cu");
    if(f.b.x1-g>b.x2||f.b.x2+g<b.x1||f.b.y1-g>b.y2||f.b.y2+g<b.y1)continue;
    if(polysTouchent(P,f.pts)||P.some(p=>polyEdgeDist(p.x,p.y,f.pts)<g)||f.pts.some(p=>polyEdgeDist(p.x,p.y,P)<g))return false;
  }
  return true;
}
/* Les larmes que le cuivre actuel appelle. Rien n'est écrit ici. */
function larmesCalc(){
  const ronds=new Map();
  const garder=(l,x,y,r,net)=>{if(net)ronds.set(anchorKey(l,x,y),{x,y,r,net});};
  for(const fp of S.fps)
    for(const q of padsWorld(fp))
      for(const l of padCuLayers(fp,q)){
        const s=padSurCouche(q,l);
        if(s&&s.shape==="circ")garder(l,q.x,q.y,Math.max(s.w,s.h)/2,q.net);
      }
  for(const v of S.vias)for(let l=v.a;l<=v.b;l++)garder(l,v.x,v.y,v.d/2,v.net);
  const out=[];
  for(const t of S.tracks){
    if(isArc(t)||!t.net)continue;
    for(const e of [1,2]){
      const C=ronds.get(anchorKey(t.l,e===1?t.x1:t.x2,e===1?t.y1:t.y2));
      if(!C||C.net!==t.net)continue;
      const f=endFar(t,e), d=dist(C.x,C.y,f.x,f.y);
      if(d-C.r<0.1)continue;                        // la piste s'arrête dans le rond, ou presque
      const u={x:(f.x-C.x)/d,y:(f.y-C.y)/d};
      const L=Math.min(LARME_LONG,1.5*C.r,(d-C.r)*0.9);
      for(const a of LARME_ANGLES){
        const P=larmeForme(C,C.r,u,t.w,L,a);
        if(!P||!larmeLibre(P,t.l,t.net,out))continue;
        out.push({l:t.l,net:t.net,pts:P,b:polyBBox(P)});
        break;
      }
    }
  }
  return out;
}
function larmesPoser(){
  const avant=S.zones.filter(z=>z.larme).length, L=larmesCalc();
  if(!L.length&&!avant){hint("Larmes : aucune piste n'arrive au centre d'un via ou d'une pastille ronde plus large qu'elle, ou la place manque.");return;}
  push();
  S.zones=S.zones.filter(z=>!z.larme).concat(L.map(o=>({id:S.nextId++,l:o.l,net:o.net,pts:o.pts,
    priorite:LARME_PRIO,fichier:true,trous:[],sig:zoneSig(o.pts),larme:true})));
  touch();refreshPanels();draw();
  hint("Larmes : "+L.length+" posée"+(L.length>1?"s":"")+". Si du cuivre bouge ensuite, le DRC le signale et ce bouton les refait. Ctrl+Z pour défaire.");
}
function larmesRetirer(){
  if(!S.zones.some(z=>z.larme)){hint("Aucune larme à retirer.");return;}
  push();
  S.zones=S.zones.filter(z=>!z.larme);
  touch();refreshPanels();draw();
  hint("Larmes retirées. Ctrl+Z pour les remettre.");
}
/* Le DRC : le cuivre a-t-il bougé depuis la pose ? Une larme restée en place peut
   flotter hors de sa piste, ou passer sous l'isolement d'un voisin : on compare à
   ce que le geste poserait aujourd'hui. */
function larmesPerimees(out){
  const Z=S.zones.filter(z=>z.larme);
  if(!Z.length)return;
  const cle=o=>o.l+"|"+o.net+"|"+zoneSig(o.pts);
  const voulues=new Set(larmesCalc().map(cle));
  const fausses=Z.filter(z=>!voulues.has(cle(z)));
  const manquent=voulues.size-(Z.length-fausses.length);
  if(!fausses.length&&manquent<=0)return;
  const z=fausses[0]||Z[0], b=polyBBox(z.pts);
  out.push({x:(b.x1+b.x2)/2,y:(b.y1+b.y2)/2,l:z.l,
    msg:"Larmes à refaire : du cuivre a bougé depuis leur pose (Placer & router > Larmes)"});
}
