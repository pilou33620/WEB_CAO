/* =============================================================================
   editeur-schematique — 19-broches.js
   Éditeur de brochage : le composant est représenté avec ses X broches, on les
   nomme et on les déplace sur la grille.

   Pourquoi une fenêtre plutôt que la liste qui tenait dans le panneau : une
   colonne de champs ne dit pas où sont les pattes. Ce qui rend un schéma
   lisible, c'est de grouper les alimentations en haut, les entrées à gauche et
   les sorties à droite — cela se décide en regardant le symbole, pas une liste.
   Le déplacement d'une broche emmène le fil qui y était accroché (reshapeComp),
   de sorte qu'on peut réorganiser un CI déjà câblé.
   ============================================================================= */
"use strict";
const PE={open:false,el:null,sel:-1,drag:null,pushed:false,z:1,cx:0,cy:0};
function peIsOpen(){return PE.open;}
function peEl(id){return document.getElementById(id);}
/* Un seul instantané pour toute la séance de brochage : on annule d'un coup,
   pas broche par broche. */
function pePush(){if(!PE.pushed){push();PE.pushed=true;}}

/* ---------- construction paresseuse de la fenêtre ----------
   Rien au chargement : le banc d'essai et les feuilles sans CI n'ont pas à
   porter ce balisage. */
function peBuild(){
  if(peEl("pinEd"))return;
  const d=document.createElement("div");
  d.id="pinEd";d.className="modal";d.hidden=true;
  d.innerHTML=
    '<div class="modal-box">'+
      '<header class="modal-head">'+
        '<span class="modal-title" id="peTitle">Brochage</span>'+
        '<button class="pnl-btn" id="peClose" title="Fermer">✕</button>'+
      '</header>'+
      '<div class="modal-body">'+
        '<div class="pe-view">'+
          '<canvas id="peCv"></canvas>'+
          '<div class="pinnote" id="peHint"></div>'+
        '</div>'+
        '<div class="pe-side">'+
          '<div class="prop">'+
            '<label>Nombre de broches</label>'+
            '<input id="peN" type="number" min="2" max="64" step="1">'+
            '<label style="margin-top:8px">Représentation</label>'+
            '<select id="peShape">'+
              '<option value="dip">Rectangulaire — 2 rangées (DIP, SOIC…)</option>'+
              '<option value="quad">Carrée — 4 côtés (QFP, QFN…)</option>'+
              '<option value="libre">Libre — broches placées à la main</option>'+
            '</select>'+
            '<div id="peBodyWrap">'+
              '<label style="margin-top:8px">Corps (cases de grille)</label>'+
              '<div class="row" style="margin-top:0">'+
                '<input id="peBw" type="number" min="2" max="40" step="1" title="Largeur">'+
                '<input id="peBh" type="number" min="2" max="60" step="1" title="Hauteur">'+
              '</div>'+
            '</div>'+
            '<div class="row">'+
              '<button class="tb" id="peAuto">Disposition automatique</button>'+
              '<button class="tb" id="peFit">Largeur automatique</button>'+
            '</div>'+
          '</div>'+
          '<div class="panel-head">Broches</div>'+
          '<div class="pins scroll" id="peList"></div>'+
        '</div>'+
      '</div>'+
    '</div>';
  document.body.appendChild(d);

  d.addEventListener("pointerdown",e=>{if(e.target===d)peClose();});
  peEl("peClose").onclick=peClose;
  peEl("peN").onchange=()=>{
    pePush();
    const min=(icShapeOf(PE.el)==="quad")?IC_QUAD_MIN:2;
    icSetCount(PE.el,Math.max(min,+peEl("peN").value||8));
    peSync();
  };
  peEl("peShape").onchange=()=>{pePush();icSetShape(PE.el,peEl("peShape").value);peSync();};
  peEl("peBw").onchange=()=>{pePush();icSetBody(PE.el,+peEl("peBw").value,null);peSync();};
  peEl("peBh").onchange=()=>{pePush();icSetBody(PE.el,null,+peEl("peBh").value);peSync();};
  peEl("peAuto").onclick=()=>{
    pePush();
    reshapeComp(PE.el,el=>{delete el.pinPos;delete el.icBody;
      if(el.icShape==="libre")el.icShape="dip";});
    peSync();
  };
  peEl("peFit").onclick=()=>{pePush();icFitNames(PE.el);peSync();};

  const cvs=peEl("peCv");
  cvs.addEventListener("pointerdown",peDown);
  cvs.addEventListener("pointermove",peMove);
  window.addEventListener("pointerup",peUp);
  window.addEventListener("resize",()=>{if(PE.open)peDraw();});
}

