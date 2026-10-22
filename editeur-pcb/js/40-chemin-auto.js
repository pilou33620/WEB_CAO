/* ==========================================================================
   Chercheur de chemin (web_suite, module chemin-auto)
   --------------------------------------------------------------------------
   Pour une liaison (REF.pastille → REF.pastille), un premier tracé : A* sur une
   grille par couche, en huit directions (angles de 45°, jamais de virage aigu),
   une via là où toutes les couches qu'elle traverse sont libres. Le cuivre des
   autres nets est gonflé de l'isolation (clrK) et de la demi-largeur de la piste ;
   bord de carte, découpes et trous NPTH aussi. Les zones de cuivre ne gênent
   pas : elles se recoulent autour de la piste.

   Rien n'est écrit : la réponse est la liste de points de passage qu'attend
   cao_router, qui fait le détail (contournement, poussée) et passe par sa carte.
   Les liaisons d'un appel se cherchent dans l'ordre, chaque chemin trouvé
   devenant un obstacle pour les suivantes. Le routeur lui-même n'est pas touché.

   Une PAIRE différentielle déclarée ({paire, depart:[P, N], arrivee:[P, N]}) se
   cherche par son axe : une piste aussi large que ses deux pistes et leur écart
   (règle de paire), du milieu de ses deux pastilles de départ au milieu de celles
   d'arrivée. Elle change de couche par une via de paire (les deux vias côte à côte
   que pose cao_paire), jamais à portée de ses pastilles. Les points rendus vont à
   cao_paire, qui fait les éventails.
   Spec : web_suite/lanceur/docs/SPEC-mcp-chemin-auto.md.
   ========================================================================== */
"use strict";

const CHEMIN = { MAX: 20, CELLULES: 2e6, BUDGET_MS: 8000, VIA_MM: 10, VIRAGE_MM: 0.3, PAS: 0.25, ACCROCHE_PAIRE: 1.25 };
// les huit directions, dans l'ordre des angles (d × 45°) : l'écart de deux rangs dit le virage
const CHEMIN_DX = [1, 1, 0, -1, -1, -1, 0, 1], CHEMIN_DY = [0, 1, 1, 1, 0, -1, -1, -1];

/* La grille couvre la boîte du contour ; le pas grossit tant qu'elle dépasse CHEMIN.CELLULES. */
function cheminGrille(pas){
  const b = polyBBox(boardPoly());
  let p = pas;
  for(;;){
    const nx = Math.floor((b.x2 - b.x1) / p) + 1, ny = Math.floor((b.y2 - b.y1) / p) + 1;
    if(nx * ny * S.cu <= CHEMIN.CELLULES) return {x0:b.x1, y0:b.y1, nx, ny, L:S.cu, pas:r3(p)};
    p *= 1.25;
  }
}

/* Marque (1) les cellules de la couche l, dans la boîte, où `bloque(x, y)` est vrai. */
function cheminBoite(T, g, l, x1, y1, x2, y2, bloque){
  const i1 = Math.max(0, Math.floor((x1 - g.x0) / g.pas)), i2 = Math.min(g.nx - 1, Math.ceil((x2 - g.x0) / g.pas));
  const j1 = Math.max(0, Math.floor((y1 - g.y0) / g.pas)), j2 = Math.min(g.ny - 1, Math.ceil((y2 - g.y0) / g.pas));
  const base = l * g.nx * g.ny;
  for(let j = j1; j <= j2; j++){
    const y = g.y0 + j * g.pas;
    for(let i = i1; i <= i2; i++){
      const k = base + j * g.nx + i;
      if(!T[k] && bloque(g.x0 + i * g.pas, y)) T[k] = 1;
    }
  }
}
/* Un segment épaissi de R : des disques le long de l'axe (une boîte englobante d'une piste en
   diagonale ferait évaluer des milliers de cellules pour rien). Un arc : sa boîte, à la distance exacte. */
