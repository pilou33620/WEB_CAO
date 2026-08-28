/* =============================================================================
   commun/simulation-em.js
   Simulation électromagnétique : le panneau, le transport, la carte de chaleur.

   DEUX FAMILLES, ET UNE SEULE ANALYSE POUR L'INSTANT. Le panneau se range en
   **SI** — intégrité du signal, ce qu'un front devient en parcourant le
   cuivre — et **PI** — intégrité de l'alimentation, ce que le réseau de
   distribution laisse passer. SI porte aujourd'hui « Impédance », et rien
   d'autre ; PI ne porte rien encore et le dit. Le découpage est posé
   maintenant, alors qu'il n'y a qu'une analyse, précisément parce qu'il est
   moins cher à poser qu'à retailler autour de six.

   Le registre est `SIM_FAMILLES` / `SIM_ANALYSES`, plus bas : une analyse y
   déclare son nom, ses commandes, son branchement, sa sortie, et si elle peint
   la carte. En ajouter une, c'est ajouter une entrée — l'onglet apparaît seul.

   CE QUE FAIT « IMPÉDANCE » : le serveur résout la section droite de chaque
   tronçon par méthode des moments (`python/ligne_mom.py`), rend son impédance
   caractéristique à la fréquence centrale, et les paramètres S de la liaison
   entière par mise en cascade. La page peint le résultat SUR la piste et
   l'écrit à côté.

   Le solveur est en Python et en numpy : un navigateur ne peut pas l'exécuter,
   et c'est la seule raison pour laquelle ce fichier parle à un serveur — le
   chemin est exactement celui de la visionneuse IPC-2581.

   CE QUE LE MODÈLE COUVRE, ET CE QU'IL NE COUVRE PAS. La méthode est vérifiée
   à 0,4 % près contre Hammerstad-Jensen (microruban) et à 0,3 % contre la
   solution exacte en intégrales elliptiques (triplaque) — ce n'est pas une
   formule ajustée, c'est un calcul de champ sur la section, et il traite des
   cas que les formules ne savent pas traiter, à commencer par la triplaque
   décentrée. Mais il ne voit qu'une suite de sections uniformes : les coudes,
   les moignons, les transitions de via et le rayonnement n'y sont pas. Le
   serveur joint cet avertissement à chaque réponse, et le panneau l'affiche.

   Deux outils l'utilisent, et ils n'ont pas le même document :

     · **l'éditeur PCB** connaît son empilage physique au micron près, et sa
       sélection porte les trois gestes — clic, Maj+clic, Maj+clic à nouveau ;
     · **la visionneuse IPC-2581** lit une carte livrée, dont l'empilage est
       parfois muet ; l'utilisateur l'a alors complété à la main.

   Ce fichier ne connaît ni l'un ni l'autre. Tout ce qui diffère passe par un
   adaptateur remis à `simInit()`, comme `commun/reperage.js` et son `RP_ED` :

     outil            -> "editeur-pcb" | "visionneuse-ipc2581"
     carte()          -> texte           nom du document
     refCandidats()   -> [{net, defaut, quoi}]   les nets qui pourraient être
                                         la masse de référence, le meilleur
                                         d'abord ; `defaut` dit lesquels sont
                                         proposés d'office
     probleme(opts)   -> {doc, objets, portee, notes, couture, voisins}
                         ou {erreur, conseil}
     redessiner()                        redessine le canevas de l'outil
     astuce(txt)                         la ligne de pied de page

   `doc` est le document d'échange, `objets` la liste des objets de l'outil
   ALIGNÉE sur `doc.geometry.objects` : c'est par cet alignement que le
   résultat du serveur retrouve la piste à peindre. `opts` porte ce que
   l'utilisateur a saisi : {f1, f2, points, fc, z0} — hertz et ohms.

   QUI EST LA MASSE ? C'est une question que le cuivre ne répond pas tout seul,
   et elle commande tout le calcul coplanaire. Le panneau la pose ici, une fois,
   et les deux outils lisent la réponse par `simRefSet()` — l'un la déduit du
   rôle de ses couches, l'autre la devine sur le cuivre livré, mais aucun des
   deux ne décide seul : l'utilisateur voit la proposition et peut la corriger.
   Avant, tout cuivre d'un autre net comptait comme masse ; un îlot d'un autre
   signal aussi, donc, et il n'y avait rien pour le dire.
   ============================================================================= */
"use strict";

const SIM_PORT=8000;                   // DEFAULT_PORT de serveur.py
const SIM_ROUTE="/api/simulation";
const SIM_FORMAT="cao-sim-em-1";

let SIM_ED=null;                       // l'adaptateur de l'outil courant
let SIM_BASE=null;                     // racine retenue, "" = même origine
let SIM_ETAT=null;                     // réponse de la sonde : {dispo, limites…}

/* L'état du panneau.

   `objets` est la liste des objets de l'outil, dans l'ordre où ils ont été
   envoyés : `res.segments[i]` décrit `objets[i]`. C'est ce qui permet au
   canevas de peindre, et c'est pour cela que les deux listes ne sont jamais
   remplacées séparément.

   `suivre` s'arme au premier calcul réussi : à partir de là, changer de
   sélection relance tout seul. Avant, non — on ne lance pas de requête réseau
   dans le dos de quelqu'un qui n'a encore rien demandé. */
const SIM={
  ouvert:false, occupe:false, suivre:false,
  res:null, objets:[], doc:null, err:"", portee:"", notes:[],
  /* La masse de référence : l'ensemble des nets qui comptent comme plan de
     retour. `refAuto` dit qu'on suit encore la proposition de l'outil — dès
     qu'on décoche une case, non, et le choix tient. `refCle` est la liste des
     candidats pour laquelle la proposition a été faite : elle change quand on
     ouvre une autre carte, et c'est ce qui remet la proposition en vigueur. */
  ref:null, refAuto:true, refCle:null,
  /* Ce que l'outil a mesuré de la COUTURE de vias et du cuivre voisin qui
     n'est pas de la masse. Ni l'un ni l'autre n'entre dans le calcul ; les deux
     disent si le calcul veut dire quelque chose. */
  couture:null, voisins:[],
  /* Où l'on se trouve dans le panneau : la famille, et l'analyse dedans. On
     démarre sur ce qui existe — SI, impédance —, parce qu'ouvrir un panneau
     sur une famille vide n'apprendrait rien à qui vient de cliquer. */
  famille:"si", analyse:"impedance",
  saisie:{f1:1e8, f2:5e9, points:21, fc:1e9, z0:50, cible:50, tolPct:10}
};

function simEsc(s){
  return String(s==null?"":s).replace(/&/g,"&amp;").replace(/</g,"&lt;")
    .replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}
function simEl(id){return document.getElementById(id);}
/* Virgule décimale, comme partout ailleurs dans les deux outils. */
function simNb(v,dec){
  if(!isFinite(v))return "—";
  return Number(v).toFixed(dec==null?2:dec).replace(".",",");
}
/* Une fréquence se lit en GHz au-dessus du gigahertz, en MHz en dessous : une
   bande 100 MHz – 5 GHz écrite tout en hertz est illisible. */
function simFreq(hz){
  if(hz>=1e9)return simNb(hz/1e9,3)+" GHz";
  if(hz>=1e6)return simNb(hz/1e6,1)+" MHz";
  return simNb(hz/1e3,1)+" kHz";
}
/* Un retard se compte en picosecondes sur une carte, en nanosecondes sur une
   longue liaison. */
function simRetard(s){
  const ps=s*1e12;
  return ps>=1000?simNb(ps/1000,3)+" ns":simNb(ps,1)+" ps";
}
function simDb(c){
  const m=Math.hypot(c[0],c[1]);
  return m>1e-15?20*Math.log10(m):SIM_PLANCHER;
}
const SIM_PLANCHER=-300;

/* ==========================================================================
   La carte de chaleur : trois couleurs, et ce qu'elles veulent dire
   --------------------------------------------------------------------------
     · BLEU   — dans la tolérance. C'est la cible, et la seule couleur qui ne
                dit rien à corriger ;
     · ROUGE  — au-dessus. La piste est trop étroite, ou trop loin de son plan ;
     · VERT   — en dessous. La piste est trop large, ou trop près de son plan.

   Le vert ne veut donc PAS dire « bon » ici : il veut dire « trop bas ». C'est
   contraire à l'habitude, et c'est assumé — sur une carte de chaleur ce sont
   les deux sens de l'écart qu'il faut distinguer d'un coup d'œil, pas le bien
   du mal. La légende du panneau le redit en toutes lettres, parce qu'un
   lecteur qui n'a pas lu ce commentaire lira « vert = correct ».

   La CLARTÉ porte l'écart : pâle en bord de bande, pleine une tolérance plus
   loin. La TEINTE, elle, ne bouge pas — une piste hors bande est rouge, plus
   ou moins soutenu, jamais autre chose. Interpoler depuis le bleu, comme on
   l'a d'abord fait, donnait du mauve d'un côté et du turquoise de l'autre :
   deux teintes qui ne se lisent ni comme du rouge, ni comme du vert.
   ========================================================================== */
const SIM_Z_BLEU =[ 63,160,234];
const SIM_Z_ROUGE=[232, 68, 58];
const SIM_Z_VERT =[ 76,195,138];
const SIM_Z_ROUGE_PALE=[244,166,161];
const SIM_Z_VERT_PALE =[168,225,199];

/* La tolérance en ohms. Un plancher d'un dixième d'ohm : une tolérance nulle
   peindrait toute la carte, y compris le tronçon qui tombe pile. */
function simZTolAbs(){
  return Math.max(0.1, SIM.saisie.cible*SIM.saisie.tolPct/100);
}
/* -1 trop bas, 0 dans la bande, +1 trop haut. */
function simZVerdict(z0){
  const t=simZTolAbs(), d=z0-SIM.saisie.cible;
  return d>t?1:(d<-t?-1:0);
}
function simZCouleur(z0,alpha){
  const a=(alpha==null)?1:alpha;
  if(!(z0>0))return "rgba(139,145,156,"+a+")";      // pas de valeur : gris
  const t=simZTolAbs(), d=z0-SIM.saisie.cible, v=simZVerdict(z0);
  if(v===0)return "rgba("+SIM_Z_BLEU.join(",")+","+a+")";
  const pale=v>0?SIM_Z_ROUGE_PALE:SIM_Z_VERT_PALE;
  const plein=v>0?SIM_Z_ROUGE:SIM_Z_VERT;
  const k=Math.min(1,(Math.abs(d)-t)/t);
  const c=pale.map((p,i)=>Math.round(p+(plein[i]-p)*k));
  return "rgba("+c.join(",")+","+a+")";
}
/* Le canevas des deux outils demande d'abord s'il y a quelque chose à peindre.
   Il faut un résultat ET les objets qui vont avec : peindre un résultat sur
   une sélection qui a changé montrerait la couleur d'une piste sur une autre.

   Il faut aussi que l'ANALYSE AFFICHÉE soit celle qui peint. La carte de
   chaleur d'impédance n'a rien à faire sur la carte pendant qu'on regarde
   l'onglet PI : elle répondrait à une question qui n'est plus posée. Le
   résultat n'est pas effacé pour autant — revenir sur l'onglet le retrouve. */
function simZActif(){
  const a=simAnalyse();
  return SIM.ouvert&&!!(a&&a.peint)&&!!SIM.res&&SIM.objets.length>0
         &&SIM.res.segments.length===SIM.objets.length;
}
/* Le tronçon i : son objet, son impédance, sa couleur. Un seul endroit fait
   l'appariement — le canevas et le tableau ne peuvent pas diverger. */
function simZSegment(i){
  if(!simZActif())return null;
  const s=SIM.res.segments[i];
  return s?{obj:SIM.objets[i], z0:s.z0, seg:s}:null;
}

/* ==========================================================================
   Trouver le serveur
   Même ordre que la visionneuse (01-api.js) : l'origine qui sert la page, puis
   le même hôte sur le port de serveur.py, puis 127.0.0.1 pour une page ouverte
   en file://. La sonde ne se fait qu'une fois par session.
   ========================================================================== */
