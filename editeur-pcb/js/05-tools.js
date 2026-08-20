"use strict";
/* ==========================================================================
   Éditeur PCB — outils
   Historique, sélection, tracé, zones, contour, saisie clavier, souris.
   ========================================================================== */

/* ==========================================================================
   Historique
   ========================================================================== */
function docObj(){
  return {format:"pcbedit-1",cu:S.cu,cuL:S.cuL,stack:S.stack,show:S.show,
          board:S.board,rule:S.rule,
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
/* ==========================================================================
   Lecture d'un document — rien de ce qui vient du fichier n'est cru sur parole
   Un .json peut venir d'une version antérieure, avoir été retouché à la main
   ou être franchement hostile. Chaque enregistrement est donc reconstruit
   champ par champ : types forcés, bornes appliquées, enregistrements
   inutilisables écartés. C'est le pendant de normComp() côté schématique.

   Les panneaux échappent déjà ce qu'ils affichent ; ce qu'on évite ici, c'est
   qu'une valeur absurde — couche inexistante, largeur négative, polygone à un
   sommet, couleur qui n'est pas une couleur — traverse le rendu, le DRC et
   les fichiers de fabrication.

   Contrainte forte : la normalisation doit être NEUTRE sur un document que
   l'éditeur a lui-même produit, parce que loadDoc() sert aussi à annuler et
   rétablir. Un essai du banc vérifie qu'un aller-retour ne change rien.
   ========================================================================== */
function dNum(v,def){const n=+v;return Number.isFinite(n)?n:def;}
function dRange(v,def,min,max){return clamp(dNum(v,def),min,max);}
function dInt(v,def,min,max){return Math.round(dRange(v,def,min,max));}
function dStr(v,max){return String(v==null?"":v).slice(0,max);}
function dNet(v){return dStr(v,64).trim();}
/* une couleur de couche finit dans un attribut style : on n'accepte que la
   notation produite par le sélecteur de couleur */
const HEX_COLOR=/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
function dColor(v,def){
  const s=String(v==null?"":v).trim();
  return HEX_COLOR.test(s)?s:def;
}
const FP_ROT_OK={0:1,45:1,90:1,135:1,180:1,225:1,270:1,315:1};
const COORD=1e5;                    // garde-fou de coordonnée, en mm

/* polygone : les sommets exploitables, ou null s'il en reste moins de `min` */
function dPts(a,min){
  if(!Array.isArray(a))return null;
  const out=[];
  for(const p of a){
    if(!p||typeof p!=="object")continue;
    const x=+p.x, y=+p.y;
    if(!Number.isFinite(x)||!Number.isFinite(y))continue;
    out.push({x:clamp(x,-COORD,COORD),y:clamp(y,-COORD,COORD)});
  }
  return out.length>=min?out:null;
}
/* broche -> net : on garde les numéros de broche entiers positifs, même
   au-delà du nombre de broches courant — réduire `pins` puis l'augmenter
   à nouveau doit retrouver les nets. */
function dNets(o){
  const out={};
  if(!o||typeof o!=="object")return out;
  for(const k in o){
    const n=+k;
    if(!Number.isInteger(n)||n<1||n>4096)continue;
    const net=dNet(o[k]);
    if(net)out[n]=net;
  }
  return out;
}
function normLayer(L,i,n){
  const src=(L&&typeof L==="object")?L:{};
  const custom=!!src.custom;
  const out={
    name:dStr(src.name,40).trim()||cuLabel(i,n),
    custom:custom,
    color:dColor(src.color,cuColor(i,n)),
    vis:src.vis!==false
  };
  /* le rôle « plan » et son net font partie de la forme d'une couche
     (setCuCount les écrit toujours) : on les conserve tels quels, loadDoc()
     en fait son affaire ensuite. */
  out.plane=!!src.plane;
  out.net=dNet(src.net);
  /* le rôle est la lecture humaine de ce couple : signal, mixte, plan de masse,
     plan d'alimentation, blindage. Il ne peut pas contredire `plane`. */
  out.role=coherentRole(dStr(src.role,16),out.plane,out.net);
  return out;
}
/* Empilage physique. Les longueurs sont imposées par le nombre de couches,
   les listes fermées le sont vraiment — un `finish` inventé finirait dans la
   feuille d'empilage envoyée au fabricant — et le reste est borné. */
function normStack(s,cu){
  const def=stackDefaults(cu);
  const src=(s&&typeof s==="object")?s:{};
  const one=(v,list,d)=>{const x=dStr(v,48);return list.indexOf(x)>=0?x:d;};
  const out={
    target:dRange(src.target,def.target,0.05,50),
    finish:one(src.finish,FINISHES,def.finish),
    maskT:dRange(src.maskT,def.maskT,0,1),
    maskEr:dRange(src.maskEr,def.maskEr,1,20),
    maskColor:one(src.maskColor,MASK_COLORS,def.maskColor),
    silkColor:one(src.silkColor,SILK_COLORS,def.silkColor),
    cu:[],di:[]
  };
  const sc=Array.isArray(src.cu)?src.cu:[], sd=Array.isArray(src.di)?src.di:[];
  for(let i=0;i<cu;i++){
    const o=(sc[i]&&typeof sc[i]==="object")?sc[i]:{};
    out.cu.push({t:dRange(o.t,def.cu[i].t,0.001,2)});
  }
  for(let i=0;i<diCount(cu);i++){
    const o=(sd[i]&&typeof sd[i]==="object")?sd[i]:{};
    const d=def.di[Math.min(i,def.di.length-1)];
    const k=dStr(o.k,16);
    out.di.push({k:DI_KIND[k]?k:d.k,
                 t:dRange(o.t,d.t,0.005,20),
                 er:dRange(o.er,d.er,1,30),
                 df:dRange(o.df,d.df,0,1),
                 mat:dStr(o.mat,40).trim()||d.mat});
  }
  return out;
}
function normClass(c,i){
  const src=(c&&typeof c==="object")?c:{};
  const via=dRange(src.via,0.8,0.2,20);
  return {
    name:dStr(src.name,40).trim()||("Classe "+(i+1)),
    w:dRange(src.w,0.3,0.05,50),
    clr:dRange(src.clr,0.25,0.02,50),
    via:via,
    /* r3 sur la borne seulement : un perçage légitime garde sa précision,
       mais un perçage aberrant ne se replie pas sur 0.15000000000000002 */
    drill:dRange(src.drill,Math.min(0.4,via-0.1),0.05,r3(via-0.05))
  };
}
function normFp(f,i){
  if(!f||typeof f!=="object")return null;
  const style=STYLES[f.style]?f.style:defaultStyle(dInt(f.pins,2,1,4096));
  const g=defaultGeom(style);
  const out={
    id:dInt(f.id,i+1,1,Number.MAX_SAFE_INTEGER),
    ref:dStr(f.ref,32).trim()||("U"+(i+1)),
    value:dStr(f.value,240),
    pkg:dStr(f.pkg,40),
    pins:dInt(f.pins,2,1,4096),
    style:style,
    pitch:dRange(f.pitch,g.pitch,0.05,100),
    span:dRange(f.span,g.span,0.05,1000),
    x:dRange(f.x,0,-COORD,COORD),
    y:dRange(f.y,0,-COORD,COORD),
    rot:FP_ROT_OK[dNum(f.rot,0)]?dNum(f.rot,0):0,
    side:f.side?1:0,
    nets:dNets(f.nets)
  };
  /* décalages du repère et de la valeur : présents seulement si déplacés */
  for(const k of ["refOffX","refOffY","valOffX","valOffY"])
    if(f[k]!=null&&Number.isFinite(+f[k]))out[k]=clamp(+f[k],-COORD,COORD);
  return out;
}
function normTrack(t,cu){
  if(!t||typeof t!=="object")return null;
  const x1=+t.x1,y1=+t.y1,x2=+t.x2,y2=+t.y2;
  if(![x1,y1,x2,y2].every(Number.isFinite))return null;
  if(x1===x2&&y1===y2)return null;                 // segment nul : rien à tracer
  return {l:dInt(t.l,0,0,cu-1),net:dNet(t.net),w:dRange(t.w,0.3,0.01,100),
          x1:clamp(x1,-COORD,COORD),y1:clamp(y1,-COORD,COORD),
          x2:clamp(x2,-COORD,COORD),y2:clamp(y2,-COORD,COORD)};
}
function normVia(v,cu){
  if(!v||typeof v!=="object")return null;
  const x=+v.x,y=+v.y;
  if(!Number.isFinite(x)||!Number.isFinite(y))return null;
  const d=dRange(v.d,0.8,0.1,20);
  let a=dInt(v.a,0,0,cu-1), b=dInt(v.b,cu-1,0,cu-1);
  if(a>b){const s=a;a=b;b=s;}
  if(a===b){a=0;b=cu-1;}                           // un via doit relier deux couches
  return {x:clamp(x,-COORD,COORD),y:clamp(y,-COORD,COORD),
          d:d,drill:dRange(v.drill,Math.min(0.4,d-0.1),0.05,r3(d-0.05)),
          a:a,b:b,net:dNet(v.net)};
}
function normZone(z,cu,i){
  if(!z||typeof z!=="object")return null;
  const pts=dPts(z.pts,3);
  if(!pts)return null;                             // moins de 3 sommets : pas une zone
  const out={id:dInt(z.id,i+1,1,Number.MAX_SAFE_INTEGER),
             l:dInt(z.l,0,0,cu-1),net:dNet(z.net),pts:pts};
  if(z.auto)out.auto=true;
  return out;
}
function normCut(c,cu,i){
  if(!c||typeof c!=="object")return null;
  const pts=dPts(c.pts,3);
  if(!pts)return null;
  return {id:dInt(c.id,i+1,1,Number.MAX_SAFE_INTEGER),
          l:dInt(c.l,0,0,cu-1),pts:pts};
}
/* identifiants uniques : un fichier peut en porter deux fois le même, ce qui
   ferait pointer la sélection et fpById() sur le mauvais objet */
function uniqueIds(list){
  const seen=new Set();
  let max=0;
  for(const o of list){
    while(seen.has(o.id))o.id++;
    seen.add(o.id);
    if(o.id>max)max=o.id;
  }
  return max;
}
function normDoc(d){
  const src=(d&&typeof d==="object")?d:{};
  const cu=dInt(src.cu,2,1,8);
  const out={format:"pcbedit-1",cu:cu};

  /* --- empilage : toujours exactement `cu` couches --- */
  const srcL=Array.isArray(src.cuL)?src.cuL:[];
  out.cuL=[];
  for(let i=0;i<cu;i++)out.cuL.push(normLayer(srcL[i],i,cu));
  out.stack=normStack(src.stack,cu);

  /* --- calques affichés --- */
  const show=(src.show&&typeof src.show==="object")?src.show:{};
  out.show={};
  for(const k in S.show)
    out.show[k]=(show[k]===undefined)?S.show[k]:!!show[k];

  /* --- carte, origine, règles --- */
  const b=(src.board&&typeof src.board==="object")?src.board:{};
  out.board={x:dRange(b.x,0,-COORD,COORD),y:dRange(b.y,0,-COORD,COORD),
             w:dRange(b.w,100,1,COORD),h:dRange(b.h,80,1,COORD),
             pts:dPts(b.pts,3)};
  const o=(src.origin&&typeof src.origin==="object")?src.origin:{};
  out.origin={x:dRange(o.x,0,-COORD,COORD),y:dRange(o.y,0,-COORD,COORD)};
  out.fabOrigin=!!src.fabOrigin;
  const r=(src.rule&&typeof src.rule==="object")?src.rule:{};
  /* `tented` n'avait que deux valeurs : les fichiers qui le portent encore
     deviennent « recouverts » ou « ouverts ». */
  const vf=dStr(r.viaFinish,16);
  out.rule={edge:dRange(r.edge,0.4,0,100),thermal:dRange(r.thermal,0.5,0,100),
            mask:dRange(r.mask,0.05,-100,100),paste:dRange(r.paste,0,-100,100),
            viaFinish:VIA_FINISH[vf]?vf:(r.tented===false?"open":"tented")};
  /* largeurs de la V1.0 : loadDoc() en tire deux classes quand `classes`
     manque, on les laisse donc passer */
  for(const k of ["w","clr","via","drill","wPwr"])
    if(r[k]!=null&&Number.isFinite(+r[k]))out.rule[k]=+r[k];

  /* --- classes de net : absentes = fichier V1.0, loadDoc() les reconstruit --- */
  if(Array.isArray(src.classes)&&src.classes.length){
    const seen=new Set();
    out.classes=[];
    src.classes.forEach((c,i)=>{
      const cl=normClass(c,i);
      let n=cl.name, k=2;
      while(seen.has(n))n=cl.name+" ("+(k++)+")";   // les noms doivent rester distincts
      cl.name=n;seen.add(n);
      out.classes.push(cl);
    });
    const names=new Set(out.classes.map(c=>c.name)), def=out.classes[0].name;
    out.netClass={};
    const nc=(src.netClass&&typeof src.netClass==="object")?src.netClass:{};
    for(const net in nc){
      const name=dStr(nc[net],40);
      // un rattachement orphelin ou vers la classe par défaut ne se stocke pas
      if(names.has(name)&&name!==def)out.netClass[dNet(net)]=name;
    }
  }

  /* --- contenu de la carte --- */
  const arr=v=>Array.isArray(v)?v:[];
  out.fps=arr(src.fps).map(normFp).filter(Boolean);
  out.tracks=arr(src.tracks).map(t=>normTrack(t,cu)).filter(Boolean);
  out.vias=arr(src.vias).map(v=>normVia(v,cu)).filter(Boolean);
  out.zones=arr(src.zones).map((z,i)=>normZone(z,cu,i)).filter(Boolean);
  out.cuts=arr(src.cuts).map((c,i)=>normCut(c,cu,i)).filter(Boolean);
  if(cu<2)out.vias=[];                    // une seule couche : aucun via ne relie rien

  const maxId=Math.max(uniqueIds(out.fps),uniqueIds(out.zones),uniqueIds(out.cuts));
  out.active=dInt(src.active,0,0,cu-1);
  out.nextId=Math.max(dInt(src.nextId,1,1,Number.MAX_SAFE_INTEGER),maxId+1);
  return out;
}

function loadDoc(d,keepView){
  d=normDoc(d);                     // au-delà d'ici, chaque champ est exploitable
  S.cu=d.cu;
  S.cuL=d.cuL;
  S.stack=d.stack;
  S.show=d.show;
  S.board=d.board;
  S.origin=d.origin;
  S.fabOrigin=d.fabOrigin;
  const r=d.rule;
  S.rule={edge:r.edge, thermal:r.thermal, mask:r.mask, paste:r.paste,
          viaFinish:r.viaFinish};
  if(d.classes){
    S.classes=d.classes;S.netClass=d.netClass;
  }else{
    /* fichiers antérieurs aux classes : les deux largeurs deviennent deux
       classes, et les nets d'alimentation sont rattachés comme avant */
    S.classes=[{name:"Défaut",w:r.w||0.3,clr:r.clr||0.25,via:r.via||0.8,drill:r.drill||0.4},
               {name:"Alimentation",w:r.wPwr||0.6,clr:r.clr||0.25,
                via:r.via||0.8,drill:r.drill||0.4}];
    S.netClass={};
  }
  S.fps=d.fps;S.tracks=d.tracks;S.vias=d.vias;
  S.zones=d.zones;S.cuts=d.cuts;
  S.active=d.active;S.pair=[0,S.cu-1];
  S.nextId=d.nextId;
  /* Fichiers de la V1.0 : le rôle « plan » portait sur la couche entière, sans
     zone correspondante. On le convertit en zone rectangulaire, modifiable
     ensuite. Depuis, le rôle et sa zone auto coexistent — et loadDoc() sert
     aussi à annuler/rétablir : sans ce garde-fou, chaque Ctrl+Z dupliquait la
     zone et effaçait le rôle. */
  S.cuL.forEach((L,i)=>{
    if(!L.plane)return;
    if(S.zones.some(z=>z.auto&&z.l===i))return;      // rien à migrer
    S.zones.push({id:S.nextId++,l:i,net:L.net||"",pts:boardZonePts()});
    L.plane=false;L.net="";L.role="mixed";   // le cuivre reste, le rôle le dit
  });
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
    if(e&&(e.ctrlKey||e.shiftKey||e.metaKey||e.altKey)&&inPoly(x,y,z.pts))return {zone:z};
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
/* Ctrl+clic (ou Maj+clic) sur un élément : il entre dans la sélection, ou il en
   sort. Renvoie vrai s'il vient d'en sortir — l'appelant n'enchaîne alors pas
   sur un glissement, qui déplacerait tout le reste. */
function toggleHit(h){
  if(!h)return false;
  const t=(set,v)=>{if(set.has(v)){set.delete(v);return true;}set.add(v);return false;};
  if(h.fp)return t(S.sel.fps,h.fp.id);
  if(h.track)return t(S.sel.tracks,h.track);
  if(h.via)return t(S.sel.vias,h.via);
  if(h.zone)return t(S.sel.zones,h.zone);
  if(h.cut)return t(S.sel.cuts,h.cut);
  if(h.edge){S.sel.edge=!S.sel.edge;return !S.sel.edge;}
  return false;
}
/* Points où Alt a un sens : extrémité ou corps d'une piste déjà sélectionnée,
   arête d'une zone ou du contour sélectionnés. Ailleurs, Alt déplace la vue —
   c'est ce qui permet de garder les deux usages sans se gêner. */
function altTarget(x,y){
  if(S.mode!=="select")return false;
  for(const t of S.sel.tracks){
    for(const en of [1,2]){
      const ex=en===1?t.x1:t.x2, ey=en===1?t.y1:t.y2;
      if(dist(x,y,ex,ey)<=px(6))return true;
    }
    if(segDist(x,y,t.x1,t.y1,t.x2,t.y2)<=t.w/2+px(4))return true;
  }
  if(S.sel.edge&&S.board.pts&&polyEdgeDist(x,y,S.board.pts)<=px(6))return true;
  for(const z of S.sel.zones)
    if(polyEdgeDist(x,y,z.pts)<=px(6))return true;
  return false;
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
/* ==========================================================================
   Presse-papier
   Ce qui est sélectionné — empreintes, pistes, vias, zones, découpes — est
   rangé relativement à son coin haut-gauche, puis reposé sous le pointeur. La
   copie est doublée dans le stockage local : on peut coller après avoir rouvert
   l'éditeur. Ce qui en ressort repasse par les mêmes normalisations que la
   lecture d'un fichier — un presse-papier d'une autre version, ou trafiqué,
   n'est pas cru sur parole.

   Les nets des pastilles, des pistes et des vias sont conservés : dupliquer un
   condensateur de découplage avec son routage n'aurait pas de sens si la copie
   se retrouvait en l'air. Les repères, eux, sont refaits pour rester uniques.
   ========================================================================== */
const PCB_CLIP_KEY="pcbedit.clipboard";
let PCB_CLIP=null;
function pcbClipContent(){
  if(!selCount())return null;
  const fps=S.fps.filter(f=>S.sel.fps.has(f.id));
  const tracks=S.tracks.filter(t=>S.sel.tracks.has(t));
  const vias=S.vias.filter(v=>S.sel.vias.has(v));
  const zones=S.zones.filter(z=>S.sel.zones.has(z));
  const cuts=S.cuts.filter(c=>S.sel.cuts.has(c));
  let x=1e9,y=1e9;
  for(const f of fps){x=Math.min(x,f.x);y=Math.min(y,f.y);}
  for(const t of tracks){x=Math.min(x,t.x1,t.x2);y=Math.min(y,t.y1,t.y2);}
  for(const v of vias){x=Math.min(x,v.x);y=Math.min(y,v.y);}
  for(const z of zones.concat(cuts))
    for(const q of z.pts){x=Math.min(x,q.x);y=Math.min(y,q.y);}
  if(x>1e8)return null;
  const cp=o=>JSON.parse(JSON.stringify(o));
  const poly=o=>{
    const c=cp(o);
    c.pts=c.pts.map(q=>({x:r3(q.x-x),y:r3(q.y-y)}));
    delete c.id;delete c.auto;      // une copie est un tracé à la main
    return c;
  };
  return {
    fps:fps.map(f=>{const c=cp(f);c.x=r3(c.x-x);c.y=r3(c.y-y);delete c.id;return c;}),
    tracks:tracks.map(t=>{const c=cp(t);
      c.x1=r3(c.x1-x);c.y1=r3(c.y1-y);c.x2=r3(c.x2-x);c.y2=r3(c.y2-y);return c;}),
    vias:vias.map(v=>{const c=cp(v);c.x=r3(c.x-x);c.y=r3(c.y-y);return c;}),
    zones:zones.map(poly), cuts:cuts.map(poly)
  };
}
function pcbSetClip(c){
  PCB_CLIP=c;
  try{localStorage.setItem(PCB_CLIP_KEY,JSON.stringify(c));}catch(_){/* quota, mode privé */}
}
function pcbGetClip(){
  if(PCB_CLIP)return PCB_CLIP;
  try{
    const raw=localStorage.getItem(PCB_CLIP_KEY);
    if(raw)PCB_CLIP=JSON.parse(raw);
  }catch(_){PCB_CLIP=null;}
  return PCB_CLIP;
}
// « R12 » → « R13 », « R14 »… le premier libre ; un repère sans chiffre reçoit
// un numéro
function freeFpRef(ref,used){
  const m=/^(.*?)(\d*)$/.exec(String(ref||"U"));
  const base=m[1]||"U";
  let n=m[2]?parseInt(m[2],10):1;
  let r=base+n;
  while(used.has(r))r=base+(++n);
  return r;
}
function copySelPcb(){
  const c=pcbClipContent();
  if(!c){hint("Rien à copier : sélectionnez d'abord des éléments (Ctrl+clic pour en ajouter).");return false;}
  pcbSetClip(c);
  hint(c.fps.length+" empreinte(s), "+c.tracks.length+" piste(s), "+c.vias.length+
       " via(s) copiés — Ctrl+V colle sous le pointeur.");
  return true;
}
function cutSelPcb(){if(copySelPcb())deleteSel();}
function pasteClipPcb(){
  const c=pcbGetClip();
  if(!c||typeof c!=="object"){hint("Presse-papier vide : copiez d'abord une sélection (Ctrl+C).");return;}
  const arr=v=>Array.isArray(v)?v:[];
  if(!arr(c.fps).length&&!arr(c.tracks).length&&!arr(c.vias).length&&
     !arr(c.zones).length&&!arr(c.cuts).length){hint("Presse-papier vide.");return;}
  const bx=snapX(S.mouse.x), by=snapY(S.mouse.y);
  push();
  clearSel();
  let dropped=0;
  const used=new Set(S.fps.map(f=>f.ref));
  for(const src of arr(c.fps)){
    const f=normFp(src,0);
    if(!f){dropped++;continue;}
    f.id=S.nextId++;
    f.x=r3(f.x+bx);f.y=r3(f.y+by);
    f.ref=freeFpRef(f.ref,used);used.add(f.ref);
    S.fps.push(f);S.sel.fps.add(f.id);
  }
  for(const src of arr(c.tracks)){
    const t=normTrack(src,S.cu);
    if(!t){dropped++;continue;}
    t.x1=r3(t.x1+bx);t.y1=r3(t.y1+by);t.x2=r3(t.x2+bx);t.y2=r3(t.y2+by);
    S.tracks.push(t);S.sel.tracks.add(t);
  }
  for(const src of arr(c.vias)){
    const v=normVia(src,S.cu);
    if(!v){dropped++;continue;}
    v.x=r3(v.x+bx);v.y=r3(v.y+by);
    S.vias.push(v);S.sel.vias.add(v);
  }
  for(const src of arr(c.zones)){
    const z=normZone(src,S.cu,0);
    if(!z){dropped++;continue;}
    z.id=S.nextId++;
    z.pts=z.pts.map(q=>({x:r3(q.x+bx),y:r3(q.y+by)}));
    S.zones.push(z);S.sel.zones.add(z);
  }
  for(const src of arr(c.cuts)){
    const ct=normCut(src,S.cu,0);
    if(!ct){dropped++;continue;}
    ct.id=S.nextId++;
    ct.pts=ct.pts.map(q=>({x:r3(q.x+bx),y:r3(q.y+by)}));
    S.cuts.push(ct);S.sel.cuts.add(ct);
  }
  zoneCache.clear();
  touch();refreshPanels();draw();
  hint(S.sel.fps.size+" empreinte(s), "+S.sel.tracks.size+" piste(s), "+
       S.sel.vias.size+" via(s) collés."+(dropped?" "+dropped+" élément(s) ignoré(s).":""));
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
    // fullBoardZone() n'a pas d'esquisse : le plan se pose sur la couche active
    const z = {id:S.nextId++, l:Z?Z.l:S.active, net:val,
               pts: isFullBoard ? boardZonePts() : Z.pts.map(p=>({x:r3(p.x),y:r3(p.y)}))};
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
  // la capture échoue si le pointeur n'est plus actif : ce n'est pas une raison
  // pour abandonner le clic
  try{cv.setPointerCapture(e.pointerId);}catch(_){}
  const p=evPos(e);
  if(e.button===1||(e.button===0&&e.altKey&&!altTarget(p.x,p.y))){
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
        // Alt : on détache cette extrémité au lieu d'emmener tout le coude
        const g=e.altKey?{ends:[{t,e:en}],vias:[]}:jointAt(ex,ey,t.l);
        drag={tend:g,l:t.l,moved:false};
        return;
      }
    }
  }
  if(e.altKey)                       // Alt+clic sur une piste : on y insère un point
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
    if(e.altKey&&polyEdgeDist(p.x,p.y,P)<=px(6)){
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
    if(e.altKey&&polyEdgeDist(p.x,p.y,z.pts)<=px(6)){
      // Alt+clic sur une arête : on y insère un sommet, prêt à être tiré
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
  // Ctrl et Maj font la même chose : ajouter à la sélection, ou en retirer
  const add=e.shiftKey||e.ctrlKey||e.metaKey;
  if(h && h.fpText) {
    if(!add) {clearSel();S.hlNet=null;}
    S.hlText = h;
    drag={moveText:h, x:snapX(p.x), y:snapY(p.y), moved:false};
    refreshPanels();draw();return;
  }
  if(!h){
    if(!add){clearSel();S.hlNet=null;}
    S.marquee={x1:p.x,y1:p.y,x2:p.x,y2:p.y};
    drag={marquee:true,add:add};
    refreshPanels();draw();return;
  }
  if(add){
    if(toggleHit(h)){refreshPanels();draw();return;}   // retiré : pas de glissement
  }else{
    const already=(h.fp&&S.sel.fps.has(h.fp.id))||(h.track&&S.sel.tracks.has(h.track))||
                  (h.via&&S.sel.vias.has(h.via));
    if(!already)selectHit(h,false);
  }
  const pn=(h.pad&&h.pad.net)||null;
  if(pn)S.hlNet=pn;
  drag={move:true,x:p.x,y:p.y,moved:false};
  refreshPanels();
  // la mise en avant se voit sur le canevas : on la montre aussi dans la liste
  if(pn)revealNet(pn);
  draw();
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
/* Un champ de saisie garde ses lettres pour lui. On regarde la cible de
   l'événement ET le champ qui a réellement le focus : les deux peuvent
   diverger selon la façon dont la frappe arrive. */
function isField(n){
  const tag=(n&&n.tagName||"").toLowerCase();
  return tag==="input"||tag==="textarea"||tag==="select"||!!(n&&n.isContentEditable);
}
document.addEventListener("keydown",e=>{
  if(isField(e.target)||isField(document.activeElement))return;
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
  // Ctrl+C sur du texte sélectionné appartient au navigateur : on ne lui prend
  // le raccourci que lorsqu'il n'y a rien à copier à l'écran
  if((e.ctrlKey||e.metaKey)&&k==="c"){
    const sel=window.getSelection&&window.getSelection();
    if(sel&&!sel.isCollapsed)return;
    e.preventDefault();copySelPcb();return;
  }
  if((e.ctrlKey||e.metaKey)&&k==="x"){e.preventDefault();cutSelPcb();return;}
  if((e.ctrlKey||e.metaKey)&&k==="v"){e.preventDefault();pasteClipPcb();return;}
  /* Toute autre combinaison avec Ctrl/Cmd ou Alt appartient au navigateur :
     sans ce garde-fou, Ctrl+R faisait pivoter la sélection puis rechargeait la
     page, et Ctrl+F la retournait avant d'ouvrir la recherche. */
  if(e.ctrlKey||e.metaKey||e.altKey)return;
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
  if(m!=="zone")zoneMenuClose();
  for(const [id,md] of [["mSelect","select"],["mTrack","track"],["mVia","via"],
                        ["mZone","zone"],["mEdge","edge"],["mOrigin","origin"],
                        ["mErase","erase"]])
    $(id).classList.toggle("on",m===md);
  $("fMode").textContent={select:"Sélection",track:"Piste",via:"Via",
                          zone:"Zone de cuivre",edge:"Contour de carte",
                          origin:"Origine",erase:"Gomme"}[m];
  cv.style.cursor=m==="erase"?"not-allowed":"crosshair";
  hint({
    select:"Ctrl+clic (ou Maj+clic) ajoute à la sélection · glisser pour déplacer · "+
           "R pivote · F retourne · Ctrl+C/Ctrl+V copie-colle · Alt+clic insère un point sur une piste sélectionnée.",
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
/* Pas d'accrochage : une seule porte d'entrée pour le menu de la barre
   d'outils, celui du panneau Règles et le pied de page. */
/* Des millimètres ronds d'abord, plus les deux pas impériaux dont on ne peut
   pas se passer : 1,27 et 2,54 mm (0,05 et 0,1 pouce), l'écartement des
   broches de la plupart des boîtiers traversants. */
const GRID_STEPS=[0.05,0.1,0.25,0.5,1,1.27,2,2.54,5];
function setGridStep(v){
  const g=parseFloat(v);
  if(!Number.isFinite(g)||g<=0||g===S.grid)return;
  S.grid=g;
  updateGridInfo();
  hint("Grille d'accrochage : "+String(r3(g)).replace(".",",")+" mm.");
  draw();
}
function buildGridMenu(){
  const sel=$("selGrid");
  if(!sel)return;
  sel.innerHTML=GRID_STEPS.map(g=>
    '<option value="'+g+'"'+(g===S.grid?" selected":"")+'>Grille '+
    String(g).replace(".",",")+' mm</option>').join("");
}
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

