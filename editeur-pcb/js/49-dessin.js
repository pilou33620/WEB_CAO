/* ==========================================================================
   49-dessin.js — les outils de dessin qui manquaient, à la manière d'Altium
   --------------------------------------------------------------------------
   - ARC (centre, départ, fin) et CERCLE (centre, rayon) : sur le cuivre, une
     vraie piste en arc (`t.ca`) ; sur la sérigraphie et les couches de dessin,
     une suite de traits ; un cercle peut aussi faire une découpe de carte ou
     une zone de cuivre ronde (cordes de `boardDisquePts`, que le Gerber relit
     en arcs) ;
   - TEXTE SUR CUIVRE, droit ou INVERSÉ (en réserve dans un aplat de cuivre) ;
   - CHAÎNES SPÉCIALES : `.Date`, `.Titre`, `.Revision`… remplacées à l'écran
     et dans les fichiers dans les textes de dessin (`dessinsMonde`), une fois
     pour toutes dans un texte cuivre ;
   - PASTILLE LIBRE : point de test, pastille traversante ou mire (fiducial),
     posée hors schéma (`fp.libre` : l'ECO la laisse en paix) ;
   - COTE : une cote linéaire posée sur la carte, dans une couche de dessin.
   ========================================================================== */

/* ---------- chaînes spéciales ---------- */
function texteSpecialValeurs(){
  const d=new Date(), z=n=>String(n).padStart(2,"0"), ci=S.cartoucheInfo||{};
  const ep=stackTotal();
  return {
    Date:z(d.getDate())+"/"+z(d.getMonth()+1)+"/"+d.getFullYear(),
    Heure:z(d.getHours())+":"+z(d.getMinutes()),
    Titre:ci.titre||ci.title||"",
    Revision:ci.rev||ci.revision||ci.indice||"",
    Societe:ci.societe||"",
    Auteur:ci.auteur||ci.dessine||"",
    Couches:String(S.cu),
    Dimensions:fmt(S.board.w,1)+" × "+fmt(S.board.h,1)+" mm",
    Epaisseur:fmt(ep,2)+" mm",
    Composants:String(S.fps.length)
  };
}
const TEXTE_SPECIAL_RE=/\.(Date|Heure|Titre|Revision|Societe|Auteur|Couches|Dimensions|Epaisseur|Composants)\b/g;
function texteSpecial(s){
  s=String(s==null?"":s);
  if(s.indexOf(".")<0)return s;
  const V=texteSpecialValeurs();
  return s.replace(TEXTE_SPECIAL_RE,(m,k)=>V[k]!=null&&V[k]!==""?V[k]:m);
}

/* ---------- l'état des outils ---------- */
S.dessinDraft=null;
S.arcForme="arc";            // « arc » ou « cercle »
S.arcCible="cuivre";         // cuivre | silk | dwgs | cmts | user | mec1… | decoupe | zone
S.pastilleType="cms";        // cms | traversante | fiducial
S.coteCouche="dwgs";
const DESSIN_MODES={arc:"Arc / cercle",texteCu:"Texte sur cuivre",pastille:"Pastille libre",cote:"Cote"};
function dessinOutil(m,o){
  if(o)Object.assign(S,o);
  setMode(m);
  S.dessinDraft=null;
  hint({
    arc:S.arcForme==="cercle"?"Cercle : cliquez le centre, puis un point du cercle · Échap annule."
                             :"Arc : cliquez le centre, puis le départ, puis la fin (sens trigonométrique, Maj pour l'autre sens) · Échap annule.",
    texteCu:"Texte sur cuivre : cliquez où le poser, sur la couche active ("+cuId(S.active,S.cu)+").",
    pastille:"Pastille libre ("+{cms:"point de test CMS",traversante:"pastille traversante",fiducial:"mire de centrage"}[S.pastilleType]+") : cliquez où la poser.",
    cote:"Cote : cliquez les deux points à coter, puis la position de la ligne de cote · Échap annule."
  }[m]);
  draw();
}
const dPt=(x,y)=>({x:snapX(x),y:snapY(y)});

