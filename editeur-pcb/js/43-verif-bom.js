"use strict";
/* ==========================================================================
   Vérif BOM JLCPCB — avant de téléverser le dossier PCBA, chaque ligne de la
   nomenclature JLCPCB (jlcBomLignes) est confrontée à la base JLCPCB par la
   passerelle pcbparts de web_cao (/api/tool) :
     - avec un code LCSC : la pièce existe, son stock couvre le lot, sa valeur,
       sa tension et son boîtier sont ceux de la BOM (c'est l'avertissement
       « The comment … does not match » que JLCPCB donne trop tard) ;
     - pour chaque ligne, des équivalents sont proposés (jlc_find_alternatives
       sur la pièce connue, jlc_search sinon), Basic d'abord ; l'équivalent
       choisi s'écrit sur la carte (et dans le schéma s'il est ouvert dans un
       autre onglet) et part dans la BOM JLCPCB, colonne « JLCPCB Part # ».
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
    let p=m[2]?m[2].replace(/[µμ]/,"u"):"";
    if(p&&p!=="M"&&p!=="K")p=p.toLowerCase();   // « 100NF », « 2.2UF » : la fiche écrit souvent en capitales
    const k=p?VB_PREFIXE[p]:1;
    if(k!==undefined)return parseFloat(m[1])*k;
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
/* la passerelle rend la liste sous l'une de ces clés, selon l'outil */
function vbListe(r){
  if(Array.isArray(r))return r;
  for(const k of ["alternatives","results","parts"])if(r&&Array.isArray(r[k]))return r[k];
  return [];
}
const VB_NB_EQUIV=5;
/* Une ligne : la pièce du code LCSC, et ses équivalents — proposés même quand
   elle va (second choix, Basic sans frais de pose), indispensables sinon. */
