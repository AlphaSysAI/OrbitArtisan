import { geocodeAddress } from "@/lib/geo/ban";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Si l’artisan a une adresse textuelle mais pas de coordonnées GPS, on géocode
 * côté serveur pour qu’il soit éligible au matching /estimation.
 */
export async function backfillArtisanGeocode(profileId: string): Promise<boolean> {
  const supabase = await createSupabaseServerClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("address_line1, postal_code, city, latitude, longitude")
    .eq("id", profileId)
    .maybeSingle();

  if (!profile) return false;
  if (profile.latitude != null && profile.longitude != null) return false;

  const hasAddress =
    profile.address_line1?.trim() || profile.postal_code?.trim() || profile.city?.trim();
  if (!hasAddress) return false;

  const geo = await geocodeAddress({
    addressLine1: profile.address_line1,
    postalCode: profile.postal_code,
    city: profile.city,
  });
  if (!geo) return false;

  const { error } = await supabase
    .from("profiles")
    .update({ latitude: geo.latitude, longitude: geo.longitude })
    .eq("id", profileId);

  return !error;
}
