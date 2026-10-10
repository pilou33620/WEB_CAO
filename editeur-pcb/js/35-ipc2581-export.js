"use strict";
/* ==========================================================================
   Éditeur PCB — export IPC-2581 (révision C)
   --------------------------------------------------------------------------
   UN SEUL FICHIER POUR TOUTE LA CARTE. Le dossier de fabrication éclate la
   carte en vingt fichiers (Gerber, Excellon, IPC-D-356, CSV, feuille
   d'empilage) que le fabricant recolle. IPC-2581 les tient ensemble, en XML :
   l'empilage avec ses matières, le cuivre avec ses nets, les perçages avec
   leur portée, les composants avec leur empreinte et leur nomenclature. C'est
   ce que lisent les chaînes de FAO récentes, et c'est ce que lit la
   visionneuse de ce dépôt (python/ipc2581_parser.py → ipc2581_json.py).

   POURQUOI LA RÉVISION C. Elle est la révision en vigueur (2020), celle
   qu'écrit KiCad par défaut, et ses deux XSD sont publiés. Ce qui compte ici
   — <Backdrill>, <Conductor type="SURFACE_ROUGHNESS_UPFACING">, les
   <Dielectric> — existe aussi en B ; la C ajoute la finition de surface en
   <SurfaceFinish> (normalisée par les codes de l'IPC-6012), le type de
   <Step> et l'état de l'empilage, et retire le niveau des <FunctionMode>.
   Le fichier est validé contre IPC-2581C.xsd (celui que KiCad garde dans
   qa/data/pcbnew/ipc2581) par le banc test/banc-ipc2581-export.py.

   CE QUI PART, section par section :
     Content         rôle, fonction (USERDEF : fabrication, assemblage et
                     nomenclature réunis), dictionnaires de traits et de formes
     LogisticHeader  émetteur, entreprise, auteur (dossier de projet)
     HistoryRecord   date, logiciel, révision du projet
     Bom             une ligne par référence de commande : repères, valeur,
                     MPN, fabricant ; populate="false" pour ce que la variante
                     active ne pose pas (les autres variantes en attribut de
                     chaque composant : la norme n'admet qu'un repère par
                     fichier, donc une seule nomenclature)
     Ecad/CadHeader  millimètres ; une <Spec> par couche d'empilage — matière,
                     εr, tan δ, rugosité du cuivre —, une par contre-perçage
                     (<Backdrill> START_LAYER / MUST_NOT_CUT_LAYER /
                     MAX_STUB_LENGTH, comme KiCad), la finition de surface
     CadData/Layer   cuivres (SIGNAL, MIXED ou PLANE selon le rôle de
                     couche), diélectriques, masque, pâte, sérigraphie,
                     contour, un calque de perçage par portée (<Span>), un
                     calque par passe de contre-perçage, les trous NPTH
     Stackup         la coupe complète, masque compris
     Step            profil (contour et découpes, arcs reconnus et gardés en
                     <PolyStepCurve>), empreintes (<Package>),
                     composants (place, rotation, face), nets logiques et
                     physiques, piles de pastilles (<PadStackDef>), et le
                     contenu de chaque calque (<LayerFeature>) : pistes avec
                     leur largeur, arcs gardés en arcs, pastilles, vias,
                     zones REMPLIES, textes et traits de sérigraphie,
                     ouvertures de masque et de pâte, trous

   LES ZONES PARTENT REMPLIES. Une zone de l'éditeur est un contour : son
   cuivre se calcule au rendu (dégagements, liaisons thermiques, marge de
   bord). Le Gerber le dit en polarité négative ; IPC-2581 veut le cuivre
   lui-même, un <Contour> et ses <Cutout>. `ipcRemplir` le calcule en
   géométrie exacte, sans trame : la zone, rognée à la carte moins sa marge,
   privée des dégagements du cuivre étranger, avec ses liaisons thermiques.
   Les dégagements sont des polygones CIRCONSCRITS à leurs cercles : un
   isolement exporté n'est jamais plus petit que la règle.

   REPÈRE : celui des Gerber (`gOrigin`), Y vers le haut, millimètres. Les
   rotations sont comptées dans le sens trigonométrique, comme le veut la
   norme — l'éditeur les compte dans le sens horaire. Un composant posé
   dessous est miroir en X puis tourné (`mirror="true"`), l'ordre que suit la
   visionneuse.

   CE QUI NE PART PAS : la stratégie de remplissage (seul le résultat compte
   pour le fabricant), les règles de conception (classes, matrice), les
   paires différentielles et les contraintes, qui n'ont pas d'écriture
   reconnue par les outils de FAO ; les formes de rugosité de Huray, qui
   n'ont pas de type normalisé, partent en <Conductor type="OTHER"> commenté.
   Comme le Gerber, une zone ne se dégage pas autour d'un trou NPTH.

   À LA RELECTURE : un <Text> se place par la <Location> de son <Features>,
   la seule place que le XSD lui laisse ; python/ipc2581_parser.py (1.77) ne
   lit la position que DANS le <Text>, et pose donc ces textes en (0 ; 0).
   Leurs traits, eux, sont bien placés.
   ========================================================================== */

const IPC2581_REV="C";
const IPC2581_NS="http://webstds.ipc.org/2581";
const IPC_FLECHE=0.005;            // mm : flèche tolérée d'un cercle en polygone

/* ==========================================================================
   Écriture XML
   Un nœud est [balise, attributs, enfants] ; les attributs sont une liste de
   paires, dans l'ordre où on les veut lire. Une valeur nulle ou indéfinie
   n'écrit pas l'attribut.
   ========================================================================== */
function ipcEsc(s){
  return String(s).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f￾￿]/g,"")
    .replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}
function ipcXml(n,ind,out){
  const [b,a,k]=n;
  let s=ind+"<"+b;
  for(const [c,v] of (a||[]))if(v!=null&&v!=="")s+=" "+c+'="'+ipcEsc(v)+'"';
  if(!k||!k.length){out.push(s+"/>");return;}
  out.push(s+">");
  for(const e of k)if(e)ipcXml(e,ind+" ",out);
  out.push(ind+"</"+b+">");
}
/* Un nombre au micromètre près, sans zéros inutiles ni « -0 ». */
function ipcN(v){
  const r=Math.round((+v||0)*1e6)/1e6;
  return String(r===0?0:r);
}
/* Un angle en degrés, ramené dans [0, 360[ — `nonNegativeDoubleType`. */
function ipcAng(deg){
  let a=Math.round((((+deg||0)%360)+360)%360*1e6)/1e6;
  if(a>=360)a=0;
  return String(a);
}
/* Un nom au format `qualifiedNameType` de la norme : non vide, au plus un
   deux-points. On les remplace tous, comme KiCad. */
function ipcNom(s,repli){
  const t=String(s==null?"":s).replace(/[\u0000-\u001f]/g,"").replace(/:/g,"_").trim();
  return t||repli;
}
/* Noms uniques : le second « R1 » devient « R1_2 ». */
function ipcUnique(){
  const pris=new Set();
  return (s)=>{
    let n=s,k=2;
    while(pris.has(n))n=s+"_"+(k++);
    pris.add(n);
    return n;
  };
}

/* ==========================================================================
   Géométrie : polygones des dégagements
   ========================================================================== */
/* Côtés d'un cercle de rayon r pour une flèche de IPC_FLECHE. */
function ipcCotes(r){
  if(!(r>IPC_FLECHE))return 8;
  return clamp(Math.ceil(Math.PI/Math.acos(1-IPC_FLECHE/r)),8,64);
}
/* Le cercle en polygone. Circonscrit (`ext`), il contient le cercle vrai :
   c'est la forme d'un dégagement. */
function ipcCercle(x,y,r,ext){
  const n=ipcCotes(r), R=ext?r/Math.cos(Math.PI/n):r, out=[];
  for(let k=0;k<n;k++){
    const a=2*Math.PI*k/n;
    out.push({x:x+R*Math.cos(a),y:y+R*Math.sin(a)});
  }
  return out;
}
/* Enveloppe convexe (chaîne monotone). */
function ipcEnveloppe(P){
  const p=P.slice().sort((a,b)=>a.x-b.x||a.y-b.y);
  if(p.length<3)return p;
  const cr=(o,a,b)=>(a.x-o.x)*(b.y-o.y)-(a.y-o.y)*(b.x-o.x);
  const lo=[],hi=[];
  for(const q of p){while(lo.length>=2&&cr(lo[lo.length-2],lo[lo.length-1],q)<=0)lo.pop();lo.push(q);}
  for(let i=p.length-1;i>=0;i--){
    const q=p[i];
    while(hi.length>=2&&cr(hi[hi.length-2],hi[hi.length-1],q)<=0)hi.pop();hi.push(q);
  }
  hi.pop();lo.pop();
  return lo.concat(hi);
}
/* Un segment épaissi de r, bouts ronds — la gélule d'un trait. */
function ipcGelule(x1,y1,x2,y2,r){
  return ipcEnveloppe(ipcCercle(x1,y1,r,true).concat(ipcCercle(x2,y2,r,true)));
}
/* Le dégagement d'une piste : une gélule par corde, l'arc étant découpé
   (`trkSegs`) ; la flèche des cordes s'ajoute au rayon, pour que le ventre de
   l'arc reste couvert. */
