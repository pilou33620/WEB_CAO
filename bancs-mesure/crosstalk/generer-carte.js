/* =============================================================================
   bancs-mesure/crosstalk/generer-carte.js
   La carte d'essai du crosstalk, construite par le code même de l'Éditeur PCB.

       python3 editeur-pcb/outils/build-monofichier.py
       node bancs-mesure/crosstalk/generer-carte.js [fichier-sortie.json]

   POURQUOI UNE CARTE GÉNÉRÉE. Une carte d'essai ne vaut que par ses cotes :
   l'écart S entre agresseur et victime, la longueur couplée, la largeur qui
   donne 50 Ω. Dessinées à la souris, elles seraient à vérifier une à une ;
   écrites ici, elles se lisent dans une table (`CAS`) et la carte se refait
   d'un seul geste quand une cote change. Le document passe ensuite par
   `loadDoc` (la normalisation d'un fichier lu sur disque), le contrôle de
   connectivité et le DRC : un fichier qui sort d'ici s'ouvre dans l'éditeur
   comme une carte dessinée à la main.

   LA CARTE (130 × 176 mm, 4 couches JLC04161H-7628) :
     · Top : les pistes, rien d'autre (pas de cuivre coulé : la diaphonie
       mesurée est celle d'un microruban, pas d'une coplanaire) ;
     · L2, L3 et Bottom : masse pleine, cousue par des vias ;
     · chaque piste finit sur deux embases SMA bord de carte (Cinch / Johnson
       142-0701-801, la référence de la LIB) : l'agresseur est attaqué à gauche
       et chargé à droite, la victime donne le NEXT à gauche et le FEXT à
       droite.

   LES CAS (voir `CAS` plus bas, et README.md pour ce que chacun teste) :
     0  plancher de mesure : deux pistes à 12 mm, rien ne les rapproche ;
     1  microruban couplé serré, S = W ;
     2  microruban couplé, S = 3W (la règle des 3W) ;
     3  comme 2, avec une piste de garde à la masse et ses vias ;
     4  comme 2, plan de masse fendu sous le milieu du couplage.
   Plus deux lignes seules pour étalonner : CAL_LONG (même longueur que les
   cas) et CAL_COURT (sur le bord du haut) — leur différence de retard donne
   l'εr effectif réel de la carte, connecteurs et câbles retranchés.
   ============================================================================= */
"use strict";
const fs=require("fs");
const path=require("path");
const RACINE=path.join(__dirname,"..","..");

/* ==========================================================================
   Les cotes — tout ce qu'on peut vouloir changer est ici
   ========================================================================== */
const W=0.35;              // mm, largeur 50 Ω sur 7628 (0,2104 mm), vernis compris
const L_COUPLE=100;        // mm, longueur couplée (section parallèle)
const BW=130, BH=176;      // mm, contour de carte
const X0=(BW-L_COUPLE)/2;  // début de la section couplée
const PAS_SMA=12;          // mm, entraxe des deux embases d'un même cas
const VIA={d:0.5,drill:0.3};   // vias de masse (JLC 4 couches, sans surcoût)

/* L'empilage JLC04161H-7628 (1,6 mm), tel que JLCPCB le publie. */
const EMPILAGE={
  cu:[0.035,0.0152,0.0152,0.035],
  di:[{k:"prepreg",t:0.2104,er:4.4,df:0.02,mat:"7628"},
      {k:"core",   t:1.065, er:4.6,df:0.02,mat:"FR-4 core"},
      {k:"prepreg",t:0.2104,er:4.4,df:0.02,mat:"7628"}],
  maskT:0.01, maskEr:3.8
};

/* --------------------------------------------------------------------------
   L'embase SMA bord de carte Cinch (Johnson) 142-0701-801, carte de 1,6 mm.
   ⚠ COTES À VÉRIFIER SUR LE DESSIN DE LA DATASHEET AVANT FABRICATION : elles
   n'ont pas pu être relues sur le document du fabricant (site inaccessible
   depuis l'atelier où cette carte a été générée). Elles suivent la forme
   habituelle de cette embase — une âme centrale sur le dessus, quatre pattes
   de masse qui pincent la carte, deux dessus et deux dessous.
   Axe local : x entre dans la carte, l'âme est sur y = 0 ; le corps de
   l'embase est du côté x < 0, hors de la carte.
   -------------------------------------------------------------------------- */
