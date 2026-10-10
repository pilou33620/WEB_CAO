"use strict";
/* ==========================================================================
   Éditeur PCB — Draftsman : cotes à la main, vues à la souris, détails
   --------------------------------------------------------------------------
   29-draftsman.js calcule les feuilles ; ce fichier y ajoute ce qu'un
   dessinateur pose lui-même, et la fenêtre où il le pose.

     · COTES ACCROCHÉES À LA GÉOMÉTRIE. Horizontale, verticale, alignée,
       diamètre ou rayon : on clique des points qui s'aimantent sur la carte
       (centre d'un trou de fixation ou d'un via, centre ou bord d'une
       pastille, sommet ou bord du contour et des découpes), puis on place la
       ligne. La cote retient la RÉFÉRENCE, jamais la coordonnée :
           {type:"trou", id}          {type:"via", id}
           {type:"pastille", fp:"J1", pad:"3", ou:"c"|"g"|"d"|"h"|"b"}
           {type:"contour", i, c?}    {type:"bord", i, t, c?}
       (`c` : l'indice d'une découpe, absent pour le contour extérieur ; `ou` :
       centre, ou bord gauche / droit / haut / bas de la pastille ; `t` : la
       position sur le côté i → i+1). Le connecteur déplacé, la cote suit et
       sa valeur change. La référence disparue (repère renommé, trou effacé),
       la cote n'est pas fausse en silence : elle se dessine en ROUGE, en
       tirets, « (orpheline) », à la dernière place connue (`memo`), et la
       fenêtre la liste.
     · VUES À LA SOURIS. Chaque vue d'une feuille (carte cotée, tableau de
       perçage, coupe d'empilage, notes, nomenclature, assemblage…) se
       glisse ; sa position est celle du coin haut gauche de sa boîte,
       aimantée sur une grille de 2,5 mm, gardée dans le cadre et hors du
       cartouche. « Replacer automatiquement » rend la disposition calculée.
     · VUES DE DÉTAIL. Un cercle ou un rectangle tracé sur une vue de la
       carte devient une vue agrandie à l'échelle choisie (2:1, 5:1, 10:1…),
       posée là où la feuille a de la place et déplaçable comme les autres ;
       la vue mère porte le repère « A », le détail son étiquette « DÉTAIL A —
       ÉCHELLE 5:1 », et sa géométrie est découpée à la fenêtre (Sutherland-
       Hodgman pour ce qui est plein, Cyrus-Beck pour les traits). Les cotes
       s'y posent aussi.

   Tout est dans le document, `S.dessin` : `cotes` (liste), `vues` (clé de
   vue → {x,y}), `details` (liste). Une clé de vue nomme la feuille et la
   vue : « fab/carte », « fab/percage », « fab~1/notes » (première suite),
   « asmT/carte », « cu0/carte », « det/7 » (le détail n° 7).
   ========================================================================== */

const DF_GRILLE=2.5;                      // aimant des vues, en mm de feuille
const DF_ROUGE=[0.82,0.08,0.08];          // cote orpheline
const DF_ECH_DETAIL=[2,3,4,5,10,20];
const DF_COTES={h:"Cote horizontale",v:"Cote verticale",a:"Cote alignée",d:"Diamètre",r:"Rayon"};
const DF_NOMS_VUES={carte:"Vue de la carte",percage:"Tableau de perçage",fixation:"Trous de fixation",
  impedances:"Impédances contrôlées",empilage:"Coupe d'empilage",notes:"Notes de fabrication",
  nomenclature:"Nomenclature",nonmontes:"Non montés",detail:"Vue de détail"};
const DF_CLE_RE=/^[A-Za-z0-9~_\/-]{1,40}$/;

/* ==========================================================================
   Normalisation : ce que dfCfg() relit du document
   ========================================================================== */
