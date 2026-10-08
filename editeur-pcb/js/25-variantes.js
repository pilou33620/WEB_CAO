"use strict";
/* ==========================================================================
   Éditeur PCB — variantes de montage (BOM)
   Les variantes se définissent dans le schéma (commun/variantes.js). La carte
   en garde une copie dans son document -- S.variantes, et `nonMonte` sur chaque
   empreinte, rapprochée par son repère -- pour que bom.csv et positions.csv
   suivent la variante choisie même sans le schéma sous la main.
   ========================================================================== */

function pcbVarModele(){
  if(!S.variantes||!Array.isArray(S.variantes.liste))S.variantes=varVide();
  return S.variantes;
}
function pcbVarActive(){ return (S.variantes&&S.variantes.active)||""; }
/* L'empreinte est-elle posée dans la variante active ? */
function pcbVarMonte(fp){ return varEstMonte(fp,pcbVarActive()); }

/* Reprend les variantes du schéma `doc` (à défaut celui que la carte connaît
   déjà) : la liste, et pour chaque empreinte les variantes où son composant
   n'est pas posé. La variante choisie sur la carte est gardée si elle existe
   encore. Rend vrai si la carte a changé -- c'est alors un pas d'historique,
   sauf si l'appelant en a déjà poussé un (`dejaPousse`, l'ECO). */
function pcbVarDepuisSchema(doc,dejaPousse){
  if(!doc&&typeof pcbSchemaDoc==="function")doc=pcbSchemaDoc();
  if(!doc||typeof doc!=="object")return false;
  const modele=varNorm(doc.variantes);
  const parRef=new Map();
  for(const p of (Array.isArray(doc.pages)?doc.pages:[doc]))
    for(const c of ((p&&Array.isArray(p.comps))?p.comps:[]))
      if(c&&c.ref)parRef.set(String(c.ref),varNormNonMonte(c.nonMonte,modele));
  const active=varTrouver(modele,pcbVarActive())?pcbVarActive():modele.active;
  const neuf={liste:modele.liste,active:active};
  const nmDe=fp=>{const l=parRef.get(fp.ref);return l&&l.length?l:null;};
  const pareil=JSON.stringify(neuf)===JSON.stringify(pcbVarModele())&&
    S.fps.every(fp=>JSON.stringify(nmDe(fp))===JSON.stringify(fp.nonMonte||null));
  if(pareil)return false;
  if(!dejaPousse)push();
  S.variantes=neuf;
  for(const fp of S.fps){
    const l=nmDe(fp);
    if(l)fp.nonMonte=l.slice();else delete fp.nonMonte;
  }
  return true;
}

/* Choisir la variante : la carte, le panneau des composants et le dossier de
   fabrication la suivent. Réglage du document, comme la couche active. */
function pcbVarChoisir(id){
  const m=pcbVarModele();
  const v=varTrouver(m,id)?id:"";
  if(m.active===v)return;
  m.active=v;S.dirty=true;
  const nm=varReperesNonMontes(S.fps,v);
  hint(v?"Variante « "+varNom(m,v)+" » : "+nm.length+" empreinte(s) non montée(s), retirées de bom.csv et positions.csv."
        :"Carte complète : toutes les empreintes sont montées.");
  refreshPanels();draw();
}

/* Les empreintes non montées de la variante active : voilées et barrées. */
function pcbVarDessiner(c){
  const vid=pcbVarActive();
  if(!vid)return;
  for(const fp of S.fps){
    if(varEstMonte(fp,vid))continue;
    const b=fpBBox(fp), w=b.x2-b.x1, h=b.y2-b.y1;
    c.save();
    c.fillStyle="rgba(10,11,13,.55)";
    c.fillRect(b.x1,b.y1,w,h);
    c.strokeStyle="rgba(232,68,58,.95)";c.lineWidth=px(2);c.lineCap="round";
    c.beginPath();
    c.moveTo(b.x1,b.y1);c.lineTo(b.x2,b.y2);
    c.moveTo(b.x2,b.y1);c.lineTo(b.x1,b.y2);
    c.stroke();
    const t=Math.max(0.6,Math.min(1.6,Math.min(w,h)*0.3));
    c.fillStyle="#e8443a";c.font="bold "+t+"px sans-serif";
    c.textAlign="center";c.textBaseline="middle";
    c.fillText("NM",(b.x1+b.x2)/2,(b.y1+b.y2)/2);
    c.restore();
  }
}

