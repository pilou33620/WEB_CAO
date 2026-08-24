/* =============================================================================
   editeur-schematique — 12-panneaux.js
   Panneau Propriétés, nomenclature et liste des nets
   ============================================================================= */
"use strict";
/* ==========================================================================
   Propriétés + nomenclature
   ========================================================================== */
/* Bloc « net » du panneau : nom modifiable, liste des nœuds, sélection du net.
   Le nom est stocké comme label sur un segment (w.net) — comme une étiquette
   posée sur le fil dans un outil du métier. Un symbole d'alimentation ou une
   étiquette de net l'emporte : le champ est alors en lecture seule. */
function netBlock(net){
  if(!net)return "";
  const imposed = net.src>=2;
  const srcTxt = net.global?"symbole global (alimentation ou étiquette globale)"
                          :"étiquette de net";
  const nodes = net.nodes.slice()
    .sort((a,b)=>String(a.ref).localeCompare(String(b.ref),"fr",{numeric:true}))
    .map(n=>n.ref+"."+n.pin+(n.label?" ("+n.label+")":""));
  const aw=net.anchorWire||null;
  const hidden=!!(aw&&aw.lblHide), moved=!!(aw&&aw.lblOff);
  let h='<div class="prop"><label>Net</label>'+
    '<input id="pNet" value="'+esc(net.named?net.name:"")+'" '+
    'placeholder="'+esc(net.name)+(net.named?"":" (auto)")+'" '+
    (imposed?'disabled ':'')+'>'+
    '<div class="row"><button class="tb" id="pNetSel">Sélectionner le net</button></div>'+
    '<div class="row"><button class="tb'+(hidden?" on":"")+'" id="pNetHide">'+
      (hidden?"Étiquette masquée":"Masquer l'étiquette")+'</button>'+
      (moved?'<button class="tb" id="pNetHome">Replacer l\'étiquette</button>':"")+
    '</div></div>';
  const g=docGroupOf(net);
  h+='<div class="pinnote">'+
     (net.global
       ? "<b>Net global</b> : présent sur "+(g?sheetList(g.pages):"cette feuille")+
         " — le même nom relie les feuilles.<br>"
       : "Net local à cette feuille. Pour le faire communiquer avec une autre "+
         "feuille, posez une <b>étiquette globale</b>.<br>")+
     (imposed?"Nom fourni par le "+srcTxt+" : modifiez la valeur du symbole pour le renommer.<br>"
             :"Saisir un nom pose une étiquette sur le fil ; vider le champ rend le net anonyme.<br>")+
     (net.conflict?'<span class="warn">Conflit de noms : '+esc(net.names.join(" / "))+'</span><br>':"")+
     '<b>'+nodes.length+(nodes.length>1?" nœuds":" nœud")+'</b>'+
     (nodes.length?" : "+esc(nodes.join(" · ")):"")+
     (net.powers.length?"<br>"+net.powers.length+" symbole(s) d'alimentation / étiquette(s).":"")+
     '</div>';
  return h;
}
function wireInfo(wires){
  const total=wires.reduce((s,w)=>s+Math.abs(w.x2-w.x1)+Math.abs(w.y2-w.y1),0)/G;
  const len=(Math.round(total*10)/10)+" pas";
  const N=nets(), own=new Set();
  for(const w of wires){const n=N.byWire.get(w);if(n)own.add(n);}
  const netHtml = own.size===1 ? netBlock([...own][0])
    : own.size>1 ? '<div class="prop"><label>Nets</label><input value="'+own.size+' nets" disabled></div>'
    : "";
  if(wires.length>1){
    return '<div class="prop"><label>Sélection</label>'+
      '<input value="'+wires.length+' fils" disabled></div>'+
      netHtml+
      '<div class="prop"><label>Longueur cumulée</label><input value="'+len+'" disabled>'+
      '<div class="row"><button class="tb" id="pDel">Supprimer</button></div></div>'+
      '<div class="pinnote">Glisser un fil le déplace ; les segments raccordés à ses '+
      'extrémités s\'étirent pour rester connectés. Ctrl+clic ajoute ou retire un '+
      'élément de la sélection.</div>';
  }
  const w=wires[0];
  const dir=(w.x1===w.x2)?"Fil vertical":(w.y1===w.y2)?"Fil horizontal":"Fil oblique";
  const pt=(x,y)=>Math.round(x/G)+" , "+Math.round(y/G);
  return '<div class="prop"><label>Sélection</label><input value="'+dir+'" disabled></div>'+
    netHtml+
    '<div class="prop"><label>Départ (pas de grille)</label><input value="'+esc(pt(w.x1,w.y1))+'" disabled></div>'+
    '<div class="prop"><label>Arrivée</label><input value="'+esc(pt(w.x2,w.y2))+'" disabled></div>'+
    '<div class="prop"><label>Longueur</label><input value="'+len+'" disabled>'+
    '<div class="row"><button class="tb" id="pDel">Supprimer</button></div></div>'+
    '<div class="pinnote">Étiquette de net : la glisser la déplace, un double-clic '+
    'la remet en place.<br>Saisir une poignée d\'extrémité étire le segment ; '+
    'saisir le milieu déplace le fil entier. Alt+glisser détache le fil de ses voisins.</div>';
}
/* Sélecteur de boîtier en deux temps : la base (SOIC, SOT-23, 0603…) puis le
   brochage. Bases conseillées pour le type de symbole en tête de liste, et ✓
   sur celles qui existent dans le brochage du symbole. */
