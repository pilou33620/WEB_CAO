/* ==========================================================================
   Routage par Claude (web_suite, module routage)
   --------------------------------------------------------------------------
   Claude donne des points de passage ; le routeur de la page (push-and-shove)
   fait le détail. Un lot de routes est une carte du canal de pilotage.

   SIMULER, RELEVER, PUIS CHARGER. Le routeur a un garde-temps : le rejouer au
   clic pourrait donner un autre tracé sur une machine lente. `proposer` fait
   donc le lot pour de vrai, relève le document obtenu, puis remet l'original
   (loadDoc, comme Ctrl+Z). Au clic, si rien n'a bougé, la page pousse UNE
   étape d'historique et charge le document relevé : le tracé appliqué est
   celui de l'aperçu, dessiné en pointillés tant que la carte attend.

   Positions en mm, dans le repère des lectures (cao_pcb_lire liaisons, zone).
   Spec : web_suite/lanceur/docs/SPEC-mcp-routage.md.
   ========================================================================== */
"use strict";

const ROUTAGE_MAX = 20, ROUTAGE_POINTS = 200, ROUTAGE_VIAS = 50;
// var, pas const : dans le bundle d'un seul script, paint() la lit avant que ce fichier ne s'exécute
var ROUTAGE = { apercu: null };      // apercu : {pistes, vias, ver}, ce que la carte en attente posera

/* L'aperçu, par-dessus la carte (appelé par paint, 03-render.js), tant que le document est
   celui de la carte : une modification le rend caduc. */
function routageApercuDessiner(c){
  const A = ROUTAGE && ROUTAGE.apercu;
  if(!A) return;
  if(A.ver !== S.ver){ ROUTAGE.apercu = null; return; }
  c.save();
  c.lineCap = "round"; c.globalAlpha = 0.9; c.setLineDash([px(5), px(3)]);
  for(const t of A.pistes){
    c.strokeStyle = layerColor(t.l); c.lineWidth = t.w;
    c.beginPath(); c.moveTo(t.x1, t.y1); c.lineTo(t.x2, t.y2); c.stroke();
  }
  c.setLineDash([]); c.fillStyle = C_SEL;
  for(const v of A.vias){ c.beginPath(); c.arc(v.x, v.y, v.d / 2, 0, Math.PI * 2); c.fill(); }
  c.restore();
}

class RoutageRefus extends Error {}
const routageRefus = t => new RoutageRefus(t);

/* « U1.3 » : la pastille, sa position monde et ses couches ; {x, y} : un point libre. */
function routageCouche(nom){
  for(let i = 0; i < S.cu; i++) if(LECTURE_CAO.aides.nomCouchePcb(i).toLowerCase() === String(nom).toLowerCase()) return i;
  throw routageRefus("couche « " + nom + " » inconnue (" + [...Array(S.cu).keys()].map(LECTURE_CAO.aides.nomCouchePcb).join(", ") + ")");
}
function routagePoint(p){
  if(typeof p === "string"){
    const m = p.match(/^\s*([^.\s]+)\.(\S+)\s*$/);
    const fp = m && S.fps.find(f => String(f.ref).toUpperCase() === m[1].toUpperCase());
    const q = fp && padsWorld(fp).find(x => String(x.n).toUpperCase() === m[2].toUpperCase());
    if(!q) throw routageRefus("pastille « " + p + " » introuvable (voir cao_pcb_lire composant)");
    return {x:q.x, y:q.y, couches:padCuLayers(fp, q), nom:fp.ref + "." + q.n, net:q.net || ""};
  }
  if(!p || typeof p !== "object" || !Number.isFinite(p.x) || !Number.isFinite(p.y) || Math.abs(p.x) > 1000 || Math.abs(p.y) > 1000)
    throw routageRefus("point : « REF.pastille » ou {x, y} en mm (±1000)");
  return {x:r3(p.x), y:r3(p.y), couche:p.couche != null ? routageCouche(p.couche) : null, nom:"(" + r3(p.x) + ", " + r3(p.y) + ")"};
}

