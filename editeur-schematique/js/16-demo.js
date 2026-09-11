/* =============================================================================
   editeur-schematique — 16-demo.js
   Schéma de démonstration
   ============================================================================= */
"use strict";
/* ==========================================================================
   Fabrique élémentaire
   ========================================================================== */
function mk(t,x,y,rot,val,ref){
  const el=addComp(t,x,y);el.rot=rot||0;
  if(val!==undefined)el.value=val;
  if(ref)el.ref=ref;
  return el;
}

/* ==========================================================================
   Exemple 1 (défaut) — Interface IoT & Bus Haute Vitesse (4 couches)
   Feuille 1 : Microcontrôleur STM32WL55, Flash SPI, bus SPI et ports globaux
   ========================================================================== */
function demo(){
  // U1 MCU STM32WL55CCU6 (TQFP-32)
  const u1 = mk("ic", 400, 360, 0, "STM32WL55CCU6", "U1");
  u1.npins = 32;
  u1.icShape = "quad";
  u1.pkg = "TQFP-32";
  u1.csvPartName = "MCU_STM32WL55CCU6";
  u1.csvMpn = "STM32WL55CCU6TR";
  u1.manufacturer = "STMicroelectronics";
  u1.pinNames = [
    "VDD", "PB8 (RF)", "PA13 (SWDIO)", "PA14 (SWCLK)", "PB15", "PB4", "PB3", "PB5",
    "PA5 (SCK)", "PA6 (MISO)", "PA7 (MOSI)", "PB0 (CS)", "PB2", "PA8", "PA9", "PA10",
    "PA11 (DM)", "PA12 (DP)", "PB6", "PB7", "PB9", "PC13", "NRST", "VDD",
    "PB12", "PB13", "PB14", "PA0", "PA1", "PA2", "PA3", "VSS"
  ];

  // U2 Flash SPI M95P08 (SOIC-8)
  const u2 = mk("ic", 760, 520, 0, "M95P08-IXMNT/E", "U2");
  u2.npins = 8;
  u2.icShape = "dip";
  u2.pkg = "SOIC-8";
  u2.csvPartName = "IC_FLASH_M95P08-IXMNT/E";
  u2.csvMpn = "M95P08-IXMNT/E";
  u2.manufacturer = "STMicroelectronics";
  u2.pinNames = ["CS#", "SO (MISO)", "WP#", "VSS", "SI (MOSI)", "SCK", "HOLD#", "VCC"];

  // Condensateurs de découplage
  const c4 = mk("capacitor", 180, 220, 90, "100n", "C4");
  c4.pkg = "0402";
  c4.csvPartName = "C0402_100nF_X7R_50V_MU";
  c4.csvMpn = "GRM155R71H104KE14D";
  c4.manufacturer = "Murata Electronics";

  const c5 = mk("capacitor", 620, 220, 90, "100n", "C5");
  c5.pkg = "0402";
  c5.csvPartName = "C0402_100nF_X7R_50V_MU";
  c5.csvMpn = "GRM155R71H104KE14D";
  c5.manufacturer = "Murata Electronics";

  // C3 (découplage U2 Flash)
  mk("vcc", 1040, 440, 0, "+3V3");
  mk("gnd", 1040, 560, 0);
  const c3 = mk("capacitor", 1040, 500, 90, "100n", "C3");
  c3.pkg = "0402";
  c3.csvPartName = "C0402_100nF_X7R_50V_MU";
  c3.csvMpn = "GRM155R71H104KE14D";
  c3.manufacturer = "Murata Electronics";

  // Rails d'alimentation locaux
  mk("vcc", 180, 160, 0, "+3V3");
  mk("gnd", 180, 280, 0);
  mk("vcc", 620, 160, 0, "+3V3");
  mk("gnd", 620, 280, 0);

  mk("vcc", 560, 520, 0, "+3V3");
  mk("gnd", 580, 580, 0);
  mk("vcc", 940, 480, 0, "+3V3");
  mk("vcc", 960, 500, 0, "+3V3");
  mk("gnd", 340, 200, 0); // VSS MCU U1

  // Ports globaux (interconnexion avec Feuille 2)
  mk("gport", 120, 320, 0, "RF_ANT");
  mk("gport", 120, 340, 0, "SWDIO");
  mk("gport", 120, 360, 0, "SWCLK");
  const pDm = mk("gport", 640, 440, 0, "USB_DM"); pDm.mir = true;
  const pDp = mk("gport", 640, 420, 0, "USB_DP"); pDp.mir = true;

  // Annotations
  mk("annot_note", 440, 80, 0, "Microcontrôleur & Bus Rapides|MCU STM32WL55 (TQFP-32) + Flash SPI 8 Mbit (SOIC-8)|Paire diff USB 90 Ω · Bus SPI 4 fils · Ligne RF 50 Ω");
  mk("annot_text", 130, 290, 0, "Signaux RF & SWD");
  mk("annot_text", 650, 390, 0, "Paire diff USB 2.0 (90 Ω)");
  mk("annot_text", 540, 570, 0, "Bus de données SPI");

  // Liaisons filaires
  S.wires.push(
    // U1 alimentation : pin 1 vers C4 et rail +3V3
    {x1: 260, y1: 300, x2: 220, y2: 300},
    {x1: 220, y1: 300, x2: 220, y2: 180},
    {x1: 220, y1: 180, x2: 180, y2: 180},

    // U1 pin 24 vers C5 et rail +3V3
    {x1: 540, y1: 300, x2: 580, y2: 300},
    {x1: 580, y1: 300, x2: 580, y2: 180},
    {x1: 580, y1: 180, x2: 620, y2: 180},

    // U1 pin 32 (VSS) vers GND
    {x1: 340, y1: 220, x2: 340, y2: 180},

    // Ports globaux vers broches MCU U1
    {x1: 140, y1: 320, x2: 260, y2: 320}, // RF_ANT vers broche 2 (PB8)
    {x1: 140, y1: 340, x2: 260, y2: 340}, // SWDIO vers broche 3 (PA13)
    {x1: 140, y1: 360, x2: 260, y2: 360}, // SWCLK vers broche 4 (PA14)
    {x1: 540, y1: 440, x2: 620, y2: 440}, // USB_DM depuis broche 17 (PA11)
    {x1: 540, y1: 420, x2: 620, y2: 420}, // USB_DP depuis broche 18 (PA12)

    // Bus SPI entre U1 et U2
    {x1: 400, y1: 500, x2: 400, y2: 580, net: "SPI_CS"},
    {x1: 400, y1: 580, x2: 520, y2: 580, net: "SPI_CS"},
    {x1: 520, y1: 580, x2: 520, y2: 500, net: "SPI_CS"},
    {x1: 520, y1: 500, x2: 600, y2: 500, net: "SPI_CS"},

    {x1: 360, y1: 500, x2: 360, y2: 600, net: "SPI_MISO"},
    {x1: 360, y1: 600, x2: 540, y2: 600, net: "SPI_MISO"},
    {x1: 540, y1: 600, x2: 540, y2: 520, net: "SPI_MISO"},
    {x1: 540, y1: 520, x2: 600, y2: 520, net: "SPI_MISO"},

    {x1: 380, y1: 500, x2: 380, y2: 620, net: "SPI_MOSI"},
    {x1: 380, y1: 620, x2: 1000, y2: 620, net: "SPI_MOSI"},
    {x1: 1000, y1: 620, x2: 1000, y2: 560, net: "SPI_MOSI"},
    {x1: 1000, y1: 560, x2: 920, y2: 560, net: "SPI_MOSI"},

    {x1: 340, y1: 500, x2: 340, y2: 640, net: "SPI_SCK"},
    {x1: 340, y1: 640, x2: 980, y2: 640, net: "SPI_SCK"},
    {x1: 980, y1: 640, x2: 980, y2: 540, net: "SPI_SCK"},
    {x1: 980, y1: 540, x2: 920, y2: 540, net: "SPI_SCK"},

    // U2 Alimentation et maintien au niveau haut
    {x1: 920, y1: 500, x2: 940, y2: 500},
    {x1: 920, y1: 520, x2: 960, y2: 520},
    {x1: 600, y1: 540, x2: 560, y2: 540},
    {x1: 600, y1: 560, x2: 580, y2: 560}
  );
}

