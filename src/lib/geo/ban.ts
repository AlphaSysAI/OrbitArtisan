/**
 * Géocodage via la Base Adresse Nationale (BAN), API publique de l'État français.
 * https://api-adresse.data.gouv.fr — gratuit, sans clé, adresses françaises.
 *
 * Utilisé côté client pour l'autocomplétion, et côté serveur pour figer les
 * coordonnées à l'enregistrement du profil artisan.
 */

const BAN_ENDPOINT = "https://api-adresse.data.gouv.fr/search/";

export type BanSuggestion = {
  label: string;
  addressLine1: string;
  postalCode: string;
  city: string;
  latitude: number;
  longitude: number;
};

type BanFeature = {
  properties?: {
    label?: string;
    name?: string;
    postcode?: string;
    city?: string;
  };
  geometry?: { coordinates?: [number, number] };
};

function toSuggestion(feature: BanFeature): BanSuggestion | null {
  const p = feature.properties ?? {};
  const coords = feature.geometry?.coordinates;
  if (!p.label || !coords || coords.length !== 2) return null;
  const [longitude, latitude] = coords;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  return {
    label: p.label,
    // `name` = numéro + voie ; à défaut on retombe sur le label complet.
    addressLine1: p.name ?? p.label,
    postalCode: p.postcode ?? "",
    city: p.city ?? "",
    latitude,
    longitude,
  };
}

/**
 * Autocomplétion d'adresse. `type=housenumber` privilégie les adresses précises
 * (une position exacte), utile pour géolocaliser un artisan.
 * `signal` permet d'annuler les requêtes obsolètes lors de la frappe.
 */
export async function searchBanAddresses(
  query: string,
  opts: { limit?: number; signal?: AbortSignal } = {},
): Promise<BanSuggestion[]> {
  const q = query.trim();
  if (q.length < 3) return [];

  const url = new URL(BAN_ENDPOINT);
  url.searchParams.set("q", q);
  url.searchParams.set("limit", String(opts.limit ?? 5));
  url.searchParams.set("autocomplete", "1");

  try {
    const res = await fetch(url, { signal: opts.signal });
    if (!res.ok) return [];
    const data = (await res.json()) as { features?: BanFeature[] };
    return (data.features ?? []).map(toSuggestion).filter((s): s is BanSuggestion => s !== null);
  } catch {
    // Abandon de requête ou réseau indisponible : pas de suggestions, pas d'erreur bloquante.
    return [];
  }
}

/**
 * Recherche de communes (repli si le client refuse la géolocalisation).
 * `type=municipality` renvoie le centre de la ville.
 */
export async function searchBanCities(
  query: string,
  opts: { limit?: number; signal?: AbortSignal } = {},
): Promise<BanSuggestion[]> {
  const q = query.trim();
  if (q.length < 2) return [];

  const url = new URL(BAN_ENDPOINT);
  url.searchParams.set("q", q);
  url.searchParams.set("type", "municipality");
  url.searchParams.set("limit", String(opts.limit ?? 5));
  url.searchParams.set("autocomplete", "1");

  try {
    const res = await fetch(url, { signal: opts.signal });
    if (!res.ok) return [];
    const data = (await res.json()) as { features?: BanFeature[] };
    return (data.features ?? []).map(toSuggestion).filter((s): s is BanSuggestion => s !== null);
  } catch {
    return [];
  }
}

/**
 * Géocodage serveur d'une adresse libre → coordonnées, ou null si introuvable.
 * Filet de sécurité quand l'artisan a tapé son adresse sans choisir de suggestion.
 */
export async function geocodeAddress(parts: {
  addressLine1?: string | null;
  postalCode?: string | null;
  city?: string | null;
}): Promise<{ latitude: number; longitude: number } | null> {
  const query = [parts.addressLine1, parts.postalCode, parts.city]
    .map((s) => (s ?? "").trim())
    .filter(Boolean)
    .join(" ");
  if (query.length < 3) return null;

  const results = await searchBanAddresses(query, { limit: 1 });
  if (results.length === 0) return null;
  return { latitude: results[0].latitude, longitude: results[0].longitude };
}
