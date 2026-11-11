/* ==========================================================================
   47-zones.js — les réglages d'une zone de cuivre, à la manière d'Altium
   --------------------------------------------------------------------------
   Chaque zone peut porter, en plus de sa couche, de son net et de sa priorité :
   - `isol`      : son isolement propre (mm), au moins celui des classes
                   (`clrZone`, 01-core.js) ;
   - `brasNb`, `brasLarg`, `brasEcart`, `brasAngle` : les bras thermiques de
                   toutes ses pastilles, qu'une pastille peut encore imposer ;
   - `hachure`   : {pas, larg} — un quadrillage au lieu du plein ;
   - `plein`     : une RÉGION PLEINE (ou un fill) — son cuivre exact, que rien
                   ne dégage ; le DRC signale l'autre cuivre qui la touche ;
   - `ilotMin`   : l'aire (mm²) sous laquelle un îlot tombe même relié ;
   - `mortGarde` : garder le cuivre mort au lieu de le retirer ;
   - `nom`       : le nom montré par le gestionnaire de zones.
   Écran, Gerber, IPC-2581, simulation et îlots lisent ces champs.
   ========================================================================== */

/* ---------- lecture d'un fichier (appelée par normZone) ---------- */
function zoneReglagesLire(z,out){
  const n=(v,a,b)=>{v=+v;return Number.isFinite(v)&&v>0?r4(clamp(v,a,b)):0;};
  const isol=n(z.isol,0.01,50);if(isol)out.isol=isol;
  if(z.plein)out.plein=true;
  if(z.mortGarde)out.mortGarde=true;
  const im=n(z.ilotMin,1e-4,1e6);if(im)out.ilotMin=im;
  if(z.nom)out.nom=dStr(z.nom,60);
  const bn=Math.round(+z.brasNb);if(bn>=1&&bn<=8)out.brasNb=bn;
  const bl=n(z.brasLarg,0.05,10);if(bl)out.brasLarg=bl;
  const be=n(z.brasEcart,0.01,10);if(be)out.brasEcart=be;
  if(Number.isFinite(+z.brasAngle)&&+z.brasAngle)out.brasAngle=padRot(+z.brasAngle);
  const h=z.hachure;
  if(h&&typeof h==="object"){
    const pas=n(h.pas,0.2,20);
    if(pas){
      out.hachure={pas,larg:r4(clamp(+h.larg||0.25,0.05,pas-0.05))};
      const an=((Math.round(+h.angle||0)%180)+180)%180;
      if(an)out.hachure.angle=an;
    }
  }
}

/* ---------- hachures ---------- */
/* Les mailles d'une zone hachurée, en carrés à retirer : la grille part de
   l'origine (deux zones voisines s'alignent), chaque maille entière dans la
   zone à une largeur de trait au moins de son bord — le cadre reste plein,
   comme dans Altium. Une maille sous un autre cuivre plus prioritaire n'est pas
   creusée : elle ne toucherait pas la bonne zone.
   La grille tourne de `hachure.angle` (0° ou 45° comme Altium, ou tout autre
   angle). Une maille n'est creusée que si son cadre, élargi d'une largeur de
   trait, tient entier dans la zone : ses coins dedans, et aucune arête de la
   zone ni de ses trous qui le traverse — une zone concave garde son bord. */
