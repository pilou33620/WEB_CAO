"use strict";
/* =============================================================================
   Éditeur PCB — 17-exemples.js
   Deux cartes routées, à ouvrir pour voir à quoi ressemble le travail fini.

   Pourquoi : l'éditeur schématique démarre sur un schéma de démonstration, le
   PCB sur une carte vide. Or ce qu'on cherche en ouvrant un routeur pour la
   première fois, ce n'est pas un canevas : c'est un exemple de ce qu'on est
   censé produire — où passent les alimentations, à quoi ressemble un plan de
   masse, ce que « paire différentielle » veut dire une fois posé en cuivre.

   Les deux cartes sont construites ici, en code, et non rangées en .json :
     · elles suivent les cotes réelles des empreintes (`padsWorld` donne le
       centre de chaque pastille, les pistes partent de là) — un boîtier qui
       changerait de cotes emmènerait le routage avec lui ;
     · elles se lisent : chaque piste est une suite de points commentée, pas un
       tableau de coordonnées ;
     · le banc d'essai les charge et leur passe le contrôle DRC. Un exemple qui
       ne serait plus routable, ou plus conforme aux règles, casse un essai
       plutôt que de tromper celui qui l'ouvre.

   Les deux cartes :
     1. « Commande 12 V » — 2 couches, le pendant du schéma de démonstration de
        l'éditeur schématique : régulateur, étage NPN, plan de masse au dos ;
     2. « Interface USB 2.0 » — 4 couches, une paire différentielle routée sur
        le dessus au-dessus d'un plan de masse continu, deux plans internes, et
        un bus SWD passé au dos par vias.
   ============================================================================= */

/* ==========================================================================
   Fabrique
   --------------------------------------------------------------------------
   De quoi écrire une carte comme on la décrirait à voix haute : une carte, des
   empreintes, des pistes qui passent par des points, des vias. Tout produit
   directement la forme d'un document (`docObj`) : `loadDoc` s'en charge
   ensuite, et sa normalisation vérifie tout ce qui sort d'ici comme si le
   fichier venait du disque.
   ========================================================================== */
/* Une carte vide : l'empilage demandé, le contour, les deux classes de net et
   les réglages d'usine. Le reste se remplit ensuite. */
function exDoc(cu,w,h){
  const D={format:"pcbedit-1",cu:cu,cuL:[],stack:stackDefaults(cu),
           show:Object.assign({},S.show),
           board:{x:0,y:0,w:w,h:h,pts:null},
           rule:{edge:0.4,thermal:0.5,mask:0.05,paste:0,viaFinish:"tented",
                 corner:"45",route:"shove",hole:0.25,mat:{},short:false,
                 aspWarn:ASPECT_WARN,aspMax:ASPECT_MAX},
           /* Deux classes, comme à l'ouverture de l'éditeur : les signaux au
              quart de millimètre, les alimentations un peu plus larges. */
           classes:[{name:"Défaut",      w:0.25,clr:0.2,via:0.6,drill:0.3},
                    {name:"Alimentation",w:0.4, clr:0.2,via:0.8,drill:0.4}],
           netClass:{},dpPairs:[],dpRules:[],
           origin:{x:0,y:0},fabOrigin:false,
           fps:[],tracks:[],vias:[],zones:[],cuts:[],
           active:0,nextId:1};
  for(let i=0;i<cu;i++)
    D.cuL.push({name:cuLabel(i,cu),custom:false,color:cuColor(i,cu),
                vis:true,plane:false,net:"",role:"signal"});
  return D;
}
/* Rattache des nets à la classe « Alimentation ». */
function exPower(D,nets){
  for(const n of nets)D.netClass[n]="Alimentation";
}
/* Une couche de cuivre entière donnée à un net : c'est le rôle de couche de
   l'éditeur, plus la zone pleine carte qui l'accompagne. Les deux vont
   ensemble — `loadDoc` défait un rôle qui n'aurait pas sa zone. */
