"use strict";
/* ==========================================================================
   Vérif BOM JLCPCB — avant de téléverser le dossier PCBA, chaque ligne de la
   nomenclature JLCPCB (jlcBomLignes) est confrontée à la base JLCPCB par la
   passerelle pcbparts de web_CAO.py (/api/tool) :
     - avec un code LCSC : la pièce existe, son stock couvre le lot, sa valeur,
       sa tension et son boîtier sont ceux de la BOM (c'est l'avertissement
       « The comment … does not match » que JLCPCB donne trop tard) ;
     - sans code, ou code refusé : recherche de pièces qui conviennent, Basic
       d'abord, et le code choisi s'écrit sur la carte (et dans le schéma s'il
       est ouvert dans un autre onglet).
   ========================================================================== */
const VB_PREFIXE={p:1e-12,n:1e-9,u:1e-6,m:1e-3,k:1e3,K:1e3,M:1e6,G:1e9,R:1};
const VB_DIEL=/(X5R|X7R|X6S|X7S|X8R|C0G|NP0|Y5V)/i;
const VB_LIB={basic:0,preferred:1,extended:2};

/* « 6,8µ/6,3VX5R », « 4k7 », « 39nC0G », « 100R » → nombre en unité de base */
function vbValeur(s){
  const m=String(s||"").replace(/µ|μ/g,"u").replace(",",".")
    .match(/^\s*(\d+(?:\.\d+)?)\s*([pnumkKMGR])?(\d+)?/);
  if(!m)return null;
  let n=m[1];
  if(m[3]){if(n.includes("."))return null;n+="."+m[3];}   // 4k7, 6u8, 4R7
  return parseFloat(n)*(m[2]?VB_PREFIXE[m[2]]:1);
}
/* le genre de pièce dit l'unité à chercher dans la fiche JLCPCB */
function vbUnite(ref){
  const p=String(ref||"").match(/^[A-Za-z]+/);
  return p?({C:"F",R:"Ω",L:"H"})[p[0].toUpperCase()]||"":"";
}
/* « 50V 6pF C0G 0805 … » : la valeur dans l'unité voulue, ou null */
function vbValeurFiche(txt,unite){
  const re=/(\d+(?:\.\d+)?)\s*([pnuµμmkKMG])?\s*(F|Ω|ohms?|H)(?![a-z])/gi;
  let m;
  while((m=re.exec(String(txt||"")))){
    const u=/^oh/i.test(m[3])?"Ω":m[3].toUpperCase();
    if(u!==unite)continue;
    const p=m[2]?m[2].replace(/[µμ]/,"u"):"";
    return parseFloat(m[1])*(p?VB_PREFIXE[p]:1);
  }
  return null;
}
function vbTension(txt){
  const m=String(txt||"").replace(",",".").match(/(\d+(?:\.\d+)?)\s*V/i);
  return m?parseFloat(m[1]):null;
}
function vbDiel(txt){
  const m=String(txt||"").match(VB_DIEL);
  return m?m[1].toUpperCase().replace("NP0","C0G"):"";
}
/* 0805 et C0805 sont le même boîtier ; SOT-23 et SOT23 aussi */
function vbBoitier(s){
  const t=String(s||"").toUpperCase();
  const m=t.match(/(?:^|[^0-9])(01005|0201|0402|0603|0805|1206|1210|1812|2010|2512)(?![0-9])/);
  return m?m[1]:t.replace(/[^A-Z0-9]/g,"");
}
function vbMemeBoitier(a,b){
  const x=vbBoitier(a), y=vbBoitier(b);
  if(!x||!y)return true;
  return x===y||(x.length>3&&y.length>3&&(x.includes(y)||y.includes(x)));
}
/* Pièce JLCPCB face à une ligne de BOM : {statut:"ok"|"revoir"|"bloque", notes}. */
function vbJuger(g,part,besoin){
  const notes=[];let statut="ok";
  const pire=s=>{if(s==="bloque"||statut==="ok")statut=s;};
  const fiche=[part.description,part.model,part.package].filter(Boolean).join(" ");
  const stock=+part.stock||0;
  if(stock<besoin){pire("bloque");notes.push("stock "+stock+" < "+besoin+" demandés");}
  const unite=vbUnite(g.refs[0]), v=vbValeur(g.val);
  if(unite&&v!=null){
    const vp=vbValeurFiche(fiche,unite);
    if(vp==null){pire("revoir");notes.push("valeur illisible dans la fiche JLCPCB");}
    else if(Math.abs(vp-v)>v*0.01){pire("bloque");notes.push("valeur "+vbFmt(vp,unite)+" au lieu de "+vbFmt(v,unite));}
    const tb=vbTension(g.val.split("/").slice(1).join("/")||""), tp=vbTension(part.description);
    if(tb!=null&&tp!=null&&tp<tb){pire("bloque");notes.push("tension "+tp+" V < "+tb+" V");}
    const db=vbDiel(g.val), dp=vbDiel(part.description);
    if(db&&dp&&db!==dp){pire("revoir");notes.push("diélectrique "+dp+" au lieu de "+db);}
  }else if(g.val){
    const n=s=>String(s||"").toUpperCase().replace(/[^A-Z0-9]/g,"");
    const a=n(g.val), b=n(part.model);
    if(a&&b&&!a.includes(b)&&!b.includes(a)){pire("revoir");notes.push("référence "+part.model+" ≠ « "+g.val+" »");}
  }
  if(g.pkg&&part.package&&!vbMemeBoitier(g.pkg,part.package)){
    pire("revoir");notes.push("boîtier "+part.package+" au lieu de "+g.pkg);
  }
  if(String(part.library_type||"").toLowerCase()==="extended")notes.push("Extended (frais de pose)");
  return {statut,notes};
}
function vbFmt(v,unite){
  for(const [p,k] of [["G",1e9],["M",1e6],["k",1e3],["",1],["m",1e-3],["µ",1e-6],["n",1e-9],["p",1e-12]])
    if(Math.abs(v)>=k*0.999)return +(v/k).toPrecision(3)+" "+p+unite;
  return v+" "+unite;
}
/* la requête de recherche : valeur et boîtier pour un passif, la référence sinon */
function vbRequete(g){
  const unite=vbUnite(g.refs[0]), v=vbValeur(g.val);
  if(unite&&v!=null){
    const t=vbTension(g.val.split("/").slice(1).join("/")||""), d=vbDiel(g.val);
    return [vbFmt(v,unite).replace(/\s/g,"").replace("µ","u").replace("Ω",""),
      t!=null?t+"V":"",d,g.pkg,{F:"capacitor",Ω:"resistor",H:"inductor"}[unite]].filter(Boolean).join(" ");
  }
  return [g.val,g.pkg].filter(Boolean).join(" ");
}
async function vbAppel(nom,args){
  const r=await fetch("/api/tool",{method:"POST",
    headers:Object.assign({"Content-Type":"application/json",Accept:"application/json"},ENTETE_WEB),
    body:JSON.stringify({name:nom,arguments:args||{}})});
  if(!r.ok){
    let d="";try{const j=await r.json();d=j&&(j.detail||j.message)||"";}catch(_){}
    throw new Error("HTTP "+r.status+(d?" — "+d:""));
  }
  const j=await r.json();
  return j?j.data:null;
}
/* Une ligne : la pièce du code LCSC, et des candidats quand elle ne va pas. */
async function vbVerifierLigne(g,nbCartes){
  const besoin=g.refs.length*nbCartes, out={g,besoin,part:null,statut:"bloque",notes:[],candidats:[]};
  if(g.lcsc){
    let part=null;
    try{part=await vbAppel("jlc_get_part",{lcsc:g.lcsc});}catch(e){out.notes.push("JLCPCB injoignable : "+e.message);return out;}
    if(!part||!(part.model||part.lcsc))out.notes.push("code "+g.lcsc+" inconnu chez JLCPCB");
    else{out.part=part;Object.assign(out,vbJuger(g,part,besoin));}
  }else out.notes.push("pas de code LCSC");
  if(out.statut==="ok")return out;
  try{
    const r=await vbAppel("jlc_search",{query:vbRequete(g),limit:20});
    const liste=(r&&r.results)||(Array.isArray(r)?r:[]);
    out.candidats=liste.filter(p=>p&&p.lcsc&&p.lcsc!==g.lcsc)
      .map(p=>Object.assign({p},vbJuger(g,p,besoin))).filter(c=>c.statut!=="bloque")
      .sort((a,b)=>(a.statut==="ok"?0:1)-(b.statut==="ok"?0:1)
        ||(VB_LIB[String(a.p.library_type||"").toLowerCase()]??3)-(VB_LIB[String(b.p.library_type||"").toLowerCase()]??3)
        ||(+a.p.price||0)-(+b.p.price||0))
      .slice(0,3);
  }catch(e){out.notes.push("recherche impossible : "+e.message);}
  return out;
}
async function vbVerifier(nbCartes,suivi){
  const lignes=jlcBomLignes(), res=[];
  for(let i=0;i<lignes.length;i++){
    if(suivi)suivi(i,lignes.length);
    res.push(await vbVerifierLigne(lignes[i],nbCartes));
  }
  return res;
}
/* Les codes retenus : sur la carte (ils partent dans la BOM JLCPCB), et au
   schéma ouvert à côté, qui les prend en une étape d'historique. */
