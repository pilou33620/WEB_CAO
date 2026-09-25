/* =============================================================================
   commun/simulation-datasheet.js
   DE LA DATASHEET AUX RÉGLAGES DES SIMULATIONS
   -----------------------------------------------------------------------------
   L'assistant IA lit une datasheet (PDF joint) et propose des valeurs pour les
   simulations. Ce fichier est tout ce qui se trouve entre sa réponse et le
   panneau : la LISTE FERMÉE de ce qui peut être réglé, dans quelle unité, entre
   quelles bornes, et le geste qui l'applique proprement — fiche ΔI remise à
   jour, résultat devenu faux oublié, onglet redessiné.

   POURQUOI UNE LISTE FERMÉE. Un modèle de langage qui écrirait directement dans
   `SIM_PDN` ou `SIM.saisie` pourrait poser n'importe quelle clé, dans n'importe
   quelle unité : un 12,5 lu en mA et posé dans un champ en ampères ne produit
   ni refus ni champ vide, seulement un facteur mille. Ici chaque clé a son
   unité ÉCRITE dans le catalogue que l'IA reçoit, et une valeur hors des bornes
   physiques est refusée avant même d'être proposée.

   RIEN NE S'APPLIQUE SANS ÊTRE VU. `simDsPreparer` rend des lignes — valeur
   actuelle, valeur proposée, page et citation de la datasheet — que
   l'assistant affiche en tableau à cocher. Seules les lignes cochées passent
   par `simDsAppliquer`. Un LLM confond volontiers typique et max, ou lit la
   colonne voisine : la citation est là pour que cela se voie.

   Chargé après commun/simulation-em.js, dans l'éditeur PCB et la visionneuse
   IPC-2581. L'assistant ne s'en sert que si `simDsCatalogue` existe.
   ============================================================================= */

/* Un nombre écrit par un humain ou par un modèle : virgule décimale, espaces
   de milliers. NaN pour tout le reste, jamais zéro. */
function simDsNb(t) {
  if (typeof t === "number") return t;
  const s = String(t == null ? "" : t).trim().replace(/[\s  ]/g, "").replace(",", ".");
  return s === "" ? NaN : Number(s);
}

/* L'écriture d'une valeur dans la table : pas de douze décimales parasites. */
function simDsTexte(v) {
  if (v == null || v === "") return "—";
  if (typeof v !== "number") return String(v);
  if (!isFinite(v)) return "—";
  return String(Number(v.toPrecision(6))).replace(".", ",");
}

/* LES BORNES DE LA FICHE DE CHARGE. `SIM_PDN_FICHE` dit où trouver chaque
   valeur ; il ne dit pas ce qui est physiquement plausible, et c'est ce qui
   arrête un courant de veille recopié en mA dans un champ en µA. */
const SIM_DS_BORNES_FICHE = {
  fClkMHz:      [0.001, 10000],
  iActifMa:     [0, 200000],
  iVeilleUa:    [0, 1e6],
  tReveilUs:    [0.001, 1e5],
  nSorties:     [0, 1024],
  tMonteeNs:    [0.01, 1000],
  cSortiePf:    [0, 1000],
  iSortieMaxMa: [0, 2000],
  vddMinV:      [0, 60]
};

/* ==========================================================================
   LE CATALOGUE : un groupe par simulation, un champ par réglage.
   --------------------------------------------------------------------------
   `f` : ce que vaut une unité du catalogue dans l'unité stockée (ns → s :
   1e-9). `lire` / `ecrire` travaillent dans l'unité STOCKÉE ; la conversion
   n'est écrite qu'ici, dans `simDsLire` / `simDsEcrire`.
   `ou` part tel quel dans le prompt : c'est la consigne de lecture, écrite une
   fois, au même endroit que la clé qu'elle renseigne.
   ========================================================================== */
