"use strict";
/* ==========================================================================
   Éditeur PCB — connectivité et contrôles
   Îlots de cuivre, chevelu, DRC, lecture de netlist, aide au placement.
   ========================================================================== */

/* ==========================================================================
   Îlots de cuivre
   Le contour d'une zone ne dit pas où le cuivre subsiste : les dégagements des
   pistes et des pastilles étrangères peuvent le couper en morceaux. On dessine
   donc le remplissage dans une image, et on y cherche les composantes connexes.
   ========================================================================== */
function zoneGroups(){
  const m=new Map();
  for(const z of S.zones){
    if(!z.net||z.pts.length<3)continue;
    const k=z.l+"|"+z.net;
    if(!m.has(k))m.set(k,{l:z.l,net:z.net,zs:[]});
    m.get(k).zs.push(z);
  }
  return [...m.values()];
}
/* composantes connexes en 4-voisinage : deux pixels en diagonale ne se
   touchent que par un coin, ce qui ne conduit aucun courant */
function labelMask(a,W,H){
  const lab=new Int32Array(W*H), stack=new Int32Array(W*H);
  let n=0;
  for(let i=0;i<W*H;i++){
    if(!a[i]||lab[i])continue;
    n++;
    let sp=0;stack[sp++]=i;lab[i]=n;
    while(sp){
      const p=stack[--sp], x=p%W, y=(p-x)/W;
      if(x>0      && a[p-1] && !lab[p-1]){lab[p-1]=n;stack[sp++]=p-1;}
      if(x<W-1    && a[p+1] && !lab[p+1]){lab[p+1]=n;stack[sp++]=p+1;}
      if(y>0      && a[p-W] && !lab[p-W]){lab[p-W]=n;stack[sp++]=p-W;}
      if(y<H-1    && a[p+W] && !lab[p+W]){lab[p+W]=n;stack[sp++]=p+W;}
    }
  }
  return {lab,count:n};
}
function maskAt(M,x,y){
  const cx=Math.floor((x-M.x)*M.res), cy=Math.floor((y-M.y)*M.res);
  if(cx<0||cy<0||cx>=M.W||cy>=M.H)return 0;
  return M.lab[cy*M.W+cx];
}
/* étiquettes rencontrées au point demandé et sur une couronne autour : pour une
   pastille, le cuivre du plan commence au-delà du dégagement, pas au centre */
function maskLabels(M,x,y,r,rot){
  const out=[], c=maskAt(M,x,y);
  if(c)out.push(c);
  for(let k=0;k<8;k++){
    const a=(rot||0)+k*Math.PI/4;
    const l=maskAt(M,x+Math.cos(a)*r,y+Math.sin(a)*r);
    if(l&&out.indexOf(l)<0)out.push(l);
  }
  return out;
}
function zoneMask(l,net){
  const zs=S.zones.filter(z=>z.l===l&&(z.net||"")===net&&z.pts.length>=3);
  if(!zs.length)return null;
  const clr=classOf(net).clr;
  const res=clamp(1/Math.max(0.08,maxClr()*0.6),4,14);   // ~2 pixels par isolation
  let x1=1e9,y1=1e9,x2=-1e9,y2=-1e9;
  for(const z of zs){
    const b=polyBBox(z.pts);
    x1=Math.min(x1,b.x1);y1=Math.min(y1,b.y1);
    x2=Math.max(x2,b.x2);y2=Math.max(y2,b.y2);
  }
  x1-=1;y1-=1;x2+=1;y2+=1;
  const W=Math.max(1,Math.ceil((x2-x1)*res)), H=Math.max(1,Math.ceil((y2-y1)*res));
  if(W*H>2.5e6)return null;                         // trop gros : on renonce
  const o=document.createElement("canvas");o.width=W;o.height=H;
  const c=o.getContext("2d",{willReadFrequently:true});
  if(!c||!c.getImageData)return null;
  c.setTransform(res,0,0,res,-x1*res,-y1*res);
  c.fillStyle="#fff";
  for(const z of zs){
    c.beginPath();
    c.moveTo(z.pts[0].x,z.pts[0].y);
    for(let k=1;k<z.pts.length;k++)c.lineTo(z.pts[k].x,z.pts[k].y);
    c.closePath();c.fill();
  }
  clipToBoard(c,x1,y1,x2,y2);
  /* une zone d'un autre net posée par-dessus recouvre celle-ci à l'écran :
     le masque doit refléter le même ordre de peinture */
  for(const z of S.zones){
    if(z.l!==l||(z.net||"")===net||z.pts.length<3)continue;
    if(S.zones.indexOf(z)<S.zones.indexOf(zs[0]))continue;
    c.beginPath();
    c.moveTo(z.pts[0].x,z.pts[0].y);
    for(let k=1;k<z.pts.length;k++)c.lineTo(z.pts[k].x,z.pts[k].y);
    c.closePath();c.fill();
  }
  c.strokeStyle="#000";c.fillStyle="#000";c.lineCap="round";c.lineJoin="round";
  for(const t of S.tracks){
    if(t.l!==l||t.net===net)continue;
    c.lineWidth=t.w+2*clrPair(net,t.net);
    c.beginPath();c.moveTo(t.x1,t.y1);c.lineTo(t.x2,t.y2);c.stroke();
  }
  for(const v of S.vias){
    if(l<v.a||l>v.b)continue;
    c.beginPath();
    c.arc(v.x,v.y,v.net===net?v.drill/2:v.d/2+clrPair(net,v.net),0,Math.PI*2);
    c.fill();
  }
  const thermals=[];
  for(const fp of S.fps)
    for(const q of padsWorld(fp)){
      if(!padLayers(fp,q).includes(l))continue;
      padFill(c,q,q.net===net?clr:clrPair(net,q.net));
      if(q.net===net)thermals.push(q);
      else if(q.drill>0){c.beginPath();c.arc(q.x,q.y,q.drill/2+clr,0,Math.PI*2);c.fill();}
    }
  c.globalCompositeOperation="source-over";
  c.fillStyle="#fff";
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
  let img;
  try{img=c.getImageData(0,0,W,H);}catch(e){return null;}
  const px8=img.data, a=new Uint8Array(W*H);
  for(let i=0,j=3;i<a.length;i++,j+=4)a[i]=px8[j]>128?1:0;
  const {lab,count}=labelMask(a,W,H);
  return {x:x1,y:y1,res,W,H,lab,count};
}

