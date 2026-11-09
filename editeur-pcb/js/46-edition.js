/* ==========================================================================
   46-edition.js — l'édition de tous les jours, à la manière d'Altium
   --------------------------------------------------------------------------
   - le FILTRE DE SÉLECTION : ce que le clic et le lasso ont le droit de prendre
     (`filtreOk` est lu par `hitTest`, `filtreAppliquer` par le lasso) ;
   - le VERROU : un objet verrouillé se sélectionne, mais `verrousRetirer` le
     sort de la sélection avant tout déplacement, rotation, retournement,
     coupe ou suppression ;
   - ALIGNER et RÉPARTIR les composants, par la porte des boîtiers
     (`transformFps`) : leurs pistes suivent comme au glisser ;
   - SÉLECTIONNER LES SEMBLABLES de l'objet sélectionné ;
   - le COLLAGE EN RÉSEAU, en ligne ou en cercle ;
   - la LARGEUR SUIVANTE en plein tracé (W) et l'UNITÉ mm / mil (Q).
   ========================================================================== */

/* ---------- filtre de sélection ---------- */
const FILTRE_TYPES=["fps","tracks","vias","zones","drawings","holes","autres"];
/* Le filtre ne vaut qu'en mode Sélection : le serpentin vise une piste, la
   mesure une pastille, quel que soit le filtre. */
function filtreOk(k){return S.mode!=="select"||!S.filtre||S.filtre[k]!==false;}
function filtreActif(){return FILTRE_TYPES.some(k=>S.filtre[k]===false);}
/* ce que le lasso (ou Ctrl+A) a pris en trop, retiré */
function filtreAppliquer(){
  const f=S.filtre||{}, s=S.sel;
  if(f.fps===false)s.fps.clear();
  if(f.tracks===false)s.tracks.clear();
  if(f.vias===false)s.vias.clear();
  if(f.zones===false){s.zones.clear();s.cuts.clear();}
  if(f.drawings===false&&s.drawings)s.drawings.clear();
  if(f.holes===false&&s.holes)s.holes.clear();
  if(f.autres===false){s.edge=false;if(s.decoupes)s.decoupes.clear();if(s.interdits)s.interdits.clear();}
}
function filtreSync(){
  const pop=$("filtrePop");
  if(!pop)return;
  for(const c of pop.querySelectorAll("input[data-filtre]"))c.checked=S.filtre[c.dataset.filtre]!==false;
  const t=pop.parentNode&&pop.parentNode.querySelector(".mnu-t");
  if(t)t.classList.toggle("filtre-on",filtreActif());
}
function filtrePoser(k,on){
  if(on)delete S.filtre[k];else S.filtre[k]=false;
  filtreAppliquer();filtreSync();refreshPanels();draw();
  const exclus=FILTRE_TYPES.filter(x=>S.filtre[x]===false).length;
  hint(exclus?"Filtre de sélection : "+exclus+" type(s) d'objet ignoré(s) par le clic et le lasso."
             :"Filtre de sélection : tout est sélectionnable.");
}

/* ---------- verrou ---------- */
/* les objets sélectionnés qui peuvent porter un verrou */
function selVerrouillables(){
  return [...[...S.sel.fps].map(fpById).filter(Boolean),...S.sel.tracks,...S.sel.vias,
          ...S.sel.zones,...selDrawingsPcb(),...selHolesPcb()];
}
function verrouPoser(on){
  const L=selVerrouillables();
  if(!L.length){hint("Sélectionnez d'abord ce qu'il faut "+(on?"verrouiller":"déverrouiller")+".");return 0;}
  push();
  for(const o of L){if(on)o.locked=true;else delete o.locked;}
  touch();refreshPanels();draw();
  hint(L.length+" objet(s) "+(on?"verrouillé(s) : ni déplacés, ni tournés, ni supprimés tant qu'ils le restent."
                               :"déverrouillé(s)."));
  return L.length;
}
/* Sort de la sélection ce qui est verrouillé. Rend combien ; le dit s'il y en a. */
function verrousRetirer(){
  const s=S.sel;
  let n=0;
  const sortir=(set,obj)=>{for(const k of [...set]){const o=obj(k);if(o&&o.locked){set.delete(k);n++;}}};
  sortir(s.fps,fpById);
  sortir(s.tracks,o=>o);
  sortir(s.vias,o=>o);
  sortir(s.zones,o=>o);
  if(s.drawings)sortir(s.drawings,id=>(S.drawings||[]).find(d=>d.id===id));
  if(s.holes)sortir(s.holes,id=>(S.holes||[]).find(h=>h.id===id));
  if(n)hint(n+" objet(s) verrouillé(s) laissé(s) tel(s) quel(s) — Déverrouiller pour les modifier.");
  return n;
}

