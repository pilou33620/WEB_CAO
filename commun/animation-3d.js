"use strict";
/* ==========================================================================
   Animation 3D de la carte qui s'assemble — commune à l'éditeur PCB
   (editeur-pcb/js/41-animation-3d.js) et à la visionneuse IPC-2581
   (visionneuse-ipc2581/js/11-animation-3d.js), qui ne font que relever leur
   carte dans la scène J ; tout le reste est ici : la fenêtre des composants
   présentés, leurs étiquettes, les modèles 3D de la LIB, la scène three.js,
   la vidéo et la page HTML.

   J, en mm, repère des Gerber (X à droite, Y vers le haut, Z = 0 sur la face
   dessus) : {titre, l, h, ep, contour, decoupes, trous [[x,y,d]], finition,
   faces [dessus, dessous] : {cuivre:{pistes [[xa,ya,xb,yb,w,net]], pads [[[x,y]…]],
   vias [[x,y,d,perçage]], zone {png,x,y,l,h}|null}, seri:{segs [[xa,ya,xb,yb,w]],
   pts [[x,y,d]], polys [{p,t}]}}, composants [{ref, face, corps, h, couleur, m3d?}],
   vedettes (anim3dVedettes)}.
   ========================================================================== */

let ANIM3D_EN_COURS=false;     // un enregistrement à la fois

function anim3dR(v){return Math.round(v*1000)/1000;}
function anim3dTeinte(ref,pkg){
  if(MECA_CONNECTEUR.test(ref))return 0x9ea3a8;               // plastique de connecteur
  if(/^C\d/i.test(ref))return 0xa8834e;                       // céramique
  if(/^(D|LED)\d/i.test(ref)&&/LED/i.test(pkg))return 0xe6e3d6;
  return 0x1b1c1e;                                            // époxy noir
}

/* ---------- les composants présentés ---------- */
/* La fenêtre : une case par composant. liste [{ref, txt}] ; coches : les repères
   cochés au départ ; auto() : le choix d'office ; ok(repères triés, égal au choix
   d'office) ; o : {fond, boite}, les classes des fenêtres de l'outil. */
function anim3dFenetre(liste,coches,auto,ok,o){
  const C=new Set(coches);
  liste=liste.slice().sort((a,b)=>(C.has(b.ref)-C.has(a.ref))||String(a.ref).localeCompare(String(b.ref),undefined,{numeric:true}));
  const m=document.createElement("div");
  m.className=o.fond;
  m.innerHTML='<div class="'+o.boite+'" style="max-width:460px">'+
    '<h3>🎬 Animation 3D</h3>'+
    '<p style="opacity:.75;font-size:12.5px;margin:6px 0 10px">Composants présentés en gros plan, avec leur nom et la description de la LIB :</p>'+
    '<div style="max-height:50vh;overflow:auto">'+
    liste.map(x=>'<label style="display:flex;align-items:center;gap:8px;padding:3px 0;font-size:12.5px;cursor:pointer">'+
      '<input type="checkbox" data-ref="'+esc(x.ref)+'"'+(C.has(x.ref)?" checked":"")+'> <b>'+esc(x.ref)+'</b> '+
      '<span style="opacity:.7">'+esc(x.txt||"")+'</span></label>').join("")+
    '</div><div style="display:flex;justify-content:space-between;gap:8px;margin-top:14px">'+
    '<span><button class="tb mini" data-act="auto" title="Les 6 plus gros composants actifs">Choix d\'office</button></span>'+
    '<span style="display:flex;gap:8px"><button class="tb" data-act="annuler">Annuler</button>'+
    '<button class="tb on" data-act="go">Enregistrer la vidéo</button></span>'+
    '</div></div>';
  document.body.appendChild(m);
  const cases=[...m.querySelectorAll("input[data-ref]")], bt=k=>m.querySelector('[data-act="'+k+'"]');
  const close=()=>m.remove();
  m.onclick=e=>{if(e.target===m)close();};
  bt("annuler").onclick=close;
  bt("auto").onclick=()=>{const a=new Set(auto());cases.forEach(c=>{c.checked=a.has(c.dataset.ref);});};
  bt("go").onclick=()=>{
    const ch=cases.filter(c=>c.checked).map(c=>c.dataset.ref).sort();
    close();
    ok(ch,ch.join("\n")===auto().slice().sort().join("\n"));
  };
}
/* Le choix d'office : les 6 plus gros composants actifs (ni passifs, ni diodes,
   ni pastilles d'essai, trous, repères, logos, cavaliers). liste [{ref, aire}] */
