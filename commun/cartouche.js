"use strict";
/* =============================================================================
   commun/cartouche.js
   Cadre de page repéré en zones et cartouche, A4 ou A3 paysage, sur une
   feuille du schéma et autour de la carte du PCB. Tout se dessine dans le
   repère du monde de l'éditeur : `u` y vaut un millimètre (schéma : la grille
   de 20 unités fait 0,1 pouce ; PCB : 1).

   Deux cartouches, au dessin des dossiers maison :
     · « sch » : société, adresse, logo, TEL et site | DATE / NAME, DRAWN,
       CHECKED, SCH NO., PCB NO. | DOCUMENT TITLE, SCHEMATIC VIEW, VARIANT,
       SHEET ;
     · « pcb » : celui des dossiers de couches du Draftsman (29-draftsman.js,
       dfCartoucheEn) — DESIGN TITLE, DRAWING NAME, mention de confidentialité.

   La société (nom, adresse, téléphone, site, logo, confidentialité) est celle
   de l'utilisateur : elle vit dans son profil (commun/profils.js), saisie une
   fois pour tous les projets, et ne part pas dans les fichiers de carte. Le
   reste (titre, noms et dates, numéros) est propre au document.
   ============================================================================= */
/* colonnes et lignes de zones : ISO 5457 */
const CARTOUCHE_FORMATS={A4:{w:297,h:210,col:6,lig:4},A3:{w:420,h:297,col:8,lig:6}};
const CARTOUCHE_COULEURS={trait:"#6b7280",texte:"#e2e8f0",etiquette:"#7dd3fc",zone:"#94a3b8"};
const CARTOUCHE_PROFIL="cartouche:commun";
const CARTOUCHE_LOGO_MAX=200*1024;          // le profil entier tient en 512 Ko
const CARTOUCHE_SOCIETE=["societe","adresse","tel","web","confid","logo"];
const CARTOUCHE_DOC=["titre","dessine","dateDessin","verifie","dateVerif","schNo","pcbNo"];

function cartoucheTxt(v,n){return String(v==null?"":v).slice(0,n||120);}
/* les champs du document, bornés : ils viennent d'un fichier */
function cartoucheInfoNorm(o){
  const src=(o&&typeof o==="object")?o:{}, out={};
  for(const k of CARTOUCHE_DOC)if(src[k])out[k]=cartoucheTxt(src[k]);
  return out;
}
function cartoucheSociete(){
  let src=null;
  try{src=typeof profLire==="function"?profLire(CARTOUCHE_PROFIL):null;}catch(_){}
  src=(src&&typeof src==="object")?src:{};
  const out={};
  for(const k of CARTOUCHE_SOCIETE)out[k]=cartoucheTxt(src[k],k==="logo"?CARTOUCHE_LOGO_MAX:k==="confid"?600:300);
  if(!/^data:image\/(png|jpeg|webp|gif);base64,/.test(out.logo))out.logo="";
  return out;
}
function cartoucheSocieteEcrire(o){
  if(typeof profEcrire==="function")profEcrire(CARTOUCHE_PROFIL,o);
}

/* Tout ce que le cartouche affiche. `info` : les champs du document ; à vide,
   le titre est le nom du projet et les numéros en suivent la révision. */
function cartoucheChamps(info,feuille,numero,variante){
  const lu=fn=>{try{return typeof fn==="function"?String(fn()||""):"";}catch(_){return "";}};
  const projet=lu(typeof projNom==="function"?projNom:null);
  const rev=lu(typeof projdRevision==="function"?projdRevision:null)||"A";
  const i=cartoucheInfoNorm(info);
  return Object.assign(cartoucheSociete(),{
    titre:i.titre||projet||"Sans projet",
    dessine:i.dessine||"", dateDessin:i.dateDessin||"",
    verifie:i.verifie||"", dateVerif:i.dateVerif||"",
    schNo:i.schNo||(projet?projet+"SCH-"+rev:""),
    pcbNo:i.pcbNo||(projet?projet+"PCB-"+rev:""),
    feuille:feuille||"", numero:numero||"", variante:variante||""
  });
}

/* Logos décodés une fois ; le premier dessin redemande l'image quand elle est
   prête. */
const CARTOUCHE_IMG=new Map();
function cartoucheImage(src){
  if(!src||typeof Image==="undefined")return null;
  let im=CARTOUCHE_IMG.get(src);
  if(!im){
    im=new Image();
    im.onload=()=>{if(typeof draw==="function")draw();};
    im.src=src;
    CARTOUCHE_IMG.set(src,im);
  }
  return im.complete&&im.naturalWidth?im:null;
}