/* ---------- aligner et répartir ---------- */
const ALIGNER_NOMS={gauche:"alignés à gauche",droite:"alignés à droite",haut:"alignés en haut",bas:"alignés en bas",
  centreX:"centrés sur une verticale",centreY:"centrés sur une horizontale",
  repH:"répartis horizontalement",repV:"répartis verticalement"};
/* Le décalage de chaque boîtier, d'après son encombrement (`fpBBox`). Répartir
   garde les deux extrêmes et égalise les vides entre les boîtiers. */
function alignerDecalages(fps,mode){
  const B=fps.map(f=>({f,b:fpBBox(f)}));
  const X1=Math.min(...B.map(o=>o.b.x1)), X2=Math.max(...B.map(o=>o.b.x2));
  const Y1=Math.min(...B.map(o=>o.b.y1)), Y2=Math.max(...B.map(o=>o.b.y2));
  const out=new Map();
  if(mode==="repH"||mode==="repV"){
    const h=mode==="repH", a=h?"x1":"y1", z=h?"x2":"y2";
    B.sort((p,q)=>p.b[a]-q.b[a]);
    const somme=B.reduce((s,o)=>s+o.b[z]-o.b[a],0);
    const vide=((h?X2-X1:Y2-Y1)-somme)/(B.length-1);
    let c=h?X1:Y1;
    for(const o of B){
      const d=c-o.b[a];
      out.set(o.f,h?{dx:d,dy:0}:{dx:0,dy:d});
      c+=o.b[z]-o.b[a]+vide;
    }
    return out;
  }
  for(const {f,b} of B){
    const d={gauche:{dx:X1-b.x1,dy:0},droite:{dx:X2-b.x2,dy:0},
             haut:{dx:0,dy:Y1-b.y1},bas:{dx:0,dy:Y2-b.y2},
             centreX:{dx:(X1+X2-b.x1-b.x2)/2,dy:0},centreY:{dx:0,dy:(Y1+Y2-b.y1-b.y2)/2}}[mode];
    out.set(f,d);
  }
  return out;
}
function alignerFps(mode){
  if(!ALIGNER_NOMS[mode])return 0;
  verrousRetirer();
  // vue de dessous : la gauche de l'écran est la droite de la carte
  if(S.flip&&(mode==="gauche"||mode==="droite"))mode=mode==="gauche"?"droite":"gauche";
  const fps=[...S.sel.fps].map(fpById).filter(Boolean);
  const rep=mode==="repH"||mode==="repV";
  if(fps.length<(rep?3:2)){
    hint("Sélectionnez au moins "+(rep?"trois":"deux")+" composants non verrouillés.");
    return 0;
  }
  const D=alignerDecalages(fps,mode);
  const bouger=()=>{for(const f of fps){const d=D.get(f);f.x=r3(f.x+d.dx);f.y=r3(f.y+d.dy);}};
  const gene=fpEssai(bouger);
  if(gene){fpRefus(gene);return 0;}
  push();
  transformFps(fps.map(f=>f.id),bouger);
  touch();refreshPanels();draw();
  hint(fps.length+" composants "+ALIGNER_NOMS[mode]+" — leurs pistes ont suivi. Ctrl+Z annule.");
  return fps.length;
}

/* ---------- sélectionner les semblables ---------- */
const SEMBLABLE_NOMS={net:"même net",couche:"même couche",taille:"même largeur / taille",
  boitier:"même boîtier / forme",valeur:"même valeur"};
/* La règle, d'après l'objet de référence : null si le critère n'a pas de sens
   pour lui (le net d'un trait de sérigraphie). */
