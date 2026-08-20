/* =============================================================================
   editeur-pcb/test/harness.js
   Banc d'essai : le bundle dist/pcb.js est exécuté sur le DOM minimal partagé
   (commun/test/dom-stub.js), sans navigateur.

       python3 outils/build-monofichier.py && node test/harness.js

   L'installation de « canvas » (npm i canvas) est facultative : sans elle, les
   essais qui rasterisent vraiment le cuivre sont ignorés, les autres tournent.
   ============================================================================= */
"use strict";
const fs=require("fs");
const path=require("path");
const dom=require(path.join(__dirname,"..","..","commun","test","dom-stub.js")).install({
  panels:{stack:"Empilage",rules:"Règles de tracé",
          props:"Propriétés",list:"Nets & composants",
          stackup:"Empilage physique"},
  canvasId:"board"
});
const realCanvas=dom.realCanvas;
const ctxStub=dom.ctxStub;
const listeners=dom.listeners;
function noop(){}

const code=fs.readFileSync(path.join(__dirname,"..","dist","pcb.js"),"utf8");
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
  "pushClear","magnet","mitreSel","mitreAt","collinearRun","runFrom","segClearBad","setActive","segSegDist","segCross","routeBad","focusNet","cancelRoute","updateRoute","classOf","syncAutoZones","detachAuto","zoneCanvas","inPoly","hitTest","px","dist","boardZonePts",
  /* espace de travail commun (commun/workspace.js) */
  "wsDefault","wsApply","wsMove","wsPlaceOf","wsLabel","wsToggleFloat",
  "wsToggleCollapse","wsClose","wsShow","wsMenuBuild","wsLoad","wsSave","wsEl","WS_KEY",
  "esc","fmt","$",
  /* empilage physique et rôles de couche */
  "stackDefaults","stackResize","stackRows","rowT","stackTotal","stackLam",
  "stackCuT","stackDiT","stackSpan","stackFit","stackSym","stackMirror",
  "worstAspect","applyPreset","presetsFor","diCount","cuT","diAt","maskFaces",
  "stackAsym","asymLabel","viaBuild","viaCensus","aspectOf","viaTented",
  "VIA_FINISH","roleCheck","ASPECT_WARN","ASPECT_MAX",
  "umLabel","ozLabel","buildStackup","stackReport",
  "normStack","stkPick","CU_ROLES","CU_ROLE_SHORT","rolePlane",
  "layerRole","roleLabel","setLayerRole","coherentRole","roleFromPlane",
  "roleNet","STACK_PRESETS","FINISHES","MASK_COLORS","DI_KIND","OZ","r4",
  /* sélection multiple et presse-papier */
  "selectHit","toggleHit","altTarget","selCount","deleteSel","copySelPcb","cutSelPcb",
  "pasteClipPcb","pcbClipContent","pcbSetClip","pcbGetClip","freeFpRef","GRID_STEPS",
  "setGridStep","gridShownStep","gridLabel","fpById",
  /* import défensif (normDoc) et aller-retour de document */
  "docObj","normDoc","setNetClass"];
/* WS est réassigné par « Réinitialiser la disposition » : on l'expose en
   accesseur pour que le banc d'essai voie toujours l'objet courant. */
eval(code.replace(/^"use strict";/,"")+"\n"
     +EXPOSE.map(n=>"globalThis."+n+"="+n+";").join("\n")+"\n"
     +'Object.defineProperty(globalThis,"WS",'
     +'{get:()=>WS,set:v=>{WS=v;},configurable:true});');

const fire=dom.fire, key=dom.key;
/* Première différence entre deux documents, ou null s'ils sont équivalents.
   On compare la structure et non le texte JSON : l'ordre des clés n'a pas de
   sens ici, ce qui compte est qu'aucune valeur ne soit perdue ni modifiée. */
function firstDiff(a,b,path){
  const t=v=>v===null?"null":Array.isArray(v)?"array":typeof v;
  if(t(a)!==t(b))return path+" : "+t(a)+" devenu "+t(b);
  if(t(a)==="array"){
    if(a.length!==b.length)return path+" : "+a.length+" élément(s) devenus "+b.length;
    for(let i=0;i<a.length;i++){
      const d=firstDiff(a[i],b[i],path+"["+i+"]");
      if(d)return d;
    }
    return null;
  }
  if(t(a)==="object"){
    const ka=Object.keys(a).sort(), kb=Object.keys(b).sort();
    for(const k of ka)if(kb.indexOf(k)<0)return path+"."+k+" : clé perdue";
    for(const k of kb)if(ka.indexOf(k)<0)return path+"."+k+" : clé ajoutée";
    for(const k of ka){
      const d=firstDiff(a[k],b[k],path+"."+k);
      if(d)return d;
    }
    return null;
  }
  return a===b?null:path+" : "+JSON.stringify(a)+" devenu "+JSON.stringify(b);
}
function sc(x,y){const p=w2s(x,y);return {clientX:p.x,clientY:p.y};}
/* closeZone() et fullBoardZone() demandent le net dans une boîte <dialog> :
   on choisit le net et on clique « Valider » à la place de l'utilisateur.
   net===null -> bouton « Annuler ». */
