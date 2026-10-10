"use strict";
/* ==========================================================================
   Éditeur PCB — topologie des nets et longueurs de moignon
   --------------------------------------------------------------------------
   La longueur d'un net ne dit pas sa FORME. Un bus SPI à deux mémoires peut
   passer de broche en broche (une chaîne) ou se fendre en Y au milieu (une
   étoile improvisée) : même longueur totale, pas du tout le même signal. Ce
   module lit la forme du cuivre, net par net, et le gestionnaire de
   contraintes (30-contraintes.js) la confronte à celle qu'on exige :

     · point à point : deux broches, un seul chemin (USB, RF, une horloge
       vers un seul récepteur) ;
     · chaîne (daisy-chain) : les broches les unes après les autres, dans un
       ordre qu'on peut imposer (« U1, U4, U5 »), sans dérivation au-delà du
       moignon admis (SPI vers plusieurs mémoires, I²C, CAN, RS-485) ;
     · étoile : toutes les branches partent d'un même point et ont la même
       longueur, à une tolérance près (horloge distribuée) ;
     · fly-by : une chaîne à moignons très courts, terminée par une
       résistance au bout opposé à la source (adresses et commandes DDR).

   Et les MOIGNONS, quelle que soit la forme demandée :

     · dérivation : la longueur entre une broche et le chemin principal (la
       branche vers U3, le point de test TP7 qui pend au bout d'un fil) ;
     · bout libre : une piste qui finit en impasse, sans broche ;
     · moignon de via : la part du fût au-delà des couches où le signal entre
       et sort — un via traversant qui relie L1 à L2 d'une quatre couches
       laisse L2 → L4 pendre sous le signal.

   LE GRAPHE. Les nœuds sont les broches du net, ses vias et les jonctions
   de pistes ; les arêtes, les pistes, avec leur longueur (arcs compris). Le
   bout d'une piste se rattache à ce que `linkSync` (25-liens.js) dit qui le
   tient — pastille ou via — sinon à un point de jonction de sa couche. Un
   bout qui tombe au milieu d'une autre piste (une jonction en T) coupe
   celle-ci en deux. Un via dans une pastille CMS lui est relié d'office.

   Un net qui porte une zone de cuivre (un plan) n'a pas de forme au sens de
   ce module : il n'est pas jugé.
   ========================================================================== */

const TOPO_FORMES={p2p:"point à point",chaine:"chaîne",etoile:"étoile",flyby:"fly-by"};
const TOPO_MOIGNON_DEFAUT=1;       // mm : dérivation admise par une chaîne ou un fly-by sans réglage
const TOPO_ETOILE_TOL=1;           // mm : écart admis entre les branches d'une étoile sans réglage
const TOPO_EPS=0.002;              // mm : un point de jonction, à la précision de l'éditeur