function ipcPisteDegagee(t,r){
  if(!arcOf(t))return [ipcGelule(t.x1,t.y1,t.x2,t.y2,r)];
  return trkSegs(t,IPC_FLECHE).map(s=>ipcGelule(s.x1,s.y1,s.x2,s.y2,r+IPC_FLECHE));
}
/* Le dégagement d'une pastille, dilatée de g. Le rectangle adouci part en
   rectangle vif : il contient l'arrondi. */
function ipcPastilleDegagee(q,g){
  if(q.shape==="circ")return ipcCercle(q.x,q.y,Math.max(q.w,q.h)/2+g,true);
  if(q.shape==="oval"){
    const lg=Math.max(q.w,q.h), r=Math.min(q.w,q.h)/2, d=lg/2-r;
    const a=(q.rot||0)+(q.h>q.w?Math.PI/2:0), ux=Math.cos(a)*d, uy=Math.sin(a)*d;
    return ipcGelule(q.x-ux,q.y-uy,q.x+ux,q.y+uy,r+g);
  }
  return padWorldPts(q,g);
}
function ipcBoite(P){
  const b=polyBBox(P);
  return {x1:b.x1,y1:b.y1,x2:b.x2,y2:b.y2};
}
function ipcSeRecoupent(a,b){return a.x1<=b.x2&&b.x1<=a.x2&&a.y1<=b.y2&&b.y1<=a.y2;}

/* ==========================================================================
   Opérations booléennes sur des polygones, par classement des arêtes
   --------------------------------------------------------------------------
   `dedans(x,y)` dit si un point est dans la région voulue — n'importe quelle
   combinaison de polygones. Toutes les arêtes de tous les polygones sont
   coupées à leurs croisements ; un tronçon est un bord de la région quand un
   de ses côtés est dedans et l'autre dehors, et on l'oriente pour garder la
   région à sa gauche. Les tronçons se rechaînent en boucles : les extérieurs
   tournent d'un sens (aire positive), les trous de l'autre. Pas de trame,
   pas de tolérance de pixel : le résultat a la précision des polygones.
   Rend [{o:[pts], t:[[pts]…]}], ou null si les boucles ne se ferment pas
   (géométrie dégénérée) — l'appelant se replie alors.
   ========================================================================== */
function ipcBooleen(polys,dedans){
  const E=[];
  for(const P of polys){
    const n=P.length;
    for(let i=0;i<n;i++){
      const a=P[i], b=P[(i+1)%n];
      if(a.x===b.x&&a.y===b.y)continue;
      E.push({ax:a.x,ay:a.y,bx:b.x,by:b.y,t:[]});
    }
  }
  if(!E.length)return [];
  /* les croisements, par une grille : seules les arêtes qui partagent une
     case se comparent */
  let X1=Infinity,Y1=Infinity,X2=-Infinity,Y2=-Infinity;
  for(const e of E){
    X1=Math.min(X1,e.ax,e.bx);X2=Math.max(X2,e.ax,e.bx);
    Y1=Math.min(Y1,e.ay,e.by);Y2=Math.max(Y2,e.ay,e.by);
  }
  const nc=clamp(Math.ceil(Math.sqrt(E.length)),1,512);
  const cw=Math.max((X2-X1)/nc,1e-6), ch=Math.max((Y2-Y1)/nc,1e-6);
  const cases=new Map();
  E.forEach((e,i)=>{
    const i1=clamp(Math.floor((Math.min(e.ax,e.bx)-X1)/cw),0,nc-1), i2=clamp(Math.floor((Math.max(e.ax,e.bx)-X1)/cw),0,nc-1);
    const j1=clamp(Math.floor((Math.min(e.ay,e.by)-Y1)/ch),0,nc-1), j2=clamp(Math.floor((Math.max(e.ay,e.by)-Y1)/ch),0,nc-1);
    for(let x=i1;x<=i2;x++)for(let y=j1;y<=j2;y++){
      const k=x*1024+y;
      let L=cases.get(k);if(!L)cases.set(k,L=[]);
      L.push(i);
    }
  });
  const coupe=(e,f)=>{
    const rx=e.bx-e.ax, ry=e.by-e.ay, sx=f.bx-f.ax, sy=f.by-f.ay;
    const qx=f.ax-e.ax, qy=f.ay-e.ay, den=rx*sy-ry*sx;
    const lr=Math.hypot(rx,ry), ls=Math.hypot(sx,sy);
    if(Math.abs(den)<=1e-12*lr*ls){
      /* parallèles : seules les colinéaires se recouvrent, et se coupent
         alors aux bouts l'une de l'autre */
      if(Math.abs(qx*ry-qy*rx)/lr>1e-9)return;
      const pr=(px,py,g)=>((px-g.ax)*(g.bx-g.ax)+(py-g.ay)*(g.by-g.ay))/((g.bx-g.ax)**2+(g.by-g.ay)**2);
      e.t.push(pr(f.ax,f.ay,e),pr(f.bx,f.by,e));
      f.t.push(pr(e.ax,e.ay,f),pr(e.bx,e.by,f));
      return;
    }
    const t=(qx*sy-qy*sx)/den, u=(qx*ry-qy*rx)/den;
    if(t>-1e-12&&t<1+1e-12&&u>-1e-12&&u<1+1e-12){e.t.push(t);f.t.push(u);}
  };
  for(const L of cases.values())
    for(let i=0;i<L.length;i++)for(let j=i+1;j<L.length;j++)coupe(E[L[i]],E[L[j]]);
  /* les sommets, fondus au micromètre près : deux calculs du même point
     doivent donner le même sommet */
  const V=[], pool=new Map(), PAS=2e-6;
  const som=(x,y)=>{
    const gx=Math.round(x/PAS), gy=Math.round(y/PAS);
    for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++){
      const L=pool.get((gx+dx)+","+(gy+dy));
      if(L)for(const i of L)if(Math.abs(V[i].x-x)<=1e-6&&Math.abs(V[i].y-y)<=1e-6)return i;
    }
    const k=gx+","+gy;
    let L=pool.get(k);if(!L)pool.set(k,L=[]);
    L.push(V.length);V.push({x,y});
    return V.length-1;
  };
  /* les tronçons de bord, orientés région à gauche */
  const gardes=new Map();
  for(const e of E){
    const ts=[0].concat(e.t.filter(t=>t>1e-9&&t<1-1e-9).sort((a,b)=>a-b),[1]);
    let prec=som(e.ax,e.ay);
    for(let k=1;k<ts.length;k++){
      if(ts[k]-ts[k-1]<1e-12)continue;
      const cur=k===ts.length-1?som(e.bx,e.by):som(e.ax+(e.bx-e.ax)*ts[k],e.ay+(e.by-e.ay)*ts[k]);
      if(cur===prec)continue;
      const p=V[prec], q=V[cur], dx=q.x-p.x, dy=q.y-p.y, L=Math.hypot(dx,dy);
      const eps=Math.min(2e-5,L*0.25), mx=(p.x+q.x)/2, my=(p.y+q.y)/2;
      const g=dedans(mx-dy/L*eps,my+dx/L*eps), d=dedans(mx+dy/L*eps,my-dx/L*eps);
      if(g!==d){
        const a=g?prec:cur, b=g?cur:prec, cle=a+">"+b, inv=b+">"+a;
        if(gardes.has(inv))gardes.delete(inv);
        else if(!gardes.has(cle))gardes.set(cle,{a,b,pris:false});
      }
      prec=cur;
    }
  }
  /* le chaînage : à chaque sommet, le tronçon qui tourne le plus à gauche
     — deux régions qui se touchent par un coin restent deux boucles */
  const sortants=new Map();
  for(const s of gardes.values()){
    let L=sortants.get(s.a);if(!L)sortants.set(s.a,L=[]);
    L.push(s);
  }
  const boucles=[];
  for(const s0 of gardes.values()){
    if(s0.pris)continue;
    s0.pris=true;
    const B=[s0.a];
    let cur=s0, garde=0;
    while(cur.b!==s0.a){
      if(++garde>gardes.size+2)return null;
      const L=(sortants.get(cur.b)||[]).filter(s=>!s.pris);
      if(!L.length)return null;
      const P=V[cur.a], Q=V[cur.b], ux=Q.x-P.x, uy=Q.y-P.y;
      let mieux=null, am=-Infinity;
      for(const s of L){
        const R=V[s.b], vx=R.x-Q.x, vy=R.y-Q.y;
        const ang=Math.atan2(ux*vy-uy*vx,ux*vx+uy*vy);
        if(ang>am){am=ang;mieux=s;}
      }
      mieux.pris=true;
      B.push(cur.b);
      cur=mieux;
    }
    boucles.push(B.map(i=>V[i]));
  }
  /* sommets alignés retirés, puis extérieurs et trous séparés */
  const net=P=>{
    let out=P;
    for(let passe=0;passe<2;passe++){
      const r=[];
      for(let i=0;i<out.length;i++){
        const a=out[(i+out.length-1)%out.length], b=out[i], c=out[(i+1)%out.length];
        const cr=(b.x-a.x)*(c.y-b.y)-(b.y-a.y)*(c.x-b.x), dot=(b.x-a.x)*(c.x-b.x)+(b.y-a.y)*(c.y-b.y);
        if(Math.abs(cr)<1e-12&&dot>0)continue;
        r.push(b);
      }
      out=r;
    }
    return out;
  };
  const ext=[], trous=[];
  for(const B of boucles){
    const P=net(B);
    if(P.length<3)continue;
    const A=signedArea(P);
    if(Math.abs(A)<1e-8)continue;
    (A>0?ext:trous).push({P,A:Math.abs(A)});
  }
  ext.sort((a,b)=>a.A-b.A);
  const out=ext.map(e=>({o:e.P,t:[],A:e.A}));
  for(const h of trous){
    /* un point juste à côté du trou, du côté de la région : l'extérieur le
       plus petit qui le contient est celui du trou */
    const p=h.P[0], q=h.P[1], dx=q.x-p.x, dy=q.y-p.y, L=Math.hypot(dx,dy)||1;
    const eps=Math.min(2e-5,L*0.25), x=(p.x+q.x)/2-dy/L*eps, y=(p.y+q.y)/2+dx/L*eps;
    const hote=out.find(e=>inPoly(x,y,e.o));
    if(hote)hote.t.push(h.P);
  }
  return out.map(e=>({o:e.o,t:e.t}));
}

