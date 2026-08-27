"use strict";
/* =============================================================================
   Éditeur PCB — 18-reperage.js
   Ce que la recherche et la mesure valent sur une carte.

   Le comportement — les gestes, le classement des résultats, le tracé de la
   cote — est dans `commun/reperage.js`, partagé avec l'éditeur schématique.
   Ici : ce que ce module-là ne peut pas savoir. Où s'accroche un point de
   mesure sur du cuivre, ce qu'on peut chercher dans une carte, et comment on
   amène la vue dessus.

   Le monde du PCB est en millimètres : `mm()` n'a rien à convertir, et la cote
   affichée EST la cote de fabrication. C'est ce que dit `physique:true`, et
   c'est ce qui distingue cette mesure de celle du schématique.
   ============================================================================= */

/* ==========================================================================
   Cadrer la vue sur ce qu'on vient de trouver
   --------------------------------------------------------------------------
   Un recadrage brutal désoriente : on ne sait plus si la carte a tourné ou si
   c'est la vue qui a bougé. On ne touche donc à l'échelle que lorsqu'il le
   faut vraiment — la cible déborde de l'écran, ou elle est si petite qu'on ne
   la verrait pas — et jamais autrement.
   ========================================================================== */
const RP_ZOOM_MIN=12;             // px/mm : de quoi voir une 0603 et ses deux pastilles
function rpCadrer(b){
  const W=cv.clientWidth||800, H=cv.clientHeight||600, pad=48;
  const bw=Math.max(b.x2-b.x1,0.5), bh=Math.max(b.y2-b.y1,0.5);
  const tient=Math.min((W-pad*2)/bw,(H-pad*2)/bh);
  let s=S.scale;
  if(tient<s)s=tient;                                  // trop grand : on recule
  else if(s<Math.min(tient,RP_ZOOM_MIN))s=Math.min(tient,RP_ZOOM_MIN);
  S.scale=clamp(s,0.5,60);
  const cx=(b.x1+b.x2)/2, cy=(b.y1+b.y2)/2;
  S.ox=W/2-mirX(cx)*S.scale;
  S.oy=H/2-cy*S.scale;
}
/* Tout ce qui porte le net : ses pastilles, son cuivre, ses vias. Un net qui
   n'est nulle part — déclaré par la netlist, jamais routé ni posé — ne rend
   rien, et l'appelant garde alors son cadrage. */
function rpNetBox(net){
  let x1=1e9,y1=1e9,x2=-1e9,y2=-1e9,n=0;
  const pt=(x,y,r)=>{
    r=r||0;n++;
    x1=Math.min(x1,x-r);x2=Math.max(x2,x+r);
    y1=Math.min(y1,y-r);y2=Math.max(y2,y+r);
  };
  for(const fp of S.fps)
    for(const q of padsWorld(fp))
      if(q.net===net)pt(q.x,q.y,Math.max(q.w,q.h)/2);
  for(const t of S.tracks)
    if(t.net===net){pt(t.x1,t.y1,t.w/2);pt(t.x2,t.y2,t.w/2);}
  for(const v of S.vias)
    if(v.net===net)pt(v.x,v.y,v.d/2);
  return n?{x1:x1,y1:y1,x2:x2,y2:y2}:null;
}

/* ==========================================================================
   L'adaptateur
   ========================================================================== */
const RP_PCB={
  physique:true,
  mm:d=>d,                        // le monde du PCB est déjà en millimètres
  w2s:(x,y)=>w2s(x,y),
  redessiner:()=>draw(),
  astuce:t=>hint(t),
  mesurer:()=>setMode("mesure"),

  /* L'aimant du tracé, réemployé tel quel : mesurer d'un centre de pastille à
     l'autre est le geste courant, et c'est exactement ce que `magnet` accroche.
     Hors de sa portée, la grille reprend la main — jamais le point brut, sans
     quoi on relèverait 3,4712 mm là où on visait 3,5. */
  accroche(x,y){
    const m=magnet(x,y,S.active);
    if(m)return {x:m.x,y:m.y,quoi:m.pad?"pastille":(m.via?"via":"piste")};
    return {x:snapX(x),y:snapY(y),quoi:"grille"};
  },

  /* Les empreintes par leur repère, les nets par leur nom. Deux familles
     suffisent : ce sont les deux seules choses qu'on cherche en routant. */
  cibles(){
    const out=[];
    for(const fp of S.fps)
      out.push({
        cle:fp.ref, type:"empreinte",
        libelle:fp.ref+(fp.value?" — "+fp.value:""),
        detail:[fp.value,fp.pkg].filter(Boolean).join(" · "),
        aller(){
          clearSel();
          S.sel.fps.add(fp.id);
          S.hlNet=null;
          rpCadrer(fpBBox(fp));
          refreshPanels();draw();
        }
      });
    for(const n of netTable())
      out.push({
        cle:n.name, type:"net",
        libelle:"net "+n.name,
        detail:n.nodes.length+" nœud(s)",
        aller(){
          selectNetRouting(n.name);     // sélectionne, met en avant et redessine
          const b=rpNetBox(n.name);
          if(b){rpCadrer(b);draw();}
          if(typeof revealNet==="function")revealNet(n.name);
        }
      });
    return out;
  }
};
rpInit(RP_PCB);

