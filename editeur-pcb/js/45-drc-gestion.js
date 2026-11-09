"use strict";
/* ==========================================================================
   Gestion du DRC — une fenêtre flottante, à côté de la carte, qui range les
   écarts trouvés par `runDrc` par catégorie, les parcourt un à un (précédent /
   suivant) et amène chacun sous les yeux. On y supprime aussi les îlots de
   cuivre morts que le contrôle signale (`ilotsMorts`, 02-connectivity.js).
   ========================================================================== */

/* ---------- îlots de cuivre morts ----------
   Un îlot se retire par une découpe de zone (S.cuts) posée sur lui : écran,
   connectivité, Gerber, IPC-2581 et simulation honorent déjà les découpes, et
   le geste s'annule comme un autre. La découpe suit le contour de l'îlot dans
   le masque, élargi d'un pixel sur le vide qui l'entoure pour ne pas laisser
   de liseré là où le pixel n'était qu'à moitié couvert. */

/* Contour extérieur de l'îlot `lb` du masque M, en mm, ou null s'il n'est pas
   sûr d'y poser une découpe : un autre cuivre (îlot vivant du net, zone d'un
   autre net) logé dans un de ses trous serait effacé avec lui.
   shortcut: un îlot à trou habité est laissé tel quel, à retirer à la main ;
   découper les trous (polygone en trou de serrure) si le cas devient courant. */
function ilotContour(M,lb,l,net){
  const {W,H,lab}=M;
  let x1=W,y1=H,x2=-1,y2=-1;
  for(let p=0;p<lab.length;p++)if(lab[p]===lb){
    const x=p%W, y=(p-x)/W;
    if(x<x1)x1=x;if(x>x2)x2=x;if(y<y1)y1=y;if(y>y2)y2=y;
  }
  if(x2<0)return null;
  x1=Math.max(0,x1-1);y1=Math.max(0,y1-1);x2=Math.min(W-1,x2+1);y2=Math.min(H-1,y2+1);
  const bw=x2-x1+1, bh=y2-y1+1;
  const L=(x,y)=>x<0||y<0||x>=W||y>=H?0:lab[y*W+x];
  /* l'îlot, plus le vide qui le touche (8 voisins) : jamais un pixel d'un autre îlot */
  const D=new Uint8Array(bw*bh);
  for(let y=0;y<bh;y++)for(let x=0;x<bw;x++){
    const X=x+x1, Y=y+y1, v=L(X,Y);
    if(v===lb){D[y*bw+x]=1;continue;}
    if(v)continue;
    let k=false;
    for(let dy=-1;dy<=1&&!k;dy++)for(let dx=-1;dx<=1;dx++)if(L(X+dx,Y+dy)===lb){k=true;break;}
    if(k)D[y*bw+x]=1;
  }
  const inD=(x,y)=>x>=0&&y>=0&&x<bw&&y<bh&&D[y*bw+x]===1;
  /* arêtes du bord, dans le sens horaire à l'écran (y vers le bas) : l'îlot à
     droite. Un sommet en porte au plus deux (deux pixels qui se touchent par
     un coin). */
  const VW=bw+1, V=VW*(bh+1);
  const e1=new Int8Array(V).fill(-1), e2=new Int8Array(V).fill(-1);
  const add=(x,y,d)=>{const v=y*VW+x;if(e1[v]<0)e1[v]=d;else e2[v]=d;};
  for(let y=0;y<bh;y++)for(let x=0;x<bw;x++){
    if(!D[y*bw+x])continue;
    if(!inD(x,y-1))add(x,y,0);
    if(!inD(x+1,y))add(x+1,y,1);
    if(!inD(x,y+1))add(x+1,y+1,2);
    if(!inD(x-1,y))add(x,y+1,3);
  }
  const DX=[1,0,-1,0], DY=[0,1,0,-1];
  const prendre=(v,d)=>{
    // au coin partagé, on tourne à droite : on longe le même pixel
    const ordre=d<0?[e1[v],e2[v]]:[(d+1)%4,d,(d+3)%4];
    for(const c of ordre){
      if(c<0)continue;
      if(e1[v]===c){e1[v]=e2[v];e2[v]=-1;return c;}
      if(e2[v]===c){e2[v]=-1;return c;}
    }
    return -1;
  };
  let best=null, bestA=0;
  for(let v0=0;v0<V;v0++){
    while(e1[v0]>=0){
      const P=[];
      let v=v0, d=-1, n=0;
      do{
        const nd=prendre(v,d);
        if(nd<0)break;
        if(nd!==d)P.push(v);
        d=nd;
        v+=DX[d]+DY[d]*VW;
      }while(v!==v0&&++n<4*V);
      let a=0;
      for(let i=0,j=P.length-1;i<P.length;j=i++){
        const xi=P[i]%VW, yi=(P[i]-xi)/VW, xj=P[j]%VW, yj=(P[j]-xj)/VW;
        a+=xj*yi-xi*yj;
      }
      if(Math.abs(a)>bestA){bestA=Math.abs(a);best=P;}
    }
  }
  if(!best||best.length<4)return null;
  const loc=best.map(v=>{const x=v%VW;return {x,y:(v-x)/VW};});
  /* ce que le contour enferme sans être l'îlot : balayage ligne à ligne */
  const vert=[];
  for(let i=0,j=loc.length-1;i<loc.length;j=i++)
    if(loc[i].x===loc[j].x)vert.push({x:loc[i].x,ya:Math.min(loc[i].y,loc[j].y),yb:Math.max(loc[i].y,loc[j].y)});
  const wx=x=>M.x+(x+x1)/M.res, wy=y=>M.y+(y+y1)/M.res;
  const bb={x1:wx(0),y1:wy(0),x2:wx(bw),y2:wy(bh)};
  const autres=S.zones.filter(z=>z.l===l&&(z.net||"")!==net&&z.pts.length>=3&&(()=>{
    const b=zoneCalc(z).bb;return !(b.x2<bb.x1||b.x1>bb.x2||b.y2<bb.y1||b.y1>bb.y2);})());
  for(let y=0;y<bh;y++){
    const xs=vert.filter(e=>e.ya<=y&&y<e.yb).map(e=>e.x).sort((a,b)=>a-b);
    for(let k=0;k+1<xs.length;k+=2)
      for(let x=xs[k];x<xs[k+1];x++){
        if(D[y*bw+x])continue;
        if(L(x+x1,y+y1))return null;                       // un autre îlot du net
        const px=wx(x+0.5), py=wy(y+0.5);
        if(autres.some(z=>zoneContient(z,px,py)))return null;   // une zone d'un autre net
      }
  }
  return loc.map(p=>({x:r3(wx(p.x)),y:r3(wy(p.y))}));
}

