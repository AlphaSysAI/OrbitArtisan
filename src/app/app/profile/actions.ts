"use server";

import { readPersonName } from "@/lib/profile/person-name";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role";
import { seedDefaultWorkLibraryForUser } from "@/lib/work-library/actions";
import { isValidTradeSelection } from "@/lib/trades/taxonomy";

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
  const { firstName, lastName, displayName: name } = readPersonName(formData);
  const description = String(formData.get("description") ?? "").trim();
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

  // Métier facultatif, mais s'il est renseigné il doit être cohérent :
  // le métier doit appartenir au secteur choisi.
  const tradeCategoryRaw = String(formData.get("trade_category") ?? "").trim();
  const tradeRaw = String(formData.get("trade") ?? "").trim();

  let trade_category: string | null = null;
  let trade: string | null = null;

  if (tradeCategoryRaw || tradeRaw) {
    if (!isValidTradeSelection(tradeCategoryRaw, tradeRaw)) {
      return { ok: false as const, error: "invalid_trade" as const };
    }
    trade_category = tradeCategoryRaw;
    trade = tradeRaw;
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login?next=/app/reglages?tab=activite");

  const { data: existing } = await supabase
    .from("profiles")
    .select("id, slug")
    .eq("user_id", user.id)
    .maybeSingle();

  if (existing && existing.slug !== slug) {
    // Les profils des autres artisans ne sont plus lisibles (migration 44) : contrôle en service role.
    const { data: slugTaken } = await (createSupabaseServiceRoleClient() ?? supabase)
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
    first_name: firstName || null,
    last_name: lastName || null,
    description: description || null,
    // logo_url : géré par uploadArtisanLogo / removeArtisanLogo (logo-actions.ts), jamais par ce formulaire.
    accent_color,
    labor_rate_per_hour,
    slug,
    trade_category,
    trade,
  };

  const meta = user.user_metadata as Record<string, unknown> | undefined;
  const registrationIp =
    typeof meta?.registration_ip === "string" ? meta.registration_ip.slice(0, 45) : null;
  const registrationRecordedAt =
    typeof meta?.registration_recorded_at === "string" ? meta.registration_recorded_at : null;

  if (existing?.id) {
    const { error } = await supabase.from("profiles").update(payload).eq("id", existing.id);
    if (error) return { ok: false as const, error: "update_failed" as const };
  } else {
    // Aucun essai sans carte : le compte démarre « incomplete » ; l'essai (Pro, Soline
    // comprise) commence avec l'abonnement Stripe (CB, 0 € aujourd'hui). Imposé aussi
    // par le trigger protect_profile_billing_columns.
    const { error } = await supabase.from("profiles").insert({
      ...payload,
      subscription_plan: "pro",
      subscription_status: "incomplete",
      trial_ends_at: null,
      registration_ip: registrationIp,
      registration_recorded_at: registrationRecordedAt,
    }).select("id").single();
    if (error) {
      // Cas courant: contrainte d'unicité du slug
      if (String(error.message).toLowerCase().includes("slug")) {
        return { ok: false as const, error: "slug_taken" as const };
      }
      return { ok: false as const, error: "insert_failed" as const };
    }

    await seedDefaultWorkLibraryForUser(user.id);

    // Pas de numéro Soline à l'inscription : il est acheté quand l'artisan enregistre
    // sa carte (abonnement Stripe en essai), jamais pour un compte sans moyen de paiement.
  }

  revalidatePath("/app");
  revalidatePath("/app/reglages");
  revalidatePath(`/site/${slug}`);

  return { ok: true as const, slug };
}

