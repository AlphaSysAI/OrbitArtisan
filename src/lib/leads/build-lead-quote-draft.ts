import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { buildQuoteFromText } from "@/lib/ai/build-quote-from-text";
import type { LeadQualification } from "@/lib/ai/qualify-lead-schema";
import { mapApiResponseToDraft } from "@/lib/ai/map-quote-draft-core";
import type { AiQuoteDraft } from "@/lib/ai/quote-draft-storage";
import { findTrade, findTradeCategory } from "@/lib/trades/taxonomy";

type ServiceRow = { id: string; title: string; duration: number; price: number | null };

/**
 * Brouillon de devis prérempli à partir d'un lead qualifié.
 * Réutilise le pipeline de chiffrage IA existant (buildQuoteFromText).
 */
export async function buildLeadQuoteDraft(params: {
  supabase: SupabaseClient;
  leadMatchId: string;
  artisanId: string;
  profile: {
    business_name: string | null;
    description: string | null;
    labor_rate_per_hour: number | null;
  };
  lead: {
    description: string;
    contact_name: string | null;
    contact_email: string | null;
    estimate_min: number | null;
    estimate_max: number | null;
    trade_category: string | null;
    trade: string | null;
    ai_qualification: LeadQualification | null;
  };
}): Promise<AiQuoteDraft> {
  const { data: services } = await params.supabase
    .from("services")
    .select("id, title, duration, price")
    .eq("artisan_id", params.artisanId)
    .order("title", { ascending: true });

  const serviceList = (services ?? []) as ServiceRow[];
  const category = findTradeCategory(params.lead.trade_category);
  const trade = findTrade(params.lead.trade_category, params.lead.trade);
  const q = params.lead.ai_qualification;

  const estimateLine =
    params.lead.estimate_min != null && params.lead.estimate_max != null
      ? `Fourchette indicative déjà communiquée au client : ${params.lead.estimate_min}–${params.lead.estimate_max} € (non engageante).`
      : "";

  const instruction = [
    `Demande qualifiée reçue via Soline.`,
    category || trade ? `Métier : ${[category?.label, trade?.label].filter(Boolean).join(" · ")}.` : "",
    q?.need_summary ? `Besoin : ${q.need_summary}` : `Besoin : ${params.lead.description}`,
    q?.technical_elements?.length ? `Éléments techniques : ${q.technical_elements.join(", ")}.` : "",
    q?.estimated_hours_min && q?.estimated_hours_max
      ? `Temps estimé : ${q.estimated_hours_min} à ${q.estimated_hours_max} h.`
      : "",
    estimateLine,
    "Prépare un brouillon de devis à valider après visite ou diagnostic.",
  ]
    .filter(Boolean)
    .join("\n");

  const warnings: string[] = [
    "Généré depuis une demande qualifiée IA — estimation indicative, à confirmer après visite/diagnostic.",
  ];

  let quoteData: Awaited<ReturnType<typeof buildQuoteFromText>>;
  try {
    quoteData = await buildQuoteFromText({
      supabase: params.supabase,
      instruction,
      profile: params.profile,
      services: serviceList,
      customerLabel: params.lead.contact_name,
    });
    warnings.push(...(quoteData.warnings ?? []));
  } catch (err) {
    console.error("[lead-quote-draft] IA indisponible", err instanceof Error ? err.message : err);
    // Repli minimal : l'artisan complète à la main.
    quoteData = {
      labor_items: [],
      catalog_service_titles: [],
      matched_service_ids: [],
      labor_duration_minutes: q
        ? Math.round(((q.estimated_hours_min + q.estimated_hours_max) / 2) * 60)
        : 0,
      notes: [
        q?.need_summary ?? params.lead.description,
        estimateLine,
        "Estimation indicative — à confirmer après visite ou diagnostic.",
      ]
        .filter(Boolean)
        .join("\n\n")
        .slice(0, 500),
      supplier_materials: [],
      warnings: [],
    };
  }

  const draftKey = `lead-match:${params.leadMatchId}`;
  const draft = mapApiResponseToDraft(draftKey, quoteData, {
    customerName: params.lead.contact_name,
    customerEmail: params.lead.contact_email,
  });

  return {
    ...draft,
    draftKey,
    warnings,
    source: "lead",
    leadMatchId: params.leadMatchId,
    estimateMin: params.lead.estimate_min,
    estimateMax: params.lead.estimate_max,
  };
}
