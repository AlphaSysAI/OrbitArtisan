import type { LibraryTechnicalSheet } from "@/lib/technical-sheets/types";

const NFC15100 = { ref: "NF C 15-100", label: "Installations électriques basse tension (logement)" };

const CONSIGNATION = "Consigner avant toute intervention : couper, condamner (cadenas ou étiquette), vérifier l'absence de tension au VAT, puis travailler.";
const HABILITATION = "Intervention réservée à un électricien habilité (BR / B2V selon l'opération).";

export const ELECTRICITE_SHEETS: LibraryTechnicalSheet[] = [
  {
    id: "elec-poser-raccorder-tableau",
    tradeCategoryId: "electricite",
    tradeIds: ["electricien", "electricien-industriel"],
    keywords: ["tableau électrique", "tableau de répartition", "coffret", "disjoncteur", "différentiel", "peigne", "GTL"],
    title: "Poser et raccorder un tableau électrique",
    summary:
      "Installation d'un tableau de répartition dans la gaine technique logement (GTL), de la fixation au raccordement des circuits et aux essais.",
    duration: "1 jour pour un logement standard",
    tools: [
      "Vérificateur d'absence de tension (VAT)",
      "Tournevis isolés 1 000 V et tournevis dynamométrique",
      "Pince à dénuder, pince coupante, pince à sertir et embouts",
      "Niveau, perceuse, mètre",
      "Contrôleur d'installation (isolement, continuité, terre, test différentiel)",
    ],
    materials: [
      "Coffret (prévoir au moins 20 % de modules libres pour les extensions)",
      "Interrupteurs différentiels 30 mA (nombre et types selon les circuits)",
      "Disjoncteurs divisionnaires adaptés à chaque circuit",
      "Peignes d'alimentation horizontaux et verticaux",
      "Bornier de terre, repérage des circuits, obturateurs",
    ],
    safety: [
      CONSIGNATION,
      HABILITATION,
      "Ne jamais intervenir en amont du disjoncteur de branchement : cette partie relève du gestionnaire de réseau.",
    ],
    steps: [
      {
        title: "Préparer l'implantation",
        details: [
          "Placer le tableau dans la GTL, à l'intérieur du logement, accessible et à l'abri de l'humidité.",
          "Respecter les hauteurs d'implantation : organes de manœuvre entre 0,90 m et 1,80 m du sol fini (1,30 m maximum en logement accessible PMR).",
          "Faire un plan de répartition : liste des circuits, protections et différentiels de rattachement.",
        ],
        warning: "Un tableau sans réserve de place oblige à en reposer un second à la première extension.",
      },
      {
        title: "Fixer le coffret",
        details: [
          "Tracer, mettre de niveau et fixer solidement le coffret ou le panneau de contrôle.",
          "Faire entrer les gaines ICTA par le haut et le bas de la GTL, sans les écraser.",
        ],
      },
      {
        title: "Monter l'appareillage",
        details: [
          "Installer les interrupteurs différentiels en tête de chaque rangée.",
          "Répartir les circuits sur les différentiels : les circuits d'une même pièce sur des différentiels différents, éclairage et prises séparés.",
          "Choisir les types de différentiels selon la version de la NF C 15-100 applicable au chantier. La révision 2024 a renforcé le recours aux types A et F, notamment pour la plaque de cuisson, le lave-linge et la borne de recharge.",
          "Poser les disjoncteurs divisionnaires avec un calibre adapté à la section des conducteurs.",
        ],
        warning: "Calibre du disjoncteur toujours adapté à la section du câble : 16 A sur 1,5 mm², 20 A sur 2,5 mm², 32 A sur 6 mm².",
      },
      {
        title: "Alimenter les rangées",
        details: [
          "Relier le disjoncteur de branchement aux différentiels par des conducteurs de section adaptée au calibre de l'abonnement.",
          "Distribuer les disjoncteurs d'une rangée par peigne, sans dépasser l'intensité admissible du peigne.",
          "Serrer chaque borne au couple indiqué par le fabricant.",
        ],
      },
      {
        title: "Raccorder les circuits",
        details: [
          "Dénuder à la longueur indiquée, sertir un embout sur les conducteurs souples.",
          "Raccorder phase et neutre de chaque circuit sur son disjoncteur, sans croiser les neutres entre deux différentiels.",
          "Raccorder tous les conducteurs de protection (vert/jaune) sur le bornier de terre.",
          "Repérer chaque circuit sur le tableau et sur le plan remis au client.",
        ],
        warning: "Un neutre raccordé sur le mauvais différentiel provoque des déclenchements intempestifs difficiles à diagnostiquer.",
      },
      {
        title: "Fermer et mettre en service",
        details: [
          "Poser les obturateurs sur les emplacements vides et refermer le capot.",
          "Remettre sous tension rangée par rangée, puis circuit par circuit.",
        ],
      },
    ],
    checks: [
      "Isolement mesuré sur chaque circuit hors tension (au moins 0,5 MΩ sous 500 V en courant continu).",
      "Continuité des conducteurs de protection jusqu'aux prises et aux points lumineux.",
      "Valeur de la prise de terre compatible avec les différentiels installés.",
      "Test de déclenchement de chaque différentiel (bouton test et appareil de mesure).",
      "Serrage de toutes les bornes vérifié et repérage complet.",
      "Attestation de conformité Consuel quand l'installation l'exige.",
    ],
    norms: [
      NFC15100,
      { ref: "NF C 14-100", label: "Branchement au réseau (amont du disjoncteur de branchement)" },
    ],
  },
  {
    id: "elec-circuit-prises",
    tradeCategoryId: "electricite",
    tradeIds: ["electricien"],
    keywords: ["prise", "prises de courant", "circuit", "2,5 mm²", "20 A", "socle"],
    title: "Créer un circuit de prises de courant",
    summary: "Création d'un circuit de prises 16 A, du tableau jusqu'aux socles, avec le bon dimensionnement.",
    duration: "Une demi-journée par circuit",
    tools: ["VAT", "Perceuse, scie cloche, rainureuse si encastré", "Pince à dénuder", "Aiguille tire-fil", "Contrôleur d'installation"],
    materials: [
      "Conducteurs H07V-U ou câble R2V en 2,5 mm² (ou 1,5 mm²)",
      "Gaine ICTA de diamètre adapté",
      "Boîtes d'encastrement (cloison sèche ou maçonnerie)",
      "Socles de prise avec terre",
      "Disjoncteur 20 A (2,5 mm²) ou 16 A (1,5 mm²)",
    ],
    safety: [CONSIGNATION, HABILITATION],
    steps: [
      {
        title: "Dimensionner le circuit",
        details: [
          "En 2,5 mm² protégé en 20 A : jusqu'à 12 socles. En 1,5 mm² protégé en 16 A : jusqu'à 8 socles.",
          "Une prise double ou triple compte pour un seul socle dans le décompte du circuit.",
          "Vérifier le nombre minimal de prises par pièce imposé par la norme (séjour, chambres, cuisine).",
        ],
      },
      {
        title: "Implanter les prises",
        details: [
          "Tracer les emplacements en concertation avec le client (meubles, bureau, TV).",
          "Respecter la hauteur minimale de l'axe des prises (5 cm pour une prise 16 A, 12 cm pour une 32 A).",
          "En cuisine, éviter l'aplomb de l'évier et des plaques de cuisson.",
        ],
      },
      {
        title: "Passer les gaines",
        details: [
          "Faire les saignées ou percer les cloisons, poser les boîtes de niveau.",
          "Tirer la gaine du tableau à chaque boîte sans écraser ni dépasser le remplissage autorisé.",
        ],
        warning: "Saignées interdites en pied de mur porteur sans accord : respecter les règles de la maçonnerie.",
      },
      {
        title: "Tirer et raccorder",
        details: [
          "Tirer phase (rouge, marron ou noir), neutre (bleu) et terre (vert/jaune).",
          "Raccorder les socles en repiquage sur les bornes prévues, sans dénuder trop long.",
          "Raccorder le circuit au tableau sur son disjoncteur et son différentiel.",
        ],
      },
    ],
    checks: [
      "Polarité et présence de la terre sur chaque socle (testeur de prise).",
      "Isolement du circuit et continuité de la terre.",
      "Déclenchement du différentiel de rattachement.",
      "Socles bien fixés, sans jeu, enjoliveurs posés.",
    ],
    norms: [NFC15100],
  },
  {
    id: "elec-circuit-eclairage",
    tradeCategoryId: "electricite",
    tradeIds: ["electricien"],
    keywords: ["éclairage", "luminaire", "DCL", "interrupteur", "va-et-vient", "point lumineux"],
    title: "Créer un circuit d'éclairage (simple allumage, va-et-vient)",
    summary: "Circuit d'éclairage en 1,5 mm² avec points DCL, simple allumage et va-et-vient.",
    duration: "Une demi-journée par circuit",
    tools: ["VAT", "Perceuse, scie cloche", "Pince à dénuder", "Aiguille tire-fil", "Contrôleur d'installation"],
    materials: [
      "Conducteurs 1,5 mm² sous gaine ICTA",
      "Boîtiers DCL au plafond, douilles ou fiches DCL",
      "Interrupteurs simples ou va-et-vient",
      "Disjoncteur 16 A",
    ],
    safety: [CONSIGNATION, HABILITATION],
    steps: [
      {
        title: "Dimensionner",
        details: [
          "En 1,5 mm² protégé en 16 A : jusqu'à 8 points lumineux par circuit.",
          "Un point d'éclairage par pièce au minimum, commandé près de l'entrée.",
        ],
      },
      {
        title: "Poser les points DCL",
        details: [
          "Installer un boîtier DCL à chaque point lumineux au plafond ou en applique.",
          "Les luminaires se raccordent ensuite sur la fiche DCL, sans intervention sur les conducteurs.",
        ],
      },
      {
        title: "Câbler la commande",
        details: [
          "Simple allumage : la phase passe par l'interrupteur, le neutre va directement au point lumineux.",
          "Va-et-vient : phase sur la borne commune du premier interrupteur, deux navettes entre les interrupteurs, retour lampe depuis la borne commune du second.",
          "Au-delà de deux points de commande : télérupteur ou boutons-poussoirs.",
        ],
        warning: "Ne jamais couper le neutre seul à l'interrupteur : le luminaire resterait sous tension.",
      },
      {
        title: "Raccorder au tableau",
        details: ["Raccorder sur le disjoncteur 16 A, sur un différentiel distinct de celui des prises de la même pièce si possible."],
      },
    ],
    checks: [
      "La phase est coupée par l'interrupteur (vérifier au VAT sur le DCL, interrupteur ouvert).",
      "Fonctionnement de chaque point de commande.",
      "Isolement et continuité de la terre jusqu'aux DCL.",
    ],
    norms: [NFC15100],
  },
  {
    id: "elec-circuits-specialises",
    tradeCategoryId: "electricite",
    tradeIds: ["electricien"],
    keywords: ["plaque de cuisson", "four", "lave-linge", "lave-vaisselle", "chauffe-eau", "circuit spécialisé", "32 A", "6 mm²"],
    title: "Câbler les circuits spécialisés (cuisine, lavage, chauffe-eau)",
    summary: "Circuits dédiés aux gros appareils : plaque de cuisson, four, lave-linge, lave-vaisselle, chauffe-eau.",
    duration: "2 à 4 heures par circuit",
    tools: ["VAT", "Pince à dénuder", "Aiguille tire-fil", "Contrôleur d'installation"],
    materials: [
      "Conducteurs 6 mm² pour la plaque de cuisson en monophasé",
      "Conducteurs 2,5 mm² pour four, lave-linge, lave-vaisselle, sèche-linge, chauffe-eau",
      "Sortie de câble 32 A, prises 16 A dédiées",
      "Disjoncteurs 32 A et 20 A, contacteur heures creuses pour le chauffe-eau",
    ],
    safety: [CONSIGNATION, HABILITATION],
    steps: [
      {
        title: "Lister les appareils",
        details: [
          "Un circuit par appareil : chaque gros appareil a son propre disjoncteur.",
          "Plaque de cuisson : 6 mm², disjoncteur 32 A, sortie de câble ou prise 32 A.",
          "Four, lave-linge, lave-vaisselle, sèche-linge : 2,5 mm², disjoncteur 20 A, prise dédiée.",
        ],
      },
      {
        title: "Choisir les différentiels",
        details: [
          "Rattacher la plaque de cuisson et le lave-linge à un différentiel du type exigé par la version de la norme applicable (type A au minimum).",
          "Répartir les gros appareils sur plusieurs différentiels pour limiter les coupures générales.",
        ],
      },
      {
        title: "Câbler le chauffe-eau",
        details: [
          "Circuit 2,5 mm² en 20 A, piloté par un contacteur heures creuses dans le tableau.",
          "Raccordement par sortie de câble, jamais par une prise.",
        ],
        warning: "Vérifier la position du commutateur du contacteur (auto / marche forcée) à la mise en service.",
      },
      {
        title: "Raccorder et repérer",
        details: ["Raccorder chaque circuit et l'étiqueter clairement au tableau (« Plaque », « LL », « CE »)."],
      },
    ],
    checks: [
      "Section et calibre cohérents sur chaque circuit.",
      "Isolement, continuité de la terre, test des différentiels.",
      "Fonctionnement du contacteur heures creuses.",
    ],
    norms: [NFC15100],
  },
  {
    id: "elec-mise-a-la-terre",
    tradeCategoryId: "electricite",
    tradeIds: ["electricien"],
    keywords: ["terre", "piquet de terre", "prise de terre", "barrette", "liaison équipotentielle", "résistance de terre"],
    title: "Réaliser la prise de terre et les liaisons équipotentielles",
    summary: "Prise de terre (boucle à fond de fouille ou piquet), conducteur de terre, barrette de mesure et liaison équipotentielle principale.",
    duration: "Une demi-journée",
    tools: ["Masse ou enfonce-piquet", "Telluromètre ou contrôleur avec mesure de terre", "Clé, pince à sertir"],
    materials: [
      "Piquet de terre ou boucle en fond de fouille (construction neuve)",
      "Conducteur de terre de section conforme à la NF C 15-100",
      "Barrette de coupure (de mesure)",
      "Conducteur de liaison équipotentielle principale et colliers",
    ],
    safety: [
      CONSIGNATION,
      "Avant d'enfoncer un piquet, repérer les réseaux enterrés (DT-DICT si nécessaire).",
    ],
    steps: [
      {
        title: "Choisir la prise de terre",
        details: [
          "Construction neuve : boucle à fond de fouille posée avant le coulage des fondations.",
          "Rénovation : piquet enfoncé verticalement dans un sol humide, loin des descentes d'eau et des fondations.",
        ],
      },
      {
        title: "Poser le conducteur de terre",
        details: [
          "Relier la prise de terre à la barrette de coupure, accessible et repérée.",
          "Protéger mécaniquement le conducteur là où il est exposé aux chocs.",
        ],
      },
      {
        title: "Relier au tableau",
        details: [
          "Relier la barrette au bornier principal de terre du tableau.",
          "Réaliser la liaison équipotentielle principale : canalisations métalliques d'eau, de gaz et de chauffage à l'entrée du logement.",
        ],
        warning: "Ne jamais utiliser une canalisation d'eau ou de gaz comme prise de terre.",
      },
      {
        title: "Mesurer",
        details: [
          "Ouvrir la barrette et mesurer la résistance de la prise de terre.",
          "Vérifier que la valeur est compatible avec la sensibilité des différentiels (une valeur inférieure à 100 Ω est recommandée en logement).",
        ],
      },
    ],
    checks: [
      "Résistance de terre mesurée et notée.",
      "Barrette refermée et serrée après la mesure.",
      "Continuité de la liaison équipotentielle principale.",
    ],
    norms: [NFC15100],
  },
  {
    id: "elec-salle-de-bain-volumes",
    tradeCategoryId: "electricite",
    tradeIds: ["electricien"],
    keywords: ["salle de bain", "volumes", "volume 0", "volume 1", "volume 2", "TBTS", "classe II", "douche"],
    title: "Électricité en salle de bain : respecter les volumes",
    summary: "Ce qu'on peut installer dans chaque volume de la salle de bain et comment le raccorder.",
    duration: "Selon le chantier",
    tools: ["VAT", "Mètre", "Contrôleur d'installation"],
    materials: [
      "Matériel à l'indice de protection adapté (IPX4 en volume 2, IPX5 si jets)",
      "Appareils de classe II dans le volume 2",
      "Transformateur TBTS 12 V pour les volumes 0 et 1",
    ],
    safety: [CONSIGNATION, HABILITATION],
    steps: [
      {
        title: "Délimiter les volumes",
        details: [
          "Volume 0 : l'intérieur de la baignoire ou du receveur.",
          "Volume 1 : au-dessus du volume 0, jusqu'à 2,25 m du fond.",
          "Volume 2 : 60 cm autour du volume 1. Au-delà : hors volume.",
          "Une douche sans receveur (à l'italienne) a un volume 0 et 1 plus étendu : se référer à la norme.",
        ],
      },
      {
        title: "Choisir le matériel par volume",
        details: [
          "Volume 0 : uniquement du matériel TBTS 12 V prévu pour l'immersion.",
          "Volume 1 : TBTS 12 V ; chauffe-eau instantané ou à accumulation horizontal sous conditions.",
          "Volume 2 : luminaires et appareils de classe II, prise rasoir avec transformateur de séparation.",
          "Hors volume : prises de courant et appareils classiques, protégés par différentiel 30 mA.",
        ],
        warning: "Les transformateurs TBTS sont toujours placés hors volume.",
      },
      {
        title: "Raccorder et protéger",
        details: [
          "Tous les circuits de la salle de bain sont protégés par un différentiel 30 mA.",
          "Réaliser la liaison équipotentielle supplémentaire dans les cas prévus par la norme.",
        ],
      },
    ],
    checks: [
      "Aucun appareil non autorisé dans un volume.",
      "Indices de protection conformes.",
      "Test du différentiel 30 mA.",
    ],
    norms: [NFC15100],
  },
  {
    id: "elec-borne-recharge-irve",
    tradeCategoryId: "electricite",
    tradeIds: ["electricien", "installateur-irve"],
    keywords: ["IRVE", "borne de recharge", "wallbox", "véhicule électrique", "voiture électrique"],
    title: "Installer une borne de recharge pour véhicule électrique",
    summary: "Pose d'une borne de recharge (wallbox) en maison individuelle, sur circuit dédié.",
    duration: "Une demi-journée à un jour",
    tools: ["VAT", "Perceuse", "Pince à dénuder", "Contrôleur d'installation"],
    materials: [
      "Borne de recharge et support",
      "Câble de section adaptée à la puissance et à la longueur",
      "Disjoncteur dédié et différentiel du type requis par le fabricant de la borne",
      "Délesteur ou gestionnaire d'énergie si l'abonnement est juste",
    ],
    safety: [
      CONSIGNATION,
      "Au-delà de 3,7 kW, la pose doit être faite par une entreprise qualifiée IRVE pour que le client bénéficie des aides et de l'assurance.",
    ],
    steps: [
      {
        title: "Étudier l'installation",
        details: [
          "Vérifier la puissance de l'abonnement et la capacité du tableau.",
          "Choisir la puissance de la borne (7,4 kW en monophasé, 11 ou 22 kW en triphasé).",
          "Mesurer la longueur de câble pour calculer la section (chute de tension).",
        ],
      },
      {
        title: "Préparer le tableau",
        details: [
          "Créer un circuit dédié avec disjoncteur adapté à la puissance.",
          "Installer la protection différentielle exigée par la notice de la borne (type A avec détection courant continu intégrée, ou type F ou B).",
        ],
        warning: "Une protection différentielle inadaptée peut ne pas détecter un défaut en courant continu.",
      },
      {
        title: "Poser la borne",
        details: [
          "Fixer la borne à la hauteur indiquée, à l'abri des chocs de véhicule.",
          "Tirer le câble sous conduit et le raccorder selon la notice.",
        ],
      },
      {
        title: "Paramétrer",
        details: [
          "Régler l'intensité maximale de charge selon l'abonnement.",
          "Configurer le pilotage (heures creuses, délestage, application).",
        ],
      },
    ],
    checks: [
      "Test de charge avec un véhicule ou un simulateur.",
      "Mesures d'isolement, de terre et test différentiel.",
      "Remise au client de la notice et de l'attestation de pose IRVE.",
    ],
    norms: [NFC15100, { ref: "Décret n° 2017-26", label: "Qualification des installateurs d'IRVE" }],
  },
  {
    id: "elec-mise-en-securite",
    tradeCategoryId: "electricite",
    tradeIds: ["electricien"],
    keywords: ["mise en sécurité", "rénovation", "installation ancienne", "vétuste", "diagnostic électrique"],
    title: "Mettre en sécurité une installation ancienne",
    summary: "Les points de sécurité à traiter en priorité sur une installation vétuste, sans tout refaire.",
    duration: "1 à 2 jours",
    tools: ["VAT", "Contrôleur d'installation", "Outillage électricien"],
    materials: [
      "Appareil général de commande et de protection si absent",
      "Interrupteurs différentiels 30 mA",
      "Disjoncteurs adaptés aux sections existantes",
      "Conducteur de terre et de liaison équipotentielle",
    ],
    safety: [
      CONSIGNATION,
      HABILITATION,
      "Avant de percer ou de déposer, vérifier le repérage amiante si le bâtiment date d'avant juillet 1997.",
    ],
    steps: [
      {
        title: "Faire l'état des lieux",
        details: [
          "Repérer : absence de différentiel, fusibles, absence de terre, conducteurs dénudés, matériel vétuste.",
          "S'appuyer sur la grille du diagnostic électrique et sur la norme de mise en sécurité.",
        ],
      },
      {
        title: "Traiter les 6 points de sécurité",
        details: [
          "Un appareil général de commande et de protection, accessible.",
          "Au moins un différentiel adapté à la prise de terre.",
          "Un disjoncteur adapté à chaque circuit.",
          "Une liaison équipotentielle et le respect des volumes dans les pièces d'eau.",
          "Aucun matériel vétuste ou conducteur nu accessible.",
          "Une prise de terre et des conducteurs de protection.",
        ],
      },
      {
        title: "Informer le client",
        details: ["Remettre la liste de ce qui a été fait et de ce qui reste à mettre aux normes de la NF C 15-100."],
      },
    ],
    checks: ["Mesures d'isolement et de terre.", "Test des différentiels.", "Plus aucun conducteur nu accessible."],
    norms: [
      { ref: "XP C 16-600", label: "Diagnostic de l'installation électrique des logements" },
      { ref: "NF C 15-100", label: "Référence pour la mise en conformité complète" },
    ],
  },
  {
    id: "elec-controles-consuel",
    tradeCategoryId: "electricite",
    tradeIds: ["electricien"],
    keywords: ["Consuel", "attestation de conformité", "autocontrôle", "mesure d'isolement", "mise en service"],
    title: "Contrôler l'installation et obtenir l'attestation Consuel",
    summary: "Autocontrôle de fin de chantier et démarches d'attestation de conformité avant mise en service.",
    duration: "2 à 3 heures de mesures",
    tools: ["Contrôleur d'installation multifonction", "VAT", "Testeur de prise"],
    materials: ["Plan et schéma de l'installation", "Dossier technique pour le Consuel"],
    safety: [CONSIGNATION],
    steps: [
      {
        title: "Mesurer hors tension",
        details: [
          "Continuité des conducteurs de protection sur chaque circuit.",
          "Résistance d'isolement de chaque circuit (au moins 0,5 MΩ sous 500 V en courant continu).",
          "Résistance de la prise de terre (barrette ouverte).",
        ],
      },
      {
        title: "Contrôler sous tension",
        details: [
          "Déclenchement de chaque différentiel au courant nominal.",
          "Polarité des prises, fonctionnement des commandes.",
        ],
      },
      {
        title: "Préparer le dossier",
        details: [
          "Établir l'attestation (installation neuve ou rénovation totale avec mise hors tension).",
          "Joindre le schéma et la liste des circuits.",
          "Faire viser l'attestation par le Consuel avant la mise en service par le gestionnaire de réseau.",
        ],
        warning: "Sans attestation visée, le gestionnaire de réseau ne met pas en service une installation neuve.",
      },
    ],
    checks: ["Toutes les mesures notées dans un rapport remis au client.", "Repérage du tableau complet et lisible."],
    norms: [NFC15100, { ref: "Décret n° 72-1120", label: "Attestation de conformité des installations électriques" }],
  },
  {
    id: "elec-tableau-communication",
    tradeCategoryId: "electricite",
    tradeIds: ["electricien", "electricien-courants-faibles"],
    keywords: ["tableau de communication", "RJ45", "fibre", "box", "grade", "réseau informatique", "courants faibles"],
    title: "Poser un tableau de communication et les prises RJ45",
    summary: "Coffret de communication dans la GTL et câblage des prises RJ45 en étoile.",
    duration: "Une demi-journée à un jour",
    tools: ["Pince à sertir et outil d'insertion RJ45", "Testeur de câble réseau", "Aiguille tire-fil"],
    materials: [
      "Coffret de communication (grade adapté au logement)",
      "Câble grade 2TV ou 3TV",
      "Prises RJ45, gaines dédiées séparées des courants forts",
    ],
    safety: ["Séparer physiquement les gaines courants faibles des conducteurs 230 V."],
    steps: [
      {
        title: "Implanter",
        details: [
          "Placer le coffret dans la GTL, à côté du tableau électrique, avec une prise 230 V pour la box.",
          "Prévoir au moins une prise RJ45 par pièce principale.",
        ],
      },
      {
        title: "Câbler en étoile",
        details: [
          "Tirer un câble par prise, du coffret à la prise, sans repiquage.",
          "Respecter le rayon de courbure du câble.",
        ],
      },
      {
        title: "Raccorder",
        details: [
          "Raccorder les prises selon le même code couleur aux deux extrémités.",
          "Repérer chaque câble au coffret.",
        ],
      },
    ],
    checks: ["Test de chaque lien au testeur de câble.", "Repérage des prises au coffret."],
    norms: [NFC15100, { ref: "Guide UTE C 90-483", label: "Câblage résidentiel des réseaux de communication" }],
  },
];
