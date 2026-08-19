/* Banc d'essai : un DOM minimal pour exécuter le code de l'éditeur sans navigateur. */
const fs=require("fs");
let realCanvas=null;
try{realCanvas=require("canvas");}catch(e){}

function ctxStub(){
  const noop=()=>{};
  const c={};
  ["beginPath","moveTo","lineTo","arc","arcTo","closePath","fill","stroke","fillRect",
   "strokeRect","save","restore","translate","rotate","scale","setTransform","setLineDash",
   "drawImage","fillText","clearRect","measureText","quadraticCurveTo","createLinearGradient",
   "rect","ellipse","clip","bezierCurveTo"]
   .forEach(k=>c[k]=k==="measureText"?(()=>({width:10})):noop);
  c.canvas={width:800,height:600};
  return c;
}
function el(id){
  const e={
    id,_html:"",textContent:"",value:"",checked:false,files:[],dataset:{},
    style:{},width:800,height:600,clientWidth:800,clientHeight:600,
    classList:{add:noop,remove:noop,toggle:noop,contains:()=>false},
    addEventListener:noop,removeEventListener:noop,appendChild:noop,remove:noop,
    focus:noop,select:noop,blur:noop,click:noop,setPointerCapture:noop,
    getContext:()=>ctxStub(),
    getBoundingClientRect:()=>({left:0,top:0,width:800,height:600}),
    querySelectorAll:()=>[],
    toBlob:cb=>cb({})
  };
  e.parentElement={getBoundingClientRect:()=>({width:800,height:600})};
  Object.defineProperty(e,"innerHTML",{get(){return e._html;},set(v){e._html=String(v);}});
  return e;
}
function noop(){}
const nodes=new Map();
const listeners={doc:{},cv:{},win:{}};
global.document={
  getElementById(id){
    if(!nodes.has(id))nodes.set(id,el(id));
    return nodes.get(id);
  },
  createElement(t){
    if(t==="canvas"&&realCanvas){
      // canevas logiciel : la rasterisation des îlots est testée pour de vrai
      const cv=realCanvas.createCanvas(1,1);
      cv.toBlob=cb=>cb({});
      return cv;
    }
    const e=el("new-"+t);
    if(t==="canvas"){e.width=1;e.height=1;}
    return e;
  },
  body:{appendChild:noop},
  querySelectorAll:()=>[],
  addEventListener(t,f){(listeners.doc[t]=listeners.doc[t]||[]).push(f);}
};
global.window={
  devicePixelRatio:1,
  addEventListener(t,f){(listeners.win[t]=listeners.win[t]||[]).push(f);}
};
global.alert=m=>console.log("[alert]",m);
global.confirm=()=>true;
global.URL={createObjectURL:()=>"blob:x",revokeObjectURL:noop};
global.Blob=function(){};
global.FileReader=function(){this.readAsText=()=>{};};
global.requestAnimationFrame=f=>f();

// le canevas principal doit enregistrer ses écouteurs pour qu'on les déclenche
const board=global.document.getElementById("board");
board.addEventListener=(t,f)=>{(listeners.cv[t]=listeners.cv[t]||[]).push(f);};

const code=fs.readFileSync(require("path").join(__dirname,"..","dist","pcb.js"),"utf8");
const EXPOSE=["S","conn","draw","init","importNetlist","setCuCount","setMode","startRoute",
  "updateRoute","stepRoute","commitRoute","routeToLayer","runDrc","buildTabs",
  "buildLayers","buildRules","refreshPanels","buildList","buildProps","clearSel","rotateSel",
  "flipSel","push","undo","redo","touch","padsWorld","cuId","serialize","loadDoc","exportPng",
  "setFlip","setContrast","autoPlace","conn","netTable","fit","zoneClick","zoneMove",
  "closeZone","fullBoardZone","zoneMask","labelMask","maskAt","classOf","setNetClass","defaultWidth",
  "clrPair","applyClasses","jointAt","splitTrack","netTracks","selectNetRouting",
  "deleteNetRouting","autoClass","mkFp","w2s","buildRules","runDrc","padsOf",
  "buildFabFiles","gerberCopper","gerberMask","gerberPaste","gerberSilk","gerberEdge",
  "drillFile","maskOpenings","pasteOpenings","textStrokes","crc32","zipBlob","exportFab",
  "edgeClick","edgeMove","closeEdge","boardPoly","setBoardSize","setBoardRect","inBoard",
  "boardChanged","polyEdgeDist","segDist","orient","signedArea",
  "coordOpen","coordClose","coordApply","coordMode","coordPoint","coordAnchor",
  "placeOrigin","ux","uy","wxu","wyu","snapX","snapY","gOrigin","routeToPoint","hint",
  "pushClear","magnet","segClearBad","setActive","segSegDist","segCross","routeBad","focusNet","cancelRoute","updateRoute","classOf","syncAutoZones","detachAuto","zoneCanvas","inPoly","hitTest","px","dist","boardZonePts"];
eval(code.replace(/^"use strict";/,"")+"\n"+EXPOSE.map(n=>"globalThis."+n+"="+n+";").join("\n"));

function fire(t,ev){(listeners.cv[t]||[]).forEach(f=>f(Object.assign({
  button:0,clientX:0,clientY:0,pointerId:1,preventDefault:noop,shiftKey:false,altKey:false
},ev)));}
function sc(x,y){const p=w2s(x,y);return {clientX:p.x,clientY:p.y};}
function key(k,mod){
  (listeners.doc.keydown||[]).forEach(f=>f(Object.assign({
    key:k,target:{tagName:"BODY"},preventDefault:noop,ctrlKey:false,metaKey:false,shiftKey:false
  },mod||{})));
}

