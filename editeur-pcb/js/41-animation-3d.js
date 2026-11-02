"use strict";
/* ==========================================================================
   Éditeur PCB — animation 3D de la carte qui s'assemble
   --------------------------------------------------------------------------
   Fichier → Animation 3D… : on coche les composants à présenter (les plus gros
   composants actifs le sont d'office), puis deux fichiers partent, à part du
   dossier de fabrication : <projet>-ASSEMBLAGE-3D.mp4 ou .webm (la vidéo) et
   <projet>-ASSEMBLAGE-3D.html (la même animation, orientable, hors ligne).
   Ici, la carte relevée dans la scène J ; la fenêtre, la scène, la vidéo et
   la page sont dans commun/animation-3d.js, que la visionneuse IPC-2581
   partage. Le choix des composants part avec la carte (S.anim3dEtiq, null :
   le choix d'office).
   Un composant dont la LIB a un « Modèle 3D » posé (« Position 3D ») est
   dessiné avec ce modèle ; les autres restent une boîte extrudée de leur corps.
   ========================================================================== */

function anim3dAuto(){
  return anim3dChoixOffice(S.fps.filter(fp=>!fpSansCuivre(fp)).map(fp=>{const b=fpBBox(fp);return {ref:fp.ref,aire:(b.x2-b.x1)*(b.y2-b.y1)};}));
}
function anim3dEtiquetes(){return Array.isArray(S.anim3dEtiq)?S.anim3dEtiq:anim3dAuto();}
function anim3dChoisir(){
  if(typeof document==="undefined")return;
  if(ANIM3D_EN_COURS){hint("Animation 3D : un enregistrement est déjà en cours.");return;}
  if(!S.fps.length&&!S.tracks.length){alert("Rien à animer : la carte est vide.");return;}
  anim3dFenetre(S.fps.map(fp=>({ref:fp.ref,txt:fp.value||fp.partName||""})),anim3dEtiquetes(),anim3dAuto,(ch,office)=>{
    const choix=office?null:ch;                 // le choix d'office suit la carte
    if(JSON.stringify(choix)!==JSON.stringify(Array.isArray(S.anim3dEtiq)?S.anim3dEtiq.slice().sort():null)){push();S.anim3dEtiq=choix;touch();}
    anim3dExporter();
  },{fond:"modal",boite:"box"});
}

/* ---------- les données de la scène ----------
   Repère des Gerber (mm, X à droite, Y vers le haut, Z = 0 sur la face
   dessus), comme le dossier méca dont viennent contour, épaisseur et corps. */
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
/* `sansZone` : sans l'image des zones (l'export STEP en prend le contour) */
function anim3dDonnees(sansZone){
  const o=gOrigin(), P=p=>[anim3dR(p.x-o.x),anim3dR(o.y-p.y)];
  const J=mecaDossier(), ep=J.carte.epaisseur||1.6, der=S.cu-1;
  /* tous les trous qui traversent : NPTH, pastilles percées, vias traversants (marqués 1, que le STEP peut laisser) */
  const trous=[];
  for(const h of trousMonde())if(h.d>0)trous.push(P(h).concat(anim3dR(h.d)));
  for(const fp of S.fps)for(const q of padsWorld(fp))if(q.drill>0)trous.push(P(q).concat(anim3dR(q.drill)));
  for(const v of S.vias)if(v.drill>0&&v.a===0&&v.b===der)trous.push(P(v).concat(anim3dR(v.drill),1));
  const nets=new Map(), numNet=n=>{if(!n)return -1;if(!nets.has(n))nets.set(n,nets.size);return nets.get(n);};
  const cuivre=L=>{
    const pistes=[];
    for(const t of S.tracks){
      if(t.l!==L)continue;
      const A=arcOf(t), n=A?Math.max(2,Math.ceil(Math.abs(A.ca)*A.r/0.5)):1;
      let a=trkAt(t,0);
      for(let k=1;k<=n;k++){const b=trkAt(t,k/n);pistes.push(P(a).concat(P(b),anim3dR(t.w),numNet(t.net)));a=b;}   // [xa,ya,xb,yb,w,net]
    }
    pistes.sort((u,v)=>(u[0]+u[2])-(v[0]+v[2]));               // le cuivre se pose de gauche à droite
    const pads=[];
    for(const fp of S.fps)for(const q of padsWorld(fp))
      if(padLayers(fp,q).includes(L))pads.push(padWorldPts(q).map(P));
    return {pistes,pads,
      vias:S.vias.filter(v=>v.a<=L&&L<=v.b).map(v=>P(v).concat(anim3dR(v.d),anim3dR(v.drill||0))),
      zone:sansZone?null:anim3dZone(L,o)};
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
  const composants=J.composants.filter(c=>c.monte&&c.corps.length>=3&&!(parRef.has(c.ref)&&fpSansCuivre(parRef.get(c.ref)))).map(c=>{   // sans cuivre : pas de boîtier à dresser
    const s=aire(c.corps);
    /* shortcut: sans hauteur (LIB, fichier ou saisie), une boîte à 0,4 × le côté moyen ; la renseigner dans la LIB */
    const h=c.hauteur!=null?c.hauteur:anim3dR(Math.min(3,Math.max(0.3,0.4*Math.sqrt(s))));
    const l=parRef.has(c.ref)?anim3dLigneLib(parRef.get(c.ref)):null;
    const nom=l?String(l["Modèle 3D"]||"").trim().replace(/^Models\//,""):"";
    const m3d=nom&&anim3dPosition(l["Position 3D"])?{nom,pos:l["Position 3D"],x:c.x,y:c.y,rot:c.rot}:null;
    return {ref:c.ref,face:c.face==="dessous"?1:0,corps:c.corps,h,v:s*h,couleur:anim3dTeinte(c.ref,c.boitier),m3d};
  }).sort((a,b)=>a.face-b.face||b.v-a.v);
  const faces=[{cuivre:cuivre(0),seri:seri(0)},
               {cuivre:der>0?cuivre(der):{pistes:[],pads:[],vias:[],zone:null},seri:seri(1)}];
  const B=J.carte.encombrement;
  const R={titre:fabBase(),l:anim3dR(B.x2-B.x1),h:anim3dR(B.y2-B.y1),ep,
    contour:J.carte.contour,decoupes:J.carte.decoupes,trous,finition:anim3dFinition(),
    faces,
    composants:composants.map(c=>Object.assign({ref:c.ref,face:c.face,corps:c.corps,h:c.h,couleur:c.couleur},c.m3d?{m3d:c.m3d}:{}))};
  /* les composants présentés : nom et description de la LIB, nets de leurs pastilles */
  R.vedettes=anim3dVedettes(R,anim3dEtiquetes(),ref=>{
    const fp=parRef.get(ref), l=fp?anim3dLigneLib(fp):null;
    return fp?{nom:l&&l["Part Name"]||fp.value||fp.partName,desc:l&&l.Description,
               nets:padsWorld(fp).map(q=>nets.get(q.net)).filter(n=>n!=null)}:null;
  });
  return R;
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
/* ANIM3D_HAUTS, anim3dPosition et anim3dPose : commun/export-step.js, que le STEP partage. */
/* Fichier → Animation 3D… : les fichiers partent dès la vidéo finie. */
function anim3dExporter(){
  return anim3dEnregistrer(anim3dDonnees,ext=>pcbFile("-ASSEMBLAGE-3D."+ext,"ASSEMBLAGE-3D."+ext),dl,hint);
}
