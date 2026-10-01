/* =============================================================================
   commun/tuto.js — mode tuto de la suite
   L'interrupteur « 🎓 Mode tuto » est sur l'accueil, pas dans les modes :
     · coché, chaque carte de l'accueil ouvre son mode avec sa visite guidée
       (adresse en ?tuto) ; « Parcours complet » ouvre le premier, et la
       dernière étape de chaque visite mène au mode suivant ;
     · tant qu'il est coché, des pastilles « ? » se posent sur les grandes
       fonctions visibles de chaque mode (menus ouverts compris) : le survol
       redonne l'explication de la visite.
   Les étapes de chaque mode sont ici, choisies par <script data-outil="…">.
   Une étape : sel (élément visé), menu (menu à ouvrir d'abord), faire (action
   avant d'afficher, ex. ouvrir l'exemple), titre, texte (HTML statique).
   ============================================================================= */
(function tutoInit(){
  const outil=(document.currentScript&&document.currentScript.dataset.outil)||"";
  const CLE="cao.tuto";
  const lire=()=>{try{return localStorage.getItem(CLE)==="1";}catch(e){return false;}};
  const ecrire=v=>{try{localStorage.setItem(CLE,v?"1":"0");}catch(e){}};

  /* L'ordre du parcours, celui des cartes de l'accueil. */
  const PARCOURS=[
    {outil:"schema",    titre:"Éditeur schématique",     page:"editeur-schematique/editeur-schematique.html"},
    {outil:"pcb",       titre:"Éditeur PCB",             page:"editeur-pcb/editeur-pcb.html"},
    {outil:"composants",titre:"Recherche de composants", page:"recherche-composants/recherche-composants.html"},
    {outil:"lib",       titre:"Gestion LIB",             page:"gestion-lib/gestion-lib.html"},
    {outil:"ipc2581",   titre:"Visionneuse IPC-2581",    page:"visionneuse-ipc2581/visionneuse-ipc2581.html"}
  ];

  /* ---------------- accueil : l'interrupteur ---------------- */
  if(outil==="accueil"){
    const bouton=document.getElementById("tutoBascule"), tout=document.getElementById("tutoParcours");
    const cartes=PARCOURS.map(p=>document.querySelector('.actions a[href="'+p.page+'"]'));
    function montrer(v){
      bouton.classList.toggle("on",v);bouton.setAttribute("aria-pressed",v);
      tout.hidden=!v;
      document.querySelector(".actions").classList.toggle("tuto-on",v);
      cartes.forEach((a,k)=>{if(a)a.href=PARCOURS[k].page+(v?"?tuto":"");});
    }
    bouton.onclick=()=>{const v=!lire();ecrire(v);montrer(v);};
    tout.onclick=()=>{location.href=PARCOURS[0].page+"?tuto";};
    montrer(lire());
    return;
  }

  const lib=n=>()=>{const b=document.querySelector('.tab-btn[data-tab="'+n+'"]');if(b)b.click();};
  const ETAPES={
    schema:[
      {titre:"Bienvenue dans l'éditeur schématique",
       texte:"On ouvre l'exemple <b>Interface IoT</b> : un schéma hiérarchique sur plusieurs feuilles, raccordé à la carte d'exemple du PCB. <kbd>Ctrl+Z</kbd> défait tout.",
       faire:()=>typeof schChargerExemple==="function"&&schChargerExemple(0)},
      {sel:"#tabs",titre:"Les feuilles",
       texte:"La première feuille est la hiérarchie, les suivantes les blocs. Un double-clic sur un bloc ouvre sa feuille."},
      {sel:'[data-pnl="palette"]',titre:"Bibliothèque",
       texte:"Clic sur un composant puis clic sur la feuille pour le poser. <kbd>A</kbd> ouvre la recherche dans toute la LIB."},
      {sel:"#mWire",menu:"placer",titre:"Câbler",
       texte:"<kbd>W</kbd>, puis clic de broche à broche. Un fil qui touche une broche s'y connecte ; le net prend le nom de son étiquette."},
      {sel:"#mBus",menu:"placer",titre:"Bus",
       texte:"<kbd>B</kbd> trace un bus : plusieurs signaux (SPI, données) dans un seul trait épais."},
      {sel:"#sheet",titre:"La feuille",
       texte:"Les étiquettes de net relient sans fil ; les sondes affichent tension et courant calculés. Survolez un fil pour voir tout son net s'allumer."},
      {sel:'[data-pnl="list"]',titre:"Nomenclature et nets",
       texte:"La BOM se tient à jour toute seule ; l'onglet <b>Nets</b> liste chaque net et ses broches."},
      {sel:"#bPatterns",menu:"outils",titre:"Motifs & blocs",
       texte:"Reconnaît alimentations, bus rapides, filtres… et qualifie les nets pour les règles du PCB."},
      {sel:"#bProbe",menu:"outils",titre:"Montrer au PCB",
       texte:"<kbd>L</kbd> : le PCB ouvert dans un autre onglet saute sur la sélection. Le PCB fait de même vers le schéma."},
      {sel:"#bNetlist",menu:"fichier",titre:"Passer au PCB",
       texte:"La netlist est ce que l'éditeur PCB importe : c'est la suite du parcours."}
    ],
    pcb:[
      {titre:"Bienvenue dans l'éditeur PCB",
       texte:"On ouvre la carte d'exemple <b>Interface IoT 4 couches</b> : paire différentielle USB, bus SPI, ligne RF 50 Ω. Tout ce qui suit marche dessus comme sur une carte à vous, et <kbd>Ctrl+Z</kbd> défait tout.",
       faire:()=>typeof exCharger==="function"&&exCharger(1)},
      {sel:"#board",titre:"La carte",
       texte:"Molette : zoom. Clic droit glissé ou espace : déplacer. Clic : sélectionner. Les traits fins entre pastilles forment le <b>chevelu</b> : ce qui reste à router."},
      {sel:"#tabs",titre:"Couches cuivre",
       texte:"Un onglet par couche. Le clic choisit la couche active, celle où se posent les pistes. Ici L2 est un plan de masse, L3 le +3,3 V."},
      {sel:'[data-pnl="stack"]',titre:"Empilage",
       texte:"Afficher ou masquer chaque couche, cuivre et technique (sérigraphie, masque, DRC). Le nombre de couches se change ici."},
      {sel:"#bImport",menu:"fichier",titre:"Partir du schéma",
       texte:"Le point de départ habituel : importer la netlist exportée par l'éditeur schématique. <b>Schéma ↔ PCB</b> remet ensuite la carte à jour sans perdre le routage."},
      {sel:"#mTrack",menu:"placer",titre:"Router une piste",
       texte:"<kbd>T</kbd>, clic sur une pastille, puis clic à clic. Les pistes voisines <b>s'écartent</b> (Push & Shove) au lieu de bloquer. <kbd>V</kbd> pendant le tracé pose un via."},
      {sel:"#mDiff",menu:"placer",titre:"Paire différentielle",
       texte:"<kbd>P</kbd> route les deux nets d'une paire (USB D+/D−) ensemble, écart tenu. <b>Serpentin</b> égalise ensuite leurs longueurs."},
      {sel:"#mZone",menu:"placer",titre:"Zone de cuivre",
       texte:"<kbd>Z</kbd> dessine un polygone rempli, rattaché à un net (souvent GND). Il contourne tout seul les autres nets."},
      {sel:"#bDrc",menu:"outils",titre:"Contrôle DRC",
       texte:"Vérifie isolations, largeurs, perçages, bord de carte. Les erreurs s'allument sur la carte et se listent dans le panneau <b>DRC</b>."},
      {sel:"#bRules",menu:"outils",titre:"Règles",
       texte:"Classes de net, largeurs, vias, paires différentielles : chaque règle avec sa figure cotée. Le profil fabricant (JLCPCB…) donne les minimums."},
      {sel:"#bFab",menu:"fichier",titre:"Fabrication",
       texte:"Un .zip prêt à envoyer : Gerber, perçage, IPC-D-356, nomenclature, positions et plan PDF."},
      {sel:"#fHint",titre:"La barre d'état",
       texte:"Elle dit toujours quoi faire ensuite pour l'outil actif."}
    ],
    composants:[
      {titre:"Bienvenue dans la recherche de composants",
       texte:"Stocks et prix JLCPCB, équivalences, brochages et empreintes KiCad, interrogés via <b>pcbparts.dev</b>. Il faut le serveur : <kbd>python web_CAO.py</kbd>."},
      {sel:'[data-pnl="outils"]',titre:"Les outils de recherche",
       texte:"Recherche par paramètres, équivalents, brochage, modèles CAO… Le clic choisit l'outil, le formulaire s'adapte."},
      {sel:"#form",titre:"Le formulaire",
       texte:"Les champs de l'outil choisi. <kbd>Entrée</kbd> lance la recherche, <b>Réinitialiser</b> vide tout."},
      {sel:"#resultats",titre:"Les résultats",
       texte:"Référence, stock, prix, boîtier. Un clic sur une ligne ouvre son détail."},
      {sel:'[data-pnl="details"]',titre:"Le détail",
       texte:"Caractéristiques, datasheet, empreinte : de quoi décider avant de l'ajouter à la LIB."},
      {sel:"#bBack",titre:"Précédent",
       texte:"Revient au résultat d'avant : on peut suivre une piste d'équivalences et revenir sur ses pas."},
      {sel:"#bCsv",titre:"Exporter",
       texte:"La liste en .csv (tableur) ou .json, telle qu'affichée."},
      {sel:"#bApi",titre:"Le serveur",
       texte:"L'adresse du serveur de recherche. La barre d'état dit s'il répond."}
    ],
    lib:[
      {titre:"Bienvenue dans la gestion LIB",
       texte:"Le catalogue <b>LIB_composants.csv</b> partagé par le schéma et le PCB, avec ses empreintes, symboles et modèles de simulation. Il faut le serveur : <kbd>python web_CAO.py</kbd>."},
      {sel:".nav-tabs",titre:"Quatre vues",faire:lib("composants"),
       texte:"Catalogue, empreintes PCB, symboles schématiques, modèles SPICE. Les pastilles comptent ce que chaque vue contient."},
      {sel:".stats-band",titre:"Associations",faire:lib("composants"),
       texte:"Un composant sans empreinte ou sans symbole ne passera pas du schéma au PCB : ces taux disent ce qui manque."},
      {sel:"#searchComp",titre:"Chercher",faire:lib("composants"),
       texte:"Par référence, valeur, boîtier, fabricant… Les filtres préfixe et statut sont à côté."},
      {sel:"#inspectorPanel",titre:"L'inspecteur",faire:lib("composants"),
       texte:"Clic sur une ligne du catalogue : son symbole et son empreinte s'affichent ici."},
      {sel:"#viewPcb",titre:"Empreintes",faire:lib("pcb"),
       texte:"Chaque carte s'ouvre dans l'éditeur : pastilles, sérigraphie, générateur de boîtiers standards."},
      {sel:"#bImportJlc",titre:"Importer JLCPCB / LCSC",faire:lib("composants"),
       texte:"Un numéro LCSC suffit : symbole, empreinte et ligne de catalogue arrivent ensemble."},
      {sel:"#bAutoAssoc",titre:"Auto-associer",
       texte:"Relie empreintes et symboles aux composants d'après leur préfixe et leur boîtier."},
      {sel:"#bSave",titre:"Enregistrer",
       texte:"Écrit le catalogue sur le disque. Ouvert depuis le réseau, la LIB est en lecture seule."},
      {sel:"#bModeIaLib",titre:"Assistant IA LIB",
       texte:"Demandez une empreinte ou un symbole à partir d'une datasheet, ou une correction."}
    ],
    ipc2581:[
      {titre:"Bienvenue dans la visionneuse IPC-2581",
       texte:"Pour ouvrir la carte que livre le fabricant (.xml, .cvg, .zip) : couches, empilage, nets, composants, et simulation SI/PI. La lecture se fait sur le serveur."},
      {sel:"#depot",titre:"Ouvrir une carte",
       texte:"Glissez le fichier ici ou cliquez sur <b>Ouvrir</b>. Un .json exporté d'ici se rouvre même sans serveur."},
      {sel:'[data-pnl="couches"]',titre:"Couches",
       texte:"Cocher, décocher, <b>Cuivre seul</b> : on regarde une couche à la fois."},
      {sel:'[data-pnl="carte"]',titre:"La carte",
       texte:"Dimensions, empilage, matériaux et épaisseurs déclarés par le fabricant."},
      {sel:'[data-pnl="nets"]',titre:"Nets",
       texte:"Filtrer par nom ou par classe ; un clic met le net en évidence sur la carte."},
      {sel:'[data-pnl="composants"]',titre:"Composants",
       texte:"Par repère, valeur ou boîtier ; un clic le montre sur la carte."},
      {sel:"#bFlip",titre:"Regarder la carte",
       texte:"<kbd>B</kbd> dessous, <kbd>R</kbd> repères, <kbd>D</kbd> perçages, <kbd>P</kbd> plans, <kbd>F</kbd> ajuster, <kbd>M</kbd> mesurer."},
      {sel:"#bClasserNets",titre:"Classer les nets",
       texte:"PWR, GND ou signal : la classe prépare les réglages de simulation."},
      {sel:"#bSim",titre:"Simulation EM",
       texte:"Impédance, diaphonie, chemin de retour, chute DC, PDN : le calcul tourne sur le serveur."},
      {sel:"#bIaAssistant",titre:"Assistant IA",
       texte:"Il lit les datasheets et propose les réglages de simulation, valeur par valeur, avec la page d'où ils viennent."}
    ]
  };
  const etapes=ETAPES[outil];
  if(!etapes)return;
  const rang=PARCOURS.findIndex(p=>p.outil===outil), suivant=PARCOURS[rang+1];

  let actif=lire(), i=-1;
  const el=(tag,cls,html)=>{const e=document.createElement(tag);e.className=cls;if(html)e.innerHTML=html;return e;};
  const spot=el("div","tuto-spot"), bulle=el("div","tuto-bulle"), info=el("div","tuto-info");
  const calque=el("div","tuto-calque");
  document.body.append(calque,spot,bulle,info);
  bulle.hidden=spot.hidden=calque.hidden=info.hidden=true;

  const visible=e=>{if(!e)return false;const r=e.getBoundingClientRect();return r.width>0&&r.height>0;};
  function menu(nom){
    const m=nom&&document.querySelector('.mnu[data-mnu="'+nom+'"]');
    for(const o of document.querySelectorAll(".mnu.open"))
      if(o!==m)o.querySelector(".mnu-t").click();     // menus.js tient son état
    if(m&&!m.classList.contains("open"))m.querySelector(".mnu-t").click();
  }
  function aller(page){
    if(typeof sessEnregistrer==="function")sessEnregistrer();   // le mode retrouve son travail au retour
    try{SESS_QUITTE=true;}catch(e){}
    location.href="../"+page;
  }

  /* Pose la bulle près du rectangle r : dessous, dessus, à droite, à gauche,
     sinon dedans (canevas, grands panneaux). */
  function placer(b,r){
    const W=innerWidth,H=innerHeight,bw=b.offsetWidth,bh=b.offsetHeight,m=12;
    let x,y;
    if(!r){x=(W-bw)/2;y=(H-bh)/2;}
    else if(r.bottom+m+bh<H){x=r.left;y=r.bottom+m;}
    else if(r.top-m-bh>0){x=r.left;y=r.top-m-bh;}
    else if(r.right+m+bw<W){x=r.right+m;y=r.top;}
    else if(r.left-m-bw>0){x=r.left-m-bw;y=r.top;}
    else{x=r.left+(r.width-bw)/2;y=r.bottom-bh-24;}
    b.style.left=Math.max(m,Math.min(x,W-bw-m))+"px";
    b.style.top=Math.max(m,Math.min(y,H-bh-m))+"px";
  }

  /* ---------------- visite guidée ---------------- */
  function montrer(n){
    i=n;const e=etapes[i];
    menu(e.menu);
    if(e.faire){e.faire();setTimeout(afficher,80);}   // la page se remet en place après l'action
    else afficher();
  }
  function afficher(){
    const e=etapes[i], dernier=i===etapes.length-1;
    const cible=e.sel&&document.querySelector(e.sel);
    const r=visible(cible)?cible.getBoundingClientRect():null;
    calque.hidden=!!r; spot.hidden=!r;
    if(r)Object.assign(spot.style,{left:r.left-4+"px",top:r.top-4+"px",width:r.width+8+"px",height:r.height+8+"px"});
    const points=etapes.map((_,k)=>'<i class="'+(k===i?"on":k<i?"fait":"")+'"></i>').join("");
    const fin='<button class="tb on" data-t="1">'+(suivant?suivant.titre+' ›':'Terminer')+'</button>';
    bulle.innerHTML='<div class="tuto-num">'+PARCOURS[rang].titre+' · étape '+(i+1)+' / '+etapes.length+'</div>'+
      '<h4>'+e.titre+'</h4><p>'+e.texte+'</p>'+
      (dernier?'<p class="tuto-fin">'+(suivant?'Suite du parcours : <b>'+suivant.titre+'</b>.':'Fin du parcours !')+
        ' Les <b>?</b> restent sur l\'interface tant que le mode tuto est coché sur l\'accueil.</p>':'')+
      '<div class="tuto-pied"><span class="tuto-points">'+points+'</span>'+
      (i?'<button class="tb" data-t="-1">Précédent</button>':'<button class="tb" data-t="x">Passer</button>')+
      (dernier?fin:'<button class="tb on" data-t="1">Suivant ›</button>')+'</div>';
    bulle.hidden=false;
    placer(bulle,r);
  }
  function finir(){
    i=-1;bulle.hidden=spot.hidden=calque.hidden=true;menu(null);
  }
  // après la dernière étape : comme son bouton, mode suivant ou retour à l'accueil
  function avancer(d){
    const n=i<0?0:i+d;
    if(n<0)return;
    if(n<etapes.length)montrer(n);
    else aller(suivant?suivant.page+"?tuto":"index.html");
  }
  bulle.addEventListener("click",ev=>{
    const t=ev.target.closest("[data-t]");if(!t)return;
    const a=t.dataset.t;
    if(a==="x")finir();else avancer(+a);
  });
  // en capture : l'éditeur ne voit pas ces touches pendant la visite
  document.addEventListener("keydown",ev=>{
    if(i===-1)return;
    const k={ArrowRight:1,Enter:1,ArrowLeft:-1}[ev.key];
    if(ev.key==="Escape")finir();else if(k)avancer(k);else return;
    ev.preventDefault();ev.stopPropagation();
  },true);
  addEventListener("resize",()=>{if(i>=0)afficher();});

  function proposer(){
    calque.hidden=false;spot.hidden=true;
    bulle.innerHTML='<div class="tuto-num">Mode tuto · '+(rang+1)+' / '+PARCOURS.length+'</div>'+
      '<h4>'+PARCOURS[rang].titre+'</h4>'+
      '<p>'+etapes.length+' étapes pour en faire le tour. <kbd>→</kbd> ou <kbd>Entrée</kbd> pour avancer, <kbd>Échap</kbd> pour quitter.</p>'+
      '<div class="tuto-pied"><button class="tb" data-t="x">Plus tard</button>'+
      '<button class="tb on" data-t="1">Commencer ›</button></div>';
    bulle.hidden=false;placer(bulle,null);
    i=-2;            // carte d'accueil : ni visite (i ≥ 0) ni rien (i = -1)
  }

  /* ---------------- infos bulles ---------------- */
  const pastilles=etapes.filter(e=>e.sel).map(e=>{
    const p=el("button","tuto-pastille","?");p.type="button";p.hidden=true;
    p.onmouseenter=()=>{info.innerHTML="<h4>"+e.titre+"</h4><p>"+e.texte+"</p>";info.hidden=false;placer(info,p.getBoundingClientRect());};
    p.onmouseleave=()=>{info.hidden=true;};
    document.body.appendChild(p);
    return {p,e};
  });
  // ponytail: sondage toutes les 0,5 s (panneaux qui bougent, menus qui s'ouvrent) ; observer le DOM si ça coûte
  function reposer(){
    for(const {p,e} of pastilles){
      const c=document.querySelector(e.sel);
      p.hidden=!actif||i>=0||!visible(c);
      if(p.hidden)continue;
      const r=c.getBoundingClientRect();
      p.style.left=Math.min(r.right-9,innerWidth-20)+"px";p.style.top=Math.max(r.top-7,2)+"px";
    }
  }
  if(actif)setInterval(reposer,500);

  /* Arrivé depuis l'accueil ou le mode précédent : on propose la visite, une
     fois la page montée (panneaux dockés, session restaurée). */
  if(/[?&]tuto\b/.test(location.search)){
    history.replaceState(null,"",location.pathname);   // un rechargement ne relance pas
    setTimeout(proposer,400);
  }
})();
