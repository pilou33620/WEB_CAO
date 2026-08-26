"use strict";
/* =============================================================================
   visionneuse IPC-2581 — 04-interaction.js
   Déplacer, zoomer, désigner. Une visionneuse ne modifie rien : le bouton
   gauche sert donc à ce qu'on en attend ici, faire glisser la carte, et le
   clic sans déplacement désigne ce qu'il y a dessous.

   Maj tenue élargit ce que ce clic met en évidence, sans changer ce qu'il
   désigne : le clic seul reste sur la couche visée, Maj+clic suit le net d'un
   bout à l'autre de la carte (voir porteeDe, plus bas).

   Le doigt est traité comme la souris (pointer events), et deux doigts pincent
   pour zoomer : ce dépôt se consulte aussi depuis une tablette, c'est même la
   raison d'être de serveur.py.
   ============================================================================= */

/* Tolérance de désignation : trois pixels, quel que soit le zoom. En dessous,
   on ne désigne plus une piste, on tire au sort parmi ses voisines. */
const PICK_PX=3;

const POINTEURS=new Map();     // pointerId -> {x,y} en pixels page
let GLISSE=null;               // {x,y,ox,oy,bouge} pendant un déplacement
let PINCE=null;                // {d, cx, cy} pendant un pincement

function pos(e){
  const r=cv.getBoundingClientRect();
  return {x:e.clientX-r.left, y:e.clientY-r.top};
}

/* ==========================================================================
   Désignation
   ========================================================================== */
/* Boîte d'une piste, calculée une fois et gardée sur l'objet : sans elle,
   chaque survol repasserait sur tous les segments de la carte. */
function boitePiste(t){
  if(t._b)return t._b;
  const p=t.p;
  let x1=p[0],y1=p[1],x2=p[0],y2=p[1];
  for(let i=2;i+1<p.length;i+=2){
    if(p[i]<x1)x1=p[i]; else if(p[i]>x2)x2=p[i];
    if(p[i+1]<y1)y1=p[i+1]; else if(p[i+1]>y2)y2=p[i+1];
  }
  const m=(t.w||0)/2;
  t._b={x1:x1-m,y1:y1-m,x2:x2+m,y2:y2+m};
  return t._b;
}
function distSegment(px,py,x1,y1,x2,y2){
  const dx=x2-x1, dy=y2-y1, l2=dx*dx+dy*dy;
  if(l2<=0)return Math.hypot(px-x1,py-y1);
  let t=((px-x1)*dx+(py-y1)*dy)/l2;
  t=t<0?0:(t>1?1:t);
  return Math.hypot(px-(x1+t*dx),py-(y1+t*dy));
}

/* L'ordre dans lequel on interroge les couches : le cuivre d'abord, et dans
   la pile, celui qu'on regarde en premier. Masque, pâte et cuivre se
   superposent partout — une pastille existe sur les trois — et le fichier les
   énumère dans son ordre à lui, qui met souvent le masque en tête. Désigner
   le masque plutôt que la piste qu'il couvre, ce serait annoncer une couche
   que personne ne cherchait, et restreindre la mise en évidence à celle-là. */
function couchesDesignation(){
  const cu=V.couches.filter(c=>c.cuivre).sort((a,b)=>a.seq-b.seq);
  if(V.vue.flip)cu.reverse();               // vue de dessous : le dessous d'abord
  return cu.concat(V.couches.filter(c=>!c.cuivre));
}

/* Ce que désigne un point du monde. L'ordre est celui de la précision : une
   pastille et une piste sont des objets, la boîte d'un composant n'est qu'un
   cadre — elle passe donc en dernier, sinon elle avalerait tout ce qu'elle
   contient. */
