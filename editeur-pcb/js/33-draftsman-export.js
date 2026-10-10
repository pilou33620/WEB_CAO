"use strict";
/* ==========================================================================
   Éditeur PCB — Draftsman : export DXF pour la mécanique, fonte embarquée
   --------------------------------------------------------------------------
   Deux sorties de plus pour les plans de 29-draftsman.js.

   1. LE DXF. Le mécanicien ne lit pas un PDF : il veut le contour dans son
      modeleur, à l'échelle, pour dessiner le boîtier autour. Deux fichiers :

        · la CARTE SEULE, à l'échelle 1:1, en millimètres, dans le repère des
          Gerber et de l'Excellon (même origine, Y vers le haut) : contour,
          découpes, trous (un CIRCLE par trou, métallisés et non métallisés
          sur deux calques), encombrement et repère de chaque composant (une
          face par calque), cotes hors tout, tableau de perçage à côté ;
        · la FEUILLE du plan entière (cadre, cartouche, vue cotée, tableaux,
          notes), lue dans la liste d'objets de la feuille — la même que
          lisent le PDF et l'aperçu SVG. Tout ce que 29-draftsman.js dessine
          y passe donc sans rien ajouter ici, les cotes posées à la main
          comprises. Le calque d'un objet vient du repère `dfCalque(F,nom)`
          qui le précède dans la liste (contour, perçage, cotes, pastilles,
          composants), de la catégorie d'un texte (`cat`), ou de sa place sur
          la feuille (cadre, cartouche) ; le reste va sur DESSIN.

      Version : AutoCAD R12 (AC1009), en ASCII. C'est la plus lue de toutes —
      SolidWorks, Inventor, Fusion, FreeCAD, LibreCAD, QCAD, KiCad, et les
      machines de découpe qui ne lisent qu'elle. R2000 apporterait la
      LWPOLYLINE, mais au prix des poignées, des propriétaires et de la
      section OBJECTS : autant de liens qu'un lecteur strict refuse au moindre
      écart, pour rien ici — le contour s'écrit en LINE et ARC, les corps en
      POLYLINE fermée, que R12 connaît. Les unités sont annoncées comme en
      R2000 ($INSUNITS = 4, millimètres ; $MEASUREMENT = 1, métrique) : un
      lecteur R12 ignore ces variables, un lecteur récent ne demande plus
      l'unité à l'import. Le texte est en Windows-1252 ($DWGCODEPAGE), comme
      le WinAnsi du PDF, ce qui n'y entre pas écrit de la même façon (Ω →
      Ohm, ≥ → >=) ; °, ± et Ø en %%d, %%p et %%c, les codes que tout
      lecteur DXF connaît.

      Le modèle de la carte ne garde que des sommets. Un arc importé (coin
      arrondi, carte ronde) y est une suite de cordes égales : dxfSegments()
      les retrouve et les écrit en ARC, tangentes comprises, pour que le
      modeleur reçoive un rayon et non vingt facettes. Les arcs passent
      exactement par les sommets de part et d'autre : le contour reste fermé
      au micron.

   2. LA FONTE EMBARQUÉE dans le PDF des plans. Helvetica n'est pas
      embarquée : chaque lecteur la remplace par ce qu'il a (Arial, Nimbus,
      parfois pire), et WinAnsi ne connaît ni Ω, ni ≤, ni ≥. La fonte est ici
      PlansSans, un sous-ensemble de Liberation Sans (OFL 1.1) pré-réduit par
      outils/fonte-plans.py dans js/fontes/plans-sans.js : 432 caractères,
      29 Ko par graisse, 80 Ko de base64 pour les deux — pour 820 Ko de
      fontes d'origine. Liberation Sans a les chasses d'Arial, donc
      d'Helvetica : la mise en page des plans (repères centrés, colonnes
      coupées avec la table d'Helvetica) ne bouge pas d'un trait.

      À chaque PDF, on ne garde que les glyphes que ses feuilles emploient :
      tables glyf / loca réduites, cmap, hmtx, head, hhea, maxp, OS/2, name et
      post minimal, réécrits en JavaScript pur. Le PDF la déclare en
      CIDFontType2, codage Identity-H (deux octets par glyphe), avec une
      /ToUnicode : le texte reste cherchable et copiable, Ω, µ, ±, °, ≤ et ≥
      compris, et les textes invisibles du plan aussi. Un caractère que la
      fonte n'a pas suit le même chemin qu'avant (⌀ → Ø, ✓ → OK, lettre
      sans son accent, puis « ? »).

      Option « Fonte embarquée » de la fenêtre, cochée par défaut, gardée
      dans le document (`dessin.fonte`). Sans elle, ou si la fonte n'est pas
      chargée, le PDF reprend Helvetica en WinAnsi, comme avant.

      Le Master Drawing (04-pdf-masterdraw.js) emporte la même fonte, par
      le même sous-ensembleur et sous la même option, mais en TrueType
      simple d'un octet par caractère (dffPreparerSimple) : l'ASCII y garde
      son code, et son contenu se relit en clair. dffStyles, dffEtiquette,
      dffToUnicode et dffDescripteur servent les deux.

   Points d'accroche dans les autres fichiers, un appel chacun : dfCalque()
   dans les feuilles et dfFontePreparer() dans dfPdf() (29-draftsman.js),
   dfxCadre() à la fin de dfRendreCadre(), dxfFichiers() dans
   buildFabFiles() (04-fabrication.js), dffPreparerSimple() dans mdFonte()
   (04-pdf-masterdraw.js) ; le Master Drawing annonce les DXF.
   ========================================================================== */

/* ==========================================================================
   DXF : écriture
   ========================================================================== */
/* Les calques, leur couleur AutoCAD (ACI) et leur type de trait. Les noms
   sont en capitales sans accent : certains lecteurs n'en acceptent pas
   d'autres. */
const DXF_CALQUES={
  CONTOUR:7, DECOUPES:5, TROUS_METALLISES:1, TROUS_NON_METALLISES:3,
  COMPOSANTS_DESSUS:4, COMPOSANTS_DESSOUS:6, REPERES_DESSUS:4, REPERES_DESSOUS:6,
  COTES:2, ORIGINE:1, TABLEAU_PERCAGE:7,
  /* feuille du plan */
  CADRE:8, CARTOUCHE:7, PERCAGE:1, PASTILLES:8, COMPOSANTS:4, REPERES:4,
  TABLEAUX:7, EMPILAGE:7, NOTES:7, TEXTES:7, DESSIN:7
};
/* Le calque d'un texte de feuille, d'après sa catégorie (29-draftsman.js). */
const DXF_CAT={zone:"CADRE",cartouche:"CARTOUCHE",cote:"COTES",repere:"REPERES",nm:"REPERES",
  percage:"TABLEAUX",symbole:"PERCAGE",tableau:"TABLEAUX",impedance:"TABLEAUX",bom:"TABLEAUX",
  empilage:"EMPILAGE",note:"NOTES",titre:"TEXTES",legende:"TEXTES"};
/* Hauteur des capitales d'Helvetica (et de Liberation Sans), en part du
   corps : la hauteur d'un TEXT DXF est celle des capitales, pas le corps. */
const DXF_CAPS=0.716;

function dxfNouveau(){
  return {calques:new Set(),e:[],x1:Infinity,y1:Infinity,x2:-Infinity,y2:-Infinity,
          n:{LINE:0,ARC:0,CIRCLE:0,POLYLINE:0,TEXT:0,SOLID:0}};
}
function dxfNum(v){
  const r=Math.round(v*1e6)/1e6;
  return String(r===0?0:r);
}
function dxfEtendre(D,x,y){
  if(x<D.x1)D.x1=x;if(x>D.x2)D.x2=x;
  if(y<D.y1)D.y1=y;if(y>D.y2)D.y2=y;
}
/* Une entité : son type, son calque, puis les couples (code, valeur). */
function dxfEnt(D,type,cal,codes,lt){
  D.calques.add(cal);
  D.n[type]=(D.n[type]||0)+1;
  const L=[0,type,8,cal];
  if(lt)L.push(6,lt);
  D.e.push(L.concat(codes));
}
function dxfLigne(D,cal,a,b,lt){
  dxfEtendre(D,a.x,a.y);dxfEtendre(D,b.x,b.y);
  dxfEnt(D,"LINE",cal,[10,a.x,20,a.y,30,0,11,b.x,21,b.y,31,0],lt);
}
/* Arc de centre c et de rayon r, de a1 à a2 en degrés, sens trigonométrique
   (celui du DXF, Y vers le haut). */
