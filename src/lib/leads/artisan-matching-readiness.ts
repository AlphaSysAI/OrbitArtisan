/** Prérequis pour qu’un artisan soit proposé dans le tunnel /estimation (matching géo). */
export type ArtisanMatchingReadiness = {
  matchingEnabled: boolean;
  hasGeo: boolean;
  hasTrade: boolean;
  hasAddressText: boolean;
  ready: boolean;
  missing: ("matching_disabled" | "no_trade" | "no_address" | "no_geo")[];
};

export function getArtisanMatchingReadiness(input: {
  leadMatchingEnabled: boolean;
  trade: string | null;
  tradeCategory: string | null;
  addressLine1: string | null;
  postalCode: string | null;
  city: string | null;
  latitude: number | null;
  longitude: number | null;
}): ArtisanMatchingReadiness {
  const hasGeo =
    input.latitude != null &&
    input.longitude != null &&
    Number.isFinite(input.latitude) &&
    Number.isFinite(input.longitude);
  const hasTrade = !!(input.trade?.trim() || input.tradeCategory?.trim());
  const hasAddressText = !!(
    input.addressLine1?.trim() ||
    input.postalCode?.trim() ||
    input.city?.trim()
  );

  const missing: ArtisanMatchingReadiness["missing"] = [];
  if (!input.leadMatchingEnabled) missing.push("matching_disabled");
  if (!hasTrade) missing.push("no_trade");
  if (!hasAddressText) missing.push("no_address");
  if (hasAddressText && !hasGeo) missing.push("no_geo");

  return {
    matchingEnabled: input.leadMatchingEnabled,
    hasGeo,
    hasTrade,
    hasAddressText,
    ready: input.leadMatchingEnabled && hasTrade && hasGeo,
    missing,
  };
}
