"use strict";
/* ==========================================================================
   Fiche de mesure — commune à l'éditeur PCB et à la visionneuse IPC-2581
   --------------------------------------------------------------------------
   Une feuille pour le technicien : « mesurer entre U3.12 et C6.2 ». Chaque
   point est cerclé sur la vue de la carte (lettre A, B…), relié à l'autre
   point de sa mesure par un trait et une bulle numérotée, puis agrandi dans
   une vue de détail où une sonde « + » (couleur de la mesure) ou « − »
   (noire) pointe la pastille. Un tableau reprend les mesures, et des
   consignes les suivent (hors tension d'abord quand il y a des ohms).

   Un point se donne par repère et pastille (« U3.12 », « u3-12 », « J1 3 »,
   « TP2 » pour une empreinte d'une seule pastille) ou par net (« GND ») :
   le point le plus accessible du net est pris — un point de test d'abord,
   puis la face dessus (ou un traversant), puis la plus grande pastille.

   ENTRÉE NEUTRE, comme le dossier méca (mm, repère des Gerber, Y vers le
   haut, vue de dessus) :
     {contour:[{x,y}…], decoupes:[[{x,y}…]…],
      composants:[{ref, face:"dessus"|"dessous", corps:[{x,y}…],
                   pads:[{n, net, x, y, trou, pts:[{x,y}…]}]}]}
   Les feuilles sont celles du Draftsman (dfNouvelle, dfTexte… de
   29-draftsman.js) : le même PDF cherchable, le même aperçu.
   ========================================================================== */

const MES_TYPES=["Tension DC","Résistance","Continuité","Oscilloscope"];
const MES_ECHELLES=[2,3,4,5,10];
const MES_COUL=[[0.78,0.16,0.16],[0.08,0.4,0.75],[0.18,0.49,0.2],[0.85,0.42,0],[0.48,0.12,0.64],[0,0.5,0.53]];
const MES_NOIR=[0.13,0.13,0.13];
const MES_PAR_FEUILLE=4;
const MES_MAX=40;

function mesCouleur(i){return MES_COUL[i%MES_COUL.length];}
function mesLettre(i){return (i>=26?String.fromCharCode(64+Math.floor(i/26)):"")+String.fromCharCode(65+i%26);}

/* La liste relue d'un fichier : des champs texte bornés, un type connu. */
function mesNormListe(src){
  const t=(v,n)=>String(v==null?"":v).trim().slice(0,n);
  return (Array.isArray(src)?src:[]).filter(m=>m&&typeof m==="object"&&t(m.a,60)&&t(m.b,60))
    .slice(0,MES_MAX).map(m=>({a:t(m.a,60),b:t(m.b,60),type:MES_TYPES.includes(m.type)?m.type:MES_TYPES[0],
      att:t(m.att,40),tol:t(m.tol,30),note:t(m.note,200),ech:MES_ECHELLES.includes(+m.ech)?+m.ech:0}));
}

function mesPoint(c,p){
  return {cle:c.ref+"."+p.n,ref:c.ref,n:String(p.n),net:p.net||"",x:p.x,y:p.y,face:c.face,trou:!!p.trou,pts:p.pts};
}
function mesDemi(p){const b=mecaBoite(p.pts);return Math.max(b.x2-b.x1,b.y2-b.y1,0.2)/2;}

/* → {p} ou {err} ; `p.parNet` : le point choisi pour un net donné par son nom */
function mesResoudre(E,txt){
  const s=String(txt==null?"":txt).trim(), H=s.toUpperCase();
  if(!s)return {err:"point vide"};
  const comp=r=>E.composants.find(c=>String(c.ref).toUpperCase()===r);
  let c=comp(H);
  if(c){
    if(c.pads.length===1)return {p:mesPoint(c,c.pads[0])};
    return {err:c.ref+" a "+c.pads.length+" pastilles : préciser laquelle ("+c.ref+"."+(c.pads[0]?c.pads[0].n:1)+"…)"};
  }
  const m=H.match(/^(.+?)\s*[.:\s-]\s*([^.:\s-]+)$/);
  if(m&&(c=comp(m[1]))){
    const p=c.pads.find(p=>String(p.n).toUpperCase()===m[2]);
    return p?{p:mesPoint(c,p)}:{err:c.ref+" n'a pas de pastille "+m[2]};
  }
  const cands=[];
  for(const c of E.composants)for(const p of c.pads)if(p.net&&String(p.net).toUpperCase()===H)cands.push(mesPoint(c,p));
  if(!cands.length)return {err:"« "+s+" » : ni repère.pastille (U3.12), ni net de la carte"};
  const rang=q=>(/^TP\d/i.test(q.ref)?0:2)+(q.face==="dessus"||q.trou?0:1);
  cands.sort((a,b)=>rang(a)-rang(b)||mesDemi(b)-mesDemi(a)||a.cle.localeCompare(b.cle,"fr",{numeric:true}));
  return {p:Object.assign(cands[0],{parNet:true})};
}
function mesTexte(p){return p.parNet?p.net+" → "+p.cle:p.cle+(p.net?" · "+p.net:"");}

/* La carte, une face, dans le repère de la feuille : contour, corps et
   repères de cette face, ses pastilles (et les traversantes de l'autre), les
   pastilles mesurées remplies de leur couleur (`surb` : clé → couleur).
   `zones` : reçoit la boîte de chaque pastille sur la feuille, pour le clic. */
