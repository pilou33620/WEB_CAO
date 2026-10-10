"use strict";
/* ==========================================================================
   Éditeur PCB — rooms : les blocs fonctionnels du schéma, encadrés
   --------------------------------------------------------------------------
   Un bloc du schéma (« Étage 1 · ampli non inverseur », « Clignoteur
   TLC555 ») se retrouvait sur la carte en pastilles de couleur, une par
   composant, au coin de chaque boîtier. Sur une petite carte elles
   recouvraient les repères, et rien ne disait où commençait un bloc ni où
   finissait l'autre.

   Comme les rooms d'Altium, chaque bloc est maintenant UNE région : un cadre
   à coins arrondis autour de tous ses composants, un fond à peine teinté, et
   une étiquette à son nom, dans sa couleur. Un clic sur l'étiquette prend le
   bloc entier : on le glisse d'une pièce, R le tourne, Ctrl ou Maj l'ajoute
   à la sélection. La région suit ses composants : elle se resserre à mesure
   qu'on les rapproche, ce qui dit d'un coup d'œil si un bloc est compact ou
   éparpillé, et si deux blocs se chevauchent.

   D'OÙ VIENNENT LES BLOCS. D'abord du document du schéma : chaque rectangle
   étiqueté (une zone) y est un bloc, et ses composants sont ceux dont le
   centre est dedans — la règle de l'éditeur schématique (schComposantsDansZone).
   Le document vient de la session de l'onglet ou du dossier du projet
   (pcbSchemaDoc, pcbSyncSchema) : la carte ouverte seule les a donc aussi.
   À défaut, les zones que l'analyse « Motifs & Blocs » a publiées
   (22-bloc-placement.js).

   Rien de cela n'est gravé ni exporté : c'est un repère de placement, que le
   menu Affichage montre ou cache (réglage du profil, comme la grille).
   ========================================================================== */

const ROOM_MARGE=0.8;          // mm autour des boîtiers
const ROOM_RAYON=0.8;          // mm, coins arrondis du cadre
var ROOMS={cle:"",liste:[]};
function roomsVisibles(){return S.voirRooms!==false;}

/* Le nom court d'un bloc : ce qui précède le premier « · » de l'étiquette,
   le reste étant la description (« Étage 1 · ampli non inverseur ×215 »). */
function roomNomCourt(label){
  const t=String(label||"").trim();
  const i=t.indexOf(" · ");
  return (i>0?t.slice(0,i):t).slice(0,48);
}
/* Les zones du document du schéma : rectangles étiquetés, composants dont le
   centre est dedans, feuille par feuille. */
function roomsDepuisDoc(doc){
  const out=[];
  if(!doc||!Array.isArray(doc.pages))return out;
  doc.pages.forEach((p,pi)=>{
    const comps=Array.isArray(p&&p.comps)?p.comps:[];
    for(const d of (Array.isArray(p&&p.drawings)?p.drawings:[])){
      if(!d||!(d.isZone||((d.shape==="rect"||d.type==="rect")&&d.label)))continue;
      const x1=Math.min(d.x1,d.x2), x2=Math.max(d.x1,d.x2), y1=Math.min(d.y1,d.y2), y2=Math.max(d.y1,d.y2);
      const refs=[];
      for(const c of comps){
        if(!c||!c.ref)continue;
        const cx=+c.x||0, cy=+c.y||0;
        if(cx>=x1&&cx<=x2&&cy>=y1&&cy<=y2)refs.push(String(c.ref));
      }
      out.push({id:"sch:"+pi+":"+(d.id!=null?d.id:out.length),label:String(d.label||("Zone "+(out.length+1))),
                couleur:String(d.color||"#f59e0b"),refs});
    }
  });
  return out;
}
function roomsSource(){
  let doc=null;
  try{if(typeof pcbSchemaDoc==="function")doc=pcbSchemaDoc();}catch(_){}
  const z=roomsDepuisDoc(doc);
  if(z.length)return z;
  /* repli : l'analyse « Motifs & Blocs » du schéma, publiée en session */
  const bz=(typeof BLOC_PLACEMENT!=="undefined"&&BLOC_PLACEMENT.getZones)?BLOC_PLACEMENT.getZones():[];
  return (bz||[]).map((x,i)=>({id:"pat:"+(x.id!=null?x.id:i),label:String(x.nom||x.name||("Bloc "+(i+1))),
    couleur:String(x.couleur||x.color||"#f59e0b"),refs:(x.composants||x.components||[]).map(String)}));
}
/* Une couleur reçue d'un fichier ne passe dans le canevas que si c'en est
   une : #rgb ou #rrggbb. */
function roomCouleur(c){return /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(c)?c:"#f59e0b";}
/* Les rooms de la carte : un bloc, ses empreintes, la boîte qui les entoure.
   Recalculées quand la carte ou la source change. */
