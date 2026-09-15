"use strict";
/* =============================================================================
   editeur-pcb — 23-eco-sync.js
   Synchronisation Schéma ↔ PCB & Mise à jour interactive (ECO)
   -----------------------------------------------------------------------------
   - Détection automatique des disparités de boîtiers, empreintes, composants,
     valeurs et netlist entre le schéma électrique et le circuit imprimé.
   - Fenêtre de mise à jour interactive (Engineering Change Order) avec
     sélection granulaire des modifications à appliquer.
   - Conservation rigoureuse du routage et des pistes de cuivre existantes.
   - Surveillance dynamique via BroadcastChannel, session et événements disques.
   ============================================================================= */

const PCB_ECO = {
  dernierRapport: null,
  nbDisparites: 0,
  sourceNom: "",
  horodatage: 0
};

/* =============================================================================
   1. EXTRACTION DES DONNÉES SCHÉMATIQUES
   ============================================================================= */

/**
 * Récupère et normalise les composants et les équipotentielles du schéma.
 * Accepte une source explicite (texte netlist, objet doc schéma JSON) ou puise
 * dans la session active, le projet disque ou la sauvegarde automatique.
 */
function pcbObtenirDonneesSchema(source) {
  let schDoc = null;
  let netlistTxt = null;
  let sourceNom = "";

  if (typeof source === "string") {
    const sTrim = source.trim();
    if (sTrim.startsWith("{")) {
      try {
        schDoc = JSON.parse(sTrim);
        sourceNom = "Fichier JSON schéma";
      } catch (_) {}
    } else {
      netlistTxt = source;
      sourceNom = "Netlist texte";
    }
  } else if (source && typeof source === "object") {
    schDoc = source;
    sourceNom = "Document schéma";
  }

  // Si aucune source explicite, consulter la session
  if (!schDoc && !netlistTxt) {
    if (typeof sessLire === "function") {
      try {
        const s = sessLire("schema");
        if (s && s.etat) {
          if (s.etat.netlist) netlistTxt = s.etat.netlist;
          if (s.etat.doc) schDoc = s.etat.doc;
          sourceNom = "Schéma en session";
        }
      } catch (_) {}
    }
  }

  // Document en mémoire du PCB
  if (!schDoc && typeof S !== "undefined" && S.schDoc) {
    schDoc = S.schDoc;
    if (!sourceNom) sourceNom = "Schéma actif";
  }

  // Sauvegarde automatique locale du schéma
  if (!schDoc && !netlistTxt && typeof localStorage !== "undefined") {
    try {
      const raw = localStorage.getItem("schemedit.autosave") ||
                  localStorage.getItem("cao_schema_backup") ||
                  localStorage.getItem("schema_auto");
      if (raw) {
        const b = JSON.parse(raw);
        if (b && (b.doc || b.pages)) {
          schDoc = b.doc || b;
          if (b.netlist) netlistTxt = b.netlist;
          sourceNom = "Sauvegarde schéma";
        }
      }
    } catch (_) {}
  }

  // Si le document JSON contient la netlist embarquée
  if (schDoc && schDoc.netlist && !netlistTxt) {
    netlistTxt = schDoc.netlist;
  }

  const compsMap = new Map();
  const netsMap = new Map();
  const pinNetMap = new Map();

  // 1. Si une netlist textuelle est disponible, la parser en priorité
  if (netlistTxt && typeof parseNetlist === "function") {
    try {
      const { comps, nets } = parseNetlist(netlistTxt);
      if (comps) {
        for (const [ref, c] of comps) {
          compsMap.set(ref, {
            ref: ref,
            value: c.value || "",
            pkg: c.pkg || "",
            pins: 2
          });
        }
      }
      if (nets) {
        for (const [netName, nodes] of nets) {
          netsMap.set(netName, nodes || []);
          for (const nd of (nodes || [])) {
            if (nd && nd.ref && nd.pin != null) {
              pinNetMap.set(nd.ref + "." + nd.pin, netName);
              const curComp = compsMap.get(nd.ref);
              if (curComp) {
                curComp.pins = Math.max(curComp.pins || 0, +nd.pin);
              } else {
                compsMap.set(nd.ref, { ref: nd.ref, value: "", pkg: "", pins: +nd.pin });
              }
            }
          }
        }
      }
    } catch (_) {}
  }

  // 2. Enrichir avec le document schéma s'il est présent
  if (schDoc) {
    try {
      const schComps = (typeof pcbComposantsSchema === "function") ? pcbComposantsSchema(schDoc) : null;
      if (schComps) {
        for (const [ref, c] of schComps) {
          const exist = compsMap.get(ref);
          if (!exist) {
            compsMap.set(ref, {
              ref: ref,
              value: c.value || "",
              pkg: c.pkg || "",
              pins: c.npins || (Array.isArray(c.pinNames) ? c.pinNames.length : 2),
              mpn: c.mpn || "",
              type: c.type || "",
              specs: c.specs || {},
              datasheet: c.datasheet_local || c.datasheet_url || ""
            });
          } else {
            if (!exist.value && c.value) exist.value = c.value;
            if (!exist.pkg && c.pkg) exist.pkg = c.pkg;
            if (c.npins) exist.pins = Math.max(exist.pins || 0, c.npins);
            if (c.mpn) exist.mpn = c.mpn;
            if (c.type) exist.type = c.type;
            if (c.specs) exist.specs = c.specs;
          }
        }
      }
    } catch (_) {}
  }

  return {
    disponible: (compsMap.size > 0 || netsMap.size > 0),
    comps: compsMap,
    nets: netsMap,
    pinNet: pinNetMap,
    sourceNom: sourceNom || "Schéma externe",
    netlistTxt: netlistTxt,
    schDoc: schDoc,
    timestamp: Date.now()
  };
}

