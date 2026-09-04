/* =============================================================================
   commun/ia-assistant.js
   Assistant IA Technique — Gemma 4 31B (Google AI Studio)
   Composant partagé : Schématique, PCB, Visionneuse IPC-2581
   
   GESTION STRICTE DE LA CLÉ API :
   - La clé API n'est conservée QU'EN MÉMOIRE VIVE pendant l'ouverture de la section.
   - À chaque fermeture (bouton ✕, Échap, clic arrière-plan), la clé est
     immédiatement effacée (_cleApi = "").
   - Aucun stockage (localStorage, sessionStorage, cookie, profil) n'est utilisé.
   ============================================================================= */
"use strict";

(function() {
  /* ---------- État privé éphémère ---------- */
  let _cleApi = "";             // Variable en mémoire vive uniquement, JAMAIS persistée
  let _modele = "gemma-4-31b-it"; // Modèle Google AI Studio
  let _historique = [];         // Messages de la session en cours
  let _enAttente = false;       // Requête en cours
  let _inclureContexte = true;  // Transmettre l'état CAO courant
  let _domConstruit = false;
  let _questionEnAttente = "";  // Question préparée depuis le menu contextuel

  /* ---------- Détection de l'outil courant ---------- */
  function detecterOutil() {
    const p = (typeof window !== "undefined" && window.location && window.location.pathname) ? window.location.pathname.toLowerCase() : "";
    if (p.includes("pcb") || (typeof S !== "undefined" && S && Array.isArray(S.fp))) return "pcb";
    if (p.includes("ipc") || (typeof V !== "undefined" && V && typeof V.modele !== "undefined")) return "ipc2581";
    return "schema";
  }

  /* ---------- Extraction du contexte CAO Détaillé (Composants & Netlist) ---------- */
  function extraireContexteCao() {
    const outil = detecterOutil();
    const resume = [];

    try {
      if (outil === "schema" && typeof S !== "undefined" && S) {
        resume.push("Outil actif : Éditeur Schématique Web CAO.");
        if (Array.isArray(S.pages)) {
          const pNom = (S.pages[S.page] && S.pages[S.page].name) ? (" (« " + S.pages[S.page].name + " »)") : "";
          resume.push("Feuille active : " + (S.page + 1) + " sur " + S.pages.length + pNom + ".");
        }

        // 1. Liste complète des composants et symboles de la feuille active
        if (Array.isArray(S.comps) && S.comps.length > 0) {
          const compsList = [];
          const alimsList = [];
          S.comps.forEach(c => {
            const def = (typeof defOf === "function") ? defOf(c.type) : null;
            const nomType = def ? def.n : (c.type || "Composant");
            const val = (c.value || c.val || "").trim();
            const ref = (c.ref || "").trim();
            if (c.type === "vcc" || c.type === "gnd" || c.type === "port" || c.type === "gport") {
              alimsList.push(nomType + " : " + (val || ref || c.type));
            } else {
              compsList.push((ref || "?") + (val ? (" = " + val) : "") + " (" + nomType + (c.pkg ? (", boîtier " + c.pkg) : "") + ")");
            }
          });

          if (compsList.length > 0) {
            resume.push("\nComposants sur la feuille active (" + compsList.length + ") :\n  * " + compsList.join("\n  * "));
          }
          if (alimsList.length > 0) {
            resume.push("\nRails d'alimentation et ports E/S :\n  * " + alimsList.join("\n  * "));
          }
        }

        // 2. Netlist & Interconnexions électriques complètes
        try {
          const netRes = (typeof nets === "function") ? nets() : null;
          if (netRes && Array.isArray(netRes.list) && netRes.list.length > 0) {
            const netsDesc = [];
            netRes.list.forEach(n => {
              const nds = (n.nodes || []).map(nd => nd.ref + (nd.label ? (" (" + nd.label + ")") : (nd.pin ? ("." + nd.pin) : "")));
              const pws = (n.powers || []).map(p => p.value || (typeof defOf === "function" ? defOf(p.type).n : p.type));
              const tous = [...pws, ...nds];
              if (tous.length > 1) {
                netsDesc.push("Net \"" + n.name + "\" : " + tous.join(" ── "));
              } else if (tous.length === 1) {
                netsDesc.push("Net \"" + n.name + "\" : " + tous[0] + " (non connecté)");
              }
            });
            if (netsDesc.length > 0) {
              resume.push("\nInterconnexions électriques réelles (Netlist) :\n  * " + netsDesc.join("\n  * "));
            }
          }
        } catch (eNet) {
          console.warn("Extraction nets schématique :", eNet);
        }

        // 3. Annotations et textes sur le schéma (S.drawings)
        if (Array.isArray(S.drawings) && S.drawings.length > 0) {
          const annotations = S.drawings.filter(d => d.label && d.label.trim()).map(d => d.label.trim());
          if (annotations.length > 0) {
            resume.push("\nTextes et annotations sur le schéma :\n  * \"" + annotations.join("\"\n  * \"") + "\"");
          }
        }

        // 4. Composants actuellement sélectionnés
        if (S.sel && S.sel.size > 0 && Array.isArray(S.comps)) {
          const selComps = S.comps.filter(c => S.sel.has(c.id)).map(c => (c.ref || c.type) + (c.value ? (" [" + c.value + "]") : ""));
          if (selComps.length > 0) resume.push("\nÉléments actuellement sélectionnés : " + selComps.join(", "));
        }
      } else if (outil === "pcb" && typeof S !== "undefined" && S) {
        resume.push("Outil actif : Éditeur PCB Web CAO.");
        if (S.board) {
          resume.push("Dimensions carte : " + (Math.round((S.board.w || 0) * 10) / 10) + " × " + (Math.round((S.board.h || 0) * 10) / 10) + " mm.");
        }
        if (Array.isArray(S.layers)) {
          const cu = S.layers.filter(l => l && l.cu);
          resume.push("Empilage cuivre : " + cu.length + " couche(s).");
        }
        if (Array.isArray(S.fp) && S.fp.length > 0) {
          const fpList = S.fp.map(f => (f.ref || "Fp") + (f.value ? (" [" + f.value + "]") : "") + (f.pkg ? (" (" + f.pkg + ")") : ""));
          resume.push("\nComposants posés sur le PCB (" + S.fp.length + ") :\n  * " + fpList.slice(0, 40).join("\n  * ") + (fpList.length > 40 ? ("\n  * ... (" + (fpList.length - 40) + " autres)") : ""));
        }
        if (Array.isArray(S.tracks)) {
          resume.push("\nRoutage : " + S.tracks.length + " segments de piste" + (Array.isArray(S.vias) ? (", " + S.vias.length + " vias") : "") + ".");
        }
        if (S.activeNet || S.hlNet) {
          resume.push("Net actif sélectionné : " + (S.activeNet || S.hlNet) + ".");
        }
      } else if (outil === "ipc2581" && typeof V !== "undefined" && V) {
        resume.push("Outil actif : Visionneuse IPC-2581 Web CAO.");
        if (V.fichier) resume.push("Fichier IPC-2581 : " + V.fichier + ".");
        if (Array.isArray(V.couches)) resume.push("Couches : " + V.couches.length + ".");
        if (Array.isArray(V.parNet)) resume.push("Nets électriques : " + V.parNet.length + ".");
        if (V.comp) resume.push("Composant inspecté : " + V.comp + ".");
        if (V.net >= 0 && Array.isArray(V.modele && V.modele.nets)) {
          const netObj = V.modele.nets[V.net];
          if (netObj && netObj.nom) resume.push("Net inspecté : " + netObj.nom + ".");
        }
      }
    } catch (e) {
      console.warn("Contexte CAO non disponible :", e);
    }

    return resume.length > 0 ? resume.join("\n") : "Outil CAO électronique Web.";
  }

  /* ---------- Suggestions rapides selon l'outil ---------- */
  const SUGGESTIONS = {
    schema: [
      "Résistance pull-up I2C : calcul et valeurs types",
      "Découplage d'alimentation : règles et valeurs (100nF/10µF)",
      "Protection contre les inversions de polarité (MOSFET P)",
      "Filtrage passe-bas RC pour une entrée analogique ADC"
    ],
    pcb: [
      "Largeur de piste pour 2A (échauffement 10°C, cuivre 35µm)",
      "Règles de routage d'une paire diff USB 2.0 (90 Ω)",
      "Chemin de retour HF et fente dans le plan de masse",
      "Vias thermiques sous un pad de puissance QFN"
    ],
    ipc2581: [
      "Structure d'un fichier IPC-2581 (FunctionMode, Step, Layer)",
      "Différences clés entre IPC-2581 Rev B et Rev C",
      "Tolérances de perçage et classes de fabrication IPC",
      "Règles d'isolation et d'expansion de masque de soudure"
    ]
  };

  /* ---------- Extraction des données détaillées de sélection (JSON) ---------- */
  function extraireDonneesSelectionDetaillees() {
    const outil = detecterOutil();

    // 1. ÉDITEUR PCB
    if (outil === "pcb" && typeof S !== "undefined" && S) {
      let pistesSel = [];
      if (S.sel && S.sel.tracks && S.sel.tracks.size > 0) {
        pistesSel = Array.from(S.sel.tracks);
      } else if (S.hlNet && Array.isArray(S.tracks)) {
        pistesSel = S.tracks.filter(t => t.net === S.hlNet);
      }

      if (pistesSel.length > 0) {
        const parNet = {};
        pistesSel.forEach(t => {
          const netNom = t.net || "Sans-Net";
          if (!parNet[netNom]) {
            parNet[netNom] = {
              net: netNom,
              segments: [],
              longueurMm: 0,
              largeursMm: new Set(),
              couches: new Set()
            };
          }
          const segLen = Math.hypot(t.x2 - t.x1, t.y2 - t.y1);
          parNet[netNom].longueurMm += segLen;
          parNet[netNom].segments.push({
            x1: Math.round(t.x1 * 100) / 100,
            y1: Math.round(t.y1 * 100) / 100,
            x2: Math.round(t.x2 * 100) / 100,
            y2: Math.round(t.y2 * 100) / 100,
            w: t.w,
            layer: t.layer
          });
          if (t.w) parNet[netNom].largeursMm.add(t.w);
          if (t.layer != null) parNet[netNom].couches.add(t.layer);
        });

        const listeNets = Object.values(parNet).map(n => ({
          net: n.net,
          nbSegments: n.segments.length,
          longueurMm: Math.round(n.longueurMm * 100) / 100,
          largeurs: Array.from(n.largeursMm),
          couches: Array.from(n.couches)
        }));

        const longueurs = listeNets.map(n => n.longueurMm);
        const lMin = Math.min(...longueurs);
        const lMax = Math.max(...longueurs);
        const skew = Math.round((lMax - lMin) * 1000) / 1000;

        let viasSel = [];
        if (S.sel && S.sel.vias && S.sel.vias.size > 0) {
          viasSel = Array.from(S.sel.vias).map(v => ({ x: v.x, y: v.y, net: v.net, drill: v.drill, pad: v.pad }));
        }

        let ecartEstime = null;
        if (pistesSel.length >= 2) {
          let minD = 999999;
          for (let i = 0; i < pistesSel.length; i++) {
            const t1 = pistesSel[i];
            const mx1 = (t1.x1 + t1.x2) / 2, my1 = (t1.y1 + t1.y2) / 2;
            for (let j = i + 1; j < pistesSel.length; j++) {
              const t2 = pistesSel[j];
              if (t1.net !== t2.net) {
                const mx2 = (t2.x1 + t2.x2) / 2, my2 = (t2.y1 + t2.y2) / 2;
                const d = Math.hypot(mx2 - mx1, my2 - my1) - (t1.w || 0.25) / 2 - (t2.w || 0.25) / 2;
                if (d > 0.05 && d < minD) minD = d;
              }
            }
          }
          if (minD < 9999) ecartEstime = Math.round(minD * 100) / 100;
        }

        return {
          type: "pcb_bus",
          titre: listeNets.length > 1 ? ("Bus de " + listeNets.length + " pistes") : ("Piste " + listeNets[0].net),
          badge: listeNets.length > 1 ? (listeNets.length + " signaux") : (pistesSel.length + " segments"),
          nbSignaux: listeNets.length,
          skewMm: skew,
          longueurMinMm: lMin,
          longueurMaxMm: lMax,
          ecartementMm: ecartEstime,
          listeNets: listeNets,
          vias: viasSel,
          json: {
            busSignaux: listeNets,
            skewMm: skew,
            ecartementEstimeMm: ecartEstime,
            viasAssocies: viasSel
          }
        };
      }

      if (S.sel && S.sel.fps && S.sel.fps.size > 0) {
        const fps = Array.from(S.sel.fps).map(f => ({
          ref: f.ref,
          val: f.val,
          package: f.package,
          layer: f.layer,
          padsCount: (f.pads || []).length
        }));
        return {
          type: "pcb_fps",
          titre: fps.length + " composant(s) sélectionné(s)",
          badge: fps.length + " composants",
          fps: fps,
          json: { empreintes: fps }
        };
      }
    }

    // 2. ÉDITEUR SCHÉMATIQUE
    if (outil === "schema" && typeof S !== "undefined" && S) {
      const selComps = (S.sel && S.sel.size > 0 && Array.isArray(S.comps)) ? S.comps.filter(c => S.sel.has(c.id)) : [];
      const selWires = (S.selW && S.selW.size > 0 && Array.isArray(S.wires)) ? S.wires.filter(w => S.selW.has(w)) : [];

      if (selComps.length > 0 || selWires.length > 0) {
        const compsData = selComps.map(c => ({
          ref: c.ref,
          val: c.val,
          type: c.type,
          pins: (c.pins || []).map(p => ({ num: p.num, name: p.name, dir: p.dir }))
        }));

        const busLabels = selWires.filter(w => w.isBus || (w.label && w.label.includes("["))).map(w => w.label || "Bus");

        return {
          type: "schema_selection",
          titre: busLabels.length > 0 ? ("Bus & Composants (" + selComps.length + " réf)") : (selComps.length + " composant(s), " + selWires.length + " fil(s)"),
          badge: selComps.length > 0 ? (selComps.length + " comp.") : (selWires.length + " fils"),
          comps: compsData,
          nbFils: selWires.length,
          busLabels: busLabels,
          json: {
            composants: compsData,
            filsSelectionnes: selWires.length,
            busLabels: busLabels
          }
        };
      }
    }

    // 3. VISIONNEUSE IPC-2581
    if (outil === "ipc2581" && typeof V !== "undefined" && V) {
      if (V.net >= 0 && V.modele && Array.isArray(V.modele.nets)) {
        const netObj = V.modele.nets[V.net];
        const nomNet = (netObj && netObj.nom) ? netObj.nom : ("Net #" + V.net);
        const donneesNet = (V.parNet && V.parNet[V.net]) || {};
        const pistes = donneesNet.pistes || [];
        const trous = donneesNet.trous || [];

        let lenTotal = 0;
        const couches = new Set();
        const largeurs = new Set();
        pistes.forEach(p => {
          if (p.pts && p.pts.length >= 4) {
            lenTotal += Math.hypot(p.pts[2] - p.pts[0], p.pts[3] - p.pts[1]);
          }
          if (p.w) largeurs.add(p.w);
          if (p.cch != null) couches.add(p.cch);
        });

        return {
          type: "ipc_net",
          titre: "Net IPC-2581 : " + nomNet,
          badge: nomNet,
          netNom: nomNet,
          longueurMm: Math.round(lenTotal * 100) / 100,
          nbVias: trous.length,
          couches: Array.from(couches),
          largeurs: Array.from(largeurs),
          json: {
            net: nomNet,
            longueurTotaleMm: Math.round(lenTotal * 100) / 100,
            nbSegmentsPistes: pistes.length,
            nbTrousOuVias: trous.length,
            largeursMm: Array.from(largeurs),
            couchesIndices: Array.from(couches)
          }
        };
      }

      if (V.comp) {
        return {
          type: "ipc_comp",
          titre: "Composant IPC-2581 : " + V.comp,
          badge: V.comp,
          compRef: V.comp,
          json: { composant: V.comp }
        };
      }
    }

    return null;
  }

  /* ---------- Actions sur le Menu Contextuel ---------- */
  function iaCacherMenuContextuel() {
    const menu = document.getElementById("iaContextMenu");
    if (menu) menu.hidden = true;
  }

  function iaLancerAnalyseSelection(donnees) {
    let prompt = "";

    if (!donnees) {
      iaOuvrir();
      return;
    }

    if (donnees.type === "pcb_bus") {
      const lignesNets = donnees.listeNets.map(n => 
        "  * " + n.net + " : " + n.longueurMm + " mm (largeur: " + (n.largeurs.join('/') || '0.25') + " mm, couche: " + (n.couches.join('/') || 'Top') + ")"
      ).join("\n");

      prompt = 
        "Analyse le routage de ce bus de pistes (données réelles extraites de l'éditeur PCB) :\n" +
        "- Nombre de signaux : " + donnees.nbSignaux + " (" + donnees.listeNets.map(n => n.net).join(", ") + ")\n" +
        "- Longueurs mesurées par piste :\n" + lignesNets + "\n" +
        "- Delta max de longueur (Skew) : " + donnees.skewMm + " mm\n" +
        (donnees.ecartementMm ? ("- Espacement moyen inter-pistes estimé : " + donnees.ecartementMm + " mm\n") : "") +
        "- Vias dans la sélection : " + (donnees.vias ? donnees.vias.length : 0) + "\n\n" +
        "Données techniques (JSON) :\n```json\n" + JSON.stringify(donnees.json, null, 2) + "\n```\n\n" +
        "Question : Vérifie l'alignement de mon bus et dis-moi si ce décalage de longueur (skew) est acceptable pour une fréquence de 100 MHz (ou supérieure). Analyse également l'espacement vis-à-vis de la règle des 3W et les risques de diaphonie (crosstalk).";

    } else if (donnees.type === "pcb_fps") {
      prompt = 
        "Vérifie ces composants positionnés sur le PCB :\n" +
        "- Empreintes : " + donnees.fps.map(f => f.ref + " (" + (f.val || f.package || "composant") + ")").join(", ") + "\n\n" +
        "Données techniques (JSON) :\n```json\n" + JSON.stringify(donnees.json, null, 2) + "\n```\n\n" +
        "Question : Analyse le choix de ces boîtiers, la disposition des pastilles et les recommandations de routage associées.";

    } else if (donnees.type === "schema_selection") {
      prompt = 
        "Vérifie cette portion de schéma électronique (données réelles de l'éditeur schématique) :\n" +
        "- Composants : " + donnees.comps.map(c => (c.ref || "Composant") + (c.val ? " [" + c.val + "]" : "")).join(", ") + "\n" +
        "- Fils sélectionnés : " + donnees.nbFils + "\n" +
        (donnees.busLabels && donnees.busLabels.length ? ("- Bus identifiés : " + donnees.busLabels.join(", ") + "\n") : "") + "\n" +
        "Données techniques (JSON) :\n```json\n" + JSON.stringify(donnees.json, null, 2) + "\n```\n\n" +
        "Question : Analyse la cohérence électrique de cette sélection, la pertinence des valeurs et dis-moi s'il manque des découplages ou des résistances de tirage.";

    } else if (donnees.type === "ipc_net") {
      prompt = 
        "Analyse ce net issu de la carte IPC-2581 :\n" +
        "- Net : " + donnees.netNom + "\n" +
        "- Longueur totale de cuivre : " + donnees.longueurMm + " mm\n" +
        "- Nombre de trous / vias : " + donnees.nbVias + "\n" +
        "- Largeurs de cuivre : " + (donnees.largeurs.join(", ") || "standard") + " mm\n\n" +
        "Données techniques (JSON) :\n```json\n" + JSON.stringify(donnees.json, null, 2) + "\n```\n\n" +
        "Question : Donne ton avis d'expert sur ce tracé selon les critères industriels IPC (continuité, estimation d'impédance, pertes et transitions).";

    } else if (donnees.type === "ipc_comp") {
      prompt = 
        "Inspecte ce composant issu du fichier IPC-2581 :\n" +
        "- Repère : " + donnees.compRef + "\n\n" +
        "Question : Quelles sont les vérifications d'assemblage et de conformité à effectuer sur ce composant d'après les normes IPC ?";
    }

    _questionEnAttente = prompt;
    iaOuvrir();

    if (_cleApi) {
      const input = document.getElementById("iaInput");
      if (input) {
        input.value = prompt;
        input.style.height = "auto";
        input.style.height = Math.max(56, Math.min(input.scrollHeight, 160)) + "px";
        _questionEnAttente = "";
        setTimeout(() => input.focus(), 60);
      }
    }
  }

  function iaAfficherMenuContextuel(e) {
    if (!e) return false;

    // Laisser la priorité à l'annulation de tracé
    const outil = detecterOutil();
    if (outil === "schema" && typeof S !== "undefined" && S) {
      if (S.wireStart || S.drawStart || S.place) return false;
    } else if (outil === "pcb" && typeof S !== "undefined" && S) {
      if (S.route || S.zoneDraft || S.edgeDraft || S.dp) return false;
    }

    e.preventDefault();

    let menu = document.getElementById("iaContextMenu");
    if (!menu) {
      menu = document.createElement("div");
      menu.id = "iaContextMenu";
      menu.className = "ia-context-menu";
      menu.hidden = true;
      document.body.appendChild(menu);

      window.addEventListener("pointerdown", function(evt) {
        if (!menu.hidden && !menu.contains(evt.target)) {
          menu.hidden = true;
        }
      });
      window.addEventListener("keydown", function(evt) {
        if (evt.key === "Escape" && !menu.hidden) {
          menu.hidden = true;
        }
      });
    }

    const donnees = extraireDonneesSelectionDetaillees();
    let html = '<div class="ia-menu-head"><span>Assistant IA (Gemma 4 31B)</span></div>';

    if (donnees) {
      let actionTitre = "📐 Analyser avec l'IA ✨";
      let actionSous = "Inspection des données techniques";

      if (donnees.type === "pcb_bus") {
        actionTitre = donnees.nbSignaux > 1 ? "📐 Analyser le bus de pistes ✨" : "📐 Analyser la piste ✨";
        actionSous = "Longueurs, skew, espacement et intégrité";
      } else if (donnees.type === "pcb_fps") {
        actionTitre = "🔍 Vérifier les composants ✨";
        actionSous = "Boîtiers, pastilles et empreintes";
      } else if (donnees.type === "schema_selection") {
        actionTitre = "🔍 Vérifier la sélection schéma ✨";
        actionSous = "Connectivité, valeurs et cohérence";
      } else if (donnees.type === "ipc_net") {
        actionTitre = "📐 Analyser le net cuivre IPC ✨";
        actionSous = "Parcours, vias et critères industriels";
      } else if (donnees.type === "ipc_comp") {
        actionTitre = "🔍 Inspecter le composant IPC ✨";
        actionSous = "Brochage et références de fabrication";
      }

      html += 
        '<div class="ia-menu-item primary" id="iaMenuActSelection">' +
          '<div class="ia-menu-item-left">' +
            '<span class="ia-menu-ico">✨</span>' +
            '<div>' +
              '<div>' + actionTitre + '</div>' +
              '<div class="ia-menu-subtext">' + actionSous + '</div>' +
            '</div>' +
          '</div>' +
          (donnees.badge ? ('<span class="ia-menu-badge">' + echapperHtml(donnees.badge) + '</span>') : '') +
        '</div>' +
        '<div class="ia-menu-sep"></div>';
    }

    html += 
      '<div class="ia-menu-item" id="iaMenuActGeneral">' +
        '<div class="ia-menu-item-left">' +
          '<span class="ia-menu-ico">💬</span>' +
          '<div>' +
            '<div>Poser une question technique…</div>' +
            '<div class="ia-menu-subtext">Dimensionnement, formules, normes</div>' +
          '</div>' +
        '</div>' +
      '</div>';

    menu.innerHTML = html;

    const btnSel = menu.querySelector("#iaMenuActSelection");
    if (btnSel) {
      btnSel.onclick = function() {
        menu.hidden = true;
        iaLancerAnalyseSelection(donnees);
      };
    }
    const btnGen = menu.querySelector("#iaMenuActGeneral");
    if (btnGen) {
      btnGen.onclick = function() {
        menu.hidden = true;
        iaOuvrir();
      };
    }

    menu.style.visibility = "hidden";
    menu.hidden = false;
    const r = menu.getBoundingClientRect();
    const mw = r.width || 260, mh = r.height || 120;
    const posX = Math.min(e.clientX + 2, window.innerWidth - mw - 10);
    const posY = Math.min(e.clientY + 2, window.innerHeight - mh - 10);
    menu.style.left = Math.max(10, posX) + "px";
    menu.style.top = Math.max(10, posY) + "px";
    menu.style.visibility = "visible";

    return true;
  }

  /* ---------- Construction du DOM dans la section Espace de Travail ---------- */
  function construireDom() {
    if (_domConstruit) return;

    // Le conteneur cible est le corps de la section d'espace de travail : #iaPanneau
    let panneau = document.getElementById("iaPanneau");
    if (!panneau) {
      // Cas de secours défensif si pas de section déclarée
      panneau = document.createElement("div");
      panneau.id = "iaPanneau";
      document.body.appendChild(panneau);
    }

    _domConstruit = true;

    panneau.innerHTML = 
      '<div class="ia-panneau-wrap">' +
        /* 1. Barre de connexion compacte (demandée à chaque ouverture tant que pas de clé) */
        '<div class="ia-panel-connect" id="iaPanelConnect">' +
          '<form class="ia-connect-row" id="iaKeyForm" onsubmit="return false;">' +
            '<span class="ia-lock-ico" title="Sécurité éphémère : clé conservée en mémoire vive uniquement">🔒</span>' +
            '<input type="password" id="iaKeyInput" class="ia-key-input-compact" autocomplete="off" spellcheck="false" placeholder="Clé API Google AI Studio (AIzaSy...)" aria-label="Clé API Google AI Studio">' +
            '<button type="button" class="ia-btn-eye-compact" id="iaBtnEye" title="Afficher/Masquer la clé">👁</button>' +
            '<button type="submit" class="ia-btn-ok-compact" id="iaBtnSubmitKey">Valider</button>' +
          '</form>' +
          '<div class="ia-connect-hint">' +
            '<span>🔒 Mémoire vive seule · Oubliée à la fermeture</span>' +
            '<a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer">Clé gratuite ↗</a>' +
          '</div>' +
        '</div>' +

        /* 2. Barre de statut compacte (active dès la clé validée) */
        '<div class="ia-panel-status" id="iaPanelStatus" hidden>' +
          '<div class="ia-status-left">' +
            '<span class="ia-status-dot"></span>' +
            '<span class="ia-status-model">Gemma 4 31B</span>' +
            '<span class="ia-status-ctx" id="iaContextText">Prêt</span>' +
          '</div>' +
          '<div class="ia-status-actions">' +
            '<button type="button" class="ia-subbar-btn" id="iaBtnClear" title="Vider l\'historique des échanges de cette session">Vider</button>' +
            '<button type="button" class="ia-subbar-btn danger" id="iaBtnPurgeKey" title="Effacer la clé de la mémoire">Oublier clé</button>' +
          '</div>' +
        '</div>' +

        /* 3. Bannière d'erreur éventuelle */
        '<div class="ia-error-banner" id="iaErrorBanner" hidden>' +
          '<span id="iaErrorText"></span>' +
          '<button type="button" id="iaBtnDismissError">✕</button>' +
        '</div>' +

        /* 4. Liste des messages (flex: 1, scroll vertical, prend tout le reste de la hauteur) */
        '<div class="ia-messages scroll" id="iaMessages"></div>' +

        /* 5. Pied de panneau : Saisie de message et envoi */
        '<div class="ia-footer">' +
          '<div class="ia-input-row">' +
            '<textarea id="iaInput" class="ia-textarea" rows="2" placeholder="Posez votre question technique à Gemma 4 31B... (Entrée pour envoyer, Maj+Entrée pour nouvelle ligne)"></textarea>' +
            '<button type="button" class="ia-btn-send" id="iaBtnSend" title="Envoyer le message (Entrée)">' +
              '<svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>' +
            '</button>' +
          '</div>' +
          '<div class="ia-footer-hints">' +
            '<label title="Transmet un résumé technique du circuit/carte pour guider la réponse">' +
              '<input type="checkbox" id="iaChkContext" checked> Contexte projet' +
            '</label>' +
            '<span>Gemma 4 31B · Session éphémère</span>' +
          '</div>' +
        '</div>' +
      '</div>';

    /* Bouton fermer dans l'en-tête du panneau workspace */
    const panelSection = document.querySelector('.pnl[data-pnl="ia"]');
    if (panelSection) {
      const btnClose = panelSection.querySelector('.pnl-btn[data-act="close"]');
      if (btnClose) {
        btnClose.addEventListener("click", function() {
          iaPurgerCle();
        });
      }
    }

    /* Actions de sécurité & purge clé */
    document.getElementById("iaBtnPurgeKey").addEventListener("click", function() {
      iaPurgerCle();
    });

    /* Afficher/masquer le mot de passe */
    const btnEye = document.getElementById("iaBtnEye");
    const inputCle = document.getElementById("iaKeyInput");
    btnEye.addEventListener("click", function() {
      const estPswd = inputCle.type === "password";
      inputCle.type = estPswd ? "text" : "password";
      btnEye.textContent = estPswd ? "🙈" : "👁";
    });

    /* Soumission de clé */
    document.getElementById("iaKeyForm").addEventListener("submit", function(e) {
      e.preventDefault();
      validerCle();
    });
    document.getElementById("iaBtnSubmitKey").addEventListener("click", validerCle);

    /* Actions discussion */
    document.getElementById("iaBtnClear").addEventListener("click", function() {
      _historique = [];
      rendreMessages();
    });

    document.getElementById("iaBtnDismissError").addEventListener("click", function() {
      document.getElementById("iaErrorBanner").hidden = true;
    });

    /* Envoi de message */
    const textarea = document.getElementById("iaInput");
    textarea.addEventListener("keydown", function(e) {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        envoyerMessage();
      }
    });
    textarea.addEventListener("input", function() {
      this.style.height = "auto";
      this.style.height = Math.max(56, Math.min(this.scrollHeight, 160)) + "px";
    });

    document.getElementById("iaBtnSend").addEventListener("click", envoyerMessage);

    document.getElementById("iaChkContext").addEventListener("change", function() {
      _inclureContexte = this.checked;
    });

    // Raccourci Alt+I pour ouvrir / fermer
    window.addEventListener("keydown", function(e) {
      if (e.altKey && (e.key === "i" || e.key === "I")) {
        e.preventDefault();
        if (typeof wsPlaceOf === "function" && wsPlaceOf("ia") !== "hidden") {
          iaFermer();
        } else {
          iaOuvrir();
        }
      }
    });

    // Échap quand le focus est dans le panneau IA
    panneau.addEventListener("keydown", function(e) {
      if (e.key === "Escape") {
        iaFermer();
      }
    });

    // Rendu initial des messages d'accueil et puces de questions
    rendreMessages();
  }

  /* ---------- Affichage de la barre de saisie de clé ---------- */
  function afficherEcranCle() {
    const pnlConnect = document.getElementById("iaPanelConnect");
    const pnlStatus = document.getElementById("iaPanelStatus");
    const inputKey = document.getElementById("iaKeyInput");
    if (pnlConnect) pnlConnect.hidden = false;
    if (pnlStatus) pnlStatus.hidden = true;
    if (inputKey) {
      inputKey.value = "";
      setTimeout(() => inputKey.focus(), 50);
    }
  }

  /* ---------- Validation de la clé saisie ---------- */
  function validerCle() {
    const input = document.getElementById("iaKeyInput");
    const val = (input ? input.value : "").trim();
    if (!val) {
      if (input) {
        input.focus();
        input.style.borderColor = "var(--red, #e8443a)";
        setTimeout(() => input.style.borderColor = "", 1500);
      }
      return;
    }
    _cleApi = val; // Mémorisé UNIQUEMENT dans la variable en mémoire vive (RAM)
    input.value = ""; // Vider immédiatement le champ HTML
    basculerVersChat();

    // Si une question était en attente (ex. analyse contextuelle), l'envoyer
    if (_questionEnAttente) {
      const inputChat = document.getElementById("iaInput");
      if (inputChat) {
        inputChat.value = _questionEnAttente;
        inputChat.style.height = "auto";
        inputChat.style.height = Math.min(inputChat.scrollHeight, 110) + "px";
        _questionEnAttente = "";
      }
      envoyerMessage();
    }
  }

  /* ---------- Bascule vers la discussion active ---------- */
  function basculerVersChat() {
    const pnlConnect = document.getElementById("iaPanelConnect");
    const pnlStatus = document.getElementById("iaPanelStatus");
    if (pnlConnect) pnlConnect.hidden = true;
    if (pnlStatus) pnlStatus.hidden = false;

    // Mise à jour de la barre de statut
    const ctxText = document.getElementById("iaContextText");
    const outil = detecterOutil();
    const nomsOutils = { schema: "Schématique", pcb: "PCB", ipc2581: "IPC-2581" };
    if (ctxText) ctxText.textContent = "Contexte : " + (nomsOutils[outil] || "CAO");

    rendreMessages();

    const input = document.getElementById("iaInput");
    if (input) {
      if (_questionEnAttente) {
        input.value = _questionEnAttente;
        input.style.height = "auto";
        input.style.height = Math.max(56, Math.min(input.scrollHeight, 160)) + "px";
        _questionEnAttente = "";
      }
      setTimeout(() => input.focus(), 60);
    }
  }

  /* ---------- Purge stricte de la clé en mémoire vive ---------- */
  function iaPurgerCle() {
    _cleApi = "";
    _historique = [];
    _questionEnAttente = "";
    iaCacherMenuContextuel();

    const inputKey = document.getElementById("iaKeyInput");
    if (inputKey) inputKey.value = "";

    const inputChat = document.getElementById("iaInput");
    if (inputChat) inputChat.value = "";

    const errBanner = document.getElementById("iaErrorBanner");
    if (errBanner) errBanner.hidden = true;

    afficherEcranCle();
    rendreMessages();

    const btn = document.getElementById("bIaAssistant");
    if (btn) btn.classList.remove("on");
  }

  /* ---------- Détection de commande locale d'aide & Manuel Intégré ---------- */
  function estCommandeAide(txt) {
    if (!txt) return false;
    const s = txt.trim().toLowerCase();
    return s === "help" || s === "/help" || s === "aide" || s === "/aide" || s === "?" || s === "man" || s === "manuel";
  }

  function genererManuelLocal() {
    return (
      "### 📖 Manuel du Système CAO & Assistant Technique\n\n" +
      "*(Manuel officiel généré instantanément en local par l'application — 0 jeton API consommé)*\n\n" +
      "---\n\n" +
      "### 1. ⚡ Actions Interactives & Dimensionnements Automatiques\n" +
      "L'assistant IA ne se contente pas de fournir des formules : il génère des **boutons d'action cliquables** directement dans la discussion pour injecter ses calculs dans votre projet !\n" +
      "- **Éditeur Schématique — Calculs et injection en 1 clic** :\n" +
      "  - **Oscillateurs & Timers NE555** : Demandez par exemple *« Calcule les composants pour un NE555 astable à 1 kHz avec 60% de rapport cyclique »*. L'IA calcule les résistances et condensateur dans la série normalisée E24 ($R_1, R_2, C_1$) et propose un bouton `[⚡ Appliquer au schéma]` qui met automatiquement à jour les composants correspondants.\n" +
      "  - **Ponts diviseurs de tension** : Calcul de $R_1$ et $R_2$ selon vos tensions $V_{in}, V_{out}$ et tolérances avec bouton d'injection directe.\n" +
      "  - **Filtres RC passifs & actifs** : Calcul de la fréquence de coupure $f_c$ et dimensionnement de $R$ et $C$.\n" +
      "  - **Résistances de limitation LED** : Calcul de la résistance série selon $V_{cc}, V_f, I_f$.\n" +
      "  - *Sécurité annulation* : Chaque modification appliquée s'enregistre dans l'historique d'annulation (**Ctrl+Z** pris en charge).\n" +
      "- **Éditeur PCB — Largeurs de pistes selon IPC-2152** :\n" +
      "  - Calcul de la largeur de cuivre requise pour un courant donné (A), un échauffement ($\Delta T$ en °C) et une épaisseur de cuivre (35 µm / 70 µm).\n" +
      "  - Propose un bouton `[⚡ Appliquer au PCB]` qui modifie instantanément la largeur des pistes sélectionnées ou du net actif.\n\n" +
      "---\n\n" +
      "### 2. 🖱️ Inspection Contextuelle par Clic Droit\n" +
      "Faites un **clic droit** sur l'espace de travail pour lancer un diagnostic assisté par l'IA :\n" +
      "- **Éditeur PCB** :\n" +
      "  - **Bus de pistes / Paires différentielles** : Sélectionnez plusieurs pistes ou un net → Clic droit → **« 📐 Analyser le bus de pistes ✨ »**.\n" +
      "    *Extrait en JSON les longueurs réelles de chaque piste (mm), le décalage max (skew), l'espacement moyen (règle des 3W / crosstalk) et le nombre de vias.*\n" +
      "  - **Empreintes & Composants** : Clic droit sur des composants pour vérifier les boîtiers et le placement thermique.\n" +
      "- **Éditeur Schématique** :\n" +
      "  - **Sélection de composants et liaisons** : Clic droit → **« 🔍 Vérifier la sélection schéma ✨ »**.\n" +
      "    *Analyse la cohérence du schéma, les tirages pull-up/pull-down et les découplages manquants.*\n" +
      "- **Visionneuse IPC-2581** :\n" +
      "  - **Nets ou composants industriels** : Clic droit → **« 📐 Analyser le net cuivre IPC ✨ »**.\n" +
      "    *Audit selon les critères de fabrication industrielle IPC (continuité, impédance, vias, calques).*\n\n" +
      "---\n\n" +
      "### 3. ⌨️ Commandes Locales & Raccourcis Clavier\n" +
      "- **`help`** ou **`aide`** : Affiche ce manuel exhaustif (local, 0 requête réseau, 0 jeton).\n" +
      "- **`clear`** ou **`effacer`** : Réinitialise et vide la conversation active.\n" +
      "- **`Alt + I`** : Raccourci clavier global pour afficher ou masquer rapidement le volet IA.\n" +
      "- **`Échap`** : Ferme le volet IA lorsque le curseur est dans la zone de texte.\n" +
      "- **`Entrée`** : Envoyer la question technique.\n" +
      "- **`Maj + Entrée`** : Saut de ligne dans le champ de saisie.\n\n" +
      "---\n\n" +
      "### 4. 🔒 Sécurité & Clé API Éphémère en RAM\n" +
      "- **Zéro stockage persistant** : Votre clé API Google AI Studio n'est conservée que dans une variable en mémoire vive (RAM).\n" +
      "- **Purge automatique** : Dès la fermeture du volet IA (bouton ✕, Alt+I, Échap ou bouton *« Oublier clé »*), la clé est immédiatement effacée de la mémoire.\n" +
      "- **Confidentialité** : Seul le résumé de la sélection courante est transmis si l'option *« Contexte projet »* est cochée."
    );
  }

  /* ---------- Encodage / Décodage Base64 UTF-8 Sécurisé ---------- */
  function encoderBase64Utf8(str) {
    try {
      return btoa(Array.from(new TextEncoder().encode(str), b => String.fromCharCode(b)).join(""));
    } catch (_) {
      return "";
    }
  }

  function decoderBase64Utf8(b64) {
    try {
      return new TextDecoder().decode(Uint8Array.from(atob(b64), c => c.charCodeAt(0)));
    } catch (_) {
      return "";
    }
  }

  /* ---------- Exécution d'une Action Interactive (Schéma ou PCB) ---------- */
  function iaExecuterAction(btn, b64) {
    try {
      const jsonStr = decoderBase64Utf8(b64);
      if (!jsonStr) throw new Error("Données d'action corrompues.");
      const act = JSON.parse(jsonStr);
      const outil = detecterOutil();

      // 1. Schématique : mise à jour des valeurs de composants
      if (act.type === "schema_values" || act.values) {
        if (typeof S === "undefined" || !S || !Array.isArray(S.comps)) {
          if (typeof alert === "function") alert("L'éditeur schématique n'est pas actif ou aucun schéma n'est ouvert.");
          return;
        }

        if (typeof push === "function") push();

        let nbModifs = 0;
        const vals = act.values || {};
        const entries = Object.entries(vals);

        entries.forEach(([refCible, val]) => {
          const strVal = String(val).trim();
          // Recherche par référence exacte (insensible à la casse, ex: R1, C1)
          let comp = S.comps.find(c => (c.ref || "").trim().toUpperCase() === refCible.toUpperCase());

          // Si non trouvé par référence exacte et qu'il y a des composants sélectionnés
          if (!comp && S.sel && S.sel.size > 0) {
            const selComps = S.comps.filter(c => S.sel.has(c.id));
            comp = selComps.find(c => (c.ref || "").toUpperCase().startsWith(refCible.slice(0, 1).toUpperCase()));
          }

          if (comp) {
            const def = (typeof defOf === "function") ? defOf(comp.type) : null;
            if (def && typeof def.pins === "function" && typeof reshapeComp === "function") {
              reshapeComp(comp, () => { comp.value = strVal; });
            } else {
              comp.value = strVal;
            }
            nbModifs++;
          }
        });

        if (typeof buildList === "function") buildList();
        if (typeof refreshPanels === "function") refreshPanels();
        if (typeof draw === "function") draw();
        if (typeof clipHint === "function") {
          clipHint(nbModifs > 0 ? (nbModifs + " composant(s) mis à jour par l'IA.") : "Aucun composant correspondant trouvé.");
        }

        if (btn) {
          btn.disabled = true;
          btn.classList.add("done");
          btn.textContent = "✓ " + nbModifs + " composant(s) mis à jour !";
        }
        return;
      }

      // 2. PCB : réglage de la largeur des pistes
      if (act.type === "pcb_track_width" || act.width) {
        if (typeof S === "undefined" || !S || !Array.isArray(S.tracks)) {
          if (typeof alert === "function") alert("L'éditeur PCB n'est pas actif ou aucun circuit n'est chargé.");
          return;
        }

        const nouvelleLargeur = Math.max(0.05, parseFloat(act.width) || 0.25);
        if (typeof push === "function") push();

        let nbPistes = 0;
        // Priorité 1 : pistes sélectionnées
        if (S.sel && S.sel.tracks && S.sel.tracks.size > 0) {
          S.sel.tracks.forEach(t => {
            t.w = nouvelleLargeur;
            nbPistes++;
          });
        }
        // Priorité 2 : net actif / surligné / ciblé
        else if (act.net || S.hlNet) {
          const netCible = act.net || S.hlNet;
          S.tracks.forEach(t => {
            if (t.net === netCible) {
              t.w = nouvelleLargeur;
              nbPistes++;
            }
          });
        }
        // Priorité 3 : confirmation pour toutes les pistes
        else if (S.tracks.length > 0) {
          const okConf = typeof confirm === "function" ? confirm("Aucune piste n'est sélectionnée. Appliquer la largeur de " + nouvelleLargeur + " mm aux 10 premières pistes ?") : true;
          if (okConf) {
            S.tracks.slice(0, 10).forEach(t => { t.w = nouvelleLargeur; nbPistes++; });
          }
        }

        if (typeof touch === "function") touch();
        if (typeof zoneCache !== "undefined" && zoneCache && zoneCache.clear) zoneCache.clear();
        if (typeof refreshPanels === "function") refreshPanels();
        if (typeof draw === "function") draw();
        if (typeof hint === "function") {
          hint(nbPistes + " piste(s) ajustée(s) à " + nouvelleLargeur + " mm.");
        }

        if (btn) {
          btn.disabled = true;
          btn.classList.add("done");
          btn.textContent = "✓ Largeur " + nouvelleLargeur + " mm appliquée (" + nbPistes + " pistes) !";
        }
        return;
      }

      if (typeof alert === "function") alert("Action non reconnue : " + (act.type || "type inconnu"));
    } catch (err) {
      console.error("Erreur lors de l'exécution de l'action IA :", err);
      if (typeof alert === "function") alert("Erreur d'application : " + err.message);
    }
  };

  /* ---------- Markdown Parser Léger et Sécurisé ---------- */
  function echapperHtml(s) {
    return String(s).replace(/[&<>"']/g, ch => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[ch]));
  }

  function formaterMarkdown(texte) {
    if (!texte) return "";
    
    // Extraction des blocs de code ```lang ... ``` et des blocs ```action ... ```
    const codeBlocks = [];
    let txt = texte.replace(/```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g, function(_, lang, code) {
      const idx = codeBlocks.length;
      const langLower = (lang || "").toLowerCase();

      // Interception des blocs d'action interactive
      if (langLower === "action") {
        try {
          const act = JSON.parse(code.trim());
          const b64 = encoderBase64Utf8(JSON.stringify(act));

          let titre = "Action CAO disponible";
          let sousTitre = act.label || "";
          let btnLabel = "⚡ Appliquer";

          if (act.type === "schema_values" || act.values) {
            titre = "⚡ Valeurs de schéma calculées";
            const refs = Object.entries(act.values || {}).map(([r, v]) => r + " = " + v).join(", ");
            if (!sousTitre) sousTitre = refs;
            btnLabel = "⚡ Appliquer au schéma";
          } else if (act.type === "pcb_track_width" || act.width) {
            titre = "⚡ Largeur de piste PCB calculée";
            if (!sousTitre) sousTitre = "Largeur : " + act.width + " mm";
            btnLabel = "⚡ Appliquer au PCB";
          }

          const card = 
            '<div class="ia-action-card">' +
              '<div class="ia-action-head">' +
                '<span class="ia-action-icon">⚡</span>' +
                '<span class="ia-action-title">' + echapperHtml(titre) + '</span>' +
              '</div>' +
              (sousTitre ? ('<div class="ia-action-desc">' + echapperHtml(sousTitre) + '</div>') : '') +
              '<div class="ia-action-footer">' +
                '<button type="button" class="ia-btn-action" onclick="iaExecuterAction(this, \'' + b64 + '\')">' +
                  echapperHtml(btnLabel) +
                '</button>' +
              '</div>' +
            '</div>';

          codeBlocks.push(card);
          return "%%CODEBLOCK_" + idx + "%%";
        } catch (e) {
          console.warn("Échec parsing action JSON :", e);
        }
      }

      const langLabel = lang || "code";
      const codeHtml = echapperHtml(code.trim());
      codeBlocks.push(
        '<div class="ia-code-wrap">' +
          '<div class="ia-code-head">' +
            '<span>' + echapperHtml(langLabel) + '</span>' +
            '<button type="button" class="ia-btn-copy" onclick="iaCopierCode(this)">Copier</button>' +
          '</div>' +
          '<pre class="ia-code-block"><code>' + codeHtml + '</code></pre>' +
        '</div>'
      );
      return "%%CODEBLOCK_" + idx + "%%";
    });

    // Formatage texte standard
    const lignes = txt.split("\n");
    let out = [];
    let inList = false;

    for (let i = 0; i < lignes.length; i++) {
      let l = lignes[i];

      // Blocs de code réservés
      if (l.includes("%%CODEBLOCK_")) {
        if (inList) { out.push("</ul>"); inList = false; }
        out.push(l);
        continue;
      }

      // Titres
      if (l.startsWith("### ")) {
        if (inList) { out.push("</ul>"); inList = false; }
        out.push("<b>" + echapperHtml(l.slice(4)) + "</b><br>");
        continue;
      }
      if (l.startsWith("## ")) {
        if (inList) { out.push("</ul>"); inList = false; }
        out.push("<b style='color:var(--yellow, #f2c744);font-size:1.1em;'>" + echapperHtml(l.slice(3)) + "</b><br>");
        continue;
      }

      // Puces de listes
      const mList = l.match(/^(\s*)[-*+]\s+(.*)$/);
      if (mList) {
        if (!inList) { out.push("<ul>"); inList = true; }
        let item = mList[2];
        item = echapperHtml(item)
          .replace(/\*\*(.*?)\*\*/g, "<b>$1</b>")
          .replace(/`([^`]+)`/g, "<code>$1</code>");
        out.push("<li>" + item + "</li>");
        continue;
      } else if (inList) {
        out.push("</ul>");
        inList = false;
      }

      // Ligne vide
      if (!l.trim()) {
        out.push("<br>");
        continue;
      }

      // Paragraphe classique
      let formatté = echapperHtml(l)
        .replace(/\*\*(.*?)\*\*/g, "<b>$1</b>")
        .replace(/\*(.*?)\*/g, "<em>$1</em>")
        .replace(/`([^`]+)`/g, "<code>$1</code>");
      out.push("<p>" + formatté + "</p>");
    }
    if (inList) out.push("</ul>");

    let finalHtml = out.join("");
    // Réinsertion des blocs de code
    codeBlocks.forEach((bloc, idx) => {
      finalHtml = finalHtml.replace("%%CODEBLOCK_" + idx + "%%", bloc);
    });

    return finalHtml;
  }

  /* ---------- Copie du code au presse-papier ---------- */
  window.iaCopierCode = function(btn) {
    const pre = btn.closest(".ia-code-wrap").querySelector("code");
    if (!pre) return;
    navigator.clipboard.writeText(pre.textContent).then(() => {
      const orig = btn.textContent;
      btn.textContent = "✓ Copié !";
      btn.style.color = "#44cf6c";
      setTimeout(() => {
        btn.textContent = orig;
        btn.style.color = "";
      }, 1500);
    }).catch(err => {
      console.warn("Échec de copie :", err);
    });
  };

  /* ---------- Rendu de l'historique ---------- */
  function rendreMessages() {
    const cont = document.getElementById("iaMessages");
    if (!cont) return;

    cont.innerHTML = "";

    // Message d'accueil si vide
    if (_historique.length === 0) {
      const outil = detecterOutil();
      const chips = SUGGESTIONS[outil] || SUGGESTIONS.schema;

      const welcome = document.createElement("div");
      welcome.className = "ia-msg model";
      welcome.innerHTML = 
        '<span class="ia-msg-role">Gemma 4 31B</span>' +
        '<div class="ia-msg-bubble">' +
          '<p>Bonjour ! Je suis votre assistant technique spécialisé en CAO électronique, dimensionnement, schématique, routage PCB et formats de fabrication.</p>' +
          '<p>Que souhaitez-vous concevoir ou vérifier aujourd\'hui ?</p>' +
          '<div class="ia-chips-wrap">' +
            '<div class="ia-chips-title">Questions fréquentes & manuel en 1 clic :</div>' +
            '<div class="ia-chips-grid">' +
              '<button type="button" class="ia-chip ia-chip-help" onclick="iaPoserQuestionRapide(this)" title="Affiche le manuel complet localement (0 jeton)">📖 Manuel & Capacités (help)</button>' +
              chips.map(c => '<button type="button" class="ia-chip" onclick="iaPoserQuestionRapide(this)">' + echapperHtml(c) + '</button>').join("") +
            '</div>' +
          '</div>' +
        '</div>';
      cont.appendChild(welcome);
      return;
    }

    // Affichage des messages
    _historique.forEach(m => {
      const d = document.createElement("div");
      d.className = "ia-msg " + m.role + (m.localManual ? " local-tool" : "");
      let roleLabel = m.role === "user" ? "Vous" : "Gemma 4 31B";
      if (m.localManual) {
        roleLabel = "🛠️ Guide du Système CAO (Réponse locale de l'outil)";
      }
      const texte = (m.parts && m.parts[0] && m.parts[0].text) ? m.parts[0].text : "";
      d.innerHTML = 
        '<span class="ia-msg-role' + (m.localManual ? " local-tool" : "") + '">' + roleLabel + '</span>' +
        '<div class="ia-msg-bubble' + (m.localManual ? " ia-manual-bubble" : "") + '">' + formaterMarkdown(texte) + '</div>';
      cont.appendChild(d);
    });

    if (_enAttente) {
      const loading = document.createElement("div");
      loading.className = "ia-loading-bubble";
      loading.innerHTML = 
        '<div class="ia-dots"><span class="ia-dot"></span><span class="ia-dot"></span><span class="ia-dot"></span></div>' +
        '<span>Gemma 4 analyse votre question technique...</span>';
      cont.appendChild(loading);
    }

    cont.scrollTop = cont.scrollHeight;
  }

  /* ---------- Poser une question rapide ---------- */
  window.iaPoserQuestionRapide = function(btn) {
    let q = btn.textContent.trim();
    if (q.includes("(help)")) q = "help";
    const input = document.getElementById("iaInput");
    if (input) {
      input.value = q;
      envoyerMessage();
    }
  };

  /* ---------- Détection et nettoyage des monologues / réflexions en anglais ---------- */
  function scoreFrancais(texte) {
    if (!texte) return 0;
    const propre = texte.replace(/^[#*>`_\s\-+0-9.)]+/, "");
    const mots = propre.toLowerCase().match(/[a-zà-ÿ]+/g) || [];
    if (mots.length === 0) return 0;
    
    const motsFr = new Set([
      "le", "la", "les", "un", "une", "des", "du", "de", "d", "ce", "cette", "ces", "cet",
      "dans", "sur", "pour", "avec", "sans", "par", "est", "sont", "qui", "que", "au", "aux",
      "schéma", "circuit", "montage", "composant", "composants", "résistance", "broche", "broches",
      "tension", "courant", "voie", "couche", "piste", "masse", "alimentation", "voici", "bonjour",
      "il", "elle", "nous", "vous", "ils", "elles", "on", "se", "sa", "son", "ses", "leur", "leurs",
      "étage", "signal", "entrée", "sortie", "fonctionnement", "commande", "calcul", "valeur", "valeurs",
      "description", "générale", "analyse", "utilisation", "permet", "utilise", "linéaire", "régulation"
    ]);
    
    let nbFr = 0;
    for (const m of mots) {
      if (motsFr.has(m) || /[éèêëàâîïôùûç]/.test(m)) {
        nbFr++;
      }
    }
    return nbFr / mots.length;
  }

  function nettoyerReponseGemma(texte) {
    if (!texte) return "";
    let s = texte.trim();

    // 1. Enlever les balises explicites <thought>...</thought> ou <thinking>...</thinking>
    s = s.replace(/<(?:thought|thinking)>[\s\S]*?<\/(?:thought|thinking)>/gi, "").trim();

    // 2. Décoller la fin d'une phrase anglaise du début d'une phrase française collée
    // Ex: "...Analyze the logic levels.Ce schéma..." -> "...Analyze the logic levels.\n\nCe schéma..."
    // On protège d'abord les blocs de code (```...```) pour ne jamais altérer du code JS ou du JSON d'actions
    const blocsCode = [];
    s = s.replace(/```[\s\S]*?```/g, m => {
      blocsCode.push(m);
      return `___BLOC_CODE_${blocsCode.length - 1}___`;
    });

    // Décollage uniquement si précédé d'au moins 2 lettres minuscules (mot complet),
    // évitant ainsi d'altérer les identifiants ou propriétés JS (ex: S.Comps, U1.In, datasheet.Pdf)
    s = s.replace(/([a-zà-ÿ]{2,}[.!?])([A-ZÀ-Ÿ][a-zà-ÿ]+)/g, "$1\n\n$2");

    // Restauration des blocs de code
    if (blocsCode.length) {
      s = s.replace(/___BLOC_CODE_(\d+)___/g, (_, idx) => blocsCode[+idx] || "");
    }

    // 3. Détecter si le premier paragraphe est déjà du français clair et légitime
    const premierBloc = (s.split("\n")[0] || "").replace(/^[#*>`_\s\-+0-9.)]+/, "").trim();
    if (scoreFrancais(premierBloc) >= 0.35 && !/^(?:Role|Constraint|Context|Task|Thinking|Elite|Senior|Components|Netlist)\b/i.test(premierBloc)) {
      return s;
    }

    // 4. Si amorce de monologue / scratchpad en anglais (Role:, Context:, Q3 is..., Direct, etc.)
    const paragraphes = s.split(/\n+/);
    let indexDebutFr = -1;

    for (let i = 0; i < paragraphes.length; i++) {
      const p = paragraphes[i].trim();
      if (!p) continue;
      const pNet = p.replace(/^[#*>`_\s\-+0-9.)]+/, "").trim();
      
      // Accroches françaises caractéristiques
      if (/^(?:Ce schéma|Le schéma|Ce circuit|Le circuit|Ce montage|Le montage|Cet étage|Il s'agit|Voici|Bonjour|Dans ce|Pour |L'étage|L'analyse|Cette carte|Le routage|Description|Analyse|Ce système)/i.test(pNet)) {
        indexDebutFr = i;
        break;
      }

      // Ou paragraphe à nette dominante française
      if (scoreFrancais(pNet) >= 0.28 && !/^(?:Role|Constraint|Context|Task|Thinking|Direct|Explain|Verify|Describe|Detail|Analyze|Components|Netlist)\b/i.test(pNet)) {
        indexDebutFr = i;
        break;
      }
    }

    if (indexDebutFr > 0) {
      return paragraphes.slice(indexDebutFr).join("\n\n").trim();
    }

    return s;
  }

  /* ---------- Envoi à l'API Google AI Studio ---------- */
  async function envoyerMessage() {
    if (_enAttente) return;
    const input = document.getElementById("iaInput");
    const q = (input ? input.value : "").trim();
    if (!q) return;

    // 1. Interception de la commande locale help / aide (100% exécutée par l'outil, sans appel IA, sans clé requise)
    if (estCommandeAide(q)) {
      input.value = "";
      input.style.height = "";
      _historique.push({
        role: "user",
        parts: [{ text: q }]
      });
      _historique.push({
        role: "model",
        localManual: true,
        parts: [{ text: genererManuelLocal() }]
      });
      rendreMessages();
      return;
    }

    // 2. Interception de la commande locale clear / effacer
    if (q.toLowerCase() === "clear" || q.toLowerCase() === "effacer") {
      input.value = "";
      input.style.height = "";
      _historique = [];
      rendreMessages();
      return;
    }

    // 3. Contrôle de la clé API pour les questions nécessitant l'IA distante
    if (!_cleApi) {
      _questionEnAttente = q;
      afficherEcranCle();
      const inputKey = document.getElementById("iaKeyInput");
      if (inputKey) {
        inputKey.focus();
        inputKey.style.borderColor = "var(--yellow, #f2c744)";
        setTimeout(() => inputKey.style.borderColor = "", 1500);
      }
      return;
    }

    input.value = "";
    input.style.height = "";

    // Ajout du message utilisateur
    _historique.push({
      role: "user",
      parts: [{ text: q }]
    });

    _enAttente = true;
    rendreMessages();

    // Masquer bannière d'erreur précédente
    const errBanner = document.getElementById("iaErrorBanner");
    if (errBanner) errBanner.hidden = true;

    // Construction du prompt et contexte
    let promptSysteme = 
      "Tu es l'ingénieur électronicien d'élite de la suite Web CAO (Éditeur Schématique, Éditeur PCB, Visionneuse industrielle IPC-2581).\n" +
      "EXIGENCE ABSOLUE ET STRICTE : Tu réponds EXCLUSIVEMENT EN FRANÇAIS. Ne produis AUCUN mot, AUCUN méta-commentaire, AUCUN plan en anglais (bannis tout 'Role:', 'Constraint:', 'Task:', 'Context:', 'Components:', 'Netlist:'). Commence immédiatement par ta réponse technique en français avec clarté, concision et rigueur.\n\n" +
      "ACTIONS INTERACTIVES SUR LE PROJET :\n" +
      "Lorsque tu calcules ou préconises des valeurs numériques concrètes pour des composants de schéma (ex: R1, R2, C1 dans un montage NE555, un filtre RC, un pont diviseur de tension, etc.) ou une largeur de piste PCB (norme IPC-2152 selon courant et échauffement), AJOUTE TOUJOURS à la fin de ton explication un bloc d'action exécutable au format JSON strict balisé avec ```action :\n" +
      "Pour le schéma :\n" +
      "```action\n{\"type\":\"schema_values\",\"label\":\"Appliquer les valeurs calculées au schéma\",\"values\":{\"R1\":\"10k\",\"R2\":\"47k\",\"C1\":\"100nF\"}}\n```\n" +
      "Pour le PCB :\n" +
      "```action\n{\"type\":\"pcb_track_width\",\"label\":\"Appliquer la largeur de piste (0.65 mm)\",\"width\":0.65}\n```\n" +
      "L'outil Web CAO transformera ce bloc en un bouton interactif cliquable permettant à l'utilisateur d'appliquer directement tes calculs dans son projet.";

    let contexteProjetTexte = "";
    if (_inclureContexte) {
      const ctx = extraireContexteCao();
      contexteProjetTexte = "DONNÉES DU PROJET EN COURS DANS L'ÉDITEUR :\n" + ctx;
    }

    // Préparation de la requête Google AI Studio
    const url = "https://generativelanguage.googleapis.com/v1beta/models/" + encodeURIComponent(_modele) + ":generateContent?key=" + encodeURIComponent(_cleApi);

    const estGemma = _modele.includes("gemma");
    const contents = [];

    if (estGemma) {
      // Pour Gemma (qui ne supporte pas systemInstruction en API), on amorce la session avec un tour de rôle explicite en français
      contents.push({
        role: "user",
        parts: [{
          text: 
            "[DIRECTIVE ABSOLUE DU SYSTÈME CAO]\n" +
            "Tu es l'ingénieur électronicien d'élite de la suite Web CAO (Schématique, PCB, IPC-2581).\n" +
            "RÈGLE IMPÉRATIVE NON NÉGOCIABLE : Tu t'exprimes et réponds EXCLUSIVEMENT EN FRANÇAIS. Il est strictement interdit d'écrire le moindre mot, résumé, plan ou raisonnement en anglais. Ne génère aucun en-tête en anglais (aucun 'Role:', 'Constraint:', 'Task:', 'Components:', 'Netlist:'). Démarre immédiatement par ton explication technique en français.\n\n" +
            "ACTIONS INTERACTIVES :\n" +
            "Pour tout calcul de composants ou piste, termine par un bloc JSON balisé ```action (ex: schema_values ou pcb_track_width)."
        }]
      });
      contents.push({
        role: "model",
        parts: [{
          text: "Bien reçu. Je réponds exclusivement en langue française, avec rigueur et clarté technique, directement et sans aucun préambule ou méta-commentaire en anglais. Je suis prêt à analyser vos schémas et projets CAO."
        }]
      });

      const messagesPourApi = _historique.filter(m => !m.localManual);
      messagesPourApi.forEach((m, idx) => {
        let txtMsg = (m.parts && m.parts[0] && m.parts[0].text) ? m.parts[0].text : "";
        if (idx === 0 && contexteProjetTexte) {
          txtMsg = contexteProjetTexte + "\n\n" + txtMsg;
        }
        contents.push({
          role: m.role,
          parts: [{ text: txtMsg }]
        });
      });
    } else {
      const messagesPourApi = _historique.filter(m => !m.localManual);
      messagesPourApi.forEach((m, idx) => {
        let txtMsg = (m.parts && m.parts[0] && m.parts[0].text) ? m.parts[0].text : "";
        if (idx === 0 && contexteProjetTexte) {
          txtMsg = contexteProjetTexte + "\n\n" + txtMsg;
        }
        contents.push({
          role: m.role,
          parts: [{ text: txtMsg }]
        });
      });
    }

    const corps = {
      contents: contents,
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 4096
      }
    };

    if (!estGemma) {
      corps.systemInstruction = {
        parts: [{ text: promptSysteme }]
      };
    }

    try {
      let rep = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(corps)
      });

      // Secours de repli si refusé (anciens modèles sans systemInstruction)
      if (rep.status === 400 && !estGemma) {
        const altContents = JSON.parse(JSON.stringify(contents));
        if (altContents.length > 0 && altContents[0].role === "user") {
          altContents[0].parts[0].text = promptSysteme + "\n\n" + altContents[0].parts[0].text;
        }
        rep = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: altContents,
            generationConfig: { temperature: 0.2, maxOutputTokens: 4096 }
          })
        });
      }

      if (!rep.ok) {
        let errJson = {};
        try { errJson = await rep.json(); } catch (ignored) {}
        const msgErr = (errJson.error && errJson.error.message) ? errJson.error.message : ("Erreur HTTP " + rep.status);
        throw new Error(msgErr);
      }

      const donnees = await rep.json();
      let texteReponse = "";
      if (donnees.candidates && donnees.candidates[0] && donnees.candidates[0].content && donnees.candidates[0].content.parts) {
        // Filtrer les parties de pensée interne (thought: true) si renvoyées par l'API
        let partsUtiles = donnees.candidates[0].content.parts.filter(p => !p.thought);
        if (partsUtiles.length === 0) partsUtiles = donnees.candidates[0].content.parts;
        texteReponse = partsUtiles.map(p => p.text || "").join("");
      }

      if (!texteReponse) {
        texteReponse = "*(Aucune réponse textuelle reçue du modèle)*";
      }

      // Nettoyage rigoureux : suppression de toute réflexion préliminaire ou monologue en anglais
      texteReponse = nettoyerReponseGemma(texteReponse);

      _historique.push({
        role: "model",
        parts: [{ text: texteReponse }]
      });

    } catch (e) {
      // Retirer le message utilisateur non acquitté en cas d'échec pour préserver l'alternance stricte user/model
      if (_historique.length > 0 && _historique[_historique.length - 1].role === "user") {
        _historique.pop();
      }
      console.error("Erreur appel Gemma 4 / Google AI Studio :", e);
      if (errBanner) {
        const errTxt = document.getElementById("iaErrorText");
        if (errTxt) {
          if (String(e.message).includes("API_KEY_INVALID") || String(e.message).includes("API key not valid")) {
            errTxt.textContent = "Clé API Google AI Studio invalide. Vérifiez votre clé ou générez-en une nouvelle.";
          } else {
            errTxt.textContent = "Erreur IA : " + e.message;
          }
        }
        errBanner.hidden = false;
      }
    } finally {
      _enAttente = false;
      rendreMessages();
    }
  }

  /* =============================================================================
     Fonctions Publiques d'Ouverture et Fermeture
     ============================================================================= */

  /**
   * Ouvre la section IA dans l'espace de travail.
   * Si la clé API n'a pas été saisie pour cette ouverture, la redemande.
   */
  window.iaOuvrir = function() {
    construireDom();
    if (typeof wsShow === "function") {
      wsShow("ia");
      // Déplier si replié
      if (typeof WS !== "undefined" && WS.panels && WS.panels.ia && WS.panels.ia.collapsed) {
        if (typeof wsToggleCollapse === "function") wsToggleCollapse("ia");
      }
    }

    const btn = document.getElementById("bIaAssistant");
    if (btn) btn.classList.add("on");

    if (!_cleApi) {
      afficherEcranCle();
    } else {
      basculerVersChat();
    }
  };

  /**
   * Ferme la section IA de l'espace de travail.
   * EXIGENCE STRICTE : la clé API est immédiatement effacée de la mémoire vive (_cleApi = ""),
   * ainsi que les champs de saisie, garantissant qu'elle sera redemandée à la prochaine ouverture.
   */
  window.iaFermer = function() {
    iaPurgerCle();
    if (typeof wsClose === "function") {
      wsClose("ia");
    }
    const btn = document.getElementById("bIaAssistant");
    if (btn) btn.classList.remove("on");
  };

  /* Exposition des fonctions pour les menus contextuels des outils */
  window.iaAfficherMenuContextuel = iaAfficherMenuContextuel;
  window.iaCacherMenuContextuel = iaCacherMenuContextuel;
  window.iaLancerAnalyseSelection = iaLancerAnalyseSelection;
  window.iaPurgerCle = iaPurgerCle;
  window.iaExecuterAction = iaExecuterAction;

  /* ---------- Liaison automatique au chargement ---------- */
  function initialiserLiaisons() {
    construireDom();

    // Interception de wsClose pour garantir la purge dès que la section est fermée
    if (typeof window.wsClose === "function") {
      const _prevWsClose = window.wsClose;
      window.wsClose = function(id) {
        if (id === "ia") {
          iaPurgerCle();
        }
        return _prevWsClose.apply(this, arguments);
      };
    }

    // Synchronisation avec wsApply
    if (typeof window.wsApply === "function") {
      const _prevWsApply = window.wsApply;
      window.wsApply = function() {
        const res = _prevWsApply.apply(this, arguments);
        const btn = document.getElementById("bIaAssistant");
        if (btn && typeof wsPlaceOf === "function") {
          const ouvert = wsPlaceOf("ia") !== "hidden";
          btn.classList.toggle("on", ouvert);
          if (!ouvert && _cleApi) {
            iaPurgerCle();
          }
        }
        return res;
      };
    }

    const btn = document.getElementById("bIaAssistant");
    if (btn) {
      btn.classList.add("tb-ia");
      btn.onclick = function(e) {
        e.preventDefault();
        if (typeof wsPlaceOf === "function" && wsPlaceOf("ia") !== "hidden") {
          iaFermer();
        } else {
          iaOuvrir();
        }
      };
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initialiserLiaisons);
  } else {
    initialiserLiaisons();
  }

})();