/* ---------- ouverture / fermeture ---------- */
function peOpen(el){
  if(!el)return;
  const def=defOf(el.type);
  if(Array.isArray(def.pins)&&def.pins.length===0&&typeof def.pins!=="function")return;
  peBuild();
  PE.open=true;PE.el=el;PE.sel=-1;PE.drag=null;PE.pushed=false;
  if(!Array.isArray(el.pinNames))el.pinNames=[];
  if(!Array.isArray(el.pinPos)){
    const ps=pinsOf(el);
    if(el.type!=="ic" && ps && ps.length){
      el.pinPos=ps.map(p=>[p[0],p[1]]);
      el.npins=ps.length;
      if(!el.icShape)el.icShape="libre";
    }
  }
  peEl("pinEd").hidden=false;
  peEl("peTitle").textContent="Brochage — "+(el.ref||def.n)+
    (el.value?" · "+el.value:"");
  peSync();
}
/* Reprise après un Ctrl+Z. Annuler recharge le document entier : la feuille,
   ses composants, et donc celui que la fenêtre est en train de brocher. On le
   retrouve par son identifiant ; s'il a disparu — annulation de son ajout, ou
   retour sur une autre feuille — la fenêtre se ferme plutôt que de continuer
   sur un objet qui n'appartient plus au document. */
function peReattach(){
  if(PE.open){
    const id=PE.el?PE.el.id:null;
    const el=(id==null)?null:S.comps.find(c=>c.id===id);
    if(!el){peClose();return;}
    PE.el=el;
    PE.pushed=false;            // la prochaine retouche reprendra un instantané
    peSync();
  }
  if(typeof CE!=="undefined"&&CE.open){
    const id=CE.el?CE.el.id:null;
    const el=(id==null)?null:S.comps.find(c=>c.id===id);
    if(!el){ceClose();return;}
    CE.el=el;
    CE.pushed=false;
    ceSync();
  }
}
function peClose(){
  if(!PE.open)return;
  PE.open=false;PE.drag=null;
  const d=peEl("pinEd");
  if(d)d.hidden=true;
  refreshPanels();draw();
}
/* Toute modification passe par ici : le symbole, la liste, la feuille et les
   panneaux restent d'accord, et le câblage suit les broches déplacées. */
function peSync(){
  const el=PE.el;
  if(!el)return;
  const g=icGeom(el);
  peEl("peN").value=g.n;
  peEl("peN").min=(g.shape==="quad")?IC_QUAD_MIN:1;
  peEl("peShape").value=g.shape;
  const bw=Math.round((g.body.x2-g.body.x1)/IC_STEP),
        bh=Math.round((g.body.y2-g.body.y1)/IC_STEP);
  peEl("peBw").value=bw;peEl("peBh").value=bh;
  /* Seule la disposition libre a deux dimensions réglables. Le rectangle tire
     sa hauteur du nombre de broches d'une rangée, et le carré est un carré :
     dans les deux cas la hauteur se déduit, elle ne se saisit pas. */
  peEl("peBh").disabled=(g.shape!=="libre");
  peEl("peHint").innerHTML=
    (g.shape==="libre"
      ? "Glissez une broche pour la poser ailleurs · clic sur une ligne de la "+
        "liste puis clic sur la grille pour la placer."
      : "Glissez une broche : la représentation passe en <b>libre</b> et vous "+
        "gardez la main sur chaque patte.")+
    "<br>Les noms s'écrivent dans le symbole, côtés gauche et droit.";
  peList();
  peDraw();
  touchWires();buildList();draw();
}

/* ---------- modifications du symbole ----------
   Ces quatre fonctions sont le seul endroit qui touche au brochage : le
   panneau Propriétés et la fenêtre d'édition passent par elles, et le câblage
   suit les broches déplacées dans les deux cas. L'historique reste à
   l'appelant. */