const ANIM3D_PASSIF=/^(R|C|L|FB|D|LED|TP|H|MH|FID|LOGO|JP)\d/i;
function anim3dChoixOffice(liste){
  return liste.filter(x=>!ANIM3D_PASSIF.test(x.ref)).sort((a,b)=>b.aire-a.aire).slice(0,6).map(x=>x.ref);
}
/* Les composants présentés, pris dans J.composants. info(ref) rend {nom, desc, nets} :
   nets, ceux de ses pastilles, numérotés comme les pistes de J. Ne s'allument que
   les nets qui ont des pistes, sauf masse et alimentations. */
function anim3dVedettes(J,choisis,info){
  const avecPiste=new Set(J.faces.flatMap(F=>F.cuivre.pistes.map(p=>p[5])));
  const I=new Map(J.composants.map(c=>[c.ref,info(c.ref)||{}])), parNet=new Map();
  for(const x of I.values())for(const n of new Set(x.nets||[]))parNet.set(n,(parNet.get(n)||0)+1);
  /* shortcut: un net qui touche plus de 30 % des composants (au moins 4) passe pour une alimentation et ne s'allume pas ; les reconnaître par leur classe si ça trompe */
  const seuil=Math.max(4,0.3*I.size), C=new Set(choisis), r=v=>Math.round(v*1000)/1000;
  const court=s=>{s=String(s||"").trim();return s.length>44?s.slice(0,43)+"…":s;};
  return J.composants.filter(c=>C.has(c.ref)).map(c=>{
    const x=I.get(c.ref), xs=c.corps.map(p=>p[0]), ys=c.corps.map(p=>p[1]);
    return {ref:c.ref,nom:court(x.nom),desc:court(x.desc),
      x:r((Math.min(...xs)+Math.max(...xs))/2),y:r((Math.min(...ys)+Math.max(...ys))/2),
      taille:r(Math.max(Math.max(...xs)-Math.min(...xs),Math.max(...ys)-Math.min(...ys))),face:c.face,h:c.h,
      nets:[...new Set(x.nets||[])].filter(n=>avecPiste.has(n)&&parNet.get(n)<=seuil)};
  });
}