function dxfArc(D,cal,c,r,a1,a2){
  const n=v=>((v%360)+360)%360;
  dxfEtendre(D,c.x-r,c.y-r);dxfEtendre(D,c.x+r,c.y+r);
  dxfEnt(D,"ARC",cal,[10,c.x,20,c.y,30,0,40,r,50,n(a1),51,n(a2)]);
}
function dxfCercle(D,cal,c,r){
  dxfEtendre(D,c.x-r,c.y-r);dxfEtendre(D,c.x+r,c.y+r);
  dxfEnt(D,"CIRCLE",cal,[10,c.x,20,c.y,30,0,40,r]);
}
/* POLYLINE « lourde » de R12 : l'entité, ses sommets, SEQEND. */
function dxfPoly(D,cal,pts,ferme,lt){
  if(pts.length===2&&!ferme){dxfLigne(D,cal,pts[0],pts[1],lt);return;}
  const L=[66,1,10,0,20,0,30,0,70,ferme?1:0];
  for(const p of pts){
    dxfEtendre(D,p.x,p.y);
    L.push(0,"VERTEX",8,cal,10,p.x,20,p.y,30,0);
  }
  L.push(0,"SEQEND",8,cal);
  dxfEnt(D,"POLYLINE",cal,L,lt);
}
/* Surface pleine de trois ou quatre sommets (flèches de cote, symboles).
   SOLID prend ses sommets en zigzag : 1, 2, 4, 3. */
function dxfSolide(D,cal,pts){
  const p=pts.length===3?[pts[0],pts[1],pts[2],pts[2]]:[pts[0],pts[1],pts[3],pts[2]];
  const L=[];
  p.forEach((q,i)=>{dxfEtendre(D,q.x,q.y);L.push(10+i,q.x,20+i,q.y,30+i,0);});
  dxfEnt(D,"SOLID",cal,L);
}
/* Texte : `h` hauteur des capitales en mm, `rot` en degrés (sens trigo),
   `ancre` g / m / d sur la ligne de base. */
function dxfTexte(D,cal,s,p,h,rot,ancre){
  s=String(s==null?"":s);
  if(!s.trim())return;
  const j=ancre==="m"?1:(ancre==="d"?2:0);
  const L=[10,p.x,20,p.y,30,0,40,h,1,s];
  if(rot)L.push(50,rot);
  L.push(7,"PLANS");
  if(j)L.push(72,j,11,p.x,21,p.y,31,0);
  dxfEtendre(D,p.x,p.y);
  dxfEnt(D,"TEXT",cal,L);
}
/* Chaîne d'un TEXT : codes AutoCAD pour °, ± et Ø, « %% » protégé. Le
   codage en Windows-1252 se fait à l'écriture du fichier. */
function dxfChaine(s){
  return String(s).normalize("NFC").replace(/[\r\n\t]+/g," ").replace(/%%/g,"%%%%%%")
    .replace(/°/g,"%%d").replace(/±/g,"%%p").replace(/[Ø⌀]/g,"%%c");
}
/* Le fichier, en octets Windows-1252 : le codage WinAnsi du PDF (dfWinAnsi),
   qui est le même jeu. Ce qui n'y entre pas s'écrit comme dans le PDF sans
   fonte embarquée (Ω → Ohm, ≥ → >=) : l'échappement \U+XXXX d'AutoCAD
   n'est pas lu par tous les modeleurs, et un « \U+2265 » sur une cote ne
   sert à personne. */
function dxfOctets(D){
  const out=[];
  const g=(c,v)=>{out.push(String(c).padStart(3," "));out.push(typeof v==="number"?dxfNum(v):String(v));};
  const ext=Number.isFinite(D.x1)?D:{x1:0,y1:0,x2:0,y2:0};
  g(0,"SECTION");g(2,"HEADER");
  g(9,"$ACADVER");g(1,"AC1009");
  g(9,"$DWGCODEPAGE");g(3,"ANSI_1252");
  g(9,"$INSBASE");g(10,0);g(20,0);g(30,0);
  g(9,"$EXTMIN");g(10,ext.x1);g(20,ext.y1);g(30,0);
  g(9,"$EXTMAX");g(10,ext.x2);g(20,ext.y2);g(30,0);
  g(9,"$LIMMIN");g(10,ext.x1);g(20,ext.y1);
  g(9,"$LIMMAX");g(10,ext.x2);g(20,ext.y2);
  g(9,"$LUNITS");g(70,2);
  g(9,"$LUPREC");g(70,3);
  g(9,"$INSUNITS");g(70,4);
  g(9,"$MEASUREMENT");g(70,1);
  g(0,"ENDSEC");

  g(0,"SECTION");g(2,"TABLES");
  g(0,"TABLE");g(2,"LTYPE");g(70,2);
  g(0,"LTYPE");g(2,"CONTINUOUS");g(70,0);g(3,"Solid line");g(72,65);g(73,0);g(40,0);
  g(0,"LTYPE");g(2,"DASHED");g(70,0);g(3,"__ __ __ __");g(72,65);g(73,2);g(40,1.76);g(49,1.06);g(49,-0.7);
  g(0,"ENDTAB");
  const cals=[...D.calques].sort();
  g(0,"TABLE");g(2,"LAYER");g(70,cals.length+1);
  g(0,"LAYER");g(2,"0");g(70,0);g(62,7);g(6,"CONTINUOUS");
  for(const c of cals){g(0,"LAYER");g(2,c);g(70,0);g(62,DXF_CALQUES[c]||7);g(6,"CONTINUOUS");}
  g(0,"ENDTAB");
  /* STANDARD pour la forme, PLANS pour les textes : Arial, dont les chasses
     sont celles d'Helvetica — les colonnes des tableaux restent justes. */
  g(0,"TABLE");g(2,"STYLE");g(70,2);
  g(0,"STYLE");g(2,"STANDARD");g(70,0);g(40,0);g(41,1);g(50,0);g(71,0);g(42,2.5);g(3,"txt");g(4,"");
  g(0,"STYLE");g(2,"PLANS");g(70,0);g(40,0);g(41,1);g(50,0);g(71,0);g(42,2.5);g(3,"arial.ttf");g(4,"");
  g(0,"ENDTAB");
  g(0,"ENDSEC");

  g(0,"SECTION");g(2,"BLOCKS");g(0,"ENDSEC");

  g(0,"SECTION");g(2,"ENTITIES");
  for(const L of D.e)
    for(let i=0;i<L.length;i+=2)g(L[i],L[i]===1?dxfChaine(L[i+1]):L[i+1]);
  g(0,"ENDSEC");
  g(0,"EOF");

  const o=[];
  for(const ligne of out){
    for(const c of dfWinAnsi(ligne))o.push(c);
    o.push(13,10);
  }
  return Uint8Array.from(o);
}

/* ==========================================================================
   Contour : segments et arcs retrouvés
   ========================================================================== */
