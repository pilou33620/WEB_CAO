"use strict";
/* =============================================================================
   visionneuse-ipc2581/js/08-vers-pcb.js
   De la carte du fabricant à une carte qu'on peut retoucher.

   Un projet neuf qui n'a qu'un IPC-2581 n'a ni schéma ni circuit imprimé :
   ce fichier-ci traduit le modèle lu ici en document de l'éditeur PCB
   (format « pcbedit-1 ») et l'y pousse. Le bouton n'existe que dans un projet
   — en visionneuse seule, il n'y a pas d'éditeur où atterrir, ni de dossier
   où ranger la carte.

   Ce qui passe, et comment :
     · unités    : INCH et MICRON ramenés en millimètres, la seule unité de
                   l'éditeur ;
     · axes      : l'IPC-2581 a l'axe Y vers le haut, l'éditeur vers le bas.
                   Y est retourné, la carte posée à partir de (0, 0), et
                   l'origine de fabrication remise sur celle du fichier : les
                   Gerber ressortent dans les coordonnées d'origine ;
     · couches   : les cuivres dans l'ordre de l'empilage, le dernier au
                   dessous. L'éditeur va jusqu'à 8 couches, en 1, 2, 4, 6 ou 8 :
                   un nombre impair prend une couche interne vide de plus ;
     · composants: une empreinte dessinée par composant, pastille par
                   pastille, à son angle réel. Une broche qui n'est pas un
                   entier (« A1 », « K ») fait renuméroter le composant de 1 à
                   N ; le nom d'origine reste sur la pastille (`nom`) ;
     · pastilles : cercle, rectangle, oblong, chanfrein ; un polygone ou une
                   forme utilisateur devient une pastille « poly » ;
     · pistes et arcs, vias (portée comprise quand le fichier la déclare),
       trous non métallisés, contour de carte ;
     · plans     : leur contour devient une zone du même net. L'éditeur la
                   remplit avec SES règles : le cuivre ressemble à l'original,
                   il n'est pas identique au micron.
   Ce qui ne passe pas — sérigraphie, textes, découpes intérieures de la
   carte — est compté et dit, pas tu.
   ============================================================================= */

const VP_CU_PERMIS=[1,2,4,6,8];  // nombres de couches que propose l'éditeur

/* Facteur vers le millimètre, d'après l'unité que déclare le fichier. */
function vpEchelle(unites){
  const u=String(unites||"").trim().toUpperCase();
  if(/INCH/.test(u))return 25.4;
  if(/MICRON/.test(u))return 0.001;
  if(/^MILS?$/.test(u))return 0.0254;      // « MILLIMETER » commence aussi par MIL
  return 1;
}
function vpR4(v){ return Math.round(v*1e4)/1e4; }
function vpCle(x,y){ return Math.round(x*1000)+","+Math.round(y*1000); }

/* Rang de couche par nom, avec la même tolérance de casse que mdlCoucheDe. */
function vpIndexCouches(noms){
  const exact=new Map(), bas=new Map();
  noms.forEach(function(n,i){
    if(!exact.has(n))exact.set(n,i);
    const b=String(n).toLowerCase();
    if(!bas.has(b))bas.set(b,i);
  });
  return function(nom){
    if(nom==null)return -1;
    const n=String(nom);
    if(exact.has(n))return exact.get(n);
    const b=n.toLowerCase();
    return bas.has(b)?bas.get(b):-1;
  };
}

/* Une forme du dictionnaire → la pastille de l'éditeur, dans le repère de la
   pastille, en millimètres. `d` est le diamètre de repli du padstack. */