function simDsGroupes() {
  const S_ = () => SIM.saisie;
  const fiche = (typeof SIM_PDN_FICHE !== "undefined" ? SIM_PDN_FICHE : []).map(c => ({
    cle: c.cle, lib: c.lib, unite: c.unite,
    min: (SIM_DS_BORNES_FICHE[c.cle] || [0, 1e9])[0],
    max: (SIM_DS_BORNES_FICHE[c.cle] || [0, 1e9])[1],
    entier: c.cle === "nSorties",
    ou: c.ou,
    lire: () => { const f = SIM_PDN.fiche; return f ? f[c.cle] : c.defaut; },
    suppose: () => { const f = SIM_PDN.fiche; return !f || !!(f.suppose && f.suppose[c.cle]); },
    ecrire: v => { simDsFicheOuverte(); simPDNFicheModifier(c.cle, String(v)); }
  }));

  return [
    { cle: "pdn_fiche", ana: "pdn",
      nom: "PI · Z(ω) PDN — fiche de la charge (assistant ΔI)",
      quoi: "Datasheet du composant ALIMENTÉ par le rail (MCU, FPGA, CI logique). Ces valeurs donnent ΔI et la fréquence de chaque appel de courant.",
      champs: fiche },

    { cle: "pdn", ana: "pdn",
      nom: "PI · Z(ω) PDN — cible, régulateur, stratifié",
      quoi: "Vdd et tolérance : datasheet de la charge. R_vrm et f_vrm : datasheet du RÉGULATEUR. εr et tanδ : datasheet du STRATIFIÉ.",
      champs: [
        { cle: "vdd", lib: "Tension nominale du rail", unite: "V", min: 0.3, max: 60,
          ou: "VDD typique de la charge, ou tension de sortie du régulateur.",
          lire: () => SIM_PDN.vdd, ecrire: v => { SIM_PDN.vdd = v; } },
        { cle: "ripplePct", lib: "Ondulation admise", unite: "%", min: 0.1, max: 30,
          ou: "Tolérance d'alimentation de la charge : (VDD nominal − VDD min) / VDD nominal × 100. Ex. « 3,0 à 3,6 V » sur 3,3 V → 9. Pour un ADC, une PLL ou une référence : l'ondulation d'alimentation admise si la datasheet la donne.",
          lire: () => SIM_PDN.ripplePct, ecrire: v => { SIM_PDN.ripplePct = v; } },
        { cle: "deltaIA", lib: "ΔI transitoire (saisie directe)", unite: "A", min: 0.0001, max: 500,
          ou: "UNIQUEMENT si la datasheet donne explicitement un saut de courant transitoire (« load step », « dynamic current »). Sinon, remplis la fiche de la charge : l'assistant ΔI le déduit.",
          lire: () => SIM_PDN.deltaIA, ecrire: v => { SIM_PDN.deltaIA = v; SIM_PDN.deltaIManuel = true; } },
        { cle: "rVrmMOhm", lib: "Résistance de sortie du régulateur (R_vrm)", unite: "mΩ", min: 0.01, max: 5000,
          ou: "Datasheet du régulateur : « load regulation » ΔVout / ΔIout (ex. 10 mV pour 1 A → 10 mΩ), ou impédance de sortie en basse fréquence.",
          lire: () => SIM_PDN.rVrmMOhm, ecrire: v => { SIM_PDN.rVrmMOhm = v; } },
        { cle: "fVrmKhz", lib: "Bande passante de la boucle du régulateur (f_vrm)", unite: "kHz", min: 0.1, max: 20000,
          ou: "Datasheet du régulateur : fréquence de croisement de boucle (« crossover », « loop bandwidth »). À défaut, pour un buck : fréquence de découpage / 10 ; pour un LDO : fréquence où le PSRR ou l'impédance de sortie commence à remonter.",
          lire: () => SIM_PDN.fVrmKhz, ecrire: v => { SIM_PDN.fVrmKhz = v; } },
        { cle: "planEr", lib: "εr du diélectrique de la cavité", unite: "", min: 1, max: 15,
          ou: "Datasheet du stratifié : Dk à 1 GHz (ou la fréquence la plus proche).",
          lire: () => SIM_PDN.planEr, ecrire: v => { SIM_PDN.planEr = v; } },
        { cle: "planTanD", lib: "tanδ du diélectrique de la cavité", unite: "", min: 0, max: 0.2,
          ou: "Datasheet du stratifié : Df (dissipation factor) à 1 GHz.",
          lire: () => SIM_PDN.planTanD, ecrire: v => { SIM_PDN.planTanD = v; } }
      ] },

    { cle: "si", ana: "impedance",
      nom: "SI · Impédance, Z différentielle, crosstalk, retour, santé liaison",
      quoi: "Datasheet du DRIVER (temps de montée, niveaux) et du RÉCEPTEUR (seuils), ou norme de l'interface (USB, Ethernet, DDR, LVDS…) pour les impédances visées.",
      champs: [
        { cle: "tr", lib: "Temps de montée du driver (10-90 %)", unite: "ns", f: 1e-9, min: 0.005, max: 10000,
          ou: "Caractéristiques AC des sorties : « rise time » tr / « output transition time », au réglage de vitesse et à la charge les plus proches du projet. Prends le plus RAPIDE (min) : c'est le pire cas pour le couplage.",
          lire: () => S_().tr, ecrire: v => { S_().tr = v; } },
        { cle: "swing", lib: "Amplitude du signal (crête à crête)", unite: "V", min: 0.05, max: 60,
          ou: "VOH − VOL du driver, ou tension d'alimentation des E/S (VDDIO) en CMOS ; différentiel : VOD.",
          lire: () => S_().swing, ecrire: v => { S_().swing = v; } },
        { cle: "marge", lib: "Marge de bruit du récepteur", unite: "mV", f: 1e-3, min: 1, max: 20000,
          ou: "La plus petite de (VIL max − VOL max) et (VOH min − VIH min), driver et récepteur réunis.",
          lire: () => S_().marge, ecrire: v => { S_().marge = v; } },
        { cle: "cible", lib: "Impédance visée, piste simple", unite: "Ω", min: 10, max: 200,
          ou: "Impédance recommandée par la datasheet ou la norme de l'interface (ex. 50 Ω, 40 Ω DDR).",
          lire: () => S_().cible, ecrire: v => { S_().cible = v; } },
        { cle: "tolPct", lib: "Tolérance sur l'impédance simple", unite: "%", min: 0, max: 50,
          ou: "Tolérance donnée avec l'impédance visée (ex. « 50 Ω ±10 % » → 10).",
          lire: () => S_().tolPct, ecrire: v => { S_().tolPct = v; } },
        { cle: "cibleDiff", lib: "Impédance différentielle visée", unite: "Ω", min: 20, max: 300,
          ou: "Impédance différentielle de l'interface (USB 90 Ω, Ethernet / LVDS 100 Ω, HDMI 100 Ω…).",
          lire: () => S_().cibleDiff, ecrire: v => { S_().cibleDiff = v; } },
        { cle: "tolDiffPct", lib: "Tolérance sur l'impédance différentielle", unite: "%", min: 0, max: 50,
          ou: "Tolérance donnée avec l'impédance différentielle (ex. « 90 Ω ±15 % » → 15).",
          lire: () => S_().tolDiffPct, ecrire: v => { S_().tolDiffPct = v; } },
        { cle: "fc", lib: "Fréquence d'intérêt (f₀)", unite: "MHz", f: 1e6, min: 0.001, max: 100000,
          ou: "Fréquence fondamentale du signal : horloge max, ou débit / 2 pour une liaison série (ex. 480 Mbit/s → 240).",
          lire: () => S_().fc, ecrire: v => { S_().fc = v; } }
      ] },

    { cle: "bus", ana: "bus",
      nom: "SI · Bus synchrone (setup / hold)",
      quoi: "tco : datasheet de l'ÉMETTEUR (clock-to-output). tsu / th : datasheet du RÉCEPTEUR (exigences). La fréquence : celle du projet, bornée par la datasheet.",
      champs: [
        { cle: "protocole", lib: "Protocole", unite: "", choix: Object.keys(typeof SIM_BUS_PROTOCOLES !== "undefined" ? SIM_BUS_PROTOCOLES : {}),
          ou: "Le type d'interface décrit par la datasheet.",
          lire: () => SIM_BUS.protocole, ecrire: v => { SIM_BUS.protocole = v; } },
        { cle: "freqMhz", lib: "Fréquence d'horloge du bus", unite: "MHz", min: 0.0001, max: 10000,
          ou: "Fréquence de travail du projet ; à défaut, fréquence max de l'interface (fSCK max, fCLK max).",
          lire: () => SIM_BUS.freqMhz, ecrire: v => { SIM_BUS.freqMhz = v; } },
        { cle: "tsu", lib: "Temps de setup exigé par le récepteur", unite: "ns", min: -10, max: 10000,
          ou: "Datasheet du RÉCEPTEUR : tSU / « data setup time », valeur MIN exigée.",
          lire: () => SIM_BUS.tsu, ecrire: v => { SIM_BUS.tsu = v; } },
        { cle: "th", lib: "Temps de hold exigé par le récepteur", unite: "ns", min: -10, max: 10000,
          ou: "Datasheet du RÉCEPTEUR : tH / « data hold time », valeur MIN exigée.",
          lire: () => SIM_BUS.th, ecrire: v => { SIM_BUS.th = v; } },
        { cle: "tcoMin", lib: "Clock-to-output min de l'émetteur", unite: "ns", min: -50, max: 10000,
          ou: "Datasheet de l'ÉMETTEUR : tCO / tV / « output valid » / « output hold », valeur MIN.",
          lire: () => SIM_BUS.tcoMin, ecrire: v => { SIM_BUS.tcoMin = v; } },
        { cle: "tcoMax", lib: "Clock-to-output max de l'émetteur", unite: "ns", min: -50, max: 10000,
          ou: "Datasheet de l'ÉMETTEUR : tCO / tV / « output valid », valeur MAX.",
          lire: () => SIM_BUS.tcoMax, ecrire: v => { SIM_BUS.tcoMax = v; } },
        { cle: "rpuK", lib: "Résistance de tirage I2C", unite: "kΩ", min: 0.1, max: 1000,
          ou: "I2C uniquement : valeur de pull-up recommandée ou posée sur le schéma.",
          lire: () => SIM_BUS.rpuK, ecrire: v => { SIM_BUS.rpuK = v; } },
        { cle: "baudrate", lib: "Débit UART", unite: "bit/s", min: 300, max: 1e8, entier: true,
          ou: "UART uniquement : débit utilisé.",
          lire: () => SIM_BUS.baudrate, ecrire: v => { SIM_BUS.baudrate = v; } }
      ] },

    { cle: "dc", ana: "dc",
      nom: "PI · Chute DC (IR drop, échauffement)",
      quoi: "Budgets : tolérance de la charge. Conductivité : datasheet du stratifié. Courants et tensions des bornes : voir « bornes_dc ».",
      champs: [
        { cle: "chute", lib: "Chute admise à la charge", unite: "%", min: 0.1, max: 50,
          ou: "Marge entre la tension de source et VDD min de la charge, en % de la source (ex. source 3,3 V, VDD min 3,0 V → 9). Garde de la place pour l'ondulation.",
          lire: () => SIM.dcBudget.chute, ecrire: v => { SIM.dcBudget.chute = v; } },
        { cle: "dt", lib: "Échauffement admis", unite: "°C", min: 1, max: 200,
          ou: "Rarement dans une datasheet ; seulement si une exigence d'échauffement du cuivre est donnée.",
          lire: () => SIM.dcBudget.dt, ecrire: v => { SIM.dcBudget.dt = v; } },
        { cle: "ambiante", lib: "Température ambiante", unite: "°C", min: -60, max: 200,
          ou: "Température ambiante de fonctionnement max visée (ex. plage industrielle −40…85 °C → 85).",
          lire: () => SIM.dcAmbiante, ecrire: v => { SIM.dcAmbiante = v; } },
        { cle: "lambda", lib: "Conductivité thermique du stratifié (dans le plan)", unite: "W/(m·K)", min: 0.05, max: 500,
          ou: "Datasheet du stratifié : « thermal conductivity », valeur dans le plan (x-y) si elle est donnée.",
          lire: () => { const v = simDsNb(SIM.dcLambda); return isFinite(v) ? v : null; },
          ecrire: v => { SIM.dcLambda = simNbLibre(v); } }
      ] }
  ];
}

