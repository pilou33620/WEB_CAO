"use strict";
/* =============================================================================
   editeur-pcb — 54-controles.js
   Contrôles et outils repris de KiCad :
     · DRC (appelé par runDrc, 02-connectivity.js) : zones d'encombrement qui se
       chevauchent, ponts de vernis entre nets, sérigraphie trop petite ou
       superposée, pistes et vias en l'air, empreinte différente de la LIB ;
     · statistiques de la carte ;
     · permutation de deux couches cuivre.
   Les écarts portent leur code (`kind`) : 45-drc-gestion.js s'en sert pour
   les exclusions.
   ============================================================================= */

function drcComplements(out,pads){
  drcEncombrement(out);
  drcPontsVernis(out);
  drcSerigraphieTaille(out);
  drcSerigraphieSuperposee(out);
  drcEnLAir(out,pads);
  drcEmpreinteLib(out);
}

/* ---------- zones d'encombrement (courtyard) ----------
   Celle d'une empreinte : ses dessins F.CrtYd / B.CrtYd (carte importée, LIB).
   Les traits et arcs s'enchaînent bout à bout en contours fermés : un
   encombrement en L reste en L. Un tracé qui ne se ferme pas (dessin
   incomplet) retombe sur l'enveloppe convexe de ses points.
   Sans dessin d'encombrement, le corps fait foi (« Composants qui se chevauchent »). */
function enveloppe(P){
  const p=P.slice().sort((a,b)=>a.x-b.x||a.y-b.y);
  if(p.length<3)return p;
  const x=(o,a,b)=>(a.x-o.x)*(b.y-o.y)-(a.y-o.y)*(b.x-o.x), bas=[], haut=[];
  for(const q of p){while(bas.length>=2&&x(bas[bas.length-2],bas[bas.length-1],q)<=0)bas.pop();bas.push(q);}
  for(let i=p.length-1;i>=0;i--){const q=p[i];while(haut.length>=2&&x(haut[haut.length-2],haut[haut.length-1],q)<=0)haut.pop();haut.push(q);}
  return bas.slice(0,-1).concat(haut.slice(0,-1));
}
/* Polylignes enchaînées par leurs bouts (au micron) : les contours fermés,
   et les points de ce qui n'a pas pu se fermer. */
function enchainer(morceaux){
  const pres=(a,b)=>Math.abs(a.x-b.x)<1e-3&&Math.abs(a.y-b.y)<1e-3;
  const reste=morceaux.filter(m=>m.length>=2).map(m=>m.slice()), fermes=[], ouverts=[];
  while(reste.length){
    const c=reste.shift();
    for(let suite=true;suite&&!pres(c[0],c[c.length-1]);){
      suite=false;
      for(let i=0;i<reste.length;i++){
        const m=reste[i], fin=c[c.length-1];
        if(pres(m[0],fin)){c.push(...m.slice(1));}
        else if(pres(m[m.length-1],fin)){c.push(...m.slice(0,-1).reverse());}
        else continue;
        reste.splice(i,1);suite=true;break;
      }
    }
    if(c.length>=4&&pres(c[0],c[c.length-1]))fermes.push(c.slice(0,-1));else ouverts.push(...c);
  }
  return {fermes,ouverts};
}
/* Les contours d'encombrement d'une empreinte en coordonnées monde, ou null. */
function fpEncombrement(fp){
  const L=fp.side?"crtB":"crtT", polys=[], morceaux=[];
  for(const d of fpDessinsMonde(fp)){
    if(d.layer!==L)continue;
    if(d.shape==="poly"){if(d.pts.length>=3)polys.push(d.pts);}
    else morceaux.push(drwPoints(d));
  }
  const {fermes,ouverts}=enchainer(morceaux);
  polys.push(...fermes);
  if(ouverts.length){const H=enveloppe(ouverts);if(H.length>=3)polys.push(H);}
  if(!polys.length)return null;
  // un micron vers l'intérieur : deux encombrements bord à bord ne se chevauchent pas
  return polys.map(P=>{
    const cx=P.reduce((s,p)=>s+p.x,0)/P.length, cy=P.reduce((s,p)=>s+p.y,0)/P.length;
    return P.map(p=>{const d=Math.hypot(p.x-cx,p.y-cy)||1;return {x:p.x-(p.x-cx)/d*1e-3,y:p.y-(p.y-cy)/d*1e-3};});
  });
}
function drcEncombrement(out){
  const L=[];
  for(const f of S.fps){const P=fpEncombrement(f);if(P)L.push({f,P,b:polyBBox([].concat(...P))});}
  L.sort((a,c)=>a.b.x1-c.b.x1);
  const corps=new Set();
  for(const [a,b] of fpChevauchements()){corps.add(a.id+"|"+b.id);corps.add(b.id+"|"+a.id);}
  for(let i=0;i<L.length;i++)
    for(let j=i+1;j<L.length&&L[j].b.x1<=L[i].b.x2;j++){
      const a=L[i], c=L[j];
      if(!!a.f.side!==!!c.f.side||c.b.y1>a.b.y2||c.b.y2<a.b.y1)continue;
      if(corps.has(a.f.id+"|"+c.f.id))continue;      // déjà dit par le corps
      if(!a.P.some(A=>c.P.some(C=>polysTouchent(A,C))))continue;
      out.push({kind:"encombrement",x:r3((a.f.x+c.f.x)/2),y:r3((a.f.y+c.f.y)/2),l:a.f.side?S.cu-1:0,
        msg:"Zones d'encombrement qui se chevauchent : "+a.f.ref+" et "+c.f.ref+" ("+(a.f.side?"dessous":"dessus")+
            ") — la pose automatique ne passera pas"});
    }
}

