"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireArtisanProfileId } from "@/lib/auth/require-artisan";
import { validateLegalEntityFields } from "@/lib/billing/legal-entity-validation";
import { geocodeAddress } from "@/lib/geo/ban";
import {
  analyzeQuoteDocument,
  buildImportReview,
  IMPORT_MAX_BYTES,
  type ImportReview,
} from "@/lib/onboarding/import-quotes";
import { isValidSiret } from "@/lib/onboarding/identifiers";
import type { VerifiedDocument } from "@/lib/onboarding/verify-extraction";
import { normalizePhone, normalizePostalCode } from "@/lib/settings/contact-fields";
import { logActivity } from "@/lib/telemetry/activity";

type AnalyzeResult = { ok: true; doc: VerifiedDocument } | { ok: false; error: "auth" | "too_large" | "unsupported_file" | "rate_limited" | "analysis_failed" };

/** Un fichier à la fois : progression visible, relance ciblée si le réseau du chantier coupe. */
export async function analyzeQuoteFileAction(formData: FormData): Promise<AnalyzeResult> {
  const auth = await requireArtisanProfileId();
  if (!auth.ok) return { ok: false, error: "auth" };

  // Garde-fou coût IA : 12 documents / 24 h / artisan.
  const since = new Date(Date.now() - 86_400_000).toISOString();
  const { count } = await auth.supabase
    .from("artisan_activity_events")
    .select("id", { count: "exact", head: true })
    .eq("artisan_id", auth.profileId)
    .eq("kind", "onboarding_import")
    .gte("created_at", since);
  if ((count ?? 0) >= 12) return { ok: false, error: "rate_limited" };

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "unsupported_file" };
  if (file.size > IMPORT_MAX_BYTES) return { ok: false, error: "too_large" };

  try {
    const doc = await analyzeQuoteDocument(new Uint8Array(await file.arrayBuffer()));
    void logActivity(auth.supabase, auth.profileId, "onboarding_import", { readable: doc.readable });
    return { ok: true, doc };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[onboarding import]", msg);
    return { ok: false, error: msg === "unsupported_file" ? "unsupported_file" : "analysis_failed" };
  }
}

export async function buildImportReviewAction(docs: VerifiedDocument[]): Promise<{ ok: true; review: ImportReview } | { ok: false }> {
  const auth = await requireArtisanProfileId();
  if (!auth.ok || !Array.isArray(docs) || docs.length === 0 || docs.length > 3) return { ok: false };
  try {
    return { ok: true, review: await buildImportReview(docs) };
  } catch (error) {
    console.error("[onboarding review]", error);
    return { ok: false };
  }
}

const saveSchema = z.object({
  fields: z.record(z.string(), z.string().max(300).nullable()),
  lines: z
    .array(
      z.object({
        label: z.string().min(2).max(200),
        unit: z.enum(["m²", "ml", "m³", "U", "forfait", "h", "jour"]).nullable(),
        unitPriceCents: z.number().int().min(0).max(10_000_000).nullable(),
        vatRate: z.union([z.literal(5.5), z.literal(10), z.literal(20)]).nullable(),
      }),
    )
    .max(60),
});

type SaveImportResult =
  | { ok: true; completed: boolean; missing: string[]; importedLines: number }
  | { ok: false; error: string; field?: string };

/**
 * Enregistre la revue : champs vérifiés + saisis par l'artisan, catalogue coché.
 * Tout est revalidé côté serveur (format SIRET/TVA, téléphone, CP…).
 */
