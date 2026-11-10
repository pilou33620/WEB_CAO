/* ==========================================================================
   50-couches.js — couches mécaniques, keep-out cuivre, plans négatifs
   --------------------------------------------------------------------------
   - COUCHES MÉCANIQUES : huit couches de dessin libres (`mec1`…`mec8`,
     DRW_COUCHES), qu'on nomme à son idée (assemblage, cotes, découpe du
     boîtier…). Une couche qui porte un dessin part au Gerber en .GM2 à .GM9 ;
   - KEEP-OUT CUIVRE : une zone interdite marquée `ko` = {l, pistes, vias,
     zones}, sur une couche (`l`) ou toutes (−1). Les zones s'y découpent
     (`keepoutCuts`, lu par `cutsCuivre`), le DRC y signale pistes et vias ;
   - PLAN NÉGATIF : une couche plan (`cuL[i].negatif`) écrite au Gerber en
     polarité négative, comme les « Internal Plane » d'Altium : le fichier
     dessine ce qui n'est PAS du cuivre (dégagements, contour), le cuivre
     restant ce que le fabricant n'a pas noirci.
   ========================================================================== */



/* ---------- couches mécaniques ---------- */
const MECA_DEFAUT=Object.fromEntries(DRW_COUCHES.filter(c=>/^mec\d$/.test(c[0])).map(c=>[c[0],c[1]]));
function mecaNomsLire(o){
  const out={};
  if(o&&typeof o==="object")
    for(const k in MECA_DEFAUT)if(typeof o[k]==="string"&&o[k].trim())out[k]=dStr(o[k].trim(),40);
  return out;
}
/* Les noms choisis remplacent ceux d'usine partout où l'on liste les couches
   (panneau, listes de choix, propriétés d'un dessin). */
function mecaNomsAppliquer(){
  const N=S.mecaNoms||{};
  for(const c of DRW_COUCHES)if(MECA_DEFAUT[c[0]])c[1]=N[c[0]]||MECA_DEFAUT[c[0]];
  for(const id of ["arcCible","coteCouche"]){
    const s=$(id);
    if(!s||!s.querySelectorAll)continue;
    for(const o of s.querySelectorAll("option[data-meca]"))o.remove();
    for(const c of DRW_COUCHES)if(MECA_DEFAUT[c[0]]){
      const o=document.createElement("option");
      o.value=c[0];o.textContent=c[1];o.setAttribute("data-meca","1");s.appendChild(o);
    }
  }
  if(typeof buildLayers==="function")try{buildLayers();}catch(_){/* panneau pas encore là */}
}
function mecaDialogue(){
  const d=document.createElement("dialog");
  d.className="ed-dlg";
  const cles=Object.keys(MECA_DEFAUT);
  d.innerHTML='<div class="mtitle">Couches mécaniques</div>'+cles.map(k=>{
    const n=dessinsMonde().filter(o=>o.layer===k).length;
    return '<div class="prop two"><div><label>'+esc(MECA_DEFAUT[k])+' · '+n+' dessin(s)</label>'+
      '<input data-k="'+k+'" maxlength="40" value="'+esc((S.mecaNoms||{})[k]||"")+'" placeholder="'+esc(MECA_DEFAUT[k])+'"></div>'+
      '<div><label><input type="checkbox" data-v="'+k+'"'+(S.show[k]!==false?" checked":"")+'> affichée</label></div></div>';}).join("")+
    '<div class="row"><button class="tb" id="mcFin">Fermer</button></div>';
  document.body.appendChild(d);
  for(const i of d.querySelectorAll("input[data-k]"))i.onchange=()=>{
    push();
    S.mecaNoms=Object.assign({},S.mecaNoms);
    const t=String(i.value).trim().slice(0,40);
    if(t)S.mecaNoms[i.dataset.k]=t;else delete S.mecaNoms[i.dataset.k];
    mecaNomsAppliquer();touch();refreshPanels();draw();
  };
  for(const i of d.querySelectorAll("input[data-v]"))i.onchange=()=>{S.show[i.dataset.v]=i.checked;buildLayers();draw();};
  const fermer=()=>{d.close();d.remove();};
  d.querySelector("#mcFin").onclick=fermer;
  d.addEventListener("cancel",e=>{e.preventDefault();fermer();});
  d.showModal();
}
/* Le Gerber d'une couche de dessin : traits, cadres, textes, aplats. */
function gerberDessin(layer,nom){
  const A=apSet(), body=[];
  for(const d of dessinsMonde()){
    if(d.layer!==layer)continue;
    const w=d.width||0.15;
    if(d.shape==="poly"){
      gRegion(body,d.pts);
      if(d.trous&&d.trous.length){body.push("%LPC*%");for(const t of d.trous)gRegion(body,t);body.push("%LPD*%");}
    }else if(d.shape==="text"){
      for(const P of textStrokes(d.text||"TEXT",d.x1,d.y1,d.size||1.5,drwMiroir(d),d.rot||0))
        for(let k=0;k+1<P.length;k++)gSeg(body,A,P[k].x,P[k].y,P[k+1].x,P[k+1].y,w);
    }else if(d.shape==="rect"){
      gSeg(body,A,d.x1,d.y1,d.x2,d.y1,w);gSeg(body,A,d.x2,d.y1,d.x2,d.y2,w);
      gSeg(body,A,d.x2,d.y2,d.x1,d.y2,w);gSeg(body,A,d.x1,d.y2,d.x1,d.y1,w);
    }else{const P=drwPoints(d);for(let k=0;k+1<P.length;k++)gSeg(body,A,P[k].x,P[k].y,P[k+1].x,P[k+1].y,w);}
  }
  if(!body.length)return null;
  // le nom en ASCII : la fonction de fichier X2 ne prend ni accent ni virgule
  const fn="Other,"+String(nom).normalize("NFD").replace(/[^A-Za-z0-9 _-]/g,"").trim().replace(/\s+/g,"-");
  return gAssemble(gHeader(fn||"Other,Mecanique"),A,body);
}
/* les fichiers des couches mécaniques qui portent un dessin : mec1 → .GM2… */
function mecaGerbers(base){
  const out=[];
  for(const c of DRW_COUCHES){
    const m=/^mec(\d)$/.exec(c[0]);
    if(!m)continue;
    const t=gerberDessin(c[0],c[1]);
    if(t)out.push({name:base+".GM"+(+m[1]+1),text:t});
  }
  return out;
}

