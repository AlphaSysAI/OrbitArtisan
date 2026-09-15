import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { qualifyLead } from "@/lib/ai/qualify-lead";
import type { LeadQualification } from "@/lib/ai/qualify-lead-schema";
import type { LeadChatMessage } from "@/lib/leads/chat-schema";
import { estimateLeadRange } from "@/lib/leads/estimate";
import { applyStructuralShellEstimateFloor, surfaceShellEstimate } from "@/lib/leads/lead-project-scale";
import { estimateLeadMaterialCosts } from "@/lib/leads/lead-material-estimate";
import { buildFullLeadEstimate, resolvePricingContext } from "@/lib/leads/pricing";
import type { LeadEstimate } from "@/lib/leads/types";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role";
import { findTrade, findTradeCategory } from "@/lib/trades/taxonomy";

type LeadEstimateRow = {
  estimate_min: number | null;
  estimate_max: number | null;
  ai_qualification: LeadQualification | null;
};

export type LeadEstimateInput = {
  token: string;
  categoryId: string;
  tradeId: string | null;
  description: string;
  mediaCount: number;
  messages?: LeadChatMessage[];
  artisanIds: string[];
};

const QUALIFICATION_POLL_MS = 500;
const QUALIFICATION_POLL_ATTEMPTS = 14;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function readLeadEstimateRow(token: string): Promise<LeadEstimateRow | null> {
  const admin = createSupabaseServiceRoleClient();
  if (!admin) return null;

  const { data, error } = await admin
    .from("leads")
    .select("estimate_min, estimate_max, ai_qualification")
    .eq("public_token", token)
    .maybeSingle();

  if (error) {
    console.error("[lead-estimate] read", error.message);
    return null;
  }

  return (data as LeadEstimateRow | null) ?? null;
}

async function persistLeadEstimate(
  supabase: SupabaseClient,
  token: string,
  estimate: LeadEstimate,
  qualification: LeadQualification | null,
): Promise<void> {
  const { error } = await supabase.rpc("set_lead_estimate", {
    p_token: token,
    p_min: estimate.min,
    p_max: estimate.max,
    p_qualification: qualification,
  });
  if (error) console.error("[lead-estimate] set_lead_estimate", error.message);
}

function tradeLabelFor(input: LeadEstimateInput): string | null {
  return (
    [findTradeCategory(input.categoryId)?.label, findTrade(input.categoryId, input.tradeId)?.label]
      .filter(Boolean)
      .join(" · ") || null
  );
}

/** Attend le prefetch puis lance qualifyLead si besoin — pas de repli heuristique immédiat. */
async function ensureQualification(input: LeadEstimateInput): Promise<LeadQualification | null> {
  for (let i = 0; i < QUALIFICATION_POLL_ATTEMPTS; i += 1) {
    const stored = await readLeadEstimateRow(input.token);
    if (stored?.ai_qualification) return stored.ai_qualification;
    await sleep(QUALIFICATION_POLL_MS);
  }

  const stored = await readLeadEstimateRow(input.token);
  if (stored?.ai_qualification) return stored.ai_qualification;

  try {
    return await qualifyLead({
      description: input.description,
      categoryLabel: findTradeCategory(input.categoryId)?.label ?? null,
      tradeLabel: findTrade(input.categoryId, input.tradeId)?.label ?? null,
      messages: input.messages,
      mediaCount: input.mediaCount,
    });
  } catch (err) {
    console.error("[lead-estimate] qualifyLead", err instanceof Error ? err.message : err);
    return null;
  }
}

/**
 * Lance la qualification IA pendant les étapes suivantes (photos, adresse).
 * Idempotent : ignore si une qualification est déjà persistée.
 */
export async function prefetchLeadQualification(input: LeadEstimateInput): Promise<void> {
  const existing = await readLeadEstimateRow(input.token);
  if (existing?.ai_qualification) return;

  try {
    const qualification = await qualifyLead({
      description: input.description,
      categoryLabel: findTradeCategory(input.categoryId)?.label ?? null,
      tradeLabel: findTrade(input.categoryId, input.tradeId)?.label ?? null,
      messages: input.messages,
      mediaCount: input.mediaCount,
    });

    const admin = createSupabaseServiceRoleClient();
    if (!admin) return;

    const pricing = await resolvePricingContext(admin, {
      artisanIds: [],
      categoryId: input.categoryId,
    });
    const estimate = buildFullLeadEstimate(qualification, pricing, null);

    const { data: leadStatus } = await admin
      .from("leads")
      .select("status")
      .eq("public_token", input.token)
      .maybeSingle();

    const { error } = await admin
      .from("leads")
      .update({
        estimate_min: estimate.min,
        estimate_max: estimate.max,
        ai_qualification: qualification,
        ...(leadStatus?.status === "new" ? { status: "estimated" as const } : {}),
      })
      .eq("public_token", input.token)
      .is("ai_qualification", null);

    if (error) console.error("[lead-estimate] prefetch", error.message);
  } catch (err) {
    console.error("[lead-estimate] prefetch IA", err instanceof Error ? err.message : err);
  }
}

/**
 * Fourchette affichée au prospect : attend l'IA, chiffre main-d'œuvre + matériaux.
 * Repli heuristique uniquement si l'IA est indisponible.
 */
export async function resolveLeadEstimate(
  supabase: SupabaseClient,
  input: LeadEstimateInput,
): Promise<LeadEstimate> {
  const label = tradeLabelFor(input);

  const [qualification, materialCosts] = await Promise.all([
    ensureQualification(input),
    estimateLeadMaterialCosts({ description: input.description, tradeLabel: label }),
  ]);

  if (qualification) {
    const pricing = await resolvePricingContext(supabase, {
      artisanIds: input.artisanIds,
      categoryId: input.categoryId,
    });
    const estimate = buildFullLeadEstimate(
      qualification,
      pricing,
      materialCosts,
      input.description,
    );
    await persistLeadEstimate(supabase, input.token, estimate, qualification);
    return estimate;
  }

  const shellFallback = surfaceShellEstimate({
    description: input.description,
    mediaCount: input.mediaCount,
  });
  const estimate =
    shellFallback ??
    applyStructuralShellEstimateFloor(
      estimateLeadRange({
        categoryId: input.categoryId,
        description: input.description,
        mediaCount: input.mediaCount,
      }),
      input.description,
    );
  await persistLeadEstimate(supabase, input.token, estimate, null);
  return estimate;
}
