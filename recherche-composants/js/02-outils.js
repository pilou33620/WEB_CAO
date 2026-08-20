"use strict";
/* =============================================================================
   recherche-composants — 02-outils.js
   Catalogue des 14 outils de pcbparts.dev : libellés français, champs du
   formulaire et colonnes de résultats.

   Ce catalogue habille l'API, il ne la remplace pas : le formulaire est bâti à
   partir des schémas renvoyés par /api/tools (voir 03-formulaire.js). Un
   paramètre ajouté côté serveur apparaît donc automatiquement en fin de
   formulaire, même s'il n'est pas décrit ici.

   Un outil marqué « fiche:true » renvoie un enregistrement unique (une pièce,
   une carte, une règle) : il est présenté en fiche plutôt qu'en tableau.

   Types de champ : texte, nombre, case (booléen), choix, liste (valeurs
   séparées par des virgules -> tableau), json (texte libre analysé en JSON),
   trois (booléen à trois états : indifférent / oui / non).
   ============================================================================= */

/* ---------- familles affichées dans le panneau « Outils » ---------- */
const FAMILLES=[
  {nom:"JLCPCB / LCSC",
   outils:["jlc_search","jlc_stock_check","jlc_get_part","jlc_find_alternatives",
           "jlc_get_pinout","jlc_search_help"]},
  {nom:"Distributeurs",
   outils:["mouser_get_part","digikey_get_part"]},
  {nom:"Modèles CAO",
   outils:["cse_search","cse_get_kicad"]},
  {nom:"Capteurs & cartes",
   outils:["sensor_recommend","board_search","board_get"]},
  {nom:"Règles de conception",
   outils:["get_design_rules"]}
];

const CHOIX_BIBLIO=[["","(indifférent)"],["basic","Basic"],["preferred","Preferred"],
                    ["no_fee","Sans frais de pose"],["extended","Extended"],["all","Tous"]];