function exPlane(D,i,role,net){
  const L=D.cuL[i];
  L.role=role;L.plane=true;L.net=net;
  D.zones.push({id:D.nextId++,l:i,net:net,auto:true,
                pts:[{x:D.board.x,y:D.board.y},
                     {x:D.board.x+D.board.w,y:D.board.y},
                     {x:D.board.x+D.board.w,y:D.board.y+D.board.h},
                     {x:D.board.x,y:D.board.y+D.board.h}]});
}
/* Une empreinte. Le boîtier fixe le style et les cotes, comme à l'import d'une
   netlist ; `pads` les remplace par un dessin explicite quand le boîtier n'est
   pas dans la table (un connecteur USB, par exemple). */
function exFp(D,o){
  const g=fpGeomFor(o.pkg||"",o.pins||2);
  const fp={id:D.nextId++,ref:o.ref,value:o.val||"",pkg:o.pkg||"",
            pins:o.pins||g.pins,style:o.style||g.style,
            pitch:o.pitch||g.pitch,span:o.span||g.span,
            x:o.x,y:o.y,rot:o.rot||0,side:0,nets:o.nets||{}};
  if(o.pads)fp.pads=o.pads;
  if(o.body)fp.body=o.body;
  D.fps.push(fp);
  return fp;
}
/* Le centre d'une pastille, en coordonnées carte : c'est de là que part une
   piste, et c'est ce point-là que la connectivité compare au micron. */
function exPin(fp,n){
  const q=padsWorld(fp).find(p=>p.n===n);
  if(!q)throw new Error("exemple : "+fp.ref+" n'a pas de broche "+n);
  return {x:q.x,y:q.y};
}
/* Une piste qui passe par une suite de points. Chaque tronçon passe par la
   géométrie du tracé (`routeCorner`) : les points donnés tombent déjà sur les
   huit sens, et ce qui ne tomberait pas juste devient un coude à 45° au lieu
   d'un angle bâtard. */
function exWire(D,l,net,w,pts){
  for(let i=0;i<pts.length-1;i++)
    for(const s of routeCorner(pts[i],pts[i+1],true,"45",0))
      D.tracks.push({l:l,net:net,w:w,
                     x1:r3(s.x1),y1:r3(s.y1),x2:r3(s.x2),y2:r3(s.y2)});
}
/* Un via traversant, aux cotes de la classe du net. */
function exVia(D,x,y,net,d,drill){
  D.vias.push({x:r3(x),y:r3(y),d:d,drill:drill,a:0,b:D.cu-1,net:net});
}
/* Une piste qui finit sur un via : le geste le plus courant d'une carte
   multicouche — sortir d'une pastille et descendre au plan. */
function exStub(D,l,net,w,pts,d,drill){
  exWire(D,l,net,w,pts);
  const e=pts[pts.length-1];
  exVia(D,e.x,e.y,net,d,drill);
}
/* --------------------------------------------------------------------------
   Une paire différentielle posée d'un bout à l'autre
   L'axe est donné une fois ; les deux pistes s'en déduisent par décalage à
   onglet (`dpOffset`), exactement comme le fait l'outil de tracé couplé. Les
   amorces — de la pastille à l'entrée de l'axe — reprennent `dpLeg`, la même
   jambe à 45° que le routeur pose pour ouvrir l'éventail.
   `aP`/`aN` sont les pastilles de départ, `bP`/`bN` celles d'arrivée.
   -------------------------------------------------------------------------- */
function exPair(D,l,pair,w,gap,axe,aP,aN,bP,bN){
  const P=dpOffset(axe,gap/2+w/2), N=dpOffset(axe,-(gap/2+w/2));
  const pose=(net,pts,a,b)=>{
    const all=[a].concat(pts,[b]);
    for(let i=0;i<all.length-1;i++)
      for(const s of dpLeg(all[i],all[i+1]))
        D.tracks.push({l:l,net:net,w:w,
                       x1:r3(s.x1),y1:r3(s.y1),x2:r3(s.x2),y2:r3(s.y2)});
  };
  pose(pair.p,P,aP,bP);
  pose(pair.n,N,aN,bN);
}

