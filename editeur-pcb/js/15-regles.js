"use strict";
/* ==========================================================================
   Éditeur PCB — éditeur de règles et contraintes
   --------------------------------------------------------------------------
   Les règles de conception vivaient dans deux panneaux du dock : « Règles de
   tracé », une colonne de champs, et « Paires différentielles », une autre.
   Une colonne de 280 pixels tient les nombres, mais elle ne dit pas CE QUE
   chaque cote mesure : une isolation de 0,25 mm entre quoi et quoi ? Un
   rapport d'aspect de 10 : 1, compté sur quelle épaisseur ? Ces questions se
   répondent avec un dessin, et un dessin ne rentre pas dans une colonne.

   Cette fenêtre les remplace toutes les deux. Bâtie comme les éditeurs de
   règles des logiciels du métier : l'arbre des règles à gauche, la règle
   choisie à droite — son nom, ce qu'elle vise, une FIGURE qui montre le cuivre
   et la cote en cause, puis les champs. La figure n'est pas un décor : elle
   est dessinée à partir des valeurs du document, à l'échelle, et elle bouge
   quand on les change. C'est ce qui permet de voir qu'on a écrit 2,5 au lieu
   de 0,25 avant que le contrôle le dise.

   **Tout ce qui s'y affiche comme un champ s'y modifie.** Ce qui ne se règle
   pas — un compte de défauts, une cote calculée, un seuil du métier — n'est
   pas montré comme un champ grisé mais comme une valeur lue (`reFact`) : on ne
   cherche pas à cliquer dans ce qui ne s'écrit pas.

   Les paires différentielles gardent leur panneau, au mot près : il s'affiche
   dans la page « Règle et paires » de cette fenêtre. `buildDiffPairs()` écrit
   toujours dans `#dpair`, et c'est cette page qui fournit désormais l'élément.
   ========================================================================== */

/* L'état de la fenêtre. `page` est la règle affichée, `mx` la case de la
   matrice en cours d'édition — la figure de la page « Isolation » dessine
   cette case, ce qui fait d'un tableau de nombres un dessin coté. `cls` est la
   classe de net en cours d'édition, partagée par les pages qui en dépendent. */
/* `var` et non `const`, et ce n'est pas un relâchement : `loadDoc()` demande
   si cette fenêtre est ouverte, et il le demande DÈS LE DÉMARRAGE — la carte
   laissée dans l'onglet est reprise à la fin d'`init()`, dans 07-app.js, donc
   avant que ce fichier-ci soit exécuté. En pages séparées, `reIsOpen` n'existe
   pas encore et l'appel est simplement sauté ; dans la version un seul fichier
   (dist/), tous les modules partagent une portée et la fonction, elle, est
   hoistée — un `const RE` serait alors dans sa zone morte et l'appel
   planterait. Hoistée, la variable vaut `undefined`, ce qui est exactement la
   bonne réponse : la fenêtre n'est pas ouverte, elle n'existe pas encore. */
var RE={open:false,page:"clr",mx:{a:"trk",b:"trk"},cls:0};
/* Totale à dessein : elle répond à tout moment de la vie de la page. */
function reIsOpen(){return !!(RE&&RE.open);}

/* ==========================================================================
   L'arbre des règles
   Les familles sont celles du métier ; chaque feuille correspond à un contrôle
   que `runDrc` fait vraiment, ou à une contrainte que le tracé applique.
   ========================================================================== */
const RE_TREE=[
  {cat:"Classes de net",n:[
    ["cls",   "Classe de net"]]},
  {cat:"Électrique",n:[
    ["clr",   "Isolation"],
    ["short", "Court-circuit"],
    ["open",  "Liaison non routée"]]},
  {cat:"Routage",n:[
    ["width", "Largeur de piste"],
    ["angle", "Angle des pistes"],
    ["obst",  "Face à un obstacle"],
    ["sliver","Écharde de gravure"]]},
  {cat:"Vias et perçage",n:[
    ["via",   "Style de via"],
    ["hole",  "Via à via, trou à trou"],
    ["aspect","Rapport d'aspect"]]},
  {cat:"Plans et zones",n:[
    ["therm", "Bras thermique"],
    ["zone",  "Zone de cuivre"]]},
  {cat:"Paires différentielles",n:[
    ["dp",    "Règle et paires"]]},
  {cat:"Fabrication",n:[
    ["mask",  "Masque et pâte"],
    ["edge",  "Marge au bord"]]},
  {cat:"Carte et repères",n:[
    ["board", "Dimensions et origine"]]}
];
/* Ce que chaque règle reconnaît de ses propres défauts dans la liste du
   dernier contrôle. C'est ce qui permet à une page de dire « 3 défauts
   relevés » plutôt que de renvoyer à la liste générale — et ce compte est un
   vrai compte, pris sur `S.drc`, pas une estimation.
   Les motifs ne doivent pas se recouvrir : un défaut compté deux fois se lit
   comme deux défauts. « Via hors du contour » relève ainsi de la marge de bord
   et non du style de via, et « Zone débordant du contour » de la marge aussi —
   c'est bien la découpe qui est en cause dans les deux cas.
   Une règle sans motif ne produit aucun défaut : elle règle un GESTE (l'angle
   imposé, la conduite face à un obstacle), une cote de fabrication que le
   contrôle ne peut pas juger sur le dessin, ou un jeu de cotes que d'autres
   règles appliquent. La page le dit alors en clair. */
const RE_MATCH={
  clr:   /^Isolation |Pastilles trop proches/,
  short: /Pastilles superposées/,
  open:  /liaison\(s\) non routée/,
  width: /sous les .+ de la classe|Piste sans net/,
  angle: /hors des huit sens/,
  sliver:/écharde/,
  via:   /^Via .+ → /,
  hole:  /Trou à trou|erçages? (qui se recouvrent|au même point)/,
  aspect:/Rapport d'aspect/,
  zone:  /^Zone de cuivre sans net|cuivre coupé en/,
  edge:  /hors du contour|débordant du contour/,
  dp:    /^Paire /
};
/* Le titre complet d'une règle, tel que l'arbre le nomme. */
function reTitle(id){
  for(const g of RE_TREE)
    for(const [k,t] of g.n)if(k===id)return t;
  return id;
}
function reCat(id){
  for(const g of RE_TREE)
    for(const [k] of g.n)if(k===id)return g.cat;
  return "";
}
/* Les défauts du dernier contrôle qui relèvent de cette règle. */
function reFindings(id){
  const rx=RE_MATCH[id];
  if(!rx||!S.drcRun)return null;
  return S.drc.filter(e=>rx.test(e.msg||""));
}

/* ==========================================================================
   La boîte à dessin
   Un vocabulaire de plan coté : du cuivre, des perçages, des cotes fléchées.
   Toutes les figures partagent le même cadre — 360 × 150 — pour que passer
   d'une règle à l'autre ne fasse pas sauter le dessin d'une page à l'autre.
   ========================================================================== */
const RE_W=360, RE_H=150;
function reSvg(inner,label,h){
  return '<svg viewBox="0 0 '+RE_W+' '+(h||RE_H)+'" preserveAspectRatio="xMidYMid meet" '+
    'role="img" aria-label="'+esc(label)+'">'+inner+'</svg>';
}
/* Le bloc complet : le dessin, et sous lui la ligne qui le résume en chiffres.
   Même gabarit que la figure des paires différentielles, dont celle-ci reprend
   le rôle : dire lequel est lequel. */
function reFig(inner,label,note,h){
  return '<div class="refig">'+reSvg(inner,label,h)+
    (note?'<div class="refignote">'+note+'</div>':"")+'</div>';
}
function reLbl(x,y,t,anchor){
  return '<text x="'+x+'" y="'+y+'" fill="var(--yellow)" font-size="9.5" '+
    'font-family="var(--mono)"'+(anchor?' text-anchor="'+anchor+'"':"")+'>'+esc(t)+'</text>';
}
function reNote(x,y,t,anchor){
  return '<text x="'+x+'" y="'+y+'" fill="var(--txt-dim)" font-size="9" '+
    'font-family="var(--mono)"'+(anchor?' text-anchor="'+anchor+'"':"")+'>'+esc(t)+'</text>';
}
function reBad(x,y,t,anchor){
  return '<text x="'+x+'" y="'+y+'" fill="'+C_ERR+'" font-size="9" '+
    'font-family="var(--mono)"'+(anchor?' text-anchor="'+anchor+'"':"")+'>'+esc(t)+'</text>';
}
/* Une pointe de flèche, à l'extrémité (x,y) et dirigée par (dx,dy). */
function reArrow(x,y,dx,dy){
  const a=6, b=2.6, nx=-dy, ny=dx;
  return '<path d="M'+r3(x)+' '+r3(y)+' L'+r3(x+dx*a+nx*b)+' '+r3(y+dy*a+ny*b)+
    ' L'+r3(x+dx*a-nx*b)+' '+r3(y+dy*a-ny*b)+' Z" fill="var(--yellow)"/>';
}
/* Cote verticale entre y1 et y2, à l'abscisse x. L'étiquette va à droite, ou à
   gauche quand `gauche` est vrai — c'est ce qui permet d'empiler deux cotes sur
   la même abscisse sans écrire par-dessus le cuivre. */
