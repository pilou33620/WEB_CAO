/* =============================================================================
   commun/ia-assistant.js
   Assistant IA Technique — Google AI Studio
   Modèles : Gemma 4 31B (défaut), Gemini 3.8 Flash, Gemini 3.8 Flash (Thinking)
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
  let _modele = "gemma-4-31b-it"; // Choix du sélecteur : voir MODELES ci-dessous.

  /* ---------------------------------------------------------------------------
     Les trois entrées du sélecteur, et ce qu'elles valent réellement à l'appel.

     « Gemini 3.8 Flash » et « Gemini 3.8 Flash (Thinking) » visent le MÊME
     modèle côté Google : ce qui les sépare est le budget de réflexion interne.
     Le premier répond vite (thinkingLevel « low »), le second prend le temps de
     raisonner (« high ») — d'où deux entrées de menu pour un seul endpoint.

     La température n'est pas la même partout : 0,2 convient aux Gemini, qui
     doivent rester factuels, mais Gemma 4 31B est calibré pour 0,7 et devient
     laconique — voire répétitif — en dessous.
     --------------------------------------------------------------------------- */
  const MODELES = {
    "gemma-4-31b-it": {
      nom: "Gemma 4 31B",
      endpoint: "gemma-4-31b-it",
      thinkingLevel: null,
      temperature: 0.7
    },
    "gemini-3.8-flash": {
      nom: "Gemini 3.8 Flash",
      endpoint: "gemini-3.8-flash",
      thinkingLevel: "low",
      temperature: 0.2
    },
    "gemini-3.8-flash-thinking": {
      nom: "Gemini 3.8 Flash (Thinking)",
      endpoint: "gemini-3.8-flash",
      thinkingLevel: "high",
      temperature: 0.2
    }
  };

  function confModele(modele) {
    return MODELES[modele] || {
      nom: modele || "Assistant IA",
      endpoint: modele,
      thinkingLevel: null,
      temperature: 0.2
    };
  }

  function getNomModele(modele) {
    return confModele(modele).nom;
  }
  let _historique = [];         // Messages de la session en cours
  let _enAttente = false;       // Requête en cours
  let _etape = "";              // Ce que l'assistant consulte pendant l'attente (outils de lecture)
  let _inclureContexte = true;  // Transmettre l'état CAO courant
  let _domConstruit = false;
  let _questionEnAttente = "";  // Question préparée depuis le menu contextuel
  /* Les pièces jointes du PROCHAIN message ({nom, mime, data (base64), taille}).
     Une fois envoyées, elles vivent dans le message de l'historique qui les
     porte : l'API n'a pas de mémoire, une question de suivi sur la même
     datasheet doit la renvoyer. */
  let _pieces = [];

  /* La limite d'une requête Google AI Studio est de 20 Mo, base64 compris
     (+33 %) : 14 Mo de fichier laissent la place au texte et à l'historique. */
  const PIECE_TAILLE_MAX = 14 * 1024 * 1024;
  const PIECE_TYPES = ["application/pdf", "image/png", "image/jpeg", "image/webp"];

  /* ---------- Détection de l'outil courant ---------- */
  function detecterOutil() {
    const p = (typeof window !== "undefined" && window.location && window.location.pathname) ? window.location.pathname.toLowerCase() : "";
    if (p.includes("pcb") || (typeof S !== "undefined" && S && (Array.isArray(S.fps) || Array.isArray(S.fp)))) return "pcb";
    if (p.includes("ipc") || (typeof V !== "undefined" && V && typeof V.modele !== "undefined")) return "ipc2581";
    return "schema";
  }

  /* ---------- Extraction du contexte CAO Détaillé (Composants & Netlist) ---------- */
  function extraireContexteCao() {
    const outil = detecterOutil();
    const resume = [];

    try {
      const projet = (typeof projNom === "function") ? projNom() : "";
      resume.push(projet ? ("Projet ouvert : « " + projet + " ».") : "Aucun projet ouvert.");

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
        /* LE RÉSUMÉ, PAS LE DÉTAIL : le détail se demande par les outils de
           lecture (OUTILS_PCB), et seulement quand la question en a besoin. */
        resume.push("Outil actif : Éditeur PCB Web CAO.");
        if (S.board) {
          resume.push("Dimensions carte : " + (Math.round((S.board.w || 0) * 10) / 10) + " × " + (Math.round((S.board.h || 0) * 10) / 10) + " mm" + (S.board.pts ? " (contour libre)" : "") + ".");
        }
        if (S.cu) {
          resume.push("Empilage : " + S.cu + " couche(s) cuivre" + (typeof stackTotal === "function" ? (", " + stackTotal() + " mm au total") : "") + ".");
        }
        const nets = (typeof netTable === "function") ? netTable() : [];
        const cx = (typeof conn === "function") ? conn() : null;
        const aRouter = cx ? [...cx.nets.values()].filter(n => n.miss > 0).length : 0;
        resume.push("Composants : " + (S.fps || []).length + ". Nets : " + nets.length + (aRouter ? (", dont " + aRouter + " pas entièrement routé(s)") : "") + ".");
        resume.push("Routage : " + (S.tracks || []).length + " segments de piste, " + (S.vias || []).length + " vias, " + (S.zones || []).length + " zones de cuivre.");
        if (S.drcRun && Array.isArray(S.drc)) {
          const erreurs = S.drc.filter(d => !d.info).length;
          resume.push("DRC : " + erreurs + " erreur(s), " + (S.drc.length - erreurs) + " remarque(s).");
        } else {
          resume.push("DRC : pas encore lancé.");
        }
        if (S.activeNet || S.hlNet) {
          resume.push("Net actif sélectionné : " + (S.activeNet || S.hlNet) + ".");
        }
        if (S.sel && S.sel.fps && S.sel.fps.size) {
          const refs = (S.fps || []).filter(f => S.sel.fps.has(f.id) || S.sel.fps.has(f)).map(f => f.ref);
          if (refs.length) resume.push("Composants sélectionnés : " + refs.slice(0, 20).join(", ") + (refs.length > 20 ? " …" : "") + ".");
        }
      } else if (outil === "ipc2581" && typeof V !== "undefined" && V) {
        resume.push("Outil actif : Visionneuse IPC-2581 Web CAO (lecture seule : la carte se regarde, elle ne se modifie pas).");
        if (V.modele) {
          const m = V.modele, u = V.unite || "mm", r = x => Math.round(x * 1000) / 1000;
          resume.push("Fichier IPC-2581 : " + (V.fichier || "sans nom") + ", unité du document : " + u + ".");
          if (V.bbox) resume.push("Encombrement : " + r(V.bbox.x2 - V.bbox.x1) + " × " + r(V.bbox.y2 - V.bbox.y1) + " " + u + (m.epaisseur ? (", épaisseur " + m.epaisseur + " " + u) : "") + ".");
          resume.push("Couches cuivre : " + (V.couches || []).filter(c => c.cuivre).length + ". Composants : " + (m.composants || []).length + ". Nets : " + (V.parNet || []).filter(n => n.nom).length + ".");
        } else {
          resume.push("Aucun fichier IPC-2581 ouvert.");
        }
        if (V.comp) resume.push("Composant inspecté : " + V.comp + ".");
        if (V.net >= 0 && V.parNet && V.parNet[V.net]) resume.push("Net inspecté : " + V.parNet[V.net].nom + ".");
      }
      if (outil !== "schema") {
        const sims = simAvecResultat();
        if (sims.length) resume.push("Simulations avec un résultat : " + sims.join(", ") + ".");
      }
    } catch (e) {
      console.warn("Contexte CAO non disponible :", e);
    }

    return resume.length > 0 ? resume.join("\n") : "Outil CAO électronique Web.";
  }

  /* ===========================================================================
     LES OUTILS DE LECTURE
     ---------------------------------------------------------------------------
     Le contexte joint à la question n'est qu'un résumé. Le détail — un net, un
     composant, l'empilage, une partie d'un rapport de simulation —, l'assistant
     le demande lui-même par un bloc ```outil, et la page ne lui rend que ce
     qu'il a demandé. Les réponses des outils servent à la question en cours et
     ne restent PAS dans l'historique : une conversation de vingt questions ne
     traîne pas vingt netlists à chaque envoi.

     Un bloc ```outil plutôt que les « function calls » de l'API : il passe par
     n'importe quel modèle (Gemma comme Gemini), comme les blocs ```action.
     =========================================================================== */
  const OUTIL_MAX = 12000;   // caractères rendus par un appel
  const OUTIL_TOURS = 4;     // allers-retours au plus pour une question

  // ponytail: filtre = sous-chaîne sans casse, pas de regex ; suffit pour « USB », « U1 », « 0402 »
  function contient(filtre, ...champs) {
    if (!filtre) return true;
    const f = String(filtre).toLowerCase();
    return champs.some(c => String(c == null ? "" : c).toLowerCase().includes(f));
  }

  function borner(lignes, max, quoi) {
    return lignes.length <= max ? lignes
      : lignes.slice(0, max).concat("... (" + (lignes.length - max) + " " + quoi + " de plus : précise le filtre)");
  }

  const mm = x => Math.round(x * 1000) / 1000;

  /* ---------- Éditeur PCB (S, 01-core.js) ---------- */
  const nomCouchePcb = i => ((S.cuL && S.cuL[i]) || {}).name || ("couche " + i);

  const OUTILS_PCB = {
    empilage: {
      desc: "couches cuivre et diélectriques du dessus vers le dessous (épaisseur, εr, tan δ, plans), finition",
      fn: () => {
        const L = ["Empilage : " + S.cu + " couche(s) cuivre, " + stackTotal() + " mm au total" +
                   (S.stack && S.stack.finish ? (", finition " + S.stack.finish) : "") + " :"];
        for (let i = 0; i < S.cu; i++) {
          const c = (S.cuL && S.cuL[i]) || {};
          L.push("- " + nomCouchePcb(i) + " : cuivre " + Math.round(cuT(i) * 1000) + " µm" + (c.plane ? (", plan" + (c.net ? (" " + c.net) : "")) : ""));
          if (i < S.cu - 1) {
            const d = diAt(i);
            L.push("- " + d.k + " " + d.mat + " : " + d.t + " mm, εr " + d.er + ", tan δ " + d.df);
          }
        }
        return L;
      }
    },
    classes: {
      desc: "classes de nets et leurs règles, règles de conception de la carte, paires différentielles",
      fn: () => {
        const L = ["Classes de nets :"].concat(S.classes.map(c =>
          "- " + c.name + " : piste " + c.w + " mm, isolement " + c.clr + " mm, via " + c.via + " / perçage " + c.drill + " mm"));
        const R = S.rule || {};
        L.push("Règles : bord de carte " + R.edge + " mm, perçage mini " + R.hole + " mm, masque " + R.mask + " mm, angle " + R.corner + ", profil fabricant " + R.mfgProfile + ".");
        if ((S.dpPairs || []).length) L.push("Paires différentielles : " + S.dpPairs.map(p => p.name + " (" + p.p + " / " + p.n + ")").join(", ") + ".");
        return L;
      }
    },
    composants: {
      args: '"filtre":"U"',
      desc: "liste des composants (repère, valeur, boîtier, face, position) ; filtre facultatif sur repère, valeur ou boîtier",
      fn: a => {
        const L = S.fps.filter(f => contient(a.filtre, f.ref, f.value, f.pkg)).map(f =>
          "- " + f.ref + (f.value ? (" = " + f.value) : "") + (f.pkg ? (" (" + f.pkg + ")") : "") +
          ", " + (f.side ? "dessous" : "dessus") + ", x " + mm(f.x) + " y " + mm(f.y) + " mm, rotation " + (f.rot || 0) + "°");
        return L.length ? borner(L, 150, "composants") : ["Aucun composant ne correspond."];
      }
    },
    composant: {
      args: '"ref":"U1"',
      desc: "un composant : valeur, boîtier, position, et le net de chaque broche",
      fn: a => {
        const f = S.fps.find(x => String(x.ref).toLowerCase() === String(a.ref || "").toLowerCase());
        if (!f) return ["Composant « " + a.ref + " » introuvable : demande la liste avec l'outil « composants »."];
        const L = [f.ref + (f.value ? (" = " + f.value) : "") + (f.pkg ? (" (" + f.pkg + ")") : "") + ", face " + (f.side ? "dessous" : "dessus") +
                   ", x " + mm(f.x) + " y " + mm(f.y) + " mm, rotation " + (f.rot || 0) + "°."];
        const pads = padsOf(f);
        L.push("Broches (" + pads.length + ") :");
        return L.concat(borner(pads.map(q => "- " + q.n + " → " + (q.net || "non connectée")), 200, "broches"));
      }
    },
    nets: {
      args: '"filtre":"USB","a_router":true',
      desc: "liste des nets (classe, nombre de broches, état du routage) ; filtre et a_router facultatifs",
      fn: a => {
        const cx = conn();
        const L = [];
        for (const n of netTable()) {
          const info = cx.nets.get(n.name);
          const miss = info ? info.miss : 0;
          if (!contient(a.filtre, n.name) || (a.a_router && !miss)) continue;
          L.push("- " + n.name + " [" + classOf(n.name).name + "] : " + n.nodes.length + " broches, " + (miss ? (miss + " liaison(s) à router") : "routé"));
        }
        return L.length ? borner(L, 150, "nets") : ["Aucun net ne correspond."];
      }
    },
    net: {
      args: '"nom":"USB_DP"',
      desc: "un net : classe et règles, broches reliées, longueur et largeurs de piste par couche, vias, zones, paire",
      fn: a => {
        const nom = String(a.nom || "").toLowerCase();
        const row = netTable().find(n => String(n.name).toLowerCase() === nom);
        if (!row) return ["Net « " + a.nom + " » introuvable : demande la liste avec l'outil « nets »."];
        const cl = classOf(row.name), info = conn().nets.get(row.name);
        const L = ["Net " + row.name + ", classe " + cl.name + " : piste " + cl.w + " mm, isolement " + cl.clr + " mm, via " + cl.via + " / " + cl.drill + " mm.",
                   "État : " + (info && info.miss ? (info.miss + " liaison(s) à router") : "routé") + ".",
                   "Broches (" + row.nodes.length + ") : " + row.nodes.slice(0, 200).map(n => n.ref + "." + n.pin).join(", ") + (row.nodes.length > 200 ? " …" : "")];
        const parCouche = new Map();
        for (const t of S.tracks) {
          if (t.net !== row.name) continue;
          const e = parCouche.get(t.l) || { mm: 0, n: 0, w: new Set() };
          e.mm += Math.hypot(t.x2 - t.x1, t.y2 - t.y1); e.n++; e.w.add(t.w);
          parCouche.set(t.l, e);
        }
        let total = 0;
        for (const [l, e] of parCouche) {
          total += e.mm;
          L.push("Pistes sur " + nomCouchePcb(l) + " : " + mm(e.mm) + " mm en " + e.n + " segment(s), largeur(s) " + [...e.w].join(" / ") + " mm.");
        }
        L.push("Longueur de piste totale : " + mm(total) + " mm. Vias : " + S.vias.filter(v => v.net === row.name).length + ".");
        const zones = S.zones.filter(z => z.net === row.name).map(z => nomCouchePcb(z.l));
        if (zones.length) L.push("Zones de cuivre sur : " + zones.join(", ") + ".");
        const paires = (S.dpPairs || []).filter(p => p.p === row.name || p.n === row.name);
        if (paires.length) L.push("Paire différentielle : " + paires.map(p => p.name + " (" + p.p + " / " + p.n + ")").join(", ") + ".");
        return L;
      }
    },
    drc: {
      desc: "les erreurs puis les remarques du dernier DRC, avec leur position",
      fn: () => {
        if (!S.drcRun) return ["Le DRC n'a pas encore été lancé : propose à l'utilisateur de le lancer."];
        const tri = S.drc.filter(d => !d.info).concat(S.drc.filter(d => d.info));
        return tri.length ? borner(tri.map(d => "- " + (d.info ? "[remarque] " : "[erreur] ") + d.msg + " (x " + mm(d.x) + ", y " + mm(d.y) + ")"), 80, "lignes")
                          : ["DRC propre : aucune erreur."];
      }
    }
  };

  /* ---------- Visionneuse IPC-2581 (V, 02-modele.js) ---------- */
  const nomNetIpc = i => (V.parNet[i] || {}).nom || "sans net";

  const OUTILS_IPC = {
    empilage: {
      desc: "couches physiques dans l'ordre du fichier (nature, épaisseur, matière, εr, tan δ)",
      fn: () => {
        const e = V.modele.empilage || [], u = V.unite || "mm";
        return e.length ? e.map(x => "- " + x.nom + " : " + (x.type || "?") + (x.ep ? (", " + x.ep + " " + u) : "") + (x.mat ? (", " + x.mat) : "") +
                                     (x.dk ? (", εr " + x.dk) : "") + (x.df ? (", tan δ " + x.df) : ""))
                        : ["Le fichier ne déclare pas d'empilage."];
      }
    },
    composants: {
      args: '"filtre":"U"',
      desc: "liste des composants (repère, valeur, boîtier, référence, couche) ; filtre facultatif",
      fn: a => {
        const L = (V.modele.composants || []).filter(c => contient(a.filtre, c.ref, c.val, c.pkg, c.part)).map(c =>
          "- " + c.ref + (c.val ? (" = " + c.val) : "") + (c.pkg ? (" (" + c.pkg + ")") : "") + (c.part ? (", " + c.part) : "") +
          ", " + ((V.couches[c.c] || {}).nom || "?"));
        return L.length ? borner(L, 150, "composants") : ["Aucun composant ne correspond."];
      }
    },
    composant: {
      args: '"ref":"U1"',
      desc: "un composant : valeur, boîtier, référence, position, et le net de chaque broche",
      fn: a => {
        const c = (V.modele.composants || []).find(x => String(x.ref).toLowerCase() === String(a.ref || "").toLowerCase());
        if (!c) return ["Composant « " + a.ref + " » introuvable : demande la liste avec l'outil « composants »."];
        const L = [c.ref + (c.val ? (" = " + c.val) : "") + (c.pkg ? (" (" + c.pkg + ")") : "") + (c.part ? (", " + c.part) : "") + (c.type ? (", type " + c.type) : "") +
                   ", couche " + ((V.couches[c.c] || {}).nom || "?") + ", x " + c.x + " y " + c.y + ", rotation " + c.r + "°."];
        const b = c.pins || [];
        L.push("Broches (" + b.length + ") :");
        return L.concat(borner(b.map(p => "- " + p.num + " → " + (p.n != null ? nomNetIpc(p.n) : "non connectée")), 200, "broches"));
      }
    },
    nets: {
      args: '"filtre":"USB"',
      desc: "liste des nets (classe, longueur de piste, nombre de couches) ; filtre facultatif",
      fn: a => {
        const u = V.unite || "mm";
        const L = V.parNet.filter(n => n.nom && contient(a.filtre, n.nom)).map(n =>
          "- " + n.nom + " [" + n.classe + "] : " + (n.longueur > 0 ? (mm(n.longueur) + " " + u + " de pistes") : "sans piste") + ", " + n.couches.size + " couche(s)");
        return L.length ? borner(L, 150, "nets") : ["Aucun net ne correspond."];
      }
    },
    net: {
      args: '"nom":"USB_DP"',
      desc: "un net : classe, longueur, couches, nombre de pistes, plans, pastilles et perçages, broches reliées",
      fn: a => {
        const nom = String(a.nom || "").toLowerCase();
        const n = V.parNet.find(x => String(x.nom).toLowerCase() === nom);
        if (!n) return ["Net « " + a.nom + " » introuvable : demande la liste avec l'outil « nets »."];
        const broches = [];
        for (const c of V.modele.composants || [])
          for (const p of c.pins || []) if (p.n === n.i) broches.push(c.ref + "." + p.num);
        return ["Net " + n.nom + ", classe " + n.classe + (n.tensionNominale != null ? (", " + n.tensionNominale + " V") : "") + ".",
                "Longueur de piste : " + mm(n.longueur) + " " + (V.unite || "mm") + ", sur " + [...n.couches].map(i => (V.couches[i] || {}).nom).join(", ") + ".",
                "Objets : " + n.pistes.length + " pistes, " + n.arcs.length + " arcs, " + n.plans.length + " plans, " + n.pads.length + " pastilles, " + n.trous.length + " perçages.",
                "Broches (" + broches.length + ") : " + broches.slice(0, 200).join(", ") + (broches.length > 200 ? " …" : "")];
      }
    }
  };

  /* ---------- Simulations (commun/simulation-rapport.js) ----------
     Le rapport complet n'existe que pour l'analyse AFFICHÉE : sa fiche est
     dans la page. Les autres ne rendent que leurs chiffres clés et leur JSON. */
  const SIM_PARTIES = {
    methode: /^Ce que calcule/, chiffres: /^Chiffres clés/, diagnostics: /^Diagnostics/,
    piste: /^La piste/, bornes: /^Bornes/, reglages: /^Réglages/,
    resultats: /^Résultats détaillés/, texte: /^Rapport texte/, json: /^Données brutes/
  };

  function simRapportsDispo() { return typeof SIM_RAP_ETAT !== "undefined" && typeof SIM !== "undefined"; }

  function simEtat(k) {
    try { return SIM_RAP_ETAT[k](); } catch (e) { return {}; }
  }
  function simNom(k) { return (typeof SIM_ANALYSES !== "undefined" && SIM_ANALYSES[k] && SIM_ANALYSES[k].nom) || k; }
  function simKpis(k, res) {
    try { return (SIM_RAP_KPI[k] ? SIM_RAP_KPI[k](res) : []).map(x => x.lbl + " : " + x.val); } catch (e) { return []; }
  }
  function simAvecResultat() {
    if (!simRapportsDispo()) return [];
    return Object.keys(SIM_RAP_ETAT).filter(k => simEtat(k).res).map(k => simNom(k) + " (« " + k + " »)");
  }

  const OUTILS_SIM = {
    simulations: {
      desc: "les analyses de simulation, celles qui ont un résultat et leurs chiffres clés",
      fn: () => Object.keys(SIM_RAP_ETAT).map(k => {
        const res = simEtat(k).res;
        return "- " + k + " (" + simNom(k) + ")" + (k === SIM.analyse ? " [affichée]" : "") + " : " +
               (res ? ("résultat disponible. " + simKpis(k, res).slice(0, 4).join(" ; ")) : "pas de résultat");
      })
    },
    simulation: {
      args: '"analyse":"crosstalk","partie":"chiffres"',
      desc: "une partie du rapport d'une simulation. « partie » vaut : chiffres, diagnostics, methode, piste, bornes, reglages, resultats, texte ou json (données brutes, volumineuses : en dernier recours). Commence par chiffres et diagnostics",
      fn: a => {
        const k = a.analyse || SIM.analyse;
        if (!SIM_RAP_ETAT[k]) return ["Analyse « " + k + " » inconnue. Analyses : " + Object.keys(SIM_RAP_ETAT).join(", ") + "."];
        const partie = a.partie || "chiffres";
        if (k === SIM.analyse && typeof simRapCollecter === "function") {
          const sections = simRapMarkdown(simRapCollecter()).split(/\n(?=## )/);
          const motif = SIM_PARTIES[partie];
          const s = motif && sections.find(x => motif.test(x.replace(/^## \d+\. /, "")));
          return [s || ("La partie « " + partie + " » n'existe pas dans ce rapport. Parties : " + Object.keys(SIM_PARTIES).join(", ") + ".")];
        }
        const res = simEtat(k).res;
        if (!res) return ["La simulation « " + simNom(k) + " » n'a pas de résultat."];
        if (partie === "json") return ["```json", simRapJson(res), "```"];
        if (partie === "methode" && SIM_RAP_GUIDE[k]) return [SIM_RAP_GUIDE[k].methode, "Critères : " + SIM_RAP_GUIDE[k].criteres, "Limites : " + SIM_RAP_GUIDE[k].limites];
        const L = simKpis(k, res).map(x => "- " + x);
        L.push("(« " + simNom(k) + " » n'est pas l'analyse affichée : seuls ses chiffres clés, sa méthode et son JSON sont lisibles. " +
               "Pour le reste, demande à l'utilisateur de l'afficher dans le panneau Simulation.)");
        return L;
      }
    }
  };

  /* Les outils de l'éditeur ouvert. L'éditeur schématique n'en a pas : son
     contexte, une feuille à la fois, reste complet. */
  function outilsLecture() {
    if (!_inclureContexte) return {};
    const outil = detecterOutil();
    let o = {};
    if (outil === "pcb" && typeof S !== "undefined" && S && typeof netTable === "function") o = Object.assign({}, OUTILS_PCB);
    else if (outil === "ipc2581" && typeof V !== "undefined" && V && V.modele) o = Object.assign({}, OUTILS_IPC);
    if (outil !== "schema" && simRapportsDispo()) Object.assign(o, OUTILS_SIM);
    return o;
  }

  function consigneOutils(outils) {
    const noms = Object.keys(outils);
    if (!noms.length) return "";
    return "\n\nOUTILS DE LECTURE. Le contexte joint à la question n'est qu'un RÉSUMÉ. Quand la réponse demande un détail " +
      "(un net, un composant, l'empilage, une simulation…), DEMANDE-LE avant de répondre : écris seulement un ou plusieurs blocs, sans autre texte :\n" +
      "```outil\n{\"outil\":\"net\",\"nom\":\"USB_DP\"}\n```\n" +
      "La page te renvoie les données, puis tu réponds. Ne demande que ce dont la question a besoin, du plus ciblé au plus large ; " +
      "n'invente jamais une donnée que tu peux demander. Au plus " + OUTIL_TOURS + " allers-retours. Outils disponibles :\n" +
      noms.map(n => "- " + n + (outils[n].args ? (" {" + outils[n].args + "}") : "") + " : " + outils[n].desc).join("\n");
  }

  /* Les blocs ```outil d'une réponse, exécutés. Rend null s'il n'y en a pas. */
  function executerOutils(texte, outils) {
    const blocs = [...texte.matchAll(/```outil\s*\n([\s\S]*?)```/g)];
    if (!blocs.length) return null;
    return blocs.slice(0, 8).map(b => {
      let a;
      try { a = JSON.parse(b[1]); } catch (e) { return { titre: "?", texte: "Bloc illisible : JSON attendu, par exemple {\"outil\":\"nets\"}." }; }
      const o = outils[a.outil];
      const titre = a.outil + (a.nom || a.ref || a.filtre || a.analyse ? (" " + (a.nom || a.ref || a.filtre || a.analyse)) : "") + (a.partie ? (" · " + a.partie) : "");
      if (!o) return { titre: titre, texte: "Outil « " + a.outil + " » inconnu. Outils : " + Object.keys(outils).join(", ") + "." };
      let t;
      try { t = [].concat(o.fn(a)).join("\n"); } catch (e) { t = "Échec de l'outil : " + e.message; }
      if (t.length > OUTIL_MAX) t = t.slice(0, OUTIL_MAX) + "\n... (tronqué à " + OUTIL_MAX + " caractères : demande plus ciblé)";
      return { titre: titre, texte: t };
    });
  }

  /* Ce que l'assistant doit savoir de la suite avant toute question, quel que
     soit l'éditeur ouvert. */
  const CONTEXTE_SUITE =
    "CONTEXTE : WEB_CAO fait partie de WEB·SUITE, trois outils web locaux lancés depuis un même lanceur :\n" +
    "- WEB_CAO : éditeur schématique, éditeur PCB (routage Push & Shove, DRC, classes de nets, paires différentielles), bibliothèque de composants, visionneuse IPC-2581, simulations SI / PI / RF ;\n" +
    "- WEB_ANTENNA : simulation d'antennes PCB (openEMS, FDTD) à partir d'une carte IPC-2581 exportée par WEB_CAO, ou dessinée sur place ;\n" +
    "- WEB_3D : visionneuse 3D (STEP, IGES, STL), mesure et assemblage de cartes.\n" +
    "Un projet regroupe le schéma (-SCH), le circuit imprimé (-PCB) et la carte de fabrication (-IPC) ; lancé depuis WEB·SUITE, il vit dans PROJETS/CAO/<projet>, synchronisé sur GitHub ; la bibliothèque commune est dans PROJETS/LIB_CAO.\n" +
    "Quand une question dépasse l'outil ouvert (rayonnement d'une antenne, encombrement mécanique), dis quel outil de la suite y répond.\n\n";

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
            couche: nomCouchePcb(t.l)
          });
          if (t.w) parNet[netNom].largeursMm.add(t.w);
          if (t.l != null) parNet[netNom].couches.add(nomCouchePcb(t.l));
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
          viasSel = Array.from(S.sel.vias).map(v => ({ x: v.x, y: v.y, net: v.net, drill: v.drill, pad: v.d, de: nomCouchePcb(v.a), a: nomCouchePcb(v.b) }));
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
        const tousFps = Array.isArray(S.fps) ? S.fps : (Array.isArray(S.fp) ? S.fp : []);
        const selFps = tousFps.filter(f => S.sel.fps.has(f.id) || S.sel.fps.has(f));
        const fps = selFps.map(f => ({
          ref: f.ref || "Fp",
          val: f.val || f.value || "",
          package: f.pkg || f.package || "",
          face: f.side ? "dessous" : "dessus",
          padsCount: (typeof padsOf === "function") ? padsOf(f).length : (f.pads || []).length
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

    } else if (donnees.type === "rapport_simulation") {
      // Le rapport de commun/simulation-rapport.js : autonome, question comprise.
      prompt = donnees.texte;

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
    let html = '<div class="ia-menu-head"><span>Assistant IA (' + getNomModele(_modele) + ')</span></div>';

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
            '<select id="iaModelSelect" class="ia-model-select" title="Modèle d\'IA Google AI Studio">' +
              '<option value="gemma-4-31b-it">Gemma 4 31B</option>' +
              '<option value="gemini-3.8-flash">Gemini 3.8 Flash</option>' +
              '<option value="gemini-3.8-flash-thinking">Gemini 3.8 Flash (Thinking)</option>' +
            '</select>' +
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
          '<div class="ia-pieces" id="iaPieces" hidden></div>' +
          '<div class="ia-input-row">' +
            '<input type="file" id="iaFichier" accept="' + PIECE_TYPES.join(",") + '" multiple hidden>' +
            '<button type="button" class="ia-btn-joindre" id="iaBtnJoindre" title="Joindre une datasheet (PDF) ou une capture de tableau — ou glissez-la sur le volet">📎</button>' +
            '<textarea id="iaInput" class="ia-textarea" rows="2" placeholder="Posez votre question technique à l\'Assistant IA... (Entrée pour envoyer, Maj+Entrée pour nouvelle ligne)"></textarea>' +
            '<button type="button" class="ia-btn-send" id="iaBtnSend" title="Envoyer le message (Entrée)">' +
              '<svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>' +
            '</button>' +
          '</div>' +
          '<div class="ia-footer-hints">' +
            '<label title="Transmet un résumé technique du circuit/carte pour guider la réponse">' +
              '<input type="checkbox" id="iaChkContext" checked> Contexte projet' +
            '</label>' +
            '<span id="iaFooterModelLabel">Google AI Studio · Session active</span>' +
          '</div>' +
        '</div>' +
      '</div>';

    /* Modèle sélectionné */
    const selModel = document.getElementById("iaModelSelect");
    if (selModel) {
      selModel.value = _modele;
      const lblModele = document.getElementById("iaFooterModelLabel");
      if (lblModele) lblModele.textContent = getNomModele(_modele) + " · Session active";
      selModel.addEventListener("change", function() {
        _modele = this.value;
        if (lblModele) lblModele.textContent = this.options[this.selectedIndex].text + " · Session active";
        if (_historique.length === 0) rendreMessages();
      });
    }

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
      _pieces = [];
      rendrePieces();
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

    /* Pièces jointes : le trombone, ou un fichier glissé sur le volet. */
    const inFichier = document.getElementById("iaFichier");
    document.getElementById("iaBtnJoindre").addEventListener("click", function() { inFichier.click(); });
    inFichier.addEventListener("change", function() {
      ajouterPieces(this.files);
      this.value = "";
    });
    panneau.addEventListener("dragover", function(e) {
      if (e.dataTransfer && Array.from(e.dataTransfer.types || []).includes("Files")) {
        e.preventDefault();
        panneau.classList.add("ia-depot");
      }
    });
    panneau.addEventListener("dragleave", function(e) {
      if (!panneau.contains(e.relatedTarget)) panneau.classList.remove("ia-depot");
    });
    panneau.addEventListener("drop", function(e) {
      panneau.classList.remove("ia-depot");
      if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length) {
        e.preventDefault();
        ajouterPieces(e.dataTransfer.files);
      }
    });

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
    _cleApi = val; // Mémorisé dans la variable RAM et synchronisé dans la session
    try { sessionStorage.setItem("cao_ia_cle", val); } catch (_) {}
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

  /* ---------- Purge de la clé ---------- */
  function iaPurgerCle() {
    _cleApi = "";
    try { sessionStorage.removeItem("cao_ia_cle"); } catch (_) {}
    _historique = [];
    _questionEnAttente = "";
    _pieces = [];
    rendrePieces();
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
      "  - Propose un bouton `[⚡ Appliquer au PCB]` qui modifie instantanément la largeur des pistes sélectionnées ou du net actif.\n" +
      "- **Éditeur PCB & Visionneuse — Simulations réglées depuis une datasheet** :\n" +
      "  - Joignez la datasheet avec **📎** (ou glissez le PDF sur le volet), puis cliquez **« ⚙️ Paramétrer les simulations avec cette datasheet »**.\n" +
      "  - L'IA relève ce qui règle **toutes** les simulations : fiche de la charge PDN (IDD, horloge, fronts), régulateur (R_vrm, f_vrm), stratifié (εr, tanδ, conductivité), ESR / ESL des condensateurs, timings de bus (tsu, th, tco), fronts et niveaux SI, courants des bornes de chute DC.\n" +
      "  - Le bouton `[🔍 Vérifier et appliquer…]` affiche chaque valeur avec **sa page et sa citation** : cochez celles à garder. Les valeurs hors bornes physiques ou sans composant correspondant sont refusées d'office.\n" +
      "  - Les trois modèles lisent les PDF ; le fichier part chez Google AI Studio avec le message.\n\n" +
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

  /* ---------- Pièces jointes : datasheets PDF et captures ---------- */
  function tailleLisible(o) {
    return o >= 1048576 ? (o / 1048576).toFixed(1).replace(".", ",") + " Mo" : Math.max(1, Math.round(o / 1024)) + " ko";
  }

  function lireEnBase64(fichier) {
    return new Promise(function(ok, ko) {
      const lecteur = new FileReader();
      lecteur.onload = function() { ok(String(lecteur.result).replace(/^data:[^,]*,/, "")); };
      lecteur.onerror = function() { ko(lecteur.error); };
      lecteur.readAsDataURL(fichier);
    });
  }

  /* Les trois modèles du sélecteur lisent les PDF, Gemma 4 compris : joindre
     un document ne change pas de modèle. */
  async function ajouterPieces(fichiers) {
    const refus = [];
    for (const f of Array.from(fichiers || [])) {
      const mime = f.type || (/\.pdf$/i.test(f.name) ? "application/pdf" : "");
      if (!PIECE_TYPES.includes(mime)) { refus.push(f.name + " : format non pris en charge (PDF, PNG, JPEG, WebP)"); continue; }
      const deja = _pieces.reduce((s, p) => s + p.taille, 0);
      if (f.size + deja > PIECE_TAILLE_MAX) { refus.push(f.name + " : trop lourd (" + tailleLisible(f.size) + ", " + tailleLisible(PIECE_TAILLE_MAX) + " max. par message)"); continue; }
      try {
        _pieces.push({ nom: f.name, mime: mime, taille: f.size, data: await lireEnBase64(f) });
      } catch (e) {
        refus.push(f.name + " : lecture impossible");
      }
    }
    if (refus.length) {
      const banner = document.getElementById("iaErrorBanner"), txt = document.getElementById("iaErrorText");
      if (banner && txt) { txt.textContent = refus.join(" · "); banner.hidden = false; }
    }
    rendrePieces();
  }

  function simulationsDisponibles() {
    return typeof window.simDsCatalogue === "function";
  }

  function rendrePieces() {
    const bar = document.getElementById("iaPieces");
    if (!bar) return;
    if (!_pieces.length) { bar.hidden = true; bar.innerHTML = ""; return; }
    const aPdf = _pieces.some(p => p.mime === "application/pdf");
    bar.hidden = false;
    bar.innerHTML =
      '<div class="ia-pieces-liste">' +
        _pieces.map((p, i) =>
          '<span class="ia-piece" title="' + echapperHtml(p.nom) + '">' +
            (p.mime === "application/pdf" ? "📄 " : "🖼 ") + echapperHtml(p.nom) +
            ' <small>' + tailleLisible(p.taille) + '</small>' +
            '<button type="button" data-i="' + i + '" title="Retirer">✕</button>' +
          '</span>').join("") +
      '</div>' +
      (aPdf && simulationsDisponibles()
        ? '<button type="button" class="ia-chip ia-chip-ds" id="iaBtnDsSim" title="Demande à l\'IA de relever dans la datasheet tout ce qui règle les simulations SI / PI ; vous validez chaque valeur avant qu\'elle soit appliquée">⚙️ Paramétrer les simulations avec cette datasheet</button>'
        : '') +
      '<div class="ia-pieces-note">Le fichier est envoyé à Google AI Studio avec le message.</div>';
    bar.querySelectorAll(".ia-piece button").forEach(function(b) {
      b.onclick = function() { _pieces.splice(parseInt(this.getAttribute("data-i"), 10), 1); rendrePieces(); };
    });
    const ds = document.getElementById("iaBtnDsSim");
    if (ds) ds.onclick = function() {
      const input = document.getElementById("iaInput");
      if (input) input.value = QUESTION_DATASHEET;
      envoyerMessage();
    };
  }

  const QUESTION_DATASHEET =
    "Relève dans cette datasheet toutes les valeurs qui règlent les simulations du catalogue " +
    "(fiche de la charge PDN, régulateur, stratifié, condensateurs, timings de bus, fronts et niveaux SI, courants DC), " +
    "dis pour chacune d'où elle vient, puis donne le bloc d'action sim_params.";

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

      // 0. Simulations : rien ne s'applique avant d'avoir été vu et coché.
      if (act.type === "sim_params") {
        afficherValidationSim(btn, act);
        return;
      }

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

          // Si non trouvé sur la feuille active, chercher sur les autres feuilles
          if (!comp && Array.isArray(S.pages)) {
            for (const p of S.pages) {
              if (Array.isArray(p.comps)) {
                comp = p.comps.find(c => (c.ref || "").trim().toUpperCase() === refCible.toUpperCase());
                if (comp) break;
              }
            }
          }

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

  /* ---------- Validation des paramètres de simulation (datasheet) ----------
     Un tableau à cocher sous la carte d'action : valeur actuelle → valeur
     proposée, et la page et la citation qui la justifient. Les lignes que le
     registre refuse (clé inconnue, hors bornes, aucun composant visé) restent
     visibles, grisées, avec leur motif. La vérification et l'application sont
     dans commun/simulation-datasheet.js ; ici, seulement l'affichage. */
  function afficherValidationSim(btn, act) {
    if (!simulationsDisponibles() || typeof window.simDsPreparer !== "function") {
      if (typeof alert === "function") alert("Les simulations SI / PI ne sont chargées que dans l'éditeur PCB et la visionneuse IPC-2581.");
      return;
    }
    const carte = btn ? btn.closest(".ia-action-card") : null;
    if (!carte) return;
    const ancien = carte.querySelector(".ia-ds-valid");
    if (ancien) { ancien.remove(); if (btn) btn.hidden = false; return; }

    const prep = window.simDsPreparer(act);
    const cadre = document.createElement("div");
    cadre.className = "ia-ds-valid";
    const txt = v => {
      if (v == null || v === "") return "—";
      if (typeof v !== "number") return String(v);
      return isFinite(v) ? String(Number(v.toPrecision(6))).replace(".", ",") : "—";
    };

    let h = "";
    for (const a of prep.avertissements) h += '<div class="ia-ds-avert">⚠ ' + echapperHtml(a) + '</div>';
    if (!prep.lignes.length) h += '<div class="ia-ds-avert">La réponse ne contient aucune valeur exploitable.</div>';

    h += '<table class="ia-ds-tab"><thead><tr><th></th><th>Paramètre</th><th>Actuel</th><th>Proposé</th><th>Source</th></tr></thead><tbody>';
    let groupe = null;
    for (const l of prep.lignes) {
      if (l.groupe !== groupe) {
        groupe = l.groupe;
        h += '<tr class="ia-ds-grp"><td colspan="5">' + echapperHtml(groupe) + '</td></tr>';
      }
      const basse = /basse|faible|low/i.test(l.confiance);
      h += '<tr class="' + (l.ok ? "" : "ia-ds-ko") + '">' +
        '<td><input type="checkbox" data-id="' + l.id + '"' + (l.ok ? (basse ? "" : " checked") : " disabled") + '></td>' +
        '<td>' + echapperHtml(l.lib) +
          (l.motif ? '<div class="ia-ds-motif">' + echapperHtml(l.motif) + '</div>' : '') +
          (l.note ? '<div class="ia-ds-note">' + echapperHtml(l.note) + '</div>' : '') +
          (basse && l.ok ? '<div class="ia-ds-note">confiance basse : décochée d\'office</div>' : '') + '</td>' +
        '<td class="n">' + echapperHtml(txt(l.actuel)) + '</td>' +
        '<td class="n"><b>' + echapperHtml(txt(l.nouveau)) + '</b> ' + echapperHtml(l.unite || "") + '</td>' +
        '<td class="ia-ds-src">' + (l.page ? "p. " + echapperHtml(l.page) : "") +
          (l.citation ? '<div>« ' + echapperHtml(l.citation) + ' »</div>' : (l.page ? "" : '<span class="ia-ds-motif">sans citation</span>')) + '</td>' +
      '</tr>';
    }
    h += '</tbody></table>' +
      '<div class="ia-ds-pied">' +
        '<label><input type="checkbox" class="ia-ds-tout" checked> tout</label>' +
        '<button type="button" class="ia-btn-action ia-ds-go">Appliquer la sélection</button>' +
      '</div>' +
      '<div class="ia-ds-bilan" hidden></div>';
    cadre.innerHTML = h;
    carte.appendChild(cadre);
    if (btn) btn.hidden = true;

    const cases = () => Array.from(cadre.querySelectorAll('tbody input[type="checkbox"]:not(:disabled)'));
    const go = cadre.querySelector(".ia-ds-go");
    const compter = () => {
      const n = cases().filter(c => c.checked).length;
      go.textContent = "Appliquer la sélection (" + n + ")";
      go.disabled = n === 0;
    };
    cases().forEach(c => { c.onchange = compter; });
    cadre.querySelector(".ia-ds-tout").onchange = function() {
      const on = this.checked;
      cases().forEach(c => { c.checked = on; });
      compter();
    };
    compter();

    go.onclick = function() {
      const ids = cases().filter(c => c.checked).map(c => parseInt(c.getAttribute("data-id"), 10));
      let r;
      try { r = window.simDsAppliquer(prep, ids); }
      catch (e) {
        console.error("Application des paramètres de simulation :", e);
        if (typeof alert === "function") alert("Erreur d'application : " + e.message);
        return;
      }
      cadre.querySelectorAll("input").forEach(c => { c.disabled = true; });
      go.disabled = true;
      go.classList.add("done");
      go.textContent = "✓ " + r.n + " valeur" + (r.n > 1 ? "s" : "") + " appliquée" + (r.n > 1 ? "s" : "");
      const bilan = cadre.querySelector(".ia-ds-bilan");
      bilan.hidden = false;
      bilan.innerHTML = (r.messages || []).map(m => '<div>' + echapperHtml(m) + '</div>').join("") +
        (r.n ? '<div>Onglet Simulation mis à jour. Les valeurs restent modifiables dans le panneau.</div>' : '');
    };
  }

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
    let txt = texte.replace(/```([a-zA-Z0-9_:-]*)[^\S\r\n]*\r?\n([\s\S]*?)```/g, function(_, lang, code) {
      const idx = codeBlocks.length;
      const langLower = (lang || "").toLowerCase();

      // Interception des blocs d'action interactive (```action, ```action:pcb, ```action:sch, etc.)
      if (langLower === "action" || langLower.startsWith("action:")) {
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
          } else if (act.type === "sim_params") {
            titre = "⚙️ Paramètres de simulation relevés dans la datasheet";
            const n = (act.valeurs || []).length + (act.condensateurs || []).length + (act.bornes_dc || []).length;
            sousTitre = (act.source ? act.source + " · " : "") + n + " valeur" + (n > 1 ? "s" : "") + " proposée" + (n > 1 ? "s" : "");
            btnLabel = "🔍 Vérifier et appliquer…";
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

      // Blocs de code réservés : le reste de la ligne vient du modèle (ou
      // d'un PDF qu'il a lu) et s'échappe comme le reste ; « %% » n'est pas
      // touché par echapperHtml, la réinsertion plus bas le retrouve.
      if (l.includes("%%CODEBLOCK_")) {
        if (inList) { out.push("</ul>"); inList = false; }
        out.push(echapperHtml(l));
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
      // fonction : un « $' » ou « $& » du code ne doit pas être interprété
      finalHtml = finalHtml.replace("%%CODEBLOCK_" + idx + "%%", () => bloc);
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
        '<span class="ia-msg-role">' + getNomModele(_modele) + '</span>' +
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
      let roleLabel = m.role === "user" ? "Vous" : (m.nomModele || getNomModele(_modele));
      if (m.localManual) {
        roleLabel = "🛠️ Guide du Système CAO (Réponse locale de l'outil)";
      }
      const texte = (m.parts && m.parts[0] && m.parts[0].text) ? m.parts[0].text : "";
      const joints = (m.pieces || []).map(p =>
        '<span class="ia-piece">' + (p.mime === "application/pdf" ? "📄 " : "🖼 ") + echapperHtml(p.nom) +
        ' <small>' + tailleLisible(p.taille) + '</small></span>').join("");
      d.innerHTML =
        '<span class="ia-msg-role' + (m.localManual ? " local-tool" : "") + '">' + roleLabel + '</span>' +
        '<div class="ia-msg-bubble' + (m.localManual ? " ia-manual-bubble" : "") + '">' +
          (joints ? '<div class="ia-pieces-liste">' + joints + '</div>' : '') +
          formaterMarkdown(texte) + '</div>';
      cont.appendChild(d);
    });

    if (_enAttente) {
      const loading = document.createElement("div");
      loading.className = "ia-loading-bubble";
      const txtAttente = getNomModele(_modele) +
        (confModele(_modele).thinkingLevel === "high"
          ? " réfléchit et analyse votre question technique..."
          : " analyse votre question technique...");
      loading.innerHTML =
        '<div class="ia-dots"><span class="ia-dot"></span><span class="ia-dot"></span><span class="ia-dot"></span></div>' +
        '<span></span>';
      // textContent : l'étape reprend des noms demandés par le modèle
      loading.lastChild.textContent = _etape ? ("🔎 Consulte : " + _etape + "…") : txtAttente;
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
    let q = (input ? input.value : "").trim();
    if (!q && !_pieces.length) return;
    // Une pièce jointe sans question : on dit ce qu'on en attend.
    if (!q) q = (simulationsDisponibles() && _pieces.some(p => p.mime === "application/pdf"))
      ? QUESTION_DATASHEET : "Analyse ce document.";

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

    // Ajout du message utilisateur, avec ses pièces jointes
    const piecesEnvoyees = _pieces;
    _pieces = [];
    rendrePieces();
    _historique.push({
      role: "user",
      parts: [{ text: q }],
      pieces: piecesEnvoyees.length ? piecesEnvoyees : undefined
    });

    _enAttente = true;
    _etape = "";
    rendreMessages();

    // Masquer bannière d'erreur précédente
    const errBanner = document.getElementById("iaErrorBanner");
    if (errBanner) errBanner.hidden = true;

    // Construction du prompt et contexte
    let promptSysteme =
      "Tu es l'ingénieur électronicien d'élite de la suite Web CAO (Éditeur Schématique, Éditeur PCB, Visionneuse industrielle IPC-2581).\n" +
      CONTEXTE_SUITE +
      "EXIGENCE ABSOLUE ET STRICTE : Tu réponds EXCLUSIVEMENT EN FRANÇAIS. Ne produis AUCUN mot, AUCUN méta-commentaire, AUCUN plan en anglais (bannis tout 'Role:', 'Constraint:', 'Task:', 'Context:', 'Components:', 'Netlist:'). Commence immédiatement par ta réponse technique en français avec clarté, concision et rigueur.\n\n" +
      "ACTIONS INTERACTIVES SUR LE PROJET :\n" +
      "Lorsque tu calcules ou préconises des valeurs numériques concrètes pour des composants de schéma (ex: R1, R2, C1 dans un montage NE555, un filtre RC, un pont diviseur de tension, etc.) ou une largeur de piste PCB (norme IPC-2152 selon courant et échauffement), AJOUTE TOUJOURS à la fin de ton explication un bloc d'action exécutable au format JSON strict balisé avec ```action :\n" +
      "Pour le schéma :\n" +
      "```action\n{\"type\":\"schema_values\",\"label\":\"Appliquer les valeurs calculées au schéma\",\"values\":{\"R1\":\"10k\",\"R2\":\"47k\",\"C1\":\"100nF\"}}\n```\n" +
      "Pour le PCB :\n" +
      "```action\n{\"type\":\"pcb_track_width\",\"label\":\"Appliquer la largeur de piste (0.65 mm)\",\"width\":0.65}\n```\n" +
      "L'outil Web CAO transformera ce bloc en un bouton interactif cliquable permettant à l'utilisateur d'appliquer directement tes calculs dans son projet.";

    /* LE PARAMÉTRAGE DES SIMULATIONS DEPUIS UNE DATASHEET. Le catalogue n'existe
       que là où les simulations sont chargées (éditeur PCB, visionneuse), et
       il ne part que lorsqu'il sert : un document joint dans la conversation,
       ou une question qui parle de simulation. Il décrit CE QUI PEUT être
       réglé, dans quelle unité — c'est la seule façon d'éviter qu'un courant
       lu en mA arrive dans un champ en ampères. */
    const aDocument = _historique.some(m => m.pieces && m.pieces.length);
    if (simulationsDisponibles() &&
        (aDocument || /datasheet|fiche technique|simul|pdn|\bpi\b|\bsi\b|crosstalk|diaphonie|setup|hold|chute dc|ir drop|imp[ée]dance|d[ée]couplage/i.test(q))) {
      let catalogue = "";
      try { catalogue = window.simDsCatalogue(); } catch (e) { console.warn("Catalogue simulation indisponible :", e); }
      if (catalogue) promptSysteme +=
        "\n\nPARAMÉTRAGE DES SIMULATIONS DEPUIS UNE DATASHEET :\n" +
        "Quand une datasheet est jointe et qu'on te demande de régler les simulations, relève UNIQUEMENT des valeurs ÉCRITES dans le document :\n" +
        "- Pire cas : courants et temps de propagation (tco max, IDD) à leur valeur MAX ; temps de montée à leur valeur MIN (le front le plus raide) ; tsu/th : la valeur MIN exigée par le récepteur. Conditions les plus proches du projet (tension, fréquence d'horloge, température).\n" +
        "- Pour chaque valeur : le numéro de page et une citation courte et exacte du tableau ou de la phrase.\n" +
        "- Une valeur absente du document ne s'invente pas et ne se déduit pas d'une « valeur usuelle » : omets-la et dis qu'elle manque (ex. nombre de sorties qui basculent ensemble = firmware).\n" +
        "- Convertis dans l'unité EXACTE du catalogue (ex. 12,5 mA pour pdn_fiche.iActifMa ; 0,002 A resterait faux).\n" +
        "- Choisis la bonne cible : la fiche pdn_fiche décrit la charge du rail indiquée plus bas ; une datasheet de régulateur règle pdn.rVrmMOhm / pdn.fVrmKhz, pas la fiche.\n" +
        "Réponds d'abord par un tableau court (paramètre, valeur, page, citation), puis termine par UN bloc exécutable :\n" +
        "```action\n" +
        "{\"type\":\"sim_params\",\"label\":\"Paramètres relevés dans la datasheet STM32G0B1\",\"source\":\"STM32G0B1 DS13560 rév. 4\",\"composant\":\"U3\"," +
        "\"valeurs\":[{\"sim\":\"pdn_fiche\",\"cle\":\"iActifMa\",\"valeur\":12.5,\"page\":84,\"citation\":\"IDD Run, fHCLK = 64 MHz, max 12.5 mA\",\"confiance\":\"haute\"}]," +
        "\"condensateurs\":[{\"refs\":[\"C12\",\"C13\"],\"esr_mohm\":8,\"esl_nh\":0.35,\"page\":3,\"citation\":\"...\"}]," +
        "\"bornes_dc\":[{\"composant\":\"U3\",\"courant_ma\":45,\"page\":84,\"citation\":\"...\"}]}\n" +
        "```\n" +
        "`sim` et `cle` sont ceux du catalogue ; `condensateurs` et `bornes_dc` sont facultatifs. L'utilisateur verra chaque valeur avec sa citation et cochera celles qu'il applique.\n\n" +
        catalogue;
    }

    let contexteProjetTexte = "";
    if (_inclureContexte) {
      const ctx = extraireContexteCao();
      contexteProjetTexte = "DONNÉES DU PROJET EN COURS DANS L'ÉDITEUR :\n" + ctx;
    }
    const outils = outilsLecture();
    promptSysteme += consigneOutils(outils);

    /* -------------------------------------------------------------------------
       Préparation de la requête Google AI Studio.

       GEMMA 4 GÈRE NATIVEMENT `systemInstruction`, et c'est ce qui corrige les
       erreurs 500 (« Internal error encountered. ») rencontrées sur ce modèle.
       Le montage précédent injectait de faux tours de dialogue — une directive
       « [DIRECTIVE ABSOLUE DU SYSTÈME CAO] » attribuée à l'utilisateur, un
       « Bien reçu » attribué au modèle — pour contourner une limitation qui
       n'existe plus. En présence du mode de réflexion interne, ce dialogue
       fabriqué faisait planter le serveur de Google. La directive part donc là
       où elle va : dans `systemInstruction`, pour tous les modèles.

       L'ENDPOINT N'EST PAS L'ENTRÉE DU MENU : « Gemini 3.8 Flash (Thinking) »
       appelle `gemini-3.8-flash` avec un budget de réflexion élevé, et non un
       modèle qui porterait ce nom — il n'en existe pas.
       ------------------------------------------------------------------------- */
    const conf = confModele(_modele);
    const url = "https://generativelanguage.googleapis.com/v1beta/models/" +
                encodeURIComponent(conf.endpoint) + ":generateContent";

    const contents = [];

    const messagesPourApi = _historique.filter(m => !m.localManual);
    messagesPourApi.forEach((m, idx) => {
      let txtMsg = (m.parts && m.parts[0] && m.parts[0].text) ? m.parts[0].text : "";
      // Injecter le contexte projet le plus frais au dernier message de l'utilisateur
      if (idx === messagesPourApi.length - 1 && m.role === "user" && contexteProjetTexte) {
        txtMsg = contexteProjetTexte + "\n\n" + txtMsg;
      }
      /* Les pièces jointes passent AVANT le texte, en `inlineData` : c'est
         l'ordre que Google recommande pour qu'une question porte sur le
         document qui la précède. */
      const parts = (m.pieces || []).map(p => ({ inlineData: { mimeType: p.mime, data: p.data } }));
      parts.push({ text: txtMsg });
      contents.push({
        role: m.role,
        parts: parts
      });
    });

    /* GÉNÉRATION : 8 192 jetons de sortie pour tous les modèles, et non 4 096.
       Le raisonnement interne se paie sur ce même budget ; à 4 096, Gemma 4
       épuisait ses jetons en réfléchissant et rendait une réponse tronquée —
       ou vide. La température, elle, suit le modèle : 0,7 pour Gemma 4 31B,
       0,2 pour les Gemini. */
    const genConfig = {
      temperature: conf.temperature,
      maxOutputTokens: 8192
    };
    if (conf.thinkingLevel) {
      genConfig.thinkingConfig = { thinkingLevel: conf.thinkingLevel };
    }

    const appelerApi = async (body) => {
      return await fetch(url, {
        method: "POST",
        // la clé en en-tête, pas dans l'URL : une URL finit dans les journaux et les proxys
        headers: { "Content-Type": "application/json", "x-goog-api-key": _cleApi },
        body: JSON.stringify(body)
      });
    };

    /* Un appel au modèle, avec ses secours : un réessai sur 500 / 503, et le
       repli sans `systemInstruction` si le modèle la refuse (HTTP 400) — repli
       gardé pour les tours suivants de la même question. */
    let sansSysteme = false;
    const demander = async (conv) => {
      const avecConsigne = () => {
        const alt = JSON.parse(JSON.stringify(conv));
        const partTexte = alt.length && alt[0].role === "user" && alt[0].parts.find(p => typeof p.text === "string");
        if (partTexte) partTexte.text = promptSysteme + "\n\n" + partTexte.text;
        return { contents: alt, generationConfig: genConfig };
      };
      const corps = sansSysteme ? avecConsigne()
        : { contents: conv, systemInstruction: { parts: [{ text: promptSysteme }] }, generationConfig: genConfig };
      let rep = await appelerApi(corps);

      /* RÉESSAI UNIQUE SUR 500 / 503. Ces codes sont transitoires côté Google —
         ils tombent aux pics de charge et repassent seuls. Une seconde tentative
         après 1,5 s évite de renvoyer à l'utilisateur une panne qui n'en est
         pas une. Au-delà, on abandonne : insister ne ferait qu'aggraver la file. */
      if (rep.status >= 500) {
        await new Promise(r => setTimeout(r, 1500));
        rep = await appelerApi(corps);
      }

      // Secours de repli si le modèle refuse `systemInstruction` (HTTP 400)
      if (rep.status === 400 && !sansSysteme) {
        sansSysteme = true;
        rep = await appelerApi(avecConsigne());
      }

      if (!rep.ok) {
        let errJson = {};
        try { errJson = await rep.json(); } catch (ignored) {}
        const msgErr = (errJson.error && errJson.error.message) ? errJson.error.message : ("Erreur HTTP " + rep.status);
        throw new Error(msgErr);
      }

      const donnees = await rep.json();
      let texte = "";
      if (donnees.candidates && donnees.candidates[0] && donnees.candidates[0].content && donnees.candidates[0].content.parts) {
        // Filtrer les parties de pensée interne (thought: true) si renvoyées par l'API
        let partsUtiles = donnees.candidates[0].content.parts.filter(p => !p.thought);
        if (partsUtiles.length === 0) partsUtiles = donnees.candidates[0].content.parts;
        texte = partsUtiles.map(p => p.text || "").join("");
      }
      return texte;
    };

    try {
      /* LA BOUCLE DES OUTILS DE LECTURE. Tant que le modèle demande des
         données par des blocs ```outil, la page les lui rend et il reprend.
         Ces tours ne vivent que dans `conv` : l'historique ne garde que la
         question et la réponse finale, avec la liste de ce qui a été lu. */
      const conv = contents.slice();
      const consultes = [];
      let texteReponse = await demander(conv);
      for (let tour = 1; tour <= OUTIL_TOURS; tour++) {
        const resultats = executerOutils(texteReponse, outils);
        if (!resultats) break;
        resultats.forEach(r => consultes.push(r.titre));
        _etape = resultats.map(r => r.titre).join(" · ");
        rendreMessages();
        conv.push({ role: "model", parts: [{ text: texteReponse }] });
        conv.push({ role: "user", parts: [{ text: "RÉSULTATS DES OUTILS :\n\n" +
          resultats.map(r => "### " + r.titre + "\n" + r.texte).join("\n\n") +
          (tour === OUTIL_TOURS ? "\n\nDERNIER TOUR : réponds maintenant avec ces données, sans nouveau bloc outil." : "") }] });
        texteReponse = await demander(conv);
      }
      texteReponse = texteReponse.replace(/```outil\s*\n[\s\S]*?```/g, "").trim();

      if (!texteReponse) {
        texteReponse = "*(Aucune réponse textuelle reçue du modèle)*";
      }

      /* Nettoyage : suppression d'une éventuelle réflexion préliminaire ou d'un
         monologue en anglais. Appliqué à tous les modèles — la fonction rend le
         texte inchangé dès que le premier paragraphe est déjà du français
         légitime, donc elle ne coûte rien quand il n'y a rien à retirer. */
      texteReponse = nettoyerReponseGemma(texteReponse);
      if (consultes.length) texteReponse = "*🔎 Consulté : " + [...new Set(consultes)].join(" · ") + "*\n\n" + texteReponse;

      _historique.push({
        role: "model",
        nomModele: getNomModele(_modele),
        parts: [{ text: texteReponse }]
      });

    } catch (e) {
      /* Le message de l'utilisateur est retiré de l'historique : l'API exige
         une alternance stricte question / réponse, et une question restée sans
         réponse ferait refuser tous les échanges suivants de la session. */
      if (_historique.length > 0 && _historique[_historique.length - 1].role === "user") {
        const perdu = _historique.pop();
        // Les pièces jointes reviennent avec la question : on renvoie d'un clic.
        if (perdu.pieces && perdu.pieces.length) { _pieces = perdu.pieces.concat(_pieces); rendrePieces(); }
      }
      console.error("Erreur appel IA / Google AI Studio :", e);
      const msgErr = String((e && e.message) ? e.message : e);
      if (errBanner) {
        const errTxt = document.getElementById("iaErrorText");
        if (errTxt) {
          if (msgErr.includes("API_KEY_INVALID") || msgErr.includes("API key not valid")) {
            errTxt.textContent = "Clé API Google AI Studio invalide. Vérifiez votre clé ou générez-en une nouvelle.";
          } else if (msgErr.includes("Failed to fetch")) {
            errTxt.textContent = "Pas de réponse de Google AI Studio : ce poste a-t-il un accès réseau ?";
          } else {
            errTxt.textContent = "Erreur IA : " + msgErr;
          }
        }
        errBanner.hidden = false;
      }

      /* LA QUESTION EST RENDUE À SON AUTEUR. La zone de saisie a été vidée au
         départ de l'envoi ; sans ce retour, une coupure réseau, un quota
         dépassé ou une clé refusée feraient perdre le texte tapé. On le
         réinjecte et on replace le curseur : l'utilisateur renvoie d'un clic,
         ou change de modèle, sans rien retaper. */
      _questionEnAttente = q;
      const inputEl = document.getElementById("iaInput");
      if (inputEl) {
        inputEl.value = q;
        inputEl.style.height = "auto";
        inputEl.focus();
      }
    } finally {
      _enAttente = false;
      _etape = "";
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
  window.iaOuvrir = async function() {
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
      // 1. Tenter depuis la session courante
      try {
        const stocke = sessionStorage.getItem("cao_ia_cle");
        if (stocke) _cleApi = stocke;
      } catch (_) {}

      // 2. Tenter depuis le serveur local (/api/ia/cle)
      if (!_cleApi) {
        try {
          const resp = await fetch("/api/ia/cle");
          if (resp.ok) {
            const data = await resp.json();
            if (data && data.dispo && data.cle) {
              _cleApi = data.cle;
            }
          }
        } catch (_) {}
      }
    }

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
  window.iaContexte = extraireContexteCao;   // ce qui part avec chaque question, comme dans WEB_ANTENNA
  window.iaOutils = outilsLecture;           // les outils de lecture de l'éditeur ouvert (console, bancs)
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
