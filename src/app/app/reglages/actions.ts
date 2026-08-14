"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { geocodeAddress } from "@/lib/geo/ban";
import {
  normalizePhone,
  normalizePostalCode,
  parseContactFieldsFromForm,
} from "@/lib/settings/contact-fields";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function updateArtisanSettings(formData: FormData) {
  const displayName = String(formData.get("display_name") ?? "").trim();
  if (!displayName) return { ok: false as const, error: "missing_name" as const };

  const contact = parseContactFieldsFromForm(formData);
  const phone = contact.phone ? normalizePhone(contact.phone) : null;
  if (contact.phone && !phone) return { ok: false as const, error: "invalid_phone" as const };

  const postal_code = contact.postal_code ? normalizePostalCode(contact.postal_code) : null;
  if (contact.postal_code && !postal_code) return { ok: false as const, error: "invalid_postal_code" as const };

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/app/reglages");

  const { data: profile } = await supabase.from("profiles").select("id").eq("user_id", user.id).maybeSingle();
  if (!profile?.id) return { ok: false as const, error: "save_failed" as const };

  // Coordonnées : d'abord celles figées par l'autocomplétion (champs cachés).
  // Sinon, si une adresse est saisie, on géocode côté serveur en dernier recours.
  const latRaw = String(formData.get("latitude") ?? "").trim();
  const lngRaw = String(formData.get("longitude") ?? "").trim();
  let latitude: number | null = latRaw ? Number(latRaw) : null;
  let longitude: number | null = lngRaw ? Number(lngRaw) : null;
  if (!Number.isFinite(latitude ?? NaN)) latitude = null;
  if (!Number.isFinite(longitude ?? NaN)) longitude = null;

  if ((latitude === null || longitude === null) && contact.address_line1) {
    const geo = await geocodeAddress({
      addressLine1: contact.address_line1,
      postalCode: postal_code,
      city: contact.city,
    });
    if (geo) {
      latitude = geo.latitude;
      longitude = geo.longitude;
    }
  }

  const contactPayload = {
    phone,
    address_line1: contact.address_line1,
    address_line2: contact.address_line2,
    postal_code,
    city: contact.city,
    latitude,
    longitude,
  };

  const { error: nameError } = await supabase.from("profiles").update({ name: displayName }).eq("id", profile.id);
  if (nameError) return { ok: false as const, error: "save_failed" as const };

  const { error: contactError } = await supabase.from("profiles").update(contactPayload).eq("id", profile.id);
  if (contactError) {
    // Colonnes coordonnées absentes si migration SQL non appliquée — le nom est quand même enregistré.
    const onlyName = !contact.phone && !contact.address_line1 && !contact.postal_code && !contact.city;
    if (!onlyName) return { ok: false as const, error: "save_failed" as const };
  }

  revalidatePath("/app/reglages");
  revalidatePath("/app");
  return { ok: true as const };
}

/** Interrupteur « je reçois des demandes d'estimation » (widget, tunnel public). */
export async function setLeadMatchingEnabled(enabled: boolean) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/app/reglages");

  const { data: profile } = await supabase.from("profiles").select("id").eq("user_id", user.id).maybeSingle();
  if (!profile?.id) return { ok: false as const, error: "save_failed" as const };

  const { error } = await supabase
    .from("profiles")
    .update({ lead_matching_enabled: enabled })
    .eq("id", profile.id);
  if (error) return { ok: false as const, error: "save_failed" as const };

  revalidatePath("/app/reglages");
  return { ok: true as const };
}