function mesDessin(F,E,T,dessous,surb,zones){
  const face=dessous?"dessous":"dessus";
  dfCalque(F,"CONTOUR");
  if(E.contour.length)dfPoly(F,E.contour.map(p=>T(p.x,p.y)),{ferme:true,lw:0.35});
  for(const d of E.decoupes)dfPoly(F,d.map(p=>T(p.x,p.y)),{ferme:true,lw:0.35});
  dfCalque(F,"COMPOSANTS");
  for(const c of E.composants){
    if(c.face!==face||c.corps.length<3)continue;
    const pts=c.corps.map(p=>T(p.x,p.y)), b=mecaBoite(pts);
    dfPoly(F,pts,{ferme:true,lw:0.12,trait:0.6});
    const h=clamp(Math.min(b.x2-b.x1,b.y2-b.y1)*0.4,0.8,2.5);
    dfTexte(F,c.ref,(b.x1+b.x2)/2,(b.y1+b.y2)/2+h*0.35,h/DF_PT,{ancre:"m",c:0.5,cat:"repere",lieu:c.ref});
  }
  dfCalque(F,"PASTILLES");
  for(const c of E.composants)for(const p of c.pads){
    if(c.face!==face&&!p.trou)continue;
    const col=surb.get(c.ref+"."+p.n), pts=p.pts.map(q=>T(q.x,q.y)), b=mecaBoite(pts);
    dfPoly(F,pts,{ferme:true,lw:0.08,plein:col||1});
    if(zones)zones.push({cle:c.ref+"."+p.n,x1:b.x1,y1:b.y1,x2:b.x2,y2:b.y2});
    const w=Math.min(b.x2-b.x1,b.y2-b.y1);
    if(w>1.6)dfTexte(F,p.n,(b.x1+b.x2)/2,(b.y1+b.y2)/2+w*0.12,clamp(w*0.35,0.6,2.2)/DF_PT,
                     {ancre:"m",c:col?1:0.3,cat:"repere",lieu:c.ref+" · broche "+p.n});
  }
  dfCalque(F);
}

/* La carte entière dans `box`, à l'échelle normalisée qui tient ; dessous,
   en miroir (carte retournée). */
function mesVue(E,box,dessous){
  const B=mecaBoite(E.contour.length?E.contour:[].concat(...E.composants.map(c=>c.corps)));
  const bw=Math.max(B.x2-B.x1,1e-3), bh=Math.max(B.y2-B.y1,1e-3);
  const kmax=Math.max(1e-3,Math.min((box.w-6)/bw,(box.h-14)/bh));
  const k=DF_ECHELLES.find(e=>e<=kmax)||kmax;
  const ox=box.x+(box.w-bw*k)/2, oy=box.y+10+(box.h-10-bh*k)/2;
  return {k,T:dessous?(x,y)=>({x:ox+(B.x2-x)*k,y:oy+(B.y2-y)*k}):(x,y)=>({x:ox+(x-B.x1)*k,y:oy+(B.y2-y)*k})};
}

/* Les détails d'une mesure : un seul quand les deux points tiennent ensemble
   à 4:1 au moins (ou à l'échelle imposée), sinon un par point. `R` : rayon du détail sur la feuille. */
function mesGroupes(r,R){
  const pa=r.a.p, pb=r.b.p, ech=r.m.ech;
  const essai=pts=>{
    const cx=pts.reduce((s,p)=>s+p.x,0)/pts.length, cy=pts.reduce((s,p)=>s+p.y,0)/pts.length;
    const ext=Math.max(...pts.map(p=>Math.hypot(p.x-cx,p.y-cy)+mesDemi(p)));
    const k=ech||MES_ECHELLES.slice().reverse().find(k=>ext*k<=R*(pts.length>1?0.6:0.3)&&(pts.length<2||k>=4));
    return k&&ext*k<=R*0.85?{pts,cx,cy,k,face:pts[0].face}:null;
  };
  const seul=p=>essai([p])||{pts:[p],cx:p.x,cy:p.y,k:ech||MES_ECHELLES[0],face:p.face};
  const ens=pa.face===pb.face&&essai([pa,pb]);
  return ens?[ens]:[seul(pa),seul(pb)];
}

/* La grille des détails dans Wd × Hd : le plus grand rayon qui tient n cercles.
   `bas` : la hauteur gardée sous chaque cercle pour ses légendes. */
function mesGrille(n,Wd,Hd,bas){
  let best=null;
  for(let cols=1;cols<=Math.max(n,1);cols++){
    const rows=Math.ceil(Math.max(n,1)/cols), R=Math.min(Wd/cols/2-3,(Hd/rows-(bas||13))/2,38);
    if(!best||R>best.R)best={cols,rows,R};
  }
  return best;
}
/* Une vue de détail : la carte autour de (cx,cy) à l'échelle k, découpée au
   cercle de centre (X,Y) et de rayon R sur la feuille. Rend la transformation. */
function mesLoupe(F,E,X,Y,R,cx,cy,k,dessous,surb,zones){
  const s=dessous?-1:1, T=(x,y)=>({x:X+s*(x-cx)*k,y:Y-(y-cy)*k}), W=[];
  for(let i=0;i<96;i++){const a=i*Math.PI/48;W.push({x:X+R*Math.cos(a),y:Y+R*Math.sin(a)});}
  W.sens=1;                                        // sens trigonométrique : pas besoin de signedArea (absent de la visionneuse)
  const D={items:[]}, zd=[];
  mesDessin(D,E,T,dessous,surb,zd);
  if(zones)for(const q of zd)if(Math.hypot((q.x1+q.x2)/2-X,(q.y1+q.y2)/2-Y)<R)zones.push(q);
  for(const it of D.items)for(const q of dfDecouper(it,W))F.items.push(q);
  dfCercle(F,X,Y,R,{lw:0.5});
  return T;
}

function mesFeuilles(E,liste,ctx){
  const res=liste.map((m,i)=>({m,i,a:mesResoudre(E,m.a),b:mesResoudre(E,m.b)}));
  const ok=res.filter(r=>r.a.p&&r.b.p), ko=res.filter(r=>!(r.a.p&&r.b.p));
  const feuilles=[], n0={lettre:0};
  for(let i=0;i<Math.max(ok.length,1);i+=MES_PAR_FEUILLE)
    feuilles.push(mesFeuille(E,ok.slice(i,i+MES_PAR_FEUILLE),i?[]:ko,ctx,feuilles.length,n0));
  return feuilles;
}

