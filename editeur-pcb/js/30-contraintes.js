"use strict";
/* ==========================================================================
   Éditeur PCB — gestionnaire de contraintes (Constraint Manager)
   --------------------------------------------------------------------------
   Les contraintes de la carte vivaient en morceaux : les classes de net
   (largeur, isolation, via) et la matrice des natures dans la fenêtre des
   règles, les paires différentielles dans leur panneau, la cible du serpentin
   dans son menu, le timing des bus dans la simulation. Aucun endroit ne
   répondait à la question qu'on se pose en routant : « net par net, qu'est-ce
   qui est exigé, et est-ce tenu ? ».

   Cette fenêtre y répond, en tableur, la valeur MESURÉE à côté de la
   contrainte, en vert ou en rouge :

     · Nets : classe, longueur, délai, vias, Z₀, et ce que la carte exige —
       saisi sur le net, sinon hérité de sa classe (la source est dite) ;
     · Classes : les règles physiques (largeur, isolation, via, perçage), les
       mêmes que la fenêtre des règles, et les contraintes électriques
       (impédance cible, longueur, vias, couches permises), avec la largeur
       qui donne l'impédance cible sur chaque couche, d'après l'empilage ;
     · Paires différentielles : longueurs P et N, écart, découplé, règle ;
     · Groupes d'appariement : des nets dont la longueur — ou le délai — doit
       tenir dans une tolérance autour d'une référence (le plus long, ou un
       net choisi). Le serpentin y prend sa cible ;
     · Isolation entre classes : une matrice classe × classe.

   Ce qui se règle ici est contrôlé : les écarts partent au DRC (`cmDrc`),
   l'isolation entre classes entre dans `clrPair` / `clrK` (01-core.js) — donc
   au routeur, aux zones et aux Gerber. Les données sont dans le document,
   `contraintes`, bornées par `cmNorm` (01-core.js).

   Ce module ne touche à rien de ce qui est partagé avec la visionneuse
   IPC-2581 (commun/simulation-em.js, l'audit de la carte côté serveur) : ses
   classes, ses cibles Z₀ par classe et ses porteuses restent les siennes.
   ========================================================================== */

const CM_ONGLETS=[["nets","Nets"],["classes","Classes"],["paires","Paires diff."],
                  ["groupes","Groupes d'appariement"],["matrice","Isolation entre classes"]];
const CM_ZTOL=10;                    // tolérance d'impédance par défaut, en %
/* séparateur des clés de champ (« net␞USB_DP␞lMax ») : un caractère qu'aucun
   nom de net ou de classe ne porte, et qui vit sans souci dans un attribut */
const CM_SEP="\u241E";

/* ==========================================================================
   Mesures — une passe sur le cuivre, gardée tant que la carte ne change pas
   ========================================================================== */
let cmCache={cle:"",m:null};
function cmCleCarte(){
  return S.ver+"|"+S.tracks.length+"|"+S.vias.length+"|"+S.cu+"|"+S.fps.length;
}
function cmMesures(){
  const cle=cmCleCarte();
  if(cmCache.cle===cle&&cmCache.m)return cmCache.m;
  const parNet=new Map();
  const lot=n=>{let e=parNet.get(n);if(!e)parNet.set(n,e={tracks:[],vias:[]});return e;};
  for(const t of S.tracks)if(t.net)lot(t.net).tracks.push(t);
  for(const v of S.vias)if(v.net)lot(v.net).vias.push(v);
  const m=new Map();
  for(const {name} of netTable()){
    const g=parNet.get(name)||{tracks:[],vias:[]};
    let lt=null;
    if(g.tracks.length){try{lt=ltLine(g.tracks,g.vias);}catch(_){lt=null;}}
    const couches=[...new Set(g.tracks.map(t=>t.l))].sort((a,b)=>a-b);
    let wmin=Infinity,wmax=0;
    for(const t of g.tracks){wmin=Math.min(wmin,t.w);wmax=Math.max(wmax,t.w);}
    m.set(name,{net:name,n:g.tracks.length,
      len:lt?lt.len:0,
      ps:lt?lt.tpdAll*1e12:0,
      psmm:lt&&lt.psmm>0?lt.psmm:6.7,
      vias:g.vias.length,
      z0min:lt?lt.z0min:null,z0max:lt?lt.z0max:null,noRef:!!(lt&&lt.noRef),
      couches,wmin:g.tracks.length?wmin:0,wmax,
      tracks:g.tracks});
  }
  cmCache={cle,m};
  return m;
}

/* ==========================================================================
   Ce qui est exigé d'un net : le net d'abord, sa classe ensuite
   ========================================================================== */
function cmModele(){
  if(!S.contraintes||!S.contraintes.classes)S.contraintes=cmNorm(S.contraintes);
  return S.contraintes;
}
function cmRegleDe(net){
  const C=cmModele(), cl=classOf(net);
  const rc=C.classes[cl.name]||{}, rn=C.nets[net]||{};
  const pick=k=>rn[k]!=null?{v:rn[k],src:"net"}:(rc[k]!=null?{v:rc[k],src:"classe"}:null);
  return {classe:cl.name,w:cl.w,clr:cl.clr,via:cl.via,drill:cl.drill,
          z:pick("z"),zTol:pick("zTol")||{v:CM_ZTOL,src:"défaut"},
          lMax:pick("lMax"),lMin:pick("lMin"),viasMax:pick("viasMax"),couches:pick("couches"),
          paire:dpOfNet(net),
          groupes:C.groupes.filter(g=>g.nets.indexOf(net)>=0)};
}
function cmNomCouche(i){return "L"+(i+1);}
function cmMm(v,n){return fmt(v,n==null?2:n).replace(".",",");}
/* Les écarts d'un net à ses propres contraintes. Un net non routé n'en a pas :
   ce qui manque, c'est le routage, et le DRC le dit déjà. */
