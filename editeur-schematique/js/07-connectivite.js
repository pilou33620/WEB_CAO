/* =============================================================================
   editeur-schematique — 07-connectivite.js
   Découpe automatique des fils + extraction des nets
   ============================================================================= */
"use strict";
/* ==========================================================================
   Découpe automatique
   Une extrémité de fil déposée au milieu d'un autre segment le scinde en deux.
   Sans cela, la jonction n'est qu'un point rouge : le segment traversé reste
   d'un seul tenant et on ne peut ni le sélectionner ni le déplacer par moitié.
   ========================================================================== */
function endpointList(wires){
  const seen=new Set(), pts=[];
  for(const w of wires){
    for(const p of [[w.x1,w.y1],[w.x2,w.y2]]){
      const k=key(p[0],p[1]);
      if(!seen.has(k)){seen.add(k);pts.push({x:p[0],y:p[1]});}
    }
  }
  return pts;
}
// point strictement à l'intérieur du segment, extrémités exclues
function insideSeg(p,w){
  if((p.x===w.x1&&p.y===w.y1)||(p.x===w.x2&&p.y===w.y2))return false;
  const dx=w.x2-w.x1, dy=w.y2-w.y1;
  if((p.x-w.x1)*dy-(p.y-w.y1)*dx!==0)return false;      // pas aligné
  const t=(p.x-w.x1)*dx+(p.y-w.y1)*dy;
  return t>0 && t<dx*dx+dy*dy;
}
/* Scinde en place tous les segments du tableau traversés par une extrémité.
   onSplit(ancien, moitiéA, moitiéB) permet à l'appelant de suivre le
   remplacement — la sélection notamment. Renvoie vrai si quelque chose a bougé. */
function splitWireArray(wires,onSplit){
  const pts=endpointList(wires);
  if(pts.length<3)return false;
  // index par abscisse et ordonnée : les fils sont presque toujours orthogonaux
  const byX=new Map(), byY=new Map();
  for(const p of pts){
    if(!byX.has(p.x))byX.set(p.x,[]);
    byX.get(p.x).push(p);
    if(!byY.has(p.y))byY.set(p.y,[]);
    byY.get(p.y).push(p);
  }
  let splits=0;
  for(let i=0;i<wires.length;i++){
    if(splits>2000)break;                                // garde-fou
    const w=wires[i];
    const cand=(w.x1===w.x2)?(byX.get(w.x1)||[])
              :(w.y1===w.y2)?(byY.get(w.y1)||[])
              :pts;                                      // segment oblique : balayage complet
    let hit=null;
    for(const p of cand) if(insideSeg(p,w)){hit=p;break;}
    if(!hit)continue;
    const a={x1:w.x1,y1:w.y1,x2:hit.x,y2:hit.y};
    const b={x1:hit.x,y1:hit.y,x2:w.x2,y2:w.y2};
    if(w.bus){a.bus=true;b.bus=true;}
    if(w.net){a.net=w.net;b.net=w.net;}   // le label survit à la scission
    // les réglages d'affichage de l'étiquette aussi : masquage et déplacement
    // sont rangés sur les fils du net, ils doivent suivre les deux moitiés
    if(w.lblHide){a.lblHide=1;b.lblHide=1;}
    if(w.lblOff){a.lblOff=w.lblOff.slice();b.lblOff=w.lblOff.slice();}
    wires.splice(i,1,a,b);
    if(onSplit)onSplit(w,a,b);
    splits++;
    i--;            // le premier tronçon peut être traversé une seconde fois
  }
  return splits>0;
}
function resolveSplits(){
  const done=splitWireArray(S.wires,(w,a,b)=>{
    if(S.selW.delete(w)){S.selW.add(a);S.selW.add(b);}  // la sélection suit les moitiés
  });
  if(done)touchWires();
  return done;
}

