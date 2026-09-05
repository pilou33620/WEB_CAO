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
       (L.plane||zn[i]
         ? '<span class="pl" data-zone="'+i+'" title="Sélectionner le cuivre plein de cette couche">'+
           (L.plane?"PLAN":zn[i])+'</span>'
         : "")+
       '<span class="tp">'+cuId(i,S.cu)+' · '+cnt[i]+'</span>'+
       '<span class="eye" data-eye="'+i+'">'+(L.vis?"◉":"○")+'</span></div>';
  }
  h+='<div class="cat">Couches techniques</div>';
  const tech=[["silkT","Sérigraphie dessus","F.SilkS"],["silkB","Sérigraphie dessous","B.SilkS"],
              ["maskT","Masque dessus","F.Mask"],["maskB","Masque dessous","B.Mask"],
              ["pasteT","Pâte dessus","F.Paste"],["pasteB","Pâte dessous","B.Paste"],
              ["edge","Contour de carte","Board Outline"],["plane","Zones de cuivre","Zones"],
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
      }else if(ev.target.dataset.zone!==undefined){
        // le pastillon « PLAN » est la poignée du plan : au milieu de la carte
        // il n'y a aucun bord à viser, ici il y en a un
        selectLayerZones(i);
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
      '<div class="row"><button class="tb" id="zmFull">Zone pleine carte (libre)</button></div>'+
      (S.zones.some(z=>z.l===S.active)
        ? '<div class="row"><button class="tb" id="zmSel">Sélectionner le cuivre de la couche</button></div>'
        : "")+'</div>';
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
  const sl=$("zmSel");
  if(sl)sl.onclick=()=>{zoneMenuClose();selectLayerZones(S.active);};
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
/* Les règles de conception ne vivent plus dans une colonne du dock : la
   fenêtre « Règles et contraintes » (`15-regles.js`) les tient toutes, avec
   leurs figures cotées. `numProp` reste ici — c'est le gabarit de champ commun
   à tous les panneaux, et cette fenêtre s'en sert aussi. */
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
function refreshPanels(){
  buildProps();buildList();buildTabs();buildStackup();
  if(typeof buildDiffPairs==="function")buildDiffPairs();
  /* Le panneau de simulation suit la même horloge que les autres : entre deux
     regards, on a routé, et surtout on a changé de sélection — c'est elle que
     la simulation d'impédance mesure. L'argument vrai lui dit de ne PAS
     redemander un dessin : `refreshPanels()` est presque toujours suivi d'un
     `draw()`, qui lira la nouvelle liste de segments de toute façon. Gardé par
     un `typeof` comme les autres appels vers un fichier chargé plus tard. */
  if(typeof simRafraichir==="function")simRafraichir(true);
}

function buildProps(){
  const box=$("props");
  const fps=[...S.sel.fps].map(fpById).filter(Boolean);
  const tr=[...S.sel.tracks], vi=[...S.sel.vias], zo=[...S.sel.zones];
  /* Les découpes comptent dans le total : sans cela une découpe prise avec une
     empreinte laissait croire que l'empreinte était seule sélectionnée. */
  const ct=[...S.sel.cuts];
  const dr=selDrawingsPcb();
  const only=n=>fps.length+tr.length+vi.length+zo.length+ct.length+dr.length===n;
  if(fps.length===1&&only(1))return propsFp(box,fps[0]);
  if(tr.length===1&&only(1))return propsTrack(box,tr[0]);
  if(vi.length===1&&only(1))return propsVia(box,vi[0]);
  if(S.sel.edge&&only(0))return propsBoard(box);
  if(zo.length===1&&only(1))return propsZone(box,zo[0]);
  if(dr.length===1&&only(1))return propsDrawing(box,dr[0]);
  /* Une piste prise entière — Maj+clic, ou Maj+double-clic qui la suit d'une
     couche à l'autre — arrive ici avec ses vias : c'est un seul objet, et le
     panneau la traite comme telle plutôt que de la compter comme un lasso. */
  if(tr.length&&only(tr.length+vi.length))return propsTracks(box,tr,vi);
  /* Tout le reste — cinq vias au lasso, dix empreintes, un mélange — passe par
     le panneau de groupes : une ligne par jeu de cotes identiques, et les
     champs commandent le groupe entier. */
  if(!only(0))return propsMulti(box,fps,tr,vi,zo,ct);
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
function propsDrawing(box, d){
  const isRect = d.shape === "rect";
  const dx = Math.abs(d.x2 - d.x1), dy = Math.abs(d.y2 - d.y1);
  const len = Math.round(Math.hypot(d.x2 - d.x1, d.y2 - d.y1) * 1000) / 1000;
  box.innerHTML =
    '<div class="prop"><label>Forme</label>' +
    '<select id="pDrwShape">' +
    '<option value="line"' + (!isRect ? " selected" : "") + '>Trait (segment)</option>' +
    '<option value="rect"' + (isRect ? " selected" : "") + '>Rectangle (cadre)</option>' +
    '</select></div>' +
    '<div class="prop"><label>Couche sérigraphie</label>' +
    '<select id="pDrwLayer">' +
    '<option value="silkT"' + (d.layer === "silkT" ? " selected" : "") + '>F.SilkS (Dessus / Composants)</option>' +
    '<option value="silkB"' + (d.layer === "silkB" ? " selected" : "") + '>B.SilkS (Dessous / Cuivre)</option>' +
    '</select></div>' +
    '<div class="prop"><label>Épaisseur de trait</label>' +
    '<select id="pDrwWidth">' +
    '<option value="0.1"' + (Math.abs(d.width - 0.1) < 1e-4 ? " selected" : "") + '>0,10 mm (Fine)</option>' +
    '<option value="0.15"' + (Math.abs(d.width - 0.15) < 1e-4 || !d.width ? " selected" : "") + '>0,15 mm (Standard KiCad)</option>' +
    '<option value="0.2"' + (Math.abs(d.width - 0.2) < 1e-4 ? " selected" : "") + '>0,20 mm</option>' +
    '<option value="0.25"' + (Math.abs(d.width - 0.25) < 1e-4 ? " selected" : "") + '>0,25 mm</option>' +
    '<option value="0.3"' + (Math.abs(d.width - 0.3) < 1e-4 ? " selected" : "") + '>0,30 mm (Épaisse)</option>' +
    '<option value="0.5"' + (Math.abs(d.width - 0.5) < 1e-4 ? " selected" : "") + '>0,50 mm</option>' +
    '</select></div>' +
    '<div class="prop two"><div><label>X1 (mm)</label><input id="pDrwX1" value="' + fmt(d.x1, 3) + '"></div>' +
    '<div><label>Y1 (mm)</label><input id="pDrwY1" value="' + fmt(d.y1, 3) + '"></div></div>' +
    '<div class="prop two"><div><label>X2 (mm)</label><input id="pDrwX2" value="' + fmt(d.x2, 3) + '"></div>' +
    '<div><label>Y2 (mm)</label><input id="pDrwY2" value="' + fmt(d.y2, 3) + '"></div></div>' +
    '<div class="prop"><label>Dimensions</label><input value="' + (isRect ? ("L: " + fmt(dx, 3) + " mm · H: " + fmt(dy, 3) + " mm") : (fmt(len, 3) + " mm")) + '" disabled></div>' +
    '<div class="prop"><div class="row"><button class="tb" id="pDrwDel">Supprimer le ' + (isRect ? "rectangle" : "trait") + '</button></div></div>' +
    '<div class="pinnote">Tracé sur les couches de sérigraphie F.SilkS / B.SilkS. ' +
    'Exporté dans les fichiers Gerber .GTO et .GBO. Glissez les coins pour ajuster les cotes.</div>';

  const sShape = $("pDrwShape");
  if(sShape) sShape.onchange = e => { push(); d.shape = e.target.value; d.type = d.shape; touch(); buildProps(); draw(); };
  const sLayer = $("pDrwLayer");
  if(sLayer) sLayer.onchange = e => { push(); d.layer = e.target.value; touch(); draw(); };
  const sWidth = $("pDrwWidth");
  if(sWidth) sWidth.onchange = e => { push(); d.width = +e.target.value; touch(); draw(); };
  const bindCoord = (id, key) => {
    const inp = $(id);
    if(inp) inp.onchange = e => {
      const v = +e.target.value.replace(",", ".");
      if(Number.isFinite(v)) { push(); d[key] = r3(v); touch(); buildProps(); draw(); }
    };
  };
  bindCoord("pDrwX1", "x1"); bindCoord("pDrwY1", "y1");
  bindCoord("pDrwX2", "x2"); bindCoord("pDrwY2", "y2");
  const bDel = $("pDrwDel");
  if(bDel) bDel.onclick = deleteSel;
}
/* ---------- menu déroulant du bouton Sérigraphie ---------- */
function silkMenuBuild(){
  let m=$("silkMenu");
  if(!m){
    m=document.createElement("div");
    m.id="silkMenu";
    document.body.appendChild(m);
  }
  const isRect=S.silkShape==="rect";
  m.innerHTML=
    '<div class="mtitle">Sérigraphie</div>'+
    '<div class="prop"><div class="row">'+
    '<button class="tb'+(!isRect?' sel':'')+'" id="smLine">─ Trait (segment) <kbd>S</kbd></button>'+
    '</div><div class="row">'+
    '<button class="tb'+(isRect?' sel':'')+'" id="smRect">▢ Rectangle (cadre) <kbd>Shift+S</kbd></button>'+
    '</div></div>';
  const bLine=$("smLine");
  if(bLine)bLine.onclick=()=>{S.silkShape="line";setMode("silk");silkMenuClose();};
  const bRect=$("smRect");
  if(bRect)bRect.onclick=()=>{S.silkShape="rect";setMode("silk");silkMenuClose();};
  return m;
}
function silkMenuOpen(){
  const m=silkMenuBuild(), b=$("mSilk"), r=b&&b.getBoundingClientRect?b.getBoundingClientRect():null;
  m.classList.add("on");
  if(!r)return;
  const w=m.offsetWidth||240, hg=m.offsetHeight||120;
  m.style.left=Math.max(6,Math.min(innerWidth-w-6,r.left))+"px";
  m.style.top=Math.max(6,Math.min(innerHeight-hg-6,r.bottom+5))+"px";
}
function silkMenuClose(){
  const m=$("silkMenu");if(m)m.classList.remove("on");
}
function silkMenuToggle(){
  const m=$("silkMenu");
  if(m&&m.classList.contains("on"))silkMenuClose();else silkMenuOpen();
}
/* Ce que le nom du boîtier a décidé — ou pourquoi il n'a rien décidé. Le
   schématique laisse saisir n'importe quel nom : autant dire lequel est
   compris, et laisser reposer l'empreinte d'un clic quand les cotes ont été
   retouchées puis regrettées. */
function pkgNote(fp){
  /* Empreinte dessinée à la main : les cotes ne commandent plus, et le nom du
     boîtier n'est plus qu'une étiquette de nomenclature. Le dire ici évite de
     chercher pourquoi « pas 1,27 » ne déplace rien. */
  if(fpFree(fp)){
    const g=fp.pkg?pkgGeom(fp.pkg,fpWiredPins(fp)):null;
    if(g&&g.pads){
      return '<div class="empty" style="padding:4px 12px 8px">'+esc(fp.pkg)+' : '+
        'empreinte de la bibliothèque ('+padsOf(fp).length+' pastille).</div>';
    }
    return '<div class="empty" style="padding:4px 12px 8px">Empreinte dessinée '+
      'à la main : '+padsOf(fp).length+' pastille(s) placées une à une. '+
      (fp.pkg?esc(fp.pkg)+' ne sert plus qu&rsquo;à la nomenclature. ':"")+
      'Les cotes ci-dessous ne commandent plus rien.</div>';
  }
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

  let schComp = null;
  if (typeof pcbComposantsSchema === "function") {
    const schMap = pcbComposantsSchema();
    schComp = schMap.get(fp.ref) || null;
  }
  let diag = null;
  if (typeof pcbVerifierPinoutComposant === "function") {
    diag = pcbVerifierPinoutComposant(schComp || { ref: fp.ref, value: fp.value, pkg: fp.pkg }, fp);
  }

  let h='<div class="prop"><label>Repère</label><input id="pRef" value="'+esc(fp.ref)+'"></div>'+
    '<div class="prop two"><div><label>Valeur</label><input id="pVal" value="'+esc(fp.value||"")+'"></div>'+
    '<div><label>Boîtier</label><input id="pPkg" value="'+esc(fp.pkg||"")+'"></div></div>'+
    pkgNote(fp)+
    (diag ? (
      '<div class="pcb-fp-pinout-box ' + (diag.conforme ? 'ok' : 'warn') + '">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">' +
          '<b style="color:' + (diag.conforme ? '#4ade80' : '#fbbf24') + ';font-size:11px">' +
            (diag.conforme ? '✓ Pinout & Boîtier conformes' : '⚠️ Anomalie Pinout / Géométrie') +
          '</b>' +
          '<button class="tb" id="pFpInspectPinout" style="padding:1px 6px;font-size:10px">Inspecter…</button>' +
        '</div>' +
        '<div style="font-size:10.5px;line-height:1.4;color:var(--txt-dim)">' +
          '<div>• <b>Pas (pitch) :</b> ' + (diag.pitchCheck ? esc(diag.pitchCheck.msg) : "—") + '</div>' +
          '<div>• <b>Taille boîtier :</b> ' + (diag.spanCheck ? esc(diag.spanCheck.msg) : "—") + '</div>' +
          '<div>• <b>Pastilles :</b> ' + (diag.pinCountCheck ? esc(diag.pinCountCheck.msg) : "—") + '</div>' +
        '</div>' +
      '</div>'
    ) : '') +
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
    '<div class="prop"><label>Rotation</label><div style="display:flex;align-items:center;gap:4px;"><select id="pRot" style="flex:1;">'+
      [0,45,90,135,180,225,270,315].map(a=>'<option value="'+a+'"'+
        ((fp.rot||0)===a?" selected":"")+'>'+a+'°</option>').join("")+'</select>'+
      '<button id="bOptRot" class="tb" style="padding:2px 6px;font-size:11px;" title="Trouver et appliquer l\'orientation optimale pour minimiser les croisements de chevelu">✨ Auto</button></div></div>'+
    '<div class="cat">Broches et nets</div><table class="bom"><tbody>';
  for(const q of ps){
    let pinSchName = "";
    if (schComp) {
      const pinObj = Array.isArray(schComp.pinout) ? schComp.pinout.find(x => String(x.number) === String(q.n)) : null;
      pinSchName = (pinObj && pinObj.name) || (Array.isArray(schComp.pinNames) && schComp.pinNames[q.n - 1]) || "";
    }
    h+='<tr data-net="'+esc(q.net||"")+'"'+(q.net&&S.hlNet===q.net?' class="on"':"")+
       '><td class="r" style="width:28px">#'+esc(q.n)+'</td>'+
       (pinSchName ? '<td style="font-family:var(--mono);font-size:11px;color:#f0abfc;font-weight:600;width:75px;overflow:hidden;text-overflow:ellipsis" title="Broche schéma : '+esc(pinSchName)+'">'+esc(pinSchName)+'</td>' : '<td style="width:30px;color:var(--txt-dim);font-size:10px">—</td>')+
       '<td class="net">'+(q.net?'<span class="dot" style="background:'+netColor(q.net)+
       '"></span>'+esc(q.net):'<span style="color:var(--txt-dim)">non connectée</span>')+'</td></tr>';
  }
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
  upd("pStyle",v=>{fp.style=v;const g=defaultGeom(v);fp.pitch=g.pitch;fp.span=g.span;});
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
  const bOpt=$("bOptRot");
  if(bOpt){
    bOpt.onclick=e=>{
      e.preventDefault();
      if(typeof PLACEMENT_SCORE!=="undefined"&&PLACEMENT_SCORE.optimiserEtAppliquerRotation){
        PLACEMENT_SCORE.optimiserEtAppliquerRotation(fp.ref);
      }
    };
  }
  const bPinout=$("pFpInspectPinout");
  if(bPinout&&typeof pcbOuvrirDialoguePinout==="function"){
    bPinout.onclick=()=>pcbOuvrirDialoguePinout();
  }
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
    reSync();refreshPanels();draw();};
  $("bpH").onchange=()=>{push();setBoardSize(S.board.w,parseFloat($("bpH").value)||S.board.h);
    reSync();refreshPanels();draw();};
  $("bpDraw").onclick=()=>setMode("edge");
  const r=$("bpRect");
  if(r)r.onclick=()=>{push();setBoardRect();reSync();refreshPanels();draw();
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
      '<br>Se reprend par un clic dans son cuivre, au lasso, ou par le pastillon de la couche.'+
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
/* ==========================================================================
   Ligne de transmission : ce que la sélection vaut électriquement
   --------------------------------------------------------------------------
   Le même bloc sert au segment seul et à la piste entière — un segment n'est
   qu'une ligne à un tronçon. Il paraît dès qu'il y a du cuivre sélectionné :
   les cotes de l'empilage physique sont toujours renseignées, il n'y a jamais
   rien à demander avant d'afficher un chiffre.
   ========================================================================== */
const LT_KIND={micro:"Microruban",strip:"Triplaque"};
/* Secondes, farads, henrys → l'unité dans laquelle on en parle. Une piste de
   carte se compte en picosecondes et en picofarads ; les valeurs mille fois
   plus grandes existent quand même, sur une longue liaison ou un plan entier. */
function ltT(t){
  const ps=t*1e12;
  return ps>=1000?fmt(ps/1000,3)+" ns":fmt(ps,1)+" ps";
}
function ltC(c){
  const p=c*1e12;
  return p>=1000?fmt(p/1000,3)+" nF":fmt(p,3)+" pF";
}
function ltL(l){
  const n=l*1e9;
  return n>=1000?fmt(n/1000,3)+" µH":fmt(n,3)+" nH";
}
/* « 4,30 » si tous les tronçons s'accordent, « 4,30 … 4,50 » sinon : une
   sélection qui change de couche n'a pas une valeur unique à montrer. */
function ltRange(gs,pick,dec,unit){
  let lo=null,hi=null;
  for(const g of gs){
    const v=pick(g);
    if(v==null||!isFinite(v))continue;
    lo=lo==null?v:Math.min(lo,v);hi=hi==null?v:Math.max(hi,v);
  }
  if(lo==null)return "—";
  const s=(hi-lo)<Math.pow(10,-dec)?fmt(lo,dec):fmt(lo,dec)+" … "+fmt(hi,dec);
  return unit?s+" "+unit:s;
}
function ltRO(label,val,tip){
  return '<div><label>'+esc(label)+'</label><input value="'+esc(val)+'" disabled'+
    (tip?' title="'+esc(tip)+'"':"")+'></div>';
}
/* Le détail par tronçon, dès que l'impédance n'est plus uniforme : c'est à
   chacune de ces frontières qu'une part du front repart en arrière. */
function ltTable(e){
  let h='<table class="bom"><thead><tr><th>Tronçon</th><th>Largeur</th>'+
        '<th>Longueur</th><th>Z₀</th><th>Retard</th></tr></thead><tbody>';
  for(const g of e.groups)
    h+='<tr><td class="net">'+esc(cuId(g.l,S.cu))+'<span class="pkgcell">'+
       esc(LT_KIND[g.kind]||g.kind)+
       (g.kind==="strip"?' · b '+fmt(g.b,3):' · h '+fmt(g.h,3))+' mm</span></td>'+
       '<td class="n">'+fmt(g.w,3)+'</td>'+
       '<td class="n">'+fmt(g.len,2)+'</td>'+
       '<td class="n">'+(g.z0>0?fmt(g.z0,1):"—")+'</td>'+
       '<td class="n">'+fmt(g.tpd*1e12,1)+'</td></tr>';
  return h+'</tbody></table>';
}
function ltSection(tracks,vias){
  const e=ltLine(tracks,vias);
  if(!e.n)return "";
  const vi=e.vias.n>0;
  const topo=e.kinds.length>1
    ? "Mixte — "+e.kinds.map(k=>(LT_KIND[k]||k).toLowerCase()).join(" et ")
    : (LT_KIND[e.kinds[0]]||"—");
  let h='<div class="cat">Ligne de transmission</div>'+
    '<div class="prop two">'+
      ltRO("Topologie",topo,
           "Microruban : un seul plan de référence, la piste voit l'air de l'autre "+
           "côté. Triplaque : un plan de part et d'autre.")+
      ltRO("Hauteur au plan",e.noRef&&e.groups.every(g=>!g.ref)
             ?"— aucun plan —":ltRange(e.groups,g=>g.h,3,"mm"),
           "Distance au plan de référence le plus proche. En triplaque, c'est "+
           "l'écart entre les deux plans qui commande l'impédance : le tableau "+
           "des tronçons le donne.")+
    '</div>'+
    '<div class="prop two">'+
      ltRO("εr stratifié",ltRange(e.groups,g=>g.er,2))+
      ltRO("εr effective",ltRange(e.groups,g=>g.eeff,2),
           "Ce que la ligne voit vraiment : le stratifié, et l'air pour un microruban.")+
    '</div>'+
    '<div class="prop two">'+
      ltRO("Impédance Z₀",ltRange(e.groups,g=>g.z0>0?g.z0:null,1,"Ω"))+
      ltRO("Longueur cuivre",fmt(e.len,2)+" mm")+
    '</div>'+
    '<div class="prop two">'+
      ltRO(vi?"Retard total":"Retard t_pd",ltT(e.tpdAll),
           vi?"Traversée des vias comprise.":"")+
      ltRO("Retard par mm",e.psmm?fmt(e.psmm,3)+" ps/mm":"—")+
    '</div>'+
    '<div class="prop two">'+
      ltRO("Capacité totale",ltC(e.cAll))+
      ltRO("Inductance totale",ltL(e.indAll))+
    '</div>';
  if(vi)
    h+='<div class="prop two">'+
        ltRO("Vias franchis",e.vias.n+" · "+fmt(e.vias.h,3)+" mm percés")+
        ltRO("Retard des vias",ltT(e.vias.tpd))+
      '</div>'+
      '<div class="prop two">'+
        ltRO("Self des vias",ltL(e.vias.ind),
             "Formule de Johnson sur la longueur percée et le diamètre de perçage.")+
        ltRO("Capacité des vias",ltC(e.vias.cap),
             "Pastille contre le dégagement du plan, déduit de l'isolation de classe.")+
      '</div>';
  if(!e.uniform)
    h+='<div class="prop two">'+
        ltRO("Z₀ équivalente",e.z0eq?fmt(e.z0eq,1)+" Ω":"—",
             "√(L/C) sur la ligne entière : ce que voit un front qui la parcourt.")+
        ltRO("Tronçons",e.groups.length+" · "+e.n+" segment"+(e.n>1?"s":""))+
      '</div>'+ltTable(e);
  h+='<div class="empty" style="padding:6px 12px">'+
    (e.noRef?'<span class="warn">Aucun plan de référence dans l\'empilage sous '+
      'cette couche : les cotes sont prises sur le diélectrique voisin, '+
      'l\'impédance n\'a pas de sens tant qu\'un plan ne lui répond pas.</span><br>':"")+
    (e.uniform?"":'Z₀ n\'est pas uniforme : chaque changement de largeur ou de '+
      'couche renvoie une part du front en arrière.<br>')+
    'Hammerstad pour εr effective, Wheeler pour le microruban, IPC-2141A pour '+
    'la triplaque : ±5 % au mieux, l\'épaisseur du cuivre non comptée. De quoi '+
    'dégrossir un tracé, pas de quoi signer une commande — le fabricant, lui, '+
    'tranchera au calcul de champ.</div>';
  return h;
}
function propsTrack(box,t){
  const len=trkLen(t), cl=classOf(t.net);
  const g=netTracks(t.net);
  box.innerHTML=
    '<div class="prop"><label>Couche</label><select id="tL">'+
      S.cuL.map((L,i)=>'<option value="'+i+'"'+(t.l===i?" selected":"")+'>'+
        esc(L.name)+' — '+cuId(i,S.cu)+'</option>').join("")+'</select></div>'+
    '<div class="prop two">'+numProp("tW","Largeur (mm)",t.w,0.05,0.05)+
      '<div><label>Longueur</label><input value="'+fmt(len,2)+' mm" disabled></div></div>'+
    /* Une piste circulaire le dit : sans cela, la longueur affichée — celle de
       l'arc — n'aurait aucun rapport visible avec les deux bouts, et l'on
       aurait cru à une erreur. Le rayon vient avec, c'est la cote qu'on
       vérifie sur une antenne. */
    (arcOf(t)
      ? '<div class="prop two"><div><label>Arc</label><input value="'+
          fmt(Math.abs(t.ca)*180/Math.PI,1)+'°" disabled></div>'+
        '<div><label>Rayon</label><input value="'+fmt(arcOf(t).r,3)+
          ' mm" disabled></div></div>'
      : '')+
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
      '<button class="tb" id="tDel">Dérouter le net</button></div></div>'+
    ltSection([t],[]);
  $("tMit").onclick=mitreSel;
  $("tL").onchange=()=>{push();t.l=+$("tL").value;touch();refreshPanels();draw();};
  $("tW").onchange=()=>{push();t.w=Math.max(0.05,parseFloat($("tW").value)||cl.w);
    touch();refreshPanels();draw();};
  $("tN").onchange=()=>{push();t.net=$("tN").value;touch();refreshPanels();draw();};
  $("tC").onchange=()=>{
    if(!t.net){alert("Cette piste n'est rattachée à aucun net : la classe ne s'applique pas.");
      buildProps();return;}
    push();setNetClass(t.net,$("tC").value);touch();zoneCache.clear();
    reSync();refreshPanels();draw();
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
function propsTracks(box,list,vias){
  const nets=[...new Set(list.map(t=>t.net||"—"))];
  const vi=vias||[];
  mpNeuf();
  box.innerHTML=
    '<div class="empty">'+list.length+' segment'+(list.length>1?"s":"")+
      (vi.length?' et '+vi.length+' via'+(vi.length>1?'s':""):"")+
      ' sélectionné'+(list.length+vi.length>1?"s":"")+' · net'+(nets.length>1?"s":"")+
      ' '+esc(nets.join(", "))+'</div>'+
    '<div class="prop"><label>Couche</label><select id="msL">'+
      '<option value="">— inchangée —</option>'+
      S.cuL.map((L,i)=>'<option value="'+i+'">'+esc(L.name)+' — '+cuId(i,S.cu)+'</option>').join("")+
      '</select></div>'+
    /* Une piste qui change de largeur en route ne montre pas celle du premier
       tronçon : le champ dit « mixte », et le renseigner les aligne tous. */
    '<div class="prop two">'+mpNum("msW","Largeur (mm)",list,t=>t.w,2,0.05,0.05)+
      '<div><label>Longueur totale</label><input value="'+
      fmt(list.reduce((a,t)=>a+trkLen(t),0),1)+' mm" disabled></div></div>'+
    '<div class="prop"><div class="row">'+
      '<button class="tb" id="msMit">Angle droit → 45° (D)</button></div>'+
      '<div class="row">'+
      '<button class="tb" id="msCls">Largeur de classe</button>'+
      '<button class="tb" id="msDel">Supprimer</button></div></div>'+
    /* Les vias de passage sont de la sélection : autant pouvoir en changer le
       diamètre ici, groupés par cotes, plutôt qu'un par un au clic. */
    mpSection("vias",vi)+
    ltSection(list,vi);
  $("msMit").onclick=mitreSel;
  $("msL").onchange=()=>{
    const v=$("msL").value;
    if(v==="")return;
    push();list.forEach(t=>t.l=+v);touch();refreshPanels();draw();
  };
  mpBranche("msW",list,(t,v)=>{t.w=Math.max(0.05,v);},1);
  $("msCls").onclick=()=>{
    push();list.forEach(t=>t.w=classOf(t.net).w);touch();refreshPanels();draw();
  };
  $("msDel").onclick=deleteSel;
  mpBrancher(box);
}
function propsVia(box,v){
  const lt=ltVia(v), bd=viaBuild(v.a,v.b);
  box.innerHTML=
    '<div class="prop two">'+numProp("vD","Diamètre",v.d,0.05,0.2)+
      numProp("vDr","Perçage",v.drill,0.05,0.1)+'</div>'+
    /* La nature d'abord, les couches ensuite : on veut « borgne dessus » plus
       souvent qu'on ne veut « de L1 à L2 », et l'un pose l'autre. */
    '<div class="prop"><label>Type de via</label><select id="vK">'+
      viaKindsAvail().map(([k,t])=>'<option value="'+k+'"'+
        (viaKindOf(v)===k?" selected":"")+'>'+esc(t)+'</option>').join("")+
      '</select></div>'+
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
      esc(cuId(v.a,S.cu))+" → "+esc(cuId(v.b,S.cu))+" : "+esc(bd.why)+"."+
      /* `viaBuild` sait ce qu'un seul pressage permet ; le dire ici évite de
         découvrir le laminage séquentiel sur le devis. */
      (bd.ok?"":' <span class="warn">Un seul pressage n\'y suffit pas : '+
        'à valider avec le fabricant.</span>')+
      " Perçage de "+fmt(stackSpan(v.a,v.b),3)+" mm de long, rapport d'aspect "+
      fmt(stackSpan(v.a,v.b)/Math.max(0.01,v.drill),1)+" : 1"+
      (stackSpan(v.a,v.b)/Math.max(0.01,v.drill)>8
        ? " — au-delà de 8 : 1, à valider avec le fabricant." : ".")+
      /* Ce que le tube ajoute à la ligne qui le franchit : le panneau de la
         piste entière les compte, autant les lire aussi sur le via seul. */
      '<br>Il ajoute à la piste qui le franchit '+ltL(lt.ind)+' de self et '+
      ltC(lt.cap)+' de capacité.</div>';
  /* La nature a son propre gestionnaire : `f` relit les deux listes de couches,
     et celles-ci portent encore l'ancienne portée au moment du changement. */
  $("vK").onchange=()=>{
    push();viaSetKind(v,$("vK").value);touch();refreshPanels();draw();
  };
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

/* ==========================================================================
   Sélection multiple : une ligne par groupe, modifiable d'un coup
   --------------------------------------------------------------------------
   Cinq vias pris au lasso, ce n'est pas cinq panneaux à faire défiler. Ceux
   qui portent les mêmes cotes tiennent sur une seule ligne, avec leur compte :
   « ×3 · Ø 0.80 · GND ». On clique la ligne, on change le diamètre, et les
   trois vias suivent — un seul coup d'annulation pour les trois.

   La ligne « tous » vient en tête dès qu'il y a plus d'un groupe : c'est là
   qu'on ramène toute la sélection à une même valeur. Les champs qui diffèrent
   d'un objet à l'autre y portent « mixte » et ne changent rien tant qu'on ne
   les renseigne pas — sans quoi ouvrir le panneau alignerait la sélection sur
   le premier venu, ce que personne n'a demandé.

   Ce qui n'est PAS modifiable en groupe : le repère d'une empreinte et sa
   position. Deux boîtiers ne partagent ni l'un ni l'autre — les empiler au
   même X serait la seule chose que le champ saurait faire.
   ========================================================================== */
const MP_MIX=" mixte";   /* valeur de l'option « — mixte — » : aucun net ne la porte */
const mpOuvert={};            /* par type : l'objet dont le groupe est déplié, ou "tous" */
/* Repartir des lignes ouvertes d'office. Rien ne l'appelle en marche normale :
   une ancre qui ne se retrouve plus dans la sélection est ignorée d'elle-même. */
function mpRaz(){for(const k in mpOuvert)delete mpOuvert[k];}
const mpIdx={};               /* lignes de la dernière construction, pour les clics */
/* Vidé sur place plutôt que remplacé : le banc d'essai en garde la référence. */
function mpNeuf(){for(const k in mpIdx)delete mpIdx[k];}

/* Toutes les valeurs de la liste sont-elles la même ? Les cotes sont des
   flottants venus du fichier : on les compare à la tolérance du micromètre. */
function mpMeme(list,pick){
  const a=pick(list[0]);
  for(const o of list){
    const b=pick(o);
    if(typeof a==="number"&&typeof b==="number"){if(Math.abs(a-b)>1e-6)return false;}
    else if(b!==a)return false;
  }
  return true;
}
/* La valeur commune mise en forme, ou « mixte » : sert aux lignes du tableau. */
function mpDit(list,pick,fn){
  if(!mpMeme(list,pick))return "mixte";
  const v=pick(list[0]);
  return fn?fn(v):String(v==null||v===""?"—":v);
}
function mpNum(id,label,list,pick,dec,step,min,off){
  const m=mpMeme(list,pick);
  return '<div><label>'+esc(label)+'</label><input id="'+esc(id)+'" type="number" step="'+
    (step||0.05)+'" min="'+(min==null?0:min)+'"'+
    (m?' value="'+esc(fmt(pick(list[0]),dec==null?2:dec))+'"':' placeholder="mixte"')+
    (off?" disabled":"")+'></div>';
}
function mpTexte(id,label,list,pick,off){
  const m=mpMeme(list,pick);
  return '<div><label>'+esc(label)+'</label><input id="'+esc(id)+'"'+
    (m?' value="'+esc(pick(list[0])||"")+'"':' placeholder="mixte"')+
    (off?" disabled":"")+'></div>';
}
/* `opts` : [valeur, texte]. La valeur est comparée en texte — une couche et
   une face sont des indices, un net est un nom. */
function mpChoix(id,label,list,pick,opts,off){
  const m=mpMeme(list,pick);
  const v=m?String(pick(list[0])==null?"":pick(list[0])):null;
  return '<div><label>'+esc(label)+'</label><select id="'+esc(id)+'"'+(off?" disabled":"")+'>'+
    (m?"":'<option value="'+esc(MP_MIX)+'">— mixte —</option>')+
    opts.map(o=>'<option value="'+esc(o[0])+'"'+(m&&v===String(o[0])?" selected":"")+'>'+
      esc(o[1])+'</option>').join("")+'</select></div>';
}
function mpCouches(){return S.cuL.map((L,i)=>[i,L.name+" — "+cuId(i,S.cu)]);}
function mpNets(vide){
  return [["",vide||"— libre —"]].concat(netTable().map(n=>[n.name,n.name]));
}
/* Un champ qui commande tout un groupe. Le « mixte » laissé tel quel ne touche
   à rien : c'est ce qui permet de ne changer QUE le diamètre sur une sélection
   qui diffère aussi par le net et par les couches. */
function mpBranche(id,list,fn,num,apres){
  const el=$(id);
  if(!el)return;
  el.onchange=()=>{
    const s=el.value;
    if(s===MP_MIX)return;
    let v=s;
    if(num){
      v=parseFloat(s);
      if(!isFinite(v))return;
    }else if(s===""&&el.placeholder)return;
    push();
    for(const o of list)fn(o,v);
    if(apres)apres();
    touch();refreshPanels();draw();
  };
}
/* Un via reste percé du plus petit au plus grand, sur deux couches distinctes,
   et son perçage tient dans sa pastille : changer une cote sur tout un groupe
   ne doit pas produire de tube impossible. */
function mpViaFix(v){
  if(v.a>v.b){const k=v.a;v.a=v.b;v.b=k;}
  if(v.a===v.b)v.b=Math.min(S.cu-1,v.a+1);
  if(v.a===v.b)v.a=Math.max(0,v.b-1);
  v.d=Math.max(0.2,v.d);
  v.drill=Math.max(0.1,Math.min(v.drill,v.d-0.1));
}
/* Les cinq familles d'objets qu'un lasso ramène. Chacune dit comment grouper
   (`sig`), ce qu'une ligne montre (`cell`), et quels champs commandent le
   groupe (`form` / `wire`). */
const MP_KINDS={
  fps:{titre:"Empreintes",nom:["empreinte","empreintes"],
    sig:f=>[f.pkg||"",f.value||"",f.style,fmt(f.pitch,3),fmt(f.span,3),f.pins,
            f.side?1:0,f.rot||0,fpFree(f)?"L":"G"].join("|"),
    cell:list=>{
      const r=list.map(f=>String(f.ref)).sort((a,b)=>a.localeCompare(b,"fr",{numeric:true}));
      return esc(r.slice(0,6).join(", ")+(r.length>6?" … +"+(r.length-6):""))+
        '<span class="pkgcell">'+esc(mpDit(list,f=>f.value||""))+' · '+
        esc(mpDit(list,f=>f.pkg||""))+' · '+
        esc(mpDit(list,f=>(f.side?1:0),v=>v?"dessous":"dessus"))+' · '+
        esc(mpDit(list,f=>(f.rot||0),v=>v+"°"))+'</span>';
    },
    form:list=>{
      const libre=list.some(f=>fpFree(f)), off=libre?1:0;
      return '<div class="prop two">'+
          mpTexte("mpFpVal","Valeur",list,f=>f.value||"")+
          mpTexte("mpFpPkg","Boîtier",list,f=>f.pkg||"")+'</div>'+
        '<div class="prop">'+mpChoix("mpFpStyle","Empreinte générique",list,f=>f.style,
            Object.keys(STYLES).map(k=>[k,STYLES[k].n]),off)+'</div>'+
        '<div class="prop two">'+
          mpNum("mpFpPins","Broches",list,f=>f.pins,0,1,1)+
          mpNum("mpFpPitch","Pas (mm)",list,f=>f.pitch,2,0.01,0.2,off)+'</div>'+
        '<div class="prop two">'+
          mpNum("mpFpSpan","Écartement",list,f=>f.span,2,0.01,0.2,off)+
          mpChoix("mpFpSide","Face",list,f=>(f.side?1:0),[[0,"Dessus"],[1,"Dessous"]])+'</div>'+
        '<div class="prop">'+mpChoix("mpFpRot","Rotation",list,f=>(f.rot||0),
            [0,45,90,135,180,225,270,315].map(a=>[a,a+"°"]))+'</div>'+
        (libre?'<div class="empty" style="padding:2px 12px 8px">Empreinte dessinée '+
          'à la main dans la sélection : les cotes génériques ne commandent plus '+
          'rien pour elle, elles restent grisées.</div>':"");
    },
    wire:list=>{
      const geo=list.filter(f=>!fpFree(f));
      mpBranche("mpFpVal",list,(f,v)=>{f.value=v;});
      mpBranche("mpFpPkg",list,(f,v)=>{f.pkg=v.trim();applyPkgGeom(f);});
      mpBranche("mpFpStyle",geo,(f,v)=>{f.style=v;const g=defaultGeom(v);f.pitch=g.pitch;f.span=g.span;});
      mpBranche("mpFpPins",list,(f,v)=>fpSetPins(f,v),1);
      mpBranche("mpFpPitch",geo,(f,v)=>{f.pitch=Math.max(0.2,v);},1);
      mpBranche("mpFpSpan",geo,(f,v)=>{f.span=Math.max(0.2,v);},1);
      mpBranche("mpFpSide",list,(f,v)=>{f.side=+v;},1);
      mpBranche("mpFpRot",list,(f,v)=>{f.rot=+v;},1);
    }},
  tracks:{titre:"Segments",nom:["segment","segments"],
    sig:t=>t.l+"|"+fmt(t.w,3)+"|"+(t.net||""),
    cell:list=>esc(mpDit(list,t=>t.w,v=>fmt(v,2)+" mm"))+
      '<span class="pkgcell">'+esc(mpDit(list,t=>t.l,v=>cuId(v,S.cu)))+' · '+
      esc(mpDit(list,t=>t.net||"",v=>v||"libre"))+' · '+
      fmt(list.reduce((a,t)=>a+trkLen(t),0),1)+' mm</span>',
    form:list=>'<div class="prop">'+mpChoix("mpTrL","Couche",list,t=>t.l,mpCouches())+'</div>'+
      '<div class="prop two">'+mpNum("mpTrW","Largeur (mm)",list,t=>t.w,2,0.05,0.05)+
        '<div><label>Longueur cumulée</label><input value="'+
        fmt(list.reduce((a,t)=>a+trkLen(t),0),2)+' mm" disabled></div></div>'+
      '<div class="prop">'+mpChoix("mpTrN","Net",list,t=>t.net||"",mpNets())+'</div>',
    wire:list=>{
      mpBranche("mpTrL",list,(t,v)=>{t.l=+v;},1);
      mpBranche("mpTrW",list,(t,v)=>{t.w=Math.max(0.05,v);},1);
      mpBranche("mpTrN",list,(t,v)=>{t.net=v;});
    }},
  vias:{titre:"Vias",nom:["via","vias"],
    sig:v=>fmt(v.d,3)+"|"+fmt(v.drill,3)+"|"+v.a+"|"+v.b+"|"+(v.net||""),
    cell:list=>'Ø '+esc(mpDit(list,v=>v.d,x=>fmt(x,2)))+' · perçage '+
      esc(mpDit(list,v=>v.drill,x=>fmt(x,2)))+
      '<span class="pkgcell">'+esc(mpDit(list,v=>v.a,x=>cuId(x,S.cu)))+' → '+
      esc(mpDit(list,v=>v.b,x=>cuId(x,S.cu)))+' · '+
      esc(mpDit(list,v=>viaKindOf(v),k=>viaKindTxt(k).toLowerCase()))+' · '+
      esc(mpDit(list,v=>v.net||"",x=>x||"libre"))+'</span>',
    form:list=>'<div class="prop two">'+
        mpNum("mpViaD","Diamètre",list,v=>v.d,2,0.05,0.2)+
        mpNum("mpViaDr","Perçage",list,v=>v.drill,2,0.05,0.1)+'</div>'+
      /* Le geste qu'on vient chercher ici : cinq vias pris au Ctrl+clic passent
         tous en borgne dessus d'une seule liste. */
      '<div class="prop">'+mpChoix("mpViaK","Type de via",list,v=>viaKindOf(v),
        viaKindsAvail())+'</div>'+
      '<div class="prop two">'+
        mpChoix("mpViaA","De la couche",list,v=>v.a,S.cuL.map((L,i)=>[i,cuId(i,S.cu)]))+
        mpChoix("mpViaB","À la couche",list,v=>v.b,S.cuL.map((L,i)=>[i,cuId(i,S.cu)]))+'</div>'+
      '<div class="prop">'+mpChoix("mpViaN","Net",list,v=>v.net||"",mpNets())+'</div>',
    wire:list=>{
      mpBranche("mpViaK",list,(v,x)=>{viaSetKind(v,x);mpViaFix(v);});
      mpBranche("mpViaD",list,(v,x)=>{v.d=x;mpViaFix(v);},1);
      mpBranche("mpViaDr",list,(v,x)=>{v.drill=x;mpViaFix(v);},1);
      mpBranche("mpViaA",list,(v,x)=>{v.a=+x;mpViaFix(v);},1);
      mpBranche("mpViaB",list,(v,x)=>{v.b=+x;mpViaFix(v);},1);
      mpBranche("mpViaN",list,(v,x)=>{v.net=x;});
    }},
  zones:{titre:"Zones",nom:["zone","zones"],
    sig:z=>z.l+"|"+(z.net||""),
    cell:list=>esc(mpDit(list,z=>z.l,v=>cuId(v,S.cu)))+
      '<span class="pkgcell">'+esc(mpDit(list,z=>z.net||"",v=>v||"cuivre isolé"))+' · '+
      list.reduce((a,z)=>a+z.pts.length,0)+' sommets</span>',
    form:list=>'<div class="prop">'+mpChoix("mpZoL","Couche",list,z=>z.l,mpCouches())+'</div>'+
      '<div class="prop">'+mpChoix("mpZoN","Net rattaché",list,z=>z.net||"",
        mpNets("— aucun (cuivre isolé) —"))+'</div>',
    wire:list=>{
      /* déformer un plan de couche le détache déjà : le déplacer aussi */
      mpBranche("mpZoL",list,(z,v)=>{detachAuto(z);z.l=+v;},1,()=>{buildLayers();});
      mpBranche("mpZoN",list,(z,v)=>{
        z.net=v;
        if(z.auto&&S.cuL[z.l])S.cuL[z.l].net=v;
      },0,()=>{buildLayers();});
    }},
  cuts:{titre:"Découpes",nom:["découpe","découpes"],
    sig:c=>String(c.l),
    cell:list=>esc(mpDit(list,c=>c.l,v=>cuId(v,S.cu)))+
      '<span class="pkgcell">'+list.reduce((a,c)=>a+c.pts.length,0)+' sommets</span>',
    form:list=>'<div class="prop">'+mpChoix("mpCtL","Couche",list,c=>c.l,mpCouches())+'</div>',
    wire:list=>{mpBranche("mpCtL",list,(c,v)=>{c.l=+v;},1,()=>{buildLayers();});}}
};
/* Les groupes d'un type, du plus nombreux au plus rare, précédés de la ligne
   « tous » quand il y en a plusieurs. Le groupe déplié se retrouve par l'objet
   qui l'ancre et non par son rang : changer un diamètre refait les groupes, et
   la ligne qu'on avait ouverte doit rester ouverte. */
function mpRangs(k,list){
  const D=MP_KINDS[k], m=new Map();
  for(const o of list){
    const s=D.sig(o);
    if(!m.has(s))m.set(s,[]);
    m.get(s).push(o);
  }
  const gs=[...m.values()].sort((a,b)=>b.length-a.length);
  const rows=gs.map((g,i)=>({k:k,id:k+":"+i,list:g,ancre:g[0]}));
  if(gs.length>1)rows.unshift({k:k,id:k+":tous",list:list,ancre:"tous"});
  const a=mpOuvert[k];
  let cur=null;
  if(a==="tous")cur=rows.find(r=>r.ancre==="tous");
  else if(a)cur=rows.find(r=>r.ancre!=="tous"&&r.list.indexOf(a)>=0);
  if(!cur)cur=rows[0];
  cur.ouvert=true;
  mpOuvert[k]=cur.ancre;
  for(const r of rows)mpIdx[r.id]=r;
  return rows;
}
function mpSection(k,list){
  if(!list.length)return "";
  const D=MP_KINDS[k], rows=mpRangs(k,list), cur=rows.find(r=>r.ouvert);
  let h='<div class="cat">'+esc(D.titre)+' · '+list.length+'</div>';
  if(rows.length>1){
    h+='<table class="bom"><tbody>';
    for(const r of rows)
      h+='<tr data-mp="'+esc(r.id)+'"'+(r.ouvert?' class="on"':"")+'>'+
         '<td class="n">'+(r.ancre==="tous"?"tous":"×"+r.list.length)+'</td>'+
         '<td class="net">'+D.cell(r.list)+'</td></tr>';
    h+='</tbody></table>';
  }
  h+=D.form(cur.list);
  if(list.length>1)
    h+='<div class="empty" style="padding:2px 12px 8px">'+
       (cur.ancre==="tous"
        ? "Toute la sélection. « mixte » marque ce qui diffère d'un "+esc(D.nom[0])+
          " à l'autre : le champ ne touche à rien tant qu'on ne le renseigne pas."
        : "Ligne choisie : "+cur.list.length+" "+
          esc(D.nom[cur.list.length>1?1:0])+" modifié"+(cur.list.length>1?"s":"")+
          " ensemble, en un seul coup d'annulation.")+'</div>';
  return h;
}
/* Les clics sur les lignes, puis les champs du groupe ouvert de chaque type. */
function mpBrancher(box){
  box.querySelectorAll("tr[data-mp]").forEach(tr=>{
    tr.onclick=()=>{
      const r=mpIdx[tr.dataset.mp];
      if(!r)return;
      mpOuvert[r.k]=r.ancre;
      buildProps();
    };
  });
  for(const id in mpIdx){
    const r=mpIdx[id];
    if(r.ouvert)MP_KINDS[r.k].wire(r.list);
  }
}
function propsMulti(box,fps,tr,vi,zo,ct){
  const cu=tr.length+vi.length;
  const dire=(n,s)=>n?n+" "+s+(n>1?"s":""):"";
  mpNeuf();
  box.innerHTML='<div class="empty">Sélection : '+
      [dire(fps.length,"empreinte"),dire(tr.length,"segment"),dire(vi.length,"via"),
       dire(zo.length,"zone"),dire(ct.length,"découpe")].filter(Boolean).join(" · ")+
      '.<br>R pivote · F retourne · Suppr supprime.</div>'+
    /* Le cuivre routé de la sélection se retire à part : c'est le geste qu'on
       fait avant de replacer un boîtier, et un lasso ne sait pas le distinguer.
       Le bouton ne paraît que s'il y a quelque chose à dérouter. */
    (cu?'<div class="prop"><div class="row"><button class="tb" id="pUnroute">'+
        'Dérouter '+(tr.length?tr.length+' segment'+(tr.length>1?'s':''):'')+
        (tr.length&&vi.length?' et ':'')+
        (vi.length?vi.length+' via'+(vi.length>1?'s':''):'')+' <kbd>U</kbd>'+
        '</button></div>'+
        '<div class="empty" style="padding:6px 12px">Les empreintes restent en '+
        'place et sélectionnées : de quoi les replacer avant de router autrement. '+
        'Les zones de cuivre ne sont pas du routage, elles ne partent pas.</div></div>'
      :"")+
    mpSection("fps",fps)+mpSection("tracks",tr)+mpSection("vias",vi)+
    mpSection("zones",zo)+mpSection("cuts",ct);
  const pu=$("pUnroute");
  if(pu)pu.onclick=unrouteSel;
  mpBrancher(box);
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
      touch();zoneCache.clear();reSync();buildList();draw();
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
/* LA LISTE DES ERREURS EST COUPÉE, et c'est une affaire de réactivité, pas de
   place à l'écran. Ce panneau se reconstruit à CHAQUE `refreshPanels()` —
   donc à chaque clic, à chaque segment posé, à chaque changement de
   sélection. Une carte à demi routée sort couramment des milliers d'écarts :
   à seize mille, la reconstruction du tableau coûtait près d'une seconde par
   geste, et l'éditeur devenait inutilisable tant que l'onglet restait ouvert.
   Le nombre exact, lui, ne se perd pas : il est dans le pied de la liste, et
   surtout au bandeau du bouton « Contrôle DRC ». Au-delà de quelques
   centaines on ne lit plus une liste, on corrige la première ligne et on
   relance — c'est la même règle que les listes de la visionneuse. */
const DRC_MAX=400;
function listDrc(box){
  if(!S.drcRun){
    box.innerHTML='<div class="empty">Contrôle non lancé. Le bouton « Contrôle DRC » vérifie isolations, largeurs, débordements et liaisons manquantes.</div>';
    return;
  }
  if(!S.drc.length){box.innerHTML='<div class="empty ok">Aucune erreur détectée.</div>';return;}
  const vus=S.drc.slice(0,DRC_MAX);
  let h='<table class="bom"><tbody>';
  vus.forEach((e,i)=>{
    h+='<tr data-i="'+i+'"><td class="'+(e.info?"":"warn")+'">'+esc(e.msg)+
       '<span class="pkgcell">'+fmt(ux(e.x),1)+" ; "+fmt(uy(e.y),1)+" mm · "+cuId(e.l||0,S.cu)+'</span></td></tr>';
  });
  h+='</tbody></table>';
  if(S.drc.length>vus.length)
    h+='<div class="empty">… et '+(S.drc.length-vus.length)+' autre'+
       (S.drc.length-vus.length>1?"s":"")+' écart'+
       (S.drc.length-vus.length>1?"s":"")+' non listé'+
       (S.drc.length-vus.length>1?"s":"")+' : corrigez ceux-ci et relancez le '+
       'contrôle. Ils sont tous peints sur la carte.</div>';
  box.innerHTML=h;
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