function simCandidats(){
  const out=[], ajoute=function(v){if(v!==null&&out.indexOf(v)<0)out.push(v);};
  if(location.protocol==="http:"||location.protocol==="https:"){
    ajoute("");
    ajoute(location.protocol+"//"+location.hostname+":"+SIM_PORT);
  }
  ajoute("http://127.0.0.1:"+SIM_PORT);
  return out;
}
/* Le serveur répond {"detail": "…"}, et le détail porte parfois deux lignes —
   le refus, puis ce qu'il faut changer. */
async function simErreur(rep){
  let detail="";
  try{
    const j=await rep.json();
    detail=(j&&(j.detail||j.message))||"";
    if(typeof detail!=="string")detail=JSON.stringify(detail);
  }catch(e){}
  return detail||("HTTP "+rep.status);
}
async function simConnecter(){
  if(SIM_ETAT)return SIM_ETAT;
  const essais=[];
  for(const base of simCandidats()){
    try{
      const rep=await fetch(base+SIM_ROUTE,{headers:{Accept:"application/json"}});
      if(!rep.ok){essais.push((base||"cette page")+" : "+await simErreur(rep));continue;}
      const j=await rep.json();
      if(!j||!j.dispo){
        essais.push((base||"cette page")+" : "+
          ((j&&j.detail)||"solveur absent")+((j&&j.conseil)?"\n  "+j.conseil:""));
        continue;
      }
      SIM_BASE=base; SIM_ETAT=j;
      return SIM_ETAT;
    }catch(e){
      essais.push((base||"cette page")+" : "+(e.message||"injoignable"));
    }
  }
  throw new Error("Aucun serveur pour calculer.\n\n"+
    "Le solveur est en Python : lancez « python serveur.py » depuis le dossier "+
    "du dépôt, puis ouvrez cette page par l'adresse qu'il affiche. Il lui faut "+
    "numpy — « pip install numpy ».\n\n"+
    "Tentatives :\n  "+essais.join("\n  "));
}
/* Envoie le document et rend le résultat. Le corps est le JSON tel quel : la
   route ne lit pas de fichier et n'écrit rien sur le disque. */
async function simLancer(doc){
  await simConnecter();
  const rep=await fetch(SIM_BASE+SIM_ROUTE,{
    method:"POST", headers:{"Content-Type":"application/json"},
    body:JSON.stringify(doc)
  });
  if(!rep.ok)throw new Error(await simErreur(rep));
  const res=await rep.json();
  if(!res||!Array.isArray(res.segments))
    throw new Error("Réponse inattendue du serveur.");
  return res;
}

/* ==========================================================================
   Enregistrer
   ========================================================================== */
function simTelecharger(texte,nom,type){
  const b=new Blob([texte],{type:type||"application/json"});
  const u=URL.createObjectURL(b), a=document.createElement("a");
  a.href=u; a.download=nom; document.body.appendChild(a); a.click();
  document.body.removeChild(a);
  setTimeout(()=>URL.revokeObjectURL(u),1000);
}
/* Un nom de fichier qui tient sur tous les systèmes : le net s'y retrouve, mais
   « D+ » et « VCC/3V3 » n'ont rien à faire dans un nom de fichier. */
function simNomFichier(ext){
  const net=(SIM.res&&SIM.res.net)||(SIM.doc&&SIM.doc.net)||"";
  const carte=(SIM.res&&SIM.res.carte)||
              (SIM_ED&&SIM_ED.carte?SIM_ED.carte():"")||"carte";
  const propre=s=>String(s).replace(/[^\w.-]+/g,"_").replace(/^_+|_+$/g,"");
  return (propre(carte)||"carte")+(net?"-"+propre(net):"")+ext;
}

/* ==========================================================================
   La courbe des paramètres S
   Un SVG écrit à la main plutôt qu'un canevas : il se redimensionne avec le
   panneau sans qu'on ait à écouter quoi que ce soit. Trois traces, et le
   repère de la fréquence centrale, qui est l'endroit où l'impédance a été lue.

   DEUX TRACES, ET DEUX SEULEMENT. S₁₂ n'est pas tracé parce que le modèle est
   réciproque : S₁₂ vaut S₂₁ exactement, et une courbe qui en recouvre une
   autre n'apprend rien. S₂₂ l'a été un temps, au motif qu'une cascade de
   sections différentes ne se voit pas pareil des deux bouts — c'était vrai en
   théorie et nuisible en pratique : sur une piste de largeur constante, le cas
   ordinaire, S₂₂ égale S₁₁ au bit près et vient donc se peindre PAR-DESSUS,
   masquant la trace qu'on était venu lire. Une courbe qui cache l'information
   dans le cas courant pour la donner dans le cas rare est un mauvais échange.

   Quand la liaison est dissymétrique, l'écart S₂₂ − S₁₁ est signalé sous la
   courbe (`simDissymetrie`) : le fait est dit, sans coûter une trace. */
const SIM_TRACES=[
  {i:0, j:0, nom:"S11", couleur:"var(--yellow)"},
  {i:1, j:0, nom:"S21", couleur:"var(--blue)"}
];
function simTerme(res,k,i,j){
  const m=res.s[k], p=i*2+j;
  return (m&&m[p])?m[p]:[0,0];
}
/* Le repère du dernier tracé, gardé pour la lecture au survol : sans lui il
   faudrait redériver l'échelle à chaque mouvement de souris. */
let SIM_REPERE=null;

/* LA LARGEUR DU TRACÉ SUIT CELLE DU PANNEAU, et c'est un vrai défaut corrigé,
   pas un raffinement. Le SVG avait un viewBox fixe de 520 unités et un
   `preserveAspectRatio` : dans un panneau étroit il tenait bien, mais agrandi
   en plein écran il s'étirait tout entier — texte compris. Les cotes de 10 px
   devenaient des 30 px, « 100,0 MHz » barrait le bas de la fenêtre, et plus le
   panneau était grand moins la courbe était lisible. On dessine donc à la
   largeur réelle : les cotes gardent leur taille, la courbe gagne en détail.
   La hauteur, elle, ne bouge pas — une courbe de paramètres S n'a rien à
   gagner à être haute, et la fiche au-dessus a besoin de la place. */
function simLargeurTrace(){
  const box=simEl("simSortie");
  const w=box?box.clientWidth:0;
  return Math.round(Math.max(420,Math.min(1400,(w||540)-22)));
}

function simCourbe(res){
  if(!res||!res.freqs||res.freqs.length<2){SIM_REPERE=null;return "";}
  const W=simLargeurTrace(), H=170, mg={g:44,d:10,h:12,b:26};
  let hi=-1e9, lo=1e9;
  for(const t of SIM_TRACES)for(let k=0;k<res.freqs.length;k++){
    const v=simDb(simTerme(res,k,t.i,t.j));
    if(v>hi)hi=v; if(v<lo)lo=v;
  }
  if(!isFinite(hi)||!isFinite(lo)){hi=0;lo=-60;}
  if(hi-lo<6){hi+=3;lo-=3;}
  if(hi-lo>120)lo=hi-120;
  const f0=res.freqs[0], f1=res.freqs[res.freqs.length-1];
  const X=f=>mg.g+(W-mg.g-mg.d)*((f1>f0)?(f-f0)/(f1-f0):0.5);
  const Y=v=>mg.h+(H-mg.h-mg.b)*(1-(Math.max(lo,Math.min(hi,v))-lo)/(hi-lo));

  /* La quadrature de la bande est-elle assez fine pour la ligne qu'on regarde ?
     Une liaison résonne tous les 1/(2·retard) : sous une dizaine de points par
     période, la courbe rate ses creux et les relie à la règle — c'est
     exactement ce qui donne l'aspect anguleux, et le creux affiché est alors
     plus haut que le vrai. On le dit sous la courbe, avec le nombre à saisir. */
  SIM_REPERE={res:res, W:W, H:H, mg:mg, f0:f0, f1:f1, lo:lo, hi:hi};

  let svg='<svg class="simCourbe" viewBox="0 0 '+W+' '+H+'" '+
          'preserveAspectRatio="xMidYMid meet" role="img" '+
          'aria-label="Paramètres S en fonction de la fréquence">';
  for(let i=0;i<=3;i++){
    const v=lo+(hi-lo)*i/3, y=Y(v);
    svg+='<line class="simGrille" x1="'+mg.g+'" y1="'+y.toFixed(1)+
         '" x2="'+(W-mg.d)+'" y2="'+y.toFixed(1)+'"/>'+
         '<text class="simCote" x="'+(mg.g-6)+'" y="'+(y+3.5).toFixed(1)+
         '" text-anchor="end">'+simNb(v,0)+"</text>";
  }
  /* Le repère de la fréquence centrale : c'est là qu'a été lue l'impédance
     peinte sur la carte, et sans ce trait la courbe et la carte auraient l'air
     de parler de deux choses. */
  if(res.f_centre>=f0&&res.f_centre<=f1){
    const x=X(res.f_centre);
    svg+='<line class="simFc" x1="'+x.toFixed(1)+'" y1="'+mg.h+
         '" x2="'+x.toFixed(1)+'" y2="'+(H-mg.b)+'"/>'+
         '<text class="simCote simFcTxt" x="'+(x+4).toFixed(1)+'" y="'+
         (mg.h+9)+'">f₀</text>';
  }
  svg+='<text class="simCote" x="'+mg.g+'" y="'+(H-8)+'">'+simFreq(f0)+"</text>"+
       '<text class="simCote" x="'+(W-mg.d)+'" y="'+(H-8)+
       '" text-anchor="end">'+simFreq(f1)+"</text>"+
       '<text class="simCote simUnite" x="4" y="'+(mg.h+4)+'">dB</text>';
  for(const t of SIM_TRACES){
    let d="";
    for(let k=0;k<res.freqs.length;k++)
      d+=(k?"L":"M")+X(res.freqs[k]).toFixed(1)+" "+
         Y(simDb(simTerme(res,k,t.i,t.j))).toFixed(1);
    svg+='<path class="simTrace" d="'+d+'" stroke="'+t.couleur+'"/>';
  }
  /* Le curseur de lecture : un trait, un point par trace. Il est posé caché et
     ne bouge qu'au survol — le construire à la volée coûterait une
     manipulation du DOM par pixel parcouru. */
  svg+='<g id="simCurseur" style="display:none">'+
       '<line class="simCurTrait" y1="'+mg.h+'" y2="'+(H-mg.b)+'"/>';
  for(const t of SIM_TRACES)
    svg+='<circle class="simCurPt" r="3.2" fill="'+t.couleur+'"/>';
  svg+="</g>"+
       '<rect id="simCurZone" x="'+mg.g+'" y="'+mg.h+'" width="'+
       (W-mg.g-mg.d)+'" height="'+(H-mg.h-mg.b)+'" fill="transparent"/>';
  svg+="</svg>";

  let leg='<div class="simLeg">';
  for(const t of SIM_TRACES)
    leg+='<span><i style="background:'+t.couleur+'"></i>'+t.nom+"</span>";
  leg+='<span class="simLecture" id="simLecture">'+
       "survolez la courbe pour lire une fréquence</span>";
  leg+="</div>";
  return svg+leg+simEchantillonnage(res);
}

/* Ce que la bande vaut comme échantillonnage.

   UNE LIAISON RÉSONNE TOUS LES 1/(2τ), τ étant son retard : c'est là que S₁₁
   plonge, la ligne devenant transparente à la demi-onde. Ce creux est ÉTROIT.
   Si le pas de la bande ne le vise pas, aucun point calculé ne tombe dedans,
   la courbe passe à côté sans rien signaler, et l'on repart avec une
   adaptation qu'on croit meilleure qu'elle n'est.

   LE SEUIL EST À VINGT POINTS PAR PÉRIODE, et il est mesuré, pas choisi. Sur
   une piste de 28,7 mm à 61 Ω, dont le creux vrai est à −39,5 dB :
       21 points -> 12,0 par période -> creux RATÉ, minimum affiché −33,3 dB
                                        et trouvé au bord de bande ;
       51 points -> 29,9 par période -> −39,5 dB à 2,942 GHz, juste.
   Douze points par période paraissent confortables et ne le sont pas : c'est
   pourquoi ce test existe plutôt qu'une confiance dans le nombre par défaut.

   On vise trente, et non vingt tout juste : le nombre proposé doit tenir même
   si l'utilisateur élargit un peu sa bande ensuite. */