/* ==========================================================================
   Exemple 1 — « Commande 12 V », 2 couches
   --------------------------------------------------------------------------
   C'est la carte du schéma de démonstration de l'éditeur schématique : un
   régulateur 12 V → 5 V et l'étage de commande NPN, sur un rectangle de
   50 × 32 mm. Deux couches, et la seconde entièrement donnée à la masse.

   Ce qu'elle montre :
     · le plan de masse au dos — aucune piste de masse ne traverse la carte,
       chaque broche descend au plan par son via, et les pastilles traversantes
       des borniers y touchent sans rien de plus ;
     · deux largeurs de piste : 0,4 mm pour les alimentations, 0,25 mm pour les
       signaux — c'est ce que disent les deux classes de net ;
     · le 12 V qui rejoint la résistance de collecteur en longeant le bord de
       la carte : deux nets ne peuvent pas se croiser sur la même couche, et
       sur deux couches dont l'une est un plan, contourner vaut mieux que
       percer le plan d'un couloir de vias.
   ========================================================================== */
function exemple1(){
  const D=exDoc(2,50,32);
  exPower(D,["12V","+5V","GND"]);
  exPlane(D,1,"gnd","GND");
  const W=0.4, S1=0.25;              // largeurs : alimentation, signal
  const VD=0.8, VF=0.4;              // via d'alimentation : rondelle, perçage

  /* ---------- les composants ---------- */
  const J1=exFp(D,{ref:"J1",val:"Entrée 12 V",pins:3,x:5,y:16,rot:90,
                   nets:{1:"12V",2:"GND",3:"EN"}});
  const C1=exFp(D,{ref:"C1",val:"10µ",pkg:"1206",x:8,y:14,rot:90,
                   nets:{1:"12V",2:"GND"}});
  const U1=exFp(D,{ref:"U1",val:"AMS1117-5.0",pkg:"SOT-223-4",pins:4,x:14,y:11,
                   nets:{1:"12V",2:"GND",3:"+5V",4:"+5V"}});
  const C2=exFp(D,{ref:"C2",val:"22µ",pkg:"1206",x:22,y:11,rot:90,
                   nets:{1:"+5V",2:"GND"}});
  const R2=exFp(D,{ref:"R2",val:"1k",pkg:"0603",x:12,y:20.5,
                   nets:{1:"EN",2:"BASE_Q3"}});
  const Q3=exFp(D,{ref:"Q3",val:"MMBT5551",pkg:"SOT-23",pins:3,x:18,y:22,
                   nets:{1:"BASE_Q3",2:"GND",3:"SORTIE"}});
  const R3=exFp(D,{ref:"R3",val:"100k",pkg:"0603",x:14,y:25,rot:90,
                   nets:{1:"BASE_Q3",2:"GND"}});
  const R1=exFp(D,{ref:"R1",val:"100k",pkg:"0603",x:24.75,y:25,rot:90,
                   nets:{1:"SORTIE",2:"12V"}});
  const J2=exFp(D,{ref:"J2",val:"Sortie",pins:3,x:45,y:16,rot:90,
                   nets:{1:"+5V",2:"GND",3:"SORTIE"}});

  /* ---------- 12 V : bornier → condensateur → régulateur ---------- */
  exWire(D,0,"12V",W,[exPin(J1,1),{x:6.01,y:12.45},{x:7,y:12.45},exPin(C1,1)]);
  exWire(D,0,"12V",W,[{x:7,y:12.45},{x:9.6,y:9.85},exPin(U1,1)]);
  /* … et le même 12 V jusqu'à la résistance de collecteur, par le bord : le
     chemin direct couperait la sortie 5 V et le collecteur. */
  exWire(D,0,"12V",W,[exPin(J1,1),{x:3,y:15.46},{x:3,y:28},{x:4,y:29},
                      {x:23.75,y:29},{x:24.75,y:28},exPin(R1,2)]);

  /* ---------- 5 V : les deux pastilles de sortie, le condensateur, le bornier ---------- */
  exWire(D,0,"+5V",W,[exPin(U1,3),{x:19,y:12.15},{x:19,y:11},{x:19,y:9.85},
                      exPin(U1,4)]);
  exWire(D,0,"+5V",W,[{x:19,y:11},{x:20.55,y:9.45},exPin(C2,1)]);
  exWire(D,0,"+5V",W,[exPin(C2,1),{x:23.45,y:8},{x:39.54,y:8},exPin(J2,1)]);

  /* ---------- l'étage NPN ---------- */
  exWire(D,0,"EN",S1,[exPin(J1,3),{x:9.29,y:18.54},exPin(R2,1)]);
  exWire(D,0,"BASE_Q3",S1,[exPin(R2,2),{x:14,y:20.5},{x:15.675,y:20.5},
                           exPin(Q3,1)]);
  exWire(D,0,"BASE_Q3",S1,[{x:14,y:20.5},exPin(R3,1)]);
  exWire(D,0,"SORTIE",S1,[exPin(Q3,3),{x:21,y:22},{x:22.5,y:22},exPin(R1,1)]);
  exWire(D,0,"SORTIE",S1,[{x:21,y:22},{x:23,y:20},{x:39.54,y:20},
                          {x:41,y:18.54},exPin(J2,3)]);

  /* ---------- masse : chaque pastille CMS descend au plan ----------
     Les borniers, eux, sont traversants : leur pastille touche déjà le plan du
     dos, il n'y a rien à router. */
  exStub(D,0,"GND",W,[exPin(C1,2),{x:8,y:17.2}],VD,VF);
  exStub(D,0,"GND",W,[exPin(U1,2),{x:10.85,y:13.8}],VD,VF);
  exStub(D,0,"GND",W,[exPin(C2,2),{x:22,y:14.2}],VD,VF);
  exStub(D,0,"GND",W,[exPin(R3,2),{x:14,y:27.4}],VD,VF);
  exStub(D,0,"GND",W,[exPin(Q3,2),{x:15.55,y:23.625}],VD,VF);
  return D;
}