function cmVerifier(net,m,r){
  const out=[];
  if(!m||!m.n)return out;
  const de=x=>x.src==="net"?" (net)":" (classe "+r.classe+")";
  if(r.lMax&&m.len>r.lMax.v+1e-6)
    out.push({cle:"lMax",msg:"longueur "+cmMm(m.len)+" mm, au-delà du maximum de "+cmMm(r.lMax.v)+" mm"+de(r.lMax)});
  if(r.lMin&&m.len<r.lMin.v-1e-6)
    out.push({cle:"lMin",msg:"longueur "+cmMm(m.len)+" mm, en deçà du minimum de "+cmMm(r.lMin.v)+" mm"+de(r.lMin)});
  if(r.viasMax&&m.vias>r.viasMax.v)
    out.push({cle:"viasMax",msg:m.vias+" via(s) pour "+r.viasMax.v+" admis"+de(r.viasMax)});
  if(r.couches){
    const hors=m.couches.filter(l=>r.couches.v.indexOf(l)<0);
    if(hors.length)out.push({cle:"couches",msg:"routé sur "+hors.map(cmNomCouche).join(", ")+
      ", hors des couches permises ("+r.couches.v.map(cmNomCouche).join(", ")+")"+de(r.couches)});
  }
  if(r.z){
    const t=r.zTol.v/100, lo=r.z.v*(1-t), hi=r.z.v*(1+t);
    if(m.z0min==null)
      out.push({cle:"z",info:true,msg:"impédance non calculable (pas de plan de référence)"});
    else if(m.z0min<lo-1e-6||m.z0max>hi+1e-6)
      out.push({cle:"z",msg:"Z₀ "+cmMm(m.z0min,1)+(m.z0max-m.z0min>0.05?" – "+cmMm(m.z0max,1):"")+
        " Ω, hors de "+cmMm(r.z.v,1)+" Ω ± "+cmMm(r.zTol.v,0)+" %"+de(r.z)});
  }
  return out;
}

/* ---------- groupes d'appariement ---------- */
function cmValeurGroupe(g,m){return g.mode==="ps"?m.ps:m.len;}
function cmUnite(g){return g.mode==="ps"?"ps":"mm";}
/* La cible d'un groupe : la référence si elle est routée, sinon le plus long
   des membres routés — on allonge les courts, on ne raccourcit pas le long. */
function cmEvaluerGroupe(g,M){
  M=M||cmMesures();
  const membres=g.nets.map(net=>{
    const m=M.get(net);
    return {net,m,routé:!!(m&&m.n),val:m&&m.n?cmValeurGroupe(g,m):0};
  });
  const routes=membres.filter(x=>x.routé);
  let cible=null, refNet="";
  const ref=g.ref&&membres.find(x=>x.net===g.ref&&x.routé);
  if(ref){cible=ref.val;refNet=ref.net;}
  else if(routes.length){
    const l=routes.reduce((a,b)=>b.val>a.val?b:a);
    cible=l.val;refNet=l.net;
  }
  for(const x of membres){
    x.ecart=x.routé&&cible!=null?x.val-cible:null;
    x.ok=x.ecart==null||Math.abs(x.ecart)<=g.tol+1e-9;
  }
  return {g,membres,cible,refNet,absents:membres.filter(x=>!x.m).map(x=>x.net)};
}
/* Ce qui manque à un net, en mm de piste, pour rejoindre la cible de son
   groupe : c'est la longueur que le serpentin propose d'ajouter. Un groupe en
   délai convertit avec le retard par millimètre du net lui-même. */
function cmManqueLongueur(net){
  if(!net)return null;
  const M=cmMesures(), m=M.get(net);
  if(!m||!m.n)return null;
  for(const g of cmModele().groupes){
    if(g.nets.indexOf(net)<0)continue;
    const e=cmEvaluerGroupe(g,M);
    if(e.cible==null||e.refNet===net)continue;
    const x=e.membres.find(y=>y.net===net);
    if(!x||x.ecart==null||x.ecart>=0)continue;
    const manque=-x.ecart;
    return r3(g.mode==="ps"?manque/(m.psmm||6.7):manque);
  }
  return null;
}

/* ---------- largeur pour une impédance cible ----------
   La géométrie de la couche (diélectrique, plans de référence) vient de
   l'empilage, par `dpStripGeom` ; on cherche la largeur par dichotomie,
   comme `rfW50` le fait pour 50 Ω. null : la cible n'est pas atteignable
   entre 0,03 et 5 mm sur cette couche. */
function cmCoucheSignal(l){
  try{return !rolePlane(layerRole(l));}catch(_){return true;}
}
function cmLargeurPourZ(z,l){
  if(!cmCoucheSignal(l))return null;
  try{
    const g=dpStripGeom(l);
    if(!g||!g.ref)return null;
    let lo=0.03,hi=5;
    if(!(ltZ0(g,lo)>z&&ltZ0(g,hi)<z))return null;
    for(let i=0;i<44;i++){const m=(lo+hi)/2;if(ltZ0(g,m)>z)lo=m;else hi=m;}
    return r3((lo+hi)/2);
  }catch(_){return null;}
}

/* ==========================================================================
   Contrôle : ce que le DRC ajoute
   ========================================================================== */
function cmAncre(m){
  let t=null,L=-1;
  for(const x of (m&&m.tracks)||[]){const l=trkLen(x);if(l>L){L=l;t=x;}}
  if(!t)return {x:S.board.x,y:S.board.y,l:0};
  const p=trkAt(t,0.5);
  return {x:p.x,y:p.y,l:t.l};
}
function cmDrc(out){
  const C=cmModele();
  const vide=!Object.keys(C.classes).length&&!Object.keys(C.nets).length&&!C.groupes.length;
  if(vide)return;
  const M=cmMesures();
  for(const [net,m] of M){
    const r=cmRegleDe(net);
    for(const f of cmVerifier(net,m,r)){
      const a=cmAncre(m);
      out.push({info:!!f.info,x:a.x,y:a.y,l:a.l,msg:"Contrainte "+net+" : "+f.msg});
    }
  }
  for(const g of C.groupes){
    const e=cmEvaluerGroupe(g,M);
    if(e.absents.length){
      out.push({info:true,x:S.board.x,y:S.board.y,l:0,
        msg:"Groupe "+g.nom+" : "+e.absents.join(", ")+" absent(s) de la carte"});
    }
    for(const x of e.membres){
      if(x.ok||x.ecart==null)continue;
      const a=cmAncre(x.m);
      out.push({x:a.x,y:a.y,l:a.l,
        msg:"Groupe "+g.nom+" : "+x.net+" à "+(x.ecart>0?"+":"")+cmMm(x.ecart,g.mode==="ps"?0:2)+" "+
            cmUnite(g)+" de "+e.refNet+", tolérance ± "+cmMm(g.tol,g.mode==="ps"?0:2)+" "+cmUnite(g)});
    }
  }
}

