/* =============================================================================
   editeur-schematique — 05-feuilles.js
   Feuilles (onglets), historique undo/redo, création
   ============================================================================= */
"use strict";
/* ---------- feuilles ---------- */
function newPage(name, isHier){
  return {
    name: name || (isHier ? "Hiérarchie" : "Feuille"),
    isHierarchy: !!isHier,
    comps: [],
    wires: [],
    drawings: [],
    uid: 1,
    scale: 1,
    ox: 0,
    oy: 0
  };
}
function newHierPage(name){ return newPage(name || "Hiérarchie", true); }
function storeCurrent(){
  const p=S.pages[S.page];if(!p)return;
  p.comps=S.comps;p.wires=S.wires;p.drawings=S.drawings||[];p.uid=S.uid;
  p.scale=S.scale;p.ox=S.ox;p.oy=S.oy;
}
function loadPage(i){
  S.page=Math.max(0,Math.min(S.pages.length-1,i));
  const p=S.pages[S.page];
  S.comps=p.comps;S.wires=p.wires;S.drawings=p.drawings||[];S.uid=p.uid||1;
  S.scale=p.scale||1;S.ox=p.ox||0;S.oy=p.oy||0;
  clearSel();S.wireStart=null;S.drawStart=null;S.place=null;S.placeLibItem=null;S.drag=null;S.marquee=null;setPalette(null);
  touchWires();
}
function gotoPage(i){
  if(i===S.page||i<0||i>=S.pages.length)return;
  storeCurrent();loadPage(i);buildTabs();refreshPanels();
  const p=S.pages[S.page];
  if(!p.viewed){p.viewed=true;fit();}else draw();
}
function addPage(copyCurrent){
  push();storeCurrent();
  const nextNum = Math.max(1, S.pages.length);
  const p=newPage("Feuille "+nextNum);
  if(copyCurrent){
    if(S.page===0 || (S.pages[0]&&S.pages[0].isHierarchy&&S.page===0)){
      alert("La feuille hiérarchique racine ne peut pas être dupliquée.");
      return;
    }
    const src=S.pages[S.page];
    p.name=src.name+" (copie)";
    p.comps=JSON.parse(JSON.stringify(src.comps));
    p.wires=JSON.parse(JSON.stringify(src.wires));
    p.drawings=JSON.parse(JSON.stringify(src.drawings||[]));
    p.uid=src.uid;p.scale=src.scale;p.ox=src.ox;p.oy=src.oy;
  }
  S.pages.push(p);p.viewed=true;loadPage(S.pages.length-1);
  if(copyCurrent){
    /* nouveaux repères, comme dupSel ; les parties d'un même boîtier (U1A, U1B) en gardent un seul */
    const neuf=new Map();
    for(const c of S.comps){
      if(defOf(c.type).noRef||!c.ref)continue;
      if(!neuf.has(c.ref))neuf.set(c.ref,nextRef(defOf(c.type).p));
      c.ref=neuf.get(c.ref);
    }
  }
  buildTabs();refreshPanels();
  if(copyCurrent)draw();else fit();
}
function removePage(i){
  if(i===0 || (S.pages[i] && S.pages[i].isHierarchy)){
    alert("La feuille hiérarchique racine ne peut pas être supprimée.");
    return;
  }
  if(S.pages.length<=2){
    alert("Le projet doit conserver au moins une feuille de schématique en plus de la feuille hiérarchique.");
    return;
  }
  storeCurrent(); // le décompte lit la feuille, pas l'état vivant de S
  const p=S.pages[i];
  if((p.comps.length||p.wires.length||(p.drawings||[]).length)&&!confirm("Supprimer « "+p.name+" » et tout son contenu ?"))return;
  push();storeCurrent();
  S.pages.splice(i,1);
  if(i===S.page) loadPage(Math.min(S.page,S.pages.length-1));
  else if(i<S.page) S.page--;
  buildTabs();refreshPanels();draw();
}
function renamePage(i){
  const n=prompt("Nom de la feuille :",S.pages[i].name);
  if(n===null)return;
  push();S.pages[i].name=n.trim()||S.pages[i].name;buildTabs();
}
/* Premier numéro des repères de la feuille i : par défaut la centaine de son rang
   (feuille 1 → 100, feuille 2 → 200…), sauf réglage à la main. */
function refStartDe(i){
  const p=S.pages[i];
  return (p&&p.refStart)||i*100||1;
}
/* Premier numéro des repères posés sur la feuille i (R100, C100, J100…) ; sur
   demande, les composants déjà posés y sont renumérotés, préfixe par préfixe,
   dans l'ordre de leurs numéros actuels et sans reprendre un repère d'une autre
   feuille. */