function simEchantillonnage(res){
  const L=res.ligne, n=res.freqs.length;
  if(!L||!(L.retard>0)||n<2)return "";
  const periode=1/(2*L.retard);
  const largeur=res.freqs[n-1]-res.freqs[0];
  const parPeriode=periode/(largeur/(n-1));
  if(parPeriode>=20)return "";
  const vise=Math.min(MAX_POINTS_S,
                      Math.ceil(largeur/(periode/30))+1);
  return '<p class="simNote simNoteBas">· Bande trop peu échantillonnée : '+
    simNb(parPeriode,1)+" point(s) par période de résonance ("+
    simFreq(periode)+", soit "+simFreq(periode/2)+" pour le premier pic). "+
    "Les creux de S₁₁ tombent entre deux points calculés : la courbe les "+
    "relie à la règle et les montre <b>moins profonds qu'ils ne sont</b> — "+
    "l'aspect anguleux vient de là. Passez à <b>"+vise+" points</b>.</p>";
}
const MAX_POINTS_S=401;                 // le plafond du serveur (MAX_POINTS)

/* La liaison se voit-elle pareil des deux bouts ? Elle le fait dès que tous
   les tronçons ont la même section — le cas courant —, et alors S₂₂ = S₁₁ et
   il n'y a rien à dire. Sinon on le dit, plutôt que de tracer une seconde
   courbe qui, le reste du temps, viendrait masquer la première. */
function simDissymetrie(res){
  if(!res.s||!res.s.length)return "";
  let pire=0, kPire=0;
  for(let k=0;k<res.s.length;k++){
    const d=Math.abs(simDb(simTerme(res,k,0,0))-simDb(simTerme(res,k,1,1)));
    if(d>pire){pire=d;kPire=k;}
  }
  if(!(pire>0.5))return "";
  return '<p class="simNote">· Liaison dissymétrique : vue du port 2, la '+
    "réflexion diffère de "+simNb(pire,1)+" dB de celle du port 1 (au plus "+
    "fort, à "+simFreq(res.freqs[kPire])+"). Seul S₁₁ est tracé ; S₂₂ est dans "+
    "le fichier <code>.s2p</code>.</p>";
}

/* ==========================================================================
   La lecture au survol
   --------------------------------------------------------------------------
   Une courbe de paramètres S sans lecture chiffrée oblige à compter les
   carreaux. On donne donc, au point survolé : la fréquence, les deux modules
   en décibels, le rapport d'ondes stationnaires, et surtout L'IMPÉDANCE VUE
   PAR LE PORT — celle qu'un circuit d'attaque trouverait devant lui à cette
   fréquence-là.

       Z_in = Z_réf (1 + S₁₁) / (1 - S₁₁)

   Elle est COMPLEXE, et c'est tout l'intérêt : au quart d'onde une piste de
   61 Ω vue à travers 50 Ω ne présente pas 61 Ω mais 41 Ω, et la partie
   imaginaire dit de quel côté on se trouve. La donner en module seul ferait
   perdre exactement ce qu'on est venu chercher.

   On se cale sur le point CALCULÉ le plus proche, jamais sur une interpolation :
   la courbe est un segment de droite entre deux points, mais la réalité entre
   ces deux points n'a pas été calculée, et afficher une valeur intermédiaire
   inventerait un chiffre.
   ========================================================================== */
function simLire(k){
  const R=SIM_REPERE;
  if(!R)return null;
  const res=R.res, f=res.freqs[k];
  const s11=simTerme(res,k,0,0), s21=simTerme(res,k,1,0);
  const m=Math.hypot(s11[0],s11[1]);
  const ros=m<1?(1+m)/(1-m):Infinity;
  /* Z = Zréf (1+S11)/(1-S11), en complexe. */
  const zr=res.impedance_reference||50;
  const ar=1+s11[0], ai=s11[1], br=1-s11[0], bi=-s11[1];
  const d=br*br+bi*bi;
  const zre=d>1e-15?zr*(ar*br+ai*bi)/d:Infinity;
  const zim=d>1e-15?zr*(ai*br-ar*bi)/d:0;
  return {f:f, s11:simDb(s11), s21:simDb(s21), ros:ros, zre:zre, zim:zim};
}
function simLectureTexte(k){
  const v=simLire(k);
  if(!v)return "";
  const signe=v.zim>=0?"+ j":"− j";
  return simFreq(v.f)+"  ·  S₁₁ "+simNb(v.s11,1)+" dB  ·  S₂₁ "+
    simNb(v.s21,2)+" dB  ·  ROS "+(isFinite(v.ros)?simNb(v.ros,2):"∞")+
    "  ·  Z "+simNb(v.zre,1)+" "+signe+simNb(Math.abs(v.zim),1)+" Ω";
}
/* Branché après chaque pose de la fiche : le SVG vient d'être réécrit, les
   anciens gestionnaires sont partis avec. */
function simBrancherCourbe(){
  const R=SIM_REPERE;
  const zone=simEl("simCurZone"), grp=simEl("simCurseur"),
        txt=simEl("simLecture");
  if(!R||!zone||!grp||!txt)return;
  const svg=zone.ownerSVGElement||zone.closest("svg");
  const pts=grp.querySelectorAll(".simCurPt");
  const trait=grp.querySelector(".simCurTrait");
  const repos=txt.textContent;

  const bouger=function(ev){
    const r=svg.getBoundingClientRect();
    if(!r.width)return;
    /* De la fenêtre au repère du SVG : il est étiré par `preserveAspectRatio`,
       le rapport des largeurs suffit à revenir en arrière. */
    const x=(ev.clientX-r.left)*R.W/r.width;
    const u=(x-R.mg.g)/(R.W-R.mg.g-R.mg.d);
    const n=R.res.freqs.length;
    const k=Math.max(0,Math.min(n-1,Math.round(u*(n-1))));
    const X=R.mg.g+(R.W-R.mg.g-R.mg.d)*
            ((R.f1>R.f0)?(R.res.freqs[k]-R.f0)/(R.f1-R.f0):0.5);
    const Y=v=>R.mg.h+(R.H-R.mg.h-R.mg.b)*
              (1-(Math.max(R.lo,Math.min(R.hi,v))-R.lo)/(R.hi-R.lo));
    trait.setAttribute("x1",X.toFixed(1));
    trait.setAttribute("x2",X.toFixed(1));
    SIM_TRACES.forEach((t,i)=>{
      if(!pts[i])return;
      pts[i].setAttribute("cx",X.toFixed(1));
      pts[i].setAttribute("cy",Y(simDb(simTerme(R.res,k,t.i,t.j))).toFixed(1));
    });
    grp.style.display="";
    txt.textContent=simLectureTexte(k);
    txt.classList.add("on");
  };
  zone.onmousemove=bouger;
  zone.onmouseleave=function(){
    grp.style.display="none";
    txt.textContent=repos;
    txt.classList.remove("on");
  };
}

/* ==========================================================================
   La fiche
   ========================================================================== */
function simZLegende(){
  const c=SIM.saisie.cible, t=simZTolAbs();
  return '<div class="simLegZ">'+
    '<span><i style="background:'+simZCouleur(c-2*t)+'"></i>trop faible '+
      "(&lt; "+simNb(c-t,1)+" Ω)</span>"+
    '<span><i style="background:'+simZCouleur(c)+'"></i>dans la tolérance</span>'+
    '<span><i style="background:'+simZCouleur(c+2*t)+'"></i>trop élevé '+
      "(&gt; "+simNb(c+t,1)+" Ω)</span>"+
    "</div>";
}

function simFiche(){
  const res=SIM.res;
  if(!res)return "";
  const L=res.ligne;
  let h="";

  /* Le verdict d'ensemble d'abord : c'est la réponse à la question posée. Le
     détail est en dessous, pour qui veut savoir QUEL tronçon sort.

     ON COMPTE COMME LE TABLEAU COMPTE, c'est-à-dire en sections regroupées et
     non en tronçons envoyés. Un arc part en une vingtaine de cordes : compter
     les tronçons annonçait « 17 hors tolérance » sous un tableau qui affichait
     une seule ligne, et les deux chiffres ne parlaient pas de la même chose.
     La LONGUEUR hors tolérance est jointe, parce que c'est elle qui dit si ça
     compte — trois millimètres et trente millimètres ne se corrigent pas de la
     même façon. */
  const gr=simGrouper(res.segments);
  const sortis=gr.filter(g=>g.seg.z0>0&&simZVerdict(g.seg.z0)!==0);
  const dehors=sortis.length;
  const mmDehors=sortis.reduce((a,g)=>a+g.longueur,0);
  h+='<p class="simVerdict '+(dehors?"dehors":"dedans")+'">'+
     (dehors
       ? dehors+" section"+(dehors>1?"s":"")+" hors tolérance, "+
         simNb(mmDehors,2)+" mm"
       : "Toute la sélection est dans la tolérance")+
     " <span>"+simNb(L.z0_min,1)+" – "+simNb(L.z0_max,1)+
     " Ω, moyenne pondérée "+simNb(L.z0_moyen,1)+" Ω à "+
     simFreq(res.f_centre)+"</span></p>";

  /* L'impédance de RÉFÉRENCE des ports est ici, et pas seulement dans le champ
     de saisie : c'est sur elle que la courbe S est normalisée, et une courbe
     de réflexion ne se lit pas sans savoir contre quoi elle réfléchit. */
  h+='<div class="simMeta"><span>'+simEsc(SIM.portee||res.net||"—")+"</span>"+
     "<span>"+L.troncons+" tronçon"+(L.troncons>1?"s":"")+"</span>"+
     "<span>"+simNb(L.longueur,2)+" mm</span>"+
     "<span>"+simRetard(L.retard)+"</span>"+
     "<span>"+simNb(L.pertes_db,2)+" dB</span>"+
     "<span>réf. "+simNb(res.impedance_reference||SIM.saisie.z0,0)+" Ω</span>"+
     "<span>"+simNb(res.duree,2)+" s</span></div>";

  h+=simZLegende();

  /* LA SECTION RÉSOLUE, avant tout le reste. Ce n'est pas une réserve, c'est le
     problème lui-même : la hauteur au plan, la permittivité, la couche de
     référence. Quand un chiffre ne tombe pas sur la carte réelle, c'est là que
     la cause se lit — et il faut pouvoir la lire sans dérouler la fiche. */
  h+=simSection(res);

  /* Ce que l'outil sait du modèle et que le serveur ne peut pas deviner, puis
     ce que le serveur sait des limites du calcul. */
  for(const n of SIM.notes)h+='<p class="simNote">· '+simEsc(n)+"</p>";
  for(const a of (res.avertissements||[]))
    h+='<p class="simNote">· '+simEsc(a)+"</p>";
  if(L.ecartes)
    h+='<p class="simNote">· '+L.ecartes+" tronçon(s) écarté(s) : pas de "+
       "plan de référence en face, ou couche absente de l'empilage.</p>";

  /* Ce que la dispersion a fait au chiffre peint sur la carte. Le calcul de
     section est quasi-statique et Getsinger le monte en fréquence — c'est dit
     plus haut, mais dire « c'est un modèle » sans montrer de combien il a
     bougé le résultat ne permet à personne de juger. On ne l'écrit que si
     l'écart se voit : sous le pour cent, il n'y a rien à signaler. */
  const disp=simDispersion(res.segments);
  if(disp)
    h+='<p class="simNote">· '+disp+"</p>";

  /* OÙ SONT LES PORTS. Personne ne les a placés : ils se déduisent, et c'est
     précisément pour cela qu'il faut les écrire. Sans cette ligne, S₁₁ est un
     chiffre dont on ne sait pas de quel bout il est vu. */
  h+=simCoplanaire(res);
  /* Les deux contrôles qui ne changent pas le chiffre mais disent s'il veut
     dire quelque chose : la couture qui fait du cuivre latéral une vraie masse,
     et le cuivre voisin qui n'en est pas une. Ils viennent juste après la note
     coplanaire — c'est la même question, prise par ses deux bouts. */
  h+=simCouture(res);
  h+=simVoisins();
  h+=simPorts(res);
  h+=simDissymetrie(res);

  /* Le tableau : une ligne par tronçon, dans l'ordre du tracé. Les tronçons
     identiques qui se suivent sont regroupés — une piste de cinquante segments
     de même largeur sur la même couche donnerait cinquante lignes identiques,
     et on ne lirait plus rien. */
  h+='<table class="simTab simTabZ"><tr><th>Tronçon</th><th>l (mm)</th>'+
     "<th>Larg.</th><th>Topo.</th><th>Z₀ Ω</th><th>Écart</th></tr>";
  for(const g of gr.slice(0,60)){
    const s=g.seg, v=s.z0>0?simZVerdict(s.z0):null;
    const d=s.z0>0?s.z0-SIM.saisie.cible:0;
    /* L'écart porte la MÊME couleur que la carte : rouge au-dessus, vert en
       dessous. Il était jaune dans les deux sens, ce qui contredisait la
       légende qui venait d'être lue trois lignes plus haut. */
    const cls=v===null?"":(v===0?"z0ok":(v>0?"z0haut":"z0bas"));
    h+='<tr><td><i class="simPuce" style="background:'+simZCouleur(s.z0)+
       '"></i>'+(g.n>1?g.n+" × ":"")+simEsc(g.couche)+"</td>"+
       "<td>"+simNb(g.longueur,2)+"</td>"+
       "<td>"+simNb(s.largeur,3)+"</td>"+
       "<td>"+simEsc(simTopo(s))+"</td>"+
       "<td>"+(s.z0>0?simNb(s.z0,1):"—")+"</td>"+
       '<td class="'+cls+'">'+
       (s.z0>0?(d>=0?"+":"−")+simNb(Math.abs(d),1):"—")+"</td></tr>";
  }
  if(gr.length>60)
    h+='<tr><td colspan="6">… et '+(gr.length-60)+" autres</td></tr>";
  h+="</table>";

  h+=simCourbe(res);
  return h;
}