function reDimV(x,y1,y2,t,gauche){
  const k=6;
  return '<path d="M'+(x-k)+' '+r3(y1)+' H'+(x+k)+' M'+(x-k)+' '+r3(y2)+' H'+(x+k)+
      '" stroke="var(--txt-dim)" stroke-width="1"/>'+
    '<path d="M'+x+' '+r3(y1)+' V'+r3(y2)+'" stroke="var(--yellow)" stroke-width="1"/>'+
    reArrow(x,y1,0,1)+reArrow(x,y2,0,-1)+
    (gauche?reLbl(x-10,(y1+y2)/2+3.5,t,"end"):reLbl(x+10,(y1+y2)/2+3.5,t));
}
/* Cote horizontale entre x1 et x2, à l'ordonnée y, étiquetée au-dessus. */
function reDimH(x1,x2,y,t){
  const k=6;
  return '<path d="M'+r3(x1)+' '+(y-k)+' V'+(y+k)+' M'+r3(x2)+' '+(y-k)+' V'+(y+k)+
      '" stroke="var(--txt-dim)" stroke-width="1"/>'+
    '<path d="M'+r3(x1)+' '+y+' H'+r3(x2)+'" stroke="var(--yellow)" stroke-width="1"/>'+
    reArrow(x1,y,1,0)+reArrow(x2,y,-1,0)+
    reLbl((x1+x2)/2,y-8,t,"middle");
}
/* La même cote, mais sans autorité : celle des deux règles en présence qui a
   du mou. Elle se lit — c'est une mesure du dessin — mais elle ne décide pas. */
function reDimHSoft(x1,x2,y,t){
  const k=5;
  return '<path d="M'+r3(x1)+' '+(y-k)+' V'+(y+k)+' M'+r3(x2)+' '+(y-k)+' V'+(y+k)+
      '" stroke="#4b5058" stroke-width="1"/>'+
    '<path d="M'+r3(x1)+' '+y+' H'+r3(x2)+'" stroke="var(--txt-dim)" '+
      'stroke-width="1" stroke-dasharray="3 2"/>'+
    reNote((x1+x2)/2,y-7,t,"middle");
}
/* Une piste : le tracé du cuivre, à la couleur de la couche active. */
function rePath(d,w,col,op){
  return '<path d="'+d+'" fill="none" stroke="'+esc(col||activeColor())+'" stroke-width="'+
    (w||13)+'" stroke-linecap="round" stroke-linejoin="round"'+
    (op?' opacity="'+op+'"':"")+'/>';
}
function reDisc(x,y,r,col,op){
  return '<circle cx="'+r3(x)+'" cy="'+r3(y)+'" r="'+r3(r)+'" fill="'+esc(col)+'"'+
    (op?' opacity="'+op+'"':"")+'/>';
}
/* Un via vu de dessus : la rondelle et son perçage. `d` et `drill` sont des
   millimètres, `k` l'échelle de la figure. */
function reVia(x,y,d,drill,k){
  return reDisc(x,y,Math.max(5,d/2*k),activeColor())+
         reDisc(x,y,Math.max(2,drill/2*k),C_DRILL);
}

/* Un objet de la matrice, dessiné centré en `cy`. `up` écarte le coude d'une
   piste du côté opposé à la cote, pour que le bord qui fait face reste droit —
   sans quoi la cote mesurerait un coude. Rend aussi la demi-hauteur occupée,
   où la cote s'accroche, et l'étendue horizontale du bord droit : la cote doit
   tomber là où les DEUX objets sont présents, faute de quoi elle flotterait à
   côté du dessin. Tous couvrent l'abscisse 180, il y a donc toujours une
   place. */
function reObj(kind,cy,up){
  const col=activeColor();
  if(kind==="trk")
    return {h:6.5, x1:14, x2:222,
      svg:rePath("M14 "+cy+" H222 L262 "+(cy+(up?-32:32))+" H346",13,col)};
  if(kind==="smd")
    return {h:15, x1:96, x2:264,
      svg:'<rect x="96" y="'+(cy-15)+'" width="168" height="30" rx="3" fill="'+
      esc(col)+'"/>'};
  if(kind==="th")
    return {h:21, x1:162, x2:198, svg:reDisc(180,cy,21,col)+reDisc(180,cy,9,C_DRILL)};
  if(kind==="via")
    return {h:13, x1:169, x2:191, svg:reDisc(180,cy,13,col)+reDisc(180,cy,6,C_DRILL)};
  if(kind==="cu")
    return {h:20, x1:14, x2:346,
      svg:'<rect x="14" y="'+(cy-20)+'" width="332" height="40" rx="2" fill="'+
      esc(col)+'" opacity=".34"/><rect x="14" y="'+(cy-20)+
      '" width="332" height="40" rx="2" fill="none" stroke="'+esc(col)+
      '" stroke-width="1.5"/>'};
  /* un trou n'est pas du cuivre : c'est le foret qu'on dessine, en pointillé */
  return {h:10, x1:172, x2:188,
    svg:reDisc(180,cy,10,C_DRILL)+
    '<circle cx="180" cy="'+cy+'" r="10" fill="none" stroke="var(--txt-dim)" '+
    'stroke-width="1" stroke-dasharray="3 2"/>'};
}
/* La cote qu'affiche la matrice pour une case : la case elle-même quand elle
   est écrite, sinon celle que la classe choisie impose déjà. Le contrôle, lui,
   prend la plus exigeante des DEUX classes en présence — la figure ne connaît
   pas les nets, et la page le dit. */
function reCls(){return S.classes[RE.cls]||defClass();}
function matEff(a,b){
  if(a==="hole"||b==="hole")return matGet(a,b);
  return Math.max(reCls().clr,matGet(a,b));
}

/* ==========================================================================
   Les figures, une par règle
   ========================================================================== */
/* Isolation : les deux natures de la case choisie, face à face, et l'écart
   qu'elles doivent tenir. Cliquer une autre case redessine la figure — c'est
   ce qui fait qu'un tableau de vingt nombres reste lisible. */
function figClr(){
  const a=RE.mx.a, b=RE.mx.b;
  const A=reObj(a,44,true), B=reObj(b,118,false);
  const v=matEff(a,b);
  const x=r3((Math.max(A.x1,B.x1)+Math.min(A.x2,B.x2))/2);
  const inner=A.svg+B.svg+
    reDimV(x,44+A.h,118-B.h,fmt(v,3)+" mm")+
    reNote(14,16,DRC_KIND_NAME[a])+reNote(14,146,DRC_KIND_NAME[b]);
  const dit=(a==="hole")
    ? "Trou à trou · règle de perçage, tous nets confondus"
    : (matGet(a,b)>0
       ? "Isolation minimale imposée par la matrice"
       : "Isolation de la classe « "+reCls().name+" » — la case est libre");
  return reFig(inner,"Isolation entre "+DRC_KIND_NAME[a]+" et "+DRC_KIND_NAME[b],
    esc(DRC_KIND_NAME[a])+" ↔ "+esc(DRC_KIND_NAME[b])+" · "+fmt(v,3)+" mm · "+esc(dit));
}
/* Une classe de net, entière : ses deux pistes à l'écart qu'elle exige, et son
   via. Quatre nombres, un dessin — c'est tout ce qu'une classe contient. */
function figClass(){
  const c=reCls();
  const k=clamp(60/Math.max(0.1,c.w+c.clr),20,150);
  const w=clamp(c.w*k,7,34), g=clamp(c.clr*k,6,40);
  const yA=54, yB=54+w/2+g+w/2;
  const kv=clamp(52/Math.max(0.2,c.via),20,150);
  const R=clamp(c.via/2*kv,15,28), r=clamp(viaDrill(c)/2*kv,5,R-4);
  const col=activeColor();
  const inner=
    rePath("M130 "+r3(yA)+" H250",w,col)+
    rePath("M130 "+r3(yB)+" H250",w,col)+
    reDimV(118,yA-w/2,yA+w/2,fmt(c.w,3)+" mm",true)+
    reDimV(118,yA+w/2,yB-w/2,fmt(c.clr,3)+" mm",true)+
    reDisc(302,74,R,col)+reDisc(302,74,r,C_DRILL)+
    reDimH(302-R,302+R,74+R+22,"Ø "+fmt(c.via,3))+
    reNote(130,26,"deux pistes de la classe")+
    reNote(302,34,"via","middle");
  return reFig(inner,"Les cotes de la classe "+c.name,
    "Classe « "+esc(c.name)+" » · piste "+fmt(c.w,3)+" mm · isolation "+
    fmt(c.clr,3)+" mm · via Ø "+fmt(c.via,3)+" percé "+fmt(viaDrill(c),3)+" mm");
}
/* Court-circuit : deux pistes de nets différents qui se croisent. Le
   recouvrement de deux plages, dessiné à plat, ne fait qu'une seule tache
   informe — on ne voit ni les deux nets ni ce qui les relie. Deux pistes qui se
   croisent, en revanche, se lisent d'un coup : chacune vient de sa gauche, et
   le point de croisement est le défaut. C'est le vocabulaire des figures de
   règles du métier, et il n'y a pas de raison d'en changer.
   Aucune cote : un court-circuit n'est pas une distance, c'est un fait. */
