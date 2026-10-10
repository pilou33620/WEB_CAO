"use strict";
/* ==========================================================================
   Éditeur schématique — contraintes de nets, saisies à la conception
   --------------------------------------------------------------------------
   C'est au schéma qu'on sait ce qu'un net doit tenir : que CLK_DDR est une
   horloge de 50 Ω qui ne passe pas 40 mm, que le bus SPI vers les deux
   mémoires se route en chaîne U1 → U4 → U5, que D0 à D7 s'égalisent à
   0,5 mm près. Ces directives se saisissent ici, net par net, et partent au
   PCB avec le document du schéma — l'export « ⇉ PCB », l'ECO, ou l'ouverture
   du gestionnaire de contraintes du PCB les y reprennent.

   Ce qu'on saisit ici, par net nommé : impédance cible et tolérance,
   longueur min / max, vias max, couches permises, topologie et ordre des
   repères, moignons admis, tolérance d'étoile ; et des groupes
   d'appariement (longueur ou délai). Les bornes sont celles du PCB :
   commun/contraintes.js les porte pour les deux.

   Ce qui reste au PCB : les contraintes de CLASSE, l'isolation entre classes
   et les largeurs (elles dépendent de l'empilage). Le PCB garde aussi le
   dernier mot : un champ qu'on y remplit passe devant celui du schéma.

   Le document garde tout dans `contraintes` : {nets, groupes}.
   ========================================================================== */

const SCH_CM_CHAMPS=[
  ["z","Z cible Ω","Impédance cible, Ω"],
  ["zTol","Tol. %","Tolérance sur l'impédance, % (10 si vide)"],
  ["lMin","L min mm","Longueur minimale du cuivre, mm"],
  ["lMax","L max mm","Longueur maximale du cuivre, mm"],
  ["viasMax","Vias max","Nombre de vias maximal"],
  ["couches","Couches","Couches permises : « 1,4 » pour L1 et L4 ; vide : toutes"],
  ["ordre","Ordre","Ordre des repères le long du net, le premier est la source : « U1, U4, U5 »"],
  ["stubMax","Moignon max mm","Longueur de moignon admise, mm (0 : aucun)"],
  ["viaStubMax","Via max mm","Moignon de via admis, mm"],
  ["etoileTol","Tol. étoile mm","Écart admis entre les branches d'une étoile, mm (1 si vide)"]];

function schCmModele(){
  const c=S.contraintes;
  if(!c||typeof c!=="object"||!c.nets||!Array.isArray(c.groupes))
    S.contraintes={nets:cmNormNets(c&&c.nets),groupes:cmNormGroupes(c&&c.groupes)};
  return S.contraintes;
}
/* toute modification : historique du schéma, puis bornes communes */
function schCmEdit(fn){
  push();
  const C=schCmModele();
  fn(C);
  S.contraintes={nets:cmNormNets(C.nets),groupes:cmNormGroupes(C.groupes)};
  S.dirty=true;
}
function schCmPoser(net,cle,txt){
  const v=cmLireChamp(cle,txt,64);
  schCmEdit(C=>{
    const r=Object.assign({},C.nets[net]||{});
    if(v==null)delete r[cle];else r[cle]=v;
    if(Object.keys(r).length)C.nets[net]=r;else delete C.nets[net];
  });
}
function schCmGroupeCreer(nom,nets,mode,tol){
  nets=[...new Set((nets||[]).map(String).filter(Boolean))];
  if(nets.length<2)return null;
  let id="";
  schCmEdit(C=>{
    let k=1;while(C.groupes.some(g=>g.id==="g"+k))k++;
    id="g"+k;
    C.groupes.push({id,nom:String(nom||"").trim()||("Groupe "+(C.groupes.length+1)),nets,
      mode:mode==="ps"?"ps":"mm",tol:Number.isFinite(+tol)&&+tol>=0?+tol:(mode==="ps"?10:0.5),ref:""});
  });
  return schCmModele().groupes.find(g=>g.id===id)||null;
}
function schCmGroupeModifier(id,fn){
  schCmEdit(C=>{const g=C.groupes.find(x=>x.id===id);if(g)fn(g);});
}
function schCmGroupeSupprimer(id){
  schCmEdit(C=>{C.groupes=C.groupes.filter(g=>g.id!==id);});
}
/* Les nets nommés du document : seuls eux passent au PCB sous leur nom. Un
   même nom posé sur plusieurs feuilles (étiquette locale répétée) est un
   seul net pour le PCB, qui ne voit que le nom : une ligne. */