function pkgField(el){
  const cur=el.pkg||"";
  const known=pkgKnown(cur);
  const custom=!!cur&&!known;
  const parsed=known?pkgBaseOf(cur):null;
  const base=parsed?parsed.base:null;
  const n=pinCount(el);

  let h='<div class="prop"><label>Boîtier</label><select id="pPkgB">'+
    '<option value=""'+(cur?"":" selected")+'>— aucun —</option>';
  for(const g of pkgBaseList(el)){
    h+='<optgroup label="'+esc(g.fam)+'">';
    for(const x of g.bases)
      h+='<option value="'+esc(x.base.b)+'"'+(base===x.base?" selected":"")+'>'+
         esc(x.base.b)+(x.fit?" ✓":"")+
         (x.base.note?" — "+esc(x.base.note):"")+'</option>';
    h+='</optgroup>';
  }
  h+='<option value="__custom"'+(custom?" selected":"")+'>Personnalisé…</option></select>';

  // deuxième menu : brochage de la base retenue
  const pins=pkgPinsFor(base,el);
  const show=pins.length>0;
  h+='<select id="pPkgN" style="margin-top:6px'+(show?"":";display:none")+'">';
  if(show){
    if(base.free&&parsed&&parsed.pins&&!pins.includes(parsed.pins))
      h+='<option value="'+parsed.pins+'" selected>'+parsed.pins+' broches</option>';
    for(const v of pins)
      h+='<option value="'+v+'"'+((parsed&&parsed.pins===v)?" selected":"")+'>'+
         v+' broches'+(v===n?" ✓":"")+'</option>';
    if(base.free)h+='<option value="__free">autre nombre…</option>';
  }
  h+='</select>';
  h+='<input id="pPkgFree" type="number" min="1" max="4000" placeholder="nombre de billes"'+
     ' style="margin-top:6px;display:none">';
  h+='<input id="pPkgTxt" placeholder="ex. SOD-123, TO-3" value="'+esc(custom?cur:"")+'"'+
     ' style="margin-top:6px'+(custom?"":";display:none")+'">';
  h+='</div>';

  if(base&&base.flat&&n!==2)
    h+='<div class="pinnote"><span class="warn">'+esc(base.b)+' est un boîtier à '+
       '2 bornes, le symbole en a '+n+'.</span></div>';
  else if(parsed&&parsed.pins&&n&&parsed.pins!==n)
    h+='<div class="pinnote"><span class="warn">'+esc(cur)+' a '+parsed.pins+
       ' broches, le symbole en a '+n+'.</span> Volontaire ? sinon prenez un '+
       'brochage marqué ✓.</div>';
  else if(cur&&!known)
    h+='<div class="pinnote">Boîtier hors bibliothèque : conservé tel quel dans la '+
       'nomenclature et la netlist.</div>';
  return h;
}
function bindPkgField(el){
  const bs=document.getElementById("pPkgB");
  if(!bs)return;
  const ns=document.getElementById("pPkgN"),
        fr=document.getElementById("pPkgFree"),
        tx=document.getElementById("pPkgTxt");
  const set=v=>{
    if(v)el.pkg=String(v).slice(0,40);else delete el.pkg;
    buildList();
  };
  const baseOf=()=>PKG_BASES.find(b=>b.b===bs.value)||null;
  bs.onchange=()=>{
    tx.style.display="none";fr.style.display="none";
    if(bs.value==="__custom"){
      ns.style.display="none";
      tx.style.display="";tx.focus();
      set(tx.value);
      return;
    }
    const b=baseOf();
    if(!b){ns.style.display="none";set("");refreshPanels();return;}
    // brochage retenu : celui du symbole s'il existe, sinon le premier proposé
    const pins=pkgPinsFor(b,el);
    const n=pinCount(el);
    const pick=pins.includes(n)?n:pins[0];
    set(pkgName(b,pick));
    refreshPanels();          // le second menu se reconstruit pour la nouvelle base
  };
  if(ns)ns.onchange=()=>{
    const b=baseOf();
    if(!b)return;
    if(ns.value==="__free"){
      fr.style.display="";fr.value=pinCount(el)||"";fr.focus();
      if(fr.value)set(pkgName(b,+fr.value));
      return;
    }
    fr.style.display="none";
    set(pkgName(b,+ns.value));
    refreshPanels();
  };
  if(fr)fr.oninput=()=>{
    const b=baseOf();
    const v=Math.max(1,Math.min(4000,Math.round(+fr.value||0)));
    if(b&&v)set(pkgName(b,v));
  };
  if(tx)tx.oninput=()=>set(tx.value);
}
/* Le panneau se reconstruit entièrement à chaque rafraîchissement. Sans
   précaution, saisir le nom d'une étiquette de net revenait à taper une lettre,
   perdre le champ — donc le focus — et voir les lettres suivantes prises pour
   des raccourcis : « V » repassait en sélection, « W » en tracé de fil. On note
   donc le champ actif et la position du curseur avant, on les rend après. */