/* ==========================================================================
   Exemple 2 — « Interface USB 2.0 », 4 couches
   --------------------------------------------------------------------------
   Un connecteur USB micro-B, un régulateur 3,3 V, un microcontrôleur en
   TQFP-32 et un connecteur de programmation, sur 60 × 40 mm. L'empilage est
   celui d'usine : signal / masse / alimentation / signal.

   Ce qu'elle montre :
     · les deux couches internes données entièrement à un net — masse en L2,
       3,3 V en L3. Une broche d'alimentation ne se route plus : elle sort de
       sa pastille et descend au plan par un via, en trois dixièmes de
       millimètre. C'est tout l'intérêt des quatre couches, et c'est pour cela
       que les découplages tiennent en deux vias chacun ;
     · **la paire différentielle USB**, tracée sur le dessus, du connecteur au
       microcontrôleur : 0,25 mm de piste, 0,15 mm d'écart, tenus d'un bout à
       l'autre. Elle ne change pas de couche — le plan de masse de L2 lui sert
       de référence sur toute sa longueur, et un via de plus casserait ce
       couplage ; les seuls écarts sont les deux éventails, là où les pistes
       s'ouvrent pour rejoindre des pastilles plus écartées que la paire ;
     · la règle de paire qui va avec, visible dans la fenêtre « Règles… » :
       profil D90, largeur et écart bornés, longueur découplée admise ;
     · un bus SWD passé au dos par deux vias, pour montrer qu'une couche
       extérieure sert encore au signal quand les internes sont prises.
   ========================================================================== */
