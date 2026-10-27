// Banc : le mode tactile suit le profil (repli navigateur) ; ← sur la carte de départ du tuto ne lance rien.
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

console.log("\n"+ok+" ok, "+ko+" KO");
process.exit(ko?1:0);
