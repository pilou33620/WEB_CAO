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