function refStartPage(i){
  const p=S.pages[i];
  const t=prompt("Premier numéro des repères de « "+p.name+" » (ex. 100 → R100, C100, J100) :",
                 String(refStartDe(i)));
  if(t===null)return;
  const n=parseInt(t,10);
  if(!(n>=1)){alert("Un entier positif, s'il vous plaît.");return;}
  push();storeCurrent();
  if(n!==i*100)p.refStart=n;else delete p.refStart;
  const comps=p.comps||[];
  if(comps.some(c=>c.ref)&&confirm("Renuméroter aussi les composants déjà posés sur cette feuille à partir de "+n+" ?\n\n"+
     "Le PCB reconnaît les composants par leur repère : après la mise à jour depuis le schéma, "+
     "les empreintes renumérotées seront à replacer.")){
    const autres=new Set();
    S.pages.forEach((q,k)=>{if(k!==i)for(const c of q.comps||[])if(c.ref)autres.add(c.ref);});
    const parPrefixe=new Map();
    for(const c of comps){
      const m=/^(.*?)(\d+)$/.exec(c.ref||"");
      if(!m)continue;
      if(!parPrefixe.has(m[1]))parPrefixe.set(m[1],[]);
      parPrefixe.get(m[1]).push({c,num:+m[2]});
    }
    for(const [pre,l] of parPrefixe){
      l.sort((a,b)=>a.num-b.num);
      let k=n;
      for(const e of l){
        while(autres.has(pre+k))k++;
        e.c.ref=pre+k++;
      }
    }
    if(i===S.page)loadPage(i);
    refreshPanels();draw();
  }
  buildTabs();
}
/* Cadre de page et cartouche de la feuille courante (commun/cartouche.js),
   format réglé feuille par feuille. La page se centre sur le dessin quand on
   choisit son format, puis reste où elle est (pageX, pageY : son coin). */
const SCH_U=20/2.54;            // unités du schéma par mm : la grille de 20 vaut 0,1 pouce
function schPage(){
  const p=S.pages[S.page], F=p&&CARTOUCHE_FORMATS[p.format];
  if(!F)return null;
  const x1=p.pageX||0, y1=p.pageY||0;
  return {x1,y1,x2:x1+F.w*SCH_U,y2:y1+F.h*SCH_U};
}
function schCartouche(c){
  const p=S.pages[S.page], P=schPage();
  if(!P)return;
  const vid=S.variantes&&S.variantes.active;
  cartoucheDessiner(c,P.x1,P.y1,SCH_U,p.format,
    cartoucheChamps(S.cartoucheInfo,p.name,S.page?S.page+"/"+(S.pages.length-1):"0",
                    vid&&typeof varNom==="function"?varNom(S.variantes,vid):""),"sch");
}
/* Format de la feuille courante ; un nouveau format recentre la page sur le dessin. */
function schCartoucheFormat(f){
  const p=S.pages[S.page];
  if((p.format||"")===f)return;
  delete p.pageX;delete p.pageY;
  if(f){
    p.format=f;
    const b=schContenu(), F=CARTOUCHE_FORMATS[f];
    if(b){p.pageX=snap((b.x1+b.x2-F.w*SCH_U)/2);p.pageY=snap((b.y1+b.y2-F.h*SCH_U)/2);}
  }else delete p.format;
}
function schCartoucheBasculer(){
  push();storeCurrent();
  schCartoucheFormat(cartoucheSuivant(S.pages[S.page].format||""));
  buildTabs();fit();
}
/* Le bouton : format de la feuille, champs du document, société du profil */
function schCartoucheDialogue(){
  cartoucheDialogue({format:S.pages[S.page].format||"",info:S.cartoucheInfo,appliquer:(f,info)=>{
    push();storeCurrent();
    const avant=S.pages[S.page].format||"";
    S.cartoucheInfo=info;
    schCartoucheFormat(f);
    buildTabs();
    if(f!==avant)fit();else draw();
  }});
}
function buildTabs(){
  const b=document.getElementById("bCartouche"), f=S.pages[S.page]&&S.pages[S.page].format;
  if(b){b.textContent="Cartouche : "+(f||"aucun");b.classList.toggle("on",!!f);}
  const box=document.getElementById("tabs");
  box.innerHTML="";
  S.pages.forEach((p,i)=>{
    const t=document.createElement("div");
    const isHier=(i===0 || !!p.isHierarchy);
    t.className="tab"+(isHier?" hier":"")+(i===S.page?" on":"");
    t.title=(isHier?"Feuille hiérarchique racine · Double-clic pour renommer":"Double-clic pour renommer")+
            " · Clic droit : premier numéro des repères ("+refStartDe(i)+")";
    if(isHier){
      t.innerHTML='<span class="num">⬡</span><span>'+esc(p.name)+'</span><span class="tag-hier">Hiérarchie</span>';
    }else{
      t.innerHTML='<span class="num">'+String(i).padStart(2,"0")+'</span><span>'+esc(p.name)+'</span>';
      const x=document.createElement("span");x.className="x";x.textContent="✕";
      x.title="Supprimer cette feuille";
      x.onclick=e=>{e.stopPropagation();removePage(i);};
      t.appendChild(x);
    }
    t.onclick=()=>gotoPage(i);
    t.ondblclick=()=>renamePage(i);
    t.oncontextmenu=e=>{e.preventDefault();refStartPage(i);};
    box.appendChild(t);
  });
  const add=document.createElement("button");
  add.className="tabbtn";add.textContent="+ Feuille";add.title="Ajouter une feuille de schématique";
  add.onclick=()=>addPage(false);
  box.appendChild(add);
  const dup=document.createElement("button");
  dup.className="tabbtn";dup.textContent="Dupliquer";dup.title="Copier la feuille courante";
  dup.onclick=()=>addPage(true);
  box.appendChild(dup);
  const br=document.getElementById("bRanger");
  if(br)br.disabled=S.page!==0;
  const fp=document.getElementById("fPage");
  if(fp){
    if(S.page===0){
      const nSub=Math.max(0,S.pages.length-1);
      fp.textContent="Hiérarchie ("+nSub+" feuille"+(nSub>1?"s":"")+")";
    }else{
      fp.textContent="Feuille "+S.page+"/"+Math.max(1,S.pages.length-1);
    }
  }
}

