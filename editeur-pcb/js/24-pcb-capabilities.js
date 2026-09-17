"use strict";
/* =============================================================================
   Éditeur PCB — Capabilités de fabrication & Profils Fabricants (JLCPCB, etc.)
   -----------------------------------------------------------------------------
   Permet d'intégrer les règles technologiques et contraintes des fabricants
   de PCB dans la CAO :
     - Profils complets (JLCPCB, Standard Industriel, Eurocircuits, PCBWay, etc.)
     - Audit de conformité de la carte en temps réel
     - Application automatique des règles au projet (classes, DRC, perçages)
     - Création automatique des règles de conception si elles n'existent pas
     - Import / Export de profils au format JSON et gestion de fichiers
   ============================================================================= */

/* ---------- Profils intégrés par défaut ---------- */
const PCB_DEFAULT_MFG_PROFILES = {
  jlcpcb: {
    id: "jlcpcb",
    name: "JLCPCB",
    version: "2026.1",
    description: "Capabilités complètes JLCPCB (FR-4, Aluminium, Cuivre, Rogers/PTFE, 1-32 couches)",
    vendorUrl: "https://jlcpcb.com/capabilities/pcb-capabilities",
    general: {
      layerCount: { min: 1, max: 32, desc: "1 à 32 couches cuivre" },
      controlledImpedance: {
        supported: true,
        layers: [4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30, 32],
        tolerancePercent: 10,
        userGuideUrl: "https://jlcpcb.com/help/article/User-Guide-to-the-JLCPCB-Impedance-Calculator",
        calculatorUrl: "https://jlcpcb.com/pcb-impedance-calculator"
      },
      materials: [
        {
          type: "FR-4",
          desc: "Stratifiés Grade A (Nan Ya, KB, Shengyi...)",
          er: 4.5,
          prepregs: { "7628": 4.4, "3313": 4.1, "2116": 4.16 }
        },
        {
          type: "Aluminum-Core",
          layers: 1,
          minDrill: 0.65,
          minDim: 5,
          link: "https://jlcpcb.com/news/new-arrival-aluminum-pcb-boards"
        },
        {
          type: "Copper-Core",
          layers: 1,
          minDrill: 1.0,
          minDim: 5,
          heatsinkContactMin: "1x1 mm",
          link: "https://jlcpcb.com/news/direct-heatsink-copper-core-pcbs-available"
        },
        {
          type: "RF PCB",
          cores: "Rogers and PTFE",
          layers: 2,
          copper: "1 oz",
          link: "https://jlcpcb.com/news/rogers-ptfe-high-frequency-pcb-available"
        }
      ],
      surfaceFinishes: [
        { name: "HASL avec plomb", note: "Standard économique (non dispo sur alu, >6 couches, épaisseur <=0.4mm)" },
        { name: "HASL sans plomb (Lead-Free)", note: "Conforme RoHS" },
        { name: "ENIG", note: "Recommandé pour BGA, pas fins et demi-trous" },
        { name: "OSP", note: "Préservation organique de soudabilité" }
      ],
      solderMask: {
        type: "LPI (Liquid Photo Imageable)",
        colors: ["Green", "Purple", "Red", "Yellow", "Blue", "White", "Black"],
        er: 3.8,
        thicknessUm: 10,
        expansionRatio: "1:1",
        clearanceToTraceMin: 0.09,
        bridgeMin: { "1oz_colors": 0.10, "1oz_black_white": 0.13, "2oz_all": 0.20 },
        pluggedVias: {
          type: "Filled with soldermask",
          maxViaDia: 0.50,
          clearanceToMaskOpenings: 0.35,
          note: "Vias remplis sans ouverture de vernis"
        },
        viaInPad: {
          type: "Epoxy or Copper paste Filled & Capped",
          defaultOnLayersGte: 6,
          compatibleViaDiaMin: 0.15,
          compatibleViaDiaMax: 0.55,
          note: "Par défaut à partir de 6 couches"
        }
      }
    },
    dimensions: {
      max: {
        fr4_1layer: { w: 606, h: 510 },
        fr4_2layer: { w: 670, h: 600, oversizeW: 1020, oversizeH: 600 },
        fr4_4layer: { w: 663, h: 593, oversizeW: 1016, oversizeH: 596 },
        fr4_multilayer: { w: 656, h: 586 },
        rogers_ptfe: { w: 590, h: 438 },
        aluminum: { w: 602, h: 506 },
        copper: { w: 480, h: 286 },
        thinFr4Lt08: { w: 599, h: 497 }
      },
      min: {
        fr4_rogers_ptfe: { w: 3, h: 3 },
        castellated_plated_edges: { w: 10, h: 10 },
        aluminum_copper: { w: 5, h: 5 },
        roundBoardSingle: { w: 20, h: 20 }
      },
      tolerance: { cncRegular: 0.2, cncPrecision: 0.1, vScoring: 0.4 },
      thickness: {
        fr4Available: [0.4, 0.6, 0.8, 1.0, 1.2, 1.6, 2.0],
        fr4HighLayerAvailable: [2.5, 3.0, 3.5, 4.0, 4.5],
        min: 0.4, max: 4.5, toleranceGte1mmPercent: 10, toleranceLt1mmMm: 0.1
      }
    },
    copper: {
      weights: [
        { oz: 1, layers: "1-2", minTrackWidth: 0.10, minTrackSpacing: 0.10, pthAnnularRingMin: 0.18, pthAnnularRingRec: 0.25 },
        { oz: 1, layers: "multilayer", minTrackWidth: 0.09, minTrackSpacing: 0.09, bgaFanoutMin: 0.076, pthAnnularRingMin: 0.15, pthAnnularRingRec: 0.20 },
        { oz: 2, layers: "2", minTrackWidth: 0.16, minTrackSpacing: 0.16, pthAnnularRingMin: 0.254, pthAnnularRingRec: 0.254 },
        { oz: 2, layers: "multilayer", minTrackWidth: 0.15, minTrackSpacing: 0.15, pthAnnularRingMin: 0.254, pthAnnularRingRec: 0.254 },
        { oz: 2.5, layers: "2", minTrackWidth: 0.20, minTrackSpacing: 0.20 },
        { oz: 3.5, layers: "2", minTrackWidth: 0.25, minTrackSpacing: 0.25 },
        { oz: 4.5, layers: "2", minTrackWidth: 0.30, minTrackSpacing: 0.30 }
      ],
      innerCopperDefaults: [0.5, 1.0, 2.0],
      innerCopperDefault: 0.5,
      widthTolerancePercent: 20,
      pthAnnularRingMinOverall: 0.20,
      npthPadAnnularRingMin: 0.45,
      sameNetSpacing: 0.25,
      hatchedGridSpacing: 0.25,
      traceCoils: { maskedMin: 0.15, unmaskedMin: 0.25 },
      padToTrackClearance: 0.10,
      padToTrackClearanceBga: 0.09,
      smdPadToPadClearance: 0.15,
      smdPadMin: { w: 0.25, h: 0.25 },
      viaHoleToTrack: 0.20,
      pthToTrack: 0.28,
      pthToTrackRec: 0.35,
      npthToTrack: 0.20,
      innerLayerViaHoleToCopper: 0.20,
      innerLayerPthPadHoleToCopper: 0.30,
      bga: { minPadDia: 0.20, enigRequiredUnderDia: 0.25, padToTraceMin: 0.10, padToTraceMultilayerMin: 0.09, viaInPadAllowed: true }
    },
    drilling: {
      drillDiameterMin: { layer1: 0.30, layer2Plus: 0.15, aluminum: 0.65, copperCore: 1.0 },
      drillDiameterMax: 6.30,
      holeSizeTolerance: { pthPlus: 0.13, pthMinus: 0.08, pressFit: 0.05, position: 0.05 },
      holePlatingThicknessUm: 18,
      blindBuriedViasSupported: false,
      vias: {
        minHoleSize: 0.15,
        minViaDiameter: 0.25,
        recMinHoleSize: 0.20,
        viaDiaOverHoleMin: 0.10,
        viaDiaOverHoleRec: 0.15,
        layer1NPTH: { minHole: 0.30, minViaDia: 0.50 }
      },
      minNpthHole: 0.50,
      spacing: { viaHoleToHole: 0.20, padHoleToHole: 0.45 },
      slots: {
        platedMinW_2layer: 0.50,
        platedMinW_multilayer: 0.35,
        platedLengthOverWidthMin: 2.0,
        nonPlatedMinW: 1.0,
        tolPlated: { plus: 0.13, minus: 0.08 },
        tolNonPlated: 0.20
      },
      castellatedHoles: { minHoleDia: 0.50, holeToEdgeMin: 1.0, holeToHoleMin: 0.50, minPcbSize: 10, minPcbThickness: 0.60 },
      platedEdges: { minPcbSize: 10, minPcbThickness: 0.60, finishRequired: "ENIG", minBreaks: 3 },
      blindSlot: { widthMin: 1.0, depthMin: 0.2, annularWidthMin: 0.3, safetyDistanceMin: 0.2, remainingThicknessMin: 0.2, supportedLayers: "2-32", thicknessMin: 0.8 },
      backdrill: { supportedLayers: "4-32", thicknessMin: 0.8, throughHoleDiaMin: 0.2, throughHoleDiaMax: 0.5, backdrillDiaDelta: 0.2, dielectricThicknessMin: 0.15, safetyDistanceMin: 0.2 },
      rectangularHolesSupported: false
    },
    silkscreen: {
      minLineWidth: 0.15,
      minTextHeight: 1.0,
      preferredWidthToHeightRatio: "1:6",
      hollowCarvedRatio: "1:6",
      padToSilkscreenClearance: 0.15
    },
    outline: {
      routed: { copperClearance: 0.20, slotClearance: 0.20, dimensionTolRegular: 0.20, dimensionTolPrecision: 0.10, minDimensionPrecision: 50, minSlotAluCopper: 1.6 },
      vCut: { copperClearance: 0.40, dimensionTol: 0.40, minPcbThickness: 0.60, minPanelDim: 70, maxPanelDim: 475, vCutAngle: 25, spacingBetweenVCutsMin: 2.0, spacingBetweenVCutsRec: 3.0 },
      mouseBites: { copperClearance: 0.20, dimensionTolRegular: 0.20, dimensionTolPrecision: 0.10, panelSpacing: 1.6, holeDiaMin: 0.5, holeDiaMax: 0.8, holeSpacingMin: 0.2, holeSpacingMax: 0.3, tabWidthMin: 4.0, tabWithBitesWidthMin: 5.0, toolingEdgeMin: 3.0, smtToolingEdge: 5.0 },
      panelizationSpacingMin: 2.0,
      roundBoardMin: 20
    }
  },

  generique: {
    id: "generique",
    name: "Standard Industriel",
    version: "2026.1",
    description: "Profil standard de l'industrie (tolérances courantes, classe 2 IPC)",
    vendorUrl: "",
    general: {
      layerCount: { min: 1, max: 16, desc: "1 à 16 couches cuivre" },
      controlledImpedance: {
        supported: true,
        layers: [4, 6, 8, 10, 12, 14, 16],
        tolerancePercent: 10
      },
      materials: [{ type: "FR-4", er: 4.5, desc: "Stratifié standard FR-4 standard Tg" }],
      surfaceFinishes: [
        { name: "HASL sans plomb" },
        { name: "ENIG" }
      ],
      solderMask: {
        type: "LPI",
        colors: ["Green", "Blue", "Red", "Black", "White"],
        er: 4.0,
        thicknessUm: 15,
        expansionRatio: "1:1",
        clearanceToTraceMin: 0.10,
        bridgeMin: { "1oz_colors": 0.12, "1oz_black_white": 0.15, "2oz_all": 0.20 },
        pluggedVias: { maxViaDia: 0.60, clearanceToMaskOpenings: 0.35 }
      }
    },
    dimensions: {
      max: { standard: { w: 500, h: 500 } },
      min: { standard: { w: 10, h: 10 }, roundBoardSingle: { w: 25, h: 25 } },
      tolerance: { cncRegular: 0.2, cncPrecision: 0.15, vScoring: 0.4 },
      thickness: {
        fr4Available: [0.8, 1.0, 1.2, 1.6, 2.0],
        min: 0.8, max: 3.2, toleranceGte1mmPercent: 10, toleranceLt1mmMm: 0.1
      }
    },
    copper: {
      weights: [
        { oz: 1, layers: "1-2", minTrackWidth: 0.15, minTrackSpacing: 0.15, pthAnnularRingMin: 0.20, pthAnnularRingRec: 0.25 },
        { oz: 1, layers: "multilayer", minTrackWidth: 0.125, minTrackSpacing: 0.125, pthAnnularRingMin: 0.18, pthAnnularRingRec: 0.20 },
        { oz: 2, layers: "all", minTrackWidth: 0.20, minTrackSpacing: 0.20, pthAnnularRingMin: 0.254, pthAnnularRingRec: 0.254 }
      ],
      innerCopperDefaults: [0.5, 1.0],
      innerCopperDefault: 0.5,
      widthTolerancePercent: 20,
      pthAnnularRingMinOverall: 0.20,
      npthPadAnnularRingMin: 0.50,
      sameNetSpacing: 0.25,
      hatchedGridSpacing: 0.30,
      traceCoils: { maskedMin: 0.20, unmaskedMin: 0.30 },
      padToTrackClearance: 0.15,
      padToTrackClearanceBga: 0.12,
      smdPadToPadClearance: 0.20,
      smdPadMin: { w: 0.30, h: 0.30 },
      viaHoleToTrack: 0.25,
      pthToTrack: 0.30,
      pthToTrackRec: 0.40,
      npthToTrack: 0.25,
      innerLayerViaHoleToCopper: 0.25,
      innerLayerPthPadHoleToCopper: 0.35,
      bga: { minPadDia: 0.25, enigRequiredUnderDia: 0.30, padToTraceMin: 0.12, padToTraceMultilayerMin: 0.10 }
    },
    drilling: {
      drillDiameterMin: { layer1: 0.40, layer2Plus: 0.30 },
      drillDiameterMax: 6.0,
      holeSizeTolerance: { pthPlus: 0.15, pthMinus: 0.10, pressFit: 0.05, position: 0.08 },
      holePlatingThicknessUm: 20,
      blindBuriedViasSupported: false,
      vias: { minHoleSize: 0.30, minViaDiameter: 0.60, recMinHoleSize: 0.30, viaDiaOverHoleMin: 0.20, viaDiaOverHoleRec: 0.30 },
      minNpthHole: 0.60,
      spacing: { viaHoleToHole: 0.25, padHoleToHole: 0.50 },
      slots: { platedMinW_2layer: 0.60, platedMinW_multilayer: 0.50, platedLengthOverWidthMin: 2.0, nonPlatedMinW: 1.2, tolPlated: { plus: 0.15, minus: 0.10 }, tolNonPlated: 0.25 },
      castellatedHoles: { minHoleDia: 0.60, holeToEdgeMin: 1.2, holeToHoleMin: 0.60, minPcbSize: 15, minPcbThickness: 0.80 },
      platedEdges: { minPcbSize: 15, minPcbThickness: 0.80 },
      rectangularHolesSupported: false
    },
    silkscreen: { minLineWidth: 0.18, minTextHeight: 1.20, preferredWidthToHeightRatio: "1:6", padToSilkscreenClearance: 0.20 },
    outline: {
      routed: { copperClearance: 0.30, slotClearance: 0.30, dimensionTolRegular: 0.25, dimensionTolPrecision: 0.15 },
      vCut: { copperClearance: 0.45, dimensionTol: 0.40, minPcbThickness: 0.80, minPanelDim: 80, maxPanelDim: 450, vCutAngle: 30, spacingBetweenVCutsMin: 3.0, spacingBetweenVCutsRec: 4.0 },
      mouseBites: { copperClearance: 0.30, dimensionTolRegular: 0.25, panelSpacing: 2.0, holeDiaMin: 0.6, holeDiaMax: 0.8, tabWidthMin: 4.5 },
      panelizationSpacingMin: 2.5
    }
  },

  eurocircuits: {
    id: "eurocircuits",
    name: "Eurocircuits",
    version: "2026.1",
    description: "Standard Pool Eurocircuits (FR-4 standard européen, classe IPC-A-600 classe 2)",
    vendorUrl: "https://www.eurocircuits.com/pcb-capabilities/",
    general: {
      layerCount: { min: 1, max: 16, desc: "1 à 16 couches cuivre" },
      controlledImpedance: { supported: true, layers: [4, 6, 8, 10, 12, 14, 16], tolerancePercent: 10 },
      materials: [{ type: "FR-4", er: 4.5, desc: "Isola / Nan Ya / Shengyi High Tg FR4" }],
      surfaceFinishes: [{ name: "HASL sans plomb" }, { name: "ENIG (Chem Ni/Au)" }],
      solderMask: {
        type: "LPI",
        colors: ["Green", "Black", "Red", "Blue", "White"],
        er: 3.9,
        thicknessUm: 15,
        expansionRatio: "1:1",
        clearanceToTraceMin: 0.10,
        bridgeMin: { "1oz_colors": 0.10, "1oz_black_white": 0.12, "2oz_all": 0.18 },
        pluggedVias: { maxViaDia: 0.50, clearanceToMaskOpenings: 0.35 }
      }
    },
    dimensions: {
      max: { standard: { w: 580, h: 425 } },
      min: { standard: { w: 5, h: 5 }, roundBoardSingle: { w: 15, h: 15 } },
      tolerance: { cncRegular: 0.2, cncPrecision: 0.1, vScoring: 0.3 },
      thickness: {
        fr4Available: [0.8, 1.0, 1.2, 1.55, 2.0, 2.4, 3.2],
        min: 0.5, max: 3.2, toleranceGte1mmPercent: 10, toleranceLt1mmMm: 0.1
      }
    },
    copper: {
      weights: [
        { oz: 1, layers: "1-2", minTrackWidth: 0.10, minTrackSpacing: 0.10, pthAnnularRingMin: 0.125, pthAnnularRingRec: 0.175 },
        { oz: 1, layers: "multilayer", minTrackWidth: 0.09, minTrackSpacing: 0.09, pthAnnularRingMin: 0.125, pthAnnularRingRec: 0.15 },
        { oz: 2, layers: "all", minTrackWidth: 0.15, minTrackSpacing: 0.15, pthAnnularRingMin: 0.20, pthAnnularRingRec: 0.25 }
      ],
      innerCopperDefaults: [0.5, 1.0],
      innerCopperDefault: 0.5,
      widthTolerancePercent: 15,
      pthAnnularRingMinOverall: 0.125,
      npthPadAnnularRingMin: 0.35,
      sameNetSpacing: 0.20,
      hatchedGridSpacing: 0.25,
      traceCoils: { maskedMin: 0.15, unmaskedMin: 0.25 },
      padToTrackClearance: 0.10,
      padToTrackClearanceBga: 0.09,
      smdPadToPadClearance: 0.125,
      smdPadMin: { w: 0.20, h: 0.20 },
      viaHoleToTrack: 0.20,
      pthToTrack: 0.25,
      pthToTrackRec: 0.30,
      npthToTrack: 0.25,
      innerLayerViaHoleToCopper: 0.25,
      innerLayerPthPadHoleToCopper: 0.30,
      bga: { minPadDia: 0.20, enigRequiredUnderDia: 0.25, padToTraceMin: 0.09 }
    },
    drilling: {
      drillDiameterMin: { layer1: 0.25, layer2Plus: 0.15 },
      drillDiameterMax: 6.0,
      holeSizeTolerance: { pthPlus: 0.10, pthMinus: 0.10, pressFit: 0.05, position: 0.05 },
      holePlatingThicknessUm: 20,
      blindBuriedViasSupported: true,
      vias: { minHoleSize: 0.15, minViaDiameter: 0.40, recMinHoleSize: 0.25 },
      minNpthHole: 0.50,
      spacing: { viaHoleToHole: 0.25, padHoleToHole: 0.40 },
      slots: { platedMinW_2layer: 0.50, nonPlatedMinW: 1.0 },
      castellatedHoles: { minHoleDia: 0.50, holeToEdgeMin: 1.0, holeToHoleMin: 0.50 }
    },
    silkscreen: { minLineWidth: 0.15, minTextHeight: 1.0, padToSilkscreenClearance: 0.15 },
    outline: {
      routed: { copperClearance: 0.25, slotClearance: 0.25, dimensionTolRegular: 0.20 },
      vCut: { copperClearance: 0.45, dimensionTol: 0.30, minPcbThickness: 0.80 },
      mouseBites: { copperClearance: 0.25, panelSpacing: 2.0, holeDiaMin: 0.5, holeDiaMax: 0.8 },
      panelizationSpacingMin: 2.0
    }
  },

  pcbway: {
    id: "pcbway",
    name: "PCBWay",
    version: "2026.1",
    description: "Standard PCB Capabilities PCBWay (FR-4, Aluminium, Rogers, 1-14 couches standard)",
    vendorUrl: "https://www.pcbway.com/capabilities.html",
    general: {
      layerCount: { min: 1, max: 14, desc: "1 à 14 couches cuivre standard" },
      controlledImpedance: { supported: true, layers: [4, 6, 8, 10, 12, 14], tolerancePercent: 10 },
      materials: [
        { type: "FR-4", er: 4.5, desc: "Tg 130-140, Tg 150-160, High Tg 170" },
        { type: "Aluminum", layers: 1, minDrill: 0.60 },
        { type: "Rogers", layers: 2, desc: "RO4350B, RO4003C" }
      ],
      surfaceFinishes: [{ name: "HASL avec plomb" }, { name: "HASL sans plomb" }, { name: "ENIG" }, { name: "OSP" }],
      solderMask: {
        type: "LPI",
        colors: ["Green", "Red", "Yellow", "Blue", "White", "Black", "Purple"],
        er: 3.8,
        thicknessUm: 12,
        expansionRatio: "1:1",
        clearanceToTraceMin: 0.10,
        bridgeMin: { "1oz_colors": 0.10, "1oz_black_white": 0.13, "2oz_all": 0.20 }
      }
    },
    dimensions: {
      max: { standard: { w: 500, h: 500 } },
      min: { standard: { w: 6, h: 6 }, roundBoardSingle: { w: 20, h: 20 } },
      tolerance: { cncRegular: 0.2, cncPrecision: 0.15, vScoring: 0.4 },
      thickness: {
        fr4Available: [0.4, 0.6, 0.8, 1.0, 1.2, 1.6, 2.0, 2.4],
        min: 0.4, max: 3.2, toleranceGte1mmPercent: 10, toleranceLt1mmMm: 0.1
      }
    },
    copper: {
      weights: [
        { oz: 1, layers: "1-2", minTrackWidth: 0.10, minTrackSpacing: 0.10, pthAnnularRingMin: 0.15, pthAnnularRingRec: 0.20 },
        { oz: 1, layers: "multilayer", minTrackWidth: 0.09, minTrackSpacing: 0.09, pthAnnularRingMin: 0.15, pthAnnularRingRec: 0.20 },
        { oz: 2, layers: "all", minTrackWidth: 0.15, minTrackSpacing: 0.15, pthAnnularRingMin: 0.20, pthAnnularRingRec: 0.25 }
      ],
      innerCopperDefaults: [0.5, 1.0],
      innerCopperDefault: 0.5,
      widthTolerancePercent: 20,
      pthAnnularRingMinOverall: 0.15,
      npthPadAnnularRingMin: 0.40,
      sameNetSpacing: 0.25,
      hatchedGridSpacing: 0.25,
      traceCoils: { maskedMin: 0.15, unmaskedMin: 0.25 },
      padToTrackClearance: 0.10,
      padToTrackClearanceBga: 0.09,
      smdPadToPadClearance: 0.15,
      smdPadMin: { w: 0.25, h: 0.25 },
      viaHoleToTrack: 0.20,
      pthToTrack: 0.25,
      pthToTrackRec: 0.30,
      npthToTrack: 0.20,
      innerLayerViaHoleToCopper: 0.20,
      innerLayerPthPadHoleToCopper: 0.30,
      bga: { minPadDia: 0.20, enigRequiredUnderDia: 0.25, padToTraceMin: 0.10 }
    },
    drilling: {
      drillDiameterMin: { layer1: 0.30, layer2Plus: 0.20, aluminum: 0.60 },
      drillDiameterMax: 6.30,
      holeSizeTolerance: { pthPlus: 0.13, pthMinus: 0.08, pressFit: 0.05, position: 0.05 },
      holePlatingThicknessUm: 18,
      blindBuriedViasSupported: true,
      vias: { minHoleSize: 0.20, minViaDiameter: 0.30, recMinHoleSize: 0.25 },
      minNpthHole: 0.50,
      spacing: { viaHoleToHole: 0.25, padHoleToHole: 0.45 },
      slots: { platedMinW_2layer: 0.50, nonPlatedMinW: 1.0 },
      castellatedHoles: { minHoleDia: 0.60, holeToEdgeMin: 1.0, holeToHoleMin: 0.60 }
    },
    silkscreen: { minLineWidth: 0.15, minTextHeight: 1.0, padToSilkscreenClearance: 0.15 },
    outline: {
      routed: { copperClearance: 0.20, slotClearance: 0.20, dimensionTolRegular: 0.20 },
      vCut: { copperClearance: 0.40, dimensionTol: 0.40, minPcbThickness: 0.60 },
      mouseBites: { copperClearance: 0.20, panelSpacing: 1.6, holeDiaMin: 0.5, holeDiaMax: 0.8 },
      panelizationSpacingMin: 2.0
    }
  }
};

