"use strict";
/* ==========================================================================
   Éditeur PCB — outils
   Historique, sélection, tracé, zones, contour, saisie clavier, souris.
   ========================================================================== */

/* ==========================================================================
   Historique
   ========================================================================== */
function docObj(){
  return {format:"pcbedit-1",cu:S.cu,cuL:S.cuL,show:S.show,board:S.board,rule:S.rule,
          classes:S.classes,netClass:S.netClass,origin:S.origin,fabOrigin:S.fabOrigin,
          fps:S.fps,tracks:S.tracks,vias:S.vias,zones:S.zones,cuts:S.cuts,
          active:S.active,nextId:S.nextId};
}
function serialize(){return JSON.stringify(docObj());}
function push(){
  S.undo.push(serialize());
  if(S.undo.length>80)S.undo.shift();
  S.redo.length=0;S.dirty=true;
}
function loadDoc(d,keepView){
  S.cu=clamp(d.cu||2,1,8);
  if(d.cuL&&d.cuL.length===S.cu)S.cuL=d.cuL;
  else{
    S.cuL=[];
    for(let i=0;i<S.cu;i++)
      S.cuL.push({name:cuLabel(i,S.cu),color:cuColor(i,S.cu),vis:true});
  }
  S.show=Object.assign({silkT:true,silkB:true,edge:true,rats:true,plane:true,drc:true,
    maskT:false,maskB:false,pasteT:false,pasteB:false},d.show||{});
  S.board=Object.assign({x:0,y:0,w:100,h:80,pts:null},d.board||{});
  S.origin=Object.assign({x:0,y:0},d.origin||{});
  S.fabOrigin=!!d.fabOrigin;
  if(S.board.pts&&S.board.pts.length<3)S.board.pts=null;
  const r=d.rule||{};
  S.rule={edge:r.edge!=null?r.edge:0.4, thermal:r.thermal!=null?r.thermal:0.5,
          mask:r.mask!=null?r.mask:0.05, paste:r.paste!=null?r.paste:0,
          tented:r.tented!==false};
  if(d.classes&&d.classes.length){
    S.classes=d.classes;S.netClass=d.netClass||{};
  }else{
    /* fichiers antérieurs aux classes : les deux largeurs deviennent deux
       classes, et les nets d'alimentation sont rattachés comme avant */
    S.classes=[{name:"Défaut",w:r.w||0.3,clr:r.clr||0.25,via:r.via||0.8,drill:r.drill||0.4},
               {name:"Alimentation",w:r.wPwr||0.6,clr:r.clr||0.25,
                via:r.via||0.8,drill:r.drill||0.4}];
    S.netClass={};
  }
  S.fps=d.fps||[];S.tracks=d.tracks||[];S.vias=d.vias||[];
  S.zones=d.zones||[];S.cuts=d.cuts||[];
  /* fichiers de la V1.0 : le rôle « plan » portait sur la couche entière.
     On le convertit en une zone rectangulaire, qui se modifie ensuite. */
  S.cuL.forEach((L,i)=>{
    if(L.plane){
      S.zones.push({id:S.nextId++,l:i,net:L.net||"",pts:boardZonePts()});
      delete L.plane;delete L.net;
    }
  });
  S.active=clamp(d.active||0,0,S.cu-1);S.pair=[0,S.cu-1];
  S.nextId=d.nextId||(Math.max(0,...S.fps.map(f=>f.id||0))+1);
  clearSel();S.route=null;S.zoneDraft=null;S.edgeDraft=null;S.drc=[];S.hlNet=null;
  zoneCache.clear();touch();
  if(!d.classes)autoClass();
  $("cuCount").value=String(S.cu);
  buildLayers();buildTabs();buildRules();refreshPanels();
  if(!keepView)fit();else draw();
}
function undo(){
  if(!S.undo.length)return;
  S.redo.push(serialize());
  loadDoc(JSON.parse(S.undo.pop()),true);
}
function redo(){
  if(!S.redo.length)return;
  S.undo.push(serialize());
  loadDoc(JSON.parse(S.redo.pop()),true);
}

/* ==========================================================================
   Sélection
   ========================================================================== */
function clearSel(){S.sel.fps.clear();S.sel.tracks.clear();S.sel.vias.clear();
  S.sel.zones.clear();S.sel.cuts.clear();S.sel.edge=false;}
function selCount(){return S.sel.fps.size+S.sel.tracks.size+S.sel.vias.size+S.sel.zones.size+S.sel.cuts.size;}
function hitTest(x,y,e){
  const tol=px(3);
  for(const v of S.vias)
    if(layerAlpha(v.a)>0&&dist(x,y,v.x,v.y)<=v.d/2+tol)return {via:v};
  for(const t of S.tracks)
    if(t.l===S.active&&segDist(x,y,t.x1,t.y1,t.x2,t.y2)<=t.w/2+tol)return {track:t};
  for(let i=S.fps.length-1;i>=0;i--){
    const fp=S.fps[i];
    const tp = fpTextPos(fp);
    if(Math.abs(x-tp.ref.x)<=(fp.ref.length||0)*tp.ref.size*0.4 && Math.abs(y-tp.ref.y)<=tp.ref.size*0.8) return {fpText:fp, kind:"ref"};
    if(fp.value && Math.abs(x-tp.val.x)<=(fp.value.length||0)*tp.val.size*0.4 && Math.abs(y-tp.val.y)<=tp.val.size*0.8) return {fpText:fp, kind:"val"};
    for(const q of padsWorld(fp))
      if(padDist(x,y,q)<=tol)return {fp,pad:q};
    const b=bodyOf(fp);
    const a=-(fp.rot||0)*Math.PI/180, ca=Math.cos(a), sa=Math.sin(a);
    let lx=(x-fp.x)*ca-(y-fp.y)*sa, ly=(x-fp.x)*sa+(y-fp.y)*ca;
    if(fp.side)lx=-lx;
    if(lx>=b.x1&&lx<=b.x2&&ly>=b.y1&&ly<=b.y2)return {fp};
  }
  for(const t of S.tracks)
    if(layerAlpha(t.l)>0&&segDist(x,y,t.x1,t.y1,t.x2,t.y2)<=t.w/2+tol)return {track:t};
  /* une zone s'attrape par son contour, sauf si on maintient Ctrl/Shift pour l'attraper de l'intérieur */
  for(let i=S.zones.length-1;i>=0;i--){
    const z=S.zones[i];
    if(layerAlpha(z.l)<=0||z.pts.length<2)continue;
    if(polyEdgeDist(x,y,z.pts)<=px(5))return {zone:z};
    if(e&&(e.ctrlKey||e.shiftKey||e.metaKey)&&inPoly(x,y,z.pts))return {zone:z};
  }
  for(let i=S.cuts.length-1;i>=0;i--){
    const c=S.cuts[i];
    if(layerAlpha(c.l)>0&&c.pts.length>1&&polyEdgeDist(x,y,c.pts)<=px(5))return {cut:c};
  }
  if(S.show.edge&&polyEdgeDist(x,y,boardPoly())<=px(5))return {edge:true};
  return null;
}
function selectHit(h,add){
  if(!add)clearSel();
  if(!h)return;
  if(h.fp)S.sel.fps.add(h.fp.id);
  else if(h.track)S.sel.tracks.add(h.track);
  else if(h.via)S.sel.vias.add(h.via);
  else if(h.zone)S.sel.zones.add(h.zone);
  else if(h.cut)S.sel.cuts.add(h.cut);
  else if(h.edge)S.sel.edge=true;
}
/* Toutes les extrémités (et le via éventuel) réunies en un même point : les
   déplacer ensemble évite de déchirer un coude en le tirant. */