/* =============================================================================
   2. RECHERCHE DE PISTES CONNECTÉES (CONSERVATION DU ROUTAGE)
   ============================================================================= */

/**
 * Renvoie toutes les pistes de cuivre touchant physiquement une empreinte.
 */
function pcbPistesConnecteesFp(fp) {
  if (!fp || typeof S === "undefined" || !Array.isArray(S.tracks) || !S.tracks.length) return [];
  if (typeof padsWorld !== "function") return [];
  const pads = padsWorld(fp);
  if (!pads || !pads.length) return [];
  const out = [];
  for (const t of S.tracks) {
    for (const p of pads) {
      if (typeof padDist === "function") {
        if (padDist(t.x1, t.y1, p) <= 0.02 || padDist(t.x2, t.y2, p) <= 0.02) {
          out.push(t);
          break;
        }
      }
    }
  }
  return out;
}

/**
 * Renvoie les pistes de cuivre touchant une pastille spécifique (par son n° de broche).
 */
function pcbPistesConnecteesPad(fp, pinNumber) {
  if (!fp || typeof S === "undefined" || !Array.isArray(S.tracks) || !S.tracks.length) return [];
  if (typeof padsWorld !== "function") return [];
  const pads = padsWorld(fp);
  const pad = pads.find(q => q.n === +pinNumber);
  if (!pad) return [];
  const out = [];
  for (const t of S.tracks) {
    if (typeof padDist === "function") {
      if (padDist(t.x1, t.y1, pad) <= 0.02 || padDist(t.x2, t.y2, pad) <= 0.02) {
        out.push(t);
      }
    }
  }
  return out;
}

/* =============================================================================
   3. MOTEUR DE COMPARAISON & DÉTECTION DES DISPARITÉS ECO
   ============================================================================= */

/**
 * Compare l'état courant du PCB (S.fps, S.tracks) avec les données du schéma.
 * Détecte les ajouts, suppressions, changements de boîtiers, de valeurs et de nets.
 */