/* ==========================================================================
   Connectivité
   Un seul union-find couvre pistes, vias et pastilles. Les vias portent les
   liaisons entre couches : c'est ce qui rend le calcul multicouche exact sans
   traiter chaque couche séparément.
   ========================================================================== */
const CELL=5;                       // maille de l'index spatial, en mm
const MASK_BUDGET=200e3;            // pixels au-delà desquels on diffère l'analyse
let _conn=null, _connVer=-1, _connExact=false, _refineT=null;
/* Coût estimé de la rasterisation des zones, en pixels. */
function maskCost(){
  const res=clamp(1/Math.max(0.08,maxClr()*0.6),4,14);
  let n=0;
  for(const g of zoneGroups()){
    let x1=1e9,y1=1e9,x2=-1e9,y2=-1e9;
    for(const z of g.zs){
      const b=polyBBox(z.pts);
      x1=Math.min(x1,b.x1);y1=Math.min(y1,b.y1);
      x2=Math.max(x2,b.x2);y2=Math.max(y2,b.y2);
    }
    n+=((x2-x1)+2)*((y2-y1)+2)*res*res;
  }
  return n;
}
/* Sur une petite carte, l'analyse des îlots est immédiate. Sur une grande, la
   faire à chaque image bloquerait le glissement d'une empreinte : on répond
   d'abord au contour, puis on affine dès que la main s'arrête. */
