"use strict";
/* ==========================================================================
   Éditeur PCB — 27-groupes.js
   Les groupes : un bloc de composants et de vias qui se déplace d'une pièce
   --------------------------------------------------------------------------
   C'est l'« Union » d'Altium : la capa de découplage, son via de masse et le
   via d'alimentation, figés ensemble ; un étage d'alimentation entier, ses
   selfs et ses condensateurs, posés une fois pour toutes.

   Un groupe nomme ses composants et ses vias par identifiant :
       {id, nom:"G1", fps:[17, 18], vias:[42]}
   Les PISTES n'en font pas partie : celles qui vont d'un membre à un autre
   partent en bloc d'elles-mêmes, comme toute piste tendue entre deux points
   qui bougent (`followMoved`) ; celles qui sortent du groupe le suivent à 45°.
   Il n'y a donc rien à tenir à jour quand on retouche le routage interne.

   Ce qu'il fait :
     · un clic sur un membre prend le groupe entier, le lasso aussi ;
     · le glissement, R (à l'arrêt ou en glissant), les cotes saisies
       emportent tout le groupe : ses vias sont des vias de sortie de ses
       composants, sans limite de distance ;
     · F (à l'arrêt ou en glissant) retourne le groupe EN MIROIR autour de
       l'axe vertical de son cadre : faces, places et rotations symétrisées,
       vias et pistes internes sur la couche miroir (voir plus bas) ;
     · copié entier, il se colle en nouveau groupe (« G1 (copie) ») avec son
       cuivre interne, sélectionné ou non, lié aux copies ;
     · Ctrl+G groupe la sélection, Ctrl+Maj+G dissout les groupes touchés ;
       le panneau Propriétés d'un composant dit son groupe et le dissout.
   Un membre effacé quitte son groupe ; un groupe sans composant, ou réduit à
   un seul membre, disparaît : il ne tiendrait plus rien ensemble.
   ========================================================================== */
function normGroupes(src,fps,vias){
  const fids=new Set(fps.map(f=>f.id)), vids=new Set(vias.filter(v=>v.id).map(v=>v.id));
  const out=[], pris=new Set();
  for(const g of (Array.isArray(src)?src:[])){
    if(!g||typeof g!=="object")continue;
    const id=+g.id;
    if(!Number.isInteger(id)||id<1)continue;
    // un membre n'appartient qu'à un groupe : le premier qui le nomme
    const f=[...new Set((Array.isArray(g.fps)?g.fps:[]).map(Number))]
      .filter(x=>fids.has(x)&&!pris.has("f"+x));
    const v=[...new Set((Array.isArray(g.vias)?g.vias:[]).map(Number))]
      .filter(x=>vids.has(x)&&!pris.has("v"+x));
    if(!f.length||f.length+v.length<2)continue;
    f.forEach(x=>pris.add("f"+x));v.forEach(x=>pris.add("v"+x));
    out.push({id,nom:String(g.nom||("G"+id)).slice(0,40),fps:f,vias:v});
  }
  return out;
}
/* Les groupes à jour de la carte : membres effacés retirés. EN PLACE — un
   groupe garde son objet, on le compare par identité — et seulement quand la
   carte a changé. */