function designer(wx,wy){
  const tol=PICK_PX/V.vue.scale;
  const ordre=couchesDesignation();

  if(V.aff.pads){
    for(const couche of ordre){
      if(!couche.visible)continue;
      for(const q of couche.pads){
        const r=(q.d||0)/2+tol;
        if(Math.abs(q.x-wx)>r||Math.abs(q.y-wy)>r)continue;
        if(Math.hypot(q.x-wx,q.y-wy)>r)continue;
        /* Le trou sous la pastille, s'il y en a un : c'est ce qui fait d'elle
           un via ou une broche traversante plutôt qu'un simple appui de CMS,
           et ce qui décide de ce que le clic met en évidence. */
        return {type:"pad",x:q.x,y:q.y,r:Math.max((q.d||0)/2,tol),
                net:(q.pad.n==null?-1:q.pad.n),couche:q.c,
                pin:q.pad.pin||"",ps:q.pad.ps||"",
                trou:mdlTrouEn(q.x,q.y),
                comp:q.hote?q.hote.ref:""};
      }
    }
  }
  if(V.aff.trous){
    for(const t of V.modele.percages){
      const r=(t.d||0)/2+tol;
      if(Math.abs(t.x-wx)>r||Math.abs(t.y-wy)>r)continue;
      if(Math.hypot(t.x-wx,t.y-wy)>r)continue;
      return {type:"percage",x:t.x,y:t.y,r:Math.max((t.d||0)/2,tol),
              net:(t.n==null?-1:t.n),trou:t};
    }
  }
  if(V.aff.pistes){
    for(const couche of ordre){
      if(!couche.visible)continue;
      for(const t of couche.pistes){
        const b=boitePiste(t);
        if(wx<b.x1-tol||wx>b.x2+tol||wy<b.y1-tol||wy>b.y2+tol)continue;
        const seuil=(t.w||0)/2+tol, p=t.p;
        for(let i=0;i+3<p.length;i+=2){
          if(distSegment(wx,wy,p[i],p[i+1],p[i+2],p[i+3])<=seuil)
            return {type:"piste",x:wx,y:wy,r:seuil,net:t.n,couche:couche.i,
                    piste:t};
        }
      }
    }
  }
  /* Les plans : du cuivre comme le reste, mais une surface. Ils passent après
     tout ce qu'ils portent — un plan de masse couvre la carte, et le tester
     d'abord reviendrait à ne plus jamais désigner un via au milieu d'une
     masse.

     Du cuivre, et rien d'autre : les couches de documentation portent elles
     aussi des surfaces — contour de carte, zones d'assemblage — qui couvrent
     de grandes étendues sans rien apprendre de la carte. Les désigner, ce
     serait rendre le vide cliquable et cacher les boîtiers qui sont dessous. */
  if(V.aff.plans){
    for(const couche of ordre){
      if(!couche.cuivre||!couche.visible||!couche.plans.length)continue;
      for(const g of couche.plans){
        if(!mdlPlanContient(g,wx,wy))continue;
        return {type:"plan",x:wx,y:wy,net:(g.n==null?-1:g.n),
                couche:couche.i,plan:g};
      }
    }
  }
  if(V.aff.composants){
    let trouve=null, aire=Infinity;
    for(const comp of V.modele.composants){
      const b=comp.boite;
      if(wx<b.x1||wx>b.x2||wy<b.y1||wy>b.y2)continue;
      /* Deux boîtiers qui se recouvrent : le plus petit est celui qu'on visait,
         le grand est presque toujours un connecteur ou un dissipateur. */
      const a=(b.x2-b.x1)*(b.y2-b.y1);
      if(a<aire){aire=a;trouve=comp;}
    }
    if(trouve)
      return {type:"composant",ref:trouve.ref,boite:trouve.boite,
              couche:trouve.c,comp:trouve};
  }
  return null;
}

/* Ce que le pied de page dit de l'objet survolé — la même phrase que celle du
   panneau de sélection, en plus court. */
function resume(s){
  if(!s)return "";
  if(s.type==="composant"){
    const c=s.comp;
    return c.ref+(c.val?" · "+c.val:"")+" · "+(c.pkg||"?")+
           " · "+mdlCoucheNom(c.c);
  }
  if(s.type==="pad")
    return "pastille"+(s.comp?" "+s.comp:"")+(s.pin?" broche "+s.pin:"")+
           (s.net>=0?" · net "+mdlNetNom(s.net):"")+" · "+mdlCoucheNom(s.couche);
  if(s.type==="percage")
    return "perçage ⌀"+mdlMes(s.trou.d)+" · "+
           (/NON/i.test(s.trou.p||"")?"non métallisé":"métallisé")+
           (s.net>=0?" · net "+mdlNetNom(s.net):"");
  if(s.type==="piste")
    return "piste "+mdlMes(s.piste.w)+" · net "+mdlNetNom(s.net)+
           " · "+mdlCoucheNom(s.couche);
  if(s.type==="plan")
    return "plan"+(s.net>=0?" · net "+mdlNetNom(s.net):"")+
           " · "+mdlCoucheNom(s.couche);
  return "";
}

/* ==========================================================================
   Sélection
   ========================================================================== */