/* ---------- ponts de vernis ----------
   Entre deux ouvertures du masque de nets différents, la digue de vernis doit
   tenir la largeur minimale du fabricant (bridgeMin du profil) : plus mince,
   elle saute et la soudure peut couler d'une pastille à l'autre. Une entrée
   par paire de composants, avec la digue la plus mince. */
function vernisDigueMin(){
  const p=typeof pcbGetMfgProfile==="function"?pcbGetMfgProfile():null;
  const bm=p&&p.general&&p.general.solderMask&&p.general.solderMask.bridgeMin;
  return bm&&bm["1oz_colors"]>0?bm["1oz_colors"]:0.1;
}
function drcPontsVernis(out){
  const min=vernisDigueMin();
  for(const side of [0,1]){
    const O=maskOpenings(side).filter(o=>o.q.net).map(o=>{
      const q=o.grow?Object.assign({},o.q,{w:o.q.w+2*o.grow,h:o.q.h+2*o.grow}):o.q;
      if(o.grow&&Array.isArray(o.q.pts))q.pts=polyOffset(o.q.pts,o.grow);   // comme l'ouverture du Gerber
      return {q,src:o.q,R:Math.hypot(q.w,q.h)/2};
    }).sort((a,b)=>(a.q.x-a.R)-(b.q.x-b.R));
    const paires=new Map();
    for(let i=0;i<O.length;i++){
      const a=O[i];
      for(let j=i+1;j<O.length;j++){
        const b=O[j];
        if(b.q.x-b.R>a.q.x+a.R+min)break;
        if(a.q.net===b.q.net||Math.abs(a.q.y-b.q.y)>a.R+b.R+min)continue;
        if(a.src.fp&&a.src.fp===b.src.fp&&netTieRelie(a.src.fp,a.src,b.src))continue;   // pont de nets : voulu
        const e=padPadDist(a.q,b.q);
        if(e>=min-1e-6)continue;
        const qui=o=>o.src.fp?o.src.fp.ref:"via";
        const k=[qui(a),qui(b)].sort().join(" / ");
        const p=paires.get(k);
        if(!p)paires.set(k,{n:1,e,x:(a.q.x+b.q.x)/2,y:(a.q.y+b.q.y)/2});
        else{p.n++;if(e<p.e){p.e=e;p.x=(a.q.x+b.q.x)/2;p.y=(a.q.y+b.q.y)/2;}}
      }
    }
    for(const [k,p] of paires)
      out.push({kind:"pont-vernis",info:true,x:r3(p.x),y:r3(p.y),l:side?S.cu-1:0,
        msg:"Pont de vernis "+k+" ("+(side?"dessous":"dessus")+") : "+p.n+" digue(s), la plus mince "+
            (p.e<=0?"absente (ouvertures confondues)":"de "+fmt(p.e,3)+" mm")+", le fabricant en tient "+fmt(min,2)+
            " mm — le vernis saute, risque de pont de soudure"});
  }
}

