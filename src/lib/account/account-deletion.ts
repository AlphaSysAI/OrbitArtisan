import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { escapeHtml } from "@/lib/email/html";
import { sendEmail } from "@/lib/email/send-email";
import { formatDateFr } from "@/lib/format/date";
import { LEGAL_PUBLISHER } from "@/lib/legal/site-legal-info";
import { getStripe, isStripeConfigured } from "@/lib/stripe/server";
import type { SubscriptionPlanId } from "@/lib/billing/subscription-plans";
import { syncSubscriptionVoiceNumber } from "@/lib/voice/subscription-voice-number-sync";

/**
 * Suppression du compte par l'artisan (CGV art. 6 et 12).
 *
 * Demande (immédiat) : abonnement Stripe résilié sans remboursement ni prorata, accès coupé,
 * numéro Soline libéré (quarantaine), plus aucune demande de chantier reçue.
 * Effacement (J+30, cron) : fiche et tout ce qui en dépend (cascade), fichiers Storage,
 * compte de connexion. Conservés : factures émises par Soline (Stripe), registre des
 * numéros (photo d'identité prise à l'attribution), ligne de preuve account_deletions.
 */

type Db = SupabaseClient;

export const ACCOUNT_DELETION_GRACE_DAYS = 30;

/** Buckets dont les fichiers sont rangés sous « <profile_id>/… ». */
const PROFILE_PREFIXED_BUCKETS = ["vitrine-media", "quote-signatures", "accounting-uploads", "recovery-documents"] as const;
/** Pièces jointes de messagerie : rangées sous « <conversation_id>/… ». */
const MESSAGE_DOCUMENTS_BUCKET = "message-documents";

export type DeletionRequestResult =
  | { ok: true; purgeAfter: string; alreadyRequested: boolean }
  | { ok: false; error: "not_found" | "stripe_failed" | "db" };

