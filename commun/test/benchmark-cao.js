/* =============================================================================
   commun/test/benchmark-cao.js
   Banc de charge autonome : schéma → netlist → PCB → routage.

   Deux usages :

       node commun/test/benchmark-cao.js [cartes] [graine] [tailles]
       node commun/test/benchmark-cao.js 30 1 10,25,50
           Cartes tirées au sort (graine fixe : deux lancements identiques
           donnent les mêmes cartes), 2 couches, les trois modes de routage
           comparés. Rapport : exports/benchmark/rapport-*.md

       node commun/test/benchmark-cao.js cartes
           Trois petites cartes 4 couches fixes (alimentation + MCU, USB-UART,
           clignotant 555), routées en « pousser » avec repli par via. Chaque
           carte laisse dans exports/benchmark/<carte>/ : le schéma (SVG), la
           netlist, la carte (.json, à rouvrir dans l'éditeur, et SVG), les
           fichiers de fabrication et un rapport.

   Pour chaque carte :
     1. SCHÉMA : les composants posés en rangées, chaque broche reliée par un
        fil à une étiquette (masse ou alimentation) portant le nom de son net.
        La netlist exportée est comparée au câblage voulu, net par net.
     2. PCB : netlist importée, placement automatique, puis chaque liaison du
        chevelu tracée d'un geste, la plus courte d'abord : départ pastille,
        arrivée pastille. On relève : liaisons réussies, temps par geste,
        longueur / distance à vol d'oiseau, défauts DRC avant et après.

   Les deux éditeurs déclarent les mêmes globales (S, serialize…) : chacun
   tourne dans son propre processus. Les bundles dist/ doivent être à jour
   (build-monofichier.py).
   ============================================================================= */
"use strict";
const fs=require("fs");
const path=require("path");
const {execFileSync}=require("child_process");
const ROOT=path.join(__dirname,"..","..");
const OUT=path.join(ROOT,"exports","benchmark");
const now=()=>Number(process.hrtime.bigint())/1e6;

/* mulberry32 : un tirage reproductible, sans dépendance */
function rng(seed){
  return ()=>{seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);
    t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};
}
function stubDom(panels,canvasId){
  require(path.join(ROOT,"commun","test","dom-stub.js")).install({panels,canvasId});
  global.alert=()=>{};global.confirm=()=>true;
}
function loadBundle(file,names){
  const code=fs.readFileSync(file,"utf8");
  (0,eval)(code.replace(/^"use strict";/,"")+"\n"+
    names.map(n=>"try{globalThis."+n+"="+n+";}catch(e){}").join("\n"));
}
const quiet=fn=>{const l=console.log,w=console.warn;console.log=console.warn=()=>{};
  try{return fn();}finally{console.log=l;console.warn=w;}};
const xml=s=>String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");

/* ---------------------------------------------------------------------------
   Les trois cartes fixes. Une broche s'écrit « repère.n », n compté dans
   l'ordre des broches du symbole, à partir de 1.
   ------------------------------------------------------------------------- */
const CARTES={
  "alim-mcu":{taille:[45,35],
    comps:[["J1","header","VIN","HEADER-2.54-1x2"],["U1","ic","AMS1117-3.3","SOT-223",4],
      ["C1","capacitor","10µ","0805"],["C2","capacitor","10µ","0805"],
      ["U2","ic","STM32","SOIC-16",16],["C3","capacitor","100n","0603"],["C4","capacitor","100n","0603"],
      ["Y1","crystal","8MHz","1206"],["C5","capacitor","22p","0603"],["C6","capacitor","22p","0603"],
      ["R1","resistor","10k","0603"],["R2","resistor","1k","0603"],["D1","led","LED","0805"],
      ["J2","header_1x4","SWD","HEADER-2.54-1x4"],["J3","header_1x4","UART","HEADER-2.54-1x4"]],
    nets:{VIN:["J1.1","U1.3","C1.1"],
      GND:["J1.2","U1.1","C1.2","C2.2","U2.2","U2.15","C3.2","C4.2","C5.2","C6.2","D1.2","J2.4","J3.3"],
      "+3V3":["U1.2","U1.4","C2.1","U2.1","U2.16","C3.1","C4.1","R1.2","J2.1","J3.4"],
      OSC_IN:["U2.3","Y1.1","C5.1"],OSC_OUT:["U2.4","Y1.2","C6.1"],NRST:["U2.5","R1.1"],
      LED:["U2.6","R2.1"],LED_A:["R2.2","D1.1"],SWDIO:["U2.7","J2.2"],SWCLK:["U2.8","J2.3"],
      TX:["U2.9","J3.1"],RX:["U2.10","J3.2"]}},
  "usb-uart":{taille:[40,30],
    comps:[["J1","ic","USB-C","USB-C-6P",6],["U1","esd_array","USBLC6","SOT-23-6"],
      ["U2","ic","CH340","SOIC-16",16],["R1","resistor","5k1","0603"],["R2","resistor","5k1","0603"],
      ["C1","capacitor","10µ","0805"],["C2","capacitor","100n","0603"],["Y1","crystal","12MHz","1206"],
      ["C3","capacitor","22p","0603"],["C4","capacitor","22p","0603"],["J2","header_1x4","UART","HEADER-2.54-1x4"]],
    nets:{VBUS:["J1.1","U1.5","U2.16","C1.1","J2.1"],
      GND:["J1.2","U1.2","U2.1","R1.2","R2.2","C1.2","C2.2","C3.2","C4.2","J2.4"],
      DP:["J1.3","U1.1","U1.6","U2.5"],DM:["J1.4","U1.3","U1.4","U2.6"],
      CC1:["J1.5","R1.1"],CC2:["J1.6","R2.1"],V3:["U2.4","C2.1"],
      XI:["U2.7","Y1.1","C3.1"],XO:["U2.8","Y1.2","C4.1"],TX:["U2.2","J2.2"],RX:["U2.3","J2.3"]}},
  "led-555":{taille:[35,25],
    comps:[["J1","header","VCC","HEADER-2.54-1x2"],["U1","ic","NE555","SOIC-8",8],
      ["R1","resistor","10k","0603"],["R2","resistor","47k","0603"],["C1","capacitor","10µ","0805"],
      ["C2","capacitor","10n","0603"],["C3","capacitor","100n","0805"],["R3","resistor","1k","0603"],
      ["Q1","npn","MMBT3904","SOT-23-3"],["R4","resistor","330","0603"],["D1","led","LED","0805"]],
    nets:{VCC:["J1.1","U1.4","U1.8","R1.1","C3.1","R4.1"],
      GND:["J1.2","U1.1","C1.2","C2.2","C3.2","Q1.3"],
      DIS:["U1.7","R1.2","R2.1"],TRIG:["U1.2","U1.6","R2.2","C1.1"],CTRL:["U1.5","C2.1"],
      OUT:["U1.3","R3.1"],BASE:["R3.2","Q1.1"],LED_A:["R4.2","D1.1"],LED_K:["D1.2","Q1.2"]}}
};