/* ---------- sérigraphie : taille ----------
   Hauteur de texte et trait sous les minimums du profil fabricant : illisible
   ou bouché à l'impression. Une entrée par composant (repère et dessins), une
   par dessin de la carte. Le repère à taille automatique (fpTextPos) n'est pas
   jugé : seule une hauteur saisie l'est.
   shortcut: la taille automatique descend à 0,8 mm, sous le 1,0 mm de JLCPCB ;
   la juger ferait crier toutes les cartes, relever son plancher si cela gêne. */
function drcSerigraphieTaille(out){
  const p=typeof pcbGetMfgProfile==="function"?pcbGetMfgProfile():null, sk=(p&&p.silkscreen)||{};
  const hMin=sk.minTextHeight||1.0, wMin=sk.minLineWidth||0.15, eps=1e-6;
  const parFp=new Map();
  const noter=(fp,quoi,x,y,side)=>{
    if(!fp){out.push({kind:"serigraphie-taille",info:true,x:r3(x),y:r3(y),l:side?S.cu-1:0,msg:"Sérigraphie trop fine : "+quoi});return;}
    if(!parFp.has(fp))parFp.set(fp,[]);
    parFp.get(fp).push(quoi);
  };
  for(const fp of S.fps){
    const tr=fpTextPos(fp).ref;
    if(!tr.imprime)continue;
    if(fp.refSize>0&&tr.size<hMin-eps)noter(fp,"repère de "+fmt(tr.size,2)+" mm de haut (min "+fmt(hMin,2)+")");
    if(tr.w<wMin-eps)noter(fp,"repère au trait de "+fmt(tr.w,2)+" mm (min "+fmt(wMin,2)+")");
  }
  for(const d of dessinsMonde()){
    if(!/^silk[TB]$/.test(d.layer)||d.shape==="poly")continue;
    const side=d.layer==="silkB", w=d.width||0.15, h=d.size||d.height||1.5;
    if(d.shape==="text"&&h<hMin-eps)noter(d.fp,"texte « "+String(d.text).slice(0,20)+" » de "+fmt(h,2)+" mm de haut (min "+fmt(hMin,2)+")",d.x1,d.y1,side);
    if(w<wMin-eps)noter(d.fp,(d.shape==="text"?"texte":"trait")+" de "+fmt(w,2)+" mm d'épaisseur (min "+fmt(wMin,2)+")",d.x1,d.y1,side);
  }
  for(const [fp,l] of parFp){
    const u=[...new Set(l)];
    out.push({kind:"serigraphie-taille",info:true,x:fp.x,y:fp.y,l:fp.side?S.cu-1:0,
      msg:"Sérigraphie trop fine sur "+fp.ref+" : "+u.slice(0,3).join(", ")+(u.length>3?"…":"")+" — illisible à l'impression"});
  }
}

/* ---------- sérigraphie : superposée ----------
   Le repère d'un composant posé sur la sérigraphie d'un autre (son repère,
   ses dessins) : les deux deviennent illisibles. Mesuré trait contre trait. */
