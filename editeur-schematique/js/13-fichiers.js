/* =============================================================================
   editeur-schematique — 13-fichiers.js
   Export : JSON, PNG, netlist, nomenclature CSV
   ============================================================================= */
"use strict";
/* ==========================================================================
   Fichiers
   ========================================================================== */
/* Nom d'un fichier exporté. Avec un projet ouvert, « carte PIR » donne
   « carte PIR-SCH.json », « carte PIR-SCH-netlist.txt ». Sans projet, on rend
   `repli` — exactement le nom d'avant, pour ne rien changer à l'habitude de
   ceux qui n'en nomment pas.
   Le nom du projet vient de commun/projet.js ; hors navigateur (banc d'essai)
   la fonction n'existe pas, d'où le garde-fou. */
function schFile(suffixe, repli){
  try{
    if(typeof projDoc==="function"){
      const n=projDoc("schema","");
      if(n)return n+suffixe;
    }
  }catch(_){}
  return repli;
}
/* Avec un dossier de projet rattaché, enregistrer écrit dans ce dossier ; sans
   dossier, on télécharge comme avant — en double-clic sur le monofichier,
   aucun accès disque n'est possible. */
function saveJson(){
  storeCurrent();
  const doc={format:"schemedit-2",pages:S.pages,page:S.page};
  if(typeof projdLie==="function" && projdLie()){
    projdDocEcrire("schema",doc).then(function(nom){
      S.dirty=false;
      clearBackup();
      if(typeof profNoterDocument==="function")profNoterDocument("schema",nom);
      document.getElementById("fHint").textContent=
        "Document enregistré dans le dossier du projet ("+nom+").";
    }).catch(function(e){
      /* Rien n'est sauvé : on le dit, puis on retombe sur le téléchargement. */
      document.getElementById("fHint").textContent=
        "Écriture refusée : "+e.message+" — enregistrement en téléchargement.";
      saveJsonTelecharger(doc);
    });
    return;
  }
  saveJsonTelecharger(doc);
}
function saveJsonTelecharger(doc){
  const blob=new Blob([JSON.stringify(doc,null,1)],{type:"application/json"});
  const nom=schFile(".json","schema.json");
  dl(blob,nom);
  S.dirty=false;            // le travail est sur disque : plus d'alerte à la fermeture
  clearBackup();
  if(typeof profNoterDocument==="function")profNoterDocument("schema",nom);
  document.getElementById("fHint").textContent="Document enregistré dans "+nom+".";
}
function dl(blob,name){
  const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=name;a.click();
  setTimeout(()=>URL.revokeObjectURL(a.href),2000);
}
function exportPng(){
  let x1=1e9,y1=1e9,x2=-1e9,y2=-1e9;
  for(const el of S.comps){const b=bbox(el);x1=Math.min(x1,b.x1);y1=Math.min(y1,b.y1);x2=Math.max(x2,b.x2);y2=Math.max(y2,b.y2);}
  for(const w of S.wires){x1=Math.min(x1,w.x1,w.x2);y1=Math.min(y1,w.y1,w.y2);x2=Math.max(x2,w.x1,w.x2);y2=Math.max(y2,w.y1,w.y2);}
  for(const d of (S.drawings||[])){x1=Math.min(x1,d.x1,d.x2);y1=Math.min(y1,d.y1,d.y2);x2=Math.max(x2,d.x1,d.x2);y2=Math.max(y2,d.y1,d.y2);}
  if(S.page===0 && typeof sheetBlocks==="function"){
    for(const sb of sheetBlocks()){
      x1=Math.min(x1,sb.x);y1=Math.min(y1,sb.y);x2=Math.max(x2,sb.x+sb.w);y2=Math.max(y2,sb.y+sb.h);
    }
  }
  if(x1>x2){alert("Feuille vide : rien à exporter.");return;}
  const pad=50, sc=2, W=(x2-x1+pad*2)*sc, H=(y2-y1+pad*2)*sc;
  const o=document.createElement("canvas");o.width=W;o.height=H;
  const c=o.getContext("2d");
  c.fillStyle=C_BG;c.fillRect(0,0,W,H);
  c.setTransform(sc,0,0,sc,-(x1-pad)*sc,-(y1-pad)*sc);
  drawDrawings(c);
  if(typeof drawSheetBlocks==="function")drawSheetBlocks(c);
  drawWires(c);
  drawJunctions(c);
  for(const el of S.comps) drawComp(c,el,false);
  drawNetLabels(c,true);          // le zoom écran ne doit pas décider de l'export
  o.toBlob(b=>{
    if(!b){alert("Export impossible : image trop grande pour le navigateur.");return;}
    dl(b,schFile(".png","schema.png"));
  });
}

