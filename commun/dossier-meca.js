"use strict";
/* ==========================================================================
   Dossier mécanique — commun à l'éditeur PCB et à la visionneuse IPC-2581
   --------------------------------------------------------------------------
   Ce qu'un mécanicien (ou une IA) doit savoir pour dessiner le boîtier d'une
   carte : contour, épaisseur, trous de fixation, encombrement et hauteur de
   chaque composant, ouvertures à prévoir. Spec : SPEC-dossier-meca.md.

   Chaque outil fabrique une ENTRÉE NEUTRE (mm, repère des Gerber, Y vers le
   haut, vue de dessus) :

     {contour:[{x,y}…], decoupes:[[{x,y}…]…], epaisseur:mm|null,
      trous:[{x,y,d,metallise,pad?}]        trous libres (NPTH hors empreinte)
      composants:[{id, ref, face:"dessus"|"dessous", x, y, rot,
                   corps:[{x,y}…], corps_estime?, hauteur_fichier?,
                   part_name, mpn, pkg, val, monte,
                   trous:[{x,y,d,metallise,pad?}]}]}   ses pastilles percées

   et ce fichier en tire le dossier (`mecaDonnees`), sans `S` ni DOM : c'est
   ce qui garantit que les deux outils donnent le même dossier.
   ========================================================================== */

const MECA_FORMAT="web_cao-meca-1";
const MECA_BORD=2;          // mm : un corps plus près du contour s'ouvre sur le bord
const MECA_H_MAX=100;       // mm : au-delà, une hauteur saisie est une faute de frappe
const MECA_CONNECTEUR=/^(USB|CN|J|P|X)\d/i;
const MECA_ORGANE=/^(SW|LED|DS|BT)\d/i;
const MECA_FIXATION=/^M?H\d/i;

function mecaR3(v){return Math.round(v*1000)/1000;}
function mecaPts(P){return P.map(p=>[mecaR3(p.x),mecaR3(p.y)]);}
function mecaBoite(P){
  let x1=Infinity,y1=Infinity,x2=-Infinity,y2=-Infinity;
  for(const p of P){x1=Math.min(x1,p.x);y1=Math.min(y1,p.y);x2=Math.max(x2,p.x);y2=Math.max(y2,p.y);}
  return Number.isFinite(x1)?{x1,y1,x2,y2}:{x1:0,y1:0,x2:0,y2:0};
}
/* une hauteur lisible : nombre fini, strictement positif, plausible */
function mecaHauteur(v){
  if(v==null||v==="")return null;
  const h=typeof v==="number"?v:parseFloat(String(v).replace(",","."));
  return Number.isFinite(h)&&h>0&&h<=MECA_H_MAX?h:null;
}

/* ---------- distances au contour ---------- */
function mecaDistSeg(p,a,b){
  const dx=b.x-a.x, dy=b.y-a.y, l=dx*dx+dy*dy;
  const t=l?Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/l)):0;
  return Math.hypot(p.x-a.x-t*dx,p.y-a.y-t*dy);
}
function mecaCroise(a,b,c,d){
  const o=(p,q,r)=>Math.sign((q.x-p.x)*(r.y-p.y)-(q.y-p.y)*(r.x-p.x));
  return o(a,b,c)*o(a,b,d)<0&&o(c,d,a)*o(c,d,b)<0;
}
function mecaDistSegSeg(a,b,c,d){
  if(mecaCroise(a,b,c,d))return 0;
  return Math.min(mecaDistSeg(a,c,d),mecaDistSeg(b,c,d),mecaDistSeg(c,a,b),mecaDistSeg(d,a,b));
}
function mecaDedans(p,P){
  let ok=false;
  for(let i=0,j=P.length-1;i<P.length;j=i++)
    if((P[i].y>p.y)!==(P[j].y>p.y)&&p.x<(P[j].x-P[i].x)*(p.y-P[i].y)/(P[j].y-P[i].y)+P[i].x)ok=!ok;
  return ok;
}
/* Le bord du contour le plus proche du corps : sa distance (0 si le corps le
   touche ou le dépasse) et le côté N / S / E / O, par la normale sortante du
   segment. shortcut: la normale sort à l'opposé du centre de la carte, ce qui
   est faux au fond d'une encoche profonde ; à revoir si une carte en U le
   demande. */
