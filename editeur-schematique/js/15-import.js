/* =============================================================================
   editeur-schematique — 15-import.js
   Import JSON défensif + sauvegarde automatique
   ============================================================================= */
"use strict";
/* --------------------------------------------------------------------------
   Import : rien de ce qui vient du fichier n'est cru sur parole.
   Une rotation de 45°, une abscisse absente ou un type inconnu suffisaient à
   produire un CS[undefined] et à figer tout le rendu.
   -------------------------------------------------------------------------- */
const ROT_OK={0:1,90:1,180:1,270:1};
function num(v,d){const n=+v;return Number.isFinite(n)?n:d;}
// coordonnées internes d'un symbole : quelques dizaines de pas, pas davantage
function clampIc(v){return Number.isFinite(v)?Math.max(-4000,Math.min(4000,v)):NaN;}
function normComp(c,i){
  if(!c||typeof c!=="object"||!hasType(c.type))return null;
  const def=LIB[c.type];
  const el={
    id:Math.max(1,Math.round(num(c.id,i+1))),
    type:c.type,
    x:snap(num(c.x,0)), y:snap(num(c.y,0)),
    rot:ROT_OK[num(c.rot,0)]?num(c.rot,0):0,
    mir:!!c.mir,
    ref:def.noRef?"":String(c.ref==null?"":c.ref).slice(0,32),
    value:String(c.value==null?(def.v||""):c.value).slice(0,240)
  };
  if(!def.noRef){
    const pk=String(c.pkg==null?"":c.pkg).trim().slice(0,40);
    if(pk)el.pkg=pk;
    if(c.csvMpn) el.csvMpn = String(c.csvMpn).slice(0, 100);
    if(c.csvPartName) el.csvPartName = String(c.csvPartName).slice(0, 100);
  }
  /* Libellés déplacés à la main : deux nombres, bornés. Un décalage aberrant
     enverrait le repère à l'autre bout de la feuille, hors de toute prise. */
  for(const k of ["refOff","valOff"]){
    const d=c[k];
    if(!Array.isArray(d)||d.length!==2)continue;
    const x=clampIc(num(d[0],NaN)), y=clampIc(num(d[1],NaN));
    if(Number.isFinite(x)&&Number.isFinite(y)&&(x||y))el[k]=[Math.round(x),Math.round(y)];
  }
  if(typeof def.pins==="function"){
    el.icShape=(c.icShape==="quad")?"quad":(c.icShape==="libre")?"libre":"dip";
    el.npins=Math.max(el.icShape==="quad"?IC_QUAD_MIN:2,
                      Math.min(64,Math.round(num(c.npins,8))));
    el.pinNames=Array.isArray(c.pinNames)
      ? c.pinNames.slice(0,el.npins).map(v=>String(v==null?"":v).slice(0,32))
      : [];
    // taille imposée au corps : sur la grille du symbole, et bornée
    const w=icStep(clampIc(num(c.icW,0))), hs=icStep(clampIc(num(c.icHs,0)));
    if(w>0)el.icW=w;
    if(hs>0)el.icHs=hs;
    /* Disposition libre : il faut exactement autant de couples que de broches,
       tous finis et sur la grille. À la moindre incohérence on retombe sur le
       rectangle — un symbole lisible vaut mieux qu'un symbole fidèle au
       fichier mais impossible à câbler. */
    if(el.icShape==="libre"){
      const src=Array.isArray(c.pinPos)?c.pinPos:null;
      const pos=(src&&src.length===el.npins)
        ? src.map(q=>Array.isArray(q)?[icStep(clampIc(num(q[0],NaN))),
                                       icStep(clampIc(num(q[1],NaN)))]:null)
        : null;
      if(pos&&pos.every(q=>q&&Number.isFinite(q[0])&&Number.isFinite(q[1])))el.pinPos=pos;
      else el.icShape="dip";
    }
    const b=c.icBody;
    if(el.pinPos&&b&&typeof b==="object"){
      const r={x1:icStep(clampIc(num(b.x1,NaN))),y1:icStep(clampIc(num(b.y1,NaN))),
               x2:icStep(clampIc(num(b.x2,NaN))),y2:icStep(clampIc(num(b.y2,NaN)))};
      if(Object.values(r).every(Number.isFinite))el.icBody=r;
    }
  }
  return el;
}
function normWire(w){
  if(!w||typeof w!=="object")return null;
  const x1=+w.x1,y1=+w.y1,x2=+w.x2,y2=+w.y2;
  if(![x1,y1,x2,y2].every(Number.isFinite))return null;
  if(x1===x2&&y1===y2)return null;
  const o={x1,y1,x2,y2};
  const nm=String(w.net==null?"":w.net).trim().slice(0,32);
  if(nm)o.net=nm;
  // réglages d'affichage de l'étiquette du net portée par ce fil
  if(w.lblHide)o.lblHide=1;
  const d=w.lblOff;
  if(Array.isArray(d)&&d.length===2){
    const x=clampIc(+d[0]), y=clampIc(+d[1]);
    if(Number.isFinite(x)&&Number.isFinite(y)&&(x||y))o.lblOff=[Math.round(x),Math.round(y)];
  }
  return o;
}
function normPage(p,i){
  const src=(p&&typeof p==="object")?p:{};
  const comps=(Array.isArray(src.comps)?src.comps:[]).map(normComp).filter(Boolean);
  // ids uniques garantis : un uid trop bas dans le fichier créerait des doublons
  const seen=new Set();
  let maxId=0;
  for(const c of comps){
    while(seen.has(c.id))c.id++;
    seen.add(c.id);
    if(c.id>maxId)maxId=c.id;
  }
  const wires=(Array.isArray(src.wires)?src.wires:[]).map(normWire).filter(Boolean);
  splitWireArray(wires);          // un fichier importé arrive avec ses fils déjà scindés
  return {
    name:String(src.name==null?("Feuille "+(i+1)):src.name).slice(0,60)||("Feuille "+(i+1)),
    comps,
    wires,
    uid:Math.max(Math.round(num(src.uid,1))||1, maxId+1),
    scale:Math.max(.25,Math.min(4,num(src.scale,1))),
    ox:num(src.ox,0), oy:num(src.oy,0)
  };
}
function loadDoc(o){
  let raw;
  if(Array.isArray(o.pages))raw=o.pages;
  else if(Array.isArray(o.comps)||Array.isArray(o.wires))raw=[{name:"Feuille 1",comps:o.comps,wires:o.wires,uid:o.uid}];
  else throw new Error("le fichier ne contient aucun schéma");
  if(!raw.length)throw new Error("le document ne contient aucune feuille");
  const pages=raw.slice(0,200).map(normPage);
  const dropped=raw.reduce((n,p,i)=>
    n+((Array.isArray(p&&p.comps)?p.comps.length:0)-pages[i].comps.length),0);
  push();
  S.pages=pages;
  loadPage(Math.round(num(o.page,0)));
  buildTabs();refreshPanels();fit();
  return dropped;
}
document.getElementById("fileIn").onchange=e=>{
  const f=e.target.files[0];
  e.target.value="";
  if(!f)return;
  if(f.size>25*1024*1024){alert("Fichier trop volumineux (limite 25 Mo).");return;}
  const rd=new FileReader();
  rd.onerror=()=>alert("Lecture impossible : le fichier n'a pas pu être lu.");
  rd.onload=()=>{
    try{
      const dropped=loadDoc(JSON.parse(rd.result));
      document.getElementById("fHint").textContent = dropped
        ? dropped+" élément(s) ignoré(s) : type inconnu ou coordonnées invalides."
        : "Document importé.";
    }catch(err){
      alert("Lecture impossible : "+err.message);
    }
  };
  rd.readAsText(f);
};

