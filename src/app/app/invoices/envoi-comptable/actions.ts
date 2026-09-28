"use server";

import { revalidatePath } from "next/cache";

import { ACCOUNTING_UPLOADS_BUCKET } from "@/lib/accounting/export-schedule";
import { requireArtisanProfileId } from "@/lib/auth/require-artisan";

export type AccountingActionResult = { ok: true } | { ok: false; error: string };

const PAGE = "/app/invoices/envoi-comptable";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function saveAccountingSettings(input: {
  accountantEmail: string;
  enabled: boolean;
}): Promise<AccountingActionResult> {
  const auth = await requireArtisanProfileId();
  if (!auth.ok) return { ok: false, error: "Connectez-vous pour continuer." };

  const email = input.accountantEmail.trim().toLowerCase();
  if (email && !EMAIL_RE.test(email)) return { ok: false, error: "Adresse e-mail du comptable invalide." };
  if (input.enabled && !email) return { ok: false, error: "Renseignez l'e-mail du comptable pour activer l'envoi." };

  const { error } = await auth.supabase
    .from("profiles")
    .update({ accountant_email: email || null, accounting_export_enabled: input.enabled })
    .eq("id", auth.profileId);
  if (error) {
    return {
      ok: false,
      error: error.message.includes("accountant_email")
        ? "Migration 40_accounting_monthly_export.sql non appliquée."
        : error.message,
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