function vpForme(modele,id,d,k){
  const f=id&&modele.formes?modele.formes[id]:null;
  const u=id&&modele.formesuser?modele.formesuser[id]:null;
  const plat=function(p){
    const pts=[];
    for(let i=0;i+1<p.length;i+=2)pts.push({x:p[i]*k,y:p[i+1]*k});
    /* un polygone fermé répète son premier sommet : l'éditeur ferme seul */
    if(pts.length>3){
      const a=pts[0], b=pts[pts.length-1];
      if(Math.abs(a.x-b.x)<1e-9&&Math.abs(a.y-b.y)<1e-9)pts.pop();
    }
    return pts;
  };
  const poly=function(pts){
    if(pts.length<3)return null;
    let x1=Infinity,y1=Infinity,x2=-Infinity,y2=-Infinity;
    for(const p of pts){x1=Math.min(x1,p.x);y1=Math.min(y1,p.y);
                        x2=Math.max(x2,p.x);y2=Math.max(y2,p.y);}
    return {shape:"poly",w:x2-x1,h:y2-y1,pts:pts};
  };
  if(f){
    const w=(f.w||0)*k, h=(f.h||0)*k;
    switch(f.t){
      case "CIRCLE": return {shape:"circ",w:(f.d||d)*k,h:(f.d||d)*k};
      case "RECTCENTER": return {shape:"sharp",w:w,h:h};
      case "OVAL": return {shape:"oval",w:w,h:h};
      case "RECTROUND":
        /* l'éditeur arrondit ses rectangles d'un rayon fixe ; un rayon qui
           atteint la moitié du petit côté, c'est un oblong */
        if((f.r||0)*k>=Math.min(w,h)/2-1e-6)return {shape:"oval",w:w,h:h};
        return {shape:(f.r?"rect":"sharp"),w:w,h:h};
      case "RECTCHAM": return {shape:"chamfer",w:w,h:h,chamfer:(f.ch||0)*k};
      case "POLYGON": { const p=poly(plat(f.p||[])); if(p)return p; break; }
    }
  }else if(u&&Array.isArray(u.plans)&&u.plans.length&&u.plans[0].o){
    const p=poly(plat(u.plans[0].o));
    if(p)return p;
  }
  return {shape:"circ",w:d*k,h:d*k};
}

/* La pastille d'un padstack, sur le cuivre voulu : celle de la couche
   `c` si elle existe, sinon la première posée sur un cuivre, sinon la
   première tout court. Rend {f, d} ou null. */
function vpPadDe(ps,c,rangDe,estCuivre){
  if(!ps)return null;
  const pads=(ps.pads||[]).filter(p=>p&&!(p.a&&!p.d));
  let choix=null;
  if(c>=0)choix=pads.find(p=>rangDe(p.c)===c)||null;
  if(!choix)choix=pads.find(p=>estCuivre(rangDe(p.c)))||null;
  if(!choix)choix=pads[0]||null;
  return {f:choix?choix.f:"", d:(choix&&choix.d)||ps.pad||ps.trou||0.5};
}

/* Traduction complète. Rend {doc, bilan} ; `bilan` dit ce qui est passé et
   ce qui ne l'a pas fait. Lève une erreur quand la carte ne peut pas entrer
   dans l'éditeur (pas de cuivre, plus de huit couches). */
