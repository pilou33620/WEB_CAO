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