/* Registre global des profils disponibles en mémoire */
var PCB_MFG_PROFILES = JSON.parse(JSON.stringify(PCB_DEFAULT_MFG_PROFILES));

/* ---------- Fonctions de gestion des profils ---------- */

function pcbLoadMfgProfiles(){
  try {
    const raw = (typeof localStorage !== "undefined" && localStorage.getItem("web_cao_mfg_profiles")) ||
                (typeof sessionStorage !== "undefined" && sessionStorage.getItem("web_cao_mfg_profiles"));
    if(raw){
      const parsed = JSON.parse(raw);
      if(parsed && typeof parsed === "object"){
        for(const k in parsed){
          if(parsed[k] && parsed[k].id && parsed[k].name){
            PCB_MFG_PROFILES[k] = parsed[k];
          }
        }
      }
    }
  } catch(e){}
  return PCB_MFG_PROFILES;
}

function pcbSaveMfgProfiles(){
  try {
    const str = JSON.stringify(PCB_MFG_PROFILES);
    if(typeof localStorage !== "undefined") localStorage.setItem("web_cao_mfg_profiles", str);
    if(typeof sessionStorage !== "undefined") sessionStorage.setItem("web_cao_mfg_profiles", str);
  } catch(e){}
}

function pcbGetMfgProfile(id){
  pcbLoadMfgProfiles();
  const k = id || (typeof S !== "undefined" && S.rule && S.rule.mfgProfile) || "jlcpcb";
  return PCB_MFG_PROFILES[k] || PCB_MFG_PROFILES["jlcpcb"] || PCB_DEFAULT_MFG_PROFILES["jlcpcb"];
}