/* ==========================================================================
   LA SECTION RÉSOLUE, ÉCRITE EN CLAIR
   --------------------------------------------------------------------------
   POURQUOI ELLE EST LÀ. Une ligne à 54 Ω sur une carte qui doit en faire 50,
   c'est trois ohms à expliquer — et la fiche n'aidait pas : elle montrait
   l'impédance sans montrer SUR QUOI elle avait été obtenue. Ni la hauteur au
   plan, ni la permittivité, ni quelle couche servait de référence, ni si ces
   valeurs venaient du fichier, d'une saisie ou d'un repli. Retrouver la cause
   demandait d'inverser le résultat, ce qui est absurde quand le serveur les a
   toutes sous la main.

   ET C'EST PRESQUE TOUJOURS LÀ QUE SE TROUVE LA RÉPONSE. Le solveur est vérifié
   à 0,25 % contre la transformation conforme sur la section coplanaire, à 0,42 %
   contre Hammerstad-Jensen sur le microruban : quand il ne tombe pas sur la
   carte réelle, ce sont ses ENTRÉES qui diffèrent. Un fichier IPC-2581 porte
   l'empilage NOMINAL — un prepreg annoncé à 0,36 mm sort couramment à 0,32, et
   quarante microns de moins valent deux ohms et demi.

   UNE LIGNE PAR SECTION DISTINCTE, et non par tronçon : une piste découpée en
   trois plages d'écart a la même section droite verticale — même couche, même
   hauteur au plan, même stratifié —, seuls ses bords changent. Trois fois la
   même ligne n'apprendrait rien.
   ========================================================================== */

/* Ce qui fait qu'une section est LA MÊME : la couche, la géométrie verticale,
   le stratifié, le cuivre et la largeur. L'écart au plan coplanaire n'y est
   pas — il varie d'une plage à l'autre, et c'est le tableau qui le porte. */
function simSectionCle(s){
  return [s.nom_couche||s.couche, s.topo, s.h, s.er, s.cuivre,
          s.couverture, s.entre_plans, s.largeur].join("|");
}

function simSection(res){
  const vues=new Map();
  for(const s of res.segments){
    if(!(s.z0>0)||s.h==null||!simTopoNom(s))continue;   // rien résolu à décrire
    const cle=simSectionCle(s);
    const v=vues.get(cle);
    if(!v)vues.set(cle,{seg:s, longueur:s.longueur});
    else v.longueur+=s.longueur;
  }
  if(!vues.size)return "";

  let h="";
  for(const v of [...vues.values()].sort((a,b)=>b.longueur-a.longueur).slice(0,4)){
    const s=v.seg;
    const bouts=[];
    if(s.topo==="strip"){
      /* Triplaque : ce qui compte est l'écart ENTRE plans et où le ruban se
         trouve dedans — un empilage 4 couches n'est jamais symétrique, et
         c'est justement ce que la formule IPC ne sait pas prendre. */
      bouts.push("plans "+simEsc(s.plan_haut||"?")+" et "+
                 simEsc(s.plan_bas||"?"));
      bouts.push("écart entre plans "+simNb(s.entre_plans,3)+" mm");
      bouts.push("ruban à "+simNb(s.h,3)+" mm du plus proche");
    }else{
      bouts.push("plan "+simEsc(s.plan_haut||s.plan_bas||"?"));
      bouts.push("h "+simNb(s.h,3)+" mm");
      if(s.couverture>0)
        bouts.push("couvert de "+simNb(s.couverture,3)+" mm de stratifié");
    }
    bouts.push("ε<sub>r</sub> "+simNb(s.er,2));
    bouts.push("tan δ "+simNb(s.tan_delta,4));
    bouts.push("cuivre "+simNb(1000*s.cuivre,0)+" µm");
    bouts.push("piste "+simNb(s.largeur,3)+" mm");

    /* LA PROVENANCE vient de l'outil, pas du serveur : lui seul sait si une
       épaisseur a été lue dans le fichier, saisie à la main, ou remplacée par
       un repli. C'est la moitié de l'information — « h = 0,380 mm » et
       « h = 0,380 mm, supposé » ne se lisent pas de la même façon. */
    const prov=(SIM_ED&&typeof SIM_ED.provenance==="function")
      ? SIM_ED.provenance(s) : "";

    h+='<p class="simSection"><b>Section</b> '+
       simEsc(s.nom_couche||("couche "+s.couche))+" — "+
       simEsc(simTopoNom(s))+" : "+bouts.join(", ")+
       " → ε_eff "+simNb(s.eps_eff,3)+
       (vues.size>1?" ("+simNb(v.longueur,2)+" mm)":"")+"."+
       (prov?" <i>"+simEsc(prov)+"</i>":"")+
       /* LE MASQUE DE SOUDURE N'EST PAS DANS L'EMPILAGE ENVOYÉ, et sur une
          piste de couche extérieure il compte : il remplit l'écart coplanaire,
          là où le champ est le plus fort. Deux à trois pour cent de Z₀ en
          moins, dans le sens qui rapproche du cuivre réel. Le dire ICI, sur la
          section concernée, plutôt qu'en note générale : une piste interne n'a
          pas de masque, et l'avertir n'aurait aucun sens. */
       ((s.topo==="micro"&&!(s.couverture>0))
         ? ' <i>Le masque de soudure n\'est pas dans l\'empilage : sur une '+
           "couche extérieure il fait baisser Z₀ de deux à trois pour cent, "+
           "non comptés ici.</i>"
         : "")+
       "</p>";
  }
  if(vues.size>4)
    h+='<p class="simSection">… et '+(vues.size-4)+" autre(s) section(s).</p>";
  return h;
}

/* Le nom de la topologie, sans l'écart coplanaire : celui-ci varie d'une plage
   à l'autre et appartient au tableau. `simTopo` le porte, lui. */
function simTopoNom(s){
  if(s.topo==="strip")return "triplaque";
  if(s.topo==="micro")return s.couvert?"microruban couvert":"microruban";
  return "";                       // topologie inconnue : rien à nommer
}

/* ==========================================================================
   QUI EST LA MASSE
   --------------------------------------------------------------------------
   C'EST UNE HYPOTHÈSE, PAS UNE MESURE, et c'est pourquoi elle est ici plutôt
   qu'enfouie dans les deux adaptateurs. Le calcul coplanaire a besoin de savoir
   quel cuivre latéral est un plan de retour. Jusqu'ici la règle était « tout
   net différent de celui de la piste », et elle est fausse deux fois :

     · un ÎLOT d'un autre signal qui longe la piste comptait comme masse. Il
       n'en est pas : il ne porte pas le courant de retour, il se couple. Z₀
       sortait trop bas, et rien ne le disait ;
     · à l'inverse, un plan d'ALIMENTATION découplé EST une masse RF. Il faut
       donc pouvoir le compter — et c'est un choix, pas une évidence.

   D'où cet ensemble de nets, proposé par l'outil et corrigeable d'un clic. Les
   deux adaptateurs le lisent par `simRefSet()` : un seul endroit décide, et le
   document d'échange l'emporte avec lui pour que le .csv et le .s2p disent sous
   quelle hypothèse leurs chiffres ont été obtenus.
   ========================================================================== */

/* Les candidats, tels que l'outil les voit. Un outil qui ne sait pas répondre
   rend une liste vide : `simRefSet()` est alors vide, et l'adaptateur retombe
   sur « pas de masse coplanaire » plutôt que d'en inventer une. */
function simRefCandidats(){
  if(!SIM_ED||typeof SIM_ED.refCandidats!=="function")return [];
  const l=SIM_ED.refCandidats();
  return Array.isArray(l)?l.filter(c=>c&&c.net):[];
}

/* L'ensemble des nets tenus pour de la masse.

   TANT QU'ON SUIT LA PROPOSITION on la recalcule à chaque appel : changer le
   rôle d'une couche dans l'éditeur, ou compléter l'empilage dans la
   visionneuse, doit se voir tout de suite. Dès qu'un clic a tranché, on garde.

   ON NE REPREND LA MAIN QUE SUR UNE AUTRE CARTE, et c'est important : un choix
   fait sur une carte ne veut rien dire sur la suivante, mais dessiner une zone
   de plus sur la même carte ne l'invalide en rien. Le déclencheur est donc le
   NOM DE LA CARTE, et non la liste des candidats — laquelle bouge au moindre
   coup de crayon, et reprendre la main à chaque fois effacerait un choix
   délibéré.

   Un net choisi qui n'est plus candidat est retiré : il n'y a plus de cuivre
   derrière. Vider l'ensemble à la main reste en revanche respecté — c'est un
   choix, et la fiche le signale plutôt que de le défaire.

   Appelé UNE FOIS par construction de problème, pas par point de mesure : les
   adaptateurs se passent l'ensemble et non la fonction. */
function simRefSet(){
  const cle=(SIM_ED&&SIM_ED.carte)?String(SIM_ED.carte()):"";
  if(SIM.refCle!==cle){SIM.refCle=cle; SIM.refAuto=true; SIM.ref=null;}
  const cand=simRefCandidats();
  if(SIM.refAuto||!SIM.ref)
    SIM.ref=new Set(cand.filter(c=>c.defaut).map(c=>c.net));
  else{
    const noms=new Set(cand.map(c=>c.net));
    SIM.ref=new Set([...SIM.ref].filter(n=>noms.has(n)));
  }
  return SIM.ref;
}
function simRefListe(){return [...simRefSet()].sort();}
function simRefBasculer(net){
  const s=simRefSet();
  if(s.has(net))s.delete(net); else s.add(net);
  SIM.refAuto=false;
  /* L'hypothèse a changé, donc l'impédance : le résultat affiché ne lui
     correspond plus. Même parti pris que la fréquence — on l'efface et on le
     dit, plutôt que de laisser lire un chiffre pour un autre. */
  if(SIM.res){SIM.res=null; SIM.objets=[];}
  SIM.err="La masse de référence a changé : relancez le calcul.";
  simRefEcrire(); simRendre(); simRepeindre();
}
function simRefAuto(){
  SIM.refAuto=true; SIM.ref=null;
  if(SIM.res){SIM.res=null; SIM.objets=[];}
  SIM.err="Masse de référence revenue à ce que propose la carte.";
  simRefEcrire(); simRendre(); simRepeindre();
}

/* La rangée de pastilles. Pas un `<select multiple>` : dans un panneau étroit
   il faut le dérouler pour savoir ce qu'il contient, et c'est justement ce
   qu'il faut voir sans cliquer. Huit candidats au plus — au-delà, ce ne sont
   plus des plans. */