/* --------------------------------------------------------------------------
   Filet de sécurité : sauvegarde automatique locale + confirmation de sortie
   -------------------------------------------------------------------------- */
const BAK="schemedit.autosave";
function autosave(){
  if(!S.dirty)return;
  try{
    localStorage.setItem(BAK,JSON.stringify({t:Date.now(),doc:JSON.parse(serialize())}));
  }catch(_){/* mode privé, quota plein, contexte restreint : on continue sans */}
}
function clearBackup(){try{localStorage.removeItem(BAK);}catch(_){}}
function restoreBackup(){
  try{
    const raw=localStorage.getItem(BAK);
    if(!raw)return false;
    const b=JSON.parse(raw);
    if(!b||!b.doc||!Array.isArray(b.doc.pages))return false;
    const when=new Date(b.t||Date.now()).toLocaleString("fr-FR");
    if(!confirm("Une sauvegarde automatique du "+when+" a été trouvée.\n\nLa reprendre ?")){
      clearBackup();return false;
    }
    loadDoc(b.doc);
    S.hist.length=0;S.redo.length=0;
    return true;
  }catch(_){clearBackup();return false;}
}
setInterval(autosave,4000);
window.addEventListener("beforeunload",e=>{
  autosave();
  /* Changer d'outil met le schéma en session (commun/session.js) : rien à
     perdre, donc rien à demander. La question reste posée pour une vraie
     fermeture d'onglet, elle, sans retour. */
  if(sessQuitte())return;
  if(!S.dirty)return;
  e.preventDefault();e.returnValue="";
});

/* --------------------------------------------------------------------------
   Session d'onglet : le schéma attend le retour de l'utilisateur
   Passer au routage puis revenir vérifier une valeur ne doit rien coûter. Le
   document, la feuille courante, le cadrage et l'état « modifié » partent en
   session et reviennent tels quels. C'est plus fin que la sauvegarde
   automatique ci-dessus, qui elle vise le plantage et demande confirmation :
   ici, l'utilisateur n'a rien perdu, il n'y a donc rien à lui demander.
   -------------------------------------------------------------------------- */
function sessionSchema(){
  const repris=sessBrancher("schema",()=>({
    doc:JSON.parse(serialize()),
    sale:S.dirty
  }));
  if(!repris)return false;
  try{
    loadDoc(repris.etat.doc);        // normPage() vérifie tout au passage
  }catch(_){
    sessEffacer("schema");
    return false;
  }
  S.hist.length=0;S.redo.length=0;   // l'historique de la démo n'a plus de sens
  const p=S.pages[S.page];
  if(p){                             // loadDoc() recadre : on reprend la vue
    S.scale=p.scale||1;S.ox=p.ox||0;S.oy=p.oy||0;p.viewed=true;
  }
  S.dirty=!!repris.etat.sale;
  draw();
  document.getElementById("fHint").textContent=
    "Schéma repris dans l'état où vous l'aviez laissé en changeant d'outil"+
    (S.dirty?" — pensez à l'enregistrer avant de fermer l'onglet.":".");
  return true;
}
