"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isValidTradeSelection } from "@/lib/trades/taxonomy";

export type NearbyArtisan = {
  id: string;
  business_name: string;
  slug: string;
  trade_category: string | null;
  trade: string | null;
  city: string | null;
  postal_code: string | null;
  distance_km: number;
};

export type SearchNearbyResult =
  | { ok: true; artisans: NearbyArtisan[] }
  | { ok: false; error: "invalid_input" | "invalid_trade" | "search_failed" };

export async function searchArtisansNearby(input: {
  lat: number;
  lng: number;
  categoryId: string;
  tradeId: string;
  radiusKm?: number;
}): Promise<SearchNearbyResult> {
  const { lat, lng, categoryId, tradeId } = input;

  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return { ok: false, error: "invalid_input" };
  }
  if (!isValidTradeSelection(categoryId, tradeId)) {
    return { ok: false, error: "invalid_trade" };
  }

  const radiusKm = Math.min(Math.max(input.radiusKm ?? 50, 1), 100);

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("search_artisans_nearby", {
    p_lat: lat,
    p_lng: lng,
    p_trade: tradeId,
    p_radius_km: radiusKm,
    p_limit: 50,
  });

  if (error) return { ok: false, error: "search_failed" };

  const artisans: NearbyArtisan[] = (data ?? []).map((r: NearbyArtisan) => ({
    id: r.id,
    business_name: r.business_name,
    slug: r.slug,
    trade_category: r.trade_category,
    trade: r.trade,
    city: r.city,
    postal_code: r.postal_code,
    distance_km: Math.round((r.distance_km + Number.EPSILON) * 10) / 10,
  }));

  return { ok: true, artisans };
}