function figShort(){
  const col=activeColor();
  /* les deux pistes se croisent en (186,80) : 45° de part et d'autre */
  const A="M18 44 H150 L222 116 H344";
  const B="M18 116 H150 L222 44 H344";
  const cx=186, cy=80;
  const permis=!!S.rule.short;
  const inner=
    rePath(A,15,col)+rePath(B,15,col)+
    reDisc(cx,cy,19,permis?"#6fd39b":C_ERR,".5")+
    '<circle cx="'+cx+'" cy="'+cy+'" r="19" fill="none" stroke="'+
      (permis?"#6fd39b":C_ERR)+'" stroke-width="1.6"/>'+
    reNote(20,32,"net A")+reNote(20,140,"net B")+
    (permis?reNote(cx+26,cy+4,"jonction admise")
           :reBad(cx+26,cy+4,"le cuivre les relie"));
  return reFig(inner,"Deux pistes de nets différents qui se croisent",
    permis
     ? "Court-circuit ADMIS · le contrôle ne signale plus deux nets qui se touchent"
     : "Court-circuit · deux nets que le cuivre relie · défaut sans cote");
}
/* Liaison non routée : le chevelu qu'il reste à remplacer par du cuivre. */
function figOpen(){
  const col=activeColor();
  const inner=
    reDisc(60,96,18,col)+reDisc(60,96,8,C_DRILL)+
    reDisc(300,60,18,col)+reDisc(300,60,8,C_DRILL)+
    '<path d="M60 96 L300 60" stroke="'+C_RATS+'" stroke-width="1.6" '+
      'stroke-dasharray="6 4"/>'+
    reNote(60,130,"U1.1","middle")+reNote(300,38,"R1.2","middle")+
    reLbl(180,86,"liaison à router","middle");
  return reFig(inner,"Deux broches d'un même net que rien ne relie encore",
    "Le chevelu compte les liaisons qui manquent, net par net");
}
/* Largeur de piste : la cote transversale du trait, et la classe qui l'impose. */
function figWidth(){
  const c=reCls();
  const k=clamp(30/Math.max(0.05,c.w),18,150);       // ~30 pixels pour la cote
  const w=clamp(c.w*k,8,48), y=76;
  const inner=rePath("M14 "+y+" H196 L246 "+(y-38)+" H346",w)+
    reDimV(96,y-w/2,y+w/2,fmt(c.w,3)+" mm")+
    reNote(14,26,"classe « "+c.name+" »")+
    reNote(346,140,"coude à "+CORNER_MODES[cornerMode()],"end");
  return reFig(inner,"Largeur d'une piste de la classe "+c.name,
    "Largeur imposée par la classe · "+fmt(c.w,3)+" mm");
}
/* Angle des pistes : les trois conduites, celle qui vaut en pleine lumière. */
function figAngle(){
  const m=cornerMode();
  const cell=[["45","M14 96 V56 L44 26 H100"],
              ["90","M14 96 V26 H100"],
              ["free","M14 96 L100 34"]];
  let inner="";
  cell.forEach(([k,d],i)=>{
    const on=(k===m), dx=8+i*116;
    inner+='<g transform="translate('+dx+',10)">'+
      rePath(d,12,activeColor(),on?"1":".22")+
      (on?reLbl(57,124,CORNER_MODES[k],"middle")
         :reNote(57,124,CORNER_MODES[k],"middle"))+
      '</g>';
  });
  return reFig(inner,"Angle imposé aux pistes tracées",
    "Le tracé n'accepte que cet arrangement de coude · «&nbsp;/&nbsp;» le bascule en cours de route");
}
/* Face à un obstacle : pousser, contourner, signaler. Le via en travers de la
   route est le même dans les trois scènes ; seule la réponse change. */
function figObst(){
  const m=routeMode(), col=activeColor();
  const scenes={
    shove:'<path d="M8 62 H100" stroke="'+C_RATS+'" stroke-width="10" '+
          'stroke-dasharray="4 4" opacity=".5"/>'+
          rePath("M8 30 H100",10,col)+rePath("M8 92 H100",10,col,".9")+
          reArrow(54,52,0,-1)+reArrow(54,72,0,1),
    walk: rePath("M8 62 H30 L52 40 H66 L88 62 H100",10,col)+
          reDisc(59,62,13,col)+reDisc(59,62,6,C_DRILL),
    mark: rePath("M8 62 H40",10,col)+
          reDisc(59,62,13,col)+reDisc(59,62,6,C_DRILL)+
          '<path d="M44 52 L56 72 M56 52 L44 72" stroke="'+C_ERR+
          '" stroke-width="2.4"/>'
  };
  let inner="";
  Object.keys(ROUTE_MODES).forEach((k,i)=>{
    const on=(k===m), dx=8+i*116;
    inner+='<g transform="translate('+dx+',6)" opacity="'+(on?"1":".26")+'">'+
      scenes[k]+'</g>'+
      (on?reLbl(dx+54,134,ROUTE_MODES[k],"middle")
         :reNote(dx+54,134,ROUTE_MODES[k],"middle"));
  });
  return reFig(inner,"Ce que le tracé fait d'un obstacle",
    "Conduite du tracé face au cuivre qui gêne");
}
/* Écharde de gravure : le décrochement plus court que la piste. */
function figSliver(){
  const col=activeColor();
  const inner=
    rePath("M14 60 H150",22,col)+rePath("M150 60 L164 74",22,col)+
    rePath("M164 74 H346",22,col)+
    '<circle cx="157" cy="67" r="26" fill="none" stroke="'+C_ERR+
      '" stroke-width="1.6" stroke-dasharray="4 3"/>'+
    reDimH(150,164,116,"< largeur")+
    reNote(14,36,"piste de "+fmt(reCls().w,3)+" mm")+
    reBad(346,122,"languette sous-gravée au bain","end");
  return reFig(inner,"Un décrochement plus court que la piste qu'il prolonge",
    "Un décrochement plus court que la piste devient une écharde de cuivre");
}
/* Style de via : la rondelle, le perçage, et la couronne qui reste entre les
   deux — c'est elle que le fabricant regarde. */
function figVia(){
  const c=reCls();
  const dr=viaDrill(c);
  const k=clamp(60/Math.max(0.2,c.via),40,300);
  const R=clamp(c.via/2*k,18,58), r=clamp(dr/2*k,6,R-4);
  const cy=68, cx=132;
  const inner=
    reDisc(cx,cy,R,activeColor())+reDisc(cx,cy,r,C_DRILL)+
    '<circle cx="'+cx+'" cy="'+cy+'" r="'+r3(r)+'" fill="none" stroke="var(--txt-dim)" '+
      'stroke-width="1" stroke-dasharray="3 2"/>'+
    reDimH(cx-R,cx+R,cy+R+26,"Ø "+fmt(c.via,3)+" mm")+
    reDimH(cx-r,cx+r,cy-R-14,"perçage "+fmt(dr,3)+" mm")+
    reDimH(cx+r,cx+R,cy,"")+
    reLbl(cx+R+12,cy+4,"couronne "+fmt((c.via-dr)/2,3)+" mm")+
    reNote(14,20,"classe « "+c.name+" »");
  return reFig(inner,"Rondelle et perçage d'un via de la classe "+c.name,
    "Ø "+fmt(c.via,3)+" mm · perçage "+fmt(dr,3)+" mm · couronne "+
    fmt((c.via-dr)/2,3)+" mm · "+esc(VIA_FINISH[S.rule.viaFinish]));
}
/* Deux vias côte à côte, et les DEUX écarts qu'ils doivent tenir.
   Le cuivre à cuivre est la contrainte de tête entre deux vias, et c'est celle
   qui décide presque toujours : une rondelle de 0,8 mm percée à 0,4 mm porte
   0,2 mm de couronne de chaque côté, si bien que le cuivre se rencontre 0,4 mm
   avant les trous. Les deux vias sont donc placés à l'écart que la règle
   CONTRAIGNANTE impose — jamais en recouvrement, ce qui serait un
   court-circuit franc et non une carte conforme — et les deux cotes sont
   dites : celle qui décide en jaune, celle qui a du mou en gris. */