function cheminSegment(T, g, l, t, R){
  if(arcOf(t)){
    const b = trkBBox(t);
    cheminBoite(T, g, l, b.x1 - R, b.y1 - R, b.x2 + R, b.y2 + R, (x, y) => trkDist(x, y, t) < R);
    return;
  }
  const n = Math.max(1, Math.ceil(dist(t.x1, t.y1, t.x2, t.y2) / g.pas));
  const proche = (x, y) => segDist(x, y, t.x1, t.y1, t.x2, t.y2) < R;
  for(let s = 0; s <= n; s++){
    const x = t.x1 + (t.x2 - t.x1) * s / n, y = t.y1 + (t.y2 - t.y1) * s / n;
    cheminBoite(T, g, l, x - R, y - R, x + R, y + R, proche);
  }
}
/* Hors du contour, ou dans une découpe : bloqué sur toutes les couches (balayage ligne par ligne,
   pair-impair comme inPoly), puis la marge de bord le long de chaque côté. */
function cheminCarte(T, g, l, marge){
  const polys = [boardPoly()].concat(boardCutouts());
  const base = l * g.nx * g.ny;
  for(let j = 0; j < g.ny; j++){
    const y = g.y0 + j * g.pas, xs = [];
    for(const P of polys)
      for(let a = 0, b = P.length - 1; a < P.length; b = a++)
        if((P[a].y > y) !== (P[b].y > y)) xs.push((P[b].x - P[a].x) * (y - P[a].y) / (P[b].y - P[a].y) + P[a].x);
    xs.sort((u, v) => u - v);
    let dedans = false, c = 0;
    for(let i = 0; i < g.nx; i++){
      const x = g.x0 + i * g.pas;
      while(c < xs.length && xs[c] <= x){ dedans = !dedans; c++; }
      if(!dedans) T[base + j * g.nx + i] = 1;
    }
  }
  for(const P of polys)
    for(let a = 0, b = P.length - 1; a < P.length; b = a++)
      cheminSegment(T, g, l, {x1:P[b].x, y1:P[b].y, x2:P[a].x, y2:P[a].y}, marge);
}

/* Les deux grilles d'une liaison du net `net` : T (où l'axe d'une piste de largeur w peut passer)
   et V (où le centre d'une via peut tomber). `extra` : les chemins déjà trouvés dans l'appel. Le
   cuivre du net lui-même gêne aussi (le routeur s'arrête dès qu'il le touche), sauf les pastilles
   des deux bouts (`bouts` : leurs clés REF.n). Rv : le rayon de la via (d'une paire, ses deux vias). */
function cheminObstacles(g, nets, larg, extra, bouts, Rv){
  const net = nets[0];
  const N = g.nx * g.ny * g.L, T = new Uint8Array(N), V = new Uint8Array(N);
  const cl = classOf(net);
  const pads = [];
  for(const fp of S.fps) for(const q of padsWorld(fp)) if(!bouts.has(fp.ref + "." + q.n)) pads.push({q, L:padCuLayers(fp, q)});
  const trous = trousMonde();
  const ecart = (autre, ka, kb) => nets.includes(autre) ? 0.05 : clrK(net, autre || "", ka, kb);   // le même net : ne pas le toucher
  for(let l = 0; l < g.L; l++){
    const Rt = larg[l] / 2;
    cheminCarte(T, g, l, S.rule.edge + Rt);
    cheminCarte(V, g, l, S.rule.edge + Rv);
    for(const {q, L} of pads){
      if(!L.includes(l)) continue;
      const k = q.drill > 0 ? "th" : "smd", m = Math.max(q.w, q.h) / 2;
      for(const [G, R] of [[T, Rt + ecart(q.net, "trk", k)], [V, Rv + ecart(q.net, "via", k)]])
        cheminBoite(G, g, l, q.x - m - R, q.y - m - R, q.x + m + R, q.y + m + R, (x, y) => padDist(x, y, q) < R);
    }
    for(const t of S.tracks.concat(extra.pistes)){
      if(t.l !== l) continue;
      cheminSegment(T, g, l, t, t.w / 2 + Rt + ecart(t.net, "trk", "trk"));
      cheminSegment(V, g, l, t, t.w / 2 + Rv + ecart(t.net, "via", "trk"));
    }
    for(const v of S.vias.concat(extra.vias)){
      if(l < v.a || l > v.b) continue;
      for(const [G, R] of [[T, v.d / 2 + Rt + ecart(v.net, "trk", "via")], [V, v.d / 2 + Rv + ecart(v.net, "via", "via")]])
        cheminBoite(G, g, l, v.x - R, v.y - R, v.x + R, v.y + R, (x, y) => dist(x, y, v.x, v.y) < R);
    }
    for(const h of trous){
      const a = axePercage(h);
      for(const [G, R] of [[T, a.d / 2 + Rt + cl.clr], [V, a.d / 2 + Rv + cl.clr]])
        cheminSegment(G, g, l, a, R);
    }
  }
  return {T, V};
}