function mesFeuille(E,lot,ko,ctx,suite,n0){
  const F=dfNouvelle(ctx,"Fiche de mesure"+(suite?" (suite)":""),"mes");
  if(suite)F.suite=suite;
  const Z=dfZone(F), surb=new Map();
  F.mesZones=[];
  for(const r of lot){                               // une pastille de deux mesures : la couleur de la première
    if(!surb.has(r.a.p.cle))surb.set(r.a.p.cle,mesCouleur(r.i));
    if(!surb.has(r.b.p.cle))surb.set(r.b.p.cle,MES_NOIR);
  }

  /* en bas, à gauche du cartouche : le tableau puis les consignes */
  const larg=Z.cart.x-6-Z.x1;
  const lignes=lot.map(r=>["",mesTexte(r.a.p),mesTexte(r.b.p),r.m.type,r.m.att||"—",r.m.tol||"—","",r.m.note]);
  const blocs=dfTableau([{t:"N°",p:6,a:"m"},{t:"Sonde + (couleur)",p:20},{t:"Sonde − (noire)",p:20},{t:"Mesure",p:13},
      {t:"Attendu",p:11},{t:"Tol.",p:9},{t:"Détails",p:8,a:"m"},{t:"Note",p:28}],lignes,
    {cat:"mesure",symbole:(G,ri,cx,cy)=>{
      const r=lot[ri];
      dfCercle(G,cx,cy,1.7,{lw:0.3,trait:mesCouleur(r.i),plein:1});
      dfTexte(G,String(r.i+1),cx,cy+0.9,7,{ancre:"m",gras:true,c:mesCouleur(r.i),cat:"mesure",lieu:"mesure "+(r.i+1)});
    }});
  const ohm=lot.some(r=>/Résistance|Continuité/.test(r.m.type)), volt=lot.some(r=>/Tension|Oscillo/.test(r.m.type));
  const consignes=["Faire les mesures dans l'ordre du tableau"+(ohm&&volt?" : d'abord hors tension (résistance, continuité), puis sous tension.":"."),
    "Sonde « + » sur le point de la couleur de la mesure, sonde « − » sur le point noir.",
    "Valeur hors tolérance : arrêter et prévenir le bureau d'études."];
  if(ko.length)consignes.push("ATTENTION — mesure(s) non dessinée(s), point introuvable : "+
    ko.map(r=>"n° "+(r.i+1)+" ("+(r.a.err||r.b.err)+")").join(" ; "));
  blocs.push(dfBlocEspace(3),dfBlocTitre("Consignes"),
    ...dfBlocParagraphes(consignes.map((t,i)=>({num:(i+1)+".",texte:t,retrait:5})),6.5));
  const hBas=blocs.reduce((s,b)=>s+b.h(larg),0);
  const detailsCol=[];
  let y=Z.y2-hBas;
  const yHaut=Z.y1+2, yBas=Math.min(y,Z.cart.y)-6;

  /* les vues de la carte, à gauche ; dessous en plus si un point y est */
  const wV=(Z.x2-Z.x1)*0.46, faces=[false];
  if(lot.some(r=>r.a.p.face==="dessous"||r.b.p.face==="dessous"))faces.push(true);
  const hV=(yBas-yHaut-(faces.length-1)*4)/faces.length;
  const vues=faces.map((dessous,j)=>{
    const box={x:Z.x1,y:yHaut+j*(hV+4),w:wV,h:hV}, V=mesVue(E,box,dessous);
    dfTexte(F,(dessous?"VUE DE DESSOUS (carte retournée, en miroir)":"VUE DE DESSUS")+" — ÉCHELLE "+dfEchelleTxt(V.k),
            box.x,box.y+5,9,{gras:true,cat:"titre"});
    mesDessin(F,E,V.T,dessous,surb,F.mesZones);
    return Object.assign(V,{dessous});
  });
  const vueDe=p=>vues.find(v=>v.dessous===(p.face==="dessous"))||vues[0];
  if(!lot.length)dfTexte(F,"Aucune mesure : ajoutez-en dans le panneau « Fiche de mesure ».",Z.x1+wV+8,yHaut+12,9,{c:0.4,cat:"legende"});

  /* la grille des détails, à droite : le plus grand rayon qui tient */
  const groupes=[];
  const X0=Z.x1+wV+6, Wd=Z.x2-X0, Hd=yBas-yHaut;
  let nDet=lot.reduce((s,r)=>s+(r.a.p.face===r.b.p.face&&Math.hypot(r.a.p.x-r.b.p.x,r.a.p.y-r.b.p.y)<6?1:2),0);
  const grille=n=>mesGrille(n,Wd,Hd);
  let G=grille(nDet);
  for(const r of lot)for(const g of mesGroupes(r,G.R))groupes.push(Object.assign(g,{r}));
  if(groupes.length!==nDet){G=grille(groupes.length);}
  groupes.forEach((g,j)=>{
    g.lettre=mesLettre(n0.lettre++);
    const cw=Wd/G.cols, ch=Hd/G.rows;
    g.X=X0+cw*(j%G.cols+0.5);g.Y=yHaut+ch*Math.floor(j/G.cols)+G.R+2;
  });

  /* repères sur les vues de la carte : cercle et lettre de chaque détail,
     trait et bulle numérotée de chaque mesure */
  const reperes=new Map();                          // deux détails du même point : un cercle, « A, C »
  for(const g of groupes){
    const V=vueDe(g.pts[0]), C=V.T(g.cx,g.cy), rr=Math.max(G.R/g.k*V.k,1.2);
    const cle=[C.x,C.y,rr].map(v=>Math.round(v*5)).join();
    if(reperes.has(cle))reperes.get(cle).lettres.push(g.lettre);
    else reperes.set(cle,{C,rr,lettres:[g.lettre]});
  }
  const poses=[];                                   // cercles voisins : leurs lettres ne se recouvrent pas
  for(const {C,rr,lettres} of reperes.values()){
    dfCercle(F,C.x,C.y,rr,{lw:0.3});
    const x=C.x-rr*0.71-0.4;
    let y=C.y-rr*0.71-0.4;
    while(poses.some(p=>Math.abs(p.x-x)<8&&Math.abs(p.y-y)<3.4))y-=3.4;
    poses.push({x,y});
    dfTexte(F,lettres.join(", "),x,y,9,{ancre:"d",gras:true,cat:"detail",lieu:"repère du détail "+lettres.join(", ")});
  }
  const bulles=new Map();                           // bulles au même endroit (mêmes points) : côte à côte
  for(const r of lot){
    const col=mesCouleur(r.i), A=vueDe(r.a.p), B=vueDe(r.b.p);
    const pa=A.T(r.a.p.x,r.a.p.y), pb=B.T(r.b.p.x,r.b.p.y);
    const bulle=(x,y,ax,ay)=>{
      const cle=Math.round(ax*5)+","+Math.round(ay*5), n=bulles.get(cle)||0;
      bulles.set(cle,n+1);
      x+=n*4.4;
      dfLigne(F,ax,ay,x,y+1.9,0.2,col);
      dfCercle(F,x,y,1.9,{lw:0.35,trait:col,plein:1});
      dfTexte(F,String(r.i+1),x,y+1,8,{ancre:"m",gras:true,c:col,cat:"mesure",lieu:"mesure "+(r.i+1)});
    };
    if(A===B){
      dfLigne(F,pa.x,pa.y,pb.x,pb.y,0.25,col,true);
      bulle((pa.x+pb.x)/2,(pa.y+pb.y)/2-5,(pa.x+pb.x)/2,(pa.y+pb.y)/2);
    }else{bulle(pa.x+4,pa.y-5,pa.x,pa.y);bulle(pb.x+4,pb.y-5,pb.x,pb.y);}
  }

  /* les détails : la carte agrandie, découpée au cercle, et les sondes */
  for(const g of groupes){
    const dessous=g.face==="dessous", k=g.k;
    const sd=new Map(surb).set(g.r.a.p.cle,mesCouleur(g.r.i)).set(g.r.b.p.cle,MES_NOIR);   // le détail : les couleurs de sa mesure
    const T=mesLoupe(F,E,g.X,g.Y,G.R,g.cx,g.cy,k,dessous,sd,F.mesZones);
    for(const p of g.pts){
      const plus=p===g.r.a.p, col=plus?mesCouleur(g.r.i):MES_NOIR, P=T(p.x,p.y), b=mecaBoite(p.pts.map(q=>T(q.x,q.y)));
      const rp=Math.hypot(b.x2-b.x1,b.y2-b.y1)/2+0.6;
      const a=plus?-2.36:-0.79, d=Math.min(rp+5.5,G.R*0.8), sx=P.x+Math.cos(a)*d, sy=P.y+Math.sin(a)*d;
      dfRect(F,b.x1-0.6,b.y1-0.6,b.x2-b.x1+1.2,b.y2-b.y1+1.2,{lw:0.35,trait:col});
      dfLigne(F,sx,sy,P.x,P.y,0.45,col);
      dfCercle(F,sx,sy,2.2,{plein:col,trait:null});
      dfTexte(F,plus?"+":"−",sx,sy+1.2,10,{ancre:"m",gras:true,c:1,cat:"mesure",lieu:"sonde "+(plus?"+":"−")+" "+p.cle});
    }
    dfTexte(F,"DÉTAIL "+g.lettre+" — ÉCHELLE "+dfEchelleTxt(k)+(dessous?" — DESSOUS":""),g.X,g.Y+G.R+4.5,8,
            {ancre:"m",gras:true,cat:"detail",lieu:"vue de détail"});
    dfTexte(F,"Mesure "+(g.r.i+1)+" · "+g.pts.map(mesTexte).join(" / "),g.X,g.Y+G.R+8.3,6.5,
            {ancre:"m",c:mesCouleur(g.r.i),cat:"mesure",lieu:"mesure "+(g.r.i+1)});
    detailsCol.push([g.r.i,g.lettre]);
  }
  /* la colonne « Détails » du tableau, maintenant que les lettres sont connues */
  lot.forEach((r,ri)=>{lignes[ri][6]=detailsCol.filter(d=>d[0]===r.i).map(d=>d[1]).join(", ");});
  for(const b of blocs){b.dessiner(F,Z.x1,y,larg);y+=b.h(larg);}
  return F;
}

