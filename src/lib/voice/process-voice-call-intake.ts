import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { buildQuoteFromText } from "@/lib/ai/build-quote-from-text";
import { mapApiResponseToDraft } from "@/lib/ai/map-quote-draft-core";
import type { AiQuoteDraft } from "@/lib/ai/quote-draft-storage";

import { notifyVoiceIntake } from "@/lib/notifications/notify-events";

import { summarizeCallTranscript } from "./summarize-call-transcript";

type ServiceRow = { id: string; title: string; duration: number; price: number | null };

export type VoiceCallIntakeResult = {
  intakeId: string;
  summary: string;
  draft: AiQuoteDraft;
  message: string;
};

/**
 * Traite un appel vocal : résumé + brouillon de devis IA, persisté en base.
 */
export async function processVoiceCallQuoteIntake(params: {
  db: SupabaseClient;
  artisanId: string;
  body: Record<string, unknown>;
  callerNumber: string | null;
  calledNumber: string;
}): Promise<VoiceCallIntakeResult | { error: string }> {
  const customerName = String(params.body.customer_name ?? "").trim() || null;
  const customerEmail = String(params.body.customer_email ?? "").trim() || null;
  const transcript = String(
    params.body.transcript ?? params.body.work_description ?? params.body.instruction ?? "",
  ).trim();
  const twilioCallSid = String(params.body.twilio_call_sid ?? params.body.call_sid ?? "").trim() || null;

  if (!transcript) {
    return { error: "Transcript ou description des travaux manquante." };
  }
  if (!customerEmail) {
    return { error: "Email client manquant (customer_email requis pour envoyer le devis)." };
  }

  // Point 14 audit pré-pilote — dédup obligatoire côté serveur, indépendante de
  // l'agent vocal : la contrainte UNIQUE sur twilio_call_sid ne protège que si
  // l'agent ElevenLabs transmet bien cet identifiant (config externe, non
  // vérifiable depuis le code) — deux NULL ne sont jamais égaux pour Postgres,
  // donc sans SID la table n'empêcherait aucun doublon. Filet de sécurité :
  // même artisan + même email client dans les 2 dernières minutes = rejeu
  // probable (retry réseau, double appel outil), pas un nouveau besoin. Ce
  // contrôle tourne AVANT les appels IA pour éviter de payer la latence
  // Mistral/embeddings sur un doublon qu'on va de toute façon rejeter.
  if (!twilioCallSid) {
    const dedupWindowStart = new Date(Date.now() - 2 * 60 * 1000).toISOString();
    const { data: recentDuplicate } = await params.db
      .from("voice_call_intakes")
      .select("id, summary, quote_draft")
      .eq("artisan_id", params.artisanId)
      .eq("customer_email", customerEmail)
      .gte("created_at", dedupWindowStart)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (recentDuplicate?.id) {
      return {
        intakeId: recentDuplicate.id as string,
        summary: (recentDuplicate.summary as string) ?? "Appel déjà enregistré.",
        draft: recentDuplicate.quote_draft as AiQuoteDraft,
        message: "Proposition de devis déjà enregistrée pour cet appel (doublon détecté sans identifiant Twilio).",
      };
    }
  }

  const { data: profile } = await params.db
    .from("profiles")
    .select("id, business_name, description, labor_rate_per_hour")
    .eq("id", params.artisanId)
    .maybeSingle();

  if (!profile) {
    return { error: "Artisan introuvable." };
  }

  const { data: services } = await params.db
    .from("services")
    .select("id, title, duration, price")
    .eq("artisan_id", params.artisanId)
    .order("title", { ascending: true });

  const serviceList = (services ?? []) as ServiceRow[];
  if (!serviceList.length) {
    return { error: "Aucune prestation configurée pour cet artisan." };
  }

  const [summary, quoteData] = await Promise.all([
    summarizeCallTranscript(transcript),
    buildQuoteFromText({
      supabase: params.db,
      instruction: [
        `Appel téléphonique reçu par la secrétaire IA Soline.`,
        customerName ? `Client : ${customerName}.` : "",
        `Email client : ${customerEmail}.`,
        params.callerNumber ? `Téléphone appelant : ${params.callerNumber}.` : "",
        "",
        "Transcription / besoin exprimé :",
        transcript,
        "",
        "Prépare un brouillon de devis à valider par l'artisan avant envoi au client.",
      ]
        .filter(Boolean)
        .join("\n"),
      profile: {
        business_name: profile.business_name,
        description: profile.description,
        labor_rate_per_hour: profile.labor_rate_per_hour,
      },
      services: serviceList,
      customerLabel: customerName,
    }).catch((err) => {
      console.error("[voice-quote-draft] buildQuoteFromText", err instanceof Error ? err.message : err);
      return null;
    }),
  ]);

  const warnings: string[] = [
    "Proposition générée depuis un appel Soline — à valider ou éditer avant envoi au client.",
  ];

  let draft: AiQuoteDraft;
  if (quoteData) {
    warnings.push(...(quoteData.warnings ?? []));
    draft = mapApiResponseToDraft(`voice-intake:pending`, quoteData, {
      customerName,
      customerEmail,
    });
  } else {
    draft = {
      version: 1,
      draftKey: "voice-intake:pending",
      generatedAt: new Date().toISOString(),
      matchedServiceIds: [],
      laborDurationMinutes: 0,
      notes: transcript.slice(0, 500),
      supplierMaterials: [],
      warnings,
      customerName,
      customerEmail,
    };
  }

  draft = {
    ...draft,
    warnings,
    source: "voice",
    customerName,
    customerEmail,
  };

  const insertPayload: Record<string, unknown> = {
    artisan_id: params.artisanId,
    from_number: params.callerNumber,
    to_number: params.calledNumber,
    customer_name: customerName,
    customer_email: customerEmail,
    transcript,
    summary,
    quote_draft: draft,
    status: "pending_review",
  };

  if (twilioCallSid) {
    insertPayload.twilio_call_sid = twilioCallSid;
  }

  const { data: intake, error } = await params.db
    .from("voice_call_intakes")
    .insert(insertPayload)
    .select("id")
    .single();

  if (error || !intake?.id) {
    if (error?.code === "23505" && twilioCallSid) {
      const { data: existing } = await params.db
        .from("voice_call_intakes")
        .select("id, summary, quote_draft")
        .eq("twilio_call_sid", twilioCallSid)
        .maybeSingle();
      if (existing?.id) {
        return {
          intakeId: existing.id as string,
          summary: (existing.summary as string) ?? summary,
          draft: existing.quote_draft as AiQuoteDraft,
          message: "Proposition de devis déjà enregistrée pour cet appel.",
        };
      }
    }
    return { error: error?.message ?? "Erreur lors de l'enregistrement de l'appel." };
  }

  const intakeId = intake.id as string;
  draft = { ...draft, draftKey: `voice-intake:${intakeId}` };

  await params.db.from("voice_call_intakes").update({ quote_draft: draft }).eq("id", intakeId);

  void notifyVoiceIntake(params.db, {
    artisanId: params.artisanId,
    intakeId,
    customerName,
  });

  return {
    intakeId,
    summary,
    draft,
    message: `Proposition de devis enregistrée pour ${customerName ?? customerEmail}. L'artisan la validera avant envoi.`,
  };
}