const HACH_MEMO={ver:-1,m:new Map()}, HACH_MAX=200000;
function zoneHachures(z,l){
  if(!z||!z.hachure||z.plein||z.l!==l||z.pts.length<3)return [];
  if(HACH_MEMO.ver!==S.ver){HACH_MEMO.ver=S.ver;HACH_MEMO.m.clear();}
  const vu=HACH_MEMO.m.get(z);
  if(vu)return vu;
  const {pas,larg}=z.hachure, c=pas-larg, out=[];
  const an=(z.hachure.angle||0)*Math.PI/180, ux=Math.cos(an), uy=Math.sin(an);
  const W=(s,t)=>({x:r4(s*ux-t*uy),y:r4(s*uy+t*ux)});          // repère de la grille → carte
  const loc=p=>({s:p.x*ux+p.y*uy,t:-p.x*uy+p.y*ux});            // carte → repère de la grille
  const L=z.pts.map(loc);
  const s0=Math.min(...L.map(p=>p.s)), s1=Math.max(...L.map(p=>p.s));
  const t0=Math.min(...L.map(p=>p.t)), t1=Math.max(...L.map(p=>p.t));
  // les arêtes de la zone et de ses trous, avec leur boîte, pour le test du cadre
  const aretes=[];
  for(const R of [z.pts].concat(Array.isArray(z.trous)?z.trous:[]))
    for(let k=0;k<R.length;k++){const a=R[k], b=R[(k+1)%R.length];
      aretes.push({x1:a.x,y1:a.y,x2:b.x,y2:b.y,bx1:Math.min(a.x,b.x),by1:Math.min(a.y,b.y),bx2:Math.max(a.x,b.x),by2:Math.max(a.y,b.y)});}
  const cadreLibre=E=>{
    const b=polyBBox(E);
    for(const e of aretes){
      if(e.bx2<b.x1||e.bx1>b.x2||e.by2<b.y1||e.by1>b.y2)continue;
      if(inPoly(e.x1,e.y1,E)||inPoly(e.x2,e.y2,E))return false;
      for(let k=0;k<4;k++){const p=E[k], q=E[(k+1)%4];if(segCross(e,{x1:p.x,y1:p.y,x2:q.x,y2:q.y}))return false;}
    }
    return true;
  };
  const n=((s1-s0)/pas+1)*((t1-t0)/pas+1);
  if(n<=HACH_MAX)
    for(let gs=Math.floor(s0/pas)*pas;gs<s1;gs+=pas)
      for(let gt=Math.floor(t0/pas)*pas;gt<t1;gt+=pas){
        const a=gs+larg/2, b=gt+larg/2;
        const P=[W(a,b),W(a+c,b),W(a+c,b+c),W(a,b+c)];
        const E=[W(a-larg,b-larg),W(a+c+larg,b-larg),W(a+c+larg,b+c+larg),W(a-larg,b+c+larg)];
        if(!E.every(p=>zoneContient(z,p.x,p.y))||!cadreLibre(E))continue;
        const m=W(a+c/2,b+c/2);
        if(zoneAt(l,m.x,m.y)!==z)continue;
        out.push(P);
      }
  HACH_MEMO.m.set(z,out);
  return out;
}
/* Un contour et ses trous en UN seul contour, chaque trou rattaché par une
   coupure aller-retour au sommet le plus proche (le « cut-in » que la norme
   Gerber admet) : le contour extérieur dans un sens, les trous dans l'autre. */
function contourTroue(O,T){
  let R=O.slice();if(signedArea(R)<0)R.reverse();
  for(const H0 of T){
    const H=H0.slice();if(signedArea(H)>0)H.reverse();
    let bi=0,bj=0,bd=Infinity;
    for(let i=0;i<R.length;i++)for(let j=0;j<H.length;j++){
      const d=(R[i].x-H[j].x)**2+(R[i].y-H[j].y)**2;if(d<bd){bd=d;bi=i;bj=j;}}
    R=R.slice(0,bi+1).concat(H.slice(bj),H.slice(0,bj+1),R.slice(bi));
  }
  return R;
}
/* creuse les mailles dans un canevas de zones (écran, masque des îlots) */
function zonesHachurer(c,zs,l){
  const L=[];
  for(const z of zs)for(const P of zoneHachures(z,l))L.push(P);
  if(!L.length)return;
  c.save();c.globalCompositeOperation="destination-out";c.beginPath();
  for(const P of L){c.moveTo(P[0].x,P[0].y);for(let k=1;k<P.length;k++)c.lineTo(P[k].x,P[k].y);c.closePath();}
  c.fill();c.restore();
}

/* ---------- région pleine ---------- */
/* Repeint les régions pleines par-dessus les dégagements, rognées au contour
   comme le reste du cuivre. `clipToBoard` laisse le canevas en gomme : on le
   remet en peinture pour les bras qui suivent. */
function zonesPleinesPeindre(c,zs,x1,y1,x2,y2){
  if(!zs.some(z=>z.plein))return;
  c.globalCompositeOperation="source-over";
  for(const z of zs)if(z.plein)zoneFill(c,z);
  clipToBoard(c,x1,y1,x2,y2);
  c.globalCompositeOperation="source-over";
}
/* DRC : rien ne dégage une région pleine, c'est donc au contrôle de dire
   quand le cuivre d'un autre net la touche ou passe sous l'isolement. */
