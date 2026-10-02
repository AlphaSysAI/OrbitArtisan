"use server";

import { revalidatePath } from "next/cache";

import type { AiQuoteDraft } from "@/lib/ai/quote-draft-storage";
import { requireArtisanProfileId } from "@/lib/auth/require-artisan";
import { createQuoteFromAiDraft, normalizeVatRate } from "@/lib/quotes/create-quote-from-ai-draft";
import { sendQuoteByEmail } from "@/lib/quotes/send-quote-email";
import { mistralTranscribe } from "@/lib/ai/mistral";
import { computeDraftTotals } from "@/lib/quotes/create-quote-from-ai-draft";
import { applyQuotePatch } from "@/lib/quotes/voice-patch";
import { fillPricesFromLibrary, llmQuotePatch } from "@/lib/quotes/voice-patch-llm";
import { logActivity } from "@/lib/telemetry/activity";

export async function loadVoiceIntakeQuoteDraft(
  intakeId: string,
): Promise<{ ok: true; draft: AiQuoteDraft } | { ok: false; error: string }> {
  if (!intakeId?.trim()) return { ok: false, error: "missing_id" };

  const auth = await requireArtisanProfileId();
  if (!auth.ok) return { ok: false, error: auth.error === "auth" ? "auth" : "not_artisan" };
  const { supabase, profileId } = auth;

  const { data: intake, error } = await supabase
    .from("voice_call_intakes")
    .select("id, artisan_id, quote_draft, status, customer_name, customer_email")
    .eq("id", intakeId)
    .maybeSingle();

  if (error || !intake) return { ok: false, error: "not_found" };
  if (intake.artisan_id !== profileId) return { ok: false, error: "forbidden" };
  if (intake.status !== "pending_review") return { ok: false, error: "already_processed" };
  if (!intake.quote_draft) return { ok: false, error: "no_draft" };

  const draft = intake.quote_draft as AiQuoteDraft;
  if (draft?.version !== 1) return { ok: false, error: "invalid_draft" };

  return {
    ok: true,
    draft: {
      ...draft,
      draftKey: draft.draftKey ?? `voice-intake:${intakeId}`,
      source: "voice",
      customerName: draft.customerName ?? intake.customer_name,
      customerEmail: draft.customerEmail ?? intake.customer_email,
    },
  };
}

export async function validateVoiceIntakeQuote(
  intakeId: string,
  vatRate?: number,
): Promise<
  | { ok: true; quoteId: string; emailSent: boolean }
  | { ok: false; error: string; hint?: string }
> {
  if (!intakeId?.trim()) return { ok: false, error: "missing_id" };

  const auth = await requireArtisanProfileId(["business_name", "labor_rate_per_hour"]);
  if (!auth.ok) return { ok: false, error: auth.error === "auth" ? "auth" : "not_artisan" };
  const { supabase, profileId, profile } = auth;

  const laborRate = profile.labor_rate_per_hour as number | null;
  if (laborRate == null || laborRate < 0) {
    return {
      ok: false,
      error: "missing_labor_rate",
      hint: "Renseigne ton taux horaire dans Réglages avant de valider.",
    };
  }

  const { data: intake, error } = await supabase
    .from("voice_call_intakes")
    .select("id, artisan_id, quote_draft, status, customer_name, customer_email")
    .eq("id", intakeId)
    .maybeSingle();

  if (error || !intake) return { ok: false, error: "not_found" };
  if (intake.artisan_id !== profileId) return { ok: false, error: "forbidden" };
  if (intake.status !== "pending_review") return { ok: false, error: "already_processed" };

  const draft = intake.quote_draft as AiQuoteDraft | null;
  if (!draft?.version) return { ok: false, error: "no_draft" };

  const created = await createQuoteFromAiDraft({
    supabase,
    artisanId: profileId,
    draft,
    laborRatePerHourCents: laborRate,
    status: "sent",
    customerName: intake.customer_name,
    customerEmail: intake.customer_email,
    vatRate: normalizeVatRate(vatRate ?? 20),
  });

  if (!created.ok) {
    const hints: Record<string, string> = {
      missing_services: "Aucune prestation associée — utilise « Éditer » pour compléter le devis.",
      missing_email: "Email client manquant.",
      invalid_services: "Prestations invalides — édite le devis.",
      invalid_duration: "Durée de main-d'œuvre invalide — édite le devis.",
      invalid_materials: "Matériaux invalides — édite le devis.",
    };
    return {
      ok: false,
      error: created.error,
      hint: hints[created.error] ?? "Complète le devis via « Éditer » puis réessaie.",
    };
  }

  const emailResult = await sendQuoteByEmail({
    supabase,
    quoteId: created.quoteId,
    artisanId: profileId,
    to: String(intake.customer_email ?? draft.customerEmail ?? ""),
    customerName: intake.customer_name ?? draft.customerName,
    businessName: profile.business_name as string | null,
    grandTotalCents: created.grandTotalCents,
  });

  const { error: updateErr } = await supabase
    .from("voice_call_intakes")
    .update({
      status: "validated",
      quote_id: created.quoteId,
    })
    .eq("id", intakeId)
    .eq("artisan_id", profileId);

  if (updateErr) {
    return { ok: false, error: "update_failed" };
  }

  void logActivity(supabase, profileId, "intake_validated", { quoteId: created.quoteId });
  revalidatePath("/app/appels");
  revalidatePath("/app/quotes");
  revalidatePath(`/app/quotes/${created.quoteId}`);

  return {
    ok: true,
    quoteId: created.quoteId,
    emailSent: emailResult.ok,
  };
}