/* ---------- Synoptique : les sous-feuilles en blocs sur la feuille racine (page 0) ----------
   Un bloc par sous-feuille ; une liaison par paire de blocs reliés par des nets globaux
   (étiquettes globales, symboles d'alimentation). La masse relierait tout : elle n'est pas
   dessinée. Les fils sont routés en équerre sans jamais partager une voie (synRouter). */
function isPortBusName(nm){
  if(!nm) return false;
  return /(\[|\{|\.\.|BUS|^SPI|^I2C|^UART|^CAN|^USB|^DATA|^ADDR|^GPIO|^PWM)/i.test(nm);
}
/* Alimentation : +…, VCC/VDD/VBAT/VBUS/VIN/VSYS… et leurs variantes (VBAT_F, VCC_3V3), 5V, 3V3_A… */
function isPortPowerName(nm){
  if(!nm) return false;
  return /^(\+|-?\d+([.,]\d+)?V\d*($|[_\-])|V((CC|DD|SS)[A-Z]{0,2}|BAT|BUS|IN|SYS|OUT|MAIN)($|[_\-\d]))/i.test(nm) ||
         nm.toUpperCase().includes("GND");
}
const SYN_MASSE=/GND|VSS|MASSE|^0V$/i;

/* Le composant qui a le plus de broches donne le sous-titre du bloc. */
function synPrincipal(comps){
  let best=null,n=0;
  for(const el of comps){
    if(defOf(el.type).noRef)continue;
    const k=pinCount(el);
    if(k>n){n=k;best=el;}
  }
  return best?String(best.mpn||best.value||best.ref||""):"";
}

/* Tension lue dans le nom (5V, +3V3, 3.3V…) ; un nom sans chiffre (VBAT, VIN) est une
   source brute, donc la plus haute. */
function synVolt(nm){
  const m=/(\d+)(?:[.,V](\d+))?/i.exec(String(nm).replace(/^\+/,""));
  return m?parseFloat(m[1]+"."+(m[2]||"0")):Infinity;
}
/* Noms regroupés par famille : SPI2_MOSI, SPI2_MISO → « SPI2 » ; DSHOT1…4 → « DSHOT ×4 » ;
   au-delà de trois familles, leur nombre. */
function synLibelle(noms){
  if(noms.length===1)return noms[0];
  const fam=new Map();
  for(const n of noms){
    const t=n.split(/[_\-.\/\s]/), k=(t.length>1?t[0]:t[0].replace(/\d+$/,""))||n;
    if(!fam.has(k))fam.set(k,[]);
    fam.get(k).push(n);
  }
  if(fam.size>3)return noms.length+" signaux";
  return [...fam].map(([k,l])=>l.length===1?l[0]:(l.every(n=>/^\d+$/.test(n.slice(k.length)))?k+" ×"+l.length:k)).join(", ");
}

/* Liaisons entre sous-feuilles : {a, b, name, names, kind:"power"|"signal", isBus,
   dir:"a" (de a vers b) | "ab" | ""}. Le sens d'une alimentation va de la feuille qui la
   produit (elle porte une tension plus haute, ou le connecteur d'entrée) vers les autres ;
   celui d'un signal, de la broche TX/OUT vers les autres ; un bus va dans les deux sens. */
function sheetLinks(){
  if(!S.pages||S.pages.length<3||typeof docNets!=="function")return [];
  const nets=[], deg=new Map(), alims=new Map();
  for(const g of docNets().groups){
    const pages=g.pages.filter(p=>p>0).sort((a,b)=>a-b);
    if(!g.global||!pages.length||SYN_MASSE.test(g.name))continue;
    const power=isPortPowerName(g.name)||g.members.some(m=>m.net.powers.some(el=>el.type==="vcc"));
    // toutes les alims d'une feuille comptent pour le sens, même celles qui n'en sortent pas
    if(power)for(const p of pages){if(!alims.has(p))alims.set(p,[]);alims.get(p).push(g.name);}
    if(pages.length<2)continue;
    nets.push({g,pages,power,bus:!power&&(g.members.some(m=>m.net.isBus)||isPortBusName(g.name))});
    for(const p of pages)deg.set(p,(deg.get(p)||0)+1);
  }
  const source=n=>{
    const v=synVolt(n.g.name), au=p=>(alims.get(p)||[]).filter(m=>m!==n.g.name).map(synVolt);
    let c;
    if(!n.power){
      c=n.pages.filter(p=>n.g.nodes.some(d=>d.page===p&&/(^|[_\/])(TXD?|DOUT|OUT\d*|PWM\d*)$/i.test(d.label||"")));
      return c.length===1?c[0]:null;
    }
    if(v<Infinity){
      c=n.pages.filter(p=>au(p).some(u=>u>v));
      c.sort((p,q)=>Math.min(...au(p).filter(u=>u>v))-Math.min(...au(q).filter(u=>u>v)));
    }else{
      c=n.pages.filter(p=>n.g.nodes.some(d=>d.page===p&&/^(J|P|BT|CN|X)\d/i.test(d.ref)));
      if(!c.length)c=n.pages.filter(p=>au(p).includes(Infinity));
    }
    return c.length?c[0]:null;
  };
  const paires=new Map();
  for(const n of nets){
    const src=source(n);
    const hub=src!==null?src:(n.power?n.pages[0]:n.pages.reduce((m,p)=>deg.get(p)>deg.get(m)?p:m));
    for(const q of n.pages){
      if(q===hub)continue;
      const lo=Math.min(hub,q), hi=Math.max(hub,q), cle=lo+"-"+hi+(n.power?"p":"s");
      let l=paires.get(cle);
      if(!l)paires.set(cle,l={lo,hi,names:[],power:n.power,isBus:false,sens:new Set()});
      l.names.push(n.g.name);
      l.isBus=l.isBus||n.bus;
      l.sens.add(n.bus?"ab":src===null?"":(hub===lo?"+":"-"));
    }
  }
  return [...paires.values()].map(l=>{
    l.sens.delete("");
    const s=l.sens.size===1?[...l.sens][0]:(l.sens.size?"ab":"");
    return {a:s==="-"?l.hi:l.lo, b:s==="-"?l.lo:l.hi, name:synLibelle(l.names), names:l.names,
            kind:l.power?"power":"signal", isBus:l.isBus, isPower:l.power,
            dir:s==="ab"?"ab":(s?"a":"")};
  });
}

function sheetBlocks(){
  if(!S.pages||S.pages.length<=1)return [];
  const deg=new Map();
  // le bloc central est celui qui échange le plus de signaux : les alims n'en font pas un centre
  for(const l of sheetLinks())if(!l.isPower){deg.set(l.a,(deg.get(l.a)||0)+1);deg.set(l.b,(deg.get(l.b)||0)+1);}
  let hub=null;
  for(const [p,d] of deg)if(d>=3&&(hub===null||d>deg.get(hub)))hub=p;
  const blocks=[];
  for(let i=1;i<S.pages.length;i++){
    const p=S.pages[i];
    const comps=(i===S.page)?S.comps:(p.comps||[]);
    const wires=(i===S.page)?S.wires:(p.wires||[]);
    const name=String(p.name||"").replace(/^Feuille\s*\d+\s*:\s*/i,"");
    const sub=(p.blockSub!=null&&String(p.blockSub).trim()!=="")?String(p.blockSub):synPrincipal(comps);
    const big=(i===hub);
    // chasse fixe : la largeur se déduit du nombre de caractères (titre 19 px, sous-titre 13 px)
    const lt=big?17:11.5, ls=big?10.3:7.9;
    const w=Math.max(big?300:160,Math.ceil((Math.max(name.length*lt,sub.length*ls)+40)/20)*20);
    const h=big?140:60;
    const col=(i-1)%3, row=Math.floor((i-1)/3);
    const x=(p.blockPos&&Number.isFinite(p.blockPos.x))?p.blockPos.x:60+col*340;
    const y=(p.blockPos&&Number.isFinite(p.blockPos.y))?p.blockPos.y:60+row*160;
    blocks.push({sheetIndex:i,page:p,name,sub,big,x,y,w,h,nComps:comps.length,nWires:wires.length});
  }
  return blocks;
}

function hitSheetBlock(wx,wy){
  if(S.page!==0)return null;
  const blocks=sheetBlocks();
  for(let i=blocks.length-1;i>=0;i--){
    const b=blocks[i];
    if(wx>=b.x&&wx<=b.x+b.w&&wy>=b.y&&wy<=b.y+b.h)return b;
  }
  return null;
}

/* ---------- Routage orthogonal : A* sur une grille, voies exclusives, croisements chers ---------- */
const SYN_G=10;
function synRouter(blocks,links){
  const G=SYN_G, M=16;
  let x1=1e9,y1=1e9,x2=-1e9,y2=-1e9;
  for(const b of blocks){x1=Math.min(x1,b.x);y1=Math.min(y1,b.y);x2=Math.max(x2,b.x+b.w);y2=Math.max(y2,b.y+b.h);}
  const oi=Math.floor(x1/G)-M, oj=Math.floor(y1/G)-M;
  const nx=Math.ceil(x2/G)+M-oi+1, ny=Math.ceil(y2/G)+M-oj+1, N=nx*ny;
  const id=(i,j)=>j*nx+i, dans=(i,j)=>i>=0&&j>=0&&i<nx&&j<ny;
  const bloque=new Uint8Array(N), abord=new Uint8Array(N), occ=new Uint8Array(N);   // occ : 1 voie horizontale, 2 verticale
  const marque=(t,b,m)=>{
    for(let j=Math.floor(b.y/G)-oj-m;j<=Math.ceil((b.y+b.h)/G)-oj+m;j++)
      for(let i=Math.floor(b.x/G)-oi-m;i<=Math.ceil((b.x+b.w)/G)-oi+m;i++)if(dans(i,j))t[id(i,j)]=1;
  };
  for(const b of blocks){marque(bloque,b,1);marque(abord,b,5);}   // abord : on n'y croise pas les fils des autres
  const D=[[1,0],[0,1],[-1,0],[0,-1]], axe=d=>d%2===0?1:2;
  const voisinPris=(i,j,ax)=>{          // fil parallèle collé : on écarte les voies
    const [di,dj]=ax===1?[0,1]:[1,0];
    let n=0;
    for(const s of [1,-1])if(dans(i+di*s,j+dj*s)&&(occ[id(i+di*s,j+dj*s)]&ax))n++;
    return n;
  };
  // départs possibles : à deux mailles du bord, direction sortante, point du bord, écart au milieu
  function accroches(b){
    const r=[], i0=Math.ceil(b.x/G)-oi+1, i1=Math.floor((b.x+b.w)/G)-oi-1,
          j0=Math.ceil(b.y/G)-oj+1, j1=Math.floor((b.y+b.h)/G)-oj-1,
          ci=(i0+i1)/2, cj=(j0+j1)/2;
    for(let i=i0;i<=i1;i++){
      r.push({i,j:Math.floor(b.y/G)-oj-2,d:3,x:(i+oi)*G,y:b.y,ex:Math.abs(i-ci)});
      r.push({i,j:Math.ceil((b.y+b.h)/G)-oj+2,d:1,x:(i+oi)*G,y:b.y+b.h,ex:Math.abs(i-ci)});
    }
    for(let j=j0;j<=j1;j++){
      r.push({i:Math.floor(b.x/G)-oi-2,j,d:2,x:b.x,y:(j+oj)*G,ex:Math.abs(j-cj)});
      r.push({i:Math.ceil((b.x+b.w)/G)-oi+2,j,d:0,x:b.x+b.w,y:(j+oj)*G,ex:Math.abs(j-cj)});
    }
    return r.filter(a=>dans(a.i,a.j)&&!bloque[id(a.i,a.j)]&&!occ[id(a.i,a.j)]);
  }
  function astar(src,dst){
    const goals=new Map();
    for(const g of accroches(dst))goals.set(id(g.i,g.j)*4+((g.d+2)%4),g);
    const cost=new Float64Array(N*4).fill(Infinity), from=new Int32Array(N*4).fill(-1);
    // distance au cadre des arrivées : ne surestime jamais, donc le chemin trouvé reste le moins cher
    const gi0=Math.floor(dst.x/G)-oi-2, gi1=Math.ceil((dst.x+dst.w)/G)-oi+2,
          gj0=Math.floor(dst.y/G)-oj-2, gj1=Math.ceil((dst.y+dst.h)/G)-oj+2;
    const h=(i,j)=>Math.max(0,gi0-i,i-gi1)+Math.max(0,gj0-j,j-gj1);
    const tas=[];
    const pousse=(f,s)=>{tas.push([f,s]);let k=tas.length-1;
      while(k){const p=(k-1)>>1;if(tas[p][0]<=tas[k][0])break;[tas[p],tas[k]]=[tas[k],tas[p]];k=p;}};
    const tire=()=>{const top=tas[0],last=tas.pop();
      if(tas.length){tas[0]=last;let k=0;
        for(;;){const l=2*k+1,r=l+1;let m=k;
          if(l<tas.length&&tas[l][0]<tas[m][0])m=l;if(r<tas.length&&tas[r][0]<tas[m][0])m=r;
          if(m===k)break;[tas[m],tas[k]]=[tas[k],tas[m]];k=m;}}
      return top;};
    const debut=new Map();
    for(const a of accroches(src)){
      const s=id(a.i,a.j)*4+a.d, c=a.ex*0.6+voisinPris(a.i,a.j,axe(a.d))*6;
      if(c<cost[s]){cost[s]=c;debut.set(s,a);pousse(c+h(a.i,a.j),s);}
    }
    while(tas.length){
      const [f,s]=tire(), c=cost[s];
      if(f-h((s>>2)%nx,((s>>2)/nx)|0)>c+1e-9)continue;   // entrée périmée du tas
      const cell=s>>2, d=s&3, i=cell%nx, j=(cell/nx)|0;
      if(goals.has(s)){
        const pts=[];
        for(let k=s;k>=0;k=from[k])pts.push(k);
        pts.reverse();
        return {cells:pts, a:debut.get(pts[0]), b:goals.get(s)};
      }
      for(let nd=0;nd<4;nd++){
        if(nd===(d+2)%4||(nd!==d&&occ[cell]))continue;   // pas de demi-tour, pas de virage sur une case prise
        const ni=i+D[nd][0], nj=j+D[nd][1];
        if(!dans(ni,nj))continue;
        const nc=id(ni,nj);
        if(bloque[nc]||(occ[nc]&axe(nd)))continue;     // jamais deux fils sur la même voie
        const k=c+1+(nd!==d?12:0)+(occ[nc]?(abord[nc]?70:25):0)+(abord[nc]?2:0)+voisinPris(ni,nj,axe(nd))*4;
        const ns=nc*4+nd;
        if(k<cost[ns]){cost[ns]=k;from[ns]=s;pousse(k+h(ni,nj),ns);}
      }
    }
    return null;
  }
  const par=new Map(blocks.map(b=>[b.sheetIndex,b]));
  const dist=l=>{const a=par.get(l.a),b=par.get(l.b);return Math.abs(a.x+a.w/2-b.x-b.w/2)+Math.abs(a.y+a.h/2-b.y-b.h/2);};
  const out=[];
  for(const l of links.filter(l=>par.has(l.a)&&par.has(l.b)).sort((p,q)=>dist(p)-dist(q))){
    const a=par.get(l.a), b=par.get(l.b), r=astar(a,b);
    if(!r){                                   // rien de libre : trait direct, signalé en pointillé
      out.push({link:l,pts:[[a.x+a.w/2,a.y+a.h/2],[b.x+b.w/2,b.y+b.h/2]],direct:true});
      continue;
    }
    r.cells.forEach((s,k)=>{
      occ[s>>2]|=axe(s&3);
      if(k+1<r.cells.length&&(r.cells[k+1]&3)!==(s&3))occ[s>>2]|=axe(r.cells[k+1]&3);
    });
    const p=[[r.a.x,r.a.y],...r.cells.map(s=>[((s>>2)%nx+oi)*G,((((s>>2)/nx)|0)+oj)*G]),[r.b.x,r.b.y]];
    const coins=[p[0]];                       // on ne garde que les coins
    for(let k=1;k<p.length-1;k++){
      const a0=coins[coins.length-1], b0=p[k], c0=p[k+1];
      if(!((a0[0]===b0[0]&&b0[0]===c0[0])||(a0[1]===b0[1]&&b0[1]===c0[1])))coins.push(b0);
    }
    coins.push(p[p.length-1]);
    out.push({link:l,pts:coins});
  }
  return out;
}
let _synCle="", _synRoutes=[];
function sheetRoutes(){
  const blocks=sheetBlocks(), links=sheetLinks();
  if(S.drag&&S.drag.sheetBlock&&S.drag.moved){   // pendant le glisser, traits directs : on route au lâcher
    const c=new Map(blocks.map(b=>[b.sheetIndex,[b.x+b.w/2,b.y+b.h/2]]));
    return links.filter(l=>c.has(l.a)&&c.has(l.b)).map(l=>({link:l,pts:[c.get(l.a),c.get(l.b)],direct:true}));
  }
  const cle=JSON.stringify([blocks.map(b=>[b.sheetIndex,b.x,b.y,b.w,b.h]),links.map(l=>[l.a,l.b,l.kind,l.name,l.dir])]);
  if(cle!==_synCle){_synCle=cle;_synRoutes=blocks.length>1?synRouter(blocks,links):[];}
  return _synRoutes;
}
function hitSheetLink(wx,wy,tol){
  if(S.page!==0)return null;
  tol=tol||5/(S.scale||1);
  for(const r of sheetRoutes())
    for(let k=1;k<r.pts.length;k++){
      const [ax,ay]=r.pts[k-1],[bx,by]=r.pts[k];
      if(wx>=Math.min(ax,bx)-tol&&wx<=Math.max(ax,bx)+tol&&wy>=Math.min(ay,by)-tol&&wy<=Math.max(ay,by)+tol)return r.link;
    }
  return null;
}
/* Chiffres clés : composants (repères distincts), nets, sous-feuilles. */
function synStats(){
  const refs=new Set();
  S.pages.forEach((p,i)=>{
    if(!i)return;
    for(const el of (i===S.page?S.comps:(p.comps||[])))if(!defOf(el.type).noRef)refs.add(el.ref||el.id);
  });
  const nNets=typeof docNets==="function"?docNets().groups.filter(g=>g.pages.some(p=>p>0)).length:0;
  return {parts:refs.size,nets:nNets,blocs:Math.max(0,S.pages.length-1)};
}

/* Ranger : alimentations en haut dans l'ordre de la chaîne, bloc central au milieu, ses
   périphériques simples à gauche et à droite, les chaînes (caméra → OSD → VTX) en bas. */
function arrangeSheetBlocks(){
  if(S.page!==0)return;
  const blocks=sheetBlocks();
  if(!blocks.length)return;
  push();
  const links=sheetLinks(), par=new Map(blocks.map(b=>[b.sheetIndex,b]));
  const voisins=i=>links.filter(l=>l.a===i||l.b===i);
  const hub=blocks.find(b=>b.big)||null;
  const haut=[], gauche=[], droite=[], bas=[];
  // rang dans la chaîne d'alimentation : nombre d'étages en amont
  const rang=new Map(blocks.map(b=>[b.sheetIndex,0]));
  for(let n=0;n<blocks.length;n++)
    for(const l of links)if(l.isPower&&l.dir==="a")rang.set(l.b,Math.max(rang.get(l.b),rang.get(l.a)+1));
  for(const b of blocks){
    if(b===hub)continue;
    const v=voisins(b.sheetIndex);
    if(!v.some(l=>!l.isPower)&&v.length)haut.push(b);
    else if(!hub||!v.some(l=>!l.isPower&&(l.a===hub.sheetIndex||l.b===hub.sheetIndex))||
            v.some(l=>!l.isPower&&l.a!==hub.sheetIndex&&l.b!==hub.sheetIndex))bas.push(b);
    else (gauche.length<=droite.length?gauche:droite).push(b);
  }
  haut.sort((p,q)=>rang.get(p.sheetIndex)-rang.get(q.sheetIndex));
  // en bas, les blocs reliés entre eux restent côte à côte
  const ordre=[], vus=new Set();
  const suivre=b=>{if(vus.has(b))return;vus.add(b);ordre.push(b);
    for(const l of voisins(b.sheetIndex)){const o=par.get(l.a===b.sheetIndex?l.b:l.a);if(bas.includes(o))suivre(o);}};
  bas.forEach(suivre);
  const ligne=(liste,y,cx)=>{
    const W=liste.reduce((s,b)=>s+b.w,0)+120*Math.max(0,liste.length-1);
    let x=cx-W/2;
    for(const b of liste){b.page.blockPos={x:snap(x),y:snap(y)};x+=b.w+120;}
  };
  const pas=90, hMil=Math.max(hub?hub.h:0,gauche.length*pas-30,droite.length*pas-30);
  const yMil=60+(haut.length?160:0), cx=hub?hub.w/2+400:600;
  ligne(haut,60,cx);
  if(hub)hub.page.blockPos={x:snap(cx-hub.w/2),y:snap(yMil+(hMil-hub.h)/2)};
  const hw=hub?hub.w/2:0;
  gauche.forEach((b,k)=>{b.page.blockPos={x:snap(cx-hw-200-b.w),y:snap(yMil+(hMil-(gauche.length*pas-30))/2+k*pas)};});
  droite.forEach((b,k)=>{b.page.blockPos={x:snap(cx+hw+200),y:snap(yMil+(hMil-(droite.length*pas-30))/2+k*pas)};});
  ligne(ordre,yMil+hMil+120,cx);
  if(typeof fit==="function")fit();else draw();
}
/* ---------- historique (document entier) ---------- */
function serialize(){
  storeCurrent();
  return JSON.stringify({pages:S.pages,page:S.page,netClasses:S.netClasses,variantes:S.variantes,symboles:S.symboles,
                         cartouche:S.cartoucheInfo||{},
                         contraintes:S.contraintes});
}
/* Pile pleine, deux lots de Claude d'affilée (instantanés marqués d'une espace finale par
   ECRITURE_CAO.pousser, que JSON.parse ignore) se fondent en un avant qu'une étape plus
   ancienne ne parte : un flot de cartes appliquées directement ne chasse pas celles de
   l'utilisateur. */
function histBorner(pile){
  while(pile.length>HIST_MAX){
    const k=pile.findIndex((t,i)=>i>0&&t.endsWith(" ")&&pile[i-1].endsWith(" "));
    pile.splice(Math.max(k,0),1);
  }
}
/* L'élément dont le panneau Propriétés a déjà poussé son étape : une saisie de repère ou de
   valeur fait une étape, pas une par touche. Toute autre étape (ou Ctrl+Z) la referme. */
let PROP_FRAPPE=null;
function push(snapshot){
  PROP_FRAPPE=null;
  S.hist.push(snapshot===undefined?serialize():snapshot);
  histBorner(S.hist);
  S.redo.length=0;
  S.dirty=true;
}
function restore(js){
  PROP_FRAPPE=null;
  const o=JSON.parse(js);
  S.symboles=schSymbolesDuDocument(o);      // avant que les composants ne se dessinent
  S.pages=o.pages;loadPage(o.page||0);
  S.netClasses=o.netClasses||{};
  S.variantes=varNorm(o.variantes);
  S.cartoucheInfo=cartoucheInfoNorm(o.cartouche);
  S.contraintes={nets:cmNormNets(o.contraintes&&o.contraintes.nets),
                 groupes:cmNormGroupes(o.contraintes&&o.contraintes.groupes)};
  buildTabs();refreshPanels();draw();
  if(typeof SCHEMA_PATTERNS!=="undefined"&&SCHEMA_PATTERNS.analyser)SCHEMA_PATTERNS.analyser(150);
  S.dirty=true;
}
function undo(){
  if(!S.hist.length)return;
  S.redo.push(serialize());
  if(S.redo.length>HIST_MAX)S.redo.shift();
  restore(S.hist.pop());
}
function redo(){
  if(!S.redo.length)return;
  S.hist.push(serialize());
  histBorner(S.hist);
  restore(S.redo.pop());
}

/* ---------- création ---------- */
// les repères doivent être uniques sur l'ensemble du document, pas seulement
// sur la feuille active, sinon on obtient deux R1 dans la même nomenclature
function usedRefs(){
  const used=new Set();
  S.pages.forEach((p,i)=>{
    const list=(i===S.page)?S.comps:(p.comps||[]);
    for(const c of list) if(c.ref) used.add(c.ref);
  });
  for(const c of S.comps) if(c.ref) used.add(c.ref);
  return used;
}
// chaque feuille fait partir ses repères de son propre numéro (R100, C100…)
function nextRef(prefix){
  const used=usedRefs();
  let n=refStartDe(S.page);
  while(used.has(prefix+n))n++;
  return prefix+n;
}
function addComp(type,x,y){
  const def=defOf(type);
  const el={id:S.uid++,type,x:snap(x),y:snap(y),rot:0,mir:false,
            ref:def.noRef?"":nextRef(def.p),value:def.v};
  if(def.lib)schSymboleRetenir(type);
  if(def.init)def.init(el);
  if(!def.noRef&&def.pkg)el.pkg=(typeof def.pkg==="function")?def.pkg(el):def.pkg;
  S.comps.push(el);
  return el;
}