function reHoleCase(){
  const c=reCls(), dr=viaDrill(c), d=c.via;
  const cu=matEff("via","via"), h=holeClr();
  /* d'axe en axe : le cuivre exige d+cu, le foret dr+h — le plus grand gagne */
  const dCu=d+cu, dTr=dr+h;
  const axe=Math.max(dCu,dTr);
  return {d, dr, cu, h, axe, cuiMene:dCu>=dTr,
          gapCu:r3(axe-d), gapTr:r3(axe-dr)};
}
function figHole(){
  const q=reHoleCase();
  /* Deux contraintes de cadre, et la plus serrée gagne : l'écartement des deux
     vias doit tenir en largeur, et la rondelle doit laisser place aux DEUX
     cotes en hauteur — l'une au-dessus des trous, l'autre sous le cuivre. */
  const k=clamp(Math.min(300/(q.axe+q.d), 76/q.d),24,200);
  const R=q.d/2*k, r=q.dr/2*k, cy=44+R;
  const x1=180-q.axe*k/2, x2=180+q.axe*k/2;
  const col=activeColor();
  const coteCu=q.cuiMene
    ? reDimH(x1+R,x2-R,cy+R+22,"cuivre "+fmt(q.cu,3)+" mm")
    : reDimHSoft(x1+R,x2-R,cy+R+22,"cuivre "+fmt(q.gapCu,3)+" mm");
  const coteTr=q.cuiMene
    ? reDimHSoft(x1+r,x2-r,30,"trou "+fmt(q.gapTr,3)+" mm")
    : reDimH(x1+r,x2-r,30,"trou "+fmt(q.h,3)+" mm");
  const inner=
    reDisc(x1,cy,R,col)+reDisc(x2,cy,R,col)+
    reDisc(x1,cy,r,C_DRILL)+reDisc(x2,cy,r,C_DRILL)+
    coteTr+coteCu;
  return reFig(inner,"Deux vias : l'écart de cuivre et la paroi entre les trous",
    "Via à via · cuivre à cuivre "+fmt(q.cu,3)+" mm · trou à trou "+fmt(q.h,3)+
    " mm · soit "+fmt(q.axe,3)+" mm d'axe en axe — ici c'est "+
    (q.cuiMene?"le cuivre qui décide, le trou a du mou"
              :"le foret qui décide, le cuivre a du mou"));
}
/* Rapport d'aspect : la carte vue en coupe, le fût du via en travers. */
function figAspect(){
  const lam=stackLam(), c=reCls(), dr=viaDrill(c);
  const r=aspectOf(lam,dr);
  const col=activeColor();
  const yT=42, yB=104, cx=176;
  const w=clamp(dr*70,7,26);
  const bad=r>aspMax(), warn=r>aspWarn();
  const inner=
    '<rect x="30" y="'+yT+'" width="300" height="'+(yB-yT)+'" fill="#1b2320"/>'+
    '<rect x="30" y="'+(yT-6)+'" width="300" height="6" fill="'+esc(col)+'"/>'+
    '<rect x="30" y="'+yB+'" width="300" height="6" fill="'+esc(col)+'"/>'+
    '<rect x="'+r3(cx-w/2-3)+'" y="'+(yT-6)+'" width="'+r3(w+6)+'" height="'+(yB-yT+12)+
      '" fill="'+esc(col)+'"/>'+
    '<rect x="'+r3(cx-w/2)+'" y="'+(yT-6)+'" width="'+r3(w)+'" height="'+(yB-yT+12)+
      '" fill="'+C_DRILL+'"/>'+
    reDimV(96,yT-6,yB+6,fmt(lam,2)+" mm")+
    reDimH(cx-w/2,cx+w/2,yB+34,fmt(dr,3)+" mm")+
    reNote(30,26,"stratifié pressé, cuivre extérieur compris")+
    (bad?reBad(330,132,fmt(r,1)+" : 1 — hors des "+aspMax()+" : 1 admis","end")
        :(warn?reLbl(330,132,fmt(r,1)+" : 1 — la métallisation se paie","end")
              :reNote(330,132,fmt(r,1)+" : 1 — dans les usages","end")));
  return reFig(inner,"Épaisseur percée rapportée au diamètre du trou",
    "Rapport d'aspect · "+fmt(lam,2)+" mm percés pour "+fmt(dr,3)+" mm = "+
    fmt(r,1)+" : 1 (alerte "+aspWarn()+" : 1, refus "+aspMax()+" : 1)");
}
/* Bras thermique : la pastille reliée au plan par quatre ponts. */
function figTherm(){
  const tw=S.rule.thermal, clr=reCls().clr;
  const k=clamp(26/Math.max(0.1,tw),24,140);
  const b=clamp(tw*k,6,30);
  const cx=180, cy=72, R=34, G=clamp(clr*k,5,18);
  const col=activeColor();
  const inner=
    '<rect x="14" y="18" width="332" height="112" fill="'+esc(col)+'" opacity=".3"/>'+
    reDisc(cx,cy,R+G,C_BG)+
    reDisc(cx,cy,R,col)+reDisc(cx,cy,14,C_DRILL)+
    '<rect x="'+r3(cx-R-G)+'" y="'+r3(cy-b/2)+'" width="'+r3(2*(R+G))+'" height="'+r3(b)+
      '" fill="'+esc(col)+'"/>'+
    '<rect x="'+r3(cx-b/2)+'" y="'+r3(cy-R-G)+'" width="'+r3(b)+'" height="'+r3(2*(R+G))+
      '" fill="'+esc(col)+'"/>'+
    reDisc(cx,cy,14,C_DRILL)+
    reDimV(cx+R+G+16,cy-b/2,cy+b/2,fmt(tw,3)+" mm")+
    reNote(20,32,"plan de cuivre")+
    reNote(20,124,"la pastille tient au plan par quatre ponts");
  return reFig(inner,"Les quatre bras qui relient une pastille au plan",
    "Bras thermique · "+fmt(tw,3)+" mm · sans eux la pastille chauffe tout le plan au brasage");
}
/* Zone de cuivre : le plan, ce qu'il écarte, et l'îlot qu'une piste isole. */
function figZone(){
  const col=activeColor(), clr=matEff("cu","trk");
  const k=60, g=clamp(clr*k,5,16);
  const inner=
    '<rect x="14" y="20" width="332" height="110" fill="'+esc(col)+'" opacity=".3"/>'+
    '<rect x="14" y="20" width="332" height="110" fill="none" stroke="'+esc(col)+
      '" stroke-width="1.5"/>'+
    /* la piste étrangère et le couloir qu'elle creuse dans le plan */
    '<path d="M120 20 V130" stroke="'+C_BG+'" stroke-width="'+r3(13+2*g)+'"/>'+
    rePath("M120 20 V130",13,col)+
    reDisc(250,74,13+g,C_BG)+reVia(250,74,0.8,0.4,32)+
    reDimH(120+6.5,120+6.5+g,146,fmt(clr,3)+" mm")+
    reNote(20,16,"plan GND")+
    reNote(340,16,"le couloir coupe le plan en deux","end");
  return reFig(inner,"Un plan de cuivre, ses dégagements et un îlot",
    "Le remplissage écarte le cuivre étranger de "+fmt(clr,3)+
    " mm · un plan coupé en deux îlots ne relie plus rien");
}
/* Marge au bord : le contour de carte et la bande interdite. */
function figEdge(){
  const m=S.rule.edge, k=clamp(40/Math.max(0.05,m),20,150);
  const g=clamp(m*k,10,60), col=activeColor();
  const x=40;
  const inner=
    '<rect x="'+x+'" y="18" width="'+(RE_W-x-14)+'" height="114" fill="'+C_SUB+'"/>'+
    '<path d="M'+x+' 12 V138" stroke="'+C_EDGE+'" stroke-width="2"/>'+
    '<rect x="'+x+'" y="18" width="'+r3(g)+'" height="114" fill="'+C_ERR+'" opacity=".16"/>'+
    rePath("M"+r3(x+g)+" 56 H346",13,col)+
    reVia(x+g+16,104,0.8,0.4,26)+
    reDimH(x,x+g,146,fmt(m,3)+" mm")+
    reNote(x+8,30,"bande interdite")+
    reNote(346,30,"contour de carte","end");
  return reFig(inner,"La bande interdite le long du contour de carte",
    "Marge au bord · "+fmt(m,3)+" mm sans cuivre le long de la découpe");
}
/* Masque et pâte : la même pastille, ses trois ouvertures. */
function figMask(){
  const mk=S.rule.mask, pt=S.rule.paste;
  const k=140;
  const cx=180, cy=70, w=120, h=44;
  const em=clamp(mk*k,-18,26), ep=clamp(-pt*k,-26,18);
  const col=activeColor();
  const inner=
    '<rect x="'+r3(cx-w/2-em)+'" y="'+r3(cy-h/2-em)+'" width="'+r3(w+2*em)+
      '" height="'+r3(h+2*em)+'" rx="4" fill="none" stroke="'+C_MASK+
      '" stroke-width="1.4" stroke-dasharray="5 3"/>'+
    '<rect x="'+r3(cx-w/2)+'" y="'+r3(cy-h/2)+'" width="'+w+'" height="'+h+
      '" rx="3" fill="'+esc(col)+'"/>'+
    '<rect x="'+r3(cx-w/2+ep)+'" y="'+r3(cy-h/2+ep)+'" width="'+r3(w-2*ep)+
      '" height="'+r3(h-2*ep)+'" rx="3" fill="'+C_PASTE+'" opacity=".55"/>'+
    reDimH(cx+w/2,cx+w/2+em,cy+h/2+40,fmt(mk,3)+" mm")+
    reNote(cx-w/2-em,26,"ouverture du masque")+
    reNote(346,140,"pâte : "+(pt?fmt(-pt,3)+" mm de retrait":"au ras du cuivre"),"end");
  return reFig(inner,"Ouverture du masque et empreinte de pâte sur une pastille",
    "Masque ± "+fmt(mk,3)+" mm · pâte "+fmt(-pt,3)+" mm · vias "+
    esc(VIA_FINISH[S.rule.viaFinish]));
}
/* La carte : son contour à l'échelle, ses deux cotes, et l'origine posée
   dessus. C'est la seule figure qui montre la carte elle-même et non un détail
   de cuivre — mais c'est bien ce qu'on règle sur cette page. */
function figBoard(){
  const b=S.board;
  const sc=Math.min(238/Math.max(1,b.w),84/Math.max(1,b.h));
  const W=b.w*sc, H=b.h*sc;
  const x0=r3(186-W/2), y0=r3(72-H/2), x1=r3(186+W/2), y1=r3(72+H/2);
  const P=boardPoly();
  /* l'origine, ramenée dans le cadre : posée dehors, elle ne se verrait pas */
  const ox=clamp(x0+(S.origin.x-b.x)*sc,x0-14,x1+14);
  const oy=clamp(y0+(S.origin.y-b.y)*sc,y0-14,y1+14);
  let contour;
  if(b.pts&&P.length>2){
    contour='<path d="M'+P.map(p=>r3(x0+(p.x-b.x)*sc)+" "+r3(y0+(p.y-b.y)*sc)).join(" L")+
      ' Z" fill="'+C_SUB+'" stroke="'+C_EDGE+'" stroke-width="1.6"/>';
  }else{
    contour='<rect x="'+x0+'" y="'+y0+'" width="'+r3(W)+'" height="'+r3(H)+
      '" fill="'+C_SUB+'" stroke="'+C_EDGE+'" stroke-width="1.6"/>';
  }
  const inner=contour+
    '<path d="M'+r3(ox-11)+' '+r3(oy)+' H'+r3(ox+11)+' M'+r3(ox)+' '+r3(oy-11)+
      ' V'+r3(oy+11)+'" stroke="var(--yellow)" stroke-width="1.4"/>'+
    '<circle cx="'+r3(ox)+'" cy="'+r3(oy)+'" r="5" fill="none" stroke="var(--yellow)" '+
      'stroke-width="1.4"/>'+
    reDimH(x0,x1,y1+26,fmt(b.w,2)+" mm")+
    reDimV(x0-22,y0,y1,fmt(b.h,2)+" mm",true)+
    reNote(346,20,S.fabOrigin?"repère fichiers : origine":"repère fichiers : coin","end");
  return reFig(inner,"Le contour de carte et l'origine utilisateur",
    "Carte "+fmt(b.w,2)+" × "+fmt(b.h,2)+" mm · "+
    (b.pts?P.length+" sommets":"rectangle")+" · origine "+
    fmt(S.origin.x,2)+" ; "+fmt(S.origin.y,2)+" mm");
}