function simDsGroupe(cle) {
  return simDsGroupes().find(g => g.cle === cle) || null;
}
function simDsChamp(groupe, cle) {
  const g = typeof groupe === "string" ? simDsGroupe(groupe) : groupe;
  return g ? (g.champs.find(c => c.cle === cle) || null) : null;
}
// La valeur d'un champ, dans l'unité du CATALOGUE.
function simDsLire(ch) {
  try {
    const v = ch.lire();
    if (typeof v === "number") return isFinite(v) ? v / (ch.f || 1) : null;
    return v == null ? null : v;
  } catch (_) { return null; }
}
function simDsEcrire(ch, v) {
  ch.ecrire(typeof v === "number" ? v * (ch.f || 1) : v);
}

/* La fiche de la charge doit exister pour qu'on la remplisse : sans elle,
   `simPDNFicheModifier` refuse tout, et le panneau PDN ne l'a construite que
   s'il a déjà été rendu avec l'assistant ΔI. */
function simDsFicheOuverte() {
  if (!SIM_PDN.fiche) {
    const info = SIM_PDN.chargeInfo || { ref: SIM_PDN.portRef };
    SIM_PDN.fiche = simPDNFicheCharger(info);
    SIM_PDN.evenements = simPDNEvenementsDepuisFiche(SIM_PDN.fiche, info.ref, SIM_PDN.evenements);
  }
  return SIM_PDN.fiche;
}