function semblableRegle(crit){
  const fp=[...S.sel.fps].map(fpById).find(Boolean);
  if(fp){
    const r={couche:f=>f.side===fp.side,boitier:f=>f.pkg===fp.pkg&&f.style===fp.style,
             valeur:f=>f.value===fp.value}[crit];
    return r?{liste:S.fps,set:S.sel.fps,cle:f=>f.id,ok:r}:null;
  }
  const t=[...S.sel.tracks][0];
  if(t){
    const r={net:o=>o.net===t.net,couche:o=>o.l===t.l,taille:o=>Math.abs(o.w-t.w)<1e-6}[crit];
    return r?{liste:S.tracks,set:S.sel.tracks,cle:o=>o,ok:r}:null;
  }
  const v=[...S.sel.vias][0];
  if(v){
    const r={net:o=>o.net===v.net,couche:o=>o.a===v.a&&o.b===v.b,
             taille:o=>Math.abs(o.d-v.d)<1e-6&&Math.abs(o.drill-v.drill)<1e-6}[crit];
    return r?{liste:S.vias,set:S.sel.vias,cle:o=>o,ok:r}:null;
  }
  const z=[...S.sel.zones][0];
  if(z){
    const r={net:o=>o.net===z.net,couche:o=>o.l===z.l}[crit];
    return r?{liste:S.zones.filter(o=>!o.larme),set:S.sel.zones,cle:o=>o,ok:r}:null;
  }
  const d=selDrawingsPcb()[0];
  if(d){
    const r={couche:o=>o.layer===d.layer,boitier:o=>o.shape===d.shape,
             taille:o=>Math.abs((o.width||0)-(d.width||0))<1e-6&&Math.abs((o.size||0)-(d.size||0))<1e-6,
             valeur:o=>o.shape==="text"&&o.text===d.text}[crit];
    if(!S.sel.drawings)S.sel.drawings=new Set();
    return r?{liste:S.drawings,set:S.sel.drawings,cle:o=>o.id,ok:r}:null;
  }
  return null;
}
function semblables(crit){
  if(!SEMBLABLE_NOMS[crit])return 0;
  if(!selCount()){hint("Sélectionnez d'abord l'objet de référence.");return 0;}
  const R=semblableRegle(crit);
  if(!R){hint("Le critère « "+SEMBLABLE_NOMS[crit]+" » ne s'applique pas à cet objet.");return 0;}
  let n=0;
  for(const o of R.liste)if(R.ok(o)&&!R.set.has(R.cle(o))){R.set.add(R.cle(o));n++;}
  filtreAppliquer();
  refreshPanels();draw();
  hint(n+" objet(s) de "+SEMBLABLE_NOMS[crit]+" ajouté(s) — le panneau Propriétés les modifie ensemble.");
  return n;
}

/* ---------- collage en réseau ---------- */
/* Tourne autour de (cx, cy), de `deg` degrés dans le sens direct à l'écran, ce
   que le collage vient de poser (la sélection courante). */
function selTourner(cx,cy,deg){
  const a=-deg*Math.PI/180, c=Math.cos(a), s=Math.sin(a);
  const T=(x,y)=>({x:r4(cx+(x-cx)*c-(y-cy)*s),y:r4(cy+(x-cx)*s+(y-cy)*c)});
  for(const id of S.sel.fps){const f=fpById(id);if(!f)continue;const p=T(f.x,f.y);f.x=r3(p.x);f.y=r3(p.y);f.rot=padRot((f.rot||0)+deg);}
  const seg=o=>{const A=T(o.x1,o.y1),B=T(o.x2,o.y2);o.x1=r3(A.x);o.y1=r3(A.y);o.x2=r3(B.x);o.y2=r3(B.y);};
  for(const t of S.sel.tracks)seg(t);
  for(const v of S.sel.vias){const p=T(v.x,v.y);v.x=r3(p.x);v.y=r3(p.y);}
  for(const z of [...S.sel.zones,...S.sel.cuts])z.pts=z.pts.map(q=>T(q.x,q.y));
  for(const h of selHolesPcb()){const p=T(h.x,h.y);h.x=r3(p.x);h.y=r3(p.y);if(h.w>h.d)h.rot=padRot((h.rot||0)+deg);}
  for(const d of selDrawingsPcb()){
    if(d.pts){d.pts=d.pts.map(q=>T(q.x,q.y));if(d.trous)d.trous=d.trous.map(t=>t.map(q=>T(q.x,q.y)));
      const b=polyBBox(d.pts);d.x1=b.x1;d.y1=b.y1;d.x2=b.x2;d.y2=b.y2;}
    else{seg(d);if(d.shape==="text"){d.x2=d.x1;d.y2=d.y1;d.rot=((d.rot||0)+deg)%360;}}
  }
}
/* `o` : {n, mode:"ligne", dx, dy} ou {n, mode:"cercle", angle, cx, cy}. La
   sélection d'origine compte pour la première ; n−1 copies sont posées. Les
   repères des copies sont renumérotés, les nets gardés (comme Ctrl+V). */