/* ==========================================================================
   Cross-probing depuis le schéma
   --------------------------------------------------------------------------
   sessAller() (commun/session.js) a pu laisser une cible à destination de
   "pcb" -- une référence ou un net choisi au schéma, juste avant le départ.
   On la reprend ici, après rpInit() ci-dessus : `cibles()` (RP_PCB) a besoin
   de S.fps et de netTable(), qui n'existent que si la carte est déjà chargée
   -- c'est le cas dès que ce script s'exécute, puisque 07-app.js, chargé
   avant lui, a déjà repris la session d'onglet de manière synchrone.

   Exact seulement : une correspondance partielle amènerait sur le mauvais
   composant sans le dire, pire qu'une absence de saut. */
/* ==========================================================================
   Le phare : dire où l'on vient d'atterrir
   --------------------------------------------------------------------------
   Sélectionner ne suffit pas. Sur une carte dense, la surbrillance d'une 0603
   se cherche autant que l'empreinte elle-même — c'est précisément ce qu'on
   venait d'éviter en sautant depuis le schéma. On pose donc un repère franc,
   et TEMPORAIRE : deux traits qui traversent la vue et se croisent dessus, un
   cercle qui se resserre, puis le cadre de l'empreinte. Il s'efface tout seul
   en deux secondes et demie — un marquage permanent finirait par masquer le
   cuivre qu'on est venu regarder.

   Magenta, parce qu'aucune autre couleur de la carte ne l'est : ni le cuivre,
   ni la sélection (cyan), ni le DRC (rouge), ni la pastille traversante
   (jaune). Rien à confondre avec quoi que ce soit du document.
   ========================================================================== */
const RP_PHARE_MS=2500;
const RP_PHARE_COL="#ff5cf0";
/* `var` et non `let`, et c'est voulu : paint() (js/03-render.js) appelle
   rpPhareTrace() alors que ce fichier-ci, chargé bien plus loin, n'a pas
   encore été évalué — init() dessine dès js/07-app.js. La fonction, elle, est
   hissée ; un `let` resterait en zone morte et le premier dessin de la page
   lèverait ReferenceError. Hissées à `undefined`, ces deux variables-là
   valent « pas de phare », ce qui est exactement l'état de départ. */
var RP_PHARE=null;                    // {x,y,r,box,t0}
var RP_PHARE_RAF=0;
var RP_PHARE_TS=-1;                   // horodatage de l'image précédente

function rpMaintenant(){
  return (typeof performance!=="undefined"&&performance.now)
    ? performance.now() : Date.now();
}
/* La boîte de ce qu'on vient d'atteindre. `cle` est le repère de l'empreinte
   ou le nom du net — c'est ce que la recherche a fait correspondre. */