function exemple2(){
  const D=exDoc(4,60,40);
  exPower(D,["+5V","+3V3","GND"]);
  exPlane(D,1,"gnd","GND");
  exPlane(D,2,"pwr","+3V3");
  const W=0.4, S1=0.25;
  const VD=0.8, VF=0.4;              // via d'alimentation
  const vd=0.6, vf=0.3;              // via de signal
  const TOP=0, BOT=3;

  /* La paire et sa règle. Le couple largeur/écart tient les 90 Ω différentiels
     de l'USB 2.0 sur le diélectrique extérieur de cet empilage ; la fenêtre des
     règles affiche l'impédance calculée en regard du profil demandé. */
  D.dpPairs.push({id:D.nextId++,name:"USB",p:"USB_DP",n:"USB_DM"});
  D.dpRules.push({name:"USB 2.0 — 90 Ω",comment:"Paire du connecteur au microcontrôleur",
                  uid:"USBDIFFP",scope:"USB",allLayers:true,
                  minW:0.2,prefW:0.25,maxW:0.35,
                  minGap:0.13,prefGap:0.15,maxGap:0.4,
                  maxUncoupled:12.7,useImp:true,imp:"D90",layers:{}});

  /* ---------- les composants ----------
     Le connecteur n'est pas dans la table des boîtiers : ses sept pastilles
     sont dessinées à la main — cinq contacts au pas de 0,65 mm et deux pattes
     de blindage. La broche 4 (ID) reste en l'air : c'est ainsi qu'on câble un
     port périphérique. */
  const J1=exFp(D,{ref:"J1",val:"USB micro-B",pkg:"USB-MICRO-B",style:"chip",
                   pins:7,x:7,y:20,
                   nets:{1:"+5V",2:"USB_DM",3:"USB_DP",5:"GND",6:"GND",7:"GND"},
                   body:{x1:-1.6,y1:-4.6,x2:1,y2:4.6},
                   pads:[{n:1,x:0,y:-1.3,w:1.4,h:0.4,shape:"rect",drill:0},
                         {n:2,x:0,y:-0.65,w:1.4,h:0.4,shape:"rect",drill:0},
                         {n:3,x:0,y:0,w:1.4,h:0.4,shape:"rect",drill:0},
                         {n:4,x:0,y:0.65,w:1.4,h:0.4,shape:"rect",drill:0},
                         {n:5,x:0,y:1.3,w:1.4,h:0.4,shape:"rect",drill:0},
                         {n:6,x:-0.6,y:-3.6,w:1.8,h:1.4,shape:"rect",drill:0},
                         {n:7,x:-0.6,y:3.6,w:1.8,h:1.4,shape:"rect",drill:0}]});
  const U3=exFp(D,{ref:"U3",val:"AP2112K-3.3",pkg:"SOT-23-5",pins:5,x:14,y:10,
                   nets:{1:"+5V",2:"GND",3:"+5V",5:"+3V3"}});
  const C1=exFp(D,{ref:"C1",val:"10µ",pkg:"0805",x:8.05,y:13.7,rot:270,
                   nets:{1:"+5V",2:"GND"}});
  const C2=exFp(D,{ref:"C2",val:"1µ",pkg:"0603",x:18.525,y:13.5,rot:90,
                   nets:{1:"+3V3",2:"GND"}});
  const U1=exFp(D,{ref:"U1",val:"MCU",pkg:"TQFP-32",pins:32,x:40,y:20,
                   nets:{1:"+3V3",4:"USB_DM",5:"USB_DP",8:"GND",
                         17:"+3V3",20:"SWDIO",21:"SWCLK",24:"GND"}});
  const C3=exFp(D,{ref:"C3",val:"100n",pkg:"0402",x:32,y:14,rot:90,
                   nets:{1:"+3V3",2:"GND"}});
  const C4=exFp(D,{ref:"C4",val:"100n",pkg:"0402",x:47,y:26,rot:90,
                   nets:{1:"+3V3",2:"GND"}});
  const J2=exFp(D,{ref:"J2",val:"SWD",pins:4,x:50,y:32,
                   nets:{1:"+3V3",2:"SWDIO",3:"SWCLK",4:"GND"}});

  /* ---------- 5 V : du connecteur au régulateur ---------- */
  exWire(D,TOP,"+5V",W,[exPin(J1,1),{x:8.05,y:17.65},{x:8.05,y:17},
                        exPin(C1,1)]);
  exWire(D,TOP,"+5V",W,[{x:8.05,y:17},{x:11,y:14.05},{x:11,y:10.95},
                        {x:11,y:9.05},exPin(U3,1)]);
  exWire(D,TOP,"+5V",W,[{x:11,y:10.95},exPin(U3,3)]);   // EN tenu à l'entrée

  /* ---------- 3,3 V : la sortie du régulateur, son condensateur, le plan ---------- */
  exWire(D,TOP,"+3V3",W,[exPin(U3,5),{x:16.5,y:9.525},{x:18.525,y:11.55},
                         exPin(C2,1)]);
  exStub(D,TOP,"+3V3",W,[exPin(C2,1),{x:20.5,y:12.75}],VD,VF);
  /* Au-delà, le 3,3 V ne se route plus : il est dans le plan L3, et chaque
     broche qui en veut y descend par un via. */
  exStub(D,TOP,"+3V3",W,[exPin(U1,1),{x:34,y:17.2}],VD,VF);
  exStub(D,TOP,"+3V3",W,[exPin(U1,17),{x:46,y:22.8}],VD,VF);
  exStub(D,TOP,"+3V3",W,[exPin(C3,1),{x:32,y:12.5}],VD,VF);
  exStub(D,TOP,"+3V3",W,[exPin(C4,1),{x:47,y:24.5}],VD,VF);

  /* ---------- masse : même chose vers le plan L2 ---------- */
  exStub(D,TOP,"GND",W,[exPin(J1,5),{x:8.6,y:22.9}],VD,VF);
  exStub(D,TOP,"GND",W,[exPin(J1,6),{x:6.4,y:14.8}],VD,VF);
  exStub(D,TOP,"GND",W,[exPin(J1,7),{x:6.4,y:25.2}],VD,VF);
  exStub(D,TOP,"GND",W,[exPin(C1,2),{x:8.05,y:11.35}],VD,VF);
  exStub(D,TOP,"GND",W,[exPin(U3,2),{x:13.9,y:10},{x:13.9,y:11.8}],VD,VF);
  exStub(D,TOP,"GND",W,[exPin(C2,2),{x:18.525,y:16}],VD,VF);
  exStub(D,TOP,"GND",W,[exPin(U1,8),{x:34,y:22.8}],VD,VF);
  exStub(D,TOP,"GND",W,[exPin(U1,24),{x:46,y:17.2}],VD,VF);
  exStub(D,TOP,"GND",W,[exPin(C3,2),{x:32,y:15.5}],VD,VF);
  exStub(D,TOP,"GND",W,[exPin(C4,2),{x:47,y:27.5}],VD,VF);

  /* ---------- la paire différentielle ----------
     L'axe part à 0,325 mm au-dessus des deux pastilles du connecteur, traverse
     la carte tout droit, et se relève d'un coude à 45° pour arriver dans l'axe
     des deux broches du microcontrôleur. Les deux pistes suivent, décalées de
     part et d'autre au demi-pas ; les éventails se font tout seuls. */
  exPair(D,TOP,D.dpPairs[0],0.25,0.15,
         [{x:9,y:19.675},{x:31,y:19.675},{x:31.325,y:20},{x:33.4,y:20}],
         exPin(J1,3),exPin(J1,2),exPin(U1,5),exPin(U1,4));

  /* ---------- SWD : deux vias, et la fin du trajet au dos ---------- */
  exStub(D,TOP,"SWDIO",S1,[exPin(U1,20),{x:46.4,y:20.4}],vd,vf);
  exStub(D,TOP,"SWCLK",S1,[exPin(U1,21),{x:47.6,y:19.6}],vd,vf);
  exWire(D,BOT,"SWDIO",S1,[{x:46.4,y:20.4},{x:48.73,y:22.73},exPin(J2,2)]);
  exWire(D,BOT,"SWCLK",S1,[{x:47.6,y:19.6},{x:51.27,y:23.27},exPin(J2,3)]);
  return D;
}