function jointAt(x,y,l){
  const eps=0.002, ends=[], vias=[];
  const at=(a,b)=>Math.abs(a-x)<eps&&Math.abs(b-y)<eps;
  for(const t of S.tracks){
    if(t.l!==l)continue;
    if(at(t.x1,t.y1))ends.push({t,e:1});
    if(at(t.x2,t.y2))ends.push({t,e:2});
  }
  for(const v of S.vias)
    if(l>=v.a&&l<=v.b&&Math.abs(v.x-x)<eps&&Math.abs(v.y-y)<eps)vias.push(v);
  return {ends,vias};
}
function projOnSeg(px_,py_,t){
  const dx=t.x2-t.x1, dy=t.y2-t.y1, l2=dx*dx+dy*dy;
  if(l2<1e-12)return {x:t.x1,y:t.y1};
  const u=clamp(((px_-t.x1)*dx+(py_-t.y1)*dy)/l2,0,1);
  return {x:r3(t.x1+dx*u),y:r3(t.y1+dy*u)};
}
function splitTrack(t,pt){
  const nt={l:t.l,net:t.net,w:t.w,x1:pt.x,y1:pt.y,x2:t.x2,y2:t.y2};
  t.x2=pt.x;t.y2=pt.y;
  S.tracks.push(nt);
  return nt;
}
function netTracks(net){
  return {tracks:S.tracks.filter(t=>t.net===net),vias:S.vias.filter(v=>v.net===net)};
}
function selectNetRouting(net){
  if(!net)return;
  const g=netTracks(net);
  clearSel();
  g.tracks.forEach(t=>S.sel.tracks.add(t));
  g.vias.forEach(v=>S.sel.vias.add(v));
  S.hlNet=net;
  refreshPanels();draw();
  hint(g.tracks.length+" segment(s) et "+g.vias.length+" via(s) du net "+net+" sélectionnés.");
}
function deleteNetRouting(net){
  if(!net)return;
  push();
  S.tracks=S.tracks.filter(t=>t.net!==net);
  S.vias=S.vias.filter(v=>v.net!==net);
  clearSel();touch();refreshPanels();draw();
  hint("Routage du net "+net+" supprimé.");
}
function deleteSel(){
  if(!selCount())return;
  push();
  S.fps=S.fps.filter(f=>!S.sel.fps.has(f.id));
  S.tracks=S.tracks.filter(t=>!S.sel.tracks.has(t));
  S.vias=S.vias.filter(v=>!S.sel.vias.has(v));
  for(const z of S.sel.zones)detachAuto(z);
  S.zones=S.zones.filter(z=>!S.sel.zones.has(z));
  S.cuts=S.cuts.filter(c=>!S.sel.cuts.has(c));
  clearSel();touch();refreshPanels();draw();
}
function rotateSel(){
  const list=[...S.sel.fps];
  if(!list.length)return;
  push();
  for(const id of list){const f=fpById(id);if(f)f.rot=((f.rot||0)+90)%360;}
  touch();refreshPanels();draw();
}
function flipSel(){
  const list=[...S.sel.fps];
  if(!list.length)return;
  push();
  for(const id of list){const f=fpById(id);if(f)f.side=f.side?0:1;}
  touch();refreshPanels();draw();
}

/* ==========================================================================
   Tracé de pistes
   ========================================================================== */
function route45(a,b,posture){
  const dx=b.x-a.x, dy=b.y-a.y;
  const adx=Math.abs(dx), ady=Math.abs(dy);
  if(adx<1e-9&&ady<1e-9)return [];
  const sx=Math.sign(dx), sy=Math.sign(dy), m=Math.min(adx,ady);
  const mid=posture
    ? {x:a.x+sx*m, y:a.y+sy*m}
    : (adx>ady?{x:a.x+sx*(adx-ady),y:a.y}:{x:a.x,y:a.y+sy*(ady-adx)});
  const out=[];
  if(dist(a.x,a.y,mid.x,mid.y)>1e-9)out.push({x1:a.x,y1:a.y,x2:mid.x,y2:mid.y});
  if(dist(mid.x,mid.y,b.x,b.y)>1e-9)out.push({x1:mid.x,y1:mid.y,x2:b.x,y2:b.y});
  return out;
}
/* accroche : une pastille, une extrémité de piste ou un via sur la couche
   active attire le curseur — sans cela, un net « presque » relié est trop facile */
function magnet(x,y,layer,skip){
  const R=px(9);
  let best=null,bd=R;
  for(const fp of S.fps)
    for(const q of padsWorld(fp)){
      if(!padLayers(fp,q).includes(layer))continue;
      if(padDist(x,y,q)<=0)return {x:q.x,y:q.y,net:q.net,pad:true,obj:q};
      const d=dist(x,y,q.x,q.y);
      if(d<bd){bd=d;best={x:q.x,y:q.y,net:q.net,pad:true,obj:q};}
    }
  for(const v of S.vias){
    if(layer<v.a||layer>v.b)continue;
    const d=dist(x,y,v.x,v.y);
    if(d<bd){bd=d;best={x:v.x,y:v.y,net:v.net,via:true,obj:v};}
  }
  for(const t of S.tracks){
    if(t.l!==layer||(skip&&skip.has(t)))continue;
    for(const e of [[t.x1,t.y1],[t.x2,t.y2]]){
      const d=dist(x,y,e[0],e[1]);
      if(d<bd){bd=d;best={x:e[0],y:e[1],net:t.net,obj:t};}
    }
  }
  return best;
}
/* Repousse un point hors des obstacles de sa couche : on cherche à chaque
   passe le manque d'isolation le plus criant et on s'en écarte, jusqu'à ce que
   plus rien ne dépasse. Quelques passes suffisent, même dans un couloir. */
