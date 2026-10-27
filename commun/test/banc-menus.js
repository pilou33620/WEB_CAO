// Banc : un menu ouvert près du bord droit est recalé dans l'écran.
// node commun/test/banc-menus.js  → une ligne de bilan
const fs=require("fs"), vm=require("vm"), path=require("path");
const src=fs.readFileSync(path.join(__dirname,"../menus.js"),"utf8");
function cas(gauche, largeur, tel){
  const h={}, pop={style:{left:""}, addEventListener(){},
    getBoundingClientRect(){const l=gauche+(parseFloat(this.style.left)||0);return{left:l,right:l+largeur};}};
  const t={addEventListener(k,f){h[k]=f;}};
  const m={classList:{add(){},remove(){}},querySelector:s=>s===".mnu-t"?t:pop};
  const document={querySelectorAll:()=>[m],getElementById:()=>null,addEventListener(){},
    body:{classList:{contains:c=>c==="tel"&&tel}},documentElement:{clientWidth:1000}};
  vm.runInNewContext(src,{document,window:{addEventListener(){}},setTimeout});
  h.click({stopPropagation(){}});
  return pop.style.left;
}
const r=[["dedans",cas(100,260)===""],["recale",cas(900,260)==="-166px"],
  ["borne-gauche",cas(20,2000)==="-14px"],["telephone",cas(900,260,true)===""]];
const ko=r.filter(x=>!x[1]).map(x=>x[0]);
console.log(ko.length?"menus : ÉCHEC "+ko.join(", "):"menus : 4/4 ok");
process.exit(ko.length?1:0);