/* Au clic : aucun → A4 → A3 → aucun */
function cartoucheSuivant(f){return f==="A4"?"A3":f==="A3"?"":"A4";}

/* La page : bord, cadre à 10 mm, bande des repères de zones entre 5 et 10 mm.
   (x0, y0) : coin haut gauche de la page. `style` : « sch » ou « pcb ». */
function cartoucheDessiner(c,x0,y0,u,format,ch,style){
  const F=CARTOUCHE_FORMATS[format];
  if(!F)return;
  const K=CARTOUCHE_COULEURS, W=F.w*u, H=F.h*u, a=5*u, b=10*u;
  const trait=(xa,ya,xb,yb,lw)=>{c.lineWidth=(lw||0.25)*u;c.beginPath();c.moveTo(xa,ya);c.lineTo(xb,yb);c.stroke();};
  /* texte : taille en mm, ancre g / m / d, tassé à `max` mm s'il déborde */
  const T=(s,x,y,mm,o)=>{
    o=o||{};
    c.fillStyle=o.coul||K.texte;
    c.font=(o.gras?"bold ":"")+(mm*u)+"px sans-serif";
    c.textAlign=o.ancre==="m"?"center":o.ancre==="d"?"right":"left";
    if(o.max)c.fillText(String(s),x,y,Math.max(u,o.max*u));else c.fillText(String(s),x,y);
  };
  c.save();
  c.strokeStyle=K.trait;c.textBaseline="alphabetic";
  c.lineWidth=0.2*u;c.strokeRect(x0,y0,W,H);
  c.lineWidth=0.5*u;c.strokeRect(x0+a,y0+a,W-2*a,H-2*a);
  c.lineWidth=0.35*u;c.strokeRect(x0+b,y0+b,W-2*b,H-2*b);
  const pc=(W-2*b)/F.col, pl=(H-2*b)/F.lig;
  for(let i=0;i<F.col;i++){
    const x=x0+b+pc*i;
    if(i){trait(x,y0+a,x,y0+b);trait(x,y0+H-b,x,y0+H-a);}
    T(i+1,x+pc/2,y0+a+3.6*u,2.5,{ancre:"m",coul:K.zone});
    T(i+1,x+pc/2,y0+H-a-1.2*u,2.5,{ancre:"m",coul:K.zone});
  }
  for(let j=0;j<F.lig;j++){
    const y=y0+b+pl*j, l=String.fromCharCode(65+j);
    if(j){trait(x0+a,y,x0+b,y);trait(x0+W-b,y,x0+W-a,y);}
    T(l,x0+a+2.5*u,y+pl/2+u,2.5,{ancre:"m",coul:K.zone});
    T(l,x0+W-a-2.5*u,y+pl/2+u,2.5,{ancre:"m",coul:K.zone});
  }
  T(format,x0+W-1.5*u,y0+H-1.2*u,2.2,{ancre:"d",coul:K.zone});
  (style==="pcb"?cartouchePcb:cartoucheSch)(c,x0+W-b,y0+H-b,u,ch,T,trait);
  c.restore();
}

/* la société à gauche du cartouche : nom, adresse, logo, TEL, site */
function cartoucheBlocSociete(c,x,y,w,yb,u,ch,T){
  let ly=y+3.4*u;
  if(ch.societe){T(ch.societe.toUpperCase(),x+1.2*u,ly,2.3,{gras:true,max:w/u-2.4});ly+=2.8*u;}
  for(const l of String(ch.adresse||"").split(/\r?\n|;/).map(s=>s.trim()).filter(Boolean).slice(0,3)){
    T(l,x+1.2*u,ly,2,{max:w/u-2.4});ly+=2.5*u;
  }
  const bas=yb-(ch.tel?3.4*u:0)-(ch.web?2.8*u:0)-1.2*u;
  const im=cartoucheImage(ch.logo);
  if(im&&bas-ly>2*u){
    const hMax=Math.min(bas-ly-0.8*u,9*u), wMax=Math.min(w-2.4*u,32*u), k=Math.min(hMax/im.naturalHeight,wMax/im.naturalWidth);
    c.drawImage(im,x+1.2*u,ly+0.2*u,im.naturalWidth*k,im.naturalHeight*k);
  }
  if(ch.tel)T("TEL : "+ch.tel,x+1.2*u,yb-(ch.web?4.2:1.4)*u,2,{max:w/u-2.4});
  if(ch.web)T(ch.web,x+1.2*u,yb-1.4*u,2,{max:w/u-2.4});
}