function pcbGetActiveMfgProfileId(){
  return (typeof S !== "undefined" && S.rule && S.rule.mfgProfile) || "jlcpcb";
}

function pcbSetActiveMfgProfile(id){
  const p = pcbGetMfgProfile(id);
  if(!p) return false;
  if(typeof S !== "undefined"){
    if(!S.rule) pcbEnsureDefaultProjectRules();
    if(typeof push === "function") push();
    S.rule.mfgProfile = p.id;
    if(typeof touch === "function") touch();
    if(typeof refreshPanels === "function") refreshPanels();
    if(typeof draw === "function") draw();
  }
  return true;
}

/* S'assure que les structures de règles S.rule et S.classes existent dans le projet */
function pcbEnsureDefaultProjectRules(){
  if(typeof S === "undefined") return;
  if(!S.rule){
    const aspW = typeof ASPECT_WARN !== "undefined" ? ASPECT_WARN : 8;
    const aspM = typeof ASPECT_MAX !== "undefined" ? ASPECT_MAX : 10;
    S.rule = {
      edge: 0.4,
      thermal: 0.5,
      mask: 0.05,
      paste: 0.0,
      viaFinish: "tented",
      corner: "45",
      route: "shove",
      hole: 0.25,
      mat: {},
      short: false,
      aspWarn: aspW,
      aspMax: aspM,
      mfgProfile: "jlcpcb",
      designRules: null
    };
  }
  if(!Array.isArray(S.classes) || S.classes.length === 0){
    S.classes = [
      { name: "Défaut", w: 0.25, clr: 0.20, via: 0.6, drill: 0.3 },
      { name: "Alimentation", w: 0.50, clr: 0.25, via: 0.8, drill: 0.4 }
    ];
  }
  if(!S.netClass) S.netClass = {};
  if(!S.rule.designRules){
    S.rule.designRules = pcbGetDefaultDesignRules();
  }
}