function groupesPropres(){
  if(!Array.isArray(S.groupes))S.groupes=[];
  if(!S.groupes.length)return S.groupes;
  const st=S.ver+"/"+S.fps.length+"/"+S.vias.length+"/"+S.groupes.length;
  if(S.groupesSt===st)return S.groupes;
  const fids=new Set(S.fps.map(f=>f.id)), vids=new Set(S.vias.map(v=>v.id).filter(Boolean));
  for(const g of S.groupes){
    g.fps=g.fps.filter(x=>fids.has(x));
    g.vias=g.vias.filter(x=>vids.has(x));
  }
  S.groupes=S.groupes.filter(g=>g.fps.length&&g.fps.length+g.vias.length>=2);
  S.groupesSt=S.ver+"/"+S.fps.length+"/"+S.vias.length+"/"+S.groupes.length;
  return S.groupes;
}
function groupeDeFp(id){return groupesPropres().find(g=>g.fps.indexOf(id)>=0)||null;}
function groupeDeVia(v){return v&&v.id?groupesPropres().find(g=>g.vias.indexOf(v.id)>=0)||null:null;}
function groupeVias(g){return g.vias.map(id=>S.vias.find(v=>v.id===id)).filter(Boolean);}
/* Les groupes que touche la sélection en cours. */
function groupesSel(){
  const out=new Set();
  for(const id of S.sel.fps){const g=groupeDeFp(id);if(g)out.add(g);}
  for(const v of S.sel.vias){const g=groupeDeVia(v);if(g)out.add(g);}
  return [...out];
}
/* Toucher un membre, c'est prendre le groupe : composants et vias. */
function groupeEtendreSel(){
  for(const g of groupesSel()){
    for(const id of g.fps)S.sel.fps.add(id);
    for(const v of groupeVias(g))S.sel.vias.add(v);
  }
}
/* Retirer un membre de la sélection (Ctrl+clic), c'est retirer le groupe. */
function groupeRetirerSel(h){
  const g=h&&(h.fp?groupeDeFp(h.fp.id):h.via?groupeDeVia(h.via):null);
  if(!g)return;
  for(const id of g.fps)S.sel.fps.delete(id);
  for(const v of groupeVias(g))S.sel.vias.delete(v);
}
/* Les vias de groupe qu'emportent les composants `fps` : via → composant. */
function groupesViasEmportes(fps){
  const res=new Map(), ids=new Set(fps.map(f=>f.id));
  for(const g of groupesPropres()){
    const f=g.fps.find(id=>ids.has(id));
    if(f==null)continue;
    for(const v of groupeVias(g))res.set(v,f);
  }
  return res;
}
function groupeCreer(){
  viaIds();
  const fps=[...S.sel.fps].filter(id=>fpById(id)), vias=[...S.sel.vias];
  if(!fps.length||fps.length+vias.length<2){
    hint("Grouper : sélectionnez au moins un composant et un autre membre (composant ou via).");
    return null;
  }
  push();
  // un membre quitte son ancien groupe
  for(const g of S.groupes){
    g.fps=g.fps.filter(id=>fps.indexOf(id)<0);
    g.vias=g.vias.filter(id=>!vias.some(v=>v.id===id));
  }
  let n=1;
  while(S.groupes.some(g=>g.nom==="G"+n))n++;
  const g={id:S.nextId++,nom:"G"+n,fps:fps.slice(),vias:vias.map(v=>v.id)};
  S.groupes.push(g);
  groupesPropres();
  touch();refreshPanels();draw();
  hint("Groupe « "+g.nom+" » : "+fps.length+" composant(s), "+vias.length+
       " via(s). Il se déplace et tourne d'un bloc — Ctrl+Maj+G le dissout.");
  return g;
}
function groupeDissoudre(liste){
  const gs=liste||groupesSel();
  if(!gs.length){hint("Aucun groupe dans la sélection.");return 0;}
  push();
  S.groupes=S.groupes.filter(g=>gs.indexOf(g)<0);
  touch();refreshPanels();draw();
  hint(gs.length+" groupe(s) dissous : chaque membre redevient libre.");
  return gs.length;
}
/* L'encombrement d'un groupe : ses composants et ses vias. */
function groupeCadre(g){
  let x1=1e9,y1=1e9,x2=-1e9,y2=-1e9;
  for(const id of g.fps){
    const f=fpById(id);
    if(!f)continue;
    const b=fpBBox(f);
    x1=Math.min(x1,b.x1);y1=Math.min(y1,b.y1);x2=Math.max(x2,b.x2);y2=Math.max(y2,b.y2);
  }
  for(const v of groupeVias(g)){
    x1=Math.min(x1,v.x-v.d/2);y1=Math.min(y1,v.y-v.d/2);
    x2=Math.max(x2,v.x+v.d/2);y2=Math.max(y2,v.y+v.d/2);
  }
  return {x1,y1,x2,y2};
}
/* Le cadre d'un groupe dont un membre est sélectionné, et son nom. */
function groupesDessiner(c){
  const gs=groupesSel();
  if(!gs.length)return;
  c.save();
  c.strokeStyle=C_SEL;c.lineWidth=px(1.2);c.setLineDash([px(6),px(4)]);
  c.fillStyle=C_SEL;c.font=px(11)+"px sans-serif";c.textBaseline="bottom";
  for(const g of gs){
    const {x1,y1,x2,y2}=groupeCadre(g);
    if(x1>x2)continue;
    const m=px(6);
    c.strokeRect(x1-m,y1-m,x2-x1+2*m,y2-y1+2*m);
    c.fillText(g.nom,x1-m,y1-m-px(2));
  }
  c.restore();
}
/* Le panneau Propriétés d'un composant groupé : son groupe, et de quoi le dissoudre. */
function groupesPropsHtml(fp){
  const g=groupeDeFp(fp.id);
  if(!g)return "";
  const refs=g.fps.map(id=>(fpById(id)||{}).ref).filter(Boolean);
  return '<div class="prop"><label>Groupe</label><div class="two">'+
    '<input id="pGrpNom" value="'+esc(g.nom)+'" title="Nom du groupe">'+
    '<button class="tb" id="pGrpSuppr" title="Ctrl+Maj+G">Dissoudre</button></div>'+
    '<div class="empty" style="padding:4px 0">'+esc(refs.join(", "))+
    (g.vias.length?" + "+g.vias.length+" via(s)":"")+'</div></div>';
}
function groupesPropsBind(fp){
  const g=groupeDeFp(fp.id);
  if(!g)return;
  const n=$("pGrpNom"), b=$("pGrpSuppr");
  if(n)n.onchange=()=>{
    const v=String(n.value||"").trim().slice(0,40);
    if(!v||v===g.nom)return;
    push();g.nom=v;touch();refreshPanels();draw();
  };
  if(b)b.onclick=e=>{if(e&&e.preventDefault)e.preventDefault();groupeDissoudre([g]);};
}

