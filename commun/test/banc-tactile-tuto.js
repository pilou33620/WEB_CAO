// Banc : le mode tactile suit le profil (repli navigateur) ; ← sur la carte de départ du tuto ne lance rien ;
// changer de projet efface la carte IPC mise de côté ; la date de lecture d'un document survit à l'aller-retour.
// node commun/test/banc-tactile-tuto.js  → une ligne par essai et un bilan
const fs=require("fs"), vm=require("vm"), path=require("path");
const lire=f=>fs.readFileSync(path.join(__dirname,"..",f),"utf8");
let ok=0, ko=0;
function T(nom,fn){
  try{fn();console.log("  ok  "+nom);ok++;}
  catch(e){console.log("  KO  "+nom+" → "+e.message);ko++;}
}

/* ---------- commun/tactile.js : tactileEstActif ---------- */
const srcTactile=lire("tactile.js");
function tactile(navig,profLire){
  const ctx={window:{localStorage:{getItem:k=>k==="cao.modeTactile"?navig:null}},document:{}};
  if(profLire)ctx.profLire=profLire;
  vm.runInNewContext(srcTactile,ctx);
  return ctx.tactileEstActif();
}
T("tactile : le profil prime sur le navigateur (actif)",()=>{
  if(tactile("0",k=>k==="reglages:tactile"?{actif:true}:null)!==true)throw new Error("profil actif ignoré");
});
T("tactile : le profil prime sur le navigateur (inactif)",()=>{
  if(tactile("1",()=>({actif:false}))!==false)throw new Error("profil inactif ignoré");
});
T("tactile : sans profil, repli sur cao.modeTactile",()=>{
  if(tactile("1")!==true||tactile("1",()=>null)!==true||tactile("1",()=>({actif:"oui"}))!==true||
     tactile("0",()=>{throw new Error("x");})!==false)throw new Error("repli navigateur");
});

/* ---------- commun/tuto.js : flèche gauche sur la carte de départ ---------- */
T("tuto : ← sur la carte de départ ne lance pas la visite, → oui",()=>{
  const el=()=>({style:{},dataset:{},hidden:false,innerHTML:"",addEventListener(){},getBoundingClientRect:()=>({})});
  let clavier=null;
  const document={currentScript:{dataset:{outil:"ipc2581"}},body:{append(){},appendChild(){}},
    createElement:el,querySelector:()=>null,querySelectorAll:()=>[],
    addEventListener(k,f){if(k==="keydown")clavier=f;}};
  const crees=[], creer=document.createElement;
  document.createElement=t=>{const e=creer(t);crees.push(e);return e;};
  vm.runInNewContext(lire("tuto.js"),{document,localStorage:{getItem:()=>"1",setItem(){}},
    location:{search:"?tuto",pathname:"/x"},history:{replaceState(){}},
    setTimeout:f=>f(),setInterval(){},addEventListener(){},innerWidth:1000,innerHeight:800});
  const bulle=crees.find(e=>e.className==="tuto-bulle");
  const touche=key=>clavier({key,preventDefault(){},stopPropagation(){}});
  if(!/Commencer/.test(bulle.innerHTML))throw new Error("carte de départ absente");
  touche("ArrowLeft");
  if(!/Commencer/.test(bulle.innerHTML))throw new Error("← a lancé la visite : "+bulle.innerHTML.slice(0,80));
  touche("ArrowRight");
  if(!/étape 1 \//.test(bulle.innerHTML))throw new Error("→ n'ouvre pas l'étape 1");
});

/* ---------- commun/projet.js : changer de projet oublie aussi la carte IPC ---------- */
T("projet : ouvrir B ou fermer efface la session ipc2581 de A",()=>{
  const effaces=[];
  const ctx={window:{localStorage:null,addEventListener(){}},document:{readyState:"complete",querySelectorAll:()=>[]},
    sessEffacer:o=>effaces.push(o),console};
  vm.runInNewContext(lire("projet.js"),ctx);
  ctx.projOuvrir("A"); effaces.length=0;
  ctx.projOuvrir("B");
  if(effaces.indexOf("ipc2581")<0)throw new Error("projOuvrir : "+effaces);
  effaces.length=0; ctx.projFermer();
  if(effaces.indexOf("ipc2581")<0)throw new Error("projFermer : "+effaces);
});

/* ---------- commun/projet-disque.js : PROJD_VU survit au changement de page ---------- */
async function TA(nom,fn){
  try{await fn();console.log("  ok  "+nom);ok++;}
  catch(e){console.log("  KO  "+nom+" → "+e.message);ko++;}
}
const memSess=new Map();
const sessionStorage={getItem:k=>memSess.has(k)?memSess.get(k):null,setItem:(k,v)=>memSess.set(k,String(v)),removeItem:k=>memSess.delete(k)};
function pageDisque(urls){
  const ctx={sessionStorage,localStorage:{getItem:()=>null,setItem(){},removeItem(){}},location:{pathname:"/editeur-schematique/editeur-schematique.html"},
    ENTETE_WEB:{},projNom:()=>"A",projOuvrir(){},projSignaler(){},console,
    fetch:(u,o)=>{urls.push(o.method+" "+u);return Promise.resolve({ok:true,status:200,text:()=>Promise.resolve(JSON.stringify({document:{},fichier:"A-SCH.json",modifie:1000}))});}};
  vm.runInNewContext(lire("projet-disque.js"),ctx);
  return ctx;
}
const essaisAsync=[TA("projet-disque : après aller-retour, l'enregistrement envoie encore la date lue (409 possible)",async()=>{
  const u1=[], p1=pageDisque(u1);
  p1.projdAdopter("serveur","/P/A",{nom:"A"},{});
  await p1.projdDocLire("schema");
  const u2=[], p2=pageDisque(u2);            // retour sur la page : nouvelle mémoire, même onglet
  p2.projdAdopter("serveur","/P/A",{nom:"A"},{});
  await p2.projdDocEcrire("schema",{});
  if(!/^PUT .*modifie=1000/.test(u2[0]||""))throw new Error("date perdue : "+u2[0]);
  const u3=[], p3=pageDisque(u3);            // autre projet : rien de l'ancien
  p3.projdAdopter("serveur","/P/B",{nom:"B"},{});
  await p3.projdDocEcrire("schema",{});
  if(/modifie=/.test(u3[0]||""))throw new Error("date d'un autre projet : "+u3[0]);
})];

Promise.all(essaisAsync).then(()=>{
console.log("\n"+ok+" ok, "+ko+" KO");
process.exit(ko?1:0);
});