/* ==========================================================================
   Exemple 1 (défaut) — Feuille 2 : Alimentation, Connectique & RF
   Connecteur USB, régulateur LDO 3,3 V, embase SWD et connecteur SMA 50 Ω
   ========================================================================== */
function demo2(){
  // J1 Micro-USB (MICRO-USB-B)
  const j1 = mk("usb_micro", 200, 260, 0, "MICRO-USB", "J1");
  j1.mir = true;
  j1.pkg = "MICRO-USB-B";
  j1.csvPartName = "CONN-USB_Mini_651005136421";
  j1.csvMpn = "651005136421";
  j1.manufacturer = "Würth Elektronik";

  // U3 LDO 3.3V LP2980 (SOT-23-5)
  const u3 = mk("ic", 540, 260, 0, "LP2980-3.3", "U3");
  u3.npins = 5;
  u3.icShape = "dip";
  u3.pkg = "SOT-23-5";
  u3.csvPartName = "REG_LP2980AIM5X-3.3";
  u3.csvMpn = "LP2980AIM5X-3.3/NOPB";
  u3.manufacturer = "Texas Instruments";
  u3.pinNames = ["VIN", "GND", "ON/OFF", "NC", "VOUT"];

  // C1 (10µF 0805) condensateur d'entrée
  const c1 = mk("capacitor", 340, 260, 90, "10µ", "C1");
  c1.pkg = "0805";
  c1.csvPartName = "C0805_10uF_X5R_16V_AUTO_TY";
  c1.csvMpn = "EMK212BJ106KG-T";
  c1.manufacturer = "Taiyo Yuden";

  // C2 (1µF 0603) condensateur de sortie régulateur
  const c2 = mk("capacitor", 720, 260, 90, "1µ", "C2");
  c2.pkg = "0603";
  c2.csvPartName = "C0603_1uF_X7R_25V_AUTO_MU";
  c2.csvMpn = "GRM188R71E105KA12D";
  c2.manufacturer = "Murata Electronics";

  // J2 SWD Header 1x4 (HEADER-2.54-1x4)
  const j2 = mk("header_1x4", 200, 500, 0, "SWD", "J2");
  j2.pkg = "HEADER-2.54-1x4";
  j2.csvPartName = "CONN_4-2.54mm-TRAV";
  j2.csvMpn = "CONN_4_TRAV";
  j2.manufacturer = "Wurth Elektronik / Multicomp";

  // J3 Connecteur d'antenne SMA (SMA-EDGE)
  const j3 = mk("ic", 540, 500, 0, "SMA-50R", "J3");
  j3.npins = 5;
  j3.icShape = "dip";
  j3.pkg = "SMA-EDGE";
  j3.csvPartName = "CONN_Embase_SMA_CI_Bord_de_carte";
  j3.csvMpn = "132134";
  j3.manufacturer = "Amphenol / Rosenberger";
  j3.pinNames = ["SIG", "GND", "GND", "GND", "GND"];

  // Rails d'alimentation et masse
  mk("vcc", 340, 160, 0, "+5V");
  mk("gnd", 340, 320, 0);
  mk("gnd", 400, 320, 0);
  mk("gnd", 260, 320, 0);
  mk("vcc", 720, 160, 0, "+3V3");
  mk("gnd", 720, 320, 0);

  mk("vcc", 120, 440, 0, "+3V3");
  mk("gnd", 120, 540, 0);
  mk("gnd", 420, 580, 0);

  // Ports globaux vers Feuille 1
  mk("gport", 300, 240, 0, "USB_DM");
  mk("gport", 300, 260, 0, "USB_DP");
  const pSwdio2 = mk("gport", 120, 480, 0, "SWDIO"); pSwdio2.mir = true;
  const pSwclk2 = mk("gport", 120, 500, 0, "SWCLK"); pSwclk2.mir = true;
  const pRf2 = mk("gport", 400, 480, 0, "RF_ANT"); pRf2.mir = true;

  // Annotations
  mk("annot_note", 440, 80, 0, "Alimentation Régulée & Connectique RF|LDO 5 V → 3,3 V (LP2980 SOT-23-5) · Connecteur Micro-USB · Embase SMA 50 Ω|Port de programmation et débogage SWD");
  mk("annot_text", 260, 180, 0, "Entrée Micro-USB 5 V");
  mk("annot_text", 560, 180, 0, "Régulateur LDO 3,3 V");
  mk("annot_text", 200, 420, 0, "Connecteur SWD");
  mk("annot_text", 540, 440, 0, "Sortie Antenne RF 50 Ω");

  // Liaisons filaires
  S.wires.push(
    // J1 USB VBUS vers C1 et rail +5V
    {x1: 240, y1: 220, x2: 340, y2: 220},
    {x1: 340, y1: 220, x2: 340, y2: 180},

    // +5V vers U3 broche 1 (VIN) et broche 3 (ON/OFF)
    {x1: 340, y1: 220, x2: 380, y2: 220},
    {x1: 380, y1: 220, x2: 380, y2: 240},
    {x1: 380, y1: 240, x2: 420, y2: 240},
    {x1: 380, y1: 240, x2: 380, y2: 280},
    {x1: 380, y1: 280, x2: 420, y2: 280},

    // J1 GND et blindage vers GND
    {x1: 240, y1: 300, x2: 260, y2: 300},
    {x1: 240, y1: 320, x2: 260, y2: 320},
    {x1: 260, y1: 320, x2: 260, y2: 300},

    // J1 signaux différentiels USB vers ports globaux
    {x1: 240, y1: 240, x2: 320, y2: 240},
    {x1: 240, y1: 260, x2: 320, y2: 260},

    // U3 GND vers masse
    {x1: 420, y1: 260, x2: 400, y2: 260},
    {x1: 400, y1: 260, x2: 400, y2: 300},

    // U3 VOUT vers C2 et rail +3V3
    {x1: 660, y1: 240, x2: 720, y2: 240},
    {x1: 720, y1: 240, x2: 720, y2: 220},
    {x1: 720, y1: 220, x2: 720, y2: 180},

    // J2 Connecteur SWD
    {x1: 160, y1: 460, x2: 120, y2: 460},
    {x1: 160, y1: 480, x2: 100, y2: 480},
    {x1: 160, y1: 500, x2: 100, y2: 500},
    {x1: 160, y1: 520, x2: 120, y2: 520},

    // J3 Embase SMA (broche 1 SIG vers port RF, broches 2-5 masse)
    {x1: 440, y1: 480, x2: 380, y2: 480},
    {x1: 440, y1: 500, x2: 420, y2: 500},
    {x1: 440, y1: 520, x2: 420, y2: 520},
    {x1: 420, y1: 500, x2: 420, y2: 560},
    {x1: 640, y1: 480, x2: 660, y2: 480},
    {x1: 640, y1: 500, x2: 660, y2: 500},
    {x1: 660, y1: 480, x2: 660, y2: 560},
    {x1: 660, y1: 560, x2: 420, y2: 560}
  );
}