function icSetNames(el,n){
  if(!Array.isArray(el.pinNames))el.pinNames=[];
  el.pinNames=el.pinNames.slice(0,n);
  while(el.pinNames.length<n)el.pinNames.push("");
}
/* Changement du nombre de broches. En disposition libre, les pattes déjà
   placées ne bougent pas : les nouvelles s'alignent à droite du nuage, hors de
   toute position occupée, prêtes à être posées. */
function icSetCount(el,n){
  n=Math.max(icShapeOf(el)==="quad"?IC_QUAD_MIN:1,Math.min(64,Math.round(n)||1));
  reshapeComp(el,()=>{
    const free=icFree(el);
    if(free){
      const old=free.map(p=>[p[0],p[1]]);
      const pos=old.slice(0,n);
      if(n>old.length){
        let mx=-1e9,my=1e9;
        for(const p of old){mx=Math.max(mx,p[0]);my=Math.min(my,p[1]);}
        if(!old.length){mx=0;my=0;}
        for(let i=old.length;i<n;i++)
          pos.push([icStep(mx)+2*IC_STEP,icStep(my)+(i-old.length)*IC_STEP]);
      }
      el.pinPos=pos;
    }else{
      const old=pinsOf(el);
      const pos=old.slice(0,n);
      while(pos.length<n)pos.push([40,(pos.length)*20]);
      el.pinPos=pos;
    }
    el.npins=n;
    icSetNames(el,n);
  });
}
function icSetShape(el,shape){
  reshapeComp(el,()=>{
    const before=icAutoPkg(el);
    if(shape==="libre"){
      el.pinPos=icPins(el).map(p=>[p[0],p[1]]);
      const b=icBodyOf(el);
      el.icBody={x1:b.x1,y1:b.y1,x2:b.x2,y2:b.y2};
      el.icShape="libre";
      return;
    }
    delete el.pinPos;delete el.icBody;
    el.icShape=(shape==="quad")?"quad":"dip";
    if(el.icShape==="quad"&&icCount(el)<IC_QUAD_MIN){
      el.npins=IC_QUAD_MIN;icSetNames(el,IC_QUAD_MIN);
    }
    if(el.pkg===before)el.pkg=icAutoPkg(el);
  });
}
/* Taille du corps, en cases de grille. Rectangle : seule la largeur compte, et
   elle écarte les deux rangées de broches. Carré : le côté. Libre : le
   rectangle grandit autour de son centre. */
function icSetBody(el,w,h){
  const g=icGeom(el);
  const cw=Math.max(2,Math.min(40,Math.round(w||((g.body.x2-g.body.x1)/IC_STEP))));
  const ch=Math.max(2,Math.min(60,Math.round(h||((g.body.y2-g.body.y1)/IC_STEP))));
  reshapeComp(el,()=>{
    if(g.shape==="dip"){el.icW=cw*IC_STEP/2;return;}
    if(g.shape==="quad"){el.icHs=Math.max(g.hsMin,cw*IC_STEP/2);return;}
    const cx=(g.body.x1+g.body.x2)/2, cy=(g.body.y1+g.body.y2)/2;
    el.icBody={x1:icStep(cx-cw*IC_STEP/2),y1:icStep(cy-ch*IC_STEP/2),
               x2:icStep(cx+cw*IC_STEP/2),y2:icStep(cy+ch*IC_STEP/2)};
  });
}
/* Le corps s'ajuste tout seul à ce qu'il contient (icTextHalf) ; une largeur
   saisie à la main ne fait que l'agrandir davantage. Ce bouton rend donc la
   main au calcul automatique, au lieu d'imposer une largeur figée qu'un
   renommage rendrait fausse. */
function icFitNames(el){
  reshapeComp(el,()=>{
    delete el.icW;delete el.icHs;
    if(icShapeOf(el)==="libre"){
      const b=icAutoBody(icPins(el));
      el.icBody={x1:b.x1,y1:b.y1,x2:b.x2,y2:b.y2};
    }
  });
}
/* Pose d'une broche. Deux pattes au même point se souderaient l'une à l'autre
   sans qu'aucun fil ne le montre : le déplacement est alors refusé. */
