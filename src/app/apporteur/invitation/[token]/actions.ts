"use server";

import { redirect } from "next/navigation";

import { LEGAL_LAST_UPDATED } from "@/lib/legal/site-legal-info";
import { acceptReferrerInvitation, type AcceptError } from "@/lib/referrers/accept-invitation";
import type { FieldErrors } from "@/lib/referrers/validation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role";

export type ReferrerOnboardingState = {
  error: AcceptError | null;
  fieldErrors: FieldErrors;
  /** Saisies renvoyées au formulaire après une erreur (jamais le mot de passe). */
  values: Record<string, string>;
};

const KEPT_FIELDS = [
  "first_name",
  "last_name",
  "phone",
  "business_name",
  "siret",
  "address_line1",
  "address_line2",
  "postal_code",
  "city",
  "vat_regime",
  "vat_number",
] as const;

export async function acceptReferrerInvitationAction(
  _prev: ReferrerOnboardingState,
  formData: FormData,
): Promise<ReferrerOnboardingState> {
  const raw = Object.fromEntries([...formData.entries()].filter(([, v]) => typeof v === "string")) as Record<string, string>;
  const values = Object.fromEntries(KEPT_FIELDS.map((k) => [k, raw[k] ?? ""]));

  const db = createSupabaseServiceRoleClient();
  if (!db) return { error: "server_error", fieldErrors: {}, values };

  const result = await acceptReferrerInvitation(db, { token: raw.token, raw, termsVersion: LEGAL_LAST_UPDATED });
  if (!result.ok) return { error: result.error, fieldErrors: result.fieldErrors ?? {}, values };

  // Compte créé : ouverture de session directe (remplace une éventuelle autre session).
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({ email: result.email, password: raw.password ?? "" });
  if (error) redirect(`/login?next=${encodeURIComponent("/apporteur")}&email=${encodeURIComponent(result.email)}`);
  redirect("/apporteur");
}