function pushClear(pt,l,net,w){
  if(!S.avoid||!net)return {x:pt.x,y:pt.y,pushed:false};
  let p={x:pt.x,y:pt.y}, moved=false;
  for(let it=0;it<8;it++){
    let best=null;
    const test=(d,need,dx,dy)=>{
      const def=need-d;
      if(def>1e-4&&(!best||def>best.def)){
        const len=Math.hypot(dx,dy);
        best={def,dx:len?dx/len:1,dy:len?dy/len:0};
      }
    };
    for(const fp of S.fps)
      for(const q of padsWorld(fp)){
        if(!padLayers(fp,q).includes(l)||q.net===net)continue;
        test(padDist(p.x,p.y,q)-w/2,clrPair(net,q.net),p.x-q.x,p.y-q.y);
      }
    for(const v of S.vias){
      if(l<v.a||l>v.b||v.net===net)continue;
      test(dist(p.x,p.y,v.x,v.y)-v.d/2-w/2,clrPair(net,v.net),p.x-v.x,p.y-v.y);
    }
    for(const t of S.tracks){
      if(t.l!==l||t.net===net)continue;
      const c=projOnSeg(p.x,p.y,t);
      test(dist(p.x,p.y,c.x,c.y)-t.w/2-w/2,clrPair(net,t.net),p.x-c.x,p.y-c.y);
    }
    if(!best)break;
    p={x:r3(p.x+best.dx*(best.def+0.005)),y:r3(p.y+best.dy*(best.def+0.005))};
    moved=true;
  }
  return {x:p.x,y:p.y,pushed:moved};
}
/* Le point repoussé ne garantit pas le segment : on vérifie le trajet complet. */
function segClearBad(s,l,net,w,ignoreObj){
  for(const fp of S.fps)
    for(const q of padsWorld(fp)){
      if(!padLayers(fp,q).includes(l)||q.net===net||(ignoreObj&&ignoreObj===q))continue;
      if(segPadDist({x1:s.x1,y1:s.y1,x2:s.x2,y2:s.y2,w},q)<clrPair(net,q.net)-1e-4)return true;
    }
  for(const v of S.vias){
    if(l<v.a||l>v.b||v.net===net||(ignoreObj&&ignoreObj===v))continue;
    if(segDist(v.x,v.y,s.x1,s.y1,s.x2,s.y2)-v.d/2-w/2<clrPair(net,v.net)-1e-4)return true;
  }
  for(const t of S.tracks){
    if(t.l!==l||t.net===net||(ignoreObj&&ignoreObj===t))continue;
    if(segSegDist({x1:s.x1,y1:s.y1,x2:s.x2,y2:s.y2},t)-t.w/2-w/2<clrPair(net,t.net)-1e-4)return true;
  }
  return false;
}
function routeBad(segs,l,net,w,ignoreObj){
  if(!S.avoid||!net)return false;
  for(const s of segs)if(segClearBad(s,l,net,w,ignoreObj))return true;
  return false;
}
function routeTarget(x,y){
  const l=S.route?S.route.layer:S.active;
  const net=S.route?S.route.net:"";
  const m=magnet(x,y,l);
  // une pastille du bon net est une arrivée légitime : on ne la repousse pas
  if(m&&(!net||!m.net||m.net===net)){S.hover={x:m.x,y:m.y};return m;}
  S.hover=null;
  const w=S.route?S.route.w:defaultWidth(net);
  const p=pushClear({x:snapX(x),y:snapY(y)},l,net,w);
  return {x:p.x,y:p.y,net:null,pushed:p.pushed};
}
function startRoute(x,y,exact){
  const t=exact?{x:r3(x),y:r3(y),
                 net:(netAtPoint(x,y,S.active)||{}).net||""}:routeTarget(x,y);
  const net=t.net||"";
  S.route={layer:S.active,net,w:defaultWidth(net),
           pt:{x:t.x,y:t.y},done:[],vias:[],preview:[],posture:false,bad:false,pushed:false};
  if(net)buildList();
  hint("Clic pour poser un coude · B pose un via et change de couche · touches 1-8 : couche · Échap termine.");
}
function updateRoute(x,y){
  const R=S.route;
  if(!R)return;
  const t=routeTarget(x,y);
  R.preview=route45(R.pt,{x:t.x,y:t.y},R.posture).map(s=>Object.assign({l:R.layer},s));
  R.end=t;R.pushed=!!t.pushed;
  R.bad=routeBad(R.preview,R.layer,R.net,R.w,R.end.obj);
}
/* même chose qu'updateRoute, mais vers un point imposé : c'est la saisie au
   clavier qui décide, pas le curseur */
function routeToPoint(pt){
  const R=S.route;
  if(!R)return;
  R.preview=route45(R.pt,pt,R.posture).map(s=>Object.assign({l:R.layer},s));
  R.end={x:pt.x,y:pt.y,net:(netAtPoint(pt.x,pt.y,R.layer)||{}).net||null,pad:false};
  R.pushed=false;
  R.bad=routeBad(R.preview,R.layer,R.net,R.w,R.end.obj);
}
function stepRoute(){
  const R=S.route;
  if(!R||!R.preview.length)return;
  if(R.bad){
    hint("Ce trajet passe sous l'isolation de "+fmt(classOf(R.net).clr,2)+
         " mm : contournez l'obstacle, ou coupez l'anti-collision pour forcer.");
    return;
  }
  for(const s of R.preview)R.done.push(s);
  const last=R.preview[R.preview.length-1];
  R.pt={x:last.x2,y:last.y2};
  R.preview=[];
  if(R.end) {
    if (R.end.via && !R.end.net && R.net && R.end.obj) {
      R.end.obj.net = R.net;
      R.end.net = R.net;
    }
    if (R.end.net && (!R.net || R.end.net === R.net)) commitRoute();
  }
}
function routeVia(){
  const R=S.route;
  if(!R||S.cu<2)return;
  const other=(R.layer===S.pair[0])?S.pair[1]:S.pair[0];
  placeVia(R.pt.x,R.pt.y,R.net,Math.min(R.layer,other),Math.max(R.layer,other),true);
  R.layer=other;S.active=other;
  buildTabs();buildLayers();refreshPanels();
}
function routeToLayer(i){
  const R=S.route;
  if(!R){setActive(i);return;}
  if(i===R.layer)return;
  placeVia(R.pt.x,R.pt.y,R.net,Math.min(R.layer,i),Math.max(R.layer,i),true);
  R.layer=i;setActive(i);
}
function placeVia(x,y,net,a,b,inRoute){
  if(S.cu<2){hint("Une seule couche de cuivre : un via n'aurait rien à relier.");return null;}
  const cl=classOf(net||"");
  const v={x:r3(x),y:r3(y),d:cl.via,drill:Math.min(cl.drill,cl.via-0.1),
           a:a==null?0:a,b:b==null?S.cu-1:b,net:net||""};
  if(v.a===v.b){v.a=0;v.b=S.cu-1;}
  if(!inRoute)push();
  S.vias.push(v);
  if(S.route)S.route.vias.push(v);
  touch();
  return v;
}
function commitRoute(){
  const R=S.route;
  S.route=null;
  if(!R)return;
  if(!R.done.length){touch();draw();return;}
  push();
  for(const s of R.done)
    S.tracks.push({l:s.l,net:R.net,w:R.w,x1:r3(s.x1),y1:r3(s.y1),x2:r3(s.x2),y2:r3(s.y2)});
  touch();refreshPanels();draw();
}
function cancelRoute(){
  const R=S.route;
  if(!R)return;
  for(const v of R.vias){const i=S.vias.indexOf(v);if(i>=0)S.vias.splice(i,1);}
  S.route=null;touch();draw();
}
function backRoute(){
  const R=S.route;
  if(!R||!R.done.length)return;
  const s=R.done.pop();
  R.pt={x:s.x1,y:s.y1};
  if(R.layer!==s.l){R.layer=s.l;setActive(s.l);}
  draw();
}