/* ---------- les modèles 3D de la LIB ----------
   « Modèle 3D » nomme un STEP de LIB/Models ; son maillage (Models/maillages,
   fait par python/maillages_3d.mjs) vient par /api/lib/fichier?type=modele3d.
   ANIM3D_HAUTS, anim3dPosition et anim3dPose : commun/export-step.js. */
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
  /* traits à bouts ronds ; `fins` : le nombre d'indices posés après chaque trait.
     `k` élargit les traits ; `dist(x,y,seg)` donne à chaque sommet l'attribut `d` des lueurs. */
  function rubans(segs,z,k,dist){
    const pos=[],idx=[],fins=[],ds=[],N=8;
    for(const s of segs){
      const [xa,ya,xb,yb]=s, r=s[4]*(k||1)/2, L=Math.hypot(xb-xa,yb-ya)||1, nx=-(yb-ya)/L*r, ny=(xb-xa)/L*r;
      const b0=pos.length;
      let b=pos.length/3;
      pos.push(xa+nx,ya+ny,z, xb+nx,yb+ny,z, xb-nx,yb-ny,z, xa-nx,ya-ny,z);
      idx.push(b,b+1,b+2, b,b+2,b+3);
      for(const [cx,cy] of [[xa,ya],[xb,yb]]){
        b=pos.length/3;pos.push(cx,cy,z);
        for(let k=0;k<N;k++){const a=k*2*Math.PI/N;pos.push(cx+r*Math.cos(a),cy+r*Math.sin(a),z);}
        for(let k=0;k<N;k++)idx.push(b,b+1+k,b+1+(k+1)%N);
      }
      if(dist)for(let i=b0;i<pos.length;i+=3)ds.push(dist(pos[i],pos[i+1],s));
      fins.push(idx.length);
    }
    const geo=plat(pos,idx);
    if(dist)geo.setAttribute("d",new THREE.Float32BufferAttribute(ds,1));
    return {geo,fins};
  }
  /* une lueur cyan sur des pistes : une onde part de là où `dist` vaut 0, à 24 mm/s,
     toutes les `per` mm ; `fond` : la part allumée en permanence. Un cœur et un halo
     trois fois plus large. Rend allume(t, a) : t en s depuis le départ, a l'intensité. */
  function lueur(segs,z,dist,fond,per){
    if(!segs.length)return ()=>{};
    const ms=[1,3].map(k=>{
      const m=new THREE.ShaderMaterial({uniforms:{t:{value:0},a:{value:0},fond:{value:fond},per:{value:per}},
        vertexShader:"attribute float d;varying float vd;void main(){vd=d;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}",
        fragmentShader:"uniform float t,a,fond,per;varying float vd;void main(){float q=fract((t*24.0-vd)/per);"+
          "gl_FragColor=vec4(vec3(0.45,1.0,0.95)*a*(fond+(1.0-fond)*exp(-6.0*q)),1.0);}",
        transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,side:THREE.DoubleSide});
      poser_(rubans(segs,z,k,dist).geo,m,6);
      return m;
    });
    return (t,a)=>{ms.forEach((m,i)=>{m.visible=a>0.001;m.uniforms.t.value=t;m.uniforms.a.value=i?a*0.3:a;});};
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
  const tPose=(nB?t0B+nB*pas:t0D+nD*pas)+chute+0.4;              // carte assemblée
  /* les gros plans : PL s par composant présenté, dont TR de trajet, puis le retour et le tour */
  const V=J.vedettes||[], PL=3.4, TR=1.0, tTour=V.length?tPose+V.length*PL+1.2:tPose, duree=tTour+8;
  const debut=i=>tPose+i*PL;
  const rayon=Math.max(0.5*Math.hypot(x2-x1,y2-y1),ep/2+hmax);

  /* les lueurs : des impulsions sur toutes les pistes (chaque net à son heure), et
     les nets de chaque composant présenté, allumés depuis lui */
  const cx=(x1+x2)/2, cy=(y1+y2)/2, zL=f=>f?-ep-0.033:0.033;
  const partout=J.faces.map((F,f)=>lueur(F.cuivre.pistes,zL(f),(x,y,s)=>Math.hypot(x-cx,y-cy)+((s[5]+1)*0.618%1)*90,0,90));
  const allume=V.map(v=>{const ns=new Set(v.nets);
    return J.faces.map((F,f)=>lueur(F.cuivre.pistes.filter(s=>ns.has(s[5])),zL(f),(x,y)=>Math.hypot(x-v.x,y-v.y),0.5,30));});

  /* caméra : clés (instant, valeur), lissées entre deux clés */
  const lisse=u=>u*u*(3-2*u);
  const cle=(K,t)=>{
    if(t<=K[0][0])return K[0][1];
    for(let i=1;i<K.length;i++)if(t<=K[i][0]){const [ta,a]=K[i-1],[tb,b]=K[i];return a+(b-a)*lisse((t-ta)/((tb-ta)||1));}
    return K[K.length-1][1];
  };
  /* pendant les gros plans : la valeur f(v) tenue sur le composant, puis `fin` au retour */
  const visite=(f,fin)=>V.flatMap((v,i)=>[[debut(i)+TR,f(v)],[debut(i+1),f(v)]]).concat(V.length?[[tTour,fin]]:[]);
  const EL=[[0,1.05],[t0D,0.8]].concat(nB?[[t0B-1.4,0.8],[t0B,-0.8],[tPose,-0.8]]:[[tPose,0.7]],
    visite(v=>v.face?-0.8:0.85,0.62),[[duree,0.55]]);
  const az0=-1.2, azT=az0+0.05*tPose, azR=azT+0.1*(tTour-tPose);
  const AZ=[[0,az0],[tPose,azT]].concat(V.length?[[tTour,azR]]:[],[[duree,azR+2*Math.PI]]);
  const DI=[[0,1.5],[3,1.05],[tPose,0.95]].concat(visite(v=>Math.max(0.42,Math.min(0.75,1.8*v.taille/rayon)),0.95),[[duree,0.95]]);
  /* le point visé : le centre de la carte, ou le milieu du composant présenté */
  const haut=(v,k)=>v.face?-ep/2-0.045-k*v.h:ep/2+0.045+k*v.h;
  const cible=v=>[v.x+carte.position.x,v.y+carte.position.y,haut(v,0.5)];
  const CI=[0,1,2].map(k=>[[tPose,0]].concat(visite(v=>cible(v)[k],0)));
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
  /* les étiquettes des composants présentés : un point sur le composant, un trait
     jusqu'au cartouche (nom, repère, description), à gauche ou à droite selon le
     côté de la carte où il est. vis : [[vedette, opacité]] */
  const lc=document.createElement("canvas");
  const lm=new THREE.Mesh(new THREE.PlaneGeometry(1,1),new THREE.MeshBasicMaterial({transparent:true,depthTest:false}));
  lm.renderOrder=1;hud.add(lm);
  function legendes(vis){
    const g=lc.getContext("2d"), W=lc.width, H=lc.height, s=H/720, bh=64*s, m=30*s;
    g.clearRect(0,0,W,H);
    lm.visible=vis.length>0;
    if(!vis.length)return;
    const P=vis.map(([v,a])=>{
      const p=new THREE.Vector3(v.x+carte.position.x,v.y+carte.position.y,haut(v,1)).project(camera);
      return {v,a,x:(p.x+1)/2*W,y:(1-p.y)/2*H,gauche:v.x<cx};
    });
    for(const cote of [true,false]){            // empilés sous le bandeau, sans se chevaucher
      let y=hc.height+12*s;
      for(const p of P.filter(p=>p.gauche===cote).sort((a,b)=>a.y-b.y)){p.ly=Math.min(H-bh-m,Math.max(y,p.y-bh/2));y=p.ly+bh+10*s;}
    }
    const F=(n,gras)=>(gras?"600 ":"")+Math.round(n*s)+"px system-ui,sans-serif";
    for(const p of P){
      const nom=p.v.nom||p.v.ref;
      g.globalAlpha=p.a;
      g.font=F(24,1);const wn=g.measureText(nom).width;
      g.font=F(14);const wr=p.v.nom?g.measureText(p.v.ref).width+10*s:0;
      g.font=F(17);const wd=g.measureText(p.v.desc).width;
      const bw=Math.max(wn+wr,wd)+28*s, bx=p.gauche?m:W-m-bw, ax=p.gauche?bx+bw:bx;
      g.fillStyle="rgba(0,0,0,0.55)";g.fillRect(bx,p.ly,bw,bh);
      g.fillStyle="#d8dde3";g.fillRect(bx,p.ly+6*s,2*s,bh-12*s);
      g.strokeStyle="rgba(216,221,227,0.8)";g.lineWidth=1.2*s;
      g.beginPath();g.moveTo(ax,p.ly+bh/2);g.lineTo(p.x,p.y);g.stroke();
      g.fillStyle="#7ff5e8";g.beginPath();g.arc(p.x,p.y,3.5*s,0,2*Math.PI);g.fill();
      g.textAlign="left";g.textBaseline="alphabetic";
      const tx=bx+14*s, y1=p.ly+(p.v.desc?28:40)*s;
      g.fillStyle="#fff";g.font=F(24,1);g.fillText(nom,tx,y1);
      if(p.v.nom){g.fillStyle="#8a929b";g.font=F(14);g.fillText(p.v.ref,tx+wn+10*s,y1);}
      if(p.v.desc){g.fillStyle="#9aa3ad";g.font=F(17);g.fillText(p.v.desc,tx,p.ly+52*s);}
    }
    g.globalAlpha=1;
    lm.material.map.needsUpdate=true;
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
    lc.width=l;lc.height=h;
    lm.scale.set(l,h,1);lm.position.set(l/2,h/2,0);
    if(lm.material.map)lm.material.map.dispose();
    lm.material.map=new THREE.CanvasTexture(lc);
    lm.material.map.colorSpace=THREE.SRGBColorSpace;
    lm.material.needsUpdate=true;
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
    const [cX,cY,cZ]=CI.map(K=>cle(K,t));
    camera.position.set(cX+d*Math.cos(el)*Math.cos(az),cY+d*Math.cos(el)*Math.sin(az),cZ+d*Math.sin(el));
    camera.lookAt(cX,cY,cZ);
    camera.updateMatrixWorld();
    l1.position.copy(camera.position).add(new THREE.Vector3(0,0,dist));
    for(const f of partout)f(t,0.4*lisse(e(tPose,tPose+1)));
    const vis=[], tour=lisse(e(tTour,tTour+1));
    V.forEach((v,i)=>{
      const a0=debut(i)+TR*0.6, plan=lisse(e(a0,debut(i)+TR+0.3))*(1-lisse(e(debut(i+1)-0.3,debut(i+1)+0.3)));
      for(const f of allume[i])f(t>=debut(i+1)?t-tTour:t-a0,Math.max(plan,0.6*tour));
      const a=Math.max(plan,lisse(e(tTour+0.3,tTour+1.3)))*Math.min(1,Math.max(0,(v.face?-el:el)*4));   // la face tournée vers la caméra
      if(a>0.01)vis.push([v,a]);
    });
    bandeau(t<1.2?"Carte nue":t<4.2?"Cuivre":t<t0D?"Vernis et sérigraphie":
            t<(nB?t0B-1.4:tPose)?"Composants — dessus":t<tPose?"Composants — dessous":
            t<tTour?"Composants principaux":"Carte assemblée");
    legendes(vis);
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
/* Les fichiers : la vidéo si le navigateur sait l'enregistrer, et la page. */
async function anim3dFichiers(J){
  const THREE=anim3dThree(), fmt=anim3dFormat();
  const n=await anim3dModeles(J);
  const fichiers=[{ext:"html",blob:new Blob([anim3dPage(J)],{type:"text/html"})}];
  let note="pas de vidéo : ce navigateur n'enregistre pas un canvas (MediaRecorder)";
  if(fmt){
    const v=await anim3dVideo(THREE,J,fmt);
    fichiers.unshift({ext:fmt.ext,blob:new Blob([v.data],{type:fmt.type})});
    note="vidéo "+fmt.type+", "+Math.round(v.duree)+" s, rendue à "+Math.round(v.ips)+" images/s";
  }
  note+=", "+J.vedettes.length+" composant(s) présenté(s), "+n+" / "+J.composants.length+" avec leur modèle 3D de la LIB";
  return {fichiers,note};
}
/* Joue, enregistre et télécharge. donnees() : la scène J ; nom(ext) : le nom d'un
   fichier ; dl(blob, nom) et hint(texte) : ceux de l'outil. Un second appel
   pendant l'enregistrement ne relance rien. */
function anim3dEnregistrer(donnees,nom,dl,hint){
  if(ANIM3D_EN_COURS){hint("Animation 3D : un enregistrement est déjà en cours.");return Promise.resolve(null);}
  ANIM3D_EN_COURS=true;
  return Promise.resolve().then(()=>anim3dFichiers(donnees())).then(r=>{
    const noms=r.fichiers.map(f=>{const n=nom(f.ext);dl(f.blob,n);return n;});
    hint("Animation 3D enregistrée : "+noms.join(" et ")+" — "+r.note+".");
    return r;
  },e=>{alert("Animation 3D impossible : "+(e&&e.message||e));return null;})
  .finally(()=>{ANIM3D_EN_COURS=false;});
}
