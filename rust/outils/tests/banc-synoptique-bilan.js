window.addEventListener("load",()=>setTimeout(()=>{
let r;
try{
  loadDoc(%s); gotoPage(0); arrangeSheetBlocks();
  const R=sheetRoutes(), B=sheetBlocks(), L=sheetLinks(), lie=new Set(L.flatMap(l=>[l.a,l.b]));
  r={blocs:B.length, liens:L.length, alims:L.filter(l=>l.isPower).length, direct:R.filter(r=>r.direct).length,
     sansTitre:B.filter(b=>b.name===b.key).map(b=>b.key), isoles:B.filter(b=>!lie.has(b.key)).map(b=>b.key),
     centre:(B.find(b=>b.big)||{}).key||"-"};
}catch(e){r={erreur:String(e&&e.stack||e).slice(0,300)};}
const pre=document.createElement("pre");pre.id="OUT";pre.textContent=JSON.stringify(r);document.body.appendChild(pre);
},300));