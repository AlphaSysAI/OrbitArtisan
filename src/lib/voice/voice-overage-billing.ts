import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { getCivilMonthPeriod } from "@/lib/billing/civil-month-period";
import {
  findSubscriptionPlan,
  isSubscriptionPlanId,
  SOLINE_DEFAULT_OVERAGE_CAP_CENTS,
} from "@/lib/billing/subscription-plans";
import { getStripe, isStripeConfigured } from "@/lib/stripe/server";
import { countBillableCalls, resolveVoiceEntitlement } from "@/lib/voice/resolve-voice-quota";
import { syncSubscriptionVoiceNumber } from "@/lib/voice/subscription-voice-number-sync";

/** Montant du dépassement d'un mois : appels hors forfait × prix unitaire, plafonné. */
export function computeOverageAmountCents(input: {
  callsIncluded: number;
  callsUsed: number;
  unitCents: number;
  capCents: number;
}): { overageCalls: number; amountCents: number } {
  const overageCalls = Math.max(0, input.callsUsed - input.callsIncluded);
  return {
    overageCalls,
    amountCents: Math.min(overageCalls * Math.max(0, input.unitCents), Math.max(0, input.capCents)),
  };
}

type OverageRunResult = { period: string; checked: number; invoiced: number; skipped: number; failed: number };

/**
 * Facture le dépassement Soline du mois civil précédent : une facture Stripe par
 * artisan, facturé immédiatement (abonnés annuels compris). Idempotent (table
 * voice_overage_charges unique par artisan+mois, et clé d'idempotence Stripe).
 * Les droits sont ceux de la formule actuelle (un changement de formule en cours
 * de mois n'est pas proratisé).
 */