/* ---------- arcs et cercles ---------- */
/* la face des traits de sérigraphie : celle qu'on regarde */
const dessinFace=()=>(S.flip||S.active===S.cu-1)?"B":"T";
function arcGeom(c,a,b,inverse){
  const r=dist(c.x,c.y,a.x,a.y), a1=Math.atan2(a.y-c.y,a.x-c.x);
  if(!b)return {c,r,a1,ca:-2*Math.PI};
  const t=Math.PI*2;
  let d=Math.atan2(b.y-c.y,b.x-c.x)-a1;
  // sens trigonométrique à l'écran (y vers le bas : angle décroissant) ; Maj pour l'autre
  d=((d%t)-t)%t;
  if(d>-1e-9)d=-t;
  if(inverse)d+=t;
  return {c,r,a1,ca:d};
}
function arcPoints(g,pasDeg){
  const n=Math.max(2,Math.ceil(Math.abs(g.ca)/(pasDeg*Math.PI/180)));
  const out=[];
  for(let k=0;k<=n;k++){const a=g.a1+g.ca*k/n;out.push({x:r4(g.c.x+g.r*Math.cos(a)),y:r4(g.c.y+g.r*Math.sin(a))});}
  return out;
}
/* Pose l'arc ou le cercle `g` sur la cible choisie. Rend ce qui a été créé. */
function arcPoser(g){
  if(!(g.r>0.05)){hint("Rayon trop petit.");return null;}
  const plein=Math.abs(g.ca)>=2*Math.PI-1e-9, cible=S.arcCible;
  if((cible==="decoupe"||cible==="zone")&&!plein){hint("Une découpe ou une zone se fait en cercle complet : passez l'outil en Cercle.");return null;}
  if(cible==="zone"){
    S.zoneDraft={l:S.active,pts:boardDisquePts(g.c.x,g.c.y,g.r),cur:null};
    closeZone();                  // demande le net, comme une zone tracée
    return {zone:true};
  }
  push();
  clearSel();
  let res=null;
  if(cible==="decoupe"){
    if(!Array.isArray(S.board.cutouts))S.board.cutouts=[];
    const D=boardDisquePts(g.c.x,g.c.y,g.r);
    S.board.cutouts.push(D);boardChanged();
    if(!S.sel.decoupes)S.sel.decoupes=new Set();S.sel.decoupes.add(D);
    res={decoupe:D};
  }else if(cible==="cuivre"){
    const l=S.active, w=defaultWidth("",l), A={x:g.c.x+g.r*Math.cos(g.a1),y:g.c.y+g.r*Math.sin(g.a1)};
    const parts=plein?[g.ca/2,g.ca/2]:[g.ca];
    let a=g.a1, P=A;
    res={tracks:[]};
    for(const ca of parts){
      a+=ca;
      const B={x:g.c.x+g.r*Math.cos(a),y:g.c.y+g.r*Math.sin(a)};
      const t={l,net:"",w,x1:r3(P.x),y1:r3(P.y),x2:r3(B.x),y2:r3(B.y),ca:r4(ca)};
      S.tracks.push(t);S.sel.tracks.add(t);res.tracks.push(t);P=B;
    }
  }else{
    const layer=cible==="silk"?"silk"+dessinFace():cible;
    if(!S.sel.drawings)S.sel.drawings=new Set();
    res={drawings:[]};
    // un vrai trait en arc (drwArc, 01-core.js) ; un cercle : deux demi-arcs
    let a=g.a1, P={x:g.c.x+g.r*Math.cos(a),y:g.c.y+g.r*Math.sin(a)};
    for(const ca of (plein?[g.ca/2,g.ca/2]:[g.ca])){
      a+=ca;
      const B={x:g.c.x+g.r*Math.cos(a),y:g.c.y+g.r*Math.sin(a)};
      const d={id:S.nextId++,shape:"line",type:"line",layer,x1:r4(P.x),y1:r4(P.y),x2:r4(B.x),y2:r4(B.y),ca:r4(ca),width:0.15};
      S.drawings.push(d);S.sel.drawings.add(d.id);res.drawings.push(d);P=B;
    }
  }
  touch();refreshPanels();draw();
  hint((plein?"Cercle":"Arc")+" de rayon "+fmt(g.r,3)+" mm posé — Ctrl+Z annule.");
  return res;
}

