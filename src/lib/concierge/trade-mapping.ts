import { TRADE_CATEGORIES } from "@/lib/trades/taxonomy";

/**
 * Métier libre d'un annuaire (« Plombier chauffagiste », « Entreprise de maçonnerie »,
 * catégorie Google « Electrician »…) → identifiants de la nomenclature Soline.
 * Ordre = priorité : le libellé le plus spécifique d'abord.
 */
const KEYWORDS: [RegExp, string][] = [
  [/plomb.*chauff|chauffagiste.*plomb/, "plombier-chauffagiste"],
  [/chauffag|heating|chaudi/, "chauffagiste"],
  [/plomb|plumb/, "plombier"],
  [/climati|air condition|\bhvac\b/, "climaticien"],
  [/pompe a chaleur|pac\b/, "installateur-pompe-a-chaleur"],
  [/photovolta|solar|solaire/, "installateur-photovoltaique"],
  [/electri/, "electricien"],
  [/couvr|toitur|roof/, "couvreur"],
  [/zingu/, "zingueur"],
  [/charpent|carpent/, "charpentier-bois"],
  [/macon|masonry|gros oeuvre|mason/, "macon"],
  [/terrass|excavat/, "terrassier"],
  [/facad|ravale/, "facadier-ravaleur"],
  [/etanch|waterproof/, "etancheur"],
  [/plaqu|platr|plaster|drywall/, "platrier-plaquiste"],
  [/carrel|tile|tiling/, "carreleur"],
  [/parquet|floor/, "parqueteur"],
  [/peint|painter|painting/, "peintre-batiment"],
  [/menuis.*(pvc|alu)|fenetre|window/, "menuisier-pvc-alu"],
  [/menuis|joiner|cabinet/, "menuisier-bois"],
  [/cuisin|kitchen|salle de bain|bathroom/, "poseur-cuisines"],
  [/serrur|locksmith/, "serrurier"],
  [/vitr|glazier/, "vitrier"],
  [/pisc|pool/, "pisciniste"],
  [/paysag|landscap|jardin|garden/, "paysagiste"],
  [/isol|insulat/, "poseur-isolation"],
  [/renovation|general contractor|entreprise generale|tous corps/, "renovation-tous-corps-etat"],
];

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
