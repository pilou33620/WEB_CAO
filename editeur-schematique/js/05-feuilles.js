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
  clearSel();S.wireStart=null;S.drawStart=null;S.place=null;S.drag=null;S.marquee=null;setPalette(null);
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
  const p=S.pages[i];
  if((p.comps.length||p.wires.length)&&!confirm("Supprimer « "+p.name+" » et tout son contenu ?"))return;
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
function buildTabs(){
  const box=document.getElementById("tabs");
  box.innerHTML="";
  S.pages.forEach((p,i)=>{
    const t=document.createElement("div");
    const isHier=(i===0 || !!p.isHierarchy);
    t.className="tab"+(isHier?" hier":"")+(i===S.page?" on":"");
    t.title=isHier?"Feuille hiérarchique racine · Double-clic pour renommer":"Double-clic pour renommer";
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

/* ---------- Blocs hiérarchiques (représentation des sous-feuilles sur la feuille 1) ---------- */
function isPortBusName(nm){
  if(!nm) return false;
  return /(\[|\{|\.\.|BUS|^SPI|^I2C|^UART|^CAN|^USB|^DATA|^ADDR|^GPIO|^PWM)/i.test(nm);
}
function isPortPowerName(nm){
  if(!nm) return false;
  return /^(VCC|GND|VDD|VSS|VBAT|VBUS|\+?\d+(\.\d+)?V|\-?\d+(\.\d+)?V|VIN|VOUT)$/i.test(nm) ||
         nm.toUpperCase().includes("GND") || nm.startsWith("+");
}

function sheetBlocks(){
  if(!S.pages||S.pages.length<=1)return [];
  const blocks=[];
  for(let i=1;i<S.pages.length;i++){
    const p=S.pages[i];
    const comps=(i===S.page)?S.comps:(p.comps||[]);
    const wires=(i===S.page)?S.wires:(p.wires||[]);
    const col=(i-1)%2, row=Math.floor((i-1)/2);
    const defX=60+col*300, defY=60+row*220;
    const x=(p.blockPos&&Number.isFinite(p.blockPos.x))?p.blockPos.x:defX;
    const y=(p.blockPos&&Number.isFinite(p.blockPos.y))?p.blockPos.y:defY;

    // Détection des ports et de leur type
    const portMap=new Map();
    for(const c of comps){
      if(c.type==="gport"||c.type==="port"){
        const nm=(c.value||(c.type==="gport"?"GPORT":"PORT")).trim();
        if(!portMap.has(nm)){
          // Vérifier si connecté à un bus dans la feuille
          let connectedToBus = false;
          if(wires && wires.length){
            for(const w of wires){
              if(w.bus && ((Math.hypot(w.x1 - c.x, w.y1 - c.y) < 15) || (Math.hypot(w.x2 - c.x, w.y2 - c.y) < 15))){
                connectedToBus = true;
                break;
              }
            }
          }
          const isBus = connectedToBus || isPortBusName(nm);
          const isPower = !isBus && isPortPowerName(nm);
          const type = isBus ? "bus" : (isPower ? "power" : "signal");
          portMap.set(nm, { name: nm, type, isBus, isPower });
        }
      }
    }

    const uniquePorts = Array.from(portMap.values());
    const leftPorts = [];
    const rightPorts = [];

    // Répartition logique : Alim et entrées à gauche, Bus et sorties à droite
    for(const port of uniquePorts){
      if(port.type === "bus"){
        rightPorts.push(port);
      } else if(port.type === "power"){
        leftPorts.push(port);
      } else {
        if(leftPorts.length <= rightPorts.length) leftPorts.push(port);
        else rightPorts.push(port);
      }
    }

    const maxPins = Math.max(leftPorts.length, rightPorts.length);
    const pinPitch = 22;
    const w = 240;
    const h = Math.max(130, 48 + maxPins * pinPitch + 22);

    const b = {
      sheetIndex: i,
      page: p,
      name: p.name,
      x, y, w, h,
      nComps: comps.length,
      nWires: wires.length,
      ports: uniquePorts.map(pt => pt.name),
      pins: [],
      leftPins: [],
      rightPins: []
    };

    // Calcul des coordonnées géométriques précises des sheet pins
    leftPorts.forEach((pt, idx) => {
      const pinObj = {
        name: pt.name,
        type: pt.type,
        isBus: pt.isBus,
        isPower: pt.isPower,
        side: "left",
        x: x,
        y: y + 44 + idx * pinPitch,
        block: b,
        sheetIndex: i
      };
      b.leftPins.push(pinObj);
      b.pins.push(pinObj);
    });

    rightPorts.forEach((pt, idx) => {
      const pinObj = {
        name: pt.name,
        type: pt.type,
        isBus: pt.isBus,
        isPower: pt.isPower,
        side: "right",
        x: x + w,
        y: y + 44 + idx * pinPitch,
        block: b,
        sheetIndex: i
      };
      b.rightPins.push(pinObj);
      b.pins.push(pinObj);
    });

    blocks.push(b);
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

function hitSheetPin(wx,wy,tolerance=9){
  if(S.page!==0)return null;
  const blocks=sheetBlocks();
  for(const b of blocks){
    for(const pin of (b.pins||[])){
      if(Math.hypot(wx - pin.x, wy - pin.y) <= tolerance) return pin;
    }
  }
  return null;
}

/* Extraction de l'ensemble des interconnexions entre blocs de feuilles */
function sheetInterconnections(){
  const blocks = sheetBlocks();
  if(!blocks || blocks.length < 2) return [];
  const mapByName = new Map();
  for(const b of blocks){
    for(const pin of (b.pins || [])){
      if(!mapByName.has(pin.name)){
        mapByName.set(pin.name, []);
      }
      mapByName.get(pin.name).push(pin);
    }
  }
  const inters = [];
  for(const [name, pins] of mapByName.entries()){
    if(pins.length >= 2){
      const isBus = pins.some(p => p.type === "bus");
      const isPower = pins.some(p => p.type === "power");
      const type = isBus ? "bus" : (isPower ? "power" : "signal");
      inters.push({
        name,
        type,
        isBus,
        isPower,
        pins,
        blocks: [...new Set(pins.map(p => p.block))]
      });
    }
  }
  return inters;
}

/* ---------- historique (document entier) ---------- */
function serialize(){
  storeCurrent();
  return JSON.stringify({pages:S.pages,page:S.page});
}
function push(snapshot){
  S.hist.push(snapshot===undefined?serialize():snapshot);
  if(S.hist.length>HIST_MAX)S.hist.shift();
  S.redo.length=0;
  S.dirty=true;
}
function restore(js){
  const o=JSON.parse(js);
  S.pages=o.pages;loadPage(o.page||0);
  buildTabs();refreshPanels();draw();
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
  if(S.hist.length>HIST_MAX)S.hist.shift();
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
function nextRef(prefix){
  const used=usedRefs();
  let n=1;
  while(used.has(prefix+n))n++;
  return prefix+n;
}
function addComp(type,x,y){
  const def=defOf(type);
  const el={id:S.uid++,type,x:snap(x),y:snap(y),rot:0,mir:false,
            ref:def.noRef?"":nextRef(def.p),value:def.v};
  if(def.init)def.init(el);
  if(!def.noRef&&def.pkg)el.pkg=(typeof def.pkg==="function")?def.pkg(el):def.pkg;
  S.comps.push(el);
  return el;
}
