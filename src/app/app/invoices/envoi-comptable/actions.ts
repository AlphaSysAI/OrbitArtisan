"use server";

import { revalidatePath } from "next/cache";

import { sendAccountantConfirmation } from "@/lib/accounting/accountant-confirmation";
import { ACCOUNTING_UPLOADS_BUCKET } from "@/lib/accounting/export-schedule";
import { requireArtisanProfileId } from "@/lib/auth/require-artisan";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role";

export type AccountingActionResult = { ok: true } | { ok: false; error: string };

const PAGE = "/app/invoices/envoi-comptable";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function saveAccountingSettings(input: {
  accountantEmail: string;
  enabled: boolean;
}): Promise<AccountingActionResult & { confirmationSent?: boolean }> {
  const auth = await requireArtisanProfileId();
  if (!auth.ok) return { ok: false, error: "Connectez-vous pour continuer." };

  const email = input.accountantEmail.trim().toLowerCase();
  if (email && !EMAIL_RE.test(email)) return { ok: false, error: "Adresse e-mail du comptable invalide." };
  if (input.enabled && !email) return { ok: false, error: "Renseignez l'e-mail du comptable pour activer l'envoi." };

  const { data: before } = await auth.supabase
    .from("profiles")
    .select("accountant_email, accountant_email_confirmed_at, accountant_confirm_sent_at, business_name")
    .eq("id", auth.profileId)
    .maybeSingle();

  // Un changement d'adresse annule la confirmation (trigger 43, côté base).
  const { error } = await auth.supabase
    .from("profiles")
    .update({ accountant_email: email || null, accounting_export_enabled: input.enabled })
    .eq("id", auth.profileId);
  if (error) {
    return {
      ok: false,
      error: error.message.includes("accountant_email")
        ? "Migrations 40 et 42 (envoi comptable) non appliquées."
        : error.message,
    };
  }

  const emailChanged = (before?.accountant_email ?? "") !== email;
  let confirmationSent = false;
  if (email && emailChanged) {
    const admin = createSupabaseServiceRoleClient();
    if (!admin) return { ok: false, error: "Configuration serveur manquante." };
    const sent = await sendAccountantConfirmation(admin, {
      profileId: auth.profileId,
      accountantEmail: email,
      businessName: (before?.business_name as string | null) ?? "",
      lastSentAt: null, // nouvelle adresse : envoi immédiat
    });
    if (!sent.ok) return { ok: false, error: "Adresse enregistrée, mais l'e-mail de confirmation n'est pas parti. Réessayez." };
    confirmationSent = true;
  }

  revalidatePath(PAGE);
  return { ok: true, confirmationSent };
}

/** Renvoie le lien de confirmation au comptable (1 fois toutes les 10 min au plus). */
export async function resendAccountantConfirmation(): Promise<AccountingActionResult> {
  const auth = await requireArtisanProfileId();
  if (!auth.ok) return { ok: false, error: "Connectez-vous pour continuer." };

  const { data: profile } = await auth.supabase
    .from("profiles")
    .select("accountant_email, accountant_email_confirmed_at, accountant_confirm_sent_at, business_name")
    .eq("id", auth.profileId)
    .maybeSingle();
  if (!profile?.accountant_email) return { ok: false, error: "Renseignez d'abord l'e-mail du comptable." };
  if (profile.accountant_email_confirmed_at) return { ok: false, error: "Votre comptable a déjà confirmé." };

  const admin = createSupabaseServiceRoleClient();
  if (!admin) return { ok: false, error: "Configuration serveur manquante." };
  const sent = await sendAccountantConfirmation(admin, {
    profileId: auth.profileId,
    accountantEmail: profile.accountant_email as string,
    businessName: (profile.business_name as string | null) ?? "",
    lastSentAt: (profile.accountant_confirm_sent_at as string | null) ?? null,
  });
  if (!sent.ok) {
    return {
      ok: false,
      error: sent.error === "too_soon" ? "Lien déjà envoyé il y a moins de 10 minutes." : "Envoi impossible. Réessayez.",
    };
  }

  revalidatePath(PAGE);
  return { ok: true };
}

/** Retire une pièce ajoutée par erreur avant l'envoi (suppression définitive). */
export async function deleteAccountingPiece(path: string): Promise<AccountingActionResult> {
  const auth = await requireArtisanProfileId();
  if (!auth.ok) return { ok: false, error: "Connectez-vous pour continuer." };
  if (!path.startsWith(`${auth.profileId}/`) || path.includes("..")) {
    return { ok: false, error: "Pièce introuvable." };
  }

  const { error } = await auth.supabase.storage.from(ACCOUNTING_UPLOADS_BUCKET).remove([path]);
  if (error) return { ok: false, error: "Suppression impossible. Réessayez." };

  revalidatePath(PAGE);
  return { ok: true };
}
