/* =============================================================================
   editeur-schematique — 19-broches.js
   Retouches du brochage (nombre, forme, corps, position des broches) et
   éditeur de composant. Le tracé des broches se gère dans Gestion LIB.
   ============================================================================= */
"use strict";
/* ---------- modifications du symbole ----------
   Ces fonctions sont le seul endroit qui touche au brochage, et le câblage
   suit les broches déplacées. L'historique reste à l'appelant. */
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
/* =============================================================================
   Éditeur de composant (ceOpen, ceBuild, ceSync, ceClose)
   Permet d'éditer Référence, Valeur, Boîtier, Type/Symbole, Métadonnées et tableau
   complet des broches avec noms, positions et nets connectés pour tout composant.
   ============================================================================= */
const CE = {open: false, el: null, pushed: false};
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
            '<button class="tb" id="ceBtnOpenLib" style="width:100%; border-color:var(--yellow); color:var(--yellow); font-weight:600;">' +
              '📚 Ouvrir dans Gestion LIB ↗' +
            '</button>' +
          '</div>' +
        '</div>' +
        '<div class="ce-pins-col">' +
          '<div class="ce-pins-head">' +
            '<span class="ce-section-title" style="margin:0">Broches connectées (<span id="cePinCount">0</span>)</span>' +
            '<span style="font-size:10.5px; color:var(--txt-dim);">(Tracé géré dans Gestion LIB)</span>' +
          '</div>' +
          '<div class="ce-pins-table-wrap scroll">' +
            '<table class="ce-pins-table">' +
              '<thead>' +
                '<tr>' +
                  '<th style="width:34px; text-align:center;">N°</th>' +
                  '<th>Nom de la broche</th>' +
                  '<th style="width:58px; text-align:center;" title="Patte de l\'empreinte où va la broche (datasheet). Vide : la patte de même numéro.">Patte</th>' +
                  '<th style="width:75px; text-align:center;">Pos (X,Y)</th>' +
                  '<th>Net connecté</th>' +
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
    CE.el.pkg = ceEl("cePkgTxt").value.trim().slice(0, PKG_MAX);
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

  const bOpenLib = ceEl("ceBtnOpenLib");
  if(bOpenLib){
    bOpenLib.onclick = () => {
      const nom = (CE.el && (CE.el.csvPartName || CE.el.value)) || "";
      window.open("../gestion-lib/gestion-lib.html?comp=" + encodeURIComponent(nom), "_blank");
    };
  }
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
    /* nom proposé par le symbole (IN-, V+, B, C, E…) : c'est lui que la
       colonne Brochage de la LIB désigne */
    const pDefaut = (typeof brNomBroche === "function") ? brNomBroche({type: el.type}, i) : "";
    const pPatte = (Array.isArray(el.pinMap) && el.pinMap[i]) || "";
    const worldP = pinPos(el, i);
    const n = netAt(worldP.x, worldP.y);
    const live = isRealNet(n);

    tr.innerHTML =
      '<td style="text-align:center; font-family:var(--mono); color:var(--txt-dim); font-size:11px;">' + (i + 1) + '</td>' +
      '<td><input class="ce-pin-name" data-idx="' + i + '" value="' + esc(pName) + '" placeholder="' + esc(pDefaut || "Nom (ex: VCC, GND, IN...)") + '" style="width:100%; padding:3px 6px; font-size:11.5px; background:var(--bg); border:1px solid var(--border); border-radius:4px; color:var(--txt);"></td>' +
      '<td><input class="ce-pin-pad" data-idx="' + i + '" value="' + esc(pPatte) + '" placeholder="' + (i + 1) + '" maxlength="71" title="Patte de l\'empreinte ; plusieurs : 2/4" style="width:100%; padding:3px 6px; font-size:11.5px; font-family:var(--mono); text-align:center; background:var(--bg); border:1px solid var(--border); border-radius:4px; color:var(--txt);"></td>' +
      '<td style="text-align:center; font-family:var(--mono); font-size:10px; color:var(--txt-dim);">' + Math.round(p[0]/IC_STEP) + ' , ' + Math.round(p[1]/IC_STEP) + '</td>' +
      '<td style="font-size:11px;">' +
        (live ? '<span style="color:' + netColor(n) + '; font-weight:600;">' + esc(n.name) + '</span>' : '<span style="color:var(--txt-dim); font-style:italic;">non connecté</span>') +
      '</td>';
    tbody.appendChild(tr);
  });

  /* la patte saisie part dans la netlist au lieu du numéro de broche :
     c'est la renumérotation « datasheet » d'un symbole générique */
  tbody.querySelectorAll(".ce-pin-pad").forEach(inp => {
    inp.oninput = () => {
      if (typeof brSaisirPatte !== "function") return;
      cePush();
      if (!brSaisirPatte(el, +inp.dataset.idx, inp.value)) inp.style.borderColor = "#ef4444";
      else inp.style.borderColor = "";
      draw();
    };
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
}