const SMA={
  retrait:0.25,       // mm, du bord de carte au début des pastilles (JLC : ≥ 0,2)
  lg:3.0,             // mm, longueur des pastilles le long de l'axe
  ame:1.0,            // mm, largeur de la pastille de l'âme
  masseY:2.79,        // mm, entraxe âme → patte de masse
  masseL:1.5,         // mm, largeur d'une pastille de masse
  corps:{x1:-9.0,y1:-3.2,x2:0.0,y2:3.2}
};
const SMA_REF="CONN_Embase_SMA_CI_Bord_de_carte";
const SMA_MPN="142-0701-801";
const SMA_FAB="Cinch Connectivity Solutions";
const SMA_PKG="SMA-EDGE-142-0701-801";

/* Les cas. `s` : écart bord à bord dans la section couplée (null : pas de
   rapprochement). `garde` et `fente` décrivent ce qui distingue 3 et 4 de 2. */
const CAS=[
  {n:0,titre:"PLANCHER - pistes a 12 mm",s:null},
  {n:1,titre:"S = W",s:W},
  {n:2,titre:"S = 3W",s:3*W},
  {n:3,titre:"S = 3W + GARDE",s:3*W,garde:{w:W,pasVias:5}},
  /* 2 mm et pas 1 : la page sonde le plan tous les 0,5 mm et prend pour un
     dégagement d'antipad tout trou de moins de 1,5 pas — une fente de 1 mm
     n'arriverait pas au serveur (`simXtFentes`) */
  {n:4,titre:"S = 3W + FENTE PLAN",s:3*W,fente:{large:2.0,demi:10}}
];
const Y_CAS0=40, PAS_CAS=28;           // centre du cas 0, puis un cas tous les 28 mm
const Y_CAL_LONG=20;
const CAL_COURT={x1:40,x2:90,y:9};     // embases sur le bord du haut

/* ==========================================================================
   L'éditeur, chargé comme le fait son banc d'essai
   ========================================================================== */
const dom=require(path.join(RACINE,"commun","test","dom-stub.js")).install({
  panels:{stack:"Empilage",rules:"Règles de tracé",props:"Propriétés",
          list:"Nets & composants",stackup:"Empilage physique",
          dpair:"Paires différentielles",sim:"Simulation EM"},
  canvasId:"board"
});
global.BroadcastChannel=function(nom){this.name=nom;this.onmessage=null;};
global.BroadcastChannel.prototype.postMessage=function(){};
global.BroadcastChannel.prototype.close=function(){};
const bundle=path.join(RACINE,"editeur-pcb","dist","pcb.js");
if(!fs.existsSync(bundle)){
  console.error("dist/pcb.js absent : lancez d'abord python3 editeur-pcb/outils/build-monofichier.py");
  process.exit(2);
}
const EXPOSE=["S","loadDoc","serialize","runDrc","conn","exDoc","exFp","exPin",
  "exWire","exVia","exPlane","padsWorld","r3"];
eval(fs.readFileSync(bundle,"utf8").replace(/^"use strict";/,"")+"\n"
     +EXPOSE.map(n=>"globalThis."+n+"="+n+";").join("\n"));

/* ==========================================================================
   Construction
   ========================================================================== */
const D=exDoc(4,BW,BH);
D.stack.cu=EMPILAGE.cu.map(t=>({t:t}));
D.stack.di=EMPILAGE.di.map(d=>Object.assign({},d));
D.stack.target=1.6;
D.stack.maskT=EMPILAGE.maskT;D.stack.maskEr=EMPILAGE.maskEr;
D.rule.mfgProfile="jlcpcb";
D.classes=[{name:"Défaut",w:0.25,clr:0.2,via:VIA.d,drill:VIA.drill},
           {name:"RF 50 ohms",w:W,clr:0.2,via:VIA.d,drill:VIA.drill}];
for(let i=1;i<4;i++)exPlane(D,i,"gnd","GND");
D.holes=[];D.drawings=[];

/* les nets mesurés sont dans la classe 50 Ω : le DRC et le gestionnaire de
   contraintes les jugent à leur largeur, pas à celle des signaux ordinaires */