/* ==========================================================================
   Nets — extraction de la connectivité
   Un net = un ensemble de points électriquement communs. Le regroupement se
   fait par union-find sur les coordonnées de grille :
     · les deux extrémités d'un fil sont dans le même net ;
     · une broche posée sur un point de fil rejoint ce net (y compris en plein
       milieu d'un segment, comme dans les outils du métier) ;
     · deux fils qui se croisent SANS extrémité commune restent indépendants —
       c'est exactement ce que montre le point de jonction rouge.
   Le nom vient d'un symbole d'alimentation, d'une étiquette de net ou d'un
   label posé sur un fil ; deux nets qui portent le même nom fusionnent, même
   sans fil entre eux (comportement des labels globaux).
   ========================================================================== */
/* Sources de nom, par priorité décroissante. « global » signifie que le nom
   porte au-delà de la feuille : deux nets qui portent ce nom sur des feuilles
   différentes sont le même net. Une étiquette locale (port) reste, elle,
   cantonnée à sa feuille — c'est la convention des outils du métier. */
const NAME_SRC={
  gnd  :{prio:3,def:"GND",global:true},
  vcc  :{prio:3,def:"VCC",global:true},
  gport:{prio:3,def:"NET",global:true},
  port :{prio:2,def:"NET"}
};
const NET_AUTO=/^N\$\d+$/i;            // nom attribué d'office : pas un vrai label
function segLen(w){return Math.abs(w.x2-w.x1)+Math.abs(w.y2-w.y1);}
function netColor(net){
  if(!net.named)return "#8b919c";
  if(/^(gnd|agnd|dgnd|0\s*v|masse)$/i.test(net.name))return "#e8746a";
  let h=0;
  for(let i=0;i<net.name.length;i++)h=(h*31+net.name.charCodeAt(i))|0;
  return "hsl("+(((h%360)+360)%360)+",66%,66%)";
}