function roomsListe(){
  /* `draw()` tourne dès init(), avant que ce fichier soit exécuté : dans le
     monofichier, la fonction est là mais `ROOMS` vaut encore undefined */
  if(!ROOMS)ROOMS={cle:"",liste:[]};
  const src=roomsSource();
  const cle=S.ver+"|"+S.fps.length+"|"+JSON.stringify(src);
  if(ROOMS.cle===cle)return ROOMS.liste;
  const parRef=new Map(S.fps.map(f=>[String(f.ref||"").toUpperCase(),f]));
  const liste=[];
  for(const z of src){
    const fps=[...new Set(z.refs.map(r=>parRef.get(String(r).trim().toUpperCase())).filter(Boolean))];
    if(!fps.length)continue;
    let x1=Infinity,y1=Infinity,x2=-Infinity,y2=-Infinity;
    for(const f of fps){
      const b=fpBBox(f);
      x1=Math.min(x1,b.x1);y1=Math.min(y1,b.y1);x2=Math.max(x2,b.x2);y2=Math.max(y2,b.y2);
    }
    liste.push({id:z.id,label:z.label,nom:roomNomCourt(z.label),couleur:roomCouleur(z.couleur),fps,
                x1:x1-ROOM_MARGE,y1:y1-ROOM_MARGE,x2:x2+ROOM_MARGE,y2:y2+ROOM_MARGE});
  }
  ROOMS={cle,liste};
  return liste;
}
function roomRect(c,r){
  const rr=Math.min(ROOM_RAYON,(r.x2-r.x1)/2,(r.y2-r.y1)/2);
  c.beginPath();
  c.moveTo(r.x1+rr,r.y1);
  c.arcTo(r.x2,r.y1,r.x2,r.y2,rr);c.arcTo(r.x2,r.y2,r.x1,r.y2,rr);
  c.arcTo(r.x1,r.y2,r.x1,r.y1,rr);c.arcTo(r.x1,r.y1,r.x2,r.y1,rr);
  c.closePath();
}
/* L'étiquette d'une room : un onglet au-dessus du cadre, du côté gauche de
   l'écran (en vue de dessous, la carte est en miroir). Taille constante à
   l'écran. Rend sa boîte en coordonnées carte. */
function roomEtiquette(c,r){
  const h=px(16), pad=px(6), fs=px(11);
  c.save();
  c.font="bold "+fs+'px "Segoe UI",system-ui,sans-serif';
  const w=c.measureText?c.measureText(r.nom).width+2*pad:r.nom.length*fs*0.6+2*pad;
  c.restore();
  const x=S.flip?r.x2-w:r.x1, y=r.y1-h;
  return {x1:x,y1:y,x2:x+w,y2:r.y1,w,h,fs,pad};
}
/* Le fond : sous le cuivre, pour ne rien masquer. */
function roomsPeindreFond(c){
  if(!roomsVisibles())return;
  for(const r of roomsListe()){
    c.save();
    c.globalAlpha=0.07;c.fillStyle=r.couleur;
    roomRect(c,r);c.fill();
    c.restore();
  }
}
/* Le cadre et l'étiquette : par-dessus tout, comme les repères. */
function roomsPeindre(c){
  if(!roomsVisibles())return;
  for(const r of roomsListe()){
    const sel=r.fps.every(f=>S.sel.fps.has(f.id));
    c.save();
    c.globalAlpha=sel?1:0.8;
    c.strokeStyle=r.couleur;c.lineWidth=px(sel?2.2:1.4);
    roomRect(c,r);c.stroke();
    const e=roomEtiquette(c,r);
    c.globalAlpha=sel?1:0.9;c.fillStyle=r.couleur;
    c.beginPath();
    if(c.roundRect)c.roundRect(e.x1,e.y1,e.w,e.h,[px(3),px(3),0,0]);else c.rect(e.x1,e.y1,e.w,e.h);
    c.fill();
    c.globalAlpha=1;
    TXT(c,r.nom,e.x1+e.w/2,e.y1+e.h/2,e.fs,"#0f1012");
    c.restore();
  }
}
/* La room dont l'étiquette est sous le point (coordonnées carte), ou null. */
function roomAuLabel(x,y){
  if(!roomsVisibles())return null;
  const c=(typeof ctx!=="undefined")?ctx:null;
  for(const r of roomsListe().slice().reverse()){
    const e=c?roomEtiquette(c,r):{x1:r.x1,y1:r.y1-px(16),x2:r.x1+px(120),y2:r.y1};
    if(x>=e.x1&&x<=e.x2&&y>=e.y1&&y<=e.y2)return r;
  }
  return null;
}
function roomsBasculer(v){
  S.voirRooms=v==null?!roomsVisibles():!!v;
  roomsBouton();
  if(typeof profilNoter==="function")profilNoter();
  if(typeof draw==="function")draw();
}
function roomsBouton(){
  const b=(typeof document!=="undefined"&&document.getElementById)?document.getElementById("bRooms"):null;
  if(!b)return;
  b.classList.toggle("on",roomsVisibles());
  b.textContent="Rooms : "+(roomsVisibles()?"affichées":"masquées");
}
(function roomsBrancher(){
  if(typeof document==="undefined"||!document.getElementById)return;
  const b=document.getElementById("bRooms");
  roomsBouton();
  if(b)b.onclick=()=>{
    roomsBasculer();
    const n=roomsListe().length;
    hint(roomsVisibles()?(n?n+" room(s) : un clic sur l'étiquette prend le bloc entier.":
      "Aucun bloc : dessinez des zones étiquetées dans le schéma, ou lancez « Motifs & Blocs »."):"Rooms masquées.");
  };
  /* le schéma du dossier du projet, lu une fois : les rooms d'une carte
     ouverte sans passer par le schéma */
  if(typeof pcbSyncSchema==="function"){
    try{Promise.resolve(pcbSyncSchema()).then(()=>{ROOMS.cle="";if(typeof draw==="function")draw();}).catch(()=>{});}catch(_){}
  }
})();
