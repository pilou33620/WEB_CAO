/* =============================================================================
   commun/reperage.js
   Repérage : chercher un repère, mesurer une distance.

   Deux gestes que les deux éditeurs partagent, et qui doivent donc s'apprendre
   une seule fois :

     · **Rechercher** (Ctrl+F) — un champ qui prend « C47 », « R1 », « GND », et
       amène la vue dessus en le sélectionnant. Au schématique il change de
       feuille si le composant est ailleurs ; au PCB il cadre sur l'empreinte.
     · **Mesurer** (K) — deux points, la distance et les deltas X/Y. Au PCB
       c'est une cote de fabrication, en millimètres, accrochée aux pastilles et
       aux sommets de piste. Au schématique la mesure n'est qu'une aide au
       dessin : une case vaut 1 mm par convention, pas par cote physique, et
       l'affichage le dit plutôt que de laisser croire à une dimension réelle.

   Ce fichier ne connaît **ni** l'un **ni** l'autre document : tout ce qui
   diffère — l'aimant, la conversion en millimètres, la liste des cibles, le
   cadrage — passe par un adaptateur que chaque éditeur déclare et remet à
   `rpInit()`. C'est le principe de `commun/workspace.js` et de son `WS_CONFIG` :
   un seul comportement, deux réglages.

   L'adaptateur (`RP_ED`) :
     accroche(x,y)  -> {x,y,quoi}   aimant ; le repli sur la grille est à sa
                                    charge, il rend toujours un point
     mm(d)          -> nombre       distance monde -> millimètres
     physique       -> booléen      true : cote de fabrication ;
                                    false : convention de dessin
     w2s(x,y)       -> {x,y}        monde -> pixels CSS
     cibles()       -> [cible]      ce que la recherche peut atteindre
     redessiner()                   draw()
     astuce(txt)                    la ligne de pied de page
     mesurer(on)                    entrer dans le mode mesure

   Une cible : {cle, type, libelle, detail, aller()}. `cle` est ce qu'on tape,
   `libelle` ce qu'on lit, `aller()` ce qui se passe.
   ============================================================================= */
"use strict";

let RP_ED=null;
const RP={
  /* La mesure. `a` est le point de départ posé, `b` le point d'arrivée figé
     par le second clic, `c` celui que le curseur promène tant que rien n'est
     figé. Garder les deux séparés est ce qui permet de relire une cote posée
     sans qu'elle suive la souris. */
  mes:{a:null,b:null,c:null},
  /* La recherche. `res` est la liste montrée, `i` la ligne choisie au clavier. */
  q:{ouvert:false,res:[],i:0}
};

function rpEsc(s){
  return String(s==null?"":s).replace(/&/g,"&amp;").replace(/</g,"&lt;")
    .replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}
function rpEl(id){return document.getElementById(id);}
/* Trois décimales, virgule décimale : la même écriture que les champs de
   coordonnées et que la fenêtre des règles. */
function rpNb(v){return String(Math.round(v*1000)/1000).replace(".",",");}

/* ==========================================================================
   La mesure
   --------------------------------------------------------------------------
   Un clic pose le départ, le suivant fige l'arrivée, le troisième repart de
   zéro : on enchaîne les cotes sans repasser par un bouton. Échap efface.
   ========================================================================== */
function rpMesEnCours(){return !!RP.mes.a;}
/* Le couple de points à dessiner et à lire — l'arrivée figée s'il y en a une,
   sinon celle que le curseur promène. Null tant qu'il n'y a rien à montrer. */
function rpMesPaire(){
  const a=RP.mes.a, b=RP.mes.b||RP.mes.c;
  return (a&&b)?{a:a,b:b}:null;
}
function rpMesClic(x,y){
  if(!RP_ED)return;
  const p=RP_ED.accroche(x,y);
  if(!RP.mes.a||RP.mes.b){          // rien en cours, ou cote figée : on repart
    RP.mes={a:p,b:null,c:p};
  }else{
    RP.mes.b=p;RP.mes.c=p;
  }
  rpMesDire();
}
function rpMesBouge(x,y){
  if(!RP_ED||!RP.mes.a||RP.mes.b)return false;
  const p=RP_ED.accroche(x,y);
  if(RP.mes.c&&RP.mes.c.x===p.x&&RP.mes.c.y===p.y)return false;
  RP.mes.c=p;
  rpMesDire();
  return true;
}
function rpMesRaz(){
  const avait=!!RP.mes.a;
  RP.mes={a:null,b:null,c:null};
  return avait;
}
/* Les quatre nombres de la cote. L'angle est celui qu'on lit à l'écran —
   direct, l'axe Y du document descendant — comme la saisie polaire. */