function dxfCercle3(a,b,c){
  const d=2*(a.x*(b.y-c.y)+b.x*(c.y-a.y)+c.x*(a.y-b.y));
  if(Math.abs(d)<1e-12)return null;
  const A=a.x*a.x+a.y*a.y, B=b.x*b.x+b.y*b.y, C=c.x*c.x+c.y*c.y;
  const x=(A*(b.y-c.y)+B*(c.y-a.y)+C*(a.y-b.y))/d, y=(A*(c.x-b.x)+B*(a.x-c.x)+C*(b.x-a.x))/d;
  return {x,y,r:Math.hypot(a.x-x,a.y-y)};
}
const DXF_ARC_PAS=Math.PI/6;     // au plus 30° par corde : un octogone reste un octogone
/* Les sommets P[i0], P[i0+1]… P[i0+k] (indices pris modulo n) sont-ils les
   cordes d'un même arc ? Cordes égales, tournant toutes du même côté, de 30°
   au plus, sommets sur le cercle à quelques microns près. Rend le cercle,
   qui passe EXACTEMENT par le premier et le dernier sommet, et le sens. */
function dxfAjuste(P,i0,k,C0){
  const n=P.length, Q=j=>P[(i0+j)%n];
  if(k<3)return null;
  const C=C0||dxfCercle3(Q(0),Q(k>>1),Q(k));
  if(!C||C.r>5000)return null;
  const tol=0.004+C.r*2e-4;
  let lmin=Infinity, lmax=0, sens=0;
  for(let j=0;j<=k;j++){
    const p=Q(j);
    if(Math.abs(Math.hypot(p.x-C.x,p.y-C.y)-C.r)>tol)return null;
    if(j<k){
      const q=Q(j+1), l=Math.hypot(q.x-p.x,q.y-p.y);
      lmin=Math.min(lmin,l);lmax=Math.max(lmax,l);
      if(l>2*C.r*Math.sin(DXF_ARC_PAS/2)+tol)return null;
    }
    if(j>0&&j<k){
      const a=Q(j-1), b=Q(j+1);
      const x=(p.x-a.x)*(b.y-p.y)-(p.y-a.y)*(b.x-p.x);
      const s=x>0?1:(x<0?-1:0);
      if(!s||(sens&&s!==sens))return null;
      sens=s;
    }
  }
  if(lmax-lmin>0.01+0.05*lmax)return null;
  return {c:C,sens};
}
/* Le contour fermé `P` (coordonnées de sortie, Y vers le haut) en éléments :
   {t:"l",a,b} ou {t:"a",c,r,a1,a2} (degrés, sens trigonométrique). */
function dxfSegments(P0){
  const P=[];
  for(const p of P0){
    const q=P[P.length-1];
    if(!q||Math.hypot(p.x-q.x,p.y-q.y)>1e-9)P.push({x:p.x,y:p.y});
  }
  while(P.length>2&&Math.hypot(P[0].x-P[P.length-1].x,P[0].y-P[P.length-1].y)<=1e-9)P.pop();
  const n=P.length, out=[];
  if(n<2)return out;
  if(n===2)return [{t:"l",a:P[0],b:P[1]}];
  const deg=(c,p)=>Math.atan2(p.y-c.y,p.x-c.x)*180/Math.PI;
  const arc=(C,sens,a,b)=>sens>0?{t:"a",c:{x:C.x,y:C.y},r:C.r,a1:deg(C,a),a2:deg(C,b)}
                                :{t:"a",c:{x:C.x,y:C.y},r:C.r,a1:deg(C,b),a2:deg(C,a)};
  /* une carte ronde : tout le contour sur un cercle — deux demi-arcs, sur
     le cercle qui passe exactement par leurs extrémités */
  if(n>=8){
    const h=n>>1, C=dxfCercle3(P[0],P[h>>1],P[h]);
    const tout=C&&dxfAjuste(P,0,n,C);
    if(tout)return [arc(C,tout.sens,P[0],P[h]),arc(C,tout.sens,P[h],P[0])];
  }
  /* partir d'un vrai coin : un sommet qu'aucun arc ne traverse */
  let dep=0;
  for(let i=0;i<n;i++)if(!dxfAjuste(P,(i-1+n)%n,3)&&!dxfAjuste(P,(i-2+n)%n,3)){dep=i;break;}
  let fait=0, i=dep;
  while(fait<n){
    let k=0, best=null;
    for(let kk=3;kk<=n-fait;kk++){
      const A=dxfAjuste(P,i,kk);
      if(!A)break;
      k=kk;best=A;
    }
    if(best){
      out.push(arc(best.c,best.sens,P[i],P[(i+k)%n]));
      fait+=k;i=(i+k)%n;
    }else{
      out.push({t:"l",a:P[i],b:P[(i+1)%n]});
      fait++;i=(i+1)%n;
    }
  }
  return out;
}
function dxfContour(D,cal,P){
  for(const s of dxfSegments(P)){
    if(s.t==="l")dxfLigne(D,cal,s.a,s.b);
    else dxfArc(D,cal,s.c,s.r,s.a1,s.a2);
  }
}

/* ==========================================================================
   DXF de la carte, à l'échelle 1:1
   ========================================================================== */
/* Cote dessinée en entités simples : lignes d'attache, ligne de cote, deux
   flèches pleines, valeur. `sens` "h" (sous les points) ou "v" (à gauche). */
function dxfCote(D,cal,p1,p2,sens,d,texte,h){
  h=h||2.5;
  const fl=(p,ux,uy)=>{
    const L=2.5, l=0.6;
    dxfSolide(D,cal,[p,{x:p.x-ux*L-uy*l,y:p.y-uy*L+ux*l},{x:p.x-ux*L+uy*l,y:p.y-uy*L-ux*l}]);
  };
  if(sens==="h"){
    const y=Math.min(p1.y,p2.y)-d, s=Math.sign(p2.x-p1.x)||1;
    dxfLigne(D,cal,{x:p1.x,y:p1.y-1},{x:p1.x,y:y-1.5});
    dxfLigne(D,cal,{x:p2.x,y:p2.y-1},{x:p2.x,y:y-1.5});
    dxfLigne(D,cal,{x:p1.x,y},{x:p2.x,y});
    fl({x:p1.x,y},-s,0);fl({x:p2.x,y},s,0);
    dxfTexte(D,cal,texte,{x:(p1.x+p2.x)/2,y:y+1},h,0,"m");
  }else{
    const x=Math.min(p1.x,p2.x)-d, s=Math.sign(p2.y-p1.y)||1;
    dxfLigne(D,cal,{x:p1.x-1,y:p1.y},{x:x-1.5,y:p1.y});
    dxfLigne(D,cal,{x:p2.x-1,y:p2.y},{x:x-1.5,y:p2.y});
    dxfLigne(D,cal,{x,y:p1.y},{x,y:p2.y});
    fl({x,y:p1.y},0,-s);fl({x,y:p2.y},0,s);
    dxfTexte(D,cal,texte,{x:x-1,y:(p1.y+p2.y)/2},h,90,"m");
  }
}
/* Rend {octets, D, trous}. Repère : celui des Gerber et de l'Excellon
   (gOrigin), X vers la droite, Y vers le haut, en millimètres. */
