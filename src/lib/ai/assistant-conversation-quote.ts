import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { AssistantApiResponse } from "@/lib/ai/assistant-schema";
import type { AssistantPageContextPayload } from "@/lib/ai/assistant-page-context";
import {
  looksLikeQuoteForPageContext,
  looksLikeRejectPageContextCustomer,
} from "@/lib/ai/assistant-quote-intake";
import type { AiQuoteDraft } from "@/lib/ai/quote-draft-storage";
import { buildLeadQuoteDraft } from "@/lib/leads/build-lead-quote-draft";
import type { LeadQualification } from "@/lib/ai/qualify-lead-schema";

/**
 * Devis prérempli à partir de la conversation ouverte (lead qualifié Soline).
 * Uniquement si l’artisan le demande explicitement (« suite à cette demande », etc.).
 */
export async function tryConversationContextQuote(params: {
  supabase: SupabaseClient;
  profile: {
    id: string;
    business_name: string | null;
    description: string | null;
    labor_rate_per_hour: number | null;
  };
  pageContext: AssistantPageContextPayload | null;
  message: string;
  suggestions: string[];
}): Promise<AssistantApiResponse | null> {
  const { supabase, profile, pageContext, message, suggestions } = params;

  if (pageContext?.entityType !== "conversation" || !pageContext.entityId) return null;
  if (!looksLikeQuoteForPageContext(message) || looksLikeRejectPageContextCustomer(message)) {
    return null;
  }

  const conversationId = pageContext.entityId;

  const { data: match } = await supabase
    .from("lead_matches")
    .select("id, conversation_id, quote_draft, quote_draft_created")
    .eq("conversation_id", conversationId)
    .eq("artisan_id", profile.id)
    .maybeSingle();

  if (!match?.id) return null;

  let draft: AiQuoteDraft;

  if (match.quote_draft_created && match.quote_draft) {
    const stored = match.quote_draft as AiQuoteDraft;
    draft = {
      ...stored,
      draftKey: stored.draftKey ?? `lead-match:${match.id}`,
      source: "lead",
      leadMatchId: match.id,
    };
  } else {
    const { data: conv } = await supabase
      .from("conversations")
      .select("lead_id")
      .eq("id", conversationId)
      .eq("artisan_id", profile.id)
      .maybeSingle();

    if (!conv?.lead_id) return null;

    const { data: lead } = await supabase
      .from("leads")
      .select(
        "description, contact_name, contact_email, estimate_min, estimate_max, trade_category, trade, ai_qualification",
      )
      .eq("id", conv.lead_id)
      .maybeSingle();

    if (!lead?.description?.trim()) return null;

    draft = await buildLeadQuoteDraft({
      supabase,
      leadMatchId: match.id,
      artisanId: profile.id,
      profile,
      lead: {
        description: lead.description,
        contact_name: lead.contact_name,
        contact_email: lead.contact_email,
        estimate_min: lead.estimate_min,
        estimate_max: lead.estimate_max,
        trade_category: lead.trade_category,
        trade: lead.trade,
        ai_qualification: lead.ai_qualification as LeadQualification | null,
      },
    });
  }

  const customerName = draft.customerName ?? null;
  const urlParams = new URLSearchParams({
    aiDraft: "1",
    leadMatchId: match.id,
    conversationId,
  });

  let serviceTitles: string[] = [];
  if (draft.matchedServiceIds?.length) {
    const { data: svcRows } = await supabase
      .from("services")
      .select("title")
      .eq("artisan_id", profile.id)
      .in("id", draft.matchedServiceIds);
    serviceTitles = (svcRows ?? []).map((s) => s.title as string);
  }

  const laborHours =
    draft.laborDurationMinutes > 0
      ? Math.round((draft.laborDurationMinutes / 60) * 10) / 10
      : null;

  return {
    reply: `Brouillon prêt pour ${customerName ?? "ce client"} à partir de la demande qualifiée — vérifie les lignes.`,
    intent: "create_quote_draft",
    quoteIntake: null,
    action: {
      type: "open_quote_form",
      draftKey: draft.draftKey,
      href: `/app/quotes/new?${urlParams.toString()}`,
      preview: {
        customerName,
        customerMatched: true,
        serviceTitles,
        materialsCount: draft.supplierMaterials?.length ?? 0,
        laborHours,
        notes: draft.notes ?? "",
        warnings: draft.warnings ?? [],
      },
      draft,
    },
    suggestions,
  };
}