function silkSegs(polys,w){
  const S_=[];
  for(const P of polys)for(let k=0;k+1<P.length;k++)S_.push({x1:P[k].x,y1:P[k].y,x2:P[k+1].x,y2:P[k+1].y,w});
  return S_;
}
function segsBBox(L){
  let x1=1e9,y1=1e9,x2=-1e9,y2=-1e9;
  for(const s of L){x1=Math.min(x1,s.x1-s.w,s.x2-s.w);y1=Math.min(y1,s.y1-s.w,s.y2-s.w);x2=Math.max(x2,s.x1+s.w,s.x2+s.w);y2=Math.max(y2,s.y1+s.w,s.y2+s.w);}
  return {x1,y1,x2,y2};
}
function drcSerigraphieSuperposee(out){
  for(const side of [0,1]){
    const reperes=[], autres=new Map();      // autres : fp → traits (repère compris)
    const ajout=(fp,L)=>{if(!autres.has(fp))autres.set(fp,[]);autres.get(fp).push(...L);};
    for(const fp of S.fps){
      if(!!fp.side!==!!side)continue;
      const tr=fpTextPos(fp).ref;
      if(!tr.imprime)continue;
      const L=silkSegs(textStrokes(fp.ref,tr.x,tr.y,tr.size,!!side,tr.rot),tr.w);
      if(!L.length)continue;
      reperes.push({fp,L,b:segsBBox(L),x:tr.x,y:tr.y});
      ajout(fp,L);
    }
    for(const d of dessinsMonde())
      if(d.fp&&d.layer===(side?"silkB":"silkT")&&d.shape!=="poly")ajout(d.fp,silkSegs(drwTraits(d),d.width||0.15));
    const boites=new Map([...autres].map(([fp,L])=>[fp,segsBBox(L)]));
    const vu=new Set();
    for(const r of reperes)
      for(const [fp,L] of autres){
        if(fp===r.fp)continue;
        const b=boites.get(fp);
        if(b.x1>r.b.x2||b.x2<r.b.x1||b.y1>r.b.y2||b.y2<r.b.y1)continue;
        const k=[r.fp.id,fp.id].sort().join("|");
        if(vu.has(k))continue;
        if(!r.L.some(a=>L.some(c=>segSegDist(a,c)<(a.w+c.w)/2-1e-6)))continue;
        vu.add(k);
        out.push({kind:"serigraphie-superposee",info:true,x:r3(r.x),y:r3(r.y),l:side?S.cu-1:0,
          msg:"Sérigraphie superposée ("+(side?"dessous":"dessus")+") : le repère "+r.fp.ref+" recouvre la sérigraphie de "+fp.ref+" — déplacez-le"});
      }
  }
}

/* ---------- pistes et vias en l'air ----------
   Un bout de piste qui ne touche ni piste, ni via, ni pastille, ni zone de son
   net : une antenne, reste d'un tracé repris. Un via qui ne relie pas au moins
   deux couches de cuivre de son net ne sert à rien. */
function drcEnLAir(out,pads){
  const C=2, grille=new Map(), cle=(i,j)=>i+"|"+j;
  for(const p of pads){
    const R=Math.hypot(p.q.w,p.q.h)/2+1;     // +1 : la demi-largeur de piste admise par surPastille
    for(let i=Math.floor((p.q.x-R)/C);i<=Math.floor((p.q.x+R)/C);i++)
      for(let j=Math.floor((p.q.y-R)/C);j<=Math.floor((p.q.y+R)/C);j++){
        const k=cle(i,j);if(!grille.has(k))grille.set(k,[]);grille.get(k).push(p);
      }
  }
  // tol : la demi-largeur d'une piste, dont le cuivre touche la pastille avant son axe (comme conn())
  const surPastille=(l,x,y,tol=0)=>(grille.get(cle(Math.floor(x/C),Math.floor(y/C)))||[])
    .some(p=>p.layers.includes(l)&&padDist(x,y,padSurCouche(p.q,l)||p.q)<=tol+1e-3);
  const bouts=new Map(), k3=(l,x,y)=>l+"|"+r3(x)+"|"+r3(y);
  for(const t of S.tracks)for(const k of [k3(t.l,t.x1,t.y1),k3(t.l,t.x2,t.y2)])bouts.set(k,(bouts.get(k)||0)+1);
  const parCouche=new Map();
  for(const t of S.tracks){if(!parCouche.has(t.l))parCouche.set(t.l,[]);parCouche.get(t.l).push(t);}
  const zoneNet=(l,x,y,net)=>{const z=zoneAt(l,x,y);return !!z&&!!net&&z.net===net;};
  for(const t of S.tracks){
    if(t.texte)continue;
    for(const [x,y] of [[t.x1,t.y1],[t.x2,t.y2]]){
      const dansVia=S.vias.some(v=>t.l>=Math.min(v.a,v.b)&&t.l<=Math.max(v.a,v.b)&&dist(x,y,v.x,v.y)<=v.d/2+1e-3);
      if((bouts.get(k3(t.l,x,y))||0)>1||dansVia||surPastille(t.l,x,y,t.w/2)||zoneNet(t.l,x,y,t.net))continue;
      if((parCouche.get(t.l)||[]).some(o=>o!==t&&trkDist(x,y,o)<=o.w/2+1e-3))continue;   // arrivée en T
      out.push({kind:"piste-en-l-air",info:true,x:r3(x),y:r3(y),l:t.l,
        msg:"En l'air : piste sur "+cuId(t.l,S.cu)+" ("+(t.net||"sans net")+"), un bout ne touche rien — une antenne à retirer"});
    }
  }
  for(const v of S.vias){
    const couches=new Set();
    for(let l=Math.min(v.a,v.b);l<=Math.max(v.a,v.b);l++){
      if((parCouche.get(l)||[]).some(t=>dist(t.x1,t.y1,v.x,v.y)<=v.d/2+1e-3||dist(t.x2,t.y2,v.x,v.y)<=v.d/2+1e-3||trkDist(v.x,v.y,t)<=t.w/2+1e-3)||
         surPastille(l,v.x,v.y)||zoneNet(l,v.x,v.y,v.net))couches.add(l);
    }
    if(couches.size<2)
      out.push({kind:"via-en-l-air",info:true,via:v,x:v.x,y:v.y,l:Math.min(v.a,v.b),
        msg:"En l'air : via "+(v.net||"sans net")+" relié à "+(couches.size?"une seule couche ("+cuId([...couches][0],S.cu)+")":"rien")+", il ne sert à rien"});
  }
}

