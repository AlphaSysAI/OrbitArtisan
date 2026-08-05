/**
 * Nomenclature des métiers du bâtiment et connexes, en deux niveaux.
 *
 * Structurée d'après les corps d'état usuels (gros œuvre / second œuvre / travaux
 * publics) et le découpage métiers de la CAPEB, étendue aux activités connexes
 * (piscine, paysage, rénovation énergétique) qui ne relèvent pas du BTP strict.
 *
 * Les `id` sont stockés en base : ils doivent rester stables. Les `label` sont
 * de l'affichage et peuvent être reformulés librement.
 */

export type Trade = {
  id: string;
  label: string;
};

export type TradeCategory = {
  id: string;
  label: string;
  trades: Trade[];
};

export const TRADE_CATEGORIES: TradeCategory[] = [
  {
    id: "gros-oeuvre",
    label: "Gros œuvre & structure",
    trades: [
      { id: "macon", label: "Maçon" },
      { id: "coffreur-bancheur", label: "Coffreur-bancheur" },
      { id: "ferrailleur", label: "Ferrailleur" },
      { id: "constructeur-beton-arme", label: "Constructeur en béton armé" },
      { id: "charpentier-bois", label: "Charpentier bois" },
      { id: "charpentier-metallique", label: "Charpentier métallique" },
      { id: "terrassier", label: "Terrassier" },
      { id: "demolisseur", label: "Démolisseur" },
      { id: "facadier-ravaleur", label: "Façadier / ravaleur" },
      { id: "etancheur", label: "Étancheur" },
    ],
  },
  {
    id: "couverture",
    label: "Couverture & toiture",
    trades: [
      { id: "couvreur", label: "Couvreur" },
      { id: "couvreur-zingueur", label: "Couvreur-zingueur" },
      { id: "zingueur", label: "Zingueur" },
      { id: "poseur-gouttieres", label: "Poseur de gouttières" },
      { id: "poseur-fenetres-toit", label: "Poseur de fenêtres de toit" },
      { id: "nettoyage-toiture", label: "Nettoyage & démoussage de toiture" },
    ],
  },
  {
    id: "second-oeuvre",
    label: "Second œuvre & aménagement intérieur",
    trades: [
      { id: "platrier", label: "Plâtrier" },
      { id: "plaquiste", label: "Plaquiste" },
      { id: "platrier-plaquiste", label: "Plâtrier-plaquiste" },
      { id: "poseur-plafonds-suspendus", label: "Poseur de plafonds suspendus" },
      { id: "poseur-isolation", label: "Poseur d'isolation (ITI)" },
      { id: "menuisier-bois", label: "Menuisier bois" },
      { id: "menuisier-agenceur", label: "Menuisier-agenceur" },
      { id: "poseur-cuisines", label: "Poseur de cuisines & salles de bains" },
      { id: "parqueteur", label: "Parqueteur" },
      { id: "carreleur", label: "Carreleur" },
      { id: "carreleur-mosaiste", label: "Carreleur-mosaïste" },
      { id: "solier-moquettiste", label: "Solier-moquettiste" },
      { id: "peintre-batiment", label: "Peintre en bâtiment" },
      { id: "vitrier", label: "Vitrier" },
      { id: "miroitier", label: "Miroitier" },
      { id: "staffeur-ornemaniste", label: "Staffeur-ornemaniste" },
    ],
  },
  {
    id: "plomberie-chauffage",
    label: "Plomberie, chauffage & climatisation",
    trades: [
      { id: "plombier", label: "Plombier" },
      { id: "plombier-chauffagiste", label: "Plombier-chauffagiste" },
      { id: "chauffagiste", label: "Chauffagiste" },
      { id: "installateur-sanitaire", label: "Installateur sanitaire" },
      { id: "climaticien", label: "Climaticien" },
      { id: "frigoriste", label: "Frigoriste" },
      { id: "installateur-vmc", label: "Installateur VMC & ventilation" },
      { id: "poseur-poeles-cheminees", label: "Poseur de poêles & cheminées" },
      { id: "ramoneur", label: "Ramoneur" },
      { id: "traitement-eau", label: "Traitement de l'eau" },
    ],
  },
  {
    id: "electricite",
    label: "Électricité & courants faibles",
    trades: [
      { id: "electricien", label: "Électricien" },
      { id: "electricien-industriel", label: "Électricien industriel" },
      { id: "electricien-courants-faibles", label: "Électricien courants faibles" },
      { id: "domoticien", label: "Domoticien" },
      { id: "installateur-alarme-videosurveillance", label: "Installateur d'alarme & vidéosurveillance" },
      { id: "installateur-irve", label: "Installateur de bornes de recharge (IRVE)" },
      { id: "antenniste", label: "Antenniste" },
    ],
  },
  {
    id: "energies-renouvelables",
    label: "Énergies renouvelables & rénovation énergétique",
    trades: [
      { id: "installateur-photovoltaique", label: "Installateur photovoltaïque" },
      { id: "installateur-pompe-a-chaleur", label: "Installateur de pompes à chaleur" },
      { id: "installateur-solaire-thermique", label: "Installateur solaire thermique" },
      { id: "installateur-chaudiere-biomasse", label: "Installateur de chaudière biomasse / granulés" },
      { id: "specialiste-ite", label: "Spécialiste isolation extérieure (ITE)" },
      { id: "auditeur-energetique", label: "Auditeur énergétique" },
      { id: "installateur-recuperation-eau", label: "Installateur de récupération d'eau de pluie" },
    ],
  },
  {
    id: "menuiseries-exterieures",
    label: "Menuiseries extérieures & fermetures",
    trades: [
      { id: "menuisier-pvc-alu", label: "Menuisier PVC / aluminium" },
      { id: "poseur-fenetres", label: "Poseur de fenêtres" },
      { id: "poseur-volets-stores", label: "Poseur de volets & stores" },
      { id: "poseur-store-banne", label: "Poseur de stores bannes" },
      { id: "poseur-porte-garage", label: "Poseur de portes de garage" },
      { id: "poseur-portails-clotures", label: "Poseur de portails & clôtures" },
      { id: "verandaliste", label: "Vérandaliste" },
      { id: "poseur-pergolas", label: "Poseur de pergolas" },
      { id: "serrurier", label: "Serrurier" },
      { id: "serrurier-metallier", label: "Serrurier-métallier" },
      { id: "ferronnier", label: "Ferronnier d'art" },
    ],
  },
  {
    id: "piscine-spa",
    label: "Piscine & spa",
    trades: [
      { id: "pisciniste", label: "Pisciniste" },
      { id: "constructeur-piscine-beton", label: "Constructeur de piscines béton" },
      { id: "installateur-piscine-coque", label: "Installateur de piscines coque" },
      { id: "piscine-hors-sol", label: "Installateur de piscines hors-sol" },
      { id: "renovation-piscine", label: "Rénovation de piscine" },
      { id: "poseur-liner", label: "Poseur de liner & étanchéité" },
      { id: "entretien-piscine", label: "Entretien de piscine" },
      { id: "traitement-eau-piscine", label: "Traitement de l'eau de piscine" },
      { id: "installateur-abri-piscine", label: "Installateur d'abris & couvertures" },
      { id: "poseur-plages-margelles", label: "Poseur de plages & margelles" },
      { id: "installateur-spa-sauna", label: "Installateur de spas & saunas" },
    ],
  },
  {
    id: "amenagement-exterieur",
    label: "Aménagement extérieur & paysage",
    trades: [
      { id: "paysagiste", label: "Paysagiste" },
      { id: "jardinier-espaces-verts", label: "Jardinier / entretien d'espaces verts" },
      { id: "elagueur", label: "Élagueur" },
      { id: "macon-paysagiste", label: "Maçon paysagiste" },
      { id: "poseur-terrasse", label: "Poseur de terrasses (bois & composite)" },
      { id: "cloturiste", label: "Clôturiste" },
      { id: "installateur-arrosage", label: "Installateur d'arrosage automatique" },
      { id: "poseur-gazon-synthetique", label: "Poseur de gazon synthétique" },
    ],
  },
  {
    id: "travaux-publics",
    label: "Travaux publics & réseaux",
    trades: [
      { id: "canalisateur", label: "Canalisateur" },
      { id: "constructeur-routes", label: "Constructeur de routes" },
      { id: "monteur-reseaux", label: "Monteur de réseaux électriques" },
      { id: "poseur-fibre-optique", label: "Poseur de fibre optique" },
      { id: "conducteur-engins", label: "Conducteur d'engins" },
      { id: "assainissement", label: "Assainissement" },
      { id: "forage-puits", label: "Forage & puits" },
      { id: "signalisation-routiere", label: "Signalisation routière" },
    ],
  },
  {
    id: "renovation-specialisee",
    label: "Rénovation & traitements spécialisés",
    trades: [
      { id: "renovation-tous-corps-etat", label: "Rénovation tous corps d'état" },
      { id: "traitement-humidite", label: "Traitement de l'humidité" },
      { id: "traitement-charpente", label: "Traitement des charpentes & bois" },
      { id: "desamiantage", label: "Désamiantage" },
      { id: "deplombage", label: "Déplombage" },
      { id: "traitement-nuisibles", label: "Traitement des nuisibles" },
      { id: "nettoyage-remise-en-etat", label: "Nettoyage & remise en état" },
      { id: "diagnostiqueur-immobilier", label: "Diagnostiqueur immobilier" },
    ],
  },
  {
    id: "pierre-patrimoine",
    label: "Pierre & patrimoine",
    trades: [
      { id: "tailleur-pierre", label: "Tailleur de pierre" },
      { id: "macon-patrimoine", label: "Maçon du patrimoine" },
      { id: "restaurateur-monuments-historiques", label: "Restaurateur de monuments historiques" },
      { id: "marbrier", label: "Marbrier" },
      { id: "sculpteur-pierre", label: "Sculpteur sur pierre" },
    ],
  },
  {
    id: "conception-encadrement",
    label: "Conception, étude & encadrement",
    trades: [
      { id: "architecte", label: "Architecte" },
      { id: "architecte-interieur", label: "Architecte d'intérieur" },
      { id: "decorateur-interieur", label: "Décorateur d'intérieur" },
      { id: "maitre-oeuvre", label: "Maître d'œuvre" },
      { id: "economiste-construction", label: "Économiste de la construction" },
      { id: "geometre-topographe", label: "Géomètre-topographe" },
      { id: "bureau-etudes", label: "Bureau d'études" },
      { id: "conducteur-travaux", label: "Conducteur de travaux" },
      { id: "coordinateur-sps", label: "Coordinateur SPS" },
    ],
  },
  {
    id: "autre",
    label: "Autre",
    trades: [{ id: "autre", label: "Autre métier" }],
  },
];