/* ==========================================================================
   Zones de cuivre : saisie point par point, fermeture sur le premier point
   ========================================================================== */
function zoneClick(x,y,exact){
  const Z=S.zoneDraft;
  const p=exact?{x:r3(x),y:r3(y)}:{x:snapX(x),y:snapY(y)};
  if(!Z){
    S.zoneDraft={l:S.active,pts:[p],cur:null};
    hint("Clic pour chaque sommet · retour sur le premier point (ou Entrée) pour fermer · Retour arrière annule le dernier · Échap abandonne.");
    return;
  }
  if(Z.pts.length>=3&&dist(p.x,p.y,Z.pts[0].x,Z.pts[0].y)<=px(9)){closeZone();return;}
  const last=Z.pts[Z.pts.length-1];
  if(dist(p.x,p.y,last.x,last.y)<1e-6)return;
  Z.pts.push(p);
}
function zoneMove(x,y,ortho){
  const Z=S.zoneDraft;
  if(!Z)return;
  let p={x:snapX(x),y:snapY(y)};
  if(ortho&&Z.pts.length){        // Maj : contrainte à 45°, comme pour les pistes
    const a=Z.pts[Z.pts.length-1];
    const dx=p.x-a.x, dy=p.y-a.y;
    if(Math.abs(Math.abs(dx)-Math.abs(dy))<Math.min(Math.abs(dx),Math.abs(dy)))
      p={x:a.x+Math.sign(dx)*Math.min(Math.abs(dx),Math.abs(dy)),
         y:a.y+Math.sign(dy)*Math.min(Math.abs(dx),Math.abs(dy))};
    else if(Math.abs(dx)>Math.abs(dy))p={x:p.x,y:a.y};
    else p={x:a.x,y:p.y};
  }
  const first=Z.pts[0];
  if(Z.pts.length>=3&&dist(p.x,p.y,first.x,first.y)<=px(9))p={x:first.x,y:first.y};
  Z.cur=p;
}
function askZoneNet(def, Z, isFullBoard){
  const d = document.createElement("dialog");
  d.style.cssText = "padding:20px; background:var(--bg-pnl,#1b1d24); color:var(--txt,#a9b2c3); border:1px solid var(--border,#2e323e); border-radius:4px; max-width:320px; font-family:sans-serif; font-size:13px; box-shadow: 0 4px 10px rgba(0,0,0,0.5);";
  
  const t = document.createElement("div");
  t.style.cssText = "margin-bottom:15px; font-weight:600; color:#fff;";
  t.textContent = isFullBoard ? "Net du plan pleine carte :" : "Net de la zone de cuivre :";
  d.appendChild(t);
  
  const sel = document.createElement("select");
  sel.style.cssText = "width:100%; margin-bottom:20px; padding:6px; background:var(--bg,#0f1115); color:#fff; border:1px solid var(--border,#2e323e); border-radius:2px;";
  
  const opt0 = document.createElement("option");
  opt0.value = ""; opt0.textContent = "— aucun (cuivre isolé) —";
  sel.appendChild(opt0);
  
  netTable().forEach(n=>{
    const opt = document.createElement("option");
    opt.value = n.name; opt.textContent = n.name;
    if(n.name === def) opt.selected = true;
    sel.appendChild(opt);
  });
  d.appendChild(sel);
  
  const row = document.createElement("div");
  row.style.cssText = "display:flex; justify-content:flex-end; gap:10px;";
  
  const btnC = document.createElement("button");
  btnC.className = "tb"; btnC.textContent = "Annuler";
  btnC.onclick = () => { d.close(); d.remove(); if(!isFullBoard){ S.zoneDraft=Z; draw(); } };
  
  const btnO = document.createElement("button");
  btnO.className = "tb"; btnO.textContent = "Valider";
  btnO.onclick = () => {
    const val = sel.value;
    d.close(); d.remove();
    push();
    const z = {id:S.nextId++, l:Z.l, net:val, pts: isFullBoard ? boardZonePts() : Z.pts.map(p=>({x:r3(p.x),y:r3(p.y)}))};
    S.zones.push(z);
    clearSel();S.sel.zones.add(z);
    touch();refreshPanels();draw();
    hint((isFullBoard?"Plan pleine carte":"Zone")+" sur "+cuId(z.l,S.cu)+(val?" rattaché au net "+val:"")+" — modifiable dans les Propriétés.");
  };
  
  row.appendChild(btnC); row.appendChild(btnO);
  d.appendChild(row);
  document.body.appendChild(d);
  d.showModal();
}

function closeZone(){
  const Z=S.zoneDraft;
  S.zoneDraft=null;
  if(!Z||Z.pts.length<3){draw();return;}
  const nets=netTable();
  let def=S.hlNet||(nets.find(n=>isPower(n.name))||{}).name||"";
  askZoneNet(def, Z, false);
}
function cutClick(x,y,exact){
  const C=S.cutDraft;
  const p=exact?{x:r3(x),y:r3(y)}:{x:snapX(x),y:snapY(y)};
  if(!C){
    S.cutDraft={l:S.active,pts:[p],cur:null};
    hint("Clic pour chaque sommet · retour sur le premier point (ou Entrée) pour fermer la découpe · Retour arrière annule le dernier · Échap abandonne.");
    return;
  }
  if(C.pts.length>=3&&dist(p.x,p.y,C.pts[0].x,C.pts[0].y)<=px(9)){closeCut();return;}
  const last=C.pts[C.pts.length-1];
  if(dist(p.x,p.y,last.x,last.y)<1e-6)return;
  C.pts.push(p);
}
function cutMove(x,y,ortho){
  const C=S.cutDraft;
  if(!C)return;
  let p={x:snapX(x),y:snapY(y)};
  if(ortho&&C.pts.length){
    const a=C.pts[C.pts.length-1];
    const dx=p.x-a.x, dy=p.y-a.y;
    if(Math.abs(Math.abs(dx)-Math.abs(dy))<Math.min(Math.abs(dx),Math.abs(dy)))
      p={x:a.x+Math.sign(dx)*Math.min(Math.abs(dx),Math.abs(dy)),
         y:a.y+Math.sign(dy)*Math.min(Math.abs(dx),Math.abs(dy))};
    else if(Math.abs(dx)>Math.abs(dy))p={x:p.x,y:a.y};
    else p={x:a.x,y:p.y};
  }
  const first=C.pts[0];
  if(C.pts.length>=3&&dist(p.x,p.y,first.x,first.y)<=px(9))p={x:first.x,y:first.y};
  C.cur=p;
}
function closeCut(){
  const C=S.cutDraft;
  S.cutDraft=null;
  if(!C||C.pts.length<3){draw();return;}
  push();
  const c={id:S.nextId++,l:C.l,pts:C.pts.map(p=>({x:r3(p.x),y:r3(p.y)}))};
  S.cuts.push(c);
  touch();refreshPanels();draw();
  hint("Découpe créée sur "+cuId(c.l,S.cu));
}
function fullBoardZone(){
  const nets=netTable();
  let def=S.hlNet||(nets.find(n=>isPower(n.name))||{}).name||"";
  askZoneNet(def, null, true);
}