function pcbDetecterDisparitesEco(schData) {
  if (!schData || !schData.disponible || typeof S === "undefined" || !Array.isArray(S.fps)) {
    return {
      total: 0,
      items: [],
      ajouts: [],
      boitiers: [],
      valeurs: [],
      nets: [],
      suppressions: [],
      schSource: (schData && schData.sourceNom) || "Indisponible",
      disponible: false,
      impactRoutage: { pistesModifiees: 0, conflitsDirects: 0, pistesTotales: Array.isArray(S.tracks) ? S.tracks.length : 0 }
    };
  }

  const items = [];
  const ajouts = [];
  const boitiers = [];
  const valeurs = [];
  const nets = [];
  const suppressions = [];

  const fpsMap = new Map(S.fps.map(f => [f.ref, f]));
  let nbPistesConnecteesModifiees = 0;
  let nbConflitsNetsDirects = 0;

  // 1. Analyse des composants présents au schéma
  for (const [ref, comp] of schData.comps) {
    const fp = fpsMap.get(ref);

    if (!fp) {
      // COMPOSANT À AJOUTER
      const pinCount = Math.max(1, comp.pins || 2);
      const item = {
        id: "add_" + ref,
        type: "AJOUT",
        categorie: "Composant à ajouter",
        ref: ref,
        value: comp.value || "",
        pkg: comp.pkg || "",
        pins: pinCount,
        nets: {},
        tracksCount: 0,
        tracks: [],
        hasConflict: false,
        active: true
      };
      // Préparer les nets des broches
      for (let p = 1; p <= pinCount; p++) {
        const nn = schData.pinNet.get(ref + "." + p);
        if (nn) item.nets[p] = nn;
      }
      items.push(item);
      ajouts.push(item);
    } else {
      // COMPOSANT EXISTANT : Vérifier boîtier, valeur, brochage

      // A. Changement de boîtier / empreinte
      const oldPkg = String(fp.pkg || "").trim();
      const newPkg = String(comp.pkg || "").trim();
      if (newPkg && oldPkg && oldPkg.toUpperCase() !== newPkg.toUpperCase()) {
        const trks = pcbPistesConnecteesFp(fp);
        nbPistesConnecteesModifiees += trks.length;
        const item = {
          id: "pkg_" + ref,
          type: "BOITIER",
          categorie: "Modification d'empreinte",
          ref: ref,
          oldPkg: oldPkg,
          newPkg: newPkg,
          oldPins: fp.pins,
          newPins: comp.pins || fp.pins,
          tracksCount: trks.length,
          tracks: trks,
          hasConflict: false,
          active: true
        };
        items.push(item);
        boitiers.push(item);
      }

      // B. Changement de valeur
      const oldVal = String(fp.value || "").trim();
      const newVal = String(comp.value || "").trim();
      if (newVal && oldVal !== newVal) {
        const item = {
          id: "val_" + ref,
          type: "VALEUR",
          categorie: "Valeur de composant",
          ref: ref,
          oldValue: oldVal,
          newValue: newVal,
          tracksCount: 0,
          tracks: [],
          hasConflict: false,
          active: true
        };
        items.push(item);
        valeurs.push(item);
      }

      // C. Disparités de netlist / connexions sur les broches
      const maxPins = Math.max(fp.pins || 0, comp.pins || 0);
      for (let p = 1; p <= maxPins; p++) {
        const oldN = (fp.nets && fp.nets[p]) || "";
        const newN = schData.pinNet.get(ref + "." + p) || "";
        if (oldN !== newN) {
          const padTrks = pcbPistesConnecteesPad(fp, p);
          const hasDirectConflict = (oldN && newN && oldN !== newN && padTrks.length > 0);
          if (padTrks.length > 0) nbPistesConnecteesModifiees += padTrks.length;
          if (hasDirectConflict) nbConflitsNetsDirects++;

          const item = {
            id: "net_" + ref + "_" + p,
            type: "NET",
            categorie: "Connexion de netlist",
            ref: ref,
            pin: p,
            oldNet: oldN,
            newNet: newN,
            tracksCount: padTrks.length,
            tracks: padTrks,
            hasConflict: hasDirectConflict,
            active: true
          };
          items.push(item);
          nets.push(item);
        }
      }
    }
  }

  // 2. Composants orphelins (sur le PCB mais absents du schéma)
  for (const fp of S.fps) {
    if (!schData.comps.has(fp.ref)) {
      const trks = pcbPistesConnecteesFp(fp);
      const item = {
        id: "del_" + fp.ref,
        type: "SUPPRESSION",
        categorie: "Composant absent du schéma",
        ref: fp.ref,
        value: fp.value || "",
        pkg: fp.pkg || "",
        pins: fp.pins,
        tracksCount: trks.length,
        tracks: trks,
        hasConflict: false,
        active: false // DÉCOCHÉ PAR DÉFAUT : protège l'existant
      };
      items.push(item);
      suppressions.push(item);
    }
  }

  const rapport = {
    total: items.length,
    items: items,
    ajouts: ajouts,
    boitiers: boitiers,
    valeurs: valeurs,
    nets: nets,
    suppressions: suppressions,
    schSource: schData.sourceNom || "Schéma",
    disponible: true,
    impactRoutage: {
      pistesModifiees: nbPistesConnecteesModifiees,
      conflitsDirects: nbConflitsNetsDirects,
      pistesTotales: Array.isArray(S.tracks) ? S.tracks.length : 0
    }
  };

  PCB_ECO.dernierRapport = rapport;
  PCB_ECO.nbDisparites = items.length;
  PCB_ECO.sourceNom = schData.sourceNom;
  PCB_ECO.horodatage = Date.now();

  return rapport;
}

/* =============================================================================
   4. APPLICATION DE L'ECO AVEC CONSERVATION RIGOUREUSE DU ROUTAGE
   ============================================================================= */

/**
 * Applique les modifications sélectionnées de l'ECO sur la carte PCB.
 * Gère rigoureusement la conservation des pistes et vias existants.
 */