/* ==========================================================================
   Le panneau de saisie, le même dans les deux outils
   ========================================================================== */
function mesPointsConnus(E){
  const out=[], nets=new Set();
  for(const c of E.composants){
    if(c.pads.length===1)out.push(c.ref);
    else for(const p of c.pads)out.push(c.ref+"."+p.n);
    for(const p of c.pads)if(p.net)nets.add(p.net);
  }
  // shortcut: liste de suggestions bornée à 5000 pastilles ; au-delà, la saisie reste libre
  return out.slice(0,5000).concat([...nets].sort());
}
function mesFormHtml(E){
  const champ=(k,lib,ph,list)=>'<label class="df-champ"><span>'+lib+'</span><input type="text" data-mes="'+k+
    '" maxlength="60" autocomplete="off"'+(list?' list="mesPts"':"")+' placeholder="'+ph+'"></label>';
  const choix=(k,lib,opts)=>'<label class="df-champ"><span>'+lib+'</span><select class="tbsel" data-mes="'+k+'">'+
    opts.map(([v,t])=>'<option value="'+v+'">'+t+'</option>').join("")+'</select></label>';
  return '<datalist id="mesPts">'+mesPointsConnus(E).map(v=>'<option value="'+esc(v)+'">').join("")+'</datalist>'+
    champ("a","Sonde + (couleur)","U3.12, TP2 ou un net : GND",true)+champ("b","Sonde − (noire)","C6.2",true)+
    choix("type","Mesure",MES_TYPES.map(t=>[t,t]))+champ("att","Attendu","3,3 V")+champ("tol","Tolérance","± 5 %")+
    choix("ech","Échelle des détails",[[0,"auto"]].concat(MES_ECHELLES.map(k=>[k,k+":1"])))+
    champ("note","Note pour le technicien","Sous tension, J1 en 5 V")+
    '<button class="tb" type="button" data-mes-a="ajout" title="Entrée dans un champ fait de même">+ Ajouter la mesure</button>'+
    '<p class="mes-err" role="alert" style="color:#e05555;font-size:11px;margin:4px 0"></p><ol class="mes-liste" style="padding-left:0;list-style:none;margin:4px 0"></ol>';
}
function mesRendreListe(z,E,liste){
  const ol=z.querySelector(".mes-liste");
  if(!ol)return;
  ol.innerHTML=liste.map((m,i)=>{
    const a=mesResoudre(E,m.a), b=mesResoudre(E,m.b), err=a.err||b.err;
    const rgb="rgb("+mesCouleur(i).map(v=>Math.round(v*255)).join(",")+")";
    return '<li style="font-size:12px;margin:3px 0"><b style="color:'+rgb+'">'+(i+1)+'.</b> '+esc(m.a)+' → '+esc(m.b)+
      ' · '+esc(m.type)+(m.att?" "+esc(m.att):"")+(err?' <em style="color:#e05555">'+esc(err)+'</em>':"")+
      ' <button class="tb" type="button" data-mes-sup="'+i+'" aria-label="Supprimer la mesure '+(i+1)+'">✕</button></li>';
  }).join("");
}
/* `ops` : entree() l'entrée neutre, liste() les mesures, ecrire(liste) */
/* La pastille sous (X,Y) en mm de feuille : celle qui le contient (la plus
   petite), sinon la plus proche à moins de `tol`. */