/* La fenêtre : choisir la variante, voir ce qu'elle retire, la reprendre du schéma. */
function pcbVarOuvrir(){
  pcbVarDepuisSchema();
  let m=document.getElementById("pcbVarEd");
  if(!m){
    m=document.createElement("div");
    m.id="pcbVarEd";m.className="modal var-modal";
    m.setAttribute("role","dialog");m.setAttribute("aria-modal","true");
    document.body.appendChild(m);
    m.addEventListener("pointerdown",e=>{if(e.target===m)pcbVarFermer();});
    m.addEventListener("keydown",e=>{if(e.key==="Escape"){e.stopPropagation();pcbVarFermer();}});
    m.addEventListener("change",e=>{if(e.target.name==="pcbVar")pcbVarChoisir(e.target.value),pcbVarRendre();});
    m.addEventListener("click",e=>{
      const b=e.target.closest&&e.target.closest("button[data-a]");if(!b)return;
      if(b.dataset.a==="fermer")pcbVarFermer();
      if(b.dataset.a==="schema")pcbVarReprendre();
    });
  }
  m.hidden=false;
  pcbVarRendre();
}
function pcbVarFermer(){
  const m=document.getElementById("pcbVarEd");
  if(m)m.hidden=true;
}
function pcbVarRendre(){
  const m=document.getElementById("pcbVarEd");
  if(!m)return;
  const mod=pcbVarModele();
  const ligne=(id,nom)=>{
    const nm=varReperesNonMontes(S.fps,id);
    return '<label class="var-ligne var-pcb'+(mod.active===id?" active":"")+'">'+
      '<input type="radio" name="pcbVar" value="'+esc(id)+'"'+(mod.active===id?" checked":"")+'>'+
      '<span class="var-nom fixe">'+esc(nom)+'</span>'+
      '<span class="var-n">'+(id?nm.length+" NM":"tout")+'</span>'+
      (nm.length?'<span class="var-refs">'+esc(nm.join(" "))+'</span>':'')+
    '</label>';
  };
  m.innerHTML='<div class="box"><h3>Variante de montage</h3>'+
    '<p>Les empreintes non montées de la variante choisie sont barrées sur la carte, et retirées de '+
    '<b>bom.csv</b> et <b>positions.csv</b> du dossier de fabrication. Le cuivre, lui, ne change pas : '+
    'leurs pastilles restent gravées.</p>'+
    (mod.liste.length?"":'<p>Aucune variante pour l\'instant : elles se créent dans l\'éditeur schématique '+
      '(Fichier → Variantes de montage…), puis s\'enregistrent avec le schéma.</p>')+
    '<div class="var-choix">'+ligne("","Carte complète")+mod.liste.map(e=>ligne(e.id,e.nom)).join("")+'</div>'+
    '<div class="row" style="margin-top:12px;display:flex;gap:8px;justify-content:flex-end">'+
      '<button class="tb" type="button" data-a="schema" title="Relire les variantes dans le schéma enregistré du projet">⟳ Reprendre du schéma</button>'+
      '<button class="tb on" type="button" data-a="fermer">Fermer</button>'+
    '</div></div>';
}
/* Relit le schéma (dossier du projet, sinon la session) : ses variantes ont pu
   changer depuis que la carte les a copiées. */
async function pcbVarReprendre(){
  if(typeof S!=="undefined")S.schDoc=null;
  let doc=null;
  try{ if(typeof pcbSyncSchema==="function")doc=await pcbSyncSchema(); }catch(_){}
  if(!doc){ hint("Schéma introuvable : ouvrez le projet, ou passez par l'éditeur schématique."); return; }
  const change=pcbVarDepuisSchema(doc);
  hint(change?"Variantes reprises du schéma : "+pcbVarModele().liste.length+" variante(s).":"Variantes déjà à jour avec le schéma.");
  refreshPanels();draw();pcbVarRendre();
}