/* ==========================================================================
   Le cuivre d'une zone, remplie comme à l'écran et dans le Gerber
   (`gerberCopper`) : la zone, rognée au contour moins la marge de bord et
   aux découpes, moins les découpes de zone et les trous du fichier, moins le
   dégagement de tout cuivre d'un autre net, moins l'anneau des liaisons
   thermiques, plus leurs bras. Rend les îlots, et `approx` si la géométrie
   n'a pas pu se calculer (les dégagements partent alors en <Cutout> qui
   peuvent se recouvrir).
   ========================================================================== */
function ipcRemplir(z){
  const i=z.l, zn=z.net||"", Z=z.pts, bz=ipcBoite(Z), m=S.rule.edge;
  const moins=[], plus=[];
  const prendre=(L,P)=>{if(P&&P.length>=3){const b=ipcBoite(P);if(ipcSeRecoupent(b,bz))L.push({P,b});}};
  /* la carte : la marge le long de chaque arête, les découpes et leur marge */
  const B=boardPoly();
  if(m>0)for(let k=0;k<B.length;k++){
    const a=B[k], b=B[(k+1)%B.length];
    prendre(moins,ipcGelule(a.x,a.y,b.x,b.y,m));
  }
  for(const D of boardCutouts()){
    prendre(moins,D);
    if(m>0)for(let k=0;k<D.length;k++){
      const a=D[k], b=D[(k+1)%D.length];
      prendre(moins,ipcGelule(a.x,a.y,b.x,b.y,m));
    }
  }
  for(const ct of S.cuts)if(ct.l===i)prendre(moins,ct.pts);
  const fichier=zoneFichier(z);
  if(fichier&&Array.isArray(z.trous))for(const t of z.trous)prendre(moins,t);
  /* le cuivre d'un autre net */
  for(const t of S.tracks){
    if(t.l!==i||(t.net||"")===zn)continue;
    for(const P of ipcPisteDegagee(t,t.w/2+clrK(zn,t.net,"cu","trk")))prendre(moins,P);
  }
  for(const v of S.vias){
    if(i<v.a||i>v.b||(v.net||"")===zn)continue;
    prendre(moins,ipcCercle(v.x,v.y,v.d/2+clrK(zn,v.net,"cu","via"),true));
  }
  for(const fp of S.fps)
    for(const q of padsWorld(fp)){
      if(!padLayers(fp,q).includes(i))continue;
      const meme=!!q.net&&q.net===zn;
      if(meme&&fichier)continue;                    // raccordée par le fichier
      const qc=padSurCouche(q,i);
      if(!qc){
        if(q.drill>0)prendre(moins,ipcCercle(q.x,q.y,q.drill/2+clrK(zn,q.net,"cu","th"),true));
        continue;
      }
      if(!meme){
        prendre(moins,ipcPastilleDegagee(qc,clrK(zn,q.net,"cu",q.drill>0?"th":"smd")));
        if(q.drill>0)prendre(moins,ipcCercle(q.x,q.y,q.drill/2+clrK(zn,q.net,"cu","th"),true));
        continue;
      }
      /* liaison thermique : l'anneau de l'isolement de la zone, et ses bras */
      prendre(moins,ipcPastilleDegagee(qc,classOf(zn).clr));
      const tw=(q.thermalWidth>0)?q.thermalWidth:S.rule.thermal;
      const nb=(q.thermalSpokes>0)?q.thermalSpokes:4;
      const a0=q.rot+((q.thermalAngle||0)*Math.PI/180);
      const len=Math.max(q.w,q.h)/2+classOf(q.net).clr+0.2;
      for(let k=0;k<nb;k++){
        const a=a0+(Math.PI*2/nb)*k, c=Math.cos(a), s=Math.sin(a), nx=-s*tw/2, ny=c*tw/2;
        prendre(plus,[{x:q.x+nx,y:q.y+ny},{x:q.x+len*c+nx,y:q.y+len*s+ny},
                      {x:q.x+len*c-nx,y:q.y+len*s-ny},{x:q.x-nx,y:q.y-ny}]);
      }
    }
  /* l'appartenance d'un point, par une grille sur les polygones */
  const grille=(L)=>{
    const pas=2, G=new Map();
    L.forEach((o,k)=>{
      for(let x=Math.floor(o.b.x1/pas);x<=Math.floor(o.b.x2/pas);x++)
        for(let y=Math.floor(o.b.y1/pas);y<=Math.floor(o.b.y2/pas);y++){
          const c=x+","+y;let A=G.get(c);if(!A)G.set(c,A=[]);A.push(k);
        }
    });
    return (x,y)=>{
      for(const k of (G.get(Math.floor(x/pas)+","+Math.floor(y/pas))||[])){
        const o=L[k];
        if(x>=o.b.x1&&x<=o.b.x2&&y>=o.b.y1&&y<=o.b.y2&&inPoly(x,y,o.P))return true;
      }
      return false;
    };
  };
  const dansMoins=grille(moins), dansPlus=grille(plus);
  const dedans=(x,y)=>inPoly(x,y,Z)&&((inPoly(x,y,B)&&!dansMoins(x,y))||dansPlus(x,y));
  const polys=[Z,B].concat(moins.map(o=>o.P),plus.map(o=>o.P));
  let ilots=null;
  try{ilots=ipcBooleen(polys,dedans);}catch(_){ilots=null;}
  if(ilots)return {ilots,approx:false};
  /* repli : la zone telle que dessinée, ses dégagements en découpes */
  return {ilots:[{o:Z,t:moins.filter(o=>ipcSeRecoupent(o.b,bz)).map(o=>o.P)}],approx:true};
}

/* ==========================================================================
   Le document
   ========================================================================== */
/* Les couches cuivre : le nom de l'éditeur s'il est unique et lisible. */
function ipcNomsCuivre(){
  const vus=new Set(), out=[];
  for(let i=0;i<S.cu;i++){
    let n=ipcNom(S.cuL[i]&&S.cuL[i].name,cuId(i,S.cu));
    if(vus.has(n.toUpperCase()))n=cuId(i,S.cu);
    vus.add(n.toUpperCase());out.push(n);
  }
  return out;
}
/* Fonction de couche selon son rôle : le plan se déclare PLANE, la visionneuse
   et les outils de FAO le lisent ainsi. */