function mesPadSous(F,X,Y,tol){
  let best=null, bd=Infinity;
  for(const q of (F&&F.mesZones)||[]){
    const d=Math.hypot(Math.max(q.x1-X,0,X-q.x2),Math.max(q.y1-Y,0,Y-q.y2)), a=(q.x2-q.x1)*(q.y2-q.y1);
    const note=d>0?d:-1/(1+a);
    if(d<=tol&&note<bd){bd=note;best=q.cle;}
  }
  return best;
}
/* `ops` : entree() l'entrée neutre, liste() les mesures, ecrire(liste).
   Rend choisir(cle) : un clic sur une pastille de l'aperçu remplit la sonde
   active (+ d'abord), puis passe à l'autre. */
function mesBrancher(z,ops){
  const champ=k=>z.querySelector('[data-mes="'+k+'"]');
  const val=k=>{const t=champ(k);return t?t.value:"";};
  const dire=t=>{const p=z.querySelector(".mes-err");if(p)p.textContent=t;};
  let actif="a";
  const activer=k=>{
    actif=k;
    for(const c of ["a","b"]){const t=champ(c);if(t&&t.style)t.style.outline=c===k?"2px solid #3d8bfd":"";}
  };
  activer("a");
  const ajouter=()=>{
    const E=ops.entree(), a=mesResoudre(E,val("a")), b=mesResoudre(E,val("b"));
    // mesNormListe garde les MES_MAX premières : la suivante se perdrait sans bruit
    const e=ops.liste().length>=MES_MAX?"Fiche pleine : "+MES_MAX+" mesures au plus. Supprimez-en une pour ajouter celle-ci.":
      a.err?"Sonde + : "+a.err:b.err?"Sonde − : "+b.err:a.p.cle===b.p.cle?"Les deux sondes sont sur la même pastille.":"";
    dire(e);
    if(e)return;
    const nom=q=>q.parNet?q.net:q.cle;       // un net reste un net : son meilleur point peut changer
    ops.ecrire(ops.liste().concat([{a:nom(a.p),b:nom(b.p),type:val("type"),att:val("att"),tol:val("tol"),
                                    note:val("note"),ech:+val("ech")}]));
    for(const k of ["a","b"]){const t=champ(k);if(t)t.value="";}
    activer("a");
  };
  z.addEventListener("click",ev=>{
    const t=ev.target.closest&&ev.target.closest("[data-mes-a],[data-mes-sup]");
    if(!t)return;
    if(t.dataset.mesA==="ajout")ajouter();
    else{const l=ops.liste().slice();l.splice(+t.dataset.mesSup,1);ops.ecrire(l);}
  });
  z.addEventListener("focusin",ev=>{const k=ev.target.dataset&&ev.target.dataset.mes;if(k==="a"||k==="b")activer(k);});
  z.addEventListener("keydown",ev=>{
    if(ev.key==="Enter"&&ev.target.dataset&&ev.target.dataset.mes!=null){ev.preventDefault();ajouter();}
  });
  return {choisir(cle){
    const t=champ(actif);
    if(!t)return;
    t.value=cle;
    const k=actif;
    activer(k==="a"?"b":"a");
    dire(k==="a"?cle+" → sonde +. Cliquez le point de la sonde −.":cle+" → sonde −. Entrée ou « Ajouter » pour valider.");
  }};
}

