/* =============================================================================
   editeur-schematique — 11-palette.js
   Palette de composants (icônes + construction)
   ============================================================================= */
"use strict";
/* ==========================================================================
   Palette
   ========================================================================== */
function iconFor(type){
  const cvs=document.createElement("canvas");
  const w=62,h=44,dpr=window.devicePixelRatio||1;
  cvs.width=w*dpr;cvs.height=h*dpr;cvs.style.width=w+"px";cvs.style.height=h+"px";
  const c=cvs.getContext("2d");
  c.scale(dpr,dpr);c.translate(w/2,h/2);
  const def=defOf(type);
  const sample={value:def.icon||def.v,npins:6};
  let m=34;pinsOf({type:type,npins:6}).forEach(p=>{m=Math.max(m,Math.abs(p[0]),Math.abs(p[1]));});
  const e=typeof def.ext==="function"?def.ext(sample):def.ext;
  if(e)e.forEach(v=>{m=Math.max(m,Math.abs(v));});
  const s=Math.min(w,h)/(m*2+16);
  c.scale(s,s);
  c.strokeStyle=C_COMP;c.lineWidth=3;c.lineCap="round";c.lineJoin="round";
  def.d(c,sample);
  return cvs;
}
function setPalette(type){
  document.querySelectorAll(".item").forEach(n=>n.classList.toggle("on",n.dataset.type===type));
}
function buildPalette(){
  const box=document.getElementById("palette");
  for(const cat of CATS){
    const h=document.createElement("div");h.className="cat";h.textContent=cat;box.appendChild(h);
    const g=document.createElement("div");g.className="grid";
    for(const [type,def] of Object.entries(LIB)){
      if(def.cat!==cat)continue;
      const b=document.createElement("div");b.className="item";b.dataset.type=type;b.title=def.n;
      b.appendChild(iconFor(type));
      const s=document.createElement("span");s.textContent=def.n;b.appendChild(s);
      b.onclick=()=>{
        setMode("select");
        S.place = S.place===type?null:type;S.placeRot=0;
        setPalette(S.place);
        document.getElementById("fHint").textContent = S.place
          ? "Clic sur la feuille pour poser "+def.n+" · R pour pivoter · Maj+clic pour en poser plusieurs."
          : "Clic sur un composant de la bibliothèque puis clic sur la feuille pour le poser.";
        draw();
      };
      g.appendChild(b);
    }
    box.appendChild(g);
  }
}
