"use strict";
/* =============================================================================
   Éditeur PCB — 08-empreinte.js
   Fenêtre d'édition d'empreinte et bibliothèque personnelle.

   Pourquoi une fenêtre plutôt que quelques champs de plus dans le panneau
   Propriétés : une colonne de nombres ne dit pas où sont les pastilles. Ce qui
   rend une empreinte juste, c'est de la voir — pastille par pastille, avec le
   contour de sérigraphie autour et la broche 1 repérée. C'est la fenêtre de
   brochage du schématique, transposée au cuivre.

   Les cotes génériques (style, pas, écartement) restent en tête : tant
   qu'elles suffisent, on ne dessine rien. Le premier déplacement fige
   l'empreinte en liste de pastilles (fpFreeze) et, à partir de là, tout se
   règle une pastille à la fois.

   La bibliothèque garde les empreintes retouchées d'une séance à l'autre :
   dans le navigateur pour les retrouver tout de suite, dans un .json pour les
   emporter ailleurs ou les partager.
   ============================================================================= */

/* ==========================================================================
   Bibliothèque d'empreintes
   Une définition ne porte que la forme : ni repère, ni valeur, ni position, ni
   nets — ce qui appartient à la carte reste sur la carte. On peut donc
   appliquer la même empreinte à dix composants sans rien leur enlever.
   ========================================================================== */
const FPLIB_KEY="pcbedit.empreintes.v1";
const FPLIB_FORMAT="pcbfp-1";

/* Forme d'une empreinte, telle qu'elle s'enregistre. Empreinte calculée : les
   trois cotes suffisent, `pads` reste absent et l'empreinte se recalculera
   chez celui qui l'importe. Empreinte dessinée : la liste est recopiée. */
function fpDefOf(fp,name){
  const def={name:String(name||fp.pkg||fp.ref||"empreinte").slice(0,48).trim(),
             pkg:fp.pkg||"", pins:fp.pins, style:fp.style,
             pitch:r3(fp.pitch), span:r3(fp.span)};
  /* Les cotes de pastille posées par le calcul IPC voyagent avec la
     définition : sans elles, un SOT-223 exporté puis relu perdrait sa
     languette et se recalculerait en deux rangées quelconques. */
  for(const k of FP_GEOM_KEYS)if(fp[k]!=null)def[k]=fp[k];
  const free=fpFree(fp);
  if(free){
    def.pads=free.map(padClone);
    const b=bodyOf(fp);
    def.body={x1:r4(b.x1),y1:r4(b.y1),x2:r4(b.x2),y2:r4(b.y2)};
  }
  return def;
}
/* Lecture défensive : une définition peut venir d'un fichier écrit à la main,
   d'une version antérieure ou d'ailleurs. Même exigence que normFp(). */
function normFpDef(d){
  if(!d||typeof d!=="object")return null;
  const name=dStr(d.name,48).trim();
  if(!name)return null;
  const style=STYLES[d.style]?d.style:defaultStyle(dInt(d.pins,2,1,4096));
  const g=defaultGeom(style);
  const out={name:name, pkg:dStr(d.pkg,40), pins:dInt(d.pins,2,1,4096),
             style:style, pitch:dRange(d.pitch,g.pitch,0.05,100),
             span:dRange(d.span,g.span,0.05,1000)};
  const geo=dGeom(d);
  for(const k of Object.keys(geo))out[k]=geo[k];
  const pads=dPads(d.pads);
  if(pads){
    out.pads=pads;
    let m=1;
    for(const q of pads)m=Math.max(m,q.n);
    out.pins=clamp(m,1,4096);
  }
  const body=dBody(d.body);
  if(body)out.body=body;
  return out;
}
/* Pose d'une définition sur une empreinte de la carte. Le repère, la valeur,
   la position, la face, la rotation et les nets ne bougent pas : seule la
   forme change. Le nom du boîtier non plus — il vient du schéma et sert la
   nomenclature ; le panneau Propriétés dit alors que l'empreinte ne s'en
   déduit plus. */
function fpApplyDef(fp,def){
  const d=normFpDef(def);
  if(!d)return false;
  fpSetGeom(fp,d);
  if(d.pads){
    fp.pads=d.pads.map(padClone);
    if(d.body)fp.body={x1:d.body.x1,y1:d.body.y1,x2:d.body.x2,y2:d.body.y2};
    else delete fp.body;
    fpSyncPins(fp);
  }else{
    delete fp.pads;delete fp.body;
  }
  /* une broche câblée ne doit jamais se retrouver sans pastille */
  const w=fpWiredPins(fp);
  if(w>fp.pins)fpSetPins(fp,w);
  return true;
}
/* Le stockage du navigateur peut être plein, coupé (navigation privée) ou
   contenir n'importe quoi : à chaque lecture, on rebâtit une table propre. */
function fpLibAll(){
  const out={};
  let raw=null;
  try{raw=localStorage.getItem(FPLIB_KEY);}catch(_){return out;}
  if(!raw)return out;
  let o=null;
  try{o=JSON.parse(raw);}catch(_){return out;}
  if(!o||typeof o!=="object")return out;
  for(const k of Object.keys(o)){
    const d=normFpDef(o[k]);
    if(d)out[d.name]=d;
  }
  return out;
}
function fpLibWrite(o){
  try{localStorage.setItem(FPLIB_KEY,JSON.stringify(o));return true;}
  catch(_){return false;}
}
function fpLibNames(){
  return Object.keys(fpLibAll()).sort((a,b)=>a.localeCompare(b,"fr",{numeric:true}));
}
function fpLibGet(name){return fpLibAll()[String(name)]||null;}
/* Enregistrement sous un nom : le même nom remplace, c'est ce qu'on attend
   d'une correction. Renvoie la définition retenue, ou null si le stockage
   n'est pas disponible. */