const classe50=net=>{D.netClass[net]="RF 50 ohms";};
const texte=(t,x,y,taille,rot)=>D.drawings.push({id:D.nextId++,shape:"text",type:"text",
  layer:"silkT",text:t,x1:x,y1:y,x2:x,y2:y,size:taille||1.2,height:taille||1.2,
  rot:rot||0,width:0.15});

/* Une embase : l'empreinte du dessus (âme + deux pattes), sa contre-empreinte
   du dessous (deux pattes), et les vias qui relient les pattes aux plans.
   `cote` : "G" (bord gauche), "D" (bord droit), "H" (bord du haut).
   Rend le centre de la pastille de l'âme, d'où part la piste. */
const padsDessus=()=>[
  {n:1,x:SMA.retrait+SMA.lg/2,y:0,w:SMA.lg,h:SMA.ame,shape:"rect",drill:0},
  {n:2,x:SMA.retrait+SMA.lg/2,y:-SMA.masseY,w:SMA.lg,h:SMA.masseL,shape:"rect",drill:0},
  {n:3,x:SMA.retrait+SMA.lg/2,y: SMA.masseY,w:SMA.lg,h:SMA.masseL,shape:"rect",drill:0}];
const padsDessous=()=>[
  {n:1,x:SMA.retrait+SMA.lg/2,y:-SMA.masseY,w:SMA.lg,h:SMA.masseL,shape:"rect",drill:0},
  {n:2,x:SMA.retrait+SMA.lg/2,y: SMA.masseY,w:SMA.lg,h:SMA.masseL,shape:"rect",drill:0}];
const ROT={G:[0,180],D:[180,0],H:[90,270]};   // [dessus, dessous]
function embase(ref,val,net,cote,x,y){
  const [rd,rb]=ROT[cote];
  const J=exFp(D,{ref:ref,val:val,pkg:SMA_PKG,pins:3,x:x,y:y,rot:rd,
                  csvPartName:SMA_REF,csvMpn:SMA_MPN,manufacturer:SMA_FAB,
                  body:Object.assign({},SMA.corps),pads:padsDessus(),
                  nets:{1:net,2:"GND",3:"GND"}});
  const B=exFp(D,{ref:ref+"B",val:"",pkg:SMA_PKG+"-DOS",pins:2,
                  x:x,y:y,rot:rb,body:Object.assign({},SMA.corps),pads:padsDessous(),
                  nets:{1:"GND",2:"GND"}});
  B.side=1;
  /* le nom de l'empreinte dans la LIB (lib_empreinte_pcb/), pour la synchro */
  J.lib=SMA_PKG;B.lib=SMA_PKG+"-DOS";
  /* deux vias derrière chaque patte de masse du dessus, reliés à elle */
  const ax=cote==="G"?{x:1,y:0}:cote==="D"?{x:-1,y:0}:{x:0,y:1};
  const no={x:-ax.y,y:ax.x};
  const pt=(u,v)=>({x:x+ax.x*u+no.x*v,y:y+ax.y*u+no.y*v});
  for(const sgn of [-1,1]){
    const pad=pt(SMA.retrait+SMA.lg/2,sgn*SMA.masseY);
    const v1=pt(SMA.retrait+SMA.lg+0.7,sgn*SMA.masseY);
    const v2=pt(SMA.retrait+SMA.lg+0.7,sgn*(SMA.masseY+1.0));
    exWire(D,0,"GND",0.8,[pad,v1]);
    exVia(D,v1.x,v1.y,"GND",VIA.d,VIA.drill);
    exVia(D,v2.x,v2.y,"GND",VIA.d,VIA.drill);
  }
  return exPin(J,1);
}

/* Les deux pistes d'un cas : de l'embase, tout droit, puis à 45° jusqu'à
   l'écart voulu, la section couplée, et le chemin inverse. */