function ipcFonctionCuivre(i){
  const r=layerRole(i);
  return rolePlane(r)?"PLANE":(r==="mixed"?"MIXED":"SIGNAL");
}
const IPC_FINITIONS={
  "ENIG (or chimique)":"ENIG-N","HASL étain-plomb":"S","HASL sans plomb":"b1",
  "OSP":"OSP","Argent chimique":"IAg","Or dur (contacts)":"G"};
const IPC_DIEL={core:"DIELCORE",prepreg:"DIELPREG",film:"DIELADHV"};
/* Nature IPC-2581 d'un boîtier, d'après le style de l'empreinte. */
function ipcTypeBoitier(fp){
  const p=String(fp.pkg||"").toUpperCase();
  if(/SOT-?23/.test(p))return "SOT23";
  if(/SOT-?89/.test(p))return "SOT89";
  if(/SOD-?123/.test(p))return "SOD123";
  if(/QFN|DFN/.test(p))return "CHIP_SCALE";
  return {chip:"CHIP",sop:"SOIC",quad:"SQUARE_QUAD_FLATPACK",bga:"PLASTIC_BGA",
          dip:"PLASTIC_DIP",row:"CONNECTOR_TH"}[fp.style]||"OTHER";
}
/* Où se trouve la broche 1 par rapport au centre du boîtier (vue de dessus,
   Y vers le haut), comme KiCad. */
function ipcBroche1(fp,ps){
  const q=ps.find(p=>p.n===1)||ps[0];
  if(!q||ps.length<2)return "OTHER";
  const b=fpLocalBox(fp), cx=(b.x1+b.x2)/2, cy=(b.y1+b.y2)/2;
  const tx=(b.x2-b.x1)/20, ty=(b.y2-b.y1)/20;
  const sx=Math.abs(q.x-cx)<=tx?0:(q.x<cx?-1:1), sy=Math.abs(q.y-cy)<=ty?0:(q.y<cy?1:-1);
  const T={"0,0":"CENTER","0,1":"UPPER_CENTER","0,-1":"LOWER_CENTER","-1,0":"LEFT","1,0":"RIGHT",
           "-1,1":"UPPER_LEFT","1,1":"UPPER_RIGHT","-1,-1":"LOWER_LEFT","1,-1":"LOWER_RIGHT"};
  return T[sx+","+sy];
}
/* Nature du net pour <LogicalNet netClass> */
function ipcClasseNet(n){
  if(GND_RE.test(String(n).replace(/\s/g,"")))return "GROUND";
  if(isPower(n))return "POWER";
  if(/horloge|clock/i.test(className(n))||/(^|_)(CLK|SCK|SCLK|MCLK|XTAL)/i.test(n))return "CLK";
  return "SIGNAL";
}

/* Construit le document. `opts.date` fige l'horodatage (banc d'essai).
   Rend {xml, stats}. */
