"use strict";
/* ==========================================================================
   Éditeur PCB — noyau
   État, couches, repères, empreintes génériques, nets et classes, contour.
   ========================================================================== */
/* ==========================================================================
   Éditeur PCB — reprend le style et les conventions de l'éditeur schématique.
   Unité monde : le millimètre. S.scale = pixels par millimètre.
   ========================================================================== */
const C_BG      = "#141416";
const C_GRID    = "#232529";
const C_GRIDMAJ = "#32353c";
/* La grille se reprend sur la carte : le substrat y est plus clair que le
   fond, ses lignes le sont donc d'autant, sinon elle s'y efface. */
const C_GRID_S  = "#26302d";
const C_GRIDMAJ_S = "#35423e";
const C_SUB     = "#182120";        // substrat de la carte
const C_EDGE    = "#e6e8ec";        // contour de carte
const C_SILK_T  = "#eef1f5";
const C_SILK_B  = "#7e8794";
const C_THRU    = "#f2c744";        // pastille traversante : toutes couches
const C_DRILL   = "#0c0d0f";
const C_SEL     = "#8af0ff";
const C_RATS    = "#5d6773";
const C_ERR     = "#e8443a";
const INNER_PAL = ["#5bd6a0","#c98cf0","#f2a03d","#b5d334","#f070b0","#8fa0ff"];

const PWR_RE = /^(gnd|agnd|dgnd|pgnd|masse|0v|vcc|vdd|vee|vss|\+?\d+v\d*|v\+|v-)$/i;

/* ---------- helpers courts ---------- */
const $ = id => document.getElementById(id);
const clamp = (v,a,b) => v<a?a:(v>b?b:v);
const r3 = v => Math.round(v*1000)/1000;
/* le cuivre se compte en dizaines de micromètres : trois décimales de
   millimètre ne suffisent pas à écrire 17,5 µm sans le déformer */
