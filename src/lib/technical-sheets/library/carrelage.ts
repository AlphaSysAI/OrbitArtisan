import type { LibraryTechnicalSheet } from "@/lib/technical-sheets/types";

const DTU_52_2 = { ref: "NF DTU 52.2", label: "Pose collée des revêtements céramiques" };
const DTU_52_1 = { ref: "NF DTU 52.1", label: "Revêtements de sol scellés" };
const DTU_52_10 = { ref: "NF DTU 52.10", label: "Sous-couches isolantes sous chape ou dalle" };
const CARRELEURS = ["carreleur", "carreleur-mosaiste"];
const SILICE = "Découpe à sec des carreaux : poussières de silice. Découper à l'eau ou avec aspiration, masque FFP2 ou FFP3.";
const GENOUX = "Genouillères pour la pose au sol.";

export const CARRELAGE_SHEETS: LibraryTechnicalSheet[] = [
  {
    id: "carr-preparer-support",
    tradeCategoryId: "second-oeuvre",
    tradeIds: CARRELEURS,
    keywords: ["support", "ragréage", "primaire", "planéité", "chape", "préparation"],
    title: "Préparer un support avant carrelage",
    summary: "Contrôle et préparation du support (chape, dalle, ancien carrelage, plaques) avant la pose collée.",
    duration: "Une demi-journée à un jour, plus le séchage",
    tools: ["Règle de 2 m, niveau", "Humidimètre", "Ponceuse ou meuleuse à disque diamant", "Malaxeur", "Lisseuse ou raclette"],
    materials: ["Primaire d'accrochage adapté au support", "Ragréage autolissant", "Bande de désolidarisation périphérique"],
    safety: [SILICE, "Bâtiment d'avant juillet 1997 : repérage amiante avant de déposer un ancien revêtement ou de poncer une colle noire."],
    steps: [
      {
        title: "Contrôler le support",
        details: [
          "Planéité : mesurer à la règle de 2 m et au réglet de 20 cm, comparer aux tolérances du NF DTU 52.2.",
          "Cohésion : gratter, sonder ; éliminer ce qui s'effrite ou sonne creux.",
          "Humidité et âge : une chape ciment doit avoir séché le temps requis avant pose.",
        ],
        warning: "Un carrelage collé ne rattrape pas un support mauvais : la préparation fait la tenue du revêtement.",
      },
      {
        title: "Nettoyer",
        details: ["Éliminer poussière, graisse, laitance et restes de colle.", "Sur ancien carrelage : dégraisser et poncer pour ouvrir l'émail."],
      },
      {
        title: "Appliquer le primaire",
        details: ["Choisir le primaire selon le support (absorbant, fermé, bois).", "Respecter le temps de séchage avant ragréage ou collage."],
      },
      {
        title: "Ragréer si besoin",
        details: [
          "Poser la bande périphérique, gâcher le ragréage au dosage exact, couler et débuller.",
          "Respecter l'épaisseur maximale du produit.",
        ],
      },
    ],
    checks: ["Planéité dans les tolérances.", "Support propre, sec et cohésif.", "Primaire sec au toucher avant collage."],
    norms: [DTU_52_2],
  },
  {
    id: "carr-pose-sol-collee",
    tradeCategoryId: "second-oeuvre",
    tradeIds: CARRELEURS,
    keywords: ["carrelage sol", "pose collée", "mortier-colle", "double encollage", "calepinage", "croisillons"],
    title: "Poser un carrelage au sol (pose collée)",
    summary: "Calepinage, encollage et pose d'un carrelage au sol au mortier-colle.",
    duration: "Environ 10 à 20 m² par jour selon le format",
    tools: ["Peigne à colle (denture selon format)", "Malaxeur", "Maillet caoutchouc", "Coupe-carreau, carrelette ou scie à eau", "Croisillons ou système de nivellement", "Règle, niveau, cordeau"],
    materials: ["Carreaux (prévoir 5 à 10 % de chute)", "Mortier-colle adapté au carreau et au support", "Bande de désolidarisation", "Mortier de jointoiement"],
    safety: [SILICE, GENOUX],
    steps: [
      {
        title: "Calepiner",
        details: [
          "Tracer deux axes perpendiculaires et faire un calepinage à blanc pour éviter les coupes étroites en bordure.",
          "Commencer par le point le plus visible ou l'entrée de la pièce.",
          "Repérer les joints de fractionnement de la chape : ils se reportent dans le carrelage.",
        ],
      },
      {
        title: "Encoller",
        details: [
          "Gâcher le mortier-colle, l'étaler sur une surface réduite (temps ouvert) puis le peigner.",
          "Double encollage (support + dos du carreau) pour les grands formats et en extérieur, selon le NF DTU 52.2 et la notice du mortier-colle.",
        ],
        warning: "Une colle qui a « croûté » (temps ouvert dépassé) n'adhère plus : faire le test du doigt régulièrement.",
      },
      {
        title: "Poser",
        details: [
          "Poser le carreau et le battre au maillet pour écraser les sillons.",
          "Contrôler le transfert de colle en soulevant un carreau de temps en temps.",
          "Respecter la largeur de joint et le joint périphérique (environ 5 mm le long des murs).",
        ],
      },
      {
        title: "Jointoyer",
        details: [
          "Après le délai de prise de la colle, remplir les joints en diagonale avec une raclette.",
          "Nettoyer à l'éponge humide, puis lustrer.",
        ],
      },
    ],
    checks: ["Planéité et alignement à la règle.", "Aucun carreau qui sonne creux.", "Joint périphérique et joints de fractionnement respectés."],
    norms: [DTU_52_2],
  },
  {
    id: "carr-faience-murale",
    tradeCategoryId: "second-oeuvre",
    tradeIds: CARRELEURS,
    keywords: ["faïence", "mur", "carrelage mural", "crédence", "salle de bain"],
    title: "Poser une faïence murale",
    summary: "Pose collée d'un carrelage mural en salle de bain ou en cuisine.",
    duration: "Environ 8 à 12 m² par jour",
    tools: ["Peigne à colle", "Niveau laser", "Tasseau d'appui", "Coupe-carreau, perceuse avec forets diamant", "Croisillons"],
    materials: ["Faïence", "Mortier-colle ou colle en pâte adaptée", "Profilés d'angle", "Joint et silicone sanitaire"],
    safety: [SILICE],
    steps: [
      {
        title: "Tracer",
        details: [
          "Fixer un tasseau de niveau à hauteur d'un carreau au-dessus du sol ou du receveur.",
          "Tracer l'axe vertical pour centrer la pose.",
        ],
      },
      {
        title: "Poser de bas en haut",
        details: [
          "Encoller sur une petite surface, poser à partir du tasseau en montant.",
          "Contrôler régulièrement l'aplomb et le niveau.",
        ],
        warning: "Ne pas poser la faïence contre le receveur ou la baignoire sans joint souple : les dilatations fissurent le joint.",
      },
      {
        title: "Finir le bas",
        details: ["Retirer le tasseau après prise, poser la rangée basse en coupe."],
      },
      {
        title: "Jointoyer et étancher",
        details: [
          "Faire les joints après prise de la colle.",
          "Jonctions avec sanitaires et angles rentrants : silicone sanitaire.",
        ],
      },
    ],
    checks: ["Rangs d'aplomb et de niveau.", "Joints réguliers.", "Silicone continu aux jonctions."],
    norms: [DTU_52_2],
  },
  {
    id: "carr-douche-italienne-spec",
    tradeCategoryId: "second-oeuvre",
    tradeIds: CARRELEURS,
    keywords: ["douche à l'italienne", "SPEC", "SEL", "étanchéité", "receveur à carreler", "caniveau"],
    title: "Réaliser une douche à l'italienne étanche",
    summary: "Forme de pente, système d'étanchéité sous carrelage et pose du revêtement pour une douche de plain-pied.",
    duration: "2 à 3 jours, séchages compris",
    tools: ["Règle, niveau", "Rouleau ou spatule pour SPEC", "Peigne à colle, maillet", "Outillage carreleur"],
    materials: [
      "Receveur à carreler ou forme de pente",
      "Siphon de sol ou caniveau compatible avec le système d'étanchéité",
      "Système d'étanchéité sous carrelage (SPEC ou SEL sous Avis technique) avec bandes d'angle et manchettes",
      "Mortier-colle compatible, carreaux antidérapants",
    ],
    safety: [SILICE, GENOUX],
    steps: [
      {
        title: "Créer la pente",
        details: [
          "Prévoir une pente de 1 à 2 % vers le siphon ou le caniveau.",
          "Poser le siphon ou caniveau au bon niveau, raccordé et testé.",
        ],
        warning: "Sans pente suffisante, l'eau stagne et déborde de la zone de douche.",
      },
      {
        title: "Étancher",
        details: [
          "Appliquer le système d'étanchéité au sol et sur les murs de la douche, en remontant à la hauteur prescrite.",
          "Poser les bandes d'angle et les manchettes autour du siphon et des sorties d'eau.",
          "Respecter le nombre de couches, la consommation et le temps de séchage du fabricant.",
        ],
      },
      {
        title: "Tester",
        details: ["Faire un essai d'étanchéité (mise en eau) avant de carreler quand le système le prévoit."],
      },
      {
        title: "Carreler",
        details: [
          "Poser des carreaux adaptés aux sols mouillés (classement glissance).",
          "Jointoyer avec un joint adapté, silicone aux angles.",
        ],
      },
    ],
    checks: ["Écoulement complet vers le siphon.", "Essai d'étanchéité réussi.", "Aucune eau hors de la zone de douche."],
    norms: [DTU_52_2, { ref: "Avis technique du système", label: "Mise en œuvre du SPEC ou du SEL choisi" }],
  },
  {
    id: "carr-grands-formats",
    tradeCategoryId: "second-oeuvre",
    tradeIds: CARRELEURS,
    keywords: ["grand format", "120x120", "60x120", "dalle", "système de nivellement", "ventouse"],
    title: "Poser des carreaux grand format",
    summary: "Précautions spécifiques aux carreaux de grande dimension : support, encollage, manutention.",
    duration: "Environ 8 à 15 m² par jour",
    tools: ["Ventouses de manutention", "Système de nivellement (cales et clips)", "Peigne à grosse denture", "Rail de coupe grand format"],
    materials: ["Carreaux grand format", "Mortier-colle déformable adapté", "Ragréage si la planéité l'exige"],
    safety: [SILICE, GENOUX, "Manutention à deux pour les grands formats lourds."],
    steps: [
      {
        title: "Exiger une planéité parfaite",
        details: ["Plus le carreau est grand, plus la tolérance de planéité est serrée : ragréer si nécessaire."],
      },
      {
        title: "Encoller en double",
        details: [
          "Double encollage systématique, mortier-colle adapté au format.",
          "Lisser le dos du carreau puis peigner le support.",
        ],
        warning: "Un vide sous un grand carreau le fera casser au premier choc.",
      },
      {
        title: "Poser et niveler",
        details: [
          "Poser avec les ventouses, faire glisser le carreau pour écraser les sillons.",
          "Utiliser le système de nivellement pour éviter les désaffleurs entre carreaux.",
        ],
      },
    ],
    checks: ["Aucun désaffleur entre carreaux.", "Aucun son creux.", "Joints réguliers."],
    norms: [DTU_52_2],
  },
  {
    id: "carr-joints-finitions",
    tradeCategoryId: "second-oeuvre",
    tradeIds: CARRELEURS,
    keywords: ["joint", "jointoiement", "époxy", "silicone", "plinthes", "nettoyage carrelage"],
    title: "Réaliser les joints et les finitions",
    summary: "Jointoiement, joints souples, plinthes et nettoyage de fin de chantier.",
    duration: "Une demi-journée par pièce",
    tools: ["Raclette à joint", "Éponge de carreleur et seau", "Pistolet à mastic", "Coupe-plinthe"],
    materials: ["Mortier de joint (ciment ou époxy)", "Silicone sanitaire", "Plinthes et colle", "Nettoyant après pose"],
    safety: ["Joint époxy : gants nitrile et lunettes."],
    steps: [
      {
        title: "Choisir le joint",
        details: [
          "Joint ciment pour la plupart des usages.",
          "Joint époxy pour les zones très sollicitées ou exposées aux taches (crédence, douche, cuisine professionnelle).",
        ],
      },
      {
        title: "Jointoyer",
        details: [
          "Remplir en passant la raclette en diagonale.",
          "Nettoyer à l'éponge bien essorée dès que le joint commence à tirer.",
        ],
        warning: "Trop d'eau au nettoyage creuse et décolore les joints.",
      },
      {
        title: "Poser les joints souples",
        details: ["Silicone aux angles rentrants, autour des sanitaires et le long des menuiseries."],
      },
      {
        title: "Poser les plinthes et nettoyer",
        details: ["Coller les plinthes en laissant un joint au sol.", "Nettoyer le voile de ciment avec un produit adapté au carreau."],
      },
    ],
    checks: ["Joints pleins et réguliers.", "Silicone continu.", "Aucun voile de ciment."],
    norms: [DTU_52_2],
  },
  {
    id: "carr-terrasse-exterieure",
    tradeCategoryId: "second-oeuvre",
    tradeIds: CARRELEURS,
    keywords: ["terrasse", "extérieur", "dalle sur plots", "carrelage extérieur", "gel", "pente"],
    title: "Carreler une terrasse extérieure",
    summary: "Pose collée sur dalle béton avec pente, carreaux résistants au gel et joints adaptés.",
    duration: "Selon la surface",
    tools: ["Outillage carreleur", "Niveau avec contrôle de pente"],
    materials: ["Carreaux ingélifs et antidérapants", "Mortier-colle classé pour l'extérieur", "Joint adapté à l'extérieur", "Profilés de rive"],
    safety: [SILICE, GENOUX, "Ne pas poser par grand soleil, sous la pluie ou en période de gel."],
    steps: [
      {
        title: "Vérifier la dalle",
        details: [
          "Pente de 1,5 à 2 % pour évacuer l'eau, à l'opposé du bâtiment.",
          "Joints de dilatation de la dalle repérés.",
        ],
        warning: "Sans pente, l'eau stagne et le gel fait éclater les carreaux.",
      },
      {
        title: "Poser en double encollage",
        details: [
          "Double encollage pour supprimer tout vide où l'eau pourrait geler.",
          "Respecter les joints de fractionnement et le joint périphérique.",
        ],
      },
      {
        title: "Finir",
        details: ["Jointoyer avec un mortier pour l'extérieur.", "Poser les profilés de rive."],
      },
    ],
    checks: ["Pente vérifiée (pas d'eau stagnante).", "Aucun son creux.", "Joints de dilatation respectés."],
    norms: [DTU_52_2, DTU_52_1],
  },
  {
    id: "carr-plancher-chauffant",
    tradeCategoryId: "second-oeuvre",
    tradeIds: CARRELEURS,
    keywords: ["plancher chauffant", "chape", "mise en chauffe", "chauffage au sol"],
    title: "Carreler sur un plancher chauffant",
    summary: "Conditions de pose d'un carrelage sur plancher chauffant à eau ou électrique.",
    duration: "Selon la surface, après le protocole de mise en chauffe",
    tools: ["Outillage carreleur", "Humidimètre"],
    materials: ["Mortier-colle déformable adapté", "Bande de désolidarisation", "Joint adapté"],
    safety: [SILICE, GENOUX],
    steps: [
      {
        title: "Attendre la mise en chauffe",
        details: [
          "La chape doit avoir subi la mise en chauffe progressive prévue par son fabricant, puis avoir refroidi.",
          "Arrêter le chauffage quelques jours avant la pose (ou le réduire selon le protocole).",
        ],
        warning: "Carreler une chape non mise en chauffe expose à des fissures à la première saison de chauffe.",
      },
      {
        title: "Poser",
        details: [
          "Mortier-colle déformable, double encollage selon le format.",
          "Respecter strictement les joints de fractionnement de la chape.",
        ],
      },
      {
        title: "Remettre en chauffe",
        details: ["Remettre le chauffage progressivement après le délai prescrit."],
      },
    ],
    checks: ["Joints de fractionnement reportés.", "Protocole de mise en chauffe noté et remis au client."],
    norms: [DTU_52_2, DTU_52_10],
  },
  {
    id: "carr-mosaique",
    tradeCategoryId: "second-oeuvre",
    tradeIds: ["carreleur-mosaiste", "carreleur"],
    keywords: ["mosaïque", "pâte de verre", "trame", "piscine", "décoration"],
    title: "Poser une mosaïque sur trame",
    summary: "Pose de mosaïque en plaques tramées sur mur ou sol.",
    duration: "Environ 4 à 8 m² par jour",
    tools: ["Peigne fin", "Platoir caoutchouc", "Pince à mosaïque", "Éponge"],
    materials: ["Mosaïque sur trame", "Colle blanche si mosaïque translucide (pâte de verre)", "Joint fin ou époxy"],
    safety: ["Découpe des tesselles de verre : lunettes et gants."],
    steps: [
      {
        title: "Préparer",
        details: ["Support parfaitement plan : les défauts se voient à travers la mosaïque.", "Tracer des repères tous les 2 ou 3 plaques."],
      },
      {
        title: "Encoller et poser",
        details: [
          "Colle peignée au peigne fin, sans surépaisseur qui remonterait dans les joints.",
          "Poser les plaques en respectant le même écart entre plaques qu'entre tesselles.",
          "Maroufler au platoir pour noyer la trame.",
        ],
        warning: "Les joints entre plaques doivent être invisibles : contrôler l'alignement à chaque rang.",
      },
      {
        title: "Jointoyer",
        details: ["Joint à la raclette caoutchouc, nettoyage soigné et rapide."],
      },
    ],
    checks: ["Aucun alignement de plaques visible.", "Joints pleins.", "Aucune colle visible à travers le verre."],
    norms: [DTU_52_2],
  },
  {
    id: "carr-scellee-traditionnelle",
    tradeCategoryId: "second-oeuvre",
    tradeIds: CARRELEURS,
    keywords: ["pose scellée", "mortier", "chape", "tomettes", "pierre", "pose traditionnelle"],
    title: "Poser un revêtement de sol scellé (pose traditionnelle)",
    summary: "Pose sur lit de mortier frais, pour les terres cuites, pierres et supports irréguliers.",
    duration: "Environ 6 à 10 m² par jour",
    tools: ["Bétonnière ou malaxeur", "Règle, niveau, cordeau", "Truelle, maillet", "Batte"],
    materials: ["Sable et ciment (ou mortier prêt à l'emploi)", "Barbotine d'adhérence", "Revêtement (terre cuite, pierre…)", "Désolidarisation ou film selon support"],
    safety: [SILICE, GENOUX, "Ciment : gants et lunettes (brûlures chimiques)."],
    steps: [
      {
        title: "Préparer",
        details: [
          "Désolidariser le mortier de pose du support quand le NF DTU 52.1 le prévoit.",
          "Humidifier les carreaux de terre cuite poreux avant la pose.",
        ],
      },
      {
        title: "Étaler le mortier",
        details: ["Étaler le mortier sur une petite surface, à l'épaisseur prescrite, et le dresser à la règle."],
      },
      {
        title: "Poser",
        details: [
          "Saupoudrer de ciment ou étaler une barbotine, poser le carreau, battre pour l'enfoncer.",
          "Contrôler la planéité et l'alignement en continu.",
        ],
        warning: "Respecter le fractionnement et les joints périphériques : le mortier scellé bouge en séchant.",
      },
      {
        title: "Jointoyer",
        details: ["Jointoyer après durcissement suffisant du mortier."],
      },
    ],
    checks: ["Planéité.", "Aucun carreau creux.", "Fractionnement respecté."],
    norms: [DTU_52_1],
  },
];