function dxfCarte(){
  const D=dxfNouveau(), o=gOrigin();
  const P=(x,y)=>({x:x-o.x,y:o.y-y});
  const vid=(S.variantes&&S.variantes.active)||"";

  dxfContour(D,"CONTOUR",boardPoly().map(p=>P(p.x,p.y)));
  for(const c of boardCutouts())dxfContour(D,"DECOUPES",c.map(p=>P(p.x,p.y)));

  /* un CIRCLE par trou, au diamètre fini : la source est celle du tableau
     de perçage du plan, donc celle de l'Excellon */
  const groupes=dfPercages();
  let trous=0;
  for(const e of groupes)
    for(const p of e.pts){
      dxfCercle(D,e.plaque?"TROUS_METALLISES":"TROUS_NON_METALLISES",P(p.x,p.y),e.d/2);
      trous++;
    }

  /* encombrement et repère : le corps de chaque composant, une face par
     calque ; les non-montés de la variante active en tirets */
  for(const fp of S.fps){
    const face=fp.side?"DESSOUS":"DESSUS";
    const T=fpXform(fp), b=bodyOf(fp);
    const coins=[T(b.x1,b.y1),T(b.x2,b.y1),T(b.x2,b.y2),T(b.x1,b.y2)].map(p=>P(p.x,p.y));
    const monte=typeof varEstMonte!=="function"||varEstMonte(fp,vid);
    dxfPoly(D,"COMPOSANTS_"+face,coins,true,monte?null:"DASHED");
    const xs=coins.map(p=>p.x), ys=coins.map(p=>p.y);
    const bw=Math.max(...xs)-Math.min(...xs), bh=Math.max(...ys)-Math.min(...ys);
    const vertical=bh>bw*1.15, long=vertical?bh:bw, court=vertical?bw:bh;
    const ref=String(fp.ref||"?");
    let h=clamp(court*0.45,0.4,1.5);
    const lw=dfLargeur(ref,h/DXF_CAPS/DF_PT,true);
    if(lw>long*0.92)h=Math.max(0.3,h*long*0.92/lw);
    const c={x:(Math.max(...xs)+Math.min(...xs))/2,y:(Math.max(...ys)+Math.min(...ys))/2};
    dxfTexte(D,"REPERES_"+face,ref,vertical?{x:c.x+h/2,y:c.y}:{x:c.x,y:c.y-h/2},h,vertical?90:0,"m");
  }

  /* cotes hors tout et origine */
  const B=boardPoly().map(p=>P(p.x,p.y));
  const x1=Math.min(...B.map(p=>p.x)), x2=Math.max(...B.map(p=>p.x));
  const y1=Math.min(...B.map(p=>p.y)), y2=Math.max(...B.map(p=>p.y));
  const fr=v=>fmt(v,2).replace(".",",");
  dxfCote(D,"COTES",{x:x1,y:y1},{x:x2,y:y1},"h",8,fr(x2-x1));
  dxfCote(D,"COTES",{x:x1,y:y1},{x:x1,y:y2},"v",8,fr(y2-y1));
  dxfLigne(D,"ORIGINE",{x:-3,y:0},{x:3,y:0});
  dxfLigne(D,"ORIGINE",{x:0,y:-3},{x:0,y:3});

  /* tableau de perçage, à droite de la carte */
  const cols=[["Outil",14],["Ø fini (mm)",24],["Qté",12],["Métallisé",19],["Portée",18],["Usage",42]];
  const lignes=groupes.map((e,i)=>["T"+(i+1),fr(e.d),String(e.pts.length),e.plaque?"Oui":"Non",
                                    dfPortee(e),[...e.usages].join(", ")]);
  lignes.push(["","Total",String(trous),"","",""]);
  const tx=x2+20, ty=y2, rh=5, W=cols.reduce((a,c)=>a+c[1],0);
  dxfTexte(D,"TABLEAU_PERCAGE","TABLEAU DE PERÇAGE — "+fabBase(),{x:tx,y:ty+2},3,0,"g");
  [cols.map(c=>c[0])].concat(lignes).forEach((r,k)=>{
    const y=ty-rh*k;
    dxfLigne(D,"TABLEAU_PERCAGE",{x:tx,y},{x:tx+W,y});
    let x=tx;
    r.forEach((v,i)=>{
      dxfTexte(D,"TABLEAU_PERCAGE",v,{x:x+1.2,y:y-rh+1.4},2,0,"g");
      x+=cols[i][1];
    });
  });
  const yb=ty-rh*(lignes.length+1);
  dxfLigne(D,"TABLEAU_PERCAGE",{x:tx,y:yb},{x:tx+W,y:yb});
  let xc=tx;
  for(let i=0;i<=cols.length;i++){
    dxfLigne(D,"TABLEAU_PERCAGE",{x:xc,y:ty},{x:xc,y:yb});
    if(i<cols.length)xc+=cols[i][1];
  }
  dxfTexte(D,"TABLEAU_PERCAGE","Millimètres, échelle 1:1, origine des fichiers Gerber et Excellon, vue de dessus.",
           {x:tx,y:yb-4},2,0,"g");
  return {octets:dxfOctets(D),D,trous};
}

/* ==========================================================================
   DXF d'une ou plusieurs feuilles du plan
   ========================================================================== */
/* Boîte d'un objet de feuille (traits, cercles). */
function dxfBoite(it){
  if(it.t==="c")return {x1:it.x-it.r,y1:it.y-it.r,x2:it.x+it.r,y2:it.y+it.r};
  let x1=Infinity,y1=Infinity,x2=-Infinity,y2=-Infinity;
  for(const pts of it.sp||[])for(const p of pts||[]){
    x1=Math.min(x1,p.x);y1=Math.min(y1,p.y);x2=Math.max(x2,p.x);y2=Math.max(y2,p.y);
  }
  return {x1,y1,x2,y2};
}
/* Calque d'un trait que rien n'a nommé : le cartouche et le cadre se
   reconnaissent à leur place sur la feuille. */
function dxfCalqueParPlace(F,it){
  const b=dxfBoite(it), e=0.05, Z=dfZone(F), C=Z.cart, m=DF_CADRE+DF_BANDE;
  if(b.x1>=C.x-e&&b.x2<=C.x+C.w+e&&b.y1>=C.y-e&&b.y2<=C.y+C.h+e)return "CARTOUCHE";
  if(b.x1<m+e||b.y1<m+e||b.x2>F.w-m-e||b.y2>F.h-m-e)return "CADRE";
  return "";
}
/* Écrit la feuille F dans D, décalée de `ox` mm (plusieurs feuilles côte à
   côte dans un même dessin). Y passe vers le haut. */
function dxfFeuille(D,F,ox){
  ox=ox||0;
  const P=p=>({x:ox+p.x,y:F.h-p.y});
  const pile=[];
  for(const it of F.items){
    if(it.t==="cal"){if(it.nom)pile.push(it.nom);else pile.pop();continue;}
    const nomme=pile.length?pile[pile.length-1]:"";
    if(it.t==="t"){
      if(it.cache)continue;           // le texte invisible sert la recherche du PDF
      const cal=DXF_CAT[it.cat]||nomme||"TEXTES";
      dxfTexte(D,cal,it.s,P(it),it.pt*DF_PT*DXF_CAPS,it.rot||0,it.ancre);
      continue;
    }
    const cal=nomme||dxfCalqueParPlace(F,it)||"DESSIN";
    if(it.t==="c"){
      if(it.trait==null&&it.plein==null)continue;
      dxfCercle(D,cal,P(it),it.r);
      continue;
    }
    if(it.t!=="p")continue;
    const lt=it.tirets?"DASHED":null;
    for(const pts0 of it.sp||[]){
      if(!pts0||pts0.length<2)continue;
      const pts=pts0.map(P);
      if(it.trait==null){
        /* un fond clair (rangée de tableau, cartouche) n'est pas un trait ;
           un aplat sombre (flèche, symbole) en est un */
        if(it.plein==null||(typeof it.plein==="number"?it.plein:Math.min(...it.plein))>=0.5)continue;
        if(pts.length<=4&&pts.length>=3)dxfSolide(D,cal,pts);
        else dxfPoly(D,cal,pts,true,lt);
        continue;
      }
      if(cal==="CONTOUR"&&it.ferme&&!lt)dxfContour(D,cal,pts);
      else if(it.plein!=null&&(typeof it.plein==="number"?it.plein:1)<0.5&&pts.length>=3&&pts.length<=4)
        dxfSolide(D,cal,pts);
      else dxfPoly(D,cal,pts,!!it.ferme,lt);
    }
  }
}
function dxfFeuilles(feuilles){
  const D=dxfNouveau();
  let ox=0;
  for(const F of feuilles){dxfFeuille(D,F,ox);ox+=F.w+20;}
  return {octets:dxfOctets(D),D};
}