export function findTradeCategory(categoryId: string | null | undefined): TradeCategory | null {
  if (!categoryId) return null;
  return TRADE_CATEGORIES.find((c) => c.id === categoryId) ?? null;
}

export function findTrade(
  categoryId: string | null | undefined,
  tradeId: string | null | undefined,
): Trade | null {
  const category = findTradeCategory(categoryId);
  if (!category || !tradeId) return null;
  return category.trades.find((t) => t.id === tradeId) ?? null;
}

/** Une sélection n'est valide que si le métier appartient bien à la catégorie choisie. */
export function isValidTradeSelection(
  categoryId: string | null | undefined,
  tradeId: string | null | undefined,
): boolean {
  return findTrade(categoryId, tradeId) !== null;
}

/** Libellé affichable, ex. « Plomberie, chauffage & climatisation · Chauffagiste ». */
export function formatTradeLabel(
  categoryId: string | null | undefined,
  tradeId: string | null | undefined,
): string | null {
  const category = findTradeCategory(categoryId);
  const trade = findTrade(categoryId, tradeId);
  if (!category || !trade) return null;
  return `${category.label} · ${trade.label}`;
}

/**
 * Regroupement des 14 catégories en grands domaines, pour le parcours de
 * recherche côté client : Domaine → Catégorie → Métier.
 * (ex. « Eau & chauffage » → « Plomberie, chauffage & climatisation » → « Chauffagiste »)
 *
 * `autre` n'est volontairement rattaché à aucun domaine : c'est une valeur de
 * saisie côté artisan, pas une entrée de recherche client.
 */