/* ==========================================================================
   Contour de carte : même geste que les zones, point par point
   ========================================================================== */
function edgeClick(x,y,exact){
  const Z=S.edgeDraft;
  const p=exact?{x:r3(x),y:r3(y)}:{x:snapX(x),y:snapY(y)};
  if(!Z){
    S.edgeDraft={pts:[p],cur:null};
    hint("Clic pour chaque sommet du contour · retour sur le premier point (ou Entrée) pour fermer · Échap abandonne.");
    return;
  }
  if(Z.pts.length>=3&&dist(p.x,p.y,Z.pts[0].x,Z.pts[0].y)<=px(9)){closeEdge();return;}
  const last=Z.pts[Z.pts.length-1];
  if(dist(p.x,p.y,last.x,last.y)<1e-6)return;
  Z.pts.push(p);
}
function edgeMove(x,y,ortho){
  const Z=S.edgeDraft;
  if(!Z)return;
  let p={x:snapX(x),y:snapY(y)};
  if(ortho&&Z.pts.length){
    const a=Z.pts[Z.pts.length-1], dx=p.x-a.x, dy=p.y-a.y;
    if(Math.abs(Math.abs(dx)-Math.abs(dy))<Math.min(Math.abs(dx),Math.abs(dy)))
      p={x:a.x+Math.sign(dx)*Math.min(Math.abs(dx),Math.abs(dy)),
         y:a.y+Math.sign(dy)*Math.min(Math.abs(dx),Math.abs(dy))};
    else if(Math.abs(dx)>Math.abs(dy))p={x:p.x,y:a.y};
    else p={x:a.x,y:p.y};
  }
  const f=Z.pts[0];
  if(Z.pts.length>=3&&dist(p.x,p.y,f.x,f.y)<=px(9))p={x:f.x,y:f.y};
  Z.cur=p;
}
function closeEdge(){
  const Z=S.edgeDraft;
  S.edgeDraft=null;
  if(!Z||Z.pts.length<3){draw();return;}
  push();
  S.board.pts=Z.pts.map(p=>({x:r3(p.x),y:r3(p.y)}));
  boardChanged();
  clearSel();S.sel.edge=true;
  refreshPanels();buildRules();draw();
  const out=S.fps.filter(f=>!inBoard(f.x,f.y,0)).length;
  hint("Contour redéfini : "+S.board.pts.length+" sommets, "+
       fmt(S.board.w,1)+" × "+fmt(S.board.h,1)+" mm"+
       (out?" — "+out+" empreinte(s) se retrouvent dehors":"")+".");
}

/* ==========================================================================
   Saisie de coordonnées au clavier
   Trois repères : absolu depuis l'origine utilisateur, relatif au dernier
   point posé, ou polaire (longueur et angle) depuis ce même point.
   ========================================================================== */
function coordAnchor(){
  if(S.route)return S.route.pt;
  if(S.zoneDraft&&S.zoneDraft.pts.length)return S.zoneDraft.pts[S.zoneDraft.pts.length-1];
  if(S.edgeDraft&&S.edgeDraft.pts.length)return S.edgeDraft.pts[S.edgeDraft.pts.length-1];
  if(S.mode==="select"&&S.sel.fps.size===1){
    const f=fpById([...S.sel.fps][0]);
    if(f)return {x:f.x,y:f.y};
  }
  return null;
}
function coordUsable(){
  return S.mode==="track"||S.mode==="zone"||S.mode==="edge"||
         (S.mode==="select"&&S.sel.fps.size===1);
}
function coordMode(m){
  S.coord.mode=m;
  for(const [id,k] of [["ciAbs","abs"],["ciRel","rel"],["ciPol","pol"]])
    $(id).classList.toggle("on",k===m);
  $("ciLa").textContent=m==="abs"?"X":(m==="rel"?"dX":"L");
  $("ciLb").textContent=m==="abs"?"Y":(m==="rel"?"dY":"∠°");
  coordFill();
}
function coordFill(){
  const m=S.coord.mode, a=coordAnchor(), c=S.mouse;
  if(m==="abs"){$("ciA").value=fmt(ux(c.x),3);$("ciB").value=fmt(uy(c.y),3);}
  else if(m==="rel"){
    $("ciA").value=a?fmt(c.x-a.x,3):"0";
    $("ciB").value=a?fmt(c.y-a.y,3):"0";
  }else{
    const dx=a?c.x-a.x:0, dy=a?c.y-a.y:0;
    $("ciA").value=fmt(Math.hypot(dx,dy),3);
    $("ciB").value=fmt(Math.atan2(-dy,dx)*180/Math.PI,2);
  }
}
function coordOpen(){
  if(!coordUsable()){
    hint("La saisie de coordonnées s'ouvre en mode Piste, Zone, Contour, ou sur une empreinte sélectionnée.");
    return;
  }
  S.coord.open=true;
  $("coordBox").classList.add("on");
  coordMode(S.coord.mode);
  $("ciA").focus();$("ciA").select();
}
function coordClose(){
  S.coord.open=false;
  $("coordBox").classList.remove("on");
  cv.focus&&cv.focus();
}
function coordPoint(){
  const m=S.coord.mode, a=coordAnchor();
  const va=parseFloat(String($("ciA").value).replace(",","."));
  const vb=parseFloat(String($("ciB").value).replace(",","."));
  if(isNaN(va)||isNaN(vb))return null;
  if(m==="abs")return {x:wxu(va),y:wyu(vb)};
  const base=a||{x:S.origin.x,y:S.origin.y};
  if(m==="rel")return {x:r3(base.x+va),y:r3(base.y+vb)};
  const ang=vb*Math.PI/180;                 // angle direct, comme on le lit à l'écran
  return {x:r3(base.x+va*Math.cos(ang)), y:r3(base.y-va*Math.sin(ang))};
}
function coordApply(){
  const pt=coordPoint();
  if(!pt){hint("Coordonnées illisibles.");return;}
  if(S.mode==="track"){
    if(!S.route)startRoute(pt.x,pt.y,true);
    else{routeToPoint(pt);stepRoute();}
  }else if(S.mode==="zone"){
    zoneClick(pt.x,pt.y,true);
  }else if(S.mode==="edge"){
    edgeClick(pt.x,pt.y,true);
  }else if(S.mode==="select"&&S.sel.fps.size===1){
    const f=fpById([...S.sel.fps][0]);
    if(f){push();f.x=pt.x;f.y=pt.y;touch();refreshPanels();}
  }
  S.mouse={x:pt.x,y:pt.y};
  if(S.coord.mode!=="abs"){$("ciA").value="0";$("ciB").value="0";}
  else coordFill();
  $("ciA").focus();$("ciA").select();
  draw();
}
function placeOrigin(x,y){
  const m=magnet(x,y,S.active);
  push();
  S.origin={x:m?r3(m.x):r3(Math.round(x/S.grid)*S.grid),
            y:m?r3(m.y):r3(Math.round(y/S.grid)*S.grid)};
  touch();buildRules();refreshPanels();draw();
  hint("Origine posée en "+fmt(S.origin.x,2)+" ; "+fmt(S.origin.y,2)+
       (m?" (sur une pastille)":"")+" — la grille et les coordonnées la suivent.");
}

