"use strict";
/* ==========================================================================
   Éditeur PCB — échauffement des composants qui dissipent (estimation)
   --------------------------------------------------------------------------
   Sur la carte LED_UV, la chaleur était le vrai sujet : une LED d'un watt sur
   un disque de 26 mm. Chaque composant peut porter la puissance qu'il dissipe
   (`fp.puissance`, en W). L'estimation part au serveur
   (/api/thermique-composants, dc_solver.echauffement_composants) : le même
   modèle d'étalement que la chute DC, ses constantes et ses replis annoncés.

   CE QUE LA PAGE MESURE : le cuivre RELIÉ aux pastilles du composant — leurs
   surfaces, les îlots de zone qu'elles touchent par un cuivre réel (liaison
   directe ou bras tracés : `relieeZone`, la même règle que la connectivité),
   comptés au pixel du masque des îlots, et les pistes de leurs nets. Le
   cuivre de l'îlot le plus épais donne l'épaisseur.

   Le résultat est gardé pour la révision de la carte (`S.ver`) : le DRC le
   reprend tant que la carte n'a pas bougé, et signale ce qui dépasse
   `S.rule.dTMax` (40 K par défaut).
   ========================================================================== */

var THERMIQUE={ver:-1,res:null,erreur:""};

/* Le cuivre relié aux pastilles d'une empreinte, couche par couche (pastilles, îlots de zone
   touchés par un cuivre réel, pistes de ses nets). Rend {surface, source, cuivre_um, approche} :
   la surface est la PROJECTION — la plus grande des couches, deux plans superposés ne doublent
   pas les faces qui évacuent — et l'épaisseur, celle des couches qui en portent au moins le
   quart. `approche` : un îlot pris en zone entière, faute de rastérisation. */
function pcbCuivreRelie(fp,masques){
  const parCouche=new Map(), vus=new Set(), nets=new Set();
  const ajout=(l,a)=>parCouche.set(l,(parCouche.get(l)||0)+a);
  const aire=q=>q.shape==="circ"?Math.PI*Math.pow(Math.max(q.w,q.h)/2,2):q.w*q.h;
  let source=0, approche=false;
  for(const q of padsWorld(fp)){
    source+=aire(q);
    const ls=padCuLayers(fp,q);
    for(const l of ls)ajout(l,aire(q));
    if(!q.net)continue;
    nets.add(q.net);
    for(const l of ls){
      const z=zoneAt(l,q.x,q.y);
      if(!z||z.net!==q.net||zoneFichier(z))continue;
      // relié par un cuivre réel : liaison directe ou au moins un bras (comme computeConn)
      if(padLiaison(q,l,z)!=="directe"&&!padBras(q,l).ok.length)continue;
      const k=l+"|"+q.net;
      if(!masques.has(k)){
        const M=zoneMask(l,q.net);
        let n=null;
        if(M){n=new Uint32Array(M.count+1);for(const v of M.lab)n[v]++;}
        masques.set(k,{M,n});
      }
      const {M,n}=masques.get(k);
      if(!M){
        /* pas de rastérisation (carte trop grande pour le masque, page sans canevas) :
           la zone entière — optimiste, et dit dans le texte rendu */
        if(!vus.has(k+"|poly")){vus.add(k+"|poly");ajout(l,Math.abs(signedArea(z.pts)));approche=true;}
        continue;
      }
      for(const lb of maskLabels(M,q.x,q.y,Math.max(q.w,q.h)/2+classOf(q.net).clr+0.3,q.rot)){
        if(!lb||vus.has(k+"|"+lb))continue;
        vus.add(k+"|"+lb);
        ajout(l,n[lb]/(M.res*M.res));
      }
    }
  }
  for(const t of S.tracks)if(nets.has(t.net))ajout(t.l,t.w*trkLen(t));
  const A=Math.max(0,...parCouche.values());
  let cuivre=0;
  for(const [l,a] of parCouche)if(a>=A/4)cuivre+=cuT(l)*1000;
  return {surface:A,source,cuivre_um:cuivre||35,approche};
}

/* La surface de la carte (contour moins découpes) : l'ailette ne sort pas de la carte. */
function pcbSurfaceCarte(){
  return Math.max(1,Math.abs(signedArea(boardPoly()))-boardCutouts().reduce((s,D)=>s+Math.abs(signedArea(D)),0));
}

/* Ce qui part au serveur : les composants qui dissipent, la carte, et le bloc thermique de la chute DC. */
function pcbThermiqueDocument(){
  const masques=new Map(), composants=[], approches=[];
  for(const fp of S.fps){
    if(!(fp.puissance>0))continue;
    const c=pcbCuivreRelie(fp,masques);
    if(c.approche)approches.push(fp.ref);
    composants.push({ref:fp.ref,puissance_w:fp.puissance,surface_mm2:r3(Math.max(c.surface,1e-3)),
                     source_mm2:r3(Math.max(c.source,1e-3)),cuivre_um:r3(c.cuivre_um)});
  }
  return {thermique:simDCThermiquePcb(),carte_mm2:r3(pcbSurfaceCarte()),composants,approches};
}