/* ---------- Métadonnées et gestion des Règles de Conception (Min / Typique / Max) ---------- */

const PCB_RULE_METAS = {
  trackWidth: {
    key: "trackWidth",
    label: "Largeur de piste",
    desc: "Largeur des pistes de cuivre pour le routage standard",
    unit: "mm",
    step: 0.01,
    defaultTyp: 0.21
  },
  clearance: {
    key: "clearance",
    label: "Isolement & Dégagement",
    desc: "Distance minimale entre conducteurs de nets distincts",
    unit: "mm",
    step: 0.01,
    defaultTyp: 0.20
  },
  drill: {
    key: "drill",
    label: "Diamètre de perçage",
    desc: "Foret mécanique pour vias et pastilles traversantes",
    unit: "mm",
    step: 0.05,
    defaultTyp: 0.30
  },
  viaDia: {
    key: "viaDia",
    label: "Diamètre extérieur de via",
    desc: "Rondelle extérieure de cuivre du via",
    unit: "mm",
    step: 0.05,
    defaultTyp: 0.60
  },
  annularRing: {
    key: "annularRing",
    label: "Anneau annulaire",
    desc: "Couronne de cuivre restante autour du perçage",
    unit: "mm",
    step: 0.01,
    defaultTyp: 0.20
  },
  edge: {
    key: "edge",
    label: "Marge au contour",
    desc: "Bande d'interdiction sans cuivre le long du bord de carte",
    unit: "mm",
    step: 0.05,
    defaultTyp: 0.40
  },
  mask: {
    key: "mask",
    label: "Expansion de masque",
    desc: "Dégagement du vernis épargne autour des pastilles (1:1 si LDI)",
    unit: "mm",
    step: 0.01,
    defaultTyp: 0.05
  },
  paste: {
    key: "paste",
    label: "Retrait de pâte",
    desc: "Retrait d'ouverture sur le pochoir de sérigraphie à braser",
    unit: "mm",
    step: 0.01,
    defaultTyp: 0.00
  },
  thermal: {
    key: "thermal",
    label: "Bras thermique",
    desc: "Largeur des ponts de dissipation connectés aux plans de cuivre",
    unit: "mm",
    step: 0.05,
    defaultTyp: 0.50
  }
};

