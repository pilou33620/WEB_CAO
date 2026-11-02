"use strict";
/* ==========================================================================
   Visionneuse IPC-2581 — animation 3D de la carte qui s'assemble
   --------------------------------------------------------------------------
   Le bouton 🎬 Animation 3D… : on coche les composants à présenter (les plus
   gros composants actifs le sont d'office), puis la vidéo et la page HTML
   partent, comme dans l'éditeur PCB. Ici, la carte lue relevée dans la scène J
   de commun/animation-3d.js, qui fait tout le reste.
   Repère : celui du fichier, en mm (× mdlK()), Y vers le haut — celui du
   dossier méca, dont viennent contour, trous et composants (stepSceneIpc).
   Le choix des composants vaut pour la séance et le fichier ouvert.
   ========================================================================== */

const IPC_ANIM={fichier:"",etiq:null};

/* Les contours d'une pastille posée q ({forme, d, x, y, rot, mir}), en mm :
   [{p:[[x,y]…], t:[trous]}]. Les formes de mdlForme, en polygones. */
function ipcAnimPad(q,k){
  const f=V.modele.formes&&V.modele.formes[q.forme], u=V.modele.formesuser&&V.modele.formesuser[q.forme];
  const paires=a=>{const r=[];for(let i=0;i+1<a.length;i+=2)r.push([a[i],a[i+1]]);return r;};
  const rond=(w,h,r)=>{                      // rectangle centré aux coins arrondis (r = 0 : droit)
    r=Math.max(0,Math.min(r,w/2,h/2));
    const c=[];
    for(const [cx,cy,a0] of [[w/2-r,h/2-r,0],[-w/2+r,h/2-r,90],[-w/2+r,-h/2+r,180],[w/2-r,-h/2+r,270]])
      for(let i=0;i<=(r>0?4:0);i++){const a=(a0+i*22.5)*Math.PI/180;c.push([cx+r*Math.cos(a),cy+r*Math.sin(a)]);}
    return [{p:c}];
  };
  let L=[];
  if(f)switch(f.t){
    case "CIRCLE": L=rond(f.d||0,f.d||0,(f.d||0)/2);break;
    case "RECTCENTER": L=rond(f.w||0,f.h||0,0);break;
    case "OVAL": L=rond(f.w||0,f.h||0,Math.min(f.w||0,f.h||0)/2);break;
    case "RECTROUND": L=rond(f.w||0,f.h||0,f.r||0);break;
    case "RECTCHAM": L=rond(f.w||0,f.h||0,f.ch||0);break;       // rendu arrondi, comme l'écran
    case "POLYGON": L=[{p:paires(f.p||[])}];break;
  }else if(u&&u.plans&&u.plans.length)L=u.plans.map(g=>({p:paires(g.o),t:(g.t||[]).map(paires)}));
  if(!L.length&&q.d>0)L=rond(q.d,q.d,q.d/2);  // forme inconnue : le disque du padstack
  const P=([x,y])=>{const m=mdlPlacer(x,y,q.x,q.y,q.rot,q.mir);return [anim3dR(m.x*k),anim3dR(m.y*k)];};
  return L.filter(g=>g.p.length>=3).map(g=>({p:g.p.map(P),t:(g.t||[]).map(h=>h.map(P))}));
}
/* Les traits d'une couche (pistes et arcs, un arc en morceaux de 0,5 mm) :
   [[xa,ya,xb,yb,w,net]] en mm. */
function ipcAnimTraits(c,k){
  const R=anim3dR, out=[];
  for(const p of c.pistes)
    for(let i=0;i+3<p.p.length;i+=2)out.push([R(p.p[i]*k),R(p.p[i+1]*k),R(p.p[i+2]*k),R(p.p[i+3]*k),R((p.w||0)*k),p.n]);
  for(const a of c.arcs){
    if(!a.s||!a.e||!a.m)continue;
    const g=mdlArc(a), A=mdlArcAngle(g), n=Math.max(2,Math.ceil(A*g.r*k/0.5));
    let x0=a.s[0], y0=a.s[1];
    for(let i=1;i<=n;i++){
      const t=g.d+(g.h?-1:1)*A*i/n, x=g.cx+g.r*Math.cos(t), y=g.cy+g.r*Math.sin(t);
      out.push([R(x0*k),R(y0*k),R(x*k),R(y*k),R((a.w||0)*k),a.n]);x0=x;y0=y;
    }
  }
  return out;
}
/* Les plans de cuivre d'une couche, en image blanche sur transparent (comme
   anim3dZone de l'éditeur) : {png, x, y, l, h} en mm, null sans plan ou sans canevas. */