/* ==========================================================================
   Le catalogue, et la fenêtre qui l'ouvre
   ========================================================================== */
const EXEMPLES=[
  {titre:"Commande 12 V — 2 couches",
   sous:"50 × 32 mm · 9 empreintes · plan de masse au dos",
   texte:"La carte du schéma de démonstration de l'éditeur schématique : "+
         "régulateur 12 V → 5 V, étage de commande NPN, bornier d'entrée et "+
         "bornier de sortie.",
   points:["Toute la couche du dessous donnée à la masse : chaque pastille CMS "+
           "y descend par son via, les pastilles traversantes des borniers y "+
           "touchent sans rien de plus.",
           "Deux classes de net : 0,4 mm pour les alimentations, 0,25 mm pour "+
           "les signaux.",
           "Le 12 V du collecteur passe par le bord de la carte : sur deux "+
           "couches dont l'une est un plan, on contourne plutôt que de croiser."],
   build:exemple1},
  {titre:"Interface USB 2.0 — 4 couches",
   sous:"60 × 40 mm · paire différentielle · plans masse et 3,3 V",
   texte:"Connecteur USB micro-B, régulateur 3,3 V, microcontrôleur TQFP-32 et "+
         "connecteur de programmation, sur l'empilage d'usine signal / masse / "+
         "alimentation / signal.",
   points:["La paire USB tracée sur le dessus, 0,25 mm de piste et 0,15 mm "+
           "d'écart tenus d'un bout à l'autre, sans changement de couche : le "+
           "plan de masse de L2 lui sert de référence sur toute sa longueur.",
           "Sa règle de paire est dans la fenêtre « Règles… » — profil D90, "+
           "largeur et écart bornés, longueur découplée admise.",
           "Les alimentations ne se routent plus : deux couches internes "+
           "entières, et un via par broche pour y descendre.",
           "Le bus SWD passe au dos par deux vias : une couche extérieure sert "+
           "encore au signal quand les internes sont prises."],
   build:exemple2}
];