/* ==========================================================================
   Retrofit : les composants à reprendre sur une carte déjà faite
   --------------------------------------------------------------------------
   Une liste de repères, chacun avec une action (remplacer, ajouter, retirer,
   modifier), la nouvelle valeur ou référence et une note. La feuille montre
   la carte entière, les composants de la liste surlignés de la couleur de
   leur action et cerclés (lettre A, B…), chaque cercle relié par un trait à
   sa vue de détail agrandie — la « Board Detail View » d'Altium. Un tableau
   reprend la liste avec la référence actuelle de chaque composant (valeur,
   MPN, boîtier) : un composant grillé se remplace à l'identique, sans
   nouvelle valeur. Même entrée neutre que la fiche de mesure, plus `val`,
   `mpn` et `pkg`.
   ========================================================================== */
const RET_ACTIONS=["Remplacer","Ajouter","Retirer","Modifier"];
const RET_COUL={Remplacer:MES_COUL[3],Ajouter:MES_COUL[2],Retirer:MES_COUL[0],Modifier:MES_COUL[1]};
const RET_PAR_FEUILLE=6;
const RET_MAX=60;

function retNormListe(src){
  const t=(v,n)=>String(v==null?"":v).trim().slice(0,n), vus=new Set();
  return (Array.isArray(src)?src:[]).filter(l=>l&&typeof l==="object"&&t(l.ref,40))
    .filter(l=>{const k=t(l.ref,40).toUpperCase();if(vus.has(k))return false;vus.add(k);return true;})
    .slice(0,RET_MAX).map(l=>({ref:t(l.ref,40),action:RET_ACTIONS.includes(l.action)?l.action:RET_ACTIONS[0],
      val:t(l.val,80),note:t(l.note,200)}));
}
/* Ce qui sera posé : la nouvelle valeur, sinon la même référence pour un remplacement. */
function retNouveau(l){return l.val||(l.action==="Remplacer"?"À l'identique":"");}
function retComposant(E,ref){
  const R=String(ref).toUpperCase();
  return E.composants.find(c=>String(c.ref).toUpperCase()===R)||null;
}

function retFeuilles(E,liste,ctx){
  const res=liste.map(l=>({l,c:retComposant(E,l.ref)}));
  const ok=res.filter(r=>r.c&&r.c.corps.length>=3), ko=res.filter(r=>!(r.c&&r.c.corps.length>=3));
  ok.forEach((r,j)=>{r.lettre=mesLettre(j);r.col=RET_COUL[r.l.action];});
  const feuilles=[];
  for(let i=0;i<Math.max(ok.length,1);i+=RET_PAR_FEUILLE)
    feuilles.push(retFeuille(E,ok,ok.slice(i,i+RET_PAR_FEUILLE),i?[]:ko,ctx,feuilles.length));
  return feuilles;
}