/* ==========================================================================
   Étiquettes de net + netlist
   ========================================================================== */
function setNetLabels(v){
  S.netLabels=((v%3)+3)%3;
  const b=document.getElementById("bNets");
  b.classList.toggle("on",S.netLabels>0);
  b.innerHTML="Nets : "+["aucun","nommés","tous"][S.netLabels]+' <kbd>N</kbd>';
  if(typeof profilNoter==="function")profilNoter();
  draw();
}
function cycleNetLabels(){setNetLabels(S.netLabels+1);}

function padr(s,n){s=String(s);return s+" ".repeat(Math.max(1,n-s.length));}
/* Colonne de la section « Composants ». Deux espaces au moins entre les
   champs, et un tiret pour un champ vide : c'est ce qui permet à l'éditeur de
   PCB de retrouver le boîtier — troisième colonne — même sans valeur, et donc
   de poser la bonne empreinte. Les espaces internes sont réduits pour que le
   séparateur reste reconnaissable dans une valeur en deux mots. */
function nlCol(v,n){
  const t=String(v==null?"":v).replace(/\s+/g," ").trim()||"—";
  return t+" ".repeat(Math.max(2,n-t.length));
}
function byRef(a,b){return String(a.ref).localeCompare(String(b.ref),"fr",{numeric:true})||a.pin-b.pin;}
/* Netlist lisible, une section par feuille. Les nets portant le même nom sur
   plusieurs feuilles sont signalés : ils forment un net global. */
/* Le texte est produit par netlistText(), sans effet de bord : c'est ce que le
   banc d'essai vérifie. exportNetlist() se contente de l'envoyer au disque.
   `horodatage` est injectable pour que la comparaison soit reproductible. */
function netlistText(horodatage){
  storeCurrent();
  const D=docNets();
  const out=["* Netlist — Éditeur schématique",
             "* "+(horodatage||new Date().toLocaleString("fr-FR")),
             "* "+S.pages.length+" feuille(s) · "+D.groups.length+" net(s)",""];
  const rows=bomRows();
  if(rows.length){
    out.push("=== Composants ===");
    /* ligne de titre en commentaire : le tiret d'un champ vide se lit alors
       sans deviner, et l'éditeur de PCB saute les lignes en « ; » */
    out.push(("  ; "+nlCol("repère",8)+nlCol("valeur",18)+nlCol("boîtier",18)+
      (S.pages.length>1?"feuille":"")).replace(/\s+$/,""));
    for(const r of rows)
      out.push(("    "+nlCol(r.ref,8)+nlCol(r.value,18)+nlCol(r.pkg,18)+
        (S.pages.length>1?"f"+r.page:"")).replace(/\s+$/,""));
    out.push("");
  }
  const globals=D.groups.filter(g=>g.global);
  const multi=S.pages.length>1;
  if(globals.length){
    out.push("=== Nets globaux (masses, alimentations, étiquettes globales) ===");
    for(const g of globals){
      out.push("");
      out.push('NET "'+g.name+'"   ; '+(g.pages.length>1?"feuilles ":"feuille ")+
        g.pages.map(i=>i+1).join(", ")+(g.conflict?"   ; conflit de noms":""));
      const nodes=g.nodes.slice().sort(byRef);
      if(!nodes.length)out.push("    ; aucun composant raccordé");
      for(const nd of nodes)
        out.push("    "+padr(nd.ref+"."+nd.pin,12)+
          (multi?padr("(f"+(nd.page+1)+")",7):"")+(nd.label||""));
    }
    out.push("");
  }
  for(const sh of D.sheets){
    const locals=D.groups.filter(g=>!g.global&&g.pages[0]===sh.page);
    out.push("=== Feuille "+(sh.page+1)+" — "+sh.name+" ===");
    if(!locals.length)out.push("  (aucun net local)");
    for(const g of locals){
      const n=g.members[0].net;
      out.push("");
      out.push('NET "'+g.name+'"'+
        (n.conflict?"   ; conflit de noms : "+n.names.join(" / "):"")+
        (n.named?"":"   ; nom attribué automatiquement"));
      const nodes=g.nodes.slice().sort(byRef);
      if(!nodes.length)out.push("    ; aucun composant raccordé");
      for(const nd of nodes)
        out.push("    "+padr(nd.ref+"."+nd.pin,12)+(nd.label||""));
    }
    const loose=[];
    for(const n of sh.nets.loose) for(const nd of n.nodes) loose.push(nd);
    if(loose.length){
      out.push("");
      out.push("; broches en l'air : "+loose.sort(byRef).map(n=>n.ref+"."+n.pin).join(" "));
    }
    out.push("");
  }
  return out.join("\n");
}
function exportNetlist(){
  const txt=netlistText();
  const nom=schFile("-netlist.txt","netlist.txt");
  dl(new Blob([txt],{type:"text/plain;charset=utf-8"}),nom);
  document.getElementById("fHint").textContent="Netlist exportée dans "+nom+".";
}