function fpLibPut(def){
  const d=normFpDef(def);
  if(!d)return null;
  const all=fpLibAll();
  all[d.name]=d;
  return fpLibWrite(all)?d:null;
}
function fpLibDel(name){
  const all=fpLibAll();
  if(!all[name])return false;
  delete all[name];
  return fpLibWrite(all);
}
/* Fichier d'échange : une ou plusieurs empreintes. */
function fpLibFile(names){
  const all=fpLibAll();
  const list=(names&&names.length?names:Object.keys(all))
    .map(n=>all[n]).filter(Boolean);
  return {format:FPLIB_FORMAT,footprints:list};
}
/* Lecture d'un fichier d'empreintes, sans rien écrire : l'appelant décide.
   On accepte le fichier complet, la définition seule ou un tableau — celui qui
   colle une empreinte à la main ne doit pas buter sur l'enveloppe. */
function fpLibParse(txt){
  let o=null;
  try{o=JSON.parse(String(txt));}
  catch(_){return {err:"Fichier illisible : ce n'est pas du JSON."};}
  let list=null;
  if(Array.isArray(o))list=o;
  else if(o&&Array.isArray(o.footprints))list=o.footprints;
  else if(o&&typeof o==="object")list=[o];
  if(!list)return {err:"Aucune empreinte dans ce fichier."};
  const defs=list.map(normFpDef).filter(Boolean);
  if(!defs.length)return {err:"Aucune empreinte exploitable dans ce fichier : "+
    "il y faut au moins un nom et des cotes."};
  return {defs:defs};
}
/* Fusion dans la bibliothèque. Un nom déjà pris par une empreinte différente
   n'est pas écrasé en silence : la nouvelle reçoit un suffixe, et l'appelant
   le dit. Deux fois la même empreinte ne fait qu'une entrée. */
function fpLibMerge(defs){
  const all=fpLibAll();
  const added=[], renamed=[];
  for(const d of defs){
    let name=d.name;
    if(all[name]&&JSON.stringify(all[name])!==JSON.stringify(d)){
      let i=2;
      while(all[name+" ("+i+")"])i++;
      name=name+" ("+i+")";
      renamed.push(name);
    }
    d.name=name;all[name]=d;added.push(name);
  }
  if(!fpLibWrite(all))
    return {added:[],renamed:[],
      err:"Le navigateur refuse d'enregistrer (stockage plein ou navigation "+
          "privée) : gardez le .json, il fait foi."};
  return {added:added,renamed:renamed};
}

/* ==========================================================================
   Fenêtre d'édition
   ========================================================================== */
/* `fit` : le cadrage suit l'empreinte, comme au premier affichage. La molette
   et les boutons de zoom le libèrent ; « Recadrer » le rend. */
const FE={open:false,fp:null,sel:0,drag:null,pushed:false,fit:true,z:8,cx:0,cy:0};
function feIsOpen(){return FE.open;}
/* Un seul instantané pour toute la séance : on annule d'un coup, pas pastille
   par pastille. */
function fePush(){if(!FE.pushed){push();FE.pushed=true;}}
function feHint(h){const e=$("feHint");if(e)e.innerHTML=h;}

/* ---------- construction paresseuse ----------
   Rien au chargement : une carte qu'on ne fait que router n'a pas à porter ce
   balisage. */
function feBuild(){
  if($("fpEd"))return;
  const d=document.createElement("div");
  d.id="fpEd";d.className="modal";d.hidden=true;
  d.innerHTML=
    '<div class="modal-box">'+
      '<header class="modal-head">'+
        '<span class="modal-title" id="feTitle">Empreinte</span>'+
        '<span class="modal-zoom" id="feZoom">100 %</span>'+
        '<button class="pnl-btn" id="feZo" title="Dézoomer">&minus;</button>'+
        '<button class="pnl-btn" id="feZi" title="Zoomer">+</button>'+
        '<button class="pnl-btn" id="feRefit" '+
          'title="Recadrer sur l\'empreinte (double-clic sur le dessin)">&#8690;</button>'+
        '<button class="pnl-btn" id="feClose" title="Fermer">&#10005;</button>'+
      '</header>'+
      '<div class="modal-body">'+
        '<div class="fe-view">'+
          '<canvas id="feCv"></canvas>'+
          '<div class="fenote" id="feHint"></div>'+
        '</div>'+
        '<div class="fe-side scroll" id="feSide"></div>'+
      '</div>'+
    '</div>';
  document.body.appendChild(d);
  d.addEventListener("pointerdown",e=>{if(e.target===d)feClose();});
  $("feClose").onclick=feClose;
  const cv=$("feCv");
  cv.addEventListener("pointerdown",feDown);
  cv.addEventListener("pointermove",feMove);
  window.addEventListener("pointerup",feUp);
  window.addEventListener("resize",()=>{if(FE.open)feDraw();});
  /* Molette : zoom autour du pointeur, comme sur la carte. Le point visé ne
     bouge pas d'un pixel — c'est ce qui permet de viser une pastille puis de
     descendre dessus. */
  cv.addEventListener("wheel",e=>{
    if(!FE.open)return;
    e.preventDefault();
    const r=cv.getBoundingClientRect(), mx=e.clientX-r.left, my=e.clientY-r.top;
    feZoom(e.deltaY<0?1.12:1/1.12,mx,my);
  },{passive:false});
  cv.addEventListener("dblclick",e=>{e.preventDefault();feRefit();});
  cv.addEventListener("auxclick",e=>{if(e.button===1)e.preventDefault();});
  $("feZi").onclick=()=>feZoom(1.25);
  $("feZo").onclick=()=>feZoom(1/1.25);
  $("feRefit").onclick=feRefit;
  const f=document.createElement("input");
  f.type="file";f.id="feFile";f.accept=".json,application/json";
  f.style.display="none";
  document.body.appendChild(f);
  f.onchange=()=>{
    const file=f.files[0];
    if(!file)return;
    const r=new FileReader();
    r.onload=()=>{feImportText(String(r.result),file.name);f.value="";};
    r.readAsText(file);
  };
}
function feOpen(fp){
  if(!fp)return;
  feBuild();
  FE.open=true;FE.fp=fp;FE.sel=0;FE.drag=null;FE.pushed=false;FE.fit=true;
  $("fpEd").hidden=false;
  feHint("");
  feSync();
}
/* Fermer la fenêtre vaut validation : l'origine y revient au centre du
   composant. C'est la poignée par laquelle l'empreinte se déplace et le point
   autour duquel elle pivote ; laissée où le dessin l'a mise, elle traîne à
   côté de la pièce, et le repère de sérigraphie — placé de part et d'autre de
   l'origine — sort du contour. Le cuivre ne bouge pas d'un micron pour autant :
   `fp.x`/`fp.y` avancent d'exactement ce que les pastilles reculent. */