/* ---------- le graphe du cuivre d'un net ---------- */
function topoGraphe(net){
  if(typeof linkSync==="function")linkSync();
  const nodes=new Map();
  const nd=(k,o)=>{let n=nodes.get(k);if(!n){n=Object.assign({k,adj:[]},o);nodes.set(k,n);}return n;};
  const lier=(a,b,len,t)=>{if(a===b)return;a.adj.push({n:b,len,t});b.adj.push({n:a,len,t});};
  const pads=[];
  for(const fp of S.fps)
    for(const q of padsWorld(fp)){
      if(q.net!==net)continue;
      pads.push(nd("p:"+fp.id+":"+q.n,{type:"pad",ref:String(fp.ref||"?"),pin:q.n,x:q.x,y:q.y,fp,q}));
    }
  const vias=S.vias.filter(v=>v.net===net);
  for(const v of vias)nd("v:"+v.id,{type:"via",x:v.x,y:v.y,v});
  const tracks=S.tracks.filter(t=>t.net===net);
  const plan=S.zones.some(z=>z.net===net&&z.pts&&z.pts.length>=3);
  /* le nœud d'un bout de piste */
  const bout=(t,e)=>{
    const a=t["a"+e], x=e===1?t.x1:t.x2, y=e===1?t.y1:t.y2;
    if(a&&a.v!=null&&nodes.has("v:"+a.v))return nodes.get("v:"+a.v);
    if(a&&a.f!=null&&nodes.has("p:"+a.f+":"+a.p))return nodes.get("p:"+a.f+":"+a.p);
    return nd("x:"+t.l+":"+Math.round(x/TOPO_EPS)+":"+Math.round(y/TOPO_EPS),{type:"pt",x,y,l:t.l});
  };
  const ends=tracks.map(t=>[bout(t,1),bout(t,2)]);
  /* jonctions en T : un point libre posé au milieu d'une autre piste droite */
  const coupes=new Map();
  for(const n of nodes.values()){
    if(n.type!=="pt")continue;
    tracks.forEach((t,i)=>{
      if(t.l!==n.l||isArc(t)||ends[i][0]===n||ends[i][1]===n)return;
      const L=Math.hypot(t.x2-t.x1,t.y2-t.y1);
      if(L<1e-6)return;
      const u=((n.x-t.x1)*(t.x2-t.x1)+(n.y-t.y1)*(t.y2-t.y1))/(L*L);
      if(u<=1e-6||u>=1-1e-6)return;
      if(segDist(n.x,n.y,t.x1,t.y1,t.x2,t.y2)>Math.max(TOPO_EPS,t.w/2))return;
      if(!coupes.has(i))coupes.set(i,[]);
      coupes.get(i).push({u,n});
    });
  }
  tracks.forEach((t,i)=>{
    const L=trkLen(t);
    const pts=[{u:0,n:ends[i][0]}].concat((coupes.get(i)||[]).sort((a,b)=>a.u-b.u),[{u:1,n:ends[i][1]}]);
    for(let k=0;k+1<pts.length;k++)lier(pts[k].n,pts[k+1].n,(pts[k+1].u-pts[k].u)*L,t);
  });
  /* un via posé dans une pastille CMS du net : relié à elle */
  for(const v of vias){
    const vn=nodes.get("v:"+v.id);
    for(const p of pads){
      if(p.q.drill>0)continue;
      const l=padLayers(p.fp,p.q)[0];
      if(l<Math.min(v.a,v.b)||l>Math.max(v.a,v.b))continue;
      if(typeof padHolds==="function"?padHolds(p.fp,p.q,l,v.x,v.y):dist(v.x,v.y,p.x,p.y)<Math.min(p.q.w,p.q.h)/2)
        lier(vn,p,0,null);
    }
  }
  return {net,nodes,pads,vias,tracks,plan};
}

/* Plus courts chemins depuis un nœud (Dijkstra : le graphe est petit). */
function topoDistances(G,src,dans){
  const d=new Map([[src,0]]), prec=new Map(), vus=new Set();
  const file=[src];
  while(file.length){
    let bi=0;
    for(let i=1;i<file.length;i++)if(d.get(file[i])<d.get(file[bi]))bi=i;
    const n=file.splice(bi,1)[0];
    if(vus.has(n))continue;
    vus.add(n);
    for(const e of n.adj){
      if(dans&&!dans.has(e.n))continue;
      const nd=d.get(n)+e.len;
      if(!d.has(e.n)||nd<d.get(e.n)-1e-12){d.set(e.n,nd);prec.set(e.n,n);file.push(e.n);}
    }
  }
  return {d,prec};
}
function topoChemin(prec,a,b){
  const out=[b];
  let n=b;
  while(n!==a&&prec.has(n)){n=prec.get(n);out.push(n);}
  return n===a?out.reverse():null;
}
function topoNomBroche(n){return n.ref+"."+n.pin;}
function topoEstPointTest(n){return /^TP/i.test(n.ref);}

/* ---------- moignons de via ----------
   Le fût court de la couche a à la couche b ; le signal n'en emprunte que la
   part entre la plus haute et la plus basse couche où il entre et sort. Le
   reste pend : c'est le moignon, compté en épaisseur d'empilage. */
function topoMoignonsVias(G){
  const out=[];
  for(const v of G.vias){
    const a=Math.min(v.a,v.b), b=Math.max(v.a,v.b);
    const used=new Set();
    for(const t of G.tracks)
      for(const e of [1,2]){const k=t["a"+e];if(k&&k.v===v.id)used.add(t.l);}
    const vn=G.nodes.get("v:"+v.id);
    for(const e of vn.adj)if(e.n.type==="pad"&&!(e.n.q.drill>0))used.add(padLayers(e.n.fp,e.n.q)[0]);
    if(used.size<2)continue;                 // via de couture ou en l'air : pas un passage de signal
    const lo=Math.min(...used), hi=Math.max(...used);
    let len=0;
    if(hi<b)len+=stackSpan(hi,b)-cuT(hi);
    if(lo>a)len+=stackSpan(a,lo)-cuT(lo);
    if(len>1e-4)out.push({v,len:r3(len),x:v.x,y:v.y,de:lo,a:hi,
      txt:"via L"+(lo+1)+"→L"+(hi+1)+" percé L"+(a+1)+"–L"+(b+1)});
  }
  return out.sort((x,y)=>y.len-x.len);
}

