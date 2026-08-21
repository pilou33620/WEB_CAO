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
const ASPECT_WARN=8, ASPECT_MAX=10;
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
  fps:[], tracks:[], vias:[], zones:[], cuts:[],
  /* `corner` : l'angle imposé aux pistes tracées — « 45 » par défaut, c'est la
     règle de l'art ; « 90 » pour un tracé orthogonal strict, « free » pour un
     angle quelconque. */
  rule:{edge:0.4,thermal:0.5,mask:0.05,paste:0.0,viaFinish:"tented",corner:"45"},
  classes:[{name:"Défaut",      w:0.3, clr:0.25, via:0.8, drill:0.4},
           {name:"Alimentation",w:0.6, clr:0.25, via:0.9, drill:0.45}],
  netClass:{},                // net → nom de classe ; absent = classe par défaut
  scale:5, ox:0, oy:0,
  grid:0.1, showGrid:true, flip:false, contrast:1,   // pas d'accrochage au démarrage
  origin:{x:0,y:0}, fabOrigin:false,   // origine utilisateur ; repère des fichiers
  coord:{open:false,mode:"abs"},       // saisie de coordonnées au clavier
  avoid:true,                          // le tracé se tient à distance des obstacles
  mode:"select",
  sel:{fps:new Set(),tracks:new Set(),vias:new Set(),zones:new Set(),cuts:new Set(),edge:false},
  route:null,                 // tracé de piste en cours
  zoneDraft:null,             // zone en cours de saisie
  cutDraft:null,              // découpe de zone en cours
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
   La bibliothèque de boîtiers n'est pas gérée : chaque composant reçoit une
   empreinte paramétrique (rangée, DIP, SOIC, puce) dérivée du nombre de
   broches. Les dimensions restent modifiables dans le panneau Propriétés.
   ========================================================================== */
const STYLES={
  chip:{n:"Puce 2 pastilles (CMS)", thru:false},
  row :{n:"1 rangée (traversant)",  thru:true },
  dip :{n:"2 rangées DIP (traversant)", thru:true },
  sop :{n:"2 rangées SOIC (CMS)",   thru:false}
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
  return {pitch:1.27,span:5.2};
}
function mkFp(ref,value,pkg,pins){
  const style=defaultStyle(pins), g=defaultGeom(style);
  return {id:S.nextId++, ref:ref||("U"+S.nextId), value:value||"", pkg:pkg||"",
          pins:Math.max(1,pins|0), style, pitch:g.pitch, span:g.span,
          x:0, y:0, rot:0, side:0, nets:{}};
}
/* pastilles en coordonnées locales, dans l'ordre des numéros de broche */
function padsOf(fp){
  const out=[], n=fp.pins, p=fp.pitch, sp=fp.span;
  if(fp.style==="chip"){
    const w=Math.max(0.8,sp*0.55), h=Math.max(0.9,sp*0.62);
    for(let i=0;i<n;i++)
      out.push({n:i+1, x:(i-(n-1)/2)*sp, y:0, w, h, shape:"rect", drill:0});
  }else if(fp.style==="row"){
    for(let i=0;i<n;i++)
      out.push({n:i+1, x:(i-(n-1)/2)*p, y:0, w:p*0.68, h:p*0.68,
                shape:i===0?"rect":"circ", drill:Math.min(1.0,p*0.34)});
  }else{
    const h=Math.ceil(n/2), smd=fp.style==="sop";
    const pw=smd?Math.max(0.9,sp*0.30):p*0.68, ph=smd?p*0.55:p*0.68;
    for(let i=0;i<h;i++)                       // colonne gauche : 1 → h
      out.push({n:i+1, x:-sp/2, y:(i-(h-1)/2)*p, w:pw, h:ph,
                shape:(smd||i===0)?"rect":"circ", drill:smd?0:Math.min(1.0,p*0.34)});
    for(let i=h;i<n;i++){                      // colonne droite : h+1 → n, de bas en haut
      const k=n-1-i;
      out.push({n:i+1, x:sp/2, y:(k-(h-1)/2)*p, w:pw, h:ph,
                shape:smd?"rect":"circ", drill:smd?0:Math.min(1.0,p*0.34)});
    }
  }
  for(const q of out){q.net=fp.nets[q.n]||"";}
  return out;
}
/* enveloppe du corps (sérigraphie) en coordonnées locales */
function bodyOf(fp){
  const ps=padsOf(fp);
  let x1=1e9,y1=1e9,x2=-1e9,y2=-1e9;
  for(const q of ps){
    x1=Math.min(x1,q.x-q.w/2);x2=Math.max(x2,q.x+q.w/2);
    y1=Math.min(y1,q.y-q.h/2);y2=Math.max(y2,q.y+q.h/2);
  }
  if(x1>x2)return {x1:-1,y1:-1,x2:1,y2:1};
  if(fp.style==="dip"||fp.style==="sop"){
    const in1=fp.span/2-(fp.style==="dip"?1.3:0.9);
    return {x1:-in1, y1:y1-0.4, x2:in1, y2:y2+0.4};
  }
  return {x1:x1-0.25,y1:y1-0.35,x2:x2+0.25,y2:y2+0.35};
}
/* transformation locale → monde */
function fpXform(fp){
  const a=(fp.rot||0)*Math.PI/180, ca=Math.cos(a), sa=Math.sin(a), m=fp.side?-1:1;
  return (x,y)=>({x:fp.x+(m*x)*ca-y*sa, y:fp.y+(m*x)*sa+y*ca});
}
function padsWorld(fp){
  const T=fpXform(fp), a=(fp.rot||0)*Math.PI/180;
  return padsOf(fp).map(q=>{
    const c=T(q.x,q.y);
    return {n:q.n, x:r3(c.x), y:r3(c.y), w:q.w, h:q.h, shape:q.shape,
            drill:q.drill, net:q.net, rot:a, fp};
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
/* isolation entre deux nets : la plus exigeante des deux classes l'emporte */
function clrPair(a,b){return Math.max(classOf(a).clr,classOf(b).clr);}
function maxClr(){
  let m=0;
  for(const c of S.classes)m=Math.max(m,c.clr);
  return m||FALLBACK_CLASS.clr;
}
/* rattache d'office les nets d'alimentation à la classe du même nom, si elle
   existe : c'est ce que faisait l'ancienne largeur « alimentation » */
function autoClass(){
  const pwr=S.classes.find(c=>/aliment/i.test(c.name));
  if(!pwr)return;
  for(const n of netTable())
    if(isPower(n.name)&&!S.netClass[n.name])S.netClass[n.name]=pwr.name;
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