/* Charge un exemple. Comme « Nouveau », il remplace la carte en cours : on
   demande, sauf s'il n'y a rien à perdre. */
function exCharger(i){
  const ex=EXEMPLES[i];
  if(!ex)return false;
  if(S.fps.length&&
     !confirm("Ouvrir l'exemple « "+ex.titre+" » ? La carte en cours sera perdue."))
    return false;
  push();
  loadDoc(ex.build());
  S.dirty=false;                     // un exemple n'est pas un travail à perdre
  fit();
  hint("Exemple « "+ex.titre+" » ouvert. Contrôle DRC, fenêtre des règles, "+
       "fabrication : tout marche dessus comme sur une carte à vous.");
  return true;
}
function exOuvrir(){
  const m=document.createElement("div");
  m.className="modal";
  const carte=(ex,i)=>
    '<div class="ex-carte"><h4>'+esc(ex.titre)+'</h4>'+
    '<div class="ex-sous">'+esc(ex.sous)+'</div>'+
    '<p>'+esc(ex.texte)+'</p><ul>'+
    ex.points.map(p=>'<li>'+esc(p)+'</li>').join("")+
    '</ul><button class="tb on" data-ex="'+i+'">Ouvrir cet exemple</button></div>';
  m.innerHTML='<div class="box ex"><h3>Exemples de routage</h3>'+
    '<p>Deux cartes finies, à ouvrir pour voir le travail plutôt que de le '+
    'décrire. Elles s\'annulent (Ctrl+Z) et s\'enregistrent comme n\'importe '+
    'quelle carte.</p>'+
    EXEMPLES.map(carte).join("")+
    '<div class="row"><button class="tb" id="exCancel">Fermer</button></div></div>';
  document.body.appendChild(m);
  const close=()=>m.remove();
  m.onclick=e=>{if(e.target===m)close();};
  $("exCancel").onclick=close;
  for(const b of m.querySelectorAll("[data-ex]"))
    b.onclick=()=>{const i=+b.dataset.ex;close();exCharger(i);};
}
if($("bExemples"))$("bExemples").onclick=exOuvrir;