const sorties=[];   // les points d'embase, pour garder les vias de couture à distance
function cas(c){
  const yc=Y_CAS0+PAS_CAS*c.n;
  const nA="XT"+c.n+"_A", nV="XT"+c.n+"_V";
  classe50(nA);classe50(nV);
  const yA=yc-PAS_SMA/2, yV=yc+PAS_SMA/2;
  const J=k=>"J"+c.n+k;        // J{cas}{port} : 1 source, 2 NEXT, 3 charge, 4 FEXT
  const aG=embase(J(1),"A"+c.n+" SOURCE",nA,"G",0,yA);
  const vG=embase(J(2),"V"+c.n+" NEXT",nV,"G",0,yV);
  const aD=embase(J(3),"A"+c.n+" CHARGE 50",nA,"D",BW,yA);
  const vD=embase(J(4),"V"+c.n+" FEXT",nV,"D",BW,yV);
  sorties.push(yA,yV);
  if(c.s==null){
    exWire(D,0,nA,W,[aG,aD]);
    exWire(D,0,nV,W,[vG,vD]);
  }else{
    const h=(W+c.s)/2;                 // demi-entraxe dans la section couplée
    const dy=PAS_SMA/2-h;              // ce que le 45° doit rattraper
    const xa=X0-dy, xb=X0+L_COUPLE+dy;
    exWire(D,0,nA,W,[aG,{x:xa,y:yA},{x:X0,y:yc-h},{x:X0+L_COUPLE,y:yc-h},{x:xb,y:yA},aD]);
    exWire(D,0,nV,W,[vG,{x:xa,y:yV},{x:X0,y:yc+h},{x:X0+L_COUPLE,y:yc+h},{x:xb,y:yV},vD]);
  }
  if(c.garde){
    /* la garde : sur toute la section couplée, à la masse par des vias à
       chaque bout et tous les `pasVias` mm — un bout de garde en l'air
       résonne et peut coupler plus qu'il ne protège */
    exWire(D,0,"GND",c.garde.w,[{x:X0,y:yc},{x:X0+L_COUPLE,y:yc}]);
    const n=Math.round(L_COUPLE/c.garde.pasVias);
    for(let i=0;i<=n;i++)exVia(D,X0+i*L_COUPLE/n,yc,"GND",VIA.d,VIA.drill);
  }
  if(c.fente){
    /* la fente : sur les trois couches de masse, en travers des deux pistes,
       au milieu de la section couplée. Le courant de retour doit en faire
       le tour : c'est ce détour que le calcul 2D ne voit pas. */
    const xm=X0+L_COUPLE/2, f=c.fente;
    for(let l=1;l<4;l++)
      D.cuts.push({id:D.nextId++,l:l,pts:[
        {x:xm-f.large/2,y:yc-f.demi},{x:xm+f.large/2,y:yc-f.demi},
        {x:xm+f.large/2,y:yc+f.demi},{x:xm-f.large/2,y:yc+f.demi}]});
  }
  texte("CAS "+c.n+" : "+c.titre,BW/2,yc-PAS_SMA/2-2.2,1.4);
  texte("A"+c.n+" SRC",9,yA-1.8);texte("V"+c.n+" NEXT",9,yV+2.4);
  texte("A"+c.n+" 50R",BW-17,yA-1.8);texte("V"+c.n+" FEXT",BW-17,yV+2.4);
  return yc;
}
const centres=CAS.map(cas);

/* Étalonnage : une ligne seule de bord à bord, et une courte sur le haut. */
{
  classe50("CAL_LONG");classe50("CAL_COURT");
  const g=embase("J91","CAL_LONG","CAL_LONG","G",0,Y_CAL_LONG);
  const d=embase("J92","CAL_LONG","CAL_LONG","D",BW,Y_CAL_LONG);
  exWire(D,0,"CAL_LONG",W,[g,d]);
  sorties.push(Y_CAL_LONG);
  texte("CAL_LONG",BW/2,Y_CAL_LONG-1.8);
  const a=embase("J93","CAL_COURT","CAL_COURT","H",CAL_COURT.x1,0);
  const b=embase("J94","CAL_COURT","CAL_COURT","H",CAL_COURT.x2,0);
  const y=CAL_COURT.y, k=y-a.y;
  exWire(D,0,"CAL_COURT",W,[a,{x:a.x,y:a.y+1},{x:a.x+k-1,y:y},{x:b.x-k+1,y:y},
                            {x:b.x,y:b.y+1},b]);
  texte("CAL_COURT",(CAL_COURT.x1+CAL_COURT.x2)/2,y+2.6);
}

/* Couture des plans : une rangée de vias entre deux cas, et le tour de la
   carte. Les vias restent à distance des embases et des pistes. */
