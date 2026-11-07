import type { LibraryTechnicalSheet } from "@/lib/technical-sheets/types";

const DTU_60_1 = { ref: "NF DTU 60.1", label: "Plomberie sanitaire pour bâtiments" };
const DTU_60_11 = { ref: "NF DTU 60.11", label: "Calcul des réseaux d'alimentation et d'évacuation" };
const DTU_60_33 = { ref: "NF DTU 60.33", label: "Canalisations PVC d'évacuation" };

const COUPURE_EAU = "Couper l'eau au compteur ou à la vanne d'arrêt, vidanger le réseau concerné et vérifier qu'il n'est plus en pression.";
const PLOMBIERS = ["plombier", "plombier-chauffagiste", "installateur-sanitaire"];

export const PLOMBERIE_SHEETS: LibraryTechnicalSheet[] = [
  {
    id: "plomb-remplacer-chauffe-eau",
    tradeCategoryId: "plomberie-chauffage",
    tradeIds: PLOMBIERS,
    keywords: ["chauffe-eau", "cumulus", "ballon", "groupe de sécurité", "eau chaude"],
    title: "Remplacer un chauffe-eau électrique",
    summary: "Dépose d'un ancien chauffe-eau et pose d'un neuf, avec groupe de sécurité et raccordements.",
    duration: "3 à 4 heures",
    tools: ["Clés à molette et clé à griffe", "Perceuse, niveau", "Tuyau de vidange", "Diable ou sangles de portage", "VAT"],
    materials: [
      "Chauffe-eau et pattes ou trépied de fixation",
      "Groupe de sécurité neuf (7 bar) et siphon d'évacuation",
      "Raccords diélectriques",
      "Réducteur de pression si la pression du réseau dépasse 3 bar",
      "Flexibles ou tubes, joints et filasse ou pâte",
    ],
    safety: [
      "Couper le circuit électrique du chauffe-eau au tableau et vérifier l'absence de tension.",
      COUPURE_EAU,
      "Un chauffe-eau plein pèse plus de 200 kg : vidanger entièrement avant de déposer, porter à deux.",
    ],
    steps: [
      {
        title: "Déposer l'ancien appareil",
        details: [
          "Couper l'électricité et l'eau, ouvrir un robinet d'eau chaude, puis vidanger par le groupe de sécurité.",
          "Débrancher l'électricité, déconnecter l'eau froide et l'eau chaude, déposer.",
        ],
      },
      {
        title: "Fixer le nouveau chauffe-eau",
        details: [
          "Vérifier que le support supporte le poids de l'appareil plein (mur porteur ou trépied).",
          "Fixer de niveau en respectant la position (vertical mural, horizontal, sur socle) prévue par le fabricant.",
        ],
        warning: "Une cloison en plaques de plâtre ne supporte pas un chauffe-eau mural sans renfort ou trépied.",
      },
      {
        title: "Raccorder l'eau",
        details: [
          "Poser le groupe de sécurité neuf sur l'arrivée d'eau froide (repère bleu), au plus près de l'appareil, sans vanne entre les deux.",
          "Poser des raccords diélectriques sur les piquages pour éviter la corrosion.",
          "Raccorder la sortie eau chaude (repère rouge).",
          "Raccorder le siphon du groupe de sécurité à l'évacuation : il doit pouvoir s'écouler.",
        ],
      },
      {
        title: "Remplir avant de brancher",
        details: [
          "Ouvrir un robinet d'eau chaude, ouvrir l'eau froide et laisser remplir jusqu'à écoulement sans air.",
          "Contrôler l'étanchéité de tous les raccords.",
        ],
        warning: "Mettre sous tension un chauffe-eau vide détruit la résistance en quelques secondes.",
      },
      {
        title: "Raccorder l'électricité",
        details: [
          "Raccorder sur le circuit dédié (2,5 mm², 20 A, contacteur heures creuses) par sortie de câble.",
          "Régler le thermostat (55 à 60 °C recommandés pour limiter la légionelle).",
        ],
      },
    ],
    checks: [
      "Aucune fuite après montée en température.",
      "Manœuvre du groupe de sécurité : l'eau s'évacue par le siphon.",
      "Chauffe effective après passage en heures creuses ou en marche forcée.",
    ],
    norms: [DTU_60_1, { ref: "NF C 15-100", label: "Raccordement électrique de l'appareil" }],
  },
  {
    id: "plomb-wc-suspendu",
    tradeCategoryId: "plomberie-chauffage",
    tradeIds: PLOMBIERS,
    keywords: ["WC suspendu", "bâti-support", "toilettes", "cuvette", "réservoir encastré"],
    title: "Poser un WC suspendu avec bâti-support",
    summary: "Installation d'un bâti-support autoportant ou mural, habillage et pose de la cuvette suspendue.",
    duration: "1 jour (habillage compris)",
    tools: ["Perceuse, niveau, mètre", "Scie à métaux ou coupe-tube PVC", "Clés", "Matériel de plaquiste pour l'habillage"],
    materials: [
      "Bâti-support et sa plaque de commande",
      "Cuvette suspendue et pack de fixation",
      "Pipe d'évacuation diamètre 100 et manchettes",
      "Plaques de plâtre hydrofuges (H1) et ossature pour l'habillage",
    ],
    safety: [COUPURE_EAU],
    steps: [
      {
        title: "Préparer",
        details: [
          "Vérifier que le mur ou le sol peut reprendre la charge (bâti mural ou autoportant).",
          "Amener l'arrivée d'eau à la position du robinet du réservoir et l'évacuation en diamètre 100.",
        ],
      },
      {
        title: "Poser le bâti",
        details: [
          "Régler la hauteur de la cuvette (environ 40 à 42 cm, plus haut pour une personne à mobilité réduite).",
          "Mettre le bâti parfaitement d'aplomb et de niveau, puis le fixer au sol et au mur.",
          "Raccorder l'eau sur le robinet du réservoir et l'évacuation sur la pipe.",
        ],
        warning: "Un bâti hors d'aplomb se voit à la pose de la cuvette et impose de tout reprendre.",
      },
      {
        title: "Tester avant d'habiller",
        details: [
          "Mettre en eau, vérifier l'étanchéité du réservoir et du robinet.",
          "Faire un essai d'écoulement en provisoire.",
        ],
      },
      {
        title: "Habiller et finir",
        details: [
          "Fermer avec des plaques hydrofuges sur ossature, en découpant les passages des tiges et de la pipe.",
          "Poser la faïence le cas échéant, puis la cuvette sur ses tiges avec le joint fourni.",
          "Monter le mécanisme et la plaque de commande.",
        ],
      },
    ],
    checks: [
      "Cuvette de niveau, sans jeu.",
      "Aucune fuite à la chasse et au remplissage.",
      "Trappe d'accès au mécanisme fonctionnelle (via la plaque de commande).",
    ],
    norms: [DTU_60_1, DTU_60_33],
  },
  {
    id: "plomb-reseau-per-multicouche",
    tradeCategoryId: "plomberie-chauffage",
    tradeIds: PLOMBIERS,
    keywords: ["PER", "multicouche", "nourrice", "collecteur", "alimentation", "sertissage", "réseau eau"],
    title: "Créer un réseau d'alimentation en PER ou multicouche",
    summary: "Distribution eau froide et eau chaude depuis des nourrices, en PER ou multicouche serti.",
    duration: "1 à 2 jours pour un logement",
    tools: ["Pince à sertir et inserts adaptés", "Coupe-tube, ébavureur, calibreur", "Pompe d'épreuve", "Perceuse"],
    materials: [
      "Tube PER ou multicouche (diamètres selon le débit : 16, 20, 26)",
      "Nourrices eau froide et eau chaude avec vannes",
      "Raccords à sertir ou à glissement, gaines annelées",
      "Colliers, coudes de sortie de mur",
    ],
    safety: [COUPURE_EAU],
    steps: [
      {
        title: "Dimensionner",
        details: [
          "Calculer les diamètres selon le nombre d'appareils et la longueur des tronçons.",
          "Prévoir une nourrice par réseau (eau froide, eau chaude) et un départ par appareil.",
        ],
      },
      {
        title: "Poser les nourrices",
        details: [
          "Fixer les nourrices dans un endroit accessible, avec une vanne d'isolement par départ.",
          "Repérer chaque départ (cuisine, lavabo, douche…).",
        ],
      },
      {
        title: "Tirer les tubes",
        details: [
          "Tirer les tubes sous gaine sans raccord intermédiaire entre la nourrice et l'appareil (raccord accessible uniquement).",
          "Respecter les rayons de cintrage et fixer les tubes tous les 50 cm environ.",
          "Séparer et isoler l'eau chaude de l'eau froide.",
        ],
        warning: "Un raccord noyé dans une chape ou un mur est interdit : il doit rester accessible.",
      },
      {
        title: "Sertir",
        details: [
          "Couper droit, ébavurer et calibrer le tube.",
          "Enfoncer jusqu'en butée (contrôler par la fenêtre du raccord) et sertir avec l'insert du bon diamètre.",
        ],
      },
      {
        title: "Mettre en épreuve",
        details: [
          "Avant de refermer, faire l'essai d'étanchéité à la pompe d'épreuve à la pression et pendant la durée prescrites par le NF DTU 60.1.",
          "Contrôler chaque raccord.",
        ],
      },
    ],
    checks: [
      "Essai sous pression réussi et noté.",
      "Débit correct à chaque point de puisage.",
      "Repérage des nourrices remis au client.",
    ],
    norms: [DTU_60_1, DTU_60_11],
  },
  {
    id: "plomb-evacuation-pvc",
    tradeCategoryId: "plomberie-chauffage",
    tradeIds: PLOMBIERS,
    keywords: ["évacuation", "PVC", "pente", "siphon", "eaux usées", "eaux vannes", "collage PVC"],
    title: "Raccorder les évacuations en PVC",
    summary: "Évacuations des appareils sanitaires en PVC collé, avec les bons diamètres et la bonne pente.",
    duration: "Une demi-journée à un jour",
    tools: ["Scie à métaux ou coupe-tube PVC", "Lime ou ébavureur", "Niveau, mètre", "Perceuse"],
    materials: [
      "Tubes et raccords PVC (32, 40, 50, 100 selon les appareils)",
      "Colle PVC et décapant",
      "Colliers de fixation",
      "Clapet aérateur si la ventilation primaire est éloignée",
    ],
    safety: ["Colle et décapant : travailler ventilé, sans flamme."],
    steps: [
      {
        title: "Choisir les diamètres",
        details: [
          "Lavabo, bidet : 32 ou 40. Douche, baignoire, évier, lave-linge : 40. WC : 100.",
          "Augmenter le diamètre quand plusieurs appareils se raccordent sur la même chute.",
        ],
      },
      {
        title: "Tracer la pente",
        details: [
          "Pente de 1 à 3 cm par mètre vers la chute.",
          "Une pente trop forte vide les siphons, une pente trop faible encrasse le réseau.",
        ],
        warning: "Ne jamais faire de contre-pente : l'eau stagne et les odeurs remontent.",
      },
      {
        title: "Assembler",
        details: [
          "Couper d'équerre, ébavurer, décaper, encoller les deux parties, emboîter d'un geste et maintenir quelques secondes.",
          "Préférer deux coudes à 45° à un coude à 90° pour faciliter l'écoulement.",
          "Fixer les tubes tous les 50 à 70 cm en horizontal.",
        ],
      },
      {
        title: "Ventiler",
        details: [
          "Raccorder la chute à la ventilation primaire.",
          "Si l'appareil est trop éloigné, poser un clapet aérateur accessible.",
        ],
      },
    ],
    checks: ["Écoulement rapide de chaque appareil.", "Aucune fuite aux collages.", "Aucune odeur, siphons en eau."],
    norms: [DTU_60_33, DTU_60_11],
  },
  {
    id: "plomb-receveur-extra-plat",
    tradeCategoryId: "plomberie-chauffage",
    tradeIds: PLOMBIERS,
    keywords: ["receveur", "douche", "extra-plat", "bonde", "paroi de douche"],
    title: "Poser un receveur de douche extra-plat",
    summary: "Pose d'un receveur extra-plat sur pieds ou sur mortier, avec bonde et étanchéité périphérique.",
    duration: "Une demi-journée",
    tools: ["Niveau, règle", "Scie cloche", "Pistolet à mastic", "Auge et truelle"],
    materials: [
      "Receveur et bonde adaptée (débit et hauteur)",
      "Kit de pieds réglables ou mortier",
      "Bande d'étanchéité d'angle et mastic silicone sanitaire",
    ],
    safety: [COUPURE_EAU],
    steps: [
      {
        title: "Préparer l'évacuation",
        details: [
          "Vérifier que la hauteur disponible permet une pente suffisante jusqu'à la chute.",
          "Positionner la sortie d'évacuation exactement à l'aplomb de la bonde.",
        ],
        warning: "Avec un receveur très bas, la pente de l'évacuation est souvent le point bloquant : le vérifier avant de commander.",
      },
      {
        title: "Mettre de niveau",
        details: [
          "Poser le receveur sur pieds réglables ou sur un lit de mortier.",
          "Le receveur doit être de niveau : la pente vers la bonde est intégrée.",
        ],
      },
      {
        title: "Raccorder la bonde",
        details: ["Monter la bonde selon la notice, raccorder à l'évacuation, tester à l'eau avant de bloquer."],
      },
      {
        title: "Étancher",
        details: [
          "Traiter la jonction receveur-mur avec une bande d'étanchéité sous la faïence ou le panneau.",
          "Finir par un joint silicone sanitaire continu.",
        ],
      },
    ],
    checks: ["Receveur stable, sans grincement.", "Écoulement complet, sans eau stagnante.", "Joint silicone continu."],
    norms: [DTU_60_1, { ref: "NF DTU 52.2", label: "Revêtements collés (faïence autour du receveur)" }],
  },
  {
    id: "plomb-remplacer-mitigeur",
    tradeCategoryId: "plomberie-chauffage",
    tradeIds: PLOMBIERS,
    keywords: ["mitigeur", "robinet", "robinetterie", "flexible", "lavabo", "évier"],
    title: "Remplacer un mitigeur (lavabo, évier)",
    summary: "Dépose de l'ancienne robinetterie et pose d'un mitigeur neuf sur vasque ou évier.",
    duration: "1 heure",
    tools: ["Clé de lavabo (clé à béquille)", "Clés plates", "Lampe frontale"],
    materials: ["Mitigeur et ses flexibles", "Robinets d'arrêt si absents ou grippés", "Joints"],
    safety: [COUPURE_EAU],
    steps: [
      {
        title: "Déposer",
        details: [
          "Fermer les robinets d'arrêt sous l'évier (ou l'arrivée générale), ouvrir le mitigeur pour purger.",
          "Dévisser les flexibles puis l'écrou de fixation sous la vasque.",
        ],
      },
      {
        title: "Poser le neuf",
        details: [
          "Visser les flexibles à la main dans le corps du mitigeur avant de le mettre en place.",
          "Placer le joint, glisser le mitigeur, bloquer avec la tige et l'écrou de fixation.",
          "Raccorder eau chaude à gauche, eau froide à droite.",
        ],
        warning: "Ne pas vriller les flexibles : ils se percent prématurément.",
      },
      {
        title: "Mettre en eau",
        details: ["Ouvrir doucement les arrêts, purger, contrôler l'étanchéité.", "Nettoyer le mousseur après la purge."],
      },
    ],
    checks: ["Aucune fuite sous l'évier.", "Eau chaude à gauche.", "Débit normal."],
    norms: [DTU_60_1],
  },
  {
    id: "plomb-recherche-fuite",
    tradeCategoryId: "plomberie-chauffage",
    tradeIds: PLOMBIERS,
    keywords: ["fuite", "recherche de fuite", "compteur", "dégât des eaux", "humidité", "réparation"],
    title: "Rechercher et réparer une fuite",
    summary: "Méthode pour localiser une fuite sur un réseau d'eau et la réparer durablement.",
    duration: "1 à 4 heures selon l'accès",
    tools: ["Lampe, miroir", "Humidimètre", "Caméra thermique ou détecteur acoustique si disponible", "Pompe d'épreuve"],
    materials: ["Raccords de réparation adaptés au matériau", "Collier de réparation pour une intervention provisoire"],
    safety: [
      COUPURE_EAU,
      "En cas d'eau près d'une installation électrique, couper le courant de la zone avant d'intervenir.",
    ],
    steps: [
      {
        title: "Confirmer la fuite",
        details: [
          "Fermer tous les points de puisage et relever le compteur : s'il tourne, la fuite est sur le réseau après compteur.",
          "Fermer les nourrices ou vannes une à une pour isoler le tronçon fuyard.",
        ],
      },
      {
        title: "Localiser",
        details: [
          "Inspecter les raccords visibles, les flexibles, les mécanismes de WC et le groupe de sécurité.",
          "Mesurer l'humidité des murs et sols ; utiliser caméra thermique ou détection acoustique pour les réseaux encastrés.",
        ],
      },
      {
        title: "Réparer",
        details: [
          "Ouvrir au plus juste, couper le tronçon abîmé et remplacer par un raccord adapté au matériau.",
          "Un collier de réparation reste une solution provisoire.",
        ],
        warning: "Si la fuite a causé des dégâts, photographier avant et après pour l'assurance du client (constat amiable dégât des eaux).",
      },
      {
        title: "Tester",
        details: ["Remettre en pression, contrôler la réparation, relever à nouveau le compteur."],
      },
    ],
    checks: ["Compteur immobile, tous points fermés.", "Réparation sèche après 24 h.", "Photos remises au client."],
    norms: [DTU_60_1],
  },
  {
    id: "plomb-desembouage",
    tradeCategoryId: "plomberie-chauffage",
    tradeIds: ["plombier-chauffagiste", "chauffagiste"],
    keywords: ["désembouage", "boues", "radiateurs", "chauffage central", "circuit de chauffage", "inhibiteur"],
    title: "Désembouer un circuit de chauffage",
    summary: "Nettoyage d'un circuit de chauffage central encrassé, puis protection par inhibiteur.",
    duration: "Une demi-journée à un jour",
    tools: ["Pompe de désembouage", "Clés, purgeurs", "Tuyaux de raccordement", "Testeur de pH ou de concentration"],
    materials: ["Produit de désembouage compatible avec les matériaux du circuit", "Inhibiteur de corrosion", "Filtre à boues magnétique (recommandé)"],
    safety: [
      "Couper la chaudière ou la pompe à chaleur et laisser refroidir le circuit.",
      "Porter gants et lunettes pour manipuler les produits.",
    ],
    steps: [
      {
        title: "Diagnostiquer",
        details: ["Signes : radiateurs froids en bas, bruits, eau noire à la purge.", "Vérifier la compatibilité du produit avec le générateur et les radiateurs."],
      },
      {
        title: "Injecter le produit",
        details: [
          "Injecter le désembouant dans le circuit et faire circuler le temps indiqué par le fabricant, chauffage en marche si prescrit.",
        ],
      },
      {
        title: "Rincer",
        details: [
          "Raccorder la pompe de désembouage et rincer radiateur par radiateur ou par boucle, jusqu'à eau claire.",
          "Purger chaque radiateur.",
        ],
        warning: "Un rinçage incomplet laisse le produit dans le circuit et peut abîmer les joints.",
      },
      {
        title: "Protéger",
        details: [
          "Remplir, ajuster la pression, injecter l'inhibiteur à la dose prescrite.",
          "Poser un filtre à boues sur le retour si absent.",
        ],
      },
    ],
    checks: ["Tous les radiateurs chauffent uniformément.", "Pression du circuit à la valeur prévue.", "Étiquette d'inhibiteur et date posées près du générateur."],
    norms: [{ ref: "Notice du fabricant", label: "Qualité d'eau exigée pour la garantie du générateur" }],
  },
  {
    id: "plomb-adoucisseur",
    tradeCategoryId: "plomberie-chauffage",
    tradeIds: ["plombier", "plombier-chauffagiste", "traitement-eau"],
    keywords: ["adoucisseur", "calcaire", "dureté", "TH", "traitement de l'eau", "by-pass"],
    title: "Installer un adoucisseur d'eau",
    summary: "Pose d'un adoucisseur après compteur, avec by-pass, disconnecteur et réglage de la dureté.",
    duration: "3 heures",
    tools: ["Coupe-tube, clés", "Kit de mesure de la dureté (TH)", "Perceuse"],
    materials: [
      "Adoucisseur et sel régénérant",
      "Kit by-pass trois vannes",
      "Filtre à sédiments en amont",
      "Clapet anti-retour ou disconnecteur selon la réglementation",
      "Évacuation pour les eaux de régénération",
    ],
    safety: [COUPURE_EAU],
    steps: [
      {
        title: "Mesurer et implanter",
        details: [
          "Mesurer la dureté de l'eau (TH) pour régler l'appareil.",
          "Installer après le compteur et le réducteur de pression, avant la production d'eau chaude.",
          "Laisser un robinet d'eau non adoucie pour la boisson si le client le souhaite.",
        ],
      },
      {
        title: "Raccorder",
        details: [
          "Poser le filtre à sédiments, le kit by-pass, puis l'adoucisseur.",
          "Raccorder l'évacuation de régénération avec une rupture de charge (garde d'air).",
          "Brancher l'alimentation électrique de la vanne.",
        ],
        warning: "Sans rupture de charge sur l'évacuation, les eaux usées peuvent remonter dans l'appareil.",
      },
      {
        title: "Régler",
        details: [
          "Régler la dureté résiduelle (en général entre 8 et 15 °f) : une eau trop adoucie devient agressive pour les canalisations.",
          "Remplir le bac à sel, lancer une première régénération.",
        ],
      },
    ],
    checks: ["Dureté mesurée en sortie conforme au réglage.", "Aucune fuite au by-pass.", "Évacuation de régénération fonctionnelle."],
    norms: [DTU_60_1, { ref: "NF EN 1717", label: "Protection contre la pollution de l'eau potable par retour" }],
  },
  {
    id: "plomb-mecanisme-wc",
    tradeCategoryId: "plomberie-chauffage",
    tradeIds: PLOMBIERS,
    keywords: ["chasse d'eau", "mécanisme WC", "robinet flotteur", "WC qui fuit", "réservoir"],
    title: "Remplacer le mécanisme d'une chasse d'eau",
    summary: "Remplacement du robinet flotteur et du mécanisme de chasse d'un réservoir de WC qui fuit.",
    duration: "1 heure",
    tools: ["Clés plates ou clé à molette", "Éponge", "Seau"],
    materials: ["Robinet flotteur adapté (alimentation latérale ou par le bas)", "Mécanisme de chasse compatible avec le réservoir", "Joints de cloche et de réservoir"],
    safety: [COUPURE_EAU],
    steps: [
      {
        title: "Identifier la fuite",
        details: [
          "Eau qui coule en continu dans la cuvette : joint du mécanisme de chasse usé.",
          "Eau qui s'écoule par le trop-plein : robinet flotteur mal réglé ou défectueux.",
        ],
      },
      {
        title: "Déposer",
        details: ["Fermer le robinet d'arrêt, tirer la chasse, éponger le fond du réservoir.", "Démonter le robinet flotteur puis le mécanisme."],
      },
      {
        title: "Poser le neuf",
        details: [
          "Monter le mécanisme avec un joint neuf, serrer sans excès pour ne pas fendre la céramique.",
          "Monter le robinet flotteur et régler le niveau d'eau sous le trop-plein.",
        ],
        warning: "Sur un pack WC, déposer le réservoir impose de remplacer aussi le joint entre réservoir et cuvette.",
      },
      {
        title: "Tester",
        details: ["Ouvrir l'eau, faire plusieurs chasses, contrôler l'arrêt du remplissage et l'absence de fuite."],
      },
    ],
    checks: ["Plus d'écoulement dans la cuvette au repos.", "Niveau d'eau réglé sous le trop-plein.", "Aucune fuite sous le réservoir."],
    norms: [DTU_60_1],
  },
  {
    id: "plomb-meuble-vasque",
    tradeCategoryId: "plomberie-chauffage",
    tradeIds: PLOMBIERS,
    keywords: ["vasque", "lavabo", "meuble salle de bain", "siphon", "plan vasque"],
    title: "Poser un meuble vasque",
    summary: "Fixation d'un meuble de salle de bain suspendu, raccordement de la vasque et de la robinetterie.",
    duration: "2 à 3 heures",
    tools: ["Perceuse, niveau, mètre", "Clés", "Pistolet à mastic"],
    materials: ["Meuble et plan vasque", "Chevilles adaptées au support", "Siphon, bonde, mitigeur, flexibles", "Silicone sanitaire"],
    safety: [COUPURE_EAU],
    steps: [
      {
        title: "Préparer le support",
        details: [
          "Identifier la nature du mur et choisir des chevilles capables de reprendre le poids du meuble chargé.",
          "Sur plaque de plâtre, fixer dans un renfort ou utiliser des chevilles à expansion adaptées.",
        ],
      },
      {
        title: "Fixer le meuble",
        details: ["Tracer la hauteur (plan à environ 85 à 90 cm du sol), percer, fixer de niveau."],
      },
      {
        title: "Raccorder",
        details: [
          "Monter mitigeur et bonde sur la vasque avant de la poser.",
          "Raccorder les flexibles aux robinets d'arrêt, puis le siphon à l'évacuation.",
        ],
      },
      {
        title: "Finir",
        details: ["Joint silicone entre plan et mur.", "Mettre en eau et contrôler."],
      },
    ],
    checks: ["Meuble de niveau, sans jeu.", "Aucune fuite au siphon et aux flexibles.", "Tiroirs dégagés des canalisations."],
    norms: [DTU_60_1],
  },
];
