"use strict";
/* ==========================================================================
   Éditeur PCB — zones interdites et hauteurs (intégration mécanique)
   --------------------------------------------------------------------------
   Une carte se loge quelque part : un bouchon, un boîtier, une face posée
   contre une LED. Sur la carte LED_UV, les pattes de J1 ressortaient du côté
   de la LED, à 6 mm d'elle, sans que rien ne le dise.

   ZONE INTERDITE (`S.interdits`) : un polygone sur UNE face, dessus ou
   dessous. Le DRC y signale
     - toute patte traversante qui RESSORT sur cette face (celle d'un
       composant posé sur l'autre face) ;
     - tout composant posé sur cette face qui la touche : interdit si la zone
       n'admet aucune hauteur (`hMax` null), trop haut sinon.
   HAUTEUR MAXIMALE PAR FACE (`S.rule.hDessus`, `S.rule.hDessous`, null = pas
   de limite) : pour toute la carte.

   La hauteur d'un composant est celle du dossier mécanique (mecaDossier) :
   saisie dans sa fenêtre, sinon « Maximun Height » de la LIB (l'éditeur ne
   lit pas de hauteur de fichier). Inconnue, elle est signalée, jamais
   supposée.
   ========================================================================== */

/* { id, face: "dessus" | "dessous", pts: [{x,y}…], hMax: mm | null, nom } */
function interditsListe(){return Array.isArray(S.interdits)?S.interdits:[];}

/* Relu d'un fichier : un polygone d'au moins trois sommets, une face, une
   hauteur plausible ou null. */
function normInterdit(z,i){
  if(!z||typeof z!=="object")return null;
  const pts=dPts(z.pts,3);
  if(!pts)return null;
  const h=+z.hMax;
  return {id:dInt(z.id,i+1,1,Number.MAX_SAFE_INTEGER),face:z.face==="dessous"?"dessous":"dessus",
          pts:pts.map(p=>({x:r3(p.x),y:r3(p.y)})),hMax:Number.isFinite(h)&&h>0&&h<=100?r3(h):null,
          nom:dStr(z.nom!=null?z.nom:"Zone interdite "+(i+1),60)};
}

/* Deux polygones se touchent-ils ? Un sommet de l'un dans l'autre, ou deux
   côtés qui se croisent. */
function polysTouchent(A,B){
  if(A.some(p=>inPoly(p.x,p.y,B))||B.some(p=>inPoly(p.x,p.y,A)))return true;
  for(let i=0;i<A.length;i++)for(let j=0;j<B.length;j++){
    const a=A[i],b=A[(i+1)%A.length],c=B[j],d=B[(j+1)%B.length];
    if(segCross({x1:a.x,y1:a.y,x2:b.x,y2:b.y},{x1:c.x,y1:c.y,x2:d.x,y2:d.y}))return true;
  }
  return false;
}

/* La hauteur de chaque empreinte, comme le dossier mécanique la lit. */
function interditsHauteurs(){
  const m=new Map();
  try{for(const c of mecaDossier().composants)m.set(c.ref,c.hauteur);}catch(e){}
  return m;
}

/* Le DRC (appelé par runDrc, 02-connectivity.js). */
function interditsDrc(out){
  const Z=interditsListe(), lim={dessus:S.rule.hDessus,dessous:S.rule.hDessous};
  const limites=lim.dessus>0||lim.dessous>0;
  if(!Z.length&&!limites)return;
  const H=interditsHauteurs(), mm=v=>fmt(v,2).replace(".",",");
  const couche=f=>f==="dessous"?S.cu-1:0;
  const inconnues=[];
  for(const fp of S.fps){
    const face=fp.side?"dessous":"dessus", autre=fp.side?"dessus":"dessous";
    const T=fpXform(fp), b=bodyOf(fp), corps=[T(b.x1,b.y1),T(b.x2,b.y1),T(b.x2,b.y2),T(b.x1,b.y2)];
    const h=H.get(fp.ref);
    for(const z of Z){
      /* les pattes traversantes ressortent sur l'autre face que celle du composant */
      if(z.face===autre)
        for(const q of padsWorld(fp))
          if(q.drill>0&&inPoly(q.x,q.y,z.pts)){
            out.push({x:q.x,y:q.y,l:couche(z.face),
              msg:"Patte traversante "+fp.ref+"."+q.n+" : elle ressort sur le "+z.face+" dans « "+z.nom+" »"});
            break;
          }
      if(z.face!==face||!polysTouchent(corps,z.pts))continue;
      if(z.hMax==null)
        out.push({x:fp.x,y:fp.y,l:couche(face),msg:fp.ref+" ("+face+") dans « "+z.nom+" » : aucun composant n'y est permis"});
      else if(h==null)
        out.push({info:true,x:fp.x,y:fp.y,l:couche(face),
          msg:fp.ref+" dans « "+z.nom+" » : hauteur inconnue, "+mm(z.hMax)+" mm permis — saisissez-la (dossier mécanique) ou dans la LIB"});
      else if(h>z.hMax+1e-6)
        out.push({x:fp.x,y:fp.y,l:couche(face),msg:fp.ref+" trop haut dans « "+z.nom+" » : "+mm(h)+" mm pour "+mm(z.hMax)+" mm permis"});
    }
    const L=lim[face];
    if(L>0){
      if(h==null)inconnues.push(fp.ref);
      else if(h>L+1e-6)out.push({x:fp.x,y:fp.y,l:couche(face),msg:fp.ref+" ("+face+") trop haut : "+mm(h)+" mm pour "+mm(L)+" mm permis sur la carte"});
    }
  }
  if(inconnues.length)
    out.push({info:true,x:S.board.x,y:S.board.y,l:0,
      msg:"Hauteur maximale de la carte : "+inconnues.length+" composant(s) de hauteur inconnue ("+
          inconnues.slice(0,10).join(", ")+(inconnues.length>10?"…":"")+") — saisissez-la (dossier mécanique) ou dans la LIB"});
}

