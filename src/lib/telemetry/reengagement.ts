import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { evaluateSubscriptionAccess } from "@/lib/billing/subscription-access";
import { sendPushToUser } from "@/lib/notifications/send-push";
import { sendTransactionalSms } from "@/lib/sms/send-sms";
import { getPublicSiteUrl } from "@/lib/site-url";
import { assessChurnRisk, reengagementMessage, reengagementPath, type RiskAssessment } from "@/lib/telemetry/churn-risk";

const DAY = 86_400_000;
/** Plafonds anti-harcèlement : 1 relance / 72 h, 2 SMS / 30 jours. */
const MIN_GAP_MS = 72 * 3_600_000;
const MAX_SMS_PER_30D = 2;

export type ReengagementRunResult = { scanned: number; atRisk: number; sent: { push: number; sms: number }; skipped: number };

function parisDay(d: Date) {
  return new Intl.DateTimeFormat("fr-CA", { timeZone: "Europe/Paris" }).format(d);
}

async function assess(db: SupabaseClient, artisan: { id: string; created_at: string; trial_ends_at: string | null; subscription_status: string | null }, now: Date) {
  const iso = (ms: number) => new Date(now.getTime() - ms).toISOString();
  const [days, last7, prev21, stale, oldest, sent14, accepted, voiceNumber] = await Promise.all([
    db.from("artisan_activity_days").select("day").eq("artisan_id", artisan.id).gte("day", parisDay(new Date(now.getTime() - 30 * DAY))),
    db.from("voice_call_intakes").select("id", { count: "exact", head: true }).eq("artisan_id", artisan.id).gte("created_at", iso(7 * DAY)),
    db
      .from("voice_call_intakes")
      .select("id", { count: "exact", head: true })
      .eq("artisan_id", artisan.id)
      .gte("created_at", iso(28 * DAY))
      .lt("created_at", iso(7 * DAY)),
    db
      .from("voice_call_intakes")
      .select("id", { count: "exact", head: true })
      .eq("artisan_id", artisan.id)
      .eq("status", "pending_review")
      .lt("created_at", iso(2 * DAY)),
    db
      .from("voice_call_intakes")
      .select("customer_name")
      .eq("artisan_id", artisan.id)
      .eq("status", "pending_review")
      .lt("created_at", iso(2 * DAY))
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle(),
    db.from("quotes").select("id", { count: "exact", head: true }).eq("artisan_id", artisan.id).gte("sent_at", iso(14 * DAY)),
    db.from("quotes").select("id, invoices(id)").eq("artisan_id", artisan.id).eq("status", "accepted").limit(50),
    db.from("artisan_voice_numbers").select("created_at, is_active").eq("artisan_id", artisan.id).maybeSingle(),
  ]);

  const assignedAt = voiceNumber.data?.is_active ? new Date(voiceNumber.data.created_at as string) : null;
  const { count: callsSince } = assignedAt
    ? await db.from("voice_call_intakes").select("id", { count: "exact", head: true }).eq("artisan_id", artisan.id).gte("created_at", assignedAt.toISOString())
    : { count: 0 };
  const access = evaluateSubscriptionAccess({ subscription_status: artisan.subscription_status, trial_ends_at: artisan.trial_ends_at });
  const acceptedNotInvoiced = (accepted.data ?? []).filter((q) => !(q.invoices as unknown[] | null)?.length).length;

  const risk = assessChurnRisk({
    now,
    accountCreatedAt: new Date(artisan.created_at),
    activeDays: (days.data ?? []).map((d) => d.day as string),
    callsLast7: last7.count ?? 0,
    callsPrev21: prev21.count ?? 0,
    pendingIntakesOver48h: stale.count ?? 0,
    oldestPendingIntakeName: (oldest.data?.customer_name as string | null) ?? null,
    quotesSentLast14: sent14.count ?? 0,
    acceptedNotInvoiced,
    voiceNumberAssignedAt: assignedAt,
    callsSinceNumberAssigned: callsSince ?? 0,
    trialDaysRemaining: access.status === "trialing" ? access.daysRemaining : null,
  });
  return { risk, acceptedNotInvoiced, allowed: access.allowed };
}

/**
 * Cron quotidien (jours ouvrés, 9 h 15 Paris) : repère les comptes à risque et envoie
 * UNE relance opérationnelle ciblée. Push d'abord ; SMS seulement si critique et pas
 * de push possible (ou push ignoré). Jamais d'e-mail marketing.
 */
export async function runReengagement(db: SupabaseClient, now = new Date()): Promise<ReengagementRunResult> {
  const result: ReengagementRunResult = { scanned: 0, atRisk: 0, sent: { push: 0, sms: 0 }, skipped: 0 };
  const dow = new Date(`${parisDay(now)}T12:00:00Z`).getUTCDay();
  if (dow === 0 || dow === 6) return result;

  const { data: artisans } = await db
    .from("profiles")
    .select("id, user_id, phone, created_at, trial_ends_at, subscription_status, ops_nudges_enabled")
    .not("onboarding_completed_at", "is", null)
    .eq("ops_nudges_enabled", true)
    .is("deleted_at", null)
    .limit(2000);

  for (const a of artisans ?? []) {
    result.scanned++;
    const { risk, acceptedNotInvoiced, allowed } = await assess(db, a as never, now);
    // Essai expiré / impayé / résilié : relevé du parcours de facturation, pas de cette relance.
    if (!allowed || (risk.level !== "at_risk" && risk.level !== "critical")) continue;
    result.atRisk++;

    const { data: recent } = await db
      .from("reengagement_log")
      .select("channel, sent_at, reactivated_at")
      .eq("artisan_id", a.id)
      .gte("sent_at", new Date(now.getTime() - 30 * DAY).toISOString())
      .order("sent_at", { ascending: false });
    const last = recent?.[0];
    if (last && now.getTime() - new Date(last.sent_at as string).getTime() < MIN_GAP_MS) {
      result.skipped++;
      continue;
    }

    const top = risk.signals[0]!;
    const url = `${getPublicSiteUrl()}${reengagementPath(top.code)}`;
    const message = reengagementMessage(top, { url, acceptedNotInvoiced });
    const channel = await deliver(db, a as never, risk, message, url, recent ?? []);
    if (!channel) {
      result.skipped++;
      continue;
    }
    result.sent[channel]++;
    await db.from("reengagement_log").insert({ artisan_id: a.id, risk_score: risk.score, signal: top.code, channel, message });
  }
  return result;
}

async function deliver(
  db: SupabaseClient,
  artisan: { user_id: string; phone: string | null },
  risk: RiskAssessment,
  message: string,
  url: string,
  recent: { channel: string; reactivated_at: string | null }[],
): Promise<"push" | "sms" | null> {
  const { count: pushSubs } = await db
    .from("push_subscriptions")
    .select("id", { count: "exact", head: true })
    .eq("user_id", artisan.user_id);
  const lastPushIgnored = recent[0]?.channel === "push" && !recent[0]?.reactivated_at;

  if (pushSubs && !(risk.level === "critical" && lastPushIgnored)) {
    await sendPushToUser(artisan.user_id, { title: "Soline", body: message.replace(` : ${url}`, "."), url, tag: "reengagement" });
    return "push";
  }

  const smsLast30 = recent.filter((r) => r.channel === "sms").length;
  if (risk.level === "critical" && artisan.phone && smsLast30 < MAX_SMS_PER_30D) {
    const res = await sendTransactionalSms({ to: artisan.phone, body: message });
    return res.ok ? "sms" : null;
  }
  return null;
}