/* Cartouche du schéma, 165 × 36 mm, son coin bas droit en (xr, yr). */
function cartoucheSch(c,xr,yr,u,ch,T,trait){
  const K=CARTOUCHE_COULEURS, w=165*u, h=36*u, x=xr-w, y=yr-h;
  const xA=x+52*u, xB=x+118*u, g1=xA+22*u, g2=g1+23*u;
  const lab=(s,X,Y,o)=>T(s,X,Y,1.9,Object.assign({coul:K.etiquette},o||{}));
  c.lineWidth=0.5*u;c.strokeRect(x,y,w,h);
  trait(xA,y,xA,yr);trait(xB,y,xB,yr);
  cartoucheBlocSociete(c,x,y,52*u,yr,u,ch,T);
  /* DATE / NAME, DRAWN, CHECKED, SCH NO., PCB NO. */
  const rg=[4.5,6,6,9.75,9.75];
  let yy=y;
  const ys=rg.map(r=>{const t=yy;yy+=r*u;return t;});
  for(let i=1;i<rg.length;i++)trait(xA,ys[i],xB,ys[i]);
  trait(g1,y,g1,yr);trait(g2,y,g2,ys[3]);
  const mil=(i,d)=>ys[i]+rg[i]*u/2+(d||0.8)*u;
  lab("DATE",(g1+g2)/2,mil(0),{ancre:"m"});lab("NAME",(g2+xB)/2,mil(0),{ancre:"m"});
  const ligne=(i,etiq,a,b)=>{
    lab(etiq,xA+1.2*u,mil(i));
    T(a||"",(g1+g2)/2,mil(i),2.4,{ancre:"m",max:21});
    T(b||"—",(g2+xB)/2,mil(i),2.4,{ancre:"m",gras:true,max:21});
  };
  ligne(1,"DRAWN",ch.dateDessin,ch.dessine);
  ligne(2,"CHECKED",ch.dateVerif,ch.verifie);
  lab("SCH NO.",xA+1.2*u,mil(3));T(ch.schNo||"—",g1+1.2*u,mil(3),2.6,{gras:true,max:43});
  lab("PCB NO.",xA+1.2*u,mil(4));T(ch.pcbNo||"—",g1+1.2*u,mil(4),2.6,{gras:true,max:43});
  /* DOCUMENT TITLE, SCHEMATIC VIEW, VARIANT, SHEET */
  const r1=y+11*u, r2=r1+11*u, wr=47*u;
  trait(xB,r1,xr,r1);trait(xB,r2,xr,r2);
  const kase=(Y,etiq,val,mm)=>{lab(etiq,xB+1.2*u,Y+2.6*u);T(val||"—",xB+1.2*u,Y+7.6*u,mm,{gras:true,max:wr/u-2.4});};
  kase(y,"DOCUMENT TITLE",ch.titre,3);
  kase(r1,"SCHEMATIC VIEW",ch.feuille,2.6);
  kase(r2,"VARIANT",ch.variante||"Master",2.6);
  c.lineWidth=0.25*u;c.strokeRect(xr-17*u,yr-5*u,17*u,5*u);
  lab("SHEET",xr-15.8*u,yr-1.6*u,{coul:K.etiquette});
  T(ch.numero||"",xr-1.2*u,yr-1.5*u,2.2,{ancre:"d",gras:true});
}