const SIM_REF_MAX=8;
function simRefEcrire(){
  const box=simEl("simRefBar");
  if(!box)return;
  const cand=simRefCandidats(), s=simRefSet();
  if(!cand.length){
    /* DEUX SILENCES DIFFÉRENTS, et les confondre envoie chercher au mauvais
       endroit : un outil qui ne sait pas répondre, et une carte qui n'a pas de
       cuivre plein. Le second est le cas courant — une carte pas encore
       arrosée — et il n'y a alors rien à corriger. */
    const sait=!!(SIM_ED&&typeof SIM_ED.refCandidats==="function");
    box.innerHTML='<span class="pnl-lbl">Masse</span>'+
      '<span class="simRefVide">'+
      (sait
        ? "aucun net ne porte de cuivre plein sur cette carte : il n'y a pas "+
          "de masse coplanaire à compter."
        : "cet outil ne sait pas proposer de net de référence : le cuivre "+
          "coplanaire n'est pas compté.")+
      "</span>";
    return;
  }
  let h='<span class="pnl-lbl" title="Les nets tenus pour plan de retour. '+
        "Le cuivre de ces nets qui borde la piste sur sa propre couche entre "+
        'dans le calcul ; celui des autres nets, non.">Masse</span>';
  for(const c of cand.slice(0,SIM_REF_MAX))
    h+='<button class="simRefNet'+(s.has(c.net)?" on":"")+
       '" data-ref="'+simEsc(c.net)+'" title="'+simEsc(c.quoi||"")+'">'+
       simEsc(c.net)+"</button>";
  if(cand.length>SIM_REF_MAX)
    h+='<span class="simRefVide">+'+(cand.length-SIM_REF_MAX)+" autre(s)</span>";
  h+='<span class="simRefEtat">'+
     (SIM.refAuto?"proposé par la carte"
                 :'<span class="simRefRaz" id="simRefRaz">revenir à la '+
                  "proposition</span>")+"</span>";
  box.innerHTML=h;
  for(const b of box.querySelectorAll("[data-ref]"))
    b.onclick=function(){simRefBasculer(this.getAttribute("data-ref"));};
  const raz=simEl("simRefRaz");
  if(raz)raz.onclick=simRefAuto;
}

/* ==========================================================================
   LES PLAGES D'ÉCART CONSTANT
   --------------------------------------------------------------------------
   POURQUOI DÉCOUPER. Retenir le point le plus serré de toute la piste, c'est
   la calculer entière au pire de ce qu'elle rencontre : un couloir de plan qui
   s'ouvre à mi-parcours donnait une impédance de bout en bout qui n'était juste
   sur aucun des deux bouts. La mise en cascade des matrices ABCD sait pourtant
   enchaîner des sections différentes — c'est exactement son métier —, et une
   piste découpée en plages homogènes lui donne le problème qu'elle sait
   résoudre.

   ICI ET PAS DANS LES DEUX ADAPTATEURS, parce que « plage » doit vouloir dire
   la même chose des deux côtés. L'éditeur sonde des zones de cuivre, la
   visionneuse mesure des arêtes de plan ; mais le seuil au-delà duquel deux
   écarts sont « différents », et la longueur en dessous de laquelle une plage
   n'est plus une section, sont des choix de MODÉLISATION. Deux valeurs
   divergentes feraient répondre les deux outils différemment sur la même carte,
   et personne ne saurait laquelle croire.

   DEUX GARDE-FOUS, sans quoi une piste de cinquante millimètres sortirait en
   deux cents tronçons illisibles :
     · on regroupe les échantillons dont les DEUX côtés s'accordent à dix pour
       cent près ; l'absence de masse est sa propre classe, et ne se confond
       avec aucun écart, même très grand ;
     · une plage de moins d'un demi-millimètre n'est pas une section, c'est une
       discontinuité — et le modèle de ligne ne sait pas traiter une
       discontinuité. Elle rejoint donc sa voisine la plus longue et en prend la
       section, plutôt que d'entrer dans le calcul comme une ligne qu'elle
       n'est pas.
   ========================================================================== */
const SIM_PAS=0.25;             // mm ; le pas d'échantillonnage sur l'axe
const SIM_ECH_MAX=400;          // au-delà, la piste est longue et le pas grossit
const SIM_PLAGE_MIN=0.5;        // mm ; en deçà, ce n'est pas une section
const SIM_PLAGE_TOL=0.10;       // 10 % : deux échantillons de la même plage

function simMemeEcart(a,b){
  if(!(a>0)&&!(b>0))return true;            // ni l'un ni l'autre : même classe
  if(!(a>0)||!(b>0))return false;           // l'un oui, l'autre non : rupture
  return Math.abs(a-b)<=SIM_PLAGE_TOL*Math.max(a,b);
}

/* Découpe une piste de longueur `total` (mm) en plages d'écart constant.

   `mesure(u, i)` rend {g, d} — les deux écarts, en millimètres, à la fraction
   `u` du parcours. L'appelant y fait ce qu'il veut d'autre : relever le cuivre
   voisin, compter les côtés qui portent de la masse. Ce n'est pas le problème
   d'ici.

   Rend {plages, pas, n} : `plages` porte {u1, u2, longueur, g, d}, l'écart
   retenu d'une plage étant le point le plus SERRÉ qu'elle contient. Le minimum
   reste le choix prudent — mais sur une plage homogène il ne s'écarte plus de
   la moyenne que de dix pour cent, alors qu'un minimum pris sur la piste
   entière pouvait en être à un facteur dix. */
function simPlagesDe(total,mesure){
  if(!(total>0))return {plages:[], pas:0, n:0};
  const n=Math.max(1,Math.min(SIM_ECH_MAX,Math.ceil(total/SIM_PAS)));
  const pas=total/n;
  const plages=[];
  for(let i=0;i<n;i++){
    const e=mesure((i+0.5)/n,i)||{g:0,d:0};
    const p=plages[plages.length-1];
    if(p&&simMemeEcart(p.g,e.g)&&simMemeEcart(p.d,e.d)){
      p.i2=i;
      if(e.g>0)p.g=(p.g>0)?Math.min(p.g,e.g):e.g;
      if(e.d>0)p.d=(p.d>0)?Math.min(p.d,e.d):e.d;
    }else plages.push({i1:i, i2:i, g:e.g||0, d:e.d||0});
  }

  /* Les plages trop courtes rejoignent leur voisine la plus longue. On
     recommence tant qu'il en reste : absorber une plage courte peut en laisser
     une autre courte à côté. Une piste entière plus courte que le seuil garde
     sa plage unique — elle n'a pas de voisine, et ne pas la calculer du tout
     serait pire que de la calculer telle quelle. */
  let encore=true;
  while(encore&&plages.length>1){
    encore=false;
    for(let i=0;i<plages.length;i++){
      const p=plages[i];
      if((p.i2-p.i1+1)*pas>=SIM_PLAGE_MIN)continue;
      const a=plages[i-1], b=plages[i+1];
      const cible=(!a)?b:((!b)?a:((a.i2-a.i1)>=(b.i2-b.i1)?a:b));
      cible.i1=Math.min(cible.i1,p.i1);
      cible.i2=Math.max(cible.i2,p.i2);
      plages.splice(i,1);
      encore=true;
      break;
    }
  }

  return {
    n:n, pas:pas,
    plages:plages.map(function(p){
      return {u1:p.i1/n, u2:(p.i2+1)/n,
              longueur:(p.i2-p.i1+1)*pas, g:p.g, d:p.d};
    })
  };
}

/* ==========================================================================
   LA COUTURE DE VIAS
   --------------------------------------------------------------------------
   CE QUI FAIT QU'UN PLAN COPLANAIRE EST VRAIMENT DE LA MASSE. Le calcul de
   section tient le cuivre latéral à zéro volt — c'est sa condition aux
   limites, et c'est ce que « plan de masse » veut dire. Sur une carte, ce
   cuivre ne l'est qu'autant que des vias le ramènent au plan de référence
   d'en face. Sans couture, il flotte : à partir d'une certaine fréquence il
   résonne, cesse d'être une masse, et l'impédance calculée ne décrit plus rien.

   ON NE LE MODÉLISE PAS — il faudrait l'onde complète, c'est-à-dire
   `mom_solver/`, hors du chemin de calcul. On le CONTRÔLE : l'outil mesure
   l'espacement le plus grand entre deux coutures consécutives le long de la
   piste, et on le compare à la longueur d'onde dans le stratifié en haut de la
   bande analysée. C'est là que le risque est le plus fort, pas à f₀.

   λ/20 est l'usage pour une couture qui tient, λ/10 la limite au-delà de
   laquelle on ne peut plus dire que le cuivre latéral est de la masse. Les deux
   chiffres sont des règles de l'art, pas des théorèmes : le verdict dit
   « vérifiez », il ne dit pas « faux ».
   ========================================================================== */
function simCouture(res){
  const c=SIM.couture;
  if(!c)return "";
  /* La permittivité effective la plus forte de la sélection : c'est elle qui
     raccourcit le plus la longueur d'onde, donc celle qui juge. */
  let eps=1;
  for(const s of res.segments)if(s.eps_eff>eps)eps=s.eps_eff;
  const f=SIM.saisie.f2;                       // le haut de la bande analysée
  const lambda=299792458/(f*Math.sqrt(eps))*1e3;   // en mm
  const l10=lambda/10, l20=lambda/20;
  const ou=" (λ/10 = "+simNb(l10,2)+" mm à "+simFreq(f)+", ε_eff "+
           simNb(eps,2)+")";

  if(!c.n)
    return '<p class="simNote">· <b>Aucun via de masse</b> dans le couloir de '+
      simNb(c.couloir,2)+" mm qui borde la piste. Le cuivre latéral est "+
      "compté comme plan de retour par le calcul, mais rien ne le ramène au "+
      "plan d'en face : à cette fréquence il peut résonner au lieu de servir "+
      "de masse, et Z₀ ne décrirait alors plus la ligne"+ou+".</p>";

  const e=c.ecartMax;
  const verdict=e<=l20
    ? "<b>couture serrée</b> : le cuivre latéral se comporte en masse, "+
      "l'hypothèse coplanaire tient"
    : (e<=l10
        ? "<b>couture limite</b> : entre λ/20 et λ/10. Le cuivre latéral tient "+
          "encore lieu de masse, mais la marge est mince — resserrez si la "+
          "bande doit monter"
        : "<b>couture trop lâche</b> : au-delà de λ/10, le cuivre latéral peut "+
          "résonner et cesser d'être une masse. L'impédance calculée le suppose "+
          "pourtant à zéro volt");
  return '<p class="simNote">· Couture de vias : '+c.n+" via(s) de masse dans "+
    "le couloir de "+simNb(c.couloir,2)+" mm, espacement maximal "+
    simNb(e,2)+" mm — "+verdict+ou+".</p>";
}

/* ==========================================================================
   LE CUIVRE VOISIN QUI N'EST PAS DE LA MASSE
   --------------------------------------------------------------------------
   Ce que le filtre des nets de référence a écarté, et qu'il ne faut surtout
   pas jeter en silence. Un îlot d'un autre signal à deux dixièmes de
   millimètre n'est pas un plan de retour — il n'entre donc pas dans Z₀ — mais
   il est un COUPLAGE, et le modèle de ligne ne le voit pas. L'écarter du calcul
   sans le dire remplacerait une erreur par un silence.
   ========================================================================== */
function simVoisins(){
  const v=SIM.voisins;
  if(!v||!v.length)return "";
  const l=v.slice(0,4).map(o=>simEsc(o.net)+" à "+simNb(o.ecart,3)+" mm sur "+
                             simNb(o.longueur,2)+" mm");
  return '<p class="simNote">· Du cuivre <b>qui n\'est pas de la masse</b> '+
    "longe la piste sur sa propre couche : "+l.join(", ")+
    (v.length>4?", et "+(v.length-4)+" autre(s)":"")+
    ". Il n'entre PAS dans Z₀ — ce n'est pas un plan de retour —, mais c'est "+
    "un couplage, et le modèle de ligne ne le voit pas. Si l'un de ces nets "+
    "est en réalité de la masse, ajoutez-le à « Masse » ci-dessus.</p>";
}