/* ==========================================================================
   Souris
   ========================================================================== */
let drag=null;
function evPos(e){
  const r=cv.getBoundingClientRect();
  return s2w(e.clientX-r.left,e.clientY-r.top);
}
cv.addEventListener("pointerdown",e=>{
  cv.setPointerCapture(e.pointerId);
  const p=evPos(e);
  if(e.button===1||(e.button===0&&e.altKey)){
    drag={pan:true,sx:e.clientX,sy:e.clientY,ox:S.ox,oy:S.oy};
    return;
  }
  if(e.button!==0)return;
  if(S.mode==="track"){
    if(!S.route)startRoute(p.x,p.y);
    else{updateRoute(p.x,p.y);stepRoute();}
    draw();return;
  }
  if(S.mode==="zone"){
    zoneClick(p.x,p.y);draw();return;
  }
  if(S.mode==="edge"){
    edgeClick(p.x,p.y);draw();return;
  }
  if(S.mode==="origin"){
    placeOrigin(p.x,p.y);setMode("select");return;
  }
  if(S.mode==="via"){
    const m=magnet(p.x,p.y,S.active);
    const x=m?m.x:snapX(p.x), y=m?m.y:snapY(p.y);
    placeVia(x,y,m?m.net:"",0,S.cu-1,false);
    refreshPanels();draw();return;
  }
  if(S.mode==="erase"){
    const h=hitTest(p.x,p.y,e);
    if(h){
      push();
      if(h.fp)S.fps=S.fps.filter(f=>f!==h.fp);
      else if(h.track)S.tracks=S.tracks.filter(t=>t!==h.track);
      else if(h.via)S.vias=S.vias.filter(v=>v!==h.via);
      else if(h.zone){detachAuto(h.zone);S.zones=S.zones.filter(z=>z!==h.zone);
        buildLayers();buildTabs();}
      else if(h.edge)hint("Le contour de carte ne s'efface pas : redessinez-le (E) ou repassez au rectangle.");
      touch();refreshPanels();draw();
    }
    return;
  }
  if(S.mode==="cut"){
    cutClick(p.x,p.y);draw();return;
  }
  // sélection : les extrémités d'une piste déjà sélectionnée passent devant tout
  for(const t of S.sel.tracks){
    for(const en of [1,2]){
      const ex=en===1?t.x1:t.x2, ey=en===1?t.y1:t.y2;
      if(dist(p.x,p.y,ex,ey)<=px(6)){
        // Ctrl : on détache cette extrémité au lieu d'emmener tout le coude
        const g=(e.ctrlKey||e.metaKey)?{ends:[{t,e:en}],vias:[]}:jointAt(ex,ey,t.l);
        drag={tend:g,l:t.l,moved:false};
        return;
      }
    }
  }
  if(e.ctrlKey||e.metaKey)
    for(const t of S.sel.tracks)
      if(segDist(p.x,p.y,t.x1,t.y1,t.x2,t.y2)<=t.w/2+px(4)){
        push();
        const pt=projOnSeg(p.x,p.y,t), nt=splitTrack(t,pt);
        S.sel.tracks.add(nt);
        drag={tend:{ends:[{t,e:2},{t:nt,e:1}],vias:[]},l:t.l,moved:true};
        touch();refreshPanels();draw();
        return;
      }
  if(S.sel.edge&&S.board.pts){
    const P=S.board.pts;
    for(let i=0;i<P.length;i++)
      if(dist(p.x,p.y,P[i].x,P[i].y)<=px(6)){
        drag={vert:{z:S.board,i},board:true,moved:false};return;
      }
    if((e.ctrlKey||e.metaKey)&&polyEdgeDist(p.x,p.y,P)<=px(6)){
      let bi=0,bd=1e9;
      for(let i=0,j=P.length-1;i<P.length;j=i++){
        const d=segDist(p.x,p.y,P[j].x,P[j].y,P[i].x,P[i].y);
        if(d<bd){bd=d;bi=i;}
      }
      push();
      P.splice(bi,0,{x:snapX(p.x),y:snapY(p.y)});
      boardChanged();
      drag={vert:{z:S.board,i:bi},board:true,moved:true};draw();return;
    }
  }
  // les sommets d'une zone déjà sélectionnée passent aussi devant
  for(const z of S.sel.zones){
    for(let i=0;i<z.pts.length;i++)
      if(dist(p.x,p.y,z.pts[i].x,z.pts[i].y)<=px(6)){
        drag={vert:{z,i},moved:false};return;
      }
    if((e.ctrlKey||e.metaKey)&&polyEdgeDist(p.x,p.y,z.pts)<=px(6)){
      // Ctrl+clic sur une arête : on y insère un sommet, prêt à être tiré
      let bi=0,bd=1e9;
      for(let i=0,j=z.pts.length-1;i<z.pts.length;j=i++){
        const d=segDist(p.x,p.y,z.pts[j].x,z.pts[j].y,z.pts[i].x,z.pts[i].y);
        if(d<bd){bd=d;bi=i;}
      }
      push();
      z.pts.splice(bi,0,{x:snapX(p.x),y:snapY(p.y)});
      touch();drag={vert:{z,i:bi},moved:true};draw();return;
    }
  }
  const h=hitTest(p.x,p.y,e);
  if(h && h.fpText) {
    if(!e.shiftKey) {clearSel();S.hlNet=null;}
    S.hlText = h;
    drag={moveText:h, x:snapX(p.x), y:snapY(p.y), moved:false};
    refreshPanels();draw();return;
  }
  if(!h){
    if(!e.shiftKey){clearSel();S.hlNet=null;}
    S.marquee={x1:p.x,y1:p.y,x2:p.x,y2:p.y};
    drag={marquee:true};
    refreshPanels();draw();return;
  }
  const already=(h.fp&&S.sel.fps.has(h.fp.id))||(h.track&&S.sel.tracks.has(h.track))||
                (h.via&&S.sel.vias.has(h.via));
  if(!already)selectHit(h,e.shiftKey);
  if(h.pad&&h.pad.net)S.hlNet=h.pad.net;
  drag={move:true,x:p.x,y:p.y,moved:false};
  refreshPanels();draw();
});
cv.addEventListener("pointermove",e=>{
  const p=evPos(e);
  S.mouse=p;
  $("fX").textContent=fmt(ux(p.x),2);
  $("fY").textContent=fmt(uy(p.y),2);
  const at=netAtPoint(p.x,p.y,S.active);
  $("fNet").textContent=at&&at.net?at.net:"—";
  if(drag&&drag.pan){
    S.ox=drag.ox+(e.clientX-drag.sx);
    S.oy=drag.oy+(e.clientY-drag.sy);
    draw();return;
  }
  if(drag&&drag.marquee){
    S.marquee.x2=p.x;S.marquee.y2=p.y;draw();return;
  }
  if(drag&&drag.tend){
    if(!drag.moved){push();drag.moved=true;}
    const skip=new Set(drag.tend.ends.map(o=>o.t));
    const m=magnet(p.x,p.y,drag.l,skip);
    const nx=m?m.x:snapX(p.x), ny=m?m.y:snapY(p.y);
    S.hover=m?{x:m.x,y:m.y}:null;
    for(const o of drag.tend.ends){
      if(o.e===1){o.t.x1=r3(nx);o.t.y1=r3(ny);}
      else{o.t.x2=r3(nx);o.t.y2=r3(ny);}
    }
    for(const v of drag.tend.vias){v.x=r3(nx);v.y=r3(ny);}
    touch();draw();return;
  }
  if(drag&&drag.vert){
    if(!drag.moved){
      push();drag.moved=true;
      if(detachAuto(drag.vert.z)){
        buildLayers();buildTabs();
        hint("Plan déformé à la main : la couche repasse en signal et la zone devient libre.");
      }
    }
    drag.vert.z.pts[drag.vert.i]={x:snapX(p.x),y:snapY(p.y)};
    if(drag.board)boardChanged();else touch();
    draw();return;
  }
  if(drag&&drag.moveText){
    const dx=snapX(p.x)-snapX(drag.x), dy=snapY(p.y)-snapY(drag.y);
    if(dx||dy){
      if(!drag.moved){push();drag.moved=true;}
      const f = drag.moveText.fpText;
      if (drag.moveText.kind === "ref") {
        f.refOffX = r3((f.refOffX||0)+dx);
        f.refOffY = r3((f.refOffY||0)+dy);
      } else {
        f.valOffX = r3((f.valOffX||0)+dx);
        f.valOffY = r3((f.valOffY||0)+dy);
      }
      drag.x+=dx;drag.y+=dy;
      touch();draw();
    }
    return;
  }
  if(drag&&drag.move){
    const dx=snapX(p.x)-snapX(drag.x), dy=snapY(p.y)-snapY(drag.y);
    if(dx||dy){
      if(!drag.moved){push();drag.moved=true;}
      for(const id of S.sel.fps){const f=fpById(id);if(f){f.x=r3(f.x+dx);f.y=r3(f.y+dy);}}
      for(const t of S.sel.tracks){t.x1=r3(t.x1+dx);t.y1=r3(t.y1+dy);t.x2=r3(t.x2+dx);t.y2=r3(t.y2+dy);}
      for(const v of S.sel.vias){v.x=r3(v.x+dx);v.y=r3(v.y+dy);}
      for(const z of S.sel.zones){
        if(detachAuto(z)){buildLayers();buildTabs();}
        for(const q of z.pts){q.x=r3(q.x+dx);q.y=r3(q.y+dy);}
      }
      for(const ct of S.sel.cuts){
        for(const q of ct.pts){q.x=r3(q.x+dx);q.y=r3(q.y+dy);}
      }
      drag.x+=dx;drag.y+=dy;
      touch();draw();
    }
    return;
  }
  if(S.mode==="zone"&&S.zoneDraft){zoneMove(p.x,p.y,e.shiftKey);draw();return;}
  if(S.mode==="cut"&&S.cutDraft){cutMove(p.x,p.y,e.shiftKey);draw();return;}
  if(S.mode==="edge"&&S.edgeDraft){edgeMove(p.x,p.y,e.shiftKey);draw();return;}
  if(S.mode==="track"&&S.route){updateRoute(p.x,p.y);draw();return;}
  if(S.mode==="track"||S.mode==="via"){
    const m=magnet(p.x,p.y,S.active);
    const h=m?{x:m.x,y:m.y}:null;
    if((h&&!S.hover)||(!h&&S.hover)||(h&&S.hover&&(h.x!==S.hover.x||h.y!==S.hover.y))){
      S.hover=h;draw();
    }
  }
});
cv.addEventListener("pointerup",e=>{
  if(S.hlText){S.hlText=null;draw();}
  if(drag&&drag.tend){
    const dead=S.tracks.filter(t=>dist(t.x1,t.y1,t.x2,t.y2)<1e-6);
    if(dead.length){
      S.tracks=S.tracks.filter(t=>dead.indexOf(t)<0);
      dead.forEach(t=>S.sel.tracks.delete(t));
      touch();
    }
    S.hover=null;drag=null;refreshPanels();draw();return;
  }
  if(drag&&drag.marquee){
    const m=S.marquee;
    const x1=Math.min(m.x1,m.x2),x2=Math.max(m.x1,m.x2);
    const y1=Math.min(m.y1,m.y2),y2=Math.max(m.y1,m.y2);
    if(x2-x1>px(3)||y2-y1>px(3)){
      for(const fp of S.fps){
        const b=fpBBox(fp);
        if(b.x1>=x1&&b.x2<=x2&&b.y1>=y1&&b.y2<=y2)S.sel.fps.add(fp.id);
      }
      for(const t of S.tracks)
        if(layerAlpha(t.l)>0&&t.x1>=x1&&t.x1<=x2&&t.y1>=y1&&t.y1<=y2&&
           t.x2>=x1&&t.x2<=x2&&t.y2>=y1&&t.y2<=y2)S.sel.tracks.add(t);
      for(const v of S.vias)
        if(v.x>=x1&&v.x<=x2&&v.y>=y1&&v.y<=y2)S.sel.vias.add(v);
    }
    S.marquee=null;refreshPanels();draw();
  }
  drag=null;
});
cv.addEventListener("contextmenu",e=>{
  e.preventDefault();
  if(S.route)commitRoute();
  else if(S.zoneDraft)closeZone();
  else if(S.edgeDraft)closeEdge();
  else{S.hlNet=null;refreshPanels();draw();}
});
cv.addEventListener("dblclick",()=>{
  if(S.route)commitRoute();
  else if(S.zoneDraft)closeZone();
  else if(S.edgeDraft)closeEdge();
});
cv.addEventListener("auxclick",e=>{if(e.button===1)e.preventDefault();});
cv.addEventListener("wheel",e=>{
  e.preventDefault();
  const r=cv.getBoundingClientRect(), mx=e.clientX-r.left, my=e.clientY-r.top;
  const b=s2w(mx,my);
  S.scale=clamp(S.scale*(e.deltaY<0?1.12:1/1.12),0.6,80);
  const a=s2w(mx,my);
  S.ox+=(mirX(a.x)-mirX(b.x))*S.scale;
  S.oy+=(a.y-b.y)*S.scale;
  draw();
},{passive:false});