/* ==========================================================================
   Retourner un groupe : le miroir du groupe entier
   --------------------------------------------------------------------------
   Un composant seul se retourne sur place (sa face change, sa rotation reste).
   Un groupe passe en MIROIR autour de l'axe vertical du centre de son cadre,
   comme si l'on retournait la petite carte qu'il forme : chaque composant
   change de face, sa place est symétrisée et sa rotation change de signe.
   C'est la convention de `fpXform` qui le veut : à rot = θ, une pastille au
   point local (x, y) est en (m·x·cos θ − y·sin θ, m·x·sin θ + y·cos θ) ; avec
   m → −m et θ → −θ, elle passe en (−m·x·cos θ + y·sin θ, m·x·sin θ + y·cos θ),
   le miroir exact. La rotation propre des pastilles et leurs sommets suivent
   (`padsWorld`).
   Le cuivre suit par `linkMover`, qui passe par le repère de chaque boîtier :
   ses vias et la piste tendue entre ses membres sont donc symétrisés d'eux-
   mêmes ; `groupeCouches` les passe sur la couche miroir (F.Cu ↔ B.Cu,
   In1 ↔ In(n)). Les pistes qui sortent suivent à 45° et sont jugées au
   relâchement, comme après tout geste.
   ========================================================================== */
// les groupes dont tous les composants sont parmi `ids`
function groupesEntiers(ids){
  const s=new Set(ids);
  return groupesPropres().filter(g=>g.fps.every(id=>s.has(id)));
}
/* Retourne les boîtiers `ids` : les groupes entiers en miroir, le reste sur
   place. Rend les identifiants des boîtiers passés en miroir. */