/* ==========================================================================
   Les ports, écrits noir sur blanc
   --------------------------------------------------------------------------
   PERSONNE NE LES PLACE, ET C'EST VOULU. Le modèle est une chaîne de lignes
   uniformes : elle a exactement deux bouts, et il n'y a donc rien à choisir.
   Le port 1 est le DÉPART du premier tronçon envoyé, le port 2 l'ARRIVÉE du
   dernier ; tous deux sont ramenés à l'impédance du champ « Réf. ».

   Ce que cela veut dire, et qu'il vaut mieux lire que deviner :
     · ils sont IDÉAUX — pas de pastille, pas de via, pas de connecteur, pas
       de longueur d'accès à retrancher. S₁₁ est la réflexion du cuivre nu ;
     · leur ORDRE suit celui d'envoi des tronçons, qui n'est pas forcément le
       sens de parcours électrique. Sur une chaîne c'est sans conséquence pour
       S₂₁ ; pour S₁₁ contre S₂₂, cela dit lequel est « l'entrée ».

   On affiche les coordonnées quand le document les porte : c'est le seul moyen
   de vérifier d'un coup d'œil que le port 1 est bien là où on croit. */
function simPorts(res){
  const objs=(SIM.doc&&SIM.doc.geometry&&SIM.doc.geometry.objects)||[];
  const zr=res.impedance_reference||SIM.saisie.z0;
  const pt=p=>(p&&p.length>=2)
    ?" ("+simNb(p[0],2)+" ; "+simNb(p[1],2)+")":"";
  const a=objs.length?pt(objs[0].start):"";
  const b=objs.length?pt(objs[objs.length-1].end):"";
  return '<p class="simNote">· Ports déduits, non placés : <b>1</b> au départ '+
    "du premier tronçon"+simEsc(a)+", <b>2</b> à l'arrivée du dernier"+
    simEsc(b)+", tous deux sur "+simNb(zr,0)+" Ω. Ils sont idéaux — ni "+
    "pastille, ni via, ni connecteur, ni longueur d'accès à retrancher : "+
    "S₁₁ est la réflexion du cuivre nu.</p>";
}

/* Le nom de la section. « Microruban couvert » n'est pas une coquetterie : une
   piste interne qui n'a de plan que d'un côté a du stratifié au-dessus d'elle
   et pas de l'air, ce qui la sépare d'une piste de couche extérieure par une
   dizaine de pour cent d'impédance. Les deux portent le même mot dans les
   normes ; les distinguer ici évite de croire à une erreur en comparant deux
   lignes du tableau. */
function simTopo(s){
  const base=simTopoNom(s);
  if(!base)return "—";
  /* « Coplanaire » n'est pas un détail de vocabulaire : c'est ce qui sépare
     57 Ω de 50 Ω sur la même piste. Le tableau doit le dire, avec l'écart
     mesuré, sans quoi on ne sait pas quel calcul on lit.

     ET AVEC LE NOMBRE DE CÔTÉS. Une masse d'un seul côté ne fait pas la moitié
     de l'effet, elle en fait les deux tiers environ — mais surtout, écrire
     « coplanaire (0,20 mm) » pour une piste qui longe une découpe laisse croire
     à un écart des deux côtés, et c'est exactement l'hypothèse qu'on vient de
     lever. Un seul côté se nomme donc, et les deux écarts s'écrivent quand ils
     diffèrent. */
  if(!s.coplanaire)return base;
  if(s.cotes===1)
    return base+" coplanaire, un seul côté ("+simNb(s.ecart,3)+" mm)";
  const g=s.ecart_g, d=s.ecart_d;
  if(g>0&&d>0&&Math.abs(g-d)>0.001*Math.max(g,d)+1e-6)
    return base+" coplanaire ("+simNb(Math.min(g,d),3)+" / "+
           simNb(Math.max(g,d),3)+" mm)";
  return base+" coplanaire ("+simNb(s.ecart,3)+" mm)";
}

/* Ce que la masse coplanaire a fait au résultat, et d'où vient l'écart mesuré.
   Deux outils, deux provenances, et il faut pouvoir les distinguer : l'éditeur
   PCB CONNAÎT son isolation — c'est elle qui creuse le plan —, la visionneuse
   la MESURE sur le cuivre livré. */
function simCoplanaire(res){
  const cop=res.segments.filter(s=>s.coplanaire&&s.ecart>0);
  if(!cop.length)return "";
  const ecarts=[...new Set(cop.map(s=>s.ecart))].sort((a,b)=>a-b);
  /* « à de 0,287 à 0,293 mm » : la phrase portait déjà son « à », et la plage en
     ajoutait un second. Une fourchette se dit « entre … et … », un écart unique
     « à … » — deux tournures, pas une avec un trou dedans. */
  const quoi=ecarts.length>1
    ? "entre "+simNb(ecarts[0],3)+" et "+
      simNb(ecarts[ecarts.length-1],3)+" mm"
    : "à "+simNb(ecarts[0],3)+" mm";
  const refs=simRefListe();
  let h='<p class="simNote">· Ligne <b>coplanaire</b> : du cuivre de masse '+
    "borde la piste sur sa propre couche, "+quoi+". Il est dans le calcul — "+
    "il fait tomber Z₀ de plusieurs ohms, et l'ignorer donnerait un chiffre "+
    "nettement trop haut. Chaque côté est mesuré SÉPARÉMENT et entre dans le "+
    "calcul pour ce qu'il est. L'écart vient "+
    (SIM_ED&&SIM_ED.outil==="editeur-pcb"
      ? "de la règle d'isolation qui creuse le plan"
      : "d'une mesure sur le cuivre du fichier")+
    (refs.length?", et « masse » veut dire "+simEsc(refs.join(", ")):"")+
    ".</p>";

  /* CE QUE LA DISSYMÉTRIE A CHANGÉ. Une piste dont les deux bords ne voient
     pas la même chose est le cas ordinaire dès qu'un plan s'arrête, et c'est
     précisément ce que le calcul d'avant ne savait pas prendre. Le dire avec
     le pire écart des deux côtés permet de juger si ça compte. */
  let pire=null;
  for(const s of cop){
    const g=s.ecart_g, d=s.ecart_d;
    if(!(g>0&&d>0))continue;
    const r=Math.max(g,d)/Math.min(g,d);
    if(!pire||r>pire.r)pire={r:r, g:Math.min(g,d), d:Math.max(g,d)};
  }
  if(pire&&pire.r>1.5)
    h+='<p class="simNote">· Masse <b>dissymétrique</b> : jusqu\'à '+
      simNb(pire.g,3)+" mm d'un côté contre "+simNb(pire.d,3)+
      " mm de l'autre. Les deux côtés partent au solveur tels quels — les "+
      "poser égaux, comme le faisait la version précédente, aurait fait "+
      "tomber Z₀ nettement trop bas.</p>";
  return h;
}

/* De combien la dispersion a déplacé Z₀ entre le quasi-statique et f₀ : on
   prend l'écart le plus fort de la sélection, parce que c'est celui qui décide
   si le chiffre affiché tient encore. */
function simDispersion(segments){
  let pire=null;
  for(const s of segments){
    if(!(s.z0>0)||!(s.z0_statique>0))continue;
    const e=Math.abs(s.z0-s.z0_statique)/s.z0_statique;
    if(!pire||e>pire.e)pire={e:e, s:s};
  }
  if(!pire||pire.e<0.01)return "";
  return "Dispersion (Getsinger) : à f₀ elle porte Z₀ de "+
         simNb(pire.s.z0_statique,1)+" Ω à "+simNb(pire.s.z0,1)+" Ω sur le "+
         "tronçon le plus touché, soit "+simNb(100*pire.e,1)+" %. "+
         "C'est un modèle, pas un calcul — au-delà de quelques gigahertz sur "+
         "stratifié courant, ce déplacement-là est le moins sûr du résultat.";
}

/* Les tronçons identiques qui se suivent, regroupés. « Identiques » veut dire
   même couche, même largeur, même impédance — donc la même section droite. */
function simGrouper(segments){
  const out=[];
  for(const s of segments){
    const p=out[out.length-1];
    if(p&&p.seg.couche===s.couche&&p.seg.largeur===s.largeur&&
       p.seg.z0===s.z0){
      p.n++; p.longueur+=s.longueur; continue;
    }
    out.push({seg:s, n:1, longueur:s.longueur,
              couche:s.nom_couche||("couche "+s.couche)});
  }
  return out;
}

/* ==========================================================================
   Le panneau
   ========================================================================== */
/* Les champs de nombres sont des champs TEXTE, avec `inputmode="decimal"` :
   ce panneau écrit ses valeurs avec la virgule décimale d'ici, et un
   `<input type="number">` refuse la virgule dès que le navigateur n'est pas en
   français — le champ se vide alors tout seul, en silence, et une bande
   0,1 GHz démarre à blanc. La lecture, elle, accepte les deux. C'est la règle
   du panneau d'empilage de la visionneuse (`pnlChamp`, 05-panneaux.js). */
function simChamp(id,titre,large){
  return '<input id="'+id+'" type="text" inputmode="decimal" spellcheck="false"'+
         (large?' class="large"':"")+' title="'+simEsc(titre)+'">';
}
/* ==========================================================================
   DEUX FAMILLES, ET DES ANALYSES DEDANS
   --------------------------------------------------------------------------
   Le panneau n'a longtemps porté qu'une question — que vaut l'impédance de ce
   cuivre — et son corps était écrit en dur. Il en portera d'autres, et elles
   ne se rangent pas toutes au même endroit : l'intégrité du SIGNAL demande ce
   qu'un front devient en chemin, l'intégrité de l'ALIMENTATION ce que le
   réseau de distribution laisse passer. Ce sont deux métiers, deux jeux de
   questions, deux façons de lire le résultat ; les empiler dans une seule
   liste d'options obligerait à lire quatre lignes de saisie pour trouver la
   sienne.

   D'où ce registre. Une famille porte des analyses ; une analyse déclare son
   nom, ce qu'elle demande (`corps`), comment on la branche (`brancher`), ce
   qu'elle écrit (`rendre`), et si elle PEINT la carte. Ajouter une analyse,
   c'est ajouter une entrée ici — pas toucher au panneau.

   ON N'INVENTE PAS DE PLACEHOLDERS. La famille PI n'a aucune analyse, et elle
   le dit en toutes lettres plutôt que d'afficher des onglets grisés qui
   promettent ce qui n'existe pas. Un onglet qui ne fait rien coûte plus cher
   qu'une phrase honnête.
   ========================================================================== */
const SIM_FAMILLES=[
  {cle:"si", court:"SI", nom:"Intégrité du signal",
   quoi:"Ce qu'un front devient en parcourant le cuivre : impédance, retard, "+
        "pertes, réflexions.",
   analyses:["impedance"]},
  {cle:"pi", court:"PI", nom:"Intégrité de l'alimentation",
   quoi:"Ce que le réseau de distribution laisse passer : chute continue, "+
        "impédance vue par le composant, résonances de plan.",
   analyses:[]}
];

/* Le catalogue des analyses. `impedance` est la seule à exister, et tout ce
   qu'elle fait était jusqu'ici le panneau entier — d'où les fonctions qui
   suivent, qui n'ont pas changé de contenu, seulement de propriétaire. */
const SIM_ANALYSES={
  impedance:{
    nom:"Impédance",
    titre:"Impédance caractéristique du cuivre sélectionné, tronçon par "+
          "tronçon, et paramètres S de la liaison.",
    peint:true,
    corps:simCorpsImpedance,
    brancher:simBrancherImpedance,
    rendre:simRendreImpedance
  }
};

/* La famille courante, et l'analyse dedans. Une famille vide n'a pas
   d'analyse : `SIM.analyse` vaut alors "" et tout ce qui calcule se tait. */
function simFamille(cle){
  return SIM_FAMILLES.find(f=>f.cle===(cle||SIM.famille))||SIM_FAMILLES[0];
}
function simAnalyse(){
  return SIM.analyse?SIM_ANALYSES[SIM.analyse]:null;
}
/* Peut-on calculer ici ? Tout ce qui lance, exporte ou peint passe par là :
   un seul endroit décide, et une famille sans analyse ne peut rien déclencher
   par mégarde. */
function simCalculable(){
  const a=simAnalyse();
  return !!(a&&a.corps);
}

/* Les onglets. Deux rangées : la famille, puis l'analyse dans la famille. La
   seconde s'affiche même quand elle ne porte qu'un onglet — elle NOMME ce
   qu'on regarde, et ce nom est justement ce qui manquera le jour où il y en
   aura trois. */
