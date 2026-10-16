"use strict";
/* =============================================================================
   Éditeur PCB — 08-empreinte.js
   Bibliothèque d'empreintes. Le dessin d'une empreinte se fait dans la
   Gestion LIB (bouton « Ouvrir dans la Gestion LIB » du panneau Propriétés) ;
   l'ancienne fenêtre d'édition intégrée, plus jamais ouverte, est retirée.

   La bibliothèque garde les empreintes retouchées d'une séance à l'autre :
   dans la LIB (lib_empreinte_pcb/, un .json par empreinte, suivie par git),
   et dans un .json d'échange pour les emporter ailleurs ou les partager.
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
  const def={name:String(name||fp.pkg||fp.ref||"empreinte").slice(0,80).trim(),
             pkg:fp.pkg||"", pins:fp.pins, style:fp.style,
             pitch:r3(fp.pitch), span:r3(fp.span)};
  const free=fpFree(fp);
  if(free){
    def.pads=free.map(padClone);
    const b=bodyOf(fp);
    def.body={x1:r4(b.x1),y1:r4(b.y1),x2:r4(b.x2),y2:r4(b.y2)};
  }
  if(fp.holes&&fp.holes.length)def.holes=fp.holes.map(h=>({x:h.x,y:h.y,d:h.d}));
  return def;
}
/* Lecture défensive : une définition peut venir d'un fichier écrit à la main,
   d'une version antérieure ou d'ailleurs. Même exigence que normFp(). */
function normFpDef(d){
  if(!d||typeof d!=="object")return null;
  const name=dStr(d.name,80).trim();
  if(!name)return null;
  const style=STYLES[d.style]?d.style:defaultStyle(dInt(d.pins,2,1,4096));
  const g=defaultGeom(style);
  const out={name:name, pkg:dStr(d.pkg,80), pins:dInt(d.pins,2,1,4096),
             style:style, pitch:dRange(d.pitch,g.pitch,0.05,100),
             span:dRange(d.span,g.span,0.05,1000)};
  const pads=dPads(d.pads);
  if(pads){
    out.pads=pads;
    let m=1;
    for(const q of pads)m=Math.max(m,q.n);
    out.pins=clamp(m,1,4096);
  }
  const body=dBody(d.body);
  if(body)out.body=body;
  const holes=dHoles(d.holes);
  if(holes)out.holes=holes;
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
  fp.style=d.style;fp.pitch=d.pitch;fp.span=d.span;fp.pins=d.pins;
  if(d.pads){
    fp.pads=d.pads.map(padClone);
    if(d.body)fp.body={x1:d.body.x1,y1:d.body.y1,x2:d.body.x2,y2:d.body.y2};
    else delete fp.body;
    fpSyncPins(fp);
  }else{
    delete fp.pads;delete fp.body;
  }
  /* les trous NPTH sont la forme de l'empreinte, comme ses pastilles : ils
     viennent avec la définition et partent avec elle */
  if(d.holes)fp.holes=d.holes.map(h=>({x:h.x,y:h.y,d:h.d}));
  else delete fp.holes;
  /* une broche câblée ne doit jamais se retrouver sans pastille */
  const w=fpWiredPins(fp);
  if(w>fp.pins)fpSetPins(fp,w);
  return true;
}
/* La bibliothèque vit dans la LIB du serveur : LIB/lib_empreinte_pcb/<nom>.json,
   le même dossier et le même format que les empreintes livrées. Plus rien dans
   le navigateur : une copie gardée là n'était ni partagée ni versionnée, et
   finissait par diverger de la LIB. Les accesseurs restent synchrones : ils
   lisent ce miroir, chargé au démarrage ; chaque écriture part au serveur. */
