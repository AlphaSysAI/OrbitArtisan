import "server-only";

import { buildLeadQuoteDraft } from "@/lib/leads/build-lead-quote-draft";
import type { LeadQualification } from "@/lib/ai/qualify-lead-schema";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role";

type LeadRow = {
  id: string;
  description: string;
  contact_name: string | null;
  contact_email: string | null;
  estimate_min: number | null;
  estimate_max: number | null;
  trade_category: string | null;
  trade: string | null;
  ai_qualification: LeadQualification | null;
};

type MatchRow = {
  id: string;
  artisan_id: string;
  conversation_id: string | null;
  quote_draft_created: boolean;
};

/**
 * Génère un seul brouillon IA par lead et le réplique sur les matchs déjà
 * dispatchés. Appelé en arrière-plan après l'envoi au client.
 */
export async function fillLeadQuoteDrafts(token: string): Promise<void> {
  const admin = createSupabaseServiceRoleClient();
  if (!admin) {
    console.error("[fill-lead-quote-drafts] SUPABASE_SERVICE_ROLE_KEY manquante");
    return;
  }

  const { data: lead, error: leadError } = await admin
    .from("leads")
    .select(
      "id, description, contact_name, contact_email, estimate_min, estimate_max, trade_category, trade, ai_qualification",
    )
    .eq("public_token", token)
    .maybeSingle();

  if (leadError || !lead) {
    console.error("[fill-lead-quote-drafts] lead", leadError?.message);
    return;
  }

  const leadRow = lead as LeadRow;

  const { data: matches, error: matchError } = await admin
    .from("lead_matches")
    .select("id, artisan_id, conversation_id, quote_draft_created")
    .eq("lead_id", leadRow.id)
    .not("conversation_id", "is", null)
    .eq("quote_draft_created", false)
    .order("rank", { ascending: true });

  if (matchError || !matches?.length) return;

  const pending = matches as MatchRow[];
  const first = pending[0];

  const { data: profile } = await admin
    .from("profiles")
    .select("id, business_name, description, labor_rate_per_hour")
    .eq("id", first.artisan_id)
    .maybeSingle();

  if (!profile?.id) return;

  let sharedDraft: Awaited<ReturnType<typeof buildLeadQuoteDraft>> | null = null;
  try {
    sharedDraft = await buildLeadQuoteDraft({
      supabase: admin,
      leadMatchId: first.id,
      artisanId: profile.id,
      profile: {
        business_name: profile.business_name,
        description: profile.description,
        labor_rate_per_hour: profile.labor_rate_per_hour,
      },
      lead: {
        description: leadRow.description,
        contact_name: leadRow.contact_name,
        contact_email: leadRow.contact_email,
        estimate_min: leadRow.estimate_min,
        estimate_max: leadRow.estimate_max,
        trade_category: leadRow.trade_category,
        trade: leadRow.trade,
        ai_qualification: leadRow.ai_qualification,
      },
    });
  } catch (err) {
    console.error("[fill-lead-quote-drafts] build", err instanceof Error ? err.message : err);
    return;
  }

  if (!sharedDraft) return;

  for (const match of pending) {
    const draftForMatch = {
      ...sharedDraft,
      draftKey: `lead-match:${match.id}`,
      leadMatchId: match.id,
    };

    const { error } = await admin
      .from("lead_matches")
      .update({
        quote_draft: draftForMatch,
        quote_draft_created: true,
      })
      .eq("id", match.id)
      .eq("quote_draft_created", false);

    if (error) console.error("[fill-lead-quote-drafts] update", match.id, error.message);
  }
}