/* « REF.pastille » ou {x, y, couche?} : position, couches, et la pastille (pour dégager ses cellules). */
function cheminBout(p, quoi){
  if(typeof p === "string"){
    const m = p.match(/^\s*([^.\s]+)\.(\S+)\s*$/);
    const fp = m && S.fps.find(f => String(f.ref).toUpperCase() === m[1].toUpperCase());
    const q = fp && padsWorld(fp).find(x => String(x.n).toUpperCase() === m[2].toUpperCase());
    if(!q) throw new Error(quoi + " : pastille « " + routagePropre(p) + " » introuvable (voir cao_pcb_lire composant)");
    return {x:q.x, y:q.y, couches:padCuLayers(fp, q), q, nom:fp.ref + "." + q.n, net:q.net || ""};
  }
  const r = routagePoint(p);          // mêmes contrôles que cao_router (bornes, couche connue)
  return {x:r.x, y:r.y, couches:r.couche != null ? [r.couche] : [...Array(S.cu).keys()], q:null, nom:r.nom, net:""};
}

/* Tas binaire minimal sur f (A*). */
function cheminTas(){
  const f = [], k = [];
  return {
    vide:() => !f.length,
    mettre(fv, kv){
      let i = f.length; f.push(fv); k.push(kv);
      while(i > 0){ const p = (i - 1) >> 1; if(f[p] <= f[i]) break; [f[p], f[i]] = [f[i], f[p]]; [k[p], k[i]] = [k[i], k[p]]; i = p; }
    },
    prendre(){
      const top = k[0], fl = f.pop(), kl = k.pop();
      if(f.length){
        f[0] = fl; k[0] = kl;
        for(let i = 0;;){
          const a = 2 * i + 1, b = a + 1;
          let m = i;
          if(a < f.length && f[a] < f[m]) m = a;
          if(b < f.length && f[b] < f[m]) m = b;
          if(m === i) break;
          [f[m], f[i]] = [f[i], f[m]]; [k[m], k[i]] = [k[i], k[m]]; i = m;
        }
      }
      return top;
    }
  };
}

/* Une liaison : rend {points, couche, longueur, vias, pistes, viasPosees} ou lève une Error (raison). */
/* Un bout de paire : [« REF.pastille » de P, de N] → le milieu des deux, sur leurs couches communes. */
function cheminBoutPaire(v, pair, quoi){
  if(!Array.isArray(v) || v.length !== 2) throw new Error(quoi + " de la paire : [« REF.pastille » de " + routagePropre(pair.p) + ", de " + routagePropre(pair.n) + "]");
  const a = cheminBout(v[0], quoi), b = cheminBout(v[1], quoi);
  if(!a.q || !b.q) throw new Error(quoi + " de la paire : deux pastilles « REF.pastille »");
  const nets = [a.net, b.net].sort().join(), voulu = [pair.p, pair.n].sort().join();
  if(nets !== voulu) throw new Error(a.nom + " (" + routagePropre(a.net) + ") et " + b.nom + " (" + routagePropre(b.net) + ") ne sont pas les deux nets de la paire " + routagePropre(pair.name));
  return {x:r3((a.x + b.x) / 2), y:r3((a.y + b.y) / 2), couches:a.couches.filter(l => b.couches.includes(l)),
          q:null, nom:a.nom + "/" + b.nom, pads:[a.nom, b.nom], qs:[a.q, b.q], net:a.net, ancres:[{x:a.x, y:a.y}, {x:b.x, y:b.y}]};
}