function zonesDrc(out){
  for(const z of S.zones){
    if(!z.plein||z.pts.length<3)continue;
    const l=z.l, net=z.net||"", P=z.pts;
    const nom="Région pleine "+(net||"sans net")+" sur "+cuId(l,S.cu);
    const autre=n=>!net||(n||"")!==net;
    const dPt=(x,y)=>zoneContient(z,x,y)?0:polyEdgeDist(x,y,P);
    const dSeg1=s=>{
      if(zoneContient(z,s.x1,s.y1)||zoneContient(z,s.x2,s.y2))return 0;
      let d=1e9;
      for(let k=0;k<P.length;k++){const a=P[k], b=P[(k+1)%P.length];
        d=Math.min(d,segSegDist(s,{x1:a.x,y1:a.y,x2:b.x,y2:b.y}));}
      return d;
    };
    const dSeg=t=>Math.min(...trkSegs(t).map(dSeg1));   // un arc : ses cordes (trkSegs, 01-core.js)
    /* la pastille contre la région : 0 si elle y entre, sinon la plus courte
       distance de son contour au bord de la région (arêtes parcourues au 1/20 mm) */
    const dPad=q=>{
      const qc=padSurCouche(q,l)||q, R=Math.max(qc.w,qc.h)/2+5;
      if(zoneContient(z,q.x,q.y)||P.some(p=>padDist(p.x,p.y,qc)<=0))return 0;
      let d=1e9;
      for(let k=0;k<P.length;k++){
        const a=P[k], b=P[(k+1)%P.length];
        if(segDist(q.x,q.y,a.x,a.y,b.x,b.y)>R)continue;
        const n=Math.min(2000,Math.ceil(dist(a.x,a.y,b.x,b.y)/0.05));
        for(let j=0;j<=n;j++)d=Math.min(d,padDist(a.x+(b.x-a.x)*j/n,a.y+(b.y-a.y)*j/n,qc));
      }
      return Math.max(0,d);
    };
    // `d` : la distance du bord du cuivre à la région ; `e` : l'isolement exigé
    const juger=(d,e,x,y,quoi)=>{if(d-e<-1e-6)out.push({x:r3(x),y:r3(y),l,
      msg:nom+" : "+quoi+(d<=1e-6?" la touche — rien ne dégage une région pleine"
                                 :" à "+fmt(d,3)+" mm, sous l'isolement de "+fmt(e,3)+" mm")});};
    for(const t of S.tracks){
      if(t.l!==l||!autre(t.net))continue;
      const m=trkMid(t);juger(Math.max(0,dSeg(t)-t.w/2),clrZone(z,t.net,"cu","trk"),m.x,m.y,"la piste "+(t.net||"sans net"));
    }
    for(const v of S.vias){
      if(l<v.a||l>v.b||!autre(v.net))continue;
      juger(Math.max(0,dPt(v.x,v.y)-v.d/2),clrZone(z,v.net,"cu","via"),v.x,v.y,"le via "+(v.net||"sans net"));
    }
    for(const fp of S.fps)
      for(const q of padsWorld(fp)){
        if(!padLayers(fp,q).includes(l)||!padSurCouche(q,l)||!autre(q.net))continue;
        juger(dPad(q),clrZone(z,q.net,"cu",q.drill>0?"th":"smd",q),q.x,q.y,
              "la pastille "+fp.ref+"."+q.n+" ("+(q.net||"sans net")+")");
      }
  }
}

/* ---------- îlots ---------- */
/* les îlots du masque M sous l'aire minimale des zones du groupe */
function zoneIlotsPetits(M,zs){
  const min=Math.max(0,...zs.map(z=>z.ilotMin||0)), out=new Set();
  if(!M||!(min>0))return out;
  for(const m of ilotsMorts(M,new Set()))if(m.aire<min)out.add(m.lb);
  return out;
}

/* ---------- l'outil : région pleine, fill, plan divisé ---------- */
/* ce que l'outil Zone doit poser à la prochaine fermeture */
function zoneNouvelle(z){
  const o=S.zoneSuivante;
  S.zoneSuivante=null;
  if(!o)return;
  if(o.plein)z.plein=true;
  if(o.divise)z.priorite=Math.max(0,...S.zones.filter(x=>x.l===z.l&&!x.larme).map(zonePrio))+1;
}
function zoneOutil(o){
  setMode("zone");
  S.zoneSuivante=o;
  hint(o.divise
    ? "Plan divisé : tracez la partie du plan à donner à un autre net (un clic par sommet, ou deux coins puis Entrée). "+
      "Elle passe devant le plan, isolement compris."
    : o.rect
      ? "Fill : deux coins puis Entrée — un rectangle de cuivre plein, que rien ne dégage."
      : "Région pleine : un clic par sommet, Entrée pour fermer — son cuivre est exact, rien ne la dégage ; le DRC surveille l'autre cuivre.");
}