function mecaBordProche(corps,contour){
  if(contour.length<3||!corps.length)return null;
  const B=mecaBoite(contour), cx=(B.x1+B.x2)/2, cy=(B.y1+B.y2)/2;
  let best=null;
  for(let i=0;i<contour.length;i++){
    const a=contour[i], b=contour[(i+1)%contour.length];
    let d=Infinity;
    for(let k=0;k<corps.length;k++)d=Math.min(d,mecaDistSegSeg(corps[k],corps[(k+1)%corps.length],a,b));
    if(!best||d<best.d)best={d,a,b};
  }
  if(corps.some(p=>!mecaDedans(p,contour)))best.d=0;
  let nx=best.b.y-best.a.y, ny=best.a.x-best.b.x;
  if(nx*((best.a.x+best.b.x)/2-cx)+ny*((best.a.y+best.b.y)/2-cy)<0){nx=-nx;ny=-ny;}
  const bord=Math.abs(nx)>Math.abs(ny)?(nx>0?"E":"O"):(ny>0?"N":"S");
  return {d:best.d,bord};
}

/* ---------- le dossier ---------- */
/* `lib` : les lignes de la LIB (`CSV_LIB`, colonnes du CSV) ; `reglages` :
   {h:{<id>:mm}, ouv:{<id>:bool}}, posés à la main et relus d'un fichier, donc
   vérifiés ici ; `info` : {projet, revision, date}. */
function mecaDonnees(entree,lib,reglages,info){
  const E=entree||{}, R=reglages||{}, I=info||{};
  const saisieH=(R.h&&typeof R.h==="object")?R.h:{};
  const saisieO=(R.ouv&&typeof R.ouv==="object")?R.ouv:{};
  const contour=Array.isArray(E.contour)?E.contour:[];
  const ep=mecaHauteur(E.epaisseur);
  const avert=[];
  if(ep==null)avert.push("Épaisseur de la carte inconnue : les cotes en Z partent de la face dessus.");

  /* la LIB indexée par Part Name, puis par référence fabricant */
  const parNom=new Map(), parMpn=new Map(), cle=v=>String(v||"").trim().toLowerCase();
  for(const l of (Array.isArray(lib)?lib:[])){
    const h=mecaHauteur(l["Maximun Height"]);
    if(h==null)continue;
    if(cle(l["Part Name"]))parNom.set(cle(l["Part Name"]),h);
    for(const k of ["Part Number","manufacturer part Number"])
      if(cle(l[k])&&!parMpn.has(cle(l[k])))parMpn.set(cle(l[k]),h);
  }

  const comps=Array.isArray(E.composants)?E.composants:[];
  const estFixation=c=>(MECA_FIXATION.test(c.ref||"")||/MOUNT|TROU/i.test(c.pkg||""))&&
                       Array.isArray(c.trous)&&c.trous.length===1;
  const fixation=(id,t)=>({id,x:mecaR3(t.x),y:mecaR3(t.y),d:mecaR3(t.d),metallise:!!t.metallise,
                           d_degagement:mecaR3(t.pad>t.d?t.pad:t.d+2)});
  const fixations=comps.filter(estFixation).map(c=>fixation(c.ref,c.trous[0]));
  const pris=new Set(comps.map(c=>c.ref));
  let n=0;
  for(const t of (Array.isArray(E.trous)?E.trous:[])){
    if(!(t.d>0))continue;
    let id;
    do id="H"+(++n); while(pris.has(id));
    fixations.push(fixation(id,t));
  }

  const composants=[];
  for(const c of comps){
    if(estFixation(c))continue;
    const ref=String(c.ref||"?"), face=c.face==="dessous"?"dessous":"dessus";
    const corps=Array.isArray(c.corps)?c.corps:[];
    let h=mecaHauteur(saisieH[c.id]), src="saisie";
    if(h==null){h=mecaHauteur(c.hauteur_fichier);src="fichier";}
    if(h==null){h=parNom.get(cle(c.part_name))||parMpn.get(cle(c.mpn))||null;src="lib";}
    if(h==null){
      src="inconnue";
      avert.push(ref+" : hauteur inconnue (absente de la LIB et du fichier, non saisie)");
    }
    if(c.corps_estime)avert.push(ref+" : encombrement estimé d'après les pastilles (pas de contour de boîtier dans le fichier)");

    const auto=MECA_CONNECTEUR.test(ref)||MECA_ORGANE.test(ref)||
               (/^D\d/i.test(ref)&&/LED/i.test([c.val,c.pkg,c.part_name].join(" ")));
    const veut=typeof saisieO[c.id]==="boolean"?saisieO[c.id]:auto;
    let ouverture=null;
    if(veut){
      const pb=mecaBordProche(corps,contour);
      if(pb&&pb.d<MECA_BORD){
        const b=mecaBoite(corps), ns=pb.bord==="N"||pb.bord==="S";
        const z0=face==="dessus"?0:-(ep||0);
        /* dessus de 0 à h ; dessous de -ep-h à -ep ; hauteur inconnue → null */
        ouverture={type:"bord",bord:pb.bord,debut:mecaR3(ns?b.x1:b.y1),fin:mecaR3(ns?b.x2:b.y2),
          z_min:face==="dessus"?0:(h==null?null:mecaR3(z0-h)),
          z_max:face==="dessus"?(h==null?null:mecaR3(h)):mecaR3(z0)};
      }else ouverture={type:"face",face};
    }
    const o={ref,face,x:mecaR3(c.x),y:mecaR3(c.y),rot:mecaR3(c.rot||0),corps:mecaPts(corps),
             hauteur:h==null?null:mecaR3(h),source_hauteur:src,monte:c.monte!==false,
             boitier:String(c.pkg||""),valeur:String(c.val||""),ouverture};
    if(c.corps_estime)o.corps_estime=true;
    composants.push(o);
  }

  const hmax=f=>composants.reduce((m,c)=>c.face===f&&c.hauteur!=null?Math.max(m,c.hauteur):m,0);
  const dessus=hmax("dessus"), dessous=hmax("dessous");
  const B=mecaBoite(contour);
  return {
    format:MECA_FORMAT,
    projet:String(I.projet||""), revision:String(I.revision||""), date:String(I.date||""),
    repere:"mm ; origine des Gerber ; X vers la droite, Y vers le haut, vue de dessus ; "+
           "Z = 0 sur la face dessus, Z > 0 vers le haut, la face dessous à Z = -épaisseur. "+
           "Corps = rectangle d'encombrement du boîtier ; hauteur = depuis la surface de la carte.",
    carte:{contour:mecaPts(contour),
           decoupes:(Array.isArray(E.decoupes)?E.decoupes:[]).map(mecaPts),
           encombrement:{x1:mecaR3(B.x1),y1:mecaR3(B.y1),x2:mecaR3(B.x2),y2:mecaR3(B.y2)},
           epaisseur:ep==null?null:mecaR3(ep)},
    fixations, composants,
    hauteur_max:{dessus:mecaR3(dessus),dessous:mecaR3(dessous),total:mecaR3((ep||0)+dessus+dessous)},
    avertissements:avert
  };
}