function feClose(){
  if(!FE.open)return;
  const fp=FE.fp;
  FE.open=false;FE.drag=null;
  const d=$("fpEd");
  if(d)d.hidden=true;
  let recentre=false;
  if(fp&&!fpIsCentered(fp)){
    fePush();                       // l'instantané d'avant si la séance n'en a pas pris
    recentre=fpCenterOrigin(fp);
    touch();
  }
  zoneCache.clear();
  refreshPanels();draw();
  if(recentre)
    hint("Empreinte "+fp.ref+" : origine ramenée au centre du composant. "+
         "Le cuivre n'a pas bougé, seule la poignée de déplacement.");
}
/* Zoom d'un facteur, autour d'un point de l'écran — le centre du dessin par
   défaut. Les bornes sont larges : 2 pixels par millimètre pour voir une carte
   de connecteur entière, 600 pour poser une pastille de BGA au centième. */
function feZoom(f,mx,my){
  const cv=$("feCv");
  if(!cv)return;
  const W=cv.clientWidth||520, H=cv.clientHeight||420;
  const x=(mx==null)?W/2:mx, y=(my==null)?H/2:my;
  const p={x:(x-FE.cx)/FE.z, y:(y-FE.cy)/FE.z};
  const z=clamp(FE.z*f,2,600);
  if(z===FE.z)return;
  FE.fit=false;FE.z=z;
  FE.cx=x-p.x*z;FE.cy=y-p.y*z;
  feDraw();
}
function feRefit(){FE.fit=true;feDraw();}
/* Déplacement de l'origine, vu de la fenêtre : le repère local recule de
   (dx, dy), la vue avance d'autant. À l'écran, le cuivre ne bouge donc pas —
   c'est la vérité de l'opération — et seule la croix se déplace. */
function feOriginMove(dx,dy){
  if(!fpMoveOrigin(FE.fp,dx,dy))return false;
  FE.cx+=dx*FE.z;FE.cy+=dy*FE.z;
  return true;
}
/* `R` tourne la pastille sélectionnée d'un quart de tour, comme `R` tourne une
   empreinte sur la carte ; `Maj+R` dans l'autre sens. Le champ Rotation reste
   là pour les angles qui ne sont pas des quarts de tour. */
function feRotatePad(step){
  const fp=FE.fp, q=fp?padsOf(fp)[FE.sel]:null;
  if(!q)return;
  fePush();
  fpSetPad(fp,FE.sel,"rot",(q.rot||0)+step);
  feSync();
  const a=padsOf(fp)[FE.sel];
  feHint("Pastille "+a.n+" tournée à "+fmt(a.rot,0)+"&deg; &middot; <b>R</b> "+
    "d&rsquo;un quart de tour, <b>Maj+R</b> dans l&rsquo;autre sens"+
    (a.shape==="circ"?" — sur une pastille ronde, cela ne se voit pas.":"."));
}
/* Reprise après un Ctrl+Z : annuler remplace les empreintes de la carte, celle
   de la fenêtre comprise. On la retrouve par son identifiant ; si elle a
   disparu — annulation d'un import, par exemple — la fenêtre se ferme plutôt
   que de continuer sur un objet qui n'est plus de ce document. */
function feReattach(){
  if(!FE.open)return;
  const id=FE.fp?FE.fp.id:null;
  const fp=(id==null)?null:fpById(id);
  if(!fp){
    feClose();
    hint("L'empreinte en cours d'édition n'existe plus : la fenêtre s'est fermée.");
    return;
  }
  FE.fp=fp;
  FE.pushed=false;          // la prochaine retouche reprendra un instantané
  feSync();
}
/* Tout passe par ici : le dessin, le panneau latéral, la carte et les panneaux
   restent d'accord. Les zones de cuivre se recalculent — un dégagement de
   pastille déplacée ne peut pas rester où il était. */
function feSync(){
  const fp=FE.fp;
  if(!fp)return;
  const ps=padsOf(fp);
  FE.sel=clamp(FE.sel,0,Math.max(0,ps.length-1));
  $("feTitle").textContent="Empreinte — "+fp.ref+
    (fp.value?" · "+fp.value:"")+(fp.pkg?" · "+fp.pkg:"");
  feSide();
  feDraw();
  zoneCache.clear();touch();buildList();draw();
}

