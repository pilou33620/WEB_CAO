/* =============================================================================
   editeur-schematique — 21-reperage.js
   Ce que la recherche et la mesure valent sur un schéma.

   Le comportement — les gestes, le classement des résultats, le tracé de la
   cote — est dans `commun/reperage.js`, partagé avec l'éditeur PCB. Ici : ce
   que ce module-là ne peut pas savoir.

   Deux différences avec le PCB, et elles ne sont pas cosmétiques :

     · **La recherche traverse les feuilles.** Un schéma en a plusieurs, et
       c'est justement quand R1 est ailleurs qu'on le cherche : la cible retient
       sa feuille et y va avant de sélectionner.
     · **La mesure n'est pas une cote.** Une case vaut 1 mm par convention de
       dessin, pas par cote physique — un schéma n'a pas d'échelle. La mesure
       sert donc à aligner et à espacer, et `physique:false` fait dire à la
       lecture ce qu'elle vaut, plutôt que de laisser lire une dimension de
       carte là où il n'y en a pas.
   ============================================================================= */
"use strict";

/* ==========================================================================
   Cadrer la vue sur ce qu'on vient de trouver
   --------------------------------------------------------------------------
   Même règle qu'au PCB : on ne touche à l'échelle que s'il le faut. Un
   recadrage qui zoome sans raison fait croire que le document a changé.
   ========================================================================== */
const RP_ZOOM_MIN=1;              // au-delà, un symbole se lit sans effort
function rpCadrer(b){
  const W=cv.clientWidth||800, H=cv.clientHeight||600, pad=70;
  const bw=Math.max(b.x2-b.x1,1), bh=Math.max(b.y2-b.y1,1);
  const tient=Math.min((W-pad*2)/bw,(H-pad*2)/bh);
  let s=S.scale;
  if(tient<s)s=tient;                                  // trop grand : on recule
  else if(s<Math.min(tient,RP_ZOOM_MIN))s=Math.min(tient,RP_ZOOM_MIN);
  S.scale=Math.max(.25,Math.min(2.5,s));
  S.ox=W/2-(b.x1+b.x2)/2*S.scale;
  S.oy=H/2-(b.y1+b.y2)/2*S.scale;
}
/* La boîte d'un net : tous ses points de câblage. */
function rpNetBox(n){
  if(!n||!n.pts||!n.pts.length)return null;
  let x1=1e9,y1=1e9,x2=-1e9,y2=-1e9;
  for(const p of n.pts){
    x1=Math.min(x1,p.x);x2=Math.max(x2,p.x);
    y1=Math.min(y1,p.y);y2=Math.max(y2,p.y);
  }
  return {x1:x1,y1:y1,x2:x2,y2:y2};
}
/* Changer de feuille refait les nets : l'objet retenu par la cible vient du
   calcul document, celui de la feuille arrivée est un autre objet pour le même
   câblage. On le reprend par son premier fil — les fils, eux, sont les mêmes
   objets d'un calcul à l'autre — et par le nom pour un net sans fil. */
function rpNetFrais(n){
  const L=nets();
  if(n.wires&&n.wires.length){
    const f=L.byWire.get(n.wires[0]);
    if(f)return f;
  }
  return L.list.find(x=>x.name&&x.name===n.name)||n;
}

/* ==========================================================================
   L'adaptateur
   ========================================================================== */
const RP_SCH={
  physique:false,                 // convention de dessin, pas cote de fabrication
  mm:d=>gridMm(d),
  w2s:(x,y)=>w2s(x,y),
  redessiner:()=>draw(),
  astuce:t=>{const b=document.getElementById("fHint");if(b)b.textContent=t;},
  mesurer:()=>setMode("mesure"),

  /* Les broches attirent la mesure : c'est entre elles qu'on mesure un
     écartement avant de dessiner un symbole. Hors de leur portée, la grille —
     jamais le point brut. */
  accroche(x,y){
    const p=nearestPin(x,y,12/S.scale);
    if(p)return {x:p.x,y:p.y,quoi:"broche"};
    return {x:snap(x),y:snap(y),quoi:"grille"};
  },

  /* Les composants de **toutes** les feuilles, et les nets du document. Un
     composant d'une autre feuille annonce laquelle : sans cela, choisir la
     ligne ferait sauter la vue sans qu'on comprenne où l'on vient d'atterrir. */
  cibles(){
    const out=[];
    S.pages.forEach((p,pi)=>{
      const comps=(pi===S.page)?S.comps:(p.comps||[]);
      for(const el of comps){
        if(!el.ref)continue;                    // un symbole sans repère ne se cherche pas
        const id=el.id, ail=(pi!==S.page);
        out.push({
          cle:el.ref, type:"composant",
          libelle:el.ref+(el.value?" — "+el.value:"")+(ail?" (feuille "+p.name+")":""),
          detail:[el.value,ail?p.name:""].filter(Boolean).join(" · "),
          aller(){
            if(pi!==S.page)gotoPage(pi);
            const c=S.comps.find(k=>k.id===id);
            if(!c)return;
            clearSel();S.sel.add(c.id);S.hoverNet=null;
            rpCadrer(bbox(c));
            refreshPanels();draw();
          }
        });
      }
    });
    for(const g of docNets().groups){
      if(!g.name)continue;                      // un net anonyme n'a pas de nom à taper
      const m=g.members[0];
      out.push({
        cle:g.name, type:g.global?"net global":"net",
        libelle:"net "+g.name,
        detail:g.nodes.length+" nœud(s)"+(g.pages.length>1?" · "+g.pages.length+" feuilles":""),
        aller(){
          if(m.page!==S.page)gotoPage(m.page);
          const n=rpNetFrais(m.net);
          selectNet(n);
          const b=rpNetBox(n);
          if(b){rpCadrer(b);draw();}
        }
      });
    }
    return out;
  }
};
rpInit(RP_SCH);

/* ==========================================================================
   Cross-probing depuis le PCB
   --------------------------------------------------------------------------
   sessAller() (commun/session.js) a pu laisser une cible à destination de
   "schema" -- une référence ou un net choisi au PCB, juste avant le départ.
   On la reprend ici, après rpInit() ci-dessus : `cibles()` (RP_SCH) a besoin
   de S.pages et de docNets(), qui n'existent que si le schéma est déjà
   chargé -- c'est le cas dès que ce script s'exécute, puisque 17-demarrage.js,
   chargé avant lui, a déjà repris la session d'onglet de manière synchrone.

   Exact seulement : une correspondance partielle amènerait sur le mauvais
   composant sans le dire, pire qu'une absence de saut. */
function schSonderCible(){
  const c=(typeof sessCiblePrendre==="function")?sessCiblePrendre("schema"):null;
  if(!c)return;
  const q=String(c.valeur).toLowerCase();
  const t=rpTrouve(c.valeur).find(x=>String(x.cle).toLowerCase()===q);
  const h=document.getElementById("fHint");
  if(!t){
    if(h)h.textContent="Depuis le PCB : « "+c.valeur+" » introuvable sur ce schéma.";
    return;
  }
  t.aller();
  if(h)h.textContent="Depuis le PCB : "+t.libelle+".";
}
schSonderCible();