/* ==========================================================================
   Clavier
   ========================================================================== */
document.addEventListener("keydown",e=>{
  const t=e.target;
  if(t&&(t.tagName==="INPUT"||t.tagName==="TEXTAREA"||t.tagName==="SELECT"))return;
  const k=e.key.toLowerCase();
  if(e.key==="Tab"){e.preventDefault();S.coord.open?coordClose():coordOpen();return;}
  if((e.ctrlKey||e.metaKey)&&k==="z"){e.preventDefault();e.shiftKey?redo():undo();return;}
  if((e.ctrlKey||e.metaKey)&&k==="y"){e.preventDefault();redo();return;}
  if((e.ctrlKey||e.metaKey)&&k==="s"){e.preventDefault();saveJson();return;}
  if((e.ctrlKey||e.metaKey)&&k==="a"){
    e.preventDefault();
    S.fps.forEach(f=>S.sel.fps.add(f.id));
    S.tracks.forEach(x=>S.sel.tracks.add(x));
    S.vias.forEach(v=>S.sel.vias.add(v));
    refreshPanels();draw();return;
  }
  if(e.key>="1"&&e.key<="8"){
    const i=+e.key-1;
    if(i<S.cu){e.preventDefault();routeToLayer(i);draw();}
    return;
  }
  switch(k){
    case "s":setMode("select");break;
    case "t":setMode("track");break;
    case "v":if(S.route){routeVia();draw();}else setMode("via");break;
    case "z":setMode("zone");break;
    case "x":setMode("cut");break;
    case "e":setMode("edge");break;
    case "o":setMode("origin");break;
    case "r":rotateSel();break;
    case "f":flipSel();break;
    case "g":setGrid(!S.showGrid);break;
    case "n":S.show.rats=!S.show.rats;$("bRats").classList.toggle("on",S.show.rats);draw();break;
    case "y":setFlip(!S.flip);break;
    case "h":setContrast((S.contrast+1)%3);break;
    case " ":
      if(S.route){S.route.posture=!S.route.posture;updateRoute(S.mouse.x,S.mouse.y);draw();e.preventDefault();}
      break;
    case "escape":
      // Échap termine ce qui est en cours puis rend la main à la sélection
      if(S.route)commitRoute();
      else if(S.zoneDraft){S.zoneDraft=null;hint("Zone abandonnée.");}
      else if(S.cutDraft){S.cutDraft=null;hint("Découpe abandonnée.");}
      else if(S.edgeDraft){S.edgeDraft=null;hint("Contour abandonné.");}
      else{clearSel();S.hlNet=null;refreshPanels();}
      if(S.mode!=="select")setMode("select");
      draw();
      break;
    case "enter":
      if(S.route)commitRoute();
      else if(S.zoneDraft)closeZone();
      else if(S.cutDraft)closeCut();
      else if(S.edgeDraft)closeEdge();
      break;
    case "backspace":
      if(S.route){backRoute();e.preventDefault();}
      else if(S.zoneDraft){
        S.zoneDraft.pts.pop();
        if(!S.zoneDraft.pts.length)S.zoneDraft=null;
        draw();e.preventDefault();
      }
      else if(S.cutDraft){
        S.cutDraft.pts.pop();
        if(!S.cutDraft.pts.length)S.cutDraft=null;
        draw();e.preventDefault();
      }
      else if(S.edgeDraft){
        S.edgeDraft.pts.pop();
        if(!S.edgeDraft.pts.length)S.edgeDraft=null;
        draw();e.preventDefault();
      }
      break;
    case "delete":deleteSel();break;
  }
});