/* ---------- panneau latéral ---------- */
function feSide(){
  const fp=FE.fp, free=!!fpFree(fp), ps=padsOf(fp);
  const q=ps[FE.sel]||null;
  const dis=free?" disabled":"";
  const b=bodyOf(fp), off=fpOffCenter(fp), mk=fpMark(fp);
  const names=fpLibNames();
  const h=
    '<div class="prop"><label>Empreinte générique</label>'+
      '<select id="feStyle"'+dis+'>'+
      Object.keys(STYLES).map(k=>'<option value="'+esc(k)+'"'+
        (fp.style===k?" selected":"")+'>'+esc(STYLES[k].n)+'</option>').join("")+
      '</select>'+
      '<div class="row">'+
        numProp("fePins","Pastilles",ps.length,1,1)+
        numProp("fePitch","Pas (mm)",fmt(fp.pitch,2),0.01,0.05,free)+
        numProp("feSpan","Écartement",fmt(fp.span,2),0.01,0.05,free)+
      '</div>'+
      '<div class="row">'+
        (free?'<button class="tb" id="feGen">Revenir au calcul</button>'
             :'<button class="tb" id="feFreeze">Dessiner à la main</button>')+
      '</div>'+
      '<div class="empty" style="padding:6px 0 0">'+
      (free?'Empreinte dessinée à la main : le pas et l&rsquo;écartement ne '+
            'commandent plus rien.'
           :'Empreinte calculée par ses trois cotes. Maintenez une pastille et '+
            'glissez-la : elle passe en dessin à la main, et chaque pastille '+
            'devient réglable à part.')+
      '</div>'+
    '</div>'+
    '<div class="cat">Pastille '+(q?esc(q.n):"&mdash;")+'</div>'+
    '<div class="prop">'+
      (q?
        '<div class="row" style="margin-top:0">'+
          numProp("feN","N&deg;",q.n,1,1)+
          numProp("feX","X (mm)",fmt(q.x,3),0.05,-10000)+
          numProp("feY","Y (mm)",fmt(q.y,3),0.05,-10000)+
        '</div>'+
        '<div class="row">'+
          numProp("feW","Largeur",fmt(q.w,3),0.05,0.05)+
          numProp("feH","Hauteur",fmt(q.h,3),0.05,0.05)+
          numProp("feRot","Rotation (°)",fmt(q.rot||0,1),5,0)+
        '</div>'+
        '<div class="prop" style="padding:8px 0 0;border:0">'+
          '<label>Forme</label><select id="feShape">'+
          Object.keys(PAD_SHAPES).map(k=>'<option value="'+esc(k)+'"'+
            (q.shape===k?" selected":"")+'>'+esc(PAD_SHAPES[k])+'</option>').join("")+
          '</select>'+
        '</div>'+
        '<div class="row">'+
          numProp("feDrill","Perçage (0 = CMS)",fmt(q.drill,3),0.05,0)+
          '<div><label>&nbsp;</label>'+
          '<button class="tb" id="feSq" title="Hauteur = largeur">Carré</button></div>'+
          '<div><label>&nbsp;</label>'+
          '<button class="tb" id="feAll">Appliquer à toutes</button></div>'+
        '</div>'+
        '<div class="row">'+
          '<button class="tb" id="feAdd">+ pastille</button>'+
          '<button class="tb" id="feDel">Supprimer</button>'+
        '</div>'
       :'<div class="empty" style="padding:0">Aucune pastille.</div>')+
    '</div>'+
    '<div class="cat">Origine</div>'+
    '<div class="prop">'+
      '<div class="row" style="margin-top:0">'+
        numProp("feOx","Décaler de X",fmt(0,2),0.05,-10000)+
        numProp("feOy","Décaler de Y",fmt(0,2),0.05,-10000)+
        '<div><label>&nbsp;</label>'+
        '<button class="tb" id="feOc">Centrer</button></div>'+
      '</div>'+
      '<div class="empty" style="padding:6px 0 0">'+
      'La croix jaune est le point d&rsquo;accrochage de l&rsquo;empreinte : '+
      'c&rsquo;est par elle qu&rsquo;on la déplace sur la carte, et autour '+
      'd&rsquo;elle qu&rsquo;elle pivote. Glissez-la, ou saisissez un décalage. '+
      (fpIsCentered(fp)
        ?'Elle est au centre du composant.'
        :'<b>Le centre du composant est à '+fmt(off.x,2)+" / "+fmt(off.y,2)+
         ' mm d&rsquo;ici : la fermeture de cette fenêtre y ramènera '+
         'l&rsquo;origine.</b>')+
      '</div>'+
    '</div>'+
    '<div class="cat">Repère de broche 1</div>'+
    '<div class="prop">'+
      '<label class="check"><input type="checkbox" id="feMk"'+(mk?" checked":"")+'> '+
      'Point de sérigraphie</label>'+
      (mk?'<div class="row">'+
          numProp("feMx","X (mm)",fmt(mk.x,2),0.05,-10000)+
          numProp("feMy","Y (mm)",fmt(mk.y,2),0.05,-10000)+
          numProp("feMd","Diamètre",fmt(mk.d,2),0.05,0.1)+
        '</div>':"")+
      '<div class="empty" style="padding:6px 0 0">'+
      (mk?'Glissez le point blanc où il se lit le mieux : il sort tel quel sur '+
          'le film de sérigraphie.'
         :'Pas de repère : les deux pattes se valent (résistance, inductance, '+
          'condensateur non polarisé) ou il a été retiré à la main.')+
      '</div>'+
    '</div>'+
    '<div class="cat">Contour de sérigraphie</div>'+
    '<div class="prop">'+
      '<div class="row" style="margin-top:0">'+
        numProp("feBw","Largeur",fmt(b.x2-b.x1,2),0.1,0.1)+
        numProp("feBh","Hauteur",fmt(b.y2-b.y1,2),0.1,0.1)+
        '<div><label>&nbsp;</label>'+
        '<button class="tb" id="feBauto">Automatique</button></div>'+
      '</div>'+
      '<div class="empty" style="padding:6px 0 0">'+
      (fp.body?"Contour réglé à la main.":"Contour déduit des pastilles.")+
      '</div>'+
    '</div>'+
    '<div class="cat">Pastilles</div>'+
    '<div class="pads" id="fePads"></div>'+
    '<div class="cat">Bibliothèque</div>'+
    '<div class="prop">'+
      '<label>Enregistrer sous</label>'+
      '<input id="feName" value="'+esc(fp.pkg||fp.ref||"")+'" maxlength="48" '+
        'placeholder="DIP-8 large, connecteur maison&hellip;">'+
      '<div class="row"><button class="tb" id="feSave">Enregistrer</button></div>'+
      '<label style="margin-top:10px">Empreintes enregistrées ('+names.length+')</label>'+
      '<select id="feLib">'+
        (names.length
          ?names.map(n=>'<option value="'+esc(n)+'">'+esc(n)+'</option>').join("")
          :'<option value="">&mdash; aucune &mdash;</option>')+
      '</select>'+
      '<div class="row">'+
        '<button class="tb" id="feApply"'+(names.length?"":" disabled")+'>Appliquer</button>'+
        '<button class="tb" id="feDrop"'+(names.length?"":" disabled")+'>Retirer</button>'+
      '</div>'+
      '<div class="row">'+
        '<button class="tb" id="feExport"'+(names.length?"":" disabled")+'>Exporter .json</button>'+
        '<button class="tb" id="feImport">Importer .json&hellip;</button>'+
      '</div>'+
      '<div class="empty" style="padding:8px 0 0">Les empreintes enregistrées '+
      'restent dans ce navigateur ; le .json les emporte sur une autre machine '+
      'ou dans un autre projet.</div>'+
    '</div>';
  $("feSide").innerHTML=h;
  feWire();
  fePads();
}
/* Un champ numérique du panneau : instantané, mutation, remise à niveau. */
function feNum(id,fn){
  const el=$(id);
  if(!el)return;
  el.onchange=()=>{
    const v=parseFloat(el.value);
    if(!Number.isFinite(v)){feSync();return;}
    fePush();
    fn(v);
    feSync();
  };
}
function feWire(){
  const fp=FE.fp;
  const st=$("feStyle");
  if(st)st.onchange=()=>{
    fePush();
    fp.style=st.value;
    const g=defaultGeom(fp.style);
    fp.pitch=g.pitch;fp.span=g.span;
    fpClearGeom(fp);
    feSync();
  };
  feNum("fePins",v=>fpSetPins(fp,v));
  feNum("fePitch",v=>fp.pitch=clamp(r3(v),0.05,100));
  feNum("feSpan",v=>fp.span=clamp(r3(v),0.05,1000));
  const fz=$("feFreeze");
  if(fz)fz.onclick=()=>{
    fePush();fpFreeze(fp);feSync();
    feHint("Empreinte figée : ses "+padsOf(fp).length+" pastilles se règlent "+
           "maintenant une par une.");
  };
  const gn=$("feGen");
  if(gn)gn.onclick=()=>{
    if(!confirm("Revenir à l'empreinte calculée ? Les pastilles placées à la "+
                "main seront perdues."))return;
    fePush();fpGeneric(fp);FE.sel=0;feSync();
    feHint("Empreinte rendue au calcul automatique.");
  };
  /* pastille sélectionnée */
  for(const [id,k] of [["feN","n"],["feX","x"],["feY","y"],["feW","w"],
                       ["feH","h"],["feRot","rot"],["feDrill","drill"]])
    feNum(id,v=>fpSetPad(fp,FE.sel,k,v));
  const sh=$("feShape");
  if(sh)sh.onchange=()=>{fePush();fpSetPad(fp,FE.sel,"shape",sh.value);feSync();};
  const sq=$("feSq");
  if(sq)sq.onclick=()=>{
    const p=padsOf(fp)[FE.sel];
    if(!p)return;
    fePush();fpSetPad(fp,FE.sel,"h",p.w);feSync();
    feHint("Pastille "+p.n+" carrée : "+fmt(p.w,3)+" mm de côté. En forme "+
           "« angles droits » c'est un carré franc, en « rond » un disque.");
  };
  /* repère de broche 1 */
  const mkb=$("feMk");
  if(mkb)mkb.onchange=()=>{
    fePush();fpSetMark(fp,mkb.checked);feSync();
    feHint(mkb.checked
      ?"Point de repère posé : maintenez-le et glissez-le où il se lit le mieux."
      :"Point de repère retiré. Il ne reviendra pas de lui-même, même si le "+
       "repère du composant change.");
  };
  feNum("feMx",v=>fpMoveMark(fp,v,fpMark(fp).y));
  feNum("feMy",v=>fpMoveMark(fp,fpMark(fp).x,v));
  feNum("feMd",v=>fpSetMarkD(fp,v));
  /* origine : un décalage saisi, ou le recentrage d'un clic */
  feNum("feOx",v=>feOriginMove(v,0));
  feNum("feOy",v=>feOriginMove(0,v));
  const oc=$("feOc");
  if(oc)oc.onclick=()=>{
    if(fpIsCentered(fp)){
      feHint("L'origine est déjà au centre du composant.");
      return;
    }
    const c=fpOffCenter(fp);
    fePush();feOriginMove(c.x,c.y);feSync();
    feHint("Origine ramenée au centre du composant : le cuivre n'a pas bougé, "+
           "seule la poignée par laquelle on le déplace.");
  };
  const all=$("feAll");
  if(all)all.onclick=()=>{
    const q=padsOf(fp)[FE.sel];
    if(!q)return;
    fePush();fpFreeze(fp);
    for(let i=0;i<fp.pads.length;i++){
      if(i===FE.sel)continue;
      fpSetPad(fp,i,"w",q.w);fpSetPad(fp,i,"h",q.h);
      fpSetPad(fp,i,"shape",q.shape);fpSetPad(fp,i,"drill",q.drill);
    }
    const n=fp.pads.length-1;
    feSync();
    feHint("Dimensions, forme et perçage de la pastille "+q.n+" appliqués aux "+
           n+" autre"+(n>1?"s":"")+".");
  };
  const ad=$("feAdd");
  if(ad)ad.onclick=()=>{
    fePush();FE.sel=fpAddPad(fp);feSync();
    feHint("Pastille ajoutée à droite du nuage : maintenez-la et glissez-la "+
           "à sa place.");
  };
  const de=$("feDel");
  if(de)de.onclick=()=>{
    fePush();
    if(!fpDelPad(fp,FE.sel)){
      feHint('<span class="warn">Une empreinte garde au moins une pastille.</span>');
      return;
    }
    feSync();
    feHint("Pastille supprimée. Les numéros des autres n'ont pas bougé : "+
           "le net de la broche 5 reste celui de la broche 5.");
  };
  /* contour */
  feNum("feBw",v=>feBody(v,null));
  feNum("feBh",v=>feBody(null,v));
  const ba=$("feBauto");
  if(ba)ba.onclick=()=>{
    fePush();fpSetBody(fp,null);feSync();
    feHint("Contour rendu au calcul : il suit les pastilles.");
  };
  /* bibliothèque */
  const sv=$("feSave");
  if(sv)sv.onclick=feSaveLib;
  const ap=$("feApply");
  if(ap)ap.onclick=feApplyLib;
  const dr=$("feDrop");
  if(dr)dr.onclick=()=>{
    const n=$("feLib").value;
    if(!n)return;
    if(!confirm("Retirer « "+n+" » de la bibliothèque ?"))return;
    fpLibDel(n);feSide();
    feHint("« "+esc(n)+" » retirée de la bibliothèque. Les empreintes déjà "+
           "posées sur la carte ne changent pas.");
  };
  const ex=$("feExport");
  if(ex)ex.onclick=()=>{
    const f=fpLibFile(null);
    if(!f.footprints.length){feHint("Bibliothèque vide : rien à exporter.");return;}
    dl(new Blob([JSON.stringify(f,null,1)],{type:"application/json"}),
       "empreintes.json");
    feHint(f.footprints.length+" empreinte(s) exportée(s) dans empreintes.json.");
  };
  const im=$("feImport");
  if(im)im.onclick=()=>$("feFile").click();
}
/* Le contour se règle en largeur et hauteur, autour du centre de l'empreinte :
   c'est ainsi qu'on le lit sur une fiche, et les pastilles ne bougent pas. */
