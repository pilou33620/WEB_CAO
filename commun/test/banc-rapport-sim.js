/* =============================================================================
   commun/test/banc-rapport-sim.js
   Le rapport de simulation (commun/simulation-rapport.js), sous Node.

   Ce qui se vérifie sans navigateur : les chiffres clés, le regroupement de la
   piste, le Markdown, et que CHAQUE analyse du panneau ait son état — une
   analyse ajoutée à SIM_ANALYSES sans entrée dans SIM_RAP_ETAT aurait un
   rapport vide sans que rien ne le dise. La recopie de la fiche lit le DOM
   rendu : elle se voit dans la page, pas ici.

     node commun/test/banc-rapport-sim.js
   ============================================================================= */
const fs=require("fs"), path=require("path");
require(path.join(__dirname,"dom-stub.js")).install({panels:{}, canvasId:"cv"});

const C=path.join(__dirname,"..");
const code=["classes-interface.js","simulation-em.js","simulation-rapport.js"]
  .map(f=>fs.readFileSync(path.join(C,f),"utf8").replace(/^"use strict";\s*$/m,""))
  .join("\n;\n");
/* Le "use strict" de chaque fichier est retiré, et ce banc n'en a pas : en
   mode strict, `eval` aurait sa propre portée. Les `const` y restent de toute
   façon — on les sort à la main, comme visionneuse-ipc2581/test/harness-sim.js. */
const EXPOSE=["SIM","SIM_ANALYSES","SIM_RAP_ETAT","SIM_RAP_KPI","SIM_RAP_GUIDE",
              "SIM_RAP_JSON_MAX","simRapJson","simOnglets",
              "simRapPiste","simRapMarkdown"];
eval(code+"\n"+EXPOSE.map(n=>"globalThis."+n+"="+n+";").join("\n"));

let ok=0, ko=0;
function T(nom,fn){
  try{fn();console.log("  ok  "+nom);ok++;}
  catch(e){console.log("  KO  "+nom+" → "+e.message);ko++;}
}
function egal(a,b,quoi){
  if(a!==b)throw new Error((quoi||"")+" : attendu "+JSON.stringify(b)+", lu "+JSON.stringify(a));
}

T("chaque analyse du panneau a son état dans le rapport",function(){
  for(const k of Object.keys(SIM_ANALYSES))
    if(!SIM_RAP_ETAT[k])throw new Error("SIM_RAP_ETAT."+k+" manque");
});

T("chaque analyse dit sa méthode, ses grandeurs, ses critères et ses limites",function(){
  for(const k of Object.keys(SIM_ANALYSES)){
    const g=SIM_RAP_GUIDE[k];
    if(!g||!g.methode||!g.grandeurs.length||!g.criteres||!g.limites)
      throw new Error("SIM_RAP_GUIDE."+k+" incomplet");
  }
});

T("les données brutes : 5 chiffres, listes de même longueur restées alignées",function(){
  const f=[], s=[];
  for(let i=0;i<1000;i++){f.push(1e8+i*1e6+0.123456); s.push([i/3,-i]);}
  const o=JSON.parse(simRapJson({freqs:f, s:s, x:Math.PI}));
  egal(o.x,3.1416,"arrondi");
  egal(o.freqs.length,o.s.length,"alignement");
  egal(o.freqs.length,64,"63 points (1000 / 16) + la note");
  egal(o.s[1][1],-16,"même pas pour les deux listes");
  if(!/1000 valeurs, une sur 16/.test(o.freqs[63]))throw new Error("note : "+o.freqs[63]);
  if(simRapJson({g:new Array(200000).fill(1.5)}).length>SIM_RAP_JSON_MAX)
    throw new Error("taille non tenue");
});

T("le bouton est dans la rangée des onglets",function(){
  SIM.famille="si"; SIM.analyse="impedance";
  if(simOnglets().indexOf('id="simRapport"')<0)throw new Error("pas de bouton");
});

T("impédance : Z₀ moyen, et rouge dès qu'une section sort",function(){
  SIM.saisie.cible=50; SIM.saisie.tolPct=10;
  const res={f_centre:1e9,
    ligne:{z0_moyen:52.4, z0_min:48, z0_max:61, longueur:30, troncons:2,
           retard:2e-10, pertes_db:0.12},
    segments:[{couche:0, nom_couche:"Top", largeur:0.3, z0:48, longueur:20},
              {couche:0, nom_couche:"Top", largeur:0.2, z0:61, longueur:10}]};
  const k=SIM_RAP_KPI.impedance(res);
  egal(k[0].val,"52,4 Ω","Z₀ moyen");
  egal(k[0].rang,"crit","rang");
  if(k[1].detail.indexOf("1 section(s) hors tolérance, 10,00 mm")<0)
    throw new Error("détail : "+k[1].detail);
  res.segments[1].z0=51;
  egal(SIM_RAP_KPI.impedance(res)[0].rang,"ok","rang dans la tolérance");
});

T("la piste se regroupe par net et par couche, couches nommées par l'empilage",function(){
  const p=simRapPiste({carte:"essai", net:"CLK",
    stackup:{layers:[{type:"copper",name:"Top",thickness:0.035},
                     {type:"dielectric",name:"FR-4",thickness:0.2,epsilon_r:4.3,tan_delta:0.02},
                     {type:"copper",name:"Bot",thickness:0.035}]},
    geometry:{objects:[
      {net:"CLK", layer:0, width:0.3, length:12},
      {net:"CLK", layer:0, width:0.2, start:[0,0], end:[3,4]},
      {net:"CLK", layer:1, width:0.3, length:7}]},
    vias:[{}], reference_nets:["GND"]});
  egal(p.lignes.length,2,"lignes");
  egal(p.lignes[0].couche,"Top"); egal(p.lignes[1].couche,"Bot");
  egal(p.lignes[0].mm,17,"longueur Top (12 + hypot 3,4)");
  egal([...p.lignes[0].largeurs].join(" · "),"0,300 · 0,200");
  egal(p.vias,1); egal(p.masse[0],"GND");
  egal(simRapPiste(null),null,"sans document");
});

T("le Markdown porte les sections et ses tableaux",function(){
  const d={date:new Date(0), analyse:"Impédance", carte:"essai", outil:"editeur-pcb",
    famille:"SI — Intégrité du signal", quoi:"", statutTxt:"Conforme", res:{},
    kpis:[{lbl:"Z₀", val:"50 Ω", detail:"cible"}],
    constats:[{rang:"warn", titre:"Réserve", desc:"pas de couture"}],
    piste:simRapPiste({geometry:{objects:[{net:"A|B", layer:"L1", width:0.1, length:2}]},
                       stackup:{layers:[]}}),
    bornes:[], reglages:[{nom:"Fréquence centrale", val:"1 GHz"}], texte:"", fiche:null};
  const md=simRapMarkdown(d);
  for(const s of ["# Rapport de simulation — Impédance","- **Z₀ :** 50 Ω (cible)",
                  "**[WARN]** Réserve — pas de couture","| A\\|B | L1 | 1 | 2,000 | 0,100 |",
                  "- Fréquence centrale : 1 GHz","Document autonome",". Consignes pour une IA"])
    if(md.indexOf(s)<0)throw new Error("absent : "+s);
});

console.log("\n"+ok+" ok, "+ko+" KO");
process.exit(ko?1:0);