function conn(exact){
  if(_conn && _connVer===S.ver && (!exact||_connExact))return _conn;
  const want = !!exact || maskCost()<=MASK_BUDGET;
  _conn=computeConn(want); _connVer=S.ver; _connExact=want;
  if(!want)scheduleRefine();
  return _conn;
}
function scheduleRefine(){
  if(_refineT)clearTimeout(_refineT);
  _refineT=setTimeout(()=>{
    _refineT=null;
    if(_connExact&&_connVer===S.ver)return;
    _conn=computeConn(true);_connVer=S.ver;_connExact=true;
    if(typeof draw==="function")draw();
    if(S.listTab==="nets"&&typeof buildList==="function")buildList();
  },220);
}
function computeConn(exact){
  const par=new Map();
  function find(k){
    if(!par.has(k))par.set(k,k);
    let r=k;
    while(par.get(r)!==r)r=par.get(r);
    while(par.get(k)!==r){const n=par.get(k);par.set(k,r);k=n;}
    return r;
  }
  function uni(a,b){a=find(a);b=find(b);if(a!==b)par.set(a,b);}

  /* index des segments : couche + cellule */
  const grid=new Map();
  function addSeg(l,i,x1,y1,x2,y2){
    const ax=Math.floor(Math.min(x1,x2)/CELL), bx=Math.floor(Math.max(x1,x2)/CELL);
    const ay=Math.floor(Math.min(y1,y2)/CELL), by=Math.floor(Math.max(y1,y2)/CELL);
    for(let cx=ax;cx<=bx;cx++)for(let cy=ay;cy<=by;cy++){
      const k=l+"|"+cx+"|"+cy; let a=grid.get(k);
      if(!a)grid.set(k,a=[]);
      a.push(i);
    }
  }
  S.tracks.forEach((t,i)=>addSeg(t.l,i,t.x1,t.y1,t.x2,t.y2));
  function near(l,x,y,r){
    const out=new Set();
    for(let cx=Math.floor((x-r)/CELL);cx<=Math.floor((x+r)/CELL);cx++)
      for(let cy=Math.floor((y-r)/CELL);cy<=Math.floor((y+r)/CELL);cy++){
        const a=grid.get(l+"|"+cx+"|"+cy);
        if(a)for(const i of a)out.add(i);
      }
    return out;
  }

  S.tracks.forEach((t,i)=>uni("T"+i+"a","T"+i+"b"));

  /* contacts exacts : même point, même couche */
  const bucket=new Map();
  function put(l,x,y,k){
    const kk=l+"|"+r3(x)+"|"+r3(y);
    let a=bucket.get(kk);
    if(!a)bucket.set(kk,a=[]);
    a.push(k);
  }
  S.tracks.forEach((t,i)=>{put(t.l,t.x1,t.y1,"T"+i+"a");put(t.l,t.x2,t.y2,"T"+i+"b");});
  S.vias.forEach((v,i)=>{for(let l=v.a;l<=v.b;l++)put(l,v.x,v.y,"V"+i);});
  const padNodes=[];
  for(const fp of S.fps)
    for(const q of padsWorld(fp)){
      const k="P"+fp.id+"."+q.n, ls=padLayers(fp,q);
      padNodes.push({k,q,fp,layers:ls});
      for(const l of ls)put(l,q.x,q.y,k);
    }
  for(const arr of bucket.values())
    for(let i=1;i<arr.length;i++)uni(arr[0],arr[i]);

  /* jonctions en T : une extrémité posée au milieu d'une piste connecte aussi */
  function touchSeg(l,x,y,rad,k){
    for(const i of near(l,x,y,rad+1)){
      const t=S.tracks[i];
      if(segDist(x,y,t.x1,t.y1,t.x2,t.y2)<=rad+t.w/2+1e-6)uni(k,"T"+i+"a");
    }
  }
  S.tracks.forEach((t,i)=>{
    touchSeg(t.l,t.x1,t.y1,t.w/2,"T"+i+"a");
    touchSeg(t.l,t.x2,t.y2,t.w/2,"T"+i+"b");
  });
  S.vias.forEach((v,i)=>{for(let l=v.a;l<=v.b;l++)touchSeg(l,v.x,v.y,v.d/2,"V"+i);});
  for(const p of padNodes)
    for(const l of p.layers)
      touchSeg(l,p.q.x,p.q.y,Math.min(p.q.w,p.q.h)/2,p.k);

  /* Zones de cuivre : on ne se contente pas du contour tracé. Le remplissage
     réel est rasterisé puis découpé en îlots ; un item n'est relié qu'à l'îlot
     de cuivre qui le touche vraiment. Un faisceau de pistes qui coupe un plan
     en deux le sépare donc bel et bien en deux nets distincts. */
  const zoneIslands=[];
  for(const g of zoneGroups()){
    const M=exact?zoneMask(g.l,g.net):null;
    const seen=new Set();
    const link=(k,labs)=>{
      for(const lb of labs){seen.add(lb);uni(k,"Z"+g.l+"|"+g.net+"|"+lb);}
    };
    if(!M){
      /* analyse différée, ou carte trop grande pour la rasterisation : on
         retombe sur le contour, quitte à être optimiste le temps d'un geste */
      const zk="Z"+g.l+"|"+g.net+"|poly";
      for(const p of padNodes)
        if(p.q.net===g.net&&p.layers.includes(g.l)&&g.zs.some(z=>inPoly(p.q.x,p.q.y,z.pts)))uni(p.k,zk);
      S.vias.forEach((v,i)=>{
        if(v.net===g.net&&g.l>=v.a&&g.l<=v.b&&g.zs.some(z=>inPoly(v.x,v.y,z.pts)))uni("V"+i,zk);
      });
      S.tracks.forEach((t,i)=>{
        if(t.l===g.l&&t.net===g.net&&
           g.zs.some(z=>inPoly(t.x1,t.y1,z.pts)||inPoly(t.x2,t.y2,z.pts)))uni("T"+i+"a",zk);
      });
      zoneIslands.push({l:g.l,net:g.net,islands:1,approx:true});
      continue;
    }
    for(const p of padNodes){
      if(p.q.net!==g.net||!p.layers.includes(g.l))continue;
      // on interroge le cuivre là où les bras thermiques rejoignent la zone
      link(p.k,maskLabels(M,p.q.x,p.q.y,
        Math.max(p.q.w,p.q.h)/2+classOf(g.net).clr+0.3,p.q.rot));
    }
    S.vias.forEach((v,i)=>{
      if(v.net!==g.net||g.l<v.a||g.l>v.b)return;
      link("V"+i,maskLabels(M,v.x,v.y,v.drill/2+0.25,0));
    });
    S.tracks.forEach((t,i)=>{
      if(t.l!==g.l||t.net!==g.net)return;
      const labs=maskLabels(M,t.x1,t.y1,t.w/2,0)
        .concat(maskLabels(M,t.x2,t.y2,t.w/2,0))
        .concat(maskLabels(M,(t.x1+t.x2)/2,(t.y1+t.y2)/2,t.w/2,0));
      link("T"+i+"a",labs);
    });
    zoneIslands.push({l:g.l,net:g.net,islands:seen.size,total:M.count});
  }

  /* regroupement par net + chevelu */
  const nets=new Map(), rats=[];
  let unrouted=0;
  for(const p of padNodes){
    if(!p.q.net)continue;
    let n=nets.get(p.q.net);
    if(!n)nets.set(p.q.net,n={name:p.q.net,pads:[],clusters:1,miss:0});
    n.pads.push(p);
  }
  for(const n of nets.values()){
    const cl=new Map();
    for(const p of n.pads){
      const r=find(p.k);
      if(!cl.has(r))cl.set(r,[]);
      cl.get(r).push(p.q);
    }
    const groups=[...cl.values()];
    n.clusters=groups.length;
    n.miss=Math.max(0,groups.length-1);
    unrouted+=n.miss;
    if(groups.length>1){
      const used=[groups[0]], rest=groups.slice(1);
      while(rest.length){
        let bi=0,bd=1e18,ba=null,bb=null;
        for(let i=0;i<rest.length;i++)
          for(const g of used)
            for(const p of rest[i])
              for(const q of g){
                const d=dist(p.x,p.y,q.x,q.y);
                if(d<bd){bd=d;bi=i;ba=p;bb=q;}
              }
        if(ba)rats.push({x1:ba.x,y1:ba.y,x2:bb.x,y2:bb.y,net:n.name});
        used.push(rest[bi]);rest.splice(bi,1);
      }
    }
  }
  return {find,rats,nets,unrouted,padNodes,near,zoneIslands,
          approx:!exact&&zoneGroups().length>0};
}
function netAtPoint(x,y,layer){
  for(const fp of S.fps)
    for(const q of padsWorld(fp)){
      if(!padLayers(fp,q).includes(layer))continue;
      if(padDist(x,y,q)<=0)return {net:q.net,pad:q,fp};
    }
  for(const t of S.tracks)
    if(t.l===layer && segDist(x,y,t.x1,t.y1,t.x2,t.y2)<=t.w/2)return {net:t.net,track:t};
  for(const v of S.vias)
    if(layer>=v.a&&layer<=v.b&&dist(x,y,v.x,v.y)<=v.d/2)return {net:v.net,via:v};
  return null;
}
/* distance d'un point au bord d'une pastille (négative à l'intérieur) */
function padDist(px,py,q){
  const dx=px-q.x, dy=py-q.y, ca=Math.cos(-q.rot), sa=Math.sin(-q.rot);
  const lx=dx*ca-dy*sa, ly=dx*sa+dy*ca;
  if(q.shape==="circ")return Math.hypot(lx,ly)-Math.max(q.w,q.h)/2;
  const ex=Math.abs(lx)-q.w/2, ey=Math.abs(ly)-q.h/2;
  if(ex<=0&&ey<=0)return Math.max(ex,ey);
  return Math.hypot(Math.max(ex,0),Math.max(ey,0));
}