/* ==========================================================================
   Exemple 2 — Commande 12 V (2 couches)
   Feuille 1 : Étage de commande NPN BC847B
   ========================================================================== */
function demo12v(){
  mk("port",140,400,0,"EN");
  const r2 = mk("resistor",240,400,0,"1k","R2");
  r2.pkg="0603";
  r2.csvPartName="R0603_1K";
  r2.csvMpn="RC0603FR-071KL";
  r2.manufacturer="Yageo";

  const q1 = mk("npn",400,400,0,"BC847B","Q1");
  q1.pkg="SOT-23";
  q1.csvPartName="TRAN_NPN_BC847B_185";
  q1.csvMpn="BC847B,215";
  q1.manufacturer="Nexperia";

  const r3 = mk("resistor",300,480,90,"100k","R3");
  r3.pkg="0603";
  r3.csvPartName="R0603_100K";
  r3.csvMpn="RC0603FR-07100KL";
  r3.manufacturer="Yageo";

  const r1 = mk("resistor",420,280,90,"100k","R1");
  r1.pkg="0603";
  r1.csvPartName="R0603_100K";
  r1.csvMpn="RC0603FR-07100KL";
  r1.manufacturer="Yageo";

  mk("vcc",420,220,0,"12V");
  mk("gnd",420,580);
  mk("annot_volt",240,360,0,"3,30 V");
  mk("annot_curr",500,300,0,"I = 0,12 mA");
  mk("annot_note",700,400,0,"Interrupteur côté bas|EN à 3,3 V sature Q1|R3 garde la base au repos");
  S.wires.push(
    {x1:160,y1:400,x2:200,y2:400},
    {x1:280,y1:400,x2:360,y2:400,net:"BASE_Q1"},
    {x1:300,y1:400,x2:300,y2:440},
    {x1:300,y1:520,x2:300,y2:560},
    {x1:300,y1:560,x2:420,y2:560},
    {x1:420,y1:440,x2:420,y2:560},
    {x1:420,y1:320,x2:420,y2:360}
  );
}