/* ==========================================================================
   LES COLLECTIONS : ce qui se règle composant par composant.
   ========================================================================== */

/* Les bornes de la chute DC. L'éditeur les attache à leur composant
   (`compRef`) ; la visionneuse ne connaît que leur nom, qui commence par le
   repère (« U7 VDD », « U7.12 »). */
function simDsBornes() {
  try { return (SIM_ED && typeof SIM_ED.dcBornes === "function") ? (SIM_ED.dcBornes() || []) : []; }
  catch (_) { return []; }
}
function simDsBorneDe(b, ref) {
  const r = String(ref || "").trim().toUpperCase();
  if (!r) return false;
  if (b.compRef) return String(b.compRef).toUpperCase() === r;
  const n = String(b.nom || "").toUpperCase();
  return n === r || (n.startsWith(r) && /[^A-Z0-9]/.test(n.charAt(r.length)));
}

/* Les condensateurs visés par une entrée : une liste de repères, un MPN, ou
   une valeur (« 100nF »), éventuellement restreinte à un boîtier. */
function simDsCapasVisees(e) {
  const capas = SIM_PDN.condensateurs || [];
  const refs = (Array.isArray(e.refs) ? e.refs : (e.ref ? [e.ref] : [])).map(r => String(r).trim().toUpperCase());
  if (refs.length) return capas.filter(c => refs.includes(String(c.ref || "").toUpperCase()));
  if (e.mpn) {
    const m = String(e.mpn).trim().toUpperCase();
    return capas.filter(c => String(c.mpn || "").trim().toUpperCase() === m);
  }
  if (e.valeur) {
    const v = simPDNParseFarads(e.valeur);
    if (!(v > 0)) return [];
    const pkg = String(e.boitier || "").trim();
    return capas.filter(c => Math.abs((c.cap || simPDNParseFarads(c.val)) - v) <= v * 0.02 &&
                             (!pkg || String(c.pkg || "").indexOf(pkg) >= 0));
  }
  return [];
}

