import { TRADE_CATEGORIES } from "@/lib/trades/taxonomy";

/**
 * Métier libre d'un annuaire (« Plombier chauffagiste », « Entreprise de maçonnerie »,
 * catégorie Google « Electrician »…) → identifiants de la nomenclature Soline.
 * Ordre = priorité : le libellé le plus spécifique d'abord.
 */
const KEYWORDS: [RegExp, string][] = [
  [/plomb.*chauff|chauffagiste.*plomb/, "plombier-chauffagiste"],
  [/chauffag|heating|chaudi/, "chauffagiste"],
  [/salle de bain|bathroom/, "installateur-sanitaire"],
  [/plomb|plumb/, "plombier"],
  [/climati|air condition|\bhvac\b/, "climaticien"],
  [/pompe a chaleur|\bpac\b|heat pump/, "installateur-pompe-a-chaleur"],
  [/photovolta|solar|solaire/, "installateur-photovoltaique"],
  [/electri/, "electricien"],
  [/garage door|porte de garage/, "poseur-porte-garage"],
  [/pergola|carport|veranda|conservatory/, "poseur-pergolas"],
  [/gutter|goutti/, "poseur-gouttieres"],
  [/couvr|toitur|roof/, "couvreur"],
  [/zingu/, "zingueur"],
  [/charpent|carpent/, "charpentier-bois"],
  [/macon|masonry|gros oeuvre|mason/, "macon"],
  [/terrass|excavat|earth ?works/, "terrassier"],
  [/facad|ravale|siding|bardage/, "facadier-ravaleur"],
  [/etanch|waterproof/, "etancheur"],
  [/plaqu|platr|plaster|drywall/, "platrier-plaquiste"],
  [/carrel|tile|tiling/, "carreleur"],
  [/carpet|moquet/, "solier-moquettiste"],
  [/parquet|floor/, "parqueteur"],
  [/peint|painter|painting/, "peintre-batiment"],
  [/double glazing|menuis.*(pvc|alu)|fenetre|window/, "menuisier-pvc-alu"],
  [/fence|clotur/, "cloturiste"],
  [/metal ?work|metallier|ferronn|ironwork|metal fabricat/, "serrurier-metallier"],
  [/menuis|joiner|cabinet|woodwork|millwork|furniture maker|ebenist/, "menuisier-bois"],
  [/cuisin|kitchen/, "poseur-cuisines"],
  [/serrur|locksmith/, "serrurier"],
  [/vitr|glazier|glass|mirror|miroit/, "vitrier"],
  [/pisc|pool/, "pisciniste"],
  [/paysag|landscap|jardin|garden/, "paysagiste"],
  [/isol|insulat/, "poseur-isolation"],
  [
    /renovation|general contractor|entreprise generale|tous corps|handyman|multi ?services|construction company|home builder|entreprise de construction|interior construction|travaux generaux/,
    "renovation-tous-corps-etat",
  ],
];

/**
 * Fiches d'annuaire qui ne sont PAS des artisans (commerces, fabricants, artistes,
 * garages auto, sièges sociaux…) : jamais proposées sur un chantier.
 * Exceptions : ateliers de fabrication-pose (menuiserie, miroiterie, métallerie).
 */
const ARTISAN_WORKSHOP = /millwork shop|glass mirror shop|metal workshop|atelier de menuiserie|miroiterie/;
const NON_ARTISAN =
  /\b(stores?|shops?|suppliers?|wholesalers?|manufacturers?|magasins?|fournisseurs?|grossistes?|fabricants?|negoce|artists?|artistes?|art studio|atelier d art|atelier d artiste|galler(y|ies)|galeries?|arts organization|arts and crafts|sculpt\w*|corporate office|siege social|auto body|carrosserie|garage automobile|car repair|mechanic\w*|attractions?|handicrafts?|janitorial|waste|sanitation|cleaners|nettoyage de locaux|heritage building|substation)\b|^swimming pool$|^piscine$/;

/** Types principaux jamais requalifiables par un sous-type (peintre en carrosserie ≠ peintre en bâtiment). */
const HARD_NON_ARTISAN =
  /\b(artists?|artistes?|art studio|atelier d art|galler(y|ies)|arts organization|arts and crafts|sculpt\w*|auto body|carrosserie|garage automobile|car repair|mechanic\w*|attractions?|heritage building|substation|cleaners|janitorial)\b/;

export function isNonArtisanLabel(raw: string | null | undefined): boolean {
  const n = normalize(raw ?? "");
  return !!n && !ARTISAN_WORKSHOP.test(n) && NON_ARTISAN.test(n);
}

/**
 * Métier d'une fiche à partir de plusieurs libellés (type principal Google d'abord,
 * puis sous-types, catégorie, recherche d'origine). Un type principal « commerce /
 * fabricant » n'est retenu que si un sous-type décrit une activité d'artisan.
 */
export function resolveProspectTrade(
  primary: string | null | undefined,
  others: (string | null | undefined)[],
): { trade: string; category: string } | "not_artisan" | null {
  const candidates = [primary, ...others].map((c) => (c ?? "").trim()).filter(Boolean);
  if (!candidates.length) return null;
  if (primary && HARD_NON_ARTISAN.test(normalize(primary))) return "not_artisan";
  let sawNonArtisan = false;
  for (const c of candidates) {
    if (isNonArtisanLabel(c)) {
      sawNonArtisan = true;
      continue;
    }
    const t = mapTrade(c);
    if (t) return t;
  }
  return sawNonArtisan ? "not_artisan" : null;
}

function normalize(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/œ/g, "oe")
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const BY_ID = new Map<string, { trade: string; category: string }>();
const BY_LABEL = new Map<string, { trade: string; category: string }>();
for (const cat of TRADE_CATEGORIES) {
  for (const t of cat.trades) {
    BY_ID.set(t.id, { trade: t.id, category: cat.id });
    BY_LABEL.set(normalize(t.label), { trade: t.id, category: cat.id });
  }
}

export function mapTrade(raw: string | null | undefined): { trade: string; category: string } | null {
  if (!raw?.trim()) return null;
  const direct = BY_ID.get(raw.trim());
  if (direct) return direct;
  const n = normalize(raw);
  const label = BY_LABEL.get(n);
  if (label) return label;
  for (const [re, id] of KEYWORDS) {
    if (re.test(n)) return BY_ID.get(id) ?? null;
  }
  return null;
}