/* ---------- keep-out cuivre ---------- */
function koLire(o){
  if(!o||typeof o!=="object")return null;
  const l=Number.isInteger(+o.l)&&+o.l>=0&&+o.l<CU_MAX?+o.l:-1;
  return {l,pistes:o.pistes!==false,vias:o.vias!==false,zones:o.zones!==false};
}
function koListe(){return interditsListe().filter(z=>z.ko);}
function koCouches(z){
  if(z.ko.l<0)return [...Array(S.cu).keys()];
  return z.ko.l<S.cu?[z.ko.l]:[];
}
function koResume(z){
  const quoi=["pistes","vias","zones"].filter(k=>z.ko[k]);
  return "keep-out "+(z.ko.l<0?"toutes couches":cuId(z.ko.l,S.cu))+" ("+(quoi.length?quoi.join(", "):"rien")+")";
}
/* ce que les zones doivent laisser vide : une découpe par couche visée */
function keepoutCuts(){
  const out=[];
  for(const z of koListe())if(z.ko.zones)for(const l of koCouches(z))out.push({l,pts:z.pts,ko:true});
  return out;
}
/* Le keep-out dans le monde du routeur : une pastille polygonale fixe, qu'on
   ne pousse pas et qu'on contourne, d'isolement nul (`pnsClr`). Le shove, le
   contournement, la touche V et l'anti-collision la voient donc d'eux-mêmes ;
   le DRC d'isolation l'ignore, `keepoutDrc` s'en charge. */