/* ---------- texte sur cuivre ---------- */
/* une gélule (trait épais à bouts ronds) en polygone, pour creuser un texte inversé */
function geluleTrait(a,b,w){
  const r=w/2, ang=Math.atan2(b.y-a.y,b.x-a.x), out=[];
  for(let k=0;k<=6;k++){const t=ang+Math.PI/2+Math.PI*k/6;out.push({x:r4(b.x+r*Math.cos(t)),y:r4(b.y+r*Math.sin(t))});}
  for(let k=0;k<=6;k++){const t=ang-Math.PI/2+Math.PI*k/6;out.push({x:r4(a.x+r*Math.cos(t)),y:r4(a.y+r*Math.sin(t))});}
  return out;
}
/* `o` : {texte, x, y, h, ep, inverse, marge, l}. Le texte droit est fait de pistes
   sans net (le DRC, les zones et le Gerber le voient comme du cuivre) ; inversé,
   c'est une zone sans net, prioritaire, d'où les lettres sont découpées. */
function texteCuivre(o){
  const txt=texteSpecial(o.texte).trim();
  if(!txt){hint("Texte vide.");return null;}
  const l=o.l==null?S.active:o.l, h=clamp(+o.h||1.5,0.3,50), ep=clamp(+o.ep||h/8,0.08,5);
  const miroir=l===S.cu-1&&S.cu>1;              // dessous : il se lit depuis la face de dessous
  const traits=textStrokes(txt,o.x,o.y,h,miroir,+o.rot||0);
  if(!traits.length){hint("Aucun caractère dessinable dans ce texte.");return null;}
  push();clearSel();
  const segs=[];
  for(const P of traits)for(let k=0;k+1<P.length;k++)segs.push([P[k],P[k+1]]);
  let res;
  if(!o.inverse){
    res={tracks:[]};
    for(const [a,b] of segs){
      if(dist(a.x,a.y,b.x,b.y)<1e-6)continue;
      const t={l,net:"",w:r4(ep),x1:r4(a.x),y1:r4(a.y),x2:r4(b.x),y2:r4(b.y)};
      S.tracks.push(t);S.sel.tracks.add(t);res.tracks.push(t);
    }
  }else{
    const m=Math.max(0,+o.marge||0.5)+ep/2;
    let x1=1e9,y1=1e9,x2=-1e9,y2=-1e9;
    for(const P of traits)for(const p of P){x1=Math.min(x1,p.x);y1=Math.min(y1,p.y);x2=Math.max(x2,p.x);y2=Math.max(y2,p.y);}
    x1=r3(x1-m);y1=r3(y1-m);x2=r3(x2+m);y2=r3(y2+m);
    const z={id:S.nextId++,l,net:"",pts:[{x:x1,y:y1},{x:x2,y:y1},{x:x2,y:y2},{x:x1,y:y2}],
             priorite:Math.max(0,...S.zones.filter(q=>q.l===l&&!q.larme).map(zonePrio))+1,
             nom:"Texte inversé « "+txt.slice(0,40)+" »"};
    S.zones.push(z);S.sel.zones.add(z);
    res={zone:z,cuts:[]};
    for(const [a,b] of segs){
      const ct={id:S.nextId++,l,pts:geluleTrait(a,b,ep)};
      S.cuts.push(ct);S.sel.cuts.add(ct);res.cuts.push(ct);
    }
  }
  touch();refreshPanels();draw();
  hint("Texte « "+txt+" » posé sur "+cuId(l,S.cu)+(o.inverse?" en réserve dans un aplat de cuivre":"")+
       (miroir?" (en miroir : il se lit par-dessous)":"")+" — Ctrl+Z annule.");
  return res;
}
function texteCuivreDialogue(x,y){
  const d=document.createElement("dialog");
  d.className="ed-dlg";
  d.innerHTML='<div class="mtitle">Texte sur cuivre · '+esc(cuId(S.active,S.cu))+'</div>'+
    '<div class="prop"><label>Texte (chaînes spéciales : .Date .Titre .Revision .Couches…)</label><input id="tcT" value="TEXTE"></div>'+
    '<div class="prop two"><div><label>Hauteur (mm)</label><input id="tcH" type="number" step="0.1" value="1.5"></div>'+
    '<div><label>Épaisseur du trait (mm)</label><input id="tcE" type="number" step="0.05" value="0.2"></div></div>'+
    '<div class="prop two"><div><label>Angle (°)</label><input id="tcR" type="number" step="90" value="0"></div>'+
    '<div><label><input id="tcI" type="checkbox"> Inversé (en réserve)</label></div></div>'+
    '<div class="row"><button class="tb" id="tcNon">Annuler</button><button class="tb" id="tcOui">Poser</button></div>';
  document.body.appendChild(d);
  const q=id=>d.querySelector("#"+id), n=id=>parseFloat(String(q(id).value).replace(",","."));
  const fermer=()=>{d.close();d.remove();};
  q("tcNon").onclick=fermer;
  d.addEventListener("cancel",e=>{e.preventDefault();fermer();});
  q("tcOui").onclick=()=>{
    const o={texte:q("tcT").value,x,y,h:n("tcH"),ep:n("tcE"),rot:n("tcR")||0,inverse:q("tcI").checked};
    fermer();texteCuivre(o);
  };
  d.showModal();
  q("tcT").select&&q("tcT").select();
}