/* ---------- archive et fenêtre ---------- */
/* Les DXF de fabrication.zip : la carte 1:1 toujours, le plan de
   fabrication s'il est coché dans les feuilles. */
function dxfFichiers(){
  const base=fabBase(), out=[{name:base+"-CARTE.dxf",data:dxfCarte().octets}];
  if(dfCfg().feuilles.fab){
    const fab=dfDocument().feuilles.filter(F=>F.genre==="fab");
    if(fab.length)out.push({name:base+"-PLAN-FABRICATION.dxf",data:dxfFeuilles(fab).octets});
  }
  return out;
}
function dxfExporterCarte(){
  const r=dxfCarte();
  dl(new Blob([r.octets],{type:"image/vnd.dxf"}),pcbFile("-CARTE.dxf","carte.dxf"));
  hint("DXF de la carte à l'échelle 1:1 : contour ("+(r.D.n.ARC?r.D.n.ARC+" arc(s), ":"")+
       "mm, origine des Gerber), "+r.trous+" trou(s), "+S.fps.length+" composant(s).");
  return r;
}
function dxfExporterFeuille(){
  const doc=DF.doc||dfDocument();
  const F=doc.feuilles[DF.page]||doc.feuilles[0];
  if(!F){hint("Aucune feuille choisie : rien à exporter.");return null;}
  const i=doc.feuilles.indexOf(F)+1;
  const r=dxfFeuilles([F]);
  dl(new Blob([r.octets],{type:"image/vnd.dxf"}),pcbFile("-PLAN-"+i+".dxf","plan-"+i+".dxf"));
  hint("Feuille "+i+" « "+F.titre+" » exportée en DXF, au format "+F.format+", en millimètres.");
  return r;
}
/* Appelé à la fin de dfRendreCadre() : les boutons DXF à côté du PDF, et
   l'option de fonte dans le volet des réglages. */
function dfxCadre(m){
  if(!m||!m.querySelector)return;
  const pdf=m.querySelector('[data-a="pdf"]');
  if(pdf&&pdf.insertAdjacentHTML&&!m.querySelector("[data-dxf]"))
    pdf.insertAdjacentHTML("afterend",
      '<button class="tb" type="button" data-dxf="carte" title="DXF de la carte seule, à l\'échelle 1:1 : contour (arcs compris), découpes, trous, encombrement et repères, cotes, tableau de perçage — pour la mécanique">⬇ DXF carte 1:1</button>'+
      '<button class="tb" type="button" data-dxf="feuille" title="DXF de la feuille affichée, entière, en millimètres">⬇ DXF feuille</button>');
  const fm=m.querySelector('select[data-cfg="format"]');
  if(fm&&fm.insertAdjacentHTML)
    fm.insertAdjacentHTML("afterend",'<div class="df-h">PDF</div><label class="df-case" title="Sous-ensemble de la fonte PlansSans (Liberation Sans) embarqué : même rendu dans tous les lecteurs, Ω, ≤, ≥ écrits tels quels, texte toujours cherchable et copiable — vaut aussi pour le Master Drawing de Fabrication .zip">'+
      '<input type="checkbox" data-dxf="fonte"'+(dfCfg().fonte?" checked":"")+'> Fonte embarquée</label>');
  if(m.dfxBranche)return;
  m.dfxBranche=true;
  m.addEventListener("click",e=>{
    const b=e.target&&e.target.closest&&e.target.closest("[data-dxf]");
    if(!b||b.tagName==="INPUT")return;
    if(b.dataset.dxf==="carte")dxfExporterCarte();
    else if(b.dataset.dxf==="feuille")dxfExporterFeuille();
  });
  m.addEventListener("change",e=>{
    const t=e.target;
    if(t&&t.dataset&&t.dataset.dxf==="fonte")dfRegler("fonte",!!t.checked);
  });
}

/* ==========================================================================
   Fonte embarquée : lecture d'une TrueType
   ========================================================================== */
const DFF_B64="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
function dffBase64(s){
  const t=new Int16Array(128).fill(-1);
  for(let i=0;i<64;i++)t[DFF_B64.charCodeAt(i)]=i;
  s=String(s).replace(/[^A-Za-z0-9+/]/g,"");
  const out=new Uint8Array(Math.floor(s.length*3/4));
  let o=0,acc=0,nb=0;
  for(let i=0;i<s.length;i++){
    acc=(acc<<6)|t[s.charCodeAt(i)];nb+=6;
    if(nb>=8){nb-=8;out[o++]=(acc>>nb)&255;}
  }
  return out.subarray(0,o);
}
/* Tables, métriques, cmap (formats 4 et 12) et décalages des glyphes. */
function dffLire(u8){
  const dv=new DataView(u8.buffer,u8.byteOffset,u8.byteLength);
  const tab={};
  const nt=dv.getUint16(4);
  for(let i=0;i<nt;i++){
    const p=12+16*i;
    tab[String.fromCharCode(u8[p],u8[p+1],u8[p+2],u8[p+3])]={off:dv.getUint32(p+8),len:dv.getUint32(p+12)};
  }
  for(const k of ["head","hhea","maxp","hmtx","loca","glyf","cmap"])
    if(!tab[k])throw new Error("fonte : table "+k+" absente");
  const H=tab.head.off, ng=dv.getUint16(tab.maxp.off+4);
  const longue=dv.getInt16(H+50)===1;
  const loca=[];
  for(let i=0;i<=ng;i++)loca.push(longue?dv.getUint32(tab.loca.off+4*i):2*dv.getUint16(tab.loca.off+2*i));
  const nh=dv.getUint16(tab.hhea.off+34), hm=[];
  for(let i=0;i<ng;i++){
    const k=Math.min(i,nh-1);
    hm.push([dv.getUint16(tab.hmtx.off+4*k),
             i<nh?dv.getInt16(tab.hmtx.off+4*i+2):dv.getInt16(tab.hmtx.off+4*nh+2*(i-nh))]);
  }
  const cmap=new Map(), C=tab.cmap.off;
  let f4=-1,f12=-1;
  for(let i=0;i<dv.getUint16(C+2);i++){
    const pid=dv.getUint16(C+4+8*i), eid=dv.getUint16(C+6+8*i), o=C+dv.getUint32(C+8+8*i);
    const fmt=dv.getUint16(o);
    if(pid===3&&eid===10&&fmt===12)f12=o;
    else if((pid===3&&eid===1||pid===0)&&fmt===4)f4=o;
  }
  if(f12>=0){
    for(let k=0;k<dv.getUint32(f12+12);k++){
      const a=dv.getUint32(f12+16+12*k), b=dv.getUint32(f12+20+12*k), g=dv.getUint32(f12+24+12*k);
      for(let c=a;c<=b&&c-a<0x10000;c++)cmap.set(c,g+c-a);
    }
  }else if(f4>=0){
    const seg=dv.getUint16(f4+6)/2, E=f4+14, St=E+2*seg+2, De=St+2*seg, Ro=De+2*seg;
    for(let i=0;i<seg;i++){
      const e=dv.getUint16(E+2*i), s=dv.getUint16(St+2*i), d=dv.getInt16(De+2*i), r=dv.getUint16(Ro+2*i);
      for(let c=s;c<=e&&c!==0xFFFF;c++){
        let g;
        if(!r)g=(c+d)&0xFFFF;
        else{g=dv.getUint16(Ro+2*i+r+2*(c-s));if(g)g=(g+d)&0xFFFF;}
        if(g)cmap.set(c,g);
      }
    }
  }else throw new Error("fonte : pas de cmap Unicode");
  const O=tab["OS/2"]?tab["OS/2"].off:-1;
  return {u8,dv,tab,ng,loca,hm,cmap,
    upm:dv.getUint16(H+18),
    bbox:[dv.getInt16(H+36),dv.getInt16(H+38),dv.getInt16(H+40),dv.getInt16(H+42)],
    asc:O>=0?dv.getInt16(O+68):dv.getInt16(tab.hhea.off+4),
    desc:O>=0?dv.getInt16(O+70):dv.getInt16(tab.hhea.off+6),
    caps:O>=0&&dv.getUint16(O)>=2?dv.getInt16(O+88):Math.round(dv.getUint16(H+18)*0.716),
    gras:O>=0?dv.getUint16(O+4)>=600:false};
}
/* Les octets du glyphe g, et les glyphes que ses composants appellent. */
function dffGlyphe(Fo,g){return Fo.u8.subarray(Fo.tab.glyf.off+Fo.loca[g],Fo.tab.glyf.off+Fo.loca[g+1]);}
function dffComposants(b){
  const out=[];
  if(b.length<10)return out;
  const dv=new DataView(b.buffer,b.byteOffset,b.byteLength);
  if(dv.getInt16(0)>=0)return out;
  let p=10;
  for(;;){
    const fl=dv.getUint16(p), gi=dv.getUint16(p+2);
    out.push({pos:p+2,gi,fl});
    p+=4+(fl&1?4:2)+(fl&8?2:(fl&0x40?4:(fl&0x80?8:0)));
    if(!(fl&0x20))return out;
  }
}
/* Le glyphe sans son code de hinting (la fonte du sous-ensemble n'a plus de
   fpgm ni de prep à lui donner), composants renumérotés, longueur exacte. */