function cheminUne(g, li, extra, fin){
  const pair = li.paire == null ? null : (S.dpPairs || []).find(x => typeof li.paire === "string" && x.name.toUpperCase() === li.paire.toUpperCase());
  if(li.paire != null && !pair)
    throw new Error("paire « " + routagePropre(li.paire) + " » inconnue (" + ((S.dpPairs || []).map(x => routagePropre(x.name)).join(", ") || "aucune déclarée") + ")");
  const dep = pair ? cheminBoutPaire(li.depart, pair, "départ") : cheminBout(li.depart, "départ");
  const arr = pair ? cheminBoutPaire(li.arrivee, pair, "arrivée") : cheminBout(li.arrivee, "arrivée");
  if(!pair && !dep.q && !arr.q) throw new Error("au moins un bout doit être une pastille (« REF.pastille ») : c'est elle qui donne le net");
  if(!pair && dep.net && arr.net && dep.net !== arr.net)
    throw new Error(dep.nom + " (" + routagePropre(dep.net) + ") et " + arr.nom + " (" + routagePropre(arr.net) + ") ne sont pas sur le même net");
  const net = dep.net || arr.net;
  if(!net) throw new Error("les pastilles " + dep.nom + " / " + arr.nom + " ne sont sur aucun net");
  if(li.largeur != null && (pair || typeof li.largeur !== "number" || !(li.largeur >= 0.05 && li.largeur <= 10)))
    throw new Error(pair ? "largeur : celle d'une paire vient de sa règle" : "largeur de 0,05 à 10 mm");
  // une paire : l'axe porte les deux pistes et leur écart
  const larg = [...Array(g.L).keys()].map(l => {
    if(!pair) return li.largeur != null ? li.largeur : classWidth(net, l);
    const d = dpGeom(pair, l);
    return r3(2 * d.w + d.gap);
  });
  /* une via de paire : deux vias écartés de dpViaSpread, que l'éventail de dpVia avance de ce qu'il rattrape sur le
     pas des pistes ; sans éventail (pas ≥ écart), au pas. cao_paire part du point accroché à la grille de la page :
     le disque s'élargit de cet écart. */
  // shortcut: un disque qui couvre les deux vias dans tous les sens, pas deux vias orientés ; à affiner si une paire ne trouve plus où changer de couche
  let Rv = classOf(net).via / 2;
  const pasL = pair ? [...Array(g.L).keys()].map(l => { const d = dpGeom(pair, l); return d.w + d.gap; }) : [];
  if(pair){
    const s = dpViaSpread(pair), pasMin = Math.min(...pasL), pasMax = Math.max(...pasL);
    Rv = Math.hypot(Math.max(0, s - pasMin) / 2, Math.max(s, pasMax) / 2) + (S.grid > 0 ? S.grid : 0) / Math.SQRT2 +
         Math.max(classOf(pair.p).via, classOf(pair.n).via) / 2;
  }
  const nets = pair ? [pair.p, pair.n] : [net];
  const {T, V} = cheminObstacles(g, nets, larg, extra, new Set(pair ? dep.pads.concat(arr.pads) : [dep.nom, arr.nom]), Rv);
  const nxy = g.nx * g.ny, N = nxy * g.L;
  const cel = (x, y) => [Math.round((x - g.x0) / g.pas), Math.round((y - g.y0) / g.pas)];
  const dans = (i, j) => i >= 0 && j >= 0 && i < g.nx && j < g.ny;
  // les deux bouts : leur pastille se dégage pour la piste ; pas de via dedans (via dans la pastille)
  const but = new Uint8Array(N);
  for(const [b, estBut] of [[dep, false], [arr, true]]){
    const [ci, cj] = cel(b.x, b.y);
    if(!dans(ci, cj)) throw new Error(b.nom + " est hors de la carte");
    /* une paire : pas de via de paire à portée d'accroche de ses pastilles (dpVia veut un segment avant elle, cao_paire
       s'y accrocherait), ni avant la porte de dpGate (lead depuis l'écart des deux pastilles) et un pas pour s'y aligner */
    if(pair) for(let l = 0; l < g.L; l++){
      const e = dist(b.ancres[0].x, b.ancres[0].y, b.ancres[1].x, b.ancres[1].y), lead = Math.abs(e - pasL[l]) / 2 + pasL[l] / 2 + dpGeom(pair, l).w;
      const R = Rv + Math.max(CHEMIN.ACCROCHE_PAIRE, lead + pasL[l]);
      for(const q of b.qs){
        const m = Math.max(q.w, q.h) / 2 + R;
        cheminBoite(V, g, l, q.x - m, q.y - m, q.x + m, q.y + m, (x, y) => padDist(x, y, q) < R);
      }
    }
    for(const l of b.couches){
      const base = l * nxy;
      if(b.q){
        const m = Math.max(b.q.w, b.q.h) / 2 + Rv + g.pas;
        for(let j = Math.max(0, Math.floor((b.y - m - g.y0) / g.pas)); j <= Math.min(g.ny - 1, Math.ceil((b.y + m - g.y0) / g.pas)); j++)
          for(let i = Math.max(0, Math.floor((b.x - m - g.x0) / g.pas)); i <= Math.min(g.nx - 1, Math.ceil((b.x + m - g.x0) / g.pas)); i++){
            const d = padDist(g.x0 + i * g.pas, g.y0 + j * g.pas, b.q);
            if(d <= 0) T[base + j * g.nx + i] = 0;
            // l'arrivée commence où le bord de la piste touche la pastille : le routeur s'y arrête
            if(estBut && d < larg[l] / 2 + 0.01) but[base + j * g.nx + i] = 1;
            if(d < Rv && !(b.q.drill > 0)) V[base + j * g.nx + i] = 1;
          }
      }
      T[base + cj * g.nx + ci] = 0;
      if(estBut) but[base + cj * g.nx + ci] = 1;
    }
  }
  // A* : coût en mm (pas droit, pas diagonal, virage, via) ; heuristique octile vers l'arrivée
  const [ai, aj] = cel(arr.x, arr.y);
  const h = (i, j) => { const dx = Math.abs(i - ai), dy = Math.abs(j - aj); return (Math.max(dx, dy) + (Math.SQRT2 - 1) * Math.min(dx, dy)) * g.pas; };
  const cout = new Float32Array(N).fill(Infinity), parent = new Int32Array(N).fill(-1), sens = new Int8Array(N).fill(-1), ferme = new Uint8Array(N);
  const tas = cheminTas();
  const [di, dj] = cel(dep.x, dep.y);
  for(const l of dep.couches){ const k = l * nxy + dj * g.nx + di; cout[k] = 0; tas.mettre(h(di, dj), k); }
  let trouve = -1, n = 0;
  while(!tas.vide()){
    const k = tas.prendre();
    if(ferme[k]) continue;
    ferme[k] = 1;
    if(but[k]){ trouve = k; break; }
    if((++n & 4095) === 0 && Date.now() > fin) throw new Error("temps épuisé (" + CHEMIN.BUDGET_MS / 1000 + " s pour l'appel) : moins de liaisons par appel, ou un pas plus grand");
    const l = Math.floor(k / nxy), r = k % nxy, j = Math.floor(r / g.nx), i = r % g.nx, d0 = sens[k];
    for(let d = 0; d < 8; d++){
      const ii = i + CHEMIN_DX[d], jj = j + CHEMIN_DY[d];
      if(!dans(ii, jj)) continue;
      const kk = l * nxy + jj * g.nx + ii;
      if(T[kk] || ferme[kk]) continue;
      if(d & 1 && (T[l * nxy + j * g.nx + ii] || T[l * nxy + jj * g.nx + i])) continue;   // pas de coin coupé en diagonale
      let virage = 0;
      if(d0 >= 0){
        const e = Math.min(Math.abs(d - d0), 8 - Math.abs(d - d0));
        if(e > 2) continue;                                  // virage aigu : jamais
        virage = e * CHEMIN.VIRAGE_MM;
      }
      const c = cout[k] + (d & 1 ? Math.SQRT2 : 1) * g.pas + virage;
      if(c < cout[kk]){ cout[kk] = c; parent[kk] = k; sens[kk] = d; tas.mettre(c + h(ii, jj), kk); }
    }
    if(!V[k]) for(let l2 = 0; l2 < g.L; l2++){
      if(l2 === l) continue;
      const kk = l2 * nxy + r;
      if(T[kk] || ferme[kk]) continue;
      let libre = true;
      for(let m = Math.min(l, l2); m <= Math.max(l, l2) && libre; m++) libre = !V[m * nxy + r];
      if(!libre) continue;
      const c = cout[k] + CHEMIN.VIA_MM;
      if(c < cout[kk]){ cout[kk] = c; parent[kk] = k; sens[kk] = d0; tas.mettre(c + h(i, j), kk); }
    }
  }
  if(trouve < 0) throw new Error("aucun chemin sur la grille de " + g.pas + " mm (isolation de " + routagePropre(net) +
                                 ", largeur " + larg.map(r3).join("/") + " mm) : place des points à la main, ou dégage la carte");
  // les cellules du départ jusqu'à la première de l'arrivée
  const cells = [];
  for(let k = trouve; k >= 0; k = parent[k]){
    const r = k % nxy;
    cells.push({l:Math.floor(k / nxy), i:r % g.nx, j:Math.floor(r / g.nx)});
  }
  cells.reverse();
  return Object.assign(cheminPoints(g, cells, dep, net, larg, extra, 2 * Rv), {dep, arr, pair, l:cells[0].l});
}

