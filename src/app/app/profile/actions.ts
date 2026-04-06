"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createSupabaseServerClient } from "@/lib/supabase/server";

function normalizeSlug(input: string) {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export async function upsertProfile(formData: FormData) {
  const businessName = String(formData.get("business_name") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const logoUrl = String(formData.get("logo_url") ?? "").trim();
  const accentRaw = String(formData.get("accent_color") ?? "").trim();
  const laborRateRaw = String(formData.get("labor_rate_per_hour") ?? "").trim();
  const slugRaw = String(formData.get("slug") ?? "");
  const slug = normalizeSlug(slugRaw);

  let accent_color: string | null = null;
  if (accentRaw) {
    if (!/^#[0-9A-Fa-f]{6}$/.test(accentRaw)) {
      return { ok: false as const, error: "invalid_accent" as const };
    }
    accent_color = accentRaw.toLowerCase();
  }

  let labor_rate_per_hour: number | null = null;
  if (laborRateRaw) {
    const parsed = Math.round(
      Number(
        laborRateRaw
          .replace(",", ".")
          .replace(/[^0-9.]/g, ""),
      ) * 100,
    );

    if (!Number.isFinite(parsed) || parsed < 0) {
      return { ok: false as const, error: "invalid_fields" as const };
    }
    labor_rate_per_hour = parsed;
  }

  if (!businessName || !slug) {
    return { ok: false as const, error: "missing_fields" as const };
  }
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    return { ok: false as const, error: "invalid_slug" as const };
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login?next=/app/profile");

  const { data: existing } = await supabase
    .from("profiles")
    .select("id, slug")
    .eq("user_id", user.id)
    .maybeSingle();

  if (existing && existing.slug !== slug) {
    const { data: slugTaken } = await supabase
      .from("profiles")
      .select("id")
      .eq("slug", slug)
      .maybeSingle();
    if (slugTaken) return { ok: false as const, error: "slug_taken" as const };
  }

  const payload = {
    user_id: user.id,
    business_name: businessName,
    name: name || null,
    description: description || null,
    logo_url: logoUrl || null,
    accent_color,
    labor_rate_per_hour,
    slug,
  };

  if (existing?.id) {
    const { error } = await supabase.from("profiles").update(payload).eq("id", existing.id);
    if (error) return { ok: false as const, error: "update_failed" as const };
  } else {
    const { error } = await supabase.from("profiles").insert(payload);
    if (error) {
      // Cas courant: contrainte d'unicité du slug
      if (String(error.message).toLowerCase().includes("slug")) {
        return { ok: false as const, error: "slug_taken" as const };
      }
      return { ok: false as const, error: "insert_failed" as const };
    }
  }

  revalidatePath("/app");
  revalidatePath("/app/profile");
  revalidatePath(`/site/${slug}`);

  return { ok: true as const, slug };
}