/* ---------------------------------------------------------------------------
   Un contexte 2D qui écrit du SVG : le rendu de l'éditeur, sans navigateur ni
   paquet « canvas ». Les arcs et courbes sont aplatis en polylignes.
   ------------------------------------------------------------------------- */
function svgCtx(){
  let m=[1,0,0,1,0,0], d="", cx=null, cy=null, dash=[];
  const pile=[], out=[], KEYS=["fillStyle","strokeStyle","lineWidth","font","textAlign",
    "textBaseline","globalAlpha","lineCap","lineJoin"];
  const P=(x,y)=>[m[0]*x+m[2]*y+m[4],m[1]*x+m[3]*y+m[5]];
  const sc=()=>Math.sqrt(Math.abs(m[0]*m[3]-m[1]*m[2]));
  const mul=(a,b,c2,e,f,g)=>{m=[m[0]*a+m[2]*b,m[1]*a+m[3]*b,m[0]*c2+m[2]*e,m[1]*c2+m[3]*e,
    m[0]*f+m[2]*g+m[4],m[1]*f+m[3]*g+m[5]];};
  const to=(x,y,mv)=>{const [X,Y]=P(x,y);d+=(mv||cx===null?"M":"L")+X.toFixed(2)+" "+Y.toFixed(2);cx=x;cy=y;};
  const col=v=>typeof v==="string"?v:"#888";
  const c={fillStyle:"#000",strokeStyle:"#000",lineWidth:1,font:"10px sans-serif",textAlign:"start",
    textBaseline:"alphabetic",globalAlpha:1,lineCap:"butt",lineJoin:"miter",canvas:{width:800,height:600},
    save(){pile.push([m.slice(),KEYS.map(k=>c[k]),dash]);},
    restore(){const p=pile.pop();if(p){m=p[0];KEYS.forEach((k,i)=>c[k]=p[1][i]);dash=p[2];}},
    translate(x,y){mul(1,0,0,1,x,y);},scale(x,y){mul(x,0,0,y,0,0);},
    rotate(a){const C=Math.cos(a),S_=Math.sin(a);mul(C,S_,-S_,C,0,0);},
    transform(a,b,c2,e,f,g){mul(a,b,c2,e,f,g);},
    setTransform(a,b,c2,e,f,g){if(typeof a==="object"&&a){({a,b,c:c2,d:e,e:f,f:g}=a);}m=[a,b,c2,e,f,g];},
    resetTransform(){m=[1,0,0,1,0,0];},
    setLineDash(a){dash=a||[];},getLineDash(){return dash;},
    beginPath(){d="";cx=cy=null;},closePath(){d+="Z";},
    moveTo(x,y){to(x,y,true);},lineTo(x,y){to(x,y);},
    rect(x,y,w,h){to(x,y,true);to(x+w,y);to(x+w,y+h);to(x,y+h);d+="Z";},
    roundRect(x,y,w,h){c.rect(x,y,w,h);},
    arc(x,y,r,a0,a1,ccw){c.ellipse(x,y,r,r,0,a0,a1,ccw);},
    ellipse(x,y,rx,ry,rot,a0,a1,ccw){
      let sw=a1-a0;
      if(ccw){while(sw>0)sw-=2*Math.PI;}else{while(sw<0)sw+=2*Math.PI;}
      sw=Math.max(-2*Math.PI,Math.min(2*Math.PI,sw));
      const n=Math.max(4,Math.ceil(Math.abs(sw)/(Math.PI/16))), C=Math.cos(rot||0), S_=Math.sin(rot||0);
      for(let i=0;i<=n;i++){
        const a=a0+sw*i/n, ex=rx*Math.cos(a), ey=ry*Math.sin(a);
        to(x+ex*C-ey*S_,y+ex*S_+ey*C);
      }
    },
    arcTo(x1,y1,x2,y2){to(x1,y1);to(x2,y2);},
    quadraticCurveTo(qx,qy,x,y){const x0=cx,y0=cy;if(x0===null){to(x,y,true);return;}
      for(let i=1;i<=8;i++){const t=i/8,u=1-t;to(u*u*x0+2*u*t*qx+t*t*x,u*u*y0+2*u*t*qy+t*t*y);}},
    bezierCurveTo(ax,ay,bx,by,x,y){const x0=cx,y0=cy;if(x0===null){to(x,y,true);return;}
      for(let i=1;i<=12;i++){const t=i/12,u=1-t;
        to(u*u*u*x0+3*u*u*t*ax+3*u*t*t*bx+t*t*t*x,u*u*u*y0+3*u*u*t*ay+3*u*t*t*by+t*t*t*y);}},
    fill(){if(d)out.push('<path d="'+d+'" fill="'+col(c.fillStyle)+'" opacity="'+c.globalAlpha+'"/>');},
    stroke(){if(d)out.push('<path d="'+d+'" fill="none" stroke="'+col(c.strokeStyle)+'" stroke-width="'+
      (c.lineWidth*sc()).toFixed(2)+'" stroke-linecap="'+c.lineCap+'" stroke-linejoin="'+c.lineJoin+'"'+
      (dash.length?' stroke-dasharray="'+dash.map(v=>v*sc()).join(" ")+'"':"")+' opacity="'+c.globalAlpha+'"/>');},
    fillRect(x,y,w,h){const s=d;c.beginPath();c.rect(x,y,w,h);c.fill();d=s;},
    strokeRect(x,y,w,h){const s=d;c.beginPath();c.rect(x,y,w,h);c.stroke();d=s;},
    clearRect(){},clip(){},drawImage(){},
    createLinearGradient(){return {addColorStop(){}};},createRadialGradient(){return {addColorStop(){}};},
    createPattern(){return null;},
    measureText(t){const z=/(\d+(?:\.\d+)?)px/.exec(c.font);return {width:String(t).length*(z?+z[1]:10)*0.55};},
    fillText(t,x,y){
      const z=/(\d+(?:\.\d+)?)px/.exec(c.font), fam=/px\s+(.*)$/.exec(c.font);
      const anc={center:"middle",right:"end",end:"end"}[c.textAlign]||"start";
      const base={middle:"central",top:"hanging",hanging:"hanging",bottom:"text-after-edge"}[c.textBaseline]||"auto";
      out.push('<text transform="matrix('+m.map(v=>v.toFixed(4)).join(" ")+')" x="'+x+'" y="'+y+
        '" font-size="'+(z?z[1]:10)+'" font-family="'+xml(fam?fam[1]:"sans-serif")+'"'+
        (/bold|[6-9]00/.test(c.font)?' font-weight="bold"':"")+' text-anchor="'+anc+
        '" dominant-baseline="'+base+'" fill="'+col(c.fillStyle)+'" opacity="'+c.globalAlpha+'">'+xml(t)+'</text>');
    },
    strokeText(){},
    svg(W,H){return '<svg xmlns="http://www.w3.org/2000/svg" width="'+W+'" height="'+H+
      '" viewBox="0 0 '+W+' '+H+'">\n'+out.join("\n")+"\n</svg>\n";}
  };
  return c;
}

