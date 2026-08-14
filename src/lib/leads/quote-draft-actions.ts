"use server";

import type { AiQuoteDraft } from "@/lib/ai/quote-draft-storage";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Charge le brouillon de devis généré lors de la réception d'un lead qualifié.
 * Réservé à l'artisan matché sur ce lead.
 */
export async function loadLeadMatchQuoteDraft(
  leadMatchId: string,
): Promise<{ ok: true; draft: AiQuoteDraft; conversationId: string | null } | { ok: false; error: string }> {
  if (!leadMatchId?.trim()) return { ok: false, error: "missing_id" };

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "auth" };

  const { data: profile } = await supabase.from("profiles").select("id").eq("user_id", user.id).maybeSingle();
  if (!profile?.id) return { ok: false, error: "not_artisan" };

  const { data: match, error } = await supabase
    .from("lead_matches")
    .select("id, artisan_id, conversation_id, quote_draft, quote_draft_created")
    .eq("id", leadMatchId)
    .maybeSingle();

  if (error || !match) return { ok: false, error: "not_found" };
  if (match.artisan_id !== profile.id) return { ok: false, error: "forbidden" };
  if (!match.quote_draft_created || !match.quote_draft) return { ok: false, error: "no_draft" };

  const draft = match.quote_draft as AiQuoteDraft;
  if (draft?.version !== 1) return { ok: false, error: "invalid_draft" };

  return {
    ok: true,
    draft: {
      ...draft,
      draftKey: draft.draftKey ?? `lead-match:${leadMatchId}`,
      source: "lead",
      leadMatchId,
    },
    conversationId: (match.conversation_id as string | null) ?? null,
  };
}

/**
 * Retrouve le match lead ↔ artisan pour une conversation donnée.
 */
export async function findLeadMatchForConversation(
  conversationId: string,
): Promise<{ ok: true; leadMatchId: string; quoteDraftCreated: boolean } | { ok: false }> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false };

  const { data: profile } = await supabase.from("profiles").select("id").eq("user_id", user.id).maybeSingle();
  if (!profile?.id) return { ok: false };

  const { data: match } = await supabase
    .from("lead_matches")
    .select("id, quote_draft_created")
    .eq("conversation_id", conversationId)
    .eq("artisan_id", profile.id)
    .maybeSingle();

  if (!match?.id) return { ok: false };
  return {
    ok: true,
    leadMatchId: match.id,
    quoteDraftCreated: !!match.quote_draft_created,
  };
}