/* ==========================================================================
   Contrôle DRC — vérification allégée, sans notion de classe de net
   ========================================================================== */
/* Deux segments qui se croisent sont à distance nulle : sans ce test, la
   comparaison des seules extrémités déclarerait un croisement franc « éloigné ». */
function segCross(a,b){
  const d1=a.x2-a.x1, d2=a.y2-a.y1, d3=b.x2-b.x1, d4=b.y2-b.y1;
  const den=d1*d4-d2*d3;
  if(Math.abs(den)<1e-12)return false;
  const ex=b.x1-a.x1, ey=b.y1-a.y1;
  const t=(ex*d4-ey*d3)/den, u=(ex*d2-ey*d1)/den;
  return t>=0&&t<=1&&u>=0&&u<=1;
}
function segSegDist(a,b){
  if(segCross(a,b))return 0;
  return Math.min(
    segDist(a.x1,a.y1,b.x1,b.y1,b.x2,b.y2),
    segDist(a.x2,a.y2,b.x1,b.y1,b.x2,b.y2),
    segDist(b.x1,b.y1,a.x1,a.y1,a.x2,a.y2),
    segDist(b.x2,b.y2,a.x1,a.y1,a.x2,a.y2));
}
function segPadDist(t,q){
  const n=Math.min(24,Math.max(2,Math.ceil(dist(t.x1,t.y1,t.x2,t.y2)/0.3)));
  let best=1e9;
  for(let i=0;i<=n;i++){
    const u=i/n;
    best=Math.min(best,padDist(t.x1+(t.x2-t.x1)*u, t.y1+(t.y2-t.y1)*u, q));
  }
  return best-t.w/2;
}
function inBoard(x,y,m){
  const P=boardPoly();
  if(!inPoly(x,y,P))return false;
  return !m || polyEdgeDist(x,y,P)>=m;
}
function runDrc(){
  const out=[];
  conn(true);              // le contrôle exige l'analyse fine des îlots
  const pads=[];
  for(const fp of S.fps)
    for(const q of padsWorld(fp))
      pads.push({q,fp,layers:padLayers(fp,q),tag:fp.ref+"."+q.n});

  /* piste ↔ piste */
  for(let i=0;i<S.tracks.length;i++){
    const a=S.tracks[i];
    for(let j=i+1;j<S.tracks.length;j++){
      const b=S.tracks[j];
      if(a.l!==b.l)continue;
      if(a.net&&b.net&&a.net===b.net)continue;
      const clr=clrPair(a.net,b.net);
      const d=segSegDist(a,b)-a.w/2-b.w/2;
      if(d<clr-1e-6)
        out.push({x:(a.x1+a.x2+b.x1+b.x2)/4, y:(a.y1+a.y2+b.y1+b.y2)/4, l:a.l,
          msg:"Isolation piste/piste "+fmt(Math.max(0,d),3)+" mm ("+(a.net||"?")+" / "+(b.net||"?")+")"});
    }
  }
  /* piste ↔ pastille */
  for(const t of S.tracks)
    for(const p of pads){
      if(!p.layers.includes(t.l))continue;
      if(t.net&&p.q.net&&t.net===p.q.net)continue;
      const clr=clrPair(t.net,p.q.net);
      const d=segPadDist(t,p.q);
      if(d<clr-1e-6)
        out.push({x:p.q.x,y:p.q.y,l:t.l,
          msg:"Isolation piste/pastille "+p.tag+" : "+fmt(Math.max(0,d),3)+" mm"});
    }
  /* via ↔ piste et via ↔ pastille */
  for(const v of S.vias){
    for(const t of S.tracks){
      if(t.l<v.a||t.l>v.b)continue;
      if(t.net&&v.net&&t.net===v.net)continue;
      const d=segDist(v.x,v.y,t.x1,t.y1,t.x2,t.y2)-t.w/2-v.d/2;
      if(d<clrPair(v.net,t.net)-1e-6)out.push({x:v.x,y:v.y,l:t.l,msg:"Isolation via/piste "+fmt(Math.max(0,d),3)+" mm"});
    }
    for(const p of pads){
      if(!p.layers.some(l=>l>=v.a&&l<=v.b))continue;
      if(v.net&&p.q.net&&v.net===p.q.net)continue;
      const d=padDist(v.x,v.y,p.q)-v.d/2;
      if(d<clrPair(v.net,p.q.net)-1e-6)out.push({x:v.x,y:v.y,l:v.a,msg:"Isolation via/pastille "+p.tag});
    }
    if(!inBoard(v.x,v.y,S.rule.edge))
      out.push({x:v.x,y:v.y,l:v.a,msg:"Via hors du contour de carte"});
  }
  /* pastille ↔ pastille */
  for(let i=0;i<pads.length;i++)
    for(let j=i+1;j<pads.length;j++){
      const a=pads[i], b=pads[j];
      if(a.fp===b.fp)continue;
      if(!a.layers.some(l=>b.layers.includes(l)))continue;
      if(a.q.net&&b.q.net&&a.q.net===b.q.net)continue;
      const d=padDist(a.q.x,a.q.y,b.q)-Math.min(a.q.w,a.q.h)/2;
      if(d<clrPair(a.q.net,b.q.net)-1e-6)
        out.push({x:(a.q.x+b.q.x)/2,y:(a.q.y+b.q.y)/2,l:a.layers[0],
          msg:"Pastilles trop proches : "+a.tag+" / "+b.tag});
    }
  /* largeur, net manquant, débordement */
  for(const t of S.tracks){
    const cl=classOf(t.net);
    if(t.w<cl.w-1e-6)
      out.push({x:(t.x1+t.x2)/2,y:(t.y1+t.y2)/2,l:t.l,
        msg:"Piste de "+fmt(t.w,3)+" mm sous les "+fmt(cl.w,2)+
            " mm de la classe "+cl.name});
    if(!t.net)
      out.push({x:(t.x1+t.x2)/2,y:(t.y1+t.y2)/2,l:t.l,msg:"Piste sans net"});
  }
  for(const p of pads)
    if(!inBoard(p.q.x,p.q.y,0))
      out.push({x:p.q.x,y:p.q.y,l:p.layers[0],msg:"Pastille "+p.tag+" hors du contour"});

  /* ---------- échardes de gravure ----------
     Un décrochement plus court que la piste qu'il prolonge n'est pas un coude :
     c'est une languette de cuivre plus fine que le reste du trait, que le bain
     sous-grave et que le fabricant compte parmi ses défauts — *sliver* dans un
     rapport de DFM. Le tracé aimante maintenant l'arrivée pour ne plus en
     produire ; ceux que d'anciens clics ont posés, ou qu'une arrivée sur une
     pastille hors grille impose, ne se voient que d'ici.
     On ne juge que les décrochements — un segment pris entre deux autres. Un
     moignon entre une pastille et un via est court par nécessité, et un via
     ancre le cuivre autour de lui : dans les deux cas, rien à redresser. */
  const tEnds=new Map();
  const eKey=(l,x,y)=>l+"|"+r3(x)+"|"+r3(y);
  for(const t of S.tracks){
    for(const k of [eKey(t.l,t.x1,t.y1),eKey(t.l,t.x2,t.y2)])
      tEnds.set(k,(tEnds.get(k)||0)+1);
  }
  for(const t of S.tracks){
    const L=dist(t.x1,t.y1,t.x2,t.y2);
    if(L<1e-9||L>=t.w-1e-6)continue;
    if((tEnds.get(eKey(t.l,t.x1,t.y1))||0)<2)continue;
    if((tEnds.get(eKey(t.l,t.x2,t.y2))||0)<2)continue;
    if(viaAt(t.l,t.x1,t.y1)||viaAt(t.l,t.x2,t.y2))continue;
    out.push({info:true,x:(t.x1+t.x2)/2,y:(t.y1+t.y2)/2,l:t.l,
      msg:"Décrochement de "+fmt(L,3)+" mm sur "+(t.net||"?")+" : plus court que la "+
          "piste ("+fmt(t.w,2)+" mm), le graveur en fera une écharde"});
  }

  /* ---------- angles bâtards ----------
     Un segment qui ne tombe sur aucun des huit sens du tracé est un
     *off-angle track* : le rendu Gerber ne l'optimise plus, et certains
     fabricants le refusent au contrôle d'entrée. Il ne naît pas du routeur —
     qui ne pose que du 45° — mais d'un sommet déplacé à la main entre deux
     bouts fixes, là où aucun arrangement de coudes ne rend l'angle.
     La règle se tait quand l'angle libre est celui qu'on a demandé : c'est
     alors un choix, pas un accident. */
  if(cornerMode()!=="free")
    for(const t of S.tracks){
      if(dist(t.x1,t.y1,t.x2,t.y2)<1e-9)continue;
      const dx=t.x2-t.x1, dy=t.y2-t.y1;
      const off=angleOff(dx,dy);
      if(off<=ANG_TOL)continue;
      out.push({info:true,x:(t.x1+t.x2)/2,y:(t.y1+t.y2)/2,l:t.l,
        msg:"Segment à "+fmt(angleDeg(dx,dy),1)+"° sur "+(t.net||"?")+
            " : hors des huit sens du tracé, à "+fmt(off*180/Math.PI,1)+
            "° du plus proche"});
    }

  for(const z of S.zones){
    const b=polyBBox(z.pts);
    if(!z.net)out.push({x:(b.x1+b.x2)/2,y:(b.y1+b.y2)/2,l:z.l,
      msg:"Zone de cuivre sans net : elle reste isolée"});
    if(z.pts.some(p=>!inBoard(p.x,p.y,0)))
      out.push({x:(b.x1+b.x2)/2,y:(b.y1+b.y2)/2,l:z.l,
        msg:"Zone débordant du contour de carte (le remplissage y est rogné)"});
  }
  const c=conn(true);
  for(const zi of (c.zoneIslands||[])){
    if(zi.approx||zi.islands<2)continue;
    const z=S.zones.find(o=>o.l===zi.l&&o.net===zi.net);
    const b=z?polyBBox(z.pts):{x1:0,x2:0,y1:0,y2:0};
    out.push({x:(b.x1+b.x2)/2,y:(b.y1+b.y2)/2,l:zi.l,
      msg:"Zone "+zi.net+" sur "+cuId(zi.l,S.cu)+" : cuivre coupé en "+zi.islands+
          " îlots reliés à des broches"});
  }
  /* ---------- ce que l'empilage impose ----------
     Le rapport d'aspect et la nature des vias ne se voient pas sur le dessin :
     c'est la pile qui les décide, d'où leur place ici plutôt que dans le seul
     panneau d'empilage. Les entrées portent le via fautif, pour qu'un clic
     dans la liste le sélectionne. */
  for(const v of S.vias){
    const len=stackSpan(v.a,v.b), r=aspectOf(len,v.drill);
    const dit=fmt(len,2)+" mm percés pour "+fmt(v.drill,2)+" mm";
    if(r>ASPECT_MAX)
      out.push({via:v,x:v.x,y:v.y,l:v.a,
        msg:"Rapport d'aspect "+fmt(r,1)+" : 1 ("+dit+
            ") : au-delà de "+ASPECT_MAX+" : 1, peu de fabricants suivent"});
    else if(r>ASPECT_WARN)
      out.push({info:true,via:v,x:v.x,y:v.y,l:v.a,
        msg:"Rapport d'aspect "+fmt(r,1)+" : 1 ("+dit+
            ") : au-delà de "+ASPECT_WARN+" : 1 la métallisation du trou se paie"});
    const b=viaBuild(v.a,v.b);
    if(!b.ok)
      out.push({info:true,via:v,x:v.x,y:v.y,l:v.a,
        msg:"Via "+cuId(v.a,S.cu)+" → "+cuId(v.b,S.cu)+" : "+b.why});
  }
  /* les pastilles traversantes se regroupent par diamètre de perçage : une
     entrée par trou noierait la liste sur un connecteur */
  const byDrill=new Map();
  for(const p of pads){
    if(!(p.q.drill>0))continue;
    const k=fmt(p.q.drill,3);
    if(!byDrill.has(k))byDrill.set(k,{n:0,p:p});
    byDrill.get(k).n++;
  }
  for(const [k,g] of byDrill){
    const r=aspectOf(stackLam(),g.p.q.drill);
    if(r<=ASPECT_WARN)continue;
    out.push({info:r<=ASPECT_MAX,x:g.p.q.x,y:g.p.q.y,l:0,
      msg:g.n+" perçage(s) de "+k+" mm : rapport d'aspect "+fmt(r,1)+" : 1 sur "+
          fmt(stackLam(),2)+" mm de stratifié (ex. "+g.p.tag+")"});
  }
  /* ---------- le rôle annoncé contre le cuivre posé ---------- */
  for(let i=0;i<S.cu;i++){
    const rc=roleCheck(i);
    if(rc)out.push({info:true,layer:i,x:bcx(),y:S.board.y+S.board.h/2,l:i,
      msg:cuId(i,S.cu)+" annoncée « "+CU_ROLES[layerRole(i)]+" » : "+rc.msg+
          " — "+rc.hint});
  }

  for(const n of c.nets.values())
    if(n.miss>0)
      out.push({info:true,x:n.pads[0].q.x,y:n.pads[0].q.y,l:0,
        msg:"Net "+n.name+" : "+n.miss+" liaison(s) non routée(s)"});
  S.drc=out; S.drcRun=true;
  return out;
}