/* Le tracé : un cadre hachuré, rouge, et son nom (face, hauteur permise). */
function interditsDessiner(c){
  const Z=interditsListe();
  if(!Z.length)return;
  c.save();
  for(const z of Z){
    const sel=S.sel.interdits&&S.sel.interdits.has(z);
    c.beginPath();c.moveTo(z.pts[0].x,z.pts[0].y);
    for(let k=1;k<z.pts.length;k++)c.lineTo(z.pts[k].x,z.pts[k].y);
    c.closePath();
    c.globalAlpha=0.08;c.fillStyle=C_ERR;c.fill();
    c.globalAlpha=sel?1:0.75;c.strokeStyle=sel?C_SEL:C_ERR;c.lineWidth=px(sel?1.8:1.2);
    c.setLineDash(z.face==="dessous"?[px(2),px(3)]:[px(6),px(3)]);c.stroke();c.setLineDash([]);
    const b=polyBBox(z.pts);
    c.globalAlpha=1;c.fillStyle=sel?C_SEL:C_ERR;
    c.font=px(11)+'px "Segoe UI",system-ui,sans-serif';c.textAlign="left";c.textBaseline="top";
    c.save();c.translate(b.x1+px(3),b.y1+px(3));if(S.flip)c.scale(-1,1);
    c.fillText(z.nom+" · "+z.face+(z.hMax!=null?" · h ≤ "+fmt(z.hMax,1)+" mm":" · aucun composant"),0,0);
    c.restore();
  }
  c.restore();
}

/* Fin du tracé (mode « interdit », comme une découpe : un clic par sommet,
   ou deux coins puis Entrée). Face : celle qu'on regarde. */
function closeInterdit(Z){
  let pts=Z.pts.map(p=>({x:r3(p.x),y:r3(p.y)}));
  if(pts.length===2){
    const [a,b]=pts;
    if(Math.abs(a.x-b.x)<0.05||Math.abs(a.y-b.y)<0.05){hint("Rectangle trop fin : zone interdite abandonnée.");draw();return;}
    pts=[{x:a.x,y:a.y},{x:b.x,y:a.y},{x:b.x,y:b.y},{x:a.x,y:b.y}];
  }
  if(pts.length<3){draw();return;}
  push();
  if(!Array.isArray(S.interdits))S.interdits=[];
  const z={id:S.nextId++,face:(S.flip||S.active===S.cu-1)?"dessous":"dessus",pts,hMax:null,
           nom:"Zone interdite "+(S.interdits.length+1)};
  S.interdits.push(z);
  clearSel();if(!S.sel.interdits)S.sel.interdits=new Set();S.sel.interdits.add(z);
  touch();refreshPanels();draw();
  hint("Zone interdite posée sur le "+z.face+" : aucun composant, aucune patte qui ressorte. Réglez sa face et sa hauteur dans les propriétés.");
}
function selInterdits(){
  if(!S.sel.interdits)S.sel.interdits=new Set();
  return interditsListe().filter(z=>S.sel.interdits.has(z));
}

/* La fiche d'une zone interdite sélectionnée. */
function propsInterdit(box,z){
  const b=polyBBox(z.pts);
  box.innerHTML=
    '<div class="cat">Zone interdite</div>'+
    '<div class="prop"><label>Nom</label><input id="ziNom" value="'+esc(z.nom)+'"></div>'+
    '<div class="prop two"><div><label>Face</label><select id="ziFace">'+
      '<option value="dessus"'+(z.face==="dessus"?" selected":"")+'>Dessus</option>'+
      '<option value="dessous"'+(z.face==="dessous"?" selected":"")+'>Dessous</option></select></div>'+
      numProp("ziH","Hauteur permise (mm)",z.hMax!=null?z.hMax:"",0.1,0)+'</div>'+
    '<div class="prop two"><div><label>Emprise</label><input value="'+fmt(b.x2-b.x1,2)+' × '+fmt(b.y2-b.y1,2)+' mm" disabled></div>'+
      '<div><label>Sommets</label><input value="'+z.pts.length+'" disabled></div></div>'+
    '<div class="empty" style="padding:6px 12px">Sur sa face : aucune patte traversante ne doit en ressortir, '+
      'et un composant n\'y est permis que sous la hauteur donnée (vide : aucun). Glissez un sommet pour '+
      'le déplacer · Suppr retire la zone.</div>'+
    '<div class="prop"><div class="row"><button class="tb" id="ziDel">Supprimer la zone</button></div></div>';
  const maj=fn=>()=>{push();fn();touch();refreshPanels();draw();};
  $("ziNom").onchange=maj(()=>{z.nom=String($("ziNom").value).slice(0,60)||z.nom;});
  $("ziFace").onchange=maj(()=>{z.face=$("ziFace").value==="dessous"?"dessous":"dessus";});
  $("ziH").onchange=maj(()=>{const v=parseFloat($("ziH").value);z.hMax=v>0?r3(Math.min(v,100)):null;});
  $("ziDel").onclick=()=>deleteSel();
}