function dffGlypheNu(Fo,g,remap){
  const b=dffGlyphe(Fo,g);
  if(!b.length)return new Uint8Array(0);
  const dv=new DataView(b.buffer,b.byteOffset,b.byteLength);
  const nc=dv.getInt16(0);
  if(nc>=0){
    const p=10+2*nc, il=dv.getUint16(p);
    let q=p+2+il;
    if(nc>0){
      const npts=dv.getUint16(10+2*(nc-1))+1, fl=[];
      while(fl.length<npts){
        const f=b[q++];let k=1;
        if(f&8)k+=b[q++];
        for(let j=0;j<k;j++)fl.push(f);
      }
      for(const f of fl)q+=f&2?1:(f&16?0:2);
      for(const f of fl)q+=f&4?1:(f&32?0:2);
    }
    const o=new Uint8Array(p+2+(q-p-2-il));
    o.set(b.subarray(0,p),0);
    o.set(b.subarray(p+2+il,q),p+2);
    return o;
  }
  const comps=dffComposants(b), last=comps[comps.length-1];
  const fin=last.pos-2+4+(last.fl&1?4:2)+(last.fl&8?2:(last.fl&0x40?4:(last.fl&0x80?8:0)));
  const o=b.slice(0,fin), ov=new DataView(o.buffer);
  for(const c of comps)ov.setUint16(c.pos,remap.get(c.gi));
  ov.setUint16(last.pos-2,last.fl&~0x100);
  return o;
}

/* ==========================================================================
   Fonte embarquée : écriture du sous-ensemble
   ========================================================================== */
function dffSomme(u8){
  let s=0;
  for(let i=0;i<u8.length;i+=4)
    s=(s+(((u8[i]<<24)|((u8[i+1]||0)<<16)|((u8[i+2]||0)<<8)|(u8[i+3]||0))>>>0))>>>0;
  return s;
}
/* Sous-table cmap de format 4 : paires [code, glyphe] triées, un segment par
   suite consécutive. */
function dffCmap4(paires){
  const segs=[];
  for(const [c,g] of paires){
    const s=segs[segs.length-1];
    if(s&&c===s.e+1&&g===s.g+(c-s.s))s.e=c;
    else segs.push({s:c,e:c,g});
  }
  segs.push({s:0xFFFF,e:0xFFFF,g:1});
  const n=segs.length;
  let e=1;while(e*2<=n)e*=2;
  const len=16+8*n, b=new Uint8Array(len), dv=new DataView(b.buffer);
  dv.setUint16(0,4);dv.setUint16(2,len);
  dv.setUint16(6,2*n);dv.setUint16(8,2*e);dv.setUint16(10,Math.log2(e));dv.setUint16(12,2*n-2*e);
  segs.forEach((s,i)=>{
    dv.setUint16(14+2*i,s.e);
    dv.setUint16(16+2*n+2*i,s.s);
    dv.setUint16(16+4*n+2*i,(s.g-s.s)&0xFFFF);
  });
  return b;
}
/* Sous-table de format 6 : un glyphe par code, du premier au dernier — les
   codes d'un octet d'une fonte simple. */
function dffCmap6(paires){
  const a=paires[0][0], n=paires[paires.length-1][0]-a+1;
  const b=new Uint8Array(10+2*n), dv=new DataView(b.buffer);
  dv.setUint16(0,6);dv.setUint16(2,b.length);dv.setUint16(6,a);dv.setUint16(8,n);
  for(const [c,g] of paires)dv.setUint16(10+2*(c-a),g);
  return b;
}
/* La table cmap : des sous-tables [plateforme, codage, octets], rangées par
   plateforme puis par codage. */
function dffCmap(sous){
  let taille=4+8*sous.length;
  for(const x of sous)taille+=x[2].length;
  const u=new Uint8Array(taille), dv=new DataView(u.buffer);
  dv.setUint16(2,sous.length);
  let off=4+8*sous.length;
  sous.forEach(([p,e,b],i)=>{
    dv.setUint16(4+8*i,p);dv.setUint16(6+8*i,e);dv.setUint32(8+8*i,off);
    u.set(b,off);off+=b.length;
  });
  return u;
}
/* Sous-ensemble de Fo réduit aux glyphes `garde` (Set d'anciens numéros) et
   à la carte `uni` (Map unicode → ancien glyphe). Rend les octets de la
   fonte et la renumérotation. `simple` (Master Drawing) : `uni` va alors
   d'un code d'un octet à l'ancien glyphe, et la cmap est celle d'une fonte
   symbolique — (1,0) code → glyphe, (3,0) 0xF000 + code → glyphe —, que le
   PDF lit sans /Encoding. */
function dffSousEnsemble(Fo,garde,uni,simple){
  const tous=new Set([0,...garde]);
  const pile=[...tous];
  while(pile.length)
    for(const c of dffComposants(dffGlyphe(Fo,pile.pop())))
      if(!tous.has(c.gi)){tous.add(c.gi);pile.push(c.gi);}
  const ordre=[...tous].sort((a,b)=>a-b), remap=new Map(ordre.map((g,i)=>[g,i])), n=ordre.length;
  const corps=ordre.map(g=>dffGlypheNu(Fo,g,remap));
  const loca=new Uint8Array(4*(n+1)), lv=new DataView(loca.buffer);
  let tg=0;
  corps.forEach((b,i)=>{lv.setUint32(4*i,tg);tg+=(b.length+3)&~3;});
  lv.setUint32(4*n,tg);
  const glyf=new Uint8Array(tg);
  corps.forEach((b,i)=>glyf.set(b,lv.getUint32(4*i)));
  const hmtx=new Uint8Array(4*n), hv=new DataView(hmtx.buffer);
  ordre.forEach((g,i)=>{hv.setUint16(4*i,Fo.hm[g][0]);hv.setInt16(4*i+2,Fo.hm[g][1]);});
  const copie=k=>Fo.u8.slice(Fo.tab[k].off,Fo.tab[k].off+Fo.tab[k].len);
  const head=copie("head"), hd=new DataView(head.buffer);
  hd.setUint32(8,0);hd.setInt16(50,1);
  const hhea=copie("hhea");new DataView(hhea.buffer).setUint16(34,n);
  const maxp=copie("maxp");new DataView(maxp.buffer).setUint16(4,n);
  const post=new Uint8Array(32);
  if(Fo.tab.post)post.set(Fo.u8.subarray(Fo.tab.post.off,Fo.tab.post.off+Math.min(32,Fo.tab.post.len)));
  new DataView(post.buffer).setUint32(0,0x00030000);
  const paires=[...uni].map(([c,g])=>[c,remap.get(g)]).filter(([c])=>c<0xFFFF).sort((a,b)=>a[0]-b[0]);
  const cmap=simple?dffCmap([[1,0,dffCmap6(paires)],[3,0,dffCmap4(paires.map(([c,g])=>[0xF000+c,g]))]])
                   :dffCmap([[3,1,dffCmap4(paires)]]);
  const T={head,hhea,maxp,hmtx,loca,glyf,post,cmap};
  if(Fo.tab["OS/2"])T["OS/2"]=copie("OS/2");
  if(Fo.tab.name)T.name=copie("name");
  /* assemblage : répertoire trié, tables alignées sur 4 octets */
  const tags=Object.keys(T).sort();
  let e=1;while(e*2<=tags.length)e*=2;
  let taille=12+16*tags.length;
  for(const k of tags)taille+=(T[k].length+3)&~3;
  const u=new Uint8Array(taille), dv=new DataView(u.buffer);
  dv.setUint32(0,0x00010000);dv.setUint16(4,tags.length);
  dv.setUint16(6,16*e);dv.setUint16(8,Math.log2(e));dv.setUint16(10,16*tags.length-16*e);
  let off=12+16*tags.length, oHead=0;
  tags.forEach((k,i)=>{
    const p=12+16*i;
    for(let j=0;j<4;j++)u[p+j]=k.charCodeAt(j);
    dv.setUint32(p+4,dffSomme(T[k]));dv.setUint32(p+8,off);dv.setUint32(p+12,T[k].length);
    u.set(T[k],off);
    if(k==="head")oHead=off;
    off+=(T[k].length+3)&~3;
  });
  dv.setUint32(oHead+8,(0xB1B0AFBA-dffSomme(u))>>>0);
  return {octets:u,remap,n};
}

