/* =============================================================================
   commun/test/benchmark-cao.js
   Banc de charge autonome : schéma aléatoire → netlist → PCB → routage.

       node commun/test/benchmark-cao.js [cartes] [graine] [tailles]
       node commun/test/benchmark-cao.js 30 1 10,25,50

   Pour chaque carte tirée au sort (graine fixe : deux lancements identiques
   donnent les mêmes cartes) :
     1. SCHÉMA : des composants posés sur une grille, chaque broche reliée par
        un fil à une étiquette d'alimentation qui porte le nom de son net. La
        netlist exportée est comparée au câblage voulu, net par net.
     2. PCB : la netlist importée, placement automatique, puis chaque liaison
        du chevelu tracée d'un seul geste (départ pastille, arrivée pastille),
        une fois par mode de routage : pousser, contourner, signaler.
        On relève : liaisons réussies, temps par geste, longueur / distance à
        vol d'oiseau, défauts DRC.

   Les deux éditeurs déclarent les mêmes globales (S, serialize…) : chacun
   tourne dans son propre processus. Les bundles dist/ doivent être à jour
   (build-monofichier.py). Le rapport est écrit dans exports/benchmark/.
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

/* ---------------------------------------------------------------------------
   Phase SCHÉMA (processus fils)
   ------------------------------------------------------------------------- */
const TYPES=["resistor","resistor","resistor","capacitor","capacitor","led",
             "npn","nmos","opamp","esd_array","header","inductor"];
function phaseSchema(cartes,graine,tailles){
  stubDom({palette:"Bibliothèque",props:"Propriétés",list:"Nomenclature & Nets"},"sheet");
  loadBundle(path.join(ROOT,"editeur-schematique","dist","schema.js"),
    ["S","G","newPage","addComp","allPins","clearSel","touchWires","netlistText","docNets"]);
  const res=[];
  for(let i=0;i<cartes;i++){
    const n=tailles[i%tailles.length], R=rng(graine*1000+i);
    S.pages=[newPage("Banc")];S.page=0;S.comps=[];S.wires=[];
    S.pages[0].comps=S.comps;S.pages[0].wires=S.wires;
    const cols=Math.ceil(Math.sqrt(n)), pins=[];
    for(let k=0;k<n;k++){
      const c=addComp(TYPES[Math.floor(R()*TYPES.length)],(k%cols)*16*G,Math.floor(k/cols)*16*G);
      allPins(c).forEach((p,j)=>pins.push({c,j,p}));
    }
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
    /* chaque broche : un fil de 3 pas vers l'extérieur du corps, puis une
       étiquette portant le nom du net */
    for(const [net,bs] of voulu)for(const b of bs){
      const dx=b.p.x-b.c.x, dy=b.p.y-b.c.y, h=Math.abs(dx)>=Math.abs(dy);
      const ex=b.p.x+(h?Math.sign(dx||1)*3*G:0), ey=b.p.y+(h?0:Math.sign(dy||1)*3*G);
      const v=addComp("vcc",ex,ey-G);v.value=net;
      const q=allPins(v)[0];
      S.wires.push({x1:b.p.x,y1:b.p.y,x2:ex,y2:ey});
      if(q.x!==ex||q.y!==ey)S.wires.push({x1:ex,y1:ey,x2:q.x,y2:q.y});
    }
    touchWires();
    let t=now();quiet(()=>docNets());const tNets=now()-t;
    t=now();const txt=quiet(()=>netlistText("banc"));const tNl=now()-t;
    /* contrôle : chaque net voulu se retrouve dans la netlist avec les mêmes
       repères et le même nombre de broches */
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
    res.push({carte:i,composants:n,broches:pins.length,nets:voulu.size,fils:S.wires.length,
              msNets:tNets,msNetlist:tNl,ecarts,netlist:txt});
  }
  return res;
}

/* ---------------------------------------------------------------------------
   Phase PCB (processus fils)
   ------------------------------------------------------------------------- */