const OUTILS={
  jlc_search:{
    titre:"Recherche JLCPCB",
    resume:"Recherche rapide dans la base JLCPCB, en langage naturel. Pièces en stock "+
           "uniquement (stock ≥ 10). Exemples : « 10k resistor 0603 1% », "+
           "« STM32F103 LQFP48 », « 10uF 25V X7R 0805 ».",
    champs:[
      {cle:"query",lib:"Requête",t:"texte",large:true,ph:"10k resistor 0603 1%"},
      {cle:"package",lib:"Boîtier",t:"texte",ph:"0603, SOT-23, LQFP48"},
      {cle:"packages",lib:"Boîtiers (ou)",t:"liste",ph:"0402, 0603, 0805"},
      {cle:"manufacturer",lib:"Fabricant",t:"texte"},
      {cle:"subcategory_name",lib:"Sous-catégorie",t:"texte",ph:"MOSFETs"},
      {cle:"library_type",lib:"Bibliothèque",t:"choix",choix:CHOIX_BIBLIO},
      {cle:"sort_by",lib:"Tri",t:"choix",
       choix:[["stock","Stock décroissant"],["price","Prix croissant"]]},
      {cle:"min_stock",lib:"Stock minimum",t:"nombre"},
      {cle:"limit",lib:"Nombre de résultats",t:"nombre"},
      {cle:"prefer_no_fee",lib:"Basic/Preferred d'abord",t:"case"},
      {cle:"match_all_terms",lib:"Tous les termes (ET)",t:"case"},
      {cle:"spec_filters",lib:"Filtres paramétriques (JSON)",t:"json",large:true,
       aide:'Liste d’objets, par exemple : [{"name":"Resistance","op":"=","value":"10kOhm"}]'}
    ],
    colonnes:["lcsc","model","manufacturer","package","stock","price","library_type"]
  },

  jlc_stock_check:{
    titre:"Stock en direct",
    resume:"Vérification du stock via l'API JLCPCB en direct. Plus lent que la "+
           "recherche : à réserver au contrôle final avant commande.",
    champs:[
      {cle:"query",lib:"Requête",t:"texte",large:true,ph:"ESP32, 10uF 25V…"},
      {cle:"category_name",lib:"Catégorie",t:"texte",ph:"Resistors"},
      {cle:"subcategory_name",lib:"Sous-catégorie",t:"texte",ph:"Tactile Switches"},
      {cle:"package",lib:"Boîtier",t:"texte"},
      {cle:"manufacturer",lib:"Fabricant",t:"texte"},
      {cle:"library_type",lib:"Bibliothèque",t:"choix",choix:CHOIX_BIBLIO},
      {cle:"sort_by",lib:"Tri",t:"choix",
       choix:[["","(défaut)"],["quantity","Quantité"],["price","Prix"]]},
      {cle:"min_stock",lib:"Stock minimum",t:"nombre",aide:"0 pour voir les ruptures"},
      {cle:"page",lib:"Page",t:"nombre"},
      {cle:"limit",lib:"Nombre de résultats",t:"nombre"}
    ],
    colonnes:["lcsc","model","manufacturer","package","stock","price","library_type"]
  },

  jlc_get_part:{
    titre:"Fiche d'un composant",fiche:true,
    resume:"Fiche complète d'une référence : prix par palier, stock, "+
           "caractéristiques, documentation.",
    champs:[
      {cle:"lcsc",lib:"Code LCSC",t:"texte",ph:"C25804"},
      {cle:"mpn",lib:"Référence fabricant",t:"texte",ph:"LM358P"}
    ]
  },

  jlc_find_alternatives:{
    titre:"Équivalences",
    resume:"Composants équivalents à une référence donnée : utile quand une "+
           "pièce passe en rupture ou coûte trop cher.",
    champs:[
      {cle:"lcsc",lib:"Code LCSC",t:"texte",ph:"C2557"},
      {cle:"same_package",lib:"Même boîtier",t:"case"},
      {cle:"library_type",lib:"Bibliothèque",t:"choix",choix:CHOIX_BIBLIO},
      {cle:"has_easyeda_footprint",lib:"Empreinte EasyEDA",t:"trois"},
      {cle:"min_stock",lib:"Stock minimum",t:"nombre"},
      {cle:"limit",lib:"Nombre de résultats",t:"nombre"}
    ],
    colonnes:["lcsc","model","manufacturer","package","stock","price","library_type"]
  },

  jlc_get_pinout:{
    titre:"Brochage",
    resume:"Brochage d'un composant, extrait du symbole EasyEDA. Les noms "+
           "obtenus se recopient dans l'éditeur de brochage du schématique.",
    champs:[
      {cle:"lcsc",lib:"Code LCSC",t:"texte",ph:"C8304"},
      {cle:"uuid",lib:"UUID du symbole",t:"texte"}
    ],
    colonnes:["number","name"]
  },

  jlc_search_help:{
    titre:"Catégories JLCPCB",
    resume:"Sans paramètre : la liste des catégories. Avec une catégorie : ses "+
           "sous-catégories. Avec une sous-catégorie : les attributs filtrables, "+
           "à reporter dans les filtres paramétriques de la recherche.",
    champs:[
      {cle:"category",lib:"Catégorie",t:"texte",ph:"Connectors ou 13"},
      {cle:"subcategory",lib:"Sous-catégorie",t:"texte",ph:"MOSFETs ou 2954"}
    ]
  },

  mouser_get_part:{
    titre:"Recoupement Mouser",
    resume:"Recherche d'une référence précise chez Mouser. Quota journalier : "+
           "à utiliser après la recherche JLCPCB, pas à sa place.",
    champs:[
      {cle:"part_number",lib:"Référence",t:"texte",large:true,ph:"595-LM358P ou LM358P"}
    ]
  },

  digikey_get_part:{
    titre:"Recoupement DigiKey",
    resume:"Recherche d'une référence précise chez DigiKey. Quota journalier.",
    champs:[
      {cle:"product_number",lib:"Référence",t:"texte",large:true,ph:"296-1395-5-ND ou LM358P"}
    ]
  },

  cse_search:{
    titre:"Modèles CAO disponibles",
    resume:"Interroge ComponentSearchEngine (SamacSys) : disponibilité d'un "+
           "symbole, d'une empreinte, d'un modèle 3D et de la documentation.",
    champs:[
      {cle:"query",lib:"Référence ou mot-clé",t:"texte",large:true,ph:"LM358P, ESP32…"},
      {cle:"limit",lib:"Nombre de résultats",t:"nombre"}
    ],
    colonnes:["mfr_part_number","manufacturer","description","pin_count","has_model","has_3d"]
  },

  cse_get_kicad:{
    titre:"Symbole et empreinte KiCad",fiche:true,
    resume:"Récupère le symbole schématique et l'empreinte KiCad d'un composant. "+
           "Le texte renvoyé s'enregistre tel quel dans une bibliothèque KiCad.",
    champs:[
      {cle:"query",lib:"Référence fabricant",t:"texte",large:true,ph:"STM32F103CBT6"},
      {cle:"part_id",lib:"Identifiant CSE",t:"nombre",aide:"issu d'une recherche précédente"}
    ]
  },

  sensor_recommend:{
    titre:"Choix d'un capteur",
    resume:"Propose des circuits et modules de mesure selon la grandeur à "+
           "mesurer, la technologie, le bus et la plateforme visée.",
    champs:[
      {cle:"query",lib:"Recherche libre",t:"texte",large:true,ph:"BME280, température étanche…"},
      {cle:"measure",lib:"Grandeurs mesurées",t:"liste",ph:"temperature, pressure"},
      {cle:"type",lib:"Technologie",t:"texte",ph:"tof, ndir, mems…"},
      {cle:"protocol",lib:"Bus",t:"choix",
       choix:[["","(indifférent)"],["i2c","I²C"],["spi","SPI"],["uart","UART"],
              ["one_wire","1-Wire"],["analog","Analogique"],["digital","Numérique"],["pwm","PWM"]]},
      {cle:"platform",lib:"Plateforme",t:"choix",
       choix:[["","(indifférente)"],["arduino","Arduino"],["esphome","ESPHome"],
              ["micropython","MicroPython"],["circuitpython","CircuitPython"],
              ["tasmota","Tasmota"],["zephyr","Zephyr"]]},
      {cle:"limit",lib:"Nombre de résultats",t:"nombre"}
    ],
    colonnes:["name","manufacturer","type","voltage","measures","protocols","platform_count"]
  },

  board_search:{
    titre:"Cartes de référence",
    resume:"Environ 285 schémas de cartes libres, cherchables par mot-clé, par "+
           "circuit intégré ou par thème. De quoi comparer son schéma à une "+
           "réalisation éprouvée.",
    champs:[
      {cle:"query",lib:"Recherche libre",t:"texte",large:true,ph:"ESP32 battery"},
      {cle:"component",lib:"Circuit utilisé",t:"texte",ph:"DRV8825, MCP73831…"},
      {cle:"tag",lib:"Thèmes",t:"liste",ph:"power-supply, sensors"},
      {cle:"org",lib:"Organisation",t:"texte",ph:"Adafruit, SparkFun…"},
      {cle:"layers",lib:"Nombre de couches",t:"nombre"},
      {cle:"limit",lib:"Nombre de résultats",t:"nombre"}
    ],
    colonnes:["slug","name","org_display","key_coverage","layers","component_count"]
  },

  board_get:{
    titre:"Détail d'une carte",fiche:true,
    resume:"Contenu d'une carte de référence. La netlist complète peut être très "+
           "volumineuse : ne la demander qu'au besoin.",
    champs:[
      {cle:"slug",lib:"Identifiant de la carte",t:"texte",large:true,
       ph:"adafruit-esp32-s3-feather"},
      {cle:"focus",lib:"Centrer sur un circuit",t:"texte",ph:"MAX17048"},
      {cle:"include_bom",lib:"Inclure les passifs",t:"case"},
      {cle:"include_nets",lib:"Inclure la netlist",t:"case",aide:"réponse parfois > 100 ko"}
    ]
  },

  get_design_rules:{
    titre:"Règles de conception",fiche:true,
    resume:"Fiches de bonnes pratiques : alimentation, USB, ESD, ESP32, "+
           "découplage, régulateurs… Sans mot-clé, la liste des sujets.",
    champs:[
      {cle:"topic",lib:"Sujet",t:"texte",large:true,ph:"ldo, usb, esd, esp32…"}
    ]
  }
};