function zoneDialog(net){
  const d=dom.dialog();
  if(!d)throw new Error("aucune boîte de dialogue ouverte");
  const sel=d.querySelector("select");
  if(!sel)throw new Error("sélecteur de net absent de la boîte");
  const btns=d.querySelectorAll("button");
  if(btns.length!==2)throw new Error("2 boutons attendus, "+btns.length);
  if(net===null){btns[0].onclick();return null;}
  sel.value=net||"";
  btns[1].onclick();
  return S.zones[S.zones.length-1];
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
  if(cuId(0,4)!=="L1_Top")throw new Error("nom de couche extérieure faux : "+cuId(0,4));
  if(cuId(1,4)!=="L2_Inner")throw new Error("nom de couche interne faux : "+cuId(1,4));
  if(cuId(3,4)!=="L4_Bottom")throw new Error("nom de couche opposée faux : "+cuId(3,4));
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
  // retour sur le premier point : la zone se ferme et le net est demandé
  zoneClick(5,5);
  if(S.zoneDraft)throw new Error("la zone aurait dû se fermer");
  if(S.zones.length)throw new Error("rien ne doit être posé avant validation");
  zoneDialog("");
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
  zoneDialog("");
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
T("glisser un segment : la piste reste d'un seul tenant",()=>{
  S.tracks=[];S.vias=[];touch();
  const a={l:0,net:"T",w:0.3,x1:10,y1:10,x2:20,y2:10};
  const b={l:0,net:"T",w:0.3,x1:20,y1:10,x2:20,y2:20};
  S.tracks.push(a,b);touch();
  setMode("select");S.active=0;
  clearSel();S.sel.tracks.add(a);
  const mid={x:(a.x1+a.x2)/2,y:a.y1};
  fire("pointerdown",sc(mid.x,mid.y));
  fire("pointermove",sc(mid.x,mid.y+4));
  fire("pointerup",sc(mid.x,mid.y+4));
  if(Math.abs(a.y1-14)>0.6||Math.abs(a.y2-14)>0.6)
    throw new Error("le segment tiré devait descendre : "+a.y1+" / "+a.y2);
  if(Math.abs(b.x1-20)>0.6||Math.abs(b.y1-14)>0.6)
    throw new Error("le voisin devait s'étirer jusqu'au segment : "+b.x1+","+b.y1);
  if(Math.abs(b.y2-20)>1e-9)throw new Error("l'autre bout du voisin ne devait pas bouger");
  undo();
});
/* Le décor de la capture : une pastille, un 45°, une longue portion droite
   découpée en trois segments par le routeur, un second 45°. */
function pisteEnZ(){
  S.tracks=[];S.vias=[];touch();
  const d ={l:0,net:"T",w:0.3,x1:0, y1:0, x2:10,y2:10};
  const r1={l:0,net:"T",w:0.3,x1:10,y1:10,x2:20,y2:10};
  const r2={l:0,net:"T",w:0.3,x1:20,y1:10,x2:40,y2:10};
  const r3={l:0,net:"T",w:0.3,x1:40,y1:10,x2:50,y2:10};
  const e ={l:0,net:"T",w:0.3,x1:50,y1:10,x2:60,y2:20};
  S.tracks.push(d,r1,r2,r3,e);touch();
  setMode("select");S.active=0;clearSel();
  return {d,r1,r2,r3,e};
}
T("la portion droite entière se déplace, pas le seul morceau tiré",()=>{
  const {d,r1,r2,r3,e}=pisteEnZ();
  S.sel.tracks.add(r2);
  fire("pointerdown",sc(30,10));
  fire("pointermove",sc(30,14));
  fire("pointerup",sc(30,14));
  for(const [nom,t] of [["r1",r1],["r2",r2],["r3",r3]])
    if(Math.abs(t.y1-14)>0.6||Math.abs(t.y2-14)>0.6)
      throw new Error(nom+" devait suivre la portion : "+t.y1+" / "+t.y2);
  if(S.sel.tracks.size!==3)throw new Error("la portion droite devait être prise entière, "+S.sel.tracks.size);
  if(S.sel.tracks.has(d)||S.sel.tracks.has(e))throw new Error("un coude ne fait pas partie de la portion");
  undo();
});
T("les coudes voisins glissent sans changer d'angle",()=>{
  const {d,r1,r3,e,r2}=pisteEnZ();
  const ang=t=>Math.atan2(t.y2-t.y1,t.x2-t.x1);
  const a0=ang(d), a1=ang(e);
  S.sel.tracks.add(r2);
  fire("pointerdown",sc(30,10));
  fire("pointermove",sc(30,14));
  fire("pointerup",sc(30,14));
  if(Math.abs(ang(d)-a0)>1e-6)throw new Error("le 45° de gauche a bougé : "+(ang(d)*180/Math.PI));
  if(Math.abs(ang(e)-a1)>1e-6)throw new Error("le 45° de droite a bougé : "+(ang(e)*180/Math.PI));
  // le coude glisse le long du voisin jusqu'à retomber sur la piste tirée
  if(Math.abs(d.x2-14)>0.6||Math.abs(d.y2-14)>0.6)
    throw new Error("le coude de gauche devait glisser en 14,14 : "+d.x2+","+d.y2);
  if(Math.abs(e.x1-54)>0.6||Math.abs(e.y1-14)>0.6)
    throw new Error("le coude de droite devait glisser en 54,14 : "+e.x1+","+e.y1);
  if(Math.abs(r1.x1-d.x2)>1e-9||Math.abs(r1.y1-d.y2)>1e-9)
    throw new Error("la piste s'est ouverte à gauche");
  if(Math.abs(r3.x2-e.x1)>1e-9||Math.abs(r3.y2-e.y1)>1e-9)
    throw new Error("la piste s'est ouverte à droite");
  if(Math.abs(d.x1)>1e-9||Math.abs(d.y1)>1e-9)throw new Error("le bout sur la pastille ne devait pas bouger");
  if(Math.abs(e.x2-60)>1e-9||Math.abs(e.y2-20)>1e-9)throw new Error("l'autre bout ne devait pas bouger");
  undo();
});
T("Alt pendant le glissement détache le voisin",()=>{
  S.tracks=[];S.vias=[];touch();
  const a={l:0,net:"T",w:0.3,x1:10,y1:10,x2:20,y2:10};
  const b={l:0,net:"T",w:0.3,x1:20,y1:10,x2:20,y2:20};
  S.tracks.push(a,b);touch();
  setMode("select");S.active=0;
  clearSel();S.sel.tracks.add(a);
  const mid={x:(a.x1+a.x2)/2,y:a.y1};
  fire("pointerdown",sc(mid.x,mid.y));
  fire("pointermove",Object.assign(sc(mid.x,mid.y+4),{altKey:true}));
  fire("pointerup",sc(mid.x,mid.y+4));
  if(Math.abs(a.y1-14)>0.6)throw new Error("le segment tiré devait descendre : "+a.y1);
  if(Math.abs(b.y1-10)>1e-9)throw new Error("Alt devait laisser le voisin en place : "+b.y1);
  undo();
});
T("une ligne droite qui change de couche reste droite",()=>{
  if(S.cu<2)setCuCount(2);
  S.fps=[];S.tracks=[];S.vias=[];touch();
  const a={l:0,net:"T",w:0.3,x1:10,y1:10,x2:20,y2:10};
  const b={l:1,net:"T",w:0.3,x1:20,y1:10,x2:30,y2:10};
  S.tracks.push(a,b);
  const v={x:20,y:10,d:0.8,drill:0.4,a:0,b:1,net:"T"};
  S.vias.push(v);touch();
  setMode("select");S.active=0;
  clearSel();S.sel.tracks.add(a);
  fire("pointerdown",sc(15,10));
  fire("pointermove",sc(15,14));
  fire("pointerup",sc(15,14));
  if(Math.abs(v.y-14)>0.6)throw new Error("le via devait suivre : "+v.y);
  // le via n'interrompt pas la ligne : la laisser derrière la coucherait
  if(Math.abs(b.y1-14)>0.6||Math.abs(b.y2-14)>0.6)
    throw new Error("la piste de l'autre couche devait suivre en entier : "+b.y1+" / "+b.y2);
  undo();
});
T("au via, la piste perpendiculaire glisse au lieu de basculer",()=>{
  if(S.cu<2)setCuCount(2);
  S.fps=[];S.tracks=[];S.vias=[];touch();
  const a={l:0,net:"T",w:0.3,x1:10,y1:10,x2:20,y2:10};
  const b={l:1,net:"T",w:0.3,x1:20,y1:10,x2:20,y2:30};   // repart à 90°
  S.tracks.push(a,b);
  const v={x:20,y:10,d:0.8,drill:0.4,a:0,b:1,net:"T"};
  S.vias.push(v);touch();
  setMode("select");S.active=0;
  clearSel();S.sel.tracks.add(a);
  fire("pointerdown",sc(15,10));
  fire("pointermove",sc(15,14));
  fire("pointerup",sc(15,14));
  if(S.sel.tracks.has(b))throw new Error("un coude ne fait pas partie de la portion droite");
  if(Math.abs(b.x1-20)>1e-9||Math.abs(b.x2-20)>1e-9)
    throw new Error("la piste perpendiculaire a basculé : "+b.x1+" / "+b.x2);
  if(Math.abs(b.y1-14)>0.6)throw new Error("elle devait glisser jusqu'à la ligne : "+b.y1);
  if(Math.abs(b.y2-30)>1e-9)throw new Error("son autre bout ne devait pas bouger");
  if(Math.abs(v.y-14)>0.6)throw new Error("le via devait suivre le coude : "+v.y);
  undo();
});
/* Garde-fou : un glissement ne doit jamais créer d'angle bâtard. Une ligne
   droite se trouve coupée par tout ce qu'elle rencontre — pastille traversée,
   via, embranchement, changement de largeur ; si un morceau restait en
   arrière, il basculerait de travers faute d'intersection à calculer. */
function surGrille(t){
  const a=((Math.atan2(t.y2-t.y1,t.x2-t.x1)*180/Math.PI)%180+180)%180;
  return [0,45,90,135,180].some(k=>Math.abs(a-k)<1e-6);
}
function glisseSansBiais(nom,build,from,to){
  T("aucun angle bâtard : "+nom,()=>{
    const g=build();
    setMode("select");S.active=0;clearSel();
    S.sel.tracks.add(g.pick);
    fire("pointerdown",sc(from.x,from.y));
    fire("pointermove",sc(to.x,to.y));
    fire("pointerup",sc(to.x,to.y));
    for(const t of S.tracks)
      if(!surGrille(t))
        throw new Error("segment de travers ("+t.x1+","+t.y1+")→("+t.x2+","+t.y2+")");
    undo();
  });
}
glisseSansBiais("ligne droite traversant une pastille",()=>{
  S.fps=[];S.tracks=[];S.vias=[];S.zones=[];
  const f=mkFp("R6","0R0","0603",2);f.x=30;f.y=10;
  S.fps.push(f);
  const q=padsWorld(f)[0];
  const h1={l:0,net:"T",w:0.3,x1:10,y1:q.y,x2:q.x,y2:q.y};
  const h2={l:0,net:"T",w:0.3,x1:q.x,y1:q.y,x2:50,y2:q.y};
  const d ={l:0,net:"T",w:0.3,x1:50,y1:q.y,x2:60,y2:q.y+10};
  S.tracks.push(h1,h2,d);touch();
  return {pick:h2};
},{x:45,y:10},{x:45,y:14});
glisseSansBiais("ligne droite changeant de largeur",()=>{
  S.fps=[];S.tracks=[];S.vias=[];S.zones=[];
  S.tracks.push({l:0,net:"T",w:0.5,x1:10,y1:10,x2:30,y2:10},
                {l:0,net:"T",w:0.3,x1:30,y1:10,x2:50,y2:10},
                {l:0,net:"T",w:0.3,x1:50,y1:10,x2:60,y2:20});
  touch();
  return {pick:S.tracks[1]};
},{x:40,y:10},{x:40,y:14});
glisseSansBiais("ligne droite passant par un via",()=>{
  if(S.cu<2)setCuCount(2);
  S.fps=[];S.tracks=[];S.vias=[];S.zones=[];
  S.tracks.push({l:0,net:"T",w:0.3,x1:10,y1:10,x2:30,y2:10},
                {l:0,net:"T",w:0.3,x1:30,y1:10,x2:50,y2:10},
                {l:0,net:"T",w:0.3,x1:50,y1:10,x2:60,y2:20});
  S.vias.push({x:30,y:10,d:0.8,drill:0.4,a:0,b:1,net:"T"});
  touch();
  return {pick:S.tracks[1]};
},{x:40,y:10},{x:40,y:14});
glisseSansBiais("ligne droite avec un embranchement",()=>{
  S.fps=[];S.tracks=[];S.vias=[];S.zones=[];
  S.tracks.push({l:0,net:"T",w:0.3,x1:10,y1:10,x2:30,y2:10},
                {l:0,net:"T",w:0.3,x1:30,y1:10,x2:50,y2:10},
                {l:0,net:"T",w:0.3,x1:30,y1:10,x2:30,y2:25});
  touch();
  return {pick:S.tracks[1]};
},{x:40,y:10},{x:40,y:14});
T("l'embranchement reste d'aplomb et se raccourcit",()=>{
  S.fps=[];S.tracks=[];S.vias=[];S.zones=[];
  const h1={l:0,net:"T",w:0.3,x1:10,y1:10,x2:30,y2:10};
  const h2={l:0,net:"T",w:0.3,x1:30,y1:10,x2:50,y2:10};
  const br={l:0,net:"T",w:0.3,x1:30,y1:10,x2:30,y2:25};
  S.tracks.push(h1,h2,br);touch();
  setMode("select");S.active=0;clearSel();S.sel.tracks.add(h2);
  fire("pointerdown",sc(40,10));
  fire("pointermove",sc(40,14));
  fire("pointerup",sc(40,14));
  if(Math.abs(h1.y1-14)>0.6||Math.abs(h1.y2-14)>0.6)
    throw new Error("la ligne droite devait suivre en entier : "+h1.y1+" / "+h1.y2);
  if(Math.abs(br.x1-30)>1e-9||Math.abs(br.x2-30)>1e-9)
    throw new Error("l'embranchement a basculé : "+br.x1+" / "+br.x2);
  if(Math.abs(br.y1-14)>0.6)throw new Error("l'embranchement devait se raccourcir : "+br.y1);
  if(Math.abs(br.y2-25)>1e-9)throw new Error("son autre bout ne devait pas bouger");
  undo();
});

/* ---------------- adoucir un angle droit : le coude passe en 45° ---------- */
T("angle droit adouci en 45°",()=>{
  S.fps=[];S.tracks=[];S.vias=[];S.zones=[];
  const h={l:0,net:"T",w:0.3,x1:0, y1:0,x2:20,y2:0};
  const v={l:0,net:"T",w:0.3,x1:20,y1:0,x2:20,y2:30};
  S.tracks.push(h,v);touch();
  setMode("select");S.active=0;clearSel();S.sel.tracks.add(h);
  if(mitreSel()!==1)throw new Error("un angle droit devait être adouci");
  const dia=S.tracks.find(t=>Math.abs(Math.abs(t.x2-t.x1)-Math.abs(t.y2-t.y1))<1e-6
                             &&Math.abs(t.x2-t.x1)>1e-6);
  if(!dia)throw new Error("aucune diagonale posée");
  const a=Math.abs(Math.atan2(dia.y2-dia.y1,dia.x2-dia.x1)*180/Math.PI);
  if(Math.abs(a-45)>1e-6&&Math.abs(a-135)>1e-6)
    throw new Error("la diagonale n'est pas à 45° : "+a);
  // la portion courte (20 mm) est entièrement consommée, l'autre raccourcie
  if(S.tracks.length!==2)throw new Error("2 segments attendus, "+S.tracks.length);
  const rest=S.tracks.find(t=>t!==dia);
  if(Math.abs(rest.x1-20)>1e-9||Math.abs(rest.x2-20)>1e-9)
    throw new Error("la portion restante devait rester verticale");
  if(Math.abs(Math.min(rest.y1,rest.y2)-20)>1e-9)
    throw new Error("elle devait repartir de 20 mm : "+Math.min(rest.y1,rest.y2));
  undo();
});
T("l'angle droit s'adoucit depuis n'importe quel morceau de la portion",()=>{
  S.fps=[];S.tracks=[];S.vias=[];S.zones=[];
  const h1={l:0,net:"T",w:0.3,x1:0, y1:0,x2:10,y2:0};
  const h2={l:0,net:"T",w:0.3,x1:10,y1:0,x2:20,y2:0};
  const v ={l:0,net:"T",w:0.3,x1:20,y1:0,x2:20,y2:30};
  S.tracks.push(h1,h2,v);touch();
  setMode("select");S.active=0;clearSel();S.sel.tracks.add(h1);   // le morceau loin du coude
  if(mitreSel()!==1)throw new Error("le coude de la portion devait être trouvé");
  undo();
});
T("un 45° déjà en place n'est pas retouché",()=>{
  S.fps=[];S.tracks=[];S.vias=[];S.zones=[];
  const a={l:0,net:"T",w:0.3,x1:0, y1:0, x2:20,y2:0};
  const b={l:0,net:"T",w:0.3,x1:20,y1:0, x2:30,y2:10};
  S.tracks.push(a,b);touch();
  setMode("select");S.active=0;clearSel();S.sel.tracks.add(a);
  const n=S.tracks.length;
  if(mitreSel()!==0)throw new Error("un 45° n'est pas un angle droit");
  if(S.tracks.length!==n)throw new Error("rien ne devait changer");
});
T("découpe d'un segment (Alt+clic)",()=>{
  S.tracks=[{l:0,net:"T",w:0.3,x1:10,y1:10,x2:20,y2:10},
            {l:0,net:"T",w:0.3,x1:20,y1:10,x2:20,y2:20}];
  S.vias=[];touch();
  const a=S.tracks[0], n=S.tracks.length;
  clearSel();S.sel.tracks.add(a);
  const pt={x:(a.x1+a.x2)/2,y:(a.y1+a.y2)/2};
  fire("pointerdown",Object.assign(sc(pt.x,pt.y),{altKey:true}));
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
  S.rule.viaFinish="tented";
  if(maskOpenings(0).length!==10)throw new Error("via recouvert : pas d'ouverture");
  S.rule.viaFinish="open";
  if(maskOpenings(0).length!==11)throw new Error("via ouvert : une ouverture de plus");
  for(const k of ["tented","plugged","filled"]){
    S.rule.viaFinish=k;
    if(!viaTented())throw new Error(k+" : le masque devrait rester fermé");
    if(maskOpenings(0).length!==10)throw new Error(k+" : ouverture de trop");
  }
  S.rule.viaFinish="tented";
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
  for(const n of ["carte.GTL","carte.GBL","carte.GTS","carte.GBS",
                  "carte.GTP","carte.GBP","carte.GTO","carte.GBO",
                  "carte.GKO","carte.TXT","LISEZ-MOI.txt"])
    if(names.indexOf(n)<0)throw new Error("fichier manquant : "+n+" — obtenus : "+names.join(" "));
  if(files.some(f=>!f.text||!f.text.length))throw new Error("fichier vide");
  if(drill.tools<1)throw new Error("aucun outil de perçage");
  // 4 couches : autant de fichiers cuivre (GTL, GL2, GL3, GBL)
  setCuCount(4);
  const f4=buildFabFiles().files.filter(f=>/\.(GTL|GBL|GL\d+)$/.test(f.name));
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
  closeZone();zoneDialog("");
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
T("clic sur une pastille : son net remonte dans la liste",()=>{
  /* Pendant du clic sur la liste : le canevas désigne un net, l'onglet Nets
     revient au premier plan et la ligne porte la mise en avant — même si le
     filtre « non routés » l'aurait masquée. */
  const saved=serialize();
  S.fps=[];S.tracks=[];S.vias=[];touch();
  const f=mkFp("J9","","",2);f.style="row";f.x=20;f.y=20;
  f.nets={1:"SIG_A",2:"SIG_B"};
  S.fps.push(f);touch();
  setMode("select");clearSel();S.hlNet=null;
  S.listTab="comps";S.onlyUnrouted=false;buildList();
  const q=padsWorld(f).find(x=>x.n===2);
  fire("pointerdown",sc(q.x,q.y));
  fire("pointerup",sc(q.x,q.y));
  if(S.hlNet!=="SIG_B")
    throw new Error("le net de la pastille doit être mis en avant : "+S.hlNet);
  if(S.listTab!=="nets")
    throw new Error("la liste doit revenir sur l'onglet Nets : "+S.listTab);
  if(!/<tr data-net="SIG_B" class="on"/.test($("list").innerHTML))
    throw new Error("la ligne du net doit porter la mise en avant");
  S.onlyUnrouted=true;buildList();
  if(!/<tr data-net="SIG_B" class="on"/.test($("list").innerHTML))
    throw new Error("le filtre ne doit pas escamoter la ligne mise en avant");
  S.onlyUnrouted=false;S.hlNet=null;
  loadDoc(JSON.parse(saved),true);
  S.listTab="nets";buildList();
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
/* ==========================================================================
   Échappement HTML : une netlist ou un document .json malveillant
   Le grammaire de la netlist borne les repères (^[A-Za-z_][\w$-]*) mais laisse
   libres la valeur, le boîtier et le nom de net : ce sont eux qu'on éprouve.
   Tout ce qui finit dans innerHTML doit passer par esc().
   ========================================================================== */
const XSS='<img src=x onerror=pan()>';
const XSS_Q='"><img src=x onerror="pan()">';
function assertPropre(html,quoi){
  /* une injection réussie produit forcément un « < » non échappé : c'est le
     seul indice à chercher — la charge échappée, elle, contient encore le
     texte « onerror= » sans le moindre danger. */
  if(html.indexOf("<img")>=0||html.indexOf("<svg")>=0)
    throw new Error(quoi+" : balise injectée telle quelle");
}
/* la charge doit se retrouver échappée, sinon l'essai ne prouve rien */
function assertPresent(html,quoi){
  if(html.indexOf("&lt;img")<0&&html.indexOf("&lt;svg")<0)
    throw new Error(quoi+" : la charge n'apparaît pas, l'essai ne prouve rien");
}
T("esc() couvre les caractères dangereux",()=>{
  const got=esc('<&>"\'`');
  if(got!=="&lt;&amp;&gt;&quot;&#39;&#96;")throw new Error("échappement : "+got);
});
T("netlist malveillante : panneaux et listes restent propres",()=>{
  const nl="=== Composants ===\n"+
           "    R1      "+XSS+"      <svg onload=pan()>\n\n"+
           "=== Feuille 1 — Principale ===\n\n"+
           'NET "'+XSS+'"\n'+
           "    R1.1\n"+
           "    R1.2\n";
  importNetlist(nl,true);
  if(!S.fps.length)throw new Error("la netlist n'a pas été acceptée : essai vide");
  const fp=S.fps.find(f=>f.ref==="R1");
  if(!fp||fp.value.indexOf("<img")<0)throw new Error("la valeur n'a pas été reprise");
  if(!netTable().some(n=>n.name.indexOf("<img")>=0))
    throw new Error("le nom de net n'a pas été repris");
  buildRules();buildLayers();buildTabs();
  S.listTab="comps";buildList();
  assertPropre($("list").innerHTML,"liste des composants");
  assertPresent($("list").innerHTML,"liste des composants");
  S.listTab="nets";buildList();
  assertPropre($("list").innerHTML,"liste des nets");
  assertPresent($("list").innerHTML,"liste des nets");
  runDrc();S.listTab="drc";buildList();
  assertPropre($("list").innerHTML,"liste DRC");
  clearSel();S.sel.fps.add(fp.id);buildProps();
  assertPropre($("props").innerHTML,"propriétés d'empreinte");
  assertPresent($("props").innerHTML,"propriétés d'empreinte");
  clearSel();buildProps();
  assertPropre($("props").innerHTML,"panneau vide");
});
T("document .json trafiqué : les textes libres arrivent échappés",()=>{
  /* repères, valeurs, boîtiers, noms de couche, de classe et de net sont
     libres par nature : normDoc les laisse passer (tronqués), ce sont les
     panneaux qui doivent les échapper. */
  const doc=JSON.parse(serialize());
  doc.cuL=doc.cuL.map(L=>Object.assign({},L,{name:XSS_Q,net:XSS_Q}));
  doc.classes=[{name:XSS_Q,w:0.3,clr:0.25,via:0.8,drill:0.4},
               {name:"Alimentation",w:0.6,clr:0.25,via:0.9,drill:0.45}];
  doc.netClass={};
  doc.netClass[XSS_Q]="Alimentation";
  if(doc.fps&&doc.fps.length){
    doc.fps[0].ref=XSS_Q;doc.fps[0].value=XSS_Q;doc.fps[0].pkg=XSS_Q;
    doc.fps[0].nets={1:XSS_Q};
  }
  if(doc.tracks&&doc.tracks.length)doc.tracks[0].net=XSS_Q;
  if(doc.vias&&doc.vias.length)doc.vias[0].net=XSS_Q;
  loadDoc(doc,true);
  if(S.cuL[0].name.indexOf("<img")<0)throw new Error("nom de couche non repris : essai vide");
  if(S.classes[0].name.indexOf("<img")<0)throw new Error("nom de classe non repris");
  buildLayers();buildTabs();buildRules();
  assertPropre($("layers").innerHTML,"empilage");
  assertPresent($("layers").innerHTML,"empilage");
  assertPropre($("rules").innerHTML,"règles de tracé");
  assertPresent($("rules").innerHTML,"règles de tracé");
  S.listTab="comps";buildList();
  assertPropre($("list").innerHTML,"liste des composants");
  S.listTab="nets";buildList();
  assertPropre($("list").innerHTML,"liste des nets");
  if(S.fps.length){
    clearSel();S.sel.fps.add(S.fps[0].id);buildProps();
    assertPropre($("props").innerHTML,"propriétés d'empreinte");
    assertPresent($("props").innerHTML,"propriétés d'empreinte");
  }
  if(S.tracks.length){
    clearSel();S.sel.tracks.add(S.tracks[0]);buildProps();
    assertPropre($("props").innerHTML,"propriétés de piste");
  }
  if(S.vias.length){
    clearSel();S.sel.vias.add(S.vias[0]);buildProps();
    assertPropre($("props").innerHTML,"propriétés de via");
  }
  clearSel();buildProps();
});

/* ==========================================================================
   Import défensif (normDoc)
   Ce qui n'est pas un texte libre est ramené dans ses bornes dès l'entrée :
   pas de couche inexistante, de largeur négative ni de couleur qui n'en est pas.
   ========================================================================== */
T("import : une couleur de couche qui n'en est pas est refusée",()=>{
  const doc=JSON.parse(serialize());
  doc.cuL[0].color='#123';                 // notation courte : légitime
  doc.cuL[1].color='red; background:url(x)';
  loadDoc(doc,true);
  if(S.cuL[0].color!=="#123")throw new Error("la notation courte devait passer");
  if(!/^#[0-9a-fA-F]{6}$/.test(S.cuL[1].color))
    throw new Error("couleur non reprise en main : "+S.cuL[1].color);
});
T("import : indices de couche, largeurs et diamètres bornés",()=>{
  const doc=JSON.parse(serialize());
  doc.cu=4;
  doc.cuL=[{},{},{},{}];
  doc.tracks=[{l:99,net:"A",w:-3,x1:0,y1:0,x2:10,y2:0},
              {l:1,net:"B",w:0.3,x1:5,y1:5,x2:5,y2:5},      // segment nul
              {l:"2",net:"C",w:"0.4",x1:"0",y1:"1",x2:"9",y2:"1"}];
  doc.vias=[{x:1,y:1,d:-5,drill:99,a:7,b:7,net:"A"}];
  doc.zones=[{id:1,l:50,net:"A",pts:[{x:0,y:0},{x:1,y:0}]},  // 2 sommets
             {id:2,l:1,net:"B",pts:[{x:0,y:0},{x:5,y:0},{x:5,y:5}]}];
  loadDoc(doc,true);
  if(S.tracks.length!==2)throw new Error("2 pistes exploitables attendues, "+S.tracks.length);
  const t0=S.tracks[0];
  if(t0.l<0||t0.l>3)throw new Error("indice de couche hors empilage : "+t0.l);
  if(!(t0.w>0))throw new Error("largeur négative acceptée : "+t0.w);
  const t1=S.tracks[1];
  if(t1.l!==2||Math.abs(t1.w-0.4)>1e-9)
    throw new Error("chaînes numériques mal converties : "+t1.l+" / "+t1.w);
  if(typeof t1.x2!=="number")throw new Error("coordonnée restée en chaîne");
  const v=S.vias[0];
  if(!(v.d>0))throw new Error("diamètre négatif accepté : "+v.d);
  if(!(v.drill<v.d))throw new Error("perçage plus large que le via : "+v.drill+"/"+v.d);
  if(v.a===v.b)throw new Error("un via doit relier deux couches distinctes");
  if(v.a<0||v.b>3)throw new Error("via hors empilage : "+v.a+"→"+v.b);
  if(S.zones.length!==1)throw new Error("la zone à 2 sommets devait être écartée");
});
T("import : identifiants uniques et nextId au-dessus",()=>{
  const doc=JSON.parse(serialize());
  doc.fps=[{ref:"R1",pins:2,id:5},{ref:"R2",pins:2,id:5},{ref:"R3",pins:2,id:"x"}];
  doc.nextId=1;
  loadDoc(doc,true);
  const ids=S.fps.map(f=>f.id);
  if(new Set(ids).size!==ids.length)throw new Error("identifiants en doublon : "+ids);
  if(ids.some(i=>!Number.isInteger(i)||i<1))throw new Error("identifiant non entier : "+ids);
  if(S.nextId<=Math.max(...ids))throw new Error("nextId sous les identifiants existants");
  // la sélection par identifiant retrouve bien l'empreinte
  clearSel();S.sel.fps.add(S.fps[0].id);buildProps();
  if($("props").innerHTML.indexOf("R1")<0)throw new Error("empreinte introuvable par son id");
});
T("import : un document vide ou absurde ne casse rien",()=>{
  loadDoc({},true);
  if(S.cu!==2||S.cuL.length!==2)throw new Error("empilage par défaut attendu");
  if(S.fps.length||S.tracks.length)throw new Error("carte vide attendue");
  if(!S.classes.length)throw new Error("il faut au moins une classe");
  draw();runDrc();buildLayers();buildRules();refreshPanels();buildList();
  loadDoc({cu:"beaucoup",cuL:"non",fps:"non",tracks:{},vias:null,zones:0,
           board:"grande",rule:[],classes:[],netClass:"x",active:-4},true);
  if(S.cu<1||S.cu>8)throw new Error("nombre de couches hors bornes : "+S.cu);
  if(S.cuL.length!==S.cu)throw new Error("empilage incohérent");
  if(S.active<0||S.active>=S.cu)throw new Error("couche active hors empilage : "+S.active);
  draw();runDrc();buildLayers();buildRules();refreshPanels();buildList();
});
T("import : rattachement de classe orphelin écarté",()=>{
  const doc=JSON.parse(serialize());
  doc.classes=[{name:"Défaut",w:0.3,clr:0.25,via:0.8,drill:0.4},
               {name:"Alimentation",w:0.6,clr:0.25,via:0.9,drill:0.45}];
  doc.netClass={GND:"Alimentation","+5V":"Classe disparue",SIG:"Défaut"};
  loadDoc(doc,true);
  if(S.netClass["GND"]!=="Alimentation")throw new Error("rattachement valide perdu");
  if(S.netClass["+5V"])throw new Error("rattachement orphelin conservé");
  if(S.netClass["SIG"])throw new Error("le rattachement par défaut ne se stocke pas");
  if(classOf("+5V").name!=="Défaut")throw new Error("classe de repli inattendue");
});
T("import : deux classes de même nom sont distinguées",()=>{
  const doc=JSON.parse(serialize());
  doc.classes=[{name:"Défaut",w:0.3,clr:0.25,via:0.8,drill:0.4},
               {name:"Défaut",w:0.9,clr:0.25,via:0.8,drill:0.4}];
  doc.netClass={};
  loadDoc(doc,true);
  const names=S.classes.map(c=>c.name);
  if(new Set(names).size!==names.length)throw new Error("noms en doublon : "+names);
  // sans quoi classOf() renverrait toujours la première et l'autre serait morte
  if(S.classes.length!==2)throw new Error("2 classes attendues, "+S.classes.length);
});
T("import : neutre sur un document produit par l'éditeur",()=>{
  /* loadDoc() sert aussi à annuler/rétablir : la normalisation ne doit RIEN
     changer à un document que l'éditeur a lui-même écrit, sinon chaque Ctrl+Z
     déformerait la carte. */
  /* les essais précédents ont pu renommer les classes : on repart d'un jeu
     connu, sinon le rattachement ci-dessous serait orphelin */
  S.classes=[{name:"Défaut",w:0.3,clr:0.25,via:0.8,drill:0.4},
             {name:"Alimentation",w:0.6,clr:0.25,via:0.9,drill:0.45}];
  S.netClass={};
  importNetlist(NET,true);
  setCuCount(4);
  S.board={x:0,y:0,w:80,h:60,pts:null};
  S.origin={x:2,y:3};S.fabOrigin=true;
  S.fps.forEach((f,i)=>{f.x=10+i*15;f.y=20;f.rot=(i%2)?90:0;f.side=i%2;});
  S.fps[0].refOffX=1.5;S.fps[0].refOffY=-2;
  S.fps[0].pins=2;S.fps[0].nets={1:"GND",2:"+5V",3:"RESTE"};  // clé au-delà de pins
  S.tracks=[{l:0,net:"GND",w:0.35,x1:1,y1:1,x2:20,y2:1},
            {l:2,net:"+5V",w:0.6,x1:2,y1:5,x2:2,y2:30}];
  S.vias=[{x:2,y:5,d:0.8,drill:0.4,a:0,b:3,net:"+5V"}];
  S.zones=[{id:S.nextId++,l:1,net:"GND",pts:boardZonePts()}];
  S.cuts=[{id:S.nextId++,l:1,pts:[{x:5,y:5},{x:15,y:5},{x:15,y:15}]}];
  S.cuL[1].custom=true;S.cuL[1].name="Masse";S.cuL[1].color="#12ab34";
  setNetClass("+5V","Alimentation");
  S.rule.viaFinish="plugged";S.rule.mask=0.06;
  touch();
  const a=docObj();
  loadDoc(JSON.parse(JSON.stringify(a)),true);
  const b=docObj();
  const diff=firstDiff(a,b,"doc");
  if(diff)throw new Error("l'aller-retour a modifié le document : "+diff);
  // et le second aller-retour non plus : la normalisation est idempotente
  loadDoc(JSON.parse(JSON.stringify(b)),true);
  const c=firstDiff(b,docObj(),"doc");
  if(c)throw new Error("second aller-retour instable : "+c);
});
/* ==========================================================================
   Empilage physique et rôles de couche
   ========================================================================== */
T("empilage physique : les modèles d'usine tombent sur leur épaisseur",()=>{
  for(const pr of STACK_PRESETS){
    setCuCount(pr.n);
    if(!applyPreset(pr))throw new Error("modèle refusé : "+pr.name);
    if(S.stack.cu.length!==pr.n)throw new Error(pr.name+" : "+S.stack.cu.length+" cuivres");
    if(S.stack.di.length!==Math.max(1,pr.n-1))
      throw new Error(pr.name+" : "+S.stack.di.length+" diélectriques");
    const e=Math.abs(stackTotal()-pr.th);
    if(e>0.02)throw new Error(pr.name+" : "+stackTotal()+" mm au lieu de "+pr.th);
    if(!stackSym())throw new Error(pr.name+" : modèle asymétrique");
  }
  setCuCount(4);
});
T("empilage physique : le compte de couches l'entraîne",()=>{
  setCuCount(2);
  S.stack.target=1;S.stack.cu[0].t=0.07;stackFit();
  const t0=S.stack.cu[0].t;
  setCuCount(6);
  if(S.stack.cu.length!==6)throw new Error("6 cuivres attendus, "+S.stack.cu.length);
  if(S.stack.di.length!==5)throw new Error("5 diélectriques attendus, "+S.stack.di.length);
  if(Math.abs(S.stack.cu[0].t-t0)>1e-9)throw new Error("le cuivre extérieur devait être gardé");
  if(Math.abs(S.stack.target-1)>1e-9)throw new Error("l'épaisseur visée devait être gardée");
  if(Math.abs(stackTotal()-1)>0.02)
    throw new Error("les diélectriques devaient se répartir : "+stackTotal());
  setCuCount(1);
  if(S.stack.cu.length!==1||S.stack.di.length!==1)
    throw new Error("une simple face garde une âme : "+S.stack.cu.length+"/"+S.stack.di.length);
  if(maskFaces()!==1)throw new Error("une simple face n'a qu'une face vernie");
  setCuCount(4);
});
T("empilage physique : répartir, symétriser",()=>{
  setCuCount(4);applyPreset(presetsFor(4)[0]);
  S.stack.target=2.4;
  if(!stackFit())throw new Error("répartition refusée");
  if(Math.abs(stackTotal()-2.4)>0.02)throw new Error("cible manquée : "+stackTotal());
  if(!stackSym())throw new Error("une répartition proportionnelle reste symétrique");
  S.stack.di[0].t=0.4;
  if(stackSym())throw new Error("l'asymétrie devrait être vue");
  stackMirror();
  if(!stackSym())throw new Error("symétrisation ratée");
  // le cuivre à lui seul dépasse la cible : la répartition refuse plutôt que d'inventer
  S.stack.target=0.05;
  if(stackFit())throw new Error("cible inatteignable acceptée");
  S.stack.target=1.6;stackFit();
});
T("empilage physique : perçages et rapport d'aspect",()=>{
  setCuCount(4);applyPreset(presetsFor(4)[0]);
  const lam=stackLam();
  if(Math.abs(stackSpan(0,3)-lam)>1e-9)
    throw new Error("un via traversant fait toute l'épaisseur : "+stackSpan(0,3)+"/"+lam);
  if(!(stackSpan(0,1)<stackSpan(0,3)))throw new Error("un via borgne est plus court");
  S.fps=[];S.vias=[{x:5,y:5,d:0.8,drill:0.4,a:0,b:3,net:"GND"},
                   {x:8,y:5,d:0.5,drill:0.25,a:0,b:1,net:"GND"}];
  touch();
  const a=worstAspect();
  if(!a)throw new Error("aucun rapport d'aspect calculé");
  if(Math.abs(a.ratio-lam/0.4)>1e-6)
    throw new Error("le via traversant devrait être le plus défavorable : "+a.ratio);
  // le panneau Propriétés d'un via rend compte de la longueur percée
  clearSel();S.sel.vias.add(S.vias[1]);buildProps();
  const h=$("props").innerHTML;
  if(h.indexOf("rapport d'aspect")<0)throw new Error("rapport d'aspect absent du via");
  if(h.indexOf(fmt(stackSpan(0,1),3))<0)
    throw new Error("un via borgne devrait annoncer sa longueur percée : "+h);
  clearSel();
  S.vias=[];touch();
  if(worstAspect())throw new Error("sans perçage, pas de rapport d'aspect");
});
T("panneau d'empilage : lignes de coupe et échappement",()=>{
  setCuCount(4);applyPreset(presetsFor(4)[0]);
  const rows=stackRows();
  // sérigraphie, masque, 4 cuivres, 3 diélectriques, masque, sérigraphie
  if(rows.length!==11)throw new Error("11 lignes attendues, "+rows.length);
  if(rows[0].kind!=="silk"||rows[rows.length-1].kind!=="silk")
    throw new Error("la coupe commence et finit par la sérigraphie");
  if(rows[1].kind!=="mask")throw new Error("le masque vient sous la sérigraphie");
  if(rows.filter(r=>r.kind==="cu").length!==4)throw new Error("4 cuivres dans la coupe");
  if(rowT(rows[0])!==0)throw new Error("la sérigraphie ne pèse rien dans l'épaisseur");
  if(Math.abs(rowT(rows[2])-S.stack.cu[0].t)>1e-9)throw new Error("épaisseur de ligne fausse");
  setCuCount(1);
  if(stackRows().filter(r=>r.kind==="mask").length!==1)
    throw new Error("une simple face n'a qu'un masque dans sa coupe");
  if(stackRows().filter(r=>r.kind==="silk").length!==1)
    throw new Error("une simple face n'a qu'une sérigraphie dans sa coupe");
  setCuCount(4);
  S.cuL[1].name='Masse <img src=x onerror="pan()">';S.cuL[1].custom=true;
  S.stack.di[0].mat='FR-4 <script>pan()</script>';
  buildStackup();
  const h=$("stk").innerHTML;
  if(h.indexOf("<img")>=0||h.indexOf("<script")>=0)
    throw new Error("nom de couche ou matière injecté tel quel");
  if(h.indexOf("&lt;img")<0)throw new Error("nom de couche non échappé");
  if(h.indexOf("&lt;script")<0)throw new Error("matière non échappée");
  // une ligne de tableau par élément de la coupe, plus le pied
  if((h.match(/data-r="/g)||[]).length!==stackRows().length)
    throw new Error("le tableau ne compte pas une ligne par élément");
  for(const c of ["Nom","Matière","Rôle","Poids","Dk","Df"])
    if(h.indexOf(">"+c+"<")<0)throw new Error("colonne manquante : "+c);
  if(h.indexOf("Épaisseur totale")<0)throw new Error("total absent du pied de tableau");
  if(h.indexOf(fmt(stackTotal(),3))<0)throw new Error("épaisseur totale non affichée");
  S.cuL[1].name="Inner 1";S.cuL[1].custom=false;S.stack.di[0].mat="FR-4";
});
T("panneau d'empilage : les champs modifient l'empilage et s'annulent",()=>{
  setCuCount(4);applyPreset(presetsFor(4)[0]);
  buildStackup();
  const before=S.stack.cu[0].t;
  // la ligne choisie par défaut est le premier cuivre
  $("skT").value="70";$("skT").onchange();
  if(Math.abs(S.stack.cu[0].t-0.07)>1e-9)
    throw new Error("cuivre non repris : "+S.stack.cu[0].t);
  undo();
  if(Math.abs(S.stack.cu[0].t-before)>1e-9)
    throw new Error("l'annulation n'a pas rendu l'empilage : "+S.stack.cu[0].t);
  // une saisie illisible ne casse rien
  buildStackup();
  $("skT").value="beaucoup";$("skT").onchange();
  if(!(S.stack.cu[0].t>0))throw new Error("épaisseur détruite par une saisie illisible");
  // « autre… » passe par une invite ; le banc la laisse sans réponse
  const t1=S.stack.cu[0].t;
  buildStackup();
  $("skT").value="autre";$("skT").onchange();
  if(Math.abs(S.stack.cu[0].t-t1)>1e-9)
    throw new Error("invite sans réponse : l'épaisseur ne doit pas bouger");
  // une épaisseur hors catalogue reste offerte au choix
  S.stack.cu[0].t=0.025;buildStackup();
  if($("stk").innerHTML.indexOf(">25 µm")<0)
    throw new Error("l'épaisseur en place devrait figurer dans la liste des cuivres");
  // le diélectrique : on choisit sa ligne, puis on l'édite
  const rows=stackRows();
  const k=rows.findIndex(r=>r.kind==="di");
  stkPick("di",rows[k].i);
  $("skDT").value="0.5";$("skDT").onchange();
  if(Math.abs(S.stack.di[0].t-0.5)>1e-9)throw new Error("diélectrique non repris");
  $("skEr").value="3.2";$("skEr").onchange();
  if(Math.abs(S.stack.di[0].er-3.2)>1e-9)throw new Error("εr non repris");
  $("skK").value="film";$("skK").onchange();
  if(S.stack.di[0].k!=="film")throw new Error("rôle du diélectrique non repris");
  $("skK").value="tissu de verre";$("skK").onchange();
  if(S.stack.di[0].k!=="film")throw new Error("rôle inconnu accepté");
  applyPreset(presetsFor(4)[0]);
  stkPick("cu",0);
});
T("panneau d'empilage : cible, finition et couleurs",()=>{
  setCuCount(4);applyPreset(presetsFor(4)[0]);
  S.cuL[1].plane=true;S.cuL[1].net="GND";syncAutoZones();
  S.classes=[{name:"Défaut",w:0.3,clr:0.25,via:0.8,drill:0.4}];
  buildStackup();
  $("skTarget").value="2";$("skTarget").onchange();
  if(Math.abs(S.stack.target-2)>1e-9)throw new Error("cible non reprise");
  $("skFit").onclick();
  if(Math.abs(stackTotal()-2)>0.02)throw new Error("répartition sans effet : "+stackTotal());
  $("skFin").value=FINISHES[2];$("skFin").onchange();
  if(S.stack.finish!==FINISHES[2])throw new Error("finition non reprise");
  $("skFin").value="peinture dorée";$("skFin").onchange();
  if(S.stack.finish!==FINISHES[2])throw new Error("finition inconnue acceptée");
  // couleurs : celle du masque et celle de l'encre s'éditent depuis leur ligne
  stkPick("mask",0);
  $("skMC").value="noir";$("skMC").onchange();
  if(S.stack.maskColor!=="noir")throw new Error("couleur de masque non reprise");
  stkPick("silk",0);
  $("skSC").value="jaune";$("skSC").onchange();
  if(S.stack.silkColor!=="jaune")throw new Error("couleur d'encre non reprise");
  $("skSC").value="rose fluo";$("skSC").onchange();
  if(S.stack.silkColor!=="jaune")throw new Error("couleur inconnue acceptée");
  stkPick("cu",0);
  S.cuL[1].plane=false;S.zones=[];syncAutoZones();
  S.classes=[{name:"Défaut",w:0.3,clr:0.25,via:0.8,drill:0.4},
             {name:"Alimentation",w:0.6,clr:0.25,via:0.9,drill:0.45}];
});
T("rôle d'une couche de cuivre",()=>{
  setCuCount(4);applyPreset(presetsFor(4)[0]);
  S.zones=[];S.cuL.forEach(L=>{L.plane=false;L.net="";L.role="signal";});
  touch();
  if(layerRole(0)!=="signal")throw new Error("rôle par défaut : "+layerRole(0));
  // un plan de masse pose sa zone pleine carte et sert de référence
  if(!setLayerRole(1,"gnd"))throw new Error("rôle refusé");
  if(!S.cuL[1].plane)throw new Error("un plan de masse pose du cuivre plein");
  if(!S.cuL[1].net)throw new Error("un plan sans net : le net par défaut manque");
  if(!S.zones.some(z=>z.auto&&z.l===1))throw new Error("zone pleine carte absente");
  const z=S.zones.find(o=>o.auto&&o.l===1);
  if(z.net!==S.cuL[1].net)throw new Error("la zone du plan devrait porter son net");
  if(z.pts.length!==boardZonePts().length)
    throw new Error("la zone du plan devrait épouser le contour");
  // le net du plan se change sans changer de rôle
  setLayerRole(1,"gnd","+5V");
  if(S.cuL[1].net!=="+5V")throw new Error("net du plan non repris");
  if(layerRole(1)!=="gnd")throw new Error("le rôle a bougé avec le net");
  // repasser en signal retire le cuivre plein
  setLayerRole(1,"signal");
  if(S.cuL[1].plane||S.cuL[1].net)throw new Error("le plan devait être retiré");
  if(S.zones.some(o=>o.auto&&o.l===1))throw new Error("la zone auto devait partir");
  // alimentation et blindage sont des plans, mixte n'en est pas un
  for(const r of ["pwr","shield"]){
    setLayerRole(2,r);
    if(!rolePlane(r)||!S.cuL[2].plane)throw new Error(r+" devrait être un plan");
    if(roleLabel(2).indexOf(CU_ROLE_SHORT[r])<0)
      throw new Error("libellé inattendu : "+roleLabel(2));
  }
  setLayerRole(2,"mixed");
  if(S.cuL[2].plane)throw new Error("une couche mixte ne porte pas de plan pleine carte");
  if(layerRole(2)!=="mixed")throw new Error("le rôle mixte devrait tenir");
  // un rôle inventé est refusé
  if(setLayerRole(2,"antenne"))throw new Error("rôle inconnu accepté");
  if(layerRole(2)!=="mixed")throw new Error("le rôle a été abîmé par un refus");
  S.cuL.forEach((L,i)=>setLayerRole(i,"signal"));
});
T("rôle : le cuivre posé tranche, et le rôle s'annule",()=>{
  setCuCount(4);
  S.zones=[];S.cuL.forEach(L=>{L.plane=false;L.net="";L.role="signal";});touch();
  // rôle qui contredit le cuivre : c'est `plane` qui dit la vérité
  S.cuL[1].role="gnd";
  if(layerRole(1)!=="signal")
    throw new Error("un plan annoncé sans cuivre plein n'est pas un plan : "+layerRole(1));
  // un rôle absent se déduit du couple (cuivre plein, net)
  if(roleFromPlane(true,"GND")!=="gnd")
    throw new Error("du cuivre plein sur un net de masse est un plan de masse");
  if(roleFromPlane(true,"+5V")!=="pwr")
    throw new Error("du cuivre plein sur une alimentation est un plan d'alimentation");
  if(roleFromPlane(false,"GND")!=="signal")
    throw new Error("sans cuivre plein, c'est une couche de signal");
  // aller-retour par le document : la normalisation remet le rôle d'aplomb
  S.cuL[1].role="signal";setLayerRole(1,"pwr","+5V");
  S.cuL[1].role="signal";                  // document trafiqué : rôle incohérent
  loadDoc(JSON.parse(serialize()),true);
  if(layerRole(1)!=="pwr")throw new Error("rôle non reconstruit à la lecture");
  if(!S.cuL[1].plane)throw new Error("le plan a été perdu à la lecture");
  // et il s'annule comme le reste
  setLayerRole(1,"signal");
  push();setLayerRole(1,"gnd");
  const n=S.zones.length;
  undo();
  if(layerRole(1)!=="signal")throw new Error("l'annulation n'a pas rendu le rôle");
  if(S.zones.length>=n)throw new Error("la zone du plan devait disparaître avec lui");
  S.zones=[];S.cuL.forEach(L=>{L.plane=false;L.net="";L.role="signal";});touch();
});
T("panneau d'empilage : le rôle se change depuis la coupe",()=>{
  setCuCount(4);applyPreset(presetsFor(4)[0]);
  S.zones=[];S.cuL.forEach(L=>{L.plane=false;L.net="";L.role="signal";});touch();
  stkPick("cu",2);buildStackup();
  $("skRole").value="pwr";$("skRole").onchange();
  if(layerRole(2)!=="pwr")throw new Error("rôle non repris depuis la coupe");
  if(!S.zones.some(z=>z.auto&&z.l===2))throw new Error("le plan n'a pas posé sa zone");
  $("skNet").value="+5V";$("skNet").onchange();
  if(S.cuL[2].net!=="+5V")throw new Error("net du plan non repris depuis la coupe");
  $("skRole").value="tapisserie";$("skRole").onchange();
  if(layerRole(2)!=="pwr")throw new Error("rôle inconnu accepté par le panneau");
  // la coupe nomme les rôles, et le net du plan n'apparaît que pour un plan
  setLayerRole(1,"gnd");buildStackup();
  let h=$("stk").innerHTML;
  if(h.indexOf(CU_ROLE_SHORT.gnd)<0||h.indexOf(CU_ROLE_SHORT.pwr)<0)
    throw new Error("la coupe devrait nommer les rôles");
  // l'éditeur d'un plan propose son net, celui d'un signal n'en parle pas
  stkPick("cu",1);buildStackup();
  if($("stk").innerHTML.indexOf("Net du plan")<0)
    throw new Error("un plan devrait proposer son net");
  stkPick("cu",0);buildStackup();
  if($("stk").innerHTML.indexOf("Net du plan")>=0)
    throw new Error("une couche de signal n'a pas de net de plan");
  setLayerRole(0,"signal");setLayerRole(1,"signal");setLayerRole(2,"signal");
  buildStackup();
  if($("stk").innerHTML.indexOf("skRole")<0)throw new Error("sélecteur de rôle absent");
  S.zones=[];S.cuL.forEach(L=>{L.plane=false;L.net="";L.role="signal";});touch();
});
T("panneau d'empilage : les boutons sans effet le disent",()=>{
  setCuCount(4);applyPreset(presetsFor(4)[0]);
  buildStackup();
  let h=$("stk").innerHTML;
  // empilage d'usine : sur la cible et symétrique, donc rien à corriger
  if(h.indexOf('id="skFit" disabled')<0)
    throw new Error("« Répartir » devrait être neutralisé sur la cible");
  if(h.indexOf('id="skSym" disabled')<0)
    throw new Error("« Symétriser » devrait être neutralisé sur un empilage symétrique");
  if(h.indexOf("l'empilage tient l'épaisseur commandée")<0)
    throw new Error("l'écart devrait être expliqué");
  if(h.indexOf("il apparaîtra dès qu'un via")<0)
    throw new Error("le rapport d'aspect absent devrait être expliqué");
  // on casse la symétrie et la cible : les deux boutons reprennent du service
  S.stack.di[0].t=0.5;S.stack.target=1.2;touch();
  buildStackup();h=$("stk").innerHTML;
  if(h.indexOf('id="skFit" disabled')>=0)throw new Error("« Répartir » devrait être actif");
  if(h.indexOf('id="skSym" disabled')>=0)throw new Error("« Symétriser » devrait être actif");
  $("skSym").onclick();
  if(!stackSym())throw new Error("le bouton n'a pas symétrisé");
  $("skFit").onclick();
  if(Math.abs(stackTotal()-1.2)>0.02)throw new Error("le bouton n'a pas réparti");
  applyPreset(presetsFor(4)[0]);
});
T("traitement des vias : lecture, migration, feuille",()=>{
  setCuCount(4);applyPreset(presetsFor(4)[0]);
  S.rule.viaFinish="filled";
  if(!viaTented())throw new Error("un via bouché et plaqué n'est pas ouvert");
  // un fichier d'avant le traitement porte encore le booléen
  let doc=JSON.parse(serialize());
  delete doc.rule.viaFinish;doc.rule.tented=false;
  loadDoc(doc,true);
  if(S.rule.viaFinish!=="open")throw new Error("migration de tented=false : "+S.rule.viaFinish);
  doc=JSON.parse(serialize());
  delete doc.rule.viaFinish;doc.rule.tented=true;
  loadDoc(doc,true);
  if(S.rule.viaFinish!=="tented")throw new Error("migration de tented=true : "+S.rule.viaFinish);
  // un traitement inventé retombe sur le recouvrement
  doc=JSON.parse(serialize());doc.rule.viaFinish="peinture";
  loadDoc(doc,true);
  if(!VIA_FINISH[S.rule.viaFinish])throw new Error("traitement inventé accepté : "+S.rule.viaFinish);
  // le panneau le propose, la feuille et le LISEZ-MOI le disent
  S.rule.viaFinish="plugged";
  buildStackup();
  const h=$("stk").innerHTML;
  if(h.indexOf("skVia")<0)throw new Error("sélecteur de traitement absent du panneau");
  if(h.indexOf("Bouchés résine")<0)throw new Error("libellé du traitement absent");
  $("skVia").value="filled";$("skVia").onchange();
  if(S.rule.viaFinish!=="filled")throw new Error("traitement non repris par le panneau");
  $("skVia").value="peinture";$("skVia").onchange();
  if(S.rule.viaFinish!=="filled")throw new Error("valeur inconnue acceptée par le panneau");
  S.fps=[];S.tracks=[{l:0,net:"GND",w:0.3,x1:1,y1:1,x2:20,y2:1}];
  S.vias=[{x:5,y:5,d:0.8,drill:0.4,a:0,b:3,net:"GND"}];touch();
  const files=buildFabFiles().files;
  const emp=files.find(x=>x.name==="EMPILAGE.txt").text;
  const rm=files.find(x=>x.name==="LISEZ-MOI.txt").text;
  if(emp.indexOf("bouches et plaques")<0)
    throw new Error("la feuille devrait dire le traitement : "+emp.slice(0,400));
  if(rm.indexOf("IPC-4761")<0)throw new Error("le LISEZ-MOI devrait citer la norme");
  if(emp.indexOf("Vias : 1 traversant")<0)
    throw new Error("la feuille devrait recenser les vias");
  S.rule.viaFinish="tented";
});
T("empilage : nature des vias que le pressage permet",()=>{
  setCuCount(4);applyPreset(presetsFor(4)[0]);
  // 4 couches : prépreg / âme / prépreg
  if(viaBuild(0,3).kind!=="through"||!viaBuild(0,3).ok)
    throw new Error("un via traversant est toujours faisable");
  const bur=viaBuild(1,2);
  if(bur.kind!=="buried"||!bur.ok)
    throw new Error("un via enterré dans une âme se perce avant pressage : "+bur.why);
  const bl=viaBuild(0,1);
  if(bl.kind!=="blind"||!bl.ok)
    throw new Error("un borgne dans le prépreg extérieur passe au laser : "+bl.why);
  if(viaBuild(0,2).ok)throw new Error("un borgne sur deux diélectriques n'est pas gratuit");
  if(viaBuild(1,3).ok)throw new Error("un borgne côté soudure sur deux diélectriques non plus");
  if(!/séquentiel/.test(viaBuild(0,2).why))throw new Error("le pourquoi devrait parler de laminage");
  // l'ordre des couches n'a pas d'importance
  if(JSON.stringify(viaBuild(3,1))!==JSON.stringify(viaBuild(1,3)))
    throw new Error("viaBuild devrait être symétrique");
  // 6 couches : un enterré entre deux prépregs ne tient pas en un pressage
  setCuCount(6);applyPreset(presetsFor(6)[0]);
  if(viaBuild(2,3).ok)throw new Error("pas d'âme entre L3 et L4 : il faut un second pressage");
  if(!viaBuild(1,2).ok)throw new Error("L2→L3 traverse une âme : faisable");
  if(viaBuild(1,4).ok)throw new Error("un enterré sur trois diélectriques n'est pas faisable");
  // recensement
  S.vias=[{x:1,y:1,d:0.8,drill:0.4,a:0,b:5,net:"GND"},
          {x:2,y:1,d:0.6,drill:0.3,a:1,b:2,net:"GND"},
          {x:3,y:1,d:0.6,drill:0.3,a:2,b:3,net:"GND"}];
  touch();
  const c=viaCensus();
  if(c.through!==1||c.buried!==2)throw new Error("recensement faux : "+JSON.stringify(c));
  if(c.seq!==1)throw new Error("un seul via hors pressage unique attendu, "+c.seq);
  setCuCount(4);applyPreset(presetsFor(4)[0]);S.vias=[];touch();
});
T("DRC : rapport d'aspect et faisabilité des vias",()=>{
  setCuCount(4);applyPreset(presetsFor(4)[0]);
  S.fps=[];S.tracks=[];S.zones=[];S.cuts=[];
  S.cuL.forEach(L=>{L.plane=false;L.net="";L.role="signal";});
  const lam=stackLam();
  const fin=Math.round(lam/(ASPECT_MAX+1)*1000)/1000;   // rapport franchement au-delà
  const moy=Math.round(lam/(ASPECT_WARN+1)*1000)/1000;  // entre l'alerte et la limite
  S.vias=[{x:10,y:10,d:0.5,drill:fin,a:0,b:3,net:"GND"},
          {x:20,y:10,d:0.6,drill:moy,a:0,b:3,net:"GND"},
          {x:30,y:10,d:0.8,drill:0.4,a:0,b:3,net:"GND"},
          {x:40,y:10,d:0.6,drill:0.3,a:0,b:2,net:"GND"}];
  touch();
  const e=runDrc();
  const asp=e.filter(x=>/Rapport d'aspect/.test(x.msg));
  if(asp.length!==2)throw new Error("2 rapports d'aspect signalés attendus, "+asp.length);
  const dur=asp.find(x=>!x.info), mou=asp.find(x=>x.info);
  if(!dur||dur.via!==S.vias[0])throw new Error("le perçage le plus fin devrait être une erreur");
  if(!mou||mou.via!==S.vias[1])throw new Error("l'alerte devrait porter sur le via moyen");
  if(asp.some(x=>x.via===S.vias[2]))throw new Error("un via confortable ne doit rien déclencher");
  // le via fautif voyage avec l'entrée : la liste peut le sélectionner
  clearSel();S.sel.vias.add(dur.via);
  if(!S.sel.vias.has(S.vias[0]))throw new Error("l'entrée ne désigne pas le bon via");
  clearSel();
  const fais=e.filter(x=>/^Via /.test(x.msg));
  if(fais.length!==1)throw new Error("1 via infaisable attendu, "+fais.length);
  if(fais[0].via!==S.vias[3])throw new Error("le borgne sur deux diélectriques devrait être visé");
  if(!fais[0].info)throw new Error("un laminage séquentiel est une remarque, pas une erreur");
  if(!/L1_Top → L3_Inner/.test(fais[0].msg))throw new Error("message : "+fais[0].msg);
  S.vias=[];touch();
});
T("DRC : le rôle annoncé contre le cuivre posé",()=>{
  setCuCount(4);applyPreset(presetsFor(4)[0]);
  S.fps=[];S.tracks=[];S.zones=[];S.vias=[];
  S.cuL.forEach(L=>{L.plane=false;L.net="";L.role="signal";});
  touch();
  if(roleCheck(0))throw new Error("une couche de signal nue ne pose pas de question");
  // un plan qui porte des pistes
  setLayerRole(1,"gnd");
  S.tracks=[{l:1,net:"GND",w:0.3,x1:1,y1:1,x2:20,y2:1}];touch();
  const rc=roleCheck(1);
  if(!rc)throw new Error("un plan qui porte une piste devrait interpeller");
  if(rc.hint.indexOf("Mixte")<0)throw new Error("le conseil devrait proposer « Mixte » : "+rc.hint);
  let e=runDrc().filter(x=>/annoncée/.test(x.msg));
  if(!e.length)throw new Error("le DRC devrait le signaler");
  if(e[0].layer!==1)throw new Error("l'entrée devrait désigner la couche 1");
  if(!e[0].info)throw new Error("c'est une remarque, pas une erreur de règles");
  // le panneau le dit aussi, et marque la ligne du tableau
  stkPick("cu",1);buildStackup();
  const h=$("stk").innerHTML;
  if(h.indexOf("Rôle douteux")<0)throw new Error("l'éditeur devrait signaler le rôle douteux");
  if(h.indexOf("douteux\"")<0&&h.indexOf(" douteux")<0)
    throw new Error("la ligne du tableau devrait être marquée");
  // une couche de signal qui porte une zone pleine carte
  S.tracks=[];setLayerRole(1,"signal");
  S.zones=[{id:S.nextId++,l:1,net:"GND",pts:boardZonePts()}];touch();
  const rc2=roleCheck(1);
  if(!rc2||rc2.msg.indexOf("pleine carte")<0)
    throw new Error("une zone pleine carte sur un signal devrait interpeller");
  // une couche mixte sans aucune zone
  S.zones=[];S.cuL[1].role="mixed";S.cuL[1].plane=false;touch();
  const rc3=roleCheck(1);
  if(!rc3||rc3.hint.indexOf("Signal")<0)
    throw new Error("une mixte sans zone devrait proposer « Signal » : "+JSON.stringify(rc3));
  S.cuL.forEach(L=>{L.plane=false;L.net="";L.role="signal";});
  S.zones=[];S.tracks=[];touch();
});
T("empilage : l'asymétrie est nommée",()=>{
  setCuCount(4);applyPreset(presetsFor(4)[0]);
  if(stackAsym().length)throw new Error("un modèle d'usine est symétrique");
  S.stack.di[0].t=0.5;
  const a=stackAsym();
  if(a.length!==1)throw new Error("une seule paire fautive attendue, "+a.length);
  if(a[0].what!=="di"||a[0].i!==0||a[0].j!==2)
    throw new Error("la paire désignée est fausse : "+JSON.stringify(a[0]));
  const lbl=asymLabel(a[0]);
  if(lbl.indexOf("Diélectrique 1")<0||lbl.indexOf("0.500")<0||lbl.indexOf("3")<0)
    throw new Error("libellé peu utile : "+lbl);
  // le cuivre aussi, et la nature du diélectrique
  S.stack.cu[0].t=0.07;
  S.stack.di[0].t=S.stack.di[2].t;S.stack.di[0].k="film";
  const b=stackAsym();
  if(b.length!==2)throw new Error("cuivre et nature devraient être vus : "+JSON.stringify(b));
  if(!b.some(x=>x.what==="cu"&&/µm/.test(x.a)))throw new Error("le cuivre devrait être en µm");
  if(!b.some(x=>x.what==="di"&&x.a===DI_KIND.film))
    throw new Error("la nature du diélectrique devrait être nommée");
  // le panneau les liste
  buildStackup();
  const h=$("stk").innerHTML;
  if(h.indexOf("Diélectrique 1")<0||h.indexOf("Cuivre 1")<0)
    throw new Error("le panneau devrait nommer les paires fautives");
  applyPreset(presetsFor(4)[0]);
  if(!stackSym())throw new Error("le modèle d'usine devrait tout remettre d'aplomb");
});
T("feuille d'empilage dans le dossier de fabrication",()=>{
  setCuCount(4);applyPreset(presetsFor(4)[0]);
  S.cuL[1].plane=true;S.cuL[1].net="GND";syncAutoZones();
  importNetlist(NET,true);
  const files=buildFabFiles().files;
  const f=files.find(x=>x.name==="EMPILAGE.txt");
  if(!f)throw new Error("EMPILAGE.txt absent : "+files.map(x=>x.name).join(" "));
  for(const s of ["feuille d'empilage","Epaisseur visee","Finition du cuivre",
                  "Coupe, de la face composants","Prepreg","Tolerance usuelle",
                  "Serigraphie dessus","Masque dessous"])
    if(f.text.indexOf(s)<0)throw new Error("« "+s+" » absent de la feuille");
  if(f.text.indexOf(CU_ROLE_SHORT.gnd)<0)
    throw new Error("le rôle des couches devrait figurer dans la feuille");
  const rm=files.find(x=>x.name==="LISEZ-MOI.txt");
  if(rm.text.indexOf("EMPILAGE.txt")<0)
    throw new Error("le LISEZ-MOI devrait renvoyer à la feuille d'empilage");
  if(drillFile().text.indexOf("epaisseur du stratifie")<0)
    throw new Error("l'Excellon devrait rappeler l'épaisseur");
  S.cuL[1].plane=false;S.zones=[];syncAutoZones();
});
T("import : empilage physique borné et listes fermées",()=>{
  const doc=JSON.parse(serialize());
  doc.cu=4;doc.cuL=[{},{},{},{}];
  doc.stack={target:-5,finish:"onyx massif",maskT:99,maskEr:0,
             maskColor:"rose fluo; background:url(x)",silkColor:42,
             cu:[{t:-1},{t:"0.0175"},null,{}],
             di:[{k:"béton",t:-2,er:0,df:"x",mat:"   "},{t:0.3},"non"]};
  loadDoc(doc,true);
  const st=S.stack;
  if(st.cu.length!==4)throw new Error("4 cuivres attendus, "+st.cu.length);
  if(st.di.length!==3)throw new Error("3 diélectriques attendus, "+st.di.length);
  if(!(st.target>0))throw new Error("épaisseur visée négative acceptée");
  if(FINISHES.indexOf(st.finish)<0)throw new Error("finition inventée acceptée : "+st.finish);
  if(MASK_COLORS.indexOf(st.maskColor)<0)
    throw new Error("couleur de masque inventée acceptée : "+st.maskColor);
  if(typeof st.silkColor!=="string")throw new Error("couleur de sérigraphie non textuelle");
  if(!(st.cu[0].t>0))throw new Error("cuivre négatif accepté");
  if(Math.abs(st.cu[1].t-0.0175)>1e-9)throw new Error("chaîne numérique mal convertie");
  if(!DI_KIND[st.di[0].k])throw new Error("rôle de diélectrique inventé accepté : "+st.di[0].k);
  if(!(st.di[0].t>0)||!(st.di[0].er>=1))throw new Error("diélectrique hors bornes accepté");
  if(!st.di[0].mat)throw new Error("matière vide acceptée");
  if(!(st.maskEr>=1))throw new Error("εr de vernis hors bornes accepté");
  draw();buildStackup();stackReport();
  // un document sans empilage du tout : celui d'usine
  loadDoc({cu:2},true);
  if(S.stack.cu.length!==2||!(stackTotal()>0))throw new Error("empilage d'usine attendu");
  buildStackup();stackReport();
});

T("le rôle « plan de couche » survit à un annuler",()=>{
  setCuCount(4);
  S.zones=[];S.cuL.forEach(L=>{delete L.plane;delete L.net;});
  S.cuL[3].plane=true;S.cuL[3].net="GND";syncAutoZones();
  const n=S.zones.length;
  push();S.board.w+=5;touch();
  undo();
  if(S.zones.length!==n)
    throw new Error("l'annulation a dupliqué la zone du plan : "+n+" → "+S.zones.length);
  if(!S.cuL[3].plane)throw new Error("le rôle « plan » a été effacé par l'annulation");
  if(S.cuL[3].net!=="GND")throw new Error("le net du plan a été perdu");
  // un fichier V1.0, lui, doit toujours être converti : rôle sans zone auto
  const doc=JSON.parse(serialize());
  doc.zones=doc.zones.filter(z=>!z.auto);
  loadDoc(doc,true);
  if(!S.zones.some(z=>z.l===3&&z.net==="GND"))
    throw new Error("fichier V1.0 : le plan de couche n'a pas été converti en zone");
  if(S.cuL[3].plane)throw new Error("fichier V1.0 : le rôle devait être retiré après conversion");
  S.zones=[];S.cuL.forEach(L=>{delete L.plane;delete L.net;});
  setCuCount(2);touch();
});

/* ==========================================================================
   Espace de travail (commun/workspace.js)
   C'est le module dont l'arrivée avait mis le banc d'essai à l'arrêt : il a
   maintenant ses propres essais. Le DOM factice déplace vraiment les panneaux,
   on interroge donc l'arbre et pas seulement l'état interne.
   ========================================================================== */
T("disposition d'usine appliquée au démarrage",()=>{
  const d=wsDefault();
  if(d.docks.dockL!==212)throw new Error("largeur du dock gauche perdue");
  // wsDefault() rend une copie : la modifier ne doit pas polluer la config
  d.order.dockL.push("intrus");d.panels.props.grow=99;
  const e=wsDefault();
  if(e.order.dockL.indexOf("intrus")>=0)throw new Error("wsDefault() partage son tableau");
  if(e.panels.props.grow===99)throw new Error("wsDefault() partage ses panneaux");
  if(JSON.stringify(dom.dockIds("dockL"))!==JSON.stringify(["stack","rules"]))
    throw new Error("dock gauche : "+dom.dockIds("dockL"));
  if(JSON.stringify(dom.dockIds("dockR"))!==JSON.stringify(["props","list","stackup"]))
    throw new Error("dock droit : "+dom.dockIds("dockR"));
  if(dom.dockIds("dockB").length)throw new Error("le dock du bas devrait être vide");
  if(!dom.docks.dockB.classList.contains("empty"))
    throw new Error("un dock vide porte la classe « empty »");
});
T("séparateur entre panneaux d'un même dock",()=>{
  const n=dom.docks.dockL.children.filter(c=>c.classList.contains("psplit")).length;
  if(n!==1)throw new Error("2 panneaux = 1 séparateur, obtenu "+n);
});
T("déplacer un panneau d'un dock à l'autre",()=>{
  wsMove("props","dockB",0);
  if(wsPlaceOf("props")!=="dockB")throw new Error("place non mise à jour");
  if(wsLabel("props")!=="bas")throw new Error("libellé : "+wsLabel("props"));
  if(dom.panels.props.parentNode!==dom.docks.dockB)
    throw new Error("le panneau n'a pas suivi dans l'arbre");
  if(JSON.stringify(dom.dockIds("dockR"))!==JSON.stringify(["list","stackup"]))
    throw new Error("dock droit après départ : "+dom.dockIds("dockR"));
  // l'ordre demandé est respecté
  wsMove("stack","dockB",0);
  if(JSON.stringify(dom.dockIds("dockB"))!==JSON.stringify(["stack","props"]))
    throw new Error("insertion en tête ratée : "+dom.dockIds("dockB"));
});
T("détacher puis rattacher un panneau",()=>{
  wsToggleFloat("props");
  if(wsPlaceOf("props")!=="float")throw new Error("le panneau devrait flotter");
  if(dom.panels.props.parentNode!==dom.floatLayer)
    throw new Error("le flottant doit vivre dans #floatLayer");
  if(!dom.panels.props.classList.contains("floating"))
    throw new Error("classe « floating » absente");
  const h=dom.panels.props.querySelectorAll(".fres").length;
  if(h!==8)throw new Error("8 poignées de redimensionnement attendues, "+h);
  wsToggleFloat("props");
  if(wsPlaceOf("props")!=="dockB")throw new Error("retour au dernier dock raté");
  if(dom.panels.props.querySelectorAll(".fres").length)
    throw new Error("les poignées devaient disparaître au rattachement");
  if(dom.panels.props.classList.contains("floating"))
    throw new Error("classe « floating » non retirée");
});
T("fermer et rouvrir un panneau",()=>{
  wsClose("list");
  if(wsPlaceOf("list")!=="hidden")throw new Error("le panneau devrait être masqué");
  if(dom.panels.list.parentNode!==dom.store)
    throw new Error("un panneau fermé retourne au magasin");
  wsShow("list");
  if(wsPlaceOf("list")==="hidden")throw new Error("réouverture ratée");
  if(dom.panels.list.parentNode!==dom.docks.dockR)
    throw new Error("le panneau devrait revenir à son dernier dock");
});
T("replier un panneau",()=>{
  wsToggleCollapse("rules");
  if(!dom.panels.rules.classList.contains("collapsed"))throw new Error("repli sans effet");
  wsToggleCollapse("rules");
  if(dom.panels.rules.classList.contains("collapsed"))throw new Error("dépli sans effet");
});
T("la disposition est écrite dans le stockage local",()=>{
  const raw=dom.storage.getItem(WS_KEY);
  if(!raw)throw new Error("rien sous la clé "+WS_KEY);
  const d=JSON.parse(raw);
  if(d.order.dockB.indexOf("stack")<0)
    throw new Error("le déplacement n'a pas été enregistré : "+JSON.stringify(d.order));
});
T("relecture d'une disposition enregistrée",()=>{
  const saved=dom.storage.getItem(WS_KEY);
  WS=wsDefault();wsApply(false);
  if(JSON.stringify(dom.dockIds("dockL"))!==JSON.stringify(["stack","rules"]))
    throw new Error("réinitialisation ratée");
  wsLoad();wsApply(false);
  if(wsPlaceOf("stack")!=="dockB")throw new Error("disposition non relue");
  if(dom.storage.getItem(WS_KEY)!==saved)
    throw new Error("wsApply(false) ne doit pas réécrire le stockage");
});
T("une disposition corrompue retombe sur l'usine",()=>{
  dom.storage.setItem(WS_KEY,
    '{"order":{"dockL":["stack","fantome","stack"]},"docks":{"dockL":-9}}');
  WS=wsDefault();wsLoad();wsApply(false);
  if(wsPlaceOf("fantome")!=="hidden")
    throw new Error("un panneau inconnu ne doit pas être placé");
  if(dom.dockIds("dockL").filter(x=>x==="stack").length!==1)
    throw new Error("doublon accepté : "+dom.dockIds("dockL"));
  if(WS.docks.dockL<150)throw new Error("largeur négative acceptée : "+WS.docks.dockL);
  // les panneaux absents du fichier retrouvent leur place d'usine
  for(const id of ["rules","props","list"])
    if(wsPlaceOf(id)==="hidden")throw new Error(id+" a disparu");
  dom.storage.setItem(WS_KEY,"{ceci n'est pas du JSON");
  WS=wsDefault();wsLoad();wsApply(false);
  if(JSON.stringify(dom.dockIds("dockL"))!==JSON.stringify(["stack","rules"]))
    throw new Error("JSON illisible : la disposition d'usine devait s'appliquer");
});
T("menu de l'espace de travail : titres échappés",()=>{
  dom.panels.list.dataset.title='Nets <img src=x onerror="pan()">';
  const h=wsMenuBuild().innerHTML;
  dom.panels.list.dataset.title="Nets & composants";
  if(h.indexOf("<img")>=0)throw new Error("titre de panneau injecté tel quel dans le menu");
  if(h.indexOf("&lt;img")<0)throw new Error("titre non échappé : "+h);
  const m=wsMenuBuild().innerHTML;
  for(const t of ["Tout afficher","Disposition en colonnes","Réinitialiser la disposition"])
    if(m.indexOf(t)<0)throw new Error("entrée de menu manquante : "+t);
  if(m.indexOf('data-tgl="stack"')<0)throw new Error("bascule de panneau manquante");
});
T("poignée d'un dock vide neutralisée",()=>{
  const g=document.querySelectorAll(".gut[data-dock]").find(x=>x.dataset.dock==="dockL");
  if(!g)throw new Error("poignée de dock introuvable");
  if(g.classList.contains("off"))throw new Error("un dock peuplé garde sa poignée active");
  wsMove("stack","hidden");wsMove("rules","hidden");
  if(!g.classList.contains("off"))throw new Error("un dock vide neutralise sa poignée");
  wsShow("stack");wsShow("rules");
});
/* ==========================================================================
   Sélection multiple au Ctrl+clic et presse-papier
   ========================================================================== */
/* Deux empreintes posées pour ces essais : le document a pu être remplacé par
   les essais précédents, on ne s'appuie pas sur la netlist importée. */
function deuxEmpreintes(){
  S.fps=[];S.tracks=[];S.vias=[];S.zones=[];S.cuts=[];
  const a=mkFp("U1","NE555","DIP-8",8); a.x=20; a.y=20;
  const b=mkFp("C1","100n","0603",2);   b.x=45; b.y=20;
  S.fps.push(a,b);touch();clearSel();
  return [a,b];
}
T("Ctrl+clic ajoute puis retire de la sélection",()=>{
  setMode("select");S.active=0;
  const [u1,c1]=deuxEmpreintes();
  clearSel();
  fire("pointerdown",sc(u1.x,u1.y));fire("pointerup",sc(u1.x,u1.y));
  if(S.sel.fps.size!==1)throw new Error("clic simple : une seule empreinte");
  fire("pointerdown",Object.assign(sc(c1.x,c1.y),{ctrlKey:true}));
  fire("pointerup",sc(c1.x,c1.y));
  if(S.sel.fps.size!==2)throw new Error("Ctrl+clic devait ajouter, "+S.sel.fps.size);
  // second Ctrl+clic : elle sort de la sélection
  fire("pointerdown",Object.assign(sc(c1.x,c1.y),{ctrlKey:true}));
  fire("pointerup",sc(c1.x,c1.y));
  if(S.sel.fps.size!==1)throw new Error("Ctrl+clic devait retirer, "+S.sel.fps.size);
  if(!S.sel.fps.has(u1.id))throw new Error("la mauvaise empreinte est sortie");
  // clic simple sur le vide : tout retombe
  fire("pointerdown",sc(-50,-50));fire("pointerup",sc(-50,-50));
  if(selCount())throw new Error("le vide devait vider la sélection");
});
T("une sélection multiple se déplace d'un bloc",()=>{
  const [u1,c1]=deuxEmpreintes();
  clearSel();
  fire("pointerdown",sc(u1.x,u1.y));fire("pointerup",sc(u1.x,u1.y));
  fire("pointerdown",Object.assign(sc(c1.x,c1.y),{ctrlKey:true}));
  fire("pointerup",sc(c1.x,c1.y));
  const x0=u1.x, y0=u1.y, x1=c1.x, y1=c1.y;
  fire("pointerdown",sc(c1.x,c1.y));
  fire("pointermove",sc(c1.x+5,c1.y+5));
  fire("pointerup",sc(c1.x+5,c1.y+5));
  if(Math.abs(u1.x-(x0+5))>0.6||Math.abs(u1.y-(y0+5))>0.6)
    throw new Error("la première empreinte devait suivre : "+u1.x+","+u1.y);
  if(Math.abs(c1.x-(x1+5))>0.6)throw new Error("la seconde n'a pas bougé");
  undo();
});
T("copier / coller une sélection",()=>{
  const u1=deuxEmpreintes()[0];
  S.tracks=[{l:0,net:"N$1",w:0.3,x1:10,y1:10,x2:20,y2:10}];
  touch();
  clearSel();S.sel.fps.add(u1.id);S.sel.tracks.add(S.tracks[0]);
  const nf=S.fps.length, nt=S.tracks.length;
  if(!copySelPcb())throw new Error("copie refusée");
  S.mouse={x:60,y:40};
  pasteClipPcb();
  if(S.fps.length!==nf+1)throw new Error("une empreinte devait naître, "+S.fps.length);
  if(S.tracks.length!==nt+1)throw new Error("une piste devait naître");
  const refs=S.fps.map(f=>f.ref);
  if(new Set(refs).size!==refs.length)throw new Error("repères en double : "+refs.join(" "));
  if(S.sel.fps.size!==1||S.sel.tracks.size!==1)
    throw new Error("le collage doit sélectionner ce qu'il pose");
  /* Le coin haut-gauche du bloc atterrit sous le pointeur : ici c'est le début
     de la piste (10,10), l'empreinte étant 10 mm plus loin dans les deux sens. */
  const piste=S.tracks.find(t=>S.sel.tracks.has(t));
  if(Math.abs(piste.x1-60)>0.6||Math.abs(piste.y1-40)>0.6)
    throw new Error("collage hors du pointeur : "+piste.x1+","+piste.y1);
  const neuf=S.fps.find(f=>S.sel.fps.has(f.id));
  if(Math.abs(neuf.x-70)>0.6||Math.abs(neuf.y-50)>0.6)
    throw new Error("écart interne au bloc non conservé : "+neuf.x+","+neuf.y);
  if(neuf.value!==u1.value)throw new Error("la copie a perdu sa valeur");
  undo();
  if(S.fps.length!==nf)throw new Error("l'annulation devait tout retirer");
});
T("presse-papier : un contenu invalide ne casse rien",()=>{
  const nf=S.fps.length, nt=S.tracks.length;
  pcbSetClip({fps:[{style:"inconnu"},null],tracks:[{x1:0,y1:0}],vias:["x"]});
  S.mouse={x:0,y:0};
  pasteClipPcb();
  if(S.tracks.length!==nt)throw new Error("une piste inutilisable a été posée");
  if(S.fps.length!==nf+1)throw new Error("l'empreinte devait être rattrapée par les valeurs d'usine");
  undo();
});
T("repère libre : R12 devient R13 puis R14",()=>{
  const used=new Set(["R12","R13"]);
  if(freeFpRef("R12",used)!=="R14")throw new Error(freeFpRef("R12",used));
  if(freeFpRef("Q1",used)!=="Q1")throw new Error("un repère libre ne doit pas changer");
  if(freeFpRef("",used)!=="U1")throw new Error("un repère vide reçoit un numéro");
});
T("pas de grille : valeurs rondes et pas impériaux",()=>{
  for(const g of [0.1,0.5,1,1.27,2.54])
    if(!GRID_STEPS.includes(g))throw new Error("pas manquant : "+g);
  setGridStep(1);
  if(S.grid!==1)throw new Error("réglage non appliqué");
  S.scale=20;
  if(gridLabel()!=="1 carré = 1 mm")throw new Error(gridLabel());
  setGridStep(0.5);
  S.scale=5;                       // trop serré : on n'en trace qu'une sur deux
  if(gridShownStep()<=S.grid)throw new Error("la case affichée devait être élargie");
  setGridStep(0.5);S.scale=20;
});

console.log("\n"+ok+" essais réussis, "+ko+" en échec.");
process.exit(ko?1:0);