export async function dismissVoiceIntake(intakeId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!intakeId?.trim()) return { ok: false, error: "missing_id" };

  const auth = await requireArtisanProfileId();
  if (!auth.ok) return { ok: false, error: auth.error === "auth" ? "auth" : "not_artisan" };
  const { supabase, profileId } = auth;

  const now = new Date().toISOString();
  const { error } = await supabase
    .from("voice_call_intakes")
    .update({ status: "dismissed", archived_at: now, read_at: now })
    .eq("id", intakeId)
    .eq("artisan_id", profileId)
    .eq("status", "pending_review");

  if (error) return { ok: false, error: "update_failed" };

  void logActivity(supabase, profileId, "intake_rejected");
  revalidatePath("/app/appels");
  return { ok: true };
}

type SimpleResult = { ok: true } | { ok: false; error: string };

/** Range un appel déjà traité (devis créé). Un appel à traiter se « classe sans suite ». */
export async function archiveVoiceIntake(intakeId: string): Promise<SimpleResult> {
  if (!intakeId?.trim()) return { ok: false, error: "missing_id" };
  const auth = await requireArtisanProfileId();
  if (!auth.ok) return { ok: false, error: auth.error === "auth" ? "auth" : "not_artisan" };
  const { supabase, profileId } = auth;

  const now = new Date().toISOString();
  const { error } = await supabase
    .from("voice_call_intakes")
    .update({ archived_at: now, read_at: now })
    .eq("id", intakeId)
    .eq("artisan_id", profileId)
    .neq("status", "pending_review")
    .is("archived_at", null);

  if (error) return { ok: false, error: "update_failed" };
  revalidatePath("/app/appels");
  return { ok: true };
}

/**
 * Sort un appel des archives. Un appel classé sans suite redevient « à traiter »
 * (l'artisan change d'avis) ; un appel avec devis retourne dans l'onglet Devis.
 */
export async function restoreVoiceIntake(intakeId: string): Promise<SimpleResult> {
  if (!intakeId?.trim()) return { ok: false, error: "missing_id" };
  const auth = await requireArtisanProfileId();
  if (!auth.ok) return { ok: false, error: auth.error === "auth" ? "auth" : "not_artisan" };
  const { supabase, profileId } = auth;

  const { data: intake } = await supabase
    .from("voice_call_intakes")
    .select("id, status")
    .eq("id", intakeId)
    .eq("artisan_id", profileId)
    .maybeSingle();
  if (!intake) return { ok: false, error: "not_found" };

  const patch: { archived_at: null; status?: "pending_review" } = { archived_at: null };
  if (intake.status === "dismissed") patch.status = "pending_review";

  const { error } = await supabase
    .from("voice_call_intakes")
    .update(patch)
    .eq("id", intakeId)
    .eq("artisan_id", profileId);

  if (error) return { ok: false, error: "update_failed" };
  revalidatePath("/app/appels");
  return { ok: true };
}

/** Marque le résumé comme lu (premier dépliage). Idempotent, silencieux. */
export async function markVoiceIntakeRead(intakeId: string): Promise<SimpleResult> {
  if (!intakeId?.trim()) return { ok: false, error: "missing_id" };
  const auth = await requireArtisanProfileId();
  if (!auth.ok) return { ok: false, error: auth.error === "auth" ? "auth" : "not_artisan" };
  const { supabase, profileId } = auth;

  const { error } = await supabase
    .from("voice_call_intakes")
    .update({ read_at: new Date().toISOString() })
    .eq("id", intakeId)
    .eq("artisan_id", profileId)
    .is("read_at", null);

  return error ? { ok: false, error: "update_failed" } : { ok: true };
}

type VoiceCorrectionResult =
  | { ok: true; transcript: string; changes: string[]; warnings: string[] }
  | { ok: false; error: "auth" | "not_found" | "not_editable" | "audio_invalid" | "empty" | "transcription_failed" | "patch_failed" };