function icMovePin(el,i,x,y){
  const pins=icPins(el);
  if(i<0||i>=pins.length)return 0;                 // 0 = rien fait
  const nx=icStep(x), ny=icStep(y);
  if(pins[i][0]===nx&&pins[i][1]===ny)return 0;
  for(let k=0;k<pins.length;k++)
    if(k!==i&&pins[k][0]===nx&&pins[k][1]===ny)return -1;   // -1 = case occupée
  reshapeComp(el,()=>{
    if(icShapeOf(el)!=="libre"){
      el.pinPos=pins.map(p=>[p[0],p[1]]);
      const b=icBodyOf(el);
      el.icBody={x1:b.x1,y1:b.y1,x2:b.x2,y2:b.y2};
      el.icShape="libre";
    }
    el.pinPos[i]=[nx,ny];
  });
  return 1;
}
function peMovePin(i,x,y){
  pePush();                       // instantané pris avant la mutation
  const r=icMovePin(PE.el,i,x,y);
  if(r<0){
    peEl("peHint").innerHTML='<span class="warn">Une autre broche occupe déjà '+
      'cette case : deux pattes au même point seraient reliées entre elles.</span>';
    return false;
  }
  return r>0;
}

/* ---------- liste des broches ---------- */
function peList(){
  const el=PE.el, box=peEl("peList");
  const ps=icPins(el);
  icSetNames(el,ps.length);
  let h="";
  ps.forEach((p,i)=>{
    h+='<div class="pinrow'+(i===PE.sel?" on":"")+'" data-i="'+i+'">'+
       '<span class="pn">'+(i+1)+'</span>'+
       '<input data-p="'+i+'" value="'+esc(el.pinNames[i]||"")+'" placeholder="nom de la broche">'+
       '<span class="pxy">'+(p[0]/IC_STEP)+" , "+(p[1]/IC_STEP)+'</span></div>';
  });
  box.innerHTML=h;
  box.querySelectorAll(".pinrow").forEach(row=>{
    row.onpointerdown=e=>{
      if(e.target.tagName==="INPUT")return;
      PE.sel=+row.dataset.i;peList();peDraw();
    };
  });
  box.querySelectorAll("input[data-p]").forEach(inp=>{
    inp.onfocus=()=>{PE.sel=+inp.dataset.p;peDraw();};
    inp.oninput=()=>{
      pePush();
      // le nom compte dans la largeur du corps : les broches peuvent s'écarter,
      // reshapeComp emmène alors les fils qui y sont accrochés
      reshapeComp(el,()=>{el.pinNames[+inp.dataset.p]=inp.value.slice(0,32);});
      peDraw();draw();
    };
  });
}