const SIM_DS_CHAMPS_CAPA = [
  { cle: "esr_mohm", lib: "ESR", unite: "mΩ", f: 1e-3, min: 0.1, max: 10000, prop: "esr" },
  { cle: "esl_nh",   lib: "ESL", unite: "nH", f: 1e-9, min: 0.01, max: 50,   prop: "esl" },
  { cle: "cap_nf",   lib: "Capacité effective", unite: "nF", f: 1e-9, min: 0.0001, max: 1e7, prop: "cap" }
];

/* LES PARASITES LUS DANS UNE DATASHEET SURVIVENT À LA DÉTECTION. « ⚡ Détecter »
   refabrique la liste des condensateurs depuis la carte ; sans mémoire, l'ESL
   relevée page 12 retomberait sur la valeur typique du boîtier au premier
   rescannage. On garde donc, dans le profil, ce que la datasheet a dit — par
   MPN, parce qu'un 100 nF 0402 d'un fabricant n'est pas celui d'un autre. Sans
   MPN, la valeur ne vaut que pour la session, et le tableau le dit. */
function simDsCapasProfil() {
  return (typeof profLire === "function") ? (profLire("dsCapas") || {}) : {};
}
function simDsCapaMemoriser(c) {
  const mpn = String(c.mpn || "").trim().toUpperCase();
  if (!mpn || typeof profEcrire !== "function") return false;
  const tout = simDsCapasProfil();
  tout[mpn] = { cap: c.cap, esr: c.esr, esl: c.esl };
  return profEcrire("dsCapas", tout);
}
function simDsCapaF0(c) {
  const l = (c.esl || 0) + (c.lMount || 0);
  return (c.cap > 0 && l > 0) ? parseFloat((1 / (2 * Math.PI * Math.sqrt(l * c.cap)) * 1e-6).toFixed(1)) : c.f0;
}
// Rappelé par simPDNActualiserComposants, après chaque détection.
function simDsReappliquerCapas(capas) {
  const tout = simDsCapasProfil();
  let n = 0;
  for (const c of (capas || [])) {
    const s = tout[String(c.mpn || "").trim().toUpperCase()];
    if (!s) continue;
    if (s.cap > 0) c.cap = s.cap;
    if (s.esr > 0) c.esr = s.esr;
    if (s.esl > 0) c.esl = s.esl;
    c.prov = "datasheet";
    c.f0 = simDsCapaF0(c);
    n++;
  }
  return n;
}

/* ==========================================================================
   CE QUE L'IA REÇOIT : le catalogue, les valeurs en cours, et les cibles.
   ========================================================================== */
function simDsCatalogue() {
  const L = [];
  L.push("CATALOGUE DES PARAMÈTRES DE SIMULATION RÉGLABLES (clé — unité — valeur actuelle — où la lire) :");
  for (const g of simDsGroupes()) {
    L.push("");
    L.push("[" + g.cle + "] " + g.nom + ". " + g.quoi);
    for (const c of g.champs) {
      const act = simDsLire(c);
      const sup = (typeof c.suppose === "function" && c.suppose()) ? ", supposée" : "";
      const u = c.choix ? "un de : " + c.choix.join(", ") : (c.unite || "sans unité");
      L.push("- " + g.cle + "." + c.cle + " (" + u + ") [actuel : " + simDsTexte(act) + sup + "] " +
             c.lib + ". Où : " + c.ou);
    }
  }

  L.push("");
  L.push("[condensateurs] Parasites des condensateurs de découplage du rail PDN, par repère, MPN ou valeur. " +
         "Champs : esr_mohm (mΩ, à la fréquence de résonance), esl_nh (nH), cap_nf (nF, capacité EFFECTIVE sous la tension du rail si la datasheet donne la courbe DC-bias).");
  const capas = SIM_PDN.condensateurs || [];
  if (capas.length) {
    const lignes = capas.slice(0, 40).map(c => c.ref + " " + (c.val || "") + " " + (c.pkg || "") +
      (c.mpn ? " MPN " + c.mpn : "") + " (ESR " + simDsTexte((c.esr || 0) * 1e3) + " mΩ, ESL " +
      simDsTexte((c.esl || 0) * 1e9) + " nH, " + (c.prov || "defaut") + ")");
    L.push("Condensateurs du rail " + (SIM_PDN.rail || "?") + " : " + lignes.join(" ; ") +
           (capas.length > 40 ? " ; … (" + capas.length + " au total)" : ""));
  } else {
    L.push("Aucun condensateur détecté pour l'instant (rail PDN non choisi ?).");
  }

  L.push("");
  L.push("[bornes_dc] Bornes de la chute DC, par repère de composant. Champs : courant_ma (charge : courant TOTAL tiré par le composant sur ce rail, en mA, réparti ensuite sur ses broches) ou tension_v (source : tension imposée, en V).");
  const bornes = simDsBornes();
  if (bornes.length) {
    L.push("Bornes posées : " + bornes.map(b => (b.role === "source" ? "source " : "charge ") +
      (b.compRef || b.nom) + " = " + simDsTexte(b.valeur) + (b.role === "source" ? " V" : " A")).join(" ; "));
  } else {
    L.push("Aucune borne DC posée pour l'instant.");
  }

  L.push("");
  const ci = SIM_PDN.chargeInfo || {};
  L.push("Charge du rail PDN (la fiche pdn_fiche la décrit) : " +
         (ci.ref || SIM_PDN.portRef || "non détectée") + (ci.cle && ci.cle !== ci.ref ? " (" + ci.cle + ")" : "") +
         ", rail " + (SIM_PDN.rail || "non choisi") + ".");
  if (SIM_BUS.comp1 || SIM_BUS.comp2)
    L.push("Bus synchrone : " + (SIM_BUS.comp1 || "?") + " → " + (SIM_BUS.comp2 || "?") + ", protocole " + SIM_BUS.protocole + ".");
  return L.join("\n");
}