function computeNets(comps,wires){
  const parent=new Map();
  function add(k){if(!parent.has(k))parent.set(k,k);return k;}
  function find(k){
    add(k);
    let r=k;
    while(parent.get(r)!==r)r=parent.get(r);
    while(parent.get(k)!==r){const n=parent.get(k);parent.set(k,r);k=n;}
    return r;
  }
  function uni(a,b){a=find(a);b=find(b);if(a!==b)parent.set(a,b);}

  for(const w of wires) uni(key(w.x1,w.y1),key(w.x2,w.y2));

  // index par abscisse / ordonnée : évite de tester chaque broche contre chaque fil
  const vert=new Map(), horiz=new Map();
  for(const w of wires){
    if(w.x1===w.x2){if(!vert.has(w.x1))vert.set(w.x1,[]);vert.get(w.x1).push(w);}
    else if(w.y1===w.y2){if(!horiz.has(w.y1))horiz.set(w.y1,[]);horiz.get(w.y1).push(w);}
  }
  const pinNodes=[];
  for(const el of comps){
    const def=defOf(el.type);
    allPins(el).forEach((p,i)=>{
      const k=add(key(p.x,p.y));
      pinNodes.push({el,def,i,x:p.x,y:p.y,k});
      const cand=(vert.get(p.x)||[]).concat(horiz.get(p.y)||[]);
      for(const w of cand) if(insideSeg(p,w)) uni(k,key(w.x1,w.y1));
    });
  }

  // revendications de nom
  const claims=[];
  for(const n of pinNodes){
    const src=NAME_SRC[n.el.type];
    if(!src)continue;
    claims.push({k:n.k,name:String(n.el.value||"").trim()||src.def,
                 prio:src.prio,global:!!src.global});
  }
  for(const w of wires){
    const nm=String(w.net||"").trim();
    if(nm && !NET_AUTO.test(nm))claims.push({k:key(w.x1,w.y1),name:nm,prio:1});
  }
  const first=new Map();
  for(const cl of claims){
    const kk=cl.name.toUpperCase();
    if(first.has(kk))uni(cl.k,first.get(kk));
    else first.set(kk,cl.k);
  }

  // regroupement
  const groups=new Map();
  function net(k){
    const r=find(k);
    let n=groups.get(r);
    if(!n){n={id:r,name:"",names:[],named:false,src:0,conflict:false,global:false,
              nodes:[],powers:[],wires:[],pts:[]};groups.set(r,n);}
    return n;
  }
  for(const w of wires){
    const n=net(key(w.x1,w.y1));
    n.wires.push(w);
    n.pts.push({x:w.x1,y:w.y1},{x:w.x2,y:w.y2});
  }
  for(const nd of pinNodes){
    const n=net(nd.k);
    n.pts.push({x:nd.x,y:nd.y});
    if(NAME_SRC[nd.el.type])n.powers.push(nd.el);
    else if(!nd.def.noRef)n.nodes.push({
      ref:nd.el.ref||"?", pin:nd.i+1, id:nd.el.id,
      label:(nd.el.pinNames&&nd.el.pinNames[nd.i])||"", x:nd.x, y:nd.y});
  }
  for(const cl of claims){
    const n=net(cl.k);
    if(!n.names.some(x=>x.toUpperCase()===cl.name.toUpperCase()))n.names.push(cl.name);
    if(cl.prio>n.src){n.src=cl.prio;n.name=cl.name;n.global=!!cl.global;}
  }

  // un point isolé (broche sans fil, sonde d'annotation) n'est pas un net
  const list=[], loose=[];
  for(const n of groups.values()){
    n.named=!!n.name;
    n.conflict=n.names.length>1;
    let mx=1e9,my=1e9;
    for(const p of n.pts){if(p.y<my||(p.y===my&&p.x<mx)){my=p.y;mx=p.x;}}
    n.min={x:mx,y:my};
    let best=null;
    for(const w of n.wires) if(!best||segLen(w)>segLen(best))best=w;
    // le fil le plus long porte l'étiquette : c'est aussi lui qui garde ses
    // réglages d'affichage (masquée, déplacée)
    n.anchorWire = best;
    n.anchor = best
      ? {x:(best.x1+best.x2)/2, y:(best.y1+best.y2)/2, vert:best.x1===best.x2}
      : (n.pts.length?{x:n.pts[0].x,y:n.pts[0].y,vert:false}:null);
    if(!n.wires.length && n.nodes.length+n.powers.length<2) loose.push(n);
    else list.push(n);
  }
  // numérotation stable : de haut en bas, puis de gauche à droite
  list.sort((a,b)=>(a.min.y-b.min.y)||(a.min.x-b.min.x));
  let auto=0;
  for(const n of list) if(!n.named)n.name="N$"+(++auto);

  const byWire=new Map(), byPoint=new Map();
  for(const n of list) for(const w of n.wires) byWire.set(w,n);
  for(const k of parent.keys()){
    const n=groups.get(find(k));
    if(n)byPoint.set(k,n);
  }
  return {list,loose,byWire,byPoint};
}

/* Cache : la signature couvre tout ce qui peut changer la connectivité — fils,
   position/orientation des composants, et valeurs des symboles nommants. */
/* Empreinte d'un composant : tout ce qui peut déplacer une broche ou renommer
   un net. Les positions libres sont résumées par un condensé — les recopier
   entièrement à chaque image coûterait plus cher que le calcul qu'elles
   évitent. */
function posHash(pp){
  let h=0;
  if(Array.isArray(pp))for(const p of pp)h=(h*31+((+p[0])|0)*7+((+p[1])|0)*13)|0;
  return h;
}
function compSig(c){
  return c.type+","+c.x+","+c.y+","+(c.rot|0)+(c.mir?"m":"")+(c.npins||0)+
    (c.icShape==="quad"?"q":c.icShape==="libre"?("f"+posHash(c.pinPos)):"")+
    ((c.icW||c.icHs)?("w"+(c.icW||0)+"/"+(c.icHs||0)):"")+
    (NAME_SRC[c.type]?(","+c.value):"");
}
let _netCache=null, _netSig="";
function netSig(){
  let s=S.wireVer+"|"+S.wires.length+"|"+S.page+"|"+S.comps.length;
  for(const c of S.comps) s+="|"+compSig(c);
  for(const w of S.wires) if(w.net) s+="|@"+w.x1+","+w.y1+","+w.net;
  return s;
}
function nets(){
  const sig=netSig();
  if(_netCache && _netSig===sig)return _netCache;
  _netCache=computeNets(S.comps,S.wires);
  _netSig=sig;
  return _netCache;
}
/* ---------- vue document : les nets globaux traversent les feuilles ----------
   Le regroupement intra-feuille ne change pas ; seule l'identité change : deux
   nets portant le même nom global, sur deux feuilles, ne font qu'un. */