/* Une route : tout ou rien. L'instantané du départ la défait entière si un pas échoue. */
function routageUneRoute(r){
  const avant = serialize();
  try{
    if(!r || typeof r !== "object") throw routageRefus("route : un objet {depart, points, arrivee}");
    const dep = routagePoint(r.depart), arr = routagePoint(r.arrivee);
    const pts = Array.isArray(r.points) ? r.points : [];
    if(pts.length > ROUTAGE_POINTS) throw routageRefus(ROUTAGE_POINTS + " points au plus par route");
    const etapes = pts.map(routagePoint).concat([arr]);
    const couche0 = r.couche != null ? routageCouche(r.couche)
                  : dep.couches ? (dep.couches.includes(S.active) ? S.active : dep.couches[0]) : (dep.couche != null ? dep.couche : S.active);
    if(dep.couches && !dep.couches.includes(couche0)) throw routageRefus(dep.nom + " n'est pas sur " + LECTURE_CAO.aides.nomCouchePcb(couche0));
    S.active = couche0;
    startRoute(dep.x, dep.y, true);
    const R = S.route;
    if(!R || !R.net) throw routageRefus("le départ " + dep.nom + " n'est sur le cuivre d'aucun net");
    if(r.largeur != null){
      if(typeof r.largeur !== "number" || !(r.largeur >= 0.05 && r.largeur <= 10)) throw routageRefus("largeur de 0,05 à 10 mm");
      R.w = r3(r.largeur);
    }
    const net = R.net;
    for(const [k, e] of etapes.entries()){
      if(!S.route) break;                                    // arrivé sur le cuivre du net : la route s'est posée
      const voulue = e.couche != null ? e.couche : (e.couches && !e.couches.includes(S.route.layer) ? e.couches[0] : null);
      if(voulue != null && voulue !== S.route.layer){
        routeToLayer(voulue);
        if(S.route.layer !== voulue) throw routageRefus("via refusée en (" + r3(S.route.pt.x) + ", " + r3(S.route.pt.y) + ") pour passer sur " + LECTURE_CAO.aides.nomCouchePcb(voulue));
      }
      routeToPoint({x:e.x, y:e.y});
      if(S.route.bad) throw routageRefus("bloquée vers " + e.nom + " : l'isolation de " + classOf(net).clr + " mm n'y passe pas");
      if(!S.route.preview.length) continue;               // déjà au point
      const n0 = S.route.done.length;
      stepRoute();
      if(S.route && S.route.done.length === n0) throw routageRefus("bloquée vers " + e.nom);
      if(!S.route && k < etapes.length - 1) throw routageRefus("elle a touché le cuivre de " + net + " avant le point " + (k + 1) + " : raccourcis-la");
    }
    if(S.route){
      if(arr.couches) throw routageRefus("l'arrivée " + arr.nom + " n'est pas atteinte sur une de ses couches");
      commitRoute();                                         // une arrivée libre : la route s'arrête là
    }
    return {net, ok:true};
  }catch(err){
    if(S.route) cancelRoute();
    S.route = null;
    loadDoc(JSON.parse(avant), true);
    if(err instanceof RoutageRefus) return {ok:false, raison:err.message};
    throw err;
  }
}

/* Une via seule : {x, y, net, de?, a?} ; refusée par la page si elle gêne. */
function routageUneVia(v){
  if(!v || !Number.isFinite(v.x) || !Number.isFinite(v.y) || Math.abs(v.x) > 1000 || Math.abs(v.y) > 1000)
    return {ok:false, raison:"via : {x, y, net} en mm (±1000)"};
  if(typeof v.net !== "string" || !netTable().some(n => n.name === v.net)) return {ok:false, raison:"via : net « " + v.net + " » inconnu"};
  let a = 0, b = S.cu - 1;
  try{ if(v.de != null) a = routageCouche(v.de); if(v.a != null) b = routageCouche(v.a); }
  catch(e){ return {ok:false, raison:e.message}; }
  const fait = placeVia(r3(v.x), r3(v.y), v.net, Math.min(a, b), Math.max(a, b), false);
  return fait ? {ok:true, net:v.net} : {ok:false, raison:"la page la refuse en (" + r3(v.x) + ", " + r3(v.y) + ") : elle gênerait le cuivre voisin"};
}