/* ==========================================================================
   Barre d'outils et bascules
   ========================================================================== */
function hint(t){$("fHint").textContent=t;}
function setMode(m){
  if(S.route&&m!=="track")commitRoute();
  if(S.coord.open&&!coordUsable())coordClose();
  if(S.zoneDraft&&m!=="zone")S.zoneDraft=null;
  if(S.edgeDraft&&m!=="edge")S.edgeDraft=null;
  S.mode=m;S.hover=null;
  for(const [id,md] of [["mSelect","select"],["mTrack","track"],["mVia","via"],
                        ["mZone","zone"],["mEdge","edge"],["mOrigin","origin"],
                        ["mErase","erase"]])
    $(id).classList.toggle("on",m===md);
  $("fMode").textContent={select:"Sélection",track:"Piste",via:"Via",
                          zone:"Zone de cuivre",edge:"Contour de carte",
                          origin:"Origine",erase:"Gomme"}[m];
  cv.style.cursor=m==="erase"?"not-allowed":"crosshair";
  hint({
    select:"Glisser pour déplacer · R pivote · F retourne · une piste sélectionnée montre ses extrémités, Ctrl+clic y insère un point.",
    track:"Clic sur une pastille pour partir · V pose un via · 1-8 change de couche · Tab saisit les coordonnées · Échap termine.",
    via:"Clic pour poser un via traversant, accroché à la pastille ou à la piste la plus proche.",
    zone:"Clic pour chaque sommet, retour sur le premier point pour fermer · Maj contraint à 45° · Entrée ferme, Échap abandonne.",
    edge:"Dessinez le contour de la carte, sommet par sommet · retour sur le premier point pour fermer · Maj contraint à 45°.",
    origin:"Cliquez le point qui servira d'origine — une pastille proche l'attire.",
    erase:"Clic sur une piste, un via ou une empreinte pour le supprimer."
  }[m]);
  draw();
}
function setGrid(v){S.showGrid=!!v;$("bGrid").classList.toggle("on",S.showGrid);draw();}
function setFlip(v){
  S.flip=!!v;
  $("bView").innerHTML="Vue : "+(S.flip?"dessous":"dessus")+' <kbd>Y</kbd>';
  $("bView").classList.toggle("on",S.flip);
  draw();
}
function setContrast(v){
  S.contrast=v;
  const n=["complet","atténué","couche seule"][v];
  $("bContrast").innerHTML="Contraste : "+n+' <kbd>H</kbd>';
  $("bContrast").classList.toggle("on",v>0);
  draw();
}
function setActive(i){
  S.active=clamp(i,0,S.cu-1);
  if(!S.cuL[S.active].vis){S.cuL[S.active].vis=true;buildLayers();}
  buildTabs();buildLayers();buildActiveLayer();draw();
}