/* Calcule les bornes technologiques infranchissables de l'usine pour le profil actif */
function pcbGetMfgLimits(profile){
  const p = profile || pcbGetMfgProfile();
  const cu = (typeof S !== "undefined" && S.cu) || 2;
  const isMulti = cu > 2;
  const wIdx = isMulti && p.copper && p.copper.weights && p.copper.weights[1] ? 1 : 0;

  const minTrackW = (p.copper && p.copper.weights && p.copper.weights[wIdx]?.minTrackWidth) || 0.10;
  const minClr = (p.copper && p.copper.weights && p.copper.weights[wIdx]?.minTrackSpacing) || 0.10;
  const minDrill = cu === 1 ? (p.drilling?.drillDiameterMin?.layer1 || 0.30) : (p.drilling?.drillDiameterMin?.layer2Plus || 0.15);
  const maxDrill = (p.drilling?.drillDiameterMax) || 6.30;
  const minViaDia = (p.drilling?.vias?.minViaDiameter) || 0.25;
  const minRing = isMulti ? (p.copper && p.copper.weights && p.copper.weights[1]?.pthAnnularRingMin || 0.15) : (p.copper && p.copper.weights && p.copper.weights[0]?.pthAnnularRingMin || 0.18);
  const minEdge = (p.outline?.routed?.copperClearance) || 0.20;

  return {
    trackWidth:  { min: minTrackW, max: 5.00 },
    clearance:   { min: minClr,    max: 5.00 },
    drill:       { min: minDrill,  max: maxDrill },
    viaDia:      { min: minViaDia, max: 2.50 },
    annularRing: { min: minRing,   max: 1.50 },
    edge:        { min: minEdge,   max: 10.00 },
    mask:        { min: 0.00,      max: 0.30 },
    paste:       { min: 0.00,      max: 0.20 },
    thermal:     { min: 0.20,      max: 3.00 }
  };
}

/* Génère le jeu de règles par défaut, encadré par les capabilités du fabricant */
function pcbGetDefaultDesignRules(profile){
  const limits = pcbGetMfgLimits(profile);
  const p = profile || pcbGetMfgProfile();
  const isLdi = p.general && p.general.solderMask && p.general.solderMask.expansionRatio === "1:1";
  return {
    trackWidth:  { min: limits.trackWidth.min,  typ: 0.21, max: limits.trackWidth.max },
    clearance:   { min: limits.clearance.min,   typ: 0.20, max: 3.00 },
    drill:       { min: limits.drill.min,       typ: 0.30, max: limits.drill.max },
    viaDia:      { min: 0.40,                   typ: 0.60, max: limits.viaDia.max },
    annularRing: { min: limits.annularRing.min, typ: 0.20, max: limits.annularRing.max },
    edge:        { min: limits.edge.min,        typ: 0.40, max: 5.00 },
    mask:        { min: limits.mask.min,        typ: isLdi ? 0.00 : 0.05, max: 0.25 },
    paste:       { min: 0.00,                   typ: 0.00, max: 0.10 },
    thermal:     { min: 0.20,                   typ: 0.50, max: 2.00 }
  };
}

/* Récupère les règles du projet courant avec initialisation sécurisée */
function pcbGetProjectDesignRules(){
  pcbEnsureDefaultProjectRules();
  if(!S.rule.designRules){
    S.rule.designRules = pcbGetDefaultDesignRules();
  }
  return S.rule.designRules;
}

/* Propage la valeur typique aux paramètres actifs du projet (classes, règles globales) */
function pcbPropagateTypiqueToProject(ruleKey, typ){
  if(typeof S === "undefined") return;
  const num = Math.round(Number(typ) * 1000) / 1000;
  if(isNaN(num)) return;

  if(ruleKey === "trackWidth"){
    if(typeof reCls === "function" && reCls()) reCls().w = num;
    else if(Array.isArray(S.classes) && S.classes[0]) S.classes[0].w = num;
  } else if(ruleKey === "clearance"){
    if(typeof reCls === "function" && reCls()) reCls().clr = num;
    else if(Array.isArray(S.classes) && S.classes[0]) S.classes[0].clr = num;
  } else if(ruleKey === "drill"){
    if(typeof reCls === "function" && reCls()) reCls().drill = num;
    else if(Array.isArray(S.classes) && S.classes[0]) S.classes[0].drill = num;
  } else if(ruleKey === "viaDia"){
    if(typeof reCls === "function" && reCls()) reCls().via = num;
    else if(Array.isArray(S.classes) && S.classes[0]) S.classes[0].via = num;
  } else if(ruleKey === "edge"){
    if(S.rule){
      S.rule.edge = num;
      if(typeof boardChanged === "function") boardChanged();
    }
  } else if(ruleKey === "mask"){
    if(S.rule) S.rule.mask = num;
  } else if(ruleKey === "paste"){
    if(S.rule) S.rule.paste = num;
  } else if(ruleKey === "thermal"){
    if(S.rule) S.rule.thermal = num;
  }
}

/* Règle une valeur Min / Typique / Max avec verrouillage automatique par les capabilités fabricant */
function pcbSetProjectDesignRule(ruleKey, field, val){
  const rules = pcbGetProjectDesignRules();
  if(!rules[ruleKey]) return false;
  const limits = pcbGetMfgLimits();
  const lim = limits[ruleKey] || { min: 0.05, max: 10.0 };
  const r = rules[ruleKey];
  const num = Math.round(Number(val) * 1000) / 1000;
  if(isNaN(num)) return false;

  if(typeof push === "function") push();

  if(field === "min"){
    // Min ne peut pas descendre sous la borne usine absolue
    const clamped = Math.max(lim.min, num);
    // Min ne peut pas dépasser Typique
    r.min = Math.min(clamped, r.typ);
  } else if(field === "typ"){
    // Typique doit être compris entre Min et Max
    r.typ = Math.min(Math.max(r.min, num), r.max);
    pcbPropagateTypiqueToProject(ruleKey, r.typ);
  } else if(field === "max"){
    // Max ne peut pas dépasser le plafond usine machine
    const clamped = Math.min(lim.max, num);
    // Max ne peut pas être inférieur à Typique
    r.max = Math.max(clamped, r.typ);
  }

  if(typeof touch === "function") touch();
  if(typeof refreshPanels === "function") refreshPanels();
  if(typeof draw === "function") draw();
  return true;
}

