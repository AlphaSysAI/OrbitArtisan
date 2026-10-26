import "server-only";

import { cache } from "react";

import { getCurrentUser, getRequestSupabase } from "@/lib/auth/session";

export type CurrentReferrer = {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  business_name: string;
  siren: string;
  siret: string | null;
  address_line1: string;
  address_line2: string | null;
  postal_code: string;
  city: string;
  vat_regime: "normal" | "franchise";
  vat_number: string | null;
  status: "active" | "suspended";
  created_at: string;
};

export const REFERRER_COLUMNS =
  "id, first_name, last_name, email, phone, business_name, siren, siret, address_line1, address_line2, postal_code, city, vat_regime, vat_number, status, created_at";

/** Fiche apporteur de l'utilisateur connecté (RLS : sa propre ligne uniquement), une fois par requête. */
export const getCurrentReferrer = cache(async (): Promise<CurrentReferrer | null> => {
  const user = await getCurrentUser();
  if (!user) return null;
  const supabase = await getRequestSupabase();
  const { data, error } = await supabase.from("business_referrers").select(REFERRER_COLUMNS).eq("user_id", user.id).maybeSingle();
  if (error) console.error("[referrer] lecture de la fiche", error.code, error.message);
  return (data as CurrentReferrer | null) ?? null;
});