/* ==========================================================================
   La feuille « Plan mécanique » — dessinée depuis le JSON, avec les
   primitives des plans de l'éditeur (29-draftsman.js) : ce qu'on donne à
   l'IA est exactement ce qui est dessiné.
   --------------------------------------------------------------------------
   À gauche, vue de dessus et, dessous, vues de face (depuis le bord S) et de
   côté (depuis le bord E), toutes trois à la même échelle normalisée ; à
   droite, les tableaux. `monde` (éditeur seulement) : {vers, depuis} entre
   le repère de l'éditeur et celui des Gerber ; il donne à la vue de dessus la
   transformation qu'attendent les cotes posées à la main (34-draftsman-vues.js).
   ========================================================================== */
const MECA_OUV=[0.85,0.15,0.1];        // rouge des ouvertures
const MECA_OUV_FOND=[1,0.86,0.82];

function mecaFr(v){return v==null?"—":fmt(v,2).replace(".",",");}
function mecaOuvTxt(o){
  if(!o)return "";
  return o.type==="bord"?"bord "+o.bord:"face "+o.face;
}
function mecaFeuilles(J,ctx,monde){
  const F=dfNouvelle(ctx,"Plan mécanique","meca");
  const Z=dfZone(F), colW=Z.cart.w, colX=Z.x2-colW;
  const W=colX-8-Z.x1, H=Z.y2-Z.y1-10;
  const C=J.carte, B={x1:C.encombrement.x1,y1:C.encombrement.y1,x2:C.encombrement.x2,y2:C.encombrement.y2};
  for(const c of J.composants)for(const p of c.corps){
    B.x1=Math.min(B.x1,p[0]);B.x2=Math.max(B.x2,p[0]);B.y1=Math.min(B.y1,p[1]);B.y2=Math.max(B.y2,p[1]);}
  const bw=Math.max(B.x2-B.x1,1e-3), bh=Math.max(B.y2-B.y1,1e-3);
  const ep=C.epaisseur||0, hD=J.hauteur_max.dessus, hB=J.hauteur_max.dessous;
  const bz=Math.max(ep+hD+hB,1);
  /* une seule échelle pour les trois vues : dessus en haut, face et côté
     côte à côte en dessous (marges : cotes et titres) */
  const kmax=Math.max(1e-3,Math.min((W-30)/bw,(W-60)/(bw+bh),(H-70)/(bh+bz)));
  const k=DF_ECHELLES.find(e=>e<=kmax)||kmax, ech=dfEchelleTxt(k);
  F.echelle=ech;
  const ox=Z.x1+22, oy=Z.y1+16;
  const TG=(x,y)=>({x:ox+(x-B.x1)*k,y:oy+(B.y2-y)*k});
  const P=p=>TG(p[0],p[1]);

  /* ---- vue de dessus ---- */
  dfTexte(F,"VUE DE DESSUS — ÉCHELLE "+ech,Z.x1,Z.y1+5,9,{gras:true,cat:"titre"});
  const m=dfVueDebut(F);
  dfCalque(F,"CONTOUR");
  dfPoly(F,C.contour.map(P),{ferme:true,lw:0.45});
  for(const d of C.decoupes)dfPoly(F,d.map(P),{ferme:true,lw:0.35});
  dfCalque(F,"COMPOSANTS");
  for(const c of J.composants){
    const pts=c.corps.map(P);
    if(pts.length<3)continue;
    const o={ferme:true,lw:c.ouverture?0.3:0.18,tirets:c.face==="dessous"||!c.monte,
             trait:c.ouverture?MECA_OUV:0.25};
    if(c.ouverture)o.plein=MECA_OUV_FOND;
    dfPoly(F,pts,o);
    const cx=pts.reduce((a,p)=>a+p.x,0)/pts.length, cy=pts.reduce((a,p)=>a+p.y,0)/pts.length;
    const lieu=c.ref+" · "+c.face+(c.hauteur!=null?" · h "+mecaFr(c.hauteur)+" mm":"");
    if(c.ouverture)dfTexte(F,c.ref,cx,cy+1,6.5,{ancre:"m",gras:true,c:MECA_OUV,cat:"repere",lieu});
    else dfTexte(F,c.ref,cx,cy,5,{ancre:"m",cache:true,cat:"repere",lieu});
    if(!c.monte)dfTexte(F,"NM",cx,cy+3.2,5,{ancre:"m",c:0.4,cat:"repere"});
  }
  dfCalque(F,"FIXATIONS");
  for(const f of J.fixations){
    const s=TG(f.x,f.y);
    dfCercle(F,s.x,s.y,f.d/2*k,{lw:0.25});
    dfCercle(F,s.x,s.y,f.d_degagement/2*k,{lw:0.12,trait:0.45});
    dfLigne(F,s.x-1.5,s.y,s.x+1.5,s.y,0.12);dfLigne(F,s.x,s.y-1.5,s.x,s.y+1.5,0.12);
    dfTexte(F,f.id+"  Ø "+mecaFr(f.d),s.x+f.d_degagement/2*k+1,s.y-1,6.5,{cat:"percage",lieu:f.id});
  }
  dfCalque(F);
  /* cotes hors tout, et cotes en ordonnée des fixations depuis l'origine */
  const E=C.encombrement, bg=TG(E.x1,E.y1), bd=TG(E.x2,E.y1), hg=TG(E.x1,E.y2);
  dfCote(F,bg,bd,"h",9,mecaFr(E.x2-E.x1)+" mm");
  dfCote(F,hg,bg,"v",12,mecaFr(E.y2-E.y1)+" mm");
  dfCalque(F,"COTES");
  const vusX=new Set(), vusY=new Set();
  for(const f of J.fixations){
    const s=TG(f.x,f.y);
    if(!vusX.has(f.x)){vusX.add(f.x);
      dfLigne(F,s.x,s.y,s.x,bg.y+4,0.1,0.45,true);
      dfTexte(F,mecaFr(f.x),s.x+0.9,bg.y+4.5,6,{rot:90,ancre:"d",cat:"cote"});}
    if(!vusY.has(f.y)){vusY.add(f.y);
      dfLigne(F,s.x,s.y,hg.x-4,s.y,0.1,0.45,true);
      dfTexte(F,mecaFr(f.y),hg.x-4.5,s.y+0.9,6,{ancre:"d",cat:"cote"});}
  }
  const so=TG(0,0);
  if(so.x>=ox-2&&so.x<=ox+bw*k+2&&so.y>=oy-2&&so.y<=oy+bh*k+2){
    dfCercle(F,so.x,so.y,1.1,{lw:0.2});
    dfTexte(F,"0,0",so.x+1.6,so.y+3.4,6,{c:0.25,cat:"cote"});
  }
  dfCalque(F);
  /* la vue se déclare ; dans l'éditeur, en repère de l'éditeur, pour les
     cotes posées à la main */
  const V={k,echelle:ech,T:TG,inv:(X,Y)=>({x:B.x1+(X-ox)/k,y:B.y2-(Y-oy)/k})};
  if(monde){
    V.T=(x,y)=>{const g=monde.vers(x,y);return TG(g.x,g.y);};
    V.inv=(X,Y)=>{const g={x:B.x1+(X-ox)/k,y:B.y2-(Y-oy)/k};return monde.depuis(g.x,g.y);};
  }
  const cle=dfCleVue(F,"carte");
  if(ctx.cfg&&Array.isArray(ctx.cfg.cotes)&&typeof dfAnnoter==="function")dfAnnoter(F,V,cle,ctx);
  dfVueFin(F,m,cle,"carte",{V});

  /* ---- colonne de droite ---- */
  const blocs=[dfBlocTitre("Carte"),...dfTableau([{t:"Grandeur",p:60},{t:"mm",p:30,a:"d"}],[
    ["Encombrement du contour (X × Y)",mecaFr(E.x2-E.x1)+" × "+mecaFr(E.y2-E.y1)],
    ["Épaisseur de la carte",mecaFr(C.epaisseur)],
    ["Plus haut composant, face dessus",mecaFr(hD)],
    ["Plus haut composant, face dessous",mecaFr(hB)],
    ["Hauteur totale (dessous + carte + dessus)",mecaFr(J.hauteur_max.total)]],{cat:"tableau"})];
  if(J.fixations.length)blocs.push(dfBlocEspace(4),dfBlocTitre("Trous de fixation"),
    ...dfTableau([{t:"N°",p:12,a:"m"},{t:"X",p:16,a:"d"},{t:"Y",p:16,a:"d"},{t:"Ø",p:13,a:"d"},
                  {t:"Métallisé",p:16,a:"m"},{t:"Ø dégagement",p:21,a:"d"}],
      J.fixations.map(f=>[f.id,mecaFr(f.x),mecaFr(f.y),mecaFr(f.d),f.metallise?"Oui":"Non",mecaFr(f.d_degagement)]),
      {cat:"percage"}));
  const ouv=J.composants.filter(c=>c.ouverture);
  blocs.push(dfBlocEspace(4),dfBlocTitre("Ouvertures dans le boîtier"));
  if(ouv.length)blocs.push(...dfTableau([{t:"Repère",p:16},{t:"Où",p:18},{t:"De",p:13,a:"d"},{t:"À",p:13,a:"d"},
                                         {t:"Z min",p:14,a:"d"},{t:"Z max",p:14,a:"d"}],
    ouv.map(c=>{const o=c.ouverture;
      return o.type==="bord"?[c.ref,mecaOuvTxt(o),mecaFr(o.debut),mecaFr(o.fin),mecaFr(o.z_min),mecaFr(o.z_max)]
                            :[c.ref,mecaOuvTxt(o),"","","",""];}),{cat:"repere"}));
  else blocs.push(...dfBlocParagraphes([{texte:"Aucune.",retrait:1}]));
  const notes=["Repère : "+J.repere,"De / À : position le long du bord (X pour N et S, Y pour E et O). "+
               "Ouverture de face : au-dessus (ou au-dessous) du corps dessiné."].concat(J.avertissements);
  blocs.push(dfBlocEspace(4),dfBlocTitre("Notes"),
    ...dfBlocParagraphes(notes.map((t,i)=>({num:(i+1)+".",texte:t,retrait:6}))));
  return dfFlux(ctx,F,{x:colX,y:Z.y1,w:colW,bas:Z.cart.y-4},blocs,"Plan mécanique","meca");
}