function collageReseau(o){
  const n=Math.round(+o.n);
  if(!(n>=2&&n<=500)){hint("Nombre de copies : de 2 à 500.");return 0;}
  verrousRetirer();
  const c=pcbClipContent();
  if(!c){hint("Sélectionnez d'abord ce qu'il faut répéter.");return 0;}
  const cercle=o.mode==="cercle";
  if(!cercle&&!(+o.dx)&&!(+o.dy)){hint("Pas nul : les copies se superposeraient.");return 0;}
  if(cercle&&!(+o.angle)){hint("Angle nul : les copies se superposeraient.");return 0;}
  push();
  const toutes={fps:[],tracks:[],vias:[],zones:[],cuts:[],drawings:[],holes:[]};
  for(let k=1;k<n;k++){
    pasteClipPcb({exact:true,clip:c,sansPush:true,
                  x:cercle?c.ox:c.ox+k*(+o.dx),y:cercle?c.oy:c.oy+k*(+o.dy)});
    if(cercle)selTourner(+o.cx,+o.cy,k*(+o.angle));
    toutes.fps.push(...S.sel.fps);toutes.tracks.push(...S.sel.tracks);toutes.vias.push(...S.sel.vias);
    toutes.zones.push(...S.sel.zones);toutes.cuts.push(...S.sel.cuts);
    toutes.drawings.push(...(S.sel.drawings||[]));toutes.holes.push(...(S.sel.holes||[]));
  }
  // toutes les copies restent sélectionnées : un Suppr les retire d'un coup
  clearSel();
  for(const k in toutes){if(!S.sel[k])S.sel[k]=new Set();for(const x of toutes[k])S.sel[k].add(x);}
  zoneCache.clear();touch();refreshPanels();draw();
  hint((n-1)+" copie(s) posée(s) en "+(cercle?"cercle":"ligne")+" — Ctrl+Z les retire toutes.");
  return n-1;
}
function collageReseauDialogue(){
  if(!selCount()){hint("Sélectionnez d'abord ce qu'il faut répéter.");return;}
  const c=pcbClipContent();
  const d=document.createElement("dialog");
  d.className="ed-dlg";
  d.innerHTML='<div class="mtitle">Collage en réseau</div>'+
    '<div class="prop"><label>Disposition</label><select id="crMode"><option value="ligne">en ligne</option><option value="cercle">en cercle</option></select></div>'+
    '<div class="prop"><label>Nombre (original compris)</label><input id="crN" type="number" min="2" max="500" value="4"></div>'+
    '<div class="prop cr-l"><label>Pas X (mm)</label><input id="crDx" type="number" step="0.1" value="5"></div>'+
    '<div class="prop cr-l"><label>Pas Y (mm)</label><input id="crDy" type="number" step="0.1" value="0"></div>'+
    '<div class="prop cr-c" hidden><label>Angle entre copies (°)</label><input id="crA" type="number" step="1" value="90"></div>'+
    '<div class="prop cr-c" hidden><label>Centre X (mm)</label><input id="crCx" type="number" step="0.1" value="'+fmt(S.origin.x,3)+'"></div>'+
    '<div class="prop cr-c" hidden><label>Centre Y (mm)</label><input id="crCy" type="number" step="0.1" value="'+fmt(S.origin.y,3)+'"></div>'+
    '<div class="row"><button class="tb" id="crNon">Annuler</button><button class="tb" id="crOui">Coller</button></div>';
  document.body.appendChild(d);
  const q=id=>d.querySelector("#"+id);
  const fermer=()=>{d.close();d.remove();};
  q("crMode").onchange=()=>{
    const ce=q("crMode").value==="cercle";
    d.querySelectorAll(".cr-l").forEach(e=>e.hidden=ce);
    d.querySelectorAll(".cr-c").forEach(e=>e.hidden=!ce);
  };
  q("crNon").onclick=fermer;
  d.addEventListener("cancel",e=>{e.preventDefault();fermer();});
  q("crOui").onclick=()=>{
    const v=id=>parseFloat(String(q(id).value).replace(",","."))||0;
    const o={n:v("crN"),mode:q("crMode").value,dx:v("crDx"),dy:v("crDy"),angle:v("crA"),cx:v("crCx"),cy:v("crCy")};
    fermer();
    if(c)collageReseau(o);
  };
  d.showModal();
}