function pcbAppliquerEco(items, options) {
  if (!items || !Array.isArray(items) || !items.length) {
    return { succes: false, nbAppliques: 0, msg: "Aucune modification à appliquer." };
  }

  const opt = options || {};
  const garderRoutage = opt.garderRoutage !== false; // TRUE par défaut
  const nettoyerConflits = !!opt.nettoyerConflits;  // FALSE par défaut
  const supprimerPistesOrphelines = !!opt.supprimerPistesOrphelines;

  if (typeof push === "function") push(); // Instantané d'annulation Undo/Redo

  const fpsMap = new Map(S.fps.map(f => [f.ref, f]));
  const addedFps = [];
  const tracksToDelete = new Set();
  let nbAjouts = 0;
  let nbBoitiers = 0;
  let nbValeurs = 0;
  let nbNets = 0;
  let nbSuppressions = 0;

  for (const item of items) {
    if (!item || !item.active) continue;

    switch (item.type) {
      case "AJOUT": {
        if (!fpsMap.has(item.ref) && typeof mkFp === "function") {
          const pins = Math.max(1, item.pins || 2);
          const fp = mkFp(item.ref, item.value, item.pkg, pins);
          if (item.nets) fp.nets = { ...item.nets };
          S.fps.push(fp);
          fpsMap.set(fp.ref, fp);
          addedFps.push(fp);
          nbAjouts++;
        }
        break;
      }

      case "BOITIER": {
        const fp = fpsMap.get(item.ref);
        if (fp) {
          fp.pkg = item.newPkg;
          // Mise à jour géométrique sans déplacer le composant
          if (typeof fpFree === "function" && !fpFree(fp) && typeof fpGeomFor === "function") {
            const g = fpGeomFor(item.newPkg, item.newPins || fp.pins);
            fp.style = g.style;
            fp.pitch = g.pitch;
            fp.span = g.span;
            fp.pins = g.pins;
            if (g.pads && typeof padClone === "function") {
              fp.pads = g.pads.map(padClone);
              if (g.body) fp.body = { ...g.body };
              if (typeof fpSyncPins === "function") fpSyncPins(fp);
            }
          }
          // CONSERVATION RIGOUREUSE DU ROUTAGE :
          // Toutes les pistes existantes de S.tracks sont maintenues en place.
          nbBoitiers++;
        }
        break;
      }

      case "VALEUR": {
        const fp = fpsMap.get(item.ref);
        if (fp) {
          fp.value = item.newValue;
          nbValeurs++;
        }
        break;
      }

      case "NET": {
        const fp = fpsMap.get(item.ref);
        if (fp) {
          if (!fp.nets) fp.nets = {};
          if (item.newNet) {
            fp.nets[item.pin] = item.newNet;
          } else {
            delete fp.nets[item.pin];
          }
          // Si l'utilisateur a expressément demandé le nettoyage des conflits
          if (nettoyerConflits && item.hasConflict && item.tracks && item.tracks.length > 0) {
            for (const t of item.tracks) tracksToDelete.add(t);
          }
          // Sinon : garderRoutage préserve les pistes existantes
          nbNets++;
        }
        break;
      }

      case "SUPPRESSION": {
        const fp = fpsMap.get(item.ref);
        if (fp) {
          const idx = S.fps.indexOf(fp);
          if (idx >= 0) {
            S.fps.splice(idx, 1);
            fpsMap.delete(item.ref);
            nbSuppressions++;
            if (supprimerPistesOrphelines && item.tracks && item.tracks.length > 0) {
              for (const t of item.tracks) tracksToDelete.add(t);
            }
          }
        }
        break;
      }
    }
  }

  // Suppression ciblée des pistes uniquement si expressément demandé
  if (tracksToDelete.size > 0 && Array.isArray(S.tracks)) {
    S.tracks = S.tracks.filter(t => !tracksToDelete.has(t));
  }

  // Agencement propre des nouvelles empreintes à côté de la carte
  if (addedFps.length > 0 && typeof arrange === "function") {
    arrange(addedFps);
  }

  // Mise à jour de la connectivité et des couches
  if (typeof autoClass === "function") autoClass();
  if (typeof zoneCache !== "undefined" && zoneCache.clear) zoneCache.clear();
  if (typeof conn === "function") conn();
  if (typeof buildLayers === "function") buildLayers();
  if (typeof refreshPanels === "function") refreshPanels();
  if (typeof runDrc === "function") runDrc();
  if (typeof touch === "function") touch();
  if (typeof draw === "function") draw();

  // Mise à jour des vérifications
  if (typeof pcbVerifierEtNotifierEco === "function") pcbVerifierEtNotifierEco(true);
  if (typeof pcbVerifierEtNotifierPinout === "function") {
    setTimeout(() => pcbVerifierEtNotifierPinout(false), 100);
  }

  const totalAppliques = nbAjouts + nbBoitiers + nbValeurs + nbNets + nbSuppressions;
  return {
    succes: true,
    nbAppliques: totalAppliques,
    ajouts: nbAjouts,
    boitiers: nbBoitiers,
    valeurs: nbValeurs,
    nets: nbNets,
    suppressions: nbSuppressions,
    pistesConservees: Array.isArray(S.tracks) ? S.tracks.length : 0,
    pistesSupprimees: tracksToDelete.size
  };
}

/* =============================================================================
   5. FENÊTRE DE MISE À JOUR INTERACTIVE (ECO)
   ============================================================================= */

/**
 * Ouvre la boîte de dialogue interactive pour visualiser les disparités et
 * appliquer l'ECO de façon sécurisée.
 */