/* ==========================================================================
   Netlist : lecture du fichier produit par l'éditeur schématique
   ========================================================================== */
function parseNetlist(txt){
  const lines=String(txt).split(/\r?\n/);
  const comps=new Map(), nets=new Map();
  let sect="", cur=null;
  for(const raw of lines){
    const line=raw.replace(/\s+$/,"");
    if(!line.trim())continue;
    const h=line.match(/^===\s*(.*?)\s*===$/);
    if(h){sect=/composant/i.test(h[1])?"comps":"nets";cur=null;continue;}
    const nm=line.match(/^\s*NET\s+"([^"]*)"/i)||line.match(/^\s*NET\s+([^\s;]+)/i);
    if(nm){cur=nm[1].trim();sect="nets";if(!nets.has(cur))nets.set(cur,[]);continue;}
    if(/^\s*[;*]/.test(line))continue;
    if(sect==="comps"){
      let p=line.trim().split(/\s{2,}/);
      if(p.length<2)p=line.trim().split(/\s+/);
      if(p[0]&&/^[A-Za-z]/.test(p[0]))
        comps.set(p[0],{ref:p[0],value:(p[1]||"").trim(),
          pkg:(p[2]&&p[2]!=="—"&&!/^f\d+$/.test(p[2]))?p[2].trim():""});
      continue;
    }
    if(cur){
      const nd=line.trim().match(/^([A-Za-z_][\w$\-]*)\.(\d+)\b(.*)$/);
      if(nd)nets.get(cur).push({ref:nd[1],pin:+nd[2]});
    }
  }
  return {comps,nets};
}
/* Applique une netlist : les empreintes déjà posées gardent leur place, les
   nouvelles sont rangées à côté de la carte. Rien n'est routé automatiquement. */
