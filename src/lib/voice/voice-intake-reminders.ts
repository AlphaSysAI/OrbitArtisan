import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { notifyUserActivity } from "@/lib/notifications/send-push";
import { getPublicSiteUrl } from "@/lib/site-url";

/**
 * Relance des brouillons de devis issus d'un appel Soline restés
 * pending_review — Point 12 de l'audit pré-pilote. Sans ce cron, un
 * brouillon vu une fois puis oublié ne redéclenchait plus jamais de
 * notification (le badge se réinitialisait déjà à la visite — corrigé
 * séparément — et rien ne relançait l'artisan).
 *
 * Paliers en heures depuis la création de l'appel : une relance à 2h, une
 * seconde (dernier rappel) à 24h. Idempotent par appel grâce à
 * reminder_count : chaque palier n'est envoyé qu'une fois.
 */
const REMINDER_SCHEDULE_HOURS = [2, 24] as const;

export type VoiceIntakeReminderResult = {
  processed: number;
  sent: number;
  errors: string[];
};

export async function runVoiceIntakeReminders(
  supabase: SupabaseClient,
): Promise<VoiceIntakeReminderResult> {
  const result: VoiceIntakeReminderResult = { processed: 0, sent: 0, errors: [] };
  const siteUrl = getPublicSiteUrl();

  const oldestThresholdMs = REMINDER_SCHEDULE_HOURS[0] * 60 * 60 * 1000;
  const cutoff = new Date(Date.now() - oldestThresholdMs).toISOString();

  const { data: intakes } = await supabase
    .from("voice_call_intakes")
    .select("id, artisan_id, customer_name, created_at, reminder_count")
    .eq("status", "pending_review")
    .lt("created_at", cutoff);

  for (const intake of intakes ?? []) {
    result.processed++;

    const hoursSinceCreated = (Date.now() - new Date(intake.created_at).getTime()) / (1000 * 60 * 60);
    const level = REMINDER_SCHEDULE_HOURS.filter((h) => hoursSinceCreated >= h).length;
    if (level <= (intake.reminder_count ?? 0)) continue;

    const { data: profile } = await supabase
      .from("profiles")
      .select("user_id")
      .eq("id", intake.artisan_id)
      .maybeSingle();

    const userId = profile?.user_id as string | undefined;
    if (!userId) continue;

    try {
      const who = intake.customer_name?.trim() || "Un appelant";
      const isLast = level >= REMINDER_SCHEDULE_HOURS.length;
      notifyUserActivity(userId, {
        title: isLast ? "Devis toujours pas validé (dernier rappel)" : "Devis en attente de validation",
        body: `${who} attend depuis ${Math.floor(hoursSinceCreated)}h — proposition de devis à valider.`,
        url: `${siteUrl}/app/appels`,
        tag: `voice-reminder-${intake.id}`,
      });

      await supabase
        .from("voice_call_intakes")
        .update({ reminder_count: level, last_reminder_at: new Date().toISOString() })
        .eq("id", intake.id);

      result.sent++;
    } catch (err) {
      result.errors.push(`${intake.id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return result;
}
