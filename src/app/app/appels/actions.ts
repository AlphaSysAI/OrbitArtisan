"use server";

import { revalidatePath } from "next/cache";

import type { AiQuoteDraft } from "@/lib/ai/quote-draft-storage";
import { createQuoteFromAiDraft } from "@/lib/quotes/create-quote-from-ai-draft";
import { sendQuoteByEmail } from "@/lib/quotes/send-quote-email";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function loadVoiceIntakeQuoteDraft(
  intakeId: string,
): Promise<{ ok: true; draft: AiQuoteDraft } | { ok: false; error: string }> {
  if (!intakeId?.trim()) return { ok: false, error: "missing_id" };

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "auth" };

  const { data: profile } = await supabase.from("profiles").select("id").eq("user_id", user.id).maybeSingle();
  if (!profile?.id) return { ok: false, error: "not_artisan" };

  const { data: intake, error } = await supabase
    .from("voice_call_intakes")
    .select("id, artisan_id, quote_draft, status, customer_name, customer_email")
    .eq("id", intakeId)
    .maybeSingle();

  if (error || !intake) return { ok: false, error: "not_found" };
  if (intake.artisan_id !== profile.id) return { ok: false, error: "forbidden" };
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
): Promise<
  | { ok: true; quoteId: string; emailSent: boolean }
  | { ok: false; error: string; hint?: string }
> {
  if (!intakeId?.trim()) return { ok: false, error: "missing_id" };

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "auth" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, business_name, labor_rate_per_hour")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!profile?.id) return { ok: false, error: "not_artisan" };

  const laborRate = profile.labor_rate_per_hour;
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
  if (intake.artisan_id !== profile.id) return { ok: false, error: "forbidden" };
  if (intake.status !== "pending_review") return { ok: false, error: "already_processed" };

  const draft = intake.quote_draft as AiQuoteDraft | null;
  if (!draft?.version) return { ok: false, error: "no_draft" };

  const created = await createQuoteFromAiDraft({
    supabase,
    artisanId: profile.id,
    draft,
    laborRatePerHourCents: laborRate,
    status: "sent",
    customerName: intake.customer_name,
    customerEmail: intake.customer_email,
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
    to: String(intake.customer_email ?? draft.customerEmail ?? ""),
    customerName: intake.customer_name ?? draft.customerName,
    businessName: profile.business_name,
    quotePublicToken: created.publicToken,
    grandTotalCents: created.grandTotalCents,
  });

  const { error: updateErr } = await supabase
    .from("voice_call_intakes")
    .update({
      status: "validated",
      quote_id: created.quoteId,
    })
    .eq("id", intakeId)
    .eq("artisan_id", profile.id);

  if (updateErr) {
    return { ok: false, error: "update_failed" };
  }

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

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "auth" };

  const { data: profile } = await supabase.from("profiles").select("id").eq("user_id", user.id).maybeSingle();
  if (!profile?.id) return { ok: false, error: "not_artisan" };

  const { error } = await supabase
    .from("voice_call_intakes")
    .update({ status: "dismissed" })
    .eq("id", intakeId)
    .eq("artisan_id", profile.id)
    .eq("status", "pending_review");

  if (error) return { ok: false, error: "update_failed" };

  revalidatePath("/app/appels");
  return { ok: true };
}