export async function requestArtisanAccountDeletion(
  db: Db,
  input: { profileId: string; userId: string; email: string | null; requestedBy?: "artisan" | "admin" },
  now = new Date(),
): Promise<DeletionRequestResult> {
  const { data: profile } = await db
    .from("profiles")
    .select("id, user_id, business_name, first_name, stripe_customer_id, stripe_subscription_id, subscription_plan")
    .eq("id", input.profileId)
    .eq("user_id", input.userId)
    .maybeSingle();
  if (!profile) return { ok: false, error: "not_found" };

  const { data: pending } = await db
    .from("account_deletions")
    .select("purge_after")
    .eq("profile_id", input.profileId)
    .is("purged_at", null)
    .is("cancelled_at", null)
    .maybeSingle();
  if (pending) return { ok: true, purgeAfter: pending.purge_after as string, alreadyRequested: true };

  // 1. Stripe d'abord : sans résiliation confirmée, rien n'est modifié (sinon le compte serait
  //    fermé mais toujours facturé). Résiliation immédiate, sans prorata ni remboursement.
  const subscriptionId = (profile.stripe_subscription_id as string | null)?.trim();
  if (subscriptionId && isStripeConfigured()) {
    try {
      await getStripe().subscriptions.cancel(subscriptionId, { prorate: false, invoice_now: false });
    } catch (error) {
      const code = (error as { code?: string }).code;
      const alreadyGone =
        code === "resource_missing" || /already been canceled|canceled subscription/i.test(String((error as Error).message));
      if (!alreadyGone) {
        console.error("[account deletion] résiliation Stripe", code, (error as Error).message);
        return { ok: false, error: "stripe_failed" };
      }
    }
  }

  const purgeAfter = new Date(now.getTime() + ACCOUNT_DELETION_GRACE_DAYS * 86_400_000).toISOString();
  const { error: insertError } = await db.from("account_deletions").insert({
    profile_id: input.profileId,
    user_id: input.userId,
    stripe_customer_id: (profile.stripe_customer_id as string | null) ?? null,
    requested_by: input.requestedBy ?? "artisan",
    requested_at: now.toISOString(),
    purge_after: purgeAfter,
  });
  if (insertError && insertError.code !== "23505") {
    console.error("[account deletion] enregistrement", insertError.code, insertError.message);
    return { ok: false, error: "db" };
  }

  // 2. Accès coupé (middleware : compte supprimé → page dédiée), plus de demandes de chantier.
  const { error: profileError } = await db
    .from("profiles")
    .update({
      deleted_at: now.toISOString(),
      account_status: "suspended",
      subscription_status: "canceled",
      lead_matching_enabled: false,
      updated_at: now.toISOString(),
    })
    .eq("id", input.profileId);
  if (profileError) {
    console.error("[account deletion] fermeture du compte", profileError.code, profileError.message);
    return { ok: false, error: "db" };
  }

  // 3. Numéro Soline : libéré comme à une résiliation (quarantaine, puis restitution).
  await syncSubscriptionVoiceNumber(db, {
    profileId: input.profileId,
    planId: ((profile.subscription_plan as SubscriptionPlanId | null) ?? "base") as SubscriptionPlanId,
    subscriptionStatus: "canceled",
  }).catch((error) => console.error("[account deletion] numéro Soline", error));

  if (input.email) {
    const date = formatDateFr(purgeAfter, { dateStyle: "long" });
    const res = await sendEmail({
      to: input.email,
      subject: "Suppression de votre compte Soline",
      html: `
        <p>Bonjour${profile.first_name ? ` ${escapeHtml(profile.first_name as string)}` : ""},</p>
        <p>La suppression de votre compte Soline${profile.business_name ? ` (<strong>${escapeHtml(profile.business_name as string)}</strong>)` : ""} est enregistrée.</p>
        <ul>
          <li>Votre abonnement est résilié : plus aucun prélèvement. La période en cours déjà payée n'est pas remboursée (CGV, art. 6).</li>
          <li>L'accès à votre espace est fermé et votre numéro Soline est désactivé.</li>
          <li>Vos données seront définitivement effacées le <strong>${escapeHtml(date)}</strong>.</li>
        </ul>
        <p>Vous devez conserver vos devis et factures pendant 10 ans. Jusqu'au ${escapeHtml(date)}, vous pouvez demander une copie de vos données ou annuler la suppression en écrivant à ${escapeHtml(LEGAL_PUBLISHER.email)}.</p>
        <p>Soline — solinebtp.fr</p>`,
      text: `La suppression de votre compte Soline est enregistrée. Abonnement résilié sans remboursement de la période en cours (CGV art. 6). Accès fermé, numéro Soline désactivé. Effacement définitif le ${date}. D'ici là, vous pouvez demander une copie de vos données ou annuler en écrivant à ${LEGAL_PUBLISHER.email}.`,
    });
    if (!res.ok) console.error("[account deletion] e-mail de confirmation", res.error);
  }

  return { ok: true, purgeAfter, alreadyRequested: false };
}

/** Annulation par l'admin pendant les 30 jours (le compte est restauré à part). */
export async function cancelAccountDeletion(db: Db, profileId: string, now = new Date()): Promise<boolean> {
  const { data } = await db
    .from("account_deletions")
    .update({ cancelled_at: now.toISOString() })
    .eq("profile_id", profileId)
    .is("purged_at", null)
    .is("cancelled_at", null)
    .select("id");
  return Boolean(data?.length);
}

export async function pendingAccountDeletion(db: Db, profileId: string): Promise<{ requestedAt: string; purgeAfter: string } | null> {
  const { data } = await db
    .from("account_deletions")
    .select("requested_at, purge_after")
    .eq("profile_id", profileId)
    .is("purged_at", null)
    .is("cancelled_at", null)
    .maybeSingle();
  return data ? { requestedAt: data.requested_at as string, purgeAfter: data.purge_after as string } : null;
}

