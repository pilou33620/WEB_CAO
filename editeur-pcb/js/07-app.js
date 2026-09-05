"use strict";
/* ==========================================================================
   Éditeur PCB — fichiers et démarrage
   Enregistrement, import, exports, câblage de l'interface, initialisation.
   ========================================================================== */
/* ==========================================================================
   Fichiers
   ========================================================================== */
function dl(blob,name){
  const a=document.createElement("a");
  a.href=URL.createObjectURL(blob);a.download=name;a.click();
  setTimeout(()=>URL.revokeObjectURL(a.href),2000);
}
/* Les noms de fichiers viennent de pcbFile() (04-fabrication.js) : une seule
   source pour l'archive de fabrication comme pour les exports d'ici.
   Avec un dossier de projet rattaché, enregistrer écrit dans ce dossier ; sans
   dossier, on télécharge comme avant. Le repli n'est pas un luxe : en
   double-clic sur le monofichier, aucun accès disque n'est possible. */
function saveJson(){
  const doc=docObj();
  if(typeof projdLie==="function" && projdLie()){
    projdDocEcrire("pcb",doc).then(function(nom){
      S.dirty=false;
      if(typeof profNoterDocument==="function")profNoterDocument("pcb",nom);
      hint("Carte enregistrée dans le dossier du projet ("+nom+").");
    }).catch(function(e){
      /* On ne fait pas semblant : si l'écriture échoue, le travail n'est pas
         sauvé, et on le dit avant de proposer le téléchargement. */
      hint("Écriture refusée : "+e.message+" — enregistrement en téléchargement.");
      saveJsonTelecharger(doc);
    });
    return;
  }
  saveJsonTelecharger(doc);
}
function saveJsonTelecharger(doc){
  const nom=pcbFile(".json","carte.json");
  dl(new Blob([JSON.stringify(doc||docObj(),null,1)],{type:"application/json"}),nom);
  S.dirty=false;
  if(typeof profNoterDocument==="function")profNoterDocument("pcb",nom);
  hint("Carte enregistrée dans "+nom+".");
}
function openFile(f){
  const r=new FileReader();
  r.onload=()=>{
    const txt=String(r.result);
    if(/^\s*\{/.test(txt)){
      try{
        const d=JSON.parse(txt);
        if(d.format==="schemedit-2"){
          hint("Ce fichier est un schéma. Exportez sa netlist (.txt) puis importez-la ici.");
          alert("Ce fichier est un schéma (.json).\n\nDans l'éditeur schématique, cliquez sur « Netlist .txt », puis importez ce fichier ici.");
          return;
        }
        push();loadDoc(d);
        if(typeof profNoterDocument==="function")profNoterDocument("pcb",f.name);
        hint("Carte "+f.name+" chargée.");
      }catch(err){alert("Fichier illisible : "+err.message);}
    }else{
      importNetlist(txt,false);
    }
  };
  r.readAsText(f);
}
function importNetlist(txt,dropMissing){
  const res=applyNetlist(txt,dropMissing);
  if(res.err){alert(res.err);return;}
  zoneCache.clear();
  buildLayers();refreshPanels();
  if(!S.tracks.length)fit();else draw();
  const nbConf=(res.conflicts&&res.conflicts.length)||0;
  hint("Netlist importée : "+res.added+" empreinte(s) créée(s), "+res.kept+" mise(s) à jour, "+
       res.nets+" net(s)"+(res.removed?", "+res.removed+" supprimée(s)":"")+
       (res.repkg?", "+res.repkg+" empreinte(s) refaite(s) sur un nouveau boîtier":"")+
       (nbConf?", ⚠️ "+nbConf+" pastille(s) routée(s) en conflit":"")+
       ". Les nouvelles empreintes attendent à droite de la carte — « Placement auto » les fait entrer.");
  if(nbConf>0&&typeof openNetlistConflictDialog==="function"){
    openNetlistConflictDialog(res.conflicts);
  }
  setTimeout(() => { if (typeof pcbVerifierEtNotifierPinout === "function") pcbVerifierEtNotifierPinout(false); }, 150);
}

/* Boîte de dialogue interactive pour nettoyer les pistes de cuivre en conflit après mise à jour de la netlist */
function openNetlistConflictDialog(conflicts){
  if(!conflicts||!conflicts.length||typeof document==="undefined")return;
  const m=document.createElement("div");
  m.className="modal";
  let itemsHtml="";
  for(const c of conflicts){
    const nTrk=(c.tracks&&c.tracks.length)||1;
    itemsHtml+='<li style="margin-bottom:8px;line-height:1.4">'+
      'Pastille <b>'+(c.ref||"?")+'.'+c.pin+'</b> : '+
      'était sur <span style="color:#f87171;font-weight:bold">'+(c.oldNet||"?")+'</span>, '+
      'devient <span style="color:#4ade80;font-weight:bold">'+(c.newNet||"?")+'</span> '+
      '<span style="color:var(--txt-dim);font-size:11.5px">('+nTrk+' piste(s) connectée(s))</span>'+
      '</li>';
  }
  m.innerHTML='<div class="box" style="max-width:540px">'+
    '<h3 style="color:#fbbf24;display:flex;align-items:center;gap:8px">'+
    '⚠️ Changement de brochage sur pistes routées</h3>'+
    '<p style="color:var(--txt-dim);font-size:12.5px;line-height:1.45;margin-bottom:10px">'+
    'La netlist met à jour des pastilles qui possèdent déjà des pistes de cuivre dessinées. '+
    'Pour éviter des courts-circuits, vous pouvez détacher ou supprimer automatiquement ces segments obsolètes :</p>'+
    '<ul style="margin:10px 0 14px 20px;font-size:12.5px;color:var(--txt)">'+itemsHtml+'</ul>'+
    '<div class="row" style="display:flex;justify-content:flex-end;gap:8px;margin-top:16px">'+
    '<button class="tb" id="nlConfKeep">Conserver les pistes (ignorer)</button>'+
    '<button class="tb on" id="nlConfClean" style="background:#ef4444;border-color:#ef4444;color:#fff">'+
    '✂ Supprimer les pistes en conflit</button>'+
    '</div></div>';
  document.body.appendChild(m);
  const close=()=>m.remove();
  m.onclick=e=>{if(e.target===m)close();};
  const bKeep=document.getElementById("nlConfKeep");
  if(bKeep)bKeep.onclick=close;
  const bClean=document.getElementById("nlConfClean");
  if(bClean)bClean.onclick=()=>{
    close();
    const nb=pcbNettoyerPistesConflits(conflicts);
    hint("✂ "+nb+" piste(s) en conflit supprimée(s). Les pastilles sont prêtes pour le nouveau chevelu.");
  };
}

/* ==========================================================================
   VÉRIFICATION & INSPECTION DU PINOUT PCB (Distance pins, Boîtier, Brochage)
   ========================================================================== */

function pcbVerifierEtNotifierPinout(autoOuvrirSiErreur) {
  if (typeof pcbVerifierPinout !== "function") return null;
  const res = pcbVerifierPinout();
  const btn = document.getElementById("bCheckPinout");

  if (btn) {
    if (res.nbComposants === 0) {
      btn.innerHTML = "⚡ Pinout : Schéma en attente";
      btn.className = "tb";
      btn.title = "Aucun composant avec schéma ou netlist rattaché";
    } else if (res.conforme) {
      btn.innerHTML = "⚡ Pinout : Conforme ✓";
      btn.className = "tb on pcb-btn-pinout-ok";
      btn.title = res.resume + " — Cliquez pour inspecter le détail";
    } else {
      btn.innerHTML = "⚠️ Pinout : " + res.nbAnomalies + " anomalie(s)";
      btn.className = "tb on pcb-btn-pinout-warn";
      btn.title = res.resume + " — Cliquez pour inspecter et corriger";
    }
    btn.onclick = () => pcbOuvrirDialoguePinout(pcbVerifierPinout());
  }

  if (res.nbComposants > 0) {
    if (res.conforme) {
      hint("✓ Pinout vérifié : " + res.resume);
      pcbAfficherToastPinout(res);
    } else {
      hint("⚠️ Alerte Pinout PCB : " + res.resume);
      pcbAfficherToastPinout(res);
      if (autoOuvrirSiErreur) {
        pcbOuvrirDialoguePinout(res);
      }
    }
  }
  return res;
}

function pcbAfficherToastPinout(res) {
  if (!res || !res.nbComposants || typeof document === "undefined") return;
  let toast = document.getElementById("pcbPinoutToast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "pcbPinoutToast";
  }
  if (!document.body.contains(toast)) {
    document.body.appendChild(toast);
  }
  toast.className = "pcb-pinout-toast " + (res.conforme ? "ok" : "warn");

  const icon = res.conforme ? "✓" : "⚠️";
  const titre = res.conforme ? "Brochage, Pas & Dimensions validés" : "Incohérence Pinout / Boîtier détectée";
  
  toast.innerHTML = 
    '<div class="pcb-toast-icon">' + icon + '</div>' +
    '<div class="pcb-toast-content">' +
      '<div class="pcb-toast-title">' + titre + '</div>' +
      '<div class="pcb-toast-desc">' + esc(res.resume) + '</div>' +
    '</div>' +
    '<div class="pcb-toast-actions">' +
      '<button class="tb mini ' + (res.conforme ? '' : 'on') + '" id="pcbToastInspect">' + (res.conforme ? 'Détails' : 'Corriger / Inspecter') + '</button>' +
      '<button class="pnl-btn" id="pcbToastClose" title="Fermer">✕</button>' +
    '</div>';

  document.body.appendChild(toast);

  const close = () => toast.remove();
  const bClose = document.getElementById("pcbToastClose");
  if (bClose) bClose.onclick = close;

  const bInsp = document.getElementById("pcbToastInspect");
  if (bInsp) bInsp.onclick = () => {
    close();
    pcbOuvrirDialoguePinout(pcbVerifierPinout());
  };

  // Fermeture automatique après 7 secondes si conforme
  if (res.conforme) {
    setTimeout(() => {
      if (document.body.contains(toast)) toast.remove();
    }, 7000);
  }
}

function pcbOuvrirDialoguePinout(res) {
  if (!res) res = (typeof pcbVerifierPinout === "function") ? pcbVerifierPinout() : null;
  if (!res || typeof document === "undefined") return;

  const oldModal = document.getElementById("pcbPinoutModal");
  if (oldModal) oldModal.remove();

  const m = document.createElement("div");
  m.id = "pcbPinoutModal";
  m.className = "modal";

  let cardsHtml = "";
  if (!res.composants || !res.composants.length) {
    cardsHtml = '<div class="empty" style="padding:20px;text-align:center">Aucun composant à afficher. Importez une netlist ou chargez un schéma.</div>';
  } else {
    res.composants.forEach(c => {
      const isOk = c.conforme;
      const isMissing = c.statut === "NON_PLACE";
      const badgeCls = isOk ? "ok" : (isMissing ? "dim" : "warn");
      const badgeTxt = isOk ? "✓ Conforme" : (isMissing ? "⏳ Non placé" : "⚠️ Incohérence");

      let pinsRows = "";
      if (c.pins && c.pins.length) {
        c.pins.forEach(p => {
          let stBadge = '<span class="pcb-pin-pill ok">✓ OK</span>';
          if (p.statut === "critique") {
            stBadge = '<span class="pcb-pin-pill crit">⚠️ ' + esc(p.detail) + '</span>';
          } else if (p.statut === "info") {
            stBadge = '<span class="pcb-pin-pill dim">Non raccordée</span>';
          }
          pinsRows +=
            '<tr>' +
              '<td style="text-align:center;font-weight:bold;color:#f0abfc">#' + p.pin + '</td>' +
              '<td style="font-family:var(--mono);font-weight:bold">' + esc(p.schName || "—") + '</td>' +
              '<td style="color:#60a5fa;font-family:var(--mono)">' + esc(p.pcbNet || "—") + '</td>' +
              '<td>' + stBadge + '</td>' +
            '</tr>';
        });
      }

      cardsHtml +=
        '<div class="pcb-comp-card ' + (isOk ? 'ok' : 'warn') + '">' +
          '<div class="pcb-comp-head">' +
            '<div>' +
              '<span class="pcb-comp-ref">' + esc(c.ref) + '</span> ' +
              '<span class="pcb-comp-val">' + esc(c.value || "") + '</span> ' +
              (c.pkg ? '<span class="pcb-comp-pkg">(' + esc(c.pkg) + ')</span>' : '') +
              (c.mpn ? '<span class="pcb-comp-mpn">MPN: ' + esc(c.mpn) + '</span>' : '') +
            '</div>' +
            '<span class="pcb-comp-badge ' + badgeCls + '">' + badgeTxt + '</span>' +
          '</div>' +
          '<div class="pcb-comp-body">' +
            '<div class="pcb-geom-checks">' +
              // 1. Distance entre les pins (pitch)
              '<div class="pcb-geom-chip ' + (c.pitchCheck && c.pitchCheck.ok ? 'ok' : 'err') + '">' +
                '<span class="pcb-chip-icon">' + (c.pitchCheck && c.pitchCheck.ok ? '✓' : '❌') + '</span> ' +
                '<b>Distance pins (pitch) :</b> ' + esc(c.pitchCheck ? c.pitchCheck.msg : "—") +
              '</div>' +
              // 2. Taille du boîtier / écartement (span)
              '<div class="pcb-geom-chip ' + (c.spanCheck && c.spanCheck.ok ? 'ok' : 'err') + '">' +
                '<span class="pcb-chip-icon">' + (c.spanCheck && c.spanCheck.ok ? '✓' : '❌') + '</span> ' +
                '<b>Taille boîtier (span) :</b> ' + esc(c.spanCheck ? c.spanCheck.msg : "—") +
              '</div>' +
              // 3. Nombre de pastilles
              '<div class="pcb-geom-chip ' + (c.pinCountCheck && c.pinCountCheck.ok ? 'ok' : 'err') + '">' +
                '<span class="pcb-chip-icon">' + (c.pinCountCheck && c.pinCountCheck.ok ? '✓' : '❌') + '</span> ' +
                '<b>Nombre de pastilles :</b> ' + esc(c.pinCountCheck ? c.pinCountCheck.msg : "—") +
              '</div>' +
            '</div>' +
            (c.peutReposer ? (
              '<div style="margin:10px 0 6px">' +
                '<button class="tb on pcb-repose-btn" data-repose-ref="' + esc(c.ref) + '" style="background:#2563eb;border-color:#3b82f6;color:#fff;font-size:11px">' +
                  '🔧 Reposer l\'empreinte sur les cotes du boîtier (' + esc(c.pkg) + ')' +
                '</button>' +
              '</div>'
            ) : '') +
            (pinsRows ? (
              '<details style="margin-top:8px" ' + (isOk ? '' : 'open') + '>' +
                '<summary style="cursor:pointer;font-size:11px;color:var(--txt-dim);margin-bottom:6px">Détail des broches et raccordements (' + (c.pins ? c.pins.length : 0) + ' pastilles)</summary>' +
                '<table class="pcb-pin-table">' +
                  '<thead><tr><th style="width:36px;text-align:center">Pastille</th><th>Nom schéma</th><th>Net PCB</th><th>Diagnostic</th></tr></thead>' +
                  '<tbody>' + pinsRows + '</tbody>' +
                '</table>' +
              '</details>'
            ) : '') +
          '</div>' +
        '</div>';
    });
  }

  m.innerHTML =
    '<div class="box" style="max-width:760px;max-height:85vh;display:flex;flex-direction:column">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid var(--border);padding-bottom:10px;margin-bottom:12px">' +
        '<div>' +
          '<h3 style="margin:0;display:flex;align-items:center;gap:8px;color:#67e8f9">' +
            '⚡ Inspection & Conformité du Pinout (Schéma ➔ PCB)' +
          '</h3>' +
          '<div style="color:var(--txt-dim);font-size:11.5px;margin-top:3px">' +
            'Contrôle automatique de la distance entre les pins (pitch), des dimensions du boîtier (span) et de l\'adéquation des pastilles.' +
          '</div>' +
        '</div>' +
        '<button class="pnl-btn" id="pcbModalClose">✕</button>' +
      '</div>' +
      '<div class="scroll" style="flex:1;overflow-y:auto;padding-right:4px">' +
        cardsHtml +
      '</div>' +
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-top:14px;border-top:1px solid var(--border);padding-top:10px">' +
        '<div style="font-size:11px;color:var(--txt-dim)">' +
          (res.conforme ? '<span style="color:#52c41a">✓ Tous les composants vérifiés sont conformes</span>' : '<span style="color:#fbbf24">⚠️ Corrigez les empreintes signalées pour garantir l\'assemblage</span>') +
        '</div>' +
        '<button class="tb" id="pcbModalCloseBtn">Fermer</button>' +
      '</div>' +
    '</div>';

  document.body.appendChild(m);

  const close = () => m.remove();
  m.onclick = e => { if (e.target === m) close(); };
  const bX = document.getElementById("pcbModalClose");
  if (bX) bX.onclick = close;
  const bF = document.getElementById("pcbModalCloseBtn");
  if (bF) bF.onclick = close;

  // Câbler les boutons pour reposer l'empreinte automatique
  m.querySelectorAll(".pcb-repose-btn").forEach(btn => {
    btn.onclick = () => {
      const ref = btn.getAttribute("data-repose-ref");
      const fp = S.fps && S.fps.find(f => f.ref === ref);
      if (fp && typeof applyPkgGeom === "function") {
        push();
        applyPkgGeom(fp);
        touch();
        refreshPanels();
        draw();
        hint("Empreinte " + ref + " reposée sur son boîtier " + fp.pkg + " (Pas et dimensions ajustés).");
        // Re-vérifier et rafraîchir la boîte de dialogue
        const newRes = pcbVerifierPinout();
        pcbOuvrirDialoguePinout(newRes);
        if (typeof pcbVerifierEtNotifierPinout === "function") {
          pcbVerifierEtNotifierPinout(false);
        }
      }
    };
  });
}
function exportPng(){
  const save={scale:S.scale,ox:S.ox,oy:S.oy};
  const b=S.board, pad=6, res=12;
  const W=Math.round((b.w+pad*2)*res), H=Math.round((b.h+pad*2)*res);
  const o=document.createElement("canvas");o.width=W;o.height=H;
  const c=o.getContext("2d");
  /* le miroir de la vue « dessous » tourne autour du centre de la carte :
     l'intervalle occupé à l'écran ne change pas, le cadrage non plus */
  S.scale=res;S.ox=(pad-b.x)*res;S.oy=(pad-b.y)*res;
  paint(c,1,W,H,true);
  S.scale=save.scale;S.ox=save.ox;S.oy=save.oy;
  o.toBlob(bl=>{
    if(!bl){alert("Export impossible : image trop grande.");return;}
    dl(bl,pcbFile(".png","carte.png"));
  });
  draw();
  hint("Vue exportée dans "+pcbFile(".png","carte.png")+
       " (couches visibles, orientation courante).");
}
function newDoc(){
  if(S.fps.length&&!confirm("Repartir d'une carte vide ? Le travail en cours sera perdu."))return;
  push();
  S.fps=[];S.tracks=[];S.vias=[];S.zones=[];S.drc=[];S.drcRun=false;S.hlNet=null;
  S.dpPairs=[];S.dp=null;   // les règles restent : elles décrivent un métier, pas une carte
  clearSel();zoneCache.clear();touch();
  refreshPanels();draw();
  hint("Carte vide. Importez une netlist pour commencer.");
}
/* ---------- boîte d'import ---------- */
function openImport(){
  const m=document.createElement("div");
  m.className="modal";
  m.innerHTML='<div class="box"><h3>Importer une netlist</h3>'+
    '<p>Collez le contenu du fichier <b>netlist.txt</b> exporté par l\'éditeur schématique, ou choisissez-le sur le disque. Les empreintes déjà posées gardent leur position ; seules les nouvelles sont ajoutées. Le boîtier indiqué par le schéma (0603, SOIC-8, TQFP-64…) fixe le style et les cotes de l\'empreinte : il n\'y a qu\'à replacer et router.</p>'+
    '<textarea id="nlTxt" placeholder="=== Composants ===&#10;    R1      10k        0603&#10;&#10;=== Feuille 1 — Principale ===&#10;NET &quot;+5V&quot;&#10;    U1.8&#10;    C1.1"></textarea>'+
    '<label style="display:flex;align-items:center;gap:7px;margin-top:9px;font-size:12px;color:var(--txt-dim)">'+
    '<input type="checkbox" id="nlDrop" style="accent-color:var(--blue)"> supprimer les empreintes absentes de la netlist</label>'+
    '<div class="row"><button class="tb" id="nlFile">Choisir un fichier…</button>'+
    '<button class="tb" id="nlCancel">Annuler</button>'+
    '<button class="tb on" id="nlOk">Importer</button></div></div>';
  document.body.appendChild(m);
  const close=()=>m.remove();
  m.onclick=e=>{if(e.target===m)close();};
  $("nlCancel").onclick=close;
  $("nlFile").onclick=()=>$("netIn").click();
  $("netIn").onchange=()=>{
    const f=$("netIn").files[0];
    if(!f)return;
    const r=new FileReader();
    r.onload=()=>{const t=$("nlTxt");if(t)t.value=String(r.result);};
    r.readAsText(f);
    $("netIn").value="";
  };
  $("nlOk").onclick=()=>{
    const txt=$("nlTxt").value;
    if(!txt.trim()){alert("Collez d'abord une netlist.");return;}
    const drop=$("nlDrop").checked;
    close();
    importNetlist(txt,drop);
  };
  $("nlTxt").focus();
}

/* ==========================================================================
   Câblage de l'interface
   ========================================================================== */
$("mSelect").onclick=()=>setMode("select");
$("mTrack").onclick=()=>setMode("track");
$("mVia").onclick=()=>setMode("via");
$("mDiff").onclick=()=>setMode("dpair");
/* Le bouton passe en mode zone et déplie ses options :
   rôle de la couche active, net du plan, deux façons de poser du cuivre. */
$("mZone").onclick=e=>{e.stopPropagation();setMode("zone");zoneMenuToggle();};
if($("mSilk")) $("mSilk").onclick=e=>{e.stopPropagation();setMode("silk");silkMenuToggle();};
$("mEdge").onclick=()=>setMode("edge");
$("mOrigin").onclick=()=>setMode("origin");
$("mErase").onclick=()=>setMode("cut");
$("bRot").onclick=rotateSel;
$("bFlip").onclick=flipSel;
$("bUnroute").onclick=unrouteSel;
$("bDel").onclick=deleteSel;
$("bUndo").onclick=undo;
$("bRedo").onclick=redo;
$("bCopy").onclick=copySelPcb;
$("bPaste").onclick=pasteClipPcb;
$("bGrid").onclick=()=>setGrid(!S.showGrid);
$("selGrid").onchange=e=>setGridStep(e.target.value);
buildGridMenu();
$("bAvoid").onclick=()=>{
  S.avoid=!S.avoid;
  $("bAvoid").classList.toggle("on",S.avoid);
  if(typeof profilNoter==="function")profilNoter();
  if(S.route)updateRoute(S.mouse.x,S.mouse.y);
  draw();
  hint(S.avoid?"Anti-collision actif : le tracé se tient à la distance d'isolation.":
       "Anti-collision coupé : plus rien ne retient le tracé.");
};
$("bRats").onclick=()=>{S.show.rats=!S.show.rats;$("bRats").classList.toggle("on",S.show.rats);buildLayers();draw();};
$("bView").onclick=()=>setFlip(!S.flip);
$("bContrast").onclick=()=>setContrast((S.contrast+1)%3);
$("bFit").onclick=fit;
$("bImport").onclick=openImport;
$("bDrc").onclick=()=>{
  const e=runDrc();
  S.listTab="drc";
  for(const [id,t] of [["tabNets","nets"],["tabComps","comps"],["tabDrc","drc"]])
    $(id).classList.toggle("on",t==="drc");
  buildList();draw();
  const hard=e.filter(x=>!x.info).length;
  if(typeof reIsOpen==="function"&&reIsOpen())reSync();
  hint(hard?hard+" erreur(s) de règles détectée(s).":"Contrôle DRC : aucune erreur de règles.");
};
/* La fenêtre des règles. Elle a remplacé les panneaux « Règles de tracé » et
   « Paires différentielles » du dock : c'est désormais le seul endroit où une
   règle de conception s'écrit, et ce bouton est sa porte. */
$("bRules").onclick=()=>reOpen();
$("bSave").onclick=saveJson;
$("bOpen").onclick=()=>$("fileIn").click();
$("fileIn").onchange=()=>{const f=$("fileIn").files[0];if(f)openFile(f);$("fileIn").value="";};
$("bPng").onclick=exportPng;
$("bFab").onclick=exportFab;
$("bNew").onclick=newDoc;
$("cuCount").onchange=()=>{
  const n=+$("cuCount").value;
  push();setCuCount(n);zoneCache.clear();
  hint("Empilage : "+n+" couche(s) de cuivre.");
};
for(const [id,t] of [["tabNets","nets"],["tabComps","comps"],["tabDrc","drc"]])
  $(id).onclick=()=>{
    S.listTab=t;
    for(const [i2,t2] of [["tabNets","nets"],["tabComps","comps"],["tabDrc","drc"]])
      $(i2).classList.toggle("on",t2===t);
    if(typeof profilNoter==="function")profilNoter();
    buildList();
  };
$("onlyUnrouted").onchange=()=>{
  S.onlyUnrouted=$("onlyUnrouted").checked;
  if(typeof profilNoter==="function")profilNoter();
  buildList();
};

$("ciAbs").onclick=()=>coordMode("abs");
$("ciRel").onclick=()=>coordMode("rel");
$("ciPol").onclick=()=>coordMode("pol");
$("ciOk").onclick=coordApply;
for(const id of ["ciA","ciB"])
  $(id).addEventListener("keydown",e=>{
    if(e.key==="Enter"){e.preventDefault();coordApply();}
    else if(e.key==="Escape"){e.preventDefault();coordClose();draw();}
    else if(e.key==="Tab"&&id==="ciB"&&!e.shiftKey){e.preventDefault();$("ciA").focus();$("ciA").select();}
  });

/* glisser-déposer d'un fichier sur la carte */
["dragover","drop"].forEach(t=>
  document.addEventListener(t,e=>{
    e.preventDefault();
    if(t==="drop"&&e.dataTransfer.files[0])openFile(e.dataTransfer.files[0]);
  }));
document.addEventListener("pointerdown",e=>{
  const m=$("zoneMenu");
  if(m&&m.classList.contains("on")&&!m.contains(e.target)&&!$("mZone").contains(e.target))
    zoneMenuClose();
  const sm=$("silkMenu");
  if(sm&&sm.classList.contains("on")&&!sm.contains(e.target)&&!($("mSilk")&&$("mSilk").contains(e.target)))
    silkMenuClose();
});
document.addEventListener("keydown",e=>{
  if(e.key!=="Escape")return;
  const m=$("zoneMenu");
  if(m&&m.classList.contains("on")){zoneMenuClose();e.stopPropagation();}
  const sm=$("silkMenu");
  if(sm&&sm.classList.contains("on")){silkMenuClose();e.stopPropagation();}
},true);
window.addEventListener("resize",()=>{zoneMenuClose();silkMenuClose();resize();});
window.addEventListener("beforeunload",e=>{
  /* Changer d'outil met la carte en session : il n'y a rien à perdre, la
     question ne se pose plus. Elle reste posée pour une vraie fermeture. */
  if(sessQuitte())return;
  if(S.dirty){e.preventDefault();e.returnValue="";}
});

/* ==========================================================================
   Session d'onglet : le travail suit l'utilisateur d'un outil à l'autre
   Aller vérifier une valeur sur le schéma, ou chercher une référence, ne doit
   plus coûter le routage en cours. Le document, la vue et l'état « modifié »
   partent en session (commun/session.js) et reviennent tels quels ; l'état
   « modifié » compte autant que le reste, sans lui la garde de sortie
   laisserait fermer l'onglet sans un mot sur une carte jamais enregistrée.
   ========================================================================== */
/* Vrai quand la session d'onglet a rétabli la vue : 16-profil.js ne la
   contredit pas avec la vue enregistrée dans le profil, plus ancienne. */
/* Cross-probing vers le schéma : ce que « voir sur le schéma » doit y chercher.
   Une seule empreinte sélectionnée d'abord -- c'est le cas net, « ce R1
   précisément » --, et à défaut le net mis en évidence (S.hlNet), qui lui
   n'exige pas de sélection : cliquer une piste ou une ligne du panneau Nets
   suffit. Rien de sélectionné -> rien à sonder, et le clic sur « Éditeur
   schématique » reste la navigation simple d'avant. */
function pcbSonde(cible){
  if(cible!=="schema")return null;
  if(S.sel.fps.size===1){
    const fp=fpById([...S.sel.fps][0]);
    if(fp&&fp.ref)return {quoi:"ref",valeur:fp.ref};
  }
  if(S.hlNet)return {quoi:"net",valeur:S.hlNet};
  return null;
}
let PCB_REPRISE=false;
function sessionPcb(){
  const repris=sessBrancher("pcb",()=>({
    doc:docObj(),
    sale:S.dirty,
    vue:{scale:S.scale,ox:S.ox,oy:S.oy,flip:S.flip}
  }),pcbSonde);
  if(!repris)return false;
  try{
    loadDoc(repris.etat.doc,true);       // normDoc() se charge de tout vérifier
  }catch(_){
    sessEffacer("pcb");
    hint("Reprise impossible : la carte mise de côté était illisible.");
    return false;
  }
  const v=repris.etat.vue||{};
  if(Number.isFinite(+v.scale)&&+v.scale>0){
    S.scale=+v.scale;S.ox=+v.ox||0;S.oy=+v.oy||0;
  }
  setFlip(!!v.flip);
  S.dirty=!!repris.etat.sale;
  draw();
  hint("Carte reprise dans l'état où vous l'aviez laissée en changeant d'outil"+
       (repris.etat.sale?" — pensez à l'enregistrer avant de fermer l'onglet.":"."));
  return true;
}

/* ==========================================================================
   Démarrage
   ========================================================================== */
function init(){
  setCuCount(2,true);
  $("cuCount").value="2";
  /* Pas de `reSync()` ici : la fenêtre des règles vit dans un fichier chargé
     APRÈS celui-ci, et son état (`RE`) n'existe pas encore quand `init()`
     s'exécute en pages séparées. Elle est fermée au démarrage, il n'y a donc
     rien à rafraîchir — `reOpen()` la remplira le jour où on l'ouvre. */
  buildLayers();buildTabs();
  setMode("select");setGrid(true);setContrast(1);setFlip(false);
  $("bRats").classList.add("on");
  $("bAvoid").classList.toggle("on",S.avoid);
  refreshPanels();
  resize();fit();
  PCB_REPRISE=sessionPcb();   // en dernier : reprend la carte laissée dans l'onglet
  pcbChargerProjet();
  setTimeout(() => {
    if (typeof pcbSyncSchema === "function") {
      pcbSyncSchema().then(() => {
        if (typeof pcbVerifierEtNotifierPinout === "function") pcbVerifierEtNotifierPinout(false);
      }).catch(() => {
        if (typeof pcbVerifierEtNotifierPinout === "function") pcbVerifierEtNotifierPinout(false);
      });
    } else if (typeof pcbVerifierEtNotifierPinout === "function") {
      pcbVerifierEtNotifierPinout(false);
    }
  }, 350);
}

/* Charge la carte depuis le dossier du projet, quand il y en a un.
   Trois précautions, et chacune répare un dégât possible :
     - la session d'onglet passe devant : elle porte le travail en cours, plus
       récent que le fichier ;
     - on ne remplace jamais un travail non enregistré ;
     - une seule fois, sinon chaque signal de changement de projet rechargerait
       la carte sous les doigts.
   Le rattachement du dossier est asynchrone (projet-disque.js le reprend au
   chargement) : d'où l'abonnement, en plus de l'appel depuis init(). */
let PCB_PROJET_LU=false;
function pcbChargerProjet(){
  if(PCB_PROJET_LU||PCB_REPRISE||S.dirty)return;
  if(typeof projdLie!=="function")return;
  /* Dossier retrouvé mais autorisation perdue : une demande sans geste de
     l'utilisateur échoue, et il n'y a pas de geste à offrir ici. On le dit. */
  if(!projdLie()){
    const a=(typeof projdAReconnecter==="function")?projdAReconnecter():"";
    if(a)hint("Dossier « "+a+" » à rouvrir : passez par l'accueil, la carte "
      +"en cours reste dans l'onglet.");
    return;
  }
  PCB_PROJET_LU=true;
  projdDocLire("pcb").then(function(d){
    if(!d)return;              // dossier sans carte : il n'y a rien à reprendre
    if(S.dirty)return;         // travail commencé pendant la lecture : on n'écrase pas
    loadDoc(d);
    draw();
    hint("Carte chargée depuis le dossier du projet.");
    /* La cible du cross-probing n'a pu être reprise au démarrage (18-reperage.js,
       juste après cette page) que si la session d'onglet avait déjà une carte :
       une carte lue APRÈS coup, comme ici, doit retenter une fois chargée. */
    if(typeof sessCibleAuChargement==="function")
      sessCibleAuChargement(pcbSonderCible);
    setTimeout(() => {
      if (typeof pcbSyncSchema === "function") {
        pcbSyncSchema().then(() => {
          if (typeof pcbVerifierEtNotifierPinout === "function") pcbVerifierEtNotifierPinout(false);
        }).catch(() => {
          if (typeof pcbVerifierEtNotifierPinout === "function") pcbVerifierEtNotifierPinout(false);
        });
      } else if (typeof pcbVerifierEtNotifierPinout === "function") {
        pcbVerifierEtNotifierPinout(false);
      }
    }, 350);
  }).catch(function(e){
    PCB_PROJET_LU=false;       // un échec ne doit pas condamner les essais suivants
    hint("Carte du projet illisible : "+e.message);
  });
}
try{ projSurChangement(pcbChargerProjet); }catch(_){}

// Écoute des mises à jour de pinout issues de l'éditeur schématique
try {
  if (typeof BroadcastChannel === "function") {
    const bcPinout = new BroadcastChannel("cao.probe.v1");
    bcPinout.addEventListener("message", ev => {
      const m = ev && ev.data;
      if (m && m.type === "pinout_update") {
        if (typeof S !== "undefined" && S.schDoc) {
          const sch = S.schDoc;
          const pages = Array.isArray(sch.pages) ? sch.pages : [sch];
          pages.forEach(p => {
            const comps = Array.isArray(p.comps) ? p.comps : (Array.isArray(p.components) ? p.components : []);
            for (const c of comps) {
              if (c && c.ref === m.ref) {
                c.pinout = m.pinout;
                c.pinoutVerified = true;
                if (m.mpn) c.mpn = m.mpn;
                if (m.pkg) c.pkg = m.pkg;
              }
            }
          });
        }
        if (typeof pcbVerifierEtNotifierPinout === "function") {
          pcbVerifierEtNotifierPinout(false);
        }
      }
    });
  }
} catch (_) {}

init();
