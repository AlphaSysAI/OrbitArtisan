import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { loadReferrerInvitation } from "./invitations";
import { parseReferrerOnboarding, type FieldErrors } from "./validation";

export type AcceptError =
  | "link_invalid"
  | "link_expired"
  | "link_used"
  | "link_cancelled"
  | "invalid_fields"
  | "email_has_account"
  | "server_error";

export type AcceptResult = { ok: true; email: string } | { ok: false; error: AcceptError; fieldErrors?: FieldErrors };

const LINK_ERROR = {
  invalid: "link_invalid",
  expired: "link_expired",
  claimed: "link_used",
  cancelled: "link_cancelled",
} as const;

const CLAIM_ERROR: Record<string, AcceptError> = {
  invalid: "link_invalid",
  expired: "link_expired",
  already_claimed: "link_used",
  cancelled: "link_cancelled",
  email_mismatch: "link_invalid",
};

/**
 * Finalisation de l'invitation par l'apporteur.
 * 1. lien valide (jeton haché, ouvert, non expiré) ; 2. saisies contrôlées ;
 * 3. compte Auth créé pour l'adresse de l'invitation — l'ouverture du lien reçu sur cette
 *    adresse en prouve la possession, d'où l'e-mail confirmé d'office ;
 * 4. invitation consommée + fiche apporteur créée en UNE transaction (RPC). Si cette étape
 *    échoue (lien utilisé entre-temps, contrainte), le compte Auth créé à l'étape 3 est supprimé.
 */
export async function acceptReferrerInvitation(
  db: SupabaseClient,
  input: { token: unknown; raw: Record<string, unknown>; termsVersion: string },
  now = new Date(),
): Promise<AcceptResult> {
  const link = await loadReferrerInvitation(db, input.token, now);
  if (!link.ok) return { ok: false, error: LINK_ERROR[link.reason] };
  const { invitation, tokenHash } = link;

  const parsed = parseReferrerOnboarding(input.raw, invitation.siren);
  if (!parsed.ok) return { ok: false, error: "invalid_fields", fieldErrors: parsed.errors };
  const v = parsed.value;

  const { data: created, error: createError } = await db.auth.admin.createUser({
    email: invitation.email,
    password: v.password,
    email_confirm: true,
    user_metadata: {
      account_type: "apporteur",
      first_name: v.first_name,
      last_name: v.last_name,
      terms_accepted_at: now.toISOString(),
      terms_version: input.termsVersion,
    },
  });
  if (createError || !created?.user) {
    const code = (createError as { code?: string } | null)?.code;
    if (code === "email_exists" || code === "user_already_exists" || createError?.status === 422) {
      return { ok: false, error: "email_has_account" };
    }
    console.error("[referrer accept] création du compte", code, createError?.message);
    return { ok: false, error: "server_error" };
  }
  const userId = created.user.id;

  const { data: claim, error: claimError } = await db.rpc("claim_business_referrer_invitation", {
    p_token_hash: tokenHash,
    p_user_id: userId,
    p_email: invitation.email,
    p_first_name: v.first_name,
    p_last_name: v.last_name,
    p_phone: v.phone,
    p_business_name: v.business_name,
    p_siret: v.siret ?? "",
    p_address_line1: v.address_line1,
    p_address_line2: v.address_line2 ?? "",
    p_postal_code: v.postal_code,
    p_city: v.city,
    p_vat_regime: v.vat_regime,
    p_vat_number: v.vat_number ?? "",
    p_terms_version: input.termsVersion,
  });
  const status = (claim as { status?: string } | null)?.status;
  if (claimError || status !== "claimed") {
    const { error: rollbackError } = await db.auth.admin.deleteUser(userId);
    if (rollbackError) console.error("[referrer accept] suppression du compte orphelin", userId, rollbackError.message);
    if (claimError) {
      console.error("[referrer accept] consommation", claimError.code, claimError.message);
      return { ok: false, error: "server_error" };
    }
    return { ok: false, error: CLAIM_ERROR[status ?? ""] ?? "server_error" };
  }
  return { ok: true, email: invitation.email };
}
