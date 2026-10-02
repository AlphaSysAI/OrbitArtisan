import "server-only";

import { buildLeadQuoteDraft } from "@/lib/leads/build-lead-quote-draft";
import type { LeadQualification } from "@/lib/ai/qualify-lead-schema";
import { leadViewForLot } from "@/lib/leads/lots";
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
  lots: unknown;
};

type MatchRow = {
  id: string;
  artisan_id: string;
  conversation_id: string | null;
  quote_draft_created: boolean;
  lot_index: number;
};

/**
 * Génère un brouillon IA par lot (un seul pour une demande mono-métier) et le
 * réplique sur les matchs déjà dispatchés de ce lot. Chaque brouillon est borné
 * au lot et au métier de l'artisan. Appelé en arrière-plan après l'envoi au client.
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
      "id, description, contact_name, contact_email, estimate_min, estimate_max, trade_category, trade, ai_qualification, lots",
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
    .select("id, artisan_id, conversation_id, quote_draft_created, lot_index")
    .eq("lead_id", leadRow.id)
    .not("conversation_id", "is", null)
    .eq("quote_draft_created", false)
    .order("rank", { ascending: true });

  if (matchError || !matches?.length) return;

  const byLot = new Map<number, MatchRow[]>();
  for (const match of matches as MatchRow[]) {
    const lot = match.lot_index ?? 0;
    byLot.set(lot, [...(byLot.get(lot) ?? []), match]);
  }

  // Lots indépendants : en parallèle pour tenir dans la durée d'exécution du `after()`.
  await Promise.all([...byLot].map(([lotIndex, pending]) => fillLotDrafts(admin, leadRow, lotIndex, pending)));
}

async function fillLotDrafts(
  admin: NonNullable<ReturnType<typeof createSupabaseServiceRoleClient>>,
  leadRow: LeadRow,
  lotIndex: number,
  pending: MatchRow[],
): Promise<void> {
  const first = pending[0]!;
  const view = leadViewForLot(leadRow, lotIndex);

  const { data: profile } = await admin
    .from("profiles")
    .select("id, business_name, description, labor_rate_per_hour, materials_margin_rate, trade_category, trade")
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
        trade_category: profile.trade_category,
        trade: profile.trade,
        materials_margin_rate: profile.materials_margin_rate,
      },
      lead: {
        description: view.description,
        contact_name: leadRow.contact_name,
        contact_email: leadRow.contact_email,
        estimate_min: view.estimateMin,
        estimate_max: view.estimateMax,
        trade_category: view.tradeCategory,
        trade: view.trade,
        ai_qualification: view.qualification,
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