function pcbCibleBoite(t){
  if(!t)return null;
  if(t.type==="empreinte"){
    const fp=S.fps.find(f=>f.ref===t.cle);
    return fp?fpBBox(fp):null;
  }
  return rpNetBox(t.cle);
}
function rpPhare(b){
  if(!b)return;
  RP_PHARE={
    x:(b.x1+b.x2)/2, y:(b.y1+b.y2)/2,
    /* Le demi-diamètre de la cible, jamais nul : un net réduit à une pastille
       donnerait un cercle de rien du tout. */
    r:Math.max(Math.hypot(b.x2-b.x1,b.y2-b.y1)/2,0.4),
    box:{x1:b.x1,y1:b.y1,x2:b.x2,y2:b.y2},
    /* 0 = pas encore affiché. Le compte à rebours part de la PREMIÈRE image
       peinte, pas de l'instant où le phare est allumé : un onglet en
       arrière-plan ne peint pas (le navigateur y suspend requestAnimationFrame),
       et le phare aurait expiré avant d'être vu. Or c'est précisément le cas
       du cross-probing entre deux onglets. */
    t0:0
  };
  RP_PHARE_TS=-1;
  rpPhareAnime();
}
function rpPhareAnime(){
  if(RP_PHARE_RAF||typeof requestAnimationFrame!=="function")return;
  RP_PHARE_RAF=requestAnimationFrame(function(ts){
    RP_PHARE_RAF=0;
    if(!RP_PHARE)return;
    /* conn() est mémoïsé sur S.ver : redessiner sans toucher au document ne
       recalcule pas la connectivité, l'animation ne coûte que le tracé. */
    draw();
    /* Si l'horloge n'a pas avancé d'une image à l'autre, il n'y a pas
       d'animation possible ici — un contexte sans rendu réel, un banc
       d'essai. On a dessiné une fois, cela suffit : sans cette garde, une
       boucle qui attend que le temps passe ne s'arrêterait jamais. */
    const t=(typeof ts==="number")?ts:rpMaintenant();
    if(t<=RP_PHARE_TS){RP_PHARE=null;draw();return;}
    RP_PHARE_TS=t;
    if(RP_PHARE)rpPhareAnime();     // rpPhareTrace() l'éteint à la fin
  });
}
/* Appelé par paint() (03-render.js), en dernier et sous la même condition que
   la cote de mesure : c'est une annotation de travail, elle n'a rien à faire
   dans le .png exporté. On dessine en pixels écran — le repère garde la même
   épaisseur quel que soit le zoom, et le miroir de `Dessous` est déjà pris en
   compte par w2s(). */
function rpPhareTrace(c,dpr){
  if(!RP_PHARE)return;
  if(!RP_PHARE.t0)RP_PHARE.t0=rpMaintenant();   // première image : le compte part d'ici
  const t=(rpMaintenant()-RP_PHARE.t0)/RP_PHARE_MS;
  if(!isFinite(t)||t>=1){RP_PHARE=null;return;}

  const W=cv.clientWidth||800, H=cv.clientHeight||600;
  const p=w2s(RP_PHARE.x,RP_PHARE.y);
  /* Jamais moins de 14 px : sur une carte très dézoomée, un cercle collé à
     l'empreinte ne se verrait pas mieux qu'elle. */
  const rc=Math.max(RP_PHARE.r*S.scale,14);
  const serre=Math.min(t/0.35,1);                  // le cercle se resserre
  const r=rc+Math.max(W,H)*0.5*(1-serre)*(1-serre);
  /* Pleine intensité les deux premiers tiers, puis extinction : un fondu
     linéaire dès la première image passe la moitié du temps à être pâle, et
     c'est justement la pâleur qu'on corrige ici. */
  const e=(t<0.65)?1:(1-t)/0.35;
  /* Trois battements, mais qui ne s'éteignent jamais tout à fait : un creux
     proche de zéro faisait disparaître le repère une image sur deux, ce qui le
     rendait moins lisible qu'un trait fixe — le contraire du but. */
  const puls=0.7+0.3*Math.cos(t*Math.PI*6);

  c.save();
  c.setTransform(dpr,0,0,dpr,0,0);
  c.lineCap="round";
  c.strokeStyle=RP_PHARE_COL;
  /* Un halo de la même couleur : sur un fond sombre et un cuivre chargé, un
     trait fin à mi-battement se noie. Le halo le détache sans l'épaissir. */
  c.shadowColor=RP_PHARE_COL;
  c.shadowBlur=10;

  /* Les quatre traits qui traversent la vue : c'est ce qui s'attrape du coin
     de l'œil, avant même de savoir où regarder. Ils s'arrêtent au cercle
     plutôt que de le barrer. */
  c.globalAlpha=e*0.85*puls;
  c.lineWidth=2;
  c.setLineDash([7,5]);
  c.beginPath();
  c.moveTo(0,p.y);        c.lineTo(p.x-r-8,p.y);
  c.moveTo(p.x+r+8,p.y);  c.lineTo(W,p.y);
  c.moveTo(p.x,0);        c.lineTo(p.x,p.y-r-8);
  c.moveTo(p.x,p.y+r+8);  c.lineTo(p.x,H);
  c.stroke();
  c.setLineDash([]);

  c.globalAlpha=e*puls;
  c.lineWidth=3;
  c.beginPath();c.arc(p.x,p.y,r,0,Math.PI*2);c.stroke();

  /* Le cadre exact, une fois le cercle arrivé : c'est lui qui dit de quoi on
     parle au juste, quand le cercle n'a fait que mener l'oeil jusque-là. */
  if(serre>=1){
    const b=RP_PHARE.box, a1=w2s(b.x1,b.y1), a2=w2s(b.x2,b.y2);
    const x=Math.min(a1.x,a2.x), y=Math.min(a1.y,a2.y);
    const w=Math.abs(a2.x-a1.x), h=Math.abs(a2.y-a1.y);
    c.globalAlpha=e;
    c.lineWidth=2.5;
    c.strokeRect(x-4,y-4,w+8,h+8);
  }
  c.restore();
}