/* ---------- rendu de la fenêtre ---------- */
function peGrid(c,W,H,z){
  const step=IC_STEP*z;
  if(step<5)return;
  const x0=((PE.cx%step)+step)%step, y0=((PE.cy%step)+step)%step;
  c.strokeStyle=C_GRID;c.lineWidth=1;c.beginPath();
  for(let x=x0;x<W;x+=step){c.moveTo(Math.round(x)+.5,0);c.lineTo(Math.round(x)+.5,H);}
  for(let y=y0;y<H;y+=step){c.moveTo(0,Math.round(y)+.5);c.lineTo(W,Math.round(y)+.5);}
  c.stroke();
  // axes du repère du symbole : l'origine est le point d'accrochage sur la feuille
  c.strokeStyle=C_GRIDMAJ;c.beginPath();
  c.moveTo(Math.round(PE.cx)+.5,0);c.lineTo(Math.round(PE.cx)+.5,H);
  c.moveTo(0,Math.round(PE.cy)+.5);c.lineTo(W,Math.round(PE.cy)+.5);
  c.stroke();
}
function peDraw(){
  const el=PE.el, cvs=peEl("peCv");
  if(!el||!cvs)return;
  const dpr=window.devicePixelRatio||1;
  const W=cvs.clientWidth||460, H=cvs.clientHeight||420;
  cvs.width=Math.round(W*dpr);cvs.height=Math.round(H*dpr);
  const c=cvs.getContext("2d");
  if(!c)return;
  const g=icGeom(el), ps=icPins(el);
  let x1=g.body.x1,y1=g.body.y1,x2=g.body.x2,y2=g.body.y2;
  for(const p of ps){
    x1=Math.min(x1,p[0]);x2=Math.max(x2,p[0]);
    y1=Math.min(y1,p[1]);y2=Math.max(y2,p[1]);
  }
  const m=50;
  const z=Math.max(.15,Math.min(1.5,Math.min(W/(x2-x1+2*m),H/(y2-y1+2*m))));
  PE.z=z;PE.cx=W/2-(x1+x2)/2*z;PE.cy=H/2-(y1+y2)/2*z;

  c.setTransform(dpr,0,0,dpr,0,0);
  c.fillStyle=C_BG;c.fillRect(0,0,W,H);
  peGrid(c,W,H,z);
  c.setTransform(dpr*z,0,0,dpr*z,dpr*PE.cx,dpr*PE.cy);
  drawComp(c,{id:-2,type:el.type,x:0,y:0,rot:0,mir:false,ref:el.ref,value:el.value,
              npins:el.npins,icShape:el.icShape,pinPos:el.pinPos,icBody:el.icBody,
              icW:el.icW,icHs:el.icHs,pinNames:el.pinNames},false);
  // poignées, en pixels écran : leur taille ne doit pas dépendre du cadrage
  c.setTransform(dpr,0,0,dpr,0,0);
  const dup=new Set(), seen=new Map();
  ps.forEach((p,i)=>{
    const k=p[0]+","+p[1];
    if(seen.has(k)){dup.add(i);dup.add(seen.get(k));}else seen.set(k,i);
  });
  ps.forEach((p,i)=>{
    const sx=PE.cx+p[0]*z, sy=PE.cy+p[1]*z;
    c.beginPath();c.arc(sx,sy,7,0,Math.PI*2);
    c.fillStyle=dup.has(i)?"rgba(232,68,58,.35)"
              :(i===PE.sel)?"rgba(138,240,255,.35)":"rgba(143,208,255,.16)";
    c.fill();
    c.strokeStyle=dup.has(i)?C_RED:(i===PE.sel)?C_SEL:"#8fd0ff";
    c.lineWidth=(i===PE.sel||dup.has(i))?2:1;
    c.stroke();
    const nm = (el.pinNames && el.pinNames[i]) || "";
    const label = String(i+1) + (nm ? " · " + nm : "");
    c.fillStyle = (i===PE.sel) ? C_SEL : "#93c5fd";
    c.font = (i===PE.sel ? "bold " : "") + '9.5px "Segoe UI",system-ui,sans-serif';
    c.textAlign = "center"; c.textBaseline = "middle";
    c.fillText(label, sx, sy - 14);
  });
  c.setTransform(1,0,0,1,0,0);
}

/* ---------- souris ---------- */
function peAt(e){
  const cvs=peEl("peCv"), r=cvs.getBoundingClientRect();
  return {x:(e.clientX-r.left-PE.cx)/PE.z, y:(e.clientY-r.top-PE.cy)/PE.z};
}
function peHit(p){
  const ps=icPins(PE.el), tol=12/PE.z;
  let best=-1,bd=tol*tol;
  ps.forEach((q,i)=>{
    const d=(q[0]-p.x)**2+(q[1]-p.y)**2;
    if(d<bd){bd=d;best=i;}
  });
  return best;
}
function peDown(e){
  if(!PE.open)return;
  const p=peAt(e), i=peHit(p);
  if(i>=0){
    PE.sel=i;PE.drag={i};
    try{peEl("peCv").setPointerCapture(e.pointerId);}catch(_){}
    peList();peDraw();
    return;
  }
  // case vide : la broche choisie dans la liste vient s'y poser
  if(PE.sel>=0&&peMovePin(PE.sel,p.x,p.y))peSync();
}
function peMove(e){
  if(!PE.open||!PE.drag)return;
  const p=peAt(e);
  if(peMovePin(PE.drag.i,p.x,p.y))peSync();
}
function peUp(){if(PE.drag){PE.drag=null;}}

/* =============================================================================
   Éditeur de composant (ceOpen, ceBuild, ceSync, ceClose)
   Permet d'éditer Référence, Valeur, Boîtier, Type/Symbole, Métadonnées et tableau
   complet des broches avec noms, positions et nets connectés pour tout composant.
   ============================================================================= */
const CE = {open: false, el: null, pushed: false};
function ceIsOpen(){ return CE.open; }
function ceEl(id){ return document.getElementById(id); }
function cePush(){ if(!CE.pushed){ push(); CE.pushed = true; } }