const PNS_KO="(keep-out)";
function pnsItemsKeepout(){
  const out=[];
  for(const z of koListe()){
    if(!z.ko.pistes&&!z.ko.vias)continue;
    const L=koCouches(z);
    if(!L.length)continue;
    const b=polyBBox(z.pts), cx=(b.x1+b.x2)/2, cy=(b.y1+b.y2)/2;
    const q={n:0,x:cx,y:cy,w:b.x2-b.x1,h:b.y2-b.y1,shape:"poly",rot:0,drill:0,net:PNS_KO,
             pts:z.pts.map(p=>({x:p.x-cx,y:p.y-cy}))};
    out.push({k:"P",q,fp:{ref:"keep-out « "+z.nom+" »",id:-2},net:PNS_KO,l0:Math.min(...L),l1:Math.max(...L),
              src:z,ko:true,koPistes:z.ko.pistes,koVias:z.ko.vias,bx1:b.x1,by1:b.y1,bx2:b.x2,by2:b.y2});
  }
  return out;
}
/* La distance d'un segment au polygone P : 0 s'il y entre ou le croise. */
function distSegPoly(s,P){
  if(inPoly(s.x1,s.y1,P)||inPoly(s.x2,s.y2,P))return 0;
  let d=1e9;
  for(let k=0;k<P.length;k++){const a=P[k], b=P[(k+1)%P.length];
    d=Math.min(d,segSegDist(s,{x1:a.x,y1:a.y,x2:b.x,y2:b.y}));}
  return d;
}
function keepoutDrc(out){
  for(const z of koListe()){
    const L=new Set(koCouches(z));
    if(z.ko.pistes)
      for(const t of S.tracks){
        // un arc : ses cordes (trkSegs, 01-core.js)
        if(!L.has(t.l)||Math.min(...trkSegs(t).map(s=>distSegPoly(s,z.pts)))-t.w/2>-1e-6)continue;
        const m=trkMid(t);
        out.push({x:r3(m.x),y:r3(m.y),l:t.l,msg:"Piste "+(t.net||"sans net")+" dans le keep-out « "+z.nom+" » ("+cuId(t.l,S.cu)+")"});
      }
    if(z.ko.vias)
      for(const v of S.vias){
        let dans=false;for(let l=v.a;l<=v.b;l++)if(L.has(l)){dans=true;break;}
        if(!dans)continue;
        const d=inPoly(v.x,v.y,z.pts)?0:polyEdgeDist(v.x,v.y,z.pts);
        if(d-v.d/2>-1e-6)continue;
        out.push({via:v,x:v.x,y:v.y,l:v.a,msg:"Via "+(v.net||"sans net")+" dans le keep-out « "+z.nom+" »"});
      }
    /* une région pleine est peinte telle quelle, par-dessus les découpes
       (04-fabrication.js) : le keep-out ne la creuse pas, il faut la signaler */
    if(z.ko.zones)
      for(const q of S.zones){
        if(!q.plein||!L.has(q.l)||!polysTouchent(q.pts,z.pts))continue;
        out.push({x:r3(q.pts[0].x),y:r3(q.pts[0].y),l:q.l,msg:"Région pleine "+(q.net||"sans net")+" dans le keep-out « "+z.nom+" » ("+cuId(q.l,S.cu)+")"});
      }
  }
}
function propsKeepout(box,z){
  const b=polyBBox(z.pts);
  box.innerHTML=
    '<div class="cat">Keep-out cuivre</div>'+
    '<div class="prop"><label>Nom</label><input id="koNom" value="'+esc(z.nom)+'"></div>'+
    '<div class="prop"><label>Couche</label><select id="koL"><option value="-1"'+(z.ko.l<0?" selected":"")+'>Toutes les couches</option>'+
      S.cuL.map((L,i)=>'<option value="'+i+'"'+(z.ko.l===i?" selected":"")+'>'+esc(L.name)+' — '+cuId(i,S.cu)+'</option>').join("")+'</select></div>'+
    '<div class="prop"><label>Interdit</label><div class="row">'+
      [["pistes","aux pistes"],["vias","aux vias"],["zones","aux zones"]].map(([k,t])=>
        '<label><input type="checkbox" data-ko="'+k+'"'+(z.ko[k]?" checked":"")+'> '+t+'</label>').join(" ")+'</div></div>'+
    '<div class="prop two"><div><label>Emprise</label><input value="'+fmt(b.x2-b.x1,2)+' × '+fmt(b.y2-b.y1,2)+' mm" disabled></div>'+
      '<div><label>Sommets</label><input value="'+z.pts.length+'" disabled></div></div>'+
    '<div class="empty" style="padding:6px 12px">Les zones de cuivre s\'y découpent ; le DRC y signale pistes et vias. '+
      'Glissez un sommet pour le déplacer · Suppr retire le keep-out.</div>'+
    '<div class="prop"><div class="row"><button class="tb" id="koDel">Supprimer</button></div></div>';
  const maj=fn=>()=>{push();fn();touch();refreshPanels();draw();};
  $("koNom").onchange=maj(()=>{z.nom=String($("koNom").value).slice(0,60)||z.nom;});
  $("koL").onchange=maj(()=>{z.ko.l=+$("koL").value;});
  for(const c of box.querySelectorAll?box.querySelectorAll("input[data-ko]"):[])c.onchange=maj(()=>{z.ko[c.dataset.ko]=c.checked;});
  $("koDel").onclick=()=>deleteSel();
}

/* ---------- plan négatif ---------- */
/* Le cuivre d'une couche écrit en positif (zones sombres, dégagements clairs,
   cuivre sombre par-dessus) devient son négatif : tout le cadre sombre, puis
   chaque polarité inversée. Le fichier porte FilePolarity,Negative. */
function gerberNegatif(body){
  const b=polyBBox(boardPoly()), m=2;
  const cadre=[];
  gRegion(cadre,[{x:b.x1-m,y:b.y1-m},{x:b.x2+m,y:b.y1-m},{x:b.x2+m,y:b.y2+m},{x:b.x1-m,y:b.y2+m}]);
  return cadre.concat(["%LPC*%"],body.map(l=>l==="%LPD*%"?"%LPC*%":l==="%LPC*%"?"%LPD*%":l));
}
function planNegatif(i,on){
  const L=S.cuL[i];
  if(!L)return false;
  if(on&&!rolePlane(layerRole(i))){hint("Seule une couche plan (masse, alimentation, blindage) s'écrit en négatif.");return false;}
  push();
  L.negatif=!!on;
  touch();buildLayers();refreshPanels();draw();
  hint(cuId(i,S.cu)+(on?" sera écrite en négatif au Gerber (FilePolarity Negative) : le fichier dessine les dégagements."
                      :" repasse en positif au Gerber."));
  return true;
}

/* ---------- branchement ---------- */
(function(){
  const on=(id,f)=>{const b=$(id);if(b)b.onclick=f;};
  on("mInterdit",()=>setMode("interdit"));
  on("mKeepout",()=>{setMode("interdit");S.interditKo=true;
    hint("Keep-out cuivre : un clic par sommet, ou deux coins puis Entrée. Ni piste, ni via, ni zone n'y entrera sans que le DRC le dise.");});
  on("bMeca",mecaDialogue);
  mecaNomsAppliquer();
})();