function schCmNetsNommes(){
  const parNom=new Map();
  for(const g of docNets().groups){
    if(!g.members.some(m=>m.net&&m.net.named))continue;
    let e=parNom.get(g.name);
    if(!e)parNom.set(g.name,e={name:g.name,refs:new Set(),nodes:0});
    for(const n of g.nodes)if(n.ref)e.refs.add(n.ref);
    e.nodes+=g.nodes.length;
  }
  return [...parNom.values()].map(e=>({name:e.name,nodes:e.nodes,
      refs:[...e.refs].sort((a,b)=>String(a).localeCompare(String(b),"fr",{numeric:true}))}))
    .sort((a,b)=>String(a.name).localeCompare(String(b.name),"fr",{numeric:true}));
}
/* Les contraintes dont le net n'existe plus (renommé, supprimé) : dites, pas
   effacées d'office — un renommage se rattrape. */
function schCmOrphelins(){
  const noms=new Set(schCmNetsNommes().map(n=>n.name));
  const C=schCmModele();
  return {nets:Object.keys(C.nets).filter(n=>!noms.has(n)),
          groupes:C.groupes.map(g=>({g,manque:g.nets.filter(n=>!noms.has(n))})).filter(x=>x.manque.length)};
}
/* Ce que le net a de réglé, en une ligne (panneau Propriétés). */
function schCmResumeNet(net){
  const r=schCmModele().nets[net];
  const out=[];
  if(r){
    if(r.z)out.push(r.z+" Ω"+(r.zTol?" ± "+r.zTol+" %":""));
    if(r.lMin||r.lMax)out.push("L "+(r.lMin?r.lMin+"–":"≤ ")+(r.lMax||"…")+" mm");
    if(r.viasMax!=null)out.push("≤ "+r.viasMax+" via(s)");
    if(r.couches)out.push("L"+r.couches.map(i=>i+1).join(",L"));
    if(r.topo)out.push(CM_TOPO_NOMS[r.topo]+(r.ordre?" "+r.ordre.join("→"):""));
    if(r.stubMax!=null)out.push("moignon ≤ "+r.stubMax+" mm");
    if(r.viaStubMax!=null)out.push("moignon via ≤ "+r.viaStubMax+" mm");
  }
  for(const g of schCmModele().groupes)if(g.nets.indexOf(net)>=0)out.push("groupe "+g.nom);
  return out.join(" · ");
}

/* ==========================================================================
   Fenêtre
   ========================================================================== */
var SCM={filtre:"",focus:"",grpSel:new Set(),grpFiltre:""};
const SCH_CM_SEP="␞";