/* Applique l'ensemble des règles de conception du projet au routage et aux classes */
function pcbApplyProjectDesignRules(){
  const rules = pcbGetProjectDesignRules();
  if(typeof push === "function") push();

  for(const k in rules){
    pcbPropagateTypiqueToProject(k, rules[k].typ);
  }

  // Recaler les classes de net qui seraient sous les minima de sécurité
  if(Array.isArray(S.classes)){
    S.classes.forEach(c => {
      if(c.w < rules.trackWidth.min) c.w = rules.trackWidth.min;
      if(c.clr < rules.clearance.min) c.clr = rules.clearance.min;
      if(c.drill < rules.drill.min) c.drill = rules.drill.min;
      if(c.via < rules.viaDia.min) c.via = rules.viaDia.min;
    });
  }

  if(typeof touch === "function") touch();
  if(typeof zoneCache !== "undefined" && zoneCache.clear) zoneCache.clear();
  if(typeof refreshPanels === "function") refreshPanels();
  if(typeof draw === "function") draw();
  if(typeof reSync === "function") reSync();
  return { ok: true, rules: rules };
}

/* Réinitialise les règles de conception aux valeurs recommandées par le fabricant */
function pcbResetRulesToMfgRecommendations(profileId){
  const prof = pcbGetMfgProfile(profileId);
  if(typeof push === "function") push();
  if(!S.rule) pcbEnsureDefaultProjectRules();
  S.rule.designRules = pcbGetDefaultDesignRules(prof);
  pcbApplyProjectDesignRules();
  return S.rule.designRules;
}

/* Audit de conformité des règles de conception face aux capabilités machine usine */
function pcbAuditRulesAgainstMfg(designRules, profile){
  const rules = designRules || pcbGetProjectDesignRules();
  const limits = pcbGetMfgLimits(profile);
  const audit = [];

  for(const k in PCB_RULE_METAS){
    const meta = PCB_RULE_METAS[k];
    const r = rules[k] || { min: 0, typ: 0, max: 0 };
    const lim = limits[k] || { min: 0, max: 10 };
    const errs = [];

    if(r.min < lim.min - 1e-6) errs.push("Min (" + r.min + ") sous la capabilité usine (" + lim.min + ")");
    if(r.max > lim.max + 1e-6) errs.push("Max (" + r.max + ") au-dessus du max usine (" + lim.max + ")");
    if(r.typ < r.min - 1e-6 || r.typ > r.max + 1e-6) errs.push("Typique (" + r.typ + ") hors intervalle [" + r.min + ", " + r.max + "]");

    audit.push({
      key: k,
      label: meta.label,
      desc: meta.desc,
      unit: meta.unit,
      min: r.min,
      typ: r.typ,
      max: r.max,
      mfgMin: lim.min,
      mfgMax: lim.max,
      ok: errs.length === 0,
      msg: errs.length === 0 ? "Conforme aux capabilités" : errs.join(" ; ")
    });
  }
  return audit;
}

function pcbImportMfgProfileFromJson(jsonStr){
  try {
    const data = typeof jsonStr === "string" ? JSON.parse(jsonStr) : jsonStr;
    if(!data || typeof data !== "object") throw new Error("JSON invalide");
    const id = String(data.id || ("custom_" + Date.now())).toLowerCase().replace(/[^a-z0-9_]/g, "_");
    const name = String(data.name || "Profil importé");
    
    // Fusionner sur le canevas de JLCPCB pour garantir que tous les champs existent
    const base = JSON.parse(JSON.stringify(PCB_DEFAULT_MFG_PROFILES.jlcpcb));
    const merged = Object.assign(base, data, { id: id, name: name, _custom: true });
    
    PCB_MFG_PROFILES[id] = merged;
    pcbSaveMfgProfiles();
    pcbSetActiveMfgProfile(id);
    return { ok: true, profile: merged };
  } catch(err){
    return { ok: false, error: err.message };
  }
}

function pcbImportMfgProfileFromFile(file){
  return new Promise((resolve) => {
    if(!file){
      resolve({ ok: false, error: "Aucun fichier sélectionné" });
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const res = pcbImportMfgProfileFromJson(e.target.result);
        resolve(res);
      } catch(err){
        resolve({ ok: false, error: err.message });
      }
    };
    reader.onerror = () => resolve({ ok: false, error: "Erreur lors de la lecture du fichier" });
    reader.readAsText(file);
  });
}

function pcbExportMfgProfileToJson(id){
  const p = pcbGetMfgProfile(id);
  return JSON.stringify(p, null, 2);
}

function pcbCreateCustomMfgProfile(baseId, newId, newName){
  const base = pcbGetMfgProfile(baseId || "jlcpcb");
  const id = String(newId || ("custom_" + Date.now())).toLowerCase().replace(/[^a-z0-9_]/g, "_");
  const name = String(newName || ("Profil " + id));
  const cloned = JSON.parse(JSON.stringify(base));
  cloned.id = id;
  cloned.name = name;
  cloned.version = "Custom 1.0";
  cloned.description = "Profil personnalisé dérivé de " + base.name;
  cloned._custom = true;
  PCB_MFG_PROFILES[id] = cloned;
  pcbSaveMfgProfiles();
  pcbSetActiveMfgProfile(id);
  return cloned;
}

function pcbDeleteCustomMfgProfile(id){
  if(!id || PCB_DEFAULT_MFG_PROFILES[id]) return false;
  if(PCB_MFG_PROFILES[id]){
    delete PCB_MFG_PROFILES[id];
    pcbSaveMfgProfiles();
    pcbSetActiveMfgProfile("jlcpcb");
    return true;
  }
  return false;
}

async function pcbFetchAvailableProfiles(){
  if(typeof fetch === "undefined") return;
  const list = ["jlcpcb", "generique", "eurocircuits", "pcbway"];
  for(const id of list){
    try {
      const resp = await fetch("../profils/fabricants/" + id + ".json");
      if(resp.ok){
        const data = await resp.json();
        if(data && data.id && data.name){
          PCB_DEFAULT_MFG_PROFILES[data.id] = data;
          if(!PCB_MFG_PROFILES[data.id] || !PCB_MFG_PROFILES[data.id]._custom){
            PCB_MFG_PROFILES[data.id] = data;
          }
        }
      }
    } catch(_){}
  }
}

/* ---------- Application automatique des règles au projet ---------- */