function ipcAnimZone(c,k){
  const G=c.plans.flatMap(p=>p.g||[]).filter(g=>g.o&&g.o.length>=6);
  if(!G.length)return null;
  try{
    let x1=Infinity,y1=Infinity,x2=-Infinity,y2=-Infinity;
    for(const g of G)for(let i=0;i+1<g.o.length;i+=2){
      x1=Math.min(x1,g.o[i]*k);x2=Math.max(x2,g.o[i]*k);y1=Math.min(y1,g.o[i+1]*k);y2=Math.max(y2,g.o[i+1]*k);
    }
    const res=Math.min(20,Math.sqrt(4e6/Math.max(1,(x2-x1)*(y2-y1))));
    const cv=document.createElement("canvas");
    cv.width=Math.max(1,Math.ceil((x2-x1)*res));cv.height=Math.max(1,Math.ceil((y2-y1)*res));
    const g2=cv.getContext("2d");
    g2.fillStyle="#fff";
    const trace=a=>{for(let i=0;i+1<a.length;i+=2){const X=(a[i]*k-x1)*res, Y=(y2-a[i+1]*k)*res;i?g2.lineTo(X,Y):g2.moveTo(X,Y);}g2.closePath();};
    for(const g of G){g2.beginPath();trace(g.o);for(const t of (g.t||[]))trace(t);g2.fill("evenodd");}   // chaque contour à part (README)
    if(typeof cv.toDataURL!=="function")return null;
    return {png:cv.toDataURL("image/png"),x:anim3dR((x1+x2)/2),y:anim3dR((y1+y2)/2),l:anim3dR(x2-x1),h:anim3dR(y2-y1)};
  }catch(_){return null;}
}
/* Face d'une couche de sérigraphie : la face déclarée par le fichier, sinon son nom. */
function ipcAnimFace(c){
  const s=String((V.modele.calques&&V.modele.calques[c.nom]&&V.modele.calques[c.nom].s)||"");
  return /BOT/i.test(s)?1:/TOP/i.test(s)?0:(/BOT/i.test(c.nom)?1:0);
}
/* La scène J (sans les composants présentés : ipcAnimVedettes). MECA_IPC.lib chargée. */
function ipcAnimDonnees(){
  const k=mdlK(), B=stepSceneIpc(), parRef=new Map(mecaEntreeIpc(V.modele).composants.map(c=>[c.ref,c]));
  const xs=B.contour.map(p=>p[0]), ys=B.contour.map(p=>p[1]);
  const vias=V.modele.percages.filter(h=>h.p==="VIA"&&h.d>0).map(h=>{
    const ps=V.modele.padstacks[h.ps];
    return {sa:h.sa,sb:h.sb,v:[anim3dR(h.x*k),anim3dR(h.y*k),anim3dR(((ps&&ps.pad)||h.d+2*(h.a||0))*k),anim3dR(h.d*k)]};
  });
  const cuivre=c=>c?{pistes:ipcAnimTraits(c,k),
    pads:c.pads.flatMap(q=>ipcAnimPad(q,k).map(g=>g.p)),
    /* shortcut: un via borgne se montre sur une face externe si elle est l'une de ses bornes (sa/sb), sinon pas */
    vias:vias.filter(x=>(!x.sa&&!x.sb)||x.sa===c.nom||x.sb===c.nom).map(x=>x.v),
    zone:ipcAnimZone(c,k)}:{pistes:[],pads:[],vias:[],zone:null};
  const seri=f=>{
    const L=V.couches.filter(c=>c.genre==="serigraphie"&&ipcAnimFace(c)===f);
    /* shortcut: les textes de sérigraphie ne sont pas dessinés (le fichier ne donne que la chaîne, pas ses traits) */
    return {segs:L.flatMap(c=>ipcAnimTraits(c,k).map(s=>{s=s.slice(0,5);s[4]=s[4]||0.12;return s;})),pts:[],
      polys:L.flatMap(c=>c.plans.flatMap(p=>p.g||[]).filter(g=>g.o&&g.o.length>=6)
        .map(g=>({p:ipcAnimTraitsPts(g.o,k),t:(g.t||[]).map(t=>ipcAnimTraitsPts(t,k))}))
        .concat(c.pads.flatMap(q=>ipcAnimPad(q,k))))};
  };
  const dessus=V.couches.find(c=>c.dessus), dessous=V.couches.find(c=>c.dessous&&c!==dessus);
  return Object.assign(B,{l:anim3dR(Math.max(...xs)-Math.min(...xs)),h:anim3dR(Math.max(...ys)-Math.min(...ys)),
    finition:0xd6ad48,                                           // or (ENIG) : le fichier ne le dit pas toujours
    faces:[{cuivre:cuivre(dessus),seri:seri(0)},{cuivre:cuivre(dessous),seri:seri(1)}],
    /* dessus d'abord, puis du plus gros au plus petit : l'ordre de pose */
    composants:B.composants.map(c=>Object.assign(c,{couleur:anim3dTeinte(c.ref,(parRef.get(c.ref)||{}).pkg||"")}))
      .sort((a,b)=>a.face-b.face||ipcAnimAire(b.corps)*b.h-ipcAnimAire(a.corps)*a.h)});
}
function ipcAnimAire(c){return Math.abs(c.reduce((s,p,i)=>{const q=c[(i+1)%c.length];return s+p[0]*q[1]-q[0]*p[1];},0))/2;}
function ipcAnimTraitsPts(a,k){const r=[];for(let i=0;i+1<a.length;i+=2)r.push([anim3dR(a[i]*k),anim3dR(a[i+1]*k)]);return r;}
/* Les composants présentés : nom et description de la LIB (Part Name, référence
   fabricant, puis valeur), sinon ceux du fichier ; nets de leurs pastilles et broches. */
