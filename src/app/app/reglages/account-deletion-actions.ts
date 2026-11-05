"use server";

import { redirect } from "next/navigation";

import { requestArtisanAccountDeletion } from "@/lib/account/account-deletion";
import { requireArtisanProfileId } from "@/lib/auth/require-artisan";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role";

export type DeleteAccountState = { error: string | null };

/**
 * « Supprimer mon compte » : l'artisan retape son e-mail et coche la confirmation.
 * La suppression ne passe que par le serveur (service role) après ces contrôles.
 */
export async function deleteMyAccountAction(_prev: DeleteAccountState, formData: FormData): Promise<DeleteAccountState> {
  const auth = await requireArtisanProfileId();
  if (!auth.ok) {
    if (auth.error === "auth") redirect("/login?next=/app/reglages?tab=abonnement");
    return { error: "Compte introuvable." };
  }
  if (!auth.isOwner) return { error: "Seul le titulaire du compte peut le supprimer." };
  const { data: userData } = await auth.supabase.auth.getUser();
  const email = userData.user?.email?.toLowerCase() ?? null;

  const typed = String(formData.get("confirm_email") ?? "").trim().toLowerCase();
  if (!email || typed !== email) return { error: "L'adresse saisie ne correspond pas à celle de votre compte." };
  if (formData.get("confirm_terms") !== "1") return { error: "Cochez la case de confirmation." };

  const db = createSupabaseServiceRoleClient();
  if (!db) return { error: "Service indisponible, réessayez dans quelques minutes." };

  const res = await requestArtisanAccountDeletion(db, { profileId: auth.profileId, userId: auth.userId, email });
  if (!res.ok) {
    return {
      error:
        res.error === "stripe_failed"
          ? "La résiliation de l'abonnement n'a pas abouti : rien n'a été supprimé. Réessayez dans quelques minutes."
          : // L'abonnement a pu être résilié avant l'échec : relancer est sans risque (résiliation idempotente).
            "La suppression n'a pas pu être finalisée. Réessayez dans quelques minutes ; si le problème persiste, écrivez au support.",
    };
  }

  await auth.supabase.auth.signOut();
  redirect(`/suppression-compte?le=${encodeURIComponent(res.purgeAfter)}`);
}
