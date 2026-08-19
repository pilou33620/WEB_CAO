"use strict";
/* ==========================================================================
   Éditeur PCB — panneaux
   Onglets de couches, liste des couches, règles, propriétés, listes.
   ========================================================================== */
/* ==========================================================================
   Panneaux
   ========================================================================== */
function buildTabs(){
  const box=$("tabs");
  const zn=new Array(S.cu).fill(0);
  for(const z of S.zones)if(z.l<S.cu)zn[z.l]++;
  let h="";
  for(let i=0;i<S.cu;i++){
    const L=S.cuL[i];
    h+='<div class="tab'+(i===S.active?" on":"")+(L.vis?"":" hid")+'" data-i="'+i+'">'+
       '<i class="dot" style="background:'+L.color+'"></i>'+
       '<span>'+esc(L.name)+'</span>'+
       (L.plane?'<span class="pl">PLAN '+esc(L.net||"—")+'</span>':
        (zn[i]?'<span class="pl">'+zn[i]+' ZONE'+(zn[i]>1?"S":"")+'</span>':""))+
       '<span class="num">'+cuId(i,S.cu)+' · '+(i+1)+'</span></div>';
  }
  h+='<span class="tabinfo">'+S.cu+' couches · '+S.tracks.length+' segments · '+
     S.vias.length+' vias · '+S.zones.length+' zones</span>';
  box.innerHTML=h;
  box.querySelectorAll(".tab").forEach(el=>{
    el.onclick=()=>{routeToLayer(+el.dataset.i);draw();};
  });
}
function buildLayers(){
  const box=$("layers");
  const cnt=new Array(S.cu).fill(0), zn=new Array(S.cu).fill(0);
  for(const t of S.tracks)if(t.l<S.cu)cnt[t.l]++;
  for(const z of S.zones)if(z.l<S.cu)zn[z.l]++;
  let h="";
  for(let i=0;i<S.cu;i++){
    const L=S.cuL[i];
    h+='<div class="lay'+(i===S.active?" on":"")+(L.vis?"":" off")+'" data-i="'+i+'">'+
       '<i class="sw" style="background:'+L.color+'"></i>'+
       '<span class="nm">'+esc(L.name)+'</span>'+
       (L.plane?'<span class="pl">PLAN</span>':(zn[i]?'<span class="pl">'+zn[i]+'</span>':""))+
       '<span class="tp">'+cuId(i,S.cu)+' · '+cnt[i]+'</span>'+
       '<span class="eye" data-eye="'+i+'">'+(L.vis?"◉":"○")+'</span></div>';
  }
  h+='<div class="cat">Couches techniques</div>';
  const tech=[["silkT","Sérigraphie dessus","F.SilkS"],["silkB","Sérigraphie dessous","B.SilkS"],
              ["maskT","Masque dessus","F.Mask"],["maskB","Masque dessous","B.Mask"],
              ["pasteT","Pâte dessus","F.Paste"],["pasteB","Pâte dessous","B.Paste"],
              ["edge","Contour de carte","Edge.Cuts"],["plane","Zones de cuivre","Zones"],
              ["rats","Chevelu","Ratsnest"],["drc","Erreurs DRC","DRC"]];
  for(const [k,n,id] of tech)
    h+='<div class="lay'+(S.show[k]?"":" off")+'" data-show="'+k+'">'+
       '<i class="sw" style="background:'+
       ({silkT:C_SILK_T,silkB:C_SILK_B,maskT:C_MASK,maskB:C_MASK,
         pasteT:C_PASTE,pasteB:C_PASTE,edge:C_EDGE,plane:"#3a6b58",
         rats:C_RATS,drc:C_ERR}[k])+'"></i>'+
       '<span class="nm">'+n+'</span><span class="tp">'+id+'</span>'+
       '<span class="eye">'+(S.show[k]?"◉":"○")+'</span></div>';
  h+='<div class="cat">Couche active</div><div id="actLay"></div>';
  box.innerHTML=h;
  box.querySelectorAll(".lay[data-i]").forEach(el=>{
    el.onclick=ev=>{
      const i=+el.dataset.i;
      if(ev.target.dataset.eye!==undefined){
        S.cuL[i].vis=!S.cuL[i].vis;touch();buildLayers();buildTabs();draw();
      }else{routeToLayer(i);draw();}
    };
  });
  box.querySelectorAll(".lay[data-show]").forEach(el=>{
    el.onclick=()=>{
      S.show[el.dataset.show]=!S.show[el.dataset.show];
      if(el.dataset.show==="rats")$("bRats").classList.toggle("on",S.show.rats);
      buildLayers();draw();
    };
  });
  buildActiveLayer();
}
function buildActiveLayer(){
  const box=$("actLay");
  if(!box)return;
  const L=S.cuL[S.active];
  const n=S.zones.filter(z=>z.l===S.active).length;
  const nets=netTable();
  box.innerHTML=
    '<div class="prop"><label>Nom de la couche</label>'+
      '<input id="laName" value="'+esc(L.name)+'"></div>'+
    '<div class="prop two"><div><label>Couleur</label>'+
      '<input id="laCol" type="color" value="'+L.color+'" style="padding:2px;height:30px"></div>'+
      '<div><label>Zones posées</label><input value="'+n+'" disabled></div></div>'+
    '<div class="prop"><label>Rôle</label><select id="laPlane">'+
      '<option value="0"'+(L.plane?"":" selected")+'>Signal</option>'+
      '<option value="1"'+(L.plane?" selected":"")+'>Plan de cuivre pleine carte</option></select></div>'+
    (L.plane?'<div class="prop"><label>Net du plan</label><select id="laNet">'+
      '<option value="">— aucun —</option>'+
      nets.map(x=>'<option'+(x.name===L.net?" selected":"")+'>'+esc(x.name)+'</option>').join("")+
      '</select></div>':"")+
    '<div class="prop"><div class="row">'+
      '<button class="tb" id="laZone">Zone à main levée <kbd>Z</kbd></button></div>'+
      '<div class="row"><button class="tb" id="laFull">Zone pleine carte (libre)</button></div></div>';
  const nm=$("laName");
  if(nm)nm.onchange=()=>{L.name=nm.value.trim()||cuLabel(S.active,S.cu);L.custom=true;
    buildLayers();buildTabs();};
  const col=$("laCol");
  if(col)col.oninput=()=>{L.color=col.value;L.custom=true;touch();buildLayers();buildTabs();draw();};
  const pl=$("laPlane");
  if(pl)pl.onchange=()=>{
    push();L.plane=pl.value==="1";
    if(L.plane&&!L.net){const n2=nets.find(x=>isPower(x.name));L.net=n2?n2.name:"";}
    syncAutoZones();buildLayers();buildTabs();refreshPanels();draw();
    hint(L.plane?"Plan pleine carte sur "+cuId(S.active,S.cu)+
        " : il suit le contour de la carte. Déformer ses sommets le rend libre."
        :"Couche repassée en signal, son plan pleine carte est retiré.");
  };
  const nt=$("laNet");
  if(nt)nt.onchange=()=>{push();L.net=nt.value;syncAutoZones();buildLayers();buildTabs();
    refreshPanels();draw();};
  const z=$("laZone");
  if(z)z.onclick=()=>setMode("zone");
  const f=$("laFull");
  if(f)f.onclick=fullBoardZone;
}
function numProp(id,label,val,step,min){
  return '<div><label>'+label+'</label><input id="'+id+'" type="number" step="'+
    (step||0.05)+'" min="'+(min==null?0:min)+'" value="'+val+'"></div>';
}
let _clsSel=0;
function buildRules(){
  const box=$("rules");
  _clsSel=clamp(_clsSel,0,S.classes.length-1);
  const c=S.classes[_clsSel]||defClass();
  const used=new Map();
  for(const n of netTable()){
    const k=className(n.name);
    used.set(k,(used.get(k)||0)+1);
  }
  box.innerHTML=
    '<div class="prop"><label>Classe</label><select id="clSel">'+
      S.classes.map((x,i)=>'<option value="'+i+'"'+(i===_clsSel?" selected":"")+'>'+
        esc(x.name)+' ('+(used.get(x.name)||0)+' net'+((used.get(x.name)||0)>1?"s":"")+')'+
        '</option>').join("")+'</select></div>'+
    '<div class="prop two">'+numProp("clW","Piste (mm)",c.w,0.05,0.05)+
      numProp("clClr","Isolation",c.clr,0.05,0.02)+'</div>'+
    '<div class="prop two">'+numProp("clVia","Via Ø",c.via,0.05,0.2)+
      numProp("clDr","Perçage",c.drill,0.05,0.1)+'</div>'+
    '<div class="prop"><div class="row">'+
      '<button class="tb" id="clNew">Nouvelle</button>'+
      '<button class="tb" id="clRen">Renommer</button>'+
      (_clsSel>0?'<button class="tb" id="clDel">Supprimer</button>':"")+'</div>'+
      '<div class="row"><button class="tb" id="clApply">Appliquer au routage</button></div></div>'+
    '<div class="cat">Règles générales</div>'+
    '<div class="prop two">'+numProp("rEdge","Marge bord",S.rule.edge,0.05)+
      numProp("rTh","Bras thermique",S.rule.thermal,0.05)+'</div>'+
    '<div class="prop two">'+
      '<div><label>Grille (mm)</label><select id="rGrid">'+
      [0.05,0.1,0.25,0.5,1,1.27,2.54].map(g=>
        '<option value="'+g+'"'+(g===S.grid?" selected":"")+'>'+g+'</option>').join("")+
      '</select></div>'+numProp("bW","Carte L (mm)",S.board.w,1,1)+'</div>'+
    '<div class="prop two">'+numProp("bH","Carte H (mm)",S.board.h,1,1)+
      numProp("rMask","Masque ±",S.rule.mask,0.01)+'</div>'+
    '<div class="cat">Origine</div>'+
    '<div class="prop two">'+numProp("oX","Origine X",r3(S.origin.x),0.5,-1e4)+
      numProp("oY","Origine Y",r3(S.origin.y),0.5,-1e4)+'</div>'+
    '<div class="prop"><label>Repère des fichiers de fabrication</label>'+
      '<select id="oFab"><option value="0"'+(S.fabOrigin?"":" selected")+
      '>coin de la carte</option><option value="1"'+(S.fabOrigin?" selected":"")+
      '>origine utilisateur</option></select></div>'+
    '<div class="prop"><div class="row">'+
      '<button class="tb" id="oSet">Placer <kbd>O</kbd></button>'+
      '<button class="tb" id="oZero">Remettre à zéro</button></div></div>'+
    '<div class="cat">Fabrication</div>'+
    '<div class="prop two">'+numProp("rPaste","Retrait pâte",S.rule.paste,0.01)+
      '<div><label>Vias</label><select id="rTent">'+
      '<option value="1"'+(S.rule.tented?" selected":"")+'>recouverts</option>'+
      '<option value="0"'+(S.rule.tented?"":" selected")+'>ouverts</option></select></div></div>';

  const bindNum=(id,fn)=>{
    const el=$(id);
    if(el)el.onchange=()=>{push();fn(parseFloat(el.value)||0);touch();zoneCache.clear();
      buildRules();refreshPanels();draw();};
  };
  $("clSel").onchange=()=>{_clsSel=+$("clSel").value;buildRules();};
  bindNum("clW",v=>c.w=Math.max(0.05,v));
  bindNum("clClr",v=>c.clr=Math.max(0.02,v));
  bindNum("clVia",v=>c.via=Math.max(0.2,v));
  bindNum("clDr",v=>c.drill=clamp(v,0.1,c.via-0.1));
  bindNum("rEdge",v=>{S.rule.edge=v;boardChanged();});
  bindNum("rTh",v=>S.rule.thermal=v);
  bindNum("bW",v=>setBoardSize(v,S.board.h));
  bindNum("bH",v=>setBoardSize(S.board.w,v));
  bindNum("oX",v=>S.origin.x=v);
  bindNum("oY",v=>S.origin.y=v);
  $("oFab").onchange=()=>{push();S.fabOrigin=$("oFab").value==="1";touch();};
  $("oSet").onclick=()=>setMode("origin");
  $("oZero").onclick=()=>{push();S.origin={x:0,y:0};touch();buildRules();draw();};
  bindNum("rMask",v=>S.rule.mask=v);
  bindNum("rPaste",v=>S.rule.paste=v);
  $("rTent").onchange=()=>{push();S.rule.tented=$("rTent").value==="1";touch();draw();};
  $("rGrid").onchange=()=>{S.grid=parseFloat($("rGrid").value);draw();};
  $("clNew").onclick=()=>{
    const n=(prompt("Nom de la nouvelle classe :","Classe "+(S.classes.length+1))||"").trim();
    if(!n)return;
    if(S.classes.some(x=>x.name===n)){alert("Ce nom est déjà pris.");return;}
    push();
    S.classes.push({name:n,w:c.w,clr:c.clr,via:c.via,drill:c.drill});
    _clsSel=S.classes.length-1;
    touch();buildRules();refreshPanels();
  };
  $("clRen").onclick=()=>{
    const n=(prompt("Nouveau nom :",c.name)||"").trim();
    if(!n||n===c.name)return;
    if(S.classes.some(x=>x.name===n)){alert("Ce nom est déjà pris.");return;}
    push();
    for(const k in S.netClass)if(S.netClass[k]===c.name)S.netClass[k]=n;
    c.name=n;
    touch();buildRules();refreshPanels();
  };
  const del=$("clDel");
  if(del)del.onclick=()=>{
    push();
    for(const k in S.netClass)if(S.netClass[k]===c.name)delete S.netClass[k];
    S.classes.splice(_clsSel,1);
    _clsSel=0;touch();zoneCache.clear();buildRules();refreshPanels();draw();
    hint("Classe supprimée : ses nets repassent à « "+defClass().name+" ».");
  };
  $("clApply").onclick=()=>applyClasses();
}
/* Recale le routage déjà posé sur les règles des classes. C'est explicite :
   changer une largeur ne doit pas remuer la carte sans qu'on l'ait demandé. */