const MODES=["shove","walk","mark"];
function phasePcb(schemas){
  stubDom({stack:"Empilage",rules:"Règles de tracé",props:"Propriétés",list:"Nets & composants",
           stackup:"Empilage physique",dpair:"Paires différentielles",sim:"Simulation EM"},"board");
  loadBundle(path.join(ROOT,"editeur-pcb","dist","pcb.js"),
    ["S","importNetlist","autoPlace","setBoardSize","setCuCount","setMode","conn","startRoute",
     "routeToPoint","stepRoute","commitRoute","cancelRoute","runDrc","serialize","loadDoc","trkLen","touch"]);
  const res=[];
  for(const sch of schemas){
    quiet(()=>{
      S.fps=[];S.tracks=[];S.vias=[];S.zones=[];S.drc=[];touch();
      setCuCount(2);
      const cote=Math.max(30,Math.ceil(Math.sqrt(sch.composants)*14));
      setBoardSize(cote,cote);
      importNetlist(sch.netlist,true);
      autoPlace(200);
    });
    const base=serialize(), liaisons=conn(true).unrouted, out={carte:sch.carte,
      composants:sch.composants,empreintes:S.fps.length,liaisons,
      drcAvant:quiet(()=>runDrc()).length,modes:{}};
    for(const mode of MODES){
      quiet(()=>{loadDoc(JSON.parse(base),true);S.rule.route=mode;S.avoid=true;setMode("track");});
      const rats=conn(true).rats.slice(), gestes=[];
      let reussis=0,refus=0,erreurs=0,vol=0;
      for(const r of rats){
        const t0=now();
        try{
          quiet(()=>{
            startRoute(r.x1,r.y1,true);
            routeToPoint({x:r.x2,y:r.y2});
            const bad=S.route&&S.route.bad;
            if(!bad)stepRoute();
            if(S.route){if(bad||S.route.bad){cancelRoute();refus++;return;}commitRoute();}
            vol+=Math.hypot(r.x2-r.x1,r.y2-r.y1);   // détour : les gestes posés seulement
          });
        }catch(e){erreurs++;try{S.route=null;}catch(_){}}
        gestes.push(now()-t0);
      }
      const c=conn(true);
      reussis=liaisons-c.unrouted;
      const cuivre=S.tracks.reduce((s,t)=>s+trkLen(t),0);
      let t=now();const drc=quiet(()=>runDrc());const tDrc=now()-t;
      gestes.sort((a,b)=>a-b);
      out.modes[mode]={reussis,refus,erreurs,taux:liaisons?reussis/liaisons:1,
        msGesteMoy:gestes.reduce((a,b)=>a+b,0)/(gestes.length||1),
        msGesteP95:gestes[Math.floor(gestes.length*0.95)]||0,
        msGesteMax:gestes[gestes.length-1]||0,
        detour:vol?cuivre/vol:1,pistes:S.tracks.length,drc:drc.length,msDrc:tDrc};
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
  const r=phase==="--sch"?phaseSchema(a.cartes,a.graine,a.tailles):phasePcb(a);
  fs.writeFileSync(fic+".out",JSON.stringify(r));
  process.exit(0);         // BroadcastChannel garderait le processus en vie
}
const cartes=+process.argv[2]||20, graine=+process.argv[3]||1;
const tailles=(process.argv[4]||"10,25,50").split(",").map(Number);
fs.mkdirSync(OUT,{recursive:true});
const fils=(ph,data)=>{
  const f=path.join(OUT,"_"+ph+".json");
  fs.writeFileSync(f,JSON.stringify(data));
  execFileSync(process.execPath,[__filename,"--"+ph,f],{stdio:["ignore","ignore","inherit"],maxBuffer:1<<26});
  const r=JSON.parse(fs.readFileSync(f+".out","utf8"));
  fs.unlinkSync(f);fs.unlinkSync(f+".out");
  return r;
};
console.log("Banc schéma + routage : "+cartes+" cartes, graine "+graine+", tailles "+tailles.join("/"));
let t=now();const sch=fils("sch",{cartes,graine,tailles});
console.log("  schéma : "+((now()-t)/1000).toFixed(1)+" s");
t=now();const pcb=fils("pcb",sch);
console.log("  PCB    : "+((now()-t)/1000).toFixed(1)+" s");

const moy=a=>a.length?a.reduce((x,y)=>x+y,0)/a.length:0, f1=x=>x.toFixed(1), f2=x=>x.toFixed(2);
const lignes=["# Banc schéma + routage — "+new Date().toISOString().slice(0,16).replace("T"," "),"",
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
    " | "+f2(moy(g.map(x=>x.detour)))+" | "+f1(moy(g.map(x=>x.drcAvant)))+" → "+f1(moy(g.map(x=>x.drc)))+" | "+f1(moy(g.map(x=>x.msDrc)))+" |");
}
const faux=sch.filter(s=>s.ecarts.length);
if(faux.length){
  lignes.push("","## Nets faux (10 premiers)","");
  faux.flatMap(s=>s.ecarts.map(e=>"- carte "+s.carte+" : "+e)).slice(0,10).forEach(l=>lignes.push(l));
}
const md=lignes.join("\n")+"\n", tag=new Date().toISOString().slice(0,19).replace(/[:T]/g,"-");
fs.writeFileSync(path.join(OUT,"rapport-"+tag+".md"),md);
fs.writeFileSync(path.join(OUT,"rapport-"+tag+".json"),
  JSON.stringify({cartes,graine,tailles,schema:sch.map(s=>Object.assign({},s,{netlist:undefined})),pcb},null,1));
console.log("\n"+md+"\nRapport : exports/benchmark/rapport-"+tag+".md");
