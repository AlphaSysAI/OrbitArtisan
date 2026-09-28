"use server";

import { redirect } from "next/navigation";

import { findConfirmationByToken, hashConfirmToken } from "@/lib/accounting/accountant-confirmation";
import { ACCOUNTING_EXPORT_PAGE_PATH } from "@/lib/accounting/pending-pieces";
import { notifyUserActivity } from "@/lib/notifications/send-push";
import { getPublicSiteUrl } from "@/lib/site-url";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role";

/**
 * Réponse du comptable (page publique, sans compte). Le jeton est à usage unique :
 * la mise à jour est conditionnée à son empreinte, deux clics simultanés ne font rien de plus.
 */
export async function answerAccountantInvite(formData: FormData): Promise<void> {
  const token = String(formData.get("token") ?? "");
  const decision = String(formData.get("decision") ?? "");
  const base = `/comptable/confirmer/${encodeURIComponent(token)}`;

  const db = createSupabaseServiceRoleClient();
  if (!db || (decision !== "accept" && decision !== "decline")) redirect(`${base}?etat=erreur`);

  const found = await findConfirmationByToken(db, token);
  if (!found.ok) redirect(`${base}?etat=${found.error === "expired" ? "expire" : "invalide"}`);

  const update =
    decision === "accept"
      ? { accountant_email_confirmed_at: new Date().toISOString(), accountant_confirm_token_hash: null }
      : {
          accountant_email: null,
          accountant_email_confirmed_at: null,
          accountant_confirm_token_hash: null,
          accounting_export_enabled: false,
        };

  const { data, error } = await db
    .from("profiles")
    .update(update)
    .eq("id", found.profileId)
    .eq("accountant_confirm_token_hash", hashConfirmToken(token))
    .select("id");
  if (error || !data?.length) redirect(`${base}?etat=invalide`);

  notifyUserActivity(found.userId, {
    title: decision === "accept" ? "Votre comptable a confirmé" : "Votre comptable a refusé",
    body:
      decision === "accept"
        ? `${found.accountantEmail} recevra vos envois comptables à chaque fin de mois.`
        : `${found.accountantEmail} a refusé les envois comptables. Vérifiez l'adresse saisie.`,
    url: `${getPublicSiteUrl()}${ACCOUNTING_EXPORT_PAGE_PATH}`,
    tag: "accountant-confirmation",
  });

  redirect(`${base}?etat=${decision === "accept" ? "accepte" : "refuse"}`);
}