/* ==========================================================================
   Modifier — toujours par ici : historique, caches, panneaux
   ========================================================================== */
function cmEdit(fn){
  push();
  fn(cmModele());
  S.contraintes=cmNorm(S.contraintes);
  touch();
  if(typeof zoneCache!=="undefined")zoneCache.clear();
  if(typeof refreshPanels==="function")refreshPanels();
  if(typeof draw==="function")draw();
  if(typeof reSync==="function")reSync();
}
/* Une valeur saisie : vide efface (le net revient à sa classe), une virgule
   vaut un point. Les couches s'écrivent « 1, 4 » ou « L1 L4 ». */
function cmLire(cle,txt){
  const t=String(txt==null?"":txt).trim();
  if(!t)return null;
  if(cle==="couches"){
    const c=(t.match(/\d+/g)||[]).map(x=>+x-1).filter(i=>i>=0&&i<S.cu);
    return c.length?c:null;
  }
  const n=parseFloat(t.replace(",","."));
  return Number.isFinite(n)?n:null;
}
function cmPoser(portee,nom,cle,txt){
  const v=cmLire(cle,txt);
  cmEdit(C=>{
    const tab=C[portee];
    const r=Object.assign({},tab[nom]||{});
    if(v==null)delete r[cle];else r[cle]=v;
    if(Object.keys(r).length)tab[nom]=r;else delete tab[nom];
  });
}
function cmPoserPhysique(classe,cle,txt){
  const c=S.classes.find(x=>x.name===classe);
  const v=cmLire(cle,txt);
  if(!c||v==null||!(v>0)||v>50)return false;
  cmEdit(()=>{
    c[cle]=r3(v);
    if(cle==="via"&&c.drill>=c.via)c.drill=r3(Math.max(0.1,c.via-0.2));
  });
  return true;
}
function cmPoserMatrice(a,b,txt){
  const v=cmLire("clr",txt);
  cmEdit(C=>{
    const k=cmCle(a,b);
    if(v==null||!(v>0))delete C.matrice[k];else C.matrice[k]=v;
  });
}
function cmNouveauGroupe(nom,nets,mode,tol){
  nets=[...new Set((nets||[]).map(String).filter(Boolean))];
  nom=String(nom||"").trim()||("Groupe "+(cmModele().groupes.length+1));
  if(!nets.length)return null;
  let g=null;
  cmEdit(C=>{
    let k=1;while(C.groupes.some(x=>x.id==="g"+k))k++;
    g={id:"g"+k,nom,nets,mode:mode==="ps"?"ps":"mm",
       tol:Number.isFinite(+tol)&&+tol>=0?+tol:(mode==="ps"?10:0.5),ref:""};
    C.groupes.push(g);
  });
  return cmModele().groupes.find(x=>x.id===g.id)||null;
}
function cmGroupeModifier(id,fn){
  cmEdit(C=>{const g=C.groupes.find(x=>x.id===id);if(g)fn(g,C);});
}
function cmGroupeSupprimer(id){
  cmEdit(C=>{C.groupes=C.groupes.filter(x=>x.id!==id);});
}
/* Largeur de la classe ← la largeur qui donne sa Z cible sur la couche `l`. */
/* La largeur d'une classe sur UNE couche (`wL`, voir classWidth dans
   01-core.js). Vide : la couche reprend la largeur générale de la classe. */
function cmPoserLargeurCouche(classe,l,txt){
  const c=S.classes.find(x=>x.name===classe);
  const v=cmLire("w",txt);
  if(!c||!Number.isInteger(+l)||+l<0||+l>=S.cu)return false;
  if(v!=null&&!(v>=0.05&&v<=50))return false;
  cmEdit(()=>{
    const wL=Object.assign({},c.wL||{});
    if(v==null)delete wL[+l];else wL[+l]=r3(v);
    if(Object.keys(wL).length)c.wL=wL;else delete c.wL;
  });
  return true;
}
/* Largeur de la classe sur la couche `l` ← celle qui y donne sa Z cible.
   `l` absent : toutes les couches de signal où la cible est atteignable, en
   un seul pas d'historique. Rend la largeur posée (ou la liste), null sinon. */
function cmAppliquerLargeurZ(classe,l){
  const r=cmModele().classes[classe], c=S.classes.find(x=>x.name===classe);
  if(!r||!r.z||!c)return null;
  const couches=l==null?[...Array(S.cu).keys()]:[l];
  const pose={};
  for(const k of couches){const w=cmLargeurPourZ(r.z,k);if(w)pose[k]=w;}
  if(!Object.keys(pose).length)return null;
  cmEdit(()=>{c.wL=Object.assign({},c.wL||{},pose);});
  return l==null?pose:pose[l];
}

/* ==========================================================================
   Tableaux
   ========================================================================== */