/* ---------- colonnes : libellé et mise en forme ---------- */
const COLONNES={
  lcsc            :{lib:"LCSC",classe:"code"},
  model           :{lib:"Référence"},
  mpn             :{lib:"Référence"},
  mfr_part_number :{lib:"Référence",classe:"code"},
  manufacturer    :{lib:"Fabricant",classe:"dim"},
  package         :{lib:"Boîtier"},
  stock           :{lib:"Stock",classe:"num",fmt:"entier"},
  price           :{lib:"Prix 1+",classe:"num",fmt:"prix"},
  price_10        :{lib:"Prix 1000+",classe:"num",fmt:"prix"},
  library_type    :{lib:"Bibliothèque",fmt:"tag"},
  description     :{lib:"Description",classe:"dim"},
  subcategory     :{lib:"Sous-catégorie",classe:"dim"},
  number          :{lib:"Broche",classe:"code"},
  name            :{lib:"Nom"},
  pin_count       :{lib:"Broches",classe:"num"},
  has_model       :{lib:"Modèle",fmt:"oui"},
  has_3d          :{lib:"3D",fmt:"oui"},
  slug            :{lib:"Identifiant",classe:"code"},
  org_display     :{lib:"Organisation",classe:"dim"},
  key_coverage    :{lib:"Contenu",classe:"dim"},
  layers          :{lib:"Couches",classe:"num"},
  component_count :{lib:"Composants",classe:"num"},
  measures        :{lib:"Mesure"},
  protocols       :{lib:"Bus"},
  platform_count  :{lib:"Plateformes",classe:"num"},
  voltage         :{lib:"Tension"},
  type            :{lib:"Type"},
  count           :{lib:"Références",classe:"num",fmt:"entier"},
  id              :{lib:"Id",classe:"code"},
  subcategory_count:{lib:"Sous-catégories",classe:"num"},
  /* libellés utilisés aussi comme titres de section dans la fiche */
  specs           :{lib:"Caractéristiques"},
  prices          :{lib:"Paliers de prix"},
  pins            :{lib:"Broches"},
  components      :{lib:"Composants"},
  neighborhoods   :{lib:"Voisinages des circuits"},
  key_ics         :{lib:"Circuits principaux"},
  tags            :{lib:"Thèmes"},
  kicad_symbol    :{lib:"Symbole KiCad"},
  kicad_footprint :{lib:"Empreinte KiCad"},
  content         :{lib:"Contenu"},
  matched_files   :{lib:"Fiches trouvées"},
  min_order       :{lib:"Commande minimale",classe:"num",fmt:"entier"},
  reel_qty        :{lib:"Quantité par bobine",classe:"num",fmt:"entier"},
  mounting_type   :{lib:"Montage"},
  category        :{lib:"Catégorie"},
  preferred       :{lib:"Preferred",fmt:"oui"}
};

/* clés de la charge utile susceptibles de contenir le tableau à afficher */
const CLES_TABLEAU=["results","alternatives","parts","boards","sensors","pins",
                    "categories","subcategories","attributes","items","matches",
                    "components","rules","topics","files"];

/* outil affiché au démarrage */
const OUTIL_DEFAUT="jlc_search";