/* Le socle : jouer pour de vrai, relever, remettre. Rend {lignes, resultat, ver, apercu}. */
function routageSimuler(jouer){
  const sel = {fps:[...S.sel.fps], pistes:S.tracks.map((t, i) => S.sel.tracks.has(t) ? i : -1).filter(i => i >= 0),
               vias:S.vias.map((v, i) => S.sel.vias.has(v) ? i : -1).filter(i => i >= 0)};
  const garde = {doc:serialize(), undo:S.undo.slice(), redo:S.redo.slice(), dirty:S.dirty, vue:[S.scale, S.ox, S.oy],
                 active:S.active, avoid:S.avoid, hlNet:S.hlNet};
  const cles = d => new Set([...d.tracks.map(t => JSON.stringify(t)), ...d.vias.map(v => JSON.stringify(v))]);
  let lignes, resultat;
  try{
    S.avoid = true;
    lignes = jouer();
    resultat = serialize();
  }finally{
    if(S.route) cancelRoute();
    S.route = null;
    loadDoc(JSON.parse(garde.doc), true);
    S.undo = garde.undo; S.redo = garde.redo; S.dirty = garde.dirty;
    [S.scale, S.ox, S.oy] = garde.vue;
    S.active = garde.active; S.avoid = garde.avoid; S.hlNet = garde.hlNet;
    clearSel();
    sel.fps.forEach(id => S.sel.fps.add(id));
    sel.pistes.forEach(i => S.tracks[i] && S.sel.tracks.add(S.tracks[i]));
    sel.vias.forEach(i => S.vias[i] && S.sel.vias.add(S.vias[i]));
  }
  const avant = cles(JSON.parse(garde.doc)), apres = JSON.parse(resultat);
  const apercu = {pistes:apres.tracks.filter(t => !avant.has(JSON.stringify(t))),
                  vias:apres.vias.filter(v => !avant.has(JSON.stringify(v))), ver:S.ver};
  return {lignes, resultat, ver:S.ver, apercu};
}

/* Une commande « simuler puis charger ». `jouer(args)` rend les lignes de la carte et
   lève une Error si le lot n'a pas de sens ; `titre(args)` nomme la carte. */
function routageCommande(titre, jouer){
  return {
    ecriture:true, historique:true,
    proposer:args => {
      const s = routageSimuler(() => jouer(args));
      if(!s.lignes.some(l => l.ok)) throw new Error("Rien n'est posé : " + s.lignes.map(l => l.texte).join(" ; "));
      ROUTAGE.apercu = s.apercu;
      draw();
      return {titre:titre(args), avant:"", apres:s.lignes.map(l => l.texte).join("\n"), resultat:s.resultat, ver:s.ver};
    },
    appliquer:(args, prop) => {
      if(!prop || !prop.resultat) throw new Error("Carte sans résultat : à reproposer.");
      if(S.ver !== prop.ver) throw new Error("La carte a changé depuis la proposition : rien n'est appliqué, à reproposer.");
      const avant = ECRITURE_CAO.drc.erreurs();
      push();
      loadDoc(JSON.parse(prop.resultat), true);
      ROUTAGE.apercu = null;
      touch(); refreshPanels(); draw();
      prop.apres += "\n" + ECRITURE_CAO.drc.bilan(avant, ECRITURE_CAO.drc.erreurs());
    },
  };
}

/* cao_router : routes et vias seules, une carte. */
function routageJouerRoutes(a){
  const routes = Array.isArray(a.routes) ? a.routes : [], vias = Array.isArray(a.vias) ? a.vias : [];
  if(!routes.length && !vias.length) throw new Error("Rien à router : « routes » ou « vias ».");
  if(routes.length > ROUTAGE_MAX) throw new Error(ROUTAGE_MAX + " routes au plus par carte.");
  if(vias.length > ROUTAGE_VIAS) throw new Error(ROUTAGE_VIAS + " vias seules au plus par carte.");
  if(a.mode != null && a.mode !== "pousser" && a.mode !== "contourner") throw new Error("« mode » : pousser ou contourner.");
  S.rule.route = a.mode === "contourner" ? "walk" : "shove";   // remis avec le document après la simulation
  S.rule.corner = "45";
  const lignes = [];
  routes.forEach((r, k) => {
    const res = routageUneRoute(r);
    lignes.push({ok:res.ok, texte:"route " + (k + 1) + (res.net ? " (" + res.net + ")" : "") + " : " + (res.ok ? "posée" : "refusée, " + res.raison)});
  });
  vias.forEach((v, k) => {
    const res = routageUneVia(v);
    lignes.push({ok:res.ok, texte:"via " + (k + 1) + (res.net ? " (" + res.net + ")" : "") + " : " + (res.ok ? "posée" : "refusée, " + res.raison)});
  });
  return lignes;
}

function routagePiloteCommandes(){
  return {
    cao_router: routageCommande(a => "Routage (" + ((a.routes || []).length) + " route(s), " + ((a.vias || []).length) + " via(s))", routageJouerRoutes),
  };
}