function ipcVersPcb(modele,nomCarte){
  if(!modele||!Array.isArray(modele.couches))throw new Error("aucune carte ouverte");
  const k=vpEchelle(modele.unites);
  const couches=mdlCouches(modele);
  const rangDe=vpIndexCouches(modele.couches);
  const cus=couches.filter(c=>c.cuivre).sort((a,b)=>a.rangCu-b.rangCu);
  if(!cus.length)throw new Error("la carte ne déclare aucune couche de cuivre");
  if(cus.length>8)
    throw new Error("la carte a "+cus.length+" couches de cuivre ; l'éditeur PCB en gère 8 au plus");
  const cu=VP_CU_PERMIS.find(n=>n>=cus.length);
  /* rang IPC → couche de l'éditeur : le dernier cuivre est toujours le dessous */
  const versEd=new Map();
  cus.forEach(function(c,r){ versEd.set(c.i,(r===cus.length-1)?cu-1:r); });
  const coucheEd=function(i){ return versEd.has(i)?versEd.get(i):-1; };
  const estCuivre=function(i){ return versEd.has(i); };
  const dessous=cus[cus.length-1].i;
  const nets=modele.nets||[];
  const netNom=function(i){ return (i!=null&&i>=0&&i<nets.length)?String(nets[i]||""):""; };
  const bilan={composants:0,renumerotes:0,pastillesLibres:0,pistes:0,arcs:0,vias:0,
               trous:0,zones:0,ignores:{textes:(modele.textes||[]).length,
               pistesHorsCuivre:0,decoupesCarte:0},unites:k!==1?String(modele.unites):""};

  /* --- repère : boîte de la carte, Y retourné, posée à partir de (0, 0) --- */
  let x1=Infinity,y1=Infinity,x2=-Infinity,y2=-Infinity;
  const voir=function(x,y){x1=Math.min(x1,x);x2=Math.max(x2,x);y1=Math.min(y1,y);y2=Math.max(y2,y);};
  const contour=modele.contour&&Array.isArray(modele.contour.o)?modele.contour.o:null;
  if(contour&&contour.length>=6)for(let i=0;i+1<contour.length;i+=2)voir(contour[i],contour[i+1]);
  else{
    for(const p of (modele.pistes||[]))for(let i=0;i+1<p.p.length;i+=2)voir(p.p[i],p.p[i+1]);
    for(const c of (modele.composants||[]))voir(c.x,c.y);
    for(const t of (modele.percages||[]))voir(t.x,t.y);
  }
  if(!isFinite(x1)){x1=0;y1=0;x2=100/k;y2=80/k;}
  const X0=x1, Y0=y2;
  const X=function(x){ return vpR4((x-X0)*k); };
  const Y=function(y){ return vpR4((Y0-y)*k); };

  const doc={format:"pcbedit-1",cu:cu,cuL:[],
    board:{x:0,y:0,w:vpR4(Math.max(1,(x2-x1)*k)),h:vpR4(Math.max(1,(y2-y1)*k)),pts:null},
    /* l'origine utilisateur sur celle du fichier, et c'est elle qui sert aux
       fichiers de fabrication : X et Y y ressortent tels que le fichier les
       donnait */
    origin:{x:vpR4(-X0*k),y:vpR4(Y0*k)},fabOrigin:true,
    fps:[],tracks:[],vias:[],zones:[],cuts:[],holes:[],drawings:[],nextId:1};
  for(let i=0;i<cu;i++){
    const src=cus.find(c=>coucheEd(c.i)===i);
    doc.cuL.push(src?{name:String(src.nom).slice(0,40)}:{});
  }
  /* épaisseurs de cuivre et épaisseur totale, quand le fichier les donne */
  const stack={cu:[]};
  for(let i=0;i<cu;i++){
    const src=cus.find(c=>coucheEd(c.i)===i);
    const t=src&&src.ep>0?src.ep*k:0;
    stack.cu.push(t>=0.001&&t<=2?{t:vpR4(t)}:{});
  }
  if(modele.epaisseur>0&&modele.epaisseur*k>=0.05)stack.target=vpR4(modele.epaisseur*k);
  doc.stack=stack;
  if(contour&&contour.length>=6){
    const pts=[];
    for(let i=0;i+1<contour.length;i+=2)pts.push({x:X(contour[i]),y:Y(contour[i+1])});
    const a=pts[0], b=pts[pts.length-1];
    if(pts.length>3&&a.x===b.x&&a.y===b.y)pts.pop();
    if(pts.length>=3)doc.board.pts=pts;
    bilan.ignores.decoupesCarte=(modele.contour.t||[]).length;
  }

  /* --- perçages, rangés par position : un trou sous une pastille de
         composant lui donne son perçage, les autres sont des vias --- */
  const trouEn=new Map();
  for(const t of (modele.percages||[]))trouEn.set(vpCle(t.x,t.y),t);
  const pris=new Set();                // positions IPC déjà servies par une pastille

  /* --- composants --- */
  let id=1;
  const poserEmpreinte=function(ref,valeur,pkg,hote,pads){
    const surDessous=!!hote.m||hote.c===dessous;
    const side=surDessous?1:0;
    const flipX=(side^(hote.m?1:0))===1;
    /* numéros : les broches entières et distinctes gardent le leur, sinon le
       composant est renuméroté dans l'ordre, et le nom suit la pastille */
    const brochesTxt=pads.map(p=>p.pin==null?"":String(p.pin).trim());
    const distincts=[...new Set(brochesTxt.filter(Boolean))];
    const entiers=distincts.length&&distincts.every(b=>/^\d+$/.test(b)&&+b>=1&&+b<=4096);
    const numDe=new Map();
    if(entiers)for(const b of distincts)numDe.set(b,+b);
    else distincts.forEach((b,i)=>numDe.set(b,i+1));
    let suivant=entiers?Math.max(0,...distincts.map(Number))+1:distincts.length+1;
    if(!entiers&&distincts.length)bilan.renumerotes++;
    const fp={id:id++,ref:String(ref||("U"+id)).slice(0,32),value:String(valeur||"").slice(0,240),
              pkg:String(pkg||"").slice(0,40),x:X(hote.x),y:Y(hote.y),
              rot:-(hote.r||0),side:side,nets:{},pads:[]};
    pads.forEach(function(p,j){
      const b=brochesTxt[j];
      const n=b?numDe.get(b):suivant++;
      if(n>4096)return;
      const ps=modele.padstacks?modele.padstacks[p.ps]:null;
      const pd=vpPadDe(ps,hote.c,rangDe,estCuivre);
      const forme=vpForme(modele,pd?pd.f:"",pd?pd.d:0.5,k);
      /* pastille dans le repère de l'empreinte : Y retourné toujours, X
         retourné quand le miroir de l'éditeur (la face) diffère de celui du
         fichier */
      const q={n:n,x:vpR4((flipX?-1:1)*(p.x||0)*k),y:vpR4(-(p.y||0)*k),
               w:vpR4(forme.w),h:vpR4(forme.h),shape:forme.shape,drill:0,rot:0};
      const pr=p.r||0;
      q.rot=flipX?pr+180:-pr;
      if(forme.pts){
        q.pts=forme.pts.map(function(s){
          let sx=p.m?-s.x:s.x, sy=s.y;
          if(!flipX)sy=-sy;
          return {x:vpR4(sx),y:vpR4(sy)};
        });
      }
      if(forme.chamfer!=null)q.chamfer=vpR4(forme.chamfer);
      if(!entiers&&b)q.nom=b.slice(0,16);
      /* le perçage : celui du padstack, ou le trou que le fichier pose pile
         sous la pastille */
      const w=mdlPlacer(p.x||0,p.y||0,hote.x,hote.y,hote.r,!!hote.m);
      const t=trouEn.get(vpCle(w.x,w.y));
      let drill=ps&&ps.trou>0?ps.trou*k:0;
      if(t&&t.d>0){drill=drill||t.d*k; pris.add(vpCle(w.x,w.y));}
      else if(drill)pris.add(vpCle(w.x,w.y));
      if(drill>0){
        q.drill=vpR4(drill);
        /* une pastille traversante plus petite que son trou n'existe pas :
           l'anneau minimal la remet autour */
        if(Math.min(q.w,q.h)<drill+0.1){
          if(q.shape==="poly"){q.shape="circ";delete q.pts;}
          q.w=Math.max(q.w,vpR4(drill+0.2));q.h=Math.max(q.h,vpR4(drill+0.2));
        }
      }
      pris.add("pad:"+vpCle(w.x,w.y));
      fp.pads.push(q);
      const net=netNom(p.n);
      if(net&&fp.nets[n]==null)fp.nets[n]=net;
    });
    if(!fp.pads.length)return null;
    /* les nets portés par les broches logiques, à défaut des pastilles */
    if(entiers)for(const b of (hote.pins||[])){
      const n=numDe.get(String(b.num));
      const net=netNom(b.n);
      if(n&&net&&fp.nets[n]==null)fp.nets[n]=net;
    }
    fp.pins=Math.max(...fp.pads.map(q=>q.n));
    doc.fps.push(fp);
    return fp;
  };
  for(const c of (modele.composants||[])){
    if(!Array.isArray(c.pads)||!c.pads.length)continue;
    if(poserEmpreinte(c.ref,c.val,c.pkg,c,c.pads))bilan.composants++;
  }

  /* --- vias et trous : ce qui n'est pas sous une pastille de composant --- */
  const viaEn=new Set();
  for(const t of (modele.percages||[])){
    const cle=vpCle(t.x,t.y);
    if(pris.has(cle))continue;
    const d=(t.d||0)*k;
    if(!(d>0))continue;
    const metal=!/NON/i.test(String(t.p||""));        // PLATED, VIA, ou non dit
    if(!metal){
      doc.holes.push({id:id++,x:X(t.x),y:Y(t.y),d:vpR4(d)});
      bilan.trous++;
      continue;
    }
    const ps=modele.padstacks?modele.padstacks[t.ps]:null;
    let dia=ps&&ps.pad>0?ps.pad*k:(t.a>0?d+2*t.a*k:d+0.3);
    dia=Math.max(dia,d+0.1);
    const v={x:X(t.x),y:Y(t.y),d:vpR4(dia),drill:vpR4(d),a:0,b:cu-1,net:netNom(t.n)};
    if(t.sa!=null&&t.sb!=null){
      const a=coucheEd(t.sa), b=coucheEd(t.sb);
      if(a>=0&&b>=0&&a!==b){v.a=Math.min(a,b);v.b=Math.max(a,b);}
    }
    doc.vias.push(v);
    viaEn.add(cle);
    bilan.vias++;
  }

  /* --- pastilles libres : celles des vias et des composants sont déjà là ;
         les autres (points de test, mires) deviennent une empreinte d'une
         pastille --- */
  let np=0;
  for(const p of (modele.pads||[])){
    const cle=vpCle(p.x,p.y);
    if(viaEn.has(cle)||pris.has("pad:"+cle))continue;
    const ps=modele.padstacks?modele.padstacks[p.ps]:null;
    let c=-1;
    if(ps)for(const pd of (ps.pads||[])){const r=rangDe(pd.c);if(estCuivre(r)){c=r;break;}}
    if(c<0&&!(ps&&ps.trou>0))continue;          // ni cuivre ni trou : rien à poser
    const hote={x:p.x,y:p.y,r:p.r||0,m:p.m?1:0,c:c};
    if(poserEmpreinte("P"+(++np),"","",hote,[{x:0,y:0,ps:p.ps,pin:"1",n:p.n}]))
      bilan.pastillesLibres++;
    pris.add("pad:"+cle);
  }

  /* --- pistes et arcs, sur le cuivre seulement --- */
  for(const p of (modele.pistes||[])){
    const l=coucheEd(p.c);
    if(l<0||!(p.w>0)){bilan.ignores.pistesHorsCuivre++;continue;}
    const net=netNom(p.n), w=vpR4(Math.max(0.01,p.w*k));
    for(let i=0;i+3<p.p.length;i+=2){
      const t={l:l,net:net,w:w,x1:X(p.p[i]),y1:Y(p.p[i+1]),x2:X(p.p[i+2]),y2:Y(p.p[i+3])};
      if(t.x1===t.x2&&t.y1===t.y2)continue;
      doc.tracks.push(t);
      bilan.pistes++;
    }
  }
  for(const a of (modele.arcs||[])){
    const l=coucheEd(a.c);
    if(l<0||!(a.w>0)||!a.s||!a.e||!a.m){bilan.ignores.pistesHorsCuivre++;continue;}
    const g=mdlArc(a);
    if(!(g.r>0))continue;
    /* balayage signé dans le repère du fichier (sens trigonométrique positif),
       puis retourné avec l'axe Y. Coupé en morceaux de moins d'un demi-tour :
       l'éditeur déduit le centre de la corde, et un tour complet n'en a pas. */
    const balaye=(a.h?-1:1)*mdlArcAngle(g);
    const morceaux=Math.max(1,Math.ceil(Math.abs(balaye)/(Math.PI*0.99)));
    const net=netNom(a.n), w=vpR4(Math.max(0.01,a.w*k));
    for(let j=0;j<morceaux;j++){
      const t1=g.d+balaye*j/morceaux, t2=g.d+balaye*(j+1)/morceaux;
      const t={l:l,net:net,w:w,
               x1:X(g.cx+g.r*Math.cos(t1)),y1:Y(g.cy+g.r*Math.sin(t1)),
               x2:X(g.cx+g.r*Math.cos(t2)),y2:Y(g.cy+g.r*Math.sin(t2)),
               ca:vpR4(-balaye/morceaux)};
      if(t.x1===t.x2&&t.y1===t.y2)continue;
      doc.tracks.push(t);
      bilan.arcs++;
    }
  }

  /* --- plans → zones : le contour extérieur de chaque morceau --- */
  for(const pl of (modele.plans||[])){
    const l=coucheEd(pl.c);
    if(l<0)continue;
    for(const g of (pl.g||[])){
      if(!g||!Array.isArray(g.o)||g.o.length<6)continue;
      const pts=[];
      for(let i=0;i+1<g.o.length;i+=2)pts.push({x:X(g.o[i]),y:Y(g.o[i+1])});
      const a=pts[0], b=pts[pts.length-1];
      if(pts.length>3&&a.x===b.x&&a.y===b.y)pts.pop();
      if(pts.length<3)continue;
      doc.zones.push({id:id++,l:l,net:netNom(pl.n),pts:pts});
      bilan.zones++;
    }
  }

  doc.nextId=id;
  if(nomCarte)bilan.fichier=String(nomCarte);
  return {doc:doc,bilan:bilan};
}

