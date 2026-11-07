import type { ClientTechnicalSheet } from "@/lib/technical-sheets/client/types";

const ELECTRICIEN = { categoryId: "electricite", tradeId: "electricien" };
const CHAUFFAGISTE = { categoryId: "plomberie-chauffage", tradeId: "plombier-chauffagiste" };
const NE_PAS_OUVRIR = "N'ouvrez jamais une prise, un interrupteur ou le tableau électrique : ces interventions sont réservées à un électricien.";

export const CLIENT_SHEETS_ENERGIE: ClientTechnicalSheet[] = [
  {
    id: "client-coupure-courant",
    domain: "electricite",
    level: "urgence",
    proTrade: ELECTRICIEN,
    keywords: ["coupure de courant", "plus d'électricité", "panne de courant", "plus de lumière", "compteur Linky"],
    title: "Coupure de courant : que vérifier ?",
    summary: "Savoir en quelques minutes si la panne vient de chez vous ou du réseau.",
    duration: "5 à 10 minutes",
    tools: ["Lampe torche ou téléphone"],
    materials: [],
    safety: [NE_PAS_OUVRIR, "Débranchez les appareils sensibles (ordinateur, TV) pour éviter un à-coup au retour du courant."],
    steps: [
      {
        title: "Chez vous ou dans le quartier ?",
        details: [
          "Regardez si les voisins et l'éclairage public ont du courant.",
          "Si tout le quartier est coupé : c'est le réseau. Consultez l'application ou le site d'Enedis, ou appelez le numéro de dépannage indiqué sur votre facture.",
        ],
      },
      {
        title: "Le disjoncteur général",
        details: [
          "Le disjoncteur près du compteur (ou dans le tableau) est-il baissé ? Remontez-le.",
          "S'il retombe aussitôt, un appareil ou un circuit est en défaut : voir la fiche « Le disjoncteur saute ».",
        ],
      },
      {
        title: "Une partie de la maison seulement ?",
        details: ["Ouvrez le tableau (la porte, pas le capot) et remontez le différentiel ou le petit disjoncteur baissé."],
      },
    ],
    checks: ["Le courant est revenu dans toutes les pièces."],
    norms: [],
    whenToCallPro: [
      "Le disjoncteur retombe dès que vous le remontez, même tout débranché.",
      "Odeur de brûlé, traces noires ou chaleur au tableau.",
      "Le tableau a pris l'eau.",
    ],
  },
  {
    id: "client-disjoncteur-saute",
    domain: "electricite",
    level: "facile",
    proTrade: ELECTRICIEN,
    keywords: ["disjoncteur qui saute", "différentiel qui saute", "ça disjoncte", "disjoncte quand il pleut", "court-circuit"],
    title: "Le disjoncteur ou le différentiel saute",
    summary: "Trouver l'appareil ou le circuit en cause, sans toucher à l'installation.",
    duration: "15 minutes",
    tools: ["Lampe torche"],
    materials: [],
    safety: [NE_PAS_OUVRIR, "N'essayez jamais de bloquer un disjoncteur pour l'empêcher de sauter : il vous protège."],
    steps: [
      {
        title: "Débrancher tous les appareils",
        details: ["Débranchez tout ce qui est branché dans la partie de la maison concernée."],
      },
      {
        title: "Réarmer",
        details: ["Remontez le différentiel ou le disjoncteur qui est tombé."],
      },
      {
        title: "Rebrancher un par un",
        details: [
          "Rebranchez les appareils un par un en attendant quelques secondes à chaque fois.",
          "Celui qui fait sauter le disjoncteur est en défaut : ne l'utilisez plus et faites-le réparer.",
        ],
        warning: "Lave-linge, four, chauffe-eau et appareils d'extérieur sont les plus souvent en cause.",
      },
      {
        title: "Si ça saute sans aucun appareil branché",
        details: ["Le défaut est dans l'installation (souvent l'humidité : prise extérieure, boîte de dérivation, salle de bain)."],
      },
    ],
    checks: ["Le disjoncteur tient avec tous les appareils sains rebranchés."],
    norms: [],
    whenToCallPro: [
      "Ça saute sans aucun appareil branché.",
      "Ça saute quand il pleut (infiltration d'eau dans l'installation).",
      "Odeur de brûlé, prise noircie ou chaude.",
    ],
  },
  {
    id: "client-prise-chauffe-brule",
    domain: "electricite",
    level: "urgence",
    proTrade: ELECTRICIEN,
    keywords: ["prise qui chauffe", "odeur de brûlé", "prise noircie", "étincelle", "grésillement", "interrupteur chaud"],
    title: "Prise ou interrupteur qui chauffe ou sent le brûlé",
    summary: "Un signe de mauvais contact, cause fréquente d'incendie : les gestes immédiats.",
    duration: "2 minutes",
    tools: [],
    materials: [],
    safety: [
      "En cas de fumée ou de flammes : quittez la pièce et appelez le 18 ou le 112. N'utilisez jamais d'eau sur un feu électrique.",
      NE_PAS_OUVRIR,
    ],
    steps: [
      {
        title: "Couper",
        details: ["Coupez le disjoncteur du circuit concerné au tableau (ou le disjoncteur général en cas de doute)."],
      },
      {
        title: "Ne plus utiliser",
        details: ["Débranchez l'appareil (une fois le courant coupé) et n'utilisez plus la prise.", "Signalez-la (ruban adhésif) pour que personne ne s'en serve."],
      },
      {
        title: "Faire contrôler",
        details: ["Faites venir un électricien : le mauvais contact peut aussi exister derrière d'autres prises du même circuit."],
      },
    ],
    checks: ["Le circuit est coupé.", "Plus aucune odeur ni chaleur."],
    norms: [],
    whenToCallPro: ["Toujours : une prise qui chauffe doit être vérifiée par un électricien."],
  },
  {
    id: "client-tester-differentiel",
    domain: "electricite",
    level: "facile",
    proTrade: ELECTRICIEN,
    keywords: ["bouton test", "différentiel", "tester tableau électrique", "sécurité électrique"],
    title: "Tester ses différentiels (une fois par mois)",
    summary: "Un geste simple pour vérifier que votre installation vous protège.",
    duration: "2 minutes",
    tools: [],
    materials: [],
    safety: ["Prévenez la maison : le test coupe le courant de plusieurs pièces quelques secondes."],
    steps: [
      {
        title: "Repérer les différentiels",
        details: ["Dans le tableau, ce sont les appareils plus larges avec un bouton « T » ou « Test », en tête de chaque rangée."],
      },
      {
        title: "Appuyer sur Test",
        details: ["Appuyez sur le bouton : le différentiel doit tomber immédiatement.", "Remontez-le."],
      },
    ],
    checks: ["Chaque différentiel tombe au test et se réarme."],
    norms: [],
    whenToCallPro: ["Un différentiel ne tombe pas au test : il ne vous protège plus.", "Votre tableau n'a pas de différentiel du tout."],
  },
  {
    id: "client-changer-luminaire",
    domain: "electricite",
    level: "bricolage",
    proTrade: ELECTRICIEN,
    keywords: ["changer luminaire", "plafonnier", "suspension", "DCL", "ampoule", "lampe"],
    title: "Changer un luminaire sur une prise DCL",
    summary: "Dans les logements récents, le plafond a une prise DCL : le luminaire se branche sans toucher aux fils.",
    duration: "20 minutes",
    tools: ["Escabeau stable", "Tournevis"],
    materials: ["Luminaire équipé d'une fiche DCL"],
    safety: [
      "Coupez le disjoncteur du circuit d'éclairage au tableau, pas seulement l'interrupteur.",
      "S'il n'y a que des fils sortant du plafond (pas de prise DCL), faites appel à un électricien.",
    ],
    steps: [
      {
        title: "Couper et décrocher",
        details: ["Coupez le disjoncteur, décrochez l'ancien luminaire, débranchez sa fiche DCL."],
      },
      {
        title: "Fixer et brancher",
        details: ["Fixez le support du nouveau luminaire, branchez sa fiche DCL dans la prise du plafond."],
      },
      {
        title: "Remettre le courant",
        details: ["Remontez le disjoncteur et testez à l'interrupteur."],
      },
    ],
    checks: ["Le luminaire s'allume et tient solidement."],
    norms: [],
    whenToCallPro: ["Il n'y a pas de prise DCL au plafond.", "Le luminaire est lourd (fixation à renforcer)."],
  },
  {
    id: "client-purger-radiateur",
    domain: "chauffage",
    level: "facile",
    proTrade: CHAUFFAGISTE,
    keywords: ["purger radiateur", "radiateur froid en haut", "radiateur qui glougloute", "air dans radiateur", "chauffage central"],
    title: "Purger un radiateur",
    summary: "Un radiateur froid en haut ou qui glougloute contient de l'air : la purge règle le problème.",
    duration: "10 minutes par radiateur",
    tools: ["Clé de purge (ou tournevis plat)", "Chiffon", "Petit récipient"],
    materials: [],
    safety: ["L'eau peut être très chaude : laissez refroidir le radiateur et protégez vos mains."],
    steps: [
      {
        title: "Arrêter le chauffage",
        details: ["Coupez le chauffage et laissez refroidir une heure."],
      },
      {
        title: "Ouvrir la purge",
        details: [
          "La vis de purge est en haut du radiateur, du côté opposé au robinet.",
          "Tenez le récipient dessous, ouvrez d'un quart de tour : l'air siffle.",
          "Refermez dès que l'eau coule en continu.",
        ],
      },
      {
        title: "Vérifier la pression",
        details: ["Sur une chaudière, regardez le manomètre et remettez de la pression si besoin (voir la fiche « Chaudière : pression basse »)."],
      },
    ],
    checks: ["Le radiateur chauffe partout.", "La vis de purge ne goutte pas."],
    norms: [],
    whenToCallPro: ["Les radiateurs sont froids en bas (boues : un désembouage est nécessaire).", "Il faut purger très souvent."],
  },
  {
    id: "client-chaudiere-pression",
    domain: "chauffage",
    level: "facile",
    proTrade: CHAUFFAGISTE,
    keywords: ["chaudière en panne", "chaudière en sécurité", "pression basse", "manomètre", "plus de chauffage", "code erreur chaudière"],
    title: "Chaudière en sécurité ou pression basse",
    summary: "Les vérifications autorisées à l'utilisateur, selon la notice de la chaudière.",
    duration: "15 minutes",
    tools: ["Notice de la chaudière"],
    materials: [],
    safety: [
      "Odeur de gaz : ne touchez à rien et suivez la fiche « Odeur de gaz ».",
      "N'ouvrez jamais le capot de la chaudière.",
    ],
    steps: [
      {
        title: "Lire l'écran",
        details: ["Notez le code affiché et cherchez-le dans la notice : beaucoup de codes indiquent une pression basse."],
      },
      {
        title: "Vérifier la pression",
        details: [
          "À froid, la pression se situe en général entre 1 et 1,5 bar (voir votre notice).",
          "Si elle est trop basse, ouvrez doucement le robinet de remplissage sous la chaudière jusqu'à la bonne valeur, puis refermez-le.",
        ],
        warning: "Refermez bien le robinet de remplissage : une pression trop haute fait couler la soupape de sécurité.",
      },
      {
        title: "Réarmer",
        details: ["Appuyez sur le bouton de réarmement (« reset ») une seule fois, comme indiqué dans la notice."],
      },
    ],
    checks: ["La chaudière redémarre et la pression reste stable."],
    norms: [],
    whenToCallPro: [
      "La chaudière se remet en sécurité après un réarmement.",
      "La pression baisse régulièrement (fuite sur le circuit).",
      "L'entretien annuel n'a pas été fait (il est obligatoire).",
    ],
  },
  {
    id: "client-odeur-gaz",
    domain: "chauffage",
    level: "urgence",
    proTrade: CHAUFFAGISTE,
    keywords: ["odeur de gaz", "fuite de gaz", "ça sent le gaz", "gazinière", "chaudière gaz"],
    title: "Odeur de gaz : les gestes qui sauvent",
    summary: "Que faire immédiatement si vous sentez le gaz chez vous.",
    duration: "Immédiat",
    tools: [],
    materials: [],
    safety: [
      "Ne touchez à aucun interrupteur, sonnette ou appareil électrique, ne débranchez rien : une étincelle suffit.",
      "Pas de flamme, pas de cigarette.",
    ],
    steps: [
      {
        title: "Aérer et couper",
        details: ["Ouvrez grand portes et fenêtres.", "Fermez le robinet de gaz du compteur (quart de tour) si vous pouvez le faire sans risque."],
      },
      {
        title: "Sortir",
        details: ["Faites sortir tout le monde et éloignez-vous du logement."],
      },
      {
        title: "Appeler depuis l'extérieur",
        details: [
          "Gaz naturel : Urgence Sécurité Gaz au 0 800 47 33 33 (gratuit, 24 h/24).",
          "En cas de malaise ou d'odeur très forte : les pompiers, 18 ou 112.",
          "Gaz en citerne ou bouteille : le numéro d'urgence de votre fournisseur.",
        ],
      },
    ],
    checks: ["Personne ne rentre avant l'accord des secours ou du technicien gaz."],
    norms: [],
    whenToCallPro: ["Toujours : après une odeur de gaz, l'installation doit être vérifiée avant tout redémarrage."],
  },
  {
    id: "client-detecteur-monoxyde",
    domain: "chauffage",
    level: "urgence",
    proTrade: CHAUFFAGISTE,
    keywords: ["monoxyde de carbone", "détecteur CO", "maux de tête", "intoxication", "poêle", "chauffage d'appoint", "alarme qui sonne"],
    title: "Monoxyde de carbone : détecteur qui sonne ou malaises",
    summary: "Le monoxyde est invisible et sans odeur : réagir vite.",
    duration: "Immédiat",
    tools: [],
    materials: [],
    safety: ["Maux de tête, nausées, vertiges chez plusieurs personnes de la maison : pensez au monoxyde de carbone."],
    steps: [
      {
        title: "Aérer et arrêter",
        details: ["Ouvrez portes et fenêtres.", "Arrêtez si possible les appareils à combustion : chaudière, poêle, chauffage d'appoint, chauffe-eau gaz."],
      },
      {
        title: "Sortir et appeler",
        details: ["Sortez tous de la maison et appelez le 18 ou le 112 (ou le 114 par SMS pour les personnes sourdes ou malentendantes)."],
      },
      {
        title: "Avant de revenir",
        details: ["Ne rentrez qu'avec l'accord des secours et faites vérifier les appareils et les conduits par un professionnel."],
      },
    ],
    checks: ["Tout le monde est dehors et les secours sont prévenus."],
    norms: [],
    whenToCallPro: ["Toujours : appareil et conduit d'évacuation à faire contrôler et ramoner."],
  },
  {
    id: "client-radiateur-electrique",
    domain: "chauffage",
    level: "facile",
    proTrade: ELECTRICIEN,
    keywords: ["radiateur électrique ne chauffe plus", "convecteur", "chauffage électrique en panne", "fil pilote"],
    title: "Un radiateur électrique ne chauffe plus",
    summary: "Les réglages et vérifications à faire avant d'appeler.",
    duration: "10 minutes",
    tools: [],
    materials: [],
    safety: [NE_PAS_OUVRIR, "Ne couvrez jamais un radiateur électrique (linge à sécher) : risque d'incendie."],
    steps: [
      {
        title: "Vérifier les réglages",
        details: [
          "Le radiateur est-il sur « confort » et le thermostat assez haut ?",
          "Un programmateur ou un mode « hors-gel » ou « éco » peut le brider.",
        ],
      },
      {
        title: "Vérifier le tableau",
        details: ["Le disjoncteur du chauffage est-il enclenché ?"],
      },
      {
        title: "Laisser le temps",
        details: ["Mettez-le en confort au maximum 30 minutes et vérifiez s'il tiédit."],
      },
    ],
    checks: ["Le radiateur chauffe en mode confort."],
    norms: [],
    whenToCallPro: ["Il reste froid malgré les bons réglages et le disjoncteur enclenché.", "Il sent le brûlé ou fait disjoncter."],
  },
];