function fpsRetourner(ids){
  const mir=new Set();
  for(const g of groupesEntiers(ids)){
    const b=groupeCadre(g), cx=(b.x1+b.x2)/2;
    for(const id of g.fps){
      const f=fpById(id);
      if(!f)continue;
      f.side=f.side?0:1;f.rot=padRot(-(f.rot||0));f.x=r3(2*cx-f.x);
      // repère et valeur déplacés à la main : en miroir eux aussi
      if(f.refOffX)f.refOffX=-f.refOffX;
      if(f.valOffX)f.valOffX=-f.valOffX;
      mir.add(id);
    }
  }
  for(const id of ids){const f=mir.has(id)?null:fpById(id);if(f)f.side=f.side?0:1;}
  return mir;
}
/* Les couches de ce qui part avec un groupe en miroir : la piste tendue entre
   ses membres (un arc change de sens), ses vias et ceux de sortie de ses
   composants (un via borgne passe de l'autre côté). Reprises de l'état du
   départ du geste (`beginMove`) : `mir` dit les boîtiers en miroir à cet
   instant, un second F les rend. Alt retient les vias et leur piste : ils
   gardent leur couche. */
function groupeCouches(mir,alt){
  const F=drag&&drag.follow;
  if(!F)return;
  const n=S.cu-1;
  for(const o of drag.trk){
    if(!F.rigidOf.has(o.t)||o.l==null)continue;
    const m=!(alt&&F.rigidVia.has(o.t))&&mir.has(F.rigidOf.get(o.t));
    o.t.l=m?n-o.l:o.l;
    if(o.ca)o.t.ca=m?-o.ca:o.ca;
  }
  for(const o of drag.via){
    if(!drag.fanout||!drag.fanout.has(o.v)||o.a==null)continue;
    const m=!alt&&mir.has(drag.fanout.get(o.v));
    o.v.a=m?n-o.b:o.a;o.v.b=m?n-o.a:o.b;
  }
}
/* F en plein glissement : comme R, le geste continue. Les boîtiers en miroir
   sont tenus à jour (un second F les rend), et le pas est noté pour être rejoué
   sous une autre conduite (`dragRestart`). */
function dragRetournerPas(){
  const mir=fpsRetourner([...S.sel.fps]);
  if(!drag.mir)drag.mir=new Set();
  for(const id of mir)if(drag.mir.has(id))drag.mir.delete(id);else drag.mir.add(id);
  for(const d of selDrawingsPcb())d.layer=d.layer==="silkB"?"silkT":"silkB";
  drag.rot=true;
  dragRotFix();
  applyJoints(drag.joints,drag.dx,drag.dy,false);
  applyFollow(drag.follow,drag.dx,drag.dy,false);
}
function dragRetourner(){
  if(typeof drag==="undefined"||!drag||!drag.move||!S.sel.fps.size)return false;
  if(!drag.moved){push();drag.moved=true;beginMove();}
  dragRetournerPas();
  (drag.gestes||(drag.gestes=[])).push("F");
  touch();draw();
  return true;
}

/* ==========================================================================
   Copier-coller un groupe
   --------------------------------------------------------------------------
   Un groupe copié entier se colle en NOUVEAU groupe (« G1 (copie) »), avec son
   cuivre interne même s'il n'était pas sélectionné : les pistes qui vont d'un
   membre à un autre, et les vias libres qu'elles traversent. Une piste qui
   aboutit à un composant hors du groupe sort : elle reste. Les liens des bouts
   (`a1`/`a2`) visent les copies (`pcbClipContent`, `pasteClipPcb`).
   ========================================================================== */
/* Le cuivre interne d'un groupe. On part de chaque piste posée sur un membre,
   de bout en bout (un via libre relie ses couches), sans franchir un membre ;
   le morceau est interne s'il ne touche aucun autre composant et relie au
   moins deux membres (pastilles ou vias du groupe) — un bout qui pend n'est
   pas « entre membres ». */