function dfEnt(v,min,max){const n=+v;return Number.isInteger(n)&&n>=min&&n<=max?n:null;}
function dfNb(v,min,max,def){const n=+v;return v!=null&&v!==""&&Number.isFinite(n)?clamp(n,min,max):def;}
function dfNormRef(r){
  if(!r||typeof r!=="object")return null;
  const t=r.type;
  if(t==="trou"||t==="via"){
    const id=dfEnt(r.id,1,Number.MAX_SAFE_INTEGER);
    return id==null?null:{type:t,id};
  }
  if(t==="pastille"){
    const fp=String(r.fp==null?"":r.fp).slice(0,64), pad=String(r.pad==null?"":r.pad).slice(0,16);
    if(!fp||!pad)return null;
    return {type:t,fp,pad,ou:typeof r.ou==="string"&&r.ou.length===1&&"cgdhb".indexOf(r.ou)>=0?r.ou:"c"};
  }
  if(t==="contour"||t==="bord"){
    const i=dfEnt(r.i,0,1e5);
    if(i==null)return null;
    const o={type:t,i}, c=dfEnt(r.c,0,1e4);
    if(c!=null)o.c=c;
    if(t==="bord")o.t=dfNb(r.t,0,1,0.5);
    return o;
  }
  return null;
}
function dfNormPt(p,avecD){
  if(!p||typeof p!=="object"||!Number.isFinite(+p.x)||!Number.isFinite(+p.y))return null;
  const o={x:+p.x,y:+p.y};
  if(avecD&&Number.isFinite(+p.d)&&+p.d>0)o.d=+p.d;
  return o;
}
function dfNormCotes(src){
  const out=[], vus=new Set();
  for(const c of (Array.isArray(src)?src:[]).slice(0,500)){
    if(!c||typeof c!=="object"||!Object.prototype.hasOwnProperty.call(DF_COTES,c.type))continue;
    const id=dfEnt(c.id,1,1e9);
    if(id==null||vus.has(id)||typeof c.vue!=="string"||!DF_CLE_RE.test(c.vue))continue;
    const deux=c.type!=="d"&&c.type!=="r";
    const a=dfNormRef(c.a), b=deux?dfNormRef(c.b):null;
    if(!a||(deux&&!b))continue;
    vus.add(id);
    const o={id,vue:c.vue,type:c.type,a};
    if(b)o.b=b;
    o.dx=dfNb(c.dx,-1000,1000,0);o.dy=dfNb(c.dy,-1000,1000,0);
    /* la dernière place connue : de quoi dessiner encore une orpheline */
    const m=c.memo;
    if(m&&typeof m==="object"&&Number.isFinite(+m.v)){
      const ma=dfNormPt(m.a,true), mb=deux?dfNormPt(m.b):null;
      if(ma&&(!deux||mb)&&(deux||ma.d))o.memo=deux?{a:ma,b:mb,v:+m.v}:{a:ma,v:+m.v};
    }
    out.push(o);
  }
  return out;
}
function dfNormVues(src){
  const out={};
  if(!src||typeof src!=="object"||Array.isArray(src))return out;
  let n=0;
  for(const k of Object.keys(src)){
    if(n>=300)break;
    const p=src[k];
    if(!DF_CLE_RE.test(k)||!p||typeof p!=="object"||!Number.isFinite(+p.x)||!Number.isFinite(+p.y))continue;
    out[k]={x:clamp(+p.x,-1000,2000),y:clamp(+p.y,-1000,2000)};
    n++;
  }
  return out;
}
function dfLettreLibre(prises){
  for(let i=0;;i++){
    const l=i<26?String.fromCharCode(65+i):String.fromCharCode(65+i%26)+Math.floor(i/26);
    if(!prises.has(l))return l;
  }
}
function dfNormDetails(src){
  const out=[], ids=new Set(), lettres=new Set();
  for(const d of (Array.isArray(src)?src:[]).slice(0,52)){
    if(!d||typeof d!=="object")continue;
    const id=dfEnt(d.id,1,1e9);
    if(id==null||ids.has(id))continue;
    /* un détail agrandit une vue de la carte, pas un autre détail */
    if(typeof d.source!=="string"||!DF_CLE_RE.test(d.source)||/^det\//.test(d.source))continue;
    if(!Number.isFinite(+d.x)||!Number.isFinite(+d.y))continue;
    let lettre=String(d.lettre==null?"":d.lettre).toUpperCase().replace(/[^A-Z0-9]/g,"").slice(0,3);
    if(!lettre||lettres.has(lettre))lettre=dfLettreLibre(lettres);
    ids.add(id);lettres.add(lettre);
    const forme=d.forme==="rect"?"rect":"cercle";
    const o={id,lettre,source:d.source,forme,x:clamp(+d.x,-1e4,1e4),y:clamp(+d.y,-1e4,1e4),
             echelle:dfNb(d.echelle,1,100,5)};
    if(forme==="cercle")o.r=dfNb(d.r,0.2,500,5);
    else{o.w=dfNb(d.w,0.2,1000,10);o.h=dfNb(d.h,0.2,1000,10);}
    out.push(o);
  }
  return out;
}

/* ==========================================================================
   Écriture : chaque geste est un pas d'historique (Ctrl+Z)
   ========================================================================== */
function dfEcrire(fn){
  if(typeof push==="function")push();
  const c=dfCfg();
  const r=fn(c);
  S.dessin=c;
  S.dessin=dfCfg();               // ce qui vient d'être posé repasse par les bornes
  S.dirty=true;
  return r;
}
function dfIdLibre(c){
  let m=0;
  for(const x of c.cotes)m=Math.max(m,x.id);
  for(const x of c.details)m=Math.max(m,x.id);
  return m+1;
}
/* `o` : {vue, type, a, b?, dx, dy}. Rend l'identifiant, ou null si la cote
   n'a pas de sens (référence mal formée, type inconnu). */
function dfAjouterCote(o){
  const essai=dfNormCotes([Object.assign({},o,{id:1})])[0];
  if(!essai)return null;
  return dfEcrire(c=>{
    const id=dfIdLibre(c), cote=Object.assign(essai,{id});
    const m=dfMesurer(cote);
    if(m)cote.memo=m.memo;
    c.cotes.push(cote);
    return id;
  });
}
function dfModifierCote(id,champs){
  return dfEcrire(c=>{
    const x=c.cotes.find(k=>k.id===id);
    if(x)Object.assign(x,champs);
    return !!x;
  });
}
function dfDeplacerCote(id,ddx,ddy){
  const x=dfCfg().cotes.find(k=>k.id===id);
  return x?dfModifierCote(id,{dx:x.dx+ddx,dy:x.dy+ddy}):false;
}
function dfSupprimerCote(id){
  return dfEcrire(c=>{
    const n=c.cotes.length;
    c.cotes=c.cotes.filter(k=>k.id!==id);
    return c.cotes.length<n;
  });
}
/* `o` : {source, forme:"cercle"|"rect", x, y, r | w,h, echelle} en mm de carte. */
function dfAjouterDetail(o){
  if(!dfNormDetails([Object.assign({},o,{id:1})]).length)return null;
  return dfEcrire(c=>{
    const id=dfIdLibre(c);
    const lettre=dfLettreLibre(new Set(c.details.map(d=>d.lettre)));
    c.details.push(Object.assign({},o,{id,lettre}));
    return id;
  });
}
/* Le détail part avec ses cotes et sa position. */
function dfSupprimerDetail(id){
  return dfEcrire(c=>{
    const n=c.details.length, cle="det/"+id;
    c.details=c.details.filter(d=>d.id!==id);
    c.cotes=c.cotes.filter(k=>k.vue!==cle);
    delete c.vues[cle];
    return c.details.length<n;
  });
}
/* Position d'une vue : le coin haut gauche de sa boîte, aimanté sur la
   grille. Le cadre et le cartouche sont respectés au dessin (dfBorner),
   d'après la boîte du moment. */
function dfPlacerVue(cle,x,y){
  if(!DF_CLE_RE.test(String(cle)))return false;
  return dfEcrire(c=>{
    c.vues[cle]={x:Math.round(x/DF_GRILLE)*DF_GRILLE,y:Math.round(y/DF_GRILLE)*DF_GRILLE};
    return true;
  });
}
/* Sans argument, toutes les vues reviennent à la disposition calculée ;
   sinon celles dont la clé est donnée. */
function dfReplacer(cles){
  return dfEcrire(c=>{
    if(!cles)c.vues={};
    else for(const k of cles)delete c.vues[k];
    return true;
  });
}
/* Une carte vide (Fichier → Nouveau) n'a plus rien à coter : cotes, détails
   et positions décrivaient la carte d'avant. Le cartouche reste. */
function dfOublierCarte(){
  if(!S.dessin||typeof S.dessin!=="object")return;
  delete S.dessin.cotes;delete S.dessin.details;delete S.dessin.vues;
}

/* ==========================================================================
   Références : de la géométrie de la carte à un point
   ========================================================================== */
function dfDiamPastille(q){return q.drill>0?q.drill:(q.shape==="circ"?Math.max(q.w,q.h):0);}
function dfPolyRef(ref){return ref.c==null?boardPoly():(boardCutouts()[ref.c]||null);}
function dfBoitePts(pts){
  let x1=Infinity,y1=Infinity,x2=-Infinity,y2=-Infinity;
  for(const p of pts){x1=Math.min(x1,p.x);y1=Math.min(y1,p.y);x2=Math.max(x2,p.x);y2=Math.max(y2,p.y);}
  return {x1,y1,x2,y2};
}
/* Le point (en mm de carte) que vise une référence, avec le diamètre du trou
   quand il y en a un ; null si la référence ne mène plus à rien. */
function dfResoudre(ref){
  if(!ref)return null;
  if(ref.type==="trou"){
    const h=(S.holes||[]).find(h=>h.id===ref.id);
    return h?{x:h.x,y:h.y,d:h.d}:null;
  }
  if(ref.type==="via"){
    const v=S.vias.find(v=>v.id===ref.id);
    return v?{x:v.x,y:v.y,d:v.drill}:null;
  }
  if(ref.type==="pastille"){
    const fp=S.fps.find(f=>String(f.ref)===ref.fp);
    const q=fp&&padsWorld(fp).find(q=>String(q.n)===ref.pad);
    if(!q)return null;
    if(ref.ou==="c")return {x:q.x,y:q.y,d:dfDiamPastille(q)};
    const b=dfBoitePts(dfPadForme(q));
    return ref.ou==="g"?{x:b.x1,y:q.y}:ref.ou==="d"?{x:b.x2,y:q.y}:
           ref.ou==="h"?{x:q.x,y:b.y1}:{x:q.x,y:b.y2};
  }
  if(ref.type==="contour"||ref.type==="bord"){
    const P=dfPolyRef(ref);
    if(!P||ref.i>=P.length)return null;
    if(ref.type==="contour")return {x:P[ref.i].x,y:P[ref.i].y};
    const a=P[ref.i], b=P[(ref.i+1)%P.length];
    return {x:a.x+(b.x-a.x)*ref.t,y:a.y+(b.y-a.y)*ref.t};
  }
  return null;
}
function dfRefTexte(ref){
  if(!ref)return "?";
  const OU={c:"centre",g:"bord gauche",d:"bord droit",h:"bord haut",b:"bord bas"};
  if(ref.type==="trou")return "trou de fixation n° "+ref.id;
  if(ref.type==="via")return "via n° "+ref.id;
  if(ref.type==="pastille")return ref.fp+"."+ref.pad+" ("+OU[ref.ou]+")";
  const ou=ref.c==null?"contour":"découpe "+(ref.c+1);
  return ref.type==="contour"?ou+", sommet "+(ref.i+1):ou+", côté "+(ref.i+1);
}
/* La mesure d'une cote, ou null si elle est orpheline. `memo` en garde la
   trace, arrondie au dix-millième. */
function dfMesurer(c){
  const diam=c.type==="d"||c.type==="r";
  const a=dfResoudre(c.a), b=diam?null:dfResoudre(c.b);
  if(!a||(!diam&&!b)||(diam&&!(a.d>0)))return null;
  const v=c.type==="h"?Math.abs(b.x-a.x):c.type==="v"?Math.abs(b.y-a.y):
          c.type==="a"?Math.hypot(b.x-a.x,b.y-a.y):c.type==="d"?a.d:a.d/2;
  const q=x=>Math.round(x*1e4)/1e4;
  const memo=diam?{a:{x:q(a.x),y:q(a.y),d:q(a.d)},v:q(v)}
                 :{a:{x:q(a.x),y:q(a.y)},b:{x:q(b.x),y:q(b.y)},v:q(v)};
  return {a,b,v,memo};
}
/* Ranger la dernière place connue dans le document lui-même (et non dans la
   copie bornée de dfCfg) : si la référence disparaît plus tard, l'orpheline
   se dessine là où on l'a vue en dernier. */
function dfRetenir(id,memo){
  const L=S.dessin&&Array.isArray(S.dessin.cotes)?S.dessin.cotes:null;
  const c=L&&L.find(x=>x&&x.id===id);
  if(c&&JSON.stringify(c.memo)!==JSON.stringify(memo))c.memo=memo;
}
/* Les points d'accroche de la carte, en mm de carte. */
function dfAccroches(){
  if(typeof viaIds==="function")viaIds();     // un via accroché doit avoir un nom
  const out=[];
  (S.holes||[]).forEach(h=>{if(h.d>0)out.push({ref:{type:"trou",id:h.id},x:h.x,y:h.y,d:h.d,lib:"trou de fixation Ø"+dfMm(h.d)});});
  for(const v of S.vias)
    if(v.id)out.push({ref:{type:"via",id:v.id},x:v.x,y:v.y,d:v.drill,lib:"via"+(v.net?" "+v.net:"")});
  for(const fp of S.fps){
    if(!fp.ref)continue;
    for(const q of padsWorld(fp)){
      if(q.n==null||q.n==="")continue;
      const pad=String(q.n), nom=fp.ref+"."+pad, R=ou=>({type:"pastille",fp:String(fp.ref),pad,ou});
      const b=dfBoitePts(dfPadForme(q));
      out.push({ref:R("c"),x:q.x,y:q.y,d:dfDiamPastille(q),lib:nom+" (centre)"},
               {ref:R("g"),x:b.x1,y:q.y,lib:nom+" (bord gauche)"},{ref:R("d"),x:b.x2,y:q.y,lib:nom+" (bord droit)"},
               {ref:R("h"),x:q.x,y:b.y1,lib:nom+" (bord haut)"},{ref:R("b"),x:q.x,y:b.y2,lib:nom+" (bord bas)"});
    }
  }
  [boardPoly(),...boardCutouts()].forEach((P,k)=>P.forEach((p,i)=>{
    const ref={type:"contour",i};
    if(k)ref.c=k-1;
    out.push({ref,x:p.x,y:p.y,lib:(k?"découpe "+k:"contour")+", sommet "+(i+1)});
  }));
  return out;
}

/* ==========================================================================
   Vues : des plages d'objets de la feuille
   ========================================================================== */
function dfCleVue(F,nom){return F.genre+(F.suite?"~"+F.suite:"")+"/"+nom;}
function dfVueDebut(F){return {i:F.items.length,s:F.signets.length};}
/* `o.V` : la transformation carte → feuille d'une vue de la carte ; `o.dessin`
   (G,W) : redessine sa géométrie sous une autre transformation — c'est ce
   que découpe une vue de détail. */
function dfVueFin(F,m,cle,nom,o){
  const v=Object.assign({cle,nom,i0:m.i,i1:F.items.length,s0:m.s,s1:F.signets.length,dx:0,dy:0},o||{});
  F.vues.push(v);
  return v;
}
function dfVueBlocs(nom,blocs){for(const b of blocs)b.vue=nom;return blocs;}
function dfVersFeuille(v){return (x,y)=>{const p=v.V.T(x,y);return {x:p.x+v.dx,y:p.y+v.dy};};}
function dfVersMonde(v,X,Y){return v.V.inv(X-v.dx,Y-v.dy);}
/* Boîte de ce qui se voit (les textes invisibles posés sur les corps n'en
   sont pas : ils ne doivent pas élargir la vue qu'on déplace). */
function dfBoiteItems(F,i0,i1){
  let x1=Infinity,y1=Infinity,x2=-Infinity,y2=-Infinity;
  const aj=(a,b,c,d)=>{if(a<x1)x1=a;if(b<y1)y1=b;if(c>x2)x2=c;if(d>y2)y2=d;};
  for(let i=i0;i<i1;i++){
    const it=F.items[i];
    if(it.t==="p"){const e=(it.lw||0)/2;for(const pts of it.sp)for(const p of pts)aj(p.x-e,p.y-e,p.x+e,p.y+e);}
    else if(it.t==="c")aj(it.x-it.r,it.y-it.r,it.x+it.r,it.y+it.r);
    else if(it.t==="t"&&!it.cache){const b=dfBoiteTexte(it);aj(b.x1,b.y1,b.x2,b.y2);}
  }
  return Number.isFinite(x1)?{x1,y1,x2,y2}:null;
}
/* Gardée sur la vue : une plage close ne change plus que par dfDeplacer, et
   le calque de la fenêtre la redemande à chaque mouvement de souris. */
function dfBoiteVue(F,v){return v.boite||(v.boite=dfBoiteItems(F,v.i0,v.i1));}
/* Translation d'une vue : ses objets, les cibles de la recherche et ses
   signets. Les points sont recopiés : deux objets qui partageraient un
   sommet ne le déplaceraient pas deux fois. */
function dfDeplacer(F,v,dx,dy){
  if(!dx&&!dy)return;
  for(let i=v.i0;i<v.i1;i++){
    const it=F.items[i];
    if(it.t==="cal")continue;
    if(it.t==="p")it.sp=it.sp.map(pts=>pts.map(p=>({x:p.x+dx,y:p.y+dy})));
    else{it.x+=dx;it.y+=dy;}
    if(it.cible)it.cible={x1:it.cible.x1+dx,y1:it.cible.y1+dy,x2:it.cible.x2+dx,y2:it.cible.y2+dy};
  }
  for(let i=v.s0;i<v.s1;i++){const s=F.signets[i];F.signets[i]=Object.assign({},s,{x:s.x+dx,y:s.y+dy});}
  v.dx+=dx;v.dy+=dy;
  if(v.boite)v.boite={x1:v.boite.x1+dx,y1:v.boite.y1+dy,x2:v.boite.x2+dx,y2:v.boite.y2+dy};
}
/* Le coin haut gauche d'une boîte w × h demandé en (x,y), aimanté sur la
   grille, ramené dans le cadre, puis sorti du cartouche par le plus court :
   au-dessus ou à sa gauche. */
function dfBorner(F,w,h,x,y){
  const Z=dfZone(F), C=Z.cart, mg=1;
  x=Math.round(x/DF_GRILLE)*DF_GRILLE;y=Math.round(y/DF_GRILLE)*DF_GRILLE;
  x=w>=Z.x2-Z.x1?Z.x1:clamp(x,Z.x1,Z.x2-w);
  y=h>=Z.y2-Z.y1?Z.y1:clamp(y,Z.y1,Z.y2-h);
  if(x<C.x+C.w&&x+w>C.x-mg&&y<C.y+C.h&&y+h>C.y-mg){
    const choix=[];
    if(C.y-mg-h>=Z.y1)choix.push({x,y:C.y-mg-h});
    if(C.x-mg-w>=Z.x1)choix.push({x:C.x-mg-w,y});
    choix.sort((a,b)=>(Math.abs(a.x-x)+Math.abs(a.y-y))-(Math.abs(b.x-x)+Math.abs(b.y-y)));
    if(choix.length){x=choix[0].x;y=choix[0].y;}
    else y=Z.y1;
  }
  return {x,y};
}
function dfPoserVue(F,v,p){
  const b=dfBoiteVue(F,v);
  if(!b)return;
  const q=dfBorner(F,b.x2-b.x1,b.y2-b.y1,p.x,p.y);
  dfDeplacer(F,v,q.x-b.x1,q.y-b.y1);
  v.place=true;
}
/* Une place pour une boîte w × h : la première, ligne à ligne sur la grille,
   qui ne touche ni une autre vue ni le cartouche ; une feuille pleine, celle
   qui recouvre le moins les autres vues (jamais le cartouche) — la vue se
   déplace ensuite à la main. */
function dfPlaceLibre(F,w,h,v){
  const Z=dfZone(F), C=Z.cart, mg=3;
  const obst=F.vues.filter(u=>u!==v).map(u=>dfBoiteVue(F,u)).filter(Boolean);
  const cart={x1:C.x,y1:C.y-4,x2:C.x+C.w,y2:C.y+C.h};
  const sur=(b,x,y)=>Math.max(0,Math.min(x+w+mg,b.x2)-Math.max(x-mg,b.x1))*
                     Math.max(0,Math.min(y+h+mg,b.y2)-Math.max(y-mg,b.y1));
  let best=null, bc=Infinity;
  for(let y=Z.y1;y+h<=Z.y2;y+=DF_GRILLE)
    for(let x=Z.x1;x+w<=Z.x2;x+=DF_GRILLE){
      let cout=sur(cart,x,y)*1e3;
      for(const b of obst)if(cout<bc)cout+=sur(b,x,y);
      if(cout<bc){bc=cout;best={x,y};if(!cout)return best;}
    }
  return best||dfBorner(F,w,h,Z.x1,Z.y1);
}
/* Après la mise en page calculée : les vues déplacées à la main, puis les
   vues de détail dont la vue mère est sur cette feuille. */
function dfAgencer(F,ctx){
  const cfg=ctx.cfg;
  for(const v of F.vues.slice()){const p=cfg.vues[v.cle];if(p)dfPoserVue(F,v,p);}
  for(const d of cfg.details){
    const src=F.vues.find(v=>v.cle===d.source&&v.dessin);
    if(src)dfDetail(F,ctx,d,src);
  }
}

/* ==========================================================================
   Dessin des cotes posées à la main
   ========================================================================== */
function dfMm(v){return fmt(v,2).replace(".",",");}
/* Géométrie d'une cote linéaire sur la feuille. A, B : les points mesurés ;
   (dx,dy) : où l'on a posé la ligne, depuis leur milieu. La ligne est
   perpendiculaire à l'offset normal, le texte glisse le long d'elle. */
function dfCoteGeom(type,A,B,dx,dy){
  let u;
  if(type==="h")u={x:1,y:0};
  else if(type==="v")u={x:0,y:1};
  else{const L=Math.hypot(B.x-A.x,B.y-A.y);u=L>1e-9?{x:(B.x-A.x)/L,y:(B.y-A.y)/L}:{x:1,y:0};}
  const n={x:-u.y,y:u.x}, M={x:(A.x+B.x)/2,y:(A.y+B.y)/2};
  const off=dx*n.x+dy*n.y, le=dx*u.x+dy*u.y;
  const pied=P=>{const s=(M.x-P.x)*n.x+(M.y-P.y)*n.y+off;return {x:P.x+n.x*s,y:P.y+n.y*s};};
  const A2=pied(A), B2=pied(B);
  let rot=Math.atan2(-u.y,u.x)*180/Math.PI;
  if(rot<=-90)rot+=180;else if(rot>90)rot-=180;        // un texte ne se lit jamais à l'envers
  const ar=rot*Math.PI/180;
  return {u,A2,B2,rot,haut:{x:-Math.sin(ar),y:-Math.cos(ar)},
          C:{x:(A2.x+B2.x)/2+u.x*le,y:(A2.y+B2.y)/2+u.y*le}};
}
/* A, B : points de la feuille ; `rp` : rayon du trou sur la feuille (cote
   de diamètre ou de rayon, B absent). Une orpheline : rouge, en tirets. */
function dfDessinerCote(F,c,A,B,rp,txt,orph){
  const col=orph?DF_ROUGE:0, pt=7.5;
  const o={c:col,cat:"cote",lieu:orph?"cote orpheline":DF_COTES[c.type].toLowerCase()};
  if(c.type==="d"||c.type==="r"){
    /* une ligne de rappel, la flèche sur le bord du trou, le texte sur un
       palier horizontal */
    const L=Math.hypot(c.dx,c.dy), u=L>1e-6?{x:c.dx/L,y:c.dy/L}:{x:0.7071,y:-0.7071};
    const T=L>rp+1?{x:A.x+c.dx,y:A.y+c.dy}:{x:A.x+u.x*(rp+4),y:A.y+u.y*(rp+4)};
    const E={x:A.x+u.x*rp,y:A.y+u.y*rp};
    dfLigne(F,E.x,E.y,T.x,T.y,0.18,col,orph);
    dfFleche(F,E.x,E.y,-u.x,-u.y,col);
    const sg=u.x>=0?1:-1, w=dfLargeur(txt,pt);
    dfLigne(F,T.x,T.y,T.x+sg*(w+1.2),T.y,0.18,col,orph);
    dfTexte(F,txt,T.x+sg*0.6,T.y-0.8,pt,Object.assign({ancre:sg>0?"g":"d"},o));
    return;
  }
  const g=dfCoteGeom(c.type,A,B,c.dx,c.dy), A2=g.A2, B2=g.B2, u=g.u;
  /* lignes d'attache : 1 mm d'écart à la pièce, 1,5 mm au-delà de la cote */
  const attache=(P,Q)=>{
    const vx=Q.x-P.x, vy=Q.y-P.y, L=Math.hypot(vx,vy);
    if(L<1.2)return;
    dfLigne(F,P.x+vx/L,P.y+vy/L,Q.x+vx/L*1.5,Q.y+vy/L*1.5,0.15,col,orph);
  };
  attache(A,A2);attache(B,B2);
  /* abscisses le long de u, depuis A2 : la ligne va de A2 à B2, prolongée
     jusqu'au texte s'il a été poussé dehors */
  const sB=(B2.x-A2.x)*u.x+(B2.y-A2.y)*u.y, sC=(g.C.x-A2.x)*u.x+(g.C.y-A2.y)*u.y;
  const w=dfLargeur(txt,pt), span=Math.abs(sB);
  let s1=Math.min(0,sB), s2=Math.max(0,sB);
  if(span<5){s1-=3;s2+=3;}                       // flèches dehors : elles ne tiennent pas
  if(Math.abs(c.dx*u.x+c.dy*u.y)>0.01){s1=Math.min(s1,sC-w/2-0.5);s2=Math.max(s2,sC+w/2+0.5);}
  const S_=s=>({x:A2.x+u.x*s,y:A2.y+u.y*s});
  const p1=S_(s1), p2=S_(s2);
  dfLigne(F,p1.x,p1.y,p2.x,p2.y,0.18,col,orph);
  if(span>1e-6){
    const k=span<5?-1:1;
    dfFleche(F,A2.x,A2.y,k*(A2.x-B2.x),k*(A2.y-B2.y),col);
    dfFleche(F,B2.x,B2.y,k*(B2.x-A2.x),k*(B2.y-A2.y),col);
  }
  dfTexte(F,txt,g.C.x+g.haut.x,g.C.y+g.haut.y,pt,Object.assign({ancre:"m",rot:g.rot},o));
}
/* Les cotes d'une vue (clé `cle`), sous sa transformation V. Chacune est
   notée dans `F.cotes` avec sa plage d'objets : la fenêtre la retrouve sous
   la souris, et la liste des orphelines en part. */
function dfCotesVue(F,V,cle,cfg){
  for(const c of cfg.cotes){
    if(c.vue!==cle)continue;
    const i0=F.items.length, diam=c.type==="d"||c.type==="r";
    const m=dfMesurer(c);
    if(m)dfRetenir(c.id,m.memo);
    const src=m?{a:m.a,b:m.b,v:m.v}:c.memo, orph=!m;
    if(src){
      const A=V.T(src.a.x,src.a.y), B=diam?null:V.T(src.b.x,src.b.y);
      const txt=(c.type==="d"?"Ø":c.type==="r"?"R":"")+dfMm(src.v)+(orph?" (orpheline)":"");
      dfCalque(F,"COTES");                          // calque du DXF (33-draftsman-export.js)
      dfDessinerCote(F,c,A,B,diam?src.a.d/2*V.k:0,txt,orph);
      dfCalque(F);
    }
    F.cotes.push({id:c.id,vue:cle,i0,i1:F.items.length,orph});
  }
}
/* Le repère d'un détail sur sa vue mère : la zone agrandie et sa lettre. */
function dfRepereDetail(F,V,d){
  const C=V.T(d.x,d.y);
  let lx,ly;
  if(d.forme==="rect"){
    const w=d.w*V.k, h=d.h*V.k;
    dfRect(F,C.x-w/2,C.y-h/2,w,h,{lw:0.3});
    lx=C.x+w/2+0.8;ly=C.y-h/2-0.8;
  }else{
    const r=d.r*V.k;
    dfCercle(F,C.x,C.y,r,{lw:0.3});
    lx=C.x+r*0.71+0.8;ly=C.y-r*0.71-0.8;
  }
  dfTexte(F,d.lettre,lx,ly,10,{gras:true,cat:"detail",lieu:"repère du détail "+d.lettre});
}
/* Ce que les builders de 29-draftsman.js appellent sur chaque vue de la
   carte, avant de la clore : repères des détails, puis cotes. */
function dfAnnoter(F,V,cle,ctx){
  for(const d of ctx.cfg.details)if(d.source===cle)dfRepereDetail(F,V,d);
  dfCotesVue(F,V,cle,ctx.cfg);
}

/* ==========================================================================
   Vues de détail : la géométrie de la vue mère, agrandie et découpée
   ========================================================================== */
function dfSens(W){return W.sens||(W.sens=Math.sign(signedArea(W))||1);}
function dfDansPoly(W,p){
  const s=dfSens(W);
  for(let i=0;i<W.length;i++){
    const a=W[i], b=W[(i+1)%W.length];
    if(s*((b.x-a.x)*(p.y-a.y)-(b.y-a.y)*(p.x-a.x))<-1e-9)return false;
  }
  return true;
}
/* Sutherland-Hodgman : un polygone (plein) contre la fenêtre convexe W. */
function dfCoupePoly(pts,W){
  const s=dfSens(W);
  let out=pts;
  for(let i=0;i<W.length&&out.length;i++){
    const a=W[i], b=W[(i+1)%W.length];
    const cote=p=>s*((b.x-a.x)*(p.y-a.y)-(b.y-a.y)*(p.x-a.x));
    const src=out;
    out=[];
    for(let j=0;j<src.length;j++){
      const p=src[j], q=src[(j+1)%src.length], dp=cote(p), dq=cote(q);
      if(dp>=0)out.push(p);
      if((dp>=0)!==(dq>=0)){const t=dp/(dp-dq);out.push({x:p.x+(q.x-p.x)*t,y:p.y+(q.y-p.y)*t});}
    }
  }
  return out;
}
/* Cyrus-Beck : une ligne brisée ouverte contre W ; rend les morceaux. */
function dfCoupeLigne(pts,W){
  const s=dfSens(W), out=[];
  let cur=null;
  for(let j=0;j+1<pts.length;j++){
    const P=pts[j], Q=pts[j+1], Dx=Q.x-P.x, Dy=Q.y-P.y;
    let t0=0, t1=1, ok=true;
    for(let i=0;i<W.length&&ok;i++){
      const a=W[i], b=W[(i+1)%W.length];
      const nx=-s*(b.y-a.y), ny=s*(b.x-a.x);         // normale intérieure
      const num=nx*(P.x-a.x)+ny*(P.y-a.y), den=nx*Dx+ny*Dy;
      if(Math.abs(den)<1e-12){if(num<0)ok=false;continue;}
      const t=-num/den;
      if(den>0)t0=Math.max(t0,t);else t1=Math.min(t1,t);
      if(t0>t1)ok=false;
    }
    if(!ok){cur=null;continue;}
    const A={x:P.x+Dx*t0,y:P.y+Dy*t0}, B={x:P.x+Dx*t1,y:P.y+Dy*t1};
    if(cur&&t0<=1e-9)cur.push(B);
    else{cur=[A,B];out.push(cur);}
    if(t1<1-1e-9)cur=null;
  }
  return out;
}
/* Un objet de la feuille découpé à W : rend la liste de ce qui en reste.
   Un contour seulement tracé est coupé comme un trait (pas de bord parasite
   le long de la fenêtre) ; un aplat, comme un polygone. Un texte reste s'il
   est ancré dedans. */
function dfDecouper(it,W){
  if(it.t==="cal")return [it];                     // repère de calque DXF (33-draftsman-export.js)
  if(it.t==="t")return dfDansPoly(W,it)?[it]:[];
  const bw=W.boite||(W.boite=dfBoitePts(W));
  if(it.t==="c"){
    if(it.x+it.r<bw.x1||it.x-it.r>bw.x2||it.y+it.r<bw.y1||it.y-it.r>bw.y2)return [];
    const pts=[];
    for(let i=0;i<48;i++){const a=i*Math.PI/24;pts.push({x:it.x+it.r*Math.cos(a),y:it.y+it.r*Math.sin(a)});}
    if(pts.every(p=>dfDansPoly(W,p)))return [it];
    it={t:"p",sp:[pts],ferme:true,lw:it.lw,trait:it.trait,plein:it.plein,tirets:false,eo:false};
  }
  const b=dfBoitePts([].concat(...it.sp));
  if(b.x2<bw.x1||b.x1>bw.x2||b.y2<bw.y1||b.y1>bw.y2)return [];
  if(it.sp.every(pts=>pts.every(p=>dfDansPoly(W,p))))return [it];
  if(it.ferme&&it.plein!=null){
    const sp=it.sp.map(pts=>dfCoupePoly(pts,W)).filter(p=>p.length>=3);
    return sp.length?[Object.assign({},it,{sp})]:[];
  }
  const sp=[];
  for(const pts of it.sp)if(pts.length>=2)sp.push(...dfCoupeLigne(it.ferme?pts.concat([pts[0]]):pts,W));
  return sp.length?[Object.assign({},it,{sp,ferme:false})]:[];
}
/* La fenêtre d'un détail sur la feuille, centrée sur l'origine : un cercle
   (96 côtés, l'écart à l'arc reste sous le centième) ou un rectangle. */
function dfFenetre(d,k){
  if(d.forme==="rect"){
    const w=d.w*k/2, h=d.h*k/2;
    return [{x:-w,y:-h},{x:w,y:-h},{x:w,y:h},{x:-w,y:h}];
  }
  const R=d.r*k, out=[];
  for(let i=0;i<96;i++){const a=i*Math.PI/48;out.push({x:R*Math.cos(a),y:R*Math.sin(a)});}
  return out;
}
/* Le détail est dessiné autour de l'origine, puis posé : à sa place
   enregistrée, sinon à la première place libre de la feuille. Dessous, il
   garde le miroir de sa vue mère. */
function dfDetail(F,ctx,d,src){
  const k=d.echelle, s=src.V.face?-1:1, cle="det/"+d.id;
  const V={k,face:src.V.face,echelle:dfEchelleTxt(k),
    T:(x,y)=>({x:s*(x-d.x)*k,y:(y-d.y)*k}),
    inv:(X,Y)=>({x:d.x+s*X/k,y:d.y+Y/k})};
  const W=dfFenetre(d,k);
  const m=dfVueDebut(F);
  const G={w:F.w,h:F.h,items:[],signets:[],vues:[],cotes:[]};
  src.dessin(G,V);
  for(const it of G.items)for(const r of dfDecouper(it,W))F.items.push(r);
  if(d.forme==="rect")dfPoly(F,W,{ferme:true,lw:0.5});
  else dfCercle(F,0,0,d.r*k,{lw:0.5});
  const bas=d.forme==="rect"?d.h*k/2:d.r*k;
  dfTexte(F,"DÉTAIL "+d.lettre+" — ÉCHELLE "+V.echelle,0,bas+6,8.5,
          {ancre:"m",gras:true,cat:"detail",lieu:"vue de détail"});
  dfCotesVue(F,V,cle,ctx.cfg);
  const v=dfVueFin(F,m,cle,"detail",{V,W,det:d.id});
  const p=ctx.cfg.vues[cle];
  if(p)dfPoserVue(F,v,p);
  else{
    const b=dfBoiteVue(F,v);
    if(b){const q=dfPlaceLibre(F,b.x2-b.x1,b.y2-b.y1,v);dfDeplacer(F,v,q.x-b.x1,q.y-b.y1);}
  }
}

/* ==========================================================================
   Sous la souris : accroche et sélection (en mm de feuille)
   ========================================================================== */
/* La vue de la carte sous (X,Y) : un détail passe devant la vue qu'il
   agrandit. `avecDetails` faux : les vues mères seules (tracé d'un détail). */
function dfVueSous(F,X,Y,avecDetails,tol){
  tol=tol||0;
  for(let i=F.vues.length-1;i>=0;i--){
    const v=F.vues[i];
    if(!v.V)continue;
    if(v.W){if(avecDetails&&dfDansPoly(v.W,{x:X-v.dx,y:Y-v.dy}))return v;continue;}
    const b=dfBoiteVue(F,v);
    if(b&&X>=b.x1-tol&&X<=b.x2+tol&&Y>=b.y1-tol&&Y<=b.y2+tol)return v;
  }
  return null;
}
/* Le point d'accroche le plus proche de (X,Y) à moins de `tol` : d'abord les
   points (trous, vias, pastilles, sommets), à défaut un bord du contour.
   `o.diam` : les trous seuls ; `o.vue` : rester dans cette vue ; `o.acc` :
   la liste déjà calculée. Rend {vue, ref, x, y, lib, d} ou null. */
function dfAccrocher(F,X,Y,tol,o){
  o=o||{};
  let vue=dfVueSous(F,X,Y,true,tol);
  if(o.vue&&(!vue||vue.cle!==o.vue))vue=F.vues.find(v=>v.cle===o.vue&&v.V)||null;
  if(!vue)return null;
  const P=dfVersFeuille(vue);
  const dedans=p=>!vue.W||dfDansPoly(vue.W,{x:p.x-vue.dx,y:p.y-vue.dy});
  let best=null, bd=tol;
  for(const c of (o.acc||dfAccroches())){
    if(o.diam&&!(c.d>0))continue;
    const p=P(c.x,c.y), d=Math.hypot(p.x-X,p.y-Y);
    if(d<bd&&dedans(p)){bd=d;best={ref:c.ref,x:p.x,y:p.y,lib:c.lib,d:c.d};}
  }
  if(!best&&!o.diam)
    [boardPoly(),...boardCutouts()].forEach((Pw,k)=>{
      for(let i=0;i<Pw.length;i++){
        const a=P(Pw[i].x,Pw[i].y), b=P(Pw[(i+1)%Pw.length].x,Pw[(i+1)%Pw.length].y);
        const L2=(b.x-a.x)**2+(b.y-a.y)**2;
        if(L2<1e-12)continue;
        const t=clamp(((X-a.x)*(b.x-a.x)+(Y-a.y)*(b.y-a.y))/L2,0,1);
        const q={x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t}, d=Math.hypot(q.x-X,q.y-Y);
        if(d<bd&&dedans(q)){
          bd=d;
          const ref={type:"bord",i,t:Math.round(t*1e4)/1e4};
          if(k)ref.c=k-1;
          best={ref,x:q.x,y:q.y,lib:k?"bord de la découpe "+k:"bord du contour"};
        }
      }
    });
  if(best)best.vue=vue.cle;
  return best;
}
/* Distance de (X,Y) à ce qui est dessiné dans une plage d'objets. */
function dfDistItems(F,i0,i1,X,Y){
  let d=Infinity;
  for(let i=i0;i<i1;i++){
    const it=F.items[i];
    if(it.t==="p")for(const pts of it.sp)for(let j=0;j+1<pts.length;j++)
      d=Math.min(d,segDist(X,Y,pts[j].x,pts[j].y,pts[j+1].x,pts[j+1].y));
    else if(it.t==="t"&&!it.cache){
      const b=dfBoiteTexte(it);
      d=Math.min(d,Math.hypot(Math.max(b.x1-X,0,X-b.x2),Math.max(b.y1-Y,0,Y-b.y2)));
    }
  }
  return d;
}
/* Ce que vise un clic de sélection : une cote, sinon la plus petite vue
   (un détail d'abord) qui contient le point. */
function dfToucher(F,X,Y,tol){
  let best=null, bd=tol;
  for(const c of F.cotes){
    const d=dfDistItems(F,c.i0,c.i1,X,Y);
    if(d<=bd){bd=d;best={genre:"cote",id:c.id};}
  }
  if(best)return best;
  let ba=Infinity;
  for(const v of F.vues){
    const b=dfBoiteVue(F,v);
    if(!b||X<b.x1||X>b.x2||Y<b.y1||Y>b.y2)continue;
    const a=v.W?-1:(b.x2-b.x1)*(b.y2-b.y1);
    if(a<ba){ba=a;best={genre:"vue",cle:v.cle};}
  }
  return best;
}

/* ==========================================================================
   Fenêtre : les outils de la feuille
   ========================================================================== */
const DF_OUTILS=[
  ["sel","↖","Sélection","glisser une vue ou une cote ; Suppr efface la cote ou le détail choisi, ou replace la vue"],
  ["h","↔","Cote horizontale","deux points accrochés, puis la ligne"],
  ["v","↕","Cote verticale","deux points accrochés, puis la ligne"],
  ["a","⤢","Cote alignée","deux points accrochés, puis la ligne"],
  ["d","Ø","Diamètre","un trou, un via ou une pastille percée, puis le texte"],
  ["r","R","Rayon","un trou, un via ou une pastille percée, puis le texte"],
  ["detC","◯","Détail circulaire","le centre, puis le rayon"],
  ["detR","▭","Détail rectangulaire","deux coins opposés"]];
Object.assign(DF,{outil:"sel",clics:[],sel:null,glisse:null,souris:null,survol:null,ech:5,acc:null,msg:""});

function dfConsigne(){
  const o=DF.outil, n=DF.clics.length;
  if(DF.msg)return DF.msg;
  if(o==="sel")return "Glissez une vue (aimant 2,5 mm, gardée dans le cadre) ou une cote ; Suppr efface la sélection.";
  if(o==="d"||o==="r")return n?"Placez le texte de la cote.":"Cliquez un trou, un via ou une pastille percée.";
  if(o==="detC")return n?"Cliquez pour fixer le rayon.":"Cliquez le centre de la zone à agrandir, sur une vue de la carte.";
  if(o==="detR")return n?"Cliquez le coin opposé.":"Cliquez un coin de la zone à agrandir, sur une vue de la carte.";
  return ["Premier point : centre de trou ou de via, centre ou bord de pastille, sommet ou bord du contour.",
          "Second point.","Placez la ligne de cote."][Math.min(n,2)];
}
function dfDire(t){
  DF.msg=t||"";
  const el=typeof document!=="undefined"&&document.getElementById("dfMsg");
  if(el)el.textContent=dfConsigne();
}
function dfChoisirOutil(o){
  if(!DF_OUTILS.some(x=>x[0]===o))return;
  DF.outil=o;DF.clics=[];DF.glisse=null;DF.survol=null;DF.msg="";
  if(o!=="sel")DF.sel=null;
  if(typeof document!=="undefined"&&DF.doc)dfRendreApercu();
}
function dfAccCache(){return DF.acc||(DF.acc=dfAccroches());}
/* Après une modification : les feuilles refaites tout de suite (pas de
   minuterie : la souris attend de voir ce qu'elle a posé). */
function dfApresEdition(){
  DF.doc=dfDocument();DF.acc=null;
  if(DF.page>=DF.doc.feuilles.length)DF.page=0;
  if(typeof document!=="undefined")dfChercherUi(true);
}
/* Un clic sur la feuille (X,Y en mm), selon l'outil. Séparé des événements
   pour que le banc d'essai pose une cote comme la souris. Rend ce qui a été
   créé ou touché. */
function dfClicFeuille(F,X,Y,tol){
  const o=DF.outil;
  DF.msg="";
  if(DF.clicsP!==DF.page)DF.clics=[];     // un geste ne passe pas d'une feuille à l'autre
  DF.clicsP=DF.page;
  if(o==="sel"){
    const h=dfToucher(F,X,Y,tol);
    DF.sel=h;
    let b=null;
    if(h&&h.genre==="vue"){const v=F.vues.find(v=>v.cle===h.cle);b=v&&dfBoiteVue(F,v);}
    else if(h){const c=F.cotes.find(c=>c.id===h.id);b=c&&dfBoiteItems(F,c.i0,c.i1);}
    DF.glisse=h&&b?{h,b,X0:X,Y0:Y,dx:0,dy:0}:null;
    dfRendreSur();
    return h;
  }
  if(o==="detC"||o==="detR"){
    if(!DF.clics.length){
      const v=dfVueSous(F,X,Y,false);
      if(!v){dfDire("Cliquez sur une vue de la carte.");return null;}
      DF.clics.push({X,Y,vue:v.cle});
      dfRendreSur();
      return null;
    }
    const c0=DF.clics[0], v0=F.vues.find(u=>u.cle===c0.vue);
    DF.clics=[];
    if(!v0)return null;
    const a=dfVersMonde(v0,c0.X,c0.Y), b=dfVersMonde(v0,X,Y);
    const d=o==="detC"?{forme:"cercle",x:a.x,y:a.y,r:Math.hypot(b.x-a.x,b.y-a.y)}
                     :{forme:"rect",x:(a.x+b.x)/2,y:(a.y+b.y)/2,w:Math.abs(b.x-a.x),h:Math.abs(b.y-a.y)};
    if((d.forme==="cercle"?d.r:Math.min(d.w,d.h))<0.2){dfDire("Zone trop petite.");return null;}
    const id=dfAjouterDetail(Object.assign({source:c0.vue,echelle:DF.ech},d));
    DF.outil="sel";DF.sel=id?{genre:"vue",cle:"det/"+id}:null;
    dfApresEdition();
    return id;
  }
  const diam=o==="d"||o==="r", n=DF.clics.length;
  if(n<(diam?1:2)){
    const acc=dfAccrocher(F,X,Y,tol,{diam,acc:dfAccCache(),vue:n?DF.clics[0].vue:null});
    if(!acc){dfDire(diam?"Pas de trou ici.":"Pas de point d'accroche ici.");return null;}
    if(n&&Math.hypot(acc.x-DF.clics[0].x,acc.y-DF.clics[0].y)<1e-6){dfDire("Choisissez un autre point.");return null;}
    DF.clics.push(acc);
    dfRendreSur();
    return null;
  }
  const A=DF.clics[0], B=diam?null:DF.clics[1];
  const M=B?{x:(A.x+B.x)/2,y:(A.y+B.y)/2}:A;
  DF.clics=[];
  const id=dfAjouterCote({vue:A.vue,type:o,a:A.ref,b:B?B.ref:undefined,dx:X-M.x,dy:Y-M.y});
  DF.sel=id?{genre:"cote",id}:null;
  dfApresEdition();
  return id;
}
function dfGlisser(X,Y){
  DF.souris={X,Y};
  const g=DF.glisse;
  if(!g&&DF.outil==="sel")return;          // survol en sélection : rien ne change
  if(g){g.dx=X-g.X0;g.dy=Y-g.Y0;}
  else if(DF.outil!=="sel"&&DF.outil!=="detC"&&DF.outil!=="detR"&&DF.doc&&DF.doc.feuilles[DF.page]){
    const n=DF.clics.length, diam=DF.outil==="d"||DF.outil==="r";
    const F=DF.doc.feuilles[DF.page], tol=DF.tol||2;
    DF.survol=n<(diam?1:2)?dfAccrocher(F,X,Y,tol,{diam,acc:dfAccCache(),vue:n?DF.clics[0].vue:null}):null;
  }
  dfRendreSur();
}
/* Fin d'un glisser : la vue ou la cote est enregistrée à sa nouvelle place. */
function dfLacher(){
  const g=DF.glisse;
  DF.glisse=null;
  if(!g||Math.hypot(g.dx,g.dy)<0.3){dfRendreSur();return false;}
  if(g.h.genre==="vue")dfPlacerVue(g.h.cle,g.b.x1+g.dx,g.b.y1+g.dy);
  else dfDeplacerCote(g.h.id,g.dx,g.dy);
  dfApresEdition();
  return true;
}
/* Suppr : une cote ou un détail s'effacent ; une vue déplacée revient à sa
   place calculée. */
function dfSupprimerSel(){
  const s=DF.sel;
  if(!s)return false;
  DF.sel=null;
  if(s.genre==="cote")dfSupprimerCote(s.id);
  else if(/^det\//.test(s.cle))dfSupprimerDetail(+s.cle.slice(4));
  else if(dfCfg().vues[s.cle])dfReplacer([s.cle]);
  else return false;
  dfApresEdition();
  return true;
}
function dfReplacerFeuille(){
  const F=DF.doc&&DF.doc.feuilles[DF.page];
  if(!F)return;
  dfReplacer(F.vues.map(v=>v.cle));
  dfApresEdition();
}
/* Clavier de la fenêtre : Échap défait un geste en cours avant de fermer,
   Suppr efface, Ctrl+Z / Ctrl+Y passent à l'historique de la carte. Rend
   vrai si la touche est prise. */
function dfOutilsTouche(e){
  const t=e.target;
  if(t&&/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName||""))return false;
  if(e.key==="Escape"){
    if(DF.clics.length||DF.glisse){DF.clics=[];DF.glisse=null;DF.msg="";dfRendreSur();return true;}
    if(DF.outil!=="sel"){dfChoisirOutil("sel");return true;}
    if(DF.sel){DF.sel=null;dfRendreSur();return true;}
    return false;
  }
  if((e.key==="Delete"||e.key==="Backspace")&&DF.sel)return dfSupprimerSel();
  if((e.ctrlKey||e.metaKey)&&!e.altKey&&/^[zy]$/i.test(e.key||"")){
    if(/y/i.test(e.key)||e.shiftKey){if(typeof redo==="function")redo();}
    else if(typeof undo==="function")undo();
    DF.sel=null;
    dfApresEdition();
    return true;
  }
  return false;
}

/* ---------- rendu : barre d'outils, calque, liste ---------- */
function dfRendreOutils(){
  if(typeof document==="undefined")return;
  const el=document.getElementById("dfOutils");
  if(el)
    el.innerHTML=DF_OUTILS.map(([k,ic,lib,aide])=>'<button type="button" class="df-outil'+(DF.outil===k?" on":"")+
        '" data-outil="'+k+'" title="'+esc(lib+" : "+aide)+'" aria-label="'+esc(lib)+'">'+ic+'</button>').join("")+
      '<select class="tbsel df-ech" data-op="ech" title="Échelle des vues de détail">'+
        DF_ECH_DETAIL.map(e=>'<option value="'+e+'"'+(e===DF.ech?" selected":"")+'>'+dfEchelleTxt(e)+'</option>').join("")+'</select>'+
      '<button type="button" class="tb" data-op="replacer" title="Revenir à la disposition calculée pour les vues de cette feuille">Replacer automatiquement</button>'+
      '<span class="df-msg" id="dfMsg">'+esc(dfConsigne())+'</span>';
  const f=document.getElementById("dfFeuille");
  if(f&&f.dataset)f.dataset.outil=DF.outil;
  dfRendreListeCotes();
}
function dfRendreListeCotes(){
  const el=typeof document!=="undefined"&&document.getElementById("dfCotes");
  if(!el||!DF.doc)return;
  const cfg=dfCfg(), orph=[];
  DF.doc.feuilles.forEach((F,p)=>{for(const c of F.cotes)if(c.orph)orph.push({id:c.id,p});});
  const nv=Object.keys(cfg.vues).length;
  el.innerHTML='<p class="df-vide">'+cfg.cotes.length+' cote(s), '+cfg.details.length+' détail(s)'+
      (nv?', '+nv+' vue(s) déplacée(s)':"")+'. Outils au-dessus de la feuille.</p>'+
    orph.map(o=>{
      const c=cfg.cotes.find(x=>x.id===o.id);
      if(!c)return "";
      return '<button type="button" class="df-orph" data-op="orph" data-id="'+o.id+'" data-p="'+o.p+'"><b>⚠ '+
        esc(DF_COTES[c.type])+' orpheline — f. '+(o.p+1)+'</b><span>'+
        esc(dfRefTexte(c.a)+(c.b?" → "+dfRefTexte(c.b):""))+'</span></button>';
    }).join("");
}
/* Le calque : cadres des vues et sélection en mode sélection ; accroche,
   points cliqués et élastique pour les autres outils. */
function dfSurSvg(F){
  if(!F||!F.vues)return "";
  const n=dfNum, o=[];
  const rect=(b,cl,m)=>{m=m||0;return '<rect class="'+cl+'" x="'+n(b.x1-m)+'" y="'+n(b.y1-m)+'" width="'+
    n(b.x2-b.x1+2*m)+'" height="'+n(b.y2-b.y1+2*m)+'"/>';};
  const ligne=(a,b,cl)=>'<line class="'+(cl||"df-el")+'" x1="'+n(a.x)+'" y1="'+n(a.y)+'" x2="'+n(b.x)+'" y2="'+n(b.y)+'"/>';
  const point=p=>'<circle class="df-acc" cx="'+n(p.x)+'" cy="'+n(p.y)+'" r="1.1"/>';
  const s=DF.sel, g=DF.glisse, M=DF.souris;
  if(DF.outil==="sel"){
    for(const v of F.vues){
      const b=dfBoiteVue(F,v);
      if(b)o.push(rect(b,"df-v"+(s&&s.genre==="vue"&&s.cle===v.cle?" on":""),0.8));
    }
    if(s&&s.genre==="cote"){
      const c=F.cotes.find(c=>c.id===s.id), b=c&&dfBoiteItems(F,c.i0,c.i1);
      if(b)o.push(rect(b,"df-c on",0.8));
    }
    if(g&&(g.dx||g.dy)){
      const w=g.b.x2-g.b.x1, h=g.b.y2-g.b.y1;
      const q=g.h.genre==="vue"?dfBorner(F,w,h,g.b.x1+g.dx,g.b.y1+g.dy):{x:g.b.x1+g.dx,y:g.b.y1+g.dy};
      o.push(rect({x1:q.x,y1:q.y,x2:q.x+w,y2:q.y+h},"df-fantome"));
    }
    return o.join("");
  }
  for(const c of DF.clics)if(c.x!=null)o.push(point(c));
  const A=DF.clics[0], P=DF.survol||M;
  if(DF.outil==="detC"&&A&&M)
    o.push('<circle class="df-el" cx="'+n(A.X)+'" cy="'+n(A.Y)+'" r="'+n(Math.hypot(M.X-A.X,M.Y-A.Y))+'"/>');
  else if(DF.outil==="detR"&&A&&M)
    o.push(rect({x1:Math.min(A.X,M.X),y1:Math.min(A.Y,M.Y),x2:Math.max(A.X,M.X),y2:Math.max(A.Y,M.Y)},"df-el"));
  else if(A&&P){
    const pm=P.X!=null?{x:P.X,y:P.Y}:P;
    if(DF.clics.length===2&&M){
      const B=DF.clics[1], Mi={x:(A.x+B.x)/2,y:(A.y+B.y)/2};
      const ge=dfCoteGeom(DF.outil,A,B,M.X-Mi.x,M.Y-Mi.y);
      o.push(ligne(A,ge.A2),ligne(B,ge.B2),ligne(ge.A2,ge.B2,"df-el on"));
    }else o.push(ligne(A,pm));
  }
  if(DF.survol){
    o.push(point(DF.survol));
    o.push('<text class="df-acc-t" x="'+n(DF.survol.x+1.8)+'" y="'+n(DF.survol.y-1.8)+'">'+esc(DF.survol.lib)+'</text>');
  }
  return o.join("");
}
function dfRendreSur(){
  if(typeof document==="undefined"||!DF.doc)return;
  const g=document.getElementById("dfSur"), F=DF.doc.feuilles[DF.page];
  if(g&&F)g.innerHTML=dfSurSvg(F);
  const m=document.getElementById("dfMsg");
  if(m)m.textContent=dfConsigne();
}
/* (X,Y) en mm de la feuille affichée, et la tolérance d'accroche : 9 pixels
   d'écran, quel que soit le zoom. */
function dfPointFeuille(e){
  const f=document.getElementById("dfFeuille"), svg=f&&f.querySelector&&f.querySelector("svg");
  if(!svg||!DF.doc||!DF.doc.feuilles.length)return null;
  const F=DF.doc.feuilles[DF.page], r=svg.getBoundingClientRect();
  if(!r||!r.width)return null;
  DF.tol=9*F.w/r.width;
  return {F,X:(e.clientX-r.left)*F.w/r.width,Y:(e.clientY-r.top)*F.h/r.height,tol:DF.tol};
}
function dfBrancherOutils(m){
  m.addEventListener("click",e=>{
    const b=e.target.closest&&e.target.closest("[data-outil],[data-op]");
    if(!b||b.tagName==="SELECT")return;
    if(b.dataset.outil){dfChoisirOutil(b.dataset.outil);return;}
    const op=b.dataset.op;
    if(op==="replacer")dfReplacerFeuille();
    else if(op==="orph"){
      DF.page=+b.dataset.p;DF.outil="sel";DF.clics=[];DF.sel={genre:"cote",id:+b.dataset.id};
      dfRendreApercu();
    }
  });
  m.addEventListener("change",e=>{
    const t=e.target;
    if(t.dataset&&t.dataset.op==="ech")DF.ech=+t.value||5;
  });
  m.addEventListener("pointerdown",e=>{
    if(e.button!==0||!e.target.closest||!e.target.closest("#dfFeuille"))return;
    const P=dfPointFeuille(e);
    if(!P)return;
    e.preventDefault();
    /* la feuille prend le clavier : Suppr et Échap lui reviennent, pas au
       champ de recherche ni à l'éditeur derrière la fenêtre */
    const f=document.getElementById("dfFeuille");
    if(f&&f.focus)f.focus({preventScroll:true});
    dfClicFeuille(P.F,P.X,P.Y,P.tol);
  });
  m.addEventListener("pointermove",e=>{
    if(!DF.glisse&&(!e.target.closest||!e.target.closest("#dfFeuille")))return;
    const P=dfPointFeuille(e);
    if(P)dfGlisser(P.X,P.Y);
  });
  m.addEventListener("pointerup",()=>{if(DF.glisse)dfLacher();});
}
