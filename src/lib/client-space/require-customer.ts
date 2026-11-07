import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { getCurrentUser, getRequestSupabase } from "@/lib/auth/session";

export type CustomerContext = {
  supabase: SupabaseClient;
  userId: string;
  email: string | null;
  displayName: string;
};

/**
 * Client connecté (pas un compte artisan) : l'espace client, son assistant et ses
 * mises en relation lui sont réservés.
 */
export async function requireCustomer(): Promise<{ ok: true; customer: CustomerContext } | { ok: false; error: "auth" | "not_customer" }> {
  const [supabase, user] = await Promise.all([getRequestSupabase(), getCurrentUser()]);
  if (!user) return { ok: false, error: "auth" };

  const [{ data: artisan }, { data: customer }] = await Promise.all([
    supabase.from("profiles").select("id").contains("account_user_ids", [user.id]).maybeSingle(),
    supabase.from("customer_profiles").select("display_name").eq("user_id", user.id).maybeSingle(),
  ]);
  if (artisan) return { ok: false, error: "not_customer" };

  return {
    ok: true,
    customer: {
      supabase,
      userId: user.id,
      email: user.email?.toLowerCase() ?? null,
      displayName: (customer?.display_name as string | undefined)?.trim() || "",
    },
  };
}

export type CustomerContactDetails = {
  phone: string | null;
  addressLabel: string | null;
  lat: number | null;
  lng: number | null;
};

/** Coordonnées d'intervention enregistrées (vide si migration 77 absente ou rien d'enregistré). */
export async function loadCustomerContactDetails(supabase: SupabaseClient, userId: string): Promise<CustomerContactDetails> {
  const { data } = await supabase
    .from("customer_contact_details")
    .select("phone, address_label, address_lat, address_lng")
    .eq("user_id", userId)
    .maybeSingle();
  return {
    phone: (data?.phone as string | null) ?? null,
    addressLabel: (data?.address_label as string | null) ?? null,
    lat: (data?.address_lat as number | null) ?? null,
    lng: (data?.address_lng as number | null) ?? null,
  };
}
