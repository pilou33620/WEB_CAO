/* =============================================================================
   bancs-mesure/crosstalk/exporter-docs-sim.js
   Les documents que l'onglet Crosstalk envoie au serveur, un par cas, rangés
   dans docs-sim/ pour que le banc Python tourne sans navigateur.

       node bancs-mesure/crosstalk/exporter-docs-sim.js [carte-PCB.json]

   POURQUOI PASSER PAR LA PAGE. Ce que le serveur reçoit n'est pas la carte :
   c'est ce que la page en a lu — le parcours de l'agresseur, ses voisines, les
   vias de couture, les FENTES du plan sondées dans le cuivre rempli, les
   gardes. Ces lectures demandent le rendu des zones (canevas), que le DOM
   simulé des bancs d'essai n'a pas. On ouvre donc l'éditeur dans Chromium
   (Playwright), on sélectionne l'agresseur de chaque cas comme on le ferait à
   la souris, et on garde le document tel que « Analyser la piste »
   l'enverrait. À refaire seulement quand la carte change.

   Il faut Playwright (npm i -g playwright) et le monofichier à jour
   (python3 editeur-pcb/outils/build-monofichier.py).
   ============================================================================= */
"use strict";
const fs=require("fs");
const path=require("path");
const {execSync}=require("child_process");

let playwright;
try{playwright=require("playwright");}
catch(e){playwright=require(path.join(execSync("npm root -g").toString().trim(),"playwright"));}

const RACINE=path.join(__dirname,"..","..");
const carte=process.argv[2]||path.join(__dirname,"sortie","banc-crosstalk-PCB.json");
const sortie=path.join(__dirname,"docs-sim");
const CAS=[0,1,2,3,4];

(async()=>{
  const b=await playwright.chromium.launch();
  const p=await b.newPage();
  p.on("pageerror",e=>console.log("erreur de la page : "+e.message));
  await p.goto("file://"+path.join(RACINE,"editeur-pcb","dist","editeur-pcb.html"));
  await p.waitForTimeout(1500);
  const doc=fs.readFileSync(carte,"utf8");
  fs.mkdirSync(sortie,{recursive:true});
  for(const n of CAS){
    const d=await p.evaluate(([texte,n])=>{
      loadDoc(JSON.parse(texte));
      clearSel();
      for(const t of S.tracks)if(t.net==="XT"+n+"_A")S.sel.tracks.add(t);
      const pr=simXtProbleme();
      return pr?pr.doc:{erreur:SIM_XT.err};
    },[doc,n]);
    if(d.erreur){console.error("cas "+n+" : "+d.erreur);process.exitCode=1;continue;}
    const f=path.join(sortie,"cas"+n+".json");
    fs.writeFileSync(f,JSON.stringify(d));
    console.log("cas "+n+" : "+f+" ("+(d.fentes||[]).length+" fente(s) vue(s) sous le parcours)");
  }
  await b.close();
})();
