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
   aucun accès disque n'est possible.
   Lancé par WEB_SUITE, c'est autre chose : on n'enregistre que dans un projet
   de PROJETS, jamais en téléchargement, et sans rien envoyer sur GitHub --
   c'est saveProjetGithub() qui envoie (commun/projet-disque.js).
   Rend une promesse : vrai si le document est dans le dossier du projet.
   `brouillon` : pour la sauvegarde automatique, sans netlist (elle se
   recalcule, et son heure ferait paraître neuf chaque brouillon) ni annonce
   au PCB. */
function schDocCourant(brouillon){
  storeCurrent();
  const nl=(!brouillon&&typeof netlistText==="function")?netlistText():null;
  const doc={format:"schemedit-2",pages:S.pages,page:S.page,netClasses:S.netClasses,variantes:S.variantes,symboles:S.symboles,
             cartouche:S.cartoucheInfo||{},
             contraintes:S.contraintes,netlist:nl};
  if(!brouillon&&typeof sessDiffuserSchemaModif==="function")sessDiffuserSchemaModif({netlist:nl});
  return doc;
}
function schDire(t){document.getElementById("fHint").textContent=t;}
function saveJson(){
  const doc=schDocCourant();
  if(typeof projdSuiteDispo!=="function")return saveJsonClassique(doc);
  return projdSuiteDispo().then(function(suite){
    if(!suite)return saveJsonClassique(doc);
    return projdEnregistrerLocal(function(){return saveJsonProjet(doc,false);},schDire,"le schéma");
  });
}
/* « Sauvegarder le projet » (lancé par WEB_SUITE) : le schéma est enregistré
   comme ci-dessus, puis tout le projet part sur GitHub en un seul commit. */
function saveProjetGithub(){
  const doc=schDocCourant();
  if(typeof projdSuiteDispo!=="function")return saveJsonClassique(doc);
  return projdSuiteDispo().then(function(suite){
    if(!suite)return saveJsonClassique(doc);
    return projdEnregistrerGithub(function(){return saveJsonProjet(doc,false);},
      function(){const p=(typeof projNom==="function"&&projNom())||"";
        return "Projet "+(p?p+" ":"")+new Date().toLocaleString("fr-FR");},
      schDire,"le schéma");
  });
}
/* « Exporter vers le PCB » : pour une retouche de dernière minute, sans
   passer par la netlist .txt ni par GitHub.
     1. le schéma est écrit dans le dossier du projet, en local ;
     2. une demande d'export est déposée dans la session de l'onglet ;
     3. l'éditeur PCB s'ouvre dans cet onglet, applique la netlist à la carte
        du projet (empreintes nouvelles, boîtiers changés, valeurs, nets ; le
        placement et le routage restent) et l'écrit à son tour en local
        (editeur-pcb/js/23-eco-sync.js, pcbExportDepuisSchema).
   Rien ne part sur GitHub : c'est « Sauvegarder le projet » qui envoie.
   Sans projet (hors WEB_SUITE), la carte de l'onglet est mise à jour sans être
   écrite : on l'enregistre ensuite comme d'habitude. */
const SCH_EXPORT_PCB="cao.export.pcb.v1";
function exporterVersPcb(){
  if(typeof sessAller!=="function"||(typeof sessAutonome==="function"&&sessAutonome())){
    alert("Version un seul fichier : l'éditeur PCB n'est pas à côté.\n\n"+
          "Exportez la netlist (Fichier → Netlist .txt) et importez-la dans l'éditeur PCB.");
    return Promise.resolve(false);
  }
  const doc=schDocCourant();
  const ecrire=(typeof projdSuiteDispo==="function")?projdSuiteDispo().then(function(suite){
    if(suite)return projdEnregistrerLocal(function(){return saveJsonProjet(doc,false);},schDire,"le schéma",true);
    if(typeof projdLie==="function"&&projdLie())return saveJsonProjet(doc,false);
    return null;             // pas de projet : la carte de l'onglet suivra seule
  }):Promise.resolve(null);
  return ecrire.then(function(r){
    if(r===false)return false;   // rien d'écrit : on reste, la raison est affichée
    try{
      window.sessionStorage.setItem(SCH_EXPORT_PCB,JSON.stringify({
        t:Date.now(),projet:(typeof projNom==="function"&&projNom())||"",ecrire:r===true}));
    }catch(_){
      alert("Export impossible : le stockage de session de ce navigateur est indisponible.");
      return false;
    }
    schDire("Export vers le PCB…");
    sessAller("pcb");
    /* départ refusé (session pleine, et l'utilisateur reste) : la demande ne
       doit pas attendre la prochaine ouverture du PCB */
    if(typeof sessQuitte==="function"&&!sessQuitte()){
      try{window.sessionStorage.removeItem(SCH_EXPORT_PCB);}catch(_){}
      return false;
    }
    return true;
  });
}
function saveJsonClassique(doc){
  if(typeof projdLie==="function" && projdLie())return saveJsonProjet(doc,true);
  saveJsonTelecharger(doc);
  if(typeof projdAvis==="function")
    projdAvis("info","Schéma téléchargé","Aucun projet ouvert : le fichier .json est téléchargé, il n'est rangé dans aucun dossier de projet.");
  return Promise.resolve(false);
}
/* Écrit dans le dossier du projet. `repli` : en cas d'échec, télécharger à la
   place (jamais en mode WEB_SUITE, où rien ne s'enregistre hors du projet). */