/* Nomenclature exploitable : une ligne par composant, plus un récapitulatif
   par (type, valeur, boîtier) — c'est ce regroupement qui sert à commander. */
function csvCell(v){
  const t=String(v==null?"":v);
  return /[";\n]/.test(t)?'"'+t.replace(/"/g,'""')+'"':t;
}
function bomRows(){
  const rows=[];
  storeCurrent();
  S.pages.forEach((p,i)=>{
    const src=(i===S.page)?S.comps:(p.comps||[]);
    for(const c of src) if(!defOf(c.type).noRef) {
      const sp = c.specs ? Object.entries(c.specs).map(([k,v])=>k+": "+v).join(", ") : "";
      rows.push({
          ref:c.ref||"", type:defOf(c.type).n, value:c.value||"", pkg:c.pkg||"", 
          page:i+1, csvMpn: c.csvMpn||"", csvPartName: c.csvPartName||"",
          mpn: c.mpn || c.csvMpn || c.csvPartName || "",
          manufacturer: c.manufacturer || "",
          lcsc: c.lcsc || "",
          mouser: c.mouser_part || "",
          digikey: c.digikey_part || "",
          specs: sp,
          datasheet: c.datasheet_local || c.datasheet_url || c.datasheet_web || ""
      });
    }
  });
  rows.sort((a,b)=>(a.page-b.page)||
    String(a.ref).localeCompare(String(b.ref),"fr",{numeric:true}));
  return rows;
}
/* Corps du CSV, sans marque d'ordre ni écriture disque : testable tel quel. */
function bomCsvText(){
  const rows=bomRows();
  if(!rows.length)return "";
  const out=["Repère;Composant;Valeur;Boîtier;Part Number;Fabricant;Code LCSC;Réf Mouser;Réf DigiKey;Spécifications;Datasheet;Feuille"];
  for(const r of rows)
    out.push([r.ref, r.type, r.value, r.pkg, r.mpn, r.manufacturer, r.lcsc, r.mouser, r.digikey, r.specs, r.datasheet, r.page].map(csvCell).join(";"));
  // récapitulatif : quantités par référence de commande
  const groups=new Map();
  for(const r of rows){
    const k=r.type+"|"+r.value+"|"+r.pkg+"|"+r.mpn+"|"+r.manufacturer;
    if(!groups.has(k))groups.set(k,{...r,refs:[]});
    groups.get(k).refs.push(r.ref);
  }
  out.push("","Qté;Composant;Valeur;Boîtier;Part Number;Fabricant;Code LCSC;Repères");
  for(const g of [...groups.values()].sort((a,b)=>b.refs.length-a.refs.length))
    out.push([g.refs.length, g.type, g.value, g.pkg, g.mpn, g.manufacturer, g.lcsc, g.refs.join(" ")].map(csvCell).join(";"));
  return out.join("\r\n");
}
function exportBomCsv(){
  const txt=bomCsvText();
  if(!txt){alert("Document vide : rien à exporter.");return;}
  // marque d'ordre UTF-8 + point-virgule : Excel ouvre alors proprement
  const nom=schFile("-nomenclature.csv","nomenclature.csv");
  dl(new Blob(["\ufeff"+txt],{type:"text/csv;charset=utf-8"}),nom);
  document.getElementById("fHint").textContent=
    bomRows().length+" composant(s) exporté(s) dans "+nom+".";
}