function pcbOuvrirFenetreEco(source) {
  if (typeof document === "undefined") return;

  const schData = pcbObtenirDonneesSchema(source);
  const rapport = pcbDetecterDisparitesEco(schData);

  // Supprimer une fenêtre modale ECO existante si présente
  const ancModal = document.getElementById("pcbEcoModal");
  if (ancModal) ancModal.remove();

  const m = document.createElement("div");
  m.id = "pcbEcoModal";
  m.className = "modal";
  m.style.zIndex = "1000";

  if (!rapport.disponible) {
    m.innerHTML = 
      '<div class="box" style="max-width:520px; font-family:var(--sans, sans-serif);">' +
        '<h3 style="color:#f59e0b; display:flex; align-items:center; gap:8px;">' +
          '🔄 Synchronisation Schéma ↔ PCB</h3>' +
        '<p style="color:var(--txt-dim); font-size:12.5px; line-height:1.5; margin:10px 0 16px;">' +
          'Aucun schéma ou netlist n\'a été trouvé dans la session courante. ' +
          'Vous pouvez importer un fichier de schéma (.json) ou une netlist (.txt) pour lancer la synchronisation.</p>' +
        '<div style="display:flex; justify-content:flex-end; gap:8px;">' +
          '<button class="tb" id="bEcoImporterFichier">📁 Importer schéma ou netlist…</button>' +
          '<button class="tb on" id="bEcoFermer">Fermer</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(m);
    document.getElementById("bEcoFermer").onclick = () => m.remove();
    document.getElementById("bEcoImporterFichier").onclick = () => {
      m.remove();
      pcbChoisirFichierSchemaPourEco();
    };
    m.onclick = e => { if (e.target === m) m.remove(); };
    return;
  }

  if (rapport.total === 0) {
    m.innerHTML = 
      '<div class="box" style="max-width:540px; font-family:var(--sans, sans-serif);">' +
        '<h3 style="color:#22c55e; display:flex; align-items:center; gap:8px;">' +
          '✅ Schéma ↔ PCB 100% Synchronisés</h3>' +
        '<p style="color:var(--txt); font-size:12.5px; margin:10px 0 6px;">' +
          'Source : <b>' + (typeof esc === "function" ? esc(rapport.schSource) : rapport.schSource) + '</b></p>' +
        '<p style="color:var(--txt-dim); font-size:12px; line-height:1.45; margin-bottom:18px;">' +
          'Aucune disparité de boîtier, d\'empreinte, de valeur ou de netlist n\'a été détectée. ' +
          'La carte est parfaitement alignée avec le schéma électrique.</p>' +
        '<div style="display:flex; justify-content:space-between; align-items:center;">' +
          '<button class="tb" id="bEcoImporterAutre">Importer autre fichier…</button>' +
          '<button class="tb on" id="bEcoFermer">Fermer</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(m);
    document.getElementById("bEcoFermer").onclick = () => m.remove();
    document.getElementById("bEcoImporterAutre").onclick = () => {
      m.remove();
      pcbChoisirFichierSchemaPourEco();
    };
    m.onclick = e => { if (e.target === m) m.remove(); };
    return;
  }

  // Construction de l'arborescence des éléments disparates
  let htmlItems = "";
  for (let i = 0; i < rapport.items.length; i++) {
    const it = rapport.items[i];
    let badgeColor = "#3b82f6";
    let badgeText = it.type;

    if (it.type === "AJOUT") { badgeColor = "#22c55e"; badgeText = "➕ AJOUT"; }
    else if (it.type === "BOITIER") { badgeColor = "#38bdf8"; badgeText = "📦 BOÎTIER"; }
    else if (it.type === "NET") { badgeColor = "#f59e0b"; badgeText = "⚡ NETLIST"; }
    else if (it.type === "VALEUR") { badgeColor = "#a855f7"; badgeText = "✏️ VALEUR"; }
    else if (it.type === "SUPPRESSION") { badgeColor = "#ef4444"; badgeText = "🗑️ ABSENT"; }

    let detailDesc = "";
    if (it.type === "AJOUT") {
      detailDesc = `Nouveau composant <b>${it.ref}</b> : valeur <i>${it.value || "—"}</i>, boîtier <b>${it.pkg || "générique"}</b> (${it.pins} broches)`;
    } else if (it.type === "BOITIER") {
      detailDesc = `Boîtier <b>${it.ref}</b> : <span style="text-decoration:line-through;color:#94a3b8">${it.oldPkg}</span> ➔ <b style="color:#38bdf8">${it.newPkg}</b> (${it.newPins} broches)`;
    } else if (it.type === "VALEUR") {
      detailDesc = `Valeur <b>${it.ref}</b> : <span style="text-decoration:line-through;color:#94a3b8">${it.oldValue || "—"}</span> ➔ <b style="color:#a855f7">${it.newValue}</b>`;
    } else if (it.type === "NET") {
      detailDesc = `Broche <b>${it.ref}.${it.pin}</b> : net <span style="color:#f87171">${it.oldNet || "(non câblé)"}</span> ➔ <b style="color:#4ade80">${it.newNet || "(en l'air)"}</b>`;
    } else if (it.type === "SUPPRESSION") {
      detailDesc = `Composant <b>${it.ref}</b> (${it.value || it.pkg}) présent sur le PCB mais retiré du schéma`;
    }

    let routingBadge = "";
    if (it.tracksCount > 0) {
      routingBadge = `<span style="font-size:10px; color:#22c55e; background:rgba(34,197,94,0.12); padding:1px 6px; border-radius:4px; margin-left:6px;" title="${it.tracksCount} piste(s) connectée(s) préservée(s)">🛡️ ${it.tracksCount} piste(s) conservée(s)</span>`;
      if (it.hasConflict) {
        routingBadge += `<span style="font-size:10px; color:#f87171; background:rgba(239,68,68,0.15); padding:1px 6px; border-radius:4px; margin-left:4px;" title="La piste connectée portait l'ancien net">⚠️ changement de net</span>`;
      }
    }

    htmlItems += 
      `<div class="eco-item" style="display:flex; align-items:center; gap:10px; padding:7px 10px; border-bottom:1px solid rgba(255,255,255,0.06); font-size:12px; background:${i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.02)"};">` +
        `<input type="checkbox" id="eco_item_${i}" data-idx="${i}" ${it.active ? "checked" : ""} style="cursor:pointer; accent-color:#38bdf8;">` +
        `<span style="font-size:10px; font-weight:bold; color:#fff; background:${badgeColor}; padding:2px 6px; border-radius:3px; min-width:68px; text-align:center;">${badgeText}</span>` +
        `<div style="flex:1; line-height:1.35; color:var(--txt);">${detailDesc}${routingBadge}</div>` +
      `</div>`;
  }

  m.innerHTML = 
    '<div class="box" style="width:720px; max-width:95vw; max-height:88vh; display:flex; flex-direction:column; font-family:var(--sans, sans-serif);">' +
      // En-tête
      '<div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:10px;">' +
        '<div>' +
          '<h3 style="color:#38bdf8; display:flex; align-items:center; gap:8px; margin:0 0 2px;">' +
            '🔄 Mise à jour interactive (ECO) · Schéma ↔ PCB</h3>' +
          '<div style="font-size:11.5px; color:var(--txt-dim);">' +
            'Source : <b>' + (typeof esc === "function" ? esc(rapport.schSource) : rapport.schSource) + '</b> ' +
            '· <span id="ecoCountSelection">' + rapport.items.filter(x => x.active).length + '</span> / ' + rapport.total + ' action(s) sélectionnée(s)' +
          '</div>' +
        '</div>' +
        '<button class="pnl-btn" id="bEcoCloseX" style="font-size:16px; cursor:pointer;">✕</button>' +
      '</div>' +

      // Bandeau de garantie de conservation du routage
      '<div style="background:rgba(34,197,94,0.1); border:1px solid rgba(34,197,94,0.3); border-radius:6px; padding:8px 12px; margin-bottom:12px; font-size:11.5px; color:#86efac; display:flex; align-items:center; gap:10px;">' +
        '<span style="font-size:18px;">🛡️</span>' +
        '<div>' +
          '<b>Conservation rigoureuse du routage active :</b> les ' + rapport.impactRoutage.pistesTotales + ' pistes de cuivre, vias et plans existants sont intégralement préservés. Les empreintes mises à jour conservent scrupuleusement leur position et leur orientation.' +
        '</div>' +
      '</div>' +

      // Filtres rapides
      '<div style="display:flex; flex-wrap:wrap; gap:12px; font-size:11.5px; color:var(--txt-dim); padding-bottom:8px; border-bottom:1px solid var(--border); margin-bottom:8px;">' +
        '<label style="display:flex; align-items:center; gap:5px; cursor:pointer;"><input type="checkbox" id="ecoFiltreAjouts" checked> Nouveaux (' + rapport.ajouts.length + ')</label>' +
        '<label style="display:flex; align-items:center; gap:5px; cursor:pointer;"><input type="checkbox" id="ecoFiltreBoitiers" checked> Boîtiers (' + rapport.boitiers.length + ')</label>' +
        '<label style="display:flex; align-items:center; gap:5px; cursor:pointer;"><input type="checkbox" id="ecoFiltreNets" checked> Nets (' + rapport.nets.length + ')</label>' +
        '<label style="display:flex; align-items:center; gap:5px; cursor:pointer;"><input type="checkbox" id="ecoFiltreValeurs" checked> Valeurs (' + rapport.valeurs.length + ')</label>' +
        '<label style="display:flex; align-items:center; gap:5px; cursor:pointer;"><input type="checkbox" id="ecoFiltreSuppr"> Absents (' + rapport.suppressions.length + ')</label>' +
      '</div>' +

      // Liste des disparités défilable
      '<div id="ecoListContainer" style="flex:1; overflow-y:auto; border:1px solid var(--border); border-radius:6px; background:rgba(0,0,0,0.15); margin-bottom:12px; max-height:360px;">' +
        htmlItems +
      '</div>' +

      // Options de routage avancées & boutons
      '<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; font-size:11.5px; color:var(--txt-dim);">' +
        '<label style="display:flex; align-items:center; gap:6px; cursor:pointer;" title="Pour les pastilles dont le net a changé et portant déjà une piste">' +
          '<input type="checkbox" id="ecoOptNettoyerConflits"> Détacher les pistes en conflit direct de net' +
        '</label>' +
        '<div style="display:flex; gap:8px;">' +
          '<button class="tb mini" id="bEcoSelectAll">Tout cocher</button>' +
          '<button class="tb mini" id="bEcoDeselectAll">Tout décocher</button>' +
        '</div>' +
      '</div>' +

      // Boutons d'action principaux
      '<div style="display:flex; justify-content:space-between; align-items:center; padding-top:10px; border-top:1px solid var(--border);">' +
        '<button class="tb" id="bEcoImporterAutre">📁 Autre schéma / netlist…</button>' +
        '<div style="display:flex; gap:8px;">' +
          '<button class="tb" id="bEcoAnnuler">Annuler</button>' +
          '<button class="tb on" id="bEcoExecuter" style="background:#0284c7; border-color:#0284c7; color:#fff; font-weight:bold; padding:6px 16px;">' +
            '🚀 Appliquer l\'ECO (<span id="ecoBtnCount">' + rapport.items.filter(x => x.active).length + '</span>)' +
          '</button>' +
        '</div>' +
      '</div>' +
    '</div>';

  document.body.appendChild(m);

  // Fonction de rafraîchissement des compteurs
  const rafraichirCompteurs = () => {
    const act = rapport.items.filter(x => x.active).length;
    const elCnt = document.getElementById("ecoCountSelection");
    const elBtnCnt = document.getElementById("ecoBtnCount");
    if (elCnt) elCnt.textContent = act;
    if (elBtnCnt) elBtnCnt.textContent = act;
  };

  // Câblage des cases à cocher individuelles
  for (let i = 0; i < rapport.items.length; i++) {
    const cb = document.getElementById("eco_item_" + i);
    if (cb) {
      cb.onchange = function() {
        rapport.items[i].active = !!this.checked;
        rafraichirCompteurs();
      };
    }
  }

  // Câblage des filtres de catégories
  const basculerCategorie = (type, actif) => {
    for (let i = 0; i < rapport.items.length; i++) {
      if (rapport.items[i].type === type) {
        rapport.items[i].active = actif;
        const cb = document.getElementById("eco_item_" + i);
        if (cb) cb.checked = actif;
      }
    }
    rafraichirCompteurs();
  };

  const fAj = document.getElementById("ecoFiltreAjouts");
  if (fAj) fAj.onchange = function() { basculerCategorie("AJOUT", this.checked); };
  const fBk = document.getElementById("ecoFiltreBoitiers");
  if (fBk) fBk.onchange = function() { basculerCategorie("BOITIER", this.checked); };
  const fNt = document.getElementById("ecoFiltreNets");
  if (fNt) fNt.onchange = function() { basculerCategorie("NET", this.checked); };
  const fVl = document.getElementById("ecoFiltreValeurs");
  if (fVl) fVl.onchange = function() { basculerCategorie("VALEUR", this.checked); };
  const fSp = document.getElementById("ecoFiltreSuppr");
  if (fSp) fSp.onchange = function() { basculerCategorie("SUPPRESSION", this.checked); };

  // Tout cocher / Décocher
  const bAll = document.getElementById("bEcoSelectAll");
  if (bAll) bAll.onclick = () => {
    rapport.items.forEach((it, idx) => {
      it.active = true;
      const cb = document.getElementById("eco_item_" + idx);
      if (cb) cb.checked = true;
    });
    rafraichirCompteurs();
  };
  const bNone = document.getElementById("bEcoDeselectAll");
  if (bNone) bNone.onclick = () => {
    rapport.items.forEach((it, idx) => {
      it.active = false;
      const cb = document.getElementById("eco_item_" + idx);
      if (cb) cb.checked = false;
    });
    rafraichirCompteurs();
  };

  // Fermetures
  const fermer = () => m.remove();
  const bCloseX = document.getElementById("bEcoCloseX");
  if (bCloseX) bCloseX.onclick = fermer;
  const bAnnuler = document.getElementById("bEcoAnnuler");
  if (bAnnuler) bAnnuler.onclick = fermer;
  m.onclick = e => { if (e.target === m) fermer(); };

  // Importer un autre fichier
  const bAutre = document.getElementById("bEcoImporterAutre");
  if (bAutre) {
    bAutre.onclick = () => {
      fermer();
      pcbChoisirFichierSchemaPourEco();
    };
  }

  // EXÉCUTION DE L'ECO
  const bExec = document.getElementById("bEcoExecuter");
  if (bExec) {
    bExec.onclick = () => {
      const optConflits = document.getElementById("ecoOptNettoyerConflits");
      const nettoyerConflits = optConflits ? optConflits.checked : false;

      const res = pcbAppliquerEco(rapport.items, {
        garderRoutage: true,
        nettoyerConflits: nettoyerConflits,
        supprimerPistesOrphelines: false
      });

      fermer();

      if (res.succes) {
        let msg = `✅ ECO appliqué : ${res.nbAppliques} modification(s) effectuée(s).`;
        if (res.ajouts) msg += ` +${res.ajouts} empreinte(s)`;
        if (res.boitiers) msg += ` · ${res.boitiers} boîtier(s) mis à jour`;
        if (res.nets) msg += ` · ${res.nets} net(s) mis à jour`;
        if (res.pistesSupprimees) msg += ` · ${res.pistesSupprimees} piste(s) nettoyée(s)`;
        else msg += ` · 100% des pistes (${res.pistesConservees}) conservées`;

        if (typeof hint === "function") hint(msg);
        if (typeof pcbAfficherToastFeedback === "function") {
          pcbAfficherToastFeedback(msg, true);
        }
      } else {
        if (typeof hint === "function") hint("⚠️ " + (res.msg || "Aucun changement appliqué."));
      }
    };
  }
}