/* ---------- empreinte différente de la LIB ----------
   Une empreinte tirée de la table ou de la LIB (`fp.lib`) se compare à ce que
   cette source donne aujourd'hui : pastilles retouchées à la main ou LIB mise
   à jour depuis la pose. « Revenir à l'empreinte calculée » la réaligne. */
function drcEmpreinteLib(out){
  for(const fp of S.fps){
    if(!fp.lib||!Array.isArray(fp.pads)||typeof pkgGeom!=="function")continue;
    let g=null;
    try{
      const def=typeof fpLibPourBoitier==="function"?fpLibPourBoitier(fp.lib):null;   // la LIB d'empreintes (08-empreinte.js)
      g=def?normFpDef(def):pkgGeom(fp.lib,fpWiredPins(fp));
    }catch(e){g=null;}
    if(!g||!Array.isArray(g.pads))continue;
    const ecarts=fpEcartsLib(fp.pads,g.pads);
    if(ecarts)
      out.push({kind:"empreinte-lib",info:true,x:fp.x,y:fp.y,l:fp.side?S.cu-1:0,
        msg:"Empreinte "+fp.ref+" différente de la bibliothèque ("+fp.lib+") : "+ecarts+
            " — « Revenir à l'empreinte calculée » la réaligne"});
  }
}
/* Ce qui sépare deux listes de pastilles, en clair ; "" si elles sont égales. */
function fpEcartsLib(A,B){
  if(A.length!==B.length)return A.length+" pastille(s) contre "+B.length;
  const k=q=>String(q.n)+"|"+(q.nom||"");
  const mB=new Map(), n0=v=>+v||0, diff=(a,b)=>Math.abs(n0(a)-n0(b))>0.005;
  for(const q of B){if(!mB.has(k(q)))mB.set(k(q),[]);mB.get(k(q)).push(q);}
  let place=0, forme=0, perce=0;
  for(const q of A){
    const l=mB.get(k(q));
    if(!l||!l.length)return "pastille "+q.n+" absente de la bibliothèque";
    const r=l.shift();
    if(diff(q.x,r.x)||diff(q.y,r.y))place++;
    if(diff(q.w,r.w)||diff(q.h,r.h)||(q.shape||"rect")!==(r.shape||"rect")||diff(q.rot,r.rot))forme++;
    if(diff(q.drill,r.drill))perce++;
  }
  const t=[];
  if(place)t.push(place+" déplacée(s)");
  if(forme)t.push(forme+" de forme ou de taille différente");
  if(perce)t.push(perce+" au perçage différent");
  return t.join(", ");
}

