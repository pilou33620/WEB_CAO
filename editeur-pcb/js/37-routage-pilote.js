/* ==========================================================================
   Routage par Claude (web_suite, module routage)
   --------------------------------------------------------------------------
   Claude donne des points de passage ; le routeur de la page (push-and-shove)
   fait le détail. Un lot de routes est une carte du canal de pilotage.

   SIMULER, RELEVER, PUIS CHARGER. Le routeur a un garde-temps : le rejouer au
   clic pourrait donner un autre tracé sur une machine lente. `proposer` fait
   donc le lot pour de vrai, relève le document obtenu, puis remet l'original
   (loadDoc, comme Ctrl+Z). Au clic, si le cuivre n'a pas bougé, la page pousse
   UNE étape d'historique et reprend du relevé le cuivre et les empreintes
   SEULEMENT (CUIVRE ci-dessous) : réglages, couche active, couches visibles
   restent ceux de l'utilisateur. Le tracé appliqué est celui de l'aperçu,
   dessiné en pointillés tant que la carte attend.

   Positions en mm, dans le repère des lectures (cao_pcb_lire liaisons, zone).
   Spec : web_suite/lanceur/docs/SPEC-mcp-routage.md.
   ========================================================================== */
"use strict";

const ROUTAGE_MAX = 20, ROUTAGE_POINTS = 200, ROUTAGE_VIAS = 50;
const ROUTAGE_POINTS_LOT = 1000, ROUTAGE_BUDGET_MS = 10000;   // le lot entier : la page reste utilisable
const CUIVRE = ["fps", "tracks", "vias", "zones", "holes", "nextId"];   // ce qu'une carte de routage ou de placement change
const routageCuivre = d => JSON.stringify(CUIVRE.map(k => d[k]));
// un nom venu du projet ne fabrique pas d'autre ligne sur la carte
const routagePropre = t => String(t == null ? "" : t).replace(/[\x00-\x1f\x7f\u2028\u2029]/g, " ").slice(0, 120);
// var, pas const : dans le bundle d'un seul script, paint() la lit avant que ce fichier ne s'exécute
var ROUTAGE = { apercu: null };      // apercu : {pistes, vias, retirees, fps, ver}, ce que la carte en attente posera

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
    c.beginPath(); trkPath(c, t); c.stroke();
  }
  // le cuivre existant que la poussée déplace ou retire, en rouge : on voit aussi ce qui part
  c.strokeStyle = C_ERR;
  for(const t of A.retirees || []){ c.lineWidth = t.w; c.beginPath(); trkPath(c, t); c.stroke(); }
  c.setLineDash([]); c.fillStyle = C_SEL;
  for(const v of A.vias){ c.beginPath(); c.arc(v.x, v.y, v.d / 2, 0, Math.PI * 2); c.fill(); }
  // les empreintes qu'un placement déplace : leur nouvelle place en pointillés, et le trajet depuis l'ancienne
  c.strokeStyle = C_SEL; c.lineWidth = px(1.5);
  for(const f of A.fps || []){
    c.setLineDash([px(5), px(3)]); c.strokeRect(f.b.x1, f.b.y1, f.b.x2 - f.b.x1, f.b.y2 - f.b.y1);
    c.setLineDash([]); c.beginPath(); c.moveTo(f.x0, f.y0); c.lineTo(f.x, f.y); c.stroke();
    c.beginPath(); c.arc(f.x, f.y, px(3), 0, Math.PI * 2); c.fill();
  }
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
    if(dep.net && arr.net && dep.net !== arr.net) throw routageRefus(dep.nom + " (" + routagePropre(dep.net) + ") et " + arr.nom + " (" + routagePropre(arr.net) + ") ne sont pas sur le même net");
    // la couche de départ ne dépend pas de celle affichée : celle donnée, sinon la première de la pastille
    const couche0 = r.couche != null ? routageCouche(r.couche)
                  : dep.couches ? dep.couches[0] : (dep.couche != null ? dep.couche : 0);
    if(dep.couches && !dep.couches.includes(couche0)) throw routageRefus(dep.nom + " n'est pas sur " + LECTURE_CAO.aides.nomCouchePcb(couche0));
    S.active = couche0;
    startRoute(dep.x, dep.y, true);
    const R = S.route;
    if(!R || !R.net) throw routageRefus("le départ " + dep.nom + " n'est sur le cuivre d'aucun net");
    let largeur = null;
    if(r.largeur != null){
      if(typeof r.largeur !== "number" || !(r.largeur >= 0.05 && r.largeur <= 10)) throw routageRefus("largeur de 0,05 à 10 mm");
      R.w = largeur = r3(r.largeur);
    }
    const net = R.net;
    for(const [k, e] of etapes.entries()){
      if(!S.route) break;                                    // arrivé sur le cuivre du net : la route s'est posée
      const voulue = e.couche != null ? e.couche : (e.couches && !e.couches.includes(S.route.layer) ? e.couches[0] : null);
      if(voulue != null && voulue !== S.route.layer){
        // une via sur la pastille de départ n'est pas un choix à faire en silence
        if(e.couche == null && S.route.pt.x === dep.x && S.route.pt.y === dep.y)
          throw routageRefus(e.nom + " n'est pas sur la couche de départ : donne un point avec « couche » là où poser la via");
        routeToLayer(voulue);
        if(S.route.layer !== voulue) throw routageRefus("via refusée en (" + r3(S.route.pt.x) + ", " + r3(S.route.pt.y) + ") pour passer sur " + LECTURE_CAO.aides.nomCouchePcb(voulue));
        if(largeur != null) S.route.w = largeur;            // routeToLayer reprend la largeur de la classe
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
    return {net:routagePropre(net), ok:true};
  }catch(err){
    if(S.route) cancelRoute();
    S.route = null;
    loadDoc(JSON.parse(avant), true);
    if(err instanceof RoutageRefus) return {ok:false, raison:err.message};
    throw err;
  }
}