function pageSig(comps,wires){
  let s=comps.length+"/"+wires.length, h=0;
  for(const c of comps) s+="|"+compSig(c);
  for(const w of wires){
    h=(h+w.x1*3+w.y1*5+w.x2*7+w.y2*11)|0;
    if(w.net)s+="|@"+w.x1+","+w.y1+","+w.net;
  }
  return s+"|"+h;
}
let _docCache=null,_docSig="";
function docNets(){
  const per=[];
  let sig=S.wireVer+"#"+S.page+"#"+S.pages.length;
  S.pages.forEach((p,i)=>{
    const comps=(i===S.page)?S.comps:(p.comps||[]);
    const wires=(i===S.page)?S.wires:(p.wires||[]);
    per.push({page:i,name:p.name,comps,wires});
    sig+="#"+pageSig(comps,wires);
  });
  if(_docCache&&_docSig===sig)return _docCache;
  const sheets=per.map(x=>({page:x.page,name:x.name,
    nets:(x.page===S.page)?nets():computeNets(x.comps,x.wires)}));
  const groups=[], byName=new Map();
  for(const sh of sheets){
    for(const n of sh.nets.list){
      const gk=n.global?n.name.toUpperCase():null;
      let g=gk?byName.get(gk):null;
      if(!g){
        g={name:n.name,global:!!gk,members:[],pages:[],nodes:[],conflict:false};
        if(gk)byName.set(gk,g);
        groups.push(g);
      }
      g.members.push({page:sh.page,net:n});
      if(!g.pages.includes(sh.page))g.pages.push(sh.page);
      g.conflict=g.conflict||n.conflict;
      for(const nd of n.nodes)g.nodes.push(Object.assign({page:sh.page},nd));
    }
  }
  groups.sort((a,b)=>(a.global!==b.global?(a.global?-1:1)
    :String(a.name).localeCompare(String(b.name),"fr",{numeric:true})));
  _docCache={sheets,groups};_docSig=sig;
  return _docCache;
}
function docGroupOf(net){
  if(!net||!net.global)return null;
  return docNets().groups.find(g=>g.global&&g.name.toUpperCase()===net.name.toUpperCase())||null;
}
function sheetList(pages){return pages.map(i=>"f"+(i+1)).join(", ");}
function netAt(x,y){return nets().byPoint.get(key(x,y))||null;}
/* Un point isolé forme un « net » d'un seul nœud : électriquement, ce n'est rien.
   netAtLive ne renvoie que les nets réellement établis. */
function isRealNet(n){return !!n&&(n.wires.length>0||n.nodes.length+n.powers.length>1);}
function netAtLive(x,y){const n=netAt(x,y);return isRealNet(n)?n:null;}
/* Renommer un net = poser un label unique sur son plus long segment.
   Les anciens labels du même net sont retirés pour éviter deux noms rivaux. */
function setNetName(net,name){
  if(!net||!net.wires.length)return false;
  const nm=String(name||"").trim().slice(0,32);
  if(net.src>=2 && nm){                 // nom déjà imposé par un symbole
    return false;
  }
  push();
  for(const w of net.wires) delete w.net;
  if(nm && !NET_AUTO.test(nm)){
    let best=net.wires[0];
    for(const w of net.wires) if(segLen(w)>segLen(best))best=w;
    best.net=nm;
  }
  touchWires();
  return true;
}
function selectNet(net){
  if(!net)return;
  clearSel();
  for(const w of net.wires)S.selW.add(w);
  // net sans fil (contact broche à broche) : on sélectionne les composants,
  // sinon le clic n'aurait aucun effet visible
  if(!net.wires.length) for(const nd of net.nodes)S.sel.add(nd.id);
  S.hoverNet=net;                 // halo immédiat, sans attendre un survol
  refreshPanels();draw();
}