async function listFilesRecursive(db: Db, bucket: string, prefix: string, depth = 0): Promise<string[]> {
  if (depth > 4) return [];
  const out: string[] = [];
  for (let offset = 0; ; offset += 100) {
    const { data, error } = await db.storage.from(bucket).list(prefix, { limit: 100, offset });
    if (error || !data?.length) break;
    for (const entry of data) {
      const path = `${prefix}/${entry.name}`;
      if (entry.id) out.push(path);
      else out.push(...(await listFilesRecursive(db, bucket, path, depth + 1)));
    }
    if (data.length < 100) break;
  }
  return out;
}

async function removeFiles(db: Db, bucket: string, paths: string[]): Promise<number> {
  let removed = 0;
  for (let i = 0; i < paths.length; i += 100) {
    const batch = paths.slice(i, i + 100);
    const { error } = await db.storage.from(bucket).remove(batch);
    if (error) console.error("[account deletion] fichiers", bucket, error.message);
    else removed += batch.length;
  }
  return removed;
}

export type PurgeReport = { purged: number; failed: number; files: number };

/** Cron quotidien : efface les comptes dont le délai de 30 jours est écoulé. */
export async function purgeDueAccountDeletions(db: Db, now = new Date()): Promise<PurgeReport> {
  const report: PurgeReport = { purged: 0, failed: 0, files: 0 };
  const { data: due, error } = await db
    .from("account_deletions")
    .select("id, profile_id, user_id")
    .is("purged_at", null)
    .is("cancelled_at", null)
    .lte("purge_after", now.toISOString())
    .limit(20);
  if (error) {
    console.error("[account deletion] lecture des suppressions dues", error.message);
    return report;
  }

  for (const row of (due ?? []) as { id: string; profile_id: string; user_id: string }[]) {
    try {
      const { data: profile } = await db.from("profiles").select("id, deleted_at").eq("id", row.profile_id).maybeSingle();
      // Restauré par l'admin sans annuler la demande : on n'efface jamais un compte rouvert.
      if (profile && !profile.deleted_at) {
        await db.from("account_deletions").update({ cancelled_at: now.toISOString() }).eq("id", row.id);
        continue;
      }

      if (profile) {
        const { data: conversations } = await db.from("conversations").select("id").eq("artisan_id", row.profile_id);
        for (const bucket of PROFILE_PREFIXED_BUCKETS) {
          report.files += await removeFiles(db, bucket, await listFilesRecursive(db, bucket, row.profile_id));
        }
        for (const c of (conversations ?? []) as { id: string }[]) {
          report.files += await removeFiles(db, MESSAGE_DOCUMENTS_BUCKET, await listFilesRecursive(db, MESSAGE_DOCUMENTS_BUCKET, c.id));
        }
        // Service role : les garde-fous d'immuabilité (factures, devis) ne s'appliquent pas.
        const { error: deleteError } = await db.from("profiles").delete().eq("id", row.profile_id);
        if (deleteError) throw new Error(`profil : ${deleteError.message}`);
      }

      // Compte de connexion : supprimé sauf s'il sert encore (admin, client, apporteur).
      const [{ data: isAdmin }, { data: customer }, { data: referrer }] = await Promise.all([
        db.from("platform_admins").select("user_id").eq("user_id", row.user_id).maybeSingle(),
        db.from("customer_profiles").select("id").eq("user_id", row.user_id).maybeSingle(),
        db.from("business_referrers").select("id").eq("user_id", row.user_id).maybeSingle(),
      ]);
      if (!isAdmin && !customer && !referrer) {
        const { error: authError } = await db.auth.admin.deleteUser(row.user_id);
        if (authError && !/not.?found/i.test(authError.message)) throw new Error(`compte : ${authError.message}`);
      }

      await db.from("account_deletions").update({ purged_at: now.toISOString() }).eq("id", row.id);
      report.purged++;
    } catch (e) {
      report.failed++;
      console.error("[account deletion] effacement", row.profile_id, e instanceof Error ? e.message : e);
    }
  }
  return report;
}