/* Une paire déclarée : départ (un bout libre des deux nets, ou une de leurs pastilles), points
   de passage, arrivée. L'échelle de vue est fixée pendant le jeu (remise avec la vue) : les
   accroches de dpStart et dpUpdate se mesurent en pixels d'écran. */
function routageUnePaire(a){
  const avant = serialize();
  try{
    const pair = (S.dpPairs || []).find(x => typeof a.paire === "string" && x.name.toUpperCase() === a.paire.toUpperCase());
    if(!pair) throw routageRefus("paire « " + routagePropre(a.paire) + " » inconnue (" + ((S.dpPairs || []).map(x => routagePropre(x.name)).join(", ") || "aucune déclarée") + ")");
    const dep = routagePoint(a.depart), arr = routagePoint(a.arrivee);
    const pts = Array.isArray(a.points) ? a.points : [];
    if(pts.length > ROUTAGE_POINTS) throw routageRefus(ROUTAGE_POINTS + " points au plus");
    const etapes = pts.map(routagePoint).concat([arr]);
    S.scale = 20;
    S.active = a.couche != null ? routageCouche(a.couche) : (dep.couches ? dep.couches[0] : (dep.couche != null ? dep.couche : S.active));
    if(!dpStart(dep.x, dep.y)) throw routageRefus("pas de départ de la paire en " + dep.nom + " sur " + LECTURE_CAO.aides.nomCouchePcb(S.active) + " : un bout libre de ses deux nets");
    if(S.dp.pair !== pair) throw routageRefus("le départ " + dep.nom + " est sur la paire " + S.dp.pair.name + ", pas sur " + pair.name);
    for(const [k, e] of etapes.entries()){
      if(!S.dp) throw routageRefus("elle a rejoint ses pastilles avant le point " + (k + 1) + " : raccourcis-la");
      if(e.couche != null && e.couche !== S.dp.layer){
        dpToLayer(e.couche);
        if(S.dp.layer !== e.couche) throw routageRefus("vias de la paire refusées avant " + e.nom);
      }
      dpUpdate(e.x, e.y);
      if(S.dp.bad) throw routageRefus(S.dp.cross ? "les deux pistes arriveraient croisées vers " + e.nom : "bloquée vers " + e.nom + " : l'isolation n'y passe pas");
      const n0 = S.dp.doneP.length + S.dp.doneN.length;
      dpStep();
      if(S.dp && S.dp.doneP.length + S.dp.doneN.length === n0) throw routageRefus("bloquée vers " + e.nom);
    }
    if(S.dp){
      // une arrivée sur le cuivre de la paire (pastilles, ou le milieu que rend cao_chemin) doit s'y accrocher
      if(arr.couches || [...Array(S.cu).keys()].some(l => dpPrimPair(pair, arr.x, arr.y, l, CHEMIN.ACCROCHE_PAIRE)))
        throw routageRefus("l'arrivée " + arr.nom + " n'est pas accrochée par les deux pistes");
      dpCommit();                                            // une arrivée libre : la paire s'arrête là
    }
    return {ok:true, net:routagePropre(pair.p) + " / " + routagePropre(pair.n)};
  }catch(err){
    if(S.dp) dpCancel();
    S.dp = null;
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
  return fait ? {ok:true, net:routagePropre(v.net)} : {ok:false, raison:"la page la refuse en (" + r3(v.x) + ", " + r3(v.y) + ") : elle gênerait le cuivre voisin"};
}

/* Le socle : jouer pour de vrai, relever, remettre. Rend {lignes, resultat, cuivre, apercu}.
   Refuse si un geste est en cours dans l'éditeur : la simulation le détruirait. Remet tout ce que
   loadDoc touche hors du document (DRC, paire de couches, sélection, message d'aide). */
function routageSimuler(jouer){
  if(S.route || S.dp || S.zoneDraft || S.cutDraft || S.edgeDraft || S.meanderDraft || S.dragShove)
    throw new Error("Un tracé est en cours dans l'éditeur : termine-le (ou Échap), puis repropose.");
  const listes = {fps:S.fps, tracks:S.tracks, vias:S.vias, zones:S.zones, cuts:S.cuts, holes:S.holes || [], drawings:S.drawings || []};
  // un objet sélectionné est repris par son rang (loadDoc refait les objets), un identifiant tel quel
  const sel = Object.entries(S.sel).filter(([, v]) => v instanceof Set).map(([k, v]) =>
    [k, [...v].map(x => x && typeof x === "object" && listes[k] ? {rang:listes[k].indexOf(x)} : {id:x})]);
  const aide = typeof document !== "undefined" && document.getElementById("fHint");
  const garde = {doc:serialize(), undo:S.undo.slice(), redo:S.redo.slice(), dirty:S.dirty, vue:[S.scale, S.ox, S.oy],
                 active:S.active, avoid:S.avoid, hlNet:S.hlNet, pair:S.pair, drc:S.drc, drcRun:S.drcRun,
                 edge:S.sel.edge, aide:aide ? aide.textContent : null, t0:Date.now()};
  let lignes, resultat, fps;
  try{
    S.avoid = true;
    ROUTAGE.budget = garde.t0 + ROUTAGE_BUDGET_MS;
    lignes = jouer();
    resultat = serialize();
    const d0 = new Map(JSON.parse(garde.doc).fps.map(f => [f.ref, f]));
    fps = S.fps.filter(f => { const o = d0.get(f.ref); return o && (o.x !== f.x || o.y !== f.y || (o.rot || 0) !== (f.rot || 0) || !!o.side !== !!f.side); })
      .map(f => ({x0:d0.get(f.ref).x, y0:d0.get(f.ref).y, x:f.x, y:f.y, b:fpBBox(f)}));
  }finally{
    if(S.route) cancelRoute();
    if(S.dp) dpCancel();
    S.route = null; S.dp = null; ROUTAGE.budget = null;
    loadDoc(JSON.parse(garde.doc), true);
    S.undo = garde.undo; S.redo = garde.redo; S.dirty = garde.dirty;
    [S.scale, S.ox, S.oy] = garde.vue;
    Object.assign(S, {active:garde.active, avoid:garde.avoid, hlNet:garde.hlNet, pair:garde.pair, drc:garde.drc, drcRun:garde.drcRun});
    const listes2 = {fps:S.fps, tracks:S.tracks, vias:S.vias, zones:S.zones, cuts:S.cuts, holes:S.holes || [], drawings:S.drawings || []};
    clearSel();
    for(const [k, xs] of sel) for(const x of xs){
      const v = "rang" in x ? listes2[k] && listes2[k][x.rang] : x.id;
      if(v !== undefined && v !== null) S.sel[k].add(v);
    }
    S.sel.edge = garde.edge;
    if(aide) aide.textContent = garde.aide;
    refreshPanels(); draw();
  }
  const d0 = JSON.parse(garde.doc), d1 = JSON.parse(resultat);
  const cles = d => new Set([...d.tracks.map(t => JSON.stringify(t)), ...d.vias.map(v => JSON.stringify(v))]);
  const avant = cles(d0), apres = cles(d1);
  const apercu = {pistes:d1.tracks.filter(t => !avant.has(JSON.stringify(t))),
                  vias:d1.vias.filter(v => !avant.has(JSON.stringify(v))),
                  retirees:d0.tracks.filter(t => !apres.has(JSON.stringify(t))), fps, ver:S.ver};
  const nRetirees = apercu.retirees.length + d0.vias.filter(v => !apres.has(JSON.stringify(v))).length;
  if(nRetirees) lignes.push({ok:true, texte:"attention : " + nRetirees + " piste(s) ou via(s) existante(s) déplacée(s) ou retirée(s) par la poussée (en rouge sur l'aperçu)"});
  return {lignes, resultat:JSON.stringify(CUIVRE.map(k => d1[k])), cuivre:routageCuivre(d0), apercu};
}

/* Le temps du lot est borné : passé le budget, les routes qui restent sont refusées (le jeu tourne
   dans la page, et un routeur qui pousse longtemps la figerait). */
const routageHorsBudget = () => ROUTAGE.budget && Date.now() > ROUTAGE.budget;

/* Une commande « simuler puis charger ». `jouer(args)` rend les lignes de la carte et
   lève une Error si le lot n'a pas de sens ; `titre(args)` nomme la carte. Au clic, seuls le
   cuivre et les empreintes du relevé sont repris, si ceux du document n'ont pas bougé. */
function routageCommande(titre, jouer){
  return {
    ecriture:true, historique:true,
    proposer:args => {
      const s = routageSimuler(() => jouer(args));
      if(!s.lignes.some(l => l.ok && !/^attention/.test(l.texte))) throw new Error("Rien n'est posé : " + s.lignes.map(l => l.texte).join(" ; "));
      ROUTAGE.apercu = s.apercu;
      draw();
      return {titre:titre(args), avant:"", apres:s.lignes.map(l => l.texte).join("\n"), resultat:s.resultat, cuivre:s.cuivre};
    },
    appliquer:(args, prop) => {
      if(!prop || !prop.resultat) throw new Error("Carte sans résultat : à reproposer.");
      const doc = JSON.parse(serialize());
      if(routageCuivre(doc) !== prop.cuivre){
        ROUTAGE.apercu = null; draw();
        throw new Error("Le cuivre a changé depuis la proposition : rien n'est appliqué, à reproposer.");
      }
      let avant = null;
      try{ avant = ECRITURE_CAO.drc.erreurs(); }catch(e){}
      ECRITURE_CAO.pousser();
      JSON.parse(prop.resultat).forEach((v, i) => { doc[CUIVRE[i]] = v; });
      loadDoc(doc, true);
      ROUTAGE.apercu = null; prop.resultat = null;          // le document relevé ne sert plus
      touch(); refreshPanels(); draw();
      // le lot est appliqué : un DRC qui échoue ne doit pas le faire passer pour raté
      try{ prop.apres += "\n" + ECRITURE_CAO.drc.bilan(avant || [], ECRITURE_CAO.drc.erreurs()); }
      catch(e){ prop.apres += "\nDRC indisponible après l'écriture : " + ((e && e.message) || e); }
    },
    // la carte refusée dans le panneau : son aperçu s'en va (pilote.js appelle ce crochet)
    refuser:() => { ROUTAGE.apercu = null; draw(); },
  };
}

/* cao_router : routes et vias seules, une carte. */
function routageJouerRoutes(a){
  const routes = Array.isArray(a.routes) ? a.routes : [], vias = Array.isArray(a.vias) ? a.vias : [];
  if(!routes.length && !vias.length) throw new Error("Rien à router : « routes » ou « vias ».");
  if(routes.length > ROUTAGE_MAX) throw new Error(ROUTAGE_MAX + " routes au plus par carte.");
  if(vias.length > ROUTAGE_VIAS) throw new Error(ROUTAGE_VIAS + " vias seules au plus par carte.");
  const total = routes.reduce((t, r) => t + (r && Array.isArray(r.points) ? r.points.length : 0), 0);
  if(total > ROUTAGE_POINTS_LOT) throw new Error(ROUTAGE_POINTS_LOT + " points de passage au plus par carte (" + total + " donnés).");
  if(a.mode != null && a.mode !== "pousser" && a.mode !== "contourner") throw new Error("« mode » : pousser ou contourner.");
  S.rule.route = a.mode === "contourner" ? "walk" : "shove";   // remis avec le document après la simulation
  if(S.rule.corner !== "arc") S.rule.corner = "45";   // l'arrondi réglé se garde : arcs posés aux coudes
  const lignes = [];
  routes.forEach((r, k) => {
    const res = routageHorsBudget() ? {ok:false, raison:"temps du lot épuisé (" + ROUTAGE_BUDGET_MS / 1000 + " s) : repropose-la dans une autre carte"}
                                    : routageUneRoute(r);
    lignes.push({ok:res.ok, texte:"route " + (k + 1) + (res.net ? " (" + res.net + ")" : "") + " : " + (res.ok ? "posée" : "refusée, " + res.raison)});
  });
  vias.forEach((v, k) => {
    const res = routageUneVia(v);
    lignes.push({ok:res.ok, texte:"via " + (k + 1) + (res.net ? " (" + res.net + ")" : "") + " : " + (res.ok ? "posée" : "refusée, " + res.raison)});
  });
  return lignes;
}

function routageJouerPaire(a){
  if(a.mode != null && a.mode !== "pousser" && a.mode !== "contourner") throw new Error("« mode » : pousser ou contourner.");
  S.rule.route = a.mode === "contourner" ? "walk" : "shove";
  const r = routageUnePaire(a);
  return [{ok:r.ok, texte:"paire " + a.paire + (r.ok ? " (" + r.net + ") : posée" : " : refusée, " + r.raison)}];
}

/* cao_placement_auto : les placements de la page, sur le même socle (une carte, une étape). */
function routageJouerPlacement(a){
  const pos = () => new Map(S.fps.map(f => [f.ref, f.x + "," + f.y + "," + (f.rot || 0) + "," + (f.side || 0)]));
  const avant = pos();
  let dit = "";
  if(a.methode === "forces"){
    const r = autoPlace(150);
    if(!r) throw new Error("Placement par forces : il faut au moins deux empreintes libres (non fixées à la main).");
    const sat = [r.decouplage && r.decouplage + " découplage(s)", r.serie && r.serie + " série", r.chaine && r.chaine + " en chaîne"].filter(Boolean);
    dit = sat.length ? " ; contre leur broche : " + sat.join(", ") : "";
  }else if(a.methode === "satellites"){
    const r = placerSatellites();
    dit = " ; " + (r.decouplage || 0) + " découplage(s), " + (r.serie || 0) + " série, " + (r.chaine || 0) + " en chaîne" +
          (r.sansPlace && r.sansPlace.length ? " ; sans place : " + r.sansPlace.join(", ") : "");
  }else if(a.methode === "blocs"){
    // les motifs que le schéma a publiés (getPatterns().motifs : id, label) et les zones (id, nom)
    const pat = typeof BLOC_PLACEMENT !== "undefined" ? BLOC_PLACEMENT.getPatterns() : null;
    const noms = [...((pat && Array.isArray(pat.motifs)) ? pat.motifs.map(m => m.label || m.id) : []),
                  ...(typeof BLOC_PLACEMENT !== "undefined" ? BLOC_PLACEMENT.getZones() : []).map(z => z.nom || z.id)].filter(Boolean);
    const liste = noms.join(", ") || "aucun motif publié par le schéma";
    if(typeof a.motif !== "string" || !a.motif) throw new Error("Placement par blocs : donne « motif » (" + liste + ").");
    if(!BLOC_PLACEMENT.compacterSurPlace(a.motif)) throw new Error("Motif « " + a.motif + " » inconnu ou trop petit (" + liste + ").");
    dit = " ; motif " + a.motif;
  }else throw new Error("« methode » : forces, satellites ou blocs.");
  const apres = pos(), bouges = [...apres.keys()].filter(r => apres.get(r) !== avant.get(r));
  return [{ok:bouges.length > 0, texte:"placement " + a.methode + " : " + bouges.length + " empreinte(s) déplacée(s)" +
           (bouges.length ? " (" + bouges.slice(0, 40).join(", ") + (bouges.length > 40 ? "…" : "") + ")" : "") + dit}];
}

/* cao_score : lectures. Le routage se juge sur le DRC de la page, qui contient déjà les écarts
   aux contraintes (« Contrainte … ») et aux groupes de longueur (« Groupe … ») ; le placement,
   sur le score du serveur (le même document que le panneau de placement). */
function routageScoreRoutage(){
  const c = conn(true), drc = runDrc();
  const err = drc.filter(d => !d.info), rem = drc.filter(d => d.info);
  const classe = re => drc.filter(d => re.test(d.msg)).length;
  const longueur = S.tracks.reduce((t, x) => t + trkLen(x), 0);
  const total = 10 * c.unrouted + 5 * err.length + rem.length + 0.2 * S.vias.length;
  return ["Score de routage (plus bas = mieux) :",
          "- liaisons restantes : " + c.unrouted,
          "- DRC : " + err.length + " erreur(s), " + rem.length + " remarque(s) ; dont contraintes " + classe(/^Contrainte (?!.*(topolog|moignon))/i) +
            ", groupes de longueur " + classe(/^Groupe /) + ", topologie " + classe(/topolog|moignon/i),
          "- vias : " + S.vias.length + " ; longueur totale de pistes : " + r3(longueur) + " mm",
          "- total indicatif : " + r3(total) + " (10 par liaison restante, 5 par erreur, 1 par remarque, 0,2 par via)"].join("\n");
}
async function routageScorePlacement(){
  const doc = PLACEMENT_SCORE.documentPcb();
  if(!doc || !doc.footprints || !doc.footprints.length) throw new Error("Aucune empreinte sur la carte.");
  const rep = await fetch("/api/pcb/score-placement", {method:"POST", headers:Object.assign({"Content-Type":"application/json"},ENTETE_WEB), body:JSON.stringify(doc),
                                                         signal:typeof AbortSignal !== "undefined" && AbortSignal.timeout ? AbortSignal.timeout(20000) : undefined});
  let d = null;
  try{ d = await rep.json(); }catch(e){}
  if(!rep.ok || !d || !d.succes) throw new Error("Le serveur n'a pas pu scorer le placement : " + routagePropre((d && d.detail) || ("HTTP " + rep.status)));
  const court = v => { const t = JSON.stringify(v); return t.length > 600 ? t.slice(0, 600) + "…" : t; };
  const L = ["Score de placement (serveur) :", "- longueur des liaisons (HPWL) : " + r3(d.hpwl_mm) + " mm"];
  for(const k of ["top_contributeurs", "congestion", "decouplage", "ordonnancement"]) if(d[k] != null) L.push("- " + k + " : " + court(d[k]));
  return L.join("\n");
}

function routagePiloteCommandes(){
  return {
    cao_score: {executer: async a => {
      if(a.quoi === "routage") return routageScoreRoutage();
      if(a.quoi === "placement") return routageScorePlacement();
      throw new Error("« quoi » : routage ou placement.");
    }},
    cao_placement_auto: routageCommande(a => "Placement automatique (" + a.methode + ")", routageJouerPlacement),
    cao_paire: routageCommande(a => "Paire différentielle " + a.paire, routageJouerPaire),
    cao_router: routageCommande(a => "Routage (" + ((a.routes || []).length) + " route(s), " + ((a.vias || []).length) + " via(s))", routageJouerRoutes),
    // une lecture : des points de passage proposés, rien n'est écrit (40-chemin-auto.js)
    cao_chemin: {executer: async a => cheminCommande(a)},
  };
}