/* ==========================================================================
   LA PROPOSITION DE L'IA, VÉRIFIÉE LIGNE PAR LIGNE
   --------------------------------------------------------------------------
   `act` : {type:"sim_params", source, composant,
            valeurs:[{sim, cle, valeur, page, citation, confiance}],
            condensateurs:[{refs|mpn|valeur, boitier?, esr_mohm, esl_nh, cap_nf, page, citation}],
            bornes_dc:[{composant, courant_ma | tension_v, page, citation}]}
   Rend {lignes, avertissements}. Une ligne refusée (`ok` faux) reste dans la
   table avec son motif : taire un refus laisserait croire que la valeur a été
   oubliée par l'IA, alors qu'elle a été écartée ici.
   ========================================================================== */
function simDsPreparer(act) {
  act = act || {};
  const lignes = [], avert = [];
  let id = 0;
  const trace = e => ({ page: e.page != null ? String(e.page) : "", citation: String(e.citation || "").slice(0, 240),
                        confiance: String(e.confiance || "") });
  const borner = (ch, v) => {
    if (ch.choix) return ch.choix.includes(String(v)) ? "" : "valeur hors liste (" + ch.choix.join(", ") + ")";
    if (!isFinite(v)) return "valeur illisible";
    if (v < ch.min || v > ch.max) return "hors des bornes plausibles (" + simDsTexte(ch.min) + " … " + simDsTexte(ch.max) + " " + ch.unite + ")";
    return "";
  };

  for (const e of (Array.isArray(act.valeurs) ? act.valeurs : [])) {
    const g = simDsGroupe(String(e.sim || "").trim());
    const ch = g && simDsChamp(g, String(e.cle || "").trim());
    const l = Object.assign({ id: id++, genre: "champ", sim: e.sim, cle: e.cle, ana: g ? g.ana : "",
                              groupe: g ? g.nom : String(e.sim || "?") }, trace(e));
    if (!ch) {
      Object.assign(l, { lib: String(e.cle || "?"), unite: "", actuel: null, nouveau: e.valeur, ok: false,
                         motif: "paramètre inconnu du catalogue" });
    } else {
      const v = ch.choix ? String(e.valeur).trim() : simDsNb(e.valeur);
      const nv = (ch.entier && isFinite(v)) ? Math.round(v) : v;
      const motif = borner(ch, nv);
      Object.assign(l, { lib: ch.lib, unite: ch.unite, actuel: simDsLire(ch), nouveau: nv, ok: !motif, motif: motif });
      if (l.ok && typeof l.actuel === "number" && l.actuel === nv) { l.ok = false; l.motif = "déjà à cette valeur"; }
    }
    lignes.push(l);
  }

  for (const e of (Array.isArray(act.condensateurs) ? act.condensateurs : [])) {
    const visees = simDsCapasVisees(e);
    const qui = (Array.isArray(e.refs) && e.refs.length) ? e.refs.join(", ") : (e.mpn || e.valeur || "?");
    for (const def of SIM_DS_CHAMPS_CAPA) {
      if (e[def.cle] == null) continue;
      const v = simDsNb(e[def.cle]);
      const l = Object.assign({ id: id++, genre: "capa", sim: "condensateurs", cle: def.cle, ana: "pdn",
                                groupe: "PI · Condensateurs " + qui, lib: def.lib + " (" + (visees.length || 0) + " condensateur" + (visees.length > 1 ? "s" : "") + ")",
                                unite: def.unite, cible: e, def: def,
                                actuel: visees.length ? (visees[0][def.prop] || 0) / def.f : null, nouveau: v }, trace(e));
      l.motif = !visees.length ? "aucun condensateur du rail ne correspond" : borner(def, v);
      l.ok = !l.motif;
      if (l.ok && !visees.some(c => c.mpn)) l.note = "sans MPN : valable pour cette session seulement";
      lignes.push(l);
    }
  }

  const bornes = simDsBornes();
  for (const e of (Array.isArray(act.bornes_dc) ? act.bornes_dc : [])) {
    const ref = String(e.composant || "").trim();
    const siennes = bornes.filter(b => simDsBorneDe(b, ref));
    const estSource = e.tension_v != null;
    const role = estSource ? "source" : "charge";
    const miennes = siennes.filter(b => b.role === role);
    const v = simDsNb(estSource ? e.tension_v : e.courant_ma);
    const l = Object.assign({ id: id++, genre: "borne", sim: "bornes_dc", cle: role, ana: "dc", ref: ref, role: role,
                              groupe: "PI · Chute DC — " + (ref || "?"),
                              lib: (estSource ? "Tension de la source " : "Courant total de la charge ") + ref +
                                   (miennes.length > 1 ? " (" + miennes.length + " broches)" : ""),
                              unite: estSource ? "V" : "mA",
                              actuel: miennes.length ? (estSource ? miennes[0].valeur
                                : miennes.reduce((s, b) => s + (b.valeur || 0), 0) * 1e3) : null,
                              nouveau: v }, trace(e));
    const bornesV = estSource ? [0.1, 1000] : [0.000001, 1e6];
    l.motif = !miennes.length ? "aucune borne « " + role + " » posée sur " + (ref || "?") + " (Chute DC → ⚡ Du schéma)"
      : (!isFinite(v) ? "valeur illisible" : (v < bornesV[0] || v > bornesV[1] ? "hors des bornes plausibles" : ""));
    l.ok = !l.motif;
    lignes.push(l);
  }

  /* LA FICHE DÉCRIT UN COMPOSANT, ET UN SEUL : celui que le rail alimente.
     Une datasheet de régulateur ou d'un autre CI qui remplirait la fiche d'un
     MCU donnerait un ΔI faux sous un nom juste. On le signale, sans bloquer :
     la charge détectée peut être la mauvaise, et c'est à l'utilisateur de
     trancher. */
  const ci = SIM_PDN.chargeInfo || {};
  const chargeRef = String(ci.ref || SIM_PDN.portRef || "").toUpperCase();
  const comp = String(act.composant || "").trim().toUpperCase();
  if (lignes.some(l => l.sim === "pdn_fiche" && l.ok) && comp && chargeRef && comp !== chargeRef &&
      comp !== String(ci.cle || "").toUpperCase())
    avert.push("La fiche PDN décrit " + chargeRef + " (charge détectée du rail " + (SIM_PDN.rail || "?") +
               "), mais la datasheet concerne " + act.composant + ". Vérifiez le rail ou le point observé avant d'appliquer.");
  if (lignes.some(l => l.sim === "pdn_fiche" && l.ok) && !chargeRef)
    avert.push("Aucune charge détectée pour le PDN : la fiche sera remplie, mais choisissez d'abord le rail pour qu'elle soit mémorisée pour ce composant.");
  if (lignes.some(l => l.sim === "pdn" && l.cle === "deltaIA" && l.ok) && lignes.some(l => l.sim === "pdn_fiche" && l.ok))
    avert.push("ΔI saisi directement ET fiche de la charge : cocher ΔI le fige à la main, l'assistant ne le déduira plus de la fiche.");

  return { lignes: lignes, avertissements: avert, source: String(act.source || ""), composant: String(act.composant || "") };
}