function retFeuille(E,tous,lot,ko,ctx,suite){
  const F=dfNouvelle(ctx,"Retrofit"+(suite?" (suite)":""),"ret");
  if(suite)F.suite=suite;
  const Z=dfZone(F), surb=new Map();
  F.mesZones=[];
  for(const r of tous)for(const p of r.c.pads)surb.set(r.c.ref+"."+p.n,r.col);

  /* en bas, à gauche du cartouche : le tableau puis les consignes */
  const larg=Z.cart.x-6-Z.x1;
  const lignes=lot.map(r=>[r.lettre,r.c.ref,r.l.action,r.c.val||"—",r.c.mpn||"—",r.c.pkg||"—",retNouveau(r.l)||"—",r.l.note]);
  const blocs=dfTableau([{t:"Détail",p:6,a:"m"},{t:"Repère",p:8},{t:"Action",p:9},{t:"Valeur",p:11},
      {t:"Référence (MPN)",p:17},{t:"Boîtier",p:11},{t:"Nouveau",p:14},{t:"Note",p:24}],lignes,{cat:"retrofit",pt:8.5});
  const consignes=["Chaque composant est cerclé sur la vue de la carte et agrandi dans le détail de même lettre.",
    "Couleur de l'action : orange remplacer, vert ajouter, rouge retirer, bleu modifier.",
    "« À l'identique » : reposer la même référence (MPN) que le composant retiré.",
    "Vérifier le repère sérigraphié avant de dessouder ; contrôler la carte après reprise."];
  if(ko.length)consignes.push("ATTENTION — repère(s) introuvable(s) sur la carte, non dessiné(s) : "+ko.map(r=>r.l.ref).join(", "));
  blocs.push(dfBlocEspace(3),dfBlocTitre("Consignes"),
    ...dfBlocParagraphes(consignes.map((t,i)=>({num:(i+1)+".",texte:t,retrait:5})),8));
  const hBas=blocs.reduce((s,b)=>s+b.h(larg),0);
  let y=Z.y2-hBas;
  const yHaut=Z.y1+2, yBas=Math.min(y,Z.cart.y)-9;

  /* la carte entière, à gauche ; dessous en plus si un composant du lot y est */
  const wV=(Z.x2-Z.x1)*0.46, faces=[false];
  if(lot.some(r=>r.c.face==="dessous"))faces.push(true);
  const hV=(yBas-yHaut-(faces.length-1)*4)/faces.length;
  const vues=faces.map((dessous,j)=>{
    const box={x:Z.x1,y:yHaut+j*(hV+4),w:wV,h:hV}, V=mesVue(E,box,dessous);
    dfTexte(F,(dessous?"VUE DE DESSOUS (carte retournée, en miroir)":"VUE DE DESSUS")+" — ÉCHELLE "+dfEchelleTxt(V.k),
            box.x,box.y+5,11,{gras:true,cat:"titre"});
    mesDessin(F,E,V.T,dessous,surb,F.mesZones);
    for(const r of tous)if((r.c.face==="dessous")===dessous)
      dfPoly(F,r.c.corps.map(p=>V.T(p.x,p.y)),{ferme:true,lw:0.45,trait:r.col});
    return Object.assign(V,{dessous});
  });
  if(!lot.length)dfTexte(F,"Aucun composant : ajoutez-en dans le panneau « Retrofit ».",Z.x1+wV+8,yHaut+12,11,{c:0.4,cat:"legende"});

  /* les détails, à droite : un par composant, à la plus grande échelle (10:1 au plus) où il tient */
  const X0=Z.x1+wV+6, Wd=Z.x2-X0, Hd=yBas-yHaut, G=mesGrille(lot.length,Wd,Hd,19);   // 19 : titre et légende sur deux lignes
  /* d'abord la place de chaque détail et son cercle sur la vue */
  const cw=Wd/G.cols, ch=Hd/G.rows;
  const liens=lot.map((r,j)=>{
    const c=r.c, dessous=c.face==="dessous", V=vues.find(v=>v.dessous===dessous)||vues[0];
    const pts=c.corps.concat(...c.pads.map(p=>p.pts)), b=mecaBoite(pts), cx=(b.x1+b.x2)/2, cy=(b.y1+b.y2)/2;
    const ext=Math.max(...pts.map(p=>Math.hypot(p.x-cx,p.y-cy)),0.3);
    const k=DF_ECHELLES.find(e=>e<=10&&ext*e<=G.R*0.6)||DF_ECHELLES[DF_ECHELLES.length-1];
    const C=V.T(cx,cy), rr=Math.max(G.R/k*V.k,1.2);
    dfCercle(F,C.x,C.y,rr,{lw:0.35,trait:r.col});
    return {r,C,rr,D:{x:X0+cw*(j%G.cols+0.5),y:yHaut+ch*Math.floor(j/G.cols)+G.R+2},R:G.R,k,cx,cy,dessous};
  });
  /* les traits droits, tracés AVANT les détails et les légendes : ce qui suit
     les recouvre (disque blanc, fond blanc), un texte n'est jamais barré */
  for(const L of liens){
    const d=Math.hypot(L.D.x-L.C.x,L.D.y-L.C.y), ux=(L.D.x-L.C.x)/(d||1), uy=(L.D.y-L.C.y)/(d||1);
    if(d>L.rr+L.R)dfLigne(F,L.C.x+ux*L.rr,L.C.y+uy*L.rr,L.D.x-ux*L.R,L.D.y-uy*L.R,0.2,L.r.col);
  }
  for(const L of liens){
    const {r,D:{x:X,y:Y},k,dessous}=L, c=r.c;
    dfCercle(F,X,Y,G.R,{plein:1,trait:null});
    const T=mesLoupe(F,E,X,Y,G.R,L.cx,L.cy,k,dessous,surb,F.mesZones);
    dfPoly(F,c.corps.map(p=>T(p.x,p.y)),{ferme:true,lw:0.6,trait:r.col});
    retTexteFond(F,"DÉTAIL "+r.lettre+" — ÉCHELLE "+dfEchelleTxt(k)+(dessous?" — DESSOUS":""),X,Y+G.R+5.5,10,
                 {ancre:"m",gras:true,cat:"detail",lieu:"vue de détail"});
    const nv=retNouveau(r.l), ref=r.c.mpn||r.c.val;
    /* la référence actuelle, seulement quand rien ne la remplace (à l'identique, retrait) ;
       sur une seconde ligne si la légende déborde de sa colonne */
    const l1=c.ref+" · "+r.l.action+(nv?" → "+nv:""), l2=!r.l.val&&ref?"("+ref+")":"", wMax=cw-5;
    const lignesL=dfLargeur(l1+" "+l2,8.5,true)<=wMax?[(l1+" "+l2).trim()]:[l1,l2].filter(Boolean);
    const ptL=Math.max(5.5,Math.min(8.5,...lignesL.map(t=>8.5*wMax/dfLargeur(t,8.5,true))));
    lignesL.forEach((t,i)=>retTexteFond(F,t,X,Y+G.R+10+i*ptL*DF_PT*1.25,ptL,{ancre:"m",gras:true,c:r.col,cat:"retrofit",lieu:c.ref}));
    F.signets.push({titre:"Retrofit "+r.lettre+" — "+c.ref+" ("+r.l.action+")",x:X,y:Y});
  }
  for(const b of blocs){b.dessiner(F,Z.x1,y,larg);y+=b.h(larg);}
  retLettres(F,liens);
  return F;
}

/* Un texte sur un fond blanc : un trait qui passe dessous ne le barre pas. */
function retTexteFond(F,s,x,y,pt,o){
  dfTexte(F,s,x,y,pt,o);
  const it=F.items.pop(), b=dfBoiteTexte(it);
  dfRect(F,b.x1-0.6,b.y1-0.3,b.x2-b.x1+1.2,b.y2-b.y1+0.6,{plein:1,trait:null});
  F.items.push(it);
}
/* La lettre de chaque cercle de la vue, à la plus dégagée de huit places
   autour de lui : ni sur un texte, ni sur un autre cercle, ni sur un détail. */
function retLettres(F,liens){
  const textes=F.items.filter(it=>it.t==="t"&&!it.cache).map(it=>Object.assign(dfBoiteTexte(it),{w:it.cat==="repere"?0.5:6}));
  const chevauche=(a,b)=>a.x1<b.x2&&b.x1<a.x2&&a.y1<b.y2&&b.y1<a.y2;
  const dansCercle=(b,C,r)=>Math.hypot(clamp(C.x,b.x1,b.x2)-C.x,clamp(C.y,b.y1,b.y2)-C.y)<r;
  for(const L of liens){
    let best=null;
    for(const a of [-135,-45,135,45,180,0,-90,90]){
      const u=a*Math.PI/180, d=L.rr+1.2, x=L.C.x+Math.cos(u)*d, y=L.C.y+Math.sin(u)*d;
      const it={s:L.r.lettre,pt:12,gras:true,rot:0,ancre:Math.cos(u)<-0.3?"d":Math.cos(u)>0.3?"g":"m",x,y:y+(Math.sin(u)>0.3?3.4:Math.sin(u)<-0.3?0:1.7)};
      const b=dfBoiteTexte(it);
      const note=textes.filter(t=>chevauche(t,b)).reduce((s,t)=>s+t.w,0)+
        liens.filter(o=>o!==L&&dansCercle(b,o.C,o.rr)).length*2+liens.filter(o=>dansCercle(b,o.D,o.R)).length*5;
      if(!best||note<best.note)best={note,it,b};
    }
    retTexteFond(F,L.r.lettre,best.it.x,best.it.y,12,{ancre:best.it.ancre,gras:true,c:L.r.col,cat:"detail",
                 lieu:"repère du détail "+L.r.lettre+" · "+L.r.c.ref});
    textes.push(Object.assign(best.b,{w:6}));
  }
}