function applyNetlist(txt,dropMissing){
  const {comps,nets}=parseNetlist(txt);
  const pinCount=new Map(), pinNet=new Map();
  for(const [name,nodes] of nets)
    for(const nd of nodes){
      pinCount.set(nd.ref,Math.max(pinCount.get(nd.ref)||0,nd.pin));
      pinNet.set(nd.ref+"."+nd.pin,name);
    }
  const refs=new Set([...comps.keys(),...pinCount.keys()]);
  if(!refs.size)return {err:"Aucun composant reconnu dans ce fichier."};
  push();
  const byRef=new Map(S.fps.map(f=>[f.ref,f]));
  const added=[], kept=[];
  for(const ref of refs){
    const meta=comps.get(ref)||{value:"",pkg:""};
    const pins=Math.max(1,pinCount.get(ref)||2);
    let fp=byRef.get(ref);
    if(!fp){
      fp=mkFp(ref,meta.value,meta.pkg,pins);
      S.fps.push(fp);added.push(fp);
    }else{
      fp.value=meta.value||fp.value;
      fp.pkg=meta.pkg||fp.pkg;
      kept.push(fp);
      if(pins>fp.pins)fp.pins=pins;
    }
    fp.nets={};
    for(let p=1;p<=fp.pins;p++){
      const nn=pinNet.get(ref+"."+p);
      if(nn)fp.nets[p]=nn;
    }
  }
  let removed=0;
  if(dropMissing){
    const before=S.fps.length;
    S.fps=S.fps.filter(f=>refs.has(f.ref));
    removed=before-S.fps.length;
  }
  arrange(added);
  /* les nets d'alimentation rejoignent d'office la classe du même nom : sans
     cela, une carte fraîchement importée laisse la classe Alimentation vide */
  autoClass();
  touch();
  return {added:added.length,kept:kept.length,removed,nets:nets.size};
}
/* Rangement en lignes le long du bord droit de la carte : visible, ordonné,
   et sans recouvrement — le placement fin reste manuel. */