function applyClasses(){
  push();
  let nt=0,nv=0;
  for(const t of S.tracks){
    const w=classOf(t.net).w;
    if(Math.abs(t.w-w)>1e-6){t.w=w;nt++;}
  }
  for(const v of S.vias){
    const cl=classOf(v.net);
    if(Math.abs(v.d-cl.via)>1e-6||Math.abs(v.drill-cl.drill)>1e-6){
      v.d=cl.via;v.drill=Math.min(cl.drill,cl.via-0.1);nv++;
    }
  }
  touch();zoneCache.clear();refreshPanels();draw();
  hint(nt+" piste(s) et "+nv+" via(s) alignés sur leur classe.");
}
function refreshPanels(){buildProps();buildList();buildTabs();}

function buildProps(){
  const box=$("props");
  const fps=[...S.sel.fps].map(fpById).filter(Boolean);
  const tr=[...S.sel.tracks], vi=[...S.sel.vias], zo=[...S.sel.zones];
  const only=n=>fps.length+tr.length+vi.length+zo.length===n;
  if(fps.length===1&&only(1))return propsFp(box,fps[0]);
  if(tr.length===1&&only(1))return propsTrack(box,tr[0]);
  if(vi.length===1&&only(1))return propsVia(box,vi[0]);
  if(S.sel.edge&&only(0))return propsBoard(box);
  if(zo.length===1&&only(1))return propsZone(box,zo[0]);
  if(tr.length>1&&only(tr.length))return propsTracks(box,tr);
  if(!only(0)){
    box.innerHTML='<div class="empty">'+fps.length+' empreinte(s), '+tr.length+
      ' segment(s), '+vi.length+' via(s), '+zo.length+
      ' zone(s) sélectionnés.<br>R pivote · F retourne · Suppr supprime.</div>';
    return;
  }
  const c=conn();
  box.innerHTML='<div class="empty">Rien de sélectionné.<br><br>'+
    S.fps.length+' empreinte(s) · '+c.unrouted+' liaison(s) restant à router.'+
    (c.approx?'<br><span style="color:var(--txt-dim)">Îlots de cuivre en cours d\'analyse…</span>':"")+
    '</div>'+
    '<div class="prop"><div class="row">'+
    '<button class="tb" id="pAuto">Placement auto</button>'+
    '<button class="tb" id="pArr">Ranger à côté</button></div></div>';
  const a=$("pAuto");
  if(a)a.onclick=()=>{autoPlace(150);refreshPanels();draw();hint("Placement dégrossi : ajustez à la main, rien n'est figé.");};
  const b=$("pArr");
  if(b)b.onclick=()=>{push();arrange(S.fps.slice());touch();draw();};
}
function propsFp(box,fp){
  const ps=padsOf(fp);
  let h='<div class="prop"><label>Repère</label><input id="pRef" value="'+esc(fp.ref)+'"></div>'+
    '<div class="prop two"><div><label>Valeur</label><input id="pVal" value="'+esc(fp.value||"")+'"></div>'+
    '<div><label>Boîtier</label><input id="pPkg" value="'+esc(fp.pkg||"")+'"></div></div>'+
    '<div class="prop"><label>Empreinte générique</label><select id="pStyle">'+
    Object.keys(STYLES).map(k=>'<option value="'+k+'"'+(fp.style===k?" selected":"")+'>'+
      STYLES[k].n+'</option>').join("")+'</select></div>'+
    '<div class="prop two">'+numProp("pPins","Broches",fp.pins,1,1)+
      numProp("pPitch","Pas (mm)",fp.pitch,0.01,0.2)+'</div>'+
    '<div class="prop two">'+numProp("pSpan","Écartement",fp.span,0.01,0.2)+
      '<div><label>Face</label><select id="pSide">'+
      '<option value="0"'+(fp.side?"":" selected")+'>Dessus</option>'+
      '<option value="1"'+(fp.side?" selected":"")+'>Dessous</option></select></div></div>'+
    '<div class="prop two">'+numProp("pX","X (mm)",ux(fp.x),0.1,-1e4)+
      numProp("pY","Y (mm)",uy(fp.y),0.1,-1e4)+'</div>'+
    '<div class="prop"><label>Rotation</label><select id="pRot">'+
      [0,45,90,135,180,225,270,315].map(a=>'<option value="'+a+'"'+
        ((fp.rot||0)===a?" selected":"")+'>'+a+'°</option>').join("")+'</select></div>'+
    '<div class="cat">Broches et nets</div><table class="bom"><tbody>';
  for(const q of ps)
    h+='<tr data-net="'+esc(q.net||"")+'"><td class="r">'+q.n+'</td>'+
       '<td class="net">'+(q.net?'<span class="dot" style="background:'+netColor(q.net)+
       '"></span>'+esc(q.net):'<span style="color:var(--txt-dim)">non connectée</span>')+'</td></tr>';
  h+='</tbody></table>';
  box.innerHTML=h;
  const upd=(id,fn,num)=>{
    const el=$(id);
    if(!el)return;
    el.onchange=()=>{push();fn(num?(parseFloat(el.value)||0):el.value);touch();refreshPanels();draw();};
  };
  upd("pRef",v=>fp.ref=v.trim()||fp.ref);
  upd("pVal",v=>fp.value=v);
  upd("pPkg",v=>fp.pkg=v);
  upd("pStyle",v=>{fp.style=v;const g=defaultGeom(v);fp.pitch=g.pitch;fp.span=g.span;});
  upd("pPins",v=>fp.pins=Math.max(1,Math.round(v)),true);
  upd("pPitch",v=>fp.pitch=Math.max(0.2,v),true);
  upd("pSpan",v=>fp.span=Math.max(0.2,v),true);
  upd("pSide",v=>fp.side=+v,true);
  upd("pX",v=>fp.x=wxu(v),true);
  upd("pY",v=>fp.y=wyu(v),true);
  upd("pRot",v=>fp.rot=+v,true);
  box.querySelectorAll("tr[data-net]").forEach(tr=>{
    tr.onclick=()=>{
      const n=tr.dataset.net;
      S.hlNet=(n&&S.hlNet!==n)?n:null;
      buildList();draw();
    };
  });
}
function propsBoard(box){
  const P=boardPoly(), out=S.fps.filter(f=>!inBoard(f.x,f.y,0));
  box.innerHTML=
    '<div class="prop two">'+numProp("bpW","Largeur (mm)",fmt(S.board.w,2),0.5,5)+
      numProp("bpH","Hauteur (mm)",fmt(S.board.h,2),0.5,5)+'</div>'+
    '<div class="prop two">'+
      '<div><label>Contour</label><input value="'+(S.board.pts?"libre":"rectangle")+
      '" disabled></div>'+
      '<div><label>Sommets</label><input value="'+P.length+'" disabled></div></div>'+
    '<div class="empty" style="padding:6px 12px">'+
      (S.board.pts
        ? "Glissez les poignées pour déformer · Ctrl+clic sur une arête ajoute un sommet · redimensionner met le contour à l\'échelle."
        : "Contour rectangulaire. Le mode Contour (E) permet d\'en dessiner un librement.")+
      (out.length?'<br><span class="warn">'+out.length+' empreinte(s) hors du contour.</span>':"")+
      '</div>'+
    '<div class="prop"><div class="row">'+
      '<button class="tb" id="bpDraw">Redessiner <kbd>E</kbd></button>'+
      (S.board.pts?'<button class="tb" id="bpRect">Revenir au rectangle</button>':"")+
      '</div></div>';
  $("bpW").onchange=()=>{push();setBoardSize(parseFloat($("bpW").value)||S.board.w,S.board.h);
    buildRules();refreshPanels();draw();};
  $("bpH").onchange=()=>{push();setBoardSize(S.board.w,parseFloat($("bpH").value)||S.board.h);
    buildRules();refreshPanels();draw();};
  $("bpDraw").onclick=()=>setMode("edge");
  const r=$("bpRect");
  if(r)r.onclick=()=>{push();setBoardRect();buildRules();refreshPanels();draw();
    hint("Contour ramené au rectangle englobant.");};
}
function propsZone(box,z){
  const b=polyBBox(z.pts);
  const info=conn().nets.get(z.net);
  box.innerHTML=
    '<div class="prop"><label>Couche</label><select id="zL">'+
      S.cuL.map((L,i)=>'<option value="'+i+'"'+(z.l===i?" selected":"")+'>'+
        esc(L.name)+' — '+cuId(i,S.cu)+'</option>').join("")+'</select></div>'+
    '<div class="prop"><label>Net rattaché</label><select id="zN">'+
      '<option value="">— aucun (cuivre isolé) —</option>'+
      netTable().map(n=>'<option'+(n.name===z.net?" selected":"")+'>'+esc(n.name)+'</option>').join("")+
      '</select></div>'+
    '<div class="prop two">'+
      '<div><label>Sommets</label><input value="'+z.pts.length+'" disabled></div>'+
      '<div><label>Emprise</label><input value="'+fmt(b.x2-b.x1,1)+" × "+fmt(b.y2-b.y1,1)+
      ' mm" disabled></div></div>'+
    '<div class="empty" style="padding:6px 12px">'+
      (z.net?"Les pastilles "+esc(z.net)+" de cette couche prises dans le contour sont reliées par des bras thermiques"+
        (info?" ("+info.pads.length+" pastille(s) sur ce net)":"")+"."
           :"Sans net, la zone est du cuivre isolé : elle dégage tout ce qu'elle rencontre.")+
      '<br>Glissez les poignées pour déformer · Ctrl+clic sur une arête ajoute un sommet.'+
      (z.auto?'<br><span style="color:var(--yellow)">Plan de couche : il suit le contour de la carte tant qu\'on ne le déforme pas.</span>':"")+'</div>'+
    '<div class="prop"><div class="row">'+
      '<button class="tb" id="zFull">Étendre à la carte</button>'+
      '<button class="tb" id="zDel">Supprimer</button></div></div>';
  $("zL").onchange=()=>{push();detachAuto(z);z.l=+$("zL").value;touch();
    buildLayers();buildTabs();refreshPanels();draw();};
  $("zN").onchange=()=>{
    push();z.net=$("zN").value;
    if(z.auto&&S.cuL[z.l])S.cuL[z.l].net=z.net;
    touch();buildLayers();buildTabs();refreshPanels();draw();
  };
  $("zFull").onclick=()=>{push();z.pts=boardZonePts();touch();refreshPanels();draw();};
  $("zDel").onclick=()=>{push();detachAuto(z);S.zones=S.zones.filter(o=>o!==z);clearSel();
    touch();buildLayers();buildTabs();refreshPanels();draw();};
}
function propsTrack(box,t){
  const len=dist(t.x1,t.y1,t.x2,t.y2), cl=classOf(t.net);
  const g=netTracks(t.net);
  box.innerHTML=
    '<div class="prop"><label>Couche</label><select id="tL">'+
      S.cuL.map((L,i)=>'<option value="'+i+'"'+(t.l===i?" selected":"")+'>'+
        esc(L.name)+' — '+cuId(i,S.cu)+'</option>').join("")+'</select></div>'+
    '<div class="prop two">'+numProp("tW","Largeur (mm)",t.w,0.05,0.05)+
      '<div><label>Longueur</label><input value="'+fmt(len,2)+' mm" disabled></div></div>'+
    '<div class="prop"><label>Net</label><select id="tN"><option value="">— libre —</option>'+
      netTable().map(n=>'<option'+(n.name===t.net?" selected":"")+'>'+esc(n.name)+'</option>').join("")+
      '</select></div>'+
    '<div class="prop"><label>Classe du net</label><select id="tC">'+
      S.classes.map(x=>'<option'+(x.name===cl.name?" selected":"")+'>'+esc(x.name)+'</option>').join("")+
      '</select></div>'+
    '<div class="empty" style="padding:6px 12px">Classe '+esc(cl.name)+' : '+fmt(cl.w,2)+
      ' mm, isolation '+fmt(cl.clr,2)+' mm.<br>'+
      'Tirez une extrémité pour la déplacer · Ctrl+glisser la détache du coude · '+
      'Ctrl+clic sur le segment y insère un point.</div>'+
    '<div class="prop"><div class="row">'+
      '<button class="tb" id="tAll">Largeur au net</button>'+
      '<button class="tb" id="tCls">Largeur de classe</button></div>'+
      '<div class="row"><button class="tb" id="tSel">Sélectionner le net ('+g.tracks.length+')</button>'+
      '<button class="tb" id="tDel">Dérouter le net</button></div></div>';
  $("tL").onchange=()=>{push();t.l=+$("tL").value;touch();refreshPanels();draw();};
  $("tW").onchange=()=>{push();t.w=Math.max(0.05,parseFloat($("tW").value)||cl.w);
    touch();refreshPanels();draw();};
  $("tN").onchange=()=>{push();t.net=$("tN").value;touch();refreshPanels();draw();};
  $("tC").onchange=()=>{
    if(!t.net){alert("Cette piste n'est rattachée à aucun net : la classe ne s'applique pas.");
      buildProps();return;}
    push();setNetClass(t.net,$("tC").value);touch();zoneCache.clear();
    buildRules();refreshPanels();draw();
  };
  $("tAll").onclick=()=>{
    if(!t.net)return;
    push();
    for(const o of S.tracks)if(o.net===t.net)o.w=t.w;
    touch();refreshPanels();draw();
  };
  $("tCls").onclick=()=>{
    push();
    for(const o of S.tracks)if(o.net===t.net)o.w=classOf(t.net).w;
    touch();refreshPanels();draw();
  };
  $("tSel").onclick=()=>selectNetRouting(t.net);
  $("tDel").onclick=()=>{
    if(!t.net)return;
    if(confirm("Supprimer tout le routage du net "+t.net+" ?"))deleteNetRouting(t.net);
  };
}
function propsTracks(box,list){
  const nets=[...new Set(list.map(t=>t.net||"—"))];
  box.innerHTML=
    '<div class="empty">'+list.length+' segments sélectionnés · net'+(nets.length>1?"s":"")+
      ' '+esc(nets.join(", "))+'</div>'+
    '<div class="prop"><label>Couche</label><select id="msL">'+
      '<option value="">— inchangée —</option>'+
      S.cuL.map((L,i)=>'<option value="'+i+'">'+esc(L.name)+' — '+cuId(i,S.cu)+'</option>').join("")+
      '</select></div>'+
    '<div class="prop two">'+numProp("msW","Largeur (mm)",list[0].w,0.05,0.05)+
      '<div><label>Longueur totale</label><input value="'+
      fmt(list.reduce((a,t)=>a+dist(t.x1,t.y1,t.x2,t.y2),0),1)+' mm" disabled></div></div>'+
    '<div class="prop"><div class="row">'+
      '<button class="tb" id="msCls">Largeur de classe</button>'+
      '<button class="tb" id="msDel">Supprimer</button></div></div>';
  $("msL").onchange=()=>{
    const v=$("msL").value;
    if(v==="")return;
    push();list.forEach(t=>t.l=+v);touch();refreshPanels();draw();
  };
  $("msW").onchange=()=>{
    push();
    const w=Math.max(0.05,parseFloat($("msW").value)||0.3);
    list.forEach(t=>t.w=w);
    touch();refreshPanels();draw();
  };
  $("msCls").onclick=()=>{
    push();list.forEach(t=>t.w=classOf(t.net).w);touch();refreshPanels();draw();
  };
  $("msDel").onclick=deleteSel;
}
function propsVia(box,v){
  box.innerHTML=
    '<div class="prop two">'+numProp("vD","Diamètre",v.d,0.05,0.2)+
      numProp("vDr","Perçage",v.drill,0.05,0.1)+'</div>'+
    '<div class="prop two"><div><label>De la couche</label><select id="vA">'+
      S.cuL.map((L,i)=>'<option value="'+i+'"'+(v.a===i?" selected":"")+'>'+cuId(i,S.cu)+'</option>').join("")+
      '</select></div><div><label>À la couche</label><select id="vB">'+
      S.cuL.map((L,i)=>'<option value="'+i+'"'+(v.b===i?" selected":"")+'>'+cuId(i,S.cu)+'</option>').join("")+
      '</select></div></div>'+
    '<div class="prop"><label>Net</label><select id="vN"><option value="">— libre —</option>'+
      netTable().map(n=>'<option'+(n.name===v.net?" selected":"")+'>'+esc(n.name)+'</option>').join("")+
      '</select></div>'+
    '<div class="empty" style="padding:6px 12px">'+
      (v.a===0&&v.b===S.cu-1?"Via traversant.":"Via borgne ou enterré : "+
      cuId(v.a,S.cu)+" → "+cuId(v.b,S.cu)+".")+'</div>';
  const f=()=>{
    push();
    const cl=classOf(v.net);
    v.d=Math.max(0.2,parseFloat($("vD").value)||cl.via);
    v.drill=Math.min(v.d-0.1,Math.max(0.1,parseFloat($("vDr").value)||cl.drill));
    v.a=+$("vA").value;v.b=+$("vB").value;
    if(v.a>v.b){const k=v.a;v.a=v.b;v.b=k;}
    if(v.a===v.b)v.b=Math.min(S.cu-1,v.a+1);
    v.net=$("vN").value;
    touch();refreshPanels();draw();
  };
  ["vD","vDr","vA","vB","vN"].forEach(id=>$(id).onchange=f);
}