/* ---------- panneau Propriétés d'une zone ---------- */
function zoneReglagesProps(box,z){
  if(!box||!box.insertAdjacentHTML)return;
  const v=x=>x!=null&&x!==0?String(x):"";
  const remp=z.plein?"region":z.hachure?"hach":"";
  box.insertAdjacentHTML("beforeend",
    '<div class="prop"><label>Nom</label><input id="zNom" maxlength="60" value="'+esc(z.nom||"")+'" placeholder="'+esc((z.net||"zone")+" "+cuId(z.l,S.cu))+'"></div>'+
    '<div class="prop"><label>Remplissage</label><select id="zRemp">'+
      [["","plein"],["hach","hachuré"],["region","région pleine (sans dégagement)"]].map(([k,t])=>
        '<option value="'+k+'"'+(k===remp?" selected":"")+'>'+t+'</option>').join("")+'</select></div>'+
    (z.hachure?'<div class="prop two"><div><label>Pas des hachures (mm)</label><input id="zHp" type="number" step="0.1" min="0.2" value="'+z.hachure.pas+'"></div>'+
      '<div><label>Largeur des traits (mm)</label><input id="zHl" type="number" step="0.05" min="0.05" value="'+z.hachure.larg+'"></div></div>'+
      '<div class="prop"><label>Angle des hachures (°)</label><input id="zHa" type="number" step="45" min="0" max="179" value="'+(z.hachure.angle||0)+'"></div>':"")+
    '<div class="prop"><label>Isolement propre (mm)</label><input id="zIsol" type="number" step="0.01" min="0" value="'+v(z.isol)+'" placeholder="celui des classes ('+fmt(clrK(z.net||"","","cu","trk"),2)+')" '+
      'title="Écart minimal autour du cuivre des autres nets dans cette zone ; jamais moins que les classes"></div>'+
    '<div class="prop two"><div><label>Bras thermiques</label><input id="zBn" type="number" min="1" max="8" step="1" value="'+v(z.brasNb)+'" placeholder="4"></div>'+
      '<div><label>Largeur des bras (mm)</label><input id="zBl" type="number" step="0.05" min="0" value="'+v(z.brasLarg)+'" placeholder="'+fmt(S.rule.thermal,2)+'"></div></div>'+
    '<div class="prop two"><div><label>Écart des bras (mm)</label><input id="zBe" type="number" step="0.05" min="0" value="'+v(z.brasEcart)+'" placeholder="classe"></div>'+
      '<div><label>Angle des bras (°)</label><input id="zBa" type="number" step="45" value="'+v(z.brasAngle)+'" placeholder="0"></div></div>'+
    '<div class="prop two"><div><label>Îlots : aire min (mm²)</label><input id="zIm" type="number" step="0.1" min="0" value="'+v(z.ilotMin)+'" placeholder="aucune"></div>'+
      '<div><label><input id="zMort" type="checkbox"'+(z.mortGarde?" checked":"")+'> Garder le cuivre mort</label></div></div>');
  const maj=f=>()=>{push();f();touch();refreshPanels();draw();};
  const num=id=>{const x=parseFloat(String($(id).value).replace(",","."));return Number.isFinite(x)&&x>0?x:0;};
  const champ=(id,cle,a,b,rond)=>{const e=$(id);if(e)e.onchange=maj(()=>{
    let x=num(id);if(x&&rond)x=Math.round(x);
    if(x)z[cle]=r4(clamp(x,a,b));else delete z[cle];});};
  champ("zIsol","isol",0.01,50);
  champ("zBn","brasNb",1,8,true);
  champ("zBl","brasLarg",0.05,10);
  champ("zBe","brasEcart",0.01,10);
  champ("zIm","ilotMin",1e-4,1e6);
  const ba=$("zBa");if(ba)ba.onchange=maj(()=>{const x=parseFloat(ba.value);if(Number.isFinite(x)&&x)z.brasAngle=padRot(x);else delete z.brasAngle;});
  const nm=$("zNom");if(nm)nm.onchange=maj(()=>{const t=String(nm.value).trim().slice(0,60);if(t)z.nom=t;else delete z.nom;});
  const mo=$("zMort");if(mo)mo.onchange=maj(()=>{if(mo.checked)z.mortGarde=true;else delete z.mortGarde;});
  const rp=$("zRemp");if(rp)rp.onchange=maj(()=>{
    delete z.plein;
    if(rp.value==="hach"){if(!z.hachure)z.hachure={pas:1,larg:0.25};}else delete z.hachure;
    if(rp.value==="region")z.plein=true;});
  const hachure=()=>{const pas=clamp(num("zHp")||1,0.2,20);z.hachure={pas:r4(pas),larg:r4(clamp(num("zHl")||0.25,0.05,pas-0.05))};
    const an=((Math.round(parseFloat($("zHa").value)||0)%180)+180)%180;if(an)z.hachure.angle=an;};
  for(const id of ["zHp","zHl","zHa"]){const e=$(id);if(e)e.onchange=maj(hachure);}
}