/* Retire tous les îlots morts que la connectivité voit. Rend leur nombre. */
function ilotsSupprimer(){
  const c=conn(true), cuts=[];
  let garde=0;
  for(const zi of (c.zoneIslands||[])){
    if(!zi.morts||!zi.morts.length)continue;
    const M=zoneMask(zi.l,zi.net);
    if(!M){garde+=zi.morts.length;continue;}
    for(const m of zi.morts){
      const pts=ilotContour(M,m.lb,zi.l,zi.net);
      if(pts)cuts.push({l:zi.l,pts});else garde++;
    }
  }
  const reste=garde?" — "+garde+" îlot(s) à retirer à la main (un autre cuivre loge dans leurs trous)":"";
  if(!cuts.length){hint("Aucun îlot de cuivre isolé à supprimer"+reste+".");return 0;}
  push();
  for(const ct of cuts)S.cuts.push({id:S.nextId++,l:ct.l,pts:ct.pts,ilot:true});
  touch();zoneCache.clear();
  if(S.drcRun)runDrc();
  refreshPanels();draw();
  hint(cuts.length+" îlot(s) de cuivre isolé(s) supprimé(s) par des découpes de zone (Ctrl+Z pour revenir)"+reste+".");
  return cuts.length;
}

/* ---------- la fenêtre ---------- */
const DRCW_MAX=300;                 // lignes peintes par catégorie (le reste se parcourt au ◀ ▶)
const DRCW={info:false, ferme:{}};
/* La catégorie d'un écart : le début de son message, avant le premier nombre,
   deux-points ou parenthèse. shortcut: tiré du texte ; donner un champ `kind`
   à chaque entrée de runDrc si des catégories se mélangent. */
