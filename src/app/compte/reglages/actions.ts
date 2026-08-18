"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { joinPersonName } from "@/lib/contacts/display-name";
import {
  normalizePhone,
  normalizePostalCode,
  parseContactFieldsFromForm,
} from "@/lib/settings/contact-fields";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export async function updateCustomerSettings(formData: FormData) {
  const displayName = joinPersonName(
    String(formData.get("first_name") ?? formData.get("display_name") ?? "").trim(),
    String(formData.get("last_name") ?? "").trim(),
  );
  if (!displayName) return { ok: false as const, error: "missing_name" as const };

  const emailRaw = String(formData.get("email") ?? "").trim();
  const email = emailRaw || null;
  if (email && !isValidEmail(email)) return { ok: false as const, error: "invalid_email" as const };

  const contact = parseContactFieldsFromForm(formData);
  const phone = contact.phone ? normalizePhone(contact.phone) : null;
  if (contact.phone && !phone) return { ok: false as const, error: "invalid_phone" as const };

  const postal_code = contact.postal_code ? normalizePostalCode(contact.postal_code) : null;
  if (contact.postal_code && !postal_code) return { ok: false as const, error: "invalid_postal_code" as const };

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/compte/reglages");

  const payload = {
    user_id: user.id,
    display_name: displayName,
    email,
    phone,
    address_line1: contact.address_line1,
    address_line2: contact.address_line2,
    postal_code,
    city: contact.city,
  };

  const { data: existing } = await supabase.from("customer_profiles").select("id").eq("user_id", user.id).maybeSingle();

  const { error } = existing?.id
    ? await supabase.from("customer_profiles").update(payload).eq("id", existing.id)
    : await supabase.from("customer_profiles").insert(payload);

  if (error) return { ok: false as const, error: "save_failed" as const };

  revalidatePath("/compte/reglages");
  revalidatePath("/compte");
  return { ok: true as const };
}