/* ---------- gestionnaire de zones ---------- */
function zoneNom(z){return z.nom||((z.net||"sans net")+" · "+cuId(z.l,S.cu));}
function zoneAire(z){return Math.abs(signedArea(z.pts));}
/* monte (sens > 0) ou descend la zone dans l'ordre de remplissage de sa couche */
function zonePrioDecaler(z,sens){
  push();
  z.priorite=Math.max(0,zonePrio(z)+(sens>0?1:-1));
  if(!z.priorite)delete z.priorite;
  touch();refreshPanels();draw();
}
function zonesToutRecalculer(){
  if(typeof zoneCache!=="undefined"&&zoneCache.clear)zoneCache.clear();
  touch();conn(true);refreshPanels();draw();
  hint("Zones recalculées : remplissage, dégagements, îlots.");
}
function zonesGestionnaire(){
  const old=document.getElementById("zgDlg");if(old){old.close&&old.close();old.remove();}
  const d=document.createElement("dialog");
  d.id="zgDlg";d.className="ed-dlg zg-dlg";
  const rendre=()=>{
    const zs=S.zones.filter(z=>!z.larme).slice()
      .sort((a,b)=>a.l-b.l||zonePrio(b)-zonePrio(a));
    d.innerHTML='<div class="mtitle">Gestionnaire de zones · '+zs.length+' zone(s)</div>'+
      '<div class="zg-liste"><table><tr><th>Nom</th><th>Couche</th><th>Net</th><th>Ordre</th><th>Remplissage</th><th>mm²</th><th></th></tr>'+
      zs.map((z,k)=>'<tr data-k="'+k+'"'+(S.sel.zones.has(z)?' class="on"':'')+'>'+
        '<td><input data-a="nom" value="'+esc(z.nom||"")+'" placeholder="'+esc(zoneNom(z))+'"></td>'+
        '<td>'+esc(cuId(z.l,S.cu))+'</td><td>'+esc(z.net||"—")+'</td>'+
        '<td>'+zonePrio(z)+' <button class="tb" data-a="haut" title="Remplie avant les autres de la couche">▲</button><button class="tb" data-a="bas">▼</button></td>'+
        '<td>'+(z.plein?"région pleine":z.hachure?"hachuré "+z.hachure.pas+" mm"+(z.hachure.angle?" à "+z.hachure.angle+"°":""):"plein")+(z.locked?" 🔒":"")+'</td>'+
        '<td>'+fmt(zoneAire(z),1)+'</td>'+
        '<td><button class="tb" data-a="voir">Sélectionner</button></td></tr>').join("")+
      '</table></div>'+
      '<div class="row"><button class="tb" id="zgCalc">Tout recalculer</button><button class="tb" id="zgFin">Fermer</button></div>';
    for(const tr of d.querySelectorAll("tr[data-k]")){
      const z=zs[+tr.dataset.k];
      tr.querySelector('[data-a="haut"]').onclick=()=>{zonePrioDecaler(z,1);rendre();};
      tr.querySelector('[data-a="bas"]').onclick=()=>{zonePrioDecaler(z,-1);rendre();};
      tr.querySelector('[data-a="voir"]').onclick=()=>{clearSel();S.sel.zones.add(z);S.active=z.l;
        buildLayers();refreshPanels();draw();rendre();};
      const nm=tr.querySelector('[data-a="nom"]');
      nm.onchange=()=>{push();const t=String(nm.value).trim().slice(0,60);if(t)z.nom=t;else delete z.nom;touch();refreshPanels();};
    }
    d.querySelector("#zgCalc").onclick=zonesToutRecalculer;
    d.querySelector("#zgFin").onclick=()=>{d.close();d.remove();};
  };
  d.addEventListener("cancel",e=>{e.preventDefault();d.close();d.remove();});
  document.body.appendChild(d);
  rendre();
  d.showModal();
}

/* ---------- branchement ---------- */
(function(){
  const on=(id,f)=>{const b=$(id);if(b)b.onclick=f;};
  on("mRegion",()=>zoneOutil({plein:true}));
  on("mFill",()=>zoneOutil({plein:true,rect:true}));
  on("bPlanDivise",()=>zoneOutil({divise:true}));
  on("bZonesGest",zonesGestionnaire);
  on("bZonesCalc",zonesToutRecalculer);
})();