/* Cellules → points de passage de cao_router : un point par virage ; une via au point où la
   couche change, le point suivant portant « couche ». Les bouts ne sont pas repris (ce sont
   depart et arrivee). Le chemin rejoint aussi les obstacles des liaisons suivantes (dv : diamètre de la via). */
function cheminPoints(g, cells, dep, net, larg, extra, dv){
  const nom = l => LECTURE_CAO.aides.nomCouchePcb(l);
  const xy = c => ({x:r3(g.x0 + c.i * g.pas), y:r3(g.y0 + c.j * g.pas)});
  const dir = (a, b) => (b.i - a.i) + "," + (b.j - a.j);
  const points = [];
  let attente = null, vias = 0;
  const poser = c => { const p = xy(c); if(attente != null){ p.couche = nom(attente); attente = null; } points.push(p); };
  for(let k = 1; k < cells.length; k++){
    const a = cells[k - 1], b = cells[k], c = cells[k + 1];
    if(a.l !== b.l){
      vias++;
      // pas deux fois le même point : cao_paire ferait demi-tour sur place, et ses deux pistes se croiseraient
      const der = points[points.length - 1];
      if(k > 1 && !(der && der.x === xy(a).x && der.y === xy(a).y)) poser(a);
      attente = b.l;
      continue;
    }
    if(!c) break;                                           // b : première cellule de l'arrivée
    if(c.l !== b.l || dir(a, b) !== dir(b, c)) poser(b);
  }
  // une via sans virage après elle : le dernier pas avant l'arrivée porte la couche
  if(attente != null) poser(cells[cells.length - 2]);
  // le chemin, obstacle pour les liaisons suivantes de l'appel
  const trace = [{x:dep.x, y:dep.y, l:cells[0].l}].concat(cells.slice(1).map(c => Object.assign(xy(c), {l:c.l})));
  let longueur = 0;
  for(let k = 1; k < trace.length; k++){
    const a = trace[k - 1], b = trace[k];
    if(a.l !== b.l){ extra.vias.push({x:a.x, y:a.y, d:dv, a:Math.min(a.l, b.l), b:Math.max(a.l, b.l), net}); continue; }
    longueur += dist(a.x, a.y, b.x, b.y);
    extra.pistes.push({x1:a.x, y1:a.y, x2:b.x, y2:b.y, w:larg[a.l], l:a.l, net});
  }
  return {couche:nom(cells[0].l), points, longueur:r3(longueur), vias};
}

