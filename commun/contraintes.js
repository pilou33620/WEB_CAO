"use strict";
/* =============================================================================
   commun/contraintes.js
   Ce qu'est une contrainte de net, pour le schéma comme pour le PCB.

   Le PCB (gestionnaire de contraintes, editeur-pcb/js/30-contraintes.js) et le
   schéma (editeur-schematique/js/27-contraintes.js) saisissent les mêmes
   contraintes et les échangent par le document du schéma : il faut qu'ils les
   lisent avec les MÊMES bornes. Une contrainte : impédance cible et tolérance
   (%), longueur min / max (mm), vias max, couches permises, topologie et
   ordre des repères, moignons admis, tolérance d'une étoile, contre-perçage
   (la règle de l'empilage du PCB qui s'applique aux vias du net). Un groupe
   d'appariement : des nets à égaliser en longueur (mm) ou en délai (ps).

   Rien ici ne touche à l'état d'un éditeur : des fonctions pures.
   ============================================================================= */
const CM_TOPOS=["p2p","chaine","etoile","flyby"];
function cmNormRegle(o){
  if(!o||typeof o!=="object"||Array.isArray(o))return null;
  const r={};
  const num=(v,a,b)=>{
    if(v===null||v===undefined||v==="")return null;
    const n=+v;return Number.isFinite(n)&&n>=a&&n<=b?n:null;
  };
  const z=num(o.z,1,1000);if(z!=null)r.z=z;
  const t=num(o.zTol,0.1,100);if(t!=null)r.zTol=t;
  const lx=num(o.lMax,0.01,1e5);if(lx!=null)r.lMax=lx;
  const ln=num(o.lMin,0.01,1e5);if(ln!=null)r.lMin=ln;
  const vm=num(o.viasMax,0,1e4);if(vm!=null)r.viasMax=Math.round(vm);
  if(Array.isArray(o.couches)){
    const c=[...new Set(o.couches.map(Number).filter(i=>Number.isInteger(i)&&i>=0&&i<64))].sort((a,b)=>a-b);
    if(c.length)r.couches=c;
  }
  /* topologie et moignons (31-topologie.js) : la forme exigée, l'ordre des
     repères le long d'une chaîne, les longueurs de moignon admises (0 : aucun
     moignon), l'écart admis entre les branches d'une étoile */
  if(CM_TOPOS.indexOf(o.topo)>=0)r.topo=o.topo;
  if(Array.isArray(o.ordre)){
    const od=o.ordre.map(x=>String(x).trim().slice(0,24)).filter(Boolean).slice(0,64);
    if(od.length)r.ordre=od;
  }
  const sm=num(o.stubMax,0,1e5);if(sm!=null)r.stubMax=sm;
  const vs=num(o.viaStubMax,0,100);if(vs!=null)r.viaStubMax=vs;
  const et=num(o.etoileTol,0,1e5);if(et!=null)r.etoileTol=et;
  /* contre-perçage (editeur-pcb/js/01-core.js, `cpVia`) : l'identifiant
     d'une règle de l'empilage du PCB, ou « non » pour n'en vouloir aucune là
     où la classe en pose une. Le schéma ne le saisit pas : il le garde. */
  const cp=cmLireCp(o.cp);if(cp)r.cp=cp;
  return Object.keys(r).length?r:null;
}
/* Un identifiant de règle de contre-perçage : lettres, chiffres, « - » et
   « _ », 24 caractères au plus ; « non » en est un. */
function cmLireCp(v){
  const t=String(v==null?"":v).trim();
  return /^[A-Za-z0-9_-]{1,24}$/.test(t)?t:null;
}
/* Une table nom → contrainte, chaque entrée bornée, les vides écartées. */
function cmNormNets(m){
  const out={};
  if(!m||typeof m!=="object"||Array.isArray(m))return out;
  for(const nom of Object.keys(m)){
    const r=cmNormRegle(m[nom]), n=String(nom).slice(0,200);
    if(r&&n)out[n]=r;
  }
  return out;
}
/* Les groupes d'appariement : un nom, au moins un net, des identifiants
   uniques, une référence prise parmi les nets du groupe. */
function cmNormGroupes(liste){
  const out=[], ids=new Set();
  for(const g of (Array.isArray(liste)?liste:[])){
    if(!g||typeof g!=="object")continue;
    const nom=String(g.nom==null?"":g.nom).trim().slice(0,60);
    const nets=[...new Set((Array.isArray(g.nets)?g.nets:[]).map(x=>String(x)).filter(Boolean))].slice(0,512);
    if(!nom||!nets.length)continue;
    let id=String(g.id==null?"":g.id).slice(0,24);
    if(!id||ids.has(id)){let k=1;while(ids.has("g"+k))k++;id="g"+k;}
    ids.add(id);
    const mode=g.mode==="ps"?"ps":"mm";
    const t=+g.tol;
    const tol=Number.isFinite(t)&&t>=0&&t<=1e5?t:(mode==="ps"?10:0.5);
    const ref=nets.includes(String(g.ref))?String(g.ref):"";
    out.push({id,nom,nets,mode,tol,ref});
  }
  return out;
}
/* Une valeur saisie dans un champ, telle que les deux éditeurs l'écrivent :
   vide efface (le niveau d'en dessous s'applique), une virgule vaut un point,
   les couches s'écrivent « 1, 4 » ou « L1 L4 » (rendues de 0 à nCouches-1),
   l'ordre « U1, U4, U5 », « U1 > U4 > U5 » ou « U1 → U4 → U5 ». */
function cmLireChamp(cle,txt,nCouches){
  const t=String(txt==null?"":txt).trim();
  if(!t)return null;
  if(cle==="couches"){
    const n=nCouches||64;
    const c=(t.match(/\d+/g)||[]).map(x=>+x-1).filter(i=>i>=0&&i<n);
    return c.length?c:null;
  }
  if(cle==="topo")return CM_TOPOS.indexOf(t)>=0?t:null;
  if(cle==="cp")return cmLireCp(t);
  if(cle==="ordre"){
    const o=t.split(/[\s,;>\u2192]+/).map(x=>x.trim()).filter(Boolean);
    return o.length?o:null;
  }
  const v=parseFloat(t.replace(",","."));
  return Number.isFinite(v)?v:null;
}
/* Les noms des topologies, pour les listes des deux éditeurs. */
const CM_TOPO_NOMS={p2p:"point à point",chaine:"chaîne",etoile:"étoile",flyby:"fly-by"};