function pcbApplyMfgProfileToProject(profileId, options){
  const prof = pcbGetMfgProfile(profileId);
  if(!prof) return null;
  
  if(typeof S !== "undefined"){
    // S'assurer que les règles et classes de base existent (création si absentes)
    pcbEnsureDefaultProjectRules();
    
    if(typeof push === "function") push();
    
    S.rule.mfgProfile = prof.id;
    const changes = [];
    
    // 1. Marge au bord de carte
    const reqEdge = (prof.outline && prof.outline.routed && prof.outline.routed.copperClearance) || 0.20;
    if(S.rule.edge < reqEdge){
      changes.push("Marge au bord : " + S.rule.edge + " mm → " + reqEdge + " mm");
      S.rule.edge = reqEdge;
      if(typeof boardChanged === "function") boardChanged();
    }
    
    // 2. Trou à trou (spacing via/via)
    const reqHole = (prof.drilling && prof.drilling.spacing && prof.drilling.spacing.viaHoleToHole) || 0.20;
    if(S.rule.hole < reqHole){
      changes.push("Trou à trou : " + S.rule.hole + " mm → " + reqHole + " mm");
      S.rule.hole = reqHole;
    }
    
    // 3. Masque de soudure
    if(prof.general && prof.general.solderMask){
      const sm = prof.general.solderMask;
      if(sm.expansionRatio === "1:1" && S.rule.mask !== 0.0){
        changes.push("Expansion masque : " + S.rule.mask + " mm → 0.00 mm (1:1 LDI)");
        S.rule.mask = 0.0;
      }
    }
    
    // 4. Classes de net (piste min, isolation min, via min, drill min, couronne min)
    const isMulti = (S.cu || 2) > 2;
    const wIdx = isMulti && prof.copper.weights[1] ? 1 : 0;
    const minW = prof.copper.weights[wIdx]?.minTrackWidth || 0.10;
    const minClr = prof.copper.weights[wIdx]?.minTrackSpacing || 0.10;
    const minDrill = (S.cu || 2) === 1 ? (prof.drilling.drillDiameterMin?.layer1 || 0.3) : (prof.drilling.drillDiameterMin?.layer2Plus || 0.15);
    const minViaDia = (prof.drilling.vias && prof.drilling.vias.minViaDiameter) || 0.25;
    const minRing = prof.copper.pthAnnularRingMinOverall || 0.18;
    
    if(Array.isArray(S.classes)){
      S.classes.forEach(c => {
        let mod = false;
        if(c.w < minW){ c.w = minW; mod = true; }
        if(c.clr < minClr){ c.clr = minClr; mod = true; }
        if(c.drill < minDrill){ c.drill = minDrill; mod = true; }
        if(c.via < minViaDia){ c.via = minViaDia; mod = true; }
        // Garantir l'anneau annulaire
        const neededVia = Math.round((c.drill + 2 * minRing) * 1000) / 1000;
        if(c.via < neededVia){ c.via = neededVia; mod = true; }
        if(mod) changes.push("Classe « " + c.name + " » ajustée aux minima (w=" + c.w + ", clr=" + c.clr + ", via=" + c.via + ", drill=" + c.drill + ")");
      });
    }
    
    // Créer une classe dédiée au fabricant si demandée ou si aucune classe spécifique n'existe
    if(options && options.createDedicatedClass){
      const dedicatedName = prof.name + " Standard";
      if(!S.classes.some(x => x.name === dedicatedName)){
        const defW = Math.max(minW, 0.20);
        const defClr = Math.max(minClr, 0.20);
        const defDrill = Math.max(minDrill, 0.30);
        const defVia = Math.max(minViaDia, defDrill + 0.30);
        S.classes.push({ name: dedicatedName, w: defW, clr: defClr, via: defVia, drill: defDrill });
        changes.push("Nouvelle classe de conception créée : « " + dedicatedName + " »");
      }
    }
    
    // 5. Matrice d'isolation via/via et cuivre
    if(typeof matSet === "function" && typeof matGet === "function"){
      const v2v = (prof.copper && prof.copper.viaHoleToTrack) || 0.20;
      if(matGet("via","via") < v2v){
        matSet("via","via", v2v);
        changes.push("Matrice Via ↔ Via relevée à " + v2v + " mm");
      }
      const cuTrk = (prof.copper && prof.copper.padToTrackClearance) || 0.10;
      if(matGet("cu","trk") < cuTrk){
        matSet("cu","trk", cuTrk);
        changes.push("Matrice Cuivre ↔ Piste relevée à " + cuTrk + " mm");
      }
      const cuVia = (prof.copper && prof.copper.innerLayerViaHoleToCopper) || 0.20;
      if(matGet("cu","via") < cuVia){
        matSet("cu","via", cuVia);
        changes.push("Matrice Cuivre ↔ Via relevée à " + cuVia + " mm");
      }
    }
    
    if(typeof touch === "function") touch();
    if(typeof zoneCache !== "undefined" && zoneCache.clear) zoneCache.clear();
    if(typeof refreshPanels === "function") refreshPanels();
    if(typeof draw === "function") draw();
    if(typeof reSync === "function") reSync();
    
    return { ok: true, changes: changes, profile: prof };
  }
  return { ok: true, changes: [], profile: prof };
}

/* ---------- Audit de conformité de la carte par rapport au profil fabricant ---------- */