function feBody(w,h){
  const fp=FE.fp, b=bodyOf(fp);
  const cx=(b.x1+b.x2)/2, cy=(b.y1+b.y2)/2;
  const bw=Math.max(0.1,w==null?(b.x2-b.x1):w);
  const bh=Math.max(0.1,h==null?(b.y2-b.y1):h);
  fpSetBody(fp,{x1:cx-bw/2,y1:cy-bh/2,x2:cx+bw/2,y2:cy+bh/2});
}
function feSaveLib(){
  const fp=FE.fp, name=($("feName").value||"").trim();
  if(!name){
    feHint('<span class="warn">Donnez un nom à l&rsquo;empreinte avant de '+
           'l&rsquo;enregistrer.</span>');
    return;
  }
  const exists=!!fpLibGet(name);
  if(exists&&!confirm("« "+name+" » existe déjà dans la bibliothèque. "+
                      "La remplacer ?"))return;
  const d=fpLibPut(fpDefOf(fp,name));
  if(!d){
    feHint('<span class="warn">Le navigateur refuse d&rsquo;enregistrer '+
      '(stockage plein ou navigation privée). Exportez un .json pour ne rien '+
      'perdre.</span>');
    return;
  }
  feSide();
  const s=$("feLib");
  if(s)s.value=d.name;
  feHint("« "+esc(d.name)+" » "+(exists?"remplacée":"enregistrée")+" dans la "+
         "bibliothèque "+(d.pads?"("+d.pads.length+" pastilles dessinées)"
                                :"(empreinte calculée)")+".");
}
function feApplyLib(){
  const n=$("feLib").value, d=fpLibGet(n);
  if(!d){
    feHint('<span class="warn">Empreinte introuvable dans la bibliothèque.</span>');
    return;
  }
  fePush();
  if(!fpApplyDef(FE.fp,d)){
    feHint('<span class="warn">Empreinte illisible : rien n&rsquo;a changé.</span>');
    return;
  }
  FE.sel=0;feSync();
  feHint("« "+esc(n)+" » appliquée à "+esc(FE.fp.ref)+". Le repère, la position "+
         "et les nets n'ont pas bougé.");
}
/* Import d'un .json : les empreintes rejoignent la bibliothèque, rien n'est
   appliqué d'office — c'est à l'utilisateur de choisir sur quel composant. */