function drcCategorie(e){
  return (String(e.msg).split(/[:(0-9]/)[0].replace(/\s+(sur|de|du|des|à|entre)\s*$/i,"").trim())||"Divers";
}
/* les écarts visibles, rangés par catégorie (ordre d'apparition) */
function drcRangs(){
  const g=new Map();
  for(const e of S.drc){
    if(e.info&&!DRCW.info)continue;
    const k=drcCategorie(e);
    if(!g.has(k))g.set(k,[]);
    g.get(k).push(e);
  }
  return g;
}
function drcAller(e){
  if(!e)return;
  S.drcSel=e;
  if(e.via&&S.vias.indexOf(e.via)>=0){clearSel();S.sel.vias.add(e.via);buildProps();}
  else if(e.layer!=null)routeToLayer(e.layer);
  if(S.scale<12)S.scale=12;          // assez près pour voir l'écart, pas plus
  center(e.x,e.y);
  drcFenetreMaj();
}
function drcPas(sens){
  const tous=[].concat(...drcRangs().values());
  if(!tous.length)return;
  const i=tous.indexOf(S.drcSel);
  drcAller(tous[i<0?(sens>0?0:tous.length-1):(i+sens+tous.length)%tous.length]);
}
function drcFenetre(){
  if(typeof document==="undefined")return;
  let w=document.getElementById("drcWin");
  if(!w||!w.querySelector||!w.querySelector("#drcwList")){
    w=document.createElement("div");
    w.id="drcWin";w.className="drcw";
    w.innerHTML='<div class="drcw-head"><b>Contrôle DRC</b><span id="drcwNb"></span>'+
      '<button class="tb mini" id="drcwRun" title="Relancer le contrôle">↻ Relancer</button>'+
      '<button class="tb mini" id="drcwX" title="Fermer">✕</button></div>'+
      '<div class="drcw-bar"><button class="tb mini" id="drcwPrev" title="Écart précédent">◀</button>'+
      '<span id="drcwPos"></span><button class="tb mini" id="drcwNext" title="Écart suivant">▶</button>'+
      '<label title="Montrer aussi les remarques (sans marqueur rouge)"><input type="checkbox" id="drcwInfo"> remarques</label></div>'+
      '<div id="drcwIlots"></div><div class="drcw-list" id="drcwList"></div>';
    document.body.appendChild(w);
    const q=id=>w.querySelector("#"+id);
    if(!q("drcwX"))return;              // DOM sans rendu (banc d'essai)
    q("drcwX").onclick=()=>{w.remove();S.drcSel=null;draw();};
    q("drcwRun").onclick=()=>{runDrc();refreshPanels();draw();};
    q("drcwPrev").onclick=()=>drcPas(-1);
    q("drcwNext").onclick=()=>drcPas(1);
    q("drcwInfo").onchange=ev=>{DRCW.info=ev.target.checked;drcFenetreMaj();};
    /* la fenêtre se déplace par sa barre de titre */
    const head=w.querySelector(".drcw-head");
    head.onmousedown=ev=>{
      if(ev.target.tagName==="BUTTON")return;
      const r=w.getBoundingClientRect(), ox=ev.clientX-r.left, oy=ev.clientY-r.top;
      const mv=e=>{w.style.left=Math.max(0,e.clientX-ox)+"px";w.style.top=Math.max(0,e.clientY-oy)+"px";w.style.right="auto";};
      const up=()=>{document.removeEventListener("mousemove",mv);document.removeEventListener("mouseup",up);};
      document.addEventListener("mousemove",mv);document.addEventListener("mouseup",up);
      ev.preventDefault();
    };
  }
  drcFenetreMaj();
}
function drcFenetreMaj(){
  if(typeof document==="undefined")return;
  const w=document.getElementById("drcWin");
  const q=id=>w&&w.querySelector?w.querySelector("#"+id):null;
  if(!q("drcwList"))return;          // fenêtre fermée
  const durs=S.drc.filter(e=>!e.info).length, rq=S.drc.length-durs;
  q("drcwNb").textContent=!S.drcRun?" — non lancé":
    " — "+durs+" erreur"+(durs>1?"s":"")+(rq?", "+rq+" remarque"+(rq>1?"s":""):"");
  const g=drcRangs(), tous=[].concat(...g.values());
  const i=tous.indexOf(S.drcSel);
  q("drcwPos").textContent=tous.length?(i<0?"–":(i+1))+" / "+tous.length:"0";
  const nIl=S.drc.filter(e=>e.ilot).length;
  q("drcwIlots").innerHTML=nIl?'<button class="tb on" id="drcwIlotsGo" title="Pose une découpe de zone sur chaque îlot de cuivre relié à rien (annulable)">'+
    'Supprimer les '+nIl+' îlot'+(nIl>1?"s":"")+' de cuivre isolé'+(nIl>1?"s":"")+'</button>':"";
  if(nIl)q("drcwIlotsGo").onclick=ilotsSupprimer;
  const box=q("drcwList");
  if(!S.drcRun){box.innerHTML='<div class="empty">Contrôle non lancé.</div>';return;}
  if(!tous.length){box.innerHTML='<div class="empty ok">Aucune erreur détectée.</div>';return;}
  let h="", idx=[];
  for(const [k,es] of g){
    const ferme=!!DRCW.ferme[k];
    h+='<div class="drcw-cat" data-k="'+esc(k)+'">'+(ferme?"▸":"▾")+' '+esc(k)+' <span>'+es.length+'</span></div>';
    if(ferme)continue;
    for(const e of es.slice(0,DRCW_MAX)){
      h+='<div class="drcw-row'+(e===S.drcSel?" on":"")+(e.info?" info":"")+'" data-i="'+idx.length+'">'+esc(e.msg)+
         '<span>'+fmt(ux(e.x),2)+" ; "+fmt(uy(e.y),2)+" mm"+(e.l!=null&&e.l<S.cu?" · "+cuId(e.l,S.cu):"")+
         (e.aire?" · "+fmt(e.aire,2)+" mm²":"")+'</span></div>';
      idx.push(e);
    }
    if(es.length>DRCW_MAX)h+='<div class="empty">… '+(es.length-DRCW_MAX)+' de plus, à parcourir avec ◀ ▶</div>';
  }
  box.innerHTML=h;
  box.querySelectorAll(".drcw-cat").forEach(d=>d.onclick=()=>{DRCW.ferme[d.dataset.k]=!DRCW.ferme[d.dataset.k];drcFenetreMaj();});
  box.querySelectorAll(".drcw-row").forEach(r=>r.onclick=()=>drcAller(idx[+r.dataset.i]));
  const on=box.querySelector(".drcw-row.on");
  if(on&&on.scrollIntoView)on.scrollIntoView({block:"nearest"});
}