/* ---------------------------------------------------------------------------
   Phase SCHÉMA (processus fils)
   ------------------------------------------------------------------------- */
const TYPES=["resistor","resistor","resistor","capacitor","capacitor","led",
             "npn","nmos","opamp","esd_array","header","inductor"];
/* les composants en rangées, chacun dans sa boîte plus une marge : les
   étiquettes posées à 3 pas des broches ne touchent jamais le voisin */
function poser(comps){
  const L=Math.max(60,Math.ceil(Math.sqrt(comps.length))*16)*G;
  let x=0,y=0,h=0;
  for(const c of comps){
    const b=bbox(c), w=b.x2-b.x1+10*G, hh=b.y2-b.y1+10*G;
    if(x&&x+w>L){x=0;y+=h;h=0;}
    c.x=x-b.x1+c.x+5*G;c.y=y-b.y1+c.y+5*G;
    c.x=Math.round(c.x/G)*G;c.y=Math.round(c.y/G)*G;
    x+=w;h=Math.max(h,hh);
  }
}
/* chaque broche : un fil de 3 pas vers l'extérieur du corps, puis une
   étiquette portant le nom du net (le symbole de masse pour GND) */
function cabler(voulu){
  for(const [net,bs] of voulu)for(const b of bs){
    const p=allPins(b.c)[b.j], dx=p.x-b.c.x, dy=p.y-b.c.y, h=Math.abs(dx)>=Math.abs(dy);
    const ex=p.x+(h?Math.sign(dx||1)*3*G:0), ey=p.y+(h?0:Math.sign(dy||1)*3*G);
    const gnd=net==="GND", v=addComp(gnd?"gnd":"vcc",ex,gnd?ey+G:ey-G);
    if(!gnd)v.value=net;
    const q=allPins(v)[0];
    S.wires.push({x1:p.x,y1:p.y,x2:ex,y2:ey});
    if(q.x!==ex||q.y!==ey)S.wires.push({x1:ex,y1:ey,x2:q.x,y2:q.y});
  }
  touchWires();
}
/* netlist exportée, puis contrôle : chaque net voulu s'y retrouve avec les
   mêmes repères */
