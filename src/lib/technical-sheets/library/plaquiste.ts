import type { LibraryTechnicalSheet } from "@/lib/technical-sheets/types";

const DTU_25_41 = { ref: "NF DTU 25.41", label: "Ouvrages en plaques de plâtre (cloisons, doublages, plafonds)" };
const DTU_25_42 = { ref: "NF DTU 25.42", label: "Doublages en complexes et sandwichs plaque de plâtre et isolant" };
const PLAQUISTES = ["plaquiste", "platrier-plaquiste", "platrier"];
const AMIANTE = "Bâtiment d'avant juillet 1997 : disposer du repérage amiante avant travaux avant de percer, poncer ou démolir.";
const POUSSIERES = "Découpe et ponçage : masque FFP2 et lunettes, aspiration plutôt que balayage.";

export const PLAQUISTE_SHEETS: LibraryTechnicalSheet[] = [
  {
    id: "plaq-cloison-distributive",
    tradeCategoryId: "second-oeuvre",
    tradeIds: PLAQUISTES,
    keywords: ["cloison", "72/48", "rail", "montant", "BA13", "placo", "distributive"],
    title: "Monter une cloison distributive en plaques de plâtre",
    summary: "Cloison 72/48 sur ossature métallique : rails, montants, isolant et plaques BA13.",
    duration: "Environ 10 à 15 m² par jour et par compagnon",
    tools: ["Laser ou cordeau, niveau", "Pince à sertir les rails ou visseuse", "Cisaille à métaux", "Cutter, rabot à plaque, scie égoïne", "Visseuse plaquiste", "Lève-plaque"],
    materials: [
      "Rails et montants de 48 mm",
      "Plaques BA13 (hydrofuges H1 en pièce humide)",
      "Laine minérale de 45 mm",
      "Vis TTPC 25 et 35 mm",
      "Bande d'étanchéité acoustique sous les rails",
    ],
    safety: [AMIANTE, POUSSIERES],
    steps: [
      {
        title: "Tracer",
        details: [
          "Tracer la cloison au sol, reporter au plafond au laser.",
          "Repérer les portes, les réseaux et les éléments lourds à fixer plus tard.",
        ],
      },
      {
        title: "Poser les rails",
        details: [
          "Coller la bande acoustique sous les rails.",
          "Fixer les rails au sol et au plafond, au moins tous les 60 cm et à 5 cm des extrémités.",
        ],
      },
      {
        title: "Poser les montants",
        details: [
          "Couper les montants à la hauteur moins 5 à 10 mm.",
          "Les placer tous les 60 cm (40 cm pour une forte hauteur ou une charge, selon les tableaux du fabricant).",
          "Doubler les montants autour des huisseries.",
        ],
        warning: "La hauteur maximale d'une cloison dépend de l'ossature et de l'entraxe : vérifier les tableaux du fabricant.",
      },
      {
        title: "Plaquer une face",
        details: [
          "Poser les plaques bord aminci vertical, en laissant 1 cm au sol.",
          "Visser tous les 30 cm environ, tête de vis légèrement enfoncée sans déchirer le carton.",
          "Décaler les joints d'une face à l'autre.",
        ],
      },
      {
        title: "Passer les réseaux et isoler",
        details: [
          "Passer les gaines électriques dans les lumières des montants.",
          "Remplir la cloison d'isolant sans le tasser.",
        ],
      },
      {
        title: "Fermer la seconde face",
        details: ["Plaquer en décalant les joints par rapport à la première face.", "Découper les boîtiers électriques au fur et à mesure."],
      },
    ],
    checks: [
      "Cloison d'aplomb et plane à la règle de 2 m.",
      "Vis correctement enfoncées, aucune plaque déchirée.",
      "Jeu au sol présent, aucun joint aligné entre les deux faces.",
    ],
    norms: [DTU_25_41],
  },
  {
    id: "plaq-doublage-colle",
    tradeCategoryId: "second-oeuvre",
    tradeIds: PLAQUISTES,
    keywords: ["doublage collé", "complexe isolant", "plots", "mortier adhésif", "isolation des murs"],
    title: "Poser un doublage collé (complexe isolant)",
    summary: "Doublage de mur par plaques de plâtre associées à un isolant, collées par plots de mortier adhésif.",
    duration: "Environ 20 m² par jour et par compagnon",
    tools: ["Règle de 2 m, niveau", "Auge, truelle", "Cutter, scie", "Cales"],
    materials: ["Complexes de doublage (plaque + isolant)", "Mortier adhésif", "Cales de pied", "Bande de joint et enduit"],
    safety: [AMIANTE, POUSSIERES],
    steps: [
      {
        title: "Vérifier le mur",
        details: [
          "Le mur doit être sain, sec et sans défaut de planéité excessif (sinon passer sur ossature).",
          "Le collage est exclu sur un mur humide ou sur un support peint qui se décolle.",
        ],
        warning: "Sur un mur humide, le doublage collé enferme l'humidité : traiter la cause ou choisir une ossature avec lame d'air.",
      },
      {
        title: "Préparer les plots",
        details: [
          "Appliquer des plots de mortier sur la plaque ou le mur, avec un plot à chaque angle et en partie centrale.",
          "Respecter le nombre de plots et l'espacement prescrits par le fabricant.",
        ],
      },
      {
        title: "Plaquer",
        details: [
          "Poser la plaque sur cales (1 cm du sol) et la serrer contre le mur à la règle.",
          "Régler la planéité et l'aplomb pendant la prise du mortier.",
        ],
      },
      {
        title: "Traiter les points singuliers",
        details: [
          "Assurer la continuité de l'isolant aux angles et autour des menuiseries.",
          "Traiter les joints une fois le mortier sec.",
        ],
      },
    ],
    checks: ["Planéité et aplomb à la règle.", "Aucun son creux étendu au tapotement.", "Continuité de l'isolant."],
    norms: [DTU_25_42],
  },
  {
    id: "plaq-doublage-ossature",
    tradeCategoryId: "second-oeuvre",
    tradeIds: PLAQUISTES,
    keywords: ["doublage sur ossature", "fourrures", "appuis intermédiaires", "isolation", "laine de verre", "pare-vapeur"],
    title: "Poser un doublage sur ossature avec isolant",
    summary: "Doublage de mur extérieur sur fourrures et appuis intermédiaires, avec laine minérale et pare-vapeur.",
    duration: "Environ 12 à 15 m² par jour et par compagnon",
    tools: ["Laser, cordeau", "Visseuse, cisaille", "Couteau à isolant", "Agrafeuse, rouleau d'adhésif"],
    materials: [
      "Fourrures et lisses, appuis intermédiaires",
      "Laine minérale (épaisseur selon l'objectif thermique)",
      "Membrane pare-vapeur ou frein-vapeur et adhésifs",
      "Plaques BA13",
    ],
    safety: [AMIANTE, POUSSIERES, "Laine minérale : manches longues, gants, lunettes."],
    steps: [
      {
        title: "Implanter l'ossature",
        details: [
          "Fixer les lisses haute et basse, à distance du mur correspondant à l'épaisseur d'isolant.",
          "Fixer les appuis intermédiaires au mur, puis clipser les fourrures tous les 60 cm.",
        ],
      },
      {
        title: "Isoler",
        details: [
          "Embrocher l'isolant sur les appuis, en continuité, sans tassement ni vide.",
          "Couper l'isolant légèrement plus large que l'espace à combler.",
        ],
      },
      {
        title: "Poser le pare-vapeur",
        details: [
          "Côté chaud (intérieur), recouvrements de 10 cm scotchés.",
          "Raccorder aux menuiseries, plafonds et sols avec les adhésifs adaptés.",
          "Traiter chaque traversée (gaines, boîtiers) avec des accessoires étanches.",
        ],
        warning: "Un pare-vapeur percé ou mal raccordé crée de la condensation dans l'isolant.",
      },
      {
        title: "Plaquer",
        details: ["Visser les plaques sur les fourrures tous les 30 cm.", "Traiter les joints."],
      },
    ],
    checks: ["Isolant continu, sans vide.", "Pare-vapeur continu et raccordé.", "Planéité à la règle."],
    norms: [DTU_25_41],
  },
  {
    id: "plaq-plafond-ossature",
    tradeCategoryId: "second-oeuvre",
    tradeIds: [...PLAQUISTES, "poseur-plafonds-suspendus"],
    keywords: ["plafond", "faux plafond", "suspentes", "fourrures", "F530", "plafond suspendu"],
    title: "Poser un plafond en plaques sur ossature",
    summary: "Plafond suspendu sur fourrures et suspentes, avec plaques BA13 vissées.",
    duration: "Environ 15 à 20 m² par jour pour une équipe de deux",
    tools: ["Laser", "Lève-plaque", "Visseuse", "Cisaille", "Perforateur"],
    materials: ["Cornières ou lisses périphériques", "Suspentes et chevilles adaptées au support", "Fourrures", "Plaques BA13 (ou plaques spéciales)", "Isolant éventuel"],
    safety: [AMIANTE, POUSSIERES, "Travail en hauteur : plateforme ou échafaudage roulant stable, pas d'escabeau instable."],
    steps: [
      {
        title: "Tracer le niveau",
        details: ["Tracer le niveau du plafond au laser sur tout le périmètre.", "Fixer les cornières ou lisses périphériques."],
      },
      {
        title: "Poser les suspentes",
        details: [
          "Fixer les suspentes au support avec des chevilles adaptées à la charge.",
          "Respecter l'entraxe des suspentes et des fourrures donné par le fabricant (souvent 50 à 60 cm pour les fourrures).",
        ],
        warning: "Le poids d'un isolant posé sur le plafond se rajoute : vérifier l'entraxe des suspentes en conséquence.",
      },
      {
        title: "Monter les fourrures",
        details: ["Clipser les fourrures dans les suspentes, régler la planéité au laser.", "Éclisser les fourrures en décalant les jonctions."],
      },
      {
        title: "Plaquer",
        details: [
          "Poser les plaques perpendiculairement aux fourrures, à joints décalés.",
          "Visser tous les 20 cm environ en plafond.",
          "Réserver les spots, trappes et bouches de ventilation.",
        ],
      },
    ],
    checks: ["Planéité au laser.", "Aucun jeu ni flèche.", "Réservations aux bons emplacements."],
    norms: [DTU_25_41],
  },
  {
    id: "plaq-traitement-joints",
    tradeCategoryId: "second-oeuvre",
    tradeIds: PLAQUISTES,
    keywords: ["joints", "bandes", "enduit", "ponçage", "finition", "angles"],
    title: "Traiter les joints des plaques de plâtre",
    summary: "Bandes et enduit en trois passes pour un support prêt à peindre.",
    duration: "Environ 30 à 40 m² par jour et par compagnon, hors temps de séchage",
    tools: ["Couteaux à enduire (5, 15, 25 cm)", "Lisseuse", "Taloche ou ponceuse girafe", "Auge"],
    materials: ["Enduit à joints (prise ou séchage)", "Bandes papier ou fibre", "Cornières d'angle"],
    safety: [POUSSIERES],
    steps: [
      {
        title: "Préparer",
        details: ["Vérifier que les vis ne dépassent pas et que les plaques sont bien fixées.", "Dépoussiérer."],
      },
      {
        title: "Première passe et bande",
        details: [
          "Remplir le joint d'enduit, noyer la bande en chassant l'air.",
          "Reboucher les têtes de vis.",
          "Poser les cornières sur les angles sortants.",
        ],
      },
      {
        title: "Deuxième et troisième passes",
        details: [
          "Après séchage, recouvrir plus large à chaque passe pour fondre le joint dans la plaque.",
          "Lisser sans surépaisseur.",
        ],
        warning: "Une passe sur un enduit mal sec provoque fissures et creux visibles à la peinture.",
      },
      {
        title: "Poncer",
        details: ["Poncer légèrement au grain fin, sans attaquer le carton.", "Dépoussiérer avant la couche d'impression."],
      },
    ],
    checks: ["Aucun joint visible en lumière rasante.", "Aucune bande décollée.", "Support dépoussiéré."],
    norms: [DTU_25_41],
  },
  {
    id: "plaq-pieces-humides",
    tradeCategoryId: "second-oeuvre",
    tradeIds: PLAQUISTES,
    keywords: ["pièce humide", "hydrofuge", "H1", "salle de bain", "SPEC", "douche"],
    title: "Plaques de plâtre en pièces humides",
    summary: "Choix des plaques et précautions de pose en salle de bain, cuisine et WC.",
    duration: "Selon le chantier",
    tools: ["Outillage plaquiste habituel"],
    materials: ["Plaques hydrofuges H1", "Ossatures traitées contre la corrosion", "Système d'étanchéité sous carrelage (SPEC) en zone de douche", "Mastic et bandes adaptés"],
    safety: [POUSSIERES],
    steps: [
      {
        title: "Classer la pièce",
        details: [
          "Identifier le classement d'exposition à l'eau de la pièce et de chaque paroi (EA, EB, EB+, EC).",
          "Les parois exposées aux projections d'eau demandent des plaques H1 et une protection à l'eau.",
        ],
      },
      {
        title: "Poser",
        details: [
          "Laisser 1 cm au sol et le protéger par une bande ou un mastic : la plaque ne doit pas tremper dans l'eau.",
          "Utiliser des vis et ossatures résistant à la corrosion.",
        ],
        warning: "Une plaque standard en salle de bain finit par gonfler et moisir.",
      },
      {
        title: "Protéger la zone de douche",
        details: [
          "Appliquer un système d'étanchéité sous carrelage (SPEC) sur les parois de douche, avec bandes d'angle.",
          "Traiter les traversées de tuyaux avec les manchettes du système.",
        ],
      },
    ],
    checks: ["Plaques H1 en zone humide.", "Pied de cloison protégé.", "SPEC continu en zone de douche."],
    norms: [DTU_25_41, { ref: "Cahier CSTB 3567", label: "Classement des locaux en fonction de l'exposition à l'eau" }],
  },
  {
    id: "plaq-huisserie-ouverture",
    tradeCategoryId: "second-oeuvre",
    tradeIds: PLAQUISTES,
    keywords: ["huisserie", "bloc-porte", "ouverture", "porte", "linteau"],
    title: "Poser une huisserie dans une cloison sèche",
    summary: "Intégration d'un bloc-porte ou d'une huisserie dans une cloison en plaques de plâtre.",
    duration: "1 à 2 heures par porte",
    tools: ["Niveau, mètre, équerre", "Visseuse", "Cisaille", "Serre-joints"],
    materials: ["Bloc-porte ou huisserie", "Montants doublés ou renforcés", "Rail de linteau", "Vis et pattes de fixation"],
    safety: [POUSSIERES],
    steps: [
      {
        title: "Préparer l'ossature",
        details: [
          "Doubler ou renforcer les montants de chaque côté du passage.",
          "Créer le linteau avec un rail retourné, fixé aux montants.",
        ],
      },
      {
        title: "Fixer l'huisserie",
        details: [
          "Mettre l'huisserie d'aplomb et d'équerre, caler.",
          "Fixer l'huisserie sur les montants renforcés selon la notice.",
        ],
        warning: "Une huisserie hors d'équerre fait frotter la porte : contrôler les diagonales avant de visser.",
      },
      {
        title: "Plaquer",
        details: ["Plaquer en évitant que les joints de plaques tombent dans le prolongement des montants de l'huisserie."],
      },
    ],
    checks: ["Porte qui ferme sans frotter.", "Huisserie d'aplomb.", "Aucune fissure au-dessus du linteau."],
    norms: [DTU_25_41],
  },
  {
    id: "plaq-etancheite-air",
    tradeCategoryId: "second-oeuvre",
    tradeIds: [...PLAQUISTES, "poseur-isolation"],
    keywords: ["étanchéité à l'air", "pare-vapeur", "frein-vapeur", "membrane", "RE2020", "test d'infiltrométrie"],
    title: "Assurer l'étanchéité à l'air avec la membrane pare-vapeur",
    summary: "Mise en œuvre continue d'une membrane d'étanchéité à l'air derrière les doublages et plafonds.",
    duration: "Selon la surface",
    tools: ["Agrafeuse", "Cutter", "Maroufleur", "Rouleau de mesure"],
    materials: ["Membrane pare-vapeur ou frein-vapeur", "Adhésifs et mastic-colle compatibles", "Manchettes et passe-gaines étanches", "Boîtiers électriques étanches à l'air"],
    safety: ["Travail en hauteur : plateforme stable."],
    steps: [
      {
        title: "Poser la membrane",
        details: [
          "Côté intérieur, recouvrements de 10 cm minimum scotchés.",
          "Agrafer provisoirement puis maintenir par l'ossature.",
        ],
      },
      {
        title: "Raccorder aux parois",
        details: [
          "Coller la membrane sur les maçonneries, les menuiseries et les dalles au mastic-colle ou à l'adhésif adapté.",
          "Ménager un pli de dilatation aux jonctions mobiles (charpente).",
        ],
      },
      {
        title: "Traiter les traversées",
        details: [
          "Utiliser des manchettes pour les gaines et tuyaux.",
          "Poser des boîtiers électriques étanches à l'air.",
        ],
        warning: "Les traversées sont la première cause d'échec au test d'infiltrométrie.",
      },
      {
        title: "Contrôler avant fermeture",
        details: ["Faire le tour visuel de la membrane, réparer chaque perforation avant de plaquer."],
      },
    ],
    checks: ["Membrane continue et sans déchirure.", "Raccords collés partout.", "Test d'infiltrométrie réussi si prévu."],
    norms: [DTU_25_41, { ref: "RE2020", label: "Exigences de perméabilité à l'air des bâtiments neufs" }],
  },
  {
    id: "plaq-cloison-acoustique",
    tradeCategoryId: "second-oeuvre",
    tradeIds: PLAQUISTES,
    keywords: ["acoustique", "isolation phonique", "double ossature", "cloison séparative", "bruit"],
    title: "Monter une cloison à haute performance acoustique",
    summary: "Cloison à double ossature ou double peau pour séparer deux pièces bruyantes ou deux logements.",
    duration: "Environ 8 à 10 m² par jour et par compagnon",
    tools: ["Outillage plaquiste", "Mastic acoustique au pistolet"],
    materials: ["Double ossature désolidarisée", "Plaques acoustiques ou deux BA13 par face", "Laine minérale dans chaque ossature", "Bande résiliente, mastic acoustique"],
    safety: [POUSSIERES],
    steps: [
      {
        title: "Choisir le système",
        details: [
          "Choisir un système testé dont l'affaiblissement acoustique répond à l'objectif.",
          "Suivre exactement la composition du procès-verbal d'essai.",
        ],
      },
      {
        title: "Désolidariser",
        details: [
          "Poser la bande résiliente sous les rails et sur les parois de rive.",
          "Les deux ossatures ne doivent pas se toucher.",
        ],
        warning: "Un seul pont rigide entre les deux ossatures fait perdre une grande partie de la performance.",
      },
      {
        title: "Plaquer et isoler",
        details: [
          "Remplir chaque ossature de laine minérale.",
          "Plaquer en deux couches à joints décalés.",
          "Traiter les jonctions au mastic acoustique.",
        ],
      },
      {
        title: "Traiter les boîtiers",
        details: ["Ne jamais placer deux boîtiers électriques dos à dos.", "Utiliser des boîtiers acoustiques."],
      },
    ],
    checks: ["Aucun pont rigide.", "Jonctions mastiquées.", "Boîtiers décalés."],
    norms: [DTU_25_41, { ref: "NRA", label: "Nouvelle réglementation acoustique (logements neufs)" }],
  },
  {
    id: "plaq-charges-lourdes",
    tradeCategoryId: "second-oeuvre",
    tradeIds: PLAQUISTES,
    keywords: ["renfort", "charge lourde", "fixation", "meuble suspendu", "chevilles", "lavabo", "TV"],
    title: "Prévoir les renforts pour charges lourdes",
    summary: "Renforts dans l'ossature et fixations adaptées pour meubles hauts, éléments sanitaires et écrans.",
    duration: "À intégrer pendant le montage de la cloison",
    tools: ["Visseuse, scie", "Mètre, niveau"],
    materials: ["Traverses métalliques ou bois de renfort", "Chevilles à expansion pour plaque de plâtre", "Plaques haute dureté si besoin"],
    safety: [POUSSIERES],
    steps: [
      {
        title: "Recenser les charges",
        details: [
          "Lister avec le client les meubles hauts, sanitaires suspendus, écrans, radiateurs.",
          "Noter leur hauteur et leur poids.",
        ],
      },
      {
        title: "Poser les renforts",
        details: [
          "Avant la fermeture, fixer des traverses entre les montants à la hauteur des fixations.",
          "Repérer les renforts sur un plan ou par photo pour le client.",
        ],
        warning: "Ajouter un renfort après coup impose d'ouvrir la cloison.",
      },
      {
        title: "Fixer",
        details: [
          "Charges légères : chevilles à expansion adaptées à la plaque.",
          "Charges lourdes : visser dans les renforts ou utiliser un bâti dédié.",
        ],
      },
    ],
    checks: ["Renforts aux hauteurs prévues.", "Photos de repérage remises au client."],
    norms: [DTU_25_41],
  },
];