/**
 * Boîte de dialogue de sélection de fichier schéma (.json) ou netlist (.txt)
 */
function pcbChoisirFichierSchemaPourEco() {
  if (typeof document === "undefined") return;
  let fileIn = document.getElementById("ecoFileInput");
  if (!fileIn) {
    fileIn = document.createElement("input");
    fileIn.id = "ecoFileInput";
    fileIn.type = "file";
    fileIn.accept = ".json,.txt,.net,text/plain,application/json";
    fileIn.style.display = "none";
    document.body.appendChild(fileIn);
  }
  fileIn.value = "";
  fileIn.onchange = function(e) {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = function() {
      pcbOuvrirFenetreEco(String(r.result));
    };
    r.readAsText(f);
  };
  fileIn.click();
}

/* =============================================================================
   6. SURVEILLANCE & NOTIFICATION AUTOMATIQUE D'ÉCART (BADGE ECO)
   ============================================================================= */

/**
 * Analyse l'état et met à jour l'indicateur / badge du bouton "bEcoSync"
 */
function pcbVerifierEtNotifierEco(silencieux) {
  const schData = pcbObtenirDonneesSchema();
  if (!schData.disponible) {
    const badge = document.getElementById("ecoBadge");
    if (badge) badge.style.display = "none";
    return null;
  }

  const rapport = pcbDetecterDisparitesEco(schData);
  const btn = document.getElementById("bEcoSync");
  const badge = document.getElementById("ecoBadge");

  if (badge) {
    if (rapport.total > 0) {
      badge.textContent = String(rapport.total);
      badge.style.display = "inline-block";
      badge.style.background = "#f59e0b";
      badge.style.color = "#111";
      if (btn) btn.title = `Synchronisation Schéma ↔ PCB : ${rapport.total} disparité(s) détectée(s). Cliquez pour ouvrir l'ECO.`;
    } else {
      badge.textContent = "✓";
      badge.style.display = "inline-block";
      badge.style.background = "#22c55e";
      badge.style.color = "#111";
      if (btn) btn.title = "Schéma et PCB synchronisés (0 disparité). Cliquez pour inspecter.";
    }
  }

  if (!silencieux && rapport.total > 0) {
    if (typeof hint === "function") {
      hint(`🔄 ${rapport.total} disparité(s) Schéma ↔ PCB détectée(s) — Cliquez sur « Schéma ↔ PCB » pour ouvrir l'ECO.`);
    }
  }

  return rapport;
}

/* =============================================================================
   7. INITIALISATION DU MODULE & ÉCOUTEURS D'ÉVÉNEMENTS
   ============================================================================= */

function pcbInitialiserEcoSync() {
  // Câblage du canal BroadcastChannel
  if (typeof sessEcouterSchemaModif === "function") {
    sessEcouterSchemaModif(function(detail) {
      if (typeof pcbVerifierEtNotifierEco === "function") {
        pcbVerifierEtNotifierEco(false);
      }
    });
  }

  // Vérification au focus de la fenêtre (retour d'onglet depuis l'éditeur schématique)
  if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
    window.addEventListener("focus", function() {
      setTimeout(function() {
        if (typeof pcbVerifierEtNotifierEco === "function") {
          pcbVerifierEtNotifierEco(true);
        }
      }, 200);
    });
  }
}

pcbInitialiserEcoSync();
