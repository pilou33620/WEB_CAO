"use strict";
/* ==========================================================================
   Export STEP — commun à l'éditeur PCB et à la visionneuse IPC-2581
   --------------------------------------------------------------------------
   La carte en 3D pour la mécanique, au format STEP (ISO 10303-21, AP214),
   en millimètres, dans le repère des Gerber (Y vers le haut), Z = 0 sur la
   face dessus. Un ASSEMBLAGE : une pièce par élément, nommée, que le
   modeleur masque ou déplace à part :

     <base>-CARTE          le substrat à l'épaisseur de l'empilage, contour,
                           découpes et trous exacts (droites, arcs, cylindres :
                           un trou de fixation reste un cylindre qu'on cote) ;
     CUIVRE_DESSUS/DESSOUS pistes, pastilles, vias et zones, 35 µm, facettés ;
     SERIGRAPHIE_…         les traits de sérigraphie, 15 µm sur le cuivre ;
     R1, U3…               chaque composant : le modèle STEP de la LIB
                           (« Modèle 3D », posé par « Position 3D »), recopié
                           tel quel une fois et placé autant de fois qu'il
                           sert ; sans modèle, son corps extrudé à sa hauteur.

   L'entrée est la SCÈNE de l'animation 3D (anim3dDonnees, 41-animation-3d.js) :
   la visionneuse en fabrique une de même forme. Rien ici ne lit `S` ni le DOM,
   sauf la fenêtre des cases (stepFenetre) et le chargement des modèles.

   Aussi ici, parce que les deux outils s'en servent : les arcs retrouvés dans
   un contour facetté (ctrSegments : Gerber, IPC-2581, STEP) et la pose d'un
   modèle de la LIB sur son empreinte (anim3dPose).
   ========================================================================== */

/* ==========================================================================
   Contour : segments et arcs retrouvés
   ========================================================================== */
function ctrCercle3(a,b,c){
  const d=2*(a.x*(b.y-c.y)+b.x*(c.y-a.y)+c.x*(a.y-b.y));
  if(Math.abs(d)<1e-12)return null;
  const A=a.x*a.x+a.y*a.y, B=b.x*b.x+b.y*b.y, C=c.x*c.x+c.y*c.y;
  const x=(A*(b.y-c.y)+B*(c.y-a.y)+C*(a.y-b.y))/d, y=(A*(c.x-b.x)+B*(a.x-c.x)+C*(b.x-a.x))/d;
  return {x,y,r:Math.hypot(a.x-x,a.y-y)};
}
const CTR_ARC_PAS=Math.PI/6;     // au plus 30° par corde : un octogone reste un octogone
/* Les sommets P[i0], P[i0+1]… P[i0+k] (indices pris modulo n) sont-ils les
   cordes d'un même arc ? Cordes égales, tournant toutes du même côté, de 30°
   au plus, sommets sur le cercle à quelques microns près. Rend le cercle,
   qui passe EXACTEMENT par le premier et le dernier sommet, et le sens. */