function feImportText(txt,fname){
  const r=fpLibParse(txt);
  if(r.err){feHint('<span class="warn">'+esc(r.err)+'</span>');return;}
  const m=fpLibMerge(r.defs);
  feSide();
  if(m.err){feHint('<span class="warn">'+esc(m.err)+'</span>');return;}
  const s=$("feLib");
  if(s&&m.added.length)s.value=m.added[0];
  feHint(m.added.length+" empreinte(s) importée(s) de "+esc(fname||"fichier")+
    (m.renamed.length?" ("+m.renamed.length+" renommée(s) : le nom était déjà "+
      "pris par une autre empreinte)":"")+". « Appliquer » la pose sur "+
    esc(FE.fp.ref)+".");
}

/* ---------- liste des pastilles ---------- */
function fePads(){
  const box=$("fePads"), ps=padsOf(FE.fp);
  let h="";
  ps.forEach((q,i)=>{
    h+='<div class="padrow'+(i===FE.sel?" on":"")+'" data-i="'+i+'">'+
       '<span class="pn">'+esc(q.n)+'</span>'+
       '<span class="pxy">'+fmt(q.x,2)+" , "+fmt(q.y,2)+'</span>'+
       '<span class="pwh">'+fmt(q.w,2)+"&times;"+fmt(q.h,2)+
         (q.drill>0?" &#8960;"+fmt(q.drill,2):"")+'</span>'+
       '<span class="pnet">'+(q.net?esc(q.net):"&mdash;")+'</span></div>';
  });
  box.innerHTML=h;
  box.querySelectorAll(".padrow").forEach(row=>{
    row.onpointerdown=()=>{FE.sel=+row.dataset.i;feSide();feDraw();};
  });
}

/* ---------- dessin ---------- */
function feGrid(c,W,H){
  const step=(S.grid>0?S.grid:1)*FE.z;
  if(step<5)return;
  const x0=((FE.cx%step)+step)%step, y0=((FE.cy%step)+step)%step;
  c.strokeStyle=C_GRID;c.lineWidth=1;c.beginPath();
  for(let x=x0;x<W;x+=step){c.moveTo(Math.round(x)+.5,0);c.lineTo(Math.round(x)+.5,H);}
  for(let y=y0;y<H;y+=step){c.moveTo(0,Math.round(y)+.5);c.lineTo(W,Math.round(y)+.5);}
  c.stroke();
  /* axes du repère de l'empreinte : l'origine est le point d'accrochage sur la
     carte, c'est lui qui tombe sur la grille du plan */
  c.strokeStyle=C_GRIDMAJ;c.beginPath();
  c.moveTo(Math.round(FE.cx)+.5,0);c.lineTo(Math.round(FE.cx)+.5,H);
  c.moveTo(0,Math.round(FE.cy)+.5);c.lineTo(W,Math.round(FE.cy)+.5);
  c.stroke();
}
/* Pastille du repère local, telle que l'attendent padPath() et padDist() :
   le même objet, la rotation passée en radians. */
function fePad(q){
  return {x:q.x, y:q.y, w:q.w, h:q.h, shape:q.shape,
          rot:(q.rot||0)*Math.PI/180, drill:q.drill};
}
/* Pastilles superposées : deux plages qui se recouvrent sont soudées l'une à
   l'autre, et rien dans le dessin ne le dit. On les cerne en rouge. Le critère
   est celui du DRC — la plus fine ramenée à un disque — pour que la fenêtre et
   le contrôle ne se contredisent jamais. */