/* ==========================================================================
   Fonte embarquée : le PDF
   ========================================================================== */
var DFF_CACHE={};
/* La fonte d'un style ("normal" ou "gras"), lue une fois ; null si le module
   js/fontes/plans-sans.js n'est pas chargé ou ne se lit pas. */
function dffFonte(style){
  if(style in DFF_CACHE)return DFF_CACHE[style];
  let Fo=null;
  try{
    if(typeof DF_FONTE_TTF!=="undefined"&&DF_FONTE_TTF&&DF_FONTE_TTF[style])
      Fo=dffLire(dffBase64(DF_FONTE_TTF[style]));
  }catch(_){Fo=null;}
  return (DFF_CACHE[style]=Fo);
}
/* Le texte en glyphes : [{g, u}] (glyphe de la fonte, texte qu'il porte pour
   /ToUnicode). Ce que la fonte n'a pas suit le chemin de dfWinAnsi : la
   substitution d'un technicien, la lettre sans son accent, puis « ? ». */
function dffGlyphes(Fo,s){
  const out=[];
  const un=(ch,prof)=>{
    const c=ch.codePointAt(0);
    if(c===9||c===10||c===13){un(" ",prof);return;}
    const g=Fo.cmap.get(c);
    if(g){out.push({g,u:ch});return;}
    const sub=DF_SUBST[ch];
    if(sub!=null&&prof<3){for(const x of sub)un(x,prof+1);return;}
    const d=ch.normalize("NFD").replace(/[̀-ͯ]/g,"");
    if(d&&d!==ch&&prof<3){for(const x of d)un(x,prof+1);return;}
    out.push({g:Fo.cmap.get(0x3F)||0,u:"?"});
  };
  for(const ch of String(s==null?"":s).normalize("NFC"))un(ch,0);
  return out;
}
function dffHex(v){return v.toString(16).toUpperCase().padStart(4,"0");}
function dffUtf16(s){let o="";for(let i=0;i<s.length;i++)o+=dffHex(s.charCodeAt(i));return o;}
/* Les glyphes qu'emploie une suite de textes ({s, gras}), par style : la
   fonte, la carte unicode → glyphe (`uni`) et glyphe → texte qu'il porte
   (`gl`). null si l'une des deux graisses manque : Helvetica alors. Partagé
   par les deux PDF, les plans et le Master Drawing. */
function dffStyles(textes){
  const styles={normal:null,gras:null};
  for(const st of ["normal","gras"]){
    const Fo=dffFonte(st);
    if(!Fo)return null;
    styles[st]={Fo,uni:new Map(),gl:new Map(),vu:false};
  }
  for(const it of textes){
    const E=styles[it.gras?"gras":"normal"];
    E.vu=true;
    for(const x of dffGlyphes(E.Fo,it.s)){
      if(!E.gl.has(x.g))E.gl.set(x.g,x.u);
      const c=x.u.codePointAt(0);
      if(!E.uni.has(c))E.uni.set(c,x.g);
    }
  }
  return styles;
}
/* L'étiquette de sous-ensemble (« ABCDEF+ ») : six capitales tirées d'une
   suite de nombres, les glyphes gardés. */
function dffEtiquette(v){
  let h=2166136261;
  for(const g of v){h^=g;h=Math.imul(h,16777619)>>>0;}
  let tag="";for(let i=0;i<6;i++){tag+=String.fromCharCode(65+h%26);h=Math.floor(h/26)+i*7919;}
  return tag;
}
/* La /ToUnicode : `bf` les couples « <code> <UTF-16BE> », `octets` la
   longueur d'un code (2 en Identity-H, 1 pour une fonte simple). */
function dffToUnicode(bf,octets){
  let cmap="/CIDInit /ProcSet findresource begin\n12 dict begin\nbegincmap\n"+
    "/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def\n"+
    "/CMapName /Adobe-Identity-UCS def\n/CMapType 2 def\n"+
    "1 begincodespacerange\n"+(octets===1?"<00> <FF>":"<0000> <FFFF>")+"\nendcodespacerange\n";
  for(let i=0;i<bf.length;i+=100){
    const lot=bf.slice(i,i+100);
    cmap+=lot.length+" beginbfchar\n"+lot.join("\n")+"\nendbfchar\n";
  }
  return cmap+"endcmap\nCMapName currentdict /CMap defineresource pop\nend\nend\n";
}
/* Le descripteur de la fonte du style `st`, son fichier en objet FF.
   `flags` : 32 (non symbolique) pour la CIDFont, 4 (symbolique) pour la
   fonte simple, dont la cmap dit seule quel glyphe porte quel code. */
function dffDescripteur(E,st,FF,flags){
  const Fo=E.Fo, k=1000/Fo.upm;
  return "<< /Type /FontDescriptor /FontName /"+E.nom+" /Flags "+flags+
    " /FontBBox ["+Fo.bbox.map(v=>Math.round(v*k)).join(" ")+"] /ItalicAngle 0"+
    " /Ascent "+Math.round(Fo.asc*k)+" /Descent "+Math.round(Fo.desc*k)+
    " /CapHeight "+Math.round(Fo.caps*k)+" /StemV "+(st==="gras"?120:80)+
    (st==="gras"?" /FontWeight 700":"")+" /FontFile2 "+FF+" 0 R >>";
}
function dffNom(st){return "PlansSans-"+(st==="gras"?"Bold":"Regular");}

/* Préparation, appelée par dfPdf() avant d'écrire : les glyphes de chaque
   style, le sous-ensemble, et de quoi coder le texte et écrire les objets.
   null quand l'option est décochée ou la fonte absente : Helvetica alors. */
