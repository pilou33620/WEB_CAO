/* =============================================================================
   editeur-schematique — 03-boitiers.js
   Boîtiers / empreintes + accès sûr à la bibliothèque
   ============================================================================= */
"use strict";
/* ==========================================================================
   Boîtiers (empreintes)
   Le boîtier n'est pas une donnée de schéma : c'est l'attribut qui fait le lien
   avec le routage et l'approvisionnement. Il est donc stocké sur le composant
   (el.pkg), proposé par famille selon le type de symbole, et ressort dans la
   nomenclature et la netlist.
   ========================================================================== */
/* Un boîtier = une base (SOIC, SOT-23, DIP, 0603…) et un brochage. On les
   stocke séparément : la liste des bases reste courte et lisible, et le nombre
   de broches se choisit ensuite. Nom composé : « SOIC-8 », ou la base seule
   pour les boîtiers à brochage figé (passifs deux bornes). */
const PKG_BASES=[
  {b:"01005",fam:"Passifs CMS",kinds:["passif"],flat:true,note:"très petit, téléphonie"},
  {b:"0201",fam:"Passifs CMS",kinds:["passif"],flat:true},
  {b:"0402",fam:"Passifs CMS",kinds:["passif"],flat:true},
  {b:"0603",fam:"Passifs CMS",kinds:["passif"],flat:true,note:"standard du prototypage"},
  {b:"0805",fam:"Passifs CMS",kinds:["passif"],flat:true},
  {b:"1206",fam:"Passifs CMS",kinds:["passif"],flat:true},
  {b:"1210",fam:"Passifs CMS",kinds:["passif"],flat:true},
  {b:"2512",fam:"Passifs CMS",kinds:["passif"],flat:true,note:"shunt de puissance"},
  {b:"SMA",fam:"Diodes de puissance / cylindriques",kinds:["diode","passif"],flat:true},
  {b:"SMB",fam:"Diodes de puissance / cylindriques",kinds:["diode","passif"],flat:true},
  {b:"SMC",fam:"Diodes de puissance / cylindriques",kinds:["diode","passif"],flat:true},
  {b:"MELF",fam:"Diodes de puissance / cylindriques",kinds:["diode","passif"],flat:true},
  {b:"MiniMELF",fam:"Diodes de puissance / cylindriques",kinds:["diode","passif"],flat:true},
  {b:"SOT-23",fam:"Petits boîtiers CMS",kinds:["transistor","regulateur","ci"],pins:[3,5,6,8]},
  {b:"SOT-89",fam:"Petits boîtiers CMS",kinds:["transistor","regulateur"],pins:[3,4]},
  {b:"SOT-223",fam:"Petits boîtiers CMS",kinds:["transistor","regulateur"],pins:[4],
   note:"régulateurs de tension"},
  {b:"TO-252 (DPAK)",fam:"Puissance CMS",kinds:["transistor","regulateur","diode"],pins:[3,5]},
  {b:"TO-263 (D2PAK)",fam:"Puissance CMS",kinds:["transistor","regulateur","diode"],pins:[3,5,7]},
  {b:"TO-92",fam:"Puissance traversant",kinds:["transistor","regulateur","diode"],pins:[3]},
  {b:"TO-220",fam:"Puissance traversant",kinds:["transistor","regulateur","diode"],pins:[3,5,7],
   note:"dissipateur souvent nécessaire"},
  {b:"TO-247",fam:"Puissance traversant",kinds:["transistor","diode"],pins:[3],note:"haute puissance"},
  {b:"SOIC",fam:"CI — deux rangées CMS",kinds:["ci"],pins:[8,14,16,20,24,28,32],note:"pas 1,27 mm"},
  {b:"SSOP",fam:"CI — deux rangées CMS",kinds:["ci"],pins:[14,16,20,24,28]},
  {b:"TSSOP",fam:"CI — deux rangées CMS",kinds:["ci"],pins:[8,14,16,20,24,28,48,56],note:"très fin"},
  {b:"MSOP",fam:"CI — deux rangées CMS",kinds:["ci"],pins:[8,10]},
  {b:"DIP",fam:"CI — deux rangées traversant",kinds:["ci"],
   pins:[4,6,8,14,16,18,20,24,28,32,40,64],note:"pas 2,54 mm"},
  {b:"LQFP",fam:"CI — quatre côtés à pattes",kinds:["ci"],pins:[32,44,48,64,80,100,144,176,208]},
  {b:"TQFP",fam:"CI — quatre côtés à pattes",kinds:["ci"],pins:[32,44,48,64,80,100,144]},
  {b:"QFP",fam:"CI — quatre côtés à pattes",kinds:["ci"],pins:[44,48,64,80,100,144,176,208]},
  {b:"PQFP",fam:"CI — quatre côtés à pattes",kinds:["ci"],pins:[44,64,80,100,144,208]},
  {b:"QFN",fam:"CI — quatre côtés sans pattes",kinds:["ci"],pins:[8,12,16,24,32,40,48,64],
   note:"pastilles sous le boîtier"},
  {b:"DFN",fam:"CI — quatre côtés sans pattes",kinds:["ci"],pins:[8,12,16,24,32]},
  {b:"PLCC",fam:"CI — quatre côtés sans pattes",kinds:["ci"],pins:[20,28,32,44,52,68,84]},
  {b:"LCC",fam:"CI — quatre côtés sans pattes",kinds:["ci"],pins:[16,20,28,32]},
  {b:"BGA",fam:"Haute densité (billes)",kinds:["ci"],free:true,min:16,max:2500,
   note:"billes sous le boîtier"},
  {b:"WLCSP",fam:"Haute densité (billes)",kinds:["ci"],free:true,min:4,max:600},
  {b:"CSP",fam:"Haute densité (billes)",kinds:["ci"],free:true,min:4,max:600}
];
const PKG_FAMS=[...new Set(PKG_BASES.map(b=>b.fam))];
function pinCount(el){const p=pinsOf(el);return p?p.length:0;}
function pkgBaseOf(name){
  const t=String(name||"").trim();
  if(!t)return null;
  let best=null;
  for(const b of PKG_BASES){
    const u=b.b.toUpperCase(), v=t.toUpperCase();
    if(v===u){best={base:b,pins:b.flat?2:null};break;}
    if(v.startsWith(u+"-")){
      const rest=t.slice(b.b.length+1);
      if(/^\d+$/.test(rest)&&(!best||b.b.length>best.base.b.length))
        best={base:b,pins:+rest};
    }
  }
  return best;
}
function pkgName(base,n){
  if(!base)return "";
  if(base.flat)return base.b;
  return n?base.b+"-"+n:base.b;
}
// un nom est « connu » si sa base existe et si son brochage est proposé
function pkgKnown(name){
  if(!name)return true;
  const r=pkgBaseOf(name);
  if(!r)return false;
  if(r.base.flat)return String(name).trim().toUpperCase()===r.base.b.toUpperCase();
  if(r.base.free)return r.pins===null||r.pins>0;
  return r.pins!==null&&r.base.pins.includes(r.pins);
}
/* Bases classées : familles conseillées pour ce type de symbole d'abord.
   « fit » signale les bases qui existent dans le brochage du symbole. */