function controler(voulu){
  let t=now();quiet(()=>docNets());const msNets=now()-t;
  t=now();const txt=quiet(()=>netlistText("banc"));const msNetlist=now()-t;
  const lu=new Map();let cur=null;
  for(const l of txt.split("\n")){
    const m=/^NET "([^"]+)"/.exec(l.trim());
    if(m){cur=m[1];lu.set(cur,lu.get(cur)||[]);continue;}
    const p=/^\s+([A-Za-z]+\d+)\.(\S+)/.exec(l);
    if(cur&&p)lu.get(cur).push(p[1]);
    if(!l.trim()||l.startsWith("==="))cur=null;
  }
  const ecarts=[];
  for(const [net,bs] of voulu){
    const a=bs.map(b=>b.c.ref).sort().join(","), b=(lu.get(net)||[]).sort().join(",");
    if(a!==b)ecarts.push(net+" voulu ["+a+"] lu ["+b+"]");
  }
  return {msNets,msNetlist,ecarts,netlist:txt};
}
/* l'image du schéma, par le même chemin que « Exporter PNG » (13-fichiers.js) */
function svgSchema(){
  let x1=1e9,y1=1e9,x2=-1e9,y2=-1e9;
  for(const el of S.comps){const b=bbox(el);x1=Math.min(x1,b.x1);y1=Math.min(y1,b.y1);x2=Math.max(x2,b.x2);y2=Math.max(y2,b.y2);}
  for(const w of S.wires){x1=Math.min(x1,w.x1,w.x2);y1=Math.min(y1,w.y1,w.y2);x2=Math.max(x2,w.x1,w.x2);y2=Math.max(y2,w.y1,w.y2);}
  const pad=50, W=Math.ceil(x2-x1+pad*2), H=Math.ceil(y2-y1+pad*2), c=svgCtx();
  c.fillStyle=C_BG;c.fillRect(0,0,W,H);
  c.setTransform(1,0,0,1,-(x1-pad),-(y1-pad));
  quiet(()=>{drawDrawings(c);drawWires(c);drawJunctions(c);
    for(const el of S.comps)drawComp(c,el,false);drawNetLabels(c,true);});
  return c.svg(W,H);
}
function feuilleNeuve(){
  S.pages=[newPage("Banc")];S.page=0;S.comps=[];S.wires=[];
  S.pages[0].comps=S.comps;S.pages[0].wires=S.wires;
}
function phaseSchema(a){
  stubDom({palette:"Bibliothèque",props:"Propriétés",list:"Nomenclature & Nets"},"sheet");
  loadBundle(path.join(ROOT,"editeur-schematique","dist","schema.js"),
    ["S","G","newPage","addComp","allPins","bbox","clearSel","touchWires","netlistText","docNets",
     "C_BG","drawDrawings","drawWires","drawJunctions","drawComp","drawNetLabels"]);
  const res=[];
  if(a.fixes){
    for(const nom of a.fixes){
      const spec=CARTES[nom], parRef={};
      feuilleNeuve();
      const comps=spec.comps.map(([ref,type,value,pkg,npins])=>{
        const c=addComp(type,0,0);
        if(npins)c.npins=npins;
        c.ref=ref;c.value=value;c.pkg=pkg;
        return parRef[ref]=c;
      });
      poser(comps);
      const voulu=new Map();
      for(const [net,bs] of Object.entries(spec.nets))
        voulu.set(net,bs.map(s=>{const [r,n]=s.split(".");return {c:parRef[r],j:n-1};}));
      cabler(voulu);
      res.push(Object.assign({nom,taille:spec.taille,composants:comps.length,
        broches:comps.reduce((s,c)=>s+allPins(c).length,0),nets:voulu.size,fils:S.wires.length},
        controler(voulu),{svg:svgSchema()}));
    }
    return res;
  }
  for(let i=0;i<a.cartes;i++){
    const n=a.tailles[i%a.tailles.length], R=rng(a.graine*1000+i);
    feuilleNeuve();
    const comps=[], pins=[];
    for(let k=0;k<n;k++){
      const c=addComp(TYPES[Math.floor(R()*TYPES.length)],0,0);
      comps.push(c);
      allPins(c).forEach((p,j)=>pins.push({c,j}));
    }
    poser(comps);
    /* le câblage voulu : GND et +3V3 prennent des broches au vol, le reste
       se range en nets de signal de 2 à 4 broches */
    for(let k=pins.length-1;k>0;k--){const j=Math.floor(R()*(k+1));[pins[k],pins[j]]=[pins[j],pins[k]];}
    const voulu=new Map(), ajoute=(net,b)=>{if(!voulu.has(net))voulu.set(net,[]);voulu.get(net).push(b);};
    let k=0,s=0;
    while(k<pins.length){
      const r=R();
      if(r<0.15){ajoute("GND",pins[k++]);continue;}
      if(r<0.25){ajoute("+3V3",pins[k++]);continue;}
      const m=2+Math.floor(R()*3);
      if(pins.length-k<2){ajoute("GND",pins[k++]);continue;}
      s++;for(let j=0;j<m&&k<pins.length;j++)ajoute("SIG"+s,pins[k++]);
    }
    cabler(voulu);
    res.push(Object.assign({carte:i,composants:n,broches:pins.length,nets:voulu.size,
      fils:S.wires.length},controler(voulu)));
  }
  return res;
}