/* ==========================================================================
   L'entête d'une règle, ses objets visés, ses valeurs lues
   La disposition est celle d'un éditeur de règles du métier : le nom, la
   famille, le commentaire, l'identifiant, puis ce que la règle vise. Ces
   quatre-là ne s'écrivent pas — les règles sont celles du programme, elles ne
   se créent ni ne se renomment —, et c'est justement pourquoi elles ne sont pas
   montrées comme des champs : une valeur LUE se présente autrement qu'une
   valeur qu'on saisit, sans quoi on passe son temps à cliquer dans du vide.
   ========================================================================== */
function reFact(label,val,title){
  return '<div><label'+(title?' title="'+esc(title)+'"':"")+'>'+esc(label)+'</label>'+
    '<div class="reval"'+(title?' title="'+esc(title)+'"':"")+'>'+esc(val)+'</div></div>';
}
function reHead(id,comment){
  return '<div class="prop two">'+
      reFact("Nom",reTitle(id))+
      reFact("Famille",reCat(id))+'</div>'+
    '<div class="prop two">'+
      reFact("Commentaire",comment)+
      reFact("Identifiant",("DRC-"+id).toUpperCase(),
        "Identifiant de la règle : c'est lui que porte le contrôle.")+'</div>';
}
/* Ce que la règle vise, et ce qu'elle a trouvé au dernier contrôle. Le compte
   est pris sur `S.drc` : c'est le contrôle lui-même qui répond, pas une
   estimation. */
function reScope(id,first,second){
  const f=reFindings(id);
  let etat;
  if(!RE_MATCH[id])
    etat='<span class="ok">Réglage appliqué par le tracé et par le contrôle — '+
         'il ne produit pas de défaut par lui-même.</span>';
  else if(!S.drcRun)
    etat="Contrôle non lancé.";
  else if(!f.length)
    etat='<span class="ok">Aucun défaut relevé.</span>';
  else{
    const dur=f.filter(e=>!e.info).length;
    etat='<span class="warn">'+f.length+' défaut(s) relevé(s)</span>'+
      (dur<f.length?" — dont "+(f.length-dur)+" pour information":"");
  }
  return '<div class="cat">Objets visés</div>'+
    '<div class="prop two">'+
      reFact("Premier objet",first)+
      reFact("Second objet",second==null?"—":second)+'</div>'+
    '<div class="prop"><label>État au dernier contrôle</label>'+
      '<div class="restate">'+etat+'</div>'+
      '<div class="row"><button class="tb" id="reRun">Contrôler maintenant</button>'+
      (RE_MATCH[id]&&S.drcRun&&f&&f.length
        ?'<button class="tb" id="reList">Voir dans la liste</button>':"")+
      '</div></div>';
}

/* ==========================================================================
   La matrice des natures
   Un tableau à double entrée, moitié basse seulement : l'isolation piste/via
   est celle du via/piste. La case choisie s'édite sous le tableau — même
   principe que la coupe de l'empilage, où la ligne choisie s'édite en dessous.
   ========================================================================== */
function reMatrix(){
  let h='<div class="mxwrap"><table class="mx"><thead><tr><th></th>';
  for(const [k,n] of DRC_KINDS)h+='<th class="r" title="'+esc(n)+'">'+esc(n)+'</th>';
  h+='</tr></thead><tbody>';
  DRC_KINDS.forEach(([ka,na],i)=>{
    h+='<tr><th>'+esc(na)+'</th>';
    DRC_KINDS.forEach(([kb,nb],j)=>{
      if(j>i){h+='<td class="nil"></td>';return;}
      if(!matHas(ka,kb)){
        h+='<td class="off" title="Un perçage n\'a d\'isolation qu\'avec un autre '+
           'perçage : sa rondelle se charge du cuivre.">·</td>';
        return;
      }
      const v=matGet(ka,kb), on=(RE.mx.a===ka&&RE.mx.b===kb)||(RE.mx.a===kb&&RE.mx.b===ka);
      h+='<td class="v'+(on?" on":"")+(v>0?" set":"")+'" data-a="'+ka+'" data-b="'+kb+
         '" title="'+esc(na+" ↔ "+nb)+'">'+(v>0?esc(fmt(v,3)):"—")+'</td>';
    });
    h+='</tr>';
  });
  h+='</tbody></table></div>';
  const a=RE.mx.a, b=RE.mx.b, v=matGet(a,b);
  const trou=(a==="hole");
  h+='<div class="prop two">'+
      numProp("mxV",DRC_KIND_NAME[a]+" ↔ "+DRC_KIND_NAME[b],fmt(v,3),0.05,0)+
      reFact("Appliquée",fmt(matEff(a,b),3)+" mm",
        "Ce que le contrôle exige pour cette case avec la classe « "+
        reCls().name+" ».")+
    '</div>'+
    '<div class="prop"><div class="restate">'+
    (trou
     ? "Cette case EST la règle de trou à trou : elle vaut entre deux perçages, "+
       "de même net comme de nets étrangers."
     : (v>0
        ? "Minimum imposé quelle que soit la classe de net. Mettre 0 rend la case "+
          "à la classe."
        : "Case libre : la classe de net décide seule, comme avant que la matrice "+
          "existe."))+
    '</div></div>';
  return h;
}
/* Le tableau des classes, cliquable : c'est aussi par là qu'on change de classe
   courante, sans revenir au sélecteur. */
function reClassTable(){
  const used=new Map();
  for(const n of netTable()){
    const k=className(n.name);
    used.set(k,(used.get(k)||0)+1);
  }
  return '<div class="mxwrap"><table class="mx cls"><thead><tr><th>Classe</th>'+
    '<th class="r">Nets</th><th class="r">Piste</th><th class="r">Isolation</th>'+
    '<th class="r">Via Ø</th><th class="r">Perçage</th></tr></thead><tbody>'+
    S.classes.map((c,i)=>'<tr'+(i===RE.cls?' class="on"':"")+' data-cls="'+i+'">'+
      '<th>'+esc(c.name)+'</th><td>'+(used.get(c.name)||0)+'</td>'+
      '<td>'+esc(fmt(c.w,3))+'</td><td>'+esc(fmt(c.clr,3))+'</td>'+
      '<td>'+esc(fmt(c.via,3))+'</td><td>'+esc(fmt(viaDrill(c),3))+'</td></tr>').join("")+
    '</tbody></table></div>';
}
/* Le sélecteur de classe, pour les pages qui dépendent d'une classe. */
function reClassSel(){
  const used=new Map();
  for(const n of netTable()){
    const k=className(n.name);
    used.set(k,(used.get(k)||0)+1);
  }
  return '<div class="prop"><label>Classe de net visée</label><select id="reCls">'+
    S.classes.map((x,i)=>'<option value="'+i+'"'+(i===RE.cls?" selected":"")+'>'+
      esc(x.name)+' ('+(used.get(x.name)||0)+' net'+((used.get(x.name)||0)>1?"s":"")+')'+
      '</option>').join("")+'</select></div>';
}
/* Le traitement des vias : réglage d'empilage, mais il décide de l'ouverture du
   masque sur un via, donc il se lit et s'écrit aussi d'ici. */
function reFinishSel(){
  return '<div><label>Traitement des vias</label><select id="reFinish">'+
    Object.keys(VIA_FINISH).map(k=>'<option value="'+k+'"'+
      (k===S.rule.viaFinish?" selected":"")+'>'+esc(VIA_FINISH[k])+'</option>').join("")+
    '</select></div>';
}

/* ==========================================================================
   Les pages
   Chacune rend le HTML de la règle, entête et figure comprises. Les liaisons
   se font ensuite, en un seul endroit (`reBind`), parce que le DOM n'existe
   qu'une fois le HTML posé. Un identifiant de champ ne sert qu'à une page à la
   fois : la fenêtre n'en affiche jamais deux.
   ========================================================================== */
