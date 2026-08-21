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
       '<i class="dot" style="background:'+esc(L.color)+'"></i>'+
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
       '<i class="sw" style="background:'+esc(L.color)+'"></i>'+
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
  box.innerHTML=
    '<div class="prop"><label>Nom de la couche</label>'+
      '<input id="laName" value="'+esc(L.name)+'"></div>'+
    '<div class="prop two"><div><label>Couleur</label>'+
      '<input id="laCol" type="color" value="'+esc(L.color)+'" style="padding:2px;height:30px"></div>'+
      '<div><label>Zones posées</label><input value="'+n+'" disabled></div></div>';
  const nm=$("laName");
  if(nm)nm.onchange=()=>{L.name=nm.value.trim()||cuLabel(S.active,S.cu);L.custom=true;
    buildLayers();buildTabs();};
  const col=$("laCol");
  if(col)col.oninput=()=>{L.color=col.value;L.custom=true;touch();buildLayers();buildTabs();draw();};
  zoneMenuSync();
}
/* ==========================================================================
   Menu du bouton « Zone cuivre »
   Tout ce qui fabrique du cuivre plein sur la couche active vit ici : le rôle
   de la couche, le net de son plan et les deux façons de poser une zone.
   L'empilage, lui, ne décrit que les couches.
   ========================================================================== */
function zoneMenuBuild(){
  let m=$("zoneMenu");
  if(!m){m=document.createElement("div");m.id="zoneMenu";document.body.appendChild(m);}
  const L=S.cuL[S.active], nets=netTable(), role=layerRole(S.active);
  m.innerHTML=
    '<div class="mtitle">Couche active · '+cuId(S.active,S.cu)+' · '+esc(L.name)+'</div>'+
    '<div class="prop"><label>Rôle de la couche</label><select id="zmRole">'+
      Object.keys(CU_ROLES).map(k=>'<option value="'+k+'"'+(k===role?" selected":"")+
        '>'+esc(CU_ROLES[k])+'</option>').join("")+'</select></div>'+
    (rolePlane(role)?'<div class="prop"><label>Net du plan</label><select id="zmNet">'+
      '<option value="">— aucun —</option>'+
      nets.map(x=>'<option'+(x.name===L.net?" selected":"")+'>'+esc(x.name)+'</option>').join("")+
      '</select></div>':"")+
    '<div class="prop"><div class="row">'+
      '<button class="tb" id="zmZone">Zone à main levée <kbd>Z</kbd></button></div>'+
      '<div class="row"><button class="tb" id="zmFull">Zone pleine carte (libre)</button></div></div>';
  const rl=$("zmRole");
  if(rl)rl.onchange=()=>{
    const r=rl.value;
    push();
    if(!setLayerRole(S.active,r))return;
    buildLayers();buildTabs();refreshPanels();draw();
    hint(rolePlane(r)
      ? CU_ROLES[r]+" sur "+cuId(S.active,S.cu)+" ("+(L.net||"aucun net")+
        ") : la zone pleine carte suit le contour. Déformer ses sommets la rend libre."
      : "Couche repassée en « "+CU_ROLES[r].toLowerCase()+
        " » : son plan pleine carte est retiré.");
  };
  const nt=$("zmNet");
  if(nt)nt.onchange=()=>{push();setLayerRole(S.active,layerRole(S.active),nt.value);
    buildLayers();buildTabs();refreshPanels();draw();};
  const z=$("zmZone");
  if(z)z.onclick=()=>{setMode("zone");zoneMenuClose();};
  const f=$("zmFull");
  if(f)f.onclick=()=>{zoneMenuClose();fullBoardZone();};
  return m;
}
function zoneMenuOpen(){
  const m=zoneMenuBuild(), b=$("mZone"), r=b.getBoundingClientRect?b.getBoundingClientRect():null;
  m.classList.add("on");
  if(!r)return;
  const w=m.offsetWidth||250, hg=m.offsetHeight||220;
  m.style.left=Math.max(6,Math.min(innerWidth-w-6,r.left))+"px";
  m.style.top=Math.max(6,Math.min(innerHeight-hg-6,r.bottom+5))+"px";
}
function zoneMenuClose(){
  const m=$("zoneMenu");if(m)m.classList.remove("on");
}
function zoneMenuToggle(){
  const m=$("zoneMenu");
  if(m&&m.classList.contains("on"))zoneMenuClose();else zoneMenuOpen();
}
/* Le menu reste vivant : couche active, nets et rôle changent sous lui. */
function zoneMenuSync(){
  const m=$("zoneMenu");
  if(m&&m.classList.contains("on"))zoneMenuBuild().classList.add("on");
}
/* `val` vient souvent du document chargé : un fichier trafiqué pourrait y
   glisser autre chose qu'un nombre, d'où l'échappement. */