/* ---------------------------------------------------------------------------
   Phase PCB (processus fils)
   ------------------------------------------------------------------------- */
const MODES=["shove","walk","mark"];
const DIRS=[[1,0],[-1,0],[0,1],[0,-1],[.7071,.7071],[-.7071,.7071],[.7071,-.7071],[-.7071,-.7071]];
/* un tronçon vers (x,y) sur la couche courante ; faux s'il est refusé */
function troncon(x,y){
  routeToPoint({x,y});
  const R=S.route;
  if(!R||R.bad||!R.preview.length)return false;
  stepRoute();                         // arrivée sur le net : stepRoute pose tout
  return true;
}
/* via traversant au bout du tracé, puis la couche L */
function viaVers(L){
  const R=S.route;
  if(!placeVia(R.pt.x,R.pt.y,R.net,0,S.cu-1,true))return false;
  R.layer=L;S.active=L;return true;
}
function depart(r){
  S.active=0;startRoute(r.x1,r.y1,true);
  if(S.route&&!S.route.net){S.route=null;return false;}
  return !!S.route;
}
/* le geste direct : de pastille à pastille sur le dessus */
function gesteDirect(r){
  if(!depart(r))return false;
  if(troncon(r.x2,r.y2)&&!S.route)return true;
  if(S.route)cancelRoute();
  return false;
}
/* le repli : s'échapper de 2 mm, via, traverser sur L, via, arriver.
   Les directions d'échappée qui regardent vers l'autre bout d'abord. */