function ctrAjuste(P,i0,k,C0){
  const n=P.length, Q=j=>P[(i0+j)%n];
  if(k<3)return null;
  const C=C0||ctrCercle3(Q(0),Q(k>>1),Q(k));
  if(!C||C.r>5000)return null;
  const tol=0.004+C.r*2e-4;
  let lmin=Infinity, lmax=0, sens=0;
  for(let j=0;j<=k;j++){
    const p=Q(j);
    if(Math.abs(Math.hypot(p.x-C.x,p.y-C.y)-C.r)>tol)return null;
    if(j<k){
      const q=Q(j+1), l=Math.hypot(q.x-p.x,q.y-p.y);
      lmin=Math.min(lmin,l);lmax=Math.max(lmax,l);
      if(l>2*C.r*Math.sin(CTR_ARC_PAS/2)+tol)return null;
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
   {t:"l",a,b} ou {t:"a",c,r,a1,a2} (degrés, sens trigonométrique). Un arc
   garde aussi le sens du parcours : de `de` à `vers`, `ccw` s'il tourne en
   sens trigonométrique. */
function ctrSegments(P0){
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
  const arc=(C,sens,a,b)=>Object.assign(
    sens>0?{t:"a",c:{x:C.x,y:C.y},r:C.r,a1:deg(C,a),a2:deg(C,b)}
          :{t:"a",c:{x:C.x,y:C.y},r:C.r,a1:deg(C,b),a2:deg(C,a)},
    {de:a,vers:b,ccw:sens>0});
  /* une carte ronde : tout le contour sur un cercle — deux demi-arcs, sur
     le cercle qui passe exactement par leurs extrémités */
  if(n>=8){
    const h=n>>1, C=ctrCercle3(P[0],P[h>>1],P[h]);
    const tout=C&&ctrAjuste(P,0,n,C);
    if(tout)return [arc(C,tout.sens,P[0],P[h]),arc(C,tout.sens,P[h],P[0])];
  }
  /* partir d'un vrai coin : un sommet qu'aucun arc ne traverse */
  let dep=0;
  for(let i=0;i<n;i++)if(!ctrAjuste(P,(i-1+n)%n,3)&&!ctrAjuste(P,(i-2+n)%n,3)){dep=i;break;}
  let fait=0, i=dep;
  while(fait<n){
    let k=0, best=null;
    for(let kk=3;kk<=n-fait;kk++){
      const A=ctrAjuste(P,i,kk);
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

/* ==========================================================================
   Les modèles 3D de la LIB : leur pose sur l'empreinte
   --------------------------------------------------------------------------
   « Position 3D » le pose sur l'empreinte : « haut=Y+ rot=90 x=0.1 y=0 z=0.4 »,
   dans le repère de l'empreinte, Y vers le haut (python/maillages_3d.mjs).
   ========================================================================== */
/* l'axe du modèle qui monte : lignes de la matrice qui le couche dans le repère de l'empreinte */
const ANIM3D_HAUTS={"Z+":[1,0,0,0,1,0,0,0,1],"Z-":[1,0,0,0,-1,0,0,0,-1],"Y+":[1,0,0,0,0,-1,0,1,0],
                    "Y-":[1,0,0,0,0,1,0,-1,0],"X+":[0,1,0,0,0,1,1,0,0],"X-":[0,1,0,0,0,-1,-1,0,0]};
function anim3dPosition(s){
  const o={};
  for(const m of String(s||"").matchAll(/(haut|rot|x|y|z)\s*=\s*([^\s;]+)/gi))o[m[1].toLowerCase()]=m[2];
  if(!ANIM3D_HAUTS[o.haut])return null;
  const n=k=>Number.isFinite(+o[k])?+o[k]:0;
  return {haut:o.haut,rot:n("rot"),x:n("x"),y:n("y"),z:n("z")};
}
/* Matrice 4×4 (colonnes, comme Matrix4.fromArray) du maillage d'unité `u` vers
   la carte, face dessus en z = 0 : pose sur l'empreinte, puis l'empreinte à sa
   place (rotation inverse en Y vers le haut, retournée autour de Y dessous). */
function anim3dPose(m,face,u){
  const p=anim3dPosition(m.pos);
  if(!p)return null;
  const mul=(A,B)=>{const C=[];for(let i=0;i<3;i++)for(let j=0;j<4;j++)
    C.push(A[4*i]*B[j]+A[4*i+1]*B[4+j]+A[4*i+2]*B[8+j]+(j===3?A[4*i+3]:0));return C;};
  const rz=(deg,tx,ty,tz)=>{const a=deg*Math.PI/180,c=Math.round(Math.cos(a)*1e12)/1e12,s=Math.round(Math.sin(a)*1e12)/1e12;
    return [c,-s,0,tx, s,c,0,ty, 0,0,1,tz];};
  const H=ANIM3D_HAUTS[p.haut], U=[H[0]*u,H[1]*u,H[2]*u,0, H[3]*u,H[4]*u,H[5]*u,0, H[6]*u,H[7]*u,H[8]*u,0];
  const F=face?[-1,0,0,0, 0,1,0,0, 0,0,-1,0]:[1,0,0,0, 0,1,0,0, 0,0,1,0];
  const M=mul(rz(-(m.rot||0),m.x,m.y,0),mul(F,mul(rz(p.rot,p.x,p.y,p.z),U)));
  return [M[0],M[4],M[8],0, M[1],M[5],M[9],0, M[2],M[6],M[10],0, M[3],M[7],M[11],1];
}

/* ==========================================================================
   STEP : écriture
   ========================================================================== */
const STEP_CU=0.035, STEP_SERI=0.015;       // mm : cuivre, et sérigraphie posée dessus
/* Un réel STEP porte toujours son point (« 1. », jamais « 1 »). */
function stepR(v){
  const s=String(Math.round(v*1e6)/1e6||0);
  return /[.e]/.test(s)?s.replace("e","E"):s+".";
}
/* Une chaîne STEP : apostrophe et barre doublées, le reste de l'ASCII en \X2\. */
function stepTexte(s){
  let o="";
  for(const ch of String(s==null?"":s)){
    const c=ch.codePointAt(0);
    if(ch==="'")o+="''";
    else if(ch==="\\")o+="\\\\";
    else if(c>=32&&c<127)o+=ch;
    else o+=c<0x10000?"\\X2\\"+c.toString(16).toUpperCase().padStart(4,"0")+"\\X0\\":"?";
  }
  return "'"+o+"'";
}
function stepNouveau(){
  const W={n:0,l:[],styles:{},styled:[]};
  W.e=t=>{W.l.push("#"+(++W.n)+"="+t+";");return "#"+W.n;};
  const v=a=>"("+a.map(stepR).join(",")+")";
  W.pt=a=>W.e("CARTESIAN_POINT('',"+v(a)+")");
  const dirs={};      // une direction écrite une fois, partagée : le fichier en est plus léger
  W.dir=a=>{const k=v(a);return dirs[k]||(dirs[k]=W.e("DIRECTION('',"+k+")"));};
  W.ax=(o,z,x)=>W.e("AXIS2_PLACEMENT_3D('',"+W.pt(o)+","+W.dir(z||[0,0,1])+","+W.dir(x||[1,0,0])+")");
  /* le contexte commun : AP214, millimètres, tolérance de 0,1 µm */
  const app=W.e("APPLICATION_CONTEXT('automotive_design')");
  W.e("APPLICATION_PROTOCOL_DEFINITION('international standard','automotive_design',2000,"+app+")");
  W.pc=W.e("PRODUCT_CONTEXT(''," +app+",'mechanical')");
  W.pdc=W.e("PRODUCT_DEFINITION_CONTEXT('part definition',"+app+",'design')");
  const mm=W.e("(LENGTH_UNIT()NAMED_UNIT(*)SI_UNIT(.MILLI.,.METRE.))");
  const rad=W.e("(NAMED_UNIT(*)PLANE_ANGLE_UNIT()SI_UNIT($,.RADIAN.))");
  const sr=W.e("(NAMED_UNIT(*)SI_UNIT($,.STERADIAN.)SOLID_ANGLE_UNIT())");
  const inc=W.e("UNCERTAINTY_MEASURE_WITH_UNIT(LENGTH_MEASURE(1.E-07),"+mm+",'distance_accuracy_value','confusion accuracy')");
  W.geo=W.e("(GEOMETRIC_REPRESENTATION_CONTEXT(3)GLOBAL_UNCERTAINTY_ASSIGNED_CONTEXT(("+inc+"))"+
            "GLOBAL_UNIT_ASSIGNED_CONTEXT(("+mm+","+rad+","+sr+"))REPRESENTATION_CONTEXT('3D','mm'))");
  return W;
}
/* Une couleur de surface, une fois par teinte, posée sur un solide. */
function stepTeinte(W,solide,rgb){
  const k=rgb.join();
  if(!W.styles[k]){
    const c=W.e("COLOUR_RGB(''," +rgb.map(stepR).join(",")+")");
    const f=W.e("FILL_AREA_STYLE('',("+W.e("FILL_AREA_STYLE_COLOUR('',"+c+")")+"))");
    const s=W.e("SURFACE_SIDE_STYLE('',("+W.e("SURFACE_STYLE_FILL_AREA("+f+")")+"))");
    W.styles[k]=W.e("PRESENTATION_STYLE_ASSIGNMENT(("+W.e("SURFACE_STYLE_USAGE(.BOTH.,"+s+")")+"))");
  }
  W.styled.push(W.e("STYLED_ITEM('',("+W.styles[k]+"),"+solide+")"));
}

/* ---------- géométrie ----------
   Une BOUCLE est une suite d'éléments {x, y, arc} : l'élément k va de son
   point au point suivant, en droite (arc null) ou en arc {c, r, ccw}. */
function stepPropre(P){                     // sommets dédoublonnés, boucle ouverte
  const o=[];
  for(const p of P){const q=o[o.length-1];if(!q||Math.hypot(p.x-q.x,p.y-q.y)>1e-6)o.push({x:p.x,y:p.y});}
  while(o.length>2&&Math.hypot(o[0].x-o[o.length-1].x,o[0].y-o[o.length-1].y)<=1e-6)o.pop();
  return o;
}
/* `arcs` : retrouver les arcs du contour (carte, découpes) ; sinon des droites */
function stepBoucle(P,arcs){
  if(!arcs)return stepPropre(P).map(p=>({x:p.x,y:p.y,arc:null}));
  return ctrSegments(P).map(s=>s.t==="l"?{x:s.a.x,y:s.a.y,arc:null}
                                        :{x:s.de.x,y:s.de.y,arc:{c:s.c,r:s.r,ccw:s.ccw}});
}
function stepCercle(x,y,r){
  const c={x,y};
  return [{x:x+r,y,arc:{c,r,ccw:true}},{x:x-r,y,arc:{c,r,ccw:true}}];
}
function stepMilieu(e,q){
  const A=e.arc, a=Math.atan2(e.y-A.c.y,e.x-A.c.x), b=Math.atan2(q.y-A.c.y,q.x-A.c.x);
  const d=(((A.ccw?b-a:a-b)%(2*Math.PI))+2*Math.PI)%(2*Math.PI)||2*Math.PI, m=a+(A.ccw?d:-d)/2;
  return {x:A.c.x+A.r*Math.cos(m),y:A.c.y+A.r*Math.sin(m)};
}
/* aire signée (sens trigonométrique > 0), le milieu de chaque arc compris */
function stepAire(b){
  const P=[];
  b.forEach((e,k)=>{P.push(e);if(e.arc)P.push(stepMilieu(e,b[(k+1)%b.length]));});
  let s=0;
  for(let i=0;i<P.length;i++){const a=P[i],c=P[(i+1)%P.length];s+=a.x*c.y-c.x*a.y;}
  return s/2;
}
/* le centre du trou `t` dans la boucle (ses sommets et le milieu de ses arcs) */
function stepDedans(t,b){
  const P=[];
  b.forEach((e,k)=>{P.push(e);if(e.arc)P.push(stepMilieu(e,b[(k+1)%b.length]));});
  let d=false;
  for(let i=0,j=P.length-1;i<P.length;j=i++)
    if((P[i].y>t[1])!==(P[j].y>t[1])&&t[0]<(P[j].x-P[i].x)*(t[1]-P[i].y)/(P[j].y-P[i].y)+P[i].x)d=!d;
  return d;
}
function stepInverser(b){
  const n=b.length, o=[];
  for(let k=n-1;k>=0;k--){
    const e=b[k], q=b[(k+1)%n];
    o.push({x:q.x,y:q.y,arc:e.arc&&{c:e.arc.c,r:e.arc.r,ccw:!e.arc.ccw}});
  }
  return o;
}
/* Un trou qui coupe une boucle (demi-trou en bord de carte, trou à cheval
   sur une découpe) : la boucle le contourne par un arc. `b` a la matière à
   gauche (bord en sens trigonométrique, découpe en sens horaire). Le cercle
   peut couper des droites comme des arcs du bord. Rend la boucle entaillée ;
   "coupe" si le cercle la coupe autrement qu'en deux points (on ne sait pas
   l'entailler) ; null s'il ne la coupe pas. */
function stepEntaille(b,t){
  const c={x:t[0],y:t[1]}, r=t[2]/2, n=b.length, X=[], T=2*Math.PI;
  /* un arc du bord : angle de départ, balayage et sens, pour aller d'un point à son paramètre u ∈ ]0, 1] */
  const balaie=k=>{
    const e=b[k], q=b[(k+1)%n], A=e.arc, a0=Math.atan2(e.y-A.c.y,e.x-A.c.x), a1=Math.atan2(q.y-A.c.y,q.x-A.c.x);
    const s=A.ccw?1:-1;
    return {a0,s,d:((s*(a1-a0))%T+T)%T||T};
  };
  const point=(k,u)=>{
    const e=b[k];
    if(!e.arc){const q=b[(k+1)%n];return {x:e.x+u*(q.x-e.x),y:e.y+u*(q.y-e.y)};}
    const B=balaie(k), a=B.a0+B.s*u*B.d;
    return {x:e.arc.c.x+e.arc.r*Math.cos(a),y:e.arc.c.y+e.arc.r*Math.sin(a)};
  };
  for(let k=0;k<n;k++){
    const e=b[k], q=b[(k+1)%n];
    if(e.arc){
      const A=e.arc, dx=c.x-A.c.x, dy=c.y-A.c.y, d=Math.hypot(dx,dy);
      if(!(d<A.r+r&&d>Math.abs(A.r-r)))continue;
      const a=(A.r*A.r-r*r+d*d)/(2*d), h=Math.sqrt(Math.max(0,A.r*A.r-a*a));
      const mx=A.c.x+a*dx/d, my=A.c.y+a*dy/d, B=balaie(k);
      for(const sg of [-1,1]){
        const x=mx-sg*h*dy/d, y=my+sg*h*dx/d;
        const u=((B.s*(Math.atan2(y-A.c.y,x-A.c.x)-B.a0))%T+T)%T/B.d;
        if(u>1e-9&&u<=1+1e-9)X.push({k,u,x,y});
      }
      continue;
    }
    const dx=q.x-e.x, dy=q.y-e.y, A=dx*dx+dy*dy, B=2*(dx*(e.x-c.x)+dy*(e.y-c.y));
    const D=B*B-4*A*((e.x-c.x)**2+(e.y-c.y)**2-r*r);
    if(D<=0||!A)continue;
    for(const u of [(-B-Math.sqrt(D))/(2*A),(-B+Math.sqrt(D))/(2*A)])
      if(u>1e-9&&u<=1+1e-9)X.push({k,u,x:e.x+u*dx,y:e.y+u*dy});
  }
  if(!X.length)return null;
  if(X.length!==2)return "coupe";
  X.sort((a,b)=>a.k-b.k||a.u-b.u);
  /* l'entrée E : là où la boucle passe dans le cercle (un point du bord juste après X0) ; la sortie S */
  const m=point(X[0].k,(X[0].u+(X[1].k===X[0].k?X[1].u:1))/2);
  const [E,S]=Math.hypot(m.x-c.x,m.y-c.y)<r?X:[X[1],X[0]];
  if(E.k===S.k&&S.u<E.u)return "coupe";                       // presque toute la boucle dans le trou
  const o=[{x:S.x,y:S.y,arc:b[S.k].arc}];                     // le reste de l'élément coupé, droite ou arc
  for(let j=(S.k+1)%n;;j=(j+1)%n){o.push(b[j]);if(j===E.k)break;}
  o.push({x:E.x,y:E.y,arc:{c,r,ccw:false}});                  // le trou pris en sens horaire : la matière à gauche
  return o.filter((e,i)=>{const q=o[(i+1)%o.length];return Math.hypot(q.x-e.x,q.y-e.y)>1e-6;});
}
function stepArete(W,a,b,v1,v2){
  const d=[b[0]-a[0],b[1]-a[1],b[2]-a[2]], L=Math.hypot(d[0],d[1],d[2]);
  const ln=W.e("LINE('',"+W.pt(a)+","+W.e("VECTOR('',"+W.dir(d.map(x=>x/L))+","+stepR(L)+")")+")");
  return W.e("EDGE_CURVE('',"+v1+","+v2+","+ln+",.T.)");
}
/* Le prisme droit de z0 à z1 : la première boucle est le bord, les autres
   des trous. Faces planes, et cylindriques sous un arc. Rend le solide, ou
   null si le bord est dégénéré. */
function stepPrisme(W,boucles,z0,z1){
  const B=[];
  for(let i=0;i<boucles.length;i++){
    let b=boucles[i];
    const a=b.length>=2?stepAire(b):0;
    if(Math.abs(a)<1e-9){if(!i)return null;continue;}
    if((a>0)!==(i===0))b=stepInverser(b);      // bord en sens trigonométrique, trous à l'envers
    B.push(b);
  }
  const haut=[], bas=[], cotes=[];
  const oe=(E,s)=>W.e("ORIENTED_EDGE('',*,*,"+E+","+(s?".T.":".F.")+")");
  const boucle=L=>W.e("EDGE_LOOP('',("+L.join(",")+"))");
  for(const b of B){
    const n=b.length, s=k=>(k+1)%n;
    const vb=b.map(e=>W.e("VERTEX_POINT('',"+W.pt([e.x,e.y,z0])+")"));
    const vt=b.map(e=>W.e("VERTEX_POINT('',"+W.pt([e.x,e.y,z1])+")"));
    const arete=(k,z,V)=>{
      const e=b[k], q=b[s(k)];
      if(!e.arc)return stepArete(W,[e.x,e.y,z],[q.x,q.y,z],V[k],V[s(k)]);
      const c=W.e("CIRCLE('',"+W.ax([e.arc.c.x,e.arc.c.y,z])+","+stepR(e.arc.r)+")");
      return W.e("EDGE_CURVE('',"+V[k]+","+V[s(k)]+","+c+","+(e.arc.ccw?".T.":".F.")+")");
    };
    const eb=b.map((_,k)=>arete(k,z0,vb)), et=b.map((_,k)=>arete(k,z1,vt));
    const ev=b.map((e,k)=>stepArete(W,[e.x,e.y,z0],[e.x,e.y,z1],vb[k],vt[k]));
    haut.push(boucle(et.map(E=>oe(E,1))));
    bas.push(boucle(eb.slice().reverse().map(E=>oe(E,0))));
    for(let k=0;k<n;k++){
      const e=b[k], q=b[s(k)];
      let surf, sens=".T.";
      if(e.arc){
        surf=W.e("CYLINDRICAL_SURFACE('',"+W.ax([e.arc.c.x,e.arc.c.y,z0])+","+stepR(e.arc.r)+")");
        if(!e.arc.ccw)sens=".F.";                // la matière hors du cylindre (trou, creux)
      }else{
        const dx=q.x-e.x, dy=q.y-e.y, L=Math.hypot(dx,dy);
        surf=W.e("PLANE('',"+W.ax([e.x,e.y,z0],[dy/L,-dx/L,0],[dx/L,dy/L,0])+")");
      }
      const lp=boucle([oe(eb[k],1),oe(ev[s(k)],1),oe(et[k],0),oe(ev[k],0)]);
      cotes.push(W.e("ADVANCED_FACE('',("+W.e("FACE_OUTER_BOUND('',"+lp+",.T.)")+"),"+surf+","+sens+")"));
    }
  }
  const plat=(L,z,nz)=>W.e("ADVANCED_FACE('',("+
    L.map((l,i)=>W.e((i?"FACE_BOUND":"FACE_OUTER_BOUND")+"('',"+l+",.T.)")).join(",")+"),"+
    W.e("PLANE('',"+W.ax([0,0,z],[0,0,nz])+")")+",.T.)");
  const faces=[plat(haut,z1,1),plat(bas,z0,-1)].concat(cotes);
  return W.e("MANIFOLD_SOLID_BREP('',"+W.e("CLOSED_SHELL('',("+faces.join(",")+"))")+")");
}
/* La boucle d'un trait de largeur w, bouts ronds : deux droites et deux
   vrais arcs (4 faces de côté au lieu de 20 facettes) ; un point, un cercle */
function stepTrait(a,b,w){
  const r=w/2, L=Math.hypot(b.x-a.x,b.y-a.y);
  if(L<1e-6)return stepCercle(a.x,a.y,r);
  const nx=-(b.y-a.y)/L*r, ny=(b.x-a.x)/L*r;
  return [{x:a.x-nx,y:a.y-ny,arc:null},{x:b.x-nx,y:b.y-ny,arc:{c:{x:b.x,y:b.y},r,ccw:true}},
          {x:b.x+nx,y:b.y+ny,arc:null},{x:a.x+nx,y:a.y+ny,arc:{c:{x:a.x,y:a.y},r,ccw:true}}];
}

/* ---------- produits et assemblage ---------- */
function stepProduit(W,nom,rep){
  const t=stepTexte(nom), p=W.e("PRODUCT("+t+","+t+",'',("+W.pc+"))");
  W.e("PRODUCT_RELATED_PRODUCT_CATEGORY('part',$,("+p+"))");
  const pd=W.e("PRODUCT_DEFINITION('design','',"+W.e("PRODUCT_DEFINITION_FORMATION('',''," +p+")")+","+W.pdc+")");
  W.e("SHAPE_DEFINITION_REPRESENTATION("+W.e("PRODUCT_DEFINITION_SHAPE('',''," +pd+")")+","+rep+")");
  return pd;
}
/* Une pièce faite ici : ses solides, à l'origine. */
function stepPiece(W,nom,solides){
  const ax0=W.ax([0,0,0]);
  const rep=W.e("ADVANCED_BREP_SHAPE_REPRESENTATION("+stepTexte(nom)+",("+[ax0].concat(solides).join(",")+"),"+W.geo+")");
  return {pd:stepProduit(W,nom,rep),rep,ax0};
}
/* Un fichier STEP de la LIB recopié dans celui-ci : ses entités renumérotées
   (après les nôtres), son produit racine — celui qu'aucun assemblage ne
   contient — et la représentation de sa forme. null s'il ne se lit pas. */
/* Les instructions « #n=… » de la section DATA, numéros décalés de `off`,
   commentaires et fins de ligne ôtés (hors des chaînes). null sans DATA. */
function stepInstructions(texte,off){
  const m=/\bDATA\s*;/.exec(texte);
  if(!m)return null;
  const s=texte.slice(m.index+m[0].length), ents=[];
  let cur="", dansTexte=false, max=0;
  for(let i=0;i<s.length;i++){
    const ch=s[i];
    if(dansTexte){
      cur+=ch;
      if(ch==="'"){if(s[i+1]==="'"){cur+="'";i++;}else dansTexte=false;}
      continue;
    }
    if(ch==="'"){dansTexte=true;cur+=ch;continue;}
    if(ch==="/"&&s[i+1]==="*"){const j=s.indexOf("*/",i+2);i=j<0?s.length:j+1;continue;}
    if(ch==="#"){
      let j=i+1;
      while(j<s.length&&s[j]>="0"&&s[j]<="9")j++;
      if(j>i+1){const k=+s.slice(i+1,j);if(k>max)max=k;cur+="#"+(k+off);i=j-1;continue;}
    }
    if(ch===";"){
      const t=cur.trim();cur="";
      if(/^ENDSEC$/i.test(t))break;
      if(t)ents.push(t);
      continue;
    }
    if(ch!=="\n"&&ch!=="\r")cur+=ch;
  }
  return {ents,max};
}
function stepIncorporer(W,texte){
  const off=W.n, I=stepInstructions(texte,off);
  if(!I)return null;
  const {ents,max}=I;
  /* produit racine : PRODUCT_DEFINITION → PRODUCT_DEFINITION_SHAPE → SHAPE_DEFINITION_REPRESENTATION */
  const pds=[], contenus=new Set(), parPd=new Map(), rep=new Map();
  for(const e of ents){
    const a=/^#(\d+)\s*=\s*([A-Z0-9_]+)\s*\(/i.exec(e);
    if(!a)continue;
    const type=a[2].toUpperCase(), refs=(e.slice(a[0].length).replace(/'(?:[^']|'')*'/g,"''").match(/#\d+/g)||[]);
    if(type==="PRODUCT_DEFINITION")pds.push("#"+a[1]);
    else if(type==="NEXT_ASSEMBLY_USAGE_OCCURRENCE"&&refs[1])contenus.add(refs[1]);
    else if(type==="PRODUCT_DEFINITION_SHAPE"&&refs[0])parPd.set("#"+a[1],refs[0]);
    else if(type==="SHAPE_DEFINITION_REPRESENTATION"&&refs[1]&&parPd.has(refs[0]))rep.set(parPd.get(refs[0]),refs[1]);
  }
  /* PRODUCT_DEFINITION_SHAPE peut venir après la SHAPE_DEFINITION_REPRESENTATION */
  for(const e of ents){
    const a=/^#\d+\s*=\s*SHAPE_DEFINITION_REPRESENTATION\s*\(\s*(#\d+)\s*,\s*(#\d+)/i.exec(e);
    if(a&&parPd.has(a[1])&&!rep.has(parPd.get(a[1])))rep.set(parPd.get(a[1]),a[2]);
  }
  const pd=pds.find(p=>!contenus.has(p)&&rep.has(p));
  if(!pd)return null;
  for(const e of ents)W.l.push(e+";");
  W.n=off+max;
  return {pd,rep:rep.get(pd),ax0:W.ax([0,0,0])};
}
/* L'enfant `e` placé dans la racine par `ax` (un axe de la représentation racine) */
function stepLier(W,racine,e,ax,nom,i){
  const nauo=W.e("NEXT_ASSEMBLY_USAGE_OCCURRENCE("+stepTexte("NAUO"+i)+","+stepTexte(nom)+",'',"+racine.pd+","+e.pd+",$)");
  const idt=W.e("ITEM_DEFINED_TRANSFORMATION('',''," +e.ax0+","+ax+")");
  const rr=W.e("(REPRESENTATION_RELATIONSHIP('',''," +e.rep+","+racine.rep+")"+
               "REPRESENTATION_RELATIONSHIP_WITH_TRANSFORMATION("+idt+")SHAPE_REPRESENTATION_RELATIONSHIP())");
  W.e("CONTEXT_DEPENDENT_SHAPE_REPRESENTATION("+rr+","+W.e("PRODUCT_DEFINITION_SHAPE('',''," +nauo+")")+")");
}

/* ==========================================================================
   La scène en STEP
   --------------------------------------------------------------------------
   `J` : la scène (anim3dDonnees) — titre, ep, contour [[x,y]], decoupes,
   trous [[x,y,d,via?]] (via : 1 pour un via), faces[0|1].cuivre {pistes [x1,y1,x2,y2,w], pads [[x,y]…],
   vias [x,y,d,drill], zones [{p,t}]}, faces[].seri {segs, pts [x,y,d], polys
   [{p,t}]}, composants [{ref, face 0|1, corps [[x,y]], h, m3d?}].
   `o` : {carte, vias, dessus, dessous, cuivre, seri} — ce qu'on veut dans le fichier.
   `modeles` : nom du fichier de la LIB → son texte STEP.
   Rend {texte, n:{pieces, modeles, boites, demiTrous, trousIgnores}} ; null
   si rien n'est à écrire. Un trou qui coupe le bord ou une découpe (demi-trou)
   entaille le contour ; un trou hors de la carte, ou qu'on ne sait pas
   entailler, tombe et se compte dans `trousIgnores`.
   ========================================================================== */
const STEP_CHOIX=[
  ["carte","Carte (PCB) : substrat, contour, découpes et trous"],
  ["vias","Trous des vias dans la carte (lourd sur une carte dense)"],
  ["dessus","Composants dessus"],
  ["dessous","Composants dessous"],
  ["cuivre","Cuivre extérieur (pistes, pastilles, vias, zones)"],
  ["seri","Sérigraphie (lourd : chaque trait est un solide)"]
];
function stepScene(J,o,modeles){
  const W=stepNouveau(), ep=J.ep||1.6, P=p=>({x:p[0],y:p[1]}), enfants=[];
  const n={pieces:0,modeles:0,boites:0,demiTrous:0,trousIgnores:0};
  if(o.carte){
    /* les trous qui se touchent, ou touchent un trou déjà pris, casseraient le solide : le premier reste */
    const pris=[];
    for(const t of J.trous||[])
      if(t[2]>0&&(o.vias||!t[3])&&!pris.some(u=>Math.hypot(u[0]-t[0],u[1]-t[1])<(u[2]+t[2])/2+1e-3))pris.push(t);
    /* bord en sens trigonométrique, découpes en sens horaire : la matière à gauche */
    const sens=(b,bord)=>(stepAire(b)>0)===bord?b:stepInverser(b);
    const B=[sens(stepBoucle(J.contour.map(P),true),true)]
      .concat((J.decoupes||[]).map(d=>sens(stepBoucle(d.map(P),true),false)));
    const trous=[];
    for(const t of pris){
      /* un demi-trou entaille la boucle qu'il coupe ; un trou hors de la carte, ou qu'on ne sait pas entailler, tombe */
      let fait=false;
      for(let i=0;i<B.length&&!fait;i++){
        const e=stepEntaille(B[i],t);
        if(e==="coupe"){n.trousIgnores++;fait=true;}
        else if(e){B[i]=e;n.demiTrous++;fait=true;}
      }
      if(fait)continue;
      if(B[0].length>=3&&stepDedans(t,B[0])&&!B.slice(1).some(d=>stepDedans(t,d)))trous.push(t);
      else n.trousIgnores++;
    }
    const s=stepPrisme(W,B.concat(trous.map(t=>stepCercle(t[0],t[1],t[2]/2))),-ep,0);
    if(s){stepTeinte(W,s,[0.05,0.35,0.15]);enfants.push({nom:J.titre+"-CARTE",p:stepPiece(W,J.titre+"-CARTE",[s])});}
  }
  /* cuivre et sérigraphie : une pièce par face, posée sur la face (dessous : sous la carte) */
  const couche=(nom,f,z,h,polys,rgb)=>{
    const z0=f?-ep-z-h:z, sol=[];
    for(const p of polys){
      const s=stepPrisme(W,p,z0,z0+h);
      if(s){stepTeinte(W,s,rgb);sol.push(s);}
    }
    if(sol.length)enfants.push({nom,p:stepPiece(W,nom,sol)});
  };
  const plein=q=>[stepBoucle(q.p.map(P))].concat((q.t||[]).map(t=>stepBoucle(t.map(P))));
  for(const f of [0,1]){
    const F=(J.faces||[])[f];
    if(!F)continue;
    const cote=f?"DESSOUS":"DESSUS";
    if(o.cuivre){
      const C=F.cuivre, L=[];
      for(const t of C.pistes||[])L.push([stepTrait(P(t),{x:t[2],y:t[3]},t[4])]);
      for(const q of C.pads||[])L.push([stepBoucle(q.map(P))]);
      for(const v of C.vias||[])L.push([stepCercle(v[0],v[1],v[2]/2)].concat(v[3]>0&&v[3]<v[2]?[stepCercle(v[0],v[1],v[3]/2)]:[]));
      for(const z of C.zones||[])L.push(plein(z));
      couche("CUIVRE_"+cote,f,0,STEP_CU,L,[0.84,0.68,0.28]);
    }
    if(o.seri){
      const S2=F.seri, L=[];
      for(const t of S2.segs||[])L.push([stepTrait(P(t),{x:t[2],y:t[3]},t[4])]);
      for(const p of S2.pts||[])L.push([stepCercle(p[0],p[1],p[2]/2)]);
      for(const q of S2.polys||[])L.push(plein(q));
      couche("SERIGRAPHIE_"+cote,f,STEP_CU,STEP_SERI,L,[0.95,0.95,0.95]);
    }
  }
  /* composants : le modèle de la LIB, recopié une fois, sinon le corps extrudé */
  const incorpores={};
  for(const c of J.composants||[]){
    if(!(c.face?o.dessous:o.dessus))continue;
    const txt=c.m3d&&modeles&&modeles[c.m3d.nom];
    if(txt){
      if(!(c.m3d.nom in incorpores))incorpores[c.m3d.nom]=stepIncorporer(W,txt);
      const M=incorpores[c.m3d.nom]&&anim3dPose(c.m3d,c.face,1);
      if(M){enfants.push({nom:c.ref,p:incorpores[c.m3d.nom],M,dz:c.face?-ep:0});n.modeles++;continue;}
    }
    const s=stepPrisme(W,[stepBoucle(c.corps.map(P))],c.face?-ep-c.h:0,c.face?-ep:c.h);
    if(s){stepTeinte(W,s,[0.12,0.12,0.13]);enfants.push({nom:c.ref,p:stepPiece(W,c.ref,[s])});n.boites++;}
  }
  if(!enfants.length)return null;
  const axes=enfants.map(e=>e.M?W.ax([e.M[12],e.M[13],e.M[14]+e.dz],[e.M[8],e.M[9],e.M[10]],[e.M[0],e.M[1],e.M[2]])
                               :W.ax([0,0,0]));
  const rep=W.e("SHAPE_REPRESENTATION("+stepTexte(J.titre)+",("+[W.ax([0,0,0])].concat(axes).join(",")+"),"+W.geo+")");
  const racine={pd:stepProduit(W,J.titre,rep),rep};
  enfants.forEach((e,i)=>stepLier(W,racine,e.p,axes[i],e.nom,i+1));
  if(W.styled.length)W.e("MECHANICAL_DESIGN_GEOMETRIC_PRESENTATION_REPRESENTATION('',("+W.styled.join(",")+"),"+W.geo+")");
  n.pieces=enfants.length;
  const texte=["ISO-10303-21;","HEADER;",
    "FILE_DESCRIPTION(("+stepTexte("Carte "+J.titre+" : assemblage 3D")+"),'2;1');",
    "FILE_NAME("+stepTexte(J.titre+".step")+",'"+new Date().toISOString().slice(0,19)+"',(''),(''),'WEB_CAO','WEB_CAO','');",
    "FILE_SCHEMA(('AUTOMOTIVE_DESIGN { 1 0 10303 214 1 1 1 1 }'));","ENDSEC;","DATA;"]
    .concat(W.l,["ENDSEC;","END-ISO-10303-21;",""]).join("\n");
  return {texte,n};
}

/* ==========================================================================
   STEP : lecture du contour d'une carte (import)
   --------------------------------------------------------------------------
   La carte dessinée par la mécanique : sa plus grande face plane donne le
   contour (boucle extérieure), les découpes (boucles intérieures) et les
   trous ronds (boucle faite d'arcs d'un même cercle). Droites gardées, arcs
   et ellipses en cordes égales de 10° au plus (ctrSegments les retrouve à
   l'export), B-splines en 48 points. Coordonnées en mm, dans le repère du
   fichier, Y vers le haut : son origine devient celle des fichiers.
   ========================================================================== */
/* Une valeur d'instruction : {r} référence, nombre, chaîne, énumération
   (".T."), null ($ ou *), liste, {t, a} entité typée. */
function stepValeur(s){
  let i=0;
  const blanc=()=>{while(i<s.length&&/\s/.test(s[i]))i++;};
  const val=()=>{
    blanc();
    const c=s[i];
    if(c==="#"){const m=/^#(\d+)/.exec(s.slice(i,i+20));i+=m[0].length;return {r:+m[1]};}
    if(c==="'"){let o="";i++;for(;i<s.length;i++){if(s[i]==="'"){if(s[i+1]==="'"){o+="'";i++;}else{i++;break;}}else o+=s[i];}return o;}
    if(c==="."){const j=s.indexOf(".",i+1);const o=s.slice(i,j+1);i=j+1;return o;}
    if(c==="$"||c==="*"){i++;return null;}
    if(c==="("){
      i++;const L=[];
      for(;;){blanc();if(s[i]===")"){i++;return L;}L.push(val());blanc();if(s[i]===",")i++;}
    }
    const m=/^[A-Za-z_][A-Za-z0-9_]*/.exec(s.slice(i,i+80));
    if(m){i+=m[0].length;blanc();const a=s[i]==="("?val():[];return {t:m[0].toUpperCase(),a};}
    const n=/^[-+]?[0-9.]+(?:[eE][-+]?[0-9]+)?/.exec(s.slice(i,i+40));
    if(!n)throw new Error("STEP illisible près de « "+s.slice(i,i+30)+" »");
    i+=n[0].length;return parseFloat(n[0]);
  };
  return val();
}
function stepLireCarte(texte){
  const I=stepInstructions(String(texte||""),0);
  if(!I||!I.ents.length)return {erreur:"pas un fichier STEP (section DATA absente)"};
  const E=new Map(), brut=new Map();
  for(const e of I.ents){
    const m=/^#(\d+)\s*=\s*([\s\S]*)$/.exec(e);
    if(m)brut.set(+m[1],m[2]);
  }
  /* une entité lue à la demande ; complexe « (A(..)B(..)) » : {t:"*", p:{A:args, B:args}} */
  const ent=r=>{
    const id=r&&r.r!=null?r.r:r;
    if(E.has(id))return E.get(id);
    let v=null;
    const b=brut.get(id);
    if(b!=null){
      v=stepValeur(b);
      if(Array.isArray(v)){const p={};for(const x of v)if(x&&x.t)p[x.t]=x.a;v={t:"*",p};}
    }
    E.set(id,v);return v;
  };
  /* l'unité de longueur du fichier */
  let k=1;
  for(const b of brut.values())if(/LENGTH_UNIT/.test(b)){
    if(/CONVERSION_BASED_UNIT\s*\(\s*'INCH/i.test(b))k=25.4;
    else if(/\.CENTI\.\s*,\s*\.METRE\./.test(b))k=10;
    else if(/\$\s*,\s*\.METRE\./.test(b))k=1000;
    break;
  }
  const V3=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
  const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
  const unit=a=>{const l=Math.hypot(a[0],a[1],a[2])||1;return a.map(x=>x/l);};
  const pt=r=>{const e=ent(r);return e&&e.t==="CARTESIAN_POINT"?e.a[1].map(x=>x*k).concat([0,0,0]).slice(0,3):[0,0,0];};
  const dir=(r,d)=>{const e=r&&ent(r);return e&&e.t==="DIRECTION"?unit(e.a[1].concat([0,0,0]).slice(0,3)):d;};
  const ax=r=>{
    const e=ent(r)||{a:[]}, o=pt(e.a[1]), z=dir(e.a[2],[0,0,1]);
    let x=dir(e.a[3],Math.abs(z[0])<0.9?[1,0,0]:[0,1,0]);
    x=unit(x.map((v,i)=>v-dot(x,z)*z[i]));
    return {o,z,x,y:V3(z,x)};
  };
  const sommet=r=>{const e=ent(r);return e&&e.t==="VERTEX_POINT"?pt(e.a[1]):[0,0,0];};
  /* une B-spline (simple ou complexe, rationnelle ou non) en n points */
  const bspline=e=>{
    const P=e.t==="*"?e.p:null;
    const bs=P?P.B_SPLINE_CURVE:e.a.slice(1,6), kn=P?P.B_SPLINE_CURVE_WITH_KNOTS:e.a.slice(6,9);
    const w=P&&P.RATIONAL_B_SPLINE_CURVE?P.RATIONAL_B_SPLINE_CURVE[0]:null;
    if(!bs||!kn)return null;
    const p=bs[0], C=bs[1].map(pt), U=[];
    kn[0].forEach((m,j)=>{for(let q=0;q<m;q++)U.push(kn[1][j]);});
    const W=w||C.map(()=>1), out=[], u0=U[p], u1=U[U.length-p-1];
    for(let s=0;s<=48;s++){
      const u=Math.min(u1-1e-12,u0+(u1-u0)*s/48);
      let j=p;while(j<U.length-p-2&&u>=U[j+1])j++;
      const d=[];
      for(let q=0;q<=p;q++){const c=C[j-p+q],wq=W[j-p+q];d.push([c[0]*wq,c[1]*wq,c[2]*wq,wq]);}
      for(let r=1;r<=p;r++)for(let q=p;q>=r;q--){
        const i0=j-p+q, a=(u-U[i0])/((U[i0+p-r+1]-U[i0])||1);
        d[q]=d[q].map((v,t)=>(1-a)*d[q-1][t]+a*v);
      }
      out.push([d[p][0]/d[p][3],d[p][1]/d[p][3],d[p][2]/d[p][3]]);
    }
    return out;
  };
  /* une arête orientée en points (de son début à sa fin), et son cercle s'il en a un */
  const arete=oe=>{
    const o=ent(oe), ec=o&&ent(o.a[3]);
    if(!ec||ec.t!=="EDGE_CURVE")return null;
    const p1=sommet(ec.a[1]), p2=sommet(ec.a[2]), meme=ec.a[4]!==".F.";
    let c=ent(ec.a[3]);
    while(c&&(c.t==="SURFACE_CURVE"||c.t==="SEAM_CURVE"||c.t==="TRIMMED_CURVE"))c=ent(c.a[1]);   // shortcut: un TRIMMED_CURVE est pris entre ses sommets ; lire ses bornes si un fichier en a besoin
    let P=[p1,p2], cercle=null;
    if(c&&(c.t==="CIRCLE"||c.t==="ELLIPSE")){
      const A=ax(c.a[1]), r1=c.a[2]*k, r2=(c.t==="ELLIPSE"?c.a[3]:c.a[2])*k;
      const t=p=>{const d=p.map((v,i)=>v-A.o[i]);return Math.atan2(dot(d,A.y)/r2,dot(d,A.x)/r1);};
      const sg=meme?1:-1, t1=t(p1);
      const bal=((sg*(t(p2)-t1))%(2*Math.PI)+2*Math.PI)%(2*Math.PI)||2*Math.PI;
      const n=Math.max(3,Math.ceil(bal/(Math.PI/18)));
      P=[];
      for(let i=0;i<=n;i++){const a=t1+sg*bal*i/n;P.push(A.o.map((v,q)=>v+r1*Math.cos(a)*A.x[q]+r2*Math.sin(a)*A.y[q]));}
      P[0]=p1;P[n]=p2;
      if(c.t==="CIRCLE")cercle={c:A.o,r:r1};
    }else if(c&&(c.t==="B_SPLINE_CURVE_WITH_KNOTS"||(c.t==="*"&&c.p.B_SPLINE_CURVE))){
      const B=bspline(c);
      if(B){if(!meme)B.reverse();B[0]=p1;B[B.length-1]=p2;P=B;}
    }else if(!meme)P=[p1,p2];
    if(o.a[4]===".F.")P=P.slice().reverse();
    return {P,cercle};
  };
  /* les faces planes et leurs boucles */
  const faces=[];
  for(const [id,b] of brut){
    if(!/^ADVANCED_FACE\s*\(/.test(b))continue;
    const f=ent(id), S=ent(f.a[2]);
    if(!S||S.t!=="PLANE")continue;
    const A=ax(S.a[1]), n=f.a[3]===".F."?A.z.map(v=>-v):A.z;
    const boucles=[];
    for(const br of f.a[1]){
      const B=ent(br), L=B&&ent(B.a[1]);
      if(!L||L.t!=="EDGE_LOOP")continue;
      const ar=L.a[1].map(arete).filter(Boolean);
      if(!ar.length)continue;
      let P=[];
      for(const x of ar)P=P.concat(P.length?x.P.slice(1):x.P);
      if(B.a[2]===".F.")P.reverse();
      boucles.push({P,ar});
    }
    if(boucles.length)faces.push({n,A,boucles});
  }
  if(!faces.length)return {erreur:"aucune face plane dans le fichier"};
  /* projetée : (x, y) si la face regarde Z, sinon dans son plan */
  const plan=f=>{
    if(Math.abs(f.n[2])>0.99)return p=>({x:p[0],y:p[1]});
    const u=f.A.x, v=V3(f.n,u);
    return p=>({x:dot(p,u),y:dot(p,v)});
  };
  const aire=P=>Math.abs(P.reduce((s,p,i)=>{const q=P[(i+1)%P.length];return s+p.x*q.y-q.x*p.y;},0))/2;
  for(const f of faces){
    const pr=plan(f);
    for(const b of f.boucles){b.Q=b.P.map(pr);b.aire=aire(b.Q);}
    f.boucles.sort((a,b)=>b.aire-a.aire);
    f.aire=f.boucles[0].aire-f.boucles.slice(1).reduce((s,b)=>s+b.aire,0);
    f.pr=pr;
  }
  /* la plus grande ; à égalité (dessus / dessous), celle qui regarde +Z */
  faces.sort((a,b)=>b.aire-a.aire);
  const F=faces.filter(f=>f.aire>faces[0].aire*0.999).sort((a,b)=>b.n[2]-a.n[2])[0];
  const propre=Q=>stepPropre(Q).map(p=>({x:Math.round(p.x*1e4)/1e4,y:Math.round(p.y*1e4)/1e4}));
  const out={contour:propre(F.boucles[0].Q),decoupes:[],trous:[],aire:F.aire};
  for(const b of F.boucles.slice(1)){
    const c0=b.ar[0].cercle;
    if(c0&&b.ar.every(x=>x.cercle&&Math.abs(x.cercle.r-c0.r)<1e-4&&Math.hypot(...x.cercle.c.map((v,i)=>v-c0.c[i]))<1e-4)){
      const c=F.pr(c0.c);
      out.trous.push({x:Math.round(c.x*1e4)/1e4,y:Math.round(c.y*1e4)/1e4,d:Math.round(2*c0.r*1e4)/1e4});
    }else out.decoupes.push(propre(b.Q));
  }
  if(out.contour.length<3)return {erreur:"contour dégénéré"};
  return out;
}

/* ==========================================================================
   Navigateur : modèles de la LIB et fenêtre des cases
   ========================================================================== */
/* Les STEP de LIB/Models par le serveur ; un modèle absent laisse la boîte. */
function stepChargerModeles(noms){
  const M={};
  return Promise.all([...new Set(noms)].map(nom=>Promise.resolve()
    .then(()=>fetch("/api/lib/fichier?type=step&nom="+encodeURIComponent(nom)))
    .then(r=>r.ok?r.json():null)
    .then(d=>{if(d&&typeof d.contenu==="string"&&d.contenu.includes("ISO-10303-21"))M[nom]=d.contenu;})
    .catch(()=>{}))).then(()=>M);
}
/* ce que le message de fin dit des demi-trous et des trous laissés de côté */
function stepNoteTrous(n){
  return (n.demiTrous?", "+n.demiTrous+" demi-trou(s) en bord":"")+
         (n.trousIgnores?", "+n.trousIgnores+" trou(s) hors carte ou à cheval sur plusieurs bords, non percé(s)":"");
}
/* La scène `J` en STEP, modèles chargés : rend le résultat de stepScene. */
function stepFabriquer(J,o){
  return stepChargerModeles((J.composants||[]).filter(c=>c.m3d&&(c.face?o.dessous:o.dessus)).map(c=>c.m3d.nom))
    .then(M=>stepScene(J,o,M));
}
/* La fenêtre : une case par élément (`desactives` : ceux que l'outil n'a
   pas), puis `exporter(o)`. Le choix reste le temps de la page. */
let STEP_COCHES={carte:true,vias:false,dessus:false,dessous:false,cuivre:false,seri:false};
function stepFenetre(exporter,desactives,classes){
  const K=classes||{fond:"modal",boite:"box"}, sans=desactives||[];
  const m=document.createElement("div");
  m.className=K.fond;
  m.innerHTML='<div class="'+K.boite+'" style="max-width:460px">'+
    '<h3>🧊 Export STEP (3D)</h3>'+
    '<p style="font-size:12.5px;margin:6px 0 10px">Assemblage pour la mécanique, en mm, repère des Gerber. À mettre dans le fichier :</p>'+
    STEP_CHOIX.map(([k,t])=>'<label style="display:flex;align-items:center;gap:8px;padding:3px 0;font-size:12.5px;cursor:pointer">'+
      '<input type="checkbox" data-step="'+k+'"'+(sans.includes(k)?" disabled":STEP_COCHES[k]?" checked":"")+'> '+
      t.replace(/&/g,"&amp;").replace(/</g,"&lt;")+(sans.includes(k)?" (non disponible ici)":"")+'</label>').join("")+
    '<div style="display:flex;justify-content:flex-end;gap:8px;margin-top:14px">'+
    '<button class="tb" type="button" data-a="annuler">Annuler</button>'+
    '<button class="tb on" type="button" data-a="exporter">Exporter le .step</button></div></div>';
  document.body.appendChild(m);
  const fermer=()=>m.remove();
  m.addEventListener("click",e=>{
    if(e.target===m){fermer();return;}
    const b=e.target.closest&&e.target.closest("[data-a]");
    if(!b)return;
    if(b.dataset.a==="annuler"){fermer();return;}
    const o={};
    for(const c of m.querySelectorAll("input[data-step]"))o[c.dataset.step]=c.checked&&!c.disabled;
    if(!STEP_CHOIX.some(([k])=>o[k])){alert("Cochez au moins un élément.");return;}
    Object.assign(STEP_COCHES,o);
    fermer();
    exporter(o);
  });
  return m;
}