/* ---------- statistiques de la carte ---------- */
function pcbStatistiques(){
  const s={composants:{total:0,dessus:0,dessous:0,cms:0,traversants:0,mixtes:0},
           pastilles:{total:0,cms:0,traversantes:0},vias:{total:0,traversants:0,borgnes:0,enterres:0,micro:0},
           percages:new Map(),pistes:{segments:S.tracks.length,longueur:0,parCouche:[]},
           nets:0,nonRoutees:0,zones:S.zones.length,trousNpth:(S.holes||[]).length,carte:null};
  for(let l=0;l<S.cu;l++)s.pistes.parCouche.push(0);
  const percer=(d,quoi)=>{const k=fmt(d,2);const e=s.percages.get(k)||{pth:0,npth:0};e[quoi]++;s.percages.set(k,e);};
  for(const fp of S.fps){
    s.composants.total++;
    if(fp.side)s.composants.dessous++;else s.composants.dessus++;
    const P=padsWorld(fp), tht=P.filter(q=>q.drill>0).length;
    if(!P.length)continue;
    if(!tht)s.composants.cms++;else if(tht===P.length)s.composants.traversants++;else s.composants.mixtes++;
    for(const q of P){s.pastilles.total++;if(q.drill>0){s.pastilles.traversantes++;percer(q.drill,"pth");}else s.pastilles.cms++;}
    for(const h of fp.holes||[])if(h.d>0)percer(h.d,"npth");
  }
  for(const v of S.vias){
    s.vias.total++;
    const a=Math.min(v.a,v.b), b=Math.max(v.a,v.b);
    if(a===0&&b===S.cu-1)s.vias.traversants++;
    else if(b-a===1&&(a===0||b===S.cu-1))s.vias.micro++;
    else if(a===0||b===S.cu-1)s.vias.borgnes++;
    else s.vias.enterres++;
    percer(v.drill,"pth");
  }
  for(const h of S.holes||[])percer(h.d,"npth");
  for(const t of S.tracks){const L=trkLen(t);s.pistes.longueur+=L;if(t.l<S.cu)s.pistes.parCouche[t.l]+=L;}
  const c=conn(false);
  s.nonRoutees=(c.rats||[]).length;
  s.nets=new Set(S.fps.flatMap(fp=>padsWorld(fp).map(q=>q.net)).filter(Boolean)).size;
  const B=boardPoly(), b=polyBBox(B);
  let aire=0;for(let i=0;i<B.length;i++){const p=B[i],q=B[(i+1)%B.length];aire+=p.x*q.y-q.x*p.y;}
  s.carte={l:b.x2-b.x1,h:b.y2-b.y1,aire:Math.abs(aire)/2,couches:S.cu};
  return s;
}
function pcbStatistiquesTexte(s){
  s=s||pcbStatistiques();
  const L=[];
  L.push("Carte : "+fmt(s.carte.l,2)+" × "+fmt(s.carte.h,2)+" mm, "+fmt(s.carte.aire/100,2)+" cm², "+s.carte.couches+" couche(s) cuivre");
  L.push("Composants : "+s.composants.total+" ("+s.composants.dessus+" dessus, "+s.composants.dessous+" dessous ; "+
         s.composants.cms+" CMS, "+s.composants.traversants+" traversants"+(s.composants.mixtes?", "+s.composants.mixtes+" mixtes":"")+")");
  L.push("Pastilles : "+s.pastilles.total+" ("+s.pastilles.cms+" CMS, "+s.pastilles.traversantes+" traversantes)");
  L.push("Vias : "+s.vias.total+(s.vias.total?" ("+s.vias.traversants+" traversants, "+s.vias.borgnes+" borgnes, "+s.vias.enterres+" enterrés, "+s.vias.micro+" micro)":""));
  L.push("Trous non métallisés de carte : "+s.trousNpth);
  L.push("Pistes : "+s.pistes.segments+" segment(s), "+fmt(s.pistes.longueur,1)+" mm"+
         (s.pistes.segments?" — "+s.pistes.parCouche.map((v,i)=>cuId(i,S.cu)+" "+fmt(v,1)).join(", "):""));
  L.push("Zones : "+s.zones+" · Nets : "+s.nets+" · Liaisons non routées : "+s.nonRoutees);
  const P=[...s.percages].sort((a,b)=>+a[0]-+b[0]);
  L.push("Perçages : "+P.reduce((n,[,e])=>n+e.pth+e.npth,0)+" en "+P.length+" diamètre(s)");
  for(const [d,e] of P)L.push("  Ø "+d+" mm : "+(e.pth?e.pth+" métallisé(s)":"")+(e.pth&&e.npth?", ":"")+(e.npth?e.npth+" non métallisé(s)":""));
  return L.join("\n");
}
function pcbStatistiquesOuvrir(){
  if(typeof document==="undefined")return;
  const d=document.createElement("dialog");
  d.className="ed-dlg";
  d.innerHTML='<div class="mtitle">Statistiques de la carte</div>'+
    '<pre style="font-family:var(--mono);font-size:12px;white-space:pre-wrap;max-height:60vh;overflow:auto">'+esc(pcbStatistiquesTexte())+'</pre>'+
    '<div class="row"><button class="tb" id="statCopier">Copier</button><button class="tb" id="statFermer">Fermer</button></div>';
  document.body.appendChild(d);
  const fermer=()=>{d.close();d.remove();};
  d.querySelector("#statFermer").onclick=fermer;
  d.querySelector("#statCopier").onclick=()=>pcbCopierTexte(pcbStatistiquesTexte(),"Statistiques copiées.");
  d.addEventListener("cancel",e=>{e.preventDefault();fermer();});
  d.showModal();
}