function gesteVia(r,L){
  const vx=r.x2-r.x1, vy=r.y2-r.y1, e=2;
  const vers=s=>DIRS.slice().sort((a,b)=>s*(b[0]*vx+b[1]*vy)-s*(a[0]*vx+a[1]*vy)).slice(0,4);
  for(const d1 of vers(1))for(const d2 of vers(-1)){
    if(!depart(r))return false;
    const ok=troncon(r.x1+d1[0]*e,r.y1+d1[1]*e)&&S.route&&viaVers(L)&&
             troncon(r.x2+d2[0]*e,r.y2+d2[1]*e)&&S.route&&viaVers(0)&&
             troncon(r.x2,r.y2)&&!S.route;
    if(ok)return true;
    if(S.route)cancelRoute();
  }
  return false;
}
/* une vue de la carte : contour, cuivre par couche, vias, pastilles, repères */
function svgPcb(){
  const b=S.board, k=12, W=Math.ceil(b.w*k)+40, H=Math.ceil(b.h*k)+40;
  const X=x=>((x-b.x)*k+20).toFixed(1), Y=y=>((y-b.y)*k+20).toFixed(1);
  const COUL=["#d9534f","#5cb85c","#e0a030","#4a7fd6"], o=[];
  o.push('<rect width="'+W+'" height="'+H+'" fill="#101418"/>');
  const pts=b.pts&&b.pts.length>=3?b.pts:[{x:b.x,y:b.y},{x:b.x+b.w,y:b.y},{x:b.x+b.w,y:b.y+b.h},{x:b.x,y:b.y+b.h}];
  o.push('<polygon points="'+pts.map(p=>X(p.x)+","+Y(p.y)).join(" ")+'" fill="#1d3b2a" stroke="#ddd"/>');
  for(let l=S.cu-1;l>=0;l--)for(const t of S.tracks)if(t.l===l)
    o.push('<line x1="'+X(t.x1)+'" y1="'+Y(t.y1)+'" x2="'+X(t.x2)+'" y2="'+Y(t.y2)+'" stroke="'+
      COUL[l===S.cu-1?3:Math.min(l,2)]+'" stroke-width="'+(t.w*k).toFixed(1)+'" stroke-linecap="round" opacity="0.85"/>');
  for(const fp of S.fps)for(const q of padsWorld(fp)){
    const rond=/circ|round|oval/.test(q.shape||"")&&q.w===q.h;
    o.push(rond?'<circle cx="'+X(q.x)+'" cy="'+Y(q.y)+'" r="'+(q.w*k/2).toFixed(1)+'" fill="#c8a24a"/>'
      :'<rect x="'+(-q.w*k/2).toFixed(1)+'" y="'+(-q.h*k/2).toFixed(1)+'" width="'+(q.w*k).toFixed(1)+
       '" height="'+(q.h*k).toFixed(1)+'" fill="#c8a24a" transform="translate('+X(q.x)+' '+Y(q.y)+
       ') rotate('+((q.rot||0)*180/Math.PI).toFixed(1)+')"/>');
    if(q.drill>0)o.push('<circle cx="'+X(q.x)+'" cy="'+Y(q.y)+'" r="'+(q.drill*k/2).toFixed(1)+'" fill="#101418"/>');
  }
  for(const v of S.vias)
    o.push('<circle cx="'+X(v.x)+'" cy="'+Y(v.y)+'" r="'+(v.d*k/2).toFixed(1)+'" fill="#bbb"/>'+
           '<circle cx="'+X(v.x)+'" cy="'+Y(v.y)+'" r="'+(v.drill*k/2).toFixed(1)+'" fill="#101418"/>');
  for(const fp of S.fps)o.push('<text x="'+X(fp.x)+'" y="'+Y(fp.y)+'" fill="#fff" font-size="11" '+
    'font-family="sans-serif" text-anchor="middle" dominant-baseline="central">'+xml(fp.ref)+'</text>');
  o.push('<text x="8" y="'+(H-6)+'" fill="#aaa" font-size="11" font-family="sans-serif">dessus rouge · '+
    'internes vert/orange · dessous bleu · vias gris</text>');
  return '<svg xmlns="http://www.w3.org/2000/svg" width="'+W+'" height="'+H+'" viewBox="0 0 '+W+' '+H+'">\n'+
    o.join("\n")+"\n</svg>\n";
}
function phasePcb(a){
  stubDom({stack:"Empilage",rules:"Règles de tracé",props:"Propriétés",list:"Nets & composants",
           stackup:"Empilage physique",dpair:"Paires différentielles",sim:"Simulation EM"},"board");
  loadBundle(path.join(ROOT,"editeur-pcb","dist","pcb.js"),
    ["S","importNetlist","autoPlace","setBoardSize","setCuCount","setMode","conn","startRoute",
     "routeToPoint","stepRoute","commitRoute","cancelRoute","runDrc","serialize","loadDoc","trkLen",
     "touch","placeVia","padsWorld","buildFabFiles"]);
  const cu=a.fixes?4:2, modes=a.fixes?["shove"]:MODES, res=[];
  for(const sch of a.schemas){
    quiet(()=>{
      S.fps=[];S.tracks=[];S.vias=[];S.zones=[];S.drc=[];touch();
      setCuCount(cu);
      const cote=Math.max(30,Math.ceil(Math.sqrt(sch.composants)*14));
      if(sch.taille)setBoardSize(sch.taille[0],sch.taille[1]);else setBoardSize(cote,cote);
      importNetlist(sch.netlist,true);
      /* l'import range les empreintes à droite de la carte, et autoPlace les y
         laisse entassées contre le bord : on les répartit d'abord en grille */
      const B=S.board, n=S.fps.length, cols=Math.ceil(Math.sqrt(n*B.w/B.h));
      S.fps.forEach((f,i)=>{f.x=B.x+B.w*((i%cols)+0.5)/cols;
        f.y=B.y+B.h*(Math.floor(i/cols)+0.5)/Math.ceil(n/cols);});
      touch();
      autoPlace(200);
    });
    const base=serialize(), liaisons=conn(true).unrouted, out={carte:sch.carte,nom:sch.nom,
      composants:sch.composants,empreintes:S.fps.length,liaisons,
      drcAvant:quiet(()=>runDrc()).length,modes:{}};
    for(const mode of modes){
      quiet(()=>{loadDoc(JSON.parse(base),true);S.rule.route=mode;S.avoid=true;setMode("track");});
      const tentes=new Set(), gestes=[];
      let refus=0,erreurs=0,vol=0,parVia=0;
      /* la liaison la plus courte d'abord, chevelu recalculé après chaque pose */
      for(;;){
        const r=conn(true).rats.filter(r=>!tentes.has(r.net+"|"+r.x1+"|"+r.y1+"|"+r.x2+"|"+r.y2))
          .sort((p,q)=>Math.hypot(p.x2-p.x1,p.y2-p.y1)-Math.hypot(q.x2-q.x1,q.y2-q.y1))[0];
        if(!r)break;
        tentes.add(r.net+"|"+r.x1+"|"+r.y1+"|"+r.x2+"|"+r.y2);
        const t0=now();
        try{
          const ok=quiet(()=>{
            if(gesteDirect(r))return true;
            if(!a.fixes)return false;
            for(const L of [cu-1,1,2])if(gesteVia(r,L)){parVia++;return true;}
            return false;
          });
          if(ok)vol+=Math.hypot(r.x2-r.x1,r.y2-r.y1);else refus++;
        }catch(e){erreurs++;try{S.route=null;}catch(_){}
          if(erreurs<=3)console.error("  erreur JS ("+(sch.nom||sch.carte)+", "+mode+") : "+e.message);}
        gestes.push(now()-t0);
      }
      const c=conn(true), reussis=liaisons-c.unrouted;
      const cuivre=S.tracks.reduce((s,t)=>s+trkLen(t),0);
      let t=now();const drc=quiet(()=>runDrc());const tDrc=now()-t;
      gestes.sort((x,y)=>x-y);
      out.modes[mode]={reussis,refus,erreurs,parVia,vias:S.vias.length,taux:liaisons?reussis/liaisons:1,
        msGesteMoy:gestes.reduce((x,y)=>x+y,0)/(gestes.length||1),
        msGesteP95:gestes[Math.floor(gestes.length*0.95)]||0,
        msGesteMax:gestes[gestes.length-1]||0,
        detour:vol?cuivre/vol:1,pistes:S.tracks.length,drc:drc.length,msDrc:tDrc,
        drcDetail:drc.slice(0,40).map(x=>typeof x==="string"?x:(x.msg||x.txt||JSON.stringify(x)).slice(0,200)),
        /* familles de défauts : le message sans ses chiffres ni ses repères */
        drcFamilles:drc.reduce((o,x)=>{const k=String(typeof x==="string"?x:(x.msg||x.txt||"?"))
          .split(/ : | sur |\d/)[0].trim();o[k]=(o[k]||0)+1;return o;},{}),
        nonRoutes:[...c.nets.values()].filter(n=>n.miss).map(n=>n.name+" ("+n.miss+")")};
    }
    if(a.fixes){
      /* les livrables de la carte : fab, carte rouvrable, vue du routage */
      const dir=path.join(OUT,sch.nom), fab=path.join(dir,"fab");
      fs.mkdirSync(fab,{recursive:true});
      try{
        const {files}=quiet(()=>buildFabFiles());
        for(const f of files)fs.writeFileSync(path.join(fab,f.name),
          f.text!=null?f.text:typeof f.data==="string"?Buffer.from(f.data,"latin1"):Buffer.from(f.data));
        out.fab=files.map(f=>f.name);
      }catch(e){out.fabErreur=e.message;console.error("  fab ("+sch.nom+") : "+e.message);}
      fs.writeFileSync(path.join(dir,"carte.json"),serialize());
      fs.writeFileSync(path.join(dir,"carte.svg"),svgPcb());
    }
    res.push(out);
  }
  return res;
}