/* ---------- largeur suivante en plein tracé ---------- */
const LARGEURS_USUELLES=[0.1,0.127,0.15,0.2,0.25,0.3,0.4,0.5,0.6,0.8,1,1.5,2,3];
function largeurSuivante(sens){
  const R=S.route;
  if(!R){hint("W change la largeur en plein tracé de piste (T).");return false;}
  const base=defaultWidth(R.net,R.layer);
  const L=[...new Set([base,R.w,...S.classes.map(c=>c.w),...LARGEURS_USUELLES].map(r3))].sort((a,b)=>a-b);
  const i=L.indexOf(r3(R.w));
  R.w=L[clamp(i+(sens<0?-1:1),0,L.length-1)];
  updateRoute(S.mouse.x,S.mouse.y);draw();
  hint("Largeur de piste : "+fmt(R.w,3)+" mm (W / Maj+W)"+
       (R.w<base-1e-6?" — sous la largeur de la classe ("+fmt(base,3)+" mm), le DRC le signalera.":"."));
  return true;
}

/* ---------- unité mm / mil ---------- */
function uniteBasculer(u){
  S.unite=u||(S.unite==="mil"?"mm":"mil");
  const b=$("bUnite");
  if(b){b.classList.toggle("on",S.unite==="mil");
    b.innerHTML="Unité : "+S.unite+" <kbd>Q</kbd>";}
  const f=$("fUnite");if(f)f.textContent=S.unite;
  if(S.coord&&S.coord.open)coordFill();
  draw();
  hint("Unité d'affichage : "+(S.unite==="mil"?"mil (millième de pouce, 1 mil = 0,0254 mm)":"millimètre")+
       " — barre d'état, mesure et saisie de coordonnées. Les fichiers restent en mm.");
}

/* ---------- le cadenas dans le panneau Propriétés ---------- */
const _buildPropsSansVerrou=buildProps;
buildProps=function(){
  _buildPropsSansVerrou.apply(this,arguments);
  const n=selVerrouillables().filter(o=>o.locked).length, box=$("props");
  if(!n||!box||!box.insertAdjacentHTML)return;
  box.insertAdjacentHTML("afterbegin",'<div class="prop verrou-info">🔒 '+n+' objet(s) verrouillé(s) — '+
    '<button class="tb" id="pDeverrou">Déverrouiller</button></div>');
  const b=$("pDeverrou");if(b)b.onclick=()=>verrouPoser(false);
};

/* ---------- branchement des boutons ---------- */
(function(){
  const on=(id,f)=>{const b=$(id);if(b)b.onclick=f;};
  on("bVerrou",()=>verrouPoser(true));
  on("bDeverrou",()=>verrouPoser(false));
  on("bCollageReseau",collageReseauDialogue);
  on("bLargeur",()=>largeurSuivante(1));
  on("bUnite",()=>uniteBasculer());
  on("bFiltreTout",()=>{S.filtre={};filtreSync();refreshPanels();draw();hint("Filtre de sélection : tout est sélectionnable.");});
  const pop=$("filtrePop");
  if(pop&&pop.querySelectorAll){
    for(const c of pop.querySelectorAll("input[data-filtre]"))
      c.onchange=()=>filtrePoser(c.dataset.filtre,c.checked);
  }
  if(document.querySelectorAll){
    for(const b of document.querySelectorAll("[data-aligner]"))b.onclick=()=>alignerFps(b.dataset.aligner);
    for(const b of document.querySelectorAll("[data-semblable]"))b.onclick=()=>semblables(b.dataset.semblable);
  }
})();