function ceBuild(){
  if(ceEl("compEd")) return;
  const d = document.createElement("div");
  d.id = "compEd"; d.className = "modal"; d.hidden = true;
  d.innerHTML =
    '<div class="modal-box ce-box">' +
      '<header class="modal-head">' +
        '<span class="modal-title" id="ceTitle">Édition du composant</span>' +
        '<button class="pnl-btn" id="ceClose" title="Fermer">✕</button>' +
      '</header>' +
      '<div class="modal-body ce-body">' +
        '<div class="ce-props-col">' +
          '<div class="ce-section-title">Général</div>' +
          '<div class="prop">' +
            '<label>Référence</label>' +
            '<input id="ceRef" placeholder="ex: R1, U1, C2...">' +
          '</div>' +
          '<div class="prop">' +
            '<label>Valeur / Modèle</label>' +
            '<input id="ceVal" placeholder="ex: 10k, NE555, LM358...">' +
          '</div>' +
          '<div class="prop">' +
            '<label>Symbole / Type</label>' +
            '<select id="ceType"></select>' +
          '</div>' +
          '<div class="prop">' +
            '<label>Boîtier / Empreinte</label>' +
            '<select id="cePkgSel" style="margin-bottom:4px; width:100%;"></select>' +
            '<input id="cePkgTxt" placeholder="ex: 0603, SOIC-8, DIP-8...">' +
          '</div>' +
          '<div class="ce-section-title" style="margin-top:14px;">Fabricant &amp; MPN</div>' +
          '<div class="prop">' +
            '<label>Référence fabricant (MPN)</label>' +
            '<input id="ceMpn" placeholder="ex: NE555P, RC0603FR-0710KL...">' +
          '</div>' +
          '<div class="prop">' +
            '<label>Fabricant</label>' +
            '<input id="ceMfr" placeholder="ex: Texas Instruments, Yageo...">' +
          '</div>' +
          '<div class="row" style="margin-top:16px;">' +
            '<button class="tb" id="ceBtnPinEd" style="width:100%; border-color:var(--blue); color:var(--blue); font-weight:600;">' +
              '⤢ Placement graphique des broches…' +
            '</button>' +
          '</div>' +
        '</div>' +
        '<div class="ce-pins-col">' +
          '<div class="ce-pins-head">' +
            '<span class="ce-section-title" style="margin:0">Broches (<span id="cePinCount">0</span>)</span>' +
            '<button class="tb mini" id="cePinAdd" title="Ajouter une broche">+ Ajouter broche</button>' +
          '</div>' +
          '<div class="ce-pins-table-wrap scroll">' +
            '<table class="ce-pins-table">' +
              '<thead>' +
                '<tr>' +
                  '<th style="width:34px; text-align:center;">N°</th>' +
                  '<th>Nom de la broche</th>' +
                  '<th style="width:75px; text-align:center;">Pos (X,Y)</th>' +
                  '<th>Net connecté</th>' +
                  '<th style="width:30px;"></th>' +
                '</tr>' +
              '</thead>' +
              '<tbody id="cePinTbody"></tbody>' +
            '</table>' +
          '</div>' +
        '</div>' +
      '</div>' +
      '<footer class="modal-foot" style="padding:8px 14px; background:var(--panel2); border-top:1px solid var(--border); display:flex; justify-content:flex-end; gap:8px;">' +
        '<button class="tb" id="ceApply" style="border-color:var(--blue); color:var(--blue); font-weight:600;">Enregistrer &amp; Fermer</button>' +
      '</footer>' +
    '</div>';

  document.body.appendChild(d);
  d.addEventListener("pointerdown", e => { if(e.target === d) ceClose(); });
  ceEl("ceClose").onclick = ceClose;
  ceEl("ceApply").onclick = ceClose;

  // Remplissage du select des types (groupés par catégorie)
  const selType = ceEl("ceType");
  selType.innerHTML = "";
  if(typeof CATS !== "undefined" && typeof LIB !== "undefined"){
    CATS.forEach(cat => {
      const og = document.createElement("optgroup");
      og.label = cat;
      for(const k in LIB){
        if(LIB[k].cat === cat){
          const opt = document.createElement("option");
          opt.value = k;
          opt.textContent = LIB[k].n + " (" + k + ")";
          og.appendChild(opt);
        }
      }
      selType.appendChild(og);
    });
  }

  selType.onchange = () => {
    if(!CE.el) return;
    cePush();
    const newType = selType.value;
    const oldDef = defOf(CE.el.type), newDef = defOf(newType);
    CE.el.type = newType;
    if(newDef.p && (!CE.el.ref || (oldDef.p && CE.el.ref.startsWith(oldDef.p)))){
      CE.el.ref = nextRef(newDef.p);
    }
    if(!CE.el.value || (oldDef.v && CE.el.value === oldDef.v)){
      CE.el.value = newDef.v || "";
    }
    // Mise à jour des broches si nécessaire
    if(!Array.isArray(CE.el.pinPos)){
      const ps = pinsOf(CE.el);
      CE.el.pinPos = ps.map(p => [p[0], p[1]]);
      CE.el.npins = ps.length;
    }
    ceSync();
    draw();
  };

  ceEl("ceRef").oninput = () => {
    if(!CE.el) return;
    cePush();
    CE.el.ref = ceEl("ceRef").value.trim().slice(0, 32);
    ceEl("ceTitle").textContent = "Édition du composant — " + (CE.el.ref || defOf(CE.el.type).n);
    draw(); buildList();
  };

  ceEl("ceVal").oninput = () => {
    if(!CE.el) return;
    cePush();
    CE.el.value = ceEl("ceVal").value.slice(0, 240);
    draw(); buildList();
  };

  ceEl("ceMpn").oninput = () => {
    if(!CE.el) return;
    cePush();
    CE.el.mpn = ceEl("ceMpn").value.trim().slice(0, 100);
  };

  ceEl("ceMfr").oninput = () => {
    if(!CE.el) return;
    cePush();
    CE.el.manufacturer = ceEl("ceMfr").value.trim().slice(0, 100);
  };

  ceEl("cePkgTxt").oninput = () => {
    if(!CE.el) return;
    cePush();
    CE.el.pkg = ceEl("cePkgTxt").value.trim().slice(0, 40);
  };

  ceEl("cePkgSel").onchange = () => {
    if(!CE.el) return;
    const v = ceEl("cePkgSel").value;
    if(v === "__custom"){
      ceEl("cePkgTxt").focus();
    } else {
      cePush();
      CE.el.pkg = v;
      ceEl("cePkgTxt").value = v;
    }
  };

  ceEl("ceBtnPinEd").onclick = () => {
    const el = CE.el;
    ceClose();
    peOpen(el);
  };

  ceEl("cePinAdd").onclick = () => {
    if(!CE.el) return;
    cePush();
    const cur = pinsOf(CE.el);
    const newPos = cur.map(p => [p[0], p[1]]);
    let mx = -1e9, my = 1e9;
    for(const p of newPos){ mx = Math.max(mx, p[0]); my = Math.min(my, p[1]); }
    if(!newPos.length){ mx = 0; my = 0; }
    newPos.push([icStep(mx) + 2*IC_STEP, icStep(my)]);
    CE.el.pinPos = newPos;
    CE.el.npins = newPos.length;
    if(!Array.isArray(CE.el.pinNames)) CE.el.pinNames = [];
    while(CE.el.pinNames.length < newPos.length) CE.el.pinNames.push("");
    ceSync();
    draw();
  };
}