const RE_PAGE={
cls(){
  const c=reCls();
  const n=netTable().filter(x=>className(x.name)===c.name).length;
  return reHead("cls","Le jeu de cotes qu'un net reçoit : piste, isolation, via")+
    reScope("cls","Nets rattachés à la classe")+
    reClassSel()+
    '<div class="cat">Contraintes</div>'+figClass()+
    '<div class="prop two">'+
      numProp("clsW","Piste (mm)",fmt(c.w,3),0.05,0.05)+
      numProp("clsClr","Isolation (mm)",fmt(c.clr,3),0.05,0.02)+'</div>'+
    '<div class="prop two">'+
      numProp("clsVia","Via Ø (mm)",fmt(c.via,3),0.05,0.2)+
      numProp("clsDrill","Perçage (mm)",fmt(c.drill,3),0.05,0.1)+'</div>'+
    '<div class="prop"><div class="row" style="margin-top:0">'+
      '<button class="tb" id="clsNew">Nouvelle</button>'+
      '<button class="tb" id="clsRen">Renommer</button>'+
      (RE.cls>0?'<button class="tb" id="clsDel">Supprimer</button>':"")+
      '</div><div class="row">'+
      '<button class="tb" id="clsApply">Recaler le routage posé</button></div></div>'+
    '<div class="cat">Les classes du document</div>'+reClassTable()+
    '<div class="restate pad">'+n+' net(s) suivent « '+esc(c.name)+' ». Le '+
    'rattachement d\'un net à sa classe se fait dans la liste des nets, colonne '+
    '<i>Classe</i> ; tout net non rattaché suit la première de la liste. Changer '+
    'une cote ne remue pas la carte : <i>Recaler le routage posé</i> le fait, et '+
    'seulement quand on le demande.</div>';
},
clr(){
  const c=reCls();
  return reHead("clr","Isolation minimale entre deux cuivres de nets différents")+
    reScope("clr","Tout cuivre","Tout cuivre d'un autre net")+
    '<div class="cat">Contraintes</div>'+figClr()+reMatrix()+
    '<div class="cat">Ce que les classes exigent</div>'+
    reClassSel()+
    '<div class="prop two">'+
      numProp("clsClr","Isolation de « "+c.name+" » (mm)",fmt(c.clr,3),0.05,0.02)+
      reFact("La plus exigeante du document",fmt(maxClr(),3)+" mm",
        "Elle donne la marge des recherches d'obstacle et la finesse du "+
        "remplissage des zones.")+'</div>'+
    reClassTable()+
    '<div class="restate pad">Entre deux nets, c\'est la plus exigeante des deux '+
    'classes qui l\'emporte, et la matrice ne peut que relever le résultat. '+
    'Les deux nets d\'une paire différentielle échappent aux deux : leur écart '+
    'est celui de la règle de paire, et c\'est voulu.</div>';
},
short(){
  return reHead("short","Deux nets que le cuivre relie sans qu'on l'ait demandé")+
    reScope("short","Pastille","Pastille d'un autre net")+
    '<div class="cat">Contraintes</div>'+figShort()+
    '<div class="prop"><label class="check"><input type="checkbox" id="reShort"'+
      (S.rule.short?" checked":"")+'> Autoriser deux nets à se toucher</label></div>'+
    '<div class="prop two">'+
      reFact("Recouvrement admis",S.rule.short?"oui, sans limite":"aucun")+
      reFact("Couches","toutes",
        "Une pastille dessinée par-dessus une autre est fautive où qu'elle soit.")+
    '</div>'+
    '<div class="restate pad">Cochez la case pour une jonction voulue : deux '+
    'masses réunies sous un convertisseur, un pont de zéro ohm dessiné en '+
    'cuivre. Le contrôle se taira alors partout, ce qui est le prix à payer — '+
    'la règle ne sait pas viser un point de la carte.<br>Deux pastilles d\'une '+
    'MÊME empreinte se touchent presque par construction — un QFN au pas de '+
    '0,5 mm n\'a pas 0,25 mm entre ses plages — et cela n\'a jamais été un '+
    'défaut. Le recouvrement franc de deux nets, lui, ne peut venir que d\'un '+
    'dessin fait à la main.</div>';
},
open(){
  const c=conn();
  return reHead("open","Toute liaison de la netlist doit finir en cuivre")+
    reScope("open","Broche","Broche du même net")+
    '<div class="cat">Contraintes</div>'+figOpen()+
    '<div class="prop two">'+
      reFact("Liaisons manquantes",String(c.unrouted||0))+
      reFact("Nets sur la carte",String(c.nets.size))+'</div>'+
    '<div class="restate pad">Le chevelu montre ces liaisons en permanence ; le '+
    'contrôle les compte net par net. Une zone de cuivre coupée en plusieurs '+
    'îlots relève de la même famille : le cuivre est là, la liaison non.</div>';
},
width(){
  const c=reCls();
  return reHead("width","Largeur minimale d'une piste, par classe de net")+
    reScope("width","Piste")+reClassSel()+
    '<div class="cat">Contraintes</div>'+figWidth()+
    '<div class="prop two">'+
      numProp("clsW","Largeur (mm)",fmt(c.w,3),0.05,0.05)+
      reFact("Nets rattachés",
        String(netTable().filter(n=>className(n.name)===c.name).length))+'</div>'+
    '<div class="prop"><div class="row" style="margin-top:0">'+
      '<button class="tb" id="clsApply">Recaler le routage posé</button></div></div>'+
    '<div class="restate pad">Changer la largeur ne remue pas la carte : les '+
    'pistes déjà posées gardent la leur jusqu\'à ce qu\'on le demande. Une piste '+
    'de paire différentielle est plus fine que sa classe par construction — '+
    'c\'est l\'impédance qui décide, et la règle de paire qui la borne.</div>';
},
angle(){
  return reHead("angle","Les huit sens du tracé, et rien d'autre")+
    reScope("angle","Piste")+
    '<div class="cat">Contraintes</div>'+figAngle()+
    '<div class="prop"><label title="Pendant le tracé, « / » bascule '+
      'l’arrangement du coude.">Angle imposé</label><select id="reCorner">'+
      Object.keys(CORNER_MODES).map(k=>'<option value="'+k+'"'+
        (k===cornerMode()?" selected":"")+'>'+esc(CORNER_MODES[k])+'</option>').join("")+
      '</select></div>'+
    '<div class="restate pad">Un segment qui ne tombe sur aucun des huit sens est '+
    'un <i>off-angle track</i> : le rendu Gerber ne l\'optimise plus, et certains '+
    'fabricants le refusent au contrôle d\'entrée. En angle libre, la règle se '+
    'tait — c\'est alors un choix.</div>';
},
obst(){
  return reHead("obst","Ce que le tracé fait du cuivre qui gêne")+
    reScope("obst","Piste en cours","Tout cuivre d'un autre net")+
    '<div class="cat">Contraintes</div>'+figObst()+
    '<div class="prop two">'+
      '<div><label>Conduite</label><select id="reRoute">'+
      Object.keys(ROUTE_MODES).map(k=>'<option value="'+k+'"'+
        (k===routeMode()?" selected":"")+'>'+esc(ROUTE_MODES[k])+'</option>').join("")+
      '</select></div>'+
      '<div><label class="check"><input type="checkbox" id="reAvoid"'+
      (S.avoid?" checked":"")+'> Anti-collision</label></div>'+
    '</div>'+
    '<div class="restate pad">Le routeur juge au même seuil que le contrôle : ce '+
    'qu\'il accepte de poser, le contrôle l\'accepte, et ce qu\'il refuse, le '+
    'contrôle l\'aurait signalé. Anti-collision décochée, le tracé ne juge plus '+
    'rien — il ne reste que le contrôle, après coup.</div>';
},
sliver(){
  return reHead("sliver","Un décrochement plus court que la piste qu'il prolonge")+
    reScope("sliver","Piste")+
    '<div class="cat">Contraintes</div>'+figSliver()+
    '<div class="prop two">'+
      reFact("Longueur minimale d'un décrochement","la largeur de la piste",
        "La règle n'a pas de cote propre : elle compare le décrochement à la "+
        "piste qu'il prolonge.")+
      reFact("Gravité","pour information")+'</div>'+
    '<div class="restate pad">Le tracé aimante l\'arrivée pour ne plus en '+
    'produire ; ceux que d\'anciens clics ont posés, ou qu\'une arrivée sur une '+
    'pastille hors grille impose, ne se voient que d\'ici. Un moignon entre une '+
    'pastille et un via est court par nécessité : il n\'est pas jugé.</div>';
},
via(){
  const c=reCls();
  return reHead("via","Rondelle et perçage d'un via, par classe de net")+
    reScope("via","Via")+reClassSel()+
    '<div class="cat">Contraintes</div>'+figVia()+
    '<div class="prop two">'+
      numProp("clsVia","Rondelle Ø (mm)",fmt(c.via,3),0.05,0.2)+
      numProp("clsDrill","Perçage (mm)",fmt(c.drill,3),0.05,0.1)+'</div>'+
    '<div class="prop two">'+
      reFact("Couronne restante",fmt((c.via-viaDrill(c))/2,3)+" mm",
        "La rondelle moins le perçage, de part et d'autre : c'est ce qui reste "+
        "pour rattraper le décentrage du foret.")+
      reFinishSel()+
    '</div>'+
    '<div class="restate pad">Le perçage ne mange jamais la rondelle au point de '+
    'la faire disparaître : demander plus que Ø moins 0,2 mm est ramené à cette '+
    'borne. Une couronne sous 0,1 mm est refusée par la plupart des '+
    'fabricants.</div>';
},
hole(){
  const q=reHoleCase();
  return reHead("hole","Ce que deux vias voisins doivent tenir, cuivre et trou")+
    reScope("hole","Via ou pastille percée","Via ou pastille percée")+
    '<div class="cat">Contraintes</div>'+figHole()+
    /* Le cuivre à cuivre en tête : c'est la contrainte qui décide entre deux
       vias, et c'est celle qu'on cherche quand on ouvre cette page. C'est la
       case « Via ↔ Via » de la matrice — le même réglage, repris ici pour
       n'avoir pas à quitter la page. */
    '<div class="prop two">'+
      numProp("reV2V","Cuivre à cuivre (mm)",fmt(matGet("via","via"),3),0.05,0)+
      reFact("Appliqué",fmt(q.cu,3)+" mm",
        "Ce que l'isolation exige entre deux rondelles de vias de nets "+
        "différents, classe de net comprise.")+'</div>'+
    '<div class="prop two">'+
      numProp("reHole","Trou à trou (mm)",fmt(q.h,3),0.05,0)+
      reFact("Nets","sans objet",
        "Le foret ne sait pas ce qu'est un net : deux trous d'un même net "+
        "réclament la même paroi.")+'</div>'+
    '<div class="prop two">'+
      reFact("Axe en axe imposé",fmt(q.axe,3)+" mm",
        "La plus contraignante des deux règles, sur un via de la classe "+
        "choisie.")+
      reFact("Règle contraignante",q.cuiMene?"cuivre à cuivre":"trou à trou")+
    '</div>'+
    '<div class="restate pad">Deux règles, deux physiques. Le <b>cuivre à '+
    'cuivre</b> sépare deux nets : elle se mesure de rondelle à rondelle, elle '+
    's\'annule entre deux vias du même net — du cuivre déjà relié n\'a rien à '+
    'isoler — et c\'est elle qui décide presque toujours, la couronne du via '+
    'portant plus loin que son trou. Le <b>trou à trou</b> est ce que réclame le '+
    'foret : deux trous trop voisins, c\'est une paroi qui casse au perçage ; '+
    'deux trous qui se recouvrent, c\'est un seul trou déchiré, que le fichier '+
    'de perçage rend illisible. Elle vaut donc aussi entre deux vias d\'un même '+
    'net, où le cuivre se tait. 0,25 mm est le minimum courant en fabrication '+
    'standard.</div>';
},
aspect(){
  const lam=stackLam(), c=reCls();
  return reHead("aspect","Épaisseur percée rapportée au diamètre du trou")+
    reScope("aspect","Via","Empilage")+
    '<div class="cat">Contraintes</div>'+figAspect()+
    '<div class="prop two">'+
      numProp("reAspW","Alerte (× : 1)",fmt(aspWarn(),1),0.5,1)+
      numProp("reAspM","Refus (× : 1)",fmt(aspMax(),1),0.5,1)+'</div>'+
    '<div class="prop two">'+
      reFact("Stratifié percé",fmt(lam,2)+" mm",
        "L'épaisseur vient de l'empilage physique : c'est là qu'elle se règle.")+
      reFact("Perçage de « "+c.name+" »",fmt(viaDrill(c),3)+" mm")+'</div>'+
    '<div class="restate pad">8 : 1 et 10 : 1 sont les usages ; ce ne sont pas des '+
    'vérités. Un fabricant qui annonce du 12 : 1 existe, et une série bon marché '+
    'peut vouloir se tenir à 6 : 1 — d\'où les deux champs. Ce qui ne se règle '+
    'pas ici, c\'est l\'épaisseur, qui vient de « Empilage physique », et le '+
    'perçage, qui vient de la classe. Un via enterré ne traverse qu\'une partie '+
    'de la pile, et son rapport se compte sur cette partie.</div>';
},
therm(){
  return reHead("therm","Les ponts qui relient une pastille au plan")+
    reScope("therm","Pastille","Plan du même net")+
    '<div class="cat">Contraintes</div>'+figTherm()+
    '<div class="prop two">'+
      numProp("reTh","Bras thermique (mm)",fmt(S.rule.thermal,3),0.05,0)+
      reFact("Nombre de bras","4")+'</div>'+
    '<div class="restate pad">Sans bras, la pastille est noyée dans le plan : le '+
    'fer ou la vague chauffe alors toute la couche avant la brasure, et le joint '+
    'ne se fait pas. Trop fins, les bras ne conduisent plus le courant du '+
    'plan.</div>';
},
zone(){
  const isl=(conn().zoneIslands||[]).filter(z=>!z.approx&&z.islands>1).length;
  return reHead("zone","Ce qu'un remplissage écarte, et ce qu'il doit relier")+
    reScope("zone","Zone de cuivre","Tout cuivre d'un autre net")+
    '<div class="cat">Contraintes</div>'+figZone()+
    /* la ligne « Cuivre » de la matrice, dépliée là où on la cherche : c'est
       ce dégagement qui creuse les couloirs du plan */
    '<div class="prop two">'+
      numProp("reCuTrk","Cuivre ↔ piste (mm)",fmt(matGet("cu","trk"),3),0.05,0)+
      numProp("reCuVia","Cuivre ↔ via (mm)",fmt(matGet("cu","via"),3),0.05,0)+'</div>'+
    '<div class="prop two">'+
      numProp("reCuTh","Cuivre ↔ pastille TH (mm)",fmt(matGet("cu","th"),3),0.05,0)+
      numProp("reCuSmd","Cuivre ↔ pastille CMS (mm)",fmt(matGet("cu","smd"),3),0.05,0)+
    '</div>'+
    '<div class="prop two">'+
      reFact("Appliqué au cuivre étranger",fmt(matEff("cu","trk"),3)+" mm",
        "Case comprise, classe de net comprise : c'est ce que le remplissage "+
        "écarte réellement d'une piste étrangère.")+
      reFact("Zones coupées en îlots",String(isl))+'</div>'+
    '<div class="restate pad">Ces quatre cases sont la ligne « Cuivre » de la '+
    'matrice, dépliée ici : c\'est la même cote pour le remplissage à l\'écran, '+
    'pour le Gerber et pour le contrôle. À zéro, la classe de net décide seule. '+
    'Une zone sans net reste isolée ; une zone coupée en plusieurs îlots ne '+
    'relie plus ce qu\'elle prétend relier.</div>';
},
dp(){
  /* Le panneau des paires, entier, dans sa page. `buildDiffPairs()` écrit dans
     `#dpair` : cette page fournit l'élément, `reBind` déclenche le
     remplissage. Rien de son comportement n'a changé — c'est son hôte qui a
     changé, et lui seul. */
  return reHead("dp","Largeur, écart, trajet couplé et impédance d'une paire")+
    reScope("dp","Paire différentielle","Les deux nets de la paire")+
    '<div id="dpair"></div>';
},
mask(){
  return reHead("mask","Ouverture du masque et empreinte de pâte")+
    reScope("mask","Pastille","Masque et pâte")+
    '<div class="cat">Contraintes</div>'+figMask()+
    '<div class="prop two">'+
      numProp("reMask","Masque ± (mm)",fmt(S.rule.mask,3),0.01,-10)+
      numProp("rePaste","Retrait de pâte (mm)",fmt(S.rule.paste,3),0.01,-10)+'</div>'+
    '<div class="prop two">'+reFinishSel()+
      reFact("Ouverture sur les vias",viaTented()?"aucune":"comme une pastille",
        "Un via recouvert de vernis n'a pas d'ouverture de masque.")+'</div>'+
    '<div class="restate pad">Le masque s\'ouvre un peu plus large que la '+
    'pastille pour absorber le décalage de l\'insolation ; la pâte se retire un '+
    'peu pour ne pas déborder sous le composant. Le traitement des vias se règle '+
    'aussi dans « Empilage physique » : c\'est le même réglage.</div>';
},
edge(){
  const P=boardPoly();
  return reHead("edge","La bande sans cuivre le long de la découpe")+
    reScope("edge","Tout cuivre","Contour de carte")+
    '<div class="cat">Contraintes</div>'+figEdge()+
    '<div class="prop two">'+
      numProp("reEdge","Marge au bord (mm)",fmt(S.rule.edge,3),0.05,0)+
      reFact("Contour",S.board.pts?"libre, "+P.length+" sommets":"rectangle",
        "Les dimensions se règlent dans « Dimensions et origine ».")+'</div>'+
    '<div class="restate pad">La fraise de détourage emporte de la matière de part '+
    'et d\'autre du trait : du cuivre trop près du bord s\'arrache, et une piste '+
    'qui touche la découpe est un court-circuit au moment du dépanelage. Les '+
    'zones de cuivre sont rognées d\'office à cette marge.</div>';
},
board(){
  return reHead("board","Les dimensions de la carte et le repère des cotes")+
    reScope("board","Contour de carte","Origine utilisateur")+
    '<div class="cat">Contraintes</div>'+figBoard()+
    '<div class="prop two">'+
      numProp("reBW","Carte L (mm)",fmt(S.board.w,2),1,1)+
      numProp("reBH","Carte H (mm)",fmt(S.board.h,2),1,1)+'</div>'+
    '<div class="prop two">'+
      numProp("reOX","Origine X (mm)",fmt(S.origin.x,3),0.5,-1e4)+
      numProp("reOY","Origine Y (mm)",fmt(S.origin.y,3),0.5,-1e4)+'</div>'+
    '<div class="prop two">'+
      '<div><label>Repère des fichiers de fabrication</label>'+
      '<select id="reFab"><option value="0"'+(S.fabOrigin?"":" selected")+
      '>coin de la carte</option><option value="1"'+(S.fabOrigin?" selected":"")+
      '>origine utilisateur</option></select></div>'+
      '<div><label>Grille d\'accrochage (mm)</label><select id="reGrid">'+
      GRID_STEPS.map(g=>'<option value="'+g+'"'+(g===S.grid?" selected":"")+'>'+
        g+'</option>').join("")+'</select></div>'+
    '</div>'+
    '<div class="prop"><div class="row" style="margin-top:0">'+
      '<button class="tb" id="reOSet">Placer l\'origine <kbd>O</kbd></button>'+
      '<button class="tb" id="reOZero">Remettre à zéro</button>'+
      (S.board.pts?'<button class="tb" id="reBRect">Revenir au rectangle</button>':"")+
      '</div></div>'+
    '<div class="restate pad">Redimensionner une carte au contour libre le met à '+
    'l\'échelle ; le mode <i>Contour</i> (E) permet d\'en dessiner un autre. '+
    '<i>Placer l\'origine</i> ferme cette fenêtre : le point se désigne sur la '+
    'carte. Le repère des fichiers décide de l\'origine des Gerber et du '+
    'perçage — le coin de la carte est ce qu\'attendent la plupart des '+
    'fabricants.</div>';
}
};

