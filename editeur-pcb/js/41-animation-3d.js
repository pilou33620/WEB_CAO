"use strict";
/* ==========================================================================
   Éditeur PCB — animation 3D de la carte qui s'assemble (fabrication.zip)
   --------------------------------------------------------------------------
   Une bascule du menu Fichier, éteinte à chaque ouverture de l'éditeur.
   Allumée, « Fabrication .zip » ajoute au dossier :
     <base>-ASSEMBLAGE-3D.mp4 ou .webm   la vidéo, enregistrée dans le navigateur
                                         (MediaRecorder sur le canvas) ;
     <base>-ASSEMBLAGE-3D.html           la même animation en boucle, orientable
                                         à la souris, three.js embarqué : elle
                                         s'ouvre hors ligne.
   Les deux jouent la même scène : `anim3dLancer` ne dépend que de THREE et des
   données, et la page HTML en recopie le texte (Function.toString).
   Ordre : carte nue → cuivre → vernis et sérigraphie → composants un par un
   (gros boîtiers d'abord, dessus puis dessous) → tour complet de la carte finie.
   three.js est dans commun/vendor/three-source.js, en texte, évalué ici à la
   première animation.
   Un composant dont la LIB a un « Modèle 3D » posé (« Position 3D ») est
   dessiné avec ce modèle ; les autres restent une boîte extrudée de leur corps.
   ========================================================================== */

let FAB_ANIM=false;
let ANIM3D_EN_COURS=false;     // un enregistrement à la fois (exportFab)
function fabAnimBasculer(){
  FAB_ANIM=!FAB_ANIM;
  const b=$("bFabAnim");
  if(b)b.classList.toggle("on",FAB_ANIM);
  hint(FAB_ANIM?"Fabrication .zip : l'animation 3D (vidéo et page HTML) sera ajoutée au dossier."
               :"Fabrication .zip : sans animation 3D.");
}

/* ---------- les données de la scène ----------
   Repère des Gerber (mm, X à droite, Y vers le haut, Z = 0 sur la face
   dessus), comme le dossier méca dont viennent contour, épaisseur et corps. */
function anim3dR(v){return Math.round(v*1000)/1000;}
function anim3dTeinte(ref,pkg){
  if(MECA_CONNECTEUR.test(ref))return 0x9ea3a8;               // plastique de connecteur
  if(/^C\d/i.test(ref))return 0xa8834e;                       // céramique
  if(/^(D|LED)\d/i.test(ref)&&/LED/i.test(pkg))return 0xe6e3d6;
  return 0x1b1c1e;                                            // époxy noir
}
function anim3dFinition(){
  const f=String(S.stack&&S.stack.finish||"");
  if(/HASL|Argent/i.test(f))return 0xc5c9ce;
  if(/OSP/i.test(f))return 0xc77a3c;
  return 0xd6ad48;                                            // or (ENIG, or dur)
}
/* Le remplissage des zones d'une couche, tel que l'écran le peint (dégagements,
   liaisons thermiques, lanières, bord) : une image PNG blanche sur transparent,
   posée à plat dans la scène. {png, x, y, l, h} : centre et taille en mm, repère
   des Gerber ; null sans zone (ou sans canevas, au banc d'essai). */