/* cao_chemin : {liaisons:[{depart, arrivee, largeur?} | {paire, depart:[P, N], arrivee:[P, N]}], pas?}
   → les routes pour cao_router, et les paires pour cao_paire. */
function cheminCommande(a){
  const liaisons = Array.isArray(a && a.liaisons) ? a.liaisons : [];
  if(!liaisons.length || liaisons.length > CHEMIN.MAX) throw new Error("« liaisons » : de 1 à " + CHEMIN.MAX + " liaisons {depart, arrivee, largeur?} ou {paire, depart, arrivee}.");
  if(a.pas != null && (typeof a.pas !== "number" || !(a.pas >= 0.05 && a.pas <= 2))) throw new Error("« pas » : de 0,05 à 2 mm.");
  const g = cheminGrille(a.pas != null ? a.pas : CHEMIN.PAS), fin = Date.now() + CHEMIN.BUDGET_MS;
  const extra = {pistes:[], vias:[]}, resultats = [], routes = [], paires = [];
  liaisons.forEach((li, k) => {
    try{
      if(!li || typeof li !== "object") throw new Error("liaison : un objet {depart, arrivee, largeur?} ou {paire, depart, arrivee}");
      const r = cheminUne(g, li, extra, fin);
      if(r.pair){
        /* cao_paire termine la paire dès qu'un point passe à portée d'accroche d'un couple de ses pastilles
           (1 mm du cuivre, routageUnePaire) : un tel point, près de l'arrivée, l'arrêterait avant la fin. Chaque
           point se juge sur sa couche ; le « couche » d'un point retiré passe au suivant (ou à l'arrivée) : cao_paire
           pose la via de paire là où il en est, avant d'aller au point, donc au même endroit. */
        const points = [], arrivee = {x:r.arr.x, y:r.arr.y};
        let l = r.l, couche = null;
        for(const p of r.points){
          if(p.couche){ l = routageCouche(p.couche); couche = p.couche; }
          if(dpPrimPair(r.pair, p.x, p.y, l, CHEMIN.ACCROCHE_PAIRE, r.dep.ancres)) continue;
          points.push(couche ? Object.assign({}, p, {couche}) : p);
          couche = null;
        }
        if(couche) arrivee.couche = couche;
        paires.push({paire:r.pair.name, depart:{x:r.dep.x, y:r.dep.y}, couche:r.couche, points, arrivee});
        resultats.push({liaison:k + 1, paire:r.pair.name, trouve:true, longueur_mm:r.longueur, vias:r.vias, points:r.points.length});
        return;
      }
      const route = {depart:li.depart, couche:r.couche, points:r.points, arrivee:li.arrivee};
      if(li.largeur != null) route.largeur = li.largeur;
      routes.push(route);
      resultats.push({liaison:k + 1, trouve:true, longueur_mm:r.longueur, vias:r.vias, points:r.points.length});
    }catch(e){
      resultats.push({liaison:k + 1, trouve:false, raison:routagePropre((e && e.message) || e)});
    }
  });
  const conseil = [];
  if(routes.length) conseil.push("Donne « routes » à cao_router (une carte) ; une route refusée se reprend avec d'autres points.");
  if(paires.length) conseil.push("Donne chaque élément de « paires » à cao_paire (une carte par paire) : il fait les éventails jusqu'aux pastilles.");
  return {pas_mm:g.pas, resultats, routes, paires,
          conseil:conseil.join(" ") || "Aucun chemin : vois les raisons, et la carte par pilote_capture."};
}