/* ==========================================================================
   La fenêtre
   ========================================================================== */
function reBuild(){
  if($("drcEd"))return;
  const d=document.createElement("div");
  d.id="drcEd";d.className="modal";d.hidden=true;
  d.innerHTML=
    '<div class="modal-box">'+
      '<header class="modal-head">'+
        '<span class="modal-title">Règles et contraintes de conception</span>'+
        '<span class="modal-zoom" id="reUnit">mm</span>'+
        '<button class="pnl-btn" id="reClose" title="Fermer">&#10005;</button>'+
      '</header>'+
      '<div class="modal-body">'+
        '<div class="re-tree scroll" id="reTree"></div>'+
        '<div class="re-page scroll" id="rePage"></div>'+
      '</div>'+
    '</div>';
  document.body.appendChild(d);
  d.addEventListener("pointerdown",e=>{if(e.target===d)reClose();});
  const b=$("reClose");
  if(b)b.onclick=reClose;
}
function reOpen(page){
  reBuild();
  RE.open=true;
  if(page&&RE_PAGE[page])RE.page=page;
  const d=$("drcEd");
  if(d)d.hidden=false;
  reSync();
}
function reClose(){
  if(!RE.open)return;
  RE.open=false;
  const d=$("drcEd");
  if(d)d.hidden=true;
  refreshPanels();draw();
}
function reGo(page){
  if(!RE_PAGE[page])return;
  RE.page=page;reSync();
}
/* Un changement de cote : instantané, écriture, et tout ce qui en dépend se
   refait — la fenêtre comprise, puisque sa figure porte la valeur. */