const r4 = v => Math.round(v*10000)/10000;
const fmt = (v,n) => Number(v).toFixed(n==null?2:n);
function esc(s){
  return String(s).replace(/[&<>"'`]/g,ch=>
    ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;","`":"&#96;"}[ch]));
}
function dist(x1,y1,x2,y2){return Math.hypot(x2-x1,y2-y1);}
/* ---------- les huit sens du tracé ----------
   Un segment qui ne tombe pas sur un multiple de 45° est un **angle bâtard**
   (*off-angle track*) : il casse l'optimisation des Gerber, et certains
   fabricants le refusent au contrôle d'entrée. `angleOff` en donne l'écart au
   plus proche des huit sens, en radians ; la tolérance est serrée, l'arrondi au
   micron d'un vrai 45° restant mille fois en dessous. Un trajet nul n'a pas
   d'angle : son écart est nul. */
const ANG_TOL=0.1*Math.PI/180;                 // 0,1°
const DIR8=[[1,0],[1,1],[0,1],[-1,1],[-1,0],[-1,-1],[0,-1],[1,-1]]
  .map(d=>{const n=Math.hypot(d[0],d[1]);return {x:d[0]/n,y:d[1]/n};});
function angleOff(dx,dy){
  if(Math.abs(dx)<1e-12&&Math.abs(dy)<1e-12)return 0;
  const a=Math.atan2(dy,dx), q=Math.PI/4;
  return Math.abs(a-Math.round(a/q)*q);
}
function angleOk(dx,dy){return angleOff(dx,dy)<=ANG_TOL;}
/* l'angle du segment tel qu'on le lit, entre 0 et 180° */
function angleDeg(dx,dy){
  let a=Math.atan2(dy,dx)*180/Math.PI;
  if(a<0)a+=180;
  return a>=180-1e-9?0:a;
}
/* distance d'un point au segment [a,b] */
function segDist(px,py,x1,y1,x2,y2){
  const dx=x2-x1, dy=y2-y1, l2=dx*dx+dy*dy;
  if(l2<1e-12)return dist(px,py,x1,y1);
  let t=((px-x1)*dx+(py-y1)*dy)/l2;
  t=clamp(t,0,1);
  return dist(px,py,x1+t*dx,y1+t*dy);
}

/* ==========================================================================
   Pistes circulaires
   --------------------------------------------------------------------------
   Une piste droite porte deux bouts ; une piste courbe porte les mêmes deux
   bouts, plus l'angle qu'elle balaie entre eux — `t.ca`, en radians, signé.
   Absent ou nul, la piste est droite et rien ne change : tout ce qui suit
   retombe alors exactement sur `dist`, `segDist` et un `lineTo`.

   Pourquoi l'angle balayé plutôt qu'un centre et un rayon enregistrés à part :
   les bouts restent les bouts. La connectivité les compare au micron, un coude
   tiré à la souris les réécrit, le .json les relit — aucun de ces codes n'a à
   savoir que la piste est courbe. Un centre rangé à côté, lui, aurait dérivé
   au premier sommet déplacé, et l'arc ne serait plus passé par ses propres
   bouts : du cuivre qui ne touche plus ce qu'il relie.

   Le signe suit le sens des angles du canevas, où l'axe Y descend : positif,
   l'arc tourne dans le sens des aiguilles d'une montre à l'écran ; négatif,
   dans l'autre. Un tour complet n'a pas de corde — deux bouts confondus ne
   sont plus une piste — : `normTrack` borne l'angle juste en deçà, et une
   boucle fermée s'écrit en deux demi-tours, comme partout ailleurs.

   Ce que ça sert : une antenne NFC ronde, une boucle d'accord, un coude
   adouci. C'est toujours la même chose — quelques arcs bout à bout, chacun
   rangé comme une piste de plus, avec sa couche, sa largeur et son net. Le
   routeur, lui, n'en pose pas : il ne sait faire que du 45°. Les arcs
   arrivent d'un fichier, et l'éditeur doit savoir les montrer, les mesurer,
   les contrôler et les sortir en Gerber sans les redresser au passage. */
const ARC_MIN=1e-4;              // en deçà, l'arc ne se distingue plus de sa corde
const ARC_MAX=r4(2*Math.PI-1e-3);// un tour complet n'a pas de corde ; arrondi
                                 // comme l'angle enregistré, pour qu'un angle
                                 // borné reste sous sa propre borne
const ARC_SAG=0.005;             // flèche tolérée d'une corde de découpe, en mm
function isArc(t){return !!(t&&Number.isFinite(t.ca)&&Math.abs(t.ca)>ARC_MIN);}
/* Centre, rayon et angles de l'arc, ou null si la piste est droite. Tout se
   déduit de la corde et de l'angle : le centre est sur la médiatrice, à la
   distance que donne la moitié de l'angle — un demi-tour l'amène pile au
   milieu de la corde, un angle rasant l'envoie au loin. */
function arcOf(t){
  if(!isArc(t))return null;
  const dx=t.x2-t.x1, dy=t.y2-t.y1, d=Math.hypot(dx,dy);
  if(d<1e-9)return null;
  const h=t.ca/2, s=Math.sin(h);
  if(Math.abs(s)<1e-9)return null;
  const r=Math.abs(d/(2*s)), k=(d/2)/Math.tan(h);
  const cx=(t.x1+t.x2)/2-(dy/d)*k, cy=(t.y1+t.y2)/2+(dx/d)*k;
  const a1=Math.atan2(t.y1-cy,t.x1-cx);
  return {cx,cy,r,a1,a2:a1+t.ca,ca:t.ca};
}
/* L'angle `a`, vu du centre, ramené à ce qu'il a parcouru du balayage depuis
   le premier bout : 0 au départ, |ca| à l'arrivée, davantage s'il tombe dans
   le secteur que l'arc ne couvre pas. */
function arcSweep(A,a){
  const d=(a-A.a1)*(A.ca<0?-1:1);
  return ((d%(2*Math.PI))+2*Math.PI)%(2*Math.PI);
}
function arcOn(A,a){return arcSweep(A,a)<=Math.abs(A.ca);}
/* Longueur de cuivre : la corde pour une droite, le rayon fois l'angle pour un
   arc. C'est cette longueur-là que réclament la ligne de transmission et le
   tableau des nets — mesurer la corde raccourcirait un demi-tour d'un tiers. */
function trkLen(t){
  const A=arcOf(t);
  return A?A.r*Math.abs(A.ca):dist(t.x1,t.y1,t.x2,t.y2);
}
/* Le point à la fraction `u` du parcours, sur l'axe de la piste. */
function trkAt(t,u){
  const A=arcOf(t);
  if(!A)return {x:t.x1+(t.x2-t.x1)*u, y:t.y1+(t.y2-t.y1)*u};
  const a=A.a1+A.ca*u;
  return {x:A.cx+A.r*Math.cos(a), y:A.cy+A.r*Math.sin(a)};
}
/* Le milieu — celui qui pointe un défaut, celui qui interroge la zone sous la
   piste. Pris sur l'axe et non sur la corde : le milieu d'un demi-tour est au
   sommet du ventre, pas au centre du cercle, où il n'y a pas de cuivre. */
function trkMid(t){return trkAt(t,0.5);}
/* Distance d'un point à l'axe de la piste. Hors du balayage, c'est le bout le
   plus proche qui compte : le cuivre s'arrête là, il ne fait pas le tour. */
function trkDist(px_,py_,t){
  const A=arcOf(t);
  if(!A)return segDist(px_,py_,t.x1,t.y1,t.x2,t.y2);
  if(arcOn(A,Math.atan2(py_-A.cy,px_-A.cx)))
    return Math.abs(Math.hypot(px_-A.cx,py_-A.cy)-A.r);
  return Math.min(dist(px_,py_,t.x1,t.y1),dist(px_,py_,t.x2,t.y2));
}
/* Boîte de l'axe. Le ventre de l'arc sort de la boîte de sa corde : les points
   cardinaux qui tombent dans le balayage la repoussent. Sans eux, l'index
   spatial rangerait la piste dans des cases qu'elle ne traverse pas — et le
   contrôle d'isolation manquerait ce qu'elle frôle. */
function trkBBox(t){
  const b={x1:Math.min(t.x1,t.x2), y1:Math.min(t.y1,t.y2),
           x2:Math.max(t.x1,t.x2), y2:Math.max(t.y1,t.y2)};
  const A=arcOf(t);
  if(!A)return b;
  for(let q=0;q<4;q++){
    const a=q*Math.PI/2;
    if(!arcOn(A,a))continue;
    const x=A.cx+A.r*Math.cos(a), y=A.cy+A.r*Math.sin(a);
    b.x1=Math.min(b.x1,x);b.y1=Math.min(b.y1,y);
    b.x2=Math.max(b.x2,x);b.y2=Math.max(b.y2,y);
  }
  return b;
}
/* L'arc en cordes, pour tout ce qui ne sait mesurer que des segments : le
   modèle du monde du routeur, donc le contrôle d'isolation avec lui. Le pas
   est celui qui garde la corde à moins d'une flèche de l'arc — au-delà, le
   contrôle jugerait un cuivre qui n'est pas là. Une piste droite rend son
   unique segment : les appelants n'ont pas deux chemins à tenir. */
function trkSegs(t,sag){
  const A=arcOf(t);
  if(!A)return [{x1:t.x1,y1:t.y1,x2:t.x2,y2:t.y2}];
  const f=Math.min(A.r,sag>0?sag:ARC_SAG);
  const step=2*Math.acos(clamp(1-f/A.r,-1,1));
  const n=clamp(Math.ceil(Math.abs(A.ca)/Math.max(step,1e-3)),1,512);
  const out=[];
  let ax=t.x1, ay=t.y1;
  for(let i=1;i<=n;i++){
    const p=i===n?{x:t.x2,y:t.y2}:trkAt(t,i/n);
    out.push({x1:ax,y1:ay,x2:p.x,y2:p.y});
    ax=p.x;ay=p.y;
  }
  return out;
}
/* L'axe de la piste posé dans le chemin courant, arc compris. Le drapeau du
   canevas se lit à l'envers du signe : ses angles croissent dans le sens des
   aiguilles d'une montre, l'axe Y descendant. */
function trkPath(c,t){
  const A=arcOf(t);
  c.moveTo(t.x1,t.y1);
  if(A)c.arc(A.cx,A.cy,A.r,A.a1,A.a2,t.ca<0);
  else c.lineTo(t.x2,t.y2);
}

/* ==========================================================================
   Couches
   ========================================================================== */
function cuId(i,n){return i===0?"L1_Top":(i===n-1?"L"+n+"_Bottom":"L"+(i+1)+"_Inner");}
function cuLabel(i,n){return i===0?"Top":(i===n-1?"Bottom":"Inner "+i);}
function cuColor(i,n){
  if(i===0)return "#e8443a";
  if(i===n-1)return "#3fa0ea";
  return INNER_PAL[(i-1)%INNER_PAL.length];
}

/* ==========================================================================
   Rôle d'une couche de cuivre
   `plane` reste la vérité pour tout ce qui fabrique du cuivre — zone pleine
   carte, DRC, Gerber. Le rôle en est la lecture humaine, et il en dit plus :
   un plan de masse et un plan d'alimentation se ressemblent pour le graveur,
   pas pour celui qui lit l'empilage. setLayerRole() garde les deux d'accord ;
   c'est par là que passent le panneau d'empilage et le menu « Zone cuivre ».
   ========================================================================== */
const CU_ROLES={signal:"Signal",mixed:"Mixte (signal + cuivre)",
                gnd:"Plan de masse",pwr:"Plan d'alimentation",shield:"Blindage"};
const CU_ROLE_SHORT={signal:"Signal",mixed:"Mixte",gnd:"Masse",
                     pwr:"Alim.",shield:"Blindage"};
const GND_RE=/^(gnd|agnd|dgnd|pgnd|masse|0v|vss|vee)$/i;
/* les trois rôles qui entretiennent une zone pleine carte */
function rolePlane(r){return r==="gnd"||r==="pwr"||r==="shield";}
/* rôle déduit de l'ancien couple (plane, net) : c'est ce que voient les
   fichiers écrits avant que le rôle existe */
function roleFromPlane(plane,net){
  if(!plane)return "signal";
  return GND_RE.test(String(net||"").replace(/\s/g,""))?"gnd":"pwr";
}
/* Un rôle qui contredit le cuivre réellement posé ne veut rien dire : `plane`
   tranche, comme partout ailleurs. Cette règle sert à l'affichage, à la
   reconstruction de l'empilage et à la lecture d'un document. */
function coherentRole(role,plane,net){
  const r=CU_ROLES[role]?role:null;
  return (r&&rolePlane(r)===!!plane)?r:roleFromPlane(!!plane,net);
}
function layerRole(i){
  const L=S.cuL[i];
  return L?coherentRole(L.role,L.plane,L.net):"signal";
}
function roleLabel(i){
  const r=layerRole(i), L=S.cuL[i]||{};
  return CU_ROLE_SHORT[r]+(rolePlane(r)&&L.net?" "+L.net:"");
}
/* net proposé d'office à un plan : la masse pour un plan de masse ou un
   blindage, la première alimentation trouvée sinon */
function roleNet(role){
  const nets=netTable();
  if(role==="pwr"){
    const p=nets.find(n=>isPower(n.name)&&!GND_RE.test(n.name));
    return p?p.name:"";
  }
  const g=nets.find(n=>GND_RE.test(n.name));
  return g?g.name:"GND";
}
function setLayerRole(i,role,net){
  const L=S.cuL[i];
  if(!L||!CU_ROLES[role])return false;
  L.role=role;
  L.plane=rolePlane(role);
  if(L.plane){
    if(net!==undefined)L.net=net||"";
    if(!L.net)L.net=roleNet(role);
  }else L.net="";
  syncAutoZones();
  return true;
}

/* ==========================================================================
   Ce que la pile impose au perçage
   Un trou métallisé doit être plaqué sur toute sa longueur : le rapport entre
   cette longueur et son diamètre décide de la faisabilité. Et un via qui ne
   traverse pas la carte doit tomber dans ce qu'un pressage sait faire.
   ========================================================================== */
/* Les deux seuils du rapport d'aspect, en usage courant : au-delà de 8 : 1 la
   métallisation du trou se paie, au-delà de 10 : 1 peu de fabricants suivent.
   Ce sont des VALEURS D'USINE et non des vérités : un fabricant qui annonce du
   12 : 1 existe, et une série bon marché peut vouloir se tenir à 6 : 1. D'où
   les deux réglages du document, qui prennent le pas quand ils sont écrits. */
const ASPECT_WARN=8, ASPECT_MAX=10;
function aspWarn(){
  const v=+S.rule.aspWarn;
  return Number.isFinite(v)&&v>0?v:ASPECT_WARN;
}
function aspMax(){
  const v=+S.rule.aspMax;
  return Number.isFinite(v)&&v>0?Math.max(v,aspWarn()):ASPECT_MAX;
}
function aspectOf(len,d){return d>0?len/d:0;}
/* Une carte pressée en une seule fois ne sait percer, hors traversant, que :
     - un via enterré dans une âme, percé et métallisé avant pressage ;
     - un via borgne qui ne franchit que le diélectrique extérieur, au laser.
   Tout le reste suppose un laminage séquentiel : c'est faisable, mais c'est un
   autre prix et il faut le dire plutôt que de le découvrir sur le devis. */
function viaBuild(a,b){
  if(b<a){const k=a;a=b;b=k;}
  const n=S.cu;
  if(a<=0&&b>=n-1)return {kind:"through",ok:true,why:"traversant"};
  if(a===0||b===n-1){
    const outer=(a===0)?0:n-2;            // diélectrique extérieur franchi
    const depth=(a===0)?b:(n-1-a);
    const k=diAt(outer).k;
    if(depth>1)
      return {kind:"blind",ok:false,
              why:"borgne sur "+depth+" diélectriques : il faut un laminage séquentiel"};
    if(k==="core")
      return {kind:"blind",ok:false,
              why:"borgne à travers une âme : perçage à profondeur contrôlée, "+
                  "pas de micro-via laser"};
    return {kind:"blind",ok:true,
            why:"borgne dans le "+DI_KIND[k].toLowerCase()+" extérieur, au laser"};
  }
  if(b===a+1&&diAt(a).k==="core")
    return {kind:"buried",ok:true,
            why:"enterré dans le diélectrique "+(a+1)+", percé avant pressage"};
  if(b===a+1)
    return {kind:"buried",ok:false,
            why:"enterré de part et d'autre d'un "+DI_KIND[diAt(a).k].toLowerCase()+
                " : sans âme entre les deux couches, il faut un laminage séquentiel"};
  return {kind:"buried",ok:false,
          why:"enterré sur "+(b-a)+" diélectriques : un seul pressage n'y suffit pas"};
}
/* ---------- la nature d'un via, telle qu'on la choisit ----------
   `viaBuild` dit ce qu'une portée VAUT une fois la carte pressée ; ce qui suit
   est l'autre sens — on nomme la nature voulue, la portée s'en déduit. Quatre
   entrées et non trois : « borgne » ne dit pas de quel côté, et c'est justement
   ce qu'on veut désigner d'un geste.

   Ce n'est qu'un raccourci : les deux listes de couches restent la commande
   fine, un borgne qui descend de trois couches se règle là. La nature choisie
   garde d'ailleurs la profondeur en place quand elle a un sens — un borgne
   dessus qui reste borgne dessus ne remonte pas à une couche. */
const VIA_KINDS=[["through","Traversant"],["blindTop","Borgne dessus"],
                 ["blindBot","Borgne dessous"],["buried","Enterré"]];
function viaKindOf(v){
  const k=viaBuild(v.a,v.b).kind;
  return k!=="blind"?k:(Math.min(v.a,v.b)===0?"blindTop":"blindBot");
}
function viaKindTxt(k){
  const e=VIA_KINDS.find(x=>x[0]===k);
  return e?e[1]:k;
}
/* Ce que l'empilage permet : sans couche interne, un via ne peut être que
   traversant, et il en faut deux pour un enterré. Proposer le reste offrirait
   un choix qui se corrigerait tout seul au premier clic. */
function viaKindsAvail(){
  const n=S.cu;
  return VIA_KINDS.filter(([k])=>k==="through"?true:(k==="buried"?n>=4:n>=3));
}
function viaSetKind(v,kind){
  const n=S.cu;
  let a=Math.min(v.a,v.b), b=Math.max(v.a,v.b);
  if(kind==="through"){a=0;b=n-1;}
  else if(kind==="blindTop"){b=(a===0&&b<n-1)?b:1;a=0;}
  else if(kind==="blindBot"){a=(b===n-1&&a>0)?a:n-2;b=n-1;}
  else if(kind==="buried"&&!(a>0&&b<n-1)){a=1;b=2;}
  v.a=clamp(a,0,n-1);v.b=clamp(b,0,n-1);
  /* un via qui ne relie qu'une couche à elle-même n'est pas un via */
  if(v.a===v.b)v.b=Math.min(n-1,v.a+1);
  if(v.a===v.b)v.a=Math.max(0,v.b-1);
  return v;
}
/* comptage des vias par nature, et ceux qui demandent plus d'un pressage */
function viaCensus(){
  const out={through:0,blind:0,buried:0,seq:0};
  for(const v of S.vias){
    const b=viaBuild(v.a,v.b);
    out[b.kind]++;
    if(!b.ok)out.seq++;
  }
  return out;
}

/* ==========================================================================
   Traitement des vias — IPC-4761
   Le masque n'ouvre que sur un via laissé nu ; les trois autres traitements le
   ferment, mais ne coûtent pas la même chose et ne servent pas à la même
   chose : le bouchage plaqué est ce qui permet une pastille sur le via.
   ========================================================================== */
const VIA_FINISH={
  open   :"Ouverts au masque",
  tented :"Recouverts de vernis (type II)",
  plugged:"Bouchés résine (type V)",
  filled :"Bouchés et plaqués — via-in-pad (type VII)"
};
function viaTented(){return S.rule.viaFinish!=="open";}

/* ==========================================================================
   Cohérence du rôle annoncé
   Un rôle qui ne ressemble pas au cuivre posé est pire qu'un rôle absent : on
   le lit sur la feuille d'empilage et on le croit.
   ========================================================================== */
function roleCheck(i){
  const r=layerRole(i);
  let tr=0;
  for(const t of S.tracks)if(t.l===i)tr++;
  const A=Math.abs(S.board.w*S.board.h);
  let any=0, big=0;
  for(const z of S.zones){
    if(z.l!==i)continue;
    any++;
    if(A>0&&Math.abs(signedArea(z.pts))>=0.6*A)big++;
  }
  if(rolePlane(r)&&tr)
    return {msg:"plan qui porte "+tr+" segment"+(tr>1?"s":"")+" de piste",
            hint:"« Mixte » décrirait mieux cette couche."};
  if(r==="signal"&&big)
    return {msg:"couche de signal qui porte une zone pleine carte",
            hint:"« Mixte », ou un rôle de plan, serait plus juste."};
  if(r==="mixed"&&!any)
    return {msg:"couche annoncée mixte sans aucune zone de cuivre",
            hint:"« Signal » suffirait."};
  return null;
}

/* ==========================================================================
   Empilage physique
   S.cuL décrit l'empilage logique : combien de couches de cuivre, comment
   elles s'appellent, laquelle porte un plan. S.stack décrit la même carte
   telle que le fabricant la presse — épaisseur de chaque cuivre, diélectrique
   entre deux cuivres, masque, finition. C'est de là que sortent l'épaisseur
   totale et le rapport d'aspect des perçages.

   Toutes les épaisseurs sont en millimètres, le cuivre compris. L'interface le
   montre en micromètres parce que c'est ainsi qu'il se commande, mais rien ici
   ne change d'unité en chemin.

   Deux tableaux et rien d'autre :
     stack.cu[i]  épaisseur du cuivre de la couche i        (S.cu entrées)
     stack.di[i]  diélectrique entre les cuivres i et i+1   (S.cu-1 entrées)
   Une carte simple face n'a aucun intervalle entre deux cuivres : son unique
   entrée de diélectrique décrit alors l'âme qui la porte, d'où le max(1, …).
   ========================================================================== */
const OZ=0.0348;                      // 1 oz/pi² de cuivre ≈ 34,8 µm
const CU_UM=[12,17.5,35,70,105];      // épaisseurs de cuivre courantes, en µm
const DI_KIND={core:"Âme (core)",prepreg:"Prépreg",film:"Film adhésif"};
const MASK_COLORS=["vert","rouge","bleu","noir","blanc","jaune","violet","ambre"];
const SILK_COLORS=["blanc","noir","jaune"];
const FINISHES=["ENIG (or chimique)","HASL étain-plomb","HASL sans plomb",
                "OSP","Argent chimique","Or dur (contacts)"];
/* Modèles d'usine : cuivre en µm, diélectriques en mm sous la forme
   [rôle, épaisseur, εr, tan δ, matière]. Chacun tombe sur l'épaisseur qu'il
   annonce, masque compris — c'est ce que vérifie le banc d'essai. */
const STACK_PRESETS=[
  {n:1,th:1.6,name:"1 couche · FR-4 1,6 mm",
   cu:[35],di:[["core",1.54,4.5,0.02,"FR-4"]]},
  {n:2,th:1.6,name:"2 couches · FR-4 1,6 mm · cuivre 35 µm",
   cu:[35,35],di:[["core",1.48,4.5,0.02,"FR-4"]]},
  {n:2,th:1.6,name:"2 couches · FR-4 1,6 mm · cuivre 70 µm",
   cu:[70,70],di:[["core",1.41,4.5,0.02,"FR-4"]]},
  {n:2,th:0.8,name:"2 couches · FR-4 0,8 mm",
   cu:[35,35],di:[["core",0.68,4.5,0.02,"FR-4"]]},
  {n:2,th:0.21,name:"2 couches · polyimide souple 0,21 mm",
   cu:[18,18],di:[["core",0.125,3.4,0.005,"Polyimide"]]},
  {n:4,th:1.6,name:"4 couches · FR-4 1,6 mm",
   cu:[35,17.5,17.5,35],
   di:[["prepreg",0.21,4.3,0.02,"FR-4 1080 x2"],["core",1.025,4.5,0.02,"FR-4"],
       ["prepreg",0.21,4.3,0.02,"FR-4 1080 x2"]]},
  {n:4,th:1,name:"4 couches · FR-4 1,0 mm",
   cu:[35,17.5,17.5,35],
   di:[["prepreg",0.2,4.3,0.02,"FR-4 1080 x2"],["core",0.445,4.5,0.02,"FR-4"],
       ["prepreg",0.2,4.3,0.02,"FR-4 1080 x2"]]},
  {n:6,th:1.6,name:"6 couches · FR-4 1,6 mm",
   cu:[35,17.5,17.5,17.5,17.5,35],
   di:[["prepreg",0.24,4.3,0.02,"FR-4"],["core",0.345,4.5,0.02,"FR-4"],
       ["prepreg",0.24,4.3,0.02,"FR-4"],["core",0.345,4.5,0.02,"FR-4"],
       ["prepreg",0.24,4.3,0.02,"FR-4"]]},
  {n:8,th:1.6,name:"8 couches · FR-4 1,6 mm",
   cu:[35,17.5,17.5,17.5,17.5,17.5,17.5,35],
   di:[["prepreg",0.145,4.3,0.02,"FR-4"],["core",0.265,4.5,0.02,"FR-4"],
       ["prepreg",0.145,4.3,0.02,"FR-4"],["core",0.265,4.5,0.02,"FR-4"],
       ["prepreg",0.145,4.3,0.02,"FR-4"],["core",0.265,4.5,0.02,"FR-4"],
       ["prepreg",0.145,4.3,0.02,"FR-4"]]}
];
function diCount(n){return Math.max(1,n-1);}
function presetsFor(n){return STACK_PRESETS.filter(p=>p.n===n);}
function diFrom(a){
  return {k:DI_KIND[a[0]]?a[0]:"core",t:a[1],er:a[2],
          df:a[3]==null?0.02:a[3],mat:a[4]||"FR-4"};
}
/* empilage d'usine pour n couches : le premier modèle qui correspond */
function stackDefaults(n){
  const p=presetsFor(n)[0]||null, cu=[], di=[];
  for(let i=0;i<n;i++)cu.push({t:r4(((p&&p.cu[i])||35)/1000)});
  for(let i=0;i<diCount(n);i++)
    di.push(diFrom((p&&p.di[i])||["core",1.48,4.5,0.02,"FR-4"]));
  return {target:p?p.th:1.6,finish:FINISHES[0],
          maskT:0.025,maskEr:3.8,maskColor:"vert",silkColor:"blanc",
          cu:cu,di:di};
}
/* Lectures tolérantes : le panneau et les fichiers de fabrication passent tous
   par là, et rien ne garantit que S.stack ait la longueur de S.cuL au moment
   précis où l'un d'eux s'exécute. */
function cuT(i){
  const c=S.stack&&S.stack.cu[i];
  return c?c.t:0.035;
}
function diAt(i){
  const d=S.stack&&S.stack.di[i];
  return d||{k:"core",t:0,er:4.5,df:0.02,mat:"FR-4"};
}
function maskFaces(){return S.cu>1?2:1;}
function stackCuT(){let s=0;for(let i=0;i<S.cu;i++)s+=cuT(i);return r4(s);}
function stackDiT(){let s=0;for(let i=0;i<diCount(S.cu);i++)s+=diAt(i).t;return r4(s);}
/* épaisseur du stratifié nu, puis épaisseur totale masque compris */
function stackLam(){return r4(stackCuT()+stackDiT());}
function stackTotal(){return r4(stackLam()+maskFaces()*S.stack.maskT);}
/* Longueur du perçage qui relie les cuivres a et b : c'est elle qui donne le
   rapport d'aspect, et elle est plus courte qu'une carte entière dès qu'un via
   est borgne ou enterré. */
function stackSpan(a,b){
  if(b<a){const k=a;a=b;b=k;}
  a=clamp(a,0,S.cu-1);b=clamp(b,0,S.cu-1);
  let s=0;
  for(let i=a;i<=b;i++)s+=cuT(i);
  for(let i=a;i<b;i++)s+=diAt(i).t;
  return r4(s);
}
/* Rapport d'aspect le plus défavorable de la carte : au-delà de 8 pour 1, la
   métallisation d'un trou devient délicate et se paie. */
function worstAspect(){
  let out=null;
  const add=(len,d)=>{
    if(!(d>0)||!(len>0))return;
    const r=len/d;
    if(!out||r>out.ratio)out={ratio:r,drill:d,len:len};
  };
  for(const v of S.vias)add(stackSpan(v.a,v.b),v.drill);
  for(const fp of S.fps)
    for(const q of padsOf(fp))
      if(q.drill>0)add(stackLam(),q.drill);
  return out;
}
/* Ajuste les diélectriques pour tomber sur l'épaisseur visée. Le cuivre et le
   masque ne bougent pas : on ne choisit pas une épaisseur de cuivre pour faire
   tomber juste une épaisseur de carte. */
function stackFit(){
  const fixed=stackCuT()+maskFaces()*S.stack.maskT;
  const want=S.stack.target-fixed, have=stackDiT();
  if(!(want>0.02)||!(have>0))return false;
  const k=want/have;
  for(const d of S.stack.di)d.t=Math.max(0.005,r4(d.t*k));
  return true;
}
/* Un empilage asymétrique se voile à la cuisson : le fabricant le refuse ou le
   compense. Plutôt qu'un verdict, la liste des paires qui ne se répondent pas —
   c'est elle qui dit quoi corriger. Symétriser, c'est faire la moyenne des
   couches deux à deux. */
function stackAsym(){
  const cu=S.stack.cu, di=S.stack.di, e=1e-4, out=[];
  for(let i=0,j=cu.length-1;i<j;i++,j--)
    if(Math.abs(cu[i].t-cu[j].t)>e)
      out.push({what:"cu",i:i,j:j,a:umLabel(cu[i].t),b:umLabel(cu[j].t)});
  for(let i=0,j=di.length-1;i<j;i++,j--){
    if(Math.abs(di[i].t-di[j].t)>e)
      out.push({what:"di",i:i,j:j,a:fmt(di[i].t,3)+" mm",b:fmt(di[j].t,3)+" mm"});
    else if(di[i].k!==di[j].k)
      out.push({what:"di",i:i,j:j,a:DI_KIND[di[i].k],b:DI_KIND[di[j].k]});
    else if(Math.abs(di[i].er-di[j].er)>e)
      out.push({what:"di",i:i,j:j,a:"Dk "+fmt(di[i].er,2),b:"Dk "+fmt(di[j].er,2)});
  }
  return out;
}
function stackSym(){return stackAsym().length===0;}
/* « Diélectrique 1 (0.210 mm) contre le 3 (0.500 mm) » */
function asymLabel(x){
  const nm=x.what==="cu"?"Cuivre ":"Diélectrique ";
  return nm+(x.i+1)+" ("+x.a+") contre le "+(x.j+1)+" ("+x.b+")";
}
function stackMirror(){
  const cu=S.stack.cu, di=S.stack.di;
  for(let i=0,j=cu.length-1;i<j;i++,j--){
    const t=r4((cu[i].t+cu[j].t)/2);cu[i].t=t;cu[j].t=t;
  }
  for(let i=0,j=di.length-1;i<j;i++,j--){
    const t=r4((di[i].t+di[j].t)/2);
    di[i].t=t;di[j].t=t;
    di[j].k=di[i].k;di[j].er=di[i].er;di[j].df=di[i].df;di[j].mat=di[i].mat;
  }
}
/* Le nombre de couches vient de changer : les diélectriques d'un 4 couches ne
   veulent plus rien dire sur un 6 couches. On reprend donc le modèle d'usine
   du nouveau compte en gardant ce qui n'en dépend pas — épaisseur visée,
   masque, finition, cuivres extérieurs, qui sont des choix de commande — puis
   on répartit les diélectriques sur l'épaisseur visée. */
function stackResize(n){
  const old=S.stack||stackDefaults(n), d=stackDefaults(n);
  d.target=old.target;d.finish=old.finish;
  d.maskT=old.maskT;d.maskEr=old.maskEr;
  d.maskColor=old.maskColor;d.silkColor=old.silkColor;
  if(old.cu.length){
    d.cu[0].t=old.cu[0].t;
    d.cu[d.cu.length-1].t=old.cu[old.cu.length-1].t;
  }
  S.stack=d;
  stackFit();
}
function applyPreset(p){
  if(!p||p.n!==S.cu)return false;
  const st=S.stack;
  st.target=p.th;
  for(let i=0;i<S.cu;i++)st.cu[i]={t:r4((p.cu[i]||35)/1000)};
  for(let i=0;i<diCount(S.cu);i++)st.di[i]=diFrom(p.di[i]||p.di[p.di.length-1]);
  return true;
}

/* La coupe complète, du dessus vers le dessous : sérigraphie, masque, puis
   cuivres et diélectriques en alternance. La sérigraphie y figure parce qu'un
   empilage se lit ainsi chez le fabricant, mais elle ne pèse rien — quelques
   micromètres d'encre que personne ne facture en épaisseur. */
function stackRows(){
  const rows=[{kind:"silk",i:0},{kind:"mask",i:0}];
  for(let i=0;i<S.cu;i++){
    rows.push({kind:"cu",i:i});
    if(i<diCount(S.cu))rows.push({kind:"di",i:i});
  }
  if(S.cu>1)rows.push({kind:"mask",i:1},{kind:"silk",i:1});
  return rows;
}
function rowT(r){
  if(r.kind==="cu")return cuT(r.i);
  if(r.kind==="di")return diAt(r.i).t;
  return r.kind==="mask"?S.stack.maskT:0;
}
function umLabel(t){return fmt(t*1000,(t*1000)<100?1:0)+" µm";}
function ozLabel(t){
  const o=t/OZ, r=Math.round(o*2)/2;
  return (Math.abs(o-r)<0.06?fmt(r,r%1?1:0):fmt(o,2))+" oz";
}

/* ==========================================================================
   État
   ========================================================================== */
const S = {
  cu:2,                       // nombre de couches cuivre
  cuL:[],                     // {name,color,vis,plane,net}
  stack:stackDefaults(2),     // empilage physique : épaisseurs, matières, finition
  active:0,                   // couche cuivre active (indice)
  pair:[0,1],                 // paire de couches pour le changement rapide
  show:{silkT:true,silkB:true,edge:true,rats:true,plane:true,drc:true,
        maskT:false,maskB:false,pasteT:false,pasteB:false},
  board:{x:0,y:0,w:100,h:80,pts:null},   // pts = contour libre, sinon rectangle
  fps:[], tracks:[], vias:[], zones:[], cuts:[], drawings:[],
  /* `corner` : l'angle imposé aux pistes tracées — « 45 » par défaut, c'est la
     règle de l'art ; « 90 » pour un tracé orthogonal strict, « free » pour un
     angle quelconque. */
  /* `route` : ce que le routeur fait d'un obstacle — « shove » le pousse,
     « walk » le contourne, « mark » le signale et s'arrête. Le défaut est le
     même que celui de KiCad : on pousse. */
  /* `mat` : la matrice des natures de cuivre — une case par couple
     piste/pastille/via/cuivre, en minimum qui s'ajoute à la classe de net.
     Vide d'usine : la classe décide seule tant qu'on n'a rien écrit.
     `short` : autoriser deux nets à se toucher. Faux, évidemment — mais joindre
     deux masses en un point précis est une pratique, et le contrôle n'a alors
     pas à la condamner quinze fois.
     `aspWarn`/`aspMax` : les seuils du rapport d'aspect, que le fabricant
     annonce et qui ne sont donc pas les mêmes partout. */
  rule:{edge:0.4,thermal:0.5,mask:0.05,paste:0.0,viaFinish:"tented",corner:"45",
        route:"shove",hole:0.25,mat:{},short:false,
        aspWarn:ASPECT_WARN,aspMax:ASPECT_MAX},
  classes:[{name:"Défaut",      w:0.3, clr:0.25, via:0.8, drill:0.4},
           {name:"Alimentation",w:0.6, clr:0.25, via:0.9, drill:0.45}],
  netClass:{},                // net → nom de classe ; absent = classe par défaut
  dpPairs:[],                 // paires différentielles : {id,name,p,n}
  dpRules:[],                 // règles de paire ; vide = la règle d'usine
  scale:5, ox:0, oy:0,
  grid:0.1, showGrid:true, flip:false, contrast:1,   // pas d'accrochage au démarrage
  origin:{x:0,y:0}, fabOrigin:false,   // origine utilisateur ; repère des fichiers
  coord:{open:false,mode:"abs"},       // saisie de coordonnées au clavier
  avoid:true,                          // le tracé se tient à distance des obstacles
  mode:"select",
  sel:{fps:new Set(),tracks:new Set(),vias:new Set(),zones:new Set(),cuts:new Set(),drawings:new Set(),edge:false},
  route:null,                 // tracé de piste en cours
  dp:null,                    // tracé de paire différentielle en cours
  zoneDraft:null,             // zone en cours de saisie
  cutDraft:null,              // découpe de zone en cours
  silkDraft:null, silkShape:"line",   // tracé de sérigraphie en cours et forme active (line|rect)
  hlNet:null,                 // net mis en avant
  hlText:null,                // texte de composant en cours de déplacement
  drc:[], drcRun:false,
  listTab:"nets", onlyUnrouted:false,
  mouse:{x:0,y:0},
  ver:0, nextId:1,
  undo:[], redo:[], dirty:false
};
function touch(){S.ver++;}

/* Construit / reconstruit l'empilage en conservant ce qui peut l'être.
   Les pistes des couches supprimées sont ramenées vers la couche voisine :
   perdre du cuivre sans prévenir serait pire que de le déplacer. */
function setCuCount(n,silent){
  const old=S.cu, oldL=S.cuL;
  const L=[];
  for(let i=0;i<n;i++){
    // report des réglages : dessus→dessus, dessous→dessous, internes par rang
    let src=null;
    if(oldL.length){
      if(i===0)src=oldL[0];
      else if(i===n-1)src=oldL[old-1];
      else src=oldL[Math.min(i,old-2)]||null;
    }
    L.push({
      name:(src&&src.custom)?src.name:cuLabel(i,n),
      custom:!!(src&&src.custom),
      color:(src&&src.color&&src.custom)?src.color:cuColor(i,n),
      vis:src?src.vis!==false:true,
      plane:!!(src&&src.plane),
      net:(src&&src.net)||"GND",
      role:coherentRole(src&&src.role,src&&src.plane,(src&&src.net)||"")
    });
  }
  const map=i=>{
    if(i===0)return 0;
    if(i===old-1)return n-1;
    return Math.min(i,n-2)>0?Math.min(i,n-2):0;
  };
  for(const t of S.tracks) t.l=clamp(map(t.l),0,n-1);
  for(const z of S.zones) z.l=clamp(map(z.l),0,n-1);
  for(const v of S.vias){
    v.a=clamp(map(v.a),0,n-1); v.b=clamp(map(v.b),0,n-1);
    if(v.a>v.b){const k=v.a;v.a=v.b;v.b=k;}
    if(v.a===v.b){v.a=0;v.b=n-1;}
  }
  S.cu=n; S.cuL=L;
  if(old!==n)stackResize(n);           // l'empilage physique suit le compte
  syncAutoZones();
  S.active=clamp(S.active,0,n-1);
  S.pair=[0,n-1];
  touch();
  if(!silent){buildLayers();buildTabs();refreshPanels();draw();}
}
function layerColor(i){return (S.cuL[i]&&S.cuL[i].color)||cuColor(i,S.cu);}
function activeColor(){return layerColor(S.active);}

/* ==========================================================================
   Repère écran / monde  (la vue « dessous » est un miroir autour du centre
   de la carte : les coordonnées stockées, elles, ne bougent jamais)
   ========================================================================== */
function bcx(){return S.board.x+S.board.w/2;}
function mirX(x){return S.flip?(2*bcx()-x):x;}
function w2s(x,y){return {x:mirX(x)*S.scale+S.ox, y:y*S.scale+S.oy};}
function s2w(px,py){
  const X=(px-S.ox)/S.scale;
  return {x:mirX(X), y:(py-S.oy)/S.scale};
}
function setWorld(c,dpr){
  const s=S.scale*dpr;
  if(S.flip)c.setTransform(-s,0,0,s, dpr*(2*bcx()*S.scale+S.ox), dpr*S.oy);
  else c.setTransform(s,0,0,s, dpr*S.ox, dpr*S.oy);
}
/* La grille s'accroche à l'origine utilisateur : la déplacer redresse toute la
   saisie sur un repère choisi, ce qui est tout l'intérêt de la poser. */
function snapTo(v,o){return S.grid>0?r3(Math.round((v-o)/S.grid)*S.grid+o):r3(v);}
function snapX(v){return snapTo(v,S.origin.x);}
function snapY(v){return snapTo(v,S.origin.y);}
function snap(v){return snapX(v);}
/* Accrochage relatif à une ancre hors grille. Les centres de pastilles tombent
   rarement sur le quadrillage : un DIP au pas de 2,54 mm pose ses colonnes à
   3,81 mm de son axe, ce qu'une grille au demi-millimètre ignore. Accrocher la
   suite du tracé au seul quadrillage décalerait la piste de 0,23 mm par rapport
   au centre de la pastille — plus que la largeur de la piste elle-même. Quand
   la case visée est celle de l'ancre, on garde donc l'axe de l'ancre : c'est ce
   que la main visait, et la piste sort droit du centre. */
function snapNear(v,anchor,o){
  if(anchor==null||!(S.grid>0))return snapTo(v,o);
  // l'ancre tient une case à elle, centrée sur son axe : viser cet axe suffit,
  // et les nœuds voisins restent atteignables de part et d'autre
  return Math.abs(v-anchor)<S.grid/2?r3(anchor):snapTo(v,o);
}
function snapXn(v,anchor){return snapNear(v,anchor,S.origin.x);}
function snapYn(v,anchor){return snapNear(v,anchor,S.origin.y);}
/* coordonnées telles que l'utilisateur les lit et les saisit */
function ux(x){return r3(x-S.origin.x);}
function uy(y){return r3(y-S.origin.y);}
function wxu(u){return r3(u+S.origin.x);}
function wyu(u){return r3(u+S.origin.y);}
function px(n){return n/S.scale;}          // n pixels écran, exprimés en mm

/* ==========================================================================
   Empreintes génériques
   La bibliothèque de boîtiers n'est pas dessinée au centième : chaque
   composant reçoit une empreinte paramétrique (puce, rangée, DIP, SOIC,
   quatre côtés, grille de billes). Le nom du boîtier choisi côté schématique
   en fixe le style et les cotes ; à défaut, elles se déduisent du nombre de
   broches. Tout reste modifiable dans le panneau Propriétés.
   ========================================================================== */
const STYLES={
  chip:{n:"Puce 2 pastilles (CMS)", thru:false},
  row :{n:"1 rangée (traversant)",  thru:true },
  dip :{n:"2 rangées DIP (traversant)", thru:true },
  sop :{n:"2 rangées SOIC (CMS)",   thru:false},
  quad:{n:"4 côtés (QFP, QFN)",     thru:false},
  bga :{n:"Grille de billes (BGA)", thru:false}
};
function defaultStyle(pins){
  if(pins<=2)return "chip";
  if(pins<=4)return "row";
  return "dip";
}
function defaultGeom(style){
  if(style==="chip")return {pitch:2.4, span:2.4};
  if(style==="row") return {pitch:2.54,span:2.54};
  if(style==="dip") return {pitch:2.54,span:7.62};
  if(style==="quad")return {pitch:0.5, span:11.1};
  if(style==="bga") return {pitch:0.8, span:0.8};
  return {pitch:1.27,span:5.2};
}
/* --------------------------------------------------------------------------
   Boîtiers nommés
   Le schématique enregistre un boîtier sur chaque composant et le recopie
   dans la netlist : c'est ce nom qui doit décider de l'empreinte à l'import,
   sinon un SOIC-8 arriverait en DIP traversant. La table donne, par famille,
   le style et les cotes ; `pins` fixe le brochage quand le nom ne le porte
   pas (une puce CMS a deux bornes, toujours), `pitch` et `span` acceptent une
   fonction du brochage, et `lead` sert aux boîtiers à quatre côtés, dont
   l'écartement des rangées dépend du nombre de pastilles.
   Les cotes sont celles du pas et de l'écartement des rangées, au dixième de
   millimètre : de quoi router juste, pas de quoi remplacer la fiche du
   fabricant. Les boîtiers de puissance à languette (DPAK, SOT-223…) sont
   ramenés à deux rangées : leurs pastilles y sont, la languette reste à
   ajouter à la main.
   -------------------------------------------------------------------------- */
const PKG_LIB={
  /* puces CMS : le nom code les dimensions en centièmes de pouce */
  "01005":{style:"chip",pins:2,span:0.35},
  "0201":{style:"chip",pins:2,span:0.55},
  "0402":{style:"chip",pins:2,span:0.95},
  "0603":{style:"chip",pins:2,span:1.5},
  "0805":{style:"chip",pins:2,span:1.9},
  "1206":{style:"chip",pins:2,span:3.1},
  "1210":{style:"chip",pins:2,span:3.1},
  "2512":{style:"chip",pins:2,span:6.2},
  /* diodes CMS moulées et cylindriques */
  "SMA":{style:"chip",pins:2,span:5},
  "SMB":{style:"chip",pins:2,span:5.2},
  "SMC":{style:"chip",pins:2,span:7},
  "MELF":{style:"chip",pins:2,span:5},
  "MiniMELF":{style:"chip",pins:2,span:3.2},
  "SOD-123":{style:"chip",pins:2,span:3.6},
  "SOD-323":{style:"chip",pins:2,span:2.4},
  /* petits boîtiers CMS : deux rangées, la rangée impaire recentrée */
  "SOT-23":{style:"sop",pins:3,pitch:0.95,span:2.6},
  "SOT-89":{style:"sop",pins:3,pitch:1.5,span:3},
  "SOT-223":{style:"sop",pins:4,pitch:2.3,span:6.3},
  /* puissance : la languette n'est pas dessinée */
  "TO-252":{style:"sop",pins:3,pitch:2.3,span:6.5},
  "TO-263":{style:"sop",pins:3,pitch:2.54,span:8.6},
  "TO-92":{style:"row",pins:3,pitch:2.54},
  "TO-220":{style:"row",pins:3,pitch:2.54},
  "TO-247":{style:"row",pins:3,pitch:5.45},
  /* CI à deux rangées : au delà de 16 broches, le SOIC passe en large */
  "SOIC":{style:"sop",pitch:1.27,span:n=>n>16?9.4:5.4},
  "SOP":{style:"sop",pitch:1.27,span:n=>n>16?9.4:5.4},
  "SSOP":{style:"sop",pitch:0.65,span:5.7},
  "TSSOP":{style:"sop",pitch:0.65,span:5.9},
  "MSOP":{style:"sop",pitch:0.65,span:4.4},
  "DFN":{style:"sop",pitch:0.5,span:2.6},
  "DIP":{style:"dip",pitch:2.54,span:n=>n>=32?15.24:7.62},
  /* quatre côtés : à pattes (QFP) ou sans pattes (QFN, PLCC) */
  "LQFP":{style:"quad",pitch:n=>n<=44?0.8:0.5,lead:3.6},
  "TQFP":{style:"quad",pitch:n=>n<=44?0.8:0.5,lead:3.6},
  "QFP":{style:"quad",pitch:n=>n<=44?0.8:0.5,lead:3.6},
  "PQFP":{style:"quad",pitch:n=>n<=44?0.8:0.5,lead:3.6},
  "QFN":{style:"quad",pitch:n=>n<=32?0.5:0.4,lead:1.1},
  "PLCC":{style:"quad",pitch:1.27,lead:3},
  "LCC":{style:"quad",pitch:1.27,lead:2},
  /* billes : le pas fait tout, la grille se remplit en lignes */
  "BGA":{style:"bga",pitch:0.8},
  "WLCSP":{style:"bga",pitch:0.4},
  "CSP":{style:"bga",pitch:0.5},
  /* points de test et perçages métallisés */
  "Trou metalise diam. trou 1.2mm - dim. plated 2.54mmx1.6mm":{
    style:"row", pins:1, pitch:2.54, span:2.54,
    pads:[{n:1, x:0, y:0, w:2.54, h:1.6, shape:"oval", drill:1.2}]
  },
  "Trou metalise":{
    style:"row", pins:1, pitch:2.54, span:2.54,
    pads:[{n:1, x:0, y:0, w:2.54, h:1.6, shape:"oval", drill:1.2}]
  },
  "TP-PTH":{
    style:"row", pins:1, pitch:2.54, span:2.54,
    pads:[{n:1, x:0, y:0, w:2.54, h:1.6, shape:"oval", drill:1.2}]
  },
  /* Barrettes 2,54 mm */
  "HEADER-2.54":{style:"row",pitch:2.54,span:2.54},
  "HEADER-2.54-1X2":{style:"row",pins:2,pitch:2.54,span:2.54},
  "HEADER-2.54-1X3":{style:"row",pins:3,pitch:2.54,span:2.54},
  "HEADER-2.54-1X4":{style:"row",pins:4,pitch:2.54,span:2.54},
  "HEADER-2.54-1X6":{style:"row",pins:6,pitch:2.54,span:2.54},
  "HEADER-2.54-1X8":{style:"row",pins:8,pitch:2.54,span:2.54},
  "HEADER-2.54-2X":{style:"dip",pitch:2.54,span:2.54},
  "HEADER-2.54-2X5":{style:"dip",pins:10,pitch:2.54,span:2.54},
  /* Barrettes 1,27 mm */
  "HEADER-1.27":{style:"row",pitch:1.27,span:1.27},
  "HEADER-1.27-1X2":{style:"row",pins:2,pitch:1.27,span:1.27},
  "HEADER-1.27-1X3":{style:"row",pins:3,pitch:1.27,span:1.27},
  "HEADER-1.27-1X4":{style:"row",pins:4,pitch:1.27,span:1.27},
  "HEADER-1.27-1X6":{style:"row",pins:6,pitch:1.27,span:1.27},
  "HEADER-1.27-1X8":{style:"row",pins:8,pitch:1.27,span:1.27},
  "HEADER-1.27-2X":{style:"dip",pitch:1.27,span:1.27},
  "HEADER-1.27-2X5":{style:"dip",pins:10,pitch:1.27,span:1.27},
  /* Diodes CMS */
  "SOD-523":{style:"chip",pins:2,span:1.6},
  "SOT-23-6":{style:"sop",pins:6,pitch:0.95,span:2.6},
  /* Connecteurs USB */
  "USB-C-6P":{
    style:"row", pins:5, pitch:0.5, span:3.0,
    pads:[
      {n:1, x:-1.25, y:-1.5, w:0.6, h:1.2, shape:"rect", drill:0},
      {n:1, x:1.25,  y:-1.5, w:0.6, h:1.2, shape:"rect", drill:0},
      {n:2, x:-2.75, y:-1.5, w:0.8, h:1.2, shape:"rect", drill:0},
      {n:2, x:2.75,  y:-1.5, w:0.8, h:1.2, shape:"rect", drill:0},
      {n:3, x:-0.5,  y:-1.5, w:0.4, h:1.2, shape:"rect", drill:0},
      {n:4, x:0.5,   y:-1.5, w:0.4, h:1.2, shape:"rect", drill:0},
      {n:5, x:-4.3,  y:-1.0, w:1.6, h:2.0, shape:"oval", drill:0.9},
      {n:5, x:4.3,   y:-1.0, w:1.6, h:2.0, shape:"oval", drill:0.9},
      {n:5, x:-4.3,  y:3.2,  w:1.6, h:2.0, shape:"oval", drill:0.9},
      {n:5, x:4.3,   y:3.2,  w:1.6, h:2.0, shape:"oval", drill:0.9}
    ],
    body:{x1:-4.5, y1:-2.5, x2:4.5, y2:4.5}
  },
  "USB-C-16P":{
    style:"row", pins:8, pitch:0.5, span:3.0,
    pads:[
      {n:2, x:-2.75, y:-1.5, w:0.6,  h:1.2, shape:"rect", drill:0},
      {n:7, x:-2.25, y:-1.5, w:0.35, h:1.2, shape:"rect", drill:0},
      {n:1, x:-1.75, y:-1.5, w:0.5,  h:1.2, shape:"rect", drill:0},
      {n:5, x:-1.25, y:-1.5, w:0.35, h:1.2, shape:"rect", drill:0},
      {n:4, x:-0.75, y:-1.5, w:0.35, h:1.2, shape:"rect", drill:0},
      {n:3, x:-0.25, y:-1.5, w:0.35, h:1.2, shape:"rect", drill:0},
      {n:4, x:0.25,  y:-1.5, w:0.35, h:1.2, shape:"rect", drill:0},
      {n:3, x:0.75,  y:-1.5, w:0.35, h:1.2, shape:"rect", drill:0},
      {n:6, x:1.25,  y:-1.5, w:0.35, h:1.2, shape:"rect", drill:0},
      {n:1, x:1.75,  y:-1.5, w:0.5,  h:1.2, shape:"rect", drill:0},
      {n:7, x:2.25,  y:-1.5, w:0.35, h:1.2, shape:"rect", drill:0},
      {n:2, x:2.75,  y:-1.5, w:0.6,  h:1.2, shape:"rect", drill:0},
      {n:8, x:-4.3,  y:-1.0, w:1.6,  h:2.0, shape:"oval", drill:0.9},
      {n:8, x:4.3,   y:-1.0, w:1.6,  h:2.0, shape:"oval", drill:0.9},
      {n:8, x:-4.3,  y:3.2,  w:1.6,  h:2.0, shape:"oval", drill:0.9},
      {n:8, x:4.3,   y:3.2,  w:1.6,  h:2.0, shape:"oval", drill:0.9}
    ],
    body:{x1:-4.5, y1:-2.5, x2:4.5, y2:4.5}
  },
  "MICRO-USB-B":{
    style:"row", pins:6, pitch:0.65, span:2.6,
    pads:[
      {n:1, x:-1.3,  y:-1.5, w:0.4, h:1.35, shape:"rect", drill:0},
      {n:2, x:-0.65, y:-1.5, w:0.4, h:1.35, shape:"rect", drill:0},
      {n:3, x:0,     y:-1.5, w:0.4, h:1.35, shape:"rect", drill:0},
      {n:4, x:0.65,  y:-1.5, w:0.4, h:1.35, shape:"rect", drill:0},
      {n:5, x:1.3,   y:-1.5, w:0.4, h:1.35, shape:"rect", drill:0},
      {n:6, x:-3.5,  y:-1.0, w:1.6, h:1.8,  shape:"oval", drill:0.9},
      {n:6, x:3.5,   y:-1.0, w:1.6, h:1.8,  shape:"oval", drill:0.9},
      {n:6, x:-3.5,  y:2.5,  w:1.6, h:1.8,  shape:"oval", drill:0.9},
      {n:6, x:3.5,   y:2.5,  w:1.6, h:1.8,  shape:"oval", drill:0.9}
    ],
    body:{x1:-3.8, y1:-2.5, x2:3.8, y2:3.5}
  }
};
/* Clé de comparaison : majuscules, surnom entre parenthèses écarté (le
   schématique propose « TO-252 (DPAK) »), séparateurs ignorés. « SOT-23-5 »,
   « SOT23-5 » et « sot 23 5 » désignent alors le même boîtier à cinq broches. */
function pkgKey(s){
  return String(s==null?"":s).toUpperCase()
    .replace(/\([^)]*\)/g," ").replace(/[^A-Z0-9]+/g,"");
}
function quadSide(pins){return Math.max(1,Math.ceil(pins/4));}
/* Nom de boîtier → empreinte, ou null si le nom est hors table : l'appelant
   retombe alors sur le style déduit du brochage. Le brochage porté par le nom
   (« SOIC-8 ») l'emporte sur celui de la table, et `pinsHint` — le plus grand
   numéro de broche vu dans la netlist — ne peut que l'augmenter : une broche
   câblée ne doit jamais se retrouver sans pastille. */
function pkgGeom(pkg,pinsHint){
  const key=pkgKey(pkg);
  if(!key)return null;
  let hit=null;
  for(const name of Object.keys(PKG_LIB)){
    const k=pkgKey(name);
    if(!key.startsWith(k))continue;
    const rest=key.slice(k.length);
    let extraPins=0;
    if(rest){
      if(/^\d+$/.test(rest))extraPins=+rest;
      else if(/^1X\d+$/.test(rest))extraPins=+rest.slice(2);
      else if(/^2X\d+$/.test(rest))extraPins=(+rest.slice(2))*2;
      else continue;
    }
    if(!hit||k.length>hit.k.length)hit={k:k,name:name,pins:extraPins};
  }
  if(!hit)return null;
  const d=PKG_LIB[hit.name];
  const basePins=(hit.name.endsWith("-2X")&&hit.pins)?hit.pins*2:(hit.pins||d.pins||0);
  const pins=clamp(Math.max(basePins,pinsHint|0)||2,1,4096);
  const pitch=Math.max(0.05,r3(typeof d.pitch==="function"?d.pitch(pins):
    (d.pitch!=null?d.pitch:(d.span||2.4))));
  let span=typeof d.span==="function"?d.span(pins,pitch):d.span;
  if(span==null)
    span=d.style==="quad"?(quadSide(pins)-1)*pitch+(d.lead||2):
         d.style==="bga" ?pitch:defaultGeom(d.style).span;
  const out={style:d.style,pitch:pitch,span:Math.max(0.05,r3(span)),pins:pins,pkg:hit.name};
  if(d.pads)out.pads=d.pads.map(padClone);
  if(d.body)out.body={...d.body};
  return out;
}
/* Style et cotes d'un composant : le boîtier nommé d'abord, le brochage
   ensuite. Point de passage unique entre « SOIC-8 » et des pastilles. */
function fpGeomFor(pkg,pins){
  const n=Math.max(1,pins|0);
  const g=pkgGeom(pkg,n);
  if(g)return g;
  const style=defaultStyle(n), d=defaultGeom(style);
  return {style:style,pitch:d.pitch,span:d.span,pins:n};
}
/* Plus haut numéro de broche câblé : le brochage peut se réduire quand le
   boîtier change, jamais en dessous de ce qui porte un net. */
function fpWiredPins(fp){
  let m=0;
  for(const k of Object.keys(fp.nets||{})){const n=+k;if(n>m&&fp.nets[k])m=n;}
  return m;
}
/* Repose une empreinte existante sur son boîtier. Boîtier hors table : rien ne
   bouge, le réglage fait à la main garde le dernier mot. */
function applyPkgGeom(fp){
  const g=pkgGeom(fp.pkg,fpWiredPins(fp));
  if(!g)return false;
  if(fpFree(fp)&&!g.pads)return false;
  fp.style=g.style;fp.pitch=g.pitch;fp.span=g.span;fp.pins=g.pins;
  if(g.pads){
    fp.pads=g.pads.map(padClone);
    if(g.body)fp.body={...g.body};
    fpSyncPins(fp);
  }else if(!fpFree(fp)){
    delete fp.pads;delete fp.body;
  }
  return true;
}
function mkFp(ref,value,pkg,pins){
  const g=fpGeomFor(pkg,pins);
  const fp={id:S.nextId++, ref:ref||("U"+S.nextId), value:value||"", pkg:pkg||"",
          pins:g.pins, style:g.style, pitch:g.pitch, span:g.span,
          x:0, y:0, rot:0, side:0, nets:{}};
  if(g.pads){
    fp.pads=g.pads.map(padClone);
    if(g.body)fp.body={...g.body};
    fpSyncPins(fp);
  }
  return fp;
}
/* pastilles en coordonnées locales, dans l'ordre des numéros de broche */
/* --------------------------------------------------------------------------
   Empreintes dessinées à la main
   Une empreinte reste paramétrique aussi longtemps que ses trois cotes
   suffisent : style, pas, écartement. Dès qu'une pastille est déplacée,
   retaillée ou percée à part, la liste explicite `fp.pads` prend le relais et
   les cotes génériques ne commandent plus rien — c'est la disposition
   « libre » du brochage schématique, transposée au cuivre. `fp.body` fait de
   même pour le rectangle de sérigraphie.

   Une pastille libre porte exactement ce que padsOf() produit : numéro de
   broche, centre, dimensions, forme, perçage. Le numéro est l'identité de la
   patte — c'est lui qui porte le net — et non son rang dans la liste : on
   peut donc supprimer la pastille 3 sans renuméroter les suivantes.
   -------------------------------------------------------------------------- */
/* ---------- formes de pastille ----------
   Quatre formes, un seul paramètre : le rayon des coins. Le rectangle adouci
   est celui des empreintes calculées — c'est la forme des plages brasées d'un
   boîtier CMS réel, et elle reste la valeur par défaut. Les angles droits, le
   rond et l'oblong s'obtiennent en poussant ce rayon à 0, au maximum, ou à la
   moitié du petit côté. Un carré est un rectangle dont les deux côtés sont
   égaux : le bouton « Carré » de la fenêtre d'empreinte les recopie l'un sur
   l'autre, il n'y a pas de forme de plus pour cela. */
const PAD_SHAPES={
  rect :"Rectangle (coins adoucis)",
  sharp:"Rectangle (angles droits)",
  oval :"Oblong (bouts ronds)",
  circ :"Rond"
};
/* Forme inconnue — fichier d'une autre version, .json retouché — : le
   rectangle adouci, celle qu'ont toujours eue les empreintes calculées. */
function padShape(s){return PAD_SHAPES[s]?s:"rect";}
function padRadius(shape,w,h){
  if(shape==="sharp")return 0;
  if(shape==="oval") return Math.min(w,h)/2;
  return Math.min(w,h)*0.22;
}
function fpFree(fp){
  return (fp&&Array.isArray(fp.pads)&&fp.pads.length)?fp.pads:null;
}
/* Copie normalisée d'une pastille. L'arrondi est au dixième de micromètre,
   comme pour les épaisseurs de cuivre : les cotes calculées sont des produits
   (2,54 × 0,68 = 1,7272 mm de pastille traversante), et arrondir au micromètre
   déplacerait le cuivre au moment de figer l'empreinte. */
/* L'ordre des champs suit celui des pastilles calculées — n, x, y, w, h,
   forme, perçage, rotation — pour qu'une empreinte figée et la même encore
   calculée s'écrivent exactement pareil. */
function padClone(q){
  return {n:Math.max(1,Math.round(q.n)||1), x:r4(q.x), y:r4(q.y),
          w:Math.max(0.05,r4(q.w)), h:Math.max(0.05,r4(q.h)),
          shape:padShape(q.shape), drill:Math.max(0,r4(q.drill||0)),
          rot:padRot(q.rot)};
}
/* Rotation d'une pastille, en degrés, dans le repère de l'empreinte — comme
   `fp.rot` pour l'empreinte entière. Ramenée dans [0, 360[ : deux pastilles
   tournées de -90° et de 270° sont la même, et le document ne doit pas en
   garder deux écritures. */
function padRot(v){
  const a=+v;
  if(!Number.isFinite(a))return 0;
  return r3(((a%360)+360)%360);
}
function padsOf(fp){
  const out=[], n=fp.pins, p=fp.pitch, sp=fp.span;
  const free=fpFree(fp);
  if(free){
    for(const q of free)out.push(padClone(q));
  }else if(fp.style==="chip"){
    /* les plus petites puces (0201, 01005) ont des bornes plus fines que le
       plancher d'un connecteur : les pastilles suivent l'écartement */
    const w=Math.max(0.4,sp*0.55), h=Math.max(0.45,sp*0.62);
    for(let i=0;i<n;i++)
      out.push({n:i+1, x:(i-(n-1)/2)*sp, y:0, w, h, shape:"rect", drill:0});
  }else if(fp.style==="row"){
    for(let i=0;i<n;i++)
      out.push({n:i+1, x:(i-(n-1)/2)*p, y:0, w:p*0.68, h:p*0.68,
                shape:i===0?"rect":"circ", drill:Math.min(1.0,p*0.34)});
  }else if(fp.style==="quad"){
    /* Quatre côtés, broche 1 en haut à gauche, numérotation dans le sens
       trigonométrique : côté gauche de haut en bas, côté bas de gauche à
       droite, côté droit de bas en haut, côté haut de droite à gauche. Un
       brochage non multiple de quatre remplit les premiers côtés d'abord. */
    const b=Math.floor(n/4), rr=n%4;
    const per=[b+(rr>0?1:0), b+(rr>1?1:0), b+(rr>2?1:0), b];
    const lg=Math.max(0.6,p*1.8), br=Math.max(0.22,p*0.55);
    let k=1;
    for(let s=0;s<4;s++)
      for(let i=0;i<per[s];i++){
        const t=(i-(per[s]-1)/2)*p;
        if(s===0)     out.push({n:k++, x:-sp/2, y:t,     w:lg, h:br, shape:"rect", drill:0});
        else if(s===1)out.push({n:k++, x:t,     y:sp/2,  w:br, h:lg, shape:"rect", drill:0});
        else if(s===2)out.push({n:k++, x:sp/2,  y:-t,    w:lg, h:br, shape:"rect", drill:0});
        else          out.push({n:k++, x:-t,    y:-sp/2, w:br, h:lg, shape:"rect", drill:0});
      }
  }else if(fp.style==="bga"){
    /* grille au pas donné, remplie en lignes : le brochage réel d'un BGA se
       lit sur sa fiche, mais le compte, le pas et l'encombrement y sont */
    const cols=Math.max(1,Math.ceil(Math.sqrt(n))), rows=Math.ceil(n/cols);
    const d=Math.max(0.2,p*0.5);
    for(let i=0;i<n;i++)
      out.push({n:i+1, x:((i%cols)-(cols-1)/2)*p, y:(Math.floor(i/cols)-(rows-1)/2)*p,
                w:d, h:d, shape:"circ", drill:0});
  }else{
    /* deux rangées. Un brochage impair (SOT-23, DPAK) met une pastille de
       moins à droite : cette rangée est recentrée, comme sur le boîtier. */
    const h=Math.ceil(n/2), rg=n-h, smd=fp.style==="sop";
    const pw=smd?Math.max(0.9,sp*0.30):p*0.68, ph=smd?p*0.55:p*0.68;
    for(let i=0;i<h;i++)                       // colonne gauche : 1 → h
      out.push({n:i+1, x:-sp/2, y:(i-(h-1)/2)*p, w:pw, h:ph,
                shape:(smd||i===0)?"rect":"circ", drill:smd?0:Math.min(1.0,p*0.34)});
    for(let i=h;i<n;i++){                      // colonne droite : h+1 → n, de bas en haut
      const k=n-1-i;
      out.push({n:i+1, x:sp/2, y:(k-(rg-1)/2)*p, w:pw, h:ph,
                shape:smd?"rect":"circ", drill:smd?0:Math.min(1.0,p*0.34)});
    }
  }
  /* `rot` est en DEGRÉS ici, comme sur la pastille enregistrée : c'est
     padsWorld() qui le convertit en radians et y ajoute la rotation de
     l'empreinte. Les empreintes calculées ne tournent pas leurs pastilles —
     un côté vertical de QFP échange largeur et hauteur, il ne pivote pas. */
  for(const q of out){q.rot=padRot(q.rot);q.net=fp.nets[q.n]||"";}
  return out;
}
/* enveloppe du corps (sérigraphie) en coordonnées locales */
/* Demi-encombrement d'une pastille tournée : la boîte droite qui la contient.
   Une pastille non tournée retrouve exactement w/2 et h/2. */
function padHalf(q){
  const a=(q.rot||0)*Math.PI/180, ca=Math.abs(Math.cos(a)), sa=Math.abs(Math.sin(a));
  return {x:(q.w*ca+q.h*sa)/2, y:(q.w*sa+q.h*ca)/2};
}
function fpAutoBody(fp){
  const ps=padsOf(fp);
  let x1=1e9,y1=1e9,x2=-1e9,y2=-1e9;
  for(const q of ps){
    const hf=padHalf(q);
    x1=Math.min(x1,q.x-hf.x);x2=Math.max(x2,q.x+hf.x);
    y1=Math.min(y1,q.y-hf.y);y2=Math.max(y2,q.y+hf.y);
  }
  if(x1>x2)return {x1:-1,y1:-1,x2:1,y2:1};
  /* Le contour s'arrondit comme les pastilles dont il se déduit : figer une
     empreinte recopie ce rectangle, et deux arrondis différents feraient
     bouger la sérigraphie d'un dixième de micromètre à ce moment-là. */
  if(!fpFree(fp)&&(fp.style==="dip"||fp.style==="sop")){
    const in1=fp.span/2-(fp.style==="dip"?1.3:0.9);
    return {x1:r4(-in1), y1:r4(y1-0.4), x2:r4(in1), y2:r4(y2+0.4)};
  }
  return {x1:r4(x1-0.25),y1:r4(y1-0.35),x2:r4(x2+0.25),y2:r4(y2+0.35)};
}
function bodyOf(fp){
  const b=fp.body;
  if(b&&Number.isFinite(b.x1)&&Number.isFinite(b.y1)&&
        Number.isFinite(b.x2)&&Number.isFinite(b.y2))
    return {x1:Math.min(b.x1,b.x2), y1:Math.min(b.y1,b.y2),
            x2:Math.max(b.x1,b.x2), y2:Math.max(b.y1,b.y2)};
  return fpAutoBody(fp);
}
/* ---------- modifications d'une empreinte ----------
   Ces fonctions sont le seul endroit qui touche aux pastilles : la fenêtre
   d'édition et le panneau Propriétés passent par elles. L'historique reste à
   l'appelant, comme partout ailleurs (push() avant, touch() après). */

/* Le brochage d'une empreinte libre est le plus grand numéro de pastille :
   c'est lui que lit l'import de netlist pour rattacher les nets, et le
   panneau pour lister les broches. */
function fpSyncPins(fp){
  const free=fpFree(fp);
  if(!free)return;
  let m=1;
  for(const q of free)m=Math.max(m,Math.round(q.n)||1);
  fp.pins=clamp(m,1,4096);
}
/* Passage en liste explicite. Rien ne bouge à l'écran : les pastilles
   calculées sont figées telles quelles, contour compris. Ce qui change, c'est
   que chacune devient modifiable à part. */
function fpFreeze(fp){
  if(fpFree(fp))return false;
  const b=fpAutoBody(fp);
  fp.pads=padsOf(fp).map(padClone);
  fp.body={x1:r4(b.x1),y1:r4(b.y1),x2:r4(b.x2),y2:r4(b.y2)};
  fpSyncPins(fp);
  return true;
}
/* Retour au calcul automatique : le boîtier reprend la main s'il est connu,
   sinon le style et les cotes en place. Le dessin fait à la main est perdu —
   c'est un geste explicite, et Ctrl+Z le rattrape. */
function fpGeneric(fp){
  if(!fpFree(fp)&&!fp.body)return false;
  delete fp.pads;delete fp.body;
  if(!applyPkgGeom(fp)){
    const g=fpGeomFor(fp.pkg,fp.pins);
    fp.style=g.style;fp.pitch=g.pitch;fp.span=g.span;
  }
  return true;
}
/* Pose d'une pastille, en coordonnées locales. Le premier déplacement fige
   l'empreinte : on ne déplace pas une pastille calculée, on quitte le calcul.
   Deux pastilles superposées ne sont pas refusées — une traversante peut
   recouvrir une plage — mais la fenêtre les signale et le DRC les rattrape si
   elles portent des nets différents. */
function fpMovePad(fp,i,x,y){
  fpFreeze(fp);
  const q=fp.pads[i];
  if(!q)return false;
  const nx=r4(x), ny=r4(y);
  if(q.x===nx&&q.y===ny)return false;
  q.x=nx;q.y=ny;
  return true;
}
/* Retouche d'une pastille : numéro, dimensions, forme, perçage. Un perçage
   non nul fait la pastille traversante — elle apparaît alors sur toutes les
   couches, padLayers() s'en occupe — et reste plus étroit que la pastille,
   sans quoi il n'en resterait pas de cuivre. */
function fpSetPad(fp,i,k,v){
  fpFreeze(fp);
  const q=fp.pads[i];
  if(!q)return false;
  if(k==="shape"){q.shape=padShape(v);}
  else if(k==="rot"){q.rot=padRot(v);}
  else if(k==="n"){q.n=clamp(Math.round(+v)||1,1,4096);fpSyncPins(fp);}
  else if(k==="x"||k==="y"){
    if(!Number.isFinite(+v))return false;
    q[k]=clamp(r4(+v),-COORD,COORD);
  }else if(k==="w"||k==="h"){
    q[k]=clamp(r4(+v||0),0.05,200);
  }else if(k==="drill"){
    q.drill=clamp(r4(+v||0),0,200);
  }else return false;
  /* le perçage se recale après coup : retailler la pastille au-dessous de son
     trou ne doit pas laisser un anneau négatif */
  const lim=r4(Math.min(q.w,q.h)-0.05);
  if(q.drill>0&&q.drill>lim)q.drill=Math.max(0.05,lim);
  return true;
}
/* Nouvelle pastille : numérotée à la suite, posée à droite du nuage — visible,
   hors de tout ce qui existe, prête à être placée. */
function fpAddPad(fp){
  fpFreeze(fp);
  const ps=fp.pads;
  let mx=-1e9, my=0, mn=0;
  for(const q of ps){
    if(q.x+q.w/2>mx){mx=q.x+q.w/2;my=q.y;}
    mn=Math.max(mn,q.n);
  }
  const ref=ps[ps.length-1]||{w:1,h:1,shape:"rect",drill:0};
  ps.push(padClone({n:mn+1, x:mx+Math.max(0.6,ref.w), y:my,
                    w:ref.w, h:ref.h, shape:ref.shape, drill:ref.drill}));
  fpSyncPins(fp);
  return ps.length-1;
}
/* Suppression d'une pastille. Les numéros des autres ne bougent pas : le net
   de la broche 5 reste celui de la broche 5. La dernière ne se retire pas —
   une empreinte sans cuivre ne se sélectionne plus. */
function fpDelPad(fp,i){
  fpFreeze(fp);
  if(fp.pads.length<=1||i<0||i>=fp.pads.length)return false;
  fp.pads.splice(i,1);
  fpSyncPins(fp);
  return true;
}
/* Nombre de pastilles. Empreinte calculée : c'est `pins`, et tout se
   redessine. Empreinte libre : les pastilles déjà placées ne bougent pas, on
   ajoute à la suite ou on retire par la fin. */
function fpSetPins(fp,n){
  n=clamp(Math.round(n)||1,1,4096);
  if(!fpFree(fp)){fp.pins=n;return true;}
  while(fp.pads.length>n&&fp.pads.length>1)fp.pads.pop();
  while(fp.pads.length<n)fpAddPad(fp);
  fpSyncPins(fp);
  return true;
}
/* ---------- repère de la broche 1 ----------
   Un point de sérigraphie dit dans quel sens poser la pièce. Il n'a jamais été
   qu'un point sur le film — le gros anneau qu'affichait l'écran ne partait
   nulle part —, et c'est maintenant le même objet des deux côtés : un disque
   qu'on déplace où il est lisible, qu'on grossit, ou qu'on retire.

   `fp.mark` absent : la règle automatique décide. `fp.mark=false` : retiré à la
   main. `fp.mark={x,y,d}` : posé à la main, en coordonnées locales. La fenêtre
   d'empreinte écrit toujours l'un des deux derniers — dès qu'on y touche, le
   choix est explicite et ne dépend plus d'une règle.

   Sur un composant symétrique — résistance, inductance, ferrite, quartz,
   condensateur non polarisé — le repère ne dit rien : les deux pattes se
   valent, et la sérigraphie s'encombre pour rien. Il ne paraît donc pas
   d'office sur ces repères-là. Le condensateur est le cas délicat : une puce
   CMS n'est pas polarisée, un boîtier radial ou tantale l'est presque
   toujours — et un doute sur la polarité coûte plus cher qu'un point de trop.
   La case à cocher tranche dans les deux sens, composant par composant. */
const MARK_D=0.4;                       // diamètre d'usine, en millimètres
const PASSIF_REF=/^(R|RN|RV|L|FB|FL|Y|X)\d/i;
/* Nombre de pastilles sans les construire : le rendu passe ici à chaque
   image, pour chaque empreinte. */
function fpPadCount(fp){
  const free=fpFree(fp);
  return free?free.length:Math.max(1,fp.pins|0);
}
function fpMarkWanted(fp){
  if(fpPadCount(fp)!==2)return true;
  const ref=String(fp.ref||"");
  if(PASSIF_REF.test(ref))return false;
  if(/^C/i.test(ref))return fp.style!=="chip";
  return true;
}
/* Place d'usine : dehors, dans le prolongement du centre vers la broche 1 —
   là où un dessinateur le met, et où il ne recouvre pas de cuivre. */
function fpMarkAuto(fp){
  const ps=padsOf(fp);
  if(!ps.length)return null;
  const p1=ps[0], r=Math.max(p1.w,p1.h)/2+0.4;
  const a=(p1.x||p1.y)?Math.atan2(p1.y,p1.x):Math.PI;
  return {x:r4(p1.x+Math.cos(a)*r), y:r4(p1.y+Math.sin(a)*r), d:MARK_D};
}
function fpMark(fp){
  const m=fp.mark;
  if(m===false)return null;
  if(m&&typeof m==="object"&&Number.isFinite(+m.x)&&Number.isFinite(+m.y))
    return {x:r4(+m.x), y:r4(+m.y), d:clamp(r4(+m.d||MARK_D),0.1,10)};
  return fpMarkWanted(fp)?fpMarkAuto(fp):null;
}
/* Montrer ou retirer : les deux s'écrivent, pour que la règle automatique ne
   revienne pas décider à la place de l'utilisateur. */
function fpSetMark(fp,on){
  if(!on){fp.mark=false;return true;}
  const m=fpMark(fp)||fpMarkAuto(fp);
  fp.mark=m?{x:m.x,y:m.y,d:m.d}:{x:0,y:0,d:MARK_D};
  return true;
}
function fpMoveMark(fp,x,y){
  const m=fpMark(fp);
  if(!m)return false;
  const nx=r4(x), ny=r4(y);
  if(fp.mark&&typeof fp.mark==="object"&&fp.mark.x===nx&&fp.mark.y===ny)return false;
  fp.mark={x:nx,y:ny,d:m.d};
  return true;
}
function fpSetMarkD(fp,d){
  const m=fpMark(fp);
  if(!m)return false;
  fp.mark={x:m.x,y:m.y,d:clamp(r4(d),0.1,10)};
  return true;
}

/* ---------- origine de l'empreinte ----------
   L'origine du repère local, c'est le point d'accrochage : `fp.x`, `fp.y` sur
   la carte. C'est par lui que l'empreinte se déplace, autour de lui qu'elle
   pivote, et de lui que se placent le repère et la valeur sur la sérigraphie
   (fpTextPos). Une empreinte calculée l'a d'office en son centre ; un dessin
   fait à la main peut l'en écarter sans le vouloir, en déplaçant une pastille.

   `fpMoveOrigin` prend un point du repère local et en fait la nouvelle
   origine : les pastilles et le contour reculent d'autant, `fp.x`/`fp.y`
   avancent d'autant sur la carte. Le cuivre ne bouge donc pas d'un micron —
   seule change la poignée par laquelle on le tient. */
function fpLocalBox(fp){
  const b=bodyOf(fp);
  let x1=b.x1,y1=b.y1,x2=b.x2,y2=b.y2;
  for(const q of padsOf(fp)){
    const hf=padHalf(q);
    x1=Math.min(x1,q.x-hf.x);x2=Math.max(x2,q.x+hf.x);
    y1=Math.min(y1,q.y-hf.y);y2=Math.max(y2,q.y+hf.y);
  }
  return {x1:x1,y1:y1,x2:x2,y2:y2};
}
function fpMoveOrigin(fp,lx,ly){
  const dx=r4(lx), dy=r4(ly);
  if(!Number.isFinite(dx)||!Number.isFinite(dy))return false;
  if(!dx&&!dy)return false;
  const c=fpXform(fp)(dx,dy);          // où ce point se trouve sur la carte
  fpFreeze(fp);                        // une empreinte calculée se recentre seule
  for(const q of fp.pads){q.x=r4(q.x-dx);q.y=r4(q.y-dy);}
  const b=fp.body;
  if(b){b.x1=r4(b.x1-dx);b.y1=r4(b.y1-dy);b.x2=r4(b.x2-dx);b.y2=r4(b.y2-dy);}
  /* le point de repère est posé dans le repère local : il recule comme le
     reste, sinon il sauterait sur la sérigraphie */
  const m=fp.mark;
  if(m&&typeof m==="object"){m.x=r4(m.x-dx);m.y=r4(m.y-dy);}
  fp.x=r3(c.x);fp.y=r3(c.y);
  return true;
}
/* Origine au centre de l'encombrement. C'est l'état dans lequel la fenêtre
   d'empreinte rend toujours l'empreinte : une poignée au milieu du composant
   se saisit là où on la cherche, la rotation tourne autour du composant et non
   à côté, et le repère de sérigraphie — placé à mi-hauteur du contour, de part
   et d'autre de l'origine — retombe où il faut. Déjà centrée : rien à faire,
   et surtout pas figer une empreinte calculée pour rien. */
function fpOffCenter(fp){
  const b=fpLocalBox(fp);
  return {x:r4((b.x1+b.x2)/2), y:r4((b.y1+b.y2)/2)};
}
/* Un demi-micromètre d'écart n'est pas un décentrage : c'est un arrondi. */
function fpIsCentered(fp){
  const c=fpOffCenter(fp);
  return Math.abs(c.x)<5e-4&&Math.abs(c.y)<5e-4;
}
function fpCenterOrigin(fp){
  if(fpIsCentered(fp))return false;
  const c=fpOffCenter(fp);
  return fpMoveOrigin(fp,c.x,c.y);
}
/* Rectangle de sérigraphie imposé, en coordonnées locales. `null` rend la
   main au contour automatique. */
function fpSetBody(fp,b){
  if(!b){delete fp.body;return true;}
  const x1=+b.x1, y1=+b.y1, x2=+b.x2, y2=+b.y2;
  if(![x1,y1,x2,y2].every(Number.isFinite))return false;
  fp.body={x1:r4(Math.min(x1,x2)), y1:r4(Math.min(y1,y2)),
           x2:r4(Math.max(x1,x2)), y2:r4(Math.max(y1,y2))};
  if(fp.body.x2-fp.body.x1<0.1)fp.body.x2=r4(fp.body.x1+0.1);
  if(fp.body.y2-fp.body.y1<0.1)fp.body.y2=r4(fp.body.y1+0.1);
  return true;
}
/* transformation locale → monde */
function fpXform(fp){
  const a=(fp.rot||0)*Math.PI/180, ca=Math.cos(a), sa=Math.sin(a), m=fp.side?-1:1;
  return (x,y)=>({x:fp.x+(m*x)*ca-y*sa, y:fp.y+(m*x)*sa+y*ca});
}
/* Pastilles en coordonnées monde. `rot` y est en RADIANS : c'est l'angle du
   dessin, empreinte et pastille cumulées, tel que l'attendent padPath(),
   padDist() et les ouvertures Gerber. Sur une empreinte retournée, la
   rotation propre d'une pastille s'inverse avec le miroir. */
function padsWorld(fp){
  const T=fpXform(fp), a=(fp.rot||0)*Math.PI/180, m=fp.side?-1:1;
  return padsOf(fp).map(q=>{
    const c=T(q.x,q.y);
    return {n:q.n, x:r3(c.x), y:r3(c.y), w:q.w, h:q.h, shape:q.shape,
            drill:q.drill, net:q.net, rot:a+m*(q.rot||0)*Math.PI/180, fp};
  });
}
function padLayers(fp,pad){
  if(pad.drill>0){const L=[];for(let i=0;i<S.cu;i++)L.push(i);return L;}
  return [fp.side?S.cu-1:0];
}
function fpBBox(fp){
  const T=fpXform(fp), b=bodyOf(fp), ps=padsWorld(fp);
  let x1=1e9,y1=1e9,x2=-1e9,y2=-1e9;
  for(const c of [T(b.x1,b.y1),T(b.x2,b.y1),T(b.x2,b.y2),T(b.x1,b.y2)]){
    x1=Math.min(x1,c.x);x2=Math.max(x2,c.x);y1=Math.min(y1,c.y);y2=Math.max(y2,c.y);
  }
  for(const q of ps){
    const r=Math.max(q.w,q.h)/2;
    x1=Math.min(x1,q.x-r);x2=Math.max(x2,q.x+r);y1=Math.min(y1,q.y-r);y2=Math.max(y2,q.y+r);
  }
  return {x1,y1,x2,y2};
}
function fpTextPos(fp){
  const b=bodyOf(fp);
  const size=Math.max(0.9,Math.min(2.2,(b.x2-b.x1)*0.34));
  return {
    ref: {x: fp.x+(fp.refOffX||0), y: fp.y-((b.y2-b.y1)/2+size*0.85)+(fp.refOffY||0), size: size},
    val: {x: fp.x+(fp.valOffX||0), y: fp.y+((b.y2-b.y1)/2+size*0.85)+(fp.valOffY||0), size: size*0.85}
  };
}
function fpById(id){return S.fps.find(f=>f.id===id)||null;}

/* ==========================================================================
   Zones de cuivre — polygones tracés à la main, rattachés à un net
   ========================================================================== */
function inPoly(x,y,pts){
  let inside=false;
  for(let i=0,j=pts.length-1;i<pts.length;j=i++){
    const a=pts[i], b=pts[j];
    if((a.y>y)!==(b.y>y) && x < (b.x-a.x)*(y-a.y)/(b.y-a.y)+a.x) inside=!inside;
  }
  return inside;
}
function polyBBox(pts){
  let x1=1e9,y1=1e9,x2=-1e9,y2=-1e9;
  for(const p of pts){
    x1=Math.min(x1,p.x);x2=Math.max(x2,p.x);
    y1=Math.min(y1,p.y);y2=Math.max(y2,p.y);
  }
  return {x1,y1,x2,y2};
}
/* distance d'un point au contour du polygone (utile pour l'attraper au clic) */
function polyEdgeDist(x,y,pts){
  let d=1e9;
  for(let i=0,j=pts.length-1;i<pts.length;j=i++)
    d=Math.min(d,segDist(x,y,pts[j].x,pts[j].y,pts[i].x,pts[i].y));
  return d;
}
function zoneAt(l,x,y){
  for(let i=S.zones.length-1;i>=0;i--){
    const z=S.zones[i];
    if(z.l===l&&inPoly(x,y,z.pts))return z;
  }
  return null;
}
/* Le rôle « plan de cuivre » d'une couche n'est qu'un raccourci : il entretient
   une zone pleine carte, marquée auto, qui suit le contour et le net choisis.
   Tout le reste du programme ne connaît donc que des zones. */
function syncAutoZones(){
  S.zones=S.zones.filter(z=>!z.auto||(S.cuL[z.l]&&S.cuL[z.l].plane));
  S.cuL.forEach((L,i)=>{
    if(!L.plane)return;
    let z=S.zones.find(o=>o.auto&&o.l===i);
    if(!z){z={id:S.nextId++,l:i,net:L.net||"",pts:[],auto:true};S.zones.push(z);}
    z.net=L.net||"";
    z.pts=boardZonePts();
  });
  touch();
}
/* Déformer un plan de couche à la main le détache de son rôle : à partir de là
   c'est une zone ordinaire, qui ne suivra plus les dimensions de la carte. */
function detachAuto(z){
  if(!z||!z.auto)return false;
  z.auto=false;
  if(S.cuL[z.l])S.cuL[z.l].plane=false;
  return true;
}
/* Contour de carte : rectangle par défaut, polygone dès qu'on en dessine un.
   Tout le reste du programme passe par boardPoly() et n'a pas à savoir lequel
   des deux est en vigueur. */
function boardPoly(){
  const b=S.board;
  if(b.pts&&b.pts.length>=3)return b.pts;
  return [{x:b.x,y:b.y},{x:b.x+b.w,y:b.y},{x:b.x+b.w,y:b.y+b.h},{x:b.x,y:b.y+b.h}];
}
function signedArea(pts){
  let a=0;
  for(let i=0,j=pts.length-1;i<pts.length;j=i++)
    a+=(pts[j].x*pts[i].y-pts[i].x*pts[j].y);
  return a/2;
}
function orient(pts,ccw){
  return (signedArea(pts)>0)===!!ccw?pts.slice():pts.slice().reverse();
}
/* Le remplissage d'une zone est rogné au contour moins la marge de bord : la
   zone peut donc être tracée grossièrement, elle ne débordera pas. */
function boardZonePts(){return boardPoly().map(p=>({x:r3(p.x),y:r3(p.y)}));}
function boardChanged(){
  const P=S.board.pts;
  if(P&&P.length>=3){
    const b=polyBBox(P);
    S.board.x=r3(b.x1);S.board.y=r3(b.y1);
    S.board.w=Math.max(1,r3(b.x2-b.x1));S.board.h=Math.max(1,r3(b.y2-b.y1));
  }
  syncAutoZones();
  if(typeof zoneCache!=="undefined")zoneCache.clear();
  touch();
}
/* Redimensionner : un rectangle change de côtés, un contour libre se met à
   l'échelle — ses proportions changent, pas son dessin. */
function setBoardSize(w,h){
  const b=S.board;
  w=Math.max(5,w);h=Math.max(5,h);
  if(b.pts&&b.pts.length>=3){
    const sx=w/b.w, sy=h/b.h, ox=b.x, oy=b.y;
    for(const p of b.pts){p.x=r3(ox+(p.x-ox)*sx);p.y=r3(oy+(p.y-oy)*sy);}
  }
  b.w=w;b.h=h;
  boardChanged();
}
function setBoardRect(){
  S.board.pts=null;
  boardChanged();
}

/* ==========================================================================
   Nets
   ========================================================================== */
function netColor(name){
  if(!name)return "#8b919c";
  if(/^(gnd|agnd|dgnd|pgnd|masse|0v)$/i.test(name))return "#e8746a";
  let h=0;
  for(let i=0;i<name.length;i++)h=(h*31+name.charCodeAt(i))|0;
  return "hsl("+(((h%360)+360)%360)+",64%,64%)";
}
function isPower(name){return PWR_RE.test(String(name||"").replace(/\s/g,""));}
/* ---------- classes de net ----------
   Une classe nomme un jeu de règles (largeur, isolation, via) et s'applique aux
   nets qu'on lui rattache. Tout net non rattaché suit la première, « Défaut ». */
const FALLBACK_CLASS={name:"Défaut",w:0.3,clr:0.25,via:0.8,drill:0.4};
function defClass(){return S.classes[0]||FALLBACK_CLASS;}
function classOf(net){
  const n=S.netClass[net];
  if(n){
    const c=S.classes.find(x=>x.name===n);
    if(c)return c;
  }
  return defClass();
}
function className(net){return classOf(net).name;}
function setNetClass(net,name){
  if(!net)return;
  if(!name||name===defClass().name)delete S.netClass[net];
  else S.netClass[net]=name;
}
function defaultWidth(net){return classOf(net).w;}
/* Le perçage réellement fait pour un via de cette classe : la cote demandée,
   sans jamais manger la rondelle au point de la faire disparaître. `mkVia` pose
   d'après cette formule ; tout ce qui a besoin de connaître le trou AVANT que le
   via existe la lit ici plutôt que de la recopier. */
function viaDrill(cl){return Math.min(cl.drill,cl.via-0.1);}
/* ---------- trou à trou ----------
   La bande de stratifié que le fabricant exige entre deux perçages. Elle ne
   dépend d'AUCUN net : c'est le foret qui la réclame, pas l'électricité. Deux
   vias de masse qui se rejoignent ne font pas deux trous, ils en font un seul,
   déchiré — le foret casse, et le fichier de perçage devient illisible. C'est
   pour cela qu'elle ne peut pas vivre dans les classes de net, où l'isolation,
   elle, s'annule d'office entre deux cuivres déjà reliés.
   0,25 mm est le minimum courant en fabrication standard. */
function holeClr(){
  const v=+S.rule.hole;
  return Number.isFinite(v)&&v>=0?v:0.25;
}
/* ---------- la matrice des natures de cuivre ----------
   La classe de net dit ce qu'un net exige de tout le monde. Elle ne sait pas
   dire qu'un via demande plus de place qu'une piste, ni qu'une pastille CMS
   supporte d'être serrée là où une pastille traversante ne le supporte pas —
   et c'est pourtant ainsi que les fabricants écrivent leurs règles, dans un
   tableau à double entrée que tout éditeur de CAO reprend.
   La matrice comble ce manque, et rien de plus : chaque case est un MINIMUM
   qui s'ajoute à la classe, jamais un remplacement. Une case à zéro — l'état
   d'usine, et celui de tous les documents écrits avant elle — laisse donc la
   classe seule maîtresse, et le contrôle rend exactement ce qu'il rendait.
   La case trou/trou est l'exception : il y avait déjà une règle pour elle
   (`S.rule.hole`), le foret n'attend pas de savoir ce qu'est un net, et elle
   se lit et s'écrit donc là où elle a toujours vécu. Le reste de la ligne
   « trou » n'existe pas : un perçage n'a d'isolation qu'avec un autre perçage,
   sa rondelle se charge du cuivre. */
const DRC_KINDS=[["trk","Piste"],["smd","Pastille CMS"],["th","Pastille TH"],
                 ["via","Via"],["cu","Cuivre"],["hole","Trou"]];
const DRC_ORDER=DRC_KINDS.map(k=>k[0]);
const DRC_KIND_NAME={};
for(const [k,n] of DRC_KINDS)DRC_KIND_NAME[k]=n;
/* Une case n'a qu'un nom, quel que soit le sens dans lequel on la demande :
   l'isolation piste/via est celle du via/piste. */
function matKey(a,b){
  const i=DRC_ORDER.indexOf(a), j=DRC_ORDER.indexOf(b);
  return i<=j?a+"|"+b:b+"|"+a;
}
/* Les cases que la matrice porte vraiment : tout sauf la ligne « trou », dont
   seule la diagonale existe et vit dans `S.rule.hole`. */
function matHas(a,b){
  if(DRC_ORDER.indexOf(a)<0||DRC_ORDER.indexOf(b)<0)return false;
  if(a==="hole"||b==="hole")return a===b;
  return true;
}
function matGet(a,b){
  if(a==="hole"&&b==="hole")return holeClr();
  if(!matHas(a,b))return 0;
  const m=S.rule.mat;
  const v=(m&&typeof m==="object")?+m[matKey(a,b)]:0;
  return Number.isFinite(v)&&v>0?v:0;
}
function matSet(a,b,v){
  if(a==="hole"&&b==="hole"){S.rule.hole=Math.max(0,+v||0);return;}
  if(!matHas(a,b))return;
  if(!S.rule.mat||typeof S.rule.mat!=="object")S.rule.mat={};
  const k=matKey(a,b), n=+v;
  if(Number.isFinite(n)&&n>0)S.rule.mat[k]=n;
  else delete S.rule.mat[k];
}
/* La plus grande case de la matrice, hors trou : elle entre dans la marge des
   fenêtres d'interrogation, comme l'isolation des classes. */
function matMax(){
  const m=S.rule.mat;
  if(!m||typeof m!=="object")return 0;
  let x=0;
  for(const k in m){
    if(k.indexOf("hole")>=0)continue;
    const v=+m[k];
    if(Number.isFinite(v)&&v>x)x=v;
  }
  return x;
}
/* L'exception de la paire différentielle, isolée pour que les deux mesures —
   celle des classes et celle de la matrice — la respectent à l'identique.
   Une paire tenue à 0,15 mm sous une classe qui exige 0,25 mm n'est pas une
   carte en faute : c'est le principe même de la paire, et sans cette exception
   le routeur refuserait de la poser, le DRC la condamnerait et les zones de
   cuivre l'écarteraient à tort. C'est aussi pour cela que la matrice ne peut
   pas la relever : une case piste/piste plus large la condamnerait de nouveau,
   par la porte de derrière. */
function dpGapPair(a,b){
  if(a&&b&&a!==b&&typeof dpOfNet==="function"){
    const d=dpOfNet(a);
    if(d&&(d.p===b||d.n===b))return dpMinGap(d);
  }
  return null;
}
/* Isolation entre deux nets : la plus exigeante des deux classes l'emporte. */
function clrPair(a,b){
  const g=dpGapPair(a,b);
  if(g!=null)return g;
  return Math.max(classOf(a).clr,classOf(b).clr);
}
/* La même, natures comprises : c'est celle-ci que le contrôle, le routeur et
   les zones de cuivre appliquent. `ka` et `kb` disent de quoi il s'agit —
   piste, pastille CMS, pastille traversante, via, cuivre plein. */
function clrK(a,b,ka,kb){
  const g=dpGapPair(a,b);
  if(g!=null)return g;
  return Math.max(classOf(a).clr,classOf(b).clr,matGet(ka,kb));
}
function maxClr(){
  let m=0;
  for(const c of S.classes)m=Math.max(m,c.clr);
  return Math.max(m||FALLBACK_CLASS.clr,matMax());
}
/* rattache d'office les nets d'alimentation à la classe du même nom, si elle
   existe, et applique les classes déduites du schéma si disponibles */
function autoClass(){
  const pwr=S.classes.find(c=>/aliment/i.test(c.name));
  if(pwr){
    for(const n of netTable())
      if(isPower(n.name)&&!S.netClass[n.name])S.netClass[n.name]=pwr.name;
  }

  /* Intégration des classes déduites par l'analyse des motifs de circuit */
  try {
    const rawNc = typeof sessionStorage !== "undefined" && sessionStorage.getItem("web_cao_netclasses");
    if (rawNc) {
      const mapNc = JSON.parse(rawNc);
      if (mapNc && typeof mapNc === "object") {
        let fast = S.classes.find(c => /rapide|fast/i.test(c.name));
        let analog = S.classes.find(c => /analog/i.test(c.name));

        const nets = netTable();
        const hasFastNet = nets.some(n => /rapide/i.test(mapNc[n.name] || ""));
        const hasAnalogNet = nets.some(n => /analog/i.test(mapNc[n.name] || ""));

        if (!fast && hasFastNet) {
          fast = { name: "Rapide", w: 0.25, clr: 0.25, via: 0.8, drill: 0.4 };
          S.classes.push(fast);
        }
        if (!analog && hasAnalogNet) {
          analog = { name: "Analogique", w: 0.30, clr: 0.35, via: 0.8, drill: 0.4 };
          S.classes.push(analog);
        }

        for (const n of nets) {
          const sug = mapNc[n.name];
          if (!sug || S.netClass[n.name]) continue;
          if (/rapide/i.test(sug) && fast) S.netClass[n.name] = fast.name;
          else if (/analog/i.test(sug) && analog) S.netClass[n.name] = analog.name;
          else if (/alim/i.test(sug) && pwr) S.netClass[n.name] = pwr.name;
        }
      }
    }
  } catch (_) {}
}

function pcbAppliquerClassesSuggerees(){
  autoClass();
  if(typeof touch==="function")touch();
  if(typeof refreshPanels==="function")refreshPanels();
  if(typeof draw==="function")draw();
}
/* liste des nets présents, avec leurs nœuds */
function netTable(){
  const m=new Map();
  for(const fp of S.fps)
    for(const q of padsOf(fp)){
      if(!q.net)continue;
      if(!m.has(q.net))m.set(q.net,{name:q.net,nodes:[],color:netColor(q.net)});
      m.get(q.net).nodes.push({ref:fp.ref,pin:q.n,id:fp.id});
    }
  for(const t of S.tracks) if(t.net&&!m.has(t.net))
    m.set(t.net,{name:t.net,nodes:[],color:netColor(t.net)});
  return [...m.values()].sort((a,b)=>
    (isPower(b.name)?1:0)-(isPower(a.name)?1:0) ||
    String(a.name).localeCompare(String(b.name),"fr",{numeric:true}));
}

/* ==========================================================================
   Paires différentielles — le modèle
   --------------------------------------------------------------------------
   Une paire, c'est deux nets qu'on route ensemble : la piste P et la piste N,
   côte à côte, à écartement constant. Ce qui la définit tient en trois choses
   — le couple de nets, la largeur des pistes et l'écart entre elles — et c'est
   ce couple largeur/écart qui fixe l'impédance différentielle. Tout le reste
   du programme continue de ne voir que deux nets ordinaires : une paire ne
   crée aucun objet sur la carte, elle dit seulement comment les router et ce
   que le contrôle DRC doit vérifier.

   Les **règles** sont rangées à part, comme les classes de net : une règle
   nomme un jeu de contraintes (mini, préféré, maxi, pour la largeur comme pour
   l'écart) et s'applique aux paires qu'elle vise. La première règle qui vise
   la paire l'emporte — la priorité, c'est l'ordre de la liste, comme dans les
   règles de conception dont ce panneau reprend la disposition.
   ========================================================================== */
/* Les suffixes qui font une paire, du plus explicite au plus court. C'est la
   règle de KiCad (« les noms doivent se terminer par N/P ou +/- »), élargie
   aux notations qu'on rencontre sur les bus série : USB_DP/USB_DM, D+/D-,
   TXP/TXN. La détection ne propose une paire que si les DEUX nets existent :
   « VCCN » tout seul n'a jamais fait un net différentiel. */
const DP_SUF=[["dp","dm"],["dp","dn"],["d+","d-"],["tp","tn"],["rp","rn"],
              ["hsp","hsm"],["+","-"],["p","n"]];
const DP_SEP=/[_\-.]$/;
/* Découpe un nom de net en (base, séparateur, suffixe) pour chacun des
   arrangements possibles. Le suffixe le plus long est essayé d'abord : sans
   cela « USB_DP » se lirait « USB_D » + « P », et son complémentaire serait
   « USB_DN » au lieu de « USB_DM ». */
function dpSplit(net){
  const s=String(net||"");
  const out=[];
  for(const [a,b] of DP_SUF)
    for(const [suf,pol] of [[a,"p"],[b,"n"]]){
      if(s.length<=suf.length)continue;
      const tail=s.slice(s.length-suf.length);
      if(tail.toLowerCase()!==suf)continue;
      let base=s.slice(0,s.length-suf.length), sep="";
      if(DP_SEP.test(base)){sep=base.slice(-1);base=base.slice(0,-1);}
      if(!base)continue;
      out.push({base:base,sep:sep,pol:pol,suf:tail,mate:pol==="p"?b:a});
    }
  return out;
}
/* Le nom complémentaire, écrit comme l'original : suffixe en capitales si
   l'original l'était, en minuscules sinon. « USB_DP » donne « USB_DM », et
   « usb_dp » donne « usb_dm ». */
function dpMateName(sp){
  const up=sp.suf===sp.suf.toUpperCase();
  return sp.base+sp.sep+(up?sp.mate.toUpperCase():sp.mate);
}
/* La paire que forment deux nets, s'ils en forment une : {p,n,base}. L'ordre
   des arguments n'a pas d'importance, c'est le suffixe qui décide qui est P. */
function dpMatch(a,b){
  for(const sp of dpSplit(a))
    if(dpMateName(sp)===b)
      return sp.pol==="p"?{p:a,n:b,base:sp.base}:{p:b,n:a,base:sp.base};
  return null;
}
/* Les paires que la netlist contient sans qu'on ait rien déclaré. Sert au
   bouton « Détecter » du panneau : c'est le DpNetPair du routeur de KiCad,
   appliqué à toute la carte d'un coup plutôt qu'au net cliqué. */
function dpDetect(){
  const nets=netTable().map(n=>n.name), seen=new Set(), out=[];
  for(const a of nets){
    if(seen.has(a))continue;
    for(const sp of dpSplit(a)){
      const b=dpMateName(sp);
      if(b===a||nets.indexOf(b)<0||seen.has(b))continue;
      const m=dpMatch(a,b);
      if(!m)continue;
      seen.add(a);seen.add(b);
      out.push({name:m.base,p:m.p,n:m.n});
      break;
    }
  }
  return out;
}
/* ---------- accès aux paires ---------- */
function dpById(id){return S.dpPairs.find(x=>x.id===id)||null;}
function dpByName(name){return S.dpPairs.find(x=>x.name===name)||null;}
/* La paire à laquelle appartient un net, ou null. Un net n'est que dans une
   paire à la fois : la première trouvée est la bonne. */
function dpOfNet(net){
  if(!net)return null;
  return S.dpPairs.find(x=>x.p===net||x.n===net)||null;
}
/* Le net d'en face, dans la paire d'un net donné. */
function dpMateNet(net){
  const d=dpOfNet(net);
  return d?(d.p===net?d.n:d.p):null;
}
/* Un nom de paire libre, dérivé de la base commune aux deux nets. */
function dpFreeName(base){
  const b=String(base||"PAIRE").replace(/[_\-.]+$/,"")||"PAIRE";
  if(!dpByName(b))return b;
  for(let k=2;k<999;k++)if(!dpByName(b+"_"+k))return b+"_"+k;
  return b+"_"+S.nextId;
}
/* ---------- les deux nets en attente, côté panneau ----------
   Ce que le panneau des paires retient entre deux reconstructions : les deux
   nets désignés dans ses listes, tant que « Créer la paire » n'a pas été
   cliqué. Rien n'en va dans le document — ce n'est pas de l'état de carte,
   c'est un geste en cours.

   Pourquoi ici et non dans `09-diffpair`, où vit le panneau : `init()` appelle
   `refreshPanels()`, donc `buildDiffPairs()`, avant que les déclarations de
   `09` se soient exécutées. En un seul fichier les fonctions y sont remontées,
   mais pas les `let` — un `let` de `09` lu à cet instant lève une erreur de
   zone morte. Déclarés dans `01-core`, qui ouvre la marche, ils sont prêts. */
let _dpNewP="", _dpNewN="";

/* ---------- règles ----------
   La règle d'usine sert tant qu'aucune n'a été écrite : mêmes valeurs que la
   classe par défaut pour la largeur, et un écart de 0,15 mm — de quoi tenir
   90 Ω sur un FR-4 de 1,6 mm en quatre couches. `defClass()` a le même rôle
   pour les classes de net, et le même garde-fou : une carte sans règle se
   route quand même. */
const DP_FALLBACK={name:"PairesDiff_1",comment:"",uid:"",scope:"",
                   allLayers:true,
                   minW:0.15,prefW:0.2,maxW:0.4,
                   minGap:0.13,prefGap:0.15,maxGap:0.4,
                   maxUncoupled:12.7,useImp:false,imp:"",layers:{}};
/* La règle qui vise une paire : la première de la liste qui la nomme, sinon la
   première qui ne restreint rien, sinon la règle d'usine. `scope` vide vise
   toutes les paires — c'est le « aucune paire visée » du panneau, qui laisse
   la règle s'appliquer partout. */
function dpRuleFor(pair){
  const nm=pair&&pair.name;
  for(const r of S.dpRules)if(r.scope&&nm&&r.scope===nm)return r;
  for(const r of S.dpRules)if(!r.scope)return r;
  return S.dpRules[0]||DP_FALLBACK;
}
/* Les six contraintes, résolues pour une couche donnée. Une règle porte des
   valeurs générales et, si elle ne s'applique pas à toutes les couches, des
   retouches couche par couche : c'est le tableau du bas du panneau. */
const DP_KEYS=["minW","prefW","maxW","minGap","prefGap","maxGap"];
function dpValues(rule,layer){
  const r=rule||DP_FALLBACK, out={};
  for(const k of DP_KEYS)out[k]=r[k];
  if(!r.allLayers&&r.layers){
    const o=r.layers[layer];
    if(o)for(const k of DP_KEYS)if(Number.isFinite(+o[k]))out[k]=+o[k];
  }
  out.maxUncoupled=r.maxUncoupled;
  return out;
}
/* Le plus petit écart que la règle admette, toutes couches confondues : c'est
   la distance dont l'isolation ne doit jamais descendre entre les deux nets de
   la paire. `clrPair` s'en sert, et il ne connaît pas la couche. */
function dpMinGap(pair){
  const r=dpRuleFor(pair);
  let m=r.minGap;
  if(!r.allLayers&&r.layers)
    for(const k in r.layers){
      const v=+r.layers[k].minGap;
      if(Number.isFinite(v)&&v<m)m=v;
    }
  return Math.max(0.02,m);
}
/* ---------- l'isolation entre les DEUX VIAS d'une paire ----------
   `clrPair` rend, entre les deux nets d'une paire, l'écart de la règle de paire
   — 0,13 mm typiquement, bien en deçà de ce que la classe exigerait. C'est le
   principe même de la paire, et c'est juste POUR LES PISTES : l'écart tenu au
   centième sur toute la longueur, c'est ce qui fait l'impédance différentielle,
   et le refuser reviendrait à interdire la paire.

   Sur les VIAS, ce raisonnement ne tient plus. Là, le couplage est déjà rompu —
   c'est même ce que mesure la longueur découplée — et ce qui reste face à face,
   c'est du cuivre d'un net contre du cuivre d'un autre, que le graveur traite
   comme partout ailleurs. Les deux vias d'une paire se tenaient donc plus
   serrés que deux vias posés à la main, sans que rien ne le justifie : c'est
   visible à l'œil sur une carte qui mélange les deux.
   D'où cette cote à part : l'isolation ORDINAIRE des deux classes, et jamais
   moins que le minimum de la règle de paire — une paire plus large que sa
   classe reste une paire. */
function dpViaGap(pair){
  return Math.max(classOf(pair.p).clr, classOf(pair.n).clr, dpMinGap(pair));
}
/* Largeur et écart de tracé d'une paire sur une couche : les valeurs
   préférées, ramenées entre le mini et le maxi — une règle retouchée à la main
   peut se contredire, et le routeur ne doit pas poser du cuivre hors bornes. */
function dpGeom(pair,layer){
  const v=dpValues(dpRuleFor(pair),layer==null?S.active:layer);
  const w=clamp(v.prefW,Math.min(v.minW,v.maxW),Math.max(v.minW,v.maxW));
  const g=clamp(v.prefGap,Math.min(v.minGap,v.maxGap),Math.max(v.minGap,v.maxGap));
  return {w:Math.max(0.05,w),gap:Math.max(0.02,g),v:v};
}
/* Identifiant de règle : huit lettres, comme celui que les logiciels de CAO
   collent sur chaque règle. Il ne sert qu'à la désigner sans ambiguïté dans un
   échange — deux règles renommées pareil restent distinctes — et se range avec
   le document. */
function dpUid(){
  let s="";
  for(let i=0;i<8;i++)s+="ABCDEFGHIJKLMNOPQRSTUVWXYZ"[Math.floor(Math.random()*26)];
  return s;
}

/* ==========================================================================
   Impédance différentielle
   --------------------------------------------------------------------------
   L'empilage physique dit déjà tout ce qu'il faut : l'épaisseur qui sépare la
   piste de son plan de référence, la constante diélectrique du stratifié et
   l'épaisseur du cuivre. Reste à en tirer l'impédance, avec les formules
   approchées de l'IPC-2141 — celles que tout le monde emploie pour dégrossir,
   à ±10 % près. Le fabricant, lui, tranchera au calcul de champ : ce panneau
   sert à partir avec des cotes plausibles, pas à signer une commande.
   ========================================================================== */
/* Profils courants : ce que demandent les bus qu'on route en paire. */
const DP_PROFILES=[{id:"D90",z:90,n:"D90 — USB 2.0"},
                   {id:"D100",z:100,n:"D100 — Ethernet, LVDS"},
                   {id:"D85",z:85,n:"D85 — PCIe, USB 3"},
                   {id:"D120",z:120,n:"D120 — CAN, RS-485"}];
function dpProfile(id){return DP_PROFILES.find(p=>p.id===id)||null;}
/* Une couche porte un plan de référence si son rôle en est un, ou si une zone
   pleine carte y a été posée — même vérité que pour le DRC : le cuivre
   réellement en place, pas l'intention. */
function dpIsPlane(i){
  if(rolePlane(layerRole(i)))return true;
  return S.zones.some(z=>z.l===i&&z.auto);
}
/* Épaisseur de diélectrique entre deux couches de cuivre, et Dk moyen pondéré
   par l'épaisseur. */
function dpDiBetween(a,b){
  if(b<a){const k=a;a=b;b=k;}
  let t=0,s=0;
  for(let i=a;i<b;i++){const d=diAt(i);t+=d.t;s+=d.t*d.er;}
  return {t:r4(t),er:t>0?r4(s/t):4.5};
}
/* La géométrie vue par les formules : microruban quand la couche n'a de plan
   que d'un côté — les deux faces extérieures —, triplaque quand elle en a de
   part et d'autre. `h` est la distance au plan le plus proche ; pour la
   triplaque, `b` est la distance entre les deux plans. */
function dpStripGeom(layer){
  const i=clamp(layer==null?S.active:layer,0,S.cu-1);
  let up=null,dn=null;
  for(let k=i-1;k>=0;k--)if(dpIsPlane(k)){up=k;break;}
  for(let k=i+1;k<S.cu;k++)if(dpIsPlane(k)){dn=k;break;}
  const t=cuT(i);
  if(up!=null&&dn!=null){
    const a=dpDiBetween(up,i), c=dpDiBetween(i,dn);
    return {kind:"strip",h:Math.min(a.t,c.t),b:r4(a.t+c.t+t),
            er:r4((a.er*a.t+c.er*c.t)/Math.max(1e-6,a.t+c.t)),t:t,ref:2};
  }
  const near=up!=null?up:dn;
  if(near==null){                       // aucun plan : on se rabat sur le voisin
    const j=i===0?Math.min(1,S.cu-1):i-1;
    const d=dpDiBetween(i,j);
    return {kind:"micro",h:d.t||0.2,b:0,er:d.er,t:t,ref:0};
  }
  const d=dpDiBetween(i,near);
  return {kind:"micro",h:d.t||0.2,b:0,er:d.er,t:t,ref:1};
}
/* Impédance caractéristique d'une piste seule, puis impédance différentielle
   de la paire. `s` est l'écart entre bords de cuivre.

   UNE SEULE FORMULE LÉGÈRE POUR TOUT L'ÉDITEUR. Le microruban passait ici par
   la forme IPC-2141A — 87/√(εr+1,41)·ln(5,98h/(0,8w+t)) — pendant que la fiche
   « Ligne de transmission » passait par Hammerstad-Jensen : 45,9 Ω contre
   51,0 Ω sur la même piste, dans le même outil, sans rien pour trancher. C'est
   `ltZ0()` qui tranche, parce qu'elle est celle des deux qui se recoupe avec
   le solveur de section (48,0 Ω) une fois l'épaisseur du cuivre prise en
   compte. La forme IPC reste pour la triplaque, où les deux ne différaient
   pas. Le facteur de couplage `k` ci-dessous, lui, ne bouge pas. */
function dpZ0(g,w){
  return ltZ0(g,w);
}
function dpZdiff(w,s,layer){
  const g=dpStripGeom(layer), z0=dpZ0(g,w);
  if(!(z0>0))return 0;
  const k=g.kind==="strip"
    ? 1-0.347*Math.exp(-2.9*s/Math.max(g.b,1e-4))
    : 1-0.48 *Math.exp(-0.96*s/Math.max(g.h,1e-4));
  return r3(2*z0*Math.max(0.05,k));
}
/* La largeur qui tombe sur l'impédance visée, à écart fixé — par dichotomie,
   l'impédance étant décroissante en largeur. Rien de mieux à faire : ces
   formules ne s'inversent pas. */
function dpSolveW(target,s,layer){
  let lo=0.05,hi=2;
  if(dpZdiff(hi,s,layer)>target)return r3(hi);
  if(dpZdiff(lo,s,layer)<target)return r3(lo);
  for(let i=0;i<48;i++){
    const m=(lo+hi)/2;
    if(dpZdiff(m,s,layer)>target)lo=m;else hi=m;
  }
  return r3((lo+hi)/2);
}
/* Et l'écart qui tombe sur l'impédance visée, à largeur fixée : croissant,
   celui-là — écarter les pistes les découple et fait monter Zdiff. */
function dpSolveGap(target,w,layer){
  let lo=0.05,hi=3;
  if(dpZdiff(w,lo,layer)>target)return r3(lo);
  if(dpZdiff(w,hi,layer)<target)return r3(hi);
  for(let i=0;i<48;i++){
    const m=(lo+hi)/2;
    if(dpZdiff(w,m,layer)<target)lo=m;else hi=m;
  }
  return r3((lo+hi)/2);
}

/* ==========================================================================
   Ligne de transmission — ce qu'une piste vaut électriquement
   --------------------------------------------------------------------------
   Une piste n'est pas un fil : c'est une ligne, et l'empilage physique dit
   déjà tout ce qu'il faut pour la calculer — la hauteur de diélectrique qui la
   sépare de son plan de référence, la permittivité du stratifié, l'épaisseur
   du cuivre. `dpStripGeom()` a cherché ces plans pour la paire différentielle,
   on s'en sert tel quel : microruban quand la couche n'a de plan que d'un
   côté, triplaque quand elle en a des deux.

   Les formules sont analytiques et fermées — Hammerstad pour la permittivité
   effective, Wheeler pour l'impédance du microruban, IPC-2141A pour la
   triplaque. Elles tiennent en quelques multiplications : le panneau les
   recalcule à chaque changement de sélection sans qu'on ait à s'en soucier,
   là où un calcul de champ 2D demanderait un aller-retour au serveur.

   Les longueurs sont en millimètres comme partout ailleurs, et la vitesse de
   la lumière avec elles : les retards sortent alors en secondes, les capacités
   en farads et les inductances en henrys, sans facteur de conversion caché en
   chemin. C'est le panneau qui les remet en picosecondes et en picofarads.
   ========================================================================== */
const LT_C0=2.99792458e11;              // vitesse de la lumière, en mm/s

/* Permittivité effective vue par la ligne (Hammerstad). Le microruban a de
   l'air d'un côté : il voit une moyenne entre l'air et le stratifié, et
   d'autant plus de stratifié que la piste est large devant la hauteur du
   diélectrique. La triplaque, noyée, ne voit que le stratifié. */
/* L'ÉPAISSEUR DU CUIVRE, RAMENÉE À UNE LARGEUR (Wheeler).

   Hammerstad-Jensen traite un ruban d'épaisseur nulle. Un ruban épais porte de
   la charge sur ses flancs : il se comporte comme un ruban mince un peu plus
   large. Sans cette correction, la fiche lisait systématiquement HAUT — 51,0 Ω
   là où le solveur de section du panneau « Simulation EM » donne 48,0 —, et
   l'écart passait pour le prix de la formule légère alors que c'était un terme
   manquant. Avec elle, la même formule donne 48,1.

   C'est mot pour mot `_largeur_effective()` de python/ligne_mom.py, et c'est
   voulu : les deux modes doivent partir de la même section pour que leur
   comparaison veuille dire quelque chose. */
function ltWeff(g,w){
  const t=g.t||0, h=Math.max(g.h,1e-4);
  if(!(t>0)||!(w>0))return w;
  return w+(t/Math.PI)*(1+Math.log(2*h/t));
}
function ltEeff(g,w){
  if(g.kind==="strip")return r3(g.er);
  const h=Math.max(g.h,1e-4), x=Math.max(ltWeff(g,w),1e-4);
  return r3((g.er+1)/2+(g.er-1)/2/Math.sqrt(1+12*h/x));
}
/* Impédance caractéristique. Microruban : Hammerstad-Jensen, en deux branches
   selon que la piste est plus étroite ou plus large que la hauteur du
   diélectrique — c'est la même courbe, mais aucune des deux expressions ne la
   suit sur toute sa longueur. Triplaque : l'approximation de l'IPC-2141A.

   IL N'Y A PLUS QU'UNE FORMULE LÉGÈRE DANS CET ÉDITEUR. `dpZ0()`, qui sert les
   paires différentielles, appelait sa propre forme IPC pour le microruban et
   sortait 45,9 Ω là où celle-ci sortait 51,0 : deux panneaux du même outil, la
   même piste, 11 % d'écart, et rien pour dire lequel croire. `dpZ0()` passe
   maintenant par ici pour le microruban. La triplaque, elle, garde l'IPC-2141A
   des deux côtés — c'est la même expression depuis toujours.

   CE QUE CETTE FORMULE EST, ET CE QU'ELLE N'EST PAS. C'est l'aperçu : elle
   répond au clic, sans serveur ni Python. Elle ne voit pas ce que voit le
   panneau « Simulation EM » — une triplaque décentrée, une piste interne
   couverte, une section hors du domaine d'ajustement. Les deux ne se
   remplacent pas ; ils se recoupent, et c'est le recoupement qui informe. */
function ltZ0(g,w){
  if(!(w>0))return 0;
  if(g.kind==="strip"){
    const b=Math.max(g.b,1e-4);
    const x=4*b/(0.67*Math.PI*(0.8*w+g.t));
    return x>1?r3(60/Math.sqrt(g.er)*Math.log(x)):0;
  }
  const h=Math.max(g.h,1e-4), e=Math.sqrt(ltEeff(g,w)), u=ltWeff(g,w)/h;
  return r3(u<=1
    ? 60/e*Math.log(8/u+u/4)
    : 120*Math.PI/(e*(u+1.393+0.667*Math.log(u+1.444))));
}
/* Ce qu'un segment vaut : sa géométrie, son impédance, son retard, et les deux
   éléments répartis qui s'en déduisent — C = t/Z₀, L = t·Z₀. La géométrie de
   couche peut être fournie par l'appelant : elle ne dépend que de la couche,
   inutile de rechercher les plans de référence une fois par segment. */
function ltSeg(t,g){
  const geo=g||dpStripGeom(t.l), eeff=ltEeff(geo,t.w), z0=ltZ0(geo,t.w);
  const len=trkLen(t), tpd=len*Math.sqrt(eeff)/LT_C0;
  return {l:t.l,w:t.w,len:len,g:geo,eeff:eeff,z0:z0,tpd:tpd,
          c:z0>0?tpd/z0:0,ind:tpd*z0};
}
/* Un via n'est pas un fil non plus : c'est un tube inductif, et une pastille
   qui regarde les plans à travers leur dégagement. Les deux formules sont
   celles de Johnson (« High-Speed Digital Design »), écrites en pouces à
   l'origine — 5,08/25,4 donne le 0,2 de l'inductance, et la capacité ne
   dépend que de rapports sauf pour l'épaisseur traversée.

   L'épaisseur retenue est la longueur percée entière : un via traversant
   croise tous les plans, et la capacité qui en sort est un majorant. Le
   dégagement du plan n'est pas dessiné, il se déduit de l'isolation de classe
   du net — c'est bien ce que le rendu et le DRC dégagent autour d'un via. */
function ltVia(v){
  const h=Math.max(stackSpan(v.a,v.b),1e-3), d=Math.max(0.05,v.drill||0.2);
  const er=dpDiBetween(v.a,v.b).er;
  const d1=Math.max(d+0.05,v.d||d+0.2);                 // pastille
  const d2=d1+2*Math.max(0.05,classOf(v.net).clr);      // dégagement dans le plan
  return {h:h,er:er,
          ind:Math.max(0,0.2*h*(Math.log(4*h/d)+1))*1e-9,
          cap:Math.max(0,1.41*er*(h/25.4)*d1/Math.max(1e-3,d2-d1))*1e-12,
          tpd:h*Math.sqrt(er)/LT_C0};
}
/* La ligne entière. La sélection peut changer de largeur, changer de couche,
   franchir des vias : chaque segment se calcule seul, puis on somme ce qui se
   somme — les retards, les capacités, les inductances. L'impédance, elle, ne
   se somme pas. On en donne l'étendue, l'équivalent √(L/C) que voit un front
   parcourant la ligne entière, et le détail par tronçon dès qu'elle cesse
   d'être uniforme : c'est là que les réflexions naissent.

   Les tronçons regroupent les segments de même couche et même largeur — un
   coude à 45° en fait trois, ils n'ont qu'une ligne à eux tous. */
function ltLine(tracks,vias){
  const geos=new Map(), geoOf=l=>{
    if(!geos.has(l))geos.set(l,dpStripGeom(l));
    return geos.get(l);
  };
  const segs=(tracks||[]).map(t=>ltSeg(t,geoOf(t.l))).filter(s=>s.len>1e-9);
  const out={n:segs.length,len:0,tpd:0,c:0,ind:0,groups:[],kinds:[],
             z0min:null,z0max:null,noRef:false,
             vias:{n:0,h:0,ind:0,cap:0,tpd:0}};
  const key=new Map();
  for(const s of segs){
    out.len+=s.len;out.tpd+=s.tpd;out.c+=s.c;out.ind+=s.ind;
    if(!s.g.ref)out.noRef=true;
    if(out.kinds.indexOf(s.g.kind)<0)out.kinds.push(s.g.kind);
    if(s.z0>0){
      out.z0min=out.z0min==null?s.z0:Math.min(out.z0min,s.z0);
      out.z0max=out.z0max==null?s.z0:Math.max(out.z0max,s.z0);
    }
    const k=s.l+"|"+r3(s.w);
    let gr=key.get(k);
    if(!gr){
      gr={l:s.l,w:r3(s.w),n:0,len:0,tpd:0,c:0,ind:0,
          z0:s.z0,eeff:s.eeff,kind:s.g.kind,h:s.g.h,b:s.g.b,ref:s.g.ref,er:s.g.er};
      key.set(k,gr);out.groups.push(gr);
    }
    gr.n++;gr.len+=s.len;gr.tpd+=s.tpd;gr.c+=s.c;gr.ind+=s.ind;
  }
  for(const v of (vias||[])){
    const x=ltVia(v);
    out.vias.n++;out.vias.h+=x.h;out.vias.ind+=x.ind;
    out.vias.cap+=x.cap;out.vias.tpd+=x.tpd;
  }
  out.groups.sort((a,b)=>b.len-a.len||a.l-b.l);
  out.z0eq=out.c>0?r3(Math.sqrt(out.ind/out.c)):0;
  out.uniform=out.groups.length<2;
  /* totaux vias compris : le tube ajoute son retard, sa self et sa capacité */
  out.tpdAll=out.tpd+out.vias.tpd;
  out.cAll=out.c+out.vias.cap;
  out.indAll=out.ind+out.vias.ind;
  out.psmm=out.len>0?r3(out.tpd*1e12/out.len):0;   // retard par millimètre
  return out;
}
