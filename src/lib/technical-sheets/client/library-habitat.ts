import type { ClientTechnicalSheet } from "@/lib/technical-sheets/client/types";

const PEINTRE = { categoryId: "second-oeuvre", tradeId: "peintre-batiment" };
const CARRELEUR = { categoryId: "second-oeuvre", tradeId: "carreleur" };
const MACON = { categoryId: "gros-oeuvre", tradeId: "macon" };
const MENUISIER = { categoryId: "second-oeuvre", tradeId: "menuisier-bois" };
const VOLETS = { categoryId: "menuiseries-exterieures", tradeId: "poseur-volets-stores" };
const COUVREUR = { categoryId: "couverture", tradeId: "couvreur" };
const VMC = { categoryId: "plomberie-chauffage", tradeId: "installateur-vmc" };
const SERRURIER = { categoryId: "menuiseries-exterieures", tradeId: "serrurier" };
const HAUTEUR = "Pas de travail sur un toit ni sur une échelle par temps de pluie, de vent ou seul : une chute de hauteur est grave.";

export const CLIENT_SHEETS_HABITAT: ClientTechnicalSheet[] = [
  {
    id: "client-moisissures-mur",
    domain: "murs-sols",
    level: "facile",
    proTrade: PEINTRE,
    keywords: ["moisissures", "taches noires", "mur qui noircit", "humidité", "condensation", "salle de bain", "champignons"],
    title: "Moisissures sur un mur ou un plafond",
    summary: "Nettoyer sans danger et surtout trouver ce qui crée l'humidité.",
    duration: "30 minutes",
    tools: ["Éponge", "Gants, lunettes et masque", "Pulvérisateur"],
    materials: ["Vinaigre blanc ou produit anti-moisissures", "Chiffons"],
    safety: [
      "Portez gants, lunettes et masque : les spores irritent les voies respiratoires.",
      "Ne mélangez jamais Javel et vinaigre ou autre produit.",
    ],
    steps: [
      {
        title: "Trouver la cause",
        details: [
          "Buée aux fenêtres, salle de bain sans fenêtre : c'est de la condensation (aération insuffisante).",
          "Tache qui s'étend depuis le bas du mur ou un angle : infiltration ou remontée d'humidité.",
        ],
      },
      {
        title: "Nettoyer",
        details: ["Pulvérisez le vinaigre ou le produit, laissez agir, frottez, rincez et séchez."],
      },
      {
        title: "Aérer",
        details: [
          "Ouvrez les fenêtres 10 minutes par jour, même l'hiver.",
          "Vérifiez que les bouches de ventilation ne sont pas bouchées (voir la fiche VMC).",
        ],
      },
    ],
    checks: ["Les moisissures ne reviennent pas sous 3 semaines."],
    norms: [],
    whenToCallPro: [
      "La tache revient vite ou s'étend.",
      "Le mur est humide au toucher, le papier ou la peinture se décolle.",
      "Des moisissures dans une chambre d'enfant ou chez une personne fragile.",
    ],
  },
  {
    id: "client-reboucher-trou-fissure",
    domain: "murs-sols",
    level: "bricolage",
    proTrade: PEINTRE,
    keywords: ["reboucher trou", "fissure mur", "trou de cheville", "enduit", "mur abîmé", "placo troué"],
    title: "Reboucher un petit trou ou une fissure fine",
    summary: "Trous de chevilles et microfissures intérieures : réparation invisible avant peinture.",
    duration: "30 minutes, plus le séchage",
    tools: ["Couteau à enduire", "Papier de verre fin", "Éponge"],
    materials: ["Enduit de rebouchage prêt à l'emploi", "Peinture de retouche"],
    safety: ["Logement d'avant 1949 : ne poncez pas les vieilles peintures (plomb possible).", "Logement d'avant 1997 : ne percez ni ne poncez un matériau suspect (amiante)."],
    steps: [
      {
        title: "Préparer",
        details: ["Dépoussiérez le trou, ouvrez légèrement la fissure en V avec le couteau."],
      },
      {
        title: "Reboucher",
        details: ["Appliquez l'enduit en appuyant, lissez à fleur, laissez sécher.", "Une deuxième passe fine si l'enduit s'est creusé."],
      },
      {
        title: "Poncer et peindre",
        details: ["Poncez légèrement, dépoussiérez, peignez."],
      },
    ],
    checks: ["La réparation ne se voit plus une fois peinte."],
    norms: [],
    whenToCallPro: ["La fissure dépasse 2 mm, traverse le mur ou s'agrandit.", "Elle part en escalier ou en diagonale depuis une porte ou une fenêtre (voir la fiche fissures)."],
  },
  {
    id: "client-fissure-quand-inquieter",
    domain: "murs-sols",
    level: "facile",
    proTrade: MACON,
    keywords: ["fissure", "lézarde", "fissure façade", "fissure en escalier", "mur qui bouge", "sécheresse"],
    title: "Fissure sur un mur : quand faut-il s'inquiéter ?",
    summary: "Reconnaître une fissure sans gravité d'une fissure qui demande un expert.",
    duration: "15 minutes, puis suivi sur quelques semaines",
    tools: ["Règle graduée", "Appareil photo", "Crayon"],
    materials: ["Témoin de fissure (ou bande de plâtre)"],
    safety: ["Porte ou fenêtre qui se met à coincer, sol qui bouge, bruit de craquement : éloignez-vous de la zone et faites venir un professionnel rapidement."],
    steps: [
      {
        title: "Mesurer",
        details: [
          "Moins de 0,2 mm (cheveu) : microfissure, le plus souvent sans gravité.",
          "Plus de 2 mm, traversante ou en escalier : à faire examiner.",
        ],
      },
      {
        title: "Suivre",
        details: [
          "Tracez au crayon les extrémités avec la date, photographiez avec une règle.",
          "Posez un témoin de fissure et regardez s'il bouge après quelques semaines.",
        ],
      },
      {
        title: "Penser à l'assurance",
        details: ["Après une sécheresse reconnue catastrophe naturelle dans votre commune, déclarez les fissures à votre assurance."],
      },
    ],
    checks: ["Vous savez si la fissure évolue ou non."],
    norms: [],
    whenToCallPro: [
      "La fissure s'élargit ou s'allonge.",
      "Elle dépasse 2 mm, traverse le mur ou forme un escalier.",
      "Portes et fenêtres coincent depuis son apparition.",
    ],
  },
  {
    id: "client-refaire-joint-silicone",
    domain: "murs-sols",
    level: "bricolage",
    proTrade: CARRELEUR,
    keywords: ["joint silicone", "joint noirci", "baignoire", "douche", "joint qui se décolle", "joint sanitaire"],
    title: "Refaire un joint silicone autour d'une baignoire ou d'une douche",
    summary: "Un joint noirci ou décollé laisse passer l'eau : le remplacer avant les dégâts.",
    duration: "1 heure, plus 24 heures de séchage",
    tools: ["Cutter ou grattoir", "Pistolet à silicone", "Ruban de masquage"],
    materials: ["Silicone sanitaire anti-moisissures", "Alcool ménager"],
    safety: ["Lame de cutter : coupez vers l'extérieur, protégez l'émail de la baignoire."],
    steps: [
      {
        title: "Retirer l'ancien joint",
        details: ["Coupez et arrachez l'ancien silicone, grattez les restes.", "Nettoyez à l'alcool et laissez sécher complètement."],
        warning: "Un nouveau joint posé sur des restes d'ancien ou sur une surface humide ne tient pas.",
      },
      {
        title: "Masquer",
        details: ["Posez deux bandes de ruban de chaque côté du joint, à 3 mm."],
      },
      {
        title: "Poser le silicone",
        details: [
          "Remplissez la baignoire d'eau avant de poser le joint (elle s'affaisse sous le poids : le joint ne se fendra pas ensuite).",
          "Tirez un cordon régulier, lissez au doigt mouillé d'eau savonneuse, retirez le ruban tout de suite.",
        ],
      },
    ],
    checks: ["Le joint est continu, sans trou.", "Pas d'eau pendant 24 heures."],
    norms: [],
    whenToCallPro: ["Des carreaux bougent ou sonnent creux autour de la douche.", "Le mur derrière est humide ou le plafond du dessous est taché."],
  },
  {
    id: "client-joints-carrelage",
    domain: "murs-sols",
    level: "bricolage",
    proTrade: CARRELEUR,
    keywords: ["joints de carrelage", "joint qui s'effrite", "carreau fêlé", "carrelage qui sonne creux", "carreau décollé"],
    title: "Joints de carrelage abîmés ou carreau qui sonne creux",
    summary: "Refaire des joints usés et savoir quand un carreau doit être reposé par un pro.",
    duration: "1 à 2 heures",
    tools: ["Grattoir à joints", "Raclette en caoutchouc", "Éponge"],
    materials: ["Mortier de joint de la même teinte"],
    safety: ["Grattage : lunettes et masque contre la poussière."],
    steps: [
      {
        title: "Gratter",
        details: ["Grattez l'ancien joint sur 2 à 3 mm de profondeur, dépoussiérez."],
      },
      {
        title: "Remplir",
        details: ["Étalez le mortier en diagonale avec la raclette, en pressant dans les joints."],
      },
      {
        title: "Nettoyer",
        details: ["Après 15 à 20 minutes, nettoyez à l'éponge à peine humide, puis lustrez au chiffon sec."],
      },
    ],
    checks: ["Joints pleins et réguliers."],
    norms: [],
    whenToCallPro: ["Plusieurs carreaux sonnent creux ou bougent.", "Un carreau est fendu dans une douche ou sur un sol chauffant."],
  },
  {
    id: "client-vmc-nettoyer",
    domain: "murs-sols",
    level: "facile",
    proTrade: VMC,
    keywords: ["VMC", "ventilation", "bouche d'aération", "buée", "condensation", "humidité", "salle de bain"],
    title: "Entretenir sa VMC (bouches et entrées d'air)",
    summary: "Une ventilation encrassée laisse l'humidité s'installer : l'entretien à faire deux fois par an.",
    duration: "30 minutes",
    tools: ["Escabeau", "Brosse douce"],
    materials: ["Eau savonneuse"],
    safety: ["Ne coupez jamais la VMC durablement : elle évacue l'humidité et les polluants."],
    steps: [
      {
        title: "Les bouches d'extraction",
        details: [
          "Dans la cuisine, la salle de bain et les WC, déclipsez les bouches.",
          "Lavez-les à l'eau savonneuse, séchez, remettez-les en place sans les dérégler.",
        ],
      },
      {
        title: "Les entrées d'air",
        details: ["Au-dessus des fenêtres des pièces de vie, dépoussiérez les grilles : ne les bouchez jamais."],
      },
      {
        title: "Tester",
        details: ["Approchez une feuille de papier d'une bouche : elle doit être aspirée."],
      },
    ],
    checks: ["La feuille est aspirée par chaque bouche."],
    norms: [],
    whenToCallPro: ["La VMC est bruyante ou ne tourne plus.", "La buée et les moisissures persistent malgré l'entretien."],
  },
  {
    id: "client-porte-frotte",
    domain: "ouvertures",
    level: "bricolage",
    proTrade: MENUISIER,
    keywords: ["porte qui frotte", "porte qui ferme mal", "porte qui grince", "paumelles", "gonds", "porte qui coince"],
    title: "Une porte qui frotte, grince ou ferme mal",
    summary: "Les réglages simples : vis, graissage, gonds.",
    duration: "30 minutes",
    tools: ["Tournevis", "Clé Allen selon les charnières"],
    materials: ["Graisse ou lubrifiant sec", "Vis plus longues si les anciennes tournent dans le vide"],
    safety: ["Une porte est lourde : faites-vous aider pour la dégonder."],
    steps: [
      {
        title: "Resserrer",
        details: ["Resserrez toutes les vis des charnières côté cadre et côté porte."],
        warning: "Une vis qui tourne dans le vide : remplacez-la par une vis plus longue qui ira dans le bois du mur.",
      },
      {
        title: "Graisser",
        details: ["Une porte qui grince : soulevez-la légèrement de ses gonds et graissez les axes."],
      },
      {
        title: "Repérer le frottement",
        details: ["Passez une feuille de papier autour de la porte fermée pour trouver où elle coince."],
      },
    ],
    checks: ["La porte ferme sans forcer et sans bruit."],
    norms: [],
    whenToCallPro: ["Le frottement est apparu avec une fissure au-dessus de la porte (voir la fiche fissures).", "La porte doit être rabotée ou le cadre est déformé."],
  },
  {
    id: "client-fenetre-air",
    domain: "ouvertures",
    level: "facile",
    proTrade: { categoryId: "menuiseries-exterieures", tradeId: "menuisier-pvc-alu" },
    keywords: ["fenêtre qui laisse passer l'air", "courant d'air", "joint de fenêtre", "fenêtre mal fermée", "infiltration fenêtre"],
    title: "Une fenêtre laisse passer l'air ou l'eau",
    summary: "Joints, réglage de fermeture et évacuations : les vérifications simples.",
    duration: "30 minutes",
    tools: ["Clé Allen (fenêtres PVC et alu)", "Petit pinceau"],
    materials: ["Joint de remplacement adapté (prenez un morceau en modèle)"],
    safety: [],
    steps: [
      {
        title: "Vérifier les joints",
        details: ["Les joints sont-ils écrasés, fendus ou décollés ? Ils se remplacent en tirant puis en enfonçant le neuf dans la rainure."],
      },
      {
        title: "Dégager les trous d'évacuation",
        details: ["En bas du cadre, de petites fentes évacuent l'eau : débouchez-les au pinceau."],
      },
      {
        title: "Régler la fermeture",
        details: ["Sur PVC et alu, les galets de fermeture se règlent souvent à la clé Allen pour serrer davantage."],
      },
    ],
    checks: ["Plus de courant d'air fenêtre fermée.", "L'eau s'évacue à l'extérieur."],
    norms: [],
    whenToCallPro: ["De l'eau entre à chaque pluie.", "Le vitrage est embué entre les deux vitres (double vitrage hors d'usage)."],
  },
  {
    id: "client-volet-roulant-bloque",
    domain: "ouvertures",
    level: "facile",
    proTrade: VOLETS,
    keywords: ["volet roulant bloqué", "volet électrique en panne", "volet qui ne descend plus", "sangle cassée"],
    title: "Un volet roulant bloqué",
    summary: "Les vérifications à faire sans risquer d'abîmer le volet.",
    duration: "15 minutes",
    tools: [],
    materials: ["Piles neuves pour la télécommande"],
    safety: ["Ne forcez jamais un volet électrique à la main : le moteur casse.", "N'ouvrez pas le coffre d'un volet électrique : présence de 230 V."],
    steps: [
      {
        title: "Volet électrique",
        details: [
          "Changez les piles de la télécommande ou essayez l'interrupteur mural.",
          "Vérifiez le disjoncteur des volets au tableau.",
          "Après un fonctionnement prolongé, le moteur peut chauffer : attendez 20 minutes.",
        ],
      },
      {
        title: "Par grand froid",
        details: ["Les lames peuvent geler dans les coulisses : n'insistez pas, attendez le dégel."],
      },
      {
        title: "Volet à sangle ou manivelle",
        details: ["Un blocage avec une sangle effilochée ou une manivelle qui tourne dans le vide : la pièce est à remplacer."],
      },
    ],
    checks: ["Le volet monte et descend normalement."],
    norms: [],
    whenToCallPro: ["Le moteur ne répond plus ou grogne sans bouger.", "Une lame est sortie de sa coulisse.", "La sangle est cassée."],
  },
  {
    id: "client-porte-claquee",
    domain: "ouvertures",
    level: "urgence",
    proTrade: SERRURIER,
    keywords: ["porte claquée", "clés à l'intérieur", "enfermé dehors", "serrure bloquée", "clé perdue", "serrurier"],
    title: "Porte claquée ou clé perdue : éviter les arnaques",
    summary: "Les bons réflexes avant d'appeler un serrurier.",
    duration: "Immédiat",
    tools: [],
    materials: [],
    safety: ["Méfiez-vous des numéros trouvés sur des prospectus ou des premiers résultats de recherche : les arnaques au dépannage sont fréquentes."],
    steps: [
      {
        title: "Chercher un double",
        details: ["Un voisin, un proche, le gardien ou l'agence ont-ils un double ?"],
      },
      {
        title: "Porte simplement claquée",
        details: ["Une porte claquée (pas fermée à clé) s'ouvre souvent sans casse par un professionnel : précisez-le au téléphone."],
      },
      {
        title: "Demander un devis avant",
        details: [
          "Demandez le prix total (déplacement compris) avant l'intervention.",
          "Votre assurance habitation ou votre carte bancaire peut inclure une assistance serrurerie.",
        ],
      },
    ],
    checks: ["Vous avez un prix ferme avant que le serrurier commence."],
    norms: [],
    whenToCallPro: ["Aucun double accessible : faites appel à un serrurier de confiance."],
  },
  {
    id: "client-apres-tempete-toiture",
    domain: "exterieur",
    level: "urgence",
    proTrade: COUVREUR,
    keywords: ["tempête", "tuile cassée", "tuile envolée", "fuite toiture", "toit qui fuit", "infiltration plafond", "grêle"],
    title: "Après une tempête : tuiles déplacées ou toit qui fuit",
    summary: "Limiter les dégâts depuis l'intérieur et préparer l'assurance, sans monter sur le toit.",
    duration: "30 minutes",
    tools: ["Seaux, bâche plastique", "Lampe torche", "Téléphone pour les photos"],
    materials: [],
    safety: [HAUTEUR, "Ne montez jamais sur le toit après une tempête : tuiles fragilisées, couverture glissante."],
    steps: [
      {
        title: "Depuis l'intérieur",
        details: [
          "Placez des seaux sous les gouttes, protégez meubles et sol avec une bâche.",
          "Si l'eau coule près d'un luminaire ou d'une prise : coupez le circuit au tableau.",
        ],
      },
      {
        title: "Observer depuis le sol",
        details: ["Repérez les tuiles déplacées et photographiez-les depuis le jardin ou la rue."],
      },
      {
        title: "Déclarer",
        details: [
          "Déclarez le sinistre à votre assurance avec les photos (délai souvent de 5 jours ouvrés).",
          "Gardez les factures des protections d'urgence.",
        ],
      },
    ],
    checks: ["L'eau ne se répand plus dans la maison.", "Les photos sont prises."],
    norms: [],
    whenToCallPro: ["Toujours : la toiture doit être vérifiée et réparée par un couvreur."],
  },
  {
    id: "client-gouttiere-bouchee",
    domain: "exterieur",
    level: "bricolage",
    proTrade: { categoryId: "couverture", tradeId: "poseur-gouttieres" },
    keywords: ["gouttière bouchée", "gouttière qui déborde", "descente d'eau", "feuilles", "eau qui coule le long du mur"],
    title: "Une gouttière qui déborde",
    summary: "Nettoyer une gouttière de plain-pied et savoir quand déléguer.",
    duration: "1 heure",
    tools: ["Échelle stable avec stabilisateur, tenue par une deuxième personne", "Gants", "Seau avec crochet"],
    materials: ["Grille pare-feuilles (en option)"],
    safety: [HAUTEUR, "Au-delà du rez-de-chaussée, confiez le nettoyage à un professionnel."],
    steps: [
      {
        title: "Retirer les débris",
        details: ["Retirez feuilles et mousses à la main, en déplaçant l'échelle plutôt qu'en vous penchant."],
      },
      {
        title: "Rincer",
        details: ["Rincez au tuyau d'arrosage vers la descente et vérifiez que l'eau s'écoule en bas."],
      },
      {
        title: "Protéger",
        details: ["Posez une grille pare-feuilles en haut de la descente pour éviter qu'elle se rebouche."],
      },
    ],
    checks: ["L'eau s'écoule librement jusqu'en bas."],
    norms: [],
    whenToCallPro: ["La gouttière est à l'étage.", "Elle est percée, déformée ou se décroche.", "La descente est bouchée en profondeur."],
  },
];