function groupeCuivre(g){
  const fids=new Set(g.fps), gv=new Set(groupeVias(g)), K=(x,y)=>r3(x)+"|"+r3(y);
  const pads=[], bouts=new Map(), vk=new Map();
  const range=(M,k,o)=>{if(!M.has(k))M.set(k,[]);M.get(k).push(o);};
  for(const id of g.fps){const f=fpById(id);if(f)for(const q of padsWorld(f))pads.push({f,q});}
  for(const t of S.tracks){range(bouts,K(t.x1,t.y1),t);range(bouts,K(t.x2,t.y2),t);}
  for(const v of S.vias)range(vk,K(v.x,v.y),v);
  // ce qui tient le point : un membre (son nom), un autre composant, ou rien
  const borne=(l,x,y)=>{
    for(const v of vk.get(K(x,y))||[])if(gv.has(v)&&l>=v.a&&l<=v.b)return "v"+v.id;
    for(const p of pads)if(padHolds(p.f,p.q,l,x,y))return p.f.id+"."+p.q.n;
    const q=padAt(l,x,y);
    return q&&!fids.has(q.fp.id)?"dehors":null;
  };
  const membre=b=>b&&b!=="dehors";
  const vu=new Set(), out={tracks:[],vias:[]};
  for(const t0 of S.tracks){
    if(vu.has(t0)||!membre(borne(t0.l,t0.x1,t0.y1))&&!membre(borne(t0.l,t0.x2,t0.y2)))continue;
    const pile=[t0], piece=[], pv=new Set(), bornes=new Set();
    let dehors=false;
    vu.add(t0);
    while(pile.length){
      const t=pile.pop();
      piece.push(t);
      for(const [x,y] of [[t.x1,t.y1],[t.x2,t.y2]]){
        const b=borne(t.l,x,y);
        if(b==="dehors"){dehors=true;continue;}
        if(b){bornes.add(b);continue;}
        // un point libre : les pistes qui y aboutissent, sur les couches qu'un via relie
        const L=new Set([t.l]);
        for(const v of vk.get(K(x,y))||[])
          if(t.l>=v.a&&t.l<=v.b){pv.add(v);for(let l=v.a;l<=v.b;l++)L.add(l);}
        for(const o of bouts.get(K(x,y))||[])if(!vu.has(o)&&L.has(o.l)){vu.add(o);pile.push(o);}
      }
    }
    if(!dehors&&bornes.size>=2){out.tracks.push(...piece);out.vias.push(...pv);}
  }
  return out;
}
/* Ce que la copie emporte en plus : les groupes entiers de la sélection, leurs
   vias et leur cuivre interne. */
function groupesCopie(){
  const gs=groupesEntiers([...S.sel.fps]), tracks=new Set(), vias=new Set();
  for(const g of gs){
    const c=groupeCuivre(g);
    groupeVias(g).forEach(v=>vias.add(v));
    c.tracks.forEach(t=>tracks.add(t));c.vias.forEach(v=>vias.add(v));
  }
  return {gs,tracks,vias};
}
/* « G1 » → « G1 (copie) », puis « G1 (copie 2) »… le premier libre. */
function groupeNomCopie(nom){
  const base=String(nom||"G").replace(/ \(copie(?: \d+)?\)$/,"");
  for(let n=1;;n++){
    const suf=" (copie"+(n>1?" "+n:"")+")", c=base.slice(0,40-suf.length)+suf;
    if(!S.groupes.some(g=>g.nom===c))return c;
  }
}
/* Au collage : chaque groupe du presse-papier (indices dans ses composants et
   ses vias) devient un nouveau groupe des copies `nf`, `nv`. Rend leur nombre. */
function groupesColler(src,nf,nv){
  if(!Array.isArray(S.groupes))S.groupes=[];
  const pris=(L,T)=>[...new Set((Array.isArray(L)?L:[]).filter(Number.isInteger).map(i=>T[i]).filter(Boolean))];
  let n=0;
  for(const g of (Array.isArray(src)?src:[])){
    if(!g||typeof g!=="object")continue;
    const fps=pris(g.fps,nf).map(f=>f.id), vias=pris(g.vias,nv).map(v=>v.id);
    if(!fps.length||fps.length+vias.length<2)continue;
    S.groupes.push({id:S.nextId++,nom:groupeNomCopie(g.nom),fps,vias});
    n++;
  }
  return n;
}