/* L'estimation, gardée pour la révision de la carte. Lève une Error lisible en cas de refus. */
async function pcbThermiqueEstimer(){
  const doc=pcbThermiqueDocument(), ver=S.ver;
  if(!doc.composants.length)throw new Error("Aucun composant ne dissipe : donnez sa puissance (W) dans ses propriétés.");
  const rep=await fetch("/api/thermique-composants",{method:"POST",headers:Object.assign({"Content-Type":"application/json"},ENTETE_WEB),body:JSON.stringify(doc)});
  let d=null;
  try{d=await rep.json();}catch(e){}
  if(!rep.ok||!d||!Array.isArray(d.composants)){
    THERMIQUE.erreur=(d&&d.detail)||("HTTP "+rep.status);
    throw new Error("Estimation thermique refusée : "+THERMIQUE.erreur);
  }
  if(doc.approches.length)
    d.modele+=" Approché sur "+doc.approches.join(", ")+" : sans rastérisation, la zone entière est prise pour l'îlot (optimiste).";
  Object.assign(THERMIQUE,{ver,res:d,erreur:""});
  return d;
}

/* Le résultat de la révision courante, ou null. */
function thermiqueCourant(){return THERMIQUE.res&&THERMIQUE.ver===S.ver?THERMIQUE.res:null;}

function thermiqueTexte(d){
  const L=["Échauffement estimé (au-dessus de l'ambiante) :"];
  for(const c of d.composants.slice().sort((a,b)=>b.dT-a.dT))
    L.push("- "+c.ref+" : "+fmt(c.dT,0)+" K pour "+fmt(c.puissance_w,2)+" W, "+fmt(c.surface_mm2,0)+" mm² de cuivre relié ("+
           fmt(c.r_th,1)+" K/W : "+fmt(c.r_etalement,1)+" d'étalement dans l'îlot, "+fmt(c.r_sortie,1)+" de sortie)");
  L.push(d.modele);
  return L.join("\n");
}

/* Le DRC (runDrc) : ce qui dépasse la limite, tant que la carte n'a pas bougé. */
function thermiqueDrc(out){
  const d=thermiqueCourant(), lim=S.rule.dTMax>0?S.rule.dTMax:40;
  if(!d){
    // faite sur une autre révision : elle ne vaut plus, le dire plutôt que se taire
    if(THERMIQUE.res&&S.fps.some(f=>f.puissance>0))
      out.push({info:true,x:S.board.x,y:S.board.y,l:0,msg:"Échauffement : l'estimation date d'avant la dernière retouche — relancez-la (propriétés d'un composant qui dissipe, ou cao_thermique)"});
    return;
  }
  for(const c of d.composants){
    if(!(c.dT>lim))continue;
    const fp=S.fps.find(f=>f.ref===c.ref);
    out.push({x:fp?fp.x:0,y:fp?fp.y:0,l:fp&&fp.side?S.cu-1:0,
      msg:c.ref+" : échauffement estimé "+fmt(c.dT,0)+" K pour "+fmt(c.puissance_w,2)+" W (limite "+fmt(lim,0)+
          " K) — plus de cuivre relié (zone, liaison directe, vias vers un plan) ou moins de puissance"});
  }
}

/* La fiche du composant : sa puissance, et l'estimation à la demande. */
function thermiquePropsHtml(fp){
  const d=thermiqueCourant(), c=d&&d.composants.find(x=>x.ref===fp.ref);
  return '<div class="prop two" title="Puissance que le composant dissipe en service (W) : l\'échauffement en est estimé, par le modèle d\'étalement de la chute DC">'+
    numProp("pPuiss","Puissance dissipée (W)",fp.puissance>0?fp.puissance:"",0.05,0)+
    '<div><label>&nbsp;</label><button class="tb" id="pThEst"'+(fp.puissance>0?"":" disabled")+'>Estimer l\'échauffement</button></div></div>'+
    (c?'<div class="empty" style="padding:4px 12px">≈ '+fmt(c.dT,0)+' K au-dessus de l\'ambiante ('+fmt(c.surface_mm2,0)+
       ' mm² de cuivre relié, '+fmt(c.r_th,1)+' K/W) — un ordre de grandeur, ±30 %.</div>':"");
}
function thermiquePropsBind(fp){
  const p=$("pPuiss"), b=$("pThEst");
  if(p)p.onchange=()=>{push();const v=parseFloat(p.value);if(v>0)fp.puissance=r3(Math.min(v,100));else delete fp.puissance;touch();refreshPanels();};
  if(b)b.onclick=async()=>{
    b.disabled=true;
    try{const d=await pcbThermiqueEstimer();hint(thermiqueTexte(d).split("\n")[1]||"Estimation faite.");refreshPanels();draw();}
    catch(e){hint(e.message);b.disabled=false;}
  };
}