function feOverlap(ps){
  const bad=new Set();
  for(let i=0;i<ps.length;i++)
    for(let j=i+1;j<ps.length;j++){
      const a=ps[i], b=ps[j];
      if(padDist(a.x,a.y,fePad(b))-Math.min(a.w,a.h)/2<-1e-6){bad.add(i);bad.add(j);}
    }
  return bad;
}
function feDraw(){
  const fp=FE.fp, cv=$("feCv");
  if(!fp||!cv)return;
  const dpr=window.devicePixelRatio||1;
  const W=cv.clientWidth||520, H=cv.clientHeight||420;
  cv.width=Math.round(W*dpr);cv.height=Math.round(H*dpr);
  const c=cv.getContext("2d");
  if(!c)return;
  const ps=padsOf(fp), b=bodyOf(fp), mk=fpMark(fp);
  /* Cadrage automatique, tant que la molette n'a pas pris la main. L'origine
     et le point de repère y entrent : sans cela, les éloigner du composant les
     ferait sortir de la fenêtre sans qu'on voie pourquoi. */
  if(FE.fit){
    let x1=Math.min(b.x1,0),y1=Math.min(b.y1,0),
        x2=Math.max(b.x2,0),y2=Math.max(b.y2,0);
    for(const q of ps){
      const hf=padHalf(q);
      x1=Math.min(x1,q.x-hf.x);x2=Math.max(x2,q.x+hf.x);
      y1=Math.min(y1,q.y-hf.y);y2=Math.max(y2,q.y+hf.y);
    }
    if(mk){
      x1=Math.min(x1,mk.x-mk.d);x2=Math.max(x2,mk.x+mk.d);
      y1=Math.min(y1,mk.y-mk.d);y2=Math.max(y2,mk.y+mk.d);
    }
    const m=2.5;                                  // marge, en millimètres
    const zf=clamp(Math.min(W/(x2-x1+2*m),H/(y2-y1+2*m)),2,600);
    FE.z=zf;FE.cx=W/2-(x1+x2)/2*zf;FE.cy=H/2-(y1+y2)/2*zf;
  }
  const z=FE.z;
  $("feZoom").textContent=Math.round(z*20)+" %";

  c.setTransform(dpr,0,0,dpr,0,0);
  c.fillStyle=C_BG;c.fillRect(0,0,W,H);
  feGrid(c,W,H);
  c.setTransform(dpr*z,0,0,dpr*z,dpr*FE.cx,dpr*FE.cy);
  /* contour de sérigraphie */
  c.strokeStyle=fp.side?C_SILK_B:C_SILK_T;c.lineWidth=1/z;
  c.strokeRect(b.x1,b.y1,b.x2-b.x1,b.y2-b.y1);
  /* cuivre : la face de pose donne la couleur, une traversante est jaune —
     mêmes conventions que la carte */
  const col=cuColor(fp.side?S.cu-1:0,S.cu);
  const bad=feOverlap(ps);
  ps.forEach((q,i)=>{
    const p=fePad(q);
    padFill(c,p,0,q.drill>0?C_THRU:col);
    if(q.drill>0){
      c.fillStyle=C_DRILL;
      c.beginPath();c.arc(q.x,q.y,q.drill/2,0,Math.PI*2);c.fill();
    }
    if(bad.has(i))padOutline(c,p,C_ERR,2/z);
    else if(i===FE.sel)padOutline(c,p,C_SEL,2/z);
  });
  /* numéros de broche, en pixels écran : leur taille ne dépend pas du cadrage */
  c.setTransform(dpr,0,0,dpr,0,0);
  c.font='bold 10px "Segoe UI",system-ui,sans-serif';
  c.textAlign="center";c.textBaseline="middle";
  ps.forEach((q,i)=>{
    c.fillStyle=(i===FE.sel)?C_SEL:(bad.has(i)?C_ERR:"#0d0f12");
    c.fillText(String(q.n),FE.cx+q.x*z,FE.cy+q.y*z);
  });
  /* Point de repère de la broche 1, à son diamètre réel — c'est ce qui sortira
     sur le film. Le halo ne dit que ceci : il y a là quelque chose à saisir. */
  if(mk){
    const sx=FE.cx+mk.x*z, sy=FE.cy+mk.y*z, r=Math.max(2,mk.d/2*z);
    if(FE.drag&&FE.drag.mark){
      c.fillStyle="rgba(255,255,255,.18)";
      c.beginPath();c.arc(sx,sy,r+7,0,Math.PI*2);c.fill();
    }
    c.fillStyle=fp.side?C_SILK_B:C_SILK_T;
    c.beginPath();c.arc(sx,sy,r,0,Math.PI*2);c.fill();
    c.strokeStyle="rgba(20,20,22,.65)";c.lineWidth=1;
    c.beginPath();c.arc(sx,sy,r,0,Math.PI*2);c.stroke();
  }
  /* Origine : cercle et croix jaunes, comme l'origine de la carte. La poignée
     se saisit à la souris ; le halo dit qu'il y a quelque chose à attraper. */
  feOriginMark(c,FE.drag&&FE.drag.origin);
  c.setTransform(1,0,0,1,0,0);
  if(!$("feHint").innerHTML)
    feHint("Maintenez une pastille pour la déplacer &middot; <b>R</b> la tourne "+
      "d&rsquo;un quart de tour &middot; <b>Alt</b> relâche l&rsquo;accrochage "+
      "&middot; molette pour zoomer, <b>Maj</b> ou bouton du milieu pour "+
      "déplacer la vue.<br>Les cotes sont en millimètres, comptées depuis la "+
      "croix jaune : c&rsquo;est l&rsquo;origine de l&rsquo;empreinte, le point "+
      "par lequel elle tient sur la carte.");
}