function numProp(id,label,val,step,min,off){
  return '<div><label>'+esc(label)+'</label><input id="'+esc(id)+'" type="number" step="'+
    (step||0.05)+'" min="'+(min==null?0:min)+'" value="'+esc(val)+'"'+
    (off?" disabled":"")+'></div>';
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
      GRID_STEPS.map(g=>
        '<option value="'+g+'"'+(g===S.grid?" selected":"")+'>'+g+'</option>').join("")+
      '</select></div>'+
      /* l'angle imposé aux pistes tracées : 45° par défaut, c'est la règle de
         l'art — « / » bascule l'arrangement du coude pendant le tracé */
      '<div><label title="Angle imposé aux pistes tracées. Pendant le tracé, '+
      '« / » bascule l’arrangement du coude.">Angle des pistes</label>'+
      '<select id="rCorner">'+
      Object.keys(CORNER_MODES).map(k=>
        '<option value="'+k+'"'+(k===cornerMode()?" selected":"")+'>'+
        esc(CORNER_MODES[k])+'</option>').join("")+
      '</select></div></div>'+
    '<div class="prop two">'+numProp("bW","Carte L (mm)",S.board.w,1,1)+
      numProp("bH","Carte H (mm)",S.board.h,1,1)+'</div>'+
    '<div class="prop">'+numProp("rMask","Masque ±",S.rule.mask,0.01)+'</div>'+
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
      '<div><label>Vias</label><input value="'+esc(VIA_FINISH[S.rule.viaFinish])+
      '" disabled title="Le traitement des vias se règle dans le panneau '+
      'Empilage physique."></div></div>';

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
  $("rGrid").onchange=()=>setGridStep($("rGrid").value);
  $("rCorner").onchange=()=>setCornerMode($("rCorner").value);
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
/* ==========================================================================
   Panneau « Empilage physique »
   Le panneau « Empilage » dit quelles couches de cuivre existent ; celui-ci dit
   quelle carte le fabricant doit presser. La coupe se lit en tableau, du dessus
   vers le dessous, avec le vocabulaire des fabricants : nom, matière, rôle,
   poids du cuivre, épaisseur, Dk, Df. La ligne choisie s'édite juste en
   dessous — même principe que « Couche active » dans l'empilage logique.
   ========================================================================== */
let _stkSel={kind:"cu",i:0};        // ligne de la coupe en cours d'édition

/* Choisir une ligne de la coupe. Le clic passe par ici, et le banc d'essai
   aussi : son DOM minimal ne construit pas les lignes qu'on cliquerait. */
function stkPick(kind,i){_stkSel={kind:kind,i:i};buildStackup();}
/* titre de l'éditeur : la ligne, nommée comme on la désigne à l'oral */
function stkName(r){
  if(r.kind==="silk")return "Sérigraphie · "+(r.i?"dessous":"dessus");
  if(r.kind==="mask")return "Masque · "+(r.i?"dessous":"dessus");
  if(r.kind==="cu")
    return (S.cuL[r.i]?S.cuL[r.i].name:cuLabel(r.i,S.cu))+" · "+cuId(r.i,S.cu);
  const d=diAt(r.i);
  return "Diélectrique "+(r.i+1)+" · "+DI_KIND[d.k];
}
function stkColor(r){
  if(r.kind==="silk")return r.i?C_SILK_B:C_SILK_T;
  if(r.kind==="mask")return C_MASK;
  if(r.kind==="cu")return layerColor(r.i);
  const k=diAt(r.i).k;
  return k==="core"?"#4a6f57":(k==="prepreg"?"#5d8a6d":"#6b7280");
}
/* habillage d'une ligne de cuivre : son rôle se voit à la teinte */
function roleCls(i){
  const r=layerRole(i);
  return "cu"+(r==="signal"||r==="mixed"?"":" "+r);
}
/* Une ligne du tableau, colonne par colonne. */
function stkCells(r){
  const st=S.stack, tr="—";
  if(r.kind==="silk")
    return {cls:"tech",num:"",name:"Sérigraphie "+(r.i?"dessous":"dessus"),
            mat:"Encre "+st.silkColor,type:"Sérigraphie",
            w:tr,th:tr,dk:tr,df:tr};
  if(r.kind==="mask")
    return {cls:"tech",num:"",name:"Masque "+(r.i?"dessous":"dessus"),
            mat:"Vernis "+st.maskColor,type:"Épargne",
            w:tr,th:fmt(st.maskT,3),dk:fmt(st.maskEr,2),df:tr};
  if(r.kind==="cu"){
    const L=S.cuL[r.i]||{}, t=cuT(r.i), rc=roleCheck(r.i);
    return {cls:roleCls(r.i)+(rc?" douteux":""),num:String(r.i+1),
            name:L.name||cuLabel(r.i,S.cu),mat:"Cuivre",
            type:roleLabel(r.i)+(rc?" ⚠":""),warn:rc?rc.msg+" — "+rc.hint:"",
            w:ozLabel(t),th:fmt(t,3),dk:tr,df:tr};
  }
  const d=diAt(r.i);
  return {cls:"di",num:"",name:"Diélectrique "+(r.i+1),mat:d.mat,
          type:DI_KIND[d.k],w:tr,th:fmt(d.t,3),dk:fmt(d.er,2),df:fmt(d.df,3)};
}
function buildStackup(){
  const box=$("stk");
  if(!box)return;
  const st=S.stack, rows=stackRows();

  /* ---------- la coupe ---------- */
  let h='<div class="stkwrap"><table class="stk"><thead><tr>'+
    '<th class="n">#</th><th>Nom</th><th>Matière</th><th>Rôle</th>'+
    '<th class="r">Poids</th><th class="r">Épaiss.</th>'+
    '<th class="r">Dk</th><th class="r">Df</th></tr></thead><tbody>';
  rows.forEach((r,k)=>{
    const c=stkCells(r), on=(r.kind===_stkSel.kind&&r.i===_stkSel.i);
    h+='<tr class="'+c.cls+(on?" on":"")+'" data-r="'+k+'" style="--sw:'+
       esc(stkColor(r))+'">'+
       '<td class="n">'+esc(c.num)+'</td>'+
       '<td class="nm">'+esc(c.name)+'</td>'+
       '<td class="mat">'+esc(c.mat)+'</td>'+
       '<td class="ty"'+(c.warn?' title="'+esc(c.warn)+'"':"")+'>'+
         esc(c.type)+'</td>'+
       '<td class="r">'+esc(c.w)+'</td>'+
       '<td class="r">'+esc(c.th)+'</td>'+
       '<td class="r">'+esc(c.dk)+'</td>'+
       '<td class="r">'+esc(c.df)+'</td></tr>';
  });
  h+='</tbody><tfoot><tr class="tot"><td class="n"></td>'+
     '<td colspan="4">Épaisseur totale · visée '+fmt(st.target,3)+' mm</td>'+
     '<td class="r">'+fmt(stackTotal(),3)+'</td>'+
     '<td class="r"></td><td class="r"></td></tr></tfoot></table></div>';

  /* ---------- la ligne choisie ---------- */
  const sel=rows.find(r=>r.kind===_stkSel.kind&&r.i===_stkSel.i)||rows[0];
  _stkSel={kind:sel.kind,i:sel.i};
  h+='<div class="cat">'+esc(stkName(sel))+'</div>';
  if(sel.kind==="cu"){
    /* le cuivre se commande au poids : on propose les épaisseurs courantes, et
       l'épaisseur en place si elle n'en est pas une */
    const t=cuT(sel.i), um=r3(t*1000), role=layerRole(sel.i), L=S.cuL[sel.i]||{};
    const list=CU_UM.indexOf(um)>=0?CU_UM:CU_UM.concat([um]).sort((a,b)=>a-b);
    h+='<div class="prop two"><div><label>Rôle de la couche</label><select id="skRole">'+
       Object.keys(CU_ROLES).map(k=>'<option value="'+k+'"'+(k===role?" selected":"")+'>'+
         esc(CU_ROLES[k])+'</option>').join("")+'</select></div>'+
       '<div><label>Cuivre</label><select id="skT">'+
       list.map(u=>'<option value="'+u+'"'+(u===um?" selected":"")+'>'+u+' µm · '+
         esc(ozLabel(u/1000))+'</option>').join("")+
       '<option value="autre">autre…</option></select></div></div>';
    if(rolePlane(role)){
      h+='<div class="prop"><label>Net du plan</label><select id="skNet">'+
         '<option value="">— aucun —</option>'+
         netTable().map(n=>'<option'+(n.name===L.net?" selected":"")+'>'+esc(n.name)+
           '</option>').join("")+'</select></div>'+
         '<div class="stkinfo">Ce rôle entretient une zone de cuivre pleine carte '+
         'sur la couche : elle suit le contour, relie les pastilles de son net et '+
         'sert de plan de référence aux couches voisines.</div>';
    }else{
      h+='<div class="stkinfo">'+
         (role==="mixed"
          ? "Couche de signal qui porte aussi du cuivre posé à la main : les zones "+
            "dessinées avec l'outil « Zone cuivre » y restent, sans plan pleine carte."
          : "Couche de signal. Choisir « Plan de masse » ou « Plan d'alimentation » "+
            "y pose une zone pleine carte et en fait un plan de référence.")+
         '</div>';
    }
    const rc=roleCheck(sel.i);
    if(rc)
      h+='<div class="stkinfo"><b class="warn">Rôle douteux</b> : '+esc(rc.msg)+
         '.<br>'+esc(rc.hint)+'</div>';
  }else if(sel.kind==="di"){
    const d=diAt(sel.i);
    h+='<div class="prop two"><div><label>Type</label><select id="skK">'+
       Object.keys(DI_KIND).map(k=>'<option value="'+k+'"'+(k===d.k?" selected":"")+'>'+
         esc(DI_KIND[k])+'</option>').join("")+'</select></div>'+
       numProp("skDT","Épaisseur (mm)",fmt(d.t,3),0.005,0.005)+'</div>'+
       '<div class="prop two">'+numProp("skEr","Dk (εr)",fmt(d.er,2),0.1,1)+
       numProp("skDf","Df (tan δ)",fmt(d.df,3),0.001,0)+'</div>'+
       '<div class="prop"><label>Matière</label>'+
       '<input id="skMat" value="'+esc(d.mat)+'"></div>';
  }else if(sel.kind==="mask"){
    h+='<div class="prop two">'+numProp("skMT","Épaisseur (mm/face)",fmt(st.maskT,3),0.005,0)+
       numProp("skMEr","Dk du vernis",fmt(st.maskEr,2),0.1,1)+'</div>'+
       '<div class="prop"><label>Couleur</label><select id="skMC">'+
       MASK_COLORS.map(c=>'<option'+(c===st.maskColor?" selected":"")+'>'+esc(c)+
         '</option>').join("")+'</select></div>'+
       '<div class="stkinfo">Les deux faces portent le même vernis : le modifier '+
       'ici vaut pour le dessus comme pour le dessous.</div>';
  }else{
    h+='<div class="prop"><label>Couleur de l\'encre</label><select id="skSC">'+
       SILK_COLORS.map(c=>'<option'+(c===st.silkColor?" selected":"")+'>'+esc(c)+
         '</option>').join("")+'</select></div>'+
       '<div class="stkinfo">La sérigraphie ne compte pas dans l\'épaisseur : '+
       'quelques micromètres d\'encre que personne ne facture en épaisseur.</div>';
  }

  /* ---------- synthèse ----------
     Trois chiffres et deux boutons, avec ce qu'ils veulent dire : c'est cette
     section qu'on relit avant de commander. */
  const tot=stackTotal(), ecart=r3(tot-st.target), asp=worstAspect();
  const asym=stackAsym(), sym=!asym.length, hors=Math.abs(ecart)>0.02;
  const vc=viaCensus();
  h+='<div class="cat">Synthèse — bon pour commande ?</div>'+
     '<div class="prop two">'+numProp("skTarget","Épaisseur visée",fmt(st.target,3),0.05,0.05)+
       '<div><label>Obtenue</label><input value="'+fmt(tot,3)+' mm" disabled></div></div>'+
     '<div class="prop two"><div><label>Stratifié nu</label>'+
       '<input value="'+fmt(stackLam(),3)+' mm" disabled></div>'+
       '<div><label>Cuivre total</label><input value="'+fmt(stackCuT(),3)+
       ' mm" disabled></div></div>'+
     '<div class="stkinfo">'+
       'Écart à la cible <b class="'+(hors?"warn":"ok")+'">'+
       (ecart>0?"+":"")+fmt(ecart,3)+' mm</b> — '+
       (hors?'« Répartir » met les diélectriques à l\'échelle pour tomber juste, '+
             'sans toucher au cuivre.'
           :'l\'empilage tient l\'épaisseur commandée.')+'<br>'+
       'Symétrie <b class="'+(sym?"ok":"warn")+'">'+
       (sym?'empilage symétrique</b> — rien à corriger.'
          :'asymétrique</b> — une carte dissymétrique se voile à la cuisson ; '+
           '« Symétriser » égalise les couches deux à deux.<br>'+
           asym.map(x=>'&nbsp;&nbsp;· '+esc(asymLabel(x))).join('<br>'))+'<br>'+
       'Rapport d\'aspect '+
       (asp?'<b class="'+(asp.ratio>8?"warn":"ok")+'">'+fmt(asp.ratio,1)+' : 1</b> — '+
            fmt(asp.len,2)+' mm à percer pour '+fmt(asp.drill,2)+' mm de diamètre'+
            (asp.ratio>8?', au-delà de 8 : 1 la métallisation du trou se paie.':'.')
          :'<b>—</b> — il apparaîtra dès qu\'un via ou une pastille traversante '+
           'sera posé : c\'est la longueur percée divisée par le diamètre du '+
           'perçage.')+
       (S.vias.length?'<br>Vias <b>'+vc.through+'</b> traversant(s), <b>'+vc.blind+
          '</b> borgne(s), <b>'+vc.buried+'</b> enterré(s)'+
          (vc.seq?' — dont <b class="warn">'+vc.seq+'</b> hors d\'un pressage '+
                  'unique : le contrôle DRC dit lesquels et pourquoi.':'.')
        :'')+
     '</div>'+
     '<div class="prop"><div class="row">'+
       '<button class="tb" id="skFit"'+(hors?"":" disabled")+' title="'+
         (hors?"Met les diélectriques à l\'échelle pour atteindre l\'épaisseur visée."
             :"L\'épaisseur obtenue est déjà celle visée.")+'">Répartir sur la cible</button>'+
       '<button class="tb" id="skSym"'+(sym?" disabled":"")+' title="'+
         (sym?"L\'empilage est déjà symétrique."
            :"Donne à chaque couche la moyenne de sa jumelle, de part et d\'autre du milieu.")+
         '">Symétriser</button></div>'+
       '<div class="row"><button class="tb" id="skReport" title="Enregistre la coupe, '+
       'les matières et les rôles dans un fichier texte, à joindre à une '+
       'commande. Il est déjà dans l\'archive de fabrication sous EMPILAGE.txt.">'+
       'Exporter la feuille .txt</button></div></div>'+
     '<div class="cat">Finition</div>'+
     '<div class="prop"><label>Finition du cuivre</label><select id="skFin">'+
       FINISHES.map(f=>'<option'+(f===st.finish?" selected":"")+'>'+esc(f)+
         '</option>').join("")+'</select></div>'+
     '<div class="prop"><label>Traitement des vias</label><select id="skVia">'+
       Object.keys(VIA_FINISH).map(k=>'<option value="'+k+'"'+
         (k===S.rule.viaFinish?" selected":"")+'>'+esc(VIA_FINISH[k])+
         '</option>').join("")+'</select></div>'+
     '<div class="stkinfo">'+
       (S.rule.viaFinish==="open"
        ? 'Vias laissés nus : le masque s\'ouvre dessus. À éviter sous un '+
          'composant, la soudure part dans le trou.'
        : (S.rule.viaFinish==="filled"
           ? 'Bouchés puis plaqués : c\'est ce qui permet de poser une pastille '+
             'sur le via, sous un BGA par exemple. C\'est aussi le plus cher.'
           : 'Le masque ne s\'ouvre pas sur les vias.'))+
     '</div>';

  box.innerHTML=h;

  /* ---------- modèles d'usine ---------- */
  const pre=$("stkPreset");
  if(pre){
    const list=presetsFor(S.cu);
    pre.innerHTML='<option value="">— choisir —</option>'+
      list.map((p,i)=>'<option value="'+i+'">'+esc(p.name)+'</option>').join("");
    pre.value="";
    pre.onchange=()=>{
      const p=list[+pre.value];
      pre.value="";
      if(!p)return;
      push();applyPreset(p);touch();buildStackup();
      hint("Empilage physique : modèle « "+p.name+" » appliqué.");
    };
  }

  /* ---------- écouteurs ---------- */
  box.querySelectorAll("tr[data-r]").forEach(el=>{
    el.onclick=()=>{
      const r=rows[+el.dataset.r];
      if(r)stkPick(r.kind,r.i);
    };
  });
  /* le document change : on passe par push() pour rester annulable */
  const bind=(id,fn)=>{
    const el=$(id);
    if(el)el.onchange=()=>{
      const v=parseFloat(el.value);
      if(!Number.isFinite(v)){buildStackup();return;}
      push();fn(v);touch();buildStackup();
    };
  };
  const pick=(id,fn)=>{
    const el=$(id);
    if(el)el.onchange=()=>{push();fn(el.value);touch();buildStackup();};
  };
  /* changer le rôle d'une couche pose ou retire du cuivre : tout l'écran suit */
  const roleDone=msg=>{
    touch();buildLayers();buildTabs();refreshPanels();draw();
    if(msg)hint(msg);
  };
  if(_stkSel.kind==="cu"){
    const el=$("skT");
    if(el)el.onchange=()=>{
      const v=parseFloat(el.value==="autre"
        ? prompt("Épaisseur du cuivre, en micromètres :",fmt(cuT(_stkSel.i)*1000,1))
        : el.value);
      if(!Number.isFinite(v)){buildStackup();return;}
      push();st.cu[_stkSel.i].t=r4(clamp(v,1,2000)/1000);touch();buildStackup();
    };
    const rl=$("skRole");
    if(rl)rl.onchange=()=>{
      const i=_stkSel.i, r=rl.value;
      push();
      if(!setLayerRole(i,r)){buildStackup();return;}
      roleDone(cuId(i,S.cu)+" : "+CU_ROLES[r]+
        (rolePlane(r)?" sur "+(S.cuL[i].net||"aucun net")+
          ". La zone pleine carte suit le contour.":"."));
    };
    const nt=$("skNet");
    if(nt)nt.onchange=()=>{
      const i=_stkSel.i;
      push();setLayerRole(i,layerRole(i),nt.value);
      roleDone(cuId(i,S.cu)+" : plan sur "+(S.cuL[i].net||"aucun net")+".");
    };
  }
  if(_stkSel.kind==="di"){
    const d=st.di[_stkSel.i];
    bind("skDT",v=>{d.t=r4(clamp(v,0.005,20));});
    bind("skEr",v=>{d.er=clamp(v,1,30);});
    bind("skDf",v=>{d.df=clamp(v,0,1);});
    pick("skK",v=>{d.k=DI_KIND[v]?v:d.k;});
    const mt=$("skMat");
    if(mt)mt.onchange=()=>{
      push();d.mat=mt.value.slice(0,40).trim()||"FR-4";touch();buildStackup();
    };
  }
  if(_stkSel.kind==="mask"){
    bind("skMT",v=>{st.maskT=r4(clamp(v,0,1));});
    bind("skMEr",v=>{st.maskEr=clamp(v,1,20);});
  }
  bind("skTarget",v=>{st.target=clamp(v,0.05,50);});
  pick("skFin",v=>{if(FINISHES.indexOf(v)>=0)st.finish=v;});
  /* le traitement des vias change le masque : il faut redessiner */
  const vfs=$("skVia");
  if(vfs)vfs.onchange=()=>{
    const v=vfs.value;
    if(!VIA_FINISH[v]){buildStackup();return;}
    push();S.rule.viaFinish=v;touch();buildStackup();draw();
    hint("Vias : "+VIA_FINISH[v].toLowerCase()+".");
  };
  pick("skMC",v=>{if(MASK_COLORS.indexOf(v)>=0)st.maskColor=v;});
  pick("skSC",v=>{if(SILK_COLORS.indexOf(v)>=0)st.silkColor=v;});
  const fit=$("skFit");
  if(fit&&hors)fit.onclick=()=>{
    push();
    const done=stackFit();
    touch();buildStackup();
    hint(done?"Diélectriques répartis : la carte tombe sur "+fmt(stackTotal(),3)+" mm."
             :"Cible inatteignable : le cuivre et le masque en occupent déjà autant.");
  };
  const symb=$("skSym");
  if(symb&&!sym)symb.onclick=()=>{
    push();stackMirror();touch();buildStackup();
    hint("Empilage symétrisé : chaque couche prend la moyenne de sa jumelle.");
  };
  const rep=$("skReport");
  if(rep)rep.onclick=()=>{
    dl(new Blob([stackReport()],{type:"text/plain"}),"empilage.txt");
    hint("Feuille d'empilage enregistrée dans empilage.txt.");
  };
}
/* buildStackup() suit le mouvement : les rôles de couche et les zones changent
   sous lui, et la coupe les montre. */
function refreshPanels(){buildProps();buildList();buildTabs();buildStackup();}

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
    /* Le cuivre routé de la sélection se retire à part : c'est le geste qu'on
       fait avant de replacer un boîtier, et un lasso ne sait pas le distinguer.
       Le bouton ne paraît que s'il y a quelque chose à dérouter. */
    const cu=tr.length+vi.length;
    box.innerHTML='<div class="empty">'+fps.length+' empreinte(s), '+tr.length+
      ' segment(s), '+vi.length+' via(s), '+zo.length+
      ' zone(s) sélectionnés.<br>R pivote · F retourne · Suppr supprime.</div>'+
      (cu?'<div class="prop"><div class="row"><button class="tb" id="pUnroute">'+
          'Dérouter '+(tr.length?tr.length+' segment'+(tr.length>1?'s':''):'')+
          (tr.length&&vi.length?' et ':'')+
          (vi.length?vi.length+' via'+(vi.length>1?'s':''):'')+' <kbd>U</kbd>'+
          '</button></div>'+
          '<div class="empty" style="padding:6px 12px">Les empreintes restent en '+
          'place et sélectionnées : de quoi les replacer avant de router autrement. '+
          'Les zones de cuivre ne sont pas du routage, elles ne partent pas.</div></div>'
        :"");
    const pu=$("pUnroute");
    if(pu)pu.onclick=unrouteSel;
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
/* Ce que le nom du boîtier a décidé — ou pourquoi il n'a rien décidé. Le
   schématique laisse saisir n'importe quel nom : autant dire lequel est
   compris, et laisser reposer l'empreinte d'un clic quand les cotes ont été
   retouchées puis regrettées. */
function pkgNote(fp){
  /* Empreinte dessinée à la main : les cotes ne commandent plus, et le nom du
     boîtier n'est plus qu'une étiquette de nomenclature. Le dire ici évite de
     chercher pourquoi « pas 1,27 » ne déplace rien. */
  if(fpFree(fp))
    return '<div class="empty" style="padding:4px 12px 8px">Empreinte dessinée '+
      'à la main : '+padsOf(fp).length+' pastille(s) placées une à une. '+
      (fp.pkg?esc(fp.pkg)+' ne sert plus qu&rsquo;à la nomenclature. ':"")+
      'Les cotes ci-dessous ne commandent plus rien.</div>';
  if(!fp.pkg)
    return '<div class="empty" style="padding:4px 12px 8px">Sans boîtier, '+
      'l&rsquo;empreinte se déduit du nombre de broches.</div>';
  const g=pkgGeom(fp.pkg,fpWiredPins(fp));
  if(!g)
    return '<div class="empty" style="padding:4px 12px 8px">Boîtier hors table : '+
      'l&rsquo;empreinte reste celle réglée ici.</div>';
  const same=fp.style===g.style&&fp.pins===g.pins&&
             Math.abs(fp.pitch-g.pitch)<1e-6&&Math.abs(fp.span-g.span)<1e-6;
  /* Le bouton ne paraît que si les cotes en place ne sont plus celles du
     boîtier : il n'y a rien à reposer autrement. Un bouton, et non un lien —
     le bleu du navigateur ne se lisait pas sur ce fond, et cliquer là fait
     bien quelque chose à la carte. */
  return '<div class="empty" style="padding:4px 12px 8px">'+esc(fp.pkg)+' : '+
    esc(STYLES[g.style].n)+', '+g.pins+' broches, pas '+fmt(g.pitch,2)+' mm'+
    (g.style==="bga"?"":", écartement "+fmt(g.span,2)+" mm")+'.'+
    (same?"":'<br>Les cotes en place ne sont plus celles-là.'+
      '<div class="row"><button class="tb" id="pPkgApply">'+
      'Reposer l&rsquo;empreinte sur le boîtier</button></div>')+
    '</div>';
}
function propsFp(box,fp){
  const ps=padsOf(fp);
  const free=!!fpFree(fp), dis=free?" disabled":"";
  let h='<div class="prop"><label>Repère</label><input id="pRef" value="'+esc(fp.ref)+'"></div>'+
    '<div class="prop two"><div><label>Valeur</label><input id="pVal" value="'+esc(fp.value||"")+'"></div>'+
    '<div><label>Boîtier</label><input id="pPkg" value="'+esc(fp.pkg||"")+'"></div></div>'+
    pkgNote(fp)+
    '<div class="prop"><label>Empreinte générique</label><select id="pStyle"'+dis+'>'+
    Object.keys(STYLES).map(k=>'<option value="'+esc(k)+'"'+(fp.style===k?" selected":"")+'>'+
      esc(STYLES[k].n)+'</option>').join("")+'</select></div>'+
    '<div class="prop"><div class="row" style="margin-top:0">'+
      '<button class="tb" id="pFpEd">Modifier l&rsquo;empreinte…</button>'+
      (free?'<button class="tb" id="pFpGen">Revenir au générique</button>':"")+
    '</div></div>'+
    '<div class="prop two">'+numProp("pPins","Broches",fp.pins,1,1)+
      numProp("pPitch","Pas (mm)",fp.pitch,0.01,0.2,free)+'</div>'+
    '<div class="prop two">'+numProp("pSpan","Écartement",fp.span,0.01,0.2,free)+
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
    h+='<tr data-net="'+esc(q.net||"")+'"'+(q.net&&S.hlNet===q.net?' class="on"':"")+
       '><td class="r">'+esc(q.n)+'</td>'+
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
  /* le boîtier nommé commande l'empreinte, ici comme à l'import de la netlist :
     saisir « SOIC-8 » repose les pastilles, un nom hors table ne touche à rien */
  upd("pPkg",v=>{fp.pkg=v.trim();applyPkgGeom(fp);});
  /* Changer de style à la main, c'est quitter le boîtier : les cotes de
     pastille qu'il avait posées ne décrivent plus rien, on les oublie. */
  upd("pStyle",v=>{fp.style=v;const g=defaultGeom(v);fp.pitch=g.pitch;fp.span=g.span;
                   fpClearGeom(fp);});
  upd("pPins",v=>fpSetPins(fp,v),true);
  upd("pPitch",v=>fp.pitch=Math.max(0.2,v),true);
  upd("pSpan",v=>fp.span=Math.max(0.2,v),true);
  upd("pSide",v=>fp.side=+v,true);
  upd("pX",v=>fp.x=wxu(v),true);
  upd("pY",v=>fp.y=wyu(v),true);
  upd("pRot",v=>fp.rot=+v,true);
  const ap=$("pPkgApply");
  if(ap)ap.onclick=e=>{
    e.preventDefault();
    push();applyPkgGeom(fp);touch();refreshPanels();draw();
    hint("Empreinte reposée sur le boîtier "+fp.pkg+".");
  };
  const fe=$("pFpEd");
  if(fe)fe.onclick=()=>feOpen(fp);
  const fg=$("pFpGen");
  if(fg)fg.onclick=()=>{
    if(!confirm("Revenir à l'empreinte calculée ? Les pastilles placées à la "+
                "main seront perdues (Ctrl+Z les rendra)."))return;
    push();fpGeneric(fp);touch();refreshPanels();draw();
    hint("Empreinte "+fp.ref+" rendue au calcul automatique.");
  };
  box.querySelectorAll("tr[data-net]").forEach(tr=>{
    tr.onclick=()=>{
      const n=tr.dataset.net;
      S.hlNet=(n&&S.hlNet!==n)?n:null;
      buildProps();buildList();revealNet(S.hlNet);draw();
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
      'Tirez une extrémité pour la déplacer · Alt+glisser la détache du coude · '+
      'Alt+clic sur le segment y insère un point.</div>'+
    '<div class="prop"><div class="row">'+
      '<button class="tb" id="tMit">Angle droit → 45° (D)</button></div>'+
      '<div class="row">'+
      '<button class="tb" id="tAll">Largeur au net</button>'+
      '<button class="tb" id="tCls">Largeur de classe</button></div>'+
      '<div class="row"><button class="tb" id="tSel">Sélectionner le net ('+g.tracks.length+')</button>'+
      '<button class="tb" id="tDel">Dérouter le net</button></div></div>';
  $("tMit").onclick=mitreSel;
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
      '<button class="tb" id="msMit">Angle droit → 45° (D)</button></div>'+
      '<div class="row">'+
      '<button class="tb" id="msCls">Largeur de classe</button>'+
      '<button class="tb" id="msDel">Supprimer</button></div></div>';
  $("msMit").onclick=mitreSel;
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
    /* l'empilage physique donne la longueur réellement percée : un via borgne
       s'arrête en route, et c'est elle qui décide du rapport d'aspect */
    '<div class="empty" style="padding:6px 12px">'+
      (v.a===0&&v.b===S.cu-1?"Via traversant.":"Via borgne ou enterré : "+
      cuId(v.a,S.cu)+" → "+cuId(v.b,S.cu)+".")+
      " Perçage de "+fmt(stackSpan(v.a,v.b),3)+" mm de long, rapport d'aspect "+
      fmt(stackSpan(v.a,v.b)/Math.max(0.01,v.drill),1)+" : 1"+
      (stackSpan(v.a,v.b)/Math.max(0.01,v.drill)>8
        ? " — au-delà de 8 : 1, à valider avec le fabricant." : ".")+'</div>';
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
    if(S.onlyUnrouted&&!miss&&r.name!==S.hlNet)continue;
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
/* Amène un net sous les yeux dans le panneau « Nets & composants » : c'est le
   pendant du clic sur la liste, pour les clics venus du canevas ou de la table
   des broches. On repasse sur l'onglet Nets s'il avait été quitté, puis on fait
   défiler la ligne si elle est hors cadre — jamais autrement, pour ne pas
   secouer la liste sous la souris. */
function revealNet(net){
  if(!net)return;
  if(S.listTab!=="nets"){
    S.listTab="nets";
    for(const [id,t] of [["tabNets","nets"],["tabComps","comps"],["tabDrc","drc"]]){
      const b=$(id);
      if(b)b.classList.toggle("on",t==="nets");
    }
    buildList();
  }
  const box=$("list");
  if(!box)return;
  let row=null;
  box.querySelectorAll("tr[data-net]").forEach(tr=>{if(tr.dataset.net===net)row=tr;});
  if(!row)return;
  const r=row.getBoundingClientRect(), b=box.getBoundingClientRect();
  if(r.top<b.top||r.bottom>b.bottom)
    box.scrollTop+=(r.top-b.top)-(b.height-r.height)/2;
}
function listComps(box){
  if(!S.fps.length){box.innerHTML='<div class="empty">Aucune empreinte.</div>';return;}
  const rows=S.fps.slice().sort((a,b)=>
    String(a.ref).localeCompare(String(b.ref),"fr",{numeric:true}));
  let h='<table class="bom"><thead><tr><th>Repère</th><th>Composant</th><th>Br.</th></tr></thead><tbody>';
  for(const fp of rows)
    h+='<tr data-id="'+esc(fp.id)+'"'+(S.sel.fps.has(fp.id)?' class="on"':"")+'>'+
       '<td class="r">'+esc(fp.ref)+'</td><td>'+esc(fp.value||"—")+
       (fp.pkg?'<span class="pkgcell">'+esc(fp.pkg)+'</span>':"")+'</td>'+
       '<td class="n">'+esc(fp.pins)+(fp.side?" ⤵":"")+'</td></tr>';
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
    tr.onclick=()=>{
      const e=S.drc[+tr.dataset.i];
      /* une erreur qui désigne un objet le donne à voir : le via se sélectionne,
         la couche fautive devient la couche active */
      if(e.via&&S.vias.indexOf(e.via)>=0){
        clearSel();S.sel.vias.add(e.via);buildProps();
      }else if(e.layer!=null)routeToLayer(e.layer);
      center(e.x,e.y);
    };
  });
}
function center(x,y){
  S.ox=cv.clientWidth/2-mirX(x)*S.scale;
  S.oy=cv.clientHeight/2-y*S.scale;
  draw();
}

