/* =============================================================================
   editeur-schematique — 26-variantes.js
   Variantes de montage (BOM) : quels composants sont posés dans chaque version
   de la carte. Le modèle et ses règles sont dans commun/variantes.js ; ici,
   l'interface : la fenêtre des variantes (une case « monté » par composant et
   par variante), le choix de la variante active dans la nomenclature, la
   section du panneau Propriétés, et le marquage des non-montés sur la feuille.
   ============================================================================= */
"use strict";

/* Tous les composants de nomenclature du document, toutes feuilles. */
function schVarComposants(){
  storeCurrent();
  const out=[];
  S.pages.forEach((p,i)=>{
    const src=(i===S.page)?S.comps:(p.comps||[]);
    for(const c of src) if(!defOf(c.type).noRef) out.push(c);
  });
  return out;
}
function schVarModele(){
  if(!S.variantes||!Array.isArray(S.variantes.liste)) S.variantes=varVide();
  return S.variantes;
}
function schVarActive(){ return (S.variantes&&S.variantes.active)||""; }

/* La variante active : la feuille, la nomenclature et son export la suivent.
   C'est un réglage du document (il s'enregistre), pas une modification à
   annuler : on ne pousse rien dans l'historique. */
function schVarChoisir(id){
  const m=schVarModele();
  const v=varTrouver(m,id)?id:"";
  if(m.active===v)return;
  m.active=v;S.dirty=true;
  const h=document.getElementById("fHint");
  if(h){
    const nm=varReperesNonMontes(schVarComposants(),v);
    h.textContent=v
      ? "Variante « "+varNom(m,v)+" » : "+nm.length+" composant(s) non monté(s), barrés sur la feuille."
      : "Carte complète : tous les composants sont montés.";
  }
  refreshPanels();draw();
  if(VARD.ouvert)schVarRendre();
}

/* Le menu de la nomenclature : carte complète, puis chaque variante. */
function schVarOptions(sel){
  const m=schVarModele();
  sel.innerHTML='<option value="">Carte complète</option>'+
    m.liste.map(e=>'<option value="'+esc(e.id)+'">'+esc(e.nom)+'</option>').join("");
  sel.value=m.active||"";
}
function schVarMajSelecteur(){
  const sel=document.getElementById("bomVar");
  if(sel&&sel.tagName==="SELECT")schVarOptions(sel);
}

/* ---------- panneau Propriétés ---------- */
/* Un composant seul : une case « monté » par variante. */
function schVarPropsHtml(el){
  if(defOf(el.type).noRef)return "";
  const m=schVarModele();
  const cases=m.liste.length
    ? '<div class="var-cases">'+m.liste.map(e=>
        '<label class="var-case'+(e.id===m.active?" active":"")+'"><input type="checkbox" data-var="'+esc(e.id)+'"'+
        (varEstMonte(el,e.id)?" checked":"")+'> '+esc(e.nom)+'</label>').join("")+'</div>'
    : '<div class="pinnote" style="padding:2px 0 6px">Aucune variante : le composant est monté sur la carte.</div>';
  return '<div class="prop var-prop"><label>Monté dans les variantes</label>'+cases+
    '<button class="tb mini" id="pVarGerer" type="button" style="width:100%">'+
    (m.liste.length?"Gérer les variantes de montage…":"Créer des variantes de montage…")+'</button></div>';
}
function schVarPropsBind(el){
  const box=document.getElementById("props");
  if(!box||!box.querySelectorAll)return;
  box.querySelectorAll(".var-prop input[data-var]").forEach(inp=>{
    inp.onchange=()=>{
      push();
      varDefinirMonte(el,inp.dataset.var,inp.checked);
      buildList();draw();
      if(VARD.ouvert)schVarRendre();
    };
  });
  const g=document.getElementById("pVarGerer");
  if(g)g.onclick=schVarOuvrir;
}
/* Plusieurs composants : les poser ou les retirer d'un coup dans la variante active. */
function schVarMultiHtml(els){
  const m=schVarModele(), vid=m.active;
  if(!vid||!els.some(e=>!defOf(e.type).noRef))return "";
  return '<div class="prop var-prop"><label>Variante « '+esc(varNom(m,vid))+' »</label>'+
    '<div class="row"><button class="tb" id="pVarMonter" type="button">Monter</button>'+
    '<button class="tb" id="pVarRetirer" type="button">Ne pas monter</button></div></div>';
}
function schVarMultiBind(els){
  const vid=schVarActive();
  const agir=monte=>{
    push();
    for(const e of els) if(!defOf(e.type).noRef) varDefinirMonte(e,vid,monte);
    refreshPanels();draw();
    if(VARD.ouvert)schVarRendre();
  };
  const a=document.getElementById("pVarMonter"), b=document.getElementById("pVarRetirer");
  if(a)a.onclick=()=>agir(true);
  if(b)b.onclick=()=>agir(false);
}