/* ---------- pastille libre ---------- */
const PASTILLES_LIBRES={
  cms:{pre:"TP",pkg:"TestPoint",pad:{shape:"circ",w:1.2,h:1.2,drill:0,noPaste:true}},
  traversante:{pre:"TP",pkg:"TestPoint_THT",pad:{shape:"circ",w:1.8,h:1.8,drill:1.0}},
  fiducial:{pre:"FID",pkg:"Fiducial",pad:{shape:"circ",w:1.0,h:1.0,drill:0,mask:0.5,noPaste:true},sansNet:true}
};
function pastilleLibre(x,y,type,net){
  const T=PASTILLES_LIBRES[type]||PASTILLES_LIBRES.cms;
  const r=Math.max(T.pad.w,T.pad.h)/2+(T.pad.mask||0);
  const f=normFp({ref:freeFpRef(T.pre,new Set(S.fps.map(o=>o.ref))),value:"",pkg:T.pkg,pins:1,
    pads:[Object.assign({n:1,x:0,y:0,rot:0},T.pad)],body:{x1:-r,y1:-r,x2:r,y2:r},
    nets:{1:T.sansNet?"":(net||"")},x:snapX(x),y:snapY(y),side:T.pad.drill>0?0:(S.active===S.cu-1&&S.cu>1?1:0)},0);
  if(!f)return null;
  f.id=S.nextId++;f.libre=true;f.silk=false;
  push();
  S.fps.push(f);clearSel();S.sel.fps.add(f.id);
  touch();refreshPanels();draw();
  hint(f.ref+" posée"+(f.nets[1]?" sur le net "+f.nets[1]:"")+
       " — hors schéma, l'ECO la laisse en place ; son net se change dans les Propriétés de la pastille.");
  return f;
}

/* ---------- cote linéaire ---------- */
/* De A à B, la ligne de cote passant par P. Rend les dessins créés. */
function coteLineaire(A,B,P,layer){
  const L=dist(A.x,A.y,B.x,B.y);
  if(L<1e-3){hint("Les deux points de la cote sont confondus.");return null;}
  const ux_=(B.x-A.x)/L, uy_=(B.y-A.y)/L, nx=-uy_, ny=ux_;
  const off=(P.x-A.x)*nx+(P.y-A.y)*ny, s=off<0?-1:1, depasse=0.8*s;
  const A2={x:A.x+nx*off,y:A.y+ny*off}, B2={x:B.x+nx*off,y:B.y+ny*off};
  const w=0.12, fl=Math.min(1,L/4), lay=layer||S.coteCouche||"dwgs";
  const traits=[[A,{x:A2.x+nx*depasse,y:A2.y+ny*depasse}],[B,{x:B2.x+nx*depasse,y:B2.y+ny*depasse}],[A2,B2]];
  for(const [p,sg] of [[A2,1],[B2,-1]])
    for(const k of [1,-1]){
      const a=Math.atan2(uy_,ux_)+(sg>0?0:Math.PI)+k*0.35;
      traits.push([p,{x:p.x+Math.cos(a)*fl,y:p.y+Math.sin(a)*fl}]);
    }
  push();clearSel();
  if(!S.sel.drawings)S.sel.drawings=new Set();
  const res=[];
  for(const [a,b] of traits){
    if(dist(a.x,a.y,b.x,b.y)<1e-4)continue;
    const d={id:S.nextId++,shape:"line",type:"line",layer:lay,x1:r4(a.x),y1:r4(a.y),x2:r4(b.x),y2:r4(b.y),width:w};
    S.drawings.push(d);S.sel.drawings.add(d.id);res.push(d);
  }
  let rot=Math.atan2(uy_,ux_)*180/Math.PI;
  if(rot>90)rot-=180;if(rot<=-90)rot+=180;
  const h=1.2, M={x:(A2.x+B2.x)/2+nx*s*(h*0.9),y:(A2.y+B2.y)/2+ny*s*(h*0.9)};
  const t={id:S.nextId++,shape:"text",type:"text",layer:lay,text:fmtU(L)+" "+uNom(),
           x1:r4(M.x),y1:r4(M.y),x2:r4(M.x),y2:r4(M.y),size:h,height:h,rot:r4(rot),width:0.12};
  S.drawings.push(t);S.sel.drawings.add(t.id);res.push(t);
  touch();refreshPanels();draw();
  hint("Cote de "+fmtU(L)+" "+uNom()+" posée sur « "+lay+" » — Ctrl+Z annule.");
  return res;
}