/* ==========================================================================
   Exemple 2 — Feuille 2 : Régulation 12 V -> 5 V AMS1117-5.0
   ========================================================================== */
function demo12v_p2(){
  mk("vcc",200,180,0,"12V");
  const u1 = mk("regulator",300,260,0,"AMS1117-5.0","U1");
  u1.pkg="SOT-223-4";
  u1.csvPartName="AMS1117-5.0";
  u1.csvMpn="AMS1117-5.0";
  u1.manufacturer="Advanced Monolithic Systems";

  const c1 = mk("cap_pol",200,320,90,"10µ","C1");
  c1.pkg="1210";
  c1.csvPartName="C1210_10uF_X7R_35V_SE";
  c1.csvMpn="C1210C106K3RAC7800";
  c1.manufacturer="KEMET";

  const c2 = mk("cap_pol",440,320,90,"10µ","C2");
  c2.pkg="1210";
  c2.csvPartName="C1210_10uF_X7R_35V_SE";
  c2.csvMpn="C1210C106K3RAC7800";
  c2.manufacturer="KEMET";

  mk("gnd",300,420);
  const p5=mk("gport",620,260,0,"+5V");
  p5.mir=true;
  S.wires.push({x1:560,y1:260,x2:600,y2:260});
  mk("annot_volt",520,240,0,"5,00 V");
  mk("annot_text",420,180,0,"Régulateur linéaire 12 V → 5 V (AMS1117-5.0)");
  S.wires.push(
    {x1:200,y1:200,x2:200,y2:260},
    {x1:200,y1:260,x2:240,y2:260},
    {x1:200,y1:260,x2:200,y2:280},
    {x1:200,y1:360,x2:200,y2:400},
    {x1:200,y1:400,x2:300,y2:400},
    {x1:300,y1:320,x2:300,y2:400},
    {x1:300,y1:400,x2:440,y2:400},
    {x1:360,y1:260,x2:560,y2:260},
    {x1:440,y1:260,x2:440,y2:280},
    {x1:440,y1:360,x2:440,y2:400}
  );
}