export async function billPreviousMonthVoiceOverage(
  db: SupabaseClient,
  now: Date = new Date(),
): Promise<OverageRunResult> {
  const current = getCivilMonthPeriod(now);
  const previous = getCivilMonthPeriod(new Date(current.start.getTime() - 86_400_000));
  const period = previous.start.toISOString().slice(0, 10);
  const result: OverageRunResult = { period, checked: 0, invoiced: 0, skipped: 0, failed: 0 };

  if (!isStripeConfigured()) {
    console.warn("[voice overage] Stripe non configuré — facturation du dépassement ignorée");
    return result;
  }

  const { data: profiles, error } = await db
    .from("profiles")
    .select(
      "id, subscription_plan, subscription_status, trial_ends_at, voice_overage_cap_cents, stripe_customer_id, stripe_subscription_id",
    )
    .in("subscription_plan", ["pro", "premium"])
    .in("subscription_status", ["active", "past_due"])
    .not("stripe_customer_id", "is", null);
  if (error) {
    console.error("[voice overage] lecture profils", error.message);
    return result;
  }

  const stripe = getStripe();

  for (const p of profiles ?? []) {
    result.checked += 1;
    const plan = p.subscription_plan as string;
    if (!isSubscriptionPlanId(plan)) continue;

    const { data: existing } = await db
      .from("voice_overage_charges")
      .select("status")
      .eq("artisan_id", p.id)
      .eq("period_start", period)
      .maybeSingle();
    if (existing && existing.status !== "failed") continue;

    const entitlement = resolveVoiceEntitlement(p, previous.start);
    const used = await countBillableCalls(db, p.id as string, previous.start, previous.end);
    if (used == null) {
      result.failed += 1;
      continue;
    }
    const capCents = Number(p.voice_overage_cap_cents ?? SOLINE_DEFAULT_OVERAGE_CAP_CENTS);
    const { overageCalls, amountCents } = computeOverageAmountCents({
      callsIncluded: entitlement.callsIncluded,
      callsUsed: used,
      unitCents: entitlement.overageCallCents,
      capCents,
    });

    const row = {
      artisan_id: p.id,
      period_start: period,
      plan_id: plan,
      calls_included: entitlement.callsIncluded,
      calls_used: used,
      overage_calls: overageCalls,
      unit_price_cents: entitlement.overageCallCents,
      cap_cents: capCents,
      amount_cents: amountCents,
      status: amountCents > 0 ? "pending" : "skipped",
      error_message: null as string | null,
    };
    const { error: upsertError } = await db
      .from("voice_overage_charges")
      .upsert(row, { onConflict: "artisan_id,period_start" });
    if (upsertError) {
      console.error("[voice overage] journal", p.id, upsertError.message);
      result.failed += 1;
      continue;
    }
    if (amountCents <= 0) {
      result.skipped += 1;
      continue;
    }

    try {
      const monthLabel = new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric", timeZone: "UTC" }).format(
        previous.start,
      );
      const key = `soline-voice-overage-${p.id}-${period}`;
      const subscriptionId = (p.stripe_subscription_id as string | null) ?? undefined;
      const item = await stripe.invoiceItems.create(
        {
          customer: p.stripe_customer_id as string,
          ...(subscriptionId ? { subscription: subscriptionId } : {}),
          amount: amountCents,
          currency: "eur",
          description: `Soline ${findSubscriptionPlan(plan)?.name ?? plan} — ${overageCalls} appel${overageCalls > 1 ? "s" : ""} hors forfait (${monthLabel})`,
          metadata: { profile_id: p.id as string, period_start: period, kind: "soline_voice_overage" },
        },
        { idempotencyKey: `${key}-item` },
      );
      // Facture immédiate (abonnés annuels compris), prélevée sur le moyen de paiement de l'abonnement.
      const invoice = await stripe.invoices.create(
        {
          customer: p.stripe_customer_id as string,
          ...(subscriptionId ? { subscription: subscriptionId } : {}),
          pending_invoice_items_behavior: "include",
          collection_method: "charge_automatically",
          auto_advance: true,
          description: `Dépassement Soline — ${monthLabel}`,
          metadata: { profile_id: p.id as string, period_start: period, kind: "soline_voice_overage" },
        },
        { idempotencyKey: `${key}-invoice` },
      );
      if (invoice.status === "draft" && invoice.id) {
        await stripe.invoices.finalizeInvoice(invoice.id, { auto_advance: true }).catch((err) =>
          console.warn("[voice overage] finalisation", invoice.id, err instanceof Error ? err.message : err),
        );
      }
      await db
        .from("voice_overage_charges")
        .update({ status: "invoiced", stripe_invoice_item_id: item.id })
        .eq("artisan_id", p.id)
        .eq("period_start", period);
      result.invoiced += 1;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("[voice overage] Stripe", p.id, message);
      await db
        .from("voice_overage_charges")
        .update({ status: "failed", error_message: message.slice(0, 500) })
        .eq("artisan_id", p.id)
        .eq("period_start", period);
      result.failed += 1;
    }
  }

  return result;
}

/** Fin d'essai sans abonnement : le numéro Soline repart en quarantaine (30 j). */
export async function releaseExpiredTrialVoiceNumbers(db: SupabaseClient, now: Date = new Date()): Promise<number> {
  const { data: mappings, error } = await db.from("artisan_voice_numbers").select("artisan_id");
  if (error || !mappings?.length) return 0;

  const ids = mappings.map((m) => m.artisan_id as string);
  const { data: expired } = await db
    .from("profiles")
    .select("id, subscription_plan")
    .in("id", ids)
    .eq("subscription_status", "trialing")
    .lt("trial_ends_at", now.toISOString());

  let released = 0;
  for (const p of expired ?? []) {
    const plan = p.subscription_plan as string;
    const sync = await syncSubscriptionVoiceNumber(db, {
      profileId: p.id as string,
      planId: isSubscriptionPlanId(plan) ? plan : null,
      subscriptionStatus: "canceled",
    });
    if (sync.released) released += 1;
  }
  return released;
}