/* ---------- la forme d'un net ----------
   Rend {forme, broches, tronc, ordre, moignons, boutsLibres, branches,
   moignonsVias, …}. `source` : le repère d'où part le signal, s'il est
   connu (premier repère de l'ordre imposé) — il décide du bout du tronc et
   de la branche qu'une étoile ne compte pas. */
const TOPO_BROCHES_MAX=200;        // au-delà, un net est un plan ou un bus d'alimentation : non analysé
let topoCache={cle:"",m:new Map()};
function topoAnalyser(net,source){
  const cle=S.ver+"|"+S.tracks.length+"|"+S.vias.length+"|"+S.fps.length+"|"+S.zones.length;
  if(topoCache.cle!==cle)topoCache={cle,m:new Map()};
  const k=net+"\u241E"+(source||"");
  if(!topoCache.m.has(k))topoCache.m.set(k,topoAnalyser0(net,source));
  return topoCache.m.get(k);
}
function topoAnalyser0(net,source){
  const G=topoGraphe(net);
  const R={net,forme:"",broches:G.pads.length,tronc:[],ordre:[],moignons:[],boutsLibres:[],
           branches:[],moignonsVias:[],centre:null,longueur:0,G};
  if(G.plan){R.forme="plan";return R;}
  if(G.pads.length<2){R.forme=G.pads.length?"une broche":"sans broche";return R;}
  if(G.pads.length>TOPO_BROCHES_MAX){R.forme="non analysé ("+G.pads.length+" broches)";return R;}
  if(!G.tracks.length){R.forme="non routé";return R;}
  R.moignonsVias=topoMoignonsVias(G);
  /* la composante des broches ; une broche hors d'elle : routage incomplet */
  const D0=topoDistances(G,G.pads[0]);
  const comp=new Set(D0.d.keys());
  const horsComp=G.pads.filter(p=>!comp.has(p));
  if(horsComp.length){R.forme="incomplet";R.manquent=horsComp.map(topoNomBroche);return R;}
  let nE=0;
  for(const n of comp)nE+=n.adj.length;
  nE/=2;
  if(nE>=comp.size){R.forme="maillé";return R;}          // une boucle : pas un arbre
  /* les bouts libres : on effeuille ce qui ne mène à aucune broche, en
     mesurant ce qu'on retire */
  const deg=new Map([...comp].map(n=>[n,n.adj.length]));
  const reste=new Set(comp), libre=new Map();
  let change=true;
  while(change){
    change=false;
    for(const n of [...reste]){
      if(n.type==="pad"||deg.get(n)>1)continue;
      const e=n.adj.find(x=>reste.has(x.n));
      reste.delete(n);change=true;
      const acc=(libre.get(n)||0)+(e?e.len:0);
      if(e){
        deg.set(e.n,deg.get(e.n)-1);
        const prev=libre.get(e.n)||0;
        if(e.n.type!=="pad"&&deg.get(e.n)<=1)libre.set(e.n,Math.max(prev,acc));
        else R.boutsLibres.push({len:r3(acc),x:n.x,y:n.y,depuis:e.n});
      }
    }
  }
  /* le tronc : le plus long chemin entre deux broches, ou celui qui part de
     la source quand elle est donnée */
  const pads=G.pads.filter(p=>reste.has(p));
  let A=null,B=null,best=-1,DA=null;
  const sources=source?pads.filter(p=>p.ref===source):[];
  for(const p of (sources.length?sources:pads)){
    const D=topoDistances(G,p,reste);
    for(const q of pads){
      if(q===p)continue;
      const d=D.d.get(q);
      if(d!=null&&d>best+1e-9){best=d;A=p;B=q;DA=D;}
    }
  }
  if(!A){R.forme="—";return R;}
  const tronc=topoChemin(DA.prec,A,B)||[A,B];
  const surTronc=new Map(tronc.map((n,i)=>[n,i]));
  R.tronc=tronc;R.longueur=r3(best);
  /* chaque broche hors du tronc : sa distance au tronc, et l'endroit où elle
     s'y raccroche */
  const pos=new Map(tronc.map(n=>[n,DA.d.get(n)]));
  for(const p of pads){
    if(surTronc.has(p))continue;
    const D=topoDistances(G,p,reste);
    let bn=null,bd=Infinity;
    for(const n of tronc){const d=D.d.get(n);if(d!=null&&d<bd){bd=d;bn=n;}}
    if(!bn)continue;
    R.moignons.push({broche:topoNomBroche(p),ref:p.ref,len:r3(bd),x:p.x,y:p.y,
                     at:pos.get(bn),tp:topoEstPointTest(p),noeud:p});
  }
  /* l'ordre des repères le long du tronc, dérivations comprises à l'endroit
     où elles s'y raccrochent */
  const seq=tronc.filter(n=>n.type==="pad").map(n=>({ref:n.ref,at:pos.get(n)}))
    .concat(R.moignons.map(m=>({ref:m.ref,at:m.at})))
    .sort((a,b)=>a.at-b.at);
  for(const s of seq)if(R.ordre[R.ordre.length-1]!==s.ref)R.ordre.push(s.ref);
  /* la forme */
  const hubs=[...reste].filter(n=>[...n.adj].filter(e=>reste.has(e.n)).length>=3);
  if(pads.length===2&&!hubs.length)R.forme="point à point";
  else if(!hubs.length)R.forme="chaîne";
  else if(hubs.length===1){
    /* une étoile : chaque branche du centre mène à une broche, et une seule */
    const h=hubs[0], br=[];
    let ok=true;
    for(const e of h.adj){
      if(!reste.has(e.n))continue;
      const vus=new Set([h]), pile=[{n:e.n,len:e.len}];
      let feuilles=[];
      while(pile.length){
        const c=pile.pop();
        vus.add(c.n);
        if(c.n.type==="pad")feuilles.push(c);
        for(const f of c.n.adj)if(reste.has(f.n)&&!vus.has(f.n))pile.push({n:f.n,len:c.len+f.len});
      }
      if(feuilles.length!==1){ok=false;break;}
      br.push({ref:feuilles[0].n.ref,broche:topoNomBroche(feuilles[0].n),len:r3(feuilles[0].len),
               x:feuilles[0].n.x,y:feuilles[0].n.y});
    }
    /* le centre peut être une broche : le pilote d'où partent les branches */
    if(ok){R.forme="étoile";R.centre=h;R.branches=br;}
    else R.forme="arbre";
  }else R.forme="arbre";
  if(R.forme==="arbre"&&R.moignons.every(m=>m.len<=TOPO_MOIGNON_DEFAUT+1e-9))R.forme="chaîne à dérivations courtes";
  return R;
}