/* Le panneau de saisie : un ou plusieurs repères à la fois (« U3 C12 R5 »),
   la même action, valeur et note pour chacun. */
function retFormHtml(E){
  const champ=(k,lib,ph,n,list)=>'<label class="df-champ"><span>'+lib+'</span><input type="text" data-ret="'+k+
    '" maxlength="'+n+'" autocomplete="off"'+(list?' list="retRefs"':"")+' placeholder="'+ph+'"></label>';
  return '<datalist id="retRefs">'+E.composants.slice(0,5000).map(c=>'<option value="'+esc(c.ref)+'">').join("")+'</datalist>'+
    champ("ref","Repère(s)","U3, ou une liste : U3 C12 R5",400,true)+
    '<label class="df-champ"><span>Action</span><select class="tbsel" data-ret="action">'+
      RET_ACTIONS.map(a=>'<option value="'+a+'">'+a+'</option>').join("")+'</select></label>'+
    champ("val","Nouvelle valeur ou MPN","vide : même référence",80)+champ("note","Note","Ajouter en parallèle sur C7",200)+
    '<button class="tb" type="button" data-ret-a="ajout" title="Entrée dans un champ fait de même ; un clic sur un composant de la feuille ajoute son repère">+ Ajouter au retrofit</button>'+
    '<p class="ret-err" role="alert" style="color:#e05555;font-size:11px;margin:4px 0"></p><ol class="ret-liste" style="padding-left:0;list-style:none;margin:4px 0"></ol>';
}
function retRendreListe(z,E,liste){
  const ol=z.querySelector(".ret-liste");
  if(!ol)return;
  ol.innerHTML=liste.map((l,i)=>{
    const rgb="rgb("+RET_COUL[l.action].map(v=>Math.round(v*255)).join(",")+")";
    return '<li style="font-size:12px;margin:3px 0"><b style="color:'+rgb+'">'+esc(l.ref)+'</b> · '+esc(l.action)+
      (retNouveau(l)?" → "+esc(retNouveau(l)):"")+(l.note?" · "+esc(l.note):"")+
      (retComposant(E,l.ref)?"":' <em style="color:#e05555">introuvable sur la carte</em>')+
      ' <button class="tb" type="button" data-ret-sup="'+i+'" aria-label="Retirer '+esc(l.ref)+' du retrofit">✕</button></li>';
  }).join("");
}
/* `ops` : entree() l'entrée neutre, liste() la liste, ecrire(liste).
   Rend choisir(ref) : un clic sur un composant de la feuille ajoute son repère au champ. */
function retBrancher(z,ops){
  const champ=k=>z.querySelector('[data-ret="'+k+'"]');
  const val=k=>{const t=champ(k);return t?t.value:"";};
  const dire=t=>{const p=z.querySelector(".ret-err");if(p)p.textContent=t;};
  const ajouter=()=>{
    const E=ops.entree(), liste=ops.liste(), refs=val("ref").split(/[\s,;]+/).filter(Boolean);
    const pris=new Set(liste.map(l=>l.ref.toUpperCase())), neufs=[], inconnus=[], doublons=[];
    for(const r of refs){
      const c=retComposant(E,r);
      if(!c)inconnus.push(r);
      else if(pris.has(c.ref.toUpperCase()))doublons.push(c.ref);
      else{pris.add(c.ref.toUpperCase());neufs.push({ref:c.ref,action:val("action"),val:val("val"),note:val("note")});}
    }
    const place=RET_MAX-liste.length;
    const e=!refs.length?"Donnez au moins un repère.":
      neufs.length>place?"Retrofit plein : "+RET_MAX+" composants au plus ("+place+" place(s) libre(s)).":
      inconnus.length?"Introuvable(s) sur la carte : "+inconnus.join(", ")+".":
      !neufs.length&&doublons.length?"Déjà dans la liste : "+doublons.join(", ")+".":"";
    dire(e);
    if(e)return;
    ops.ecrire(liste.concat(neufs));
    const t=champ("ref");if(t)t.value="";
    if(doublons.length)dire("Déjà dans la liste, ignoré(s) : "+doublons.join(", ")+".");
  };
  z.addEventListener("click",ev=>{
    const t=ev.target.closest&&ev.target.closest("[data-ret-a],[data-ret-sup]");
    if(!t)return;
    if(t.dataset.retA==="ajout")ajouter();
    else{const l=ops.liste().slice();l.splice(+t.dataset.retSup,1);ops.ecrire(l);}
  });
  z.addEventListener("keydown",ev=>{
    if(ev.key==="Enter"&&ev.target.dataset&&ev.target.dataset.ret!=null){ev.preventDefault();ajouter();}
  });
  return {choisir(ref){
    const t=champ("ref");
    if(!t)return;
    const deja=t.value.split(/[\s,;]+/).filter(Boolean);
    if(!deja.some(r=>r.toUpperCase()===ref.toUpperCase()))t.value=deja.concat([ref]).join(" ");
    dire(t.value+" : « Ajouter au retrofit » ou Entrée pour valider.");
  }};
}
/* Le repère d'une clé de pastille « U3.12 » (mesPadSous). */
function retRefDeCle(cle){const i=String(cle).lastIndexOf(".");return i>0?cle.slice(0,i):cle;}