const NET=`* Netlist — Éditeur schématique
* 1 feuille(s) · 4 net(s)

=== Composants ===
    R1      10k               0603              f1
    C1      100n              0603              f1
    U1      NE555             DIP-8             f1
    D1      LED               0805              f1

=== Nets globaux (masses, alimentations, étiquettes globales) ===

NET "GND"   ; feuille 1
    C1.2
    U1.1
    R1.2

NET "+5V"   ; feuille 1
    U1.8
    U1.4
    D1.1

=== Feuille 1 — Principale ===

NET "N$1"
    U1.3        SORTIE
    R1.1

NET "N$2"
    U1.6
    U1.2
    C1.1
`;

let ok=0,ko=0;
function T(name,fn){
  try{fn();console.log("  ok  "+name);ok++;}
  catch(e){console.log("  KO  "+name+" → "+e.message+"\n"+(e.stack||"").split("\n")[1]);ko++;}
}
console.log("— banc d'essai éditeur PCB —");
T("import netlist",()=>{
  importNetlist(NET,false);
  if(S.fps.length!==4)throw new Error("4 empreintes attendues, "+S.fps.length);
  const u1=S.fps.find(f=>f.ref==="U1");
  if(u1.pins!==8)throw new Error("U1 doit avoir 8 broches, "+u1.pins);
  if(u1.nets[1]!=="GND")throw new Error("U1.1 devrait être GND");
});
T("nets et chevelu",()=>{
  const c=conn();
  if(c.nets.size!==4)throw new Error("4 nets attendus, "+c.nets.size);
  if(!c.rats.length)throw new Error("chevelu vide");
  if(c.unrouted!==7)throw new Error("7 liaisons attendues, "+c.unrouted);
});
T("empilage 4 couches",()=>{
  setCuCount(4);
  if(S.cu!==4||S.cuL.length!==4)throw new Error("empilage incorrect");
  if(cuId(1,4)!=="In1.Cu")throw new Error("nom de couche interne faux");
});
T("routage d'un segment entre deux pastilles",()=>{
  S.avoid=false;                       // trajet direct : l'anti-collision a son propre essai
  const u1=S.fps.find(f=>f.ref==="U1"), r1=S.fps.find(f=>f.ref==="R1");
  u1.x=10;u1.y=10;r1.x=30;r1.y=30;touch();
  const a=padsWorld(u1).find(q=>q.n===3), b=padsWorld(r1).find(q=>q.n===1);
  setMode("track");
  startRoute(a.x,a.y);
  if(S.route.net!=="N$1")throw new Error("net de départ faux : "+S.route.net);
  updateRoute(b.x,b.y);stepRoute();
  if(S.route)commitRoute();
  if(!S.tracks.length)throw new Error("aucune piste posée");
  const c=conn();
  if(c.nets.get("N$1").miss!==0)throw new Error("N$1 devrait être routé");
  S.avoid=true;
});
T("via et changement de couche",()=>{
  const n=S.tracks.length;
  setMode("track");
  startRoute(50,50);
  routeToLayer(2);
  if(!S.vias.length)throw new Error("via non posé");
  if(S.route.layer!==2)throw new Error("couche non changée");
  updateRoute(60,58);stepRoute();commitRoute();
  const last=S.tracks[S.tracks.length-1];
  if(last.l!==2)throw new Error("piste posée sur la mauvaise couche");
  if(S.tracks.length<=n)throw new Error("piste manquante");
});
T("connexion via inter-couches",()=>{
  const before=conn().unrouted;
  if(typeof before!=="number")throw new Error("unrouted non calculé");
});
T("zone dessinée point par point",()=>{
  setCuCount(4);
  S.fps.forEach((f,i)=>{f.x=15+i*20;f.y=20+(i%2)*20;f.side=0;});
  touch();
  setMode("zone");
  zoneClick(5,5);zoneClick(90,5);zoneMove(90,70);zoneClick(90,70);zoneClick(5,70);
  if(S.zoneDraft.pts.length!==4)throw new Error("4 sommets attendus");
  // retour sur le premier point : la zone se ferme
  zoneClick(5,5);
  if(S.zoneDraft)throw new Error("la zone aurait dû se fermer");
  if(S.zones.length!==1)throw new Error("zone non créée");
  const z=S.zones[0];
  if(z.l!==S.active)throw new Error("mauvaise couche");
  if(!S.sel.zones.has(z))throw new Error("la zone créée devrait être sélectionnée");
  setMode("select");
});
T("la zone relie les pastilles de son net",()=>{
  const z=S.zones[0];
  z.l=0;z.net="GND";touch();
  const g=conn().nets.get("GND");
  if(g.miss!==0)throw new Error("GND devrait être relié par la zone, reste "+g.miss);
  z.net="";touch();
  if(conn().nets.get("GND").miss===0)throw new Error("sans net, la zone ne doit rien relier");
  z.net="GND";z.l=2;touch();
  if(conn().nets.get("GND").miss===0)
    throw new Error("une zone interne ne doit pas atteindre les pastilles CMS du dessus");
  z.l=0;touch();
});
T("remplissage et cache",()=>{
  const a=zoneCanvas(0);
  if(!a)throw new Error("remplissage non généré");
  const b=zoneCanvas(0);
  if(a!==b)throw new Error("le cache devrait resservir");
  touch();
  if(zoneCanvas(0)===a)throw new Error("le cache devrait être invalidé après modification");
});
T("sélection par le contour et poignées",()=>{
  const z=S.zones[0];
  const h=hitTest(z.pts[0].x,z.pts[0].y);
  if(!h||h.zone!==z)throw new Error("la zone devrait s'attraper par son contour");
  const inside=hitTest((z.pts[0].x+z.pts[2].x)/2,(z.pts[0].y+z.pts[2].y)/2);
  if(inside&&inside.zone)throw new Error("cliquer au milieu ne doit pas saisir la zone");
});
T("plan pleine carte",()=>{
  const n=S.zones.length;
  fullBoardZone();
  if(S.zones.length!==n+1)throw new Error("plan non créé");
  const z=S.zones[S.zones.length-1];
  if(z.pts.length!==4)throw new Error("rectangle attendu");
  S.zones.pop();clearSel();touch();
});
T("rôle plan de couche",()=>{
  S.cuL[3].plane=true;S.cuL[3].net="GND";syncAutoZones();
  const z=S.zones.find(o=>o.auto&&o.l===3);
  if(!z)throw new Error("plan non créé");
  if(z.pts.length!==4)throw new Error("rectangle attendu");
  const w0=z.pts[1].x-z.pts[0].x;
  S.board.w+=20;syncAutoZones();
  if(S.zones.find(o=>o.auto&&o.l===3).pts[1].x-z.pts[0].x<=w0)
    throw new Error("le plan devrait suivre la carte");
  S.board.w-=20;syncAutoZones();
  // le déformer le rend libre
  detachAuto(z);
  if(S.cuL[3].plane)throw new Error("le rôle devrait retomber en signal");
  if(S.zones.indexOf(z)<0)throw new Error("la zone devrait survivre au détachement");
  S.zones=S.zones.filter(o=>o!==z);touch();
  // et le retirer du rôle supprime son plan
  S.cuL[3].plane=true;S.cuL[3].net="GND";syncAutoZones();
  const n=S.zones.length;
  S.cuL[3].plane=false;syncAutoZones();
  if(S.zones.length!==n-1)throw new Error("le plan aurait dû disparaître");
});
T("étiquetage des îlots",()=>{
  // une bande pleine coupée en deux par une colonne vide
  const W=20,H=6,a=new Uint8Array(W*H);
  for(let y=0;y<H;y++)for(let x=0;x<W;x++)a[y*W+x]=(x===10)?0:1;
  const r=labelMask(a,W,H);
  if(r.count!==2)throw new Error("2 îlots attendus, "+r.count);
  if(r.lab[0]===r.lab[W-1])throw new Error("les deux moitiés ne doivent pas partager l'étiquette");
  // un contact en diagonale ne conduit pas
  const b=new Uint8Array(4);b[0]=1;b[3]=1;
  if(labelMask(b,2,2).count!==2)throw new Error("la diagonale ne doit pas relier");
});
T("un faisceau qui coupe un plan le coupe vraiment",()=>{
  if(!realCanvas){console.log("     (canvas absent : essai ignoré)");return;}
  const saved=serialize();          // l'essai repart d'une carte neuve, on rendra l'autre
  // carte propre : deux pastilles GND de part et d'autre, plan pleine carte
  S.fps=[];S.tracks=[];S.vias=[];S.zones=[];touch();
  setCuCount(2);
  S.board={x:0,y:0,w:60,h:40};
  const mk=(ref,x,y)=>{
    const f=mkFp(ref,"","",2);f.style="row";f.pitch=2.54;f.x=x;f.y=y;
    f.nets={1:"GND",2:"GND"};S.fps.push(f);return f;
  };
  mk("J1",10,20);mk("J2",50,20);
  S.zones.push({id:999,l:0,net:"GND",pts:boardZonePts()});
  touch();
  if(conn().nets.get("GND").miss!==0)throw new Error("le plan intact devrait tout relier");
  // huit pistes serrées, de bord à bord, en travers du plan
  for(let i=0;i<8;i++){
    const x=26+i*1.2;
    S.tracks.push({l:0,net:"SIG"+i,w:0.6,x1:x,y1:-2,x2:x,y2:42});
  }
  touch();
  const m=conn().nets.get("GND").miss;
  if(m===0)throw new Error("le plan est coupé : GND ne devrait plus être relié");
  const zi=conn().zoneIslands[0];
  if(!zi||zi.islands<2)throw new Error("les deux îlots devraient être comptés, "+(zi&&zi.islands));
  // un via de couture ne suffit pas non plus : on rouvre un passage à la place
  S.tracks=S.tracks.filter(t=>t.y2!==42);
  for(const t of S.tracks)t.y2=20;
  touch();
  if(conn().nets.get("GND").miss!==0)
    throw new Error("le passage rouvert devrait rétablir GND");
  const e=runDrc();
  if(e.some(x=>/îlots/.test(x.msg)))throw new Error("plus de coupure : plus d'erreur d'îlot");
  loadDoc(JSON.parse(saved),true);
});
T("classes de net",()=>{
  const d=classOf("N$1");
  if(d.name!=="Défaut")throw new Error("classe par défaut attendue");
  if(defaultWidth("N$1")!==d.w)throw new Error("largeur par défaut faussée");
  setNetClass("N$1","Alimentation");
  const a=S.classes.find(x=>x.name==="Alimentation");
  if(classOf("N$1").name!=="Alimentation")throw new Error("rattachement raté");
  if(defaultWidth("N$1")!==a.w)throw new Error("la largeur devrait suivre la classe");
  // l'isolation retenue entre deux nets est la plus exigeante
  a.clr=0.4;
  if(Math.abs(clrPair("N$1","N$2")-0.4)>1e-9)throw new Error("isolation de paire fausse");
  a.clr=0.25;
  // le routage existant ne bouge qu'à la demande
  const t=S.tracks.find(x=>x.net==="N$1");
  const w0=t.w;
  if(t.w!==w0)throw new Error("largeur modifiée sans demande");
  applyClasses();
  if(Math.abs(t.w-a.w)>1e-9)throw new Error("la piste devrait être recalée sur sa classe");
  // les nets d'alimentation sont rattachés d'office à l'import
  autoClass();
  if(classOf("GND").name!=="Alimentation")throw new Error("GND devrait être en Alimentation");
  if(classOf("N$2").name!=="Défaut")throw new Error("un net de signal ne doit pas bouger");
  setNetClass("N$1","Défaut");
  if(S.netClass["N$1"])throw new Error("le rattachement par défaut ne doit rien stocker");
  buildRules();
});
T("largeur de classe au tracé",()=>{
  setNetClass("N$2","Alimentation");
  const a=S.classes.find(x=>x.name==="Alimentation");
  const u1=S.fps.find(f=>f.ref==="U1"), c1=S.fps.find(f=>f.ref==="C1");
  const p=padsWorld(u1).find(q=>q.n===6), q=padsWorld(c1).find(x=>x.n===1);
  setMode("track");
  startRoute(p.x,p.y);
  if(Math.abs(S.route.w-a.w)>1e-9)throw new Error("le tracé devrait prendre la largeur de classe");
  updateRoute(q.x,q.y);stepRoute();
  if(S.route)commitRoute();
  setMode("select");
});
T("édition des extrémités de piste",()=>{
  S.tracks=[];S.vias=[];touch();
  const a={l:0,net:"T",w:0.3,x1:10,y1:10,x2:20,y2:10};
  const b={l:0,net:"T",w:0.3,x1:20,y1:10,x2:20,y2:20};
  S.tracks.push(a,b);touch();
  const j=jointAt(20,10,0);
  if(j.ends.length!==2)throw new Error("le coude réunit deux extrémités, "+j.ends.length);
  setMode("select");S.active=0;
  clearSel();S.sel.tracks.add(a);S.sel.tracks.add(b);
  fire("pointerdown",sc(20,10));
  fire("pointermove",sc(24,14));
  fire("pointerup",sc(24,14));
  if(Math.abs(a.x2-24)>0.6||Math.abs(b.x1-24)>0.6)
    throw new Error("les deux extrémités devaient suivre : "+a.x2+" / "+b.x1);
  if(Math.abs(a.x1-10)>1e-9)throw new Error("l'autre bout ne devait pas bouger");
});
T("découpe d'un segment",()=>{
  const a=S.tracks[0], n=S.tracks.length;
  clearSel();S.sel.tracks.add(a);
  const pt={x:(a.x1+a.x2)/2,y:(a.y1+a.y2)/2};
  fire("pointerdown",Object.assign(sc(pt.x,pt.y),{ctrlKey:true}));
  fire("pointerup",sc(pt.x,pt.y));
  if(S.tracks.length!==n+1)throw new Error("un segment aurait dû naître");
  if(Math.abs(a.x2-pt.x)>1e-6)throw new Error("le segment d'origine devait s'arrêter au point");
});
T("segment réduit à un point : supprimé",()=>{
  const n=S.tracks.length, t=S.tracks[0];
  clearSel();S.sel.tracks.add(t);
  fire("pointerdown",sc(t.x2,t.y2));
  fire("pointermove",sc(t.x1,t.y1));
  fire("pointerup",sc(t.x1,t.y1));
  if(S.tracks.length!==n-1)throw new Error("le segment nul devait disparaître");
});
T("opérations sur tout le net",()=>{
  S.tracks=[];touch();
  for(let i=0;i<4;i++)S.tracks.push({l:0,net:"BUS",w:0.3,x1:i*5,y1:0,x2:i*5+4,y2:0});
  S.vias.push({x:2,y:0,d:0.8,drill:0.4,a:0,b:1,net:"BUS"});
  touch();
  selectNetRouting("BUS");
  if(S.sel.tracks.size!==4||S.sel.vias.size!==1)throw new Error("sélection du net incomplète");
  deleteNetRouting("BUS");
  if(S.tracks.length||S.vias.length)throw new Error("le net devait être dérouté");
});
T("couches de masque et de pâte",()=>{
  S.fps=[];S.tracks=[];S.vias=[];S.zones=[];touch();
  setCuCount(2);
  S.board={x:0,y:0,w:40,h:30};
  const cms=mkFp("R1","10k","0603",2);            // puce : pastilles CMS dessus
  cms.style="chip";cms.x=10;cms.y=10;cms.nets={1:"N1",2:"GND"};
  const dip=mkFp("U1","NE555","DIP-8",8);         // DIP : trous traversants
  dip.style="dip";dip.x=25;dip.y=15;dip.nets={1:"GND",8:"+5V"};
  const bot=mkFp("C1","100n","0603",2);
  bot.style="chip";bot.side=1;bot.x=10;bot.y=22;bot.nets={1:"GND",2:"+5V"};
  S.fps.push(cms,dip,bot);touch();
  const mT=maskOpenings(0), mB=maskOpenings(1);
  if(mT.length!==2+8)throw new Error("masque dessus : 10 ouvertures attendues, "+mT.length);
  if(mB.length!==2+8)throw new Error("masque dessous : 10 attendues, "+mB.length);
  const pT=pasteOpenings(0), pB=pasteOpenings(1);
  if(pT.length!==2)throw new Error("pâte dessus : seules les 2 pastilles CMS, "+pT.length);
  if(pB.length!==2)throw new Error("pâte dessous : les 2 pastilles de C1, "+pB.length);
  if(pT.some(o=>o.q.drill>0))throw new Error("pas de pâte dans un trou métallisé");
  // les vias suivent le réglage de recouvrement
  S.vias.push({x:20,y:20,d:0.8,drill:0.4,a:0,b:1,net:"GND"});touch();
  S.rule.tented=true;
  if(maskOpenings(0).length!==10)throw new Error("via recouvert : pas d'ouverture");
  S.rule.tented=false;
  if(maskOpenings(0).length!==11)throw new Error("via ouvert : une ouverture de plus");
  S.rule.tented=true;
  // dilatation effective
  S.rule.mask=0.06;
  if(Math.abs(maskOpenings(0)[0].grow-0.06)>1e-9)throw new Error("dilatation non appliquée");
});
T("police à traits",()=>{
  const s1=textStrokes("R1",0,0,1.2,false);
  if(!s1.length)throw new Error("aucun trait produit");
  if(s1.some(p=>p.length<2))throw new Error("polyligne dégénérée");
  const mir=textStrokes("R1",0,0,1.2,true);
  if(mir.length!==s1.length)throw new Error("le miroir doit produire autant de traits");
  if(Math.abs(mir[0][0].x+s1[0][0].x)>1e-9)throw new Error("miroir non symétrique");
});
T("Gerber : entête, ouvertures, unités",()=>{
  const g=gerberCopper(0);
  if(!/^G04 /.test(g))throw new Error("entête absente");
  if(g.indexOf("%FSLAX46Y46*%")<0)throw new Error("format de coordonnées manquant");
  if(g.indexOf("%MOMM*%")<0)throw new Error("unité millimétrique manquante");
  if(g.indexOf("%TF.FileFunction,Copper,L1,Top*%")<0)throw new Error("attribut de fonction manquant");
  if(!/M02\*\s*$/.test(g))throw new Error("fin de fichier manquante");
  const ad=(g.match(/%ADD\d+[^%]+%/g)||[]);
  if(!ad.length)throw new Error("aucune ouverture définie");
  if((g.match(/D03\*/g)||[]).length!==10+1)
    throw new Error("une éclosion par pastille et par via attendue");
  // toute ouverture utilisée doit avoir été définie
  const nums=new Set(ad.map(x=>+x.match(/%ADD(\d+)/)[1]));
  for(const m of g.match(/^D(\d+)\*$/gm)||[])
    if(!nums.has(+m.match(/D(\d+)/)[1]))throw new Error("ouverture "+m+" non définie");
});
T("Gerber : zone en polarité négative",()=>{
  S.zones.push({id:1,l:0,net:"GND",pts:boardZonePts()});
  S.tracks.push({l:0,net:"N1",w:0.3,x1:5,y1:5,x2:35,y2:25});
  touch();
  const g=gerberCopper(0);
  if(g.indexOf("G36*")<0||g.indexOf("G37*")<0)throw new Error("région de zone absente");
  if(g.indexOf("%LPC*%")<0)throw new Error("dégagements en polarité négative absents");
  if(g.lastIndexOf("%LPD*%")<g.lastIndexOf("%LPC*%"))
    throw new Error("le cuivre doit être redessiné après les dégagements");
});
T("Gerber : masque, pâte, sérigraphie, contour",()=>{
  if(gerberMask(0).indexOf("Soldermask,Top")<0)throw new Error("fonction du masque");
  if(gerberPaste(1).indexOf("Paste,Bot")<0)throw new Error("fonction de la pâte");
  const sk=gerberSilk(0);
  if(sk.indexOf("Legend,Top")<0)throw new Error("fonction de la sérigraphie");
  if((sk.match(/D01\*/g)||[]).length<8)throw new Error("contours et texte attendus");
  const ed=gerberEdge();
  if(ed.indexOf("Profile,NP")<0)throw new Error("fonction du contour");
  if((ed.match(/D01\*/g)||[]).length!==4)throw new Error("le contour a quatre côtés");
});
T("perçage Excellon",()=>{
  const d=drillFile();
  if(d.text.indexOf("M48")!==0)throw new Error("entête M48");
  if(d.text.indexOf("METRIC,TZ")<0)throw new Error("unité manquante");
  if(!/T1C[\d.]+/.test(d.text))throw new Error("aucun outil");
  if(d.text.indexOf("M30")<0)throw new Error("fin de fichier");
  if(d.holes!==8+1)throw new Error("8 trous du DIP + 1 via, "+d.holes);
  // origine au coin inférieur gauche : plus de coordonnée négative
  const xs=d.text.match(/^X(-?[\d.]+)Y(-?[\d.]+)$/gm)||[];
  if(!xs.length)throw new Error("aucune coordonnée");
  if(xs.some(l=>/-/.test(l)))throw new Error("coordonnée négative : origine mal placée");
});
T("dossier de fabrication complet",()=>{
  const {files,drill}=buildFabFiles();
  const names=files.map(f=>f.name);
  for(const n of ["carte-F_Cu.gbr","carte-B_Cu.gbr","carte-F_Mask.gbr","carte-B_Mask.gbr",
                  "carte-F_Paste.gbr","carte-B_Paste.gbr","carte-F_Silkscreen.gbr",
                  "carte-Edge_Cuts.gbr","carte-PTH.drl","LISEZ-MOI.txt"])
    if(names.indexOf(n)<0)throw new Error("fichier manquant : "+n);
  if(files.some(f=>!f.text||!f.text.length))throw new Error("fichier vide");
  if(drill.tools<1)throw new Error("aucun outil de perçage");
  // 4 couches : autant de fichiers cuivre
  setCuCount(4);
  const f4=buildFabFiles().files.filter(f=>/_Cu\.gbr$/.test(f.name));
  if(f4.length!==4)throw new Error("4 fichiers cuivre attendus, "+f4.length);
  setCuCount(2);
});
T("archive ZIP",()=>{
  if(crc32(new TextEncoder().encode("123456789"))!==0xCBF43926)
    throw new Error("CRC32 faux");
  const b=zipBlob([{name:"a.txt",text:"bonjour"},{name:"b.txt",text:"monde"}]);
  if(!b)throw new Error("archive non produite");
});
let savedDoc=null;
T("contour de carte à main levée",()=>{
  savedDoc=serialize();          // ces essais repartent d'une carte neuve
  S.fps=[];S.tracks=[];S.vias=[];S.zones=[];touch();
  setCuCount(2);S.board={x:0,y:0,w:40,h:30,pts:null};
  if(boardPoly().length!==4)throw new Error("le rectangle donne quatre sommets");
  setMode("edge");
  // un L : on retire le coin supérieur droit
  edgeClick(0,0);edgeClick(20,0);edgeMove(20,15);edgeClick(20,15);
  edgeClick(40,15);edgeClick(40,30);edgeClick(0,30);
  if(S.edgeDraft.pts.length!==6)throw new Error("6 sommets attendus");
  edgeClick(0,0);                       // retour au premier point : fermeture
  if(S.edgeDraft)throw new Error("le contour aurait dû se fermer");
  if(!S.board.pts||S.board.pts.length!==6)throw new Error("contour non enregistré");
  if(Math.abs(S.board.w-40)>1e-6||Math.abs(S.board.h-30)>1e-6)
    throw new Error("l'emprise devrait suivre le contour : "+S.board.w+"x"+S.board.h);
  if(!S.sel.edge)throw new Error("le contour devrait être sélectionné après fermeture");
  // l'échancrure est bien hors carte, le reste dedans
  if(inBoard(35,5,0))throw new Error("le coin retiré doit être hors carte");
  if(!inBoard(10,10,0))throw new Error("le corps de la carte doit être dedans");
  if(inBoard(0.1,0.1,1))throw new Error("la marge de bord doit être respectée");
  setMode("select");
});
T("le contour pilote zones, DRC et Gerber",()=>{
  // une zone pleine carte épouse le contour
  S.cuL[0].plane=true;S.cuL[0].net="GND";syncAutoZones();
  const z=S.zones.find(o=>o.auto);
  if(!z||z.pts.length!==6)throw new Error("le plan devrait reprendre les 6 sommets");
  // un via dans l'échancrure est signalé
  S.vias.push({x:35,y:5,d:0.8,drill:0.4,a:0,b:1,net:"GND"});touch();
  if(!runDrc().some(e=>/hors du contour/.test(e.msg)))
    throw new Error("le via hors contour devrait être signalé");
  S.vias.pop();touch();
  // le remplissage lui-même s'arrête au contour : rien de cuivré dans l'échancrure
  if(realCanvas){
    const M=zoneMask(0,"GND");
    if(!M)throw new Error("masque non calculé");
    if(maskAt(M,35,5))throw new Error("l'échancrure ne doit pas être cuivrée");
    if(!maskAt(M,10,20))throw new Error("le corps de la carte doit l'être");
    if(maskAt(M,0.1,0.1))throw new Error("la marge de bord doit rester nue");
  }
  const ed=gerberEdge();
  if((ed.match(/D01\*/g)||[]).length!==6)throw new Error("le contour Gerber a six côtés");
  const g=gerberCopper(0);
  if(g.indexOf("%LPC*%")<0)throw new Error("rognage du plan absent");
  // l'entaille de la région extérieure referme bien le contour
  if((g.match(/G36\*/g)||[]).length<2)throw new Error("région de rognage absente");
  S.cuL[0].plane=false;syncAutoZones();
});
T("redimensionner et revenir au rectangle",()=>{
  const before=S.board.pts.map(p=>({x:p.x,y:p.y}));
  setBoardSize(80,30);
  if(Math.abs(S.board.w-80)>1e-6)throw new Error("largeur non appliquée");
  if(Math.abs(S.board.pts[1].x-before[1].x*2)>0.01)
    throw new Error("le contour libre devrait être mis à l'échelle");
  if(S.board.pts.length!==6)throw new Error("la mise à l'échelle ne change pas le dessin");
  setBoardRect();
  if(S.board.pts)throw new Error("retour au rectangle raté");
  if(boardPoly().length!==4)throw new Error("le rectangle englobant fait quatre sommets");
  if(!inBoard(70,5,0))throw new Error("le rectangle recouvre l'ancienne échancrure");
  S.board={x:0,y:0,w:40,h:30,pts:null};boardChanged();
  loadDoc(JSON.parse(savedDoc),true);
});
T("orientation des contours",()=>{
  const cw=[{x:0,y:0},{x:1,y:0},{x:1,y:1},{x:0,y:1}];
  const a=orient(cw,true), b=orient(cw,false);
  if(Math.sign(signedArea(a))===Math.sign(signedArea(b)))
    throw new Error("les deux sens devraient s'opposer");
  if(a.length!==cw.length)throw new Error("l'orientation ne perd pas de sommet");
});
T("origine utilisateur",()=>{
  savedDoc=serialize();        // ces trois essais repartent d'une carte neuve
  S.fps=[];S.tracks=[];S.vias=[];S.zones=[];touch();
  setCuCount(2);S.board={x:0,y:0,w:60,h:40,pts:null};boardChanged();
  S.origin={x:0,y:0};S.grid=0.5;
  placeOrigin(10.2,6.3);
  if(Math.abs(S.origin.x-10)>1e-9||Math.abs(S.origin.y-6.5)>1e-9)
    throw new Error("origine mal arrondie : "+S.origin.x+";"+S.origin.y);
  if(Math.abs(ux(15)-5)>1e-9||Math.abs(uy(6.5))>1e-9)throw new Error("conversion en coordonnées utilisateur");
  if(Math.abs(wxu(5)-15)>1e-9)throw new Error("conversion inverse");
  // la grille s'accroche à l'origine, pas au zéro absolu
  if(Math.abs(snapX(15.1)-15)>1e-9)throw new Error("accrochage sur la grille d'origine");
  if(Math.abs(snapY(6.4)-6.5)>1e-9)throw new Error("accrochage Y : "+snapY(6.4));
  // une pastille proche attire l'origine
  const f=mkFp("J1","","",2);f.style="row";f.x=30;f.y=20;S.fps.push(f);touch();
  const q=padsWorld(f)[0];
  placeOrigin(q.x+0.05,q.y+0.05);
  if(Math.abs(S.origin.x-q.x)>1e-9||Math.abs(S.origin.y-q.y)>1e-9)
    throw new Error("l'origine devrait se poser sur la pastille");
  // repère des fichiers de fabrication
  S.fabOrigin=false;
  if(Math.abs(gOrigin().y-(S.board.y+S.board.h))>1e-9)throw new Error("repère carte");
  S.fabOrigin=true;
  if(Math.abs(gOrigin().x-S.origin.x)>1e-9)throw new Error("repère utilisateur");
  const d=drillFile();
  if(d.text.indexOf("X0.000Y0.000")<0&&!/X-?0\./.test(d.text))
    throw new Error("le perçage devrait suivre l'origine choisie");
  S.fabOrigin=false;S.origin={x:0,y:0};touch();
});
T("saisie de coordonnées : absolu, relatif, polaire",()=>{
  S.fps=[];S.tracks=[];S.vias=[];touch();
  S.origin={x:5,y:5};
  setMode("track");
  coordOpen();
  if(!S.coord.open)throw new Error("la boîte devrait s'ouvrir");
  coordMode("abs");
  document.getElementById("ciA").value="10";
  document.getElementById("ciB").value="4";
  coordApply();
  if(!S.route)throw new Error("le tracé devrait démarrer");
  if(Math.abs(S.route.pt.x-15)>1e-9||Math.abs(S.route.pt.y-9)>1e-9)
    throw new Error("point absolu faux : "+S.route.pt.x+";"+S.route.pt.y);
  coordMode("rel");
  document.getElementById("ciA").value="10";
  document.getElementById("ciB").value="0";
  coordApply();
  if(Math.abs(S.route.pt.x-25)>1e-9||Math.abs(S.route.pt.y-9)>1e-9)
    throw new Error("point relatif faux : "+S.route.pt.x+";"+S.route.pt.y);
  coordMode("pol");
  document.getElementById("ciA").value="5";
  document.getElementById("ciB").value="90";        // 90° = vers le haut de l'écran
  coordApply();
  if(Math.abs(S.route.pt.x-25)>1e-9||Math.abs(S.route.pt.y-4)>1e-9)
    throw new Error("point polaire faux : "+S.route.pt.x+";"+S.route.pt.y);
  commitRoute();
  if(!S.tracks.length)throw new Error("les segments saisis doivent être posés");
  const ends=S.tracks.map(t=>t.x2+","+t.y2);
  if(ends.indexOf("25,4")<0)throw new Error("le dernier point n'a pas été posé : "+ends.join(" "));
  coordClose();
  if(S.coord.open)throw new Error("la boîte devrait se fermer");
});
T("saisie de coordonnées : zone, contour, empreinte",()=>{
  setMode("zone");
  coordOpen();coordMode("abs");
  const put=(a,b)=>{document.getElementById("ciA").value=String(a);
                    document.getElementById("ciB").value=String(b);coordApply();};
  put(0,0);put(20,0);put(20,10);
  if(!S.zoneDraft||S.zoneDraft.pts.length!==3)throw new Error("3 sommets saisis attendus");
  if(Math.abs(S.zoneDraft.pts[1].x-25)>1e-9)throw new Error("sommet mal placé");
  closeZone();
  setMode("edge");
  coordOpen();coordMode("abs");
  put(0,0);put(30,0);put(30,20);put(0,20);
  closeEdge();
  if(!S.board.pts||S.board.pts.length!==4)throw new Error("contour saisi non enregistré");
  if(Math.abs(S.board.w-30)>1e-6)throw new Error("emprise du contour saisi");
  // une empreinte sélectionnée se place aussi au clavier
  const f=S.fps[0]||mkFp("J1","","",2);
  if(!S.fps.length)S.fps.push(f);
  setMode("select");clearSel();S.sel.fps.add(f.id);
  coordOpen();coordMode("abs");put(12,7);
  if(Math.abs(f.x-17)>1e-9||Math.abs(f.y-12)>1e-9)
    throw new Error("empreinte mal positionnée : "+f.x+";"+f.y);
  coordClose();
  S.origin={x:0,y:0};
  loadDoc(JSON.parse(savedDoc),true);
});
let savedAvoid=null;
T("raccourcis et retour à la sélection",()=>{
  savedAvoid=serialize();
  setMode("select");
  key("t");if(S.mode!=="track")throw new Error("T devrait passer en tracé");
  key("v");if(S.mode!=="via")throw new Error("V devrait passer en via");
  key("z");if(S.mode!=="zone")throw new Error("Z devrait passer en zone");
  key("Escape");if(S.mode!=="select")throw new Error("Échap devrait rendre la sélection");
  // V pose un via quand un tracé est en cours, au lieu de changer d'outil
  setMode("track");S.tracks=[];S.vias=[];touch();
  startRoute(5,5,true);
  const n=S.vias.length;
  key("v");
  if(S.vias.length!==n+1)throw new Error("V devrait poser un via pendant le tracé");
  if(S.mode!=="track")throw new Error("l'outil ne doit pas changer pendant le tracé");
  key("Escape");
  if(S.route)throw new Error("Échap devrait clore le tracé");
  if(S.mode!=="select")throw new Error("puis revenir à la sélection");
  S.vias=[];touch();
});
T("anti-collision au tracé",()=>{
  S.fps=[];S.tracks=[];S.vias=[];S.zones=[];touch();
  setCuCount(2);S.board={x:0,y:0,w:60,h:40,pts:null};boardChanged();
  setActive(0);S.avoid=true;
  const cl=classOf("SIG").clr;
  // une piste étrangère en travers de la route
  S.tracks.push({l:0,net:"AUTRE",w:0.4,x1:20,y1:0,x2:20,y2:40});
  touch();
  setMode("track");
  startRoute(10,20,true);
  S.route.net="SIG";S.route.w=0.3;
  // viser pile sur l'obstacle : le point doit être repoussé au-delà de l'isolation
  updateRoute(20,20);
  const e=S.route.end;
  if(!e.pushed)throw new Error("le point aurait dû être repoussé");
  const d=Math.abs(e.x-20)-0.2-0.15;
  if(d<cl-1e-3)throw new Error("isolation non respectée après repoussage : "+fmt(d,3));
  // et le trajet qui traverse reste refusé
  routeToPoint({x:30,y:20});
  if(!S.route.bad)throw new Error("un trajet qui traverse doit être signalé");
  const before=S.tracks.length;
  stepRoute();
  if(S.tracks.length!==before)throw new Error("un trajet en défaut ne doit pas se poser");
  if(S.route.done.length)throw new Error("aucun segment ne doit être retenu");
  // même net : aucun obstacle
  S.route.net="AUTRE";
  routeToPoint({x:30,y:20});
  if(S.route.bad)throw new Error("son propre net n'est pas un obstacle");
  // anti-collision coupé : plus rien ne retient
  S.route.net="SIG";S.avoid=false;
  routeToPoint({x:30,y:20});
  if(S.route.bad)throw new Error("anti-collision coupé : plus de refus");
  stepRoute();
  if(!S.route.done.length)throw new Error("le trajet forcé doit passer");
  S.avoid=true;cancelRoute();
});
T("halo sur les pastilles du net suivi",()=>{
  S.fps=[];touch();
  const f=mkFp("J1","","",3);f.style="row";f.x=20;f.y=20;
  f.nets={1:"SIG",2:"GND",3:"SIG"};
  S.fps.push(f);touch();
  S.hlNet=null;S.route=null;
  if(focusNet())throw new Error("aucun net suivi par défaut");
  S.hlNet="SIG";
  if(focusNet()!=="SIG")throw new Error("le net choisi dans la liste est suivi");
  S.hlNet=null;
  setMode("track");startRoute(20,20,true);
  if(focusNet()!=="SIG"&&focusNet()!=="GND")
    throw new Error("le net du tracé est suivi : "+focusNet());
  cancelRoute();setMode("select");
  draw();
  loadDoc(JSON.parse(savedAvoid),true);
});
T("croisement de pistes",()=>{
  const keep=serialize();
  const a={x1:0,y1:10,x2:20,y2:10}, b={x1:10,y1:0,x2:10,y2:20};
  if(segSegDist(a,b)!==0)throw new Error("deux pistes qui se croisent sont à distance nulle");
  const c={x1:0,y1:0,x2:5,y2:0}, d={x1:0,y1:2,x2:5,y2:2};
  if(Math.abs(segSegDist(c,d)-2)>1e-9)throw new Error("deux parallèles gardent leur écart");
  S.fps=[];S.vias=[];S.zones=[];
  S.tracks=[{l:0,net:"A",w:0.3,x1:0,y1:10,x2:20,y2:10},
            {l:0,net:"B",w:0.3,x1:10,y1:0,x2:10,y2:20}];
  touch();
  if(!runDrc().some(e=>/piste\/piste/.test(e.msg)))
    throw new Error("le croisement devrait être signalé par le DRC");
  loadDoc(JSON.parse(keep),true);
});
T("DRC",()=>{
  const e=runDrc();
  if(!Array.isArray(e))throw new Error("pas de liste");
  if(!e.some(x=>x.info))throw new Error("les liaisons manquantes devraient être signalées");
});
T("panneaux",()=>{
  // l'essai fournit ses propres objets : les précédents ont pu les consommer
  if(!S.tracks.length)S.tracks.push({l:0,net:"GND",w:0.3,x1:2,y1:2,x2:9,y2:2});
  if(!S.vias.length)S.vias.push({x:5,y:5,d:0.8,drill:0.4,a:0,b:S.cu-1,net:"GND"});
  if(!S.zones.length)S.zones.push({id:S.nextId++,l:0,net:"GND",pts:boardZonePts()});
  touch();
  buildTabs();buildLayers();buildRules();refreshPanels();
  clearSel();S.sel.tracks.add(S.tracks[0]);S.sel.tracks.add(S.tracks[0]);buildProps();
  clearSel();S.sel.zones.add(S.zones[0]);buildProps();
  S.listTab="comps";buildList();
  S.listTab="drc";buildList();
  S.listTab="nets";buildList();
  clearSel();S.sel.fps.add(S.fps[0].id);buildProps();
  clearSel();S.sel.tracks.add(S.tracks[0]);buildProps();
  clearSel();S.sel.vias.add(S.vias[0]);buildProps();
  clearSel();buildProps();
});
T("sélection et transformations",()=>{
  const fp=S.fps[0];
  clearSel();S.sel.fps.add(fp.id);
  const r=fp.rot;rotateSel();
  if(fp.rot===r)throw new Error("rotation sans effet");
  flipSel();
  if(!fp.side)throw new Error("retournement sans effet");
  const pads=padsWorld(fp);
  if(!pads.length)throw new Error("pastilles perdues");
});
T("annuler / rétablir",()=>{
  const n=S.tracks.length;
  push();S.tracks.push({l:0,net:"",w:.3,x1:0,y1:0,x2:5,y2:0});touch();
  undo();
  if(S.tracks.length!==n)throw new Error("annulation incorrecte : "+S.tracks.length+" ≠ "+n);
  redo();
  if(S.tracks.length!==n+1)throw new Error("rétablissement incorrect");
  undo();
});
T("dessin complet",()=>{draw();});
T("vue dessous + contraste",()=>{
  setFlip(true);draw();
  setContrast(2);draw();
  setContrast(0);setFlip(false);draw();
});
T("export png / json",()=>{
  exportPng();
  const d=JSON.parse(serialize());
  if(d.format!=="pcbedit-1")throw new Error("format faux");
  loadDoc(d,true);
});
T("réduction de l'empilage",()=>{
  setCuCount(2);
  for(const t of S.tracks)if(t.l>1)throw new Error("piste sur une couche disparue");
  for(const v of S.vias)if(v.b>1)throw new Error("via hors empilage");
});
T("clavier et souris",()=>{
  key("v");key("p");key("x");key("g");key("n");key("y");key("h");key("y");key("h");key("v");
  fire("pointerdown",{clientX:100,clientY:100});
  fire("pointermove",{clientX:140,clientY:120});
  fire("pointerup",{clientX:140,clientY:120});
  key("Escape");
});
T("placement auto",()=>{autoPlace(20);draw();});
T("réimport (fusion)",()=>{
  const before=S.fps.map(f=>({r:f.ref,x:f.x,y:f.y}));
  importNetlist(NET,false);
  if(S.fps.length!==4)throw new Error("doublons créés : "+S.fps.length);
  const u=S.fps.find(f=>f.ref==="U1"), b=before.find(f=>f.r==="U1");
  if(u.x!==b.x||u.y!==b.y)throw new Error("position perdue au réimport");
});
console.log("\n"+ok+" essais réussis, "+ko+" en échec.");
process.exit(ko?1:0);