function cmLignesNets(){
  const M=cmMesures();
  const rows=[];
  for(const [net,m] of M){
    const r=cmRegleDe(net);
    const f=cmVerifier(net,m,r);
    const grp=r.groupes.map(g=>{
      const e=cmEvaluerGroupe(g,M), x=e.membres.find(y=>y.net===net);
      return {g,x,e};
    });
    const fauteGrp=grp.some(o=>o.x&&!o.x.ok);
    const etat=!m.n?"nr":((f.some(x=>!x.info)||fauteGrp)?"err":
               ((r.z||r.lMax||r.lMin||r.viasMax||r.couches||grp.length)?"ok":"-"));
    rows.push({net,m,r,f,grp,etat});
  }
  rows.sort((a,b)=>a.net.localeCompare(b.net,"fr",{numeric:true}));
  return rows;
}
function cmCsv(){
  const L=["Net;Classe;Longueur (mm);Délai (ps);Vias;Z0 min;Z0 max;Z cible;Tol %;L min;L max;Vias max;Couches;Groupes;État;Écarts"];
  const v=x=>x?String(x.v):"";
  for(const o of cmLignesNets()){
    const r=o.r, m=o.m;
    L.push([o.net,r.classe,fmt(m.len,3),fmt(m.ps,1),m.vias,
      m.z0min==null?"":fmt(m.z0min,1),m.z0max==null?"":fmt(m.z0max,1),
      v(r.z),r.zTol.v,v(r.lMin),v(r.lMax),v(r.viasMax),
      r.couches?r.couches.v.map(cmNomCouche).join(" "):"",
      r.groupes.map(g=>g.nom).join(" "),
      {err:"faute",ok:"ok",nr:"non routé","-":""}[o.etat],
      o.f.map(x=>x.msg).concat(o.grp.filter(g=>g.x&&!g.x.ok).map(g=>"groupe "+g.g.nom)).join(" | ")]
      .map(x=>{const s=String(x);return /[;"\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s;}).join(";"));
  }
  return L.join("\r\n")+"\r\n";
}

/* ==========================================================================
   Fenêtre
   ========================================================================== */
var CM={onglet:"nets",filtre:"",fautes:false,sel:new Set(),grpFiltre:"",grpSel:new Set()};

function cmOuvrir(onglet){
  if(onglet)CM.onglet=onglet;
  let m=document.getElementById("cmEd");
  if(!m){
    m=document.createElement("div");
    m.id="cmEd";m.className="modal cm-modal";
    m.setAttribute("role","dialog");m.setAttribute("aria-modal","true");
    m.setAttribute("aria-label","Gestionnaire de contraintes");
    document.body.appendChild(m);
    m.addEventListener("pointerdown",e=>{if(e.target===m)cmFermer();});
    m.addEventListener("keydown",e=>{
      if(e.key==="Escape"){e.stopPropagation();cmFermer();return;}
      if(e.key==="Enter"&&e.target&&e.target.dataset&&e.target.dataset.cm){e.preventDefault();e.target.blur();}
      e.stopPropagation();
    });
    m.addEventListener("input",e=>{
      const t=e.target;
      if(t.id==="cmFiltre"){CM.filtre=t.value;cmRendreCorps();cmFocus("cmFiltre");}
      else if(t.id==="cmGrpFiltre"){CM.grpFiltre=t.value;cmRendreCorps();cmFocus("cmGrpFiltre");}
    });
    m.addEventListener("change",cmChangement);
    m.addEventListener("click",cmClic);
  }
  m.hidden=false;
  cmRendre();
}
function cmFermer(){
  const m=document.getElementById("cmEd");
  if(m)m.hidden=true;
}
function cmFocus(id){
  const e=document.getElementById(id);
  if(e&&e.focus){e.focus();if(e.setSelectionRange){const n=e.value.length;e.setSelectionRange(n,n);}}
}
function cmChangement(e){
  const t=e.target, d=t.dataset||{};
  if(t.id==="cmFautes"){CM.fautes=!!t.checked;cmRendreCorps();return;}
  if(d.selnet!=null){if(t.checked)CM.sel.add(d.selnet);else CM.sel.delete(d.selnet);cmRendreCorps();return;}
  if(d.grpnet!=null){if(t.checked)CM.grpSel.add(d.grpnet);else CM.grpSel.delete(d.grpnet);return;}
  if(!d.cm)return;
  const p=d.cm.split(CM_SEP);
  if(p[0]==="net"||p[0]==="classe")cmPoser(p[0]==="net"?"nets":"classes",p[1],p[2],t.value);
  else if(p[0]==="phys"){if(!cmPoserPhysique(p[1],p[2],t.value))hint("Valeur refusée : un nombre positif, en mm.");}
  else if(p[0]==="wl"){if(!cmPoserLargeurCouche(p[1],+p[2],t.value))hint("Largeur refusée : entre 0,05 et 50 mm, ou vide pour la largeur de la classe.");}
  else if(p[0]==="mat")cmPoserMatrice(p[1],p[2],t.value);
  else if(p[0]==="netclasse"){
    const net=p[1];
    cmEdit(()=>{poserClasseNet(net,t.value);});
  }else if(p[0]==="lotclasse"){
    if(!CM.sel.size||!t.value)return;
    const nets=[...CM.sel];
    cmEdit(()=>{for(const n of nets)poserClasseNet(n,t.value);});
    hint(nets.length+" net(s) rattaché(s) à la classe « "+t.value+" ».");
  }else if(p[0]==="lotgroupe"){
    if(!CM.sel.size||!t.value)return;
    const nets=[...CM.sel];
    cmGroupeModifier(t.value,g=>{for(const n of nets)if(g.nets.indexOf(n)<0)g.nets.push(n);});
  }else if(p[0]==="grp"){
    const [_,id,cle]=p;
    cmGroupeModifier(id,g=>{
      if(cle==="nom")g.nom=String(t.value).trim()||g.nom;
      else if(cle==="mode")g.mode=t.value==="ps"?"ps":"mm";
      else if(cle==="tol"){const v=cmLire("tol",t.value);if(v!=null&&v>=0)g.tol=v;}
      else if(cle==="ref")g.ref=t.value;
    });
  }
  cmRendreCorps();
}
function cmClic(e){
  const b=e.target.closest&&e.target.closest("[data-a]");
  if(!b)return;
  const a=b.dataset.a, v=b.dataset.v;
  if(a==="fermer")cmFermer();
  else if(a==="onglet"){CM.onglet=v;cmRendre();}
  else if(a==="voir"){cmFermer();selectNetRouting(v);}
  else if(a==="drc"){cmFermer();if(typeof runDrc==="function"){runDrc();refreshPanels();draw();}}
  else if(a==="csv"){dl(new Blob(["﻿"+cmCsv()],{type:"text/csv"}),pcbFile("-contraintes.csv","contraintes.csv"));}
  else if(a==="regles"){cmFermer();if(typeof reOpen==="function")reOpen(v||"cls");}
  else if(a==="toutsel"){
    const vis=cmNetsVisibles().map(o=>o.net);
    const tous=vis.every(n=>CM.sel.has(n));
    for(const n of vis)if(tous)CM.sel.delete(n);else CM.sel.add(n);
    cmRendreCorps();
  }
  else if(a==="largeurz"){
    const [cl,l]=v.split(CM_SEP);
    if(l==="*"){
      const p=cmAppliquerLargeurZ(cl);
      hint(p?"Classe « "+cl+" » : "+Object.keys(p).map(k=>cmNomCouche(+k)+" "+cmMm(p[k],3)).join(", ")+" mm, celles de sa Z cible.":
             "Impédance cible hors d'atteinte sur toutes les couches.");
    }else{
      const w=cmAppliquerLargeurZ(cl,+l);
      hint(w?"Classe « "+cl+" » : "+cmMm(w,3)+" mm sur "+cmNomCouche(+l)+", la largeur de sa Z cible.":
             "Impédance cible hors d'atteinte sur "+cmNomCouche(+l)+".");
    }
    cmRendreCorps();
  }else if(a==="grpcreer"){
    const nom=(document.getElementById("cmGrpNom")||{}).value||"";
    const mode=(document.getElementById("cmGrpMode")||{}).value||"mm";
    const tol=cmLire("tol",(document.getElementById("cmGrpTol")||{}).value);
    const nets=[...CM.grpSel];
    if(nets.length<2){hint("Un groupe d'appariement demande au moins deux nets cochés.");return;}
    const g=cmNouveauGroupe(nom,nets,mode,tol);
    CM.grpSel.clear();
    if(g)hint("Groupe « "+g.nom+" » créé : "+g.nets.length+" nets, tolérance ± "+cmMm(g.tol,g.mode==="ps"?0:2)+" "+cmUnite(g)+".");
    cmRendreCorps();
  }else if(a==="grpdepuissel"){
    const nets=new Set();
    for(const t of S.sel.tracks)if(t.net)nets.add(t.net);
    for(const v2 of S.sel.vias)if(v2.net)nets.add(v2.net);
    if(!nets.size){hint("Sélectionnez des pistes sur la carte : leurs nets cocheront la liste.");return;}
    for(const n of nets)CM.grpSel.add(n);
    cmRendreCorps();
  }else if(a==="grpsuppr"){cmGroupeSupprimer(v);cmRendreCorps();}
  else if(a==="grpretirer"){
    const [id,net]=v.split(CM_SEP);
    cmGroupeModifier(id,g=>{g.nets=g.nets.filter(n=>n!==net);if(g.ref===net)g.ref="";});
    cmRendreCorps();
  }
}

function cmRendre(){
  const m=document.getElementById("cmEd");
  if(!m)return;
  m.innerHTML='<div class="modal-box cm-box">'+
    '<div class="modal-head"><span class="modal-title">Gestionnaire de contraintes</span>'+
      '<span class="cm-resume" id="cmResume"></span>'+
      '<button class="tb" type="button" data-a="csv" title="Les nets, leurs contraintes et leurs mesures, en tableau (CSV)">⬇ CSV</button>'+
      '<button class="tb" type="button" data-a="drc" title="Fermer et lancer le contrôle DRC : les écarts aux contraintes y sont listés">✔ DRC</button>'+
      '<button class="tb" type="button" data-a="fermer" title="Fermer (Échap)">✕</button></div>'+
    '<div class="cm-onglets">'+CM_ONGLETS.map(([k,l])=>'<button type="button" class="cm-onglet'+
      (CM.onglet===k?" on":"")+'" data-a="onglet" data-v="'+k+'">'+l+'</button>').join("")+'</div>'+
    '<div class="cm-corps" id="cmCorps"></div></div>';
  cmRendreCorps();
}
function cmRendreCorps(){
  const c=document.getElementById("cmCorps");
  if(!c)return;
  const f={nets:cmHtmlNets,classes:cmHtmlClasses,paires:cmHtmlPaires,groupes:cmHtmlGroupes,matrice:cmHtmlMatrice}[CM.onglet]||cmHtmlNets;
  c.innerHTML=f();
  const lignes=cmLignesNets();
  const err=lignes.filter(o=>o.etat==="err").length, ok=lignes.filter(o=>o.etat==="ok").length;
  const r=document.getElementById("cmResume");
  if(r)r.innerHTML=lignes.length+" nets · <b class='cm-ok'>"+ok+" tenus</b> · <b class='"+(err?"cm-err":"cm-ok")+"'>"+err+" en faute</b>";
}
/* un champ : valeur propre au niveau édité, et en grisé celle qui s'applique
   faute de mieux (héritée de la classe) */
function cmChamp(cle,val,herite,titre,large){
  return '<input class="cm-in'+(large?" cm-large":"")+'" data-cm="'+esc(cle)+'" value="'+esc(val==null?"":val)+
    '" placeholder="'+esc(herite==null?"":herite)+'" title="'+esc(titre||"")+'" inputmode="decimal">';
}
function cmEtat(e){
  return {err:'<span class="cm-pastille cm-err" title="contrainte non tenue">●</span>',
          ok:'<span class="cm-pastille cm-ok" title="contraintes tenues">●</span>',
          nr:'<span class="cm-pastille cm-nr" title="non routé">○</span>',
          "-":'<span class="cm-pastille cm-nr" title="aucune contrainte">·</span>'}[e];
}
function cmNetsVisibles(){
  const q=dfNormTxtCm(CM.filtre);
  return cmLignesNets().filter(o=>(!q||dfNormTxtCm(o.net+" "+o.r.classe).indexOf(q)>=0)&&
                                   (!CM.fautes||o.etat==="err"));
}
function dfNormTxtCm(s){return String(s||"").normalize("NFD").replace(/[̀-ͯ]/g,"").toLowerCase().trim();}
function cmHtmlNets(){
  const vis=cmNetsVisibles();
  const opts=S.classes.map(c=>'<option>'+esc(c.name)+'</option>').join("");
  const grps=cmModele().groupes;
  let h='<div class="cm-barre"><input type="search" id="cmFiltre" class="cm-filtre" placeholder="Filtrer : net ou classe" value="'+
    esc(CM.filtre)+'"><label class="cm-case"><input type="checkbox" id="cmFautes"'+(CM.fautes?" checked":"")+
    '> en faute seulement</label><span class="cm-sp"></span>'+
    '<span class="cm-lot">'+CM.sel.size+' coché(s) → classe <select class="tbsel" data-cm="lotclasse"><option value="">—</option>'+opts+'</select>'+
    (grps.length?' groupe <select class="tbsel" data-cm="lotgroupe"><option value="">—</option>'+
      grps.map(g=>'<option value="'+esc(g.id)+'">'+esc(g.nom)+'</option>').join("")+'</select>':"")+'</span></div>';
  h+='<div class="cm-table-w"><table class="cm-table"><thead><tr>'+
    '<th><button type="button" class="cm-mini" data-a="toutsel" title="Cocher / décocher les nets affichés">✓</button></th>'+
    '<th>État</th><th>Net</th><th>Classe</th><th class="n">Long. mm</th><th class="n">Délai ps</th><th class="n">Vias</th><th class="n">Z₀ Ω</th>'+
    '<th>Z cible Ω</th><th>Tol. %</th><th>L min</th><th>L max</th><th>Vias max</th><th>Couches</th><th>Groupes</th><th>Écarts</th></tr></thead><tbody>';
  for(const o of vis.slice(0,1500)){
    const r=o.r, m=o.m, rn=cmModele().nets[o.net]||{}, rc=cmModele().classes[r.classe]||{};
    const k=c=>"net"+CM_SEP+o.net+CM_SEP+c;
    const her=c=>rc[c]!=null?(c==="couches"?rc[c].map(i=>i+1).join(","):rc[c]):(c==="zTol"?CM_ZTOL:null);
    const z0=m.z0min==null?"—":(m.z0max-m.z0min>0.05?cmMm(m.z0min,1)+"–"+cmMm(m.z0max,1):cmMm(m.z0min,1));
    const ecarts=o.f.map(x=>x.msg).concat(o.grp.filter(g=>g.x&&!g.x.ok).map(g=>
      "groupe "+g.g.nom+" : "+(g.x.ecart>0?"+":"")+cmMm(g.x.ecart,g.g.mode==="ps"?0:2)+" "+cmUnite(g.g)));
    h+='<tr class="cm-'+o.etat+'"><td><input type="checkbox" data-selnet="'+esc(o.net)+'"'+(CM.sel.has(o.net)?" checked":"")+'></td>'+
      '<td>'+cmEtat(o.etat)+'</td>'+
      '<td><button type="button" class="cm-net" data-a="voir" data-v="'+esc(o.net)+'" title="Fermer et sélectionner le routage de ce net">'+esc(o.net)+'</button>'+
        (r.paire?' <span class="cm-tag" title="paire différentielle">'+esc(r.paire.name)+'</span>':"")+'</td>'+
      '<td><select class="tbsel cm-sel" data-cm="'+esc("netclasse"+CM_SEP+o.net)+'">'+
        S.classes.map(c=>'<option'+(c.name===r.classe?" selected":"")+'>'+esc(c.name)+'</option>').join("")+'</select></td>'+
      '<td class="n">'+(m.n?cmMm(m.len):"—")+'</td><td class="n">'+(m.n?cmMm(m.ps,0):"—")+'</td>'+
      '<td class="n">'+m.vias+'</td><td class="n">'+z0+'</td>'+
      '<td>'+cmChamp(k("z"),rn.z,her("z"),"Impédance cible du net ; vide : celle de la classe")+'</td>'+
      '<td>'+cmChamp(k("zTol"),rn.zTol,her("zTol"),"Tolérance sur l'impédance, en %")+'</td>'+
      '<td>'+cmChamp(k("lMin"),rn.lMin,her("lMin"),"Longueur minimale, mm")+'</td>'+
      '<td>'+cmChamp(k("lMax"),rn.lMax,her("lMax"),"Longueur maximale, mm")+'</td>'+
      '<td>'+cmChamp(k("viasMax"),rn.viasMax,her("viasMax"),"Nombre de vias maximal")+'</td>'+
      '<td>'+cmChamp(k("couches"),rn.couches?rn.couches.map(i=>i+1).join(","):"",her("couches"),
        "Couches permises : « 1,4 » pour L1 et L4 ; vide : toutes",true)+'</td>'+
      '<td>'+esc(r.groupes.map(g=>g.nom).join(", "))+'</td>'+
      '<td class="cm-msg">'+esc(ecarts.join(" ; "))+'</td></tr>';
  }
  h+='</tbody></table>'+(vis.length>1500?'<p class="cm-note">… '+(vis.length-1500)+' net(s) de plus : filtrez.</p>':"")+
     (vis.length?"":'<p class="cm-note">Aucun net ne correspond.</p>')+'</div>'+
    '<p class="cm-note">Une case vide hérite de la classe (valeur en grisé). Les longueurs et délais sont ceux du cuivre routé, '+
    'vias compris pour le délai ; Z₀ est calculée par les formules de ligne (Hammerstad, Wheeler) sur l\'empilage. '+
    'Pour l\'audit complet par la méthode des moments : Simulation EM.</p>';
  return h;
}
function cmHtmlClasses(){
  const C=cmModele(), M=cmMesures();
  const parClasse=new Map();
  for(const net of M.keys()){const n=className(net);parClasse.set(n,(parClasse.get(n)||0)+1);}
  let h='<div class="cm-barre"><span class="cm-note">Les règles physiques sont celles de la fenêtre des règles : '+
    'modifiées ici, elles le sont là-bas, et le routeur, le DRC et les zones les appliquent.</span><span class="cm-sp"></span>'+
    '<button type="button" class="tb" data-a="regles" data-v="cls">Règles…</button></div>';
  h+='<div class="cm-table-w"><table class="cm-table"><thead><tr><th>Classe</th><th class="n">Nets</th>'+
    '<th>Largeur</th><th>Par couche</th><th>Isolation</th><th>Via Ø</th><th>Perçage</th>'+
    '<th>Z cible Ω</th><th>Tol. %</th><th>L min</th><th>L max</th><th>Vias max</th><th>Couches</th><th>Largeur pour Z cible</th></tr></thead><tbody>';
  for(const c of S.classes){
    const r=C.classes[c.name]||{};
    const k=x=>"classe"+CM_SEP+c.name+CM_SEP+x, ph=x=>"phys"+CM_SEP+c.name+CM_SEP+x;
    let lz="—";
    if(r.z){
      const cs=[];
      for(let l=0;l<S.cu;l++){
        if(!cmCoucheSignal(l))continue;            // un plan ne porte pas de piste
        const w=cmLargeurPourZ(r.z,l);
        cs.push(w?'<button type="button" class="cm-mini" data-a="largeurz" data-v="'+esc(c.name+CM_SEP+l)+
          '" title="Prendre cette largeur pour la classe sur '+cmNomCouche(l)+'">'+cmNomCouche(l)+" "+cmMm(w,3)+'</button>':
          '<span class="cm-nr" title="pas de plan de référence ou cible hors d\'atteinte">'+cmNomCouche(l)+' —</span>');
      }
      if(cs.some(x=>/largeurz/.test(x)))cs.push('<button type="button" class="cm-mini" data-a="largeurz" data-v="'+
        esc(c.name+CM_SEP+"*")+'" title="Prendre la largeur de la Z cible sur chaque couche de signal">→ toutes</button>');
      lz=cs.join(" ");
    }
    /* la largeur propre à chaque couche de signal ; vide : celle de la classe */
    const parCouche=[];
    for(let l=0;l<S.cu;l++){
      if(!cmCoucheSignal(l))continue;
      const v=c.wL&&c.wL[l]>0?c.wL[l]:"";
      parCouche.push('<span class="cm-wl">'+cmNomCouche(l)+" "+
        cmChamp("wl"+CM_SEP+c.name+CM_SEP+l,v,c.w,"Largeur sur "+cmNomCouche(l)+", mm ; vide : "+cmMm(c.w,3)+" mm, celle de la classe")+'</span>');
    }
    h+='<tr><td><b>'+esc(c.name)+'</b></td><td class="n">'+(parClasse.get(c.name)||0)+'</td>'+
      '<td>'+cmChamp(ph("w"),c.w,"","Largeur de piste, mm — sur les couches sans largeur propre")+'</td>'+
      '<td class="cm-lz">'+parCouche.join(" ")+'</td>'+
      '<td>'+cmChamp(ph("clr"),c.clr,"","Isolation, mm")+'</td>'+
      '<td>'+cmChamp(ph("via"),c.via,"","Diamètre de via, mm")+'</td>'+
      '<td>'+cmChamp(ph("drill"),c.drill,"","Perçage de via, mm")+'</td>'+
      '<td>'+cmChamp(k("z"),r.z,"","Impédance cible, Ω")+'</td>'+
      '<td>'+cmChamp(k("zTol"),r.zTol,CM_ZTOL,"Tolérance, %")+'</td>'+
      '<td>'+cmChamp(k("lMin"),r.lMin,"","Longueur minimale, mm")+'</td>'+
      '<td>'+cmChamp(k("lMax"),r.lMax,"","Longueur maximale, mm")+'</td>'+
      '<td>'+cmChamp(k("viasMax"),r.viasMax,"","Vias maximum")+'</td>'+
      '<td>'+cmChamp(k("couches"),r.couches?r.couches.map(i=>i+1).join(","):"","toutes","Couches permises : « 1,4 »",true)+'</td>'+
      '<td class="cm-lz">'+lz+'</td></tr>';
  }
  h+='</tbody></table></div><p class="cm-note">La largeur pour Z cible est calculée couche par couche d\'après l\'empilage '+
    '(diélectrique et plans de référence), sur les couches de signal ; un clic la pose sur sa couche. Une largeur par couche l\'emporte sur '+
    'la largeur de la classe : le routeur la prend en changeant de couche, le DRC la contrôle, « aligner sur la classe » la suit. '+
    'Les classes à impédance cible figurent au plan de fabrication (Fichier → Plans).</p>';
  return h;
}
function cmHtmlPaires(){
  const M=cmMesures();
  let h='<div class="cm-barre"><span class="cm-note">Les règles de paire (largeur, écart, découplé) se règlent dans la fenêtre des règles.</span>'+
    '<span class="cm-sp"></span><button type="button" class="tb" data-a="regles" data-v="dp">Règles de paire…</button></div>';
  if(!S.dpPairs.length)return h+'<p class="cm-note">Aucune paire différentielle sur cette carte.</p>';
  h+='<div class="cm-table-w"><table class="cm-table"><thead><tr><th>État</th><th>Paire</th><th>P</th><th>N</th><th>Règle</th>'+
    '<th class="n">Long. P</th><th class="n">Long. N</th><th class="n">Écart mm</th><th class="n">Écart ps</th>'+
    '<th class="n">Découplé mm</th><th class="n">Admis</th><th>Largeur</th><th>Écart</th></tr></thead><tbody>';
  for(const p of S.dpPairs){
    const r=dpRuleFor(p), mp=M.get(p.p), mn=M.get(p.n);
    let cp={len:0,lenN:0,uncoupled:0};
    try{cp=dpCoupling(p);}catch(_){}
    const lp=mp?mp.len:0, ln=mn?mn.len:0, ec=Math.abs(lp-ln);
    const eps=Math.abs((mp?mp.ps:0)-(mn?mn.ps:0));
    const faute=(cp.len>0&&cp.uncoupled>r.maxUncoupled+1e-3)||(lp>0&&ln>0&&ec>0.5);
    const etat=!(mp&&mp.n)||!(mn&&mn.n)?"nr":(faute?"err":"ok");
    const v=dpValues(r,0);
    h+='<tr class="cm-'+etat+'"><td>'+cmEtat(etat)+'</td><td><b>'+esc(p.name)+'</b></td>'+
      '<td><button type="button" class="cm-net" data-a="voir" data-v="'+esc(p.p)+'">'+esc(p.p)+'</button></td>'+
      '<td><button type="button" class="cm-net" data-a="voir" data-v="'+esc(p.n)+'">'+esc(p.n)+'</button></td>'+
      '<td>'+esc(r.name)+'</td><td class="n">'+cmMm(lp)+'</td><td class="n">'+cmMm(ln)+'</td>'+
      '<td class="n">'+cmMm(ec)+'</td><td class="n">'+cmMm(eps,0)+'</td>'+
      '<td class="n">'+cmMm(cp.uncoupled||0)+'</td><td class="n">'+cmMm(r.maxUncoupled)+'</td>'+
      '<td>'+cmMm(v.minW,3)+" – "+cmMm(v.maxW,3)+'</td><td>'+cmMm(v.minGap,3)+" – "+cmMm(v.maxGap,3)+'</td></tr>';
  }
  return h+'</tbody></table></div><p class="cm-note">Écart de longueur signalé au-delà de 0,5 mm, comme au DRC. '+
    'Le serpentin (Placer → Serpentin) prend l\'écart de la paire pour cible.</p>';
}
function cmHtmlGroupes(){
  const C=cmModele(), M=cmMesures();
  let h='';
  if(!C.groupes.length)h+='<p class="cm-note">Aucun groupe. Un groupe d\'appariement égalise des longueurs (ou des délais) : '+
    'bus de données d\'une mémoire, lignes d\'un RGMII, voies d\'un bus parallèle. Cochez ses nets ci-dessous.</p>';
  for(const g of C.groupes){
    const e=cmEvaluerGroupe(g,M);
    const nf=e.membres.filter(x=>!x.ok).length;
    const k=c=>"grp"+CM_SEP+g.id+CM_SEP+c;
    h+='<div class="cm-grp"><div class="cm-grp-t">'+cmEtat(e.cible==null?"nr":(nf?"err":"ok"))+
      '<input class="cm-in cm-large" data-cm="'+esc(k("nom"))+'" value="'+esc(g.nom)+'" title="Nom du groupe">'+
      '<select class="tbsel" data-cm="'+esc(k("mode"))+'"><option value="mm"'+(g.mode==="mm"?" selected":"")+
        '>en longueur (mm)</option><option value="ps"'+(g.mode==="ps"?" selected":"")+'>en délai (ps)</option></select>'+
      ' ± <input class="cm-in" data-cm="'+esc(k("tol"))+'" value="'+esc(g.tol)+'" title="Tolérance"> '+cmUnite(g)+
      ' · référence <select class="tbsel" data-cm="'+esc(k("ref"))+'"><option value="">le plus long</option>'+
        g.nets.map(n=>'<option'+(g.ref===n?" selected":"")+'>'+esc(n)+'</option>').join("")+'</select>'+
      '<span class="cm-sp"></span><span class="cm-note">cible '+(e.cible==null?"—":cmMm(e.cible,g.mode==="ps"?0:2)+" "+cmUnite(g)+
        " ("+esc(e.refNet)+")")+'</span>'+
      '<button type="button" class="cm-mini" data-a="grpsuppr" data-v="'+esc(g.id)+'" title="Supprimer le groupe">🗑</button></div>'+
      '<table class="cm-table"><thead><tr><th>État</th><th>Net</th><th class="n">Long. mm</th><th class="n">Délai ps</th>'+
      '<th class="n">Écart</th><th class="n">À ajouter (mm)</th><th></th></tr></thead><tbody>';
    for(const x of e.membres){
      const etat=!x.routé?"nr":(x.ok?"ok":"err");
      const ajout=x.ecart!=null&&x.ecart<-g.tol?(g.mode==="ps"?-x.ecart/((x.m&&x.m.psmm)||6.7):-x.ecart):0;
      h+='<tr class="cm-'+etat+'"><td>'+cmEtat(etat)+'</td>'+
        '<td><button type="button" class="cm-net" data-a="voir" data-v="'+esc(x.net)+'">'+esc(x.net)+'</button>'+
          (x.net===e.refNet?' <span class="cm-tag">réf.</span>':"")+(x.m?"":' <span class="cm-tag">absent</span>')+'</td>'+
        '<td class="n">'+(x.routé?cmMm(x.m.len):"—")+'</td><td class="n">'+(x.routé?cmMm(x.m.ps,0):"—")+'</td>'+
        '<td class="n">'+(x.ecart==null?"—":(x.ecart>0?"+":"")+cmMm(x.ecart,g.mode==="ps"?0:2)+" "+cmUnite(g))+'</td>'+
        '<td class="n">'+(ajout>0?cmMm(ajout):"")+'</td>'+
        '<td><button type="button" class="cm-mini" data-a="grpretirer" data-v="'+esc(g.id+CM_SEP+x.net)+'" title="Retirer du groupe">×</button></td></tr>';
    }
    h+='</tbody></table></div>';
  }
  /* création */
  const q=dfNormTxtCm(CM.grpFiltre);
  const nets=[...M.keys()].filter(n=>!q||dfNormTxtCm(n).indexOf(q)>=0)
    .sort((a,b)=>a.localeCompare(b,"fr",{numeric:true}));
  h+='<div class="cm-grp cm-neuf"><div class="cm-grp-t"><b>Nouveau groupe</b>'+
    '<input class="cm-in cm-large" id="cmGrpNom" placeholder="Nom (ex. DDR_DQ0-7)">'+
    '<select class="tbsel" id="cmGrpMode"><option value="mm">en longueur (mm)</option><option value="ps">en délai (ps)</option></select>'+
    ' ± <input class="cm-in" id="cmGrpTol" placeholder="0,5" title="Tolérance (mm ou ps)">'+
    '<span class="cm-sp"></span><button type="button" class="tb" data-a="grpdepuissel" title="Cocher les nets des pistes sélectionnées sur la carte">Depuis la sélection</button>'+
    '<button type="button" class="tb" data-a="grpcreer">Créer le groupe ('+CM.grpSel.size+')</button></div>'+
    '<input type="search" id="cmGrpFiltre" class="cm-filtre" placeholder="Filtrer les nets (ex. DQ)" value="'+esc(CM.grpFiltre)+'">'+
    '<div class="cm-liste">'+nets.slice(0,600).map(n=>'<label class="cm-case"><input type="checkbox" data-grpnet="'+esc(n)+'"'+
      (CM.grpSel.has(n)?" checked":"")+'> '+esc(n)+'</label>').join("")+'</div></div>'+
    '<p class="cm-note">Le serpentin (Placer → Serpentin), posé sur un net d\'un groupe, propose d\'ajouter ce qui lui manque. '+
    'En délai, la longueur à ajouter se déduit du retard par millimètre du net.</p>';
  return h;
}
function cmHtmlMatrice(){
  const C=cmModele(), cls=S.classes.map(c=>c.name);
  let h='<p class="cm-note">Isolation minimale entre deux classes, en mm. Vide : la plus exigeante des deux classes. '+
    'Une case s\'ajoute aux classes et à la matrice des natures de cuivre : elle ne peut que relever l\'isolation. '+
    'Le routeur, le DRC, les zones et les Gerber l\'appliquent. Les deux nets d\'une paire différentielle gardent leur écart.</p>';
  h+='<div class="cm-table-w"><table class="cm-table cm-mat"><thead><tr><th></th>'+cls.map(c=>'<th>'+esc(c)+'</th>').join("")+'</tr></thead><tbody>';
  cls.forEach((a,i)=>{
    h+='<tr><th>'+esc(a)+'</th>';
    cls.forEach((b,j)=>{
      if(j<i){h+='<td class="cm-vide"></td>';return;}
      const ca=S.classes[i].clr, cb=S.classes[j].clr;
      h+='<td>'+cmChamp("mat"+CM_SEP+a+CM_SEP+b,C.matrice[cmCle(a,b)],cmMm(Math.max(ca,cb),2),
        "Isolation "+a+" ↔ "+b+", mm")+'</td>';
    });
    h+='</tr>';
  });
  return h+'</tbody></table></div>';
}
(function cmBrancher(){
  if(typeof document==="undefined"||!document.getElementById)return;
  const b=document.getElementById("bContraintes");
  if(b)b.onclick=()=>cmOuvrir();
})();