/* ==========================================================================
   L'APPLICATION
   --------------------------------------------------------------------------
   `ids` : les lignes cochées. Chaque simulation touchée est ensuite remise
   d'aplomb — un seul endroit sait ce qu'un changement invalide :
     · SI : une f₀ nouvelle rend faux le résultat d'impédance, un front
       nouveau celui du crosstalk ; amplitude, marge et cibles ne changent que
       le verdict.
     · PDN : Z(ω) se recalcule en local, en quelques millisecondes.
     · Bus : même chose.
     · DC : le résultat est gardé ; la fiche dit déjà quand λ a changé depuis.
   ========================================================================== */
function simDsAppliquer(prep, ids) {
  const coches = new Set(ids || []);
  const fait = [], touche = new Set(), anas = [];
  const journal = [];
  let oublierZ = false, oublierXt = false;
  const messages = [];

  /* SANS L'ASSISTANT, LA FICHE NE SERT À RIEN : ΔI reste celui saisi à la
     main, et les valeurs qu'on applique ne compteraient nulle part. Qui donne
     une datasheet pour régler la charge veut qu'elle compte. On l'allume AVANT
     d'écrire : l'allumer rend ΔI à l'assistant, et un ΔI coché dans la même
     proposition doit pouvoir le reprendre ensuite. */
  const lignesCochees = ((prep && prep.lignes) || []).filter(l => l.ok && coches.has(l.id));
  if (lignesCochees.some(l => l.sim === "pdn_fiche") &&
      typeof simPDNAssistantActif === "function" && !simPDNAssistantActif()) {
    simPDNBasculerAssistant(true);
    messages.push("Assistant ΔI activé : ΔI est maintenant déduit de la fiche de la charge.");
  }

  for (const l of lignesCochees) {
    try {
      if (l.genre === "champ") {
        const ch = simDsChamp(l.sim, l.cle);
        if (!ch) continue;
        simDsEcrire(ch, l.nouveau);
        if (l.sim === "si" && l.cle === "fc") oublierZ = true;
        if (l.sim === "si" && l.cle === "tr") oublierXt = true;
      } else if (l.genre === "capa") {
        for (const c of simDsCapasVisees(l.cible)) {
          c[l.def.prop] = l.nouveau * l.def.f;
          c.prov = "datasheet";
          c.f0 = simDsCapaF0(c);
          simDsCapaMemoriser(c);
        }
      } else if (l.genre === "borne") {
        const bornes = simDsBornes();
        const miennes = bornes.map((b, k) => ({ b: b, k: k }))
          .filter(o => o.b.role === l.role && simDsBorneDe(o.b, l.ref));
        if (!miennes.length) continue;
        // Le courant TOTAL du composant, partagé également entre ses broches.
        const parBorne = l.role === "source" ? l.nouveau : (l.nouveau * 1e-3) / miennes.length;
        for (const o of miennes) {
          if (SIM_ED && typeof SIM_ED.dcValeur === "function") SIM_ED.dcValeur(o.k, parBorne);
          else o.b.valeur = parBorne;
          o.b.provenance = "datasheet";
          if (l.role === "charge") o.b.unite = parBorne < 0.001 ? "µA" : (parBorne < 1 ? "mA" : "A");
        }
      }
      fait.push(l);
      touche.add(l.sim);
      if (l.ana && !anas.includes(l.ana)) anas.push(l.ana);
      journal.push({ quand: Date.now(), source: prep.source, sim: l.sim, cle: l.cle, lib: l.lib,
                     valeur: l.nouveau, unite: l.unite, page: l.page, citation: l.citation });
    } catch (err) {
      l.motif = "échec : " + (err && err.message ? err.message : err);
    }
  }
  SIM_DS.journal = SIM_DS.journal.concat(journal).slice(-200);

  if (touche.has("pdn_fiche") && !SIM_PDN.deltaIManuel) simPDNSynchroDeltaI();

  if (touche.has("si")) {
    if (oublierZ && typeof simOublierRes === "function") simOublierRes();
    if (oublierXt && typeof simXtOublier === "function") simXtOublier();
    if (typeof document !== "undefined" && typeof simSaisieEcrire === "function") simSaisieEcrire();
    if (oublierZ || oublierXt) messages.push("Fréquence ou front modifié : relancez le calcul SI concerné.");
  }
  if (touche.has("pdn") || touche.has("pdn_fiche") || touche.has("condensateurs")) {
    SIM_PDN.result = null;
    simCalculerPDN();
  }
  if (touche.has("bus") && typeof simBusCalculer === "function") {
    try { simBusCalculer(); } catch (_) {}
  }
  if (touche.has("bornes_dc") || (touche.has("dc") && fait.some(l => l.sim === "dc" && l.cle === "lambda")))
    messages.push("Bornes ou stratifié modifiés : relancez la chute DC.");

  /* ON MONTRE CE QU'ON VIENT DE RÉGLER. Si l'onglet ouvert n'est concerné par
     rien de ce qui a changé, on passe sur le premier qui l'est ; sinon on
     reste où l'on est, et on redessine. */
  if (typeof document !== "undefined" && fait.length && typeof simPoser === "function") {
    if (anas.length && !anas.includes(SIM.analyse) && SIM_ANALYSES[anas[0]]) {
      const fam = SIM_FAMILLES.find(f => f.analyses.includes(anas[0]));
      if (fam) SIM.famille = fam.cle;
      SIM.analyse = anas[0];
    }
    try { simPoser(); if (typeof simRepeindre === "function") simRepeindre(); } catch (_) {}
    /* LE PANNEAU S'OUVRE, SANS `simOuvrir` : celui-ci passe par
       `simRafraichir`, qui oublie le résultat courant comme après un
       changement de sélection — une amplitude corrigée coûterait alors le
       calcul d'impédance qu'on regardait. */
    if (typeof wsShow === "function" && typeof wsPlaceOf === "function") {
      try {
        if (wsPlaceOf("sim") === "hidden") wsShow("sim");
        if (typeof WS !== "undefined" && WS.panels && WS.panels.sim && WS.panels.sim.collapsed &&
            typeof wsToggleCollapse === "function") wsToggleCollapse("sim");
      } catch (_) {}
    }
  }

  return { n: fait.length, lignes: fait, simulations: Array.from(touche), analyses: anas, messages: messages };
}

/* L'état propre à ce module : le journal de ce qui a été appliqué, et d'où.
   Il ne sert qu'à la traçabilité — rien ne se recalcule à partir de lui. */
const SIM_DS = { journal: [] };
