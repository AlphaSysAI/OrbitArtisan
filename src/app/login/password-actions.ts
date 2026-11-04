"use server";

import { redirect } from "next/navigation";

import {
  FORGOT_PASSWORD_PATH,
  NEW_PASSWORD_PATH,
  buildEmailConfirmationRedirect,
  sanitizeEmailParam,
} from "@/lib/auth/email-confirmation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getPublicSiteUrl } from "@/lib/site-url";

function isRateLimited(error: { status?: number; code?: string; message: string }) {
  return error.status === 429 || /rate.?limit|security purposes/i.test(`${error.code ?? ""} ${error.message}`);
}

/** Envoie le lien de réinitialisation. Réponse identique que le compte existe ou non. */
export async function requestPasswordReset(formData: FormData) {
  const email = sanitizeEmailParam(String(formData.get("email") ?? ""));
  if (!email) redirect(`${FORGOT_PASSWORD_PATH}?error=invalid_email`);

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    // Repli si le template Supabase par défaut ({{ .ConfirmationURL }}) est encore actif :
    // le flux PKCE passe par /auth/callback (même navigateur uniquement).
    redirectTo: buildEmailConfirmationRedirect(getPublicSiteUrl(), NEW_PASSWORD_PATH, email),
  });

  const qs = new URLSearchParams({ email });
  if (error && isRateLimited(error)) {
    qs.set("error", "rate_limited");
  } else {
    // Autres erreurs (adresse inconnue…) : on ne le dit pas, pour ne pas révéler les comptes existants.
    if (error) console.error("[password-reset] request", { code: error.code ?? null, status: error.status ?? null });
    qs.set("sent", "1");
  }
  redirect(`${FORGOT_PASSWORD_PATH}?${qs.toString()}`);
}

/** Enregistre le nouveau mot de passe (session ouverte par le lien de réinitialisation). */
export async function updatePassword(formData: FormData) {
  const password = String(formData.get("password") ?? "");
  const passwordConfirm = String(formData.get("password_confirm") ?? "");

  if (password.length < 8) redirect(`${NEW_PASSWORD_PATH}?error=password_too_short`);
  if (password !== passwordConfirm) redirect(`${NEW_PASSWORD_PATH}?error=password_mismatch`);

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`${FORGOT_PASSWORD_PATH}?error=link_expired`);

  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    console.error("[password-reset] update", { code: error.code ?? null, status: error.status ?? null });
    const code =
      error.code === "same_password" || /different from the old/i.test(error.message)
        ? "same_password"
        : error.code === "weak_password" || /weak|pwned/i.test(error.message)
          ? "weak_password"
          : "update_failed";
    redirect(`${NEW_PASSWORD_PATH}?error=${code}`);
  }

  redirect("/app?password=updated");
}