function saveJsonProjet(doc,repli){
  /* propre AVANT l'écriture : une modification faite pendant qu'elle part
     remet S.dirty à vrai, et le succès ne doit pas l'effacer */
  S.dirty=false;
  return projdDocEcrire("schema",doc).then(function(nom){
    if(!S.dirty&&typeof projdBrouillonEffacer==="function")projdBrouillonEffacer("schema");   // modifié pendant l'écriture : le brouillon reste
    if(typeof profNoterDocument==="function")profNoterDocument("schema",nom);
    document.getElementById("fHint").textContent=
      "Document enregistré dans le dossier du projet ("+nom+").";
    if(typeof projdAvis==="function")
      projdAvis("ok","Schéma enregistré dans le projet",nom+" · "+projdQuand(Date.now()));
    return true;
  }).catch(function(e){
    S.dirty=true;
    if(e.annule){document.getElementById("fHint").textContent=e.message; return false;}
    /* Rien n'est sauvé : on le dit, puis on retombe sur le téléchargement
       s'il est permis. */
    if(!repli){
      document.getElementById("fHint").textContent="Écriture refusée : "+e.message+" — rien n'est enregistré.";
      if(typeof projdAvis==="function")
        projdAvis("erreur","Schéma pas enregistré dans le projet",e.message+" — votre travail reste dans l'éditeur, réessayez.");
      return false;
    }
    document.getElementById("fHint").textContent=
      "Écriture refusée : "+e.message+" — enregistrement en téléchargement.";
    if(typeof projdAvis==="function")
      projdAvis("erreur","Schéma pas enregistré dans le projet",e.message+" — le fichier est téléchargé à la place.");
    saveJsonTelecharger(doc);
    return false;
  });
}
function saveJsonTelecharger(doc){
  const nl=doc.netlist||((typeof netlistText==="function")?netlistText():null);
  if(nl&&!doc.netlist)doc.netlist=nl;
  if(typeof sessDiffuserSchemaModif==="function")sessDiffuserSchemaModif({netlist:nl});
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
/* Le schéma (ou la page du cartouche) dessiné sur un canvas, sc px par unité. */
function schRendu(sc){
  const pg=schPage(), b=pg||schContenu();          // avec un cartouche : toute la page
  if(!b){alert("Feuille vide : rien à exporter.");return null;}
  const {x1,y1,x2,y2}=b;
  const pad=pg?10:50, W=(x2-x1+pad*2)*sc, H=(y2-y1+pad*2)*sc;
  const o=document.createElement("canvas");o.width=W;o.height=H;
  const c=o.getContext("2d");
  c.fillStyle=C_BG;c.fillRect(0,0,W,H);
  c.setTransform(sc,0,0,sc,-(x1-pad)*sc,-(y1-pad)*sc);
  schCartouche(c);
  drawDrawings(c);
  if(typeof drawSheetBlocks==="function")drawSheetBlocks(c);
  drawWires(c);
  drawJunctions(c);
  for(const el of S.comps) drawComp(c,el,false);
  if(typeof schVarDessiner==="function")schVarDessiner(c);   // l'image montre la variante active
  drawNetLabels(c,true);          // le zoom écran ne doit pas décider de l'export
  return o;
}
function exportPng(){
  const o=schRendu(2);if(!o)return;
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
function byRef(a,b){
  return triFr(String(a.ref),String(b.ref))||
    triFr(String(nlPad(a)),String(nlPad(b)));
}
/* Patte écrite dans la netlist : celle de l'empreinte (25-brochage.js). */
function nlPad(nd){return nd.pad==null?nd.pin:nd.pad;}
/* Une patte n'apparaît qu'une fois par net : les parties d'un AOP double
   partagent V+ et V−, chacune y apporte la même patte du boîtier. */
function nlUniques(nodes){
  const vu=new Set(), out=[];
  for(const nd of nodes){
    const k=nd.ref+"."+nlPad(nd);
    if(vu.has(k))continue;
    vu.add(k);out.push(nd);
  }
  return out;
}
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

    // Section de référence catalogue et fabricant enrichie (commentée pour compatibilité ascendante totale)
    if(rows.some(r => r.csvPartName || r.mpn || r.fpPcb)){
      out.push("=== Références Fabricants & Bibliothèque ===");
      out.push(("  ; "+nlCol("repère",8)+nlCol("part name",28)+nlCol("part number",28)+nlCol("fabricant",20)+"empreinte").replace(/\s+$/,""));
      for(const r of rows){
        if(r.csvPartName || r.mpn || r.fpPcb){
          out.push(("  ; "+nlCol(r.ref,8)+nlCol(r.csvPartName||"—",28)+nlCol(r.mpn||"—",28)+nlCol(r.manufacturer||"—",20)+String(r.fpPcb||"—").replace(/\s+/g," ")).replace(/\s+$/,""));
        }
      }
      out.push("");
    }
  }
  /* ce que le contrôle du brochage trouve à redire, en commentaire : le PCB
     saute ces lignes, celui qui lit le fichier les voit avant de router */
  const ctl=(typeof brControles==="function")?brControles():[];
  if(ctl.length){
    out.push("=== Contrôle du brochage ===");
    for(const c of ctl)
      out.push("  ; "+(c.niveau==="erreur"?"ERREUR ":"alerte ")+c.ref+" : "+c.texte);
    out.push("");
  }
  const relies=new Set();
  for(const g of D.groups)for(const nd of g.nodes)relies.add(nd.ref+"."+nlPad(nd));
  const globals=D.groups.filter(g=>g.global&&!g.isBus&&!g.members[0].net.isBus);
  const multi=S.pages.length>1;
  /* Le PCB fusionne les sections NET de même nom : les noms automatiques
     (N$1…) repartent à 1 sur chaque feuille, et une étiquette locale peut
     porter le nom d'une autre feuille. Un nom écrit plus d'une fois prend
     donc le numéro de sa feuille, sinon deux nets distincts deviennent un
     court-circuit sur la carte. Les « " » coupaient le nom à la lecture. */
  const nlNom=n=>String(n==null?"":n).replace(/"/g,"_");
  const occurrences=new Map();
  for(const g of D.groups){
    if(g.isBus||g.members[0].net.isBus)continue;
    const k=nlNom(g.name);
    occurrences.set(k,(occurrences.get(k)||0)+1);
  }
  const nomLocal=g=>{
    const k=nlNom(g.name);
    return occurrences.get(k)>1?k+"_f"+(g.pages[0]+1):k;
  };
  if(globals.length){
    out.push("=== Nets globaux (masses, alimentations, étiquettes globales) ===");
    for(const g of globals){
      out.push("");
      out.push('NET "'+nlNom(g.name)+'"   ; '+(g.pages.length>1?"feuilles ":"feuille ")+
        g.pages.map(i=>i+1).join(", ")+(g.conflict?"   ; conflit de noms":""));
      const nodes=nlUniques(g.nodes.slice().sort(byRef));
      if(!nodes.length)out.push("    ; aucun composant raccordé");
      for(const nd of nodes)
        out.push("    "+padr(nd.ref+"."+nlPad(nd),12)+
          (multi?padr("(f"+(nd.page+1)+")",7):"")+(nd.label||""));
    }
    out.push("");
  }
  for(const sh of D.sheets){
    const locals=D.groups.filter(g=>!g.global&&g.pages[0]===sh.page&&!g.isBus&&!g.members[0].net.isBus);
    out.push("=== Feuille "+(sh.page+1)+" — "+sh.name+" ===");
    if(!locals.length)out.push("  (aucun net local)");
    for(const g of locals){
      const n=g.members[0].net;
      out.push("");
      out.push('NET "'+nomLocal(g)+'"'+
        (n.conflict?"   ; conflit de noms : "+n.names.join(" / "):"")+
        (n.named?"":"   ; nom attribué automatiquement"));
      const nodes=nlUniques(g.nodes.slice().sort(byRef));
      if(!nodes.length)out.push("    ; aucun composant raccordé");
      for(const nd of nodes)
        out.push("    "+padr(nd.ref+"."+nlPad(nd),12)+(nd.label||""));
    }
    /* une patte partagée (alimentation d'un AOP double) câblée sur une
       partie n'est pas en l'air parce que l'autre partie la laisse libre */
    const loose=[];
    for(const n of sh.nets.loose) for(const nd of n.nodes)
      if(!relies.has(nd.ref+"."+nlPad(nd)))loose.push(nd);
    if(loose.length){
      out.push("");
      out.push("; broches en l'air : "+nlUniques(loose.sort(byRef)).map(n=>n.ref+"."+nlPad(n)).join(" "));
    }
    out.push("");
  }
  return out.join("\n");
}
function exportNetlist(){
  const txt=netlistText();
  if(typeof sessDiffuserSchemaModif==="function")sessDiffuserSchemaModif({netlist:txt});
  const nom=schFile("-netlist.txt","netlist.txt");
  dl(new Blob([txt],{type:"text/plain;charset=utf-8"}),nom);
  const ctl=(typeof brControles==="function")?brControles():[];
  const err=ctl.filter(c=>c.niveau==="erreur").length;
  document.getElementById("fHint").textContent="Netlist exportée dans "+nom+"."+
    (ctl.length?" ⚠ "+ctl.length+" remarque(s) de brochage"+(err?" dont "+err+" erreur(s)":"")+
      " : "+ctl[0].ref+" — "+ctl[0].texte:"");
}

/* Nomenclature exploitable : une ligne par composant, plus un récapitulatif
   par (type, valeur, boîtier) — c'est ce regroupement qui sert à commander. */
function csvCell(v){
  let t=String(v==null?"":v);
  // un tableur lit « =… », « +… », « @… » comme une formule : la valeur vient du projet, pas d'un calcul
  if(/^[=+@\t\r]|^-(?![\d.])/.test(t))t="'"+t;
  return /[";\n]/.test(t)?'"'+t.replace(/"/g,'""')+'"':t;
}
/* `variante` : l'identifiant d'une variante de montage (commun/variantes.js),
   la variante active si absent, "" pour la carte complète. Chaque ligne dit
   alors si le composant est posé (`monte`). */
function bomRows(variante){
  const vid=variante===undefined?((S.variantes&&S.variantes.active)||""):variante;
  const rows=[];
  storeCurrent();
  const lib = (typeof window !== "undefined" && Array.isArray(window.CSV_LIB)) ? window.CSV_LIB : [];
  /* U3A et U3B sont un seul boîtier : une ligne, une empreinte */
  const boitiers=new Set();
  S.pages.forEach((p,i)=>{
    const src=(i===S.page)?S.comps:(p.comps||[]);
    for(const c of src) if(!defOf(c.type).noRef) {
      if(c.ref&&c.part&&typeof brLu==="function"&&brochageParties(brLu(c)).length){
        if(boitiers.has(c.ref))continue;
        boitiers.add(c.ref);
      }
      // Résolution automatique dans LIB_composants.csv si disponible
      let entry = null;
      if(lib.length){
        const targetPart = (c.csvPartName || "").toLowerCase().trim();
        const targetMpn = (c.mpn || c.csvMpn || "").toLowerCase().trim();
        const targetVal = (c.value || "").toLowerCase().trim();
        const targetPkg = (c.pkg || "").toLowerCase().trim();

        if(targetPart){
          entry = lib.find(it => (it["Part Name"]||"").toLowerCase().trim() === targetPart);
        }
        if(!entry && targetMpn){
          entry = lib.find(it => {
            const p1 = (it["Part Number"]||"").toLowerCase().trim();
            const p2 = (it["manufacturer part Number"]||it["Manufacturer Part Number"]||"").toLowerCase().trim();
            return p1 === targetMpn || p2 === targetMpn;
          });
        }
        if(!entry && targetVal){
          entry = lib.find(it => (it["Part Name"]||"").toLowerCase().trim() === targetVal);
        }
        if(!entry && targetVal && targetPkg){
          entry = lib.find(it => {
            const v = (it["Value"]||"").toLowerCase().trim();
            const pk = (it["Package type"]||it["Empreinte PCB"]||"").toLowerCase().trim();
            return v === targetVal && pk.includes(targetPkg);
          });
        }
      }

      const csvPartName = c.csvPartName || (entry ? entry["Part Name"] : "") || "";
      const mpn = c.mpn || c.csvMpn || (entry ? (entry["manufacturer part Number"] || entry["Part Number"] || entry["Part Name"]) : "") || csvPartName || "";
      const manufacturer = c.manufacturer || (entry ? entry["Manufacturer"] : "") || "";
      const fpPcb = c.fpPcb || (entry ? entry["Empreinte PCB"] : "") || "";
      const pkg = c.pkg || (fpPcb ? String(fpPcb).replace(/^.*[\\\/]/, "").replace(/\.json$/i, "") : "") || (entry ? entry["Package type"] : "") || "";
      const desc = c.desc || (entry ? entry["Description"] : "") || "";
      const lcsc = c.lcsc || (entry ? (entry["Code LCSC"] || entry["vendor reference"]) : "") || "";
      const mouser = c.mouser_part || c.mouser || (entry ? (entry["Réf Mouser"] || entry["Vendor Part Number"]) : "") || "";
      const digikey = c.digikey_part || c.digikey || (entry ? entry["Réf DigiKey"] : "") || "";
      const datasheet = c.datasheet_local || c.datasheet_url || c.datasheet_web || "";

      // Spécifications consolidées
      let sp = c.specs ? Object.entries(c.specs).map(([k,v])=>k+": "+v).join(", ") : "";
      if(!sp && entry){
        const spArr = [];
        if(entry["Voltage Rating"] && entry["Voltage Rating"]!=="xx") spArr.push("Tension: "+entry["Voltage Rating"]);
        if(entry["current Rating"] && entry["current Rating"]!=="xx") spArr.push("Courant: "+entry["current Rating"]);
        if(entry["wattage"] && entry["wattage"]!=="xx") spArr.push("Puissance: "+entry["wattage"]);
        if(entry["tolerance"] && entry["tolerance"]!=="xx") spArr.push("Tolérance: "+entry["tolerance"]);
        sp = spArr.join(", ");
      }

      rows.push({
          ref:c.ref||"", type:defOf(c.type).n, value:c.value||"", pkg:pkg,
          fpPcb: fpPcb, csvPartName: csvPartName, desc: desc,
          page:i+1, csvMpn: c.csvMpn||"",
          mpn: mpn,
          manufacturer: manufacturer,
          lcsc: lcsc,
          mouser: mouser,
          digikey: digikey,
          specs: sp,
          datasheet: datasheet,
          monte: varEstMonte(c, vid),
          // pour la nomenclature Excel : la feuille fait la colonne PART, la LIB le reste
          feuille: p.name||"",
          lib: entry
      });
    }
  });
  rows.sort((a,b)=>(a.page-b.page)||
    triFr(String(a.ref),String(b.ref)));
  return rows;
}
/* Corps du CSV, sans marque d'ordre ni écriture disque : testable tel quel.
   Avec une variante de montage, chaque composant dit s'il est monté, le
   récapitulatif ne compte que les composants posés (c'est ce qu'on commande)
   et les non-montés (DNP) sont listés à part, en fin de fichier. */
function bomCsvText(variante){
  const vid=variante===undefined?((S.variantes&&S.variantes.active)||""):variante;
  const rows=bomRows(vid);
  if(!rows.length)return "";
  const out=["Repère;Composant;Valeur;Boîtier;Empreinte PCB;Réf Bibliothèque;Part Number;Fabricant;Code LCSC;Réf Mouser;Réf DigiKey;Spécifications;Datasheet;Feuille;Montage"];
  for(const r of rows)
    out.push([r.ref, r.type, r.value, r.pkg, r.fpPcb, r.csvPartName, r.mpn, r.manufacturer, r.lcsc, r.mouser, r.digikey, r.specs, r.datasheet, r.page,
              r.monte?"Monté":"Non monté (DNP)"].map(csvCell).join(";"));
  // récapitulatif : quantités par référence de commande, composants posés seuls
  const groups=new Map();
  for(const r of rows){
    if(!r.monte)continue;
    const k=r.type+"|"+r.value+"|"+r.pkg+"|"+r.fpPcb+"|"+r.csvPartName+"|"+r.mpn+"|"+r.manufacturer;
    if(!groups.has(k))groups.set(k,{...r,refs:[]});
    groups.get(k).refs.push(r.ref);
  }
  out.push("","Qté;Composant;Valeur;Boîtier;Empreinte PCB;Réf Bibliothèque;Part Number;Fabricant;Code LCSC;Repères");
  for(const g of [...groups.values()].sort((a,b)=>b.refs.length-a.refs.length))
    out.push([g.refs.length, g.type, g.value, g.pkg, g.fpPcb, g.csvPartName, g.mpn, g.manufacturer, g.lcsc, g.refs.join(" ")].map(csvCell).join(";"));
  const nm=rows.filter(r=>!r.monte).map(r=>String(r.ref))
    .sort((a,b)=>triFr(a,b));
  out.push("","Variante;"+csvCell(varNom(S.variantes,vid)),
           "Composants montés;"+(rows.length-nm.length),
           "Non montés (DNP);"+nm.length+(nm.length?";"+csvCell(nm.join(" ")):""));
  return out.join("\r\n");
}
/* Nom du fichier de nomenclature : la variante y figure, « -nomenclature-Lite.csv ». */
function bomCsvNom(variante){
  const sl=variante?varSlug(S.variantes,variante):"";
  const suf=sl?"-nomenclature-"+sl+".csv":"-nomenclature.csv";
  return schFile(suf,suf.slice(1));
}
function exportBomCsv(variante){
  const vid=typeof variante==="string"?variante:((S.variantes&&S.variantes.active)||"");
  const txt=bomCsvText(vid);
  if(!txt){alert("Document vide : rien à exporter.");return;}
  // marque d'ordre UTF-8 + point-virgule : Excel ouvre alors proprement
  const nom=bomCsvNom(vid);
  dl(new Blob(["\ufeff"+txt],{type:"text/csv;charset=utf-8"}),nom);
  const rows=bomRows(vid), nm=rows.filter(r=>!r.monte).length;
  document.getElementById("fHint").textContent=
    rows.length+" composant(s) exporté(s) dans "+nom+
    (vid?" — variante « "+varNom(S.variantes,vid)+" », "+nm+" non monté(s).":".");
}

/* ==========================================================================
   Nomenclature Excel (.xlsx), au format maison des BOM de carte : trois
   onglets -- Presentation, History, BOM --, une ligne par repère, la carte nue
   (CIP1) en tête, les non-montés en rouge marqués « [Not Fitted] ».
   Le classeur s'écrit en XML brut et part dans un ZIP sans compression
   (commun/zip.js), qu'Excel ouvre tel quel.
   ========================================================================== */
// texte d'une cellule : échappé, sans les caractères de contrôle que le XML refuse
function bomxXml(v){
  return esc(v).replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g,"");
}
/* Styles (index de cellXfs) :
   0 normal · 1 gras · 2 gras date · 3 en-tête BOM · 4 cellule · 5 jaune · 6 rouge
   7 légende · 8 en-tête bleu · 9 PCB orange · 10 cadre · 11-15 couleurs du
   tableau Presentation · 16 cadre fin · 17 en-tête History · 18 version
   · 19 date · 20 texte sur plusieurs lignes */
const BOMX_FILLS=["FFFF00","FF0000","99CCFF","FF9900","99CC00","CC99FF","FF9999","66FF99","3333FF"];
function bomxStyles(){
  const xf=(font,fill,bord,o)=>{
    o=o||{};
    const al=o.h||o.wrap?'<alignment'+(o.h?' horizontal="'+o.h+'"':'')+(o.wrap?' vertical="top" wrapText="1"':'')+'/>':'';
    return '<xf numFmtId="'+(o.date?14:0)+'" fontId="'+font+'" fillId="'+fill+'" borderId="'+bord+'" xfId="0"'+
      (o.date?' applyNumberFormat="1"':'')+' applyFont="1" applyFill="1" applyBorder="1"'+(al?' applyAlignment="1">'+al+'</xf>':'/>');
  };
  const bd=(g,d,h,b)=>'<border><left'+(g?' style="'+g+'"><color auto="1"/></left>':'/>')+
    '<right'+(d?' style="'+d+'"><color auto="1"/></right>':'/>')+
    '<top'+(h?' style="'+h+'"><color auto="1"/></top>':'/>')+
    '<bottom'+(b?' style="'+b+'"><color auto="1"/></bottom>':'/>')+'<diagonal/></border>';
  const xfs=[
    xf(0,0,0), xf(1,0,0,{h:"left"}), xf(1,0,0,{h:"left",date:1}), xf(1,0,2,{h:"left"}),
    xf(0,0,1), xf(0,2,1), xf(0,3,1), xf(2,0,1),
    xf(1,4,2), xf(0,5,2), xf(0,0,2),
    xf(0,6,3), xf(0,7,3), xf(0,8,3), xf(0,9,3), xf(0,10,3), xf(0,0,3),
    xf(1,4,2,{h:"center"}), xf(0,0,1,{h:"center"}), xf(0,0,1,{h:"center",date:1}), xf(0,0,1,{wrap:1})
  ];
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'+
    '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'+
    '<fonts count="3"><font><sz val="10"/><name val="Arial"/></font><font><b/><sz val="10"/><name val="Arial"/></font>'+
    '<font><sz val="9"/><name val="Arial"/></font></fonts>'+
    '<fills count="'+(BOMX_FILLS.length+2)+'"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>'+
    BOMX_FILLS.map(c=>'<fill><patternFill patternType="solid"><fgColor rgb="FF'+c+'"/><bgColor indexed="64"/></patternFill></fill>').join("")+'</fills>'+
    '<borders count="4">'+bd()+bd("thin","thin","thin","thin")+bd("medium","medium","medium","medium")+bd("medium","medium","thin","thin")+'</borders>'+
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'+
    '<cellXfs count="'+xfs.length+'">'+xfs.join("")+'</cellXfs>'+
    '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>';
}
/* Une ligne de feuille : cellules [colonne, valeur, style], dans l'ordre des
   colonnes. Valeur : texte, nombre, {f:"formule"} ou vide (cellule de style seul). */
function bomxLigne(r,cells,haut){
  return '<row r="'+r+'"'+(haut?' ht="'+haut+'" customHeight="1"':'')+'>'+cells.map(([col,v,s])=>{
    const a='<c r="'+col+r+'" s="'+(s||0)+'"';
    if(v==null||v==="")return a+'/>';
    if(typeof v==="number")return a+'><v>'+v+'</v></c>';
    if(v.f)return a+'><f>'+bomxXml(v.f)+'</f></c>';
    return a+' t="inlineStr"><is><t xml:space="preserve">'+bomxXml(v)+'</t></is></c>';
  }).join("")+'</row>';
}
function bomxFeuille(largeurs,lignes,o){
  o=o||{};
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'+
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'+
    '<sheetViews><sheetView workbookViewId="0"'+(o.actif?' tabSelected="1"':'')+'/></sheetViews>'+
    '<sheetFormatPr defaultRowHeight="12.75"/>'+
    '<cols>'+largeurs.map((w,i)=>'<col min="'+(i+1)+'" max="'+(i+1)+'" width="'+w+'" customWidth="1"/>').join("")+'</cols>'+
    '<sheetData>'+lignes.join("")+'</sheetData>'+
    (o.filtre?'<autoFilter ref="'+o.filtre+'"/>':'')+
    (o.fusions&&o.fusions.length?'<mergeCells count="'+o.fusions.length+'">'+o.fusions.map(m=>'<mergeCell ref="'+m+'"/>').join("")+'</mergeCells>':'')+
    '</worksheet>';
}
// date du jour en numéro de série Excel (jours depuis le 30/12/1899)
function bomxDateSerie(d){
  return Math.round((Date.UTC(d.getFullYear(),d.getMonth(),d.getDate())-Date.UTC(1899,11,30))/86400000);
}
/* Champ du catalogue LIB pour une colonne du modèle ; « xx » quand il manque,
   comme dans les BOM écrites à la main. */
function bomxLib(r,...cles){
  for(const k of cles){
    const v=r.lib&&r.lib[k]!=null?String(r.lib[k]).trim():"";
    if(v&&v!=="xx")return v;
  }
  return "xx";
}
// secondes sources au format « P/N_FABRICANT », séparées par des virgules ; « - » s'il n'y en a pas
function bomxSources(r){
  const out=[];
  for(const n of ["2nd","3nd","4nd"]){
    const pn=bomxLib(r,n+" source P/N");
    if(pn==="xx")continue;
    const fab=bomxLib(r,n+" source Manufacturer");
    out.push(fab==="xx"?pn:pn+"_"+fab);
  }
  return out.length?out.join(","):"-";
}
// client (Presentation!A3, à remplir dans Excel) : vide, il ne s'affiche pas « 0 » ailleurs
const BOMX_CLIENT='IF(Presentation!A3="","",Presentation!A3)';
function bomXlsxFichiers(variante){
  const vid=variante===undefined?((S.variantes&&S.variantes.active)||""):variante;
  const rows=bomRows(vid).slice().sort((a,b)=>triFr(String(a.ref),String(b.ref)));
  if(!rows.length)return null;
  const carte=(typeof projNom==="function"&&projNom())||"carte";
  const doc=carte+"BOM";
  const COLS="ABCDEFGHIJKLMN".split("");

  // Presentation : nom du document, et le tableau PCB / Board name
  const pres=[
    bomxLigne(1,[["A",{f:"History!A1"},2],["C","",1]]),
    bomxLigne(2,[["A",doc,1]]),
    bomxLigne(3,[["A",""]]),
    bomxLigne(6,[["B","PCB",8],["C","Board name",8],["D","",8],["E","",8],["F","",8]]),
    bomxLigne(7,[["B",carte,9],["C",carte+(vid?" — "+varNom(S.variantes,vid):""),10],["D","",10],["E","",10],["F","",10]])
  ];
  for(let i=0;i<5;i++)
    pres.push(bomxLigne(8+i,[["B","",11+i],["C","",16],["D","",16],["E","",16],["F","",16]]));
  const presFus=[6,7,8,9,10,11,12].map(r=>"C"+r+":F"+r);

  // History : une première version datée du jour, et la grille jusqu'à la ligne 43
  const vide=["D","E","F","G","H","I","J","K","L","M","N","O","P","Q","R","S","T","U"];
  const hist=[
    bomxLigne(1,[["A",{f:"MAX(B9:B43)"},2]]),
    bomxLigne(2,[["A",{f:"Presentation!A2"},1]]),
    bomxLigne(3,[["A",{f:BOMX_CLIENT},1]]),
    bomxLigne(8,[["A","version",17],["B","Date",17],["C","Modifications",8]].concat(vide.map(c=>[c,"",8]),[["V","who",8]]))
  ];
  const histFus=["C8:U8"];
  for(let r=9;r<=43;r++){
    const premiere=r===9;
    hist.push(bomxLigne(r,[["A",premiere?"A":"",18],["B",premiere?bomxDateSerie(new Date()):"",19],
      ["C",premiere?"Initial version : génération de la BOM "+carte:"",20]].concat(vide.map(c=>[c,"",20]),[["V","",18]])));
    histFus.push("C"+r+":U"+r);
  }

  // BOM : légende, en-tête, la carte nue, puis un repère par ligne
  const bom=[
    bomxLigne(1,[["A",{f:"Presentation!A1"},2]]),
    bomxLigne(2,[["A",{f:"Presentation!A2"},1],["H","[Not Fitted]",6],["I","NON MONTE",7],["J","",7]]),
    bomxLigne(3,[["A",{f:BOMX_CLIENT},1],["H","[New vers]",5],["I","DELTAS  version N-1",7],["J","",7]]),
    bomxLigne(10,["QUANTITY","REFERENCE","DELTA (n-1)","PART","VALUE","POWER","TOLERANCE","PPM","VOLTAGE",
      "DIELECTRIC","MANUFACTURER","1st SOURCE P/N","2nd SOURCE P/N","DESIGNATION"].map((t,i)=>[COLS[i],t,3])),
    bomxLigne(11,[1,"CIP1",""].concat([carte+"PCB"],Array(9).fill("xx"),
      ["See PCB requirement "+carte+"-PCB-MASTER-DRAWING.pdf"]).map((v,i)=>[COLS[i],v,5])),
    bomxLigne(12,COLS.map(c=>[c,"",4]))
  ];
  rows.forEach((r,i)=>{
    const s=r.monte?4:6;
    bom.push(bomxLigne(13+i,[1,r.ref,r.monte?"-":"[Not Fitted]",r.feuille||"xx",r.value||"xx",
      bomxLib(r,"wattage"),bomxLib(r,"tolerance"),bomxLib(r,"PPM"),bomxLib(r,"Voltage Rating"),
      bomxLib(r,"Dielectrique","Dielectric"),r.manufacturer||"xx",r.mpn||"xx",bomxSources(r),r.desc||"xx"]
      .map((v,j)=>[COLS[j],v,s])));
  });
  const fin=12+rows.length;

  const NS='xmlns="http://schemas.openxmlformats.org/package/2006/relationships"';
  const T='http://schemas.openxmlformats.org/officeDocument/2006/relationships/';
  const ent='<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
  const feuilles=["Presentation","History","BOM"];
  return [
    {name:"[Content_Types].xml",text:ent+'<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'+
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'+
      '<Default Extension="xml" ContentType="application/xml"/>'+
      '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'+
      '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'+
      feuilles.map((_,i)=>'<Override PartName="/xl/worksheets/sheet'+(i+1)+'.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>').join("")+
      '</Types>'},
    {name:"_rels/.rels",text:ent+'<Relationships '+NS+'><Relationship Id="rId1" Type="'+T+'officeDocument" Target="xl/workbook.xml"/></Relationships>'},
    {name:"xl/workbook.xml",text:ent+'<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="'+T.slice(0,-1)+'">'+
      '<bookViews><workbookView activeTab="2"/></bookViews><sheets>'+
      feuilles.map((n,i)=>'<sheet name="'+n+'" sheetId="'+(i+1)+'" r:id="rId'+(i+1)+'"/>').join("")+'</sheets>'+
      '<definedNames><definedName name="_xlnm._FilterDatabase" localSheetId="2" hidden="1">BOM!$A$12:$N$'+fin+'</definedName></definedNames>'+
      // les formules (dates, nom du document) sont calculées à l'ouverture
      '<calcPr fullCalcOnLoad="1"/></workbook>'},
    {name:"xl/_rels/workbook.xml.rels",text:ent+'<Relationships '+NS+'>'+
      feuilles.map((_,i)=>'<Relationship Id="rId'+(i+1)+'" Type="'+T+'worksheet" Target="worksheets/sheet'+(i+1)+'.xml"/>').join("")+
      '<Relationship Id="rId4" Type="'+T+'styles" Target="styles.xml"/></Relationships>'},
    {name:"xl/styles.xml",text:bomxStyles()},
    {name:"xl/worksheets/sheet1.xml",text:bomxFeuille([27.1,16.7,14.7,16.1,18.1,42.7],pres,{fusions:presFus})},
    {name:"xl/worksheets/sheet2.xml",text:bomxFeuille([23.6,10.6,10.6,10.6,10.6,10.6,10.6,10.6,10.6,10.6,10.6,10.6,10.6,21.9,11.4,10.6,9,11.4,10.6,10.6,51.3,10.6],hist,{fusions:histFus})},
    {name:"xl/worksheets/sheet3.xml",text:bomxFeuille([13.6,27.1,15,24.9,20.4,15.4,12.1,18.3,25.6,34.7,38,42,64.4,92.4],bom,
      {actif:true,filtre:"A12:N"+fin,fusions:["I2:J2","I3:J3"]})}
  ];
}
/* « P01x276BOM.xlsx », la variante en suffixe comme pour le CSV. */
function bomXlsxNom(variante){
  const sl=variante?varSlug(S.variantes,variante):"";
  return ((typeof projNom==="function"&&projNom())||"carte")+"BOM"+(sl?"-"+sl:"")+".xlsx";
}
function exportBomXlsx(variante){
  const vid=typeof variante==="string"?variante:((S.variantes&&S.variantes.active)||"");
  const files=bomXlsxFichiers(vid);
  if(!files){alert("Document vide : rien à exporter.");return;}
  const nom=bomXlsxNom(vid);
  dl(new Blob([zipBlob(files)],{type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"}),nom);
  document.getElementById("fHint").textContent=bomRows(vid).length+" composant(s) exporté(s) dans "+nom+".";
}