function dfFontePreparer(feuilles){
  if(!dfCfg().fonte)return null;
  const textes=[];
  for(const F of feuilles)for(const it of F.items)if(it.t==="t")textes.push(it);
  const styles=dffStyles(textes);
  if(!styles)return null;
  for(const st in styles){
    const E=styles[st];
    if(!E.vu)continue;
    E.sub=dffSousEnsemble(E.Fo,new Set(E.gl.keys()),E.uni);
    E.nom=dffEtiquette([...E.gl.keys()].sort((a,b)=>a-b))+"+"+dffNom(st);
  }
  const FE={styles,
    chaine(s,gras){
      const E=styles[gras?"gras":"normal"];
      return "<"+dffGlyphes(E.Fo,s).map(x=>dffHex(E.sub.remap.get(x.g))).join("")+">";
    },
    largeur(s,pt,gras){
      const E=styles[gras?"gras":"normal"];
      let w=0;
      for(const x of dffGlyphes(E.Fo,s))w+=E.Fo.hm[x.g][0];
      return w/E.Fo.upm*pt*DF_PT;
    },
    /* Les objets : F1 (normal) et F2 (gras) deviennent des Type0 ; un style
       qu'aucun texte n'emploie garde son Helvetica. */
    ecrire(F1,F2,alloc,obj){
      [["normal",F1,"/Helvetica"],["gras",F2,"/Helvetica-Bold"]].forEach(([st,id,repli])=>{
        const E=styles[st];
        if(!E.vu){obj(id,"<< /Type /Font /Subtype /Type1 /BaseFont "+repli+" /Encoding /WinAnsiEncoding >>");return;}
        const Fo=E.Fo, k=1000/Fo.upm, sub=E.sub;
        const CID=alloc(), DESC=alloc(), FF=alloc(), TU=alloc();
        const larg=[];
        const inv=new Array(sub.n).fill(0);
        for(const [g,i] of sub.remap)inv[i]=g;
        for(let i=0;i<sub.n;i++)larg.push(Math.round(Fo.hm[inv[i]][0]*k));
        const bf=[];
        for(const [g,u] of E.gl)bf.push("<"+dffHex(sub.remap.get(g))+"> <"+dffUtf16(u)+">");
        const cmap=dffToUnicode(bf,2);
        obj(id,"<< /Type /Font /Subtype /Type0 /BaseFont /"+E.nom+" /Encoding /Identity-H"+
            " /DescendantFonts ["+CID+" 0 R] /ToUnicode "+TU+" 0 R >>");
        obj(CID,"<< /Type /Font /Subtype /CIDFontType2 /BaseFont /"+E.nom+
            " /CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >>"+
            " /FontDescriptor "+DESC+" 0 R /CIDToGIDMap /Identity /DW "+(larg[0]||0)+
            " /W [0 ["+larg.join(" ")+"]] >>");
        obj(DESC,dffDescripteur(E,st,FF,32));
        obj(FF,"<< /Length "+sub.octets.length+" /Length1 "+sub.octets.length+" >>",sub.octets);
        obj(TU,"<< /Length "+cmap.length+" >>",cmap);
      });
    }};
  return FE;
}

/* ==========================================================================
   Fonte embarquée : la fonte simple du Master Drawing
   ========================================================================== */
/* Le Master Drawing (04-pdf-masterdraw.js) emporte la même fonte, mais en
   TrueType SIMPLE, un octet par caractère : l'ASCII y garde son propre code,
   si bien que le contenu des pages se lit encore en clair — « SHEET: 1 / 3 »,
   « REV: B », les noms de fichiers annoncés — par un grep, un diff entre deux
   révisions, ou le fabricant qui ouvre le fichier dans un éditeur. Le reste
   (é, Ω, µ, ±, °, ≤, ≥, —…) prend les codes libres, de 0x80 à 0xFF puis de
   0x01 à 0x1F : 159 caractères hors ASCII par graisse, bien plus qu'un
   Master Drawing n'en écrit. Au-delà, « ? ». La fonte est déclarée
   symbolique, sans /Encoding : sa cmap (1,0) et (3,0) dit quel glyphe porte
   quel code, et la /ToUnicode quel caractère — le texte se cherche et se
   copie, accents et symboles compris. `textes` : les {s, gras} du
   document. null si la fonte ne se charge pas. */
function dffPreparerSimple(textes){
  const styles=dffStyles(textes);
  if(!styles)return null;
  for(const st in styles){
    const E=styles[st];
    if(!E.vu)continue;
    const ascii=new Map(), libres=[];
    for(let c=0x20;c<0x7F;c++){const g=E.Fo.cmap.get(c);if(g&&!ascii.has(g))ascii.set(g,c);}
    for(let c=0x80;c<=0xFF;c++)libres.push(c);
    for(let c=0x01;c<0x20;c++)libres.push(c);
    E.code=new Map();E.carte=new Map();          // glyphe → code, code → glyphe
    let deborde=false;
    for(const g of E.gl.keys()){
      const c=ascii.has(g)?ascii.get(g):libres.shift();
      if(c==null){deborde=true;continue;}
      E.code.set(g,c);E.carte.set(c,g);
    }
    const q=E.Fo.cmap.get(0x3F)||0;
    if(deborde&&!E.code.has(q)){E.code.set(q,0x3F);E.carte.set(0x3F,q);}
    const paires=[...E.carte].sort((a,b)=>a[0]-b[0]);
    E.sub=dffSousEnsemble(E.Fo,new Set(E.code.keys()),E.carte,true);
    E.nom=dffEtiquette([].concat(...paires))+"+"+dffNom(st);
  }
  const codes=(E,s)=>dffGlyphes(E.Fo,s).map(x=>E.code.has(x.g)?E.code.get(x.g):0x3F);
  return {styles,
    /* le littéral PDF : (, ) et \ échappés, le reste hors ASCII en octal */
    chaine(s,gras){
      let o="(";
      for(const c of codes(styles[gras?"gras":"normal"],s)){
        if(c===0x28||c===0x29||c===0x5C)o+="\\"+String.fromCharCode(c);
        else if(c<0x20||c>0x7E)o+="\\"+c.toString(8).padStart(3,"0");
        else o+=String.fromCharCode(c);
      }
      return o+")";
    },
    /* largeur en mm du texte en corps `pt` */
    largeur(s,pt,gras){
      const E=styles[gras?"gras":"normal"];
      let w=0;
      for(const c of codes(E,s))w+=E.Fo.hm[E.carte.get(c)][0];
      return w/E.Fo.upm*pt*DF_PT;
    },
    /* Les objets : la fonte d'id `F1` (normale) et `F2` (grasse), puis
       descripteur, fichier et /ToUnicode, numérotés par `alloc`. Un style
       qu'aucun texte n'emploie garde son Helvetica. */
    ecrire(F1,F2,alloc,obj){
      [["normal",F1,"/Helvetica"],["gras",F2,"/Helvetica-Bold"]].forEach(([st,id,repli])=>{
        const E=styles[st];
        if(!E.vu){obj(id,"<< /Type /Font /Subtype /Type1 /BaseFont "+repli+" /Encoding /WinAnsiEncoding >>");return;}
        const Fo=E.Fo, k=1000/Fo.upm, sub=E.sub;
        const DESC=alloc(), FF=alloc(), TU=alloc();
        const cs=[...E.carte.keys()].sort((a,b)=>a-b), c0=cs[0], c1=cs[cs.length-1];
        const larg=[];
        for(let c=c0;c<=c1;c++){const g=E.carte.get(c);larg.push(g==null?0:Math.round(Fo.hm[g][0]*k));}
        const bf=cs.map(c=>"<"+c.toString(16).toUpperCase().padStart(2,"0")+"> <"+
                            dffUtf16(E.gl.get(E.carte.get(c))||"?")+">");
        const cmap=dffToUnicode(bf,1);
        obj(id,"<< /Type /Font /Subtype /TrueType /BaseFont /"+E.nom+
            " /FirstChar "+c0+" /LastChar "+c1+" /Widths ["+larg.join(" ")+"]"+
            " /FontDescriptor "+DESC+" 0 R /ToUnicode "+TU+" 0 R >>");
        obj(DESC,dffDescripteur(E,st,FF,4));
        obj(FF,"<< /Length "+sub.octets.length+" /Length1 "+sub.octets.length+" >>",sub.octets);
        obj(TU,"<< /Length "+cmap.length+" >>",cmap);
      });
    }};
}