async function vbVerifierLigne(g,nbCartes){
  const besoin=g.refs.length*nbCartes, out={g,besoin,part:null,statut:"bloque",notes:[],candidats:[]};
  if(g.lcsc){
    let part=null;
    try{part=await vbAppel("jlc_get_part",{lcsc:g.lcsc});}catch(e){out.notes.push("JLCPCB injoignable : "+e.message);return out;}
    if(!part||!(part.model||part.lcsc))out.notes.push("code "+g.lcsc+" inconnu chez JLCPCB");
    else{out.part=part;Object.assign(out,vbJuger(g,part,besoin));}
  }else out.notes.push("pas de code LCSC");
  const vus=new Set([g.lcsc]), cand=[];
  const prendre=r=>{
    for(const p of vbListe(r)){
      if(!p||!p.lcsc||vus.has(p.lcsc))continue;
      vus.add(p.lcsc);
      const c=Object.assign({p},vbJuger(g,p,besoin));
      if(c.statut!=="bloque")cand.push(c);
    }
  };
  // les équivalences de JLCPCB d'abord ; d'une pièce fausse (6 pF pour 6,8 µF) elles
  // sont fausses aussi et vbJuger les écarte : la recherche par valeur complète alors
  if(out.part)try{prendre(await vbAppel("jlc_find_alternatives",{lcsc:g.lcsc,same_package:true,limit:10}));}catch(_){}
  if(cand.length<3)
    try{prendre(await vbAppel("jlc_search",{query:vbRequete(g),limit:20}));}
    catch(e){if(!cand.length)out.notes.push("recherche impossible : "+e.message);}
  const lib=c=>VB_LIB[String(c.p.library_type||"").toLowerCase()]??3;
  out.candidats=cand.sort((a,b)=>(a.statut==="ok"?0:1)-(b.statut==="ok"?0:1)||lib(a)-lib(b)||(+a.p.price||0)-(+b.p.price||0))
    .slice(0,VB_NB_EQUIV);
  return out;
}
/* Quatre lignes de front : chaque ligne coûte jusqu'à trois appels à la passerelle. */
async function vbVerifier(nbCartes,suivi){
  const lignes=jlcBomLignes(), res=new Array(lignes.length);
  let i=0,faites=0;
  const ouvrier=async()=>{
    while(i<lignes.length){
      const k=i++;
      res[k]=await vbVerifierLigne(lignes[k],nbCartes);
      if(suivi)suivi(faites++,lignes.length);
    }
  };
  await Promise.all([0,1,2,3].map(ouvrier));
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
    'stock, valeur, tension, boîtier, et des équivalents sont proposés ; celui qui est coché part dans la BOM JLCPCB. Points de test, mires et trous de fixation ne sont pas posés et sortent de la BOM et du CPL.</p>'+
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
  let res=[];
  const choisis=()=>{
    const choix=[];
    res.forEach((r,i)=>{
      const c=m.querySelector('input[name="vb'+i+'"]:checked');
      if(c&&c.value)choix.push([r.g.refs,c.value]);
    });
    return choix;
  };
  const dire=(etat,n)=>hint(n+" repère(s) reçoivent leur code LCSC sur la carte"+
    (etat==="vu"?" et dans le schéma ouvert (à enregistrer).":
     " — schéma pas ouvert dans un autre onglet : le code reste sur la carte, recopiez-le au schéma."));
  // l'export prend les équivalents cochés : sans cela ils restaient dans la fenêtre et la BOM partait sans eux
  $m("vbExp").onclick=()=>{
    if(vbAppliquer(choisis(),dire)){refreshPanels();draw();}
    close();exportJlcpcb();
  };
  const couleur={ok:"var(--green,#3a3)",revoir:"var(--orange,#d80)",bloque:"var(--red,#d33)"};
  const libelle={ok:"OK",revoir:"À revoir",bloque:"Bloquant"};
  const rendre=()=>{
    const nb={ok:0,revoir:0,bloque:0};res.forEach(r=>nb[r.statut]++);
    $m("vbEtat").textContent=nb.ok+" OK, "+nb.revoir+" à revoir, "+nb.bloque+" bloquante(s).";
    $m("vbRes").innerHTML='<table style="width:100%;border-collapse:collapse;font-size:12px">'+
      '<tr style="text-align:left"><th>Repères</th><th>Valeur</th><th>Boîtier</th><th>Pièce JLCPCB</th><th>Stock</th><th>État</th></tr>'+
      res.map((r,i)=>{
        const p=r.part;
        // pré-coché : le meilleur équivalent quand la ligne n'a pas de pièce utilisable
        const pre=!!r.candidats.length&&(!r.g.lcsc||(r.statut==="bloque"&&r.candidats[0].statut==="ok"));
        const prix=c=>+c.p.price>0?' · prix '+(+c.p.price):"";
        const cand=r.candidats.map((c,k)=>'<label style="display:block;cursor:pointer">'+
          '<input type="radio" name="vb'+i+'" value="'+esc(c.p.lcsc)+'"'+(k===0&&pre?" checked":"")+'> '+
          esc(c.p.lcsc)+' — '+esc(c.p.model||"")+' · '+esc(c.p.package||"")+' · stock '+esc(c.p.stock)+
          ' · '+esc(c.p.library_type||"")+prix(c)+(c.notes.length?' <span style="color:var(--txt-dim)">('+esc(c.notes.join(", "))+')</span>':"")+'</label>').join("");
        return '<tr style="border-top:1px solid var(--line,#444);vertical-align:top">'+
          '<td>'+esc(r.g.refs.join(", "))+'</td><td>'+esc(r.g.val)+'</td><td>'+esc(r.g.pkg)+'</td>'+
          '<td>'+(p?esc(r.g.lcsc)+' — '+esc(p.model||"")+'<br><span style="color:var(--txt-dim)">'+esc(p.description||"")+'</span>':esc(r.g.lcsc||"—"))+
          (cand?'<div style="margin-top:4px"><span style="color:var(--txt-dim)">Équivalents :</span>'+(r.g.lcsc?'<label style="display:block"><input type="radio" name="vb'+i+'" value=""'+(pre?"":" checked")+'> garder '+esc(r.g.lcsc)+'</label>':"")+cand+'</div>':"")+'</td>'+
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
    const n=vbAppliquer(choisis(),dire);
    if(!n){alert("Aucun code choisi.");return;}
    refreshPanels();draw();
    $m("vbGo").onclick();
  };
}
