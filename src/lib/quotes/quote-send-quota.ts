import type { SupabaseClient } from "@supabase/supabase-js";

import { getCivilMonthPeriod } from "@/lib/billing/civil-month-period";
import { findSubscriptionPlan } from "@/lib/billing/subscription-plans";

/** Erreur levée par la base (send_quote_document) quand le quota est atteint. */
export const QUOTE_LIMIT_DB_ERROR = "quote_monthly_limit_reached";

export type QuoteSendQuota = {
  /** null = illimité */
  limit: number | null;
  used: number;
  remaining: number | null;
  reached: boolean;
};

export function buildQuoteSendQuota(limit: number | null, used: number): QuoteSendQuota {
  const safeUsed = Math.max(0, used);
  if (limit === null) return { limit, used: safeUsed, remaining: null, reached: false };
  const remaining = Math.max(0, limit - safeUsed);
  return { limit, used: safeUsed, remaining, reached: remaining <= 0 };
}

/** Devis envoyés ce mois civil et limite de la formule de l'artisan. */
export async function resolveQuoteSendQuota(
  supabase: SupabaseClient,
  artisanId: string,
  now: Date = new Date(),
): Promise<QuoteSendQuota> {
  const { start, end } = getCivilMonthPeriod(now);
  const [{ data: profile }, { count }] = await Promise.all([
    supabase.from("profiles").select("subscription_plan").eq("id", artisanId).maybeSingle(),
    supabase
      .from("quotes")
      .select("id", { count: "exact", head: true })
      .eq("artisan_id", artisanId)
      .gte("sent_at", start.toISOString())
      .lt("sent_at", end.toISOString()),
  ]);
  const plan = findSubscriptionPlan((profile?.subscription_plan as string | null) ?? "");
  return buildQuoteSendQuota(plan ? plan.quotesPerMonth : null, count ?? 0);
}

export function isQuoteLimitDbError(error: { message?: string } | null | undefined): boolean {
  return !!error?.message?.includes(QUOTE_LIMIT_DB_ERROR);
}

export function quoteLimitMessage(limit: number | null): string {
  return `Vous avez atteint la limite de ${limit ?? ""} devis envoyés ce mois-ci avec votre formule. Passez à la formule supérieure pour en envoyer davantage (vos brouillons restent enregistrés).`;
}