/* ==========================================================================
   Catalogue des exemples & Modal de sélection
   ========================================================================== */
const SCH_EXEMPLES = [
  {
    titre: "Interface IoT & Bus Haute Vitesse — 4 couches",
    sous: "2 feuilles · paire diff 90 Ω · bus SPI · piste 50 Ω · composants LIB",
    texte: "Schéma complet raccordé à la carte PCB 4 couches : MCU STM32WL55 (TQFP-32), "+
           "Flash SPI M95P08 (SOIC-8), régulateur LDO 3,3 V (SOT-23-5), USB micro-B, connecteur SWD "+
           "et embase SMA RF 50 Ω.",
    points: [
      "**Paire différentielle USB 2.0 (90 Ω)** : ports globaux USB_DM et USB_DP reliant le connecteur USB au MCU.",
      "**Bus de données SPI** : 4 signaux d'interconnexion (SCK, MOSI, MISO, CS) entre le microcontrôleur et la Flash.",
      "**Ligne à impédance contrôlée 50 Ω** : sortie RF reliée à l'embase SMA bord de carte.",
      "**Composants issus de la bibliothèque** : Part Names et MPN réels (STMicroelectronics, TI, Würth, Murata).",
      "Structure hiérarchique 2 feuilles : Feuille 1 (MCU & bus), Feuille 2 (Alimentation & RF)."
    ]
  },
  {
    titre: "Commande 12 V — 2 couches",
    sous: "2 feuilles · régulateur 5 V · étage NPN · composants LIB",
    texte: "Schéma d'alimentation et commande basse tension avec les composants de la bibliothèque : "+
           "régulateur AMS1117-5.0, transistor NPN BC847B et composants passifs CMS.",
    points: [
      "Composants issus de LIB_composants.csv (BC847B, R0603, C1210).",
      "Régulation linéaire 12 V vers 5 V avec filtrage capacitif.",
      "Étage de commande tout-ou-rien côté bas piloté par niveau logique."
    ]
  }
];

