import type { ClientTechnicalSheet } from "@/lib/technical-sheets/client/types";

const PLOMBIER = { categoryId: "plomberie-chauffage", tradeId: "plombier" };
const COUPER_EAU = "Repérez votre robinet d'arrêt général (près du compteur d'eau, souvent sous l'évier, à la cave ou dans un regard extérieur).";

export const CLIENT_SHEETS_EAU: ClientTechnicalSheet[] = [
  {
    id: "client-fuite-eau-urgence",
    domain: "eau",
    level: "urgence",
    proTrade: PLOMBIER,
    keywords: ["fuite", "fuite d'eau", "dégât des eaux", "inondation", "eau qui coule", "plafond qui goutte", "tache au plafond"],
    title: "Fuite d'eau : les gestes d'urgence",
    summary: "Limiter les dégâts tout de suite, sécuriser l'électricité et préparer l'intervention et l'assurance.",
    duration: "5 à 15 minutes",
    tools: ["Seaux, serpillières, serviettes", "Lampe torche", "Téléphone pour les photos"],
    materials: [],
    safety: [
      "Si l'eau touche des prises, des appareils ou le tableau électrique : coupez le disjoncteur général avant d'approcher, sans avoir les pieds dans l'eau.",
      "Ne touchez jamais un appareil électrique mouillé.",
      COUPER_EAU,
    ],
    steps: [
      {
        title: "Couper l'eau",
        details: [
          "Fermez le robinet d'arrêt sous l'appareil qui fuit, s'il y en a un.",
          "Sinon, fermez le robinet d'arrêt général (tournez dans le sens des aiguilles d'une montre).",
          "Ouvrez un robinet bas pour vider la pression restante.",
        ],
      },
      {
        title: "Mettre en sécurité",
        details: [
          "Coupez l'électricité de la zone mouillée (ou le disjoncteur général en cas de doute).",
          "Éloignez meubles, tapis et objets de valeur, épongez.",
        ],
        warning: "Un plafond gonflé d'eau peut céder : ne restez pas dessous. Percez-le seulement si un pro vous le conseille.",
      },
      {
        title: "Trouver d'où vient l'eau",
        details: [
          "Regardez les flexibles sous les éviers, le chauffe-eau, le lave-linge et les WC.",
          "Si l'eau vient du plafond, prévenez votre voisin du dessus ou le syndic.",
        ],
      },
      {
        title: "Préparer l'assurance",
        details: [
          "Prenez des photos des dégâts et de l'origine de la fuite.",
          "Gardez les factures de réparation et déclarez le sinistre à votre assurance (souvent sous 5 jours ouvrés).",
          "En immeuble, remplissez un constat amiable de dégât des eaux avec le voisin concerné.",
        ],
      },
    ],
    checks: ["L'eau ne coule plus.", "La zone mouillée est hors tension.", "Les photos sont prises."],
    norms: [],
    whenToCallPro: [
      "La fuite vient d'un tuyau dans un mur, un sol ou un plafond.",
      "Vous ne trouvez pas l'origine de la fuite.",
      "L'eau a touché l'installation électrique.",
      "La fuite continue même robinet général fermé.",
    ],
  },
  {
    id: "client-deboucher-evier-lavabo",
    domain: "eau",
    level: "facile",
    proTrade: PLOMBIER,
    keywords: ["évier bouché", "lavabo bouché", "douche bouchée", "évacuation lente", "siphon", "ventouse", "eau qui stagne"],
    title: "Déboucher un évier, un lavabo ou une douche",
    summary: "Les méthodes simples et sans danger, de la plus douce à la plus efficace.",
    duration: "15 à 30 minutes",
    tools: ["Ventouse", "Seau", "Gants", "Furet manuel (en option)"],
    materials: ["Bicarbonate de soude et vinaigre blanc", "Eau bouillante (sauf canalisations PVC fragiles : eau très chaude)"],
    safety: [
      "Ne mélangez jamais deux déboucheurs chimiques, ni un déboucheur avec de l'eau de Javel : risque de vapeurs toxiques.",
      "Portez des gants et protégez vos yeux si vous utilisez un produit.",
    ],
    steps: [
      {
        title: "Enlever les cheveux et déchets visibles",
        details: ["Retirez la grille ou le bouchon de la bonde et nettoyez ce qui est accessible."],
      },
      {
        title: "La ventouse",
        details: [
          "Bouchez le trop-plein avec un chiffon mouillé.",
          "Laissez quelques centimètres d'eau, placez la ventouse et pompez énergiquement une dizaine de fois.",
        ],
      },
      {
        title: "Nettoyer le siphon",
        details: [
          "Placez un seau dessous, dévissez le siphon à la main.",
          "Videz-le, rincez-le, puis revissez-le sans forcer en vérifiant le joint.",
        ],
        warning: "Revissez bien le siphon : faites couler l'eau et vérifiez qu'il ne goutte pas.",
      },
      {
        title: "Le mélange bicarbonate et vinaigre",
        details: ["Versez 3 cuillères de bicarbonate puis un verre de vinaigre, laissez agir 30 minutes, rincez à l'eau très chaude."],
      },
    ],
    checks: ["L'eau s'écoule normalement.", "Aucune fuite sous le siphon."],
    norms: [],
    whenToCallPro: [
      "Plusieurs appareils sont bouchés en même temps (le problème est plus loin dans la canalisation).",
      "L'eau remonte dans la douche quand vous videz un autre appareil.",
      "De mauvaises odeurs persistent malgré le nettoyage.",
    ],
  },
  {
    id: "client-wc-bouche",
    domain: "eau",
    level: "facile",
    proTrade: PLOMBIER,
    keywords: ["WC bouché", "toilettes bouchées", "cuvette qui déborde", "furet"],
    title: "Déboucher des toilettes",
    summary: "Éviter le débordement puis déboucher la cuvette avec les bons gestes.",
    duration: "15 à 30 minutes",
    tools: ["Ventouse à WC (à collerette)", "Gants longs", "Seau", "Furet à WC (en option)"],
    materials: ["Liquide vaisselle", "Eau chaude (pas bouillante : la céramique peut se fendre)"],
    safety: ["Ne tirez plus la chasse tant que c'est bouché : la cuvette déborderait.", "Pas de déboucheur chimique dans une cuvette pleine d'eau."],
    steps: [
      {
        title: "Arrêter le remplissage",
        details: ["Fermez le petit robinet d'arrêt du WC (sur l'arrivée d'eau, derrière ou à côté de la cuvette)."],
      },
      {
        title: "Le liquide vaisselle et l'eau chaude",
        details: ["Versez une bonne dose de liquide vaisselle, puis un seau d'eau chaude de hauteur, attendez 15 minutes."],
      },
      {
        title: "La ventouse",
        details: ["Placez la ventouse au fond de la cuvette et pompez fort une quinzaine de fois.", "Recommencez si l'eau commence à descendre."],
      },
      {
        title: "Le furet",
        details: ["Introduisez le furet dans la cuvette en tournant la manivelle, sans forcer sur l'émail."],
      },
    ],
    checks: ["L'eau descend normalement.", "La chasse fonctionne sans débordement."],
    norms: [],
    whenToCallPro: [
      "Rien n'y fait après la ventouse et le furet.",
      "Les toilettes se bouchent souvent.",
      "D'autres évacuations de la maison sont lentes en même temps.",
    ],
  },
  {
    id: "client-chasse-eau-coule",
    domain: "eau",
    level: "facile",
    proTrade: PLOMBIER,
    keywords: ["chasse d'eau qui coule", "WC qui fuit", "réservoir", "flotteur", "eau qui coule dans la cuvette", "facture d'eau"],
    title: "La chasse d'eau coule en continu",
    summary: "Une chasse qui coule peut gaspiller des centaines de litres par jour : diagnostic et petits réglages.",
    duration: "15 minutes",
    tools: ["Gants"],
    materials: ["Vinaigre blanc (contre le calcaire)"],
    safety: ["Fermez le robinet d'arrêt du WC avant d'ouvrir le réservoir.", "Manipulez le couvercle du réservoir avec soin : il est lourd et fragile."],
    steps: [
      {
        title: "Ouvrir et observer",
        details: [
          "Retirez le couvercle du réservoir.",
          "Si l'eau passe par le tube du trop-plein : le niveau est trop haut (flotteur).",
          "Si l'eau file sous le mécanisme : le joint du clapet est usé ou entartré.",
        ],
      },
      {
        title: "Régler le flotteur",
        details: ["Baissez le flotteur avec la vis ou la tige de réglage pour que l'eau s'arrête 2 cm sous le trop-plein."],
      },
      {
        title: "Nettoyer le joint",
        details: ["Videz le réservoir, essuyez le joint du clapet et retirez le calcaire au vinaigre blanc."],
      },
    ],
    checks: ["Plus aucun filet d'eau dans la cuvette après 10 minutes.", "Le réservoir se remplit puis s'arrête."],
    norms: [],
    whenToCallPro: ["Le mécanisme est cassé ou fuit toujours après nettoyage.", "De l'eau coule sous le réservoir, sur le sol."],
  },
  {
    id: "client-robinet-goutte",
    domain: "eau",
    level: "bricolage",
    proTrade: PLOMBIER,
    keywords: ["robinet qui goutte", "mitigeur qui fuit", "cartouche", "joint de robinet"],
    title: "Un robinet qui goutte",
    summary: "Identifier la pièce usée (joint ou cartouche) et la remplacer à l'identique.",
    duration: "30 minutes à 1 heure",
    tools: ["Clé plate ou clé à molette", "Tournevis", "Chiffon pour protéger le chromé"],
    materials: ["Cartouche ou joint identique (apportez l'ancien en magasin)"],
    safety: ["Coupez l'eau (robinets sous l'évier ou robinet général) et ouvrez le robinet pour vider la pression."],
    steps: [
      {
        title: "Couper l'eau et démonter la poignée",
        details: ["Retirez le cache coloré, dévissez la vis de la poignée et enlevez-la."],
      },
      {
        title: "Sortir la pièce usée",
        details: [
          "Mitigeur : dévissez l'écrou et sortez la cartouche.",
          "Robinet à deux têtes : dévissez la tête et changez le joint au bout.",
        ],
        warning: "Protégez le chromé avec un chiffon : la clé raye facilement.",
      },
      {
        title: "Remonter et tester",
        details: ["Posez la pièce neuve identique, remontez, rouvrez l'eau doucement."],
      },
    ],
    checks: ["Plus de goutte robinet fermé.", "Pas de fuite sous la poignée."],
    norms: [],
    whenToCallPro: ["Le robinet fuit par le bas ou sous l'évier.", "La pièce est grippée ou introuvable.", "Le corps du robinet est fissuré."],
  },
  {
    id: "client-plus-eau-chaude",
    domain: "eau",
    level: "facile",
    proTrade: PLOMBIER,
    keywords: ["plus d'eau chaude", "chauffe-eau", "ballon", "cumulus", "eau froide", "heures creuses"],
    title: "Plus d'eau chaude (chauffe-eau électrique)",
    summary: "Les vérifications simples avant de faire venir un professionnel.",
    duration: "10 minutes",
    tools: [],
    materials: [],
    safety: [
      "N'ouvrez jamais le capot électrique du chauffe-eau : il est sous tension.",
      "Si le chauffe-eau fuit, coupez son disjoncteur et l'eau froide qui l'alimente.",
    ],
    steps: [
      {
        title: "Vérifier le tableau électrique",
        details: [
          "Le disjoncteur du chauffe-eau (souvent noté « CE » ou « chauffe-eau ») est-il enclenché ?",
          "Repérez le contacteur heures creuses : positionnez-le sur « marche forcée » quelques heures pour tester.",
        ],
      },
      {
        title: "Vérifier l'abonnement",
        details: ["Après une coupure ou un changement de compteur, le signal heures creuses peut avoir changé : la marche forcée permet de le vérifier."],
      },
      {
        title: "Laisser le temps",
        details: ["Après une longue coupure, il faut plusieurs heures pour réchauffer un ballon complet."],
      },
    ],
    checks: ["L'eau redevient chaude après quelques heures en marche forcée."],
    norms: [],
    whenToCallPro: [
      "Le disjoncteur du chauffe-eau saute quand vous le réenclenchez.",
      "L'eau ne chauffe pas même en marche forcée.",
      "Le chauffe-eau fuit ou fait des bruits forts.",
    ],
  },
  {
    id: "client-groupe-securite",
    domain: "eau",
    level: "facile",
    proTrade: PLOMBIER,
    keywords: ["groupe de sécurité", "chauffe-eau qui goutte", "soupape", "entretien chauffe-eau"],
    title: "Entretenir le groupe de sécurité du chauffe-eau",
    summary: "Un geste d'entretien mensuel qui protège votre chauffe-eau, et quand une goutte est normale.",
    duration: "2 minutes",
    tools: [],
    materials: [],
    safety: ["L'eau qui sort peut être très chaude : gardez les mains éloignées de l'évacuation."],
    steps: [
      {
        title: "Repérer le groupe de sécurité",
        details: ["C'est l'organe avec une manette, sur l'arrivée d'eau froide sous le chauffe-eau, relié à un entonnoir."],
      },
      {
        title: "Manœuvrer une fois par mois",
        details: ["Tournez ou soulevez la manette quelques secondes : l'eau s'écoule dans l'entonnoir, puis remettez-la en place."],
      },
      {
        title: "Savoir ce qui est normal",
        details: ["Quelques gouttes pendant la chauffe sont normales : l'eau se dilate en chauffant."],
      },
    ],
    checks: ["L'eau s'évacue bien par l'entonnoir.", "Ça ne coule plus en continu après la manœuvre."],
    norms: [],
    whenToCallPro: ["Le groupe coule en permanence, même chauffe-eau froid.", "Rien ne sort quand vous manœuvrez la manette (il est entartré)."],
  },
  {
    id: "client-odeurs-canalisations",
    domain: "eau",
    level: "facile",
    proTrade: PLOMBIER,
    keywords: ["mauvaises odeurs", "odeur d'égout", "siphon sec", "canalisation qui sent"],
    title: "Mauvaises odeurs de canalisation",
    summary: "Les causes les plus fréquentes et comment s'en débarrasser.",
    duration: "15 minutes",
    tools: ["Seau", "Gants"],
    materials: ["Bicarbonate de soude", "Vinaigre blanc"],
    safety: ["Aérez la pièce. Une forte odeur d'œuf pourri peut aussi signaler une fuite de gaz : voir la fiche « Odeur de gaz »."],
    steps: [
      {
        title: "Remettre de l'eau dans les siphons",
        details: ["Un siphon peu utilisé (douche d'amis, lavabo) sèche et laisse passer les odeurs : faites couler l'eau une minute."],
      },
      {
        title: "Nettoyer les siphons",
        details: ["Démontez et rincez le siphon de l'évier ou du lavabo (voir la fiche « Déboucher un évier »)."],
      },
      {
        title: "Traiter au bicarbonate",
        details: ["Bicarbonate puis vinaigre dans chaque évacuation, 30 minutes, rinçage à l'eau très chaude."],
      },
    ],
    checks: ["L'odeur a disparu après 24 heures."],
    norms: [],
    whenToCallPro: ["L'odeur revient dans toute la maison.", "Les évacuations glougloutent ou se vident mal.", "L'odeur vient d'un mur ou du sol."],
  },
  {
    id: "client-canalisations-gel",
    domain: "eau",
    level: "facile",
    proTrade: PLOMBIER,
    keywords: ["gel", "canalisation gelée", "tuyau gelé", "hiver", "compteur gelé", "plus d'eau froid"],
    title: "Prévenir et gérer le gel des canalisations",
    summary: "Protéger les tuyaux exposés et dégeler en sécurité.",
    duration: "30 minutes",
    tools: ["Sèche-cheveux", "Serviettes chaudes"],
    materials: ["Manchons isolants pour tuyaux", "Plaque de polystyrène pour le regard du compteur"],
    safety: [
      "Jamais de flamme (chalumeau, briquet) pour dégeler un tuyau : risque d'incendie et de rupture.",
      "Pas d'appareil électrique près d'une zone mouillée.",
    ],
    steps: [
      {
        title: "Avant le froid",
        details: [
          "Isolez les tuyaux dans les zones non chauffées (garage, cave, vide sanitaire).",
          "Isolez le regard du compteur avec du polystyrène (pas de paille ni de laine qui retiennent l'humidité).",
          "Vidangez et coupez le robinet extérieur.",
        ],
      },
      {
        title: "Si un tuyau est gelé",
        details: [
          "Ouvrez le robinet concerné.",
          "Réchauffez doucement le tuyau au sèche-cheveux ou avec des serviettes chaudes, en partant du robinet.",
        ],
      },
    ],
    checks: ["L'eau coule de nouveau.", "Aucune fuite au dégel."],
    norms: [],
    whenToCallPro: ["Un tuyau est fendu ou fuit au dégel.", "Le compteur est gelé (prévenez aussi votre fournisseur d'eau)."],
  },
  {
    id: "client-pression-faible",
    domain: "eau",
    level: "facile",
    proTrade: PLOMBIER,
    keywords: ["pression faible", "peu de débit", "mousseur", "calcaire", "douche faible"],
    title: "Peu de pression au robinet ou à la douche",
    summary: "Le plus souvent, c'est du calcaire : vérifications simples.",
    duration: "20 minutes",
    tools: ["Chiffon", "Petit récipient"],
    materials: ["Vinaigre blanc"],
    safety: [],
    steps: [
      {
        title: "Un seul robinet ?",
        details: ["Si un seul robinet ou la douche est concerné : le mousseur ou le pommeau est entartré."],
      },
      {
        title: "Détartrer",
        details: ["Dévissez le mousseur ou le pommeau, faites-le tremper une nuit dans le vinaigre blanc, rincez, remontez."],
      },
      {
        title: "Toute la maison ?",
        details: [
          "Vérifiez que le robinet d'arrêt général est complètement ouvert.",
          "Demandez à vos voisins : si eux aussi, c'est le réseau public (contactez le service des eaux).",
        ],
      },
    ],
    checks: ["Le débit est revenu."],
    norms: [],
    whenToCallPro: ["Toute la maison a perdu de la pression sans raison extérieure.", "Le problème touche uniquement l'eau chaude."],
  },
];