function ipcAnimVedettes(J,choisis){
  const lib=MECA_IPC.lib||[], cle=v=>String(v||"").trim().toLowerCase();
  const E=new Map(mecaEntreeIpc(V.modele).composants.map(c=>[c.ref,c])), nets=new Map();
  const ajoute=(ref,n)=>{if(!(n>=0))return;if(!nets.has(ref))nets.set(ref,new Set());nets.get(ref).add(n);};
  for(const c of V.couches)for(const q of c.pads)if(q.hote&&q.pad)ajoute(q.hote.ref,q.pad.n);
  for(const c of V.modele.composants)for(const b of (c.pins||[]))ajoute(c.ref,b.n);   // le net est souvent sur la broche
  return anim3dVedettes(J,choisis,ref=>{
    const e=E.get(ref)||{}, comp=V.parRef&&V.parRef.get(ref)||{}, pr=comp.props||{};
    const l=(cle(e.part_name)&&lib.find(l=>cle(l["Part Name"])===cle(e.part_name)))||
      (cle(e.mpn)&&lib.find(l=>cle(l["Part Number"])===cle(e.mpn)||cle(l["manufacturer part Number"])===cle(e.mpn)))||
      (cle(e.val)&&lib.find(l=>cle(l["Part Name"])===cle(e.val)))||null;
    return {nom:l&&l["Part Name"]||e.part_name||e.val||e.mpn,desc:l&&l.Description||pr.DESCRIPTION||pr.Description,
            nets:[...(nets.get(ref)||[])]};
  });
}
function ipcAnimOuvrir(){
  if(!V.modele){hint("Aucune carte ouverte : rien à animer.");return;}
  if(ANIM3D_EN_COURS){hint("Animation 3D : un enregistrement est déjà en cours.");return;}
  if(IPC_ANIM.fichier!==V.fichier){IPC_ANIM.fichier=V.fichier;IPC_ANIM.etiq=null;}
  hint("Animation 3D : chargement de la LIB…");
  mecaIpcLib().then(()=>{
    const J=ipcAnimDonnees();
    const auto=()=>anim3dChoixOffice(J.composants.map(c=>({ref:c.ref,aire:ipcAnimAire(c.corps)})));
    const E=new Map(mecaEntreeIpc(V.modele).composants.map(c=>[c.ref,c]));
    hint("");
    anim3dFenetre(J.composants.map(c=>{const e=E.get(c.ref)||{};return {ref:c.ref,txt:e.val||e.part_name||e.mpn||""};}),
      IPC_ANIM.etiq||auto(),auto,(ch,office)=>{
        IPC_ANIM.etiq=office?null:ch;
        J.vedettes=ipcAnimVedettes(J,ch);
        anim3dEnregistrer(()=>J,ext=>mecaIpcBase()+"-ASSEMBLAGE-3D."+ext,telecharger,hint);
      },{fond:"modal-overlay",boite:"modal-box step-box"});
  });
}
(function(){
  const b=typeof document!=="undefined"&&document.getElementById&&document.getElementById("bAnim3d");
  if(b)b.onclick=ipcAnimOuvrir;
})();