function reEdit(fn){
  push();
  fn();
  touch();zoneCache.clear();
  refreshPanels();draw();reSync();
}
function reTree(){
  const box=$("reTree");
  if(!box)return;
  let h="";
  for(const g of RE_TREE){
    h+='<div class="re-cat">'+esc(g.cat)+'</div>';
    for(const [id,t] of g.n){
      const f=reFindings(id);
      const n=f?f.filter(e=>!e.info).length:0;
      h+='<div class="re-node'+(id===RE.page?" on":"")+'" data-page="'+id+'">'+
         '<span class="nm">'+esc(t)+'</span>'+
         (n?'<span class="ct">'+n+'</span>':"")+'</div>';
    }
  }
  box.innerHTML=h;
  box.querySelectorAll(".re-node").forEach(el=>{
    el.onclick=()=>reGo(el.dataset.page);
  });
}
/* Redessiner la fenêtre entière. C'est volontairement grossier : une page de
   règles n'a pas de coût, et tout y dépend de tout — la figure des valeurs,
   l'arbre du dernier contrôle, l'état des champs de la classe choisie. */
function reSync(){
  if(!reIsOpen())return;
  RE.cls=clamp(RE.cls,0,S.classes.length-1);
  reTree();
  const box=$("rePage");
  if(!box)return;
  const page=RE_PAGE[RE.page]||RE_PAGE.clr;
  box.innerHTML=page();
  /* le panneau des paires se remplit lui-même, dans l'élément que sa page
     vient de poser */
  if(RE.page==="dp"&&typeof buildDiffPairs==="function")buildDiffPairs();
  reBind();
}
/* Les liaisons de la page courante. Un identifiant absent de la page rend un
   élément neutre côté banc d'essai : chaque liaison se garde donc, et seules
   celles dont le champ existe vraiment agiront. */
function reBind(){
  const num=(id,fn)=>{
    const el=$(id);
    if(!el)return;
    el.onchange=()=>reEdit(()=>fn(parseFloat(el.value)||0));
  };
  const sel=(id,fn)=>{
    const el=$(id);
    if(!el)return;
    el.onchange=()=>fn(el.value);
  };
  const chk=(id,fn)=>{
    const el=$(id);
    if(!el)return;
    el.onchange=()=>fn(!!el.checked);
  };
  const clk=(id,fn)=>{
    const el=$(id);
    if(!el)return;
    el.onclick=fn;
  };
  const c=reCls();

  /* --- la matrice, et les cases dépliées ailleurs --- */
  const box=$("rePage");
  if(box)box.querySelectorAll("td.v[data-a]").forEach(td=>{
    td.onclick=()=>{RE.mx={a:td.dataset.a,b:td.dataset.b};reSync();};
  });
  num("mxV",v=>matSet(RE.mx.a,RE.mx.b,Math.max(0,v)));
  num("reV2V",v=>matSet("via","via",Math.max(0,v)));
  num("reCuTrk",v=>matSet("cu","trk",Math.max(0,v)));
  num("reCuVia",v=>matSet("cu","via",Math.max(0,v)));
  num("reCuTh",v=>matSet("cu","th",Math.max(0,v)));
  num("reCuSmd",v=>matSet("cu","smd",Math.max(0,v)));

  /* --- classes de net --- */
  sel("reCls",v=>{RE.cls=clamp(parseInt(v,10)||0,0,S.classes.length-1);reSync();});
  if(box)box.querySelectorAll("tr[data-cls]").forEach(tr=>{
    tr.onclick=()=>{RE.cls=clamp(+tr.dataset.cls,0,S.classes.length-1);reSync();};
  });
  num("clsW",v=>c.w=Math.max(0.05,v));
  num("clsClr",v=>c.clr=Math.max(0.02,v));
  num("clsVia",v=>c.via=Math.max(0.2,v));
  num("clsDrill",v=>c.drill=clamp(v,0.1,c.via-0.1));
  clk("clsApply",()=>{applyClasses();reSync();});
  clk("clsNew",()=>{
    const n=(prompt("Nom de la nouvelle classe :","Classe "+(S.classes.length+1))||"").trim();
    if(!n)return;
    if(S.classes.some(x=>x.name===n)){alert("Ce nom est déjà pris.");return;}
    push();
    S.classes.push({name:n,w:c.w,clr:c.clr,via:c.via,drill:c.drill});
    RE.cls=S.classes.length-1;
    touch();refreshPanels();reSync();
  });
  clk("clsRen",()=>{
    const n=(prompt("Nouveau nom :",c.name)||"").trim();
    if(!n||n===c.name)return;
    if(S.classes.some(x=>x.name===n)){alert("Ce nom est déjà pris.");return;}
    push();
    for(const k in S.netClass)if(S.netClass[k]===c.name)S.netClass[k]=n;
    c.name=n;
    touch();refreshPanels();reSync();
  });
  clk("clsDel",()=>{
    if(RE.cls<=0)return;
    push();
    for(const k in S.netClass)if(S.netClass[k]===c.name)delete S.netClass[k];
    S.classes.splice(RE.cls,1);
    RE.cls=0;touch();zoneCache.clear();refreshPanels();draw();reSync();
    hint("Classe supprimée : ses nets repassent à « "+defClass().name+" ».");
  });

  /* --- règles générales --- */
  num("reHole",v=>S.rule.hole=Math.max(0,v));
  num("reTh",v=>S.rule.thermal=Math.max(0,v));
  num("reEdge",v=>{S.rule.edge=Math.max(0,v);boardChanged();});
  num("reMask",v=>S.rule.mask=v);
  num("rePaste",v=>S.rule.paste=v);
  num("reAspW",v=>S.rule.aspWarn=Math.max(1,v));
  num("reAspM",v=>S.rule.aspMax=Math.max(1,v));
  chk("reShort",v=>S.rule.short=v);
  sel("reCorner",v=>{setCornerMode(v);reSync();});
  sel("reRoute",v=>{setRouteMode(v);reSync();});
  sel("reFinish",v=>{
    if(!VIA_FINISH[v])return;
    push();S.rule.viaFinish=v;touch();
    buildStackup();draw();reSync();
  });
  const av=$("reAvoid");
  if(av)av.onchange=()=>{
    S.avoid=!!av.checked;
    const b=$("bAvoid");
    if(b)b.classList.toggle("on",S.avoid);
    reSync();
  };

  /* --- carte, origine, grille --- */
  num("reBW",v=>setBoardSize(v,S.board.h));
  num("reBH",v=>setBoardSize(S.board.w,v));
  num("reOX",v=>S.origin.x=v);
  num("reOY",v=>S.origin.y=v);
  sel("reFab",v=>{push();S.fabOrigin=(v==="1");touch();reSync();});
  sel("reGrid",v=>{setGridStep(v);reSync();});
  clk("reOSet",()=>{reClose();setMode("origin");
    hint("Cliquez le point qui devient l'origine des cotes.");});
  clk("reOZero",()=>reEdit(()=>{S.origin={x:0,y:0};}));
  clk("reBRect",()=>{reEdit(()=>setBoardRect());
    hint("Contour ramené au rectangle englobant.");});

  /* --- le contrôle --- */
  clk("reRun",()=>{
    runDrc();
    refreshPanels();draw();reSync();
    const f=reFindings(RE.page);
    hint("Contrôle DRC : "+(f?f.length+" défaut(s) pour « "+reTitle(RE.page)+" »"
                             :"terminé")+", "+S.drc.length+" au total.");
  });
  clk("reList",()=>{
    /* Renvoyer à la liste, c'est fermer : on va lire les défauts sur la carte,
       et la fenêtre est devant. */
    S.listTab="drc";
    for(const [id,t] of [["tabNets","nets"],["tabComps","comps"],["tabDrc","drc"]]){
      const el=$(id);
      if(el)el.classList.toggle("on",t==="drc");
    }
    reClose();
    buildList();
  });
}