function arrange(list){
  if(!list||!list.length)return;
  const b=S.board;
  let x=b.x+b.w+6, y=b.y, rowH=0, col=0;
  const maxY=b.y+b.h*1.4;
  for(const fp of list){
    fp.x=0;fp.y=0;
    const bb=fpBBox(fp), w=bb.x2-bb.x1, h=bb.y2-bb.y1;
    if(y+h>maxY&&rowH>0){y=b.y;x+=rowH+3;rowH=0;col++;}
    fp.x=snapX(x+w/2);fp.y=snapY(y+h/2);
    rowH=Math.max(rowH,w);
    y+=h+2;
  }
}
/* Placement assisté : attraction le long du chevelu, répulsion des boîtiers.
   Quelques dizaines d'itérations suffisent pour dégrossir. */
function autoPlace(iter){
  const items=S.fps.map(fp=>({fp,bb:fpBBox(fp)}));
  if(items.length<2)return;
  const pos=new Map(items.map(i=>[i.fp.id,{x:i.fp.x,y:i.fp.y,
    w:(i.bb.x2-i.bb.x1)/2+1, h:(i.bb.y2-i.bb.y1)/2+1}]));
  /* liens : une arête par paire de broches d'un même net */
  const links=[];
  const byNet=new Map();
  for(const fp of S.fps)
    for(const q of padsOf(fp)){
      if(!q.net)continue;
      if(!byNet.has(q.net))byNet.set(q.net,[]);
      byNet.get(q.net).push(fp.id);
    }
  for(const [nm,ids] of byNet){
    if(ids.length>14)continue;                   // les nets d'alimentation ne dirigent rien
    const u=[...new Set(ids)];
    for(let i=0;i<u.length;i++)for(let j=i+1;j<u.length;j++)links.push([u[i],u[j]]);
  }
  const b=S.board;
  for(let it=0;it<(iter||120);it++){
    const f=new Map([...pos.keys()].map(k=>[k,{x:0,y:0}]));
    for(const [a,c] of links){
      const p=pos.get(a), q=pos.get(c);
      if(!p||!q)continue;
      const dx=q.x-p.x, dy=q.y-p.y;
      f.get(a).x+=dx*0.012; f.get(a).y+=dy*0.012;
      f.get(c).x-=dx*0.012; f.get(c).y-=dy*0.012;
    }
    const keys=[...pos.keys()];
    for(let i=0;i<keys.length;i++)
      for(let j=i+1;j<keys.length;j++){
        const p=pos.get(keys[i]), q=pos.get(keys[j]);
        const ox=(p.w+q.w)-Math.abs(q.x-p.x), oy=(p.h+q.h)-Math.abs(q.y-p.y);
        if(ox>0&&oy>0){                          // boîtiers en collision : on écarte
          if(ox<oy){
            const s=(q.x>p.x?1:-1)*ox*0.5;
            f.get(keys[i]).x-=s;f.get(keys[j]).x+=s;
          }else{
            const s=(q.y>p.y?1:-1)*oy*0.5;
            f.get(keys[i]).y-=s;f.get(keys[j]).y+=s;
          }
        }
      }
    for(const k of keys){
      const p=pos.get(k), d=f.get(k);
      p.x=clamp(p.x+clamp(d.x,-2,2), b.x+p.w, b.x+b.w-p.w);
      p.y=clamp(p.y+clamp(d.y,-2,2), b.y+p.h, b.y+b.h-p.h);
    }
  }
  push();
  for(const fp of S.fps){
    const p=pos.get(fp.id);
    if(p){fp.x=snapX(p.x);fp.y=snapY(p.y);}
  }
  touch();
}