function ceOpen(el){
  if(!el) return;
  ceBuild();
  CE.open = true; CE.el = el; CE.pushed = false;
  if(!Array.isArray(el.pinNames)) el.pinNames = [];
  if(!Array.isArray(el.pinPos)){
    const ps = pinsOf(el);
    if(ps && ps.length){
      el.pinPos = ps.map(p => [p[0], p[1]]);
      el.npins = ps.length;
    }
  }
  ceEl("compEd").hidden = false;
  ceSync();
}

function ceClose(){
  if(!CE.open) return;
  CE.open = false;
  const d = ceEl("compEd");
  if(d) d.hidden = true;
  refreshPanels(); draw();
}

function ceSync(){
  const el = CE.el;
  if(!el) return;
  const def = defOf(el.type);
  ceEl("ceTitle").textContent = "Édition du composant — " + (el.ref || def.n) + (el.value ? " · " + el.value : "");
  ceEl("ceRef").value = el.ref || "";
  ceEl("ceVal").value = el.value || "";
  ceEl("ceType").value = el.type;
  ceEl("ceMpn").value = el.mpn || "";
  ceEl("ceMfr").value = el.manufacturer || "";
  ceEl("cePkgTxt").value = el.pkg || "";

  // Remplissage du select de boîtiers
  const selPkg = ceEl("cePkgSel");
  selPkg.innerHTML = '<option value="">— aucun —</option>';
  if(typeof pkgBaseList === "function"){
    const groups = pkgBaseList(el);
    for(const g of groups){
      const og = document.createElement("optgroup");
      og.label = g.fam;
      for(const x of g.bases){
        const b = x.base;
        if(b.flat){
          const opt = document.createElement("option");
          opt.value = b.b; opt.textContent = b.b + (x.fit ? " ✓" : "");
          if(b.b === el.pkg) opt.selected = true;
          og.appendChild(opt);
        } else if(Array.isArray(b.pins)){
          for(const p of b.pins){
            const nm = b.b + "-" + p;
            const opt = document.createElement("option");
            opt.value = nm; opt.textContent = nm + (p === pinCount(el) ? " ✓" : "");
            if(nm === el.pkg) opt.selected = true;
            og.appendChild(opt);
          }
        }
      }
      selPkg.appendChild(og);
    }
  }
  const optCust = document.createElement("option");
  optCust.value = "__custom"; optCust.textContent = "Personnalisé…";
  if(el.pkg && typeof pkgKnown === "function" && !pkgKnown(el.pkg)) optCust.selected = true;
  selPkg.appendChild(optCust);

  // Rendu de la table des broches
  const ps = pinsOf(el);
  ceEl("cePinCount").textContent = ps.length;
  const tbody = ceEl("cePinTbody");
  tbody.innerHTML = "";

  ps.forEach((p, i) => {
    const tr = document.createElement("tr");
    const pName = (el.pinNames && el.pinNames[i]) || "";
    const worldP = pinPos(el, i);
    const n = netAt(worldP.x, worldP.y);
    const live = isRealNet(n);

    tr.innerHTML =
      '<td style="text-align:center; font-family:var(--mono); color:var(--txt-dim); font-size:11px;">' + (i + 1) + '</td>' +
      '<td><input class="ce-pin-name" data-idx="' + i + '" value="' + esc(pName) + '" placeholder="Nom (ex: VCC, GND, IN...)" style="width:100%; padding:3px 6px; font-size:11.5px; background:var(--bg); border:1px solid var(--border); border-radius:4px; color:var(--txt);"></td>' +
      '<td style="text-align:center; font-family:var(--mono); font-size:10px; color:var(--txt-dim);">' + Math.round(p[0]/IC_STEP) + ' , ' + Math.round(p[1]/IC_STEP) + '</td>' +
      '<td style="font-size:11px;">' +
        (live ? '<span style="color:' + netColor(n) + '; font-weight:600;">' + esc(n.name) + '</span>' : '<span style="color:var(--txt-dim); font-style:italic;">non connecté</span>') +
      '</td>' +
      '<td style="text-align:center;">' +
        '<button class="pnl-btn ce-pin-del" data-idx="' + i + '" title="Supprimer la broche" style="font-size:11px; color:#ff7875;">✕</button>' +
      '</td>';
    tbody.appendChild(tr);
  });

  tbody.querySelectorAll(".ce-pin-name").forEach(inp => {
    inp.oninput = () => {
      cePush();
      const idx = +inp.dataset.idx;
      while(el.pinNames.length <= idx) el.pinNames.push("");
      el.pinNames[idx] = inp.value.trim().slice(0, 32);
      draw();
    };
  });

  tbody.querySelectorAll(".ce-pin-del").forEach(btn => {
    btn.onclick = () => {
      const idx = +btn.dataset.idx;
      cePush();
      reshapeComp(el, () => {
        const curPins = pinsOf(el);
        const newPins = curPins.filter((_, k) => k !== idx);
        el.pinPos = newPins;
        el.npins = newPins.length;
        if(Array.isArray(el.pinNames)) el.pinNames.splice(idx, 1);
      });
      ceSync();
      draw();
    };
  });
}