const libre=(x,y)=>{
  for(const t of D.tracks){
    if(t.net==="GND")continue;
    const dx=t.x2-t.x1, dy=t.y2-t.y1, L2=dx*dx+dy*dy||1;
    const u=Math.max(0,Math.min(1,((x-t.x1)*dx+(y-t.y1)*dy)/L2));
    if(Math.hypot(x-(t.x1+u*dx),y-(t.y1+u*dy))<1.5)return false;
  }
  for(const fp of D.fps)
    for(const q of padsWorld(fp))
      if(Math.hypot(x-q.x,y-q.y)<Math.max(q.w,q.h)/2+1.0)return false;
  for(const v of D.vias)if(Math.hypot(x-v.x,y-v.y)<1.2)return false;
  for(const c of D.cuts){
    const xs=c.pts.map(p=>p.x), ys=c.pts.map(p=>p.y);
    if(x>Math.min(...xs)-1.5&&x<Math.max(...xs)+1.5&&
       y>Math.min(...ys)-1.5&&y<Math.max(...ys)+1.5)return false;
  }
  return true;
};
const couture=(x,y)=>{if(libre(x,y))exVia(D,x,y,"GND",VIA.d,VIA.drill);};
const rangees=[(Y_CAL_LONG+centres[0]-PAS_SMA/2)/2];
for(let i=0;i+1<centres.length;i++)rangees.push((centres[i]+centres[i+1])/2);
for(const y of rangees)for(let x=10;x<=BW-10+1e-9;x+=5)couture(x,y);
for(let x=5;x<=BW-5+1e-9;x+=5){couture(x,1.5);couture(x,BH-1.5);}
for(let y=5;y<=BH-5+1e-9;y+=5){couture(1.5,y);couture(BW-1.5,y);}

/* Trous de fixation M3, et le cartouche. */
for(const [x,y] of [[5,BH-5],[BW-5,BH-5],[5,13],[BW-5,13]])
  D.holes.push({id:D.nextId++,x:x,y:y,d:3.2});
texte("WEB_CAO - BANC CROSSTALK - rev A",BW/2,BH-6.5,1.6);
texte("JLC04161H-7628 / W="+W+" mm / Lc="+L_COUPLE+" mm / SMA 142-0701-801",BW/2,BH-3.5,1.1);

/* ==========================================================================
   Vérification, puis écriture
   ========================================================================== */
/* deux repères identiques passeraient le DRC, et la nomenclature les confondrait */
const vus=new Set();
for(const fp of D.fps){
  if(vus.has(fp.ref)){console.error("Repère en double : "+fp.ref);process.exit(1);}
  vus.add(fp.ref);
}
loadDoc(D);
let miss=0;
for(const n of conn(true).nets.values())miss+=n.miss;
const drc=runDrc();
console.log("Carte : "+S.fps.length+" empreintes, "+S.tracks.length+" segments, "+
            S.vias.length+" vias, "+S.cuts.length+" découpes de plan");
console.log("Connectivité : "+(miss?miss+" liaison(s) non routée(s)":"tout est routé"));
console.log("DRC : "+(drc.length?drc.length+" remarque(s)":"aucune remarque"));
for(const e of drc.slice(0,15))console.log("  · "+e.msg+(e.x!=null?" ("+e.x.toFixed(2)+", "+e.y.toFixed(2)+")":""));
/* les longueurs des lignes d'étalonnage, pastille d'âme à pastille d'âme :
   leur différence et celle des retards mesurés donnent l'εr effectif */
const longueur=net=>S.tracks.filter(t=>t.net===net)
  .reduce((s,t)=>s+Math.hypot(t.x2-t.x1,t.y2-t.y1),0);
const lL=longueur("CAL_LONG"), lC=longueur("CAL_COURT");
console.log("Étalonnage : CAL_LONG "+lL.toFixed(2)+" mm, CAL_COURT "+lC.toFixed(2)+
            " mm, différence "+(lL-lC).toFixed(2)+" mm");
const sortie=process.argv[2]||path.join(__dirname,"sortie","banc-crosstalk-PCB.json");
fs.mkdirSync(path.dirname(sortie),{recursive:true});
fs.writeFileSync(sortie,JSON.stringify(JSON.parse(serialize()),null,1));
console.log("Écrit : "+sortie);
process.exit(miss||drc.length?1:0);
