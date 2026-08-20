/* =============================================================================
   editeur-schematique — 13-fichiers.js
   Export : JSON, PNG, netlist, nomenclature CSV
   ============================================================================= */
"use strict";
/* ==========================================================================
   Fichiers
   ========================================================================== */
function saveJson(){
  storeCurrent();
  const doc={format:"schemedit-2",pages:S.pages,page:S.page};
  const blob=new Blob([JSON.stringify(doc,null,1)],{type:"application/json"});
  dl(blob,"schema.json");
  S.dirty=false;            // le travail est sur disque : plus d'alerte à la fermeture
  clearBackup();
  document.getElementById("fHint").textContent="Document enregistré dans schema.json.";
}
function dl(blob,name){
  const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=name;a.click();
  setTimeout(()=>URL.revokeObjectURL(a.href),2000);
}
function exportPng(){
  let x1=1e9,y1=1e9,x2=-1e9,y2=-1e9;
  for(const el of S.comps){const b=bbox(el);x1=Math.min(x1,b.x1);y1=Math.min(y1,b.y1);x2=Math.max(x2,b.x2);y2=Math.max(y2,b.y2);}
  for(const w of S.wires){x1=Math.min(x1,w.x1,w.x2);y1=Math.min(y1,w.y1,w.y2);x2=Math.max(x2,w.x1,w.x2);y2=Math.max(y2,w.y1,w.y2);}
  if(x1>x2){alert("Feuille vide : rien à exporter.");return;}
  const pad=50, sc=2, W=(x2-x1+pad*2)*sc, H=(y2-y1+pad*2)*sc;
  const o=document.createElement("canvas");o.width=W;o.height=H;
  const c=o.getContext("2d");
  c.fillStyle=C_BG;c.fillRect(0,0,W,H);
  c.setTransform(sc,0,0,sc,-(x1-pad)*sc,-(y1-pad)*sc);
  drawWires(c);
  drawJunctions(c);
  for(const el of S.comps) drawComp(c,el,false);
  drawNetLabels(c,true);          // le zoom écran ne doit pas décider de l'export
  o.toBlob(b=>{
    if(!b){alert("Export impossible : image trop grande pour le navigateur.");return;}
    dl(b,"schema.png");
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
  draw();
}
function cycleNetLabels(){setNetLabels(S.netLabels+1);}

function padr(s,n){s=String(s);return s+" ".repeat(Math.max(1,n-s.length));}
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
    for(const r of rows)
      out.push("    "+padr(r.ref,8)+padr(r.value,18)+padr(r.pkg||"—",18)+
        (S.pages.length>1?"f"+r.page:""));
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
  dl(new Blob([txt],{type:"text/plain;charset=utf-8"}),"netlist.txt");
  document.getElementById("fHint").textContent="Netlist exportée dans netlist.txt.";
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
    for(const c of src) if(!defOf(c.type).noRef)
      rows.push({
          ref:c.ref||"", type:defOf(c.type).n, value:c.value||"", pkg:c.pkg||"", 
          page:i+1, csvMpn: c.csvMpn||"", csvPartName: c.csvPartName||""
      });
  });
  rows.sort((a,b)=>(a.page-b.page)||
    String(a.ref).localeCompare(String(b.ref),"fr",{numeric:true}));
  return rows;
}
/* Corps du CSV, sans marque d'ordre ni écriture disque : testable tel quel. */
function bomCsvText(){
  const rows=bomRows();
  if(!rows.length)return "";
  const out=["Repère;Composant;Valeur;Boîtier;Part Number;Feuille"];
  for(const r of rows)
    out.push([r.ref,r.type,r.value,r.pkg,r.csvMpn||r.csvPartName,r.page].map(csvCell).join(";"));
  // récapitulatif : quantités par référence de commande
  const groups=new Map();
  for(const r of rows){
    const k=r.type+"|"+r.value+"|"+r.pkg+"|"+(r.csvMpn||r.csvPartName);
    if(!groups.has(k))groups.set(k,{...r,refs:[]});
    groups.get(k).refs.push(r.ref);
  }
  out.push("","Qté;Composant;Valeur;Boîtier;Part Number;Repères");
  for(const g of [...groups.values()].sort((a,b)=>b.refs.length-a.refs.length))
    out.push([g.refs.length,g.type,g.value,g.pkg,g.csvMpn||g.csvPartName,g.refs.join(" ")].map(csvCell).join(";"));
  return out.join("\r\n");
}
function exportBomCsv(){
  const txt=bomCsvText();
  if(!txt){alert("Document vide : rien à exporter.");return;}
  // marque d'ordre UTF-8 + point-virgule : Excel ouvre alors proprement
  dl(new Blob(["\ufeff"+txt],{type:"text/csv;charset=utf-8"}),"nomenclature.csv");
  document.getElementById("fHint").textContent=
    bomRows().length+" composant(s) exporté(s) dans nomenclature.csv.";
}
