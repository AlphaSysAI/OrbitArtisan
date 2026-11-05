import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { getCivilMonthPeriod } from "@/lib/billing/civil-month-period";
import { getPlanFormalNoticesIncluded } from "@/lib/billing/subscription-plans";

import type { FormalNoticeQuota } from "./types";

/**
 * Quota mensuel de mises en demeure LRAR.
 *
 * Le compteur n'est pas stocké : il est dérivé du nombre de lettres
 * effectivement affranchies sur la période courante. Trois conséquences
 * voulues :
 *   - le non-cumul d'un mois sur l'autre est vrai par construction ;
 *   - aucune tâche de remise à zéro n'est nécessaire ;
 *   - les lignes `formal_notices` restent la seule source de vérité auditable.
 *
 * Une lettre refusée par MySendingBox n'est jamais affranchie : elle ne
 * consomme donc pas le quota (absence de `mysendingbox_letter_id`).
 */
type QuotaPeriod = { start: Date; end: Date };

export type { FormalNoticeQuota };

/** Période de décompte : le mois civil (voir `getCivilMonthPeriod`). */
export function getFormalNoticeQuotaPeriod(now: Date = new Date()): QuotaPeriod {
  return getCivilMonthPeriod(now);
}

export function buildFormalNoticeQuota(used: number, included: number, now: Date = new Date()): FormalNoticeQuota {
  const { start, end } = getFormalNoticeQuotaPeriod(now);
  const safeUsed = Math.max(0, used);
  const remaining = Math.max(0, included - safeUsed);

  return {
    included,
    used: safeUsed,
    remaining,
    nextIsBillable: remaining <= 0,
    periodStart: start.toISOString(),
    periodEnd: end.toISOString(),
  };
}

/** LRAR incluses par mois selon la formule de l'artisan (0 si introuvable). */
export async function resolveFormalNoticesIncluded(supabase: SupabaseClient, artisanId: string): Promise<number> {
  const { data } = await supabase.from("profiles").select("subscription_plan").eq("id", artisanId).maybeSingle();
  return getPlanFormalNoticesIncluded(data?.subscription_plan as string | null | undefined);
}

/**
 * Compte les LRAR affranchies sur le mois courant.
 * En cas d'erreur, considère le quota comme épuisé : mieux vaut demander une
 * confirmation de coût superflue que d'affranchir à notre charge par erreur.
 */
export async function resolveFormalNoticeQuota(
  supabase: SupabaseClient,
  artisanId: string,
  now: Date = new Date(),
): Promise<FormalNoticeQuota> {
  const { start, end } = getFormalNoticeQuotaPeriod(now);
  const included = await resolveFormalNoticesIncluded(supabase, artisanId);

  const { count, error } = await supabase
    .from("formal_notices")
    .select("id", { count: "exact", head: true })
    .eq("artisan_id", artisanId)
    .not("mysendingbox_letter_id", "is", null)
    .gte("created_at", start.toISOString())
    .lt("created_at", end.toISOString());

  if (error) {
    console.error("[recovery] décompte quota LRAR", { artisanId, message: error.message });
    return buildFormalNoticeQuota(included, included, now);
  }

  return buildFormalNoticeQuota(count ?? 0, included, now);
}