function rpMesCotes(){
  const P=rpMesPaire();
  if(!P||!RP_ED)return null;
  const dx=RP_ED.mm(P.b.x-P.a.x), dy=RP_ED.mm(P.b.y-P.a.y);
  /* `-dy` sur un delta nul donne -0, dont atan2 tire -180 au lieu de 180 : la
     même direction, écrite comme personne ne la lit. Le `||0` rend le zéro au
     zéro. */
  return {dx:dx,dy:dy,d:Math.hypot(dx,dy),ang:Math.atan2(-dy||0,dx)*180/Math.PI};
}
/* Ce que le pied de page annonce. Au schématique, la mention « convention de
   dessin » est accolée à la cote : sans elle, un nombre en millimètres sur un
   schéma se lit comme une dimension de carte, ce qu'il n'est pas. */
function rpMesLecture(){
  const c=rpMesCotes();
  if(!c)return RP.mes.a
    ? "Mesure : point de départ posé — cliquez le second point · Échap efface."
    : "Mesure : cliquez le premier point.";
  const t="Mesure "+rpNb(c.d)+" mm · ΔX "+rpNb(c.dx)+" · ΔY "+rpNb(c.dy)+
          " · "+rpNb(Math.round(c.ang*100)/100)+"°";
  return t+(RP_ED&&RP_ED.physique
    ? (RP.mes.b?" — cote figée ; un clic repart d'ailleurs, Échap efface."
              :" — cliquez pour figer la cote.")
    : " — convention de dessin (1 case = 1 mm), pas une cote de fabrication.");
}
function rpMesDire(){if(RP_ED&&RP_ED.astuce)RP_ED.astuce(rpMesLecture());}

/* --------------------------------------------------------------------------
   Le tracé, en pixels d'écran
   Le dessiner dans le repère du document obligerait à retourner le texte en
   vue dessous et à le redimensionner à chaque cran de zoom. En pixels d'écran,
   la cote reste lisible à toute échelle et l'étiquette ne se mire jamais :
   seuls les deux points passent par `w2s`.
   -------------------------------------------------------------------------- */
const RP_TRAIT="#8af0ff";        // --cyan : rien d'autre sur la carte n'est de cette couleur
const RP_GUIDE="rgba(138,240,255,.42)";
const RP_MONO='"JetBrains Mono","SF Mono",Consolas,monospace';
function rpMesTrace(c,dpr){
  const P=rpMesPaire();
  if(!P||!RP_ED)return;
  const A=RP_ED.w2s(P.a.x,P.a.y), B=RP_ED.w2s(P.b.x,P.b.y);
  c.save();
  c.setTransform(dpr,0,0,dpr,0,0);
  c.lineCap="round";c.lineJoin="round";

  /* Le triangle rectangle : les deux cathètes disent ΔX et ΔY d'un coup d'œil,
     ce que deux nombres seuls ne montrent pas. On ne le trace que s'il a une
     surface — sur une cote droite il ferait un doublon du trait principal. */
  if(Math.abs(B.x-A.x)>1&&Math.abs(B.y-A.y)>1){
    c.strokeStyle=RP_GUIDE;c.lineWidth=1;c.setLineDash([3,3]);
    c.beginPath();
    c.moveTo(A.x,A.y);c.lineTo(B.x,A.y);c.lineTo(B.x,B.y);
    c.stroke();
    c.setLineDash([]);
  }
  c.strokeStyle=RP_TRAIT;c.lineWidth=1.4;
  c.beginPath();c.moveTo(A.x,A.y);c.lineTo(B.x,B.y);c.stroke();
  for(const p of [A,B]){
    c.beginPath();c.arc(p.x,p.y,3.5,0,Math.PI*2);c.stroke();
    c.beginPath();c.moveTo(p.x-6,p.y);c.lineTo(p.x+6,p.y);
    c.moveTo(p.x,p.y-6);c.lineTo(p.x,p.y+6);c.stroke();
  }
  const co=rpMesCotes();
  if(co)rpMesEtiquette(c,(A.x+B.x)/2,(A.y+B.y)/2,
    rpNb(co.d)+" mm",
    "ΔX "+rpNb(co.dx)+"  ΔY "+rpNb(co.dy));
  c.restore();
}
/* L'étiquette est posée au-dessus du milieu, avec son fond : sur du cuivre
   dense, un texte nu se perd. */
function rpMesEtiquette(c,x,y,gros,petit){
  c.font="600 12.5px "+RP_MONO;
  const w1=c.measureText(gros).width;
  c.font="10.5px "+RP_MONO;
  const w2=c.measureText(petit).width;
  const w=Math.max(w1,w2)+16, h=34;
  const bx=Math.round(x-w/2), by=Math.round(y-h-10);
  c.fillStyle="rgba(23,24,27,.92)";
  c.strokeStyle="rgba(138,240,255,.55)";c.lineWidth=1;
  if(c.roundRect){c.beginPath();c.roundRect(bx,by,w,h,5);c.fill();c.stroke();}
  else{c.fillRect(bx,by,w,h);c.strokeRect(bx,by,w,h);}
  c.textAlign="center";c.textBaseline="alphabetic";
  c.fillStyle=RP_TRAIT;
  c.font="600 12.5px "+RP_MONO;
  c.fillText(gros,bx+w/2,by+16);
  c.fillStyle="#8b919c";
  c.font="10.5px "+RP_MONO;
  c.fillText(petit,bx+w/2,by+28);
  c.textAlign="left";
}