function propsFocus(){
  const box=document.getElementById("props"), a=document.activeElement;
  if(!box||!a||!a.id||!box.contains(a))return null;
  const f={id:a.id};
  try{f.s=a.selectionStart;f.e=a.selectionEnd;}catch(_){}
  return f;
}
function propsRefocus(f){
  if(!f)return;
  const el=document.getElementById(f.id);
  if(!el||typeof el.focus!=="function")return;
  el.focus();
  if(f.s!=null&&typeof el.setSelectionRange==="function")
    try{el.setSelectionRange(f.s,f.e);}catch(_){}
}
function refreshPanels(){
  const _focus=propsFocus();
  pruneSel();
  const box=document.getElementById("props");
  const els=selEls(), wires=selWires();
  if(wires.length&&!els.length){
    box.innerHTML=wireInfo(wires);
    document.getElementById("pDel").onclick=delSel;
    bindNetBlock(wires);
  }else if(els.length!==1||wires.length){
    const parts=[];
    if(els.length)parts.push(els.length+(els.length>1?" composants":" composant"));
    if(wires.length)parts.push(wires.length+(wires.length>1?" fils":" fil"));
    box.innerHTML='<div class="empty">'+(parts.length?parts.join(" et ")+" sélectionnés.":"Aucune sélection.")+
      '<br><br>Raccourcis : <b>R</b> pivoter · <b>M</b> miroir · <b>D</b> dupliquer · '+
      '<b>Ctrl+C</b>/<b>Ctrl+V</b> copier-coller · <b>Suppr</b> supprimer · '+
      '<b>U</b> n\'effacer que les fils.</div>'+
      (wires.length
        ? '<div class="prop"><div class="row"><button class="tb" id="pDelW">'+
          'Supprimer les '+wires.length+' fil'+(wires.length>1?'s':'')+' <kbd>U</kbd>'+
          '</button></div>'+
          '<div class="pinnote" style="padding:8px 0 0">Les composants restent en '+
          'place et sélectionnés : de quoi recâbler autrement sans les redésigner.'+
          '</div></div>'
        : "");
    const pdw=document.getElementById("pDelW");
    if(pdw)pdw.onclick=delWiresSel;
  }else{
    const el=els[0], def=defOf(el.type);
    let html=
      '<div class="prop"><label>Type</label><input value="'+esc(def.n)+'" disabled></div>'+
      (def.noRef?"":'<div class="prop"><label>Référence</label><input id="pRef" value="'+esc(el.ref||"")+'"></div>')+
      '<div class="prop"><label>'+esc(def.propLabel||(el.type==="port"?"Nom du net":el.type==="vcc"?"Tension du rail":"Valeur"))+'</label>'+
      '<input id="pVal" value="'+esc(el.value||"")+'">';
      
    let csvHtml = "";
    if (!def.noRef) {
      const isLoaded = window.CSV_LIB && window.CSV_LIB.length > 0;
      csvHtml = '<div style="margin-top:10px; border-top:1px solid var(--border); padding-top:10px;">' +
                '<label style="color:var(--blue)">Bibliothèque CSV ' + (isLoaded ? "("+window.CSV_LIB.length+" réf)" : "(Non chargée)") + '</label>' +
                (!isLoaded ? '<button class="tb" style="margin-top:5px; margin-bottom:10px; width:100%; border-color:var(--blue); color:var(--blue);" onclick="document.getElementById(\'csvIn\').click()">Charger le CSV manuellement</button>' : '') +
                '<input id="pCsvSearch" placeholder="Rechercher (ex: 10k, A4984...)" value="'+esc(el.csvPartName||"")+'" ' + (isLoaded?"":"disabled") + ' style="margin-bottom:5px;">' +
                '<select id="pCsvList" size="5" style="width:100%; font-size:11px; background:var(--bg); color:var(--txt); border:1px solid var(--border);" ' + (isLoaded?"":"disabled") + '></select>' +
                '</div>';
    }
    
    html += csvHtml +
      (def.noRef?"":pkgField(el))+
      '<div class="row"><button class="tb" id="pRot">Pivoter</button><button class="tb" id="pMir">Miroir</button></div>'+
      ((el.refOff||el.valOff)
        ? '<div class="row"><button class="tb" id="pTxt">Replacer les textes</button></div>'
        : "")+
      (el.type==="port"||el.type==="gport"
        ? '<div class="row"><button class="tb" id="pGlob">'+
          (el.type==="port"?"Étendre à tout le document":"Restreindre à cette feuille")+
          '</button></div>'
        : "")+
      '<div class="row"><button class="tb" id="pDel">Supprimer</button></div></div>'+
      (el.type==="port"
        ? '<div class="pinnote">Étiquette locale : elle ne relie que cette feuille.</div>'
        : el.type==="gport"
        ? '<div class="pinnote">Étiquette globale : toutes les étiquettes de même nom, '+
          'sur n\'importe quelle feuille, forment un seul net.</div>'
        : "");
    if(typeof def.pins==="function"){
      const g=icGeom(el);
      if(!el.pinNames)el.pinNames=[];
      const named=el.pinNames.filter(x=>x&&String(x).trim()).length;
      html+='<div class="prop"><label>Nombre de broches</label>'+
            '<input id="pN" type="number" min="'+(g.quad?IC_QUAD_MIN:2)+'" max="64" step="1" value="'+g.n+'">'+
            '<label style="margin-top:8px">Représentation</label>'+
            '<select id="pShape">'+
            '<option value="dip"'+(g.shape==="dip"?" selected":"")+'>Rectangulaire — 2 rangées (DIP, SOIC…)</option>'+
            '<option value="quad"'+(g.shape==="quad"?" selected":"")+'>Carrée — 4 côtés (QFP, QFN…)</option>'+
            '<option value="libre"'+(g.shape==="libre"?" selected":"")+'>Libre — broches placées à la main</option>'+
            '</select></div>'+
            (g.shape==="libre"
              ? '<div class="pinnote">Disposition libre : chaque broche est posée où vous '+
                'l\'avez mise. Revenir à une forme rectangulaire ou carrée efface ce placement.</div>'
              : g.quad
              ? '<div class="pinnote">Numérotation antihoraire depuis le repère : '+
                'côté gauche de haut en bas, puis bas, droite, haut. Les broches se '+
                'répartissent au mieux sur les quatre côtés ('+g.cnt.join(" + ")+').</div>'
              : g.n>=24
              ? '<div class="pinnote">'+g.n+' broches sur deux rangées font un symbole très haut : '+
                'la représentation carrée sera sans doute plus lisible.</div>'
              : "")+
            '<div class="prop"><label>Brochage</label>'+
            '<div class="row" style="margin-top:0">'+
            '<button class="tb" id="pPins">Éditer les broches…</button></div></div>'+
            '<div class="pinnote">'+g.n+' broche(s)'+
            (named?' · '+named+' nommée(s)':'')+
            '. L\'éditeur montre le composant avec ses pattes : on les nomme et '+
            'on les déplace sur la grille, le câblage suit.</div>';
    }
    html+=connList(el);
    box.innerHTML=html;
    bindNetCells(box);
    const r=document.getElementById("pRef"), v=document.getElementById("pVal");
    if(r)r.oninput=()=>{el.ref=r.value;draw();buildList();};
    // la valeur d'un symbole d'alimentation ou d'une étiquette renomme le net :
    // le panneau des connexions doit suivre la frappe
    /* La valeur d'un symbole d'alimentation ou d'une étiquette renomme le net :
       le panneau des connexions doit suivre la frappe. Sur un CI, elle décide
       aussi de la largeur du corps : les broches s'écartent, et reshapeComp
       emmène les fils qui y sont accrochés plutôt que de les décrocher. */
    v.oninput=()=>{
      if(typeof def.pins==="function")reshapeComp(el,()=>{el.value=v.value;});
      else el.value=v.value;
      draw();
      if(NAME_SRC[el.type])refreshPanels();else buildList();
    };
    bindPkgField(el);
    const pg2=document.getElementById("pGlob");
    if(pg2)pg2.onclick=()=>{
      push();
      el.type=(el.type==="port")?"gport":"port";
      touchWires();refreshPanels();draw();
    };
    const ptx=document.getElementById("pTxt");
    if(ptx)ptx.onclick=()=>{push();resetTexts([el]);refreshPanels();draw();};
    document.getElementById("pRot").onclick=rotateSel;
    document.getElementById("pMir").onclick=mirrorSel;
    document.getElementById("pDel").onclick=delSel;
    const pn=document.getElementById("pN");
    if(pn)pn.onchange=()=>{
      push();
      icSetCount(el,+pn.value||8);
      refreshPanels();draw();
    };
    const psh=document.getElementById("pShape");
    if(psh)psh.onchange=()=>{
      push();
      icSetShape(el,psh.value);
      refreshPanels();draw();
    };
    const pp=document.getElementById("pPins");
    if(pp)pp.onclick=()=>peOpen(el);
    
    // -- Logique de recherche CSV --
    const searchInp = document.getElementById("pCsvSearch");
    const listSel = document.getElementById("pCsvList");
    if (searchInp && listSel) {
        const updateList = () => {
            const q = searchInp.value.toLowerCase();
            let matches = [];
            for(const item of window.CSV_LIB) {
                if (matches.length > 100) break; // limite d'affichage
                
                // Filtre strict sur le type de composant avec mapping étendu
                if (def.p) {
                    const refPrefix = (item["Reference designator Prefix"] || "").trim().toUpperCase();
                    
                    // Table de correspondance (schéma -> CSV)
                    const prefixMap = {
                        "R": ["R"],
                        "RV": ["R", "RV"],
                        "C": ["C"],
                        "L": ["L"],
                        "T": ["T", "L"],
                        "Y": ["Y"],
                        "F": ["F"],
                        "D": ["D", "LED", "ESD"],
                        "V": ["V"], // Varistance
                        "Q": ["Q"],
                        "U": ["U", "IC"],
                        "BT": ["BATT", "HLC", "BT"],
                        "SW": ["SW"],
                        "K": ["K"],
                        "M": ["M"], // Mire / Moteur
                        "MECA": ["MECA", "LOC"], // Trous / Mécanique
                        "ST": ["ST"], // Strap
                        "FLT": ["FLT"], // Filtre
                        "BZ": ["BZ"],
                        "LA": ["LA"],
                        "E": ["A", "E", "ANT"],
                        "J": ["J", "JP", "HRS"],
                        "TP": ["PTST", "TP"]
                    };
                    
                    const allowed = prefixMap[def.p.toUpperCase()] || [def.p.toUpperCase()];
                    if (!allowed.includes(refPrefix)) {
                        continue;
                    }
                }
                
                const txt = (item["Part Name"] + " " + item["Description"] + " " + item["Value"] + " " + item["Part Number"]).toLowerCase();
                if (txt.includes(q)) matches.push(item);
            }
            listSel.innerHTML = "";
            for(const m of matches) {
                const opt = document.createElement("option");
                opt.value = m["Part Name"];
                opt.textContent = m["Part Name"] + " | " + m["Value"] + " | " + m["Part Number"];
                opt.dataset.val = m["Value"];
                opt.dataset.pkg = m["Package type"];
                opt.dataset.mpn = m["Part Number"];
                listSel.appendChild(opt);
            }
        };
        updateList();
        searchInp.oninput = updateList;
        listSel.onchange = () => {
            const opt = listSel.options[listSel.selectedIndex];
            if (!opt) return;
            push();
            el.csvPartName = opt.value;
            el.csvMpn = opt.dataset.mpn;
            if (opt.dataset.val) el.value = opt.dataset.val;
            if (opt.dataset.pkg && opt.dataset.pkg !== "xx") {
                el.pkg = opt.dataset.pkg;
            }
            refreshPanels(); 
            draw();
        };
    }
    // ---------------------------------
  }
  propsRefocus(_focus);
  buildList();
}
/* Broche par broche : à quel net chaque patte du composant est raccordée. */
function connList(el){
  const ps=allPins(el);
  if(!ps.length)return "";
  let h='<div class="panel-head">Connexions</div><div class="pins">';
  ps.forEach((p,i)=>{
    const n=netAt(p.x,p.y);
    const live=isRealNet(n);
    h+='<div class="pinrow"><span class="pn">'+(i+1)+'</span>'+
       (live
         ? '<span class="netcell" data-net="'+esc(n.id)+'" style="color:'+netColor(n)+'"'+
           ' title="Cliquer pour sélectionner le net">'+esc(n.name)+'</span>'
         : '<span class="netcell none">non connecté</span>')+
       '</div>';
  });
  return h+'</div>';
}
function netById(id){return nets().list.find(n=>n.id===id)||null;}
function bindNetCells(box){
  box.querySelectorAll(".netcell[data-net]").forEach(cell=>{
    cell.onclick=()=>selectNet(netById(cell.dataset.net));
  });
}
function bindNetBlock(wires){
  const inp=document.getElementById("pNet");
  const btn=document.getElementById("pNetSel");
  const hide=document.getElementById("pNetHide");
  const home=document.getElementById("pNetHome");
  if(!inp&&!btn&&!hide)return;
  const N=nets(), own=new Set();
  for(const w of wires){const n=N.byWire.get(w);if(n)own.add(n);}
  if(own.size!==1)return;
  const net=[...own][0];
  if(btn)btn.onclick=()=>selectNet(net);
  /* Masquage et déplacement de l'étiquette sont rangés sur tous les fils du
     net : le fil qui la porte — le plus long — peut changer à la prochaine
     scission, le réglage ne doit pas disparaître avec lui. */
  if(hide)hide.onclick=()=>{
    push();
    const off=!(net.anchorWire&&net.anchorWire.lblHide);
    for(const w of net.wires){if(off)w.lblHide=1;else delete w.lblHide;}
    refreshPanels();draw();
  };
  if(home)home.onclick=()=>{
    push();
    for(const w of net.wires)delete w.lblOff;
    refreshPanels();draw();
  };
  // onchange (et non oninput) : une frappe ne doit pas remplir l'historique
  if(inp&&!inp.disabled)inp.onchange=()=>{
    setNetName(net,inp.value);
    refreshPanels();draw();
  };
}
/* ---------- panneau : nomenclature ou liste des nets ---------- */
function setListTab(t){
  S.listTab=t;
  document.getElementById("tabBom").classList.toggle("on",t==="bom");
  document.getElementById("tabNets").classList.toggle("on",t==="nets");
  document.getElementById("bomAllWrap").style.display=(t==="bom")?"":"none";
  document.getElementById("netAllWrap").style.display=(t==="nets")?"":"none";
  if(typeof profilNoter==="function")profilNoter();
  buildList();
}
function buildList(){
  if(S.listTab==="nets")buildNets();else buildBom();
}
/* Vue document : une ligne par net, les nets globaux fusionnés entre feuilles. */
function buildNetsDoc(box){
  const D=docNets();
  if(!D.groups.length){
    box.innerHTML='<div class="empty">Aucun net dans le document.</div>';
    return;
  }
  let html='<table class="bom"><thead><tr><th>Net</th><th>Feuilles</th>'+
           '<th style="text-align:right">Nœuds</th></tr></thead><tbody>';
  for(const g of D.groups){
    const col=netColor({named:true,name:g.name});
    html+='<tr data-g="'+esc(g.name)+'" data-page="'+g.pages[0]+'" '+
      'title="'+esc(g.global?("Net global — "+sheetList(g.pages)):"Net local à la feuille "+(g.pages[0]+1))+'">'+
      '<td class="net'+(g.conflict?" warn":"")+'">'+
        '<span class="dot" style="background:'+(g.global?col:"#8b919c")+'"></span>'+
        (g.global?"⇄ ":"")+esc(g.name)+(g.conflict?" ⚠":"")+'</td>'+
      '<td style="color:var(--txt-dim);font-family:var(--mono);font-size:10px">'+
        esc(sheetList(g.pages))+'</td>'+
      '<td class="n">'+g.nodes.length+'</td></tr>';
  }
  html+='</tbody></table>';
  const multi=D.groups.filter(g=>g.pages.length>1);
  html+='<div class="pinnote" style="padding-top:10px">'+
    D.groups.length+' net(s) dans le document, '+multi.length+' à cheval sur plusieurs feuilles.'+
    '<br>⇄ = net global (masse, alimentation, étiquette globale) : le nom suffit à relier les feuilles.'+
    '<br>Clic sur une ligne : ouvre la feuille et sélectionne le net.'+
    '</div>';
  box.innerHTML=html;
  box.querySelectorAll("tr[data-g]").forEach(tr=>{
    tr.onclick=()=>{
      const pg=+tr.dataset.page;
      if(pg!==S.page)gotoPage(pg);
      const n=nets().list.find(x=>x.name===tr.dataset.g);
      if(n)selectNet(n);else draw();
    };
  });
}
function buildNets(){
  const box=document.getElementById("bom");
  if(S.netAll)return buildNetsDoc(box);
  const N=nets();
  if(!N.list.length){
    box.innerHTML='<div class="empty">Aucun net sur cette feuille. Reliez des '+
      'composants avec l\'outil Fil (<b>W</b>) : les nets se construisent tout seuls.</div>';
    return;
  }
  // nets nommés d'abord, puis les anonymes dans l'ordre de numérotation
  const list=N.list.slice().sort((a,b)=>
    (a.named!==b.named) ? (a.named?-1:1)
    : String(a.name).localeCompare(String(b.name),"fr",{numeric:true}));
  let html='<table class="bom"><thead><tr><th>Net</th><th>Source</th>'+
           '<th style="text-align:right">Nœuds</th></tr></thead><tbody>';
  for(const n of list){
    const src=n.global?"globale":n.src===2?"étiq.":n.src===1?"label":"auto";
    const g=docGroupOf(n);
    const tip=n.conflict?("Conflit : "+n.names.join(" / "))
      :g?("Net global — "+sheetList(g.pages)):n.name;
    html+='<tr data-net="'+esc(n.id)+'" title="'+esc(tip)+'">'+
      '<td class="net'+(n.conflict?" warn":"")+'">'+
        '<span class="dot" style="background:'+netColor(n)+'"></span>'+
        (n.global?"⇄ ":"")+esc(n.name)+(n.conflict?" ⚠":"")+'</td>'+
      '<td style="color:var(--txt-dim)">'+src+
        (g&&g.pages.length>1?' <span style="font-family:var(--mono);font-size:9px;opacity:.6">'+
          esc(sheetList(g.pages))+'</span>':"")+'</td>'+
      '<td class="n">'+n.nodes.length+'</td></tr>';
  }
  html+='</tbody></table>';
  const dangling=N.loose.reduce((a,n)=>a+n.nodes.length,0);
  const conflicts=N.list.filter(n=>n.conflict).length;
  html+='<div class="pinnote" style="padding-top:10px">'+
    N.list.length+' net(s) sur la feuille.'+
    (dangling?'<br><span class="warn">'+dangling+' broche(s) en l\'air.</span>':"")+
    (conflicts?'<br><span class="warn">'+conflicts+' net(s) à noms multiples.</span>':"")+
    '<br>Clic sur une ligne : sélectionne les fils du net. Survol : halo sur la feuille.'+
    '</div>';
  box.innerHTML=html;
  box.querySelectorAll("tr[data-net]").forEach(tr=>{
    const n=netById(tr.dataset.net);
    tr.onclick=()=>selectNet(n);
    tr.onmouseenter=()=>{S.hoverNet=n;draw();};
    tr.onmouseleave=()=>{if(S.hoverNet===n){S.hoverNet=null;draw();}};
  });
}
function buildBom(){
  const box=document.getElementById("bom");
  const list=[];
  if(S.bomAll){
    S.pages.forEach((p,i)=>{
      const src=(i===S.page)?S.comps:(p.comps||[]);
      for(const c of src) if(!defOf(c.type).noRef) list.push({c,page:i});
    });
  }else{
    for(const c of S.comps) if(!defOf(c.type).noRef) list.push({c,page:S.page});
  }
  if(!list.length){
    box.innerHTML='<div class="empty">La nomenclature se remplit à mesure que vous posez des composants.</div>';
    return;
  }
  // String() : un fichier importé peut porter un repère absent, localeCompare planterait
  list.sort((a,b)=>String(a.c.ref||"").localeCompare(String(b.c.ref||""),"fr",{numeric:true}));
  let html='<table class="bom"><thead><tr><th>Rep.</th><th>Composant</th>'+
           '<th style="text-align:right">Valeur</th></tr></thead><tbody>';
  for(const {c,page} of list){
    const sheet=S.bomAll?' <span style="font-family:var(--mono);font-size:9px;opacity:.55">f'+(page+1)+'</span>':"";
    html+='<tr data-id="'+esc(c.id)+'" data-page="'+page+'"><td class="r">'+esc(c.ref||"—")+sheet+'</td>'+
          '<td>'+esc(defOf(c.type).n)+
            (c.pkg?'<span class="pkgcell">'+esc(c.pkg)+'</span>':"")+
          '</td><td class="v">'+esc(c.value||"")+'</td></tr>';
  }
  box.innerHTML=html+"</tbody></table>";
  box.querySelectorAll("tr[data-id]").forEach(tr=>{
    tr.onclick=()=>{
      const pg=+tr.dataset.page;
      if(pg!==S.page)gotoPage(pg);
      clearSel();S.sel.add(+tr.dataset.id);
      refreshPanels();draw();
    };
  });
}
function esc(s){
  return String(s).replace(/[&<>"'`]/g,ch=>
    ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;","`":"&#96;"}[ch]));
}