function schChargerExemple(i){
  const ex = SCH_EXEMPLES[i];
  if(!ex)return false;
  const hasContent = S.pages.some(p=>(p.comps&&p.comps.length)||(p.wires&&p.wires.length));
  if(hasContent && typeof confirm==="function" &&
     !confirm("Ouvrir l'exemple « "+ex.titre+" » ? Le schéma en cours sera perdu.")){
    return false;
  }
  if(typeof push==="function") push();

  if(i === 0){
    S.pages = [newHierPage("Hiérarchie"), newPage("Microcontrôleur & Bus"), newPage("Alimentation & RF")];
    loadPage(2); demo2(); touchWires(); resolveSplits(); storeCurrent();
    loadPage(1); demo(); touchWires(); resolveSplits(); storeCurrent();
    loadPage(0);
  } else {
    S.pages = [newHierPage("Hiérarchie"), newPage("Commande NPN"), newPage("Alimentation")];
    loadPage(2); demo12v_p2(); touchWires(); resolveSplits(); storeCurrent();
    loadPage(1); demo12v(); touchWires(); resolveSplits(); storeCurrent();
    loadPage(0);
  }

  S.pages[0].viewed = true;
  S.dirty = false;
  if(typeof buildTabs==="function") buildTabs();
  if(typeof fit==="function") fit();
  if(typeof refreshPanels==="function") refreshPanels();
  if(typeof hint==="function"){
    hint("Exemple « "+ex.titre+" » ouvert. Schéma hiérarchique avec composants de la bibliothèque.");
  }
  return true;
}

function schExOuvrir(){
  const m = document.createElement("div");
  m.className = "modal";
  const escFn = (typeof esc==="function")?esc:(s=>String(s||""));
  const carte = (ex, i) =>
    '<div class="ex-carte"><h4>' + escFn(ex.titre) + '</h4>' +
    '<div class="ex-sous">' + escFn(ex.sous) + '</div>' +
    '<p>' + escFn(ex.texte) + '</p><ul>' +
    ex.points.map(p => '<li>' + escFn(p).replace(/\*\*(.*?)\*\*/g, '<b>$1</b>') + '</li>').join("") +
    '</ul><button class="tb on" data-ex="' + i + '">Ouvrir cet exemple</button></div>';

  m.innerHTML = '<div class="box ex"><h3>Exemples de schémas</h3>' +
    '<p>Deux schémas complets raccordés aux cartes de routage PCB. ' +
    'Ils s\'annulent (Ctrl+Z) et s\'enregistrent comme n\'importe quel schéma.</p>' +
    SCH_EXEMPLES.map(carte).join("") +
    '<div class="row" style="display:flex;justify-content:flex-end;margin-top:12px;">' +
    '<button class="tb" id="schExCancel">Fermer</button></div></div>';

  document.body.appendChild(m);
  const close = () => m.remove();
  m.onclick = e => { if(e.target === m) close(); };
  const bCancel = document.getElementById("schExCancel");
  if(bCancel) bCancel.onclick = close;
  for(const b of m.querySelectorAll("[data-ex]")){
    b.onclick = () => {
      const idx = +b.dataset.ex;
      close();
      schChargerExemple(idx);
    };
  }
}
if(typeof document !== "undefined"){
  const _bEx = document.getElementById("bExemples");
  if(_bEx) _bEx.onclick = schExOuvrir;
}