export async function saveImportAction(input: z.infer<typeof saveSchema>): Promise<SaveImportResult> {
  const auth = await requireArtisanProfileId(["business_name"]);
  if (!auth.ok) return { ok: false, error: "auth" };
  const parsed = saveSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid_input" };
  const { supabase, profileId, userId } = auth;
  const f = (k: string) => parsed.data.fields[k]?.trim() || null;

  const siret = f("siret")?.replace(/\s/g, "") ?? null;
  if (siret && !isValidSiret(siret)) return { ok: false, error: "invalid_siret", field: "siret" };
  const legal = validateLegalEntityFields({
    siren: siret ? siret.slice(0, 9) : null,
    siret,
    vat_number: f("vat_number"),
    trade_register_number: f("trade_register"),
  });
  if (!legal.ok) return { ok: false, error: legal.error, field: legal.error.replace("invalid_", "") };

  const phone = f("phone") ? normalizePhone(f("phone")) : null;
  if (f("phone") && !phone) return { ok: false, error: "invalid_phone", field: "phone" };
  const postal = f("postal_code") ? normalizePostalCode(f("postal_code")) : null;
  if (f("postal_code") && !postal) return { ok: false, error: "invalid_postal_code", field: "postal_code" };
  const mediatorUrlRaw = f("mediator_url");
  const mediatorUrl = mediatorUrlRaw ? (/^https?:\/\//i.test(mediatorUrlRaw) ? mediatorUrlRaw : `https://${mediatorUrlRaw}`) : null;
  const days = f("payment_terms_days") !== null ? Math.round(Number(f("payment_terms_days"))) : null;
  if (days !== null && (!Number.isFinite(days) || days < 0 || days > 120)) {
    return { ok: false, error: "invalid_payment_terms", field: "payment_terms_days" };
  }

  const vatRegimeRaw = f("vat_regime");
  const vatRegime = vatRegimeRaw === "franchise" || vatRegimeRaw === "normal" ? vatRegimeRaw : null;
  if (!vatRegime) return { ok: false, error: "missing_vat_regime", field: "vat_regime" };

  const firstName = f("first_name");
  const lastName = f("last_name");
  const update: Record<string, unknown> = {
    first_name: firstName,
    last_name: lastName,
    name: [firstName, lastName].filter(Boolean).join(" ") || null,
    business_name: f("business_name") ?? (auth.profile.business_name as string),
    phone,
    address_line1: f("address_line1"),
    postal_code: postal,
    city: f("city"),
    siren: legal.fields.siren,
    siret: legal.fields.siret,
    vat_number: legal.fields.vat_number,
    trade_register_number: legal.fields.trade_register_number,
    decennale_insurer: f("decennale_insurer"),
    decennale_policy_number: f("decennale_policy_number"),
    decennale_coverage_area: f("decennale_coverage_area"),
    rc_pro_insurer: f("rc_pro_insurer"),
    rc_pro_number: f("rc_pro_number"),
    mediator_name: f("mediator_name"),
    mediator_url: mediatorUrl,
    default_payment_terms_days: days,
    vat_regime: vatRegime,
  };

  if (update.address_line1 && postal && update.city) {
    const geo = await geocodeAddress({ addressLine1: update.address_line1 as string, postalCode: postal, city: update.city as string });
    if (geo) Object.assign(update, { latitude: geo.latitude, longitude: geo.longitude });
  }

  // Jamais d'écrasement par du vide : une valeur déjà connue du profil est conservée.
  const { data: current } = await supabase.from("profiles").select(Object.keys(update).join(", ")).eq("id", profileId).single();
  const patch = Object.fromEntries(Object.entries(update).filter(([, v]) => v !== null && v !== ""));
  const mergedProfile: Record<string, unknown> = { ...(current as unknown as Record<string, unknown> | null), ...patch };
  const missing = Object.keys(update).filter(
    (k) =>
      !["latitude", "longitude", "name"].includes(k) &&
      // Franchise en base (293 B) : pas de n° de TVA exigé.
      !(k === "vat_number" && vatRegime === "franchise") &&
      (mergedProfile[k] === null || mergedProfile[k] === undefined || mergedProfile[k] === ""),
  );
  const completed = missing.length === 0;
  if (completed) patch.onboarding_completed_at = new Date().toISOString();

  const { error } = await supabase.from("profiles").update(patch).eq("id", profileId);
  if (error) return { ok: false, error: "save_failed" };

  // Catalogue → bibliothèque d'ouvrages (unités + TVA), sans doublon de libellé.
  let importedLines = 0;
  if (parsed.data.lines.length) {
    const { data: existing } = await supabase.from("work_items").select("title").eq("user_id", userId);
    const known = new Set((existing ?? []).map((w) => (w.title as string).trim().toLowerCase()));
    const rows = parsed.data.lines
      .filter((l) => !known.has(l.label.trim().toLowerCase()))
      .map((l) => ({
        user_id: userId,
        title: l.label.trim(),
        unit: l.unit ?? "U",
        unit_price_ht: (l.unitPriceCents ?? 0) / 100,
        default_vat_rate: l.vatRate ?? 20,
        reference: "import-devis",
      }));
    if (rows.length) {
      const { error: wErr } = await supabase.from("work_items").insert(rows);
      if (!wErr) importedLines = rows.length;
    }
  }

  // Le formulaire de devis exige au moins une prestation (main-d'œuvre) : on la crée
  // au taux horaire lu sur ses devis s'il existe, sinon « sur devis ».
  const { count: serviceCount } = await supabase.from("services").select("id", { count: "exact", head: true }).eq("artisan_id", profileId);
  if (!serviceCount) {
    const hourly = parsed.data.lines.find((l) => l.unit === "h" && l.unitPriceCents);
    await supabase.from("services").insert({
      artisan_id: profileId,
      title: "Main-d'œuvre",
      duration: 60,
      price: hourly?.unitPriceCents ?? null,
    });
    if (hourly?.unitPriceCents) {
      await supabase.from("profiles").update({ labor_rate_per_hour: hourly.unitPriceCents }).eq("id", profileId).is("labor_rate_per_hour", null);
    }
  }

  void logActivity(supabase, profileId, "onboarding_saved", { completed, importedLines });
  revalidatePath("/app");
  revalidatePath("/app/onboarding");
  revalidatePath("/app/reglages");
  return { ok: true, completed, missing, importedLines };
}