/* ==========================================================================
   La recherche
   --------------------------------------------------------------------------
   Le classement va du plus sûr au plus large : ce qu'on a tapé en entier
   d'abord, puis ce qui commence par, puis ce qui contient. Taper « R1 » met
   donc R1 avant R10 et R100 — sinon la frappe la plus courte, qui est la plus
   fréquente, serait la plus mal servie.
   ========================================================================== */
const RP_MAX=14;
function rpRang(cle,q){
  const c=String(cle==null?"":cle).toLowerCase();
  if(c===q)return 0;
  if(c.indexOf(q)===0)return 1;
  return c.indexOf(q)>0?2:-1;
}
function rpTrouve(txt){
  if(!RP_ED)return [];
  const q=String(txt==null?"":txt).trim().toLowerCase();
  if(!q)return [];
  const out=[];
  for(const t of RP_ED.cibles()){
    let r=rpRang(t.cle,q);
    // le libellé rattrape ce que la clé ne dit pas : la valeur, le boîtier
    if(r<0&&String(t.libelle==null?"":t.libelle).toLowerCase().indexOf(q)>=0)r=3;
    if(r>=0)out.push({r:r,t:t});
  }
  out.sort((a,b)=>a.r-b.r||
    String(a.t.cle).localeCompare(String(b.t.cle),"fr",{numeric:true}));
  return out.slice(0,RP_MAX).map(o=>o.t);
}
function rpQBuild(){
  const box=rpEl("rpRes");
  if(!box)return;
  const q=rpEl("rpQ"), txt=q?q.value:"";
  RP.q.res=rpTrouve(txt);
  if(RP.q.i>=RP.q.res.length)RP.q.i=Math.max(0,RP.q.res.length-1);
  if(!String(txt==null?"":txt).trim()){
    box.innerHTML='<div class="rpvide">Un repère (C47, R1) ou un nom de net.</div>';
    return;
  }
  if(!RP.q.res.length){
    box.innerHTML='<div class="rpvide">Rien de ce nom dans ce document.</div>';
    return;
  }
  box.innerHTML=RP.q.res.map((t,i)=>
    '<div class="rpl'+(i===RP.q.i?" on":"")+'" data-i="'+i+'">'+
      '<span class="rpt">'+rpEsc(t.type)+'</span>'+
      '<span class="rpc">'+rpEsc(t.cle)+'</span>'+
      '<span class="rpd">'+rpEsc(t.detail)+'</span>'+
    '</div>').join("");
}
function rpQAller(i){
  const t=RP.q.res[i==null?RP.q.i:i];
  if(!t)return;
  rpQFermer();
  t.aller();
  if(RP_ED&&RP_ED.astuce)
    RP_ED.astuce("Trouvé : "+t.libelle+" — Ctrl+F pour chercher autre chose.");
}
function rpQOuvrir(){
  const b=rpEl("rpBox"), q=rpEl("rpQ");
  if(!b||!q)return;
  RP.q.ouvert=true;RP.q.i=0;
  b.classList.add("on");
  rpQBuild();
  q.focus();if(q.select)q.select();
}
function rpQFermer(){
  const b=rpEl("rpBox");
  RP.q.ouvert=false;
  if(b)b.classList.remove("on");
  const q=rpEl("rpQ");
  if(q&&q.blur)q.blur();
}
function rpQBascule(){RP.q.ouvert?rpQFermer():rpQOuvrir();}

/* ==========================================================================
   Câblage
   ========================================================================== */
function rpInit(ed){
  RP_ED=ed;
  const q=rpEl("rpQ");
  if(q){
    q.oninput=()=>{RP.q.i=0;rpQBuild();};
    q.onkeydown=e=>{
      const k=e.key;
      if(k==="ArrowDown"||k==="ArrowUp"){
        e.preventDefault();
        if(!RP.q.res.length)return;
        RP.q.i=(RP.q.i+(k==="ArrowDown"?1:RP.q.res.length-1))%RP.q.res.length;
        rpQBuild();
      }else if(k==="Enter"){e.preventDefault();rpQAller();}
      else if(k==="Escape"){e.preventDefault();rpQFermer();}
    };
  }
  const box=rpEl("rpRes");
  if(box)box.onclick=e=>{
    const l=e.target&&e.target.closest&&e.target.closest(".rpl");
    if(l)rpQAller(+l.dataset.i);
  };
  const x=rpEl("rpX");
  if(x)x.onclick=rpQFermer;
  const b=rpEl("bFind");
  if(b)b.onclick=rpQBascule;
  const m=rpEl("mMesure");
  if(m)m.onclick=()=>{if(RP_ED&&RP_ED.mesurer)RP_ED.mesurer(true);};
}