function choisirNet(i){
  V.net=(V.net===i)?-1:i;
  V.comp="";
  /* Depuis une liste, on n'a désigné aucune couche : c'est le net entier
     qu'on demande, comme avec Maj sur la carte. */
  V.mev=mdlMevTout();
  pnlNets(); pnlDetail(); dessiner();
}
function choisirComp(ref,centrer){
  V.comp=(V.comp===ref&&!centrer)?"":ref;
  if(V.comp){
    V.net=-1; V.mev=mdlMevTout();
    const c=V.parRef.get(V.comp);
    if(c&&centrer){
      const b=c.boite, W=cv.clientWidth||1, H=cv.clientHeight||1;
      const k=Math.min(W/((b.x2-b.x1)*6+1),H/((b.y2-b.y1)*6+1));
      centrerSur((b.x1+b.x2)/2,(b.y1+b.y2)/2,
                 Math.max(V.vue.scale,Math.min(k,400)));
    }
  }
  pnlComps(); pnlNets(); pnlDetail(); dessiner();
}
function choisirRien(){
  V.net=-1; V.comp=""; V.mev=mdlMevTout();
  pnlComps(); pnlNets(); pnlDetail(); dessiner();
}

/* ==========================================================================
   Souris, doigt, molette
   ========================================================================== */
cv.addEventListener("pointerdown",function(e){
  if(!V.modele)return;
  cv.setPointerCapture(e.pointerId);
  POINTEURS.set(e.pointerId,pos(e));
  if(POINTEURS.size===2){
    GLISSE=null;
    const p=[...POINTEURS.values()];
    PINCE={d:Math.hypot(p[0].x-p[1].x,p[0].y-p[1].y),
           cx:(p[0].x+p[1].x)/2, cy:(p[0].y+p[1].y)/2};
    return;
  }
  const p=pos(e);
  GLISSE={x:p.x,y:p.y,ox:V.vue.ox,oy:V.vue.oy,bouge:false};
});
cv.addEventListener("pointermove",function(e){
  if(!V.modele)return;
  const p=pos(e);
  if(POINTEURS.has(e.pointerId))POINTEURS.set(e.pointerId,p);

  if(PINCE&&POINTEURS.size===2){
    const q=[...POINTEURS.values()];
    const d=Math.hypot(q[0].x-q[1].x,q[0].y-q[1].y);
    const cx=(q[0].x+q[1].x)/2, cy=(q[0].y+q[1].y)/2;
    if(PINCE.d>0&&d>0)zoomer(d/PINCE.d,cx,cy);
    /* Le pincement déplace aussi : deux doigts qui glissent ensemble sont un
       déplacement, et les séparer serait un geste de moins. */
    V.vue.ox+=cx-PINCE.cx; V.vue.oy+=cy-PINCE.cy;
    PINCE={d:d,cx:cx,cy:cy};
    dessiner();
    return;
  }
  if(GLISSE){
    const dx=p.x-GLISSE.x, dy=p.y-GLISSE.y;
    if(!GLISSE.bouge&&Math.hypot(dx,dy)<3)return;   // le clic a droit au tremblement
    GLISSE.bouge=true;
    V.vue.ox=GLISSE.ox+dx; V.vue.oy=GLISSE.oy+dy;
    redessiner();
    return;
  }
  /* Survol : la position, et ce qu'il y a dessous. */
  const w=s2w(p.x,p.y);
  document.getElementById("fPos").textContent=
    "X "+mdlNb(w.x)+"  Y "+mdlNb(w.y)+"  "+V.unite;
  const avant=V.survol;
  V.survol=designer(w.x,w.y);
  const t=resume(V.survol);
  if(t||avant)hint(t||"");
  cv.style.cursor=V.survol?"pointer":"crosshair";
  if((avant&&avant.type)!==(V.survol&&V.survol.type)||
     (avant&&avant.x)!==(V.survol&&V.survol.x)||
     (avant&&avant.ref)!==(V.survol&&V.survol.ref))
    redessiner();
});
function fin(e){
  const glisse=GLISSE;
  POINTEURS.delete(e.pointerId);
  if(POINTEURS.size<2)PINCE=null;
  GLISSE=null;
  try{cv.releasePointerCapture(e.pointerId);}catch(_){}
  if(!V.modele||!glisse||glisse.bouge)return;
  /* Un clic, pas un déplacement : on désigne. */
  const p=pos(e), w=s2w(p.x,p.y), s=designer(w.x,w.y);
  if(!s){choisirRien();return;}
  if(s.type==="composant"){
    choisirComp(s.ref,false);
  }else{
    /* Une pastille appartient a deux choses a la fois : un net, et le boitier
       qui la porte. On retient les deux -- la fiche les montre ensemble. */
    V.net=(s.net>=0)?s.net:-1;
    V.comp=s.comp||"";
    V.mev=porteeDe(s,e.shiftKey);
    pnlComps(); pnlNets();
  }
  V.survol=s; pnlDetail(); dessiner();
}