function simOnglets(){
  let h='<div class="simFam" role="tablist">';
  for(const f of SIM_FAMILLES)
    h+='<button class="simOnglet'+(f.cle===SIM.famille?" on":"")+
       '" data-fam="'+f.cle+'" title="'+simEsc(f.quoi)+'">'+
       '<b>'+f.court+"</b> "+simEsc(f.nom)+"</button>";
  h+="</div>";

  const fam=simFamille();
  h+='<div class="simAna" role="tablist">';
  if(!fam.analyses.length)
    h+='<span class="simAnaVide">aucune analyse pour l\'instant</span>';
  else for(const cle of fam.analyses){
    const a=SIM_ANALYSES[cle];
    if(!a)continue;
    h+='<button class="simOnglet mini'+(cle===SIM.analyse?" on":"")+
       '" data-ana="'+cle+'" title="'+simEsc(a.titre)+'">'+
       simEsc(a.nom)+"</button>";
  }
  h+="</div>";
  return h;
}

/* Le corps de l'analyse courante, replacé et rebranché. Appelé au démarrage et
   à chaque changement d'onglet — il n'y a pas deux chemins pour poser le
   panneau, donc pas deux états possibles. */
function simPoser(){
  const onglets=simEl("simOnglets"), ctl=simEl("simCtl");
  if(onglets)onglets.innerHTML=simOnglets();
  if(ctl)ctl.innerHTML=simCalculable()?simAnalyse().corps():"";
  if(onglets)for(const b of onglets.querySelectorAll("[data-fam]"))
    b.onclick=function(){simAllerFamille(this.getAttribute("data-fam"));};
  if(onglets)for(const b of onglets.querySelectorAll("[data-ana]"))
    b.onclick=function(){simAllerAnalyse(this.getAttribute("data-ana"));};
  if(simCalculable()&&simAnalyse().brancher)simAnalyse().brancher();
  simRendre();
}
/* Changer de famille prend sa première analyse, ou aucune si elle est vide. */
function simAllerFamille(cle){
  if(cle===SIM.famille)return;
  SIM.famille=cle;
  const fam=simFamille();
  SIM.analyse=fam.analyses[0]||"";
  simPoser();
  /* La carte de chaleur appartient à l'analyse d'impédance : quitter celle-ci
     doit l'éteindre. Le résultat, lui, est GARDÉ — revenir sur l'onglet le
     retrouve tel quel, et relancer un calcul pour rien serait à la fois lent
     et impoli. C'est `simZActif()` qui tranche, en un seul endroit. */
  simRepeindre();
}
function simAllerAnalyse(cle){
  if(cle===SIM.analyse||!SIM_ANALYSES[cle])return;
  SIM.analyse=cle;
  simPoser();
  simRepeindre();
}

function simCorps(){
  return '<div id="simOnglets"></div><div id="simCtl"></div>'+
         '<div class="scroll" id="simSortie"></div>';
}

function simCorpsImpedance(){
  return ''+
  /* La masse de référence en TÊTE des commandes, et non repliée en bas : elle
     commande le calcul coplanaire, donc plusieurs ohms sur le résultat. Elle se
     remplit à part (`simRefEcrire`) parce qu'elle dépend de la carte ouverte, et
     que ce corps-là est posé une fois pour toutes. */
  '<div class="pnl-bar simRefBar" id="simRefBar"></div>'+
  '<div class="pnl-bar">'+
    '<span class="pnl-lbl">Cible</span>'+
    simChamp("simZCible","Impédance visée pour la piste sélectionnée")+
    '<span class="simU">Ω</span>'+
    '<span class="pnl-lbl">Tolérance</span>'+
    simChamp("simZTol","En pourcentage de la cible. 10 % est l'usage.")+
    '<span class="simU">%</span>'+
    '<span class="simU" id="simZTolAbs">—</span>'+
  '</div>'+
  '<div class="pnl-bar">'+
    '<span class="pnl-lbl">Fréquence</span>'+
    simChamp("simFc","Fréquence centrale : c'est à celle-ci que l'impédance "+
                     "est donnée et que la carte est peinte")+
    '<span class="simU">GHz</span>'+
    '<span class="pnl-lbl">Réf.</span>'+
    simChamp("simZ0","Impédance de référence des ports, pour les paramètres S")+
    '<span class="simU">Ω</span>'+
  '</div>'+
  '<div class="pnl-bar">'+
    '<span class="pnl-lbl">Bande S</span>'+
    simChamp("simF1","Début de bande, en GHz")+
    '<span class="simSep">→</span>'+
    simChamp("simF2","Fin de bande, en GHz")+
    '<span class="simU">GHz</span>'+
    '<span class="pnl-lbl">Points</span>'+
    simChamp("simN","Nombre de points de la courbe S")+
  '</div>'+
  '<div class="pnl-bar">'+
    '<button class="tb mini on" id="simGo" title="Calculer la sélection">▶ Calculer</button>'+
    '<button class="tb mini" id="simCsv" title="Le tableau des tronçons, à joindre à un dossier de fabrication">.csv</button>'+
    '<button class="tb mini" id="simS2p" title="Les paramètres S au format Touchstone">.s2p</button>'+
    '<button class="tb mini" id="simJson" title="Le problème lui-même : il se donne au solveur en ligne de commande">.json</button>'+
    '<label class="simSuivre" title="Recalculer à chaque changement de sélection"><input type="checkbox" id="simAuto"> suivre</label>'+
  '</div>';
}

function simZTolEcrire(){
  const el=simEl("simZTolAbs");
  if(el)el.textContent="± "+simNb(simZTolAbs(),1)+" Ω";
}
function simSaisieEcrire(){
  const s=SIM.saisie, pose=(id,v)=>{const e=simEl(id);if(e)e.value=v;};
  const g=v=>String(v/1e9).replace(".",",");
  pose("simF1",g(s.f1)); pose("simF2",g(s.f2)); pose("simFc",g(s.fc));
  pose("simN",s.points); pose("simZ0",s.z0);
  pose("simZCible",String(s.cible).replace(".",","));
  pose("simZTol",String(s.tolPct).replace(".",","));
  simZTolEcrire();
}
/* Ce que l'utilisateur a saisi, ramené aux unités du document : les fréquences
   se saisissent en GHz et circulent en hertz. Une saisie vide ou aberrante
   retombe sur la valeur précédente plutôt que sur zéro — une bande nulle est
   un refus du serveur, pas une intention. */
function simSaisie(){
  const lu=(id,defaut,mini)=>{
    const el=simEl(id);
    const v=el?parseFloat(String(el.value).replace(",",".")):NaN;
    return (isFinite(v)&&v>=(mini==null?0:mini))?v:defaut;
  };
  const s=SIM.saisie;
  s.f1=lu("simF1",s.f1/1e9,1e-6)*1e9;
  s.f2=lu("simF2",s.f2/1e9,1e-6)*1e9;
  s.fc=lu("simFc",s.fc/1e9,1e-6)*1e9;
  s.points=Math.round(lu("simN",s.points,1));
  s.z0=lu("simZ0",s.z0,1);
  s.cible=lu("simZCible",s.cible,0.1);
  s.tolPct=lu("simZTol",s.tolPct,0);
  return s;
}

/* Ce qu'affiche la zone de sortie, selon là où on en est. Un seul endroit
   décide : sans cela, un message d'erreur survivait au calcul suivant.

   Une famille sans analyse écrit ce qu'elle EST et ce qu'elle n'a pas encore,
   plutôt qu'une page blanche ou un « à venir » qui n'apprend rien. */
function simRendre(){
  const box=simEl("simSortie");
  if(!box)return;
  const a=simAnalyse();
  if(!a){box.innerHTML=simRendreVide();SIM_REPERE=null;return;}
  box.innerHTML=a.rendre?a.rendre():"";
  /* La courbe vient d'être réécrite : ses gestionnaires sont partis avec
     l'ancien DOM, on les remet. Un seul endroit le fait, comme pour le reste. */
  SIM_LARGEUR=box.clientWidth;
  simBrancherCourbe();
  simSurveillerLargeur(box);
}

/* Le panneau se redimensionne — on le détache, on l'agrandit, on le met en
   plein écran. Le tracé est dessiné à une largeur fixée AU MOMENT du rendu :
   sans cela il resterait à l'ancienne, étiré ou rétréci, avec ses cotes
   déformées. On le refait quand la largeur a bougé POUR DE BON : un rendu
   change la barre de défilement, qui change la largeur de quelques pixels, qui
   déclencherait un rendu — la boucle est là, le seuil l'évite.

   TROIS DÉCLENCHEURS, ET C'EST VOULU. `ResizeObserver` est le bon mécanisme et
   le plus prompt, mais il ne livre ses notifications que dans le cycle de
   rendu : une page qui ne compose pas de frame ne le voit jamais partir. Les
   deux autres n'en dépendent pas — le redimensionnement de la fenêtre, et
   l'entrée du pointeur dans la zone de sortie, qui rattrape le cas d'un
   panneau redimensionné à la poignée juste avant qu'on vienne y lire quelque
   chose. Aucun des trois ne redessine si la largeur n'a pas changé, donc les
   cumuler ne coûte rien. */
let SIM_LARGEUR=0, SIM_OBSERVATEUR=null, SIM_RETARD_LARGEUR=null;
function simVerifierLargeur(box,differe){
  if(!SIM.res||!simCalculable()||!box)return;
  if(Math.abs(box.clientWidth-SIM_LARGEUR)<24)return;
  if(SIM_RETARD_LARGEUR)clearTimeout(SIM_RETARD_LARGEUR);
  if(!differe){SIM_RETARD_LARGEUR=null;simRendre();return;}
  SIM_RETARD_LARGEUR=setTimeout(function(){
    SIM_RETARD_LARGEUR=null; simRendre();
  },120);
}
function simSurveillerLargeur(box){
  box.onpointerenter=function(){simVerifierLargeur(box,false);};
  if(SIM_OBSERVATEUR)return;
  if(typeof ResizeObserver==="function"){
    SIM_OBSERVATEUR=new ResizeObserver(function(){
      simVerifierLargeur(box,true);
    });
    SIM_OBSERVATEUR.observe(box);
  }
  if(typeof window!=="undefined"&&window.addEventListener)
    window.addEventListener("resize",function(){
      simVerifierLargeur(simEl("simSortie"),true);
    });
}

function simRendreVide(){
  const fam=simFamille();
  return '<p class="simEtat"><b>'+simEsc(fam.nom)+"</b> — "+simEsc(fam.quoi)+
    "<br><small>Aucune analyse de cette famille n'est encore écrite. Ce qui "+
    "existe est dans <b>SI</b>, à côté.<br>"+
    "Le jour où l'une arrive, elle se déclare dans <code>SIM_ANALYSES</code> "+
    "(<code>commun/simulation-em.js</code>) et l'onglet apparaît tout seul."+
    "</small></p>";
}

function simRendreImpedance(){
  if(SIM.occupe)
    return '<p class="simEtat">Le solveur travaille…<br>'+
      "<small>Une résolution de section par largeur et par couche, puis les "+
      "paramètres S sur la bande.</small></p>";
  if(SIM.err)return '<p class="simErr">'+simEsc(SIM.err)+"</p>";
  if(SIM.res)return simFiche();
  return '<p class="simEtat">Sélectionnez une piste, puis calculez.<br>'+
    "<small><b>Clic</b> : le tronçon cliqué seul. <b>Maj+clic</b> : la piste "+
    "entière. <b>Maj+clic à nouveau</b> : la piste sur toutes les couches.<br>"+
    "Le calcul a lieu sur le serveur (<code>python serveur.py</code>) : le "+
    "solveur est en Python.</small></p>";
}

/* ==========================================================================
   Lancer
   ========================================================================== */
function simProbleme(){
  if(!SIM_ED||typeof SIM_ED.probleme!=="function"){
    SIM.err="Cet outil ne sait pas décrire de problème.";
    return null;
  }
  const p=SIM_ED.probleme(simSaisie());
  if(!p||p.erreur){
    SIM.err=((p&&p.erreur)||"Rien à calculer.")+
            ((p&&p.conseil)?"\n"+p.conseil:"");
    return null;
  }
  p.doc.format=SIM_FORMAT;
  p.doc.source=SIM_ED.outil;
  /* L'HYPOTHÈSE PART AVEC LE PROBLÈME. Le serveur ne s'en sert pas — les écarts
     sont déjà mesurés — mais le résultat, le .csv et l'entête Touchstone doivent
     dire ce qui a été tenu pour de la masse. Un chiffre sans son hypothèse
     n'est pas vérifiable. */
  p.doc.reference_nets=simRefListe();
  SIM.doc=p.doc;
  SIM.portee=p.portee||"";
  SIM.notes=p.notes||[];
  SIM.couture=p.couture||null;
  SIM.voisins=p.voisins||[];
  SIM.err="";
  return p;
}