const AUDIO_MAX_BYTES = 4 * 1024 * 1024;

async function patchIntakeDraft(intakeId: string, instruction: string): Promise<VoiceCorrectionResult> {
  const auth = await requireArtisanProfileId(["labor_rate_per_hour"]);
  if (!auth.ok) return { ok: false, error: "auth" };
  const { supabase, profileId, userId, profile } = auth;

  const { data: intake } = await supabase
    .from("voice_call_intakes")
    .select("id, status, quote_draft")
    .eq("id", intakeId)
    .eq("artisan_id", profileId)
    .maybeSingle();
  if (!intake?.quote_draft) return { ok: false, error: "not_found" };
  if (intake.status !== "pending_review") return { ok: false, error: "not_editable" };

  const draft = intake.quote_draft as AiQuoteDraft;
  const rate = (profile.labor_rate_per_hour as number | null) ?? null;
  const { data: services } = await supabase.from("services").select("id, duration").eq("artisan_id", profileId);
  const durations = new Map((services ?? []).map((s) => [s.id as string, (s.duration as number) ?? 0]));
  const totals = computeDraftTotals(draft, rate, durations);

  let patch;
  try {
    patch = await llmQuotePatch(draft, instruction, {
      hours: Math.round(((totals?.laborDurationMinutes ?? draft.laborDurationMinutes) / 60) * 100) / 100,
      totalEur: totals ? totals.laborTotalCents / 100 : null,
    });
  } catch (error) {
    console.error("[voice patch]", error instanceof Error ? error.message : error);
    return { ok: false, error: "patch_failed" };
  }
  const libraryNotes = await fillPricesFromLibrary(supabase, userId, patch);
  const applied = applyQuotePatch(draft, patch, {
    newId: () => crypto.randomUUID(),
    laborRatePerHourCents: rate,
    currentLaborTotalCents: totals?.laborTotalCents ?? null,
  });

  if (applied.changes.length) {
    const { error } = await supabase
      .from("voice_call_intakes")
      .update({ quote_draft: applied.draft, read_at: new Date().toISOString() })
      .eq("id", intakeId)
      .eq("status", "pending_review");
    if (error) return { ok: false, error: "patch_failed" };
    revalidatePath("/app/appels");
  }
  void logActivity(supabase, profileId, "voice_patch", { changes: applied.changes.length, warnings: applied.warnings.length });
  return {
    ok: true,
    transcript: instruction,
    changes: applied.changes,
    warnings: [...libraryNotes, ...applied.warnings.filter((w) => !libraryNotes.some((n) => w.includes(n.split(" : ")[0]!)))],
  };
}

/** « Modifier au micro » : vocal court → transcription → opérations → devis mis à jour. */
export async function correctVoiceIntakeByAudio(intakeId: string, formData: FormData): Promise<VoiceCorrectionResult> {
  const audio = formData.get("audio");
  if (!(audio instanceof File) || audio.size < 1000 || audio.size > AUDIO_MAX_BYTES || !audio.type.startsWith("audio/")) {
    return { ok: false, error: "audio_invalid" };
  }
  let text: string;
  try {
    text = await mistralTranscribe(audio, audio.name || "consigne.webm");
  } catch (error) {
    console.error("[voice patch] transcription", error instanceof Error ? error.message : error);
    return { ok: false, error: "transcription_failed" };
  }
  if (text.length < 3) return { ok: false, error: "empty" };
  return patchIntakeDraft(intakeId, text);
}

/** Même correction, tapée au clavier (bruit de chantier, micro refusé). */
export async function correctVoiceIntakeByText(intakeId: string, text: string): Promise<VoiceCorrectionResult> {
  const t = text.trim();
  if (t.length < 3 || t.length > 1500) return { ok: false, error: "empty" };
  return patchIntakeDraft(intakeId, t);
}

/** Annule la dernière correction (un niveau). */
export async function undoVoiceIntakeCorrection(intakeId: string): Promise<{ ok: boolean }> {
  const auth = await requireArtisanProfileId();
  if (!auth.ok) return { ok: false };
  const { data: intake } = await auth.supabase
    .from("voice_call_intakes")
    .select("quote_draft, status")
    .eq("id", intakeId)
    .eq("artisan_id", auth.profileId)
    .maybeSingle();
  const previous = (intake?.quote_draft as AiQuoteDraft | null)?.previous;
  if (!previous || intake?.status !== "pending_review") return { ok: false };
  const { error } = await auth.supabase
    .from("voice_call_intakes")
    .update({ quote_draft: { ...previous, previous: null } })
    .eq("id", intakeId)
    .eq("status", "pending_review");
  revalidatePath("/app/appels");
  return { ok: !error };
}