/* ---------- les gestes ---------- */
function dessinClic(x,y,e){
  const m=S.mode;
  if(!DESSIN_MODES[m])return false;
  const p=dPt(x,y), D=S.dessinDraft;
  if(m==="texteCu"){texteCuivreDialogue(p.x,p.y);return true;}
  if(m==="pastille"){pastilleLibre(p.x,p.y,S.pastilleType,S.hlNet||"");return true;}
  if(m==="arc"){
    if(!D){S.dessinDraft={pts:[p],cur:p};return true;}
    D.pts.push(p);
    if(S.arcForme==="cercle"&&D.pts.length===2){S.dessinDraft=null;arcPoser(arcGeom(D.pts[0],D.pts[1],null));}
    else if(D.pts.length===3){S.dessinDraft=null;arcPoser(arcGeom(D.pts[0],D.pts[1],D.pts[2],e&&e.shiftKey));}
    return true;
  }
  if(m==="cote"){
    if(!D){S.dessinDraft={pts:[p],cur:p};return true;}
    D.pts.push(p);
    if(D.pts.length===3){S.dessinDraft=null;coteLineaire(D.pts[0],D.pts[1],D.pts[2]);}
    return true;
  }
  return false;
}
function dessinBouge(x,y,e){
  if(!DESSIN_MODES[S.mode]||!S.dessinDraft)return false;
  S.dessinDraft.cur=dPt(x,y);S.dessinDraft.inv=!!(e&&e.shiftKey);
  return true;
}
function dessinAnnuler(){
  if(!S.dessinDraft)return false;
  S.dessinDraft=null;hint(DESSIN_MODES[S.mode]+" abandonné.");draw();return true;
}
function dessinApercu(c){
  const D=S.dessinDraft;
  if(!D||!DESSIN_MODES[S.mode])return;
  const P=D.pts.concat([D.cur]);
  c.save();c.strokeStyle=C_SEL;c.fillStyle=C_SEL;c.lineWidth=px(1.4);c.setLineDash([px(4),px(3)]);
  if(S.mode==="arc"&&P.length>=2){
    const g=arcGeom(P[0],P[1],S.arcForme==="cercle"||P.length<3?null:P[2],D.inv);
    const Q=arcPoints(g,3);
    c.beginPath();c.moveTo(Q[0].x,Q[0].y);for(const q of Q)c.lineTo(q.x,q.y);c.stroke();
    c.beginPath();c.moveTo(P[0].x,P[0].y);c.lineTo(P[1].x,P[1].y);c.stroke();
  }else if(S.mode==="cote"){
    c.beginPath();c.moveTo(P[0].x,P[0].y);for(const q of P.slice(1))c.lineTo(q.x,q.y);c.stroke();
  }
  c.setLineDash([]);
  for(const q of D.pts){c.beginPath();c.arc(q.x,q.y,px(3),0,Math.PI*2);c.fill();}
  c.restore();
}

/* ---------- branchement ---------- */
(function(){
  const on=(id,f)=>{const b=$(id);if(b)b.onclick=f;};
  on("mArc",()=>dessinOutil("arc",{arcForme:"arc"}));
  on("mCercle",()=>dessinOutil("arc",{arcForme:"cercle"}));
  on("mTexteCu",()=>dessinOutil("texteCu"));
  on("mPastille",()=>dessinOutil("pastille"));
  on("mCote",()=>dessinOutil("cote"));
  const sel=(id,cle)=>{const s=$(id);if(s)s.onchange=()=>{S[cle]=s.value;if(cle==="pastilleType")dessinOutil("pastille");};};
  sel("arcCible","arcCible");
  sel("pastilleType","pastilleType");
  sel("coteCouche","coteCouche");
})();