function schCmOuvrir(net){
  SCM.focus=net||"";
  if(net)SCM.filtre=net;
  let m=document.getElementById("schCmEd");
  if(!m){
    m=document.createElement("div");
    m.id="schCmEd";m.className="modal scm-modal";
    m.setAttribute("role","dialog");m.setAttribute("aria-modal","true");
    m.setAttribute("aria-label","Contraintes de nets");
    document.body.appendChild(m);
    m.addEventListener("pointerdown",e=>{if(e.target===m)schCmFermer();});
    m.addEventListener("keydown",e=>{
      if(e.key==="Escape"){e.stopPropagation();schCmFermer();return;}
      if(e.key==="Enter"&&e.target&&e.target.dataset&&e.target.dataset.scm){e.preventDefault();e.target.blur();}
      e.stopPropagation();          // les raccourcis du schéma restent dehors
    });
    m.addEventListener("input",e=>{
      const t=e.target;
      if(t.id==="scmFiltre"){SCM.filtre=t.value;schCmRendreCorps();schCmFocus("scmFiltre");}
      else if(t.id==="scmGrpFiltre"){SCM.grpFiltre=t.value;schCmRendreCorps();schCmFocus("scmGrpFiltre");}
    });
    m.addEventListener("change",schCmChangement);
    m.addEventListener("click",schCmClic);
  }
  m.hidden=false;
  m.innerHTML='<div class="modal-box scm-box">'+
    '<div class="modal-head"><span class="modal-title">Contraintes de nets — pour le PCB</span>'+
      '<button class="tb" type="button" data-a="fermer" title="Fermer (Échap)">✕</button></div>'+
    '<div class="scm-corps" id="scmCorps"></div></div>';
  schCmRendreCorps();
}
function schCmFermer(){
  const m=document.getElementById("schCmEd");
  if(m)m.hidden=true;
  if(typeof refreshPanels==="function")refreshPanels();
}
function schCmFocus(id){
  const e=document.getElementById(id);
  if(e&&e.focus){e.focus();if(e.setSelectionRange){const n=e.value.length;e.setSelectionRange(n,n);}}
}
function schCmChangement(e){
  const t=e.target, d=t.dataset||{};
  if(d.grpnet!=null){if(t.checked)SCM.grpSel.add(d.grpnet);else SCM.grpSel.delete(d.grpnet);return;}
  if(d.netcls!=null)return;                // la classe : bindNetClassSelects s'en charge
  if(!d.scm)return;
  const p=d.scm.split(SCH_CM_SEP);
  if(p[0]==="net")schCmPoser(p[1],p[2],t.value);
  else if(p[0]==="grp"){
    const [_,id,cle]=p;
    schCmGroupeModifier(id,g=>{
      if(cle==="nom")g.nom=String(t.value).trim()||g.nom;
      else if(cle==="mode")g.mode=t.value==="ps"?"ps":"mm";
      else if(cle==="tol"){const v=cmLireChamp("tol",t.value);if(v!=null&&v>=0)g.tol=v;}
      else if(cle==="ref")g.ref=t.value;
    });
  }
  schCmRendreCorps();
}
function schCmClic(e){
  const b=e.target.closest&&e.target.closest("[data-a]");
  if(!b)return;
  const a=b.dataset.a, v=b.dataset.v;
  if(a==="fermer")schCmFermer();
  else if(a==="tous"){SCM.filtre="";SCM.focus="";schCmRendreCorps();}
  else if(a==="grpcreer"){
    const nom=(document.getElementById("scmGrpNom")||{}).value||"";
    const mode=(document.getElementById("scmGrpMode")||{}).value||"mm";
    const tol=cmLireChamp("tol",(document.getElementById("scmGrpTol")||{}).value);
    const g=schCmGroupeCreer(nom,[...SCM.grpSel],mode,tol);
    if(!g){schCmDire("Un groupe d'appariement demande au moins deux nets cochés.");return;}
    SCM.grpSel.clear();
    schCmDire("Groupe « "+g.nom+" » : "+g.nets.length+" nets, ± "+g.tol+" "+(g.mode==="ps"?"ps":"mm")+".");
    schCmRendreCorps();
  }else if(a==="grpsuppr"){schCmGroupeSupprimer(v);schCmRendreCorps();}
  else if(a==="grpretirer"){
    const [id,net]=v.split(SCH_CM_SEP);
    schCmGroupeModifier(id,g=>{g.nets=g.nets.filter(n=>n!==net);if(g.ref===net)g.ref="";});
    schCmRendreCorps();
  }else if(a==="orphsuppr"){
    schCmEdit(C=>{delete C.nets[v];});
    schCmRendreCorps();
  }
}
function schCmDire(t){const h=document.getElementById("fHint");if(h)h.textContent=t;}
function schCmNorm(s){return String(s||"").normalize("NFD").replace(/[̀-ͯ]/g,"").toLowerCase().trim();}
function schCmChamp(cle,val,titre,large){
  return '<input class="scm-in'+(large?" scm-large":"")+'" data-scm="'+esc(cle)+'" value="'+esc(val==null?"":val)+
    '" title="'+esc(titre||"")+'" inputmode="decimal">';
}
function schCmValeur(r,c){
  const v=r[c];
  if(v==null)return "";
  if(c==="couches")return v.map(i=>i+1).join(",");
  if(c==="ordre")return v.join(", ");
  return v;
}
function schCmRendreCorps(){
  const box=document.getElementById("scmCorps");
  if(!box)return;
  const C=schCmModele(), tous=schCmNetsNommes();
  const q=schCmNorm(SCM.filtre);
  const vis=tous.filter(n=>!q||schCmNorm(n.name).indexOf(q)>=0);
  let h='<p class="scm-note">Ces contraintes partent au PCB avec le schéma (export ⇉ PCB, ECO, gestionnaire de contraintes du PCB). '+
    'Un champ réglé dans le PCB passe devant celui du schéma. Les contraintes de classe, l\'isolation entre classes et les '+
    'largeurs se règlent dans le PCB, qui connaît l\'empilage. Seuls les nets nommés sont listés : un net sans nom n\'a pas '+
    'de nom stable au PCB.</p>';
  h+='<div class="scm-barre"><input type="search" id="scmFiltre" class="scm-filtre" placeholder="Filtrer les nets" value="'+
    esc(SCM.filtre)+'">'+(SCM.filtre?'<button type="button" class="tb" data-a="tous">Tous les nets</button>':"")+
    '<span class="scm-n">'+Object.keys(C.nets).length+' net(s) contraint(s) · '+C.groupes.length+' groupe(s)</span></div>';
  h+='<div class="scm-table-w"><table class="scm-table"><thead><tr><th>Net</th><th>Classe</th><th>Topologie</th>'+
    SCH_CM_CHAMPS.map(c=>'<th title="'+esc(c[2])+'">'+esc(c[1])+'</th>').join("")+'<th>Repères</th></tr></thead><tbody>';
  for(const n of vis.slice(0,800)){
    const r=C.nets[n.name]||{};
    const k=c=>"net"+SCH_CM_SEP+n.name+SCH_CM_SEP+c;
    h+='<tr'+(n.name===SCM.focus?' class="scm-focus"':"")+'><td><b>'+esc(n.name)+'</b></td>'+
      '<td>'+netClassSelect(n.name)+'</td>'+
      '<td><select class="tbsel" data-scm="'+esc(k("topo"))+'" title="Topologie exigée au PCB">'+
        '<option value="">—</option>'+CM_TOPOS.map(t=>'<option value="'+t+'"'+(r.topo===t?" selected":"")+'>'+
        esc(CM_TOPO_NOMS[t])+'</option>').join("")+'</select></td>'+
      SCH_CM_CHAMPS.map(c=>'<td>'+schCmChamp(k(c[0]),schCmValeur(r,c[0]),c[2],c[0]==="ordre"||c[0]==="couches")+'</td>').join("")+
      '<td class="scm-refs">'+esc(n.refs.join(" "))+'</td></tr>';
  }
  h+='</tbody></table>'+(vis.length?"":'<p class="scm-note">Aucun net nommé ne correspond.</p>')+
    (vis.length>800?'<p class="scm-note">… filtrez pour voir les autres.</p>':"")+'</div>';
  /* groupes d'appariement */
  h+='<div class="scm-h">Groupes d\'appariement</div>';
  for(const g of C.groupes){
    const k=c=>"grp"+SCH_CM_SEP+g.id+SCH_CM_SEP+c;
    h+='<div class="scm-grp"><input class="scm-in scm-large" data-scm="'+esc(k("nom"))+'" value="'+esc(g.nom)+'" title="Nom du groupe">'+
      '<select class="tbsel" data-scm="'+esc(k("mode"))+'"><option value="mm"'+(g.mode==="mm"?" selected":"")+'>en longueur (mm)</option>'+
        '<option value="ps"'+(g.mode==="ps"?" selected":"")+'>en délai (ps)</option></select>'+
      ' ± <input class="scm-in" data-scm="'+esc(k("tol"))+'" value="'+esc(g.tol)+'" title="Tolérance">'+
      ' référence <select class="tbsel" data-scm="'+esc(k("ref"))+'"><option value="">le plus long</option>'+
        g.nets.map(x=>'<option'+(g.ref===x?" selected":"")+'>'+esc(x)+'</option>').join("")+'</select>'+
      '<button type="button" class="tb" data-a="grpsuppr" data-v="'+esc(g.id)+'" title="Supprimer le groupe">🗑</button>'+
      '<div class="scm-membres">'+g.nets.map(x=>'<span class="scm-membre">'+esc(x)+
        '<button type="button" data-a="grpretirer" data-v="'+esc(g.id+SCH_CM_SEP+x)+'" title="Retirer du groupe">×</button></span>').join("")+
      '</div></div>';
  }
  const gq=schCmNorm(SCM.grpFiltre);
  h+='<div class="scm-grp scm-neuf"><b>Nouveau groupe</b> <input class="scm-in scm-large" id="scmGrpNom" placeholder="Nom (ex. D0-D7)">'+
    '<select class="tbsel" id="scmGrpMode"><option value="mm">en longueur (mm)</option><option value="ps">en délai (ps)</option></select>'+
    ' ± <input class="scm-in" id="scmGrpTol" placeholder="0,5"> '+
    '<button type="button" class="tb" data-a="grpcreer">Créer avec les nets cochés</button>'+
    '<input type="search" id="scmGrpFiltre" class="scm-filtre" placeholder="Filtrer (ex. D)" value="'+esc(SCM.grpFiltre)+'">'+
    '<div class="scm-liste">'+tous.filter(n=>!gq||schCmNorm(n.name).indexOf(gq)>=0).slice(0,600).map(n=>
      '<label class="scm-case"><input type="checkbox" data-grpnet="'+esc(n.name)+'"'+(SCM.grpSel.has(n.name)?" checked":"")+'> '+
      esc(n.name)+'</label>').join("")+'</div></div>';
  /* ce qui ne correspond plus à aucun net */
  const o=schCmOrphelins();
  if(o.nets.length||o.groupes.length){
    h+='<div class="scm-h">À revoir</div><p class="scm-note">';
    for(const n of o.nets)h+='Contraintes du net <b>'+esc(n)+'</b>, qui n\'existe plus (renommé ?) '+
      '<button type="button" class="tb" data-a="orphsuppr" data-v="'+esc(n)+'">Effacer</button><br>';
    for(const x of o.groupes)h+='Groupe <b>'+esc(x.g.nom)+'</b> : '+esc(x.manque.join(", "))+' absent(s) du schéma<br>';
    h+='</p>';
  }
  box.innerHTML=h;
  if(typeof bindNetClassSelects==="function")bindNetClassSelects(box);
  const f=box.querySelector&&box.querySelector(".scm-focus");
  if(f&&f.scrollIntoView)f.scrollIntoView({block:"center"});
}
(function schCmBrancher(){
  if(typeof document==="undefined"||!document.getElementById)return;
  const b=document.getElementById("bSchContraintes");
  if(b)b.onclick=()=>schCmOuvrir();
})();