/* ---------- les contrôles ----------
   `r` : les contraintes résolues du net (cmRegleDe). Rend des {cle, msg,
   info?} comme cmVerifier, qu'il complète. */
function topoVerifier(net,r){
  const out=[];
  const veut=r.topo||r.stubMax||r.viaStubMax;
  if(!veut)return out;
  const de=x=>x.src==="net"?" (net)":" (classe "+r.classe+")";
  const ordre=r.ordre?r.ordre.v:[];
  const T=topoAnalyser(net,ordre[0]||"");
  if(T.forme==="plan"||T.forme==="non routé"||T.forme==="sans broche"||T.forme==="une broche"||
     /^non analysé/.test(T.forme))return out;
  if(T.forme==="incomplet"){
    if(r.topo)out.push({cle:"topo",info:true,msg:"topologie non jugée : "+T.manquent.join(", ")+" pas encore relié(s)"});
    return out;
  }
  const mm=v=>fmt(v,2).replace(".",",");
  const topo=r.topo?r.topo.v:"";
  if(topo){
    const nom=TOPO_FORMES[topo];
    if(T.forme==="maillé")out.push({cle:"topo",msg:nom+" attendue, le cuivre forme une boucle"+de(r.topo)});
    else if(topo==="p2p"){
      if(T.broches!==2)out.push({cle:"topo",msg:"point à point attendu, le net relie "+T.broches+" broches"+de(r.topo)});
      else if(T.forme!=="point à point")out.push({cle:"topo",msg:"point à point attendu, le cuivre fait "+T.forme+de(r.topo)});
    }else if(topo==="etoile"){
      if(T.forme!=="étoile")out.push({cle:"topo",msg:"étoile attendue, le cuivre fait "+T.forme+de(r.topo)});
      else{
        const tol=r.etoileTol?r.etoileTol.v:TOPO_ETOILE_TOL;
        const br=T.branches.filter(b=>!ordre[0]||b.ref!==ordre[0]);
        if(br.length>=2){
          const lo=br.reduce((a,b)=>b.len<a.len?b:a), hi=br.reduce((a,b)=>b.len>a.len?b:a);
          if(hi.len-lo.len>tol+1e-9)out.push({cle:"etoileTol",msg:"branches de l'étoile inégales : "+
            hi.broche+" "+mm(hi.len)+" mm, "+lo.broche+" "+mm(lo.len)+" mm (± "+mm(tol)+" mm admis)"});
        }
      }
    }else{
      /* chaîne et fly-by : un chemin, des dérivations courtes */
      const smax=r.stubMax?r.stubMax.v:TOPO_MOIGNON_DEFAUT;
      if(T.forme==="étoile")out.push({cle:"topo",msg:nom+" attendue, le cuivre fait une étoile"+de(r.topo)});
      else{
        const longs=T.moignons.filter(m=>m.len>smax+1e-9);
        if(longs.length&&!r.stubMax)
          for(const m of longs)out.push({cle:"topo",msg:nom+" attendue : "+m.broche+" pend sur "+mm(m.len)+
            " mm hors du chemin (dérivation au-delà de "+mm(smax)+" mm)"+de(r.topo)});
      }
      if(ordre.length>=2){
        const vu=T.ordre.filter(x=>ordre.indexOf(x)>=0);
        const attendu=ordre.filter(x=>vu.indexOf(x)>=0);
        const ok=vu.join(">")===attendu.join(">")||vu.slice().reverse().join(">")===attendu.join(">");
        if(!ok)out.push({cle:"ordre",msg:"ordre "+vu.join(" → ")+" le long du cuivre, attendu "+attendu.join(" → ")+de(r.ordre)});
      }
      if(topo==="flyby"){
        const bouts=[T.tronc[0],T.tronc[T.tronc.length-1]].filter(n=>n&&n.type==="pad");
        const fin=ordre.length>=2?ordre[ordre.length-1]:null;
        const term=fin?bouts.some(n=>n.ref===fin):bouts.some(n=>/^R/i.test(n.ref));
        if(!term)out.push({cle:"topo",msg:"fly-by : "+(fin?fin+" doit être":"une résistance de terminaison doit être")+
          " au bout de la ligne (bouts : "+bouts.map(topoNomBroche).join(", ")+")"});
      }
    }
  }
  /* moignons : partout, sauf les branches d'une étoile qui n'en sont pas */
  if(r.stubMax&&topo!=="etoile"){
    for(const m of T.moignons)
      if(m.len>r.stubMax.v+1e-9)out.push({cle:"stubMax",msg:"moignon de "+mm(m.len)+" mm vers "+m.broche+
        (m.tp?" (point de test)":"")+", "+mm(r.stubMax.v)+" mm admis"+de(r.stubMax)});
    for(const b of T.boutsLibres)
      if(b.len>r.stubMax.v+1e-9)out.push({cle:"stubMax",msg:"bout de piste libre de "+mm(b.len)+" mm, "+
        mm(r.stubMax.v)+" mm admis"+de(r.stubMax)});
  }
  if(r.viaStubMax)
    for(const v of T.moignonsVias)
      if(v.len>r.viaStubMax.v+1e-9)out.push({cle:"viaStubMax",msg:"moignon de via de "+mm(v.len)+" mm ("+v.txt+
        "), "+mm(r.viaStubMax.v)+" mm admis — via borgne ou contre-perçage"+de(r.viaStubMax)});
  return out;
}
/* Le plus long moignon et le plus long moignon de via, pour le tableau. */
function topoResume(net,source){
  const T=topoAnalyser(net,source);
  const m=T.moignons.concat(T.boutsLibres.map(b=>({len:b.len,broche:"bout libre"})))
    .reduce((a,b)=>!a||b.len>a.len?b:a,null);
  const v=T.moignonsVias[0]||null;
  return {forme:T.forme,broches:T.broches,ordre:T.ordre,moignon:m,moignonVia:v,
          branches:T.branches,longueur:T.longueur};
}