function ipc2581Document(opts){
  opts=opts||{};
  const o=gOrigin(), X=x=>ipcN(x-o.x), Y=y=>ipcN(o.y-y);
  const n=S.cu, cuN=ipcNomsCuivre();
  const base=fabBase(), STEP=ipcNom(base,"CARTE"), BOM=ipcNom(base+"_BOM","BOM");
  const date=opts.date||new Date().toISOString().replace(/\.\d+Z$/,"Z");
  const stats={composants:0,nets:0,pistes:0,arcs:0,vias:0,trous:0,trousNpth:0,
               pastillesPercees:0,zones:0,ilots:0,approx:0,contrePercages:0,arcsContour:0};

  /* ---------- dictionnaires : traits et formes ---------- */
  const traits=new Map(), formes=new Map(), dicoT=[], dicoF=[];
  const trait=w=>{
    const k=ipcN(Math.max(0,w));
    if(!traits.has(k)){
      const id="TRAIT_"+(traits.size+1);
      traits.set(k,id);
      dicoT.push(["EntryLineDesc",[["id",id]],[["LineDesc",[["lineEnd","ROUND"],["lineWidth",k]]]]]);
    }
    return ["LineDescRef",[["id",traits.get(k)]]];
  };
  const forme=(cle,noeud)=>{
    if(!formes.has(cle)){
      const id="FORME_"+(formes.size+1);
      formes.set(cle,id);
      dicoF.push(["EntryStandard",[["id",id]],[noeud]]);
    }
    return ["StandardPrimitiveRef",[["id",formes.get(cle)]]];
  };
  /* Un polygone Y vers le haut, fermé sur son premier sommet. */
  const poly=(P,remp,local)=>{
    const tx=local?(p=>ipcN(p.x)):(p=>X(p.x)), ty=local?(p=>ipcN(-p.y)):(p=>Y(p.y));
    const k=[["PolyBegin",[["x",tx(P[0])],["y",ty(P[0])]]]];
    for(let i=1;i<P.length;i++)k.push(["PolyStepSegment",[["x",tx(P[i])],["y",ty(P[i])]]]);
    k.push(["PolyStepSegment",[["x",tx(P[0])],["y",ty(P[0])]]]);
    if(remp)k.push(["FillDesc",[["fillProperty",remp]]]);
    return k;
  };
  /* Le contour de la carte et ses découpes, arcs gardés. L'éditeur ne range
     qu'une liste de sommets : un coin arrondi ou une carte ronde importés y
     sont des suites de cordes égales. `dxfSegments` (33-draftsman-export.js)
     les reconnaît — c'est lui qui les rend en ARC au DXF — et elles partent
     ici en <PolyStepCurve>, sur le cercle qui passe exactement par les
     sommets : le contour reste fermé, la fraise suit un rayon. Rend aussi le
     nombre d'arcs écrits. */
  const contourArcs=P0=>{
    const Q=P0.map(p=>({x:p.x-o.x,y:o.y-p.y}));
    const segs=typeof dxfSegments==="function"?dxfSegments(Q):[];
    if(!segs.some(s=>s.t==="a"))return {k:poly(P0,null),arcs:0};
    /* un arc y est rangé dans le sens trigonométrique, de a1 à a2 : le sens
       du parcours se lit au point d'où l'on arrive. On part donc d'un
       segment droit ; une carte ronde, qui n'en a pas, se parcourt dans le
       sens de son contour. */
    const pt=(s,a)=>({x:s.c.x+s.r*Math.cos(a*Math.PI/180),y:s.c.y+s.r*Math.sin(a*Math.PI/180)});
    const i0=Math.max(0,segs.findIndex(s=>s.t==="l"));
    const L=segs.slice(i0).concat(segs.slice(0,i0));
    let cur=L[0].t==="l"?L[0].a:(signedArea(Q)>0?pt(L[0],L[0].a1):pt(L[0],L[0].a2));
    const k=[["PolyBegin",[["x",ipcN(cur.x)],["y",ipcN(cur.y)]]]];
    let arcs=0;
    for(const s of L){
      if(s.t==="l"){cur=s.b;k.push(["PolyStepSegment",[["x",ipcN(cur.x)],["y",ipcN(cur.y)]]]);continue;}
      const p1=pt(s,s.a1), p2=pt(s,s.a2);
      const cw=Math.hypot(p2.x-cur.x,p2.y-cur.y)<Math.hypot(p1.x-cur.x,p1.y-cur.y);
      cur=cw?p1:p2;
      k.push(["PolyStepCurve",[["x",ipcN(cur.x)],["y",ipcN(cur.y)],["centerX",ipcN(s.c.x)],["centerY",ipcN(s.c.y)],
                               ["clockwise",cw?"true":"false"]]]);
      arcs++;
    }
    return {k,arcs};
  };
  /* La forme d'une pastille dans SON repère (avant sa rotation), dilatée de
     g : ce que la norme appelle une primitive standard. */
  const formePastille=(q,g)=>{
    g=g||0;
    const w=Math.max(0.01,q.w+2*g), h=Math.max(0.01,q.h+2*g);
    if(q.shape==="circ"){
      const d=ipcN(Math.max(0.01,Math.max(q.w,q.h)+2*g));
      return forme("C"+d,["Circle",[["diameter",d]]]);
    }
    if(q.shape==="oval")return forme("O"+ipcN(w)+"x"+ipcN(h),["Oval",[["width",ipcN(w)],["height",ipcN(h)]]]);
    if(q.shape==="sharp")return forme("R"+ipcN(w)+"x"+ipcN(h),["RectCenter",[["width",ipcN(w)],["height",ipcN(h)]]]);
    if(q.shape==="rect"){
      const r=ipcN(clamp(padRadius("rect",q.w,q.h)+g,0,Math.min(w,h)/2));
      return forme("RR"+ipcN(w)+"x"+ipcN(h)+"r"+r,["RectRound",[["width",ipcN(w)],["height",ipcN(h)],["radius",r],
        ["upperRight","true"],["upperLeft","true"],["lowerLeft","true"],["lowerRight","true"]]]);
    }
    /* chanfrein et polygone : les sommets mêmes de `padWorldPts` */
    const P=q.shape==="poly"&&Array.isArray(q.pts)&&q.pts.length>=3?polyOffset(q.pts,g)
      :padChamferPts(w,h,(q.chamfer!=null?q.chamfer:padChamferVal(q))+g,q.chamferCorners);
    const cle="P"+P.map(p=>ipcN(p.x)+","+ipcN(-p.y)).join(";");
    return forme(cle,["Contour",[],[["Polygon",[],poly(P,"FILL",true)]]]);
  };
  /* Rotation d'une pastille du monde (radians, sens horaire de l'écran) en
     degrés de la norme (sens trigonométrique). */
  const rotNorme=rad=>ipcAng(-rad*180/Math.PI);
  const xform=(deg,miroir)=>{
    const r=ipcAng(deg);
    if(r==="0"&&!miroir)return null;
    return ["Xform",[["rotation",r==="0"?null:r],["mirror",miroir?"true":null]]];
  };

  /* ---------- nets ---------- */
  const nomNet=new Map(), uniqNet=ipcUnique();
  const net=nm=>{
    if(!nm)return null;
    if(!nomNet.has(nm))nomNet.set(nm,uniqNet(ipcNom(nm,"NET")));
    return nomNet.get(nm);
  };

  /* ---------- couches ---------- */
  const SILK=["SERIGRAPHIE_DESSUS","SERIGRAPHIE_DESSOUS"], PATE=["PATE_DESSUS","PATE_DESSOUS"];
  const MASQ=["MASQUE_DESSUS","MASQUE_DESSOUS"], DIEL=k=>"DIELECTRIQUE_"+(k+1), CONTOUR="CONTOUR";
  const faces=n>1?[0,1]:[0];
  const calques=[];        // [nom, fonction, face, enfants]
  for(const f of faces.filter(f=>f===0)){
    calques.push([SILK[f],"SILKSCREEN","TOP"],[PATE[f],"SOLDERPASTE","TOP"],[MASQ[f],"SOLDERMASK","TOP"]);
  }
  for(let i=0;i<n;i++){
    calques.push([cuN[i],ipcFonctionCuivre(i),i===0?"TOP":(i===n-1?"BOTTOM":"INTERNAL")]);
    if(i<diCount(n))calques.push([DIEL(i),IPC_DIEL[diAt(i).k]||"DIELCORE","INTERNAL"]);
  }
  if(n>1)calques.push([MASQ[1],"SOLDERMASK","BOTTOM"],[PATE[1],"SOLDERPASTE","BOTTOM"],[SILK[1],"SILKSCREEN","BOTTOM"]);
  calques.push([CONTOUR,"BOARD_OUTLINE","ALL"]);

  /* ---------- spécifications : empilage, finition, contre-perçage ---------- */
  const specs=[];
  const prop=(a)=>["Property",a];
  const specCouche=nom=>"SPEC_"+nom;
  for(let i=0;i<n;i++){
    const k=[["General",[["type","MATERIAL"]],[prop([["text","COPPER"]])]],
             ["Conductor",[["type","CONDUCTIVITY"]],[prop([["value","58000000"],["unit","SIEMENS/M"]])]]];
    const rug=cuRug(i);
    if(rug&&rug.m==="huray")
      k.push(["Conductor",[["type","OTHER"],["comment","Rugosite de Huray : rayon des nodules a = "+ipcN(rug.a)+
              " um, rapport de surface SR = "+ipcN(rug.sr)]],
              [prop([["name","HURAY_NODULE_RADIUS"],["value",ipcN(rug.a)],["unit","MICRON"]]),
               prop([["name","HURAY_SURFACE_RATIO"],["value",ipcN(rug.sr)]])]]);
    else if(rug)
      k.push(["Conductor",[["type","SURFACE_ROUGHNESS_UPFACING"],["comment","Rq (RMS), modele de Hammerstad-Groiss"]],
              [prop([["value",ipcN(rug.rms)],["unit","MICRON"]])]]);
    specs.push(["Spec",[["name",specCouche(cuN[i])]],k]);
  }
  for(let i=0;i<diCount(n);i++){
    const d=diAt(i);
    specs.push(["Spec",[["name",specCouche(DIEL(i))]],[
      ["General",[["type","MATERIAL"]],[prop([["text",d.mat||"FR-4"]]),prop([["text","Type : "+(DI_KIND[d.k]||d.k)]])]],
      ["Dielectric",[["type","DIELECTRIC_CONSTANT"]],[prop([["value",ipcN(d.er)]])]],
      ["Dielectric",[["type","LOSS_TANGENT"]],[prop([["value",ipcN(d.df)]])]]]]);
  }
  for(const f of faces)
    specs.push(["Spec",[["name",specCouche(MASQ[f])]],[
      ["General",[["type","MATERIAL"]],[prop([["text","SOLDERMASK"]]),prop([["text","Couleur : "+S.stack.maskColor]])]],
      ["Dielectric",[["type","DIELECTRIC_CONSTANT"]],[prop([["value",ipcN(S.stack.maskEr)]])]]]]);
  const fin=IPC_FINITIONS[S.stack.finish]||"OTHER";
  specs.push(["Spec",[["name","FINITION"]],[["SurfaceFinish",[["type",fin],["comment",S.stack.finish]]]]]);
  /* Le contre-perçage : une spec par face, couche gardée et moignon admis,
     pointée par le trou du via ; les vias fautifs ne partent pas, comme dans
     les fichiers de perçage. */
  const cpSpec=new Map(), cpVias=new Map();
  for(const c of cpViasPerces()){
    if(c.faute)continue;
    const de=c.cote==="dessous"?n-1:0;
    const cle=c.cote+"|"+c.garde+"|"+ipcN(c.res);
    if(!cpSpec.has(cle)){
      const nom="BD_"+cpCoucheFichier(de)+"_"+cpCoucheFichier(c.garde)+"_"+Math.round(c.res*1000)+"UM";
      cpSpec.set(cle,{nom,cote:c.cote,de,garde:c.garde,res:c.res,vias:[]});
      specs.push(["Spec",[["name",nom]],[
        ["Backdrill",[["type","START_LAYER"]],[prop([["layerOrGroupRef",cuN[de]]])]],
        ["Backdrill",[["type","MUST_NOT_CUT_LAYER"]],[prop([["layerOrGroupRef",cuN[c.garde]]])]],
        ["Backdrill",[["type","MAX_STUB_LENGTH"]],[prop([["value",ipcN(c.res)],["unit","MM"]])]]]]);
    }
    cpSpec.get(cle).vias.push(c);
    cpVias.set(c.v,cpSpec.get(cle).nom);
  }

  /* ---------- piles de pastilles ---------- */
  const piles=new Map(), pilesXml=[];
  const pile=(cle,nom,trou,couches)=>{
    if(!piles.has(cle)){
      const id=nom+"_"+(piles.size+1), k=[];
      if(trou)k.push(["PadstackHoleDef",[["name","T"+ipcN(trou.d)],["diameter",ipcN(trou.d)],
        ["platingStatus",trou.p],["plusTol","0"],["minusTol","0"],["x","0"],["y","0"]]]);
      for(const [l,f] of couches)
        k.push(["PadstackPadDef",[["layerRef",cuN[l]],["padUse","REGULAR"]],[["Location",[["x","0"],["y","0"]]],f]]);
      piles.set(cle,id);
      pilesXml.push(["PadStackDef",[["name",id]],k]);
    }
    return piles.get(cle);
  };
  /* la pile d'une pastille posée : sa forme sur chaque couche où elle a du
     cuivre, dans son repère, et son perçage */
  const pilePastille=(fp,q)=>{
    const L=padCuLayers(fp,q).map(l=>{const qc=padSurCouche(q,l)||q;return [l,formePastille(qc,0)];});
    const cle="P|"+(q.drill>0?ipcN(q.drill):"")+"|"+L.map(([l,f])=>l+":"+f[1][0][1]).join(",");
    return pile(cle,"PASTILLE",q.drill>0?{d:q.drill,p:"PLATED"}:null,L);
  };
  const pileVia=v=>{
    const f=formePastille({shape:"circ",w:v.d,h:v.d},0), L=[];
    for(let l=v.a;l<=v.b;l++)L.push([l,f]);
    return pile("V|"+ipcN(v.d)+"|"+ipcN(v.drill)+"|"+v.a+"-"+v.b,"VIA",{d:v.drill,p:"VIA"},L);
  };

  /* ---------- composants, empreintes, nomenclature ---------- */
  const uniqRef=ipcUnique(), uniqPkg=ipcUnique(), uniqOem=ipcUnique();
  const refDe=new Map(), pkgDe=new Map(), paquets=[], comps=[];
  const vid=(S.variantes&&S.variantes.active)||"";
  const lignes=new Map();        // nomenclature : référence de commande -> ligne
  const parNet=new Map();        // net -> [[ref, broche]]
  for(const fp of S.fps){
    const ref=uniqRef(ipcNom(fp.ref,"CMP"));
    refDe.set(fp,ref);
    const ps=padsOf(fp), body=bodyOf(fp);
    /* une empreinte par géométrie : deux 0603 identiques partagent la leur */
    const sig=JSON.stringify([ps.map(q=>[q.n,q.x,q.y,q.w,q.h,q.shape,q.drill,q.rot,q.pts||0,q.chamfer||0,
                                         q.chamferCorners||0,q.parCouche||0]),body]);
    if(!pkgDe.has(sig)){
      const nom=uniqPkg(ipcNom(fp.pkg,"EMPREINTE"));
      pkgDe.set(sig,nom);
      const broches=[], vues=new Set();
      for(const q of ps){
        const num=ipcNom(String(q.n),"1");
        if(vues.has(num))continue;
        vues.add(num);
        broches.push(["Pin",[["number",num],["name",q.nom?ipcNom(q.nom,null):null],
          ["type",q.drill>0?"THRU":"SURFACE"]],
          [xform(-(q.rot||0)),["Location",[["x",ipcN(q.x)],["y",ipcN(-q.y)]]],formePastille(q,0)]]);
      }
      const B=[{x:body.x1,y:body.y1},{x:body.x2,y:body.y1},{x:body.x2,y:body.y2},{x:body.x1,y:body.y2}];
      const un=ps.some(q=>q.n===1);
      paquets.push(["Package",[["name",nom],["type",ipcTypeBoitier(fp)],["pinOne",un?"1":null],
        ["pinOneOrientation",ipcBroche1(fp,ps)]],
        [["Outline",[],[["Polygon",[],poly(B,null,true)],trait(0.15)]]].concat(broches)]);
    }
    const pkg=pkgDe.get(sig);
    const mpn=fp.csvMpn||"", fab=fp.manufacturer||"";
    const part=mpn||((fp.value||"")+(fp.pkg?"_"+fp.pkg:""))||ref;
    const nm=(fp.nonMonte||[]).map(id=>varNom(S.variantes,id));
    const attrs=[["VALUE",fp.value],["MPN",mpn],["MANUFACTURER",fab],["PART_NAME",fp.csvPartName],
                 ["PACKAGE",fp.pkg],["NOT_MOUNTED_IN",nm.join(" ; ")]]
      .filter(([,v])=>v).map(([k,v])=>["NonstandardAttribute",[["name",k],["type","STRING"],["value",v]]]);
    comps.push(["Component",[["refDes",ref],["packageRef",pkg],["part",part],
      ["layerRef",cuN[fp.side?n-1:0]],["mountType",ps.some(q=>q.drill>0)?"THMT":"SMT"]],
      attrs.concat([xform(-(fp.rot||0),!!fp.side),["Location",[["x",X(fp.x)],["y",Y(fp.y)]]]])]);
    stats.composants++;
    /* la ligne de nomenclature : même référence, même valeur, même boîtier */
    const cle=[part,fp.value||"",fp.pkg||"",fab].join("|");
    if(!lignes.has(cle))lignes.set(cle,{part,val:fp.value||"",pkg:fp.pkg||"",mpn,fab,
                                         nom:fp.csvPartName||"",pins:ps.length,refs:[]});
    lignes.get(cle).refs.push({ref,pose:varEstMonte(fp,vid),couche:cuN[fp.side?n-1:0],pkg});
    for(const q of ps)
      if(q.net){
        if(!parNet.has(q.net))parNet.set(q.net,[]);
        parNet.get(q.net).push([ref,ipcNom(String(q.n),"1")]);
      }
  }

  /* ---------- le contenu des couches ---------- */
  const lf=new Map();           // nom de couche -> Map(cle de Set -> {attrs, kids})
  const set=(couche,cle,attrs)=>{
    let M=lf.get(couche);if(!M)lf.set(couche,M=new Map());
    let s=M.get(cle);if(!s)M.set(cle,s={a:attrs,k:[]});
    return s.k;
  };
  const ligne=(x1,y1,x2,y2,w)=>["Features",[],[["Line",[["startX",X(x1)],["startY",Y(y1)],["endX",X(x2)],["endY",Y(y2)]],[trait(w)]]]];
  const polyligne=(P,w,ferme)=>{
    const k=[["PolyBegin",[["x",X(P[0].x)],["y",Y(P[0].y)]]]];
    for(let i=1;i<P.length;i++)k.push(["PolyStepSegment",[["x",X(P[i].x)],["y",Y(P[i].y)]]]);
    if(ferme)k.push(["PolyStepSegment",[["x",X(P[0].x)],["y",Y(P[0].y)]]]);
    k.push(trait(w));
    return ["Polyline",[],k];
  };
  const contour=(P,trous)=>["Contour",[],[["Polygon",[],poly(P,"FILL")]].concat(
    (trous||[]).map(t=>["Cutout",[],poly(t,null)]))];
  /* Un texte : ses traits, ceux du Gerber (`textStrokes`), et le texte
     lui-même, pour qu'un outil le lise et le cherche. Traits et texte vont
     ensemble dans un <UserSpecial>. */
  const texte=(txt,x,y,h,mir,rot,w)=>{
    const k=[];
    for(const P of textStrokes(txt,x,y,h,mir,rot||0))if(P.length>=2)k.push(polyligne(P,w,false));
    const lg=Math.max(h,String(txt).length*h*5/6-h/6);
    k.push(["Text",[["textString",txt],["fontSize",String(Math.max(1,Math.round(h/0.3528)))]],
      [xform(-(rot||0),mir),["BoundingBox",[["lowerLeftX",ipcN(-lg/2)],["lowerLeftY",ipcN(-h/2)],
                                         ["upperRightX",ipcN(lg/2)],["upperRightY",ipcN(h/2)]]]]]);
    return ["Features",[],[["Location",[["x",X(x)],["y",Y(y)]]],["UserSpecial",[],k]]];
  };

  /* le cuivre */
  for(const t of S.tracks){
    const nt=net(t.net), A=arcOf(t);
    const k=set(cuN[t.l],"P|"+(nt||""),[["net",nt]]);
    if(A){
      k.push(["Features",[],[["Arc",[["startX",X(t.x1)],["startY",Y(t.y1)],["endX",X(t.x2)],["endY",Y(t.y2)],
        ["centerX",X(A.cx)],["centerY",Y(A.cy)],["clockwise",t.ca>0?"true":"false"]],[trait(t.w)]]]]);
      stats.arcs++;
    }else{
      k.push(ligne(t.x1,t.y1,t.x2,t.y2,t.w));
      stats.pistes++;
    }
  }
  for(const fp of S.fps){
    const ref=refDe.get(fp);
    for(const q of padsWorld(fp)){
      const nt=net(q.net), ps=pilePastille(fp,q);
      for(const l of padCuLayers(fp,q)){
        const qc=padSurCouche(q,l)||q;
        set(cuN[l],"T|"+(nt||""),[["net",nt],["padUsage","TERMINATION"]]).push(["Pad",[["padstackDefRef",ps]],
          [xform(-qc.rot*180/Math.PI),["Location",[["x",X(q.x)],["y",Y(q.y)]]],formePastille(qc,0),
           ["PinRef",[["componentRef",ref],["pin",ipcNom(String(q.n),"1")]]]]]);
      }
    }
  }
  for(const v of S.vias){
    const nt=net(v.net), ps=pileVia(v), f=formePastille({shape:"circ",w:v.d,h:v.d},0);
    for(let l=v.a;l<=v.b;l++)
      set(cuN[l],"V|"+(nt||""),[["net",nt],["padUsage","VIA"]]).push(["Pad",[["padstackDefRef",ps]],
        [["Location",[["x",X(v.x)],["y",Y(v.y)]]],f]]);
  }
  for(const z of S.zones){
    if(!z.pts||z.pts.length<3)continue;
    const r=ipcRemplir(z), nt=net(z.net);
    stats.zones++;
    if(r.approx)stats.approx++;
    for(const il of r.ilots){
      set(cuN[z.l],"Z|"+(nt||""),[["net",nt]]).push(["Features",[],[contour(il.o,il.t)]]);
      stats.ilots++;
    }
  }
  /* la sérigraphie, comme `gerberSilk` */
  for(const fp of S.fps){
    if(fp.silk===false)continue;
    const f=fp.side?1:0;
    if(f&&n<2)continue;
    const k=set(SILK[f],"S",[]), T=fpXform(fp), bb=bodyOf(fp), lw=0.15;
    k.push(["Features",[],[polyligne([T(bb.x1,bb.y1),T(bb.x2,bb.y1),T(bb.x2,bb.y2),T(bb.x1,bb.y2)],lw,true)]]);
    const mk=fpMark(fp);
    if(mk){
      const w=T(mk.x,mk.y);
      k.push(["Features",[],[["Location",[["x",X(w.x)],["y",Y(w.y)]]],
        ["Circle",[["diameter",ipcN(mk.d)]],[["FillDesc",[["fillProperty","FILL"]]]]]]]);
    }
    const h=clamp((bb.x2-bb.x1)*0.34,0.8,1.6);
    k.push(texte(fp.ref,fp.x,fp.y-((bb.y2-bb.y1)/2+h*0.9),h,!!fp.side,0,lw));
  }
  for(const d of (S.drawings||[])){
    const f=d.layer==="silkB"?1:0;
    if(f&&n<2)continue;
    const k=set(SILK[f],"S",[]), w=d.width||0.15;
    if(d.shape==="poly"){if(d.pts&&d.pts.length>=3)k.push(["Features",[],[contour(d.pts,d.trous)]]);}
    else if(d.shape==="text")k.push(texte(d.text||"TEXT",d.x1,d.y1,d.size||1.5,!!f,d.rot||0,w));
    else if(d.shape==="rect")
      k.push(["Features",[],[polyligne([{x:d.x1,y:d.y1},{x:d.x2,y:d.y1},{x:d.x2,y:d.y2},{x:d.x1,y:d.y2}],w,true)]]);
    else k.push(ligne(d.x1,d.y1,d.x2,d.y2,w));
  }
  /* masque et pâte : une ouverture par pastille, à sa dilatation */
  for(const f of faces){
    for(const [nom,L] of [[MASQ[f],maskOpenings(f)],[PATE[f],pasteOpenings(f)]])
      for(const op of L){
        const q=op.q;
        set(nom,"O",[]).push(["Pad",[],[xform(-(q.rot||0)*180/Math.PI),["Location",[["x",X(q.x)],["y",Y(q.y)]]],
          formePastille(q,op.grow)]]);
      }
  }
  /* le contour, au trait : la fraise le suit */
  for(const P of [boardPoly()].concat(boardCutouts()))
    set(CONTOUR,"C",[]).push(["Features",[],[["Polyline",[],contourArcs(P).k.concat([trait(0.1)])]]]);

  /* ---------- les perçages : un calque par portée ---------- */
  const percages=new Map();     // "a-b" -> Map(cle de Set -> ...)
  let trou=1;
  const percer=(a,b,cle,attrs,h)=>{
    const k=a+"-"+b;
    let M=percages.get(k);if(!M)percages.set(k,M=new Map());
    let s=M.get(cle);if(!s)M.set(cle,s={a:attrs,k:[]});
    s.k.push(h);
  };
  const H=(d,p,x,y,spec)=>["Hole",[["name","H"+(trou++)],["diameter",ipcN(d)],["platingStatus",p],
    ["plusTol","0"],["minusTol","0"],["x",X(x)],["y",Y(y)]],spec?[["SpecRef",[["id",spec]]]]:null];
  for(const v of S.vias){
    const a=Math.min(v.a,v.b), b=Math.max(v.a,v.b), nt=net(v.net), ps=pileVia(v);
    percer(a,b,"V|"+(nt||"")+"|"+ps,[["net",nt],["padUsage","VIA"],["geometry",ps]],H(v.drill,"VIA",v.x,v.y,cpVias.get(v)));
    stats.vias++;stats.trous++;
  }
  for(const fp of S.fps)
    for(const q of padsWorld(fp)){
      if(!(q.drill>0))continue;
      const nt=net(q.net), ps=pilePastille(fp,q);
      percer(0,n-1,"T|"+(nt||"")+"|"+ps,[["net",nt],["padUsage","TERMINATION"],["geometry",ps]],H(q.drill,"PLATED",q.x,q.y));
      stats.pastillesPercees++;stats.trous++;
    }
  const npth=[];
  for(const h of (S.holes||[]))if(h.d>0){npth.push(H(h.d,"NONPLATED",h.x,h.y));stats.trousNpth++;stats.trous++;}
  const calquesPercage=[], lfPercage=[];
  for(const [k,M] of [...percages].sort((p,q)=>{
      const a=p[0].split("-").map(Number), b=q[0].split("-").map(Number);
      return (b[1]-b[0])-(a[1]-a[0])||a[0]-b[0];})){
    const [a,b]=k.split("-").map(Number), nom="PERCAGE_L"+(a+1)+"_L"+(b+1);
    calquesPercage.push(["Layer",[["name",nom],["layerFunction","DRILL"],["side","ALL"],["polarity","POSITIVE"]],
      [["Span",[["fromLayer",cuN[a]],["toLayer",cuN[b]]]]]]);
    lfPercage.push(["LayerFeature",[["layerRef",nom]],[...M.values()].map(s=>["Set",s.a,s.k])]);
  }
  if(npth.length){
    calquesPercage.push(["Layer",[["name","PERCAGE_NPTH"],["layerFunction","DRILL"],["side","ALL"],["polarity","POSITIVE"]],
      [["Span",[["fromLayer",cuN[0]],["toLayer",cuN[n-1]]]]]]);
    lfPercage.push(["LayerFeature",[["layerRef","PERCAGE_NPTH"]],[["Set",[],npth]]]);
  }
  /* le contre-perçage : un calque par passe, le foret au diamètre du via
     plus le surperçage, le <Span> de la face à la dernière couche retirée
     (la visionneuse en tire le diamètre du foret) */
  for(const e of cpSpec.values()){
    const fin=e.cote==="dessous"?e.garde+1:e.garde-1;
    const nom="CONTRE_PERCAGE_"+cpCoucheFichier(e.de)+"_"+cpCoucheFichier(e.garde)+"_"+Math.round(e.res*1000)+"UM";
    calquesPercage.push(["Layer",[["name",nom],["layerFunction","DRILL"],["side","ALL"],["polarity","POSITIVE"]],
      [["SpecRef",[["id",e.nom]]],["Span",[["fromLayer",cuN[e.de]],["toLayer",cuN[fin]]]]]]);
    const parNetCp=new Map();
    for(const c of e.vias){
      const nt=net(c.v.net)||"";
      if(!parNetCp.has(nt))parNetCp.set(nt,[]);
      parNetCp.get(nt).push(H(c.diam,"NONPLATED",c.v.x,c.v.y));
    }
    lfPercage.push(["LayerFeature",[["layerRef",nom]],[...parNetCp].map(([nt,L])=>["Set",[["net",nt||null]],L])]);
    stats.contrePercages+=e.vias.length;
  }

  /* ---------- nets logiques et physiques ---------- */
  const tousNets=new Set();
  for(const t of S.tracks)if(t.net)tousNets.add(t.net);
  for(const v of S.vias)if(v.net)tousNets.add(v.net);
  for(const z of S.zones)if(z.net&&z.pts&&z.pts.length>=3)tousNets.add(z.net);
  for(const nm of parNet.keys())tousNets.add(nm);
  stats.nets=tousNets.size;
  const logiques=[];
  for(const [nm,L] of parNet)
    logiques.push(["LogicalNet",[["name",net(nm)],["netClass",ipcClasseNet(nm)]],
      L.map(([ref,pin])=>["PinRef",[["componentRef",ref],["pin",pin]]])]);
  /* les points qu'une sonde atteint : pastilles et vias des faces */
  const points=new Map(), ouvert=(l,q)=>!q||(l===0||l===n-1);
  const tente=viaTented();
  const pt=(nm,o)=>{if(!points.has(nm))points.set(nm,[]);points.get(nm).push(o);};
  for(const fp of S.fps)
    for(const q of padsWorld(fp)){
      if(!q.net)continue;
      const L=padCuLayers(fp,q).filter(l=>l===0||l===n-1);
      if(!L.length)continue;
      const dessus=L.includes(0), dessous=n>1&&L.includes(n-1);
      const msk=!q.noMask;
      pt(q.net,{x:q.x,y:q.y,l:dessus?0:n-1,l2:dessus&&dessous?n-1:null,noeud:"END",
                exp:(!dessus||msk)&&(!dessous||msk)?"EXPOSED":"COVERED",via:false,
                f:formePastille(padSurCouche(q,dessus?0:n-1)||q,0),rot:q.rot});
    }
  for(const v of S.vias){
    if(!v.net)continue;
    const dessus=v.a===0, dessous=v.b===n-1;
    if(!dessus&&!dessous)continue;        // un via enterré ne se sonde pas
    pt(v.net,{x:v.x,y:v.y,l:dessus?0:n-1,l2:dessus&&dessous?n-1:null,noeud:"MIDDLE",
              exp:tente?"COVERED":"EXPOSED",via:true,f:formePastille({shape:"circ",w:v.d,h:v.d},0)});
  }
  const uniqPhy=ipcUnique();
  for(const nm of nomNet.values())uniqPhy(nm);
  const phys=[];
  for(const [nm,L] of points)
    phys.push(["PhyNet",[["name",uniqPhy(net(nm)+"_PHY")]],L.map(p=>["PhyNetPoint",[["x",X(p.x)],["y",Y(p.y)],
      ["layerRef",cuN[p.l]],["secondaryLayerRef",p.l2!=null?cuN[p.l2]:null],["netNode",p.noeud],
      ["exposure",p.exp],["via",p.via?"true":null]],[p.rot?xform(-p.rot*180/Math.PI):null,p.f]])]);

  /* ---------- la nomenclature ---------- */
  const bomItems=[];
  for(const L of lignes.values()){
    const oem=uniqOem(ipcNom(L.part,"REF"));
    const tx=[["VALUE",L.val],["PACKAGE",L.pkg],["MPN",L.mpn],["MANUFACTURER",L.fab],["PART_NAME",L.nom]]
      .filter(([,v])=>v).map(([k,v])=>["Textual",[["definitionSource","WEB_CAO"],
        ["textualCharacteristicName",k],["textualCharacteristicValue",v]]]);
    bomItems.push(["BomItem",[["OEMDesignNumberRef",oem],["quantity",String(L.refs.length)],["pinCount",String(L.pins)],
      ["category","ELECTRICAL"],["description",[L.val,L.pkg].filter(Boolean).join(" ")||null]],
      L.refs.map(r=>["RefDes",[["name",r.ref],["packageRef",r.pkg],["populate",r.pose?"true":"false"],["layerRef",r.couche]]])
        .concat([["Characteristics",[["category","ELECTRICAL"]],tx]])]);
  }

  /* ---------- empilage ---------- */
  const lignesEmp=[];
  let seq=1;
  const empiler=(nom,ep)=>lignesEmp.push(["StackupLayer",[["layerOrGroupRef",nom],["thickness",ipcN(ep)],
    ["tolPlus","0"],["tolMinus","0"],["sequence",String(seq++)]],[["SpecRef",[["id",specCouche(nom)]]]]]);
  empiler(MASQ[0],S.stack.maskT);
  for(let i=0;i<n;i++){
    empiler(cuN[i],cuT(i));
    if(i<diCount(n))empiler(DIEL(i),diAt(i).t);
  }
  if(n>1)empiler(MASQ[1],S.stack.maskT);
  const total=ipcN(stackTotal());

  /* ---------- le profil ---------- */
  const bords=[boardPoly()].concat(boardCutouts()).map(contourArcs);
  for(const b of bords)stats.arcsContour+=b.arcs;
  const profil=["Profile",[],[["Polygon",[],bords[0].k]].concat(bords.slice(1).map(b=>["Cutout",[],b.k]))];

  /* ---------- assemblage ---------- */
  const lfCuivre=[];
  const ordre=calques.map(c=>c[0]);
  for(const nom of ordre){
    const M=lf.get(nom);
    if(!M||!M.size)continue;
    lfCuivre.push(["LayerFeature",[["layerRef",nom]],[...M.values()].map(s=>["Set",s.a,s.k])]);
  }
  const layers=calques.map(([nom,fct,face])=>["Layer",[["name",nom],["layerFunction",fct],["side",face],["polarity","POSITIVE"]]])
    .concat(calquesPercage);
  const step=["Step",[["name",STEP],["type","BOARD"],["stackupRef","EMPILAGE"]],
    pilesXml.concat([["Datum",[["x","0"],["y","0"]]],profil],paquets,comps,logiques,
      phys.length?[["PhyNetGroup",[["name","RESEAU_PHYSIQUE"]],phys]]:[],lfCuivre,lfPercage)];
  const auteur=(typeof projdAuteur==="function"&&projdAuteur())||"Inconnu";
  const revision=(typeof projdRevision==="function"&&projdRevision())||"1";
  const avecBom=bomItems.length>0;
  const racine=["IPC-2581",[["revision",IPC2581_REV],["xmlns",IPC2581_NS]],[
    ["Content",[["roleRef","Proprietaire"]],[
      ["FunctionMode",[["mode","USERDEF"],["comment","Fabrication, assemblage et nomenclature de la carte"]]],
      ["StepRef",[["name",STEP]]]]
      .concat(layers.map(l=>["LayerRef",[["name",l[1][0][1]]]]),
              avecBom?[["BomRef",[["name",BOM]]]]:[],
              [["DictionaryLineDesc",[["units","MILLIMETER"]],dicoT],
               ["DictionaryStandard",[["units","MILLIMETER"]],dicoF]])],
    ["LogisticHeader",[],[
      ["Role",[["id","Proprietaire"],["roleFunction","SENDER"]]],
      ["Enterprise",[["id","WEB_CAO"],["code","NONE"]]],
      ["Person",[["name",String(auteur)],["enterpriseRef","WEB_CAO"],["roleRef","Proprietaire"]]]]],
    ["HistoryRecord",[["number","1"],["origination",date],["software","Editeur PCB (WEB_CAO)"],["lastChange",date]],[
      ["FileRevision",[["fileRevisionId",String(revision)],["comment","Export IPC-2581 de l'editeur PCB"]],[
        ["SoftwarePackage",[["name","Editeur PCB"],["vendor","WEB_CAO"],["revision","1"]],[
          ["Certification",[["certificationStatus","SELFTEST"]]]]]]]]],
    avecBom?["Bom",[["name",BOM]],[["BomHeader",[["assembly",STEP],["revision",String(revision)]],[["StepRef",[["name",STEP]]]]]]
      .concat(bomItems)]:null,
    ["Ecad",[["name",STEP]],[
      ["CadHeader",[["units","MILLIMETER"]],specs],
      ["CadData",[],layers.concat([
        ["Stackup",[["name","EMPILAGE"],["overallThickness",total],["tolPlus","0"],["tolMinus","0"],
          ["whereMeasured","MASK"],["stackupStatus","PROPOSED"]],[
          ["SpecRef",[["id","FINITION"]]],
          ["StackupGroup",[["name","EMPILAGE_GROUPE"],["thickness",total],["tolPlus","0"],["tolMinus","0"]],lignesEmp]]],
        step])]]]]];
  const out=['<?xml version="1.0" encoding="UTF-8"?>',
    "<!-- Editeur PCB (WEB_CAO) - IPC-2581 revision "+IPC2581_REV+", millimetres, Y vers le haut,",
    "     origine celle des Gerber du meme dossier. -->"];
  ipcXml(racine,"",out);
  return {xml:out.join("\n")+"\n",stats};
}

/* Le fichier pour le dossier de fabrication (04-fabrication.js). */
function ipc2581Fichier(){
  const d=ipc2581Document();
  return {name:fabBase()+".xml",text:d.xml,kind:"ipc2581",stats:d.stats};
}
/* Le bouton « IPC-2581 » du menu Fichier. */
function exportIpc2581(){
  if(!S.fps.length&&!S.tracks.length){alert("Rien à exporter : la carte est vide.");return null;}
  if(typeof pcbVarDepuisSchema==="function")pcbVarDepuisSchema();
  const f=ipc2581Fichier();
  dl(new Blob([f.text],{type:"application/xml"}),f.name);
  const s=f.stats;
  hint(f.name+" (IPC-2581 révision "+IPC2581_REV+") — "+s.composants+" composant(s), "+s.nets+" net(s), "+
       (s.pistes+s.arcs)+" piste(s), "+s.vias+" via(s), "+s.trous+" trou(s), "+s.ilots+" îlot(s) de zone"+
       (s.approx?" — "+s.approx+" zone(s) au remplissage approché":"")+".");
  return f;
}
(function(){
  const b=typeof document!=="undefined"&&document.getElementById("bIpc2581");
  if(b)b.onclick=exportIpc2581;
})();
