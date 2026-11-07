import type { LibraryTechnicalSheet } from "@/lib/technical-sheets/types";

const DTU_59_1 = { ref: "NF DTU 59.1", label: "Revêtements de peinture en feuil mince, semi-épais ou épais" };
const DTU_59_4 = { ref: "NF DTU 59.4", label: "Mise en œuvre des papiers peints et revêtements muraux" };
const PEINTRES = ["peintre-batiment"];
const PLOMB = "Logement construit avant 1949 : vieilles peintures possiblement au plomb. Pas de ponçage à sec ni de décapage thermique sans protections adaptées (CREP à demander).";
const POUSSIERES = "Ponçage : masque FFP2, aspiration, protection des sols et du mobilier.";
const AERATION = "Aérer pendant et après l'application, privilégier les produits à faible émission (étiquette A+).";

export const PEINTURE_SHEETS: LibraryTechnicalSheet[] = [
  {
    id: "peint-preparer-mur",
    tradeCategoryId: "second-oeuvre",
    tradeIds: PEINTRES,
    keywords: ["préparation", "lessivage", "rebouchage", "ponçage", "impression", "sous-couche"],
    title: "Préparer un mur avant peinture",
    summary: "Lessivage, rebouchage, ponçage et impression : les travaux préparatoires qui font la qualité de la finition.",
    duration: "Une demi-journée à un jour par pièce",
    tools: ["Éponge et seau", "Couteaux à enduire", "Cale à poncer ou ponceuse avec aspiration", "Rouleau, bac", "Lampe de contrôle en lumière rasante"],
    materials: ["Lessive", "Enduit de rebouchage", "Abrasifs", "Impression (sous-couche) adaptée au support", "Bâches et adhésif de masquage"],
    safety: [PLOMB, POUSSIERES],
    steps: [
      {
        title: "Protéger",
        details: ["Vider ou regrouper le mobilier, bâcher les sols, masquer prises, plinthes et menuiseries.", "Couper le courant pour déposer les plaques de prises si besoin."],
      },
      {
        title: "Diagnostiquer le support",
        details: [
          "Repérer fissures, trous, cloques, traces d'humidité ou de moisissure.",
          "Tester l'adhérence de l'ancienne peinture (quadrillage et adhésif).",
        ],
        warning: "Peindre sur une ancienne peinture qui n'adhère pas : la nouvelle couche se décollera avec elle.",
      },
      {
        title: "Lessiver",
        details: ["Lessiver pour enlever graisses et poussières, rincer, laisser sécher."],
      },
      {
        title: "Reboucher et poncer",
        details: [
          "Ouvrir les fissures, reboucher, laisser sécher, poncer.",
          "Contrôler en lumière rasante et reprendre si besoin.",
        ],
      },
      {
        title: "Imprimer",
        details: ["Appliquer une impression adaptée au support (plâtre neuf, ancien support, taché)."],
      },
    ],
    checks: ["Support propre, sec, cohésif.", "Plus aucun défaut visible en lumière rasante.", "Impression appliquée sur toute la surface."],
    norms: [DTU_59_1],
  },
  {
    id: "peint-murs-deux-couches",
    tradeCategoryId: "second-oeuvre",
    tradeIds: PEINTRES,
    keywords: ["peinture murale", "deux couches", "rouleau", "acrylique", "mat", "velours", "satin"],
    title: "Peindre des murs en deux couches",
    summary: "Application de la finition au rouleau pour un rendu uniforme, sans traces de reprise.",
    duration: "Environ 1 jour par pièce, séchage compris",
    tools: ["Rouleaux (poils adaptés à la finition)", "Pinceaux à rechampir", "Bac, grille", "Perche"],
    materials: ["Peinture de finition (mat, velours, satin)", "Adhésif de masquage"],
    safety: [AERATION],
    steps: [
      {
        title: "Rechampir",
        details: ["Peindre au pinceau les angles, bords de plafond, contours de menuiseries et de prises."],
      },
      {
        title: "Première couche",
        details: [
          "Travailler par bandes d'environ 1 m de large, de haut en bas.",
          "Croiser puis lisser verticalement dans le même sens, sans repasser sur une partie qui commence à sécher.",
        ],
        warning: "Les reprises sur une zone sèche laissent des traces : travailler « frais dans frais ».",
      },
      {
        title: "Seconde couche",
        details: ["Après le temps de recouvrement indiqué, appliquer la seconde couche de la même façon."],
      },
      {
        title: "Démasquer",
        details: ["Retirer l'adhésif quand la peinture est encore légèrement fraîche pour obtenir un bord net."],
      },
    ],
    checks: ["Teinte uniforme, sans trace de rouleau ni de reprise.", "Rechampis nets.", "Aucune coulure."],
    norms: [DTU_59_1],
  },
  {
    id: "peint-plafond",
    tradeCategoryId: "second-oeuvre",
    tradeIds: PEINTRES,
    keywords: ["plafond", "peinture plafond", "mat"],
    title: "Peindre un plafond",
    summary: "Mise en peinture d'un plafond sans traces, à faire avant les murs.",
    duration: "Une demi-journée par pièce, séchage compris",
    tools: ["Rouleau sur perche", "Pinceau à rechampir", "Escabeau ou plateforme", "Lunettes"],
    materials: ["Peinture plafond mate", "Impression si support neuf ou taché"],
    safety: [AERATION, "Travail en hauteur : plateforme stable, lunettes contre les projections."],
    steps: [
      {
        title: "Préparer",
        details: ["Préparer le support comme pour un mur.", "Traiter les taches (eau, fumée) avec une impression bloquante."],
      },
      {
        title: "Rechampir le périmètre",
        details: ["Peindre au pinceau la jonction murs-plafond et autour des points lumineux."],
      },
      {
        title: "Appliquer",
        details: [
          "Peindre par bandes parallèles à la fenêtre principale.",
          "Lisser la dernière passe dans le sens de la lumière (vers la fenêtre).",
        ],
        warning: "Lisser perpendiculairement à la lumière rend chaque passe visible.",
      },
      {
        title: "Seconde couche",
        details: ["Seconde couche croisée, lissage final toujours vers la fenêtre."],
      },
    ],
    checks: ["Aucune trace en lumière rasante.", "Rechampis réguliers."],
    norms: [DTU_59_1],
  },
  {
    id: "peint-toile-de-verre",
    tradeCategoryId: "second-oeuvre",
    tradeIds: PEINTRES,
    keywords: ["toile de verre", "fibre de verre", "revêtement à peindre", "fissures"],
    title: "Poser une toile de verre à peindre",
    summary: "Revêtement de fibre de verre collé puis peint, pour renforcer et uniformiser un support.",
    duration: "Environ 1 jour pour une pièce, avant peinture",
    tools: ["Rouleau à colle", "Spatule de marouflage", "Cutter et couteau à araser", "Fil à plomb ou laser"],
    materials: ["Toile de verre", "Colle prête à l'emploi pour toile de verre", "Peinture de finition"],
    safety: ["Découpe de la toile : gants et manches longues (fibres irritantes)."],
    steps: [
      {
        title: "Préparer",
        details: ["Support sain et propre, rebouché.", "Tracer un aplomb pour le premier lé."],
      },
      {
        title: "Encoller le mur",
        details: ["Encoller le mur sur la largeur d'un lé, au rouleau, de façon régulière."],
      },
      {
        title: "Poser les lés",
        details: [
          "Poser bord à bord, endroit du côté visible (repère au dos).",
          "Maroufler du centre vers les bords pour chasser l'air.",
          "Araser en haut et en bas au couteau.",
        ],
        warning: "Une bulle d'air sous la toile se voit après peinture : maroufler soigneusement.",
      },
      {
        title: "Peindre",
        details: ["Après séchage de la colle, appliquer deux couches de peinture (la toile absorbe beaucoup)."],
      },
    ],
    checks: ["Lés jointifs et d'aplomb.", "Aucune bulle.", "Peinture couvrante."],
    norms: [DTU_59_4, DTU_59_1],
  },
  {
    id: "peint-papier-peint-intisse",
    tradeCategoryId: "second-oeuvre",
    tradeIds: PEINTRES,
    keywords: ["papier peint", "intissé", "lé", "raccord", "encollage du mur"],
    title: "Poser un papier peint intissé",
    summary: "Pose de papier peint intissé avec encollage du mur et raccord des motifs.",
    duration: "Une demi-journée à un jour par pièce",
    tools: ["Rouleau à colle", "Brosse ou spatule de marouflage", "Couteau à araser, cutter", "Fil à plomb ou laser", "Roulette à joints"],
    materials: ["Papier peint intissé (même numéro de bain)", "Colle pour intissé", "Impression si support absorbant"],
    safety: ["Couper le courant pour découper autour des prises et interrupteurs."],
    steps: [
      {
        title: "Préparer",
        details: [
          "Support lisse et uniforme, imprimé si absorbant.",
          "Vérifier que tous les rouleaux ont le même numéro de bain.",
        ],
      },
      {
        title: "Tracer et couper",
        details: [
          "Tracer un aplomb près d'un angle ou d'une fenêtre.",
          "Couper les lés à la hauteur plus 5 à 10 cm, en tenant compte du raccord du motif.",
        ],
      },
      {
        title: "Encoller le mur et poser",
        details: [
          "Encoller le mur sur une largeur de lé.",
          "Poser le lé sec contre l'aplomb, maroufler, araser haut et bas.",
          "Poser le suivant bord à bord en respectant le raccord.",
        ],
        warning: "Ne pas étirer le papier en marouflant : les joints s'ouvrent au séchage.",
      },
      {
        title: "Finir",
        details: ["Passer la roulette sur les joints, essuyer la colle en surface à l'éponge propre."],
      },
    ],
    checks: ["Raccords alignés.", "Joints fermés.", "Aucune trace de colle."],
    norms: [DTU_59_4],
  },
  {
    id: "peint-boiseries-laque",
    tradeCategoryId: "second-oeuvre",
    tradeIds: PEINTRES,
    keywords: ["boiseries", "laque", "portes", "plinthes", "glycéro", "menuiseries intérieures"],
    title: "Laquer des boiseries (portes, plinthes, menuiseries)",
    summary: "Préparation et mise en peinture laquée des boiseries intérieures.",
    duration: "Environ 1 à 2 heures par porte, hors séchage",
    tools: ["Pinceaux à laquer, rouleau laqueur mousse", "Cale à poncer, abrasifs fins", "Chiffon microfibre"],
    materials: ["Sous-couche adaptée (bois brut ou ancienne laque)", "Laque acrylique ou alkyde", "Mastic à bois"],
    safety: [PLOMB, AERATION],
    steps: [
      {
        title: "Préparer",
        details: [
          "Dégraisser, poncer pour égrener et dépolir l'ancienne laque.",
          "Reboucher au mastic à bois, poncer, dépoussiérer.",
        ],
        warning: "Une laque acrylique sur une ancienne glycéro non poncée et non imprimée peut s'écailler.",
      },
      {
        title: "Imprimer",
        details: ["Appliquer la sous-couche adaptée et égrener légèrement après séchage."],
      },
      {
        title: "Laquer",
        details: [
          "Peindre une porte dans l'ordre : moulures et panneaux, puis traverses, puis montants.",
          "Appliquer en couches fines, lisser dans le sens du fil du bois.",
        ],
      },
      {
        title: "Seconde couche",
        details: ["Égrener entre deux couches, dépoussiérer, appliquer la seconde couche."],
      },
    ],
    checks: ["Aucune coulure ni surépaisseur.", "Tendu uniforme.", "Quincaillerie propre."],
    norms: [DTU_59_1],
  },
  {
    id: "peint-facade",
    tradeCategoryId: "second-oeuvre",
    tradeIds: ["peintre-batiment", "facadier-ravaleur"],
    keywords: ["façade", "ravalement", "peinture extérieure", "nettoyage façade", "hydrofuge", "D2", "D3"],
    title: "Peindre une façade",
    summary: "Nettoyage, réparations et mise en peinture d'une façade enduite ou en maçonnerie.",
    duration: "Plusieurs jours selon la surface",
    tools: ["Échafaudage", "Nettoyeur haute pression", "Brosses, rouleaux façade, éventuellement airless", "Couteaux, taloches"],
    materials: ["Produit anti-mousse", "Mortier de réparation", "Impression façade", "Peinture façade de la classe adaptée (D2, D3…)"],
    safety: [
      "Travail en hauteur : échafaudage monté et vérifié par une personne compétente, garde-corps.",
      "Déclaration préalable en mairie souvent obligatoire avant de modifier l'aspect d'une façade.",
      PLOMB,
    ],
    steps: [
      {
        title: "Diagnostiquer",
        details: [
          "Identifier le support (enduit, béton, ancienne peinture) et son état.",
          "Repérer fissures, décollements et zones humides.",
          "Choisir le système de peinture selon le support et l'exposition.",
        ],
      },
      {
        title: "Nettoyer",
        details: ["Traiter les mousses, rincer, laisser sécher.", "Protéger menuiseries et végétation."],
      },
      {
        title: "Réparer",
        details: ["Traiter les fissures selon leur largeur (enduit, entoilage).", "Reboucher les éclats au mortier de réparation."],
        warning: "Une fissure active (qui bouge) revient à travers la peinture : la traiter avec un système adapté.",
      },
      {
        title: "Peindre",
        details: [
          "Imprimer si nécessaire, puis deux couches de finition.",
          "Ne pas peindre sous la pluie, par grand vent, en plein soleil ou par température trop basse (voir la notice).",
        ],
      },
    ],
    checks: ["Teinte uniforme.", "Fissures traitées.", "Menuiseries et sols propres."],
    norms: [DTU_59_1, { ref: "NF DTU 42.1", label: "Réfection de façades par revêtements d'imperméabilité" }],
  },
  {
    id: "peint-traiter-humidite-moisissures",
    tradeCategoryId: "second-oeuvre",
    tradeIds: PEINTRES,
    keywords: ["moisissures", "humidité", "salpêtre", "anti-fongique", "condensation"],
    title: "Traiter les moisissures avant peinture",
    summary: "Identifier la cause, traiter le support et choisir une peinture adaptée aux pièces humides.",
    duration: "Une demi-journée, plus le séchage",
    tools: ["Humidimètre", "Brosse", "Pulvérisateur", "Couteaux"],
    materials: ["Traitement fongicide", "Impression adaptée", "Peinture pour pièces humides"],
    safety: ["Gants, lunettes et masque FFP2 pour brosser les moisissures."],
    steps: [
      {
        title: "Trouver la cause",
        details: [
          "Condensation (ventilation insuffisante), infiltration ou remontées capillaires.",
          "Mesurer l'humidité du mur à l'humidimètre.",
        ],
        warning: "Sans traiter la cause, les moisissures reviennent en quelques semaines : prévenir le client par écrit.",
      },
      {
        title: "Traiter",
        details: [
          "Brosser à sec avec protection, appliquer le fongicide, respecter le temps d'action.",
          "Rincer si le produit le prévoit et laisser sécher.",
        ],
      },
      {
        title: "Peindre",
        details: ["Impression adaptée, puis peinture pour pièces humides.", "Conseiller au client de vérifier la ventilation (VMC, entrées d'air)."],
      },
    ],
    checks: ["Support sec avant peinture.", "Cause identifiée et signalée au client."],
    norms: [DTU_59_1],
  },
  {
    id: "peint-enduit-lissage",
    tradeCategoryId: "second-oeuvre",
    tradeIds: PEINTRES,
    keywords: ["enduit de lissage", "ratissage", "finition A", "mur lisse", "enduit"],
    title: "Ratisser un mur à l'enduit de lissage",
    summary: "Application d'un enduit de lissage pour obtenir un support parfaitement lisse avant une finition soignée.",
    duration: "Environ 1 jour par pièce, séchage compris",
    tools: ["Lisseuse inox", "Couteaux à enduire", "Ponceuse girafe avec aspiration", "Lampe de contrôle"],
    materials: ["Enduit de lissage (poudre ou pâte)", "Abrasifs fins", "Impression"],
    safety: [POUSSIERES],
    steps: [
      {
        title: "Préparer",
        details: ["Reboucher les trous et fissures au préalable.", "Dépoussiérer."],
      },
      {
        title: "Première passe",
        details: ["Appliquer une passe fine et régulière à la lisseuse, en croisant."],
      },
      {
        title: "Seconde passe",
        details: ["Après séchage, seconde passe croisée pour combler les défauts restants."],
        warning: "Plusieurs passes fines valent mieux qu'une passe épaisse qui fissure en séchant.",
      },
      {
        title: "Poncer et imprimer",
        details: ["Poncer au grain fin, contrôler en lumière rasante.", "Dépoussiérer et imprimer."],
      },
    ],
    checks: ["Support lisse en lumière rasante.", "Aucune fissure de retrait."],
    norms: [DTU_59_1],
  },
  {
    id: "peint-metal-antirouille",
    tradeCategoryId: "second-oeuvre",
    tradeIds: PEINTRES,
    keywords: ["métal", "fer", "antirouille", "grille", "portail", "garde-corps", "ferronnerie"],
    title: "Peindre une ferronnerie (portail, grille, garde-corps)",
    summary: "Dérouillage, protection antirouille et finition des ouvrages métalliques.",
    duration: "Une demi-journée à un jour",
    tools: ["Brosse métallique, disque de décapage", "Pinceaux", "Lunettes, gants"],
    materials: ["Dégraissant", "Primaire antirouille", "Peinture de finition pour métal (ou peinture « directement sur rouille » selon le système)"],
    safety: [PLOMB, "Décapage mécanique : lunettes, gants et masque."],
    steps: [
      {
        title: "Décaper",
        details: [
          "Éliminer la rouille non adhérente et les anciennes peintures écaillées à la brosse ou au disque.",
          "Dégraisser.",
        ],
      },
      {
        title: "Protéger",
        details: ["Appliquer le primaire antirouille sans attendre, sur métal sec.", "Insister sur les soudures, angles et assemblages."],
        warning: "Un métal décapé laissé nu se réoxyde en quelques heures à l'humidité.",
      },
      {
        title: "Finir",
        details: ["Deux couches de finition pour métal, par temps sec et tempéré."],
      },
    ],
    checks: ["Aucune zone de rouille apparente.", "Couches couvrantes, y compris dans les angles."],
    norms: [DTU_59_1],
  },
];