/* Cartouche du PCB, 180 × 50 mm : la mise en page de dfCartoucheEn. */
function cartouchePcb(c,xr,yr,u,ch,T,trait){
  const K=CARTOUCHE_COULEURS, w=180*u, h=50*u, x=xr-w, y=yr-h;
  const r0=6*u, yb=yr-9*u, xA=x+w*0.3, xB=x+w*0.745;
  const lab=(s,X,Y,o)=>T(s,X,Y,1.8,Object.assign({coul:K.etiquette},o||{}));
  c.lineWidth=0.5*u;c.strokeRect(x,y,w,h);
  trait(x,y+r0,xB,y+r0);trait(xB,y,xB,yb);trait(x,yb,xr,yb);trait(xA,y+r0,xA,yb);
  lab("UNLESS OTHERWISE SPECIFIED DIMENSIONS ARE IN MM",x+1.2*u,y+r0-1.8*u);
  cartoucheBlocSociete(c,x,y+r0,xA-x,yb,u,ch,T);
  const g1=xA+(xB-xA)*0.3, g2=xA+(xB-xA)*0.65, rh=(yb-y-r0)/4;
  for(let i=1;i<4;i++)trait(xA,y+r0+rh*i,xB,y+r0+rh*i);
  trait(g1,y+r0,g1,yb);trait(g2,y+r0,g2,y+r0+rh*3);
  const yl=i=>y+r0+rh*i+rh/2+u;
  lab("DATE",(g1+g2)/2,yl(0),{ancre:"m"});lab("NAME",(g2+xB)/2,yl(0),{ancre:"m"});
  lab("DRAWN",xA+1.2*u,yl(1));T(ch.dateDessin||"",(g1+g2)/2,yl(1),2.5,{ancre:"m",max:(g2-g1)/u-2});
  T(ch.dessine||"—",(g2+xB)/2,yl(1),2.5,{ancre:"m",gras:true,max:(xB-g2)/u-2});
  lab("CHECKED",xA+1.2*u,yl(2));T(ch.dateVerif||"",(g1+g2)/2,yl(2),2.5,{ancre:"m",max:(g2-g1)/u-2});
  T(ch.verifie||"—",(g2+xB)/2,yl(2),2.5,{ancre:"m",gras:true,max:(xB-g2)/u-2});
  lab("PCB NO.",xA+1.2*u,yl(3));T(ch.pcbNo||"—",(g1+xB)/2,yl(3),2.6,{ancre:"m",gras:true,max:(xB-g1)/u-2});
  const ym=y+(yb-y)*0.47, xm=(xB+xr)/2, wr=(xr-xB)/u-2.4;
  trait(xB,ym,xr,ym);
  lab("DESIGN TITLE",xm,y+3.2*u,{ancre:"m"});
  T(ch.titre,xm,(y+ym)/2+2*u,2.9,{ancre:"m",gras:true,max:wr});
  lab("DRAWING NAME",xm,ym+3.2*u,{ancre:"m"});
  T(ch.feuille||"—",xm,ym+9*u,2.7,{ancre:"m",gras:true,max:wr});
  const conf=ch.confid||("CONFIDENTIAL : This document is proprietary and the property of "+(ch.societe||"its owner")+
    ". It shall not be reproduced, copied, lent or otherwise disposed of directly or indirectly. "+
    "Proprietary information should always be protected by a non-disclosure agreement or proprietary information agreement.");
  /* coupé à la largeur du cartouche, trois lignes au plus */
  c.font=(1.8*u)+"px sans-serif";
  const lignes=[];let l="";
  for(const m of conf.split(/\s+/)){
    const t=l?l+" "+m:m;
    if(l&&c.measureText(t).width>w-2.4*u){lignes.push(l);l=m;}else l=t;
  }
  if(l)lignes.push(l);
  lignes.slice(0,3).forEach((s,i)=>T(s,x+1.2*u,yb+2.6*u+i*2.3*u,1.8));
}

/* La fenêtre « Cartouche… » des deux éditeurs. `o` : {format, formats
   (proposés), info (champs du document), appliquer(format, info)}. La société
   s'écrit dans le profil, le reste passe par `appliquer`, qui en fait une
   étape d'historique. */