export type TradeDomain = {
  id: string;
  label: string;
  emoji: string;
  categoryIds: string[];
};

export const TRADE_DOMAINS: TradeDomain[] = [
  {
    id: "eau-chauffage",
    label: "Eau & chauffage",
    emoji: "💧",
    categoryIds: ["plomberie-chauffage", "piscine-spa"],
  },
  {
    id: "elec-energie",
    label: "Élec & énergie",
    emoji: "⚡",
    categoryIds: ["electricite", "energies-renouvelables"],
  },
  {
    id: "batiment-structure",
    label: "Bâtiment & structure",
    emoji: "🧱",
    categoryIds: ["gros-oeuvre", "couverture", "second-oeuvre", "menuiseries-exterieures", "pierre-patrimoine"],
  },
  {
    id: "exterieur-paysage",
    label: "Extérieur & paysage",
    emoji: "🌳",
    categoryIds: ["amenagement-exterieur", "travaux-publics"],
  },
  {
    id: "renovation-conception",
    label: "Rénovation & conception",
    emoji: "🎨",
    categoryIds: ["renovation-specialisee", "conception-encadrement"],
  },
];

export function findTradeDomain(domainId: string | null | undefined): TradeDomain | null {
  if (!domainId) return null;
  return TRADE_DOMAINS.find((d) => d.id === domainId) ?? null;
}

/** Catégories d'un domaine, dans l'ordre de la nomenclature. */
export function categoriesForDomain(domainId: string | null | undefined): TradeCategory[] {
  const domain = findTradeDomain(domainId);
  if (!domain) return [];
  return TRADE_CATEGORIES.filter((c) => domain.categoryIds.includes(c.id));
}