async function simGo(){
  if(SIM.occupe||!simCalculable())return;
  /* Le résultat précédent s'efface AVANT le calcul : garder à l'écran, et sur
     la carte, la couleur d'une autre sélection est le meilleur moyen de lire
     un chiffre pour un autre. */
  SIM.res=null; SIM.objets=[]; SIM.err="";
  const p=simProbleme();
  if(!p){simRendre();simRepeindre();return;}
  SIM.occupe=true; simRendre(); simRepeindre();
  try{
    const res=await simLancer(p.doc);
    if(res.segments.length!==p.objets.length)
      throw new Error("Le serveur a rendu "+res.segments.length+
                      " tronçon(s) pour "+p.objets.length+" envoyé(s).");
    /* Le nom de couche est connu de l'outil, pas du serveur : on le recopie
       ici pour que le tableau le nomme au lieu d'un indice. */
    res.segments.forEach((s,i)=>{s.nom_couche=p.objets[i].couche||"";});
    SIM.res=res; SIM.objets=p.objets;
    SIM.suivre=true;
    const el=simEl("simAuto");
    if(el&&!el.checked)el.checked=true;
    if(SIM_ED.astuce)
      SIM_ED.astuce("Simulation : "+res.ligne.troncons+" tronçon(s), Z₀ "+
                    simNb(res.ligne.z0_min,1)+"–"+simNb(res.ligne.z0_max,1)+
                    " Ω à "+simFreq(res.f_centre)+".");
  }catch(e){
    SIM.err=e.message||String(e);
  }finally{
    SIM.occupe=false; simRendre(); simRepeindre();
  }
}

function simRepeindre(){
  if(SIM_ED&&SIM_ED.redessiner)SIM_ED.redessiner();
}

/* ==========================================================================
   Enregistrer les trois sorties
   ========================================================================== */
function simExportCsv(){
  if(!SIM.res){SIM.err="Rien à enregistrer : calculez d'abord.";simRendre();return;}
  const n=v=>String(v).replace(".",",");
  const c=SIM.saisie.cible;
  const verdict=z=>z>0?(simZVerdict(z)>0?"trop eleve"
                       :(simZVerdict(z)<0?"trop faible":"dans la tolerance"))
                     :"non calculable";
  /* `z0_statique` accompagne `z0` : la différence entre les deux est ce que la
     dispersion a ajouté, et c'est la part la moins sûre du chiffre. Un dossier
     de fabrication qui reprend l'un doit pouvoir retrouver l'autre. */
  /* L'écart de masse tient TROIS colonnes et non une : le côté gauche, le côté
     droit, et le nombre de côtés qui portent de la masse. Une seule colonne ne
     pouvait pas distinguer une coplanaire serrée des deux côtés d'une piste qui
     longe une découpe — et ce sont plusieurs ohms d'écart. */
  /* LA SECTION RÉSOLUE TIENT SES PROPRES COLONNES. Un `.csv` se détache de la
     page où il a été produit : sans la hauteur au plan, la permittivité et le
     plan de référence, il ne reste qu'une impédance dont on ne peut plus
     vérifier sur quoi elle a été obtenue — et c'est là que se trouve la cause
     neuf fois sur dix quand elle ne tombe pas sur la carte réelle. */
  const l=["troncon;couche;longueur_mm;largeur_mm;topologie;"+
           "ecart_masse_gauche_mm;ecart_masse_droite_mm;cotes_avec_masse;"+
           "plan_reference;h_mm;er;tan_delta;cuivre_mm;couverture_mm;"+
           "z0_ohm;z0_statique_ohm;ecart_ohm;eps_eff;retard_ps;pertes_db;verdict"];
  SIM.res.segments.forEach((s,i)=>{
    l.push([i+1, s.nom_couche||s.couche, n(s.longueur), n(s.largeur),
            simTopo(s).replace(/[éè]/g,"e"),
            s.coplanaire?n(s.ecart_g||0):"",
            s.coplanaire?n(s.ecart_d||0):"",
            s.coplanaire?(s.cotes==null?"":s.cotes):"",
            String(s.plan_haut||s.plan_bas||"").replace(/[;\r\n]+/g," "),
            s.h!=null?n(s.h):"",
            s.er!=null?n(s.er):"",
            s.tan_delta!=null?n(s.tan_delta):"",
            s.cuivre!=null?n(s.cuivre):"",
            s.couverture!=null?n(s.couverture):"",
            s.z0>0?n(Math.round(s.z0*10)/10):"",
            s.z0_statique>0?n(Math.round(s.z0_statique*10)/10):"",
            s.z0>0?n(Math.round((s.z0-c)*10)/10):"",
            s.eps_eff?n(s.eps_eff):"",
            s.retard?n(Math.round(s.retard*1e13)/10):"",
            s.pertes_db!=null?n(s.pertes_db):"",
            verdict(s.z0)].join(";"));
  });
  const L=SIM.res.ligne;
  l.push("");
  l.push("cible_ohm;"+n(c)+";tolerance_pct;"+n(SIM.saisie.tolPct)+
         ";tolerance_ohm;"+n(Math.round(simZTolAbs()*10)/10));
  l.push("frequence_hz;"+n(SIM.res.f_centre)+";z0_moyen_ohm;"+n(L.z0_moyen)+
         ";longueur_mm;"+n(L.longueur)+";pertes_db;"+n(L.pertes_db)+
         ";impedance_reference_ohm;"+
         n(SIM.res.impedance_reference||SIM.saisie.z0));
  l.push("portee;"+(SIM.portee||""));
  /* SOUS QUELLE HYPOTHÈSE. Le calcul coplanaire dépend entièrement de ce qui a
     été tenu pour de la masse : deux jeux de nets donnent deux impédances sur
     le même cuivre. Sans cette ligne, le tableau n'est pas reproductible. */
  const refs=(SIM.res.reference_nets||simRefListe());
  l.push("masse_de_reference;"+(refs.length?refs.join(" "):"non declaree"));
  if(SIM.couture)
    l.push("couture_vias;"+SIM.couture.n+";espacement_max_mm;"+
           n(Math.round(SIM.couture.ecartMax*100)/100)+";couloir_mm;"+
           n(SIM.couture.couloir));
  for(const v of (SIM.voisins||[]))
    l.push("cuivre_voisin_hors_masse;"+String(v.net).replace(/[;\r\n]+/g," ")+
           ";ecart_mm;"+n(v.ecart)+";longueur_mm;"+n(v.longueur));
  /* Les réserves partent AVEC les chiffres. Un .csv se détache de la page où
     il a été produit : sans elles, il ne reste qu'un tableau qui a l'air sûr.
     LES NOTES DE L'OUTIL AUSSI, et elles manquaient : « les vias ne sont pas
     modélisés », « l'épaisseur de diélectrique est supposée » ne partaient
     qu'avec le panneau, et le .csv avait donc l'air plus sûr que la page. */
  for(const a of (SIM.notes||[]))
    l.push("note;"+String(a).replace(/[;\r\n]+/g," "));
  for(const a of (SIM.res.avertissements||[]))
    l.push("avertissement;"+String(a).replace(/[;\r\n]+/g," "));
  /* Le BOM UTF-8 : sans lui, Excel lit les accents de travers. */
  simTelecharger("﻿"+l.join("\r\n")+"\r\n",
                 simNomFichier("-impedance.csv"), "text/csv;charset=utf-8");
}
function simExportS2p(){
  if(!SIM.res||!SIM.res.touchstone){
    SIM.err="Rien à enregistrer : calculez d'abord.";simRendre();return;
  }
  simTelecharger(SIM.res.touchstone,simNomFichier(".s2p"),"text/plain");
}
function simExportJson(){
  const p=simProbleme();
  if(!p){simRendre();return;}
  simTelecharger(JSON.stringify(p.doc,null,1),simNomFichier("-sim.json"),
                 "application/json");
}

/* ==========================================================================
   Branchement
   Appelé une fois par l'outil, quand le DOM est là. `conteneur` est l'élément
   qui reçoit le corps du panneau — chaque outil le déclare dans son HTML.
   ========================================================================== */
function simInit(adaptateur,conteneur){
  SIM_ED=adaptateur;
  const box=(typeof conteneur==="string")?simEl(conteneur):conteneur;
  if(!box||!SIM_ED)return false;

  box.innerHTML=simCorps();
  SIM.ouvert=true;
  simPoser();
  return true;
}

/* Le branchement de l'analyse d'impédance. Il est refait à chaque fois que ses
   commandes sont reposées — changer d'onglet et revenir remplace le DOM, et
   des gestionnaires accrochés à des éléments disparus ne servent personne.
   Les valeurs, elles, vivent dans `SIM.saisie` : elles survivent au va-et-vient
   entre les onglets, ce qui est bien le moindre. */
function simBrancherImpedance(){
  simSaisieEcrire();
  simRefEcrire();
  const pose=(id,quoi,fn)=>{const e=simEl(id);if(e)e[quoi]=fn;};
  pose("simGo","onclick",simGo);
  pose("simCsv","onclick",simExportCsv);
  pose("simS2p","onclick",simExportS2p);
  pose("simJson","onclick",simExportJson);
  const auto=simEl("simAuto");
  if(auto){auto.checked=SIM.suivre;
           auto.onchange=function(){SIM.suivre=this.checked;};}

  /* La cible et la tolérance ne demandent PAS de recalcul : elles ne changent
     pas l'impédance, seulement la bande dans laquelle on la juge. La carte se
     repeint donc au fil de la frappe, sans toucher au serveur. */
  for(const id of ["simZCible","simZTol"])
    pose(id,"oninput",function(){
      simSaisie(); simZTolEcrire(); simRendre(); simRepeindre();
    });
  /* La fréquence et la bande, elles, changent le calcul : le résultat affiché
     ne leur correspond plus, et le dire vaut mieux que de laisser croire. */
  for(const id of ["simFc","simF1","simF2","simN","simZ0"])
    pose(id,"oninput",function(){
      simSaisie();
      if(SIM.res&&!SIM.occupe){
        SIM.res=null; SIM.objets=[];
        SIM.err="La fréquence a changé : relancez le calcul.";
        simRendre(); simRepeindre();
      }
    });
}

/* La sélection a bougé — ou la carte. L'outil appelle, le panneau suit.

   `garderCarte` évite la boucle : l'outil appelle souvent depuis son propre
   rafraîchissement de panneaux, lui-même suivi d'un redessin. Vrai, on ne
   redemande pas de dessin — celui qui suit lira l'état de toute façon. */
let SIM_MINUTEUR=null;
function simRafraichir(garderCarte){
  /* Une famille sans analyse n'a rien à rafraîchir, et surtout rien à relancer
     en mode « suivre » : le panneau ne doit pas parler au serveur pendant qu'on
     regarde un onglet qui ne calcule pas. */
  if(!SIM.ouvert||!simCalculable())return;
  /* Un résultat porte sur UNE sélection. Dès qu'elle change, il ne vaut plus
     rien : on l'efface, plutôt que de peindre l'impédance d'une piste sur une
     autre. */
  const avait=!!SIM.res;
  SIM.res=null; SIM.objets=[];
  if(avait){SIM.err=""; simRendre();}
  /* La carte a peut-être changé : les candidats à la masse de référence avec
     elle. `simRefEcrire` relit la liste et remet la proposition en vigueur si
     ce n'est plus la même carte — c'est `simRefSet` qui le décide, ici on ne
     fait que réafficher. */
  simRefEcrire();
  if(!garderCarte)simRepeindre();

  /* En mode « suivre », on relance — mais après un court repos : déplacer la
     sélection à la souris déclenche des dizaines de rafraîchissements, et on
     n'envoie pas dix requêtes pour un geste. */
  if(!SIM.suivre||SIM.occupe)return;
  if(SIM_MINUTEUR)clearTimeout(SIM_MINUTEUR);
  SIM_MINUTEUR=setTimeout(function(){SIM_MINUTEUR=null;simGo();},180);
}