/* Le repère demandé, s'il est sur cette carte. Exact seulement : une
   correspondance partielle amènerait sur le mauvais composant sans le dire,
   pire qu'une absence de saut. */
function pcbCibleTrouver(valeur){
  const q=String(valeur==null?"":valeur).toLowerCase();
  if(!q)return null;
  return rpTrouve(valeur).find(x=>String(x.cle).toLowerCase()===q)||null;
}
/* Y aller. Renvoie la cible atteinte, ou null — c'est ce que l'onglet voisin
   attend en retour pour savoir s'il a été entendu utilement. */
function pcbCibleAller(valeur){
  const t=pcbCibleTrouver(valeur);
  if(!t)return null;
  t.aller();
  /* Après le cadrage, pas avant : rpPhare() a besoin de la vue déjà placée
     pour que le cercle parte du bord et se resserre au bon endroit. */
  rpPhare(pcbCibleBoite(t));
  return t;
}
function pcbSonderCible(){
  const c=(typeof sessCiblePrendre==="function")?sessCiblePrendre("pcb"):null;
  if(!c)return;
  const t=pcbCibleAller(c.valeur);
  if(!t){
    /* Le cas courant n'est pas une faute de frappe : c'est une carte qui n'a
       pas encore reçu la netlist du schéma. Les deux documents sont
       indépendants, et le dire évite de chercher un défaut ailleurs. */
    hint("Depuis le schéma : « "+c.valeur+" » n'est pas sur cette carte — "
        +"la netlist du schéma y a-t-elle été importée ?");
    return;
  }
  hint("Depuis le schéma : "+t.libelle+".");
}
sessCibleAuChargement(pcbSonderCible);

/* ==========================================================================
   Montrer sur le schéma resté ouvert dans un autre onglet
   --------------------------------------------------------------------------
   L'autre moitié du cross-probing : au lieu de changer d'outil dans cet
   onglet, on désigne ce qu'on regarde à l'onglet d'à côté, qui saute dessus
   et reste ouvert. Le geste est le même que pour la navigation (`pcbSonde`
   dit quoi montrer), seul le transport change : BroadcastChannel au lieu de
   sessionStorage.
   ========================================================================== */
function pcbMontrerAilleurs(){
  if(typeof sessMontrerAilleurs!=="function")return;
  const s=(typeof pcbSonde==="function")?pcbSonde("schema"):null;
  if(!s){
    hint("Rien à montrer : sélectionnez une empreinte, ou désignez un net.");
    return;
  }
  const quoi=(s.quoi==="net")?("net "+s.valeur):s.valeur;
  sessMontrerAilleurs("schema",s.quoi,s.valeur,function(etat){
    if(etat==="vu")            hint(quoi+" montré sur le schéma, dans l'autre onglet.");
    else if(etat==="absent")   hint(quoi+" n'est pas sur le schéma de l'autre onglet.");
    else if(etat==="personne") hint("Aucun onglet ouvert sur le schéma. Ouvrez-le à "
                                   +"côté, ou passez-y par le bouton de l'entête.");
    else                       hint("Ce navigateur ne partage rien entre onglets — "
                                   +"passez au schéma par le bouton de l'entête.");
  });
}
/* Et l'inverse : le schéma d'à côté demande à voir quelque chose ici. */
/* Le bouton de l'entête. Il n'est pas câblé par rpInit() (commun/reperage.js)
   comme « Rechercher » : celui-ci ne cherche pas dans le document, il parle à
   un autre onglet -- ce n'est pas le même métier. Absent de la page (version
   un seul fichier), il n'y a rien à câbler. */
(function(){
  const b=document.getElementById("bProbe");
  if(!b)return;
  /* Un navigateur sans BroadcastChannel, ou un double-clic en file:// : le
     bouton ne servirait à rien et le dit en restant là, plutôt que de
     disparaître sans explication. */
  if(typeof sessCanalDispo==="function"&&!sessCanalDispo())b.disabled=true;
  b.onclick=pcbMontrerAilleurs;
})();

if(typeof sessEcouterProbe==="function")
  sessEcouterProbe("pcb",function(quoi,valeur){
    const t=pcbCibleAller(valeur);
    if(t)hint("Montré depuis le schéma (autre onglet) : "+t.libelle+".");
    return !!t;
  });