/* Le bilan en une phrase, pour le pied de page et la confirmation. */
function ipcVersPcbResume(b){
  const L=[b.composants+" composant(s)",b.pistes+" segment(s)",b.arcs+" arc(s)",
           b.vias+" via(s)",b.zones+" zone(s)"];
  if(b.trous)L.push(b.trous+" trou(s) non métallisé(s)");
  if(b.pastillesLibres)L.push(b.pastillesLibres+" pastille(s) isolée(s)");
  let t=L.join(", ");
  if(b.unites)t+=" — converti de "+b.unites+" en mm";
  if(b.renumerotes)t+=" — "+b.renumerotes+" composant(s) renuméroté(s), nom de broche gardé";
  const ign=[];
  if(b.ignores.textes)ign.push(b.ignores.textes+" texte(s)");
  if(b.ignores.pistesHorsCuivre)ign.push(b.ignores.pistesHorsCuivre+" tracé(s) hors cuivre");
  if(b.ignores.decoupesCarte)ign.push(b.ignores.decoupesCarte+" découpe(s) de carte");
  if(ign.length)t+=" — non repris : "+ign.join(", ");
  return t+".";
}

/* ==========================================================================
   Le bouton : présent dans un projet, absent en visionneuse seule
   ========================================================================== */
function vpProjetOuvert(){
  if(typeof projNom!=="function"||!projNom())return false;
  if(typeof sessAutonome==="function"&&sessAutonome())return false;   // pas d'éditeur à côté
  return true;
}
function vpBoutonEtat(){
  const b=typeof document!=="undefined"?document.getElementById("bVersPcb"):null;
  if(!b)return;
  b.hidden=!vpProjetOuvert();
  b.disabled=!V.modele;
}