/* Jusqu'où va la mise en évidence de ce qu'on vient de cliquer. Sans Maj on
   reste sur place : la couche cliquée pour une piste, un plan ou une
   pastille, le seul perçage pour un via. Avec Maj on suit le net — sur toutes
   les couches où il court quand c'est du cuivre, de via en via quand c'est un
   via. Le geste ne change pas d'objet, il change de question : « qu'est-ce
   qui court ici » d'abord, « où va ce signal » ensuite.

   Un via cliqué ne montre que des perçages, jamais le cuivre du net : sans
   quoi le plan de masse recouvre la carte et on ne voit plus aucun via —
   c'est précisément ce qu'on venait chercher. Un perçage sans net (trou
   mécanique) n'a personne à suivre : il reste seul, Maj ou non.

   Viser un via, c'est en pratique viser sa pastille : le trou est au milieu,
   la pastille tout autour, et c'est elle que la désignation rencontre. Une
   pastille qui a un trou compte donc comme un via — ce qu'elle est. */
function porteeDe(s,maj){
  const trou=(s.type==="percage")?s.trou:(s.type==="pad"?s.trou:null);
  if(trou)
    return {couche:-1,quoi:"trous",seul:(maj&&s.net>=0)?null:trou};
  return {couche:(maj||s.couche==null)?-1:s.couche,quoi:"",seul:null};
}
cv.addEventListener("pointerup",fin);
cv.addEventListener("pointercancel",function(e){
  POINTEURS.delete(e.pointerId);
  if(POINTEURS.size<2)PINCE=null;
  GLISSE=null;
});
cv.addEventListener("pointerleave",function(){
  if(V.survol){V.survol=null;redessiner();}
  document.getElementById("fPos").textContent="—";
});
cv.addEventListener("wheel",function(e){
  if(!V.modele)return;
  e.preventDefault();
  const p=pos(e);
  /* deltaMode 1 = lignes (Firefox) : un cran y vaut quelques pixels ailleurs. */
  const d=e.deltaY*(e.deltaMode===1?16:1);
  zoomer(Math.pow(0.9985,d),p.x,p.y);
},{passive:false});
cv.addEventListener("dblclick",function(e){e.preventDefault();fit();});
cv.addEventListener("contextmenu",function(e){e.preventDefault();});

/* ==========================================================================
   Clavier
   ========================================================================== */
document.addEventListener("keydown",function(e){
  const cible=e.target;
  if(cible&&/^(INPUT|TEXTAREA|SELECT)$/.test(cible.tagName))return;
  if(e.ctrlKey||e.metaKey||e.altKey)return;
  const k=e.key.toLowerCase();
  if(k==="f"){fit();}
  else if(k==="b"){basculerFace();}
  else if(k==="r"){basculer("refs","bRefs");}
  else if(k==="d"){basculer("trous","bTrous");}
  else if(k==="p"){basculer("plans","bPlans");}
  else if(k==="escape"){choisirRien();}
  else if(k==="+"||k==="="){zoomer(1.25,cv.clientWidth/2,cv.clientHeight/2);}
  else if(k==="-"){zoomer(0.8,cv.clientWidth/2,cv.clientHeight/2);}
  else if(k==="o"&&!e.shiftKey){document.getElementById("fichier").click();}
  else return;
  e.preventDefault();
});

function basculer(cle,bouton){
  V.aff[cle]=!V.aff[cle];
  const b=bouton?document.getElementById(bouton):null;
  if(b)b.classList.toggle("on",!!V.aff[cle]);
  pnlElements();
  prefEcrire();
  dessiner();
}
function basculerFace(){
  V.vue.flip=!V.vue.flip;
  const b=document.getElementById("bFlip"), t=document.getElementById("bFlipTxt");
  if(b)b.classList.toggle("on",V.vue.flip);
  /* Le bouton nomme ce vers quoi il mene, jamais l'etat courant : « Dessous »
     quand on regarde le dessus. Le pied de page, lui, dit l'etat. */
  if(t)t.textContent=V.vue.flip?"Dessus":"Dessous";
  prefEcrire();
  dessiner();
}
function hint(t){
  const el=document.getElementById("fHint");
  if(el)el.textContent=t;
}