function anim3dZone(L,o){
  if(!S.zones.some(z=>z.l===L&&z.pts.length>=3))return null;
  try{
    const bb=S.zones.filter(z=>z.l===L&&z.pts.length>=3).map(z=>zoneCalc(z).bb);
    const aire=bb.reduce((a,b)=>a+(b.x2-b.x1+2)*(b.y2-b.y1+2),0);
    const r=zoneCanvas(L,{res:Math.min(20,Math.sqrt(4e6/Math.max(1,aire)))});
    if(!r||typeof r.cvs.toDataURL!=="function")return null;
    const c=document.createElement("canvas");
    c.width=r.cvs.width;c.height=r.cvs.height;
    const g=c.getContext("2d");
    g.drawImage(r.cvs,0,0);
    g.globalCompositeOperation="source-in";            // la couleur de la couche devient blanche
    g.fillStyle="#fff";g.fillRect(0,0,c.width,c.height);
    return {png:c.toDataURL("image/png"),x:anim3dR(r.x+r.w/2-o.x),y:anim3dR(o.y-(r.y+r.h/2)),
            l:anim3dR(r.w),h:anim3dR(r.h)};
  }catch(_){return null;}
}
function anim3dDonnees(){
  const o=gOrigin(), P=p=>[anim3dR(p.x-o.x),anim3dR(o.y-p.y)];
  const J=mecaDossier(), ep=J.carte.epaisseur||1.6, der=S.cu-1;
  /* tous les trous qui traversent : NPTH, pastilles percées, vias traversants */
  const trous=[];
  for(const h of trousMonde())if(h.d>0)trous.push(P(h).concat(anim3dR(h.d)));
  for(const fp of S.fps)for(const q of padsWorld(fp))if(q.drill>0)trous.push(P(q).concat(anim3dR(q.drill)));
  for(const v of S.vias)if(v.drill>0&&v.a===0&&v.b===der)trous.push(P(v).concat(anim3dR(v.drill)));
  const cuivre=L=>{
    const pistes=[];
    for(const t of S.tracks){
      if(t.l!==L)continue;
      const A=arcOf(t), n=A?Math.max(2,Math.ceil(Math.abs(A.ca)*A.r/0.5)):1;
      let a=trkAt(t,0);
      for(let k=1;k<=n;k++){const b=trkAt(t,k/n);pistes.push(P(a).concat(P(b),anim3dR(t.w)));a=b;}
    }
    pistes.sort((u,v)=>(u[0]+u[2])-(v[0]+v[2]));               // le cuivre se pose de gauche à droite
    const pads=[];
    for(const fp of S.fps)for(const q of padsWorld(fp))
      if(padLayers(fp,q).includes(L))pads.push(padWorldPts(q).map(P));
    return {pistes,pads,
      vias:S.vias.filter(v=>v.a<=L&&L<=v.b).map(v=>P(v).concat(anim3dR(v.d),anim3dR(v.drill||0))),
      zone:anim3dZone(L,o)};
  };
  const seri=side=>{
    const segs=[],pts=[],polys=[];
    for(const t of silkTraits(side)){
      if(t.k==="seg")segs.push(P({x:t.x1,y:t.y1}).concat(P({x:t.x2,y:t.y2}),t.w));
      else if(t.k==="pt")pts.push(P(t).concat(t.d));
      else polys.push({p:t.pts.map(P),t:t.trous.map(h=>h.map(P))});
    }
    return {segs,pts,polys};
  };
  const aire=c=>Math.abs(c.reduce((s,p,i)=>{const q=c[(i+1)%c.length];return s+p[0]*q[1]-q[0]*p[1];},0))/2;
  const parRef=new Map(S.fps.map(fp=>[fp.ref,fp]));
  const composants=J.composants.filter(c=>c.monte&&c.corps.length>=3).map(c=>{
    const s=aire(c.corps);
    /* shortcut: sans hauteur (LIB, fichier ou saisie), une boîte à 0,4 × le côté moyen ; la renseigner dans la LIB */
    const h=c.hauteur!=null?c.hauteur:anim3dR(Math.min(3,Math.max(0.3,0.4*Math.sqrt(s))));
    const l=parRef.has(c.ref)?anim3dLigneLib(parRef.get(c.ref)):null;
    const nom=l?String(l["Modèle 3D"]||"").trim().replace(/^Models\//,""):"";
    const m3d=nom&&anim3dPosition(l["Position 3D"])?{nom,pos:l["Position 3D"],x:c.x,y:c.y,rot:c.rot}:null;
    return {ref:c.ref,face:c.face==="dessous"?1:0,corps:c.corps,h,v:s*h,couleur:anim3dTeinte(c.ref,c.boitier),m3d};
  }).sort((a,b)=>a.face-b.face||b.v-a.v);
  const B=J.carte.encombrement;
  return {titre:fabBase(),l:anim3dR(B.x2-B.x1),h:anim3dR(B.y2-B.y1),ep,
    contour:J.carte.contour,decoupes:J.carte.decoupes,trous,finition:anim3dFinition(),
    faces:[{cuivre:cuivre(0),seri:seri(0)},
           {cuivre:der>0?cuivre(der):{pistes:[],pads:[],vias:[],zone:null},seri:seri(1)}],
    composants:composants.map(c=>Object.assign({ref:c.ref,face:c.face,corps:c.corps,h:c.h,couleur:c.couleur},c.m3d?{m3d:c.m3d}:{}))};
}

/* ---------- les modèles 3D de la LIB ----------
   « Modèle 3D » nomme un STEP de LIB/Models ; son maillage (Models/maillages,
   fait par python/maillages_3d.mjs) vient par /api/lib/fichier?type=modele3d.
   « Position 3D » le pose sur l'empreinte : « haut=Y+ rot=90 x=0.1 y=0 z=0.4 »,
   dans le repère de l'empreinte, Y vers le haut. */
function anim3dLigneLib(fp){
  const lib=(typeof window!=="undefined"&&Array.isArray(window.CSV_LIB))?window.CSV_LIB:[];
  const cle=v=>String(v||"").trim().toLowerCase(), nom=cle(fp.csvPartName||fp.partName), mpn=cle(fp.mpn||fp.csvMpn);
  const val=cle(fp.value);                 // une carte IPC-2581 porte la Part Name en valeur
  const l=(nom&&lib.find(l=>cle(l["Part Name"])===nom))||
          (mpn&&lib.find(l=>cle(l["Part Number"])===mpn||cle(l["manufacturer part Number"])===mpn))||
          (val&&lib.find(l=>cle(l["Part Name"])===val));
  if(l||!fp.lib)return l||null;
  /* sans Part Name (carte venue d'une netlist) : le modèle le plus courant de la
     même empreinte LIB, et du même préfixe s'il y en a (R, C, LED…) */
  const emp=cle(fp.lib), pref=cle((String(fp.ref||"").match(/^[A-Z]+/i)||[""])[0]);
  const memes=lib.filter(l=>l["Modèle 3D"]&&l["Position 3D"]&&
    cle(String(l["Empreinte PCB"]||"").replace(/^.*\//,"").replace(/\.json$/i,""))===emp);
  const pr=memes.filter(l=>cle(l["Reference designator Prefix"])===pref), liste=pr.length?pr:memes, n=new Map();
  for(const x of liste){const k=x["Modèle 3D"]+"\n"+x["Position 3D"];n.set(k,(n.get(k)||0)+1);}
  let best=null;
  for(const x of liste){const k=x["Modèle 3D"]+"\n"+x["Position 3D"];if(!best||n.get(k)>n.get(best[0]))best=[k,x];}
  return best?best[1]:null;
}
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
/* Charge les maillages, pose chaque composant qui en a un (`mod`, `mat`), et
   rend leur nombre ; un maillage absent laisse la boîte extrudée. */
async function anim3dModeles(J){
  J.modeles={};
  const noms=[...new Set(J.composants.filter(c=>c.m3d).map(c=>c.m3d.nom))];
  await Promise.all(noms.map(nom=>Promise.resolve()
    .then(()=>fetch("/api/lib/fichier?type=modele3d&nom="+encodeURIComponent(nom+".json")))
    .then(r=>r.ok?r.json():null)
    .then(d=>{if(d&&d.data&&Array.isArray(d.data.g)&&d.data.u>0)J.modeles[nom]=d.data;})
    .catch(()=>{})));
  let n=0;
  for(const c of J.composants){
    const M=c.m3d&&J.modeles[c.m3d.nom], mat=M&&anim3dPose(c.m3d,c.face,M.u);
    if(mat){c.mod=c.m3d.nom;c.mat=mat;n++;}
    delete c.m3d;
  }
  for(const k of Object.keys(J.modeles))if(!J.composants.some(c=>c.mod===k))delete J.modeles[k];
  return n;
}

/* ---------- la scène ----------
   Autonome : la page HTML en recopie le texte, elle ne voit rien d'autre.
   o : {largeur, hauteur, dpr, souris}. Rend {duree, rendre(t), poser(l,h), detruire()}. */
function anim3dLancer(THREE,J,canvas,o){
  const renderer=new THREE.WebGLRenderer({canvas,antialias:true});
  renderer.setPixelRatio(o.dpr||1);
  renderer.setClearColor(0x000000,1);
  renderer.autoClear=false;
  const scene=new THREE.Scene(), carte=new THREE.Group(), ep=J.ep;
  scene.add(carte);
  let x1=Infinity,y1=Infinity,x2=-Infinity,y2=-Infinity;
  for(const [x,y] of J.contour){x1=Math.min(x1,x);y1=Math.min(y1,y);x2=Math.max(x2,x);y2=Math.max(y2,y);}
  carte.position.set(-(x1+x2)/2,-(y1+y2)/2,ep/2);

  const v2=p=>new THREE.Vector2(p[0],p[1]);
  const cercle=(x,y,r)=>{const n=16,c=[];for(let k=0;k<n;k++){const a=k*2*Math.PI/n;c.push([x+r*Math.cos(a),y+r*Math.sin(a)]);}return c;};
  const forme=new THREE.Shape(J.contour.map(v2));
  for(const d of J.decoupes)forme.holes.push(new THREE.Path(d.map(v2)));
  for(const [x,y,d] of J.trous){const h=new THREE.Path();h.absarc(x,y,d/2,0,2*Math.PI,true);forme.holes.push(h);}

  function plat(pos,idx){
    const g=new THREE.BufferGeometry(), n=new Float32Array(pos.length);
    for(let i=2;i<n.length;i+=3)n[i]=1;
    g.setAttribute("position",new THREE.Float32BufferAttribute(pos,3));
    g.setAttribute("normal",new THREE.BufferAttribute(n,3));
    g.setIndex(idx);
    return g;
  }
  /* traits à bouts ronds ; `fins` : le nombre d'indices posés après chaque trait */
  function rubans(segs,z){
    const pos=[],idx=[],fins=[],N=8;
    for(const [xa,ya,xb,yb,w] of segs){
      const r=w/2, L=Math.hypot(xb-xa,yb-ya)||1, nx=-(yb-ya)/L*r, ny=(xb-xa)/L*r;
      let b=pos.length/3;
      pos.push(xa+nx,ya+ny,z, xb+nx,yb+ny,z, xb-nx,yb-ny,z, xa-nx,ya-ny,z);
      idx.push(b,b+1,b+2, b,b+2,b+3);
      for(const [cx,cy] of [[xa,ya],[xb,yb]]){
        b=pos.length/3;pos.push(cx,cy,z);
        for(let k=0;k<N;k++){const a=k*2*Math.PI/N;pos.push(cx+r*Math.cos(a),cy+r*Math.sin(a),z);}
        for(let k=0;k<N;k++)idx.push(b,b+1+k,b+1+(k+1)%N);
      }
      fins.push(idx.length);
    }
    return {geo:plat(pos,idx),fins};
  }
  /* polygones pleins, trous compris : [{p:[[x,y]…], t:[[[x,y]…]…]}] */
  function polys(liste,z){
    const pos=[],idx=[];
    for(const it of liste){
      const pts=it.p.map(v2), trous=(it.t||[]).map(h=>h.map(v2));
      const tri=THREE.ShapeUtils.triangulateShape(pts,trous), b=pos.length/3;
      for(const q of pts.concat(...trous))pos.push(q.x,q.y,z);
      for(const f of tri)idx.push(b+f[0],b+f[1],b+f[2]);
    }
    return plat(pos,idx);
  }
  const mat=(color,opt)=>new THREE.MeshStandardMaterial(Object.assign(
    {color,roughness:0.6,metalness:0.1,side:THREE.DoubleSide,transparent:true,opacity:0},opt));
  const M={zone:mat(0xe0874a,{metalness:0.4,roughness:0.35}), piste:mat(0xe0874a,{metalness:0.4,roughness:0.35,opacity:1}),
           vernis:mat(0x14612f,{roughness:0.35}), pastille:mat(J.finition,{metalness:0.5,roughness:0.3}),
           seri:mat(0xf2f2ee,{roughness:0.8})};
  const poser_=(geo,m,ordre)=>{const x=new THREE.Mesh(geo,m);x.renderOrder=ordre;carte.add(x);return x;};

  const substrat=new THREE.Mesh(new THREE.ExtrudeGeometry(forme,{depth:ep,bevelEnabled:false,curveSegments:8}),
    new THREE.MeshStandardMaterial({color:0x8d8a4e,roughness:0.85}));
  substrat.position.z=-ep;
  carte.add(substrat);
  const pistes=[], zones=[];
  J.faces.forEach((F,f)=>{
    const z=d=>f?-ep-d:d, C=F.cuivre;
    if(C.zone){
      const g=new THREE.PlaneGeometry(C.zone.l,C.zone.h);g.translate(C.zone.x,C.zone.y,z(0.012));
      const m=M.zone.clone();
      m.map=new THREE.TextureLoader().load(C.zone.png);m.map.colorSpace=THREE.SRGBColorSpace;
      zones.push(poser_(g,m,1));
    }
    const R=rubans(C.pistes,z(0.018));
    pistes.push({geo:R.geo,fins:R.fins});
    poser_(R.geo,M.piste,2);
    const v=new THREE.ShapeGeometry(forme,8);v.translate(0,0,z(0.03));
    poser_(v,M.vernis,3);
    poser_(polys(C.pads.map(p=>({p})).concat(C.vias.map(([x,y,d,t])=>({p:cercle(x,y,d/2),t:t>0?[cercle(x,y,t/2)]:[]}))),z(0.036)),M.pastille,4);
    poser_(rubans(F.seri.segs,z(0.042)).geo,M.seri,5);
    poser_(polys(F.seri.pts.map(([x,y,d])=>({p:cercle(x,y,d/2)})).concat(F.seri.polys),z(0.042)),M.seri,5);
  });

  /* les composants : ordre et instants de pose */
  const nD=J.composants.filter(c=>!c.face).length, nB=J.composants.length-nD;
  const pas=Math.min(0.35,Math.max(0.04,7/Math.max(1,J.composants.length))), chute=0.5;
  const t0D=6, t0B=t0D+nD*pas+(nB?1.4:0);
  let hmax=0;
  const comps=J.composants.map((c,i)=>{
    const M3=c.mod&&J.modeles&&J.modeles[c.mod];
    let m, mats, base;
    if(M3){
      /* le modèle de la LIB : sa pose (`mat`) le met à sa place, le groupe ne fait que tomber */
      m=new THREE.Group();mats=[];
      const pose=new THREE.Group();
      pose.matrixAutoUpdate=false;pose.matrix.fromArray(c.mat);
      m.add(pose);
      for(const G of M3.g){
        const g=new THREE.BufferGeometry();
        g.setAttribute("position",new THREE.Float32BufferAttribute(G.p,3));
        g.setIndex(G.i);g.computeVertexNormals();
        const x=mat(G.c||c.couleur,{side:THREE.DoubleSide});
        mats.push(x);pose.add(new THREE.Mesh(g,x));
      }
      base=c.face?-ep-0.045:0.045;
    }else{
      m=new THREE.Mesh(new THREE.ExtrudeGeometry(new THREE.Shape(c.corps.map(v2)),{depth:c.h,bevelEnabled:false}),
                       mat(c.couleur,{side:THREE.FrontSide}));
      mats=[m.material];
      base=c.face?-ep-0.045-c.h:0.045;
    }
    m.position.z=base;m.visible=false;carte.add(m);
    hmax=Math.max(hmax,c.h);
    return {m,mats,base,face:c.face,t:c.face?t0B+(i-nD)*pas:t0D+i*pas};
  });
  const tTour=(nB?t0B+nB*pas:t0D+nD*pas)+chute+0.4, duree=tTour+8;

  /* caméra : clés (instant, valeur), lissées entre deux clés */
  const lisse=u=>u*u*(3-2*u);
  const cle=(K,t)=>{
    if(t<=K[0][0])return K[0][1];
    for(let i=1;i<K.length;i++)if(t<=K[i][0]){const [ta,a]=K[i-1],[tb,b]=K[i];return a+(b-a)*lisse((t-ta)/((tb-ta)||1));}
    return K[K.length-1][1];
  };
  const EL=[[0,1.05],[t0D,0.8]].concat(nB?[[t0B-1.4,0.8],[t0B,-0.8],[tTour,-0.8]]:[[tTour,0.7]]).concat([[duree,0.55]]);
  const az0=-1.2, azT=az0+0.05*tTour;
  const AZ=[[0,az0],[tTour,azT],[duree,azT+2*Math.PI]];
  const DI=[[0,1.5],[3,1.05],[tTour,0.95],[duree,0.95]];
  const rayon=Math.max(0.5*Math.hypot(x2-x1,y2-y1),ep/2+hmax);
  const camera=new THREE.PerspectiveCamera(35,1,1,10);
  camera.up.set(0,0,1);
  scene.add(new THREE.AmbientLight(0xffffff,1.1));
  const l1=new THREE.DirectionalLight(0xffffff,3);scene.add(l1);          // suit la caméra, un peu au-dessus
  const l2=new THREE.DirectionalLight(0xffffff,1.0);l2.position.set(-0.7,0.5,-1.4);scene.add(l2);
  let dist=1;

  /* bandeau du haut : titre, dimensions, étape */
  const hud=new THREE.Scene(), hudCam=new THREE.OrthographicCamera(0,1,1,0,-1,1);
  const hc=document.createElement("canvas");
  const hm=new THREE.Mesh(new THREE.PlaneGeometry(1,1),new THREE.MeshBasicMaterial({transparent:true,depthTest:false}));
  hud.add(hm);
  let etiq=null;
  const fr=v=>(Math.round(v*10)/10).toFixed(1).replace(".",",");
  function bandeau(txt){
    if(txt===etiq)return;
    etiq=txt;
    const g=hc.getContext("2d"), s=hc.height/130;
    g.clearRect(0,0,hc.width,hc.height);
    g.fillStyle="#fff";g.font="600 "+Math.round(40*s)+"px system-ui,sans-serif";g.textAlign="left";
    g.fillText(J.titre,28*s,58*s);
    g.fillStyle="#9aa3ad";g.font=Math.round(24*s)+"px system-ui,sans-serif";
    g.fillText(fr(J.l)+" × "+fr(J.h)+" mm  ·  "+fr(J.ep)+" mm d'épaisseur",28*s,98*s);
    g.textAlign="right";g.fillText(txt,hc.width-28*s,58*s);
    if(hm.material.map)hm.material.map.dispose();
    hm.material.map=new THREE.CanvasTexture(hc);
    hm.material.map.colorSpace=THREE.SRGBColorSpace;
    hm.material.needsUpdate=true;
  }
  /* cotes hors tout, dans le plan de la face dessus, hors de la carte : avec la
     carte nue, puis pour le tour final */
  const Lc=x2-x1, Hc=y2-y1, Mx=Math.max(Lc,Hc), dc=0.07*Mx+1, fl=0.025*Mx, zc=0.05;
  const cl=[], trait=(a,b,c,d)=>cl.push(a,b,zc,c,d,zc);
  const fleche=(x,y,dx,dy)=>{trait(x,y,x+dx*1.8*fl-dy*0.6*fl,y+dy*1.8*fl+dx*0.6*fl);trait(x,y,x+dx*1.8*fl+dy*0.6*fl,y+dy*1.8*fl-dx*0.6*fl);};
  const yb=y1-dc, xg=x1-dc;
  trait(x1,y1-0.3,x1,yb-fl);trait(x2,y1-0.3,x2,yb-fl);trait(x1,yb,x2,yb);fleche(x1,yb,1,0);fleche(x2,yb,-1,0);
  trait(x1-0.3,y1,xg-fl,y1);trait(x1-0.3,y2,xg-fl,y2);trait(xg,y1,xg,y2);fleche(xg,y1,0,1);fleche(xg,y2,0,-1);
  const gc=new THREE.BufferGeometry();gc.setAttribute("position",new THREE.Float32BufferAttribute(cl,3));
  const mc=new THREE.LineBasicMaterial({color:0xd8dde3,transparent:true,opacity:0});
  carte.add(new THREE.LineSegments(gc,mc));
  const etiquette=(txt,x,y)=>{
    const c=document.createElement("canvas");c.width=512;c.height=128;
    const g=c.getContext("2d");
    g.font="600 76px system-ui,sans-serif";g.textAlign="center";g.textBaseline="middle";g.fillStyle="#e4e8ec";
    g.fillText(txt,256,64);
    const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;
    const s=new THREE.Sprite(new THREE.SpriteMaterial({map:t,transparent:true,opacity:0}));
    const h=0.06*Mx;s.scale.set(h*4,h,1);s.position.set(x,y,zc);carte.add(s);
    return s.material;
  };
  const mcT=[etiquette(fr(Lc)+" mm",(x1+x2)/2,yb-0.05*Mx),etiquette(fr(Hc)+" mm",xg-0.13*Mx,(y1+y2)/2)];
  function poser(l,h){
    renderer.setSize(l,h,false);
    camera.aspect=l/h;
    dist=rayon/Math.tan(35*Math.PI/360)*Math.max(1,1/camera.aspect);
    camera.near=dist/50;camera.far=dist*20;
    camera.updateProjectionMatrix();
    hudCam.right=l;hudCam.top=h;hudCam.updateProjectionMatrix();
    const hh=Math.round(Math.min(130,h*0.2));
    hc.width=l;hc.height=hh;
    hm.scale.set(l,hh,1);hm.position.set(l/2,h-hh/2,0);
    etiq=null;
  }
  poser(o.largeur,o.hauteur);

  /* la souris s'ajoute au mouvement de l'animation, elle ne l'arrête pas */
  const vue={az:0,el:0,zoom:1};
  if(o.souris){
    let p=null;
    canvas.addEventListener("pointerdown",e=>{p=[e.clientX,e.clientY];canvas.setPointerCapture(e.pointerId);});
    canvas.addEventListener("pointermove",e=>{if(!p)return;vue.az-=(e.clientX-p[0])*0.008;vue.el+=(e.clientY-p[1])*0.008;p=[e.clientX,e.clientY];});
    canvas.addEventListener("pointerup",()=>{p=null;});
    canvas.addEventListener("wheel",e=>{e.preventDefault();vue.zoom=Math.min(4,Math.max(0.25,vue.zoom*Math.exp(e.deltaY*0.001)));},{passive:false});
    canvas.addEventListener("dblclick",()=>{vue.az=0;vue.el=0;vue.zoom=1;});
  }

  function rendre(t){
    t=Math.max(0,Math.min(t,duree));
    const e=(a,b)=>Math.min(1,Math.max(0,(t-a)/(b-a)));
    substrat.scale.z=Math.max(0.02,lisse(e(0,1.2)));
    for(const x of zones)x.material.opacity=lisse(e(1.2,2.2));
    for(const P of pistes){const n=Math.floor(e(1.2,3.8)*P.fins.length);P.geo.setDrawRange(0,n?P.fins[n-1]:0);}
    M.pastille.opacity=lisse(e(3.2,4.2));
    M.vernis.opacity=0.86*lisse(e(4.2,5.4));
    M.seri.opacity=lisse(e(5,6));
    mc.opacity=lisse(e(0.6,1.4))*(1-lisse(e(5.4,6)))+lisse(e(tTour,tTour+1));
    for(const m of mcT)m.opacity=mc.opacity;
    for(const c of comps){
      const u=e(c.t,c.t+chute);
      c.m.visible=u>0;
      for(const x of c.mats){x.opacity=Math.min(1,u*3);x.transparent=x.opacity<1;}   // opaque, un modèle se trie bien
      c.m.position.z=c.base+(c.face?-1:1)*Math.pow(1-u,3)*rayon*0.6;   // tombe et ralentit en se posant
    }
    const el=Math.max(-1.45,Math.min(1.45,cle(EL,t)+vue.el)), az=cle(AZ,t)+vue.az, d=dist*cle(DI,t)*vue.zoom;
    camera.position.set(d*Math.cos(el)*Math.cos(az),d*Math.cos(el)*Math.sin(az),d*Math.sin(el));
    camera.lookAt(0,0,0);
    l1.position.copy(camera.position).add(new THREE.Vector3(0,0,dist));
    bandeau(t<1.2?"Carte nue":t<4.2?"Cuivre":t<t0D?"Vernis et sérigraphie":
            t<(nB?t0B-1.4:tTour)?"Composants — dessus":t<tTour?"Composants — dessous":"Carte assemblée");
    renderer.clear();
    renderer.render(scene,camera);
    renderer.clearDepth();
    renderer.render(hud,hudCam);
  }
  function detruire(){
    for(const s of [scene,hud])s.traverse(x=>{if(x.geometry)x.geometry.dispose();if(x.material){if(x.material.map)x.material.map.dispose();x.material.dispose();}});
    renderer.dispose();
  }
  return {duree,rendre,poser,detruire};
}

/* ---------- les deux fichiers ---------- */
/* H.264 en MP4 si le navigateur l'encode (Chrome de Google), sinon WebM : Chromium enregistre
   aussi du « video/mp4 », mais en VP9, que bien des lecteurs du MP4 ne lisent pas */
const ANIM3D_FORMATS=[["video/mp4;codecs=avc1.640028","mp4"],
  ["video/webm;codecs=vp9","webm"],["video/webm;codecs=vp8","webm"],["video/webm","webm"]];
function anim3dFormat(){
  if(typeof MediaRecorder==="undefined"||typeof MediaRecorder.isTypeSupported!=="function")return null;
  for(const [type,ext] of ANIM3D_FORMATS)if(MediaRecorder.isTypeSupported(type))return {type,ext};
  return null;
}
function anim3dThree(){
  if(typeof THREE==="undefined")(0,eval)(THREE_SOURCE);   // indirect : THREE devient global
  return THREE;
}
/* L'animation jouée en temps réel dans un voile, le canvas enregistré. */
function anim3dVideo(THREE,J,fmt){
  return new Promise((ok,ko)=>{
    const fond=document.createElement("div");
    fond.style.cssText="position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.9);display:flex;flex-direction:column;"+
      "align-items:center;justify-content:center;gap:10px;color:#ccc;font:13px system-ui,sans-serif";
    const cv=document.createElement("canvas");
    cv.style.cssText="width:min(90vw,142vh);aspect-ratio:16/9;background:#000";
    const msg=document.createElement("div");
    fond.append(cv,msg);
    document.body.appendChild(fond);
    let A;
    try{A=anim3dLancer(THREE,J,cv,{largeur:1280,hauteur:720});}
    catch(e){fond.remove();ko(e);return;}
    const morceaux=[], rec=new MediaRecorder(cv.captureStream(30),{mimeType:fmt.type,videoBitsPerSecond:8e6});
    rec.ondataavailable=e=>{if(e.data&&e.data.size)morceaux.push(e.data);};
    const fin=()=>{A.detruire();fond.remove();};
    let t0=null, images=0;
    const image=now=>{
      if(t0===null){t0=now;rec.start(1000);}
      const t=(now-t0)/1000;
      try{A.rendre(t);}catch(e){rec.stop();fin();ko(e);return;}
      images++;
      msg.textContent="Animation 3D : enregistrement "+Math.min(Math.round(t),Math.round(A.duree))+" / "+
        Math.round(A.duree)+" s — gardez cet onglet au premier plan";
      if(t<A.duree+0.5){requestAnimationFrame(image);return;}
      rec.onstop=()=>{
        fin();
        new Blob(morceaux,{type:fmt.type}).arrayBuffer()
          .then(b=>ok({data:new Uint8Array(b),duree:A.duree,ips:images/t}),ko);
      };
      rec.stop();
    };
    requestAnimationFrame(image);
  });
}
function anim3dPage(J){
  return '<!doctype html>\n<html lang="fr"><head><meta charset="utf-8">'+
    '<meta name="viewport" content="width=device-width,initial-scale=1">\n'+
    "<title>"+esc(J.titre)+" — assemblage 3D</title>\n"+
    "<style>html,body{margin:0;height:100%;background:#000;overflow:hidden}"+
    "canvas{display:block;width:100vw;height:100vh;touch-action:none;cursor:grab}"+
    "p{position:fixed;left:14px;bottom:10px;margin:0;color:#8a929b;font:12px system-ui,sans-serif}</style></head>\n"+
    '<body><canvas id="c"></canvas><p>Glisser : tourner · molette : zoom · double-clic : vue de l\'animation</p>\n'+
    "<script>/* three.js r186 — MIT, © three.js authors */\n"+THREE_SOURCE+"<\/script>\n"+
    '<script>"use strict";\nconst J='+JSON.stringify(J).replace(/</g,"\\u003c")+";\n"+
    anim3dLancer.toString()+"\n"+
    'const cv=document.getElementById("c");\n'+
    "const A=anim3dLancer(THREE,J,cv,{largeur:innerWidth,hauteur:innerHeight,dpr:Math.min(2,devicePixelRatio||1),souris:true});\n"+
    'addEventListener("resize",()=>A.poser(innerWidth,innerHeight));\n'+
    "const t0=performance.now(), cycle=A.duree+3;\n"+
    "(function boucle(now){A.rendre(((now-t0)/1000)%cycle);requestAnimationFrame(boucle);})(t0);\n"+
    "<\/script></body></html>\n";
}
/* Les fichiers à joindre au dossier, et une ligne pour la barre d'état. */
async function anim3dFichiers(){
  const J=anim3dDonnees(), THREE=anim3dThree(), fmt=anim3dFormat(), base=fabBase()+"-ASSEMBLAGE-3D";
  const n=await anim3dModeles(J);
  const fichiers=[{name:base+".html",text:anim3dPage(J),kind:"anim3d"}];
  let note="pas de vidéo : ce navigateur n'enregistre pas un canvas (MediaRecorder)";
  if(fmt){
    const v=await anim3dVideo(THREE,J,fmt);
    fichiers.push({name:base+"."+fmt.ext,data:v.data,kind:"anim3d"});   // après la page : le LISEZ-MOI la décrit d'abord
    note="vidéo "+fmt.type+", "+Math.round(v.duree)+" s, rendue à "+Math.round(v.ips)+" images/s";
  }
  note+=", "+n+" / "+J.composants.length+" composant(s) avec leur modèle 3D de la LIB";
  return {fichiers,note};
}