function pkgBaseList(el){
  const kind=defOf(el.type).pk||null, n=pinCount(el);
  const reco=[], other=[];
  for(const fam of PKG_FAMS){
    const bases=PKG_BASES.filter(b=>b.fam===fam).map(b=>({
      base:b,
      // les boîtiers à billes acceptent n'importe quel brochage : les marquer
      // « compatibles » partout ne serait qu'un bruit visuel
      fit:b.flat?(n===2):b.free?false:b.pins.includes(n)
    }));
    ((kind&&bases.some(x=>x.base.kinds.includes(kind)))?reco:other).push({fam,bases});
  }
  return reco.concat(other);
}
function pkgPinsFor(base,el){
  if(!base||base.flat)return [];
  if(base.free){
    const n=pinCount(el);
    const set=[...new Set([n,4,8,16,25,36,48,64,100,144,169,256,324,484,676].filter(
      v=>v&&v>=(base.min||1)&&v<=(base.max||9999)))];
    return set.sort((a,b)=>a-b);
  }
  return base.pins;
}

/* Accès sûr à la bibliothèque.
   LIB["__proto__"], LIB["constructor"] ou LIB["toString"] renvoient des valeurs
   héritées d'Object.prototype : un simple test de vérité les laisse passer, puis
   def.pins vaut undefined et tout le rendu meurt. On teste donc la propriété
   propre, et on remplace un type inconnu par un symbole d'erreur visible. */
function hasType(t){return Object.prototype.hasOwnProperty.call(LIB,t);}
const DEF_UNKNOWN={n:"Type inconnu",cat:"Divers",p:"X",v:"?",noRef:true,noVal:true,flat:true,
  pins:[],ext:[-26,-14,26,14],
  d(c){c.strokeStyle=C_RED;c.lineWidth=2;RR(c,-26,-14,52,28,4,null);TXT(c,"?",0,1,14,C_RED);}};
function defOf(t){return hasType(t)?LIB[t]:DEF_UNKNOWN;}
