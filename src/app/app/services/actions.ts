"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createSupabaseServerClient } from "@/lib/supabase/server";

function parseServiceFields(formData: FormData) {
  const title = String(formData.get("title") ?? "").trim();
  const duration = Number(formData.get("duration") ?? 0);
  const priceRaw = String(formData.get("price") ?? "").trim();

  if (!title || !Number.isFinite(duration) || duration <= 0) {
    return { ok: false as const, error: "invalid_fields" as const };
  }

  const price =
    priceRaw === ""
      ? null
      : Math.round(
          Number(
            priceRaw
              .replace(",", ".")
              .replace(/[^0-9.]/g, ""),
          ) * 100,
        );

  if (price != null && (!Number.isFinite(price) || price < 0)) {
    return { ok: false as const, error: "invalid_fields" as const };
  }

  return { ok: true as const, title, duration, price };
}

export async function createService(formData: FormData) {
  const parsed = parseServiceFields(formData);
  if (!parsed.ok) return parsed;

  const { title, duration, price } = parsed;

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/app/reglages?tab=prestations");

  const { data: profile } = await supabase
    .from("profiles")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!profile?.id) return { ok: false as const, error: "missing_profile" as const };

  const { error } = await supabase.from("services").insert({
    artisan_id: profile.id,
    title,
    duration,
    price,
  });

  if (error) return { ok: false as const, error: "insert_failed" as const };

  revalidatePath("/app/reglages");
  return { ok: true as const };
}

export async function updateService(formData: FormData) {
  const serviceId = String(formData.get("service_id") ?? "").trim();
  const parsed = parseServiceFields(formData);
  if (!serviceId || !parsed.ok) return { ok: false as const, error: "invalid_fields" as const };

  const { title, duration, price } = parsed;

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/app/reglages?tab=prestations");

  const { data: profile } = await supabase
    .from("profiles")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!profile?.id) return { ok: false as const, error: "missing_profile" as const };

  const { data: existing } = await supabase
    .from("services")
    .select("id")
    .eq("id", serviceId)
    .eq("artisan_id", profile.id)
    .maybeSingle();

  if (!existing) return { ok: false as const, error: "not_found" as const };

  const { error } = await supabase
    .from("services")
    .update({ title, duration, price })
    .eq("id", serviceId);

  if (error) return { ok: false as const, error: "update_failed" as const };

  revalidatePath("/app/reglages");
  return { ok: true as const };
}

export async function deleteService(formData: FormData) {
  const serviceId = String(formData.get("service_id") ?? "");
  if (!serviceId) return;

  const supabase = await createSupabaseServerClient();
  await supabase.from("services").delete().eq("id", serviceId);

  revalidatePath("/app/reglages");
  return;
}

