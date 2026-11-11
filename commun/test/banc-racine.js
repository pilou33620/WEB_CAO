// essai de RACINE_OUTIL : script chargé par adresse, en ligne (monofichier), direct, file://
const fs=require("fs"),vm=require("vm");const code=fs.readFileSync(require("path").join(__dirname,"..","echappe.js"),"utf8")+";RACINE_OUTIL";
function essai(src,href){const u=new URL(href);const appels=[];const window={fetch:(x)=>appels.push(x),addEventListener(){}};
  const ctx={window,document:{currentScript:src==null?null:{src},addEventListener(){}},location:u,URL};
  const r=vm.runInNewContext(code,ctx);window.fetch("/api/x");return r+" | "+appels[0];}
const cas=[
 ["https://h/o/web_cao/commun/echappe.js","https://h/o/web_cao/editeur-pcb/editeur-pcb.html","/o/web_cao | /o/web_cao/api/x"],
 ["","https://h/o/web_cao/editeur-pcb/dist/editeur-pcb.html","/o/web_cao | /o/web_cao/api/x"],
 ["","https://h/editeur-pcb/dist/editeur-pcb.html"," | /api/x"],
 ["","https://h/o/web_cao/index.html","/o/web_cao | /o/web_cao/api/x"],
 ["","https://h/o/web_cao/","/o/web_cao | /o/web_cao/api/x"],
 ["","https://h/"," | /api/x"],
 ["http://h/commun/echappe.js","http://h/editeur-pcb/editeur-pcb.html"," | /api/x"],
 ["","file:///C:/x/editeur-pcb/dist/editeur-pcb.html"," | /api/x"],
 [null,"https://h/o/web_cao/visionneuse-ipc2581/visionneuse-ipc2581.html","/o/web_cao | /o/web_cao/api/x"]];
let ko=0;for(const [s,h,att] of cas){const r=essai(s,h);if(r!==att){ko++;console.log("KO",s,h,"→",r,"attendu",att);}}
console.log(ko?"ECHEC":"racine : "+cas.length+" cas ok");process.exit(ko?1:0);