function pcbAuditBoardAgainstMfg(profile){
  const p = profile || pcbGetMfgProfile();
  if(!p || typeof S === "undefined") return [];
  
  const items = [];
  
  // 1. Nombre de couches
  const cu = S.cu || 2;
  const maxCu = (p.general && p.general.layerCount && p.general.layerCount.max) || 32;
  const minCu = (p.general && p.general.layerCount && p.general.layerCount.min) || 1;
  items.push({
    cat: "Général",
    label: "Nombre de couches",
    val: cu + " couche(s)",
    limit: minCu + " - " + maxCu + " couches",
    ok: cu >= minCu && cu <= maxCu,
    msg: cu > maxCu ? "Dépasse le maximum fabricant de " + maxCu + " couches" : "Conforme aux capabilités"
  });
  
  // 2. Impédance contrôlée (si des paires diff existent)
  const hasDp = Array.isArray(S.dpPairs) && S.dpPairs.length > 0;
  if(p.general && p.general.controlledImpedance){
    const supp = p.general.controlledImpedance.layers || [];
    const okZ = !hasDp || supp.includes(cu);
    items.push({
      cat: "Général",
      label: "Impédance contrôlée",
      val: cu + " couche(s) (" + (hasDp ? S.dpPairs.length + " paire(s)" : "aucune paire") + ")",
      limit: "Couches permises : " + supp.join(", "),
      ok: okZ,
      msg: okZ ? "Supportée (tolérance ±" + p.general.controlledImpedance.tolerancePercent + "%)" : "Non supportée sur " + cu + " couche(s) (4 couches min requis chez " + p.name + ")"
    });
  }
  
  // 3. Dimensions de la carte
  const bw = (S.board && S.board.w) || 100;
  const bh = (S.board && S.board.h) || 80;
  let maxW = 670, maxH = 600;
  if(p.dimensions && p.dimensions.max){
    if(cu === 1 && p.dimensions.max.fr4_1layer) { maxW = p.dimensions.max.fr4_1layer.w; maxH = p.dimensions.max.fr4_1layer.h; }
    else if(cu === 2 && p.dimensions.max.fr4_2layer) { maxW = p.dimensions.max.fr4_2layer.w; maxH = p.dimensions.max.fr4_2layer.h; }
    else if(cu === 4 && p.dimensions.max.fr4_4layer) { maxW = p.dimensions.max.fr4_4layer.w; maxH = p.dimensions.max.fr4_4layer.h; }
    else if(cu >= 6 && p.dimensions.max.fr4_multilayer) { maxW = p.dimensions.max.fr4_multilayer.w; maxH = p.dimensions.max.fr4_multilayer.h; }
    else if(p.dimensions.max.standard) { maxW = p.dimensions.max.standard.w; maxH = p.dimensions.max.standard.h; }
  }
  const minDim = (p.dimensions && p.dimensions.min && p.dimensions.min.fr4_rogers_ptfe && p.dimensions.min.fr4_rogers_ptfe.w) ||
                 (p.dimensions && p.dimensions.min && p.dimensions.min.standard && p.dimensions.min.standard.w) || 3;
  const okDim = Math.max(bw, bh) <= Math.max(maxW, maxH) && Math.min(bw, bh) <= Math.min(maxW, maxH) && bw >= minDim && bh >= minDim;
  items.push({
    cat: "Dimensions",
    label: "Format de la carte",
    val: bw.toFixed(1) + " × " + bh.toFixed(1) + " mm",
    limit: "Min " + minDim + "×" + minDim + " mm, Max " + maxW + "×" + maxH + " mm",
    ok: okDim,
    msg: okDim ? "Conforme aux dimensions maximales machine" : "Hors des limites d'usinage fabricant"
  });
  
  // 4. Plus fine piste posée
  let minTrackW = Infinity;
  if(Array.isArray(S.tracks) && S.tracks.length){
    for(const t of S.tracks){
      if(t.w < minTrackW) minTrackW = t.w;
    }
  }
  const isMulti = cu > 2;
  const wIdx = isMulti && p.copper?.weights && p.copper.weights[1] ? 1 : 0;
  const reqTrackW = (p.copper?.weights && p.copper.weights[wIdx]?.minTrackWidth) || 0.10;
  if(minTrackW !== Infinity){
    items.push({
      cat: "Cuivre",
      label: "Largeur de piste min",
      val: minTrackW.toFixed(3) + " mm",
      limit: "≥ " + reqTrackW.toFixed(3) + " mm (1 oz)",
      ok: minTrackW >= reqTrackW - 1e-6,
      msg: minTrackW >= reqTrackW - 1e-6 ? "Conforme" : "Piste sous la tolérance minimale fabricant (" + reqTrackW + " mm)"
    });
  }
  
  // 5. Perçage minimal (vias & pastilles)
  let minHole = Infinity;
  if(Array.isArray(S.vias)){
    for(const v of S.vias) if(v.drill > 0 && v.drill < minHole) minHole = v.drill;
  }
  if(Array.isArray(S.fps)){
    for(const fp of S.fps){
      if(typeof padsWorld === "function"){
        for(const q of padsWorld(fp)){
          if(q.drill > 0 && q.drill < minHole) minHole = q.drill;
        }
      }
    }
  }
  const reqDrill = cu === 1 ? (p.drilling?.drillDiameterMin?.layer1 || 0.3) : (p.drilling?.drillDiameterMin?.layer2Plus || 0.15);
  if(minHole !== Infinity){
    items.push({
      cat: "Perçage",
      label: "Diamètre de perçage min",
      val: minHole.toFixed(3) + " mm",
      limit: "≥ " + reqDrill.toFixed(3) + " mm",
      ok: minHole >= reqDrill - 1e-6,
      msg: minHole >= reqDrill - 1e-6 ? "Conforme" : "Perçage trop fin pour le foret mécanique minimal"
    });
  }
  
  // 6. Diamètre et perçage de via min
  let minViaD = Infinity;
  if(Array.isArray(S.vias)){
    for(const v of S.vias) if(v.d > 0 && v.d < minViaD) minViaD = v.d;
  }
  const reqViaD = (p.drilling?.vias?.minViaDiameter) || 0.25;
  if(minViaD !== Infinity){
    items.push({
      cat: "Perçage",
      label: "Diamètre de via min",
      val: minViaD.toFixed(3) + " mm",
      limit: "≥ " + reqViaD.toFixed(3) + " mm",
      ok: minViaD >= reqViaD - 1e-6,
      msg: minViaD >= reqViaD - 1e-6 ? "Conforme" : "Via sous le diamètre minimal fabricant de " + reqViaD + " mm"
    });
  }
  
  // 7. Anneau annulaire (couronne restante)
  let minRing = Infinity;
  if(Array.isArray(S.vias)){
    for(const v of S.vias){
      if(v.d > v.drill){
        const ring = (v.d - v.drill) / 2;
        if(ring < minRing) minRing = ring;
      }
    }
  }
  const reqRing = isMulti ? (p.copper?.weights && p.copper.weights[1]?.pthAnnularRingMin || 0.15) : (p.copper?.weights && p.copper.weights[0]?.pthAnnularRingMin || 0.18);
  if(minRing !== Infinity){
    items.push({
      cat: "Cuivre",
      label: "Anneau annulaire min (via)",
      val: minRing.toFixed(3) + " mm",
      limit: "≥ " + reqRing.toFixed(3) + " mm",
      ok: minRing >= reqRing - 1e-6,
      msg: minRing >= reqRing - 1e-6 ? "Conforme" : "Risque de rupture de pastille (breakout au perçage)"
    });
  }
  
  // 8. Trous NPTH (non métallisés)
  let minNpth = Infinity;
  if(Array.isArray(S.holes)){
    for(const h of S.holes) if(h.d > 0 && h.d < minNpth) minNpth = h.d;
  }
  const reqNpth = (p.drilling?.minNpthHole) || 0.50;
  if(minNpth !== Infinity){
    items.push({
      cat: "Perçage",
      label: "Trou NPTH min",
      val: minNpth.toFixed(2) + " mm",
      limit: "≥ " + reqNpth.toFixed(2) + " mm",
      ok: minNpth >= reqNpth - 1e-6,
      msg: minNpth >= reqNpth - 1e-6 ? "Conforme" : "NPTH inférieur au seuil minimal fabricant"
    });
  }
  
  // 9. Marge au contour
  const edge = (S.rule && S.rule.edge) || 0.4;
  const reqEdge = (p.outline?.routed?.copperClearance) || 0.20;
  items.push({
    cat: "Contour",
    label: "Marge cuivre/contour",
    val: edge.toFixed(2) + " mm",
    limit: "≥ " + reqEdge.toFixed(2) + " mm",
    ok: edge >= reqEdge - 1e-6,
    msg: edge >= reqEdge - 1e-6 ? "Conforme" : "Risque d'arrachement de cuivre au fraisage CNC"
  });
  
  // 10. Sérigraphie
  let minSilkLineWidth = Infinity;
  let minSilkTextH = Infinity;
  if(Array.isArray(S.drawings)){
    for(const d of S.drawings){
      if(d.shape === "text" || d.type === "text"){
        const h = d.height || d.size || 1.5;
        if(h < minSilkTextH) minSilkTextH = h;
      }
      if(d.width > 0 && d.width < minSilkLineWidth) minSilkLineWidth = d.width;
    }
  }
  const reqSilkW = (p.silkscreen?.minLineWidth) || 0.15;
  const reqSilkH = (p.silkscreen?.minTextHeight) || 1.0;
  if(minSilkLineWidth !== Infinity){
    items.push({
      cat: "Sérigraphie",
      label: "Trait sérigraphie min",
      val: minSilkLineWidth.toFixed(2) + " mm",
      limit: "≥ " + reqSilkW.toFixed(2) + " mm",
      ok: minSilkLineWidth >= reqSilkW - 1e-6,
      msg: minSilkLineWidth >= reqSilkW - 1e-6 ? "Conforme" : "Trait illisible ou bouché à l'impression"
    });
  }
  if(minSilkTextH !== Infinity){
    items.push({
      cat: "Sérigraphie",
      label: "Hauteur texte sérigraphie min",
      val: minSilkTextH.toFixed(2) + " mm",
      limit: "≥ " + reqSilkH.toFixed(2) + " mm (40 mil)",
      ok: minSilkTextH >= reqSilkH - 1e-6,
      msg: minSilkTextH >= reqSilkH - 1e-6 ? "Conforme" : "Texte trop petit pour la résolution sérigraphique"
    });
  }
  
  return items;
}

// Initialisation immédiate au chargement
pcbLoadMfgProfiles();
if(typeof window !== "undefined" && typeof window.addEventListener === "function"){
  window.addEventListener("DOMContentLoaded", () => {
    pcbFetchAvailableProfiles();
  });
}

// Export environnement Node (pour les tests)
if(typeof module !== "undefined" && module.exports){
  module.exports = {
    PCB_DEFAULT_MFG_PROFILES,
    PCB_MFG_PROFILES,
    pcbLoadMfgProfiles,
    pcbSaveMfgProfiles,
    pcbGetMfgProfile,
    pcbGetActiveMfgProfileId,
    pcbSetActiveMfgProfile,
    pcbEnsureDefaultProjectRules,
    pcbImportMfgProfileFromJson,
    pcbImportMfgProfileFromFile,
    pcbExportMfgProfileToJson,
    pcbCreateCustomMfgProfile,
    pcbDeleteCustomMfgProfile,
    pcbApplyMfgProfileToProject,
    pcbAuditBoardAgainstMfg,
    pcbFetchAvailableProfiles,
    PCB_RULE_METAS,
    pcbGetMfgLimits,
    pcbGetDefaultDesignRules,
    pcbGetProjectDesignRules,
    pcbSetProjectDesignRule,
    pcbPropagateTypiqueToProject,
    pcbApplyProjectDesignRules,
    pcbResetRulesToMfgRecommendations,
    pcbAuditRulesAgainstMfg
  };
}