/* ---------------------------------------------------------------------------
   Orchestration et rapport (processus parent)
   ------------------------------------------------------------------------- */
const [phase,fic]=process.argv.slice(2);
if(phase==="--sch"||phase==="--pcb"){
  const a=JSON.parse(fs.readFileSync(fic,"utf8"));
  const r=phase==="--sch"?phaseSchema(a):phasePcb(a);
  fs.writeFileSync(fic+".out",JSON.stringify(r));
  process.exit(0);         // BroadcastChannel garderait le processus en vie
}
fs.mkdirSync(OUT,{recursive:true});
const fils=(ph,data)=>{
  const f=path.join(OUT,"_"+ph+".json");
  fs.writeFileSync(f,JSON.stringify(data));
  execFileSync(process.execPath,[__filename,"--"+ph,f],{stdio:["ignore","ignore","inherit"]});
  const r=JSON.parse(fs.readFileSync(f+".out","utf8"));
  fs.unlinkSync(f);fs.unlinkSync(f+".out");
  return r;
};
const moy=a=>a.length?a.reduce((x,y)=>x+y,0)/a.length:0, f1=x=>x.toFixed(1), f2=x=>x.toFixed(2);
const tag=new Date().toISOString().slice(0,19).replace(/[:T]/g,"-");
const date=new Date().toISOString().slice(0,16).replace("T"," ");

if(phase==="cartes"){
  const fixes=Object.keys(CARTES);
  console.log("Cartes fixes 4 couches : "+fixes.join(", "));
  let t=now();const sch=fils("sch",{fixes});
  for(const s of sch){
    const dir=path.join(OUT,s.nom);fs.mkdirSync(dir,{recursive:true});
    fs.writeFileSync(path.join(dir,"schema.svg"),s.svg);
    fs.writeFileSync(path.join(dir,"netlist.txt"),s.netlist);
  }
  console.log("  schéma : "+((now()-t)/1000).toFixed(1)+" s");
  t=now();const pcb=fils("pcb",{fixes,schemas:sch.map(s=>Object.assign({},s,{svg:undefined}))});
  console.log("  PCB    : "+((now()-t)/1000).toFixed(1)+" s");
  const L=["# Cartes fixes 4 couches — "+date,"",
    "| Carte | Composants | Nets faux | Liaisons | Routées | dont par via | Vias | Refus | Erreurs JS | Détour | DRC avant → après | Fab |",
    "|---|---|---|---|---|---|---|---|---|---|---|---|"];
  for(const p of pcb){
    const s=sch.find(x=>x.nom===p.nom), m=p.modes.shove;
    L.push("| "+p.nom+" | "+p.composants+" | "+s.ecarts.length+" | "+p.liaisons+" | "+m.reussis+
      " ("+f1(100*m.taux)+" %) | "+m.parVia+" | "+m.vias+" | "+m.refus+" | "+m.erreurs+" | "+f2(m.detour)+
      " | "+p.drcAvant+" → "+m.drc+" | "+(p.fab?p.fab.length+" fichiers":"ÉCHEC : "+p.fabErreur)+" |");
    const R=["# "+p.nom+" — "+date,"",
      "- Schéma : "+s.composants+" composants, "+s.broches+" broches, "+s.nets+" nets — "+
        (s.ecarts.length?s.ecarts.length+" net(s) faux :\n  - "+s.ecarts.join("\n  - "):"netlist conforme"),
      "- Routage : "+m.reussis+" / "+p.liaisons+" liaisons ("+m.parVia+" par via), "+m.vias+" vias, "+
        m.pistes+" pistes, geste moyen "+f1(m.msGesteMoy)+" ms (max "+f1(m.msGesteMax)+" ms)",
      "- Non routés : "+(m.nonRoutes.join(", ")||"aucun"),
      "- Erreurs JS : "+m.erreurs,
      "- DRC : "+p.drcAvant+" défaut(s) après placement, "+m.drc+" après routage","",
      "## DRC par famille","",...Object.entries(m.drcFamilles).sort((x,y)=>y[1]-x[1]).map(([k,n])=>"- "+n+" × "+k),"",
      "## DRC (40 premiers)","",...m.drcDetail.map(x=>"- "+x),"",
      "## Fichiers","","- schema.svg, netlist.txt, carte.json (à rouvrir dans l'éditeur PCB), carte.svg",
      ...(p.fab||[]).map(f=>"- fab/"+f)];
    fs.writeFileSync(path.join(OUT,p.nom,"rapport.md"),R.join("\n")+"\n");
  }
  const md=L.join("\n")+"\n";
  fs.writeFileSync(path.join(OUT,"cartes-"+tag+".md"),md);
  console.log("\n"+md+"\nDossiers : exports/benchmark/<carte>/ (schema.svg, carte.svg, fab/, rapport.md)");
  process.exit(0);
}