const FPLIB={};            // nom -> définition
const FPLIB_FICHIER={};    // nom -> fichier dans lib_empreinte_pcb/
let FPLIB_SRV=false;       // vrai une fois la LIB lue : on peut y écrire
let FPLIB_ENVOI=Promise.resolve(true);   // la dernière écriture, pour qui attend
function fpLibAll(){return Object.assign({},FPLIB);}
function fpLibFichier(name){
  return FPLIB_FICHIER[name]||(String(name).replace(/[\\/:*?"<>|\x00-\x1f]/g,"_")+".json");
}
function fpLibApi(methode,params,corps){
  const q=Object.keys(params||{}).map(k=>k+"="+encodeURIComponent(params[k])).join("&");
  const opt={method:methode,headers:{}};
  if(corps){opt.headers["Content-Type"]="application/json";opt.body=JSON.stringify(corps);}
  return fetch("/api/lib/fichier"+(q?"?"+q:""),opt).then(r=>r.text().then(t=>{
    if(!r.ok){let m="";try{m=JSON.parse(t).detail;}catch(_){}throw new Error(m||"erreur "+r.status);}
    return t?JSON.parse(t):{};
  }));
}
/* Le miroir prend `o` ; ce qui a changé part au serveur, fichier par fichier. */
function fpLibWrite(o){
  const envois=[];
  for(const n of Object.keys(o)){
    if(FPLIB[n]&&JSON.stringify(FPLIB[n])===JSON.stringify(o[n]))continue;
    const f=fpLibFichier(n);
    FPLIB_FICHIER[n]=f;
    if(FPLIB_SRV)envois.push(fpLibApi("PUT",null,
      {type:"pcb",nom:f,data:Object.assign({format:FPLIB_FORMAT},o[n])}));
  }
  for(const n of Object.keys(FPLIB)){
    if(o[n])continue;
    if(FPLIB_SRV)envois.push(fpLibApi("DELETE",{type:"pcb",nom:fpLibFichier(n)}));
    delete FPLIB_FICHIER[n];
  }
  for(const n of Object.keys(FPLIB))delete FPLIB[n];
  Object.assign(FPLIB,o);
  FPLIB_ENVOI=Promise.all(envois).then(()=>true,e=>{
    if(typeof hint==="function")hint("Empreinte non enregistrée dans la LIB : "+e.message);
    return false;
  });
  return true;
}
function fpLibNames(){
  return Object.keys(fpLibAll()).sort((a,b)=>a.localeCompare(b,"fr",{numeric:true}));
}
function fpLibGet(name){return fpLibAll()[String(name)]||null;}
/* L'empreinte de la LIB qui répond à un nom de boîtier venu du schéma ou d'une
   netlist. Le nom exact d'abord, puis la même clé (pkgKey : « SOT23-5 » vaut
   « SOT-23-5 ») ; un chemin de catalogue (« lib/empreinte/SC-70.json ») se
   réduit à son fichier. Rien de cela : null, et la géométrie calculée reste. */
function fpLibPourBoitier(pkg){
  const nom=String(pkg==null?"":pkg).replace(/^.*[\\/]/,"").replace(/\.json$/i,"").trim();
  if(!nom)return null;
  if(FPLIB[nom])return FPLIB[nom];
  const k=pkgKey(nom);
  if(!k)return null;
  for(const n of Object.keys(FPLIB))
    if(pkgKey(n)===k||pkgKey(FPLIB[n].pkg)===k)return FPLIB[n];
  return null;
}
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
  fpLibWrite(all);
  return {added:added,renamed:renamed};
}
/* Chargement de la LIB au démarrage. Les empreintes que l'ancienne version
   gardait dans le navigateur rejoignent la LIB une fois, puis la copie du
   navigateur est effacée -- seulement si la LIB les a bien reçues. */
function fpLibCharger(){
  const lire=(r)=>r.text().then(t=>{if(!r.ok)throw new Error("erreur "+r.status);return JSON.parse(t);});
  return fetch("/api/lib/fichiers").then(lire).then(liste=>{
    const noms=(liste.pcb||[]).filter(f=>/\.json$/i.test(f));
    return Promise.all(noms.map(f=>
      fetch("/api/lib/fichier?type=pcb&nom="+encodeURIComponent(f)).then(lire)
        .then(r=>{const d=normFpDef(r.data);if(d){FPLIB[d.name]=d;FPLIB_FICHIER[d.name]=f;}})
        .catch(()=>{})));
  }).then(()=>{
    FPLIB_SRV=true;
    let ancien=null;
    try{ancien=JSON.parse(localStorage.getItem(FPLIB_KEY)||"null");}catch(_){}
    const defs=ancien&&typeof ancien==="object"
      ?Object.keys(ancien).map(k=>normFpDef(ancien[k])).filter(Boolean):[];
    if(defs.length)fpLibMerge(defs);
    return FPLIB_ENVOI.then(ok=>{
      if(ok)try{localStorage.removeItem(FPLIB_KEY);}catch(_){}
      return true;
    });
  }).catch(()=>false);     // pas de serveur (fichier ouvert seul) : bibliothèque de séance
}
/* La lecture en cours, pour qui doit l'attendre (l'export du schéma, qui
   pose les empreintes de la LIB avant d'écrire la carte). */
let FPLIB_PRET=Promise.resolve(false);
if(typeof location!=="undefined"&&/^https?:$/.test(location.protocol)&&typeof fetch==="function")
  FPLIB_PRET=fpLibCharger();