/* Le geste. Avec un dossier de projet, la carte s'écrit à sa place
   (« <projet>-PCB.json ») et l'éditeur la lit en arrivant ; sans dossier,
   elle voyage par la session de l'onglet. Dans les deux cas, une carte PCB
   qui existe déjà n'est remplacée qu'avec l'accord de l'utilisateur. */
function ipcPousserVersPcb(){
  if(!V.modele||!vpProjetOuvert())return Promise.resolve(false);
  let res;
  try{ res=ipcVersPcb(V.modele,V.fichier); }
  catch(e){ hint("Impossible de passer la carte à l'éditeur PCB : "+e.message); return Promise.resolve(false); }
  const resume=ipcVersPcbResume(res.bilan);
  const lie=typeof projdLie==="function"&&projdLie();
  const docs=lie&&typeof projdDocuments==="function"?projdDocuments():null;
  const enSession=typeof sessLire==="function"?sessLire("pcb"):null;
  const existe=(docs&&docs.pcb&&docs.pcb.present)||
               !!(enSession&&enSession.etat&&enSession.etat.doc&&
                  Array.isArray(enSession.etat.doc.fps)&&enSession.etat.doc.fps.length);
  if(existe&&!confirm("Le projet « "+projNom()+" » a déjà une carte PCB.\n\n"+
       "La remplacer par celle-ci, traduite de l'IPC-2581 ?\n\n"+resume))
    return Promise.resolve(false);
  const partir=function(){
    hint("Carte passée à l'éditeur PCB : "+resume);
    if(typeof sessAller==="function")sessAller("pcb");
    return true;
  };
  if(lie){
    return projdDocEcrire("pcb",res.doc).then(function(){
      /* la session d'onglet passe devant le fichier à l'ouverture de
         l'éditeur : l'ancienne carte qu'elle porterait doit s'effacer */
      if(typeof sessEffacer==="function")sessEffacer("pcb");
      return partir();
    }).catch(function(e){
      hint("Écriture refusée : "+e.message+" — la carte passe par la session de l'onglet.");
      return vpParSession(res.doc)?partir():false;
    });
  }
  return Promise.resolve(vpParSession(res.doc)?partir():false);
}
/* La carte voyage dans la session de l'onglet, marquée « à enregistrer » :
   elle n'est encore écrite nulle part. */
function vpParSession(doc){
  const ok=typeof sessEcrire==="function"&&
           sessEcrire("pcb",{doc:doc,sale:true,fichier:(V.fichier||"").replace(/\.[^.]+$/,"")});
  if(!ok)hint("La carte est trop lourde pour la session de l'onglet : rattachez un "+
              "dossier au projet (page d'accueil), elle y sera écrite.");
  return ok;
}

(function(){
  if(typeof document==="undefined")return;
  const b=document.getElementById("bVersPcb");
  if(!b)return;
  b.onclick=function(){ ipcPousserVersPcb(); };
  vpBoutonEtat();
  try{ projSurChangement(vpBoutonEtat); }catch(_){}
})();