function feOriginMark(c,actif){
  const r=12;
  c.fillStyle="rgba(242,199,68,.16)";
  c.beginPath();c.arc(FE.cx,FE.cy,actif?r:r*0.8,0,Math.PI*2);c.fill();
  c.strokeStyle="#f2c744";c.lineWidth=actif?2:1.4;
  c.beginPath();c.arc(FE.cx,FE.cy,r*0.55,0,Math.PI*2);c.stroke();
  c.beginPath();
  c.moveTo(FE.cx-r,FE.cy);c.lineTo(FE.cx+r,FE.cy);
  c.moveTo(FE.cx,FE.cy-r);c.lineTo(FE.cx,FE.cy+r);
  c.stroke();
  c.fillStyle="#f2c744";
  c.font='bold 10px "Segoe UI",system-ui,sans-serif';
  c.textAlign="left";c.textBaseline="middle";
  c.fillText("0,0",FE.cx+r+4,FE.cy-r+2);
  c.textAlign="center";
}

/* ---------- souris ---------- */
function feAt(e){
  const cv=$("feCv"), r=cv.getBoundingClientRect();
  return {x:(e.clientX-r.left-FE.cx)/FE.z, y:(e.clientY-r.top-FE.cy)/FE.z};
}
/* L'accrochage reprend le pas de la carte : une pastille se pose sur la même
   trame que les pistes qui viendront la rejoindre. Alt le relâche, pour les
   cotes qui ne tombent pas sur la grille (un pas de 0,65 mm, par exemple). */
function feSnap(v,e){
  if(e&&(e.altKey||!(S.grid>0)))return r3(v);
  return r3(Math.round(v/S.grid)*S.grid);
}
function feHit(p){
  const ps=padsOf(FE.fp);
  let best=-1, bd=1e9;
  ps.forEach((q,i)=>{
    const d=padDist(p.x,p.y,fePad(q));
    if(d<=Math.max(0.15,4/FE.z)&&d<bd){bd=d;best=i;}
  });
  return best;
}
/* La croix d'origine s'attrape dans les douze pixels autour d'elle. Une
   pastille passe devant : le cuivre se choisit toujours d'abord, et l'origine
   qu'une pastille recouvre se déplace par les champs du panneau. */
function feHitOrigin(p){return Math.hypot(p.x,p.y)<=12/FE.z;}
/* Le point de repère s'attrape dans les neuf pixels autour de lui, avant les
   pastilles : il est petit, et c'est ce qui le rend saisissable. */
function feHitMark(p){
  const mk=fpMark(FE.fp);
  if(!mk)return false;
  return Math.hypot(p.x-mk.x,p.y-mk.y)<=Math.max(mk.d/2,9/FE.z);
}
function feDown(e){
  if(!FE.open)return;
  /* Panoramique : bouton du milieu, ou Maj enfoncée — la place vide sert déjà
     à poser une pastille, et Alt à relâcher l'accrochage. */
  if(e.button===1||(e.button===0&&e.shiftKey)){
    FE.drag={pan:true,sx:e.clientX,sy:e.clientY,cx:FE.cx,cy:FE.cy};
    FE.fit=false;
    try{$("feCv").setPointerCapture(e.pointerId);}catch(_){}
    return;
  }
  if(e.button!==0)return;
  const p=feAt(e), i=feHit(p);
  const grab=k=>{
    /* `refit` retient qu'il faudra rendre le cadrage automatique au relâcher :
       pendant le geste, il reste figé pour que le dessin ne glisse pas. */
    FE.drag=Object.assign({x:p.x,y:p.y,refit:FE.fit},k);
    FE.fit=false;
    try{$("feCv").setPointerCapture(e.pointerId);}catch(_){}
  };
  if(feHitMark(p)){
    grab({mark:true});
    feDraw();
    feHint("Maintenez et glissez le point de repère : c&rsquo;est un disque de "+
      "sérigraphie, il sortira tel quel sur le film. La case du panneau le "+
      "retire.");
    return;
  }
  if(i>=0){
    FE.sel=i;grab({i:i});
    feSide();feDraw();
    return;
  }
  if(feHitOrigin(p)){
    grab({origin:true});
    feDraw();
    feHint("Maintenez et glissez l&rsquo;origine. Le cuivre ne bouge pas : "+
      "c&rsquo;est la poignée de l&rsquo;empreinte qui se déplace, et la "+
      "fermeture de la fenêtre la ramènera au centre du composant.");
    return;
  }
  /* Place vide : rien. Une pastille se prend et se glisse, comme une empreinte
     sur la carte — un clic dans le vide la faisait sauter là, et l'on s'en
     apercevait après coup. */
}
/* Le geste applique le DÉCALAGE entre deux positions accrochées à la grille,
   comme le déplacement d'une empreinte sur la carte. Ce qu'on tient ne saute
   donc pas sous le pointeur : une pastille se prend par son bord et garde son
   écart au curseur, et une cote qui ne tombe pas sur la grille — un pas de
   0,65 mm — n'y est pas ramenée de force. */
function feMove(e){
  if(!FE.open||!FE.drag)return;
  const g=FE.drag;
  if(g.pan){
    FE.cx=g.cx+(e.clientX-g.sx);
    FE.cy=g.cy+(e.clientY-g.sy);
    feDraw();
    return;
  }
  const p=feAt(e);
  const dx=feSnap(p.x,e)-feSnap(g.x,e), dy=feSnap(p.y,e)-feSnap(g.y,e);
  if(!dx&&!dy)return;
  fePush();
  if(g.mark){
    const m=fpMark(FE.fp);
    if(m&&fpMoveMark(FE.fp,m.x+dx,m.y+dy)){g.x+=dx;g.y+=dy;feSync();}
    return;
  }
  if(g.origin){
    /* Le point saisi ne bouge pas, lui : le repère recule de (dx, dy) et la vue
       avance d'autant, donc la position d'où part le geste garde la même
       coordonnée locale. La décaler en plus comptait chaque pas deux fois. */
    if(feOriginMove(dx,dy))feSync();
    return;
  }
  const q=padsOf(FE.fp)[g.i];
  if(q&&fpMovePad(FE.fp,g.i,q.x+dx,q.y+dy)){g.x+=dx;g.y+=dy;feSync();}
}
function feUp(){
  if(!FE.drag)return;
  const refit=FE.drag.refit;
  FE.drag=null;
  if(refit)FE.fit=true;                 // un seul recadrage, à la fin du geste
  feDraw();
}