function cartoucheDialogue(o){
  if(typeof document==="undefined")return;
  const soc=cartoucheSociete(), info=cartoucheInfoNorm(o.info);
  const e=v=>(typeof esc==="function"?esc(v):String(v).replace(/[&<>"']/g,ch=>"&#"+ch.charCodeAt(0)+";"));
  const champ=(id,lib,val,ph)=>'<label style="display:flex;flex-direction:column;gap:2px;font-size:11.5px;color:var(--txt-dim)">'+e(lib)+
    '<input class="tbsel" data-c="'+id+'" value="'+e(val||"")+'" placeholder="'+e(ph||"")+'" style="font-size:12.5px"></label>';
  const ch=cartoucheChamps(info,"","","");
  const m=document.createElement("div");
  m.className="modal";
  m.innerHTML='<div class="box" style="max-width:620px;max-height:90vh;overflow:auto">'+
    '<h3>▭ Cartouche</h3>'+
    '<label style="display:flex;align-items:center;gap:8px;font-size:12.5px;margin:6px 0 10px">Format de page '+
      '<select class="tbsel" data-c="format">'+["","A4","A3"].map(f=>'<option value="'+f+'"'+(f===(o.format||"")?" selected":"")+'>'+(f?f+" paysage":"aucun")+'</option>').join("")+'</select></label>'+
    '<div style="font-weight:bold;font-size:12px;margin:8px 0 4px">Ce document</div>'+
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px 10px">'+
      champ("titre","Titre (DOCUMENT / DESIGN TITLE)",info.titre,ch.titre)+'<span></span>'+
      champ("dessine","Dessiné par (DRAWN)",info.dessine,"initiales")+champ("dateDessin","Date",info.dateDessin,"jj/mm/aaaa")+
      champ("verifie","Vérifié par (CHECKED)",info.verifie,"initiales")+champ("dateVerif","Date",info.dateVerif,"jj/mm/aaaa")+
      champ("schNo","N° du schéma (SCH NO.)",info.schNo,ch.schNo)+champ("pcbNo","N° du PCB (PCB NO.)",info.pcbNo,ch.pcbNo)+
    '</div>'+
    '<div style="font-weight:bold;font-size:12px;margin:12px 0 4px">Société — dans votre profil, la même pour tous les projets</div>'+
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px 10px">'+
      champ("societe","Société",soc.societe,"")+champ("tel","Téléphone",soc.tel,"")+
      champ("adresse","Adresse (lignes séparées par ;)",soc.adresse,"")+champ("web","Site web",soc.web,"")+
    '</div>'+
    champ("confid","Mention de confidentialité (cartouche du PCB ; vide : texte d'usage)",soc.confid,"")+
    '<div style="display:flex;align-items:center;gap:8px;margin-top:8px;font-size:12px">Logo '+
      '<img data-c="apercu" alt="" style="max-height:32px;max-width:140px;background:#fff;padding:2px;border-radius:3px'+(soc.logo?"":";display:none")+'"'+(soc.logo?' src="'+soc.logo+'"':"")+'>'+
      '<button class="tb mini" data-c="logoChoisir">Choisir une image…</button>'+
      '<button class="tb mini" data-c="logoRetirer">Retirer</button>'+
      '<input type="file" accept="image/*" data-c="logoFichier" style="display:none"></div>'+
    '<div style="display:flex;justify-content:flex-end;gap:8px;margin-top:14px">'+
      '<button class="tb" data-c="annuler">Annuler</button><button class="tb on" data-c="ok">Appliquer</button></div>'+
    '</div>';
  document.body.appendChild(m);
  const q=k=>m.querySelector('[data-c="'+k+'"]');
  let logo=soc.logo;
  const apercu=()=>{const i=q("apercu");if(logo){i.src=logo;i.style.display="";}else{i.removeAttribute("src");i.style.display="none";}};
  const fermer=()=>m.remove();
  m.onclick=ev=>{if(ev.target===m)fermer();};
  q("annuler").onclick=fermer;
  q("logoRetirer").onclick=()=>{logo="";apercu();};
  q("logoChoisir").onclick=()=>q("logoFichier").click();
  q("logoFichier").onchange=ev=>{
    const f=ev.target.files&&ev.target.files[0];
    if(!f)return;
    /* ramené à 400 px de large au plus, en PNG : le profil reste léger */
    const rd=new FileReader();
    rd.onload=()=>{
      const im=new Image();
      im.onload=()=>{
        const k=Math.min(1,400/im.naturalWidth), cv=document.createElement("canvas");
        cv.width=Math.max(1,Math.round(im.naturalWidth*k));cv.height=Math.max(1,Math.round(im.naturalHeight*k));
        cv.getContext("2d").drawImage(im,0,0,cv.width,cv.height);
        const d=cv.toDataURL("image/png");
        if(d.length>CARTOUCHE_LOGO_MAX){alert("Logo trop lourd, même réduit : choisissez une image plus simple.");return;}
        logo=d;apercu();
      };
      im.onerror=()=>alert("Image illisible.");
      im.src=rd.result;
    };
    rd.readAsDataURL(f);
  };
  q("ok").onclick=()=>{
    const v=k=>q(k).value.trim();
    const s={};
    for(const k of CARTOUCHE_SOCIETE)if(k!=="logo")s[k]=v(k);
    s.logo=logo;
    cartoucheSocieteEcrire(s);
    const nouv={};
    for(const k of CARTOUCHE_DOC)if(v(k))nouv[k]=v(k);
    fermer();
    o.appliquer(q("format").value,nouv);
  };
}