/* ---------- la feuille : les non-montés de la variante active, voilés et barrés ---------- */
function schVarDessiner(c){
  const vid=schVarActive();
  if(!vid)return;
  for(const el of S.comps){
    if(defOf(el.type).noRef||varEstMonte(el,vid))continue;
    const b=hitBox(el);
    c.save();
    c.fillStyle="rgba(15,16,18,.55)";
    c.fillRect(b.x1,b.y1,b.x2-b.x1,b.y2-b.y1);
    c.strokeStyle="rgba(232,68,58,.9)";c.lineWidth=2;c.lineCap="round";
    c.beginPath();
    c.moveTo(b.x1,b.y1);c.lineTo(b.x2,b.y2);
    c.moveTo(b.x2,b.y1);c.lineTo(b.x1,b.y2);
    c.stroke();
    c.fillStyle="#e8443a";c.font="bold 9px sans-serif";c.textAlign="right";c.textBaseline="top";
    c.fillText("NM",b.x2-2,b.y1+2);
    c.restore();
  }
}

/* ---------- la fenêtre des variantes ---------- */
const VARD={ouvert:false, filtre:""};
/* Chaque geste de la fenêtre est un pas d'historique : Ctrl+Z défait la
   dernière case cochée, pas toute la séance. */
function schVarPousser(){ push(); }
function schVarConstruire(){
  let d=document.getElementById("varEd");
  if(d)return d;
  d=document.createElement("div");
  d.id="varEd";d.className="modal var-modal";d.hidden=true;
  d.setAttribute("role","dialog");d.setAttribute("aria-modal","true");d.setAttribute("aria-labelledby","varTitre");
  d.innerHTML=
    '<div class="modal-box var-box">'+
      '<header class="modal-head">'+
        '<span class="modal-title" id="varTitre">Variantes de montage (BOM)</span>'+
        '<button class="pnl-btn" id="varFermer" title="Fermer" type="button">✕</button>'+
      '</header>'+
      '<div class="var-corps">'+
        '<section class="var-liste">'+
          '<div class="var-h">Variantes</div>'+
          '<div id="varListe"></div>'+
          '<form id="varAjout" class="var-ajout">'+
            '<input id="varNomNeuf" maxlength="40" placeholder="Nom (ex. Lite, Pro…)">'+
            '<select id="varCopie" title="Partir des non-montés d\'une variante existante"></select>'+
            '<button class="tb on" type="submit">＋ Ajouter</button>'+
          '</form>'+
          '<p class="var-note">La <b>carte complète</b> monte tout. Une variante retire des composants : '+
          'décochez « monté » dans sa colonne. La variante choisie (●) règle la nomenclature, '+
          'son export CSV, et le PCB (bom.csv, positions.csv) à la prochaine synchronisation.</p>'+
          '<button class="tb" id="varToutExporter" type="button" style="width:100%">⇩ Exporter la BOM de chaque variante</button>'+
        '</section>'+
        '<section class="var-matrice">'+
          '<div class="var-outils"><input id="varFiltre" placeholder="Filtrer : repère, valeur, boîtier…">'+
          '<span id="varCompte"></span></div>'+
          '<div class="var-table" id="varTable"></div>'+
        '</section>'+
      '</div>'+
    '</div>';
  document.body.appendChild(d);
  const q=s=>d.querySelector(s);
  q("#varFermer").onclick=schVarFermer;
  d.addEventListener("pointerdown",e=>{if(e.target===d)schVarFermer();});
  d.addEventListener("keydown",e=>{if(e.key==="Escape"){e.stopPropagation();schVarFermer();}});
  q("#varAjout").addEventListener("submit",e=>{
    e.preventDefault();
    const m=schVarModele();
    if(m.liste.length>=VAR_MAX){alert(VAR_MAX+" variantes au plus.");return;}
    schVarPousser();
    const id=varAjouter(m,q("#varNomNeuf").value,schVarComposants(),q("#varCopie").value);
    q("#varNomNeuf").value="";
    if(id)m.active=id;
    S.dirty=true;
    schVarRendre();refreshPanels();draw();
  });
  q("#varFiltre").addEventListener("input",e=>{VARD.filtre=e.target.value;schVarRendreTable();});
  q("#varToutExporter").onclick=schVarExporterTout;
  /* la liste des variantes : choisir, renommer, exporter, supprimer */
  q("#varListe").addEventListener("change",e=>{
    const t=e.target, id=t.dataset&&t.dataset.id;
    if(t.name==="varActive"){schVarChoisir(t.value);return;}
    if(t.classList.contains("var-nom")&&id){
      schVarPousser();
      if(!varRenommer(schVarModele(),id,t.value))t.value=varNom(schVarModele(),id);
      S.dirty=true;schVarRendre();refreshPanels();
    }
  });
  q("#varListe").addEventListener("click",e=>{
    const b=e.target.closest&&e.target.closest("button[data-a]");if(!b)return;
    const id=b.dataset.id, m=schVarModele();
    if(b.dataset.a==="csv")exportBomCsv(id||"");
    if(b.dataset.a==="suppr"){
      if(!confirm("Supprimer la variante « "+varNom(m,id)+" » ? Ses composants redeviennent montés partout ailleurs."))return;
      schVarPousser();
      varSupprimer(m,id,schVarComposants());
      S.dirty=true;schVarRendre();refreshPanels();draw();
    }
  });
  /* la matrice : une case par composant et par variante */
  q("#varTable").addEventListener("change",e=>{
    const t=e.target;
    if(!t.dataset||!t.dataset.var)return;
    const c=schVarComposants().find(x=>x.ref===t.dataset.ref&&String(x.id)===t.dataset.cid);
    if(!c)return;
    schVarPousser();
    varDefinirMonte(c,t.dataset.var,t.checked);
    S.dirty=true;
    schVarRendreListe();schVarMajCompte();buildList();draw();
    if(selCount())refreshPanels();
  });
  /* en-tête de colonne : tout monter / ne rien monter (parmi les composants filtrés) */
  q("#varTable").addEventListener("click",e=>{
    const b=e.target.closest&&e.target.closest("button[data-col]");if(!b)return;
    schVarPousser();
    const monte=b.dataset.tout==="1";
    for(const c of schVarFiltrer(schVarComposants()))varDefinirMonte(c,b.dataset.col,monte);
    S.dirty=true;
    schVarRendre();buildList();draw();
  });
  return d;
}
function schVarFiltrer(comps){
  const f=VARD.filtre.trim().toLowerCase();
  if(!f)return comps;
  return comps.filter(c=>[c.ref,c.value,c.pkg,defOf(c.type).n].some(v=>String(v||"").toLowerCase().includes(f)));
}
function schVarRendreListe(){
  const m=schVarModele(), comps=schVarComposants();
  const ligne=(id,nom,edit)=>{
    const nm=id?varReperesNonMontes(comps,id).length:0;
    return '<div class="var-ligne'+(m.active===id?" active":"")+'">'+
      '<input type="radio" name="varActive" value="'+esc(id)+'"'+(m.active===id?" checked":"")+' title="Variante active">'+
      (edit?'<input class="var-nom" data-id="'+esc(id)+'" maxlength="40" value="'+esc(nom)+'">'
           :'<span class="var-nom fixe">'+esc(nom)+'</span>')+
      '<span class="var-n" title="Non montés">'+(id?nm+" NM":"tout")+'</span>'+
      '<button class="pnl-btn" type="button" data-a="csv" data-id="'+esc(id)+'" title="Exporter la BOM de cette variante (CSV)">⇩</button>'+
      (edit?'<button class="pnl-btn" type="button" data-a="suppr" data-id="'+esc(id)+'" title="Supprimer la variante">✕</button>':'<span class="var-vide"></span>')+
    '</div>';
  };
  document.getElementById("varListe").innerHTML=
    ligne("","Carte complète",false)+m.liste.map(e=>ligne(e.id,e.nom,true)).join("");
  const cp=document.getElementById("varCopie");
  cp.innerHTML='<option value="">vierge</option>'+
    m.liste.map(e=>'<option value="'+esc(e.id)+'">copie de '+esc(e.nom)+'</option>').join("");
}
function schVarMajCompte(){
  const el=document.getElementById("varCompte");
  if(el)el.textContent=schVarComposants().length+" composant(s)";
}
function schVarRendreTable(){
  const m=schVarModele();
  const comps=schVarFiltrer(schVarComposants().slice()
    .sort((a,b)=>String(a.ref||"").localeCompare(String(b.ref||""),"fr",{numeric:true})));
  const box=document.getElementById("varTable");
  if(!m.liste.length){
    box.innerHTML='<div class="empty">Ajoutez une variante (à gauche) : chaque composant y est d\'abord monté, '+
      'décochez ceux à ne pas poser.</div>';
    schVarMajCompte();return;
  }
  let h='<table class="bom var-t"><thead><tr><th>Rep.</th><th>Valeur</th><th>Boîtier</th>'+
    m.liste.map(e=>'<th class="var-col'+(e.id===m.active?" active":"")+'"><span>'+esc(e.nom)+'</span>'+
      '<span class="var-tout"><button class="pnl-btn" type="button" data-col="'+esc(e.id)+'" data-tout="1" title="Tout monter (composants affichés)">✓</button>'+
      '<button class="pnl-btn" type="button" data-col="'+esc(e.id)+'" data-tout="0" title="Ne rien monter (composants affichés)">✗</button></span></th>').join("")+
    '</tr></thead><tbody>';
  for(const c of comps){
    h+='<tr><td class="r">'+esc(c.ref||"—")+'</td><td>'+esc(c.value||"")+'</td><td class="v" style="text-align:left">'+esc(c.pkg||"")+'</td>'+
      m.liste.map(e=>{
        const on=varEstMonte(c,e.id);
        return '<td class="var-c'+(on?"":" nm")+(e.id===m.active?" active":"")+'"><input type="checkbox" data-var="'+esc(e.id)+
          '" data-ref="'+esc(c.ref||"")+'" data-cid="'+esc(c.id)+'"'+(on?" checked":"")+' aria-label="'+esc((c.ref||"")+" monté dans "+e.nom)+'"></td>';
      }).join("")+'</tr>';
  }
  box.innerHTML=h+'</tbody></table>';
  schVarMajCompte();
}
function schVarRendre(){
  if(!document.getElementById("varEd"))return;
  schVarRendreListe();schVarRendreTable();schVarMajSelecteur();
}
function schVarOuvrir(){
  const d=schVarConstruire();
  VARD.ouvert=true;
  schVarRendre();
  d.hidden=false;
}
function schVarFermer(){
  const d=document.getElementById("varEd");
  if(d)d.hidden=true;
  VARD.ouvert=false;
  refreshPanels();draw();
}
/* Une nomenclature par variante, carte complète comprise. */
function schVarExporterTout(){
  const ids=[""].concat(schVarModele().liste.map(e=>e.id));
  ids.forEach((id,i)=>setTimeout(()=>exportBomCsv(id),i*400));
}