function vbAppliquer(choix,fini){
  const codes={};
  for(const [refs,lcsc] of choix)for(const r of refs)codes[r]=lcsc;
  if(!Object.keys(codes).length)return 0;
  push();
  let n=0;
  for(const fp of S.fps)if(codes[fp.ref]){fp.lcsc=codes[fp.ref];n++;}
  touch();
  if(typeof sessMontrerAilleurs==="function")
    sessMontrerAilleurs("schema","lcsc",JSON.stringify(codes),e=>{if(fini)fini(e,n);});
  else if(fini)fini("indisponible",n);
  return n;
}
function vbFenetre(){
  if(typeof document==="undefined")return;
  if(!S.fps.length){alert("Pas de composant sur la carte.");return;}
  const m=document.createElement("div");
  m.className="modal";
  m.innerHTML='<div class="box" style="max-width:920px;width:96vw">'+
    '<h3>🔎 Vérif BOM JLCPCB</h3>'+
    '<p style="color:var(--txt-dim);font-size:12.5px;margin:6px 0 10px">Chaque ligne de la BOM JLCPCB est comparée à la base JLCPCB : '+
    'stock, valeur, tension, boîtier. Points de test, mires et trous de fixation ne sont pas posés et sortent de la BOM et du CPL.</p>'+
    '<div style="display:flex;align-items:center;gap:8px;font-size:12.5px">Nombre de cartes '+
    '<input type="number" id="vbN" min="1" value="5" style="width:70px"> '+
    '<button class="tb on" id="vbGo">Vérifier</button><span id="vbEtat" style="color:var(--txt-dim)"></span></div>'+
    '<div id="vbRes" style="max-height:60vh;overflow:auto;margin-top:10px"></div>'+
    '<div style="display:flex;justify-content:flex-end;gap:8px;margin-top:12px">'+
    '<button class="tb" id="vbFermer">Fermer</button>'+
    '<button class="tb" id="vbAppl" disabled>Appliquer les codes choisis</button>'+
    '<button class="tb" id="vbExp">PCBA JLCPCB .zip</button></div></div>';
  document.body.appendChild(m);
  const $m=id=>m.querySelector("#"+id), close=()=>m.remove();
  m.onclick=e=>{if(e.target===m)close();};
  $m("vbFermer").onclick=close;
  $m("vbExp").onclick=()=>{close();exportJlcpcb();};
  let res=[];
  const couleur={ok:"var(--green,#3a3)",revoir:"var(--orange,#d80)",bloque:"var(--red,#d33)"};
  const libelle={ok:"OK",revoir:"À revoir",bloque:"Bloquant"};
  const rendre=()=>{
    const nb={ok:0,revoir:0,bloque:0};res.forEach(r=>nb[r.statut]++);
    $m("vbEtat").textContent=nb.ok+" OK, "+nb.revoir+" à revoir, "+nb.bloque+" bloquante(s).";
    $m("vbRes").innerHTML='<table style="width:100%;border-collapse:collapse;font-size:12px">'+
      '<tr style="text-align:left"><th>Repères</th><th>Valeur</th><th>Boîtier</th><th>Pièce JLCPCB</th><th>Stock</th><th>État</th></tr>'+
      res.map((r,i)=>{
        const p=r.part;
        const cand=r.candidats.map((c,k)=>'<label style="display:block;cursor:pointer">'+
          '<input type="radio" name="vb'+i+'" value="'+esc(c.p.lcsc)+'"'+(k===0&&!r.g.lcsc?" checked":"")+'> '+
          esc(c.p.lcsc)+' — '+esc(c.p.model||"")+' · '+esc(c.p.package||"")+' · stock '+esc(c.p.stock)+
          ' · '+esc(c.p.library_type||"")+(c.notes.length?' <span style="color:var(--txt-dim)">('+esc(c.notes.join(", "))+')</span>':"")+'</label>').join("");
        return '<tr style="border-top:1px solid var(--line,#444);vertical-align:top">'+
          '<td>'+esc(r.g.refs.join(", "))+'</td><td>'+esc(r.g.val)+'</td><td>'+esc(r.g.pkg)+'</td>'+
          '<td>'+(p?esc(r.g.lcsc)+' — '+esc(p.model||"")+'<br><span style="color:var(--txt-dim)">'+esc(p.description||"")+'</span>':esc(r.g.lcsc||"—"))+
          (cand?'<div style="margin-top:4px">'+(r.g.lcsc?'<label style="display:block"><input type="radio" name="vb'+i+'" value="" checked> garder '+esc(r.g.lcsc)+'</label>':"")+cand+'</div>':"")+'</td>'+
          '<td>'+(p?esc(p.stock)+" / "+r.besoin:"")+'</td>'+
          '<td style="color:'+couleur[r.statut]+'"><b>'+libelle[r.statut]+'</b>'+(r.notes.length?'<br>'+esc(r.notes.join(" ; ")):"")+'</td></tr>';
      }).join("")+'</table>';
    $m("vbAppl").disabled=!res.some(r=>r.candidats.length);
  };
  $m("vbGo").onclick=async()=>{
    const n=Math.max(1,Math.floor(+$m("vbN").value||1));
    $m("vbGo").disabled=true;
    try{res=await vbVerifier(n,(i,t)=>{$m("vbEtat").textContent="Ligne "+(i+1)+" / "+t+"…";});rendre();}
    catch(e){$m("vbEtat").textContent="Échec : "+e.message;}
    $m("vbGo").disabled=false;
  };
  $m("vbAppl").onclick=()=>{
    const choix=[];
    res.forEach((r,i)=>{
      const c=m.querySelector('input[name="vb'+i+'"]:checked');
      if(c&&c.value)choix.push([r.g.refs,c.value]);
    });
    const n=vbAppliquer(choix,(etat,n)=>hint(n+" repère(s) reçoivent leur code LCSC sur la carte"+
      (etat==="vu"?" et dans le schéma ouvert (à enregistrer).":
       " — schéma pas ouvert dans un autre onglet : le code reste sur la carte, recopiez-le au schéma.")));
    if(!n){alert("Aucun code choisi.");return;}
    refreshPanels();draw();
    $m("vbGo").onclick();
  };
}