/* ---------- permuter deux couches cuivre ----------
   Pistes, zones, découpes et keep-out d'une couche passent sur l'autre et
   réciproquement ; un via borgne ou enterré qui s'arrête sur l'une s'arrête
   sur l'autre. L'empilage (noms, rôles, épaisseurs) ne bouge pas, comme chez KiCad. */
function couchesPermuter(a,b){
  a=Math.round(+a);b=Math.round(+b);
  if(!(a>=0&&b>=0&&a<S.cu&&b<S.cu)||a===b)return 0;
  const sw=l=>l===a?b:l===b?a:l;
  let n=0;
  for(const o of S.tracks.concat(S.zones,S.cuts))if(o.l===a||o.l===b){o.l=sw(o.l);n++;}
  for(const z of S.interdits||[])if(z.ko&&(z.ko.l===a||z.ko.l===b)){z.ko.l=sw(z.ko.l);n++;}
  /* un plan de couche est son rôle plus une zone auto : le rôle suit la zone,
     sinon syncAutoZones ou la relecture la ramèneraient sur l'ancienne couche */
  const La=S.cuL[a], Lb=S.cuL[b];
  if(La&&Lb&&(La.plane||Lb.plane))for(const k of ["plane","net","role","negatif"]){const t=La[k];La[k]=Lb[k];Lb[k]=t;}
  for(const v of S.vias){
    if(v.a===0&&v.b===S.cu-1)continue;       // un traversant relie toujours toutes les couches
    const va=sw(v.a), vb=sw(v.b);
    if(va!==v.a||vb!==v.b){v.a=Math.min(va,vb);v.b=Math.max(va,vb);n++;}
  }
  return n;
}
function couchesPermuterCommande(a,b){
  if(a===b){hint("Permuter : choisissez deux couches différentes.");return 0;}
  push();
  const n=couchesPermuter(a,b);
  if(typeof zoneCache!=="undefined")zoneCache.clear();
  touch();refreshPanels();draw();
  hint(n+" objet(s) passés de "+cuId(a,S.cu)+" à "+cuId(b,S.cu)+" et inversement. Ctrl+Z annule.");
  return n;
}

(function(){
  if(typeof document==="undefined")return;
  const on=(id,f)=>{const b=document.getElementById(id);if(b)b.onclick=f;};
  on("bStats",pcbStatistiquesOuvrir);
  on("bPermuter",()=>{
    if(S.cu<2){hint("Permuter : la carte n'a qu'une couche.");return;}
    const noms=[...Array(S.cu).keys()].map(i=>cuId(i,S.cu));
    vDialogue("Permuter deux couches",[
      {id:"a",label:"Couche",val:noms[0],options:noms},{id:"b",label:"avec la couche",val:noms[S.cu-1],options:noms}],
      v=>couchesPermuterCommande(noms.indexOf(v.a),noms.indexOf(v.b)),"Permuter");
  });
})();
