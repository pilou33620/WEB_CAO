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
          classes:S.classes,netClass:S.netClass,
          dpPairs:S.dpPairs,dpRules:S.dpRules,
          origin:S.origin,fabOrigin:S.fabOrigin,
          fps:S.fps,tracks:S.tracks,vias:S.vias,zones:S.zones,cuts:S.cuts,
          drawings:S.drawings||[],
          active:S.active,nextId:S.nextId};
}
function serialize(){return JSON.stringify(docObj());}
function push(){pushSnap(null);}
/* Un instantané choisi plutôt que l'instant présent. Le tracé s'en sert : le
   shove écarte du cuivre dès le premier clic, bien avant le dépôt, si bien que
   l'état à retenir pour un Ctrl+Z est celui d'AVANT le geste — pas celui d'un
   tracé à moitié fait, cuivre déjà poussé et pistes pas encore posées. */
function pushSnap(snap){
  S.undo.push(snap||serialize());
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
/* La matrice des natures de cuivre. Seules les cases que le modèle connaît
   survivent : une clé inventée n'entrerait nulle part dans le contrôle, mais
   elle traverserait l'aller-retour du document et fausserait la comparaison du
   banc d'essai. Une case à zéro ne se stocke pas — c'est l'état d'usine. */
function dMat(v){
  const src=(v&&typeof v==="object")?v:{};
  const out={};
  for(const a of DRC_ORDER)
    for(const b of DRC_ORDER){
      if(a==="hole"||b==="hole"||!matHas(a,b))continue;   // trou/trou vit dans `hole`
      const k=matKey(a,b);
      if(out[k]!==undefined)continue;
      const n=+src[k];
      if(Number.isFinite(n)&&n>0)out[k]=clamp(n,0,100);
    }
  return out;
}
const FP_ROT_OK={0:1,45:1,90:1,135:1,180:1,225:1,270:1,315:1};
/* Pastilles posées à la main. Une pastille sans centre exploitable est
   écartée ; si rien ne reste, l'empreinte redevient paramétrique — mieux vaut
   une empreinte calculée qu'une empreinte sans cuivre. Le champ produit est
   exactement celui de padClone(), sans quoi l'aller-retour d'un document ne
   serait plus neutre. */
function dPads(a){
  if(!Array.isArray(a))return null;
  const out=[];
  for(const q of a){
    if(!q||typeof q!=="object")continue;
    const x=+q.x, y=+q.y;
    if(!Number.isFinite(x)||!Number.isFinite(y))continue;
    out.push({n:dInt(q.n,out.length+1,1,4096),
              x:clamp(r4(x),-COORD,COORD), y:clamp(r4(y),-COORD,COORD),
              w:r4(dRange(q.w,1,0.05,200)), h:r4(dRange(q.h,1,0.05,200)),
              shape:padShape(q.shape), drill:r4(dRange(q.drill,0,0,200)),
              rot:padRot(q.rot)});
  }
  if(!out.length)return null;
  for(const q of out){
    const lim=r4(Math.min(q.w,q.h)-0.05);
    if(q.drill>0&&q.drill>lim)q.drill=Math.max(0.05,lim);
  }
  return out;
}
/* rectangle de sérigraphie imposé : quatre nombres, ordonnés, non dégénéré */
function dBody(b){
  if(!b||typeof b!=="object")return null;
  const v=[+b.x1,+b.y1,+b.x2,+b.y2];
  if(!v.every(Number.isFinite))return null;
  const o={x1:clamp(r4(Math.min(v[0],v[2])),-COORD,COORD),
           y1:clamp(r4(Math.min(v[1],v[3])),-COORD,COORD),
           x2:clamp(r4(Math.max(v[0],v[2])),-COORD,COORD),
           y2:clamp(r4(Math.max(v[1],v[3])),-COORD,COORD)};
  if(o.x2-o.x1<0.1)o.x2=r4(o.x1+0.1);
  if(o.y2-o.y1<0.1)o.y2=r4(o.y1+0.1);
  return o;
}
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
/* ---------- paires différentielles et leurs règles ----------
   Une paire ne vaut que par ses deux nets : sans eux, ou s'ils sont les mêmes,
   l'enregistrement ne décrit rien et part à la poubelle. La règle, elle, se
   borne comme une classe de net — et son identifiant se recopie tel quel :
   c'est une étiquette, pas une valeur à recalculer. */
function normDpPair(d,i){
  if(!d||typeof d!=="object")return null;
  const p=dNet(d.p), n=dNet(d.n);
  if(!p||!n||p===n)return null;
  return {id:dInt(d.id,i+1,1,Number.MAX_SAFE_INTEGER),
          name:dStr(d.name,40).trim()||("PAIRE"+(i+1)),
          p:p,n:n};
}
function normDpRule(d,i,cu){
  const src=(d&&typeof d==="object")?d:{};
  const F=DP_FALLBACK;
  const num=(v,def)=>dRange(v,def,0.01,100);
  const out={
    name:dStr(src.name,40).trim()||("PairesDiff_"+(i+1)),
    comment:dStr(src.comment,120),
    uid:dStr(src.uid,16).replace(/[^A-Za-z0-9]/g,""),
    scope:dStr(src.scope,40).trim(),
    allLayers:src.allLayers===undefined?true:!!src.allLayers,
    minW:num(src.minW,F.minW), prefW:num(src.prefW,F.prefW),
    maxW:num(src.maxW,F.maxW),
    minGap:num(src.minGap,F.minGap), prefGap:num(src.prefGap,F.prefGap),
    maxGap:num(src.maxGap,F.maxGap),
    maxUncoupled:dRange(src.maxUncoupled,F.maxUncoupled,0,1e4),
    useImp:!!src.useImp,
    imp:dpProfile(dStr(src.imp,8))?dStr(src.imp,8):"",
    layers:{}
  };
  /* Les retouches couche par couche : seules celles qui visent une couche
     existante et qui portent au moins une valeur exploitable sont gardées. */
  const L=(src.layers&&typeof src.layers==="object")?src.layers:{};
  for(const k in L){
    const i2=Math.round(+k);
    if(!Number.isFinite(i2)||i2<0||i2>=cu)continue;
    const o=(L[k]&&typeof L[k]==="object")?L[k]:{};
    const row={};
    for(const key of DP_KEYS)
      if(Number.isFinite(+o[key]))row[key]=num(o[key],out[key]);
    if(Object.keys(row).length)out.layers[i2]=row;
  }
  return out;
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
  /* empreinte dessinée à la main : la liste de pastilles l'emporte sur les
     cotes, et le brochage se relit dessus — un fichier retouché qui annonce
     deux broches pour huit pastilles ne doit pas perdre six nets */
  const pads=dPads(f.pads);
  if(pads){
    out.pads=pads;
    let m=1;
    for(const q of pads)m=Math.max(m,q.n);
    out.pins=clamp(m,1,4096);
  }
  const body=dBody(f.body);
  if(body)out.body=body;
  /* Repère de broche 1 : `false` veut dire « retiré à la main », et c'est une
     décision qu'un document doit garder — sans quoi la règle automatique la
     déferait à la lecture. Tout le reste qu'un fichier pourrait porter là est
     ramené à un point exploitable, ou écarté. */
  if(f.mark===false)out.mark=false;
  else if(f.mark&&typeof f.mark==="object"){
    const mx=+f.mark.x, my=+f.mark.y;
    if(Number.isFinite(mx)&&Number.isFinite(my))
      out.mark={x:clamp(r4(mx),-COORD,COORD), y:clamp(r4(my),-COORD,COORD),
                d:dRange(f.mark.d,MARK_D,0.1,10)};
  }
  return out;
}
function normTrack(t,cu){
  if(!t||typeof t!=="object")return null;
  const x1=+t.x1,y1=+t.y1,x2=+t.x2,y2=+t.y2;
  if(![x1,y1,x2,y2].every(Number.isFinite))return null;
  if(x1===x2&&y1===y2)return null;                 // segment nul : rien à tracer
  const out={l:dInt(t.l,0,0,cu-1),net:dNet(t.net),w:dRange(t.w,0.3,0.01,100),
             x1:clamp(x1,-COORD,COORD),y1:clamp(y1,-COORD,COORD),
             x2:clamp(x2,-COORD,COORD),y2:clamp(y2,-COORD,COORD)};
  /* Piste circulaire : l'angle balayé s'ajoute aux deux bouts, et rien de
     plus. Une piste droite n'écrit pas la clé — un document sans arc doit
     ressortir au caractère près comme avant, et le banc d'essai le vérifie.
     L'angle est borné juste en deçà du tour complet : au-delà, les deux bouts
     se rejoindraient et il n'y aurait plus de corde d'où déduire le centre. */
  const ca=+t.ca;
  if(Number.isFinite(ca)&&Math.abs(ca)>ARC_MIN)
    out.ca=r4(clamp(ca,-ARC_MAX,ARC_MAX));
  return out;
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
function normDrawingPcb(d,i){
  if(!d||typeof d!=="object")return null;
  const shape=(d.shape==="rect"||d.type==="rect")?"rect":"line";
  const layer=d.layer==="silkB"?"silkB":"silkT";
  const x1=dRange(d.x1,0,-COORD,COORD);
  const y1=dRange(d.y1,0,-COORD,COORD);
  const x2=dRange(d.x2,0,-COORD,COORD);
  const y2=dRange(d.y2,0,-COORD,COORD);
  if(Math.hypot(x2-x1,y2-y1)<1e-6)return null;
  if(shape==="rect"&&(Math.abs(x2-x1)<1e-4||Math.abs(y2-y1)<1e-4))return null;
  const width=dRange(d.width,0.15,0.05,10);
  return {
    id:dInt(d.id,i+1,1,Number.MAX_SAFE_INTEGER),
    shape:shape,
    type:shape,
    layer:layer,
    x1:r4(x1),y1:r4(y1),
    x2:r4(x2),y2:r4(y2),
    width:r4(width)
  };
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
  // l'angle des pistes : liste fermée, 45° pour tout ce qui n'en dit rien —
  // les fichiers antérieurs à ce réglage ont été tracés ainsi
  const cm=dStr(r.corner,8);
  // idem pour la conduite face à un obstacle : les fichiers muets se poussent
  const rm=dStr(r.route,8);
  out.rule={edge:dRange(r.edge,0.4,0,100),thermal:dRange(r.thermal,0.5,0,100),
            mask:dRange(r.mask,0.05,-100,100),paste:dRange(r.paste,0,-100,100),
            viaFinish:VIA_FINISH[vf]?vf:(r.tented===false?"open":"tented"),
            corner:CORNER_MODES[cm]?cm:"45",
            route:ROUTE_MODES[rm]?rm:"shove",
            /* le trou à trou n'existait pas : les fichiers muets prennent le
               minimum de fabrication courant, qu'ils respectaient déjà */
            hole:dRange(r.hole,0.25,0,100),
            /* la matrice des natures : absente des fichiers antérieurs, et
               vide d'usine — dans les deux cas la classe de net décide seule,
               exactement comme avant qu'elle existe */
            mat:dMat(r.mat),
            /* le court-circuit toléré et les deux seuils de rapport d'aspect :
               absents des fichiers antérieurs, qui prenaient donc les valeurs
               d'usine — celles qu'ils appliquaient déjà */
            short:!!r.short,
            aspWarn:dRange(r.aspWarn,ASPECT_WARN,1,100),
            aspMax:dRange(r.aspMax,ASPECT_MAX,1,100)};
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

  /* --- paires différentielles ---
     Une paire dont un net a disparu de la carte n'est pas effacée pour autant :
     réimporter une netlist retouchée ne doit pas défaire des règles écrites à
     la main. C'est le panneau qui signale la paire orpheline, pas le lecteur. */
  {
    const seen=new Set();
    out.dpPairs=[];
    (Array.isArray(src.dpPairs)?src.dpPairs:[]).forEach((d,i)=>{
      const q=normDpPair(d,i);
      if(!q)return;
      let nm=q.name, k=2;
      while(seen.has(nm))nm=q.name+" ("+(k++)+")";
      q.name=nm;seen.add(nm);
      out.dpPairs.push(q);
    });
    const names=new Set(out.dpPairs.map(q=>q.name));
    out.dpRules=(Array.isArray(src.dpRules)?src.dpRules:[]).map((d,i)=>normDpRule(d,i,cu));
    // une règle qui vise une paire disparue ne vise plus rien : elle redevient générale
    for(const r of out.dpRules)if(r.scope&&!names.has(r.scope))r.scope="";
  }

  /* --- contenu de la carte --- */
  const arr=v=>Array.isArray(v)?v:[];
  out.fps=arr(src.fps).map(normFp).filter(Boolean);
  out.tracks=arr(src.tracks).map(t=>normTrack(t,cu)).filter(Boolean);
  out.vias=arr(src.vias).map(v=>normVia(v,cu)).filter(Boolean);
  out.zones=arr(src.zones).map((z,i)=>normZone(z,cu,i)).filter(Boolean);
  out.cuts=arr(src.cuts).map((c,i)=>normCut(c,cu,i)).filter(Boolean);
  out.drawings=arr(src.drawings).map((d,i)=>normDrawingPcb(d,i)).filter(Boolean);
  if(cu<2)out.vias=[];                    // une seule couche : aucun via ne relie rien

  const maxId=Math.max(uniqueIds(out.fps),uniqueIds(out.zones),uniqueIds(out.cuts),
                       uniqueIds(out.dpPairs),uniqueIds(out.drawings));
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
          viaFinish:r.viaFinish, corner:r.corner, route:r.route, hole:r.hole,
          mat:r.mat, short:r.short, aspWarn:r.aspWarn, aspMax:r.aspMax};
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
  S.dpPairs=d.dpPairs;S.dpRules=d.dpRules;
  S.fps=d.fps;S.tracks=d.tracks;S.vias=d.vias;
  S.zones=d.zones;S.cuts=d.cuts;S.drawings=d.drawings||[];
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
  clearSel();S.route=null;S.dp=null;S.zoneDraft=null;S.edgeDraft=null;S.drc=[];S.hlNet=null;
  zoneCache.clear();touch();
  if(!d.classes)autoClass();
  $("cuCount").value=String(S.cu);
  buildLayers();buildTabs();
  /* La fenêtre des règles est dans un fichier chargé APRÈS celui de l'amorçage,
     et loadDoc() tourne dès le démarrage : c'est ainsi que revient la carte
     laissée dans l'onglet. L'appel doit donc survivre à une fenêtre qui
     n'existe pas encore — sans cette garde, la reprise échouait à tous les
     coups et la session était effacée. Fermée, reSync() ne fait rien de toute
     façon : la garde ne change rien à l'usage courant. */
  if(typeof reSync==="function")reSync();
  refreshPanels();
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
  S.sel.zones.clear();S.sel.cuts.clear();if(S.sel.drawings)S.sel.drawings.clear();S.sel.edge=false;}
function selCount(){return S.sel.fps.size+S.sel.tracks.size+S.sel.vias.size+S.sel.zones.size+S.sel.cuts.size+(S.sel.drawings?S.sel.drawings.size:0);}
function selDrawingsPcb(){return (S.drawings||[]).filter(d=>S.sel.drawings&&S.sel.drawings.has(d.id));}
function hitTest(x,y,e){
  const tol=px(3);
  for(const v of S.vias)
    if(layerAlpha(v.a)>0&&dist(x,y,v.x,v.y)<=v.d/2+tol)return {via:v};
  for(const t of S.tracks)
    if(t.l===S.active&&trkDist(x,y,t)<=t.w/2+tol)return {track:t};
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
    if(layerAlpha(t.l)>0&&trkDist(x,y,t)<=t.w/2+tol)return {track:t};
  /* traits de sérigraphie */
  if(S.drawings){
    for(let i=S.drawings.length-1;i>=0;i--){
      const d=S.drawings[i];
      if(d.layer==="silkT"&&!S.show.silkT)continue;
      if(d.layer==="silkB"&&!S.show.silkB)continue;
      const tol=Math.max(d.width/2,px(3.5));
      if(d.shape==="rect"){
        if(segDist(x,y,d.x1,d.y1,d.x2,d.y1)<=tol||
           segDist(x,y,d.x2,d.y1,d.x2,d.y2)<=tol||
           segDist(x,y,d.x2,d.y2,d.x1,d.y2)<=tol||
           segDist(x,y,d.x1,d.y2,d.x1,d.y1)<=tol) return {drawing:d};
      }else{
        if(segDist(x,y,d.x1,d.y1,d.x2,d.y2)<=tol)return {drawing:d};
      }
    }
  }
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
  /* Dernier recours : le plein d'une zone. Un plan de masse ou d'alimentation
     couvre toute la carte — son contour se confond avec celui de la carte et
     n'offre rien à viser. On le rend donc attrapable par son intérieur, mais
     seulement une fois tout le reste écarté, et marqué `inside` : l'appelant
     attend le relâchement pour trancher, sinon le moindre lasso tiré au-dessus
     d'un plan commencerait par emporter le plan. */
  if(S.show.plane){
    const zi=zoneUnder(x,y);
    if(zi)return {zone:zi,inside:true};
  }
  return null;
}
/* Zone visible dont le plein contient le point. La couche active passe devant
   les autres — c'est celle sur laquelle on travaille — et une découpe rend son
   creux au reste : là il n'y a pas de cuivre, donc rien à prendre. */
function zoneUnder(x,y){
  let best=null;
  for(let i=S.zones.length-1;i>=0;i--){
    const z=S.zones[i];
    if(layerAlpha(z.l)<=0||z.pts.length<3)continue;
    if(!inPoly(x,y,z.pts))continue;
    if(S.cuts.some(c=>c.l===z.l&&c.pts.length>2&&inPoly(x,y,c.pts)))continue;
    if(z.l===S.active)return z;
    if(!best)best=z;
  }
  return best;
}
/* Tout le cuivre plein d'une couche, pris d'un coup : c'est la poignée du plan
   de masse ou d'alimentation, qui n'a pas de bord commode à viser. */
function selectLayerZones(i){
  const zs=S.zones.filter(z=>z.l===i);
  if(!zs.length){hint("Aucune zone de cuivre sur "+cuId(i,S.cu)+".");return;}
  if(S.cuL[i]&&!S.cuL[i].vis)S.cuL[i].vis=true;   // sélectionner ce qu'on ne voit pas n'apprend rien
  clearSel();
  for(const z of zs)S.sel.zones.add(z);
  S.active=i;
  buildLayers();refreshPanels();draw();
  hint(zs.length===1
    ? "Zone de "+cuId(i,S.cu)+" sélectionnée"+(zs[0].net?" — net "+zs[0].net:"")+"."
    : zs.length+" zones de "+cuId(i,S.cu)+" sélectionnées.");
}
function selectHit(h,add){
  if(!add)clearSel();
  if(!h)return;
  if(h.fp)S.sel.fps.add(h.fp.id);
  else if(h.track)S.sel.tracks.add(h.track);
  else if(h.via)S.sel.vias.add(h.via);
  else if(h.zone)S.sel.zones.add(h.zone);
  else if(h.cut)S.sel.cuts.add(h.cut);
  else if(h.drawing){if(!S.sel.drawings)S.sel.drawings=new Set();S.sel.drawings.add(h.drawing.id);}
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
  if(h.drawing){if(!S.sel.drawings)S.sel.drawings=new Set();return t(S.sel.drawings,h.drawing.id);}
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
  if(S.sel.drawings)
    for(const d of selDrawingsPcb()){
      for(const en of [1,2]){
        const ex=en===1?d.x1:d.x2, ey=en===1?d.y1:d.y2;
        if(dist(x,y,ex,ey)<=px(6))return true;
      }
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
/* ==========================================================================
   Déplacer une piste : les articulations
   --------------------------------------------------------------------------
   Une piste est une suite de segments. En tirer un ne doit ni décrocher ses
   voisins, ni leur imposer un angle quelconque. On raisonne donc par
   articulations : les points où ce qui bouge touche ce qui reste. Chacune sait
   ce qui y est rattaché — extrémités, via — et comment elle doit suivre.
   ========================================================================== */
const EPS_J=0.002;
function viaAt(l,x,y){
  for(const v of S.vias)
    if(l>=v.a&&l<=v.b&&Math.abs(v.x-x)<EPS_J&&Math.abs(v.y-y)<EPS_J)return v;
  return null;
}
function padAt(l,x,y){
  for(const fp of S.fps)
    for(const q of padsWorld(fp)){
      if(!padLayers(fp,q).includes(l))continue;
      if(padDist(x,y,q)<=0)return q;
    }
  return null;
}
/* Clé d'un point de raccordement. Un via relie ses couches : les extrémités
   qu'il réunit partagent la même clé, sinon un changement de couche se
   déchirerait au premier glissement. */
function anchorKey(l,x,y){
  const v=viaAt(l,x,y);
  return v?"V|"+r3(v.x)+"|"+r3(v.y):l+"|"+r3(x)+"|"+r3(y);
}
/* Direction d'un segment vue depuis l'extrémité `e`, et son autre bout. La
   direction ne change pas pendant un glissement : c'est elle qui conserve les
   angles. */
function endDir(t,e){
  return e===1?{x:t.x1-t.x2,y:t.y1-t.y2}:{x:t.x2-t.x1,y:t.y2-t.y1};
}
function endFar(t,e){return e===1?{x:t.x2,y:t.y2}:{x:t.x1,y:t.y1};}
/* Axes à conserver pendant qu'on tire une articulation : ceux des points d'en
   face. Un segment tiré depuis le centre d'une pastille hors grille resterait
   sinon légèrement de biais — vertical à l'œil, mais dérivant d'une largeur de
   piste sur sa longueur. On retient l'axe le plus proche de la case visée :
   tirer le coude sous une pastille recentre ainsi la piste sur son centre. */
function tendAnchor(g,x,y){
  let ax=null,ay=null,bx=1e9,by=1e9;
  for(const o of g.ends){
    const f=endFar(o.t,o.e);
    const dx=Math.abs(f.x-x), dy=Math.abs(f.y-y);
    if(dx<bx){bx=dx;ax=f.x;}
    if(dy<by){by=dy;ay=f.y;}
  }
  return {x:ax,y:ay};
}
/* Poser une extrémité au centre d'une pastille ne recentre pas la piste : son
   autre bout reste sur la grille et le segment part de biais — vertical à
   l'œil, mais dérivant d'une largeur de piste sur sa longueur. Au relâchement,
   si ce bout est à moins d'un demi-pas de l'axe du point d'arrivée, on l'y
   ramène : le segment se redresse, et l'articulation emmène ses voisins. Un
   bout tenu par une pastille ou un via, lui, ne bouge pas. */
function straightenTend(g,to){
  if(!to||!(S.grid>0))return false;
  const tol=S.grid/2-1e-9;
  // on relève d'abord, puis on déplace : une articulation partagée par deux
  // segments tirés ne doit être redressée qu'une fois, et sur un seul axe
  const moves=[];
  for(const o of g.ends){
    const t=o.t, f=endFar(t,o.e);
    if(padAt(t.l,f.x,f.y)||viaAt(t.l,f.x,f.y))continue;
    if(moves.some(m=>m.l===t.l&&Math.abs(m.f.x-f.x)<EPS_J&&Math.abs(m.f.y-f.y)<EPS_J))continue;
    const dx=Math.abs(f.x-to.x), dy=Math.abs(f.y-to.y);
    let nx=f.x, ny=f.y;
    if(dx>1e-9&&dx<tol&&dy>=dx)nx=to.x;             // quasi vertical : même colonne
    else if(dy>1e-9&&dy<tol&&dx>=dy)ny=to.y;        // quasi horizontal : même ligne
    else continue;
    moves.push({l:t.l,f,x:r3(nx),y:r3(ny)});
  }
  for(const m of moves)
    for(const k of jointAt(m.f.x,m.f.y,m.l).ends){
      if(k.e===1){k.t.x1=m.x;k.t.y1=m.y;}
      else{k.t.x2=m.x;k.t.y2=m.y;}
    }
  return moves.length>0;
}
function crossN(a,b){
  const la=Math.hypot(a.x,a.y), lb=Math.hypot(b.x,b.y);
  return (!la||!lb)?0:(a.x*b.y-a.y*b.x)/(la*lb);   // sinus de l'angle entre eux
}
/* Portion droite dont un segment fait partie : la ligne entière, d'un coude à
   l'autre. Le routeur pose un segment par clic, et une ligne droite se trouve
   en plus coupée par tout ce qu'elle rencontre — pastille traversée, via,
   embranchement, changement de largeur. Il faut la prendre entière, et pas
   seulement jusqu'à la première de ces coupures : un morceau resté en arrière
   est parallèle à celui qu'on tire, donc aucune intersection ne peut lui rendre
   son angle — il basculerait de travers. On ne s'arrête donc qu'au vrai coude
   et au changement de net. Un via ne l'arrête pas non plus : une ligne droite
   qui change de couche reste une ligne droite, et la laisser derrière la
   coucherait de la même façon. */
function collinearRun(t0){
  /* Une courbe n'est colinéaire de rien : sa corde dit une direction que son
     cuivre ne suit pas. Elle reste seule, et le geste ne prend qu'elle. */
  if(isArc(t0))return new Set([t0]);
  const run=new Set([t0]), stack=[t0];
  while(stack.length){
    const t=stack.pop();
    for(const en of [1,2]){
      const x=en===1?t.x1:t.x2, y=en===1?t.y1:t.y2;
      let ends=jointAt(x,y,t.l).ends;
      const v=viaAt(t.l,x,y);
      if(v)for(let L=v.a;L<=v.b;L++)
        if(L!==t.l)ends=ends.concat(jointAt(x,y,L).ends);
      for(const o of ends){
        if(o.t===t||run.has(o.t)||o.t.net!==t.net||isArc(o.t))continue;
        if(Math.abs(crossN(endDir(t,en),endDir(o.t,o.e)))>1e-6)continue;
        run.add(o.t);stack.push(o.t);
      }
    }
  }
  return run;
}
/* Cuivre d'une couche que la pastille d'un via touche : l'extrémité posée
   dessus, mais aussi le segment qui ne fait que la traverser — rien n'oblige
   un via à tomber au bout d'une ligne. C'est le critère électrique, le même
   que celui de la connectivité : deux cuivres qui se recouvrent sont reliés.
   L'exiger au micron sur le centre du via, c'est arrêter la piste au premier
   changement de couche dont les bouts ne tombent pas pile sur l'axe. */
function viaTracks(v,L,net){
  const out=[];
  for(const t of S.tracks){
    if(t.l!==L||t.net!==net)continue;
    if(trkDist(v.x,v.y,t)<=v.d/2+t.w/2+EPS_J)out.push(t);
  }
  return out;
}
/* Piste entière : on part d'un segment et on suit de proche en proche les
   extrémités qui se touchent, tant qu'on reste sur le même net. Les
   embranchements sont pris eux aussi — « toute la piste » veut dire tout le
   cuivre d'un seul tenant, pas seulement la ligne posée sous le pointeur.

   `tousNiv` fait franchir les vias, autant de fois qu'il en faut : top, puis
   bottom, puis top à nouveau, la piste est prise en entier sur toutes les
   couches qu'elle traverse, vias compris — les laisser derrière déchirerait le
   changement de couche au premier glissement. Le franchissement se juge sur le
   segment entier et non sur ses seules extrémités : un via posé au milieu
   d'une ligne relie tout autant. Chaque via n'est ouvert qu'une fois, ce qui
   borne le balayage à ceux que la piste touche vraiment. */
function trackRun(t0,tousNiv){
  const tracks=new Set([t0]), vias=new Set(), stack=[t0];
  const prendre=t=>{
    if(tracks.has(t)||t.net!==t0.net)return;
    tracks.add(t);stack.push(t);
  };
  while(stack.length){
    const t=stack.pop();
    for(const en of [1,2]){
      const x=en===1?t.x1:t.x2, y=en===1?t.y1:t.y2;
      for(const o of jointAt(x,y,t.l).ends)prendre(o.t);
    }
    if(!tousNiv)continue;
    for(const v of S.vias){
      if(vias.has(v)||t.l<v.a||t.l>v.b)continue;
      // un via nommé autrement n'est pas de cette piste ; sans nom, il suit
      if(v.net&&t0.net&&v.net!==t0.net)continue;
      if(segDist(v.x,v.y,t.x1,t.y1,t.x2,t.y2)>v.d/2+t.w/2+EPS_J)continue;
      vias.add(v);
      for(let L=v.a;L<=v.b;L++)
        if(L!==t.l)for(const q of viaTracks(v,L,t.net))prendre(q);
    }
  }
  return {tracks,vias};
}
/* Maj+clic sur une piste : la sélection prend la piste entière, sur la couche
   où elle est. Un second Maj+clic au même endroit, aussitôt derrière, l'étend
   aux autres couches en franchissant les vias. Le doublé se reconnaît ici même
   et non sur `dblclick` : celui-ci arrive après les deux `pointerdown`, la
   sélection est déjà faite et le glissement déjà armé. On retient la piste
   prise au clic précédent — le second clic peut tomber sur un autre de ses
   segments, il compte quand même. */
const RUN_DBL=500;                     // ms entre les deux clics du doublé
let runClick=null;
function selectRun(t0,e){
  const now=Date.now();
  const twice=!!(runClick&&runClick.at&&now-runClick.at<=RUN_DBL&&runClick.set.has(t0));
  const r=trackRun(t0,twice);
  // Ctrl en plus de Maj : la piste entière s'ajoute à ce qui est déjà pris
  if(!(e&&(e.ctrlKey||e.metaKey)))clearSel();
  for(const t of r.tracks)S.sel.tracks.add(t);
  for(const v of r.vias)S.sel.vias.add(v);
  runClick={at:now,set:r.tracks};
  const n=r.tracks.size;
  hint(twice
    ? "Piste entière sur toutes les couches : "+n+" segment(s), "+r.vias.size+" via(s)."
    : "Piste entière : "+n+" segment(s). Un second Maj+clic la prend sur toutes les couches.");
  return r;
}
/* ==========================================================================
   Les murs d'une articulation
   --------------------------------------------------------------------------
   Le coude glisse le long de son voisin resté en place : ce voisin est le mur
   contre lequel l'articulation vient buter. Tirer plus loin que sa naissance
   n'a pas de sens — la ligne du mur y repart en arrière et la piste se replie
   en crochet, cette forme qu'on ne dessine jamais à la main.
   On relève donc, derrière le premier mur, ceux qui le suivent : la suite des
   segments non tirés, de coude en coude. Passé la naissance du premier, c'est
   le mur suivant qui prend le relais et le coude dépassé se replie sur
   l'articulation — il disparaîtra au relâchement. La piste se tend alors
   comme un fil, sans jamais revenir sur elle-même.
   La chaîne s'arrête à ce qui ne peut pas se replier : une pastille, un via,
   un embranchement, ou simplement un bout de piste libre.
   ========================================================================== */
const WALL_MAX=8;
function wallChain(f){
  const walls=[];
  let cur=f, near=null;
  while(walls.length<WALL_MAX){
    const A=endFar(cur.t,cur.e), d=endDir(cur.t,cur.e);
    walls.push({ax:A.x,ay:A.y,dx:d.x,dy:d.y,near});
    // un point tenu par du cuivre traversant ne se replie pas
    if(padAt(cur.t.l,A.x,A.y)||viaAt(cur.t.l,A.x,A.y))break;
    const at=jointAt(A.x,A.y,cur.t.l);
    // un embranchement non plus : replier l'un tirerait les autres de travers
    if(at.ends.length!==2||at.vias.length)break;
    const nx=at.ends.filter(o=>o.t!==cur.t&&!S.sel.tracks.has(o.t)&&o.t.net===cur.t.net);
    if(nx.length!==1)break;
    near=at.ends.map(o=>({t:o.t,e:o.e,x0:r3(A.x),y0:r3(A.y)}));
    cur=nx[0];
  }
  return walls;
}
/* Relevé des articulations de la sélection courante, avec les positions de
   départ : le déplacement s'applique ensuite en absolu, ce qui permet de le
   suspendre (Alt) puis de le reprendre sans décalage. */
function moveJoints(){
  const anchors=new Set();
  for(const t of S.sel.tracks){
    anchors.add(anchorKey(t.l,t.x1,t.y1));
    anchors.add(anchorKey(t.l,t.x2,t.y2));
  }
  for(const v of S.sel.vias)anchors.add(anchorKey(v.a,v.x,v.y));
  const J=new Map();
  const at=(k,x,y)=>{
    if(!J.has(k))J.set(k,{x0:r3(x),y0:r3(y),ends:[],vias:[],slide:null});
    return J.get(k);
  };
  for(const t of S.tracks)
    for(const en of [1,2]){
      const x=en===1?t.x1:t.x2, y=en===1?t.y1:t.y2;
      const k=anchorKey(t.l,x,y);
      if(anchors.has(k))
        at(k,x,y).ends.push({t,e:en,x0:r3(x),y0:r3(y),f0:endFar(t,en),
                             sel:S.sel.tracks.has(t)});
    }
  for(const v of S.vias){
    const k=anchorKey(v.a,v.x,v.y);
    if(anchors.has(k))
      at(k,v.x,v.y).vias.push({v,x0:r3(v.x),y0:r3(v.y),sel:S.sel.vias.has(v)});
  }
  /* Le coude glisse le long du voisin resté en place jusqu'à retomber sur la
     ligne du segment tiré : chacun garde sa direction, donc son angle. Deux
     directions parallèles n'ont pas d'intersection — le point suit alors
     simplement le déplacement, comme avant. */
  for(const j of J.values()){
    const fix=j.ends.filter(o=>!o.sel), sel=j.ends.filter(o=>o.sel);
    if(!fix.length||!sel.length)continue;
    for(const f of fix){
      const fd=endDir(f.t,f.e);
      for(const g of sel){
        const gd=endDir(g.t,g.e), G=endFar(g.t,g.e);
        if(Math.abs(crossN(fd,gd))<1e-4)continue;             // ~0,006 degre
        j.slide={gx:G.x,gy:G.y,gdx:gd.x,gdy:gd.y,walls:wallChain(f)};
        break;
      }
      if(j.slide)break;
    }
  }
  return [...J.values()];
}
/* Le mur retourné : sa direction renvoyée par la ligne du segment tiré. Un
   45° reste un 45°, un angle droit un angle droit — seul le côté change. C'est
   ce que fait la main quand le coude passe de l'autre bord de la pastille, et
   c'est la seule issue quand il n'y a plus de mur à replier derrière. */
function wallFlip(w,gdx,gdy){
  const L2=gdx*gdx+gdy*gdy;
  if(!L2)return {x:w.dx,y:w.dy};
  const k=(w.dx*gdx+w.dy*gdy)/L2;          // part du mur portée par le segment tiré
  return {x:2*k*gdx-w.dx,y:2*k*gdy-w.dy};  // l'autre part change de signe
}
/* Où l'articulation peut tomber, et combien de coudes elle a mangés pour y
   arriver — par ordre de préférence, car la première place n'est pas toujours
   tenable. `u` compte depuis la naissance du mur : 1 à l'articulation de
   départ, 0 à sa naissance. Négatif, le mur est consommé — au suivant.
   Trois places, dans cet ordre :
   1. l'appui franc du premier mur qui en offre un ;
   2. le retournement du dernier mur consommé, quand plus rien n'offre d'appui.
      Se contenter de translater l'articulation, comme avant, cassait son angle
      — le voisin partait alors de biais, ni droit ni à 45°, et la piste se
      mettait en travers de la grille. Le cas se présente dès qu'un mur
      parallèle au segment tiré suit le coude : un 45° pris entre deux droites
      de même sens ;
   3. l'appui du premier mur **au-delà de sa naissance** : le coude repart en
      arrière, ce qu'on évite tant qu'on peut, mais qui garde son angle sans
      renverser la portion tirée. C'est l'issue de secours quand le
      retournement, lui, la renverserait — voir `applyJoints`. */
function slideAt(s,dx,dy){
  const Gx=s.gx+dx, Gy=s.gy+dy, W=s.walls, out=[];
  let last=null, over=null;                           // dernier mur consommé, premier dépassé
  for(let k=0;k<W.length;k++){
    const w=W[k], den=w.dx*s.gdy-w.dy*s.gdx;
    if(Math.abs(den)<1e-12)continue;                  // mur parallèle : pas d'appui
    const u=((Gx-w.ax)*s.gdy-(Gy-w.ay)*s.gdx)/den;
    if(u>=0){out.push({x:w.ax+w.dx*u,y:w.ay+w.dy*u,eat:k});break;}
    if(!over)over={x:w.ax+w.dx*u,y:w.ay+w.dy*u,eat:k};
    last={w:w,u:u,k:k};                               // un mur derrière : il prend le relais
  }
  if(last){
    const d=wallFlip(last.w,s.gdx,s.gdy);
    out.push({x:last.w.ax-d.x*last.u,y:last.w.ay-d.y*last.u,eat:last.k});
  }
  if(over)out.push(over);
  return out;
}
/* La portion tirée repart-elle en arrière depuis cette articulation ? Ses deux
   bouts glissent chacun le long de son mur, et rien ne les empêche de se
   croiser : le segment prend alors une longueur négative, la piste se recroise
   au-dessus d'elle-même et dessine un **papillon** — l'auto-intersection que le
   Gerber refuse dans une région G36/G37, et qu'on ne trace jamais à la main.
   On compare la direction d'aujourd'hui à celle du départ : un produit scalaire
   négatif, c'est le segment retourné. */
function jointFlips(j){
  for(const o of j.ends){
    if(!o.sel)continue;
    const P=o.e===1?{x:o.t.x1,y:o.t.y1}:{x:o.t.x2,y:o.t.y2}, F=endFar(o.t,o.e);
    if((F.x-P.x)*(o.f0.x-o.x0)+(F.y-P.y)*(o.f0.y-o.y0)<-1e-9)return true;
  }
  return false;
}
function applyJoints(J,dx,dy,detach){
  if(!J)return;
  const put=(o,x,y)=>{if(o.e===1){o.t.x1=x;o.t.y1=y;}else{o.t.x2=x;o.t.y2=y;}};
  /* Poser une articulation à l'une de ses places : ses extrémités, ses vias, et
     les coudes mangés qui se replient sur elle. Les autres retournent d'où ils
     venaient — le glissement s'applique en absolu, revenir en arrière doit les
     rendre intacts. */
  const place=(j,c)=>{
    const W=j.slide?j.slide.walls:[];
    // sans appui, l'articulation suit simplement le déplacement
    const x=r3(c?c.x:j.x0+dx), y=r3(c?c.y:j.y0+dy), eat=c?c.eat:0;
    for(const o of j.ends)put(o,x,y);
    for(const a of j.vias){a.v.x=x;a.v.y=y;}
    for(let k=1;k<W.length;k++){
      const n=W[k].near;
      if(!n)continue;
      if(k<=eat)for(const o of n)put(o,x,y);
      else for(const o of n)put(o,o.x0,o.y0);
    }
  };
  for(const j of J){
    if(detach){                    // Alt : les voisins restent où ils sont
      const W=j.slide?j.slide.walls:[];
      for(const o of j.ends)if(!o.sel)put(o,o.x0,o.y0);
      for(const a of j.vias)if(!a.sel){a.v.x=a.x0;a.v.y=a.y0;}
      for(const w of W)if(w.near)for(const o of w.near)put(o,o.x0,o.y0);
      continue;
    }
    // intersection de la ligne du voisin (fixe) et de celle du segment tiré
    j.opt=j.slide?slideAt(j.slide,dx,dy):[];
    j.pick=0;
    place(j,j.opt[0]||null);
  }
  if(detach)return;
  /* Aucune portion tirée ne doit repartir en arrière sur elle-même : c'est le
     papillon. Une articulation qui renverse la sienne passe à la place
     suivante. Le voisin d'en face pouvant bouger à son tour, on repasse : deux
     tours suffisent, la liste des places étant courte. */
  for(let pass=0;pass<2;pass++){
    let stable=true;
    for(const j of J){
      while(j.pick<j.opt.length-1&&jointFlips(j)){
        place(j,j.opt[++j.pick]);stable=false;
      }
    }
    if(stable)break;
  }
}
/* Premier déplacement réel : la sélection s'étend aux portions droites, et on
   relève l'état de départ de tout ce qui va bouger. */
function beginMove(){
  for(const t of [...S.sel.tracks])
    for(const o of collinearRun(t))S.sel.tracks.add(o);
  drag.trk=[...S.sel.tracks].map(t=>({t,x1:t.x1,y1:t.y1,x2:t.x2,y2:t.y2}));
  drag.via=[...S.sel.vias].map(v=>({v,x:v.x,y:v.y}));
  drag.joints=moveJoints();
  armClear([...movedTracks()],[...S.sel.vias],[...S.sel.fps].map(fpById).filter(Boolean));
  // les chanfreins présents AVANT le geste : ce sont eux qu'on rendra s'ils se replient
  drag.diag=diagTracks([...movedTracks()]);
  drag.drw=selDrawingsPcb().map(d=>({d,x1:d.x1,y1:d.y1,x2:d.x2,y2:d.y2}));
  // un boîtier emmène ses pastilles, une zone son contour : c'est un autre
  // problème que l'isolation d'une piste, on laisse alors le geste libre — et
  // le retour en arrière ne saurait de toute façon pas replacer le boîtier
  if(S.sel.fps.size||S.sel.zones.size||S.sel.cuts.size){drag.clear=null;drag.cross=null;}
}
/* État de départ de l'anti-collision : ce que le geste emmène, et ce qui était
   déjà en faute avant qu'il ne commence. */
function armClear(tracks,vias,fps){
  const skip=new Set([...tracks,...vias,...fps]);
  drag.clear={list:tracks,vias:vias,skip,
              was:moveClearBad(tracks,null,skip),
              wasV:moveViaBad(vias,null,skip),warned:false};
  drag.cross={list:tracks,was:crossPairs(tracks),warned:false};
}
/* Les paires de segments qui se croisent vraiment : bout à bout ne compte pas,
   un embranchement en T non plus — seul un croisement franc, chacun au travers
   de l'autre, fait un papillon. */
function crossPairs(list){
  const set=new Set();
  for(let i=0;i<list.length;i++)
    for(let j=i+1;j<list.length;j++){
      const a=list[i], b=list[j];
      if(a.l!==b.l||isArc(a)||isArc(b))continue;     // la corde d'un arc n'est pas son cuivre
      const d1=a.x2-a.x1, d2=a.y2-a.y1, d3=b.x2-b.x1, d4=b.y2-b.y1;
      const den=d1*d4-d2*d3;
      if(Math.abs(den)<1e-12)continue;
      const ex=b.x1-a.x1, ey=b.y1-a.y1;
      const t=(ex*d4-ey*d3)/den, u=(ex*d2-ey*d1)/den;
      if(t>1e-9&&t<1-1e-9&&u>1e-9&&u<1-1e-9)set.add(i+"|"+j);
    }
  return set;
}
/* Le cuivre déplacé se recroise-t-il ? Les deux bouts d'une portion tirée
   glissent chacun le long de son mur ; passé le point où ces deux murs se
   rencontrent, ils repartent l'un par-dessus l'autre et la piste se recroise —
   le papillon. Aucun arrangement de coudes ne rattrape cela : la seule réponse
   juste est de buter, comme sur un obstacle d'isolation. Le geste reprend dès
   qu'on repart de l'autre côté.
   Un croisement déjà présent au départ ne bloque rien : une carte en faute doit
   rester réparable à la main. */
function crossStop(){
  const c=drag&&drag.cross;
  if(!c)return false;
  const now=crossPairs(c.list);
  let neuf=false;
  for(const k of now)if(!c.was.has(k)){neuf=true;break;}
  if(!neuf)return false;
  if(!c.warned){
    c.warned=true;
    hint("La piste se recroiserait sur elle-même : le geste bute. "+
         "Tirez de l'autre côté, ou reprenez le coude voisin.");
  }
  return true;
}
/* Le cuivre déplacé traverse-t-il ce qu'il ne devrait pas ? Si oui, on le dit
   une fois et on rend la main à l'appelant, qui remet le geste où il était. */
function clearStop(){
  const c=drag&&drag.clear;
  if(!c)return false;
  const bad=moveClearBad(c.list,c.was,c.skip);
  const badV=moveViaBad(c.vias||[],c.wasV,c.skip);
  if(!bad.size&&!badV.size)return false;
  if(!c.warned){
    c.warned=true;
    if(bad.size){
      const t=[...bad][0];
      hint("Isolation de "+fmt(classOf(t.net).clr,2)+" mm : la piste bute sur l'obstacle. "+
           "Contournez-le, ou coupez l'anti-collision pour forcer.");
    }else{
      hint("Le via bute : il passerait "+[...badV.values()][0]+". Posez-le ailleurs, "+
           "ou coupez l'anti-collision pour forcer.");
    }
  }
  return true;
}
/* ==========================================================================
   Adoucir un angle droit : le coude passe en 45°
   --------------------------------------------------------------------------
   On recule d'autant sur les deux portions droites qui se rejoignent, puis on
   pose la corde entre les deux points obtenus : deux longueurs égales sur deux
   directions perpendiculaires donnent exactement 45°. La longueur retenue est
   celle de la plus courte des deux portions — c'est le tracé qu'aurait posé le
   routeur s'il était passé par là.
   ========================================================================== */
/* Portion droite vue depuis un coude : ses segments du plus proche au plus
   loin, chacun avec l'extrémité tournée vers le coude, et sa longueur totale. */
function runFrom(t,e){
  const segs=[], seen=new Set();
  let cur=t, en=e, len=0;
  while(cur&&!seen.has(cur)){
    seen.add(cur);
    segs.push({t:cur,e:en});
    len+=dist(cur.x1,cur.y1,cur.x2,cur.y2);
    const F=endFar(cur,en);
    if(viaAt(cur.l,F.x,F.y)||padAt(cur.l,F.x,F.y))break;
    const j=jointAt(F.x,F.y,cur.l);
    if(j.ends.length!==2||j.vias.length)break;
    const nx=j.ends.find(o=>o.t!==cur);
    if(!nx||nx.t.w!==cur.w||nx.t.net!==cur.net)break;
    if(Math.abs(crossN(endDir(cur,en),endDir(nx.t,nx.e)))>1e-6)break;
    cur=nx.t;en=nx.e;
  }
  return {segs,len:r3(len)};
}
/* Raccourcit la portion de L millimètres depuis le coude : les segments
   entièrement consommés disparaissent, le premier qui dépasse est coupé.
   Renvoie le point atteint — c'est là que commencera la diagonale. */
function trimRun(run,L){
  let rest=L, pt=null;
  for(const o of run.segs){
    const len=dist(o.t.x1,o.t.y1,o.t.x2,o.t.y2);
    if(rest>=len-1e-9){
      rest=rest-len;
      pt=endFar(o.t,o.e);
      S.tracks=S.tracks.filter(x=>x!==o.t);
      S.sel.tracks.delete(o.t);
      continue;
    }
    const d=endDir(o.t,o.e), n=Math.hypot(d.x,d.y);
    const near=o.e===1?{x:o.t.x1,y:o.t.y1}:{x:o.t.x2,y:o.t.y2};
    pt={x:r3(near.x-d.x/n*rest),y:r3(near.y-d.y/n*rest)};
    if(o.e===1){o.t.x1=pt.x;o.t.y1=pt.y;}else{o.t.x2=pt.x;o.t.y2=pt.y;}
    break;
  }
  return pt;
}
/* `dry` : on se contente de dire si le coude s'y prête, sans rien changer —
   c'est ce qui évite de poser un pas d'annulation pour rien. */
/* Longueur du chanfrein posé d'office au dépôt, en largeurs de piste. Le seuil
   se prend sur la largeur comme tous les autres de ce fichier : il est ainsi
   juste pour une piste de 0,2 mm comme pour une de 1 mm, sans réglage.
   Pourquoi le borner : sans borne, le chanfrein vaut la jambe la plus courte du
   coude — sur un coude de 45 mm par 16, il remplace les DEUX jambes par une
   seule diagonale de 16 mm, et le coude se retrouve 16 mm avant l'endroit
   cliqué. Géométriquement c'est le tracé qu'aurait posé le routeur d'un seul
   clic ; à l'usage, c'est un clic qui disparaît. La touche D, elle, garde le
   chanfrein maximal : là, c'est un geste voulu. */
const MITRE_AUTO=4;
/* `cap` borne le chanfrein à `cap` largeurs de piste ; 0 ou absent = maximal. */
function mitreAt(l,x,y,dry,cap){
  if(padAt(l,x,y)||viaAt(l,x,y))return false;
  const j=jointAt(x,y,l);
  if(j.ends.length!==2)return false;
  const A=j.ends[0], B=j.ends[1];
  if(A.t===B.t||A.t.w!==B.t.w||A.t.net!==B.t.net)return false;
  /* Couper un angle suppose deux droites. Là où l'une des jambes est un arc,
     le raccord est déjà courbe : il n'y a pas d'angle à casser. */
  if(isArc(A.t)||isArc(B.t))return false;
  // angle droit seulement : ailleurs, couper en deux ne donnerait pas 45°
  if(Math.abs(Math.abs(crossN(endDir(A.t,A.e),endDir(B.t,B.e)))-1)>1e-3)return false;
  const ra=runFrom(A.t,A.e), rb=runFrom(B.t,B.e);
  /* On recule d'autant des deux côtés — c'est ce qui fait le 45°. La portion la
     plus longue garde donc l'écart des deux longueurs : sous la largeur de
     piste, ce reste est une écharde, celle-là même que le tracé s'interdit
     maintenant de poser. On recule alors des deux côtés d'une largeur de plus,
     ce qui rend du cuivre aux deux restes au lieu d'en laisser un famélique.
     Un chanfrein plus court que la piste ne veut rien dire : on n'y touche pas. */
  const MIN=minJog(A.t.w);
  let L=Math.min(ra.len,rb.len);
  if(cap>0)L=Math.min(L,r3(cap*A.t.w));
  /* Ce qui reste d'une jambe après le chanfrein : nul quand le chanfrein l'a
     mangée entière, sinon la différence. Un reste plus court que la piste est
     une écharde — celle-là même que le tracé s'interdit de poser. On recule
     alors d'une largeur de plus, ce qui rend du cuivre aux DEUX restes. */
  const maigre=v=>v>1e-9&&v<MIN;
  if(maigre(r3(ra.len-L))||maigre(r3(rb.len-L)))L=r3(L-MIN);
  if(L<MIN)return false;
  if(dry)return true;
  const lay=A.t.l, net=A.t.net, w=A.t.w;
  const pa=trimRun(ra,L), pb=trimRun(rb,L);
  if(!pa||!pb)return false;
  const nt={l:lay,net,w,x1:pa.x,y1:pa.y,x2:pb.x,y2:pb.y};
  S.tracks.push(nt);S.sel.tracks.add(nt);
  return true;
}
/* Extrémités d'une portion droite : les points qu'un seul de ses segments
   touche. Ses coudes sont là — et nulle part ailleurs. */
function runEnds(run){
  const cnt=new Map(), pos=new Map();
  for(const t of run)
    for(const en of [1,2]){
      const x=en===1?t.x1:t.x2, y=en===1?t.y1:t.y2, k=anchorKey(t.l,x,y);
      cnt.set(k,(cnt.get(k)||0)+1);
      pos.set(k,{l:t.l,x,y});
    }
  return [...cnt.keys()].filter(k=>cnt.get(k)===1).map(k=>pos.get(k));
}
/* Adoucit les angles droits aux bouts des portions sélectionnées. Sélectionner
   n'importe quel morceau d'une portion droite suffit : c'est la portion qui
   porte le coude, pas le segment. */
function mitreSel(){
  if(!S.sel.tracks.size){
    hint("Sélectionnez d'abord la piste dont il faut adoucir l'angle.");
    return 0;
  }
  const seen=new Set(), pts=[];
  for(const t of S.sel.tracks)
    for(const p of runEnds(collinearRun(t))){
      const k=anchorKey(p.l,p.x,p.y);
      if(seen.has(k))continue;
      seen.add(k);pts.push(p);
    }
  const todo=pts.filter(p=>mitreAt(p.l,p.x,p.y,true));
  if(!todo.length){
    hint("Aucun angle droit à adoucir ici : il en faut un vrai, entre deux "+
         "portions de même largeur et d'au moins une largeur de piste, sans "+
         "via ni pastille au coude.");
    return 0;
  }
  push();
  let n=0;
  for(const p of todo)if(mitreAt(p.l,p.x,p.y,false))n++;
  touch();refreshPanels();draw();
  hint(n>1?n+" angles droits passés en 45°.":"Angle droit passé en 45°.");
  return n;
}
/* ==========================================================================
   Le crochet
   --------------------------------------------------------------------------
   Quand un coude est mangé, ses deux voisins se retrouvent bout à bout. S'ils
   repartent du même point dans le MÊME sens, la piste se replie sur elle-même :
   elle va jusqu'au bout de l'un, revient sur ses pas et repart au bout de
   l'autre — un V refermé, du cuivre posé deux fois, et une pointe en l'air qui
   ne mène nulle part. C'est la forme qu'on ne dessine jamais à la main.
   Au dépôt, le crochet se défait : les deux segments n'en font plus qu'un, d'un
   bout à l'autre. La liaison est conservée — le cuivre en trop, lui, s'en va.
   Un point tenu par une pastille, un via ou un embranchement ne se défait pas :
   il y a là une raison pour que la piste rebrousse chemin.
   ========================================================================== */
function hookAt(t,e){
  const x=e===1?t.x1:t.x2, y=e===1?t.y1:t.y2;
  if(padAt(t.l,x,y)||viaAt(t.l,x,y))return null;
  const j=jointAt(x,y,t.l);
  if(j.ends.length!==2||j.vias.length)return null;
  const [A,B]=j.ends;
  if(A.t===B.t||A.t.net!==B.t.net||A.t.w!==B.t.w)return null;
  if(isArc(A.t)||isArc(B.t))return null;   // deux arcs bout à bout ne font pas un crochet
  // direction depuis l'articulation : même sens = crochet
  const a=endDir(A.t,A.e), b=endDir(B.t,B.e);
  if(Math.abs(crossN(a,b))>1e-6||a.x*b.x+a.y*b.y<=0)return null;
  return {A,B};
}
function pruneHooks(list){
  let n=0;
  for(let pass=0;pass<16;pass++){
    let h=null;
    for(const t of list){
      if(S.tracks.indexOf(t)<0)continue;
      h=hookAt(t,1)||hookAt(t,2);
      if(h)break;
    }
    if(!h)break;
    const {A,B}=h, F=endFar(B.t,B.e);
    if(A.e===1){A.t.x1=F.x;A.t.y1=F.y;}else{A.t.x2=F.x;A.t.y2=F.y;}
    S.tracks=S.tracks.filter(x=>x!==B.t);
    S.sel.tracks.delete(B.t);
    n++;
  }
  if(n)touch();
  return n>0;
}
/* Un segment ramené sur lui-même n'a plus de cuivre à décrire : on l'efface au
   dépôt plutôt que de laisser un point invisible dans la netlist. */
function pruneDeadTracks(){
  const dead=S.tracks.filter(t=>dist(t.x1,t.y1,t.x2,t.y2)<1e-6);
  if(!dead.length)return false;
  S.tracks=S.tracks.filter(t=>dead.indexOf(t)<0);
  dead.forEach(t=>S.sel.tracks.delete(t));
  touch();
  return true;
}
/* Le ménage du dépôt, dans l'ordre. Les segments repliés partent d'abord :
   tant qu'un point mort traîne sur une articulation, elle compte quatre
   extrémités et le crochet passe inaperçu. Défaire un crochet peut à son tour
   annuler un segment — d'où le second passage. */
/* ==========================================================================
   L'aimant angulaire d'un bout tiré
   --------------------------------------------------------------------------
   Le routeur ne pose que du 45° ; le déplacement d'un sommet, lui, était libre.
   On tirait un coude de quelques dixièmes et les deux jambes partaient de
   biais — 32°, ni droit ni 45° : l'**angle bâtard** que les fabricants
   refusent parfois au contrôle d'entrée.
   Le geste reste libre — il faut bien pouvoir sortir d'une pastille de
   travers — mais les positions où les jambes retombent d'aplomb deviennent
   **magnétiques**, à quelques pixels près, comme les pastilles le sont déjà.
   Deux cas, selon ce que le sommet tiré a en face de lui :
     un seul point d'appui — un bout libre, une extrémité détachée — et le
       curseur se projette sur le rail le plus proche des huit ;
     deux points d'appui — un vrai coude — et les places d'aplomb sont les
       intersections des deux éventails de rails. Elles sont peu nombreuses :
       deux bouts fixes ne laissent pas le choix, c'est la géométrie qui le dit
       et non l'aimant. Pour aller ailleurs en gardant l'angle, il faut poser un
       segment de plus — ce que fait le chanfrein, touche D.
   Rien ne s'aimante si la grille pose déjà le sommet d'aplomb, ni en angle
   libre : c'est alors un choix. */
function tendMagnet(g,mx,my,nx,ny,tol){
  if(cornerMode()==="free")return null;
  const F=[];
  for(const o of g.ends){
    const f=endFar(o.t,o.e);
    if(!F.some(q=>Math.abs(q.x-f.x)<EPS_J&&Math.abs(q.y-f.y)<EPS_J))F.push(f);
  }
  if(!F.length||F.length>2)return null;
  if(F.every(f=>angleOk(nx-f.x,ny-f.y)))return null;   // déjà d'aplomb
  let best=null;
  const keep=(x,y)=>{
    for(const f of F)if(dist(x,y,f.x,f.y)<1e-9)return;  // jambe écrasée
    const d=dist(x,y,mx,my);
    if(d<=tol&&(!best||d<best.d))best={x:r3(x),y:r3(y),d};
  };
  if(F.length===1){
    for(const u of DIR8){
      const t=(mx-F[0].x)*u.x+(my-F[0].y)*u.y;          // projection sur le rail
      if(t>1e-9)keep(F[0].x+u.x*t,F[0].y+u.y*t);
    }
  }else{
    const ex=F[1].x-F[0].x, ey=F[1].y-F[0].y;
    for(const ua of DIR8)
      for(const ub of DIR8){
        const den=ua.x*ub.y-ua.y*ub.x;
        if(Math.abs(den)<1e-12)continue;                // rails parallèles
        const ta=(ex*ub.y-ey*ub.x)/den;
        if(ta<=1e-9)continue;                           // la jambe repartirait en arrière
        const x=F[0].x+ua.x*ta, y=F[0].y+ua.y*ta;
        if((x-F[1].x)*ub.x+(y-F[1].y)*ub.y<=1e-9)continue;
        keep(x,y);
      }
  }
  return best;
}
/* ==========================================================================
   Le ménage du relâchement
   --------------------------------------------------------------------------
   Tirer une piste raccourcit ses jambes. Passé un certain point, le chanfrein
   qu'elles portaient se replie sur l'articulation — c'est voulu, `wallChain`
   tend la piste comme un fil plutôt que de la laisser revenir sur elle-même —
   et le coude redevient FRANC. On voulait raccourcir, on récolte un angle
   droit, qu'il faudrait ensuite reprendre à la main.
   Le dépôt d'un tracé rattrape déjà cela (`chamferPosed`). Le glissement le
   rattrape ici, à la même borne et sur les seules articulations que le geste a
   touchées. Le `push()` du premier mouvement couvre l'ensemble : le chanfrein
   se défait avec le glissement, d'un seul Ctrl+Z.
   Au relâchement, et non pendant : le glissement s'applique en absolu depuis
   les positions relevées au départ (`drag.trk`, `drag.joints`). Créer ou
   supprimer du cuivre en cours de geste détacherait ces références, et la
   piste cesserait de suivre la souris.
   ========================================================================== */
function pruneAfterDrag(list){
  pruneDeadTracks();
  if(pruneHooks(list))pruneDeadTracks();
}
/* Les chanfreins que le geste emmène : les segments en diagonale du cuivre
   concerné. Si l'un d'eux a disparu au relâchement, c'est qu'il s'est replié
   sur son articulation — et le coude qu'il adoucissait est redevenu franc. */
function diagTracks(list){
  return list.filter(t=>!isArc(t)&&Math.abs(t.x1-t.x2)>1e-9&&Math.abs(t.y1-t.y2)>1e-9);
}
/* Rendre au coude le 45° que le glissement lui a pris. On ne touche QU'À cela :
   un coude déjà franc avant le geste le reste — le glissement n'est pas le
   moment de réécrire un tracé qu'on n'a pas demandé à réécrire. */
function mitreAfterDrag(list,avant){
  if(!avant||!avant.length)return false;
  if(!avant.some(t=>S.tracks.indexOf(t)<0))return false;   // aucun chanfrein perdu
  chamferPosed(list.filter(t=>S.tracks.indexOf(t)>=0));
  return true;
}
function projOnSeg(px_,py_,t){
  const A=arcOf(t);
  if(A){
    /* Sur un arc, le point le plus proche est celui du même angle, rabattu sur
       le rayon — hors du balayage, c'est le bout le plus proche. C'est là que
       le via se posera, et il doit tomber sur le cuivre, pas sur la corde. */
    const a=Math.atan2(py_-A.cy,px_-A.cx);
    if(!arcOn(A,a))
      return dist(px_,py_,t.x1,t.y1)<=dist(px_,py_,t.x2,t.y2)
        ? {x:r3(t.x1),y:r3(t.y1)} : {x:r3(t.x2),y:r3(t.y2)};
    return {x:r3(A.cx+A.r*Math.cos(a)), y:r3(A.cy+A.r*Math.sin(a))};
  }
  const dx=t.x2-t.x1, dy=t.y2-t.y1, l2=dx*dx+dy*dy;
  if(l2<1e-12)return {x:t.x1,y:t.y1};
  const u=clamp(((px_-t.x1)*dx+(py_-t.y1)*dy)/l2,0,1);
  return {x:r3(t.x1+dx*u),y:r3(t.y1+dy*u)};
}
/* Couper une piste en deux au point donné — un via posé en plein milieu. Sur un
   arc, les deux morceaux se partagent l'angle balayé : couper la corde en deux
   aurait donné deux arcs d'un autre rayon, et le cuivre aurait quitté le
   cercle qu'il suivait. */
function splitTrack(t,pt){
  const nt={l:t.l,net:t.net,w:t.w,x1:pt.x,y1:pt.y,x2:t.x2,y2:t.y2};
  const A=arcOf(t);
  if(A){
    const part=arcSweep(A,Math.atan2(pt.y-A.cy,pt.x-A.cx))*(t.ca<0?-1:1);
    t.ca=r4(part);
    nt.ca=r4(A.ca-part);
    if(!isArc(t))delete t.ca;
    if(!isArc(nt))delete nt.ca;
  }
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
/* Dérouter la sélection : le cuivre routé s'en va, le reste ne bouge pas.
   C'est la touche U de l'éditeur schématique (`delWiresSel`), portée sur la
   carte. Un lasso prend tout — empreintes, pistes, vias, zones ; jusqu'ici il
   fallait désigner les segments un à un pour ne pas emporter les boîtiers avec
   eux. `U` vide le routage de la sélection et laisse les empreintes en place,
   et sélectionnées, prêtes à être replacées avant de router autrement.
   Le routage, c'est le cuivre du chemin : les segments **et** les vias qui les
   font changer de couche. Un via resté seul au milieu de rien n'est pas du
   routage, c'est un trou dans la carte — on ne le laisse pas derrière.
   Les zones de cuivre, le contour et les découpes ne sont pas du routage : un
   plan de masse décrit la carte, il ne relie pas deux pastilles. `Suppr`
   reste là pour tout emporter.
   Sans piste ni via dans la sélection, rien n'est supprimé : le pied de page le
   dit plutôt que d'emporter les empreintes. */
function unrouteSel(){
  const tr=S.tracks.filter(t=>S.sel.tracks.has(t));
  const vi=S.vias.filter(v=>S.sel.vias.has(v));
  if(!tr.length&&!vi.length){
    hint(selCount()
      ? "Aucune piste ni via dans la sélection : U n'efface que le cuivre routé."
      : "Sélectionnez des pistes (Ctrl+clic pour en ajouter), puis U pour n'effacer "+
        "qu'elles — les empreintes restent en place.");
    return;
  }
  push();
  S.tracks=S.tracks.filter(t=>!S.sel.tracks.has(t));
  S.vias=S.vias.filter(v=>!S.sel.vias.has(v));
  S.sel.tracks.clear();S.sel.vias.clear();
  touch();
  const dit=[];
  if(tr.length)dit.push(tr.length+" segment"+(tr.length>1?"s":""));
  if(vi.length)dit.push(vi.length+" via"+(vi.length>1?"s":""));
  hint(dit.join(" et ")+(tr.length+vi.length>1?" supprimés":" supprimé")+
       (S.sel.fps.size?" · "+S.sel.fps.size+" empreinte(s) laissée(s) en place.":"."));
  refreshPanels();draw();
  return tr.length+vi.length;
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
  if(S.drawings&&S.sel.drawings)
    S.drawings=S.drawings.filter(d=>!S.sel.drawings.has(d.id));
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
  const drawings=selDrawingsPcb();
  let x=1e9,y=1e9;
  for(const f of fps){x=Math.min(x,f.x);y=Math.min(y,f.y);}
  for(const t of tracks){x=Math.min(x,t.x1,t.x2);y=Math.min(y,t.y1,t.y2);}
  for(const v of vias){x=Math.min(x,v.x);y=Math.min(y,v.y);}
  for(const z of zones.concat(cuts))
    for(const q of z.pts){x=Math.min(x,q.x);y=Math.min(y,q.y);}
  for(const d of drawings){x=Math.min(x,d.x1,d.x2);y=Math.min(y,d.y1,d.y2);}
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
    zones:zones.map(poly), cuts:cuts.map(poly),
    drawings:drawings.map(d=>({
      layer:d.layer,
      x1:r3(d.x1-x),y1:r3(d.y1-y),x2:r3(d.x2-x),y2:r3(d.y2-y),
      width:d.width
    }))
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
     !arr(c.zones).length&&!arr(c.cuts).length&&!arr(c.drawings).length){hint("Presse-papier vide.");return;}
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
  for(const src of arr(c.drawings)){
    const d=normDrawingPcb(src,0);
    if(!d){dropped++;continue;}
    d.id=S.nextId++;
    d.x1=r3(d.x1+bx);d.y1=r3(d.y1+by);d.x2=r3(d.x2+bx);d.y2=r3(d.y2+by);
    S.drawings.push(d);
    if(!S.sel.drawings)S.sel.drawings=new Set();
    S.sel.drawings.add(d.id);
  }
  zoneCache.clear();
  touch();refreshPanels();draw();
  hint(S.sel.fps.size+" empreinte(s), "+S.sel.tracks.size+" piste(s), "+
       S.sel.vias.size+" via(s) collés."+(dropped?" "+dropped+" élément(s) ignoré(s).":""));
}
function rotateSel(){
  const list=[...S.sel.fps];
  const drw=selDrawingsPcb();
  if(!list.length&&!drw.length)return;
  push();
  for(const id of list){const f=fpById(id);if(f)f.rot=((f.rot||0)+90)%360;}
  if(drw.length){
    let cx=0, cy=0;
    for(const d of drw){cx+=d.x1+d.x2; cy+=d.y1+d.y2;}
    cx/=(drw.length*2); cy/=(drw.length*2);
    for(const d of drw){
      const rx1=-(d.y1-cy)+cx, ry1=(d.x1-cx)+cy;
      const rx2=-(d.y2-cy)+cx, ry2=(d.x2-cx)+cy;
      d.x1=r3(rx1); d.y1=r3(ry1);
      d.x2=r3(rx2); d.y2=r3(ry2);
    }
  }
  touch();refreshPanels();draw();
}
function flipSel(){
  const list=[...S.sel.fps];
  const drw=selDrawingsPcb();
  if(!list.length&&!drw.length)return;
  push();
  for(const id of list){const f=fpById(id);if(f)f.side=f.side?0:1;}
  for(const d of drw){d.layer=d.layer==="silkB"?"silkT":"silkB";}
  touch();refreshPanels();draw();
}

/* ==========================================================================
   Tracé de pistes
   ========================================================================== */
/* Le chemin en L chanfreiné : une diagonale et une portion droite. La
   **posture** dit laquelle vient en premier — diagonale d'abord, ou droit
   d'abord. C'est le terme de KiCad, dont le routeur la bascule sur `/`.

   Les deux longueurs se prennent sur les valeurs absolues : `d` la projection
   de la diagonale, `s` ce qui reste de la portion droite. Écrite `|dx| - |dy|`,
   cette dernière devient négative dès que le trajet est plus haut que large :
   la portion droite repart alors en arrière par-dessus la diagonale, et le
   contour se recroise — le **papillon**, cette auto-intersection que la spec
   Gerber RS-274X refuse dans une région G36/G37. `Math.abs(adx-ady)` et
   `Math.min(adx,ady)` la rendent structurellement impossible : deux longueurs
   positives, toujours.
   Les cas dégénérés — trajet droit, trajet à 45° plein — ne posent qu'un seul
   segment : un point milieu confondu avec un bout laisserait un segment de
   longueur nulle dans le document, dans le .json et dans le Gerber.

   Reste la zone morte entre les deux : `s` positif mais minuscule. Le papillon
   est mort, l'écharde le remplace — un décrochement de trois centièmes, une
   languette de cuivre plus fine que la piste qu'elle prolonge, que la gravure
   sous-attaque. Le test d'égalité stricte ne l'attrape pas : avec un curseur
   libre, `s` ne vaut jamais exactement zéro, et une grille au dixième en fabrique
   à la chaîne sous une piste de trois dixièmes.
   D'où `minSeg`, le seuil d'écrasement : en deçà, on ne supprime pas le point
   milieu — ça laisserait un angle bâtard — on **déplace l'arrivée** pour forcer
   le 45° pur ou l'orthogonal pur. C'est l'aimant angulaire du routeur de KiCad :
   la piste colle aux huit rails, et le décrochement ne peut plus naître dans la
   zone morte. `minSeg` absent ou nul rend la géométrie pure, sans aimant. */
function route45(a,b,posture,minSeg){
  const dx=b.x-a.x, dy=b.y-a.y;
  const adx=Math.abs(dx), ady=Math.abs(dy);
  const sx=Math.sign(dx), sy=Math.sign(dy);
  const d=Math.min(adx,ady);            // projection de la diagonale
  const s=Math.abs(adx-ady);            // portion droite : jamais négative
  const m=minSeg>0?minSeg:0;            // seuil d'écrasement ; 0 = géométrie pure
  if(d<1e-9&&s<1e-9)return [];          // sur place : rien à poser
  if(d<1e-9||s<1e-9)                    // un seul segment, pas de point milieu
    return [{x1:a.x,y1:a.y,x2:b.x,y2:b.y}];
  if(s<m){                              // décrochement trop court : diagonale pure
    // la demi-somme arrondie au micron : les deux axes bougent d'autant, l'angle
    // reste un 45° exact et non un 45° à un micron près
    const L=r3((adx+ady)/2);
    if(L<1e-9)return [];
    return [{x1:a.x,y1:a.y,x2:a.x+sx*L,y2:a.y+sy*L}];
  }
  if(d<m)                               // diagonale trop courte : H ou V pur
    return adx>ady?[{x1:a.x,y1:a.y,x2:b.x,y2:a.y}]
                  :[{x1:a.x,y1:a.y,x2:a.x,y2:b.y}];
  const mid=posture
    ? {x:a.x+sx*d, y:a.y+sy*d}                                  // diagonale d'abord
    : (adx>ady?{x:a.x+sx*s,y:a.y}:{x:a.x,y:a.y+sy*s});          // droit d'abord
  return [{x1:a.x,y1:a.y,x2:mid.x,y2:mid.y},
          {x1:mid.x,y1:mid.y,x2:b.x,y2:b.y}];
}
/* Direction d'un segment ramenée à l'un des huit sens du tracé. */
function dir8(s){
  return {x:Math.sign(s.x2-s.x1), y:Math.sign(s.y2-s.y1)};
}
/* ==========================================================================
   L'angle imposé aux pistes
   --------------------------------------------------------------------------
   Trois règles, choisies dans le panneau *Règles de tracé* et rangées avec le
   document (`S.rule.corner`) :
     « 45 »   le L chanfreiné — la règle de l'art, et le défaut ;
     « 90 »   deux segments orthogonaux, l'angle droit franc ;
     « free » un seul segment, l'angle qu'on veut.
   ========================================================================== */
const CORNER_MODES={"45":"45°","90":"90°","free":"libre"};
function cornerMode(){
  const m=S.rule&&S.rule.corner;
  return CORNER_MODES[m]?m:"45";
}
/* ==========================================================================
   Ce que le routeur fait d'un obstacle
   --------------------------------------------------------------------------
   Les trois conduites du routeur de KiCad, rangées avec le document
   (`S.rule.route`) :
     « shove » pousser  — le cuivre gênant s'écarte, de proche en proche ;
     « walk »  contourner — on se faufile, rien ne bouge ;
     « mark »  signaler — le trajet fautif s'affiche et refuse de se poser.
   Le défaut est « shove », comme dans KiCad. « mark » est l'ancienne conduite
   de cet éditeur : elle reste disponible pour qui veut poser lui-même chaque
   coude, et sert de dernier recours aux deux autres quand rien ne passe.
   ========================================================================== */
const ROUTE_MODES={shove:"pousser le cuivre",walk:"contourner",mark:"signaler"};
function routeMode(){
  const m=S.rule&&S.rule.route;
  return ROUTE_MODES[m]?m:"shove";
}
function setRouteMode(m){
  if(!ROUTE_MODES[m]||m===routeMode())return;
  push();
  S.rule.route=m;
  touch();
  if(S.route)updateRoute(S.mouse.x,S.mouse.y);
  reSync();draw();
  hint("Face à un obstacle : "+ROUTE_MODES[m]+
       (m==="shove"?" — le cuivre voisin s'écarte pour laisser passer."
        :m==="walk"?" — la piste se faufile, rien d'autre ne bouge."
        :" — le trajet fautif est signalé, à vous de le contourner."));
}
/* Longueur en deçà de laquelle un décrochement n'est plus du cuivre utile. Le
   seuil se prend sur la largeur de la piste : un épaulement plus court que la
   piste n'est pas un coude, c'est une écharde de gravure. */
function minJog(w){
  const t=+w;
  return Number.isFinite(t)&&t>0?t:0.3;
}
/* Le coude d'un clic, selon la règle en vigueur. `route45` reste la géométrie
   du chanfrein ; les deux autres règles se posent à côté, sur le même contrat :
   des segments bout à bout, aucun de longueur nulle. `minSeg` est l'aimant
   angulaire — voir `route45` ; l'angle droit s'y range aussi, une marche de
   trois centièmes n'y est pas plus fabricable qu'ailleurs. */
function routeCorner(a,b,posture,mode,minSeg){
  const m=mode||cornerMode();
  const dx=b.x-a.x, dy=b.y-a.y;
  const adx=Math.abs(dx), ady=Math.abs(dy);
  if(adx<1e-9&&ady<1e-9)return [];               // sur place : rien à poser
  if(m==="free")return [{x1:a.x,y1:a.y,x2:b.x,y2:b.y}];
  if(m==="90"){
    if(adx<1e-9||ady<1e-9)return [{x1:a.x,y1:a.y,x2:b.x,y2:b.y}];
    if(minSeg>0&&Math.min(adx,ady)<minSeg)       // marche trop courte : tout droit
      return adx>ady?[{x1:a.x,y1:a.y,x2:b.x,y2:a.y}]
                    :[{x1:a.x,y1:a.y,x2:a.x,y2:b.y}];
    // posture : l'axe le plus long d'abord, ou l'autre
    const mid=posture!==(adx>ady)?{x:b.x,y:a.y}:{x:a.x,y:b.y};
    return [{x1:a.x,y1:a.y,x2:mid.x,y2:mid.y},
            {x1:mid.x,y1:mid.y,x2:b.x,y2:b.y}];
  }
  return route45(a,b,posture,minSeg);
}
/* Les deux départs possibles d'un coude : celui de la posture au repos — l'axe
   le plus avancé — et celui de la posture basculée, diagonale en 45°, axe
   restant en 90°. */
function cornerLegs(a,b,mode){
  const dx=b.x-a.x, dy=b.y-a.y;
  const sx=Math.sign(dx), sy=Math.sign(dy);
  const long=Math.abs(dx)>Math.abs(dy);
  return {droit:{x:long?sx:0, y:long?0:sy},
          autre:mode==="90"?{x:long?0:sx, y:long?sy:0}:{x:sx,y:sy}};
}
/* La posture ne se mémorise pas : elle se recalcule à chaque mouvement de la
   souris. La retenir dans la piste en cours la verrouille — une fois posé un
   segment droit, le chanfrein ne réapparaît plus, et la piste reste en angle
   droit quoi qu'on fasse.
   La règle : la piste **continue dans sa direction** puis tourne. Si le dernier
   segment posé part en diagonale et que la nouvelle diagonale suit le même
   sens, on remet la diagonale devant ; sinon la portion droite passe en
   premier. Deux clics dans le même axe ne font ainsi qu'un seul segment. */
function autoPosture(a,b,prev,mode){
  const m=mode||cornerMode();
  if(!prev||m==="free")return false;
  const dx=b.x-a.x, dy=b.y-a.y;
  const adx=Math.abs(dx), ady=Math.abs(dy);
  if(adx<1e-9||ady<1e-9)return false;                           // rien à départager
  if(m!=="90"&&Math.abs(adx-ady)<1e-9)return false;             // 45° plein : un seul segment
  const {droit,autre}=cornerLegs(a,b,m);
  /* Un départ à l'exact opposé du segment qu'on vient de poser repasse sur son
     cuivre : deux segments bout à bout en sens contraire se recouvrent, et ce
     recouvrement de surface nulle est ce qu'un Gerber ne sait pas rendre.
     L'autre arrangement, lui, quitte le point tout de suite. */
  if(prev.x===-droit.x&&prev.y===-droit.y)return true;
  if(prev.x===-autre.x&&prev.y===-autre.y)return false;
  return prev.x===autre.x&&prev.y===autre.y;                    // on continue la direction
}
/* Posture retenue pour le tracé en cours : celle que la géométrie appelle,
   inversée si l'utilisateur l'a basculée à la main (`/` ou Espace). La bascule
   ne vaut que pour le coude en cours — elle est rendue au dépôt du segment,
   comme le fait KiCad. */
function routePosture(R,b){
  const last=R.done.length?R.done[R.done.length-1]:null;
  return R.flip!==autoPosture(R.pt,b,last?dir8(last):null);
}
/* accroche : une pastille, une extrémité de piste ou un via sur la couche
   active attire le curseur — sans cela, un net « presque » relié est trop facile.
   Une pastille attire depuis son **cuivre**, et non depuis son seul centre : le
   centre d'une pastille de 2 mm est à plus d'un millimètre de son bord, si bien
   qu'arriver dessus ne l'accrochait qu'en visant le milieu. Manqué de peu, le
   point retombait sur le quadrillage — hors de l'axe de la pastille, et court
   d'un rien. C'est `padDist` qui mesure cette distance au cuivre, négative à
   l'intérieur : la portée s'ajoute au bord de la pastille, quelle que soit sa
   taille. Le point rendu reste le centre — c'est là que la piste doit entrer. */
function magnet(x,y,layer,skip){
  const R=px(9);
  let best=null,bd=R;
  for(const fp of S.fps)
    for(const q of padsWorld(fp)){
      if(!padLayers(fp,q).includes(layer))continue;
      const d=padDist(x,y,q);
      if(d<=0)return {x:q.x,y:q.y,net:q.net,pad:true,obj:q};
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
   plus rien ne dépasse. Quelques passes suffisent, même dans un couloir.
   Le balayage des trois listes est passé dans l'index (`11-pns-node.js`), et
   surtout : **on ne fuit plus que ce qui ne s'écarte pas**. En mode
   « pousser », une piste ou un via gênants vont s'effacer d'eux-mêmes ; en
   repoussant le curseur par-dessus, on ferait deux fois le même travail, l'un
   contre l'autre, et l'arrivée fuirait le cuivre que le shove vient justement
   de dégager. Une pastille, elle, ne bouge jamais, sous aucun mode. */
function pushClear(pt,l,net,w){
  if(!S.avoid||!net)return {x:pt.x,y:pt.y,pushed:false};
  const dur=routeMode()==="shove"?"P":"PSV";
  const N=pnsWorld();
  let p={x:pt.x,y:pt.y}, moved=false;
  for(let k=0;k<8;k++){
    const sonde=pnsItemSeg(l,net,w,p.x,p.y,p.x,p.y,null);
    let best=null;
    for(const o of N.colliding(sonde)){
      if(dur.indexOf(o.k)<0)continue;
      const e=pnsPointEscape(o,p,net,w);
      if(e&&(!best||e.def>best.def))best=e;
    }
    if(!best)break;
    p={x:r3(p.x+best.dx*(best.def+0.005)),y:r3(p.y+best.dy*(best.def+0.005))};
    moved=true;
  }
  return {x:p.x,y:p.y,pushed:moved};
}
/* Le point repoussé ne garantit pas le segment : on vérifie le trajet complet.
   `skip` réunit ce qui bouge avec le segment examiné : deux morceaux emmenés par
   le même geste ne se gênent pas entre eux, ils gardent leur écart.
   Le balayage des trois listes est passé dans le modèle du monde
   (`11-pns-node.js`) : même mesure, même tolérance — celle du DRC, désormais,
   et non plus un dixième de micron plus large — mais interrogée par l'index
   spatial au lieu de la carte entière. Le glissement d'une piste sur une carte
   chargée ne balaie plus dix mille pastilles à chaque pixel.
   Le geste peut muter du cuivre sans passer par `touch()` : c'est sans danger
   ici, tout ce qu'il déplace étant justement dans `skip`. */
function segClearBad(s,l,net,w,ignoreObj,skip){
  const sk=new Set(skip||[]);
  if(ignoreObj)sk.add(ignoreObj);
  sk.add(s);                          // une piste ne se gêne jamais elle-même
  return pnsWorld().segBad(s,l,net,w,sk);
}
/* ==========================================================================
   L'anti-collision pendant un glissement
   --------------------------------------------------------------------------
   Le routeur refuse d'avancer sous l'isolation ; le glissement, lui, ne
   regardait rien : on traversait un boîtier entier sans qu'un seul avertissement
   ne se lève, et il ne restait que le DRC, après coup, pour le dire. Le cuivre
   tiré bute donc maintenant sur l'obstacle — le geste s'arrête là et reprend dès
   qu'on repart de l'autre côté.
   Deux précautions. On ne juge que ce qui était propre AVANT le geste : une
   carte déjà en faute doit rester réparable à la main, et non se figer. Et ce
   que le geste emmène ne se juge pas contre lui-même — sinon un coude collerait
   à son propre voisin dès le premier millimètre.
   ========================================================================== */
function moveClearBad(list,was,skip){
  const bad=new Set();
  if(!S.avoid)return bad;
  for(const t of list){
    if(!t.net||(was&&was.has(t)))continue;
    if(dist(t.x1,t.y1,t.x2,t.y2)<1e-9)continue;      // replié : plus de cuivre à juger
    /* Une piste circulaire se juge corde par corde, comme dans le modèle du
       monde : sa corde unique passerait à côté de tout ce que son ventre frôle. */
    let mauvais=false;
    for(const c of trkSegs(t)){
      c.src=t;
      if(segClearBad(c,t.l,t.net,t.w,null,skip)){mauvais=true;break;}
    }
    if(mauvais)bad.add(t);
  }
  return bad;
}
/* Le même verdict pour les VIAS que le geste emmène. Ils ne s'y trouvaient pas :
   `moveClearBad` ne parcourait que des pistes, et un via tiré à la main entrait
   donc dans le cuivre du voisin — ou dans un autre via — sans qu'un seul
   avertissement ne se lève. La pose, elle, refusait déjà ; le glissement
   contournait le contrôle par la porte de derrière, et c'est de loin le geste le
   plus courant pour placer un via de masse à l'endroit voulu.
   La raison est gardée avec le fautif : c'est elle que le bandeau montrera, et
   elle est déjà écrite en clair par `viaObstacle`. */
function moveViaBad(list,was,skip){
  const bad=new Map();
  if(!S.avoid)return bad;
  for(const v of list){
    if(was&&was.has(v))continue;
    const gene=viaObstacle(v,null,skip);
    if(gene)bad.set(v,gene);
  }
  return bad;
}
/* Tout le cuivre qu'un geste peut réécrire : la sélection étendue, les
   articulations et les coudes qu'elles replient. */
function movedTracks(){
  const set=new Set();
  for(const o of drag.trk||[])set.add(o.t);
  for(const j of drag.joints||[]){
    for(const o of j.ends)set.add(o.t);
    for(const w of (j.slide?j.slide.walls:[]))
      if(w.near)for(const o of w.near)set.add(o.t);
  }
  return set;
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
  // le point de départ sert d'ancre : depuis un centre de pastille hors grille,
  // le quadrillage seul ferait sortir la piste de travers dès le premier segment
  const a=S.route?S.route.pt:null;
  const p=pushClear({x:snapXn(x,a?a.x:null),y:snapYn(y,a?a.y:null)},l,net,w);
  return {x:p.x,y:p.y,net:null,pushed:p.pushed};
}
function startRoute(x,y,exact){
  const t=exact?{x:r3(x),y:r3(y),
                 net:(netAtPoint(x,y,S.active)||{}).net||""}:routeTarget(x,y);
  const net=t.net||"";
  /* `snap` : l'état de la carte avant le geste. Le shove déplace du cuivre dès
     le premier clic ; sans cet instantané, ni l'abandon ni le Ctrl+Z ne
     sauraient le remettre en place. */
  S.route={layer:S.active,net,w:defaultWidth(net),
           pt:{x:t.x,y:t.y},done:[],vias:[],preview:[],flip:false,bad:false,pushed:false,
           shove:null,shoved:false,snap:serialize()};
  if(net)buildList();
  /* Un départ qui n'accroche rien donne une piste SANS NET, et une piste sans
     net n'est reliée à personne : le chevelu la compte toujours comme non
     routée, l'anti-collision se tait — un net vide n'a pas d'isolation à
     défendre — et le DRC en fait trois défauts après coup. On visait la
     pastille et on l'a manquée de peu : l'aimant ne porte que sur quelques
     pixels d'écran, et le cuivre posé passe alors À CÔTÉ de la pastille au lieu
     d'entrer dedans. C'était silencieux ; ça se dit maintenant, au moment où
     c'est encore rattrapable d'un Échap. */
  if(!net){
    hint("Départ sur rien : cette piste n'aura aucun net, et ne reliera donc "+
         "rien. Échap pour reprendre — visez le cuivre de la pastille, du via "+
         "ou du bout de piste à prolonger.");
    return;
  }
  hint("Clic pour poser un coude · « / » bascule la posture du coude · V pose un via et "+
       "change de couche · touches 1-8 : couche · Échap termine.");
}
/* L'aimant angulaire ne joue qu'en l'air. Une arrivée ancrée — pastille, via,
   bout de piste — se pose au point exact : déplacer l'arrivée de quelques
   centièmes pour effacer un décrochement raterait le centre visé, et la liaison
   avec elle. Le décrochement qui subsiste au pied d'une pastille hors grille,
   c'est le contrôle DRC qui le dit, après coup. */
function routeJog(R,t){
  return (t&&(t.obj||t.net))?0:minJog(R.w);
}
/* ==========================================================================
   Le trajet d'un clic
   --------------------------------------------------------------------------
   Le coude à 45° du clic donne la route directe. Si elle est libre, c'est
   celle-là, et il n'y a rien à décider. Sinon la règle en vigueur
   (`S.rule.route`) dit quoi faire :

     « shove » on demande au cuivre gênant de s'écarter (`pnsShove`). En cas
               d'échec — un couloir sans issue, une pastille des deux côtés —
               on se rabat sur le contournement, puis sur le signalement ;
     « walk »  on se faufile seulement (`pnsWalkaround`) ;
     « mark »  on ne tente rien : le trajet fautif s'affiche et refuse de se
               poser. C'est l'ancienne conduite de l'éditeur.

   Le résultat du shove n'est pas appliqué ici : il voyage dans `R.shove`
   jusqu'au clic, et c'est `stepRoute` qui le verse. Tant que la souris bouge,
   ce n'est qu'un aperçu — que le rendu dessine, pour qu'on voie le cuivre
   s'écarter avant de s'engager.
   ========================================================================== */
function routeSegsTo(R,t){
  const seg=s=>Object.assign({l:R.layer},s);
  // `jog` imposé : c'est la saisie au clavier qui décide, pas l'aimant angulaire
  const jog=(t&&t.jog!=null)?t.jog:routeJog(R,t);
  const direct=routeCorner(R.pt,{x:t.x,y:t.y},routePosture(R,t),null,jog);
  if(!direct.length)return {segs:[],bad:false};
  if(!S.avoid||!R.net)return {segs:direct.map(seg),bad:false};
  const N=pnsWorld();
  // l'arrivée accrochée est une destination, pas un obstacle
  const skip=new Set();
  if(t&&t.obj)skip.add(t.obj);
  const line={l:R.layer,net:R.net,w:R.w,pts:pnsPts(direct)};
  if(!N.firstObstacle(line,skip))return {segs:direct.map(seg),bad:false};
  const mode=routeMode();
  if(mode==="shove"){
    const r=pnsShove(N,line,skip,Date.now());
    if(r.ok)
      return {segs:pnsSegs(r.pts).map(seg),bad:false,
              contourne:pnsLen(r.pts)>pnsLen(line.pts)+1e-6,shove:r};
  }
  if(mode!=="mark"){
    const tour=pnsWalkaround(N,line,skip);
    if(tour.ok)return {segs:pnsSegs(tour.pts).map(seg),bad:false,contourne:true};
  }
  return {segs:direct.map(seg),bad:true};
}
function updateRoute(x,y){
  const R=S.route;
  if(!R)return;
  const t=routeTarget(x,y);
  const r=routeSegsTo(R,t);
  R.preview=r.segs;
  R.end=t;R.pushed=!!t.pushed;R.contourne=!!r.contourne;R.shove=r.shove||null;
  const last=R.preview[R.preview.length-1];
  if(last){R.end.x=last.x2;R.end.y=last.y2;}     // l'aimant a pu déplacer l'arrivée
  R.bad=r.bad;
}
/* même chose qu'updateRoute, mais vers un point imposé : c'est la saisie au
   clavier qui décide, pas le curseur */
function routeToPoint(pt){
  const R=S.route;
  if(!R)return;
  const at=netAtPoint(pt.x,pt.y,R.layer);
  const t={x:pt.x,y:pt.y,net:(at||{}).net||null,pad:false,jog:at?0:minJog(R.w)};
  const r=routeSegsTo(R,t);
  R.preview=r.segs;
  const last=R.preview[R.preview.length-1];
  R.end={x:last?last.x2:pt.x,y:last?last.y2:pt.y,net:t.net,pad:false};
  R.pushed=false;R.contourne=!!r.contourne;R.shove=r.shove||null;
  R.bad=r.bad;
}
function stepRoute(){
  const R=S.route;
  if(!R||!R.preview.length)return;
  if(R.bad){
    hint("Ce trajet passe sous l'isolation de "+fmt(classOf(R.net).clr,2)+
         " mm : contournez l'obstacle, ou coupez l'anti-collision pour forcer.");
    return;
  }
  /* Le cuivre que le shove a écarté se pose ici, en même temps que le trajet
     qui l'a poussé : l'aperçu devient la carte. */
  /* L'optimiseur ne nettoie que ce que le ROUTEUR a produit — un tour
     d'enveloppe, une poussée. Un coude posé au doigt est une intention, pas un
     détour : le raccourcir serait manger le clic de l'utilisateur. */
  const auto=!!R.contourne||!!R.shove;
  if(R.shove&&pnsApply(R.shove)){R.shoved=true;R.shove=null;refreshPanels();}
  for(const s of R.preview)R.done.push(s);
  const last=R.preview[R.preview.length-1];
  R.pt={x:last.x2,y:last.y2};
  R.preview=[];
  /* Le coude qu'on vient de figer repasse à l'optimiseur : un tour d'enveloppe
     laisse des sommets dont plus rien ne justifie l'existence une fois
     l'obstacle passé. C'est ce qui donne au tracé son allure finie. */
  if(auto)routeOptimizeTail(R);
  R.flip=false;                  // la bascule ne valait que pour ce coude
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
  /* Le via refusé ne fait pas changer de couche : sans ce garde-fou la piste
     repartait sur l'autre face sans rien pour l'y amener. */
  if(!placeVia(R.pt.x,R.pt.y,R.net,Math.min(R.layer,other),Math.max(R.layer,other),true))return;
  R.layer=other;S.active=other;
  buildTabs();buildLayers();refreshPanels();
}
function routeToLayer(i){
  const R=S.route;
  if(!R){setActive(i);return;}
  if(i===R.layer)return;
  if(!placeVia(R.pt.x,R.pt.y,R.net,Math.min(R.layer,i),Math.max(R.layer,i),true))return;
  R.layer=i;setActive(i);
}
/* Le via tel qu'il sera posé : diamètre et perçage de la classe du net, plage de
   couches ramenée à la carte entière quand elle est dégénérée. Séparé de la
   pose pour que l'anti-collision puisse le juger AVANT qu'il existe. */
function mkVia(x,y,net,a,b){
  const cl=classOf(net||"");
  const v={x:r3(x),y:r3(y),d:cl.via,drill:viaDrill(cl),
           a:a==null?0:a,b:b==null?S.cu-1:b,net:net||""};
  if(v.a===v.b){v.a=0;v.b=S.cu-1;}
  return v;
}
/* ==========================================================================
   L'anti-collision, pour un via
   --------------------------------------------------------------------------
   Le trajet d'une piste ne dit rien de la rondelle qu'on pose au bout. Un via
   est plus large que la piste qui l'amène — 0,8 mm contre 0,3 — et il traverse
   TOUTES les couches de sa plage, où d'autre cuivre passe peut-être. Un passage
   libre pour la piste ne l'est donc pas pour son via, et jusqu'ici rien ne le
   disait : la touche V posait le cuivre par-dessus le voisin, et il fallait
   attendre le contrôle DRC pour l'apprendre.

   DEUX règles, et non une, car elles ne disent pas la même chose :

     · l'**isolation**, entre nets DIFFÉRENTS seulement — deux cuivres déjà
       reliés n'ont rien à tenir l'un vis-à-vis de l'autre. C'est ce que le
       monde du routeur mesure, avec `pnsPairGap`, exactement comme le DRC ;
     · le **trou à trou**, qui ne regarde AUCUN net. Deux perçages qui se
       rejoignent ne font pas deux vias : ils font un seul trou déchiré, que le
       foret casse. C'est vrai de deux vias de masse comme de deux nets
       étrangers, et c'est la règle qui manquait — l'isolation, en s'annulant
       d'office au sein d'un net, laissait passer deux vias l'un dans l'autre.

   Chacune rend sa gêne en clair, ou "" quand la place est libre.
   ========================================================================== */
function viaIsole(v,nets,skip){
  /* Une piste sans net ne se fait pas juger (`routePush`, `segClearBad`) : c'est
     du cuivre libre, dessiné exprès, et le programme n'a pas à en décider. Un
     via sans net, lui, n'est pas un dessin : c'est un via dont le net n'a pas
     été reconnu — l'outil « Via » cliqué à côté du cuivre en pose un à chaque
     fois. L'exempter revenait à laisser poser un via en plein milieu d'une
     piste étrangère sans un mot, ce qui n'est jamais ce qu'on voulait. Il se
     juge donc comme les autres, à l'isolation de la classe par défaut, que
     `clrPair` rend déjà pour un net vide. */
  const probe=pnsItemVia(v);
  /* Les deux nets d'une paire différentielle ne se gênent pas l'un l'autre :
     leur écartement, c'est l'éventail qui le tient, et il le tient au plus
     juste. Sans cette réunion le second via de la paire se verrait refuser par
     le premier. */
  if(nets)probe.nets=nets;
  let pire=null;
  for(const it of pnsWorld().colliding(probe,skip)){
    const g=pnsPairGap(probe,it);
    if(!pire||g<pire.g)pire={it:it,g:g};
  }
  if(!pire)return "";
  const it=pire.it;
  const quoi=it.k==="V"?("d'un via "+(it.net?"de "+it.net:"sans net")):
             it.k==="P"?("de la pastille "+it.fp.ref+"."+it.q.n):
                        ("de la piste "+(it.net||"sans net"));
  return "à "+fmt(Math.max(0,pire.g),3)+" mm "+quoi+", l'isolation en exige "+
         fmt(pnsClr(it,v.net,"via"),3)+" mm";
}
/* Le trou à trou. La fenêtre d'interrogation se prend sur le CUIVRE du via,
   élargi de la règle : la rondelle d'un objet enveloppe toujours son perçage,
   donc deux trous à portée ont forcément leurs rondelles à portée. Rien ne peut
   échapper à cette fenêtre, et elle reste petite. */
function viaTrou(v,skip){
  if(!(v.drill>0))return "";
  const h=holeClr(), r=v.d/2+h;
  let pire=null;
  for(const it of pnsWorld().query(v.a,v.b,v.x-r,v.y-r,v.x+r,v.y+r)){
    /* On interroge l'index en direct, sans passer par `colliding` : le tri de
       ce qu'un geste emmène est donc à refaire ici, à l'identique. */
    if(skip&&(skip.has(it)||(it.src&&skip.has(it.src))||(it.fp&&skip.has(it.fp))))continue;
    let d=0,cx=0,cy=0,qui="";
    if(it.k==="V"){d=it.v.drill;cx=it.v.x;cy=it.v.y;
      qui="d'un autre via"+(it.net?" ("+it.net+")":"");}
    else if(it.k==="P"&&it.q.drill>0){d=it.q.drill;cx=it.q.x;cy=it.q.y;
      qui="du perçage de "+it.fp.ref+"."+it.q.n;}
    else continue;
    const e=dist(v.x,v.y,cx,cy)-v.drill/2-d/2;
    if(e>=h-1e-6)continue;
    if(!pire||e<pire.e)pire={e:e,qui:qui};
  }
  if(!pire)return "";
  return "à "+fmt(Math.max(0,pire.e),3)+" mm de trou à trou "+pire.qui+
         ", la règle en exige "+fmt(h,3)+" mm";
}
/* Les deux vias d'une même paire différentielle. `viaIsole` ne peut pas s'en
   charger : il mesure à `clrPair`, qui rend entre deux nets appariés l'écart
   serré de la règle de paire — celui des PISTES. Sur deux vias c'est
   l'isolation ordinaire qui vaut, et `dpViaGap` dit pourquoi. Cette cote-là est
   aussi celle que le contrôle applique (`dpDrc`) : le geste et le contrôle ne
   peuvent pas juger différemment. */
function viaPaire(v,skip){
  const pair=v.net?dpOfNet(v.net):null;
  if(!pair)return "";
  const jumeau=pair.p===v.net?pair.n:pair.p;
  const g=dpViaGap(pair), r=v.d/2+g;
  let pire=null;
  for(const it of pnsWorld().query(v.a,v.b,v.x-r,v.y-r,v.x+r,v.y+r)){
    if(it.k!=="V"||it.net!==jumeau)continue;
    if(skip&&(skip.has(it)||(it.src&&skip.has(it.src))))continue;
    const e=dist(v.x,v.y,it.v.x,it.v.y)-v.d/2-it.v.d/2;
    if(e>=g-1e-6)continue;
    if(!pire||e<pire.e)pire={e:e};
  }
  if(!pire)return "";
  return "à "+fmt(Math.max(0,pire.e),3)+" mm du via de "+jumeau+
         ", l'isolation en exige "+fmt(g,3)+" mm";
}
function viaObstacle(v,nets,skip){
  if(!S.avoid)return "";
  return viaIsole(v,nets,skip)||viaPaire(v,skip)||viaTrou(v,skip);
}
function placeVia(x,y,net,a,b,inRoute,nets){
  if(S.cu<2){hint("Une seule couche de cuivre : un via n'aurait rien à relier.");return null;}
  const v=mkVia(x,y,net,a,b);
  const gene=viaObstacle(v,nets);
  if(gene){
    hint("Via refusé : il passerait "+gene+". Décalez-le, ou coupez "+
         "l'anti-collision pour forcer.");
    return null;
  }
  if(!inRoute)push();
  S.vias.push(v);
  if(S.route)S.route.vias.push(v);
  touch();
  return v;
}
/* Deux segments bout à bout dans le même axe ne font qu'une ligne droite : la
   coupure ne veut rien dire. Le routeur pose pourtant un segment par clic — et
   route45 en pose deux, la portion droite puis la diagonale. Suivre une même
   direction sur trois clics laissait donc trois morceaux là où l'œil, le
   fichier et le DRC ne voient qu'un trait.
   `sameLine` reconnaît la suite d'une ligne : même couche, bout à bout, même
   direction — et rien au coude qui justifie de garder la césure. Un via en est
   une : il ancre le changement de couche, et on doit pouvoir le tirer. */
function sameLine(a,b){
  if(a.l!==b.l||isArc(a)||isArc(b))return false;
  if(Math.abs(a.x2-b.x1)>1e-9||Math.abs(a.y2-b.y1)>1e-9)return false;
  const u={x:a.x2-a.x1,y:a.y2-a.y1}, v={x:b.x2-b.x1,y:b.y2-b.y1};
  if(Math.abs(crossN(u,v))>1e-6)return false;       // pas le même axe
  if(u.x*v.x+u.y*v.y<=0)return false;               // repli sur soi : ce n'est pas une suite
  return !viaAt(a.l,a.x2,a.y2);
}
function commitRoute(){
  const R=S.route;
  S.route=null;
  if(!R)return;
  if(!R.done.length&&!R.shoved){touch();draw();return;}
  pushSnap(R.snap);
  let prev=null;
  const posed=[];
  for(const s of R.done){
    const t={l:s.l,net:R.net,w:R.w,x1:r3(s.x1),y1:r3(s.y1),x2:r3(s.x2),y2:r3(s.y2)};
    // l'arrondi au micron peut avaler un segment : rien à poser, et un segment
    // de longueur nulle salit le .json comme le Gerber
    if(t.x1===t.x2&&t.y1===t.y2)continue;
    if(prev&&sameLine(prev,t)){prev.x2=t.x2;prev.y2=t.y2;continue;}
    S.tracks.push(t);prev=t;posed.push(t);
  }
  chamferPosed(posed);
  touch();refreshPanels();draw();
}
/* ==========================================================================
   L'angle droit que le routeur laissait derrière lui
   --------------------------------------------------------------------------
   `routeCorner` ne connaît que sa propre jambe : celle du clic en cours. Un
   clic franchement horizontal ne pose qu'un segment, un clic franchement
   vertical de même — et les deux mis bout à bout font un angle droit franc, en
   plein dans la règle « 45 » qui dit le L chanfreiné. C'est l'angle que la
   touche D sert à rattraper à la main ; il n'y a pas de raison de le poser.
   On le rattrape au dépôt, sur les coudes que le trajet vient de former — y
   compris celui de son départ, là où il rejoint le cuivre déjà en place.
   `mitreAt` refuse de lui-même ce qui ne s'y prête pas : une pastille ou un via
   au coude, deux largeurs différentes, un chanfrein plus court que la piste. Le
   coude reste alors tel quel, et c'est au contrôle DRC de le dire.
   Le chanfrein posé ici est **borné** (`MITRE_AUTO`) : il casse l'angle sans
   déplacer le coude. Maximal, il aurait remplacé les deux jambes par la plus
   grande diagonale possible — et le clic qui avait posé ce coude aurait
   disparu. C'est la touche D qui donne le chanfrein maximal, sur demande.
   Le chanfrein ne fait que couper l'intérieur du coude : il n'approche aucun
   voisin, et ne peut donc pas créer de faute d'isolation là où il n'y en avait
   pas. La sélection, elle, n'a rien à voir avec un dépôt : on la remet comme on
   l'a trouvée, `mitreAt` ayant l'habitude d'y ranger ce qu'il chanfreine.
   Le glissement passe par la même porte, au relâchement — voir
   `pruneAfterDrag`. « Posé » s'y lit donc « ce que le geste vient d'écrire ». */
function chamferPosed(posed){
  if(cornerMode()!=="45"||!posed.length)return;
  const keep=[...S.sel.tracks];
  const seen=new Set(), pts=[];
  for(const t of posed)
    for(const en of [1,2]){
      const x=en===1?t.x1:t.x2, y=en===1?t.y1:t.y2, k=anchorKey(t.l,x,y);
      if(seen.has(k))continue;
      seen.add(k);pts.push({l:t.l,x,y});
    }
  for(const p of pts)mitreAt(p.l,p.x,p.y,false,MITRE_AUTO);
  S.sel.tracks.clear();
  for(const t of keep)if(S.tracks.indexOf(t)>=0)S.sel.tracks.add(t);
}
function cancelRoute(){
  const R=S.route;
  if(!R)return;
  S.route=null;
  /* Le shove a déjà écarté du cuivre : abandonner le tracé doit le remettre où
     il était. On repart de l'instantané du départ — une poussée s'étant
     propagée de proche en proche, c'est le seul retour sûr. */
  if(R.shoved&&R.snap){loadDoc(JSON.parse(R.snap),true);return;}
  for(const v of R.vias){const i=S.vias.indexOf(v);if(i>=0)S.vias.splice(i,1);}
  touch();draw();
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
  refreshPanels();reSync();draw();
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
  touch();reSync();refreshPanels();draw();
  hint("Origine posée en "+fmt(S.origin.x,2)+" ; "+fmt(S.origin.y,2)+
       (m?" (sur une pastille)":"")+" — la grille et les coordonnées la suivent.");
}

/* ==========================================================================
   Souris
   ========================================================================== */
let drag=null;
const PTR_PCB=new Map();
let PINCH_PCB=null;
let LONGPRESS_TIMER=null;
let LONGPRESS_START=null;
function cancelLongpress(){
  if(LONGPRESS_TIMER){clearTimeout(LONGPRESS_TIMER);LONGPRESS_TIMER=null;}
  LONGPRESS_START=null;
}
function evPos(e){
  const r=cv.getBoundingClientRect();
  return s2w(e.clientX-r.left,e.clientY-r.top);
}
cv.addEventListener("pointerdown",e=>{
  PTR_PCB.set(e.pointerId,{x:e.clientX,y:e.clientY,type:e.pointerType});
  if(e.pointerType!=="mouse"&&e.cancelable)e.preventDefault();

  // deux doigts : pincement pour zoomer et translater
  if(PTR_PCB.size===2){
    cancelLongpress();
    drag=null;
    if(S.silkDraft)S.silkDraft=null;
    const [p1,p2]=[...PTR_PCB.values()];
    const d=Math.max(1,Math.hypot(p1.x-p2.x,p1.y-p2.y));
    const mx=(p1.x+p2.x)/2, my=(p1.y+p2.y)/2;
    PINCH_PCB={d:d,mx:mx,my:my,scale:S.scale,ox:S.ox,oy:S.oy};
    return;
  }
  if(PTR_PCB.size>2)return;

  // appui long (tactile) : déclenche menu contextuel / annulation
  if(e.pointerType==="touch"&&e.button===0){
    cancelLongpress();
    LONGPRESS_START={x:e.clientX,y:e.clientY,id:e.pointerId};
    LONGPRESS_TIMER=setTimeout(()=>{
      LONGPRESS_TIMER=null;
      if(typeof document!=="undefined"&&document.body){
        const rip=document.createElement("div");
        rip.className="longpress-ripple";
        rip.style.left=e.clientX+"px";
        rip.style.top=e.clientY+"px";
        document.body.appendChild(rip);
        setTimeout(()=>{if(rip.parentNode)rip.parentNode.removeChild(rip);},500);
      }
      if(S.route){commitRoute();draw();}
      else if(S.silkDraft){S.silkDraft=null;draw();}
      else if(S.zoneDraft){closeZone();draw();}
      else if(S.edgeDraft){closeEdge();draw();}
      else{
        try{
          cv.dispatchEvent(new MouseEvent("contextmenu",{bubbles:true,cancelable:true,clientX:e.clientX,clientY:e.clientY,button:2}));
        }catch(_){}
      }
    },550);
  }

  // la capture échoue si le pointeur n'est plus actif : ce n'est pas une raison
  // pour abandonner le clic
  try{cv.setPointerCapture(e.pointerId);}catch(_){}
  /* Le canevas n'est pas un élément focusable : cliquer dessus ne retire pas le
     focus du champ qu'on vient de quitter. Or les raccourcis d'une seule touche
     se taisent dès qu'un champ a le focus — sans quoi taper « 0,3 » dans
     l'isolation basculerait de couche. Le focus restait donc sur le dernier
     réglage touché, et D, R, F, T, S ne répondaient plus du reste de la
     séance : la touche partait bien, le garde-fou la mangeait. On rend la main
     au plan de travail dès le clic — le champ quitté valide sa saisie au
     passage, comme il le ferait n'importe où ailleurs sur la page. */
  const af=document.activeElement;
  if(isField(af)&&af.blur)af.blur();
  const p=evPos(e);
  if(e.button===1||(e.button===0&&e.altKey&&!altTarget(p.x,p.y))){
    drag={pan:true,sx:e.clientX,sy:e.clientY,ox:S.ox,oy:S.oy};
    return;
  }
  if(e.button!==0)return;
  if(S.mode==="mesure"){rpMesClic(p.x,p.y);draw();return;}
  /* DÉSIGNER UNE BORNE DE CHUTE CONTINUE. Le panneau de simulation arme
     l'attente ; le clic suivant choisit la pastille et rend la main au mode
     « sélection ». Le test passe par `typeof` parce que 19-simulation.js est
     chargé APRÈS ce fichier — et parce qu'un banc d'essai peut ne pas le
     charger du tout. */
  if(typeof SIM_DCB!=="undefined"&&SIM_DCB&&SIM_DCB.attente){
    simDCClic(p.x,p.y);draw();return;
  }
  if(S.mode==="silk"){
    if(!S.silkDraft){
      const sx=snapX(p.x), sy=snapY(p.y);
      S.silkDraft={x1:sx,y1:sy,x2:sx,y2:sy,dragging:true};
    }else{
      const sx=snapX(p.x), sy=snapY(p.y);
      if(dist(S.silkDraft.x1,S.silkDraft.y1,sx,sy)>1e-4){
        push();
        const layer=(S.flip||S.active===S.cu-1)?"silkB":"silkT";
        const sh=S.silkShape||"line";
        const d={
          id:S.nextId++,
          shape:sh,
          type:sh,
          layer:layer,
          x1:S.silkDraft.x1, y1:S.silkDraft.y1,
          x2:sx, y2:sy,
          width:0.15
        };
        S.drawings.push(d);
        clearSel();
        if(!S.sel.drawings)S.sel.drawings=new Set();
        S.sel.drawings.add(d.id);
        S.silkDraft=null;
        touch();refreshPanels();draw();
      }
    }
    draw();return;
  }
  if(S.mode==="track"){
    if(!S.route)startRoute(p.x,p.y);
    else{updateRoute(p.x,p.y);stepRoute();}
    draw();return;
  }
  if(S.mode==="dpair"){
    if(!S.dp){if(dpStart(p.x,p.y))dpUpdate(p.x,p.y);}
    else{dpUpdate(p.x,p.y);dpStep();}
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
    /* La gomme ne prend pas une zone par son plein : un plan couvre la carte,
       et le clic destiné à une piste emporterait le cuivre de toute la couche.
       Son contour, lui, reste une cible franche. */
    const h=hitTest(p.x,p.y,e);
    if(h&&!h.inside){
      push();
      if(h.fp)S.fps=S.fps.filter(f=>f!==h.fp);
      else if(h.track)S.tracks=S.tracks.filter(t=>t!==h.track);
      else if(h.via)S.vias=S.vias.filter(v=>v!==h.via);
      else if(h.drawing)S.drawings=S.drawings.filter(d=>d!==h.drawing);
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
  /* sélection : les extrémités d'une piste ou d'un trait déjà sélectionné passent devant tout */
  if(!e.shiftKey&&S.sel.drawings)
    for(const d of selDrawingsPcb()){
      for(const en of [1,2]){
        const ex=en===1?d.x1:d.x2, ey=en===1?d.y1:d.y2;
        if(dist(p.x,p.y,ex,ey)<=px(6)){
          drag={drawingEnd:{d,e:en},moved:false,at:{x:ex,y:ey}};
          return;
        }
      }
    }
  if(!e.shiftKey)
  for(const t of S.sel.tracks){
    for(const en of [1,2]){
      const ex=en===1?t.x1:t.x2, ey=en===1?t.y1:t.y2;
      if(dist(p.x,p.y,ex,ey)<=px(6)){
        // Alt : on détache cette extrémité au lieu d'emmener tout le coude
        const g=e.altKey?{ends:[{t,e:en}],vias:[]}:jointAt(ex,ey,t.l);
        drag={tend:g,l:t.l,moved:false,at:{x:ex,y:ey}};
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
        drag={tend:{ends:[{t,e:2},{t:nt,e:1}],vias:[]},l:t.l,moved:true,at:{x:pt.x,y:pt.y}};
        armClear([t,nt],[],[]);
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
  if(!e.shiftKey && !e.ctrlKey && !e.metaKey && typeof simRetourClicPcb === "function" && simRetourClicPcb(p.x, p.y)){
    draw(); return;
  }
  const h=hitTest(p.x,p.y,e);
  /* Maj+clic sur une piste : c'est la piste entière qui est prise, et le
     doublé l'étend à toutes les couches (`selectRun`). Ailleurs — empreinte,
     via, zone, vide — Maj garde son rôle d'ajout, comme Ctrl. */
  if(e.shiftKey&&h&&h.track){
    selectRun(h.track,e);
    const tn=h.track.net||null;
    if(tn){S.hlNet=tn;revealNet(tn);}
    drag={move:true,x:p.x,y:p.y,moved:false,dx:0,dy:0,
          trk:null,via:null,joints:null};
    refreshPanels();draw();return;
  }
  // Ctrl et Maj font la même chose : ajouter à la sélection, ou en retirer
  const add=e.shiftKey||e.ctrlKey||e.metaKey;
  if(h && h.fpText) {
    if(!add) {clearSel();S.hlNet=null;}
    S.hlText = h;
    drag={moveText:h, x:snapX(p.x), y:snapY(p.y), moved:false};
    refreshPanels();draw();return;
  }
  /* Rien sous le curseur — ou seulement le plein d'une zone pas encore prise :
     dans les deux cas on arme le lasso. S'il ne s'ouvre pas, le relâchement le
     lit comme un clic et prend la zone. Un plan pleine carte se sélectionne
     ainsi d'un clic n'importe où, sans coûter le lasso qu'on tire par-dessus ;
     une fois pris, il se glisse comme n'importe quel autre objet. */
  if(!h||(h.inside&&!S.sel.zones.has(h.zone))){
    if(!add){clearSel();S.hlNet=null;}
    S.marquee={x1:p.x,y1:p.y,x2:p.x,y2:p.y};
    drag={marquee:true,add:add,zone:h?h.zone:null};
    refreshPanels();draw();return;
  }
  if(add){
    if(toggleHit(h)){refreshPanels();draw();return;}   // retiré : pas de glissement
  }else{
    const already=(h.fp&&S.sel.fps.has(h.fp.id))||(h.track&&S.sel.tracks.has(h.track))||
                  (h.via&&S.sel.vias.has(h.via))||
                  (h.drawing&&S.sel.drawings&&S.sel.drawings.has(h.drawing.id));
    if(!already)selectHit(h,false);
  }
  const pn=(h.pad&&h.pad.net)||null;
  if(pn)S.hlNet=pn;
  drag={move:true,x:p.x,y:p.y,moved:false,dx:0,dy:0,
        trk:null,via:null,joints:null};
  refreshPanels();
  // la mise en avant se voit sur le canevas : on la montre aussi dans la liste
  if(pn)revealNet(pn);
  draw();
});
cv.addEventListener("pointermove",e=>{
  if(PTR_PCB.has(e.pointerId))PTR_PCB.set(e.pointerId,{x:e.clientX,y:e.clientY,type:e.pointerType});

  if(LONGPRESS_TIMER&&LONGPRESS_START){
    if(Math.hypot(e.clientX-LONGPRESS_START.x,e.clientY-LONGPRESS_START.y)>10){
      cancelLongpress();
    }
  }

  // deux doigts : pincement pour zoomer et déplacer la vue
  if(PINCH_PCB&&PTR_PCB.size>=2){
    const [a,b]=[...PTR_PCB.values()];
    const d=Math.max(1,Math.hypot(a.x-b.x,a.y-b.y));
    const r=cv.getBoundingClientRect();
    const k=Math.max(0.6/PINCH_PCB.scale,Math.min(80/PINCH_PCB.scale,d/PINCH_PCB.d));
    const mx=PINCH_PCB.mx-r.left, my=PINCH_PCB.my-r.top;
    S.scale=PINCH_PCB.scale*k;
    S.ox=mx-(mx-PINCH_PCB.ox)*k+((a.x+b.x)/2-PINCH_PCB.mx);
    S.oy=my-(my-PINCH_PCB.oy)*k+((a.y+b.y)/2-PINCH_PCB.my);
    draw();return;
  }

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
  if(drag&&drag.drawingEnd){
    const d=drag.drawingEnd.d, en=drag.drawingEnd.e;
    const nx=snapX(p.x), ny=snapY(p.y);
    if(nx!==drag.at.x||ny!==drag.at.y){
      if(!drag.moved){push();drag.moved=true;}
      if(en===1){d.x1=nx;d.y1=ny;}
      else{d.x2=nx;d.y2=ny;}
      drag.at={x:nx,y:ny};
      touch();refreshPanels();draw();
    }
    return;
  }
  if(drag&&drag.tend){
    if(!drag.moved){
      push();drag.moved=true;
      armClear(drag.tend.ends.map(o=>o.t),drag.tend.vias,[]);
    }
    const skip=new Set(drag.tend.ends.map(o=>o.t));
    const m=magnet(p.x,p.y,drag.l,skip);
    const an=tendAnchor(drag.tend,p.x,p.y);
    let nx=m?m.x:snapXn(p.x,an.x), ny=m?m.y:snapYn(p.y,an.y);
    if(!m){                                   // l'aimant angulaire, à défaut de cuivre
      const g8=tendMagnet(drag.tend,p.x,p.y,nx,ny,px(6));
      if(g8){nx=g8.x;ny=g8.y;}
    }
    const put=(x,y)=>{
      for(const o of drag.tend.ends){
        if(o.e===1){o.t.x1=r3(x);o.t.y1=r3(y);}
        else{o.t.x2=r3(x);o.t.y2=r3(y);}
      }
      for(const v of drag.tend.vias){v.x=r3(x);v.y=r3(y);}
    };
    const landed=m?{x:nx,y:ny}:null;     // arrivée accrochée : à redresser au relâchement
    put(nx,ny);
    // le bout bute sur l'obstacle : il reste où il était, l'accroche avec lui
    if((clearStop()||crossStop())&&drag.at){put(drag.at.x,drag.at.y);}
    else{drag.at={x:nx,y:ny};drag.landed=landed;S.hover=m?{x:m.x,y:m.y}:null;}
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
      if(!drag.moved){push();drag.moved=true;beginMove();}
      const kx=drag.dx, ky=drag.dy;               // dernière position sans faute
      drag.dx=r3(drag.dx+dx);drag.dy=r3(drag.dy+dy);
      for(const id of S.sel.fps){const f=fpById(id);if(f){f.x=r3(f.x+dx);f.y=r3(f.y+dy);}}
      // pistes et vias en absolu : les articulations réécrivent leurs bouts,
      // un cumul relatif dériverait dès le deuxième mouvement
      for(const o of drag.trk){
        o.t.x1=r3(o.x1+drag.dx);o.t.y1=r3(o.y1+drag.dy);
        o.t.x2=r3(o.x2+drag.dx);o.t.y2=r3(o.y2+drag.dy);
      }
      for(const o of drag.via){o.v.x=r3(o.x+drag.dx);o.v.y=r3(o.y+drag.dy);}
      for(const z of S.sel.zones){
        if(detachAuto(z)){buildLayers();buildTabs();}
        for(const q of z.pts){q.x=r3(q.x+dx);q.y=r3(q.y+dy);}
      }
      for(const ct of S.sel.cuts){
        for(const q of ct.pts){q.x=r3(q.x+dx);q.y=r3(q.y+dy);}
      }
      if(drag.drw){
        for(const o of drag.drw){
          o.d.x1=r3(o.x1+drag.dx);o.d.y1=r3(o.y1+drag.dy);
          o.d.x2=r3(o.x2+drag.dx);o.d.y2=r3(o.y2+drag.dy);
        }
      }
      drag.x+=dx;drag.y+=dy;
      // Alt enfoncé pendant le geste : les voisins restent où ils sont
      applyJoints(drag.joints,drag.dx,drag.dy,e.altKey);
      /* Le déplacement s'applique en absolu : revenir au décalage précédent
         suffit à replacer tout ce que le geste avait touché, coudes compris. */
      if(clearStop()||crossStop()){
        drag.dx=kx;drag.dy=ky;drag.x-=dx;drag.y-=dy;
        for(const o of drag.trk){
          o.t.x1=r3(o.x1+drag.dx);o.t.y1=r3(o.y1+drag.dy);
          o.t.x2=r3(o.x2+drag.dx);o.t.y2=r3(o.y2+drag.dy);
        }
        for(const o of drag.via){o.v.x=r3(o.x+drag.dx);o.v.y=r3(o.y+drag.dy);}
        if(drag.drw){
          for(const o of drag.drw){
            o.d.x1=r3(o.x1+drag.dx);o.d.y1=r3(o.y1+drag.dy);
            o.d.x2=r3(o.x2+drag.dx);o.d.y2=r3(o.y2+drag.dy);
          }
        }
        applyJoints(drag.joints,drag.dx,drag.dy,e.altKey);
      }
      touch();draw();
    }
    return;
  }
  if(S.silkDraft){
    let nx=snapX(p.x), ny=snapY(p.y);
    if(e.shiftKey){
      if(S.silkShape==="rect"){
        const s=Math.max(Math.abs(nx-S.silkDraft.x1),Math.abs(ny-S.silkDraft.y1));
        nx=snapX(S.silkDraft.x1+(nx>=S.silkDraft.x1?s:-s));
        ny=snapY(S.silkDraft.y1+(ny>=S.silkDraft.y1?s:-s));
      }else{
        const dx=nx-S.silkDraft.x1, dy=ny-S.silkDraft.y1;
        const a=Math.atan2(dy,dx);
        const a_snap=Math.round(a/(Math.PI/4))*(Math.PI/4);
        const len=Math.hypot(dx,dy);
        nx=snapX(S.silkDraft.x1+len*Math.cos(a_snap));
        ny=snapY(S.silkDraft.y1+len*Math.sin(a_snap));
      }
    }
    S.silkDraft.x2=nx;S.silkDraft.y2=ny;
    draw();return;
  }
  if(S.mode==="mesure"){if(rpMesBouge(p.x,p.y))draw();return;}
  /* LA SONDE DE LA CARTE DE CHALEUR. Elle passe AVANT les modes de tracé :
     lire une valeur ne doit pas demander de quitter ce qu'on faisait. Elle ne
     RETOURNE PAS, elle non plus — le mode en cours garde la main derrière.
     `simDCSurvol` ne rend vrai que si l'on a changé de carreau, sans quoi on
     redessinerait la carte à chaque pixel parcouru. */
  if(typeof simDCSurvol==="function"&&
     simDCSurvol(p.x,p.y,(typeof simDCCoucheVoulue==="function")
                           ?simDCCoucheVoulue():S.active))draw();
  if(S.mode==="zone"&&S.zoneDraft){zoneMove(p.x,p.y,e.shiftKey);draw();return;}
  if(S.mode==="cut"&&S.cutDraft){cutMove(p.x,p.y,e.shiftKey);draw();return;}
  if(S.mode==="edge"&&S.edgeDraft){edgeMove(p.x,p.y,e.shiftKey);draw();return;}
  if(S.mode==="track"&&S.route){updateRoute(p.x,p.y);draw();return;}
  if(S.mode==="dpair"&&S.dp){dpUpdate(p.x,p.y);draw();return;}
  if(S.mode==="dpair"){
    /* Sans tracé en cours, on montre où la paire s'accrocherait : le milieu du
       couple d'ancres, et non la pastille la plus proche — une paire part
       d'entre les deux. */
    const q=dpPairAt(p.x,p.y,S.active);
    const a=q?dpPrimPair(q,p.x,p.y,S.active,Math.max(px(20),20)):null;
    const h=a?{x:r3((a.P.x+a.N.x)/2),y:r3((a.P.y+a.N.y)/2)}:null;
    if((h&&!S.hover)||(!h&&S.hover)||(h&&S.hover&&(h.x!==S.hover.x||h.y!==S.hover.y))){
      S.hover=h;draw();
    }
    return;
  }
  if(S.mode==="track"||S.mode==="via"){
    const m=magnet(p.x,p.y,S.active);
    const h=m?{x:m.x,y:m.y}:null;
    if((h&&!S.hover)||(!h&&S.hover)||(h&&S.hover&&(h.x!==S.hover.x||h.y!==S.hover.y))){
      S.hover=h;draw();
    }
  }
});
cv.addEventListener("pointerup",e=>{
  cancelLongpress();
  PTR_PCB.delete(e.pointerId);
  if(PTR_PCB.size<2)PINCH_PCB=null;
  if(S.hlText){S.hlText=null;draw();}
  if(drag&&drag.drawingEnd){
    drag=null;refreshPanels();draw();return;
  }
  if(S.silkDraft&&S.silkDraft.dragging){
    if(dist(S.silkDraft.x1,S.silkDraft.y1,S.silkDraft.x2,S.silkDraft.y2)>px(4)){
      push();
      const layer=(S.flip||S.active===S.cu-1)?"silkB":"silkT";
      const sh=S.silkShape||"line";
      const d={
        id:S.nextId++,
        shape:sh,
        type:sh,
        layer:layer,
        x1:S.silkDraft.x1, y1:S.silkDraft.y1,
        x2:S.silkDraft.x2, y2:S.silkDraft.y2,
        width:0.15
      };
      S.drawings.push(d);
      clearSel();
      if(!S.sel.drawings)S.sel.drawings=new Set();
      S.sel.drawings.add(d.id);
      S.silkDraft=null;
      touch();refreshPanels();draw();
      return;
    }else{
      S.silkDraft.dragging=false;
    }
  }
  if(drag&&drag.tend){
    if(drag.moved&&straightenTend(drag.tend,drag.landed))
      hint("Piste redressée sur le centre de l'arrivée : le coude a suivi.");
    pruneAfterDrag(drag.moved?drag.tend.ends.map(o=>o.t):[]);
    S.hover=null;drag=null;refreshPanels();draw();return;
  }
  if(drag&&drag.move&&drag.moved){
    const bouge=[...movedTracks()], avant=drag.diag;
    pruneAfterDrag(bouge);
    if(mitreAfterDrag(bouge,avant))
      hint("Le coude a repris son 45° : le chanfrein s'était replié en "+
           "raccourcissant la piste.");
    drag=null;refreshPanels();draw();return;
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
      for(const t of S.tracks){
        if(layerAlpha(t.l)<=0)continue;
        const b=trkBBox(t);
        if(b.x1>=x1&&b.x2<=x2&&b.y1>=y1&&b.y2<=y2)S.sel.tracks.add(t);
      }
      for(const v of S.vias)
        if(v.x>=x1&&v.x<=x2&&v.y>=y1&&v.y<=y2)S.sel.vias.add(v);
      /* Le cuivre plein entre aussi dans le lasso : sans cela une zone ne
         s'attrapait qu'à la souris posée sur son bord. */
      for(const z of S.zones){
        if(layerAlpha(z.l)<=0||z.pts.length<2)continue;
        const b=polyBBox(z.pts);
        if(b.x1>=x1&&b.x2<=x2&&b.y1>=y1&&b.y2<=y2)S.sel.zones.add(z);
      }
      for(const ct of S.cuts){
        if(layerAlpha(ct.l)<=0||ct.pts.length<2)continue;
        const b=polyBBox(ct.pts);
        if(b.x1>=x1&&b.x2<=x2&&b.y1>=y1&&b.y2<=y2)S.sel.cuts.add(ct);
      }
      if(S.drawings){
        for(const d of S.drawings){
          if(d.layer==="silkT"&&!S.show.silkT)continue;
          if(d.layer==="silkB"&&!S.show.silkB)continue;
          const minX=Math.min(d.x1,d.x2), maxX=Math.max(d.x1,d.x2);
          const minY=Math.min(d.y1,d.y2), maxY=Math.max(d.y1,d.y2);
          if(minX>=x1&&maxX<=x2&&minY>=y1&&maxY<=y2){
            if(!S.sel.drawings)S.sel.drawings=new Set();
            S.sel.drawings.add(d.id);
          }
        }
      }
    }else if(drag.zone){
      // lasso resté fermé : c'était un clic dans le plein d'une zone
      if(drag.add)toggleHit({zone:drag.zone});
      else S.sel.zones.add(drag.zone);
      if(drag.zone.net){S.hlNet=drag.zone.net;revealNet(drag.zone.net);}
    }
    S.marquee=null;refreshPanels();draw();
  }
  drag=null;
});
cv.addEventListener("pointercancel",e=>{
  cancelLongpress();
  PTR_PCB.delete(e.pointerId);
  if(PTR_PCB.size<2)PINCH_PCB=null;
  drag=null;
});
cv.addEventListener("contextmenu",e=>{
  e.preventDefault();
  if(S.route)commitRoute();
  else if(S.zoneDraft)closeZone();
  else if(S.edgeDraft)closeEdge();
  else{
    if(selCount() === 0 && typeof hitTest === "function"){
      const r = cv.getBoundingClientRect();
      const w = s2w(e.clientX - r.left, e.clientY - r.top);
      const h = hitTest(w.x, w.y);
      if(h){
        if(h.track){ S.sel.tracks.add(h.track); if(h.track.net) S.hlNet = h.track.net; }
        else if(h.fp){ S.sel.fps.add(h.fp); }
        else if(h.via){ S.sel.vias.add(h.via); if(h.via.net) S.hlNet = h.via.net; }
        refreshPanels(); draw();
      }
    }
    if(selCount() > 0 && typeof iaAfficherMenuContextuel === "function" && iaAfficherMenuContextuel(e)){
      return;
    }
    clearSel();S.hlNet=null;refreshPanels();draw();
  }
});
cv.addEventListener("dblclick",()=>{
  if(S.dp)dpCommit();
  else if(S.route)commitRoute();
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
  /* Fenêtre des règles ouverte : Échap la ferme, annuler et rétablir la
     traversent — c'est là qu'on vient de se tromper de cote — et rien d'autre
     n'agit sur la carte, qu'on ne voit pas. */
  if(typeof reIsOpen==="function"&&reIsOpen()){
    if(k==="escape"){e.preventDefault();reClose();return;}
    if((e.ctrlKey||e.metaKey)&&(k==="z"||k==="y")){
      e.preventDefault();
      (k==="y"||e.shiftKey)?redo():undo();
      reSync();
      return;
    }
    return;
  }
  /* Fenêtre d'empreinte ouverte : elle prend Échap pour se fermer, et rien
     d'autre ne doit agir sur la carte pendant ce temps — Suppr y effacerait
     une empreinte qu'on est en train de dessiner, et annuler remplacerait
     l'empreinte sous les mains de la fenêtre. */
  if(typeof feIsOpen==="function"&&feIsOpen()){
    if(k==="escape"){e.preventDefault();feClose();return;}
    /* Annuler et rétablir traversent : c'est dans la fenêtre qu'on vient de se
       tromper, et y renoncer en la fermant d'abord n'aurait aucun sens.
       loadDoc() remplace les empreintes de la carte, celle de la fenêtre
       comprise : feReattach() la reprend par son identifiant. */
    if((e.ctrlKey||e.metaKey)&&(k==="z"||k==="y")){
      e.preventDefault();
      (k==="y"||e.shiftKey)?redo():undo();
      feReattach();
      return;
    }
    /* `R` tourne la pastille sélectionnée, comme il tourne une empreinte sur
       la carte : le même geste, un cran plus bas. */
    if(k==="r"&&!e.ctrlKey&&!e.metaKey&&!e.altKey){
      e.preventDefault();
      feRotatePad(e.shiftKey?-90:90);
      return;
    }
    return;
  }
  if(e.key==="Tab"){e.preventDefault();S.coord.open?coordClose():coordOpen();return;}
  if((e.ctrlKey||e.metaKey)&&k==="z"){e.preventDefault();e.shiftKey?redo():undo();return;}
  if((e.ctrlKey||e.metaKey)&&k==="y"){e.preventDefault();redo();return;}
  if((e.ctrlKey||e.metaKey)&&k==="s"){e.preventDefault();saveJson();return;}
  if((e.ctrlKey||e.metaKey)&&k==="a"){
    e.preventDefault();
    S.fps.forEach(f=>S.sel.fps.add(f.id));
    S.tracks.forEach(x=>S.sel.tracks.add(x));
    S.vias.forEach(v=>S.sel.vias.add(v));
    S.zones.forEach(z=>S.sel.zones.add(z));
    S.cuts.forEach(x=>S.sel.cuts.add(x));
    if(S.drawings&&S.sel.drawings)S.drawings.forEach(d=>S.sel.drawings.add(d.id));
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
  /* Ctrl+F cherche dans la carte, pas dans la page : les repères et les nets
     ne sont pas du texte du document HTML, la recherche du navigateur ne les
     trouverait jamais. Le raccourci prenait déjà `f` au passage — il
     retournait la sélection avant que le navigateur n'ouvre sa barre. */
  if((e.ctrlKey||e.metaKey)&&k==="f"){e.preventDefault();rpQOuvrir();return;}
  /* Toute autre combinaison avec Ctrl/Cmd ou Alt appartient au navigateur :
     sans ce garde-fou, Ctrl+R faisait pivoter la sélection puis rechargeait la
     page. */
  if(e.ctrlKey||e.metaKey||e.altKey)return;
  if(e.key>="1"&&e.key<="8"){
    const i=+e.key-1;
    if(i<S.cu){
      e.preventDefault();
      if(S.dp)dpToLayer(i);else routeToLayer(i);
      draw();
    }
    return;
  }
  switch(k){
    case "s":
      if(e.shiftKey){S.silkShape=(S.silkShape==="rect"?"line":"rect");setMode("silk");draw();}
      else setMode("select");
      break;
    case "t":setMode("track");break;
    case "v":
      if(S.dp){dpVia();dpUpdate(S.mouse.x,S.mouse.y);draw();}
      else if(S.route){routeVia();draw();}
      else setMode("via");
      break;
    /* P comme paire : le tracé couplé. Le raccourci ne prend rien à personne —
       la piste seule est en T, le via en V. */
    case "p":setMode("dpair");break;
    case "z":setMode("zone");break;
    case "x":setMode("cut");break;
    case "e":setMode("edge");break;
    case "o":setMode("origin");break;
    /* K comme « kote » — C est pris par le copier, M par rien mais se confond
       avec le miroir du schématique. */
    case "k":setMode("mesure");break;
    /* Montrer la sélection sur le schéma resté ouvert dans un autre onglet.
       Le geste vit dans js/18-reperage.js, chargé après celui-ci. */
    case "l":if(typeof pcbMontrerAilleurs==="function")pcbMontrerAilleurs();break;
    case "r":rotateSel();break;
    case "f":flipSel();break;
    case "d":mitreSel();break;
    case "u":unrouteSel();break;
    case "g":setGrid(!S.showGrid);break;
    case "n":S.show.rats=!S.show.rats;$("bRats").classList.toggle("on",S.show.rats);draw();break;
    case "y":setFlip(!S.flip);break;
    case "h":setContrast((S.contrast+1)%3);break;
    /* Bascule de posture : « / » comme le routeur de KiCad, Espace pour la
       main gauche. Elle inverse l'arrangement que la géométrie a choisi, le
       temps du coude en cours. */
    case "/":
    case " ":
      if(S.dp){
        S.dp.flip=!S.dp.flip;
        dpUpdate(S.mouse.x,S.mouse.y);draw();e.preventDefault();
        hint("Posture de la paire : « / » pour l'autre arrangement du coude.");
        break;
      }
      if(S.route){
        S.route.flip=!S.route.flip;
        updateRoute(S.mouse.x,S.mouse.y);draw();e.preventDefault();
        hint("Posture : "+(S.route.preview.length<2?"trajet direct"
             :routePosture(S.route,S.route.end||S.mouse)?"diagonale d'abord"
             :"portion droite d'abord")+" — « / » pour l'autre arrangement.");
      }
      break;
    case "escape":
      if(typeof silkMenuClose==="function")silkMenuClose();
      // Échap termine ce qui est en cours puis rend la main à la sélection
      if(S.dp)dpCommit();
      else if(S.route)commitRoute();
      else if(S.zoneDraft){S.zoneDraft=null;hint("Zone abandonnée.");}
      else if(S.cutDraft){S.cutDraft=null;hint("Découpe abandonnée.");}
      else if(S.edgeDraft){S.edgeDraft=null;hint("Contour abandonné.");}
      else if(S.silkDraft){S.silkDraft=null;hint("Tracé de sérigraphie annulé.");}
      else if(S.mode==="mesure"&&rpMesEnCours()){rpMesRaz();rpMesDire();draw();break;}
      else{clearSel();S.hlNet=null;refreshPanels();}
      if(S.mode!=="select")setMode("select");
      draw();
      break;
    case "enter":
      if(S.dp)dpCommit();
      else if(S.route)commitRoute();
      else if(S.zoneDraft)closeZone();
      else if(S.cutDraft)closeCut();
      else if(S.edgeDraft)closeEdge();
      break;
    case "backspace":
      if(S.dp){dpBack();e.preventDefault();}
      else if(S.route){backRoute();e.preventDefault();}
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
  if(S.dp&&m!=="dpair")dpCommit();
  if(S.coord.open&&!coordUsable())coordClose();
  if(S.zoneDraft&&m!=="zone")S.zoneDraft=null;
  if(S.edgeDraft&&m!=="edge")S.edgeDraft=null;
  if(S.silkDraft&&m!=="silk")S.silkDraft=null;
  /* La cote appartient au mode : la garder affichee en revenant a la selection
     laisserait une annotation qu'aucun geste ne reprend. */
  if(m!=="mesure"&&typeof rpMesRaz==="function")rpMesRaz();
  S.mode=m;S.hover=null;
  if(m!=="zone")zoneMenuClose();
  for(const [id,md] of [["mSelect","select"],["mTrack","track"],["mVia","via"],
                        ["mDiff","dpair"],
                        ["mZone","zone"],["mSilk","silk"],["mEdge","edge"],["mOrigin","origin"],
                        ["mErase","erase"],["mMesure","mesure"]]){
    const b=$(id);
    if(b)b.classList.toggle("on",m===md);
  }
  $("fMode").textContent={select:"Sélection",track:"Piste",via:"Via",
                          dpair:"Paire différentielle",
                          zone:"Zone de cuivre",silk:"Sérigraphie",edge:"Contour de carte",
                          origin:"Origine",erase:"Gomme",
                          mesure:"Mesure"}[m];
  cv.style.cursor=m==="erase"?"not-allowed":"crosshair";
  hint({
    select:"Ctrl+clic (ou Maj+clic) ajoute à la sélection · glisser une piste emmène "+
           "la portion droite entière, les coudes voisins glissent sans changer d'angle "+
           "(Alt pendant le glissement les laisse sur place) · "+
           "D passe un angle droit en 45° · U déroute la sélection sans toucher aux empreintes · R pivote · F retourne · Ctrl+C/Ctrl+V copie-colle · Alt+clic insère un point sur une piste sélectionnée.",
    track:"Clic sur une pastille pour partir · V pose un via · 1-8 change de couche · Tab saisit les coordonnées · Échap termine.",
    via:"Clic pour poser un via traversant, accroché à la pastille ou à la piste la plus proche.",
    dpair:"Clic sur une pastille de la paire pour partir — l'autre net est trouvé tout seul · "+
          "V pose les deux vias en éventail · « / » bascule la posture · 1-8 change de couche · "+
          "arrivée sur les pastilles d'en face pour terminer · Échap dépose ce qui est tracé.",
    zone:"Clic pour chaque sommet, retour sur le premier point pour fermer · Maj contraint à 45° · Entrée ferme, Échap abandonne.",
    silk:"Cliquez et glissez (ou deux clics) pour tracer un trait de sérigraphie (F.SilkS/B.SilkS) · Maj contraint à l'horizontale/verticale/45° · Échap annule.",
    edge:"Dessinez le contour de la carte, sommet par sommet · retour sur le premier point pour fermer · Maj contraint à 45°.",
    origin:"Cliquez le point qui servira d'origine — une pastille proche l'attire.",
    erase:"Clic sur une piste, un via ou une empreinte pour le supprimer.",
    mesure:"Cliquez le premier point, puis le second : la cote se fige · les pastilles, "+
           "les vias et les sommets de piste de la couche active attirent le point · "+
           "un nouveau clic repart d'ailleurs · Échap efface."
  }[m]);
  draw();
}
function setGrid(v){
  S.showGrid=!!v;
  $("bGrid").classList.toggle("on",S.showGrid);
  if(typeof profilNoter==="function")profilNoter();
  draw();
}
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
  if(typeof profilNoter==="function")profilNoter();
  hint("Grille d'accrochage : "+String(r3(g)).replace(".",",")+" mm.");
  draw();
}
/* L'angle imposé aux pistes se range avec le document : il décrit la carte, au
   même titre que l'isolation ou la marge de bord, et se défait donc d'un
   Ctrl+Z. Le tracé en cours s'y remet aussitôt, sans qu'on ait à bouger la
   souris. Rien de ce qui est déjà posé ne bouge : la règle vaut pour la suite. */
function setCornerMode(m){
  if(!CORNER_MODES[m]||m===cornerMode())return;
  push();
  S.rule.corner=m;
  touch();
  if(S.route){S.route.flip=false;updateRoute(S.mouse.x,S.mouse.y);}
  reSync();draw();
  hint("Angle des pistes : "+CORNER_MODES[m]+
       (m==="free"?" — le tracé ne contraint plus rien."
        :" — « / » bascule l'arrangement du coude."));
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
  if(typeof profilNoter==="function")profilNoter();
  draw();
}
function setContrast(v){
  S.contrast=v;
  const n=["complet","atténué","couche seule"][v];
  $("bContrast").innerHTML="Contraste : "+n+' <kbd>H</kbd>';
  $("bContrast").classList.toggle("on",v>0);
  if(typeof profilNoter==="function")profilNoter();
  draw();
}
function setActive(i){
  S.active=clamp(i,0,S.cu-1);
  if(!S.cuL[S.active].vis){S.cuL[S.active].vis=true;buildLayers();}
  buildTabs();buildLayers();buildActiveLayer();draw();
}