const cartes=+process.argv[2]||20, graine=+process.argv[3]||1;
const tailles=(process.argv[4]||"10,25,50").split(",").map(Number);
console.log("Banc schéma + routage : "+cartes+" cartes, graine "+graine+", tailles "+tailles.join("/"));
let t=now();const sch=fils("sch",{cartes,graine,tailles});
console.log("  schéma : "+((now()-t)/1000).toFixed(1)+" s");
t=now();const pcb=fils("pcb",{schemas:sch});
console.log("  PCB    : "+((now()-t)/1000).toFixed(1)+" s");

const lignes=["# Banc schéma + routage — "+date,"",
  cartes+" cartes, graine "+graine+", tailles "+tailles.join(" / ")+" composants.","",
  "## Schéma","","| Composants | Cartes | Broches moy. | Nets moy. | Extraction nets (ms) | Netlist (ms) | Nets faux |",
  "|---|---|---|---|---|---|---|"];
for(const n of tailles){
  const g=sch.filter(s=>s.composants===n);
  lignes.push("| "+n+" | "+g.length+" | "+f1(moy(g.map(s=>s.broches)))+" | "+f1(moy(g.map(s=>s.nets)))+
    " | "+f2(moy(g.map(s=>s.msNets)))+" | "+f2(moy(g.map(s=>s.msNetlist)))+
    " | "+g.reduce((a,s)=>a+s.ecarts.length,0)+" |");
}
lignes.push("","## Routage (un geste par liaison du chevelu, 2 couches)","",
  "| Composants | Mode | Liaisons | Réussite | Refus | Erreurs JS | Geste moy. (ms) | P95 (ms) | Max (ms) | Détour | DRC avant → après | DRC (ms) |",
  "|---|---|---|---|---|---|---|---|---|---|---|---|");
for(const n of tailles)for(const m of MODES){
  const g=pcb.filter(p=>p.composants===n).map(p=>Object.assign({liaisons:p.liaisons,drcAvant:p.drcAvant},p.modes[m]));
  const L=g.reduce((a,x)=>a+x.liaisons,0), ok=g.reduce((a,x)=>a+x.reussis,0);
  lignes.push("| "+n+" | "+m+" | "+L+" | "+(L?f1(100*ok/L):"—")+" % | "+g.reduce((a,x)=>a+x.refus,0)+
    " | "+g.reduce((a,x)=>a+x.erreurs,0)+" | "+f2(moy(g.map(x=>x.msGesteMoy)))+
    " | "+f2(moy(g.map(x=>x.msGesteP95)))+" | "+f1(Math.max(0,...g.map(x=>x.msGesteMax)))+
    " | "+f2(moy(g.map(x=>x.detour)))+" | "+f1(moy(g.map(x=>x.drcAvant)))+" → "+f1(moy(g.map(x=>x.drc)))+
    " | "+f1(moy(g.map(x=>x.msDrc)))+" |");
}
const faux=sch.filter(s=>s.ecarts.length);
if(faux.length){
  lignes.push("","## Nets faux (10 premiers)","");
  faux.flatMap(s=>s.ecarts.map(e=>"- carte "+s.carte+" : "+e)).slice(0,10).forEach(l=>lignes.push(l));
}
const md=lignes.join("\n")+"\n";
fs.writeFileSync(path.join(OUT,"rapport-"+tag+".md"),md);
fs.writeFileSync(path.join(OUT,"rapport-"+tag+".json"),
  JSON.stringify({cartes,graine,tailles,schema:sch.map(s=>Object.assign({},s,{netlist:undefined})),pcb},null,1));
console.log("\n"+md+"\nRapport : exports/benchmark/rapport-"+tag+".md");