/* ---------- liste de droite ---------- */
function buildList(){
  const box=$("list");
  $("unroutedWrap").style.display=S.listTab==="nets"?"":"none";
  if(S.listTab==="comps")return listComps(box);
  if(S.listTab==="drc")return listDrc(box);
  listNets(box);
}
function listNets(box){
  const c=conn(), rows=netTable();
  let h='<table class="bom"><thead><tr><th>Net</th><th>Classe</th><th>État</th></tr></thead><tbody>';
  let n=0;
  for(const r of rows){
    const info=c.nets.get(r.name);
    const miss=info?info.miss:0;
    if(S.onlyUnrouted&&!miss)continue;
    n++;
    const cl=classOf(r.name);
    h+='<tr data-net="'+esc(r.name)+'"'+(S.hlNet===r.name?' class="on"':"")+'>'+
       '<td class="net"><span class="dot" style="background:'+r.color+'"></span>'+esc(r.name)+
       '<span class="pkgcell">'+(info?info.pads.length:r.nodes.length)+' broches · '+
       fmt(cl.w,2)+' mm</span></td>'+
       '<td><select class="netcls" data-net="'+esc(r.name)+'">'+
       S.classes.map(x=>'<option'+(x.name===cl.name?" selected":"")+'>'+esc(x.name)+
         '</option>').join("")+'</select></td>'+
       '<td class="v '+(miss?"warn":"ok")+'">'+(miss?miss+" à router":"routé")+'</td></tr>';
  }
  h+='</tbody></table>';
  box.innerHTML=n?h:'<div class="empty">Aucun net à afficher. Importez la netlist de l\'éditeur schématique.</div>';
  box.querySelectorAll("tr[data-net]").forEach(tr=>{
    tr.onclick=ev=>{
      if(ev.target.tagName==="SELECT")return;
      const nm=tr.dataset.net;
      S.hlNet=S.hlNet===nm?null:nm;
      buildList();draw();
    };
  });
  box.querySelectorAll("select.netcls").forEach(sel=>{
    sel.onchange=()=>{
      push();setNetClass(sel.dataset.net,sel.value);
      touch();zoneCache.clear();buildRules();buildList();draw();
      hint("Net "+sel.dataset.net+" rattaché à la classe "+sel.value+
           " — « Appliquer au routage » recale les pistes déjà posées.");
    };
    sel.onclick=ev=>ev.stopPropagation();
  });
}
function listComps(box){
  if(!S.fps.length){box.innerHTML='<div class="empty">Aucune empreinte.</div>';return;}
  const rows=S.fps.slice().sort((a,b)=>
    String(a.ref).localeCompare(String(b.ref),"fr",{numeric:true}));
  let h='<table class="bom"><thead><tr><th>Repère</th><th>Composant</th><th>Br.</th></tr></thead><tbody>';
  for(const fp of rows)
    h+='<tr data-id="'+fp.id+'"'+(S.sel.fps.has(fp.id)?' class="on"':"")+'>'+
       '<td class="r">'+esc(fp.ref)+'</td><td>'+esc(fp.value||"—")+
       (fp.pkg?'<span class="pkgcell">'+esc(fp.pkg)+'</span>':"")+'</td>'+
       '<td class="n">'+fp.pins+(fp.side?" ⤵":"")+'</td></tr>';
  box.innerHTML=h+'</tbody></table>';
  box.querySelectorAll("tr[data-id]").forEach(tr=>{
    tr.onclick=()=>{
      clearSel();S.sel.fps.add(+tr.dataset.id);
      const fp=fpById(+tr.dataset.id);
      if(fp)center(fp.x,fp.y);
      refreshPanels();draw();
    };
  });
}
function listDrc(box){
  if(!S.drcRun){
    box.innerHTML='<div class="empty">Contrôle non lancé. Le bouton « Contrôle DRC » vérifie isolations, largeurs, débordements et liaisons manquantes.</div>';
    return;
  }
  if(!S.drc.length){box.innerHTML='<div class="empty ok">Aucune erreur détectée.</div>';return;}
  let h='<table class="bom"><tbody>';
  S.drc.forEach((e,i)=>{
    h+='<tr data-i="'+i+'"><td class="'+(e.info?"":"warn")+'">'+esc(e.msg)+
       '<span class="pkgcell">'+fmt(ux(e.x),1)+" ; "+fmt(uy(e.y),1)+" mm · "+cuId(e.l||0,S.cu)+'</span></td></tr>';
  });
  box.innerHTML=h+'</tbody></table>';
  box.querySelectorAll("tr[data-i]").forEach(tr=>{
    tr.onclick=()=>{const e=S.drc[+tr.dataset.i];center(e.x,e.y);};
  });
}
function center(x,y){
  S.ox=cv.clientWidth/2-mirX(x)*S.scale;
  S.oy=cv.clientHeight/2-y*S.scale;
  draw();
}

